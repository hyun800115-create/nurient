// (v4.2, docs/v42_plan.md §4.4 + §15) 서리 물류창고 model, Node only:
//   node tools/test/depot.test.mjs
// caps per category (materials 160, food 160, goods 120, tools 60; furniture / appliances refused), take() accepts
// what fits and the rest rides back, the walk-in buyers sell perMin per category only 07–20 h at price × rate (raw at
// rawPrice), coins = Σ sales, a new day rolls the 10-day history, and the v8 `logistics` slice round-trips through
// the constructor and passes src/city/logistics' sanitizer unchanged (read-only import, contract test).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const { Depot, V42_CATS } = await import(path.join(ROOT, 'src/systems/depot/Depot.js'));
const { catOf } = await import(path.join(ROOT, 'src/systems/depot/rack.js'));
const { BALANCE } = await import(path.join(ROOT, 'src/data/balance.js'));
const { priceOf } = await import(path.join(ROOT, 'src/data/items.js'));

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); } };
const D = BALANCE.v42.depot;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('racks');
{
  const M = new Depot();
  ok(V42_CATS.join() === 'materials,food,goods,tools', 'four categories');
  ok(M.capTotal() === D.caps.materials + D.caps.food + D.caps.goods + D.caps.tools, 'capTotal = Σ caps (' + M.capTotal() + ')');
  ok(M.wants('item_plank') && M.wants('item_bread') && M.wants('item_axe') && M.wants('item_log'), 'takes materials, food, tools and raw');
  ok(!M.wants('item_sofa') && !M.wants('item_fridge') && M.room('item_sofa') === 0, 'furniture / appliances refused (v8 only)');
  const plankCat = catOf('item_plank');
  const capP = D.caps[plankCat];
  const got = M.take([{ ty: 'item_plank', n: capP + 25 }, { ty: 'item_sofa', n: 3 }]);
  ok(got.length === 1 && got[0].n === capP && M.stock.total(plankCat) === capP, 'a load bigger than the rack: only what fits (' + capP + ')', got);
  ok(M.room('item_plank') === 0 && M.take([{ ty: 'item_plank', n: 4 }]).length === 0, 'a full category takes nothing more');
  ok(M.today.inflow === capP, 'inflow counts what was accepted');
  // the sleigh's unload: the rest rides back (DepotSystem.unload)
  const load = [{ ty: 'item_ingot', n: 10 }, { ty: 'item_bread', n: 30 }];
  const acc = M.take(load);
  const back = load.map((q) => ({ ty: q.ty, n: q.n - ((acc.find((x) => x.ty === q.ty) || {}).n || 0) })).filter((q) => q.n > 0);
  ok(back.length === 1 && back[0].ty === 'item_ingot' && back[0].n === 10, 'materials full: the ingots ride back, the bread is shelved', back);
}

console.log('buyers');
{
  const M = new Depot();
  M.take([{ ty: 'item_bread', n: 100 }, { ty: 'item_plank', n: 100 }, { ty: 'item_axe', n: 30 }, { ty: 'item_log', n: 40 }]);
  ok(M.sell(60, 3).length === 0 && M.sell(60, 21).length === 0, 'closed before 07:00 and from 20:00');
  let sold = [];
  for (let s = 0; s < 600; s++) sold = sold.concat(M.sell(0.1, 12));   // one game minute at noon
  const byCat = {};
  for (const q of sold) byCat[catOf(q.ty)] = (byCat[catOf(q.ty)] || 0) + q.n;
  const per = D.sell.perMin;
  ok(Math.abs((byCat.food || 0) - per.food) <= 1 && Math.abs((byCat.materials || 0) - per.materials) <= 1 && Math.abs((byCat.tools || 0) - per.tools) <= 1, 'one open minute sells perMin per category', { byCat, per });
  ok(!byCat.goods, 'no goods in stock: none sold');
  const coins = sold.reduce((a, q) => a + q.coins, 0);
  ok(coins === M.today.coins && sold.length === M.today.sales, 'today: sales and coins are the sum of the sales');
  const bread = sold.find((q) => q.ty === 'item_bread');
  ok(bread && bread.coins === Math.max(1, Math.round(priceOf('item_bread') * D.sell.rate)), 'price × sell.rate (' + (bread && bread.coins) + ')');
  ok(M.priceOf('item_log') === Math.max(1, Number(D.rawPrice && D.rawPrice.item_log) || 1), 'raw at rawPrice');
  // an empty category stops selling, never goes negative
  const E = new Depot();
  E.take([{ ty: 'item_axe', n: 2 }]);
  let n = 0;
  for (let s = 0; s < 1200; s++) n += E.sell(0.1, 10).length;
  ok(n === 2 && E.stock.total('tools') === 0, 'two axes: two sales, then nothing');
}

console.log('days and the v8 slice');
{
  const M = new Depot();
  M.newDay(4);
  M.take([{ ty: 'item_bread', n: 50 }]);
  for (let s = 0; s < 600; s++) M.sell(0.1, 9);
  const s0 = M.today.sales;
  M.newDay(5);
  ok(M.days[0] === s0 && M.today.sales === 0 && M.day === 5, 'a new day: yesterday into the history');
  for (let d = 6; d < 20; d++) M.newDay(d);
  ok(M.days.length === 10, 'history ≤ 10 days');
  const sl = M.slice();
  ok(sl.v === 1 && sl.open === 1 && sl.gift === 1 && sl.tut === 1 && Array.isArray(sl.orders) && Array.isArray(sl.chains) && Array.isArray(sl.lv3), 'slice: v8 opens with the centre built, gift + tutorial done');
  ok(Object.keys(sl.stock).every((k) => !/^item_/.test(k)), 'slice stock keys without item_');
  const R = new Depot(JSON.parse(JSON.stringify(sl)));
  ok(same(R.stock.snapshot(), M.stock.snapshot()) && R.day === M.day && same(R.days, M.days) && same(R.tot, M.tot), 'the slice round-trips through new Depot(slice)');
  const lgxMod = path.join(ROOT, 'src/city/logistics/save.js');
  if (fs.existsSync(lgxMod)) {
    const { sanitizeLogistics } = await import(lgxMod);
    ok(same(sanitizeLogistics(sl), sl), 'sanitizeLogistics(slice) == slice (contract)', sanitizeLogistics(sl));
    const big = new Depot();
    big.take([{ ty: 'item_plank', n: 999 }, { ty: 'item_bread', n: 999 }, { ty: 'item_axe', n: 999 }, { ty: 'item_ingot', n: 999 }]);
    const s2 = big.slice();
    ok(same(sanitizeLogistics(s2), s2), 'a full depot slice passes unchanged too');
  } else console.log('  (src/city/logistics not present: contract skipped)');
  const bad = new Depot({ stock: { sofa: 5, bread: -3, plank: 'x', ingot: 1e9 }, days: 'no', tot: [1, -5, 7] });
  ok(bad.stock.total('materials') <= D.caps.materials && !bad.stock.snapshot().item_sofa && bad.tot[1] === 0, 'a hostile slice is clamped (caps, no sofas, no negatives)', bad.stock.snapshot());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
