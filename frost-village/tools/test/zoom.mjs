// v2 zoom test: two-finger pinch (real multi-touch events through CDP), the joystick finger turning
// into a pinch, mouse wheel (desktop), +/- buttons and the overview toggle.
//   node tools/test/zoom.mjs
import path from 'node:path';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';

const fail = [];
const check = (name, ok, info = '') => { console.log((ok ? '  ok  ' : ' FAIL ') + name + (info ? '  — ' + info : '')); if (!ok) fail.push(name); };
const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 } });
const zoom = () => page.evaluate(() => window.__FV.zoom());
const settle = async (ms = 1500) => { await sleep(ms); };
try {
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 90000);
  await sleep(800);
  await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 60000);
  await sleep(1500);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1, radiusX: 2, radiusY: 2, force: 1 })) });
  const cx = 195, cy = 500;
  // 1) finger 1 steers (joystick), finger 2 lands: pinch out (spread) -> zoom in, the chief stops
  const z0 = (await zoom()).target;
  const p0 = await page.evaluate(() => window.__FV.state().player);
  await touch('touchStart', [[cx - 40, cy]]);
  await touch('touchMove', [[cx - 70, cy + 10]]);
  await sleep(300);
  await touch('touchStart', [[cx - 70, cy + 10], [cx + 40, cy]]);
  for (let k = 1; k <= 8; k++) { await touch('touchMove', [[cx - 70 - k * 12, cy + 10], [cx + 40 + k * 12, cy]]); await sleep(60); }
  await settle(800);
  const z1 = (await zoom()).target;
  const joy = await page.evaluate(() => window.__FV.game.scene.getScene('UI').pinch !== null);
  await touch('touchEnd', []);
  await settle();
  check('pinch out zooms in', z1 > z0 * 1.2, `${z0} -> ${z1}`);
  check('second finger turned the joystick into a pinch', joy);
  const p1 = await page.evaluate(() => window.__FV.state().player);
  check('chief does not keep walking after the pinch', Math.hypot(p1.x - p0.x, p1.y - p0.y) < 120, `moved ${Math.round(Math.hypot(p1.x - p0.x, p1.y - p0.y))}`);
  // 2) pinch in -> zoom out, clamped
  await touch('touchStart', [[cx - 150, cy], [cx + 150, cy]]);
  for (let k = 1; k <= 12; k++) { await touch('touchMove', [[cx - 150 + k * 11, cy], [cx + 150 - k * 11, cy]]); await sleep(50); }
  await touch('touchEnd', []);
  await settle();
  const z2 = await zoom();
  check('pinch in zooms out (clamped to zoomMin)', z2.target < z1 && z2.target >= 0.55, JSON.stringify(z2));
  // 3) +/- buttons
  const c = await page.$('canvas'); const b = await c.boundingBox();
  const k = b.width / 720, H = b.height / k;
  const btn = async (dy) => { await page.touchscreen.tap(b.x + (720 - 56) * k, b.y + (H - 168 - dy) * k); await sleep(400); };
  const za = (await zoom()).target; await btn(160); const zb = (await zoom()).target;
  check('+ button', zb > za, `${za} -> ${zb}`);
  await btn(84); const zc = (await zoom()).target;
  check('- button', zc < zb, `${zb} -> ${zc}`);
  // 4) overview + back
  await btn(0); await settle(2500);
  const zo = await zoom();
  await page.screenshot({ path: path.join('/tmp', 'fv_zoom_overview.jpg'), type: 'jpeg', quality: 70 });
  check('overview shows the whole village', zo.overview && zo.target <= 0.45, JSON.stringify(zo));
  await btn(0); await settle(2000);
  const zr = await zoom();
  check('overview toggles back to the previous zoom', !zr.overview && Math.abs(zr.target - zc) < 0.02, JSON.stringify(zr));
  // 5) wheel (desktop context)
  const d = await openPage(browser, srv.url + 'index.html', { viewport: { width: 1000, height: 800 }, isMobile: false, hasTouch: false, dpr: 1 });
  await waitFor(d.page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 90000);
  await sleep(800);
  // (v4-C2) the first-run title intro: click = sound on, click = skip, click = start
  for (let i = 0; i < 10; i++) {
    await d.page.mouse.click(500, 480);
    if (await waitFor(d.page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 4000).then(() => true).catch(() => false)) break;
  }
  await waitFor(d.page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 60000).catch(() => {});
  await sleep(1500);
  const w0 = (await d.page.evaluate(() => window.__FV.zoom())).target;
  await d.page.mouse.move(500, 400);
  await d.page.mouse.wheel(0, -300); await sleep(500);
  const w1 = (await d.page.evaluate(() => window.__FV.zoom())).target;
  await d.page.mouse.wheel(0, 300); await d.page.mouse.wheel(0, 300); await sleep(500);
  const w2 = (await d.page.evaluate(() => window.__FV.zoom())).target;
  check('mouse wheel zooms in / out', w1 > w0 && w2 < w1, `${w0} -> ${w1} -> ${w2}`);
  check('no page errors (desktop)', d.log.errors.length === 0, d.log.errors.slice(0, 3).join(' | '));
} catch (e) { check('ran', false, e.stack || e.message); }
check('no page errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
await browser.close(); await srv.close();
console.log(fail.length ? `FAIL: ${fail.length}` : 'PASS');
process.exit(fail.length ? 1 : 0);
