// GeumbangHost (plan §12.1–12.2): ports -> the pure GbModel -> the Phaser view. Runs headless when no View class is
// given (Node tests): everything the game sees goes through `api` and the gb:* events.
//   host = new GeumbangHost(ports, savedSlice, { View, tuning, seed })
//   host.update(dt) · host.serialize() · host.state() · host.api (gs.v43.gb, later gs.later.geumbang) · host.destroy()
// The host owns the glue the model must not know: the LaneGraph over the game's RoadNet (the vehicles module's, by
// import), the AddressBook rebuild cadence (RoadNet.onChange / built / houseDone, ≤ once per 2 s), the toast rules
// (plan §6: the first order of a day, named village residents, offers, the first dawn; else ≤ 1 per 30 s, never over
// a panel or the ceremony) and the hand-off of events to the game (letters, news, office, 관망).

import { LaneGraph } from '../vehicles/model/lanes.js';
import { GbModel } from './model/GbModel.js';
import { GB_TUNING } from './tuning.js';
import { GB_LAYOUT } from './layout.js';
import { sanitizeGeumbang, GEUMBANG_SLICE } from './save.js';
import { gt, itemsLine } from './strings.js';

export class GeumbangHost {
  constructor(ports, saved, opts = {}) {
    this.ports = ports;
    this.opts = opts;
    this.tune = opts.tuning || GB_TUNING;
    this.lay = opts.layout || GB_LAYOUT;
    const P = ports;
    const clean = sanitizeGeumbang(saved);
    this.toastT = -99; this.lastToastDay = -1;
    this.fills = []; this.fillDay = -1;
    this.rebuildT = 0; this.dirty = false;
    this.env = this.makeEnv();
    this.model = new GbModel({ tuning: this.tune, layout: this.lay, seed: opts.seed || 20261017, saved: clean, env: this.env, T: P.clock ? P.clock.T() : 0 });
    this.model.capBytes = GEUMBANG_SLICE.cap;
    // the cargo sleigh's route (px): curbs keep off it (critique M4)
    this.model.avoid = P.roads && P.roads.avoid ? P.roads.avoid() : null;
    this.roads();
    this.world();
    // (RoadNet has no off(): a destroyed host ignores the call — critique L9)
    if (P.roads && P.roads.net && P.roads.net() && P.roads.net().onChange) P.roads.net().onChange(() => { if (this.destroyed) return; this.dirtyRoads = true; this.dirty = true; });
    this.view = opts.View && P.world && P.world.scene ? new opts.View(this, P) : null;
    this.api = this.makeApi();
    this.followId = null;
    this.ms = 0; this.msModel = 0;
  }

  // ------------------------------------------------------------------------------------------ the world
  lang() { return this.ports.lang ? this.ports.lang() : 'ko'; }
  T() { return this.ports.clock ? this.ports.clock.T() : this.model.T; }
  hour() { return this.ports.clock && this.ports.clock.hour ? this.ports.clock.hour() : ((this.T() / 25) % 24 + 24) % 24; }

  roads() {
    const rn = this.ports.roads.net();
    this.lg = new LaneGraph(rn);
    this.model.setRoads(rn, this.lg);
    this.dirtyRoads = false;
  }

  /** the AddressBook from the town (homes + households) and the village sled track */
  world() {
    const P = this.ports;
    const a = typeof performance !== 'undefined' ? performance.now() : 0;
    const entries = P.town && P.town.homes ? P.town.homes() : [];
    const village = P.roads && P.roads.village ? P.roads.village() : null;
    this.model.T = this.T();
    const n = this.model.setWorld(entries, village);
    this.msBook = (typeof performance !== 'undefined' ? performance.now() : 0) - a;
    return n;
  }

  /** something changed (a house finished, a road upgraded): rebuild at most once per 2 s */
  touch() { this.dirty = true; }

  makeEnv() {
    const P = this.ports, D = () => P.depot || {};
    return {
      source: {
        count: (k) => (D().count ? D().count(k) : 0),
        pick: (items) => (D().pick ? D().pick(items) : {}),
        restock: (items) => (D().restock ? D().restock(items) : items),
        level: (cat) => (D().level ? D().level(cat) : 0.5),
      },
      shelf: (item) => (P.ledger && P.ledger.shelf ? P.ledger.shelf(item) : null),
      price: (item) => (P.price ? P.price(item) : this.tune.shopPrice[item] || 1),
      pay: (coins, info) => { if (P.coins && P.coins.till) P.coins.till(coins, info); },
      spend: (cost, kind) => (P.coins && P.coins.spend ? P.coins.spend(cost, kind) : false),
      happy: (x) => { if (P.growth && P.growth.happy) P.growth.happy(x); },
      home: (aid, hid) => (P.town && P.town.home ? P.town.home(aid, hid) : true),
      passer: (aid, box) => (P.town && P.town.passer ? P.town.passer(aid, box) : false),
      walkers: P.town && P.town.walkers ? (x, y) => P.town.walkers(x, y, 260) : null,
      live: (x, y) => (P.view && P.view.onScreen ? P.view.onScreen(x, y, 300) : false),
      sleighBusy: () => (D().sleighBusy ? D().sleighBusy() : false),
      snow: () => (P.weather && P.weather.snow ? P.weather.snow() : false),
      rackFill: () => (D().fill ? D().fill() : 0),
      surplus: (items) => { if (D().surplus) D().surplus(items); },
      dockSurplus: () => (D().dockSurplus ? D().dockSurplus() : 0),
      takeSurplus: (n) => (D().takeSurplus ? D().takeSurplus(n) : null),
      firstHousehold: (book) => book.households().find((h) => h.first) || null,
      // (critique C1 / H2) the station dock's surplus and the village piles: 정 할머니's opening stock, 금방 집하
      dockTake: (item, n) => (D().dockTake ? D().dockTake(item, n) : 0),
      piles: () => (D().piles ? D().piles() : []),
      takePile: (id, n, to) => (D().takePile ? D().takePile(id, n, to) : 0),
      pileTake: (item, n) => (D().pileTake ? D().pileTake(item, n) : 0),
      dockRoom: (item) => (D().dockRoom ? D().dockRoom(item) : 0),
      dockDrop: (items) => { if (D().dockDrop) D().dockDrop(items); else if (D().surplus) D().surplus(items); },
    };
  }

  // ------------------------------------------------------------------------------------------ the loop
  update(dt) {
    const a = typeof performance !== 'undefined' ? performance.now() : 0;
    const P = this.ports;
    this.rebuildT -= dt;
    if (this.dirty && this.rebuildT <= 0) {
      this.rebuildT = 2; this.dirty = false;
      if (this.dirtyRoads) this.roads();
      this.world();
      if (this.view && this.view.worldChanged) this.view.worldChanged();
    }
    const m0 = typeof performance !== 'undefined' ? performance.now() : 0;
    this.model.tick(dt, this.T(), this.hour());
    this.msModel = (typeof performance !== 'undefined' ? performance.now() : 0) - m0;
    // (critique M6) the racks' fill at each day's start: the 서리 소식 line "선반이 어제보다 p% 가벼워졌어요"
    if (this.model.day !== this.fillDay) { this.fillDay = this.model.day; this.fills.unshift(this.env.rackFill ? this.env.rackFill() : 0); this.fills.length = Math.min(this.fills.length, 2); }
    const evs = this.model.events.splice(0);
    for (const e of evs) this.onEvent(e);
    if (this.view) this.view.update(dt, evs);
    if (this.firstToast && !(this.view && this.view.following && this.view.following())) { this.firstToast = false; this.toast(gt('gb_toast_first', null, this.lang()), true); if (this.view && this.view.chip) this.view.chip.bounce(); }
    this.ms = (typeof performance !== 'undefined' ? performance.now() : 0) - a;
    void P;
  }

  /** the game feed: events out (missions / story / news / 관망 listen), toasts by the plan's rules */
  onEvent(e) {
    const P = this.ports, L = this.lang();
    if (P.emit) P.emit(e);
    switch (e.t) {
      case 'gb:letter': if (P.letters && P.letters.offer) P.letters.offer('geumbang'); else this.toast(gt('gb_open_ready', null, L), true); break;
      case 'gb:order': {
        const day = Math.floor(e.T / 600);
        const a = this.model.book.get(e.aid);
        const named = a && a.kind === 'village';
        if (this.lastToastDay !== day || named) { this.lastToastDay = day; this.toast(gt('gb_toast_order', { who: this.who(e.aid, e.hid), items: itemsLine(e.items, L) }, L), true); }
        else this.toast(gt('gb_toast_order', { who: this.who(e.aid, e.hid), items: itemsLine(e.items, L) }, L), false);
        break;
      }
      case 'gb:offer': this.toast(gt(this.model.up.name(e.kind), null, L) + ' · ' + gt(e.kind === 'sled2' ? 'gb_up_why_collect' : 'gb_why_wait', { n: this.model.orders.list.length }, L), true); break;
      case 'gb:collect': {
        // the first 금방 집하 of a day says what got lighter (later ones: the app's 오늘 tab)
        if (e.op !== 'load' || !(e.n > 0)) break;
        const day = Math.floor(e.T / 600);
        if (this.colToastDay !== day) { this.colToastDay = day; this.toast(gt('gb_toast_collect', { pile: gt('gb_pile_' + String(e.item || '').replace(/^item_/, ''), null, L), n: e.n }, L), false); }
        break;
      }
      case 'gb:firstDone': this.firstToast = true; break;     // shown when the camera is back (update)
      case 'gb:open': if (P.ui && P.ui.banner) P.ui.banner(gt('gb_open_banner', null, L), gt('gb_tagline', null, L)); break;
      default: break;
    }
  }

  /** a toast (plan §6): `force` for the ones that always show; others ≤ 1 per toast.minGapS */
  toast(msg, force) {
    const P = this.ports, T = this.T();
    const show = this.view && this.view.toast ? (m) => this.view.toast(m) : P.ui && P.ui.toast ? (m) => P.ui.toast(m) : null;
    if (!show) return false;
    if (P.settings && P.settings.alerts && P.settings.alerts() === 'off') return false;
    if (P.ui && P.ui.busy && P.ui.busy()) return false;
    if (this.view && this.view.appOpen && this.view.appOpen() && !force) return false;
    if (this.view && this.view.following && this.view.following() && !force) return false;     // the follow captions speak
    if (!force && T - this.toastT < this.tune.toast.minGapS) return false;
    if (P.settings && P.settings.alerts && P.settings.alerts() === 'quiet' && !force) return false;
    this.toastT = T;
    show(msg);
    if (P.ui && P.ui.toasted) P.ui.toasted(msg);
    return true;
  }

  /** "민지네" / "아파트 2동 정 할머니네" */
  who(aid, hid) {
    const L = this.lang(), a = this.model.book.get(aid);
    if (!a) return aid;
    const hh = a.hh.find((h) => h.hid === hid) || a.hh[0];
    const name = hh ? hh.name : '';
    if (a.kind === 'apt') return gt('gb_who_apt', { bld: gt('gb_' + aid, null, L), name }, L);
    return gt('gb_who_house', { name: name || gt(a.name, null, L) }, L);
  }

  // ------------------------------------------------------------------------------------------ save / api
  serialize() { return this.model.serialize(); }
  state() { return this.model.state(); }

  makeApi() {
    const m = this.model;
    return {
      open: (o) => m.open(o),
      isOpen: () => m.st === 2,
      letterDue: () => m.letterDue(),
      stats: () => ({ today: Object.assign({}, m.settle.today), days: m.settle.days.slice(), tot: m.settle.tot.slice(), open: m.orders.list.length }),
      orders: () => m.orders.list.map((o) => ({ id: o.id, aid: o.aid, st: o.st, got: Object.assign({}, o.got), t0: o.t0, van: o.van, size: o.size, tomorrow: o.tomorrow, first: o.first, value: o.value })),
      vans: () => (m.disp ? m.disp.vans.map((v) => v.state()) : []),
      address: (aid) => { const a = m.book.get(aid); return a ? { aid: a.aid, kind: a.kind, zone: a.zone, door: a.door, curb: a.curb, walkM: a.walk ? a.walk.len : null, households: a.hh.length } : null; },
      upgrade: (kind) => m.upgrade(kind),
      deal: (item) => m.deal(item),
      sell: (item, on) => m.sell(item, on),
      follow: (orderId) => { this.followId = orderId || null; if (this.view && this.view.follow) this.view.follow(orderId); return true; },
      reveal: (on) => (this.view && this.view.reveal ? this.view.reveal(on !== false) : false),
      state: () => m.state(),
      touch: () => this.touch(),
      offer: () => m.up.offer,
      spurBusy: () => m.spurBusy(),
      following: () => !!(this.view && this.view.following && this.view.following()),   // (관망 skips its cuts meanwhile: G-P12)
      // (critique M6) what the office, the paper and 관망 show of 금방 (Integration G-P16 / G-P17 call these)
      officeRow: () => { const T = m.settle.today; return gt('gb_row_office', { o: T.orders, d: T.delivered, s: T.units }, this.lang()); },
      news: () => this.newsLines(),
      watchSpot: (x, y, r) => this.watchSpot(x, y, r),
    };
  }

  /**
   * yesterday in the 서리 소식 as VillageNews headlines [key, a, 0] (strings news_gb_day / news_gb_racks, G-P16):
   * the homes 금방 delivered to, and how much lighter the racks are than the day before (only after a day 금방 worked,
   * ≥ 5 %). Empty before the opening.
   */
  newsLines() {
    const m = this.model, d = m.settle.days[0], out = [];
    if (m.st !== 2 || !d || !(d[1] > 0)) return out;
    out.push(['news_gb_day', d[1], 0]);
    const [now, prev] = this.fills;
    if (prev > 0 && now >= 0) { const p = Math.round((100 * (prev - now)) / prev); if (p >= 5) out.push(['news_gb_racks', Math.min(95, p), 0]); }
    return out;
  }

  /**
   * (G-P17 관망 "금방 구경") where something 금방 can be watched within r px of (x, y): a van at a curb (the courier
   * walks to a door), else a van loading in bay 1, else a sled loading at a pile — { x, y, fx, fy, what } or null
   */
  watchSpot(x, y, r = 1500) {
    const m = this.model;
    if (m.st !== 2) return null;
    let best = null, bd = r;
    const consider = (px, py, fx, fy, what, bonus) => { const d = Math.hypot(px - x, (py - y) * 2) - bonus; if (d < bd) { bd = d; best = { x: px, y: py, fx, fy, what }; } };
    for (const v of m.disp ? m.disp.vans : []) {
      if (v.st === 'curb') consider(v.x + 70, v.y + 40, v.x, v.y, 'curb', 300);
      else if (v.st === 'load' || (v.st === 'bay' && v.load.length)) consider(v.x + 90, v.y + 60, v.x, v.y, 'bay', 0);
    }
    for (const q of m.sleds || []) if (q.st === 'cload') consider(q.x + 60, q.y + 40, q.x, q.y, 'pile', 0);
    return best;
  }

  /** the art arrived after the model started (late fragments, ports_v4): make the view now */
  attachView(View) {
    const P = this.ports;
    if (this.view || !View || !P.world || !P.world.scene) return false;
    this.view = new View(this, P);
    return true;
  }

  destroy() { this.destroyed = true; if (this.view) this.view.destroy(); this.view = null; }
}
