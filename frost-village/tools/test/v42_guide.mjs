// (v4.2 verify) after 읍 the v4.2 places come one after another: the regressions the final verification found in the
// fresh-game bots, checked from the v4.1 46-min save with the fixed-step clock:
//   node tools/test/v42_guide.mjs
//   bank plot   the 서리 은행 plot (after 읍 AND a finished 촌장 사무실) appears in the same session when the office is
//               finished after 읍 (plots refreshed only on a step / region before: the bots never saw it)
//   cash lead   with coins for the next v4.2 thing the arrow does not pull back to the cash pads (the arrow-only bot
//               went cash pads <-> 물류창고 plot for 14 minutes with 30,000 coins)
//   plot hold   standing on that plot the arrow stays off: an arrow-only chief stops, the build menu opens, he builds
//               (the cash lead sent him away before the 0.5 s menu delay: plot <-> coins for 20 minutes)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAVE = fs.readFileSync(path.join(HERE, 'fixtures', 'v41_save_smart_46min.json'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 500) : '')); } };

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

  // 읍 the way play reaches it (the rank_eup step: its flag, then the 'step' event that refreshes the plots); the v4
  // goals all done (the arrow-only bot's state after 읍: no v4 goal text, the v4.2 list leads)
  const a = await page.evaluate(() => {
    const gs = window.__FV.scene;
    gs.v4.rank.ceremony(true);
    gs.events.emit('step', 'rank_eup');
    window.__step.run(2);
    gs.tutorial.goalText = () => null;
    const so = gs.sites.v42_office, sb = gs.sites.v42_bank;
    return { rankEup: !!gs.progress.flags.rankEup, office: !!(so && so.shown && so.state === 'plot'), bank: !!(sb && sb.shown) };
  });
  ok(a.rankEup && a.office && !a.bank, '읍: the office plot shows, the bank plot waits for the office', a);

  console.log('cash lead');
  // coins for the office (1,800) in hand, coins on the cash pads: the arrow goes to the office plot, not to the coins.
  // The hints that come before the v4.2 list and have nothing to do with it (an order card, a station, a register, an
  // affordable upgrade) are switched off: what is left is the cash hint against the v4.2 goal
  const c = await page.evaluate(() => {
    const gs = window.__FV.scene, p = gs.player, st = gs.sites.v42_office, tu = gs.tutorial;
    window.__hints0 = {};
    for (const k of ['registerHint', 'civicHint', 'ribbonHint', 'unloadHint', 'upgradeHint', 'zoneHint', 'labourHint', 'v3Hint', 'v4Hint']) { window.__hints0[k] = tu[k]; tu[k] = () => false; }
    window.__hints0.affordablePad = gs.progress.affordablePad; gs.progress.affordablePad = () => null;
    gs.economy.coins = 2500;
    for (const q of gs.tutorial.cashes()) q.value = Math.max(q.value, 400);
    window.__FV.teleport(st.dropX + 700, st.dropY + 300);
    const keys = {};
    for (let i = 0; i < 20; i++) { window.__step.run(0.25); const tg = gs.tutorial.target; const k = tg ? (Math.hypot(tg.x - st.dropX, tg.y - st.dropY) < 40 ? 'plot' : gs.tutorial.textKey || 'other') : 'none'; keys[k] = (keys[k] || 0) + 1; }
    for (const k in window.__hints0) { if (k === 'affordablePad') gs.progress.affordablePad = window.__hints0[k]; else tu[k] = window.__hints0[k]; }
    return { keys, coins: gs.economy.coins };
  });
  ok((c.keys.plot || 0) >= 16, 'coins for the office in hand: the arrow leads to its plot, not back to the cash pads', c);

  console.log('plot hold');
  // an arrow-only chief: walks to the arrow and stops; takes the build menu when it opens
  const h = await page.evaluate(() => {
    const gs = window.__FV.scene, p = gs.player, ui = window.__FV.game.scene.getScene('UI'), out = { menu: 0, trace: [] };
    let last = '';
    for (let i = 0; i < 160; i++) {
      for (const q of gs.tutorial.cashes()) if (q.value < 120) q.value += 4;
      if (window.__FV.buildMenuOpen) { out.menu++; if (ui.buildBtn && ui.buildBtn.ok) ui.confirmBuild(); else ui.closeBuildMenu(true); }
      const tg = gs.tutorial.target;
      if (tg) { p.x = tg.x; p.y = tg.y; }
      p.vx = p.vy = 0;
      window.__step.run(0.25);
      const k = (gs.tutorial.textKey || '-') + (tg ? '@' + Math.round(tg.x) + ',' + Math.round(tg.y) : '');
      if (k !== last && out.trace.length < 12) { out.trace.push(k); last = k; }
      if (gs.isBuilding('chief_office') || gs.isBuilt('chief_office')) { out.at = +(i * 0.25).toFixed(2); break; }
    }
    out.building = gs.isBuilding('chief_office') || gs.isBuilt('chief_office');
    return out;
  });
  ok(h.building && h.menu >= 1 && h.at <= 10, 'an arrow-only chief on the office plot: the build menu opens, the office is started (' + h.at + ' s)', h);

  console.log('bank plot');
  // the office finishes after 읍 (a real finish: the 'built' event) -> the bank plot appears without a step / region
  const b = await page.evaluate(() => {
    const gs = window.__FV.scene, so = gs.sites.v42_office;
    if (so.state !== 'done') so.finish(false);
    window.__step.run(3);
    const sb = gs.sites.v42_bank;
    return { office: gs.isBuilt('chief_office'), bank: !!(sb && sb.shown), state: sb && sb.state };
  });
  ok(b.office && b.bank && b.state === 'plot', 'the office finished after 읍: the bank plot shows within 3 s, same session', b);
  // a building finishing never hides a plot (show only): the office plot area and the depot plot keep their state
  const d = await page.evaluate(() => { const gs = window.__FV.scene, sd = gs.sites.v42_depot; const before = sd ? sd.shown : null; const so = gs.sites.v42_office; gs.events.emit('built', so.building || 'chief_office', so); window.__step.run(2); return { before, after: sd ? sd.shown : null }; });
  ok(d.before === d.after, "a 'built' event never hides a plot", d);

  ok(log.errors.length === 0, '0 page errors', log.errors.slice(0, 5));
} catch (e) { fail++; console.log('FATAL', (e && e.stack) || e); }
console.log(`\n${pass} passed, ${fail} failed  (wall ${((Date.now() - t0) / 1000) | 0}s)`);
await browser.close();
await srv.close();
process.exit(fail ? 1 : 0);
