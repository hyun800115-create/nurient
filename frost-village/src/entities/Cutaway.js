// (v4.2, docs/v42_plan.md §6.3 / §6.6 / §4.4) a cutaway building drawn from the civic / logistics layer contract:
// every layer (`floor`, `back`, `interior`, overlays, `front`, `shell_cut`, `shell` …) at the SAME position + origin as
// the building, in the manifest's `drawOrder`, with two character slots `@behind` (staff behind the counter) and
// `@front` (customers). Closed: the shell (+ the always-drawn layers); revealed: the shell fades to `openAlpha`, the
// `shell_cut` wall stubs and the inside layers show (inside layers exist only while revealed: fill rate).
//   const cw = new Cutaway(gs, 'bank', x, y, { region })
//   cw.reveal(on)             fade the shell (fade.ms), the inside appears / goes
//   cw.slotDepth('@behind', y)  the depth of a character standing inside (sorted among the others by its own y)
//   cw.inPoly(x, y)           a point inside the building's revealPoly (tap / walk-in tests)
//   cw.overlay(name, anim)    play an overlay's frames (e.g. the bank vault: 'bank_vault' 8 frames)
//   cw.occupy(ch)             ((v4.2 robust review H2) Character.sync asks every frame: a character standing on the
//                             floor (footprintPoly) gets the depth of its slot — staff (`ch.inside`) '@behind' (or
//                             `ch.slot`), everyone else '@front' — and walkers are lifted floorLiftPx onto the raised
//                             floor (the manifest's inside points already include it). A closed building's shell is
//                             drawn over its slots, so whoever is inside is hidden until it opens. Someone outside in
//                             front of the front walls is drawn over the whole building.
// Pictures may still be on their way (late fragments): every layer is (re)applied when its frame arrives.

import { Assets } from '../core/Assets.js';

export class Cutaway {
  constructor(gs, key, x, y, opts = {}) {
    this.gs = gs; this.key = key; this.x = x; this.y = y;
    this.def = Assets.def(key) || {};
    const cw = this.def.cutaway || {};
    this.cw = cw;
    this.order = (cw.drawOrder || []).slice();
    this.fade = Object.assign({ layer: key + '_shell', closedAlpha: 1, openAlpha: 0.12, ms: 260 }, cw.fade || {});
    this.cut = (cw.cut && cw.cut.layer) || key + '_shell_cut';
    this.poly = (cw.revealPoly || this.def.revealPoly || []).map((p) => ({ x: x + p[0], y: y + p[1] }));
    this.lift = Number(cw.floorLiftPx) || 0;
    // the floor (footprintPoly) and its bounding box: the occupancy test of Character.sync
    this.floor = (this.def.footprintPoly || []).map((p) => ({ x: x + p[0], y: y + p[1] }));
    const fx = this.floor.map((p) => p.x), fy = this.floor.map((p) => p.y);
    this.box = this.floor.length >= 3 ? [Math.min(...fx), Math.min(...fy), Math.max(...fx), Math.max(...fy)] : null;
    // the front corner (lowest point): left of it the front-left wall, right of it the front-right wall
    this.frontPt = this.floor.length >= 3 ? this.floor.reduce((a, p) => (p.y > a.y ? p : a), this.floor[0]) : null;
    this.revealed = false;
    this.alpha = 0;           // 0 closed .. 1 open
    this.layers = {};
    this.base = y;
    // the always-drawn layers (closed look): the shell, its floor (the ground shadow) and the overlays outside
    this.inside = new Set(['interior', 'back', 'front'].map((n) => cw.layers && cw.layers[n]).filter(Boolean));
    this.order.forEach((name, i) => {
      if (name[0] === '@') return;
      const img = Assets.image(gs, x, y, name).setDepth(this.base + 0.01 * i);
      img.__layerIndex = i;
      img.noCull = true;
      if (opts.region && gs.territory) gs.territory.add(opts.region, img);
      if (gs.lazyImage) gs.lazyImage(img, name);
      this.layers[name] = img;
    });
    this.apply();
    (gs.interiors || (gs.interiors = [])).push(this);
  }

  /** depth of slot '@behind' / '@front' for a character at world y (sorted among themselves by y; the y term stays
   *  inside the slot's 0.01 band: ±300 px -> ±0.003) */
  slotDepth(slot, y) {
    const i = this.order.indexOf(slot);
    return this.base + 0.01 * (i < 0 ? this.order.length : i) + Math.max(-0.004, Math.min(0.004, (y - this.base) * 1e-5));
  }

  /** the floor polygon contains (x, y) */
  onFloor(x, y) {
    const b = this.box;
    if (!b || x < b[0] || x > b[2] || y < b[1] || y > b[3]) return false;
    return polyHas(this.floor, x, y);
  }

  /** where a character is drawn: { depth, lift } while on the floor or in front of the walls, else null */
  occupy(ch) {
    const x = ch.x, y = ch.y, b = this.box;
    if (!b || x < b[0] - 4 || x > b[2] + 4 || y < b[1] - 4 || y > b[3] + 40) return null;
    if (polyHas(this.floor, x, y)) {
      const slot = ch.slot || (ch.inside ? '@behind' : '@front');
      return { depth: this.slotDepth(slot, y), lift: ch.inside ? 0 : this.lift };
    }
    // outside, in front of a front wall but above the building's own base depth: over every layer of the building
    const top = this.base + 0.01 * this.order.length;
    if (y < top && this.inFront(x, y)) return { depth: top + 0.001 + (y - this.base + 400) * 1e-6, lift: 0 };
    return null;
  }

  /** (x, y) lies in front of (below) the two front walls of the floor */
  inFront(x, y) {
    const F = this.floor, fp = this.frontPt;
    if (!fp) return false;
    // the two neighbours of the front corner span the front walls
    const i = F.indexOf(fp), a = F[(i + F.length - 1) % F.length], c = F[(i + 1) % F.length];
    const L = a.x < c.x ? a : c, R = a.x < c.x ? c : a;
    if (x < L.x || x > R.x) return false;
    const edgeY = x <= fp.x ? L.y + ((fp.y - L.y) * (x - L.x)) / Math.max(1e-6, fp.x - L.x) : fp.y + ((R.y - fp.y) * (x - fp.x)) / Math.max(1e-6, R.x - fp.x);
    return y > edgeY;
  }

  inPoly(x, y) { return polyHas(this.poly, x, y); }

  reveal(on) { this.revealed = !!on; }

  /** a point of the manifest (doorPoint, counterPoints[0], …) in world px */
  point(name, k) {
    const v = this.def[name];
    if (!v) return null;
    const p = Array.isArray(v[0]) ? v[k || 0] : v;
    return p ? { x: this.x + p[0], y: this.y + p[1] } : null;
  }

  /** play the frames of an overlay layer (name_0 … name_{n-1}) once (then hold the last) */
  overlay(name, frames, fps, reverse) {
    const img = this.layers[name];
    if (!img) return;
    const n = Math.max(1, frames || 8), dt = 1000 / Math.max(1, fps || 12);
    for (let i = 0; i < n; i++) {
      const f = reverse ? n - 1 - i : i;
      this.gs.time.delayedCall(i * dt, () => {
        if (!img.active) return;
        const d = Assets.def(name), fr = name + '_' + f, tk = d && d.atlas ? Assets.texOf(d.atlas, fr) : null;
        if (tk) img.setTexture(tk, fr);
      });
    }
  }

  apply() {
    const a = this.alpha, F = this.fade;
    for (const name in this.layers) {
      const img = this.layers[name];
      if (name === F.layer) img.setAlpha(F.closedAlpha + (F.openAlpha - F.closedAlpha) * a);
      else if (name === this.cut) img.setVisible(a > 0.02).setAlpha(a);
      else if (this.inside.has(name)) img.setVisible(a > 0.02);
    }
  }

  update(dt) {
    const want = this.revealed ? 1 : 0;
    if (this.alpha === want) return;
    const step = dt * 1000 / Math.max(60, this.fade.ms || 260);
    this.alpha = want > this.alpha ? Math.min(1, this.alpha + step) : Math.max(0, this.alpha - step);
    this.apply();
  }

  objects() { return Object.values(this.layers); }

  destroy() {
    for (const k in this.layers) this.layers[k].destroy();
    this.layers = {};
    const I = this.gs.interiors, i = I ? I.indexOf(this) : -1;
    if (i >= 0) I.splice(i, 1);
  }
}

/** even-odd point-in-polygon ([{ x, y }]) */
export function polyHas(P, x, y) {
  if (!P || P.length < 3) return false;
  let c = false;
  for (let a = 0, b = P.length - 1; a < P.length; b = a++) if ((P[a].y > y) !== (P[b].y > y) && x < ((P[b].x - P[a].x) * (y - P[a].y)) / (P[b].y - P[a].y) + P[a].x) c = !c;
  return c;
}
