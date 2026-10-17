// geumbang lab runner (Playwright, one Chromium, fixed-step clock). Run it in groups so each run stays short (the
// numbers file merges the groups):
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers nice -n 15 node tools/test/geumbang_lab/run_lab.mjs --only=smoke
//   … --only=first        (the opening ceremony + 첫 주문 따라가기: stills at each step + the GIF)
//   … --only=hub,van      (the hub cutaway busy; a van at bay 1 loading, on the spur, at a corner)
//   … --only=apt,door     (couriers at the apartments; doorstep parcels, the photo, the snow cap, pickup)
//   … --only=sled,night   (the dog sled in the old village; 새벽배송 at night)
//   … --only=app          (the 금방 마켓 app: five tabs, the chip + toast)
//   … --only=desktop,english
//   [--no-gif] skips the GIFs
// Phone 390 × 844 at DPR 3 (desktop 1280 × 800). Captures go to docs/previews/geumbang_lab_*.png|gif and
// docs/previews/geumbang_lab_numbers.json (logic ms per tick, draw calls, display objects, texture MiB, errors).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from '../serve.mjs';
import { launch, openPage } from '../pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews');
const TMP = process.env.LAB_TMP || '/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/geumbang_module_lab/frames';
fs.mkdirSync(TMP, { recursive: true });
const args = process.argv.slice(2);
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const NOGIF = args.includes('--no-gif');
const want = (n) => !ONLY.length || ONLY.includes(n);
const T0 = Date.now();
const SHOTS = [];
const NUM = {};

const GL_PROBE = () => {
  const C = window.__GLC = { draw: 0 };
  const patch = (proto) => { for (const m of ['drawElements', 'drawArrays']) { const o = proto[m]; proto[m] = function (...a) { C.draw++; return o.apply(this, a); }; } };
  if (window.WebGLRenderingContext) patch(WebGLRenderingContext.prototype);
  if (window.WebGL2RenderingContext) patch(WebGL2RenderingContext.prototype);
};

async function boot(browser, vp, dpr) {
  const { page, log } = await openPage(browser, SRV.url + 'tools/test/geumbang_lab/lab.html', { viewport: vp, dpr, init: GL_PROBE, isMobile: vp.width < 600, hasTouch: vp.width < 600 });
  await page.waitForFunction(() => window.__LAB && (window.__LAB.ready || window.__LAB.errors.length), null, { timeout: 120000 });
  await page.evaluate(() => {
    const L = window.__LAB, g = L.game, W = L.scene;
    g.canvas.addEventListener('webglcontextlost', () => L.errors.push('webglcontextlost at T ' + L.T));
    g.loop.sleep();
    let T = g.loop.time || performance.now();
    const DT = 1000 / 60;
    for (const sc of g.scene.scenes) if (sc.sys && sc.sys.tweens) sc.sys.tweens.getDelta = () => DT;
    L.run = (sec) => { const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) { T += DT; g.headlessStep(T, DT); } };
    L.frame = () => { T += DT; g.step(T, DT); };
    L.m = () => L.host.model;
    L.api = () => L.host.api;
    L.lookAt = (x, y, z) => { W.release(); W.look(x, y, z); W.cameras.main.preRender(); W.ground.bakeAll(); };
    L.lookL = (i, j, z) => { const p = L.L(i, j); L.lookAt(p.x, p.y, z); };
    L.depot = () => W.depot;
    L.until = (fn, maxS, step = 0.25) => { for (let t = 0; t < maxS; t += step) { if (fn()) return t; L.run(step); } return -1; };
    L.order = () => L.m().orders.list.find((o) => o.first) || null;
    L.van = (id = 1) => (L.m().disp ? L.m().disp.vans.find((v) => v.id === id) : null);
    L.texStats = () => {
      const tex = g.textures.list;
      let all = 0, mod = 0;
      const per = {};
      for (const k in tex) {
        if (k.startsWith('__') || k.startsWith('gblab_ground')) continue;
        const src = tex[k].source && tex[k].source[0];
        if (!src || !src.width) continue;
        const b = src.width * src.height * 4;
        all += b;
        if (L.MODULE_TEX.test(k)) { mod += b; per[k] = +(b / 1048576).toFixed(2); }
      }
      return { texMiB: +(all / 1048576).toFixed(1), moduleMiB: +(mod / 1048576).toFixed(2), moduleTex: per, placeholders: Array.from(L.Assets.warned), errors: L.errors.slice() };
    };
    L.drawCalls = (n = 8) => { const C = window.__GLC; const d0 = C.draw; for (let i = 0; i < n; i++) L.frame(); const r = +((C.draw - d0) / n).toFixed(1); L.flush(); return r; };
    L.grab = (w) => {
      L.frame();
      const src = g.canvas, h = Math.round(src.height * w / src.width);
      const c = L._grabC || (L._grabC = document.createElement('canvas'));
      c.width = w; c.height = h;
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.drawImage(src, 0, 0, src.width, src.height, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.92).split(',')[1];
    };
    L.flush = () => { const gl = g.renderer.gl; if (gl) { const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } };
  });
  return { page, log };
}

const ev = (page, fn, arg) => page.evaluate(fn, arg);
const run = (page, s) => ev(page, (s) => window.__LAB.run(s), s);
async function frames(page, n = 3) { await ev(page, (n) => { for (let i = 0; i < n; i++) window.__LAB.frame(); }, n); }
function small(file, w = 780) {
  try { execFileSync('python3', ['-I', '-c', 'import sys; from PIL import Image; im=Image.open(sys.argv[1]).convert("RGB"); w,h=im.size; f=min(1, int(sys.argv[2])/w); im=im.resize((int(w*f), int(h*f)), Image.LANCZOS) if f<1 else im; im=im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG); im.save(sys.argv[1], optimize=True)', file, String(w)]); } catch (e) { /* keep */ }
}
function isBlack(file) {
  try { return execFileSync('python3', ['-I', '-c', 'import sys; from PIL import Image, ImageStat; im=Image.open(sys.argv[1]).convert("L").resize((64, 128)); print(ImageStat.Stat(im).mean[0])', file], { encoding: 'utf8' }).trim() < 6; } catch (e) { return false; }
}
async function shot(page, name, w = 780) {
  if (MODE === 'gif') { await run(page, 3 / 60); return null; }
  await ev(page, () => { const W = window.__LAB.scene; W.cameras.main.preRender(); W.ground.bakeAll(); });
  const file = path.join(OUT, 'geumbang_lab_' + name + '.png');
  for (let tries = 0; tries < 3; tries++) {
    await frames(page, 3);
    await ev(page, () => window.__LAB.flush());
    await page.screenshot({ path: file, timeout: 120000 });
    if (!isBlack(file)) break;
    console.log('  (black capture, retaking ' + name + ')');
  }
  small(file, w);
  SHOTS.push(path.relative(ROOT, file));
  console.log('  shot', name, ((Date.now() - T0) / 1000).toFixed(1) + ' s');
  return file;
}
/** a GIF: n frames, step s of game time apart (hook(i) before each) */
async function gif(page, name, n, step, hook, width = 360) {
  if (MODE === 'still' || NOGIF) { for (let i = 0; i < n; i++) { if (hook) await hook(i); await run(page, step + 1 / 60); } return null; }
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) {
    if (hook) await hook(i);
    await run(page, step);
    await ev(page, () => { const W = window.__LAB.scene; W.ground.update(4); });
    const b64 = await ev(page, (w) => window.__LAB.grab(w), width * 2);
    fs.writeFileSync(path.join(dir, 'f' + String(i).padStart(3, '0') + '.jpg'), Buffer.from(b64, 'base64'));
  }
  const file = path.join(OUT, 'geumbang_lab_' + name + '.gif');
  const fps = Math.max(2, Math.min(12, Math.round(1 / step)));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, 'f%03d.jpg'), '-vf', `scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, file]);
  SHOTS.push(path.relative(ROOT, file));
  console.log('  gif', name, n + ' frames', ((Date.now() - T0) / 1000).toFixed(1) + ' s');
  return file;
}
/** logic ms per tick (model and host+view), draw calls, display objects, textures */
async function numbers(page, key) {
  if (MODE === 'gif') { await run(page, (300 + 8) / 60); return null; }
  const s = await ev(page, () => {
    const L = window.__LAB, v = L.host.view, acc = {}, undo = [];
    for (const k of ['hub', 'door', 'bubbles', 'followV', 'chip', 'app']) {
      const o = v[k]; if (!o || !o.update) continue; const up = o.update; acc[k] = 0;
      o.update = function (...a) { const t = performance.now(); const r = up.apply(this, a); acc[k] += performance.now() - t; return r; };
      undo.push(() => { o.update = up; });
    }
    acc.vans = 0;
    for (const d of v.vans.values()) { const up = d.sync; d.sync = function (...a) { const t = performance.now(); up.apply(this, a); acc.vans += performance.now() - t; }; undo.push(() => { d.sync = up; }); }
    L.ms.length = 0; L.msModel.length = 0;
    const d0 = L.scene.dolls.ms, N = 300;
    L.run(N / 60);
    const split = {};
    for (const k in acc) split[k] = +(acc[k] / N).toFixed(4);
    split.dollsCompositor = +((L.scene.dolls.ms - d0) / N).toFixed(4);
    for (const f of undo) f();
    const st = L.scene.stats();
    return Object.assign({ split }, st, L.texStats());
  });
  s.drawCalls = await ev(page, () => window.__LAB.drawCalls());
  delete s.state;
  NUM[key] = s;
  console.log('  numbers', key, JSON.stringify({ msHost: s.msHost, msModel: s.msModel, draw: s.drawCalls, objects: s.objects, moduleMiB: s.moduleMiB }));
  return s;
}

// ---------------------------------------------------------------------------------------------------- scenarios
let MODE = 'still';
let browser = null;
async function scenarios(PH, log) {
  const depotAt = (dx = 0, dy = -40, z = 0.8) => ev(PH, ([dx, dy, z]) => { const L = window.__LAB, b = L.depot(); L.lookAt(b.x + dx, b.y + dy, z); }, [dx, dy, z]);

  if (want('smoke')) {
    await ev(PH, () => { const L = window.__LAB; L.setup({ T: 600 * 3 + 25 * 10, fill: 0.7 }); L.run(40); });
    await depotAt(120, 40, 0.75);
    await shot(PH, 'smoke');
    await numbers(PH, 'smoke');
  }

  if (want('first')) {
    // the pad is paid: the ≈ 6 s ribbon flow, then 정 할머니's 장작 4 · 빵 2 followed from the rack to her door
    await ev(PH, () => { const L = window.__LAB; L.setup({ fresh: true, T: 600 * 3 + 25 * 8.6, fill: 0.7, homeAll: true }); L.run(0.5); });
    await depotAt(-120, -60, 0.8);
    await ev(PH, () => window.__LAB.api().open({ ceremonyS: 6 }));
    await run(PH, 1.6);
    await shot(PH, 'first_ceremony');
    await run(PH, 4.5);
    await shot(PH, 'first_opened');
    if (MODE === 'still') {
      // the parcel's steps (the camera follows by itself)
      const steps = [
        ['first_pick', () => { const o = window.__LAB.order(); return o && o.st === 'pick' && o.picked >= 1; }],
        ['first_pack', () => { const o = window.__LAB.order(); return o && o.st === 'pack'; }],
        ['first_load', () => { const v = window.__LAB.van(1); return v && v.st === 'load' && v.stT > 2.5; }],
        ['first_spur', () => { const v = window.__LAB.van(1); return v && v.st === 'out' && v.s > 14; }],
        ['first_drive', () => { const v = window.__LAB.van(1); return v && v.st === 'out' && v.path && v.s > v.path.len * 0.6; }],
        ['first_walk', () => { const v = window.__LAB.van(1); return v && v.st === 'curb' && v.tl && v.tl.beats[Math.max(0, v.beat)].k === 'walk'; }],
        ['first_ring', () => { const v = window.__LAB.van(1); return v && v.st === 'curb' && v.tl && v.tl.beats[Math.max(0, v.beat)].k === 'ring' && v.tlT - v.tl.beats[v.beat].t0 > 0.3; }],
        ['first_hand', () => { const v = window.__LAB.van(1); return v && v.st === 'curb' && v.tl && v.tl.beats[Math.max(0, v.beat)].k === 'hand' && v.tlT - v.tl.beats[v.beat].t0 > 0.45; }],
        ['first_joy', () => { const v = window.__LAB.van(1); return v && v.st === 'curb' && v.tl && v.tl.beats[Math.max(0, v.beat)].k === 'joy' && v.tlT - v.tl.beats[v.beat].t0 > 0.5; }],
      ];
      for (const [name, fn] of steps) {
        const t = await ev(PH, (src) => window.__LAB.until(new Function('return (' + src + ')()'), 140, 0.1), fn.toString());
        if (t < 0) { console.log('  (never reached ' + name + ')'); continue; }
        await shot(PH, name);
      }
      await ev(PH, () => window.__LAB.run(4.5));
      await shot(PH, 'first_done');
      NUM.first = await ev(PH, () => { const L = window.__LAB, m = L.m(); const d = L.events.find((e) => e.t === 'gb:delivered' && e.first); const o = L.events.find((e) => e.t === 'gb:order' && e.first); return { orderT: o && o.T, deliveredT: d && d.T, secs: d && o ? +(d.T - o.T).toFixed(1) : null, toasts: L.toasts.slice(), banners: L.banners.slice(), sounds: Array.from(new Set(L.sounds)), coins: d && d.coins }; });
    } else {
      await gif(PH, 'first_order', 96, 0.55);
    }
  }

  if (want('hub')) {
    await ev(PH, () => { const L = window.__LAB; L.setup({ T: 600 * 4 + 25 * 18.2, fill: 0.75, reveal: true, lv: { van: 1, pack: 1 } }); L.run(1); L.burst(9); L.run(6); });
    await depotAt(-30, -70, 1.15);
    await shot(PH, 'hub_cutaway');
    await numbers(PH, 'hub');
    await gif(PH, 'hub', 40, 0.2);
    await depotAt(140, 60, 1.25);
    await shot(PH, 'hub_pile');
  }

  if (want('van')) {
    await ev(PH, () => { const L = window.__LAB; L.setup({ T: 600 * 4 + 25 * 10.5, fill: 0.75, lv: { van: 2 }, homeAll: true }); L.burst(10); L.until(() => { const v = L.van(1); return v && v.st === 'load' && v.stT > 3; }, 120, 0.25); });
    await depotAt(250, 160, 1.2);
    await shot(PH, 'van_load');
    // the corner of the spur (35.55, −23.3): the gb_van_turn frame between SE / NE
    await ev(PH, () => { const L = window.__LAB; L.until(() => { const v = L.van(1); return v && v.st === 'out' && v.s > 4; }, 60, 0.1); L.lookL(35.2, -24.6, 1.1); });
    await gif(PH, 'van_spur', 44, 0.12);
    await ev(PH, () => { const L = window.__LAB; L.until(() => { const v = L.van(1); return v && v.st === 'out' && v.s > 24; }, 60, 0.1); const v = L.van(1); L.lookAt(v.x + 60, v.y - 60, 1.0); });
    await gif(PH, 'van_drive', 40, 0.15, async () => { await ev(PH, () => { const L = window.__LAB, v = L.van(1); if (v) L.scene.lookAt(v.x + 30, v.y - 50, 1.0); }); });
    await shot(PH, 'van_street');
  }

  if (want('apt')) {
    // a van tour to the apartments, followed (따라가기) from the app: the courier's round along 아파트 앞길
    await ev(PH, () => { const L = window.__LAB; L.setup({ T: 600 * 4 + 25 * 11, fill: 0.8, homeAll: true }); const m = L.m(); L.burst(14); L.until(() => { const v = L.van(1); return v && v.st === 'out' && v.load.some((o) => /^t_apt/.test(o.aid)); }, 300, 0.25); const v = L.van(1); const o = v.load.find((q) => /^t_apt/.test(q.aid)); L.aptOrder = o.id; L.api().follow(o.id); });
    await gif(PH, 'apt_courier', 70, 0.3);
    await ev(PH, () => { const L = window.__LAB; L.until(() => { const v = L.van(1); const b = v && v.tl && v.tl.beats[Math.max(0, v.beat)]; return b && (b.k === 'ring' || b.k === 'inside') && v.tlT - b.t0 > 0.3; }, 200, 0.1); });
    await shot(PH, 'apt_ring');
  }

  if (want('door')) {
    // quiet hours (21:00–08:00 with 새벽배송): every parcel is a doorstep parcel + a photo; then 4 game hours of snow
    await ev(PH, () => { const L = window.__LAB; L.setup({ T: 600 * 5 + 25 * 22.2, fill: 0.8, lv: { van: 1, dawn: 1 }, homeAll: false }); const m = L.m(); L.burst(10); L.until(() => { const v = L.van(1); return v && v.st === 'curb' && v.tl && v.tl.beats.some((b) => b.k === 'drop'); }, 300, 0.25); const v = L.van(1); L.lookAt(v.x - 40, v.y - 80, 1.25); });
    await gif(PH, 'door_drop', 40, 0.2, async () => { await ev(PH, () => { const L = window.__LAB, v = L.van(1); if (v && v.st === 'curb') L.scene.lookAt(v.x - 40, v.y - 80, 1.25); }); });
    await ev(PH, () => { const L = window.__LAB; L.until(() => L.m().settle.door.length >= 2, 200, 0.5); const b = L.m().settle.door[0]; L.lookAt(b.x, b.y - 30, 1.4); });
    await shot(PH, 'door_fresh');
    await ev(PH, () => { const L = window.__LAB; L.until(() => L.m().settle.door.some((b) => b.snowy), 140, 1); const b = L.m().settle.door.find((q) => q.snowy) || L.m().settle.door[0]; if (b) L.lookAt(b.x, b.y - 30, 1.4); });
    await shot(PH, 'door_snowy');
    NUM.door = await ev(PH, () => { const L = window.__LAB, m = L.m(); return { boxes: m.settle.door.length, snowy: m.settle.door.filter((b) => b.snowy).length, photos: (L.host.view.photos || []).length, quietRings: L.events.filter((e) => e.t === 'gb:beat' && e.k === 'ring').length }; });
  }

  if (want('sled')) {
    // three village parcels at the stand: the dog sled runs the old-village lane (G1b)
    await ev(PH, () => { const L = window.__LAB; L.setup({ T: 600 * 6 + 25 * 12, fill: 0.8, lv: { van: 1, sled: 1 }, homeAll: true }); const m = L.m(); const vil = m.book.list().filter((a) => a.zone === 'sled'); for (const a of vil.slice(0, 3)) { const hh = m.book.households().find((h) => h.aid === a.aid); if (hh) m.orders.place(L.T, 12, hh, m.ctx(), { want: { item_bread: 2, item_log: 2 } }); } L.until(() => m.sled && m.sled.st !== 'stand', 400, 0.5); const s = m.sled; L.lookAt(s.x - 40, s.y - 60, 1.0); });
    await gif(PH, 'sled', 60, 0.25, async () => { await ev(PH, () => { const L = window.__LAB, s = L.m().sled; if (s) L.scene.lookAt(s.x - 40, s.y - 60, 1.0); }); });
    await ev(PH, () => { const L = window.__LAB, m = L.m(); L.until(() => m.sled && m.sled.st === 'door' && m.sled.tl && m.sled.tl.beats[Math.max(0, m.sled.beat)].k !== 'park', 200, 0.25); const s = m.sled; L.lookAt(s.x - 40, s.y - 60, 1.15); });
    await shot(PH, 'sled');
    NUM.sled = await ev(PH, () => { const m = window.__LAB.m(); return { st: m.sled && m.sled.st, runs: m.sled && m.sled.runs, zones: m.state().zones }; });
  }

  if (want('night')) {
    await ev(PH, () => { const L = window.__LAB; L.setup({ T: 600 * 7 + 25 * 23.0, fill: 0.8, lv: { van: 2, dawn: 1, lockA: 1 } }); const m = L.m(); L.burst(12); L.run(30); L.scene.snapNight(); });
    await depotAt(160, 60, 0.85);
    await shot(PH, 'night_hub');
    await numbers(PH, 'night');
    await ev(PH, () => { const L = window.__LAB; L.until(() => { const v = L.van(1); return v && (v.st === 'out' || v.st === 'leg') && v.s > 30; }, 200, 0.25); const v = L.van(1); L.lookAt(v.x, v.y - 60, 1.1); });
    await gif(PH, 'night_van', 36, 0.15, async () => { await ev(PH, () => { const L = window.__LAB, v = L.van(1); if (v) L.scene.lookAt(v.x, v.y - 60, 1.1); }); });
    await shot(PH, 'night_street');
  }

  if (want('app')) {
    await ev(PH, () => { const L = window.__LAB; L.setup({ T: 600 * 4 + 25 * 8.5, fill: 0.75, lv: { van: 1 }, rev: [[3, 't_apt2', 5], [7, 't_apt1', 5], [4, 'lotB2', 4]], homeAll: true }); const m = L.m(); L.burst(12); L.run(150); m.deal('item_bread'); m.up.ok.add('lockA'); m.up.offer = 'lockA'; });
    await depotAt(200, 80, 0.8);
    for (const tab of ['today', 'orders', 'goods', 'crew', 'reviews']) {
      await ev(PH, (tab) => { const L = window.__LAB; L.host.view.openApp(tab); L.run(0.8); }, tab);
      await shot(PH, 'app_' + tab);
    }
    await ev(PH, () => { const L = window.__LAB; L.host.view.app.close(); L.host.view.toast('띵동! 새 주문 · 민지네 · 빵 3'); L.run(0.4); });
    await shot(PH, 'chip_toast');
  }

  if (want('english')) {
    await ev(PH, () => { const L = window.__LAB; L.setup({ T: 600 * 4 + 25 * 15.2, fill: 0.75, lang: 'en', reveal: false, homeAll: true }); const m = L.m(); L.burst(8); L.run(90); });
    await depotAt(-100, -40, 0.85);
    await shot(PH, 'english_hub');
    await ev(PH, () => { const L = window.__LAB; L.host.view.openApp('orders'); L.run(0.8); });
    await shot(PH, 'english_app');
    await ev(PH, () => { const L = window.__LAB; L.host.view.app.close(); L.lang = 'ko'; });
  }
  NUM[MODE === 'still' ? 'phoneErrors' : 'gifPageErrors'] = log.errors.concat(log.missing404).slice(0, 20);

  if (want('desktop') && MODE === 'still') {
    const { page: DP, log: dlog } = await boot(browser, { width: 1280, height: 800 }, 1);
    await ev(DP, () => { const L = window.__LAB; L.setup({ T: 600 * 4 + 25 * 11.5, fill: 0.75, lv: { van: 2 }, homeAll: true }); const m = L.m(); L.burst(12); L.run(80); const b = L.depot(); L.lookAt(b.x + 320, b.y - 120, 0.7); });
    await shot(DP, 'desktop', 1280);
    await numbers(DP, 'desktop');
    NUM.desktopErrors = dlog.errors.concat(dlog.missing404).slice(0, 20);
    await DP.context().close();
  }
}

const SRV = await start(0);
browser = await launch();
let failed = false;
try {
  {
    MODE = 'still';
    const { page, log } = await boot(browser, { width: 390, height: 844 }, 3);
    await scenarios(page, log);
    await page.context().close();
  }
  const GIFS = ['first', 'hub', 'van', 'apt', 'door', 'sled', 'night'];
  if (!NOGIF && GIFS.some(want)) {
    MODE = 'gif';
    const { page, log } = await boot(browser, { width: 390, height: 844 }, 1);
    await scenarios(page, log);
    await page.context().close();
  }
} catch (e) {
  console.error(e);
  failed = true;
}
await browser.close();
await SRV.close();

const nf = path.join(OUT, 'geumbang_lab_numbers.json');
let prev = {};
try { prev = JSON.parse(fs.readFileSync(nf, 'utf8')); } catch (e) { /* first run */ }
const merged = Object.assign(prev, NUM, { updated: new Date().toISOString() });
fs.writeFileSync(nf, JSON.stringify(merged, null, 1));
const bad = Object.values(NUM).some((s) => s && ((s.errors && s.errors.length) || (s.placeholders && s.placeholders.length))) || (NUM.phoneErrors && NUM.phoneErrors.length) || (NUM.gifPageErrors && NUM.gifPageErrors.length);
console.log(JSON.stringify(NUM, (k, v) => (k === 'moduleTex' ? undefined : v), 1).slice(0, 5000));
console.log('shots', SHOTS.length, 'in', ((Date.now() - T0) / 1000).toFixed(1), 's');
process.exit(failed || bad ? 1 : 0);
