// Seeded RNG for the vehicles model (mulberry32; one uint32 state, saved in the slice so a reload continues the same
// stream). Named sub-streams keep unrelated draws (car trips, rider looks) from shifting each other.

export class Rng {
  constructor(seed = 1) { this.s = seed >>> 0; }
  next() {
    let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n) { return Math.floor(this.next() * n); }
  range(a, b) { return a + (b - a) * this.next(); }
  pick(list) { return list.length ? list[this.int(list.length)] : undefined; }
  state() { return this.s >>> 0; }
}

/** FNV-1a of a string (stable ids -> seeds) */
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
