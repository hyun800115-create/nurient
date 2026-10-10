// Docks — the vans and trucks on the centre's stage: coming along the east lane (the owner's van stops by the front
// door to let the owner out), up the dock lane, backing into a bay (the dock hand waves them in, the roll-up door
// opens), loading / unloading, out again (picking the owner up at the kerb by the door). Outside actors: plain y-sort
// with the frontTest rule; a driver doll (delivery_driver) in seat 0, the owner in seat 1 while aboard.

import { VehicleSprite } from './VehicleSprite.js';
import { glowTex } from './art.js';

export class Docks {
  constructor(view) {
    this.v = view;
    this.spr = new Map();          // model vehicle id -> { s: VehicleSprite, driver, passenger, glows }
    this.shown = true;
  }
  update(dt, list, night) {
    const v = this.v, seen = new Set();
    for (const q of list) {
      seen.add(q.id);
      let e = this.spr.get(q.id);
      if (!e) {
        e = { s: new VehicleSprite(v), driver: v.rig({ preset: q.role === 'truck' ? 'delivery_driver' : 'delivery_driver', seed: 900 + (parseInt(String(q.id).slice(1), 10) || 0) % 7 }, 'drv:' + q.id), passenger: null, glows: [] };
        this.spr.set(q.id, e);
      }
      // the owner rides in seat 1 until they hop out at the door, and again after the pick-up
      if (q.ownerAboard && q.ownerLook && !e.passenger) e.passenger = v.rig(q.ownerLook, 'own:' + q.id);
      if (!q.ownerAboard && e.passenger) { v.drop(e.passenger); e.passenger = null; }
      if (!this.shown) { e.s.hide(); for (const r of [e.driver, e.passenger]) if (r) r.visible(false); continue; }
      const x = v.bx + q.pos[0], y = v.by + q.pos[1];
      const depth = v.outside(x, y);
      const people = [];
      if (e.driver) { e.driver.visible(true); people.push({ seat: 0, rig: e.driver }); }
      if (e.passenger) { e.passenger.visible(true); people.push({ seat: 1, rig: e.passenger }); }
      e.s.sync({ key: q.key, x, y, dir: q.dir, anim: q.moving ? 'move' : 'idle', alpha: q.alpha, depth, shadowDepth: v.D - 0.44 + (q.pos[1] + 600) * 1e-7, people, speed: q.reversing ? 0.8 : 1 });
      this.lamps(e, q, x, y, night);
    }
    for (const [id, e] of this.spr) if (!seen.has(id)) { e.s.destroy(); if (e.driver) v.drop(e.driver); if (e.passenger) v.drop(e.passenger); for (const g of e.glows) g.destroy(); this.spr.delete(id); }
  }
  /** headlamps at night (warm glows at lightPoints, ADD) */
  lamps(e, q, x, y, night) {
    const d = e.s.def;
    const pts = night > 0.08 && d && d.lightPoints ? (d.lightPoints[q.dir === 'SW' || q.dir === 'SE' ? 'SE' : 'NE'] || []) : [];
    while (e.glows.length < pts.length) e.glows.push(this.v.scene.add.image(0, 0, glowTex(this.v.scene)).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    const flip = q.dir === 'SW' || q.dir === 'NW';
    for (let i = 0; i < e.glows.length; i++) {
      const g = e.glows[i], p = pts[i];
      if (!p) { g.setVisible(false); continue; }
      g.setVisible(true).setPosition(x + (flip ? -p[0] : p[0]), y + p[1]).setScale(0.9).setTint(0xfff0c8).setAlpha(Math.min(0.9, night * 1.6) * q.alpha).setDepth(this.v.fxDepth - 28);
    }
  }
  count() { return this.spr.size; }
  setVisible(on) { this.shown = on; }
  destroy() { for (const e of this.spr.values()) { e.s.destroy(); for (const g of e.glows) g.destroy(); } this.spr.clear(); }
}
