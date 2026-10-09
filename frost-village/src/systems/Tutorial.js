// Tutorial / objective arrow: a bouncing world-space arrow over the next thing to do
// (+ an edge indicator drawn by the UI scene when it is off-screen).
//
// Priority after the first-loop tutorial:
//   1. an affordable unlock / hire pad
//   2. a full bag: where the carried items can go (or the discard spot when nothing takes them)
//   3. the first affordable backpack / boots upgrade (once)
//   4. a guided first run through each newly opened zone (max ~90 s, ends when its worker is hired)
//   5. when the player stands idle for a few seconds: the next useful thing (sell / collect coins /
//      empty the fullest station), with the next goal as text

import { Assets } from '../core/Assets.js';
import { Input } from '../core/Input.js';
import { DEPTH } from './DepthSort.js';
import { gdist } from '../core/Iso.js';
import { t, fmt } from '../data/strings.js';
import { FOODS, GOODS } from '../entities/Seller.js';
import { MINER_FOOD, MATERIALS, STORE_GOODS } from '../data/items.js';
import { buildCost } from '../entities/Site.js';
import { BALANCE } from '../data/balance.js';

const ZONE_CHAINS = [
  { zone: 'forest', raw: 'item_log', product: 'item_plank', station: 'sawmill', seller: 'trade', worker: 'hire_lumberjack' },
  { zone: 'farm', raw: 'item_wheat', product: 'item_bread', station: 'bakery', seller: 'market', worker: 'hire_farmer' },
  { zone: 'mine', raw: 'item_ore', product: 'item_ingot', station: 'smelter', seller: 'trade', worker: 'hire_miner' },
  { zone: 'hunt', raw: 'item_meat_raw', product: 'item_meat_cooked', station: 'smokehouse', seller: 'market', worker: 'hire_hunter' },
];
export const PRODUCT_ZONE = { item_plank: 'forest', item_bread: 'farm', item_ingot: 'mine', item_meat_cooked: 'hunt' };

// instruction text for "take this item where it goes"
const SELL_KEY = { item_fish_cooked: 'obj_sell', item_bread: 'obj_farm_4', item_meat_cooked: 'obj_hunt_4', item_plank: 'obj_forest_4', item_ingot: 'obj_mine_4' };
const FEED_KEY = { item_fish_raw: 'obj_grill', item_log: 'obj_forest_2', item_wheat: 'obj_farm_2', item_ore: 'obj_mine_2', item_meat_raw: 'obj_hunt_2' };
const TAKE_KEY = { grill: 'obj_take', sawmill: 'obj_forest_3', bakery: 'obj_farm_3', smelter: 'obj_mine_3', smokehouse: 'obj_hunt_3' };

const ZONE_HINT_MAX = 90;      // s a zone's guided run may stay on screen
const UPGRADE_HINT_MAX = 25;   // s the first-upgrade hint may stay on screen
const IDLE_HINT = 3;           // s standing still before the "what next" arrow appears
const IDLE_LATCH = 12;         // s an idle hint stays while the chief walks to it (review fix)

export class Tutorial {
  constructor(gs) {
    this.gs = gs;
    this.arrow = Assets.image(gs, 0, 0, 'ui_arrow').setDepth(DEPTH.ARROW).setVisible(false);
    const f = this.arrow.frame;
    this.arrow.setScale(58 / Math.max(f.realWidth, 1));
    this.target = null;      // { x, y, h, key }
    this.textKey = null;
    this.t = 0;
    this.evalT = 0;
    this.zoneT = {};         // zone -> seconds its hint was shown this session
    this._tg = { x: 0, y: 0, h: 0 };
  }

  get inTutorial() { return !this.gs.progress.isDone('hire_fisherman'); }

  evaluate(dt) {
    const gs = this.gs, p = gs.player, prog = gs.progress, eco = gs.economy;
    const tg = this._tg;
    const set = (x, y, h, key, text) => { tg.x = x; tg.y = y; tg.h = h; this.target = tg; this.textKey = key; this.text = text || null; };
    this.target = null; this.textKey = null; this.text = null;
    // (v3.5 review) "idle": standing still a few seconds (on a pad that does nothing, or a long while on
    // any pad). The idle hints then stay while the chief walks to them (IDLE_LATCH s): before, the arrow
    // vanished at his first step and a player who only follows the arrow was left with nothing
    const still = (gs.time.now - Input.lastActivity) / 1000;
    const baseIdle = still > IDLE_HINT && (!gs.playerOnPad || still > 8 || this.onDeadPad());
    this.idleLatch = baseIdle ? IDLE_LATCH : Math.max(0, (this.idleLatch || 0) - dt);
    const idle = baseIdle || this.idleLatch > 0;

    const pad = prog.affordablePad(eco.coins, p);
    // (v2) customers waiting at an empty register come before buying things (the line is stuck)
    if (!this.inTutorial && this.registerHint(set, dt, true)) return;
    if (pad && !pad.pad.contains(p.x, p.y)) {
      const key = this.inTutorial ? (pad.id === 'op_grill' ? 'obj_operator' : pad.id === 'hire_clerk_market' ? 'obj_clerk' : 'obj_unlock')
        : /^hire_clerk/.test(pad.id) && !prog.anyDone(/^hire_clerk/) ? 'obj_clerk' : /^porter_/.test(pad.id) && !prog.anyDone(/^porter_/) ? 'obj_porter'
        : /^op_/.test(pad.id) && prog.zonesOpen() <= 1 ? 'obj_operator' : /^raw_/.test(pad.id) && !prog.anyDone(/^raw_/) ? 'obj_raw'
        : /^tower_/.test(pad.id) ? 'obj_tower' : pad.id === 'boat_rowboat' ? 'obj_boat' : null;
      set(pad.x, pad.y, 112, key);
      return;
    }
    // (review fix) a pad that appeared under the chief waits until he steps off once: say so
    if (this.stepOffHint(pad)) return;
    if (pad) return;
    // ---- (v4-B) a ribbon to cut (free, ranked like an affordable pad)
    if (!this.inTutorial && this.ribbonHint(set)) return;
    if (this.inTutorial) { this.firstLoop(set); return; }
    if (this.unloadHint(set)) return;
    if (this.registerHint(set, dt, false)) return;
    // (v3.5) coins waiting on a cash pad that pay for the next thing come before more hand-work
    if (this.cashHint(set)) return;
    if (this.upgradeHint(set, dt)) return;
    if (this.zoneHint(set, dt)) return;
    // (v3.5) a station nobody works / a full collection pile nobody carries
    if (this.labourHint(set, idle)) return;
    // (v3) hungry miners, materials for a site nobody brings, a tool for a hire pad, the next building
    if (this.v3Hint(set, dt, idle)) return;
    // ---- (v4-B) the neighbours: goods for an order card, the town visit, planks for the carpenter, empty shelves
    if (this.v4Hint(set, dt, idle)) return;
    const nx = prog.nextPad();
    let goal = nx && !prog.complete ? { key: 'obj_next:' + nx.id + ':' + nx.remaining, text: t('obj_next', { name: t(nx.id), cost: fmt(nx.remaining) }) } : null;
    if (prog.complete) goal = this.goalText();
    if (idle && this.nextAction(set, goal)) return;
    // gentle hint: lots of coins waiting on a cash pad (once shown it leads all the way there)
    for (const c of this.cashes()) {
      if (c.value >= 40 && !c.pad.contains(p.x, p.y) && (gdist(p.x, p.y, c.x, c.y) > 260 || this.cashLead === c)) { this.cashLead = c; set(c.x, c.y, 40, goal ? goal.key : null, goal ? goal.text : null); return; }
    }
    this.cashLead = null;
    // otherwise just name the next goal (no arrow)
    if (goal) { this.textKey = goal.key; this.text = goal.text; }
  }

  /**
   * (review fix) the next pad of a line popped up on the spot the chief stands on: it only takes coins
   * after he steps off once (so nothing drains by accident) — tell him instead of showing nothing
   */
  stepOffHint(pad) {
    const gs = this.gs, p = gs.player, prog = gs.progress;
    let on = null;
    if (pad && pad.needsLeave && pad.pad.contains(p.x, p.y)) on = pad;
    else {
      for (const id in prog.pads) { const q = prog.pads[id]; if (q.active && !q.done && q.needsLeave && q.remaining > 0 && q.remaining <= gs.economy.coins && q.pad.contains(p.x, p.y)) { on = q; break; } }
      if (!on) for (const k in prog.upPads) { const q = prog.upPads[k]; if (q.active && !q.done && !q.maxed && q.needsLeave && q.remaining > 0 && q.remaining <= gs.economy.coins && q.pad.contains(p.x, p.y)) { on = q; break; } }
    }
    if (!on) return false;
    // the arrow bounces just below the pad (clear of it, so it does not hide the chief standing there):
    // one step there, then back on. (a hire pad's diamond reaches ~45 px below its centre)
    const tg = this._tg;
    tg.x = on.x; tg.y = on.y + 118; tg.h = 34;
    this.target = tg; this.textKey = 'obj_step_off'; this.text = null;
    return true;
  }

  /** (v3.5 review) the chief stands on an unlock / hire pad that takes nothing (step off first / no coins) */
  onDeadPad() {
    const gs = this.gs, p = gs.player, prog = gs.progress;
    for (const id in prog.pads) { const q = prog.pads[id]; if (q.active && !q.done && q.pad.contains(p.x, p.y)) return q.needsLeave || gs.economy.coins <= 0 || q.remaining <= 0; }
    for (const k in prog.upPads) { const q = prog.upPads[k]; if (q.active && q.pad.contains(p.x, p.y)) return q.needsLeave || q.maxed || q.done || gs.economy.coins <= 0; }
    return false;
  }

  /** (v3.5) the coins customers left would buy the next pad (or there are a lot of them): pick them up */
  cashHint(set) {
    const gs = this.gs, p = gs.player, prog = gs.progress, coins = gs.economy.coins;
    let total = 0, best = null;
    for (const c of this.cashes()) { total += c.value; if (c.value > 0 && (!best || c.value > best.value)) best = c; }
    if (!best || total < 25) return false;
    let next = Infinity;
    for (const id in prog.pads) { const pd = prog.pads[id]; if (pd.active && !pd.done && pd.remaining > 0) next = Math.min(next, pd.remaining); }
    for (const k in prog.upPads) { const u = prog.upPads[k]; if (u.active && !u.done && !u.maxed && u.remaining > 0) next = Math.min(next, u.remaining); }
    // (v3.5 verify) "a lot of coins lying around" no longer pulls the chief back while he can already pay
    // for the next building on the main path: late in v3 the cash pads refill faster than he walks to a
    // far plot, and an arrow-only player bounced between the coins and the plot for minutes (5000+ in hand)
    const g = prog.nextGoal();
    const canBuild = !!(g && g.kind === 'build' && !gs.isBuilding(g.id) && !gs.isBuilt(g.id) && coins >= (buildCost(g.id).coins || 0));
    if (!((coins < next && coins + total >= next) || (total >= 300 && !canBuild))) return false;
    if (best.pad.contains(p.x, p.y)) return false;
    set(best.x, best.y, 40, 'obj_cash');
    return true;
  }

  cashes() {
    const gs = this.gs;
    // ((v4-B) + the station till: wholesale, card bonuses and rent)
    const g = gs.v4 && gs.v4.growth;
    return [gs.market.cash, gs.trade && gs.trade.enabled ? gs.trade.cash : null, gs.store && gs.store.enabled ? gs.store.cash : null, g && g.active ? g.till : null].filter(Boolean);
  }

  // ---------------------------------------------------------------- (v4-B, docs/v4_plan.md §15.3)
  growth() { const v4 = this.gs.v4; return v4 && v4.growth && v4.growth.active ? v4.growth : null; }

  /** 2. a founded shop waits for its ribbon */
  ribbonHint(set) {
    const gs = this.gs, p = gs.player, nb = gs.v4;
    if (!nb || !nb.growth) return false;
    for (const id in nb.growth.shops) {
      const sh = nb.growth.shops[id];
      if (sh.st !== 'ribbon' || !sh.ribbonPad) continue;
      if (sh.ribbonPad.contains(p.x, p.y)) { this.textKey = 'obj_ribbon'; return true; }
      set(sh.ribbonPad.x, sh.ribbonPad.y, 60, 'obj_ribbon');
      return true;
    }
    return false;
  }

  /** the loading dock as a target (the chief carries `ty`, an open card needs it) */
  dockFor(ty) { const g = this.growth(); return g && g.needOf(ty) > 0 ? g.dockPad : null; }

  /** 3–8 of §15.3 */
  v4Hint(set, dt, idle) {
    const gs = this.gs, p = gs.player, prog = gs.progress, nb = gs.v4;
    if (!nb) return false;
    const g = this.growth();
    // 3. carrying goods an open card needs while their shelf is half full or more: to the loading dock
    if (g) {
      for (let i = p.stack.items.length - 1; i >= 0; i--) {
        const ty = p.stack.items[i].type;
        if (g.needOf(ty) <= 0) continue;
        const shelf = FOODS.indexOf(ty) >= 0 ? gs.market : GOODS.indexOf(ty) >= 0 ? (gs.trade.enabled ? gs.trade : null) : STORE_GOODS.indexOf(ty) >= 0 ? gs.store : null;
        const full = !shelf || !shelf.enabled || shelf.stock.countOf(ty) >= shelf.maxPerType * 0.5;
        if (!full) continue;
        const key = 'obj_cargo:' + ty, text = t('obj_cargo', { item: t(ty) });
        if (g.dockPad.contains(p.x, p.y)) { this.textKey = key; this.text = text; }
        else set(g.dockPad.x, g.dockPad.y, 60, key, text);
        return true;
      }
    }
    // 4. the invitation is open and the town not visited: to the town gate, then the fountain
    if (prog.flags.townInvite && !prog.flags.townVisit && gs.territory.isOpen('town')) {
      const gate = (nb.buildings || []).find((b) => b.id === 't_gate'), fn = (nb.buildings || []).find((b) => b.id === 't_fountain');
      const tg = gate && p.x < gate.x - 60 ? gate : fn;
      if (tg) { set(tg.x, tg.y - 20, tg === gate ? 180 : 120, 'obj_visit_town'); return true; }
    }
    // 5. the carpenter waits for planks (the chief idle for a moment)
    if (g && idle) {
      const h = Object.values(g.houses).find((q) => q.st === 'site' && q.got < q.need());
      if (h) {
        if (p.stack.countOf('item_plank') > 0) { if (h.pad && h.pad.contains(p.x, p.y)) this.textKey = 'obj_feed_carpenter'; else set(h.dropX, h.dropY, 60, 'obj_feed_carpenter'); return true; }
        const porterBrings = g.porters.some((w) => w.job && w.job.sink === h);
        const src = this.sourceOf('item_plank') || (gs.trade.enabled && gs.trade.stock.countOf('item_plank') > 0 ? null : null);
        if (!porterBrings && src && p.room > 0) { if (src.outPad.contains(p.x, p.y)) this.textKey = 'obj_feed_carpenter'; else set(src.outPad.x, src.outPad.y, 80, 'obj_feed_carpenter'); return true; }
      }
    }
    // 7. happiness below the bar and a shelf item is gone: that shelf (idle only)
    if (g && idle && nb.rank && nb.rank.level < 2 && g.happiness() < ((BALANCE.v4.rank && BALANCE.v4.rank[2] && BALANCE.v4.rank[2].happy) || 70)) {
      const m = gs.market;
      const ty = m.availableFoods ? FOODS.find((f) => m.stock.countOf(f) === 0 && gs.stationList.some((st) => st.output === f && st.enabled)) : null;
      if (ty) { set(m.shelf.x, m.shelf.y, 60, 'obj_happy_low:' + ty, t('obj_happy_low', { item: t(ty) })); return true; }
    }
    // 8. idle with nothing else to do: the focus order card (text)
    if (g && idle && !p.stack.count) {
      const c = g.focusCard();
      if (c && !g.cardDone(c)) {
        const ty = Object.keys(c.need).find((k) => c.got[k] < c.need[k]);
        const src = ty && this.sourceOf(ty);
        const text = c.shop ? t('obj_order_focus', { item: t(ty), got: c.got[ty], need: c.need[ty], shop: t('shop_' + c.shop) }) : t('obj_order_standing', { item: t(ty), got: c.got[ty], need: c.need[ty] });
        if (src && p.room > 0 && g.porters.length === 0) { if (src.outPad.contains(p.x, p.y)) { this.textKey = 'obj_order:' + c.id; this.text = text; } else set(src.outPad.x, src.outPad.y, 80, 'obj_order:' + c.id + ':' + c.got[ty], text); return true; }
      }
    }
    return false;
  }

  // ---------------------------------------------------------------- (v3)
  /** "next goal" text after the village is complete (the v3 main goals in order) */
  goalText() {
    const gs = this.gs, prog = gs.progress;
    const g = prog.nextGoal();
    if (!g) return null;
    if (g.kind === 'region') {
      const site = gs.sites[g.step];
      if (site && site.state !== 'plot') return { key: 'obj_site_wait', text: null };
      const pad = prog.pads[g.step];
      const cost = pad ? pad.remaining : (BALANCE.towers[g.step] || {}).coins || 0;
      return { key: 'obj_next_region:' + g.step + ':' + cost, text: t('obj_next_region', { name: t(g.step), cost: fmt(cost) }) };
    }
    if (g.kind === 'build') {
      if (gs.isBuilding(g.id)) return { key: 'obj_site_wait', text: null };
      const cost = buildCost(g.id).coins || 0;
      return { key: 'obj_next_build:' + g.id, text: t('obj_next_build', { name: t('b_' + g.id), cost: fmt(cost) }) };
    }
    // ---- (v4-B) the first train, the town visit, shops / people / the rank
    if (g.kind === 'flag' && g.id === 'firstTrain') return { key: 'obj_first_train', text: null };
    if (g.kind === 'flag' && g.id === 'townVisit') return { key: 'obj_visit_town', text: null };
    if (g.kind === 'shops' || g.kind === 'people') {
      const n = prog.goalNeed(g), have = prog.goalValue(g) || 0;
      const k = g.kind === 'shops' ? 'obj_next_shops' : 'obj_next_people';
      return { key: k + ':' + n + ':' + have, text: t(k, { n, have }) };
    }
    if (g.kind === 'rank') {
      const pad = prog.pads.rank_eup;
      if (!pad) { const nb = gs.v4; const bars = nb && nb.rank ? nb.rank.bars() : []; const b = bars.find((x) => !x.full); if (b) return { key: 'obj_next_' + b.key + ':' + b.v, text: t(b.key === 'shops' ? 'obj_next_shops' : b.key === 'people' ? 'obj_next_people' : 'obj_happy_bar', { n: b.need, have: b.v }) }; return { key: 'obj_rank', text: null }; }
      return pad.remaining <= gs.economy.coins ? { key: 'obj_rank', text: null } : { key: 'obj_rank_save:' + pad.remaining, text: t('obj_rank_save', { coins: fmt(pad.remaining) }) };
    }
    if (g.kind === 'flag') return { key: 'obj_food', text: null };
    const pad = prog.pads[g.id];
    const cost = pad ? pad.remaining : 0;
    return { key: 'obj_next:' + g.id + ':' + cost, text: t('obj_next', { name: t(g.id), cost: fmt(cost) }) };
  }

  /** a free plot that can take building `bkey`, nearest to the chief */
  plotFor(bkey) {
    const gs = this.gs, p = gs.player;
    let best = null, bd = Infinity;
    for (const id in gs.sites) {
      const st = gs.sites[id];
      if (st.kind !== 'plot' || st.state !== 'plot' || !st.shown) continue;
      if (st.only ? st.only !== bkey : (bkey === 'boathouse' || (st.size === 'S' && !/^house_/.test(bkey)))) continue;
      // (a house on a big plot only where the build menu allows it)
      if (/^house_/.test(bkey) && st.size !== 'S') { const c = gs.buildChoices(st).find((q) => q.key === bkey); if (!c || c.locked) continue; }
      const d = gdist(p.x, p.y, st.dropX, st.dropY);
      if (d < bd) { bd = d; best = st; }
    }
    return best;
  }

  /** where the chief can pick up `type` (a station / workshop output, else nothing) */
  sourceOf(type) {
    const gs = this.gs;
    let best = null, bn = 0;
    for (const s of gs.sources()) { if (!s.enabled) continue; const n = s.outStack.countOf(type); if (n > bn) { bn = n; best = s; } }
    return best;
  }

  v3Hint(set, dt, idle) {
    const gs = this.gs, p = gs.player, prog = gs.progress;
    const bag = (ty) => p.stack.countOf(ty);
    // 1. hungry miners: food to the food box
    const fb = gs.foodBox;
    if (fb && fb.active && (fb.count === 0 || (!prog.flags.fedMiners && fb.count < fb.max * 0.6)) && gs.workers.some((w) => w.type === 'miner' && (w.hungry || !prog.flags.fedMiners))) {
      if (MINER_FOOD.some((f) => bag(f) > 0)) { if (fb.pad.contains(p.x, p.y)) this.textKey = 'obj_food'; else set(fb.x, fb.y, 60, 'obj_food'); return true; }
      const porterBrings = gs.porters.some((w) => w.station && (w.station.output === 'item_bread' || w.station.output === 'item_meat_cooked'));
      if (!porterBrings || fb.count === 0) {
        const src = this.sourceOf('item_bread') || this.sourceOf('item_meat_cooked');
        if (src && p.room > 0) { if (src.outPad.contains(p.x, p.y)) this.textKey = 'obj_take_bread'; else set(src.outPad.x, src.outPad.y, 80, 'obj_take_bread'); return true; }
      }
      if (fb.count === 0) { this.textKey = 'obj_food'; return idle ? false : true; }
    }
    // 2. a construction site waiting for materials nobody is bringing
    for (const id in gs.sites) {
      const st = gs.sites[id];
      if (st.state !== 'foundation' || !st.shown) continue;
      for (const m of MATERIALS) {
        const miss = st.missing(m);
        if (miss <= 0) continue;
        if (bag(m) > 0) { if (st.dropPad.contains(p.x, p.y)) this.textKey = 'obj_site_' + (m === 'item_plank' ? 'plank' : 'ingot'); else set(st.dropX, st.dropY, 60, 'obj_site_' + (m === 'item_plank' ? 'plank' : 'ingot')); return true; }
        const carrier = gs.porters.some((w) => (w.station && w.station.output === m) || (w.wh && gs.warehouse && gs.warehouse.count(m) > 0) || (w.dest === st));
        if (carrier) continue;
        const src = this.sourceOf(m);
        if (src && p.room > 0 && (idle || id.startsWith('tower_') || !prog.seen['site_' + m])) {
          if (src.outPad.contains(p.x, p.y)) this.textKey = 'obj_site_take_' + (m === 'item_plank' ? 'plank' : 'ingot');
          else set(src.outPad.x, src.outPad.y, 80, 'obj_site_take_' + (m === 'item_plank' ? 'plank' : 'ingot'));
          return true;
        }
      }
    }
    // 3. a hire pad waiting for its tool
    for (const id in prog.pads) {
      const pd = prog.pads[id];
      if (!pd.items || pd.done || !pd.active) continue;
      for (const k in pd.items) {
        if ((pd.got[k] || 0) >= pd.items[k]) continue;
        if (bag(k) > 0) { if (pd.pad.contains(p.x, p.y)) { this.textKey = 'obj_tool_give:' + k; this.text = t('obj_tool_give', { name: t(k) }); } else set(pd.x, pd.y, 112, 'obj_tool_give', t('obj_tool_give', { name: t(k) })); return true; }
        const porterBrings = gs.porters.some((w) => (w.station && w.station.kind === 'toolsmith') || w.dest === pd);
        const ws = gs.workshops.find((w) => w.kind === 'toolsmith');
        if (!porterBrings && ws && ws.outStack.countOf(k) > 0 && p.room > 0 && (idle || pd.remaining <= gs.economy.coins)) {
          if (ws.outPad.contains(p.x, p.y)) { this.textKey = 'obj_tool:' + k; this.text = t('obj_tool', { name: t(k) }); }
          else set(ws.outPad.x, ws.outPad.y, 80, 'obj_tool', t('obj_tool', { name: t(k) }));
          return true;
        }
      }
    }
    // 4. the next building: point at a free plot once it is affordable
    const g = prog.nextGoal();
    if (g && g.kind === 'build' && !gs.isBuilding(g.id) && !gs.isBuilt(g.id)) {
      const cost = buildCost(g.id).coins || 0;
      const pl = this.plotFor(g.id);
      if (pl && gs.economy.coins >= cost) {
        if (pl.pad && pl.pad.contains(p.x, p.y)) { this.textKey = 'obj_build:' + g.id; this.text = t('obj_build', { name: t('b_' + g.id) }); }
        else set(pl.dropX, pl.dropY, 70, 'obj_build:' + g.id, t('obj_build', { name: t('b_' + g.id) }));
        return true;
      }
    }
    // 5. people wait for a home: a house on a free small plot (when affordable)
    if (gs.life && gs.life.waiting.length && idle) {
      const pl = this.plotFor('house_c');
      if (pl && gs.economy.coins >= (buildCost('house_c').coins || 0) && prog.met('hire_miner')) { set(pl.dropX, pl.dropY, 70, 'obj_houses'); return true; }
    }
    // 6. the general store: nobody at the register
    const sto = gs.store;
    if (sto && sto.enabled && !sto.register.clerk && sto.waitingPay && sto.waitPayT > 2) {
      if (sto.register.pad.contains(p.x, p.y)) this.textKey = 'obj_register_wait';
      else set(sto.register.x, sto.register.y, 46, 'obj_store_register');
      return true;
    }
    return false;
  }

  /** the very first loop: fish -> grill -> counter -> coins -> hire the fisherman */
  firstLoop(set) {
    const gs = this.gs, p = gs.player, prog = gs.progress, eco = gs.economy;
    const grill = gs.stations.grill, m = gs.market;
    const raw = p.stack.countOf('item_fish_raw'), cooked = p.stack.countOf('item_fish_cooked');
    const next = prog.nextPad();
    // (v2) the customer has the food: stand at the register so they pay
    const front = m.queue[0];
    // (review fix) only when the front customer can actually pay now (or the shelf holds the rest of the
    // order): a customer who got part of the order waits for more food first, never for the chief
    const paysSoon = front && front.arrived && front.got > 0 && front.need > 0 && m.stock.count >= front.need;
    if (!m.register.clerk && cooked === 0 && (m.waitingPay || paysSoon)) {
      if (!m.register.pad.contains(p.x, p.y)) set(m.register.x, m.register.y, 46, 'obj_register');
      else this.textKey = 'obj_register_wait';
      return;
    }
    if (m.cash.value > 0 && cooked === 0 && (eco.coins + m.cash.value >= (next ? next.remaining : 0) || (raw === 0 && grill.outStack.count === 0))) {
      if (!m.cash.pad.contains(p.x, p.y)) set(m.cash.x, m.cash.y, 40, 'obj_cash');
      return;
    }
    if (cooked > 0) { set(m.shelf.x, m.shelf.y, 60, 'obj_sell'); return; }
    // (v3.5) nobody cooks yet: the chief stands at the grill himself (the fish hop in from there)
    const op = grill.op, cook = !op || !!op.operator;
    if (raw > 0 && (p.room <= 0 || !gs.net.ready() || raw >= Math.min(4, p.capacity))) {
      if (cook) set(grill.inPad.x, grill.inPad.y, 50, 'obj_grill');
      else if (op.pad.contains(p.x, p.y)) this.textKey = 'obj_operating_grill';
      else set(op.x, op.y, 50, 'obj_op_grill');
      return;
    }
    if (!cook && grill.inStack.count > 0 && raw === 0) {
      if (op.pad.contains(p.x, p.y)) { this.textKey = 'obj_operating_grill'; return; }
      if (grill.outStack.count < 6 || p.room <= 0) { set(op.x, op.y, 50, 'obj_op_grill'); return; }
    }
    if ((grill.outStack.count > 0 || grill.inStack.count > 0) && raw === 0) { set(grill.outPad.x, grill.outPad.y, 80, 'obj_take'); return; }
    set(gs.net.gather.x, gs.net.gather.y - 10, 30, 'obj_fish');
  }

  /**
   * (v2) customers / the merchant waiting at a register nobody stands at. urgent: only when the line
   * has been stuck for a while (then it beats buying pads); otherwise after unloading.
   */
  registerHint(set, dt, urgent) {
    const gs = this.gs, p = gs.player, m = gs.market, tr = gs.trade;
    const mWait = m.waitingPay && !m.register.clerk ? m.waitPayT : 0;
    const tWait = tr.enabled && tr.waitingPay && !tr.register.clerk ? tr.waitT : 0;
    const need = urgent ? 9 : 1.2;
    let reg = null, key = null;
    if (mWait > need && (!tWait || mWait >= tWait)) { reg = m.register; key = 'obj_register'; }
    else if (tWait > need + 1) { reg = tr.register; key = 'obj_register_trade'; }
    if (!reg) return false;
    if (reg.pad.contains(p.x, p.y)) { this.textKey = 'obj_register_wait'; return true; }
    // a gentle toast the first times the line gets stuck far away
    if (urgent && gdist(p.x, p.y, reg.x, reg.y) > 420 && gs.time.now - (this.waitToastT || -1e9) > 45000) {
      this.waitToastT = gs.time.now;
      gs.ui.toast(t(reg === m.register ? 'customersWaiting' : 'merchantWaiting'));
    }
    set(reg.x, reg.y, 46, key);
    return true;
  }

  /** where carried item `type` can go right now: { pad, key } or null */
  destination(type) {
    const gs = this.gs;
    // (v3) a building site / hire pad / the food box / a workshop wanting it comes first
    const L = gs.logistics;
    if (L) {
      const b = L.best(type, gs.player.x, gs.player.y, { minPrio: 50, noStore: true });
      if (b) {
        const s = b.sink;
        const pad = s.dropPad || (s.pad && s.pad.contains ? s.pad : null) || (s.inPad) || { x: s.x, y: s.y, contains: (x, y) => gdist(x, y, s.x, s.y) < 60 };
        if (s.kind === 'plot' || s.kind === 'tower') return { pad: s.dropPad, key: type === 'item_plank' ? 'obj_site_plank' : 'obj_site_ingot' };
        if (s === gs.foodBox) return { pad: s.pad, key: 'obj_food' };
        if (s.items) return { pad: s.pad, key: 'obj_tool_give' };
        const ws = gs.workshops.find((w) => w.sink === s);
        if (ws) return { pad: ws.inPad, key: null };
        if (s.station) return this.stationDest(s.station);
        void pad;
      }
    }
    // ---- (v4-B) a full shelf: an open order card takes it at the loading dock
    const dock = this.dockFor(type);
    if (dock && !this.shelfRoom(type)) return { pad: dock, key: 'obj_cargo:' + type, text: t('obj_cargo', { item: t(type) }) };
    if (STORE_GOODS.indexOf(type) >= 0) return gs.store && gs.store.enabled && gs.store.stock.countOf(type) < gs.store.maxPerType ? { pad: gs.store.shelf, key: null } : (gs.warehouse ? { pad: gs.warehouse.inPad, key: null } : null);
    if (type === 'item_fish_big') return gs.warehouse ? { pad: gs.warehouse.inPad, key: null } : null;
    if (FOODS.indexOf(type) >= 0) return gs.market.stock.countOf(type) < gs.market.maxPerType ? { pad: gs.market.shelf, key: SELL_KEY[type] } : null;
    if (GOODS.indexOf(type) >= 0) return gs.trade.enabled && gs.trade.stock.countOf(type) < gs.trade.maxPerType ? { pad: gs.trade.shelf, key: SELL_KEY[type] } : null;
    const st = gs.stationByInput[type];
    return st && st.enabled && st.inStack.room > 0 ? this.stationDest(st) : null;
  }

  /** (v4-B) does the shelf that sells `type` have room? */
  shelfRoom(type) {
    const gs = this.gs;
    if (FOODS.indexOf(type) >= 0) return gs.market.stock.countOf(type) < gs.market.maxPerType;
    if (GOODS.indexOf(type) >= 0) return gs.trade.enabled && gs.trade.stock.countOf(type) < gs.trade.maxPerType;
    if (STORE_GOODS.indexOf(type) >= 0) return !!(gs.store && gs.store.enabled && gs.store.stock.countOf(type) < gs.store.maxPerType);
    return true;
  }

  /** (v3.5) where to bring a station's raw items: its work spot while nobody works it, else the input pad */
  stationDest(st) {
    if (st.op && !st.op.operator && st.op.enabled) return { pad: st.op.pad, key: 'obj_op_' + st.id };
    return { pad: st.inPad, key: FEED_KEY[st.input] || null };
  }

  /** (v3.5) a station with work waiting and nobody working it; a pile filling up with nobody carrying it */
  labourHint(set, idle) {
    const gs = this.gs, p = gs.player, prog = gs.progress;
    let best = null, bd = Infinity;
    for (const st of gs.stationList.concat(gs.workshops)) {
      const op = st.op;
      if (!st.enabled || !op || op.operator || !op.enabled || !st.hasWork()) continue;
      if (op.pad.contains(p.x, p.y)) { this.textKey = st.id === 'grill' ? 'obj_operating_grill' : 'obj_operating'; prog.seen['op_' + st.id] = true; return true; }
      // first time, a big input waiting, or the chief has nothing else to do
      if (!(idle || !prog.seen['op_' + st.id] || st.inStack.count >= 8)) continue;
      const d = gdist(p.x, p.y, op.x, op.y);
      if (d < bd) { bd = d; best = st; }
    }
    if (best && (bd < 900 || idle)) { set(best.op.x, best.op.y, 50, 'obj_op_' + best.id); return true; }
    let pile = null;
    for (const id in gs.piles) {
      const pl = gs.piles[id];
      if (!pl.shown || !pl.enabled || pl.count < 5) continue;
      if (gs.rawPorters.some((r) => r.pile === pl)) continue;
      const st = gs.stations[pl.station];
      if (!st || !st.enabled || st.inStack.room < 3) continue;
      // (review fix) the products of that station wait to be sold first: more raw items would not help
      if (st.outStack.count >= st.outStack.max * 0.5) continue;
      if (!(idle || !prog.seen['pile_' + id])) continue;
      pile = pl;
      break;
    }
    // (review fix) finished products come before more raw items: what the chief carries goes to the
    // seller, and a station output nobody empties (no goods porter yet) is the next stop
    if (pile && this.productHint(set)) return true;
    if (!pile || p.room <= 0) return false;
    if (pile.pad.contains(p.x, p.y)) { this.textKey = 'obj_pile_' + pile.id; prog.seen['pile_' + pile.id] = true; return true; }
    set(pile.x, pile.y, 70, 'obj_pile_' + pile.id);
    return true;
  }

  /** (review fix) products in the bag -> their seller; else a station output piling up with no goods porter */
  productHint(set) {
    const gs = this.gs, p = gs.player;
    for (let i = p.stack.items.length - 1; i >= 0; i--) {
      const ty = p.stack.items[i].type;
      if (FOODS.indexOf(ty) < 0 && GOODS.indexOf(ty) < 0) continue;
      const d = this.destination(ty);
      if (!d) continue;
      if (d.pad.contains(p.x, p.y)) { this.textKey = d.key; this.text = d.text || null; }
      else set(d.pad.x, d.pad.y, 60, d.key, d.text);
      return true;
    }
    // (carrying raw items: those go on first — no mixed bag of fish and grilled fish)
    if (p.room <= 0 || p.stack.items.some((it) => gs.stationByInput[it.type])) return false;
    let best = null;
    for (const st of gs.stationList) {
      if (!st.enabled || st.outStack.count < 6 || gs.porters.some((w) => w.station === st)) continue;
      // nowhere to take them (the shelf is full): not now
      if (!this.destination(st.output)) continue;
      if (!best || st.outStack.count > best.outStack.count) best = st;
    }
    if (!best) return false;
    if (best.outPad.contains(p.x, p.y)) this.textKey = TAKE_KEY[best.id] || null;
    else set(best.outPad.x, best.outPad.y, 80, TAKE_KEY[best.id] || null);
    return true;
  }

  /** bag full: point where the carried things can go (never at a pad that cannot take anything) */
  unloadHint(set) {
    const gs = this.gs, p = gs.player;
    if (p.room > 0 || p.stack.count === 0) return false;
    let best = null, bd = 1e12;
    const seen = {};
    for (const it of p.stack.items) {
      if (seen[it.type]) continue;
      seen[it.type] = true;
      const d = this.destination(it.type);
      if (!d) continue;
      const dist = gdist(p.x, p.y, d.pad.x, d.pad.y);
      if (dist < bd) { bd = dist; best = d; }
    }
    if (best) {
      if (best.pad.contains(p.x, p.y)) { this.textKey = best.key; this.text = best.text || null; }
      else set(best.pad.x, best.pad.y, 60, best.key, best.text);
      return true;
    }
    // nothing accepts what we carry (e.g. raw fish while the grill is full both ways): the discard spot
    const tr = gs.trash;
    if (tr && tr.enabled) {
      if (tr.pad.contains(p.x, p.y)) this.textKey = 'obj_trash';
      else set(tr.x, tr.y, 50, 'obj_trash');
      return true;
    }
    return false;
  }

  /** the first time a backpack / boots upgrade is affordable, show the bench (once) */
  upgradeHint(set, dt) {
    const gs = this.gs, prog = gs.progress, p = gs.player;
    if (!prog.benchOpen || prog.seen.upgradeHint) return false;
    if (prog.up.capacity > 0 || prog.up.speed > 0) { prog.seen.upgradeHint = true; return false; }
    const pad = prog.upPads.capacity;
    if (!pad || pad.maxed || pad.remaining > gs.economy.coins) return false;
    this.upT = (this.upT || 0) + dt;
    if (this.upT > UPGRADE_HINT_MAX) { prog.seen.upgradeHint = true; return false; }
    if (pad.pad.contains(p.x, p.y)) { this.textKey = 'obj_upgrade'; return true; }
    set(pad.x, pad.y, 100, 'obj_upgrade');
    return true;
  }

  /** guided first run through each newly opened zone (until its product is sold once) */
  zoneHint(set, dt) {
    const gs = this.gs, p = gs.player, prog = gs.progress;
    for (const z of ZONE_CHAINS) {
      if (!prog.isDone('zone_' + z.zone) || prog.hints[z.zone]) continue;
      // the lesson is over once the zone's worker does the gathering, or after a while
      this.zoneT[z.zone] = (this.zoneT[z.zone] || 0) + dt;
      if (prog.isDone(z.worker) || this.zoneT[z.zone] > ZONE_HINT_MAX) { prog.hints[z.zone] = true; continue; }
      const st = gs.stations[z.station];
      const seller = z.seller === 'trade' ? gs.trade.shelf : gs.market.shelf;
      const raw = p.stack.countOf(z.raw), room = p.room;
      if (p.stack.countOf(z.product) > 0) { set(seller.x, seller.y, 60, 'obj_' + z.zone + '_4'); return true; }
      const sd = this.stationDest(st);
      if (raw > 0 && (room <= 0 || raw >= 3)) { if (sd.pad.contains(p.x, p.y)) { this.textKey = sd.pad === st.inPad ? 'obj_' + z.zone + '_2' : 'obj_operating'; return true; } set(sd.pad.x, sd.pad.y, 50, sd.pad === st.inPad ? 'obj_' + z.zone + '_2' : sd.key); return true; }
      if (st.inStack.count > 0 && sd.pad !== st.inPad && raw === 0 && st.outStack.count < 6) { if (sd.pad.contains(p.x, p.y)) this.textKey = 'obj_operating'; else set(sd.pad.x, sd.pad.y, 50, sd.key); return true; }
      if (room <= 0) return false;
      if ((st.outStack.count > 0 || st.inStack.count > 0) && raw === 0) { set(st.outPad.x, st.outPad.y, 80, 'obj_' + z.zone + '_3'); return true; }
      // nearest ready resource
      const list = z.zone === 'forest' ? gs.trees : z.zone === 'farm' ? gs.wheat : z.zone === 'mine' ? gs.rocks : gs.animals;
      let best = null, bd = 1e12;
      // (v3.5 review) a resource behind a fence (e.g. an ore rock seen from outside the mine) is a long walk round
      const fence = gs.collision.fenceBetween ? (n) => gs.collision.fenceBetween(p.x, p.y, n.x, n.y) : () => false;
      let bc = 1e12;
      for (const n of list) {
        if (!n.ready()) continue;
        const d = gdist(p.x, p.y, n.x, n.y);
        if (d >= bc) continue;
        const c = d + (d > 120 && fence(n) ? 700 : 0);
        if (c < bc) { bc = c; best = n; }
      }
      if (best) bd = gdist(p.x, p.y, best.x, best.y);
      if (best && bd > 90) { set(best.x, best.y, z.zone === 'forest' ? 200 : z.zone === 'hunt' ? 70 : 90, 'obj_' + z.zone + '_1'); return true; }
      if (best) { this.textKey = 'obj_' + z.zone + '_1'; this.target = null; return true; }
      return false;
    }
    return false;
  }

  /** idle player: the next useful thing to do. Text = the specific instruction, or the next goal. */
  nextAction(set, goal) {
    const gs = this.gs, p = gs.player;
    // carrying something: take it where it goes
    for (let i = p.stack.items.length - 1; i >= 0; i--) {
      const d = this.destination(p.stack.items[i].type);
      if (d && !d.pad.contains(p.x, p.y)) { set(d.pad.x, d.pad.y, 60, d.key, d.text); return true; }
    }
    if (p.room <= 0) return false;
    // coins waiting
    for (const c of this.cashes()) if (c.value >= 10 && !c.pad.contains(p.x, p.y)) { set(c.x, c.y, 40, 'obj_cash'); return true; }
    // the station with the most finished products (stations with a porter empty themselves)
    let best = null;
    for (const st of gs.stationList) {
      if (!st.enabled || st.outStack.count < 3 || gs.porters.some((w) => w.station === st)) continue;
      if (!best || st.outStack.count > best.outStack.count) best = st;
    }
    if (best && !best.outPad.contains(p.x, p.y)) { set(best.outPad.x, best.outPad.y, 80, goal ? goal.key : TAKE_KEY[best.id], goal ? goal.text : null); return true; }
    return false;
  }

  update(dt) {
    this.t += dt;
    this.evalT -= dt;
    if (this.evalT <= 0) { this.evaluate(0.2 - this.evalT); this.evalT = 0.2; }
    const tg = this.target;
    if (!tg) { this.arrow.setVisible(false); this.gs.ui.setObjective(this.textKey, null, this.text); return; }
    const bounce = Math.abs(Math.sin(this.t * 4.2)) * 16;
    this.arrow.setVisible(true).setPosition(tg.x, tg.y - tg.h - bounce);
    this.gs.ui.setObjective(this.textKey, tg, this.text);
  }
}
