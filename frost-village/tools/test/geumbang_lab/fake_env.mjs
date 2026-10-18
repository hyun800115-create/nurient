// Node side of the 금방 tests: the real v4 roads + lane graph (lab_world.js), a fake v4.2 depot (the real rack Stock
// of src/systems/depot/rack.js with the v4.2 caps, a sleigh that brings surplus), fake shop shelves (the ledger), the
// households of the town, and counters for every coin and item that crosses the module's border.
//   const E = makeEnv({ seed, fill, inflowPerMin, shelf }); E.model.open(); E.run(600); E.model.state()

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GbModel } from '../../../src/geumbang/model/GbModel.js';
import { GB_TUNING } from '../../../src/geumbang/tuning.js';
import { GB_LAYOUT, L } from '../../../src/geumbang/layout.js';
import { WORLD } from '../../../src/data/world.js';
import { villageGraphOf } from '../../../src/geumbang/townRead.js';
import { Stock, catOf } from '../../../src/systems/depot/rack.js';
import { makeRoads, makeEntries, villageGraph } from './lab_world.js';
import { mulberry32Lab } from './lab_rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const TOWN = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'town', 'manifest.json'), 'utf8'));
export const doorPointOf = (key) => (TOWN.sprites[key] && TOWN.sprites[key].doorPoint) || null;
const ROADS = makeRoads(doorPointOf);
export { ROADS };

export const CAPS = { materials: 160, food: 160, goods: 120, tools: 60, furniture: 0, appliances: 0 };
export const SHOP_PRICE = { item_bread: 7, item_meat_cooked: 12, item_fish_cooked: 4, item_can: 12, item_plank: 5, item_axe: 40, item_rod: 40, item_sickle: 40, item_bow: 40, item_pickaxe: 40, item_fish_raw: 1, item_meat_raw: 3, item_log: 1, item_wheat: 1, item_ore: 2, item_ingot: 8 };
const INFLOW = ['item_log', 'item_fish_raw', 'item_wheat', 'item_meat_raw', 'item_bread', 'item_plank', 'item_fish_cooked', 'item_can', 'item_meat_cooked', 'item_ore'];
export const hourOf = (T) => ((T / 25) % 24 + 24) % 24;

/** a fake v4.2 depot: the rack Stock (pick / restock / level) + counters */
export function makeDepot(fill = 0.6, seed = 7) {
  const st = new Stock(Object.assign({}, CAPS));
  const r = mulberry32Lab(seed);
  const want = { materials: 0, food: 0, goods: 0, tools: 0 };
  for (const c in want) want[c] = Math.floor(CAPS[c] * fill);
  const pools = { materials: ['item_log', 'item_plank', 'item_wheat', 'item_ore'], food: ['item_bread', 'item_fish_raw', 'item_fish_cooked', 'item_meat_raw', 'item_meat_cooked'], goods: ['item_can'], tools: ['item_axe', 'item_rod', 'item_sickle', 'item_bow', 'item_pickaxe'] };
  for (const c in want) { let n = want[c]; while (n > 0) { const k = pools[c][Math.floor(r() * pools[c].length)]; const q = Math.min(n, 1 + Math.floor(r() * 6)); st.add(k, q); n -= q; } }
  const D = {
    stock: st, picked: 0, restocked: 0, refused: 0, inflow: 0, initial: st.all(),
    count: (k) => st.count(k),
    level: (cat) => st.level(cat),
    pick(items) { const got = {}; for (const k in items) { const q = st.take(k, items[k]); if (q > 0) got[k] = q; D.picked += q; } return got; },
    /** items back on the racks: what does not fit is refused (the dock surplus takes it) */
    restock(items) { const refused = {}; for (const k in items) { const room = st.room(k); const q = Math.min(room, items[k]); if (q > 0) st.add(k, q); D.restocked += q; if (items[k] - q > 0) { refused[k] = items[k] - q; D.refused += items[k] - q; } } return refused; },
    /** the cargo sleigh: n items of the village surplus (what fits) */
    bring(n) { for (let i = 0; i < n; i++) { const k = INFLOW[Math.floor(r() * INFLOW.length)]; if (st.room(k) > 0) { st.add(k, 1); D.inflow++; } } },
    fill: () => { let a = 0, b = 0; for (const c of ['materials', 'food', 'goods', 'tools']) { a += st.total(c); b += CAPS[c]; } return a / b; },
  };
  return D;
}

/**
 * a GbModel on the stand-in town. o: { seed, fill, inflowPerMin, shelf (item -> level), saved, lots, village, snow,
 * walkers(x, y) | null, home(aid, hid), tune, sleighBusy }
 */
export function makeEnv(o = {}) {
  const tune = o.tune || GB_TUNING;
  const depot = o.depot || makeDepot(o.fill !== undefined ? o.fill : 0.6, o.seed || 7);
  const out = { coins: 0, pays: [], spent: 0, happy: 0, surplus: 0, dock: o.dock || 0, took: 0, live: o.live || false };
  // the caller's object itself (a test changes a shelf mid-run), with the defaults filled in
  const shelves = o.shelf || {};
  for (const [k, v] of Object.entries({ item_bread: 0.8, item_meat_cooked: 0.9, item_fish_cooked: 0.8, item_can: 0.8, item_plank: 0.8, item_axe: 0.8, item_rod: 0.8, item_sickle: 0.8, item_bow: 0.8, item_pickaxe: 0.8 })) if (shelves[k] === undefined) shelves[k] = v;
  const env = {
    source: depot,
    shelf: (item) => (shelves[item] === undefined ? null : [{ level: shelves[item], status: shelves[item] < 0.2 ? 'short' : shelves[item] > 0.95 ? 'surplus' : 'ok' }]),
    price: (k) => SHOP_PRICE[k] || 1,
    pay: (c, info) => { out.coins += c; out.pays.push([c, info.id]); },
    spend: (cost) => { out.spent += cost.coins || 0; return o.spend !== false; },
    happy: (x) => { out.happy += x; },
    home: o.home || ((aid, hid) => { const h = hourOf(E.T); const k = (String(hid || aid).length * 7 + Math.floor(E.T / 600)) % 4; return h >= 17 || h < 9 || k !== 0; }),
    passer: () => false,
    walkers: o.walkers || null,
    live: () => out.live,
    sleighBusy: o.sleighBusy || (() => false),
    snow: () => !!o.snow,
    rackFill: () => depot.fill(),
    surplus: (items) => { for (const k in items) out.surplus += items[k]; },
    dockSurplus: () => out.dock,
    takeSurplus: (n) => { const q = Math.min(n, out.dock); out.dock -= q; out.took += q; return q ? { item_log: Math.ceil(q / 2), item_fish_raw: Math.floor(q / 2) } : null; },
    firstHousehold: (book) => book.households().find((h) => h.hid === 't_apt2:jeong') || null,
    // the station dock (any item) and the village piles (critique C1 / H2): o.dockItems { item: n }, o.piles [{ id, item, x, y, n, max, rate }]
    dockTake: (item, n) => { const have = out.dockItems[item] || 0, q = Math.max(0, Math.min(n, have)); if (q) { out.dockItems[item] = have - q; out.dockTook += q; } return q; },
    piles: () => out.piles.map((p) => ({ id: p.id, item: p.item, x: p.x, y: p.y, n: Math.floor(p.n), max: p.max })),
    takePile: (id, n) => { const p = out.piles.find((q) => q.id === id); if (!p) return 0; const q = Math.max(0, Math.min(Math.floor(n), Math.floor(p.n))); p.n -= q; out.pileTook += q; return q; },
    pileTake: (item, n) => { const p = out.piles.find((q) => q.item === item); if (!p) return 0; const q = Math.max(0, Math.min(Math.floor(n), Math.floor(p.n))); p.n -= q; out.pileTook += q; return q; },
    dockRoom: () => (o.dockRoom === undefined ? 200 : o.dockRoom) - out.dropped,
    dockDrop: (items) => { for (const k in items) { out.dropped += items[k]; out.dropItems[k] = (out.dropItems[k] || 0) + items[k]; } },
  };
  out.dockItems = Object.assign({}, o.dockItems || {}); out.dockTook = 0;
  out.piles = (o.piles || []).map((p) => Object.assign({ rate: 0 }, p)); out.pileTook = 0; out.dropped = 0; out.dropItems = {};
  const T0 = o.T === undefined ? 600 * 3 + 25 * 9 : o.T;
  const model = new GbModel({ tuning: tune, seed: o.seed || 7, saved: o.saved || null, env, layout: GB_LAYOUT, T: T0 });
  // the cargo sleigh's route (the real WORLD.v42 data): curbs keep off it (M4); o.avoid === false turns it off
  model.avoid = o.avoid === false ? null : (o.avoid || ((WORLD.v42 && WORLD.v42.sleighRoute) || []).map(([i, j]) => L(i, j)));
  const roads = o.roads || ROADS;
  model.setRoads(roads.rn, roads.lg);
  const entries = o.entries || makeEntries(roads.doors, { seed: o.worldSeed || 4343, lots: o.lots, village: o.village });
  // (o.village 'real': the game's own old-village roads, WORLD.roads — the sleds reach the real collection piles)
  model.setWorld(entries, o.village === false ? null : o.village === 'real' ? villageGraphOf(WORLD.roads, L(GB_LAYOUT.sledStand[0], GB_LAYOUT.sledStand[1])) : villageGraph());
  const E = {
    model, env, depot, out, entries, T: T0, events: [], inflow: o.inflowPerMin === undefined ? 30 : o.inflowPerMin, inAcc: 0,
    ms: [],
    run(sec, dt = 1 / 30, hook) {
      const n = Math.round(sec / dt);
      for (let i = 0; i < n; i++) {
        this.T += dt;
        this.inAcc += (this.inflow / 60) * dt;
        if (this.inAcc >= 1) { const k = Math.floor(this.inAcc); this.inAcc -= k; depot.bring(k); }
        // the gatherers fill the piles (rate a second, up to max)
        for (const p of out.piles) if (p.rate) p.n = Math.min(p.max, p.n + p.rate * dt);
        // the walk-in 솔방울 상인 (o.buyers: the real Depot.js sell() on a depot made by realDepot)
        if (o.buyers && depot.model && depot.model.sell) { for (const q of depot.model.sell(dt, hourOf(this.T))) { depot.sold = (depot.sold || 0) + q.n; depot.soldCoins = (depot.soldCoins || 0) + q.coins; } }
        const a = performance.now();
        model.tick(dt, this.T, hourOf(this.T));
        this.ms.push(performance.now() - a);
        if (this.ms.length > 20000) this.ms.splice(0, 10000);
        for (const e of model.events) this.events.push(e);
        model.events.length = 0;
        if (hook) hook(this, i);
      }
    },
    /** items everywhere: racks + 금방's share + open orders (+ the sled queue) + delivered + restocked back */
    count(ev) {
      const m = this.model;
      let orders = 0;
      for (const q of m.orders.list) orders += q.n;
      const delivered = this.events.filter((e) => e.t === 'gb:delivered').reduce((s, e) => s + e.n, 0);
      let res = 0; for (const k in m.res) res += m.res[k];
      return { racks: depot.stock.all(), res, orders, delivered, picked: depot.picked, restocked: depot.restocked, inflow: depot.inflow, initial: depot.initial, refused: depot.refused, dockTook: out.dockTook, pileTook: out.pileTook };
    },
    /** the whole item balance (racks, share, orders, delivered, refused, crates on sleds / vans, dropped at the dock)
     *  against what came in (start, inflow, dock and pile takes, backhaul): { in, now, ok } */
    balance() {
      const c = this.count(), m = this.model;
      let ride = 0;
      for (const q of m.sleds || []) for (const k in q.cload || {}) ride += q.cload[k];
      if (m.disp) for (const v of m.disp.vans) for (const k in v.backload || {}) ride += v.backload[k];
      const inAll = c.initial + c.inflow + out.took + out.dockTook + out.pileTook;
      const now = c.racks + c.res + c.orders + c.delivered + out.surplus + ride + out.dropped + (depot.sold || 0);
      return { in: inAll, now, ok: inAll === now, c };
    },
  };
  return E;
}

export { GB_TUNING, GB_LAYOUT, catOf };
