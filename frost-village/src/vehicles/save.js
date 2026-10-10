// vehicles save slice (docs/v5_v8_plan.md §8: key `vehicles`, version 1, cap 1.5 KB). Pure.
//   { v: 1, era, built: { depot, road, stops: [], yard, wagons, busDepot, lot, porter }, lines: { 1: n, 2: n, 3: n, 4: n },
//     riders: [10 game days], rd (day of the last count), cars: [[pid, key]] ≤ 24, pal: [car keys] ≤ 4,
//     chief: { best: { tpl: s } ≤ 12 }, rs (rng state) }
// Transients (moving vehicles, passengers, bookings) are not saved: buses restart on their phase clocks.

import { CAR_KEYS } from './model/eras.js';

export const VEHICLES_SLICE = { key: 'vehicles', version: 1, cap: 1536 };

const int = (x, lo, hi, d = 0) => { const n = Number(x); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d; };
const bit = (x) => (x === true || x === 1 || x === '1' ? 1 : 0);
const STOP_ID = /^[A-Z][0-9]{1,2}$/;
const TPL = /^[A-Za-z0-9_:-]{1,24}$/;
const PID = /^[A-Za-z0-9_:.-]{1,24}$/;

/** a clean slice from anything (null when there is nothing usable). Never throws. */
export function sanitizeVehicles(raw) {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const b = raw.built && typeof raw.built === 'object' ? raw.built : {};
    const stops = Array.isArray(b.stops) ? Array.from(new Set(b.stops.filter((s) => typeof s === 'string' && STOP_ID.test(s)))).sort().slice(0, 16) : [];
    const lines = {};
    for (const k of [1, 2, 3, 4]) lines[k] = int(raw.lines && raw.lines[k], 0, 6, 0);
    const riders = new Array(10).fill(0);
    if (Array.isArray(raw.riders)) for (let i = 0; i < 10; i++) riders[i] = int(raw.riders[i], 0, 100000, 0);
    const cars = [];
    const seen = new Set();
    if (Array.isArray(raw.cars)) for (const c of raw.cars) {
      if (cars.length >= 24) break;
      if (!Array.isArray(c) || typeof c[0] !== 'string' || !PID.test(c[0]) || seen.has(c[0]) || CAR_KEYS.indexOf(c[1]) < 0) continue;
      seen.add(c[0]);
      cars.push([c[0], c[1]]);
    }
    const pal = Array.isArray(raw.pal) ? Array.from(new Set(raw.pal.filter((k) => CAR_KEYS.indexOf(k) >= 0))).slice(0, 4) : [];
    const best = {};
    const B = raw.chief && raw.chief.best && typeof raw.chief.best === 'object' && !Array.isArray(raw.chief.best) ? raw.chief.best : {};
    let n = 0;
    for (const k of Object.keys(B)) {
      if (n >= 12) break;
      const s = Number(B[k]);
      if (!TPL.test(k) || !Number.isFinite(s) || s <= 0 || s > 36000) continue;
      best[k] = Math.round(s * 10) / 10; n++;
    }
    const era = int(raw.era, 1, 3, 2);
    return {
      v: 1, era,
      built: { depot: bit(b.depot), road: bit(b.road), stops, yard: bit(b.yard), wagons: int(b.wagons, 0, 4, 0), busDepot: bit(b.busDepot), lot: bit(b.lot), porter: bit(b.porter) },
      lines, riders, rd: int(raw.rd, 0, 1e7, 0), cars, pal, chief: { best }, rs: int(raw.rs, 0, 4294967295, 0) >>> 0,
    };
  } catch (e) {
    return null;
  }
}

/** shrink a slice under the cap (cars first, then the best times) */
export function fitVehicles(s, cap = VEHICLES_SLICE.cap) {
  if (!s) return s;
  let j = JSON.stringify(s);
  while (j.length > cap && s.cars.length) { s.cars.pop(); j = JSON.stringify(s); }
  while (j.length > cap && Object.keys(s.chief.best).length) { delete s.chief.best[Object.keys(s.chief.best).pop()]; j = JSON.stringify(s); }
  return s;
}
