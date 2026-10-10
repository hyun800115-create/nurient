// The fish auction (harbor_runtime model, docs/v5_v8_plan.md §6.4 auction.js). Pure.
//
// Small auctions ring every `smallEvery` s from smallFrom to smallTo (08:00 … 18:00 every 2 game hours); the big one
// at bigAt after the trawlers are home. At each bell the pad sells: the chief's fish at premium × base price (1.5 ×:
// fish 6, tuna 30) and the trawlers' boxes at tunaPerBox × tunaPrice each. Coins and fish are conserved: what is
// dropped is either still on the pad or sold, never both, never lost.

import { HOUR, dayOf, hourOf } from './time.js';

export const FISH_ITEMS = ['item_fish_raw', 'item_fish_big'];
const NONE = [];

export class Auction {
  constructor(cfg, saved = null) {
    this.cfg = cfg;
    this.pad = { item_fish_raw: 0, item_fish_big: 0 };
    this.boxes = 0;           // trawler boxes landed, not sold yet
    this.day = -1;            // the day `coins` counts
    this.coins = 0;           // coins paid today
    this.total = 0;           // coins paid ever (tests)
    this.sold = 0;            // auctions held
    this.lastT = null;
    if (saved) {
      this.pad.item_fish_raw = saved.raw | 0; this.pad.item_fish_big = saved.big | 0;
      this.boxes = saved.boxes | 0; this.day = saved.day | 0; this.coins = saved.coins | 0;
    }
  }

  /** the bell hours of a day (small every 2 h + the big one) as hours */
  hours() {
    if (this._hours) return this._hours;
    const A = this.cfg.auction, out = [];
    const step = (A.smallEvery || 50) / HOUR;
    for (let h = A.smallFrom; h <= A.smallTo + 1e-6; h += step) out.push({ h: Math.round(h * 1000) / 1000, big: false });
    if (A.bigAt !== undefined) out.push({ h: A.bigAt, big: true });
    this._hours = out.sort((a, b) => a.h - b.h);
    return this._hours;
  }

  /** the chief drops fish on the pad -> how many it took */
  drop(item, n) {
    if (FISH_ITEMS.indexOf(item) < 0) return 0;
    const q = Math.max(0, n | 0);
    this.pad[item] += q;
    return q;
  }
  landBox(n = 1) { this.boxes += Math.max(0, n | 0); }

  /** price of one item / box at the bell */
  unit(item) { const A = this.cfg.auction; return (A.base[item] || 1) * A.premium; }
  boxValue() { const A = this.cfg.auction; return (A.tunaPerBox || 10) * (A.tunaPrice || 30); }

  /** sell everything on the pad now -> { coins, fish, boxes, big } */
  sell(T, big) {
    const d = dayOf(T);
    if (d !== this.day) { this.day = d; this.coins = 0; }
    let coins = 0, fish = 0;
    for (const k of FISH_ITEMS) { coins += this.pad[k] * this.unit(k); fish += this.pad[k]; this.pad[k] = 0; }
    const boxes = this.boxes;
    coins += boxes * this.boxValue();
    this.boxes = 0;
    coins = Math.round(coins);
    this.coins += coins; this.total += coins; this.sold++;
    return { coins, fish, boxes, big: !!big };
  }

  /** bells rung in (T0, T1] -> [{ T, big }] (pure: from the day's bell hours) */
  bells(T0, T1) {
    if (!(T1 > T0)) return NONE;
    const d0 = dayOf(T0), d1 = dayOf(T1), H = this.hours();
    // most frames ring nothing: no allocation then
    let any = false;
    for (let d = d0; d <= d1 && !any; d++) for (const b of H) { const t = d * 24 * HOUR + b.h * HOUR; if (t > T0 && t <= T1) { any = true; break; } }
    if (!any) return NONE;
    const out = [];
    for (let d = d0; d <= d1; d++) for (const b of H) { const t = d * 24 * HOUR + b.h * HOUR; if (t > T0 && t <= T1) out.push({ T: t, big: b.big }); }
    return out.sort((a, b) => a.T - b.T);
  }

  /** seconds until the next bell */
  next(T) { const b = this.bells(T, T + 24 * HOUR); return b.length ? b[0].T - T : Infinity; }
  waiting() { return this.pad.item_fish_raw + this.pad.item_fish_big + this.boxes; }

  serialize() { return { day: this.day, coins: this.coins, raw: this.pad.item_fish_raw, big: this.pad.item_fish_big, boxes: this.boxes }; }
}

export { hourOf };
