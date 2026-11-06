// (v4.3 「마을 새 단장」, docs/redesign_v43/engineering_plan.md §4.3) 촌장 오두막 — the chief's hut.
//
// A new village starts with the chief's own little log house by the sea (the props art `chief_lodge`, which used to stand as
// decor at the south camp). It stands on the office plot (world.js plots.v42_office, WORLD.v42.hut): while that plot is a
// plot or a foundation waiting for its materials (Site replace mode) the hut is there; when the office's scaffold goes up
// the hut is taken down (Office.syncHut). Nothing of it is saved: an old village without an office gets the hut, one with
// an office (a site or done) has the office on that plot.
//   walls     collision circles over the cabin (the porch and the yard stay free)
//   spots     door (in front of the porch steps), desk (by the window: the ledger door of v4.3 C), mailbox, yard
//   (hut-local px from the anchor = the footprint centre, as every v3 building)

import { Assets } from '../core/Assets.js';

export class ChiefHut {
  constructor(gs, cfg) {
    this.gs = gs; this.cfg = cfg;
    this.x = cfg.x; this.y = cfg.y;
    this.key = cfg.key || 'chief_hut';
    this.img = Assets.image(gs, this.x, this.y, cfg.sprite || 'chief_lodge').setDepth(this.y);
    this.img.noCull = true;                 // (one picture, taken down later: never parked off the display list by the Culler)
    if (gs.addOccluder) gs.addOccluder(this.img);
    const at = (p) => ({ x: this.x + p[0], y: this.y + p[1] });
    this.spots = { door: at(cfg.door), desk: at(cfg.desk), mailbox: at(cfg.mailbox), yard: at(cfg.yard) };
    this.obstacles = (cfg.walls || []).map(([dx, dy, r]) => gs.collision.add(this.x + dx, this.y + dy, r, 'hut'));
    this.alive = true;
  }

  setVisible(v) {
    this.img.setVisible(v);
    for (const o of this.obstacles) o.active = v;
  }

  revealObjects() { return [this.img]; }

  /** the office's scaffold goes up: the hut is taken down (pop: a puff of snow) */
  remove(pop) {
    if (!this.alive) return;
    this.alive = false;
    const gs = this.gs, img = this.img;
    for (const o of this.obstacles) o.active = false;
    const O = gs.occluders;
    if (O) for (let i = O.length - 1; i >= 0; i--) if (O[i].img === img) O.splice(i, 1);
    if (pop && gs.tweens) {
      gs.effects.sheet('fx_poof', this.x, this.y - 60, { size: 360 });
      gs.tweens.add({ targets: img, scaleY: 0.05, alpha: 0, duration: 420, ease: 'Quad.easeIn', onComplete: () => img.destroy() });
    } else img.destroy();
  }
}
