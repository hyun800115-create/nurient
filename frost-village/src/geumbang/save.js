// 금방 save slice (plan §9: key `geumbang`, version 1, cap 1,400 B, no SAVE_VERSION bump). Pure.
//   { v: 1, st: 0|1|2, lv: { van 1..3, pack 0|1, sled 0..2, dawn 0|1, back 0|1, lockP 0|1, lockA 0|1 },
//     seq, seed: uint32, day,
//     ord:  [[id, to, flags, got, age] ≤ 24]  age = seconds since the order (t0 = T at load − age)   to 'a:t_apt2' | 'l:lotH3' | 'h:<houseId>'; flags = st (p|k|r) + mode (c|s)
//                                            [+ f first order][+ t tomorrow]; got 'bread3,can2' (no item_ prefix);
//                                            'gone' (on a van) is saved as 'r': vans restart from bay 1
//     door: [[aid, size, ageH] ≤ 16], staff: [uint32 ≤ 12], days: [[orders, delivered, coins] ≤ 7],
//     tot: [orders, delivered, coins, units], rev: [[tpl, aid, stars] ≤ 12], seen: n,
//     g?: gate seconds (only before the letter), up?: [needs met 'pack,van2', nights, sledDays],
//     back?: 'bread5,log3' (items of orders that did not fit the cap: they go back on the racks at load) }
// sanitizeGeumbang(raw): ints clamped, unknown items dropped, arrays capped, JSON ≤ 1,400 B (oldest days, then
// reviews, doorstep boxes and staff looks go first; then the youngest orders fold into `back` — their items are
// restocked at load, so nothing is lost or doubled), never throws.
// Unknown addresses are restocked by the model at load (it knows the AddressBook; this file does not).

export const GEUMBANG_SLICE = { key: 'geumbang', version: 1, cap: 1400 };

const ITEM_KEYS = new Set(['bread', 'meat_cooked', 'fish_cooked', 'can', 'plank', 'axe', 'rod', 'sickle', 'bow', 'pickaxe', 'fish_raw', 'meat_raw', 'log', 'wheat']);
const int = (x, lo, hi, d = 0) => { const n = Number(x); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d; };
const bit = (x) => (x === true || x === 1 || x === '1' ? 1 : 0);
const ID = /^g\d{1,7}$/;
const TO = /^[alh]:[A-Za-z0-9_.-]{1,32}$/;
const FLAGS = /^[pkr][cs]f?t?$/;
const SIZE = /^[sml]$/;

/** 'bread3,can2' with only known items, each 1..99, ≤ 6 lines */
function cleanGot(s, max = 99, lines = 6) {
  if (typeof s !== 'string') return '';
  const out = [];
  const seen = new Set();
  for (const part of s.split(',')) {
    const m = /^([a-z][a-z_]{0,23}?)(\d{1,4})$/.exec(part);
    if (!m || !ITEM_KEYS.has(m[1]) || seen.has(m[1])) continue;
    const n = int(m[2], 0, max, 0);
    if (n <= 0) continue;
    seen.add(m[1]);
    out.push(m[1] + n);
    if (out.length >= lines) break;
  }
  return out.join(',');
}

/** a clean slice (null when there is nothing usable). Never throws. */
export function sanitizeGeumbang(raw) {
  try {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const L = raw.lv && typeof raw.lv === 'object' && !Array.isArray(raw.lv) ? raw.lv : {};
    const out = {
      v: 1, st: int(raw.st, 0, 2, 0),
      lv: { van: int(L.van, 1, 3, 1), pack: bit(L.pack), sled: int(L.sled, 0, 2, 1), dawn: bit(L.dawn), back: bit(L.back), lockP: bit(L.lockP), lockA: bit(L.lockA) },
      seq: int(raw.seq, 0, 9999999, 0), seed: (int(raw.seed, 0, 4294967295, 0) >>> 0) || 20261017, day: int(raw.day, 0, 1e7, 0),
      ord: [], door: [], staff: [], days: [], tot: [0, 0, 0, 0], rev: [], seen: int(raw.seen, 0, 255, 0),
    };
    if (out.st === 0 && raw.g !== undefined) out.g = int(raw.g, 0, 100000, 0);
    const ids = new Set();
    for (const r of Array.isArray(raw.ord) ? raw.ord : []) {
      if (out.ord.length >= 24) break;
      if (!Array.isArray(r) || r.length < 5) continue;
      const [id, to, flags] = r;
      if (typeof id !== 'string' || !ID.test(id) || ids.has(id)) continue;
      if (typeof to !== 'string' || !TO.test(to)) continue;
      if (typeof flags !== 'string' || !FLAGS.test(flags)) continue;
      const got = cleanGot(r[3]);
      if (!got) continue;
      ids.add(id);
      const n = Number(id.slice(1));
      if (n > out.seq) out.seq = n;
      out.ord.push([id, to, flags, got, int(r[4], 0, 1e9, 0)]);
    }
    for (const d of Array.isArray(raw.door) ? raw.door : []) {
      if (out.door.length >= 16) break;
      if (!Array.isArray(d) || typeof d[0] !== 'string' || !TO.test(d[0]) || typeof d[1] !== 'string' || !SIZE.test(d[1])) continue;
      out.door.push([d[0], d[1], Math.round(Math.max(0, Math.min(24, Number(d[2]) || 0)) * 10) / 10]);
    }
    for (const s of Array.isArray(raw.staff) ? raw.staff : []) { if (out.staff.length >= 12) break; const n = Number(s); if (Number.isFinite(n) && n >= 0 && n <= 4294967295) out.staff.push(Math.floor(n) >>> 0); }
    for (const d of Array.isArray(raw.days) ? raw.days : []) { if (out.days.length >= 7) break; if (Array.isArray(d)) out.days.push([int(d[0], 0, 1e6, 0), int(d[1], 0, 1e6, 0), int(d[2], 0, 1e9, 0)]); }
    if (Array.isArray(raw.tot)) out.tot = [int(raw.tot[0], 0, 1e9, 0), int(raw.tot[1], 0, 1e9, 0), int(raw.tot[2], 0, 2e9, 0), int(raw.tot[3], 0, 1e10, 0)];
    for (const r of Array.isArray(raw.rev) ? raw.rev : []) {
      if (out.rev.length >= 12) break;
      if (!Array.isArray(r) || typeof r[1] !== 'string' || !/^[A-Za-z0-9_.-]{1,32}$/.test(r[1])) continue;
      out.rev.push([int(r[0], 1, 12, 1), r[1], int(r[2], 4, 5, 5)]);
    }
    if (typeof raw.back === 'string') { const b = cleanGot(raw.back, 9999, 14); if (b) out.back = b; }
    if (Array.isArray(raw.up) && raw.up.length === 3 && typeof raw.up[0] === 'string') {
      const ks = raw.up[0].split(',').filter((k) => /^(pack|van2|van3|sled2|lockA|lockP|dawn|back)$/.test(k)).slice(0, 8);
      out.up = [ks.join(','), int(raw.up[1], 0, 999, 0), int(raw.up[2], 0, 999, 0)];
    }
    return fitGeumbang(out);
  } catch (e) {
    return null;
  }
}

/** shrink a slice under the cap: the older days, the reviews, the doorstep boxes, the staff looks, today's row, then
 *  the youngest orders fold into `back` */
export function fitGeumbang(s, cap = GEUMBANG_SLICE.cap) {
  if (!s) return s;
  let j = JSON.stringify(s);
  // (today's row goes last: a reload on the same day finds today's numbers again, so a round trip is stable)
  while (j.length > cap && s.days.length > 1) { s.days.pop(); j = JSON.stringify(s); }
  while (j.length > cap && s.rev.length) { s.rev.pop(); j = JSON.stringify(s); }
  while (j.length > cap && s.door.length) { s.door.pop(); j = JSON.stringify(s); }
  while (j.length > cap && s.staff.length) { s.staff.pop(); j = JSON.stringify(s); }
  while (j.length > cap && s.days.length) { s.days.pop(); j = JSON.stringify(s); }
  // the youngest orders fold into `back` (their items return to the racks at load)
  while (j.length > cap && s.ord.length) {
    const r = s.ord.pop();
    s.back = mergeGot(s.back || '', r[3]);
    j = JSON.stringify(s);
  }
  return s;
}

/** 'bread3,log2' + 'bread1,can2' -> 'bread4,can2,log2' */
export function mergeGot(a, b) {
  const m = {};
  for (const s of [a, b]) for (const part of String(s || '').split(',')) { const q = /^([a-z][a-z_]{0,23}?)(\d{1,4})$/.exec(part); if (q) m[q[1]] = (m[q[1]] || 0) + Number(q[2]); }
  return Object.keys(m).sort().map((k) => k + Math.min(9999, m[k])).join(',');
}

/** the slice's byte size (tests, the save report) */
export const sliceBytes = (s) => JSON.stringify(s).length;

/** G3 (v8): the open orders as v8 `logistics.orders` home rows ([id, to, flags, got, missing]) */
export function toV8Rows(s) {
  const out = [];
  for (const [id, to, flags, got] of (s && s.ord) || []) {
    const st = { p: 'p', k: 'k', r: 'r' }[flags[0]];
    const g = {};
    for (const part of got.split(',')) { const m = /^([a-z_]+?)(\d+)$/.exec(part); if (m) g[m[1]] = Number(m[2]); }
    out.push([id, 'home:' + to.slice(2), 'hc' + st, g, {}]);
  }
  return out;
}
