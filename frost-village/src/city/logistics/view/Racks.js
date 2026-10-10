// Racks — the real stock drawn on the shelves (assets/logistics conventions.stock). The model says which rack art
// key each slot shows and how many copies stand on each cell (LgxModel.rackFill: the category's fill level spread
// over its slots, bottom shelves and front cells first). Rack slots draw in band `stock` (between _interior and
// _interior_racks, so the uprights and beams sit in front of the goods); the materials floor bays in band `front`,
// y-sorted with the front actors. Back rows first. A pooled image per copy; redrawn only when the stock changes.

import { def, spriteFrame } from './art.js';

export class Racks {
  constructor(view, man) {
    this.v = view;
    this.scene = view.scene;
    this.C = man.sprites.logistics_center;
    this.pool = [];
    this.used = 0;
    this.ver = -1;
    this.shown = true;
    this.order = this.C.rackSlots.map((s, i) => i).sort((a, b) => this.C.rackSlots[a].drawOrder - this.C.rackSlots[b].drawOrder);
  }
  img() {
    let im = this.pool[this.used];
    if (!im) { im = this.scene.add.image(0, 0, '__WHITE'); this.pool.push(im); }
    this.used++;
    return im;
  }
  /** redraw from the model's fill (only when the stock changed or the inside became visible) */
  draw(fill, ver, force) {
    if (!force && ver === this.ver) return;
    this.ver = ver;
    const C = this.C, bx = this.v.bx, by = this.v.by, D = this.v.D, band = C.bandDepth;
    this.used = 0;
    let order = 0;
    for (const si of this.order) {
      const s = C.rackSlots[si], f = fill[si];
      if (!f || !f.key || !f.stacks.length) continue;
      const d = def(f.key), fr = spriteFrame(f.key);
      if (!d || !fr) continue;
      const sc = (C.stockScale && C.stockScale[s.category]) || 0.85;
      const step = (d.stackStep || 20) * sc;
      const stacks = f.stacks.slice().sort((a, b) => (a.u - b.u) || ((s.spanPx[1] * a.t) - (s.spanPx[1] * b.t)));
      for (const st of stacks) {
        const x = s.point[0] + s.spanPx[0] * st.t + s.depthPx[0] * st.u;
        const y = s.point[1] + s.spanPx[1] * st.t + s.depthPx[1] * st.u;
        const d0 = s.band === 'front' ? D + band.front + (y + 400) * 1e-6 : D + band.stock + (order++) * 1e-5;
        for (let k = 0; k < st.n; k++) {
          const im = this.img();
          im.setTexture(fr.tex, fr.frame).setOrigin(d.anchor[0], d.anchor[1]).setScale(sc)
            .setPosition(bx + x, by + y - k * step).setDepth(d0 + k * 1e-7).setVisible(this.shown);
        }
      }
    }
    for (let k = this.used; k < this.pool.length; k++) this.pool[k].setVisible(false);
  }
  count() { return this.used; }
  setVisible(on) { if (on === this.shown) return; this.shown = on; for (let k = 0; k < this.pool.length; k++) this.pool[k].setVisible(on && k < this.used); }
  destroy() { for (const im of this.pool) im.destroy(); this.pool = []; }
}
