// BankHost — 서리 은행 in the game, through the Ports facade: the chief's Account (savings, loans, passbook,
// v8 insurance), the Branch (numbered tickets, queue, windows) fed by the story engine's `bank` events, and the
// views (the cutaway building with tellers and customers, the counter sheet, the passbook, the loan sheet).
// Coins move only through a wallet over ports.coins (bank payouts are tagged 'bank', so the income meter ignores them).

import { Account, MAX_POLICIES, policyId as policyKey } from './model/account.js';
import { Branch } from './model/branch.js';
import { bankTuning } from './tuning.js';
import { sanitizeBank, fitBank } from './save.js';
import { mt, fmtN } from '../missions/strings.js';
import { BankBuilding } from './view/BankBuilding.js';
import { CounterSheet, PassbookPanel, LoanSheet, InsureSheet } from './view/BankPanels.js';

/** the civic art the bank's building needs (loaded when the site is offered, not with the module: critique M-8) */
export const BANK_AREA_ART = { civic: ['civ_bank'] };

export class BankHost {
  /**
   * @param ports  the Ports facade
   * @param saved  the `bank` slice (or null)
   * @param opts   { tuning (BALANCE.v5.bank), at: { x, y } building anchor (else ports.places.pos('p:bank')), views }
   */
  constructor(ports, saved, opts = {}) {
    this.ports = ports;
    this.cfg = bankTuning(opts.tuning);
    this.account = new Account(this.cfg, sanitizeBank(saved));
    this.branch = new Branch(this.cfg, this.account);
    const P = ports;
    this.wallet = {
      get value() { return P.coins.value(); },
      add: (n) => P.coins.add(n, P.chief.x(), P.chief.y() - 60, false, 'bank'),
      spend: (n) => P.coins.spend(n),
    };
    this.padT = 0;
    this.closedDay = -1;
    this.views = opts.views !== false && !!(P.ui && P.ui.scene);
    this.at = opts.at || null;
    this.building = null;              // made when the site is offered and civ_bank is resident (ensureBuilding)
    this.artAsked = false;
    if (this.views) {
      this.sheet = new CounterSheet(this);
      this.passbook = new PassbookPanel(this);
      this.loanSheet = new LoanSheet(this);
      this.insureSheet = new InsureSheet(this);
    }
    this.api = this.makeApi();
  }

  /** the bank area's art is wanted once the site is offered or the bank is open (an area residency class) */
  wantsArt() { return !!(this.account.open || this.account.siteOffered); }
  artKeys() { return this.wantsArt() ? BANK_AREA_ART.civic.slice() : []; }

  /** the building view: only when it is wanted and its art is in memory (asked for once through ports.assets) */
  ensureBuilding() {
    if (this.building || !this.views || !this.wantsArt()) return;
    const P = this.ports;
    if (!BankBuilding.artReady()) {
      if (!this.artAsked && P.assets && P.assets.fragment) { this.artAsked = true; try { P.assets.fragment('civic', { only: BANK_AREA_ART.civic }); } catch (e) { /* retried by the game's residency */ } }
      return;
    }
    const at = this.at || (P.places && P.places.pos('p:bank'));
    if (at) this.building = new BankBuilding(this, at.x, at.y);
  }

  lang() { return this.ports.lang ? this.ports.lang() : 'ko'; }
  day() { return this.ports.clock.day(); }

  /** the bank opens (its site was built: P29) */
  openBank(quiet) {
    if (this.account.open) return;
    this.account.open = true;
    if (quiet) return;
    this.ports.ui.banner(mt(this.lang(), 'b_open'), '');
    this.ports.sound.play('sfx_cheer', { volume: 0.7 });
    this.ensureBuilding();
    if (this.building) this.building.arrive();
    // missions hears it: the first mission of the bank, "첫 저금"
    if (this.ports.emit) this.ports.emit({ t: 'bank:open' });
  }

  /** the site appears at title 2 (믿음직한 촌장) or 읍 + 20 min (P29 builds it with porters, scaffold and ribbon) */
  siteCheck(T) {
    const a = this.account, P = this.ports;
    if (a.open || a.siteOffered) return;
    if (!Number.isFinite(a.t5)) a.t5 = T;
    const ms = P.later ? P.later('missions') : null;
    const title = ms && ms.fame ? ms.fame().title : 1;
    if (title >= 2 || T - a.t5 >= this.cfg.site.afterMin * 60) {
      a.siteOffered = true;
      if (P.sites && P.sites.offer) P.sites.offer({ id: 'v5_bank', key: 'bank', cost: this.cfg.site, onBuilt: () => this.openBank() });
    }
  }

  update(dt) {
    const P = this.ports, a = this.account, T = P.clock.T(), hour = P.clock.hour(), day = this.day();
    this.siteCheck(T);
    if (a.open) {
      a.clock(day, hour, this.wallet);
      const earned = P.income.takeEarned ? P.income.takeEarned() : 0;
      if (earned > 0) a.earned(earned, this.wallet, day);
      this.branch.tick(T);
      if (hour >= this.cfg.branch.close && this.closedDay !== day) { this.closedDay = day; this.branch.close(T); }
    }
    for (const e of this.branch.drain()) this.applyBranch(e);
    for (const e of a.drain()) this.apply(e);
    if (!this.views) return;
    this.ensureBuilding();
    const b = this.building;
    if (b) {
      b.update(dt);
      b.syncPeople(this.branch.people());
      // the counter pad: stand still for a moment → the counter sheet
      const on = a.open && b.onPad(P.chief.x(), P.chief.y());
      // not under the passbook / the loan question / the insurance list (they sit on top; the sheet comes back)
      const busy = this.passbook.isOpen() || this.loanSheet.isOpen() || this.insureSheet.isOpen();
      if (busy) { if (this.sheet.isOpen()) this.sheet.close(); }
      else if (on && !P.chief.moving()) { this.padT += dt; if (this.padT > 0.5) this.sheet.open(); }
      else if (!on) { this.padT = 0; if (this.sheet.isOpen()) this.sheet.close(); }
    }
    this.sheet.update(dt);
    this.insureSheet.update(dt);
  }

  applyBranch(e) {
    if (!this.building) return;
    if (e.t === 'branch:call') this.building.call(e.n, e.w);
    else if (e.t === 'branch:served' && (e.op === 'deposit' || e.op === 'loan')) this.ports.sound.at('sfx_coin_count', this.building.x, this.building.y, { volume: 0.35 });
  }

  apply(e) {
    const P = this.ports, lang = this.lang(), b = this.building;
    switch (e.t) {
      case 'bank:deposit':
        if (b) { b.coins(e.saved + e.repaid, P.chief.x(), P.chief.y() - 70, b.window().x, b.window().y); if (e.vault) b.vault(); }
        P.sound.play('sfx_coin_count', { volume: 0.6 });
        P.sound.play('sfx_stamp', { volume: 0.5, delay: 0.6 });
        if (e.saved) P.ui.toast(mt(lang, 'b_saved', { n: fmtN(e.saved) }), 1400);
        else if (e.repaid) P.ui.toast(mt(lang, 'b_repay_by_deposit', { n: fmtN(e.repaid) }), 1600);
        break;
      case 'bank:withdraw': if (b) b.coins(e.n, b.window().x, b.window().y, P.chief.x(), P.chief.y() - 70); P.sound.play('sfx_coin_count', { volume: 0.5 }); break;
      case 'bank:loan': P.sound.play('sfx_stamp', { volume: 0.6 }); break;
      case 'bank:repaid': P.ui.toast(mt(lang, 'b_repaid'), 2000); P.sound.play('sfx_unlock', { volume: 0.6 }); break;
      case 'bank:restructure': if (e.waived > 0) P.ui.toast(mt(lang, 'b_restructure'), 2000); break;
      case 'bank:insure': P.ui.toast(mt(lang, 'b_insure_paid', { name: this.buildingName(e.building || e.id) }), 1800); P.sound.play('sfx_stamp', { volume: 0.6 }); break;
      case 'bank:lapsed': P.ui.toast(mt(lang, 'b_insure_lapsed'), 1800); break;
      case 'bank:interest': break;
      default: break;
    }
    if (P.emit) P.emit(e);
  }

  // ------------------------------------------------------------------------------------------------ the chief
  deposit(n) { return this.account.deposit(n, this.wallet, this.day()); }
  withdraw(n) { return this.account.withdraw(n, this.wallet, this.day()); }
  /** a tap in the world: on the building it opens the cutaway for a while (the tap still reaches residents) */
  tap(wx, wy) { if (this.building) this.building.tap(wx, wy); return false; }
  openPassbook(who) { if (this.passbook) { if (this.sheet) this.sheet.close(); this.passbook.open(who); } }

  /**
   * a build / ceremony pad is short of `short` coins (P28): offer savings + a loan. Resolves true when the coins are
   * now in the wallet (the pad then takes them as usual).
   */
  async offerFor(short, padId, kind = 'build', cost = 0) {
    const a = this.account;
    const q = a.quote(short, this.ports.income.perMin(), kind, cost);
    if (!q) return false;
    if (this.loanSheet && this.loanSheet.isOpen()) return false;      // (one question at a time)
    const yes = this.loanSheet ? await this.loanSheet.ask(q) : true;
    if (!yes) return false;
    return a.take(q, this.wallet, this.ports.clock.T(), this.day(), kind);
  }

  // ------------------------------------------------------------------------------------------------ (v8) insurance
  /** the chief's buildings that can be insured: [{ id, name, cost, premium, insured, lapsed }] (ports.buildings) */
  insurable() {
    const B = this.ports.buildings;
    const list = B && B.list ? (B.list() || []) : [];
    return list.filter((b) => b && b.id && b.cost > 0).slice(0, 40).map((b) => {
      const k = this.account.policies.get(policyKey(b.id));
      return { id: b.id, name: b.name || null, cost: b.cost, premium: this.account.premiumOf(b.cost), insured: !!(k && !k.lapsed), lapsed: !!(k && k.lapsed), has: !!k };
    });
  }
  insuranceOn() { return !!(this.ports.facts && (this.ports.facts.has('v8') || this.ports.facts.has('toggle:incidents'))); }
  insure(id, cost) {
    if (this.account.policies.size >= MAX_POLICIES) { this.ports.ui.toast(mt(this.lang(), 'b_insure_full', { n: MAX_POLICIES }), 1600); return false; }
    return this.account.insure(id, cost);
  }
  buildingName(id) {
    const B = this.ports.buildings, lang = this.lang();
    const b = B && B.list ? (B.list() || []).find((x) => x.id === id) : null;
    return b && b.name ? (b.name[lang] || b.name.ko || String(id)) : String(id);
  }
  openInsurance() { if (this.insureSheet) { if (this.sheet) this.sheet.close(); this.insureSheet.open(); } }

  // ------------------------------------------------------------------------------------------------ residents
  onFeed(ev) {
    if (!ev) return;
    // story_runtime names people by engine id (who) and adds the game id (whoPid); only people the game can show come in
    const who = typeof ev.whoPid === 'string' && ev.whoPid ? ev.whoPid : typeof ev.who === 'string' ? ev.who : null;
    if (ev.t === 'story:bank' && this.account.open && who && ev.op !== 'insurance') {
      const op = ev.op === 'paid_off' ? 'repay' : ev.op === 'restructure' || ev.op === 'forgiven' ? 'other' : ev.op;
      this.branch.arrive(who, op, ev.amount, this.ports.clock.T(), this.ports.clock.hour());
    } else if (ev.t === 'inc:fire' && ev.op === 'ruin' && ev.building) {
      const k = this.account.claim(ev.building, ev.id, this.wallet, this.day());
      if (k > 0) this.ports.ui.toast(mt(this.lang(), 'b_insure') + ' +' + fmtN(k), 2400);
    } else if (ev.t === 'region' && ev.id === 'harbor') this.account.v6 = true;
  }

  /**
   * a resident's passbook rows (from the story engine when it runs; empty otherwise). ports.story.passbook(pid) may
   * answer at once ({ rows }) or with a Promise of the engine's { wallet, savings, loans[] } (story_runtime's
   * worker query): the rows are cached and the open passbook is redrawn when they arrive.
   */
  residentRows(pid) {
    this.books = this.books || new Map();
    const s = this.ports.story;
    const r = s && s.passbook ? s.passbook(pid) : null;
    if (r && typeof r.then === 'function') {
      r.then((v) => {
        this.books.set(pid, this.rowsOf(v));
        if (this.passbook && this.passbook.isOpen() && this.passbook.who === pid) this.passbook.build();
      }, () => {});
      return this.books.get(pid) || [];
    }
    return this.rowsOf(r);
  }

  /** [[day, op, amount, balance]] from either shape */
  rowsOf(r) {
    if (!r) return [];
    if (Array.isArray(r.rows)) return r.rows.slice(-8);
    const day = this.day(), out = [];
    const sv = Math.max(0, Math.floor(Number(r.savings) || 0));
    if (sv > 0) out.push([day, 'savings', sv, sv]);
    for (const L of (Array.isArray(r.loans) ? r.loans : []).slice(0, 4)) {
      const b = Math.max(0, Math.floor(Number(L.balance) || 0));
      if (b > 0) out.push([day, 'loan', b, -b]);
    }
    return out;
  }
  nearbyResidents(n) { return this.ports.people.nearby ? this.ports.people.nearby(this.ports.chief.x(), this.ports.chief.y(), n) : []; }

  // ------------------------------------------------------------------------------------------------ module surface
  serialize() { return fitBank(this.account.serialize()); }
  state() { return this.account.state(); }

  makeApi() {
    const a = this.account;
    return {
      account: () => { const s = a.state(); return { savings: s.savings, loan: s.loan ? { left: s.loan.left, fee: s.loan.fee } : null, interestToday: Math.floor(Math.min(s.savings, s.cap) * this.cfg.interestPerDay) }; },
      maxLoan: (kind, cost) => a.maxLoan(this.ports.income.perMin(), kind, cost),
      offerFor: (short, padId, kind, cost) => this.offerFor(short, padId, kind, cost),
      deposit: (n) => this.deposit(n),
      /** income delivered straight to the bank (v4.2's courier): repays a loan, then saves; the rest to the wallet */
      credit: (n) => this.account.credit(n, this.wallet, this.day()),
      withdraw: (n) => this.withdraw(n),
      insured: (id) => a.insured(id),
      insure: (id, cost) => this.insure(id, cost),
      /** a pad's shortfall as the bank would cover it now (null: nothing to offer → the pad says "코인이 모자라요") */
      quote: (short, kind = 'build', cost = 0) => a.quote(short, this.ports.income.perMin(), kind, cost),
      /** the bank area's late art (Residency: an area class near row D) */
      artKeys: () => this.artKeys(),
      claim: (id, fireId) => a.claim(id, fireId, this.wallet, this.day()),
      passbookRows: (pids) => (pids || []).map((p) => ({ pid: p, rows: p === 'chief' ? a.rows.slice() : this.residentRows(p) })),
      open: () => this.openBank(),
      isOpen: () => a.open,
    };
  }

  objects() { return this.building ? this.building.objects() : 0; }

  destroy() {
    for (const v of [this.building, this.sheet, this.passbook, this.loanSheet]) if (v) v.destroy();
  }
}
