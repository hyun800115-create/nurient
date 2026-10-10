// The 안심 (safety) bar and the rates the story engine gets (docs/v5_v8_plan.md §6.7 model/safety.js). Pure.
//
//   safety % = incidents resolved within a game day (fires out before a ruin) / all incidents that ended, over the
//              last 10 game days; 100 % with no incidents or when 사건·사고 is off (rank 4 bar: 90 %)
//   rates     = { incidents, incidentRate, fireRate } for StoryEngine.setRates / toggles (E4):
//     incidentRate = 0.4 × happy factor                                   (a happy village has fewer)
//     fireRate     = 0.05 × (1 − min(40 %, 5 % per hydrant)) × (1 − 10 % per fire-station level above 1) × happy
//                    and 0 until the fire drill (C14) and for 4 game days after a fire

import { DAY, dayOf } from './time.js';

export class Safety {
  constructor(cfg, saved = {}) {
    this.cfg = cfg;
    const s = saved || {};
    this.on = s.on === undefined ? cfg.on !== false : !!s.on;
    this.ring = Array.isArray(s.safety) ? s.safety.filter((r) => Array.isArray(r) && r.length >= 3).map((r) => [r[0] | 0, Math.max(0, r[1] | 0), Math.max(0, r[2] | 0)]) : [];
    this.lastFire = Number.isFinite(s.lastFire) ? s.lastFire : -1e9;
    this.drill = !!s.drill || cfg.drillFirst === false;
    this.fireLevel = Math.max(1, Math.min(3, Number(s.fireLevel) || 1));
    this.hydrants = Array.isArray(s.hydrants) ? s.hydrants.filter((h) => Array.isArray(h) && h.length >= 2).map((h) => [Math.round(h[0]), Math.round(h[1])]).slice(0, cfg.hydrant.max || 24) : [];
    this.happy = 0.5;
  }

  /** an incident ended at T: ok = resolved within a day (and a fire out before a ruin) */
  record(T, ok) {
    const d = dayOf(T);
    let r = this.ring.length ? this.ring[this.ring.length - 1] : null;
    if (!r || r[0] !== d) { r = [d, 0, 0]; this.ring.push(r); }
    r[2]++; if (ok) r[1]++;
    this.trim(T);
  }

  trim(T) { const d0 = dayOf(T) - (this.cfg.safety.days || 10) + 1; this.ring = this.ring.filter((r) => r[0] >= d0).slice(-(this.cfg.safety.days || 10)); }

  /** 0..100 */
  percent(T) {
    if (!this.on) return 100;
    const d0 = dayOf(T) - (this.cfg.safety.days || 10) + 1;
    let ok = 0, n = 0;
    for (const r of this.ring) if (r[0] >= d0) { ok += r[1]; n += r[2]; }
    const pr = Math.max(0, (this.cfg.safety && this.cfg.safety.prior) || 0);
    return n ? Math.round((100 * (ok + pr)) / (n + pr)) : 100;
  }

  fire(T) { this.lastFire = T; }
  addHydrant(x, y) {
    if (this.hydrants.length >= (this.cfg.hydrant.max || 24)) return false;
    if (this.hydrants.some((h) => Math.hypot(h[0] - x, h[1] - y) < 8)) return false;
    this.hydrants.push([Math.round(x), Math.round(y)]);
    return true;
  }
  setLevel(n) { const v = Math.max(1, Math.min(3, n | 0)); const ch = v !== this.fireLevel; this.fireLevel = v; return ch; }

  /** village happiness 0..1 (or 0..100) -> rate factor (at0 .. at1) */
  happyFactor(h = this.happy) {
    const k = Math.max(0, Math.min(1, h > 1 ? h / 100 : h));
    const H = this.cfg.happy || { at0: 1.25, at1: 0.75 };
    return H.at0 + (H.at1 - H.at0) * k;
  }

  hydrantCut() { const H = this.cfg.hydrant; return Math.min(H.cutMax, this.hydrants.length * H.fireCut); }
  levelCut() { let c = 0; for (let l = 2; l <= this.fireLevel; l++) c += (this.cfg.fireStation[l] && this.cfg.fireStation[l].fireCut) || 0; return Math.min(0.5, c); }

  /** may a fire happen at T (drill done, gap since the last fire) */
  fireAllowed(T) { return this.on && this.drill && T - this.lastFire >= (this.cfg.fireGapDays || 4) * DAY; }

  /** the engine rates now */
  rates(T) {
    if (!this.on) return { incidents: false, incidentRate: 0, fireRate: 0 };
    const hf = this.happyFactor();
    const ir = +(this.cfg.incidentRate * hf).toFixed(4);
    const fr = this.fireAllowed(T) ? +(this.cfg.fireRate * (1 - this.hydrantCut()) * (1 - this.levelCut()) * hf).toFixed(5) : 0;
    return { incidents: true, incidentRate: ir, fireRate: fr };
  }

  serialize() {
    return { on: this.on ? 1 : 0, safety: this.ring.map((r) => r.slice()), lastFire: this.lastFire > -1e8 ? Math.round(this.lastFire) : undefined, drill: this.drill ? 1 : 0, fireLevel: this.fireLevel, hydrants: this.hydrants.map((h) => h.slice()) };
  }
}
