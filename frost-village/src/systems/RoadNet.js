// RoadNet (v4, docs/v4_plan.md §10.1) — the v4 street grid as data: walk lines on the roads-kit lattice,
// junctions where they meet, door spurs, level crossings. Pure JS (no Phaser) so it can be tested in Node.
//
// (v4-A skeleton) BUILD-A needs the walk graph for the townsfolk, the train visitors and the crossings.
// BUILD-B extends this file (cells with class / lanes, drive mode, upgrade(), lane connectors for v5)
// without changing walkGraph() / route() for its callers.
//
//   const rn = new RoadNet(WORLD.v4, { doors });      doors: [{ id, x, y }]   (building door points, px)
//   rn.walkGraph()  -> { nodes: { id: [x, y] }, edges: [[a, b, { region, xing, draw: false }]] }  (Roads.addGraph format)
//   rn.doorNode(id) -> graph node id of a door spur

import { WORLD } from '../data/world.js';

const EPS = 0.06;          // cells: stops closer than this are one node
const DOOR_REACH = 3.2;    // cells: a door joins a walk line at most this far in front of it

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
}
