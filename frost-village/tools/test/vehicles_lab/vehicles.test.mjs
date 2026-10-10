// vehicles_runtime Node tests (docs/v5_v8_plan.md §6.3 "Tests"):
//   nice -n 15 node --test tools/test/vehicles_lab/
// lanes + routes on the real v4 + v5 RoadNet (10,000 random routes), the simulation's invariants (no two bodies
// overlap on a lane, no conflicting connectors held, nobody stuck, walkers never hit, both rail lines respected),
// transit (headways, dwell, ETA, booking, riders/day), freight conservation, the chief's drive (8 stick directions,
// par / stars, never fails), eras, markings, determinism, save round trip + fuzz, perf per tick.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeModel, run, invariants, fakeEnv, layout, VEHICLES_TUNING, MAN } from './fake_env.mjs';
import { makeRoads, WORLD } from './world_stub.js';
import { LaneGraph } from '../../../src/vehicles/model/lanes.js';
import { VehicleSim } from '../../../src/vehicles/model/VehicleSim.js';
import { Rng } from '../../../src/vehicles/model/rng.js';
import { markings } from '../../../src/vehicles/model/markings.js';
import { sanitizeVehicles, fitVehicles, VEHICLES_SLICE } from '../../../src/vehicles/save.js';
import { specOf, carPalette, CAR_KEYS, roleKey } from '../../../src/vehicles/model/eras.js';
import { VehiclesHost } from '../../../src/vehicles/host.js';

const allRoad = (l) => l.kind === 'road';

// ---------------------------------------------------------------------------------------------- lanes
test('lanes: v4 + v5 streets give a connected right-hand lane graph with junction connectors', () => {
  const roads = makeRoads({ built: { depot: true, road: true } });
  const g = new LaneGraph(roads.rn, { tracks: roads.tracks() });
  const rl = g.lanes.filter((l) => l.kind === 'road' && !l.stub);
  assert.ok(rl.length >= 20, 'road lanes ' + rl.length);
  // right-hand: +i drives at lower j, +j at higher i (RoadNet.laneLattice)
  for (const l of g.lanes.filter((x) => x.kind === 'road')) {
    const e = roads.rn.driveEdges[l.edge];
    const q = l.lat[0];
    if (e.axis === 'x') assert.ok(l.dir > 0 ? q.j < e.fix : q.j > e.fix, 'right-hand X ' + l.street);
    else assert.ok(l.dir > 0 ? q.i > e.fix : q.i < e.fix, 'right-hand Y ' + l.street);
  }
  // every non-stub lane reaches every other one (no dead ends a vehicle cannot leave)
  let bad = 0;
  for (const a of rl) for (const b of rl) if (a !== b && !g.route({ lane: a.id, s: a.len / 2 }, { lane: b.id, s: b.len / 2 })) bad++;
  assert.equal(bad, 0, 'unreachable lane pairs');
  // junction nodes have connectors, U-turns only at dead ends
  for (const n of g.nodes.values()) {
    const C = n.conns.map((id) => g.conns[id]);
    if (n.kind === 'junction' && n.rid) assert.ok(C.length >= 6, 'connectors at ' + n.key);
    for (const c of C) if (c.turn === 'U' && !c.track) assert.equal(n.kind, 'end', 'U-turn only at a dead end ' + n.key);
  }
  // the chief's snow tracks join the road at the plaza gate
  const tr = g.lanes.filter((l) => l.kind === 'track');
  assert.ok(tr.length > 20, 'track lanes ' + tr.length);
  const any = () => true;
  assert.ok(g.route({ lane: tr[0].id, s: 0.5 }, { lane: rl[0].id, s: 1 }, { allow: any }), 'tracks reach the roads');
});

test('lanes: 10,000 random routes are continuous and every stop is reachable from every stop', () => {
  const roads = makeRoads({ built: { depot: true, road: true } });
  const g = new LaneGraph(roads.rn, {});
  const rng = new Rng(11);
  const rl = g.lanes.filter((l) => l.kind === 'road' && !l.stub);
  let broken = 0, none = 0;
  for (let k = 0; k < 10000; k++) {
    const A = rl[rng.int(rl.length)], B = rl[rng.int(rl.length)];
    const p = g.route({ lane: A.id, s: rng.next() * A.len }, { lane: B.id, s: rng.next() * B.len });
    if (!p) { none++; continue; }
    // piece ends meet: lane end -> connector start -> next lane start (px)
    for (let i = 1; i < p.length; i++) {
      const a = g.piece(p[i - 1]), b = g.piece(p[i]);
      const pa = a.pts[a.pts.length - 1], pb = b.pts[0];
      if (p[i - 1].s1 > a.len - 0.01 && Math.hypot(pa.x - pb.x, pa.y - pb.y) > 1.5) broken++;
    }
  }
  assert.equal(none, 0, 'routes not found');
  assert.equal(broken, 0, 'discontinuous paths');
  const pos = {};
  for (const id in layout.STOPS) { const s = layout.STOPS[id]; const sn = g.snap(s.x, s.y, (l) => l.street === s.street && l.dk === 'NW'); assert.ok(sn, 'stop ' + id + ' on its street'); assert.ok(sn.d < 5, 'stop ' + id + ' near its lane (' + sn.d.toFixed(2) + ' m)'); pos[id] = { lane: sn.lane, s: g.fit(sn.lane, sn.s, 7.9) }; }
  for (const a in pos) for (const b in pos) if (a !== b) assert.ok(g.route(pos[a], pos[b]), a + ' -> ' + b);
});

// ---------------------------------------------------------------------------------------------- simulation
function randomTraffic(n, secs, seed, envOpts = {}) {
  const roads = makeRoads({ built: { depot: true, road: true } });
  const g = new LaneGraph(roads.rn, { rails: envOpts.rails || [] });
  const rng = new Rng(seed);
  const sim = new VehicleSim(g, VEHICLES_TUNING, envOpts);
  const rl = g.lanes.filter((l) => l.kind === 'road' && !l.stub);
  const kinds = [['retro_bus', 7.2, 2.3, 5], ['car_a_blue', 3.5, 1.84, 5], ['truck_cargo', 5.5, 2, 5.5], ['horse_sleigh_bus', 7.9, 1.95, 3]];
  const randPos = (len) => { for (;;) { const l = rl[rng.int(rl.length)]; if (l.len < len + 1) continue; return { lane: l.id, s: g.fit(l.id, rng.range(0, l.len), len) }; } };
  const trip = (v) => { for (let t = 0; t < 30; t++) { const last = v.path[v.path.length - 1]; const p = g.route({ lane: last.id, s: last.s1 }, randPos(v.len)); if (p && g.pathLen(p) > 5) { sim.setPath(v, p, [{ at: g.pathLen(p), dwell: rng.range(0, 3), tag: 'x' }]); return; } } };
  sim.occupy();
  for (let t = 0; sim.list.length < n && t < 5000; t++) {
    const k = kinds[rng.int(kinds.length)];
    const pos = randPos(k[1]);
    if (!sim.canMerge(pos.lane, pos.s, k[1] + 4, null)) continue;
    const v = sim.add({ key: k[0], len: k[1], width: k[2], vmax: k[3], accel: 1.3 });
    sim.setPath(v, [{ t: 'L', id: pos.lane, s0: pos.s, s1: pos.s }], [{ at: 0, dwell: 0, tag: 'x' }]);
    sim.occupy();
  }
  const out = { sim, g, problems: [], ghosts: 0, trips: 0, maxWait: 0, steps: 0 };
  for (let i = 0; i < secs * 30; i++) {
    sim.update(1 / 30, i / 30);
    for (const e of sim.drain()) {
      if (e.t === 'ghost') out.ghosts++;
      if (e.t === 'arrive' || e.t === 'end') { const v = sim.get(e.id); if (v) { out.trips++; trip(v); } }
    }
    const bad = invariants(sim);
    if (bad.length) out.problems.push(...bad.slice(0, 3).map((b) => b + ' @' + (i / 30).toFixed(1)));
    for (const v of sim.list) out.maxWait = Math.max(out.maxWait, v.waitT);
    out.steps++;
    if (envOpts.each) envOpts.each(sim, i / 30);
  }
  return out;
}

test('sim: 12 vehicles on random trips for 10 game minutes: no overlap, no conflicting connectors, nobody stuck', () => {
  const r = randomTraffic(12, 600, 7);
  assert.deepEqual(r.problems, []);
  assert.ok(r.trips >= 60, 'trips ' + r.trips);
  assert.ok(r.maxWait < 120, 'longest wait ' + r.maxWait.toFixed(1) + ' s');
});

test('sim: 24 vehicles (the budget) stay overlap-free; gridlock rings are untied', () => {
  const r = randomTraffic(24, 300, 3);
  assert.deepEqual(r.problems, []);
  assert.ok(r.trips >= 40, 'trips ' + r.trips);
  // with 24 random trips on this small network rings happen; each is untied (a ghost slips through), nobody waits forever
  assert.ok(r.maxWait < 200, 'longest wait ' + r.maxWait.toFixed(1));
});

test('sim: vehicles stop 1.5 m before a walker on their lane and go on when the way is clear (nobody is ever hit)', () => {
  const roads = makeRoads({ built: { depot: true, road: true } });
  const g = new LaneGraph(roads.rn, {});
  const walkers = [];
  const sim = new VehicleSim(g, VEHICLES_TUNING, { walkers: () => walkers, live: () => true });
  const lane = g.lanes.find((l) => l.street === 'main' && l.dir === 1 && l.len > 28);
  const v = sim.add({ key: 'retro_bus', len: 7.2, width: 2.3, vmax: 5, accel: 1.2 });
  sim.setPath(v, [{ t: 'L', id: lane.id, s0: 5, s1: lane.len - 1 }], [{ at: lane.len - 6, dwell: 0, tag: 'end' }]);
  const w = g.at('L', lane.id, 22, {});
  walkers.push({ id: 'w1', x: w.x, y: w.y });
  for (let i = 0; i < 30 * 20; i++) sim.update(1 / 30, i / 30);
  const front = 5 + v.ps + v.len / 2;
  assert.ok(v.v < 0.05, 'stopped');
  assert.ok(front <= 22 - 1.4, 'front at ' + front.toFixed(2) + ' (walker at 22)');
  assert.ok(front >= 22 - 3, 'not too far back');
  walkers.length = 0;
  for (let i = 0; i < 30 * 20; i++) sim.update(1 / 30, 20 + i / 30);
  assert.ok(5 + v.ps > 22, 'drove on');
  // random walkers appearing on lanes ahead of 12 vehicles: a body never runs into a walker
  let hits = 0;
  const rng = new Rng(5);
  const list = [];
  const r = randomTraffic(12, 240, 9, {
    walkers: () => list, live: () => true,
    each: (s, T) => {
      for (let i = list.length - 1; i >= 0; i--) if (T > list[i].until) list.splice(i, 1);
      if (rng.next() < 0.2) {
        const l = s.g.lanes[rng.int(s.g.lanes.length)];
        const p = s.g.at('L', l.id, rng.next() * l.len, {});
        // never on top of a body (walkers step onto empty road)
        if (s.list.every((x) => Math.hypot(x.x - p.x, (x.y - p.y) * 2) / 64 > x.len / 2 + 3)) list.push({ id: 'r' + T, x: p.x, y: p.y, until: T + 4 });
      }
      for (const wk of list) for (const x of s.list) {
        if (x.v < 0.05) continue;
        const d = Math.hypot(x.x - wk.x, (x.y - wk.y) * 2) / 64;
        if (d < Math.min(x.len, x.width) / 2 - 0.2) hits++;
      }
    },
  });
  assert.deepEqual(r.problems, []);
  assert.equal(hits, 0, 'walkers hit');
});

test('sim: level crossings of both rail lines (main k ≤ 46, coast k 47–98) hold vehicles while a train is near', () => {
  // a fixture street across the track (west of the town: crossing k 20 on the main line) and one on the coast line (k 60)
  const roads = makeRoads({ built: { depot: true, road: true } });
  roads.V.streets.push({ id: 'fx_cross_main', axis: 'y', i: [19, 23], j: [-9, 6], cls: 'dirt', paint: [19, 23], paintSpan: [-6, 6] });
  roads.V.eup.fx_cross_main = { road: [19, 23] };
  roads.rn.upgrade('fx_cross_main', 'cobble');
  roads.V.streets.push({ id: 'fx_cross_coast', axis: 'y', i: [58, 62], j: [-9, 6], cls: 'dirt', paint: [58, 62], paintSpan: [-6, 6] });
  roads.V.eup.fx_cross_coast = { road: [58, 62] };
  roads.rn.upgrade('fx_cross_coast', 'cobble');
  const rails = [{ j: 0, from: -1, to: 46, line: 'main' }, { j: 0, from: 47, to: 98, line: 'coast' }];
  const g = new LaneGraph(roads.rn, { rails });
  const xm = g.lanes.filter((l) => l.street === 'fx_cross_main' && l.xings.length), xc = g.lanes.filter((l) => l.street === 'fx_cross_coast' && l.xings.length);
  // the crossing tile under each lane (right-hand: +j lanes at i = fix + 1, -j lanes at fix - 1)
  assert.ok(xm.length === 2 && xm.every((l) => l.xings[0].line === 'main' && l.xings[0].k === (l.dir > 0 ? 22 : 20)), 'main crossings k 20 / 22');
  assert.ok(xc.length === 2 && xc.every((l) => l.xings[0].line === 'coast' && l.xings[0].k === (l.dir > 0 ? 61 : 59)), 'coast crossings k 59 / 61');
  for (const [lanes, line] of [[xm, 'main'], [xc, 'coast']]) {
    let closed = true;
    const asked = new Set();
    const sim = new VehicleSim(g, VEHICLES_TUNING, { xingBlocked: (k, ln) => { asked.add(ln + k); return closed && ln === line; } });
    const lane = lanes.find((l) => l.dir === 1);
    const v = sim.add({ key: 'car_a_red', len: 3.5, width: 1.84, vmax: 5, accel: 1.8 });
    sim.setPath(v, [{ t: 'L', id: lane.id, s0: 0.5, s1: lane.len - 0.5 }], [{ at: lane.len - 1, dwell: 0, tag: 'end' }]);
    for (let i = 0; i < 30 * 15; i++) sim.update(1 / 30, i / 30);
    const x = lane.xings[0];
    assert.ok(0.5 + v.ps + v.len / 2 <= x.s0 - 0.9, line + ': waits before the crossing');
    assert.ok(asked.has(line + x.k), line + ': asked the right line');
    closed = false;
    for (let i = 0; i < 30 * 15; i++) sim.update(1 / 30, 15 + i / 30);
    assert.ok(0.5 + v.ps - v.len / 2 > x.s1, line + ': crossed when open');
  }
});

test('sim: traffic lights at 도시 — red stops, green goes, the two axes never green together', () => {
  const { m } = makeModel({ rank: 3, lines: {}, wagons: 0 });
  const sim = m.sim;
  const node = Array.from(sim.lit.keys())[0];
  assert.ok(node, 'a lit junction');
  let both = 0;
  for (let T = 0; T < 64; T += 0.25) if (sim.lightState(node, 'x', T) === 'g' && sim.lightState(node, 'y', T) === 'g') both++;
  assert.equal(both, 0);
  // a car on main eastbound approaching the lit junction on red waits at the stop line
  const g = m.graph;
  const inLane = g.lanes.find((l) => l.street === 'main' && l.dir === 1 && l.to === node);
  const c = g.conns.find((x) => x.from === inLane.id && x.turn === 'S');
  const out = g.lanes[c.to];
  const v = sim.add({ key: 'car_a_red', len: 3.5, width: 1.84, vmax: 5, accel: 1.8 });
  // start when x turns red: T = green + yellow
  const T0 = VEHICLES_TUNING.traffic.green + VEHICLES_TUNING.traffic.yellow;
  sim.setPath(v, [{ t: 'L', id: inLane.id, s0: inLane.len - 12, s1: inLane.len }, { t: 'C', id: c.id, s0: 0, s1: c.len }, { t: 'L', id: out.id, s0: 0, s1: 6 }], [{ at: 12 + c.len + 6, dwell: 0, tag: 'end' }]);
  let passedOnRed = 0, stoppedAtLine = false;
  for (let i = 0; i < 30 * 20; i++) {
    const T = T0 + i / 30;
    sim.update(1 / 30, T);
    const front = v.ps + v.len / 2;
    if (front > 12 + 0.1 && sim.lightState(node, 'x', T) === 'r' && v.cum && v.ps - v.len / 2 < 12) passedOnRed++;
    if (v.v < 0.05 && Math.abs(front - 12) < 0.6) stoppedAtLine = true;
  }
  assert.ok(stoppedAtLine, 'waited at the stop line');
  assert.equal(passedOnRed, 0, 'never entered on red');
  assert.ok(v.ps > 12, 'went on green');
});

// ---------------------------------------------------------------------------------------------- transit
test('transit: lines, headways, dwell, ETA, booking a ride, riders per day (2 buses ⇒ ≥ 120)', () => {
  const { m, env } = makeModel({ lines: { 1: 2, 2: 0 }, wagons: 0 });
  const L1 = m.transit.lineList().find((l) => l.id === '1');
  assert.ok(L1 && L1.buses === 2, 'line 1 with 2 buses');
  assert.deepEqual(L1.stops, ['S3', 'S2', 'S1']);
  assert.ok(Math.abs(L1.headway - L1.cycle / 2) < 0.2 && L1.headway >= VEHICLES_TUNING.sleighBus.headway - 0.01, 'headway ' + L1.headway);
  // run one game day
  const log = run(m, 600);
  const arr = log.filter((e) => e.t === 'veh:arrive');
  assert.ok(arr.length >= 15, 'arrivals ' + arr.length);
  assert.ok(m.ridersToday() >= 120 || log.filter((e) => e.t === 'veh:ride' && !e.chief).reduce((s, e) => s + e.n, 0) >= 120, 'riders ' + m.ridersToday());
  assert.ok(env.alighted > 0 && env.boarded >= env.alighted, 'riders get off');
  // departures from S1 keep their spacing (the terminal holds the timetable)
  const atS1 = arr.filter((e) => e.stop === 'S1').map((e) => e.id);
  assert.ok(new Set(atS1).size === 2, 'both buses serve S1');
  // ETA: a number for served stops, Infinity for S4 (line 2 has no buses)
  const eta = m.transit.eta('S2');
  assert.ok(eta >= 0 && eta < L1.cycle + 1, 'eta ' + eta);
  assert.equal(m.transit.eta('S4'), Infinity);
  // the chief books S2 -> S1, boards, gets off at S1
  const b = m.transit.book('S2', 'S1');
  const log2 = run(m, 300, 30, m.T);
  const ride = log2.filter((e) => e.t === 'veh:ride' && e.chief);
  assert.ok(ride.find((e) => e.op === 'board' && e.stop === 'S2'), 'boarded at S2');
  assert.ok(ride.find((e) => e.op === 'alight' && e.stop === 'S1' && e.arrived), 'got off at S1');
  assert.equal(b.state, 'done');
  // leaving early: book S3 -> S1, leave right after boarding -> off at the next stop (S2)
  const b2 = m.transit.book('S3', 'S1');
  let left = false, off = null;
  for (let i = 0; i < 30 * 400 && !off; i++) {
    m.update(1 / 30, m.T + 1 / 30);
    for (const e of m.drain()) { if (e.t === 'veh:ride' && e.chief && e.op === 'board' && !left) { m.transit.leave(); left = true; } if (e.t === 'veh:ride' && e.chief && e.op === 'alight') off = e; }
  }
  assert.ok(off && off.stop === 'S2' && !off.arrived, 'left at the next stop');
  assert.equal(b2.state, 'done');
});

test('transit: a line opens only with its stops built; without 서리 큰길 bus 1 runs S3 <-> S2', () => {
  const a = makeModel({ built: { road: false }, lines: { 1: 1, 2: 1 }, stops: ['S4'], wagons: 0 });
  const L = a.m.transit.lineList();
  assert.deepEqual(L.find((l) => l.id === '1').stops, ['S3', 'S2']);
  assert.ok(!L.find((l) => l.id === '2'), 'line 2 needs S5 too');
  a.m.built.stops.add('S5');
  a.m.refresh();
  assert.ok(a.m.transit.lineList().find((l) => l.id === '2'), 'line 2 opens with S5');
});

// ---------------------------------------------------------------------------------------------- freight
test('freight: items out of the yard = items onto shelves + cargo pad (conservation), shops first', () => {
  const { m, env } = makeModel({ lines: {}, wagons: 2, stock: 400 });
  run(m, 900);
  const t = m.fleet.totals;
  let onBeds = 0;
  for (const id of m.fleet.freight) { const v = m.sim.get(id); if (v) for (const k in v.items) onBeds += v.items[k]; }
  assert.ok(t.taken > 0, 'something was carried');
  assert.equal(t.taken, t.delivered + onBeds, 'taken = delivered + on the beds');
  assert.equal(env.deliveredN, t.delivered, 'the game got every item');
  assert.ok((env.delivered.lotA1 || 0) > 0 && (env.delivered.cargo || 0) > 0, 'shops and the cargo pad both got goods');
  assert.equal(env.took, t.taken);
});

test('freight: the steam wagon waits in the depot until 서리 큰길 reaches the yard, then starts', () => {
  const { m } = makeModel({ built: { road: false }, lines: {}, wagons: 1 });
  assert.equal(m.freightWanted(), 0, 'no road, no wagon run');
  m.built.road = true;
  const roads = makeRoads({ built: { depot: true, road: true } });
  m.setRoads(roads.rn, roads.tracks());
  const log = run(m, 200);
  assert.ok(log.some((e) => e.t === 'veh:load'), 'loaded at the yard');
});

// ---------------------------------------------------------------------------------------------- cars
test('cars (도시): level-2 homes get cars in ≤ 4 colourways; ≤ maxMoving drive; parked cars stay put', () => {
  const homes = [];
  for (let k = 0; k < 10; k++) homes.push({ id: 'h' + k, pid: 't:' + k, level: 2, x: 0, y: 0 });
  const { m } = makeModel({ rank: 3, lines: {}, wagons: 0, homes });
  m.built.lot = true; m.refresh();
  assert.ok(m.fleet.cars.length === 10, 'one car each');
  assert.ok(new Set(m.fleet.cars.map((c) => c.key)).size <= 4, 'colourways');
  let maxMoving = 0, parks = 0;
  for (let i = 0; i < 30 * 900; i++) {
    m.update(1 / 30, m.T + 1 / 30);
    for (const e of m.drain()) if (e.t === 'veh:car' && e.op === 'park') parks++;
    maxMoving = Math.max(maxMoving, m.fleet.movingCars());
    if (i % 30 === 0) assert.deepEqual(invariants(m.sim), []);
  }
  assert.ok(parks >= 3, 'cars drove and parked (' + parks + ')');
  assert.ok(maxMoving <= VEHICLES_TUNING.cars.maxMoving);
  const taken = new Map();
  for (const c of m.fleet.cars) if (c.at) { assert.ok(!taken.has(c.at), 'one car per spot'); taken.set(c.at, c.pid); }
});

// ---------------------------------------------------------------------------------------------- chief drive
test('chief drive: the connector closest to the stick for 8 directions (straight on ties), straight when idle', () => {
  const { m } = makeModel({ rank: 3, lines: {}, wagons: 0 });
  const g = m.graph;
  // eastbound on the back street into the 4-way junction with 중앙로 (32, -13)
  const lane = g.lanes.find((l) => l.street === 'back' && l.dir === 1 && l.to === 'n640,-260');
  assert.ok(lane, 'back street eastbound into (32,-13)');
  const turnOf = (sx, sy) => { const p = m.chief.pickByStick(lane, sx, sy, () => true); return p ? g.conns[p.id].turn : null; };
  const D = Math.SQRT1_2;
  const want = { E: 'S', SE: 'S', S: 'S', SW: 'R', W: 'R', NW: 'R', N: 'L', NE: 'L' };
  const vec = { E: [1, 0], SE: [D, D], S: [0, 1], SW: [-D, D], W: [-1, 0], NW: [-D, -D], N: [0, -1], NE: [D, -D] };
  for (const k in vec) assert.equal(turnOf(vec[k][0], vec[k][1]), want[k], 'stick ' + k);
});

function driveBot(m, spec, mode, maxSecs = 400) {
  const r = m.chief.start(spec);
  assert.ok(r.ok, 'drive starts: ' + (r.reason || ''));
  let done = null, t = 0;
  while (!done && t < maxSecs) {
    const st = m.chief.state();
    if (st.active && mode !== 'idle') {
      // steer toward the next turn of the guide: stick along the out-lane of the guide's connector, else forward
      const v = m.chief.vehicle();
      const here = m.herePos(v), nx = st.next;
      let sx = v.hx, sy = v.hy;
      const s = m.chief.run.stops[m.chief.run.i];
      const path = here && s && s.pos ? m.graph.route(here, s.pos, { allow: v.allow }) : null;
      const c = path && path.find((p) => p.t === 'C');
      // near the junction the stick points down the guide's out-lane; on the way there, forward
      const ci = path ? path.indexOf(c) : -1;
      let ahead = 0; if (path) for (let i = 0; i < ci; i++) ahead += path[i].s1 - path[i].s0;
      if (c && ahead < 12 && m.graph.conns[c.id].turn !== 'U') { const to = m.graph.lanes[m.graph.conns[c.id].to]; sx = to.pts[1].x - to.pts[0].x; sy = to.pts[1].y - to.pts[0].y; }
      // the stop is behind (much shorter from the lane beside): pull back, the vehicle stops and turns round
      const onLane = v.path[m.sim.pieceIndex(v, v.ps)].t === 'L';
      if (st.blocked === 'noRoom') v._botOn = 2.5;
      if (v._botOn > 0) v._botOn -= 1 / 30;
      const tw = here && onLane && !(v._botOn > 0) ? m.graph.twin(here.lane) : -1;
      if (tw >= 0 && path && s && s.pos) { const alt = m.graph.route({ lane: tw, s: Math.max(0.1, m.graph.lanes[tw].len - here.s) }, s.pos, { allow: v.allow }); if (alt && m.graph.pathLen(alt) + 15 < m.graph.pathLen(path)) { sx = -v.hx; sy = -v.hy; } }
      const d = Math.hypot(sx, sy) || 1;
      const k = mode === 'fast' ? 1 : 0.7;
      m.chief.stick(sx / d * k, sy / d * k);
      void nx;
    } else m.chief.stick(0, 0);
    m.update(1 / 30, m.T + 1 / 30);
    t += 1 / 30;
    for (const e of m.drain()) if (e.t === 'veh:driveDone') done = e;
  }
  return { done, t, state: m.chief.state() };
}

test('chief drive: par / stars; a steering bot finishes ★★–★★★, an idle one never fails', () => {
  const a = makeModel({ rank: 3, lines: {}, wagons: 0 });
  const fast = driveBot(a.m, { tpl: 'B3', mid: 7, vehicle: 'truck_cargo_chief', route: 'cafe' }, 'fast');
  assert.ok(fast.done, 'the cafe run finished');
  assert.equal(fast.done.mid, 7);
  assert.ok(fast.done.stars >= 2, 'stars ' + fast.done.stars + ' in ' + fast.done.s + ' s (par ' + fast.done.par + ')');
  assert.ok(fast.done.s > 0 && fast.done.par > 8);
  // the shop round (4 stops) with a guide-following bot
  const b = makeModel({ rank: 3, lines: { 1: 1 }, wagons: 1 });
  const round = driveBot(b.m, { tpl: 'B4', vehicle: 'truck_cargo_chief', route: 'shops' }, 'guide', 600);
  assert.ok(round.done && round.done.stars >= 1, 'shop round done');
  // the dog sled mail run through the village snow tracks (읍)
  const c = makeModel({ rank: 2, lines: {}, wagons: 0 });
  const mail = driveBot(c.m, { tpl: 'B1', vehicle: 'dog_sled', route: 'mail' }, 'fast', 600);
  assert.ok(mail.done, 'mail run finished');
  // idle (hands off): nothing fails, the run is still going, stars only go down to ★
  const d = makeModel({ rank: 3, lines: {}, wagons: 0 });
  const idle = driveBot(d.m, { tpl: 'B4', vehicle: 'truck_cargo_chief', route: 'shops' }, 'idle', 200);
  assert.ok(!idle.done || idle.done.stars >= 1);
  if (!idle.done) { assert.ok(idle.state.active, 'still running'); assert.ok(idle.state.stars >= 1); }
  // the truck needs 도시; a v6 route is not open in v5
  const e = makeModel({ rank: 2, lines: {}, wagons: 0 });
  assert.equal(e.m.chief.start({ vehicle: 'truck_cargo_chief', route: 'cafe' }).reason, 'era');
  assert.equal(e.m.chief.start({ vehicle: 'dog_sled', route: 'export' }).reason, 'route');
});

test('chief drive: starts facing the first stop; stick held back while stopped turns round in the street', () => {
  const { m } = makeModel({ rank: 2, lines: {}, wagons: 0 });
  const r = m.chief.start({ vehicle: 'dog_sled', route: 'mail' });
  assert.ok(r.ok);
  const g = m.graph, v = m.chief.vehicle(), st = m.chief.run.stops[0];
  const here = m.herePos(v), tw = g.twin(here.lane);
  assert.ok(tw >= 0, 'a lane beside');
  const a = g.route(here, st.pos, { allow: v.allow }), b = g.route({ lane: tw, s: g.lanes[tw].len - here.s }, st.pos, { allow: v.allow });
  assert.ok(!b || g.pathLen(a) <= g.pathLen(b) + 0.01, 'faces the first stop (' + g.pathLen(a).toFixed(1) + ' vs ' + (b ? g.pathLen(b).toFixed(1) : '-') + ')');
  // drive on 3 s, then pull straight back for 3 s: it stops, then turns round onto the lane beside
  const log = [];
  let lane0 = -1;
  for (let i = 0; i < 30 * 6; i++) {
    const back = i >= 90;
    if (i === 90) lane0 = m.herePos(v).lane;
    m.chief.stick(back ? -v.hx / Math.hypot(v.hx, v.hy) : v.hx / Math.hypot(v.hx, v.hy), back ? -v.hy / Math.hypot(v.hx, v.hy) : v.hy / Math.hypot(v.hx, v.hy));
    if (log.some((e) => e.op === 'turn')) m.chief.stick(0, 0);
    m.update(1 / 30, m.T + 1 / 30);
    for (const e of m.drain()) if (e.t === 'veh:drive') log.push(e);
    assert.deepEqual(invariants(m.sim), []);
  }
  const turned = log.find((e) => e.op === 'turn');
  assert.ok(turned, 'turned round');
  for (let i = 0; i < 30 * 3; i++) { m.chief.stick(0, 0); m.update(1 / 30, m.T + 1 / 30); m.drain(); }
  const now = m.herePos(v);
  assert.ok(now && (now.lane === g.twin(lane0) || g.lanes[now.lane].dk !== g.lanes[lane0].dk), 'on the other side, going the other way');
  assert.ok(m.chief.active(), 'the run goes on');
});

test('chief drive: the wedding cake run is capped at 0.7× and its par follows the cap', () => {
  const a = makeModel({ rank: 3, lines: {}, wagons: 0 });
  const r1 = a.m.chief.start({ vehicle: 'truck_cargo_chief', route: 'cafe' });
  a.m.chief.abort();
  const r2 = a.m.chief.start({ vehicle: 'truck_cargo_chief', route: 'cafe', capSpeed: 0.7 });
  assert.ok(r2.par > r1.par * 1.3, 'par ' + r1.par + ' -> ' + r2.par);
  let vmax = 0;
  a.m.chief.stick(1, 0.5);
  for (let i = 0; i < 30 * 30; i++) { a.m.update(1 / 30, a.m.T + 1 / 30); const v = a.m.chief.vehicle(); if (v) vmax = Math.max(vmax, v.v); }
  assert.ok(vmax <= VEHICLES_TUNING.chiefTruck.speed * 0.7 + 0.05, 'top speed ' + vmax.toFixed(2));
});

// ---------------------------------------------------------------------------------------------- eras
test('eras: rank 3 swaps sleigh buses for retro buses, the wagon for a truck, adds lights and the bus depot', () => {
  const { m } = makeModel({ rank: 2, lines: { 1: 2 }, wagons: 1 });
  run(m, 60);
  assert.ok(m.sim.list.some((v) => v.key === 'horse_sleigh_bus'));
  assert.equal(m.sim.lit.size, 0);
  const roads = makeRoads({ built: { depot: true, road: true }, cls: 'asphalt' });
  m.setRank(3);
  m.setRoads(roads.rn, roads.tracks());
  const log = run(m, 240);
  assert.ok(log.some((e) => e.t === 'veh:era' && e.n === 3) || m.era === 3);
  assert.ok(m.sim.lit.size >= 1, 'traffic lights');
  const keys = new Set(m.sim.list.filter((v) => v.role === 'bus' || v.role === 'freight').map((v) => v.key));
  assert.ok(keys.has('retro_bus') && keys.has('truck_cargo') && !keys.has('horse_sleigh_bus') && !keys.has('steam_wagon'), Array.from(keys).join(','));
  assert.ok(m.built.busDepot);
  assert.equal(roleKey('bus', 3), 'retro_bus');
  const sp = specOf(MAN, 'horse_sleigh_bus', VEHICLES_TUNING);
  assert.ok(sp.len === 7.9 && sp.animal && sp.seatCount === 9 && sp.driverSeat === 0);
  const pal = carPalette(new Rng(3), 4);
  assert.equal(pal.length, 4); assert.equal(new Set(pal.map((k) => k.slice(0, 5))).size, 4);
  for (const k of pal) assert.ok(CAR_KEYS.includes(k));
});

test('markings: asphalt streets get centre dashes and crosswalks, none inside junction squares', () => {
  const roads = makeRoads({ built: { depot: true, road: true }, cls: 'asphalt' });
  const mk = markings(roads.rn, { bays: layout.PARKING.bays });
  const lanes = mk.filter((x) => x.key === 'lane_x' || x.key === 'lane_y');
  const cw = mk.filter((x) => x.key.startsWith('crosswalk'));
  assert.ok(lanes.length > 20, 'dashes ' + lanes.length);
  assert.ok(cw.length >= 12, 'crosswalks ' + cw.length);
  assert.equal(mk.filter((x) => x.key === 'stall_lines').length, layout.PARKING.bays.length);
  const cobble = makeRoads({ built: { depot: true, road: true }, cls: 'cobble' });
  assert.equal(markings(cobble.rn).length, 0, 'no markings before 도시');
});

// ---------------------------------------------------------------------------------------------- determinism + saves
test('determinism: two runs with the same seed give the same events and positions', () => {
  const go = () => { const { m } = makeModel({ rank: 3, lines: { 1: 2, 2: 1 }, wagons: 1, homes: [{ id: 'a', pid: 't:1', level: 2 }, { id: 'b', pid: 't:2', level: 2 }] }); m.built.lot = true; m.refresh(); const log = run(m, 400); return JSON.stringify(log.map((e) => [e.t, e.id, e.stop, e.riders])) + JSON.stringify(m.sim.list.map((v) => [v.id, v.key, Math.round(v.x * 100), Math.round(v.y * 100)])); };
  assert.equal(go(), go());
});

test('save: round trip, reload restarts buses on their phase clocks, cap 1.5 KB, 200 fuzzed slices', () => {
  const homes = []; for (let k = 0; k < 30; k++) homes.push({ id: 'h' + k, pid: 'town:' + k, level: 2 });
  const { m } = makeModel({ rank: 3, lines: { 1: 2, 2: 2 }, wagons: 2, homes });
  run(m, 300);
  for (let k = 0; k < 14; k++) m.best['tpl_' + k] = 30 + k;
  const s1 = sanitizeVehicles(m.serialize());
  const j = JSON.stringify(fitVehicles(s1));
  assert.ok(j.length <= VEHICLES_SLICE.cap, 'slice ' + j.length + ' B');
  assert.equal(s1.cars.length, 24, 'cars capped at 24');
  assert.ok(Object.keys(s1.chief.best).length <= 12);
  // reload into a fresh model: same slice out, buses running again
  const b = makeModel({ rank: 3, saved: s1, homes, T: m.T });
  assert.deepEqual(sanitizeVehicles(b.m.serialize()).built, s1.built);
  assert.deepEqual(sanitizeVehicles(b.m.serialize()).lines, s1.lines);
  assert.equal(b.m.sim.list.filter((v) => v.role === 'bus').length, 4, 'buses back on their lines');
  assert.deepEqual(invariants(b.m.sim), [], 'placed without overlaps');
  const log = run(b.m, 120, 30, m.T);
  assert.ok(log.some((e) => e.t === 'veh:arrive'));
  // fuzz: never throws, idempotent, always under the cap
  const rng = new Rng(99);
  const junk = () => { const r = rng.next(); return r < 0.2 ? null : r < 0.4 ? rng.int(1e6) - 5e5 : r < 0.5 ? 'x'.repeat(rng.int(40)) : r < 0.6 ? [rng.int(9), 'car_a_red', {}] : r < 0.7 ? { a: 1 } : r < 0.8 ? true : r < 0.9 ? -0.5 : undefined; };
  for (let k = 0; k < 200; k++) {
    const raw = { v: junk(), era: junk(), built: rng.next() < 0.7 ? { depot: junk(), road: junk(), stops: rng.next() < 0.5 ? ['S1', 'S9', 7, 'bad id', 'S4'] : junk(), wagons: junk(), busDepot: junk() } : junk(), lines: rng.next() < 0.6 ? { 1: junk(), 2: junk(), 3: junk() } : junk(), riders: rng.next() < 0.5 ? [1, -3, 'x', 1e9, null] : junk(), cars: rng.next() < 0.5 ? [['t:1', 'car_a_red'], ['t:1', 'car_b_mint'], [5, 'car_c_red'], ['t:2', 'nope']] : junk(), chief: { best: rng.next() < 0.5 ? { B1: 33.33, 'bad key!': 2, B2: -1, B3: 'x' } : junk() }, rs: junk(), pal: junk() };
    const a = sanitizeVehicles(raw);
    if (a) { assert.deepEqual(sanitizeVehicles(a), a, 'idempotent'); assert.ok(JSON.stringify(fitVehicles(a)).length <= VEHICLES_SLICE.cap); }
  }
  assert.equal(sanitizeVehicles(null), null);
  assert.equal(sanitizeVehicles([1, 2]), null);
});

// ---------------------------------------------------------------------------------------------- host (headless)
test('host: built sites add streets, the api answers, events go out, the slice saves (no view)', async () => {
  const roads = makeRoads({});
  const env = fakeEnv();
  const out = [];
  let T = 0;
  const ports = {
    rank: () => 2, clock: { T: () => T }, lang: () => 'ko', emit: (e) => out.push(e),
    assets: { manifest: () => MAN },
    roads: { net: () => roads.rn, addStreet: (s, eup, cls) => { if (roads.V.streets.some((q) => q.id === s.id)) return false; roads.V.streets.push(Object.assign({}, s)); roads.V.eup[s.id] = eup; roads.rn.upgrade(s.id, cls); return true; }, upgrade: (id, cls) => roads.rn.upgrade(id, cls), tracks: () => roads.tracks() },
    town: { board: env.board, alight: env.alight, walkers: env.walkers },
    freight: env.freight, homes: () => [], ui: { toast: () => {} },
  };
  const host = new VehiclesHost(ports, null, {});
  assert.equal(host.api.era(), 2);
  assert.equal(host.model.graph.lanes.filter((l) => /^conn_|bank_st|ave_s/.test(l.street)).length, 0, 'no v5 streets before anything is built');
  host.onFeed({ t: 'built', siteId: 'v5_stable' });
  assert.ok(roads.V.streets.some((s) => s.id === 'conn_e') && roads.V.streets.some((s) => s.id === 'bank_st'), 'the depot brings conn_e, bank_st, ave_s');
  host.onFeed({ t: 'built', siteId: 'v5_road' });
  host.onFeed({ t: 'built', siteId: 'v5_stop_S1' });
  host.api.build('bus:1'); host.api.build('bus:1');
  host.onFeed({ t: 'built', siteId: 'v5_yard' });
  host.api.build('wagon');
  for (let i = 0; i < 30 * 300; i++) { T += 1 / 30; host.update(1 / 30); }
  assert.ok(out.some((e) => e.t === 'veh:arrive' && e.riders >= 0), 'veh:arrive out');
  assert.ok(out.some((e) => e.t === 'veh:ride'), 'veh:ride out');
  assert.ok(host.api.ridersToday() > 0);
  assert.ok(host.api.lines().length === 1);
  assert.ok(Number.isFinite(host.api.eta('S1')));
  assert.equal(host.api.stopNear(layout.STOPS.S1.x + 20, layout.STOPS.S1.y + 10), 'S1');
  // a ride through the api resolves
  const p = host.api.ride('S2', 'S1');
  for (let i = 0; i < 30 * 300; i++) { T += 1 / 30; host.update(1 / 30); }
  const res = await Promise.race([p, new Promise((r) => setTimeout(() => r('timeout'), 50))]);
  assert.ok(res && res.arrived && res.at === 'S1', JSON.stringify(res));
  // the slice
  const s = host.serialize();
  assert.ok(s.built.depot && s.built.road && s.built.yard && s.built.stops.includes('S1') && s.lines[1] === 2 && s.built.wagons === 1);
  // 도시 through the feed
  host.onFeed({ t: 'rank', level: 3 });
  for (let i = 0; i < 30 * 120; i++) { T += 1 / 30; host.update(1 / 30); }
  assert.equal(host.api.era(), 3);
  assert.ok(out.some((e) => e.t === 'veh:era' && e.n === 3));
  assert.ok(host.api.has('veh:truck') && host.api.has('veh:sled'));
  const d = host.api.drive({ tpl: 'B3', mid: 3, vehicle: 'truck_cargo_chief', route: 'cafe' });
  assert.ok(host.api.chiefDriving());
  host.api.abortDrive();
  assert.deepEqual(await d, { stars: 0, aborted: true });
  host.destroy();
});

// ---------------------------------------------------------------------------------------------- perf
test('perf: a busy 도시 (≈ 18 simulated vehicles, 20 cars) costs ≤ 0.15 ms per 60 fps tick (Node)', () => {
  const homes = []; for (let k = 0; k < 20; k++) homes.push({ id: 'h' + k, pid: 't:' + k, level: 2 });
  const tuning = Object.assign({}, VEHICLES_TUNING, { cars: Object.assign({}, VEHICLES_TUNING.cars, { maxMoving: 18, tripEvery: 1, parkMin: 3, parkMax: 8 }) });
  const { m } = makeModel({ rank: 3, lines: { 1: 4, 2: 4 }, wagons: 3, homes, tuning });
  m.built.lot = true; m.refresh();
  run(m, 120, 60);              // warm up: cars on the move
  const n = 60 * 120;
  const t0 = process.hrtime.bigint();
  let moving = 0;
  for (let i = 0; i < n; i++) { m.update(1 / 60, m.T + 1 / 60); m.drain(); moving = Math.max(moving, m.sim.list.length); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n;
  console.log('    vehicles simulated (max)', moving, ' ms/tick', ms.toFixed(4));
  assert.ok(moving >= 15, 'enough vehicles: ' + moving);
  assert.ok(ms <= 0.15, ms.toFixed(4) + ' ms per tick');
});
