// Title lab: the living title (src/title/**) in headless Chromium with the game's REAL boot + preload
// (src/scenes/Boot.js, src/scenes/Preload.js -> Assets.js) and a stub 'Game' scene.
//
//   node tools/test/title_lab.mjs                 all: intro capture (390x844), stills, 360x640, checks, perf
//   node tools/test/title_lab.mjs --quick         checks + stills only (no video)
//   node tools/test/title_lab.mjs --out <dir>     where frames go (default: $TMPDIR/title_lab)
//
// Deterministic: the game loop runs on the fixed-step clock of tools/test/fv_step.mjs (60 steps per game
// second, Date.now follows) and Math.random is seeded, so every run renders the same frames.
// Writes docs/previews/title_intro.mp4, title_intro.gif (phone size, <= 8 MB), title_stage_1..4.png,
// title_idle_city_night.png, title_*_360x640.png, title_grow.png, title_reduced.png, and
// <out>/title_lab.json (checks, perf, memory). Exit 1 when a check fails.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { start } from './serve.mjs';
import { loadPlaywright } from './pw.mjs';
import { installStepper, render } from './fv_step.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREV = path.join(ROOT, 'docs', 'previews');
const args = process.argv.slice(2);
const QUICK = args.includes('--quick');
const oi = args.indexOf('--out');
const OUT = path.resolve(oi >= 0 ? args[oi + 1] : path.join(process.env.TMPDIR || '/tmp', 'title_lab'));
const FPS = 30;              // must divide 60 (the fixed clock runs 60 steps per game second)

const HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#dbe6f2}#game{position:fixed;inset:0}#game canvas{display:block}</style>
<script>(function(){var s=20261009;Math.random=function(){s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};})();</script>
<script src="lib/phaser.min.js"></script></head><body><div id="game"></div>
<script type="module">
import { Boot } from './src/scenes/Boot.js';
import { Preload } from './src/scenes/Preload.js';
import { TitleScene } from './src/title/TitleScene.js';
import { TitleAssets } from './src/title/TitleAssets.js';
import { View, MAX_RENDER_SCALE } from './src/core/View.js';
// --- same view maths as src/main.js
const W = 720, MIN_H = 1280, MAX_H = 1600;
function logicalHeight() { const iw = window.innerWidth || W, ih = window.innerHeight || MIN_H; return Math.max(MIN_H, Math.min(MAX_H, Math.round((W * ih) / Math.max(1, iw)))); }
const h = logicalHeight();
const iw = window.innerWidth || W, ih = window.innerHeight || h;
const cssW = Math.max(1, Math.min(iw, (ih * W) / h));
const dpr = window.devicePixelRatio || 1;
View.W = W; View.H = h;
View.k = Math.round(Math.max(1, Math.min(MAX_RENDER_SCALE, (cssW * dpr) / W)) * 20) / 20;
class GameStub extends Phaser.Scene { constructor() { super('Game'); } create() { window.__LAB.started = true; this.cameras.main.setBackgroundColor('#cfe0f1'); } }
window.__LAB = { started: false, TitleAssets };
const game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: Math.round(View.W * View.k), height: Math.round(View.H * View.k),
  backgroundColor: '#dbe6f2', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false, roundPixels: false }, input: { activePointers: 3 }, fps: { target: 60, smoothStep: true },
  banner: false, scene: [Boot, Preload, TitleScene, GameStub] });
window.__FV = { game };
</script></body></html>`;

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox', '--js-flags=--expose-gc', '--enable-precise-memory-info'] });
const srv = await start(0, { prefix: '/fv/' });
const report = { checks: {}, errors: [], perf: {}, memory: {}, files: {} };
const fail = [];
const check = (name, ok, info) => { report.checks[name] = { ok: !!ok, info }; if (!ok) fail.push(name); console.log((ok ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };

async function open(vp, query = '', init = null, initArg) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr || 2, isMobile: true, hasTouch: true, locale: 'ko-KR' });
  if (init) await ctx.addInitScript(init, initArg);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + (e && e.stack ? e.stack : e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !/assets\/title\//.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
  await page.route('**/fv/__title_lab.html*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  await page.goto(srv.url + '__title_lab.html' + query, { waitUntil: 'load' });
  // real time: let the boot + preload + title stream everything in
  await page.waitForFunction(() => {
    const T = window.__TITLE; if (!T) return false;
    const st = window.__LAB.TitleAssets.state;
    return [1, 2, 3, 4].every((g) => st[g] === 'ready' || g > T.cap) && window.__LAB.TitleAssets.artSettled();
  }, null, { timeout: 180000 });
  await installStepper(page);
  await page.evaluate(() => { window.__FV.scene = window.__FV.game.scene.getScene('Title'); });
  return { ctx, page, errs };
}

const step = (page, sec) => page.evaluate((s) => window.__step.run(s), sec);
const shot = async (page, file) => { await render(page, 2); await page.screenshot({ path: file }); };
const state = (page) => page.evaluate(() => window.__TITLE.state());

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PREV, { recursive: true });

// ------------------------------------------------------------------ 1) phone 390 x 844: intro capture
{
  const vp = { w: 390, h: 844, dpr: 2 };
  const { ctx, page, errs } = await open(vp, '?intro=0');
  const s0 = await state(page);
  check('loads: all 4 stage groups ready', [1, 2, 3, 4].every((g) => s0.groups[g] === 'ready'), s0.groups);
  check('fresh player: idle title shows stage 1', s0.stage === 1 && s0.saveStage === 1, s0);
  await page.evaluate(() => window.__TITLE.replayIntro());
  const frames = path.join(OUT, 'frames');
  fs.rmSync(frames, { recursive: true, force: true });
  fs.mkdirSync(frames, { recursive: true });
  const total = 14.0;
  const stills = { 2.4: 'title_stage_1.png', 4.9: 'title_stage_2.png', 7.4: 'title_stage_3.png', 9.7: 'title_stage_4.png' };
  const stillAt = Object.keys(stills).map(Number);
  let n = 0;
  const t0 = Date.now();
  for (let f = 0; f < total * FPS; f++) {
    const t = (f + 1) / FPS;
    if (QUICK) await step(page, 1 / FPS);
    else {
      // advance to the frame time and draw exactly one frame, read straight from the canvas (no compositor)
      const url = await page.evaluate((k) => { for (let i = 1; i < k; i++) window.__step.run(1 / 60); window.__step.frame(); return window.__FV.game.canvas.toDataURL('image/jpeg', 0.92); }, 60 / FPS);
      fs.writeFileSync(path.join(frames, String(n++).padStart(4, '0') + '.jpg'), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
      if (f % 30 === 0) console.log(`[lab] frame ${f} / ${total * FPS}`);
    }
    // stills: the canvas already shows this frame (video mode); quick mode draws one first
    for (const st of stillAt) if (Math.round(st * FPS) === f + 1) { if (QUICK) await render(page, 1); await page.screenshot({ path: path.join(PREV, stills[st]) }); }
  }
  console.log(`[lab] intro rendered in ${((Date.now() - t0) / 1000).toFixed(0)} s (${n} frames)`);
  const s1 = await state(page);
  check('intro: ends in the idle title at stage 4 with logo + start pill', s1.mode === 'idle' && s1.stage === 4 && s1.logo && s1.tap, s1);
  await step(page, 2.0);
  await shot(page, path.join(PREV, 'title_idle_city_night.png'));
  // perf: logic-only steps and full frames on the busiest state (stage 4, night, everything moving)
  report.perf.update = await page.evaluate(() => window.__step.bench(240));
  report.perf.frame = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < 90; i++) { const a = performance.now(); window.__step.frame(); out.push(performance.now() - a); }
    out.sort((x, y) => x - y);
    return { avg: +(out.reduce((s, x) => s + x, 0) / out.length).toFixed(2), p50: +out[45].toFixed(2), p95: +out[85].toFixed(2) };
  });
  report.perf.objects = await page.evaluate(() => window.__FV.scene.children.length);
  // per-frame allocations: heap after GC, before / after 20 s of title updates
  report.memory.heap = await page.evaluate(() => {
    if (!window.gc) return null;
    window.gc(); const a = performance.memory.usedJSHeapSize;
    window.__step.run(20); window.gc(); const b = performance.memory.usedJSHeapSize;
    return { before: a, after: b, growthKB: +((b - a) / 1024).toFixed(1) };
  });
  // texture memory of the title (everything it added), then start the game: all of it must be gone
  const tex = () => page.evaluate(() => {
    const tm = window.__FV.game.textures; let bytes = 0; const keys = [];
    for (const k of Object.keys(tm.list)) {
      if (!/^ttl_/.test(k)) continue;           // every title texture (bake, title art, stand-ins) is ttl_*
      const t = tm.list[k]; let b = 0;
      for (const src of t.source) b += src.width * src.height * 4;
      bytes += b; keys.push(k);
    }
    return { MB: +(bytes / 1048576).toFixed(1), count: keys.length, keys };
  });
  report.memory.titleTextures = await tex();
  report.artLoaded = await page.evaluate(() => Array.from(window.__LAB.TitleAssets.artKeys));
  check('title texture memory <= 60 MB', report.memory.titleTextures.MB <= 60, report.memory.titleTextures.MB);
  // baseline: an empty scene of the same size renders this fast
  await page.evaluate(() => window.__TITLE.tap());
  await step(page, 1.2);
  const started = await page.evaluate(() => window.__LAB.started);
  check('tap on the idle title starts the game', started);
  report.perf.baselineFrame = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < 60; i++) { const a = performance.now(); window.__step.frame(); out.push(performance.now() - a); }
    out.sort((x, y) => x - y);
    return { avg: +(out.reduce((s, x) => s + x, 0) / out.length).toFixed(2), p50: +out[30].toFixed(2) };
  });
  const after = await tex();
  check('title textures released when the game starts', after.count === 0, after);
  report.errors.push(...errs);
  check('no page errors (390x844)', errs.length === 0, errs.slice(0, 5));
  await ctx.close();

  if (!QUICK && n) {
    const mp4 = path.join(PREV, 'title_intro.mp4');
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, '%04d.jpg'), '-vf', 'scale=720:-2:flags=lanczos',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '21', '-preset', 'slow', '-movflags', '+faststart', mp4]);
    const gif = path.join(PREV, 'title_intro.gif');
    const pal = path.join(OUT, 'pal.png');
    const tryGif = (w, fps, colors) => {
      const vf = `fps=${fps},scale=${w}:-2:flags=lanczos`;
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, '%04d.jpg'), '-vf', `${vf},palettegen=max_colors=${colors}:stats_mode=diff`, pal]);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(frames, '%04d.jpg'), '-i', pal, '-lavfi', `${vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, gif]);
      return fs.statSync(gif).size;
    };
    let size = tryGif(360, 15, 192);
    if (size > 8 * 1048576) size = tryGif(320, 12, 160);
    if (size > 8 * 1048576) size = tryGif(300, 10, 128);
    report.files.mp4 = fs.statSync(mp4).size; report.files.gif = size;
    check('gif <= 8 MB', size <= 8 * 1048576, (size / 1048576).toFixed(2) + ' MB');
  }
}

// ------------------------------------------------------------------ 2) small phone 360 x 640 (16:9): idle + intro stills
{
  const vp = { w: 360, h: 640, dpr: 2 };
  const { ctx, page, errs } = await open(vp, '?intro=0');
  await page.evaluate(() => window.__TITLE.replayIntro());
  await step(page, 4.95);
  await shot(page, path.join(PREV, 'title_stage_2_360x640.png'));
  await step(page, 7.5);
  await shot(page, path.join(PREV, 'title_idle_city_night_360x640.png'));
  const s = await state(page);
  check('360x640: intro reaches the idle city', s.mode === 'idle' && s.stage === 4, s);
  check('no page errors (360x640)', errs.length === 0, errs.slice(0, 5));
  report.errors.push(...errs);
  await ctx.close();
}

// ------------------------------------------------------------------ 3) returning player: save at the village stage, title last showed the camp
{
  const SAVE_STR = JSON.stringify({ v: 4, t: 1, coins: 500, progress: { done: { zone_forest: true, hire_fisherman: true }, celebrated: true } });
  const init = (str) => {
    // (init scripts run on every navigation of the context: only seed an empty storage)
    if (!localStorage.getItem('frostVillage.save.v1')) localStorage.setItem('frostVillage.save.v1', str);
    if (!localStorage.getItem('frostVillage.title.v1')) localStorage.setItem('frostVillage.title.v1', JSON.stringify({ introSeen: true, shown: 1 }));
  };
  const vp = { w: 390, h: 844, dpr: 2 };
  const { ctx, page, errs } = await open(vp, '', init, SAVE_STR);
  const s0 = await state(page);
  check('returning player: no intro, save stage 2 read from the save', s0.mode === 'idle' && s0.saveStage === 2, s0);
  await step(page, 2.2);
  await shot(page, path.join(PREV, 'title_grow.png'));
  await step(page, 3.0);
  const s1 = await state(page);
  check('returning player: the village grew to stage 2 on the title', s1.stage === 2, s1);
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('frostVillage.title.v1')));
  check('title prefs remember the shown stage', prefs && prefs.shown === 2, prefs);
  const save = await page.evaluate(() => localStorage.getItem('frostVillage.save.v1'));
  check('the save was not touched (same string)', save === SAVE_STR, save && save.length);
  await shot(page, path.join(PREV, 'title_idle_village.png'));
  check('no page errors (returning)', errs.length === 0, errs.slice(0, 5));
  report.errors.push(...errs);
  await ctx.close();
}

// ------------------------------------------------------------------ 4) reduced motion: static stage + fades, no intro
{
  const vp = { w: 390, h: 844, dpr: 2 };
  const { ctx, page, errs } = await open(vp, '?motion=0&intro=1');
  const s0 = await state(page);
  check('reduced motion: no intro', s0.mode === 'idle' && s0.reduced, s0);
  await step(page, 2.5);
  await shot(page, path.join(PREV, 'title_reduced.png'));
  check('no page errors (reduced)', errs.length === 0, errs.slice(0, 5));
  report.errors.push(...errs);
  await ctx.close();
}

// payload of the title (what it downloads beyond the game's own boot files)
{
  const dir = path.join(ROOT, 'src', 'title', 'bake');
  let bytes = 0;
  for (const f of fs.readdirSync(dir)) bytes += fs.statSync(path.join(dir, f)).size;
  report.payload = { bakeKB: +(bytes / 1024).toFixed(1) };
  const late = [['audio3', ['sfx_steam_whistle', 'sfx_bus_horn']], ['audio4', ['sfx_ship_horn_big', 'sfx_seagull_1']]];
  let lb = 0;
  for (const [frag, keys] of late) {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', frag, 'manifest.json'), 'utf8'));
    lb += fs.statSync(path.join(ROOT, 'assets', frag, 'manifest.json')).size;
    for (const k of keys) if (m.audio[k]) lb += fs.statSync(path.join(ROOT, 'assets', m.audio[k].files[0])).size;
  }
  report.payload.lateCuesKB = +(lb / 1024).toFixed(1);
  // the title_art files this phone actually fetched (logo of its language and scale, backdrop, fx)
  const artMan = path.join(ROOT, 'assets', 'title', 'manifest.json');
  if (fs.existsSync(artMan) && report.artLoaded) {
    const m = JSON.parse(fs.readFileSync(artMan, 'utf8'));
    let ab = fs.statSync(artMan).size;
    const files = {};
    for (const a of m.atlases || []) files[a.key] = [a.png, a.json];
    for (const a of (m.images || []).concat(m.spritesheets || [])) files[a.key] = [a.png];
    for (const k of report.artLoaded) for (const f of files[k] || []) if (fs.existsSync(path.join(ROOT, 'assets', f))) ab += fs.statSync(path.join(ROOT, 'assets', f)).size;
    report.payload.titleArtKB = +(ab / 1024).toFixed(1);
  }
  report.payload.totalKB = +(report.payload.bakeKB + report.payload.lateCuesKB).toFixed(1);
  check('title payload (bake + late cues) <= 1.5 MB', report.payload.totalKB <= 1536, report.payload);
}

console.log('[lab] perf', JSON.stringify(report.perf));
console.log('[lab] memory', JSON.stringify(report.memory));
fs.writeFileSync(path.join(OUT, 'title_lab.json'), JSON.stringify(report, null, 1));
console.log('[lab] report ' + path.join(OUT, 'title_lab.json'));
await browser.close();
await srv.close();
console.log(fail.length ? 'FAILED: ' + fail.join(', ') : 'all title checks passed');
process.exit(fail.length ? 1 : 0);
