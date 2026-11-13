// (v4.3 「마을 새 단장」 step A, docs/redesign_v43/engineering_plan.md §4.2 / §8) the staged plaza shop, fixed-step clock:
//   node tools/test/market43.mjs [--quick]
// 1. stage 1 = the 4.2.0.2 stall: one food line, no 자재 창구 (gs.trade off), no trade post anywhere
// 2. the forest brings stage 2 (mkt_s2 comes with zone_forest): 자재 창구 (west) + 먹거리, the merchant at the 자재 창구,
//    the first clerk at the food counter's post, the till / racks moved, the stage-2 page loaded
// 3. ((v4.3 밀밭 · 빵집, D4 alternative B) the 눈꽃 시장 pad (400 + 8 planks) shows on the stall clerk's spot only after village
//    complete (hire_hunter) AND the first smoked meat sold; buying it -> stage 3 (자재 · 생선 · 고기), racks 60 a kind, then the
//    고기 clerk's pad. Bread is never on the shop's rack (the bakery's stall sells it)
// 4. lines by kind, served-only: with only the fish clerk, every new customer wants fish; the chief on the 고기 register
//    opens it at once (new customers want meat there and pay); off it, the ones who got nothing go to a served line
// 5. switching: fish out for market43.switchS s -> the fish line's front customer moves to the 고기 line and wants meat
// 6. spawnMul: customers come 1.1x as often at stage 3 as at stage 2 (same spawn points)
// 7. the merchant at the 자재 창구 buys at the trade post's rate: 22 frames a plank with the clerk (163.6 a min), 17 with
//    the chief (211.8 a min) — the M0 baseline's numbers
// 8. old saves (4.1 smart 25 / 46 min, 3.5 12 min): the trade post's planks / ingots on the 자재 창구 rack, its coins in the
//    shop's till, its clerk the 자재 점원; stage from progress (bread selling -> 3, free, with the 고기 clerk); its rack's bread
//    went to the bakery (no bread on the shop's rack); nothing lost
// 9. save + reload of a stage-3 village keeps the stage, 60-a-kind racks and the till; 0 page errors
// ((v4.3 step B, M — build_plan §3.9, X-1, postdepot_addendum §4) stage 4 「눈꽃마을 시장」 (the mkt_s4 row is P's: while P is not
//  merged the suite adds the contract row in the page, tools/test/stage4_helpers.mjs; G's flag g43s4 is set by hook):
// 10. the pad (2,000 + 20 planks + 8 ingots) shows only once the village is 읍 AND G's flag g43s4 is set (stage 3 done); buying
//     it -> stage 4: 자재 · 생선 · 고기 (the same three counters, bread stays at the bakery), every seat at its counter, the 자재
//     counter's second window (register 2's pad stays with the 자재 clerk hired, the second merchant at his spot), 80 a kind on
//     both racks, the stage-4 page; with progress.flags.s4half the pad asks half (P's price hook; reported when it is missing)
// 11. three lines: each food line's customers pay there (fish, meat), the merchant buys at the 자재 창구
// 12. the second merchant spot: the 자재 clerk alone -> one merchant (163.6 a min); the clerk + the chief on register 2 -> both
//     (163.6 + 211.8 a min); the chief alone on register 2 -> the first merchant only (211.8)
// 13. spawnMul: stage 4 brings ~1.2x the customers of stage 2 (and more than stage 3)
// 14. save + reload at stage 4 keeps the stage, 80 a kind (restore runs after progress.init has set stage 4), every clerk and
//     the second window
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, until } from './fv_step.mjs';
import { addStage4Row, openStage4Pad } from './stage4_helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures');
const QUICK = process.argv.includes('--quick');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra).slice(0, 300) : '')); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 600) : '')); } };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
/** ((review SHOP-1) the shop's picture once its stage's page is here: texture|frame of the back and the front layers */
async function shownArt(page) {
  for (let i = 0; i < 40; i++) {
    const r = await page.evaluate(() => { const g = window.__FV.scene, m = g.market, A = window.__FV.assets(), L = g.load; if (L && L.isLoading()) L.update(); return { pending: A.pending(m.sprite), sprite: m.sprite, img: m.img.texture.key + '|' + m.img.frame.name, front: m.front ? m.front.texture.key + '|' + m.front.frame.name : null }; });
    if (!r.pending) { await advance(page, 0.5); return page.evaluate(() => { const m = window.__FV.scene.market; return { sprite: m.sprite, img: m.img.texture.key + '|' + m.img.frame.name, front: m.front ? m.front.texture.key + '|' + m.front.frame.name : null }; }); }
    await advance(page, 0.5); await sleep(250);
  }
  return { pending: true };
}
const artOk = (a, st) => a && !a.pending && a.img === 'market_s' + st + '|market_s' + st + '_back' && (!a.front || a.front === 'market_s' + st + '|market_s' + st + '_front');

async function boot(save) {
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: 1 });
  await page.evaluate((sv) => { try { localStorage.clear(); if (sv) localStorage.setItem('frostVillage.save.v1', sv); } catch (e) { /* */ } }, save);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  // ((v4.3 step B, M) the mkt_s4 row (P's) before the village is built: a reload at stage 4 applies it in progress.init
  const row4 = await addStage4Row(page);
  if (row4.added && !boot.said) { boot.said = true; console.log('  (the mkt_s4 row is not in STEPS yet: P is not merged; the contract row is added in the page)'); }
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 180000);
  await sleep(2000);
  await installStepper(page);
  await page.evaluate(async () => { try { if (window.__FV.scene.v42) window.__FV.scene.v42.seen.whatsNew = 1; } catch (e) { /* */ } window.__BAL = (await import(new URL('src/data/balance.js', location.href).href)).BALANCE; });
  await advance(page, 1);
  return { page, log };
}
const ev = (page, fn, a) => page.evaluate(fn, a);
const errors = [];
try {
  const { page, log } = await boot(null);
  // ---------------------------------------------------------------- 1. stage 1
  {
    const r = await ev(page, () => {
      const g = window.__FV.scene, m = g.market;
      const open = Object.keys(m.lanes).filter((k) => m.lanes[k].open);
      const tp = g.children.list.filter((o) => o.texture && /trade_post/.test(o.frame && o.frame.name || '') && o.visible).length;
      return { stage: m.stage, open, trade: g.trade.enabled, art: m.sprite, q: m.queue.length, tp, isMat: g.trade === m.mat, seatsOn: Object.keys(m.seats).filter((k) => m.seats[k].enabled) };
    });
    ok(r.stage === 1 && r.open.join() === 'food' && r.art === 'market_s1_back', 'stage 1: the stall, one food line', r);
    ok(!r.trade && r.isMat && r.tp === 0, 'stage 1: no 자재 창구 yet (gs.trade = the shop\'s counter, closed), no trade post drawn', r);
    ok(r.q >= 3 && r.seatsOn.join() === 'A', 'stage 1: the first customers wait in the food line; only the stall\'s register', r);
  }
  // ---------------------------------------------------------------- 2. stage 2 with the forest
  {
    await ev(page, () => { const F = window.__FV; F.give(5000); for (const id of ['hire_clerk_market', 'op_grill', 'hire_fisherman']) F.doneStep(id); });
    await advance(page, 1);
    const pad = await ev(page, () => !!window.__FV.scene.progress.pads.zone_forest);
    ok(pad, 'the forest pad is up');
    await ev(page, () => window.__FV.completeStep('zone_forest'));
    await advance(page, 4);
    await until(page, () => !window.__FV.assets().pending('market_s2_back'), 40);
    const r = await ev(page, () => {
      const g = window.__FV.scene, m = g.market, A = window.__FV.assets(), D = A.def('market_s2_back');
      const L = m.lanes.food, sp = D.staffPoints || [], cp = D.customerPoints || [];
      const near = (a, b, t) => Math.hypot(a.x - b.x, a.y - b.y) <= (t || 3);
      return {
        stage: m.stage, done: !!g.progress.done.mkt_s2, trade: g.trade.enabled, open: Object.keys(m.lanes).filter((k) => m.lanes[k].open),
        clerkAtPost: !!(m.seats.A.clerk && near(m.seats.A.clerk, { x: m.x + sp[1][0], y: m.y + sp[1][1] })),
        merchant: near(g.trade.merchant, { x: m.x + cp[0][0], y: m.y + cp[0][1] }),
        foodFront: (() => { const s = L.slotPos(0); return near(s, { x: m.x + cp[1][0], y: m.y + cp[1][1] }); })(),
        loaded: !A.pending('market_s2_back') && A.has('market_s2_back'), max: m.maxPerType, matMax: g.trade.maxPerType,
        walls: m.walls.length, round: m.obstacle.active, seatsOn: Object.keys(m.seats).filter((k) => m.seats[k].enabled),
      };
    });
    ok(r.stage === 2 && r.done && r.trade && r.open.join() === 'food', 'stage 2 comes with the forest: 자재 창구 + 먹거리', r);
    ok(r.clerkAtPost && r.merchant && r.foodFront, 'stage 2: the clerk at the food counter\'s post, the merchant at the 자재 창구, the line from the art\'s customer point', r);
    ok(r.loaded && r.max === 40 && r.matMax === 40 && r.walls === 1 && !r.round && r.seatsOn.join() === 'A,M', 'stage 2: its page loaded, 40 a kind, a wall along the row', r);
  }
  // ---------------------------------------------------------------- 3. stage 3 after the first bread sale
  {
    await ev(page, () => { const F = window.__FV; F.give(20000); for (const id of ['op_sawmill', 'hire_lumberjack', 'zone_farm', 'bld_bakery', 'hire_clerk_bakery', 'op_bakery', 'hire_farmer', 'zone_mine', 'op_smelter', 'hire_miner', 'zone_hunt']) F.doneStep(id); });
    await advance(page, 2);
    const before = await ev(page, () => ({ pad: !!window.__FV.scene.progress.pads.mkt_s3, bread: window.__FV.scene.market.accepts('item_bread') }));
    ok(!before.pad && !before.bread, 'no 눈꽃 시장 pad before village complete; the shop takes no bread', before);
    // a customer buys smoked meat (the flag comes from the sale itself) — still no pad before village complete
    await ev(page, () => {
      const g = window.__FV.scene, m = g.market, L = m.lanes.food;
      for (const c of L.queue.slice()) { c.despawn(); }
      L.queue.length = 0;
      for (let i = 0; i < 6; i++) m.stock.push('item_meat_cooked', null, g.effects);
      const c = m.spawnCustomer(0); c.setWant('item_meat_cooked'); c.want.count = 1; c.need = 1;
      m.spawnT = 1e9;
    });
    await until(page, () => !!window.__FV.scene.progress.flags.firstMeatSale, 20);
    await advance(page, 2);
    const mid = await ev(page, () => ({ pad: !!window.__FV.scene.progress.pads.mkt_s3, flag: !!window.__FV.scene.progress.flags.firstMeatSale }));
    ok(mid.flag && !mid.pad, 'the first meat sale alone (before village complete) brings no 눈꽃 시장 pad', mid);
    await ev(page, () => { const F = window.__FV; for (const id of ['op_smokehouse', 'hire_hunter']) F.doneStep(id); });
    await advance(page, 2);
    const p = await ev(page, () => { const g = window.__FV.scene, pd = g.progress.pads.mkt_s3; return pd ? { x: pd.x, y: pd.y, cost: pd.cost, items: pd.items } : null; });
    ok(!!p && p.x === 1525 && p.y === 900 && p.cost === 400 && p.items && p.items.item_plank === 8, 'after village complete (with meat sold) the 눈꽃 시장 pad (400 + 8 planks) shows on the stall clerk\'s spot', p);
    await ev(page, () => { window.__FV.completeStep('mkt_s3'); window.__FV.scene.market.spawnT = 1; });
    await advance(page, 3);
    await until(page, () => !window.__FV.assets().pending('market_s3_back'), 40);
    const r = await ev(page, () => {
      const g = window.__FV.scene, m = g.market;
      return { stage: m.stage, open: Object.keys(m.lanes).filter((k) => m.lanes[k].open), A: m.seats.A.seller.id, B: !!m.seats.B.clerk, max: m.maxPerType, matMax: g.trade.maxPerType, pad: !!g.progress.pads.hire_clerk_s3, loaded: window.__FV.assets().has('market_s3_back') };
    });
    ok(r.stage === 3 && r.open.join() === 'fish,meat' && r.A === 'fish' && !r.B, 'stage 3: 자재 · 생선 · 고기, the first clerk at the fish counter', r);
    const pl = await ev(page, () => { const m = window.__FV.scene.market; return m.plates.filter((q) => q.on).map((q) => q.key + ':' + (q.icon && q.icon.frame ? q.icon.frame.name : '')); });
    ok(pl.length === 0 || pl.some((q) => /plate_(breadmeat|meat):item_meat_cooked/.test(q)), 'stage 3: the third plate reads 고기 with the meat picture', pl);
    ok(r.max === 60 && r.matMax === 60 && r.loaded, 'stage 3: 60 a kind on both racks, its page loaded', r);
    ok(r.pad, 'the 고기 clerk\'s pad comes after the stage', r);
  }
  // ---------------------------------------------------------------- 4. served-only lines, the chief opens a counter
  {
    const r = await ev(page, () => {
      const g = window.__FV.scene, m = g.market, F = window.__FV;
      for (const ty of ['item_fish_cooked', 'item_meat_cooked']) while (m.stock.countOf(ty) < 30) m.stock.push(ty, null, g.effects);
      F.teleport(m.x + 400, m.y + 400);
      window.__step.run(0.2);
      const n = { fish: 0, bread: 0, meat: 0, lane: {} };
      for (let i = 0; i < 300; i++) { const w = m.makeWant(); n[w.type.replace('item_', '').replace('_cooked', '')]++; n.lane[w.lane.id] = (n.lane[w.lane.id] || 0) + 1; }
      return n;
    });
    ok(r.fish === 300 && r.lane.fish === 300, 'served-only: with the fish clerk alone every new customer wants fish, in the fish line', r);
    const r2 = await ev(page, () => {
      const g = window.__FV.scene, m = g.market, F = window.__FV, R = m.seats.B;
      F.teleport(R.x, R.y); window.__step.run(0.2);
      const n = { fish: 0, bread: 0, meat: 0, lane: {}, chief: R.chief, served: m.lanes.meat.served };
      for (let i = 0; i < 300; i++) { const w = m.makeWant(); n[w.type.replace('item_', '').replace('_cooked', '')]++; n.lane[w.lane.id] = (n.lane[w.lane.id] || 0) + 1; }
      return n;
    });
    ok(r2.chief && r2.served && r2.meat > 60 && r2.bread === 0 && r2.lane.meat === r2.meat, 'the chief on the 고기 register opens it at once: meat customers come to that line (nobody wants bread here)', r2);
    // the chief serves the opened line for a while: customers there pay
    const sold = await ev(page, () => {
      const g = window.__FV.scene, m = g.market;
      window.__soldBM = 0;
      g.events.on('sold', (v, c) => { if (c && c.market === m.lanes.meat) window.__soldBM++; });
      m.spawnT = 0;
      window.__step.run(40);
      return { sold: window.__soldBM, q: m.lanes.meat.queue.length };
    });
    ok(sold.sold >= 3, 'customers in the line the chief opened pay there', sold);
    // the chief steps off: the ones who got nothing go to a served line after switchS
    const off = await ev(page, () => {
      const g = window.__FV.scene, m = g.market, F = window.__FV, L = m.lanes.meat;
      // ((review SUITES-5) the fish rack topped up again: 40 s of selling may have emptied it, and moveOn only sends
      //  customers to a served line that has goods (the designed rule) — the check is about the move, not the stock)
      while (m.stock.countOf('item_fish_cooked') < 30) m.stock.push('item_fish_cooked', null, g.effects);
      // ((v4.3 밀밭 · 빵집) room in the fish line for them (moveOn never overfills a line past maxQueue): the meat line starts
      //  with just the four below, the fish line with at most three — the 40 s of selling above can leave both lines long)
      for (const c of L.queue.slice()) { try { c.despawn(); } catch (e) { /* */ } } L.queue.length = 0;
      { const F2 = m.lanes.fish.queue; while (F2.length > 3) { const c = F2.pop(); try { c.despawn(); } catch (e) { /* */ } } }
      for (let i = 0; i < 4; i++) { const c = m.spawnCustomer(); m.lanes.fish.queue.splice(m.lanes.fish.queue.indexOf(c), 1); L.queue.push(c); c.market = L; c.setWant('item_meat_cooked'); }
      m.spawnT = 1e9;
      F.teleport(m.x + 400, m.y + 400);
      window.__step.run(0.5);
      const before = L.queue.length;
      window.__step.run((window.__BAL && window.__BAL.market43 ? window.__BAL.market43.switchS : 4) + 2);
      const left = L.queue.filter((c) => c.got === 0 && c.flying.length === 0);
      return { before, after: L.queue.length, waitingNothing: left.length, inFish: m.lanes.fish.queue.length, served: L.served };
    });
    ok(!off.served && off.waitingNothing === 0 && off.inFish >= 4, 'off the register: its customers who got nothing move to the served fish line', off);
  }
  // ---------------------------------------------------------------- 5. switching when a kind runs out
  {
    await ev(page, () => window.__FV.doneStep('hire_clerk_s3'));
    await advance(page, 3);
    const r = await ev(page, () => {
      const g = window.__FV.scene, m = g.market, F = window.__FV, Lf = m.lanes.fish, Lb = m.lanes.meat;
      for (const l of [Lf, Lb]) { for (const c of l.queue.slice()) c.despawn(); l.queue.length = 0; }
      m.spawnT = 1e9;
      while (m.stock.countOf('item_fish_cooked') > 0) { const q = m.stock.pop('item_fish_cooked'); if (q && q.spr) g.effects.releaseItem(q.spr); }
      while (m.stock.countOf('item_meat_cooked') < 30) m.stock.push('item_meat_cooked', null, g.effects);
      const c = m.spawnCustomer(0);
      if (c.market !== Lf) { c.market.queue.splice(c.market.queue.indexOf(c), 1); Lf.queue.unshift(c); c.market = Lf; }
      c.setWant('item_fish_cooked'); c.want.count = 2; c.need = 2;
      window.__step.run((window.__BAL && window.__BAL.market43 ? window.__BAL.market43.switchS : 4) + 1.5);
      return { inBM: c.market === Lb, want: c.want.type, servedB: Lb.served, bClerk: !!m.seats.B.clerk };
    });
    ok(r.inBM && r.want === 'item_meat_cooked', 'fish out for switchS s: the fish line\'s front customer moves to the 고기 line and takes meat', r);
  }
  // ---------------------------------------------------------------- 6. spawnMul
  {
    const r = await ev(page, () => {
      const g = window.__FV.scene, m = g.market, real = m.spawnCustomer;
      let n = 0;
      m.spawnCustomer = function () { n++; return null; };
      const count = (st, secs) => { m.setStage(st, true); n = 0; m.spawnT = 0; window.__step.run(secs); return n; };
      const secs = 900;
      const s2 = count(2, secs), s3 = count(3, secs);
      m.spawnCustomer = real;
      m.setStage(3, true);
      return { s2, s3, ratio: +(s3 / s2).toFixed(3), mul: window.__BAL && window.__BAL.market43 && window.__BAL.market43.spawnMul };
    });
    ok(r.ratio > 1.03 && r.ratio < 1.18, 'spawnMul: stage 3 brings ~1.1x the customers of stage 2 (same spawn points)', r);
  }
  // ---------------------------------------------------------------- 7. the merchant's rate at the 자재 창구
  {
    const rate = async (who) => ev(page, (who) => {
      const g = window.__FV.scene, T = g.trade, F = window.__FV, R = T.register;
      let traded = 0;
      const on = () => traded++;
      g.events.on('traded', on);
      const top = () => { for (const ty of ['item_plank', 'item_ingot']) while (T.stock.countWithIncoming(ty) < 30) T.stock.push(ty, null, g.effects); };
      if (who === 'chief') { R.__clerk = R.clerk; if (R.clerk) { R.clerk.sprite.setVisible(false); } R.clerk = null; R.setEnabled(true); F.teleport(R.x, R.y); }
      else F.teleport(T.x + 500, T.y + 500);
      top(); window.__step.run(5, () => {}); top();
      traded = 0;
      for (let s = 0; s < 60; s++) { window.__step.run(1); top(); }
      g.events.off('traded', on);
      if (who === 'chief') { R.clerk = R.__clerk; if (R.clerk) R.clerk.sprite.setVisible(true); R.setEnabled(true); F.teleport(T.x + 500, T.y + 500); }
      return traded;
    }, who);
    await ev(page, () => window.__FV.doneStep('hire_clerk_trade'));
    await advance(page, 4);
    const clerk = await rate('clerk');
    const chief = await rate('chief');
    ok(clerk >= 160 && clerk <= 168, 'merchant at the 자재 창구 with the 자재 점원: ' + clerk + ' a min (trade post: 163.6)', clerk);
    ok(chief >= 207 && chief <= 216, 'merchant at the 자재 창구 with the chief: ' + chief + ' a min (trade post: 211.8)', chief);
  }
  // ---------------------------------------------------------------- 9. save + reload (stage 3)
  {
    const sv = await ev(page, () => {
      const g = window.__FV.scene, m = g.market;
      for (const ty of ['item_fish_cooked', 'item_meat_cooked']) while (m.stock.countOf(ty) < 55) m.stock.push(ty, null, g.effects);
      g.save(true);
      return { save: localStorage.getItem('frostVillage.save.v1'), till: m.cash.value, stock: m.stock.count };
    });
    const b2 = await boot(sv.save);
    const r = await ev(b2.page, () => { const g = window.__FV.scene, m = g.market, L = g.shopLoaded; return { stage: L.stage, fish: L.food.item_fish_cooked, meat: L.food.item_meat_cooked, bread: L.food.item_bread, till: L.till, clerks: Object.keys(m.seats).filter((k) => m.seats[k].clerk) }; });
    ok(r.stage === 3 && r.fish >= 55 && r.meat >= 55 && r.bread === 0 && r.clerks.join() === 'A,M,B', 'a stage-3 village reloads at stage 3 (55 a kind kept on the 60 racks), every clerk back', r);
    ok(r.till >= sv.till, 'the till comes back (paid-for items in the line come back on the rack)', { saved: sv.till, now: r.till });
    const art9 = await shownArt(b2.page);
    ok(artOk(art9, 3), 'after the reload the shop shows the stage-3 picture (not the stage-2 page that arrives first)', art9);
    errors.push(...b2.log.errors);
    await b2.page.context().close();
  }
  // ---------------------------------------------------------------- 10. stage 4: the pad, the transition
  {
    const none = await ev(page, () => { const g = window.__FV.scene, pr = g.progress; pr.syncPads(); return { pad: !!pr.pads.mkt_s4, s3: pr.isDone('mkt_s3'), eup: !!pr.flags.rankEup }; });
    ok(!none.pad && none.s3 && !none.eup, 'stage 3, not 읍: no 눈꽃마을 시장 pad', none);
    const eupOnly = await ev(page, () => { const g = window.__FV.scene, pr = g.progress; pr.flags.rankEup = true; pr.syncPads(); return { pad: !!pr.pads.mkt_s4 }; });
    ok(!eupOnly.pad, '읍 alone (G\'s flag g43s4 not set: the post-depot chain has not reached row 9) brings no pad (postdepot_addendum BP-41)', eupOnly);
    const half = await ev(page, async () => {
      const g = window.__FV.scene, pr = g.progress;
      // (a 읍 village has its east watchtower: its unlock pad near the shop pads' spot would keep the stage-4 pad waiting)
      if (!pr.done.tower_east && pr.pads.tower_east) window.__FV.doneStep('tower_east');
      const src = await (await fetch(new URL('src/systems/Progression.js', location.href).href)).text();
      pr.flags.s4half = true; pr.flags.g43s4 = true; pr.syncPads();
      const p = pr.pads.mkt_s4, out = { hook: /stage4Old/.test(src), cost: p ? p.cost : null };
      if (p) { p.destroy(); delete pr.pads.mkt_s4; }
      delete pr.flags.s4half; delete pr.flags.g43s4;
      return out;
    });
    if (half.hook) ok(half.cost === 1000, 'a village that was already 읍 at the remap (flags.s4half) gets the pad at half price: 1,000', half);
    else console.log('  SKIP half price: P\'s stage4Old price hook is not in this tree (the pad asks ' + half.cost + '); re-run after P merges');
    const p = await openStage4Pad(page);
    ok(!!p && p.cost === 2000 && p.items && p.items.item_plank === 20 && p.items.item_ingot === 8, '읍 + g43s4 (stage 3 done): the 눈꽃마을 시장 pad (2,000 + 20 planks + 8 ingots)', p);
    await ev(page, () => { const g = window.__FV.scene; window.__banners4 = []; const b = g.ui.banner; g.ui.banner = function (a, c, o) { window.__banners4.push([a, c]); return b.call(this, a, c, o); }; window.__FV.completeStep('mkt_s4'); g.market.spawnT = 1; });
    await advance(page, 3);
    await until(page, () => !window.__FV.assets().pending('market_s4_back'), 40);
    await advance(page, 1);
    const r = await ev(page, () => {
      const g = window.__FV.scene, m = g.market, T = g.trade, A = window.__FV.assets(), D = A.def('market_s4_back');
      const near = (a, b, t) => Math.hypot(a.x - b.x, a.y - b.y) <= (t || 3);
      const S = m.seats, c2 = (D.customer2Points || [])[0];
      return {
        stage: m.stage, done: !!g.progress.done.mkt_s4, art: m.img.texture.key + '|' + m.img.frame.name, open: m.openLanes().map((l) => l.id),
        A: S.A.seller.id, B: S.B.seller.id, aClerk: !!(S.A.clerk && near(S.A.clerk, S.A.staff)), bClerk: !!(S.B.clerk && near(S.B.clerk, S.B.staff)), mClerk: !!(S.M.clerk && near(S.M.clerk, S.M.staff)),
        open2: T.open2, m2on: S.M2.enabled, m2pad: S.M2.pad.img.visible, m2label: S.M2.labelText.text, merchant2: T.merchant2.sprite.visible && !!c2 && near(T.merchant2, { x: m.x + c2[0], y: m.y + c2[1] }),
        max: m.maxPerType, matMax: T.maxPerType, foodCap: m.stock.max, matCap: T.stock.max, banner: window.__banners4.map((q) => q[0]).join('|'),
        plates: m.plates.filter((q) => q.on).map((q) => q.key), sign: m.sign ? m.sign.visible : false, signFont: m.signFont || null,
        pads: Object.keys(g.progress.pads).filter((k) => /mkt_s|clerk_s3/.test(k)),
        chiefOnly: !!(m.occ && m.occ.chiefOnly),
      };
    });
    ok(r.stage === 4 && r.done && r.art === 'market_s4|market_s4_back' && r.open.join() === 'fish,meat', 'stage 4 「눈꽃마을 시장」: 자재 · 생선 · 고기 lines, its own page (bread stays at the bakery)', r);
    ok(r.A === 'fish' && r.B === 'meat' && r.aClerk && r.bClerk && r.mClerk, 'stage 4: the fish clerk, the 고기 clerk and the 자재 점원 stand at their new posts', r);
    ok(r.open2 && r.m2on && r.m2pad && r.merchant2 && /2/.test(r.m2label), 'stage 4: the 자재 counter\'s second window — register 2\'s pad stays (the 자재 clerk is hired), the second merchant stands at his spot', r);
    ok(r.max === 80 && r.matMax === 80 && r.foodCap >= 160 && r.matCap >= 160, 'stage 4: 80 a kind on both racks (market43.shelfMax[3])', r);
    ok(/눈꽃마을 시장|Snowbloom Village Market/.test(r.banner) && r.sign && r.plates.join() === 'plate_mat,plate_fish,plate_meat', 'stage 4: its banner, the 「눈꽃마을 시장」 board and the three plates (자재 · 생선 · 고기)', r);
    ok(!r.pads.length, 'no shop step pad left after stage 4', r.pads);
    // ((M verify) the 3.6 m roof covers the plaza behind the row (residents at the snowman / flag corner): from stage 4 only the
    //  chief fades the shop (Occlusion chiefOnly), else it was see-through 41–67 % of the time in late villages
    ok(r.chiefOnly, 'stage 4: only the chief makes the shop see-through (x-ray chiefOnly: residents behind the roof do not)', { chiefOnly: r.chiefOnly });
  }
  // ---------------------------------------------------------------- 11. three lines at stage 4
  {
    const r = await ev(page, () => {
      const g = window.__FV.scene, m = g.market, F = window.__FV, T = g.trade;
      for (const ty of ['item_fish_cooked', 'item_meat_cooked']) while (m.stock.countOf(ty) < 60) m.stock.push(ty, null, g.effects);
      for (const ty of ['item_plank', 'item_ingot']) while (T.stock.countOf(ty) < 30) T.stock.push(ty, null, g.effects);
      F.teleport(m.x + 500, m.y + 500);
      const sold = { fish: 0, meat: 0 }; let traded = 0;
      const on = (v, c) => { if (c && c.market && sold[c.market.id] !== undefined) sold[c.market.id]++; };
      const tr = () => traded++;
      g.events.on('sold', on); g.events.on('traded', tr);
      m.spawnT = 0;
      for (let s = 0; s < 90; s++) { window.__step.run(1); for (const ty of ['item_fish_cooked', 'item_meat_cooked']) while (m.stock.countOf(ty) < 40) m.stock.push(ty, null, g.effects); }
      g.events.off('sold', on); g.events.off('traded', tr);
      return { sold, traded, q: m.openLanes().map((l) => l.queue.length) };
    });
    ok(r.sold.fish >= 4 && r.sold.meat >= 4 && r.traded >= 30, 'stage 4: customers pay in the fish line and in the meat line, the merchant buys at the 자재 창구 (90 s)', r);
  }
  // ---------------------------------------------------------------- 12. the second merchant spot
  {
    const rate = (who) => ev(page, (who) => {
      const g = window.__FV.scene, T = g.trade, F = window.__FV, R = T.register, R2 = g.market.seats.M2;
      const n = { 1: 0, 2: 0 };
      const on = (v, w) => { n[w === 2 ? 2 : 1]++; };
      g.events.on('traded', on);
      const top = () => { for (const ty of ['item_plank', 'item_ingot']) while (T.stock.countWithIncoming(ty) < 60) T.stock.push(ty, null, g.effects); };
      const stash = who === 'chief2only' ? R.clerk : null;
      if (stash) { R.clerk = null; stash.sprite.setVisible(false); R.setEnabled(true); }
      const place = () => { if (who === 'clerk') F.teleport(T.x + 600, T.y + 600); else F.teleport(R2.x, R2.y); F.setInput(0, 0); };
      place(); top(); window.__step.run(5); top();
      n[1] = 0; n[2] = 0;
      let servers = 0;
      for (let s = 0; s < 60; s++) { place(); window.__step.run(1); top(); servers = Math.max(servers, T.servers()); }
      // ((the chief on register 2 stands in front of the 자재 counter: drawn above the shop's layers, the shop not faded)
      const m = g.market, P = g.player;
      const look = who === 'clerk' ? null : { chiefDepth: +P.sprite.depth.toFixed(2), front: m.front ? +m.front.depth.toFixed(2) : null, back: +m.img.depth.toFixed(2), alpha: +m.img.alpha.toFixed(2), m1: +T.merchant.sprite.depth.toFixed(2), m2: +T.merchant2.sprite.depth.toFixed(2), noXray: !!P.noXray };
      // (off the strip again: the chief counts for the x-ray as before; alpha is reported only — a porter walking behind the
      //  row fades the shop as it should)
      if (look) { F.teleport(T.x + 600, T.y + 600); window.__step.run(0.3); look.noXrayAfter = !!P.noXray; }
      g.events.off('traded', on);
      if (stash) { R.clerk = stash; stash.sprite.setVisible(true); R.setEnabled(true); }
      F.teleport(T.x + 600, T.y + 600);
      return { m1: n[1], m2: n[2], servers, look };
    }, who);
    const clerk = await rate('clerk');
    ok(clerk.m1 >= 160 && clerk.m1 <= 168 && clerk.m2 === 0, 'the 자재 clerk alone: one merchant buys (' + clerk.m1 + ' a min; trade post 163.6), the second merchant waits', clerk);
    const both = await rate('both');
    ok(both.m1 >= 160 && both.m1 <= 168 && both.m2 >= 207 && both.m2 <= 216 && both.servers === 2, 'the clerk + the chief on register 2: both merchants buy (' + both.m1 + ' + ' + both.m2 + ' a min = ' + (both.m1 + both.m2) + ')', both);
    const L = both.look || {};
    ok(L.chiefDepth > L.front && L.m1 > L.front && L.m2 > L.front && L.noXray && !L.noXrayAfter, 'the chief on register 2 and both merchants (in front of the 자재 counter, west of the row\'s middle) are drawn above the shop\'s layers; the chief does not fade the shop while there (x-ray), and does again once off the strip (shop alpha ' + L.alpha + ')', L);
    const solo = await rate('chief2only');
    ok(solo.m1 >= 207 && solo.m1 <= 216 && solo.m2 === 0, 'the chief alone on register 2 (no clerk): the first merchant buys at the chief\'s rate (' + solo.m1 + '), the second waits', solo);
  }
  // ---------------------------------------------------------------- 13. spawnMul at stage 4
  {
    const r = await ev(page, () => {
      const g = window.__FV.scene, m = g.market, real = m.spawnCustomer;
      // (the lines emptied first: a full line (maxQueue) spawns nobody; nobody joins while spawnCustomer only counts)
      for (const id in m.lanes) { const L = m.lanes[id]; for (const c of L.queue.slice()) { try { c.despawn(); } catch (e) { /* */ } } L.queue.length = 0; }
      for (const c of m.leaving.slice()) { try { c.despawn(); } catch (e) { /* */ } } m.leaving.length = 0;
      let n = 0;
      m.spawnCustomer = function () { n++; return null; };
      const count = (st, secs) => { m.setStage(st, true); n = 0; m.spawnT = 0; window.__step.run(secs); return n; };
      const secs = 900;
      const s2 = count(2, secs), s3 = count(3, secs), s4 = count(4, secs);
      m.spawnCustomer = real;
      m.setStage(4, true);
      return { s2, s3, s4, r42: +(s4 / s2).toFixed(3), r43: +(s4 / s3).toFixed(3), mul: window.__BAL && window.__BAL.market43 && window.__BAL.market43.spawnMul };
    });
    ok(r.r42 > 1.12 && r.r42 < 1.28 && r.s4 > r.s3, 'spawnMul: stage 4 brings ~1.2x the customers of stage 2, more than stage 3 (same spawn points)', r);
  }
  // ---------------------------------------------------------------- 14. save + reload at stage 4
  {
    const sv = await ev(page, () => {
      const g = window.__FV.scene, m = g.market, T = g.trade;
      for (const ty of ['item_fish_cooked', 'item_meat_cooked']) while (m.stock.countOf(ty) < 75) m.stock.push(ty, null, g.effects);
      for (const ty of ['item_plank', 'item_ingot']) while (T.stock.countOf(ty) < 72) T.stock.push(ty, null, g.effects);
      g.save(true);
      return { save: localStorage.getItem('frostVillage.save.v1'), till: m.cash.value };
    });
    const b3 = await boot(sv.save);
    await until(b3.page, () => !window.__FV.assets().pending('market_s4_back'), 40);
    const r = await ev(b3.page, () => { const g = window.__FV.scene, m = g.market, L = g.shopLoaded; return { stage: L.stage, fish: L.food.item_fish_cooked, meat: L.food.item_meat_cooked, plank: L.mat.item_plank, ingot: L.mat.item_ingot, max: m.maxPerType, clerks: Object.keys(m.seats).filter((k) => m.seats[k].clerk), open2: g.trade.open2, m2pad: m.seats.M2.pad.img.visible }; });
    ok(r.stage === 4 && r.fish >= 75 && r.meat >= 75 && r.plank >= 72 && r.ingot >= 72 && r.max === 80, 'a stage-4 village reloads at stage 4 with 75 a kind kept on the 80 racks (restore after progress.init set stage 4)', r);
    ok(r.clerks.join() === 'A,M,B' && r.open2 && r.m2pad, 'every clerk back, the second 자재 window open with its pad', r);
    const art = await shownArt(b3.page);
    ok(artOk(art, 4), 'after the reload the shop shows the stage-4 picture', art);
    errors.push(...b3.log.errors);
    await b3.page.context().close();
  }
  errors.push(...log.errors);
  await page.context().close();
  // ---------------------------------------------------------------- 8. old saves
  for (const f of ['v41_save_smart_25min.json', 'v41_save_smart_46min.json', 'v35_save_12min.json', 'v35_save_0_5min.json', 'v42_save_office_ttal.json']) {
    if (QUICK && f !== 'v41_save_smart_25min.json') continue;
    const raw = fs.readFileSync(path.join(FIX, f), 'utf8');
    const old = JSON.parse(raw);
    const b = await boot(raw);
    const r = await ev(b.page, () => {
      const g = window.__FV.scene, m = g.market, T = g.trade, L = g.shopLoaded || { food: {}, mat: {} };
      return {
        stage: m.stage, flags: { shop43: !!g.progress.flags.shop43 }, mat: { plank: L.mat.item_plank, ingot: L.mat.item_ingot },
        food: { fish: L.food.item_fish_cooked, bread: L.food.item_bread, meat: L.food.item_meat_cooked },
        till: L.till, over: L.over, matClerk: !!m.seats.M.clerk, aClerk: !!m.seats.A.clerk, bClerk: !!m.seats.B.clerk, coins: g.economy.coins,
        tradeOn: T.enabled, done: Object.keys(g.progress.done).filter((k) => g.progress.done[k]),
      };
    });
    const pd = old.progress.done || {}, tr = old.trade || { stock: {}, cash: 0 }, mk = old.market || { stock: {}, cash: 0 };
    const want = pd.zone_forest ? (pd.op_bakery || (old.progress.hints || {}).farm ? 3 : 2) : 1;
    ok(r.stage === want && r.flags.shop43, f + ': stage ' + want + ' from its progress', r);
    const cap = r.stage >= 3 ? 60 : 40;
    ok(r.mat.plank === Math.min(cap, tr.stock.item_plank || 0) && r.mat.ingot === Math.min(cap, tr.stock.item_ingot || 0), f + ': the trade post\'s planks / ingots on the 자재 창구 rack', { old: tr.stock, now: r.mat });
    ok(r.food.fish === Math.min(cap, mk.stock.item_fish_cooked || 0) && !r.food.bread && r.food.meat === Math.min(cap, mk.stock.item_meat_cooked || 0), f + ': the stall\'s fish / meat on the food rack, its bread gone to the bakery', { old: mk.stock, now: r.food });
    ok(Math.abs(r.till - ((mk.cash || 0) + (tr.cash || 0))) <= 1 && r.coins >= (old.coins || 0), f + ': the trade post\'s coins in the shop\'s till, the wallet kept', { till: r.till, old: (mk.cash || 0) + (tr.cash || 0), coins: r.coins, oldCoins: old.coins });
    if (pd.hire_clerk_trade) ok(r.matClerk && r.tradeOn, f + ': the trade post\'s clerk is the 자재 점원', r);
    if (want === 3) ok(r.bClerk && r.aClerk, f + ': stage 3 for free with its 고기 clerk (one clerk sold every food there)', r);
    if (want >= 2) { const a8 = await shownArt(b.page); ok(artOk(a8, want), f + ': the stage-' + want + ' picture is shown', a8); }
    const lost = Object.keys(pd).filter((k) => pd[k] && r.done.indexOf(k) < 0);
    ok(!lost.length, f + ': every step it had is still done', lost);
    errors.push(...b.log.errors);
    await b.page.context().close();
  }
} catch (e) { console.log('FATAL', e.stack || e); fail++; }
ok(errors.length === 0, '0 page errors', errors.slice(0, 3));
await browser.close(); await srv.close();
console.log(`market43: ${pass} ok, ${fail} failed`);
process.exit(fail ? 1 : 0);
