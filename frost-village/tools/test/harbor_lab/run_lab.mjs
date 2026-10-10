// harbor_runtime lab runner (Playwright, one Chromium at a time, fixed-step clock). Run it in groups so that each run
// stays under 2 minutes; the numbers file merges the groups:
//   nice -n 15 node tools/test/harbor_lab/run_lab.mjs --only=smoke
//   nice -n 15 node tools/test/harbor_lab/run_lab.mjs --only=sleepy,reveal
//   nice -n 15 node tools/test/harbor_lab/run_lab.mjs --only=ferry
//   nice -n 15 node tools/test/harbor_lab/run_lab.mjs --only=crane,export
//   nice -n 15 node tools/test/harbor_lab/run_lab.mjs --only=trawler,launch
//   nice -n 15 node tools/test/harbor_lab/run_lab.mjs --only=night,auction
//   nice -n 15 node tools/test/harbor_lab/run_lab.mjs --only=zoom,desktop,english
//   [--no-gif] skips the GIFs
// Phone 390 × 844 at DPR 3 for the stills (GIF frames at DPR 1.5, then 360 px wide), desktop 1280 × 800.
// Captures: docs/previews/harbor_lab_*.png|gif and docs/previews/harbor_lab_numbers.json (logic ms per tick, draw
// calls, display objects, texture MiB, rigs, placeholders, console errors). Exit 1 on errors / placeholders.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from '../serve.mjs';
import { launch, openPage } from '../pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews');
const TMP = process.env.LAB_TMP || path.join(process.env.TMPDIR || '/tmp', 'harbor_lab_frames');
fs.mkdirSync(TMP, { recursive: true });
const args = process.argv.slice(2);
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const NOGIF = args.includes('--no-gif');
const want = (n) => !ONLY.length || ONLY.includes(n);
const T0 = Date.now();
const NUMS_FILE = path.join(OUT, 'harbor_lab_numbers.json');
const NUM = fs.existsSync(NUMS_FILE) ? JSON.parse(fs.readFileSync(NUMS_FILE, 'utf8')) : {};
const SHOTS = [];
let SRV = null;

// ---------------------------------------------------------------------------------------------------- page helpers
const GL_PROBE = () => {
  const C = window.__GLC = { draw: 0 };
  const patch = (proto) => { for (const m of ['drawElements', 'drawArrays']) { const o = proto[m]; proto[m] = function (...a) { C.draw++; return o.apply(this, a); }; } };
  if (window.WebGLRenderingContext) patch(WebGLRenderingContext.prototype);
  if (window.WebGL2RenderingContext) patch(WebGL2RenderingContext.prototype);
};

async function boot(browser, vp, dpr, lang = 'ko') {
  const { page, log } = await openPage(browser, SRV.url + 'tools/test/harbor_lab/lab.html', { viewport: vp, dpr, init: GL_PROBE, isMobile: vp.width < 600, hasTouch: vp.width < 600 });
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
    L.at = (i, j) => L.layout.LR(i, j);
    L.W = (i, j) => L.layout.W(i, j);
    /** the next event op of kind after T -> { t, id } */
    L.next = (kind, op, after) => { const n = W.host.model.sched.next(kind, op, after === undefined ? L.T : after); return n ? { t: n.t, id: n.m.id } : null; };
    /** jump the clock (model replans its day when needed; the night tint snaps) */
    L.jump = (T) => { L.T = T; W.snapNight(); };
    L.stats = () => {
      const tex = g.textures.list;
      let all = 0, mod = 0;
      const per = {};
      for (const k in tex) {
        if (k.startsWith('__')) continue;
        const src = tex[k].source && tex[k].source[0];
        if (!src || !src.width) continue;
        const b = src.width * src.height * 4;
        all += b;
        if (L.MODULE_TEX.test(k)) { mod += b; per[k] = +(b / 1048576).toFixed(2); }
      }
      const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
      const ms = L.ms.slice().sort((a, b) => a - b), mm = L.msModel.slice().sort((a, b) => a - b);
      const objs = (sc) => { let n = 0; const walk = (l) => { for (const o of l) { n++; if (o.list) walk(o.list); } }; walk(sc.children.list); return n; };
      const v = W.host.view;
      return {
        texMiB: +(all / 1048576).toFixed(1), moduleMiB: +(mod / 1048576).toFixed(1), moduleTex: per,
        msHost: +avg(ms).toFixed(4), p95Host: ms.length ? +ms[Math.floor(ms.length * 0.95)].toFixed(4) : 0,
        msModel: +avg(mm).toFixed(4), p95Model: mm.length ? +mm[Math.floor(mm.length * 0.95)].toFixed(4) : 0, maxModel: mm.length ? +mm[mm.length - 1].toFixed(3) : 0,
        msView: v ? +v.info().msView.toFixed(4) : 0, view: v ? v.info() : null,
        worldObjects: objs(W), uiObjects: objs(L.ui), placeholders: Array.from(L.Assets.warned), errors: L.errors.slice(),
      };
    };
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
  const file = path.join(OUT, 'harbor_lab_' + name + '.png');
  await page.screenshot({ path: file });
  quant(file, maxW);
  SHOTS.push(path.relative(ROOT, file));
  return file;
}
/** a GIF: `n` frames, `step` s of game time apart (ffmpeg palette), played at `fps` */
async function gif(page, name, n, step, hook, fps, width = 360, clip = null) {
  if (NOGIF) return null;
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) {
    if (hook) await hook(i);
    await run(page, step);
    await ev(page, () => window.__LAB.scene.ground.update(2));
    await frames(page, 1);
    await page.screenshot({ path: path.join(dir, 'f' + String(i).padStart(3, '0') + '.png'), clip: clip || undefined });
  }
  const file = path.join(OUT, 'harbor_lab_' + name + '.gif');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps || Math.round(1 / step)), '-i', path.join(dir, 'f%03d.png'), '-vf', `scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, file]);
  SHOTS.push(path.relative(ROOT, file));
  return file;
}
async function numbers(page, key, extra = {}) {
  const st = await ev(page, () => window.__LAB.stats());
  st.drawCalls = await ev(page, () => window.__LAB.drawCalls());
  NUM[key] = Object.assign(st, extra);
  delete NUM[key].moduleTex;
  return st;
}
const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 800 };

// ---------------------------------------------------------------------------------------------------- scenarios
const S = {};

S.smoke = async (B) => {
  const { page, log } = await boot(B, PHONE, 2);
  await ev(page, () => { const L = window.__LAB; L.setup({ steps: 7, T: 600 * 3 + 25 * 10.2 }); const [x, y] = L.at(68, -13); L.look(x, y, 0.6); });
  await run(page, 3);
  // the happenings (P8 needs a crane lift, P7 a tourist on the quay): no errors, toasts out
  await ev(page, () => { const L = window.__LAB; L.setup({ steps: 7, T: 2050 }); L.run(46); for (let k = 0; k < 40 && !L.m().crane.cur; k++) L.run(0.25); L.P8 = L.scene.host.happening('P8'); L.run(3); L.P7 = L.scene.host.happening('P7'); L.run(8); });
  NUM.happenings = { toasts: await ev(page, () => window.__LAB.toasts.slice(-4)), P7: await ev(page, () => window.__LAB.P7), P8: await ev(page, () => window.__LAB.P8) };
  await shot(page, 'smoke');
  const st = await numbers(page, 'smoke');
  console.log(JSON.stringify(st, null, 1).slice(0, 1500));
  console.log('log errors', log.errors.slice(0, 10), log.missing404.slice(0, 10));
  await page.context().close();
};

// day 3 of the lab (T 1800 = 00:00): ferry 10:30 (T 2062.5), cargo 11:24 (2085), trawler haul 14:30 (2137.5-2162.5),
// home 15:50 (2196), small bell 14:00 (2150), night ferry 22:30 (2362.5)
const DAY3 = 1800, H = (h) => DAY3 + 25 * h;

/** the sleepy harbour just found (rail extended, nothing revived) + the reveal ride along the new rails */
S.sleepy = async (B) => {
  const { page } = await boot(B, PHONE, 3);
  await ev(page, (T) => { const L = window.__LAB; L.setup({ steps: 1, T }); const [x, y] = L.at(68.5, -13.5); L.look(x, y, 0.72); }, H(10));
  await run(page, 2);
  await shot(page, 'sleepy');
  await numbers(page, 'sleepy', { what: 'sleepy harbour, zoom 0.72, phone DPR 3' });
  await page.context().close();
};
S.reveal = async (B) => {
  const { page } = await boot(B, PHONE, 1.5);
  // 도시 + the call: nothing open yet, the camera at the rail end; the rail is extended -> the reveal
  await ev(page, (T) => { const L = window.__LAB; L.setup({ steps: 0, T }); const [x, y] = L.at(46.6, -1.2); L.look(x, y - 40, 0.62); }, H(9.5));
  await run(page, 62);
  await gif(page, 'reveal', 64, 0.1, async (i) => { if (i === 4) await ev(page, () => window.__LAB.scene.host.built('h_step_railExt')); }, 12);
  NUM.reveal = { banners: await ev(page, () => window.__LAB.banners.slice()), toasts: await ev(page, () => window.__LAB.toasts.slice()), sites: await ev(page, () => window.__LAB.sites.map((s) => s.id)) };
  await page.context().close();
};

/** the ferry comes in, berths at the terminal, passengers wave and come down the gangway; gulls circle */
S.ferry = async (B) => {
  let { page } = await boot(B, PHONE, 1.5);
  await ev(page, (T) => { const L = window.__LAB; L.setup({ steps: 7, T }); const [x, y] = L.W(64.5, -15.2); L.look(x, y - 60, 0.8); }, 2062.5 - 36);
  await run(page, 1);
  await gif(page, 'ferry', 60, 0.75, null, 10);
  await page.context().close();
  ({ page } = await boot(B, PHONE, 3));
  await ev(page, (T) => { const L = window.__LAB; L.setup({ steps: 7, T }); const [x, y] = L.W(63.5, -14.6); L.look(x, y - 70, 0.9); }, 2062.5 - 20);
  await run(page, 29);
  await shot(page, 'ferry');
  await numbers(page, 'ferry', { what: 'ferry berthed + passengers, zoom 0.9, phone DPR 3' });
  await page.context().close();
};

/** the cargo ship at the crane quay: the crane lifts the import crates ashore, a dock worker carries them */
S.crane = async (B) => {
  let { page } = await boot(B, PHONE, 1.5);
  await ev(page, (T) => { const L = window.__LAB; L.setup({ steps: 7, T }); const [x, y] = L.at(77.6, -12.6); L.look(x, y - 40, 0.95); }, 2083);
  await run(page, 2.6);
  await gif(page, 'crane', 48, 0.2, null, 8);
  await page.context().close();
  ({ page } = await boot(B, PHONE, 3));
  await ev(page, (T) => { const L = window.__LAB; L.setup({ steps: 7, T }); const [x, y] = L.at(77.6, -12.6); L.look(x, y - 40, 1.0); }, 2083);
  await run(page, 16.6);
  await shot(page, 'crane');
  await numbers(page, 'crane', { what: 'cargo ship + crane cycle, zoom 1.0, phone DPR 3' });
  await page.context().close();
};

/** the chief at the export pad with the goods the contract wants */
S.export = async (B) => {
  const { page } = await boot(B, PHONE, 3);
  await ev(page, (T) => {
    const L = window.__LAB; L.setup({ steps: 7, T });
    const [x, y] = L.at(81.5, -10.4); L.look(x, y - 40, 1.0);
  }, 2083);
  await run(page, 3);
  await ev(page, () => {
    const L = window.__LAB, m = L.m(), c = m.trade.current(m.T), W = L.scene;
    for (const k in (c ? c.items : {})) L.bag[k === 'tools' ? 'item_axe' : k] = Math.round(c.items[k] * 0.4);
    const [px, py] = L.at(L.layout.PADS.export.i, L.layout.PADS.export.j); const [sx, sy] = L.at(82.2, -8.3); W.chief.set(sx, sy); W.chief.walk([[px, py]]);
  });
  await run(page, 3.4);
  await shot(page, 'export');
  NUM.export = { contract: await ev(page, () => { const m = window.__LAB.m(); return m.trade.current(m.T); }), coins: await ev(page, () => window.__LAB.events.filter((e) => e.t === 'lab:coins').reduce((s, e) => s + e.n, 0)) };
  await page.context().close();
};

/** a deep-sea trawler hauls its net in sight of the harbour, then lands the catch at the west wall */
S.trawler = async (B) => {
  let { page } = await boot(B, PHONE, 1.5);
  await ev(page, (T) => { const L = window.__LAB; L.setup({ steps: 7, T }); const [x, y] = L.W(70.5, -28.5); L.look(x, y - 80, 0.8); }, 2137.5 + 2);
  await run(page, 0.5);
  await gif(page, 'trawler_haul', 36, 0.5, null, 8);
  await page.context().close();
  ({ page } = await boot(B, PHONE, 3));
  await ev(page, (T) => { const L = window.__LAB; L.setup({ steps: 7, T }); const [x, y] = L.at(58.5, -13.5); L.look(x, y - 30, 0.9); }, 2196.2 + 2);
  await run(page, 7);
  await shot(page, 'trawler_home');
  await page.context().close();
};

/** a new trawler slides down the shipyard's slipway and sails out */
S.launch = async (B) => {
  const { page } = await boot(B, PHONE, 1.5);
  await ev(page, (T) => { const L = window.__LAB; L.setup({ steps: 7, T, trawlers: 1 }); const [x, y] = L.W(57.5, -16); L.look(x, y - 90, 0.75); L.m().fleet.ready = 1; }, H(12.2));
  await run(page, 0.3);
  await gif(page, 'launch', 44, 0.4, null, 9);
  await page.context().close();
};

/** night: the lighthouse beams sweep the sea, the night ferry comes in with its lamps; the coast train's lamp */
S.night = async (B) => {
  let { page } = await boot(B, PHONE, 1.5);
  await ev(page, (T) => { const L = window.__LAB; L.setup({ steps: 7, T }); const [x, y] = L.at(84.5, -13.5); L.look(x, y, 0.6); }, 2362.5 - 44);
  await run(page, 2);
  await gif(page, 'night', 48, 0.125, null, 12, 390, { x: 0, y: 330, width: 390, height: 514 });
  await page.context().close();
  ({ page } = await boot(B, PHONE, 3));
  await ev(page, (T) => { const L = window.__LAB; L.setup({ steps: 7, T }); const [x, y] = L.at(84.5, -13.5); L.look(x, y, 0.62); }, 2362.5 - 26);
  await run(page, 2);
  await shot(page, 'night');
  await numbers(page, 'night', { what: 'night, lighthouse beams + the night ferry coming in, zoom 0.62, phone DPR 3' });
  // the coast train with its lamp on the way into the harbour (west of the second row)
  await ev(page, () => { const L = window.__LAB, c = L.m().coast; for (let k = 0; k < 600; k++) { const i = c.iAt(c.m); if (c.moving && c.heading() === 'harbor' && i > 50 && i < 53) break; L.run(0.1); } const [x, y] = L.at(53.5, -4.5); L.look(x, y, 0.8); });
  await run(page, 0.4);
  await shot(page, 'night_train');
  await page.context().close();
};

/** the 14:00 small auction: the chief's fish on the pad, the bell, the auctioneer's call, buyers wave */
S.auction = async (B) => {
  const { page } = await boot(B, PHONE, 3);
  await ev(page, (T) => {
    const L = window.__LAB; L.setup({ steps: 7, T });
    const [x, y] = L.at(67.4, -10.2); L.look(x, y - 60, 1.05);
    L.bag.item_fish_raw = 9; L.bag.item_fish_big = 2;
    const [px, py] = L.at(L.layout.PADS.auction.i, L.layout.PADS.auction.j); L.scene.chief.set(px + 90, py - 30); L.scene.chief.walk([[px, py]]);
  }, H(14) - 4.5);
  await run(page, 5.3);
  await shot(page, 'auction');
  NUM.auction = { sold: await ev(page, () => window.__LAB.events.filter((e) => e.t === 'harbor:auction')), sounds: await ev(page, () => window.__LAB.sounds.slice(-6)) };
  await page.context().close();
};

/** zoom 0.6 / 1.0 / 1.2 at 11:30 (ferry and cargo ship berthed, the crane working) */
S.zoom = async (B) => {
  const { page } = await boot(B, PHONE, 3);
  await ev(page, (T) => { window.__LAB.setup({ steps: 7, T }); }, H(11.5));
  await run(page, 1);
  for (const [z, name, i, j] of [[0.6, 'zoom06', 70, -15], [1.0, 'zoom10', 66, -13], [1.2, 'zoom12', 64.2, -12.6]]) {
    await ev(page, (a) => { const L = window.__LAB; const [x, y] = L.at(a[1], a[2]); L.look(x, y, a[0]); }, [z, i, j]);
    await run(page, 1.5);
    await shot(page, name);
    if (name === 'zoom06') await numbers(page, 'phone06', { what: 'busy harbour 11:30, zoom 0.6, phone DPR 3' });
  }
  await page.context().close();
};

S.desktop = async (B) => {
  const { page } = await boot(B, DESK, 1);
  await ev(page, (T) => { const L = window.__LAB; L.setup({ steps: 7, T }); const [x, y] = L.at(71, -14); L.look(x, y, 0.6); }, H(11.5));
  await run(page, 2);
  await shot(page, 'desktop', 1280);
  await numbers(page, 'desktop', { what: 'desktop 1280 × 800, zoom 0.6' });
  await ev(page, () => { const L = window.__LAB; const [x, y] = L.at(66, -12); L.look(x, y, 1.0); });
  await run(page, 1);
  await shot(page, 'desktop_10', 1280);
  await page.context().close();
};

S.english = async (B) => {
  const { page } = await boot(B, PHONE, 3, 'en');
  await ev(page, (T) => { const L = window.__LAB; L.setup({ steps: 7, T, lang: 'en' }); const [x, y] = L.at(75, -11); L.look(x, y - 40, 0.8); }, H(11.6));
  await run(page, 2);
  await ev(page, () => window.__LAB.ui.banner('Gull Harbour ★2!', 'Harbour festival · the tugboat helps out'));
  await run(page, 0.6);
  await shot(page, 'english');
  await page.context().close();
};

// ---------------------------------------------------------------------------------------------------- main
(async () => {
  SRV = await start(0);
  const B = await launch();
  let bad = 0;
  try {
    for (const k of Object.keys(S)) {
      if (!want(k)) continue;
      const t = Date.now();
      await S[k](B);
      console.log('[' + k + '] ' + ((Date.now() - t) / 1000).toFixed(1) + ' s');
    }
  } catch (e) { console.error(e); bad = 1; }
  await B.close();
  await SRV.close();
  for (const k in NUM) if (NUM[k] && ((NUM[k].errors && NUM[k].errors.length) || (NUM[k].placeholders && NUM[k].placeholders.length))) { console.log('problems in', k, NUM[k].errors, NUM[k].placeholders); bad = 1; }
  fs.writeFileSync(NUMS_FILE, JSON.stringify(NUM, null, 1));
  console.log('shots:', SHOTS.join(', '));
  console.log('total', ((Date.now() - T0) / 1000).toFixed(1), 's');
  process.exit(bad);
})();
