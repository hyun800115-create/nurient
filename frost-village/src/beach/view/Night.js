// Night lights at the beach (docs/v5_v8_plan.md §6.5, beach_bld manifest `night`): the game's DayClock model — one
// MULTIPLY overlay darkens everything; every lit building / lamp adds its `<key>_glow` frame (lazy atlas bbld_glow) in
// ADD at DEPTH.FX − 29 with alpha = min(1, cur.a / darkness) while the lights are on, and its lightPoints become
// DayClock.addLight halos (lightK each). The glow atlas is asked for at dusk only (17:00) and can go at dawn.

import { art } from './art.js';
import { DEPTH } from '../../systems/DepthSort.js';

export class Night {
  constructor(view) {
    this.v = view;
    this.scene = view.scene;
    this.glows = new Map();       // id -> { img, key, x, y }
    this.lit = new Set();
    this.asked = false;
  }

  /** a building / prop appeared: register its lamps with the clock, remember its glow */
  addLights(id, key, x, y) {
    const def = art.def(key), C = this.v.ports.clock;
    if (!this.lit.has(id) && def.lightPoints && C && C.addLight) {
      this.lit.add(id);
      def.lightPoints.forEach((p, k) => C.addLight(x + p[0], y + p[1], (def.lightK && def.lightK[k]) || 0.6, k));
    }
    if (def.night && def.night.glow) this.glows.set(id, { id, img: null, key: def.night.glow, x, y, base: key });
  }

  update(dt, T) {
    const C = this.v.ports.clock, f = C && C.glow ? C.glow() : 0;
    if (f > 0.01 && !this.asked) { this.asked = true; const A = this.v.ports.assets; if (A && A.fragment) A.fragment('beach_bld', { only: ['bbld_glow'] }); }
    const view = this.v.viewRect();
    for (const g of this.glows.values()) {
      const near = g.x > view.x - 500 && g.x < view.x + view.w + 500 && g.y > view.y - 300 && g.y < view.y + view.h + 700;
      const it0 = this.v.beach.item(g.id) || null;
      // the board's text rides above the ADD glow while the lights are on (a lit sign would wash it out), back by day
      if (it0 && it0.text) {
        if (it0.textDepth === undefined) it0.textDepth = it0.text.depth;
        it0.text.setDepth(f > 0.01 ? DEPTH.FX - 28 : it0.textDepth);
      }
      if (f <= 0.01 || !near) { if (g.img) g.img.setVisible(false); continue; }
      if (!g.img) {
        g.img = art.make(this.scene, g.key, g.x, g.y);
        if (!g.img) continue;
        g.img.setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.FX - 29);
        const d = art.def(g.key);
        if (d.anims && d.anims.work) art.loop(g.img, g.key, 'work');
      }
      // a building hidden for a moment (P12's parasol, a pop-in) keeps its glow in step
      const it = this.v.beach.item(g.id) || null;
      g.img.setVisible(true).setAlpha(Math.min(1, f) * (it && it.img && it.img.alpha !== undefined ? it.img.alpha : 1));
    }
  }

  count() { let n = 0; for (const g of this.glows.values()) if (g.img) n++; return n; }
  destroy() { for (const g of this.glows.values()) if (g.img) g.img.destroy(); this.glows.clear(); }
}
