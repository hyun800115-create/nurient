// Small pure geometry for the logistics floor: legs, polylines and a Mover that walks / drives along them by arc
// length. Positions are px relative to the centre's anchor (the view adds the anchor). Headings are the four art
// headings SE (+X), NE (+Y), SW (-Y), NW (-X) for vehicles and the 8 doll directions for people.

export const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];

/** 8-way doll direction of a screen move (dx, dy) — iso: y is squashed by 2 */
export function dir8(dx, dy) {
  if (!dx && !dy) return null;
  const a = Math.atan2(dy * 2, dx) * 180 / Math.PI;     // 0 = E, 90 = S
  const D = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
  return D[((Math.round(a / 45) % 8) + 8) % 8];
}

/** the vehicle heading whose screen axis matches (dx, dy) */
export function axisDir(dx, dy) {
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return null;
  // SE = (+2, +1), NE = (+2, -1), SW = (-2, +1), NW = (-2, -1)
  if (dx >= 0) return dy >= 0 ? 'SE' : 'NE';
  return dy >= 0 ? 'SW' : 'NW';
}
export const OPP = { SE: 'NW', NW: 'SE', NE: 'SW', SW: 'NE' };

/**
 * legs: [{ a, b, dir, rev, v, dwell }] — a leg from point a to point b driven facing `dir` (backwards when rev) at
 * speed v px/s, or a pause of `dwell` s (a == b). The Mover keeps its place by leg index + metres done.
 */
export class Mover {
  constructor(legs) {
    this.legs = legs || [];
    this.i = 0; this.s = 0; this.w = 0;
    this.done = !this.legs.length;
  }
  get leg() { return this.legs[Math.min(this.i, this.legs.length - 1)]; }
  /**
   * advance by dt seconds; returns true while moving. stopAt: a leg index the mover may not start (it waits at the
   * end of the leg before it: a vehicle holding at a corner until the dock lane is free); stopDist: px it may still
   * go in all (car following).
   */
  step(dt, stopAt = -1, stopDist = Infinity) {
    let t = dt, budget = stopDist;
    while (!this.done && t > 0) {
      if (this.i === stopAt) return false;
      const L = this.legs[this.i];
      if (L.dwell) {
        const need = L.dwell - this.w;
        if (t < need) { this.w += t; return true; }
        t -= need; this.w = 0; this.next();
        continue;
      }
      const len = dist(L.a, L.b), v = Math.max(1, L.v || 60);
      const need = (len - this.s) / v;
      const go = Math.min(t * v, len - this.s, Math.max(0, budget));
      if (go < len - this.s) { this.s += go; budget -= go; return go > 0; }
      budget -= Math.max(0, len - this.s);
      t -= Math.max(0, need); this.next();
    }
    return !this.done;
  }
  /** px done along the legs so far */
  doneDist() { let n = 0; for (let k = 0; k < this.i; k++) n += dist(this.legs[k].a, this.legs[k].b); return n + (this.done ? 0 : this.s); }
  /** index of the first leg starting at point p (or -1) */
  legAt(p, from = 0) { for (let k = from; k < this.legs.length; k++) if (dist(this.legs[k].a, p) < 1) return k; return -1; }
  next() { this.i++; this.s = 0; this.w = 0; if (this.i >= this.legs.length) { this.done = true; this.i = this.legs.length - 1; } }
  pos() {
    if (!this.legs.length) return [0, 0];
    const L = this.leg;
    if (this.done) return L.b.slice();
    const len = dist(L.a, L.b);
    return len > 0 ? lerp(L.a, L.b, Math.min(1, this.s / len)) : L.a.slice();
  }
  dir() { const L = this.leg; return L ? L.dir : null; }
  moving() { const L = this.leg; return !this.done && !!L && !L.dwell && dist(L.a, L.b) > 0; }
  reversing() { const L = this.leg; return this.moving() && !!L.rev; }
  /** px still to go */
  left() {
    if (this.done) return 0;
    let n = dist(this.leg.a, this.leg.b) - this.s;
    for (let k = this.i + 1; k < this.legs.length; k++) n += dist(this.legs[k].a, this.legs[k].b);
    return Math.max(0, n);
  }
}

/** walking legs through points at speed v (people: the facing is derived from the move) */
export function walkLegs(pts, v) {
  const legs = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k], b = pts[k + 1];
    if (dist(a, b) < 0.5) continue;
    legs.push({ a: a.slice(), b: b.slice(), dir: dir8(b[0] - a[0], b[1] - a[1]), v });
  }
  return legs;
}

/**
 * vehicle legs along an axis-aligned polyline: each move is driven facing its own axis (forward) unless the spec
 * says `rev` (backing in: facing the opposite way); a heading change in place costs `turnS` (a toy pivot).
 * spec: [{ p: [x, y], rev?, dwell? }] — the first point is the start.
 */
export function driveLegs(spec, v, turnS, revK = 0.55) {
  const legs = [];
  let face = null;
  for (let k = 0; k + 1 < spec.length; k++) {
    const a = spec[k].p, b = spec[k + 1].p;
    if (dist(a, b) >= 0.5) {
      const ax = axisDir(b[0] - a[0], b[1] - a[1]);
      const rev = !!spec[k + 1].rev;
      const want = rev ? OPP[ax] : ax;
      if (face && want !== face && turnS > 0) legs.push({ a: a.slice(), b: a.slice(), dir: face, dwell: turnS, turn: want });
      legs.push({ a: a.slice(), b: b.slice(), dir: want, rev, v: rev ? v * revK : v });
      face = want;
    }
    // a stop at the point just reached (a curb stop, the pause before backing in)
    if (spec[k + 1].dwell) legs.push({ a: b.slice(), b: b.slice(), dir: face, dwell: spec[k + 1].dwell, tag: spec[k + 1].tag || null });
  }
  return legs;
}
