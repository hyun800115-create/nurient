// Fleet (vehicles_runtime model/fleet.js): the working vehicles besides buses. Pure.
//  - freight: the steam wagon (읍) / cargo truck (도시) loops yard -> station cargo pad -> founded shops that need
//    restocking -> yard; items are conserved (taken at the yard = delivered at the stops)
//  - porter: the station porters' cargo sleigh, yard <-> cargo pad (20 a trip)
//  - cars (도시): residents' cars parked in bays / the lot / at level-2 houses; ≤ maxMoving drive at once between
//    parking spots; parked cars are not simulated
//  - dispatch (v8 hook): any vehicle from the depot to a place, then back
//  Vehicles waiting to come out of a depot or a bay hold `pending` until their lane has room (update()).

import { carPalette } from './eras.js';

export class Fleet {
  constructor(m) {
    this.m = m;
    this.freight = [];          // vehicle ids (wagon / truck)
    this.porters = [];          // cargo sleigh ids
    this.cars = [];             // { pid, key, home, at, vid, to, next }
    this.spots = new Map();     // spot id -> { id, x, y, dir, kind, pos, taken, dk }
    this.palette = null;        // car keys allowed this game (≤ 4 colourways)
    this.tripT = 20;
    this.dispatches = [];       // { vid, id, to, state, back }
    this.totals = { taken: 0, delivered: 0, cargo: 0, shops: 0 };
    if (m._savedPal && m._savedPal.length) this.palette = m._savedPal.slice();
    if (m._savedCars) for (const c of m._savedCars) if (Array.isArray(c) && c[0] && c[1]) this.cars.push({ pid: String(c[0]), key: String(c[1]), home: null, at: null, vid: 0, to: null, next: 0 });
  }

  // ------------------------------------------------------------------------------------------ freight
  /** wagons / trucks wanted (built.wagons) and the porter sleigh: spawn or retire to match */
  ensure() {
    const m = this.m;
    const key = m.roleKey('freight');
    const want = m.freightWanted();
    for (const id of this.freight.slice()) { const v = m.sim.get(id); if (!v || v.key !== key || v.role !== 'freight') { this.freight.splice(this.freight.indexOf(id), 1); if (v && v.role === 'freight') m.retireVehicle(v, false, v.items); } }
    while (this.freight.length > want) { const id = this.freight.pop(); const v = m.sim.get(id); if (v) m.retireVehicle(v, false, v.items); }
    while (this.freight.length < want) this.freight.push(this.spawnWorker(key, 'freight').id);
    const pk = m.roleKey('porter');
    const wantP = m.porterWanted() ? 1 : 0;
    for (const id of this.porters.slice()) { const v = m.sim.get(id); if (!v || v.key !== pk || v.role !== 'porter') { this.porters.splice(this.porters.indexOf(id), 1); if (v && v.role === 'porter') m.retireVehicle(v, false, v.items); } }
    while (this.porters.length > wantP) { const id = this.porters.pop(); const v = m.sim.get(id); if (v) m.retireVehicle(v, false, v.items); }
    while (this.porters.length < wantP) this.porters.push(this.spawnWorker(pk, 'porter').id);
  }

  spawnWorker(key, role) {
    const m = this.m;
    const v = m.sim.add(Object.assign({}, m.vehicleSpec(key), { role, items: {} }));
    const yard = m.placePos('p:yard', v.len);
    if (yard && m.loading) this.parkInBay(v, yard);                 // a fresh load: it is at the yard already
    else if (yard) m.go(v, { pos: yard, bay: yard.bay, tag: 'yard' });
    else v.wantYard = true;                                         // no road to the yard yet: waits in the depot
    return v;
  }

  /** put a vehicle in a place's bay (load), standing; the yard logic runs when its short dwell ends */
  parkInBay(v, pos) {
    const m = this.m;
    const inn = m.driveway(pos.bay, pos, 'in', pos.bay.lot);
    if (!inn) { m.go(v, { pos, bay: pos.bay, tag: 'yard' }); return; }
    m.sim.setPath(v, [inn.piece], [{ at: inn.piece.len, dwell: 0, tag: 'yard' }], inn.piece.len);
    v.inBay = pos.bay; v.dest = { pos, bay: pos.bay, tag: 'yard' };
  }

  /** at the yard (in its bay): take what the yard has, plan the run; nothing there -> look again in a few s */
  yardTick(v) {
    const m = this.m, env = m.env;
    const cap = (m.cfgFor(v.key).capacity || 30);
    const room = cap - sumItems(v.items);
    const take = room > 0 && env.freight && env.freight.take ? (env.freight.take(room, v.role) || {}) : {};
    const n = sumItems(take);
    addItems(v.items, take);
    this.totals.taken += n;
    if (n) m.emit({ t: 'veh:load', id: v.id, items: take, at: 'yard' });
    if (!sumItems(v.items)) { v.dwell = 6; v.next = 'yard'; return; }
    v.job = this.planJob(v);
    v.dwell = (m.cfgFor(v.key).loadTime || 4) + 0.04 * n;
    v.next = 'run';
  }

  arriveFreight(v, tag) {
    const m = this.m, env = m.env;
    if (tag === 'yard') { this.yardTick(v); return; }
    if (tag === 'drop') {
      const st = v.job && v.job.stops[v.job.i];
      let n = 0;
      if (st) {
        const items = {};
        for (const k in st.items) { const have = v.items[k] || 0, q = Math.min(have, st.items[k]); if (q > 0) { items[k] = q; v.items[k] = have - q; if (!v.items[k]) delete v.items[k]; } }
        n = sumItems(items);
        if (n) {
          if (env.freight && env.freight.deliver) env.freight.deliver(st.kind === 'cargo' ? 'cargo' : st.target, items, st.kind);
          this.totals.delivered += n;
          if (st.kind === 'cargo') this.totals.cargo += n; else this.totals.shops += n;
          m.emit({ t: 'veh:freight', id: v.id, items, to: st.kind === 'cargo' ? 'cargo' : st.target, kind: st.kind, at: { x: v.x, y: v.y } });
        }
        v.job.i++;
      }
      v.dwell = 1 + (m.cfgFor(v.key).unloadPerItem || 0.12) * n;
      v.next = 'run';
    }
  }

  /** split the bed: founded shops that need restocking first (v4 Growth.shopTargets), the rest to the cargo pad */
  planJob(v) {
    const m = this.m, env = m.env;
    const left = Object.assign({}, v.items);
    const stops = [];
    if (v.role !== 'porter' && env.freight && env.freight.shopTargets) {
      for (const t of env.freight.shopTargets() || []) {
        const items = {};
        for (const k in t.need || {}) { const q = Math.min(left[k] || 0, t.need[k]); if (q > 0) { items[k] = q; left[k] -= q; } }
        if (!sumItems(items)) continue;
        const pos = m.pointPos(t.x, t.y, v.len);
        if (!pos) { for (const k in items) left[k] = (left[k] || 0) + items[k]; continue; }
        stops.push({ kind: 'shop', target: t.id, items, pos });
      }
    }
    const rest = {};
    for (const k in left) if (left[k] > 0) rest[k] = left[k];
    const cargo = m.placePos('p:cargo', v.len);
    const out = [];
    if (sumItems(rest) && cargo) out.push({ kind: 'cargo', target: 'cargo', items: rest, pos: cargo });
    // the cargo pad is on the way out; then the shops nearest-first along the lanes
    let here = out.length ? out[0].pos : m.placePos('p:yard', v.len);
    while (stops.length) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < stops.length; i++) { const r = here && m.graph.route(here, stops[i].pos); const d = r ? m.graph.pathLen(r) : 1e9; if (d < bd) { bd = d; bi = i; } }
      const s = stops.splice(bi, 1)[0];
      out.push(s); here = s.pos;
    }
    // anything that could not get a stop rides back and goes to the cargo pad next time (never lost)
    return { stops: out, i: 0 };
  }

  departFreight(v) {
    const m = this.m;
    if (v.next !== 'run') { this.yardTick(v); v.state = 'dwell'; return; }   // still at the yard: keep looking
    const job = v.job;
    while (job && job.i < job.stops.length) {
      const st = job.stops[job.i];
      if (m.go(v, { pos: st.pos, tag: 'drop', dwell: 0 })) return;
      job.i++;                                                       // unreachable now: skip (items stay on the bed)
    }
    v.job = null;
    v.next = 'yard';
    const yard = m.placePos('p:yard', v.len);
    if (!yard || !m.go(v, { pos: yard, bay: yard.bay, tag: 'yard' })) { v.state = 'dwell'; v.dwell = 5; }
  }

  // ------------------------------------------------------------------------------------------ cars
  /** parking spots (bays, the lot's stalls when built, level-2 houses) */
  buildSpots() {
    const m = this.m, P = m.layout.PARKING;
    const old = this.spots;
    this.spots = new Map();
    const add = (s) => { const o = old.get(s.id); if (o) { s.taken = o.taken; s.dk = o.dk; } this.spots.set(s.id, s); };
    P.bays.forEach((b, i) => add({ id: 'bay' + i, x: b.x, y: b.y, dir: b.dir, kind: 'bay' }));
    if (m.built.lot && m.lotStalls) m.lotStalls().forEach((s, i) => add({ id: 'lot' + i, x: s.x, y: s.y, dir: s.dir, kind: 'lot', lot: true }));
    if (m.env.homes) for (const h of m.env.homes() || []) if ((h.level | 0) >= 2 && h.park) add({ id: 'home:' + h.id, x: h.park.x, y: h.park.y, dir: h.park.dir || 'SE', kind: 'house', pid: h.pid, home: h.id });
    for (const s of this.spots.values()) s.pos = s.kind === 'house' ? null : this.accessOf(s);
  }

  /** the lane spot a bay / stall is reached from (within 7 m) */
  accessOf(s) {
    const g = this.m.graph;
    let sn = g.snap(s.x, s.y, (l) => l.kind === 'road' && !l.stub && l.dk === s.dir);
    if (!sn || sn.d > 7) sn = g.snap(s.x, s.y);
    if (!sn || sn.d > 7) return null;
    return { lane: sn.lane, s: sn.s };
  }

  /** at 도시 (and when houses level up): every level-2 home gets a car (≤ maxParked), colours from the palette */
  ensureCars() {
    const m = this.m, cfg = m.cfg.cars;
    if (m.era < 3) return;
    if (!this.palette || !this.palette.length) this.palette = carPalette(m.rng, cfg.colours || 4);
    this.buildSpots();
    const owners = new Set(this.cars.map((c) => c.pid));
    const homes = m.env.homes ? (m.env.homes() || []).filter((h) => (h.level | 0) >= 2) : [];
    for (const h of homes) {
      if (this.cars.length >= cfg.maxParked) break;
      if (!h.pid || owners.has(h.pid)) continue;
      const key = this.palette[m.rng.int(this.palette.length)];
      this.cars.push({ pid: h.pid, key, home: this.spots.has('home:' + h.id) ? 'home:' + h.id : null, at: null, vid: 0, to: null, next: 0 });
      owners.add(h.pid);
    }
    // park each car: at its home spot, else any free spot (keys outside the palette are kept: saved cars)
    for (const c of this.cars) {
      if (c.vid || c.at) continue;
      const hs = c.home && this.spots.get(c.home);
      const s = hs && !hs.taken ? hs : this.freeSpot(true);
      if (s) { s.taken = c.pid; c.at = s.id; if (!c.home) c.home = s.id; }
    }
  }

  freeSpot(any) { for (const s of this.spots.values()) if (!s.taken && (any || s.pos)) return s; return null; }
  movingCars() { let n = 0; for (const c of this.cars) if (c.vid) n++; return n; }

  updateCars(dt) {
    const m = this.m, cfg = m.cfg.cars;
    if (m.era < 3 || !this.cars.length) return;
    this.tripT -= dt;
    if (this.tripT > 0) return;
    this.tripT = cfg.tripEvery * (0.6 + 0.8 * m.rng.next());
    if (this.movingCars() >= cfg.maxMoving) return;
    const cands = this.cars.filter((c) => !c.vid && c.at && this.spots.get(c.at) && this.spots.get(c.at).pos && m.T >= c.next);
    if (!cands.length) return;
    const c = cands[m.rng.int(cands.length)];
    const from = this.spots.get(c.at);
    const home = c.home && this.spots.get(c.home);
    let to = null;
    if (home && c.at !== c.home && !home.taken && home.pos) to = home;
    else { const opts = []; for (const s of this.spots.values()) if (!s.taken && s.pos && s.id !== from.id) opts.push(s); if (opts.length) to = opts[m.rng.int(opts.length)]; }
    if (to) { this.drive(c, from, to); return; }
    // every spot is taken: an errand round the block (a short stop at a shop curb) and back to the same spot
    const shops = m.env.freight && m.env.freight.shopTargets ? m.env.freight.shopTargets() || [] : [];
    const P = m.layout.PLACES;
    const curbs = shops.map((t) => ({ x: t.x, y: t.y })).concat(['p:cafe', 'p:toy', 'p:flower', 'p:school', 'p:clinic'].map((k) => P[k]).filter(Boolean));
    if (curbs.length) this.drive(c, from, from, curbs[m.rng.int(curbs.length)]);
  }

  /** a parked car leaves `from` for `to` (driveway out, lanes, driveway in); `via` = an errand stop on the way */
  drive(c, from, to, via) {
    const m = this.m;
    const spec = m.vehicleSpec(c.key);
    const v = m.sim.add(Object.assign({}, spec, { role: 'car', pid: c.pid, state: 'bay' }));
    v.bay = { x: from.x, y: from.y, dir: from.dir, lot: !!from.lot, id: from.id };
    v.bayPos = from.pos;
    v.x = from.x; v.y = from.y; v.dk = from.dk || from.dir;
    const home = { pos: to.pos, bay: { x: to.x, y: to.y, dir: to.dir, lot: !!to.lot, id: to.id }, tag: 'park' };
    const vp = via ? m.pointPos(via.x, via.y, v.len) : null;
    if (vp) v.after = home;
    if (!m.go(v, vp ? { pos: vp, tag: 'errand', dwell: 2 } : home)) { m.sim.remove(v.id); return false; }
    c.vid = v.id; c.to = to.id;
    from.taken = null; to.taken = c.pid;
    m.emit({ t: 'veh:car', op: 'leave', pid: c.pid, from: from.id, to: to.id, id: v.id });
    return true;
  }

  arriveCar(v) {
    const m = this.m;
    const c = this.cars.find((x) => x.vid === v.id);
    if (c) {
      c.at = c.to; c.vid = 0; c.to = null;
      const cfg = m.cfg.cars;
      c.next = m.T + cfg.parkMin + (cfg.parkMax - cfg.parkMin) * m.rng.next();
      const s = this.spots.get(c.at);
      if (s) s.dk = v.dk;
      m.emit({ t: 'veh:car', op: 'park', pid: c.pid, at: c.at, id: v.id });
    }
    m.sim.remove(v.id);
  }

  /** parked cars to draw: [{ pid, key, x, y, dk, spot }] */
  parked() {
    const out = [];
    for (const c of this.cars) {
      if (c.vid || !c.at) continue;
      const s = this.spots.get(c.at);
      if (s) out.push({ pid: c.pid, key: c.key, x: s.x, y: s.y, dk: s.dk || s.dir, spot: s.id });
    }
    return out;
  }

  // ------------------------------------------------------------------------------------------ dispatch (v8)
  /** any vehicle key from the depot to (x, y): veh:dispatch { op: 'arrive' | 'back' } follow */
  dispatch(key, to, opts = {}) {
    const m = this.m;
    const spec = m.vehicleSpec(key);
    const tp = m.pointPos(to.x, to.y, spec.len);
    if (!tp) return 0;
    const v = m.sim.add(Object.assign({}, spec, { role: 'dispatch', siren: !!opts.siren, cap: opts.cap || 1 }));
    if (!m.go(v, { pos: tp, tag: 'dispatch', dwell: opts.stay || 6 })) { m.sim.remove(v.id); return 0; }
    this.dispatches.push({ vid: v.id, id: opts.id || v.id, to, state: 'go', back: opts.back !== false });
    return v.id;
  }
  arriveDispatch(v) { const d = this.dispatches.find((x) => x.vid === v.id); if (d) { d.state = 'there'; this.m.emit({ t: 'veh:dispatch', op: 'arrive', id: d.id, vid: v.id }); } }
  departDispatch(v) {
    const m = this.m;
    const d = this.dispatches.find((x) => x.vid === v.id);
    if (d) { d.state = 'back'; m.emit({ t: 'veh:dispatch', op: 'back', id: d.id, vid: v.id }); this.dispatches.splice(this.dispatches.indexOf(d), 1); }
    if (!d || !d.back) { m.sim.remove(v.id); return; }
    m.retireVehicle(v, false);
  }

  // ------------------------------------------------------------------------------------------ step
  update(dt) {
    const m = this.m;
    // vehicles waiting to come out of a depot / a bay: when their lane has room
    for (const v of m.sim.list) {
      if ((v.state !== 'hidden' && v.state !== 'bay') || !v.pending) continue;
      const p = v.pending;
      if (p.merge && !m.sim.canMerge(p.merge.lane, p.merge.s, v.len, v)) { v.waitOut = (v.waitOut || 0) + dt; continue; }
      v.pending = null; v.waitOut = 0;
      const wasBay = v.state === 'bay';
      m.sim.setPath(v, p.path, p.goals, p.ps || 0);
      if (!wasBay) m.emit({ t: 'veh:depot', id: v.id, op: 'out', key: v.key, role: v.role });
    }
    // freight whose yard became reachable later (the road was built)
    for (const id of this.freight.concat(this.porters)) {
      const v = m.sim.get(id);
      if (v && v.wantYard) { const yard = m.placePos('p:yard', v.len); if (yard && m.go(v, { pos: yard, bay: yard.bay, tag: 'yard' })) v.wantYard = false; }
    }
    this.updateCars(dt);
  }
}

export function sumItems(o) { let n = 0; for (const k in o || {}) n += o[k] | 0; return n; }
export function addItems(a, b) { for (const k in b || {}) a[k] = (a[k] || 0) + (b[k] | 0); return a; }
