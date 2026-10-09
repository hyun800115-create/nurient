// The title on a throttled phone network (Chrome DevTools network emulation, cache off), first visit
// (the intro) or a returning player, with and without the Preload wiring of docs/build_reports/title_code.md §2.
//
//   node tools/test/title/title_net.mjs [raw|wired] [4g|3g] [intro|camp|city] [--out file.json]
//
// Marks (ms since navigation): preloadCreate (the game's loading bar), titleCreate (the title's first frame),
// g2..g4 / night / city / parts (streamed packs ready), and for the intro how long its director waited in
// all (holdModel, modelled at 60 fps from the marks) - people keep moving meanwhile. Prints one JSON line.
import fs from 'node:fs';
import { start } from '../serve.mjs';
import { loadPlaywright } from '../pw.mjs';

const args = process.argv.slice(2).filter((a, i, all) => !a.startsWith('--') && !(all[i - 1] || '').startsWith('--'));
const mode = args[0] || 'raw';
const net = args[1] || '4g';
const who = args[2] || 'intro';
const oi = process.argv.indexOf('--out');
const OUT = oi >= 0 ? process.argv[oi + 1] : null;
const NETS = { '4g': { down: 9e6 / 8, up: 1.5e6 / 8, lat: 60 }, '3g': { down: 1.6e6 / 8, up: 0.75e6 / 8, lat: 150 } };

const HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#dbe6f2}#game{position:fixed;inset:0}</style>
<script src="lib/phaser.min.js"></script></head><body><div id="game"></div>
<script type="module">
import { Boot } from './src/scenes/Boot.js';
import { Preload } from './src/scenes/Preload.js';
import { TitleScene } from './src/title/TitleScene.js';
import { TitleAssets } from './src/title/TitleAssets.js';
import { armAudioUnlock } from './src/title/audioUnlock.js';
import { View, MAX_RENDER_SCALE } from './src/core/View.js';
const W = 720, MIN_H = 1280, MAX_H = 1600;
const h = Math.max(MIN_H, Math.min(MAX_H, Math.round((W * innerHeight) / Math.max(1, innerWidth))));
const cssW = Math.max(1, Math.min(innerWidth, (innerHeight * W) / h));
View.W = W; View.H = h; View.k = Math.round(Math.max(1, Math.min(MAX_RENDER_SCALE, (cssW * devicePixelRatio) / W)) * 20) / 20;
const T = window.__T = { marks: {}, hold: 0 };
const mark = (k) => { if (!(k in T.marks)) T.marks[k] = Math.round(performance.now()); };
// the wiring of the integration doc §2, applied by subclassing (src/scenes/Preload.js stays untouched)
class PreloadWired extends Preload {
  preload() { super.preload(); TitleAssets.queueManifests(this.load); }
  create() {
    armAudioUnlock();
    const ld = this.load, orig = ld.start.bind(ld);
    // (= the doc's line right after Assets.queueAssets, before Preload's own load.start())
    ld.start = () => { ld.start = orig; TitleAssets.queueFirstPaint(ld); return orig(); };
    super.create();
  }
}
class GameStub extends Phaser.Scene { constructor() { super('Game'); } }
const P = __MODE__ === 'wired' ? PreloadWired : Preload;
class P2 extends P { create() { mark('preloadCreate'); super.create(); } }
Object.defineProperty(P2, 'name', { value: 'Preload' });
const game = new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: Math.round(View.W * View.k), height: Math.round(View.H * View.k),
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, banner: false, scene: [Boot, P2, TitleScene, GameStub],
  fps: { target: 60, limit: 8 } });      // (drawing at 8 fps keeps SwiftShader off the CPU: the marks are network-bound)
window.__FV = { game };
let lastHold = 0;
const poll = () => {
  const ts = game.scene.getScene('Title');
  if (ts && ts.sys.settings.status >= 2) mark('titleStart');       // the title scene began (its preload waits for the first paint)
  const S = window.__TITLE;
  if (S) {
    mark('titleCreate');
    for (const n of ['g2', 'g3', 'g4', 'art:night', 'art:city', 'art:parts']) if (TitleAssets.packReady(n)) mark(n);
    if (S.hold > lastHold) T.hold += S.hold - lastHold;
    lastHold = S.hold;
    T.mode = T.mode || S.mode; T.cap = S.cap;
    if (S.mode === 'idle') mark('idle');
    T.logoArt = !!(S.logo && S.logo.fromArt);
  }
  requestAnimationFrame(poll);
};
poll();
</script></body></html>`.replace('__MODE__', JSON.stringify(mode));

const SAVES = {
  intro: null,
  camp: { save: { v: 4, progress: { done: { grill: true } } }, shown: 1 },
  city: { save: { v: 4, progress: { celebrated: true, done: {} }, v4: { v: 1, rank: 3 } }, shown: 4 },
};
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const srv = await start(0, { prefix: '/fv/' });
// (dpr 1: the same files as @2x - the bake does not depend on k and the logo is @2x either way - at a quarter of the pixels)
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'ko-KR' });
if (SAVES[who]) await ctx.addInitScript((sv) => { localStorage.setItem('frostVillage.save.v1', JSON.stringify(sv.save)); localStorage.setItem('frostVillage.title.v1', JSON.stringify({ introSeen: true, shown: sv.shown })); }, SAVES[who]);
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
const n = NETS[net];
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: n.lat, downloadThroughput: n.down, uploadThroughput: n.up });
const resp = [];
const reqStart = {};
cdp.on('Network.requestWillBeSent', (e) => { reqStart[e.requestId] = { url: e.request.url, t: e.timestamp }; });
cdp.on('Network.loadingFinished', (e) => { const r = reqStart[e.requestId]; if (r) resp.push({ url: r.url.replace(/^.*\/fv\//, ''), bytes: e.encodedDataLength, t: e.timestamp }); });
await page.route('**/fv/__n.html*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
await page.goto(srv.url + '__n.html', { waitUntil: 'commit' });
// the intro: until the idle title; a returning player: until everything it streams is in
// (network-bound marks only: SwiftShader on a shared box may draw at ~1 fps, so the intro's own clock is not
// waited for; its waits at stage starts are modelled from the marks below, as on a phone at 60 fps)
try {
  await page.waitForFunction((w) => { const T = window.__T; if (!T || !('titleCreate' in T.marks)) return false;
    const need = w === 'intro' ? ['g2', 'g3', 'g4', 'art:night', 'art:city', 'art:parts'] : w === 'camp' ? ['art:night'] : [];
    return need.every((k) => k in T.marks); }, who, { timeout: 600000, polling: 250 });
} catch (e) {
  console.log('TIMEOUT', JSON.stringify(await page.evaluate(() => ({ T: window.__T, st: window.__TITLE && window.__TITLE.state(), scenes: window.__FV.game.scene.getScenes(true).map((s) => s.sys.settings.key), fps: window.__FV.game.loop.actualFps }))));
  throw e;
}
if (who !== 'intro') await page.waitForTimeout(4000);
const T = await page.evaluate(() => window.__T);
let boot = 0, title = 0;
const titleRe = /src\/title\/bake|assets\/title\//;
for (const r of resp) { if (titleRe.test(r.url)) title += r.bytes; else boot += r.bytes; }
const m = T.marks;
// the intro's director at 60 fps: stage n starts at stageStart[n-1] s after the title's first frame (+ the waits
// so far) and waits at most 2.5 s for its pack
let holdModel = null;
if (who === 'intro') {
  const starts = [0.35, 2.6, 5.0, 7.5];
  let shift = 0; holdModel = {};
  for (let g = 2; g <= 4; g++) {
    const due = m.titleCreate + (starts[g - 1] + shift) * 1000;
    const w = Math.min(2.5, Math.max(0, ((m['g' + g] || Infinity) - due) / 1000));
    holdModel['g' + g] = +w.toFixed(2); shift += w;
  }
  holdModel.total = +shift.toFixed(2);
}
const out = { mode, net, who, marks: m, titlePreloadMs: m.titleCreate - (m.titleStart || m.titleCreate), firstPaintAfterBarMs: m.titleCreate - m.preloadCreate, holdModel,
  titleMode: T.mode, logoArt: T.logoArt,
  bootKB: Math.round(boot / 1024), titleKB: Math.round(title / 1024), titleFiles: resp.filter((r) => titleRe.test(r.url)).map((r) => r.url) };
console.log(JSON.stringify(out));
if (OUT) fs.writeFileSync(OUT, JSON.stringify(Object.assign(out, { resp }), null, 1));
await browser.close(); await srv.close();
