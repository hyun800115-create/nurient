// Unlock order (기획서 §4): which pad is shown next, what it opens, upgrades, village complete.

import { BALANCE } from '../data/balance.js';
import { WORLD } from '../data/world.js';
import { UnlockPad } from '../entities/UnlockPad.js';
import { Audio } from '../core/Audio.js';
import { Assets } from '../core/Assets.js';
import { t } from '../data/strings.js';

// id, type, what it needs first (after = a step id, flag = a one-time event such as the first sale).
// side: optional purchases next to the main road (clerks, porters) — "next goal" text ignores them.
export const STEPS = [
  { id: 'hire_fisherman', type: 'hire', worker: 'fisherman', after: null },
  // (v2) clerks: right after the first sale at that seller, cheap — they take payments at the register
  { id: 'hire_clerk_market', type: 'clerk', seller: 'market', after: null, flag: 'firstSale', side: true },
  // (v2) porters: after that line's worker — carry the station's products along the roads to the seller
  { id: 'porter_grill', type: 'porter', station: 'grill', after: 'hire_fisherman', side: true },
  { id: 'zone_forest', type: 'zone', zone: 'forest', after: 'hire_fisherman' },
  { id: 'hire_clerk_trade', type: 'clerk', seller: 'trade', after: 'zone_forest', flag: 'firstTrade', side: true },
  { id: 'hire_lumberjack', type: 'hire', worker: 'lumberjack', after: 'zone_forest' },
  { id: 'porter_sawmill', type: 'porter', station: 'sawmill', after: 'hire_lumberjack', side: true },
  // (step 4 = backpack/boots upgrades at the bench, appears after hire_lumberjack)
  { id: 'zone_farm', type: 'zone', zone: 'farm', after: 'hire_lumberjack' },
  { id: 'hire_farmer', type: 'hire', worker: 'farmer', after: 'zone_farm' },
  { id: 'porter_bakery', type: 'porter', station: 'bakery', after: 'hire_farmer', side: true },
  { id: 'zone_mine', type: 'zone', zone: 'mine', after: 'hire_farmer' },
  { id: 'hire_miner', type: 'hire', worker: 'miner', after: 'zone_mine' },
  { id: 'porter_smelter', type: 'porter', station: 'smelter', after: 'hire_miner', side: true },
  { id: 'zone_hunt', type: 'zone', zone: 'hunt', after: 'hire_miner' },
  { id: 'hire_hunter', type: 'hire', worker: 'hunter', after: 'zone_hunt' },
  { id: 'porter_smokehouse', type: 'porter', station: 'smokehouse', after: 'hire_hunter', side: true },
];
export const BENCH_AFTER = 'hire_lumberjack';
export const COMPLETE_AFTER = 'hire_hunter';
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
    this.pads = {};           // id -> UnlockPad
    this.upPads = {};         // capacity / speed
    this.benchOpen = false;
  }

  isDone(id) { return !!this.done[id]; }
  anyDone(re) { for (const k in this.done) if (this.done[k] && re.test(k)) return true; return false; }
  capacity() { return BALANCE.upgrades.capacity.values[this.up.capacity]; }
  speedMult() { return BALANCE.upgrades.speed.values[this.up.speed]; }
  zonesOpen() { let n = 0; for (const z of ZONE_IDS) if (this.done[z]) n++; return n; }
  get complete() { return this.isDone(COMPLETE_AFTER); }

  visibleSteps() { return STEPS.filter((s) => !this.done[s.id] && (!s.after || this.done[s.after]) && (!s.flag || this.flags[s.flag])); }

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
      const cfg = WORLD.pads[s.id];
      if (!cfg) continue;
      const cost = BALANCE.costs[s.id];
      let icon = 'ui_icon_lock';
      if (s.type === 'hire') icon = 'portrait_' + s.worker;
      else if (s.type === 'clerk') icon = Assets.pick('ui_icon_clerk', s.seller === 'trade' ? 'portrait_npc_clerk_b' : 'portrait_npc_clerk_a', 'ui_icon_worker');
      else if (s.type === 'porter') icon = Assets.pick('ui_icon_porter', 'portrait_npc_porter_a', 'ui_icon_backpack');
      const kind = s.type === 'zone' ? 'unlock' : 'hire';
      const pad = new UnlockPad(gs, s.id, cfg.x, cfg.y, {
        kind, cost, paid: this.paid[s.id] || 0, label: s.id, icon, iconSize: s.type === 'zone' ? 40 : 54,
        padTex: s.type === 'clerk' ? Assets.pick('ui_pad_clerk', 'ui_pad_hire') : s.type === 'porter' ? Assets.pick('ui_pad_porter', 'ui_pad_hire') : null,
        onComplete: (p) => this.completeStep(s, p),
      });
      this.pads[s.id] = pad;
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
    if (s.type === 'zone') gs.ui.banner(t('unlocked', { name: t('z_' + s.zone) }));
    else if (s.type === 'hire') gs.ui.banner(t('hired', { name: t('w_' + s.worker) }));
    else if (s.type === 'clerk') gs.ui.banner(t('hired', { name: t('w_clerk') }));
    else if (s.type === 'porter') gs.ui.banner(t('hired', { name: t('w_porter') }));
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
    else if (s.type === 'clerk') { const sel = s.seller === 'trade' ? gs.trade : gs.market; sel.register.hireClerk(instant, x, y); }
    else if (s.type === 'porter') gs.hirePorter(s.station, instant, x, y);
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

  /** partial payments so they survive reloads */
  collectPaid() {
    for (const id in this.pads) { const p = this.pads[id]; if (p.paid > 0) this.paid[id] = p.paid; else delete this.paid[id]; }
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
    for (const id in this.pads) { const p = this.pads[id]; if (p.active && !p.done && p.remaining <= coins && (!best || p.remaining < best.remaining)) best = p; }
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
    return { done: this.done, paid: this.paid, up: this.up, celebrated: this.celebrated, hints: this.hints, seen: this.seen, flags: this.flags };
  }
}
