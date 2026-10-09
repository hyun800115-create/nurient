// The snow train's pictures (v4, docs/v4_plan.md §4): engine + coach(es) + goods wagon on the j = 0 track,
// drawn heading NW (NE frames mirrored) — push-pull: toward our station the engine leads; toward the town it
// pushes and every car plays its move loop backwards. Smoke while moving, the lamp at night (DayClock reads
// lampPoint()), wheels at a frame rate that follows the speed. Sprites are hidden when far from the view.

import { Assets } from '../core/Assets.js';
import { DEPTH } from '../systems/DepthSort.js';
import { L4 } from '../data/world.js';

const S2 = Math.SQRT2;
const HEAD = 'NE';              // rendered dir (flipped = NW)
const SMOKE_EVERY = 0.35;
const FAR = 900;                // px beyond the view: sprites hidden

export class Train {
  constructor(gs, rail) {
    this.gs = gs;
    this.rail = rail;
    this.cars = [];
    this.t = 0;
    this.smokeT = 0;
    this.cargo = 0;
    this.shown = false;
    this.build();
  }

  /** (re)make the car sprites for the rail's consist */
  build() {
    for (const c of this.cars) { c.spr.destroy(); if (c.sh) c.sh.destroy(); }
    this.cars = [];
    for (const q of this.rail.consist()) {
      const def = Assets.charDef(q.key);
      const spr = this.gs.add.sprite(-9999, -9999, '__WHITE').setOrigin(def.anchor[0], def.anchor[1]).setFlipX(true).setVisible(false);
      const sf = def.shadowFrames;
      let sh = null;
      if (sf && sf.atlas) {
        sh = this.gs.add.image(-9999, -9999, '__WHITE').setVisible(false).setDepth(DEPTH.SHADOW + 1);
        sh.__sf = sf;
      }
      this.cars.push({ key: q.key, off: q.off, spr, sh, def, anim: '' });
    }
    this.applyTextures();
  }

  /** the train atlases arrived (or were already there): frames + reversed move loops */
  applyTextures() {
    const gs = this.gs;
    for (const c of this.cars) {
      const def = Assets.charDef(c.key);
      c.def = def;
      // (v4-B) the atlas may be packed into pages (tools/build/pack_pages.py: the NE frames + shadow_NW)
      const fr = c.sh && c.sh.__sf && c.sh.__sf.frames && c.sh.__sf.frames.NW;
      const tk = fr ? Assets.texOf(c.sh.__sf.atlas, fr) : null;
      if (tk) { c.sh.setTexture(tk, fr); const a = c.sh.__sf.anchor || [0.5, 0.6]; c.sh.setOrigin(a[0], a[1]); c.sh.__ok = true; }
      // reversed move loop (pushed toward the town: the wheels turn the other way)
      const fwd = c.key + ':move:' + HEAD, rev = c.key + ':move_rev:' + HEAD;
      if (gs.anims.exists(fwd) && !gs.anims.exists(rev)) {
        const a = gs.anims.get(fwd);
        gs.anims.create({ key: rev, frames: a.frames.map((f) => ({ key: f.textureKey, frame: f.textureFrame })).reverse(), frameRate: a.frameRate, repeat: -1 });
      }
      c.anim = '';
    }
    this.ready = this.cars.every((c) => gs.anims.exists(c.key + ':idle:' + HEAD) || gs.anims.exists(c.key + ':move:' + HEAD));
  }

  /** screen point of car anchor at track position m */
  pt(m) { const i = this.rail.iAt(m); return L4(i, 0); }

  /** where the engine's lamp is (night glow) */
  lampPoint() {
    const c = this.cars[0];
    if (!c || !c.spr.visible) return null;
    const lp = c.def.lampPoint && c.def.lampPoint[HEAD];
    return lp ? { x: c.spr.x - lp[0], y: c.spr.y + lp[1] } : null;
  }
  /** windows of the coaches (night glow) */
  coachPoints(out) {
    for (const c of this.cars) {
      if (c.key !== 'train_car_a' || !c.spr.visible) continue;
      const lp = c.def.lampPoint && c.def.lampPoint[HEAD];
      if (lp) out.push({ x: c.spr.x - lp[0], y: c.spr.y + lp[1], k: 0.7 });
    }
    return out;
  }
  /** a car's anchor (x, y) by key ('train_car_b' -> the goods wagon) */
  carAt(key) { const c = this.cars.find((q) => q.key === key); return c ? { x: c.spr.x, y: c.spr.y, def: c.def } : null; }

  update(dt) {
    const gs = this.gs, rail = this.rail;
    this.t += dt;
    if (!this.ready) { if ((this.readyT = (this.readyT || 0) - dt) <= 0) { this.readyT = 1; this.applyTextures(); } }
    const show = rail.running && this.ready;
    const v = gs.cameras.main.worldView;
    const mA = rail.m, vel = rail.v, moving = Math.abs(vel) > 0.02;
    const vmax = rail.B.speed || 2.6;
    let anyVis = false;
    for (const c of this.cars) {
      const [x, y] = this.pt(mA + c.off);
      const near = show && x > v.x - FAR && x < v.right + FAR && y > v.y - FAR && y < v.bottom + FAR;
      if (c.spr.visible !== near) c.spr.setVisible(near);
      if (c.sh && c.sh.__ok && c.sh.visible !== near) c.sh.setVisible(near);
      if (!near) continue;
      anyVis = true;
      c.spr.setPosition(x, y);
      if (c.spr.depth !== y) c.spr.setDepth(y);
      if (c.sh) c.sh.setPosition(x, y);
      // wheels: move loop (backwards while pushed toward the town) at a rate that follows the speed
      const want = moving ? (vel > 0 ? c.key + ':move_rev:' + HEAD : c.key + ':move:' + HEAD) : c.key + ':idle:' + HEAD;
      if (want !== c.anim && gs.anims.exists(want)) { c.anim = want; c.spr.anims.play(want); }
      c.spr.anims.timeScale = moving ? Math.max(0.15, Math.abs(vel) / vmax) : 1;
    }
    this.shown = anyVis;
    // smoke from the chimney while moving
    if (anyVis && moving) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = SMOKE_EVERY;
        const e = this.cars[0], sp = e.def.smokePoint && e.def.smokePoint[HEAD];
        if (sp && gs.isOnScreen(e.spr.x, e.spr.y, 200)) gs.effects.sheet('fx_smoke_puff', e.spr.x - sp[0], e.spr.y + sp[1] - 6, { size: 70, depth: e.spr.y + 2 });
      }
    }
  }

  /** puffs of steam at the wheels (braking / doors) */
  puffs(n) {
    const gs = this.gs;
    for (let i = 0; i < n; i++) {
      const c = this.cars[Math.floor(Math.random() * this.cars.length)];
      if (!c || !c.spr.visible) continue;
      gs.time.delayedCall(i * 120, () => gs.effects.sheet('fx_smoke_puff', c.spr.x + (Math.random() - 0.5) * 60, c.spr.y - 10, { size: 56, depth: c.spr.y + 1 }));
    }
  }

  /** (B) the goods wagon's load */
  loadCargo(n) { this.cargo = Math.max(0, this.cargo + (n || 0)); }

  /** (B) where loaded goods land on the goods wagon (world px; null while the wagon is not drawn): the
   *  manifest's cargoPoint for the drawn dir (NE, mirrored to NW) */
  cargoPoint() {
    const c = this.cars.find((q) => q.key === 'train_car_b');
    if (!c || !c.spr.visible) return null;
    const cp = (c.def.cargoPoint && c.def.cargoPoint[HEAD]) || [19, -46];
    return { x: c.spr.x - cp[0], y: c.spr.y + cp[1], depth: c.spr.depth + 1 };
  }

  /** sprites in the view (occlusion subjects: cars hide behind row-A shops) */
  forEachVisible(fn) { for (const c of this.cars) if (c.spr.visible) fn(c.spr, c); }

  destroy() { for (const c of this.cars) { c.spr.destroy(); if (c.sh) c.sh.destroy(); } this.cars = []; }
}

export { S2 };
