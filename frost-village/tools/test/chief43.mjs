// (v4.3 step B, P — build_plan.md §3.7 WP-P, postdepot_addendum.md §4) the chief's buildings in the game, fixed-step clock:
//   node tools/test/chief43.mjs [--shots dir]
//   A 412x915 ko  a new game: the office plot (the hut's) opens with the mine and not before; its build card asks 400 +
//                 판자 8 and says the staff come at 읍; the goal window lists it as a side row; built, the office replaces
//                 the hut (on the scaffold) and has no hire pad before 읍; the 직원 tab and the locked tabs say 「읍이 되면
//                 와요」, the desk opens 직원. The hall's plot (w_hall) opens at village complete with its card at 1,200 +
//                 16 + 4; the hall is the first goal after complete (GOALS order), its arrow / walk go to w_hall — never
//                 to w_rest, even when w_rest shows and is nearer (Tutorial.plotFor through plotRules); built, the bus says
//                 so ('hall' milestone)
//   B 390x844 ko  the v4.1 46-min village (through the real remap): before 읍 the office is a side row, never a main row;
//                 at 읍 with the hut still there the office comes first (the bank guard): the goal window's 지금 and the
//                 objective; built, the hire pad offers 셈이 at today's price (500) and the bank is 지금
//   C (same)      the mkt_s4 row: no pad at 읍 without flags.g43s4 (also for an s4half village: no early pad, no offer
//                 banner, nothing on the bus); with the flag the pad stands at half price (1,000 + 10 + 4) for an s4half
//                 village and at full price (2,000 + 20 + 8) otherwise
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures');
const argv = process.argv.slice(2);
const SHOTS = argv.includes('--shots') ? argv[argv.indexOf('--shots') + 1] : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const t0 = Date.now();

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
async function boot(save, vp) {
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: vp || { width: 412, height: 915 }, dpr: 1, locale: 'ko-KR' });
  await page.evaluate((sv) => { try { localStorage.clear(); if (sv) localStorage.setItem('frostVillage.save.v1', sv); localStorage.setItem('frostVillage.settings.v1', JSON.stringify({ lang: 'ko' })); } catch (e) { /* */ } }, save);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player && window.__FV.game.scene.getScene('UI').ready, 120000);
  await sleep(1500);
  await installStepper(page);
  await page.evaluate(() => { if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1; });
  await advance(page, 1);
  return { page, log };
}
const shot = async (page, name) => { if (!SHOTS) return; await render(page, 3); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
const MAIN = ['hire_clerk_market', 'op_grill', 'hire_fisherman', 'zone_forest', 'op_sawmill', 'hire_lumberjack', 'zone_farm', 'bld_bakery', 'hire_clerk_bakery', 'op_bakery', 'hire_farmer', 'zone_mine', 'op_smelter', 'hire_miner', 'zone_hunt', 'op_smokehouse', 'hire_hunter'];

try {
  // ================================================================== A: a new game
  console.log('— A: a new game, 412x915, ko');
  {
    const { page, log } = await boot(null);
    const upTo = async (last) => page.evaluate(([ids, last]) => {
      const F = window.__FV, pr = F.scene.progress;
      pr.flags.firstSale = true;
      for (const id of ids) { F.doneStep(id); if (id === last) break; }
      F.scene.refreshSites();
      return true;
    }, [MAIN, last]);
    await upTo('hire_farmer');
    await advance(page, 1);
    const a0 = await page.evaluate(() => { const gs = window.__FV.scene, so = gs.sites.v42_office, sh = gs.sites.w_hall; return { office: so ? so.shown : null, hut: !!(gs.v42 && gs.v42.office && gs.v42.office.hut), hall: sh ? sh.shown : null }; });
    ok(a0.office === false && a0.hut && a0.hall === false, 'before the mine: the hut stands, its plot (the office) and the hall plot are not open', a0);
    await upTo('zone_mine');
    await advance(page, 2);
    const a1 = await page.evaluate(() => {
      const F = window.__FV, gs = F.scene, so = gs.sites.v42_office, O = gs.v42.office;
      const card = (F.choices('v42_office') || []).find((c) => c.key === 'chief_office');
      const b = F.v42.goals.book(3, 12);
      const side = b.side.find((r) => r.id === 'plot:v42_office');
      return { shown: so.shown, state: so.state, hut: !!O.hut, card, side, main: [b.cur].concat(b.next).filter(Boolean).map((r) => r.id) };
    });
    ok(a1.shown && a1.state === 'plot' && a1.hut, 'with the mine the hut\'s plot opens (the hut still stands on it)', a1);
    ok(a1.card && !a1.card.locked && a1.card.coins === 400, 'its build card: 촌장 사무실, open, 400 coins', a1.card);
    ok(a1.side && a1.side.coins === 400 && a1.side.items && a1.side.items.item_plank === 8 && /읍이 되면 와요/.test(a1.side.name) && a1.side.place, 'the goal window: a side row 「' + (a1.side && a1.side.name) + '」 400 + 판자 8, with a place to walk to', a1.side);
    ok(a1.main.indexOf('v42:chief_office') < 0, 'not a main row before 읍', a1.main);
    // the card's line in the build menu
    const menu = await page.evaluate(() => { const F = window.__FV; F.openMenu('v42_office'); window.__step.run(0.4); const m = F.menu(); const ui = F.game.scene.getScene('UI'); const texts = []; (function walk(o) { if (!o) return; if (o.type === 'Text' && o.visible) texts.push(o.text); if (o.list) for (const c of o.list) walk(c); })(ui.children); if (ui.buildOpen) ui.closeBuildMenu(true); return { cards: m && m.cards, texts: texts.filter((s) => /읍|사무실/.test(s)) }; });
    ok(menu.cards && menu.cards.some((c) => c.key === 'chief_office' && !c.locked) && menu.texts.some((s) => /직원은 읍이 되면 와요/.test(s)), 'the build menu card says 「직원은 읍이 되면 와요」 (no raw key)', menu);
    // build it: 400 coins, 8 planks; the hut stays on the foundation, the scaffold replaces it
    const b1 = await page.evaluate(() => {
      const F = window.__FV, gs = F.scene, O = gs.v42.office;
      gs.economy.coins = 1000;
      const okB = F.build('v42_office', 'chief_office');
      const so = gs.sites.v42_office;
      const out = { okB, coins: gs.economy.coins, need: Object.assign({}, so.need), hutOnFoundation: !!O.hut };
      F.supply('v42_office');
      window.__step.run(1.5);
      out.state = so.state; out.hutOnScaffold = !!O.hut;
      F.finishSite('v42_office');
      window.__step.run(3);
      out.built = O.built; out.hire = O.hirePad ? O.hirePad.role : null; out.rows = O.staffRows().map((r) => r.text); out.desk = O.deskTab();
      out.ev = (window.__FV43 ? window.__FV43.recent() : []).filter((e) => e.name === 'milestone' || e.name === 'card').map((e) => e.name + ':' + e.data.id);
      return out;
    });
    ok(b1.okB && b1.coins === 600 && b1.need.item_plank === 8 && !b1.need.item_ingot, 'built for 400 coins + 판자 8', b1);
    ok(b1.hutOnFoundation && !b1.hutOnScaffold && b1.built, 'the hut stays while the foundation waits, the scaffold replaces it, the office stands', b1);
    ok(b1.hire === null && b1.rows.length === 4 && b1.rows.every((s) => /읍이 되면 와요/.test(s)) && b1.desk === 'staff', 'before 읍: no hire pad; the 직원 tab 「… · 읍이 되면 와요」; the desk opens 직원', b1);
    ok(b1.ev.indexOf('card:chief_office') >= 0 && b1.ev.indexOf('milestone:office') >= 0, 'the v43 bus: the office card shown, the office milestone', b1.ev);
    // the office panel as the desk opens it
    const pnl = await page.evaluate(() => {
      const gs = window.__FV.scene, O = gs.v42.office, ui = window.__FV.game.scene.getScene('UI');
      O.openPanel('desk', O.deskTab());
      window.__step.run(1.6);
      const P = ui.officePanel, texts = [];
      (function walk(o) { if (!o) return; if (o.type === 'Text') texts.push(o.text); if (o.list) for (const c of o.list) walk(c); })(P.c);
      const r = { open: P.isOpen(), tab: P.tab, stockLock: P.locked('stock'), newsLock: P.locked('news'), texts: texts.filter((s) => /읍/.test(s)) };
      return r;
    });
    await shot(page, 'A1_office_staff_tab');
    await page.evaluate(() => window.__FV.game.scene.getScene('UI').officePanel.close());
    ok(pnl.open && pnl.tab === 'staff' && /읍이 되면/.test(pnl.stockLock || '') && /읍이 되면/.test(pnl.newsLock || '') && pnl.texts.length >= 4, 'the office panel: 직원 open, the 재고 / 소식 tabs say their clerk comes at 읍', pnl);
    // the hall: not before village complete; at complete its card at 1,200 + 16 + 4, the first goal, its walk to w_hall
    await upTo('op_smokehouse');
    await advance(page, 1.5);
    const h0 = await page.evaluate(() => { const gs = window.__FV.scene; return { hall: gs.sites.w_hall.shown, pad: !!gs.progress.pads.hire_hunter }; });
    ok(h0.hall === false, 'before village complete the hall plot is not open', h0);
    // (village complete the way play reaches it: the 사냥꾼 pad paid in full)
    await page.evaluate(() => { const F = window.__FV; F.scene.economy.coins += 5000; F.completeStep('hire_hunter'); });
    await advance(page, 4);
    const h1 = await page.evaluate(() => {
      const F = window.__FV, gs = F.scene, sh = gs.sites.w_hall, pr = gs.progress;
      const card = (F.choices('w_hall') || []).find((c) => c.key === 'town_hall');
      const g = pr.nextGoal(), b = F.v42.goals.book(3, 8);
      const rest = gs.sites.w_rest, restShown = rest ? rest.shown : null;
      // (w_rest shown and nearer: the hall's plot is still w_hall)
      if (rest) { rest.setShown(true); F.teleport(rest.dropX + 40, rest.dropY + 40); }
      const pf = gs.tutorial.plotFor('town_hall'), pfr = gs.tutorial.plotFor('big_restaurant');
      if (rest) rest.setShown(restShown);
      return { complete: pr.complete, shown: sh.shown, card, goal: g && g.id, cur: b.cur, plotFor: pf && pf.id, plotRest: pfr && pfr.id };
    });
    ok(h1.complete && h1.shown && h1.card && !h1.card.locked && h1.card.coins === 1200, 'village complete: the hall plot opens beside the office, its card open at 1,200', h1);
    ok(h1.goal === 'town_hall' && h1.cur && h1.cur.id === 'town_hall' && h1.cur.coins === 1200 && h1.cur.items && h1.cur.items.item_plank === 16 && h1.cur.items.item_ingot === 4 && h1.cur.place, 'the first goal after complete is the hall: 1,200 + 판자 16 + 주괴 4 (GOALS order)', h1.cur);
    ok(h1.plotFor === 'w_hall' && h1.plotRest === 'w_rest', 'Tutorial.plotFor honours the plot rules: the hall → w_hall even with w_rest shown and nearer; the restaurant → w_rest', h1);
    const h2 = await page.evaluate(() => {
      const F = window.__FV, gs = F.scene, sh = gs.sites.w_hall;
      gs.economy.coins = 1500;
      const okB = F.build('w_hall', 'town_hall');
      const out = { okB, coins: gs.economy.coins, need: Object.assign({}, sh.need) };
      F.supply('w_hall'); window.__step.run(1.5); F.finishSite('w_hall'); window.__step.run(2);
      out.hall = !!(gs.civic && gs.civic.hall);
      out.ev = (window.__FV43 ? window.__FV43.recent() : []).filter((e) => e.name === 'milestone' || e.name === 'card').map((e) => e.name + ':' + e.data.id);
      out.next = gs.progress.nextGoal() ? gs.progress.nextGoal().id : null;
      return out;
    });
    ok(h2.okB && h2.coins === 300 && h2.need.item_plank === 16 && h2.need.item_ingot === 4 && h2.hall, 'the hall built for 1,200 + 16 + 4', h2);
    ok(h2.ev.indexOf('milestone:complete') >= 0 && h2.ev.indexOf('card:town_hall') >= 0 && h2.ev.indexOf('milestone:hall') >= 0 && h2.next === 'east', 'the bus: complete, the hall card, the hall milestone; the next goal is the east watchtower', h2);
    await shot(page, 'A2_hall');
    ok(log.errors.length === 0, 'A: 0 page errors', log.errors.slice(0, 5));
    await page.context().close();
  }

  // ================================================================== B / C: the 46-min village
  console.log('— B: the v4.1 46-min village (remapped), 390x844, ko');
  {
    const { page, log } = await boot(fs.readFileSync(path.join(FIX, 'v41_save_smart_46min.json'), 'utf8'), { width: 390, height: 844 });
    const b0 = await page.evaluate(() => {
      const F = window.__FV, gs = F.scene, so = gs.sites.v42_office, b = F.v42.goals.book(3, 20);
      return { lay: gs.v43 && gs.v43.lay, rank: gs.v4 && gs.v4.rank ? gs.v4.rank.level : null, office: so && { shown: so.shown, state: so.state }, built: gs.isBuilt('chief_office'), side: b.side.map((r) => r.id), main: [b.cur].concat(b.next).filter(Boolean).map((r) => r.id) };
    });
    ok(b0.rank === 1 && b0.office && b0.office.shown && b0.office.state === 'plot' && !b0.built, 'the 46-min village: not 읍 yet, the hut\'s plot open, no office', b0);
    ok(b0.side.indexOf('plot:v42_office') >= 0 && b0.main.indexOf('v42:chief_office') < 0, 'before 읍: the office is a side row, not a main row', b0);
    // 읍 the way play reaches it (the rank_eup step's flag and level, then the 'step' event)
    const b1 = await page.evaluate(() => {
      const F = window.__FV, gs = F.scene;
      gs.v4.rank.ceremony(true);
      gs.events.emit('step', 'rank_eup');
      window.__step.run(2.5);
      gs.tutorial.goalText = () => null;          // (every v4 goal done, as the arrow-only bot after 읍)
      const b = F.v42.goals.book(3, 20), h = gs.tutorial.v42Goal();
      const r = { cur: b.cur, next: b.next.map((q) => q.id), side: b.side.map((q) => q.id), obj: h && { key: h.key, cost: h.cost }, bank: !!(gs.sites.v42_bank && gs.sites.v42_bank.shown) };
      return r;
    });
    const allDone = b1.cur && b1.cur.id && b1.cur.id.indexOf('v42:') === 0;
    if (!allDone) console.log('       (a v4 goal is still open here: ' + (b1.cur && b1.cur.id) + ' — the bank guard is checked through the objective)');
    ok(!allDone || (b1.cur.id === 'v42:chief_office' && b1.cur.coins === 400 && b1.cur.place && b1.next[0] === 'v42:bank42'), 'at 읍 with the hut still there: 지금 = 촌장 사무실 짓기, then the bank (the bank guard)', b1);
    ok(b1.side.indexOf('plot:v42_office') < 0, 'from 읍 on the office is not a side row', b1.side);
    ok(b1.obj && b1.obj.key === 'obj_next_build:chief_office' && b1.obj.cost === 400 && !b1.bank, 'the objective after 읍: the office plot first (the bank plot waits for it)', b1);
    await shot(page, 'B1_bank_guard');
    const b2 = await page.evaluate(() => {
      const F = window.__FV, gs = F.scene;
      // (built the way play builds it: the card paid, the planks brought, the scaffold finished — its 'built' event
      //  refreshes the plots, so the bank's plot shows)
      gs.economy.coins = Math.max(gs.economy.coins, 2000);
      const okB = F.build('v42_office', 'chief_office');
      F.supply('v42_office'); window.__step.run(1.5); F.finishSite('v42_office');
      window.__step.run(3);
      const O = gs.v42.office, hp = O.hirePad, b = F.v42.goals.book(3, 20);
      return { okB, built: O.built, hire: hp ? hp.role : null, cost: hp ? hp.cost : null, remaining: hp ? hp.remaining : null, rows: O.staffRows().map((r) => r.text), cur: b.cur && b.cur.id, bank: !!(gs.sites.v42_bank && gs.sites.v42_bank.shown), main: [b.cur].concat(b.next).filter(Boolean).map((r) => r.id) };
    });
    ok(b2.built && b2.hire === 'sem' && b2.remaining === 500, 'the office built at 읍: the hire pad offers 셈이 at today\'s price (500)', b2);
    ok(b2.rows.some((s) => /500/.test(s)) && !b2.rows.some((s) => /읍이 되면/.test(s)), 'the 직원 tab shows the prices again', b2.rows);
    ok(b2.main.indexOf('v42:chief_office') < 0 && b2.bank, 'the office row leaves the main road; the bank plot shows', b2);

    console.log('— C: the mkt_s4 row');
    const c0 = await page.evaluate(() => {
      const F = window.__FV, gs = F.scene, pr = gs.progress;
      for (const id of ['mkt_s3', 'hire_clerk_s3']) F.doneStep(id);
      pr.flags.s4half = true;
      pr.syncPads();
      window.__step.run(2);
      const ev0 = (window.__FV43 ? window.__FV43.recent() : []).length;
      return { s3: pr.isDone('mkt_s3'), rankEup: !!pr.flags.rankEup, pad: !!pr.pads.mkt_s4, ev0 };
    });
    ok(c0.s3 && c0.rankEup && !c0.pad, '읍 + 3단 (an s4half village): no mkt_s4 pad without g43s4 — no early pad', c0);
    const c1 = await page.evaluate(() => {
      const F = window.__FV, gs = F.scene, pr = gs.progress, ui = F.game.scene.getScene('UI');
      const n0 = (window.__FV43 ? window.__FV43.recent() : []).length;
      pr.setFlag('g43s4');
      window.__step.run(2);
      const p = pr.pads.mkt_s4;
      const ev = (window.__FV43 ? window.__FV43.recent() : []).slice(n0).map((e) => e.name);
      const banner = ui.bannerText && ui.bannerBox && ui.bannerBox.visible ? ui.bannerText.text : null;
      const b = F.v42.goals.book(3, 30), row = b.side.find((r) => r.id === 'mkt_s4');
      return { pad: !!p, cost: p ? p.cost : null, items: p ? p.items : null, at: p ? [p.x, p.y] : null, ev, banner, row: row && { coins: row.coins, items: row.items } };
    });
    ok(c1.pad && c1.cost === 1000 && c1.items && c1.items.item_plank === 10 && c1.items.item_ingot === 4, 'with g43s4 the pad stands at half price: 1,000 + 판자 10 + 주괴 4', c1);
    ok(c1.ev.indexOf('offer') < 0 && !(c1.banner && /4단|눈꽃마을 시장/.test(c1.banner)), 'no offer banner, nothing on the bus for it (P shows no banner)', c1);
    await shot(page, 'C1_mkt_s4_half');
    const c2 = await page.evaluate(() => {
      const gs = window.__FV.scene, pr = gs.progress;
      pr.pads.mkt_s4.destroy(); delete pr.pads.mkt_s4;
      delete pr.flags.s4half;
      pr.syncPads();
      window.__step.run(1);
      const p = pr.pads.mkt_s4;
      return { pad: !!p, cost: p ? p.cost : null, items: p ? p.items : null };
    });
    ok(c2.pad && c2.cost === 2000 && c2.items && c2.items.item_plank === 20 && c2.items.item_ingot === 8, 'a village that was not 읍 at the remap: full price 2,000 + 판자 20 + 주괴 8', c2);
    ok(log.errors.length === 0, 'B / C: 0 page errors', log.errors.slice(0, 5));
    await page.context().close();
  }
} catch (e) {
  fail++;
  console.log('  FAIL exception: ' + (e && e.stack ? e.stack : e));
} finally {
  await browser.close();
  await srv.close();
}
console.log(`chief43: ${pass} passed, ${fail} failed  (wall ${Math.round((Date.now() - t0) / 1000)}s)`);
process.exit(fail ? 1 : 0);
