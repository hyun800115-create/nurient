// Ship timetable (harbor_runtime model, docs/v5_v8_plan.md §6.4 schedule.js): every ship's day as a mission of timed
// segments on fixed routes, placed so that no two hulls ever share water at the same time. Pure and deterministic.
//
// A trip = in (to the berth) + a hold at the berth (at least the dwell; longer while the way out is busy) + out.
// Every segment books the hull rectangle it sweeps (moving ones in 2 s pieces). The in-part goes at its wished time
// or the first later time (5 s steps, up to tuning.ships.maxDelay) where it meets no booking; the hold then lasts
// until the out-part fits. Berths are rectangles too, so "a berth is never double-booked" is the same rule. The tug,
// which must meet the cargo ship's sideways push exactly, is placed backwards from that moment.
//
// Day = the harbour day from 04:00 to 04:00 (time.js). The plan of a day is a pure function of (day, state, seed and
// the trips still running from the day before): a reload replans the day and every ship is where it would have been.

import { BERTHS, LANES, HAUL } from '../layout.js';
import { expand, overlaps, segPose, pieces, hullRect } from './ships.js';
import { at, DAY, HOUR } from './time.js';
import { stream } from './rng.js';

export const SPEED_PX = { ferry: 70, cargo_ship: 55, trawler_big: 65, tugboat: 80, sailboat: 60, yacht: 95 };

/** expand a route with the ship's speed (prof: 'sidle' on a step = the pushed ship's sideways pace: the tug) */
export function expandRoute(key, start, route, cfg) { return expand(key, start, route, { speedPx: SPEED_PX[key] || 60 }, cfg); }

/** the routes (lattice; see layout.js LANES / BERTHS). anchor: the step whose end is the wished time */
export function routes() {
  const F = BERTHS.F, C = BERTHS.C, W = BERTHS.W, T = BERTHS.T;
  const fa = LANES.ferryArr, fi = LANES.ferryIn, fd = LANES.ferryDep, mx = LANES.mouthI, cl = LANES.cargo, tl = LANES.trawler, to = LANES.trawlerOut, sea = LANES.seaI;
  const westTurn = 60.2;
  return {
    // the ferry: in from the east along the arrival lane, pushed sideways into the basin at the mouth, along the
    // inner lane to the terminal; out along the inner lane, sideways down past the arrival lane, east along the
    // departure lane
    ferry: {
      key: 'ferry', start: { i: sea, j: fa, h: 'NW' },
      in: [{ to: [mx, fa], fast: true, ev: 'near' }, { to: [mx, fi] }, { to: [F.i, fi] }, { to: [F.i, F.j], ev: 'arrive', anchor: true }],
      hold: 'berth',
      out: [{ to: [F.i, fi] }, { turn: 'SE' }, { to: [mx, fi] }, { to: [mx, fd] }, { to: [sea + 2, fd], fast: true }],
    },
    // the cargo ship: along its lane from the east, pushed sideways through the mouth to the crane quay
    cargo: {
      key: 'cargo_ship', start: { i: sea + 6, j: cl, h: 'NW' },
      in: [{ to: [C.i, cl], fast: true, ev: 'near' }, { to: [C.i, C.j], ev: 'arrive', anchor: true, tag: 'sidleIn' }],
      hold: 'berth',
      out: [{ to: [C.i, cl] }, { turn: 'SE' }, { to: [sea + 6, cl], fast: true }],
    },
    // a deep-sea trawler back from the grounds: hauls its net in sight of the harbour, then goes round to the gap
    // west of the breakwater and up into its berth at the basin's west wall, lands the catch, and either goes back
    // out (night fishing) or, the last one home, stays until 05:00
    trawler: {
      key: 'trawler_big', start: { i: sea + 4, j: tl, h: 'NW' },
      in: [{ to: [HAUL.i, tl], fast: true, ev: 'near', anchor: true }, { wait: 0, tag: 'haul', ev: 'hauled', haul: true }, { to: [westTurn, tl] }, { turn: 'NE' },
        { to: [W.i, tl] }, { to: [W.i, W.j], ev: 'home' }, { wait: 0, tag: 'unload', ev: 'unloaded', unload: true }],
      hold: 'moored',
      out: [{ to: [W.i, to] }, { to: [westTurn, to] }, { turn: 'SE' }, { to: [sea + 4, to], fast: true }],
    },
    // a new trawler slides down the shipyard's slipway into the west berth and sails out on its first trip
    launch: { key: 'trawler_big', start: { i: W.i, j: -14.2, h: 'SW' }, route: [{ wait: 2.5, tag: 'slip' }, { to: [W.i, W.j], tag: 'slip', ev: 'launched' }, { wait: 4, tag: 'afloat' }, { to: [W.i, to] }, { to: [westTurn, to] }, { turn: 'SE' }, { to: [sea + 4, to], fast: true }] },
    // the tug (★2): from its berth outside the breakwater to the cargo ship's side, pushes it in, goes home
    tugPre: (pushJ) => ({ key: 'tugboat', start: { i: T.i, j: T.j, h: 'NW' }, route: [{ turn: 'SW' }, { to: [T.i, pushJ] }, { turn: 'SE' }, { to: [C.i, pushJ] }, { turn: 'NE' }] }),
    tugPost: (pushJ, pushEndJ) => [{ to: [C.i, pushEndJ], prof: 'sidle', tag: 'push', ev: 'pushed' }, { wait: 2 }, { to: [C.i, pushJ] }, { turn: 'NW' }, { to: [T.i, pushJ] }, { turn: 'NE' }, { to: [T.i, T.j] }, { turn: 'NW' }],
    // sailboats and the yacht (★3) cruise the outer sea
    sail: (key, j, iWest) => ({ key, start: { i: sea + 4, j, h: 'NW' }, route: [{ to: [iWest, j] }, { wait: 6, tag: 'drift' }, { turn: 'SE' }, { to: [sea + 4, j] }] }),
  };
}

/**
 * booked hull rectangles in time: a list per 10 s bucket (a booking sits in every bucket it covers), so a clash
 * check looks at a handful of entries instead of the whole day
 */
const BUCKET = 10;
export class Bookings {
  constructor() { this.b = new Map(); this.n = 0; }
  add(t0, t1, rects, mid) {
    if (!rects || !rects.length || !(t1 > t0)) return;
    const e = { t0, t1, rects, mid };
    for (let k = Math.floor(t0 / BUCKET); k <= Math.floor(t1 / BUCKET); k++) { let l = this.b.get(k); if (!l) this.b.set(k, l = []); l.push(e); }
    this.n++;
  }
  /** book a segment (moving ones in pieces) */
  addSeg(s, mid) { for (const q of piecesOf(s)) this.add(s.t0 + q.u0, s.t0 + q.u1, q.rects, mid); }
  /** first booking meeting rects during [t0, t1] (other than mission `mid` / `except`), or null */
  clash(t0, t1, rects, mid, except) {
    for (let k = Math.floor(t0 / BUCKET); k <= Math.floor(t1 / BUCKET); k++) {
      const l = this.b.get(k);
      if (!l) continue;
      for (const e of l) {
        if (e.mid === mid || e.mid === except || e.t1 <= t0 || e.t0 >= t1) continue;
        for (const r of rects) for (const q of e.rects) if (overlaps(r, q)) return e;
      }
    }
    return null;
  }
  /** does a segment (relative times) shifted by S meet a booking? -> the booking or null */
  clashSeg(s, S, mid, except) {
    for (const q of piecesOf(s)) { const e = this.clash(S + s.t0 + q.u0, S + s.t0 + q.u1, q.rects, mid, except); if (e) return e; }
    return null;
  }
  drop(pred) { for (const [k, l] of this.b) { const f = l.filter((e) => !pred(e)); if (f.length) this.b.set(k, f); else this.b.delete(k); } }
  prune(T) { const lim = Math.floor((T - 1) / BUCKET); for (const k of this.b.keys()) if (k < lim) this.b.delete(k); }
  get list() { const out = new Set(); for (const l of this.b.values()) for (const e of l) out.add(e); return Array.from(out); }
}

/** booking pieces of a segment, relative to its start (cached on the segment: shifting copies keep the cache) */
function piecesOf(s) {
  if (s._pc) return s._pc;
  const ps = pieces(Object.assign({}, s, { t0: 0, t1: s.t1 - s.t0 }));
  s._pc = ps.map((q) => ({ u0: q.t0, u1: q.t1, rects: q.rects }));
  return s._pc;
}

const shift = (segs, S) => segs.map((s) => Object.assign({}, s, { t0: s.t0 + S, t1: s.t1 + S }));

/** a placed mission: absolute segments + events */
function mission(id, kind, key, segs, extra = {}) {
  const T0 = segs.length ? segs[0].t0 : 0, T1 = segs.length ? segs[segs.length - 1].t1 : T0;
  const ev = [{ t: T0, op: 'spawn' }];
  for (const s of segs) if (s.ev) ev.push({ t: s.t1, op: s.ev });
  ev.push({ t: T1, op: 'gone' });
  ev.sort((a, b) => a.t - b.t);
  return Object.assign({ id, kind, key, segs, T0, T1, ev }, extra);
}

export class Schedule {
  constructor(cfg, seed = 1) {
    this.cfg = cfg;
    this.seed = seed >>> 0;
    this.R = routes();
    this.book = new Bookings();
    this.missions = [];          // placed, not over yet
    this.planned = new Set();    // mission ids placed (a replan does not place them twice)
    this.dropped = [];           // ids that could not be placed (tests)
    this.delays = [];            // [id, s late] (tests / report)
  }

  C() { return this.cfg.ships || {}; }

  /** route with fixed waits filled in (haul / unload) */
  fill(route) {
    const T = this.cfg.trawler || {};
    return route.map((s) => (s.haul ? Object.assign({}, s, { wait: T.haul || 25 }) : s.unload ? Object.assign({}, s, { wait: T.unload || 20 }) : s));
  }
  anchorRel(key, start, route) {
    const k = route.findIndex((s) => s.anchor);
    return k < 0 ? 0 : expandRoute(key, start, route.slice(0, k + 1), this.C()).T;
  }

  clashAll(segs, S, id, except) { for (const s of segs) if (this.book.clashSeg(s, S, id, except)) return true; return false; }

  commit(m) {
    for (const s of m.segs) this.book.addSeg(s, m.id);
    this.missions.push(m);
    this.planned.add(m.id);
    return m;
  }

  /**
   * a trip: `in` at its wished anchor time (or later), a hold of at least `minHold` at the berth, then `out` as
   * soon as it fits. opts.holdUntil: a fixed hold end (the night trawler leaves at 05:00).
   */
  placeTrip(id, kind, r, want, minHold, extra = {}, opts = {}) {
    const C = this.C();
    const inR = this.fill(r.in);
    const exIn = expandRoute(r.key, r.start, inR, C);
    const anchorRel = this.anchorRel(r.key, r.start, inR);
    const exOut = expandRoute(r.key, exIn.end, r.out, C);
    const holdRect = [hullRect(r.key, exIn.end)];
    const maxDelay = opts.maxDelay !== undefined ? opts.maxDelay : (C.maxDelay || 300);
    const maxHold = opts.maxHold || 240;
    for (let d = 0; d <= maxDelay; d += 5) {
      const S = want - anchorRel + d;
      if (S < (opts.notBefore || -Infinity)) continue;
      const h0 = S + exIn.T;
      if (opts.latestIn !== undefined && h0 > opts.latestIn) break;
      if (this.clashAll(exIn.segs, S, id)) continue;
      const D0 = opts.holdUntil !== undefined ? Math.max(opts.holdUntil, h0) : h0 + minHold;
      // the hold must be free from h0 on; the earliest D where the way out is free wins
      let found = -1;
      for (let D = D0; D <= D0 + maxHold; D += 2) {
        if (this.book.clash(h0, D, holdRect, id)) break;          // somebody needs this berth: try a later arrival
        if (!this.clashAll(exOut.segs, D, id)) { found = D; break; }
      }
      if (found < 0) continue;
      const segs = shift(exIn.segs, S);
      segs.push({ kind: 'wait', t0: h0, t1: found, a: exIn.end, b: exIn.end, rects: holdRect, tag: r.hold, ev: 'depart', key: r.key });
      for (const s of shift(exOut.segs, found)) segs.push(s);
      if (d > 0) this.delays.push([id, d]);
      return this.commit(mission(id, kind, r.key, segs, Object.assign({ want, late: d, held: found - D0 }, extra)));
    }
    this.dropped.push(id);
    return null;
  }

  /** a plain route (sails, the launch) at `want` or later */
  placeRoute(id, kind, key, start, route, want, extra = {}, opts = {}) {
    const C = this.C();
    const ex = opts.ex || expandRoute(key, start, route, C);
    const maxDelay = opts.maxDelay !== undefined ? opts.maxDelay : (C.maxDelay || 300);
    for (let d = 0; d <= maxDelay; d += opts.step || 5) {
      const S = want + d;
      if (this.clashAll(ex.segs, S, id)) continue;
      if (d > 0) this.delays.push([id, d]);
      return this.commit(mission(id, kind, key, shift(ex.segs, S), Object.assign({ want, late: d }, extra)));
    }
    this.dropped.push(id);
    return null;
  }

  // ------------------------------------------------------------------------------------------ the day plan
  /**
   * plan harbour day `hd` from time `from` on. state: { steps: Set | fn(step) -> bool, star, trawlers }
   * Already placed missions are kept; missions whose wished time is before `from` are not placed.
   */
  *planDayGen(hd, state, from = -Infinity) {
    const cfg = this.cfg;
    const has = (s) => (typeof state.steps === 'function' ? state.steps(s) : !!(state.steps && state.steps.has && state.steps.has(s)));
    const placed = [];
    const want = (id, T) => !this.planned.has(id) && T >= from;
    const push = (m) => { if (m) placed.push(m); return m; };
    const tick = () => 0;
    // 1. ferries first: they keep the timetable (terminal; the night ferry needs the lighthouse)
    if (has('terminal')) {
      const hours = cfg.ferry.at.slice();
      if (has('lighthouse') && cfg.lighthouse.nightFerry) hours.push(cfg.lighthouse.nightFerry);
      for (let k = 0; k < hours.length; k++) {
        const h = hours[k], id = 'f' + hd + '_' + k, T = at(hd, h);
        if (!want(id, T)) continue;
        const m = push(this.placeTrip(id, 'ferry', this.R.ferry, T, cfg.ferry.dwell, { day: hd, slot: k, hour: h }));
        if (m) { const dep = m.ev.find((e) => e.op === 'depart'); if (dep) { m.ev.push({ t: dep.t - (cfg.ferry.board || 8), op: 'board' }); m.ev.sort((x, y) => x.t - y.t); } }
        yield m;
      }
    }
    // 2. the cargo ship (crane + customs) fits between the ferries — and the tug that pushes it in (★2)
    if (has('crane')) {
      const id = 'c' + hd, T = at(hd, cfg.cargo.at);
      if (want(id, T)) yield push(this.placeTrip(id, 'cargo', this.R.cargo, T, cfg.cargo.dwell, { day: hd }));
      const cargo = this.missions.find((m) => m.id === id);
      if (cargo && state.star >= 2 && !this.planned.has('t' + hd) && cargo.T0 >= from) yield push(this.placeTug(hd, cargo));
    }
    // 3. trawlers home one after another (shipyard)
    const n = Math.max(0, state.trawlers | 0);
    for (let k = 0; k < n; k++) {
      const id = 'w' + hd + '_' + k;
      const T = at(hd, cfg.trawler.back - 1.5 + k * 1.3);
      if (!want(id, T)) continue;
      const last = k === n - 1;
      const rs = stream(this.seed, id);
      const night = at(hd + 1, cfg.trawler.out);
      const m = push(this.placeTrip(id, 'trawler', this.R.trawler, T, 0, { day: hd, slot: k, last, rare: rs.chance(cfg.trawler.rareChance || 0) },
        last ? { holdUntil: night, latestIn: night - 30, maxDelay: 12 * HOUR * 2 } : { maxDelay: 12 * HOUR * 2 }));
      if (m) this.boxes(m);
      yield m;
    }
    // 4. sailboats and the yacht (★3)
    if (state.star >= 3) {
      const rs = stream(this.seed, 'sail' + hd);
      const trips = [['sailboat', LANES.leisure, 72, 10 + rs.range(0, 1.5)], ['yacht', LANES.yacht, 73, 11 + rs.range(0, 1.5)], ['sailboat', LANES.leisure, 72, 19.4 + rs.range(0, 1)]];
      for (let k = 0; k < trips.length; k++) {
        const [key, j, iw, h] = trips[k], id = 's' + hd + '_' + k, T = at(hd, h);
        if (!want(id, T)) continue;
        const r = this.R.sail(key, j, iw);
        yield push(this.placeRoute(id, key === 'yacht' ? 'yacht' : 'sail', key, r.start, r.route, T, { day: hd }, { maxDelay: 8 * HOUR }));
      }
    }
    return placed;
  }

  /** plan harbour day `hd` from time `from` on, all at once (see planDayGen). -> the missions placed */
  planDay(hd, state, from = -Infinity) {
    const g = this.planDayGen(hd, state, from);
    let r = g.next();
    while (!r.done) r = g.next();
    return r.value;
  }

  /** the catch comes ashore box by box while the trawler unloads */
  boxes(m) {
    const un = m.segs.find((s) => s.tag === 'unload');
    const n = (this.cfg.trawler && this.cfg.trawler.catch) || 8;
    if (un && !m.ev.some((e) => e.op === 'box')) {
      for (let b = 0; b < n; b++) m.ev.push({ t: un.t0 + (b + 0.7) * (un.t1 - un.t0) / (n + 0.4), op: 'box' });
      m.ev.sort((a, b) => a.t - b.t);
    }
  }

  /** the tug: pre-route ends at the push spot before the cargo ship starts sidling, waits, then pushes in sync */
  placeTug(hd, cargo) {
    const C = this.C(), R = this.R;
    const side = cargo.segs.find((s) => s.tag === 'sidleIn');
    if (!side) return null;
    const half = 3.96 / 2, tugHalf = 4.38 / 2, tugBeam = 3.0 / Math.SQRT2 / 2;
    const pushJ = side.a.j - half - tugHalf, pushEndJ = side.b.j - half - tugHalf;
    const pre = R.tugPre(pushJ);
    const exPre = expandRoute(pre.key, pre.start, pre.route, C);
    const exPost = expandRoute(pre.key, exPre.end, R.tugPost(pushJ, pushEndJ), C);
    const X = side.t0;
    const id = 't' + hd;
    const holdRect = [{ i0: exPre.end.i - tugBeam, i1: exPre.end.i + tugBeam, j0: exPre.end.j - tugHalf, j1: exPre.end.j + tugHalf }];
    for (let pad = 1; pad < 240; pad += 5) {
      const S = X - exPre.T - pad;
      const segs = shift(exPre.segs, S);
      segs.push({ kind: 'wait', t0: S + exPre.T, t1: X, a: exPre.end, b: exPre.end, rects: holdRect, tag: 'hold', key: 'tugboat' });
      for (const s of shift(exPost.segs, X)) segs.push(s);
      let ok = true;
      // the pushed cargo ship touches the tug: the push segment ignores the cargo mission
      for (const s of segs) if (this.book.clashSeg(s, 0, id, s.tag === 'push' ? cargo.id : undefined)) { ok = false; break; }
      if (!ok) continue;
      return this.commit(mission(id, 'tug', 'tugboat', segs, { day: hd, with: cargo.id }));
    }
    this.dropped.push(id);
    return null;
  }

  /** a newly built trawler leaves the slipway as soon as the west berth and its way out are free */
  placeLaunch(id, T) {
    const r = this.R.launch;
    const ex = expandRoute(r.key, r.start, r.route, this.C());
    // the slipway part is on land on purpose: it books the water only from the hull's touch-down line on
    const segs = ex.segs.map((s) => (s.tag === 'slip' ? Object.assign({}, s, { rects: s.kind === 'wait' ? [] : [{ i0: s.b.i - 1.63, i1: s.b.i + 1.63, j0: s.b.j - 4.95, j1: -12.64 }], slip: true }) : s));
    return this.placeRoute(id, 'launch', r.key, r.start, null, T, { launch: true }, { ex: { segs, T: ex.T, end: ex.end }, maxDelay: DAY, step: 5 });
  }

  // ------------------------------------------------------------------------------------------ queries
  /** forget missions over before T (and their bookings) */
  prune(T) {
    this.missions = this.missions.filter((m) => m.T1 > T - 1);
    this.book.prune(T);
  }
  /** drop not-yet-started missions (a replan after the harbour changed) */
  dropFuture(T) {
    const gone = new Set(this.missions.filter((m) => m.T0 > T).map((m) => m.id));
    if (!gone.size) return 0;
    this.missions = this.missions.filter((m) => !gone.has(m.id));
    this.book.drop((b) => gone.has(b.mid));
    for (const id of gone) this.planned.delete(id);
    return gone.size;
  }

  /** where mission m is at T (null when not at sea yet / gone): { i, j, h, h2, f, v, kind, tag, seg } */
  pose(m, T, out = {}) {
    if (T < m.T0 || T >= m.T1) return null;
    const S = m.segs;
    let lo = 0, hi = S.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (S[mid].t1 <= T) lo = mid + 1; else hi = mid; }
    const s = S[lo];
    segPose(s, T - s.t0, out);
    out.seg = lo; out.t0 = s.t0; out.t1 = s.t1;
    return out;
  }

  /** every ship at sea at T: [{ m, p }] */
  at(T) {
    const out = [];
    for (const m of this.missions) { const p = this.pose(m, T); if (p) out.push({ m, p }); }
    return out;
  }

  /** the next event `op` of a kind after T: { m, t } */
  next(kind, op, T) {
    let best = null;
    for (const m of this.missions) if (m.kind === kind) for (const e of m.ev) if (e.op === op && e.t > T && (!best || e.t < best.t)) best = { m, t: e.t };
    return best;
  }
}

export { DAY };
