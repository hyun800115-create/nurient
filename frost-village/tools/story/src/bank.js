// The town bank: savings with daily interest, loans (shop founding, a bigger house, rebuilding after
// a fire, furniture, small personal loans) with daily instalments, fire insurance payouts — and gentle
// handling when someone cannot pay: after a few missed instalments the bank stretches the loan, and
// while someone has no job it pauses the payments. Nobody's money ever goes negative.

import { G_ADULT, G_ELDER, groupOf, F_OWNER } from './people.js';
import { SHOP_COST } from '../data/places.js';
import { SRC_DID } from './memory.js';

export class Loan {
  constructor(id) { this.id = id; this.who = -1; this.purpose = 'personal'; this.principal = 0; this.bal = 0; this.inst = 0; this.start = 0; this.term = 0; this.missed = 0; this.paused = 0; this.acc = 0; this.done = 0; this.target = -1; }
}

const PURPOSE_TERM = { shop: 45, house: 50, rebuild: 45, furniture: 12, personal: 8 };

export class Bank {
  constructor(e) {
    this.e = e;
    this.loans = [];
    this.nextLoan = 1;
    this.depositBp = 8;      // 0.08 % a day on savings
    this.loanBp = 14;        // 0.14 % a day on loans
    this.stats = { deposits: 0, depositCoins: 0, withdrawals: 0, loans: 0, loanCoins: 0, paidOff: 0, restructured: 0, paused: 0, insurance: 0, insuranceCoins: 0, interestPaid: 0, missed: 0, forgiven: 0, byPurpose: {} };
  }

  loansOf(r) { const out = []; for (const l of this.loans) if (l.who === r.id && !l.done) out.push(l); return out; }
  hasLoan(r) { for (const l of this.loans) if (l.who === r.id && !l.done) return true; return false; }

  /** should r drop by the bank today? */
  wantsVisit(r) {
    if (r.loanWant) return true;
    const buffer = 40 + (r.flags & F_OWNER ? 60 : 0);
    if (r.wallet > buffer * 2 && (r.tr[6] > 55 || r.wallet > 220)) return this.e.rng.chance(0.5);
    return false;
  }

  visit(r, bankPlace) {
    const e = this.e;
    const buffer = 40 + (r.flags & F_OWNER ? 60 : 0);
    if (r.loanWant) {
      const w = r.loanWant;
      r.loanWant = null;
      this.lend(r, w.purpose, w.amount, w.target, bankPlace);
    }
    if (r.wallet > buffer * 2) {
      const amt = r.wallet - buffer;
      r.wallet -= amt; r.savings += amt;
      this.stats.deposits++; this.stats.depositCoins += amt;
      if (e.bus.has('bank')) e.bus.emit('bank', { op: 'deposit', who: r.id, amount: amt, place: bankPlace.id });
      e.lifelog(r, 'deposit', -1, bankPlace.idx, amt);
      if (amt >= 120) { const f = e.fact('deposit', { a: r.id, p: bankPlace.idx, n: amt }); e.learn(r, f, SRC_DID); }
    }
  }

  /** approve and pay out a loan (the bank is backed by the town and always says yes to a sensible ask) */
  lend(r, purpose, amount, target = -1, place = null) {
    const e = this.e;
    amount = Math.max(10, Math.round(amount));
    const L = new Loan(this.nextLoan++);
    L.who = r.id; L.purpose = purpose; L.principal = amount; L.bal = amount; L.start = e.clock.day;
    L.term = PURPOSE_TERM[purpose] || 10;
    L.inst = Math.max(2, Math.ceil((amount * (1 + (this.loanBp * L.term) / 10000)) / L.term));
    L.target = target;
    this.loans.push(L);
    this.stats.loans++; this.stats.loanCoins += amount;
    this.stats.byPurpose[purpose] = (this.stats.byPurpose[purpose] || 0) + 1;
    // the money goes where it is needed
    if (purpose === 'shop') { const cost = SHOP_COST[r.dream] || amount; e.econ.pay(r, Math.max(0, cost - amount), true); e.econ.openShop(r); }
    else if (purpose === 'rebuild') { /* paid straight to the builders */ }
    else if (purpose === 'house') { /* the move pays it */ }
    else r.wallet += amount;
    const f = e.fact('loan', { a: r.id, p: place ? place.idx : -1, n: amount, s: purpose });
    e.learn(r, f, SRC_DID);
    e.lifelog(r, 'loan', -1, place ? place.idx : -1, amount);
    if (e.bus.has('bank')) e.bus.emit('bank', { op: 'loan', who: r.id, amount, purpose, loan: L.id, inst: L.inst, term: L.term });
    return L;
  }

  /** daily: interest on savings, instalments, gentle handling */
  daily() {
    const e = this.e, list = e.alive;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.savings > 0) {
        r.intAcc += r.savings * this.depositBp;
        const add = Math.floor(r.intAcc / 10000);
        if (add > 0) { r.savings += add; r.intAcc -= add * 10000; this.stats.interestPaid += add; }
      }
    }
    for (let i = this.loans.length - 1; i >= 0; i--) {
      const L = this.loans[i];
      if (L.done) continue;
      const r = e.people[L.who];
      if (!r || !r.alive) { this.forgive(L, r, 'left'); continue; }
      // interest
      L.acc += L.bal * this.loanBp;
      const add = Math.floor(L.acc / 10000);
      if (add > 0) { L.bal += add; L.acc -= add * 10000; }
      // no job: payments wait (the bank is kind in this town)
      if (r.jobless >= 2 && groupOf(e, r) === G_ADULT) { if (!L.paused) { L.paused = 1; this.stats.paused++; } continue; }
      L.paused = 0;
      const due = Math.min(L.inst, L.bal);
      const keep = 6;
      let paid = Math.min(Math.max(0, r.wallet - keep), due);
      r.wallet -= paid;
      if (paid < due) { const s = Math.min(r.savings, due - paid); r.savings -= s; paid += s; }
      L.bal -= paid;
      if (paid < due) {
        L.missed++; this.stats.missed++;
        if (L.missed >= 3) this.restructure(L, r);
      } else if (L.missed > 0) L.missed--;
      if (L.bal <= 0) this.paidOff(L, r);
    }
    // forget long-finished loans (keep the list small)
    if (this.loans.length > 400) this.loans = this.loans.filter((l) => !l.done);
  }

  restructure(L, r) {
    const e = this.e;
    L.missed = 0;
    L.term += Math.ceil(L.term / 2);
    L.inst = Math.max(1, Math.ceil(L.inst / 2));
    this.stats.restructured++;
    const f = e.fact('bank_help', { a: r.id, n: L.inst });
    e.learn(r, f, SRC_DID);
    if (e.bus.has('bank')) e.bus.emit('bank', { op: 'restructure', who: r.id, loan: L.id, inst: L.inst });
    // a loan that keeps getting stretched gets forgiven by the town's mutual-aid fund
    if (L.inst <= 2 && L.bal > 0 && e.clock.day - L.start > L.term) this.forgive(L, r, 'fund');
  }

  paidOff(L, r) {
    const e = this.e;
    L.done = 1; L.bal = 0;
    this.stats.paidOff++;
    const f = e.fact('loan_paid', { a: r.id, n: L.principal, s: L.purpose });
    e.learn(r, f, SRC_DID);
    r.mood = Math.min(100, r.mood + 25);
    if (e.bus.has('bank')) e.bus.emit('bank', { op: 'paid_off', who: r.id, loan: L.id, purpose: L.purpose });
  }

  /** a resident leaves town (moves away, gentle farewell): the town's mutual-aid fund settles their loans */
  settleLeaving(r) { for (const L of this.loans) if (L.who === r.id && !L.done) this.forgive(L, r, 'left'); }

  forgive(L, r, why) {
    L.done = 1; L.bal = 0;
    this.stats.forgiven++;
    if (r && this.e.bus.has('bank')) this.e.bus.emit('bank', { op: 'forgiven', who: r.id, loan: L.id, why });
  }

  /** fire insurance: pays a share of the rebuild cost to the owner household */
  insurance(place, cost) {
    const e = this.e;
    if (!place.insured) return 0;
    const pay = Math.round(cost * 0.7);
    this.stats.insurance++; this.stats.insuranceCoins += pay;
    if (e.bus.has('bank')) e.bus.emit('bank', { op: 'insurance', place: place.id, amount: pay });
    return pay;
  }

  rateText(lang) { return (this.depositBp / 100).toFixed(2) + '%'; }

  totals() {
    let dep = 0, out = 0, n = 0;
    for (const r of this.e.alive) dep += r.savings;
    for (const l of this.loans) if (!l.done) { out += l.bal; n++; }
    return { savingsTotal: dep, loansOutstanding: out, activeLoans: n };
  }
}
