// (v4.2, docs/v42_plan.md §4.4) 서리 물류창고 — the pure model (Node-testable): stock by item in the rack categories
// (rack.js = parity copy of v8's catalogue + Stock), caps per category (BALANCE.v42.depot.caps), the day's inflow /
// sales / coins, and the sales of the walk-in 솔방울 상인 (throughput per minute per category, open 07–20 h).
//   wants(ty) / room(ty) / take(load)    the sleigh unloads: [{ ty, n }] -> accepted per item (the rest refused)
//   sell(dt, hour)                       sales this step: [{ ty, n, coins }] (price × sell.rate, raw at rawPrice)
//   slice(day)                           the v8 `logistics` save slice ({ v: 1, open: 1, gift: 1, tut: 1, stock, … })
// Furniture / appliances (v8's 3rd industry) are not accepted in v4.2.

import { BALANCE } from '../../data/balance.js';
import { priceOf } from '../../data/items.js';
import { Stock, catOf } from './rack.js';

const D = () => (BALANCE.v42 && BALANCE.v42.depot) || {};
export const V42_CATS = ['materials', 'food', 'goods', 'tools'];
const RAW = ['item_fish_raw', 'item_fish_big', 'item_log', 'item_wheat', 'item_ore', 'item_meat_raw'];

export class Depot {
  constructor(saved) {
    const caps = Object.assign({ materials: 160, food: 160, goods: 120, tools: 60, furniture: 0, appliances: 0 }, D().caps || {});
    this.stock = new Stock(caps);
    const s = saved && typeof saved === 'object' ? saved : {};
    for (const k in s.stock || {}) {
      const item = 'item_' + k, n = Math.max(0, Math.floor(Number(s.stock[k]) || 0));
      if (n > 0 && this.wants(item)) this.stock.add(item, Math.min(n, this.stock.room(item)));
    }
    this.cash = Math.max(0, Math.floor(Number(s.cash) || 0));
    this.days = Array.isArray(s.days) ? s.days.slice(0, 10).map((n) => Math.max(0, Math.floor(Number(n) || 0))) : [];
    this.tot = Array.isArray(s.tot) ? [0, Math.max(0, Math.floor(Number(s.tot[1]) || 0)), Math.max(0, Math.floor(Number(s.tot[2]) || 0))] : [0, 0, 0];
    this.day = Number.isFinite(s.day) ? s.day : -1;
    this.today = { inflow: 0, sales: 0, coins: 0 };
    this.acc = {};           // per category: fractional sales owed this minute
  }

  wants(ty) { const c = catOf(ty); return V42_CATS.indexOf(c) >= 0; }
  /** ((v4.2 CODE-2, late-village balance) raw goods may fill at most depot.rawRack of a category's racks, so the
   *  goods surplus always finds room */
  room(ty) {
    if (!this.wants(ty)) return 0;
    const r = this.stock.room(ty);
    if (RAW.indexOf(ty) < 0) return r;
    const c = catOf(ty), share = Math.max(0, Math.min(1, Number(D().rawRack) >= 0 ? Number(D().rawRack) : 0.5));
    return Math.max(0, Math.min(r, Math.floor((Number(this.stock.cap[c]) || 0) * share) - this.rawIn(c)));
  }
  /** raw items on the racks of category c */
  rawIn(c) { let n = 0; for (const ty of RAW) if (catOf(ty) === c) n += this.stock.count(ty); return n; }
  total() { return this.stock.all(); }
  capTotal() { let n = 0; for (const c of V42_CATS) n += Number(this.stock.cap[c]) || 0; return n; }
  level(cat) { return this.stock.level(cat); }

  /** unload [{ ty, n }]: returns the accepted [{ ty, n }] (what does not fit stays on the sleigh) */
  take(load) {
    const out = [];
    for (const { ty, n } of load || []) {
      const k = Math.min(n, this.room(ty));
      if (k > 0) { this.stock.add(ty, k); out.push({ ty, n: k }); this.today.inflow += k; }
    }
    return out;
  }

  priceOf(ty) {
    const S = D().sell || {}, R = D().rawPrice || {};
    if (RAW.indexOf(ty) >= 0) return Math.max(1, Number(R[ty]) || 1);
    return Math.max(1, Math.round(priceOf(ty) * (Number(S.rate) || 0.6)));
  }

  /** the walk-in buyers: up to perMin a minute per category while open; returns [{ ty, n, coins }] */
  sell(dt, hour) {
    const S = D().sell || {};
    const open = Number(S.open) || 7, close = Number(S.close) || 20;
    if (!(hour >= open && hour < close)) return [];
    const out = [];
    const sale = (ty) => {
      this.stock.take(ty, 1);
      const c = this.priceOf(ty);
      out.push({ ty, n: 1, coins: c });
      this.today.sales++;
      this.today.coins += c;
      this.tot[1] += c;
      this.tot[2]++;
    };
    // ((v4.2 CODE-2) the category buyers take the goods first (raw only when a category has nothing else); the raw
    //  buyers (sell.rawPerMin a minute, all raw together) take the raw at rawPrice
    for (const cat of V42_CATS) {
      const per = Number(S.perMin && S.perMin[cat]) || 0;
      if (per <= 0) continue;
      this.acc[cat] = (this.acc[cat] || 0) + (per / 60) * dt;
      while (this.acc[cat] >= 1) {
        const items = this.stock.of(cat);
        if (!items.length) { this.acc[cat] = 0; break; }
        const ty = items.find((k) => RAW.indexOf(k) < 0) || items[0];
        this.acc[cat] -= 1;
        sale(ty);
      }
    }
    const rp = Number(S.rawPerMin) || 0;
    if (rp > 0) {
      this.acc.raw = (this.acc.raw || 0) + (rp / 60) * dt;
      while (this.acc.raw >= 1) {
        let best = null;
        for (const ty of RAW) { const n = this.stock.count(ty); if (n > 0 && (!best || n > this.stock.count(best))) best = ty; }
        if (!best) { this.acc.raw = 0; break; }
        this.acc.raw -= 1;
        sale(best);
      }
    }
    return out;
  }

  /** a new game day: the day's sales go into the 10-day history */
  newDay(day) {
    if (this.day >= 0 && day !== this.day) { this.days.unshift(this.today.sales); while (this.days.length > 10) this.days.pop(); this.today = { inflow: 0, sales: 0, coins: 0 }; }
    this.day = day;
  }

  /** the v8 `logistics` slice: v8 opens with the centre built, the opening gift and tutorial done, these racks */
  slice() {
    const stock = {};
    for (const [k, n] of Object.entries(this.stock.snapshot())) stock[k.replace(/^item_/, '')] = n;
    return { v: 1, open: 1, gift: 1, tut: 1, day: Math.max(-1, Math.floor(this.day)), seq: 0, stock, orders: [], cash: Math.floor(this.cash), chains: [], lv3: [], days: this.days.slice(0, 10), made: [0, 0], tot: [0, this.tot[1], this.tot[2]] };
  }
}
