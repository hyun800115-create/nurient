// (v4.2, docs/v42_plan.md §5.6 + §4.3 F7) Freight: what the train's freight cars carry.
//   - capacity per train: freight.perTrain 56 (box car 32 + flat car 24), 88 after 화물칸 크게
//   - while the train stands at our station (camera anywhere, P0a): first the order-card crates (Growth, paid at the
//     dock when accepted, as v4.1), then the SURPLUS waiting at the 짐 싣는 곳 (dock), one crate per freight.loadEvery
//   - surplus aboard is paid freight.exportRate × price into the 역 금고 when the train departs; at the town station
//     the cars are emptied (no town-side logistics in v4.2)
//   - the 짐 싣는 곳 takes surplus as a logistics sink at PRIO.SURPLUS (station porters, P3); room = the next train's
//     free room + what the 물류창고 can still take (the depot's sleigh carries the rest, F8)
// Save: v42.freight = { dock: { item: n }, cars: { item: n } } (cars = surplus aboard, not yet paid) and
//       v42.train = { stage, big, labels }.

import { BALANCE } from '../data/balance.js';
import { ITEMS, priceOf } from '../data/items.js';
import { ItemStack } from '../entities/ItemStack.js';
import { floatLabel } from '../entities/Shop.js';
import { Assets } from '../core/Assets.js';
import { t } from '../data/strings.js';
import { PRIO } from './Logistics.js';

const B = () => (BALANCE.v42 && BALANCE.v42.freight) || {};
// ((v4.2 CODE-2, late-village balance) raw goods ride at the depot's low raw price (depot.rawPrice), goods at their price
const RAW = ['item_fish_raw', 'item_fish_big', 'item_log', 'item_wheat', 'item_ore', 'item_meat_raw'];
export function exportPrice(ty) {
  const R = (BALANCE.v42 && BALANCE.v42.depot && BALANCE.v42.depot.rawPrice) || {};
  if (RAW.indexOf(ty) >= 0) return Math.max(0, Number(R[ty === 'item_fish_big' ? 'item_fish_raw' : ty]) || 1);
  return priceOf(ty);
}
const SHOWN = 12;

function cleanMap(o, max) {
  const out = {};
  if (!o || typeof o !== 'object') return out;
  for (const k in o) { const n = Math.floor(Number(o[k])); if (ITEMS.indexOf(k) >= 0 && n > 0) out[k] = Math.min(max || 9999, n); }
  return out;
}
const sum = (m) => { let n = 0; for (const k in m) n += m[k]; return n; };

export class Freight {
  constructor(gs, v42, saved) {
    this.gs = gs;
    this.v42 = v42;
    const s = (saved && saved.freight) || {}, tr = (saved && saved.train) || {};
    this.dock = cleanMap(s.dock, 999);
    this.unpaid = cleanMap(s.cars, 200);
    this.big = tr.big ? 1 : 0;
    this.labels = Math.max(0, Math.min(99, Math.floor(Number(tr.labels) || 0)));
    this.cardAboard = 0;
    this.loadT = 0;
    this.stats = { exported: 0, coins: 0, waitT: 0 };
    this.view = null;
    this.onTrain = (ev, stop) => this.trainEvent(ev, stop);
    gs.events.on('v4:train', this.onTrain);
    // surplus that rode away before a reload was delivered: its export is paid on the next till update
    this.payLater = sum(this.unpaid) > 0;
  }

  get nb() { return this.gs.v4; }
  get growth() { return this.nb && this.nb.growth; }
  cap() { const b = B(); return this.big ? (Number(b.big) || 88) : (Number(b.perTrain) || 56); }
  aboard() { return this.cardAboard + sum(this.unpaid); }
  dockCount() { return sum(this.dock); }
  trainIn() { const r = this.nb && this.nb.rail; return !!(r && r.running && r.phase === 'atOurs'); }
  /** crates the cars still take this dwell */
  room() { return Math.max(0, this.cap() - this.aboard()); }

  /** one crate boards the cars ('card' = an order-card crate from Growth, 'surplus' = an export) */
  board(ty, kind) {
    if (kind === 'surplus') this.unpaid[ty] = (this.unpaid[ty] || 0) + 1;
    else this.cardAboard++;
    const tr = this.nb && this.nb.train;
    if (tr) tr.cargo = this.aboard();
  }

  // ------------------------------------------------------------------ the dock's surplus (a logistics sink, P3)
  /** room for surplus at the dock: the next train's room + the depot's (F8) */
  surplusRoom(ty) {
    const dep = this.v42.depot;
    // ((v4.2 CODE-2) by item: raw counts only the racks' raw share (depot.rawRack), so raw never fills the dock for goods)
    const depRoom = dep && dep.built ? (ty && dep.model ? dep.model.room(ty) : dep.room()) : 0;
    return Math.max(0, this.cap() + depRoom - this.dockCount());
  }
  /** put n surplus items of ty on the dock (from a porter or a test) */
  addSurplus(ty, n, from) {
    n = Math.max(0, Math.floor(n || 0));
    if (!n || ITEMS.indexOf(ty) < 0) return 0;
    this.dock[ty] = (this.dock[ty] || 0) + n;
    this.ensureView();
    if (this.view) {
      const gs = this.gs;
      for (let i = 0; i < n; i++) {
        const it = from && from.stack ? from.stack.pop(ty) : null;
        if (this.view.stack.count + this.view.stack.incoming < SHOWN) this.view.stack.push(ty, it ? it.spr : null, gs.effects);
        else if (it && it.spr) gs.effects.releaseItem(it.spr);
      }
    }
    this.refreshLabel();
    return n;
  }
  /** take up to n surplus items off the dock (the depot's sleigh, a train): [{ ty, n }]; roomOf(ty) (the sleigh: what
   *  the racks still take of ty) limits each item */
  takeSurplus(n, roomOf) {
    const out = [];
    for (const ty of Object.keys(this.dock)) {
      if (n <= 0) break;
      const k = Math.min(n, this.dock[ty], roomOf ? Math.max(0, Math.floor(roomOf(ty)) || 0) : Infinity);
      if (k <= 0) continue;
      this.dock[ty] -= k; n -= k;
      if (this.dock[ty] <= 0) delete this.dock[ty];
      out.push({ ty, n: k });
      if (this.view) for (let i = 0; i < k; i++) { const it = this.view.stack.pop(ty); if (it && it.spr) this.gs.effects.releaseItem(it.spr); }
    }
    this.refill();
    this.refreshLabel();
    return out;
  }

  ensureView() {
    const G = this.growth;
    if (this.view || !G || !G.active || !G.dock) return;
    const gs = this.gs, x = G.dock.x - 92, y = G.dock.y + 18;
    const stack = new ItemStack(gs, { scale: 0.62, cols: [[-20, -5], [0, 5], [20, -5], [-10, 15], [10, 15]], perCol: 3, max: 999, bake: true });
    const label = floatLabel(gs, x - 6, y - 74, Assets.pick('ui_icon_delivery', 'ui_icon_backpack'));
    label.c.setVisible(false);
    if (gs.territory) gs.territory.add('rail', label.c);
    this.view = { x, y, stack, label };
    this.refill();
    // the dock's surplus sink (only the station porters carry there: remote)
    this.sink = {
      id: 'dock_surplus', remote: true, surplus: true, isWarehouse: false, enabled: true, x, y, ux: x + 30, uy: y + 26,
      accepts: (ty) => ITEMS.indexOf(ty) >= 0 && !!this.v42.complete,
      room: (ty) => this.surplusRoom(ty),
      prio: () => PRIO.SURPLUS,
      feed: (ch) => { const it = ch.stack.items[ch.stack.items.length - 1]; return !!it && this.addSurplus(it.type, 1, ch) > 0; },
    };
    if (gs.logistics) gs.logistics.add(this.sink);
  }
  refill() {
    const v = this.view;
    if (!v) return;
    const want = Math.min(SHOWN, this.dockCount());
    const types = [];
    for (const ty in this.dock) for (let i = 0; i < this.dock[ty] && types.length < SHOWN; i++) types.push(ty);
    while (v.stack.count > want) { const it = v.stack.pop(); if (it && it.spr) this.gs.effects.releaseItem(it.spr); else break; }
    while (v.stack.count + v.stack.incoming < want) v.stack.push(types[v.stack.count] || types[0], null, this.gs.effects);
  }
  refreshLabel() {
    const v = this.view;
    if (!v) return;
    const n = this.dockCount();
    v.label.c.setVisible(n > 0);
    // ((gameplay review L4) the depot is only named once it stands)
    const dep = this.v42.depot;
    if (n > 0) v.label.set(t(dep && dep.built ? 'dockSurplus' : 'dockSurplusTrain', { n }));
  }

  // ------------------------------------------------------------------ the train
  trainEvent(ev, stop) {
    const gs = this.gs;
    if (ev === 'arrive' && stop === 'ours') { this.loadT = 0.8; this.dwellLoaded = 0; }
    if (ev === 'depart' && stop === 'ours') this.payExports(true);
    if (ev === 'arrive' && stop === 'town') {
      this.cardAboard = 0;
      this.unpaid = {};
      const tr = this.nb && this.nb.train;
      if (tr) tr.cargo = 0;
    }
    void gs;
  }

  /** the surplus aboard is paid exportRate × price into the 역 금고 */
  payExports(fx) {
    const G = this.growth;
    let coins = 0, n = 0;
    for (const ty in this.unpaid) { const k = this.unpaid[ty]; n += k; coins += k * exportPrice(ty) * (Number(B().exportRate) || 0.5); }
    coins = Math.floor(coins);
    if (n <= 0) return 0;
    // (the cars stay loaded until the town: unpaid becomes paid cargo)
    this.cardAboard += n;
    this.unpaid = {};
    this.stats.exported += n;
    this.stats.coins += coins;
    if (coins > 0 && G && G.payTill) {
      G.payTill(coins, G.dock ? G.dock.x : 0, G.dock ? G.dock.y - 40 : 0);
      if (fx && G.dock && this.gs.isOnScreen(G.dock.x, G.dock.y, 200)) this.gs.effects.floatText(G.dock.x, G.dock.y - 110, t('exportPaid', { n: coins }), '#ffd84a', 26);
    }
    return coins;
  }

  /** the first arrivals after the update: a label over each car (Neighbours.arriveOurs) */
  arrived(riders) {
    const tr = this.nb && this.nb.train;
    const lim = Number((BALANCE.v42.train || {}).labels) || 3;
    if (!tr || !tr.showLabels || this.labels >= lim || !tr.shown) return;
    this.labels++;
    this.gs.time.delayedCall(600, () => tr.showLabels(riders, this.aboard()));
  }

  update(dt) {
    const G = this.growth;
    if (!this.view && G && G.active && this.v42.complete) this.ensureView();
    if (this.payLater && G && G.active && G.till) { this.payLater = false; this.cardAboard = 0; this.payExports(false); this.cardAboard = 0; }
    if (!G || !G.active) return;
    if (this.view) { this.view.stack.layout(this.view.x, this.view.y, this.view.y - 2, 0, dt); this.view.label.bob(this.gs.time.now); }
    else if (this.dockCount() > 0) this.ensureView();
    // surplus into the cars after the card crates (camera anywhere)
    if (this.trainIn() && this.dockCount() > 0 && !(G.cargo > 0) && this.room() > 0) {
      this.loadT -= dt;
      if (this.loadT <= 0) {
        this.loadT = Number(B().loadEvery) || 0.14;
        const got = this.takeSurplus(1);
        if (got.length) {
          const ty = got[0].ty;
          this.board(ty, 'surplus');
          const tr = this.nb.train, w = tr ? tr.cargoPoint() : null;
          if (w && this.view && this.gs.isOnScreen(this.view.x, this.view.y, 300)) {
            const sp = this.gs.effects.takeItem(ty);
            if (sp) sp.setPosition(this.view.x, this.view.y - 20);
            if (sp) this.gs.effects.fly(sp, sp.x, sp.y, w, { dur: 420, height: 110, scaleTo: 0.45, onDone: (q) => this.gs.effects.releaseItem(q) });
          }
        }
      }
    }
    // freight waits (order-card crates + surplus): the 화물칸 크게 offer (P3) reads waitT
    if (this.dockCount() + Math.max(0, Number(G.cargo) || 0) >= (Number(B().bigOfferWait) || 60)) this.stats.waitT += dt; else this.stats.waitT = Math.max(0, this.stats.waitT - dt * 0.5);
  }

  serializeInto(o) {
    o.freight = { dock: Object.assign({}, this.dock), cars: Object.assign({}, this.unpaid) };
    const r = this.nb && this.nb.rail;
    o.train = { stage: r && r.stage ? r.stage : 1, big: this.big, labels: this.labels };
  }

  state() {
    const r = this.nb && this.nb.rail;
    return { cap: this.cap(), aboard: this.aboard(), cardAboard: this.cardAboard, unpaid: Object.assign({}, this.unpaid), dock: Object.assign({}, this.dock), dockCount: this.dockCount(),
      big: this.big, labels: this.labels, stats: Object.assign({}, this.stats), stage: r && r.stage, trainIn: this.trainIn() };
  }

  hooks(H) {
    H.freight = (o) => { if (o && o.surplus) for (const k in o.surplus) this.addSurplus(k, o.surplus[k]); if (o && o.big !== undefined) this.big = o.big ? 1 : 0; return this.state(); };
    H.train = (stage) => { const nb = this.nb; if (nb && stage) { if (stage >= 2) nb.addCoach(); } return nb && nb.rail ? nb.rail.state() : null; };
  }

  destroy() { this.gs.events.off('v4:train', this.onTrain); if (this.sink && this.gs.logistics) this.gs.logistics.remove(this.sink); }
}
