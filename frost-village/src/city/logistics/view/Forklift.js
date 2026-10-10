// Forklift — the yellow toy forklift on its loop (assets/logistics conventions.forkliftPath): faces legDir while
// driving (backwards on the dock spurs, beeping), node.dir while it lifts (the lift frames follow the fork height),
// the loaded variant (a pallet of parcels on the forks) between a pick and a drop. Its driver is a forklift_driver
// doll on the seat. Inside bands: mid / front by the leg; depth = D + band + y * 1e-6.

import { VehicleSprite } from './VehicleSprite.js';

export class Forklift {
  constructor(view) {
    this.v = view;
    this.spr = new VehicleSprite(view);
    this.driver = view.rig({ preset: 'forklift_driver', seed: 41 }, 'staff:forklift');
    this.beepT = 0;
    this.shown = true;
  }
  update(dt, f, inside) {
    const v = this.v;
    if (!inside || !this.shown) { this.spr.hide(); if (this.driver) this.driver.visible(false); return; }
    const key = f.loaded ? 'forklift_loaded' : 'forklift';
    const band = v.C.bandDepth[f.band === 'front' ? 'front' : 'mid'];
    const x = v.bx + f.pos[0], y = v.by + f.pos[1];
    const depth = v.D + band + (f.pos[1] + 400) * 1e-6 + 2e-7;
    const anim = f.phase === 'lift' ? 'lift' : f.moving ? 'move' : 'idle';
    if (this.driver) this.driver.visible(true);
    this.spr.sync({ key, x, y, dir: f.dir, anim, liftI: Math.round(f.liftK * 5), alpha: 1, depth, shadowDepth: v.D - 0.34 + (f.pos[1] + 400) * 1e-7,
      people: this.driver ? [{ seat: 0, rig: this.driver }] : [], speed: f.reversing ? 0.7 : 1 });
    // reversing: three little beeps every 1.26 s (audio6 sfx_forklift_beep)
    if (f.reversing) {
      this.beepT -= dt;
      if (this.beepT <= 0) { this.beepT = 1.26; v.sfxAt('sfx_forklift_beep', x, y, 0.8); }
    } else this.beepT = 0;
  }
  setVisible(on) { this.shown = on; if (!on) { this.spr.hide(); if (this.driver) this.driver.visible(false); } }
  destroy() { this.spr.destroy(); if (this.driver) this.driver.destroy(); }
}
