// Seeded RNG for the incidents model (mulberry32). Every decision draws from a stream named after what it decides
// ('cast:12', 'plan:3', 'outcome:7'), seeded from the module seed + that name, so one change never shifts the others
// and a reload replays the same day. Pure: no Math.random, no clock.

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
  pick(list) { return list && list.length ? list[this.int(list.length)] : undefined; }
  /** index by weights (all ≥ 0) */
  weighted(ws) { let s = 0; for (const w of ws) s += Math.max(0, w); if (!(s > 0)) return 0; let r = this.next() * s; for (let i = 0; i < ws.length; i++) { r -= Math.max(0, ws[i]); if (r < 0) return i; } return ws.length - 1; }
  /** how many of a Poisson-ish mean (one draw per whole unit, like the story engine's planDay) */
  count(mean) { let c = 0, x = mean; while (x > 0) { if (this.chance(Math.min(1, x))) c++; x -= 1; } return c; }
}

/** FNV-1a of a string */
export function hashStr(s) { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** a stream for (seed, name) */
export function stream(seed, name) { return new Rng((hashStr(name) ^ Math.imul(seed >>> 0, 2654435761)) >>> 0); }
