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
import { dirOf, renderDir, DIR8 } from '../systems/RailPath.js';
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

  /** (v4.2) the art of a consist key: the real train2 car when merged, else its CODE-1 stand-in ((CODE-2) only when the
   *  train2 manifest could not be had: the stand-ins' pages are then asked for — Neighbours loads train2, not them) */
  look(key) {
    const real = Assets.m && Assets.m.characters && Assets.m.characters[key];
    if (real || !STAND_IN[key]) return { base: key, scale: 1, tint: null, crates: real ? 0 : key === 'train_boxcar' ? 8 : key === 'train_flatcar' ? 6 : 0, real: !!real };
    if (Assets.fragments.train2 === false && !this.standInAsked) { this.standInAsked = true; Assets.loadFragment(this.gs, 'town', { only: ['train_car_a', 'train_car_b'] }); }
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
      for (const c of this.cars) {
        if (!c.spr.visible) continue;
        // ((CODE-2) train2 nightGlow: every lit side window, the lanterns the camera sees, the flat car's red tail lamps)
        const G = c.look.real && c.def.nightGlow;
        if (G) {
          const tint = G.tint ? parseInt(String(G.tint).slice(1), 16) : null;
          if (G.windowK) this.routePoints(c, 'windowPoints', (x, y) => out.push({ x, y, k: G.windowK }));
          if (G.lampK) this.routePoints(c, 'lampPoints', (x, y) => out.push({ x, y, k: G.lampK, tint }));
        } else if (c.key === 'train_coach') { const p = this.routePoint(c, 'lampPoint'); if (p) out.push({ x: p.x, y: p.y, k: 0.7 }); }
      }
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
      // the box car while it has room (its open door: cargoPoint), then the flat car's deck
      const box = this.cars.find((q) => q.key === 'train_boxcar'), flat = this.cars.find((q) => q.key === 'train_flatcar');
      const c = box && this.cargo < this.capOf('train_boxcar') ? box : (flat || box);
      if (!c || !c.spr.visible) return null;
      if (c.def.cargoSlots && c.def.cargoSlots[c.dir]) {
        const sl = c.def.cargoSlots[c.dir], q = sl[Math.max(0, this.cargo - this.capOf('train_boxcar')) % sl.length];
        return { x: c.spr.x + (c.flip ? -q[0] : q[0]), y: c.spr.y + q[1] - 10, depth: c.spr.depth + 1 };
      }
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
      this.cars.push({ key: q.key, off: q.off, len: q.len, idx: q.idx, spr, sh, def, look, anim: '', dir: 'NE', flip: true, hd: 'NW', hk: -1, crates: null, door: 0 });
    }
    this.realLooks = this.cars.map((c) => c.look.real).join();
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
    let p = (tb && tb[c.dir]) || dflt;
    // ((CODE-2) train2 lists several points per dir (lamps, windows): the first one)
    if (p && Array.isArray(p[0])) p = p[0];
    if (!p) return null;
    const k = c.look.scale || 1;
    return { x: c.spr.x + (c.flip ? -p[0] : p[0]) * k, y: c.spr.y + p[1] * k };
  }
  /** (CODE-2) every point of a list table (train2 windowPoints / lampPoints) of car c in world px */
  routePoints(c, field, fn) {
    const tb = c.def[field], L = tb && tb[c.dir];
    if (!L || !c.spr.visible) return;
    for (const p of L) if (p) fn(c.spr.x + (c.flip ? -p[0] : p[0]), c.spr.y + p[1]);
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

  /** (CODE-2) the box car's door: door_open forwards at a station, the same frames reversed to close it */
  doorAnim(c, open) {
    const gs = this.gs, k = this.animKey(c.look.base, 'door_open', c.dir);
    if (!k || k.indexOf(':door_open:') < 0) return null;
    if (open) return k;
    const rk = k.replace(':door_open:', ':door_close:');
    if (!gs.anims.exists(rk)) {
      const a = gs.anims.get(k);
      gs.anims.create({ key: rk, frames: a.frames.map((f) => ({ key: f.textureKey, frame: f.textureFrame })).reverse(), frameRate: a.frameRate, repeat: 0 });
    }
    return rk;
  }

  updateRoute(dt) {
    const gs = this.gs, rail = this.rail, P = rail.path;
    this.t += dt;
    if ((this.readyT = (this.readyT || 0) - dt) <= 0) {
      this.readyT = 1;
      // ((CODE-2) the train2 cars arrived (or a stand-in look became real): the cars are made again)
      if (this.cars.map((c) => this.look(c.key).real).join() !== this.realLooks) this.buildRoute();
      else if (!this.ready) this.applyRouteTextures();
    }
    const show = rail.running && this.ready;
    const v = gs.cameras.main.worldView;
    const m = rail.m, speed = rail.speed, moving = speed > 0.02;
    const F = this._f || (this._f = {}), Bk = this._b || (this._b = {});
    let anyVis = false, anyCurve = false, prevHk = -1;
    const atStation = rail.phase === 'atOurs' || rail.phase === 'atTown';
    for (const c of this.cars) {
      const s = m - c.off;
      // ((CODE-2, train2 trainConsist.curvePlacement) each car at the MIDPOINT of its bogie chord (± 0.4 × length): on
      //  the R 1.75-cell curves the arc point lies ~0.3 m outside the chord and pushed neighbouring cars apart)
      P.at(s + 0.4 * c.len, F); P.at(s - 0.4 * c.len, Bk);
      const x = (F.x + Bk.x) / 2, y = (F.y + Bk.y) / 2;
      const near = show && x > v.x - FAR && x < v.right + FAR && y > v.y - FAR && y < v.bottom + FAR;
      if (c.spr.visible !== near) c.spr.setVisible(near);
      if (c.sh && c.sh.__ok && c.sh.visible !== near) c.sh.setVisible(near);
      if (c.crates) for (const k of c.crates) if (!near && k.visible) k.setVisible(false);
      if (!near) { prevHk = -1; continue; }
      anyVis = true;
      if (F.curve || Bk.curve) anyCurve = true;
      // heading: the chord angle -> nearest of 8 headings, kept until it is more than 22.5 + 8 degrees away
      const ang = Math.atan2(F.j - Bk.j, F.i - Bk.i), step = Math.PI / 4;
      let hk = c.hk;
      if (hk < 0) hk = ((Math.round(ang / step) % 8) + 8) % 8;
      else { let dd = ang - hk * step; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); if (Math.abs(dd) > (22.5 + 8) * Math.PI / 180) hk = ((Math.round(ang / step) % 8) + 8) % 8; }
      // ((v4.2 fix, visual L1) two coupled cars are never more than one heading (45°) apart: on the loop-exit S-curve
      //  the coach's hysteresis kept its end view behind an engine already in side view for ~1 s)
      if (prevHk >= 0) {
        const diff = ((hk - prevHk + 12) % 8) - 4;
        if (Math.abs(diff) >= 2) {
          let best = prevHk, bd = Infinity;
          for (const q of [prevHk - 1, prevHk, prevHk + 1]) { const k8 = (q + 8) % 8; let e = ang - k8 * step; e = Math.abs(Math.atan2(Math.sin(e), Math.cos(e))); if (e < bd) { bd = e; best = k8; } }
          hk = best;
        }
      }
      c.hk = hk;
      prevHk = hk;
      const hd = DIR8[hk], rd = renderDir(hd);
      c.hd = hd;
      if (rd.dir !== c.dir || rd.flip !== c.flip) {
        c.dir = rd.dir; c.flip = rd.flip; c.anim = '';
        // ((CODE-2, train2 engineFlip) the town engine is not symmetric about its anchor: mirrored, its origin is 1 − ax)
        const ax = c.def.anchor ? c.def.anchor[0] : 0.5, ay = c.def.anchor ? c.def.anchor[1] : 0.8;
        c.spr.setOrigin(c.flip ? 1 - ax : ax, ay);
      }
      c.spr.setFlipX(c.flip);
      c.spr.setPosition(x, y);
      if (c.spr.depth !== y) c.spr.setDepth(y);
      // the box car's door: open while it stands at a station (SE / NE, mirrored), closed before it pulls away
      const doorCar = c.key === 'train_boxcar' && c.look.real;
      const wantDoor = doorCar && atStation && !moving && rail.t > 0.6 && rail.t < rail.dur(rail.phase) - 1.2;
      let want;
      if (doorCar && (wantDoor || c.door === 1)) {
        if (wantDoor && c.door !== 1) { want = this.doorAnim(c, true); c.door = 1; }
        else if (!wantDoor && c.door === 1) { want = this.doorAnim(c, false); c.door = 2; }
        else want = c.anim;
        if (want && want !== c.anim) { c.anim = want; c.spr.anims.play(want); }
      } else {
        if (c.door === 2 && c.spr.anims.isPlaying && c.anim && c.anim.indexOf(':door_close:') > 0) want = c.anim;
        else { c.door = 0; want = this.animKey(c.look.base, moving ? 'move' : 'idle', c.dir); }
        if (want && want !== c.anim) {
          c.anim = want; c.spr.anims.play(want);
          // (a curve dir is packed at 4 of its 8 move frames: the loop plays at half the frame rate)
          const a = gs.anims.get(want), full = (c.def.anims && c.def.anims.move && c.def.anims.move.frames) || 8;
          c.frK = moving && a ? Math.min(1, a.frames.length / full) : 1;
        }
        // wheels: frame rate follows the speed (train2: slip-free at 8 frames per trackPerLoopM; the engine 12 fps at
        // 2.6 m/s on its art)
        const per = c.def.trackPerLoopM ? (8 / c.def.trackPerLoopM) / 12 : 1 / 2.6;
        c.spr.anims.timeScale = moving ? Math.max(0.15, speed * per) * (c.frK || 1) : 1;
      }
      // the ground shadow of this heading (not mirrored: the light does not flip)
      if (c.sh && c.sh.__sf) {
        const fr = c.sh.__sf.frames && c.sh.__sf.frames[hd];
        if (fr && fr !== c.shFrame) {
          const tk = Assets.texOf(c.sh.__sf.atlas, fr);
          if (tk) { c.sh.setTexture(tk, fr); const a = c.sh.__sf.anchor || [0.5, 0.6]; c.sh.setOrigin(a[0], a[1]); c.sh.__ok = true; c.shFrame = fr; c.sh.setVisible(true); }
        }
        c.sh.setPosition(x, y);
      }
      if (c.look.crates || c.def.cargoSlots) this.drawCrates(c, atStation);
    }
    this.shown = anyVis;
    this.onCurve = anyVis && moving && anyCurve;
    // (v4.2 §5.5) the station-square float labels step above the dwelling train's cars (gs.labelAvoid, floatLabel.bob)
    gs.labelAvoid = anyVis && atStation ? this.rects() : null;
    // smoke from the chimney while moving (trails back: the engine leads)
    if (anyVis && moving) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = SMOKE_EVERY;
        const e = this.cars[0], sp = this.routePoint(e, 'smokePoint');
        if (sp && gs.isOnScreen(e.spr.x, e.spr.y, 200)) gs.effects.sheet('fx_smoke_puff', sp.x, sp.y - 6, { size: 70, depth: e.spr.y + 2 });
      }
    } else if (anyVis && atStation) {
      // ((CODE-2) the engine's idle wisps are not packed: a slow puff of steam while it stands instead)
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 1.6;
        const e = this.cars[0], sp = this.routePoint(e, 'smokePoint');
        if (sp && gs.isOnScreen(e.spr.x, e.spr.y, 200)) gs.effects.sheet('fx_smoke_puff', sp.x, sp.y - 4, { size: 46, depth: e.spr.y + 2 });
      }
    }
    if (this.lbls && this.lbls.length) this.updateLabels(dt);
  }

  /** the freight cars' crates: (CODE-1 stand-ins) code crates; (train2) the box car shows its own load through the open
   *  door (door_open art), the flat car stacks crate icons on its cargoSlots (stackStep px per crate, the deck fills
   *  slot by slot from the back) */
  drawCrates(c, open) {
    const gs = this.gs;
    if (!c.crates) c.crates = [];
    const real = c.look.real && c.def.cargoSlots;
    if (c.look.real && c.key === 'train_boxcar') { for (const k of c.crates) if (k.visible) k.setVisible(false); return; }
    const tex = Assets.has('crate') ? Assets.texOf(Assets.def('crate').atlas, 'crate') : null;
    const k = c.look.scale || 1;
    const hx = c.flip ? -1 : 1;
    if (real) {
      const slots = c.def.cargoSlots[c.dir] || [];
      const step = Number(c.def.stackStep) || 14;
      const load = Math.max(0, this.cargo - this.capOf('train_boxcar'));
      const per = Math.max(1, Math.ceil(this.capOf('train_flatcar') / Math.max(1, slots.length)));
      const H = Math.min(4, per), want = slots.length * H;
      while (c.crates.length < want) c.crates.push(gs.add.image(-9999, -9999, '__WHITE').setVisible(false));
      // the load spread over the deck: one crate icon stands for cap / (slots × H) items, layer by layer, ≤ 4 high
      const n = Math.min(want, Math.ceil((load * want) / Math.max(1, this.capOf('train_flatcar'))));
      let q = 0;
      for (let si = 0; si < slots.length; si++) {
        const sl = slots[si];
        for (let h = 0; h < H; h++, q++) {
          const im = c.crates[q];
          const idx = h * slots.length + si;      // fill the deck layer by layer
          const on = idx < n && !!tex;
          if (im.visible !== on) im.setVisible(on);
          if (!on) continue;
          if (im.texture.key !== tex) im.setTexture(tex, 'crate').setOrigin(0.375, 0.58).setDisplaySize(40, 38);
          im.setPosition(c.spr.x + sl[0] * hx, c.spr.y + sl[1] - h * step);
          im.setDepth(c.spr.depth + (sl[2] ? -0.001 : 0.001) + idx * 1e-4);
        }
      }
      for (let r = q; r < c.crates.length; r++) if (c.crates[r].visible) c.crates[r].setVisible(false);
      return;
    }
    const box = c.key === 'train_boxcar';
    const cap = (c.look.crates || 6) * 4;
    const before = box ? 0 : this.capOf('train_boxcar');
    const load = Math.max(0, Math.min(cap, this.cargo - before));
    const n = Math.min(c.look.crates || 6, Math.ceil(load / 4));
    while (c.crates.length < (c.look.crates || 6)) c.crates.push(gs.add.image(-9999, -9999, '__WHITE').setVisible(false));
    const cp = (c.def.cargoPoint && c.def.cargoPoint[c.dir]) || [19, -46];
    const bx = c.spr.x + (c.flip ? -cp[0] : cp[0]) * k, by = c.spr.y + cp[1] * k;
    // the stack spreads along the car's heading on screen
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
  /** crates a freight car holds (Freight: box car 32, flat car 24; 화물칸 크게 adds to both) */
  capOf(key) {
    const c = this.cars.find((q) => q.key === key);
    if (!c) return 0;
    if (c.look.real) { const F = this.gs.v42 && this.gs.v42.freight, tot = F ? F.cap() : 56; return key === 'train_boxcar' ? Math.round(tot * 32 / 56) : tot - Math.round(tot * 32 / 56); }
    return (c.look.crates || 0) * 4;
  }

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
      const l = gs.add.text(c.spr.x, c.spr.y - 110, tx, { fontFamily: gs.font, fontSize: '17px', fontStyle: '800', color: '#ffffff', stroke: '#35506e', strokeThickness: 5, resolution: 2 }).setOrigin(0.5, 1).setDepth(9000);
      l.__car = c;
      this.lbls.push(l);
    }
  }
  /** (CODE-2) where a car's label sits: 6 px over its drawn roof (train2 labelTopDir), else 110 px up */
  labelY(c) { const L = c.def.labelTopDir; return c.spr.y + (L && L[c.dir] !== undefined ? L[c.dir] : -110 * (c.look.scale || 1)); }
  updateLabels(dt) {
    this.lblT -= dt;
    for (const l of this.lbls) { const c = l.__car; l.setPosition(c.spr.x, this.labelY(c)); l.setAlpha(Math.min(1, Math.max(0, this.lblT / 0.6))); }
    if (this.lblT <= 0) { for (const l of this.lbls) l.destroy(); this.lbls = []; }
  }

  /** (v4.2) is world point (x, y) on a drawn car? */
  hit(x, y) { for (const c of this.cars) { if (!c.spr.visible) continue; const b = c.spr.getBounds(); if (x >= b.x + 10 && x <= b.right - 10 && y >= b.y + 14 && y <= b.bottom - 4) return true; } return false; }

  /** (v4.2) each drawn car's world rect (station float labels avoid them while the train stands) */
  rects() {
    const out = this._rects || (this._rects = []);
    out.length = 0;
    for (const c of this.cars) { if (!c.spr.visible) continue; const b = c.spr.getBounds(); out.push({ x: b.x + 6, y: b.y + 8, w: b.width - 12, h: b.height - 12 }); }
    return out.length ? out : null;
  }

  /** (v4.2) the train's screen rect while it stands (station float labels avoid it) */
  rect() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of this.cars) { if (!c.spr.visible) continue; const b = c.spr.getBounds(); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.right); y1 = Math.max(y1, b.bottom); }
    return x0 < x1 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
  }
}

export { S2 };
