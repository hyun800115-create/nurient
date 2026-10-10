// E7 — finding the beach (docs/v5_v8_plan.md §6.5 "How it opens"): walking east past the lighthouse point the snow
// thins into sand (the Sand kit along i 86–90), the pines become beach pines and then swaying palms; when the chief
// crosses REVEAL.i the fog over `beach` clears (ports.world.reveal), bgm_harbor crossfades to bgm_beach (6 s), the
// camera pans along the shore (≤ 3 s per leg, any stick input skips) and sparkles twinkle on the warm sea.

import { L, REVEAL } from '../layout.js';

export class Reveal {
  constructor(view) { this.v = view; this.cur = null; }

  start() {
    const V = this.v.ports.view;
    const pts = REVEAL.pan.map(([i, j]) => { const p = L(i, j); return { x: p[0], y: p[1] }; });
    this.cur = { t0: this.v.T, pts, k: -1 };
    if (V && V.focus) V.focus(pts[0].x, pts[0].y, 1400);
  }

  update(dt, T) {
    const c = this.cur;
    if (!c) return;
    const V = this.v.ports.view, k = Math.floor((T - c.t0) / 1.6);
    if (k !== c.k && k < c.pts.length) {
      c.k = k;
      const p = c.pts[k];
      if (V && V.focus && k > 0) V.focus(p.x, p.y, 1500);
      for (let n = 0; n < 4; n++) this.v.fx.sheet('fx_sparkle_water', p.x - 120 + n * 80, p.y + 230 + (n % 2) * 40, p.y + 200, 1);
      if (this.v.sea && this.v.sea.ripple) this.v.sea.ripple(p.x, p.y + 260, 1.4);
    }
    if (k >= c.pts.length + 1) { if (V && V.focus) V.focus(null); this.cur = null; }
  }
  destroy() { this.cur = null; }
}
