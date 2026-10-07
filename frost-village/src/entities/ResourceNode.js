// Gatherable resources: pine trees (-> stump -> regrow), ore rocks (-> rubble -> regrow),
// wheat plots (4 growth stages) and the fish net (refills with fish).

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { BALANCE } from '../data/balance.js';
import { DEPTH } from '../systems/DepthSort.js';

class Node {
  constructor(gs, kind, x, y) {
    this.gs = gs; this.kind = kind; this.x = x; this.y = y;
    this.reservedBy = null;
    this.enabled = true;     // false while its zone is locked
    this.standDist = 46;
  }
  ready() { return false; }
  /** where a gatherer coming from (fx, fy) should stand */
  standPoint(fx, fy, out) {
    let dx = fx - this.x, dy = (fy - this.y) * 2;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    out = out || {};
    out.x = this.x + dx * this.standDist;
    out.y = this.y + (dy * this.standDist) / 2;
    return out;
  }
  setEnabled(v) { this.enabled = v; }
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
    Audio.play('sfx_chop', { volume: by === gs.player ? 1 : 0.55 });
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
      this.img.setAngle(0).setScale(1);
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
      this.img.setScale(0.2, 0.1);
      this.gs.tweens.add({ targets: this.img, scaleX: 1, scaleY: 1, duration: 650, ease: 'Back.easeOut' });
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
    this.obstacle = gs.collision.add(x, y, fp[0] * 0.38, 'rock');
  }
  ready() { return this.enabled && this.hp > 0; }
  hit(by) {
    if (!this.ready()) return null;
    this.hp--;
    const gs = this.gs;
    const ip = by.impactPoint ? by.impactPoint() : { x: this.x, y: this.y - 30 };
    gs.effects.burst('rock', ip.x, ip.y);
    gs.effects.burst('spark', ip.x, ip.y, 4);
    Audio.play('sfx_mine', { volume: by === gs.player ? 1 : 0.55 });
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
    Audio.play('sfx_harvest', { volume: by === gs.player ? 1 : 0.55 });
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

// ------------------------------------------------------------------ fish net
export class Net extends Node {
  constructor(gs, x, y, opts) {
    super(gs, 'net', x, y);
    this.item = 'item_fish_raw'; this.playerAnim = 'harvest'; this.workerKey = 'fisherman';
    this.max = BALANCE.resources.net.max;
    this.stock = this.max;
    this.timer = 0;
    this.img = Assets.image(gs, x, y, 'fish_net').setDepth(y);
    this.gather = { x: x + opts.gather[0], y: y + opts.gather[1] };
    this.fisherSpot = { x: x + opts.fisherSpot[0], y: y + opts.fisherSpot[1] };
    this.obstacle = gs.collision.add(x, y - 6, 92, 'net');
    // jumping fish inside the net
    this.fish = [];
    for (let i = 0; i < this.max; i++) {
      const f = gs.effects.takeItem('item_fish_raw');
      const a = (i / this.max) * Math.PI * 2;
      f.__hx = x + Math.cos(a) * 34 + (i % 2 ? 8 : -8);
      f.__hy = y - 18 + Math.sin(a) * 12;
      f.setPosition(f.__hx, f.__hy).setScale(0.6).setDepth(y + 0.5);
      f.__t = Math.random() * 3;
      this.fish.push(f);
    }
  }
  ready() { return this.enabled && this.stock > 0; }
  hit(by) {
    if (!this.ready()) return null;
    this.stock--;
    const gs = this.gs;
    gs.effects.burst('splash', this.x + (Math.random() - 0.5) * 60, this.y - 20, 6);
    Audio.play('sfx_splash', { volume: by === gs.player ? 0.9 : 0.5 });
    return this.item;
  }
  /** world position of the fish leaving the net */
  fishPos() { const f = this.fish[Math.max(0, this.stock)] || this.fish[0]; return { x: f.__hx, y: f.__hy }; }
  update(dt) {
    if (this.stock < this.max) {
      this.timer += dt;
      if (this.timer >= BALANCE.resources.net.refill) {
        this.timer = 0;
        this.stock++;
        if (this.gs.isOnScreen(this.x, this.y, 200)) this.gs.effects.burst('splash', this.x + (Math.random() - 0.5) * 80, this.y - 30, 4);
      }
    }
    const now = this.gs.time.now / 1000;
    for (let i = 0; i < this.fish.length; i++) {
      const f = this.fish[i];
      const vis = i < this.stock;
      if (f.visible !== vis) f.setVisible(vis);
      if (!vis) continue;
      const t = now * 2.2 + i * 1.7;
      const hop = Math.max(0, Math.sin(t)) ;
      f.y = f.__hy - hop * hop * 16;
      f.x = f.__hx + Math.sin(t * 0.5) * 3;
      f.setFlipX(Math.cos(t * 0.5) < 0);
      f.setAngle(Math.sin(t) * 25);
    }
  }
}
