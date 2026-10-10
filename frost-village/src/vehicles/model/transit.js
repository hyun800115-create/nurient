// Transit (vehicles_runtime model/transit.js): bus lines, stops, per-bus phase clocks, riders per game day,
// fast-travel bookings for the chief. Pure.
//
// A line is a loop of stops (layout.LINES); its buses run the legs stop -> next stop on the lane graph (all v5 stops
// sit on +j curbs, so a bus serves them westbound and turns at the dead ends between). The terminal keeps the
// timetable: a bus waits there until its departure slot, so n buses stay `cycle / n` apart (cycle = max(drive time,
// n × headway)). Buses are not saved: on load each restarts at the place its phase clock says.

const ROUND = (x) => Math.round(x * 10) / 10;

export class Transit {
  /** m: the VehiclesModel (graph, sim, cfg, layout, built, era, env, emit) */
  constructor(m) {
    this.m = m;
    this.lines = new Map();     // id -> line
    this.queues = new Map();    // stop id -> [{ pid, look, to, line? }] people waiting
    this.bookings = [];         // chief rides
    this.t0 = 0;                // timetable origin (game s)
    this.posCache = new Map();
  }

  // ------------------------------------------------------------------------------------------ setup
  /** (re)build every line from the layout + built flags; buses keep their riders */
  rebuild() {
    const m = this.m, L = m.layout.LINES;
    this.posCache.clear();
    const old = this.lines;
    this.lines = new Map();
    for (const id in L) {
      const def = L[id];
      const want = m.lineBuses(id);
      if (!want || !this.lineOpen(def)) {
        const ol = old.get(id);
        if (ol) for (const vid of ol.buses) this.retire(vid, false);
        continue;
      }
      const stops = def.short && !m.built[def.short.without] ? def.short.stops : def.stops;
      const terminal = def.short && !m.built[def.short.without] ? def.short.terminal : def.terminal;
      const key = m.roleKey('bus');
      const spec = m.vehicleSpec(key);
      const legs = [];
      let ok = true;
      for (let k = 0; k < stops.length; k++) {
        const a = stops[k], b = stops[(k + 1) % stops.length];
        const pa = this.stopPos(a, spec.len), pb = this.stopPos(b, spec.len);
        const path = pa && pb ? m.graph.route(pa, pb) : null;
        if (!path) { ok = false; break; }
        const tdrive = m.driveTime(path, spec);
        legs.push({ from: a, to: b, path, len: m.graph.pathLen(path), t: tdrive });
      }
      if (!ok || !legs.length) continue;
      const dwell = m.cfgFor(key).dwell || 8;
      const drive = legs.reduce((s, l) => s + l.t, 0) + dwell * stops.length;
      const headway = m.cfgFor(key).headway || 60;
      const n = Math.max(1, want);
      const cycle = Math.max(drive, n * headway);
      const line = { id, def, stops, terminal, legs, key, spec, cycle, drive, dwell, headway: cycle / n, n, buses: [], riders: 0, color: def.color };
      // keep the buses of the old line that match (same art); retire the rest, add the missing
      const ol = old.get(id);
      if (ol) for (const vid of ol.buses) { const v = m.sim.get(vid); if (v && v.key === key && v.role === 'bus' && line.buses.length < n) line.buses.push(vid); else this.retire(vid, false); }
      this.lines.set(id, line);
    }
    for (const line of this.lines.values()) {
      for (const vid of line.buses) { const v = m.sim.get(vid); if (v) { v.line = line.id; this.reroute(v, line); } }
      this.ensureBuses(line);
    }
  }

  lineOpen(def) {
    const m = this.m;
    for (const n of def.needs || []) {
      if (n.startsWith('stop:')) { if (!m.stopBuilt(n.slice(5))) return false; }
      else if (/^v\d$/.test(n)) { if (!m.env.flag || !m.env.flag(n)) return false; }
      else if (!m.built[n]) return false;
    }
    return true;
  }

  /** where a bus of length len halts at stop id: { lane, s } (cached) */
  stopPos(id, len) {
    const key = id + '|' + len + '|' + this.m.graph.version;
    if (this.posCache.has(key)) return this.posCache.get(key);
    const st = this.m.layout.STOPS[id] || (this.m.extraStops && this.m.extraStops[id]);
    let r = null;
    if (st) {
      const g = this.m.graph;
      const on = (l) => l.kind === 'road' && !l.stub && l.street === st.street && (l.dk === 'NW' || l.dk === 'SW');
      const sn = g.snap(st.x, st.y, on) || g.snap(st.x, st.y);
      if (sn) r = { lane: sn.lane, s: g.fit(sn.lane, sn.s, len) };
    }
    this.posCache.set(key, r);
    return r;
  }

  // ------------------------------------------------------------------------------------------ buses
  /** spawn buses up to the line's count (from the depot; on a fresh load straight onto their phase position) */
  ensureBuses(line) {
    const m = this.m;
    while (line.buses.length < line.n) {
      const k = line.buses.length;
      const v = m.sim.add(Object.assign({}, line.spec, { role: 'bus', line: line.id, riders: [], slot: k }));
      line.buses.push(v.id);
      if (m.loading) this.placeOnPhase(v, line, k);
      else this.fromDepot(v, line);
    }
  }

  /** a new bus leaves the depot for the terminal */
  fromDepot(v, line) {
    const m = this.m;
    const tp = this.stopPos(line.terminal, v.len);
    v.leg = line.stops.indexOf(line.terminal) - 1;
    if (!tp || !m.go(v, { pos: tp, tag: 'stop:' + line.terminal, dwell: line.dwell })) this.placeOnPhase(v, line, v.slot | 0);
  }

  /** put a bus where its phase clock says (load / no depot): at a stop or along a leg */
  placeOnPhase(v, line, k) {
    const m = this.m;
    const T = m.T;
    const N = line.stops.length;
    const ti = line.stops.indexOf(line.terminal);
    let ph = ((T - this.t0 - k * line.headway) % line.cycle + line.cycle) % line.cycle;
    let path = null, goals = null, ps = 0;
    // walk the loop from the terminal: dwell (the layover), leg, dwell, leg...
    for (let n = 0; n < N && !path; n++) {
      const li = (ti + n) % N;
      const leg = line.legs[li];
      const dw = n === 0 ? line.cycle - line.drive + line.dwell : line.dwell;
      if (ph < dw) {
        const pos = this.stopPos(leg.from, v.len);
        v.leg = (li - 1 + N) % N;
        path = [{ t: 'L', id: pos.lane, s0: pos.s, s1: pos.s }]; goals = [{ at: 0, dwell: 0.2, tag: 'stop:' + leg.from }];
        break;
      }
      ph -= dw;
      if (ph < leg.t) {
        v.leg = li;
        path = leg.path; goals = [{ at: leg.len, dwell: line.dwell, tag: 'stop:' + leg.to }];
        ps = Math.min(leg.len - 0.5, leg.len * (ph / leg.t));
        break;
      }
      ph -= leg.t;
    }
    if (!path) { const pos = this.stopPos(line.terminal, v.len); v.leg = (ti - 1 + N) % N; path = [{ t: 'L', id: pos.lane, s0: pos.s, s1: pos.s }]; goals = [{ at: 0, dwell: 0.2, tag: 'stop:' + line.terminal }]; }
    // never on top of another vehicle: slide back along the leg until clear (or wait in the depot)
    m.sim.occupy();
    for (let tries = 0; tries < 12; tries++) {
      if (this.clearAt(v, path, ps)) { m.sim.setPath(v, path, goals, ps); v.dest = null; return; }
      ps -= v.len + 2;
      if (ps < 0) break;
    }
    this.fromDepot(v, line);
  }

  /** is the body of v free of others if placed at path coordinate ps? */
  clearAt(v, path, ps) {
    const m = this.m;
    let c = 0;
    for (const p of path) {
      const L = p.s1 - p.s0;
      const a = ps - v.len / 2 - 1.5, b = ps + v.len / 2 + 1.5;
      if (b >= c && a <= c + Math.max(L, 0.01) && p.t !== 'D') {
        const arr = m.sim.occ.get((p.t === 'C' ? 'C' : 'L') + p.id);
        const la = p.s0 + Math.max(0, a - c), lb = p.s0 + Math.min(L, b - c);
        if (arr) for (const o of arr) if (o.v !== v && o.b > la - 0.01 && o.a < lb + 0.01) return false;
      }
      c += L;
    }
    return true;
  }

  /** after a graph rebuild: continue to the next stop from where the bus is */
  reroute(v, line) {
    const m = this.m;
    if (v.state === 'hidden') { v.pending = null; this.fromDepot(v, line); return; }
    const N = line.stops.length;
    const next = line.stops[((v.leg | 0) + 1 + N) % N];
    const tp = this.stopPos(next, v.len);
    if (v.state === 'dwell') {
      // standing at a stop: stay there on the new lanes
      const here = m.herePos(v);
      if (here) { m.sim.setPath(v, [{ t: 'L', id: here.lane, s0: here.s, s1: here.s }], [{ at: 0, dwell: Math.max(0.2, v.dwell), tag: 'hold' }]); return; }
    }
    if (!tp || !m.go(v, { pos: tp, tag: 'stop:' + next, dwell: line.dwell })) this.placeOnPhase(v, line, v.slot | 0);
  }

  /** take a bus off its line: its riders get off (the host walks them on), the bus drives into the depot */
  retire(vid, drop) {
    const m = this.m;
    const v = m.sim.get(vid);
    if (!v) return;
    if (v.riders && v.riders.length && m.env.alight) m.env.alight(null, v.riders);
    v.riders = [];
    for (const b of this.bookings) if (b.bus === vid && b.state === 'riding') { b.state = 'done'; b.at = null; m.emit({ t: 'veh:ride', line: v.line, chief: true, n: 0, op: 'alight', stop: null, arrived: false }); }
    m.retireVehicle(v, drop);
  }

  // ------------------------------------------------------------------------------------------ running
  update(dt) { void dt; }

  /** passenger seats of a bus (tuning seats, never more than the art has besides the driver) */
  seats(v) { const c = this.m.cfgFor(v.key), sp = this.m.vehicleSpec(v.key); return Math.max(1, Math.min(c.seats || 8, (sp.seatCount || 9) - (sp.driverSeat === null ? 0 : 1))); }

  /** sim event: a bus reached a stop */
  arrive(v, stopId) {
    const m = this.m;
    const line = this.lines.get(v.line);
    if (!line) return;
    v.leg = line.stops.indexOf(stopId);
    const T = m.T;
    // the chief rides?
    let chiefOff = false;
    for (const b of this.bookings) {
      if (b.bus === v.id && b.state === 'riding' && (b.to === stopId || b.leave)) { b.state = 'done'; b.at = stopId; chiefOff = true; m.emit({ t: 'veh:ride', line: line.id, chief: true, n: 0, op: 'alight', stop: stopId, arrived: b.to === stopId }); }
    }
    // riders off
    const off = [], stay = [];
    for (const r of v.riders || []) (r.to === stopId ? off : stay).push(r);
    v.riders = stay;
    if (off.length && m.env.alight) m.env.alight(stopId, off, line.id);
    // the chief gets on first (a full bus still takes him: he stands by the driver)
    for (const b of this.bookings) {
      if (b.state === 'waiting' && b.from === stopId && line.stops.indexOf(b.to) >= 0 && !this.chiefOn(v)) {
        b.state = 'riding'; b.bus = v.id; b.line = line.id;
        m.emit({ t: 'veh:ride', line: line.id, chief: true, n: 0, op: 'board', stop: stopId, id: v.id });
      }
    }
    // riders on (toward stops this line serves next)
    const free = this.seats(v) - v.riders.length - (this.chiefOn(v) ? 1 : 0);   // may be < 1: nobody else gets on
    let on = [];
    if (free > 0) {
      const q = this.queue(stopId);
      const serves = new Set(line.stops);
      for (let i = 0; i < q.length && on.length < free;) { if (serves.has(q[i].to) && q[i].to !== stopId) on.push(q.splice(i, 1)[0]); else i++; }
      if (on.length < free && m.env.board) {
        const got = m.env.board(stopId, free - on.length, line.id, line.stops.filter((s) => s !== stopId)) || [];
        for (const r of got) if (r && serves.has(r.to) && r.to !== stopId) on.push(r);
      }
      on = on.slice(0, free);
      for (const r of on) v.riders.push(r);
    }
    if (on.length) m.countRiders(on.length, line.id);
    m.emit({ t: 'veh:arrive', id: v.id, stop: stopId, line: line.id, riders: on.length, off: off.length, key: v.key });
    // dwell: boarding takes time; the terminal holds the timetable
    let dwell = Math.max(line.dwell * (on.length || off.length || chiefOff ? 1 : 0.5), 1 + 0.6 * (on.length + off.length));
    if (stopId === line.terminal) {
      const k = v.slot || 0;
      const sinceSlot = ((T - this.t0 - k * line.headway) % line.cycle + line.cycle) % line.cycle;
      const wait = sinceSlot < 1 ? 0 : line.cycle - sinceSlot;
      if (wait < line.cycle - line.drive + line.dwell + 2) dwell = Math.max(dwell, wait);
    }
    v.dwell = dwell;
    v.dwellT0 = T;
    // the next leg starts when the dwell ends (see depart)
  }

  /** sim event: a bus left a stop -> the next leg */
  depart(v) {
    const m = this.m;
    const line = this.lines.get(v.line);
    if (!line) return;
    const li = ((v.leg | 0) + line.stops.length) % line.stops.length;
    const leg = line.legs[li];
    if (!leg) return;
    m.sim.setPath(v, leg.path, [{ at: leg.len, dwell: line.dwell, tag: 'stop:' + leg.to }]);
  }

  queue(stopId) { let q = this.queues.get(stopId); if (!q) { q = []; this.queues.set(stopId, q); } return q; }
  /** people start waiting at a stop (the village side: visitors going home) */
  wait(stopId, riders) { const q = this.queue(stopId); for (const r of riders) q.push(r); }

  chiefOn(v) { return this.bookings.some((b) => b.bus === v.id && b.state === 'riding'); }

  // ------------------------------------------------------------------------------------------ queries
  /** seconds until the next bus (of any line, or `lineId`) stands at the stop; Infinity when none serves it */
  eta(stopId, lineId) {
    const m = this.m;
    let best = Infinity;
    for (const line of this.lines.values()) {
      if (lineId && String(line.id) !== String(lineId)) continue;
      const N = line.stops.length;
      if (line.stops.indexOf(stopId) < 0) continue;
      for (const vid of line.buses) {
        const v = m.sim.get(vid);
        if (!v) continue;
        // v.leg = index of the stop the bus stands at (dwell) or left last (driving)
        const cur = (((v.leg | 0) % N) + N) % N;
        let t, at;
        if (v.state === 'dwell') {
          if (line.stops[cur] === stopId) { best = 0; continue; }
          t = Math.max(0, v.dwell) + line.legs[cur].t; at = (cur + 1) % N;
        } else if (v.state === 'drive' && v.path) {
          t = Math.max(0, v.total - v.ps) / Math.max(1, v.vmax * 0.8) + 1.5; at = (cur + 1) % N;
        } else { t = line.headway; at = line.stops.indexOf(line.terminal); }
        for (let n = 0; n < N && line.stops[at] !== stopId; n++) { t += line.dwell + line.legs[at].t; at = (at + 1) % N; }
        best = Math.min(best, t);
      }
    }
    return best === Infinity ? Infinity : ROUND(best);
  }

  /** stops a chief standing near (x, y) can ride to: [{ stop, line, eta }] */
  destinations(fromStop) {
    const out = [];
    for (const line of this.lines.values()) {
      if (line.stops.indexOf(fromStop) < 0) continue;
      for (const s of line.stops) if (s !== fromStop && !out.some((o) => o.stop === s)) out.push({ stop: s, line: line.id });
    }
    const eta = this.eta(fromStop);
    for (const o of out) o.eta = eta;
    return out;
  }

  /** the chief books a ride: { id, from, to, state } */
  book(from, to) {
    const b = { id: (this.bookings.length ? this.bookings[this.bookings.length - 1].id : 0) + 1, from, to, state: 'waiting', bus: 0 };
    this.bookings = this.bookings.filter((x) => x.state !== 'done' && x.state !== 'cancel');
    this.bookings.push(b);
    return b;
  }
  cancel(id) { for (const b of this.bookings) if (b.id === id && b.state === 'waiting') b.state = 'cancel'; }
  /** joystick input while riding: get off at the next stop */
  leave() { for (const b of this.bookings) if (b.state === 'riding') b.leave = true; }
  riding() { return this.bookings.find((b) => b.state === 'riding') || null; }

  lineList() { return Array.from(this.lines.values()).map((l) => ({ id: l.id, stops: l.stops.slice(), buses: l.buses.length, cycle: ROUND(l.cycle), headway: ROUND(l.headway) })); }
}
