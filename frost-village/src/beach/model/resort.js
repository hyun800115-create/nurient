// The resort economy (docs/v5_v8_plan.md §6.5 model/resort.js): the hotel (level 1–3 → 12 / 20 / 32 rooms; parties
// check in from the ferries, stay 2 game days and spend each day), the beach shops (founded by tourists through the
// second founding board; their shelves are refilled with OUR village goods — fish, bread, smoked meat, cans — at
// 70 % of the price plus the beach bonus), the aquarium's tickets and rare fish. Pure and seeded.
//
// The shops are v4 Growth shops in the game (P32: they save there and Growth pays their rent). Standalone (labs, Node,
// or before P32) the `Founding` fallback below runs the board itself and pays rent (`ownRent`).

import { stream } from './rng.js';
import { dayOf, hourOf } from './time.js';
import { priceOf } from '../../data/items.js';

export class Resort {
  /** cfg = beach tuning; saved = { hotel: { level, guests: [[n, leaveDay]] }, shops: [ids], card: {item: n}, fish } */
  constructor(m, saved = {}) {
    this.m = m;
    const h = saved.hotel || {};
    this.hotel = { level: Math.max(0, Math.min(3, h.level | 0)), guests: Array.isArray(h.guests) ? h.guests.map((g) => [g[0] | 0, g[1] | 0]).filter((g) => g[0] > 0) : [] };
    this.shops = new Set(Array.isArray(saved.shops) ? saved.shops.filter((s) => m.cfg.founding.order.indexOf(s) >= 0) : []);
    this.stock = {};                  // shop -> { item: n } (transient mirror of the shelves)
    for (const s of this.shops) this.fill(s);
    this.card = saved.card && typeof saved.card === 'object' ? Object.assign({}, saved.card) : {};
    this.building = null;             // { id, at } a founded shop going up (buildTime)
    this.fish = saved.fish | 0;        // rare fish in the aquarium
    this.rentAcc = 0;
    this.spendDay = saved.spendDay !== undefined ? saved.spendDay | 0 : -1;
    this.restockAsked = {};
    this.stats = { hotel: 0, rent: 0, wholesale: 0, tickets: 0, sales: 0 };
  }
  get cfg() { return this.m.cfg; }

  // ------------------------------------------------------------------------------------------ hotel
  rooms() { return this.hotel.level ? this.cfg.hotel.rooms[this.hotel.level - 1] : 0; }
  roomsBooked() { let n = 0; for (const g of this.hotel.guests) n += g[0]; return n; }
  occupancy() { const r = this.rooms(); return r ? this.roomsBooked() / r : 0; }
  /** parties from a ferry book rooms (one party = one room); returns rooms booked */
  checkin(n, T) {
    if (!this.hotel.level || n <= 0) return 0;
    const free = this.rooms() - this.roomsBooked();
    const k = Math.max(0, Math.min(free, Math.round(n * this.cfg.hotel.checkinShare)));
    if (!k) return 0;
    const leave = dayOf(T) + this.cfg.hotel.stayDays;
    const g = this.hotel.guests.find((x) => x[1] === leave);
    if (g) g[0] += k; else this.hotel.guests.push([k, leave]);
    this.hotel.guests.sort((a, b) => a[1] - b[1]);
    while (this.hotel.guests.length > 8) { const a = this.hotel.guests.shift(); this.hotel.guests[0][0] += a[0]; }
    this.m.emit({ t: 'beach:checkin', n: k, rooms: this.rooms(), booked: this.roomsBooked() });
    return k;
  }
  /** each morning every booked room spends; parties whose day has come check out */
  hotelDay(T) {
    if (!this.hotel.level) return;
    const d = dayOf(T), h = hourOf(T);
    if (h >= this.cfg.hotel.spendHour && this.spendDay !== d) {
      this.spendDay = d;
      const R = stream(this.m.seed, 'spend:' + d);
      const [a, b] = this.cfg.hotel.spendPerDay;
      let coins = 0;
      for (const g of this.hotel.guests) for (let k = 0; k < g[0]; k++) coins += Math.round(a + R.next() * (b - a));
      if (coins > 0) { this.stats.hotel += coins; this.m.emit({ t: 'coins', from: 'hotel', n: coins, at: 'hotel' }); }
    }
    if (h >= this.cfg.hotel.checkoutHour) {
      const before = this.roomsBooked();
      this.hotel.guests = this.hotel.guests.filter((g) => g[1] > d);
      const out = before - this.roomsBooked();
      if (out > 0) this.m.emit({ t: 'beach:checkout', n: out });
    }
  }
  upgrade() { if (this.hotel.level >= 1 && this.hotel.level < 3) { this.hotel.level++; return true; } return false; }

  // ------------------------------------------------------------------------------------------ shops
  openShops() { return Array.from(this.shops).concat(this.m.ok('extras') ? ['beach_bar'] : []); }
  isOpen(id) { return this.shops.has(id); }
  goodsOf(id) { return (this.cfg.shops.goods[id] || []).slice(); }
  fill(id) { const st = this.stock[id] = this.stock[id] || {}; for (const it of this.goodsOf(id)) st[it] = this.cfg.shops.shelf; }
  price(item) { return (this.cfg.shops.price && this.cfg.shops.price[item]) || priceOf(item); }
  /** a customer buys one thing (a shelf item); returns the coins the SHOP took (not ours: we earn rent + wholesale) */
  sell(id, v, T) {
    if (!id || (!this.shops.has(id) && !(id === 'beach_bar' && this.m.ok('extras')))) return 0;
    const st = this.stock[id] || (this.fill(id), this.stock[id]);
    const goods = this.goodsOf(id).filter((it) => st[it] > 0);
    if (!goods.length) { this.askRestock(id, T); return 0; }
    const R = stream(this.m.seed, 'buy:' + (v ? v.id : 0) + ':' + Math.round(T * 4));
    const it = goods[R.int(goods.length)];
    st[it]--;
    this.stats.sales++;
    this.m.emit({ t: 'beach:shop', id, op: 'sold', item: it, vid: v ? v.id : 0 });
    const shelf = this.cfg.shops.shelf, low = this.cfg.shops.restockBelow;
    if (st[it] < shelf * low) this.askRestock(id, T);
    return this.price(it);
  }
  /** the shop asks the village for goods (Growth / freight in the game; the lab's porter here) */
  askRestock(id, T) {
    if (this.restockAsked[id] && T - this.restockAsked[id] < 30) return;
    this.restockAsked[id] = T;
    const st = this.stock[id] || {}, need = {};
    for (const it of this.goodsOf(id)) { const n = this.cfg.shops.shelf - (st[it] | 0); if (n > 0) need[it] = n; }
    if (Object.keys(need).length) this.m.emit({ t: 'beach:shop', id, op: 'restock', need });
  }
  /** village goods reached a beach shop: fill the shelf, pay wholesale × (1 + bonus) */
  deliver(id, items, T) {
    if (!this.shops.has(id) && !(id === 'beach_bar' && this.m.ok('extras'))) return 0;
    const st = this.stock[id] || (this.stock[id] = {});
    let coins = 0;
    const W = this.cfg.shops.wholesale * (1 + this.cfg.shops.bonus);
    for (const it in items) {
      const room = Math.max(0, this.cfg.shops.shelf - (st[it] | 0));
      const n = Math.min(room, Math.max(0, items[it] | 0));
      if (!n || this.goodsOf(id).indexOf(it) < 0) continue;
      st[it] = (st[it] | 0) + n;
      coins += Math.round(n * this.price(it) * W);
    }
    delete this.restockAsked[id];
    if (coins > 0) { this.stats.wholesale += coins; this.m.emit({ t: 'coins', from: 'wholesale', n: coins, at: id }); }
    this.m.emit({ t: 'beach:shop', id, op: 'delivered', coins });
    return coins;
  }
  /** a shop opened (the founding board finished, or Growth's shopOpen in the game) */
  open(id) {
    if (this.shops.has(id) || this.cfg.founding.order.indexOf(id) < 0) return false;
    this.shops.add(id);
    this.fill(id);
    this.m.emit({ t: 'beach:shop', id, op: 'open', n: this.shops.size });
    return true;
  }
  /** standalone rent (Growth pays it in the game) */
  rent(dt) {
    if (!this.m.ownRent) return;
    let perMin = 0;
    for (const id of this.shops) perMin += this.cfg.founding.rent[id] || 0;
    this.rentAcc += perMin * dt / 60;
    if (this.rentAcc >= 50) { const n = Math.floor(this.rentAcc); this.rentAcc -= n; this.stats.rent += n; this.m.emit({ t: 'coins', from: 'rent', n, at: 'board' }); }
  }

  // ------------------------------------------------------------------------------------------ founding board (standalone fallback)
  /** the card on the board now: the next shop in order (one at a time) */
  cardShop() {
    if (!this.m.stepDone('board')) return null;
    if (this.building) return null;
    for (const id of this.cfg.founding.order) if (!this.shops.has(id)) return id;
    return null;
  }
  cardNeed() { const id = this.cardShop(); return id ? Object.assign({}, this.cfg.founding.cards[id] || {}) : null; }
  /** goods brought to the board card; returns what was taken */
  deliverCard(items, T) {
    const id = this.cardShop();
    if (!id) return {};
    const need = this.cfg.founding.cards[id] || {}, took = {};
    for (const it in items) {
      const want = Math.max(0, (need[it] | 0) - (this.card[it] | 0));
      const n = Math.min(want, Math.max(0, items[it] | 0));
      if (n > 0) { this.card[it] = (this.card[it] | 0) + n; took[it] = n; }
    }
    if (Object.keys(need).every((it) => (this.card[it] | 0) >= need[it])) {
      this.card = {};
      this.building = { id, at: T + this.cfg.founding.buildTime };
      this.m.emit({ t: 'beach:shop', id, op: 'build', at: this.building.at });
    }
    return took;
  }
  stepBuild(T) { if (this.building && T >= this.building.at) { const id = this.building.id; this.building = null; this.open(id); } }

  // ------------------------------------------------------------------------------------------ aquarium
  ticket(v, T) {
    if (!this.m.ok('aquarium')) return;
    const n = this.cfg.aquarium.ticket | 0;
    if (n > 0) { this.stats.tickets += n; this.m.emit({ t: 'coins', from: 'aquarium', n, at: 'aquarium', small: true }); }
  }
  donate() { if (!this.m.ok('aquarium')) return false; this.fish++; this.m.emit({ t: 'beach:fish', n: this.fish }); return true; }

  serialize() {
    return { hotel: { level: this.hotel.level, guests: this.hotel.guests.slice(0, 8).map((g) => [g[0], g[1]]) }, shops: Array.from(this.shops), card: Object.keys(this.card).length ? Object.assign({}, this.card) : undefined, fish: this.fish || undefined, spendDay: this.spendDay };
  }
}
