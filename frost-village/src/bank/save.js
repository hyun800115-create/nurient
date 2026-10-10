// The `bank` save slice: v1 (v5), v2 adds `ins` (v8 insurance). Cap 1 KB. sanitizeBank(raw) → a clean copy or null;
// never throws and accepts its own output unchanged. Keys: open · sv savings · ld last interest day · tk next ticket ·
// v6 (bigger cap) · so site offered · t5 module start T · ln loan { a amount, l left, f fee left, t0, d0 day taken / restructured, rs restructures, ps paused,
// k 'build'|'ceremony' } · rw passbook rows [day, op, amount, balance] ≤ 8 · ins [[bldId ≤ 10 chars (longer game ids are
// hashed: account.policyId), cost in hundreds (negative = lapsed), hash of the last fire paid]] ≤ 24 (MAX_POLICIES)

export const BANK_SLICE = { key: 'bank', version: 2, cap: 1024 };
const OPS = new Set(['deposit', 'withdraw', 'interest', 'loan', 'repay', 'premium', 'claim', 'waive']);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined);
const int = (v, lo, hi, d) => { const n = fin(v, lo, hi); return n === undefined ? d : Math.floor(n); };

export function sanitizeBank(raw) {
  if (!isObj(raw) || (raw.v !== undefined && raw.v !== 1 && raw.v !== 2)) return null;
  const s = { v: 1, open: raw.open ? 1 : 0, sv: int(raw.sv, 0, 1e9, 0), ld: int(raw.ld, -1, 1e7, -1), tk: int(raw.tk, 1, 999, 1) };
  if (raw.v6) s.v6 = 1;
  if (raw.so) s.so = 1;
  const t5 = fin(raw.t5, -1e9, 1e10); if (t5 !== undefined) s.t5 = Math.round(t5);
  if (isObj(raw.ln)) {
    const l = raw.ln, left = int(l.l, 0, 1e9, 0);
    if (left > 0) s.ln = { a: int(l.a, 0, 1e9, 0), l: left, f: Math.min(left, int(l.f, 0, 1e9, 0)), t0: Math.round(fin(l.t0, -1e9, 1e10) || 0), d0: int(l.d0, 0, 1e7, 0), rs: int(l.rs, 0, 9, 0), ps: l.ps ? 1 : 0, k: l.k === 'ceremony' ? 'ceremony' : 'build' };
  }
  if (Array.isArray(raw.rw)) {
    const rw = raw.rw.filter((r) => Array.isArray(r) && r.length === 4 && OPS.has(r[1]) && fin(r[0], 0, 1e7) !== undefined && fin(r[2], -1e9, 1e9) !== undefined && fin(r[3], -1e10, 1e10) !== undefined)
      .slice(-8).map((r) => [Math.floor(r[0]), r[1], Math.round(r[2]), Math.round(r[3])]);
    if (rw.length) s.rw = rw;
  }
  if (Array.isArray(raw.ins)) {
    const seen = new Set(), ins = [];
    for (const r of raw.ins) {
      if (!Array.isArray(r) || typeof r[0] !== 'string' || !r[0] || r[0].length > 10 || seen.has(r[0])) continue;
      const c = int(r[1], -1e6, 1e6, 0);
      if (!c) continue;
      seen.add(r[0]);
      ins.push([r[0], c, int(r[2], 0, 999983, 0)]);
      if (ins.length >= 24) break;
    }
    if (ins.length) { s.ins = ins; s.v = 2; }
  }
  return s;
}

export const sizeOf = (o) => JSON.stringify(o).length;

/** trim the passbook rows until the slice fits its cap (money fields are never dropped; with ≤ 24 policies of
 *  ≤ 10-char ids the slice always fits once the rows are gone: 24 × 31 B + 150 B < 1 KB) */
export function fitBank(o, cap = BANK_SLICE.cap) {
  if (sizeOf(o) <= cap) return o;
  const s = JSON.parse(JSON.stringify(o));
  while (sizeOf(s) > cap && s.rw && s.rw.length) { s.rw.shift(); if (!s.rw.length) delete s.rw; }
  // (a hand-made slice past that: lapsed policies go before paid ones)
  while (sizeOf(s) > cap && s.ins && s.ins.length) { const j = s.ins.findIndex((r) => r[1] < 0); s.ins.splice(j >= 0 ? j : 0, 1); if (!s.ins.length) delete s.ins; }
  return s;
}
