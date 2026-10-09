// X-ray for tall things (v2): pines, cabins, stalls and tall props turn see-through while ANY
// visible character (chief, workers, porters, residents, customers, animals) stands behind them
// and their pixels really cover that character. Cheap: occluders are culled to the camera view,
// tested 10x a second, and "is this pixel solid" reads a small alpha mask made once per frame
// picture (no per-test canvas reads).

import { px2L4 } from '../data/world.js';

const MASK_STEP = 4;          // mask resolution (px of the picture per mask cell)
const FADED = 0.32;           // alpha of a see-through occluder
const ZONE_FADE = 0.42;       // (v4 review) a tall row in front of the row the chief is looking at

export class Occlusion {
  constructor(gs) {
    this.gs = gs;
    this.masks = new Map();
    this.t = 0;
    this.chars = [];
  }

  get list() { return this.gs.occluders || []; }

  /** small alpha mask of an image's current frame (untrimmed frame coordinates) */
  mask(img) {
    const fr = img.frame;
    if (!fr || !fr.source) return null;
    const key = img.texture.key + '|' + fr.name;
    let m = this.masks.get(key);
    if (m !== undefined) return m;
    m = null;
    try {
      const cw = fr.cutWidth, ch = fr.cutHeight;
      if (cw > 0 && ch > 0 && typeof document !== 'undefined') {
        const c = document.createElement('canvas');
        c.width = cw; c.height = ch;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(fr.source.image, fr.cutX, fr.cutY, cw, ch, 0, 0, cw, ch);
        const px = ctx.getImageData(0, 0, cw, ch).data;
        const w = Math.ceil(cw / MASK_STEP), h = Math.ceil(ch / MASK_STEP);
        const data = new Uint8Array(w * h);
        for (let y = 0; y < ch; y++) {
          const row = ((y / MASK_STEP) | 0) * w;
          for (let x = 0; x < cw; x++) if (px[(y * cw + x) * 4 + 3] > 110) data[row + ((x / MASK_STEP) | 0)] = 1;
        }
        m = { w, h, cw, ch, ox: fr.x || 0, oy: fr.y || 0, data };
      }
    } catch (e) { m = null; }
    this.masks.set(key, m);
    return m;
  }

  /** is the occluder's picture opaque at world point (x, y)? (true when unknown) */
  solid(img, x, y) {
    const m = this.mask(img);
    if (!m) return true;
    const sx = img.scaleX || 1, sy = img.scaleY || 1;
    // untrimmed frame coordinates; Phaser mirrors a flipped picture inside its own frame box
    // (around the box centre, not around the origin)
    let lx = img.displayOriginX + (x - img.x) / sx;
    if (img.flipX) lx = img.frame.realWidth - lx;
    lx -= m.ox;
    const ly = img.displayOriginY + (y - img.y) / sy - m.oy;
    if (lx < 0 || ly < 0 || lx >= m.cw || ly >= m.ch) return false;
    return m.data[((ly / MASK_STEP) | 0) * m.w + ((lx / MASK_STEP) | 0)] === 1;
  }

  /** characters that can hide behind things (visible, on or near the screen) */
  collect(view) {
    const gs = this.gs, out = this.chars;
    out.length = 0;
    const add = (c) => {
      if (!c || !c.alive || c.noXray || !c.sprite || !c.sprite.visible) return;
      if (c.x < view.x - 80 || c.x > view.right + 80 || c.y < view.y - 40 || c.y > view.bottom + 160) return;
      out.push(c);
    };
    add(gs.player);
    for (const w of gs.workers) add(w);
    for (const w of gs.porters || []) add(w);
    for (const w of gs.rawPorters || []) add(w);     // (v3.5) pile -> station porters
    for (const a of gs.animals || []) if (a.enabled && !a.dead) add(a);
    if (gs.market) { for (const c of gs.market.queue) add(c); for (const c of gs.market.leaving) add(c); }
    if (gs.trade && gs.trade.enabled) add(gs.trade.merchant);
    if (gs.life) for (const r of gs.life.residents) if (!r.lod) add(r);
    // ---- (v4-A) train visitors, townsfolk, the train's cars
    if (gs.v4) gs.v4.occlusionSubjects(add);
    return out;
  }

  update(dt) {
    const list = this.list;
    if (!list.length) return;
    const view = this.gs.cameras.main.worldView;
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.1;
      const chars = this.collect(view);
      const pl = this.gs.player, pq = pl ? px2L4(pl.x, pl.y) : null;
      for (let i = 0; i < list.length; i++) {
        const o = list[i];
        const img = o.img;
        o.want = 1;
        if (!img.visible || !img.active) continue;
        if (o.x + o.hw * 2.5 < view.x || o.x - o.hw * 2.5 > view.right || o.y < view.y - 20 || o.y - o.top > view.bottom) continue;
        // (v4 review) the town's apartments / the carpenter's houses stand in front of the school row / the B shops:
        // while the chief is in the block behind them (the street and yards they would hide) they stay see-through
        const z = o.zone;
        if (z && pq && pq.i >= z[0] && pq.i <= z[1] && pq.j >= z[2] && pq.j <= z[3]) { o.want = ZONE_FADE; continue; }
        // (v3.5 review) an oven / smelter / smokehouse with its operator working in front keeps its look:
        // only the chief walking behind it fades it (a porter passing behind would turn it into a ghost)
        const worked = !!(o.station && o.station.op && o.station.op.operator && o.station.op.operator.ready);
        for (let k = 0; k < chars.length; k++) {
          const c = chars[k];
          if (worked && c !== this.gs.player) continue;
          // (v4-A) the town's buildings fade for the chief, the train and train visitors (not for every townsperson)
          if (o.mainOnly && c !== this.gs.player && !c.xrayMain) continue;
          // (v4 review) a founded shop / a station: only the chief and the train's cars
          if (o.chiefOnly && c !== this.gs.player && !c.isCar) continue;
          if (c.y >= o.y - 4 || c.y <= o.y - o.top) continue;
          if (Math.abs(c.x - o.x) > o.hw + 22) continue;
          // the box says maybe: fade only when the art really covers the body or the head
          // (big buildings: only when they hide most of the character, so they do not flicker for a passer-by)
          const h = c.headTop || -80;
          const n = (this.solid(img, c.x, c.y - 18) ? 1 : 0) + (this.solid(img, c.x, c.y + h * 0.55) ? 1 : 0) + (this.solid(img, c.x, c.y + h + 12) ? 1 : 0);
          if (n >= (o.big ? 2 : 1)) { o.want = FADED; break; }
        }
      }
    }
    const k = Math.min(1, dt * 10);
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      const target = o.want === undefined ? 1 : o.want;
      if (o.a === target) continue;
      o.a += (target - o.a) * k;
      if (Math.abs(o.a - target) < 0.02) o.a = target;
      o.img.setAlpha(o.a);
    }
  }
}
