// The beach's save slice (docs/v5_v8_plan.md §8): key `beach`, version 1, cap 2 KB (JSON length). sanitizeBeach never
// throws: anything odd becomes a sane default (a slice that cannot be read starts the beach fresh = null). fitBeach
// trims the optional parts (crowd counters, card progress, the hotel's oldest parties) until it fits.
//
//   { v: 1, open: 0|1, steps: { path, reveal, cleanup, lifeguard, board, hotel, pool, aquarium, up2, up3 },
//     clean: bitmask of picked clean-up bits (until the clean-up is done), hotel: { level, guests: [[rooms, leaveDay]] ≤ 8 },
//     facilities: { extras }, shops: [ids] (mirror; Growth owns them in the game), card: { item: n }, fish,
//     events: { last: { kind: day }, week: [from, to], happen }, stars: { n }, crowd: { today, total, day }, sd }

import { STEPS, BEACH_TUNING } from './tuning.js';

export const BEACH_SLICE = { key: 'beach', version: 1, cap: 2048 };
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const int = (v, lo, hi, d = 0) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

export function sanitizeBeach(raw) {
  try {
    if (!isObj(raw)) return null;
    if (raw.v !== undefined && raw.v !== 1) return null;
    const out = { v: 1, steps: {} };
    if (isObj(raw.steps)) for (const k of STEPS) if (raw.steps[k]) out.steps[k] = 1;
    // a step needs the ones before it (a hand-edited save cannot skip the path)
    let gap = false;
    for (const k of STEPS) { if (!out.steps[k]) gap = true; else if (gap && k !== 'up2' && k !== 'up3' && k !== 'board') delete out.steps[k]; }
    out.open = out.steps.lifeguard ? 1 : 0;
    if (raw.clean !== undefined) { const c = int(raw.clean, 0, 0xfff); if (c && !out.steps.cleanup) out.clean = c; }
    const h = isObj(raw.hotel) ? raw.hotel : {};
    const level = out.steps.hotel ? int(h.level, 1, 3, 1) : 0;
    const rooms = level ? BEACH_TUNING.hotel.rooms[level - 1] : 0;
    let guests = Array.isArray(h.guests) ? h.guests.filter((g) => Array.isArray(g) && g.length >= 2).map((g) => [int(g[0], 0, 64), int(g[1], 0, 1e7)]).filter((g) => g[0] > 0) : [];
    guests = guests.slice(0, 8);
    let booked = 0;
    guests = guests.filter((g) => { if (booked + g[0] > rooms) { g[0] = rooms - booked; } booked += g[0]; return g[0] > 0; });
    out.hotel = { level, guests };
    if (out.steps.pool) out.facilities = { extras: 1 };
    const order = BEACH_TUNING.founding.order;
    out.shops = Array.isArray(raw.shops) ? Array.from(new Set(raw.shops.filter((s) => order.indexOf(s) >= 0))) : [];
    if (!out.steps.board) out.shops = [];
    if (isObj(raw.card)) { const c = {}; for (const k in raw.card) { const n = int(raw.card[k], 0, 999); if (n > 0 && /^(item|crate)_[a-z_]+$/.test(k)) c[k] = n; } if (Object.keys(c).length) out.card = c; }
    if (raw.fish !== undefined) { const f = int(raw.fish, 0, 999); if (f) out.fish = f; }
    const ev = isObj(raw.events) ? raw.events : {};
    const last = {};
    if (isObj(ev.last)) for (const k of ['contest', 'fireworks', 'polar', 'week']) if (ev.last[k] !== undefined) last[k] = int(ev.last[k], 0, 1e7);
    out.events = { last };
    if (Array.isArray(ev.week) && ev.week.length === 2) { const a = int(ev.week[0], 0, 1e7), b = int(ev.week[1], 0, 1e7); if (b > a) out.events.week = [a, b]; }
    if (ev.happen !== undefined) out.events.happen = int(ev.happen, 0, 1e9);
    const st = isObj(raw.stars) ? raw.stars : {};
    out.stars = { n: out.open ? int(st.n, 0, 3) : 0 };
    const cr = isObj(raw.crowd) ? raw.crowd : {};
    out.crowd = { today: int(cr.today, 0, 1e6), total: int(cr.total, 0, 1e9), day: int(cr.day, 0, 1e7) };
    if (raw.sd !== undefined) out.sd = int(raw.sd, 0, 1e7);
    return out;
  } catch (e) {
    return null;
  }
}

/** the slice as JSON-safe data under the cap (drops optional parts in order) */
export function fitBeach(slice) {
  const out = JSON.parse(JSON.stringify(slice || {}));
  const cap = BEACH_SLICE.cap;
  const len = () => JSON.stringify(out).length;
  if (len() <= cap) return out;
  delete out.crowd;
  if (len() <= cap) return out;
  delete out.card;
  if (out.events) { delete out.events.happen; }
  while (len() > cap && out.hotel && out.hotel.guests && out.hotel.guests.length) out.hotel.guests.shift();
  return out;
}
