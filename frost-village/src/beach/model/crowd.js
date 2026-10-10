// The beach crowd (docs/v5_v8_plan.md §6.5 model/crowd.js): ≤ 60 people present, seeded per day; tourists from the
// ferries (via the coast train to 해변역), our townsfolk's day trips, hotel guests from the resort door, couples on
// the boardwalk at sunset. Each person follows a little plan of activities (scripts at 4 Hz): walk to a free slot
// (along the boardwalk / wet band and down the aisles, wading into the sea), play the slot's anim for a while, let it
// go, next. Transient and never saved: only counters are (arrived today / total). Conservation: arrived = present +
// left, always. Positions between steps are analytic (straight segments with t0 / t1), so the view moves people
// smoothly at any frame rate and the model stays cheap.
//
// Beachfolk compositor rules are honoured through `looks` (canPlay / pickAnim): an act whose anim a person cannot
// play is skipped, a water act whose picked anim is not a water anim never sends anyone into the sea (a ring wearer
// asked to swim floats instead: pickAnim swim → float).

import { stream } from './rng.js';
import { hourOf, dayOf, daylight } from './time.js';
import { ACTS, WATER_ANIMS } from './activities.js';
import { L, px2L, waterJ, ENTRY, AISLES, BOARDWALK, BUILDINGS } from '../layout.js';

const PX = (i, j) => { const p = L(i, j); return [Math.round(p[0]), Math.round(p[1])]; };
const DIRS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
/** 8-way facing for a screen vector (ground-plane angle: dy counts double in iso) */
export function dirOf(dx, dy) {
  if (Math.abs(dx) + Math.abs(dy) < 1e-6) return 'S';
  const a = Math.atan2(2 * dy, dx);
  const k = Math.round(a / (Math.PI / 4));
  return DIRS[(k + 8) % 8];
}

/** group kinds: who comes, which looks, which plans */
export const GROUPS = {
  family: { w: 5, src: ['local', 'ferry', 'guest'] },
  couple: { w: 4, src: ['ferry', 'guest', 'local'] },
  friends: { w: 2, src: ['local', 'ferry'] },
  solo: { w: 3, src: ['local', 'ferry'] },
  surfer: { w: 1.4, src: ['local', 'ferry'], need: 'shop:surf_shop' },
  elders: { w: 1.2, src: ['ferry', 'local', 'guest'] },
};
const PLANS = {
  kid: [['dig', 'splash', 'icecream', 'swim', 'dig'], ['splash', 'dig', 'swim', 'icecream', 'splash'], ['dig', 'icecream', 'splash', 'dig', 'swim']],
  parent: [['sunbathe', 'swim', 'sit', 'icecream', 'sunbathe'], ['sit', 'splash', 'sunbathe', 'shop', 'swim'], ['sunbathe', 'shop', 'swim', 'sunbathe']],
  couple: [['sunbathe', 'swim', 'shower', 'shop', 'sit'], ['photo', 'stroll', 'sunbathe', 'swim', 'sit'], ['swim', 'sunbathe', 'watch', 'sit']],
  friends: [['volley', 'swim', 'icecream', 'volley', 'splash'], ['volley', 'splash', 'swim', 'sit']],
  solo: [['swim', 'sunbathe', 'shower', 'swim'], ['photo', 'stroll', 'shop', 'watch', 'sit'], ['kite', 'swim', 'sunbathe'], ['sunbathe', 'swim', 'icecream']],
  surfer: [['surf', 'surf', 'sit', 'surf']],
  elder: [['stroll', 'sit', 'watch', 'shop'], ['sit', 'stroll', 'sunbathe', 'shop']],
  guest: [['pool', 'poolLie', 'swim', 'sunbathe', 'shop'], ['poolLie', 'pool', 'sit', 'swim'], ['sunbathe', 'pool', 'shop', 'watch']],
  sunset: [['stroll', 'gaze', 'stroll', 'gaze']],
};
const PRESET = { couple: ['sunbather', 'beach_tourist'], friends: ['swimmer'], solo: ['swimmer', 'sunbather', 'beach_tourist'], surfer: ['surfer'], elders: ['beach_tourist'], sunset: ['beach_tourist', 'sunbather'] };

export class Crowd {
  /** m: the BeachModel (slots, tuning, looks, ok(need), resort, emit) */
  constructor(m, saved) {
    this.m = m;
    this.list = [];
    this.byId = new Map();
    this.nextId = 1; this.nextGid = 1;
    this.arrived = 0; this.left = 0;
    this.today = saved ? saved.today | 0 : 0;
    this.total = saved ? saved.total | 0 : 0;
    this.day = saved ? saved.day | 0 : -1;
    this.queue = [];                  // pending arrivals [{ T, n, src, at }]
    this.localT = null;               // next local day trip
    this.sunsetDay = -1;
    this.court = { players: [], on: false, rally: null, until: 0, serve: 0, holder: -1, n: 0 };
    this.cart = { next: 0 };
    this.shopQ = {};
  }
  T() { return this.m.T; }
  get cfg() { return this.m.cfg; }
  present() { return this.list.length; }
  /** people in the sea or on their way into it (the swimmer cap counts both) */
  inWater() { let n = 0; for (const v of this.list) if (v.wet || (v.next && ACTS[v.next.kind] && ACTS[v.next.kind].water) || (v.act && ACTS[v.act.kind] && ACTS[v.act.kind].water)) n++; return n; }
  lying() { let n = 0; for (const v of this.list) { const k = v.act ? v.act.kind : v.next ? v.next.kind : null; if (k === 'sunbathe' || k === 'poolLie') n++; } return n; }

  // ------------------------------------------------------------------------------------------ arrivals
  /** a ferry docked with n passengers: a share comes to the beach on the coast train */
  onFerry(n, T) {
    if (!this.m.isOpen()) return 0;
    const k = Math.round(n * this.cfg.crowd.ferryShare * this.weekK());
    if (k <= 0) return 0;
    const R = stream(this.m.seed, 'ferry:' + Math.round(T));
    const [a, b] = this.cfg.crowd.trainDelay;
    this.queue.push({ T: T + R.range(a, b), n: k, src: 'ferry', at: 'station' });
    return k;
  }
  /** a coast train stopped at 해변역 with n riders who were not counted from a ferry yet */
  onTrain(n, T) { if (this.m.isOpen() && n > 0) this.queue.push({ T, n, src: 'ferry', at: 'station' }); }
  weekK() { return this.m.events && this.m.events.weekOn(this.T()) ? this.cfg.crowd.weekCrowd : 1; }

  /** local day trips: a seeded Poisson stream per day, busier 10–17 h, scaled by the beach's stars */
  locals(T) {
    if (!this.m.isOpen()) return;
    const d = dayOf(T), h = hourOf(T);
    if (this.localT === null || this.localT < T - 600) this.localT = T + 5;
    if (T < this.localT) return;
    const R = stream(this.m.seed, 'local:' + d + ':' + Math.floor(T));
    const live = this.cfg.live;
    const busy = h >= live.busyFrom && h < live.busyTo ? 1 : 0.35 * daylight(h);
    const rate = (this.cfg.crowd.localsPerHour[Math.min(3, this.m.stars)] || 0) * busy * this.weekK();   // groups per game hour
    const gap = rate > 0.01 ? (-Math.log(1 - R.next() * 0.999) / rate) * 25 : 60;
    this.localT = T + Math.max(4, gap);
    if (busy > 0.05 && h < 18) this.queue.push({ T, n: 0, src: 'local', at: R.chance(0.7) ? 'gate' : 'east' });
  }

  /** hotel guests come down to the beach and the pool during the day */
  guests(T) {
    const r = this.m.resort;
    if (!r || !r.hotel.level) return;
    const h = hourOf(T);
    if (h < 9 || h >= 17.5) return;
    if (!this.guestT || this.guestT < T - 300) this.guestT = T + 3;
    if (T < this.guestT) return;
    const occ = r.roomsBooked();
    const R = stream(this.m.seed, 'guest:' + Math.floor(T));
    const outNow = this.list.filter((v) => v.src === 'guest').length;
    this.guestT = T + 18 + R.next() * 30 / Math.max(0.3, occ / 6);
    if (occ > 0 && outNow < Math.min(16, occ * 1.5)) this.queue.push({ T, n: 0, src: 'guest', at: 'hotel' });
  }

  /** couples stroll the boardwalk at sunset */
  sunset(T) {
    const h = hourOf(T), d = dayOf(T);
    if (h < 17.6 || h > 19.5 || this.sunsetDay === d || !this.m.isOpen()) return;
    this.sunsetDay = d;
    const R = stream(this.m.seed, 'sunset:' + d);
    const n = 2 + R.int(2);
    for (let k = 0; k < n; k++) this.queue.push({ T: T + k * 9 + R.range(0, 6), n: 0, src: 'sunset', at: R.chance(0.5) ? 'gate' : 'east', kind: 'sunset' });
  }

  /** spawn queued arrivals (≤ present cap) */
  spawnDue(T) {
    if (!this.queue.length) return;
    this.queue.sort((a, b) => a.T - b.T);
    const cap = this.cfg.live.present;
    while (this.queue.length && this.queue[0].T <= T) {
      const q = this.queue[0];
      if (this.list.length >= cap - 1) { if (q.src === 'ferry') { q.T = T + 20; if (T - (q.t0 || (q.t0 = T)) > 240) this.queue.shift(); } else this.queue.shift(); break; }
      this.queue.shift();
      if (q.src === 'ferry') {
        // split the riders into parties of 1–4
        let n = q.n;
        const R = stream(this.m.seed, 'party:' + Math.round(q.T * 10));
        while (n > 0 && this.list.length < cap - 1) {
          const kind = this.pickKind(R, 'ferry');
          const g = this.spawnGroup(kind, q.src, q.at, T, R);
          n -= g ? g.length : n;
        }
      } else {
        const R = stream(this.m.seed, 'grp:' + this.nextGid + ':' + Math.round(q.T * 10));
        this.spawnGroup(q.kind || this.pickKind(R, q.src), q.src, q.at, T, R);
      }
    }
  }

  pickKind(R, src) {
    const t = {};
    for (const k in GROUPS) { const g = GROUPS[k]; if (g.src.indexOf(src) < 0 || (g.need && !this.m.ok(g.need))) continue; t[k] = g.w; }
    if (src === 'guest') t.couple = (t.couple || 0) + 2;
    return R.weighted(t);
  }

  /** people of a group (looks through the beachfolk generator) */
  spawnGroup(kind, src, at, T, R) {
    const looks = this.m.looks, gid = this.nextGid++;
    let people = [];
    if (kind === 'family') people = looks.family(R);
    else {
      const n = kind === 'couple' || kind === 'elders' || kind === 'sunset' ? 2 : kind === 'friends' ? (R.chance(0.6) ? 4 : 2) : kind === 'surfer' ? 1 + (R.chance(0.3) ? 1 : 0) : 1;
      const pre = PRESET[kind] || ['beach_tourist'];
      for (let k = 0; k < n; k++) people.push(looks.make(pre[k % pre.length], R));
    }
    if (!people.length) return null;
    if (this.list.length + people.length > this.cfg.live.present) people = people.slice(0, Math.max(0, this.cfg.live.present - this.list.length));
    if (!people.length) return null;
    const start = this.entry(at, R);
    const stayH = this.cfg.crowd.stayHours;
    const leaveT = src === 'sunset' ? T + 70 : T + 25 * (stayH[0] + R.next() * (stayH[1] - stayH[0]));
    const camp = kind === 'family' || kind === 'couple' || src === 'guest' ? this.pickCamp(R) : null;
    const out = [];
    people.forEach((person, k) => {
      const age = looks.ageOf(person);
      const role = src === 'sunset' ? 'sunset' : src === 'guest' && this.m.ok('pool') && age !== 'child' ? 'guest' : kind === 'family' ? (age === 'child' ? 'kid' : 'parent')
        : kind === 'elders' ? 'elder' : kind === 'surfer' ? 'surfer' : kind === 'friends' ? 'friends' : kind === 'couple' ? 'couple' : 'solo';
      const plans = PLANS[role] || PLANS.solo;
      const plan = plans[R.int(plans.length)].slice();
      const v = {
        id: this.nextId++, gid, kind, src, role, person, age, plan, pi: 0, camp,
        x: start[0] + (k % 2 ? 14 : -10) * (k ? 1 : 0), y: start[1] + k * 8, mode: 'idle', segs: [], act: null, next: null,
        anim: 'idle', dir: 'S', wet: false, arriveT: T, leaveT, slot: null, seed: R.int(1e9), say: null,
      };
      if (src === 'guest' && at === 'hotel') v.homeAt = 'hotel';
      this.list.push(v); this.byId.set(v.id, v);
      out.push(v);
    });
    this.arrived += out.length; this.today += out.length; this.total += out.length;
    this.m.emit({ t: 'beach:arrive', n: out.length, src, kind, gid });
    // friends try the volleyball court first (all at once)
    if (kind === 'friends' && out.length >= 2 && this.courtFree()) this.joinCourt(out, T);
    for (const v of out) if (v.mode === 'idle') this.nextAct(v, T);
    return out;
  }

  entry(at, R) {
    if (at === 'hotel') { const b = BUILDINGS.find((x) => x.key === 'resort_hotel'); const d = this.m.defs.resort_hotel; const [x, y] = PX(b.i, b.j); return d && d.doorPoint ? [x + d.doorPoint[0] - 12, y + d.doorPoint[1] + 30] : [x, y + 60]; }
    const e = at === 'east' ? ENTRY.east : ENTRY.gateIn;
    const [x, y] = PX(e[0], e[1] + (R ? R.range(-0.2, 0.2) : 0));
    return [x, y];
  }
  exitPoint(v) {
    if (v.homeAt === 'hotel' || v.src === 'guest') return this.entry('hotel');
    const R = stream(this.m.seed, 'exit:' + v.id);
    return this.entry(R.chance(0.75) ? 'gate' : 'east', R);
  }
  pickCamp(R) {
    const camps = {};
    for (const s of this.m.slots.of('lie')) if (s.camp && this.m.ok(s.need)) camps[s.camp] = (camps[s.camp] || 0) + (this.m.slots.isFree(s) ? 1 : 0);
    const free = Object.keys(camps).filter((c) => camps[c] >= 1 && !this.list.some((v) => v.camp === c));
    return free.length ? free[R.int(free.length)] : null;
  }

  // ------------------------------------------------------------------------------------------ plans
  nextAct(v, T) {
    const m = this.m, h = hourOf(T);
    this.releaseSlot(v);
    const late = T >= v.leaveT || (h >= 18.4 && v.src !== 'sunset') || h >= 20.5 || h < 6 || m.closingAll;
    while (!late && v.pi < v.plan.length) {
      const kind = v.plan[v.pi++];
      if (this.startAct(v, kind, T)) return;
    }
    this.leave(v, T);
  }

  /** try to begin act `kind`: find and take a slot, walk there; false when it cannot happen now */
  startAct(v, kind, T) {
    const m = this.m, A = ACTS[kind];
    if (kind === 'gaze') return this.gaze(v, T);
    if (!A) return false;
    if (A.need && !m.ok(A.need)) return false;
    if (A.kid && v.age !== 'child') return false;
    if (A.guest && v.src !== 'guest') return false;
    // the beachfolk rules: what will really play?
    const play = m.looks.pickAnim(v.person, A.anim);
    if (A.water && !WATER_ANIMS.has(play)) return false;
    if (!A.water && A.anim !== 'idle' && A.anim !== 'walk' && A.anim !== 'wave' && play !== A.anim) return false;
    const live = this.cfg.live;
    if (A.water && this.inWater() >= live.swimmers) return false;
    if ((kind === 'sunbathe' || kind === 'poolLie') && this.lying() >= live.sunbathers) return false;
    if (kind === 'stroll') { this.stroll(v, T); return true; }
    if (kind === 'volley') return false;          // only as a group (joinCourt on arrival)
    if (kind === 'icecream') return this.joinCart(v, T);
    let slots;
    const ok = (need) => m.ok(need);
    if (kind === 'shop') {
      const open = m.resort ? m.resort.openShops() : [];
      if (!open.length) return false;
      const R = stream(m.seed, 'shop:' + v.id + ':' + v.pi);
      const sh = open[R.int(open.length)];
      slots = m.slots.free('queue:shop', ok, v.x, v.y, (s) => s.shop === sh);
    } else {
      slots = m.slots.free(A.slot, ok, v.x, v.y, v.camp && (kind === 'sunbathe') ? (s) => s.camp === v.camp || !s.camp : null);
      if (v.camp && kind === 'sunbathe') { const mine = slots.filter((s) => s.camp === v.camp); if (mine.length) slots = mine; }
      if (kind === 'dig' && v.camp) { const cx = v.x, cy = v.y; slots.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)); }
    }
    if (!slots || !slots.length) return false;
    // a little variety: not always the nearest (the water spreads wider: swimmers fan out along the buoys, not only
    // off the nearest camp)
    const R = stream(m.seed, 'pick:' + v.id + ':' + v.pi);
    const s = slots[Math.min(slots.length - 1, R.int(Math.min(A.water ? 9 : 3, slots.length)))];
    if (!m.slots.take(s, v.id)) return false;
    v.slot = s;
    const dur = this.cfg.acts[A.dur] || [10, 20];
    v.next = { kind, until: 0, dur: dur[0] + R.next() * (dur[1] - dur[0]), anim: play, dir: s.dir, slot: s.id };
    if (kind === 'swim' || kind === 'pool') v.next.dir = this.swimDir(v, s, R);
    if (kind === 'surf') { v.next.anim = play; v.next.dir = 'SE'; }
    this.goTo(v, s, T);
    return true;
  }

  swimDir(v, s, R) { return ['SW', 'S', 'SE', 'E', 'NE', 'SW', 'S'][R.int(7)]; }

  // ------------------------------------------------------------------------------------------ movement
  /** build the path to a slot (land aisles, wading at the edge, swimming beyond) and start moving */
  goTo(v, s, T) {
    const pts = this.pathTo(v, s.x, s.y, s.kind);
    this.move(v, pts, T);
  }

  /** waypoints [[x, y, anim]] from v's position to (x, y); water kinds wade / swim the last part */
  pathTo(v, x, y, kind) {
    const [fi, fj] = px2L(v.x, v.y), [ti, tj] = px2L(x, y);
    const out = [];
    const fromWater = fj < waterJ(fi) - 0.05, toWater = tj < waterJ(ti) - 0.05;
    const pool = kind === 'pool' || kind === 'poolLie' || kind === 'balcony';
    if (pool || v.homeAt === 'hotel' && fj > -12.3) {
      // the hotel side (pool deck / door): straight over the deck
      out.push([x, y, 'walk']);
      return out;
    }
    let ci = fi, cj = fj;
    if (fromWater) {
      // swim / wade back to the edge at this i
      const wj = waterJ(fi) + 0.18;
      const [ex, ey] = PX(fi, wj);
      out.push([ex, ey, v.wetAnim || 'swim']);
      cj = wj;
    }
    const near = (i) => AISLES.reduce((b, a) => (Math.abs(a - i) < Math.abs(b - i) ? a : b), AISLES[0]);
    const landJ = toWater ? waterJ(ti) + 0.18 : tj;
    const landI = toWater ? ti : ti;
    if (Math.abs(ci - landI) > 1.3 && !(cj < -18.5 && landJ < -18.5)) {
      // up / down an aisle, along the boardwalk edge or the wet band, down the target's aisle
      const a1 = near(ci), a2 = near(landI);
      const rowJ = (cj + landJ) / 2 < -16.0 ? -18.95 : BOARDWALK.j - 0.05;
      const way = [[a1, cj], [a1, rowJ], [a2, rowJ], [a2, landJ]];
      for (const [i, j] of way) { const [px, py] = PX(i, j); const q = out[out.length - 1] || [v.x, v.y]; if (Math.abs(px - q[0]) + Math.abs(py - q[1]) > 4) out.push([px, py, 'walk']); }
    }
    if (toWater) {
      const [ex, ey] = PX(ti, landJ);
      const q = out[out.length - 1] || [v.x, v.y];
      if (Math.abs(ex - q[0]) + Math.abs(ey - q[1]) > 4) out.push([ex, ey, 'walk']);
      out.push([x, y, kind === 'splash' ? 'walk' : 'swimgo']);
    } else out.push([x, y, 'walk']);
    return out;
  }

  /** start moving along waypoints: segments with times (walk 70 px/s, wade 40, swim 26) */
  move(v, pts, T) {
    const C = this.cfg.crowd;
    v.segs = [];
    let x = v.x, y = v.y, t = T;
    for (const [px, py, kind] of pts) {
      const d = Math.hypot(px - x, py - y);
      if (d < 0.5) continue;
      const swim = kind === 'swim' || kind === 'swimgo';
      const sp = swim ? C.swim : kind === 'wade' ? C.wade : C.walk;
      const dur = d / sp;
      const anim = swim ? this.m.looks.pickAnim(v.person, 'swim') : 'walk';
      v.segs.push({ x0: x, y0: y, x1: px, y1: py, t0: t, t1: t + dur, anim, dir: dirOf(px - x, py - y), wet: swim });
      x = px; y = py; t += dur;
    }
    v.mode = 'move';
    if (!v.segs.length) this.arrive(v, T);
  }

  posAt(v, T) {
    if (v.mode === 'move' && v.segs.length) {
      for (const s of v.segs) {
        if (T <= s.t1) { const f = s.t1 > s.t0 ? Math.max(0, (T - s.t0) / (s.t1 - s.t0)) : 1; return { x: s.x0 + (s.x1 - s.x0) * f, y: s.y0 + (s.y1 - s.y0) * f, anim: s.anim, dir: s.dir, wet: s.wet }; }
      }
      const s = v.segs[v.segs.length - 1];
      return { x: s.x1, y: s.y1, anim: s.anim, dir: s.dir, wet: s.wet };
    }
    return { x: v.x, y: v.y, anim: v.anim, dir: v.dir, wet: v.wet };
  }

  /** the end of a walk: start the planned act, or leave */
  arrive(v, T) {
    const n = v.next;
    v.segs = [];
    if (v.leaving) { this.gone(v); return; }
    if (!n) { this.nextAct(v, T); return; }
    v.next = null;
    const s = v.slot;
    if (s) { v.x = s.x; v.y = s.y; }
    v.mode = 'act';
    v.act = { kind: n.kind, t0: T, until: T + n.dur, slot: s ? s.id : null, phase: 0 };
    v.anim = n.anim; v.dir = n.dir;
    v.wet = WATER_ANIMS.has(n.anim);
    v.wetAnim = v.wet ? n.anim : null;
    if (n.kind === 'swim' && this.m.lifeguardOn()) {
      const R = stream(this.m.seed, 'drift:' + v.id + ':' + Math.floor(T));
      if (R.chance(this.cfg.lifeguard.driftChance * 4)) v.act.drift = T + n.dur * (0.3 + R.next() * 0.4);
    }
    if (n.kind === 'surf') this.surfRide(v, s, T);
    if (n.kind === 'shop') v.act.buyAt = T + n.dur * 0.6;
    if (n.kind === 'photo') this.m.emit({ t: 'beach:fx', kind: 'photo', x: v.x, y: v.y - 60, at: T + 1.2 });
    if (n.kind === 'watch') this.m.resort && this.m.resort.ticket(v, T);
  }

  /** surfers ride the lane: board out, ride SE along the swell, paddle back NW, ride again */
  surfRide(v, s, T) {
    const C = this.cfg.crowd;
    const len = Math.hypot(s.x1 - s.x, s.y1 - s.y);
    const ride = len / 60, back = len / C.swim;
    v.act.ride = { t0: T, ride, back, x0: s.x, y0: s.y, x1: s.x1, y1: s.y1 };
    v.act.until = T + Math.max(v.act.until - T, ride + back + 2);
  }

  stroll(v, T) {
    const R = stream(this.m.seed, 'stroll:' + v.id + ':' + v.pi);
    const i = BOARDWALK.i0 + 1 + R.next() * (BOARDWALK.i1 - BOARDWALK.i0 - 2), j = BOARDWALK.j + R.range(-0.25, 0.25);
    const [x, y] = PX(i, j);
    const pts = this.pathTo(v, x, y, 'walk');
    v.next = { kind: 'stroll', dur: 1 + R.next() * 3, anim: 'idle', dir: R.chance(0.5) ? 'SW' : 'S' };
    v.slot = null;
    this.move(v, pts, T);
  }

  /** sunset couples stand at the boardwalk edge facing the sea */
  gaze(v, T) {
    const R = stream(this.m.seed, 'gaze:' + v.gid);
    const i = 94 + R.next() * 24, k = this.list.filter((o) => o.gid === v.gid).indexOf(v);
    const [x, y] = PX(i + k * 0.42, BOARDWALK.j - 0.62);
    v.next = { kind: 'gaze', dur: 14 + R.next() * 10, anim: 'idle', dir: 'SW' };
    v.slot = null;
    this.move(v, this.pathTo(v, x, y, 'walk'), T);
    if (k === 0) this.m.emit({ t: 'beach:emote', vid: v.id, key: 'emote_heart', at: T + 3 });
    return true;
  }

  releaseSlot(v) { if (v.slot) { this.m.slots.release(v.slot, v.id); v.slot = null; } }

  leave(v, T) {
    this.releaseSlot(v);
    this.dropCourt(v); this.dropCart(v);
    v.leaving = true;
    v.next = null;
    const [x, y] = this.exitPoint(v);
    this.move(v, this.pathTo(v, x, y, 'walk'), T);
  }

  gone(v) {
    this.releaseSlot(v);
    this.dropCourt(v); this.dropCart(v);
    v.mode = 'gone';
    const k = this.list.indexOf(v);
    if (k >= 0) this.list.splice(k, 1);
    this.byId.delete(v.id);
    this.left++;
    this.m.emit({ t: 'beach:leave', n: 1, vid: v.id, gid: v.gid });
  }

  // ------------------------------------------------------------------------------------------ volleyball (a group act)
  courtFree() { return this.m.ok('shop:surf_shop') && !this.court.players.length && this.m.slots.of('ball').length >= 4 && this.m.slots.of('ball').every((s) => this.m.slots.isFree(s)); }
  joinCourt(people, T) {
    const slots = this.m.slots.of('ball').slice().sort((a, b) => a.ord - b.ord);
    const order = people.length >= 4 ? [0, 2, 1, 3] : [0, 3];
    const R = stream(this.m.seed, 'volley:' + people[0].gid);
    const dur = this.cfg.acts.volley;
    const until = T + 6 + dur[0] + R.next() * (dur[1] - dur[0]);
    this.court = { players: [], on: false, rally: null, until, holder: -1, n: 0, gid: people[0].gid };
    people.slice(0, order.length).forEach((v, k) => {
      const s = slots[order[k]];
      if (!this.m.slots.take(s, v.id)) return;
      v.slot = s;
      v.next = { kind: 'volley', dur: until - T + 1, anim: 'idle', dir: s.dir, slot: s.id };
      this.court.players.push(v.id);
      this.goTo(v, s, T);
    });
  }
  dropCourt(v) {
    const c = this.court, k = c.players.indexOf(v.id);
    if (k < 0) return;
    c.players.splice(k, 1);
    if (c.players.length < 2) { for (const id of c.players) { const o = this.byId.get(id); if (o && o.act && o.act.kind === 'volley') o.act.until = 0; } this.court = { players: [], on: false, rally: null, until: 0, holder: -1, n: 0 }; }
  }
  /** the rally: throw (release on ball_throw frame 3 = +0.3 s), 0.85 s flight, catch (ball_catch impact frame 2 = arrival) */
  stepCourt(T) {
    const c = this.court;
    if (!c.players.length) return;
    const ps = c.players.map((id) => this.byId.get(id)).filter(Boolean);
    const ready = ps.length >= 2 && ps.every((v) => v.mode === 'act' && v.act.kind === 'volley');
    if (!ready) return;
    if (T >= c.until) { for (const v of ps) v.act.until = T; this.court = { players: [], on: false, rally: null, until: 0, holder: -1, n: 0 }; return; }
    if (!c.on) { c.on = true; c.holder = 0; c.rally = { from: ps[0].id, to: ps[ps.length > 2 ? 1 : 1].id, tT: T + 0.4, tR: T + 0.7, tA: T + 1.55 }; this.m.emit({ t: 'beach:ball', op: 'throw', ...c.rally }); return; }
    const r = c.rally;
    if (r && T >= r.tA + 0.65) {
      // the catcher throws to someone on the other side
      const catcher = this.byId.get(r.to);
      const from = catcher || ps[0];
      const side = from.slot ? from.slot.side : 0;
      const other = ps.filter((v) => v.slot && v.slot.side !== side);
      const R = stream(this.m.seed, 'rally:' + c.gid + ':' + c.n++);
      const to = other.length ? other[R.int(other.length)] : ps.find((v) => v !== from);
      const fly = 0.75 + R.next() * 0.25;
      c.rally = { from: from.id, to: to.id, tT: T, tR: T + 0.3, tA: T + 0.3 + fly };
      this.m.emit({ t: 'beach:ball', op: 'throw', ...c.rally });
    }
  }

  // ------------------------------------------------------------------------------------------ the ice-cream cart queue
  joinCart(v, T) {
    const q = this.m.slots.queue('cart');
    if (!q.length || !this.m.ok('shop:icecream_shop')) return false;
    const free = q.filter((s) => this.m.slots.isFree(s));
    if (!free.length) return false;
    // stand at the end of the line (the first free place after everyone queued)
    const s = free[0];
    if (!this.m.slots.take(s, v.id)) return false;
    v.slot = s;
    v.next = { kind: 'icecream', dur: 60, anim: 'idle', dir: s.dir, slot: s.id };
    this.goTo(v, s, T);
    return true;
  }
  dropCart(v) { /* the queue advances in stepCart */ }
  /** the vendor serves the front of the line every few seconds; the others step forward */
  stepCart(T) {
    const q = this.m.slots.queue('cart');
    if (!q.length) return;
    const front = q[0].by ? this.byId.get(q[0].by) : null;
    if (front && front.mode === 'act' && front.act.kind === 'icecream') {
      if (!this.cart.next || this.cart.next < T - 30) this.cart.next = T + 3.2;
      if (T >= this.cart.next) {
        this.cart.next = T + 3.6;
        front.act.until = T;
        front.anim = 'happy'; front.dir = 'SW';
        const coins = this.m.resort ? this.m.resort.sell('icecream_shop', front, T) : 0;
        this.m.emit({ t: 'beach:treat', vid: front.id, x: front.x, y: front.y, coins, key: 'emote_star' });
      }
    }
    // step forward
    for (let k = 0; k < q.length - 1; k++) {
      if (q[k].by) continue;
      const behind = q[k + 1].by ? this.byId.get(q[k + 1].by) : null;
      if (behind && behind.mode === 'act' && behind.act.kind === 'icecream') {
        this.m.slots.release(q[k + 1], behind.id);
        this.m.slots.take(q[k], behind.id);
        behind.slot = q[k];
        behind.next = { kind: 'icecream', dur: 60, anim: 'idle', dir: q[k].dir, slot: q[k].id };
        this.move(behind, [[q[k].x, q[k].y, 'walk']], T);
      }
    }
  }

  // ------------------------------------------------------------------------------------------ the 4 Hz step
  step(T) {
    const d = dayOf(T);
    if (d !== this.day) { this.day = d; this.today = 0; }
    this.locals(T); this.guests(T); this.sunset(T);
    this.spawnDue(T);
    for (let k = this.list.length - 1; k >= 0; k--) {
      const v = this.list[k];
      if (v.mode === 'move') {
        while (v.segs.length && T >= v.segs[0].t1) { const s = v.segs.shift(); v.x = s.x1; v.y = s.y1; v.wet = s.wet; v.dir = s.dir; }
        if (!v.segs.length) this.arrive(v, T);
        continue;
      }
      if (v.mode !== 'act') { if (v.mode === 'idle') this.nextAct(v, T); continue; }
      const a = v.act;
      if (a.drift && T >= a.drift) { this.driftOut(v, T); continue; }
      if (a.buyAt && T >= a.buyAt) { a.buyAt = 0; if (this.m.resort) this.m.resort.sell(v.slot && v.slot.shop, v, T); }
      if (a.kind === 'volley' || a.kind === 'icecream') { if (T >= a.until) this.endAct(v, T); continue; }
      if (T >= a.until) this.endAct(v, T);
    }
    this.stepCourt(T);
    this.stepCart(T);
  }

  endAct(v, T) {
    const kind = v.act ? v.act.kind : null;
    v.act = null;
    v.mode = 'idle';
    if (kind === 'volley') this.dropCourt(v);
    v.anim = 'idle';
    // out of the water: a short shake-off before the next thing
    this.nextAct(v, T);
  }

  /** a swimmer drifts past the buoys; the lifeguard whistles (≤ 1 per whistleGap); they swim back */
  driftOut(v, T) {
    const a = v.act; a.drift = 0;
    const [i, j] = px2L(v.x, v.y);
    const [ox, oy] = PX(i - 0.3, -21.75);
    const back = [v.x, v.y];
    const rest = Math.max(4, a.until - T);
    v.next = { kind: a.kind, dur: rest, anim: v.anim, dir: v.dir, slot: a.slot };
    this.move(v, [[ox, oy, 'swim'], [back[0], back[1], 'swim']], T);
    const tOut = v.segs.length ? v.segs[0].t1 : T;
    this.m.lifeguardWhistle(v, tOut);
  }

  /** everyone heads home (night, a ceremony that needs the beach, or tests) */
  closeAll(T) { for (const v of this.list.slice()) if (!v.leaving) this.leave(v, T); }

  /** invariants for the tests */
  check() {
    if (this.arrived !== this.list.length + this.left) return 'conservation ' + this.arrived + ' != ' + this.list.length + ' + ' + this.left;
    if (this.list.length > this.cfg.live.present) return 'present ' + this.list.length;
    const holders = new Map();
    for (const s of this.m.slots.list) if (s.by) { if (!this.byId.has(s.by)) return 'slot ' + s.id + ' held by gone ' + s.by; holders.set(s.by, (holders.get(s.by) || 0) + 1); }
    for (const [id, n] of holders) if (n > 1) return 'person ' + id + ' holds ' + n + ' slots';
    for (const v of this.list) if (v.wet && v.anim && v.mode === 'act' && !WATER_ANIMS.has(v.anim)) return 'person ' + v.id + ' in the water playing ' + v.anim;
    return this.m.slots.check();
  }
}
