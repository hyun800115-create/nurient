// The coast line (harbor_runtime model, docs/v5_v8_plan.md D8 / §6.4 coastLine.js): a second little train on the
// same j = 0 track, east of the v4 line: 솔방울 동쪽 정거장 (halt, carA i 37.5) ↔ 항구역 (i 62) (↔ 해변역 i 94 when
// the beach module adds it). Push-pull like the main line (engine on the NW end), so the v4 `Train` view draws it
// unchanged: it reads `B`, `consist()`, `iAt()`, `m`, `v`, `running`. `blocking(k)` closes crossings like Rail.
// Pure (no Phaser). Positions are pure functions of the phase clock.

import { RAIL, COAST } from '../layout.js';

const S2 = Math.SQRT2;
const BLOCK_NEAR = 1.6;      // m: a crossing closes while a moving car is this close (Rail.js)
const STOP_NEAR = 0.4;       // m: ...but a train standing at a stop closes it only if it really stands on it
const BLOCK_AHEAD = 3;       // s: or will reach it within this time

/** trapezoid speed profile (Rail.legProfile: accelerate, cruise, brake) */
export function legProfile(D, vmax, acc, brk) {
  let v = vmax;
  let da = (v * v) / (2 * acc), db = (v * v) / (2 * brk);
  if (da + db > D) { v = Math.sqrt((2 * D * acc * brk) / (acc + brk)); da = (v * v) / (2 * acc); db = (v * v) / (2 * brk); }
  const t1 = v / acc, dc = Math.max(0, D - da - db), t2 = t1 + dc / v, T = t2 + v / brk;
  return {
    D, v, T,
    pos(t) { if (t <= 0) return 0; if (t >= T) return D; if (t < t1) return 0.5 * acc * t * t; if (t < t2) return da + v * (t - t1); const u = T - t; return D - 0.5 * brk * u * u; },
    vel(t) { if (t <= 0 || t >= T) return 0; if (t < t1) return acc * t; if (t < t2) return v; return brk * (T - t); },
  };
}

export class CoastLine {
  /** cfg: tuning.coast { dwell, speed, accel, brake, whistleBefore }; stops: ids in COAST.order (v6: halt, harbor) */
  constructor(cfg = {}, stops = ['halt', 'harbor']) {
    this.from = RAIL.from;
    this.B = { speed: cfg.speed || 2.6, accel: cfg.accel || 0.6, brake: cfg.brake || 0.8, whistleBefore: cfg.whistleBefore !== undefined ? cfg.whistleBefore : 2.5, dwell: cfg.dwell || 10, blockAhead: 1.5 };
    this.line = 'coast';
    this.coaches = 1;
    this.running = false;
    this.rate = 1;
    this.listeners = [];
    this.setStops(stops);
  }

  /** the stops served (west to east). The visit order ping-pongs: halt, harbor, (beach, harbor,) halt, ... */
  setStops(stops) {
    this.stops = COAST.order.filter((s) => stops.indexOf(s) >= 0);
    this.visits = this.stops.concat(this.stops.slice(1, -1).reverse());
    this.legs = this.visits.map((s, k) => {
      const a = this.mAt(COAST.stops[s].carA), b = this.mAt(COAST.stops[this.visits[(k + 1) % this.visits.length]].carA);
      return { from: s, to: this.visits[(k + 1) % this.visits.length], ma: a, mb: b, prof: legProfile(Math.abs(b - a), this.B.speed, this.B.accel, this.B.brake) };
    });
    this.k = 0;            // leg index (we dwell at legs[k].from, then run leg k)
    this.phase = 'dwell';
    this.t = 0;
    this._whistled = false;
  }

  mAt(i) { return (i - this.from) * S2; }
  iAt(m) { return this.from + m / S2; }
  /** car anchors engine first (NW): Rail.consist() with one coach */
  consist() { return COAST.consist.map((c) => ({ key: c.key, off: c.off })); }
  /** the train's extent along the track (m) for car_a at mA */
  span(mA) { const c = COAST.consist; return [mA + c[0].off - COAST.nose, mA + c[c.length - 1].off + COAST.tail]; }

  get leg() { return this.legs[this.k]; }
  get m() {
    const L = this.leg;
    if (this.phase === 'dwell') return L.ma;
    const d = L.prof.pos(this.t);
    return L.mb >= L.ma ? L.ma + d : L.ma - d;
  }
  /** signed speed (m/s, + = east, toward the harbour) */
  get v() {
    if (this.phase !== 'run') return 0;
    const L = this.leg, s = L.prof.vel(this.t) * this.rate;
    return L.mb >= L.ma ? s : -s;
  }
  get moving() { return this.phase === 'run' && this.leg.prof.vel(this.t) > 0.01; }
  /** the stop it stands at (null while running) */
  at() { return this.phase === 'dwell' ? this.leg.from : null; }
  /** where it goes next */
  heading() { return this.leg.to; }
  dur() { return this.phase === 'dwell' ? this.B.dwell : this.leg.prof.T; }
  /** one full round trip (s) */
  cycle() { let c = 0; for (const L of this.legs) c += L.prof.T + this.B.dwell; return c; }
  /** seconds until it next stands at `stop` (0 while there) */
  untilAt(stop) {
    if (this.phase === 'dwell' && this.leg.from === stop) return 0;
    let t = this.dur() - this.t, k = this.k, ph = this.phase;
    for (let g = 0; g < this.legs.length * 2 + 2; g++) {
      if (ph === 'dwell') { ph = 'run'; } else { k = (k + 1) % this.legs.length; ph = 'dwell'; if (this.legs[k].from === stop) return t; }
      t += ph === 'dwell' ? this.B.dwell : this.legs[k].prof.T;
    }
    return Infinity;
  }

  on(fn) { this.listeners.push(fn); }
  emit(ev, stop) { for (const fn of this.listeners) { try { fn(ev, stop, this.line); } catch (e) { /* the listener */ } } }

  start() { this.running = true; }

  /** advance; blocked(nose, dir, ahead) -> true when something stands on the track in front (Rail.update) */
  update(dt, blocked) {
    if (!this.running || !(dt > 0)) return;
    let stop = false;
    if (blocked && this.moving) {
      const dir = this.v > 0 ? 1 : -1, sp = this.span(this.m), v = Math.abs(this.v);
      stop = blocked(dir > 0 ? sp[1] : sp[0], dir, this.B.blockAhead + (v * v) / (2 * this.B.brake));
    }
    if (stop) this.rate = Math.max(0, this.rate - dt * 2.5); else this.rate = Math.min(1, this.rate + dt * 1.2);
    let left = this.phase === 'run' ? dt * this.rate : dt;
    let guard = 8;
    while (left > 1e-9 && guard-- > 0) {
      const d = this.dur(), step = Math.min(left, d - this.t);
      if (this.phase === 'run' && !this._whistled && d - (this.t + step) <= this.B.whistleBefore) { this._whistled = true; this.emit('whistle', this.leg.to); }
      this.t += step; left -= step;
      if (this.t >= d - 1e-9) {
        if (this.phase === 'dwell') { this.phase = 'run'; this.t = 0; this._whistled = false; this.emit('depart', this.leg.from); }
        else { this.k = (this.k + 1) % this.legs.length; this.phase = 'dwell'; this.t = 0; this.emit('arrive', this.leg.from); }
      }
    }
  }

  /** is crossing tile k closed for walkers / vehicles? (Rail.blocking: the crossing's centre against the train) */
  blocking(k) {
    if (!this.running || RAIL.crossings.indexOf(k) < 0) return false;
    const xm = this.mAt(k + 0.5), sp = this.span(this.m);
    // a train standing at a stop closes a crossing only if it stands on it; a moving one keeps 1.6 m clear
    const near = this.phase === 'dwell' ? STOP_NEAR : BLOCK_NEAR;
    if (xm > sp[0] - near && xm < sp[1] + near) return true;
    if (!this.moving) return false;
    // where it will be BLOCK_AHEAD s from now (within this leg)
    const L = this.leg, t2 = Math.min(L.prof.T, this.t + BLOCK_AHEAD), d = L.prof.pos(t2);
    const m2 = L.mb >= L.ma ? L.ma + d : L.ma - d, sp2 = this.span(m2);
    return xm > Math.min(sp[0], sp2[0]) - BLOCK_NEAR && xm < Math.max(sp[1], sp2[1]) + BLOCK_NEAR;
  }

  /** the halt / station a crossing serves is never covered by a standing train (test helper) */
  stopSpans() { return this.stops.map((s) => ({ stop: s, span: this.span(this.mAt(COAST.stops[s].carA)).map((m) => this.iAt(m)) })); }

  /** restore (a save does not keep the phase: the train restarts at the halt) */
  set(k, phase, t) { this.k = ((k | 0) % this.legs.length + this.legs.length) % this.legs.length; this.phase = phase === 'run' ? 'run' : 'dwell'; this.t = Math.max(0, Math.min(this.dur() - 0.001, t || 0)); }
  state() { return { at: this.at(), to: this.heading(), phase: this.phase, t: Math.round(this.t * 100) / 100, i: Math.round(this.iAt(this.m) * 100) / 100, running: this.running, cycle: Math.round(this.cycle() * 10) / 10 }; }
}
