// vehicles_lab Node helpers: a model on the real v4 + v5 RoadNet with a fake environment (riders on demand, a yard
// with stock, founded shops that want restocking, level-2 homes). Deterministic.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeRoads } from './world_stub.js';
import * as layout from '../../../src/vehicles/layout.js';
import { VEHICLES_TUNING } from '../../../src/vehicles/tuning.js';
import { VehiclesModel } from '../../../src/vehicles/model/VehiclesModel.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/vehicles/manifest.json'), 'utf8'));
export { layout, VEHICLES_TUNING };

/** a fake game around the model: counts what went where */
export function fakeEnv(o = {}) {
  const env = {
    stock: o.stock !== undefined ? o.stock : 1e9,
    took: 0, delivered: {}, deliveredN: 0, boarded: 0, alighted: 0, walkersList: o.walkers || [], blocked: o.blocked || (() => false),
    shops: o.shops || [{ id: 'lotA1', x: layout.L(9.65, -2.95)[0], y: layout.L(9.65, -2.95)[1], need: { item_plank: 6 } }, { id: 'lotB2', x: layout.L(15.45, -11.3)[0], y: layout.L(15.45, -11.3)[1], need: { item_bread: 8 } }],
    homes: o.homes || [],
  };
  env.board = (stop, n, line, to) => { const out = []; if (o.noRiders) return out; for (let i = 0; i < n; i++) { env.boarded++; out.push({ pid: 't:' + stop + ':' + env.boarded, look: env.boarded, to: stop === 'S1' ? to[to.length - 1] : (to.indexOf('S1') >= 0 ? 'S1' : to[0]) }); } return out; };
  env.alight = (stop, riders) => { env.alighted += riders.length; };
  env.walkers = () => env.walkersList;
  env.xingBlocked = (k, line) => env.blocked(k, line);
  env.freight = {
    take: (n) => { const q = Math.min(n, env.stock); env.stock -= q; env.took += q; if (!q) return {}; const a = Math.ceil(q / 2); return { item_plank: a, item_bread: q - a }; },
    deliver: (to, items) => { for (const k in items) { env.deliveredN += items[k]; env.delivered[to] = (env.delivered[to] || 0) + items[k]; } },
    shopTargets: () => env.shops,
  };
  env.homesFn = () => env.homes;
  return env;
}

/** a model with everything of v5 built (or `built`), on fresh roads */
export function makeModel(o = {}) {
  const env = o.env || fakeEnv(o);
  const built = Object.assign({ depot: true, road: true, yard: true }, o.built || {});
  const roads = makeRoads({ built, cls: o.rank >= 3 ? 'asphalt' : 'cobble' });
  const m = new VehiclesModel({
    layout, tuning: o.tuning || VEHICLES_TUNING, manifest: MAN, rank: o.rank || 2, T: o.T || 0, seed: o.seed || 7, saved: o.saved || null,
    env: { board: env.board, alight: env.alight, walkers: env.walkers, xingBlocked: env.xingBlocked, freight: env.freight, homes: env.homesFn, live: o.live || (() => true), flag: () => false },
  });
  if (!o.saved) {
    for (const k in built) m.built[k] = built[k];
    for (const s of o.stops || ['S1', 'S4', 'S5']) m.built.stops.add(s);
    for (const k in o.lines || { 1: 2, 2: 1 }) m.lines[k] = (o.lines || { 1: 2, 2: 1 })[k];
    m.built.wagons = o.wagons !== undefined ? o.wagons : 1;
  }
  m.setRoads(roads.rn, roads.tracks());
  return { m, env, roads };
}

/** run the model for `secs` game seconds at `hz`; returns the event log */
export function run(m, secs, hz = 30, T0) {
  const log = [];
  const n = Math.round(secs * hz);
  let T = T0 !== undefined ? T0 : m.T;
  for (let i = 0; i < n; i++) { T += 1 / hz; m.update(1 / hz, T); for (const e of m.drain()) log.push(e); }
  return log;
}

/** invariants of the simulation right now: [problems] */
export function invariants(sim) {
  const bad = [];
  sim.occupy();
  for (const [k, arr] of sim.occ) for (let a = 0; a < arr.length; a++) for (let b = a + 1; b < arr.length; b++) {
    const A = arr[a], B = arr[b];
    if (Math.max(A.a, B.a) - Math.min(A.b, B.b) < -0.05) bad.push('overlap ' + k + ' ' + A.v.id + '/' + B.v.id);
  }
  for (const [cid, set] of sim.holders) for (const x of sim.g.conns[cid].conflicts) { const s2 = sim.holders.get(x); if (s2) for (const id of s2) if (!set.has(id)) bad.push('conflict ' + cid + '/' + x); }
  return bad;
}
