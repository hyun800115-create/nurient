// incidents save slice (docs/v5_v8_plan.md §6.7 / §8: key `incidents`, version 1, cap 2 KB). Pure.
//   { v: 1, on, buildings: [[id, state, t, lv?]] ≤ 16, wanted: [[slot, inc, pid, reward, item, day, anon]] ≤ 3,
//     hydrants: [[x, y]] ≤ 24, fireLevel, safety: [[day, ok, n]] ≤ 10, drill, lastFire?, police, sale: [home] ≤ 8 }
// Staged scenes, active incidents and moving trucks are not saved: on load they resolve off stage (the story engine
// keeps its own incidents in its side record and sends their next phases as usual).

export const INCIDENTS_SLICE = { key: 'incidents', version: 1, cap: 2048 };

const int = (x, lo, hi, d = 0) => { const n = Number(x); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d; };
const ID = /^[A-Za-z0-9_:#.-]{1,40}$/;
const ITEM = /^item_[a-z_]{2,24}$/;
const PID = /^[A-Za-z0-9_:.-]{1,32}$/;

/** a clean slice from anything (null when there is nothing usable). Never throws. */
export function sanitizeIncidents(raw) {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const out = { v: 1, on: raw.on === undefined ? 1 : raw.on ? 1 : 0, buildings: [], wanted: [], hydrants: [], fireLevel: int(raw.fireLevel, 1, 3, 1), safety: [], drill: raw.drill ? 1 : 0, police: raw.police ? 1 : 0, sale: [] };
    const seen = new Set();
    for (const r of Array.isArray(raw.buildings) ? raw.buildings : []) {
      if (out.buildings.length >= 16) break;
      if (!Array.isArray(r) || typeof r[0] !== 'string' || !ID.test(r[0]) || seen.has(r[0])) continue;
      const st = int(r[1], 0, 7, -1);
      if (st < 0) continue;
      const lv = int(r[3], 0, 9, 0);
      if (st === 0 && !lv) continue;
      seen.add(r[0]);
      const row = [r[0], st, int(r[2], 0, 1e9, 0)];
      if (lv) row.push(lv);
      out.buildings.push(row);
    }
    const slots = new Set();
    for (const r of Array.isArray(raw.wanted) ? raw.wanted : []) {
      if (out.wanted.length >= 3) break;
      if (!Array.isArray(r)) continue;
      const slot = int(r[0], 0, 2, -1);
      const inc = int(r[1], 1, 1e9, 0);
      if (slot < 0 || !inc || slots.has(slot)) continue;
      slots.add(slot);
      out.wanted.push([slot, inc, typeof r[2] === 'string' && PID.test(r[2]) ? r[2] : 0, int(r[3], 0, 1e6, 0), typeof r[4] === 'string' && ITEM.test(r[4]) ? r[4] : 0, int(r[5], 0, 1e7, 0), r[6] ? 1 : 0]);
    }
    for (const h of Array.isArray(raw.hydrants) ? raw.hydrants : []) {
      if (out.hydrants.length >= 24) break;
      if (!Array.isArray(h)) continue;
      const x = Number(h[0]), y = Number(h[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(x) > 1e5 || Math.abs(y) > 1e5) continue;
      out.hydrants.push([Math.round(x), Math.round(y)]);
    }
    const days = new Set();
    for (const r of Array.isArray(raw.safety) ? raw.safety : []) {
      if (out.safety.length >= 10) break;
      if (!Array.isArray(r)) continue;
      const d = int(r[0], 0, 1e7, -1), n = int(r[2], 0, 999, 0), ok = int(r[1], 0, n, 0);
      if (d < 0 || days.has(d) || !n) continue;
      days.add(d);
      out.safety.push([d, ok, n]);
    }
    out.safety.sort((a, b) => a[0] - b[0]);
    if (Number.isFinite(Number(raw.lastFire)) && raw.lastFire !== null && raw.lastFire !== undefined) out.lastFire = int(raw.lastFire, -1e9, 1e9, 0);
    for (const h of Array.isArray(raw.sale) ? raw.sale : []) { if (out.sale.length >= 8) break; if (typeof h === 'string' && ID.test(h) && out.sale.indexOf(h) < 0) out.sale.push(h); }
    return out;
  } catch (e) {
    return null;
  }
}

/** shrink a slice under the cap (old safety days, sale signs, levelled ok buildings, then hydrants) */
export function fitIncidents(s, cap = INCIDENTS_SLICE.cap) {
  if (!s) return s;
  const len = () => JSON.stringify(s).length;
  while (len() > cap && s.safety.length > 3) s.safety.shift();
  while (len() > cap && s.sale.length) s.sale.pop();
  while (len() > cap && s.buildings.some((b) => b[1] === 0)) s.buildings.splice(s.buildings.findIndex((b) => b[1] === 0), 1);
  while (len() > cap && s.buildings.length > 4) s.buildings.pop();
  while (len() > cap && s.hydrants.length) s.hydrants.pop();
  return s;
}
