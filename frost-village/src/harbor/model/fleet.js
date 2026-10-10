// The deep-sea trawler fleet (harbor_runtime model, docs/v5_v8_plan.md §6.4 shipyard / trawler): an order at the
// shipyard's pad builds one on the slipway (build s, sparks), it slides into the water when the west berth is free
// (the launch), then it fishes every day: out 05:00, home in the afternoon with `catch` boxes. Pure.

export class Fleet {
  constructor(cfg, saved = null) {
    this.cfg = cfg;
    this.n = saved ? Math.max(0, Math.min(cfg.trawler.max, saved.trawlers | 0)) : 0;     // afloat
    this.building = saved && saved.building > 0 ? Math.min(cfg.trawler.build, +saved.building) : 0;   // s left on the slip
    this.ready = saved ? saved.ready | 0 : 0;      // built, waiting to slide down
    this.launching = null;                          // launch mission id
  }
  total() { return this.n + (this.building > 0 ? 1 : 0) + this.ready + (this.launching ? 1 : 0); }
  canOrder() { return this.total() < this.cfg.trawler.max && this.building <= 0 && !this.ready && !this.launching; }
  order() { if (!this.canOrder()) return false; this.building = this.cfg.trawler.build; return true; }
  /** advance the slipway -> 'built' when a hull is finished */
  update(dt) {
    if (this.building > 0) { this.building -= dt; if (this.building <= 0) { this.building = 0; this.ready++; return 'built'; } }
    return null;
  }
  launched() { this.launching = null; this.n = Math.min(this.cfg.trawler.max, this.n + 1); }
  serialize() { return { trawlers: this.n + (this.launching ? 1 : 0), building: Math.round(this.building * 10) / 10, ready: this.ready }; }
}
