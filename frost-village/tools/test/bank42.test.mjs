// (v4.2, docs/v42_plan.md §6.5–6.6 + §15) the coin courier's books and the bank slice, Node only (Phaser stubbed):
//   node tools/test/bank42.test.mjs
// Courier conservation over 500 random rounds: coins leave the tills only through takeTill, reach the wallet only
// through deposit, and Σ taken = Σ deposited + the sack at every step (also across a save in the middle of a round:
// the sack is saved and handed back); no till below 0; the 역 / 물류 금고 drop out of the round from 읍 on; the
// passbook keeps the last 8 rows; deposits before the bank go to the office safe; the `bank` slice v4.2 writes passes
// src/bank/save.js sanitizeBank unchanged (read-only import, contract test), and keeps v5's own fields on a resave.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// a do-nothing Phaser (the office module's entities import it; this test never draws)
const H = { get(t, k) { if (k === Symbol.toPrimitive) return () => 0; if (!(k in t)) t[k] = new Proxy(function () {}, H); return t[k]; }, construct() { return new Proxy({}, H); }, apply() { return new Proxy(function () {}, H); } };
globalThis.Phaser = new Proxy(function () {}, H);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const { Office } = await import(path.join(ROOT, 'src/systems/office/Office.js'));

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function village(rank = 1) {
  const till = (v) => ({ value: v, enabled: true, pile: null, pad: null, x: 0, y: 0 });
  const events = [];
  const gs = {
    market: { cash: till(0) }, trade: { enabled: true, cash: till(0) }, store: { enabled: true, cash: till(0) },
    civic: { restaurant: { cash: till(0) }, hall: { tax: till(0) } },
    v4: { rank: { level: rank }, growth: { active: true, till: till(0) }, clock: { on: true, day: () => 3, hour: () => 10.5 } },
    economy: { coins: 0, earned: 0, add(n) { n = Math.floor(n); if (n > 0) { this.coins += n; this.earned += n; } } },
    effects: { fly() {}, releaseItem() {}, floatText() {} },
    events: { emit: (e, n) => events.push([e, n]), on() {}, off() {} },
    isOnScreen: () => false, sites: {}, time: { now: 0 },
  };
  const v42 = { depot: { till: till(0) }, savedBank: null };
  return { gs, v42, events };
}

console.log('courier conservation');
{
  const { gs, v42 } = village(1);
  const O = new Office(gs, v42, null);
  O.building = { spots: { safe: { x: 0, y: 0 } } };
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  let taken = 0, dep = 0, bag = 0, made = 0, neg = 0, broke = 0;
  const courier = { x: 0, y: 0 };
  const tillsAll = () => O.tills().map((q) => q.till);
  for (let r = 0; r < 500; r++) {
    // sales put coins on the tills
    for (const q of O.tills()) if (rnd() < 0.6) { const n = Math.floor(rnd() * 300); q.till.value += n; made += n; }
    // a round: the tills ≥ 100 by nearest neighbour (here: in order), then the counter
    for (const q of O.tills()) { if (q.till.value < 100) continue; const n = O.takeTill(q, courier); taken += n; bag += n; if (q.till.value < 0) neg++; }
    if (rnd() < 0.8) { const e0 = gs.economy.earned; O.deposit(bag, courier); dep += bag; if (gs.economy.earned - e0 !== bag) broke++; bag = 0; }
    if (taken !== dep + bag) broke++;
  }
  const left = tillsAll().reduce((a, t) => a + t.value, 0);
  ok(broke === 0, 'Σ taken = Σ deposited + the sack after every round, and every deposit reaches the wallet');
  ok(neg === 0, 'no till below 0');
  ok(made === left + taken, 'coins made = coins still on the tills + coins taken (' + made + ')');
  ok(O.depositedTotal === dep && gs.economy.earned === dep, 'depositedTotal = wallet income from the courier');
  ok(O.log.length === 8 && O.log.every((row) => row[1] === 'courier' && row[2] > 0), 'the passbook keeps the last 8 rows');
  ok(O.safeTotal === dep, 'no bank yet: every deposit went to the office safe');
  const names = O.tills().map((q) => q.name);
  ok(names.includes('station') && names.includes('depot'), 'before 읍 the round includes the 역 금고 and the 물류 금고');
}

console.log('읍: the station till empties itself; the 물류 금고 stays on the round (review H1)');
{
  const { gs, v42 } = village(2);
  const O = new Office(gs, v42, null);
  const names = O.tills().map((q) => q.name);
  ok(!names.includes('station') && names.includes('market') && names.includes('tax'), 'from 읍 on the 역 금고 leaves the round', names);
  ok(names.includes('depot'), 'the 물류 금고 stays on the round after 읍 (딸랑이 collects it)', names);
}

console.log('a save in the middle of a round');
{
  const { gs, v42 } = village(1);
  const O = new Office(gs, v42, null);
  O.building = { spots: { safe: { x: 0, y: 0 } } };
  gs.market.cash.value = 450; gs.trade.cash.value = 320;
  const c = { bag: 0, x: 0, y: 0 };
  for (const q of O.tills()) if (q.till.value >= 100) c.bag += O.takeTill(q, c);
  O.staff.ttal = c;
  const o = {};
  O.serializeInto(o);
  ok(o.office.bag === 770, 'the sack is saved (' + o.office.bag + ')');
  const R = new Office(gs, v42, JSON.parse(JSON.stringify(o)));
  ok(R.bagSaved === 770 && same(R.log, O.log), 'a reload hands the sack back to the courier');
  const o2 = {};
  R.serializeInto(o2);
  ok(o2.office.bag === 770, 'still saved while the courier is not out yet (no coins lost on a quick resave)');
  const bad = new Office(gs, v42, { office: { bag: -50, staff: ['x', 3.7, -1], log: 'no', safe: 'NaN' } });
  ok(bad.bagSaved === 0 && bad.safeTotal === 0 && Array.isArray(bad.log), 'a hostile save is clamped', { bag: bad.bagSaved, safe: bad.safeTotal });
}

console.log('bank slice (v5 contract)');
{
  const { gs, v42 } = village(2);
  const O = new Office(gs, v42, null);
  ok(same(O.slices(), {}), 'no bank, no slice');
  O.bank = { deposit() {}, depositPoint: () => ({ x: 0, y: 0 }) };
  const s1 = O.slices().bank;
  ok(same(s1, { v: 1, open: 1, sv: 0, ld: -1, tk: 1 }), 'the bank stands: { v:1, open:1, sv:0, ld:-1, tk:1 }', s1);
  v42.savedBank = { v: 1, open: 1, sv: 5000, ld: 3, tk: 7, so: 1 };
  const s2 = O.slices().bank;
  ok(s2.sv === 5000 && s2.tk === 7 && s2.so === 1 && s2.open === 1, "a v5 bank's own fields survive a v4.2 resave", s2);
  const bankMod = path.join(ROOT, 'src/bank/save.js');
  if (fs.existsSync(bankMod)) {
    const { sanitizeBank } = await import(bankMod);
    ok(same(sanitizeBank(s1), s1), 'sanitizeBank(slice) == slice', sanitizeBank(s1));
  } else console.log('  (src/bank not present: contract skipped)');
  O.deposit(6000, null);
  ok(O.safeTotal === 0 && O.depositedTotal === 6000, 'with the bank, deposits go to the bank (not the office safe)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
