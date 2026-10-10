// LgxModel — the 솔방울 물류센터 as a pure, seeded simulation (no Phaser, window, timers or Math.random).
//   stock (racks) <- inbound (freight trucks, the receiving pad, the producers' pickup van) <- the village
//   stock -> pickers -> conveyor -> ready -> a shop owner's van / a walk-in owner / the centre's van -> shops, homes
//   settlement at the counter: wholesale + 15 % into the 물류 금고 (home orders pay the price on delivery)
//   chains: planks -> 가구 공방 -> furniture, ingots -> 가전 공장 -> appliances -> the racks -> homes (살림살이)
// The host feeds it (env snapshot: shops' needs, homes; feed events) and drains `events` (module events, lgx:*) and
// `viewEvents` (the forklift beeping, a door rolling up, the stamp) every frame.

import { Stock, rackFill } from './stock.js';
import { Order, Shipment, orderValue, sum, copy } from './orders.js';
import { Producer } from './chains.js';
import { Forklift, Docks, Queue, Staff } from './floor.js';
import { CATS, catOf, isItem, kindOf, FURNITURE, APPLIANCES } from './catalog.js';
import { stream, hashStr } from './rng.js';
import { Mover, walkLegs } from './geom.js';

const DAY = 600, HOUR = 25;
const VAN_KEYS = ['delivery_van_red', 'delivery_van_blue', 'delivery_van_mint'];
export const CENTRE_VAN = 'delivery_van_mint';

export class LgxModel {
  /**
   * o: { tune, geo (layout.makeGeo), saved (sanitized slice), seed, price(item) -> coins,
   *      deliver(order) -> accepted { item: n } (the game puts goods on a shop's shelf; default: all) }
   */
  constructor(o) {
    this.tune = o.tune;
    this.geo = o.geo;
    this.seed = (o.seed >>> 0) || 20261010;
    this.price = o.price || (() => 5);
    this.deliverFn = o.deliver || ((ord) => copy(ord.got));
    this.rng = { orders: stream(this.seed, 'orders'), road: stream(this.seed, 'road'), pick: stream(this.seed, 'pick'), homes: stream(this.seed, 'homes') };
    this.stock = new Stock(this.tune.cap);
    this.orders = [];
    this.ships = [];
    this.producers = new Map();
    this.lv3 = new Set();
    this.days = new Array(this.tune.days).fill(0);
    this.day = -1;
    this.cash = 0;
    this.seq = 0;
    this.open = false;
    this.tut = false;                    // the cutaway tutorial was done (a reveal happened)
    this.gift = false;                   // the opening gift arrived
    this.made = { furniture: 0, appliance: 0 };
    this.tot = { settled: 0, coins: 0, orders: 0, deliveries: 0 };
    this.acc = { in: 0, out: 0 };        // custody: items taken in / handed out (conservation tests)
    this.incoming = Object.create(null); // category -> items on their way in (not yet on the racks)
    this.storyQ = [];                    // story pick-ups waiting for a stage slot
    this.moveQ = [];                     // move-in furniture orders waiting for stock
    this.events = [];
    this.viewEvents = [];
    this.T = 0; this.hour = 8;
    this.pollT = 0; this.homeT = 0; this.pickAcc = 0;
    this.lastBand = Object.create(null);
    this.forklift = new Forklift(this);
    this.docks = new Docks(this);
    this.queue = new Queue(this);
    this.staff = new Staff(this);
    if (o.saved) this.restore(o.saved);
  }

  // ================================================================================================ small helpers
  emit(ev) { this.events.push(ev); }
  view(ev) { this.viewEvents.push(ev); }
  drain() { const e = this.events; this.events = []; return e; }
  drainView() { const e = this.viewEvents; this.viewEvents = []; return e; }
  id(p) { return p + (++this.seq).toString(36); }
  working() { return this.open && this.hour >= this.tune.hours.open && this.hour < this.tune.hours.close; }
  roadS(r) { const a = r || this.tune.van.roadS; return this.rng.road.range(a[0], a[1]); }
  deliveriesToday() { return this.days[0] || 0; }
  orderById(id) { return this.orders.find((q) => q.id === id) || null; }
  openFor(to) { return this.orders.find((q) => q.to === to && q.st !== 'done' && q.st !== 'cancel') || null; }
  /** happiness the 살림살이 houses add (the game adds it to Growth.happiness, capped) */
  happyBonus() { const H = this.tune.houseLv3; return Math.min(H.happyCap, this.lv3.size * H.happy); }

  // ================================================================================================ the day
  update(dt, T, env = {}) {
    this.T = T;
    this.hour = (T % DAY) / HOUR;
    const day = Math.floor(T / DAY);
    if (this.day < 0) this.day = day;
    while (this.day < day) { this.day++; this.days.unshift(0); this.days.length = this.tune.days; this.emit({ t: 'lgx:day', day: this.day, yesterday: this.days[1] || 0 }); }
    // the producers (village M plots) work even before the centre opens; their pile waits for the van
    if (!this.open) { this.updateChains(dt, env); return; }
    this.env = env;
    if (this.working()) {
      this.pollT -= dt;
      if (this.pollT <= 0) { this.pollT = this.tune.orders.pollS; this.pollShops(env.shops || []); this.stageStory(); this.retryMoveIns(env.homes || []); }
      this.homeT -= dt;
      if (this.homeT <= 0) { this.homeT = this.tune.houseLv3.every; this.pollHomes(env.homes || []); }
    }
    this.updateChains(dt, env);
    this.prep(dt);
    this.docks.update(dt);
    this.forklift.update(dt);
    this.queue.update(dt);
    this.staff.update(dt, this.ctx());
    this.offStage(dt);
    this.stockEvents();
  }

  ctx() {
    const backingV = this.docks.list.find((v) => v.backing);
    return {
      picking: this.orders.some((q) => q.st === 'pick' && sum(q.missing()) > 0 && this.pickable(q)),
      packing: this.orders.some((q) => q.st === 'pack'),
      settling: !!this.queue.settling,
      backing: !!backingV, backingDir: 'SE',
      docked: !!(this.docks.at(1) || this.docks.at(2)),
    };
  }

  // ================================================================================================ the centre opens
  /** the site is finished (or a save says it was): the centre opens; the first time the opening gift arrives */
  build(quiet) {
    if (this.open) return false;
    this.open = true;
    if (!this.gift) {
      this.gift = true;
      for (const [k, n] of Object.entries(this.tune.openGift || {})) if (isItem(k) && n > 0) { this.stock.add(k, n); this.acc.in += n; }
    }
    if (!quiet) this.emit({ t: 'lgx:open' });
    return true;
  }

  // ================================================================================================ inbound
  /** how many more of `item` the racks take (counting what is on its way) */
  room(item) { return this.open ? this.stock.room(item, this.incoming) : 0; }

  /** porters / the chief at the receiving pad: straight onto the racks (the dock hand rolls them in) */
  receive(item, n) {
    if (!isItem(item)) return 0;
    const q = Math.min(Math.max(0, Math.floor(n) || 0), this.room(item));
    if (!q) return 0;
    this.stock.add(item, q); this.acc.in += q;
    this.emit({ t: 'lgx:inbound', from: 'pad', n: q, items: { [item]: q } });
    return q;
  }

  /** a vehicle brings goods (freight truck from the yard, the station); returns what was accepted { item: n } */
  inbound(items, from = 'yard', key = 'truck_cargo') {
    if (!this.open || this.inboundWaiting() >= this.tune.inbound.maxWaiting) return {};
    const ok = {};
    for (const [k, n0] of Object.entries(items || {})) {
      if (!isItem(k)) continue;
      const q = Math.min(Math.max(0, Math.floor(n0) || 0), this.room(k));
      if (q > 0) { ok[k] = q; this.incoming[catOf(k)] = (this.incoming[catOf(k)] || 0) + q; }
    }
    const n = sum(ok);
    if (!n) return {};
    this.acc.in += n;
    const ship = new Shipment({ id: this.id('s'), from, items: ok, key });
    this.ships.push(ship);
    const v = this.docks.add({ key, role: 'truck', ship, roadT: this.roadS(this.tune.truck.roadS) });
    ship.veh = v.id;
    this.emit({ t: 'lgx:inbound', from, n, items: copy(ok), id: ship.id });
    return ok;
  }

  /** inbound vehicles on their way or waiting for a bay (back-pressure for the yard and the producers) */
  inboundWaiting() { return this.docks.list.filter((v) => (v.role === 'truck' || v.role === 'pickup') && v.st === 'road').length; }

  /** the forklift puts a pallet away: onto the racks */
  putAway(items) {
    for (const [k, n] of Object.entries(items)) { this.stock.add(k, n); this.incoming[catOf(k)] = Math.max(0, (this.incoming[catOf(k)] || 0) - n); }
    this.view({ t: 'putaway', n: sum(items) });
  }

  // ================================================================================================ outbound orders
  /** what an open order still wants of an item minus what the others are already waiting for */
  available(item) {
    let held = 0;
    for (const q of this.orders) if (q.st === 'pick') held += Math.max(0, (q.want[item] || 0) - (q.got[item] || 0));
    return Math.max(0, this.stock.count(item) - held);
  }

  /**
   * a new outbound order. to: 'shop:<id>' | 'story:<id>' | 'home:<id>'; items: { item: n } (cut to what the racks
   * have); o: { kind, mode, look, name, tag, force } -> the order id, or null (nothing to send / too many open)
   */
  order(to, items, o = {}) {
    if (!this.open || this.orders.filter((q) => q.st !== 'done' && q.st !== 'cancel').length >= this.tune.orders.max) return null;
    const want = {};
    let n = 0;
    for (const k of Object.keys(items || {}).sort()) {
      if (!isItem(k)) continue;
      const q = Math.min(Math.max(0, Math.floor(items[k]) || 0), o.force ? Infinity : this.available(k), this.tune.orders.maxItems - n);
      if (q > 0) { want[k] = q; n += q; }
    }
    if (!n) return null;
    const kind = o.kind || (to.startsWith('home:') ? 'home' : to.startsWith('story:') ? 'story' : 'shop');
    const mode = o.mode || (kind === 'home' ? 'centre' : n <= this.tune.orders.walkInMax ? 'walk' : 'van');
    const ord = new Order({ id: this.id('o'), to, kind, mode, want, tag: o.tag, look: o.look || { seed: hashStr(to) }, name: o.name || null });
    this.orders.push(ord);
    this.tot.orders++;
    this.emit({ t: 'lgx:order', id: ord.id, to, kind, mode, n });
    return ord.id;
  }

  /**
   * the order is packed: the centre rings the shop ("물건 준비됐어요") and the owner sets off — by van, on foot —
   * or the centre's own van comes round for a home order. Nobody waits at a bay or the counter for goods.
   */
  dispatchFor(ord, restored) {
    if (ord.veh || ord.agent) return;
    if (ord.mode === 'van') {
      const key = VAN_KEYS[hashStr(ord.to) % VAN_KEYS.length];
      const v = this.docks.add({ key, role: 'owner', order: ord, roadT: restored ? 2 + this.rng.road.range(0, 4) : this.roadS(), noDrop: !!ord.settled });
      ord.veh = v.id;
    } else if (ord.mode === 'walk') {
      const a = this.queue.add({ kind: 'walk', order: ord.id, look: ord.look, st: 'road', t: restored ? 1 + this.rng.road.range(0, 3) : this.rng.road.range(6, 11) });
      ord.agent = a.id;
    } else if (ord.mode === 'centre') {
      const v = this.docks.add({ key: CENTRE_VAN, role: 'centre', order: ord, roadT: 3 + this.rng.road.range(0, 4) });
      ord.veh = v.id;
    }
  }

  /** the pickers take items off the racks for the oldest orders; the conveyor packs; then the order is ready */
  pickable(q) { const m = q.missing(); for (const k in m) if (this.stock.count(k) > 0) return true; return false; }
  prep(dt) {
    const T = this.tune;
    const pickers = this.geo.staff.filter((s) => s.role === 'picker').length || 1;
    if (this.working()) this.pickAcc += dt * pickers / T.pickS;
    const picking = this.orders.filter((q) => q.st === 'pick');
    for (const q of picking) q.age += dt;
    while (this.pickAcc >= 1) {
      const q = picking.find((x) => this.pickable(x));
      if (!q) { this.pickAcc = 0; break; }
      const m = q.missing();
      const k = Object.keys(m).sort((a, b) => this.stock.count(b) - this.stock.count(a) || (a < b ? -1 : 1)).find((x) => this.stock.count(x) > 0);
      this.stock.take(k, 1);
      q.got[k] = (q.got[k] || 0) + 1;
      q.waitT = 0;
      this.pickAcc -= 1;
    }
    for (const q of picking) {
      const miss = sum(q.missing());
      if (!miss) { this.toPack(q); continue; }
      if (this.pickable(q)) continue;
      q.waitT += dt;
      if (q.n() > 0 && q.waitT >= T.orders.waitStockS) { q.want = copy(q.got); this.toPack(q); }
      else if (q.n() === 0 && q.age >= T.orders.giveUpS) this.cancel(q);
    }
    for (const q of this.orders) {
      if (q.st !== 'pack') continue;
      q.packT -= dt;
      if (q.packT <= 0) {
        q.st = 'ready';
        q.value = orderValue(q.kind, q.got, this.price, T);
        this.view({ t: 'ready', id: q.id });
        this.dispatchFor(q, false);
      }
    }
  }
  toPack(q) { q.st = 'pack'; q.packT = this.tune.packBase + this.tune.packPer * q.n(); this.view({ t: 'pack', id: q.id }); }
  cancel(q) {
    q.st = 'cancel';
    const v = q.veh && this.docks.get(q.veh);
    if (v && v.st === 'road') this.docks.list.splice(this.docks.list.indexOf(v), 1);
    const a = q.agent && this.queue.get(q.agent);
    if (a && a.st === 'road') this.queue.agents.splice(this.queue.agents.indexOf(a), 1);
    this.emit({ t: 'lgx:cancel', id: q.id, to: q.to });
  }

  // ---------------------------------------------------------------------------------------------- floor callbacks
  /** a ready outbound order whose vehicle stands in a bay and still has goods to load */
  outJob() {
    for (const q of this.orders) {
      if (q.st !== 'ready' || (q.mode !== 'van' && q.mode !== 'centre')) continue;
      const v = q.veh && this.docks.get(q.veh);
      if (!v || v.st !== 'docked') continue;
      if (q.loaded + q.onFork < q.n()) return { order: q, dock: v.dock };
    }
    return null;
  }
  inJob() { for (const b of [1, 2]) { const v = this.docks.at(b); if (v && v.ship && v.ship.n() > 0) return { dock: b }; } return null; }
  dockVehicle(bay) { return this.docks.at(bay); }
  unstage(q, n) { q.onFork = Math.max(0, q.onFork - n); }
  /** a vehicle stopped in its bay (the owner got out at the kerb by the door on the way in) */
  docked(v) { void v; }
  /** the owner's van stops at the kerb by the front door: the owner hops out and walks to the queue */
  ownerOut(v) {
    const q = v.order;
    if (!q || q.settled || q.agent) return;
    const walk = this.geo.walks.drop.map((p) => p.slice());
    const a = this.queue.add({ kind: 'van', order: q.id, look: q.look, st: 'walkIn', walk, veh: v.id });
    a.mover = new Mover(walkLegs(walk, this.tune.walk));
    q.agent = a.id;
    this.view({ t: 'owner', op: 'out', agent: a.id, veh: v.id });
  }
  /** the loaded van stops at the kerb where its owner waits: in they get */
  ownerIn(v) {
    const q = v.order;
    const a = q && q.agent && this.queue.get(q.agent);
    if (a) { this.queue.agents.splice(this.queue.agents.indexOf(a), 1); this.view({ t: 'owner', op: 'in', agent: a.id, veh: v.id }); }
  }
  vehicleDone(v) {
    if (v.role === 'owner' || v.role === 'centre') {
      const q = v.order;
      if (!q || q.st === 'cancel') return true;
      if (q.st !== 'ready' || q.loaded < q.n()) return false;
      if (v.role === 'centre') return true;
      const a = q.agent && this.queue.get(q.agent);
      return q.settled && (!a || a.st === 'curb');
    }
    if (v.ship) { const L = this.forklift.load; return v.ship.n() === 0 && !(L && L.ship === v.ship); }
    return true;
  }
  vehicleGone(v) {
    if (v.order) {
      const q = v.order;
      const a = q.agent && this.queue.get(q.agent);
      if (a) this.queue.agents.splice(this.queue.agents.indexOf(a), 1);
      if (q.st === 'ready') { q.st = 'gone'; q.deliverT = this.roadS(); this.emit({ t: 'lgx:dispatch', van: v.key, to: q.to, id: q.id, kind: q.kind }); }
    }
    if (v.ship) { v.ship.st = 'done'; this.ships.splice(this.ships.indexOf(v.ship), 1); }
    for (const id of v.producers || []) { const p = this.producers.get(id); if (p) p.pickup = false; }
  }
  /** a tagged curb stop on a vehicle's way in: the pickup van loads a producer's pile */
  curbStop(v, tag) {
    if (tag === 'drop') { this.ownerOut(v); return; }
    if (tag === 'pick') { this.ownerIn(v); return; }
    if (!tag || !tag.startsWith('pickup:')) return;
    const p = this.producers.get(tag.slice(7));
    if (!p || !v.ship) return;
    const items = this.loadPile(p);
    for (const [k, n] of Object.entries(items)) v.ship.items[k] = (v.ship.items[k] || 0) + n;
    v.ship.n0 = v.ship.n();
    this.view({ t: 'pickup', producer: p.id, n: sum(items), veh: v.id });
  }
  /** a producer's pile onto a van: only what the racks have room for (the pile grew since the van set off) */
  loadPile(p) {
    const items = p.take((k) => { if (this.room(k) <= 0) return false; this.incoming[catOf(k)] = (this.incoming[catOf(k)] || 0) + 1; return true; });
    this.acc.in += sum(items);
    return items;
  }
  orderOf(a) { return this.orderById(a.order); }

  // ---------------------------------------------------------------------------------------------- settlement
  /** an owner at the counter: the stamp, the coins into the 물류 금고 */
  settleAt(a) {
    const q = this.orderOf(a);
    if (!q) return 0;
    const coins = this.settle(q.id);
    if (a.kind === 'walk') q.loaded = q.n();
    return coins;
  }
  /** settle an order (the counter, or the chief settling a receipt for an owner: mission A22) -> coins. Only once
   * its goods are picked (packing, ready or on its way): the receipt is for what is in the parcel */
  settle(id) {
    const q = this.orderById(id);
    if (!q || q.settled || q.kind === 'home' || (q.st !== 'pack' && q.st !== 'ready' && q.st !== 'gone')) return 0;
    if (!q.value) q.value = orderValue(q.kind, q.got, this.price, this.tune);
    q.settled = true;
    this.cash += q.value;
    this.tot.settled++; this.tot.coins += q.value;
    this.count(q.n());
    this.emit({ t: 'lgx:settle', id: q.id, coins: q.value, shop: q.to, n: q.n(), kind: q.kind });
    return q.value;
  }
  count(n) { this.days[0] = (this.days[0] || 0) + n; this.tot.deliveries += n; }

  walkerGone(a) {
    const q = this.orderOf(a);
    if (q && (q.st === 'ready' || q.st === 'pack' || q.st === 'pick')) { q.st = 'gone'; q.deliverT = 4 + this.rng.road.range(0, 6); }
  }

  /** orders on their way (off the stage) arrive: shelves, homes */
  offStage(dt) {
    for (const q of this.orders.slice()) {
      if (q.st !== 'gone') continue;
      q.deliverT -= dt;
      if (q.deliverT > 0) continue;
      this.deliver(q);
    }
    // finished orders leave the list (cancelled ones once their owner is gone)
    this.orders = this.orders.filter((q) => q.st !== 'done' && !(q.st === 'cancel' && !this.docks.get(q.veh) && !this.queue.get(q.agent)));
  }
  deliver(q) {
    const goods = copy(q.got);
    let ok = goods;
    if (q.kind === 'shop') {
      const acc = this.deliverFn(q) || {};
      ok = {};
      // what the shop could not take (closed, shelf full) comes back to the racks
      for (const k of Object.keys(goods)) {
        const took = Math.max(0, Math.min(goods[k], Math.floor(acc[k]) || 0));
        if (took) ok[k] = took;
        if (goods[k] - took > 0) this.stock.add(k, goods[k] - took);
      }
    }
    const n = sum(ok);
    this.acc.out += n;
    if (q.kind === 'home') {
      q.value = orderValue('home', q.got, this.price, this.tune);
      q.settled = true;
      this.cash += q.value; this.tot.coins += q.value; this.tot.settled++;
      this.count(n);
      this.emit({ t: 'lgx:settle', id: q.id, coins: q.value, shop: q.to, n, kind: 'home' });
      for (const hid of q.to.slice(5).split('+')) {
        if (q.tag === 'lv3' && !this.lv3.has(hid) && this.lv3.size < this.tune.houseLv3.maxHouses) {
          this.lv3.add(hid);
          this.emit({ t: 'lgx:house', id: hid, level: 3, happy: this.happyBonus() });
        }
      }
    }
    q.st = 'done';
    this.emit({ t: 'lgx:delivered', id: q.id, to: q.to, items: ok, n, kind: q.kind, tag: q.tag });
  }

  // ================================================================================================ who orders
  /** v4 Growth shops (P32): a low shelf orders a batch through the centre */
  pollShops(shops) {
    const T = this.tune.orders;
    for (const s of shops.slice().sort((a, b) => (a.id < b.id ? -1 : 1))) {
      if (!s || !s.id || this.openFor('shop:' + s.id)) continue;
      const need = s.need || {};
      const total = sum(need);
      if (total <= 0) continue;
      let can = 0;
      for (const k in need) can += Math.min(need[k], this.available(k));
      if (can < Math.min(T.minNeed, total)) continue;
      this.order('shop:' + s.id, need, { kind: 'shop', look: s.look || { seed: hashStr('shop:' + s.id) }, name: s.name || null });
    }
  }

  /** story engine shop pick-ups (a resident's own shop): staged a few at a time */
  storyPickup(ev) {
    if (!this.open || !ev || ev.op !== 'pickup') return false;
    if (this.storyQ.length >= this.tune.story.pending) return false;
    this.storyQ.push({ shop: String(ev.shop), items: (ev.items || []).filter(isItem), qty: Math.max(1, Math.min(this.tune.orders.maxItems, Math.floor(ev.qty) || 1)), look: ev.look || (ev.owner !== undefined ? { sid: ev.owner } : null), name: ev.name || null });
    return true;
  }
  stageStory() {
    const open = this.orders.filter((q) => q.kind === 'story' && q.st !== 'done' && q.st !== 'cancel').length;
    let room = this.tune.story.open - open;
    while (room > 0 && this.storyQ.length) {
      const p = this.storyQ.shift();
      if (this.openFor('story:' + p.shop)) continue;
      // the quantity spread over the items the racks have (most stocked first)
      const items = p.items.filter((k) => this.available(k) > 0).sort((a, b) => this.available(b) - this.available(a) || (a < b ? -1 : 1));
      if (!items.length) { this.emit({ t: 'lgx:storyMiss', shop: p.shop }); continue; }
      const want = {};
      let left = p.qty;
      for (let i = 0; left > 0 && i < 999; i++) { const k = items[i % items.length]; if ((want[k] || 0) >= this.available(k)) { if (items.every((x) => (want[x] || 0) >= this.available(x))) break; continue; } want[k] = (want[k] || 0) + 1; left--; }
      if (this.order('story:' + p.shop, want, { kind: 'story', look: p.look || { seed: hashStr('story:' + p.shop) }, name: p.name })) room--;
    }
  }

  /** 살림살이: houses without it get furniture 3 + appliance 1 each when the racks have them (one van, up to perVan homes) */
  pollHomes(homes) {
    const H = this.tune.houseLv3;
    if (this.lv3.size >= H.maxHouses) return;
    const pending = this.orders.filter((q) => q.tag === 'lv3' && q.st !== 'done' && q.st !== 'cancel');
    if (pending.length >= H.open) return;
    const busy = new Set();
    for (const q of pending) for (const h of q.to.slice(5).split('+')) busy.add(h);
    const cand = homes.filter((h) => h && h.id && (h.level === undefined || h.level >= 2) && !this.lv3.has(String(h.id)) && !busy.has(String(h.id)))
      .sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1));
    if (!cand.length) return;
    const ids = [], want = {};
    for (const h of cand) {
      if (ids.length >= (H.perVan || 1) || this.lv3.size + ids.length >= H.maxHouses) break;
      const set = this.homeSet(H.furniture, H.appliance, want);
      if (!set) break;
      for (const [k, n] of Object.entries(set)) want[k] = (want[k] || 0) + n;
      ids.push(String(h.id));
    }
    if (!ids.length) return;
    this.order('home:' + ids.join('+'), want, { kind: 'home', mode: 'centre', tag: 'lv3', name: cand[0].name || null });
  }
  /** a set of distinct pieces from the racks (sofa, bed, table first), or null when the racks cannot make it */
  homeSet(nf, na, taken = {}) {
    const av = (k) => this.available(k) - (taken[k] || 0);
    const pick = (list, n, pref) => {
      const have = list.filter((k) => av(k) > 0).sort((a, b) => (pref.indexOf(a) - pref.indexOf(b)) || (av(b) - av(a)));
      const out = {};
      let got = 0;
      for (const k of have) { if (got >= n) break; out[k] = 1; got++; }
      // fewer kinds than pieces: a second of the most stocked
      for (let i = 0; got < n && i < have.length * 3; i++) { const k = have[i % have.length]; if ((out[k] || 0) < av(k)) { out[k]++; got++; } }
      return got >= n ? out : null;
    };
    const f = pick(FURNITURE, nf, ['item_sofa', 'item_bed', 'item_table', 'item_chair', 'item_wardrobe']);
    const a = na ? pick(APPLIANCES, na, ['item_fridge', 'item_stove_iron', 'item_tv_retro', 'item_washer', 'item_radio']) : {};
    if (!f || !a) return null;
    return Object.assign({}, f, a);
  }
  /** a household moved in (story `move` in): a starter set of furniture for its home */
  moveIn(ev) {
    if (!this.open || !ev) return false;
    const home = ev.home || ev.house;
    if (!home) return false;
    if (this.moveQ.length < 4) this.moveQ.push({ home: String(home), name: ev.name || null });
    this.retryMoveIns(this.env && this.env.homes ? this.env.homes : []);
    return true;
  }
  retryMoveIns() {
    const M = this.tune.moveIn;
    for (const p of this.moveQ.slice()) {
      if (this.openFor('home:' + p.home)) continue;
      const want = this.homeSet(M.furniture, M.appliance);
      if (!want) return;
      if (this.order('home:' + p.home, want, { kind: 'home', mode: 'centre', tag: 'movein', name: p.name })) this.moveQ.splice(this.moveQ.indexOf(p), 1);
    }
  }

  // ================================================================================================ chains
  addProducer(kind, id, o = {}) {
    if (kind !== 'furniture' && kind !== 'appliance') return null;
    const pid = String(id || kind);
    if (this.producers.has(pid)) { const p = this.producers.get(pid); if (o.curb) p.curb = o.curb; return p; }
    const p = new Producer(Object.assign({ id: pid, kind }, o.saved || {}), Object.assign({ inMax: 30 }, this.tune[kind]));
    p.curb = o.curb || null;                 // rel px of the curb stop when the producer stands on the stage
    this.producers.set(pid, p);
    this.emit({ t: 'lgx:producer', id: pid, kind });
    return p;
  }
  feedProducer(id, n) { const p = this.producers.get(String(id)); return p ? p.feed(n) : 0; }
  /** what to make next: what the 살림살이 houses will need and the racks lack, else the lowest stock */
  choose(makes) {
    const inPipe = (k) => this.stock.count(k) + this.ships.reduce((s, sh) => s + (sh.items[k] || 0), 0);
    let best = null, bv = Infinity;
    makes.forEach((k, i) => { const v = inPipe(k) * 10 + i; if (v < bv) { bv = v; best = k; } });
    return best;
  }
  updateChains(dt) {
    let due = null;
    for (const p of this.producers.values()) {
      const done = p.update(dt, (makes) => this.choose(makes));
      if (done) {
        const kind = kindOf(done);
        this.made[kind] = (this.made[kind] || 0) + 1;
        this.emit({ t: 'lgx:produced', item: done, kind, n: 1, producer: p.id });
      }
      // the van comes when a pile is due and the racks have room for it (else the pile waits; a full pile stops the machine)
      if (!due && p.due() && p.outQ.length && this.room(p.outQ[0]) >= p.outQ.length) due = p;
    }
    if (!due || !this.open || !this.working() || this.inboundWaiting() >= this.tune.inbound.maxWaiting) return;
    // one round for every pile on the way (the furniture workshop and the appliance factory share the van)
    const round = Array.from(this.producers.values()).filter((p) => !p.pickup && p.outQ.length && this.room(p.outQ[0]) >= p.outQ.length);
    const ship = new Shipment({ id: this.id('s'), from: 'producer:' + round.map((p) => p.id).join('+'), items: {}, key: CENTRE_VAN });
    const via = [];
    let road = 0;
    for (const p of round) {
      p.pickup = true;
      if (p.curb) via.push({ p: p.curb, dwell: 2.6, tag: 'pickup:' + p.id, i: p.curb[0] });
      else {
        const items = this.loadPile(p);
        for (const [k, n] of Object.entries(items)) ship.items[k] = (ship.items[k] || 0) + n;
        road = Math.max(road, this.tune[p.kind].roadS || 14);
      }
    }
    ship.n0 = ship.n();
    via.sort((a, b) => a.i - b.i);
    this.ships.push(ship);
    const v = this.docks.add({ key: CENTRE_VAN, role: 'pickup', ship, producers: round.map((p) => p.id), roadT: via.length ? Math.max(3, road) : road, via: via.length ? via : null });
    ship.veh = v.id;
  }

  // ================================================================================================ events
  stockEvents() {
    for (const c of CATS) {
      const b = Math.round(this.stock.level(c) * 10);
      if (this.lastBand[c] === b) continue;
      this.lastBand[c] = b;
      this.emit({ t: 'lgx:stock', cat: c, n: this.stock.total(c), level: b / 10 });
    }
  }

  // ================================================================================================ the view's picture
  rackFill() { if (this._fillVer !== this.stock.ver) { this._fill = rackFill(this.geo, this.stock); this._fillVer = this.stock.ver; } return this._fill; }
  info() {
    const fk = this.forklift;
    return {
      open: this.open, working: this.working(), hour: this.hour,
      stockVer: this.stock.ver,
      forklift: { pos: fk.pos(), dir: fk.dir(), band: fk.band(), loaded: fk.loaded(), liftK: fk.liftK(), phase: fk.phase, reversing: fk.reversing(), moving: fk.phase === 'drive' },
      vehicles: this.docks.list.filter((v) => v.st !== 'road').map((v) => ({ id: v.id, key: v.key, pos: v.mover ? v.mover.pos() : [0, 0], dir: v.mover ? v.mover.dir() : 'SE', moving: !!(v.mover && v.mover.moving()), reversing: !!(v.mover && v.mover.reversing()), alpha: v.alpha, dock: v.dock, st: v.st, role: v.role,
        ownerAboard: v.role === 'owner' && !!v.order && !(v.order.agent && this.queue.get(v.order.agent)), ownerLook: v.order ? v.order.look : null,
        cargo: v.ship ? v.ship.n() : v.order ? v.order.loaded : 0 })),
      doors: { 1: this.docks.doorFrame(1), 2: this.docks.doorFrame(2) },
      owners: this.queue.agents.filter((a) => a.st !== 'road' && a.st !== 'step' && a.st !== 'inVan').map((a) => this.queue.info(a)),
      staff: this.staff.info(),
      conveyor: this.orders.some((q) => q.st === 'pack' || (q.st === 'pick' && this.pickable(q))),
      settling: this.queue.settling ? { agent: this.queue.settling.a.id, t: this.queue.settling.t } : null,
      producers: Array.from(this.producers.values()).map((p) => ({ id: p.id, kind: p.kind, inQ: p.inQ, outQ: p.outQ.slice(), making: p.making, t: p.t, working: p.working() })),
      cash: this.cash, today: this.deliveriesToday(),
    };
  }
  state() {
    const by = {};
    for (const c of CATS) by[c] = this.stock.total(c);
    return {
      open: this.open, stock: by, items: this.stock.snapshot(), cash: this.cash, today: this.deliveriesToday(), days: this.days.slice(),
      orders: this.orders.map((q) => ({ id: q.id, to: q.to, kind: q.kind, mode: q.mode, st: q.st, n: q.n(), want: q.wantN(), settled: q.settled, loaded: q.loaded })),
      ships: this.ships.map((s) => ({ id: s.id, from: s.from, n: s.n(), st: s.st })),
      vehicles: this.docks.list.map((v) => ({ id: v.id, key: v.key, role: v.role, st: v.st, dock: v.dock })),
      queue: this.queue.slots.length, owners: this.queue.agents.length,
      producers: Array.from(this.producers.values()).map((p) => ({ id: p.id, kind: p.kind, inQ: p.inQ, outQ: p.outQ.length, made: p.made })),
      lv3: Array.from(this.lv3), happy: this.happyBonus(), tot: Object.assign({}, this.tot), made: Object.assign({}, this.made),
      forklift: { laps: this.forklift.laps, out: this.forklift.pallets.out, in: this.forklift.pallets.in, tidy: this.forklift.pallets.tidy, node: this.forklift.node, phase: this.forklift.phase },
    };
  }

  /** items the centre holds or carries (racks + inbound on the way + picked for orders not yet handed over) */
  custody() {
    let n = this.stock.all();
    for (const s of this.ships) n += s.n();
    const L = this.forklift.load;
    if (L && L.kind === 'in') n += L.n;
    for (const q of this.orders) if (q.st !== 'done' && q.st !== 'cancel') n += q.n();
    return n;
  }

  // ================================================================================================ save
  serialize() {
    // goods on their way in count as stock (they are ours); a reload puts them on the racks
    const stock = this.stock.snapshot();
    const add = (k, n) => { if (n > 0) stock[k] = (stock[k] || 0) + n; };
    for (const s of this.ships) for (const [k, n] of Object.entries(s.items)) add(k, n);
    const L = this.forklift.load;
    if (L && L.kind === 'in') for (const [k, n] of Object.entries(L.items)) add(k, n);
    const short = (o) => { const r = {}; for (const k of Object.keys(o).sort()) if (o[k] > 0) r[k.replace(/^item_/, '')] = o[k]; return r; };
    const orders = [];
    for (const q of this.orders) {
      if (q.st === 'done' || q.st === 'cancel') continue;
      const st = q.st === 'pick' ? 'p' : q.st === 'pack' ? 'k' : q.st === 'ready' ? 'r' : 'g';
      orders.push([q.id, q.to, q.kind[0] + q.mode[0] + st + (q.settled ? 's' : '') + (q.tag === 'lv3' ? '3' : q.tag === 'movein' ? 'm' : ''), short(q.got), short(q.missing())]);
    }
    return {
      v: 1, open: this.open ? 1 : 0, gift: this.gift ? 1 : 0, tut: this.tut ? 1 : 0, day: this.day, seq: this.seq,
      stock: short(stock), orders, cash: Math.round(this.cash),
      chains: Array.from(this.producers.values()).map((p) => { const s = p.serialize(); return { id: s.id, k: s.kind[0], in: s.inQ, out: s.outQ.map((x) => x.replace(/^item_/, '')), m: s.made, r: s.rot }; }),
      lv3: Array.from(this.lv3).slice(0, this.tune.houseLv3.maxHouses),
      days: this.days.slice(0, this.tune.days),
      made: [this.made.furniture || 0, this.made.appliance || 0],
      tot: [this.tot.settled, this.tot.coins, this.tot.deliveries],
    };
  }

  restore(s) {
    const long = (o) => { const r = {}; for (const k of Object.keys(o || {})) r['item_' + k] = o[k]; return r; };
    this.open = !!s.open; this.gift = !!s.gift; this.tut = !!s.tut;
    this.day = Number.isFinite(s.day) ? s.day : -1;
    this.seq = s.seq || 0;
    for (const [k, n] of Object.entries(long(s.stock))) if (isItem(k)) { this.stock.add(k, n); this.acc.in += n; }
    this.cash = s.cash || 0;
    for (const c of s.chains || []) this.addProducer(c.k === 'a' ? 'appliance' : 'furniture', c.id, { saved: { inQ: c.in, outQ: (c.out || []).map((x) => 'item_' + x), made: c.m, rot: c.r } });
    for (const h of s.lv3 || []) this.lv3.add(String(h));
    if (Array.isArray(s.days)) for (let i = 0; i < this.days.length && i < s.days.length; i++) this.days[i] = s.days[i] || 0;
    if (Array.isArray(s.made)) { this.made.furniture = s.made[0] || 0; this.made.appliance = s.made[1] || 0; }
    if (Array.isArray(s.tot)) { this.tot.settled = s.tot[0] || 0; this.tot.coins = s.tot[1] || 0; this.tot.deliveries = s.tot[2] || 0; }
    const KIND = { s: 'shop', y: 'story', h: 'home' }, MODE = { v: 'van', w: 'walk', c: 'centre' }, ST = { p: 'pick', k: 'pack', r: 'ready', g: 'gone' };
    for (const r of s.orders || []) {
      const f = r[2];
      const got = long(r[3]), miss = long(r[4]);
      const want = Object.assign({}, got);
      for (const [k, n] of Object.entries(miss)) want[k] = (want[k] || 0) + n;
      const q = new Order({ id: r[0], to: r[1], kind: KIND[f[0]], mode: MODE[f[1]], want, got, st: ST[f[2]], settled: f.indexOf('s', 3) >= 0, tag: f.indexOf('3', 3) >= 0 ? 'lv3' : f.indexOf('m', 3) >= 0 ? 'movein' : null, look: { seed: hashStr(r[1]) } });
      this.acc.in += q.n();
      if (q.st === 'pack') q.packT = this.tune.packBase;
      if (q.st === 'ready' || q.st === 'gone') q.value = orderValue(q.kind, q.got, this.price, this.tune);
      if (q.st === 'gone') { q.deliverT = 2; if (q.mode === 'walk') q.loaded = q.n(); }
      this.orders.push(q);
      // owners and vans set off again (vehicles and walkers are not saved)
      if (q.st === 'ready') this.dispatchFor(q, true);
    }
    for (const c of CATS) this.lastBand[c] = Math.round(this.stock.level(c) * 10);
  }
}
