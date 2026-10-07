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

    const pad = prog.affordablePad(eco.coins, p);
    // (v2) customers waiting at an empty register come before buying things (the line is stuck)
    if (!this.inTutorial && this.registerHint(set, dt, true)) return;
    if (pad && !pad.pad.contains(p.x, p.y)) {
      const key = this.inTutorial ? 'obj_unlock' : /^hire_clerk/.test(pad.id) && !prog.anyDone(/^hire_clerk/) ? 'obj_clerk' : /^porter_/.test(pad.id) && !prog.anyDone(/^porter_/) ? 'obj_porter' : null;
      set(pad.x, pad.y, 112, key);
      return;
    }
    if (pad) return;
    if (this.inTutorial) { this.firstLoop(set); return; }
    if (this.unloadHint(set)) return;
    if (this.registerHint(set, dt, false)) return;
    if (this.upgradeHint(set, dt)) return;
    if (this.zoneHint(set, dt)) return;
    const idle = (gs.time.now - Input.lastActivity) / 1000 > IDLE_HINT && !gs.playerOnPad;
    // (v3) hungry miners, materials for a site nobody brings, a tool for a hire pad, the next building
    if (this.v3Hint(set, dt, idle)) return;
    const nx = prog.nextPad();
    let goal = nx && !prog.complete ? { key: 'obj_next:' + nx.id + ':' + nx.remaining, text: t('obj_next', { name: t(nx.id), cost: fmt(nx.remaining) }) } : null;
    if (prog.complete) goal = this.goalText();
    if (idle && this.nextAction(set, goal)) return;
    // gentle hint: lots of coins waiting on a cash pad
    for (const c of this.cashes()) if (c.value >= 40 && !c.pad.contains(p.x, p.y) && gdist(p.x, p.y, c.x, c.y) > 260) { set(c.x, c.y, 40, goal ? goal.key : null, goal ? goal.text : null); return; }
    // otherwise just name the next goal (no arrow)
    if (goal) { this.textKey = goal.key; this.text = goal.text; }
  }

  cashes() {
    const gs = this.gs;
    return [gs.market.cash, gs.trade && gs.trade.enabled ? gs.trade.cash : null, gs.store && gs.store.enabled ? gs.store.cash : null].filter(Boolean);
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
        if (bag(k) > 0) { if (pd.pad.contains(p.x, p.y)) this.textKey = 'obj_tool_give'; else set(pd.x, pd.y, 112, 'obj_tool_give', t('obj_tool_give', { name: t(k) })); return true; }
        const porterBrings = gs.porters.some((w) => (w.station && w.station.kind === 'toolsmith') || w.dest === pd);
        const ws = gs.workshops.find((w) => w.kind === 'toolsmith');
        if (!porterBrings && ws && ws.outStack.countOf(k) > 0 && p.room > 0 && (idle || pd.remaining <= gs.economy.coins)) {
          if (ws.outPad.contains(p.x, p.y)) this.textKey = 'obj_tool';
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
        if (pl.pad && pl.pad.contains(p.x, p.y)) this.textKey = 'obj_build';
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
    if (!m.register.clerk && cooked === 0 && (m.waitingPay || (front && front.arrived && front.got > 0))) {
      if (!m.register.pad.contains(p.x, p.y)) set(m.register.x, m.register.y, 46, 'obj_register');
      else this.textKey = 'obj_register_wait';
      return;
    }
    if (m.cash.value > 0 && cooked === 0 && (eco.coins + m.cash.value >= (next ? next.remaining : 0) || (raw === 0 && grill.outStack.count === 0))) {
      if (!m.cash.pad.contains(p.x, p.y)) set(m.cash.x, m.cash.y, 40, 'obj_cash');
      return;
    }
    if (cooked > 0) { set(m.shelf.x, m.shelf.y, 60, 'obj_sell'); return; }
    if (raw > 0 && (p.room <= 0 || !gs.net.ready() || raw >= Math.min(4, p.capacity))) { set(grill.inPad.x, grill.inPad.y, 50, 'obj_grill'); return; }
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
        if (s === gs.grillSink) return { pad: gs.stations.grill.inPad, key: 'obj_grill' };
        void pad;
      }
    }
    if (STORE_GOODS.indexOf(type) >= 0) return gs.store && gs.store.enabled && gs.store.stock.countOf(type) < gs.store.maxPerType ? { pad: gs.store.shelf, key: null } : (gs.warehouse ? { pad: gs.warehouse.inPad, key: null } : null);
    if (type === 'item_fish_big') return gs.warehouse ? { pad: gs.warehouse.inPad, key: null } : null;
    if (FOODS.indexOf(type) >= 0) return gs.market.stock.countOf(type) < gs.market.maxPerType ? { pad: gs.market.shelf, key: SELL_KEY[type] } : null;
    if (GOODS.indexOf(type) >= 0) return gs.trade.enabled && gs.trade.stock.countOf(type) < gs.trade.maxPerType ? { pad: gs.trade.shelf, key: SELL_KEY[type] } : null;
    const st = gs.stationByInput[type];
    return st && st.enabled && st.inStack.room > 0 ? { pad: st.inPad, key: FEED_KEY[type] } : null;
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
      if (best.pad.contains(p.x, p.y)) this.textKey = best.key;
      else set(best.pad.x, best.pad.y, 60, best.key);
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
      if (raw > 0 && (room <= 0 || raw >= 3)) { set(st.inPad.x, st.inPad.y, 50, 'obj_' + z.zone + '_2'); return true; }
      if (room <= 0) return false;
      if ((st.outStack.count > 0 || st.inStack.count > 0) && raw === 0) { set(st.outPad.x, st.outPad.y, 80, 'obj_' + z.zone + '_3'); return true; }
      // nearest ready resource
      const list = z.zone === 'forest' ? gs.trees : z.zone === 'farm' ? gs.wheat : z.zone === 'mine' ? gs.rocks : gs.animals;
      let best = null, bd = 1e12;
      for (const n of list) { if (!n.ready()) continue; const d = gdist(p.x, p.y, n.x, n.y); if (d < bd) { bd = d; best = n; } }
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
      if (d && !d.pad.contains(p.x, p.y)) { set(d.pad.x, d.pad.y, 60, d.key); return true; }
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
