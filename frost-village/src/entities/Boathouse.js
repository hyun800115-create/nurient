// Boathouse + boats (v3). The boathouse stands on the east shore. Buy a rowboat on its boat pad:
// a fisherman rows out along a sea route (row anim, wake, sfx_row), fishes for a while, comes back
// to the pier with a stack of fish and unloads it onto the catch pad — porters (or the chief) take
// the fish to the cannery / grill. Upgrade to the fishing boat (coins + a fishing rod): faster,
// and it brings big tuna. sfx_boat_horn when leaving and coming home.

import { Assets } from '../core/Assets.js';
import { BALANCE } from '../data/balance.js';
import { WORLD, shoreY } from '../data/world.js';
import { DIR_BASE, DIR_FLIP, dirFromVec } from '../core/Iso.js';
import { Pad } from './Pad.js';
import { ItemStack } from './ItemStack.js';

const DIR_IDX = { E: 0, SE: 1, S: 2, SW: 3, W: 4, NW: 5, N: 6, NE: 7 };

export class Boathouse {
  constructor(gs, site) {
    this.gs = gs; this.site = site;
    this.x = site.x; this.y = site.y;
    this.id = 'dock';
    this.enabled = true;
    const r = Assets.sprite('boathouse');
    this.img = gs.add.sprite(this.x, this.y, r.tex, r.frame).setOrigin(r.anchor[0], r.anchor[1]).setDepth(this.y);
    gs.lazyImage(this.img, 'boathouse');
    gs.addOccluder(this.img);
    this.workAnim = null;
    const d = Assets.def('boathouse');
    this.d = d;
    const fp = d.footprint || [226, 113];
    this.obstacle = gs.collision.add(this.x - 10, this.y + 4, fp[0] * 0.38, 'boathouse');
    const op = d.outPoint || [-63, 59];
    // the catch pad: fish the boat brings in (a "station output" for porters and the chief)
    this.outPad = new Pad(gs, this.x + op[0], this.y + op[1] + 26, 'output', 1.45, { icon: 'item_fish_raw', iconSize: 44 });
    this.outStack = new ItemStack(gs, { scale: 1, cols: [[-15, -4], [15, 5]], alternate: true, max: 30 });
    this.output = 'item_fish_raw';
    this.cfg = { porterHome: [-60, 44] };
    // mooring spot: the pier end (dockPoint), pushed out until it is clearly in the water
    const dp = d.dockPoint || [149, 23];
    const m = { x: this.x + dp[0], y: this.y + dp[1] };
    for (let i = 0; i < 20 && m.y > shoreY(m.x) - 26; i++) { m.x += 11; m.y -= 5.7; }
    this.moor = m;
    this.dockDir = DIR_IDX[d.dockDir || 'NE'];
    const B = WORLD.boathouse || {};
    const bp = B.boatPad || [-196, 52];
    this.boatPad = { x: this.x + bp[0], y: this.y + bp[1] };
    this.route = (B.route || [[90, -110], [190, -250], [230, -420]]).map((q) => ({ x: m.x + q[0], y: m.y + q[1] }));
    const fa = B.fishArea || [240, -470, 150];
    this.fishArea = { x: m.x + fa[0], y: m.y + fa[1], r: fa[2] };
    this.boat = null;
    this.level = 0;
    this.busyT = 0;
  }

  /** buy / upgrade the boat: level 1 rowboat, 2 fishing boat */
  setBoat(level, instant) {
    if (level <= this.level) return;
    this.level = level;
    const old = this.boat;
    const st = old ? { x: old.x, y: old.y, state: old.state } : null;
    if (old) old.destroy();
    this.boat = new Boat(this.gs, this, level);
    if (st && st.state !== 'dock') { this.boat.x = st.x; this.boat.y = st.y; this.boat.state = 'back'; this.boat.ri = this.route.length - 1; }
    if (!instant) {
      const b = this.boat;
      this.gs.effects.sheet('fx_poof', b.x, b.y - 20, { size: 200 });
      this.gs.effects.burst('star', b.x, b.y - 40, 14);
      this.gs.effects.sheet('fx_wake_ring', b.x, b.y, { size: 200, depth: b.y - 2 });
      this.gs.focusCamera(b.x, b.y - 40, 1800);
    }
  }

  setEnabled(v) {
    this.enabled = v;
    this.img.setVisible(v); this.outPad.setVisible(v); this.outStack.setVisible(v); this.obstacle.active = v;
    if (this.boat) this.boat.setVisible(v);
  }
  revealObjects() { return [this.img, this.outPad.img]; }

  /** the chief on the catch pad picks up fish */
  takeTo(ch, capacity) {
    if (this.outStack.count === 0 || ch.stack.count + ch.stack.incoming >= capacity) return false;
    return this.gs.moveItem(this.outStack, ch.stack, null, { dur: 230, height: 55, sfx: 'pickup' });
  }

  update(dt) {
    this.outStack.layout(this.outPad.x, this.outPad.y + 6, this.outPad.y, 0, dt);
    if (!this.enabled) return;
    if (this.boat) this.boat.update(dt);
    if (this.busyT > 0) {
      this.busyT -= dt;
      if (!this.working) { const a = Assets.spriteAnim('boathouse', 'work'); if (a) { this.working = true; this.img.play(a); } }
    } else if (this.working) { this.working = false; this.img.stop(); Assets.apply(this.img, 'boathouse'); }
  }

  serialize() {
    const o = {};
    for (const it of this.outStack.items) o[it.type] = (o[it.type] || 0) + 1;
    for (const ty of this.outStack.inTypes) o[ty] = (o[ty] || 0) + 1;
    // fish still in the boat count as landed
    if (this.boat) for (const it of this.boat.cargo.items) o[it.type] = (o[it.type] || 0) + 1;
    return { level: this.level, catch: o };
  }
  restore(s) {
    if (!s) return;
    if (s.level) this.setBoat(Math.min(2, s.level), true);
    if (s.catch) for (const ty of ['item_fish_raw', 'item_fish_big']) for (let i = 0; i < (s.catch[ty] || 0) && this.outStack.count < this.outStack.max; i++) this.outStack.push(ty, null, this.gs.effects);
  }
}

// ------------------------------------------------------------------ boat
export class Boat {
  constructor(gs, house, level) {
    this.gs = gs; this.house = house; this.level = level;
    this.key = level >= 2 ? 'boat_fishing' : 'boat_rowboat';
    this.moveAnim = level >= 2 ? 'sail' : 'row';
    this.cfgB = (BALANCE.boats && (level >= 2 ? BALANCE.boats.fishing : BALANCE.boats.rowboat)) || { speed: 70, fishTime: 12, fish: 6, big: 0 };
    this.x = house.moor.x; this.y = house.moor.y;
    this.dir = house.dockDir;
    this.state = 'dock';
    this.t = 1.5;
    this.ri = 0;
    this.vx = 0; this.vy = 0;
    this.visible = true;
    this.sprite = gs.add.sprite(this.x, this.y, '__WHITE').setDepth(this.y);
    this.sprite.setVisible(false);
    this.def = Assets.charDef(this.key);
    this.wake = null;
    this.ringT = 0;
    this.rowT = 0;
    this.cargo = new ItemStack(gs, { scale: 0.6, cols: [[-10, 0], [10, 3]], alternate: true, max: 24 });
    this.animKey = '';
    this.splashT = 0;
    this.fishT = 0;
  }

  get ready() { return Assets.charReady(this.key); }

  setVisible(v) { this.visible = v; this.sprite.setVisible(v && this.ready); this.cargo.setVisible(v); if (this.wake) this.wake.setVisible(false); }

  play(anim) {
    const base = DIR_BASE[this.dir], flip = DIR_FLIP[this.dir];
    const k = this.key + ':' + anim + ':' + base;
    this.sprite.setFlipX(flip);
    if (k === this.animKey) return;
    this.animKey = k;
    if (this.gs.anims.exists(k)) this.sprite.play(k);
  }

  horn() { this.gs.sfxAt(Assets.audioDef('sfx_boat_horn') ? 'sfx_boat_horn' : 'sfx_whoosh', this.x, this.y, { volume: 0.6, throttle: 1500 }); }

  /** steer toward (tx, ty) over the water; true on arrival */
  steer(tx, ty, dt, tol = 10) {
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy * 2);
    if (d <= tol) { this.vx = this.vy = 0; return true; }
    const sp = this.cfgB.speed || 70;
    const k = Math.min(1, (sp * dt) / d);
    this.x += dx * k; this.y += dy * k;
    this.vx = dx / d * sp; this.vy = dy / d * sp;
    const nd = dirFromVec(dx, dy);
    if (nd !== this.dir) this.dir = nd;
    return false;
  }

  update(dt) {
    const gs = this.gs, H = this.house;
    if (this.sprite.texture.key === '__WHITE' && this.ready) { this.sprite.setOrigin(this.def.anchor[0], this.def.anchor[1]); this.sprite.setVisible(this.visible); this.animKey = ''; }
    let moving = false;
    switch (this.state) {
      case 'dock': {
        this.dir = H.dockDir;
        this.t -= dt;
        if (this.t <= 0 && this.cargo.count === 0) { this.state = 'out'; this.ri = 0; this.horn(); gs.events.emit('boatOut'); }
        break;
      }
      case 'out': {
        moving = true;
        const w = H.route[this.ri];
        if (this.steer(w.x, w.y, dt, 14)) {
          this.ri++;
          if (this.ri >= H.route.length) { this.state = 'fish'; this.fishT = this.cfgB.fishTime || 10; this.pickSpot(); }
        }
        break;
      }
      case 'fish': {
        this.fishT -= dt;
        if (this.spot && !this.steer(this.spot.x, this.spot.y, dt * 0.5, 8)) moving = true;
        else if (this.spot) this.spot = null;
        this.splashT -= dt;
        if (this.splashT <= 0) {
          this.splashT = 1.2 + Math.random();
          this.catchOne();
        }
        if (this.fishT <= 0) { this.state = 'back'; this.ri = H.route.length - 1; }
        break;
      }
      case 'back': {
        moving = true;
        const w = this.ri >= 0 ? H.route[this.ri] : H.moor;
        if (this.steer(w.x, w.y, dt, this.ri >= 0 ? 14 : 4)) {
          this.ri--;
          if (this.ri < -1) { this.state = 'unload'; this.t = 0.4; this.horn(); this.dir = H.dockDir; gs.events.emit('boatHome'); }
        }
        break;
      }
      case 'unload': {
        this.t -= dt;
        if (this.t <= 0) {
          this.t = 0.18;
          if (this.cargo.count === 0) { this.state = 'dock'; this.t = BALANCE.boats.dockTime || 2.5; break; }
          if (H.outStack.room > 0) {
            gs.moveItem(this.cargo, H.outStack, null, { dur: 300, height: 80, sfx: 'drop' });
            H.busyT = 1.2;
          } else this.t = 0.8;     // catch pad full: wait for the porters
        }
        break;
      }
    }
    this.play(moving ? this.moveAnim : 'idle');
    this.sprite.setPosition(this.x, this.y);
    const d = this.y;
    if (this.sprite.depth !== d) this.sprite.setDepth(d);
    // wake under the hull while moving + rings at the stern
    const base = DIR_BASE[this.dir], flip = DIR_FLIP[this.dir];
    const wp = (this.def.wakePoint && this.def.wakePoint[base]) || [0, 0];
    const wx = this.x + (flip ? -wp[0] : wp[0]), wy = this.y + wp[1];
    const onScreen = this.visible && gs.isOnScreen(this.x, this.y, 200);
    if (moving && onScreen) {
      if (!this.wake) this.wake = gs.effects.loop('fx_wake', this.x, this.y, this.level >= 2 ? 300 : 190, d - 2);
      if (this.wake) { this.wake.setVisible(true).setPosition((this.x + wx) / 2, (this.y + wy) / 2).setDepth(d - 2); this.wake.setFlipX(flip); }
      this.ringT -= dt;
      if (this.ringT <= 0) { this.ringT = 0.28; gs.effects.sheet('fx_wake_ring', wx, wy, { size: this.level >= 2 ? 170 : 120, depth: d - 3 }); }
      if (this.moveAnim === 'row') {
        this.rowT -= dt;
        if (this.rowT <= 0) { this.rowT = Assets.animDuration(this.key, 'row') || 0.67; gs.sfxAt('sfx_row', this.x, this.y, { volume: 0.5, throttle: 300 }); }
      }
    } else if (this.wake) this.wake.setVisible(false);
    // the catch rides in the boat
    const cp = (this.def.cargoPoint && this.def.cargoPoint[base]) || [0, -30, false];
    this.cargo.layout(this.x + (flip ? -cp[0] : cp[0]), this.y + cp[1], d + (cp[2] ? -0.5 : 0.5), 0, dt);
  }

  pickSpot() {
    const a = this.house.fishArea;
    const ang = Math.random() * Math.PI * 2, r = Math.random() * a.r;
    this.spot = { x: a.x + Math.cos(ang) * r, y: Math.min(a.y + Math.sin(ang) * r * 0.5, shoreY(a.x) - 80) };
  }

  /** a fish jumps into the boat (total per trip from balance.js) */
  catchOne() {
    const gs = this.gs, c = this.cfgB;
    const big = this.cargo.countOf('item_fish_big'), raw = this.cargo.countOf('item_fish_raw');
    let type = null;
    if (big < (c.big || 0) && (raw >= (c.fish || 0) || Math.random() < 0.5)) type = 'item_fish_big';
    else if (raw < (c.fish || 0)) type = 'item_fish_raw';
    if (!type) { if (Math.random() < 0.3) this.pickSpot(); return; }
    const sx = this.x + (Math.random() - 0.5) * 80, sy = this.y - 6 + Math.random() * 20;
    if (gs.isOnScreen(this.x, this.y, 150)) {
      gs.effects.sheet('fx_splash', sx, sy, { size: 70 });
      gs.effects.burst('splash', sx, sy, 4);
      gs.sfxAt('sfx_splash', this.x, this.y, { volume: 0.3, throttle: 300 });
    }
    gs.spawnItemTo(type, sx, sy, { stack: this.cargo, alive: true, x: this.x, y: this.y }, false);
  }

  destroy() {
    this.sprite.destroy();
    if (this.wake) this.wake.destroy();
    this.cargo.clear(this.gs.effects);
  }
}
