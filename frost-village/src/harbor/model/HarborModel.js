// HarborModel (harbor_runtime model): 갈매기 항구 as pure, seeded state — the revive steps, the ship timetable,
// the coast line, exports / imports, the fish auction, ferry tourists, the trawler fleet, the crane's lifts, harbour
// residents and stars. No Phaser: the host turns its events into coins, sounds and pictures.
//
//   m = new HarborModel({ tuning, saved, seed, T })
//   m.update(dt, T, env)  ->  m.drain() events (module bus + internal view cues)
//   m.build(step) · m.deliver(item, n) · m.dropFish(item, n) · m.orderTrawler() · m.takeImport(kind, n)
//   m.ships(T) (ships at sea with poses) · m.serialize() (slice) · m.state()

import { STEPS } from '../tuning.js';
import { Schedule } from './schedule.js';
import { CoastLine } from './coastLine.js';
import { Trade } from './trade.js';
import { Auction } from './auction.js';
import { Tourists } from './tourists.js';
import { Stars } from './stars.js';
import { Revive, EFFECTS } from './revive.js';
import { Fleet } from './fleet.js';
import { stream } from './rng.js';
import { DAY, HOUR, harborDayOf, harborDayT0, dayOf } from './time.js';

export class HarborModel {
  constructor(o = {}) {
    this.cfg = o.tuning;
    this.seed = (o.seed || 20261010) >>> 0;
    const s = o.saved || null;
    this.T = Number.isFinite(o.T) ? o.T : 0;
    this.open = !!(s && s.open);
    this.revive = new Revive(s && s.steps);
    if (this.revive.has('railExt')) this.open = true;
    this.stars = new Stars(this.cfg, s && s.stars);
    this.fleet = new Fleet(this.cfg, s && s.fleet);
    this.trade = new Trade(this.cfg, s ? { exports: s.exports, imports: s.imports, cargoShips: s.cs } : null, this.seed);
    this.auction = new Auction(this.cfg, s && s.auction);
    this.tourists = new Tourists(this.cfg, this.seed, s && s.tourists);
    this.residents = s ? Math.max(0, Math.min(this.cfg.ferry.settlersMax || 20, s.res | 0)) : 0;
    this.sched = new Schedule(this.cfg, this.seed);
    this.coast = new CoastLine(this.cfg.coast, ['halt', 'harbor'].concat(s && s.beachStop ? ['beach'] : []));
    this.coast.on((ev, stop, line) => this.onCoast(ev, stop, line));
    if (this.revive.has('station')) this.coast.start();
    this.events = [];
    this.planned = new Set();        // harbour days planned
    this.planJob = null;             // { hd, gen } a day being planned a mission per tick
    this.crane = { jobs: [], cur: null, t: 0, slots: 0, loaded: 0, ship: null, pending: 0, unloadTotal: 0, unloadDone: 0 };
    this.boost = {};                  // shop -> earnings multiplier for the day (the chef)
    this.boostDay = -1;
    this.lastT = this.T;
    this.happenT = this.T + (this.cfg.happen.every || 300) * 0.5;
    if (this.open) this.ensurePlan(this.T, true);
  }

  // ------------------------------------------------------------------------------------------ helpers
  emit(e) { this.events.push(e); }
  drain() { const o = this.events; this.events = []; for (const e of this.tourists.drain()) o.push(e); return o; }
  has(step) { return this.revive.has(step); }
  planState() { return { steps: (s) => this.revive.has(s), star: this.stars.n, trawlers: this.fleet.n }; }
  hdNow(T) { return harborDayOf(T); }

  /** plan today (and yesterday's trips still running) at once; tomorrow is planned a mission per tick from 16:00 */
  ensurePlan(T, sync) {
    const hd = harborDayOf(T);
    for (let d = sync ? hd - 1 : hd; d <= hd; d++) {
      if (this.planned.has(d)) continue;
      if (this.planJob && this.planJob.hd === d) { this.finishJob(); continue; }
      this.sched.planDay(d, this.planState(), -Infinity);
      this.planned.add(d);
    }
    // tomorrow: start when today is past 16:00
    if (!this.planned.has(hd + 1) && !this.planJob && T > harborDayT0(hd) + 12 * HOUR) this.planJob = { hd: hd + 1, gen: this.sched.planDayGen(hd + 1, this.planState(), -Infinity) };
  }
  finishJob() { if (!this.planJob) return; let r = this.planJob.gen.next(); while (!r.done) r = this.planJob.gen.next(); this.planned.add(this.planJob.hd); this.planJob = null; }
  stepJob() {
    if (!this.planJob) return;
    const r = this.planJob.gen.next();
    if (r.done) { this.planned.add(this.planJob.hd); this.planJob = null; }
  }
  /** the harbour changed: trips not started yet are planned again from now on */
  replan(T) {
    if (!this.open) return;
    if (this.planJob) this.planJob = null;
    this.sched.dropFuture(T);
    const hd = harborDayOf(T);
    for (const d of Array.from(this.planned)) if (d >= hd) this.planned.delete(d);
    this.sched.planDay(hd, this.planState(), T);
    this.planned.add(hd);
  }

  // ------------------------------------------------------------------------------------------ actions
  /** a revive step's site was built (P29 Site flow / the lab) */
  build(step, T = this.T) {
    if (!this.revive.build(step)) return false;
    const E = EFFECTS[step];
    this.emit({ t: 'harbor:step', step, wakes: E.wakes.slice(), starts: E.starts.slice(), n: this.revive.index(step) + 1 });
    if (step === 'railExt') { this.open = true; this.stars.check(true, false); this.emit({ t: 'harbor:open' }); this.emit({ t: 'harbor:star', n: this.stars.n }); }
    if (step === 'station') this.coast.start();
    const next = this.revive.next();
    if (next) this.emit({ t: 'harbor:site', step: next });
    this.replan(T);
    this.checkStars();
    return true;
  }
  /** goods on the export pad -> { took, coins } */
  deliver(item, n, T = this.T) {
    if (!this.has('crane')) return { took: 0, coins: 0 };
    const r = this.trade.deliver(item, n, T);
    if (r.took) {
      this.stars.add('exports', r.took);
      for (const p of r.per) this.emit({ t: 'harbor:export', id: p.id, n: p.n, item, done: r.done.indexOf(p.id) >= 0 });
      if (r.coins) this.emit({ t: 'coins', from: 'export', n: r.coins, item, took: r.took });
      // the crane loads them onto a berthed ship (one crate per 10 items)
      this.crane.pending += r.took;
      while (this.crane.pending >= 10) { this.crane.pending -= 10; this.crane.jobs.push({ dir: 'load' }); }
      this.checkStars();
    }
    return r;
  }
  /** fish on the auction pad -> taken */
  dropFish(item, n) { return this.has('auction') ? this.auction.drop(item, n) : 0; }
  /** an order at the shipyard (the host already took the coins) */
  orderTrawler() { if (!this.has('shipyard')) return false; const ok = this.fleet.order(); if (ok) this.emit({ t: 'harbor:trawler', op: 'order', n: this.fleet.total() }); return ok; }
  takeImport(kind, n) { return this.trade.take(kind, n); }
  /** the beach module adds 해변역 to the coast line (v7) */
  addCoastStop(stop) { if (this.coast.stops.indexOf(stop) >= 0) return; const run = this.coast.running; this.coast.setStops(this.coast.stops.concat([stop])); if (run) this.coast.start(); this.beachStop = stop === 'beach'; }

  checkStars() {
    const n = this.stars.check(this.open, this.revive.all());
    if (n) { this.emit({ t: 'harbor:star', n }); this.replan(this.T); }
  }

  // ------------------------------------------------------------------------------------------ the frame
  /** env: { blocked(nose, dir, ahead) for the coast line } */
  update(dt, T, env = {}) {
    const T0 = this.lastT;
    this.T = T;
    if (!this.open) { this.lastT = T; return; }
    this.ensurePlan(T, false);
    this.stepJob();
    if (this.coast.running) this.coast.update(dt, env.blocked || null);
    // ship events in (T0, T]
    if (T > T0) {
      for (const m of this.sched.missions) {
        if (m.T1 < T0 - 1 || m.T0 > T) continue;
        for (const e of m.ev) if (e.t > T0 && e.t <= T) this.onShip(m, e.op, e.t);
      }
      // auction bells
      if (this.has('auction')) for (const b of this.auction.bells(T0, T)) this.ringBell(b.T, b.big);
      // contracts that missed their ship
      for (const id of this.trade.expire(T)) this.emit({ t: 'harbor:export', id, n: 0, expired: true });
    }
    // a reload (or a jump) during a cargo ship's stay: the crane works for it again (its contract is in the save)
    if (!this.crane.ship && this.has('crane')) this.resumeBerth(T);
    // tourists' timers
    if (dayOf(T) !== this.boostDay) { this.boostDay = dayOf(T); this.boost = {}; }
    this.tourists.update(T, { coast: this.coast.running, shops: this.has('terminal'), boost: this.boost });
    // the crane
    this.updateCrane(dt, T);
    // the slipway
    if (this.fleet.update(dt) === 'built') this.emit({ t: 'harbor:trawler', op: 'built' });
    if (this.fleet.ready > 0 && !this.fleet.launching) {
      const id = 'L' + Math.round(T);
      const m = this.sched.placeLaunch(id, T + 1);
      if (m) { this.fleet.ready--; this.fleet.launching = id; this.emit({ t: 'harbor:trawler', op: 'launch', id, at: m.T0 }); }
    }
    // a cute happening now and then (P7 gulls, P8 the crane's crate)
    if (T >= this.happenT) {
      const R = stream(this.seed, 'happen' + Math.round(T));
      this.happenT = T + (this.cfg.happen.every || 300) * (0.6 + R.next() * 0.8);
      const pool = [];
      if (this.has('terminal') && this.tourists.here().some((t) => t.state === 'shop' || t.state === 'stroll')) pool.push('P7');
      if (this.crane.cur) pool.push('P8');
      if (pool.length) this.emit({ t: 'harbor:happening', id: R.pick(pool) });
    }
    if (Math.floor(T / 60) !== Math.floor(T0 / 60)) this.sched.prune(T - DAY);
    this.lastT = T;
  }

  onShip(m, op, t) {
    const leaves = (m.ev.find((e) => e.op === 'depart') || {}).t;
    if (op === 'spawn' || op === 'gone' || op === 'near') { this.emit({ t: 'ship', kind: m.kind, id: m.id, op, key: m.key }); return; }
    switch (m.kind) {
      case 'ferry':
        if (op === 'arrive') {
          this.stars.add('ships', 1);
          const r = this.tourists.ferryArrives(m.id, t, dayOf(t), { star: this.stars.n, lodge: this.has('station'), residents: this.residents });
          this.stars.add('tourists', r.born.length);
          if (r.guest === 'chef') this.boost.restaurant = 2;
          for (let k = 0; k < r.settlers; k++) { this.residents++; this.emit({ t: 'harbor:settler', pid: 'h:' + this.residents, home: 'h2_sailor_lodge' }); }
          this.emit({ t: 'harbor:ship', kind: 'ferry', id: m.id, op: 'arrive', leaves, n: r.born.length });
          this.checkStars();
        } else if (op === 'board') this.tourists.boarding(m.id, t);
        else if (op === 'depart') { this.tourists.ferryDeparts(m.id, t); this.emit({ t: 'harbor:ship', kind: 'ferry', id: m.id, op: 'depart' }); }
        break;
      case 'cargo':
        if (op === 'arrive') {
          this.stars.add('ships', 1);
          const due = leaves + DAY;                   // "due before the next one leaves"
          const r = this.trade.cargoArrives(m.id, t, due, this.stars.n);
          const n = r.imp ? r.imp.crates : 0;
          Object.assign(this.crane, { ship: m.id, slots: 6, loaded: 6, unloadTotal: n, unloadDone: 0 });
          for (let k = 0; k < n; k++) this.crane.jobs.unshift({ dir: 'unload', kind: r.imp.kind });
          this.emit({ t: 'harbor:ship', kind: 'cargo', id: m.id, op: 'arrive', leaves, due, items: r.contract.items, imp: r.imp });
          this.checkStars();
        } else if (op === 'depart') { this.crane.ship = null; this.crane.jobs = this.crane.jobs.filter((j) => j.dir === 'load'); this.emit({ t: 'harbor:ship', kind: 'cargo', id: m.id, op: 'depart' }); }
        break;
      case 'trawler':
        if (op === 'hauled') { this.emit({ t: 'harbor:ship', kind: 'trawler', id: m.id, op: 'haul' }); if (m.rare) this.emit({ t: 'harbor:rare', id: m.id }); }
        else if (op === 'home') { this.stars.add('ships', 1); this.emit({ t: 'harbor:ship', kind: 'trawler', id: m.id, op: 'home' }); this.checkStars(); }
        else if (op === 'box') { this.auction.landBox(1); this.emit({ t: 'box', id: m.id }); }
        else if (op === 'depart') this.emit({ t: 'harbor:ship', kind: 'trawler', id: m.id, op: 'depart' });
        break;
      case 'launch':
        if (op === 'launched') { this.fleet.launched(); this.emit({ t: 'harbor:trawler', op: 'launched', n: this.fleet.n }); this.replan(t); }
        break;
      case 'tug':
        if (op === 'pushed') this.emit({ t: 'ship', kind: 'tug', id: m.id, op: 'pushed' });
        break;
      default: break;
    }
  }

  /** the cargo ship that lies at the crane quay now (arrived before this session) -> the crane serves it */
  resumeBerth(T) {
    if (this._resumeT !== undefined && T - this._resumeT < 5) return;
    this._resumeT = T;
    for (const m of this.sched.missions) {
      if (m.kind !== 'cargo') continue;
      const a = m.ev.find((e) => e.op === 'arrive'), d = m.ev.find((e) => e.op === 'depart');
      if (a && d && a.t < T && T < d.t) { Object.assign(this.crane, { ship: m.id, slots: 6, loaded: 2, unloadTotal: 0, unloadDone: 0 }); this.crane.jobs.length = 0; return; }
    }
  }

  ringBell(T, big) {
    const r = this.auction.sell(T, big);
    this.emit({ t: 'harbor:auction', coins: r.coins, fish: r.fish, boxes: r.boxes, big: !!big });
    if (r.coins > 0) this.emit({ t: 'coins', from: 'auction', n: r.coins });
  }

  onCoast(ev, stop, line) {
    this.emit({ t: 'train', ev, stop, line });
    if (stop !== 'harbor') return;
    if (ev === 'depart') this.tourists.coastDeparts(this.T);
    else if (ev === 'arrive') this.tourists.coastArrives(this.T);
  }

  /** the crane works while the cargo ship is berthed: unload the import crates, then load export crates */
  updateCrane(dt, T) {
    const C = this.crane, every = this.cfg.cargo.liftEvery || 3.2;
    if (!C.ship) { C.cur = null; return; }
    if (!C.cur) {
      const j = C.jobs.shift();
      if (!j) return;
      if (j.dir === 'load' && C.loaded >= C.slots) { C.jobs.length = 0; return; }        // the ship is full again
      C.cur = Object.assign({ t: 0, picked: false, dropped: false }, j);
      this.emit({ t: 'crane', op: 'start', dir: j.dir, kind: j.kind || null });
    }
    const c = C.cur;
    c.t += dt;
    // the 8-frame loop (2 s at 4 fps): frame 0 = pick at the ship, frame 5 = set down on the quay (load: reversed)
    const f = Math.min(7.999, (c.t / 2) * 8);
    // unload: pick at frame 0 (ship), set down at frame 5 (quay); load plays the loop backwards: pick on the quay at
    // shown frame 5 (time-frame 3), set down on the ship at shown frame 0 (time-frame 8)
    const pickF = c.dir === 'unload' ? 0.2 : 3, dropF = c.dir === 'unload' ? 5 : 7.8;
    if (!c.picked && f >= pickF) {
      c.picked = true;
      this.emit({ t: 'crane', op: 'pick', dir: c.dir });
      if (c.dir === 'unload') {
        C.unloadDone++;
        const want = C.slots - Math.floor(C.unloadDone * 4 / Math.max(1, C.unloadTotal));     // imports empty 4 of the 6 stacks
        if (want < C.loaded) { C.loaded = Math.max(0, want); this.emit({ t: 'crane', op: 'slot', loaded: C.loaded }); }
      }
    }
    if (!c.dropped && f >= dropF) {
      c.dropped = true;
      if (c.dir === 'unload') { const first = this.trade.landCrate(c.kind); if (first) this.emit({ t: 'harbor:import', kind: c.kind, first: true }); this.emit({ t: 'crane', op: 'drop', dir: 'unload', kind: c.kind }); }
      else { C.loaded = Math.min(C.slots, C.loaded + 1); this.emit({ t: 'crane', op: 'slot', loaded: C.loaded }); this.emit({ t: 'crane', op: 'drop', dir: 'load' }); }
    }
    if (c.t >= every) C.cur = null;
  }

  // ------------------------------------------------------------------------------------------ queries
  /** ships at sea: [{ m, p }] (p = pose { i, j, h, h2, f, v, kind, tag }) */
  ships(T = this.T) { return this.open ? this.sched.at(T) : []; }
  /** the crane's animation frame now (0..7.99) and direction, or null */
  craneFrame() { const c = this.crane.cur; if (!c) return null; const f = Math.min(7.999, (c.t / 2) * 8); return { f: c.dir === 'unload' ? f : 7.999 - f, dir: c.dir, t: c.t }; }
  nextShip(kind, T = this.T) { const n = this.sched.next(kind, 'arrive', T) || this.sched.next(kind, kind === 'trawler' ? 'home' : 'arrive', T); return n ? { id: n.m.id, at: n.t } : null; }

  serialize() {
    const tr = this.trade.serialize();
    return {
      v: 1, open: this.open ? 1 : 0, steps: this.revive.serialize(),
      exports: tr.exports, imports: tr.imports, cs: tr.cargoShips,
      fleet: this.fleet.serialize(), auction: this.auction.serialize(), tourists: this.tourists.serialize(),
      stars: this.stars.serialize(), res: this.residents, beachStop: this.coast.stops.indexOf('beach') >= 0 ? 1 : 0,
    };
  }

  state() {
    return {
      open: this.open, star: this.stars.n, steps: this.revive.serialize(), next: this.revive.next(), trawlers: this.fleet.n, building: this.fleet.building,
      ships: this.ships().map(({ m, p }) => ({ id: m.id, kind: m.kind, i: +p.i.toFixed(2), j: +p.j.toFixed(2), h: p.h, seg: p.kind, tag: p.tag })),
      coast: this.coast.state(), contract: this.trade.current(this.T), imports: { unlocked: this.trade.unlocked.slice(), stock: Object.assign({}, this.trade.stock) },
      auction: { pad: Object.assign({}, this.auction.pad), boxes: this.auction.boxes, today: this.auction.coins, nextBell: Math.round(this.auction.next(this.T)) },
      tourists: { here: this.tourists.here().length, present: this.tourists.present(), today: this.tourists.today, total: this.tourists.total },
      stars: this.stars.serialize(), residents: this.residents, crane: this.crane.cur ? this.crane.cur.dir : null,
    };
  }
}

export { STEPS };
