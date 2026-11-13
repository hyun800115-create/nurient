// Save / settings persistence. Every localStorage access is wrapped in try/catch
// (private mode, sandboxed iframes and full quotas must never crash the game).

import { ITEMS, FOODS, GOODS, STORE_GOODS, MINER_FOOD, MATERIALS, FISH } from '../data/items.js';
// ---- (v4-B) the v4 block is checked against the lots and the shops it may name
import { WORLD } from '../data/world.js';
import { BALANCE } from '../data/balance.js';
// ---- (v4.3 마을 깃발) the flag's keep-rule
import { sanitizeFlag } from '../flag/design.js';
// ---- (v4.3 step B, S) the content level and the pre-B copy's key (plain data: src/data/ids43.js)
import { LV, PRE43_KEY, WORKSHOP_PLOT43 } from '../data/ids43.js';
// ---- (v4.3 step B, S4) R43: the one-time move of an old village onto plot table v2 (pure JSON, before sanitizeSave)
import { needsRemap, remap43, check43, check43b } from './Remap43.js';

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

export const SAVE_VERSION = 8;
export const BACKUP_KEY = 'frostVillage.save.backup';
export const BAD_KEY = 'frostVillage.save.v1.bad';

// ---- (v4.3 step B, S1 — docs/redesign_v43/stepB/map_save.md §4.1, §4.7) the content level. SAVE_VERSION stays 8 (the
//  shape of the save); `lv` says which content the village was saved with: 43 in every step-B build, 44–46 in v4.4–v4.6,
//  50 in v5.0. Every write is stamped { v, lv, t } in that order (stamp), so the head of a stored save tells its level
//  without parsing it (storedIsNewer). A save from a newer build (v > 8, or lv > 43; a missing lv counts as ≤ 43) is never
//  loaded, never written over and never moved aside: the game holds every writer and says so (Save.hold, SaveHoldCard).
//  PRE43_KEY (frostVillage.save.backup.pre43, written by R43 before the first remap) is under BACKUP_KEY: it never travels
//  in a 마을 옮기기 code and 불러오기 never removes it (Transfer.isGameKey)
export { LV, PRE43_KEY };
/** a save object from a newer build (V-N8: v > SAVE_VERSION or lv > LV; numeric strings count, garbage counts as 0) */
export function isNewerSave(o) { return isObj(o) && (num(o.v, 0) > SAVE_VERSION || num(o.lv, 0) > LV); }
/** the save as written: { v, lv, t } first (in that order), then the game's state */
export function stamp(state) { return Object.assign({ v: SAVE_VERSION, lv: LV, t: Date.now() }, state); }
// the head every Save.write since step B writes ('{"v":8,"lv":43,"t":…'), and every older one ('{"v":7,"t":…'). An `lv`
// right after `v` that is not a plain 1–4 digit number ("46", 43.5, 12345) does not match: the whole text is parsed, so
// the write guard and Save.load (isNewerSave) always agree
const HEAD_RE = /^\{"v":(\d{1,4})(?:,"lv":(\d{1,4})[,}]|,(?!"lv")|\})/;
/** (S1) is this stored save text from a newer build? The head decides when it is there; otherwise the whole text is
 *  parsed (a save written by hand or by a test). Text that is not a save is not newer. Never throws */
export function storedIsNewer(raw) {
  if (typeof raw !== 'string' || !raw) return false;
  const m = HEAD_RE.exec(raw);
  if (m) return +m[1] > SAVE_VERSION || (m[2] !== undefined && +m[2] > LV);
  try { return isNewerSave(JSON.parse(raw)); } catch (e) { return false; }
}

// (v3) what a construction site may hold, and the land
// (v4-A) + the repaired station (plot r_station) and the rail strip / neighbour town
// (v4-C) + the town hall, the big restaurant, the decor; the west strip (open from the start) and its south end
const BUILDINGS = ['toolsmith', 'warehouse', 'boathouse', 'cannery', 'store', 'house_a', 'house_b', 'house_c', 'watchtower', 'station',
  'town_hall', 'big_restaurant', 'deco_snowman', 'deco_bench', 'deco_lamp', 'deco_flowers', 'deco_rink', 'deco_playground', 'deco_fountain',
  // ---- (v4.2) 촌장 사무실, 서리 은행, 서리 물류창고 (their sites: ids v42_office / v42_bank / v42_depot)
  'chief_office', 'bank42', 'depot42',
  // ---- (v4.3 step B, 시장취임 Q3) 인력 사무소 (v4.4 builds it): kept only on its own hidden plot d_labour, which no v4.3 game
  //  shows — so this build never restores one (a v4.4 village is refused by its lv anyway)
  'labour_office'];
const SITE_STATES = ['foundation', 'scaffold', 'done'];
// (v4 review L3) one of each in a village (a second one is dropped, finished ones kept first); XL buildings need an XL plot
const UNIQ = ['town_hall', 'big_restaurant', 'station', 'toolsmith', 'warehouse', 'boathouse', 'cannery', 'store', 'labour_office'];
const XL_ONLY = ['town_hall', 'big_restaurant'];
/** (v4.3 step B, S4) the site keep-rules R43's check43b compares against (Remap43.js) */
export const SITE_RULES = Object.freeze({ BUILDINGS: Object.freeze(BUILDINGS.slice()), STATES: Object.freeze(SITE_STATES.slice()), UNIQ: Object.freeze(UNIQ.slice()) });
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
  // v4.2.0.1 -> v4.2.1 (고기 통조림): nothing to change — the meat-can state lives in fields a v7 save already has. The
  // number moves so a 4.2.0.1 app refuses a v4.2.1 village (마을 옮기기: 'newerSave', update first) instead of loading it
  // and dropping every meat can (its sanitizeSave does not know item_can_meat)
  7: (s) => Object.assign({}, s, { v: 8 }),
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
  // ((v4.2.0.1) the first-run tutorial's bit flags (Onboarding.js ONB): only villages that began with it carry one)
  if (raw.onb !== undefined) { const n = Math.floor(num(raw.onb, 0)); if (n > 0 && n < 1024) s.onb = n; }
  // ((v4.3 마을 깃발) the village flag { s, b, p, pc, e, ec } (+ mk: 1 while the new-game maker is still open), optional: a save
  //  without it (every save before v4.3) keeps the classic red flag; a bad part takes the classic part (src/flag/design.js)
  if (raw.flag !== undefined) { const f = sanitizeFlag(raw.flag); if (f) s.flag = f; }
  // ((v4.2.0.2) 관리자 모드 (src/systems/Admin.js), both optional — a save without them loads exactly as before:
  //  adminUses = how many times the admin panel opened (bug reports can tell), adminInf = 「코인 무제한」 is on)
  if (raw.adminUses !== undefined) { const n = count(raw.adminUses, 1e6); if (n > 0) s.adminUses = n; }
  if (raw.adminInf === 1 || raw.adminInf === true) s.adminInf = 1;
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
  // ((v4.3 step B, S1 — map_save G-4) a pad's delivered items: every ITEMS kind, not tools only (the 3단 / 빵집 / 4단 pads
  //  take planks and ingots; before B a reload lost them)
  if (isObj(pr.got)) for (const id in pr.got) if (/^[a-z0-9_]{1,40}$/.test(id) && isObj(pr.got[id])) s.progress.got[id] = counts(pr.got[id], ITEMS);
  s.stations = {};
  if (isObj(raw.stations)) for (const id in raw.stations) { const st = raw.stations[id]; if (isObj(st)) s.stations[id] = { i: count(st.i, 1000), o: count(st.o, 1000) }; }
  const shop = (o, types) => (isObj(o) ? { stock: counts(o.stock, types), cash: count(o.cash, 1e9) } : null);
  s.market = shop(raw.market, FOODS);
  s.trade = shop(raw.trade, GOODS);
  // ((v4.3 밀밭 · 빵집) the bakery stall's case (bread) and its till: optional (an older save has none = empty)
  if (isObj(raw.bakery)) s.bakery = shop(raw.bakery, ['item_bread']);
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
    const seenU = new Set(), plots = WORLD.plots || {};
    const ids = Object.keys(raw.sites).sort((a, b) => (isObj(raw.sites[b]) && raw.sites[b].st === 'done' ? 1 : 0) - (isObj(raw.sites[a]) && raw.sites[a].st === 'done' ? 1 : 0));
    for (const id of ids) {
      const d = raw.sites[id];
      if (!/^[a-z0-9_]{1,40}$/.test(id) || !isObj(d) || BUILDINGS.indexOf(d.b) < 0 || SITE_STATES.indexOf(d.st) < 0) continue;
      const p = plots[id];
      if (p && ((p.only && d.b !== p.only) || (!p.only && d.b === 'station') || (XL_ONLY.indexOf(d.b) >= 0 && p.size !== 'XL'))) continue;
      if (d.b === 'labour_office' && id !== WORKSHOP_PLOT43.labour_office) continue;
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
  // ---- (v4.3 step B, S2 — map_save §4.8-4.10) the v43 block (the R43 marker `lay`, `toggles`, `seen`, `refunds43`, `src`),
  //  F0's `x` drawer (later builds' small keys, each under its cap) and the later modules' top-level slices, copied as they
  //  are when within their caps (a same-level build's village keeps them through this build)
  const v43 = sanitizeV43(raw.v43);
  if (v43) s.v43 = v43;
  if (raw.x !== undefined) { const x = keepX(raw.x); if (x) s.x = x; }
  for (const k in SLICES43) { const v = keepSlice(raw[k], SLICES43[k], k); if (v) s[k] = v; }
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
    // ((v4.3 a2.2) 물류창고 직원 (0–3) · 지게차 (0/1) · the coins already paid into the next pad
    if (dp.hires !== undefined) o.depot.hires = Math.max(0, Math.min(3, Math.floor(num(dp.hires, 0))));
    if (dp.fork !== undefined) o.depot.fork = dp.fork ? 1 : 0;
    if (isObj(dp.hp)) o.depot.hp = { staff: count(dp.hp.staff, 1e6), fork: count(dp.hp.fork, 1e6) };
    const lg = isObj(raw.ledger) ? raw.ledger : {};
    o.ledger = { full: {} };
    if (isObj(lg.full)) { let n = 0; for (const k in lg.full) { if (n >= 40) break; if (/^[a-z0-9_:]{1,32}$/.test(k)) { o.ledger.full[k] = Math.max(0, Math.min(1e6, Math.round(num(lg.full[k], 0)))); n++; } } }
    const sn = isObj(raw.seen) ? raw.seen : {};
    o.seen = {};
    for (const k of ['whatsNew', 'pickupTip', 'trainNew', 'halo']) if (sn[k]) o.seen[k] = 1;
    o.seen.cheer = count(sn.cheer, 99);
    // ((v4.3 step B, S1 — map_save G-5) the ×1.25 tip's count (ChiefAura: 3 times ever, not 3 times a session)
    if (sn.boost !== undefined) { const b = count(sn.boost, 3); if (b > 0) o.seen.boost = b; }
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

// ===================================================================== (v4.3 step B, S2) map_save §4.8-4.10
/** what the keep-rules below trimmed or dropped (tests and the play log read it; the last 40): { k, what, n } with
 *  what 'trim' (n items shifted off) | 'drop' (the key or slice is gone) | 'keys' (n keys over the key limit) */
export const saveWarnings = [];
function warn(k, what, n) {
  saveWarnings.push({ k, what, n: Math.max(0, Math.floor(num(n, 0))) });
  if (saveWarnings.length > 40) saveWarnings.splice(0, saveWarnings.length - 40);
}
const jlen = (v) => { const t = JSON.stringify(v); return typeof t === 'string' ? t.length : 0; };

/**
 * the v43 block: { lay, toggles?, seen?, refunds43?, src? } in that order, anything else dropped. Idempotent; never throws.
 *   lay        int 0..9, kept exactly (the R43 marker: < 2 = the pre-B layout, remapped once)
 *   toggles    { counters?: { id: false }, stations?: { id: false } } — only "off" entries (false / 0), ids
 *              /^[a-z0-9_]{1,16}$/, ≤ 12 counters / 16 stations (accepted from step B, written from v4.4)
 *   seen       { key: 1 } (1 / true), ≤ 32 keys /^[a-z0-9_]{1,24}$/ (letter43, tour43, s4offer …)
 *   refunds43  { coins ≤ 1e9, items, wh (ITEMS counts), moved ≤ 16, kept ≤ 16 } (all five, as R43 writes them)
 *   src        { v, lv } of the save R43 remapped (BP-23; the play log reports it)
 */
export function sanitizeV43(raw) {
  try {
    if (!isObj(raw)) return null;
    const o = { lay: Math.max(0, Math.min(9, Math.floor(num(raw.lay, 0)))) };
    if (isObj(raw.toggles)) {
      const off = (q, max) => {
        const r = {};
        let n = 0;
        if (isObj(q)) for (const k of Object.keys(q)) { if (n >= max) break; if (/^[a-z0-9_]{1,16}$/.test(k) && (q[k] === false || q[k] === 0)) { r[k] = false; n++; } }
        return n ? r : null;
      };
      const tg = {}, c = off(raw.toggles.counters, 12), st = off(raw.toggles.stations, 16);
      if (c) tg.counters = c;
      if (st) tg.stations = st;
      if (c || st) o.toggles = tg;
    }
    if (isObj(raw.seen)) {
      const seen = {};
      let n = 0;
      for (const k of Object.keys(raw.seen)) {
        if (n >= 32) break;
        if (/^[a-z0-9_]{1,24}$/.test(k) && (raw.seen[k] === 1 || raw.seen[k] === true)) { seen[k] = 1; n++; }
      }
      if (n) o.seen = seen;
    }
    if (isObj(raw.refunds43)) {
      const r = raw.refunds43, n16 = (v) => count(Array.isArray(v) ? v.length : v, 16);
      o.refunds43 = { coins: count(r.coins, 1e9), items: itemCounts(r.items, 1e6), wh: itemCounts(r.wh, 1e6), moved: n16(r.moved), kept: n16(r.kept) };
    }
    if (isObj(raw.src)) o.src = { v: count(raw.src.v, 999), lv: count(raw.src.lv, 9999) };
    return o;
  } catch (e) { return null; }
}

/**
 * F0's `x` drawer: small keys that later builds write (v4.4–v4.6 at their own `lv`; a later build at THIS `lv` may add one:
 * an unknown key passes through under its own 512 cap). Caps are characters of JSON.stringify(value); the whole drawer
 * stays ≤ X_TOTAL. A key over its cap is trimmed oldest first (an array: shift; an object: shift its longest array
 * member), dropped only when it still does not fit; each trim / drop goes to saveWarnings. Values are deep copies in
 * their stored order, so a drawer within its caps is written back byte for byte. Never throws; never drops the save.
 */
// ((S6, postdepot_addendum.md BP-47) g43: the post-depot chain's counters and baselines { d, t, k, u } (≈ 30 B); a named cap
//  so an unknown key is trimmed before it when a later build fills the drawer. The named caps sum to 6,320 of X_TOTAL.)
export const X_CAPS = Object.freeze({ log: 512, mgmt: 256, needs: 1024, daily: 512, rewards: 512, money: 896, book: 1024, mail: 512, wk: 1024, g43: 48 });
export const X_UNKNOWN_CAP = 512;
export const X_TOTAL = 6400;
export const X_MAX_KEYS = 24;
const X_KEY = /^[a-z][a-z0-9_]{0,15}$/;
// (a key of the drawer: lower-case, ≤ 16 characters, never a name every object already has: constructor, __proto__ …)
const xKeyOk = (k) => typeof k === 'string' && X_KEY.test(k) && !(k in Object.prototype);
const xCap = (k) => (Object.prototype.hasOwnProperty.call(X_CAPS, k) ? X_CAPS[k] : X_UNKNOWN_CAP);

/** `v` (a deep copy, changed in place) trimmed oldest first until JSON.stringify(v).length ≤ cap -> { v, n } or null */
function fitX(v, cap) {
  let size = jlen(v);
  if (size <= cap) return { v, n: 0 };
  let n = 0;
  if (Array.isArray(v)) {
    const lens = v.map((e) => (e === undefined ? 4 : jlen(e)));
    while (v.length && size > cap) { size -= lens.shift() + (v.length > 1 ? 1 : 0); v.shift(); n++; }
    return size <= cap ? { v, n } : null;
  }
  if (isObj(v)) {
    // (each array member's element sizes, measured once; the longest member gives up its oldest element each round)
    const arr = {};
    for (const k of Object.keys(v)) if (Array.isArray(v[k])) arr[k] = { lens: v[k].map((e) => (e === undefined ? 4 : jlen(e))), size: jlen(v[k]) };
    while (size > cap) {
      let best = null;
      for (const k in arr) if (v[k].length && (!best || arr[k].size > arr[best].size)) best = k;
      if (!best) break;
      const d = arr[best].lens.shift() + (v[best].length > 1 ? 1 : 0);
      v[best].shift();
      arr[best].size -= d; size -= d; n++;
    }
    return size <= cap ? { v, n } : null;
  }
  return null;
}

export function keepX(raw) {
  try {
    if (!isObj(raw)) { if (raw !== undefined && raw !== null) warn('x', 'drop', 1); return null; }
    const out = {};
    let keys = 0, over = 0;
    for (const k of Object.keys(raw)) {
      if (!xKeyOk(k)) continue;
      if (keys >= X_MAX_KEYS) { over++; continue; }
      try {
        const v0 = raw[k];
        if (v0 === undefined || typeof v0 === 'function') continue;
        const txt = JSON.stringify(v0);
        if (typeof txt !== 'string') continue;
        const f = fitX(JSON.parse(txt), xCap(k));
        if (!f) { warn('x.' + k, 'drop', 1); continue; }
        if (f.n) warn('x.' + k, 'trim', f.n);
        out[k] = f.v;
        keys++;
      } catch (e) { warn('x.' + k, 'drop', 1); }
    }
    if (over) warn('x', 'keys', over);
    // the whole drawer: unknown keys give way first (the newest first), then the table backwards
    let total = jlen(out);
    if (total > X_TOTAL) {
      const known = Object.keys(X_CAPS);
      const order = Object.keys(out).filter((k) => known.indexOf(k) < 0).reverse().concat(known.slice().reverse().filter((k) => k in out));
      for (const k of order) {
        if (total <= X_TOTAL) break;
        const was = jlen(out[k]);
        const f = fitX(out[k], Math.max(0, was - (total - X_TOTAL)));
        if (f) { out[k] = f.v; warn('x.' + k, 'trim', f.n); } else { delete out[k]; warn('x.' + k, 'drop', 1); }
        total = jlen(out);
      }
    }
    return Object.keys(out).length ? out : null;
  } catch (e) { warn('x', 'drop', 1); return null; }
}

/**
 * the later modules' top-level slices (v4.4–v4.6 write them; their saves are refused by `lv`, but a same-level build may
 * carry one): each kept verbatim (a deep copy) when it is a plain object within its module's cap, else dropped with a
 * warning (N10). Caps: src/missions/save.js MISSIONS_SLICE.cap, src/geumbang/save.js GEUMBANG_SLICE.cap, logistics LD21
 */
export const SLICES43 = Object.freeze({ missions: 3072, geumbang: 1400, haul: 768, demand: 1024 });
export function keepSlice(v, cap, k) {
  if (v === undefined) return null;
  try {
    if (isObj(v)) { const txt = JSON.stringify(v); if (typeof txt === 'string' && txt.length <= cap) return JSON.parse(txt); }
  } catch (e) { /* dropped below */ }
  warn(k || 'slice', 'drop', 1);
  return null;
}

/**
 * (map_save §4.8) the game's holder of the `x` drawer (gs.x43). serialize() gives the loaded drawer back as it came (the
 * same object) until something sets a key; set() fits the whole drawer again (the caps above), so a key that does not fit
 * is trimmed or left out, never the save. In v4.3 the play log (P1) writes x.log and the post-depot chain (G) x.g43.
 */
export class X43 {
  constructor(saved) { this.base = isObj(saved) ? saved : null; this.o = null; }
  get(k) { const src = this.o || this.base; return src && Object.prototype.hasOwnProperty.call(src, k) ? src[k] : undefined; }
  /** set (or, with undefined, remove) one key; returns whether the key is now held as given (false: trimmed or left out) */
  set(k, v) {
    if (!xKeyOk(k)) return false;
    const next = Object.assign({}, this.o || this.base || {});
    if (v === undefined) delete next[k];
    else next[k] = v;
    this.o = keepX(next) || {};
    if (v === undefined) return !(k in this.o);
    try { return k in this.o && JSON.stringify(this.o[k]) === JSON.stringify(v); } catch (e) { return false; }
  }
  serialize() { const src = this.o || this.base; return src && Object.keys(src).length ? src : undefined; }
}

/** (v4-C) the civic block: counts clamped, unknown foods dropped (the restaurant's pantry holds cooked food only) */
export function sanitizeC1(raw) {
  if (!isObj(raw)) return null;
  const C = (BALANCE.civic || {});
  const R = C.restaurant || {}, Hh = C.hall || {};
  const o = { settlers: count(raw.settlers, 500), settleT: Math.max(0, Math.min(3600, num(raw.settleT, 0))) };
  if (isObj(raw.hall)) {
    o.hall = { tax: count(raw.hall.tax, Math.max(1, Math.floor(num(Hh.taxCap, 1500)))), acc: Math.max(0, Math.min(1000, num(raw.hall.acc, 0))) };
    // ((v4.3 step B, X-5) the station cash the train brought to the hall: its own pile, capped at v4.rent.cap (not the
    //  tax box's taxCap); written only when there is some (H fills it))
    const stn = count(raw.hall.stn, Math.max(1, Math.floor(num(BALANCE.v4 && BALANCE.v4.rent && BALANCE.v4.rent.cap, 2000))));
    if (stn > 0) o.hall.stn = stn;
  }
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

/**
 * (v4.3 step B, S4 — map_save §4.2, V-N6) a save object as read from storage -> what the game can load:
 *   { save }                       migrated to SAVE_VERSION and sanitized (save null: an unknown version)
 *   { save, remapped: true, r }    an old village moved onto plot table v2 by R43 (Remap43.js) and proven lossless
 *                                  (check43, then check43b after sanitizeSave); r = what was done (refunds, moves)
 *   { save: null, fail }           R43 could not prove the move lossless (or threw): fail = { kind: 'v43', reason }.
 *                                  Nothing is written by anyone: Save.load holds the save, Transfer refuses the code
 *   { save: null, newer: true }    a village from a newer build (v > 8 or lv > 43)
 * opts.fail ('throw' | 'check', V-N12; else globalThis.__FV_TEST_FAIL43): the test switch that forces a failure — it does
 * nothing in normal play. The MIGRATE chain runs first (v7 -> v8), R43 after it, whatever the version number (R43 is keyed
 * on the v43.lay marker only).
 */
export function migrateSaveEx(s, opts) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return { save: null };
  // ((v4.3 step B, F0s) a save from a newer build (lv > 43 at v 8) is a future version too: this build would cut it down,
  //  so it is not "readable" here (Save.load and dryRun hold / refuse it first; Admin.adminBackup must not count it as a
  //  readable copy it may write over)
  if (isNewerSave(s)) return { save: null, newer: true };
  const from = { v: Math.max(0, Math.floor(num(s.v, 0))), lv: Math.max(0, Math.floor(num(s.lv, 0))) };
  let v = typeof s.v === 'number' ? s.v : -1;
  while (v !== SAVE_VERSION && MIGRATE[v]) { try { s = MIGRATE[v](s); v = s.v; } catch (e) { break; } }
  if (v !== SAVE_VERSION) return { save: null };
  if (!needsRemap(s)) return { save: sanitizeSave(s), remapped: false };
  const o = opts || {};
  const test = o.fail !== undefined ? o.fail : (typeof globalThis !== 'undefined' ? globalThis.__FV_TEST_FAIL43 : undefined);
  const bad = (reason, r) => ({ save: null, fail: { kind: 'v43', reason: String(reason).slice(0, 160) }, r: r || null });
  let rm;
  try {
    if (test === 'throw') throw new Error('test switch');
    rm = remap43(s, { from });
  } catch (e) { return bad('remap43 threw: ' + ((e && e.message) || e)); }
  const c = test === 'check' ? { ok: false, reason: 'test switch' } : check43(s, rm.save, rm.r);
  if (!c.ok) return bad('check43 ' + c.reason, rm.r);
  let out = null;
  try { out = sanitizeSave(rm.save); } catch (e) { out = null; }
  if (!out) return bad('sanitize', rm.r);
  const c2 = check43b(rm.save, out, SITE_RULES);
  if (!c2.ok) return bad('check43b ' + c2.reason, rm.r);
  return { save: out, remapped: true, r: rm.r };
}

/** a save object as read from storage -> migrated to SAVE_VERSION and sanitized, or null (an unknown / future version,
 *  or ((v4.3 step B) an old village R43 could not move: migrateSaveEx says why)).
 *  (마을 옮기기) Save.load and the dry run of a village code (src/core/Transfer.js) both go through here, so a v4.1 / v4.2
 *  save inside a code loads and migrates exactly like a stored one. */
export function migrateSave(s) {
  return migrateSaveEx(s).save || null;
}

/**
 * (v4.3 step B, S4 — map_save §4.5, V-N1) the pre-B village, kept once before R43 moves it: the stored text byte for
 * byte in PRE43_KEY (frostVillage.save.backup.pre43: never in a code, never removed by 불러오기), or — when that slot holds
 * another village already (one imported later) — in PRE43_KEY + '.2'. Never overwrites, never throws. -> the key it is
 * in now, or null (no room, or both slots hold other villages: the move goes on anyway, check43 proved it lossless)
 */
export const PRE43_SLOTS = Object.freeze([PRE43_KEY, PRE43_KEY + '.2']);
export function keepPre43(st, raw) {
  try {
    if (!st || typeof raw !== 'string' || !raw) return null;
    for (const k of PRE43_SLOTS) {
      const have = st.getItem(k);
      if (have === raw) return k;
      if (have == null) { st.setItem(k, raw); return st.getItem(k) === raw ? k : null; }
    }
    return null;
  } catch (e) { return null; }
}

const win = () => (typeof window !== 'undefined' ? window : null);

export const Save = {
  // ---- (v4.3 step B, S3 — map_save §4.6, §4.7) the save hold. While held, nothing writes the stored village: Save.write,
  //  ChatSave.write, Settings.save and the admin backup are refused (window.__FV_NO_SAVE), Save.quarantine moves nothing,
  //  Save.clear keeps a copy first, and the crash card's 「처음부터 하기」 leaves the save alone (window.__FV_SAVE_HELD).
  //    'newer'     Save.load found a village from a newer build (Save.newer = { v, lv }): the game runs a fresh village
  //                that is never saved, under the newer-save card (SaveHoldCard)
  //    'stale'     Save.write found that a newer build (a second tab, the updated app) wrote the save meanwhile: the
  //                banner asks for a reload
  //    'failed43'  (S4) the R43 remap could not be proven lossless (Save.failed): the failure card
  //  A hold lasts until the page reloads (Save.load decides again), 「새 마을로 시작」 / 「처음부터」 (Save.clear), or release().
  held: null,
  newer: null,
  failed: null,
  _hold: null,
  _listeners: [],
  // ---- (v4.3 step B, S4 — map_save §4.2, V-N11) R43 at this load: remapped = the stored village was an old one, moved
  //  onto plot table v2 in memory (remap = what was done: refunds, moves); pending43 = the game is still building it — no
  //  write reaches storage until Game.build calls confirm43() (every site restored) or failWith() (the failure card);
  //  pre43 = the key the pre-B copy is in (keepPre43), or null
  remapped: false,
  remap: null,
  pending43: false,
  pre43: null,
  /** the saved game (sanitized), or null for a fresh start. Other versions are migrated or backed up first. */
  load() {
    // ((v4.3 step B) a load decides again from what is stored now: an earlier load's or a second tab's hold is lifted)
    this.release();
    this.newer = null;
    this.failed = null;
    this.remapped = false;
    this.remap = null;
    this.pending43 = false;
    this.pre43 = null;
    // ((v4.2.0.1) lastUnreadable: a save WAS there but could not be used (cut off, a newer build) — an existing player, not a
    //  new one: the first-run tutorial does not start for them)
    this.lastUnreadable = false;
    const s = readJSON(SAVE_KEY);
    if (!s || typeof s !== 'object') {
      // (v3.5 review) a save that is there but cannot be read (cut off, not JSON): keep a copy before the
      // next autosave overwrites it
      try { const st = getStore(); const raw = st && st.getItem(SAVE_KEY); if (raw) { keepCopy(st, raw); this.lastUnreadable = true; } } catch (e) { /* ignore */ }
      return null;
    }
    // ---- (v4.3 step B, F0s) a village from a newer build (v > 8 or lv > 43): not loaded (this build would drop what it does
    //  not know), not copied aside (it is not broken), never written over: the game holds every writer and shows the card
    if (isNewerSave(s)) {
      this.newer = { v: Math.floor(num(s.v, 0)), lv: Math.floor(num(s.lv, 0)) };
      this.lastUnreadable = true;
      this.hold('newer', this.newer);
      return null;
    }
    // ---- (v4.3 step B, S4 — R43) an old village (no v43.lay marker): its stored text is kept once as the pre-B copy, then
    //  it is moved onto plot table v2 in memory. A move that cannot be proven lossless holds the save (the failure card);
    //  the stored village stays byte-identical
    const vNum = typeof s.v === 'number' ? s.v : -1;
    if (needsRemap(s) && vNum >= 1 && vNum <= SAVE_VERSION) {
      try { const st = getStore(); this.pre43 = st ? keepPre43(st, st.getItem(SAVE_KEY)) : null; } catch (e) { this.pre43 = null; }
    }
    const r = migrateSaveEx(s);
    if (r.fail) {
      this.failed = Object.assign({ at: 'load' }, r.fail);
      this.lastUnreadable = true;
      this.hold('failed43', this.failed);
      return null;
    }
    const out = r.save;
    if (!out) {
      // unknown / future version: keep a copy before the next autosave overwrites it
      this.lastUnreadable = true;
      try { const st = getStore(); if (st) keepCopy(st, st.getItem(SAVE_KEY)); } catch (e) { /* ignore */ }
      return null;
    }
    if (r.remapped) { this.remapped = true; this.remap = r.r; this.pending43 = true; }
    return out;
  },
  /** (v4.3 step B, S4) Game.build restored every site of a remapped village: writes go to storage again (the next autosave
   *  stores the village on plot table v2) */
  confirm43() { this.pending43 = false; },
  /** (v4.3 step B, S4 — V-N11) a remapped village could not be built as it was proven: a site found no plot ('skip'), the
   *  build threw ('restore'). Nothing was written since the load, so the stored village is still the pre-B one: hold it and
   *  show the failure card — never a quarantine */
  failWith(kind, info) {
    const why = String(kind || 'restore') + (info ? ': ' + String((info && info.message) || info).slice(0, 120) : '');
    this.pending43 = false;
    this.failed = { kind: 'v43', reason: why, at: 'build' };
    this.lastUnreadable = true;
    this.hold('failed43', this.failed);
  },
  write(state) {
    // "Start over" on the crash card: the page is reloading and the crashed game's autosave
    // (pagehide / visibilitychange) must not put the old progress back. ((v4.3 step B) also every save hold)
    const W = win();
    if (W && W.__FV_NO_SAVE) return false;
    // ((v4.3 step B, S4) a remapped village is still being built: nothing is stored until Game.build confirms it)
    if (this.pending43) return false;
    // ---- (v4.3 step B, S1) a newer build saved this village meanwhile (a second tab, the updated app next to an old
    //  page): its save is never written over — the write is refused, the hold starts and the banner says so once
    const st = getStore();
    if (st) {
      let raw = null;
      try { raw = st.getItem(SAVE_KEY); } catch (e) { raw = null; }
      if (raw && storedIsNewer(raw)) { this.hold('stale'); return false; }
    }
    const ok = writeJSON(SAVE_KEY, stamp(state));
    this.lastWriteOk = ok;
    return ok;
  },
  lastWriteOk: true,
  /** (v4.3 step B) hold every writer (see `held` above); the listeners hear (why, info) once per hold */
  hold(why, info) {
    if (!why || this.held === why) return;
    const W = win();
    if (!this._hold) this._hold = { guard0: W ? W.__FV_NO_SAVE : undefined, chat0: ChatSave.blocked };
    this.held = why;
    if (W) { W.__FV_NO_SAVE = true; W.__FV_SAVE_HELD = why; }
    ChatSave.blocked = true;
    for (const fn of this._listeners.slice()) {
      try { fn(why, info || null); } catch (e) { try { console.error('[FrostVillage] save hold listener failed:', e); } catch (x) { /* */ } }
    }
  },
  /** lift the hold: the writers work again as they did before it */
  release() {
    if (!this.held) return;
    const W = win(), h = this._hold || {};
    this.held = null;
    this._hold = null;
    if (W) { W.__FV_NO_SAVE = h.guard0; W.__FV_SAVE_HELD = null; }
    // (a newer chat record found while held stays protected: ChatSave.newer)
    ChatSave.blocked = !!(h.chat0 || ChatSave.newer);
  },
  /** listen for holds (fn(why, info)); returns the function that stops listening */
  onHold(fn) {
    if (typeof fn !== 'function') return () => {};
    if (this._listeners.indexOf(fn) < 0) this._listeners.push(fn);
    return () => { const i = this._listeners.indexOf(fn); if (i >= 0) this._listeners.splice(i, 1); };
  },
  /** 처음부터 / 새 마을로 시작. ((v4.3 step B, map_save G-11) while held, the stored village is copied aside first
   *  (keepCopy) and the hold is lifted, so the new village saves again; when the copy cannot be made nothing is removed and
   *  the hold stays. A stale hold's village belongs to the newer build: it is left as it is (the hold is lifted, and the
   *  new village's first write finds it and holds again)) */
  clear() {
    const why = this.held;
    if (why === 'stale') { this.release(); return; }
    if (why) {
      try {
        const st = getStore();
        const raw = st && st.getItem(SAVE_KEY);
        if (raw) {
          keepCopy(st, raw);
          if (st.getItem(BACKUP_KEY) !== raw && st.getItem(BACKUP_KEY + '.2') !== raw) return;
        }
      } catch (e) { return; }
      this.release();
    }
    removeKey(SAVE_KEY);
    ChatSave.clear();
  },
  /** move a save that crashed the game aside (kept for debugging). ((v4.3 step B) not while held: the running game is not
   *  the stored village then, so the stored one did not crash it) */
  quarantine() {
    if (this.held) return;
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
  newer: false,             // ((v4.3 step B) that record was seen: a lifted save hold leaves `blocked` on)
  load(cid) {
    let raw = null;
    try { const st = getStore(); raw = st && st.getItem(CHAT_KEY); } catch (e) { raw = null; }
    if (!raw || raw.length > CHAT_MAX_CHARS) return null;
    let o = null;
    try { o = JSON.parse(raw); } catch (e) { return null; }
    if (!isObj(o)) return null;
    if (num(o.v, 0) > CHAT_RECORD_VERSION) { this.blocked = true; this.newer = true; return null; }
    if (o.v !== CHAT_RECORD_VERSION || typeof o.cid !== 'string' || o.cid !== cid || !isObj(o.chat)) return null;
    return o.chat;
  },
  write(cid, chat) {
    if (this.blocked || (typeof window !== 'undefined' && window.__FV_NO_SAVE) || Save.pending43) return false;
    if (typeof cid !== 'string' || !isObj(chat)) return false;
    // ((v4.3 step B, S1) a newer build saved the village meanwhile (a second tab): its chat record is not written over
    //  either — a chat closed before the next autosave would otherwise do it; the stale hold starts here then)
    try { const st = getStore(); if (st && storedIsNewer(st.getItem(SAVE_KEY))) { Save.hold('stale'); return false; } } catch (e) { /* */ }
    return writeJSON(CHAT_KEY, { v: CHAT_RECORD_VERSION, cid, t: Date.now(), chat });
  },
  clear() { removeKey(CHAT_KEY); this.blocked = false; this.newer = false; },
  bytes() { try { const st = getStore(); const r = st && st.getItem(CHAT_KEY); return r ? r.length : 0; } catch (e) { return 0; } },
};

/** (v4-C2) a new game's chat id (ties the chat record to this save) */
export function newChatId() { return (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)).slice(-12); }

export const Settings = {
  // (v4-C2) water: '물결 품질' 'high' | 'low' | null (automatic); voice: '주민 목소리' volume 0..1 (0 = off)
  data: { sound: true, music: true, lang: null, zoom: null, daynight: true, gfx: 'auto', water: null, voice: 1,
    // (v4.2) 놀이 tab: 자동 줍기 / 길 안내 / 촌장 후광 / 관망 자동 (s) / 관망 볼거리 / 관망 중 돈 쓰기
    pickup: 'auto', nav: true, halo: true, observeAfter: 60, observeEvents: true, observeSpend: 'none',
    // ((v4.3 hotfix) 소리 세부 조절: 전체 · 배경 음악 · 효과음 · 주변 소리, each 0..1 (주민 목소리 stays `voice`)
    vol: { master: 1, music: 1, sfx: 1, amb: 1 },
    // (v4.3) the one-time 관망 look-around hint has been shown on this device
    obsPanHint: false,
    // ((v4.3 perf) gfx: 'auto' | 'high' | 'mid' | 'low' (그래픽 사양); gfxAuto / gfxDev / gfxWhy: the automatic pick for
    //  this phone (its facts' signature; why: 'device' | 'fps' | 'oom' | 'trim'); perfInfo: the 성능 정보 corner box)
    gfxAuto: null, gfxDev: null, gfxWhy: null, perfInfo: false },
  load() {
    const s = readJSON(SETTINGS_KEY);
    if (s && typeof s === 'object' && !Array.isArray(s)) {
      this.data.sound = s.sound !== false;
      this.data.music = s.music !== false;
      this.data.lang = s.lang === 'ko' || s.lang === 'en' ? s.lang : null;
      const z = typeof s.zoom === 'number' ? s.zoom : NaN;
      this.data.zoom = Number.isFinite(z) && z > 0.2 && z < 5 ? z : null;
      this.data.daynight = s.daynight !== false;     // (v4-A) 낮과 밤
      // (v4-B) 그래픽: 자동 / 선명하게 / 가볍게 → ((v4.3 perf) 자동 / 고사양 / 중사양 / 저사양: 'high' and 'low' keep their meaning)
      this.data.gfx = s.gfx === 'high' || s.gfx === 'mid' || s.gfx === 'low' ? s.gfx : 'auto';
      this.data.gfxAuto = s.gfxAuto === 'high' || s.gfxAuto === 'mid' || s.gfxAuto === 'low' ? s.gfxAuto : null;
      this.data.gfxDev = typeof s.gfxDev === 'string' && s.gfxDev.length < 80 ? s.gfxDev : null;
      this.data.gfxWhy = typeof s.gfxWhy === 'string' && s.gfxWhy.length < 12 ? s.gfxWhy : null;
      this.data.perfInfo = s.perfInfo === true;
      this.data.water = s.water === 'low' || s.water === 'high' ? s.water : null;  // (v4-C2) 물결 품질
      this.data.voice = typeof s.voice === 'number' && s.voice >= 0 && s.voice <= 1 ? s.voice : 1;   // (v4-C2) 주민 목소리
      // ---- (v4.2) 놀이
      this.data.pickup = s.pickup === 'still' || s.pickup === 'off' ? s.pickup : 'auto';
      this.data.nav = s.nav !== false;
      this.data.halo = s.halo !== false;
      this.data.observeAfter = [0, 30, 60, 120].indexOf(s.observeAfter) >= 0 ? s.observeAfter : 60;
      this.data.observeEvents = s.observeEvents !== false;
      this.data.observeSpend = s.observeSpend === 'hire' ? 'hire' : 'none';
      // ---- (v4.3 hotfix) 소리 세부 조절
      const V = s.vol && typeof s.vol === 'object' ? s.vol : {};
      const vv = (x) => (typeof x === 'number' && x >= 0 && x <= 1 ? Math.round(x * 100) / 100 : 1);
      this.data.vol = { master: vv(V.master), music: vv(V.music), sfx: vv(V.sfx), amb: vv(V.amb) };
      this.data.obsPanHint = s.obsPanHint === true;     // (v4.3)
    }
    return this.data;
  },
  // ((v4.2.1) blocked like Save.write / ChatSave.write while the page reloads after "Start over" or 마을 옮기기:
  //  a late zoom / water-quality save must not put the old settings back over the moved village's)
  save() { if (typeof window !== 'undefined' && window.__FV_NO_SAVE) return; writeJSON(SETTINGS_KEY, this.data); },
};
