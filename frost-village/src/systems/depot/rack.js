// (v4.2, docs/v42_plan.md §4.4) PARITY COPY of v8's logistics model — the item catalogue and the stock -> rack
// mapping the 서리 물류창고 draws with (src/systems/depot/*). v4.2 may not import module code at runtime (§1.2), so
// this file is a verbatim copy of:
//   src/city/logistics/model/catalog.js  +  src/city/logistics/model/stock.js   (git 56a97d1)
// tools/test/depot_parity.test.mjs compares rackFill / catOf / Stock with the module on 300 random stocks.
// Do not edit by hand: re-copy when the module changes (v8 integration removes this file, §17).

// ---- catalog.js
export const CATS = ['materials', 'food', 'goods', 'tools', 'furniture', 'appliances'];
export const FURNITURE = ['item_chair', 'item_table', 'item_sofa', 'item_bed', 'item_wardrobe'];
export const APPLIANCES = ['item_radio', 'item_stove_iron', 'item_washer', 'item_fridge', 'item_tv_retro'];

const T = {
  // materials (floor bays: pallets)
  item_log: ['materials', 'pallet_logs'], item_plank: ['materials', 'pallet_planks'], item_ore: ['materials', 'pallet_ore'],
  item_ingot: ['materials', 'pallet_ingots'], item_wheat: ['materials', 'pallet_boxes'], item_yarn: ['materials', 'pallet_boxes'],
  // food (crates)
  item_fish_raw: ['food', 'item_crate_food'], item_fish_big: ['food', 'item_crate_food'], item_fish_cooked: ['food', 'item_crate_food'],
  item_bread: ['food', 'item_crate_bread'], item_cake: ['food', 'item_crate_bread'], item_cookie: ['food', 'item_crate_bread'],
  item_meat_raw: ['food', 'item_crate_smoked'], item_meat_cooked: ['food', 'item_crate_smoked'],
  item_milk: ['food', 'item_crate_produce'], item_apple: ['food', 'item_crate_produce'], item_sweet_potato: ['food', 'item_crate_produce'],
  item_egg: ['food', 'item_crate_produce'], item_tteok: ['food', 'item_crate_produce'], item_bungeoppang: ['food', 'item_crate_bread'],
  item_cocoa: ['food', 'item_crate_cans'], item_coffee: ['food', 'item_crate_cans'], item_soup: ['food', 'item_crate_cans'],
  // goods (crates, cloth rolls, parcels)
  item_can: ['goods', 'item_crate_cans'], item_scarf: ['goods', 'item_cloth_rolls'], item_mittens: ['goods', 'item_cloth_rolls'],
  item_hat: ['goods', 'item_cloth_rolls'], item_cloth: ['goods', 'item_cloth_rolls'], item_sugar: ['goods', 'item_crate_jam'],
  item_jam: ['goods', 'item_crate_jam'], item_glass: ['goods', 'cardboard_box_l'], item_spice: ['goods', 'item_crate_jam'],
  item_book: ['goods', 'cardboard_box_s'], item_flower: ['goods', 'cardboard_box_m'], item_toy: ['goods', 'cardboard_box_m'],
  item_teddy: ['goods', 'cardboard_box_m'], item_candle: ['goods', 'cardboard_box_s'], item_sled: ['goods', 'cardboard_box_l'],
  item_skates: ['goods', 'cardboard_box_m'],
  // tools
  item_axe: ['tools', 'item_crate_tools'], item_pickaxe: ['tools', 'item_crate_tools'], item_sickle: ['tools', 'item_crate_tools'],
  item_rod: ['tools', 'item_toolbox'], item_bow: ['tools', 'item_toolbox'], item_toolbox: ['tools', 'item_toolbox'],
  item_shovel: ['tools', 'item_crate_tools'],
  // furniture / appliances (the items themselves)
  item_chair: ['furniture', 'item_chair'], item_table: ['furniture', 'item_table'], item_sofa: ['furniture', 'item_sofa'],
  item_bed: ['furniture', 'item_bed'], item_wardrobe: ['furniture', 'item_wardrobe'],
  item_radio: ['appliances', 'item_radio'], item_stove_iron: ['appliances', 'item_stove_iron'], item_washer: ['appliances', 'item_washer'],
  item_fridge: ['appliances', 'item_fridge'], item_tv_retro: ['appliances', 'item_tv_retro'],
};

const ID = /^item_[a-z0-9_]{1,24}$/;
/** is this a well-formed item id the centre can hold */
export const isItem = (k) => typeof k === 'string' && ID.test(k);
/** rack category of an item */
export function catOf(item) { const e = T[item]; return e ? e[0] : 'goods'; }
/** rack art key standing for this item on its shelf */
export function rackKeyOf(item) { const e = T[item]; return e ? e[1] : 'cardboard_box_m'; }
/** is the item furniture / an appliance (the 3rd-industry chains) */
export const kindOf = (item) => (FURNITURE.includes(item) ? 'furniture' : APPLIANCES.includes(item) ? 'appliance' : null);
export const KNOWN = Object.keys(T);

// ---- stock.js
export class Stock {
  /** cap: { category: items that fill its racks } */
  constructor(cap) {
    this.cap = cap;
    this.items = Object.create(null);
    this.cats = Object.create(null);
    for (const c of CATS) this.cats[c] = 0;
    this.ver = 0;                     // bumps on every change (the view redraws the racks when it moves)
  }
  count(item) { return this.items[item] || 0; }
  total(cat) { return this.cats[cat] || 0; }
  all() { let n = 0; for (const c of CATS) n += this.cats[c]; return n; }
  /** 0..1: how full the racks of a category look */
  level(cat) { const c = Math.max(1, Number(this.cap[cat]) || 1); return Math.min(1, this.total(cat) / c); }
  /** how many more of `item` fit its racks (`incoming`: { category: n } already on the way) */
  room(item, incoming) {
    const c = catOf(item);
    return Math.max(0, (Number(this.cap[c]) || 0) - this.total(c) - ((incoming && incoming[c]) || 0));
  }
  add(item, n) {
    n = Math.max(0, Math.floor(n) || 0);
    if (!n) return 0;
    this.items[item] = (this.items[item] || 0) + n;
    this.cats[catOf(item)] += n;
    this.ver++;
    return n;
  }
  take(item, n) {
    const q = Math.max(0, Math.min(this.count(item), Math.floor(n) || 0));
    if (!q) return 0;
    this.items[item] -= q;
    if (!this.items[item]) delete this.items[item];
    this.cats[catOf(item)] -= q;
    this.ver++;
    return q;
  }
  /** { item: n } of what is there */
  snapshot() { const o = {}; for (const k of Object.keys(this.items).sort()) if (this.items[k] > 0) o[k] = this.items[k]; return o; }
  /** items of a category, most first (ties by id) */
  of(cat) { return Object.keys(this.items).filter((k) => catOf(k) === cat && this.items[k] > 0).sort((a, b) => this.items[b] - this.items[a] || (a < b ? -1 : 1)); }
}

/** the fill units of one slot for a key: [{ cell: [t, u], k }] in fill order (front row first, then copies upward) */
function slotUnits(slot, key, items) {
  const it = items[key];
  const cells = (slot.cells && it && slot.cells[it.sizeClass]) || [[0, 0]];
  const fit = Math.max(0, Math.floor((slot.itemFit || {})[key] || 0));
  // front cells (u >= 0) are filled before the back row: what stands at the front is what the eye reads
  const order = cells.map((c, i) => ({ c, i })).sort((a, b) => (b.c[1] - a.c[1]) || (a.c[0] - b.c[0]) || (a.i - b.i));
  return { cells, fit, order };
}

/**
 * What every rack slot shows. geo: { slots: rackSlots, items: { key: { sizeClass, ... } } }; stock: Stock.
 * Returns [{ slot (index), key, stacks: [{ t, u, n }] }] with n = copies on that cell (0 < n <= itemFit[key]);
 * the totals of a category follow round(level x the units its slots can hold).
 */
export function rackFill(geo, stock) {
  const out = geo.slots.map((s, i) => ({ slot: i, key: null, stacks: [] }));
  for (const cat of CATS) {
    const idx = geo.slots.map((s, i) => i).filter((i) => geo.slots[i].category === cat)
      .sort((a, b) => (geo.slots[a].level - geo.slots[b].level) || (geo.slots[a].slot - geo.slots[b].slot) || (a - b));
    if (!idx.length) continue;
    // rack art keys of the category's stock, merged (fish + grilled fish -> one crate kind), most first
    const keys = new Map();
    for (const item of stock.of(cat)) { const k = rackKeyOf(item); keys.set(k, (keys.get(k) || 0) + stock.count(item)); }
    const ranked = Array.from(keys.entries()).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    const total = ranked.reduce((s, e) => s + e[1], 0);
    // slot shares by largest remainder (each stocked key gets at least one slot while slots last)
    const assign = [];
    if (ranked.length) {
      const n = idx.length;
      const base = ranked.map(([k, c]) => ({ k, q: Math.floor((c / total) * n), r: (c / total) * n - Math.floor((c / total) * n) }));
      let used = base.reduce((s, b) => s + b.q, 0);
      for (const b of base) if (b.q === 0 && used < n) { b.q = 1; used++; }
      const rem = base.slice().sort((a, b) => b.r - a.r);
      for (let i = 0; used < n && i < rem.length * 4; i++) { rem[i % rem.length].q++; used++; }
      while (used > n) { const b = base.slice().reverse().find((x) => x.q > 1) || base[base.length - 1]; b.q--; used--; }
      for (const b of base) for (let q = 0; q < b.q; q++) assign.push(b.k);
    }
    // per slot: the assigned key if it fits the slot, else the first key the slot takes
    const plan = idx.map((si, n) => {
      const s = geo.slots[si];
      const fitKeys = Object.keys(s.itemFit || {}).filter((k) => s.itemFit[k] > 0);
      let key = assign[n] || null;
      if (!key || !(s.itemFit || {})[key]) {
        // a key that fits, preferring one the category actually has
        key = ranked.map((e) => e[0]).find((k) => (s.itemFit || {})[k] > 0) || fitKeys[0] || null;
      }
      return { si, key, u: key ? slotUnits(s, key, geo.items) : null };
    });
    // fill order: level by level, copy by copy, slot by slot, cell by cell
    const units = [];
    const levels = Array.from(new Set(plan.map((p) => geo.slots[p.si].level))).sort((a, b) => a - b);
    for (const lv of levels) {
      const ps = plan.filter((p) => p.u && geo.slots[p.si].level === lv);
      const maxFit = ps.reduce((m, p) => Math.max(m, p.u.fit), 0);
      for (let k = 0; k < maxFit; k++) for (const p of ps) { if (k >= p.u.fit) continue; for (const o of p.u.order) units.push({ p, cell: o.i }); }
    }
    const want = total > 0 ? Math.max(1, Math.round(stock.level(cat) * units.length)) : 0;
    const counts = new Map();
    for (let n = 0; n < Math.min(want, units.length); n++) {
      const { p, cell } = units[n];
      const key = p.si + ':' + cell;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    for (const p of plan) {
      const o = out[p.si];
      o.key = p.key;
      if (!p.u) continue;
      p.u.cells.forEach((c, ci) => { const n = counts.get(p.si + ':' + ci) || 0; if (n > 0) o.stacks.push({ t: c[0], u: c[1], n }); });
    }
  }
  return out;
}

/** copies a category's slots can hold at most (for tests: rackFill never draws more) */
export function rackUnits(geo, cat) {
  let n = 0;
  for (const s of geo.slots) {
    if (s.category !== cat) continue;
    let best = 0;
    for (const k of Object.keys(s.itemFit || {})) {
      const it = geo.items[k]; const cells = (s.cells && it && s.cells[it.sizeClass]) || [[0, 0]];
      best = Math.max(best, cells.length * s.itemFit[k]);
    }
    n += best;
  }
  return n;
}
