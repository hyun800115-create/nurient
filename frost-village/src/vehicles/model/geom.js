// Geometry helpers for the vehicles model (pure). World px on the 2:1 iso ground: one metre along an iso axis is
// (45.25, ±22.63) px, so a ground distance in metres is hypot(dx, 2·dy) / 64.

export const SQ2 = Math.SQRT2;
/** ground metres between two px points */
export function metres(ax, ay, bx, by) { const dx = bx - ax, dy = (by - ay) * 2; return Math.sqrt(dx * dx + dy * dy) / 64; }
/** ground metres of a px vector */
export function mlen(dx, dy) { return Math.sqrt(dx * dx + 4 * dy * dy) / 64; }

/**
 * the vehicle art heading for a screen vector (the art has SE = world +X and NE = world +Y; SW / NW are their
 * mirrors). The vector is split into lattice components and the larger one wins.
 */
export function dirKey(dx, dy) {
  const di = (dx / 64 + dy / 32) / 2, dj = (dx / 64 - dy / 32) / 2;
  if (Math.abs(di) >= Math.abs(dj)) return di >= 0 ? 'SE' : 'NW';
  return dj >= 0 ? 'NE' : 'SW';
}
/** screen unit vector of an art heading */
export const DIR_VEC = { SE: [0.8944, 0.4472], NE: [0.8944, -0.4472], NW: [-0.8944, -0.4472], SW: [-0.8944, 0.4472] };

/** cumulative metres along a polyline [{x, y}] */
export function cumOf(pts) {
  const c = new Float64Array(pts.length);
  for (let k = 1; k < pts.length; k++) c[k] = c[k - 1] + metres(pts[k - 1].x, pts[k - 1].y, pts[k].x, pts[k].y);
  return c;
}

/** point at s metres along a polyline (clamped): writes { x, y, hx, hy } into out (hx, hy = screen unit heading) */
export function pointAt(pts, cum, s, out) {
  const n = pts.length;
  out = out || {};
  if (n === 1) { out.x = pts[0].x; out.y = pts[0].y; out.hx = 1; out.hy = 0; return out; }
  if (s <= 0) return seg(pts, 1, 0, out);
  const L = cum[n - 1];
  if (s >= L) return seg(pts, n - 1, 1, out);
  // binary search the segment
  let lo = 1, hi = n - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < s) lo = m + 1; else hi = m; }
  const k = lo, len = cum[k] - cum[k - 1];
  return seg(pts, k, len > 1e-9 ? (s - cum[k - 1]) / len : 0, out);
}
function seg(pts, k, f, out) {
  const a = pts[k - 1], b = pts[k];
  out.x = a.x + (b.x - a.x) * f; out.y = a.y + (b.y - a.y) * f;
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
  out.hx = dx / d; out.hy = dy / d;
  return out;
}

/**
 * nearest point of a polyline to (x, y) in ground metres: { s, d, lat } (lat > 0 = the point lies to the right of
 * the direction of travel on the ground)
 */
export function project(pts, cum, x, y) {
  let best = Infinity, bs = 0, blat = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    const ux = b.x - a.x, uy = (b.y - a.y) * 2, vx = x - a.x, vy = (y - a.y) * 2;
    const L2 = ux * ux + uy * uy;
    let f = L2 > 1e-9 ? (vx * ux + vy * uy) / L2 : 0;
    f = f < 0 ? 0 : f > 1 ? 1 : f;
    const px = a.x + (b.x - a.x) * f, py = a.y + (b.y - a.y) * f;
    const d = metres(px, py, x, y);
    if (d < best) { best = d; bs = cum[k - 1] + (cum[k] - cum[k - 1]) * f; blat = (ux * vy - uy * vx) / Math.sqrt(Math.max(L2, 1e-9)) / 64; }
  }
  return { s: bs, d: best, lat: blat };
}

/** quadratic bezier p0 -> c -> p2 as n+1 points */
export function bezier(p0, c, p2, n = 8) {
  const out = [];
  for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; out.push({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p2.y }); }
  return out;
}

/** do segments ab and cd cross (strictly inside both)? */
export function segX(a, b, c, d) {
  const den = (d.y - c.y) * (b.x - a.x) - (d.x - c.x) * (b.y - a.y);
  if (Math.abs(den) < 1e-9) return false;
  const ua = ((d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x)) / den, ub = ((b.x - a.x) * (a.y - c.y) - (b.y - a.y) * (a.x - c.x)) / den;
  return ua > 0.02 && ua < 0.98 && ub > 0.02 && ub < 0.98;
}
