// Seeded randomness for the 금방 model (plan §12.1: one stream per subsystem, mulberry32(seed ^ day)). Each stream is
// named after what it decides (orders, baskets, couriers, reviews …): a change in one subsystem never shifts the
// others, and the same seed replays the same day. No Math.random anywhere in the model.

export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

export class Rng {
  constructor(seed = 1) { this.s = seed >>> 0; }
  next() {
    let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n) { return Math.floor(this.next() * n); }
  between(a, b) { return a + this.int(b - a + 1); }
  range(a, b) { return a + (b - a) * this.next(); }
  chance(p) { return this.next() < p; }
  pick(list) { return list.length ? list[this.int(list.length)] : undefined; }
  /** index by weight (weights >= 0); -1 when all are 0 */
  weighted(ws) {
    let t = 0;
    for (const w of ws) t += w > 0 ? w : 0;
    if (t <= 0) return -1;
    let r = this.next() * t;
    for (let i = 0; i < ws.length; i++) { const w = ws[i] > 0 ? ws[i] : 0; if (r < w) return i; r -= w; }
    return ws.length - 1;
  }
  /** exponential wait with mean m */
  exp(m) { return -Math.log(1 - Math.min(0.999999, this.next())) * m; }
}

/** a stream for (seed, name, day): mulberry32(seed ^ hash(name) ^ day·φ) */
export function stream(seed, name, day = 0) {
  return new Rng((hashStr(String(name)) ^ (seed >>> 0) ^ Math.imul((day | 0) + 1, 2654435761)) >>> 0);
}

/** a stable uint32 look seed for a crew member or a household */
export function lookSeed(seed, name) { return (hashStr(String(name)) ^ Math.imul(seed >>> 0, 2246822519)) >>> 0; }
