// Things on the water and the wet sand (docs/v5_v8_plan.md §6.5): ≤ 4 boats on closed loops beyond the buoys (swan
// pedal boats with two riders, the kayak, the banana boat towed by a yacht), ≤ 6 crabs scuttling on the wet band.
// Analytic: positions are pure functions of T (no per-frame state), so an off-screen beach costs nothing.

import { stream, hashStr } from './rng.js';
import { hourOf } from './time.js';
import { L, BOATS, CRABS, px2L, waterJ } from '../layout.js';

const PX = (i, j) => { const p = L(i, j); return [p[0], p[1]]; };
const DIRS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
const dirOf = (dx, dy) => DIRS[(Math.round(Math.atan2(2 * dy, dx) / (Math.PI / 4)) + 8) % 8];

/** a closed loop path (px) with cumulative lengths; corners are rounded with 6 extra points each */
function loopPath(ij) {
  const p = ij.map(([i, j]) => PX(i, j));
  const pts = [];
  const n = p.length;
  for (let k = 0; k < n; k++) {
    const a = p[(k + n - 1) % n], b = p[k], c = p[(k + 1) % n];
    const r = 0.35;
    const s0 = [b[0] + (a[0] - b[0]) * r, b[1] + (a[1] - b[1]) * r], s1 = [b[0] + (c[0] - b[0]) * r, b[1] + (c[1] - b[1]) * r];
    for (let q = 0; q <= 6; q++) { const t = q / 6, u = 1 - t; pts.push([u * u * s0[0] + 2 * u * t * b[0] + t * t * s1[0], u * u * s0[1] + 2 * u * t * b[1] + t * t * s1[1]]); }
  }
  const cum = [0];
  for (let k = 1; k <= pts.length; k++) { const a = pts[k - 1], b = pts[k % pts.length]; cum.push(cum[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  return { pts, cum, len: cum[cum.length - 1] };
}
function along(path, s) {
  const { pts, cum, len } = path;
  s = ((s % len) + len) % len;
  let lo = 0, hi = cum.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
  const a = pts[lo], b = pts[(lo + 1) % pts.length], f = (s - cum[lo]) / Math.max(1e-6, cum[lo + 1] - cum[lo]);
  return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, dx: b[0] - a[0], dy: b[1] - a[1] };
}

export const BOAT_SPECS = {
  swan: { key: 'swan_pedal_boat', speed: 30, riders: 2, from: 9, to: 18, layout: 'swan' },
  swan2: { key: 'swan_pedal_boat', speed: 27, riders: 2, from: 10, to: 17.5, layout: 'swan2' },
  kayak: { key: 'kayak_crew', speed: 34, riders: 0, from: 9.5, to: 17, layout: 'kayak' },
  banana: { key: 'banana_boat_crew', speed: 62, riders: 0, from: 11, to: 16, layout: 'banana', tow: 'yacht', onFor: 70, offFor: 110 },
};

export class Sea {
  constructor(m) {
    this.m = m;
    this.paths = {};
    for (const id in BOAT_SPECS) this.paths[id] = loopPath(BOATS[BOAT_SPECS[id].layout].loop);
  }
  /** boats out now (their need is met and it is their hours) */
  boats(T) {
    const h = hourOf(T), out = [];
    for (const id in BOAT_SPECS) {
      const b = BOAT_SPECS[id], L0 = BOATS[b.layout];
      if (!this.m.ok(L0.need)) continue;
      if (out.length >= this.m.cfg.live.boats) break;
      const on = h >= b.from && h < b.to && (!b.onFor || ((T + (hashStr(id) % 97)) % (b.onFor + b.offFor)) < b.onFor);
      out.push({ id, key: b.key, on, riders: b.riders, tow: b.tow || null });
    }
    return out;
  }
  /** where boat id is at T: { x, y, dir, moving } (beached at its shore point when not out) */
  boatAt(id, T, on = true) {
    const b = BOAT_SPECS[id], L0 = BOATS[b.layout];
    if (!on) {
      // moored in the shallows just off the waterline (never on the dry sand), empty
      if (L0.shore) { const [x, y] = PX(L0.shore[0], Math.min(L0.shore[1], waterJ(L0.shore[0]) - 0.45)); return { x, y, dir: 'SW', moving: false }; }
      return null;
    }
    const s = T * b.speed + (hashStr(id) % 1000);
    const p = along(this.paths[id], s);
    return { x: p.x, y: p.y, dir: dirOf(p.dx, p.dy), moving: true };
  }
  /** the yacht towing the banana boat runs ahead on the same loop (tow rope from its stern to towPoint) */
  towAt(id, T) { const b = BOAT_SPECS[id]; const s = T * b.speed + (hashStr(id) % 1000) + 150; const p = along(this.paths[id], s); return { x: p.x, y: p.y, dir: dirOf(p.dx, p.dy) }; }

  // -------------------------------------------------------------------- crabs: walk 2.4 s to a new spot, idle 4–8 s
  crabs(T) {
    const n = this.m.isOpen() || this.m.stepDone('reveal') ? this.m.cfg.live.crabs : 0, out = [];
    for (let k = 0; k < n; k++) out.push(this.crabAt(k, T));
    return out;
  }
  crabSpot(k, c) {
    const R = stream(this.m.seed, 'crab:' + k + ':' + c);
    const base = CRABS.i[0] + ((k + 0.5) / 6) * (CRABS.i[1] - CRABS.i[0]);
    const i = Math.max(CRABS.i[0], Math.min(CRABS.i[1], base + R.range(-2.2, 2.2)));
    const j = Math.max(waterJ(i) + 0.25, R.range(CRABS.j[0], CRABS.j[1]));
    return PX(i, j);
  }
  crabAt(k, T) {
    const cyc = 8 + (k % 3) * 1.5, t = T + k * 3.7, c = Math.floor(t / cyc), f = t - c * cyc;
    const a = this.crabSpot(k, c), b = this.crabSpot(k, c + 1);
    const walk = 2.4;
    if (f >= cyc - walk) { const u = (f - (cyc - walk)) / walk, e = u * u * (3 - 2 * u); return { id: 'crab' + k, x: a[0] + (b[0] - a[0]) * e, y: a[1] + (b[1] - a[1]) * e, dir: dirOf(b[0] - a[0], b[1] - a[1]), anim: 'walk' }; }
    return { id: 'crab' + k, x: a[0], y: a[1], dir: (k + c) % 2 ? 'S' : 'SE', anim: 'idle' };
  }
  /** is (x, y) in the swim zone (inside the buoys)? */
  inside(x, y) { const [i, j] = px2L(x, y); return j > -21.25 && i > 94 && i < 116 && j < waterJ(i); }
}
