// beach_runtime lab runner (Playwright, one Chromium, fixed-step clock). Run it in groups so each run stays under
// 2 minutes (the numbers file merges the groups):
//   nice -n 15 node tools/test/beach_lab/run_lab.mjs --only=day           (the ★3 beach by day: overview, zooms, GIF)
//   nice -n 15 node tools/test/beach_lab/run_lab.mjs --only=swim          (swimmers + whistle, volleyball)
//   nice -n 15 node tools/test/beach_lab/run_lab.mjs --only=fun,pool      (ice cream, sandcastle contest, hotel pool)
//   nice -n 15 node tools/test/beach_lab/run_lab.mjs --only=night         (dusk, night lights + balconies, fireworks)
//   nice -n 15 node tools/test/beach_lab/run_lab.mjs --only=reveal,stages (snow-to-sand walk + reveal, clean-up, opening stages)
//   nice -n 15 node tools/test/beach_lab/run_lab.mjs --only=polar,happen  (북극곰 수영 대회, P9–P12)
//   nice -n 15 node tools/test/beach_lab/run_lab.mjs --only=desktop,english
//   [--no-gif] skips the GIFs
// Phone 390 × 844 at DPR 3 (desktop 1280 × 800). Captures go to docs/previews/beach_lab_*.png|gif and
// docs/previews/beach_lab_numbers.json (logic ms per tick, draw calls, display objects, texture MiB, placeholders,
// console errors). Exit 1 on errors / placeholders.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from '../serve.mjs';
import { launch, openPage } from '../pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews');
const TMP = process.env.LAB_TMP || path.join('/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/later_beach_runtime', 'frames');
fs.mkdirSync(TMP, { recursive: true });
const args = process.argv.slice(2);
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const NOGIF = args.includes('--no-gif');
const want = (n) => !ONLY.length || ONLY.includes(n);
const T0 = Date.now();
const SHOTS = [];
const NUM = {};

// ---------------------------------------------------------------------------------------------------- page helpers
const GL_PROBE = () => {
  const C = window.__GLC = { draw: 0 };
  const patch = (proto) => { for (const m of ['drawElements', 'drawArrays']) { const o = proto[m]; proto[m] = function (...a) { C.draw++; return o.apply(this, a); }; } };
  if (window.WebGLRenderingContext) patch(WebGLRenderingContext.prototype);
  if (window.WebGL2RenderingContext) patch(WebGL2RenderingContext.prototype);
};

async function boot(browser, vp, dpr, lang = 'ko') {
  const { page, log } = await openPage(browser, SRV.url + 'tools/test/beach_lab/lab.html', { viewport: vp, dpr, init: GL_PROBE, isMobile: vp.width < 600, hasTouch: vp.width < 600 });
  await page.waitForFunction(() => window.__LAB && (window.__LAB.ready || window.__LAB.errors.length), null, { timeout: 90000 });
  await page.evaluate((lang) => {
    const L = window.__LAB, g = L.game;
    L.lang = lang;
    g.canvas.addEventListener('webglcontextlost', () => L.errors.push('webglcontextlost at T ' + L.T));
    g.loop.sleep();
    let T = g.loop.time || performance.now();
    const DT = 1000 / 60;
    // Phaser 3.60+ tweens run on Date.now (wall time), not the step delta: under fixed stepping they must follow game time
    for (const sc of g.scene.scenes) if (sc.sys && sc.sys.tweens) sc.sys.tweens.getDelta = () => DT;
    L.run = (sec) => { const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) { T += DT; g.headlessStep(T, DT); } };
    L.frame = () => { T += DT; g.step(T, DT); };
    const W = L.scene;
    L.setup = (o) => W.setup(o);
    L.m = () => L.host.model;
    L.api = () => L.host.api;
    /** put the camera on lattice (i, j) at zoom z (no glide) */
    L.look = (i, j, z) => { const [x, y] = L.layout.LR(i, j); W.focus = { x, y }; if (z) { L.zoom = z; W.cameras.main.setZoom(z * L.View.k); } W.cameras.main.centerOn(x, y); W.cameras.main.preRender(); W.ground.bakeAll(W.cameras.main.worldView); };
    L.until = (fn, maxS, step = 0.25) => { for (let t = 0; t < maxS; t += step) { if (fn()) return t; L.run(step); } return -1; };
    L.stats = () => {
      const tex = g.textures.list;
      let all = 0, mod = 0, tf = 0;
      const per = {};
      for (const k in tex) {
        if (k.startsWith('__') || k.startsWith('labg_')) continue;
        const src = tex[k].source && tex[k].source[0];
        if (!src || !src.width) continue;
        const b = src.width * src.height * 4;
        all += b;
        if (L.MODULE_TEX.test(k)) { mod += b; per[k] = +(b / 1048576).toFixed(2); }
        if (/^(tf_|tf2_|bf_)/.test(k)) tf += b;
      }
      const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
      const ms = L.ms.slice().sort((a, b) => a - b), mm = L.msModel.slice().sort((a, b) => a - b);
      const objs = (sc) => { let n = 0; const walk = (l) => { for (const o of l) { n++; if (o.list) walk(o.list); } }; walk(sc.children.list); return n; };
      return { texMiB: +(all / 1048576).toFixed(1), moduleMiB: +(mod / 1048576).toFixed(1), peopleAtlasMiB: +(tf / 1048576).toFixed(1), peopleUsedMiB: L.dolls.usedMiB().total, moduleTex: per,
        msTick: +avg(ms).toFixed(4), p95: ms.length ? +ms[Math.floor(ms.length * 0.95)].toFixed(3) : 0, maxMs: ms.length ? +ms[ms.length - 1].toFixed(2) : 0, msModel: +avg(mm).toFixed(4), p95Model: mm.length ? +mm[Math.floor(mm.length * 0.95)].toFixed(4) : 0,
        crowd: L.m().crowdInfo(), rigs: L.host.view.goers.live(), worldObjects: objs(W), moduleObjects: L.host.objects(), groundMiB: +W.ground.textureMiB().toFixed(1),
        placeholders: Array.from(L.Assets.warned), errors: L.errors.slice(), lateLoads: L.lateLoads.slice() };
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
    /** wait for the GPU (swiftshader queues frames; a screenshot behind a long queue times out) */
    L.flush = () => { const gl = g.renderer.gl; if (gl) { const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } };
    // ---- scenario helpers
    /** a volleyball game with ≥ 20 s left: wait for one, or send a group of friends to the free court (seeded looks) */
    L.volley = (maxS = 60) => {
      const m = L.m(), c = m.crowd;
      for (let t = 0, n = 0; t < maxS; t += 0.5) {
        if (c.court.on && c.court.until - L.T > 20) return true;
        if (!c.court.players.length && c.courtFree()) c.spawnGroup('friends', 'local', 'gate', L.T, L.stream(m.seed, 'lab:volley:' + n++));
        L.run(0.5);
      }
      return false;
    };
    /** the swimmer nearest the lifeguard tower drifts past the buoys (the whistle gap is reset); returns where they were */
    L.drift = () => {
      const m = L.m(); m.lastWhistle = -1e9;
      const [tx, ty] = L.layout.LR(101.75, -16.75);
      let best = null, bd = 1e9;
      for (const o of m.crowd.list) if (o.mode === 'act' && o.act && o.act.kind === 'swim') { const d = Math.hypot(o.x - tx, o.y - ty); if (d < bd) { bd = d; best = o; } }
      if (!best) return null;
      const at = L.layout.px2L(best.x, best.y);
      m.crowd.driftOut(best, L.T);
      return at;
    };
  }, lang);
  return { page, log };
}

const ev = (page, fn, arg) => page.evaluate(fn, arg);
const run = (page, s) => ev(page, (s) => window.__LAB.run(s), s);
async function frames(page, n = 3) { await ev(page, (n) => { for (let i = 0; i < n; i++) window.__LAB.frame(); }, n); }
async function settle(page) { await page.waitForFunction(() => { const L = window.__LAB; return !L.scene.load.isLoading() && L.scene.load.list.size === 0; }, null, { timeout: 30000 }); }
function small(file, w = 780) {
  try { execFileSync('python3', ['-I', '-c', 'import sys; from PIL import Image; im=Image.open(sys.argv[1]).convert("RGB"); w,h=im.size; f=min(1, int(sys.argv[2])/w); im=im.resize((int(w*f), int(h*f)), Image.LANCZOS) if f<1 else im; im=im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG); im.save(sys.argv[1], optimize=True)', file, String(w)]); } catch (e) { /* keep */ }
}
function isBlack(file) {
  try { return execFileSync('python3', ['-I', '-c', 'import sys; from PIL import Image, ImageStat; im=Image.open(sys.argv[1]).convert("L").resize((64, 128)); print(ImageStat.Stat(im).mean[0])', file], { encoding: 'utf8' }).trim() < 6; } catch (e) { return false; }
}
async function shot(page, name, clip, w = 780) {
  if (MODE === 'gif') { await run(page, 3 / 60); return null; }     // same game time as a still, no capture
  await ev(page, () => { const W = window.__LAB.scene; W.ground.bakeAll(W.cameras.main.worldView); });
  const file = path.join(OUT, 'beach_lab_' + name + '.png');
  // swiftshader now and then hands back an all-black surface: render again and retake
  for (let tries = 0; tries < 3; tries++) {
    await frames(page, 3);
    await ev(page, () => window.__LAB.flush());
    await page.screenshot({ path: file, clip, timeout: 90000 });
    if (!isBlack(file)) break;
    console.log('  (black capture, retaking ' + name + ')');
  }
  small(file, w);
  SHOTS.push(path.relative(ROOT, file));
  console.log('  shot', name, ((Date.now() - T0) / 1000).toFixed(1) + ' s');
  return file;
}
/** a GIF: n frames, step s of game time apart */
async function gif(page, name, n, step, hook, clip, width = 360) {
  if (MODE === 'still' || NOGIF) { for (let i = 0; i < n; i++) { if (hook) await hook(i); await run(page, step + 1 / 60); } return null; }   // same game time, no capture
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < n; i++) {
    if (hook) await hook(i);
    await run(page, step);
    await ev(page, () => { const W = window.__LAB.scene; W.ground.update(W.cameras.main.worldView); });
    // grab the game canvas right after a synchronous render (same task: the drawing buffer is still there), scaled in-page
    const b64 = await ev(page, (w) => window.__LAB.grab(w), width * 2);
    fs.writeFileSync(path.join(dir, 'f' + String(i).padStart(3, '0') + '.jpg'), Buffer.from(b64, 'base64'));
  }
  const file = path.join(OUT, 'beach_lab_' + name + '.gif');
  const fps = Math.max(1, Math.round(1 / step));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, 'f%03d.jpg'), '-vf', `scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, file]);
  SHOTS.push(path.relative(ROOT, file));
  console.log('  gif', name, ((Date.now() - T0) / 1000).toFixed(1) + ' s');
  return file;
}
async function numbers(page, key) {
  if (MODE === 'gif') { await run(page, (600 + 8) / 60); return null; }    // the same game time the split + draw calls take
  // the view's cost split: 10 s more with timers on the sub-views and the doll rigs (compositor = DollSprite's share)
  const split = await ev(page, () => {
    const L = window.__LAB, v = L.host.view, acc = {}, undo = [];
    for (const k of ['beach', 'goers', 'boats', 'night', 'happen', 'polar', 'reveal', 'fx']) {
      const o = v[k]; if (!o) continue; const up = o.update; acc[k] = 0;
      o.update = function (dt, t) { const a = performance.now(); up.call(this, dt, t); acc[k] += performance.now() - a; };
      undo.push(() => { o.update = up; });
    }
    const m = L.host.model, mu = m.update; acc.model = 0;
    const d0 = L.dolls.ms, N = 600;
    L.run(N / 60);
    const out = {};
    for (const k in acc) out[k] = +(acc[k] / N).toFixed(4);
    out.view = +Object.keys(acc).filter((k) => k !== 'model').reduce((s, k) => s + acc[k], 0).toFixed(3) / N;
    out.dolls = +((L.dolls.ms - d0) / N).toFixed(4);
    out.viewOwn = +(out.view - out.dolls).toFixed(4);
    out.view = +out.view.toFixed(4);
    delete out.model;
    for (const f of undo) f();
    void mu;
    return out;
  });
  const s = await ev(page, () => window.__LAB.stats());
  s.viewSplit = split;
  s.drawCalls = await ev(page, () => window.__LAB.drawCalls());
  delete s.moduleTex.bch_shadow;
  NUM[key] = s;
  return s;
}

// ---------------------------------------------------------------------------------------------------- scenarios
// Each group runs twice on the same seeds: stills + numbers on a 390 × 844 DPR-3 page, then the GIFs on a DPR-1 page
// (swiftshader renders a DPR-3 frame in ~1.5 s; GIFs are 360 px wide anyway). A phase replays the other phase's
// captures as plain game time so both pages see the same story.
let MODE = 'still';
async function scenarios(PH, log) {

  if (want('day')) {
    // the ★3 beach on a sunny late morning
    await ev(PH, () => { const L = window.__LAB; L.setup({ stage: 'full', hour: 10.2, at: [104, -16.4], zoom: 1 }); L.run(95); L.ms.length = 0; L.msModel.length = 0; L.run(20); });
    await ev(PH, () => window.__LAB.look(104.5, -16.6, 1));
    await shot(PH, 'day_z10');
    await numbers(PH, 'day');
    await ev(PH, () => window.__LAB.look(103.5, -15.2, 0.6));
    await shot(PH, 'day_z06');
    if (MODE === 'still') NUM.day06 = { drawCalls: await ev(PH, () => window.__LAB.drawCalls()), worldObjects: (await ev(PH, () => window.__LAB.stats())).worldObjects };
    await ev(PH, () => window.__LAB.look(106.5, -19.4, 1.2));
    await shot(PH, 'day_z12');
    await ev(PH, () => window.__LAB.look(98.4, -16.4, 1));
    await gif(PH, 'day', 40, 0.15);
  }

  if (want('swim') || want('fun')) {
    await ev(PH, () => { const L = window.__LAB; L.setup({ stage: 'full', hour: 12.0, at: [104, -16.4], zoom: 1 }); L.run(70); });
  }
  if (want('swim')) {
    // swimmers + the lifeguard's whistle
    await ev(PH, () => { const L = window.__LAB; L.until(() => L.m().crowd.list.some((o) => o.mode === 'act' && o.act && o.act.kind === 'swim'), 30); const p = L.drift() || [101.6, -19.6]; L.look((p[0] + 101.75) / 2, (p[1] - 16.75) / 2 - 0.6, 1.1); });
    await gif(PH, 'swim_whistle', 34, 0.25);
    // volleyball
    await ev(PH, () => { const L = window.__LAB; L.volley(); L.look(112.6, -16.8, 1.2); L.run(0.5); });
    await gif(PH, 'volley', 30, 0.1);
    await shot(PH, 'volley');
  }
  if (want('fun')) {
    // the ice-cream cart
    await ev(PH, () => { const L = window.__LAB; L.until(() => L.m().slots.queue('cart').filter((s) => s.by).length >= 2, 60); L.look(103.2, -14.9, 1.25); });
    await gif(PH, 'icecream', 28, 0.25);
    // the sandcastle contest: the banner, the castles growing a stage every 20 s, the chief's pick
    await ev(PH, () => { const L = window.__LAB; L.contest = L.api().event('contest'); L.run(1.2); L.look(102.3, -17.4, 0.9); });
    await shot(PH, 'contest_start');
    await gif(PH, 'contest', 24, 3);
    await ev(PH, () => { const L = window.__LAB; L.until(() => L.m().events.active && L.m().events.active.phase === 'judge', 30); L.run(2); L.api().pick('castle_2'); L.run(1.0); });
    await shot(PH, 'contest_winner');
  }

  if (want('pool')) {
    await ev(PH, () => { const L = window.__LAB; L.setup({ stage: 'full', hour: 12.5, at: [106.5, -11.5], zoom: 1.2, seed: 9 }); L.run(80); L.look(106.4, -11.2, 1.2); });
    await shot(PH, 'pool');
    await gif(PH, 'pool', 30, 0.2);
  }

  if (want('night')) {
    // dusk (lights coming on), then the fireworks night: the hotel lit with guests on the balconies, bursts over the sea
    await ev(PH, () => { const L = window.__LAB; L.setup({ stage: 'full', hour: 17.6, at: [101, -14.0], zoom: 0.85, seed: 5 }); L.run(55); L.look(101.5, -13.6, 0.85); });
    await settle(PH);
    await shot(PH, 'dusk');
    await ev(PH, () => { const L = window.__LAB; L.fw = L.api().event('fireworks'); L.until(() => L.m().events.active && L.m().events.active.kind === 'fireworks', 60); L.run(4); L.look(101.0, -11.6, 0.85); });
    await settle(PH);
    await shot(PH, 'night');
    await numbers(PH, 'night');
    await ev(PH, () => { const L = window.__LAB; L.look(100.5, -20.0, 0.8); L.run(1); });
    await gif(PH, 'fireworks', 50, 0.15);
    await shot(PH, 'fireworks');
  }

  if (want('reveal')) {
    // the road is built: walking east past the lighthouse, the snow thins into sand; the fog clears
    await ev(PH, () => { const L = window.__LAB, W = L.scene; L.setup({ stage: 'path', hour: 11, chief: [82.5, -6.0], follow: 'chief', fog: true, zoom: 0.8 }); W.walk([[86.5, -6.0], [88.6, -7.2], [90.9, -9.5], [91.0, -12.4]], 120); L.run(0.5); });
    await gif(PH, 'reveal', 64, 0.2);
    await shot(PH, 'reveal_after');
    await ev(PH, () => { const L = window.__LAB; L.run(4); L.look(100.0, -16.0, 0.7); });
    await shot(PH, 'cleanup');
  }

  if (want('stages')) {
    await ev(PH, () => { const L = window.__LAB; L.setup({ stage: 'open', hour: 11.4, at: [101, -16], zoom: 0.7 }); L.run(60); L.look(100.5, -15.5, 0.7); });
    await shot(PH, 'stage_open');
    await ev(PH, () => { const L = window.__LAB; L.setup({ stage: 'shops', hour: 11.4, at: [101, -16], zoom: 0.7 }); L.run(60); L.look(100.5, -15.5, 0.7); });
    await shot(PH, 'stage_shops');
  }

  if (want('polar')) {
    await ev(PH, () => { const L = window.__LAB; L.setup({ stage: 'full', hour: 13, seed: 3, hideChief: true }); L.pol = L.api().event('polar'); L.run(1); const p = L.layout.placePos('polar'); L.scene.focus = { x: p.x, y: p.y - 40 }; L.zoom = 1.1; L.scene.cameras.main.setZoom(1.1 * L.View.k); L.scene.cameras.main.centerOn(p.x, p.y - 40); });
    await gif(PH, 'polar', 46, 1.0);
    await ev(PH, () => window.__LAB.run(0.1));
    await shot(PH, 'polar_end');
  }

  if (want('happen')) {
    await ev(PH, () => { const L = window.__LAB; L.setup({ stage: 'full', hour: 11.5, seed: 21 }); L.run(70); });
    await ev(PH, () => { const L = window.__LAB; const ok = L.api().happening('P11'); const d = L.m().events.happening && L.m().events.happening.data; if (d) { const [i, j] = L.layout.px2L(d.from[0], d.from[1]); L.look(i - 1.2, j - 1.6, 1.0); } return ok; });
    await gif(PH, 'p11_ball', 46, 0.4);
    await ev(PH, () => { const L = window.__LAB; L.run(8); const ok = L.api().happening('P12'); const d = L.m().events.happening && L.m().events.happening.data; if (d) { const [i, j] = L.layout.px2L((d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2); L.look(i, j, 1.0); const mid = L.m().parasolAt(d, (d.liftAt + d.landAt) / 2); L.scene.chiefPos = { x: mid.x, y: mid.y + 30 }; } return ok; });
    await gif(PH, 'p12_parasol', 30, 0.3);
    await ev(PH, () => { const L = window.__LAB; L.run(6); const ok = L.api().happening('P9'); const d = L.m().events.happening && L.m().events.happening.data; if (d) { const [i, j] = L.layout.px2L(d.x, d.y); L.look(i, j, 1.3); } return ok; });
    await gif(PH, 'p9_crab', 30, 0.3);
  }

  if (want('english')) {
    await ev(PH, () => { const L = window.__LAB; L.setup({ stage: 'full', hour: 11, lang: 'en', at: [93, -13.6], zoom: 1 }); L.run(30); L.look(93.4, -13.4, 1); L.host.drain(); L.scene.ui.banner('Sunny Beach ★3', 'A dream resort! The Sunny Beach festival week begins'); L.run(0.5); });
    await shot(PH, 'english');
  }
  NUM[MODE === 'still' ? 'phoneErrors' : 'gifPageErrors'] = log.errors.concat(log.missing404).slice(0, 20);

  if (want('desktop') && MODE === 'still') {
    const ctx = PH.context();
    const { page: DP, log: dlog } = await boot(browser, { width: 1280, height: 800 }, 1);
    await ev(DP, () => { const L = window.__LAB; L.setup({ stage: 'full', hour: 11, at: [104, -15.5], zoom: 1 }); L.run(80); L.look(104, -15.4, 1); });
    await shot(DP, 'desktop', undefined, 1280);
    await numbers(DP, 'desktop');
    NUM.desktopErrors = dlog.errors.concat(dlog.missing404).slice(0, 20);
    await DP.context().close();
    void ctx;
  }
}

const SRV = await start(0);
const browser = await launch();
let failed = false;
try {
  {
    MODE = 'still';
    const { page, log } = await boot(browser, { width: 390, height: 844 }, 3);
    await scenarios(page, log);
    await page.context().close();
  }
  const GIFS = ['day', 'swim', 'fun', 'pool', 'night', 'reveal', 'polar', 'happen'];
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

// merge the numbers with earlier groups
const nf = path.join(OUT, 'beach_lab_numbers.json');
let prev = {};
try { prev = JSON.parse(fs.readFileSync(nf, 'utf8')); } catch (e) { /* first run */ }
const merged = Object.assign(prev, NUM, { updated: new Date().toISOString() });
fs.writeFileSync(nf, JSON.stringify(merged, null, 1));
const bad = Object.values(NUM).some((s) => s && ((s.errors && s.errors.length) || (s.placeholders && s.placeholders.length))) || (NUM.phoneErrors && NUM.phoneErrors.length) || (NUM.gifPageErrors && NUM.gifPageErrors.length);
console.log(JSON.stringify(NUM, (k, v) => (k === 'moduleTex' ? undefined : v), 1).slice(0, 4000));
console.log('shots', SHOTS.length, 'in', ((Date.now() - T0) / 1000).toFixed(1), 's');
process.exit(failed || bad ? 1 : 0);
