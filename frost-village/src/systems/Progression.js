// Unlock order (기획서 §4): which pad is shown next, what it opens, upgrades, village complete.

import { BALANCE } from '../data/balance.js';
import { WORLD } from '../data/world.js';
import { UnlockPad, sanePrice } from '../entities/UnlockPad.js';
import { Audio } from '../core/Audio.js';
import { Assets } from '../core/Assets.js';
import { t } from '../data/strings.js';
import { TOOL_OF } from '../data/items.js';

/** (v3.5) the look a hire step brings: the n-th free look of the profession (workers manifest professions{}) */
export function workerLook(gs, s) {
  const idx = s.type === 'hire3' ? 2 : s.type === 'hire2' ? 1 : 0;
  return gs.workerKey ? gs.workerKey(s.worker, idx, true) : s.worker;
}

/** coins a step's pad asks (v1 costs, v3 tower / hire2 / boat / porter costs) */
export function stepCost(s) {
  if (s.type === 'tower') return (BALANCE.towers[s.id] || {}).coins;
  if (s.type === 'hire2') return BALANCE.hire2[s.id];
  if (s.type === 'hire3') return BALANCE.hire3 && BALANCE.hire3[s.id];
  if (s.type === 'boat') return (s.level >= 2 ? BALANCE.boats.fishing : BALANCE.boats.rowboat).coins;
  // ---- (v4-B) the station porters, the 승격식 (rank ceremony)
  if (s.type === 'stationPorter') { const a = (BALANCE.v4 && BALANCE.v4.stationPorter) || [600, 1100]; return a[s.id === 'stn_porter2' ? 1 : 0]; }
  if (s.type === 'rank') return ((BALANCE.v4 && BALANCE.v4.rank && BALANCE.v4.rank[2]) || { coins: 11000 }).coins;
  // ---- (v4-C) the big restaurant's staff
  if (s.type === 'restStaff') { const S = (BALANCE.civic && BALANCE.civic.restaurant && BALANCE.civic.restaurant.staff) || {}; return S[s.role] || 500; }
  if (BALANCE.costs[s.id] !== undefined) return BALANCE.costs[s.id];
  return BALANCE.costs3 && BALANCE.costs3[s.id];
}

// id, type, what it needs first (after = a step id, flag = a one-time event such as the first sale).
// side: optional purchases next to the main road (clerks, porters) — "next goal" text ignores them.
export const STEPS = [
  // (v3.5 분업, docs/기획서_v3_분업.md) one production line = operator -> gatherer -> raw porter -> goods porter.
  // operator: works the station (until then the chief stands at its work spot); raw: carries the
  // collection pile to the station; porter: carries the products to the seller.
  // fish line (the tutorial): clerk -> cook -> fisherman -> fish porter -> goods porter
  { id: 'hire_clerk_market', type: 'clerk', seller: 'market', after: null, flag: 'firstSale' },
  { id: 'op_grill', type: 'operator', station: 'grill', after: 'hire_clerk_market' },
  { id: 'hire_fisherman', type: 'hire', worker: 'fisherman', after: 'op_grill' },
  { id: 'raw_grill', type: 'raw', station: 'grill', after: 'hire_fisherman', side: true },
  { id: 'porter_grill', type: 'porter', station: 'grill', after: 'raw_grill', side: true },
  // wood line
  { id: 'zone_forest', type: 'zone', zone: 'forest', after: 'hire_fisherman' },
  { id: 'hire_clerk_trade', type: 'clerk', seller: 'trade', after: 'zone_forest', flag: 'firstTrade', side: true },
  { id: 'op_sawmill', type: 'operator', station: 'sawmill', after: 'zone_forest' },
  { id: 'hire_lumberjack', type: 'hire', worker: 'lumberjack', after: 'op_sawmill' },
  { id: 'raw_sawmill', type: 'raw', station: 'sawmill', after: 'hire_lumberjack', side: true },
  { id: 'porter_sawmill', type: 'porter', station: 'sawmill', after: 'raw_sawmill', side: true },
  // (step 4 = backpack/boots upgrades at the bench, appears after hire_lumberjack)
  // wheat line
  { id: 'zone_farm', type: 'zone', zone: 'farm', after: 'hire_lumberjack' },
  { id: 'op_bakery', type: 'operator', station: 'bakery', after: 'zone_farm' },
  { id: 'hire_farmer', type: 'hire', worker: 'farmer', after: 'op_bakery' },
  { id: 'raw_bakery', type: 'raw', station: 'bakery', after: 'hire_farmer', side: true },
  { id: 'porter_bakery', type: 'porter', station: 'bakery', after: 'raw_bakery', side: true },
  // ore line
  { id: 'zone_mine', type: 'zone', zone: 'mine', after: 'hire_farmer' },
  { id: 'op_smelter', type: 'operator', station: 'smelter', after: 'zone_mine' },
  { id: 'hire_miner', type: 'hire', worker: 'miner', after: 'op_smelter' },
  { id: 'raw_smelter', type: 'raw', station: 'smelter', after: 'hire_miner', side: true },
  { id: 'porter_smelter', type: 'porter', station: 'smelter', after: 'raw_smelter', side: true },
  // hunting line
  { id: 'zone_hunt', type: 'zone', zone: 'hunt', after: 'hire_miner' },
  { id: 'op_smokehouse', type: 'operator', station: 'smokehouse', after: 'zone_hunt' },
  { id: 'hire_hunter', type: 'hire', worker: 'hunter', after: 'op_smokehouse' },
  { id: 'raw_smokehouse', type: 'raw', station: 'smokehouse', after: 'hire_hunter', side: true },
  { id: 'porter_smokehouse', type: 'porter', station: 'smokehouse', after: 'raw_smokehouse', side: true },

  // ---------------- (v3) 생산 사슬과 땅 넓히기 (기획서_v2.md v3 진행 표)
  //   after: 'b:<건물>' = that building is finished, 'r:<땅>' = that land is open, otherwise a step id
  // watchtowers: pay at the pad on the border -> a construction site; lit -> the fog clears
  { id: 'tower_east', type: 'tower', region: 'east', after: 'hire_hunter', v3: true },
  { id: 'tower_south', type: 'tower', region: 'south', after: 'boat_rowboat', v3: true },
  { id: 'tower_se', type: 'tower', region: 'se', after: 'b:store', v3: true },
  // boats at the boathouse
  { id: 'boat_rowboat', type: 'boat', level: 1, after: 'b:boathouse', v3: true },
  { id: 'boat_fishing', type: 'boat', level: 2, after: 'b:cannery', also: 'boat_rowboat', v3: true, items: { item_rod: 1 } },   // (same pad spot: after the rowboat)
  // second workers: coins + the matching tool from the toolsmith
  { id: 'hire2_lumberjack', type: 'hire2', worker: 'lumberjack', after: 'b:toolsmith', v3: true },
  { id: 'hire2_miner', type: 'hire2', worker: 'miner', after: 'hire2_lumberjack', v3: true, side: true },
  { id: 'hire2_fisherman', type: 'hire2', worker: 'fisherman', after: 'b:boathouse', v3: true, side: true },
  { id: 'hire2_farmer', type: 'hire2', worker: 'farmer', after: 'r:south', v3: true, side: true },
  { id: 'hire2_hunter', type: 'hire2', worker: 'hunter', after: 'b:store', v3: true, side: true },
  // (v3.5) third workers (coins + a tool): the third look of each profession
  { id: 'hire3_fisherman', type: 'hire3', worker: 'fisherman', after: 'hire2_fisherman', also: 'b:cannery', v3: true, side: true },
  { id: 'hire3_lumberjack', type: 'hire3', worker: 'lumberjack', after: 'hire2_lumberjack', also: 'r:south', v3: true, side: true },
  { id: 'hire3_farmer', type: 'hire3', worker: 'farmer', after: 'hire2_farmer', also: 'b:store', v3: true, side: true },
  { id: 'hire3_hunter', type: 'hire3', worker: 'hunter', after: 'hire2_hunter', also: 'r:se', v3: true, side: true },
  // operators of the new workshops (until then the chief works them), porters for the new lines, a clerk for the general store
  { id: 'op_toolsmith', type: 'operator', station: 'toolsmith', after: 'b:toolsmith', v3: true, side: true },
  { id: 'porter_toolsmith', type: 'porter', station: 'toolsmith', after: 'op_toolsmith', v3: true, side: true },
  { id: 'porter_dock', type: 'porter', station: 'dock', after: 'boat_rowboat', v3: true, side: true },
  { id: 'op_cannery', type: 'operator', station: 'cannery', after: 'b:cannery', v3: true, side: true },
  { id: 'porter_cannery', type: 'porter', station: 'cannery', after: 'op_cannery', v3: true, side: true },
  { id: 'hire_clerk_store', type: 'clerk', seller: 'store', after: 'b:store', flag: 'firstStoreSale', v3: true, side: true },

  // ---------------- (v4-B) 이웃 마을 (docs/v4_plan.md §15.1): after: 'f:<flag>' = a one-time event happened
  // station porters on the station square (surplus -> the loading dock / new shops), the town ceremony (읍)
  { id: 'stn_porter', type: 'stationPorter', after: 'f:firstTrain', v4: true, side: true },
  { id: 'stn_porter2', type: 'stationPorter', after: 'f:shops3', also: 'stn_porter', v4: true, side: true },
  { id: 'rank_eup', type: 'rank', after: 'f:rankReady', v4: true },

  // ---------------- (v4-C) 큰 식당 직원 (docs/기획서_v4_추가요청.md §4): 처음엔 촌장이 직접 (계산대 · 주방 발판)
  //   계산 점원 → 요리사 → 서빙 직원, 한 자리에서 차례로 (식당 옆 고용 발판)
  { id: 'rest_cashier', type: 'restStaff', role: 'cashier', after: 'b:big_restaurant', c1: true, side: true },
  { id: 'rest_cook', type: 'restStaff', role: 'cook', after: 'rest_cashier', c1: true, side: true },
  { id: 'rest_server', type: 'restStaff', role: 'server', after: 'rest_cook', c1: true, side: true },
];
export const BENCH_AFTER = 'hire_lumberjack';
export const COMPLETE_AFTER = 'hire_hunter';
// (v3) the main goals after the village is complete, in order (the v3 finale: "개척 완료")
//   kind: region (a watchtower lit), build (a building finished), step (a pad), flag (an event)
export const GOALS_V3 = [
  { id: 'east', kind: 'region', step: 'tower_east' },
  { id: 'toolsmith', kind: 'build' },
  { id: 'fedMiners', kind: 'flag' },
  { id: 'hire2_lumberjack', kind: 'step' },
  { id: 'boathouse', kind: 'build' },
  { id: 'boat_rowboat', kind: 'step' },
  { id: 'south', kind: 'region', step: 'tower_south' },
  { id: 'warehouse', kind: 'build' },
  { id: 'cannery', kind: 'build' },
  { id: 'store', kind: 'build' },
  { id: 'se', kind: 'region', step: 'tower_se' },
  { id: 'boat_fishing', kind: 'step' },
];
// ---- (v4-B) the "next goal" walk: the v3 goals interleaved with the v4 ones (docs/v4_plan.md §15.1)
//   passive: a goal that comes by itself (a train, shops opening, people moving in); while one of them is in
//   progress, the next goal the chief can work on is shown instead. when: only once that is met (f:<flag>).
//   shops / people: the numbers come from balance.js v4.rank.2 (n is the default)
export const GOALS = [
  { id: 'east', kind: 'region', step: 'tower_east' },
  { id: 'station', kind: 'build', v4: true },
  { id: 'firstTrain', kind: 'flag', passive: true, v4: true },
  { id: 'toolsmith', kind: 'build' },
  { id: 'fedMiners', kind: 'flag' },
  { id: 'shops:1', kind: 'shops', n: 1, passive: true, v4: true },
  // ---- (v4-C) the big restaurant on the west strip (its staff are side pads)
  { id: 'big_restaurant', kind: 'build', c1: true },
  { id: 'hire2_lumberjack', kind: 'step' },
  { id: 'townVisit', kind: 'flag', when: 'f:townInvite', v4: true },
  { id: 'boathouse', kind: 'build' },
  { id: 'boat_rowboat', kind: 'step' },
  { id: 'shops:3', kind: 'shops', n: 3, passive: true, v4: true },
  { id: 'south', kind: 'region', step: 'tower_south' },
  { id: 'warehouse', kind: 'build' },
  { id: 'cannery', kind: 'build' },
  { id: 'store', kind: 'build' },
  { id: 'se', kind: 'region', step: 'tower_se' },
  { id: 'boat_fishing', kind: 'step' },
  { id: 'shops:5', kind: 'shops', n: 5, rankKey: 'shops', passive: true, v4: true },
  // ---- (v4-C) the town hall (tax box, notice board, +rooms toward the 45 people, the ceremony's venue): after the
  //   fifth shop so its 2400 coins / planks / ingots do not hold up the cannery and the shops' orders (bot runs)
  { id: 'town_hall', kind: 'build', c1: true },
  { id: 'people:45', kind: 'people', n: 45, rankKey: 'people', passive: true, v4: true },
  { id: 'rank:2', kind: 'rank', n: 2, v4: true },
];
// (v3) which building each card of the build menu needs first (shown on the locked card)
export const BUILD_UNLOCK = {
  toolsmith: 'r:east', boathouse: 'b:toolsmith', warehouse: 'r:south', cannery: 'boat_rowboat', store: 'b:cannery',
  house_a: 'hire_miner', house_b: 'b:toolsmith', house_c: 'hire_miner',
  // ---- (v4-C) the town hall and the big restaurant come when the east watchtower's site starts (the neighbours'
  // art comes then too); early decor uses the village's own props, the park / street / flower ones the town's
  town_hall: 'tower_east', big_restaurant: 'tower_east',
  deco_snowman: 'hire_miner', deco_bench: 'hire_miner', deco_lamp: 'hire_miner', deco_rink: 'zone_hunt',
  deco_flowers: 'tower_east', deco_playground: 'tower_east', deco_fountain: 'tower_east',
};
export const UNIQUE_BUILDINGS = ['toolsmith', 'warehouse', 'boathouse', 'cannery', 'store'];
const ZONE_IDS = ['zone_forest', 'zone_farm', 'zone_mine', 'zone_hunt'];
// v1 saves: the post-completion couriers became the porters of v2 (same pads, new ids)
export const OLD_STEP_IDS = { hire2_fisherman: 'porter_grill', hire2_lumberjack: 'porter_sawmill', hire2_farmer: 'porter_bakery', hire2_miner: 'porter_smelter', hire2_hunter: 'porter_smokehouse' };

export class Progression {
  constructor(gs, saved) {
    this.gs = gs;
    saved = saved || {};
    this.done = Object.assign({}, saved.done || {});
    this.paid = Object.assign({}, saved.paid || {});
    const up = saved.up || {};
    const lvl = (v, n) => Math.max(0, Math.min(n - 1, Math.floor(Number(v)) || 0));
    this.up = {
      capacity: lvl(up.capacity, BALANCE.upgrades.capacity.values.length),
      speed: lvl(up.speed, BALANCE.upgrades.speed.values.length),
    };
    this.celebrated = !!saved.celebrated;
    this.flags = Object.assign({}, saved.flags || {});   // one-time events: firstSale, firstTrade, ...
    this.hints = Object.assign({}, saved.hints || {});   // zone -> true once its product was sold
    this.seen = Object.assign({}, saved.seen || {});     // one-time hints already shown (e.g. upgradeHint)
    this.got = {};                                        // (v3) items already delivered to pads: id -> { item: n }
    if (saved.got && typeof saved.got === 'object') for (const k in saved.got) this.got[k] = Object.assign({}, saved.got[k]);
    this.celebrated3 = !!saved.celebrated3;
    this.pads = {};           // id -> UnlockPad
    this.upPads = {};         // capacity / speed
    this.benchOpen = false;
  }

  isDone(id) { return !!this.done[id]; }
  /** (v3) an `after` condition: step id, 'b:<building>' (finished) or 'r:<land>' (open) */
  met(cond) {
    if (!cond) return true;
    if (cond.startsWith('f:')) return !!this.flags[cond.slice(2)];     // (v4-B) a one-time event
    if (cond.startsWith('b:')) return !!(this.gs.isBuilt && this.gs.isBuilt(cond.slice(2)));
    if (cond.startsWith('r:')) return !!(this.gs.territory && this.gs.territory.isOpen(cond.slice(2)));
    return !!this.done[cond];
  }
  /** (v3) is goal `g` reached? */
  goalDone(g) {
    if (g.kind === 'region') return !!(this.gs.territory && this.gs.territory.isOpen(g.id));
    // ---- (v4-B) shops open, people, the rank (read from gs.v4, null-safe)
    if (g.kind === 'shops' || g.kind === 'people' || g.kind === 'rank') { const v = this.goalValue(g); return v !== null && v >= this.goalNeed(g); }
    if (g.kind === 'build') return !!(this.gs.isBuilt && this.gs.isBuilt(g.id));
    if (g.kind === 'flag') return !!this.flags[g.id];
    return !!this.done[g.id];
  }
  /** (v4-B) the number a shops / people / rank goal counts (null when v4 is not running) */
  goalValue(g) {
    const v4 = this.gs.v4;
    if (!v4) return null;
    if (g.kind === 'shops') return v4.growth ? v4.growth.openShopCount() : 0;
    if (g.kind === 'people') return v4.rank ? v4.rank.people() : 0;
    if (g.kind === 'rank') return v4.rank ? v4.rank.level : 1;
    return null;
  }
  goalNeed(g) {
    const R = BALANCE.v4 && BALANCE.v4.rank && BALANCE.v4.rank[2];
    if (g.rankKey && R && Number.isFinite(R[g.rankKey])) return R[g.rankKey];
    return g.n || 1;
  }
  /** (v3) the first main goal not reached yet (null before the village is complete / when all are done).
   *  (v4-B) passive goals in progress (a train, shops opening, people moving in) give way to a later goal the
   *  chief can work on; a goal with `when` waits for it (the town visit needs the invitation) */
  nextGoal() {
    if (!this.complete) return null;
    let passive = null;
    for (const g of GOALS) {
      if (this.goalDone(g)) continue;
      if (g.when && !this.met(g.when)) { if (!passive) passive = g; continue; }
      if (g.passive) { if (!passive) passive = g; continue; }
      return g;
    }
    return passive;
  }
  get v3Complete() { return this.complete && GOALS_V3.every((g) => this.goalDone(g)); }
  anyDone(re) { for (const k in this.done) if (this.done[k] && re.test(k)) return true; return false; }
  capacity() { return BALANCE.upgrades.capacity.values[this.up.capacity]; }
  speedMult() { return BALANCE.upgrades.speed.values[this.up.speed]; }
  zonesOpen() { let n = 0; for (const z of ZONE_IDS) if (this.done[z]) n++; return n; }
  get complete() { return this.isDone(COMPLETE_AFTER); }

  visibleSteps() { return STEPS.filter((s) => !this.done[s.id] && this.met(s.after) && (!s.flag || this.flags[s.flag]) && (!s.also || this.met(s.also))); }

  /** a one-time event happened (e.g. first sale): new pads may appear */
  setFlag(f) {
    if (this.flags[f]) return;
    this.flags[f] = true;
    this.gs.time.delayedCall(700, () => this.syncPads());
    this.gs.events.emit('flag', f);
  }

  /** apply saved state instantly (no animations) and create the visible pads */
  init() {
    const gs = this.gs;
    for (const s of STEPS) {
      if (!this.done[s.id]) continue;
      this.applyStep(s, true);
    }
    if (this.isDone(BENCH_AFTER)) this.openBench(true);
    this.syncPads();
  }

  syncPads() {
    const gs = this.gs;
    for (const s of this.visibleSteps()) {
      if (this.pads[s.id]) continue;
      const cfg = WORLD.pads[s.id] || (WORLD.pads2 && WORLD.pads2[s.id]) || (WORLD.pads35 && WORLD.pads35[s.id]) || (gs.padSpot && gs.padSpot(s));
      if (!cfg) continue;
      const cost = stepCost(s);
      // (v3.5 review) a partial payment above the (new, lower) price is given back, never swallowed
      // (v3 -> v3.5 lowered some prices; the designer may lower one in balance.js too)
      const price = sanePrice(cost), paidBefore = this.paid[s.id] || 0;
      if (paidBefore > price) {
        this.paid[s.id] = price;
        if (gs.economy) gs.economy.add(paidBefore - price);
      }
      let icon = 'ui_icon_lock';
      let items = s.items || null;
      // (v3.5) the face of who comes: a portrait still loading (after the title) arrives a moment later
      const face = (k, fb) => (Assets.has(k) || Assets.pending(k) ? k : fb);
      if (s.type === 'hire' || s.type === 'hire2' || s.type === 'hire3') icon = face('portrait_' + workerLook(gs, s), 'portrait_' + s.worker);
      else if (s.type === 'operator') { const w = WORLD.labour && WORLD.labour.ops[s.station]; icon = w && w.who ? face('portrait_' + w.who, 'ui_icon_worker') : 'ui_icon_worker'; }
      else if (s.type === 'raw') icon = Assets.pick('ui_icon_porter', 'portrait_npc_porter_b', 'ui_icon_backpack');
      else if (s.type === 'clerk') icon = Assets.pick('ui_icon_clerk', s.seller === 'trade' ? 'portrait_npc_clerk_b' : 'portrait_npc_clerk_a', 'ui_icon_worker');
      else if (s.type === 'porter') icon = Assets.pick('ui_icon_porter', 'portrait_npc_porter_a', 'ui_icon_backpack');
      else if (s.type === 'tower') icon = Assets.pick('ui_icon_lock_open', 'ui_icon_lock');
      else if (s.type === 'boat') icon = s.level >= 2 ? 'item_fish_big' : 'item_fish_raw';
      else if (s.type === 'stationPorter') icon = Assets.pick('ui_icon_porter', 'portrait_npc_porter_a', 'ui_icon_backpack');     // (v4-B)
      else if (s.type === 'rank') icon = Assets.pick('ui_badge_rank_2', 'ui_icon_fame', 'ui_icon_lock_open', 'ui_icon_lock');
      else if (s.type === 'restStaff') icon = s.role === 'cashier' ? Assets.pick('ui_icon_clerk', 'portrait_npc_clerk_b', 'ui_icon_worker') : s.role === 'cook' ? Assets.pick('ui_icon_food', 'portrait_npc_chef', 'ui_icon_worker') : Assets.pick('ui_icon_porter', 'ui_icon_worker');     // (v4-C)
      if (s.type === 'hire2' || s.type === 'hire3') items = { [TOOL_OF[s.worker]]: 1 };
      const kind = s.type === 'zone' || s.type === 'tower' || s.type === 'rank' ? 'unlock' : 'hire';
      const padTex = s.type === 'clerk' || s.type === 'operator' || s.type === 'restStaff' ? Assets.pick('ui_pad_clerk', 'ui_pad_hire') : s.type === 'porter' || s.type === 'raw' || s.type === 'stationPorter' ? Assets.pick('ui_pad_porter', 'ui_pad_hire')
        : s.type === 'tower' ? Assets.pick('ui_pad_tower', 'ui_pad_unlock') : s.type === 'boat' ? Assets.pick('ui_pad_boat', 'ui_pad_hire') : null;
      const pad = new UnlockPad(gs, s.id, cfg.x, cfg.y, {
        kind, cost, paid: this.paid[s.id] || 0, label: s.id, icon, labelAt: s.type === 'stationPorter' ? ((WORLD.v4 && WORLD.v4.square && WORLD.v4.square.labels && WORLD.v4.square.labels.porter) || [0, 64]) : s.type === 'restStaff' ? [150, 6] : undefined, iconSize: s.type === 'zone' || s.type === 'tower' ? 40 : s.type === 'rank' ? 50 : 54, sizeM: s.type === 'rank' ? 2.1 : undefined,
        padTex, items, got: this.got[s.id],
        onComplete: (p) => this.completeStep(s, p),
      });
      this.pads[s.id] = pad;
      if (gs.lazyImage && Assets.pending(icon)) {
        const size = s.type === 'zone' || s.type === 'tower' ? 40 : 54;
        gs.lazyImage(pad.labelIcon, icon, (img) => { img.setScale(size / Math.max(img.frame.realWidth, img.frame.realHeight, 1)); pad.refresh(); });
      }
      // (v3.5) the pads of a line follow each other on the same spot: the chief standing there must
      // step off first, so the coins for the next one never drain by accident
      if (gs.player && pad.pad.contains(gs.player.x, gs.player.y)) pad.needsLeave = true;
      gs.popIn(pad);
    }
  }

  completeStep(s, pad) {
    const gs = this.gs;
    this.done[s.id] = true;
    delete this.paid[s.id];
    delete this.pads[s.id];
    pad.vanish();
    this.applyStep(s, false, pad.x, pad.y);
    delete this.got[s.id];
    if (s.type === 'zone') gs.ui.banner(t('unlocked', { name: t('z_' + s.zone) }));
    else if (s.type === 'hire') gs.ui.banner(t('hired', { name: t('w_' + s.worker) }));
    else if (s.type === 'hire2') gs.ui.banner(t('hired', { name: t('w_' + s.worker) + ' 2' }));
    else if (s.type === 'hire3') gs.ui.banner(t('hired', { name: t('w_' + s.worker) + ' 3' }));
    else if (s.type === 'operator') gs.ui.banner(t('hired', { name: t('opName_' + s.station) }), t('opSub_' + s.station));
    else if (s.type === 'raw') gs.ui.banner(t('hired', { name: t('raw_' + s.station) }), t('rawSub'));
    else if (s.type === 'clerk') gs.ui.banner(t('hired', { name: t('w_clerk') }));
    else if (s.type === 'porter') gs.ui.banner(t('hired', { name: t('w_porter') }));
    else if (s.type === 'tower') gs.ui.banner(t('towerStart'), t('towerStartSub'));
    else if (s.type === 'boat') gs.ui.banner(t(s.level >= 2 ? 'boatFishing' : 'boatRowboat'));
    else if (s.type === 'stationPorter') gs.ui.banner(t('hired', { name: t('stn_porter') }), t('stnPorterSub'));      // (v4-B)
    gs.events.emit('step', s.id);
    if (s.id === BENCH_AFTER) gs.time.delayedCall(1400, () => this.openBench(false));
    gs.time.delayedCall(s.type === 'zone' ? 1800 : 600, () => this.syncPads());
    if (s.id === COMPLETE_AFTER && !this.celebrated) {
      this.celebrated = true;
      gs.time.delayedCall(1500, () => gs.celebrate());
    }
    gs.save(true);
  }

  /** make a finished step happen in the world (instant = restoring a save, no animation) */
  applyStep(s, instant, x, y) {
    const gs = this.gs;
    if (s.type === 'zone') gs.revealZone(s.zone, instant);
    else if (s.type === 'hire') gs.hireWorker(s.worker, s.index || 0, instant, x, y, s.role);
    else if (s.type === 'hire2') gs.hireWorker(s.worker, 1, instant, x, y);
    else if (s.type === 'hire3') gs.hireWorker(s.worker, 2, instant, x, y);
    else if (s.type === 'operator') gs.hireOperator(s.station, instant, x, y);
    else if (s.type === 'raw') gs.hireRawPorter(s.station, instant, x, y);
    else if (s.type === 'clerk') { const sel = s.seller === 'trade' ? gs.trade : s.seller === 'store' ? gs.store : gs.market; if (sel) sel.register.hireClerk(instant, x, y); }
    else if (s.type === 'porter') gs.hirePorter(s.station, instant, x, y);
    else if (s.type === 'tower') gs.startTower(s.id, instant);
    else if (s.type === 'boat') { if (gs.boathouse) gs.boathouse.setBoat(s.level, instant); }
    // ---- (v4-B) a station porter on the square; the town ceremony (마을 -> 읍)
    else if (s.type === 'stationPorter') { if (gs.v4 && gs.v4.growth) gs.v4.growth.hireStationPorter(instant, x, y); }
    else if (s.type === 'rank') { if (gs.v4 && gs.v4.rank) gs.v4.rank.ceremony(instant); }
    // ---- (v4-C) the big restaurant's cashier / cook / server
    else if (s.type === 'restStaff') { if (gs.civic && gs.civic.restaurant) gs.civic.restaurant.hire(s.role, instant, x, y); }
  }

  openBench(instant) {
    if (this.benchOpen) return;
    this.benchOpen = true;
    const gs = this.gs;
    gs.showBench(instant);
    const b = WORLD.bench;
    for (const kind of ['capacity', 'speed']) {
      const U = BALANCE.upgrades[kind];
      const lvl = this.up[kind];
      const maxed = lvl >= U.values.length - 1;
      // (v3.5 review) a saved partial payment above a lowered price comes back as coins
      if (!maxed && (this.paid['up_' + kind] || 0) > sanePrice(U.costs[lvl])) { if (gs.economy) gs.economy.add(this.paid['up_' + kind] - sanePrice(U.costs[lvl])); this.paid['up_' + kind] = sanePrice(U.costs[lvl]); }
      const pad = new UnlockPad(gs, 'up_' + kind, b.x + b.pads[kind][0], b.y + b.pads[kind][1], {
        kind: 'upgrade', cost: maxed ? 1 : U.costs[lvl], paid: maxed ? 0 : (this.paid['up_' + kind] || 0), sizeM: 1.6,
        icon: kind === 'capacity' ? 'ui_icon_backpack' : 'ui_icon_speed', iconSize: 40,
        labelFn: () => t('up_' + kind) + ' ' + t('level', { n: this.up[kind] + 1 }),
        onComplete: (p) => this.upgrade(kind, p),
      });
      pad.maxed = maxed;
      pad.refresh();
      this.upPads[kind] = pad;
      if (!instant) gs.popIn(pad);
    }
  }

  upgrade(kind, pad) {
    const gs = this.gs;
    const U = BALANCE.upgrades[kind];
    const before = U.values[this.up[kind]];
    this.up[kind] = Math.min(U.values.length - 1, this.up[kind] + 1);
    delete this.paid['up_' + kind];
    const lvl = this.up[kind];
    gs.effects.sheet('fx_levelup', gs.player.x, gs.player.y + 4, { size: 220 });
    Audio.play('sfx_levelup');
    if (kind === 'capacity') gs.ui.banner(t('capacityUp', { n: U.values[lvl] - before }));
    else gs.ui.banner(t('speedUp'));
    // the old price is fully spent: never save it as a partial payment for the next level
    pad.paid = 0; pad.acc = 0;
    if (lvl >= U.values.length - 1) { pad.maxed = true; pad.done = true; pad.refresh(); }
    else gs.time.delayedCall(500, () => pad.rearm(U.costs[lvl]));
    gs.save(true);
  }

  /** partial payments (and items already on pads) so they survive reloads */
  collectPaid() {
    for (const id in this.pads) {
      const p = this.pads[id];
      if (p.paid > 0) this.paid[id] = p.paid; else delete this.paid[id];
      if (p.items) {
        const g = {};
        // a tool flying onto the pad / carried there by a porter counts as delivered
        for (const k in p.items) g[k] = Math.min(p.items[k], (p.got[k] || 0) + p.itemStack.countWithIncoming(k) + (this.gs.carriedTo ? this.gs.carriedTo(p, k) : 0));
        this.got[id] = g;
      }
    }
    for (const k in this.upPads) {
      const p = this.upPads[k], id = 'up_' + k;
      if (!p.maxed && !p.done && p.paid > 0) this.paid[id] = p.paid; else delete this.paid[id];
    }
  }

  update(dt) {
    let on = false;
    for (const id in this.pads) if (this.pads[id].update(dt)) on = true;
    for (const k in this.upPads) if (this.upPads[k].update(dt)) on = true;
    return on;
  }

  /** cheapest pad the player can afford now (for the tutorial arrow) */
  affordablePad(coins) {
    let best = null;
    for (const id in this.pads) {
      const p = this.pads[id];
      // a pad already paid that only waits for its tool is not a place to go with coins
      if (p.active && !p.done && p.remaining > 0 && p.remaining <= coins && (!best || p.remaining < best.remaining)) best = p;
    }
    return best;
  }

  nextPad() {
    for (const s of STEPS) if (!s.side && this.pads[s.id]) return this.pads[s.id];
    return null;
  }

  /** cheapest open side pad (clerk / porter) */
  sidePad() {
    let best = null;
    for (const s of STEPS) { const p = this.pads[s.id]; if (s.side && p && p.active && !p.done && (!best || p.remaining < best.remaining)) best = p; }
    return best;
  }

  serialize() {
    this.collectPaid();
    return { done: this.done, paid: this.paid, up: this.up, celebrated: this.celebrated, hints: this.hints, seen: this.seen, flags: this.flags, got: this.got, celebrated3: this.celebrated3 };
  }
}
