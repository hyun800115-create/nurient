// Static obstacle collision in "ground space" (y doubled, so 2:1 footprint ellipses become circles).
// A uniform grid keeps queries cheap. Moving agents call resolve() after integrating velocity.

import { shoreY as worldShoreY } from '../data/world.js';

const CELL = 160;

export class Collision {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.cols = Math.ceil(w / CELL) + 1; this.rows = Math.ceil(h / CELL) + 1;
    this.grid = new Array(this.cols * this.rows);
    for (let i = 0; i < this.grid.length; i++) this.grid[i] = [];
    this.all = [];
    this.walk = null;     // (v3) walkable rects [[x0, y0, x1, y1], ...] of the revealed land (null = whole map)
    this._shoreCache = new Float32Array(Math.ceil(w / 8) + 2);
    for (let i = 0; i < this._shoreCache.length; i++) this._shoreCache[i] = shoreY(i * 8);
  }

  add(x, y, r, tag) {
    const o = { x, y, r, active: true, tag: tag || null };
    // insert into every cell the circle may touch (r in ground space; vertical extent r/2)
    const m = 26; // max agent radius
    const x0 = Math.max(0, Math.floor((x - r - m) / CELL)), x1 = Math.min(this.cols - 1, Math.floor((x + r + m) / CELL));
    const y0 = Math.max(0, Math.floor((y - (r + m) / 2) / CELL)), y1 = Math.min(this.rows - 1, Math.floor((y + (r + m) / 2) / CELL));
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) this.grid[cy * this.cols + cx].push(o);
    this.all.push(o);
    return o;
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

  /** true if a circle of radius `rad` at (x, y) overlaps an active obstacle or leaves the walkable area */
  blocked(x, y, rad, ignore) {
    if (x < 40 || x > this.w - 40 || y > this.h - 40 || y < this.shore(x) + 46 || !this.inWalk(x, y)) return true;
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return true;
    const cell = this.grid[cy * this.cols + cx];
    for (let i = 0; i < cell.length; i++) {
      const o = cell[i];
      if (!o.active || o === ignore) continue;
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
      const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
      if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) continue;
      const cell = this.grid[cy * this.cols + cx];
      for (let i = 0; i < cell.length; i++) {
        const o = cell[i];
        if (!o.active || !o.tag || o.tag.indexOf('fence') !== 0) continue;
        const dx = x - o.x, dy = (y - o.y) * 2;
        if (dx * dx + dy * dy < o.r * o.r) return true;
      }
    }
    return false;
  }

  shore(x) {
    const i = Math.max(0, Math.min(this._shoreCache.length - 2, Math.floor(x / 8)));
    const f = x / 8 - i;
    return this._shoreCache[i] * (1 - f) + this._shoreCache[i + 1] * f;
  }

  /** push a circle of radius `rad` at (p.x, p.y) out of obstacles; mutates p; returns true if it hit something */
  resolve(p, rad) {
    let hit = false;
    const cx = Math.floor(p.x / CELL), cy = Math.floor(p.y / CELL);
    if (cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows) {
      const cell = this.grid[cy * this.cols + cx];
      for (let i = 0; i < cell.length; i++) {
        const o = cell[i];
        if (!o.active) continue;
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
    if (p.y < minY) { p.y = minY; hit = true; }
    if (p.x < 40) { p.x = 40; hit = true; } else if (p.x > this.w - 40) { p.x = this.w - 40; hit = true; }
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
