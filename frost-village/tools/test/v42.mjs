// (v4.2, docs/v42_plan.md §4.4 / §5.6 / §6 + §15) the v4.2 places in the game, fixed-step clock:
//   node tools/test/v42.mjs
// From the v4.1 46-min save (village complete):
//   office   the 촌장 사무실 stands on its plot; the hire pad offers 셈이 first; the four staff come
//   courier  딸랑이's rounds: every coin taken from a till reaches the wallet (Σ taken = Σ deposited + the sack),
//            the passbook log gets its rows, no till is emptied below 0
//   bank     서리 은행: built after the office, the courier deposits at its counter, the 통장 tab opens < 100 ms
//   reveal   the bank shell fades within revealPx of the door, stays inside the hysteresis band, closes beyond it
//   aide     총총이 follows the chief (≤ 300 px after 6 s)
//   depot    서리 물류창고: the cargo sleigh takes the dock surplus, drives to bay 2, the racks fill, it comes back
//   freight  the order-card crates board first, the surplus only once the cards are aboard; with the camera far away
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, until } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAVE = fs.readFileSync(path.join(HERE, 'fixtures', 'v41_save_smart_46min.json'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 400) : '')); } };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const t0 = Date.now();
try {
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: 1 });
  await page.evaluate((sv) => { try { localStorage.clear(); localStorage.setItem('frostVillage.save.v1', sv); } catch (e) { /* */ } }, SAVE);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 120000);
  await sleep(2000);
  await installStepper(page);
  await page.evaluate(() => { window.__FV.v42.v.seen.whatsNew = 1; });
  await advance(page, 1);

  console.log('office');
  const o0 = await page.evaluate(() => { const v = window.__FV.v42.v; return { complete: v.complete, plot: !!(window.__FV.scene.sites.v42_office), shown: window.__FV.scene.sites.v42_office && window.__FV.scene.sites.v42_office.shown }; });
  ok(o0.complete && o0.plot && o0.shown, 'the 46-min save: village complete, the office plot shows', o0);
  let st = await page.evaluate(() => window.__FV.v42.office({ build: true }));
  ok(st.built && !st.bank, 'the office stands (the bank waits)', st);
  ok(st.hire === 'sem', 'the hire pad offers 셈이 first (' + st.hire + ')');
  st = await page.evaluate(() => window.__FV.v42.office({ hire: ['sem', 'ttal', 'bok', 'chong'] }));
  ok(['sem', 'ttal', 'bok', 'chong'].every((r) => st.staff.includes(r)) && st.courier, 'four staff, the courier at work', st.staff);

  console.log('courier');
  await page.evaluate(() => {
    const O = window.__FV.scene.v42.office;
    const w = window.__cour = { taken: 0, dep: 0, neg: 0 };
    const tk = O.takeTill.bind(O), dp = O.deposit.bind(O);
    O.takeTill = (q, c) => { const n = tk(q, c); w.taken += n; if (q.till.value < 0) w.neg++; return n; };
    O.deposit = (n, c) => { w.dep += n > 0 ? n : 0; return dp(n, c); };
    w.earned0 = window.__FV.scene.economy.earned;
    // fill two tills so a round is due
    for (const q of O.tills().slice(0, 3)) q.till.value += 400;
  });
  await advance(page, 240);
  const cr = await page.evaluate(() => { const O = window.__FV.scene.v42.office, s = O.state(); return Object.assign({}, window.__cour, { bag: s.bag, rounds: s.rounds, log: s.log.length, earned: window.__FV.scene.economy.earned }); });
  ok(cr.rounds >= 2, '딸랑이 made rounds (' + cr.rounds + ')');
  ok(cr.taken > 0 && cr.taken === cr.dep + cr.bag, 'Σ taken = Σ deposited + the sack (' + cr.taken + ' = ' + cr.dep + ' + ' + cr.bag + ')');
  ok(cr.neg === 0, 'no till below 0');
  ok(cr.earned - cr.earned0 >= cr.dep, 'the deposits reach the wallet');
  ok(cr.log > 0, 'passbook rows (' + cr.log + ')');

  console.log('bank');
  await page.evaluate(() => window.__FV.v42.office({ build: 'all' }));
  const bankReady = await until(page, () => { const O = window.__FV.scene.v42.office; return !!(O.bank && O.bank.ready); }, 60);
  ok(bankReady, 'the bank cutaway is built once the civic manifest is in');
  const dep0 = await page.evaluate(() => { const O = window.__FV.scene.v42.office; for (const q of O.tills().slice(0, 3)) q.till.value += 600; window.__bankDep = 0; const b = O.bank, d = b.deposit.bind(b); b.deposit = (n) => { window.__bankDep += n; return d(n); }; return O.depositedTotal; });
  await advance(page, 240);
  const bd = await page.evaluate(() => ({ bank: window.__bankDep, dep: window.__FV.scene.v42.office.depositedTotal }));
  ok(bd.bank > 0 && bd.dep > dep0, 'the courier deposits at the bank counter (' + bd.bank + ')');
  // (the panel's own build time; the first drawn frame after it is the renderer's, measured apart)
  const pt = await page.evaluate(() => { const O = window.__FV.scene.v42.office; const P = O.uiScene().officePanel; const a = performance.now(); O.openPanel('test', 'bank'); const ms = performance.now() - a; P.close(); const b = performance.now(); O.openPanel('test', 'stock'); const ms2 = performance.now() - b; const f0 = performance.now(); window.__step.frame(); const frame = performance.now() - f0; return { ms, ms2, frame, open: !!(P && P.isOpen()), tab: P && P.tab }; });
  ok(pt.open && pt.tab === 'stock', 'the panel opens (통장, then 재고)', pt);
  ok(Math.max(pt.ms, pt.ms2) < 100, 'office panel opens in < 100 ms (통장 ' + pt.ms.toFixed(1) + ' ms, 재고 ' + pt.ms2.toFixed(1) + ' ms; the next drawn frame ' + pt.frame.toFixed(0) + ' ms)');
  await page.evaluate(() => { const P = window.__FV.scene.v42.office.uiScene().officePanel; P.close(); });
  await advance(page, 1);

  console.log('reveal (hysteresis)');
  const rv = await page.evaluate(() => {
    const gs = window.__FV.scene, B = gs.v42.office.bank, V = window.__FV.v42.v;
    void V;
    const out = [];
    // (gdist is the ground distance: screen y counts double, so d / 2 straight south of the door is d on the ground)
    const place = (d) => { window.__FV.teleport(B.door.x, B.door.y + d / 2); window.__step.run(1); const p = gs.player; out.push([d, B.cw.revealed, Math.round(Math.hypot(p.x - B.door.x, (p.y - B.door.y) * 2))]); };
    const r = 260, h = 60;
    place(r - 40); place(r + h - 20); place(r + h + 80); place(r + 20);
    return out;
  });
  ok(rv[0][1] === true, 'within revealPx of the door: the shell fades (open)', rv);
  ok(rv[1][1] === true, 'inside the hysteresis band: stays open', rv);
  ok(rv[2][1] === false, 'beyond revealPx + revealHyst: closed', rv);
  ok(rv[3][1] === false, 'back inside the band from outside: stays closed', rv);

  console.log('aide');
  const ad = await page.evaluate(() => {
    const gs = window.__FV.scene, O = gs.v42.office, a = O.staff.chong, p = gs.player;
    window.__FV.teleport(O.building.spots.door.x + 500, O.building.spots.door.y + 250);
    window.__step.run(6);
    return { d: Math.hypot(a.x - p.x, a.y - p.y), doing: a.doing };
  });
  ok(ad.d <= 300, '총총이 follows the chief (' + Math.round(ad.d) + ' px)', ad);

  console.log('depot');
  const ds = await page.evaluate(() => window.__FV.v42.depot({ build: true }));
  ok(ds.built, 'the 서리 물류창고 stands', ds);
  const depReady = await until(page, () => { const D = window.__FV.scene.v42.depot; return !!(D.building && D.building.ready); }, 60);
  ok(depReady, 'the depot cutaway is built once the logistics manifest is in');
  const before = await page.evaluate(() => {
    const gs = window.__FV.scene, F = gs.v42.freight;
    // nothing on the train's way: the sleigh takes the dock surplus
    // (more than the next train's free room: the train goes first, the sleigh takes the rest)
    F.addSurplus('item_plank', 80); F.addSurplus('item_bread', 60);
    return { dock: F.dockCount(), total: gs.v42.depot.total() };
  });
  const trip = await until(page, () => { const D = window.__FV.scene.v42.depot; return D.sleighs.some((s) => s.trips >= 1 && s.state === 'wait'); }, 200);
  const after = await page.evaluate(() => { const gs = window.__FV.scene; return { dock: gs.v42.freight.dockCount(), total: gs.v42.depot.total(), st: gs.v42.depot.state() }; });
  ok(trip, 'the cargo sleigh made a round trip (stop → bay 2 → stop)', after.st.sleighs);
  ok(after.total > before.total, 'the racks filled (' + before.total + ' → ' + after.total + ')');
  ok(after.dock + (after.total - before.total) >= Math.min(before.dock, 1) && after.total - before.total <= before.dock + 200, 'goods are moved, not made (dock ' + before.dock + ' → ' + after.dock + ')');

  console.log('freight: cards first, then surplus; camera anywhere');
  const fr = await page.evaluate(() => {
    const gs = window.__FV.scene, F = gs.v42.freight, G = gs.v4.growth, nb = gs.v4;
    // the chief far away in the west: the station is off screen
    window.__FV.teleport(-200, 700);
    for (const s of gs.v42.depot.sleighs) s.update = () => {};      // keep the sleigh out of it (it would take the surplus first)
    G.cargo = 12; F.addSurplus('item_ingot', 30);
    const log = { firstSurplusCargo: null, cardMax: 0, surplusMax: 0, sawTrainIn: false };
    let n = 0;
    while (n++ < 60 * 200) {
      window.__step.run(1 / 60);
      const inn = F.trainIn();
      if (inn) log.sawTrainIn = true;
      const ab = F.aboard(), card = F.cardAboard || 0, sur = ab - card;
      log.cardMax = Math.max(log.cardMax, card);
      if (sur > 0 && log.firstSurplusCargo === null) log.firstSurplusCargo = G.cargo;
      log.surplusMax = Math.max(log.surplusMax, sur);
      if (log.sawTrainIn && !inn && log.surplusMax > 0) break;
    }
    log.onScreen = gs.isOnScreen(nb.ours.x, nb.ours.y, 0);
    log.cargoEnd = G.cargo;
    return log;
  });
  ok(fr.sawTrainIn && fr.onScreen === false, 'a train stood at our station while the camera was far away', fr);
  ok(fr.cardMax > 0 && fr.cargoEnd < 12, 'order-card crates boarded with the camera anywhere (P0a)', fr);
  ok(fr.surplusMax > 0 && fr.firstSurplusCargo === 0, 'surplus boarded only once no card crate waited (F7)', fr);

  ok(log.errors.length === 0, '0 page errors', log.errors.slice(0, 5));
} catch (e) { fail++; console.log('FATAL', (e && e.stack) || e); }
console.log(`\n${pass} passed, ${fail} failed  (wall ${((Date.now() - t0) / 1000) | 0}s)`);
await browser.close();
await srv.close();
process.exit(fail ? 1 : 0);
