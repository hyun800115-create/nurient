// (v4.2, docs/v42_plan.md §6) 촌장 사무실, its staff, the coin courier and 서리 은행 — gs.v42.office.
//   sites      world.js WORLD.plots v42_office (after the 마을회관) and v42_bank (읍 + the office): ordinary v3 plots with
//              `only`, built by Game.makeBuilding -> makeBuilding() here; their decor is cleared / moved when they appear
//   staff      hire pads one at a time on WORLD.v42.office.hire: 셈이 (500) -> 딸랑이 (900) -> 소복이 (700) -> 총총이 (900,
//              after 읍); each walks in from the plaza and takes its desk spot (seeds saved, looks regenerate)
//   courier    딸랑이's rounds of gs.tills (CashPad.takeAll), deposits at the bank counter (the office safe before the
//              bank): coins -> the HUD counter (spendable) + a passbook row (v42.office.log). No savings in v4.2.
//   panel      the 책상 pad (0.4 s), the 업무 chip (after 총총이), the bank's 창구 pad: OfficePanel (UI scene)
//   letters    VillageNews delivers into the mailbox (flag up), 소복이 fetches them; letterAction() applies a button
// Save: v42.office { st, staff: [sem, ttal, bok, chong], bag, safe, log, bankSt }; the bank slice in v5 format.

import { BALANCE } from '../../data/balance.js';
import { WORLD } from '../../data/world.js';
import { Assets } from '../../core/Assets.js';
import { Audio } from '../../core/Audio.js';
import { UnlockPad } from '../../entities/UnlockPad.js';
import { OfficeBuilding } from '../../entities/OfficeBuilding.js';
import { BankBuilding42 } from '../../entities/BankBuilding42.js';
import { Staff, Aide, Courier } from '../../entities/staff/Staff.js';
import { TF } from '../../core/Townfolk.js';
import { STAFF_LOOKS } from '../../data/staffLooks.js';
import { t, fmt } from '../../data/strings.js';
import { gdist } from '../../core/Iso.js';

const ROLES = ['sem', 'ttal', 'bok', 'chong'];
const OB = () => (BALANCE.v42 && BALANCE.v42.office) || {};
const u32 = (n) => (n >>> 0) || 1;

export class Office {
  constructor(gs, v42, saved) {
    this.gs = gs;
    this.v42 = v42;
    const s = (saved && saved.office) || {};
    this.seeds = ROLES.map((r, i) => (Array.isArray(s.staff) ? (s.staff[i] >>> 0) : 0));
    this.bagSaved = Math.max(0, Math.floor(Number(s.bag) || 0));
    this.safeTotal = Math.max(0, Math.floor(Number(s.safe) || 0));
    this.log = Array.isArray(s.log) ? s.log.slice(-8) : [];
    this.bankSt = s.bankSt || 0;
    this.x = WORLD.v42.office.x; this.y = WORLD.v42.office.y;
    this.building = null;
    this.bank = null;
    this.staff = {};
    this.hirePad = null;
    this.hirePaid = Math.max(0, Math.floor(Number(s.hirePaid) || 0));
    this.depositedTotal = 0;
    this.income = {};
    this.incomeDay = -1;
    this.deskT = 0;
    this.camReveal = null;
    this.cleared = {};
    this.presets = false;
  }

  get built() { return !!this.building; }
  hired(role) { const i = ROLES.indexOf(role); return i >= 0 && this.seeds[i] > 0; }
  handles(bkey) { return bkey === 'chief_office' || bkey === 'bank42'; }
  bankSeeds() { const b = this.seeds[0] || 777; return [u32(b * 31 + 7), u32(b * 17 + 3), u32(b * 13 + 11)]; }

  // ------------------------------------------------------------------ buildings
  makeBuilding(bkey, site, instant) {
    const gs = this.gs;
    this.ensurePresets();
    if (bkey === 'chief_office') {
      this.clearDecor('office');
      this.building = new OfficeBuilding(gs, site, this);
      if (!instant) gs.time.delayedCall(1200, () => this.showHire());
      return this.building;
    }
    if (bkey === 'bank42') {
      this.clearDecor('bank');
      this.bank = new BankBuilding42(gs, site, this, instant);
      this.bankSt = 2;
      if (!instant) gs.ui.banner(t('builtDone', { name: t('b_bank42') }), t('bsub_bank42'));
      return this.bank;
    }
    return null;
  }

  /** the code presets of the staff (once the townsfolk manifest is here) */
  ensurePresets() { if (!this.presets && TF.ok) { TF.addPresets(STAFF_LOOKS); this.presets = true; } }

  /** the decor that made room for a site ('office' / 'bank' / 'rail' in WORLD.v42.removeDecor / moveDecor) */
  clearDecor(when) {
    if (this.cleared[when]) return;
    this.cleared[when] = true;
    const gs = this.gs;
    const find = (x, y, re) => (gs.statics || []).filter((im) => im && im.active && Math.abs(im.x - x) < 14 && Math.abs(im.y - y) < 14 && (!re || re.test(im.texture.key + '|' + (im.frame && im.frame.name))));
    for (const [kind, x, y, w] of WORLD.v42.removeDecor || []) {
      if (w !== when || kind === 'regionTree') continue;
      for (const im of find(x, y)) { if (im.__ob) im.__ob.active = false; im.destroy(); }
    }
    for (const [kind, x, y, nx, ny, w] of WORLD.v42.moveDecor || []) {
      if (w !== when) continue;
      for (const im of find(x, y)) { im.setPosition(nx, ny).setDepth(ny); if (im.__ob) { im.__ob.x = nx; im.__ob.y = ny; } }
      void kind;
    }
  }

  // ------------------------------------------------------------------ staff
  nextRole() {
    if (!this.built) return null;
    const rk = this.gs.v4 && this.gs.v4.rank;
    for (const r of ROLES) {
      if (this.hired(r)) continue;
      if (r === 'chong' && !(rk && rk.level >= 2)) return null;
      return r;
    }
    return null;
  }

  showHire() {
    const gs = this.gs, r = this.nextRole();
    if (!r || !this.building) { if (this.hirePad) { this.hirePad.vanish(); this.hirePad = null; } return; }
    if (this.hirePad && this.hirePad.role === r) return;
    if (this.hirePad) { this.hirePad.vanish(); this.hirePad = null; }
    const sp = this.building.spots.hire;
    const cost = Number(OB().hire && OB().hire[r]) || 700;
    const pad = new UnlockPad(gs, 'staff_' + r, sp.x, sp.y, {
      kind: 'hire', cost, paid: this.hirePaid, labelFn: () => t('hireStaff', { role: t('role_' + r), name: t('staff_' + r) }),
      icon: Assets.pick('ui_icon_worker', 'ui_icon_clerk', 'ui_icon_lock'), iconSize: 48, padTex: Assets.pick('ui_pad_clerk', 'ui_pad_hire'),
      onComplete: (p) => this.hire(r, p),
    });
    pad.role = r;
    if (gs.player && pad.pad.contains(gs.player.x, gs.player.y)) pad.needsLeave = true;
    if (gs.popIn) gs.popIn(pad);
    this.hirePad = pad;
  }

  hire(role, pad) {
    const gs = this.gs;
    this.hirePaid = 0;
    if (pad) { pad.vanish(); this.hirePad = null; }
    const i = ROLES.indexOf(role);
    this.seeds[i] = u32(Math.floor(Math.random() * 4294967295));
    this.spawn(role, false);
    gs.ui.banner(t('staffArrive', { role: t('role_' + role), name: t('staff_' + role) }), '');
    gs.time.delayedCall(2500, () => this.showHire());
    gs.save(true);
  }

  spawn(role, instant) {
    const gs = this.gs, B = this.building;
    if (!B || this.staff[role]) return;
    this.ensurePresets();
    const i = ROLES.indexOf(role), seed = this.seeds[i];
    const home = role === 'sem' ? B.spots.desk[0] : role === 'bok' ? B.spots.desk[1] : role === 'chong' ? B.spots.desk[2] : B.spots.desk[3];
    // new staff walk in from the plaza; a reload puts them at their spots
    const from = instant ? home : { x: this.x + 520, y: this.y + 160 };
    let ch;
    if (role === 'ttal') ch = new Courier(gs, this, seed, from.x, from.y, home, instant ? this.bagSaved : 0);
    else if (role === 'chong') ch = new Aide(gs, this, seed, from.x, from.y, home);
    else ch = new Staff(gs, this, role, seed, from.x, from.y, home);
    if (!instant && role !== 'chong') ch.goHome(() => ch.say(t('staffArrive', { role: t('role_' + role), name: t('staff_' + role) }), 2.4));
    // the clerks' errands: 셈이 to the board, 소복이 to the mailbox
    if (role === 'sem') ch.errand = () => { ch.doing = 'board'; ch.walkTo(B.spots.board.x + 20, B.spots.board.y + 14, () => { ch.play('talk', true); this.semSays(ch); this.gs.time.delayedCall(2600, () => { if (ch.alive) ch.goHome(); }); }); };
    if (role === 'bok') ch.errand = () => { if (this.v42.news && this.v42.news.unread() > 0) this.fetchMail(ch); };
    this.staff[role] = ch;
  }

  /** 셈이 calls out an empty shelf */
  semSays(ch) {
    const S = this.v42.surplus;
    if (!S) return;
    for (const sl of S.sellers()) for (const ty of sl.goods || []) if (S.emptyFor(sl, ty) > 30) { ch.say(t('sem_short', { item: t(ty) }), 2.6); return; }
  }

  /** 소복이 fetches the letters from the mailbox */
  fetchMail(ch) {
    const B = this.building;
    if (!B || ch.target) return;
    ch.doing = 'letter';
    ch.walkTo(B.spots.mailbox.x + 26, B.spots.mailbox.y + 18, () => { ch.say(t('bok_mail'), 2.4); this.gs.time.delayedCall(1200, () => { if (ch.alive) ch.goHome(); }); });
  }

  onLetter() {
    this.gs.events.emit('office:letter');
    const ch = this.staff.bok;
    if (ch) this.gs.time.delayedCall(1500, () => this.fetchMail(ch));
    if (this.building && this.gs.isOnScreen(this.building.spots.mailbox.x, this.building.spots.mailbox.y, 200)) Audio.play(Audio.exists('sfx_mailbox') ? 'sfx_mailbox' : 'sfx_click', { volume: 0.5 });
  }
  onPaper() { const ch = this.staff.bok; if (ch) ch.say(t('bok_paper'), 2.4); const a = this.staff.chong; if (a && a.doing === 'follow') a.say(t('chong_news'), 2.4); }

  // ------------------------------------------------------------------ the coin loop
  /** the village tills: [{ name, till }] */
  tills() {
    const gs = this.gs, out = [];
    const add = (name, till) => { if (till && till.enabled !== false && typeof till.value === 'number') out.push({ name, till }); };
    if (gs.market) add('market', gs.market.cash);
    if (gs.trade && gs.trade.enabled) add('trade', gs.trade.cash);
    if (gs.store && gs.store.enabled) add('store', gs.store.cash);
    const C = gs.civic;
    if (C && C.restaurant && C.restaurant.cash) add('rest', C.restaurant.cash);
    if (C && C.hall && C.hall.tax) add('tax', C.hall.tax);
    // the 역 금고 and the 물류 금고 empty themselves from 읍 on (every 15 s): the courier only visits them before
    const rk = gs.v4 && gs.v4.rank;
    const G = gs.v4 && gs.v4.growth;
    if (G && G.active && G.till && !(rk && rk.level >= 2)) add('station', G.till);
    const D = this.v42.depot;
    if (D && D.till && !(rk && rk.level >= 2)) add('depot', D.till);
    return out;
  }
  tillName(name) { return t({ market: 'place_market', trade: 'place_trade', store: 'place_store', rest: 'inc_rest', tax: 'inc_tax', station: 'inc_station', depot: 'inc_depot' }[name] || 'place_market'); }

  /** the courier empties a till into the sack (the coins hop in) */
  takeTill(q, courier) {
    const till = q.till, gs = this.gs;
    const n = Math.max(0, Math.floor(till.value || 0));
    if (n <= 0) return 0;
    till.value = 0;
    if (till.pile) {
      for (let i = 0; i < 6 && till.pile.count > 0; i++) {
        const it = till.pile.pop();
        if (!it) break;
        if (it.spr) gs.effects.fly(it.spr, it.spr.x, it.spr.y, { x: courier.x + 12, y: courier.y - 110 }, { dur: 260 + i * 40, height: 50, scaleTo: 0.35, onDone: (s) => gs.effects.releaseItem(s) });
      }
      till.pile.clear(gs.effects);
    }
    if (till.pad && till.pad.pulse) till.pad.pulse();
    this.income[q.name] = (this.income[q.name] || 0) + n;
    return n;
  }

  /** where the courier hands the sack over */
  depositPoint() { if (this.bank) return this.bank.depositPoint(); const B = this.building; const s = B ? B.spots.safe : { x: this.x, y: this.y + 120 }; return { x: s.x + 20, y: s.y + 20, fx: s.x, fy: s.y }; }
  depositName() { return t(this.bank ? 'ttal_bank' : 'ttal_safe'); }

  /** coins reach the wallet: the HUD counter + a passbook row */
  deposit(n, courier) {
    const gs = this.gs;
    if (n <= 0) return;
    const p = this.depositPoint();
    gs.economy.add(n, p.x, p.y - 80, gs.isOnScreen(p.x, p.y, 200));
    if (gs.isOnScreen(p.x, p.y, 200)) gs.effects.floatText(p.x, p.y - 140, t('depositFly', { n: fmt(n) }), '#ffd84a', 30);
    this.depositedTotal += n;
    if (!this.bank) this.safeTotal += n;
    const nb = gs.v4, c = nb && nb.clock && nb.clock.on ? nb.clock : null;
    const day = c ? c.day() : 0, minute = c ? Math.floor(c.hour() * 60) : 0;
    this.log.push([day, 'courier', n, minute]);
    while (this.log.length > 8) this.log.shift();
    if (this.bank) this.bank.deposit(n);
    gs.events.emit('courier:deposit', n);
    void courier;
  }

  /** the 업무 chip (after 총총이) and its red badge (unread letters) */
  chipOn() { return this.hired('chong'); }
  badgeCount() { const N = this.v42.news; return N ? N.unread() : 0; }

  // ------------------------------------------------------------------ panel + letters
  uiScene() { const s = this.gs.scene && this.gs.scene.get ? this.gs.scene.get('UI') : null; return s && s.officePanel ? s : null; }
  openPanel(src, tab) { const ui = this.uiScene(); if (ui) ui.officePanel.open(tab || 'stock', src); }
  panelTab() { const ui = this.uiScene(); return ui && ui.officePanel.isOpen() ? ui.officePanel.tab : null; }

  letterAction(act) {
    const gs = this.gs, v = this.v42;
    const hop = (x, y) => { gs.focusCamera(x, y, 2200); const ui = this.uiScene(); if (ui) ui.officePanel.close(); };
    if (act.startsWith('p2:')) {
      const line = act.slice(3), L = v.lines;
      if (L) L.fullT[line] = Math.max(L.fullT[line] || 0, Number(BALANCE.v42.porter2.fullForS) || 90);
      const st = gs.stations[line]; if (st) gs.time.delayedCall(1200, () => hop(st.outPad.x, st.outPad.y));
    } else if (act.startsWith('st2:')) { const st = gs.stations[act.slice(4)]; if (st) hop(st.x, st.y + 60); }
    else if (act.startsWith('stock:')) this.openPanel('letter', 'stock');
    else if (act === 'plot') { const s = Object.values(gs.sites || {}).find((q) => q.kind === 'plot' && q.shown && q.state === 'plot' && q.size === 'S'); if (s) hop(s.x, s.y); }
    else if (act === 'bigcar') { if (v.freight) v.freight.stats.waitT = Math.max(v.freight.stats.waitT, 130); const G = gs.v4 && gs.v4.growth; if (G && G.dock) gs.time.delayedCall(1300, () => hop(G.dock.x + 96, G.dock.y + 84)); }
    else if (act === 'depot') { const s = gs.sites && gs.sites.v42_depot; if (s) hop(s.x, s.y); }
    else if (act === 'snowman') {
      if (gs.economy.coins >= 120) { gs.economy.spend(120); if (v.news) v.news.happy = Math.min(99, v.news.happy + 2); gs.ui.banner(t('snowmanContest'), ''); if (gs.life && gs.life.cheer) gs.life.cheer(); }
      else gs.ui.toast(t('notEnoughCoins'));
    }
  }

  // ------------------------------------------------------------------ update
  afterRestore() {
    if (!this.building) return;
    for (const r of ROLES) if (this.hired(r)) this.spawn(r, true);
    this.showHire();
  }

  update(dt) {
    const gs = this.gs, B = this.building;
    // the plots' decor goes when they appear
    const so = gs.sites && gs.sites.v42_office, sb = gs.sites && gs.sites.v42_bank;
    if (so && so.shown && !this.cleared.office) this.clearDecor('office');
    if (sb && sb.shown && !this.cleared.bank) this.clearDecor('bank');
    if (!B) return;
    if (this.hirePad) { this.hirePad.update(dt); this.hirePaid = this.hirePad.paid || 0; }
    else if ((this.chkT = (this.chkT || 0) - dt) <= 0) { this.chkT = 2; this.showHire(); }
    for (const r in this.staff) { const ch = this.staff[r]; if (ch && ch.alive) ch.update(dt); }
    if (this.bank) this.bank.update(dt);
    // the 책상 pad
    const p = gs.player;
    if (B.deskPad.contains(p.x, p.y)) {
      this.deskT += dt;
      if (this.deskT >= (Number(OB().deskPadS) || 0.4) && !this.deskOpened) { this.deskOpened = true; this.openPanel('desk', 'stock'); }
    } else { this.deskT = 0; this.deskOpened = false; }
    // the mailbox flag, the wall board (1 Hz near the view)
    const N = this.v42.news;
    B.setMail(N ? N.unread() : 0);
    this.boardT = (this.boardT || 0) - dt;
    if (this.boardT <= 0) { this.boardT = 1; if (gs.isOnScreen(B.x, B.y, 400)) B.drawBoard(this.v42.ledger ? this.v42.ledger.rows() : null); }
    // a new day: the income bars start over
    const nb = gs.v4, d = nb && nb.clock && nb.clock.on ? nb.clock.day() : 0;
    if (d !== this.incomeDay) { this.incomeDay = d; this.income = {}; }
  }

  /** what each staff member does now (the 직원 tab) */
  staffRows() {
    return ROLES.map((r) => {
      const ch = this.staff[r];
      const cost = Number(OB().hire && OB().hire[r]) || 0;
      if (!ch) return { role: r, hired: false, cost, text: t('staffLocked', { role: t('role_' + r), name: t('staff_' + r), cost: fmt(cost) }) };
      const text = r === 'ttal' ? ch.doingText() : t('staffDoing_' + (ch.doing || 'desk'));
      return { role: r, hired: true, text: t('staff_' + r) + ' · ' + text };
    });
  }

  serializeInto(o) {
    const C = this.staff.ttal;
    o.office = { st: this.building ? 2 : (this.gs.sites && this.gs.sites.v42_office && this.gs.sites.v42_office.state !== 'plot' ? 1 : 0), staff: this.seeds.slice(), bag: C ? C.bag : this.bagSaved, safe: this.safeTotal, log: this.log.slice(-8), bankSt: this.bank ? 2 : this.bankSt };
  }

  /** the bank slice in v5's format: v5 opens with the bank built and skips its own site */
  slices() {
    if (!this.bank) return {};
    const old = this.v42.savedBank;
    return { bank: Object.assign({ v: 1, open: 1, sv: 0, ld: -1, tk: 1 }, old && typeof old === 'object' ? old : {}, { open: 1 }) };
  }

  state() {
    const C = this.staff.ttal;
    return { built: this.built, bank: !!this.bank, staff: ROLES.filter((r) => this.hired(r)), hire: this.hirePad ? this.hirePad.role : null, bag: C ? C.bag : 0, courier: C ? C.state : null, rounds: C ? C.rounds : 0,
      deposited: this.depositedTotal, safe: this.safeTotal, log: this.log.slice(), tills: this.tills().map((q) => [q.name, q.till.value]), income: Object.assign({}, this.income),
      aide: this.staff.chong ? { x: Math.round(this.staff.chong.x), y: Math.round(this.staff.chong.y), doing: this.staff.chong.doing } : null };
  }

  hooks(H) {
    H.office = (o) => {
      const gs = this.gs;
      if (o && o.build) {
        // build the office (and the bank) on their plots at once (tests)
        for (const [id, k] of [['v42_office', 'chief_office'], ['v42_bank', 'bank42']]) {
          if (k === 'bank42' && o.build !== 'all') continue;
          const st = gs.sites && gs.sites[id];
          if (st && !gs.isBuilt(k)) { st.setShown(true); if (st.state === 'plot') st.start(k, { instant: true }); if (st.state !== 'done') st.finish(true); }
        }
        if (this.building && !this.hirePad) this.showHire();      // (an instant build skips the 1.2 s pause)
      }
      if (o && o.hire) for (const r of [].concat(o.hire)) if (!this.hired(r)) { const i = ROLES.indexOf(r); this.seeds[i] = u32(1234 + i * 77); this.spawn(r, true); this.showHire(); }
      if (o && o.panel) this.openPanel('test', o.panel);
      return this.state();
    };
  }

  destroy() {
    for (const r in this.staff) if (this.staff[r] && this.staff[r].destroy) this.staff[r].destroy();
    if (this.hirePad) this.hirePad.destroy();
  }
}

export { gdist };
