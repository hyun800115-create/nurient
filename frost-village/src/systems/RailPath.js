// RailPath (v4.2, docs/v42_plan.md §5.1, §5.4): the snow train's closed route with a balloon loop at each end, so
// the engine always leads. Pure JS (no Phaser): geometry + speed tables, Node-testable (tools/test/rail42.test.mjs).
//
//   lattice   L(i, j) = (G0 + 64 (i + j), G1 + 32 (i − j)); the main line is j = 0, +j = the sea side
//   metres    1 cell = √2 m (the v4 track: one rail tile is √2 m)
//   route s   metres from the ours turnout T1 heading into our loop:
//             T1 → A (straight) → semicircle → B → C (straight) → quarter → D → quarter → T1 (heading +i)
//             → main line SE → T2 → A′ → semicircle → B′ → C′ → quarter → D′ → quarter → T2 (heading −i)
//             → main line NW → T1
//   at(s)     { i, j, x, y, ang (screen heading, radians), di, dj (lattice heading), curve, seg }
//
// Loops are spring turnouts: trains enter on the straight route and leave over the curve trailing through the
// switch (no switching logic). Both loops are longer than the 읍 train (24.7 m vs 13.6 m): the nose returns to
// the turnout after the tail has left the main line.

const S2 = Math.SQRT2;

/** the segments of one loop. e = −1: our end (the loop lies at lower i), +1: the town end */
function loopSegs(L, e) {
  const t = L.t, a = L.a, r = L.r, bc = L.bc, sd = L.side === -1 ? -1 : 1;
  const P = Math.PI;
  return [
    { kind: 'line', a: [t, 0], b: [a, 0] },
    { kind: 'arc', c: [a, sd * r], r, th0: -sd * P / 2, dth: e * sd * P },
    { kind: 'line', a: [a, 2 * sd * r], b: [a - e * bc, 2 * sd * r] },
    { kind: 'arc', c: [a - e * bc, sd * r], r, th0: sd * P / 2, dth: e * sd * P / 2 },
    { kind: 'arc', c: [t, sd * r], r, th0: e < 0 ? P : 0, dth: -e * sd * P / 2 },
  ];
}

export class RailPath {
  /**
   * def = WORLD.v42.rail ({ j, from, to, crossings, loops: { ours, town } }); G = the lattice origin (WORLD.v4.G)
   */
  constructor(def, G) {
    this.def = def;
    this.G = G || [3120, 1315];
    const O = def.loops.ours, T = def.loops.town;
    this.tOurs = O.t;
    this.tTown = T.t;
    const segs = [];
    for (const q of loopSegs(O, -1)) segs.push(q);
    segs.push({ kind: 'line', a: [O.t, 0], b: [T.t, 0], main: 1 });
    for (const q of loopSegs(T, 1)) segs.push(q);
    segs.push({ kind: 'line', a: [T.t, 0], b: [O.t, 0], main: -1 });
    let s = 0;
    for (const q of segs) {
      if (q.kind === 'line') { const di = q.b[0] - q.a[0], dj = q.b[1] - q.a[1]; q.lenC = Math.hypot(di, dj); q.u = [di / q.lenC, dj / q.lenC]; }
      else q.lenC = q.r * Math.abs(q.dth);
      q.len = q.lenC * S2;
      q.s0 = s;
      s += q.len;
    }
    this.segs = segs;
    this.length = s;
    this.sMainSE = segs[5].s0;
    this.sTownLoop = segs[6].s0;
    this.sMainNW = segs[11].s0;
    this.loopLen = segs.slice(0, 5).reduce((a, q) => a + q.len, 0);
    // the curved stretches (route metres) for the speed limit and the squeal
    this.curves = segs.filter((q) => q.kind === 'arc').map((q) => [q.s0, q.s0 + q.len]);
  }

  /** s wrapped into [0, length) */
  wrap(s) { const L = this.length; s %= L; return s < 0 ? s + L : s; }

  seg(s) {
    s = this.wrap(s);
    const S = this.segs;
    let lo = 0, hi = S.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (S[mid].s0 <= s) lo = mid; else hi = mid - 1; }
    return S[lo];
  }

  /** the lattice point + heading at route metre s */
  at(s, out) {
    const o = out || {};
    s = this.wrap(s);
    const q = this.seg(s);
    const uC = (s - q.s0) / S2;       // cells into the segment
    let i, j, di, dj;
    if (q.kind === 'line') { i = q.a[0] + q.u[0] * uC; j = q.a[1] + q.u[1] * uC; di = q.u[0]; dj = q.u[1]; }
    else {
      const sg = q.dth < 0 ? -1 : 1, th = q.th0 + sg * uC / q.r;
      const c = Math.cos(th), sn = Math.sin(th);
      i = q.c[0] + q.r * c; j = q.c[1] + q.r * sn; di = -sg * sn; dj = sg * c;
    }
    o.i = i; o.j = j; o.di = di; o.dj = dj;
    o.x = this.G[0] + 64 * (i + j); o.y = this.G[1] + 32 * (i - j);
    o.ang = Math.atan2(32 * (di - dj), 64 * (di + dj));
    o.curve = q.kind === 'arc';
    o.seg = this.segs.indexOf(q);
    return o;
  }

  /** route metre of the main-line (or loop-straight) point at lattice i, travelling dir (+1 toward the town, −1 toward ours) */
  sOfMain(i, dir) {
    if (dir < 0) {
      if (i <= this.tOurs) return this.wrap((this.tOurs - i) * S2);
      return this.sMainNW + (this.tTown - i) * S2;
    }
    if (i <= this.tTown) return this.sMainSE + (i - this.tOurs) * S2;
    return this.sTownLoop + (i - this.tTown) * S2;
  }

  /** forward distance along the route from a to b (m, in [0, length)) */
  ahead(a, b) { return this.wrap(b - a); }

  /** is any of [s − len, s] on a curve? */
  onCurve(s, len) {
    const L = this.length;
    for (const [a, b] of this.curves) {
      for (const k of [-L, 0, L]) { if (s + k >= a && s - len + k <= b) return true; }
    }
    return false;
  }

  /**
   * the speed profile of one leg: nose from route s0 forward D metres, a train of trainLen metres
   * B = { speed, curve, accel, brake } -> { D, T, pos(t), vel(t), curveAt(t) }
   */
  profile(s0, D, trainLen, B) {
    const vmax = B.speed || 3.4, vc = Math.min(vmax, B.curve || 2.2), acc = B.accel || 0.7, brk = B.brake || 0.8;
    const N = Math.max(2, Math.ceil(D / 0.25)), ds = D / N;
    const v = new Float64Array(N + 1), lim = new Float64Array(N + 1), t = new Float64Array(N + 1);
    // (a grid point next to a curve counts as on it: the speed between two points never exceeds the curve limit)
    for (let k = 0; k <= N; k++) lim[k] = this.onCurve(s0 + (k + 1) * ds, trainLen + 2 * ds) ? vc : vmax;
    v[0] = 0;
    for (let k = 1; k <= N; k++) v[k] = Math.min(lim[k], Math.sqrt(v[k - 1] * v[k - 1] + 2 * acc * ds));
    v[N] = 0;
    for (let k = N - 1; k >= 0; k--) v[k] = Math.min(v[k], Math.sqrt(v[k + 1] * v[k + 1] + 2 * brk * ds));
    for (let k = 1; k <= N; k++) t[k] = t[k - 1] + (2 * ds) / Math.max(1e-6, v[k - 1] + v[k]);
    const T = t[N];
    const find = (tt) => { let lo = 0, hi = N - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (t[m] <= tt) lo = m; else hi = m - 1; } return lo; };
    return {
      D, T, N, ds, v, t, lim,
      pos(tt) {
        if (tt <= 0) return 0;
        if (tt >= T) return D;
        const k = find(tt), v0 = v[k], v1 = v[k + 1], a = (v1 * v1 - v0 * v0) / (2 * ds), u = tt - t[k];
        return Math.min((k + 1) * ds, k * ds + v0 * u + 0.5 * a * u * u);
      },
      vel(tt) {
        if (tt <= 0 || tt >= T) return 0;
        const k = find(tt), v0 = v[k], v1 = v[k + 1], a = (v1 * v1 - v0 * v0) / (2 * ds);
        return Math.max(0, v0 + a * (tt - t[k]));
      },
    };
  }

  /** points every `step` m along the route from s0 for len metres (drawing, tests) */
  sample(s0, len, step, fn) {
    const o = {};
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k <= n; k++) { this.at(s0 + (len * k) / n, o); fn(o, k, n); }
  }
}

/** the nearest of the 8 iso headings for a lattice heading (di, dj): SE = +i, NE = +j, NW = −i, SW = −j */
export const DIR8 = ['SE', 'E', 'NE', 'N', 'NW', 'W', 'SW', 'S'];
export function dirOf(di, dj) {
  const k = Math.round(Math.atan2(dj, di) / (Math.PI / 4));
  return DIR8[((k % 8) + 8) % 8];
}
/** rendered dir + flipX for a heading (the art renders S, SE, E, NE, N; SW, W, NW are mirrors) */
export const MIRROR = { SW: 'SE', W: 'E', NW: 'NE' };
export function renderDir(d) { return MIRROR[d] ? { dir: MIRROR[d], flip: true } : { dir: d, flip: false }; }

export { S2 };
