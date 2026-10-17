// Snowbloom Village APK pipeline (tools/apk) — boot the game exactly as packed in an APK, in headless Chromium.
//
//   node tools/apk/test/boot_test.mjs <app.apk> [--out dir] [--play 60] [--work dir]
//
// What it mimics: the app's WebView loads https://appassets.androidplatform.net/index.html and every request of that
// origin is answered from the APK's assets/www/ by the app's own AssetRouter (served here by AssetServer.java, run on
// the JVM straight from the .apk file). Any other request is blocked, like the app without INTERNET permission.
// Phone: 390x844 CSS px, DPR 3, touch, ko-KR, an Android WebView user agent; window.claude is absent (no claude.ai
// host), so the resident chat must fall back to the offline village voice.
//
// Steps: title -> new game -> about 60 s of play with real touch input (CDP touch events on the floating joystick:
// fishing net -> grill -> shelf -> register -> cash) -> resident chat (tap, 수다 button, type, reply) -> the exit
// save MainActivity triggers (pagehide) -> reload -> continue with the same coins. Pass: every step ok, 0 page errors,
// 0 console errors, no 404 and no blocked request. Writes <out>/boot_test.json and screenshots.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync, execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APK_DIR = path.resolve(HERE, '..');
const ORIGIN = 'https://appassets.androidplatform.net';
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const APK = path.resolve(args.find((x, i) => !x.startsWith('--') && (i === 0 || !args[i - 1].startsWith('--'))) || '');
if (!APK || !fs.existsSync(APK)) { console.error('usage: node boot_test.mjs <app.apk> [--out dir] [--play 60] [--work dir]'); process.exit(2); }
const OUT = path.resolve(opt('--out', path.join(path.dirname(APK), 'boot_test')));
const PLAY_S = Number(opt('--play', '60'));
const WORK = path.resolve(opt('--work', fs.mkdtempSync(path.join(os.tmpdir(), 'snowbloom-boot-'))));
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(WORK, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try { return require('playwright'); } catch (e) { /* global */ }
  const roots = [];
  try { roots.push(execSync('npm root -g', { encoding: 'utf8' }).trim()); } catch (e) { /* */ }
  roots.push('/opt/node22/lib/node_modules', '/usr/local/lib/node_modules', '/usr/lib/node_modules');
  for (const r of roots) { try { return require(path.join(r, 'playwright')); } catch (e) { /* next */ } }
  throw new Error("the 'playwright' package is missing: npm i -g playwright && npx playwright install chromium");
}

// ------------------------------------------------------------------ the app's asset server (JVM, AssetRouter)
execFileSync('javac', ['--release', '11', '-encoding', 'UTF-8', '-d', WORK,
  path.join(APK_DIR, 'android/java/com/snowbloom/village/AssetRouter.java'), path.join(HERE, 'AssetServer.java')], { stdio: 'pipe' });
const selftest = JSON.parse(execFileSync('java', ['-cp', WORK, 'AssetServer', '--selftest', APK], { encoding: 'utf8' }).trim().split('\n').pop());
const server = spawn('java', ['-cp', WORK, 'AssetServer', APK, '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
const notFound = [];
const port = await new Promise((resolve, reject) => {
  let buf = '';
  server.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (line.startsWith('READY ')) resolve(Number(line.slice(6)));
      else if (line.startsWith('404 ')) notFound.push(line.slice(4));
    }
  });
  server.on('exit', (c) => reject(new Error('AssetServer exited ' + c)));
  setTimeout(() => reject(new Error('AssetServer did not start')), 30000);
});

// ------------------------------------------------------------------ browser
const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'] });
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 SnowbloomVillageApp/test';
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ko-KR', userAgent: UA });
const blocked = [];
let served = 0;
await ctx.route('**/*', async (route) => {
  const url = route.request().url();
  if (url.startsWith(ORIGIN + '/') || url === ORIGIN) {
    const u = new URL(url);
    const r = await fetch(`http://127.0.0.1:${port}${u.pathname}${u.search}`);
    const headers = {};
    for (const k of ['content-type', 'cache-control', 'access-control-allow-origin']) if (r.headers.get(k)) headers[k] = r.headers.get(k);
    served++;
    return route.fulfill({ status: r.status, headers, body: Buffer.from(await r.arrayBuffer()) });
  }
  blocked.push(url.slice(0, 160));
  return route.abort('internetdisconnected');       // the app has no INTERNET permission
});
const page = await ctx.newPage();
const log = { pageErrors: [], consoleErrors: [], warnings: [], failed: [], http: [] };
page.on('pageerror', (e) => log.pageErrors.push(String(e && e.stack ? e.stack.split('\n').slice(0, 6).join(' <- ') : e)));
page.on('console', (m) => {
  const tx = m.text();
  if (m.type() === 'error') log.consoleErrors.push(tx.slice(0, 300));
  else if (m.type() === 'warning' && !/GPU stall|swiftshader|WebGL|AudioContext was not allowed/i.test(tx)) log.warnings.push(tx.slice(0, 300));
});
page.on('requestfailed', (r) => log.failed.push(r.url().slice(0, 160) + ' ' + (r.failure() && r.failure().errorText)));
page.on('response', (r) => { if (r.status() >= 400) log.http.push(r.status() + ' ' + r.url()); });
const cdp = await ctx.newCDPSession(page);

const results = [];
const step = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : ''}`); };
const shot = (n) => page.screenshot({ path: path.join(OUT, n + '.jpg'), type: 'jpeg', quality: 78, timeout: 120000 }).catch(() => {});
const ev = (fn, arg) => page.evaluate(fn, arg);
const waitFor = (fn, timeout, arg) => page.waitForFunction(fn, arg, { timeout, polling: 150 });
const st = () => ev(() => window.__FV.state());
const where = (n) => ev((k) => window.__FV.where(k), n);
const count = (s, type) => s.player.stack.filter((x) => x === type).length;
const canvasBox = async () => (await page.waitForSelector('canvas', { timeout: 20000 })).boundingBox();
const tapCanvas = async (fy = 0.6) => { const b = await canvasBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height * fy); };

// real touches through the DevTools protocol (Phaser sees touchstart/touchmove/touchend like on a phone)
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }] });
const input = { touches: 0, moves: 0, teleports: 0 };
/** steer the chief with the floating joystick (a finger held down and moved) until he reaches the target */
async function touchWalkTo(target, { tol = 20, timeout = 30000 } = {}) {
  if (!target) return false;
  const b = await canvasBox();
  const ox = b.x + b.width / 2, oy = b.y + b.height * 0.62;
  await touch('touchStart', ox, oy); input.touches++;
  const t0 = Date.now();
  const trail = [];            // (time, position): stuck = moved < 3 px in the last 4 s (a slow, loaded machine runs the game at a few fps)
  let reached = false;
  while (Date.now() - t0 < timeout) {
    const s = (await st()).player;
    const dx = target.x - s.x, dy = target.y - s.y, d = Math.hypot(dx, dy * 2);
    if (d < tol) { reached = true; break; }
    const k = Math.min(1, d / 60) * 46, n = Math.hypot(dx, dy) || 1;
    await touch('touchMove', ox + (dx / n) * k, oy + (dy / n) * k); input.moves++;
    await sleep(120);
    const now = Date.now();
    trail.push({ t: now, x: s.x, y: s.y });
    while (trail.length && now - trail[0].t > 4000) trail.shift();
    if (now - t0 > 4000 && trail.length > 3 && Math.hypot(s.x - trail[0].x, s.y - trail[0].y) < 3) break;
  }
  await touch('touchEnd', ox, oy);
  if (!reached) {
    const s = (await st()).player;
    if (Math.hypot(target.x - s.x, (target.y - s.y) * 2) > tol * 1.6) {
      await ev(([x, y]) => window.__FV.teleport(x, y), [target.x, target.y]);   // a blocked path: same fallback as tools/test/pw.mjs
      input.teleports++;
    }
  }
  return reached;
}
async function waitTitle(limit = 180000) {
  const t1 = Date.now();
  while (!(await ev(() => !!(window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'))).catch(() => false))) {
    if (log.pageErrors.length) throw new Error('page error before the title: ' + log.pageErrors[0].split(' <- ')[0]);
    if (Date.now() - t1 > limit) throw new Error('title not reached in ' + limit / 1000 + ' s');
    await sleep(250);
  }
  return Date.now() - t1;
}
async function startGame() {
  for (let i = 0; i < 10; i++) {
    await tapCanvas(0.6);
    const ok = await waitFor(() => (window.__FV.state && window.__FV.game.scene.isActive('UI')) || !window.__FV.game.scene.isActive('Title'), 6000).then(() => true, () => false);
    if (ok) { await waitFor(() => window.__FV.state && window.__FV.game.scene.isActive('UI'), 120000); return i + 1; }
  }
  throw new Error('tap to start did not reach the village');
}

const t0 = Date.now();
let fatal = null;
const facts = {};
try {
  await page.goto(ORIGIN + '/index.html', { waitUntil: 'load', timeout: 60000 });
  const env = await ev(() => {
    let ls = 'ok'; try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); } catch (e) { ls = 'throws ' + e.name; }
    return { origin: location.origin, secure: window.isSecureContext, compat: document.compatMode, ls, claude: typeof window.claude,
      viewport: (document.querySelector('meta[name=viewport]') || {}).content, dpr: devicePixelRatio, w: innerWidth, h: innerHeight };
  });
  facts.env = env;
  step('page on the virtual origin (secure context, standards mode, localStorage, no window.claude)',
    env.origin === ORIGIN && env.secure && env.compat === 'CSS1Compat' && env.ls === 'ok' && env.claude === 'undefined', env);
  const titleMs = await waitTitle();
  await sleep(1500);
  await shot('1_title');
  const assets = await ev(() => {
    const g = window.__FV.game;
    const tex = ['char_player', 'props_buildings', 'ground_snow', 'fx_particles', 'ttl_1_0', 'ttl_ground_base'].filter((k) => !g.textures.exists(k));
    if (!['ttl_logo_main', 'ttl_logo_main_1x', 'ttl_logo_en', 'ttl_logo_en_1x'].some((k) => g.textures.exists(k))) tex.push('ttl_logo_*');
    return { missing: tex, renderer: g.renderer.type === 2 ? 'WebGL' : 'Canvas', loadingGone: !document.getElementById('fv-loading'), errBox: (document.getElementById('fv-error') || {}).textContent || '' };
  });
  step('title screen appears with its art', !assets.missing.length && assets.loadingGone && !assets.errBox, `${(titleMs / 1000).toFixed(1)} s, ${assets.renderer}${assets.missing.length ? ' MISSING ' + assets.missing.join(',') : ''}`);

  const taps = await startGame();
  const villageAt = Date.now();
  await sleep(1500);
  await shot('2_village');
  let s = await st();
  step('new game: tap to start -> village', s.market && s.market.queue >= 0 && typeof s.coins === 'number', `coins=${s.coins} taps=${taps}`);
  const audio = await ev(() => { const sm = window.__FV.game.sound; return { locked: sm.locked, ctx: sm.context ? sm.context.state : 'html5' }; });
  step('sound unlocked by the tap', !audio.locked, audio);

  // ---- about a minute of real play with the touch joystick
  const p0 = (await st()).player;
  await touchWalkTo(await where('net'), { tol: 18 });
  await waitFor(() => { const s = window.__FV.state(); return s.player.stack.length >= Math.min(4, s.player.capacity); }, 90000).catch(() => {});
  s = await st();
  step('touch joystick moves the chief; fishing at the net', Math.hypot(s.player.x - p0.x, s.player.y - p0.y) > 20 && count(s, 'item_fish_raw') >= 1,
    `moved ${Math.round(Math.hypot(s.player.x - p0.x, s.player.y - p0.y))} px, raw=${count(s, 'item_fish_raw')}`);
  await touchWalkTo((await where('op:grill')) || (await where('grillIn')), { tol: 14 });
  await waitFor(() => window.__FV.state().player.stack.filter((x) => x === 'item_fish_raw').length === 0, 60000).catch(() => {});
  await waitFor(() => { const g = window.__FV.state().stations.grill; return g.in === 0 && g.out > 0; }, 90000).catch(() => {});
  await touchWalkTo(await where('grillOut'), { tol: 18 });
  await waitFor(() => window.__FV.state().player.stack.some((x) => x === 'item_fish_cooked'), 60000).catch(() => {});
  await sleep(1200);
  s = await st();
  step('grilled fish picked up', count(s, 'item_fish_cooked') > 0, `cooked=${count(s, 'item_fish_cooked')}`);
  await shot('3_carry');
  await touchWalkTo(await where('shelf'), { tol: 18 });
  await waitFor(() => window.__FV.state().player.stack.length === 0, 60000).catch(() => {});
  if (await where('register')) await touchWalkTo(await where('register'), { tol: 16 });
  await waitFor(() => window.__FV.state().market.cash > 0, 180000).catch(() => {});
  s = await st();
  step('customers paid at the register', s.market.cash > 0, `cash=${s.market.cash}`);
  await touchWalkTo(await where('cash'), { tol: 18 });
  await waitFor(() => window.__FV.state().coins > 0, 60000).catch(() => {});
  await sleep(1000);
  s = await st();
  step('coins collected', s.coins > 0, `coins=${s.coins}`);
  await shot('4_coins');
  // keep playing (another round at the net and the grill) until a full minute has passed in the village
  let round = 0;
  while ((Date.now() - villageAt) / 1000 < PLAY_S && round < 6) {
    round++;
    await touchWalkTo(await where(round % 2 ? 'net' : 'shelf'), { tol: 18, timeout: 8000 });
    await sleep(1500);
  }
  const playedS = (Date.now() - villageAt) / 1000;
  const fps = await ev(() => Math.round(window.__FV.game.loop.actualFps));
  facts.fpsAfterPlay = fps;
  step(`played ${PLAY_S} s with touch input`, playedS >= PLAY_S && log.pageErrors.length === 0, { seconds: Math.round(playedS), fps, ...input });

  // ---- the resident chat: no claude.ai sample capability in the app -> the offline village voice
  if (!(await ev(() => window.__FV.scene.life.residents.some((r) => window.__FV.scene.residentChat.canChat(r))))) {
    for (let i = 0; i < 4; i++) await ev(() => window.__FV.lifeEvent('moveIn'));
    await sleep(4000);
  }
  const res = await ev(() => { const gs = window.__FV.scene; const r = gs.life.residents.find((x) => gs.residentChat.canChat(x) && !x.lod && !x.seat && !x.event); return r ? { key: r.key, x: r.x, y: r.y } : null; });
  let chatPath = 'none', chat = null, replied = false;
  if (res) {
    await touchWalkTo({ x: res.x + 60, y: res.y + 80 }, { tol: 30, timeout: 10000 });
    const r2 = await ev((k) => { const gs = window.__FV.scene; const r = gs.life.residents.find((x) => x.key === k); return r ? { x: r.x, y: r.y } : null; }, res.key);
    const k = r2 ? await ev(([x, y]) => window.__FV.tapWorld(x, y - 30), [r2.x, r2.y]) : null;
    // the 수다 button pops in (alpha / scale tween): wait until it has settled before aiming at it
    await waitFor(() => { const ui = window.__FV.game.scene.getScene('UI'), c = ui && ui.chatBtn; return c && c.visible && c.alpha > 0.97 && Math.abs(c.scale - 1) < 0.03; }, 5000).catch(() => {});
    // the 수다 button's centre in canvas pixels (UI camera transform), then in CSS pixels
    const btn = await ev(() => {
      const g = window.__FV.game, ui = g.scene.getScene('UI'), c = ui && ui.chatBtn;
      if (!c || !c.visible) return null;
      const cam = ui.cameras.main, r = c.getBounds();
      return { x: (r.centerX - cam.scrollX) * cam.zoom + cam.x, y: (r.centerY - cam.scrollY) * cam.zoom + cam.y, cw: g.canvas.width, ch: g.canvas.height };
    });
    if (k && btn) {
      const b = await canvasBox();
      await page.touchscreen.tap(b.x + btn.x * b.width / btn.cw, b.y + btn.y * b.height / btn.ch);
      chatPath = 'tap resident + tap 수다 button';
    }
    let opened = await waitFor(() => window.__FV.chat() && window.__FV.chat().open, 20000).then(() => true).catch(() => false);
    if (!opened) {
      await ev((key) => { const gs = window.__FV.scene; const r = gs.life.residents.find((x) => x.key === key); gs.residentChat.open(r); }, res.key);
      chatPath = (k && btn ? 'button tap missed; ' : 'button not shown; ') + 'residentChat.open(resident)';
      opened = await waitFor(() => window.__FV.chat() && window.__FV.chat().open, 45000).then(() => true).catch(() => false);
    }
    await sleep(1500);
    if (opened) {
      await shot('5_chat_open');
      const before = await ev(() => document.querySelectorAll('.fc-root .fc-bubble, .fc-root [class*="fc-msg"]').length);
      await page.fill('.fc-root input', '안녕하세요! 오늘 생선 많이 잡았어요');
      await page.keyboard.press('Enter');
      replied = await waitFor((n) => document.querySelectorAll('.fc-root .fc-bubble, .fc-root [class*="fc-msg"]').length >= n + 2, 30000, before).then(() => true).catch(() => false);
      await sleep(1500);
      await shot('6_chat_reply');
      chat = await ev(() => ({ chat: window.__FV.chat(), lastBubble: (Array.from(document.querySelectorAll('.fc-root .fc-bubble, .fc-root [class*="fc-msg"]')).pop() || {}).textContent }));
      await page.click('.fc-root .fc-close').catch(() => {});
      await sleep(800);
    }
    step('resident chat opens and answers in the offline village voice (no AI capability in the app)',
      opened && replied && chat && chat.chat.mode === 'offline', { resident: res.key, path: chatPath, mode: chat && chat.chat.mode, talks: chat && chat.chat.talks, reply: chat && String(chat.lastBubble || '').slice(0, 80) });
  } else step('resident chat opens and answers in the offline village voice', false, 'no resident who can chat');

  // ---- leaving the app: MainActivity fires pagehide before finish(); the game must save on it
  const coinsBefore = (await st()).coins;
  const saved = await ev(() => {
    localStorage.removeItem('frostVillage.save.v1');
    window.dispatchEvent(new Event('pagehide'));
    const raw = localStorage.getItem('frostVillage.save.v1');
    let coins = null; try { coins = JSON.parse(raw).coins; } catch (e) { /* */ }
    return { bytes: raw ? raw.length : 0, coins, keys: Object.keys(localStorage).filter((k) => k.startsWith('frostVillage')) };
  });
  step('exit save: pagehide writes the save to localStorage', saved.bytes > 200, saved);
  const talksBefore = chat && chat.chat ? chat.chat.talks : 0;
  await page.reload({ waitUntil: 'load', timeout: 60000 });
  await waitTitle();
  await sleep(1500);
  await shot('7_title_again');
  await startGame();
  await sleep(1500);
  const after = await st();
  const chatAfter = await ev(() => window.__FV.scene.residentChat.ensure().then(() => window.__FV.chat())).catch(() => null);
  await shot('8_continued');
  step('reload continues the village (same coins, chat memory kept)', after.coins === coinsBefore && (!talksBefore || (chatAfter && chatAfter.talks >= talksBefore)),
    { before: coinsBefore, after: after.coins, talksBefore, talksAfter: chatAfter && chatAfter.talks });
} catch (e) {
  fatal = String(e && e.message || e).split('\n')[0];
  step('run', false, fatal);
  await shot('9_error');
}

const errs = log.pageErrors.concat(log.consoleErrors);
step('0 page errors, 0 console errors', errs.length === 0, errs.slice(0, 6).join(' | '));
step('no 404 and no failed request', !notFound.length && !log.http.length && !log.failed.length, notFound.concat(log.http, log.failed).slice(0, 6).join(' | '));
step('no request left the virtual origin (the app has no INTERNET permission)', blocked.length === 0, blocked.slice(0, 6).join(' | '));
step('AssetRouter self-test (every packed file routes with a known type)', selftest.failures.length === 0 && selftest.files > 0, { files: selftest.files, types: selftest.types, failures: selftest.failures.slice(0, 4) });
const summary = {
  apk: path.basename(APK), ok: !fatal && results.every((r) => r.ok), seconds: Math.round((Date.now() - t0) / 1000),
  device: { viewport: '390x844', dpr: 3, touch: true, ua: UA }, served, notFound, blocked, warnings: [...new Set(log.warnings)].slice(0, 12),
  facts, steps: results,
};
fs.writeFileSync(path.join(OUT, 'boot_test.json'), JSON.stringify(summary, null, 1));
console.log(`\n${summary.ok ? 'PASS' : 'FAIL'}  ${results.filter((r) => r.ok).length}/${results.length} steps, ${served} files served, ${summary.seconds} s  -> ${path.relative(process.cwd(), OUT)}`);
await browser.close();
server.kill();
process.exit(summary.ok ? 0 : 1);
