// Van paths (plan §5.5): the spur out of bay 1 and back (data, WORLD.v43.gb.spur), the legs between curbs on the
// v4 drive lanes (the vehicles module's LaneGraph over RoadNet: right-hand lanes, junction connectors, U-turns only at
// dead ends), joined into one polyline per leg with a speed limit per segment. Pure: px points, metres along.
//   kit = new PathKit(laneGraph, layout, tuning)
//   kit.out(pos) / kit.leg(a, b) / kit.home(pos) / kit.reverse()  -> VanPath | null
//   kit.cost(a, b) -> metres (main × mainWeight) for the tour matrix
// Headings: dir8(hx, hy) -> SE / NE / SW / NW on an axis street (±22.5°), else the 45° corner frames E / S / W / N.

import { metres, pointAt } from '../../vehicles/model/geom.js';
import { L } from '../layout.js';

const CLS_SPEED = ['dirt', 'cobble', 'asphalt'];

/** cubic bezier p0 → p3 (lattice points) as px points, n segments */
export function cubicL(p0, c1, c2, p3, n = 8) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    const i = a * p0[0] + b * c1[0] + c * c2[0] + d * p3[0], j = a * p0[1] + b * c1[1] + c * c2[1] + d * p3[1];
    out.push(L(i, j));
  }
  return out;
}

/** screen heading (unit) -> the art heading: SE NE SW NW (axis streets) or E S W N (the corner frames) */
export function dir8(hx, hy) {
  // screen angle; the axis headings sit at ±26.57° and ±153.43°
  const a = Math.atan2(hy, hx) * 180 / Math.PI;
  const axes = [[26.57, 'SE'], [-26.57, 'NE'], [153.43, 'SW'], [-153.43, 'NW']];
  for (const [ang, k] of axes) { let d = Math.abs(a - ang); if (d > 180) d = 360 - d; if (d <= 22.5) return k; }
  if (a > -45 && a < 45) return 'E';
  if (a >= 45 && a <= 135) return 'S';
  if (a <= -45 && a >= -135) return 'N';
  return 'W';
}
/** the axis art heading nearest to a screen heading (for a van that must show a drive frame) */
export function axisDir(hx, hy) {
  const di = hx / 64 + hy / 32, dj = hx / 64 - hy / 32;
  if (Math.abs(di) >= Math.abs(dj)) return di >= 0 ? 'SE' : 'NW';
  return dj >= 0 ? 'NE' : 'SW';
}

export class VanPath {
  /** pts [{x, y}], lim [m/s per segment] (length pts − 1), opts { rev, tag } */
  constructor(pts, lim, opts = {}) {
    // drop zero-length steps (joins of pieces)
    const P = [pts[0]], S = [];
    for (let k = 1; k < pts.length; k++) {
      const a = P[P.length - 1], b = pts[k];
      if (Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01) continue;
      P.push({ x: b.x, y: b.y }); S.push(lim[Math.min(lim.length - 1, k - 1)]);
    }
    this.pts = P;
    this.lim = S.length ? S : [lim[0] || 3];
    this.cum = new Float64Array(P.length);
    for (let k = 1; k < P.length; k++) this.cum[k] = this.cum[k - 1] + metres(P[k - 1].x, P[k - 1].y, P[k].x, P[k].y);
    this.len = this.cum[P.length - 1];
    this.rev = !!opts.rev;
    this.tag = opts.tag || '';
    this.stops = [];          // [{ s, id }] (where the van must come to rest: the curb at the end, a gate)
  }
  at(s, out) { return pointAt(this.pts, this.cum, s, out); }
  /** the segment index at s */
  seg(s) {
    const c = this.cum;
    let lo = 1, hi = c.length - 1;
    if (hi < 1) return 0;
    if (s <= 0) return 0;
    while (lo < hi) { const m = (lo + hi) >> 1; if (c[m] < s) lo = m + 1; else hi = m; }
    return lo - 1;
  }
  /** the speed limit at s, braking in time for the lower limits ahead (decel m/s²) */
  limit(s, decel) {
    const k = this.seg(s);
    let v = this.lim[Math.min(k, this.lim.length - 1)];
    // look ahead over the next segments within the braking distance of the current limit
    const reach = (v * v) / (2 * decel) + 0.5;
    for (let q = k + 1; q < this.lim.length; q++) {
      const d = this.cum[q] - s;
      if (d > reach) break;
      const w = this.lim[q];
      if (w < v) v = Math.min(v, Math.sqrt(w * w + 2 * decel * Math.max(0, d)));
    }
    // the end of the path is a stop
    const left = this.len - s;
    v = Math.min(v, Math.sqrt(2 * decel * Math.max(0, left)) + 0.05);
    return v;
  }
}

export class PathKit {
  /** lg: LaneGraph (vehicles/model/lanes.js) over the v4 RoadNet; layout: GB_LAYOUT; tune: GB_TUNING */
  constructor(lg, layout, tune) {
    this.lg = lg; this.lay = layout; this.tune = tune;
    const sp = tune.van.speed;
    this.spd = (cls) => sp[CLS_SPEED[cls] || 'dirt'] || 3.5;
    // the lanes the spur joins / leaves: the ave lanes ending at its south end (j −18)
    const S = layout.spur;
    const atJ = (lane, which) => lane.lat ? lane.lat[which].j : null;
    this.join = null; this.back = null;
    for (const l of lg.lanes) {
      if (l.kind !== 'road' || l.street !== S.joinStreet) continue;
      if (l.dir > 0 && (this.join === null || atJ(l, 0) < atJ(lg.lanes[this.join], 0))) this.join = l.id;
      if (l.dir < 0 && (this.back === null || atJ(l, 1) < atJ(lg.lanes[this.back], 1))) this.back = l.id;
    }
    this.ok = this.join !== null && this.back !== null;
    this.cache = new Map();
  }

  /** where a van joins the street grid ({ lane, s }) and leaves it */
  joinPos() { return { lane: this.join, s: 0.05 }; }
  backPos() { const l = this.lg.lanes[this.back]; return { lane: this.back, s: l.len - 0.05 }; }

  /** px points of a LaneGraph route + their speed limits */
  routePts(pieces) {
    const pts = [], lim = [];
    const turnV = this.tune.van.turnSpeed;
    for (const p of pieces) {
      const g = p.t === 'C' ? this.lg.conns[p.id] : this.lg.lanes[p.id];
      const v = p.t === 'C' ? (g.turn === 'S' ? Math.min(this.spd(1), 4) : g.turn === 'U' ? turnV * 0.75 : turnV) : this.spd(g.cls);
      // the sub-polyline between s0 and s1
      const a = pointAt(g.pts, g.cum, p.s0, {}), b = pointAt(g.pts, g.cum, p.s1, {});
      const mid = [];
      for (let k = 1; k < g.pts.length - 1; k++) if (g.cum[k] > p.s0 + 1e-6 && g.cum[k] < p.s1 - 1e-6) mid.push(g.pts[k]);
      const seq = [{ x: a.x, y: a.y }].concat(mid, [{ x: b.x, y: b.y }]);
      for (let k = 0; k < seq.length; k++) {
        if (pts.length) lim.push(v);
        pts.push(seq[k]);
      }
    }
    return { pts, lim };
  }

  /** a leg between two lane positions (null: no route) */
  leg(a, b, tag) {
    const pcs = this.lg.route(a, b, { weight: this.weight() });
    if (!pcs) return null;
    const { pts, lim } = this.routePts(pcs);
    if (pts.length < 2) pts.push({ x: pts[0].x + 0.01, y: pts[0].y }), lim.push(1);
    return new VanPath(pts, lim, { tag: tag || 'leg' });
  }

  weight() { const w = this.tune.van.mainWeight; return (l) => (l.street === 'main' ? w : 1); }

  /** metres a→b for the tour (main counts × mainWeight); Infinity when there is no route */
  cost(a, b) {
    const k = a.lane + ':' + a.s.toFixed(1) + '>' + b.lane + ':' + b.s.toFixed(1);
    if (this.cache.has(k)) return this.cache.get(k);
    const pcs = this.lg.route(a, b, { weight: this.weight() });
    let m = Infinity;
    if (pcs) { m = 0; for (const p of pcs) { const len = p.s1 - p.s0; const g = p.t === 'L' ? this.lg.lanes[p.id] : null; m += len * (g && g.street === 'main' ? this.tune.van.mainWeight : 1); } }
    this.cache.set(k, m);
    return m;
  }

  /** bay → spur → the S-jog → the join lane → `to` (a curb), as one path */
  out(to) {
    const S = this.lay.spur, dirt = this.spd(0);
    const pts = S.out.map(([i, j]) => L(i, j));
    const lim = [];
    for (let k = 1; k < pts.length; k++) lim.push(k === 1 ? 2.0 : dirt);
    const last = S.out[S.out.length - 1];
    const ls = lat(this.lg.at('L', this.join, 0, {}));
    const jog = cubicL(last, S.jogOut.c1, S.jogOut.c2, [ls.i, ls.j], 10);
    for (let k = 1; k < jog.length; k++) { pts.push(jog[k]); lim.push(2.4); }
    if (to) {
      const leg = this.leg({ lane: this.join, s: 0 }, to);
      if (!leg) return null;
      for (let k = 1; k < leg.pts.length; k++) { pts.push(leg.pts[k]); lim.push(leg.lim[k - 1]); }
    }
    return new VanPath(pts, lim, { tag: 'out' });
  }

  /** from a curb (or the join) home: the ave −j lane end → the jog → ave_s → bank_st → the dock lane → the pivot */
  home(from) {
    const S = this.lay.spur, dirt = this.spd(0);
    const bl = this.lg.lanes[this.back];
    const leg = from ? this.leg(from, { lane: this.back, s: bl.len }) : null;
    const pts = leg ? leg.pts.slice() : [this.lg.at('L', this.back, bl.len, {})];
    const lim = leg ? leg.lim.slice() : [];
    const e = this.lg.at('L', this.back, bl.len, {});
    const first = S.in[0];
    const jog = cubicL([lat(e).i, lat(e).j], S.jogIn.c1, S.jogIn.c2, first, 8);
    for (let k = 1; k < jog.length; k++) { pts.push(jog[k]); lim.push(2.4); }
    for (let k = 1; k < S.in.length; k++) { pts.push(L(S.in[k][0], S.in[k][1])); lim.push(k === S.in.length - 1 ? 2.2 : dirt); }
    return new VanPath(pts, lim, { tag: 'home' });
  }

  /** the pivot → bay 1 reverse (the van keeps facing SE) */
  reverse() {
    const S = this.lay.spur, b = this.lay.bayPt;
    const v = this.spd(0) * this.tune.van.reverseMult;
    return new VanPath([L(S.pivot[0], S.pivot[1]), L(b[0], b[1])], [v], { rev: true, tag: 'reverse' });
  }

  /** the lane point (px) of a lane position */
  pt(pos) { return this.lg.at('L', pos.lane, pos.s, {}); }
}

function lat(p) { const a = (p.x - 3120) / 64, b = (p.y - 1315) / 32; return { i: (a + b) / 2, j: (a - b) / 2 }; }
