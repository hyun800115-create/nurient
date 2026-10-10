// Exports and imports (harbor_runtime model, docs/v5_v8_plan.md §6.4 trade.js). Pure.
//
// Exports: every cargo ship brings one contract (rotating by the harbour's stars), due when the next cargo ship
// leaves. Goods dropped on the export pad (by the chief, trucks or porters) go to the oldest open contract that needs
// them and are paid at once: exportMult × price per item. A full contract is "done" (missions D10 pays its bonus);
// one that misses its ship expires (what was delivered stays paid).
// Imports: the first cargo ships open sugar, cloth, glass, spice in turn (once each); later ships bring restock crates
// of an opened import. Crates come ashore with the crane; `take(kind, n)` uses them (the bakery's cake, the clothing
// shop, level-2 houses).

import { priceOf, TOOLS } from '../../data/items.js';
import { stream } from './rng.js';

export const IMPORTS = ['sugar', 'cloth', 'glass', 'spice'];
const isTool = (k) => TOOLS.indexOf(k) >= 0;
const NONE = [];

export class Trade {
  /** cfg: the whole harbour tuning; saved: slice parts { exports, imports } */
  constructor(cfg, saved = null, seed = 1) {
    this.cfg = cfg;
    this.seed = seed >>> 0;
    this.contracts = [];          // { id, items: {k: n}, got: {k: n}, due, done, n }
    this.unlocked = [];           // import kinds opened (in order)
    this.stock = {};              // import crates on hand
    this.ships = 0;               // cargo ships served (for the import order)
    if (saved) this.load(saved);
  }

  load(s) {
    this.contracts = (s.exports || []).map((c) => ({ id: c.id, items: Object.assign({}, c.items), got: Object.assign({}, c.got || {}), due: c.due, done: !!c.done, n: c.n || 0 }));
    this.unlocked = (s.imports && s.imports.unlocked ? s.imports.unlocked : []).filter((k) => IMPORTS.indexOf(k) >= 0);
    this.stock = Object.assign({}, (s.imports && s.imports.stock) || {});
    this.ships = s.cargoShips || 0;
  }

  /** price paid for one exported item */
  priceOf(item) {
    if (item === 'tools') return priceOf('item_axe');
    const base = this.cfg.auction && this.cfg.auction.base && this.cfg.auction.base[item];
    const p = priceOf(item);
    return p > 1 ? p : (base || 1);
  }

  /** the contract a cargo ship brings (seeded by the ship id) */
  makeContract(shipId, star) {
    const E = this.cfg.exports || {};
    const r = stream(this.seed, 'contract:' + shipId);
    let items;
    if (star >= 3) {
      const pool = (E[1] || []).concat(E[2] || []);
      const a = r.pick(pool), b = r.pick(pool.filter((x) => x !== a)) || a;
      items = {};
      for (const src of [a, b]) for (const k in src) items[k] = (items[k] || 0) + Math.round(src[k] * 1.5 / 2);
    } else {
      const list = E[Math.max(1, Math.min(2, star))] || E[1] || [{ item_plank: 50 }];
      items = Object.assign({}, list[(this.ships + r.int(list.length)) % list.length]);
    }
    return items;
  }

  /** a cargo ship berthed: a new contract (due = when the next one leaves) + the import it carries */
  cargoArrives(shipId, T, due, star) {
    const items = this.makeContract(shipId, star);
    const c = { id: shipId, items, got: {}, due, done: false, n: 0 };
    this.contracts.push(c);
    // keep the newest three (older ones are past their ship anyway)
    while (this.contracts.length > 3) this.contracts.shift();
    // the import: the next kind not opened yet, else restock crates of an opened one (rotating)
    const order = (this.cfg.imports && this.cfg.imports.order) || IMPORTS;
    let kind = order.find((k) => this.unlocked.indexOf(k) < 0) || null;
    const first = !!kind;
    if (!kind && this.unlocked.length) kind = this.unlocked[this.ships % this.unlocked.length];
    this.ships++;
    const crates = kind ? ((this.cfg.imports[kind] && this.cfg.imports[kind].crates) || 6) : 0;
    return { contract: c, imp: kind ? { kind, crates, first } : null };
  }

  /** an import crate came ashore (the crane's drop) */
  landCrate(kind) {
    if (IMPORTS.indexOf(kind) < 0) return false;
    const first = this.unlocked.indexOf(kind) < 0;
    if (first) this.unlocked.push(kind);
    this.stock[kind] = (this.stock[kind] || 0) + 1;
    return first;
  }
  has(kind) { return this.unlocked.indexOf(kind) >= 0; }
  /** use import crates (returns how many were taken) */
  take(kind, n) { const q = Math.max(0, Math.min(n | 0, this.stock[kind] || 0)); if (q) this.stock[kind] -= q; return q; }

  /** what the open contracts still need: { item: n } (tools = any tool) */
  needs(T) {
    const out = {};
    for (const c of this.contracts) if (!c.done && c.due > T) for (const k in c.items) { const left = c.items[k] - (c.got[k] || 0); if (left > 0) out[k] = (out[k] || 0) + left; }
    return out;
  }
  wants(item, T) { const nd = this.needs(T); return (nd[item] || 0) + (isTool(item) ? (nd.tools || 0) : 0); }

  /**
   * deliver goods: -> { took, coins, done: [contract ids completed], per: [{ id, n }] }
   * The oldest open contract that needs the item gets it.
   */
  deliver(item, n, T) {
    let left = Math.max(0, n | 0), took = 0, coins = 0;
    const done = [], per = [];
    const mult = (this.cfg.cargo && this.cfg.cargo.exportMult) || 2;
    for (const c of this.contracts) {
      if (!left) break;
      if (c.done || c.due <= T) continue;
      const key = c.items[item] !== undefined ? item : (isTool(item) && c.items.tools !== undefined ? 'tools' : null);
      if (!key) continue;
      const q = Math.min(left, c.items[key] - (c.got[key] || 0));
      if (q <= 0) continue;
      c.got[key] = (c.got[key] || 0) + q;
      c.n += q;
      left -= q; took += q;
      coins += Math.round(q * this.priceOf(item) * mult);
      per.push({ id: c.id, n: q });
      if (Object.keys(c.items).every((k) => (c.got[k] || 0) >= c.items[k])) { c.done = true; done.push(c.id); }
    }
    return { took, coins, done, per };
  }

  /** contracts past their ship: -> [ids] (they stay listed until pushed out, marked expired) */
  expire(T) {
    let out = NONE;
    for (const c of this.contracts) if (!c.done && !c.expired && c.due <= T) { c.expired = true; if (out === NONE) out = []; out.push(c.id); }
    return out;
  }

  /** the contract a view should show (the oldest open one) */
  current(T) { return this.contracts.find((c) => !c.done && c.due > T) || null; }

  serialize() {
    return {
      exports: this.contracts.slice(-3).map((c) => ({ id: c.id, items: c.items, got: c.got, due: Math.round(c.due), done: c.done ? 1 : 0, n: c.n })),
      imports: { unlocked: this.unlocked.slice(), stock: Object.assign({}, this.stock) },
      cargoShips: this.ships,
    };
  }
}
