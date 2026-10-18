// AddressBook (plan §5.1, pure): every home 금방 can deliver to, with its curb, the courier's walk and its households.
//   book = new AddressBook(tuning, seed)
//   book.build({ entries, rn, lg, kit, village, stand })   (≤ once per 2 s: RoadNet.onChange, built, houseDone)
//   book.list() · book.get(aid) · book.households() · book.stops() (curb clusters) · book.matrix(a, b)
// entries: [{ aid, kind: apt|shop|house|hall|fire|village|station, name, door: {x, y}, doorNode?, households:
//            [{ hid, people: [{ pid, name, kind: adult|elder|child|keeper|miner|fisher, fav }] }] }]
// The curb is the drive-lane point with the SHORTEST WALK to the door over the v4 walk graph (around the buildings:
// the apartments and the H houses face their footpaths, away from the streets), clamped so the van fits the lane.
// Addresses whose curbs coincide (≤ 2.5 m on one lane) form one stop: the courier walks one round past their doors.
// zone 'van' when that walk ≤ van.walkMaxM and the curb is reachable from the spur and back; 'sled' for old-village
// houses with a village-road point ≤ sled.doorMaxM from the door; else 'none'. t_station is excluded (across the rail).

import { project, metres } from '../../vehicles/model/geom.js';
import { stream } from './rng.js';

const VAN_LEN = 4.4;

/** metres along a px polyline */
export function polyLen(pts) { let m = 0; for (let k = 1; k < pts.length; k++) m += metres(pts[k - 1].x, pts[k - 1].y, pts[k].x, pts[k].y); return m; }

/** a small binary min-heap of [key, value] */
export class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; const t = a[p]; a[p] = a[i]; a[i] = t; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; const t = a[m]; a[m] = a[i]; a[i] = t; i = m; } } return top; }
}
const TASTES = ['grandma', 'kids', 'newlywed', 'miner', 'shop', 'fisher'];

export class AddressBook {
  constructor(tune, seed = 1) {
    this.tune = tune; this.seed = seed >>> 0;
    this.byId = new Map();
    this.all = [];
    this.hh = [];                  // every household (flat), with .aid
    this.clusters = new Map();     // key -> { key, curb, aids: [] }
    this.version = 0;
  }

  list() { return this.all; }
  get(aid) { return this.byId.get(aid) || null; }
  households() { return this.hh; }
  stop(key) { return this.clusters.get(key) || null; }

  /** (re)build from the world. Returns the number of addresses in a delivery zone. */
  build(w) {
    const { entries = [], rn = null, lg = null, kit = null, village = null } = w || {};
    const T = this.tune;
    this.avoid = w && Array.isArray(w.avoid) && w.avoid.length > 1 ? w.avoid : null;
    const prev = this.byId;
    this.byId = new Map(); this.all = []; this.hh = []; this.clusters = new Map();
    const lanes = lg ? lg.lanes.filter((l) => l.kind === 'road' && !l.stub) : [];
    const adj = rn && rn.walkAdj ? rn.walkAdj() : null;
    const nodeById = new Map();
    if (rn && rn.nodes) for (const n of rn.nodes) nodeById.set(n.id, n);
    // the village sled graph
    const V = village && village.nodes ? village : null;
    for (const e of entries) {
      if (!e || typeof e.aid !== 'string' || !e.door || !Number.isFinite(e.door.x) || !Number.isFinite(e.door.y)) continue;
      const a = {
        aid: e.aid, kind: e.kind || 'house', name: e.name || e.aid, door: { x: e.door.x, y: e.door.y }, zone: 'none',
        curb: null, walk: null, cluster: null, vnode: null, vwalk: null, hh: [], orders: 0, open: 0,
      };
      if (a.kind === 'station') continue;
      // households (taste seeded per household id; the same id keeps its taste across rebuilds)
      for (const h of e.households || []) {
        if (!h || !h.hid || !Array.isArray(h.people) || !h.people.length) continue;
        const old = prev.get(a.aid) && prev.get(a.aid).hh.find((q) => q.hid === h.hid);
        const taste = old ? old.taste : this.tasteOf(h, a.kind);
        const hh = { hid: h.hid, aid: a.aid, people: h.people.slice(), taste, name: h.name || (h.people[0] && h.people[0].name) || '', elder: h.people.some((p) => p.kind === 'elder'), kid: h.people.some((p) => p.kind === 'child'), first: !!h.first, w: 1, open: 0, lastT: -1e9 };
        a.hh.push(hh);
      }
      if (a.kind === 'village') {
        // the nearest village-road point within doorMaxM
        if (V) {
          let best = null;
          for (const id in V.nodes) { const p = V.nodes[id]; const d = metres(p[0], p[1], a.door.x, a.door.y); if (!best || d < best.d) best = { id, d }; }
          if (best && best.d <= T.sled.doorMaxM) { a.vnode = best.id; a.vwalk = { pts: [{ x: V.nodes[best.id][0], y: V.nodes[best.id][1] }, { x: a.door.x, y: a.door.y }], len: best.d }; a.zone = 'sled'; }
        }
      } else if (lanes.length && kit && kit.ok) {
        this.curbFor(a, e, lanes, rn, adj, nodeById, lg, kit);
      }
      this.byId.set(a.aid, a);
      this.all.push(a);
      for (const hh of a.hh) this.hh.push(hh);
    }
    // the stand (where the vans hand village parcels to the sled)
    if (w && w.stand && lanes.length && kit && kit.ok) {
      const s = { aid: 'stand', kind: 'stand', name: 'gb_stand', door: { x: w.stand.x, y: w.stand.y }, zone: 'none', curb: null, walk: null, cluster: null, hh: [], orders: 0, open: 0 };
      this.curbFor(s, { door: s.door }, lanes, rn, adj, nodeById, lg, kit, w.standCurb);
      if (s.zone === 'van') { this.byId.set('stand', s); this.all.push(s); }
    }
    this.cluster(lg);
    this.version++;
    return this.all.filter((a) => a.zone !== 'none').length;
  }

  tasteOf(h, kind) {
    const T = this.tune;
    const kinds = h.people.map((p) => p.kind);
    if (kinds.includes('elder')) return 'grandma';
    if (kinds.includes('child')) return 'kids';
    if (kinds.includes('keeper') || kind === 'shop') return 'shop';
    if (kinds.includes('miner')) return 'miner';
    if (kinds.includes('fisher')) return 'fisher';
    const r = stream(this.seed, 'taste:' + h.hid);
    const ws = TASTES.map((k) => (T.tasteMix && T.tasteMix[k]) || 1);
    return TASTES[Math.max(0, r.weighted(ws))];
  }

  /** the curb with the shortest walk (one Dijkstra from the door over the walk graph) */
  curbFor(a, e, lanes, rn, adj, nodeById, lg, kit, prefer) {
    const T = this.tune;
    // walk distances from the door's spur node (or the nearest walk node) to every walk node
    let start = null, startOff = 0;
    if (rn) {
      const dn = e.doorNode || (rn.doorNode ? rn.doorNode(a.aid) : null);
      start = dn ? nodeById.get(dn) : null;
      if (!start && rn.nearestWalkNode) { start = rn.nearestWalkNode(a.door.x, a.door.y); if (start) startOff = metres(start.x, start.y, a.door.x, a.door.y); }
    }
    const dist = new Map(), prev = new Map();
    if (start && adj) {
      dist.set(start.id, 0);
      const heap = new Heap();
      heap.push(0, start);
      while (heap.size) {
        const [d, n] = heap.pop();
        if (d > (dist.get(n.id) ?? Infinity)) continue;
        for (const q of adj.get(n.id) || []) {
          const nd = d + q.e.lenM;
          if (nd < (dist.get(q.to.id) ?? Infinity)) { dist.set(q.to.id, nd); prev.set(q.to.id, n); heap.push(nd, q.to); }
        }
      }
    }
    let best = null;
    for (const l of lanes) {
      if (prefer && (l.street !== prefer.street || l.dir !== prefer.dir)) continue;
      const p = project(l.pts, l.cum, a.door.x, a.door.y);
      if (p.d > 26) continue;
      const s = lg.fit(l.id, p.s, VAN_LEN);
      const pt = lg.at('L', l.id, s, {});
      let walk = p.d, near = null;
      if (start && adj) {
        near = rn.nearestWalkNode(pt.x, pt.y);
        const dn = near ? dist.get(near.id) : undefined;
        walk = dn === undefined ? Infinity : dn + metres(near.x, near.y, pt.x, pt.y) + startOff;
        // a curb right at the door (no detour) walks straight
        if (p.d < 2.2 && walk > p.d + 3) walk = Math.min(walk, p.d + 0.5);
      }
      // (critique M4) a curb on the cargo sleigh's lane costs van.avoidWalkM more walk: a parked van there is in the
      // sleigh's way (a curb a few metres further is taken instead; one much further is not worth it)
      if (this.avoid && this.nearAvoid(pt.x, pt.y) < 1.0) walk += Number.isFinite(this.tune.van.avoidWalkM) ? this.tune.van.avoidWalkM : 8;
      if (!best || walk < best.walk - 1e-6) best = { lane: l.id, s, x: pt.x, y: pt.y, walk, near, d: p.d, street: l.street, dir: l.dir };
    }
    a.cands = null;
    if (!best || !Number.isFinite(best.walk) || best.walk > T.van.walkMaxM) return;
    // the walk polyline: curb -> (walk nodes back along prev) -> door
    const pts = [{ x: best.x, y: best.y }];
    if (best.near && start && adj && best.walk > best.d + 0.6) {
      for (let n = best.near; n; n = prev.get(n.id)) { pts.push({ x: n.x, y: n.y }); if (n === start) break; }
    }
    pts.push({ x: a.door.x, y: a.door.y });
    const clean = [pts[0]];
    for (let k = 1; k < pts.length; k++) { const q = clean[clean.length - 1]; if (metres(q.x, q.y, pts[k].x, pts[k].y) > 0.25) clean.push(pts[k]); }
    const len = polyLen(clean);
    // reachable from the spur and back
    const there = kit.cost(kit.joinPos(), { lane: best.lane, s: best.s }), back = kit.cost({ lane: best.lane, s: best.s }, kit.backPos());
    if (!Number.isFinite(there) || !Number.isFinite(back)) return;
    a.curb = { lane: best.lane, s: best.s, x: best.x, y: best.y, street: best.street, dir: best.dir, d: best.d };
    a.walk = { pts: clean, len };
    a.zone = 'van';
  }

  /** metres from (x, y) to the avoid polyline (the cargo sleigh's route) */
  nearAvoid(x, y) {
    const A = this.avoid;
    let best = Infinity;
    for (let k = 1; k < A.length; k++) {
      const a = A[k - 1], b = A[k];
      const ax = a.x, ay = a.y * 2, bx = b.x, by = b.y * 2, px = x, py = y * 2;
      const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2));
      const d = Math.hypot(px - (ax + vx * t), py - (ay + vy * t)) / 64;
      if (d < best) best = d;
    }
    return best;
  }

  /** stops: addresses whose curbs share a lane within 2.5 m (one round of the courier) */
  cluster(lg) {
    const van = this.all.filter((a) => a.zone === 'van').sort((a, b) => (a.curb.lane - b.curb.lane) || (a.curb.s - b.curb.s) || (a.aid < b.aid ? -1 : 1));
    for (const a of van) {
      let c = null;
      for (const q of this.clusters.values()) if (q.curb.lane === a.curb.lane && Math.abs(q.curb.s - a.curb.s) <= 2.5) { c = q; break; }
      if (!c) {
        c = { key: 'c' + a.curb.lane + '_' + Math.round(a.curb.s * 10), curb: { lane: a.curb.lane, s: a.curb.s, x: a.curb.x, y: a.curb.y, street: a.curb.street, dir: a.curb.dir }, aids: [] };
        this.clusters.set(c.key, c);
      }
      c.aids.push(a.aid);
      a.cluster = c.key;
    }
    // one curb per cluster: its first address's (re-snap the others' walks to start there)
    for (const c of this.clusters.values()) {
      for (const aid of c.aids) {
        const a = this.byId.get(aid);
        if (!a.walk) continue;
        if (Math.abs(a.curb.s - c.curb.s) > 0.01) {
          a.walk.pts[0] = { x: c.curb.x, y: c.curb.y };
          a.walk.len = polyLen(a.walk.pts);
          a.curb = Object.assign({}, c.curb, { d: a.curb.d });
        }
      }
    }
    void lg;
  }

  stops() { return Array.from(this.clusters.values()); }
}
