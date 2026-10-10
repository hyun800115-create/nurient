// LaneGraph (vehicles_runtime model/lanes.js, docs/v5_v8_plan.md §6.3): an adapter over the v4 RoadNet drive lanes
// (driveNodes / driveEdges / connectors / startLine / stopLine — right-hand, unit-tested in v4) plus the chief's
// sled tracks on the village snow paths. Pure JS: the RoadNet instance is handed in (ports.roads.net()), never
// imported here.
//
//   lane  = one direction of one road edge, from 1 cell after its start node to 1 cell before its end node
//           { id, kind: 'road' | 'track', street, axis, cls, from, to (node keys), pts, cum, len, dk, out[], inn[],
//             xings: [{ k, line, s0, s1 }], stub, gkey }
//   conn  = a junction connector (RoadNet's polyline) or a track join { id, node, from, to (lane ids), turn, pts, cum,
//           len, conflicts: [conn ids] }
//   pos   = { lane, s }  (s in metres along the lane)
//   path  = [{ t: 'L' | 'C', id, s0, s1 }]  (pieces; a vehicle's position is (piece index, s) on it)

import { metres, cumOf, pointAt, project, bezier, segX, dirKey } from './geom.js';

const nodeKeyIJ = (i, j) => 'n' + Math.round(i * 20) + ',' + Math.round(j * 20);
const U_PENALTY = 12;          // m: a U-turn costs this much extra (routes take one only when needed)
const STUB_PENALTY = 400;      // m: never drive into a 1–3 cell dead-end stub unless it is the goal

export class LaneGraph {
  /**
   * rn: a RoadNet (v4) or anything with driveNodes / driveEdges / connectors / startLine / stopLine / laneLattice / L
   * opts.tracks: [{ id, a, b, pts: [[x, y]...], road?: [i, j] }] (layout.sledTracks), opts.rails: [{ j, from, to, line }]
   */
  constructor(rn, opts = {}) {
    this.rn = rn;
    this.version = rn && rn.version !== undefined ? rn.version : 0;
    this.lanes = [];
    this.conns = [];
    this.nodes = new Map();         // node key -> { key, x, y, kind, inn: [lane ids], out: [lane ids], conns: [conn ids], lit? }
    this.byEdge = new Map();        // RoadNet edge id + ':' + dir -> lane id
    this.byG = new Map();           // geometry key -> lane id (stable across rebuilds)
    this.buildRoads(rn);
    this.buildTracks(opts.tracks || []);
    this.markRails(opts.rails || []);
    this.buildConflicts();
  }

  // ------------------------------------------------------------------------------------------ build
  node(key, x, y, kind) {
    let n = this.nodes.get(key);
    if (!n) { n = { key, x, y, kind: kind || 'bend', inn: [], out: [], conns: [] }; this.nodes.set(key, n); }
    return n;
  }

  addLane(o) {
    const lane = Object.assign({ id: this.lanes.length, out: [], inn: [], xings: [], stub: false }, o);
    lane.cum = cumOf(lane.pts);
    lane.len = lane.cum[lane.cum.length - 1];
    const a = lane.pts[0], b = lane.pts[lane.pts.length - 1];
    lane.dk = dirKey(b.x - a.x, b.y - a.y);
    this.lanes.push(lane);
    if (lane.gkey) this.byG.set(lane.gkey, lane.id);
    this.node(lane.from).out.push(lane.id);
    this.node(lane.to).inn.push(lane.id);
    return lane;
  }

  addConn(o) {
    const c = Object.assign({ id: this.conns.length, conflicts: [] }, o);
    c.cum = cumOf(c.pts);
    c.len = Math.max(0.05, c.cum[c.cum.length - 1]);
    this.conns.push(c);
    this.lanes[c.from].out.push(c.id);
    this.lanes[c.to].inn.push(c.id);
    this.node(c.node).conns.push(c.id);
    return c;
  }

  buildRoads(rn) {
    if (!rn || !rn.driveEdges) return;
    for (const n of rn.driveNodes) { const nd = this.node(nodeKeyIJ(n.i, n.j), n.x, n.y, n.kind); nd.rid = n.id; nd.i = n.i; nd.j = n.j; }
    for (const e of rn.driveEdges) {
      const span = e.t1 - e.t0;
      for (const dir of [1, -1]) {
        const p0 = rn.startLine(e, dir), p1 = rn.stopLine(e, dir);
        const from = dir > 0 ? e.a : e.b, to = dir > 0 ? e.b : e.a;
        const lane = this.addLane({
          kind: 'road', street: e.street, axis: e.axis, cls: e.cls, edge: e.id, dir,
          from: nodeKeyIJ(from.i, from.j), to: nodeKeyIJ(to.i, to.j),
          pts: [{ x: p0.x, y: p0.y }, { x: p1.x, y: p1.y }],
          lat: [rn.laneLattice(e, dir, dir > 0 ? e.t0 : e.t1), rn.laneLattice(e, dir, dir > 0 ? e.t1 : e.t0)],
          gkey: e.street + '|' + dir + '|' + e.t0.toFixed(2) + '|' + e.t1.toFixed(2),
        });
        // a 1–3 cell dead-end stub off a junction (the ends of the jog / 중앙로 beyond the crossing street)
        const ka = e.a.kind, kb = e.b.kind;
        lane.stub = span <= 3.01 && ((ka === 'end' && kb === 'junction') || (kb === 'end' && ka === 'junction'));
        this.byEdge.set(e.id + ':' + dir, lane.id);
      }
    }
    for (const n of rn.driveNodes) {
      for (const c of rn.connectors(n.id)) {
        const from = this.byEdge.get(c.inLane.edge + ':' + c.inLane.dir), to = this.byEdge.get(c.outLane.edge + ':' + c.outLane.dir);
        if (from === undefined || to === undefined) continue;
        this.addConn({ node: nodeKeyIJ(n.i, n.j), from, to, turn: c.turn, pts: c.polyline.map((p) => ({ x: p.x, y: p.y })) });
      }
    }
  }

  /** the chief's snow tracks (both directions on one centre line) and their joins to the road lanes */
  buildTracks(tracks) {
    if (!tracks.length) return;
    const tkey = (name) => 't:' + name;
    // degree of every track node
    const deg = new Map();
    for (const t of tracks) { for (const k of [t.a, t.b]) if (k !== '@road') deg.set(k, (deg.get(k) || 0) + 1); }
    const trimmed = (pts, fromEnd, m) => {
      // cut m metres off the start (fromEnd false) or the end (true) of a polyline
      const P = pts.map((p) => ({ x: p[0] !== undefined ? p[0] : p.x, y: p[1] !== undefined ? p[1] : p.y }));
      const L = P.slice();
      if (fromEnd) L.reverse();
      const c = cumOf(L), total = c[c.length - 1];
      const cut = Math.min(m, total * 0.3);
      const q = pointAt(L, c, cut, {});
      let k = 1; while (k < L.length - 1 && c[k] <= cut) k++;
      const out = [{ x: q.x, y: q.y }].concat(L.slice(k));
      if (fromEnd) out.reverse();
      return out;
    };
    for (const t of tracks) {
      const pa = t.pts[0], pb = t.pts[t.pts.length - 1];
      const ka = tkey(t.a);
      const kb = t.b === '@road' ? nodeKeyIJ(t.road[0], t.road[1]) : tkey(t.b);
      this.node(ka, pa[0], pa[1], (deg.get(t.a) || 0) <= 1 ? 'end' : 'junction');
      const nb = this.node(kb, pb[0], pb[1], t.b === '@road' ? 'end' : ((deg.get(t.b) || 0) <= 1 ? 'end' : 'junction'));
      if (t.b === '@road') nb.track = true;
      let pts = trimmed(t.pts, false, 1.2);
      pts = trimmed(pts, true, 1.2);
      this.addLane({ kind: 'track', street: 'track:' + t.id, axis: null, cls: 0, from: ka, to: kb, pts, gkey: 'track|' + t.id + '|1' });
      this.addLane({ kind: 'track', street: 'track:' + t.id, axis: null, cls: 0, from: kb, to: ka, pts: pts.slice().reverse(), gkey: 'track|' + t.id + '|-1' });
    }
    // joins at every node that has a track lane (track <-> track, track <-> road), U-turns at track dead ends
    for (const [key, n] of this.nodes) {
      const ins = n.inn.map((id) => this.lanes[id]), outs = n.out.map((id) => this.lanes[id]);
      if (!ins.some((l) => l.kind === 'track') && !outs.some((l) => l.kind === 'track')) continue;
      const dead = outs.length <= 1;
      for (const a of ins) for (const b of outs) {
        if (a.kind === 'road' && b.kind === 'road') continue;                // RoadNet made those
        const reverse = a.street === b.street;
        if (reverse && !dead) continue;
        const p0 = a.pts[a.pts.length - 1], p2 = b.pts[0];
        let pts;
        if (reverse) {
          // a little loop around the dead end
          const hx = p0.x - a.pts[a.pts.length - 2].x, hy = p0.y - a.pts[a.pts.length - 2].y, d = Math.hypot(hx, hy * 2) || 1;
          const fx = hx / d * 64, fy = hy / d * 64;          // ~1 m forward (ground)
          const rx = -fy * 2, ry = fx / 2;                    // right side on the ground
          pts = [{ x: p0.x, y: p0.y }, { x: n.x + rx * 1.2, y: n.y + ry * 1.2 }, { x: n.x + fx * 0.6, y: n.y + fy * 0.6 }, { x: n.x - rx * 1.2, y: n.y - ry * 1.2 }, { x: p2.x, y: p2.y }];
        } else pts = bezier(p0, { x: n.x, y: n.y }, p2, 8);
        const h1 = Math.atan2(p0.y - a.pts[a.pts.length - 2].y, p0.x - a.pts[a.pts.length - 2].x);
        const h2 = Math.atan2(b.pts[1].y - p2.y, b.pts[1].x - p2.x);
        let d = h2 - h1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
        this.addConn({ node: key, from: a.id, to: b.id, turn: reverse ? 'U' : Math.abs(d) < 0.35 ? 'S' : d > 0 ? 'R' : 'L', pts, track: true });
      }
    }
  }

  /** level crossings: a road lane along Y that crosses a rail line (j = rail.j, tiles from..to) */
  markRails(rails) {
    for (const r of rails) {
      for (const lane of this.lanes) {
        if (lane.kind !== 'road' || lane.axis !== 'y' || !lane.lat) continue;
        const i = lane.lat[0].i, j0 = lane.lat[0].j, j1 = lane.lat[1].j;
        if (i < r.from || i > r.to + 1) continue;
        const lo = Math.min(j0, j1), hi = Math.max(j0, j1);
        if (hi < r.j - 1 || lo > r.j + 1) continue;
        // s where |j - rail.j| <= 1 (the ballast cells)
        const sAt = (j) => Math.max(0, Math.min(lane.len, Math.abs(j - j0) / Math.max(1e-9, Math.abs(j1 - j0)) * lane.len));
        const a = sAt(Math.max(lo, r.j - 1)), b = sAt(Math.min(hi, r.j + 1));
        lane.xings.push({ k: Math.floor(i), line: r.line || 'main', s0: Math.min(a, b), s1: Math.max(a, b) });
      }
    }
  }

  buildConflicts() {
    for (const n of this.nodes.values()) {
      const C = n.conns.map((id) => this.conns[id]);
      for (let a = 0; a < C.length; a++) for (let b = a + 1; b < C.length; b++) {
        const A = C[a], B = C[b];
        if (A.from === B.from) continue;                                       // same in-lane: they queue
        let hit = A.to === B.to;                                               // merge into the same lane
        for (let i = 1; i < A.pts.length && !hit; i++) for (let j = 1; j < B.pts.length && !hit; j++) hit = segX(A.pts[i - 1], A.pts[i], B.pts[j - 1], B.pts[j]);
        if (hit) { A.conflicts.push(B.id); B.conflicts.push(A.id); }
      }
    }
  }

  // ------------------------------------------------------------------------------------------ queries
  piece(p) { return p.t === 'C' ? this.conns[p.id] : this.lanes[p.id]; }
  laneAt(gkey) { const id = this.byG.get(gkey); return id === undefined ? null : this.lanes[id]; }
  laneByStreet(street, dir) { return this.lanes.filter((l) => l.street === street && (dir === undefined || l.dir === dir)); }

  /** point + screen heading at s on a lane or connector */
  at(t, id, s, out) { const g = t === 'C' ? this.conns[id] : this.lanes[id]; return pointAt(g.pts, g.cum, s, out); }

  /**
   * nearest lane position to (x, y): { lane, s, d, lat } or null. allow(lane) filters (default: road lanes that are
   * not stubs).
   */
  snap(x, y, allow) {
    const ok = allow || ((l) => l.kind === 'road' && !l.stub);
    let best = null;
    for (const l of this.lanes) {
      if (!ok(l)) continue;
      const a = l.pts[0], b = l.pts[l.pts.length - 1];
      // quick reject: farther than 40 m from both ends and the segment box
      if (Math.min(Math.abs(x - a.x), Math.abs(x - b.x)) > 2600 && (x < Math.min(a.x, b.x) - 2600 || x > Math.max(a.x, b.x) + 2600)) continue;
      const p = project(l.pts, l.cum, x, y);
      if (!best || p.d < best.d) best = { lane: l.id, s: p.s, d: p.d, lat: p.lat };
    }
    return best;
  }

  /** the lane beside this one going the other way (same RoadNet edge / same track), or -1 */
  twin(laneId) {
    const l = this.lanes[laneId];
    if (!l) return -1;
    if (l.kind === 'road' && l.edge !== undefined) { const t = this.byEdge.get(l.edge + ':' + (-l.dir)); return t === undefined ? -1 : t; }
    if (l.gkey && l.kind === 'track') { const k = l.gkey.endsWith('|1') ? l.gkey.slice(0, -2) + '|-1' : l.gkey.slice(0, -3) + '|1'; const t = this.byG.get(k); return t === undefined ? -1 : t; }
    return -1;
  }

  /** s clamped so a vehicle of length len lies wholly on the lane (or centred when the lane is shorter) */
  fit(laneId, s, len) {
    const l = this.lanes[laneId];
    const lo = len / 2 + 0.3, hi = l.len - len / 2 - 0.3;
    if (hi < lo) return l.len / 2;
    return Math.max(lo, Math.min(hi, s));
  }

  /**
   * shortest path from pos `a` to pos `b` (Dijkstra over lanes; turns only through connectors, U-turns only at dead
   * ends): [{ t, id, s0, s1 }] or null. opts.allow(lane) limits the lanes (default: road lanes), opts.len the length.
   */
  route(a, b, opts = {}) {
    const allow = opts.allow || ((l) => l.kind === 'road');
    const LA = this.lanes[a.lane], LB = this.lanes[b.lane];
    if (!LA || !LB || !allow(LB)) return null;
    if (a.lane === b.lane && b.s >= a.s - 1e-6) return [{ t: 'L', id: a.lane, s0: a.s, s1: Math.max(a.s, b.s) }];
    const N = this.lanes.length;
    const dist = new Float64Array(N).fill(Infinity), via = new Int32Array(N).fill(-1);
    const heap = [];
    const push = (d, id) => { heap.push([d, id]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } } return top; };
    const relax = (fromLane, base) => {
      for (const cid of this.lanes[fromLane].out) {
        const c = this.conns[cid];
        const to = this.lanes[c.to];
        if (!allow(to)) continue;
        let cost = base + c.len + (c.turn === 'U' ? U_PENALTY : 0);
        if (to.stub && to.id !== b.lane) cost += STUB_PENALTY;
        if (cost < dist[to.id]) { dist[to.id] = cost; via[to.id] = cid; push(cost, to.id); }
      }
    };
    relax(a.lane, LA.len - a.s);
    let found = false;
    while (heap.length) {
      const [d, id] = pop();
      if (d > dist[id]) continue;
      if (id === b.lane) { found = true; break; }
      relax(id, d + this.lanes[id].len);
    }
    if (!found) return null;
    // walk back: lanes and connectors
    const rev = [{ t: 'L', id: b.lane, s0: 0, s1: b.s }];
    let cur = b.lane, guard = N + 5;
    while (guard-- > 0) {
      const cid = via[cur];
      if (cid < 0) return null;
      const c = this.conns[cid];
      rev.push({ t: 'C', id: cid, s0: 0, s1: c.len });
      // the departure: a.lane is never entered on a shortest path except as the goal, so this is where we left it
      if (c.from === a.lane) { rev.push({ t: 'L', id: a.lane, s0: a.s, s1: LA.len }); break; }
      cur = c.from;
      rev.push({ t: 'L', id: cur, s0: 0, s1: this.lanes[cur].len });
    }
    if (guard <= 0) return null;
    return rev.reverse();
  }

  /** metres of a path */
  pathLen(path) { let L = 0; for (const p of path) L += p.s1 - p.s0; return L; }
}

export { nodeKeyIJ };
