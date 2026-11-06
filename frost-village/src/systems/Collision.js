// Static obstacle collision in "ground space" (y doubled, so 2:1 footprint ellipses become circles).
// A uniform grid keeps queries cheap. Moving agents call resolve() after integrating velocity.

import { shoreY as worldShoreY, WORLD } from '../data/world.js';

const CELL = 160;

export class Collision {
  /** w, h: the right / bottom edge of the world. (v4-C) the world starts at x = WORLD.left (the west strip
   *  lies at negative x): the grid and the shoreline cache start there */
  constructor(w, h) {
    this.w = w; this.h = h;
    this.ox = Math.min(0, Math.floor(Number(WORLD.left) || 0));
    this.cols = Math.ceil((w - this.ox) / CELL) + 1; this.rows = Math.ceil(h / CELL) + 1;
    this.grid = new Array(this.cols * this.rows);
    for (let i = 0; i < this.grid.length; i++) this.grid[i] = [];
    this.all = [];
    this.walk = null;     // (v3) walkable rects [[x0, y0, x1, y1], ...] of the revealed land (null = whole map)
    this.lands = [];      // ((v4.3 sea) the chief's own ground beyond the shore line: his landing at the water's edge (addLand)
    this._shoreCache = new Float32Array(Math.ceil((w - this.ox) / 8) + 2);
    for (let i = 0; i < this._shoreCache.length; i++) this._shoreCache[i] = shoreY(this.ox + i * 8);
  }

  add(x, y, r, tag) {
    const o = { x, y, r, active: true, tag: tag || null };
    // insert into every cell the circle may touch (r in ground space; vertical extent r/2)
    const m = 26; // max agent radius
    const x0 = Math.max(0, Math.floor((x - this.ox - r - m) / CELL)), x1 = Math.min(this.cols - 1, Math.floor((x - this.ox + r + m) / CELL));
    const y0 = Math.max(0, Math.floor((y - (r + m) / 2) / CELL)), y1 = Math.min(this.rows - 1, Math.floor((y + (r + m) / 2) / CELL));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) this.grid[cy * this.cols + cx].push(o);
    this.all.push(o);
    return o;
  }

  /**
   * ((v4.2 fix, gameplay M2) a wall: a capsule of radius r around the segment (x0, y0) – (x1, y1). Pushed out along
   * its normal, so a chain of segments has no gaps (a row of circles let the chief squeeze between two of them: each
   * circle pushed him sideways along the wall line, never back out)
   */
  addSeg(x0, y0, x1, y1, r, tag) {
    const o = { seg: true, x0, y0, x1, y1, x: (x0 + x1) / 2, y: (y0 + y1) / 2, r, active: true, tag: tag || null };
    const m = 26;
    const ax = Math.min(x0, x1) - r - m, bx = Math.max(x0, x1) + r + m, ay = Math.min(y0, y1) - (r + m) / 2, by = Math.max(y0, y1) + (r + m) / 2;
    const cx0 = Math.max(0, Math.floor((ax - this.ox) / CELL)), cx1 = Math.min(this.cols - 1, Math.floor((bx - this.ox) / CELL));
    const cy0 = Math.max(0, Math.floor(ay / CELL)), cy1 = Math.min(this.rows - 1, Math.floor(by / CELL));
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) this.grid[cy * this.cols + cx].push(o);
    this.all.push(o);
    return o;
  }

  /** a polyline of walls (closed: back to the first point); `gaps` = [{ x, y, w }] door openings (ground px, ±w/2
   *  along the wall around the point's projection); returns the segment obstacles */
  addWalls(pts, r, tag, gaps, closed) {
    const out = [], n = pts.length, G = gaps || [];
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      // pieces of a -> b outside every gap (in ground space: y doubled)
      const vx = b.x - a.x, vy = (b.y - a.y) * 2, L = Math.hypot(vx, vy) || 1;
      let cuts = [[0, 1]];
      for (const g of G) {
        const t = ((g.x - a.x) * vx + (g.y - a.y) * 2 * vy) / (L * L);
        const off = Math.abs(((g.x - a.x) * vy - (g.y - a.y) * 2 * vx) / L);
        if (t < -0.2 || t > 1.2 || off > (g.reach || 90)) continue;
        const h = (g.w || 70) / 2 / L, lo = t - h, hi = t + h;
        cuts = cuts.flatMap(([u, w]) => (hi <= u || lo >= w ? [[u, w]] : [[u, Math.max(u, lo)], [Math.min(w, hi), w]].filter(([p, q]) => q - p > 1e-3)));
      }
      for (const [u, w] of cuts) out.push(this.addSeg(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, a.x + (b.x - a.x) * w, a.y + (b.y - a.y) * w, r, tag));
    }
    return out;
  }

  /** ground-space push of a point out of a wall segment: { dx, dy, d, R } (dy in ground space) */
  segNear(o, x, y, rad) {
    const ax = o.x0, ay = o.y0 * 2, bx = o.x1, by = o.y1 * 2, qy = y * 2;
    const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * vx + (qy - ay) * vy) / l2));
    const dx = x - (ax + vx * t), dy = qy - (ay + vy * t);
    return { dx, dy, d2: dx * dx + dy * dy, R: o.r + rad };
  }

  /**
   * (v3) the land that is revealed (Territory). open: the open regions' rects; inner: walkable rects
   * (for pushing someone back out of the fog); edge: how far from the fog people stay (px)
   */
  setWalkable(open, inner, edge) { this.walk = open && open.length ? open : null; this.inner = inner || open || []; this.edge = edge || 46; }

  inOpen(x, y) {
    const w = this.walk;
    for (let i = 0; i < w.length; i++) { const r = w[i]; if (x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]) return true; }
    return false;
  }

  /** inside the revealed land, and not right at the fog's edge? */
  inWalk(x, y) {
    if (!this.walk) return true;
    const e = this.edge;
    return this.inOpen(x, y) && this.inOpen(x - e, y) && this.inOpen(x + e, y) && this.inOpen(x, y - e) && this.inOpen(x, y + e);
  }

  /**
   * ((v4.3 「바다 가까이」) ground beyond the shore line that only the CHIEF walks on: a convex polygon (screen px, the
   * walker's centre) — his landing at the water's edge and the snow behind it. Everyone else (paths, wanderers, porters,
   * fishers) never knows it is there: offLand / blocked / resolve take it only with `chief` true. Returns the land
   * object ({ pts, active, tag, door }). `door` (optional): a point on ordinary land just outside it, where a walk onto
   * it begins (the 관망 pilot's last waypoint: Paths / roads do not know the land)
   */
  addLand(pts, tag, door) {
    const P = pts.map((q) => ({ x: q.x, y: q.y }));
    const o = { pts: P, active: true, tag: tag || null, door: door ? { x: door.x, y: door.y } : null, x0: Math.min(...P.map((q) => q.x)), x1: Math.max(...P.map((q) => q.x)), y0: Math.min(...P.map((q) => q.y)), y1: Math.max(...P.map((q) => q.y)) };
    this.lands.push(o);
    return o;
  }

  /** (v4.3 sea) the chief's land (addLand) under (x, y), or null */
  inLand(x, y) {
    const L = this.lands;
    for (let i = 0; i < L.length; i++) {
      const o = L[i];
      if (!o.active || x < o.x0 || x > o.x1 || y < o.y0 || y > o.y1) continue;
      let inside = false;
      for (let a = 0, b = o.pts.length - 1; a < o.pts.length; b = a++) {
        const p = o.pts[a], q = o.pts[b];
        if ((p.y > y) !== (q.y > y) && x < ((q.x - p.x) * (y - p.y)) / ((q.y - p.y) || 1e-9) + p.x) inside = !inside;
      }
      if (inside) return o;
    }
    return null;
  }

  /** ((v4.2.0.1) off the land a walker can stand on: the map's edge, the sea, the fog (no obstacle looked at).
   *  ((v4.3 sea) chief: his own land beyond the shore line counts as land (addLand)) */
  offLand(x, y, chief) {
    if (x < this.ox + 40 || x > this.w - 40 || y > this.h - 40 || !this.inWalk(x, y)) return true;
    return y < this.shore(x) + 46 && !(chief && this.lands.length && this.inLand(x, y));
  }

  /** true if a circle of radius `rad` at (x, y) overlaps an active obstacle or leaves the walkable area
   *  ((v4.3 sea) chief: the chief's own land counts as walkable) */
  blocked(x, y, rad, ignore, chief) {
    if (this.offLand(x, y, chief)) return true;
    const cx = Math.floor((x - this.ox) / CELL), cy = Math.floor(y / CELL);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return true;
    const cell = this.grid[cy * this.cols + cx];
    for (let i = 0; i < cell.length; i++) {
      const o = cell[i];
      if (!o.active || o === ignore) continue;
      if (o.seg) { const q = this.segNear(o, x, y, rad); if (q.d2 < q.R * q.R) return true; continue; }
      const dx = x - o.x, dy = (y - o.y) * 2, R = o.r + rad;
      if (dx * dx + dy * dy < R * R) return true;
    }
    return false;
  }

  /** (v3.5 review) does a fence stand on the straight line between two points? (sampled; for the guide arrow) */
  fenceBetween(ax, ay, bx, by) {
    const L = Math.hypot(bx - ax, (by - ay) * 2), n = Math.max(1, Math.ceil(L / 20));
    for (let k = 1; k < n; k++) {
      const x = ax + (bx - ax) * (k / n), y = ay + (by - ay) * (k / n);
      const cx = Math.floor((x - this.ox) / CELL), cy = Math.floor(y / CELL);
      if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) continue;
      const cell = this.grid[cy * this.cols + cx];
      for (let i = 0; i < cell.length; i++) {
        const o = cell[i];
        if (!o.active || o.seg || !o.tag || o.tag.indexOf('fence') !== 0) continue;
        const dx = x - o.x, dy = (y - o.y) * 2;
        if (dx * dx + dy * dy < o.r * o.r) return true;
      }
    }
    return false;
  }

  /** (v4.3 sea) the nearest point just inside one of the chief's lands when it is nearer than `limit` ground px, or null */
  landEdge(x, y, limit) {
    let best = null, bd = limit;
    for (const o of this.lands) {
      if (!o.active) continue;
      const P = o.pts;
      // the polygon's centre: the found edge point is pulled 1.5 px toward it (inside, not on the edge)
      let cx = 0, cy = 0;
      for (const q of P) { cx += q.x; cy += q.y; }
      cx /= P.length; cy /= P.length;
      for (let a = 0, b = P.length - 1; a < P.length; b = a++) {
        const ax = P[b].x, ay = P[b].y * 2, vx = P[a].x - ax, vy = P[a].y * 2 - ay, l2 = vx * vx + vy * vy || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y * 2 - ay) * vy) / l2));
        const ex = ax + vx * t, ey = (ay + vy * t) / 2, d = Math.hypot(x - ex, (y - ey) * 2);
        if (d < bd) {
          const k = 1.5 / (Math.hypot(cx - ex, (cy - ey) * 2) || 1);
          bd = d; best = { x: ex + (cx - ex) * k, y: ey + (cy - ey) * k };
        }
      }
    }
    return best;
  }

  shore(x) {
    const u = (x - this.ox) / 8;
    const i = Math.max(0, Math.min(this._shoreCache.length - 2, Math.floor(u)));
    const f = Math.max(0, Math.min(1, u - i));
    return this._shoreCache[i] * (1 - f) + this._shoreCache[i + 1] * f;
  }

  /** push a circle of radius `rad` at (p.x, p.y) out of obstacles; mutates p; returns true if it hit something
   *  ((v4.3 sea) chief: he may stand on his own land beyond the shore line (addLand); off it he goes back to the nearer
   *  of the land's edge and the shore's walk line, so he slides along the landing's sides instead of jumping) */
  resolve(p, rad, chief) {
    let hit = false;
    const cx = Math.floor((p.x - this.ox) / CELL), cy = Math.floor(p.y / CELL);
    if (cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows) {
      const cell = this.grid[cy * this.cols + cx];
      for (let i = 0; i < cell.length; i++) {
        const o = cell[i];
        if (!o.active) continue;
        if (o.seg) {
          const q = this.segNear(o, p.x, p.y, rad);
          if (q.d2 >= q.R * q.R) continue;
          const d = Math.sqrt(q.d2) || 0.001, push = (q.R - d) / d;
          p.x += q.dx * push; p.y += (q.dy * push) / 2;
          hit = true;
          continue;
        }
        const dx = p.x - o.x, dy = (p.y - o.y) * 2;
        const R = o.r + rad;
        const d2 = dx * dx + dy * dy;
        if (d2 >= R * R) continue;
        const d = Math.sqrt(d2) || 0.001;
        const push = (R - d) / d;
        p.x += dx * push; p.y += (dy * push) / 2;
        hit = true;
      }
    }
    // world bounds + shoreline
    const minY = this.shore(p.x) + 46;
    if (p.y < minY && !(chief && this.lands.length && this.inLand(p.x, p.y))) {
      const q = chief && this.lands.length ? this.landEdge(p.x, p.y, 2 * (minY - p.y)) : null;
      if (q) { p.x = q.x; p.y = q.y; } else p.y = minY;
      hit = true;
    }
    if (p.x < this.ox + 40) { p.x = this.ox + 40; hit = true; } else if (p.x > this.w - 40) { p.x = this.w - 40; hit = true; }
    if (p.y > this.h - 40) { p.y = this.h - 40; hit = true; }
    // (v3) the fog: back into the nearest piece of revealed land
    if (this.walk && !this.inWalk(p.x, p.y)) {
      let bx = p.x, by = p.y, bd = Infinity;
      for (const r of this.inner) {
        const cx = Math.max(r[0], Math.min(r[2], p.x)), cy = Math.max(r[1], Math.min(r[3], p.y));
        const d = (cx - p.x) * (cx - p.x) + (cy - p.y) * (cy - p.y) * 4;
        if (d < bd) { bd = d; bx = cx; by = cy; }
      }
      p.x = bx; p.y = Math.max(by, this.shore(bx) + 46);
      hit = true;
    }
    return hit;
  }
}

// the shoreline lives in data/world.js (v3: it bends south along the east coast)
export const shoreY = worldShoreY;
