// Ship kinematics (harbor_runtime model): routes made of axis moves, sideways pushes, turns and waits, expanded into
// timed segments whose positions are pure functions of time (analytic: a ship far from the view costs nothing, and a
// reload at any T puts every ship where the timetable says). Pure: no Phaser.
//
//   route step: { to: [i, j] }  move along the heading (forward, or astern if behind) or sideways (perpendicular)
//               { turn: 'SE' }  turn in place (the view crossfades the two headings)
//               { wait: s, tag }  stay (dwell at a berth, haul the net, hold)
//               { waitUntil: T, tag }  stay until an absolute time (filled in when the mission is placed)
//   pose: { i, j, h }  (h = heading NE / SW / SE / NW)

import { shipCells, HEAD, AXIS, PX_PER_CELL } from '../layout.js';

/** hull rectangle (lattice) of `key` at pose p: length along the heading axis, beam across */
export function hullRect(key, p, pad = 0) {
  const c = shipCells(key);
  const hl = c.len / 2 + pad, hb = c.beam / 2 + pad;
  return AXIS[p.h] === 'i' ? { i0: p.i - hl, i1: p.i + hl, j0: p.j - hb, j1: p.j + hb } : { i0: p.i - hb, i1: p.i + hb, j0: p.j - hl, j1: p.j + hl };
}
export const union = (a, b) => ({ i0: Math.min(a.i0, b.i0), i1: Math.max(a.i1, b.i1), j0: Math.min(a.j0, b.j0), j1: Math.max(a.j1, b.j1) });
/** strict overlap (touching is fine) */
export const overlaps = (a, b, eps = 0.02) => a.i0 < b.i1 - eps && b.i0 < a.i1 - eps && a.j0 < b.j1 - eps && b.j0 < a.j1 - eps;

/** trapezoid speed profile over distance D with top speed v and acceleration a (Rail.legProfile shape) */
export function profile(D, v, a) {
  const acc = Math.max(1e-3, a);
  let vm = v, da = (vm * vm) / (2 * acc);
  if (2 * da > D) { vm = Math.sqrt(D * acc); da = D / 2; }
  const t1 = vm / acc, dc = Math.max(0, D - 2 * da), t2 = t1 + dc / Math.max(1e-6, vm), T = t2 + t1;
  return {
    D, T, vm,
    pos(t) { if (t <= 0) return 0; if (t >= T) return D; if (t < t1) return 0.5 * acc * t * t; if (t < t2) return da + vm * (t - t1); const u = T - t; return D - 0.5 * acc * u * u; },
    vel(t) { if (t <= 0 || t >= T) return 0; if (t < t1) return acc * t; if (t < t2) return vm; return acc * (T - t); },
  };
}

/**
 * expand a route into segments (times relative to the mission start).
 * def: { speedPx } of the ship (assets/ships manifest), cfg: tuning.ships { sidle, turn, accelS, astern }
 * Returns { segs, end: pose, T: duration } — waitUntil steps get duration 0 here (resolved by place()).
 */
export function expand(key, start, route, def, cfg) {
  const segs = [];
  let p = { i: start.i, j: start.j, h: start.h }, t = 0;
  const vFwd = (def && def.speedPx ? def.speedPx : 60) / PX_PER_CELL;        // cells / s
  const vSide = (cfg.sidle || 34) / PX_PER_CELL;
  for (const st of route) {
    if (st.turn) {
      const b = { i: p.i, j: p.j, h: st.turn };
      const d = st.turn === p.h ? 0 : (cfg.turn || 1.2);
      if (d > 0) segs.push({ kind: 'turn', t0: t, t1: t + d, a: p, b, rects: [hullRect(key, p), hullRect(key, b)], tag: st.tag || null, ev: st.ev || null });
      p = b; t += d;
      continue;
    }
    if (st.wait !== undefined || st.waitUntil !== undefined) {
      const d = st.wait !== undefined ? Math.max(0, st.wait) : 0;
      segs.push({ kind: 'wait', t0: t, t1: t + d, a: p, b: p, rects: [hullRect(key, p)], tag: st.tag || null, until: st.waitUntil, ev: st.ev || null });
      t += d;
      continue;
    }
    if (st.to) {
      const b = { i: st.to[0], j: st.to[1], h: p.h };
      const di = b.i - p.i, dj = b.j - p.j;
      const D = Math.hypot(di, dj);
      if (D < 1e-6) continue;
      if (Math.abs(di) > 1e-6 && Math.abs(dj) > 1e-6) throw new Error('harbor route: diagonal move ' + JSON.stringify(st));
      const ax = Math.abs(di) > 1e-6 ? 'i' : 'j';
      const hv = HEAD[p.h];
      let kind, v, acc;
      if (ax === AXIS[p.h]) {
        const fwd = (ax === 'i' ? di * hv[0] : dj * hv[1]) > 0;
        kind = fwd ? 'move' : 'astern';
        v = fwd ? vFwd * (st.fast ? (cfg.seaSpeed || 1.8) : (cfg.basin || 1)) : vFwd * (cfg.astern || 0.5);
        acc = (fwd ? vFwd : v) / (cfg.accelS || 3);
        if (st.prof === 'sidle') { v = vSide; acc = v / 2; }      // a tug pushing a ship sideways keeps its pace
      } else { kind = 'sidle'; v = vSide; acc = v / 2; }
      const prof = profile(D, v, acc);
      segs.push({ kind, t0: t, t1: t + prof.T, a: p, b, rects: [union(hullRect(key, p), hullRect(key, b))], prof, tag: st.tag || null, ev: st.ev || null, key });
      p = b; t += prof.T;
    }
  }
  return { segs, end: p, T: t };
}

/** pose of a segment at relative time u (0 .. t1 - t0): { i, j, h, h2, f, v, kind } */
export function segPose(s, u, out = {}) {
  out.kind = s.kind; out.tag = s.tag; out.h2 = null; out.f = 0; out.v = 0;
  if (s.kind === 'turn') {
    const f = Math.min(1, Math.max(0, u / Math.max(1e-6, s.t1 - s.t0)));
    out.i = s.a.i; out.j = s.a.j; out.h = f < 0.5 ? s.a.h : s.b.h; out.h2 = f < 0.5 ? s.b.h : s.a.h; out.f = f;
    return out;
  }
  if (!s.prof) { out.i = s.a.i; out.j = s.a.j; out.h = s.a.h; return out; }
  const d = s.prof.pos(u) / s.prof.D;
  out.i = s.a.i + (s.b.i - s.a.i) * d; out.j = s.a.j + (s.b.j - s.a.j) * d; out.h = s.a.h;
  out.v = s.prof.vel(u) * PX_PER_CELL;      // px / s (for wakes, foam, smoke)
  return out;
}

/**
 * booking pieces of a segment: moving segments are cut into pieces of <= `dt` s, each with the hull swept during
 * that piece only (a long lane leg must not book the whole lane for its whole duration)
 */
export function pieces(s, dt = 2) {
  if (!s.prof || !s.key || s.t1 - s.t0 <= dt) return [{ t0: s.t0, t1: s.t1, rects: s.rects }];
  const out = [], n = Math.ceil((s.t1 - s.t0) / dt), A = {}, B = {};
  for (let k = 0; k < n; k++) {
    const u0 = (s.t1 - s.t0) * k / n, u1 = (s.t1 - s.t0) * (k + 1) / n;
    segPose(s, u0, A); segPose(s, u1, B);
    out.push({ t0: s.t0 + u0, t1: s.t0 + u1, rects: [union(hullRect(s.key, A), hullRect(s.key, B))] });
  }
  return out;
}
