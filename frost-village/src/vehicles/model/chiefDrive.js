// ChiefDrive (vehicles_runtime model/chiefDrive.js, docs/v5_v8_plan.md §6.3 + §7 B): the chief drives the dog sled
// (읍) or his truck (도시) on a delivery run. Lane-snapped: the stick projected on the heading is throttle / brake;
// at a junction the connector closest to the stick is taken; hands off, it rolls on at 0.6× top speed and follows the
// guide (the shortest way to the next stop), so a run always arrives. Delivery stops: drive past a stop within reach
// and the vehicle halts there, the goods fly off, on to the next. Par = route length ÷ (0.6 × vmax) + 8 s a stop:
// ★★★ ≤ par, ★★ ≤ 1.3 × par, ★ otherwise. A run never fails; it can be given up (abort), and then nothing is lost.
// When a run ends (done or given up) the vehicle stops, the chief climbs out (`veh:chiefOut`), and the vehicle goes
// home to its depot with a depot hand at the reins / wheel: it never stays in a lane.

import { project, DIR_VEC, bezier, cumOf, pointAt } from './geom.js';

/** the chief's truck takes the village snow paths only where a stop needs them (they look this much longer) */
const TRACK_WEIGHT = 4;
/** how far ahead (m along the guide) the HUD's edge arrow points */
const ARROW_AHEAD = 30;
/** the ground chevron marks the guide's next turn when it is this close (m) */
const CHEVRON_WITHIN = 45;

export class ChiefDrive {
  constructor(m) {
    this.m = m;
    this.run = null;            // the active run
    this.stickX = 0; this.stickY = 0;
    this.honkT = 0;
    this.last = null;           // the last result
  }

  // ------------------------------------------------------------------------------------------ plan / start / stop
  /** the vehicle a request gets: at 도시 the truck serves sled requests (the dog sled stays a 마을 / 읍 thing) */
  keyFor(spec) {
    const m = this.m;
    let key = spec.vehicle || (m.era >= 3 ? 'truck_cargo_chief' : 'dog_sled');
    if (key === 'dog_sled' && m.era >= 3) key = 'truck_cargo_chief';
    return key;
  }

  /**
   * everything start() checks, without starting: { ok, reason?, key, stops, startPos, par, len, allow, weight }.
   * spec: { tpl, mid, vehicle: 'dog_sled' | 'truck_cargo_chief', route?: layout DRIVE_ROUTES name, stops?: [place id |
   * { x, y, name }], start?: place id | { x, y }, cargo?: { item: n }, capSpeed?, deadline? (s), parOverride? (s) }
   */
  plan(spec) {
    const m = this.m;
    spec = spec || {};
    if (this.run) return { ok: false, reason: 'busy' };
    if (m.transit && m.transit.riding()) return { ok: false, reason: 'riding' };
    const key = this.keyFor(spec);
    if (key === 'truck_cargo_chief' && m.era < 3) return { ok: false, reason: 'era' };
    if (key !== 'truck_cargo_chief' && key !== 'dog_sled') return { ok: false, reason: 'vehicle' };
    const R = spec.route ? m.layout.DRIVE_ROUTES[spec.route] : null;
    if (spec.route && !R) return { ok: false, reason: 'route' };
    if (R && R.ver && !(m.env.flag && m.env.flag('v' + R.ver))) return { ok: false, reason: 'route' };
    const pt = (p) => (typeof p === 'string' ? (m.layout.PLACES[p] || (m.extraPlaces && m.extraPlaces[p]) || null) : p);
    let stopsIn = spec.stops || (R && R.stops) || [];
    if (R && R.dynamic === 'shops' && m.env.freight && m.env.freight.shopTargets) {
      const sh = (m.env.freight.shopTargets() || []).slice(0, 4).map((t) => ({ x: t.x, y: t.y, name: t.name, id: t.id }));
      if (sh.length >= 2) stopsIn = sh;
    }
    const stops = stopsIn.map(pt).filter(Boolean).map((p, i) => ({ x: p.x, y: p.y, name: p.name || null, id: typeof stopsIn[i] === 'string' ? stopsIn[i] : p.id, done: false, armed: false }));
    if (!stops.length) return { ok: false, reason: 'stops' };
    const st = pt(spec.start || (R && R.start) || 'p:yard');
    const spec2 = m.vehicleSpec(key);
    // the dog sled: roads and snow paths alike; the truck: roads, the snow paths only where it must
    const allow = () => true;
    const weight = key === 'dog_sled' ? null : (l) => (l.kind === 'track' ? TRACK_WEIGHT : 1);
    const ro = { allow, weight };
    const g = m.graph;
    const sn = st && g.snap(st.x, st.y, (l) => !l.stub && (key === 'dog_sled' || l.kind === 'road')) || (st && g.snap(st.x, st.y, (l) => !l.stub));
    if (!sn) return { ok: false, reason: 'start' };
    for (const s of stops) {
      const to = g.snap(s.x, s.y, (l) => !l.stub);
      if (!to) return { ok: false, reason: 'stops' };
      s.pos = { lane: to.lane, s: to.s };
    }
    // start facing the first stop: of this lane and the one beside it going the other way, the shorter way there
    let startPos = { lane: sn.lane, s: g.fit(sn.lane, sn.s, spec2.len) };
    const tw = g.twin(sn.lane);
    if (tw >= 0) {
      const alt = { lane: tw, s: g.fit(tw, g.lanes[tw].len - sn.s, spec2.len) };
      const a = g.route(startPos, stops[0].pos, ro), b = g.route(alt, stops[0].pos, ro);
      if (b && (!a || g.pathLen(b) < g.pathLen(a))) startPos = alt;
    }
    // par: the guide's way through the stops in order
    const cfg = m.cfg.drive, cap = spec.capSpeed || 1;
    let L = 0, here = startPos;
    for (const s of stops) {
      const r = g.route(here, s.pos, ro);
      if (!r) return { ok: false, reason: 'unreachable' };
      L += g.pathLen(r);
      here = s.pos;
    }
    const vmax = (m.cfgFor(key).speed || spec2.vmax) * cap;
    let par = Math.round((L / (cfg.parFactor * vmax) + cfg.perStop * stops.length) * 10) / 10;
    if (Number.isFinite(spec.parOverride) && spec.parOverride > 0) par = Math.round(spec.parOverride * 10) / 10;
    return { ok: true, key, stops, startPos, par, len: L, allow, weight, vmax, cap, spec2 };
  }

  /** can this run be driven now? { ok, reason?, par } (the missions engine gates its cards on it) */
  canDrive(spec) { const p = this.plan(spec || {}); return p.ok ? { ok: true, par: p.par, vehicle: p.key, stops: p.stops.length } : { ok: false, reason: p.reason }; }

  /** -> { ok, reason?, par, stops, key } */
  start(spec) {
    const m = this.m;
    spec = spec || {};
    const p = this.plan(spec);
    if (!p.ok) return p;
    // a bus the chief was waiting for: the drive comes first
    if (m.transit) m.transit.cancelWaiting('drive');
    const { key, stops, startPos, par, len, allow, weight, vmax, cap, spec2 } = p;
    const v = m.sim.add(Object.assign({}, spec2, { role: 'chief', chief: true, allow, weight, cap: 1, trackSpeed: key === 'dog_sled' ? spec2.vmax : 3.2, tracks: true }));
    v.vmax = vmax / cap;                // the cap below scales it
    v.capSpeed = cap;
    const lane = m.graph.lanes[startPos.lane];
    m.sim.setPath(v, [{ t: 'L', id: lane.id, s0: startPos.s, s1: lane.len }], []);
    this.run = { spec, key, vid: v.id, stops, i: 0, t: 0, par, len, cargo: spec.cargo || null, deadline: spec.deadline || 0, late: false, started: m.T, guide: null, guideLane: -1, guideT: 0, backT: 0, turns: 0, noRoomT: 0, roomT: 0 };
    this.honkT = 0;
    m.emit({ t: 'veh:drive', op: 'start', tpl: spec.tpl || null, mid: spec.mid || null, key, par, stops: stops.length, id: v.id, first: stops[0].name || null });
    return { ok: true, par, key, stops: stops.map((s) => ({ x: s.x, y: s.y, name: s.name })) };
  }

  /**
   * the player gives up (the HUD's 그만하기, or the mission vanished): the run ends without a result, nothing is
   * lost. The vehicle brakes to a stop, the chief climbs out, a depot hand takes it home.
   */
  abort() {
    const r = this.run;
    if (!r) return null;
    this.run = null;
    const m = this.m, v = m.sim.get(r.vid);
    m.emit({ t: 'veh:drive', op: 'abort', tpl: r.spec.tpl || null, mid: r.spec.mid || null, id: r.vid, x: v ? v.x : 0, y: v ? v.y : 0 });
    if (v) this.release(v, true);
    return { aborted: true };
  }

  /**
   * the run is over (done or given up): the vehicle is the depot's again. Standing (a drop) -> the chief gets out now;
   * moving (given up) -> it brakes to a halt first ('out' goal), then he gets out
   */
  release(v, braking) {
    const m = this.m;
    v.chief = false; v.role = 'parked'; v.afterRun = true; v.holdOn = false;
    v.outKey = v.key;
    // the truck's art has the chief baked in the cab: a depot driver takes over the plain truck
    if (v.key === 'truck_cargo_chief') { v.key = 'truck_cargo'; v.swapFrom = 'truck_cargo_chief'; }
    if (!braking || v.state === 'dwell' || v.v < 0.3 || !v.path) { this.out(v); if (v.state !== 'dwell') { v.goals = []; this.halt(v, v.ps + 0.02, 1.2); } return; }
    const bC = m.cfg.brake.comfort;
    let c = v.ps + (v.v * v.v) / (2 * bC) + 0.4;
    // never in the middle of a junction: on into the next lane
    const k = m.sim.pieceIndex(v, Math.min(c, v.total)), p = v.path[k];
    if (p && p.t === 'C' && k + 1 < v.path.length) c = v.cum[k + 1] + 0.3;
    this.halt(v, c, 1.2, 'out');
  }
  /** a goal at path metre c (clamped to the path) where v stands for `dwell` s */
  halt(v, c, dwell, tag = 'rest') {
    c = Math.max(v.ps, Math.min(c, v.total - 0.05));
    v.goals = [{ at: c, dwell, tag }];
    if (v.state === 'end') v.state = 'drive';
  }
  /** the chief climbs out of v (the host puts him down by the door and the camera back on him) */
  out(v) {
    if (v.chiefOut) return;
    v.chiefOut = true;
    this.m.emit({ t: 'veh:chiefOut', id: v.id, x: v.x, y: v.y, dk: v.dk, hx: v.hx, hy: v.hy, key: v.outKey || v.key });
  }

  /** screen-space stick (x right, y down, |s| ≤ 1): the joystick or the keys */
  stick(x, y) { this.stickX = x || 0; this.stickY = y || 0; }

  /** 빵빵: people on the way step aside (the host makes them hurry), a stopped car ahead moves on */
  honk() {
    const r = this.run;
    if (!r || this.honkT > 0) return false;
    this.honkT = this.m.cfg.traffic.honkEvery || 3;
    const v = this.m.sim.get(r.vid);
    this.m.emit({ t: 'veh:honk', id: r.vid, x: v ? v.x : 0, y: v ? v.y : 0, blocked: v && v.blockedBy ? v.blockedBy : null });
    return true;
  }

  vehicle() { return this.run ? this.m.sim.get(this.run.vid) : null; }
  active() { return !!this.run; }

  // ------------------------------------------------------------------------------------------ per step
  /** before the simulation step: throttle from the stick, choose the way at the next junction */
  input(dt) {
    if (this.honkT > 0) this.honkT -= dt;
    const r = this.run;
    if (!r) return;
    const m = this.m, v = m.sim.get(r.vid);
    if (!v || !v.path) return;
    const coast = m.cfg.chiefTruck.coast || 0.6;
    const mag = Math.hypot(this.stickX, this.stickY);
    const h = Math.hypot(v.hx, v.hy) || 1;
    const thr = mag > 0.15 ? (this.stickX * v.hx + this.stickY * v.hy) / h : 0;
    // pull straight back = "turn round" (a turn stick or a hairpin at the next junction still rolls on)
    const back = mag > 0.15 && thr < -0.85 && !this.hairpin(v);
    if (back && r.noRoomT > 0) {
      // no room to turn here: roll on, and look for room as we go (the moment there is, brake and turn)
      r.roomT -= dt;
      if (r.roomT <= 0) { r.roomT = 0.25; if (this.turnAround(v, r, true)) r.noRoomT = 0; }
    }
    let f;
    if (mag <= 0.15) f = coast;
    else if (back) f = r.noRoomT > 0 ? coast : 0;
    else f = Math.max(coast, Math.min(1, thr * 1.15));
    // in the middle of a turn-round: finish it (slowly) whatever the stick says
    const cur = v.path[m.sim.pieceIndex(v, v.ps)];
    if (cur && cur.turn) f = Math.max(f, coast);
    v.cap = f * (v.capSpeed || 1);
    // hold the stick back while (nearly) stopped: turn round where you are (a little U in the street)
    // (once per pull: let go, or push on, before the next turn)
    if (r.turnLock && (mag <= 0.15 || thr > -0.5)) r.turnLock = false;
    if (back && f === 0 && v.v < 0.5 && !r.turnLock) { r.backT += dt; if (r.backT >= (m.cfg.drive.turnHold || 0.5)) { r.backT = 0; if (this.turnAround(v, r)) { r.turnLock = true; return; } } }
    else r.backT = 0;
    // keep the path long enough to brake on; choose at the end of the path
    let guard = 4;
    while (guard-- > 0) {
      const front = v.ps + v.len / 2;
      const decide = Math.max(9, (v.v * v.v) / (2 * m.cfg.brake.comfort) + v.len + 6);
      if (v.total - front > decide) break;
      if (!this.extend(v, r)) break;
    }
    this.rechoose(v, r);
    this.trimPath(v);
  }

  /** the stick points back along a hairpin at the next junction (not a U): roll on into it instead of braking */
  hairpin(v) {
    const g = this.m.graph, front = v.ps + v.len / 2;
    for (let k = this.m.sim.pieceIndex(v, v.ps); k < v.path.length; k++) {
      const p = v.path[k];
      if (p.t !== 'C') continue;
      if (v.cum[k] - front > 14 || k < 1 || v.path[k - 1].t !== 'L') return false;
      const pk = this.pickByStick(g.lanes[v.path[k - 1].id], this.stickX, this.stickY, v.allow);
      return !!(pk && pk.turn !== 'U' && pk.score > 0.7);
    }
    return false;
  }

  /**
   * turn round on the spot: a short U (a private piece, like a driveway) from this lane into the one beside it going
   * the other way. Only on a lane with room, and when nobody is there on the other side. -> true when it turned
   * (dry = only say whether it could, change nothing).
   */
  turnAround(v, r, dry) {
    const m = this.m, g = m.graph;
    let k = m.sim.pieceIndex(v, v.ps), p = v.path[k];
    if (!p) return false;
    let s;
    if (p.t === 'L') s = p.s0 + (v.ps - v.cum[k]);
    else {
      // stopped in a junction (or a private piece): turn from the nearer lane end
      const prev = k > 0 && v.path[k - 1].t === 'L' ? v.path[k - 1] : null, next = k + 1 < v.path.length && v.path[k + 1].t === 'L' ? v.path[k + 1] : null;
      const dPrev = prev ? v.ps - v.cum[k] : Infinity, dNext = next ? v.cum[k + 1] - v.ps : Infinity;
      if (!prev && !next) return false;
      if (dPrev <= dNext) { p = prev; s = prev.s1; } else { p = next; s = next.s0; }
    }
    const lane = g.lanes[p.id], tw = g.twin(p.id);
    if (tw < 0 || !v.allow(g.lanes[tw])) { if (!dry) r.noRoomT = 1.5; return false; }
    const T = g.lanes[tw];
    // the spot beside (a short U); someone there (a bus at its stop): a wider U further on, else no room here
    let ahead = -1, sB = 0;
    for (const want of [2.6, 5.5, 8.5]) {
      const a = Math.max(0.8, Math.min(want, lane.len - s - 0.2));
      const b = Math.max(Math.min(T.len - 0.3, v.len / 2 + 0.3), Math.min(T.len - 0.3, T.len - s - a));
      if (m.sim.canMerge(tw, b, v.len, v)) { ahead = a; sB = b; break; }
      if (a < want) break;
    }
    if (ahead < 0) { if (!dry) r.noRoomT = 1.5; return false; }
    if (dry) return true;
    const A = g.at('L', lane.id, s, {}), A2 = g.at('L', lane.id, Math.min(lane.len, s + ahead), {});
    const R0 = g.at('L', lane.id, Math.max(0, s - v.len / 2), {});
    const B = g.at('L', tw, sB, {});
    const fx = A2.x - A.x, fy = A2.y - A.y;
    const c = { x: (A2.x + B.x) / 2 + fx * 0.9, y: (A2.y + B.y) / 2 + fy * 0.9 };
    const pts = [{ x: R0.x, y: R0.y }].concat(bezier({ x: A.x, y: A.y }, c, { x: B.x, y: B.y }, 10));
    const cum = cumOf(pts), L = cum[cum.length - 1];
    const half = cum[1];
    m.sim.setPath(v, [{ t: 'D', turn: true, pts, cum, len: L, s0: 0, s1: L }, { t: 'L', id: tw, s0: sB, s1: T.len }], [], half);
    v.v = 0;
    for (const st of r.stops) st.armed = false;
    r.guide = null; r.guideLane = -1; r.turns++; r.noRoomT = 0;
    m.emit({ t: 'veh:drive', op: 'turn', id: v.id, x: v.x, y: v.y });
    return true;
  }

  /** the stick may still change the way at the next junction until the vehicle has reserved it */
  rechoose(v, r) {
    const m = this.m, g = m.graph;
    const mag = Math.hypot(this.stickX, this.stickY);
    if (mag <= 0.35) return;
    const front = v.ps + v.len / 2;
    let kc = -1;
    for (let k = m.sim.pieceIndex(v, v.ps); k < v.path.length; k++) if (v.path[k].t === 'C' && v.cum[k] > front) { kc = k; break; }
    if (kc < 1 || v.held.indexOf(v.path[kc].id) >= 0 || v.cum[kc] - front < 1.5) return;
    const lane = g.lanes[v.path[kc - 1].id];
    if (!lane || v.path[kc - 1].t !== 'L' || lane.len < v.len + 2) return;
    const pk = this.pickByStick(lane, this.stickX, this.stickY, v.allow);
    if (!pk || pk.id === v.path[kc].id || pk.score < 0.2) return;
    const best = g.conns[pk.id];
    const cut = v.cum[kc];
    v.path.length = kc;
    const to = g.lanes[best.to];
    v.path.push({ t: 'C', id: best.id, s0: 0, s1: best.len }, { t: 'L', id: to.id, s0: 0, s1: to.len });
    this.recum(v);
    // a stop armed on the dropped way is armed again later
    const keep = [];
    for (const gl of v.goals) { if (gl.at < cut) keep.push(gl); else if (gl.tag === 'drop') { const st = r.stops[r.i]; if (st) st.armed = false; } }
    v.goals = keep;
    for (let i = v.commits.length - 1; i >= 0; i--) if (v.commits[i].k >= kc) v.commits.splice(i, 1);
  }

  /**
   * append the connector at the end of the path and its lane: the one the stick points to; hands off (or a stick that
   * does not choose), the guide's turn toward the next stop, else straight on
   */
  extend(v, r) {
    const m = this.m, g = m.graph;
    const last = v.path[v.path.length - 1];
    if (last.t !== 'L') return false;
    const lane = g.lanes[last.id];
    if (last.s1 < lane.len - 0.01) { last.s1 = lane.len; this.recum(v); return true; }
    const outs = lane.out.map((id) => g.conns[id]).filter((c) => v.allow(g.lanes[c.to]));
    if (!outs.length) return false;
    let pick = null;
    const mag = Math.hypot(this.stickX, this.stickY);
    // a junction right after another (a lane shorter than the vehicle, like the 큰길 jog): the stick still means the
    // first turn, so the second one follows the guide instead
    const chained = lane.len < v.len + 2;
    if (mag > 0.35 && outs.length > 1 && !chained) { const b = this.pickByStick(lane, this.stickX, this.stickY, v.allow); if (b && b.score > 0.2) pick = g.conns[b.id]; }
    if (!pick) {
      const guide = this.guideConn(v, r, lane);
      const straight = outs.find((c) => c.turn === 'S' && !g.lanes[c.to].stub);
      pick = (guide && outs.find((c) => c.id === guide)) || straight || outs.find((c) => !g.lanes[c.to].stub && c.turn !== 'U') || outs[0];
    }
    const to = g.lanes[pick.to];
    v.path.push({ t: 'C', id: pick.id, s0: 0, s1: pick.len }, { t: 'L', id: to.id, s0: 0, s1: to.len });
    this.recum(v);
    return true;
  }

  /**
   * the connector at the end of `lane` whose out-lane points most along the stick (screen vector): { id, score }.
   * Ties (a cardinal stick between two diagonal streets) go to straight on; stubs and U-turns score lower.
   */
  pickByStick(lane, sx, sy, allow) {
    const g = this.m.graph;
    const mag = Math.hypot(sx, sy) || 1;
    let best = null;
    for (const id of lane.out) {
      const c = g.conns[id], to = g.lanes[c.to];
      if (allow && !allow(to)) continue;
      const a = to.pts[0], b = to.pts[Math.min(1, to.pts.length - 1)];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      let score = (sx * dx + sy * dy) / d / mag;
      if (c.turn === 'S') score += 0.01;
      if (to.stub) score -= 0.25;
      if (c.turn === 'U') score -= 0.5;
      if (!best || score > best.score) best = { id, score, turn: c.turn };
    }
    return best;
  }

  /** the connector at the end of `lane` that the guide route takes toward the next stop */
  guideConn(v, r, lane) {
    const m = this.m;
    const st = r.stops[r.i];
    if (!st || !st.pos) return null;
    const path = m.graph.route({ lane: lane.id, s: Math.max(0, lane.len - 0.01) }, st.pos, { allow: v.allow, weight: v.weight });
    const c = path && path.find((p) => p.t === 'C');
    return c ? c.id : null;
  }

  recum(v) {
    const n = v.path.length;
    const cum = new Float64Array(n + 1);
    for (let k = 0; k < n; k++) cum[k + 1] = cum[k] + (v.path[k].s1 - v.path[k].s0);
    v.cum = cum; v.total = cum[n];
  }

  /** drop pieces far behind the body (the path grows as the chief drives) */
  trimPath(v) {
    const rear = v.ps - v.len / 2 - 2;
    let k = 0;
    while (k < v.path.length - 2 && v.cum[k + 1] < rear && !(v.path[k].t === 'C' && v.held.indexOf(v.path[k].id) >= 0)) k++;
    if (k < 4) return;
    const shift = v.cum[k];
    v.path = v.path.slice(k);
    this.recum(v);
    v.ps -= shift;
    for (const gl of v.goals) gl.at -= shift;
    for (const c of v.commits) c.k -= k;
  }

  /** after the simulation step: the clock, delivery stops within reach, the guide */
  update(dt) {
    const r = this.run;
    if (!r) return;
    const m = this.m, v = m.sim.get(r.vid);
    if (!v) { this.run = null; return; }
    r.t += dt;
    if (r.noRoomT > 0) r.noRoomT -= dt;
    if (r.deadline && r.t > r.deadline) r.late = true;
    const st = r.stops[r.i];
    if (st && !st.armed && v.state === 'drive') this.arm(v, r, st);
    // the guide: the way to the next stop (HUD arrow, turn hint, the chevron on the ground)
    r.guideT -= dt;
    const here = m.herePos(v);
    if (st && here && (here.lane !== r.guideLane || !r.guide || r.guideT <= 0)) {
      r.guideLane = here.lane; r.guideT = 0.5;
      const path = st.pos ? m.graph.route(here, st.pos, { allow: v.allow, weight: v.weight }) : null;
      r.guide = path ? this.guideInfo(path) : null;
    }
  }

  /** what the guide path says: { len (m), turn ('S' | 'L' | 'R' | 'U'), turnIn (m), ahead {x, y}, chevron? } */
  guideInfo(path) {
    const g = this.m.graph;
    let acc = 0, turn = 'S', turnIn = -1, chevron = null, ahead = null;
    for (const p of path) {
      const len = p.s1 - p.s0;
      if (p.t === 'C' && turnIn < 0) {
        const c = g.conns[p.id];
        if (c.turn !== 'S') {
          turn = c.turn; turnIn = acc;
          if (acc <= CHEVRON_WITHIN) {
            const a = pointAt(c.pts, c.cum, c.len * 0.5, {});
            const to = g.lanes[c.to], b0 = to.pts[0], b1 = to.pts[Math.min(1, to.pts.length - 1)];
            const hx = b1.x - b0.x, hy = b1.y - b0.y, hn = Math.hypot(hx, hy) || 1;
            chevron = { x: a.x, y: a.y, hx: hx / hn, hy: hy / hn, turn: c.turn };
          }
        }
      }
      if (!ahead && acc + len >= ARROW_AHEAD) {
        const geo = p.t === 'C' ? g.conns[p.id] : g.lanes[p.id];
        const q = pointAt(geo.pts, geo.cum, p.s0 + (ARROW_AHEAD - acc), {});
        ahead = { x: q.x, y: q.y };
      }
      acc += len;
    }
    if (!ahead && path.length) {
      const p = path[path.length - 1], geo = p.t === 'C' ? g.conns[p.id] : g.lanes[p.id];
      const q = pointAt(geo.pts, geo.cum, p.s1, {});
      ahead = { x: q.x, y: q.y };
    }
    return { len: Math.round(acc * 10) / 10, turn: turnIn >= 0 ? turn : 'S', turnIn: turnIn >= 0 ? Math.round(turnIn) : -1, ahead, chevron };
  }

  /** a stop ahead on the path within reach: put a goal there (the vehicle halts with its centre beside the stop) */
  arm(v, r, st) {
    const m = this.m, g = m.graph;
    const reach = m.cfg.drive.stopReach || 3.4;
    const front = v.ps + v.len / 2;
    for (let k = m.sim.pieceIndex(v, v.ps); k < v.path.length; k++) {
      const p = v.path[k];
      if (p.t !== 'L') continue;
      const lane = g.lanes[p.id];
      const pr = project(lane.pts, lane.cum, st.x, st.y);
      if (pr.d > reach) continue;
      const s = Math.max(p.s0, Math.min(p.s1, pr.s));
      if (s < p.s0 + 0.01 && pr.s < p.s0 - 0.5) continue;
      const c = v.cum[k] + (s - p.s0);
      const need = (v.v * v.v) / (2 * m.cfg.brake.comfort) * 0.9;
      if (c - v.ps < need - 0.2 || c + v.len / 2 < front - 0.5) continue;           // too late to stop: next time round
      st.armed = true;
      v.goals.push({ at: c, dwell: m.cfg.drive.unload || 2.5, tag: 'drop' });
      v.goals.sort((a, b) => a.at - b.at);
      return;
    }
  }

  arrive(v, tag) {
    const r = this.run;
    if (!r || v.id !== r.vid) return;
    if (tag !== 'drop') return;
    const st = r.stops[r.i];
    if (!st) return;
    st.done = true;
    r.i++;
    r.guide = null;
    this.m.emit({ t: 'veh:drop', id: v.id, i: r.i - 1, x: st.x, y: st.y, name: st.name, at: { x: v.x, y: v.y }, cargo: r.cargo, left: r.stops.length - r.i });
    if (r.i >= r.stops.length) this.finish(v, r);
  }

  depart(v) { void v; /* during a run the path stays (it is extended in input()) */ }

  ended(v) {
    // the path ran out (a dead end with nowhere to go): extend again next step
    if (this.run && v.id === this.run.vid) v.state = 'drive';
  }

  finish(v, r) {
    const m = this.m, cfg = m.cfg.drive;
    const t = Math.round(r.t * 10) / 10;
    let stars = t <= r.par ? 3 : t <= r.par * cfg.star2 ? 2 : 1;
    if (r.late) stars = 1;
    const tpl = r.spec.tpl || r.spec.route || 'free';
    const best = m.best[tpl];
    const isBest = !best || t < best;
    // best times per mission template: the 12 most recently driven (the designer's preview runs are not kept)
    if (tpl !== 'preview') {
      const keep = Math.min(best || Infinity, t);
      delete m.best[tpl];
      m.best[tpl] = keep;
      const keys = Object.keys(m.best);
      while (keys.length > 12) delete m.best[keys.shift()];
    }
    this.last = { tpl, mid: r.spec.mid || null, stars, s: t, par: r.par, best: isBest, late: r.late };
    m.emit({ t: 'veh:driveDone', tpl, mid: r.spec.mid || null, stars, s: t, par: r.par, best: isBest, late: r.late, id: v.id, x: v.x, y: v.y });
    this.run = null;
    // the vehicle stands at the last stop for the unload dwell: the chief climbs out, then it goes home
    this.release(v, false);
  }

  /** send the empty run vehicle home (the chief is out): a depot hand drives it to its depot */
  home(vid) {
    const v = this.m.sim.get(vid);
    if (!v) return;
    v.holdOn = false; v.role = 'retire'; v.afterRun = false;
    this.m.retireVehicle(v, false);
  }

  /** after a graph rebuild: the run vehicle continues on the lane under it */
  remap(v) {
    const m = this.m;
    const here = m.herePos(v) || m.graph.snap(v.x, v.y, (l) => l.dk === v.dk && v.allow(l)) || m.graph.snap(v.x, v.y, v.allow);
    if (!here) return;
    const lane = m.graph.lanes[here.lane];
    m.sim.setPath(v, [{ t: 'L', id: lane.id, s0: here.s, s1: lane.len }], []);
    if (this.run) for (const s of this.run.stops) { s.armed = s.done; const to = m.graph.snap(s.x, s.y, (l) => v.allow(l) && !l.stub); if (to) s.pos = { lane: to.lane, s: to.s }; }
    if (this.run) { this.run.guide = null; this.run.guideLane = -1; }
  }

  /** what the HUD shows */
  state() {
    const r = this.run;
    if (!r) return { active: false, last: this.last };
    const v = this.m.sim.get(r.vid);
    const st = r.stops[r.i];
    const t = r.t;
    const stars = r.late ? 1 : t <= r.par ? 3 : t <= r.par * this.m.cfg.drive.star2 ? 2 : 1;
    let arrow = null;
    if (st && v) {
      // the edge arrow points along the guide (30 m on), the metres are the way there, not as the crow flies
      const tgt = r.guide && r.guide.ahead ? r.guide.ahead : st;
      const dx = tgt.x - v.x, dy = tgt.y - v.y, d = Math.hypot(dx, dy) || 1;
      const way = r.guide ? r.guide.len : Math.hypot(st.x - v.x, (st.y - v.y) * 2) / 64;
      arrow = { x: dx / d, y: dy / d, m: Math.round(way), tx: tgt.x, ty: tgt.y };
    }
    return {
      active: true, t: Math.round(t * 10) / 10, par: r.par, stars, i: r.i, n: r.stops.length, late: r.late,
      next: st ? { x: st.x, y: st.y, name: st.name } : null, arrow, guide: r.guide, key: r.key, vid: r.vid,
      speed: v ? Math.round(v.v * 10) / 10 : 0, honk: this.honkT <= 0, blocked: r.noRoomT > 0 ? 'noRoom' : v && v.blockedBy ? v.blockedBy.t : null,
      stops: r.stops.map((s) => ({ x: s.x, y: s.y, done: s.done })), dir: v ? DIR_VEC[v.dk] : null,
    };
  }
}

export { TRACK_WEIGHT };
