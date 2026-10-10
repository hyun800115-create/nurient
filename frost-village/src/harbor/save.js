// harbour save slice (docs/v5_v8_plan.md §6.4 / §8: key `harbor`, version 1, cap 2 KB). Pure.
//   { v: 1, open, steps: [step ids built], exports: [≤ 3 { id, items, got, due, done, n }], imports: { unlocked: [], stock: {} },
//     cs (cargo ships served), fleet: { trawlers, building, ready }, auction: { day, coins, raw, big, boxes },
//     tourists: { day, today, total }, stars: { ships, exports, tourists, n }, res (harbour residents), beachStop }
// Ships at sea, passengers, gulls and the crane's lifts are not saved: the timetable is replanned from the day and
// every ship is where it would be.

import { STEPS } from './tuning.js';
import { IMPORTS } from './model/trade.js';

export const HARBOR_SLICE = { key: 'harbor', version: 1, cap: 2048 };

const int = (x, lo, hi, d = 0) => { const n = Number(x); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d; };
const num = (x, lo, hi, d = 0) => { const n = Number(x); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const ITEM = /^(item_[a-z_]{2,24}|tools)$/;
const ID = /^[A-Za-z0-9_:.-]{1,16}$/;
const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});

function items(o, max) {
  const out = {};
  let n = 0;
  for (const k of Object.keys(obj(o))) { if (n >= 4) break; if (!ITEM.test(k)) continue; const v = int(o[k], 0, max, 0); if (v > 0 || max === 0) { out[k] = v; n++; } }
  return out;
}

/** a clean slice from anything (null when there is nothing usable). Never throws. */
export function sanitizeHarbor(raw) {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const steps = Array.isArray(raw.steps) ? STEPS.filter((s) => raw.steps.indexOf(s) >= 0) : [];
    // steps are built in order: keep the leading run only
    let k = 0; while (k < steps.length && steps[k] === STEPS[k]) k++;
    const st = steps.slice(0, k);
    const exportsIn = Array.isArray(raw.exports) ? raw.exports : [];
    const exp = [];
    for (const c of exportsIn) {
      if (exp.length >= 3) break;
      if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !ID.test(c.id)) continue;
      const it = items(c.items, 5000);
      if (!Object.keys(it).length) continue;
      const got = {};
      const g = items(c.got, 5000);
      for (const kk in it) if (g[kk]) got[kk] = Math.min(it[kk], g[kk]);
      exp.push({ id: c.id, items: it, got, due: int(c.due, 0, 1e9, 0), done: c.done ? 1 : 0, n: int(c.n, 0, 1e6, 0) });
    }
    const im = obj(raw.imports);
    const unlocked = Array.isArray(im.unlocked) ? IMPORTS.filter((x) => im.unlocked.indexOf(x) >= 0) : [];
    const stock = {};
    for (const x of IMPORTS) { const v = int(obj(im.stock)[x], 0, 9999, 0); if (v) stock[x] = v; }
    const f = obj(raw.fleet), a = obj(raw.auction), t = obj(raw.tourists), s = obj(raw.stars);
    const open = st.indexOf('railExt') >= 0 ? 1 : (raw.open ? 1 : 0);
    return {
      v: 1, open, steps: st, exports: exp, imports: { unlocked, stock }, cs: int(raw.cs, 0, 1e6, 0),
      fleet: { trawlers: int(f.trawlers, 0, 3, 0), building: num(f.building, 0, 600, 0), ready: int(f.ready, 0, 3, 0) },
      auction: { day: int(a.day, -1, 1e7, -1), coins: int(a.coins, 0, 1e9, 0), raw: int(a.raw, 0, 9999, 0), big: int(a.big, 0, 9999, 0), boxes: int(a.boxes, 0, 999, 0) },
      tourists: { day: int(t.day, -1, 1e7, -1), today: int(t.today, 0, 1e6, 0), total: int(t.total, 0, 1e8, 0) },
      stars: { ships: int(s.ships, 0, 1e7, 0), exports: int(s.exports, 0, 1e8, 0), tourists: int(s.tourists, 0, 1e8, 0), n: open ? int(s.n, 0, 3, 1) : 0 },
      res: int(raw.res, 0, 20, 0), beachStop: raw.beachStop ? 1 : 0,
    };
  } catch (e) {
    return null;
  }
}

/** shrink a slice under the cap (old contracts first, then import stock keys) */
export function fitHarbor(s, cap = HARBOR_SLICE.cap) {
  if (!s) return s;
  let j = JSON.stringify(s);
  while (j.length > cap && s.exports.length) { s.exports.shift(); j = JSON.stringify(s); }
  return s;
}
