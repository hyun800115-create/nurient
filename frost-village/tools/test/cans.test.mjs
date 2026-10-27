// (v4.2.1 고기 통조림, docs/build_reports/v421_l0.md §10) Node only:
//   node tools/test/cans.test.mjs
// 1 pickCanKind (src/systems/cans.js): only one kind ready → that one; none → null; meat ignored while the line is off;
//   both ready → more whole batches first, a tie alternates (1,000 calls 49–51 %); one ingot with both ready → the
//   fuller one; a tuna (3 units) is one fish batch; 10,000 random pads never pick a kind whose batch is incomplete
// 2 balanceCheck: 0 warnings with the shipped balance.js; meatcan.inPrio is kept below the 훈제장's input (60) and ≥ 40
// 3 items.js: the old ITEMS / STORE_GOODS are prefixes of the new lists (old item indices stay), meat cans last
// 4 Save: sanitizeSave keeps the cannery's raw meat and meat cans everywhere (store / outs / 창고 / player / cards),
//   progress.flags.meatCan, progress.seen.mcanOffer; sanitizeV42 keeps seen.up.mcan and offerPaid.mcan; 300 fuzzed
//   saves never throw
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
// (Save.js reads localStorage / window lazily; a tiny stand-in keeps the import quiet in Node)
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const { pickCanKind } = await import(path.join(ROOT, 'src/systems/cans.js'));
const { BALANCE } = await import(path.join(ROOT, 'src/data/balance.js'));
const { checkBalance } = await import(path.join(ROOT, 'src/data/balanceCheck.js'));
const items = await import(path.join(ROOT, 'src/data/items.js'));
const Save = await import(path.join(ROOT, 'src/core/Save.js'));

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); } };

console.log('1 pickCanKind');
{
  const P = (o) => pickCanKind(Object.assign({ fishUnits: 0, meat: 0, ingot: 0, meatOn: true, last: null }, o));
  ok(P({ fishUnits: 3, ingot: 1 }) === 'fish', 'only fish ready → fish');
  ok(P({ meat: 3, ingot: 1 }) === 'meat', 'only meat ready → meat');
  ok(P({ fishUnits: 2, meat: 2, ingot: 5 }) === null, 'no whole batch → null');
  ok(P({ fishUnits: 9, meat: 9, ingot: 0 }) === null, 'no ingot → null');
  ok(P({ meat: 9, ingot: 3, meatOn: false }) === null && P({ fishUnits: 3, meat: 9, ingot: 3, meatOn: false }) === 'fish', 'meat ignored while the line is off');
  ok(P({ fishUnits: 3, meat: 9, ingot: 1, last: 'meat' }) === 'meat', 'both ready → the input with more batches (meat 3 > fish 1)');
  ok(P({ fishUnits: 12, meat: 3, ingot: 1, last: 'fish' }) === 'fish', 'both ready → the input with more batches (fish 4 > meat 1)');
  ok(P({ fishUnits: 6, meat: 6, ingot: 2, last: 'fish' }) === 'meat' && P({ fishUnits: 6, meat: 6, ingot: 2, last: 'meat' }) === 'fish', 'a tie → not the kind made last');
  ok(P({ fishUnits: 3, meat: 6, ingot: 1, last: 'meat' }) === 'meat', 'one ingot, both ready → the fuller input');
  // a tie alternates over 1,000 calls (each call's result becomes `last`)
  let last = null, meat = 0;
  for (let i = 0; i < 1000; i++) { last = P({ fishUnits: 6, meat: 6, ingot: 2, last }); if (last === 'meat') meat++; }
  ok(meat >= 490 && meat <= 510, 'a steady tie alternates (' + meat / 10 + ' % meat)');
  // a tuna (3 units) counts as one batch: the Workshop passes fish units
  ok(P({ fishUnits: 3, ingot: 1, meat: 0 }) === 'fish', 'a tuna (3 units) is one fish batch');
  // random pads: never a kind whose batch is incomplete; never null while a batch is ready
  let bad = 0, miss = 0;
  let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) >>> 0; return seed % n; };
  for (let i = 0; i < 10000; i++) {
    const s = { fishUnits: rnd(20), meat: rnd(20), ingot: rnd(4), meatOn: rnd(4) > 0, last: ['fish', 'meat', null][rnd(3)] };
    const k = pickCanKind(s);
    const fishOk = s.fishUnits >= 3 && s.ingot >= 1, meatOk = s.meatOn && s.meat >= 3 && s.ingot >= 1;
    if ((k === 'fish' && !fishOk) || (k === 'meat' && !meatOk)) bad++;
    if (k === null && (fishOk || meatOk)) miss++;
  }
  ok(bad === 0 && miss === 0, '10,000 random pads: never an incomplete batch, never idle with a batch ready', { bad, miss });
}

console.log('2 balanceCheck');
{
  const warns = [];
  const ow = console.warn; console.warn = (...a) => warns.push(a.join(' '));
  checkBalance();
  ok(warns.length === 0, 'the shipped balance.js: 0 warnings', warns.slice(0, 3));
  const keep = BALANCE.meatcan.inPrio;
  BALANCE.meatcan.inPrio = 70; checkBalance();
  ok(BALANCE.meatcan.inPrio === 59, 'meatcan.inPrio 70 is kept below the 훈제장 input (→ 59)', BALANCE.meatcan.inPrio);
  BALANCE.meatcan.inPrio = 10; checkBalance();
  ok(BALANCE.meatcan.inPrio === 40, 'meatcan.inPrio 10 → 40 (a real-use job)', BALANCE.meatcan.inPrio);
  BALANCE.meatcan.inPrio = keep;
  const k2 = BALANCE.meatcan.pileKeep; BALANCE.meatcan.pileKeep = 0.9; checkBalance();
  ok(BALANCE.meatcan.pileKeep < BALANCE.meatcan.pileFrom, 'pileKeep stays below pileFrom', BALANCE.meatcan);
  BALANCE.meatcan.pileKeep = k2;
  console.warn = ow;
  ok(BALANCE.prices3.item_can_meat === 12, 'prices3.item_can_meat 12');
}

console.log('3 items.js');
{
  const OLD_ITEMS = ['item_fish_raw', 'item_fish_cooked', 'item_log', 'item_plank', 'item_wheat', 'item_bread', 'item_ore', 'item_ingot', 'item_meat_raw', 'item_meat_cooked',
    'item_can', 'item_fish_big', 'item_axe', 'item_pickaxe', 'item_rod', 'item_sickle', 'item_bow'];
  const OLD_STORE = ['item_can', 'item_axe', 'item_pickaxe', 'item_rod', 'item_sickle', 'item_bow'];
  ok(OLD_ITEMS.every((k, i) => items.ITEMS[i] === k) && items.ITEMS[items.ITEMS.length - 1] === 'item_can_meat' && items.ITEMS.length === OLD_ITEMS.length + 1, 'ITEMS: the old list is a prefix, item_can_meat last');
  ok(OLD_STORE.every((k, i) => items.STORE_GOODS[i] === k) && items.STORE_GOODS[6] === 'item_can_meat' && items.STORE_GOODS.length === 7, 'STORE_GOODS: the old six first, meat cans 7th');
  ok(items.FOODS.indexOf('item_can_meat') < 0 && items.MINER_FOOD.indexOf('item_can_meat') < 0, 'not a food (판매대 / 큰 식당 / 식량 상자 never take it)');
  ok(items.priceOf('item_can_meat') === 12, 'priceOf(item_can_meat) 12');
}

console.log('4 saves');
{
  const raw = {
    version: 7, coins: 5000,
    progress: { done: { hire_fisherman: true, op_cannery: true }, flags: { meatCan: true, firstSale: true }, seen: { mcanOffer: true }, celebrated: true },
    player: { x: 100, y: 200, stack: ['item_can_meat', 'item_can_meat', 'item_meat_raw'] },
    v3: {
      workshops: { cannery: { ins: { item_fish_raw: 4, item_ingot: 2, item_meat_raw: 7 }, outs: { item_can: 3, item_can_meat: 6 } } },
      warehouse: { item_can_meat: 11, item_can: 2 },
      store: { stock: { item_can: 1, item_can_meat: 9 }, cash: 40 },
    },
    v42: { v: 1, seen: { up: { mcan: 1, smelter: 1 } }, offerPaid: { mcan: 700 } },
  };
  const s = Save.sanitizeSave(JSON.parse(JSON.stringify(raw)));
  const C = s.v3 && s.v3.workshops && s.v3.workshops.cannery;
  ok(C && C.ins.item_meat_raw === 7 && C.ins.item_fish_raw === 4 && C.outs.item_can_meat === 6 && C.outs.item_can === 3, 'cannery input raw meat + output meat cans kept', C);
  ok(s.v3.warehouse.item_can_meat === 11, '창고 meat cans kept');
  ok(s.v3.store.stock.item_can_meat === 9, '잡화점 meat cans kept');
  ok(s.player.stack.filter((k) => k === 'item_can_meat').length === 2, "the chief's meat cans kept");
  ok(s.progress.flags.meatCan === true && s.progress.seen.mcanOffer === true, 'progress.flags.meatCan + seen.mcanOffer kept');
  ok(s.v42 && s.v42.seen && s.v42.seen.up && s.v42.seen.up.mcan === 1, 'v42.seen.up.mcan kept');
  ok(s.v42 && s.v42.offerPaid && s.v42.offerPaid.mcan === 700, 'v42.offerPaid.mcan kept');
  // an older save without any of it: nothing appears
  const old = Save.sanitizeSave({ version: 7, coins: 10, progress: { done: { hire_fisherman: true } }, v3: { workshops: { cannery: { ins: { item_fish_raw: 3 }, outs: { item_can: 3 } } } } });
  ok(!old.progress.flags.meatCan && !(old.v3.workshops.cannery.ins.item_meat_raw), 'an older save: no flag, no raw meat on the cannery');
  // fuzz: never throws
  let threw = 0;
  let seed = 11; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const junk = () => { const r = rnd(); return r < 0.2 ? -5 : r < 0.4 ? 'x' : r < 0.5 ? null : r < 0.6 ? { a: 1 } : r < 0.7 ? [1, 'item_can_meat'] : Math.floor(rnd() * 100); };
  for (let i = 0; i < 300; i++) {
    const f = JSON.parse(JSON.stringify(raw));
    f.v3.workshops.cannery.ins.item_meat_raw = junk(); f.v3.workshops.cannery.outs.item_can_meat = junk();
    f.v3.store.stock.item_can_meat = junk(); f.progress.flags.meatCan = junk(); f.v42.offerPaid.mcan = junk(); f.v42.seen.up = rnd() < 0.5 ? junk() : { mcan: junk() };
    if (rnd() < 0.3) f.v3.workshops.cannery = junk();
    try { Save.sanitizeSave(f); } catch (e) { threw++; }
  }
  ok(threw === 0, '300 fuzzed saves never throw');
}

console.log(fail ? `cans: ${pass}/${pass + fail} passed` : `cans: ${pass}/${pass} passed`);
process.exit(fail ? 1 : 0);
