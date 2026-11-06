// Gatherable resources: pine trees (-> stump -> regrow), ore rocks (-> rubble -> regrow),
// wheat plots (4 growth stages). ((v4.3) the fish net became the fishing deck: entities/FishingDeck.js)

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { BALANCE } from '../data/balance.js';


export function freeStandPoint(node, fx, fy, out, bad) {
  const base = Math.atan2((fy - node.y) * 2, fx - node.x);
  const col = node.gs.collision;
  out = out || {};
  // ((v4.2.0.1 final, soak R3) a ring a little further out when the first is all taken (rocks packed together), and
  //  `bad`: a further test (a mined-out rock beside it grows back to its full size); never a spot inside something
  for (const r of [node.standDist, node.standDist + 16, node.standDist + 32]) {
    for (let k = 0; k < 12; k++) {
      const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6);
      const x = node.x + Math.cos(a) * r, y = node.y + (Math.sin(a) * r) / 2;
      if (!col.blocked(x, y, 15, node.obstacle) && !(bad && bad(x, y))) { out.x = x; out.y = y; return out; }
    }
  }
  const r = node.standDist;
  out.x = node.x + Math.cos(base) * r; out.y = node.y + (Math.sin(base) * r) / 2;
  if (node.gs.freeSpot && col.blocked(out.x, out.y, 15, node.obstacle)) { const q = node.gs.freeSpot(out.x, out.y, 15, 120); out.x = q.x; out.y = q.y; }
  return out;
}

class Node {
  constructor(gs, kind, x, y) {
    this.gs = gs; this.kind = kind; this.x = x; this.y = y;
    this.reservedBy = null;
    this.enabled = true;     // false while its zone is locked
    this.standDist = 46;
  }
  ready() { return false; }
  /** where a gatherer coming from (fx, fy) should stand (a free spot around the node, nearest the gatherer first) */
  standPoint(fx, fy, out) {
    return freeStandPoint(this, fx, fy, out);
  }
  setEnabled(v) {
    this.enabled = v;
    if (this.img) this.img.setVisible(v);
    if (this.obstacle) this.obstacle.active = v;
  }
  revealObjects() { return [this.img]; }
}

// ------------------------------------------------------------------ tree
export class Tree extends Node {
  constructor(gs, x, y, key) {
    super(gs, 'tree', x, y);
    this.treeKey = key;
    this.item = 'item_log'; this.playerAnim = 'chop'; this.workerKey = 'lumberjack';
    this.hpMax = BALANCE.resources.tree.hp; this.hp = this.hpMax;
    this.timer = 0;
    this.img = Assets.image(gs, x, y, key).setDepth(y);
    this.standDist = 44;
    this.obstacle = gs.collision.add(x, y, 24, 'tree');
  }
  ready() { return this.enabled && this.hp > 0; }
  hit(by) {
    if (!this.ready()) return null;
    this.hp--;
    const gs = this.gs;
    const ip = by.impactPoint ? by.impactPoint() : { x: this.x, y: this.y - 30 };
    gs.effects.burst('wood', ip.x, ip.y);
    gs.effects.burst('snowhit', this.x, this.y - 120, 5);
    if (Math.random() < 0.6) gs.effects.burst('leaf', this.x, this.y - 90, 2);
    gs.sfxAt('sfx_chop', this.x, this.y, { volume: by === gs.player ? 1 : 0.55 }, by === gs.player);
    // wobble
    gs.tweens.killTweensOf(this.img);
    this.img.setAngle(0);
    gs.tweens.add({ targets: this.img, angle: { from: (by.x < this.x ? 4 : -4), to: 0 }, duration: 380, ease: 'Elastic.easeOut' });
    if (this.hp <= 0) this.deplete();
    return this.item;
  }
  deplete() {
    const gs = this.gs;
    gs.time.delayedCall(120, () => {
      Assets.apply(this.img, 'tree_stump');
      this.img.setAngle(0).setScale(this.scale || 1);
      gs.effects.sheet('fx_poof', this.x, this.y - 30, { size: 150 });
      gs.effects.burst('snowhit', this.x, this.y - 40, 10);
    });
    this.timer = BALANCE.resources.tree.regrow;
    this.reservedBy = null;
  }
  update(dt) {
    if (this.hp > 0) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.hp = this.hpMax;
      Assets.apply(this.img, this.treeKey);
      const sc = this.scale || 1;
      this.img.setScale(0.2 * sc, 0.1 * sc);
      this.gs.tweens.add({ targets: this.img, scaleX: sc, scaleY: sc, duration: 650, ease: 'Back.easeOut' });
      this.gs.effects.burst('snowhit', this.x, this.y - 20, 6);
    }
  }
}

// ------------------------------------------------------------------ rock
export class Rock extends Node {
  constructor(gs, x, y, key) {
    super(gs, 'rock', x, y);
    this.rockKey = key;
    this.item = 'item_ore'; this.playerAnim = 'mine'; this.workerKey = 'miner';
    this.hpMax = BALANCE.resources.rock.hp; this.hp = this.hpMax;
    this.timer = 0;
    this.img = Assets.image(gs, x, y, key).setDepth(y);
    const fp = (Assets.def(key).footprint || [136, 68]);
    this.standDist = fp[0] * 0.5 + 6;
    this.fullR = fp[0] * 0.38;
    this.obstacle = gs.collision.add(x, y, this.fullR, 'rock');
  }
  ready() { return this.enabled && this.hp > 0; }
  /** ((v4.2.0.1 final, soak R3) a spot by this rock that is not on a mined-out neighbour's rubble: it grows back to its
   *  full size (a miner sent between three rocks was left inside one, wedged 11–19 s) */
  standPoint(fx, fy, out) {
    const rocks = this.gs.rocks || [];
    return freeStandPoint(this, fx, fy, out, (x, y) => rocks.some((n) => n !== this && n.hp <= 0 && n.enabled && Math.hypot(x - n.x, (y - n.y) * 2) < n.fullR + 15));
  }
  /** ((v4.2.0.1 final) someone stands where this rock grows back */
  someoneOn() {
    const gs = this.gs, R = this.fullR + 14;
    const on = (a) => a && a.alive !== false && Math.hypot(a.x - this.x, (a.y - this.y) * 2) < R;
    if (on(gs.player)) return true;
    for (const a of gs.agents || []) if (on(a)) return true;
    return false;
  }
  hit(by) {
    if (!this.ready()) return null;
    this.hp--;
    const gs = this.gs;
    const ip = by.impactPoint ? by.impactPoint() : { x: this.x, y: this.y - 30 };
    gs.effects.burst('rock', ip.x, ip.y);
    gs.effects.burst('spark', ip.x, ip.y, 4);
    gs.sfxAt('sfx_mine', this.x, this.y, { volume: by === gs.player ? 1 : 0.55 }, by === gs.player);
    gs.effects.pop(this.img, 0.08, 90);
    if (this.hp <= 0) this.deplete();
    return this.item;
  }
  deplete() {
    const gs = this.gs;
    gs.time.delayedCall(120, () => {
      gs.tweens.killTweensOf(this.img);
      Assets.apply(this.img, 'rock_rubble');
      this.img.setScale(1);
      gs.effects.sheet('fx_poof', this.x, this.y - 20, { size: 170 });
      gs.effects.burst('rock', this.x, this.y - 20, 12);
    });
    this.timer = BALANCE.resources.rock.regrow;
    this.obstacle.r *= 0.6;
    this.reservedBy = null;
  }
  update(dt) {
    if (this.hp > 0) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      // ((v4.2.0.1 final, soak R3) never grown back over someone on its rubble: he would stand inside the rock
      if (this.someoneOn()) { this.timer = 0.5; return; }
      this.hp = this.hpMax;
      this.obstacle.r /= 0.6;
      Assets.apply(this.img, this.rockKey);
      this.img.setScale(0.3);
      this.gs.tweens.add({ targets: this.img, scale: 1, duration: 500, ease: 'Back.easeOut' });
      this.gs.effects.burst('rock', this.x, this.y - 10, 6);
    }
  }
}

// ------------------------------------------------------------------ wheat
export class Wheat extends Node {
  constructor(gs, x, y) {
    super(gs, 'wheat', x, y);
    this.item = 'item_wheat'; this.playerAnim = 'harvest'; this.workerKey = 'farmer';
    this.stage = 3;
    this.left = BALANCE.resources.wheat.yield;
    this.timer = 0;
    this.img = Assets.image(gs, x, y, 'crop_wheat_3').setDepth(y - 30);
    this.standDist = 40;
  }
  ready() { return this.enabled && this.stage === 3 && this.left > 0; }
  setStage(s) {
    this.stage = s;
    Assets.apply(this.img, 'crop_wheat_' + s);
  }
  hit(by) {
    if (!this.ready()) return null;
    this.left--;
    const gs = this.gs;
    const ip = by.impactPoint ? by.impactPoint() : { x: this.x, y: this.y - 20 };
    gs.effects.burst('wheat', ip.x, ip.y);
    gs.effects.burst('wheat', this.x, this.y - 30, 4);
    gs.sfxAt('sfx_harvest', this.x, this.y, { volume: by === gs.player ? 1 : 0.55 }, by === gs.player);
    gs.effects.pop(this.img, 0.1, 90);
    if (this.left <= 0) {
      gs.time.delayedCall(100, () => this.setStage(0));
      this.timer = 0;
      this.reservedBy = null;
    }
    return this.item;
  }
  update(dt) {
    if (this.stage === 3) return;
    this.timer += dt;
    const g = BALANCE.resources.wheat.growTime;
    const s = Math.min(3, Math.floor((this.timer / g) * 3));
    if (s !== this.stage) {
      this.setStage(s);
      this.gs.effects.pop(this.img, 0.12, 100);
      if (s === 3) { this.left = BALANCE.resources.wheat.yield; this.gs.effects.burst('spark', this.x, this.y - 40, 3); }
    }
  }
}

// ((v4.3) the fish net is gone: the fishing deck (entities/FishingDeck.js) keeps its surface for every caller)
