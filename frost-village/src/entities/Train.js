// The snow train's pictures (v4, docs/v4_plan.md §4): engine + coach(es) + goods wagon on the j = 0 track,
// ((v4.2, docs/v42_plan.md §5.5) a RouteRail (rail.path) is drawn by the route branch below: every car follows the
//  balloon-loop route, heading from the chord between its bogies -> nearest of 8 headings (S, SE, E, NE, N rendered;
//  SW, W, NW mirrored), move while moving / idle when stopped, a ground shadow per heading. CODE-1 stand-ins: the
//  coach = train_car_a × 1.33 (sky tint), the box car = train_car_b × 1.15 and the flat car = train_car_b × 1.07 with
//  code crates; the real train2 cars take over by key as soon as their manifest is merged (CODE-2).)
// drawn heading NW (NE frames mirrored) — push-pull: toward our station the engine leads; toward the town it
// pushes and every car plays its move loop backwards. Smoke while moving, the lamp at night (DayClock reads
// lampPoint()), wheels at a frame rate that follows the speed. Sprites are hidden when far from the view.

import { Assets } from '../core/Assets.js';
import { DEPTH } from '../systems/DepthSort.js';
import { L4 } from '../data/world.js';
import { dirOf, renderDir } from '../systems/RailPath.js';
import { t } from '../data/strings.js';

const S2 = Math.SQRT2;
const HEAD = 'NE';              // rendered dir (flipped = NW)
const SMOKE_EVERY = 0.35;
const FAR = 900;                // px beyond the view: sprites hidden
// (v4.2 CODE-1) stand-ins for the train2 cars until their art is merged (same keys: the art replaces them by key)
const STAND_IN = {
  train_coach: { base: 'train_car_a', scale: 1.33, tint: 0xdcecff },
  train_boxcar: { base: 'train_car_b', scale: 1.15, crates: 8 },
  train_flatcar: { base: 'train_car_b', scale: 1.07, crates: 6 },
};
const LABEL_KEYS = { train_coach: 'car_coach', train_boxcar: 'car_box', train_flatcar: 'car_flatN' };

export class Train {
  constructor(gs, rail) {
    this.gs = gs;
    this.rail = rail;
    this.cars = [];
    this.t = 0;
    this.smokeT = 0;
    this.cargo = 0;
    this.shown = false;
    this.route = !!(rail && rail.path);
    this.build();
  }

  /** (v4.2) the art of a consist key: the real train2 car when merged, else its CODE-1 stand-in */
  look(key) {
    const real = Assets.m && Assets.m.characters && Assets.m.characters[key];
    if (real || !STAND_IN[key]) return { base: key, scale: 1, tint: null, crates: key === 'train_boxcar' ? 8 : key === 'train_flatcar' ? 6 : 0, real: !!real };
    return Object.assign({ real: false }, STAND_IN[key]);
  }

  /** (re)make the car sprites for the rail's consist */
  build() {
    if (this.route) return this.buildRoute();
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
    if (this.route) return this.applyRouteTextures();
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
    if (this.route) return this.routePoint(this.cars[0], 'lampPoint');
    const c = this.cars[0];
    if (!c || !c.spr.visible) return null;
    const lp = c.def.lampPoint && c.def.lampPoint[HEAD];
    return lp ? { x: c.spr.x - lp[0], y: c.spr.y + lp[1] } : null;
  }
  /** windows of the coaches (night glow) */
  coachPoints(out) {
    if (this.route) {
      for (const c of this.cars) if (c.key === 'train_coach') { const p = this.routePoint(c, c.look.real ? 'windowPoints' : 'lampPoint'); if (p) out.push({ x: p.x, y: p.y, k: 0.7 }); }
      return out;
    }
    for (const c of this.cars) {
      if (c.key !== 'train_car_a' || !c.spr.visible) continue;
      const lp = c.def.lampPoint && c.def.lampPoint[HEAD];
      if (lp) out.push({ x: c.spr.x - lp[0], y: c.spr.y + lp[1], k: 0.7 });
    }
    return out;
  }
  /** a car's anchor (x, y) by key ('train_car_b' -> the goods wagon) */
  carAt(key) { if (this.route && key === 'train_car_b') key = 'train_boxcar'; const c = this.cars.find((q) => q.key === key); return c ? { x: c.spr.x, y: c.spr.y, def: c.def } : null; }

  update(dt) {
    if (this.route) return this.updateRoute(dt);
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
    if (this.route) {
      // the box car while it has room on its picture, then the flat car
      const box = this.cars.find((q) => q.key === 'train_boxcar'), flat = this.cars.find((q) => q.key === 'train_flatcar');
      const c = box && this.cargo < (box.look.crates || 8) * 4 ? box : (flat || box);
      if (!c || !c.spr.visible) return null;
      const p = this.routePoint(c, 'cargoPoint', [19, -46]);
      return p ? { x: p.x, y: p.y, depth: c.spr.depth + 1 } : null;
    }
    const c = this.cars.find((q) => q.key === 'train_car_b');
    if (!c || !c.spr.visible) return null;
    const cp = (c.def.cargoPoint && c.def.cargoPoint[HEAD]) || [19, -46];
    return { x: c.spr.x - cp[0], y: c.spr.y + cp[1], depth: c.spr.depth + 1 };
  }

  /** sprites in the view (occlusion subjects: cars hide behind row-A shops) */
  forEachVisible(fn) { for (const c of this.cars) if (c.spr.visible) fn(c.spr, c); }

  destroy() { for (const c of this.cars) this.killCar(c); this.cars = []; if (this.lbls) for (const l of this.lbls) l.destroy(); this.lbls = []; }

  // =================================================================================================== (v4.2) route
  killCar(c) { c.spr.destroy(); if (c.sh) c.sh.destroy(); if (c.crates) for (const k of c.crates) k.destroy(); }

  buildRoute() {
    for (const c of this.cars) this.killCar(c);
    this.cars = [];
    const gs = this.gs;
    for (const q of this.rail.consist()) {
      const look = this.look(q.key);
      const def = Assets.charDef(look.base);
      const spr = gs.add.sprite(-9999, -9999, '__WHITE').setOrigin(def.anchor[0], def.anchor[1]).setVisible(false).setScale(look.scale);
      if (look.tint) spr.setTint(look.tint);
      const sf = def.shadowFrames;
      let sh = null;
      if (sf && sf.atlas) { sh = gs.add.image(-9999, -9999, '__WHITE').setVisible(false).setDepth(DEPTH.SHADOW + 1).setScale(look.scale); sh.__sf = sf; }
      this.cars.push({ key: q.key, off: q.off, len: q.len, idx: q.idx, spr, sh, def, look, anim: '', dir: 'NE', flip: true, hd: 'NW', crates: null });
    }
    this.applyRouteTextures();
  }

  applyRouteTextures() {
    const gs = this.gs;
    for (const c of this.cars) {
      c.def = Assets.charDef(c.look.base);
      c.anim = '';
      c.shFrame = '';
      if (c.sh && c.sh.__sf) c.sh.__ok = false;
    }
    this.ready = this.cars.every((c) => gs.anims.exists(c.look.base + ':idle:NE') || gs.anims.exists(c.look.base + ':move:NE') || gs.anims.exists(c.look.base + ':idle:SE'));
  }

  /** a manifest point table of car c ([dx, dy] per rendered dir) in world px, mirrored with the car */
  routePoint(c, field, dflt) {
    if (!c || !c.spr.visible) return null;
    const tb = c.def[field];
    const p = (tb && tb[c.dir]) || dflt;
    if (!p) return null;
    const k = c.look.scale || 1;
    return { x: c.spr.x + (c.flip ? -p[0] : p[0]) * k, y: c.spr.y + p[1] * k };
  }

  /** the anim key that exists for (anim, dir) of a base atlas (dir falls back to the nearest rendered one) */
  animKey(base, an, dir) {
    const anims = this.gs.anims;
    const k = base + ':' + an + ':' + dir;
    if (anims.exists(k)) return k;
    const near = { S: ['SE', 'E'], E: ['SE', 'NE'], N: ['NE', 'E'], SE: ['E', 'S', 'NE'], NE: ['E', 'N', 'SE'] }[dir] || ['NE'];
    for (const d of near) { const q = base + ':' + an + ':' + d; if (anims.exists(q)) return q; }
    return anims.exists(base + ':idle:NE') ? base + ':idle:NE' : null;
  }

  updateRoute(dt) {
    const gs = this.gs, rail = this.rail, P = rail.path;
    this.t += dt;
    if (!this.ready) { if ((this.readyT = (this.readyT || 0) - dt) <= 0) { this.readyT = 1; this.applyRouteTextures(); } }
    const show = rail.running && this.ready;
    const v = gs.cameras.main.worldView;
    const m = rail.m, speed = rail.speed, moving = speed > 0.02;
    const A = this._a || (this._a = {}), F = this._f || (this._f = {}), Bk = this._b || (this._b = {});
    let anyVis = false;
    const atStation = rail.phase === 'atOurs' || rail.phase === 'atTown';
    for (const c of this.cars) {
      const s = m - c.off;
      P.at(s, A);
      const x = A.x, y = A.y;
      const near = show && x > v.x - FAR && x < v.right + FAR && y > v.y - FAR && y < v.bottom + FAR;
      if (c.spr.visible !== near) c.spr.setVisible(near);
      if (c.sh && c.sh.__ok && c.sh.visible !== near) c.sh.setVisible(near);
      if (c.crates) for (const k of c.crates) if (!near && k.visible) k.setVisible(false);
      if (!near) continue;
      anyVis = true;
      // heading: the chord between the two bogies (± 0.4 × length)
      P.at(s + 0.4 * c.len, F); P.at(s - 0.4 * c.len, Bk);
      const hd = dirOf(F.i - Bk.i, F.j - Bk.j), rd = renderDir(hd);
      c.hd = hd;
      if (rd.dir !== c.dir || rd.flip !== c.flip) { c.dir = rd.dir; c.flip = rd.flip; c.anim = ''; }
      c.spr.setFlipX(c.flip);
      c.spr.setPosition(x, y);
      if (c.spr.depth !== y) c.spr.setDepth(y);
      const want = this.animKey(c.look.base, moving ? 'move' : 'idle', c.dir);
      if (want && want !== c.anim) {
        c.anim = want; c.spr.anims.play(want);
        // (a curve dir is packed at 4 of its 8 move frames: the loop plays at half the frame rate)
        const a = gs.anims.get(want), full = (c.def.anims && c.def.anims.move && c.def.anims.move.frames) || 8;
        c.frK = moving && a ? Math.min(1, a.frames.length / full) : 1;
      }
      // wheels: frame rate follows the speed (12 fps at 2.6 m/s on the art)
      c.spr.anims.timeScale = moving ? Math.max(0.15, speed / 2.6) * (c.frK || 1) : 1;
      // the ground shadow of this heading (not mirrored: the light does not flip)
      if (c.sh && c.sh.__sf) {
        const fr = c.sh.__sf.frames && c.sh.__sf.frames[hd];
        if (fr && fr !== c.shFrame) {
          const tk = Assets.texOf(c.sh.__sf.atlas, fr);
          if (tk) { c.sh.setTexture(tk, fr); const a = c.sh.__sf.anchor || [0.5, 0.6]; c.sh.setOrigin(a[0], a[1]); c.sh.__ok = true; c.shFrame = fr; c.sh.setVisible(true); }
        }
        c.sh.setPosition(x, y);
      }
      if (c.look.crates) this.drawCrates(c, atStation);
    }
    this.shown = anyVis;
    // smoke from the chimney while moving (trails back: the engine leads)
    if (anyVis && moving) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = SMOKE_EVERY;
        const e = this.cars[0], sp = this.routePoint(e, 'smokePoint');
        if (sp && gs.isOnScreen(e.spr.x, e.spr.y, 200)) gs.effects.sheet('fx_smoke_puff', sp.x, sp.y - 6, { size: 70, depth: e.spr.y + 2 });
      }
    }
    if (this.lbls && this.lbls.length) this.updateLabels(dt);
  }

  /** (v4.2 CODE-1) code crates on the freight cars: the box car fills first (8 per row of 4), then the flat car */
  drawCrates(c, open) {
    const gs = this.gs;
    const box = c.key === 'train_boxcar';
    const cap = (c.look.crates || 6) * 4;
    const before = box ? 0 : this.capOf('train_boxcar');
    const load = Math.max(0, Math.min(cap, this.cargo - before));
    const n = Math.min(c.look.crates || 6, Math.ceil(load / 4));
    if (!c.crates) c.crates = [];
    while (c.crates.length < (c.look.crates || 6)) c.crates.push(gs.add.image(-9999, -9999, '__WHITE').setVisible(false));
    const tex = Assets.has('crate') ? Assets.texOf(Assets.def('crate').atlas, 'crate') : null;
    const k = c.look.scale || 1;
    const cp = (c.def.cargoPoint && c.def.cargoPoint[c.dir]) || [19, -46];
    const bx = c.spr.x + (c.flip ? -cp[0] : cp[0]) * k, by = c.spr.y + cp[1] * k;
    // the stack spreads along the car's heading on screen
    const hx = c.flip ? -1 : 1;
    for (let q = 0; q < c.crates.length; q++) {
      const im = c.crates[q];
      const on = q < n && !!tex && (!box || open || q < 4);
      if (im.visible !== on) im.setVisible(on);
      if (!on) continue;
      if (im.texture.key !== tex) im.setTexture(tex, 'crate').setOrigin(0.375, 0.58).setDisplaySize(30, 28);
      const col = q % 3, row = Math.floor(q / 3);
      im.setPosition(bx + (col - 1) * 15 * hx, by + (col - 1) * 7 - row * 14);
      im.setDepth(c.spr.depth + 1 + q * 0.01);
    }
  }
  capOf(key) { const c = this.cars.find((q) => q.key === key); return c ? (c.look.crates || 0) * 4 : 0; }

  /** (v4.2) the first arrivals after the update: a label over each car for 4 s (객차 · 손님 14명 ...) */
  showLabels(riders, crates) {
    const gs = this.gs;
    if (this.lbls) for (const l of this.lbls) l.destroy();
    this.lbls = [];
    this.lblT = 4;
    for (const c of this.cars) {
      const key = LABEL_KEYS[c.key];
      if (!key || !c.spr.visible) continue;
      const n = c.key === 'train_coach' ? riders : c.key === 'train_boxcar' ? Math.min(crates, this.capOf('train_boxcar')) : Math.max(0, crates - this.capOf('train_boxcar'));
      const tx = c.key === 'train_flatcar' && n <= 0 ? t('car_flat') : t(key, { n });
      const l = gs.add.text(c.spr.x, c.spr.y - 110, tx, { fontFamily: gs.font, fontSize: '17px', fontStyle: '800', color: '#ffffff', stroke: '#35506e', strokeThickness: 5, resolution: 2 }).setOrigin(0.5).setDepth(9000);
      l.__car = c;
      this.lbls.push(l);
    }
  }
  updateLabels(dt) {
    this.lblT -= dt;
    for (const l of this.lbls) { const c = l.__car; l.setPosition(c.spr.x, c.spr.y - 110 * (c.look.scale || 1)); l.setAlpha(Math.min(1, Math.max(0, this.lblT / 0.6))); }
    if (this.lblT <= 0) { for (const l of this.lbls) l.destroy(); this.lbls = []; }
  }

  /** (v4.2) is world point (x, y) on a drawn car? */
  hit(x, y) { for (const c of this.cars) { if (!c.spr.visible) continue; const b = c.spr.getBounds(); if (x >= b.x + 10 && x <= b.right - 10 && y >= b.y + 14 && y <= b.bottom - 4) return true; } return false; }

  /** (v4.2) the train's screen rect while it stands (station float labels avoid it) */
  rect() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of this.cars) { if (!c.spr.visible) continue; const b = c.spr.getBounds(); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.right); y1 = Math.max(y1, b.bottom); }
    return x0 < x1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }
}

export { S2 };
