// Title lab: the living title (src/title/**) in headless Chromium with the game's REAL boot + preload
// (src/scenes/Boot.js, src/scenes/Preload.js -> Assets.js) and a stub 'Game' scene.
//
//   node tools/test/title_lab.mjs                 all: intro capture (390x844), stills, 360x640, checks, perf
//   node tools/test/title_lab.mjs --quick         checks + stills only (no video)
//   node tools/test/title_lab.mjs --only a,b      only these sections: intro small returning reduced leak
//                                                 lowmem late sound saves payload
//   node tools/test/title_lab.mjs --out <dir>     where frames go (default: $TMPDIR/title_lab)
//   node tools/test/title_lab.mjs --prev <dir>    where stills / video go (default: docs/previews)
//
// Deterministic: the game loop runs on the fixed-step clock of tools/test/fv_step.mjs (60 steps per game
// second, Date.now follows) and Math.random is seeded, so every run renders the same frames.
// Writes docs/previews/title_intro.mp4, title_intro.gif (phone size, <= 8 MB), title_stage_1..4.png,
// title_idle_city_night.png, title_*_360x640.png, title_grow.png, title_idle_village.png, title_reduced.png,
// and <out>/title_lab.json (checks, perf, memory, payload). Exit 1 when a check fails.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { start } from './serve.mjs';
import { loadPlaywright } from './pw.mjs';
import { installStepper, render } from './fv_step.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const QUICK = args.includes('--quick');
const ONLY = arg('only', null) ? arg('only').split(',') : null;
const want = (n) => !ONLY || ONLY.includes(n);
const OUT = path.resolve(arg('out', path.join(process.env.TMPDIR || '/tmp', 'title_lab')));
const PREV = path.resolve(arg('prev', path.join(ROOT, 'docs', 'previews')));
const FPS = 30;              // must divide 60 (the fixed clock runs 60 steps per game second)
const ALL_PACKS = ['g1', 'g2', 'g3', 'g4', 'art:sky', 'art:night', 'art:fx', 'art:logo', 'art:shine', 'art:parts', 'art:pop', 'art:city', 'cues'];

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
import { Audio } from './src/core/Audio.js';
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
window.__LAB = { started: false, TitleAssets, Audio };
const game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: Math.round(View.W * View.k), height: Math.round(View.H * View.k),
  backgroundColor: '#dbe6f2', scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false, roundPixels: false }, input: { activePointers: 3 }, fps: { target: 60, smoothStep: true },
  banner: false, scene: [Boot, Preload, TitleScene, GameStub] });
window.__FV = { game };
</script></body></html>`;

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox', '--js-flags=--expose-gc', '--enable-precise-memory-info'] });
const srv = await start(0, { prefix: '/fv/' });
const report = { checks: {}, errors: [], perf: {}, memory: {}, files: {}, payload: {} };
const fail = [];
const check = (name, ok, info) => { report.checks[name] = { ok: !!ok, info }; if (!ok) fail.push(name); console.log((ok ? 'ok   ' : 'FAIL ') + name + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };

/**
 * open the lab page. opts: { query, init, initArg, hold (url regexp: those requests wait until released),
 * wait: 'first' (the title's first paint + its stream) | 'title' (the title exists) }
 */
async function open(vp, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: vp.dpr || 2, isMobile: vp.mobile !== false, hasTouch: vp.touch !== false, locale: 'ko-KR' });
  if (opts.init) await ctx.addInitScript(opts.init, opts.initArg);
  const page = await ctx.newPage();
  const errs = [], reqs = [], held = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + (e && e.stack ? e.stack : e)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400 && !/assets\/title\//.test(r.url())) errs.push('http ' + r.status() + ' ' + r.url()); });
  page.on('request', (r) => reqs.push(r.url().replace(/^.*\/fv\//, '')));
  await page.route('**/fv/__title_lab.html*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  if (opts.hold) await page.route(opts.hold, (r) => { held.push(r); });
  await page.goto(srv.url + '__title_lab.html' + (opts.query || ''), { waitUntil: 'load' });
  // real time: boot + preload + the title's first paint (+ what it streams) come in
  if (opts.wait === 'title') await page.waitForFunction(() => !!window.__TITLE, null, { timeout: 180000 });
  else await page.waitForFunction(() => !!window.__TITLE && window.__LAB.TitleAssets.idle(), null, { timeout: 180000 });
  await installStepper(page);
  await page.evaluate(() => { window.__FV.scene = window.__FV.game.scene.getScene('Title'); });
  return { ctx, page, errs, reqs, held };
}

/** fetch every pack the intro can use (real time, the game clock stays put) so the capture is deterministic */
async function loadAll(page) {
  await page.evaluate((all) => { window.__LAB.TitleAssets.request(window.__FV.scene.load, all); }, ALL_PACKS);
  await page.waitForFunction(() => window.__LAB.TitleAssets.idle(), null, { timeout: 180000 });
}

const step = (page, sec) => page.evaluate((s) => window.__step.run(s), sec);
const shot = async (page, file) => { await render(page, 2); await page.screenshot({ path: file }); };
const state = (page) => page.evaluate(() => window.__TITLE.state());
const ttlTex = (page) => page.evaluate(() => {
  const tm = window.__FV.game.textures; let bytes = 0; const keys = [];
  for (const k of Object.keys(tm.list)) {
    if (!/^ttl_/.test(k)) continue;           // every title texture (bake, title art, stand-ins) is ttl_*
    const t = tm.list[k]; let b = 0;
    for (const src of t.source) b += src.width * src.height * 4;
    bytes += b; keys.push(k);
  }
  return { MB: +(bytes / 1048576).toFixed(1), count: keys.length, keys };
});
const waitReal = (ms) => new Promise((r) => setTimeout(r, ms));
const bakeReq = (reqs, re) => reqs.filter((u) => re.test(u));

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(PREV, { recursive: true });

// ------------------------------------------------------------------ 0) save -> stage (the game's rank decides 읍 / 도시)
if (want('saves')) {
  const { stageFromSave } = await import(pathToFileURL(path.join(ROOT, 'src', 'title', 'progress.js')).href);
  const cases = [
    ['no save', null, 1],
    ['first steps', { v: 4, progress: { done: { grill: true } } }, 1],
    ['v2 village done', { v: 4, progress: { celebrated: true, done: {} } }, 2],
    ['v3 complete', { v: 4, progress: { celebrated: true, celebrated3: true, done: {} } }, 2],
    ['station repaired, rank 1', { v: 4, territory: { east: true, rail: true }, sites: { r_station: { b: 'station', st: 'done' } }, v4: { v: 1, rank: 1 } }, 2],
    ['town open, rank 1', { v: 4, territory: { rail: true, town: true }, v4: { v: 1, town: { open: true }, rank: 1 } }, 2],
    ['rank 2 (승격식)', { v: 4, v4: { v: 1, town: { open: true }, rank: 2 }, progress: { flags: { rankEup: true } } }, 3],
    ['rankEup flag only', { v: 4, progress: { flags: { rankEup: true } } }, 3],
    ['rank 3 (v5 city)', { v: 4, v4: { v: 1, rank: 3 } }, 4],
    ['top-level city key (not a contract)', { v: 4, city: { open: true } }, 1],
  ];
  const bad = cases.filter(([, s, want]) => stageFromSave(s) !== want).map(([n, s]) => n + ' -> ' + stageFromSave(s));
  check('save -> stage follows the game rank (v4.rank 2 = 읍, 3 = 도시)', bad.length === 0, bad.length ? bad : cases.length + ' cases');
}

// ------------------------------------------------------------------ 1) phone 390 x 844: idle first paint, then the intro capture
if (want('intro')) {
  const vp = { w: 390, h: 844, dpr: 2 };
  const { ctx, page, errs, reqs } = await open(vp, { query: '?intro=0' });
  const s0 = await state(page);
  check('fresh player: idle title shows stage 1', s0.stage === 1 && s0.saveStage === 1 && s0.mode === 'idle', s0);
  const fetched = bakeReq(reqs, /title(\/|_)bake\/ttl_(\d|ground)|assets\/title\/ttl_/);
  check('idle camp fetches only what it shows (no stage 2-4 bake, no logo parts, no far city)',
    !fetched.some((u) => /ttl_[234]_0|ttl_ground_s[234]|ttl_logo_parts|ttl_city_|ttl_fx_pop/.test(u)), fetched);
  report.memory.idleCamp = await ttlTex(page);
  check('idle camp: title textures <= 30 MB', report.memory.idleCamp.MB <= 30, report.memory.idleCamp.MB);
  await loadAll(page);
  await page.evaluate(() => window.__TITLE.replayIntro());
  const frames = path.join(OUT, 'frames');
  fs.rmSync(frames, { recursive: true, force: true });
  fs.mkdirSync(frames, { recursive: true });
  const total = 14.0;
  const stills = { 2.4: 'title_stage_1.png', 4.9: 'title_stage_2.png', 7.4: 'title_stage_3.png', 9.7: 'title_stage_4.png' };
  const stillAt = Object.keys(stills).map(Number);
  let n = 0;
  const t0 = Date.now();
  let maxHold = 0;
  for (let f = 0; f < total * FPS; f++) {
    if (QUICK) await step(page, 1 / FPS);
    else {
      // advance to the frame time and draw exactly one frame, read straight from the canvas (no compositor)
      const url = await page.evaluate((k) => { for (let i = 1; i < k; i++) window.__step.run(1 / 60); window.__step.frame(); return window.__FV.game.canvas.toDataURL('image/jpeg', 0.92); }, 60 / FPS);
      fs.writeFileSync(path.join(frames, String(n++).padStart(4, '0') + '.jpg'), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
      if (f % 30 === 0) console.log(`[lab] frame ${f} / ${total * FPS}`);
    }
    if (f % 15 === 0) maxHold = Math.max(maxHold, (await state(page)).hold);
    // stills: the canvas already shows this frame (video mode); quick mode draws one first
    for (const st of stillAt) if (Math.round(st * FPS) === f + 1) { if (QUICK) await render(page, 1); await page.screenshot({ path: path.join(PREV, stills[st]) }); }
  }
  console.log(`[lab] intro rendered in ${((Date.now() - t0) / 1000).toFixed(0)} s (${n} frames)`);
  const s1 = await state(page);
  check('intro: ends in the idle title at stage 4 with logo + start pill', s1.mode === 'idle' && s1.stage === 4 && s1.logo && s1.tap, s1);
  check('intro (everything loaded): the director never waits', maxHold === 0, maxHold);
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
  report.memory.titleTextures = await ttlTex(page);
  report.artLoaded = await page.evaluate(() => Array.from(window.__LAB.TitleAssets.artKeys));
  check('title texture memory (all 4 stages + art) <= 60 MB', report.memory.titleTextures.MB <= 60, report.memory.titleTextures.MB);
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
  const after = await ttlTex(page);
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

// ------------------------------------------------------------------ 2) small phone 360 x 640 (16:9): intro stills
if (want('small')) {
  const vp = { w: 360, h: 640, dpr: 2 };
  const { ctx, page, errs } = await open(vp, { query: '?intro=0' });
  await loadAll(page);
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
if (want('returning')) {
  const SAVE_STR = JSON.stringify({ v: 4, t: 1, coins: 500, progress: { done: { zone_forest: true, hire_fisherman: true }, celebrated: true } });
  const init = (str) => {
    // (init scripts run on every navigation of the context: only seed an empty storage)
    if (!localStorage.getItem('frostVillage.save.v1')) localStorage.setItem('frostVillage.save.v1', str);
    if (!localStorage.getItem('frostVillage.title.v1')) localStorage.setItem('frostVillage.title.v1', JSON.stringify({ introSeen: true, shown: 1 }));
  };
  const vp = { w: 390, h: 844, dpr: 2 };
  const { ctx, page, errs, reqs } = await open(vp, { init, initArg: SAVE_STR });
  const s0 = await state(page);
  check('returning player: no intro, save stage 2 read from the save', s0.mode === 'idle' && s0.saveStage === 2, s0);
  check('returning village player: no stage 3-4 bake fetched', !bakeReq(reqs, /ttl_[34]_0|ttl_ground_s[34]/).length, bakeReq(reqs, /title(\/|_)bake/));
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
if (want('reduced')) {
  const vp = { w: 390, h: 844, dpr: 2 };
  const { ctx, page, errs } = await open(vp, { query: '?motion=0&intro=1' });
  const s0 = await state(page);
  check('reduced motion: no intro', s0.mode === 'idle' && s0.reduced, s0);
  await step(page, 2.5);
  await shot(page, path.join(PREV, 'title_reduced.png'));
  check('no page errors (reduced)', errs.length === 0, errs.slice(0, 5));
  report.errors.push(...errs);
  await ctx.close();
}

// ------------------------------------------------------------------ 5) first visit: the first tap is sound, the second skips; cue timeline
if (want('sound')) {
  const vp = { w: 390, h: 844, dpr: 2 };
  const { ctx, page, errs } = await open(vp, { query: '?intro=1' });
  await loadAll(page);
  const a = await page.evaluate(() => ({ started: window.__LAB.Audio.started, mode: window.__TITLE.mode }));
  await step(page, 1.5);
  await page.evaluate(() => window.__TITLE.tap());
  const b = await page.evaluate(() => ({ started: window.__LAB.Audio.started, mode: window.__TITLE.mode, hint: window.__TITLE.ui.hintMode, music: window.__LAB.Audio.musicKey }));
  check('first visit: the first tap turns the sound on and the opening goes on', !a.started && b.started && b.mode === 'intro' && b.hint === 'again' && b.music === 'bgm_title', { a, b });
  await step(page, 0.5);
  await page.evaluate(() => window.__TITLE.tap());
  const c = await state(page);
  check('first visit: the second tap skips to the end', c.mode === 'idle' && c.tap, c);
  // the sound beats of the opening (Audio.play recorded): the train whistles in the 읍 beat, the big cues are spaced
  const cues = await page.evaluate(() => {
    const A = window.__LAB.Audio, T = window.__TITLE, out = [];
    A.started = true;
    A.play = (k, o) => { out.push([k, +T.t.toFixed(2)]); };
    A.playMusic = () => {};
    T.replayIntro();
    for (let i = 0; i < 12 * 60; i++) window.__step.run(1 / 60);
    const tr = T.dio.train;
    return { out, train: tr ? { head: +tr.head.toFixed(2), state: tr.state } : null };
  });
  const at = (k) => (cues.out.find((c2) => c2[0] === k) || [k, null])[1];
  const big = ['sfx_steam_whistle', 'sfx_bus_horn', 'sfx_ship_horn_big', 'sfx_levelup'].map(at).filter((x) => x !== null).sort((x, y) => x - y);
  const gaps = big.slice(1).map((x, i) => +(x - big[i]).toFixed(2));
  report.cues = cues;
  check('opening: the train whistles in the 읍 beat (5-7.5 s) and is at the station by the end', at('sfx_steam_whistle') >= 5 && at('sfx_steam_whistle') < 7.5 && cues.train && cues.train.state !== 'in',
    { whistle: at('sfx_steam_whistle'), train: cues.train });
  check('opening: whistle, bus, ferry horn and logo cues >= 0.6 s apart', big.length >= 4 && gaps.every((g) => g >= 0.6), { big, gaps });
  check('no page errors (sound)', errs.length === 0, errs.slice(0, 5));
  report.errors.push(...errs);
  await ctx.close();
}

// ------------------------------------------------------------------ 6) leak: the game starts while title files are still on their way
if (want('leak')) {
  const vp = { w: 390, h: 844, dpr: 2 };
  // first visit on a slow network: the stage 3-4 bake, the logo parts, the night sky and the far city are
  // still downloading (held here) when the player skips and starts. (a) downloads in flight are aborted;
  // (b) files that finish anyway (already downloaded, being decoded) are removed the moment they land.
  const hold = /\/fv\/((src\/title\/bake|assets\/title_bake)\/ttl_(3|4)_0|(src\/title\/bake|assets\/title_bake)\/ttl_ground_s[34]|assets\/title\/ttl_(logo_parts|city_|stars|aurora|moon|logo_main_shine|shine_band|fx_pop))/;
  for (const mode of ['abort', 'land']) {
    const { ctx, page, errs, held } = await open(vp, { query: '?intro=1', hold, wait: 'title' });
    await page.evaluate((all) => { window.__LAB.TitleAssets.request(window.__FV.scene.load, all); }, ALL_PACKS);
    await page.waitForFunction(() => window.__LAB.TitleAssets.ready(2), null, { timeout: 120000 });
    await waitReal(600);
    await step(page, 1.2);
    const heldUrls = held.map((r) => r.request().url().replace(/^.*\/fv\//, ''));
    // 'land': pretend every held file was already downloaded (nothing left to abort) - they will land late
    if (mode === 'land') await page.evaluate(() => window.__LAB.TitleAssets.files.clear());
    await page.evaluate(() => window.__TITLE.skipIntro());
    await step(page, 0.4);
    await page.evaluate(() => window.__TITLE.tap());
    await step(page, 1.0);
    const started = await page.evaluate(() => window.__LAB.started);
    const before = await ttlTex(page);
    for (const r of held) await r.continue().catch(() => {});
    await waitReal(3000);
    await step(page, 0.5);
    await waitReal(1500);
    await step(page, 0.5);
    const after = await ttlTex(page);
    check(`leak (${mode}): title files still loading when the game starts never stay in memory`, started && heldUrls.length >= 6 && before.count === 0 && after.count === 0,
      { started, held: heldUrls.length, before: before.MB, after: { MB: after.MB, keys: after.keys } });
    check(`no page errors (leak ${mode})`, errs.length === 0, errs.slice(0, 5));
    report.errors.push(...errs);
    await ctx.close();
  }
}

// ------------------------------------------------------------------ 7) low-memory phone: the intro ends at 읍, nothing of the city is fetched
if (want('lowmem')) {
  const vp = { w: 390, h: 844, dpr: 2 };
  const init = () => { try { Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 2, configurable: true }); } catch (e) { /* */ } };
  const { ctx, page, errs, reqs } = await open(vp, { query: '?intro=1', init });
  await page.waitForFunction(() => [1, 2, 3].every((g) => window.__LAB.TitleAssets.ready(g)), null, { timeout: 120000 });
  const trace = [];
  for (let i = 0; i < 70; i++) {
    await step(page, 0.2);
    const s = await state(page);
    trace.push([s.t, s.hold, s.stage]);
  }
  const s = await state(page);
  const chips = await page.evaluate(() => window.__TITLE.ui.chips.length);
  check('low memory: intro grows to 읍 (cap 3) and never waits for a city it will not load',
    s.cap === 3 && s.mode === 'idle' && s.stage === 3 && s.logo && chips === 3 && !bakeReq(reqs, /ttl_4_0|ttl_ground_s4|ttl_city_/).length && Math.max(...trace.map((x) => x[1])) === 0,
    { cap: s.cap, stage: s.stage, mode: s.mode, chips, maxHold: Math.max(...trace.map((x) => x[1])) });
  await shot(page, path.join(OUT, 'lowmem_end.png'));
  check('no page errors (lowmem)', errs.length === 0, errs.slice(0, 5));
  report.errors.push(...errs);
  await ctx.close();
}

// ------------------------------------------------------------------ 8) a late stage (slow network): the script waits, life does not, the town never shrinks
if (want('late')) {
  const vp = { w: 390, h: 844, dpr: 2 };
  const hold = /\/fv\/(src\/title\/bake|assets\/title_bake)\/(ttl_4_0|ttl_ground_s4)/   // ((v4-C2) the game serves the bake from assets/title_bake);
  const { ctx, page, errs, held } = await open(vp, { query: '?intro=1', hold, wait: 'title' });
  // everything but the city's bake comes in (the clock stands still meanwhile); then the intro starts over
  await page.evaluate((all) => { window.__LAB.TitleAssets.request(window.__FV.scene.load, all); }, ALL_PACKS);
  try {
    await page.waitForFunction(() => [1, 2, 3].every((g) => window.__LAB.TitleAssets.ready(g)) && ['art:sky', 'art:night', 'art:city', 'art:parts'].every((n) => window.__LAB.TitleAssets.settled(n)), null, { timeout: 120000 });
  } catch (e) {
    console.log(JSON.stringify(await page.evaluate(() => { const A = window.__LAB.TitleAssets, L = window.__FV.scene.load; return { packs: Object.fromEntries(Object.entries(A.packs).map(([k, v]) => [k, [v.state, v.keys]])), open: A.open, waiting: A.waiting, list: L.list.size, inflight: L.inflight.size, state: L.state }; })));
    throw e;
  }
  await page.evaluate(() => window.__TITLE.replayIntro());
  const trace = [];
  const shown = () => page.evaluate(() => window.__TITLE.dio.recs.filter((r) => r.shown && r.o.s >= 1 && r.o.s <= 3).length);
  let minShownAfter3 = 1e9, released = false;
  for (let i = 0; i < 75; i++) {
    await step(page, 0.2);
    const s = await state(page);
    const chief = await page.evaluate(() => { const w = window.__TITLE.dio.walkers[0]; return w ? +w.mx.toFixed(3) : null; });
    trace.push({ gt: +((i + 1) * 0.2).toFixed(1), t: s.t, hold: s.hold, stage: s.stage, chief });
    // (from the end of the 읍 pops until the city's pictures land)
    if (s.stage >= 3 && s.t >= 7.3 && s.groups[4] !== 'ready') minShownAfter3 = Math.min(minShownAfter3, await shown());
    if (!released && (i + 1) * 0.2 >= 11.5) { released = true; for (const r of held) await r.continue().catch(() => {}); await waitReal(2500); }
  }
  const holdRows = trace.filter((r) => r.hold > 0);
  const chiefMoves = holdRows.length > 2 && new Set(holdRows.map((r) => r.chief)).size > 2;
  const maxHold = Math.max(0, ...trace.map((r) => r.hold));
  report.late = { trace };
  check('late stage: the script waits <= 2.5 s while people keep walking', holdRows.length > 0 && maxHold <= 2.55 && chiefMoves, { maxHold, holdRows: holdRows.length, chiefMoves });
  const s3count = await page.evaluate(() => window.__TITLE.dio.recs.filter((r) => r.o.s >= 1 && r.o.s <= 3 && !(r.o.u && r.o.u <= 3)).length);
  check('late stage: the town keeps its buildings while the city is on its way', minShownAfter3 >= s3count && minShownAfter3 < 1e9, { minShownAfter3, stage3Objects: s3count });
  const s = await state(page);
  check('late stage: the city still arrives once its pictures land', s.stage === 4 && s.groups[4] === 'ready', s);
  check('no page errors (late)', errs.length === 0, errs.slice(0, 5));
  report.errors.push(...errs);
  await ctx.close();
}

// ------------------------------------------------------------------ 9) payload of the title (beyond the game's own boot files)
if (want('payload')) {
  const bake = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'title', 'bake', 'title_bake.json'), 'utf8'));
  const bsize = (f) => { try { return fs.statSync(path.join(ROOT, 'src', 'title', 'bake', f)).size; } catch (e) { return 0; } };
  const groupKB = {};
  for (const g of ['1', '2', '3', '4']) {
    const grp = bake.groups[g]; let b = 0;
    for (const k of grp.atlases) b += bsize(bake.files[k].png) + bsize(bake.files[k].json);
    for (const k of grp.images) b += bsize(bake.files[k].img);
    groupKB[g] = +(b / 1024).toFixed(1);
  }
  const manKB = +(bsize('title_bake.json') / 1024).toFixed(1);
  const dir = path.join(ROOT, 'src', 'title', 'bake');
  let bytes = 0;
  for (const f of fs.readdirSync(dir)) bytes += fs.statSync(path.join(dir, f)).size;
  report.payload.bakeKB = +(bytes / 1024).toFixed(1);
  report.payload.groupKB = groupKB; report.payload.bakeManifestKB = manKB;
  const late = [['audio3', ['sfx_steam_whistle', 'sfx_bus_horn']], ['audio4', ['sfx_ship_horn_big', 'sfx_seagull_1']]];
  let lb = 0;
  for (const [frag, keys] of late) {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', frag, 'manifest.json'), 'utf8'));
    lb += fs.statSync(path.join(ROOT, 'assets', frag, 'manifest.json')).size;
    for (const k of keys) if (m.audio[k]) lb += fs.statSync(path.join(ROOT, 'assets', m.audio[k].files[0])).size;
  }
  report.payload.lateCuesKB = +(lb / 1024).toFixed(1);
  // the title_art files per pack (this lab's phone: ko, @2x logo)
  const artMan = path.join(ROOT, 'assets', 'title', 'manifest.json');
  if (fs.existsSync(artMan)) {
    const { artRole } = await import(pathToFileURL(path.join(ROOT, 'src', 'title', 'TitleAssets.js')).href).catch(() => ({ artRole: null }));
    if (artRole) {
      const m = JSON.parse(fs.readFileSync(artMan, 'utf8'));
      const roles = {};
      const add = (key, files) => {
        const r = artRole(key); if (!r || /^ttl_logo_en|_1x$/.test(key)) return;
        let b = 0; for (const f of files) if (f && fs.existsSync(path.join(ROOT, 'assets', f))) b += fs.statSync(path.join(ROOT, 'assets', f)).size;
        roles[r] = +(((roles[r] || 0) * 1024 + b) / 1024).toFixed(1);
      };
      for (const a of m.atlases || []) if (a.loadAtTitle !== false) add(a.key, [a.png, a.json]);
      for (const a of (m.images || []).concat(m.spritesheets || [])) if (a.loadAtTitle !== false) add(a.key, [a.png]);
      report.payload.artKB = roles;
      report.payload.artManifestKB = +(fs.statSync(artMan).size / 1024).toFixed(1);
      const sum = (rs) => +rs.reduce((s, r) => s + (roles[r] || 0), 0).toFixed(1);
      report.payload.firstPaintKB = {
        intro: +(manKB + groupKB[1] + sum(['sky', 'fx', 'logo'])).toFixed(1),
        idleCamp: +(manKB + groupKB[1] + sum(['sky', 'fx', 'logo', 'shine'])).toFixed(1),
        idleCity: +(manKB + groupKB[1] + groupKB[2] + groupKB[3] + groupKB[4] + sum(['sky', 'fx', 'logo', 'shine', 'night', 'city'])).toFixed(1),
      };
    }
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
