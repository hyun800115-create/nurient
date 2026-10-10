// Seeded RNG for the beach model (mulberry32). Everything random at the beach is drawn from a stream named after
// what it decides (a day's arrivals, a family's looks, a crab's wander), seeded from the module seed + that name,
// so one change never shifts the others and a reload replays the same day. No Math.random anywhere in the model.

export class Rng {
  constructor(seed = 1) { this.s = seed >>> 0; this.fn = () => this.next(); }
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
  /** weighted pick from { key: weight } */
  weighted(table) {
    let tot = 0;
    for (const k in table) tot += Math.max(0, table[k]);
    let x = this.next() * tot;
    for (const k in table) { x -= Math.max(0, table[k]); if (x < 0) return k; }
    return Object.keys(table)[0];
  }
  shuffle(list) { for (let i = list.length - 1; i > 0; i--) { const j = this.int(i + 1); const t = list[i]; list[i] = list[j]; list[j] = t; } return list; }
  state() { return this.s >>> 0; }
}

/** FNV-1a of a string */
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** a stream for (seed, name) */
export function stream(seed, name) { return new Rng((hashStr(String(name)) ^ Math.imul(seed >>> 0, 2654435761)) >>> 0); }
/** one deterministic number in [0, 1) for (seed, name) */
export function noise(seed, name) { return stream(seed, name).next(); }
