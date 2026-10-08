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
