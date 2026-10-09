// First-load measurement (BUILD-C2): what a first visit downloads and how long it waits, on an emulated phone
// network (Chrome DevTools throttling), from a fresh browser profile (empty cache, empty localStorage).
//   node tools/test/firstload.mjs [--net 4g|3g|none] [--game 20] [--out file.json] [--root dir]
// Phases:
//   boot   page load -> the Title scene is active (the loading bar and everything Preload fetched)
//   title  the title's first frame + whatever it streams during the next 6 s (the new title streams its intro)
//   start  taps until the Game + UI scenes run (first visit: tap = sound on, tap = skip, tap = start)
//   game   the first N real seconds of the village (after-title files: music, villagers, buildings ...)
// Bytes are encoded (on-the-wire) sizes of finished requests (CDP Network.loadingFinished).
import fs from 'node:fs';
import path from 'node:path';
import { start } from './serve.mjs';
import { launch, sleep } from './pw.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const NET = opt('--net', '4g');
const GAME_SEC = Number(opt('--game', '20'));
const OUT = opt('--out', '');
const ROOT = opt('--root', '');
const NETS = { '4g': { latency: 60, down: 9e6, up: 3e6 }, '3g': { latency: 150, down: 1.6e6, up: 0.75e6 }, none: null };

const srv = await start(0, { prefix: '/fl/', root: ROOT || undefined });
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ko-KR' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e && e.message || e)));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
const N = NETS[NET];
if (N) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: N.latency, downloadThroughput: N.down / 8, uploadThroughput: N.up / 8 });
const reqUrl = new Map();
let bytes = 0, files = 0;
const byKind = {};
const kindOf = (u) => {
  const m = /\/fl\/(assets\/([^/]+)\/|src\/title\/bake\/|lib\/|src\/|game\.js)/.exec(u);
  if (!m) return 'page';
  if (m[2]) return m[2];
  if (m[1].startsWith('src/title/bake')) return 'title_bake';
  if (m[1] === 'lib/') return 'lib';
  return 'code';
};
cdp.on('Network.requestWillBeSent', (e) => reqUrl.set(e.requestId, e.request.url));
cdp.on('Network.loadingFinished', (e) => {
  const u = reqUrl.get(e.requestId) || '';
  bytes += e.encodedDataLength; files++;
  const k = kindOf(u);
  (byKind[k] = byKind[k] || { n: 0, KB: 0 }).n++;
  byKind[k].KB += e.encodedDataLength / 1024;
});
const mark = (label, t0) => ({ label, s: +((Date.now() - t0) / 1000).toFixed(2), MB: +(bytes / 1048576).toFixed(2), files });
const marks = [];
const t0 = Date.now();
let fatal = null;
try {
  await page.goto(srv.url + 'index.html', { waitUntil: 'load', timeout: 300000 });
  await page.waitForFunction(() => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), null, { timeout: 600000, polling: 100 });
  marks.push(mark('boot: Title scene active', t0));
  // the title's first drawn frame (new title: its preload waited for the first-paint packs)
  await page.waitForFunction(() => { const g = window.__FV.game; const s = g.scene.getScene('Title'); return s && s.sys.settings.status >= 5 && g.loop.frame > 2; }, null, { timeout: 600000, polling: 100 });
  marks.push(mark('title: first frame', t0));
  const kindsAtTitle = JSON.parse(JSON.stringify(byKind));
  await sleep(6000);
  marks.push(mark('title: +6 s (intro stream)', t0));
  const c = await page.$('canvas');
  const b = await c.boundingBox();
  for (let i = 0; i < 12; i++) {
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height * 0.6);
    const ok = await page.waitForFunction(() => { const g = window.__FV && window.__FV.game; return g && g.scene.isActive('Game') && g.scene.isActive('UI'); }, null, { timeout: 4000, polling: 100 }).then(() => true).catch(() => false);
    if (ok) break;
  }
  marks.push(mark('start: Game + UI running', t0));
  await sleep(GAME_SEC * 1000);
  marks.push(mark('game: +' + GAME_SEC + ' s', t0));
  const tex = await page.evaluate(() => { const g = window.__FV.game; let b = 0; for (const k in g.textures.list) { if (/^__/.test(k)) continue; for (const s of g.textures.list[k].source) b += s.width * s.height * 4; } return +(b / 1048576).toFixed(1); });
  for (const k in byKind) byKind[k].KB = Math.round(byKind[k].KB);
  for (const k in kindsAtTitle) kindsAtTitle[k].KB = Math.round(kindsAtTitle[k].KB);
  const out = { net: NET, root: ROOT || 'frost-village', marks, texturesMiBAfterGame: tex, byKindAtTitle: kindsAtTitle, byKindTotal: byKind, errors: errors.slice(0, 5) };
  console.log(JSON.stringify(out, null, 1));
  if (OUT) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); }
} catch (e) { fatal = e; console.log('FATAL', e && e.stack || e, JSON.stringify(marks)); }
await browser.close();
await srv.close();
process.exit(fatal ? 1 : 0);
