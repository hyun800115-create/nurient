// VehiclesHost (vehicles_runtime, docs/v5_v8_plan.md §5.2 / §6.3): ports -> the pure model -> the Phaser view.
// Runs headless when no view class is given (Node tests): everything the game sees goes through `api` and events.
//
//   host = new VehiclesHost(ports, savedSlice, { View, tuning })
//   host.update(dt) · host.onFeed(ev) · host.serialize() · host.api (gs.later.vehicles) · host.destroy()

import * as layout from './layout.js';
import { VEHICLES_TUNING, vehiclesTuning } from './tuning.js';
import { VehiclesModel } from './model/VehiclesModel.js';
import { sanitizeVehicles, fitVehicles } from './save.js';
import { vt } from './strings.js';
import { eraOf } from './model/eras.js';

/** the built ids the v4 Site flow reports (P29) -> what the model builds */
export const SITE_IDS = {
  v5_stable: 'depot', v5_road: 'road', v5_yard: 'yard', v5_busdepot: 'busDepot', v5_lot: 'lot',
  v5_stop_S1: 'stop:S1', v5_stop_S4: 'stop:S4', v5_stop_S5: 'stop:S5',
};

export class VehiclesHost {
  constructor(ports, saved, opts = {}) {
    this.ports = ports;
    this.opts = opts;
    this.cfg = opts.tuning ? vehiclesTuning({ v5: { vehicles: opts.tuning } }) : vehiclesTuning(opts.balance || null) || VEHICLES_TUNING;
    // low tier (the game's quality setting): 2 car colourways, nobody drawn on board (plan §6.3 budgets)
    if (opts.tier === 'low' || (ports.tier && ports.tier() === 'low')) {
      this.cfg = Object.assign({}, this.cfg, { cars: Object.assign({}, this.cfg.cars, { colours: 2 }), budget: Object.assign({}, this.cfg.budget, { passengersDrawn: 0 }) });
    }
    const clean = sanitizeVehicles(saved);
    const P = ports;
    this.waiters = new Map();         // promise resolvers (rides, drives, dispatches)
    this.model = new VehiclesModel({
      layout, tuning: this.cfg, manifest: P.assets && P.assets.manifest ? P.assets.manifest('vehicles') : null,
      saved: clean, seed: opts.seed || 20261010, T: P.clock ? P.clock.T() : 0, rank: P.rank ? P.rank() : 2,
      env: {
        live: (x, y) => (P.view && P.view.onScreen ? P.view.onScreen(x, y, this.cfg.budget.liveMargin) : true),
        walkers: () => (P.town && P.town.walkers ? P.town.walkers() : null),
        xingBlocked: (k, line) => (P.rail && P.rail.blocking ? P.rail.blocking(k, line) : false),
        board: (stop, n, line, to) => (P.town && P.town.board ? P.town.board(stop, n, line, to) : []),
        alight: (stop, riders, line) => { if (P.town && P.town.alight) P.town.alight(stop, riders, line); },
        freight: P.freight || null,
        homes: () => (P.homes ? P.homes() : []),
        flag: (f) => (P.flag ? P.flag(f) : false),
        day: (T) => (P.clock && P.clock.dayOf ? P.clock.dayOf(T) : Math.floor(T / 600)),
      },
    });
    // the model may know a later era than the rank port (a save): the roads follow the model
    if (P.rank) this.model.setRank(Math.max(P.rank(), clean && clean.era >= 3 ? 3 : 0));
    this.addStreets();
    this.applyClass(false);
    this.model.setRoads(P.roads.net(), this.tracks());
    this.wantArt();
    this.view = opts.View && P.world && P.world.scene ? new opts.View(this, P) : null;
    this.api = this.makeApi();
    this.lastHonk = -99;
  }

  // ------------------------------------------------------------------------------------------ art (late files)
  /** the atlases this era needs now: its vehicles, the depots / signs, the palette's cars (≤ 4 colourways) */
  artKeys() {
    const m = this.model, out = new Set();
    const era = m.era >= 3 ? 3 : 2;
    const add = (role) => { const k = m.roleKey(role); if (k) out.add('veh_' + k); };
    // only what is on the roads now: buses of open lines, the wagon / truck, the porter sleigh, the chief's ride
    if (m.transit.lineList().some((l) => l.buses > 0)) { add('bus'); if (era < 3) out.add('veh_horse_sleigh_bus_over'); }
    if (m.freightWanted() > 0) add('freight');
    if (m.porterWanted()) add('porter');
    const cv = m.chief.vehicle(); if (cv) out.add('veh_' + cv.key);
    if (m.built.depot) for (const k of ['veh_depots', 'veh_street', 'veh_signs']) out.add(k);
    if (era >= 3 && (m.built.lot || m.fleet.cars.length)) { out.add('veh_lots'); for (const k of m.fleet.palette || []) out.add('veh_' + k); }
    return Array.from(out);
  }
  /** ask the game for late atlases (Assets.loadFragment through ports.assets.fragment), each once */
  wantArt(keys) {
    const P = this.ports;
    if (!P.assets || !P.assets.fragment) return;
    this.asked = this.asked || new Set();
    const k2 = (keys || this.artKeys()).filter((k) => !this.asked.has(k));
    if (!k2.length) return;
    for (const k of k2) this.asked.add(k);
    P.assets.fragment('vehicles', { only: k2 });
  }

  lang() { return this.ports.lang ? this.ports.lang() : 'ko'; }
  T() { return this.ports.clock ? this.ports.clock.T() : this.model.T; }

  // ------------------------------------------------------------------------------------------ roads
  /** add the layout streets the built flags open (the game appends them to WORLD.v4.streets: P19) */
  addStreets() {
    const P = this.ports, added = [];
    for (const s of this.model.streets()) if (P.roads.addStreet(s, layout.V5_EUP[s.id], this.classNow())) added.push(s.id);
    return added;
  }
  classNow() { return this.model.era >= 3 ? 'asphalt' : 'cobble'; }
  /** every road street at this era's class (읍 cobble, 도시 asphalt); `wipe` = the ceremony's outward repave */
  applyClass(wipe) {
    const P = this.ports, cls = this.classNow();
    if (!P.roads.upgrade) return;
    const ids = layout.CITY_UPGRADE.streets.filter((id) => this.model.era >= 3 || ['main', 'back', 'ave'].indexOf(id) < 0 || true);
    if (!wipe) { for (const id of ids) P.roads.upgrade(id, cls); return; }
    // outward from the main x 중앙로 junction, one street every wipeStep s (the ground re-bakes street by street)
    const [ci, cj] = layout.CITY_UPGRADE.centre;
    const dist = (id) => { const s = (P.roads.street && P.roads.street(id)) || null; if (!s) return 99; const mi = (s.i[0] + s.i[1]) / 2, mj = (s.j[0] + s.j[1]) / 2; return Math.hypot(mi - ci, mj - cj); };
    const step = (this.cfg.ceremony && this.cfg.ceremony.wipeStep) || 0.6;
    ids.slice().sort((a, b) => dist(a) - dist(b)).forEach((id, k) => this.later(step * k, () => { P.roads.upgrade(id, cls); this.model.setRoads(P.roads.net(), this.tracks()); }));
  }
  tracks() { return this.ports.roads.tracks ? this.ports.roads.tracks() : layout.sledTracks(null); }
  /** something of ours was built (P29 Site flow, or the lab): streets appear, lines and freight start */
  build(what) {
    const added = this.model.build(what);
    if (added.length) {
      for (const s of added) this.ports.roads.addStreet(s, layout.V5_EUP[s.id], this.classNow());
      this.model.setRoads(this.ports.roads.net(), this.tracks());
    }
    this.wantArt();
    if (this.view) this.view.built(what);
    return true;
  }

  // ------------------------------------------------------------------------------------------ timers (pure, game time)
  later(s, fn) { (this.timers = this.timers || []).push({ t: this.model.T + s, fn }); }
  runTimers() {
    if (!this.timers || !this.timers.length) return;
    const due = this.timers.filter((x) => x.t <= this.model.T);
    if (!due.length) return;
    this.timers = this.timers.filter((x) => x.t > this.model.T);
    for (const d of due) d.fn();
  }

  // ------------------------------------------------------------------------------------------ frame
  update(dt) {
    const P = this.ports;
    // the chief's stick while driving (the game's joystick / keys)
    if (this.model.chief.active() && P.input && P.input.stick) { const s = P.input.stick(); this.model.chief.stick(s.x, s.y); }
    // riding: any stick input gets off at the next stop
    const ride = this.model.transit.riding();
    if (ride && P.input && P.input.stick) { const s = P.input.stick(); if (Math.hypot(s.x, s.y) > 0.4 && !ride.leave) this.model.transit.leave(); }
    this.model.update(dt, this.T());
    this.runTimers();
    for (const ev of this.model.drain()) this.onModel(ev);
    if (this.view) this.view.update(dt);
  }

  onModel(ev) {
    const P = this.ports, lang = this.lang();
    switch (ev.t) {
      case 'veh:arrive':
        if (ev.stop === 'S1' && (ev.riders || ev.off) && P.ui && P.ui.toast && !this.firstPlaza) { this.firstPlaza = true; P.ui.toast(vt(lang, 'busPlaza', { n: ev.off || ev.riders })); }
        break;
      case 'veh:ride':
        if (ev.chief) this.settleRide(ev);
        break;
      case 'veh:driveDone': this.settle('drive', { stars: ev.stars, timeS: ev.s, par: ev.par, best: ev.best, late: ev.late }); break;
      case 'veh:drive': if (ev.op === 'abort') this.settle('drive', { stars: 0, aborted: true }); break;
      case 'veh:dispatch': this.settle('dispatch:' + ev.id, { arrived: ev.op === 'arrive' }, ev.op !== 'arrive'); break;
      case 'veh:honk': this.honked(ev); break;
      case 'veh:bell': if (P.town && P.town.hurry) P.town.hurry(ev.x, ev.y, 260); break;
      default: break;
    }
    if (this.view) this.view.onModel(ev);
    // module events out (veh:arrive / ride / driveDone / freight / era ... ); internal ones stay inside
    if (P.emit && /^veh:(arrive|ride|driveDone|freight|era|load|built|drop|drive)$/.test(ev.t)) P.emit(ev);
  }

  honked(ev) {
    const P = this.ports;
    // people ahead hurry along; a stopped car in front moves on
    if (P.town && P.town.hurry) P.town.hurry(ev.x, ev.y, 260);
    const b = ev.blocked;
    if (b && b.t === 'veh') { const w = this.model.sim.get(b.id); if (w && w.state === 'dwell' && w.role !== 'bus') w.dwell = Math.min(w.dwell, 0.4); }
  }

  settleRide(ev) {
    if (ev.op === 'board') { const w = this.waiters.get('ride'); if (w && w.onBoard) w.onBoard(ev); return; }
    if (ev.op === 'alight') this.settle('ride', { arrived: !!ev.arrived, at: ev.stop });
  }
  settle(key, val, drop) {
    const w = this.waiters.get(key);
    if (!w) return;
    if (drop || key !== 'dispatch' || true) this.waiters.delete(key);
    try { w.resolve(val); } catch (e) { /* the caller */ }
  }
  wait(key) { return new Promise((resolve) => { const old = this.waiters.get(key); if (old) old.resolve({ replaced: true }); this.waiters.set(key, { resolve }); }); }

  // ------------------------------------------------------------------------------------------ feed (game -> module)
  onFeed(ev) {
    if (!ev || !ev.t) return;
    const m = this.model;
    switch (ev.t) {
      case 'rank': {
        const lv = ev.level | 0;
        if (eraOf(lv) !== m.era) {
          const city = eraOf(lv) >= 3;
          m.setRank(lv);
          this.wantArt();
          this.addStreets();
          if (city && ev.ceremony && this.view) { this.applyClass(true); this.view.ceremony(); }
          else { this.applyClass(false); m.setRoads(this.ports.roads.net(), this.tracks()); }
        }
        break;
      }
      case 'built': { const what = SITE_IDS[ev.siteId] || SITE_IDS[ev.key]; if (what) this.build(what); break; }
      case 'tap': if (m.chief.active()) m.chief.honk(); break;
      case 'region': case 'flag': m.refresh(); break;
      default: break;
    }
  }

  // ------------------------------------------------------------------------------------------ save
  serialize() { return fitVehicles(sanitizeVehicles(this.model.serialize())); }
  state() {
    const m = this.model;
    return { era: m.era, vehicles: m.sim.list.length, moving: m.sim.list.filter((v) => v.state === 'drive').length, lines: m.transit.lineList(), riders: m.ridersToday(), freight: Object.assign({}, m.fleet.totals), cars: m.fleet.cars.length, driving: m.chief.active() };
  }

  // ------------------------------------------------------------------------------------------ api (gs.later.vehicles)
  makeApi() {
    const m = this.model;
    const self = this;
    return {
      era: () => m.era,
      lines: () => m.transit.lineList(),
      eta: (stopId) => m.transit.eta(stopId),
      ridersToday: () => m.ridersToday(),
      /** the chief rides a bus from one stop to another: Promise<{ arrived, at }> */
      ride(fromStop, toStop) {
        if (!m.stopBuilt(fromStop) || !m.stopBuilt(toStop)) return Promise.resolve({ arrived: false, reason: 'stop' });
        const b = m.transit.book(fromStop, toStop);
        self.booking = b;
        const p = self.wait('ride');
        if (self.view) self.view.rideBooked(b);
        return p;
      },
      cancelRide() { if (self.booking) m.transit.cancel(self.booking.id); self.settle('ride', { arrived: false, cancelled: true }); },
      riding: () => m.transit.riding(),
      /** a one-off vehicle on a route ([x, y] points: from the first to the last) -> id */
      spawn(key, route, opts = {}) {
        const a = route[0], b = route[route.length - 1];
        const spec = m.vehicleSpec(key);
        const from = m.pointPos(a[0], a[1], spec.len), to = m.pointPos(b[0], b[1], spec.len);
        if (!from || !to) return 0;
        const v = m.sim.add(Object.assign({}, spec, { role: opts.role || 'extra' }));
        const path = m.graph.route(from, to);
        if (!path) { m.sim.remove(v.id); return 0; }
        m.sim.setPath(v, path, [{ at: m.graph.pathLen(path), dwell: opts.dwell || 0, tag: 'extra' }]);
        return v.id;
      },
      despawn(id) { m.sim.remove(id); },
      /** v8: a vehicle from the depot to a place and back: Promise<{ arrived }> */
      dispatch(kind, to, opts = {}) {
        const id = m.fleet.dispatch(kind, to, opts);
        if (!id) return Promise.resolve({ arrived: false });
        const d = m.fleet.dispatches.find((x) => x.vid === id);
        return self.wait('dispatch:' + (d ? d.id : id));
      },
      /** the chief's delivery run: Promise<{ stars, timeS, par }> (stars 0 when aborted) */
      drive(spec) {
        const r = m.chief.start(spec || {});
        if (!r.ok) return Promise.resolve({ stars: 0, aborted: true, reason: r.reason });
        const p = self.wait('drive');
        self.wantArt();                // the sled / the truck (its atlas is fetched now if this era has not used it yet)
        if (self.view) self.view.driveStarted(r, spec);
        return p;
      },
      abortDrive() { m.chief.abort(); for (const ev of m.drain()) self.onModel(ev); },
      chiefDriving: () => m.chief.active(),
      driveState: () => m.chief.state(),
      parkedNear(x, y, r = 300) { return m.fleet.parked().filter((c) => Math.hypot(c.x - x, (c.y - y) * 2) <= r * 2); },
      /** a stop within reach of (x, y) (the transit chip), or null */
      stopNear(x, y, r = 170) {
        let best = null, bd = r;
        for (const id in layout.STOPS) { if (!m.stopBuilt(id)) continue; const s = layout.STOPS[id]; const d = Math.hypot(s.x - x, (s.y - y) * 2) / 2; if (d < bd) { bd = d; best = id; } }
        return best;
      },
      destinations: (stopId) => m.transit.destinations(stopId),
      build: (what) => self.build(what),
      has: (cap) => (cap === 'veh:sled' ? m.era >= 2 && m.built.depot : cap === 'veh:truck' ? m.era >= 3 : false),
      state: () => self.state(),
      /** the late atlases this era wants now (prefetch / Residency hints) */
      artKeys: () => self.artKeys(),
    };
  }

  objects() { return this.view ? this.view.objects() : 0; }
  destroy() { if (this.view) this.view.destroy(); this.view = null; for (const w of this.waiters.values()) try { w.resolve({ destroyed: true }); } catch (e) { /* */ } this.waiters.clear(); }
}
