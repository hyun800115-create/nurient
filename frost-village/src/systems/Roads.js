// Road graph (v2): the village paths as a small graph (nodes + edges from data/world.js `roads`).
// Porters, customers and new residents travel along it: A* between the nearest road nodes, then
// off-road only for the last metres. Edges inside a zone appear when that zone is unlocked.
// Pure JS (no Phaser) so the routing can also be tested in Node.

import { WORLD } from '../data/world.js';

const gd = (ax, ay, bx, by) => { const dx = ax - bx, dy = (ay - by) * 2; return Math.sqrt(dx * dx + dy * dy); };

// trips shorter than this (ground px) go straight; a road detour longer than DETOUR x straight goes straight too
const MIN_ROAD_DIST = 300;
const DETOUR = 1.9;
const OFFROAD = 1.8;   // walking through the snow counts this much more than walking on the road (prefer roads)
const TRIM = 170;      // a road node this close behind the walker / beyond the target is skipped
const BUCKET = 256;    // (v4-B) px: the nearest-node search grid

export class Roads {
  /** isOpen(zoneId) -> bool : whether edges of that zone can be used; regionOpen(id): (v3) new land revealed */
  constructor(isOpen, data, regionOpen) {
    this.isOpen = isOpen || (() => true);
    this.regionOpen = regionOpen || (() => true);
    const R = data || WORLD.roads || { nodes: {}, edges: [] };
    this.nodes = [];
    this.byId = {};
    for (const id in R.nodes) {
      const p = R.nodes[id];
      if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
      const n = { i: this.nodes.length, id, x: p[0], y: p[1], edges: [] };
      this.byId[id] = n;
      this.nodes.push(n);
    }
    this.edges = [];
    for (const e of R.edges || []) {
      const a = this.byId[e[0]], b = this.byId[e[1]], o = e[2] || {};
      if (!a || !b || a === b) continue;
      const via = Array.isArray(o.via) ? o.via.filter((v) => Array.isArray(v) && Number.isFinite(v[0]) && Number.isFinite(v[1])) : [];
      const pts = [[a.x, a.y]].concat(via, [[b.x, b.y]]);
      let len = 0;
      for (let k = 1; k < pts.length; k++) len += gd(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1]);
      const edge = { a: a.i, b: b.i, via, len, zone: o.zone || null, region: o.region || null, walk: o.walk !== false, draw: o.draw !== false };
      this.edges.push(edge);
      a.edges.push(edge); b.edges.push(edge);
    }
    this.cache = new Map();
    this.version = 0;
    // A* scratch buffers (reused: no allocations per search)
    const N = this.nodes.length;
    this.g = new Float64Array(N); this.f = new Float64Array(N); this.from = new Int32Array(N); this.fromEdge = new Array(N);
    this.open = []; this.closed = new Uint8Array(N);
    this.buildBuckets();
  }

  /** (v4-B) a level crossing the train is near: true = wait at the stop point (the walker does not re-route).
   *  Neighbours sets this; the route itself stays the same */
  edgeBlocked(e) { void e; return false; }

  /** (v4-B) nodes in a 256 px grid (nearestK looks at the cells around a point, ring by ring) */
  buildBuckets() {
    const b = this.buckets = new Map();
    for (const n of this.nodes) {
      const k = Math.floor(n.x / BUCKET) * 4096 + Math.floor(n.y / BUCKET);
      let l = b.get(k);
      if (!l) b.set(k, l = []);
      l.push(n);
    }
    let maxX = 0, maxY = 0;
    for (const n of this.nodes) { maxX = Math.max(maxX, n.x); maxY = Math.max(maxY, n.y); }
    this.bucketSpan = Math.ceil(Math.max(maxX, maxY * 2, 1) / BUCKET) + 2;
  }

  /** zones changed (unlock): forget cached paths */
  invalidate() { this.version++; this.cache.clear(); }

  /** (v4-A) merge another walk graph ({ nodes: { id: [x, y] }, edges: [[a, b, opts]] }; a node id that exists
   *  already is the same node — that is how the v4 street grid joins the v2 roads) */
  addGraph(R) {
    if (!R || !R.nodes) return 0;
    let n = 0;
    for (const id in R.nodes) {
      if (this.byId[id]) continue;
      const p = R.nodes[id];
      if (!Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) continue;
      const node = { i: this.nodes.length, id, x: p[0], y: p[1], edges: [] };
      this.byId[id] = node;
      this.nodes.push(node);
      n++;
    }
    for (const e of R.edges || []) {
      const a = this.byId[e[0]], b = this.byId[e[1]], o = e[2] || {};
      if (!a || !b || a === b) continue;
      const edge = { a: a.i, b: b.i, via: [], len: gd(a.x, a.y, b.x, b.y), zone: o.zone || null, region: o.region || null, walk: o.walk !== false, draw: o.draw !== false, xing: o.xing !== undefined ? o.xing : -1 };
      this.edges.push(edge);
      a.edges.push(edge); b.edges.push(edge);
    }
    const N = this.nodes.length;
    this.g = new Float64Array(N); this.f = new Float64Array(N); this.from = new Int32Array(N); this.fromEdge = new Array(N);
    this.closed = new Uint8Array(N);
    this.buildBuckets();
    this.invalidate();
    return n;
  }

  usable(e) { return e.walk && (!e.zone || this.isOpen(e.zone)) && (!e.region || this.regionOpen(e.region)); }

  /** nearest node that has a usable edge */
  nearest(x, y) { const k = this.nearestK(x, y, 1, this._k1 || (this._k1 = [])); return k.length ? k[0] : -1; }

  /** the `k` nearest nodes with a usable edge (indices, nearest first). (v4-B) searched ring by ring in a
   *  256 px bucket grid: the rings stop once the k-th best is closer than anything the next ring can hold */
  nearestK(x, y, k, out) {
    out = out || [];
    out.length = 0;
    const ds = this._ds || (this._ds = []);
    ds.length = 0;
    const bx = Math.floor(x / BUCKET), by = Math.floor(y / BUCKET);
    const consider = (n) => {
      if (!n.edges.some((e) => this.usable(e))) return;
      const d = gd(x, y, n.x, n.y);
      let j = out.length;
      if (j >= k && d >= ds[k - 1]) return;
      if (j >= k) j = k - 1;
      out[j] = n.i; ds[j] = d;
      while (j > 0 && ds[j - 1] > ds[j]) { const t = ds[j]; ds[j] = ds[j - 1]; ds[j - 1] = t; const u = out[j]; out[j] = out[j - 1]; out[j - 1] = u; j--; }
    };
    for (let r = 0; r <= this.bucketSpan; r++) {
      // nodes in ring r are at least (r - 1) * BUCKET px away along x, (r - 1) * BUCKET * 2 ground px along y
      if (out.length >= k && ds[k - 1] < (r - 1) * BUCKET) break;
      for (let cx = bx - r; cx <= bx + r; cx++) {
        for (let cy = by - r; cy <= by + r; cy++) {
          if (Math.max(Math.abs(cx - bx), Math.abs(cy - by)) !== r) continue;
          const l = this.buckets.get(cx * 4096 + cy);
          if (l) for (const n of l) consider(n);
        }
      }
    }
    return out;
  }

  /** list of [nodeIndex, edgeTaken] from node a to node b (A*), cached; null when unreachable.
   *  (v4-B) the open list is a binary heap (it was a linear scan; the v4 grid has ~200 nodes) */
  path(a, b) {
    const key = a * 65536 + b;
    if (this.cache.has(key)) return this.cache.get(key);
    const g = this.g, f = this.f, from = this.from, fe = this.fromEdge, closed = this.closed;
    const heap = this.open;
    g.fill(Infinity); closed.fill(0); from.fill(-1); heap.length = 0;
    const tb = this.nodes[b];
    const push = (n) => { heap.push(n); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (f[heap[p]] <= f[heap[i]]) break; const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l; if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r; if (m === i) break; const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } } return top; };
    g[a] = 0; f[a] = gd(this.nodes[a].x, this.nodes[a].y, tb.x, tb.y); push(a);
    let found = false;
    let guard = 0;
    const N = this.nodes.length;
    while (heap.length) {
      const cur = pop();
      if (cur === b) { found = true; break; }
      if (closed[cur]) continue;
      closed[cur] = 1;
      for (const e of this.nodes[cur].edges) {
        if (!this.usable(e)) continue;
        const nx = e.a === cur ? e.b : e.a;
        if (closed[nx]) continue;
        const ng = g[cur] + e.len;
        if (ng < g[nx]) {
          g[nx] = ng; from[nx] = cur; fe[nx] = e;
          const n = this.nodes[nx];
          f[nx] = ng + gd(n.x, n.y, tb.x, tb.y);
          push(nx);
        }
      }
      if (++guard > N * 8) break;
    }
    let res = null;
    if (found || a === b) {
      res = [];
      for (let c = b; c !== a && c >= 0; c = from[c]) res.push([c, fe[c]]);
      res.push([a, null]);
      res.reverse();
      res.len = g[b];
    }
    this.cache.set(key, res);
    return res;
  }

  /**
   * Waypoints from (ax, ay) to (bx, by) along the roads (when the road is worth it).
   * Returns `out` (array of {x, y}); the last point is always the target.
   */
  route(ax, ay, bx, by, out) {
    out = out || [];
    out.length = 0;
    const direct = gd(ax, ay, bx, by);
    if (direct < MIN_ROAD_DIST) { out.push({ x: bx, y: by }); return out; }
    // best pair among the 3 nearest nodes at each end (the nearest node can lie behind us)
    const As = this.nearestK(ax, ay, 3, this._ka || (this._ka = [])), Bs = this.nearestK(bx, by, 3, this._kb || (this._kb = []));
    let p = null, na = -1, nb = -1, total = Infinity;
    for (const a of As) {
      for (const b of Bs) {
        if (a === b) continue;
        const q = this.path(a, b);
        if (!q) continue;
        const A = this.nodes[a], B = this.nodes[b];
        const c = OFFROAD * gd(ax, ay, A.x, A.y) + q.len + OFFROAD * gd(B.x, B.y, bx, by);
        if (c < total) { total = c; p = q; na = a; nb = b; }
      }
    }
    if (!p || p.len + gd(ax, ay, this.nodes[na].x, this.nodes[na].y) + gd(this.nodes[nb].x, this.nodes[nb].y, bx, by) > direct * DETOUR + 120) { out.push({ x: bx, y: by }); return out; }
    const A = this.nodes[na];
    // polyline through the nodes (and the curved points of each edge)
    const pts = [{ x: A.x, y: A.y }];
    for (let k = 1; k < p.length; k++) {
      const [ni, e] = p[k];
      const prev = p[k - 1][0];
      const via = e.a === prev ? e.via : e.via.slice().reverse();
      for (const v of via) pts.push({ x: v[0], y: v[1] });
      pts.push({ x: this.nodes[ni].x, y: this.nodes[ni].y });
    }
    // do not walk back to a node that lies just behind us / just beyond the target
    while (pts.length >= 2 && gd(ax, ay, pts[0].x, pts[0].y) < TRIM && gd(ax, ay, pts[1].x, pts[1].y) <= gd(pts[0].x, pts[0].y, pts[1].x, pts[1].y)) pts.shift();
    while (pts.length >= 2 && gd(bx, by, pts[pts.length - 1].x, pts[pts.length - 1].y) < TRIM && gd(bx, by, pts[pts.length - 2].x, pts[pts.length - 2].y) <= gd(pts[pts.length - 1].x, pts[pts.length - 1].y, pts[pts.length - 2].x, pts[pts.length - 2].y)) pts.pop();
    // (v3) skip road points a prop now stands on (a tent by a v2 node, a new building): walking into
    // them would leave a porter circling the obstacle
    const bl = this.blocked;
    for (const q of pts) if (!bl || !bl(q.x, q.y)) out.push(q);
    out.push({ x: bx, y: by });
    return out;
  }

  /** polylines ([[x, y], ...]) of the drawn edges of `zone` (null = always-there roads); `region`: (v3) of that new land */
  drawn(zone, region) {
    const out = [];
    for (const e of this.edges) {
      if (!e.draw || (e.zone || null) !== (zone || null) || (e.region || null) !== (region || null)) continue;
      const a = this.nodes[e.a], b = this.nodes[e.b];
      out.push([[a.x, a.y]].concat(e.via, [[b.x, b.y]]));
    }
    return out;
  }
}
