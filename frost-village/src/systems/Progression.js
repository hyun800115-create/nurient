// Unlock order (기획서 §4): which pad is shown next, what it opens, upgrades, village complete.

import { BALANCE } from '../data/balance.js';
import { WORLD } from '../data/world.js';
import { UnlockPad } from '../entities/UnlockPad.js';
import { Audio } from '../core/Audio.js';
import { t } from '../data/strings.js';

// id, type, what it needs first
export const STEPS = [
  { id: 'hire_fisherman', type: 'hire', worker: 'fisherman', after: null },
  { id: 'zone_forest', type: 'zone', zone: 'forest', after: 'hire_fisherman' },
  { id: 'hire_lumberjack', type: 'hire', worker: 'lumberjack', after: 'zone_forest' },
  // (step 4 = backpack/boots upgrades at the bench, appears after hire_lumberjack)
  { id: 'zone_farm', type: 'zone', zone: 'farm', after: 'hire_lumberjack' },
  { id: 'hire_farmer', type: 'hire', worker: 'farmer', after: 'zone_farm' },
  { id: 'zone_mine', type: 'zone', zone: 'mine', after: 'hire_farmer' },
  { id: 'hire_miner', type: 'hire', worker: 'miner', after: 'zone_mine' },
  { id: 'zone_hunt', type: 'zone', zone: 'hunt', after: 'hire_miner' },
  { id: 'hire_hunter', type: 'hire', worker: 'hunter', after: 'zone_hunt' },
  // after the village is complete: second workers
  { id: 'hire2_fisherman', type: 'hire', worker: 'fisherman', after: 'hire_hunter', index: 1 },
  { id: 'hire2_lumberjack', type: 'hire', worker: 'lumberjack', after: 'hire_hunter', index: 1 },
  { id: 'hire2_farmer', type: 'hire', worker: 'farmer', after: 'hire_hunter', index: 1 },
  { id: 'hire2_miner', type: 'hire', worker: 'miner', after: 'hire_hunter', index: 1 },
  { id: 'hire2_hunter', type: 'hire', worker: 'hunter', after: 'hire_hunter', index: 1 },
];
export const BENCH_AFTER = 'hire_lumberjack';
export const COMPLETE_AFTER = 'hire_hunter';
const ZONE_IDS = ['zone_forest', 'zone_farm', 'zone_mine', 'zone_hunt'];

export class Progression {
  constructor(gs, saved) {
    this.gs = gs;
    saved = saved || {};
    this.done = Object.assign({}, saved.done || {});
    this.paid = Object.assign({}, saved.paid || {});
    this.up = Object.assign({ capacity: 0, speed: 0 }, saved.up || {});
    this.up.capacity = Math.min(this.up.capacity, BALANCE.upgrades.capacity.values.length - 1);
    this.up.speed = Math.min(this.up.speed, BALANCE.upgrades.speed.values.length - 1);
    this.celebrated = !!saved.celebrated;
    this.hints = Object.assign({}, saved.hints || {});   // zone -> true once its product was sold
    this.pads = {};           // id -> UnlockPad
    this.upPads = {};         // capacity / speed
    this.benchOpen = false;
  }

  isDone(id) { return !!this.done[id]; }
  capacity() { return BALANCE.upgrades.capacity.values[this.up.capacity]; }
  speedMult() { return BALANCE.upgrades.speed.values[this.up.speed]; }
  zonesOpen() { let n = 0; for (const z of ZONE_IDS) if (this.done[z]) n++; return n; }
  get complete() { return this.isDone(COMPLETE_AFTER); }

  visibleSteps() { return STEPS.filter((s) => !this.done[s.id] && (!s.after || this.done[s.after])); }

  /** apply saved state instantly (no animations) and create the visible pads */
  init() {
    const gs = this.gs;
    for (const s of STEPS) {
      if (!this.done[s.id]) continue;
      if (s.type === 'zone') gs.revealZone(s.zone, true);
      if (s.type === 'hire') gs.hireWorker(s.worker, s.index || 0, true);
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
      const icon = s.type === 'hire' ? 'portrait_' + s.worker : 'ui_icon_lock';
      const pad = new UnlockPad(gs, s.id, cfg.x, cfg.y, {
        kind: s.type === 'hire' ? 'hire' : 'unlock', cost, paid: this.paid[s.id] || 0, label: s.id, icon, iconSize: s.type === 'hire' ? 54 : 40,
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
    if (s.type === 'zone') {
      gs.revealZone(s.zone, false);
      gs.ui.banner(t('unlocked', { name: t('z_' + s.zone) }));
    } else if (s.type === 'hire') {
      gs.hireWorker(s.worker, s.index || 0, false, pad.x, pad.y);
      gs.ui.banner(t('hired', { name: t('w_' + s.worker) }));
    }
    if (s.id === BENCH_AFTER) gs.time.delayedCall(1400, () => this.openBench(false));
    gs.time.delayedCall(s.type === 'zone' ? 1800 : 600, () => this.syncPads());
    if (s.id === COMPLETE_AFTER && !this.celebrated) {
      this.celebrated = true;
      gs.time.delayedCall(1500, () => gs.celebrate());
    }
    gs.save(true);
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
    if (lvl >= U.values.length - 1) { pad.maxed = true; pad.done = true; pad.refresh(); }
    else gs.time.delayedCall(500, () => pad.rearm(U.costs[lvl]));
    gs.save(true);
  }

  /** partial payments so they survive reloads */
  collectPaid() {
    for (const id in this.pads) { const p = this.pads[id]; if (p.paid > 0) this.paid[id] = p.paid; }
    for (const k in this.upPads) { const p = this.upPads[k]; if (!p.maxed && p.paid > 0) this.paid['up_' + k] = p.paid; }
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
    for (const s of STEPS) if (this.pads[s.id]) return this.pads[s.id];
    return null;
  }

  serialize() {
    this.collectPaid();
    return { done: this.done, paid: this.paid, up: this.up, celebrated: this.celebrated, hints: this.hints };
  }
}
