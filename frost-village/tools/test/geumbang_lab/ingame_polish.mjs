// The critique's in-game findings, re-checked after the polish in the REAL v4.2 game (unpatched, the module added at
// runtime like ingame_dry.mjs) — and this time WITHOUT injecting depot stock: the racks are what v4.2 leaves them
// (the walk-in buyers empty them by day). Checks C1 (금방 takes orders and delivers by day; 금방 집하 brings full
// piles to the dock), H1 (households at home), H2 (정 할머니's order is never skipped), H6 (the 따라가기 caption goes),
// M6 (unpatched: 금방 coins counted as 물류창고 income), L2 (an upgrade with missing ingots is priced in coins),
// L6 (the app's 기사님 tab sets 금방 알림 / 문 앞 장면), L7 (the chip steps right of the 길 안내 badge).
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers nice -n 15 node tools/test/geumbang_lab/ingame_polish.mjs
// -> docs/previews/geumbang_lab_ingame_polish.json + geumbang_lab_ingame_polish_*.jpg
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from '../serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from '../pw.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews');
const SAVE = fs.readFileSync(path.join(ROOT, 'tools', 'test', 'fixtures', 'v41_save_smart_46min.json'), 'utf8');

const srv = await start();
const browser = await launch();
const res = { checks: {}, samples: [], shots: [], errors: [] };
const ok = (k, v, info) => { res.checks[k] = { ok: !!v, info }; console.log((v ? '  ok   ' : '  FAIL ') + k + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
try {
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: 2 });
  await page.evaluate((sv) => { try { localStorage.clear(); localStorage.setItem('frostVillage.save.v1', sv); } catch (e) { /* */ } }, SAVE);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 180000);
  await sleep(1500);
  await page.evaluate(() => {
    const game = window.__FV.game; game.loop.sleep();
    let T = game.loop.time || performance.now(); const DT = 1000 / 60;
    window.__run = (sec) => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { T += DT; game.headlessStep(T, DT); } };
    window.__draw = () => { T += DT; game.step(T, DT); };
  });
  const run = async (sec) => { for (let s = 0; s < sec; s += 5) await page.evaluate((d) => window.__run(d), Math.min(5, sec - s)); };
  const warm = async (sec) => { await page.evaluate(() => window.__FV.game.loop.wake()); await sleep(sec * 1000); await page.evaluate(() => window.__FV.game.loop.sleep()); };
  const until = async (fn, maxS, chunk = 1) => { for (let t = 0; t < maxS; t += chunk) { if (await page.evaluate(fn)) return true; await run(chunk); } return false; };
  const shot = async (name, cam) => {
    if (cam) await page.evaluate((c) => window.__FV.camera(c.x, c.y, c.z), cam);
    await page.evaluate(() => { for (let i = 0; i < 12; i++) window.__draw(); });
    const file = 'geumbang_lab_ingame_polish_' + name + '.jpg';
    await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 84, timeout: 120000 });
    res.shots.push(file);
  };
  await warm(3);
  // the depot built — NO stock injected — the clock at 10:00
  await page.evaluate(() => {
    const F = window.__FV, gs = F.scene, v = gs.v42;
    if (v && !v.seen.whatsNew) { v.seen.whatsNew = 1; const ui = F.game.scene.getScene('UI'); if (ui.hud42 && ui.hud42.card && ui.hud42.closeCard) ui.hud42.closeCard(); }
    F.v42.depot({ build: true });
    const nb = gs.v4; if (nb && nb.clock) { if (!nb.clock.on && nb.clock.start) nb.clock.start(); nb.clock.set(10); }
    gs.economy.add(12000);
  });
  await warm(6);
  await until(() => { const d = window.__FV.scene.v42.depot; return !!(d && d.building && d.building.ready); }, 30);
  await page.evaluate(async () => {
    const mod = await import(new URL('src/geumbang/ports_v4.js', location.href).href);
    const gs = window.__FV.scene, v = gs.v42;
    const sys = v.add('gb', new mod.GeumbangSystem(gs, v, v.saved, null));
    if (sys.hooks) sys.hooks(window.__FV.v42);
    window.__gb = sys;
  });
  await run(1);
  await page.evaluate(() => { window.__gb.host.model.gateT = 1e9; });
  await run(1);
  await warm(8);
  const pad = await page.evaluate(() => { const s = window.__gb; return s.pad ? { x: s.pad.x, y: s.pad.y } : null; });
  let padS = null;
  if (pad) { const t0 = await page.evaluate(() => window.__FV.scene.time.now); await page.evaluate((p) => window.__FV.teleport(p.x, p.y), pad); await until(() => window.__gb.host.model.st >= 1, 300, 2); padS = Math.round((await page.evaluate(() => window.__FV.scene.time.now) - t0) / 1000); }
  res.padS = padS;
  const atOpen = await page.evaluate(() => { const gs = window.__FV.scene, d = gs.v42.depot, m = window.__gb.host.model; return { racks: d.total(), res: Object.assign({}, m.res), hour: +gs.v4.clock.hour().toFixed(2) }; });
  // H2: 정 할머니's order comes even when the racks are empty (her 장작 · 빵 set aside from racks / dock / log pile)
  const first = await until(() => window.__gb.host.model.orders.list.some((o) => o.first) || (window.__gb.host.model.seen & 2), 120, 1);
  ok('H2 first order placed with the racks as v4.2 leaves them', first, atOpen);
  // H6: after the first delivery the caption is gone (10 s after the follow ends)
  const delivered = await until(() => window.__gb.host.model.settle.tot[1] >= 1, 240, 1);
  await run(12);
  const cap = await page.evaluate(() => { const v = window.__gb.host.view, F = v && v.followV; return { active: !!(F && F.active), cap: !!(F && F.c && F.c.visible), doneT: F ? F.doneT : null }; });
  ok('H6 first delivered and the follow caption hidden afterwards', delivered && !cap.active && !cap.cap, cap);
  // H1: households at home (TownSim placeObj)
  const homes = await page.evaluate(() => { const s = window.__gb; let n = 0, sets = 0; for (const [, v] of s.homes) { sets++; if (v.size) n++; } const T = window.__FV.scene.v4.town; return { sets, nonEmpty: n, citizensIn: T.citizens.filter((c) => c.state === 'in').length }; });
  ok('H1 home sets non-empty', homes.nonEmpty > 0, homes);
  // one game day, sampled every 30 s: [hour, racks, buyers' sales today, 금방 orders today, delivered today, 집하 today, 금방 share, full piles]
  const t0 = await page.evaluate(() => window.__FV.scene.v4.clock.hour());
  let sledShot = false;
  for (let k = 0; k < 20; k++) {
    await run(30);
    const s = await page.evaluate(() => {
      const gs = window.__FV.scene, d = gs.v42.depot, m = window.__gb.host.model, T = m.settle.today;
      const piles = Object.values(gs.piles || {}).filter((p) => p && p.shown && p.enabled && p.stack).map((p) => p.stack.count / p.stack.max);
      const sl = (m.sleds || []).find((q) => q.st === 'cload' || q.st === 'cgo' || q.st === 'cback');
      return { h: +gs.v4.clock.hour().toFixed(1), racks: d.total(), sold: d.model.today.sales, gbOrders: T.orders, gbDel: T.delivered, col: T.col, share: Object.values(m.res).reduce((a, b) => a + b, 0), full: piles.filter((f) => f >= 0.85).length + '/' + piles.length, sled: sl ? { st: sl.st, x: Math.round(sl.x), y: Math.round(sl.y) } : null };
    });
    res.samples.push(s);
    console.log('   ', JSON.stringify(s));
    // (no capture of the sled here: without G-P6 the dog sled is not drawn — patched_dry.mjs captures it)
    if (!sledShot && s.sled && s.sled.st === 'cload') sledShot = true;
  }
  const last = res.samples[res.samples.length - 1];
  const tot = await page.evaluate(() => { const m = window.__gb.host.model; return { tot: m.settle.tot.slice(), col: m.settle.col, days: m.settle.days.slice() }; });
  ok('C1 금방 takes orders and delivers by day (10 game hours, racks as v4.2 leaves them)', tot.tot[0] >= 5 && tot.tot[1] >= 3, { from: +t0.toFixed(1), to: last.h, tot: tot.tot, days: tot.days });
  ok('C1 금방 집하 brought full-pile crates to the dock', tot.col > 0, { col: tot.col });
  // M6 (unpatched): 금방's coins counted as 물류창고 income (no inc_gb string without G-P16)
  const inc = await page.evaluate(() => Object.assign({}, window.__FV.scene.v42.office.income));
  ok('M6 unpatched: 금방 coins in the 물류창고 income bar', (inc.depot || 0) > 0 && !inc.gb, inc);
  // L2: an upgrade with ingots short is priced in coins
  const l2 = await page.evaluate(() => {
    const P = window.__gb.ports, s = window.__FV.scene.v42.depot.model.stock, have = s.count('item_ingot');
    const cost = { coins: 1000, item_ingot: have + 6 }, price = P.coins.price(cost);
    const c0 = window.__FV.scene.economy.coins, okSpend = P.coins.spend(cost), paid = c0 - window.__FV.scene.economy.coins;
    return { have, price, okSpend, paid, left: s.count('item_ingot') };
  });
  ok('L2 missing ingots are paid in coins (2 × price each)', l2.okSpend && l2.price > 1000 && l2.paid === l2.price && l2.left === 0, l2);
  // L6: the app's 기사님 tab sets the two 금방 settings
  const l6 = await page.evaluate(async () => {
    const { Settings } = await import(new URL('src/core/Save.js', location.href).href);
    const v = window.__gb.host.view; v.openApp('crew');
    window.__run(0.5);
    const texts = []; const walk = (l) => { for (const o of l) { if (o.type === 'Text' && o.visible) texts.push(o.text); if (o.list) walk(o.list); } }; walk(window.__FV.game.scene.getScene('UI').children.list);
    const S = window.__gb.ports.settings; S.setScenes(false); S.setAlerts('quiet');
    const after = { scenes: Settings.data.gbScenes, alerts: Settings.data.gbAlerts, port: S.scenes() + '/' + S.alerts() };
    S.setScenes(true); S.setAlerts('on');
    return { rows: texts.filter((x) => /금방 알림|문 앞 장면|켬|끔|조용히/.test(x)), after };
  });
  if (l6.rows.length) await shot('app_crew', null);
  await page.evaluate(() => { const v = window.__gb.host.view; if (v.app && v.app.close) v.app.close(); });
  ok('L6 the app shows 금방 알림 / 문 앞 장면 and sets them', l6.rows.includes('금방 알림') && l6.rows.includes('금방 문 앞 장면') && l6.after.scenes === false && l6.after.alerts === 'quiet', l6);
  // L7: the 길 안내 badge on the left column at the chip's height -> the chip steps right of it
  await run(0.2);
  const l7 = await page.evaluate(() => {
    const ui = window.__FV.game.scene.getScene('UI'), E = ui.hud42 && ui.hud42.edge, ch = window.__gb.host.view.chip;
    if (!E || !ch) return { none: true };
    const x0 = ch.c.x;
    E.setPosition(60, 480 + (ch.st || 0)).setVisible(true);
    const keepUpd = ui.hud42.updateEdge; ui.hud42.updateEdge = () => {};        // (the Navigator would hide it again)
    window.__run(1);
    const x1 = ch.c.x, hit1 = ch.hit.x, shown = ch.c.visible;
    E.setVisible(false); window.__run(1);
    const x2 = ch.c.x;
    ui.hud42.updateEdge = keepUpd;
    return { x0, x1: Math.round(x1), hit1: Math.round(hit1), x2: Math.round(x2), shown };
  });
  ok('L7 the chip steps right of the 길 안내 badge and back', !l7.none && (!l7.shown || (l7.x1 >= 160 && Math.abs(l7.x2 - l7.x0) < 2)), l7);
  res.errors = log.errors.slice(0, 30);
  ok('no page errors', !log.errors.length, log.errors.slice(0, 5));
  await page.close();
} catch (e) {
  res.errors.push('runner: ' + String(e && e.stack ? e.stack : e).split('\n').slice(0, 4).join(' | '));
  console.log(res.errors[res.errors.length - 1]);
}
fs.writeFileSync(path.join(OUT, 'geumbang_lab_ingame_polish.json'), JSON.stringify(res, null, 1));
const fails = Object.entries(res.checks).filter(([, v]) => !v.ok);
console.log(JSON.stringify({ checks: Object.keys(res.checks).length, fails: fails.map(([k]) => k), errors: res.errors.length }));
await browser.close();
await srv.close();
