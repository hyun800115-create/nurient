// The `missions` save slice (v1, cap 3 KB) and the `bank` slice's cap helper. sanitizeMissions(raw) → a clean copy
// or null; never throws, accepts its own output unchanged (tested with 200 fuzzed slices). fitCap() trims a slice
// that would pass its byte cap: the fame log first, then untouched bubbles, then parked cards (the board, accepted
// missions, the calendar and fame points are never dropped).

import { CATALOG } from './data/catalog.js';
import { BAG_ITEMS } from './data/caps.js';

export const MISSIONS_SLICE = { key: 'missions', version: 1, cap: 3072 };

const CODES = new Set(CATALOG.map((t) => t.code));
const DAILY = new Set(CATALOG.filter((t) => t.src === 'daily').map((t) => t.code));
const WEEKLY = new Set(CATALOG.filter((t) => t.src === 'weekly').map((t) => t.code));
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v, lo = -1e10, hi = 1e10) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);
const int = (v, lo, hi, d) => { const n = fin(v, lo, hi); return n === undefined ? d : Math.floor(n); };
const pid = (v) => (typeof v === 'string' && v.length <= 40 && /^[A-Za-z0-9:_.\-]+$/.test(v) ? v : undefined);
const MAX = { b: 3, a: 8, p: 6, o: 4 };

function inst(o, seen) {
  if (!isObj(o) || !CODES.has(o.c)) return null;
  const i = int(o.i, 1, 1e9, 0);
  if (!i || seen.has(i)) return null;
  seen.add(i);
  const r = { i, c: o.c, t0: int(o.t0, -1e9, 1e10, 0) };
  if (Array.isArray(o.g)) r.g = Array.from(o.g.slice(0, 8), (v) => int(v, 0, 1e6, 0));
  const tp = fin(o.tp); if (tp !== undefined) r.tp = Math.round(tp);
  const d = fin(o.d, 0); if (d) r.d = Math.round(d);
  for (const k of ['gv', 'w', 'nm']) { const p = pid(o[k]); if (p) r[k] = p; }
  if (typeof o.k === 'string' && o.k.length <= 24) r.k = o.k;
  const sg = int(o.sg, 0, 9, 0); if (sg) r.sg = sg;
  return r;
}

/** a clean copy of a missions slice (null when it is not one) */
export function sanitizeMissions(raw) {
  if (!isObj(raw) || (raw.v !== undefined && raw.v !== 1)) return null;
  const s = { v: 1 };
  const sd = fin(raw.sd, 0, 4294967295); if (sd !== undefined) s.sd = Math.floor(sd);
  const rs = fin(raw.rs, 0, 4294967295); if (rs !== undefined) s.rs = Math.floor(rs);
  s.n = int(raw.n, 1, 1e9, 1);
  for (const k of ['t5', 'bt', 'rq']) { const v = fin(raw[k]); if (v !== undefined) s[k] = Math.round(v); }
  const seen = new Set();
  for (const k of ['b', 'a', 'p', 'o']) {
    if (!Array.isArray(raw[k])) continue;
    const l = [];
    for (const o of raw[k]) { const r = inst(o, seen); if (r) l.push(r); if (l.length >= MAX[k]) break; }
    if (l.length) s[k] = l;
  }
  // (the board never shows the same template twice)
  if (s.b) { const cs = new Set(); s.b = s.b.filter((i) => (cs.has(i.c) ? false : (cs.add(i.c), true))); }
  // ids never repeat: the next id is past every saved one
  for (const k of ['b', 'a', 'p', 'o']) for (const i of s[k] || []) if (i.i >= s.n) s.n = i.i + 1;
  if (isObj(raw.c)) { const c = {}; for (const k in raw.c) if (CODES.has(k)) { const v = fin(raw.c[k], -1); if (v !== undefined) c[k] = v === -1 ? -1 : Math.round(v); } if (Object.keys(c).length) s.c = c; }
  if (isObj(raw.bag)) { const b = {}; for (const k in raw.bag) if (k in BAG_ITEMS) { const v = int(raw.bag[k], 0, 99, 0); if (v) b[k] = v; } if (Object.keys(b).length) s.bag = b; }
  if (isObj(raw.dy)) {
    const ids = Array.isArray(raw.dy.ids) ? Array.from(new Set(raw.dy.ids.filter((c) => DAILY.has(c)))).slice(0, 3) : [];
    if (ids.length) {
      const g = ids.map((_, k) => (Array.isArray(raw.dy.g) && Array.isArray(raw.dy.g[k]) ? Array.from(raw.dy.g[k].slice(0, 4), (v) => int(v, 0, 1e6, 0)) : []));
      const kk = ids.map((_, k) => (Array.isArray(raw.dy.k) && raw.dy.k[k] ? 1 : 0));
      s.dy = { d: int(raw.dy.d, 0, 1e7, 0), ids, g, k: kk, a: raw.dy.a && kk.every((v) => v) ? 1 : 0 };
    }
  }
  if (isObj(raw.wk) && WEEKLY.has(raw.wk.c)) s.wk = { w: int(raw.wk.w, 0, 1e7, 0), c: raw.wk.c, g: int(raw.wk.g, 0, 1e7, 0), s: int(raw.wk.s, 0, 3, 0) };
  if (isObj(raw.st)) s.st = { n: int(raw.st.n, 0, 1e6, 0), last: int(raw.st.last, 0, 1e7, 0), sw: int(raw.st.sw, 0, 1e7, 0) };
  if (isObj(raw.cb)) s.cb = { a: (Array.isArray(raw.cb.a) ? raw.cb.a : []).map((v) => fin(v)).filter((v) => v !== undefined).slice(-5).map(Math.round), on: raw.cb.on ? 1 : 0, last: Math.round(fin(raw.cb.last) || 0) };
  const ds = int(raw.ds, 0, 10, 0); if (ds) s.ds = ds;
  const fm = isObj(raw.fm) ? raw.fm : {};
  s.fm = { p: int(fm.p, 0, 1e7, 0) };
  const r = int(fm.r, 0, 1e6, 0); if (r) s.fm.r = r;
  if (isObj(fm.fl)) s.fm.fl = { c: Math.max(0, Math.round(fin(fm.fl.c, 0, 1e15) || 0)), d: Math.max(0, Math.round(fin(fm.fl.d, 0, 1e10) || 0)) };
  if (Array.isArray(fm.lg)) {
    const lg = fm.lg.filter((x) => Array.isArray(x) && x.length === 3 && fin(x[0]) !== undefined && fin(x[1]) !== undefined && typeof x[2] === 'string')
      .slice(-12).map((x) => [Math.round(x[0]), int(x[1], 0, 1e6, 0), x[2].slice(0, 8)]);
    if (lg.length) s.fm.lg = lg;
  }
  if (isObj(raw.fl)) { const f = {}; for (const k of ['paper', 'age80']) if (raw.fl[k]) f[k] = 1; const bd = int(raw.fl.bday, 0, 1e7, -1); if (bd >= 0) f.bday = bd; if (Object.keys(f).length) s.fl = f; }
  if (isObj(raw.st2)) s.st2 = { d: int(raw.st2.d, -1, 1e7, -1), n: int(raw.st2.n, 0, 1000, 0) };
  return s;
}

/** JSON length of a slice */
export const sizeOf = (o) => JSON.stringify(o).length;

/** trim a missions slice until it fits `cap` characters (the least valuable parts go first) */
export function fitCap(o, cap = MISSIONS_SLICE.cap) {
  if (sizeOf(o) <= cap) return o;
  const s = JSON.parse(JSON.stringify(o));
  const steps = [
    () => { if (s.fm && s.fm.lg && s.fm.lg.length) { s.fm.lg = s.fm.lg.slice(-Math.floor(s.fm.lg.length / 2)); if (!s.fm.lg.length) delete s.fm.lg; return true; } return false; },
    () => { if (s.o && s.o.length) { s.o.pop(); if (!s.o.length) delete s.o; return true; } return false; },
    () => { if (s.p && s.p.length) { s.p.shift(); if (!s.p.length) delete s.p; return true; } return false; },
    () => { if (s.c) { const ks = Object.keys(s.c).filter((k) => s.c[k] !== -1); if (ks.length) { delete s.c[ks[0]]; return true; } } return false; },
  ];
  for (const st of steps) { while (sizeOf(s) > cap && st()) { /* trim */ } if (sizeOf(s) <= cap) break; }
  return s;
}
