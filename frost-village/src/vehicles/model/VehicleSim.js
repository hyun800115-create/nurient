// VehicleSim (vehicles_runtime model, docs/v5_v8_plan.md §6.3): vehicles on the lane graph. Pure, deterministic
// (vehicles step in id order; no Math.random, no clock).
//
//  - car following: the front keeps gap ≥ 1.2 m + 0.9 s·v behind the leader's rear (hard floor 0.5 m, never overlaps)
//  - junctions: a connector is entered only with a reservation; no two conflicting connectors are held at once; a
//    vehicle reserves the run of connectors + short lanes it needs to clear the box, and only when its out-lane has
//    room (nobody blocks the box); traffic lights (green / yellow / red per approach axis) gate the first connector
//  - level crossings: a lane crossing a rail stops 1 m before it while env.xingBlocked(k, line)
//  - people: a live vehicle stops `blockAhead` (1.5 m) before any walker on its path (nobody is ever hit)
//  - goals: stops along the path where the centre halts for a dwell (bus stops, loading, delivery, parking)
//  - driveways ('D' pieces, private to one vehicle) lead into bays / depots; merging back waits for a gap
//
//  vehicle = { id, key, kind, len, width, vmax, accel, path, cum, total, ps (centre, path metres), v, state, goals,
//              held (conn ids), x, y, hx, hy, dk, ... } — see add()

import { pointAt, dirKey, project } from './geom.js';

const EPS = 1e-6;
const MIN_GAP = 0.5;          // m: hard floor between two bodies on one lane
const LOOK = 10;              // m: extra look-ahead beyond the braking distance
const OPP = { SE: 'NW', NW: 'SE', NE: 'SW', SW: 'NE' };

export class VehicleSim {
  /**
   * graph: LaneGraph · cfg: { traffic, brake, turnSpeed, speedByClass } · env (all optional):
   *   live(x, y) -> bool (near the view: walkers matter), walkers() -> [{ id, x, y }], xingBlocked(k, line) -> bool
   */
  constructor(graph, cfg, env = {}) {
    this.g = graph;
    this.cfg = cfg;
    this.env = env;
    this.list = [];             // vehicles in id order
    this.byId = new Map();
    this.nextId = 1;
    this.T = 0;
    this.holders = new Map();   // conn id -> Set(vehicle ids) holding it
    this.commit = new Map();    // lane id -> metres promised to vehicles still in a junction run
    this.occ = new Map();       // piece key -> [{ v, a, b }] (rebuilt every step)
    this.lit = new Map();       // node key -> { offset } (traffic lights)
    this.events = [];
    this._pt = {};
  }

  // ------------------------------------------------------------------------------------------ vehicles
  /**
   * add a vehicle: spec { key, kind, len, width, vmax, accel, path?, ps?, state?, tags... }. A vehicle without a path
   * is 'hidden' (in a depot) until setPath().
   */
  add(spec) {
    const v = Object.assign({
      id: this.nextId++, key: spec.key, kind: spec.kind || 'car', len: 4, width: 1.9, vmax: 5, accel: 1.2, cap: 1,
      path: null, cum: null, total: 0, ps: 0, v: 0, state: 'hidden', goals: [], held: [], commits: [], dwell: 0,
      x: 0, y: 0, hx: 1, hy: 0, dk: 'SE', waitT: 0, live: true, ghost: 0, blockedBy: null, alpha: 1, tracks: false,
    }, spec);
    this.list.push(v);
    this.list.sort((a, b) => a.id - b.id);
    this.byId.set(v.id, v);
    if (spec.path) this.setPath(v, spec.path, spec.goals || []);
    return v;
  }

  remove(id) {
    const v = this.byId.get(id);
    if (!v) return;
    this.releaseAll(v);
    this.byId.delete(id);
    const i = this.list.indexOf(v);
    if (i >= 0) this.list.splice(i, 1);
  }

  get(id) { return this.byId.get(id) || null; }

  /** give a vehicle a new path (its centre at path coordinate `ps`, default 0) and goals [{ at (path m), dwell, tag }] */
  setPath(v, path, goals = [], ps = 0) {
    this.releaseAll(v);
    v.path = path;
    const cum = new Float64Array(path.length + 1);
    for (let k = 0; k < path.length; k++) cum[k + 1] = cum[k] + (path[k].s1 - path[k].s0);
    v.cum = cum;
    v.total = cum[path.length];
    v.ps = Math.max(0, Math.min(v.total, ps));
    v.goals = goals.slice().sort((a, b) => a.at - b.at);
    v.state = 'drive';
    v.waitT = 0;
    this.place(v);
  }

  /** park a vehicle where it is (off the lanes: a bay, a depot) */
  hide(v) { this.releaseAll(v); v.path = null; v.state = 'hidden'; v.v = 0; }

  releaseAll(v) {
    for (const c of v.held) { const s = this.holders.get(c); if (s) { s.delete(v.id); if (!s.size) this.holders.delete(c); } }
    v.held = [];
    for (const m of v.commits) this.commit.set(m.lane, Math.max(0, (this.commit.get(m.lane) || 0) - m.amount));
    v.commits = [];
  }

  // ------------------------------------------------------------------------------------------ geometry
  pieceGeom(p) { return p.t === 'D' ? p : p.t === 'C' ? this.g.conns[p.id] : this.g.lanes[p.id]; }
  /** index of the piece holding path coordinate c */
  pieceIndex(v, c) {
    const cum = v.cum, n = v.path.length;
    if (c <= 0) return 0;
    if (c >= v.total) return n - 1;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (cum[m] <= c) lo = m; else hi = m - 1; }
    return lo;
  }
  /** world point at path coordinate c (beyond the ends: extended along the end lanes) */
  pathPoint(v, c, out) {
    const k = this.pieceIndex(v, c), p = v.path[k], g = this.pieceGeom(p);
    return pointAt(g.pts, g.cum, p.s0 + (c - v.cum[k]), out || this._pt);
  }
  place(v) {
    if (!v.path) return;
    const q = this.pathPoint(v, v.ps);
    v.x = q.x; v.y = q.y;
    // the art heading follows the body axis (front to rear) so long vehicles turn halfway through a corner
    const f = this.pathPoint(v, v.ps + v.len * 0.35, {}), r = this.pathPoint(v, v.ps - v.len * 0.35, {});
    const dx = f.x - r.x, dy = f.y - r.y;
    if (Math.abs(dx) + Math.abs(dy) > 0.5) { v.hx = dx; v.hy = dy; v.dk = dirKey(dx, dy); }
    // backing out of a stall: the body faces the other way
    const p = v.path[this.pieceIndex(v, v.ps)];
    if (p && p.rev) { v.dk = OPP[v.dk]; v.hx = -v.hx; v.hy = -v.hy; v.reversing = true; } else v.reversing = false;
  }

  // ------------------------------------------------------------------------------------------ occupancy
  /** register every vehicle's body on the pieces it covers (lane / connector local metres) */
  occupy() {
    const occ = this.occ;
    for (const a of occ.values()) a.length = 0;
    for (const v of this.list) {
      if (!v.path || v.state === 'hidden' || v.ghost > 0) continue;
      const rear = v.ps - v.len / 2, front = v.ps + v.len / 2;
      const n = v.path.length;
      for (let k = 0; k < n; k++) {
        const p = v.path[k];
        if (p.t === 'D') continue;
        const c0 = k === 0 ? -1e9 : v.cum[k], c1 = k === n - 1 ? 1e9 : v.cum[k + 1];
        if (c1 <= rear || c0 >= front) continue;
        const g = this.pieceGeom(p);
        const a = Math.max(0, p.s0 + (Math.max(rear, c0) - v.cum[k])), b = Math.min(g.len, p.s0 + (Math.min(front, c1) - v.cum[k]));
        if (b <= a) continue;
        const key = (p.t === 'C' ? 'C' : 'L') + p.id;
        let arr = occ.get(key);
        if (!arr) { arr = []; occ.set(key, arr); }
        arr.push({ v, a, b });
      }
    }
  }

  /** free metres at the start of a lane (before its first body), minus what junction runs promised */
  laneFree(laneId, me) {
    const L = this.g.lanes[laneId];
    let m = L.len;
    const arr = this.occ.get('L' + laneId);
    if (arr) for (const o of arr) if (o.v !== me && o.a < m) m = o.a;
    let promised = this.commit.get(laneId) || 0;
    if (me) for (const c of me.commits) if (c.lane === laneId) promised -= c.amount;
    return m - Math.max(0, promised);
  }

  // ------------------------------------------------------------------------------------------ lights
  addLight(nodeKey, offset = 0) { this.lit.set(nodeKey, { offset }); }
  removeLight(nodeKey) { this.lit.delete(nodeKey); }
  /** 'g' | 'y' | 'r' for an approach along `axis` ('x' | 'y') at time T */
  lightState(nodeKey, axis, T = this.T) {
    const L = this.lit.get(nodeKey);
    if (!L) return 'g';
    const tr = this.cfg.traffic, G = tr.green, Y = tr.yellow, C = 2 * (G + Y);
    let t = ((T + L.offset) % C + C) % C;
    if (axis === 'y') t = (t + G + Y) % C;
    return t < G ? 'g' : t < G + Y ? 'y' : 'r';
  }

  // ------------------------------------------------------------------------------------------ reservations
  holdersOf(cid) { return this.holders.get(cid); }
  heldByOther(cid, me) { const s = this.holders.get(cid); if (!s) return false; for (const id of s) if (id !== me.id) return true; return false; }

  /**
   * reserve the junction run that starts with connector piece k of v's path: the connectors (and any lanes too short
   * for v) up to a lane with room. true when v now holds them all.
   */
  tryReserve(v, k) {
    const path = v.path, run = [];
    const tr = this.cfg.traffic;
    const need = v.len + tr.gap;
    let j = k, commitLane = -1, amount = 0, first = true;
    while (j < path.length) {
      const p = path[j];
      if (p.t !== 'C') break;
      const c = this.g.conns[p.id];
      if (v.held.indexOf(c.id) < 0) {
        for (const x of c.conflicts) if (this.heldByOther(x, v)) { v.waitOn = Array.from(this.holders.get(x)).filter((id) => id !== v.id); return false; }
        // traffic lights gate the approach (the in-lane's axis)
        const node = this.g.nodes.get(c.node);
        if (this.lit.has(c.node)) {
          const inLane = this.g.lanes[c.from];
          const st = this.lightState(c.node, inLane.axis || 'x');
          if (st === 'r') { v.waitOn = null; v.redLight = true; return false; }
          if (st === 'y' && first) {
            const d = v.cum[j] - (v.ps + v.len / 2);
            if (d > (v.v * v.v) / (2 * this.cfg.brake.comfort) + 0.5) { v.waitOn = null; v.redLight = true; return false; }   // can stop: stop
          }
        }
        void node;
        run.push(c.id);
      }
      first = false;
      // the lane after the connector
      const q = path[j + 1];
      if (!q) break;
      if (q.t === 'D') break;                        // into a bay: private
      const lane = this.g.lanes[q.id];
      const isLast = j + 1 === path.length - 1;
      const want = isLast ? Math.min(need, (q.s1 - q.s0) + v.len / 2 + 0.5) : need;
      const free = this.laneFree(q.id, v);
      if (lane.len >= want - EPS) {
        if (free < want - EPS) { v.waitOn = this.laneUsers(q.id, v); return false; }
        commitLane = q.id; amount = want;
        break;
      }
      // a lane shorter than the vehicle: it must be empty, and the run goes on through the next connector
      if (free < lane.len - 0.05) { v.waitOn = this.laneUsers(q.id, v); return false; }
      if (isLast) { commitLane = q.id; amount = lane.len; break; }
      j += 2;
    }
    for (const id of run) {
      let s = this.holders.get(id);
      if (!s) { s = new Set(); this.holders.set(id, s); }
      s.add(v.id);
      v.held.push(id);
    }
    if (commitLane >= 0 && amount > 0) {
      this.commit.set(commitLane, (this.commit.get(commitLane) || 0) + amount);
      v.commits.push({ lane: commitLane, amount, k: j + 1 });
    }
    return true;
  }

  /** who keeps a lane full: its bodies and the vehicles that promised themselves space on it */
  laneUsers(laneId, me) {
    const out = [];
    const arr = this.occ.get('L' + laneId);
    if (arr) for (const o of arr) if (o.v !== me && out.indexOf(o.v.id) < 0) out.push(o.v.id);
    for (const w of this.list) if (w !== me && w.commits.some((c) => c.lane === laneId) && out.indexOf(w.id) < 0) out.push(w.id);
    return out;
  }

  /**
   * gridlock: vehicles waiting on each other in a ring (a leader, the bodies on a full out-lane, a conflicting
   * reservation). One of the ring — off screen if any is — slips through as a ghost until it is clear.
   */
  unjam() {
    const waiting = this.list.filter((v) => v.state === 'drive' && v.waitT > 6 && v.waitOn && v.waitOn.length);
    if (!waiting.length) return;
    const byId = this.byId;
    for (const start of waiting) {
      // depth-first along waitOn looking for a way back to `start`
      const stack = [[start.id, [start.id]]], seen = new Set();
      let ring = null;
      while (stack.length && !ring) {
        const [id, trail] = stack.pop();
        const v = byId.get(id);
        if (!v || !v.waitOn || v.state !== 'drive' || v.v > 0.05) continue;
        for (const w of v.waitOn) {
          if (w === start.id) { ring = trail; break; }
          if (seen.has(w) || trail.length > 30) continue;
          seen.add(w);
          stack.push([w, trail.concat([w])]);
        }
      }
      if (!ring) continue;
      const members = ring.map((id) => byId.get(id)).filter(Boolean);
      const off = members.filter((m) => !m.live && !m.chief);
      const pick = (off.length ? off : members.filter((m) => !m.chief).length ? members.filter((m) => !m.chief) : members).sort((a, b) => a.id - b.id)[0];
      if (!pick) continue;
      this.releaseAll(pick);
      pick.ghost = 3; pick.waitT = 0; pick.waitOn = null;
      this.events.push({ t: 'ghost', id: pick.id, ring: ring.slice(), live: pick.live });
      return;
    }
  }

  /** a ghost stays a ghost while its body still overlaps another one */
  overlapsAny(v) {
    const rear = v.ps - v.len / 2, front = v.ps + v.len / 2;
    for (let k = this.pieceIndex(v, rear); k < v.path.length && v.cum[k] < front; k++) {
      const p = v.path[k];
      if (p.t === 'D') continue;
      const arr = this.occ.get((p.t === 'C' ? 'C' : 'L') + p.id);
      if (!arr) continue;
      const a = p.s0 + Math.max(rear, v.cum[k]) - v.cum[k], b = p.s0 + Math.min(front, v.cum[k + 1]) - v.cum[k];
      for (const o of arr) if (o.v !== v && o.b > a - 0.3 && o.a < b + 0.3) return true;
      if (p.t === 'C') { const c = this.g.conns[p.id]; for (const x of c.conflicts) if (this.heldByOther(x, v)) return true; }
    }
    return false;
  }

  /** drop reservations / promises the body has passed */
  releasePassed(v) {
    const rear = v.ps - v.len / 2;
    if (v.held.length) {
      for (let i = v.held.length - 1; i >= 0; i--) {
        const cid = v.held[i];
        let k = -1;
        for (let j = 0; j < v.path.length; j++) if (v.path[j].t === 'C' && v.path[j].id === cid) { k = j; break; }
        if (k < 0 || rear > v.cum[k + 1] + 0.05) {
          const s = this.holders.get(cid);
          if (s) { s.delete(v.id); if (!s.size) this.holders.delete(cid); }
          v.held.splice(i, 1);
        }
      }
    }
    if (v.commits.length) {
      for (let i = v.commits.length - 1; i >= 0; i--) {
        const m = v.commits[i];
        if (m.k >= v.path.length || rear >= v.cum[m.k] - EPS) {
          this.commit.set(m.lane, Math.max(0, (this.commit.get(m.lane) || 0) - m.amount));
          v.commits.splice(i, 1);
        }
      }
    }
  }

  /** can a vehicle of length len join lane `laneId` with its centre at s (nobody there, nobody close behind)? */
  canMerge(laneId, s, len, me) {
    const arr = this.occ.get('L' + laneId);
    const lo = s - len / 2 - 6, hi = s + len / 2 + 1.5;
    if (arr) for (const o of arr) if (o.v !== me && o.b > lo && o.a < hi) return false;
    // a vehicle about to come off a connector into this lane
    const L = this.g.lanes[laneId];
    if (s - len / 2 < 8) for (const cid of L.inn) if (this.holders.has(cid)) return false;
    return true;
  }

  // ------------------------------------------------------------------------------------------ step
  update(dt, T) {
    if (T !== undefined) this.T = T; else this.T += dt;
    let left = Math.min(0.25, Math.max(0, dt));
    while (left > EPS) {
      const h = Math.min(left, 1 / 30);
      this.step(h);
      left -= h;
    }
  }

  step(dt) {
    this.occupy();
    const walkers = this.env.walkers ? this.env.walkers() : null;
    this.jamT = (this.jamT || 0) + dt;
    if (this.jamT >= 1) { this.jamT = 0; this.unjam(); }
    for (const v of this.list) {
      if (v.state === 'hidden' || !v.path) continue;
      if (v.ghost > 0) { v.ghost -= dt; if (v.ghost <= 0) v.ghost = this.overlapsAny(v) ? 0.25 : 0; }
      if (v.state === 'dwell') {
        v.dwell -= dt;
        v.v = 0;
        if (v.dwell <= 0 && !v.holdOn) { v.state = 'drive'; this.events.push({ t: 'depart', id: v.id, tag: v.lastGoal ? v.lastGoal.tag : null }); }
        continue;
      }
      if (v.state !== 'drive') continue;
      this.drive(v, dt, walkers);
    }
  }

  /** one vehicle, one step */
  drive(v, dt, walkers) {
    const cfg = this.cfg, tr = cfg.traffic, bC = cfg.brake.comfort, bH = cfg.brake.hard;
    const front = v.ps + v.len / 2;
    const look = (v.v * v.v) / (2 * bC) + v.len + LOOK;
    let vt = this.speedHere(v);
    let hard = Infinity;           // the front may not pass this path coordinate
    let blocker = null;
    const ghost = v.ghost > 0;
    v.live = this.env.live ? !!this.env.live(v.x, v.y) : true;
    const n = v.path.length;
    const k0 = this.pieceIndex(v, Math.min(front, v.total));
    // ---- pieces ahead: leaders, junction runs, crossings, speed limits
    for (let k = this.pieceIndex(v, v.ps - v.len / 2); k < n; k++) {
      const p = v.path[k];
      const c0 = v.cum[k];
      if (c0 - front > look) break;
      const g = this.pieceGeom(p);
      // speed limit of an upcoming piece
      if (k > k0) {
        const lim = this.limitOf(v, p, g);
        const d = Math.max(0, c0 - front);
        vt = Math.min(vt, Math.sqrt(lim * lim + 2 * bC * d));
      }
      if (p.t === 'D') continue;
      // leaders on this piece
      if (!ghost) {
        const arr = this.occ.get((p.t === 'C' ? 'C' : 'L') + p.id);
        if (arr) for (const o of arr) {
          if (o.v === v || o.v.ghost > 0) continue;
          const oa = c0 + (o.a - p.s0), ob = c0 + (o.b - p.s0);
          if (ob <= v.ps - v.len / 2 + EPS) continue;           // behind me
          if (k === n - 1 && o.a > p.s1 + v.len / 2 + tr.gap + 2) continue;   // past my goal
          if (oa < front - EPS) {
            // overlapping my body: only what is ahead of my centre counts (it should never happen)
            const ocen = c0 + (((o.a + o.b) / 2) - p.s0);
            if (ocen <= v.ps) continue;
          }
          const gap = oa - front;
          const want = tr.gap + tr.headwayS * v.v;
          const vl = o.v.v;
          vt = Math.min(vt, Math.sqrt(Math.max(0, vl * vl + 2 * bC * Math.max(0, gap - want))));
          if (oa - MIN_GAP < hard) { hard = oa - MIN_GAP; blocker = { t: 'veh', id: o.v.id }; v.waitOn = [o.v.id]; }
        }
      }
      // a connector needs a reservation before the front reaches it
      if (p.t === 'C' && !ghost && v.held.indexOf(p.id) < 0 && c0 >= front - 0.6) {
        const dist = c0 - front;
        if (dist < (v.v * v.v) / (2 * bC) + 4) {
          v.redLight = false;
          if (!this.tryReserve(v, k)) {
            const stopAt = c0 - 0.25;
            if (stopAt < hard) { hard = stopAt; blocker = { t: v.redLight ? 'light' : 'junction', node: this.g.conns[p.id].node }; }
            vt = Math.min(vt, Math.sqrt(Math.max(0, 2 * bC * Math.max(0, stopAt - front))));
          }
        } else {
          // not yet: plan to be able to stop there
          vt = Math.min(vt, Math.sqrt(2 * bC * Math.max(0, dist)) + 2.5);
        }
      }
      // level crossings on lanes
      if (p.t === 'L' && g.xings && g.xings.length && this.env.xingBlocked) {
        for (const x of g.xings) {
          const xs = c0 + (x.s0 - p.s0);
          if (xs < front - 0.3 || x.s0 < p.s0 - 0.01 || x.s0 > p.s1) continue;
          if (this.env.xingBlocked(x.k, x.line)) {
            const stopAt = xs - 1.0;
            if (stopAt < hard) { hard = stopAt; blocker = { t: 'rail', k: x.k }; }
            vt = Math.min(vt, Math.sqrt(2 * bC * Math.max(0, stopAt - front)));
          }
        }
      }
    }
    // ---- goals (the next stop of the centre) and the end of the path
    const goal = v.goals.length ? v.goals[0] : null;
    const gc = goal ? Math.min(goal.at, v.total) : v.total;
    const toGoal = gc - v.ps;
    vt = Math.min(vt, Math.sqrt(2 * bC * Math.max(0, toGoal)) + (toGoal > 0.3 ? 0.4 : 0));
    if (gc + v.len / 2 < hard) hard = gc + v.len / 2;
    // ---- people on the path (live vehicles only: walkers exist near the view)
    if (walkers && walkers.length && v.live) {
      const w = this.walkerAhead(v, walkers, look);
      if (w) {
        const stopAt = w.c - tr.blockAhead;
        vt = Math.min(vt, Math.sqrt(2 * bC * Math.max(0, stopAt - front)));
        if (stopAt < hard) { hard = Math.max(front, stopAt); blocker = { t: 'walker', id: w.id }; }
      }
    }
    // ---- speed
    if (v.v < vt) v.v = Math.min(vt, v.v + v.accel * dt);
    else v.v = Math.max(vt, v.v - bH * dt);
    let ps = v.ps + v.v * dt;
    if (ps + v.len / 2 > hard) { ps = Math.max(v.ps, hard - v.len / 2); v.v = Math.min(v.v, Math.max(0, (ps - v.ps) / Math.max(dt, EPS))); if (ps <= v.ps + EPS) v.v = 0; }
    v.ps = Math.min(ps, v.total);
    v.blockedBy = v.v < 0.05 ? blocker : null;
    // someone stands in the way: after a little wait the driver rings the bell (a soft toot in 도시), once
    if (v.blockedBy && v.blockedBy.t === 'walker' && !v.chief) {
      v.bellT = (v.bellT || 0) + dt;
      if (!v.rang && v.bellT >= (tr.bellAfter || 2)) { v.rang = true; this.events.push({ t: 'bell', id: v.id, x: v.x, y: v.y, who: v.blockedBy.id }); }
    } else if (v.v > 0.5) { v.bellT = 0; v.rang = false; }
    this.place(v);
    this.releasePassed(v);
    // ---- waiting / arrival
    if (v.v < 0.05 && !(goal && Math.abs(gc - v.ps) < 0.08) && !(v.ps >= v.total - 0.08)) {
      v.waitT += dt;
      if (!blocker || blocker.t === 'walker' || blocker.t === 'rail') v.waitOn = null;
    } else if (v.v >= 0.05) { v.waitT = 0; v.waitOn = null; }
    if (goal && v.ps >= gc - 0.08 && v.v < 0.3) {
      v.ps = gc; v.v = 0;
      v.goals.shift();
      v.lastGoal = goal;
      v.state = 'dwell';
      v.dwell = goal.dwell || 0;
      this.place(v);
      this.events.push({ t: 'arrive', id: v.id, tag: goal.tag, goal });
    } else if (!goal && v.ps >= v.total - 0.08 && v.v < 0.3) {
      v.v = 0; v.state = 'end';
      this.events.push({ t: 'end', id: v.id });
    }
  }

  /** speed allowed on the piece under the centre */
  speedHere(v) {
    const k = this.pieceIndex(v, v.ps), p = v.path[k];
    return Math.min(v.vmax * (v.cap === undefined ? 1 : v.cap), this.limitOf(v, p, this.pieceGeom(p)));
  }
  limitOf(v, p, g) {
    const cfg = this.cfg;
    let lim = v.vmax * (v.cap === undefined ? 1 : v.cap);
    if (p.t === 'C') { const t = cfg.turnSpeed[g.turn]; if (t !== undefined) lim = Math.min(lim, t); }
    else if (p.t === 'D') lim = Math.min(lim, 1.6);
    else if (g.kind === 'track') lim = Math.min(lim, v.trackSpeed || 3.0);
    else {
      const name = g.cls >= 2 ? 'asphalt' : g.cls >= 1 ? 'cobble' : 'dirt';
      let cl = cfg.speedByClass[name];
      if (v.animal) cl = g.cls >= 1 ? Math.max(cl, v.vmax) : cfg.speedByClass.horses;
      if (cl !== undefined) lim = Math.min(lim, Math.max(cl, v.animal ? 0 : 0));
    }
    return Math.max(0.3, lim);
  }

  /** the nearest walker on v's path ahead: { c (path coordinate), id } or null */
  walkerAhead(v, walkers, look) {
    const front = v.ps + v.len / 2;
    const half = v.width / 2 + 0.35;
    // a box around the path ahead (px)
    const a = this.pathPoint(v, v.ps, {}), b = this.pathPoint(v, Math.min(v.total + v.len, front + look), {});
    const m = this.pathPoint(v, Math.min(v.total + v.len, front + look / 2), {});
    const x0 = Math.min(a.x, b.x, m.x) - 140, x1 = Math.max(a.x, b.x, m.x) + 140, y0 = Math.min(a.y, b.y, m.y) - 80, y1 = Math.max(a.y, b.y, m.y) + 80;
    let best = null;
    for (const w of walkers) {
      if (w.x < x0 || w.x > x1 || w.y < y0 || w.y > y1) continue;
      // project on the pieces ahead
      const k0 = this.pieceIndex(v, v.ps);
      for (let k = k0; k < v.path.length; k++) {
        const p = v.path[k], c0 = v.cum[k];
        if (c0 - front > look) break;
        const g = this.pieceGeom(p);
        const pr = project(g.pts, g.cum, w.x, w.y);
        if (pr.s < p.s0 - 0.5 || pr.s > Math.max(p.s1, k === v.path.length - 1 ? p.s1 + v.len / 2 : p.s1) + 0.5) continue;
        if (pr.d > half) continue;
        const c = c0 + (pr.s - p.s0);
        if (c < front - 0.2 || c > front + look) continue;
        if (!best || c < best.c) best = { c, id: w.id };
      }
    }
    return best;
  }

  /** events since the last drain */
  drain() { const e = this.events; this.events = []; return e; }
}
