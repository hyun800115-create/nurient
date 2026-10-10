// Logistics save slice (docs/v5_v8_plan.md §6.6 / §8: key `logistics`, version 1, cap 2 KB). Pure.
//   { v: 1, open, gift, tut, day, seq,
//     stock: { bread: n, ... }            item ids without the `item_` prefix (racks + goods on their way in)
//     orders: [≤ 12 [id, to, flags, got, missing]]   flags = kind (s|y|h) + mode (v|w|c) + st (p|k|r|g) [+ s settled] [+ 3 lv3 | m move-in]
//     cash,                               the 물류 금고 not yet collected
//     chains: [{ id, k: f|a, in, out: [..], m, r }],
//     lv3: [house ids ≤ 32], days: [deliveries per game day, today first, ≤ 10], made: [furniture, appliance], tot: [settled, coins, deliveries] }
// Vehicles, the forklift's lap, the queue and the staff are not saved: a reload sends the owners of ready orders off
// again, goods on their way in are on the racks, a pallet on the forks is back with its order.

export const LOGISTICS_SLICE = { key: 'logistics', version: 1, cap: 2048 };

const int = (x, lo, hi, d = 0) => { const n = Number(x); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d; };
const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});
const KEY = /^[a-z][a-z0-9_]{0,23}$/;
const ID = /^[A-Za-z0-9_:.-]{1,40}$/;
const FLAGS = /^[syh][vwc][pkrg][s]?[3m]?$/;

function items(o, max, lim = 40) {
  const out = {};
  let n = 0;
  for (const k of Object.keys(obj(o)).sort()) {
    if (n >= lim) break;
    if (!KEY.test(k)) continue;
    const v = int(o[k], 0, max, 0);
    if (v > 0) { out[k] = v; n++; }
  }
  return out;
}

/** a clean slice from anything (null when there is nothing usable). Never throws. */
export function sanitizeLogistics(raw) {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out = {
      v: 1, open: raw.open ? 1 : 0, gift: raw.gift ? 1 : 0, tut: raw.tut ? 1 : 0,
      day: int(raw.day, -1, 1e7, -1), seq: int(raw.seq, 0, 1e9, 0),
      stock: items(raw.stock, 9999),
      orders: [],
      cash: int(raw.cash, 0, 1e8, 0),
      chains: [], lv3: [], days: [], made: [0, 0], tot: [0, 0, 0],
    };
    const seen = new Set();
    for (const r of Array.isArray(raw.orders) ? raw.orders : []) {
      if (out.orders.length >= 12) break;
      if (!Array.isArray(r) || r.length < 5) continue;
      const [id, to, f] = r;
      if (typeof id !== 'string' || !ID.test(id) || seen.has(id)) continue;
      if (typeof to !== 'string' || !/^(shop|story|home):[A-Za-z0-9_.:+-]{1,40}$/.test(to)) continue;
      if (typeof f !== 'string' || !FLAGS.test(f)) continue;
      const kind = { s: 'shop', y: 'story', h: 'home' }[f[0]];
      if (!to.startsWith(kind + ':')) continue;
      const got = items(r[3], 999, 12), miss = items(r[4], 999, 12);
      if (!Object.keys(got).length && !Object.keys(miss).length) continue;
      seen.add(id);
      out.orders.push([id, to, f, got, miss]);
    }
    for (const c of Array.isArray(raw.chains) ? raw.chains : []) {
      if (out.chains.length >= 6) break;
      if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !ID.test(c.id) || (c.k !== 'f' && c.k !== 'a')) continue;
      if (out.chains.some((q) => q.id === c.id)) continue;
      const okOut = c.k === 'f' ? /^(chair|table|sofa|bed|wardrobe)$/ : /^(radio|stove_iron|washer|fridge|tv_retro)$/;
      out.chains.push({ id: c.id, k: c.k, in: int(c.in, 0, 99, 0), out: (Array.isArray(c.out) ? c.out : []).filter((x) => typeof x === 'string' && okOut.test(x)).slice(0, 8), m: int(c.m, 0, 1e7, 0), r: int(c.r, 0, 1e7, 0) });
    }
    for (const h of Array.isArray(raw.lv3) ? raw.lv3 : []) { if (out.lv3.length >= 32) break; const s = String(h); if (ID.test(s) && out.lv3.indexOf(s) < 0) out.lv3.push(s); }
    for (const d of Array.isArray(raw.days) ? raw.days.slice(0, 10) : []) out.days.push(int(d, 0, 1e6, 0));
    if (Array.isArray(raw.made)) out.made = [int(raw.made[0], 0, 1e7, 0), int(raw.made[1], 0, 1e7, 0)];
    if (Array.isArray(raw.tot)) out.tot = [int(raw.tot[0], 0, 1e8, 0), int(raw.tot[1], 0, 1e10, 0), int(raw.tot[2], 0, 1e9, 0)];
    return fitLogistics(out);
  } catch (e) {
    return null;
  }
}

/**
 * keep the slice under the cap without losing goods: the oldest orders that are not settled yet go back to the racks
 * (their goods join the stock, the shop simply orders again), then the day history shortens.
 */
export function fitLogistics(s) {
  const len = () => JSON.stringify(s).length;
  if (len() <= LOGISTICS_SLICE.cap) return s;
  while (len() > LOGISTICS_SLICE.cap && s.orders.length) {
    let k = s.orders.findIndex((r) => r[2].indexOf('s', 3) < 0 && r[2][2] !== 'g');
    if (k < 0) k = s.orders.findIndex((r) => r[2][2] !== 'g');
    if (k < 0) break;
    const r = s.orders.splice(k, 1)[0];
    for (const [it, n] of Object.entries(r[3])) s.stock[it] = Math.min(9999, (s.stock[it] || 0) + n);
  }
  while (len() > LOGISTICS_SLICE.cap && s.days.length > 1) s.days.pop();
  while (len() > LOGISTICS_SLICE.cap && s.lv3.length > 8) s.lv3.pop();
  return s;
}
