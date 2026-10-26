// (v4.2, docs/v42_plan.md) the v4.2 orchestrator: 촌장의 하루. Made once in Game.build (after the tutorial, before the
// v3 sites are restored: the v4.2 sites must exist to take their saved state). Holds every v4.2 system and their
// save block; each system is optional and checks its own gate (village complete, the hall, 읍, ...).
//   gs.v42.pickup      PickupPolicy (자동 줍기)                 gs.v42.aura      ChiefAura (후광 · 광채 · 별 · 응원)
//   gs.v42.nav         Navigator (길 안내)                      gs.v42.ledger    StockLedger (재고)
//   gs.v42.freight     Freight (기차 수출 F7)                   gs.v42.lines     LineUpgrades (짐꾼 2 · 가공소 2단 · 역 짐꾼 3/4 …)
//   gs.v42.office      Office (사무실 · 직원 · 딸랑이 · 은행)    gs.v42.news      VillageNews (소식 · 편지)
//   gs.v42.depot       DepotSystem (서리 물류창고)              gs.v42.pilot     ChiefPilot (관망)
// Save: serialize() -> { v42, bank, logistics } (the bank / logistics slices in the v5 / v8 module formats).

import { BALANCE } from '../data/balance.js';
import { WORLD } from '../data/world.js';
import { Settings } from '../core/Save.js';
import { StockLedger, LINES } from './StockLedger.js';
import { FOODS, GOODS } from '../entities/Seller.js';

/** the village tills: [{ name, till }] — every CashPad that takes coins (depot = the DepotSystem, optional) */
export function villageTills(gs, depot) {
  const out = [];
  const add = (name, till) => { if (till && till.enabled !== false && typeof till.value === 'number') out.push({ name, till }); };
  if (gs.market) add('market', gs.market.cash);
  if (gs.trade && gs.trade.enabled) add('trade', gs.trade.cash);
  if (gs.store && gs.store.enabled) add('store', gs.store.cash);
  const C = gs.civic;
  if (C && C.restaurant && C.restaurant.cash) add('rest', C.restaurant.cash);
  if (C && C.hall && C.hall.tax) add('tax', C.hall.tax);
  const G = gs.v4 && gs.v4.growth;
  if (G && G.active && G.till) add('station', G.till);
  if (depot && depot.till) add('depot', depot.till);
  return out;
}

export class V42 {
  constructor(gs, sv) {
    this.gs = gs;
    gs.v42 = this;
    const s = sv && sv.v42 && typeof sv.v42 === 'object' ? sv.v42 : {};
    this.saved = s;
    this.savedBank = sv && sv.bank ? sv.bank : null;
    this.savedLgx = sv && sv.logistics ? sv.logistics : null;
    this.seen = Object.assign({ cheer: 0 }, s.seen || {});
    this.t = 0;
    this.systems = [];
    this.ledger = new StockLedger(s.ledger);
    this.ms = 0;
    this.listeners = [];
    // a save from v4.1 (no v42 block yet, past the first loop): the "새로워진 것" card once
    const pr = sv && sv.progress;
    this.fromOld = !!(sv && !sv.v42 && pr && pr.done && pr.done.hire_fisherman);
    gs.events.once('shutdown', () => this.destroy());
    // gs.tills (docs/v42_plan.md §6.5, frozen interface): every village CashPad — 딸랑이's round, 관망's 수금
    Object.defineProperty(gs, 'tills', { configurable: true, get: () => this.tillList().map((q) => q.till) });
  }

  /** the village tills: [{ name, till }] (market, 교역소, 잡화점, 큰 식당, 세금 상자, 역 금고, 물류 금고) */
  tillList() { return villageTills(this.gs, this.depot); }

  /** add a system (update(dt) / serialize() / state() / destroy() are all optional) */
  add(name, sys) { if (!sys) return null; this[name] = sys; this.systems.push({ name, sys }); return sys; }

  /** after every restore (Game.build): the stocks the ledger watches, the systems' late restores */
  afterRestore(sv) {
    this.registerStocks();
    for (const { sys } of this.systems) if (sys.afterRestore) { try { sys.afterRestore(sv); } catch (e) { console.error('[v42] afterRestore', e); } }
    this.gs.events.on('built', () => this.gs.time.delayedCall(50, () => this.registerStocks()));
  }

  /** the ledger's stocks (called again when a building that has stocks appears) */
  registerStocks() {
    const gs = this.gs, L = this.ledger;
    for (const line of LINES) {
      const st = gs.stations && gs.stations[line.id];
      if (!st) continue;
      const pile = gs.piles && gs.piles[line.pile];
      if (pile) L.register({ id: 'pile:' + line.pile, kind: 'pile', item: line.raw, line: line.id, cap: pile.stack.max, get: () => (pile.shown ? pile.count : 0), place: { x: pile.x, y: pile.y } });
      L.register({ id: 'in:' + line.id, kind: 'in', item: line.raw, line: line.id, cap: st.inStack.max, get: () => st.inStack.count, place: { x: st.inPad.x, y: st.inPad.y } });
      L.register({ id: 'out:' + line.id, kind: 'out', item: line.product, line: line.id, cap: st.outStack.max, get: () => st.outStack.count, place: { x: st.outPad.x, y: st.outPad.y }, isOn: () => st.enabled });
    }
    const shelf = (seller, types, tag, emptyAt) => {
      if (!seller) return;
      for (const ty of types) L.register({ id: 'shelf:' + ty + (tag || ''), kind: 'shelf', item: ty, cap: seller.maxPerType || 40, get: () => (seller.enabled === false ? 0 : seller.stock.countOf(ty)), place: { x: seller.shelf.x, y: seller.shelf.y }, emptyAt: emptyAt || 0 });
    };
    shelf(gs.market, FOODS);
    // ((v4.2 fix, gameplay L3) the 교역소 keeps trade.displayKeep of each good on display after village complete: that
    //  many reads as empty for the 재고 statuses)
    shelf(gs.trade, GOODS, '', () => (this.complete ? Math.max(0, Number(BALANCE.v42 && BALANCE.v42.trade && BALANCE.v42.trade.displayKeep) || 0) : 0));
    if (gs.store) shelf(gs.store, gs.store.goods || [], ':store');
    const W = gs.warehouse;
    if (W) {
      L.register({ id: 'wh', kind: 'warehouse', cap: W.cap || (BALANCE.warehouse && BALANCE.warehouse.capacity) || 300, get: () => W.total, place: { x: W.inPad.x, y: W.inPad.y } });
      for (const line of LINES) L.register({ id: 'wh:' + line.product, kind: 'wh', item: line.product, cap: 0, get: () => W.count(line.product) });
    }
    if (gs.boathouse) L.register({ id: 'boat', kind: 'boat', item: 'item_fish_raw', cap: gs.boathouse.outStack.max, get: () => gs.boathouse.outStack.count, place: { x: gs.boathouse.outPad.x, y: gs.boathouse.outPad.y } });
    if (gs.foodBox) L.register({ id: 'food', kind: 'food', cap: gs.foodBox.max || 20, get: () => (gs.foodBox.active ? gs.foodBox.count : 0), place: { x: gs.foodBox.x, y: gs.foodBox.y } });
    for (const w of gs.workshops || []) {
      L.register({ id: 'wsin:' + w.kind, kind: 'in', cap: w.inStack.max, get: () => w.inStack.count, place: { x: w.inPad.x, y: w.inPad.y } });
      L.register({ id: 'wsout:' + w.kind, kind: 'out', cap: w.outStack.max, get: () => w.outStack.count, place: { x: w.outPad.x, y: w.outPad.y } });
    }
    const R = gs.civic && gs.civic.restaurant;
    if (R && R.pantry) L.register({ id: 'pantry', kind: 'pantry', cap: R.pantry.max, get: () => R.pantry.count, place: { x: R.x, y: R.y } });
    const G = gs.v4 && gs.v4.growth;
    if (G && G.active) L.register({ id: 'dock', kind: 'dock', cap: 0, get: () => G.cargo + (this.freight ? this.freight.dockCount() : 0), place: { x: G.dock.x, y: G.dock.y } });
    for (const { sys } of this.systems) if (sys.registerStocks) sys.registerStocks(L);
  }

  /** the "새로워진 것" card is due (a v4.1 save, once; not during a ceremony or the first seconds) */
  whatsNewDue() { return this.fromOld && !this.seen.whatsNew && this.t > 2.5; }
  whatsNewSeen() { this.seen.whatsNew = 1; this.gs.save(true); }
  /** the station is repaired (the card's 4th line: 기차가 이제 앞으로 달려요) */
  trainNew() { const nb = this.gs.v4; return !!(nb && nb.ours && nb.ours.open); }

  /** the 놀이 settings changed (halo, nav, pickup, observe) */
  settingsChanged() { for (const { sys } of this.systems) if (sys.settingsChanged) sys.settingsChanged(Settings.data); }

  /** is the village complete (the v3.5 party, ≈ 20 min)? the gate of 촌장 응원 and 관망 */
  get complete() { const pr = this.gs.progress; return !!(pr && pr.celebrated); }
  /** the overflow rules F1–F3 + Surplus (after village complete; the census bot's window.__FV_FRULES_EARLY measures
   *  them from the start: the designer's 짐꾼 question) */
  get frules() { return this.complete || (typeof window !== 'undefined' && window.__FV_FRULES_EARLY === true); }

  /**
   * ((v4.2 final, robust review #1) banners in turn: the v4.2 offers and the 창고 직원 used to call UI.banner() directly,
   * and after a load 2–3 became due in the same frame — UI.banner() shows at once and only the last one was seen
   * (each is shown once per save). A queued banner shows when no banner is on screen and bannerGap s have passed;
   * opts.valid() false at that moment drops it, opts.onShow() runs when it shows (mark it seen then).
   */
  queueBanner(key, msg, sub, opts) {
    const q = this.bannerQ || (this.bannerQ = []);
    if (q.some((b) => b.key === key)) return false;
    q.push({ key, msg, sub, valid: opts && opts.valid, onShow: opts && opts.onShow });
    if (q.length > 8) q.shift();
    return true;
  }

  pumpBanners(dt) {
    this.bannerGapT = Math.max(0, (this.bannerGapT || 0) - dt);
    const q = this.bannerQ, ui = this.gs.ui;
    if (!q || !q.length || this.bannerGapT > 0 || !ui || !ui.banner) return;
    if (ui.bannerBox && ui.bannerBox.visible) return;           // another banner is on screen: after it
    while (q.length) {
      const b = q.shift();
      let ok = true;
      try { ok = !b.valid || !!b.valid(); } catch (e) { ok = false; }
      if (!ok) continue;
      const sub = typeof b.sub === 'function' ? b.sub() : b.sub;
      ui.banner(typeof b.msg === 'function' ? b.msg() : b.msg, sub);
      if (b.onShow) b.onShow();
      this.bannerGapT = sub ? 4.2 : 2.6;
      return;
    }
  }

  update(dt) {
    const t0 = performance.now();
    this.t += dt;
    try { this.pumpBanners(dt); } catch (e) { this.fail('banners', e); }
    // ((robust review L5) one failing v4.2 system must not stop the whole game frame (the crash card): it is reported
    //  (console.error — the test suites count those) and the others go on)
    try { this.ledger.update(dt); } catch (e) { this.fail('ledger', e); }
    for (const q of this.systems) if (q.sys.update) { try { q.sys.update(dt); } catch (e) { this.fail(q.name, e); } }
    this.ms = this.ms * 0.95 + (performance.now() - t0) * 0.05;
  }

  fail(name, e) {
    this.errors = (this.errors || 0) + 1;
    const seen = this.failed || (this.failed = {});
    if ((seen[name] = (seen[name] || 0) + 1) <= 3) console.error('[v42] ' + name + '.update', e);
  }

  /** the v42 block + the module-format slices */
  serialize() {
    const o = { v: 1 };
    for (const { name, sys } of this.systems) if (sys.serializeInto) sys.serializeInto(o, name);
    o.ledger = this.ledger.serialize();
    o.seen = Object.assign({}, this.seen);
    const out = { v42: o };
    for (const { sys } of this.systems) if (sys.slices) Object.assign(out, sys.slices());
    if (!out.bank && this.savedBank) out.bank = this.savedBank;
    if (!out.logistics && this.savedLgx) out.logistics = this.savedLgx;
    return out;
  }

  state() {
    const o = { ms: +this.ms.toFixed(3), ledger: { rows: this.ledger.rows(), total: this.ledger.total() } };
    for (const { name, sys } of this.systems) if (sys.state) { try { o[name] = sys.state(); } catch (e) { o[name] = { error: String(e) }; } }
    return o;
  }

  destroy() { for (const { sys } of this.systems) if (sys.destroy) { try { sys.destroy(); } catch (e) { /* */ } } }
}

export { WORLD };
