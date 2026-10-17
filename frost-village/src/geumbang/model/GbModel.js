// GbModel (plan §5, §12.1): the whole 금방 loop as one pure, seeded model. No Phaser, no window: the world reaches it
// through `env` (the host builds env from the ports), and everything it does comes out as events.
//   const m = new GbModel({ tuning, seed, saved, env, layout })
//   m.setRoads(rn, laneGraph)          (the v4 RoadNet + the vehicles module's LaneGraph over it)
//   m.setWorld(entries, village)       (AddressBook rebuild: homes + households; ≤ once per 2 s)
//   m.tick(dt, T, hour)                -> drains into m.events (gb:* names, plan §12.3)
//   m.open() · m.upgrade(kind) · m.deal(item) · m.sell(item, on) · m.serialize() · m.state()
// env: { source: { count, pick, restock, level(cat) }, shelf(item), price(item), pay(coins, info), spend(cost, kind),
//        happy(x), home(aid, hid), passer(aid), walkers(x, y), live(x, y), sleighBusy(), snow(), rackFill(),
//        surplus(items) (refused restock -> dock), dockSurplus(), takeSurplus(n), firstHousehold() }

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
import { fitGeumbang } from '../save.js';

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
    this.kit = null; this.disp = null; this.sled = null;
    this.savedRows = s ? s : null;
    this.secT = 0;
    this.follow = null;                     // the order the camera follows (첫 주문 따라가기 / 따라가기)
    this.lastHour = -1;
    this.overnight = null;
    this.ids = new Set(Object.keys(this.tune.catalog));
    // a save made open but before 정 할머니's order: she still orders (once)
    if (this.st === 2 && !(this.seen & SEEN.first)) this.firstAt = this.T + 1;
    this.applyLevels();
  }

  // ------------------------------------------------------------------------------------------ world
  setRoads(rn, lg) {
    this.rn = rn; this.lg = lg;
    this.kit = new PathKit(lg, this.lay, this.tune);
    const old = this.disp;
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
    const n = this.book.build({ entries: entries.concat(extra), rn: this.rn, lg: this.lg, kit: this.kit, village: this.village, stand: this.up.lv.sled >= 1 && this.village ? stand : null, standCurb: this.lay.standCurb });
    if (this.village && this.up.lv.sled >= 1 && !this.sled) this.sled = new Sled(this.tune, this.village, this.village.stand);
    // orders to an address that is gone go back to the racks (unless they are on a van: the van restocks at the stop)
    for (const o of this.orders.list.slice()) {
      const a = this.book.get(o.aid);
      if ((!a || a.zone === 'none') && (o.st === 'pick' || o.st === 'pack' || o.st === 'ready') && !o.van) this.restock(o, 'gone');
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
      if (this.firstAt !== undefined && this.T >= this.firstAt) { this.firstAt = undefined; if (!(this.seen & SEEN.first)) this.firstOrder(); }
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
    this.emit({ t: 'gb:opening' });
    return true;
  }

  opened() {
    this.st = 2;
    this.emit({ t: 'gb:open' });
    // 정 할머니's order a moment later (the opening banner reads first, plan §3.2 → §3.3)
    if (!(this.seen & SEEN.first)) this.firstAt = this.T + ((this.tune.open && this.tune.open.firstDelayS) || 0);
  }

  /** 정 할머니: 장작 4 · 빵 2 (what the racks have when they lack those) */
  firstOrder() {
    const hh = (this.env.firstHousehold && this.env.firstHousehold(this.book)) || this.book.households().find((h) => { const a = this.book.get(h.aid); return a && a.zone === 'van' && a.kind === 'apt' && h.elder; }) || this.book.households().find((h) => { const a = this.book.get(h.aid); return a && a.zone === 'van'; });
    if (!hh) return null;
    const src = this.env.source, want = {};
    const floor = this.tune.orders.keepFloor;
    for (const [k, n] of Object.entries(this.tune.orders.firstItems)) { const q = Math.min(n, Math.max(0, src.count(k) - floor)); if (q > 0) want[k] = q; }
    if (sum(want) < 2) for (const k of Object.keys(this.tune.catalog)) { if (sum(want) >= 4) break; const q = Math.min(2, Math.max(0, src.count(k) - floor)); if (q > 0 && !want[k]) want[k] = q; }
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
        source: env.source,
        guard: this.guard,
        level: (cat) => (env.source && env.source.level ? env.source.level(cat) : 0.5),
        households: [],
        zoneOk: (aid) => { const a = this.book.get(aid); return !!a && a.zone !== 'none'; },
        address: (aid) => this.book.get(aid),
        shopPrice: (item) => (env.price ? env.price(item) : this.tune.shopPrice[item] || 1),
        snow: false, dawn: false,
      };
    }
    this._ctx.households = this.book.households();
    this._ctx.snow = env.snow ? !!env.snow() : false;
    this._ctx.dawn = !!this.up.lv.dawn;
    return this._ctx;
  }

  run(dt, dayChanged) {
    const env = this.env, ev = [];
    this.secT += dt;
    const sec = this.secT >= 1;
    if (sec) { this.secT -= 1; this.guard.update(1, env.shelf || null, this.ids); }
    // orders
    // (no other order before 정 할머니's first one)
    for (const o of this.firstAt === undefined ? this.orders.tick(dt, this.T, this.hour, this.ctx()) : NONE) {
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
    // vans + the sled
    const dctx = this.dctx(working);
    if (this.disp) this.disp.update(dt, dctx);
    if (this.sled) this.sled.update(dt, dctx);
    // the doorstep boxes
    for (const e of this.settle.updateDoor(dt, this.hour, env, { hourS: HOUR })) this.emit(Object.assign({}, e, { t: 'gb:' + e.t }));
    // upgrades (each second)
    if (sec) {
      const pickPack = this.orders.list.filter((o) => o.st === 'pick' || o.st === 'pack').length;
      const ready = this.orders.list.filter((o) => o.st === 'ready').length;
      const off = this.up.measure(1, { pickPack, ready, sledQ: this.sled ? this.sled.queue.length + this.orders.list.filter((o) => o.mode === 'sled' && o.st === 'ready').length : 0, day: this.dayShift(), vans: this.up.lv.van, dockSurplus: env.dockSurplus ? env.dockSurplus() : 0, overnight, dayChanged });
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
    c.ev = { push: (e) => this.dispEvent(e) };
    c.extraStand = !!(this.up.lv.back && this.up.lv.van >= 2 && env.dockSurplus && env.dockSurplus() >= 16);
    return c;
  }

  dispEvent(e) {
    const map = { dispatch: 'gb:dispatch', arrive: 'gb:arrive', horn: 'gb:horn', load: 'gb:load', skip: 'gb:skip', watchdog: 'gb:watchdog', home: 'gb:home', bay: 'gb:bay', van: 'gb:van', beat: 'gb:beat', sled: 'gb:sled', backhaul: 'gb:backhaul' };
    this.emit(Object.assign({}, e, { t: map[e.t] || 'gb:' + e.t }));
  }

  /** the apartment locker serves the apartments once it is bought (and has room) */
  lockerFor(a) {
    if (!this.up.lv.lockA || a.kind !== 'apt') return null;
    const L = this.book.get('lockA');
    if (!L || L.zone !== 'van') return null;
    const inside = this.lockerA || (this.lockerA = []);
    return inside.length < this.tune.locker.cap ? L : null;
  }

  deliver(o, how, van) {
    if (how === 'locker') {
      (this.lockerA || (this.lockerA = [])).push({ id: o.id, aid: o.aid, age: 0 });
    }
    const e = this.settle.deliver(o, how, this.T, this.env, { openedAt: (t) => this.openedAt(t), doorOf: (aid) => { const a = this.book.get(aid); return a ? a.door : { x: 0, y: 0 }; } });
    this.orders.close(o);
    const a = this.book.get(o.aid);
    this.emit({ t: 'gb:delivered', id: o.id, aid: o.aid, n: e.n, coins: e.coins, onTime: e.onTime, how: e.how, van: typeof van === 'object' && van ? van.id : van, review: e.review, first: o.first, x: a ? a.door.x : 0, y: a ? a.door.y : 0, by: o.by, hid: o.hid, size: o.size });
    if (e.how === 'doorstep' && e.box) this.emit({ t: 'gb:doorstep', id: o.id, aid: o.aid, size: o.size });
    if (o.first) this.emit({ t: 'gb:firstDone', id: o.id });
    if (this.follow === o.id) this.followEnd = this.T;
  }

  /** the sled's stand took a village parcel from a van */
  standDrop(o) {
    o.van = 'sled'; o.tStand = this.T;
    if (this.sled) { this.sled.queue.push(o); this.emit({ t: 'gb:stand', id: o.id, n: this.sled.queue.length }); }
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
    this.emit({ t: 'gb:upgrade', kind, lv });
    return true;
  }
  deal(item) { const ok = this.orders.deal(item, this.T); if (ok) this.emit({ t: 'gb:deal', item }); return ok; }
  sell(item, on) { return this.orders.sell(item, on); }

  /** what the racks show: the stock + the lines no picker has taken yet (so a stack drops when it is picked) */
  shown() { return this.hub.unpicked(this.orders); }

  // ------------------------------------------------------------------------------------------ save
  serialize() {
    const L = this.up.lv;
    const ord = [];
    for (const o of this.orders.list) {
      if (ord.length >= this.tune.orders.maxOpen) break;
      if (o.st === 'done' || o.st === 'back') continue;
      // 'gone' (on a van) and the sled's are saved as ready: vans restart from bay 1
      const st = o.st === 'pick' ? 'p' : o.st === 'pack' ? 'k' : 'r';
      const flags = st + (o.mode === 'sled' ? 's' : 'c') + (o.first ? 'f' : '') + (o.tomorrow ? 't' : '');
      const got = Object.keys(o.got).sort().map((k) => k.replace(/^item_/, '') + o.got[k]).join(',');
      ord.push([o.id, slot(o.aid), flags, got, Math.max(0, Math.round(this.T - o.t0))]);      // t0 as its age (s)
    }
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
    if (this.up.ok.size || this.up.nights || this.up.sledDays) out.up = [Array.from(this.up.ok).sort().join(','), this.up.nights, this.up.sledDays];
    return fitGeumbang(out, this.capBytes || 1400);
  }

  /** saved orders back (after the AddressBook is built): unknown addresses go back to the racks */
  restoreOrders(s) {
    this.savedRows = null;
    this.orders.seq = Math.max(this.orders.seq, s.seq | 0);
    // items of orders that did not fit the slice go back on the racks
    if (s.back) { const b = parseGot(s.back); if (sum(b)) { const refused = this.env.source && this.env.source.restock ? this.env.source.restock(b) : b; if (refused && sum(refused) && this.env.surplus) this.env.surplus(refused); this.emit({ t: 'gb:restock', id: null, why: 'cap', items: b }); } }
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
      vans: this.disp ? this.disp.vans.map((v) => v.state()) : [], sled: this.sled ? this.sled.state() : null,
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
