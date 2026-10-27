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

export const SAVE_VERSION = 7;
export const BACKUP_KEY = 'frostVillage.save.backup';
export const BAD_KEY = 'frostVillage.save.v1.bad';

// (v3) what a construction site may hold, and the land
// (v4-A) + the repaired station (plot r_station) and the rail strip / neighbour town
// (v4-C) + the town hall, the big restaurant, the decor; the west strip (open from the start) and its south end
const BUILDINGS = ['toolsmith', 'warehouse', 'boathouse', 'cannery', 'store', 'house_a', 'house_b', 'house_c', 'watchtower', 'station',
  'town_hall', 'big_restaurant', 'deco_snowman', 'deco_bench', 'deco_lamp', 'deco_flowers', 'deco_rink', 'deco_playground', 'deco_fountain',
  // ---- (v4.2) 촌장 사무실, 서리 은행, 서리 물류창고 (their sites: ids v42_office / v42_bank / v42_depot)
  'chief_office', 'bank42', 'depot42'];
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
  // v4.1 -> v4.2 (촌장의 하루): additive — every v4.2 system starts empty (the v42 block, the bank / logistics slices).
  // The dock backlog (v4.growth.cargo: each crate was paid when it was accepted, it was only a picture) is capped to
  // two train loads; the boathouse catch and the collection piles are clamped by sanitizeSave / the restores.
  6: (s) => {
    const o = Object.assign({}, s, { v: 7 });
    if (isObj(s.v4) && isObj(s.v4.cargo)) {
      const cap = 2 * Math.max(1, Math.floor(num(BALANCE.v42 && BALANCE.v42.freight && BALANCE.v42.freight.perTrain, 56)));
      const cargo = {};
      let left = cap;
      for (const k of Object.keys(s.v4.cargo).sort((a, b) => num(s.v4.cargo[b], 0) - num(s.v4.cargo[a], 0))) {
        const n = Math.min(left, count(s.v4.cargo[k], 999));
        if (n > 0) { cargo[k] = n; left -= n; }
      }
      o.v4 = Object.assign({}, s.v4, { cargo });
    }
    return o;
  },
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
  // (v4-C2) the chat record's id (ChatSave)
  if (typeof raw.cid === 'string' && /^[a-z0-9]{4,16}$/.test(raw.cid)) s.cid = raw.cid;
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
    // ((v4 review L3) a building on a plot that cannot take it (a town hall on a small plot, a station on the hall's
    //  plot) or a second one of a unique building (two town halls) is dropped; finished ones are kept first)
    const XL_ONLY = ['town_hall', 'big_restaurant'], UNIQ = ['town_hall', 'big_restaurant', 'station', 'toolsmith', 'warehouse', 'boathouse', 'cannery', 'store'];
    const seenU = new Set(), plots = WORLD.plots || {};
    const ids = Object.keys(raw.sites).sort((a, b) => (isObj(raw.sites[b]) && raw.sites[b].st === 'done' ? 1 : 0) - (isObj(raw.sites[a]) && raw.sites[a].st === 'done' ? 1 : 0));
    for (const id of ids) {
      const d = raw.sites[id];
      if (!/^[a-z0-9_]{1,40}$/.test(id) || !isObj(d) || BUILDINGS.indexOf(d.b) < 0 || SITE_STATES.indexOf(d.st) < 0) continue;
      const p = plots[id];
      if (p && ((p.only && d.b !== p.only) || (!p.only && d.b === 'station') || (XL_ONLY.indexOf(d.b) >= 0 && p.size !== 'XL'))) continue;
      if (UNIQ.indexOf(d.b) >= 0) { if (seenU.has(d.b)) continue; seenU.add(d.b); }
      s.sites[id] = { b: d.b, st: d.st, got: counts(d.got, MATERIALS), t: Math.max(0, Math.min(600, num(d.t, 0))) };
    }
  }
  const v3 = isObj(raw.v3) ? raw.v3 : {};
  const ws = isObj(v3.workshops) ? v3.workshops : {};
  const wso = {};
  // ((v4.2.1) the cannery's raw meat (the meat-can recipe) is kept; meat cans are in STORE_GOODS)
  for (const k of ['toolsmith', 'cannery']) if (isObj(ws[k])) wso[k] = { ins: counts(ws[k].ins, ['item_plank', 'item_ingot', 'item_fish_raw', 'item_fish_big', 'item_meat_raw']), outs: counts(ws[k].outs, STORE_GOODS) };
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
  // ---- (v4.2) the v42 block, and the module slices v4.2 writes in the modules' own formats (v5 bank, v8 logistics),
  // kept through LOCAL copies of the modules' keep-rules (no runtime import of module code; save_v42.mjs checks that
  // both slices pass the modules' own sanitizers unchanged)
  const v42 = sanitizeV42(raw.v42);
  if (v42) s.v42 = v42;
  const bank = keepBank(raw.bank);
  if (bank) s.bank = bank;
  const lgx = keepLogistics(raw.logistics);
  if (lgx) s.logistics = lgx;
  // the boathouse catch never comes back above its cap (v4.1 saves restored it to 103 %)
  if (s.v3 && s.v3.dock && s.v3.dock.catch) {
    let left = 30;
    for (const k of FISH) if (k in s.v3.dock.catch) { s.v3.dock.catch[k] = Math.min(left, s.v3.dock.catch[k]); left -= s.v3.dock.catch[k]; }
  }
  return s;
}

// ===================================================================== (v4.2) docs/v42_plan.md §10
const LINES5 = ['grill', 'sawmill', 'bakery', 'smelter', 'smokehouse'];
// ((v4.2 touch §13) 짐꾼 2 also for the 대장간 / 통조림 공장 / 배 창고 lines)
const LINES8 = LINES5.concat(['toolsmith', 'cannery', 'dock']);
const STAFF = ['sem', 'ttal', 'bok', 'chong'];
const u32 = (v) => { const n = num(v, 0); return Number.isFinite(n) && n >= 0 ? Math.floor(n) >>> 0 : 0; };
const itemCounts = (v, max = 999) => { const o = {}; if (isObj(v)) for (const k of ITEMS) if (k in v) { const n = count(v[k], max); if (n > 0) o[k] = n; } return o; };
const siteOf = (v) => (isObj(v) ? { got: counts(v.got, MATERIALS), t: Math.max(0, Math.min(600, num(v.t, 0))) } : undefined);
const st012 = (v) => Math.max(0, Math.min(2, Math.floor(num(v, 0))));
const TPL = /^[a-z][a-z0-9_]{0,23}$/;
/** the v42 block: ints clamped, unknown items / lines / templates dropped, seeds uint32, arrays capped; never throws */
export function sanitizeV42(raw) {
  try {
    if (!isObj(raw)) return null;
    const o = { v: 1 };
    const of = isObj(raw.office) ? raw.office : {};
    const staff = Array.isArray(of.staff) ? of.staff.slice(0, 4).map(u32) : [];
    while (staff.length < 4) staff.push(0);
    o.office = { st: st012(of.st), staff, bag: count(of.bag, 1e9), safe: count(of.safe, 1e9), log: [] };
    if (of.site !== undefined) { const si = siteOf(of.site); if (si) o.office.site = si; }
    if (of.bankSt !== undefined) o.office.bankSt = st012(of.bankSt);
    // (CODE-1 review fixes) a partial payment toward the next hire pad; today's income bars [day, { source: coins }]
    if (of.hirePaid !== undefined) { const hp = count(of.hirePaid, 1e6); if (hp > 0) o.office.hirePaid = hp; }
    if (Array.isArray(of.inc) && isObj(of.inc[1])) { const inc = {}; let n = 0; for (const k in of.inc[1]) { if (n >= 12) break; if (/^[a-z0-9_]{1,12}$/.test(k)) { const c = count(of.inc[1][k], 1e9); if (c > 0) { inc[k] = c; n++; } } } if (n) o.office.inc = [count(of.inc[0], 1e6), inc]; }
    if (Array.isArray(of.log)) o.office.log = of.log.filter((r) => Array.isArray(r) && r.length >= 3 && typeof r[1] === 'string' && /^[a-z0-9_]{1,16}$/.test(r[1])).slice(-8).map((r) => [count(r[0], 1e6), r[1], Math.max(-1e9, Math.min(1e9, Math.round(num(r[2], 0)))), Math.round(Math.max(0, Math.min(1439, num(r[3], 0))))]);
    const nw = isObj(raw.news) ? raw.news : {};
    o.news = { day: Math.max(-1, Math.min(1e6, Math.floor(num(nw.day, -1)))), papers: [] };
    if (Array.isArray(nw.papers)) o.news.papers = nw.papers.filter((p) => Array.isArray(p) && p.length >= 2 && Array.isArray(p[1])).slice(-3).map((p) => [count(p[0], 1e6), p[1].filter((h) => Array.isArray(h) && typeof h[0] === 'string' && TPL.test(h[0])).slice(0, 5).map((h) => [h[0], Math.round(Math.max(-1e9, Math.min(1e9, num(h[1], 0)))), Math.round(Math.max(-1e9, Math.min(1e9, num(h[2], 0))))])]);
    const lt = isObj(raw.letters) ? raw.letters : {};
    o.letters = { seq: count(lt.seq, 1e9), inbox: [], once: [] };
    if (Array.isArray(lt.inbox)) o.letters.inbox = lt.inbox.filter((r) => Array.isArray(r) && r.length >= 4 && typeof r[1] === 'string' && TPL.test(r[1])).slice(-6).map((r) => [count(r[0], 1e9), r[1], Math.max(0, Math.min(3, Math.floor(num(r[2], 0)))), count(r[3], 1e6)]);
    if (Array.isArray(lt.once)) o.letters.once = Array.from(new Set(lt.once.filter((k) => typeof k === 'string' && TPL.test(k)))).slice(0, 16);
    if (lt.nextT !== undefined) o.letters.nextT = Math.max(0, Math.min(1e6, num(lt.nextT, 0)));
    if (lt.happy !== undefined) o.letters.happy = count(lt.happy, 99);
    if (Array.isArray(lt.tg)) o.letters.tg = [Math.round(Math.max(0, Math.min(3600, num(lt.tg[0], 0)))), Math.round(Math.max(0, Math.min(86400, num(lt.tg[1], 0)))), count(lt.tg[2], 99)];
    if (lt.bk !== undefined && num(lt.bk, -1) >= 0) o.letters.bk = count(lt.bk, 1e6);
    o.up = {};
    if (isObj(raw.up)) for (const k of LINES5) if (raw.up[k] === 1 || raw.up[k] === true) o.up[k] = 1;
    o.p2 = Array.isArray(raw.p2) ? Array.from(new Set(raw.p2.filter((k) => LINES8.indexOf(k) >= 0))).slice(0, 8) : [];
    const tr = isObj(raw.train) ? raw.train : {};
    o.train = { stage: tr.stage === 2 ? 2 : 1, big: tr.big ? 1 : 0, labels: count(tr.labels, 99) };
    const fr = isObj(raw.freight) ? raw.freight : {};
    o.freight = { dock: itemCounts(fr.dock, 9999), cars: itemCounts(fr.cars, 999) };
    const dp = isObj(raw.depot) ? raw.depot : {};
    o.depot = { st: st012(dp.st), sleighs: dp.sleighs === 2 ? 2 : 1, load: itemCounts(dp.load, 999), porters34: Math.max(0, Math.min(2, Math.floor(num(dp.porters34, 0)))), sales: [0, 0, 0] };
    if (dp.site !== undefined) { const si = siteOf(dp.site); if (si) o.depot.site = si; }
    if (Array.isArray(dp.sales)) o.depot.sales = [count(dp.sales[0], 1e6), count(dp.sales[1], 1e9), count(dp.sales[2], 1e12)];
    const lg = isObj(raw.ledger) ? raw.ledger : {};
    o.ledger = { full: {} };
    if (isObj(lg.full)) { let n = 0; for (const k in lg.full) { if (n >= 40) break; if (/^[a-z0-9_:]{1,32}$/.test(k)) { o.ledger.full[k] = Math.max(0, Math.min(1e6, Math.round(num(lg.full[k], 0)))); n++; } } }
    const sn = isObj(raw.seen) ? raw.seen : {};
    o.seen = {};
    for (const k of ['whatsNew', 'pickupTip', 'trainNew', 'halo']) if (sn[k]) o.seen[k] = 1;
    o.seen.cheer = count(sn.cheer, 99);
    for (const k of ['p2', 'up', 'big', 'p34', 'sl2', 'tb']) if (isObj(sn[k])) { o.seen[k] = {}; for (const q in sn[k]) if (/^[a-z0-9_]{1,16}$/.test(q) && sn[k][q]) o.seen[k][q] = 1; }
    if (isObj(raw.full)) { o.full = {}; for (const k of LINES8) if (k in raw.full) o.full[k] = Math.max(0, Math.min(3600, Math.round(num(raw.full[k], 0)))); }
    if (raw.sleighWait !== undefined) { const w = Math.max(0, Math.min(3600, Math.round(num(raw.sleighWait, 0)))); if (w > 0) o.sleighWait = w; }
    // (partial payments on the offered upgrade pads: no coin is lost over a reload)
    if (isObj(raw.offerPaid)) { o.offerPaid = {}; let n = 0; for (const k in raw.offerPaid) { if (n >= 8) break; if (/^[a-z0-9_]{1,24}$/.test(k)) { const c = count(raw.offerPaid[k], 1e6); if (c > 0) { o.offerPaid[k] = c; n++; } } } }
    // ((v4.2 touch §13, additive) the 창고 직원 who came beyond the base, the village's making a minute, seconds since the last)
    if (isObj(raw.crew)) {
      const cw = { n: count(raw.crew.n, 12) };
      const rt = count(raw.crew.rate, 1e5);
      if (rt > 0) cw.rate = rt;
      const si = Math.round(Math.max(0, Math.min(600, num(raw.crew.since, 0))));
      if (si > 0) cw.since = si;
      o.crew = cw;
    }
    return o;
  } catch (e) { return null; }
}

/**
 * (v4.2) a LOCAL copy of src/bank/save.js sanitizeBank's keep-rules (v5 format: { v, open, sv, ld, tk, ... }). v4.2 writes
 * { v: 1, open: 1, sv: 0, ld: -1, tk: 1 }; a slice v5 wrote is kept as its own rules keep it (save_v42.mjs compares).
 */
const BANK_OPS = ['deposit', 'withdraw', 'interest', 'loan', 'repay', 'premium', 'claim', 'waive'];
export function keepBank(raw) {
  try {
    if (!isObj(raw) || (raw.v !== undefined && raw.v !== 1 && raw.v !== 2)) return null;
    const fin = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);
    const int = (v, lo, hi, d) => { const n = fin(v, lo, hi); return n === undefined ? d : Math.floor(n); };
    const s = { v: 1, open: raw.open ? 1 : 0, sv: int(raw.sv, 0, 1e9, 0), ld: int(raw.ld, -1, 1e7, -1), tk: int(raw.tk, 1, 999, 1) };
    if (raw.v6) s.v6 = 1;
    if (raw.so) s.so = 1;
    const t5 = fin(raw.t5, -1e9, 1e10); if (t5 !== undefined) s.t5 = Math.round(t5);
    if (isObj(raw.ln)) {
      const l = raw.ln, left = int(l.l, 0, 1e9, 0);
      if (left > 0) s.ln = { a: int(l.a, 0, 1e9, 0), l: left, f: Math.min(left, int(l.f, 0, 1e9, 0)), t0: Math.round(fin(l.t0, -1e9, 1e10) || 0), d0: int(l.d0, 0, 1e7, 0), rs: int(l.rs, 0, 9, 0), ps: l.ps ? 1 : 0, k: l.k === 'ceremony' ? 'ceremony' : 'build' };
    }
    if (Array.isArray(raw.rw)) {
      const rw = raw.rw.filter((r) => Array.isArray(r) && r.length === 4 && BANK_OPS.indexOf(r[1]) >= 0 && fin(r[0], 0, 1e7) !== undefined && fin(r[2], -1e9, 1e9) !== undefined && fin(r[3], -1e10, 1e10) !== undefined)
        .slice(-8).map((r) => [Math.floor(r[0]), r[1], Math.round(r[2]), Math.round(r[3])]);
      if (rw.length) s.rw = rw;
    }
    if (Array.isArray(raw.ins)) {
      const seen = new Set(), ins = [];
      for (const r of raw.ins) {
        if (!Array.isArray(r) || typeof r[0] !== 'string' || !r[0] || r[0].length > 10 || seen.has(r[0])) continue;
        const c = int(r[1], -1e6, 1e6, 0);
        if (!c) continue;
        seen.add(r[0]);
        ins.push([r[0], c, int(r[2], 0, 999983, 0)]);
        if (ins.length >= 24) break;
      }
      if (ins.length) { s.ins = ins; s.v = 2; }
    }
    return s;
  } catch (e) { return null; }
}

/**
 * (v4.2) a LOCAL copy of src/city/logistics/save.js sanitizeLogistics's keep-rules (v8 format, cap 2 KB): item ids
 * without the `item_` prefix, orders / chains / lv3 / days as v8 keeps them. save_v42.mjs checks the copy agrees.
 */
export function keepLogistics(raw) {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const int = (x, lo, hi, d = 0) => { const n = Number(x); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d; };
    const obj = (q) => (q && typeof q === 'object' && !Array.isArray(q) ? q : {});
    const KEY = /^[a-z][a-z0-9_]{0,23}$/, ID = /^[A-Za-z0-9_:.-]{1,40}$/, FL = /^[syh][vwc][pkrg][s]?[3m]?$/;
    const items = (q, max, lim = 40) => { const out = {}; let n = 0; for (const k of Object.keys(obj(q)).sort()) { if (n >= lim) break; if (!KEY.test(k)) continue; const v = int(q[k], 0, max, 0); if (v > 0) { out[k] = v; n++; } } return out; };
    const out = { v: 1, open: raw.open ? 1 : 0, gift: raw.gift ? 1 : 0, tut: raw.tut ? 1 : 0, day: int(raw.day, -1, 1e7, -1), seq: int(raw.seq, 0, 1e9, 0),
      stock: items(raw.stock, 9999), orders: [], cash: int(raw.cash, 0, 1e8, 0), chains: [], lv3: [], days: [], made: [0, 0], tot: [0, 0, 0] };
    const seen = new Set();
    for (const r of Array.isArray(raw.orders) ? raw.orders : []) {
      if (out.orders.length >= 12) break;
      if (!Array.isArray(r) || r.length < 5) continue;
      const [id, to, f] = r;
      if (typeof id !== 'string' || !ID.test(id) || seen.has(id)) continue;
      if (typeof to !== 'string' || !/^(shop|story|home):[A-Za-z0-9_.:+-]{1,40}$/.test(to)) continue;
      if (typeof f !== 'string' || !FL.test(f)) continue;
      const kind = { s: 'shop', y: 'story', h: 'home' }[f[0]];
      if (!to.startsWith(kind + ':')) continue;
      const got = items(r[3], 999, 12), miss = items(r[4], 999, 12);
      if (!Object.keys(got).length && !Object.keys(miss).length) continue;
      seen.add(id);
      out.orders.push([id, to, f, got, miss]);
    }
    for (const c of Array.isArray(raw.chains) ? raw.chains : []) {
      if (out.chains.length >= 6) break;
      if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !ID.test(c.id) || (c.k !== 'f' && c.k !== 'a')) continue;
      if (out.chains.some((q) => q.id === c.id)) continue;
      const okOut = c.k === 'f' ? /^(chair|table|sofa|bed|wardrobe)$/ : /^(radio|stove_iron|washer|fridge|tv_retro)$/;
      out.chains.push({ id: c.id, k: c.k, in: int(c.in, 0, 99, 0), out: (Array.isArray(c.out) ? c.out : []).filter((x) => typeof x === 'string' && okOut.test(x)).slice(0, 8), m: int(c.m, 0, 1e7, 0), r: int(c.r, 0, 1e7, 0) });
    }
    for (const h of Array.isArray(raw.lv3) ? raw.lv3 : []) { if (out.lv3.length >= 32) break; const q = String(h); if (ID.test(q) && out.lv3.indexOf(q) < 0) out.lv3.push(q); }
    for (const d of Array.isArray(raw.days) ? raw.days.slice(0, 10) : []) out.days.push(int(d, 0, 1e6, 0));
    if (Array.isArray(raw.made)) out.made = [int(raw.made[0], 0, 1e7, 0), int(raw.made[1], 0, 1e7, 0)];
    if (Array.isArray(raw.tot)) out.tot = [int(raw.tot[0], 0, 1e8, 0), int(raw.tot[1], 0, 1e10, 0), int(raw.tot[2], 0, 1e9, 0)];
    // the 2 KB cap (v8 fitLogistics): unsettled orders go back to the racks, then the day history shortens
    const len = () => JSON.stringify(out).length;
    while (len() > 2048 && out.orders.length) {
      let k = out.orders.findIndex((r) => r[2].indexOf('s', 3) < 0 && r[2][2] !== 'g');
      if (k < 0) k = out.orders.findIndex((r) => r[2][2] !== 'g');
      if (k < 0) break;
      const r = out.orders.splice(k, 1)[0];
      for (const [it, n] of Object.entries(r[3])) out.stock[it] = Math.min(9999, (out.stock[it] || 0) + n);
    }
    while (len() > 2048 && out.days.length > 1) out.days.pop();
    while (len() > 2048 && out.lv3.length > 8) out.lv3.pop();
    return out;
  } catch (e) { return null; }
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
    // ((v4.2 touch §13, additive) the 테이블 늘리기 level, how long the line waited for a seat, the 서빙 직원 2)
    const levels = Array.isArray((R.tables || {}).costs) ? R.tables.costs.length : 2;
    const tb = count(raw.rest.tables, levels);
    if (tb > 0) o.rest.tables = tb;
    const bt = Math.round(Math.max(0, Math.min(3600, num(raw.rest.busyT, 0))));
    if (bt > 0) o.rest.busyT = bt;
    if (raw.rest.server2 === 1 || raw.rest.server2 === true) o.rest.server2 = 1;
    const sw = Math.round(Math.max(0, Math.min(3600, num(raw.rest.serveWaitT, 0))));
    if (sw > 0) o.rest.serveWaitT = sw;
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
  // ((v4 review) a swapped founding card's delivered goods, waiting for the card to come back)
  if (isObj(od.kept)) {
    const kept = {};
    for (const k in od.kept) if (SHOPS[k] && isObj(od.kept[k])) { const g = counts(od.kept[k], Object.keys(SHOPS[k].need || {})); if (Object.keys(g).length) kept[k] = g; }
    if (Object.keys(kept).length) o.orders.kept = kept;
  }
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

/** a save object as read from storage -> migrated to SAVE_VERSION and sanitized, or null (an unknown / future version).
 *  (마을 옮기기) Save.load and the dry run of a village code (src/core/Transfer.js) both go through here, so a v4.1 / v4.2
 *  save inside a code loads and migrates exactly like a stored one. */
export function migrateSave(s) {
  if (!s || typeof s !== 'object') return null;
  let v = typeof s.v === 'number' ? s.v : -1;
  while (v !== SAVE_VERSION && MIGRATE[v]) { try { s = MIGRATE[v](s); v = s.v; } catch (e) { break; } }
  if (v !== SAVE_VERSION) return null;
  return sanitizeSave(s);
}

export const Save = {
  /** the saved game (sanitized), or null for a fresh start. Other versions are migrated or backed up first. */
  load() {
    const s = readJSON(SAVE_KEY);
    if (!s || typeof s !== 'object') {
      // (v3.5 review) a save that is there but cannot be read (cut off, not JSON): keep a copy before the
      // next autosave overwrites it
      try { const st = getStore(); const raw = st && st.getItem(SAVE_KEY); if (raw) keepCopy(st, raw); } catch (e) { /* ignore */ }
      return null;
    }
    const out = migrateSave(s);
    if (!out) {
      // unknown / future version: keep a copy before the next autosave overwrites it
      try { const st = getStore(); if (st) keepCopy(st, st.getItem(SAVE_KEY)); } catch (e) { /* ignore */ }
      return null;
    }
    return out;
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
  clear() { removeKey(SAVE_KEY); ChatSave.clear(); },
  /** move a save that crashed the game aside (kept for debugging) */
  quarantine() {
    try { const st = getStore(); if (!st) return; const raw = st.getItem(SAVE_KEY); if (raw) st.setItem(BAD_KEY, raw); st.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    // (the chat record is tied to the save by its id: the fresh game gets a new id and never reads it)
  },
};

/**
 * (v4-C2) the resident chat's village (src/chat ChatVillage: memories of the chief, rumours, relations) — part of the
 * game save, kept as its own versioned record next to it so the game's autosave (6 KB, every few seconds) stays
 * small: it is written only when a chat changed it. `cid` ties it to one game save: a new game, a reset or "start
 * over" leaves the old one unread. The chat code validates / migrates the inner record (ChatVillage.deserialize).
 */
export const CHAT_KEY = SAVE_KEY + '.chat';
export const CHAT_RECORD_VERSION = 1;
const CHAT_MAX_CHARS = 600000;       // a damaged / foreign record bigger than this is not read
export const ChatSave = {
  blocked: false,           // a record from a newer game version is there: never overwritten
  load(cid) {
    let raw = null;
    try { const st = getStore(); raw = st && st.getItem(CHAT_KEY); } catch (e) { raw = null; }
    if (!raw || raw.length > CHAT_MAX_CHARS) return null;
    let o = null;
    try { o = JSON.parse(raw); } catch (e) { return null; }
    if (!isObj(o)) return null;
    if (num(o.v, 0) > CHAT_RECORD_VERSION) { this.blocked = true; return null; }
    if (o.v !== CHAT_RECORD_VERSION || typeof o.cid !== 'string' || o.cid !== cid || !isObj(o.chat)) return null;
    return o.chat;
  },
  write(cid, chat) {
    if (this.blocked || (typeof window !== 'undefined' && window.__FV_NO_SAVE)) return false;
    if (typeof cid !== 'string' || !isObj(chat)) return false;
    return writeJSON(CHAT_KEY, { v: CHAT_RECORD_VERSION, cid, t: Date.now(), chat });
  },
  clear() { removeKey(CHAT_KEY); this.blocked = false; },
  bytes() { try { const st = getStore(); const r = st && st.getItem(CHAT_KEY); return r ? r.length : 0; } catch (e) { return 0; } },
};

/** (v4-C2) a new game's chat id (ties the chat record to this save) */
export function newChatId() { return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).slice(-12); }

export const Settings = {
  // (v4-C2) water: '물결 품질' 'high' | 'low' | null (automatic); voice: '주민 목소리' volume 0..1 (0 = off)
  data: { sound: true, music: true, lang: null, zoom: null, daynight: true, gfx: 'auto', water: null, voice: 1,
    // (v4.2) 놀이 tab: 자동 줍기 / 길 안내 / 촌장 후광 / 관망 자동 (s) / 관망 볼거리 / 관망 중 돈 쓰기
    pickup: 'auto', nav: true, halo: true, observeAfter: 60, observeEvents: true, observeSpend: 'none' },
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
      this.data.water = s.water === 'low' || s.water === 'high' ? s.water : null;  // (v4-C2) 물결 품질
      this.data.voice = typeof s.voice === 'number' && s.voice >= 0 && s.voice <= 1 ? s.voice : 1;   // (v4-C2) 주민 목소리
      // ---- (v4.2) 놀이
      this.data.pickup = s.pickup === 'still' || s.pickup === 'off' ? s.pickup : 'auto';
      this.data.nav = s.nav !== false;
      this.data.halo = s.halo !== false;
      this.data.observeAfter = [0, 30, 60, 120].indexOf(s.observeAfter) >= 0 ? s.observeAfter : 60;
      this.data.observeEvents = s.observeEvents !== false;
      this.data.observeSpend = s.observeSpend === 'hire' ? 'hire' : 'none';
    }
    return this.data;
  },
  // ((v4.2.1) blocked like Save.write / ChatSave.write while the page reloads after "Start over" or 마을 옮기기:
  //  a late zoom / water-quality save must not put the old settings back over the moved village's)
  save() { if (typeof window !== 'undefined' && window.__FV_NO_SAVE) return; writeJSON(SETTINGS_KEY, this.data); },
};
