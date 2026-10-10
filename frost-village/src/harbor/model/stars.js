// Harbour stars (harbor_runtime model, docs/v5_v8_plan.md §6.4 stars.js): ★1 when the harbour opens; ★2 / ★3 when
// ships served, items exported and tourists welcomed reach the tuning bars (★2 also needs every revive step). Pure.

export class Stars {
  constructor(cfg, saved = null) {
    this.cfg = cfg;
    this.ships = saved ? saved.ships | 0 : 0;
    this.exports = saved ? saved.exports | 0 : 0;
    this.tourists = saved ? saved.tourists | 0 : 0;
    this.n = saved ? Math.max(0, Math.min(3, saved.n | 0)) : 0;
  }
  add(what, k = 1) { if (what === 'ships' || what === 'exports' || what === 'tourists') this[what] += Math.max(0, k | 0); }
  /** the star the counters reach (allSteps: every revive step built) */
  reach(open, allSteps) {
    if (!open) return 0;
    let n = 1;
    for (const s of [2, 3]) {
      const B = this.cfg.stars[s];
      if (!B || !allSteps) break;
      if (this.ships >= B.ships && this.exports >= B.exports && this.tourists >= B.tourists) n = s; else break;
    }
    return n;
  }
  /** raise the star when earned -> the new star or 0 (stars never go down) */
  check(open, allSteps) { const r = this.reach(open, allSteps); if (r > this.n) { this.n = r; return r; } return 0; }
  /** progress toward the next star: [{ what, have, need }] */
  bars() { const B = this.cfg.stars[this.n + 1]; if (!B) return []; return ['ships', 'exports', 'tourists'].map((w) => ({ what: w, have: this[w], need: B[w] })); }
  serialize() { return { ships: this.ships, exports: this.exports, tourists: this.tourists, n: this.n }; }
}
