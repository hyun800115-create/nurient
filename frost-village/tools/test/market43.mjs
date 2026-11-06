// (v4.3 「마을 새 단장」 step A, docs/redesign_v43/engineering_plan.md §4.2 / §8) the staged plaza shop, fixed-step clock:
//   node tools/test/market43.mjs [--quick]
// 1. stage 1 = the 4.2.0.2 stall: one food line, no 자재 창구 (gs.trade off), no trade post anywhere
// 2. the forest brings stage 2 (mkt_s2 comes with zone_forest): 자재 창구 (west) + 먹거리, the merchant at the 자재 창구,
//    the first clerk at the food counter's post, the till / racks moved, the stage-2 page loaded
// 3. the first bread sold shows the 눈꽃 시장 pad (400 + 8 planks) on the stall clerk's spot; buying it -> stage 3
//    (자재 · 생선 · 빵·고기), racks 60 a kind, then the 빵·고기 clerk's pad
// 4. lines by kind, served-only: with only the fish clerk, every new customer wants fish; the chief on the 빵·고기 register
//    opens it at once (new customers want bread / meat there and pay); off it, the ones who got nothing go to a served line
// 5. switching: fish out for market43.switchS s -> the fish line's front customer moves to the 빵·고기 line and wants bread
// 6. spawnMul: customers come 1.1x as often at stage 3 as at stage 2 (same spawn points)
// 7. the merchant at the 자재 창구 buys at the trade post's rate: 22 frames a plank with the clerk (163.6 a min), 17 with
//    the chief (211.8 a min) — the M0 baseline's numbers
// 8. old saves (4.1 smart 25 / 46 min, 3.5 12 min): the trade post's planks / ingots on the 자재 창구 rack, its coins in the
//    shop's till, its clerk the 자재 점원; stage from progress (bread selling -> 3, free, with the 빵·고기 clerk); nothing lost
// 9. save + reload of a stage-3 village keeps the stage, 60-a-kind racks and the till; 0 page errors
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, until } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures');
const QUICK = process.argv.includes('--quick');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra).slice(0, 300) : '')); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 600) : '')); } };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
async function boot(save) {
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: 1 });
  await page.evaluate((sv) => { try { localStorage.clear(); if (sv) localStorage.setItem('frostVillage.save.v1', sv); } catch (e) { /* */ } }, save);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
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
    await ev(page, () => { const F = window.__FV; F.give(20000); for (const id of ['op_sawmill', 'hire_lumberjack', 'zone_farm', 'op_bakery', 'hire_farmer', 'zone_mine', 'op_smelter', 'hire_miner', 'zone_hunt']) F.doneStep(id); });
    await advance(page, 2);
    const before = await ev(page, () => !!window.__FV.scene.progress.pads.mkt_s3);
    ok(!before, 'no 눈꽃 시장 pad before the first bread is sold');
    // a customer buys bread: the flag comes from the sale itself
    await ev(page, () => {
      const g = window.__FV.scene, m = g.market, L = m.lanes.food;
      for (const c of L.queue.slice()) { c.despawn(); }
      L.queue.length = 0;
      for (let i = 0; i < 6; i++) m.stock.push('item_bread', null, g.effects);
      const c = m.spawnCustomer(0); c.setWant('item_bread'); c.want.count = 1; c.need = 1;
      m.spawnT = 1e9;
    });
    await until(page, () => !!window.__FV.scene.progress.flags.firstBreadSale, 20);
    await advance(page, 2);
    const p = await ev(page, () => { const g = window.__FV.scene, pd = g.progress.pads.mkt_s3; return pd ? { x: pd.x, y: pd.y, cost: pd.cost, items: pd.items } : null; });
    ok(!!p && p.x === 1525 && p.y === 900 && p.cost === 400 && p.items && p.items.item_plank === 8, 'the first bread sold shows the 눈꽃 시장 pad (400 + 8 planks) on the stall clerk\'s spot', p);
    await ev(page, () => { window.__FV.completeStep('mkt_s3'); window.__FV.scene.market.spawnT = 1; });
    await advance(page, 3);
    await until(page, () => !window.__FV.assets().pending('market_s3_back'), 40);
    const r = await ev(page, () => {
      const g = window.__FV.scene, m = g.market;
      return { stage: m.stage, open: Object.keys(m.lanes).filter((k) => m.lanes[k].open), A: m.seats.A.seller.id, B: !!m.seats.B.clerk, max: m.maxPerType, matMax: g.trade.maxPerType, pad: !!g.progress.pads.hire_clerk_s3, loaded: window.__FV.assets().has('market_s3_back') };
    });
    ok(r.stage === 3 && r.open.join() === 'fish,breadmeat' && r.A === 'fish' && !r.B, 'stage 3: 자재 · 생선 · 빵·고기, the first clerk at the fish counter', r);
    ok(r.max === 60 && r.matMax === 60 && r.loaded, 'stage 3: 60 a kind on both racks, its page loaded', r);
    ok(r.pad, 'the 빵·고기 clerk\'s pad comes after the stage', r);
  }
  // ---------------------------------------------------------------- 4. served-only lines, the chief opens a counter
  {
    const r = await ev(page, () => {
      const g = window.__FV.scene, m = g.market, F = window.__FV;
      for (const ty of ['item_fish_cooked', 'item_bread', 'item_meat_cooked']) while (m.stock.countOf(ty) < 30) m.stock.push(ty, null, g.effects);
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
      const n = { fish: 0, bread: 0, meat: 0, lane: {}, chief: R.chief, served: m.lanes.breadmeat.served };
      for (let i = 0; i < 300; i++) { const w = m.makeWant(); n[w.type.replace('item_', '').replace('_cooked', '')]++; n.lane[w.lane.id] = (n.lane[w.lane.id] || 0) + 1; }
      return n;
    });
    ok(r2.chief && r2.served && r2.bread + r2.meat > 60 && r2.lane.breadmeat === r2.bread + r2.meat, 'the chief on the 빵·고기 register opens it at once: bread / meat customers come to that line', r2);
    // the chief serves the opened line for a while: customers there pay
    const sold = await ev(page, () => {
      const g = window.__FV.scene, m = g.market;
      window.__soldBM = 0;
      g.events.on('sold', (v, c) => { if (c && c.market === m.lanes.breadmeat) window.__soldBM++; });
      m.spawnT = 0;
      window.__step.run(40);
      return { sold: window.__soldBM, q: m.lanes.breadmeat.queue.length };
    });
    ok(sold.sold >= 3, 'customers in the line the chief opened pay there', sold);
    // the chief steps off: the ones who got nothing go to a served line after switchS
    const off = await ev(page, () => {
      const g = window.__FV.scene, m = g.market, F = window.__FV, L = m.lanes.breadmeat;
      for (let i = 0; i < 4; i++) { const c = m.spawnCustomer(); m.lanes.fish.queue.splice(m.lanes.fish.queue.indexOf(c), 1); L.queue.push(c); c.market = L; c.setWant('item_bread'); }
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
      const g = window.__FV.scene, m = g.market, F = window.__FV, Lf = m.lanes.fish, Lb = m.lanes.breadmeat;
      for (const l of [Lf, Lb]) { for (const c of l.queue.slice()) c.despawn(); l.queue.length = 0; }
      m.spawnT = 1e9;
      while (m.stock.countOf('item_fish_cooked') > 0) { const q = m.stock.pop('item_fish_cooked'); if (q && q.spr) g.effects.releaseItem(q.spr); }
      while (m.stock.countOf('item_bread') < 30) m.stock.push('item_bread', null, g.effects);
      const c = m.spawnCustomer(0);
      if (c.market !== Lf) { c.market.queue.splice(c.market.queue.indexOf(c), 1); Lf.queue.unshift(c); c.market = Lf; }
      c.setWant('item_fish_cooked'); c.want.count = 2; c.need = 2;
      window.__step.run((window.__BAL && window.__BAL.market43 ? window.__BAL.market43.switchS : 4) + 1.5);
      return { inBM: c.market === Lb, want: c.want.type, servedB: Lb.served, bClerk: !!m.seats.B.clerk };
    });
    ok(r.inBM && r.want === 'item_bread', 'fish out for switchS s: the fish line\'s front customer moves to the 빵·고기 line and takes bread', r);
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
      for (const ty of ['item_fish_cooked', 'item_bread', 'item_meat_cooked']) while (m.stock.countOf(ty) < 55) m.stock.push(ty, null, g.effects);
      g.save(true);
      return { save: localStorage.getItem('frostVillage.save.v1'), till: m.cash.value, stock: m.stock.count };
    });
    const b2 = await boot(sv.save);
    const r = await ev(b2.page, () => { const g = window.__FV.scene, m = g.market, L = g.shopLoaded; return { stage: L.stage, fish: L.food.item_fish_cooked, bread: L.food.item_bread, till: L.till, clerks: Object.keys(m.seats).filter((k) => m.seats[k].clerk) }; });
    ok(r.stage === 3 && r.fish >= 55 && r.bread >= 55 && r.clerks.join() === 'A,M,B', 'a stage-3 village reloads at stage 3 (55 a kind kept on the 60 racks), every clerk back', r);
    ok(r.till >= sv.till, 'the till comes back (paid-for items in the line come back on the rack)', { saved: sv.till, now: r.till });
    errors.push(...b2.log.errors);
    await b2.page.context().close();
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
    ok(r.food.fish === Math.min(cap, mk.stock.item_fish_cooked || 0) && r.food.bread === Math.min(cap, mk.stock.item_bread || 0) && r.food.meat === Math.min(cap, mk.stock.item_meat_cooked || 0), f + ': the stall\'s food on the food rack', { old: mk.stock, now: r.food });
    ok(Math.abs(r.till - ((mk.cash || 0) + (tr.cash || 0))) <= 1 && r.coins >= (old.coins || 0), f + ': the trade post\'s coins in the shop\'s till, the wallet kept', { till: r.till, old: (mk.cash || 0) + (tr.cash || 0), coins: r.coins, oldCoins: old.coins });
    if (pd.hire_clerk_trade) ok(r.matClerk && r.tradeOn, f + ': the trade post\'s clerk is the 자재 점원', r);
    if (want === 3) ok(r.bClerk && r.aClerk, f + ': stage 3 for free with its 빵·고기 clerk (one clerk sold every food there)', r);
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
