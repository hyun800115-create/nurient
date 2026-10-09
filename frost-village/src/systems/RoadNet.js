// RoadNet (v4, docs/v4_plan.md §10.1) — the v4 street grid as data: walk lines on the roads-kit lattice,
// junctions where they meet, door spurs, level crossings; (v4-B) the cells of every street (ROAD / WALK / SQUARE /
// RAIL / XING with their class), the drive lanes (right-hand) with their junction connectors for v5's vehicles,
// routes for walkers and drivers, and upgrade() for the 읍 repaving. Pure JS (no Phaser): tested in Node.
//
//   const rn = new RoadNet(WORLD.v4, { doors });      doors: [{ id, x, y }]   (building door points, px)
//   rn.walkGraph()  -> { nodes: { id: [x, y] }, edges: [[a, b, { region, xing, draw: false }]] }  (Roads.addGraph format)
//   rn.doorNode(id) -> graph node id of a door spur
//   rn.cells        Map key(ci, cj) -> { t: CELL.*, street, cls: 0 dirt | 1 cobble | 2 asphalt, region }
//   rn.route(from, to, { mode: 'walk' | 'drive' }) -> { pts, cum, edges, xings, lenM } | null   (from / to: {x, y})
//   rn.laneCentre(edge, dir, t), rn.stopLine(edge, dir), rn.connectors(nodeId), rn.upgrade(streetId, cls)

import { WORLD } from '../data/world.js';

const EPS = 0.06;          // cells: stops closer than this are one node
const DOOR_REACH = 3.2;    // cells: a door joins a walk line at most this far in front of it
// (v4-B) cell types and road classes
export const CELL = { NONE: 0, ROAD: 1, WALK: 2, SQUARE: 3, RAIL: 4, XING: 5 };
export const CLS = { dirt: 0, cobble: 1, asphalt: 2 };
const CLS_NAME = ['dirt', 'cobble', 'asphalt'];
const S2 = Math.SQRT2;

export class RoadNet {
  constructor(v4, opts = {}) {
    this.v4 = v4 || WORLD.v4;
    const G = this.v4.G;
    this.G = G;
    this.townX = (WORLD.territory && WORLD.territory.town && WORLD.territory.town.rect[0]) || 4150;
    this.lines = [];
    for (const s of this.v4.streets || []) {
      if (s.walk === undefined || s.walk === null) continue;
      const span = s.walkSpan || (s.axis === 'x' ? s.i : s.j);
      this.lines.push({ id: s.id, axis: s.axis, fix: s.walk, a: Math.min(span[0], span[1]), b: Math.max(span[0], span[1]), xing: s.xing !== undefined ? s.xing : -1, stops: [] });
    }
    (this.v4.walkExtra || []).forEach((w, k) => {
      if (!Array.isArray(w) || w.length < 4) return;
      this.lines.push({ id: 'extra' + k, axis: w[0], fix: w[1], a: Math.min(w[2], w[3]), b: Math.max(w[2], w[3]), xing: -1, stops: [] });
    });
    this.build(opts.doors || []);
    // (v4-B) cells, drive lanes; the 읍 upgrade state (street id -> class / sidewalk)
    this.version = 0;
    this.listeners = [];
    this.level = {};
    this.buildCells();
    this.buildLanes();
  }

  /** lattice -> px */
  L(i, j) { return [this.G[0] + 64 * (i + j), this.G[1] + 32 * (i - j)]; }
  /** px -> lattice */
  P(x, y) { const a = (x - this.G[0]) / 64, b = (y - this.G[1]) / 32; return { i: (a + b) / 2, j: (a - b) / 2 }; }

  /** lattice point of parameter t on a line */
  at(line, t) { return line.axis === 'x' ? { i: t, j: line.fix } : { i: line.fix, j: t }; }

  build(doors) {
    const lines = this.lines;
    for (const l of lines) l.stops = [l.a, l.b];
    // junctions: an X line and a Y line that meet (or touch at an end)
    for (const x of lines) {
      if (x.axis !== 'x') continue;
      for (const y of lines) {
        if (y.axis !== 'y') continue;
        if (y.fix >= x.a - EPS && y.fix <= x.b + EPS && x.fix >= y.a - EPS && x.fix <= y.b + EPS) { x.stops.push(y.fix); y.stops.push(x.fix); }
      }
    }
    // parallel lines that continue each other (same fix, touching ends) join at that end
    // door spurs: the nearest walk line in FRONT of the door (buildings face -j), else any near line
    this.doorSpur = {};
    for (const d of doors) {
      if (!d || !Number.isFinite(d.x) || !Number.isFinite(d.y)) continue;
      const q = this.P(d.x, d.y);
      let best = null, bd = Infinity;
      for (const l of lines) {
        let dist, t;
        if (l.axis === 'x') { t = Math.max(l.a, Math.min(l.b, q.i)); dist = Math.hypot(q.j - l.fix, (q.i - t) * 0.8); if (l.fix > q.j + 0.2 && !d.anySide) dist += 2.5; }
        else { t = Math.max(l.a, Math.min(l.b, q.j)); dist = Math.hypot(q.i - l.fix, q.j - t); if (t > q.j + 0.2 && !d.anySide) dist += 2.5; }
        if (dist < bd) { bd = dist; best = { l, t }; }
      }
      if (!best || bd > DOOR_REACH + 2.5) continue;
      best.l.stops.push(best.t);
      this.doorSpur[d.id] = { line: best.l, t: best.t, x: d.x, y: d.y };
    }
    // nodes along every line (sorted stops), edges between consecutive ones
    this.nodes = [];
    this.edges = [];
    const byKey = new Map();
    const v2 = (WORLD.roads && WORLD.roads.nodes) || {};
    const nodeAt = (i, j) => {
      const k = Math.round(i / EPS) + ',' + Math.round(j / EPS);
      let n = byKey.get(k);
      if (n) return n;
      const [x, y] = this.L(i, j);
      let id = 'g:' + this.nodes.length;
      // the v2 graph's link end (역 가는 길) is the same point: share its id so both graphs join
      for (const vid in v2) { const p = v2[vid]; if (Math.abs(p[0] - x) < 3 && Math.abs(p[1] - y) < 3) { id = vid; break; } }
      n = { id, i, j, x: Math.round(x), y: Math.round(y), kind: 'bend' };
      byKey.set(k, n);
      this.nodes.push(n);
      return n;
    };
    for (const l of lines) {
      const ts = Array.from(new Set(l.stops.map((t) => Math.round(t / EPS) * EPS))).sort((a, b) => a - b);
      let prev = null;
      for (const t of ts) {
        const p = this.at(l, t);
        const n = nodeAt(p.i, p.j);
        if (prev && prev !== n) this.addEdge(prev, n, l);
        prev = n;
      }
    }
    // door spur edges (door point -> its stop on the line)
    this.doorNodes = {};
    for (const id in this.doorSpur) {
      const s = this.doorSpur[id];
      const p = this.at(s.line, Math.round(s.t / EPS) * EPS);
      const on = nodeAt(p.i, p.j);
      const q = this.P(s.x, s.y);
      const dn = { id: 'd:' + id, i: q.i, j: q.j, x: Math.round(s.x), y: Math.round(s.y), kind: 'door' };
      this.nodes.push(dn);
      this.addEdge(dn, on, { id: 'door', xing: -1 });
      this.doorNodes[id] = dn.id;
    }
    for (const n of this.nodes) { const deg = this.edges.filter((e) => e.a === n || e.b === n).length; if (n.kind !== 'door') n.kind = deg >= 3 ? 'junction' : deg <= 1 ? 'end' : 'bend'; }
  }

  addEdge(a, b, line) {
    const lenM = Math.hypot(a.i - b.i, a.j - b.j) * Math.SQRT2;
    const region = Math.max(a.x, b.x) >= this.townX ? 'town' : 'rail';
    this.edges.push({ a, b, street: line.id, lenM, walk: true, region, xing: line.xing });
  }

  doorNode(id) { return this.doorNodes[id] || null; }

  /** the walk graph in the Roads format (merged into gs.roads) */
  walkGraph() {
    const nodes = {}, edges = [];
    for (const n of this.nodes) nodes[n.id] = [n.x, n.y];
    for (const e of this.edges) edges.push([e.a.id, e.b.id, { region: e.region, draw: false, xing: e.xing >= 0 ? e.xing : undefined, street: e.street }]);
    return { nodes, edges };
  }

  // ==================================================================== (v4-B) cells
  key(ci, cj) { return (ci + 512) * 1024 + (cj + 512); }
  cell(ci, cj) { return this.cells.get(this.key(ci, cj)) || null; }
  /** the class a street is at now (0 dirt, 1 cobble, 2 asphalt) */
  clsOf(id) { const s = (this.v4.streets || []).find((q) => q.id === id); const up = this.level[id]; return up !== undefined ? up : s && CLS[s.cls] !== undefined ? CLS[s.cls] : 0; }
  /** the street rectangle (lattice) that is paved now: { i: [a, b], j: [a, b] } or null */
  paved(s) {
    const E = (this.v4.eup || {})[s.id];
    const up = this.level[s.id] !== undefined && E && E.road;
    if (s.cls === 'dirt' && s.paint) {
      if (s.axis === 'x') return { i: s.i.slice(), j: up ? E.road.slice() : s.paint.slice() };
      return { i: up ? E.road.slice() : s.paint.slice(), j: (s.paintSpan || s.j).slice() };
    }
    return null;
  }

  /** every cell of the grid that is street / square / rail (cells whose centre lies in a street's rectangle) */
  buildCells() {
    const cells = this.cells = new Map();
    const townX = this.townX;
    const put = (ci, cj, t, street, cls) => {
      const k = this.key(ci, cj);
      const o = cells.get(k);
      // junction squares: a road cell of two streets keeps ROAD; a road beats a walk; the crossing beats the rail
      if (o && (o.t === CELL.ROAD || (o.t === CELL.XING && t === CELL.RAIL))) { if (o.t === CELL.ROAD && t === CELL.ROAD && o.street !== street) o.junction = true; return; }
      const x = this.L(ci + 0.5, cj + 0.5)[0];
      cells.set(k, { t, street, cls: cls || 0, region: x >= townX ? 'town' : 'rail', ci, cj });
    };
    const fill = (i0, i1, j0, j1, t, street, cls) => {
      for (let ci = Math.ceil(i0 - 0.5); ci + 0.5 <= i1 + 1e-6; ci++) for (let cj = Math.ceil(j0 - 0.5); cj + 0.5 <= j1 + 1e-6; cj++) put(ci, cj, t, street, cls);
    };
    const R = this.v4.rail;
    if (R) {
      for (const k of R.crossings || []) fill(k, k + 1, -1, 1, CELL.XING, 'xing', 0);
      for (let k = R.from; k <= R.to; k++) fill(k, k + 1, -1, 1, CELL.RAIL, 'rail', 0);
    }
    const E = this.v4.eup || {};
    const side = new Set(E.sidewalks || []);
    for (const s of this.v4.streets || []) {
      const cls = this.clsOf(s.id);
      const pv = this.paved(s);
      if (pv) {
        fill(pv.i[0], pv.i[1], pv.j[0], pv.j[1], CELL.ROAD, s.id, cls);
        const e = E[s.id];
        if (this.level[s.id] !== undefined && e && e.walk) for (const w of e.walk) { if (s.axis === 'x') fill(s.i[0], s.i[1], w[0], w[1], CELL.WALK, s.id, cls); else fill(w[0], w[1], (s.paintSpan || s.j)[0], (s.paintSpan || s.j)[1], CELL.WALK, s.id, cls); }
      } else if (s.cls === 'square') fill(s.i[0], s.i[1], s.j[0], s.j[1], CELL.SQUARE, s.id, 0);
      else if (s.cls === 'path' && side.has(s.id) && this.level[s.id] !== undefined) fill(s.i[0], s.i[1], s.j[0], s.j[1], CELL.WALK, s.id, 1);
    }
  }

  /** cells of type t (or any paved type when t is undefined) as a list */
  cellList(t) { const out = []; for (const c of this.cells.values()) if (t === undefined ? (c.t === CELL.ROAD || c.t === CELL.WALK || c.t === CELL.SQUARE) : c.t === t) out.push(c); return out; }

  /** (읍) a street changes class: 'cobble' / 'asphalt' (roads), 'sidewalk' (footpaths) */
  upgrade(id, cls) {
    const s = (this.v4.streets || []).find((q) => q.id === id);
    if (!s) return false;
    const c = cls === 'sidewalk' ? 1 : CLS[cls] !== undefined ? CLS[cls] : 1;
    if (this.level[id] === c) return false;
    this.level[id] = c;
    this.buildCells();
    this.buildLanes();
    this.version++;
    for (const fn of this.listeners) { try { fn(id, cls); } catch (e) { /* a painter */ } }
    return true;
  }
  onChange(fn) { this.listeners.push(fn); }

  // ==================================================================== (v4-B) drive lanes (v5 vehicles)
  /**
   * The road streets as a lane graph: nodes where centre lines meet (junctions) and street ends; an edge
   * between consecutive nodes carries one lane each way (right-hand: +i on j = J - off, -i on J + off; +j on
   * i = I + off, -j on I - off; off = 1 cell on a 2-lane carriageway, 0.5 on a 1-lane track). Each junction
   * has connectors for every in-lane -> out-lane (turn S / L / R / U) with a polyline and the connectors it
   * crosses (conflicts).
   */
  buildLanes() {
    const roads = [];
    for (const s of this.v4.streets || []) {
      const pv = this.paved(s);
      if (!pv) continue;
      const w = s.axis === 'x' ? pv.j[1] - pv.j[0] : pv.i[1] - pv.i[0];
      const fix = s.axis === 'x' ? (pv.j[0] + pv.j[1]) / 2 : (pv.i[0] + pv.i[1]) / 2;
      const span = s.axis === 'x' ? pv.i : pv.j;
      roads.push({ id: s.id, axis: s.axis, fix, a: Math.min(span[0], span[1]), b: Math.max(span[0], span[1]), off: w >= 3.5 ? 1 : 0.5, cls: this.clsOf(s.id), stops: [] });
    }
    for (const r of roads) r.stops = [r.a, r.b];
    for (const x of roads) for (const y of roads) {
      if (x.axis !== 'x' || y.axis !== 'y') continue;
      if (y.fix >= x.a && y.fix <= x.b && x.fix >= y.a - 0.01 && x.fix <= y.b + 0.01) { x.stops.push(y.fix); y.stops.push(x.fix); }
    }
    const nodes = [], byKey = new Map();
    const node = (i, j) => {
      const k = Math.round(i * 20) + ',' + Math.round(j * 20);
      let n = byKey.get(k);
      if (!n) { const [x, y] = this.L(i, j); n = { id: 'r' + nodes.length, i, j, x, y, kind: 'end', control: 'none', out: [], in: [] }; byKey.set(k, n); nodes.push(n); }
      return n;
    };
    const edges = [];
    for (const r of roads) {
      const ts = Array.from(new Set(r.stops.map((t) => Math.round(t * 20) / 20))).sort((p, q) => p - q);
      for (let k = 1; k < ts.length; k++) {
        const a = r.axis === 'x' ? node(ts[k - 1], r.fix) : node(r.fix, ts[k - 1]);
        const b = r.axis === 'x' ? node(ts[k], r.fix) : node(r.fix, ts[k]);
        const e = { id: edges.length, a, b, street: r.id, axis: r.axis, fix: r.fix, t0: ts[k - 1], t1: ts[k], off: r.off, cls: r.cls, lenM: (ts[k] - ts[k - 1]) * S2, lanesEach: 1, laneOff: [-r.off, r.off] };
        edges.push(e);
        a.out.push({ e, dir: 1 }); b.in.push({ e, dir: 1 });
        b.out.push({ e, dir: -1 }); a.in.push({ e, dir: -1 });
      }
    }
    for (const n of nodes) n.kind = n.out.length >= 3 ? 'junction' : n.out.length === 2 ? 'bend' : 'end';
    this.driveNodes = nodes;
    this.driveEdges = edges;
    this.conns = {};
    for (const n of nodes) this.conns[n.id] = this.makeConnectors(n);
  }

  /** lattice point of the lane of edge e, direction dir (+1 = from a to b), at parameter t (lattice units along the street) */
  laneLattice(e, dir, t) {
    const o = dir > 0 ? -e.off : e.off;      // right-hand: +i drives at lower j; +j drives at higher i
    return e.axis === 'x' ? { i: t, j: e.fix + o } : { i: e.fix - o, j: t };
  }
  /** world px of the lane centre of edge e (dir) at fraction t (0 = where the lane starts) */
  laneCentre(e, dir, f) {
    const t = dir > 0 ? e.t0 + (e.t1 - e.t0) * f : e.t1 - (e.t1 - e.t0) * f;
    const q = this.laneLattice(e, dir, t);
    const [x, y] = this.L(q.i, q.j);
    return { x, y, i: q.i, j: q.j };
  }
  /** where a vehicle on edge e (dir) stops before the node it drives into: 1 cell before (on the lane) */
  stopLine(e, dir) {
    const len = e.t1 - e.t0, back = Math.min(1, len * 0.4);
    return this.laneCentre(e, dir, (len - back) / len);
  }
  /** where the lane of edge e (dir) starts after the node it leaves: 1 cell after */
  startLine(e, dir) {
    const len = e.t1 - e.t0, fwd = Math.min(1, len * 0.4);
    return this.laneCentre(e, dir, fwd / len);
  }
  /** heading of a directed lane on screen (radians) */
  heading(e, dir) { const a = this.laneCentre(e, dir, 0), b = this.laneCentre(e, dir, 1); return Math.atan2(b.y - a.y, b.x - a.x); }

  makeConnectors(n) {
    const out = [];
    for (const inn of n.in) for (const o of n.out) {
      const uturn = inn.e === o.e;
      if (uturn && n.kind !== 'end') continue;          // U-turns only at dead ends
      const h1 = this.heading(inn.e, inn.dir), h2 = this.heading(o.e, o.dir);
      let d = h2 - h1;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      // screen y points down: a right turn is a positive angle
      const turn = uturn ? 'U' : Math.abs(d) < 0.35 ? 'S' : d > 0 ? 'R' : 'L';
      const p0 = this.stopLine(inn.e, inn.dir), p2 = this.startLine(o.e, o.dir);
      const c = { x: n.x, y: n.y };
      const poly = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8, u = 1 - t; poly.push({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p2.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p2.y }); }
      out.push({ node: n.id, inLane: { edge: inn.e.id, dir: inn.dir }, outLane: { edge: o.e.id, dir: o.dir }, turn, polyline: poly, conflicts: [] });
    }
    // two connectors conflict when their paths cross (or merge into the same out-lane from different in-lanes)
    const segX = (a, b, c, d) => { const den = (d.y - c.y) * (b.x - a.x) - (d.x - c.x) * (b.y - a.y); if (Math.abs(den) < 1e-9) return false; const ua = ((d.x - c.x) * (a.y - c.y) - (d.y - c.y) * (a.x - c.x)) / den, ub = ((b.x - a.x) * (a.y - c.y) - (b.y - a.y) * (a.x - c.x)) / den; return ua > 0.02 && ua < 0.98 && ub > 0.02 && ub < 0.98; };
    for (let a = 0; a < out.length; a++) for (let b = a + 1; b < out.length; b++) {
      const A = out[a], B = out[b];
      if (A.inLane.edge === B.inLane.edge && A.inLane.dir === B.inLane.dir) continue;      // same lane: they queue
      let hit = A.outLane.edge === B.outLane.edge && A.outLane.dir === B.outLane.dir;
      for (let i = 1; i < A.polyline.length && !hit; i++) for (let j = 1; j < B.polyline.length && !hit; j++) hit = segX(A.polyline[i - 1], A.polyline[i], B.polyline[j - 1], B.polyline[j]);
      if (hit) { A.conflicts.push(b); B.conflicts.push(a); }
    }
    return out;
  }
  connectors(nodeId) { return this.conns[nodeId] || []; }

  // ==================================================================== (v4-B) routes
  /** the walk graph as adjacency (built once per version) */
  walkAdj() {
    if (this._wadj && this._wadjV === this.version) return this._wadj;
    const adj = new Map();
    for (const n of this.nodes) adj.set(n.id, []);
    for (const e of this.edges) { adj.get(e.a.id).push({ to: e.b, e }); adj.get(e.b.id).push({ to: e.a, e }); }
    this._wadj = adj; this._wadjV = this.version;
    return adj;
  }
  nearestWalkNode(x, y) {
    let best = null, bd = Infinity;
    for (const n of this.nodes) { const d = Math.hypot(n.x - x, (n.y - y) * 2); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  nearestDriveNode(x, y) {
    let best = null, bd = Infinity;
    for (const n of this.driveNodes) { const d = Math.hypot(n.x - x, (n.y - y) * 2); if (d < bd) { bd = d; best = n; } }
    return best;
  }

  /**
   * route(from, to, { mode: 'walk' | 'drive', avoid: Set of street ids }) -> { pts: [{x, y}], cum: Float32Array
   * (m along), edges, xings (crossing indices passed), lenM } or null. from / to: {x, y} (nearest node) or a node id.
   */
  route(from, to, opts = {}) {
    const drive = opts.mode === 'drive';
    const nodes = drive ? this.driveNodes : this.nodes;
    const find = (p) => (typeof p === 'string' ? nodes.find((n) => n.id === p) : drive ? this.nearestDriveNode(p.x, p.y) : this.nearestWalkNode(p.x, p.y));
    const A = find(from), B = find(to);
    if (!A || !B) return null;
    const avoid = opts.avoid || null;
    // Dijkstra with a binary heap (small graphs)
    const dist = new Map(), prev = new Map();
    const heap = [];
    const push = (d, n) => { heap.push([d, n]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    dist.set(A.id, 0); push(0, A);
    const adj = drive ? null : this.walkAdj();
    while (heap.length) {
      const [d, n] = pop();
      if (d > (dist.get(n.id) ?? Infinity)) continue;
      if (n === B) break;
      const nbrs = drive ? n.out.map((o) => ({ to: o.dir > 0 ? o.e.b : o.e.a, e: o.e, dir: o.dir })) : adj.get(n.id);
      for (const q of nbrs) {
        if (avoid && avoid.has(q.e.street)) continue;
        const nd = d + q.e.lenM;
        if (nd < (dist.get(q.to.id) ?? Infinity)) { dist.set(q.to.id, nd); prev.set(q.to.id, { from: n, e: q.e, dir: q.dir }); push(nd, q.to); }
      }
    }
    if (!dist.has(B.id)) return null;
    const steps = [];
    for (let c = B; c !== A;) { const p = prev.get(c.id); if (!p) return null; steps.push(p); c = p.from; }
    steps.reverse();
    const pts = [], edges = [], xings = [];
    if (drive) {
      if (!steps.length) pts.push({ x: A.x, y: A.y });
      for (const st of steps) {
        const a = this.laneCentre(st.e, st.dir, 0), b = this.laneCentre(st.e, st.dir, 1);
        pts.push({ x: a.x, y: a.y }, { x: b.x, y: b.y });
        edges.push(st.e.id);
      }
    } else {
      pts.push({ x: A.x, y: A.y });
      for (const st of steps) { const n = st.e.a === st.from ? st.e.b : st.e.a; pts.push({ x: n.x, y: n.y }); edges.push(st.e); if (st.e.xing >= 0) xings.push(st.e.xing); }
    }
    const cum = new Float32Array(pts.length);
    for (let k = 1; k < pts.length; k++) cum[k] = cum[k - 1] + Math.hypot(pts[k].x - pts[k - 1].x, (pts[k].y - pts[k - 1].y) * 2) / 64;     // ground px -> m (64 px a metre)
    return { pts, cum, edges, xings, lenM: dist.get(B.id) };
  }
}
