// Water lab runner (CONTRACT_V7 section V): headless Chromium (SwiftShader WebGL) renders the three lab scenes
// of tools/test/water_lab.html with a deterministic clock (window.__W.frame(t), never the wall clock).
//
//   node tools/test/water_lab.mjs still <scene> [--mode new|old] [--quality high|low] [--t 3.2] [--out file.png]
//                                       [--w 390 --h 844 --dpr 1 --zoom 1.0]
//   node tools/test/water_lab.mjs gifs        -> docs/previews/water_village.gif, water_harbor.gif, water_beach.gif (+ stills)
//   node tools/test/water_lab.mjs beforeafter -> docs/previews/water_before_after.png
//   node tools/test/water_lab.mjs perf        -> relative frame cost old tileSprite / low / high (SwiftShader)
//   node tools/test/water_lab.mjs check       -> loads every scene x mode x quality, fails on console errors
//   node tools/test/water_lab.mjs all         -> everything above (resumable: frames are cached in the scratch dir)
//
// Frames go to $WATER_LAB_TMP (default: /tmp/water_lab); GIFs are made with ffmpeg (palettegen, 2 passes).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREV = path.join(ROOT, 'docs', 'previews');
const TMP = process.env.WATER_LAB_TMP || '/tmp/water_lab';
fs.mkdirSync(TMP, { recursive: true });

const args = process.argv.slice(2);
const cmd = args[0] || 'all';
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };

let srv = null, browser = null;
async function boot() {
  if (!srv) srv = await start(0, { prefix: '/fv/' });
  if (!browser) browser = await launch();
}
async function shutdown() { if (browser) await browser.close(); if (srv) await srv.close(); }

/** open a lab page; returns {page, ctx, errors} once window.__W.ready */
async function open(q) {
  await boot();
  const w = +(q.w || 390), h = +(q.h || 844), dpr = +(q.dpr || 1);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + (e && e.stack || e)));
  page.on('console', (m) => { if (/Failed to load resource/.test(m.text())) return; if (m.type() === 'error' || (m.type() === 'warning' && /Water|WebGL|shader/i.test(m.text()))) errors.push(m.type() + ': ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !/assets\/(beach|beachfolk)\//.test(r.url())) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  const qs = new URLSearchParams(Object.assign({ w, h, dpr }, q)).toString();
  await page.goto(srv.url + 'tools/test/water_lab.html?' + qs, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__W && window.__W.ready, null, { timeout: 240000, polling: 200 });
  const labErr = await page.evaluate(() => window.__W.errors);
  errors.push(...labErr);
  return { page, ctx, errors };
}

async function shot(page, t, file, clip) {
  await page.evaluate((tt) => window.__W.frame(tt), t);
  if (clip) { await page.screenshot({ path: file, clip }); return; }     // clip: CSS px of the page
  const c = await page.$('canvas');
  await c.screenshot({ path: file });
}

// ------------------------------------------------------------------------------------------- still
async function still(scene, o = {}) {
  const q = { scene, mode: o.mode || 'new', quality: o.quality || 'high', zoom: o.zoom || 1.0, w: o.w || 390, h: o.h || 844, dpr: o.dpr || 1 };
  const { page, ctx, errors } = await open(q);
  const out = o.out || path.join(TMP, `still_${scene}_${q.mode}_${q.quality}.png`);
  await shot(page, +(o.t || 3), out);
  const info = await page.evaluate(() => window.__W.info());
  await ctx.close();
  return { out, info, errors };
}

// ------------------------------------------------------------------------------------------- gifs
function ffmpegGif(dir, pattern, fps, out, scale) {
  const pal = path.join(dir, 'palette.png');
  const vf = (scale ? `scale=${scale}:-1:flags=lanczos,` : '') + 'palettegen=max_colors=256:stats_mode=full';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, pattern), '-vf', vf, pal]);
  const lv = (scale ? `scale=${scale}:-1:flags=lanczos[x];[x][1:v]` : '[0:v][1:v]') + 'paletteuse=dither=sierra2_4a:diff_mode=rectangle';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, pattern), '-i', pal, '-lavfi', lv, '-loop', '0', out]);
  return fs.statSync(out).size;
}

const GIFS = {
  village: { zoom: 1.0, t0: 2.0, frames: 72, fps: 15, crop: { x: 0, y: 140, width: 390, height: 560 } },
  harbor: { zoom: 0.9, t0: 1.0, frames: 72, fps: 15, crop: { x: 0, y: 140, width: 390, height: 560 } },
  beach: { zoom: 0.95, t0: 4.0, frames: 90, fps: 15, crop: { x: 0, y: 150, width: 390, height: 560 } },
};

async function gif(scene) {
  const g = GIFS[scene];
  const dir = path.join(TMP, 'gif_' + scene);
  fs.mkdirSync(dir, { recursive: true });
  const { page, ctx, errors } = await open({ scene, mode: 'new', quality: 'high', zoom: g.zoom, w: 390, h: 844, dpr: 1 });
  for (let i = 0; i < g.frames; i++) {
    const f = path.join(dir, `f_${String(i).padStart(4, '0')}.png`);
    await shot(page, g.t0 + i / g.fps, f, g.crop);
  }
  // full-size stills at DPR 2 for the report
  await ctx.close();
  const st = await open({ scene, mode: 'new', quality: 'high', zoom: g.zoom, w: 390, h: 844, dpr: 2 });
  await shot(st.page, g.t0 + 1.3, path.join(PREV, `water_${scene}.png`));
  await st.ctx.close();
  const out = path.join(PREV, `water_${scene}.gif`);
  let size = ffmpegGif(dir, 'f_%04d.png', g.fps, out);
  if (size > 5.8e6) size = ffmpegGif(dir, 'f_%04d.png', g.fps, out, 352);       // keep every GIF <= 6 MB
  if (size > 5.8e6) size = ffmpegGif(dir, 'f_%04d.png', g.fps, out, 320);
  return { scene, out, size, errors: errors.concat(st.errors) };
}

// ------------------------------------------------------------------------------------------- before / after
async function beforeAfter() {
  const o = path.join(TMP, 'ba_old.png'), n = path.join(TMP, 'ba_new.png');
  const a = await still('village', { mode: 'old', t: 4, out: o, zoom: 1.0, dpr: 2 });
  const b = await still('village', { mode: 'new', t: 4, out: n, zoom: 1.0, dpr: 2 });
  const out = path.join(PREV, 'water_before_after.png');
  execFileSync('python3', [path.join(ROOT, 'tools', 'test', 'water_lab', 'compose.py'), 'pair', o, n, out,
    'BEFORE - scrolling water_sea tileSprite + baked shallow band + foam strip', 'AFTER - src/systems/Water.js (high), same framing, t = 4 s', '0,0,780,1200']);
  return { out, errors: a.errors.concat(b.errors) };
}

// ------------------------------------------------------------------------------------------- perf
async function perf() {
  // SwiftShader (CPU) frame cost of the sea itself: (scene with only the sea + land) - (same with the sea hidden).
  // Rounds are interleaved and the median is reported, because the CPU is shared with other jobs.
  const res = {};
  const runs = [['old', 'high'], ['new', 'low'], ['new', 'high']];
  for (const scene of ['village', 'beach']) {
    const pages = [];
    for (const [mode, quality] of runs) pages.push({ mode, quality, ...(await open({ scene, mode, quality, zoom: 1.0, w: 390, h: 844, dpr: 2 })) });
    for (const p of pages) await p.page.evaluate(() => { window.__W.hideObjects(true); window.__W.perf(4); });
    const samples = pages.map(() => ({ water: [], empty: [] }));
    for (let round = 0; round < 5; round++) {
      for (let k = 0; k < pages.length; k++) {
        const r = await pages[k].page.evaluate(() => {
          const W = window.__W;
          const set = (v) => { if (W.water) W.water.setVisible(v); for (const o of W.scene.children.list) if (o.type === 'TileSprite') o.setVisible(v); };
          set(true); const a = W.perf(12, 2);
          set(false); const b = W.perf(12, 2);
          set(true);
          return [a, b];
        });
        samples[k].water.push(r[0]); samples[k].empty.push(r[1]);
      }
    }
    const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
    for (let k = 0; k < pages.length; k++) {
      const p = pages[k];
      const info = await p.page.evaluate(() => window.__W.info());
      const w = med(samples[k].water), e = med(samples[k].empty);
      res[`${scene}:${p.mode}:${p.quality}`] = { msWithSea: +w.toFixed(2), msWithoutSea: +e.toFixed(2), seaCostMs: +(w - e).toFixed(2), info, errors: p.errors };
      await p.ctx.close();
    }
    const base = res[`${scene}:old:high`].seaCostMs;
    for (const [mode, quality] of runs) { const r = res[`${scene}:${mode}:${quality}`]; r.relativeToOld = base > 0 ? +(r.seaCostMs / base).toFixed(1) : null; }
  }
  fs.writeFileSync(path.join(TMP, 'perf.json'), JSON.stringify(res, null, 1));
  return res;
}

// ------------------------------------------------------------------------------------------- check
async function check() {
  const out = [];
  for (const scene of ['village', 'harbor', 'beach']) {
    for (const [mode, quality] of [['new', 'high'], ['new', 'low'], ['old', 'high']]) {
      const { page, ctx, errors } = await open({ scene, mode, quality, zoom: 1.0 });
      for (const t of [0, 1.7, 9.3]) await page.evaluate((tt) => window.__W.frame(tt), t);
      const info = await page.evaluate(() => window.__W.info());
      out.push({ scene, mode, quality, info, errors });
      await ctx.close();
    }
  }
  // canvas renderer fallback
  const { page, ctx, errors } = await open({ scene: 'village', mode: 'new', renderer: 'canvas' });
  await page.evaluate(() => window.__W.frame(2));
  await page.locator('canvas').screenshot({ path: path.join(TMP, 'canvas_fallback.png') });
  out.push({ scene: 'village', mode: 'new', renderer: 'canvas', info: await page.evaluate(() => window.__W.info()), errors });
  await ctx.close();
  return out;
}

// ------------------------------------------------------------------------------------------- frame strips
/** contact sheet of n frames dt apart (crop in canvas px) -> one PNG (python compose.py strip) */
async function seq(scene, o = {}) {
  const q = { scene, mode: o.mode || 'new', quality: o.quality || 'high', zoom: o.zoom || 1.0, w: o.w || 390, h: o.h || 844, dpr: o.dpr || 2 };
  const { page, ctx, errors } = await open(q);
  const n = +(o.n || 6), dt = +(o.dt || 0.5), t0 = +(o.t || 2);
  const crop = o.crop ? o.crop.split(',').map(Number) : null;
  const clip = crop ? { x: crop[0], y: crop[1], width: crop[2], height: crop[3] } : null;
  const files = [];
  for (let i = 0; i < n; i++) {
    const f = path.join(TMP, `seq_${scene}_${i}.png`);
    await shot(page, t0 + i * dt, f, clip);
    files.push(f);
  }
  await ctx.close();
  const out = o.out || path.join(TMP, `seq_${scene}.png`);
  execFileSync('python3', [path.join(ROOT, 'tools', 'test', 'water_lab', 'compose.py'), 'strip', out, String(o.cols || 3), ...files,
    ...Array.from({ length: n }, (_, i) => `t = ${(t0 + i * dt).toFixed(2)} s`)]);
  return { out, errors };
}

// ------------------------------------------------------------------------------------------- main
const main = async () => {
  let result;
  if (cmd === 'still') {
    result = await still(args[1] || 'village', { mode: opt('mode'), quality: opt('quality'), t: opt('t'), out: opt('out'), zoom: opt('zoom'), w: opt('w'), h: opt('h'), dpr: opt('dpr') });
  } else if (cmd === 'seq') {
    result = await seq(args[1] || 'village', { mode: opt('mode'), quality: opt('quality'), t: opt('t'), dt: opt('dt'), n: opt('n'), crop: opt('crop'), out: opt('out'), zoom: opt('zoom'), dpr: opt('dpr'), cols: opt('cols') });
  } else if (cmd === 'gifs') {
    result = [];
    for (const s of (opt('only') || 'village,harbor,beach').split(',')) result.push(await gif(s));
  } else if (cmd === 'beforeafter') result = await beforeAfter();
  else if (cmd === 'perf') result = await perf();
  else if (cmd === 'check') result = await check();
  else if (cmd === 'all') {
    result = { check: await check(), gifs: [], beforeAfter: await beforeAfter(), perf: await perf() };
    for (const s of ['village', 'harbor', 'beach']) result.gifs.push(await gif(s));
  }
  console.log(JSON.stringify(result, null, 1));
  await shutdown();
  const errs = JSON.stringify(result).match(/"errors":\[[^\]]/g);
  process.exit(errs ? 1 : 0);
};
main().catch(async (e) => { console.error(e); await shutdown(); process.exit(2); });
