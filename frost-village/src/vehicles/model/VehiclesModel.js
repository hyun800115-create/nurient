// VehiclesModel (vehicles_runtime, docs/v5_v8_plan.md §6.3): the whole pure state of the vehicles module — the lane
// graph, the simulation, bus lines, freight, cars, the chief's drives, eras, built flags, riders per game day.
// No Phaser, no DOM, no clock: the host calls update(dt, T) with game time and hands in a RoadNet and an env.
//
// env (all optional): live(x, y), walkers(), xingBlocked(k, line), board(stop, n, line, to[]), alight(stop, riders,
// line), freight { take(n, role), deliver(to, items, kind), shopTargets(), reserve?(id, items), release?(id, items) },
// homes(), flag(name), day(T), chiefAt(stopId) (is the chief at that stop now: a booked ride boards only then),
// manifest() (the vehicles manifest when it arrives late)

import { LaneGraph } from './lanes.js';
import { VehicleSim } from './VehicleSim.js';
import { Transit } from './transit.js';
import { Fleet, sumItems } from './fleet.js';
import { ChiefDrive } from './chiefDrive.js';
import { Rng } from './rng.js';
import { roleKey, specOf, eraOf, CHIEF_KEYS, ANIMAL } from './eras.js';
import { bezier, cumOf, DIR_VEC } from './geom.js';

export const SLICE_VERSION = 1;

export class VehiclesModel {
  /**
   * opts: { layout, tuning, manifest (vehicles manifest JSON or null), env, saved (slice or null), seed, T, rank }
   */
  constructor(opts) {
    this.layout = opts.layout;
    this.cfg = opts.tuning;
    this.man = opts.manifest || null;
    this.env = opts.env || {};
    this.T = opts.T || 0;
    this.rng = new Rng(opts.seed || 20261010);
    this.events = [];
    this.specs = new Map();
    this.built = { depot: false, road: false, yard: false, busDepot: false, lot: false, porter: false, wagons: 0, stops: new Set() };
    this.lines = { 1: 0, 2: 0, 3: 0, 4: 0 };
    this.riders = new Array(this.cfg.riders.days).fill(0);
    this.riderDay = 0;
    // riders in the last 10 game minutes (the rank-3 bar is rolling): 11 one-minute buckets, the oldest weighted
    this.rb = new Array(11).fill(0);
    this.rbk = 0;
    this.flags = 0;                // first-time moments already shown (1 = first bus, 2 = the 읍 vehicles era)
    this.rank = opts.rank || 2;
    this.era = eraOf(this.rank);
    this.best = {};
    this.graph = null;
    this.sim = null;
    this.loading = false;
    if (opts.saved) this.restore(opts.saved);
    this.transit = new Transit(this);
    this.fleet = new Fleet(this);
    this.chief = new ChiefDrive(this);
    this.posCache = new Map();
  }

  // ------------------------------------------------------------------------------------------ roads
  /** (re)build the lane graph from a RoadNet (+ sled tracks); vehicles keep going from where they are */
  setRoads(rn, tracks) {
    const first = !this.graph;
    const rails = [];
    const R = rn && rn.v4 && rn.v4.rail;
    if (R) rails.push({ j: R.j || 0, from: R.from, to: R.to, line: 'main' });
    for (const r of this.extraRails || []) rails.push(r);
    this.tracks = tracks || this.tracks || [];
    this.graph = new LaneGraph(rn, { tracks: this.tracks, rails });
    this.graph.version = (this.graphVersion = (this.graphVersion || 0) + 1);
    this.posCache.clear();
    if (first) {
      this.sim = new VehicleSim(this.graph, this.cfg, {
        live: (x, y) => (this.env.live ? this.env.live(x, y) : true),
        walkers: () => (this.env.walkers ? this.env.walkers() : null),
        xingBlocked: (k, line) => (this.env.xingBlocked ? this.env.xingBlocked(k, line) : false),
      });
      this.applyLights();
      this.loading = true;
      this.refresh();
      this.loading = false;
      return;
    }
    // remap every vehicle onto the new graph: where each one is, by lane geometry (lane ids change when a street joins)
    const old = this.sim.g;
    for (const v of this.sim.list) {
      v._mark = null;
      if (!v.path || v.state === 'hidden') continue;
      const h = this.herePos(v, old);
      const l = h && old.lanes[h.lane];
      if (l) v._mark = { gkey: l.gkey, s: h.s, x: v.x, y: v.y, dk: v.dk };
    }
    this.sim.g = this.graph;
    this.sim.holders.clear(); this.sim.commit.clear();
    for (const v of this.sim.list) { v.held = []; v.commits = []; }
    this.applyLights();
    for (const v of this.sim.list.slice()) this.remap(v, old);
    this.refresh();
    for (const v of this.sim.list) v._mark = null;
  }

  remap(v, old) {
    void old;
    if (v.chief) { this.chief.remap(v); return; }
    if (v.state === 'hidden' && v.pending) { v.pending = null; if (v.dest) this.go(v, v.dest); return; }
    if (v.state === 'bay' && v.pending) { const d = v.dest; v.pending = null; if (d) this.go(v, d); return; }
    if (!v.path) return;
    if (v.role === 'bus') return;                // transit.rebuild() reroutes buses
    if (v.afterRun) { this.chief.home(v.id); return; }
    if (v.dest) this.go(v, v.dest, true);
    else { const h = this.herePos(v); if (h) this.sim.setPath(v, [{ t: 'L', id: h.lane, s0: h.s, s1: h.s }], [{ at: 0, dwell: Math.max(0.2, v.dwell || 0), tag: 'hold' }]); }
  }

  applyLights() {
    if (!this.sim) return;
    this.sim.lit.clear();
    if (this.era < 3) return;
    for (const L of this.layout.LIGHTS) {
      const key = 'n' + Math.round(L.node[0] * 20) + ',' + Math.round(L.node[1] * 20);
      if (this.graph.nodes.has(key)) this.sim.addLight(key, 0);
    }
  }

  // ------------------------------------------------------------------------------------------ positions
  vehicleSpec(key) {
    let s = this.specs.get(key);
    if (!s) {
      // the manifest may arrive after the module starts: fallbacks are not kept, the real numbers are once it is here
      if (!this.man && this.env.manifest) this.man = this.env.manifest() || null;
      s = specOf(this.man, key, this.cfg);
      if (this.man) this.specs.set(key, s);
    }
    return s;
  }
  cfgFor(key) { const s = this.vehicleSpec(key); return this.cfg[s.tuning] || {}; }
  roleKey(role) { return roleKey(role, Math.max(2, this.era)); }
  allowFor(key) { return CHIEF_KEYS.has(key) ? () => true : (l) => l.kind === 'road'; }

  /** a place of the layout (or the env) as a lane position for a vehicle of length len, with its bay if it has one */
  placePos(id, len) {
    const k = id + '|' + len;
    if (this.posCache.has(k)) return this.posCache.get(k);
    const P = this.layout.PLACES[id] || (this.extraPlaces && this.extraPlaces[id]) || null;
    let r = null;
    if (P) {
      const c = P.curb || P;           // where the vehicle stops (a curb point of its own, else the place)
      r = this.pointPos(c.x, c.y, len);
      if (r && id === 'p:yard') r.bay = { x: P.x, y: P.y, dir: 'SW', id: 'yard' };
    }
    this.posCache.set(k, r);
    return r;
  }
  /** the nearest road lane spot to a px point, fitted for length len */
  pointPos(x, y, len, allow) {
    const g = this.graph;
    const sn = g.snap(x, y, allow || ((l) => l.kind === 'road' && !l.stub));
    if (!sn) return null;
    return { lane: sn.lane, s: g.fit(sn.lane, sn.s, len) };
  }
  /**
   * where vehicles come out of / go into their depot: horses and dogs live in the stable (the sleigh buses roll into
   * it at the 도시 ceremony too), motor vehicles in the bus depot once there is one
   */
  depotPos(len, v) {
    const animal = v && ANIMAL.has(v.key);
    const id = !animal && this.era >= 3 && this.built.busDepot ? 'p:busDepot' : 'p:stable';
    return this.placePos(id, len);
  }
  /** the lane position a vehicle is at (graph = the graph its path was made on; after a rebuild: by lane geometry) */
  herePos(v, graph) {
    const g = graph || this.graph;
    if (!graph && v._mark) {
      const mk = v._mark, id = mk.gkey ? g.byG.get(mk.gkey) : undefined;
      if (id !== undefined) return { lane: id, s: Math.max(0, Math.min(g.lanes[id].len, mk.s)) };
      const allow = v.allow || this.allowFor(v.key);
      const sn = g.snap(mk.x, mk.y, (l) => allow(l) && l.dk === mk.dk) || g.snap(mk.x, mk.y, allow);
      return sn ? { lane: sn.lane, s: sn.s } : null;
    }
    if (v.path && v.path.length) {
      const k = this.sim.pieceIndex(v, v.ps), p = v.path[k];
      if (p.t === 'L') return { lane: p.id, s: p.s0 + (v.ps - v.cum[k]) };
      // in a connector: its out-lane start
      if (p.t === 'C') { const c = g.conns[p.id]; if (c) return { lane: c.to, s: 0.05 }; }
      // on a private piece (a turn-round, a driveway out): the lane it leads to
      if (p.t === 'D') { const q = v.path[k + 1]; if (q && q.t === 'L') return { lane: q.id, s: q.s0 }; }
    }
    const sn = g.snap(v.x, v.y, (l) => l.kind === 'road' && l.dk === v.dk) || g.snap(v.x, v.y);
    return sn ? { lane: sn.lane, s: sn.s } : null;
  }

  /** seconds a vehicle needs for a path (cruise by piece limits + start/stop) */
  driveTime(path, spec) {
    let t = 0;
    const dummy = { vmax: spec.vmax, cap: 1, animal: spec.animal, trackSpeed: spec.vmax };
    for (const p of path) {
      const g = this.sim ? this.sim.pieceGeom(p) : (p.t === 'C' ? this.graph.conns[p.id] : this.graph.lanes[p.id]);
      const lim = this.sim ? this.sim.limitOf(dummy, p, g) : spec.vmax;
      t += (p.s1 - p.s0) / Math.max(0.3, lim);
    }
    return t + spec.vmax / Math.max(0.3, spec.accel) + 1.0;
  }

  // ------------------------------------------------------------------------------------------ going places
  /**
   * send vehicle v to dest { pos, bay?, tag, dwell } from wherever it is (a bay, a lane, the depot). Out of a bay /
   * the depot it waits ('bay' / 'hidden' + pending) until it can merge.
   */
  go(v, dest, now) {
    void now;
    v.dest = dest;
    const g = this.graph;
    let pre = [], start = null, merge = null, from = null;
    if (v.state === 'bay' && v.bay) {
      const out = this.driveway(v.bay, v.bayPos || dest.pos, 'out', v.bay.lot);
      if (out) { pre = [out.piece]; start = out.pos; merge = out.pos; from = 'bay'; }
    } else if (v.path && v.state !== 'hidden') start = this.herePos(v);
    if (!start) { start = this.depotPos(v.len); merge = start; from = 'depot'; }
    if (!start || !dest.pos) return false;
    const mid = g.route(start, dest.pos, { allow: v.allow || this.allowFor(v.key), weight: v.weight || null });
    if (!mid) return false;
    let post = [];
    if (dest.bay) { const inn = this.driveway(dest.bay, dest.pos, 'in', dest.bay.lot); if (inn) post = [inn.piece]; }
    const path = pre.concat(mid, post);
    let total = 0; for (const p of path) total += p.s1 - p.s0;
    const goals = [{ at: total, dwell: dest.dwell || 0, tag: dest.tag }];
    if (merge) { v.pending = { path, goals, merge, from }; v.state = from === 'bay' ? 'bay' : 'hidden'; }
    else this.sim.setPath(v, path, goals);
    v.bay = null;
    v.inBay = dest.bay || null;
    return true;
  }

  /** a short private piece between a lane spot and an off-lane bay: { piece, pos } */
  driveway(bay, near, way, lot) {
    const g = this.graph;
    const sn = near && near.lane !== undefined ? near : g.snap(bay.x, bay.y);
    if (!sn) return null;
    const lane = g.lanes[sn.lane];
    const sm = way === 'out' ? Math.min(lane.len - 0.3, sn.s + 2.4) : Math.max(0.3, sn.s - 2.4);
    const lp = g.at('L', lane.id, sm, {});
    const d = DIR_VEC[bay.dir] || [0.89, 0.45];
    const b = { x: bay.x, y: bay.y };
    let pts;
    if (lot) pts = way === 'out' ? bezier(b, { x: (b.x + lp.x) / 2, y: lp.y }, lp, 8) : bezier(lp, { x: (b.x + lp.x) / 2, y: lp.y }, b, 8);
    else pts = way === 'out' ? bezier(b, { x: b.x + d[0] * 60, y: b.y + d[1] * 60 }, lp, 8) : bezier(lp, { x: b.x - d[0] * 60, y: b.y - d[1] * 60 }, b, 8);
    const cum = cumOf(pts);
    const L = cum[cum.length - 1];
    return { piece: { t: 'D', pts, cum, len: L, s0: 0, s1: L, rev: way === 'out' && !!lot }, pos: { lane: lane.id, s: sm } };
  }

  /** a vehicle leaves service: it drives into the depot and vanishes (riders / items are handed back first) */
  retireVehicle(v, drop, items) {
    // nobody is looking (far from the view): it simply goes; on screen it drives home to the depot
    if (!drop && v.live === false && !v.chief) drop = true;
    if (items && sumItems(items) && this.env.freight && this.env.freight.deliver) { this.env.freight.deliver('cargo', items, 'return'); this.fleet.totals.delivered += sumItems(items); this.fleet.totals.cargo += sumItems(items); }
    if (drop || v.state === 'hidden' || !v.path) { this.sim.remove(v.id); this.emit({ t: 'veh:depot', id: v.id, op: 'gone', key: v.key }); return; }
    v.role = 'retire';
    v.items = {};
    const dp = this.depotPos(v.len, v);
    if (!dp || !this.go(v, { pos: dp, tag: 'retire', dwell: 0 })) { this.sim.remove(v.id); return; }
    v.ghost = 0;
  }

  /** the parking lot's stalls (when built): px + heading, from the parking_lot_s art */
  lotStalls() {
    const P = this.layout.PARKING.lot;
    const d = this.man && this.man.sprites && this.man.sprites[P.key];
    const pts = (d && d.stallPoints) || [[-190, -88], [-68, -27], [54, 34], [176, 95]];
    const dirs = (d && d.stallDirs) || ['NE', 'NE', 'NE', 'NE'];
    return pts.map((p, i) => ({ x: P.x + p[0], y: P.y + p[1], dir: dirs[i] || 'NE' }));
  }

  // ------------------------------------------------------------------------------------------ build state
  stopBuilt(id) { const st = this.layout.STOPS[id]; return !!st && (st.free ? this.built.depot : this.built.stops.has(id)); }
  lineBuses(id) { return this.lines[id] | 0; }
  freightWanted() { return this.built.yard && this.built.road ? this.built.wagons | 0 : 0; }
  porterWanted() { return this.built.porter && this.built.yard && this.built.road; }
  /** streets of the layout that exist now (the host adds them to the RoadNet) */
  streets() { return this.layout.streetsFor(this.built); }

  /**
   * the chief built / bought something: 'depot' | 'road' | 'yard' | 'busDepot' | 'lot' | 'porter' | 'stop:S4' |
   * 'wagon' | 'bus:1' ... (buses / wagons count up). Returns the streets that appear (the host adds + paints them).
   */
  build(what) {
    const before = new Set(this.streets().map((s) => s.id));
    if (what.startsWith('stop:')) this.built.stops.add(what.slice(5));
    else if (what.startsWith('bus:')) { const id = what.slice(4); this.lines[id] = (this.lines[id] | 0) + 1; }
    else if (what === 'wagon') this.built.wagons = (this.built.wagons | 0) + 1;
    else this.built[what] = true;
    this.emit({ t: 'veh:built', what });
    const added = this.streets().filter((s) => !before.has(s.id));
    if (!added.length && this.sim) this.refresh();
    return added;
  }

  /** rank changed: 3 = 도시 (asphalt, lights, retro buses, trucks, cars) */
  setRank(rank) {
    const e = eraOf(rank);
    this.rank = rank;
    if (e === this.era) return false;
    this.era = e;
    if (e >= 3) this.built.busDepot = true;
    this.posCache.clear();
    this.applyLights();
    this.emit({ t: 'veh:era', n: e });
    if (this.sim) this.refresh();
    return true;
  }

  /** lines, freight, cars match the built state */
  refresh() {
    if (!this.sim) return;
    this.transit.rebuild();
    this.fleet.ensure();
    this.fleet.ensureCars();
  }

  // ------------------------------------------------------------------------------------------ riders
  dayOf(T) { return this.env.day ? this.env.day(T) : Math.floor(T / 600); }
  countRiders(n, line) {
    const d = this.dayOf(this.T);
    this.rollDays(d);
    this.riders[d % this.riders.length] += n;
    this.rollBuckets();
    this.rb[this.rbk % this.rb.length] += n;
    this.emit({ t: 'veh:ride', line, n, chief: false });
  }
  rollBuckets() {
    const k = Math.floor(this.T / 60);
    if (k <= this.rbk) return;
    const N = this.rb.length;
    for (let j = Math.max(this.rbk + 1, k - N + 1); j <= k; j++) this.rb[j % N] = 0;
    this.rbk = k;
  }
  /** riders in the last 600 game seconds (the rank-3 "per game day (rolling)" bar): it never drops at midnight */
  ridersRolling() {
    this.rollBuckets();
    const N = this.rb.length, k = this.rbk, frac = (this.T - k * 60) / 60;
    let n = 0;
    for (let j = 0; j < N - 1; j++) n += this.rb[(k - j + N * 4) % N];
    n += this.rb[(k - (N - 1) + N * 4) % N] * Math.max(0, Math.min(1, 1 - frac));
    return Math.round(n);
  }
  rollDays(d) {
    if (d === this.riderDay) return;
    if (d > this.riderDay) for (let k = Math.max(this.riderDay + 1, d - this.riders.length + 1); k <= d; k++) this.riders[k % this.riders.length] = 0;
    this.riderDay = d;
  }
  /** riders of the current calendar day (the 10-day history) */
  ridersOfDay() { this.rollDays(this.dayOf(this.T)); return this.riders[this.riderDay % this.riders.length]; }
  /** the bar: riders in the last game day, rolling */
  ridersToday() { return this.ridersRolling(); }

  // ------------------------------------------------------------------------------------------ step
  emit(ev) { this.events.push(ev); }
  drain() { const e = this.events; this.events = []; return e; }

  update(dt, T) {
    if (!this.sim) return;
    this.T = T !== undefined ? T : this.T + dt;
    this.rollDays(this.dayOf(this.T));
    this.chief.input(dt);
    this.sim.update(dt, this.T);
    for (const ev of this.sim.drain()) this.onSim(ev);
    this.transit.update(dt);
    this.fleet.update(dt);
    this.chief.update(dt);
    // a terminal layover never holds anyone up: a bus with a queue behind it leaves. And nothing else may stand in a
    // lane for good: a non-bus vehicle that has stood > 20 s while someone waits behind it > 10 s moves on
    for (const v of this.sim.list) {
      if (v.state !== 'dwell') { v.dwellAge = 0; continue; }
      v.dwellAge = (v.dwellAge || 0) + dt;
      const bus = v.role === 'bus';
      if (bus ? v.dwell <= 1.5 : (v.chief || v.dwellAge < 20)) continue;
      for (const w of this.sim.list) {
        if (w === v || !w.blockedBy || w.blockedBy.t !== 'veh' || w.blockedBy.id !== v.id || w.waitT <= (bus ? 3 : 10)) continue;
        if (bus) v.dwell = Math.min(v.dwell, Math.max(0.5, this.cfgFor(v.key).dwell * 0.4));
        else { v.holdOn = false; v.dwell = Math.min(v.dwell, 0.5); }
        break;
      }
    }
  }

  onSim(ev) {
    const v = this.sim.get(ev.id);
    if (!v) return;
    if (ev.t === 'arrive') {
      const tag = ev.tag || '';
      if (v.chief) return this.chief.arrive(v, tag);
      if (v.afterRun) { if (tag === 'out') this.chief.out(v); return; }
      if (v.inBay) { v.bay = v.inBay; v.bayPos = v.dest && v.dest.pos; v.inBay = null; }
      if (v.role === 'bus' && tag.startsWith('stop:')) this.transit.arrive(v, tag.slice(5));
      else if ((v.role === 'freight' || v.role === 'porter') && (tag === 'yard' || tag === 'drop')) this.fleet.arriveFreight(v, tag);
      else if (v.role === 'car' && tag === 'park') this.fleet.arriveCar(v);
      else if (v.role === 'dispatch' && tag === 'dispatch') this.fleet.arriveDispatch(v);
      else if (tag === 'retire') { this.sim.remove(v.id); this.emit({ t: 'veh:depot', id: v.id, op: 'in', key: v.key }); }
    } else if (ev.t === 'depart') {
      if (v.chief) return this.chief.depart(v);
      if (v.afterRun) { this.chief.home(v.id); return; }
      if (v.bay) v.state = 'bay';
      if (v.role === 'bus') this.transit.depart(v);
      else if (v.role === 'freight' || v.role === 'porter') this.fleet.departFreight(v);
      else if (v.role === 'dispatch') this.fleet.departDispatch(v);
      else if (v.role === 'car' && v.after) { const a = v.after; v.after = null; if (!this.go(v, a)) { this.fleet.arriveCar(v); } }
    } else if (ev.t === 'end') {
      if (v.chief) this.chief.ended(v);
      else if (v.afterRun) { this.chief.out(v); this.chief.home(v.id); }
    } else if (ev.t === 'bell') {
      this.emit({ t: 'veh:bell', id: v.id, key: v.key, x: ev.x, y: ev.y, who: ev.who });
    }
  }

  // ------------------------------------------------------------------------------------------ save
  serialize() {
    const pal = this.fleet ? (this.fleet.palette || []).slice() : [];
    // a car's colour as its palette index (a short slice: 24 cars with long ids stay under the cap)
    const cars = this.fleet.cars.slice(0, this.cfg.cars.maxParked).map((c) => { const i = pal.indexOf(c.key); return [c.pid, i >= 0 ? i : c.key]; });
    const best = {};
    const bk = Object.keys(this.best);
    for (const k of bk.slice(Math.max(0, bk.length - 12))) best[k] = Math.round(this.best[k] * 10) / 10;
    this.rollBuckets();
    return {
      v: SLICE_VERSION, era: this.era,
      built: { depot: this.built.depot ? 1 : 0, road: this.built.road ? 1 : 0, stops: Array.from(this.built.stops).sort(), yard: this.built.yard ? 1 : 0, wagons: this.built.wagons | 0, busDepot: this.built.busDepot ? 1 : 0, lot: this.built.lot ? 1 : 0, porter: this.built.porter ? 1 : 0 },
      lines: { 1: this.lines[1] | 0, 2: this.lines[2] | 0, 3: this.lines[3] | 0, 4: this.lines[4] | 0 },
      riders: this.riders.slice(), rd: this.riderDay, rb: this.rb.slice(), rbk: this.rbk,
      cars, pal,
      chief: { best }, rs: this.rng.state(), fl: this.flags | 0,
    };
  }

  restore(s) {
    if (!s || typeof s !== 'object') return;
    const b = s.built || {};
    this.built.depot = !!b.depot; this.built.road = !!b.road; this.built.yard = !!b.yard; this.built.busDepot = !!b.busDepot;
    this.built.lot = !!b.lot; this.built.porter = !!b.porter; this.built.wagons = b.wagons | 0;
    this.built.stops = new Set(Array.isArray(b.stops) ? b.stops : []);
    for (const k of [1, 2, 3, 4]) this.lines[k] = (s.lines && s.lines[k]) | 0;
    if (Array.isArray(s.riders)) for (let i = 0; i < this.riders.length; i++) this.riders[i] = s.riders[i] | 0;
    this.riderDay = s.rd | 0;
    if (Array.isArray(s.rb)) for (let i = 0; i < this.rb.length; i++) this.rb[i] = s.rb[i] | 0;
    this.rbk = s.rbk | 0;
    this.flags = s.fl | 0;
    if (s.era) this.era = Math.max(this.era, s.era | 0);
    if (s.chief && s.chief.best) this.best = Object.assign({}, s.chief.best);
    if (s.rs) this.rng = new Rng(s.rs >>> 0);
    this._savedPal = Array.isArray(s.pal) ? s.pal : null;
    // cars: [pid, palette index | car key]
    this._savedCars = (Array.isArray(s.cars) ? s.cars : []).map((c) => (Array.isArray(c) && typeof c[1] === 'number' && this._savedPal ? [c[0], this._savedPal[c[1]]] : c)).filter((c) => Array.isArray(c) && c[1]);
  }
}
