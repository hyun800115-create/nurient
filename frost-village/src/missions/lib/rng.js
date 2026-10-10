// Seeded random numbers for the missions + bank module (mulberry32: one uint32 of state, so the whole stream
// round-trips through the save slice as a single number). Never Math.random in a model.
// (At integration this file is replaced by src/kit/rng.js, which has the same API: docs/v5_v8_plan.md §5.9.)

/** FNV-1a 32-bit hash of a string (stable seeds from date keys, template codes …) */
export function hashStr(s, h = 0x811c9dc5) {
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export class Rng {
  constructor(seed = 1) { this.s = (typeof seed === 'string' ? hashStr(seed) : seed >>> 0) || 0x9e3779b9; }
  /** uint32 */
  u32() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }
  /** float in [0, 1) */
  next() { return this.u32() / 4294967296; }
  /** int in [0, n) */
  int(n) { return n <= 1 ? 0 : Math.floor(this.next() * n); }
  /** float in [a, b) */
  between(a, b) { return a + (b - a) * this.next(); }
  chance(p) { return p > 0 && this.next() < p; }
  pick(arr) { return arr && arr.length ? arr[this.int(arr.length)] : undefined; }
  /** index into `ws` by weight (-1 when every weight is 0) */
  weighted(ws) {
    let sum = 0;
    for (const w of ws) sum += w > 0 ? w : 0;
    if (sum <= 0) return -1;
    let r = this.next() * sum;
    for (let i = 0; i < ws.length; i++) { const w = ws[i] > 0 ? ws[i] : 0; if (r < w) return i; r -= w; }
    return ws.length - 1;
  }
  get state() { return this.s >>> 0; }
  set state(v) { this.s = (v >>> 0) || 0x9e3779b9; }
}
