// Seeded random numbers (sfc32, 128-bit state). Deterministic across Node and browsers; the state is
// four uint32 and round-trips through save/load exactly. Never use Math.random in the story engine.

export function hashStr(s, h = 0x811c9dc5) {
  // FNV-1a 32-bit
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export function mix32(a, b) {
  let h = (a ^ Math.imul(b, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export class Rng {
  constructor(seed = 1) { this.seed(seed); }

  seed(seed) {
    const s = typeof seed === 'string' ? hashStr(seed) : seed >>> 0;
    this.a = 0x9e3779b9; this.b = 0x243f6a88; this.c = 0xb7e15162; this.d = s ^ 0xdeadbeef;
    for (let i = 0; i < 15; i++) this.u32();
    return this;
  }

  u32() {
    let a = this.a, b = this.b, c = this.c, d = this.d;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return t >>> 0;
  }

  /** float in [0, 1) */
  next() { return this.u32() / 4294967296; }
  /** int in [0, n) */
  int(n) { return n <= 1 ? 0 : Math.floor(this.next() * n); }
  /** int in [a, b] */
  range(a, b) { return a + this.int(b - a + 1); }
  chance(p) { return p > 0 && this.next() < p; }
  pick(arr) { return arr.length ? arr[this.int(arr.length)] : undefined; }
  /** index by weights (array of numbers); -1 if all zero */
  weighted(ws, n = ws.length) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += ws[i] > 0 ? ws[i] : 0;
    if (sum <= 0) return -1;
    let r = this.next() * sum;
    for (let i = 0; i < n; i++) { const w = ws[i] > 0 ? ws[i] : 0; if (r < w) return i; r -= w; }
    return n - 1;
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = this.int(i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  getState() { return [this.a | 0, this.b | 0, this.c | 0, this.d | 0]; }
  setState(s) { this.a = s[0] | 0; this.b = s[1] | 0; this.c = s[2] | 0; this.d = s[3] | 0; return this; }
  /** a new independent generator derived from this one's seed material and a key (does not advance this) */
  fork(key) { const r = new Rng(0); r.setState([mix32(this.a, key), mix32(this.b, key + 1), mix32(this.c, key + 2), mix32(this.d, key + 3)]); for (let i = 0; i < 4; i++) r.u32(); return r; }
}
