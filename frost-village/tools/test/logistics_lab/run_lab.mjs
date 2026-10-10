// logistics_runtime lab runner (Playwright, one Chromium at a time, fixed-step clock). Run it in groups so that each
// run stays under 2 minutes; the numbers file merges the groups:
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers nice -n 15 node tools/test/logistics_lab/run_lab.mjs --only=smoke,wide
//   ... --only=closed,stock      ... --only=reveal          ... --only=forklift,docks
//   ... --only=settle            ... --only=producers,zoom  ... --only=desktop,english,night
//   [--no-gif] skips the GIFs
// Phone 390 x 844 at DPR 3 for the stills (GIF frames at DPR 1.5, then 360 px wide), desktop 1280 x 800.
// Captures: docs/previews/logistics_lab_*.png|gif and docs/previews/logistics_lab_numbers.json (logic ms per tick,
// draw calls, display objects, texture MiB, rigs, placeholders, console errors). Exit 1 on errors / placeholders.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from '../serve.mjs';
import { launch, openPage } from '../pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews');
const TMP = process.env.LAB_TMP || path.join(process.env.TMPDIR || '/tmp', 'logistics_lab_frames');
fs.mkdirSync(TMP, { recursive: true });
const args = process.argv.slice(2);
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const NOGIF = args.includes('--no-gif');
const want = (n) => !ONLY.length || ONLY.includes(n);
const T0 = Date.now();
const NUMS_FILE = path.join(OUT, 'logistics_lab_numbers.json');
const NUM = fs.existsSync(NUMS_FILE) ? JSON.parse(fs.readFileSync(NUMS_FILE, 'utf8')) : {};
const SHOTS = [];
const PROBLEMS = [];
let SRV = null;

// ---------------------------------------------------------------------------------------------------- page helpers
const GL_PROBE = () => {
  const C = window.__GLC = { draw: 0 };
  const patch = (proto) => { for (const m of ['drawElements', 'drawArrays']) { const o = proto[m]; proto[m] = function (...a) { C.draw++; return o.apply(this, a); }; } };
  if (window.WebGLRenderingContext) patch(WebGLRenderingContext.prototype);
  if (window.WebGL2RenderingContext) patch(WebGL2RenderingContext.prototype);
};

async function boot(browser, vp, dpr, lang = 'ko') {
  const { page, log } = await openPage(browser, SRV.url + 'tools/test/logistics_lab/lab.html', { viewport: vp, dpr, init: GL_PROBE, isMobile: vp.width < 600, hasTouch: vp.width < 600 });
  await page.waitForFunction(() => window.__LAB && (window.__LAB.ready || window.__LAB.errors.length > 3), null, { timeout: 90000 });
  await page.evaluate((lang) => {
    const L = window.__LAB, g = L.game;
    L.lang = lang;
    g.loop.sleep();
    const realNow = Date.now.bind(Date);
    let D = realNow(), T = g.loop.time || performance.now();
    Date.now = () => D;
    const DT = 1000 / 60;
    L.run = (sec) => { const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) { T += DT; D += DT; g.headlessStep(T, DT); } };
    L.frame = () => { T += DT; D += DT; g.step(T, DT); };
    const W = L.scene;
    L.setup = (o) => W.setup(o);
    L.look = (x, y, z) => { W.look(x, y, z); W.cameras.main.preRender(); W.ground.bakeAll(); };
    L.m = () => W.host.model;
    L.v = () => W.host.view;
    L.at = (i, j) => L.layout.L(i, j);
    L.rel = (dx, dy) => [L.layout.ANCHOR[0] + dx, L.layout.ANCHOR[1] + dy];
    L.stats = () => {
      const tex = g.textures.list;
      let all = 0, mod = 0;
      const per = {};
      for (const k in tex) {
        if (k.startsWith('__') || k.startsWith('lab_ground')) continue;
        const src = tex[k].source && tex[k].source[0];
        if (!src || !src.width) continue;
        const b = src.width * src.height * 4;
        all += b;
        if (L.MODULE_TEX.test(k)) { mod += b; per[k] = +(b / 1048576).toFixed(2); }
      }
      const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
      const ms = L.ms.slice().sort((a, b) => a - b), mm = L.msModel.slice().sort((a, b) => a - b);
      const objs = (sc) => { let n = 0; const walk = (l) => { for (const o of l) { n++; if (o.list) walk(o.list); } }; walk(sc.children.list); return n; };
      const vis = (sc) => sc.children.list.filter((o) => o.visible).length;
      const v = W.host.view;
      return {
        texMiB: +(all / 1048576).toFixed(1), moduleMiB: +(mod / 1048576).toFixed(1), moduleTex: per,
        msHost: +avg(ms).toFixed(4), p95Host: ms.length ? +ms[Math.floor(ms.length * 0.95)].toFixed(4) : 0,
        msModel: +avg(mm).toFixed(4), p95Model: mm.length ? +mm[Math.floor(mm.length * 0.95)].toFixed(4) : 0, maxModel: mm.length ? +mm[mm.length - 1].toFixed(3) : 0,
        msView: v ? +v.info().msView.toFixed(4) : 0, view: v ? v.info() : null,
        rigTex: (() => { const t = new Set(); for (const r of W.dolls.live) for (const im of r.spr.sprites) if (im.texture) t.add(im.texture.key); return Array.from(t).sort(); })(),
        worldObjects: objs(W), visibleObjects: vis(W), uiObjects: objs(L.ui), placeholders: Array.from(L.Assets.warned), errors: L.errors.slice(),
        state: (() => { const s = W.host.api.state(); return { stock: s.stock, today: s.today, orders: s.orders.length, vehicles: s.vehicles.length, owners: s.owners, cash: s.cash, laps: s.forklift.laps }; })(),
      };
    };
    /** world point -> page CSS px (for real taps / mouse moves) */
    L.toScreen = (wx, wy) => { const cam = W.cameras.main, r = g.canvas.getBoundingClientRect(), k = r.width / g.canvas.width; cam.preRender(); return [r.left + (wx - cam.worldView.x) * cam.zoom * k, r.top + (wy - cam.worldView.y) * cam.zoom * k]; };
    /** step until the view sees an event (t + op), max sec; returns the game time waited or -1 */
    L.until = (pred, max = 60, step = 0.1) => { let w = 0; while (w < max) { L.run(step); w += step; if (pred()) return +w.toFixed(2); } return -1; };
    L.watch = () => { const v = W.host.view; if (v.__w) return; v.__w = 1; L.seen = []; const on = v.onEvent.bind(v); v.onEvent = (e, i) => { L.seen.push(Object.assign({ T: window.__LAB.T }, e)); if (L.seen.length > 400) L.seen.shift(); return on(e, i); }; };
    L.drawCalls = (n = 20) => { const C = window.__GLC; const d0 = C.draw; for (let i = 0; i < n; i++) L.frame(); return +((C.draw - d0) / n).toFixed(1); };
  }, lang);
  return { page, log };
}

const ev = (page, fn, arg) => page.evaluate(fn, arg);
const run = (page, s) => ev(page, (s) => window.__LAB.run(s), s);
async function frames(page, n = 3) { await ev(page, (n) => { for (let i = 0; i < n; i++) window.__LAB.frame(); }, n); }
const quant = (file, maxW) => { try { execFileSync('python3', ['-I', '-c', 'import sys; from PIL import Image; im=Image.open(sys.argv[1]).convert("RGB"); w,h=im.size; f=min(1, int(sys.argv[2])/w); im=im.resize((int(w*f), int(h*f)), Image.LANCZOS) if f<1 else im; im=im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG); im.save(sys.argv[1], optimize=True)', file, String(maxW)]); } catch (e) { /* keep */ } };
async function shot(page, name, maxW = 780) {
  await ev(page, () => window.__LAB.scene.ground.bakeAll());
  await frames(page, 3);
  const file = path.join(OUT, 'logistics_lab_' + name + '.png');
  await page.screenshot({ path: file });
  quant(file, maxW);
  SHOTS.push(path.relative(ROOT, file));
  return file;
}
/** a GIF: `n` frames, `step` s of game time apart (ffmpeg palette), played at `fps` */
async function gif(page, name, n, step, hook, fps, width = 360) {
  if (NOGIF) return null;
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) {
    if (hook) await hook(i);
    await run(page, step);
    await ev(page, () => window.__LAB.scene.ground.update(2));
    await frames(page, 1);
    await page.screenshot({ path: path.join(dir, 'f' + String(i).padStart(3, '0') + '.png') });
  }
  const file = path.join(OUT, 'logistics_lab_' + name + '.gif');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps || Math.round(1 / step)), '-i', path.join(dir, 'f%03d.png'), '-vf', `scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, file]);
  SHOTS.push(path.relative(ROOT, file));
  return file;
}
async function numbers(page, key, extra = {}) {
  const st = await ev(page, () => window.__LAB.stats());
  st.drawCalls = await ev(page, () => window.__LAB.drawCalls());
  NUM[key] = Object.assign(st, extra);
  if (key !== 'smoke') delete NUM[key].moduleTex;
  if (st.placeholders.length) PROBLEMS.push(key + ' placeholders ' + st.placeholders.join(','));
  if (st.errors.length) PROBLEMS.push(key + ' errors ' + st.errors.slice(0, 3).join(' | '));
  return st;
}
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 800 };
const DAY3 = 1800, H = (h) => DAY3 + 25 * h;

// ---------------------------------------------------------------------------------------------------- scenarios
const S = {};

/** everything going on at once, roof off: the first look */
S.smoke = async (B) => {
  const { page, log } = await boot(B, PHONE, 2);
  await ev(page, (T) => { const L = window.__LAB; L.setup({ T, fill: 0.6, reveal: true, warm: 70 }); const [x, y] = L.rel(80, -60); L.look(x, y, 0.7); }, H(9));
  await run(page, 3);
  await shot(page, 'smoke');
  const st = await numbers(page, 'smoke', { what: 'roof off, 09:00, warm 70 s, zoom 0.7, phone DPR 2' });
  console.log(JSON.stringify(st, null, 1).slice(0, 2400));
  console.log('log errors', log.errors.slice(0, 10), log.missing404.slice(0, 10));
  await page.context().close();
};

/** debug: a wide look at the whole stage */
S.wide = async (B) => {
  const { page } = await boot(B, PHONE, 1.5);
  await ev(page, (T) => { const L = window.__LAB; L.setup({ T, fill: 0.8, reveal: true, warm: 40 }); const [x, y] = L.rel(-50, 120); L.look(x, y, 0.42); }, H(9));
  await run(page, 2);
  await shot(page, 'wide');
  await page.context().close();
};

/** a real touch tap at a world point (phone pages have touch) */
async function tapWorld(page, wx, wy) {
  const [x, y] = await ev(page, ([a, b]) => window.__LAB.toScreen(a, b), [wx, wy]);
  await page.touchscreen.tap(x, y);
  await frames(page, 1);
}
const relW = (page, dx, dy) => ev(page, ([a, b]) => window.__LAB.rel(a, b), [dx, dy]);

/** the roof on, first time: the arrow over the roof says "tap me" */
S.closed = async (B) => {
  const { page } = await boot(B, PHONE, 3);
  await ev(page, (T) => { const L = window.__LAB; L.setup({ T, fill: 0.6, warm: 50 }); const [x, y] = L.rel(40, -40); L.look(x, y, 0.8); }, H(10));
  await run(page, 1.2);
  await shot(page, 'closed');
  await numbers(page, 'closed', { what: 'roof on, first visit (tap arrow), 10:00, zoom 0.8, phone DPR 3' });
  await page.context().close();
};

/** a real tap opens the roof (350 ms fade), a second tap closes it */
S.reveal = async (B) => {
  const { page } = await boot(B, PHONE, 3);
  await ev(page, (T) => { const L = window.__LAB; L.setup({ T, fill: 0.6, warm: 50 }); const [x, y] = L.rel(30, -110); L.look(x, y, 0.9); L.watch(); }, H(10));
  await run(page, 1);
  const [wx, wy] = await relW(page, -40, -220);
  const tap = async () => { await tapWorld(page, wx, wy); };
  await tap();
  let st = await ev(page, () => ({ rev: window.__LAB.v().revealed, toasts: window.__LAB.toasts.slice(), ev: window.__LAB.events.filter((e) => e.t === 'lgx:reveal') }));
  if (!st.rev) PROBLEMS.push('reveal: a real tap did not open the roof ' + JSON.stringify(st));
  await run(page, 0.17);
  await shot(page, 'reveal_half');
  await run(page, 1.0);
  await shot(page, 'reveal_open');
  await tap();
  st = await ev(page, () => window.__LAB.v().revealed);
  if (st) PROBLEMS.push('reveal: a second tap did not close the roof');
  await page.context().close();
  // the GIF (DPR 1.5): closed -> tap -> fade in -> look -> tap -> fade out
  if (NOGIF) return;
  const { page: p2 } = await boot(B, PHONE, 1.5);
  await ev(p2, (T) => { const L = window.__LAB; L.setup({ T, fill: 0.6, warm: 50 }); const [x, y] = L.rel(30, -150); L.look(x, y, 0.9); }, H(10));
  await run(p2, 1);
  await gif(p2, 'reveal', 46, 0.07, async (i) => { if (i === 6 || i === 32) await tapWorld(p2, wx, wy); }, 14);
  await p2.context().close();
};

/** the racks at 10 / 50 / 100 % (largest-remainder shares, front cells first) */
S.stock = async (B) => {
  const { page } = await boot(B, PHONE, 3);
  for (const f of [0.1, 0.5, 1]) {
    await ev(page, ([T, f]) => { const L = window.__LAB; L.setup({ T, fill: f, reveal: true, warm: 0, yardEvery: 9999, yardFirst: 9999, producers: false }); const [x, y] = L.rel(70, -235); L.look(x, y, 1.2); }, [H(9), f]);
    await run(page, 1.5);
    await shot(page, 'stock_' + Math.round(f * 100));
    if (f === 1) await numbers(page, 'stock_100', { what: 'racks full, zoom 1.2, phone DPR 3' });
  }
  await page.context().close();
  const files = [10, 50, 100].map((n) => path.join(OUT, 'logistics_lab_stock_' + n + '.png'));
  const out = path.join(OUT, 'logistics_lab_stock_levels.png');
  try {
    execFileSync('python3', ['-I', '-c', `
import sys
from PIL import Image, ImageDraw
ims=[Image.open(f).convert('RGB') for f in sys.argv[2:5]]
cw=380; ch=520
crops=[]
for im in ims:
    w,h=im.size; f=cw/w*1.6
    im=im.resize((int(w*f),int(h*f)), Image.LANCZOS); w,h=im.size
    x0=(w-cw)//2+40; y0=int(h*0.36)
    crops.append(im.crop((x0,y0,x0+cw,y0+ch)))
out=Image.new('RGB',(cw*3+40, ch+20),(223,232,242))
for k,c in enumerate(crops): out.paste(c,(10+k*(cw+10),10))
out=out.quantize(colors=256, method=Image.Quantize.MEDIANCUT)
out.save(sys.argv[1], optimize=True)
`, out, ...files]);
    SHOTS.push(path.relative(ROOT, out));
  } catch (e) { PROBLEMS.push('stock strip: ' + e.message); }
};

/** the forklift lap: food rack pick -> outbound pallet on the dock -> inbound pallet -> tools rack (beeps reversing) */
S.forklift = async (B) => {
  const { page } = await boot(B, PHONE, 1.5);
  await ev(page, (T) => { const L = window.__LAB; L.setup({ T, fill: 0.55, reveal: true, warm: 60 }); const [x, y] = L.rel(110, -200); L.look(x, y, 1.15); L.watch(); }, H(10));
  // start on a real job: an outbound pallet coming off the food rack
  const w = await ev(page, () => { const L = window.__LAB; const n0 = L.seen.length; return L.until(() => L.seen.slice(n0).some((e) => e.t === 'fork' && e.op === 'pick' && e.at === 'rack' && !e.tidy), 60, 0.1); });
  if (w < 0) PROBLEMS.push('forklift: no outbound pick in 60 s');
  await run(page, 0.2);
  const s0 = await ev(page, () => window.__LAB.sounds.length);
  await gif(page, 'forklift', 56, 0.25, null, 8);
  const st = await ev(page, ([s0]) => ({ beeps: window.__LAB.sounds.slice(s0).filter((k) => k === 'sfx_forklift_beep').length, fork: window.__LAB.m().state().forklift }), [s0]);
  NUM.forklift = Object.assign({}, st, { what: 'forklift GIF, 14 s game time' });
  await shot(page, 'forklift');
  await page.context().close();
};

/** a van backs into a bay, the leaf doors open, the forklift loads it, it pulls out; the owner rides along */
S.docks = async (B) => {
  const { page } = await boot(B, PHONE, 1.5);
  await ev(page, (T) => { const L = window.__LAB; L.setup({ T, fill: 0.6, reveal: true, warm: 30 }); const [x, y] = L.rel(300, 40); L.look(x, y, 0.9); L.watch(); }, H(10));
  // start when a vehicle turns into the dock lane (it backs into its bay next)
  const w = await ev(page, () => window.__LAB.until(() => window.__LAB.m().docks.list.some((v) => v.st === 'in' && !v.onStreet), 60));
  if (w < 0) PROBLEMS.push('docks: nothing came into the dock lane in 60 s');
  await gif(page, 'docks', 64, 0.3, null, 10);
  await shot(page, 'docks');
  await page.context().close();
};

/** the queue at the counter: the owner steps up, the clerk stamps ("쾅!"), coins hop to the till */
S.settle = async (B) => {
  const { page } = await boot(B, PHONE, 3);
  await ev(page, (T) => { const L = window.__LAB; L.setup({ T, fill: 0.6, reveal: true, warm: 80, tut: true }); const [x, y] = L.rel(-150, -120); L.look(x, y, 1.2); L.watch(); }, H(10));
  const w = await ev(page, () => { const L = window.__LAB; const n0 = L.seen.length; return L.until(() => L.seen.slice(n0).some((e) => e.t === 'stamp'), 90, 1 / 30); });
  if (w < 0) PROBLEMS.push('settle: no stamp in 90 s');
  await run(page, 0.12);
  await shot(page, 'settle_stamp');
  await numbers(page, 'settle', { what: 'stamp moment, zoom 1.2, phone DPR 3' });
  await page.context().close();
  const { page: p2 } = await boot(B, PHONE, 1.5);
  await ev(p2, (T) => { const L = window.__LAB; L.setup({ T, fill: 0.6, reveal: true, warm: 80, tut: true }); const [x, y] = L.rel(-150, -120); L.look(x, y, 1.1); L.watch(); }, H(10));
  await ev(p2, () => { const L = window.__LAB; const n0 = L.seen.length; return L.until(() => L.seen.slice(n0).some((e) => e.t === 'settle' && e.op === 'start'), 90, 1 / 30); });
  await run(p2, 0.3);
  await gif(p2, 'settle', 44, 0.12, null, 10);
  await p2.context().close();
};

/** 가구 공방 + 가전 공장 on their M plots (village work buildings): planks / ingots in, a sofa / a fridge out; the
 *  centre's van fetches the pile (off the stage) and backs into a bay with it */
S.producers = async (B) => {
  const { page } = await boot(B, PHONE, 1.5);
  await ev(page, (T) => { const L = window.__LAB; L.setup({ T, fill: 0.4, reveal: false, warm: 40, tut: true, feed: 30 }); const P = L.layout.PRODUCER_SPOTS; L.look((P.furniture.x + P.appliance.x) / 2 + 10, (P.furniture.y + P.appliance.y) / 2 - 170, 1.15); L.watch(); }, H(10));
  await run(page, 1);
  await shot(page, 'producers');
  await numbers(page, 'producers', { what: 'furniture workshop + appliance factory on M plots, zoom 1.0' });
  await gif(page, 'producers', 48, 0.3, null, 10);
  // the pickup van (role pickup) docks at the centre with the pile
  const w = await ev(page, () => { const L = window.__LAB; return L.until(() => L.m().docks.list.some((v) => v.role === 'pickup' && v.st === 'docked'), 150, 0.2); });
  if (w >= 0) {
    await ev(page, () => { const L = window.__LAB; L.v().reveal(true, 'api'); const [x, y] = L.rel(230, -60); L.look(x, y, 1.0); });
    await run(page, 1.2);
    await shot(page, 'producers_van');
  } else PROBLEMS.push('producers: no pickup van docked in 150 s');
  await page.context().close();
};

/** the same moment at zoom 0.6 / 1.0 / 1.2 */
S.zoom = async (B) => {
  const { page } = await boot(B, PHONE, 3);
  await ev(page, (T) => { const L = window.__LAB; L.setup({ T, fill: 0.7, reveal: true, warm: 75, tut: true }); }, H(9));
  for (const z of [0.6, 1.0, 1.2]) {
    await ev(page, (z) => { const L = window.__LAB; const [x, y] = L.rel(z < 1 ? 60 : 20, z < 1 ? 20 : -150); L.look(x, y, z); }, z);
    await run(page, 0.5);
    await shot(page, 'zoom_' + String(z.toFixed(1)).replace('.', ''));
  }
  await numbers(page, 'zoom', { what: 'zoom 1.2 view, phone DPR 3' });
  await page.context().close();
};

/** desktop 1280 x 800: the mouse hovers over the roof (open), then leaves (closed after the grace) */
S.desktop = async (B) => {
  const { page } = await boot(B, DESK, 1);
  await ev(page, (T) => { const L = window.__LAB; L.setup({ T, fill: 0.7, warm: 75, tut: true }); const [x, y] = L.rel(60, -120); L.look(x, y, 0.75); }, H(14));
  await run(page, 1);
  const [wx, wy] = await relW(page, -40, -220);
  const [sx, sy] = await ev(page, ([a, b]) => window.__LAB.toScreen(a, b), [wx, wy]);
  await page.mouse.move(sx, sy, { steps: 3 });
  await run(page, 0.8);
  const rev = await ev(page, () => window.__LAB.v().revealed);
  if (!rev) PROBLEMS.push('desktop: hover did not open the roof');
  await shot(page, 'desktop', 1280);
  await numbers(page, 'desktop', { what: 'desktop 1280x800 DPR 1, hover open, 14:00, zoom 0.75' });
  // off the roof but still on the canvas, then off the canvas (gameout)
  const [ox, oy] = await ev(page, ([a, b]) => window.__LAB.toScreen(a, b), await relW(page, 60, 260));
  await page.mouse.move(ox, oy, { steps: 3 });
  await run(page, 1);
  const rev1 = await ev(page, () => window.__LAB.v().revealed);
  if (rev1) PROBLEMS.push('desktop: moving off the roof did not close it');
  await page.mouse.move(sx, sy, { steps: 2 });
  await run(page, 0.3);
  await page.mouse.move(20, 20, { steps: 2 });
  await run(page, 1);
  const rev2 = await ev(page, () => window.__LAB.v().revealed);
  if (rev2) PROBLEMS.push('desktop: leaving did not close the roof');
  await shot(page, 'desktop_closed', 1280);
  await page.context().close();
};

/** English strings (nameplate, chip, toasts) */
S.english = async (B) => {
  const { page } = await boot(B, PHONE, 3, 'en');
  await ev(page, (T) => { const L = window.__LAB; L.setup({ T, lang: 'en', fill: 0.6, reveal: false, warm: 80 }); const [x, y] = L.rel(40, -60); L.look(x, y, 0.85); L.watch(); }, H(11));
  await ev(page, () => { const L = window.__LAB; L.v().reveal(true, 'tap'); });
  await run(page, 1.0);
  await shot(page, 'english');
  await page.context().close();
};

/** night: lamps, headlamps, the inside lit */
S.night = async (B) => {
  const { page } = await boot(B, PHONE, 3);
  await ev(page, (T) => { const L = window.__LAB; L.setup({ T, fill: 0.6, reveal: true, warm: 40, tut: true }); const [x, y] = L.rel(60, -60); L.look(x, y, 0.85); }, H(19.2));
  await run(page, 1.5);
  await shot(page, 'night');
  await numbers(page, 'night', { what: '20:48, still open, zoom 0.85' });
  await page.context().close();
};

// ---------------------------------------------------------------------------------------------------- main
const order = Object.keys(S).filter(want);
SRV = await start(0, { prefix: '/fv/' });
const browser = await launch();
try {
  for (const k of order) {
    const t = Date.now();
    try { await S[k](browser); } catch (e) { PROBLEMS.push(k + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' ') : e)); console.log('FAIL', k, e); }
    console.log('scenario', k, ((Date.now() - t) / 1000).toFixed(1) + ' s');
  }
} finally {
  await browser.close();
  await SRV.close();
}
NUM.updated = new Date().toISOString();
fs.writeFileSync(NUMS_FILE, JSON.stringify(NUM, null, 1));
console.log('shots', SHOTS.join('\n'));
console.log('total', ((Date.now() - T0) / 1000).toFixed(1) + ' s', PROBLEMS.length ? 'PROBLEMS:\n' + PROBLEMS.join('\n') : 'no problems');
process.exit(PROBLEMS.length ? 1 : 0);
