// Save / settings persistence. Every localStorage access is wrapped in try/catch
// (private mode, sandboxed iframes and full quotas must never crash the game).

import { ITEMS, FOODS, GOODS, TOOLS, STORE_GOODS, MINER_FOOD, MATERIALS, FISH } from '../data/items.js';
// ---- (v4-B) the v4 block is checked against the lots and the shops it may name
import { WORLD } from '../data/world.js';
import { BALANCE } from '../data/balance.js';

export const SAVE_KEY = 'frostVillage.save.v1';
export const SETTINGS_KEY = 'frostVillage.settings.v1';

function getStore() {
  try { return window.localStorage || null; } catch (e) { return null; }
}

export function readJSON(key) {
  try {
    const st = getStore();
    if (!st) return null;
    const raw = st.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) { return null; }
}

export function writeJSON(key, obj) {
  try {
    const st = getStore();
    if (!st) return false;
    st.setItem(key, JSON.stringify(obj));
    return true;
  } catch (e) { return false; }
}

export function removeKey(key) {
  try { const st = getStore(); if (st) st.removeItem(key); } catch (e) { /* ignore */ }
}

export const SAVE_VERSION = 6;
export const BACKUP_KEY = 'frostVillage.save.backup';
export const BAD_KEY = 'frostVillage.save.v1.bad';

// (v3) what a construction site may hold, and the land
// (v4-A) + the repaired station (plot r_station) and the rail strip / neighbour town
// (v4-C) + the town hall, the big restaurant, the decor; the west strip (open from the start) and its south end
const BUILDINGS = ['toolsmith', 'warehouse', 'boathouse', 'cannery', 'store', 'house_a', 'house_b', 'house_c', 'watchtower', 'station',
  'town_hall', 'big_restaurant', 'deco_snowman', 'deco_bench', 'deco_lamp', 'deco_flowers', 'deco_rink', 'deco_playground', 'deco_fountain'];
const SITE_STATES = ['foundation', 'scaffold', 'done'];
const REGIONS = ['east', 'south', 'se', 'rail', 'town', 'west', 'west_s'];

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** finite number (numeric strings accepted) or `d` */
const num = (v, d) => {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  return Number.isFinite(n) ? n : d;
};
const count = (v, max = 1e9) => Math.max(0, Math.min(max, Math.floor(num(v, 0))));
const flags = (v) => { const o = {}; if (isObj(v)) for (const k in v) if (v[k] === true) o[k] = true; return o; };
const counts = (v, keys) => { const o = {}; if (isObj(v)) for (const k of keys || Object.keys(v)) if (k in v) o[k] = count(v[k], 1e7); return o; };

// Migrations from older save versions: MIGRATE[v] turns a version-v save into version v+1.
// (never wipe a player's progress: every old field is carried over)
const OLD_STEP_IDS = { hire2_fisherman: 'porter_grill', hire2_lumberjack: 'porter_sawmill', hire2_farmer: 'porter_bakery', hire2_miner: 'porter_smelter', hire2_hunter: 'porter_smokehouse' };
export const MIGRATE = {
  // v1 -> v2 (살아 있는 마을): post-completion couriers became porters (same pads, new ids); the first
  // sale / trade already happened for anyone who unlocked something; residents are derived on load.
  1: (s) => {
    const o = Object.assign({}, s, { v: 2 });
    const pr = isObj(s.progress) ? Object.assign({}, s.progress) : {};
    const ren = (obj) => { const r = {}; if (isObj(obj)) for (const k in obj) r[OLD_STEP_IDS[k] || k] = obj[k]; return r; };
    pr.done = ren(pr.done);
    pr.paid = ren(pr.paid);
    const anyDone = Object.keys(pr.done).some((k) => pr.done[k] === true);
    pr.flags = Object.assign({}, isObj(pr.flags) ? pr.flags : {}, anyDone ? { firstSale: true } : {}, pr.done.zone_forest === true ? { firstTrade: true } : {});
    o.progress = pr;
    return o;
  },
  // v2 -> v3 (생산 사슬과 땅 넓히기): everything carries over; the new land, plots and chains start fresh
  // (residents who already moved in stay, even beyond the new house limit)
  2: (s) => Object.assign({}, s, { v: 3 }),
  // v3 -> v3.5 (분업): stations now need an operator and gatherers drop at collection piles. Every station
  // that ran on its own in v3 gets its operator, a hired gatherer gets the raw porter of his line, and a v3
  // toolsmith / cannery keeps working (its operator comes with it) — nobody loses the automation they had.
  3: (s) => {
    const o = Object.assign({}, s, { v: 4 });
    const pr = isObj(s.progress) ? Object.assign({}, s.progress) : {};
    const done = Object.assign({}, isObj(pr.done) ? pr.done : {});
    // (v3.5 분업) a v3 player keeps every machine that already ran on its own: a station whose land was
    // open gets its operator (the grill as soon as anything was done), a hired gatherer its raw porter
    // (in v3 the gatherer carried straight to the station; now he fills the collection pile)
    const anyDone = Object.keys(done).some((k) => done[k] === true);
    for (const w in LINE_STATION) {
      const st = LINE_STATION[w], zone = STATION_ZONE[st];
      if (zone ? done[zone] === true : anyDone) done['op_' + st] = true;
      if (done['hire_' + w] === true) { done['op_' + st] = true; done['raw_' + st] = true; }
    }
    const sites = isObj(s.sites) ? s.sites : {};
    // (a toolsmith / cannery that was built or being built in v3 worked by itself there: it keeps that)
    for (const id in sites) { const d = sites[id]; if (isObj(d) && (d.b === 'toolsmith' || d.b === 'cannery')) done['op_' + d.b] = true; }
    pr.done = done;
    o.progress = pr;
    return o;
  },
  // v3.5 -> v4 (이웃 마을): nothing else changes — the v4 state starts fresh when the rail strip opens (a v3.5
  // save with the east coast open gets the rail strip and the ruined station on load; sanitizeSave does that)
  4: (s) => Object.assign({}, s, { v: 5 }),
  // v4 -> v4.1 (서쪽 땅 · 마을회관 · 큰 식당): the west strip lies at negative x, west of everything that was there
  // (world.js WORLD.left), so no position in an old save moves — the chief, every site, the residents stay where
  // they were. The strip is open from the start; its south end opens with the south fields (Territory openWith).
  // Settlers, the hall and the restaurant start fresh (the c1 block).
  5: (s) => Object.assign({}, s, { v: 6 }),
};
const LINE_STATION = { fisherman: 'grill', lumberjack: 'sawmill', farmer: 'bakery', miner: 'smelter', hunter: 'smokehouse' };
const STATION_ZONE = { grill: null, sawmill: 'zone_forest', bakery: 'zone_farm', smelter: 'zone_mine', smokehouse: 'zone_hunt' };
const PILE_IDS = ['fish', 'log', 'wheat', 'ore', 'meat'];

/**
 * Validate a loaded save so a corrupted or hand-edited value can never brick the game:
 * every number is finite and in range, lists are lists, unknown item types are dropped.
 */
export function sanitizeSave(raw) {
  if (!isObj(raw)) return null;
  const s = {};
  s.v = SAVE_VERSION;
  s.coins = count(raw.coins, 1e12);
  const pr = isObj(raw.progress) ? raw.progress : {};
  const up = isObj(pr.up) ? pr.up : {};
  s.progress = {
    done: flags(pr.done),
    paid: counts(pr.paid),
    up: { capacity: count(up.capacity, 99), speed: count(up.speed, 99) },
    celebrated: pr.celebrated === true,
    hints: flags(pr.hints),
    seen: flags(pr.seen),
    flags: flags(pr.flags),
    celebrated3: pr.celebrated3 === true,
    got: {},
  };
  if (isObj(pr.got)) for (const id in pr.got) if (/^[a-z0-9_]{1,40}$/.test(id) && isObj(pr.got[id])) s.progress.got[id] = counts(pr.got[id], TOOLS);
  s.stations = {};
  if (isObj(raw.stations)) for (const id in raw.stations) { const st = raw.stations[id]; if (isObj(st)) s.stations[id] = { i: count(st.i, 1000), o: count(st.o, 1000) }; }
  const shop = (o, types) => (isObj(o) ? { stock: counts(o.stock, types), cash: count(o.cash, 1e9) } : null);
  s.market = shop(raw.market, FOODS);
  s.trade = shop(raw.trade, GOODS);
  const p = isObj(raw.player) ? raw.player : {};
  const x = num(p.x, NaN), y = num(p.y, NaN);
  s.player = {
    x: Number.isFinite(x) ? x : undefined,
    y: Number.isFinite(y) ? y : undefined,
    stack: Array.isArray(p.stack) ? p.stack.filter((k) => typeof k === 'string' && ITEMS.indexOf(k) >= 0).slice(0, 200) : [],
  };
  // (v2) village life: who moved in (character keys), snowman stage; (v3) who waits for a house
  const lf = isObj(raw.life) ? raw.life : null;
  if (lf) {
    const keys = (v) => (Array.isArray(v) ? Array.from(new Set(v.filter((k) => typeof k === 'string' && /^[a-z0-9_]{1,40}$/.test(k)))).slice(0, 80) : null);
    const moved = keys(lf.moved), waiting = keys(lf.waiting);
    s.life = { moved: moved || undefined, snowman: Math.max(0, Math.min(3, Math.floor(num(lf.snowman, 0)))) };
    if (!s.life.moved) delete s.life.moved;
    if (waiting) s.life.waiting = waiting;
  }
  // (v3) the land that is open, construction sites, the new buildings' stock
  s.territory = {};
  if (isObj(raw.territory)) for (const r of REGIONS) if (raw.territory[r] === true) s.territory[r] = true;
  // (v4-A) the rail strip opens together with the east coast
  if (s.territory.east) s.territory.rail = true;
  s.sites = {};
  if (isObj(raw.sites)) {
    for (const id in raw.sites) {
      const d = raw.sites[id];
      if (!/^[a-z0-9_]{1,40}$/.test(id) || !isObj(d) || BUILDINGS.indexOf(d.b) < 0 || SITE_STATES.indexOf(d.st) < 0) continue;
      s.sites[id] = { b: d.b, st: d.st, got: counts(d.got, MATERIALS), t: Math.max(0, Math.min(600, num(d.t, 0))) };
    }
  }
  const v3 = isObj(raw.v3) ? raw.v3 : {};
  const ws = isObj(v3.workshops) ? v3.workshops : {};
  const wso = {};
  for (const k of ['toolsmith', 'cannery']) if (isObj(ws[k])) wso[k] = { ins: counts(ws[k].ins, ['item_plank', 'item_ingot', 'item_fish_raw', 'item_fish_big']), outs: counts(ws[k].outs, STORE_GOODS) };
  s.v3 = {
    warehouse: isObj(v3.warehouse) ? counts(v3.warehouse, ITEMS) : undefined,
    food: isObj(v3.food) ? { on: v3.food.on === true, food: counts(v3.food.food, MINER_FOOD) } : undefined,
    dock: isObj(v3.dock) ? { level: count(v3.dock.level, 2), catch: counts(v3.dock.catch, FISH) } : undefined,
    workshops: wso,
    store: isObj(v3.store) ? { stock: counts(v3.store.stock, STORE_GOODS), cash: count(v3.store.cash, 1e9) } : undefined,
  };
  // (v3.5) the collection piles, the dog's affection
  const lb = isObj(raw.labour) ? raw.labour : {};
  s.labour = { piles: {} };
  if (isObj(lb.piles)) for (const k of PILE_IDS) if (k in lb.piles) s.labour.piles[k] = count(lb.piles[k], 500);
  const dg = isObj(raw.dog) ? raw.dog : {};
  s.dog = { love: Math.max(0, Math.min(100, num(dg.love, 0))), gifts: count(dg.gifts, 1e6), tricks: count(dg.tricks, 1e6), treats: count(dg.treats, 3), cd: {} };
  if (isObj(dg.cd)) for (const k of ['treat', 'play', 'pet']) if (k in dg.cd) s.dog.cd[k] = Math.max(0, Math.min(3600, num(dg.cd[k], 0)));
  // ---- (v4-A) the v4 block: always kept (also while v4 is not running); BUILD-B's sanitizeV4 takes over its own keys
  const v4 = sanitizeV4(raw.v4);
  if (v4) s.v4 = v4;
  // ---- (v4-C) settlers, the town hall's tax box, the big restaurant's pantry / cash
  const c1 = sanitizeC1(raw.c1);
  if (c1) s.c1 = c1;
  // (v4-C) the south end of the west strip opens with the south fields
  if (s.territory.south) s.territory.west_s = true;
  return s;
}

/** (v4-C) the civic block: counts clamped, unknown foods dropped (the restaurant's pantry holds cooked food only) */
export function sanitizeC1(raw) {
  if (!isObj(raw)) return null;
  const C = (BALANCE.civic || {});
  const R = C.restaurant || {}, Hh = C.hall || {};
  const o = { settlers: count(raw.settlers, 500), settleT: Math.max(0, Math.min(3600, num(raw.settleT, 0))) };
  if (isObj(raw.hall)) o.hall = { tax: count(raw.hall.tax, Math.max(1, Math.floor(num(Hh.taxCap, 1500)))), acc: Math.max(0, Math.min(1000, num(raw.hall.acc, 0))) };
  if (isObj(raw.rest)) {
    const max = Math.max(1, Math.floor(num(R.pantryMax, 30)));
    const pantry = {};
    if (isObj(raw.rest.pantry)) for (const f of FOODS) if (f in raw.rest.pantry) pantry[f] = count(raw.rest.pantry[f], max);
    o.rest = { pantry, cash: count(raw.rest.cash, 1e9), served: count(raw.rest.served, 1e9) };
  }
  return o;
}

/**
 * (v4-B, docs/v4_plan.md §12) the v4 save block: every field checked, unknown lots / shops dropped, counts
 * clamped. Always kept (also while the neighbours are not running yet: Game.serialize passes it through).
 */
export function sanitizeV4(raw) {
  if (!isObj(raw)) return null;
  const o = { v: 1 };
  const ck = isObj(raw.clock) ? raw.clock : {};
  o.clock = { t: Math.max(0, Math.min(3600, num(ck.t, 200))), day: count(ck.day, 1e6), on: ck.on === true };
  const tw = isObj(raw.town) ? raw.town : {};
  o.town = {
    seed: Math.max(0, Math.min(4294967295, Math.floor(num(tw.seed, 2611)))),
    open: tw.open === true,
    extra: Array.isArray(tw.extra) ? tw.extra.filter((e) => Array.isArray(e) && e.length >= 2 && Number.isFinite(e[0]) && typeof e[1] === 'string' && /^[a-z]{1,20}$/.test(e[1])).slice(0, 64).map((e) => [count(e[0], 999), String(e[1]).slice(0, 20), typeof e[2] === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(e[2]) ? e[2] : null]) : [],
    regulars: Array.isArray(tw.regulars) ? tw.regulars.filter((e) => Array.isArray(e) && Number.isFinite(e[0]) && Number.isFinite(e[1])).slice(0, 40).map((e) => [count(e[0], 999), count(e[1], 999)]) : [],
  };
  const V = (BALANCE.v4 && BALANCE.v4.founding) || { shops: {} };
  const SHOPS = V.shops || {};
  const LOTS = (WORLD.v4 && WORLD.v4.lots) || {};
  // the order board
  const od = isObj(raw.orders) ? raw.orders : {};
  const cards = [];
  for (const c of Array.isArray(od.cards) ? od.cards.slice(0, 3) : []) {
    if (!isObj(c)) continue;
    const shop = typeof c.shop === 'string' && SHOPS[c.shop] ? c.shop : null;
    if (c.shop && !shop) continue;
    const need = counts(c.need, ITEMS);
    for (const k in need) if (need[k] < 1 || need[k] > 999) delete need[k];
    if (!shop && !Object.keys(need).length) continue;
    const got = counts(c.got, Object.keys(shop ? SHOPS[shop].need || {} : need));
    cards.push({ shop, need, got, idle: Math.max(0, Math.min(3600, num(c.idle, 0))) });
  }
  o.orders = {
    cards,
    done: Array.isArray(od.done) ? od.done.filter((k, i, a) => typeof k === 'string' && SHOPS[k] && a.indexOf(k) === i).slice(0, 5) : [],
    standing: count(od.standing, 1e6),
  };
  o.cargo = counts(raw.cargo, ITEMS);
  for (const k in o.cargo) o.cargo[k] = Math.min(999, o.cargo[k]);
  // founded shops (lot ids validated against WORLD.v4.lots, one shop of a kind)
  o.shops = {};
  const seen = new Set();
  if (isObj(raw.shops)) {
    for (const id in raw.shops) {
      const d = raw.shops[id];
      if (!LOTS[id] || !isObj(d) || typeof d.shop !== 'string' || !SHOPS[d.shop] || seen.has(d.shop)) continue;
      seen.add(d.shop);
      const st = ['wait', 'build', 'ribbon', 'open'].indexOf(d.st) >= 0 ? d.st : 'wait';
      const stock = counts(d.stock, (SHOPS[d.shop].sells || []).filter((k) => ITEMS.indexOf(k) >= 0));
      for (const k in stock) stock[k] = Math.min(999, stock[k]);
      o.shops[id] = { shop: d.shop, st, t: Math.max(0, Math.min(600, num(d.t, 0))), stock };
    }
  }
  // the carpenter's houses
  o.houses = {};
  if (isObj(raw.houses)) {
    for (const id in raw.houses) {
      const d = raw.houses[id];
      if (!LOTS[id] || o.shops[id] || !isObj(d)) continue;
      o.houses[id] = { st: ['site', 'build', 'done'].indexOf(d.st) >= 0 ? d.st : 'site', got: { item_plank: count(isObj(d.got) ? d.got.item_plank : 0, 999) }, t: Math.max(0, Math.min(600, num(d.t, 0))), look: Math.max(0, Math.min(3, Math.floor(num(d.look, 0)))) };
    }
  }
  const cap = Math.max(1, Math.floor(num(BALANCE.v4 && BALANCE.v4.rent && BALANCE.v4.rent.cap, 2000)));
  o.cash = count(raw.cash, 1e9);
  o.rentAcc = count(raw.rentAcc, cap);
  const hp = isObj(raw.happy) ? raw.happy : {};
  const hn = count(hp.n, 200);
  o.happy = { n: hn, sum: Math.max(0, Math.min(hn, num(hp.sum, 0))) };
  o.rank = raw.rank === 2 ? 2 : 1;
  o.porters = count(raw.porters, 2);
  return o;
}

/** (v3.5 review) keep a copy of a save the game cannot use: the backup slot, or a second slot when the
 *  backup already holds a different one (an older copy is never overwritten by a newer unreadable save) */
function keepCopy(st, raw) {
  if (!raw) return;
  const b = st.getItem(BACKUP_KEY);
  if (!b) st.setItem(BACKUP_KEY, raw);
  else if (b !== raw) st.setItem(BACKUP_KEY + '.2', raw);
}

export const Save = {
  /** the saved game (sanitized), or null for a fresh start. Other versions are migrated or backed up first. */
  load() {
    let s = readJSON(SAVE_KEY);
    if (!s || typeof s !== 'object') {
      // (v3.5 review) a save that is there but cannot be read (cut off, not JSON): keep a copy before the
      // next autosave overwrites it
      try { const st = getStore(); const raw = st && st.getItem(SAVE_KEY); if (raw) keepCopy(st, raw); } catch (e) { /* ignore */ }
      return null;
    }
    let v = typeof s.v === 'number' ? s.v : -1;
    while (v !== SAVE_VERSION && MIGRATE[v]) { try { s = MIGRATE[v](s); v = s.v; } catch (e) { break; } }
    if (v !== SAVE_VERSION) {
      // unknown / future version: keep a copy before the next autosave overwrites it
      try { const st = getStore(); if (st) keepCopy(st, st.getItem(SAVE_KEY)); } catch (e) { /* ignore */ }
      return null;
    }
    return sanitizeSave(s);
  },
  write(state) {
    // "Start over" on the crash card: the page is reloading and the crashed game's autosave
    // (pagehide / visibilitychange) must not put the old progress back
    if (typeof window !== 'undefined' && window.__FV_NO_SAVE) return false;
    const ok = writeJSON(SAVE_KEY, Object.assign({ v: SAVE_VERSION, t: Date.now() }, state));
    this.lastWriteOk = ok;
    return ok;
  },
  lastWriteOk: true,
  clear() { removeKey(SAVE_KEY); },
  /** move a save that crashed the game aside (kept for debugging) */
  quarantine() {
    try { const st = getStore(); if (!st) return; const raw = st.getItem(SAVE_KEY); if (raw) st.setItem(BAD_KEY, raw); st.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
  },
};

export const Settings = {
  data: { sound: true, music: true, lang: null, zoom: null, daynight: true, gfx: 'auto' },
  load() {
    const s = readJSON(SETTINGS_KEY);
    if (s && typeof s === 'object' && !Array.isArray(s)) {
      this.data.sound = s.sound !== false;
      this.data.music = s.music !== false;
      this.data.lang = s.lang === 'ko' || s.lang === 'en' ? s.lang : null;
      const z = typeof s.zoom === 'number' ? s.zoom : NaN;
      this.data.zoom = Number.isFinite(z) && z > 0.2 && z < 5 ? z : null;
      this.data.daynight = s.daynight !== false;     // (v4-A) 낮과 밤
      this.data.gfx = s.gfx === 'high' || s.gfx === 'low' ? s.gfx : 'auto';     // (v4-B) 그래픽: 자동 / 선명하게 / 가볍게
    }
    return this.data;
  },
  save() { writeJSON(SETTINGS_KEY, this.data); },
};
