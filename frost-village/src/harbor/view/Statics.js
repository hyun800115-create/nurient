// The harbour's standing pictures (harbor_runtime view): the quay row, the second row, 항구역 and the lighthouse from the
// harbour manifest at the §4.3 anchors, the quay props, the breakwater bollards, the coast-line halt's props, the
// buoys and the two village boats in the basin. Before its step a building is the sleepy-harbour ruin (v4
// RailStation's tint, half-buried in drifts); revived, the tint clears, the drifts pop and its lamps join the night.
// ≤ ~60 display objects; the lights go to the DayClock (ports.clock.addLight) once a building is alive.

import { BUILDINGS, PROPS, BREAKWATER_PROPS, HALT_PROPS, BUOYS, BERTHS, BREAKWATER, LR, W, L, colliders } from '../layout.js';
import { put, has, sdef, cdef, RUIN_TINT, Assets, DEPTH } from './art.js';
import { stationSign } from '../../entities/RailStation.js';
import { STEPS } from '../tuning.js';

/** drifts beside a sleeping building (lattice offsets from its anchor: the gaps at its sides, on the apron) */
const DRIFTS = [[-1, 0.9, 'decal_snow_drift_a', 0.8], [1, 0.6, 'decal_snow_drift_b', 0.85]];
/** the harbour streets lie under snow until the station brings people back (lattice) */
const STREET_DRIFTS = [[52.5, -6.4, 'a', 1.1], [56.0, -4.6, 'b', 1.0], [59.4, -7.0, 'a', 0.9], [63.0, -5.2, 'b', 1.15], [66.6, -6.8, 'a', 1.0], [70.2, -4.8, 'b', 0.95],
  [73.8, -6.2, 'a', 1.1], [77.2, -5.0, 'b', 0.9], [80.6, -6.6, 'a', 1.0], [84.0, -5.4, 'b', 1.05], [60.4, -8.4, 'b', 0.7], [68.8, -8.5, 'a', 0.7], [77.8, -8.3, 'b', 0.7]];
/** lamp points per building key (fxPoints names that glow at night) */
const LAMPS = { harbor_office: ['light'], fish_auction: ['lamp'], seafood_restaurant: ['sign'], harbor_market: ['lights'], sailor_lodge: ['sign'], ferry_terminal: ['clock'], harbor_lamp: ['light'] };

export class Statics {
  constructor(view) {
    this.v = view;
    const sc = this.sc = view.scene;
    this.blds = [];
    this.props = [];
    this.floaters = [];
    this.lit = new Set();
    for (const b of BUILDINGS) {
      const img = put(sc, b.key, b.x, b.y);
      const rec = { b, img, drifts: [], alive: null, sign: null };
      if (img && view.ports.occluders && view.ports.occluders.add) view.ports.occluders.add(img);
      if (b.key === 'train_station') rec.sign = stationSign(sc, b.x, b.y, view.lang() === 'en' ? 'Harbour Stn' : '항구역');
      this.blds.push(rec);
    }
    // (optional port) the chief walks around the buildings: v4 gs.collision.add(x, y, r, tag) circles
    this.obs = [];
    const C = view.ports.collision;
    if (C && C.add) for (const c of colliders((k) => { const d = sdef(k); return d && d.footprintM; })) { const o = C.add(c.x, c.y, c.r, 'harbor'); if (o) this.obs.push(o); }
    for (const p of PROPS) { const [x, y] = LR(p[1], p[2]); const im = put(sc, p[0], x, y); if (im) { if (p[3]) im.setScale(p[3]); this.props.push({ key: p[0], img: im, x, y }); } }
    // the breakwater: tiles + its bollards at one depth (the fleet moves it in front of ships behind it)
    this.bw = [];
    this.bwDepth = L(BREAKWATER.i0 + (BREAKWATER.i1 - BREAKWATER.i0) / 2, BREAKWATER.j)[1];
    for (const [k, x, y] of view.quays.breakwaterTiles()) { const im = put(sc, k, x, y, this.bwDepth); if (im) this.bw.push({ img: im, dz: 0 }); }
    BREAKWATER_PROPS.forEach((p, n) => { const [x, y] = LR(p[1], p[2]); const im = put(sc, p[0], x, y, this.bwDepth + 0.01); if (im) this.bw.push({ img: im, dz: 0.01 + n * 0.001 }); });
    for (const p of HALT_PROPS) { const [x, y] = LR(p[1], p[2]); const im = put(sc, p[0], x, y); if (im) this.props.push({ key: p[0], img: im, x, y, halt: true }); }
    // water props: buoys (anim) and the village boats bobbing in the basin
    for (const q of BUOYS) {
      const [x, y] = W(q.i, q.j);
      const im = put(sc, 'buoy', x, y);
      if (!im) continue;
      const an = Assets.spriteAnim('buoy', 'bob');
      let spr = im;
      if (an) { spr = sc.add.sprite(x, y, im.texture.key, im.frame.name).setOrigin(im.originX, im.originY).setDepth(y); im.destroy(); spr.play({ key: an, startFrame: (q.i | 0) % 4 }); }
      this.floaters.push({ img: spr, x, y, tilt: 0.25, r: 22, light: (sdef('buoy') || {}).fxPoints });
    }
    for (const id of ['V1', 'V2']) {
      const B = BERTHS[id], key = B.ship;
      if (!cdef(key) || !Assets.m.characters[key]) continue;
      if (!Assets.built[key]) Assets.buildCharacter(sc.game, key);
      const [x, y] = W(B.i, B.j);
      const mir = { SW: 'SE', NW: 'NE' }[B.head];
      const ak = Assets.charAnim(key, 'idle', mir || B.head);
      if (!sc.anims.exists(ak)) continue;
      const d = cdef(key);
      const spr = sc.add.sprite(x, y, '__WHITE').setOrigin(d.anchor[0], d.anchor[1]).setDepth(y).setFlipX(!!mir);
      spr.play({ key: ak, startFrame: id === 'V1' ? 0 : 1 });
      this.floaters.push({ img: spr, x, y, tilt: 0.35, def: d, dir: B.head, hull: null });
    }
    this.street = [];
    if (!view.model.has('station')) for (const [i, j, k, sc0] of STREET_DRIFTS) { const key = 'decal_snow_drift_' + k; const [x, y] = LR(i, j); const im = put(sc, key, x, y, y - 40); if (im) this.street.push(im.setScale(sc0).setAlpha(0.97)); }
    this.sync(true);
  }

  /** a building is alive once its step is built (railExt opens the harbour but wakes nothing) */
  aliveOf(b) { const m = this.v.model; return m.has(STEPS[b.step] || 'never'); }

  /** apply the ruin / alive look (instant on the first call, animated when a step is built) */
  sync(first) {
    const sc = this.sc;
    for (const r of this.blds) {
      const alive = this.aliveOf(r.b);
      if (alive === r.alive) continue;
      const was = r.alive;
      r.alive = alive;
      if (!r.img) continue;
      if (!alive) {
        r.img.setTint(RUIN_TINT).setAlpha(0.92);
        if (r.sign) r.sign.setAlpha(0.35);
        for (const [side, dj, k, s] of DRIFTS) {
          if (!has(k)) continue;
          const d = sdef(r.b.key), half = d && d.footprintM ? d.footprintM[0] / Math.SQRT2 / 2 + 0.45 : 1.6;
          const [x, y] = LR(r.b.i + side * half, -12 + dj);
          r.drifts.push(put(sc, k, x, y, y + 1).setScale(s).setAlpha(0.96));
        }
        continue;
      }
      // alive
      this.lamps(r.b.key, r.b.x, r.b.y);
      if (first || was === null) { r.img.clearTint().setAlpha(1); if (r.sign) r.sign.setAlpha(1); for (const d of r.drifts) d.destroy(); r.drifts = []; continue; }
      this.revive(r);
    }
    // the station brings people back: the streets are cleared (poof), the harbour lamps light up
    if (this.v.model.has('station') && this.street.length) {
      for (const d of this.street) { if (first) d.destroy(); else { this.sc.tweens.add({ targets: d, scale: 0.01, alpha: 0, duration: 380, delay: Math.random() * 500, ease: 'Back.easeIn', onComplete: () => d.destroy() }); this.v.fx('fx_poof', d.x, d.y - 10, 120); } }
      this.street = [];
    }
    if (this.v.model.has('station')) for (const p of this.props) if (p.key === 'harbor_lamp') this.lamps('harbor_lamp', p.x, p.y);
  }

  /** the revive moment: tint clears over 0.6 s, the drifts pop with a poof, sparkles */
  revive(r) {
    const sc = this.sc, v = this.v, k = { v: 0 };
    sc.tweens.add({
      targets: k, v: 1, duration: 700,
      onUpdate: () => { const c = Phaser.Display.Color.Interpolate.ColorWithColor(Phaser.Display.Color.ValueToColor(RUIN_TINT), Phaser.Display.Color.ValueToColor(0xffffff), 100, k.v * 100); r.img.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b)).setAlpha(0.92 + 0.08 * k.v); },
      onComplete: () => r.img.clearTint(),
    });
    sc.tweens.add({ targets: r.img, scaleX: 1.04, scaleY: 0.97, duration: 140, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
    for (const d of r.drifts) {
      sc.tweens.add({ targets: d, scale: 0.01, alpha: 0, duration: 380, delay: 150 + Math.random() * 300, ease: 'Back.easeIn', onComplete: () => d.destroy() });
      v.fx('fx_poof', d.x, d.y - 10, 120);
    }
    r.drifts = [];
    if (r.sign) sc.tweens.add({ targets: r.sign, alpha: 1, duration: 500, delay: 400 });
    const d = sdef(r.b.key), top = d && d.topPx ? d.topPx : 200;
    v.burst('star', r.b.x, r.b.y - top * 0.6, 12);
    v.sound('sfx_unlock', r.b.x, r.b.y, { volume: 0.7 });
  }

  lamps(key, x, y) {
    const d = sdef(key), names = LAMPS[key];
    if (!d || !names || !d.fxPoints) return;
    for (const n of names) {
      const p = d.fxPoints[n];
      if (!p) continue;
      const id = key + ':' + x + ',' + y + ':' + n;
      if (this.lit.has(id)) continue;
      this.lit.add(id);
      this.v.addLight(x + p[0], y + p[1], key === 'harbor_lamp' ? 0.8 : 1.0);
    }
  }

  /** art that arrived after the view was built (the harbour pages load in the background): make it now */
  late() {
    let n = 0;
    for (const r of this.blds) {
      if (r.img || !has(r.b.key)) continue;
      r.img = put(this.sc, r.b.key, r.b.x, r.b.y);
      if (r.img && this.v.ports.occluders && this.v.ports.occluders.add) this.v.ports.occluders.add(r.img);
      r.alive = null; n++;
    }
    if (n) this.sync(true);
    return n;
  }

  /** the buoys and moored boats ride the swell (one heightAt + slopeAt each, only near the view) */
  update(dt) {
    this.lateT = (this.lateT || 0) - dt;
    if (this.lateT <= 0) { this.lateT = 1; if (this.blds.some((r) => !r.img)) this.late(); }
    const wv = this.v.water, live = wv && wv.isShader;
    const sl = this._sl || (this._sl = { x: 0, y: 0 });
    for (const f of this.floaters) {
      if (!this.v.near(f.x, f.y, 260)) continue;
      if (!live) { f.img.setPosition(f.x, f.y - Math.sin(this.v.t * 1.7 + f.x * 0.01) * 1.5); continue; }
      wv.slopeAt(f.x, f.y, undefined, sl);
      f.img.setPosition(f.x, f.y - wv.heightAt(f.x, f.y)).setRotation(Math.max(-0.12, Math.min(0.12, -sl.x * f.tilt)));
      if (f.def && !f.hull) f.hull = wv.addHull(f.x, f.y, f.def, f.dir, { foam: 0.7, shadow: 0.2 });
      else if (!f.def && f.c === undefined) f.c = wv.addContact(f.x, f.y + 2, f.r || 20, { foam: 0.75, shadow: 0.12 });
    }
  }

  /** the shipyard's forge works while a trawler is on the slip */
  setWork(key, on) {
    const r = this.blds.find((q) => q.b.key === key);
    if (!r || !r.img || !r.alive) return;
    const an = Assets.spriteAnim(key, 'work');
    if (!an) return;
    if (on && !r.spr) {
      r.spr = this.sc.add.sprite(r.b.x, r.b.y, r.img.texture.key, r.img.frame.name).setOrigin(r.img.originX, r.img.originY).setDepth(r.img.depth);
      r.spr.play(an); r.img.setVisible(false);
    } else if (!on && r.spr) { r.spr.destroy(); r.spr = null; r.img.setVisible(true); }
  }

  /** the breakwater's depth this frame (Fleet: in front of the ships behind it, behind the ones outside) */
  setBreakwaterDepth(d) { if (d === this._bwd) return; this._bwd = d; for (const b of this.bw) b.img.setDepth(d + b.dz); }

  building(id) { return this.blds.find((r) => r.b.id === id) || null; }
  count() { let n = this.props.length + this.floaters.length + this.street.length + this.bw.length; for (const r of this.blds) n += 1 + r.drifts.length + (r.sign ? 1 : 0); return n; }

  destroy() {
    for (const r of this.blds) { if (r.img) r.img.destroy(); if (r.spr) r.spr.destroy(); if (r.sign) r.sign.destroy(); for (const d of r.drifts) d.destroy(); }
    for (const p of this.props) p.img.destroy();
    for (const b of this.bw) b.img.destroy();
    for (const d of this.street) d.destroy();
    for (const o of this.obs || []) o.active = false;
    for (const f of this.floaters) f.img.destroy();
  }
}

export { DEPTH };
