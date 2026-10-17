// Rail (v4, docs/v4_plan.md §4): the snow train's timetable on the coastal track (lattice line j = 0).
// Pure JS (no Phaser): positions are pure functions of a phase clock, so they can be tested in Node.
//   position m = metres along the track from the buffer stop at i = rail.from (screen = L(from + m/√2, 0))
//   phases: toOurs (pulls in, engine first) -> atOurs (dwell) -> toTown (pushed back) -> atTown (dwell)
// The consist is push-pull with the engine on the village (NW) end: car_a stops at the stations' carA.

import { BALANCE } from '../data/balance.js';
import { WORLD } from '../data/world.js';

export const PHASES = ['toOurs', 'atOurs', 'toTown', 'atTown'];
const S2 = Math.SQRT2;
const BLOCK_NEAR = 1.6;     // m: a crossing is closed while any car is this close to it...
const BLOCK_AHEAD = 3;      // s: ...or will reach it within this time

/** trapezoid speed profile of one leg of length D (m): accelerate, cruise, brake */
export function legProfile(D, vmax, acc, brk) {
  let v = vmax;
  let da = (v * v) / (2 * acc), db = (v * v) / (2 * brk);
  if (da + db > D) { v = Math.sqrt((2 * D * acc * brk) / (acc + brk)); da = (v * v) / (2 * acc); db = (v * v) / (2 * brk); }
  const t1 = v / acc, dc = Math.max(0, D - da - db), t2 = t1 + dc / v, T = t2 + v / brk;
  return {
    D, v, t1, t2, T, acc, brk,
    pos(t) {
      if (t <= 0) return 0;
      if (t >= T) return D;
      if (t < t1) return 0.5 * acc * t * t;
      if (t < t2) return da + v * (t - t1);
      const u = T - t;
      return D - 0.5 * brk * u * u;
    },
    vel(t) {
      if (t <= 0 || t >= T) return 0;
      if (t < t1) return acc * t;
      if (t < t2) return v;
      return brk * (T - t);
    },
  };
}

export class Rail {
  constructor(opts = {}) {
    const R = (WORLD.v4 && WORLD.v4.rail) || { from: -1, to: 46, crossings: [8, 33] };
    this.from = R.from;
    this.to = R.to;
    this.B = Object.assign({}, (BALANCE.v4 && BALANCE.v4.train) || {}, opts);
    const st = (WORLD.v4 && WORLD.v4.stations) || { ours: { carA: 2.5 }, town: { carA: 28 } };
    this.mOurs = this.mAt(st.ours.carA);
    this.mTown = this.mAt(st.town.carA);
    this.xings = (R.crossings || []).map((k) => ({ k, m: this.mAt(k + 0.5) }));
    // consist offsets of each car's anchor from car_a (m, + = toward the town / SE)
    this.coaches = 1;
    this.leg = legProfile(this.mTown - this.mOurs, this.B.speed || 2.6, this.B.accel || 0.6, this.B.brake || 0.8);
    this.running = false;
    this.phase = 'atTown';
    this.t = 0;
    this.rate = 1;          // the clock slows to 0 while something blocks the track ahead
    this.blockedT = 0;
    this.listeners = [];
  }

  /** metres along the track at lattice i */
  mAt(i) { return (i - this.from) * S2; }
  /** lattice i at metres m */
  iAt(m) { return this.from + m / S2; }

  /** car anchors: [{ key, off }] engine first (NW) */
  consist() {
    const out = [{ key: 'train_engine', off: -2.34 }, { key: 'train_car_a', off: 0 }];
    let o = 0;
    for (let c = 1; c < this.coaches; c++) { o += 2.24; out.push({ key: 'train_car_a', off: o, extra: true }); }
    o += 2.24;
    out.push({ key: 'train_car_b', off: o });
    return out;
  }
  /** the train's extent along the track (m), from the engine's nose to the last car's tail */
  span(mA) { const c = this.consist(); return [mA + c[0].off - 1.3, mA + c[c.length - 1].off + 1.15]; }

  dur(phase) {
    if (phase === 'toOurs' || phase === 'toTown') return this.leg.T;
    if (phase === 'atOurs') return Math.max(2, this.B.dwellOurs || 14);
    return Math.max(2, this.B.dwellTown || 10);
  }
  cycle() { return this.leg.T * 2 + this.dur('atOurs') + this.dur('atTown'); }

  /** car_a position (m) at (phase, t) */
  mAtPhase(phase, t) {
    if (phase === 'toOurs') return this.mTown - this.leg.pos(t);
    if (phase === 'atOurs') return this.mOurs;
    if (phase === 'toTown') return this.mOurs + this.leg.pos(t);
    return this.mTown;
  }
  get m() { return this.mAtPhase(this.phase, this.t); }
  /** signed speed (m/s, + = toward the town) */
  get v() {
    if (this.phase === 'toOurs') return -this.leg.vel(this.t) * this.rate;
    if (this.phase === 'toTown') return this.leg.vel(this.t) * this.rate;
    return 0;
  }
  get moving() { return (this.phase === 'toOurs' || this.phase === 'toTown') && this.leg.vel(this.t) > 0.01; }
  /** seconds until the next arrival at a station (Infinity while dwelling) */
  untilArrival() { return this.phase === 'toOurs' || this.phase === 'toTown' ? this.leg.T - this.t : Infinity; }

  on(fn) { this.listeners.push(fn); }
  emit(ev, a, b) { for (const fn of this.listeners) { try { fn(ev, a, b); } catch (e) { console.error(e); } } }

  /** jump the timetable (tests, restore) */
  set(phase, t) {
    if (PHASES.indexOf(phase) < 0) phase = 'atTown';
    this.phase = phase;
    this.t = Math.max(0, Math.min(this.dur(phase) - 0.001, t || 0));
    this._whistled = false;
  }

  /** advance; `blocked(ahead)` -> true when something stands on the track in front of the train */
  update(dt, blocked) {
    if (!this.running) return;
    // something on the track ahead: ease the clock down (the train brakes), whistle, wait
    let stop = false;
    if (blocked && this.moving) {
      const dir = this.phase === 'toTown' ? 1 : -1;
      const sp = this.span(this.m);
      const nose = dir > 0 ? sp[1] : sp[0];
      const v = Math.abs(this.v);
      stop = blocked(nose, dir, (this.B.blockAhead || 1.5) + (v * v) / (2 * (this.B.brake || 0.8)));
    }
    if (stop) { this.rate = Math.max(0, this.rate - dt * 2.5); this.blockedT += dt; } else { this.rate = Math.min(1, this.rate + dt * 1.2); this.blockedT = 0; }
    let left = dt * this.rate;
    let guard = 8;
    while (left > 0 && guard-- > 0) {
      const d = this.dur(this.phase);
      const step = Math.min(left, d - this.t);
      // the whistle a little before each arrival
      const wb = this.B.whistleBefore !== undefined ? this.B.whistleBefore : 2.5;
      if ((this.phase === 'toOurs' || this.phase === 'toTown') && !this._whistled && d - (this.t + step) <= wb) { this._whistled = true; this.emit('whistle', this.phase === 'toOurs' ? 'ours' : 'town'); }
      this.t += step;
      left -= step;
      if (this.t >= d - 1e-9) {
        const prev = this.phase;
        this.phase = PHASES[(PHASES.indexOf(prev) + 1) % 4];
        this.t = 0;
        this._whistled = false;
        if (prev === 'toOurs') this.emit('arrive', 'ours');
        else if (prev === 'toTown') this.emit('arrive', 'town');
        else if (prev === 'atOurs') this.emit('depart', 'ours');
        else this.emit('depart', 'town');
      }
    }
  }

  /** is crossing k closed for walkers (a car on it, near it, or about to reach it)? */
  blocking(k) {
    if (!this.running) return false;
    const x = this.xings.find((q) => q.k === k);
    if (!x) return false;
    const sp = this.span(this.m);
    if (x.m > sp[0] - BLOCK_NEAR && x.m < sp[1] + BLOCK_NEAR) return true;
    const v = this.v;
    if (Math.abs(v) < 0.01) return false;
    // where the train will be in BLOCK_AHEAD seconds (the timetable is a pure function of the clock)
    let ph = this.phase, t = this.t + BLOCK_AHEAD;
    if (t > this.dur(ph)) { t = this.dur(ph); }
    const sp2 = this.span(this.mAtPhase(ph, t));
    const lo = Math.min(sp[0], sp2[0]), hi = Math.max(sp[1], sp2[1]);
    return x.m > lo - BLOCK_NEAR && x.m < hi + BLOCK_NEAR;
  }

  state() { return { phase: this.phase, t: Math.round(this.t * 100) / 100, m: Math.round(this.m * 100) / 100, running: this.running, rate: Math.round(this.rate * 100) / 100, coaches: this.coaches }; }
}

// =====================================================================================================================
// (v4.2, docs/v42_plan.md §5) RouteRail: the main line with a balloon loop at each end (RailPath). The engine always
// leads: at each station the train stops, pulls forward round the loop and leaves engine-first. Same public surface
// as Rail (Neighbours, Growth, DayClock, Occlusion, the tests): phase, t, running, v, m (= route metres of the nose),
// consist() ({ key, off, face, len } with off = metres behind the nose), span(), blocking(k), cycle(), untilArrival(),
// events arrive | depart | whistle, state(). Consist stages: 1 마을 (E + 객차 + 화물칸 + 무개화차), 2 읍 (+ 2nd 객차).
// =====================================================================================================================
import { RailPath } from './RailPath.js';

/** the units over couplers (m): lengthM, couplerM front (−) / back (+) from the anchor (docs/v42_plan.md §5.2) */
// ((v4.2 CODE-2, assets/train2 manifest trainConsist.couplerOverride) the engine's sprite draws its rear coupler hook
//  1.375 m behind its anchor (the town manifest says 1.22): with 1.22 the engine and the first coach overlapped and no
//  coupler gap showed; the train is 0.155 m longer)
export const UNITS = {
  train_engine: { len: 2.6, front: -1.38, back: 1.375 },
  train_coach: { len: 3.0, front: -1.5, back: 1.5, seats: true },
  train_boxcar: { len: 2.6, front: -1.3, back: 1.3, freight: 32 },
  train_flatcar: { len: 2.4, front: -1.2, back: 1.2, freight: 24 },
};
export const STAGES = {
  1: ['train_engine', 'train_coach', 'train_boxcar', 'train_flatcar'],
  2: ['train_engine', 'train_coach', 'train_coach', 'train_boxcar', 'train_flatcar'],
};

export class RouteRail {
  constructor(opts = {}) {
    const R = WORLD.v42.rail;
    this.def = R;
    this.path = new RailPath(R, WORLD.v4.G);
    this.from = R.from;
    this.to = R.to;
    this.B = Object.assign({}, (BALANCE.v4 && BALANCE.v4.train) || {}, (BALANCE.v42 && BALANCE.v42.train) || {}, opts);
    this.stops = WORLD.v42.stops;
    this.xings = (R.crossings || []).map((k) => ({ k, s: [this.path.sOfMain(k + 0.5, 1), this.path.sOfMain(k + 0.5, -1)] }));
    this.stage = 1;
    this.running = false;
    this.phase = 'atTown';
    this.t = 0;
    this.rate = 1;
    this.blockedT = 0;
    this.listeners = [];
    this.build();
  }

  /** (v4.1 readers) one coach on 마을, two on 읍 */
  get coaches() { return this.stage >= 2 ? 2 : 1; }
  set coaches(n) { this.setStage(n > 1 ? 2 : 1); }

  /** the consist of a stage + the stops and leg profiles it implies */
  build() {
    const keys = STAGES[this.stage] || STAGES[1];
    this.units = [];
    let off = 0, prevBack = 0;
    keys.forEach((key, n) => {
      const u = UNITS[key];
      off += n === 0 ? -u.front : prevBack - u.front;
      this.units.push({ key, off, face: 1, len: u.len, front: u.front, back: u.back, idx: n });
      prevBack = u.back;
    });
    const last = this.units[this.units.length - 1];
    this.length = last.off + last.back;
    const P = this.path;
    this.sOurs = P.sOfMain(Number(this.stops.ours[this.stage]) || -0.8, -1);
    this.sTown = P.sOfMain(Number(this.stops.town) || 31.6, 1);
    this.legTown = P.profile(this.sOurs, P.ahead(this.sOurs, this.sTown), this.length, this.B);
    this.legOurs = P.profile(this.sTown, P.ahead(this.sTown, this.sOurs), this.length, this.B);
    this.leg = this.legOurs;       // (v4.1 readers: leg.T = the leg into our station)
  }

  /** 1 마을 / 2 읍: the consist changes (keeps the phase; a running leg keeps its own clock fraction) */
  setStage(st) {
    st = st >= 2 ? 2 : 1;
    if (st === this.stage) return false;
    const frac = (this.phase === 'toOurs' || this.phase === 'toTown') ? this.t / Math.max(0.001, this.dur(this.phase)) : null;
    this.stage = st;
    this.build();
    if (frac !== null) this.t = frac * this.dur(this.phase);
    return true;
  }

  consist() { return this.units.map((u) => ({ key: u.key, off: u.off, face: u.face, len: u.len, idx: u.idx })); }
  /** route interval [tail, nose] (m, not wrapped: tail may be < 0) */
  span(m) { const s = m === undefined ? this.m : m; return [s - this.length, s]; }
  seats() { return this.units.filter((u) => UNITS[u.key].seats).length * (Number(this.B.coachSeats) || 16); }
  freightCap() { return this.units.reduce((a, u) => a + (UNITS[u.key].freight || 0), 0); }

  legOf(phase) { return phase === 'toTown' ? this.legTown : this.legOurs; }
  dur(phase) {
    if (phase === 'toOurs') return this.legOurs.T;
    if (phase === 'toTown') return this.legTown.T;
    if (phase === 'atOurs') return Math.max(2, this.B.dwellOurs || 12);
    return Math.max(2, this.B.dwellTown || 8);
  }
  cycle() { return this.legOurs.T + this.legTown.T + this.dur('atOurs') + this.dur('atTown'); }

  /** nose position (route m) at (phase, t) */
  mAtPhase(phase, t) {
    const P = this.path;
    if (phase === 'toOurs') return P.wrap(this.sTown + this.legOurs.pos(t));
    if (phase === 'toTown') return P.wrap(this.sOurs + this.legTown.pos(t));
    return phase === 'atOurs' ? this.sOurs : this.sTown;
  }
  get m() { return this.mAtPhase(this.phase, this.t); }
  /** speed along the route (m/s, ≥ 0) */
  get speed() { return (this.phase === 'toOurs' || this.phase === 'toTown') ? this.legOf(this.phase).vel(this.t) * this.rate : 0; }
  /** signed speed (+ = the leg toward the town, − = toward ours) */
  get v() { const s = this.speed; return this.phase === 'toTown' ? s : -s; }
  get moving() { return (this.phase === 'toOurs' || this.phase === 'toTown') && this.legOf(this.phase).vel(this.t) > 0.01; }
  untilArrival() { return this.phase === 'toOurs' || this.phase === 'toTown' ? this.dur(this.phase) - this.t : Infinity; }
  /** is any car on a curve now? */
  onCurve() { return this.path.onCurve(this.m, this.length); }

  /** screen point of route metre s (default: the nose) */
  point(s) { const o = this.path.at(s === undefined ? this.m : s); return { x: o.x, y: o.y, i: o.i, j: o.j }; }
  /** (v4.1 readers) lattice i of a route metre / route metre of a main-line i (toward ours) */
  iAt(m) { return this.path.at(m).i; }
  mAt(i) { return this.path.sOfMain(i, -1); }

  on(fn) { this.listeners.push(fn); }
  emit(ev, a, b) { for (const fn of this.listeners) { try { fn(ev, a, b); } catch (e) { console.error(e); } } }

  set(phase, t) {
    if (PHASES.indexOf(phase) < 0) phase = 'atTown';
    this.phase = phase;
    this.t = Math.max(0, Math.min(this.dur(phase) - 0.001, t || 0));
    this._whistled = false;
  }

  /** advance; `blocked(noseS, dist)` -> true when something stands on the route within dist metres ahead */
  update(dt, blocked) {
    if (!this.running) return;
    let stop = false;
    if (blocked && this.moving) {
      const v = this.speed;
      stop = blocked(this.m, (this.B.blockAhead || 1.5) + (v * v) / (2 * (this.B.brake || 0.8)));
    }
    if (stop) { this.rate = Math.max(0, this.rate - dt * 2.5); this.blockedT += dt; } else { this.rate = Math.min(1, this.rate + dt * 1.2); this.blockedT = 0; }
    let left = dt * this.rate;
    let guard = 8;
    while (left > 0 && guard-- > 0) {
      const d = this.dur(this.phase);
      const step = Math.min(left, d - this.t);
      const wb = this.B.whistleBefore !== undefined ? this.B.whistleBefore : 2.5;
      if ((this.phase === 'toOurs' || this.phase === 'toTown') && !this._whistled && d - (this.t + step) <= wb) { this._whistled = true; this.emit('whistle', this.phase === 'toOurs' ? 'ours' : 'town'); }
      const was = this.onCurveFlag;
      this.t += step;
      left -= step;
      // (the wheels squeal into a curve)
      if (this.phase === 'toOurs' || this.phase === 'toTown') { this.onCurveFlag = this.onCurve(); if (this.onCurveFlag && !was) this.emit('curve', this.phase === 'toOurs' ? 'town' : 'ours'); }
      if (this.t >= d - 1e-9) {
        const prev = this.phase;
        this.phase = PHASES[(PHASES.indexOf(prev) + 1) % 4];
        this.t = 0;
        this._whistled = false;
        if (prev === 'toOurs') this.emit('arrive', 'ours');
        else if (prev === 'toTown') this.emit('arrive', 'town');
        else if (prev === 'atOurs') this.emit('depart', 'ours');
        else this.emit('depart', 'town');
      }
    }
  }

  /** is crossing k closed for walkers? (a car on it or within BLOCK_NEAR, or the nose reaches it within BLOCK_AHEAD s) */
  blocking(k) {
    if (!this.running) return false;
    const x = this.xings.find((q) => q.k === k);
    if (!x) return false;
    const P = this.path, m = this.m;
    const v = this.speed;
    let ahead = 0;
    if (this.moving) { const L = this.legOf(this.phase); ahead = Math.max(0, L.pos(Math.min(L.T, this.t + BLOCK_AHEAD)) - L.pos(this.t)); }
    for (const s of x.s) {
      if (P.ahead(s, m) <= this.length + BLOCK_NEAR) return true;          // the crossing is under the train (or just behind the tail)
      if (P.ahead(m, s) <= BLOCK_NEAR + ahead) return true;                // the nose is near it / reaches it soon
    }
    void v;
    return false;
  }

  /** where the coach doors are while the train stands at `stop` (world px, on the platform edge j ≈ 1.0) */
  doorPoints() {
    const out = [];
    const P = this.path, m = this.m;
    for (const u of this.units) {
      if (!UNITS[u.key].seats) continue;
      // ((CODE-2) the train2 coach's doors are its end platforms' steps: ± 0.4 of its length (manifest doorPoints))
      for (const f of [-0.4, 0.4]) {
        const o = P.at(m - u.off + f * u.len);
        out.push({ x: P.G[0] + 64 * (o.i + 1.0), y: P.G[1] + 32 * (o.i - 1.0), i: o.i });
      }
    }
    return out;
  }

  state() {
    const p = this.path.at(this.m);
    return { phase: this.phase, t: Math.round(this.t * 100) / 100, m: Math.round(this.m * 100) / 100, running: this.running, rate: Math.round(this.rate * 100) / 100,
      coaches: this.coaches, stage: this.stage, nose: { i: +p.i.toFixed(2), j: +p.j.toFixed(2) }, curve: this.onCurve(), cycle: +this.cycle().toFixed(1), len: +this.length.toFixed(2) };
  }
}
