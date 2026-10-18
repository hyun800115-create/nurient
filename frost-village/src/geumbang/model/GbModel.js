// GbModel (plan §5, §12.1): the whole 금방 loop as one pure, seeded model. No Phaser, no window: the world reaches it
// through `env` (the host builds env from the ports), and everything it does comes out as events.
//   const m = new GbModel({ tuning, seed, saved, env, layout })
//   m.setRoads(rn, laneGraph)          (the v4 RoadNet + the vehicles module's LaneGraph over it)
//   m.setWorld(entries, village)       (AddressBook rebuild: homes + households; ≤ once per 2 s)
//   m.tick(dt, T, hour)                -> drains into m.events (gb:* names, plan §12.3)
//   m.open() · m.upgrade(kind) · m.deal(item) · m.sell(item, on) · m.serialize() · m.state()
// env: { source: { count, pick, restock, level(cat) }, shelf(item), price(item), pay(coins, info), spend(cost, kind),
//        happy(x), home(aid, hid), passer(aid), walkers(x, y), live(x, y), sleighBusy(), snow(), rackFill(),
//        surplus(items) (refused restock -> dock), dockSurplus(), takeSurplus(n), firstHousehold(),
//        dockTake(item, n) -> n, piles() -> [{ id, item, x, y, n, max }], takePile(id, n, to) -> n,
//        pileTake(item, n) -> n, dockRoom(item) -> n, dockDrop(items) }
// Stock (critique C1): the depot racks are emptied by the walk-in 솔방울 상인 every day, so 금방 keeps its own share
// (`res`, tuning.share): each second it takes what lands on the racks up to a small standing stock per item — the
// racks still draw it (shown()), the buyers cannot sell it twice. Orders pick from that share first, then the racks
// above keepFloor. The real drain of the village's overflow is 금방 집하 (the dog sleds, dispatch.js Sled).

import { GB_TUNING } from '../tuning.js';
import { GB_LAYOUT } from '../layout.js';
import { AddressBook } from './addresses.js';
import { OrderBook, Order, copy, sum } from './orders.js';
import { ShopGuard } from './guard.js';
import { Hub } from './fulfil.js';
import { Dispatcher, Sled } from './dispatch.js';
import { PathKit } from './path.js';
import { Settle } from './settle.js';
import { Upgrades } from './upgrades.js';
import { fitGeumbang, mergeGot } from '../save.js';

const DAY = 600, HOUR = 25;
const NONE = [];
const SEEN = { letter: 1, first: 2, appTip: 4, card: 8, follow: 16 };

export class GbModel {
  constructor(o = {}) {
    this.tune = o.tuning || GB_TUNING;
    this.lay = o.layout || GB_LAYOUT;
    const s = o.saved || null;
    this.seed = (s && s.seed) || (o.seed >>> 0) || 20261017;
    this.env = o.env || {};
    this.T = Number.isFinite(o.T) ? o.T : 0; this.hour = 12; this.day = -1;
    this.events = [];
    this.st = s ? s.st : 0;                 // 0 letter (gate) · 1 paid, opening · 2 open
    this.seen = s ? s.seen | 0 : 0;
    this.gateT = s && Number.isFinite(s.g) ? s.g : 0;
    this.fullT = 0;
    this.openT = 0;
    this.book = new AddressBook(this.tune, this.seed);
    this.orders = new OrderBook(this.tune, this.seed);
    this.guard = new ShopGuard(this.tune);
    this.hub = new Hub(this.tune);
    this.settle = new Settle(this.tune, this.seed);
    if (Number.isFinite(o.T)) { this.day = Math.floor(o.T / DAY); this.settle.day = this.day; }
    this.up = new Upgrades(this.tune, s ? s.lv : null);
    this.kit = null; this.disp = null; this.sleds = [];
    this.sledQ = [];                        // village parcels waiting at the stand (handed over by the vans)
    this.res = {};                          // 금방's own share of the depot stock (critique C1): item -> n
    this.catKeys = Object.keys(this.tune.catalog).sort();
    this.pad = s && (s.pp || s.pi) ? { paid: s.pp | 0, got: parseGot(s.pi || '') } : null;   // the 금방 개업 pad (H4)
    this.savedRows = s ? s : null;
    this.secT = 0;
    this.follow = null;                     // the order the camera follows (첫 주문 따라가기 / 따라가기)
    this.lastHour = -1;
    this.overnight = null;
    this.ids = new Set(Object.keys(this.tune.catalog));
    // a save made open but before 정 할머니's order: she still orders (once)
    if (this.st === 2 && !(this.seen & SEEN.first)) { this.firstAt = this.T + 1; this.firstDue = this.T; }
    this.applyLevels();
  }

  /** the first dog sled (the view, Follow, older callers) */
  get sled() { return this.sleds[0] || null; }

  // ------------------------------------------------------------------------------------------ world
  setRoads(rn, lg) {
    this.rn = rn; this.lg = lg;
    this.kit = new PathKit(lg, this.lay, this.tune);
    const old = this.disp;
    // (critique M1) a road change mid-tour: the parcels on the old vans go back on the pile, backhaul crates back to
    // the dock — the new vans start in bay 1
    if (old) {
      const back = old.release({ book: this.orders });
      for (const v of old.vans) if (v.backload) { const b = v.backload; v.backload = null; if (this.env.surplus) this.env.surplus(b); }
      if (back.length) this.emit({ t: 'gb:reroute', ids: back.map((o) => o.id) });
    }
    this.disp = new Dispatcher(this.tune, this.kit, this.seed);
    this.disp.setVans(this.up.lv.van);
    if (old) this.disp.firstDone = old.firstDone;
    if (this.entries) this.setWorld(this.entries, this.village);
  }

  setWorld(entries, village) {
    this.entries = entries; this.village = village || null;
    if (!this.kit) return 0;
    const stand = this.lay.sledStand ? { x: 3120 + 64 * (this.lay.sledStand[0] + this.lay.sledStand[1]), y: 1315 + 32 * (this.lay.sledStand[0] - this.lay.sledStand[1]) } : null;
    const lock = this.lay.lockers && this.lay.lockers.apt;
    const extra = [];
    if (lock && this.up.lv.lockA) extra.push({ aid: 'lockA', kind: 'locker', name: 'gb_up_lockA', door: { x: 3120 + 64 * (lock[0] + lock[1]), y: 1315 + 32 * (lock[0] - lock[1]) }, households: [] });
    const n = this.book.build({ entries: entries.concat(extra), rn: this.rn, lg: this.lg, kit: this.kit, village: this.village, stand: this.up.lv.sled >= 1 && this.village ? stand : null, standCurb: this.lay.standCurb, avoid: this.avoid || null });
    // the dog sleds (개썰매 2 adds the second team; a new village graph rebuilds them where they stand)
    const want = this.village ? Math.max(0, Math.min(2, this.up.lv.sled | 0)) : 0;
    if (this.sleds.length && this.sleds[0].g !== this.village && this.village) {
      for (const q of this.sleds) { if (q.load.length) for (const o of q.load) this.sledQ.unshift(o); if (q.cload && sum(q.cload) && this.env.surplus) this.env.surplus(q.cload); }
      this.sleds = [];
    }
    while (this.sleds.length < want) this.sleds.push(new Sled(this.tune, this.village, this.village.stand, this.sleds.length + 1));
    // orders to an address that is gone go back to the racks (unless they are on a van: the van restocks at the stop);
    // (critique M5) village orders while the stand cannot be placed go back too (nobody would ever carry them)
    const standOk = !!this.book.get('stand');
    for (const o of this.orders.list.slice()) {
      const a = this.book.get(o.aid);
      const dead = !a || a.zone === 'none' || (a.zone === 'sled' && (!standOk || !this.sleds.length));
      if (dead && (o.st === 'pick' || o.st === 'pack' || o.st === 'ready') && !o.van) this.restock(o, 'gone');
    }
    if (this.savedRows) this.restoreOrders(this.savedRows);
    return n;
  }

  applyLevels() {
    const L = this.up.lv;
    this.hub.setCrew(this.tune.hub.pickers + (L.pack ? 2 : 0), this.tune.hub.packers + (L.pack ? 1 : 0));
    if (this.disp) this.disp.setVans(L.van);
  }

  // ------------------------------------------------------------------------------------------ the loop
  emit(e) { this.events.push(Object.assign({ T: this.T }, e)); }

  working() { const H = this.tune.hours; return this.up.lv.dawn ? true : this.hour >= H.open && this.hour < H.close; }
  dayShift() { const H = this.tune.hours; return this.hour >= H.open && this.hour < H.close; }
  quiet() { const D = this.tune.door; return this.hour >= D.quietFrom || this.hour < D.quietTo; }

  tick(dt, T, hour) {
    this.T = T; this.hour = hour;
    const day = Math.floor(T / DAY);
    const dayChanged = this.day >= 0 && day !== this.day;
    if (day !== this.day) { this.settle.newDay(day); this.day = day; }
    if (this.st === 0) this.gate(dt);
    else if (this.st === 1) { this.openT -= dt; if (this.openT <= 0) this.opened(); }
    else if (this.st === 2 && this.kit && this.kit.ok) {
      // (critique H2) 정 할머니's order waits for its stock instead of being skipped: retried each second (the opening
      // set her 장작 · 빵 aside already when anything had them: racks, the dock surplus, the log pile)
      if (this.firstAt !== undefined && this.T >= this.firstAt) {
        if (this.seen & SEEN.first) this.firstAt = undefined;
        else if (this.firstOrder()) this.firstAt = undefined;
        else this.firstAt = this.T + 1;
      }
      this.run(dt, dayChanged);
    }
  }

  /** D2: depot built, then one game day — or racks ≥ gate.fullAt for gate.fullForS — and the letter comes */
  gate(dt) {
    if (this.seen & SEEN.letter) return;
    const G = this.tune.gate;
    this.gateT += dt;
    const fill = this.env.rackFill ? this.env.rackFill() : 0;
    this.fullT = fill >= G.fullAt ? this.fullT + dt : 0;
    if (this.gateT >= G.dayS || this.fullT >= G.fullForS) { this.seen |= SEEN.letter; this.emit({ t: 'gb:letter' }); }
  }
  /** the letter is there (or forced by a scenario) */
  letterDue() { return !!(this.seen & SEEN.letter); }

  /** paid at the pad: the opening ceremony (≈ 6 s), then the first order */
  open(opts = {}) {
    if (this.st === 2) return false;
    this.seen |= SEEN.letter;
    this.st = 1;
    this.openT = opts.ceremonyS !== undefined ? opts.ceremonyS : 6;
    this.pad = null;
    // the crew sets 정 할머니's 장작 · 빵 aside at once (the walk-in buyers empty the racks by day)
    if (!(this.seen & SEEN.first)) this.stockFirst();
    this.emit({ t: 'gb:opening' });
    return true;
  }

  /** 정 할머니's items into 금방's share: from the racks, else the station dock's surplus, else a village pile */
  stockFirst() {
    const env = this.env, F = this.tune.orders.firstItems || {};
    for (const k of Object.keys(F).sort()) {
      let need = F[k] - (this.res[k] || 0);
      const add = (g) => { g = Math.max(0, Math.floor(g || 0)); if (g > 0) { this.res[k] = (this.res[k] || 0) + g; need -= g; } };
      if (need > 0 && env.source && env.source.count(k) > 0) add((env.source.pick({ [k]: Math.min(need, env.source.count(k)) }) || {})[k]);
      if (need > 0 && env.dockTake) add(env.dockTake(k, need));
      if (need > 0 && env.pileTake) add(env.pileTake(k, need));
    }
  }

  opened() {
    this.st = 2;
    this.emit({ t: 'gb:open' });
    // 정 할머니's order a moment later (the opening banner reads first, plan §3.2 → §3.3)
    if (!(this.seen & SEEN.first)) { this.firstAt = this.T + ((this.tune.open && this.tune.open.firstDelayS) || 0); this.firstDue = this.firstAt; }
  }

  /** 정 할머니: 장작 4 · 빵 2 (what the racks have when they lack those) */
  firstOrder() {
    const hh = (this.env.firstHousehold && this.env.firstHousehold(this.book)) || this.book.households().find((h) => { const a = this.book.get(h.aid); return a && a.zone === 'van' && a.kind === 'apt' && h.elder; }) || this.book.households().find((h) => { const a = this.book.get(h.aid); return a && a.zone === 'van'; });
    if (!hh) return null;
    this.stockFirst();
    const src = this.env.source, want = {};
    // her items from 금방's share (set aside at the opening) and the racks; else what 금방 has, at least 2 items
    for (const [k, n] of Object.entries(this.tune.orders.firstItems)) { const q = Math.min(n, (this.res[k] || 0) + Math.max(0, src.count(k))); if (q > 0) want[k] = q; }
    if (sum(want) < 2) for (const k of this.catKeys) { if (sum(want) >= 4) break; const q = Math.min(2, this.avail(k)); if (q > 0 && !want[k]) want[k] = q; }
    if (sum(want) < 2) return null;
    const o = this.orders.place(this.T, this.hour, hh, this.ctx(), { want, first: true });
    if (!o) return null;
    o.tomorrow = false;
    this.seen |= SEEN.first;
    this.follow = o.id;
    this.settle.ordered(o);
    this.emit({ t: 'gb:order', id: o.id, aid: o.aid, hid: o.hid, by: o.by, items: copy(o.got), first: true });
    return o;
  }

  /** the order context the OrderBook reads */
  ctx() {
    const env = this.env;
    if (!this._ctx) {
      this._ctx = {
        dayS: DAY,
        source: this.stock(),
        avail: (k) => this.avail(k),
        reserved: (k) => this.res[k] || 0,
        guard: this.guard,
        level: (cat) => (env.source && env.source.level ? env.source.level(cat) : 0.5),
        households: [],
        // (critique M5) the old village only while a dog sled and its stand are there
        zoneOk: (aid) => { const a = this.book.get(aid); return !!a && (a.zone === 'van' || (a.zone === 'sled' && this.sleds.length > 0 && !!this.book.get('stand'))); },
        address: (aid) => this.book.get(aid),
        shopPrice: (item) => (env.price ? env.price(item) : this.tune.shopPrice[item] || 1),
        snow: false, dawn: false,
      };
    }
    this._ctx.households = this.book.households();
    this._ctx.snow = env.snow ? !!env.snow() : false;
    this._ctx.dawn = !!this.up.lv.dawn;
    // (critique M3) what the crew carries in one round: the vans' boxes + the dog sleds' baskets
    const V = this.tune.van, S = this.tune.sled;
    this._ctx.capacity = (this.disp ? this.disp.vans.length : 0) * (V.cap || 8) + (this.sleds.length && this.book.get('stand') ? this.sleds.length * (S.cap || 4) : 0);
    return this._ctx;
  }

  /** what an order may take of an item: 금방's share + the racks above keepFloor */
  avail(k) { const src = this.env.source; return (this.res[k] || 0) + Math.max(0, (src ? src.count(k) : 0) - this.tune.orders.keepFloor); }

  /** the source the OrderBook sees: 금방's share first, then the racks */
  stock() {
    if (this._stock) return this._stock;
    const env = this.env;
    this._stock = {
      count: (k) => (this.res[k] || 0) + (env.source ? env.source.count(k) : 0),
      pick: (items) => {
        const out = {};
        for (const k in items) {
          let n = Math.max(0, Math.floor(items[k]) || 0);
          const a = Math.min(n, this.res[k] || 0);
          if (a > 0) { this.res[k] -= a; if (!this.res[k]) delete this.res[k]; out[k] = a; n -= a; }
          if (n > 0 && env.source) { const g = (env.source.pick({ [k]: n }) || {})[k] || 0; if (g > 0) out[k] = (out[k] || 0) + g; }
        }
        return out;
      },
      restock: (items) => (env.source && env.source.restock ? env.source.restock(items) : items),
      level: (cat) => (env.source && env.source.level ? env.source.level(cat) : 0.5),
    };
    return this._stock;
  }

  /** 금방's share tops up from what lands on the racks (each second; ≤ share.per × weight an item, ≤ share.max) */
  topUp() {
    const S = this.tune.share, src = this.env.source;
    if (!S || !(S.max > 0) || !src) return;
    let total = sum(this.res);
    for (const k of this.catKeys) {
      if (total >= S.max) break;
      if (this.guard.paused(k) || this.orders.selling[k] === false) continue;
      const target = Math.max(1, Math.round(S.per * Math.min(1, this.tune.catalog[k] || 0)));
      const have = this.res[k] || 0, c = src.count(k);
      if (have >= target || c <= 0) continue;
      const g = (src.pick({ [k]: Math.min(target - have, S.max - total, c) }) || {})[k] || 0;
      if (g > 0) { this.res[k] = have + g; total += g; }
    }
  }

  run(dt, dayChanged) {
    const env = this.env, ev = [];
    this.secT += dt;
    const sec = this.secT >= 1;
    if (sec) { this.secT -= 1; this.guard.update(1, env.shelf || null, this.ids); this.topUp(); }
    // orders
    // (no other order before 정 할머니's first one — unless her stock has not come for orders.firstWaitS)
    const firstHold = this.firstAt !== undefined && this.T - (this.firstDue === undefined ? this.T : this.firstDue) < (this.tune.orders.firstWaitS || 60);
    for (const o of !firstHold ? this.orders.tick(dt, this.T, this.hour, this.ctx()) : NONE) {
      this.settle.ordered(o);
      this.emit({ t: 'gb:order', id: o.id, aid: o.aid, hid: o.hid, by: o.by, items: copy(o.got), tomorrow: o.tomorrow });
    }
    // the hub (day crew 07–21; the night crew with 새벽배송)
    const working = this.working();
    this.hub.update(dt, this.orders, working, ev);
    // shift change at 21:00
    const H = this.tune.hours;
    if (this.lastHour >= 0 && this.lastHour < H.close && this.hour >= H.close) this.emit({ t: 'gb:shift', night: !!this.up.lv.dawn });
    // overnight count (새벽배송 need) at 07:00
    let overnight = null;
    if (this.lastHour >= 0 && this.lastHour < H.open && this.hour >= H.open) { overnight = this.orders.list.length; this.settle.today.overnight = overnight; }
    this.lastHour = this.hour;
    // vans + the sleds
    const dctx = this.dctx(working);
    if (this.disp) this.disp.update(dt, dctx);
    if (this.sleds.length) { const sc = this.sctx(dctx); for (const q of this.sleds) q.update(dt, sc); }
    // the doorstep boxes, the lockers
    for (const e of this.settle.updateDoor(dt, this.hour, env, { hourS: HOUR })) this.emit(Object.assign({}, e, { t: 'gb:' + e.t }));
    for (const e of this.settle.updateLockers(dt, this.hour, env)) this.emit(Object.assign({}, e, { t: 'gb:' + e.t }));
    // upgrades (each second)
    if (sec) {
      const pickPack = this.orders.list.filter((o) => o.st === 'pick' || o.st === 'pack').length;
      const ready = this.orders.list.filter((o) => o.st === 'ready').length;
      // 개썰매 2: village parcels pile up, or full piles wait while every sled is busy (금방 집하)
      const sledsBusy = this.sleds.length > 0 && this.sleds.every((q) => q.busy());
      const collectNeed = !!(sledsBusy && this.tune.collect && this.tune.collect.on && this.dayShift() && env.piles && (env.piles() || []).some((p) => p.max > 0 && p.n / p.max >= this.tune.collect.pileAt));
      const off = this.up.measure(1, { pickPack, ready, sledQ: this.sledQ.length + this.orders.list.filter((o) => o.mode === 'sled' && o.st === 'ready').length, collectNeed, day: this.dayShift(), vans: this.up.lv.van, dockSurplus: env.dockSurplus ? env.dockSurplus() : 0, overnight, dayChanged });
      if (off) this.emit({ t: 'gb:offer', kind: off.kind, cost: off.cost });
    }
    for (const e of ev) this.emitHub(e);
  }

  emitHub(e) {
    if (e.t === 'ready') { const o = this.orders.get(e.id); if (o) o.tReady = this.T; this.emit({ t: 'gb:ready', id: e.id, aid: e.aid, size: e.size }); }
    else this.emit(Object.assign({}, e, { t: 'gb:' + e.t }));
  }

  /** the dispatcher's context */
  dctx(working) {
    const env = this.env;
    if (!this._dctx) {
      this._dctx = {
        book: this.orders, addresses: this.book, ev: null,
        settle: (o, how, van) => this.deliver(o, how, van),
        standDrop: (o) => this.standDrop(o),
        restock: (o, why) => this.restock(o, why),
        sleighBusy: () => (env.sleighBusy ? !!env.sleighBusy() : false),
        walkers: env.walkers ? (x, y) => env.walkers(x, y) : null,
        live: (x, y) => (env.live ? !!env.live(x, y) : false),
        home: (aid, hid) => (env.home ? env.home(aid, hid) !== false : true),
        lockerFor: (a) => this.lockerFor(a),
        fetchDue: (van) => !!(this.up.lv.back && this.up.lv.van >= 2 && !van.backload && env.dockSurplus && env.dockSurplus() >= 16),
        fetch: () => (env.takeSurplus ? env.takeSurplus(16) : null),
        backhaul: (items) => { const refused = env.source && env.source.restock ? env.source.restock(items) : items; if (refused && sum(refused) && env.surplus) env.surplus(refused); },
      };
    }
    const c = this._dctx;
    c.T = this.T; c.hour = this.hour; c.working = working; c.quiet = this.quiet();
    c.quietAt = (dtS) => { const D = this.tune.door, h = (this.hour + dtS / HOUR) % 24; return h >= D.quietFrom || h < D.quietTo; };
    c.night = !this.dayShift();
    c.lateTour = !this.up.lv.dawn && this.hour >= this.tune.hours.close - (this.tune.van.lastTourH || 1.5) && this.hour < this.tune.hours.close;
    // seconds left until closing + lastTourH (a tour that would run longer is cut short; with 새벽배송: no limit)
    c.leftS = this.up.lv.dawn || this.hour >= this.tune.hours.close || this.hour < this.tune.hours.open ? Infinity : (this.tune.hours.close + (this.tune.van.lastTourH || 1.5) - this.hour) * HOUR;
    c.ev = { push: (e) => this.dispEvent(e) };
    c.extraStand = !!(this.up.lv.back && this.up.lv.van >= 2 && env.dockSurplus && env.dockSurplus() >= 16);
    return c;
  }

  /** the dog sleds' context (the dispatcher's + the stand queue, the piles, the dock) */
  sctx(dctx) {
    const env = this.env;
    if (!this._sctx) {
      this._sctx = Object.create(null);
      this._sctx.piles = () => (env.piles ? env.piles() : []);
      this._sctx.takePile = (id, n, to) => (env.takePile ? env.takePile(id, n, to) : 0);
      this._sctx.dockRoom = (item) => (env.dockRoom ? env.dockRoom(item) : 0);
      this._sctx.dockDrop = (items) => { const n = sum(items); if (!n) return; if (env.dockDrop) env.dockDrop(items); else if (env.surplus) env.surplus(items); this.settle.today.col += n; this.settle.col += n; };
      this._sctx.claimed = (id, sled) => this.sleds.some((q) => q !== sled && q.cplan && q.cplan.slice(q.cstop).some((p) => p.id === id));
    }
    const c = this._sctx;
    for (const k in dctx) if (!(k in c) || k === 'ev' || k === 'T' || k === 'hour' || k === 'working' || k === 'quiet' || k === 'quietAt' || k === 'night') c[k] = dctx[k];
    c.queue = this.sledQ;
    c.collect = !!(this.tune.collect && this.tune.collect.on) && this.dayShift();
    return c;
  }

  dispEvent(e) {
    const map = { dispatch: 'gb:dispatch', arrive: 'gb:arrive', horn: 'gb:horn', load: 'gb:load', skip: 'gb:skip', watchdog: 'gb:watchdog', home: 'gb:home', bay: 'gb:bay', van: 'gb:van', beat: 'gb:beat', sled: 'gb:sled', backhaul: 'gb:backhaul', collect: 'gb:collect' };
    this.emit(Object.assign({}, e, { t: map[e.t] || 'gb:' + e.t }));
  }

  /** the apartment locker serves the apartments once it is bought (and has room: residents empty it, H5) */
  lockerFor(a) {
    if (!this.up.lv.lockA || a.kind !== 'apt') return null;
    const L = this.book.get('lockA');
    if (!L || L.zone !== 'van') return null;
    return this.settle.lockers.A.length < this.tune.locker.cap ? L : null;
  }
  /** (compat) the apartment locker's parcels */
  get lockerA() { return this.settle.lockers.A; }

  deliver(o, how, van) {
    if (how === 'locker') this.settle.lockers[van === 'lockP' ? 'P' : 'A'].push({ id: o.id, aid: o.aid, age: 0 });
    const e = this.settle.deliver(o, how, this.T, this.env, { openedAt: (t) => this.openedAt(t), doorOf: (aid) => { const a = this.book.get(aid); return a ? a.door : { x: 0, y: 0 }; } });
    this.orders.close(o);
    const a = this.book.get(o.aid);
    this.emit({ t: 'gb:delivered', id: o.id, aid: o.aid, n: e.n, coins: e.coins, onTime: e.onTime, how: e.how, van: typeof van === 'object' && van ? van.id : van, review: e.review, first: o.first, x: a ? a.door.x : 0, y: a ? a.door.y : 0, by: o.by, hid: o.hid, size: o.size });
    if (e.how === 'doorstep' && e.box) this.emit({ t: 'gb:doorstep', id: o.id, aid: o.aid, size: o.size });
    if (o.first) this.emit({ t: 'gb:firstDone', id: o.id });
    if (this.follow === o.id) this.followEnd = this.T;
  }

  /** the sled's stand took a village parcel from a van: into the 광장 보관함 when it is bought and has room (the
   *  villagers fetch it; the sleds are free for 금방 집하), else onto the sleds' queue */
  standDrop(o) {
    o.van = 'sled'; o.tStand = this.T;
    if (this.up.lv.lockP && this.settle.lockers.P.length < this.tune.locker.cap) { this.deliver(o, 'locker', 'lockP'); this.emit({ t: 'gb:locker', kind: 'P', id: o.id, n: this.settle.lockers.P.length }); return; }
    if (this.sleds.length) { this.sledQ.push(o); this.emit({ t: 'gb:stand', id: o.id, n: this.sledQ.length }); }
    else this.restock(o, 'noSled');
  }

  /** an order goes back to the racks (address gone, route lost, blocked twice): no coins */
  restock(o, why) {
    if (o.st === 'done' || o.st === 'back') return;
    const src = this.env.source;
    const refused = src && src.restock ? src.restock(copy(o.got)) : copy(o.got);
    if (refused && sum(refused) && this.env.surplus) this.env.surplus(refused);
    o.st = 'back';
    this.orders.close(o);
    this.emit({ t: 'gb:restock', id: o.id, aid: o.aid, why, items: copy(o.got), refused: refused && sum(refused) ? refused : null });
  }

  /** when the hub next opens at or after T (night orders count their promise from there) */
  openedAt(t) {
    if (this.up.lv.dawn) return t;
    const H = this.tune.hours, h = (t / HOUR) % 24;
    if (h >= H.open && h < H.close) return t;
    const add = h >= H.close ? 24 - h + H.open : H.open - h;
    return t + add * HOUR;
  }

  // ------------------------------------------------------------------------------------------ api
  /** a van holds the spur (bay 1 ↔ the join on 중앙로: ave_s, bank_st, the apron) — the cargo sleigh holds before it
   *  (integration G-P2b: DepotSystem.gbSpurBusy) */
  spurBusy() { return !!(this.disp && this.disp.token !== null); }

  upgrade(kind) {
    const lv = this.up.buy(kind, this.env);
    if (!lv) return false;
    this.applyLevels();
    if (kind === 'lockA' || kind === 'lockP' || kind === 'sled2') this.setWorld(this.entries || [], this.village);
    this.applyLevels();
    this.emit({ t: 'gb:upgrade', kind, lv });
    return true;
  }
  deal(item) { const ok = this.orders.deal(item, this.T); if (ok) this.emit({ t: 'gb:deal', item }); return ok; }
  sell(item, on) { return this.orders.sell(item, on); }

  /** what the racks show: the stock + 금방's share + the lines no picker has taken yet (a stack drops when it is picked) */
  shown() { const u = this.hub.unpicked(this.orders); for (const k in this.res) u[k] = (u[k] || 0) + this.res[k]; return u; }

  // ------------------------------------------------------------------------------------------ save
  serialize() {
    const L = this.up.lv;
    const ord = [];
    let extra = '';
    const gotS = (g) => Object.keys(g).sort().filter((k) => g[k] > 0).map((k) => k.replace(/^item_/, '') + Math.floor(g[k])).join(',');
    for (const o of this.orders.list) {
      if (o.st === 'done' || o.st === 'back') continue;
      const got = gotS(o.got);
      // (critique L4) rows beyond the slice's 24 fold into `back` (their items return to the racks at load)
      if (ord.length >= 24) { extra = mergeGot(extra, got); continue; }
      // 'gone' (on a van) and the sled's are saved as ready: vans restart from bay 1
      const st = o.st === 'pick' ? 'p' : o.st === 'pack' ? 'k' : 'r';
      const flags = st + (o.mode === 'sled' ? 's' : 'c') + (o.first ? 'f' : '') + (o.tomorrow ? 't' : '');
      ord.push([o.id, slot(o.aid), flags, got, Math.max(0, Math.round(this.T - o.t0))]);      // t0 as its age (s)
    }
    // crates on their way to the station dock (금방 집하 on a sled, backhaul on a van): to the dock at load (M2)
    let dock = '';
    for (const q of this.sleds) if (q.cload) dock = mergeGot(dock, gotS(q.cload));
    if (this.disp) for (const v of this.disp.vans) if (v.backload) dock = mergeGot(dock, gotS(v.backload));
    const door = this.settle.door.slice(0, this.tune.door.maxDoorstep).map((b) => [slot(b.aid), b.size, Math.round(b.age / HOUR * 10) / 10]);
    const out = {
      v: 1, st: this.st,
      lv: { van: L.van, pack: L.pack, sled: L.sled, dawn: L.dawn, back: L.back, lockP: L.lockP, lockA: L.lockA },
      seq: this.orders.seq, seed: this.seed >>> 0, day: Math.max(0, this.day),
      ord, door,
      staff: (this.staffLooks || []).slice(0, 12),
      days: [[this.settle.today.orders, this.settle.today.delivered, this.settle.today.coins]].concat(this.settle.days).slice(0, 7).map((d) => d.slice(0, 3)),     // today first
      tot: this.settle.tot.slice(0, 4),
      rev: this.settle.rev.slice(0, 12),
      seen: this.seen,
    };
    if (this.st === 0 && !(this.seen & SEEN.letter)) out.g = Math.round(this.gateT);
    if (this.up.ok.size || this.up.nights || this.up.sledDays) out.up = [Array.from(this.up.ok).filter((k) => k !== 'sled2c').sort().join(','), this.up.nights, this.up.sledDays];
    if (extra) out.back = extra;
    const res = gotS(this.res);
    if (res) out.res = res;
    if (dock) out.dock = dock;
    const lk = [this.settle.lockers.P.length, this.settle.lockers.A.length];
    if (lk[0] || lk[1]) out.lk = lk;
    if (this.st === 0 && this.pad) { if (this.pad.paid > 0) out.pp = Math.floor(this.pad.paid); const pi = gotS(this.pad.got || {}); if (pi) out.pi = pi; }
    if (this.orders.nextT !== null && Number.isFinite(this.orders.nextT)) out.nx = Math.round(Math.max(0, Math.min(600, this.orders.nextT - this.T)) * 10) / 10;
    if (this.settle.col || this.settle.today.col) out.cl = [this.settle.today.col | 0, this.settle.col | 0];
    return fitGeumbang(out, this.capBytes || 1400);
  }

  /** saved orders back (after the AddressBook is built): unknown addresses go back to the racks */
  restoreOrders(s) {
    this.savedRows = null;
    this.orders.seq = Math.max(this.orders.seq, s.seq | 0);
    // items of orders that did not fit the slice go back on the racks
    if (s.back) { const b = parseGot(s.back); if (sum(b)) { const refused = this.env.source && this.env.source.restock ? this.env.source.restock(b) : b; if (refused && sum(refused) && this.env.surplus) this.env.surplus(refused); this.emit({ t: 'gb:restock', id: null, why: 'cap', items: b }); } }
    // 금방's share (C1), the crates that were on their way to the dock (M2), the lockers (H5), the next arrival (L3)
    if (s.res) { const r = parseGot(s.res); for (const k in r) if (this.tune.catalog[k] !== undefined) this.res[k] = (this.res[k] || 0) + r[k]; else { const ref = this.env.source && this.env.source.restock ? this.env.source.restock({ [k]: r[k] }) : { [k]: r[k] }; if (ref && sum(ref) && this.env.surplus) this.env.surplus(ref); } }
    if (s.dock) { const d = parseGot(s.dock); if (sum(d) && this.env.surplus) this.env.surplus(d); }
    if (Array.isArray(s.lk)) { for (let k = 0; k < (s.lk[0] | 0); k++) this.settle.lockers.P.push({ id: 'lp' + k, aid: 'stand', age: 0 }); for (let k = 0; k < (s.lk[1] | 0); k++) this.settle.lockers.A.push({ id: 'la' + k, aid: 'lockA', age: 0 }); }
    if (Number.isFinite(s.nx)) this.orders.nextT = this.T + s.nx;
    if (Array.isArray(s.cl)) { this.settle.col = s.cl[1] | 0; if ((s.day | 0) === Math.floor(this.T / DAY)) this.settle.today.col = s.cl[0] | 0; }
    for (const r of s.ord || []) {
      const [id, to, flags, gotS, age] = r;
      const t0 = this.T - Math.max(0, Number(age) || 0);
      const aid = unslot(to);
      const got = parseGot(gotS);
      if (!sum(got)) continue;
      const a = this.book.get(aid);
      const st = flags[0] === 'p' ? 'pick' : flags[0] === 'k' ? 'pack' : 'ready';
      const o = new Order({ id, aid, hid: null, want: got, got, st, t0, first: flags.indexOf('f') >= 0, mode: flags[1] === 's' ? 'sled' : 'centre' });
      o.tomorrow = flags.indexOf('t') >= 0;
      o.value = this.orders.valueOf(o.got, this.ctx().shopPrice);
      o.promise = t0 + this.tune.pay.promiseS;
      if (st === 'ready') o.tReady = t0;
      if (!a || a.zone === 'none') {
        // its items go back on the racks (never lost, never doubled)
        const refused = this.env.source && this.env.source.restock ? this.env.source.restock(copy(got)) : got;
        if (refused && sum(refused) && this.env.surplus) this.env.surplus(refused);
        this.emit({ t: 'gb:restock', id, aid, why: 'load', items: got });
        continue;
      }
      const hh = a.hh[0];
      o.hid = hh ? hh.hid : null; o.by = hh && hh.people[0] ? hh.people[0].pid : null;
      if (o.first) this.follow = o.id;
      this.orders.restore(o);
    }
    this.settle.door = [];
    for (const d of s.door || []) {
      const aid = unslot(d[0]), a = this.book.get(aid);
      if (!a) continue;
      this.settle.door.push({ aid, size: d[1], age: (Number(d[2]) || 0) * HOUR, id: 'd' + this.settle.door.length, snowy: (Number(d[2]) || 0) >= this.tune.door.snowCapH, x: a.door.x, y: a.door.y });
    }
    // days[0] is the day of the save: today again when the reload is the same game day, else history
    const rows = (s.days || []).map((d) => d.slice());
    if (rows.length && (s.day | 0) === Math.floor(this.T / DAY)) { const t = rows.shift(); Object.assign(this.settle.today, { orders: t[0] | 0, delivered: t[1] | 0, coins: t[2] | 0 }); }
    this.settle.days = rows;
    this.settle.tot = (s.tot || [0, 0, 0, 0]).slice();
    this.settle.rev = (s.rev || []).map((r) => r.slice());
    this.staffLooks = (s.staff || []).slice();
    if (Array.isArray(s.up)) { for (const k of String(s.up[0] || '').split(',').filter(Boolean)) this.up.ok.add(k); this.up.nights = s.up[1] | 0; this.up.sledDays = s.up[2] | 0; }
    if (s.st === 1) { this.st = 1; this.openT = 0.1; }
  }

  // ------------------------------------------------------------------------------------------ state (UI, tests)
  state() {
    const o = this.orders.list;
    const count = (st) => o.filter((q) => q.st === st).length;
    return {
      st: this.st, seen: this.seen, T: this.T, hour: this.hour, day: this.day,
      open: o.length, pick: count('pick'), pack: count('pack'), ready: count('ready'), gone: count('gone'),
      today: Object.assign({}, this.settle.today), days: this.settle.days.slice(), tot: this.settle.tot.slice(),
      vans: this.disp ? this.disp.vans.map((v) => v.state()) : [], sled: this.sled ? this.sled.state() : null, sleds: this.sleds.map((q) => q.state()),
      res: Object.assign({}, this.res), sledQ: this.sledQ.length, col: { today: this.settle.today.col, all: this.settle.col }, lockers: { P: this.settle.lockers.P.length, A: this.settle.lockers.A.length },
      hub: this.hub.state(), door: this.settle.door.map((b) => ({ aid: b.aid, size: b.size, snowy: b.snowy, x: b.x, y: b.y, id: b.id })),
      offer: this.up.offer, lv: Object.assign({}, this.up.lv), rev: this.settle.rev.slice(), follow: this.follow,
      paused: Array.from(this.ids).filter((k) => this.guard.paused(k)), deals: Object.keys(this.orders.deals).filter((k) => this.orders.dealOn(k, this.T)),
      selling: Object.assign({}, this.orders.selling), working: this.working(), quiet: this.quiet(), photos: this.settle.photos.slice(),
      addresses: this.book.list().length, zones: this.book.list().reduce((m, a) => { m[a.zone] = (m[a.zone] || 0) + 1; return m; }, {}),
    };
  }
}

/** save slot of an address id: 'a:t_apt2' (town building), 'l:lotH3' (district lot), 'h:<id>' (a village house) */
export function slot(aid) {
  if (/^lot[A-Z]\d$/.test(aid)) return 'l:' + aid;
  if (/^t_/.test(aid)) return 'a:' + aid;
  return 'h:' + aid;
}
export function unslot(s) { return typeof s === 'string' && s.length > 2 && s[1] === ':' ? s.slice(2) : String(s || ''); }
/** 'bread3,can2' -> { item_bread: 3, item_can: 2 } */
export function parseGot(s) {
  const out = {};
  for (const part of String(s || '').split(',')) {
    const m = /^([a-z][a-z_]{0,23}?)(\d{1,4})$/.exec(part);
    if (!m) continue;
    const n = Math.min(9999, Number(m[2]) | 0);
    if (n > 0) out['item_' + m[1]] = (out['item_' + m[1]] || 0) + n;
  }
  return out;
}
export { SEEN };
