// Bank model tests (Node):  nice -n 15 node --test tools/test/missions_lab/bank.test.mjs
// Money conservation (wallet + savings − loan) over 20,000 random operations, interest at 06:00 once a day and
// the cap, the loan limit (15 min of income; ceremonies 50 %), savings first, one loan at a time, repayment never
// makes coins negative, two restructures then a pause (a loan never grows), no way to farm money, insurance pays
// once per fire, the counter queue (번호표), sanitize fuzz and the 1 KB cap, per-tick cost.

import test from 'node:test';
import assert from 'node:assert/strict';
import { Account, MAX_POLICIES, policyId } from '../../../src/bank/model/account.js';
import { Branch } from '../../../src/bank/model/branch.js';
import { bankTuning, BANK_TUNING } from '../../../src/bank/tuning.js';
import { sanitizeBank, fitBank, BANK_SLICE } from '../../../src/bank/save.js';
import { Rng } from '../../../src/missions/lib/rng.js';
import { Wallet } from './fake_world.mjs';

const cfg = () => bankTuning();
const openAcct = (saved) => { const a = new Account(cfg(), saved); a.open = true; return a; };
const net = (w, a) => w.value + a.savings - (a.loan ? a.loan.left : 0);

test('conservation: wallet + savings − loan moves only by income, spending, interest, fees, waivers, premiums, claims', () => {
  const rng = new Rng(2024);
  const a = openAcct(), w = new Wallet(5000);
  let n0 = net(w, a), external = 0, interest = 0, fees = 0, waived = 0, premiums = 0, claims = 0;
  let day = 0, hour = 8;
  for (let k = 0; k < 20000; k++) {
    const r = rng.next();
    if (r < 0.25) { const e = rng.int(400); w.add(e); external += e; a.earned(e, w, day); }
    else if (r < 0.35) { const s = rng.int(800); external -= w.spend(s); }
    else if (r < 0.5) a.deposit(rng.int(3000), w, day);
    else if (r < 0.6) a.withdraw(rng.int(3000), w, day);
    else if (r < 0.68) { const q = a.quote(rng.int(20000), 400 + rng.int(3000), rng.chance(0.2) ? 'ceremony' : 'build', 24000); if (q) a.take(q, w, k, day); }
    else if (r < 0.7) { if (a.policies.size < 3) a.insure('bld' + rng.int(5), 2000 + rng.int(5000)); }
    else if (r < 0.71) a.claim('bld' + rng.int(5), 'fire' + rng.int(4), w, day);
    else { hour += 0.5; if (hour >= 24) { hour -= 24; day++; } a.clock(day, hour, w); }
    for (const e of a.drain()) {
      if (e.t === 'bank:interest') interest += e.n;
      if (e.t === 'bank:loan') fees += e.fee;
      if (e.t === 'bank:restructure') waived += e.waived;
      if (e.t === 'bank:claim') claims += e.n;
      if (e.t === 'bank:premium') premiums += e.n;
    }
    assert.ok(w.value >= 0, 'wallet never negative');
    assert.ok(a.savings >= 0 && (!a.loan || a.loan.left > 0));
    assert.ok(!(a.loan && a.savings > 0), 'savings and a loan never together');
  }
  const expected = n0 + external + interest - fees + waived + claims - premiums;
  assert.equal(net(w, a), expected);
});

test('interest: 1 % at 06:00, once per game day, on at most 50,000 (≤ 500 a day)', () => {
  const a = openAcct(), w = new Wallet(80000);
  a.deposit(80000, w, 0);
  assert.equal(a.savings, 50000);
  assert.equal(w.value, 30000);
  a.clock(1, 5.9, w); assert.equal(a.savings, 50000);
  a.clock(1, 6, w); assert.equal(a.savings, 50500);
  a.clock(1, 12, w); a.clock(1, 23, w); assert.equal(a.savings, 50500);
  a.clock(3, 7, w); assert.equal(a.savings, 51000);          // two days later: one day's interest, still on 50,000
  assert.deepEqual(a.deposit(1000, w, 3), { repaid: 0, saved: 0 });   // over the cap: refused
  a.v6 = true; assert.equal(a.deposit(1000, w, 3).saved, 1000);
});

test('loans: 15 min of income, ceremonies 50 %, savings first, one at a time, 5 % fee', () => {
  const a = openAcct(), w = new Wallet(0);
  assert.equal(a.maxLoan(2000), 30000);
  assert.equal(a.maxLoan(2000, 'ceremony', 24000), 12000);
  let q = a.quote(1800, 2000);
  assert.deepEqual(q, { withdraw: 0, amount: 1800, fee: 90, total: 1890, short: 1800, covered: true });
  a.take(q, w, 0, 0);
  assert.equal(w.value, 1800);
  assert.equal(a.loan.left, 1890);
  assert.equal(a.maxLoan(2000), 0, 'one loan at a time');
  assert.equal(a.quote(500, 2000), null);
  // savings first: with 600 saved, a 1,000 shortfall takes 600 out and borrows 400
  const b = openAcct(), w2 = new Wallet(600);
  b.deposit(600, w2, 0);
  q = b.quote(1000, 2000);
  assert.equal(q.withdraw, 600); assert.equal(q.amount, 400);
  b.take(q, w2, 0, 0);
  assert.equal(w2.value, 1000); assert.equal(b.savings, 0); assert.equal(b.loan.left, 420);
  // a shortfall above the limit: a partial loan
  const c = openAcct();
  q = c.quote(50000, 1000);
  assert.equal(q.amount, 15000); assert.equal(q.covered, false);
  // closed bank: nothing
  assert.equal(new Account(cfg()).quote(100, 1000), null);
});

test('repayment: 10 % of earnings, never more than the wallet holds; deposits repay first', () => {
  const a = openAcct(), w = new Wallet(0);
  a.take(a.quote(1000, 1000), w, 0, 0);       // left 1050
  w.spend(1000);                               // spent on the pad
  assert.equal(w.value, 0);
  w.add(500); a.earned(500, w, 0);
  assert.equal(a.loan.left, 1000); assert.equal(w.value, 450);
  w.spend(450); w.add(10); a.earned(1000, w, 0); // the share is 100, but only 10 coins are there
  assert.equal(w.value, 0); assert.equal(a.loan.left, 990);
  w.add(2000);
  const r = a.deposit(2000, w, 0);
  assert.deepEqual(r, { repaid: 990, saved: 1010 });
  assert.equal(a.loan, null); assert.equal(a.savings, 1010);
});

test('gentle misses: the fee is waived after 6 game days (twice at most), then the share pauses; a loan never grows', () => {
  const a = openAcct(), w = new Wallet(0);
  a.take(a.quote(3000, 1000), w, 0, 0);       // left 3150, fee 150
  let left = a.loan.left;
  for (let d = 1; d <= 30; d++) { a.clock(d, 7, w); assert.ok(!a.loan || a.loan.left <= left); if (a.loan) left = a.loan.left; }
  const ev = a.drain();
  const rs = ev.filter((e) => e.t === 'bank:restructure');
  assert.equal(rs.length, 2);
  assert.equal(rs[0].waived, 150); assert.equal(rs[1].waived, 0);
  assert.ok(ev.some((e) => e.t === 'bank:pause'));
  assert.equal(a.loan.left, 3000);
  assert.equal(a.loan.ps, 1);
  w.add(1000); assert.equal(a.earned(1000, w, 30), 0, 'paused: no automatic share');
  assert.equal(a.deposit(1000, w, 30).repaid, 1000, 'a deposit still repays');
});

test('no farming: borrowing to save earns nothing; any strategy over 60 days gains at most the interest on own coins', () => {
  // borrow, then try to deposit the loan: the deposit repays it (savings stay 0, no interest)
  const a = openAcct(), w = new Wallet(0);
  a.take(a.quote(10000, 1000), w, 0, 0);
  a.deposit(10000, w, 0);
  assert.equal(a.savings, 0);
  assert.equal(a.loan.left, 500);             // only the fee is left: borrowing cost 5 %
  for (let d = 1; d <= 10; d++) a.clock(d, 7, w);
  assert.equal(a.savings, 0);
  // random strategies: the bank's net effect never exceeds 1 %/day on the coins the chief owned
  for (let seed = 1; seed <= 30; seed++) {
    const rng = new Rng(seed), b = openAcct(), ww = new Wallet(2000 + rng.int(5000));
    const own0 = ww.value;
    let bound = 0;
    for (let d = 1; d <= 60; d++) {
      for (let k = 0; k < 6; k++) {
        const r = rng.next();
        if (r < 0.3) b.deposit(rng.int(ww.value + 1), ww, d);
        else if (r < 0.5) b.withdraw(rng.int(b.savings + 1), ww, d);
        else if (r < 0.8) { const q = b.quote(rng.int(30000), 2000); if (q) b.take(q, ww, d * 600, d); }
        else b.earned(0, ww, d);
      }
      bound += Math.floor(Math.min(own0 + bound, 50000) * 0.01);
      b.clock(d, 7, ww);
    }
    const gain = net(ww, b) - own0;
    assert.ok(gain <= bound, 'seed ' + seed + ' gain ' + gain + ' > ' + bound);
  }
});

test('(v8) insurance: premium 0.4 %/day, a claim pays 100 % once per fire, never for a lapsed policy', () => {
  const a = openAcct(), w = new Wallet(1000);
  assert.ok(a.insure('house_1', 5000));
  assert.ok(!a.insure('house_1', 5000));
  a.clock(1, 7, w);
  assert.equal(w.value, 980);
  assert.equal(a.claim('house_1', 'f1', w, 1), 5000);
  assert.equal(a.claim('house_1', 'f1', w, 1), 0, 'once per fire');
  assert.equal(a.claim('house_1', 'f2', w, 2), 5000, 'a new fire');
  w.spend(w.value);
  a.clock(2, 7, w);
  assert.equal(a.insured('house_1'), false, 'lapsed: no coins for the premium');
  assert.equal(a.claim('house_1', 'f3', w, 2), 0);
  assert.equal(a.claim('nope', 'f9', w, 2), 0);
  const s = a.serialize();
  assert.equal(s.v, 2);
  assert.deepEqual(sanitizeBank(s), sanitizeBank(sanitizeBank(s)));
});

test('branch: tickets in order, ≤ 8 inside, served by the 3 windows, open 09–17 only', () => {
  const a = openAcct(), br = new Branch(cfg(), a);
  assert.equal(br.arrive('t:1', 'deposit', 100, 0, 8.5), null, 'closed before 9');
  let T = 0;
  const got = [];
  for (let k = 0; k < 10; k++) { const v = br.arrive('t:' + k, k % 3 ? 'deposit' : 'loan', 100, T, 10); got.push(v ? v.n : null); }
  assert.deepEqual(got.slice(0, 5), [1, 2, 3, 4, 5]);
  assert.equal(got.filter((x) => x !== null).length, 5, 'queue 3 + bench 2 before any window has called');
  br.tick(T);
  const calls = br.drain().filter((e) => e.t === 'branch:call').map((e) => e.n);
  assert.deepEqual(calls, [1, 2, 3]);
  assert.equal(br.inside(), 5);
  for (let k = 10; k < 14; k++) br.arrive('t:' + k, 'deposit', 50, T, 10);
  assert.ok(br.inside() <= 8);
  for (let s = 0; s < 120; s++) { T += 1; br.tick(T); }
  const served = br.drain().filter((e) => e.t === 'branch:served').length;
  assert.ok(served >= 8);
  assert.equal(br.inside(), 0);
  assert.equal(a.ticket > 8, true);
  assert.equal(new Account(cfg(), a.serialize()).ticket, a.ticket, 'the ticket counter is saved');
});

test('save slice: sanitize fuzz (200), idempotent, ≤ 1 KB', () => {
  const a = openAcct(), w = new Wallet(9000);
  a.deposit(4000, w, 1); a.clock(2, 7, w); a.withdraw(500, w, 2); a.deposit(100, w, 2); a.clock(3, 7, w); a.withdraw(3000, w, 3);
  a.take(a.quote(5000, 1000), w, 0, 3);
  // the most policies the bank keeps, with long game ids (hashed to ≤ 10 chars) and every fire hash set: still ≤ 1 KB
  for (let k = 0; k < MAX_POLICIES; k++) assert.ok(a.insure('shop:bakery#' + k, 30000 + k * 100));
  assert.equal(a.insure('one_more_house', 1000), false, 'at most ' + MAX_POLICIES);
  for (let k = 0; k < MAX_POLICIES; k++) a.claim('shop:bakery#' + k, 'fire' + (1000 + k), w, 4);
  const s = a.serialize();
  assert.ok(JSON.stringify(s).length <= BANK_SLICE.cap + 400);
  const fitted = fitBank(sanitizeBank(s));
  assert.ok(JSON.stringify(fitted).length <= BANK_SLICE.cap, 'cap ' + JSON.stringify(fitted).length);
  assert.equal(fitted.ins.length, MAX_POLICIES, 'no policy is dropped to fit');
  const rng = new Rng(7);
  const mut = (o, d = 0) => {
    if (!o || typeof o !== 'object') return o;
    const out = Array.isArray(o) ? o.slice() : Object.assign({}, o);
    for (const k of Object.keys(out)) { const x = rng.next(); if (x < 0.1) delete out[k]; else if (x < 0.2) out[k] = rng.pick([null, -5, 1e15, 'x', [], {}, NaN, true]); else if (d < 3) out[k] = mut(out[k], d + 1); }
    return out;
  };
  for (let k = 0; k < 200; k++) {
    const raw = k < 6 ? [null, 3, 'x', [], { v: 9 }, { v: 1, ln: { l: -3 } }][k] : mut(JSON.parse(JSON.stringify(s)));
    let c;
    assert.doesNotThrow(() => { c = sanitizeBank(raw); });
    if (!c) continue;
    assert.deepEqual(sanitizeBank(JSON.parse(JSON.stringify(c))), c);
    assert.doesNotThrow(() => { const b = new Account(cfg(), c); b.clock(9, 7, new Wallet(10)); b.serialize(); });
  }
  assert.deepEqual(new Account(cfg(), sanitizeBank(s)).serialize(), s, 'round trip');
});

test('tuning: BALANCE.v5.bank overrides; defaults unchanged', () => {
  const t = bankTuning({ loanMinutes: 10, branch: { windows: 2 } });
  assert.equal(t.loanMinutes, 10); assert.equal(t.branch.windows, 2); assert.equal(t.branch.queue, 3);
  assert.equal(BANK_TUNING.loanMinutes, 15);
});

test('perf: bank ≤ 0.01 ms per tick (clock + income share + branch at 60 fps)', () => {
  const a = openAcct(), w = new Wallet(1e6), br = new Branch(cfg(), a);
  a.take(a.quote(20000, 2000), w, 0, 0);
  const N = 36000;
  let T = 0;
  const t0 = performance.now();
  for (let k = 0; k < N; k++) {
    T += 1 / 60;
    const day = Math.floor(T / 600), hour = (T / 25 + 8) % 24;
    a.clock(day, hour, w);
    if (k % 20 === 0) a.earned(30, w, day);
    if ((k & 15) === 0) br.tick(T);
    if (k % 600 === 0) br.arrive('t:' + k, 'deposit', 100, T, 10);
    if (k % 300 === 0) { a.drain(); br.drain(); }
  }
  const ms = (performance.now() - t0) / N;
  console.log('    bank: ' + ms.toFixed(4) + ' ms per tick');
  assert.ok(ms <= 0.01, ms + ' ms');
});

test('insurance ids: long game ids are hashed the same way by insure / insured / claim; loans read −(amount + fee) in the passbook', () => {
  const a = openAcct(), w = new Wallet(100000);
  assert.ok(a.insure('house:row_d_long_id#7', 24000));
  assert.ok(policyId('house:row_d_long_id#7').length <= 10);
  assert.equal(a.insured('house:row_d_long_id#7'), true);
  assert.equal(a.claim('house:row_d_long_id#7', 'f1', w, 1), 24000);
  assert.equal(a.claim('house:row_d_long_id#7', 'f1', w, 1), 0, 'once per fire');
  const b = openAcct(), w2 = new Wallet(0);
  b.take(b.quote(600, 1000), w2, 0, 2);
  const row = b.rows[b.rows.length - 1];
  assert.equal(row[1], 'loan'); assert.equal(row[2], -630); assert.equal(row[3], -630);
});

test('credit (v4.2 courier income): repays a loan first, saves up to the cap, the rest to the wallet; conserves; Bank42 slice adopted', () => {
  // a v4.2 Bank42 slice (v5 keys only) passes the sanitizer unchanged and opens the account (no second site)
  const b42 = { v: 1, open: 1, sv: 45000, ld: 12, tk: 7, rw: [[3, 'deposit', 1200, 1200], [4, 'interest', 12, 1212], [5, 'withdraw', -200, 1012]] };
  assert.deepEqual(sanitizeBank(JSON.parse(JSON.stringify(b42))), b42);
  const a = new Account(cfg(), sanitizeBank(b42)), w = new Wallet(0);
  assert.ok(a.open && a.savings === 45000);
  let n0 = net(w, a);
  const r1 = a.credit(8000, w, 13);
  assert.deepEqual(r1, { repaid: 0, saved: 5000, wallet: 3000 }, 'over the 50,000 cap: the rest goes to the wallet');
  assert.equal(net(w, a), n0 + 8000);
  // with a loan open: the courier's coins repay it first
  const b = openAcct(), w2 = new Wallet(0);
  b.loan = { amt: 1000, left: 1050, fee: 50, t0: 0, day0: 0, rs: 0, ps: 0, kind: 'build' };
  n0 = net(w2, b);
  const r2 = b.credit(1500, w2, 2);
  assert.equal(r2.repaid, 1050); assert.equal(r2.saved, 450); assert.equal(b.loan, null);
  assert.equal(net(w2, b), n0 + 1500);
  // a closed bank: everything to the wallet; nonsense amounts do nothing
  const c = new Account(cfg(), null), w3 = new Wallet(0);
  assert.deepEqual(c.credit(300, w3, 0), { repaid: 0, saved: 0, wallet: 300 });
  assert.deepEqual(c.credit(-5, w3, 0), { repaid: 0, saved: 0, wallet: 0 });
  assert.equal(w3.value, 300);
});
