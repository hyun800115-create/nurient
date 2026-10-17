// OrderBook (plan §5.2, pure, seeded). Households order about once per orders.everyDays game days, shaped by the hour
// curve, snow, the racks and the free 특가; one parcel of 1–3 lines / 2–6 items. PLACING PICKS: the items leave the
// depot racks at once (source.pick), so an order can never be unfillable and the walk-in 상인 never sell the same
// crates; the racks always keep orders.keepFloor of every item. Order shape = v8 `Order` (src/city/logistics/model/
// orders.js): id, to 'home:<aid>', kind 'home', mode 'centre' (van) | 'sled', want, got, st pick | pack | ready |
// gone | done (+ 'back': restocked, no coins) + by (pid), hid, aid, t0, size s|m|l, value (coins on delivery).

import { stream } from './rng.js';
import { hourMult } from '../tuning.js';

export const sum = (o) => { let n = 0; for (const k in o) n += o[k] || 0; return n; };
export const copy = (o) => { const r = {}; for (const k in o) if (o[k] > 0) r[k] = o[k]; return r; };
export const RAW = ['item_fish_raw', 'item_meat_raw', 'item_log', 'item_wheat'];
export const TOOLS = ['item_axe', 'item_rod', 'item_sickle', 'item_bow', 'item_pickaxe'];
/** depot rack category of a catalogue item (rack.js catOf for these) */
export function catOf(item) {
  if (item === 'item_log' || item === 'item_plank' || item === 'item_wheat' || item === 'item_ore' || item === 'item_ingot') return 'materials';
  if (TOOLS.indexOf(item) >= 0) return 'tools';
  if (item === 'item_can') return 'goods';
  return 'food';
}

export class Order {
  constructor(o) {
    this.id = o.id;
    this.to = 'home:' + o.aid;
    this.kind = 'home';
    this.mode = o.mode || 'centre';
    this.want = copy(o.want || o.got || {});
    this.got = copy(o.got || {});
    this.st = o.st || 'pick';
    this.by = o.by || null;            // the resident who ordered (pid)
    this.hid = o.hid || null;
    this.aid = o.aid;
    this.t0 = o.t0 || 0;
    this.first = !!o.first;
    this.tomorrow = !!o.tomorrow;
    this.lines = Object.keys(this.got).sort();
    this.picked = 0;                   // lines taken off the racks by a picker
    this.n = sum(this.got);
    this.size = sizeOf(this.got);
    this.value = 0;
    this.van = null;
    this.tReady = -1; this.tGone = -1; this.tDone = -1;
    this.doorstep = false;
    this.onTime = true;
  }
}

/** box size from the item count: 2–3 small, 4–5 medium, 6+ or a tool large */
export function sizeOf(got) {
  const n = sum(got);
  if (n >= 6 || TOOLS.some((k) => got[k] > 0)) return 'l';
  return n >= 4 ? 'm' : 's';
}

export class OrderBook {
  constructor(tune, seed = 1) {
    this.tune = tune; this.seed = seed >>> 0;
    this.list = [];                 // open orders (pick … gone), oldest first
    this.byId = new Map();
    this.seq = 0;
    this.nextT = null;
    this.deals = {};                // item -> until T (the free 특가 button)
    this.selling = {};              // item -> false while the player paused it (팔기 · 쉬기)
    this.day = -1;
    this.rArr = null; this.rBas = null;
  }

  streams(day) {
    if (day !== this.day) { this.day = day; this.rArr = stream(this.seed, 'orders', day); this.rBas = stream(this.seed, 'basket', day); }
  }

  open() { return this.list; }
  get(id) { return this.byId.get(id) || null; }
  openAt(aid) { let n = 0; for (const o of this.list) if (o.aid === aid) n++; return n; }

  /** coins of one item on 금방 (shop price × priceRate; raw at rawPrice) */
  priceOf(item, shopPrice) {
    const P = this.tune.pay;
    if (P.rawPrice[item] !== undefined) return P.rawPrice[item];
    return Math.max(1, Math.round((shopPrice(item) || 1) * P.priceRate));
  }
  valueOf(got, shopPrice) { let v = 0; for (const k in got) v += this.priceOf(k, shopPrice) * got[k]; return v; }

  /** the weight of an item for a household now (0 = cannot be ordered) */
  weight(item, hh, T, ctx) {
    const O = this.tune.orders;
    const base = this.tune.catalog[item] || 0;
    if (base <= 0 || this.selling[item] === false) return 0;
    if (ctx.guard && ctx.guard.paused(item)) return 0;
    if (ctx.source.count(item) < 1 + O.keepFloor) return 0;
    let w = base;
    const taste = this.tune.taste && hh && this.tune.taste[hh.taste];
    if (taste && taste[item] !== undefined) w *= taste[item];
    if (hh && hh.people.some((p) => p.fav === item)) w *= O.favW;
    const lv = ctx.level ? ctx.level(catOf(item)) : 0.5;
    if (lv >= O.hot) w *= O.hotMult; else if (lv < O.low) w *= O.lowMult;
    if ((this.deals[item] || 0) > T) w *= O.dealMult;
    return w;
  }

  /** the arrival rate (orders / s) of everybody right now */
  rate(T, hour, ctx) {
    const O = this.tune.orders;
    const per = 1 / (O.everyDays * (ctx.dayS || 600));
    let n = 0;
    for (const hh of ctx.households) if (ctx.zoneOk(hh.aid)) n++;
    let r = n * per * hourMult(this.tune, hour) * (ctx.snow ? O.snowMult : 1);
    // the stock factor: how much of the catalogue is orderable (0.2 … 1.5)
    let w = 0, w0 = 0;
    for (const k in this.tune.catalog) { w0 += this.tune.catalog[k]; w += this.weight(k, null, T, ctx); }
    r *= Math.max(0.2, Math.min(1.5, w0 > 0 ? w / w0 : 0));
    if (w <= 0) r = 0;
    return r;
  }

  /** advance the arrival process: returns the orders placed this step */
  tick(dt, T, hour, ctx) {
    const O = this.tune.orders;
    this.streams(Math.floor(T / (ctx.dayS || 600)));
    const out = [];
    if (this.nextT === null) this.nextT = T + this.rArr.exp(8);
    let guard = 4;
    while (T >= this.nextT && guard-- > 0) {
      const r = this.rate(T, hour, ctx);
      if (r > 0 && this.list.length < O.maxOpen) {
        const hh = this.pickHousehold(ctx);
        if (hh) { const o = this.place(T, hour, hh, ctx); if (o) out.push(o); }
      }
      this.nextT += Math.min(O.maxGapS, r > 0 ? this.rArr.exp(1 / r) : O.maxGapS);
    }
    if (this.nextT < T) this.nextT = T + 1;
    return out;
  }

  pickHousehold(ctx) {
    const cap = this.tune.orders.perAddressOpen;
    const hhs = ctx.households;
    const ws = hhs.map((h) => (ctx.zoneOk(h.aid) && this.openAt(h.aid) < cap && !this.list.some((o) => o.hid === h.hid) ? h.w : 0));
    const i = this.rArr.weighted(ws);
    return i >= 0 ? hhs[i] : null;
  }

  /** a basket for a household: { item: n } (empty when nothing can be ordered) */
  basket(hh, T, ctx) {
    const O = this.tune.orders, r = this.rBas;
    const items = Object.keys(this.tune.catalog).sort();
    const ws = items.map((k) => this.weight(k, hh, T, ctx));
    const lines = Math.min(O.linesMax, 1 + r.weighted([0.45, 0.35, 0.2]));
    const want = {};
    let tool = false;
    for (let l = 0; l < lines; l++) {
      const i = r.weighted(ws.map((w, k) => (want[items[k]] || (tool && TOOLS.indexOf(items[k]) >= 0) ? 0 : w)));
      if (i < 0) break;
      const k = items[i];
      want[k] = 1;
      if (TOOLS.indexOf(k) >= 0) tool = true;
    }
    const keys = Object.keys(want);
    if (!keys.length) return {};
    // spread the item count over the lines (tools stay 1), capped by what the racks can spare
    let total = r.between(O.itemsMin, O.itemsMax);
    const room = (k) => Math.max(0, ctx.source.count(k) - O.keepFloor);
    let left = total - keys.length;
    for (let pass = 0; pass < 8 && left > 0; pass++) {
      for (const k of keys) {
        if (left <= 0) break;
        if (TOOLS.indexOf(k) >= 0) continue;
        if (want[k] < room(k) && r.chance(0.7)) { want[k]++; left--; }
      }
    }
    for (const k of keys) want[k] = Math.min(want[k], room(k));
    for (const k of keys) if (want[k] <= 0) delete want[k];
    total = sum(want);
    if (total < Math.min(O.itemsMin, 2) && !(total === 1 && tool)) return {};
    return want;
  }

  /** place an order: pick the items off the racks now. opts { want, first } (the forced first order) */
  place(T, hour, hh, ctx, opts = {}) {
    const H = this.tune.hours;
    const want = opts.want || this.basket(hh, T, ctx);
    if (!Object.keys(want).length) return null;
    const got = copy(ctx.source.pick(copy(want)) || {});
    if (!Object.keys(got).length) return null;
    const addr = ctx.address(hh.aid);
    const id = 'g' + (++this.seq);
    const o = new Order({ id, aid: hh.aid, hid: hh.hid, by: (hh.people[0] && hh.people[0].pid) || null, want, got, t0: T, first: !!opts.first, mode: addr && addr.zone === 'sled' ? 'sled' : 'centre' });
    o.tomorrow = !ctx.dawn && !(hour >= H.open && hour < H.close);
    o.value = this.valueOf(o.got, ctx.shopPrice);
    o.promise = T + this.tune.pay.promiseS;
    this.list.push(o);
    this.byId.set(id, o);
    hh.lastT = T;
    return o;
  }

  /** restore a saved order (its items are already off the racks) */
  restore(o) { this.list.push(o); this.byId.set(o.id, o); const n = Number(String(o.id).slice(1)); if (Number.isFinite(n) && n > this.seq) this.seq = n; }

  /** an order leaves the book (delivered or restocked) */
  close(o) {
    const i = this.list.indexOf(o);
    if (i >= 0) this.list.splice(i, 1);
    this.byId.delete(o.id);
  }

  /** the free 특가 button: × dealMult for one game day */
  deal(item, T) { if (!this.tune.catalog[item]) return false; this.deals[item] = T + (this.tune.deal ? this.tune.deal.durS : 600); return true; }
  dealOn(item, T) { return (this.deals[item] || 0) > T; }
  sell(item, on) { if (!this.tune.catalog[item]) return false; if (on) delete this.selling[item]; else this.selling[item] = false; return true; }
}
