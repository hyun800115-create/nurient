// 서리 은행 — the chief's account (pure, no Phaser). Savings with daily interest, construction loans, the passbook
// rows, and (v8) fire insurance. Coins move only through the `wallet` the caller passes ({ value, add(n), spend(n) },
// the host's coins port), so every coin is accounted for:
//   net = wallet + savings − loan.left  changes only by  income (outside) − spending (outside)
//                                                      + interest − loan fee + waived fee − premiums + claims
// No way to farm money:
//   - a loan is only ever offered for a real shortfall on a build / ceremony pad, after the savings are used up;
//   - while a loan is open a deposit repays it first, so savings and a loan never exist together (no interest on
//     borrowed coins), and there is no second loan;
//   - interest is paid on at most `depositCap`, once per game day at 06:00, at most one day per call;
//   - insurance pays once per fire, only for a building that was insured (and its premium paid) before the fire.
// Gentle: coins never go below 0 (repayment takes a share of what was just earned, never more than the wallet);
// a loan still open after `restructureDays` has its fee waived (twice), then the automatic share pauses.

import { hashStr } from '../../missions/lib/rng.js';

/** at most this many insured buildings (the 1 KB slice holds them with room to spare, critique L-8) */
export const MAX_POLICIES = 24;
/** a building id as the bank keeps it (≤ 10 chars): short ids as they are, longer ones hashed (critique M-11) */
export function policyId(id) {
  const s = String(id == null ? '' : id);
  if (!s) return '';
  if (s.length <= 10 && /^[A-Za-z0-9:_.#\-]+$/.test(s)) return s;
  return 'h' + (hashStr('bld:' + s) >>> 0).toString(36).slice(0, 9);
}

export class Account {
  /** cfg = bank tuning; saved = the bank slice */
  constructor(cfg, saved) {
    this.cfg = cfg;
    this.out = [];
    this.acc = 0;            // repaid since the last passbook line
    const s = saved && typeof saved === 'object' ? saved : {};
    this.open = !!s.open;
    this.savings = Math.max(0, Math.floor(Number(s.sv) || 0));
    this.loan = null;
    if (s.ln && typeof s.ln === 'object') {
      const l = s.ln;
      const left = Math.max(0, Math.floor(Number(l.l) || 0));
      if (left > 0) this.loan = { amt: Math.max(0, Math.floor(Number(l.a) || 0)), left, fee: Math.max(0, Math.min(left, Math.floor(Number(l.f) || 0))), t0: Number(l.t0) || 0, day0: Number(l.d0) | 0, rs: Math.max(0, Math.min(9, l.rs | 0)), ps: l.ps ? 1 : 0, kind: l.k === 'ceremony' ? 'ceremony' : 'build' };
    }
    if (this.loan && this.savings > 0) {           // (an impossible pair from a hand-edited save: settle it)
      const r = Math.min(this.savings, this.loan.left);
      this.savings -= r; this.payDown(r);
    }
    this.lastDay = Number.isFinite(s.ld) ? s.ld | 0 : -1;
    this.rows = Array.isArray(s.rw) ? s.rw.filter((r) => Array.isArray(r) && r.length === 4).slice(-8) : [];
    this.ticket = Math.max(1, Math.min(999, s.tk | 0 || 1));
    this.siteOffered = !!s.so;                 // the bank's construction site was offered (P29)
    this.t5 = Number.isFinite(s.t5) ? s.t5 : null;   // game T when the module began (읍 + 20 min opens the site)
    this.v6 = !!s.v6;
    // (v8) insured buildings: id → { cost, lapsed, fire (last fire paid) }
    this.policies = new Map();
    // (saved compactly: [id, cost in hundreds (negative = lapsed), hash of the last fire paid])
    for (const r of Array.isArray(s.ins) ? s.ins.slice(0, MAX_POLICIES) : []) {
      if (Array.isArray(r) && typeof r[0] === 'string') this.policies.set(r[0], { cost: Math.abs(r[1] | 0) * 100, lapsed: (r[1] | 0) < 0 ? 1 : 0, fire: r[2] | 0 });
    }
  }

  emit(e) { this.out.push(e); }
  drain() { const o = this.out; this.out = []; return o; }

  get cap() { return this.v6 ? this.cfg.depositCapV6 : this.cfg.depositCap; }

  row(day, op, amt) {
    this.rows.push([day | 0, op, Math.round(amt), this.savings - (this.loan ? this.loan.left : 0)]);
    if (this.rows.length > 8) this.rows.splice(0, this.rows.length - 8);
  }

  /** principal first, the fee last (so a waived fee is really waived) */
  payDown(r) {
    const L = this.loan;
    if (!L || r <= 0) return 0;
    r = Math.min(r, L.left);
    L.left -= r;
    if (L.fee > L.left) L.fee = L.left;
    if (L.left <= 0) { this.loan = null; this.emit({ t: 'bank:repaid' }); }
    return r;
  }

  // ------------------------------------------------------------------------------------------------ the chief
  /** put up to n coins in (an open loan is repaid first). Returns { repaid, saved } */
  deposit(n, wallet, day) {
    if (!this.open) return { repaid: 0, saved: 0 };
    let k = Math.max(0, Math.min(Math.floor(n), Math.floor(wallet.value)));
    let repaid = 0, saved = 0;
    if (k > 0 && this.loan) {
      repaid = Math.min(k, this.loan.left);
      wallet.spend(repaid);
      this.payDown(repaid);
      k -= repaid;
      this.row(day, 'repay', repaid);
    }
    if (k > 0 && !this.loan) {
      saved = Math.min(k, Math.max(0, this.cap - this.savings));
      if (saved > 0) { wallet.spend(saved); this.savings += saved; this.row(day, 'deposit', saved); }
    }
    if (repaid || saved) this.emit({ t: 'bank:deposit', repaid, saved, savings: this.savings, vault: saved >= this.cfg.vaultAt });
    return { repaid, saved };
  }

  /** take up to n coins out of savings */
  withdraw(n, wallet, day) {
    if (!this.open) return 0;
    const k = Math.max(0, Math.min(Math.floor(n), this.savings));
    if (!k) return 0;
    this.savings -= k;
    wallet.add(k);
    this.row(day, 'withdraw', -k);
    this.emit({ t: 'bank:withdraw', n: k, savings: this.savings });
    return k;
  }

  /** the most the bank lends now (0 while a loan is open or the bank is closed) */
  maxLoan(I, kind = 'build', cost = 0) {
    if (!this.open || this.loan) return 0;
    if (kind === 'ceremony') return Math.floor(Math.max(0, cost) * this.cfg.ceremonyShare);
    return Math.floor(Math.max(0, Number(I) || 0) * this.cfg.loanMinutes);
  }

  /**
   * what the bank offers for a shortfall on a pad: savings first, then a loan (rounded up to 10, within the limit).
   * { withdraw, amount, fee, total, short, covered } or null when nothing can help.
   */
  quote(short, I, kind = 'build', cost = 0) {
    short = Math.max(0, Math.ceil(Number(short) || 0));
    if (!this.open || short <= 0) return null;
    const withdraw = Math.min(this.savings, short);
    const rest = short - withdraw;
    if (rest <= 0) return { withdraw, amount: 0, fee: 0, total: 0, short, covered: true };
    const max = this.maxLoan(I, kind, cost);
    let amount = Math.min(max, Math.ceil(rest / 10) * 10);
    if (amount < this.cfg.minLoan) amount = 0;            // (a tiny shortfall: earning a little more is enough)
    if (!amount && !withdraw) return null;
    const fee = Math.ceil(amount * this.cfg.loanFee);
    return { withdraw, amount, fee, total: amount + fee, short, covered: withdraw + amount >= short };
  }

  /** accept a quote: the savings come out, the loan is paid into the wallet (the pad then takes it as usual) */
  take(q, wallet, T, day, kind = 'build') {
    if (!q || !this.open) return false;
    if (q.withdraw > 0) this.withdraw(q.withdraw, wallet, day);
    if (q.amount > 0) {
      if (this.loan) return q.withdraw > 0;
      const fee = Math.ceil(q.amount * this.cfg.loanFee);
      this.loan = { amt: q.amount, left: q.amount + fee, fee, t0: T, day0: day | 0, rs: 0, ps: 0, kind: kind === 'ceremony' ? 'ceremony' : 'build' };
      wallet.add(q.amount);
      // the passbook shows what the loan does to the balance (−630 for 600 borrowed with a 30 fee, critique L-4)
      this.row(day, 'loan', -(q.amount + fee));
      this.emit({ t: 'bank:loan', amount: q.amount, fee, left: this.loan.left });
    }
    return true;
  }

  /** coins were just earned (v4 income, not missions or loans): the automatic repayment share */
  earned(n, wallet, day) {
    const L = this.loan;
    if (!L || L.ps || !(n > 0)) return 0;
    const r = Math.min(L.left, Math.floor(n * this.cfg.repayShare), Math.floor(wallet.value));
    if (r <= 0) return 0;
    wallet.spend(r);
    this.payDown(r);
    this.acc += r;
    return r;
  }

  /**
   * the clock: interest at 06:00 (once per game day, one day at a time), the loan's gentle restructure, insurance
   * premiums (v8). Returns nothing; events go to drain().
   */
  clock(day, hour, wallet) {
    if (!this.open) return;
    if (hour < this.cfg.interestHour || day <= this.lastDay) return;
    this.lastDay = day;
    if (this.acc) { this.row(day, 'repay', this.acc); this.acc = 0; }
    if (this.savings > 0 && !this.loan) {
      const k = Math.floor(Math.min(this.savings, this.cap) * this.cfg.interestPerDay);
      if (k > 0) { this.savings += k; this.row(day, 'interest', k); this.emit({ t: 'bank:interest', n: k, savings: this.savings }); }
    }
    const L = this.loan;
    if (L && !L.ps && day - L.day0 >= this.cfg.restructureDays) {
      if (L.rs < this.cfg.restructures) {
        const waived = L.fee;
        L.left -= waived; L.fee = 0; L.rs++; L.day0 = day;
        this.emit({ t: 'bank:restructure', waived, left: L.left, n: L.rs });
        if (L.left <= 0) { this.loan = null; this.emit({ t: 'bank:repaid' }); }
      } else { L.ps = 1; this.emit({ t: 'bank:pause', left: L.left }); }
    }
    // (v8) premiums: from the wallet, else from savings; unpaid → that day's cover lapses
    for (const [id, p] of this.policies) {
      const prem = Math.ceil(p.cost * this.cfg.insurance.premiumPerDay);
      if (wallet.value >= prem) { wallet.spend(prem); p.lapsed = 0; this.row(day, 'premium', -prem); this.emit({ t: 'bank:premium', id, n: prem }); }
      else if (this.savings >= prem && !this.loan) { this.savings -= prem; p.lapsed = 0; this.row(day, 'premium', -prem); this.emit({ t: 'bank:premium', id, n: prem }); }
      else { p.lapsed = 1; this.emit({ t: 'bank:lapsed', id }); }
    }
  }

  // ------------------------------------------------------------------------------------------------ (v8) insurance
  insured(id) { const p = this.policies.get(policyId(id)); return !!(p && !p.lapsed); }
  /** a policy exists (paid up or lapsed) */
  hasPolicy(id) { return this.policies.has(policyId(id)); }
  premiumOf(cost) { return Math.ceil(Math.max(100, Math.round((Number(cost) || 0) / 100) * 100) * this.cfg.insurance.premiumPerDay); }
  insure(id, cost) {
    const k = policyId(id);
    if (!this.open || !k || this.policies.size >= MAX_POLICIES || this.policies.has(k)) return false;
    this.policies.set(k, { cost: Math.max(100, Math.round((Number(cost) || 0) / 100) * 100), lapsed: 0, fire: 0 });
    this.emit({ t: 'bank:insure', id: k, building: String(id) });
    return true;
  }
  /** a fire made building `id` a ruin (fire id `fireId`): pays its rebuild once */
  claim(id, fireId, wallet, day) {
    id = policyId(id);
    const p = this.policies.get(id);
    const fk = fireId ? (hashStr(String(fireId)) % 999983) + 1 : 0;
    if (!p || p.lapsed || !fk || p.fire === fk) return 0;
    p.fire = fk;
    const k = Math.floor(p.cost * this.cfg.insurance.cover);
    if (k > 0) { wallet.add(k); this.row(day, 'claim', k); this.emit({ t: 'bank:claim', id, n: k }); }
    return k;
  }

  // ------------------------------------------------------------------------------------------------ reading / save
  state() {
    return { open: this.open, savings: this.savings, cap: this.cap, loan: this.loan ? { left: this.loan.left, fee: this.loan.fee, amt: this.loan.amt, paused: !!this.loan.ps, restructured: this.loan.rs } : null, ticket: this.ticket };
  }

  serialize() {
    const o = { v: this.policies.size ? 2 : 1, open: this.open ? 1 : 0, sv: this.savings, ld: this.lastDay, tk: this.ticket };
    if (this.siteOffered) o.so = 1;
    if (Number.isFinite(this.t5)) o.t5 = Math.round(this.t5);
    if (this.v6) o.v6 = 1;
    if (this.loan) { const L = this.loan; o.ln = { a: L.amt, l: L.left, f: L.fee, t0: Math.round(L.t0), d0: L.day0, rs: L.rs, ps: L.ps, k: L.kind }; }
    if (this.rows.length) o.rw = this.rows.slice(-8);
    if (this.policies.size) o.ins = Array.from(this.policies, ([id, p]) => [id, Math.round(p.cost / 100) * (p.lapsed ? -1 : 1), p.fire]);
    return o;
  }
}
