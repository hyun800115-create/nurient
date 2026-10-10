// The fake town around the logistics centre (pure, no Node / browser APIs): v4-like Growth shops whose shelves
// empty as they sell, homes waiting for their 살림살이, a freight yard sending trucks with the village's goods, and
// porters feeding the producers' input pads. Used by the Node tests (fake_env.mjs) and the Phaser lab (lab.js).

import { stream } from '../../../src/city/logistics/model/rng.js';

/** v4 founding shops (balance.js founding.shops: sells) — a shelf of 20 per item, restock below 40 % */
export const SHOPS = [
  { id: 'lotA1', name: '카페', en: 'Café', sells: ['item_bread'] },
  { id: 'lotA2', name: '식당', en: 'Restaurant', sells: ['item_fish_cooked', 'item_meat_cooked'] },
  { id: 'lotB1', name: '철물점', en: 'Hardware store', sells: ['item_axe', 'item_pickaxe', 'item_rod', 'item_sickle', 'item_bow'] },
  { id: 'lotB5', name: '슈퍼마켓', en: 'Supermarket', sells: ['item_can', 'item_bread'] },
];
export const PRICES = { item_fish_cooked: 4, item_bread: 7, item_meat_cooked: 12, item_plank: 5, item_ingot: 10, item_can: 12, item_axe: 40, item_pickaxe: 40, item_rod: 40, item_sickle: 40, item_bow: 40, item_fish_raw: 3, item_log: 2, item_ore: 3 };
const YARD = ['item_bread', 'item_bread', 'item_fish_cooked', 'item_fish_cooked', 'item_meat_cooked', 'item_can', 'item_can', 'item_axe', 'item_pickaxe', 'item_rod', 'item_plank', 'item_ingot'];

export class Sim {
  constructor(o = {}) {
    this.o = o;
    this.rng = stream(o.seed || 7, 'env');
    this.shelf = 20; this.low = 0.4;
    this.shops = SHOPS.map((s) => ({ ...s, stock: Object.fromEntries(s.sells.map((k) => [k, o.fullShelves ? this.shelf : 4])), got: 0 }));
    this.homes = [];
    for (let k = 0; k < (o.homes === undefined ? 12 : o.homes); k++) this.homes.push({ id: 'h' + k, level: 2, name: 'h' + k });
    this.delivered = [];
    this.yardT = o.yardFirst === undefined ? 3 : o.yardFirst; this.sellT = 0; this.feedT = 0;
  }
  shopsList() {
    return this.shops.map((s) => {
      const need = {};
      for (const k of s.sells) { const have = s.stock[k] || 0; if (have < this.shelf * this.low) need[k] = this.shelf - have; }
      return { id: s.id, name: this.o.lang === 'en' ? s.en : s.name, sells: s.sells, need, look: { seed: 100 + this.shops.indexOf(s) * 13 } };
    });
  }
  homesList() { return this.homes; }
  /** a shop takes goods onto its shelf (what fits) */
  deliver(id, items) {
    const s = this.shops.find((x) => x.id === id);
    const ok = {};
    if (!s || this.o.refuse) return ok;
    for (const [k, n] of Object.entries(items)) { if (!s.sells.includes(k)) continue; const q = Math.max(0, Math.min(n, this.shelf - (s.stock[k] || 0))); if (q) { ok[k] = q; s.stock[k] = (s.stock[k] || 0) + q; s.got += q; } }
    this.delivered.push({ to: id, ok });
    return ok;
  }
  /** one step: shops sell, the yard sends a truck, porters feed the producers. api: the logistics api (or model shim) */
  tick(dt, api) {
    const rng = this.rng, o = this.o;
    this.sellT -= dt;
    if (this.sellT <= 0) { this.sellT = o.sellEvery || 1.5; const s = this.shops[rng.int(this.shops.length)]; const k = s.sells[rng.int(s.sells.length)]; if ((s.stock[k] || 0) > 0) s.stock[k]--; }
    if (o.yard !== false) {
      this.yardT -= dt;
      if (this.yardT <= 0 && api.open()) {
        this.yardT = o.yardEvery || 45;
        const goods = {};
        const pool = o.pool || YARD;
        const want = rng.between(16, 28);
        for (let q = 0; q < want; q++) { const k = pool[rng.int(pool.length)]; goods[k] = (goods[k] || 0) + 1; }
        api.inbound(goods, 'yard');
      }
    }
    this.feedT -= dt;
    if (this.feedT <= 0) { this.feedT = o.feedEvery || 2; for (const p of api.producers()) api.feedProducer(p.id, 1); }
  }
}
