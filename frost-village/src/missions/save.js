// The `missions` save slice (v1, cap 3 KB). sanitizeMissions(raw) → a clean copy or null; never throws, accepts its
// own output unchanged (tested with 200 fuzzed slices). fitCap() trims a slice that would pass its byte cap, least
// valuable parts first: the fame log, untouched bubbles, parked cards ('once' templates last), timed cooldowns, the
// combo memory, the craft state; only as a last resort (a slice no real game reaches) running missions without
// progress and 'once' cooldowns. Every step must shrink the slice, so fitCap always returns (critique C-1).

import { CATALOG } from './data/catalog.js';
import { BAG_ITEMS } from './data/caps.js';

export const MISSIONS_SLICE = { key: 'missions', version: 1, cap: 3072 };

const CODES = new Set(CATALOG.map((t) => t.code));
const BY_CODE = new Map(CATALOG.map((t) => [t.code, t]));
const DAILY = new Set(CATALOG.filter((t) => t.src === 'daily').map((t) => t.code));
const WEEKLY = new Set(CATALOG.filter((t) => t.src === 'weekly').map((t) => t.code));
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v, lo = -1e10, hi = 1e10) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);
const int = (v, lo, hi, d) => { const n = fin(v, lo, hi); return n === undefined ? d : Math.floor(n); };
const pid = (v) => (typeof v === 'string' && v.length <= 40 && /^[A-Za-z0-9:_.\-]+$/.test(v) ? v : undefined);
export const MAX = { b: 3, a: 8, p: 6, o: 4 };
const sid = (v, n) => (typeof v === 'string' && v.length <= n && /^[A-Za-z0-9:_.\-]+$/.test(v) ? v : undefined);

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
  const pl = sid(o.pl, 24); if (pl) r.pl = pl;          // a destination (an elder's wish place, a new home)
  const wi = sid(o.wi, 16); if (wi) r.wi = wi;          // the story's wish id (C7)
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
  // the craft pads: flowers picked per bed today, a cake in the oven (seconds baked)
  if (isObj(raw.cr)) {
    const cr = { d: int(raw.cr.d, -1, 1e7, -1) };
    if (Array.isArray(raw.cr.p)) { const p = raw.cr.p.filter((x) => Array.isArray(x) && sid(x[0], 24) && fin(x[1]) !== undefined).slice(0, 6).map((x) => [x[0], int(x[1], 0, 99, 0)]); if (p.length) cr.p = p; }
    const ck = fin(raw.cr.k, 0, 3600); if (ck !== undefined) cr.k = Math.round(ck * 10) / 10;
    if (cr.p || cr.k !== undefined) s.cr = cr;
  }
  return s;
}

/** JSON length of a slice */
export const sizeOf = (o) => JSON.stringify(o).length;

/** trim a missions slice until it fits `cap` characters (the least valuable parts go first; always returns) */
export function fitCap(o, cap = MISSIONS_SLICE.cap) {
  if (sizeOf(o) <= cap) return o;
  const s = JSON.parse(JSON.stringify(o));
  const isOnce = (code) => { const t = BY_CODE.get(code); return !!(t && t.repeat === 'once'); };
  const dropFrom = (k, pick) => { const l = s[k]; if (!Array.isArray(l) || !l.length) return false; const j = pick(l); if (j < 0) return false; l.splice(j, 1); if (!l.length) delete s[k]; return true; };
  const steps = [
    // 1. the fame log: halved, then gone (it is only a history for the titles tab)
    () => { const lg = s.fm && s.fm.lg; if (!Array.isArray(lg) || !lg.length) return false; const keep = Math.floor(lg.length / 2); if (keep) s.fm.lg = lg.slice(-keep); else delete s.fm.lg; return true; },
    // 2. untouched request bubbles (they come back by themselves)
    () => dropFrom('o', (l) => l.length - 1),
    // 3. parked cards, oldest first; a 'once' story card (E4, B3 …) only when nothing else is left
    () => dropFrom('p', (l) => { const j = l.findIndex((i) => !isOnce(i.c)); return j >= 0 ? j : 0; }),
    // 4. timed cooldowns (a template may come back a little early); 'once' marks (-1) stay
    () => { if (!s.c) return false; const ks = Object.keys(s.c).filter((k) => s.c[k] !== -1); if (!ks.length) return false; delete s.c[ks[0]]; if (!Object.keys(s.c).length) delete s.c; return true; },
    // 5. small memories: the combo, the craft state, the settlers count, flairs
    () => { for (const k of ['cb', 'cr', 'st2']) if (s[k]) { delete s[k]; return true; } if (s.fm && s.fm.fl) { delete s.fm.fl; return true; } return false; },
    // 6. last resort (no real game gets here): running missions without progress, then the oldest running ones
    () => dropFrom('a', (l) => { const j = l.findIndex((i) => !(i.g && i.g.some((v) => v > 0)) && !i.d); return j >= 0 ? j : l.length > 3 ? 0 : -1; }),
    () => dropFrom('b', (l) => l.length - 1),
    () => { if (!s.c) return false; const ks = Object.keys(s.c); if (!ks.length) return false; delete s.c[ks[0]]; if (!Object.keys(s.c).length) delete s.c; return true; },
  ];
  for (const st of steps) {
    for (let guard = 0; guard < 600 && sizeOf(s) > cap; guard++) {
      const before = sizeOf(s);
      if (!st() || sizeOf(s) >= before) break;          // a step that cannot shrink the slice any more: next step
    }
    if (sizeOf(s) <= cap) break;
  }
  return s;
}
