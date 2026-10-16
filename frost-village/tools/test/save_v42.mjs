// (v4.2, docs/v42_plan.md §10 + §15) save v7, Node only:
//   node tools/test/save_v42.mjs
// - real v4.1 saves (tools/test/fixtures/v41_save_*: the smart / pure bots at 25–46 min, save version 6) and the real
//   v3.5 saves migrate to v7 with nothing lost; the dock backlog is capped to two train loads
// - sanitizeV42: 300 fuzzed variants never throw, its output passes itself unchanged, a full block round-trips
// - the `bank` slice v4.2 writes passes src/bank/save.js sanitizeBank unchanged, and Save.keepBank (the local copy
//   of its keep rules) agrees with the module on 300 random slices
// - the `logistics` slice v4.2 writes passes src/city/logistics/save.js sanitizeLogistics unchanged, and
//   Save.keepLogistics agrees with the module on 300 random slices
// - a full v7 save with a maximal v42 block stays ≤ 10 KB
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIGRATE, sanitizeSave, sanitizeV42, keepBank, keepLogistics, SAVE_VERSION } from '../../src/core/Save.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const FIX = path.join(HERE, 'fixtures');
const fail = [];
const check = (name, ok, info = '') => { console.log((ok ? '  ok  ' : ' FAIL ') + name + (info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 300) : '')); if (!ok) fail.push(name); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const migrate = (o) => { o = clone(o); let g = 20; while (o.v !== SAVE_VERSION && MIGRATE[o.v] && g-- > 0) o = MIGRATE[o.v](o); return sanitizeSave(o); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

check('SAVE_VERSION is 7', SAVE_VERSION === 7);
check('a v6 -> v7 step exists', typeof MIGRATE[6] === 'function');

// ---------------------------------------------------------------- real v4.1 saves
const v41 = fs.readdirSync(FIX).filter((f) => /^v41_save_.*\.json$/.test(f)).sort();
check('real v4.1 saves present', v41.length >= 4, v41.join(', '));
for (const f of v41) {
  const raw = JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
  const s = migrate(raw);
  const base = sanitizeSave(Object.assign(clone(raw), { v: SAVE_VERSION }));
  const doneA = Object.keys(raw.progress.done || {}).filter((k) => raw.progress.done[k]);
  check(f + ': v6 -> v7', raw.v === 6 && s && s.v === 7);
  check(f + ': coins, steps, stations, land, sites, piles, dog, life kept', s.coins === raw.coins && doneA.every((k) => s.progress.done[k]) && same(s.stations, base.stations) && same(s.territory, base.territory) && same(s.sites, base.sites) && same(s.labour, base.labour) && same(s.dog, base.dog) && same(s.life, base.life));
  const cap = 2 * 56;
  const before = Object.values((raw.v4 && raw.v4.cargo) || {}).reduce((a, b) => a + b, 0), after = Object.values((s.v4 && s.v4.cargo) || {}).reduce((a, b) => a + b, 0);
  check(f + ': dock backlog capped to two train loads (' + before + ' -> ' + after + ')', after <= cap && after === Math.min(before, cap));
  check(f + ': the v4 block otherwise kept (orders, shops, houses, rank, clock)', same(Object.assign({}, s.v4, { cargo: null }), Object.assign({}, base.v4, { cargo: null })));
  check(f + ': no v42 / bank / logistics block invented by the migration', !s.v42 && !s.bank && !s.logistics);
}
// ---------------------------------------------------------------- v3.5 saves still come all the way
for (const f of fs.readdirSync(FIX).filter((q) => /^v35_save_.*\.json$/.test(q)).sort()) {
  const raw = JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
  const s = migrate(raw);
  check(f + ': v4 -> v7, coins and steps kept', s && s.v === 7 && s.coins === raw.coins && Object.keys(raw.progress.done || {}).every((k) => !raw.progress.done[k] || s.progress.done[k]));
}

// ---------------------------------------------------------------- the v42 block
const full = {
  v: 1,
  office: { st: 2, site: { paid: 300, got: { item_plank: 4 } }, staff: [123456789, 987654321, 42, 4294967295], bag: 1240, safe: 300, bankSt: 2, log: [[12, 'courier', 6240, 560], [12, 'trade', 1300, 600]] },
  news: { day: 12, papers: [[10, [['news_sales', 312, 1040], ['news_movein', 2, 0]]], [11, [['news_train', 14, 0]]], [12, [['news_record', 5000, 0]]]] },
  letters: { seq: 9, inbox: [[7, 'lt_bakery', 0, 11], [8, 'lt_minji', 1, 12]], once: ['lt_minji', 'lt_cafe'], nextT: 70 },
  up: { grill: 1, smelter: 1 }, p2: ['sawmill', 'bakery'],
  train: { stage: 2, big: 1, labels: 3 },
  freight: { dock: { item_plank: 30, item_ingot: 12 }, cars: { item_bread: 20 } },
  depot: { st: 2, sleighs: 2, load: { item_ore: 40 }, porters34: 2, sales: [12, 312, 1040] },
  ledger: { full: { 'out:smelter': 120, 'pile:ore': 300 } },
  seen: { whatsNew: 1, pickupTip: 1, cheer: 3, p2: { sawmill: 1 }, up: { grill: 1 }, big: { bigcar: 1 } },
  full: { smelter: 95, sawmill: 40 },
  offerPaid: { st2_bakery: 300 },
};
const s1 = sanitizeV42(full);
check('sanitizeV42 keeps a full block', !!s1 && s1.office.st === 2 && s1.office.staff[3] === 4294967295 && s1.train.stage === 2 && s1.freight.dock.item_plank === 30 && s1.depot.porters34 === 2 && s1.up.grill === 1 && s1.p2.length === 2 && s1.letters.inbox.length === 2 && s1.full.smelter === 95 && s1.offerPaid.st2_bakery === 300, s1);
check('sanitizeV42 output passes itself unchanged', same(sanitizeV42(s1), s1));
const junk = [null, undefined, 0, -1, 1e99, NaN, 'x', '', [], {}, [1, 2], { a: 1 }, true, -0.5, 'item_plank', ['lt_minji'], { item_plank: -3 }, { evil: { __proto__: 1 } }];
const mutate = (o, depth) => {
  if (depth > 3 || rnd() < 0.2) return pick(junk);
  if (Array.isArray(o)) return o.map((x) => (rnd() < 0.3 ? mutate(x, depth + 1) : x)).concat(rnd() < 0.2 ? [pick(junk)] : []);
  if (o && typeof o === 'object') { const r = {}; for (const k in o) if (rnd() > 0.1) r[k] = rnd() < 0.3 ? mutate(o[k], depth + 1) : o[k]; if (rnd() < 0.2) r['k' + Math.floor(rnd() * 99)] = pick(junk); return r; }
  return rnd() < 0.5 ? pick(junk) : o;
};
let threw = 0, unstable = 0, bigOut = 0;
for (let k = 0; k < 300; k++) {
  const m = mutate(clone(full), 0);
  let a;
  try { a = sanitizeV42(m); } catch (e) { threw++; continue; }
  if (a && !same(sanitizeV42(a), a)) unstable++;
  if (a && JSON.stringify(a).length > 3000) bigOut++;
}
check('300 fuzzed v42 blocks: never throws, output stable, ≤ 3 KB', threw === 0 && unstable === 0 && bigOut === 0, { threw, unstable, bigOut });
// a whole save with the block round-trips through sanitizeSave
{
  const raw = JSON.parse(fs.readFileSync(path.join(FIX, v41[v41.length - 1]), 'utf8'));
  const s = migrate(raw);
  s.v42 = s1;
  s.bank = { v: 1, open: 1, sv: 0, ld: -1, tk: 1 };
  const a = sanitizeSave(clone(s));
  check('a v7 save with v42 + bank round-trips through sanitizeSave', !!a && same(a.v42, s1) && same(a.bank, s.bank));
  const big = clone(s);
  big.v42 = sanitizeV42(full);
  big.logistics = { v: 1, open: 1, gift: 1, tut: 1, day: 30, seq: 0, stock: { bread: 160, ore: 120, plank: 120, ingot: 60, fish_cooked: 100, meat_cooked: 90, log: 80, wheat: 70 }, orders: [], cash: 12345, chains: [], lv3: [], days: [90, 80, 70, 60, 50, 40, 30, 20, 10, 5], made: [0, 0], tot: [0, 123456, 999] };
  const size = JSON.stringify(sanitizeSave(big)).length;
  check('a full v7 save stays ≤ 10 KB (' + size + ' B)', size <= 10240);
}

// ---------------------------------------------------------------- module slices (contract tests)
const bankMod = path.join(ROOT, 'src/bank/save.js'), lgxMod = path.join(ROOT, 'src/city/logistics/save.js');
if (fs.existsSync(bankMod)) {
  const { sanitizeBank } = await import(bankMod);
  const ours = { v: 1, open: 1, sv: 0, ld: -1, tk: 1 };
  check('bank slice v4.2 writes passes sanitizeBank unchanged', same(sanitizeBank(ours), ours));
  let diff = 0;
  for (let k = 0; k < 300; k++) {
    const r = { v: pick([1, 2, undefined, 3]), open: pick([0, 1, true]), sv: pick([0, 500, -5, 1e12, 'x']), ld: pick([-1, 3, 1e9]), tk: pick([1, 5, 0, 2000]), so: pick([0, 1]), t5: pick([undefined, 1234.5, NaN]),
      ln: pick([undefined, { a: 1000, l: 800, f: 50, t0: 3, d0: 2, rs: 1, ps: 0, k: 'build' }, { l: -1 }]), rw: pick([undefined, [[1, 'deposit', 500, 500], [2, 'nope', 1, 1], [3, 'interest', 5, 505]]]), ins: pick([undefined, [['b1', 300, 7], ['b1', 2, 2], ['toolongidxx', 1, 1]]]) };
    if (!same(keepBank(r), sanitizeBank(r))) diff++;
  }
  check('Save.keepBank == sanitizeBank on 300 random slices', diff === 0, { diff });
} else console.log('  (src/bank not present: bank contract skipped)');
if (fs.existsSync(lgxMod)) {
  const { sanitizeLogistics } = await import(lgxMod);
  const ours = { v: 1, open: 1, gift: 1, tut: 1, day: 12, seq: 0, stock: { bread: 12, ore: 80 }, orders: [], cash: 340, chains: [], lv3: [], days: [5, 3], made: [0, 0], tot: [0, 1040, 312] };
  check('logistics slice v4.2 writes passes sanitizeLogistics unchanged', same(sanitizeLogistics(ours), ours), sanitizeLogistics(ours));
  let diff = 0, ex = null;
  for (let k = 0; k < 300; k++) {
    const r = { v: 1, open: pick([0, 1]), gift: pick([0, 1, true]), tut: pick([0, 1]), day: pick([-1, 3, 1e9, 'x']), seq: pick([0, 7, -2]),
      stock: pick([{ bread: 5, ore: 1e6 }, { item_bread: 3 }, {}, { Bad: 1, ok_k: 2 }]), orders: pick([[], [['o1', 'shop:cafe', 'svp', { bread: 2 }, {}]], [['o1', 'home:h1', 'svp', {}, {}]]]),
      cash: pick([0, 99, -1, 1e10]), chains: pick([[], [{ id: 'c1', k: 'f', in: 2, out: [1], m: 0, r: 0 }]]), lv3: pick([[], ['h1', 'h2']]), days: pick([[], [1, 2, 3]]), made: pick([[0, 0], [1, -1]]), tot: pick([[0, 0, 0], [1, 2, 3]]) };
    const a = keepLogistics(r), b = sanitizeLogistics(r);
    if (!same(a, b)) { diff++; if (!ex) ex = { r, a, b }; }
  }
  check('Save.keepLogistics == sanitizeLogistics on 300 random slices', diff === 0, ex || { diff });
} else console.log('  (src/city/logistics not present: logistics contract skipped)');

console.log(fail.length ? '\n' + fail.length + ' FAILED' : '\nall passed');
process.exit(fail.length ? 1 : 0);
