// (v4.2, docs/v42_plan.md §6.7 + §15) StockLedger, Node only:
//   node tools/test/ledger.test.mjs
// in / out flows per minute (EWMA) follow a steady stock change; full / empty timers; the line statuses
// (short / jam / surplus / ok) of the §6.7 table; re-registering a stock keeps its history; the saved full timers
// come back; ≤ 40 saved rows with safe ids; ≈ 45 stocks sampled at 1 Hz cost ≤ 0.02 ms a tick on average.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const { StockLedger, LINES } = await import(path.join(ROOT, 'src/systems/StockLedger.js'));
const { BALANCE } = await import(path.join(ROOT, 'src/data/balance.js'));

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); } };
const near = (a, b, e) => Math.abs(a - b) <= e;
const C = BALANCE.v42.ledger;

console.log('flows and timers');
{
  const L = new StockLedger();
  let v = 0;
  L.register({ id: 'pile:fish', kind: 'pile', item: 'item_fish_raw', cap: 4000, get: () => v });
  // +30 a minute for 30 minutes (0.5 a second), sampled at 1 Hz through update()
  for (let s = 0; s < 1800; s++) { v += 0.5; L.update(1); }
  const o = L.stocks()[0];
  ok(near(o.inPm, 30, 1.5) && o.outPm < 0.5, 'a stock rising 0.5/s shows ≈ 30 in / 0 out a minute', o);
  // now draining
  for (let s = 0; s < 1800; s++) { v = Math.max(0, v - 0.25); L.update(1); }
  const o2 = L.stocks()[0];
  ok(near(o2.outPm, 15, 1.5), 'then falling 0.25/s: ≈ 15 out a minute (' + o2.outPm + ')');
  // full timer
  v = 4000;
  for (let s = 0; s < 90; s++) L.update(1);
  ok(near(L.fullFor('pile:fish'), 90, 2), 'full for 90 s → fullFor 90 (' + L.fullFor('pile:fish') + ')');
  v = 10; L.update(1);
  ok(L.fullFor('pile:fish') === 0, 'not full any more: the timer resets');
  // update() with odd frame steps still samples about once a second
  const L2 = new StockLedger();
  L2.register({ id: 'x', get: () => 1 });
  for (let k = 0; k < 600; k++) L2.update(1 / 60);
  ok(near(L2.samples, 10, 1), '600 frames of 1/60 s → ≈ 10 samples (' + L2.samples + ')');
  // a throwing getter reads 0, never breaks the ledger
  const L3 = new StockLedger();
  L3.register({ id: 'bad', get: () => { throw new Error('gone'); } });
  L3.update(1);
  ok(L3.stocks()[0].n === 0, 'a getter that throws reads 0');
  ok(L3.register({ id: 'nofn' }) === null && L3.register(null) === null, 'a stock without get() is refused');
}

console.log('line statuses (§6.7)');
{
  const mk = () => {
    const L = new StockLedger();
    const v = { pile: 10, out: 5, shelf: 20, wh: 0 };
    L.register({ id: 'pile:wheat', kind: 'pile', cap: 40, get: () => v.pile });
    L.register({ id: 'in:bakery', kind: 'in', cap: 30, get: () => 10 });
    L.register({ id: 'out:bakery', kind: 'out', cap: 36, get: () => v.out });
    L.register({ id: 'shelf:item_bread', kind: 'shelf', cap: 30, get: () => v.shelf });
    L.register({ id: 'wh:item_bread', kind: 'wh', cap: 300, get: () => v.wh });
    return { L, v };
  };
  {
    const { L, v } = mk();
    for (let s = 0; s < 5; s++) L.update(1);
    ok(L.status('bakery') === 'ok', 'all moving: ok');
    v.shelf = 0; v.out = 0; v.wh = 0;
    for (let s = 0; s < C.emptyS + 3; s++) L.update(1);
    ok(L.status('bakery') === 'short', 'shelf empty > emptyS and nothing made: short');
    v.out = 12;
    L.update(1);
    ok(L.status('bakery') === 'jam', 'shelf empty but bread waits at the bakery: jam');
  }
  {
    const { L, v } = mk();
    v.pile = 40; v.shelf = 25;
    for (let s = 0; s < C.fullS + 3; s++) L.update(1);
    ok(L.status('bakery') === 'surplus', 'pile full > fullS and the shelf ≥ half: surplus');
    v.shelf = 5; L.update(1);
    ok(L.status('bakery') === 'ok', 'the same pile with a low shelf is not surplus');
  }
  {
    const { L } = mk();
    for (let s = 0; s < 3; s++) L.update(1);
    const rows = L.rows();
    ok(rows.length === 1 && rows[0].line === 'bakery' && rows[0].product === 'item_bread' && rows[0].pileCap === 40 && Array.isArray(rows[0].flow), 'rows(): one row per line that has a station', rows[0]);
    ok(LINES.length === 5 && LINES.every((l) => l.raw && l.product && l.pile), 'five goods lines');
  }
}

console.log('re-register, save, restore');
{
  const L = new StockLedger();
  let v = 0;
  L.register({ id: 'out:grill', cap: 36, get: () => v });
  for (let s = 0; s < 150; s++) { v += 0.2; L.update(1); }
  const before = L.stocks()[0];
  L.register({ id: 'out:grill', cap: 36, get: () => v });
  const after = L.stocks()[0];
  ok(L.stocks().length === 1 && after.inPm === before.inPm, 're-registering an id replaces it and keeps its flows');
  v = 36;
  for (let s = 0; s < 150; s++) L.update(1);
  const sv = L.serialize();
  ok(near(sv.full['out:grill'], 150, 2), 'serialize(): full timers (' + JSON.stringify(sv.full) + ')');
  const R = new StockLedger(JSON.parse(JSON.stringify(sv)));
  R.register({ id: 'out:grill', cap: 36, get: () => 36 });
  ok(near(R.fullFor('out:grill'), 150, 2), 'a reloaded ledger restores the full timer (the letters keep counting)');
  const B = new StockLedger();
  for (let k = 0; k < 60; k++) B.register({ id: 'pile_' + k, cap: 1, get: () => 1 });
  B.register({ id: 'Bad Id!', cap: 1, get: () => 1 });
  for (let s = 0; s < 3; s++) B.update(1);
  const bs = B.serialize();
  ok(Object.keys(bs.full).length <= 40 && !('Bad Id!' in bs.full), '≤ 40 saved rows, ids [a-z0-9_:] only');
  B.remove('pile_0');
  ok(!B.get('pile_0') && B.stocks().length === 60, 'remove()');
}

console.log('cost');
{
  const L = new StockLedger();
  const vals = new Array(45).fill(0);
  for (let k = 0; k < 45; k++) L.register({ id: 's' + k, cap: 40, get: () => vals[k] });
  const n = 60 * 60 * 5;   // 5 minutes of 60 fps frames
  const t0 = process.hrtime.bigint();
  for (let f = 0; f < n; f++) { if (f % 7 === 0) vals[f % 45] = (vals[f % 45] + 1) % 40; L.update(1 / 60); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n;
  ok(ms <= 0.02, '45 stocks at 1 Hz: ' + ms.toFixed(5) + ' ms a tick on average (≤ 0.02)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
