// Seeded RNG for the logistics model (mulberry32). Every random choice is drawn from a stream named after what it
// decides (an owner's look, a picker's beat, an order's mode), so one change never shifts the others and the same
// seed replays the same day. No Math.random anywhere in the model.

export class Rng {
  constructor(seed = 1) { this.s = seed >>> 0; }
  next() {
    let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n) { return Math.floor(this.next() * n); }
  /** integer in [a, b] */
  between(a, b) { return a + this.int(b - a + 1); }
  range(a, b) { return a + (b - a) * this.next(); }
  chance(p) { return this.next() < p; }
  pick(list) { return list.length ? list[this.int(list.length)] : undefined; }
}

/** FNV-1a of a string */
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** a stream for (seed, name) */
export function stream(seed, name) { return new Rng((hashStr(String(name)) ^ Math.imul(seed >>> 0, 2654435761)) >>> 0); }
