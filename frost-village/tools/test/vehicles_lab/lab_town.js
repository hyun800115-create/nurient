// vehicles_lab people: the real paper dolls (tools/townfolk2_compose.js over assets/townfolk + assets/townfolk2, the
// way patch P5 brings townfolk2 into the game) as bus passengers, drivers, people waiting at the stops, walkers on
// the sidewalks and crosswalks, and the chief (the player character). Implements the lab's ports.town /
// ports.dolls / ports.chief. Nothing here is game code.

import { Assets } from '../../../src/core/Assets.js';
import { DEPTH } from '../../../src/systems/DepthSort.js';
import { Townfolk2, TownfolkSprite2 } from '../../townfolk2_compose.js';
import { mulberry32 } from '../../townfolk_compose.js';
import { STOPS, PLACES, L } from '../../../src/vehicles/layout.js';

const SPEED = 72;                 // px / s

export function dirOf(dx, dy) {
  const a = Math.atan2(dy, dx) * 180 / Math.PI;
  if (a > -22.5 && a <= 22.5) return 'E';
  if (a > 22.5 && a <= 67.5) return 'SE';
  if (a > 67.5 && a <= 112.5) return 'S';
  if (a > 112.5 && a <= 157.5) return 'SW';
  if (a > 157.5 || a <= -157.5) return 'W';
  if (a > -157.5 && a <= -112.5) return 'NW';
  if (a > -112.5 && a <= -67.5) return 'N';
  return 'NE';
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** a doll rig with the surface the vehicles view asks of ports.dolls (play / place / visible / update / setLook) */
class DollRig {
  constructor(town, person) {
    this.town = town;
    this.spr = new TownfolkSprite2(town.scene, town.tf, person, -9999, -9999);
    this.anim = 'idle'; this.dir = 'S'; this.on = true;
  }
  setLook(look) { const p = this.town.person(look); this.spr.person = p; this.spr._key = ''; this.spr.refresh(true); }
  play(anim, dir) { if (anim !== this.anim || dir !== this.dir) { this.spr.play(anim, dir); this.anim = anim; this.dir = dir; } }
  place(x, y, depth, alpha = 1) {
    const s = this.spr;
    s.x = x; s.y = y;
    for (let j = 0; j < s.visibleCount; j++) { const im = s.sprites[j]; im.setPosition(x + im._dx, y + im._dy).setDepth(depth + im._z * 1e-6).setAlpha(alpha).setVisible(this.on); }
  }
  visible(on) { this.on = on; const s = this.spr; for (let j = 0; j < s.sprites.length; j++) s.sprites[j].setVisible(on && j < s.visibleCount); if (!on) for (const im of s.sprites) im.setPosition(-9999, -9999); }
  update(dt) { this.spr.update(dt * 1000); this.place(this.spr.x, this.spr.y, this.spr.sprites[0] ? this.spr.sprites[0].depth - (this.spr.sprites[0]._z || 0) * 1e-6 : 0, this.spr.sprites[0] ? this.spr.sprites[0].alpha : 1); }
  destroy() { this.spr.destroy(); }
}

/** the chief (the player character) as a seat rig: idle at seatsStand */
class ChiefRig {
  constructor(town) { this.town = town; this.on = false; }
  play(anim, dir) { this.town.chiefPose('idle', dir); }
  place(x, y, depth, alpha = 1) { const c = this.town.chiefSeat; c.setPosition(x, y).setDepth(depth).setAlpha(alpha).setVisible(true); this.on = true; }
  visible(on) { if (!on) this.town.chiefSeat.setVisible(false); this.on = on; }
  update() {}
  destroy() {}
}

export class LabTown {
  constructor(scene, tfMan) {
    this.scene = scene;
    this.tf = new Townfolk2(tfMan.townfolk);
    this.walkers = [];          // { id, rig, path, i, x, y, speed, wait, done, stopAt, onArrive }
    this.queues = {};           // stop -> [walker]
    this.n = 0;
    this.lookCache = new Map();
    // the chief: walking sprite + a sprite used when he sits in a vehicle
    this.chief = scene.add.sprite(0, 0, '__WHITE');
    const def = Assets.charDef('player');
    this.chief.setOrigin(def.anchor[0], def.anchor[1]);
    this.chiefShadow = scene.add.image(0, 0, 'veh_shadow').setDepth(DEPTH.SHADOW + 3).setDisplaySize(54, 22);
    this.chiefSeat = scene.add.sprite(0, 0, '__WHITE').setOrigin(def.anchor[0], def.anchor[1]).setVisible(false);
    this.chiefHidden = false;
    this.chiefPos = { x: 0, y: 0 };
    this.chiefMove = null;
    this.setChief(3000, 1500);
    this.chiefPose('idle', 'S');
  }

  // ------------------------------------------------------------------------------------------ looks
  /** a person from a look spec: { preset, seed } | a person object | a number (seeded everyday look) */
  person(look) {
    if (look && look.base && look.parts) return look;
    const key = typeof look === 'object' && look ? (look.preset || 'any') + ':' + (look.seed || 0) : 'n:' + look;
    let p = this.lookCache.get(key);
    if (p) return p;
    const seed = typeof look === 'object' && look ? (look.seed || 1) : hashStr(String(look));
    const rng = mulberry32(seed >>> 0);
    const G = this.tf.T.generator;
    let preset = look && look.preset;
    if (!preset) {
      const ages = ['adult', 'adult', 'adult', 'elder', 'child'];
      const age = ages[Math.floor(rng() * ages.length)];
      const bases = Object.keys(this.tf.T.bases).filter((b) => this.tf.T.bases[b].age === age);
      const base = bases[Math.floor(rng() * bases.length)];
      preset = '__veh_' + base;
      if (!G.presets[preset]) G.presets[preset] = { bases: { [base]: 1 } };
    } else if (!G.presets[preset]) preset = undefined;
    p = this.tf.generate(rng, preset);
    this.lookCache.set(key, p);
    return p;
  }
  rig(look) { return new DollRig(this, this.person(look)); }
  chiefRig() { return new ChiefRig(this); }

  // ------------------------------------------------------------------------------------------ the chief
  setChief(x, y) { this.chiefPos.x = x; this.chiefPos.y = y; this.chief.setPosition(x, y).setDepth(y); this.chiefShadow.setPosition(x, y + 1); }
  chiefPose(anim, dir) {
    const mir = { SW: 'SE', W: 'E', NW: 'NE' }[dir];
    const k = Assets.charAnim('player', anim, mir || dir);
    for (const s of [this.chief, this.chiefSeat]) if (!s.anims.currentAnim || s.anims.currentAnim.key !== k) s.play(k, true);
    this.chief.setFlipX(!!mir); this.chiefSeat.setFlipX(!!mir);
  }
  hideChief(on) { this.chiefHidden = on; this.chief.setVisible(!on); this.chiefShadow.setVisible(!on); if (!on) this.chiefSeat.setVisible(false); }
  walkChief(pts, done) { this.chiefMove = { pts: pts.map((p) => ({ x: p[0], y: p[1] })), done }; }

  // ------------------------------------------------------------------------------------------ walkers
  /** a person walking a polyline of px points (loop: start over) */
  addWalker(look, pts, opts = {}) {
    const rig = this.rig(look);
    const w = { id: 'w' + (++this.n), rig, path: pts.map((p) => ({ x: p[0], y: p[1], wait: p[2] || 0 })), i: 1, x: pts[0][0], y: pts[0][1], speed: SPEED * (opts.speed || 1), loop: !!opts.loop, wait: opts.wait || 0, hold: 0, fade: opts.fadeIn ? 0 : 1, done: opts.done || null, stand: opts.stand || null, still: !!opts.still, dir: opts.dir || 'S' };
    rig.place(w.x, w.y, w.y);
    this.walkers.push(w);
    return w;
  }
  removeWalker(w) { const i = this.walkers.indexOf(w); if (i >= 0) this.walkers.splice(i, 1); w.rig.destroy(); }

  /** the people waiting at a stop (standing at the shelter's waitPoints, facing the road) */
  fillStop(stopId, n) {
    const s = STOPS[stopId];
    const key = this.scene.labEra >= 3 ? 'bus_stop' : 'sleigh_stop';
    const wp = (Assets.def(key).waitPoints || [[16, 35], [-7, 24], [-29, 12]]);
    const q = this.queues[stopId] = this.queues[stopId] || [];
    while (q.length < n) {
      const k = q.length, p = s.sign === 'shelter' ? wp[k % wp.length] : [-30 + k * 26, 30 + k * 6];
      const w = this.addWalker(1000 + this.n * 37 + k, [[s.x + p[0] - (k >= wp.length ? 24 : 0), s.y + p[1] + (k >= wp.length ? 14 : 0)]], { still: true, dir: 'SW' });
      w.rig.play('idle', 'SW');
      q.push(w);
    }
  }

  update(dt) {
    // the chief walking
    if (this.chiefMove) {
      const m = this.chiefMove, t = m.pts[0];
      if (!t) { this.chiefMove = null; this.chiefPose('idle', this.chiefDir || 'S'); if (m.done) m.done(); }
      else {
        const dx = t.x - this.chiefPos.x, dy = t.y - this.chiefPos.y, d = Math.hypot(dx, dy), v = 150 * dt;
        if (d <= v) { this.setChief(t.x, t.y); m.pts.shift(); }
        else { this.setChief(this.chiefPos.x + dx / d * v, this.chiefPos.y + dy / d * v); this.chiefDir = dirOf(dx, dy); this.chiefPose('walk', this.chiefDir); }
      }
    }
    for (const w of this.walkers.slice()) {
      if (w.fade < 1) w.fade = Math.min(1, w.fade + dt * 2.5);
      if (w.leaving) { w.fade -= dt * 3; if (w.fade <= 0) { this.removeWalker(w); continue; } }
      if (w.still) { w.rig.place(w.x, w.y, w.y, w.fade); w.rig.spr.update(dt * 1000); continue; }
      if (w.hold > 0) { w.hold -= dt; w.rig.play('idle', w.dir); w.rig.spr.update(dt * 1000); w.rig.place(w.x, w.y, w.y, w.fade); continue; }
      const t = w.path[w.i];
      if (!t) { if (w.loop) { w.i = 0; continue; } if (w.done) { const d = w.done; w.done = null; d(w); } w.rig.play('idle', w.dir); w.rig.spr.update(dt * 1000); w.rig.place(w.x, w.y, w.y, w.fade); continue; }
      const dx = t.x - w.x, dy = t.y - w.y, d = Math.hypot(dx, dy), v = w.speed * dt * (w.hurry > 0 ? 1.8 : 1);
      if (w.hurry > 0) w.hurry -= dt;
      if (d <= v) { w.x = t.x; w.y = t.y; w.i++; if (t.wait) w.hold = t.wait; }
      else { w.x += dx / d * v; w.y += dy / d * v; w.dir = dirOf(dx, dy); }
      w.rig.play('walk', w.dir);
      w.rig.spr.update(dt * 1000);
      w.rig.place(w.x, w.y, w.y, w.fade);
    }
  }

  /** materialised walkers the vehicles yield to */
  positions() { return this.walkers.filter((w) => !w.still).map((w) => ({ id: w.id, x: w.x, y: w.y })); }
  hurry(x, y, r) { for (const w of this.walkers) if (Math.hypot(w.x - x, (w.y - y) * 2) < r * 2) { w.hurry = 2.5; w.hold = 0; } }
  count() { let n = 0; for (const w of this.walkers) n += w.rig.spr.visibleCount; return n; }
}

export { PLACES, L };
