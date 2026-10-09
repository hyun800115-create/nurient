// Amenity (v4-C, docs/기획서_v4_추가요청.md §1): decor built on a plot — 눈사람 동상, 쉼터 의자, 가로등, 꽃밭,
// 스케이트장, 놀이터, 분수 공원. Each makes the village happier (balance.js buildings.<key>.happy, Civic.happyBonus),
// and the residents come by: kids play at the playground / snowman / rink, elders sit by the fountain and on the
// benches. The park and street props are town art (a late fragment): they appear when their pictures arrive.

import { Assets } from '../core/Assets.js';
import { DEPTH } from '../systems/DepthSort.js';
import { gdist } from '../core/Iso.js';
import { ART_SRC } from '../systems/Civic.js';

// pieces: [sprite key, dx, dy, { scale, flip, r (collider px), seats: true }] relative to the plot centre;
// area: where residents hang out here (acts as in world.js life.areas)
const KINDS = {
  deco_snowman: { pieces: [['snowman_3', 0, 0, { scale: 1.35, r: 26 }], ['snow_pile_a', -62, 28, { scale: 0.8 }], ['snow_pile_b', 58, 30, { scale: 0.7 }]], area: { r: 110, acts: ['play', 'chat', 'wander'] } },
  deco_bench: { pieces: [['bench', -10, 6, { r: 36, seats: 'bench' }], ['lamp_post', 64, -22, { r: 12, lamp: true }], ['bush_snow', -78, -26, { scale: 0.8, r: 18 }]], area: { r: 110, acts: ['sit', 'chat', 'wander'] } },
  deco_lamp: { pieces: [['lamp_post', -46, 18, { r: 12, lamp: true }], ['lamp_post', 46, -18, { r: 12, lamp: true }], ['snow_pile_b', 0, 30, { scale: 0.6 }]], area: null },
  deco_flowers: { pieces: [['flower_stand', -40, -10, { r: 12 }], ['flower_stand', 38, -14, { r: 12, flip: true }], ['flower_stand', 0, 26, { r: 12 }], ['bush_snow', -70, 30, { scale: 0.7 }]], area: { r: 110, acts: ['chat', 'wander'] } },
  deco_rink: { pieces: [['ice_rink', 0, 0, { scale: 0.95 }], ['lamp_post', -150, 6, { r: 12, lamp: true }], ['snow_pile_a', 140, 40, { scale: 0.7 }]], area: { r: 150, acts: ['play', 'chat', 'wander'] } },
  deco_playground: { pieces: [['playground', 0, 0, { scale: 0.86, r: 0, play: true }], ['bench', -128, 52, { r: 36, seats: 'bench', scale: 0.9 }]], area: { r: 150, acts: ['play', 'sit', 'chat', 'wander'] } },
  deco_fountain: { pieces: [['park_fountain', 0, 0, { scale: 1, r: 70, seats: 'def', anim: 'water' }], ['lamp_post', -120, 40, { r: 12, lamp: true }], ['lamp_post', 120, -40, { r: 12, lamp: true }]], area: { r: 150, acts: ['sit', 'chat', 'wander', 'play'] } },
};

export class Amenity {
  constructor(gs, key, site) {
    this.gs = gs; this.key = key; this.site = site;
    this.x = site.x; this.y = site.y;
    this.cfg = KINDS[key] || KINDS.deco_snowman;
    this.imgs = [];
    this.obs = [];
    this.enabled = true;
    this.made = false;
    this.lifeDone = false;
    // the pictures: town / life2 art is fetched first (its manifest arrives with the fragment; the files then load
    // as after-title pictures and are re-applied on arrival)
    const late = this.cfg.pieces.map((p) => p[0]).filter((k) => ART_SRC[k]);
    if (late.length && gs.civic) gs.civic.needArt(late, () => this.make());
    else this.make();
  }

  make() {
    if (this.made || !this.gs.sys || !this.gs.sys.isActive()) return;
    this.made = true;
    const gs = this.gs;
    for (const [k, dx, dy, o0] of this.cfg.pieces) {
      const o = o0 || {};
      const x = this.x + dx, y = this.y + dy;
      const r = Assets.sprite(k);
      const img = gs.add.sprite(x, y, r.tex, r.frame).setOrigin(r.anchor[0], r.anchor[1]).setDepth(y);
      if (o.scale) img.setScale(o.scale);
      if (o.flip) img.setFlipX(true);
      if (gs.lazyImage) gs.lazyImage(img, k, (im) => { if (o.anim) this.playAnim(im, k, o.anim); });
      if (o.anim) this.playAnim(img, k, o.anim);
      img.setVisible(this.enabled);
      if (o.r) { const ob = gs.collision.add(x, y, o.r * (o.scale || 1), 'deco'); ob.active = this.enabled; this.obs.push(ob); }
      if ((Assets.def(k).topPx || 0) > 90 || k === 'lamp_post') gs.addOccluder(img);
      img.__piece = { k, o, x, y };
      this.imgs.push(img);
      if (o.lamp) (gs.lamps || (gs.lamps = [])).push(img);
    }
    if (gs.statics) for (const im of this.imgs) gs.statics.push(im);
  }

  playAnim(img, k, anim) { const a = Assets.spriteAnim(k, anim); if (a && img.anims) img.play(a); }

  /** residents come here (once the village life runs and the pictures are placed) */
  joinLife() {
    const gs = this.gs, life = gs.life;
    if (this.lifeDone || !life || !this.made) return;
    this.lifeDone = true;
    const A = this.cfg.area;
    if (!A) return;
    const id = 'c1_' + this.site.id;
    const a = life.addArea(id, { at: [this.x, this.y + 40], r: A.r, acts: A.acts });
    for (const img of this.imgs) {
      const p = img.__piece;
      if (!p || !p.o.seats) continue;
      const rec = { x: p.x, y: p.y, img, key: p.k, scale: p.o.scale || 1 };
      if (p.o.seats === 'bench') { const bs = Assets.def('bench_seats'); life.addSeats(rec, bs.seatPoints || [[-33, -36], [10, -14]], bs.seatDirs || ['SW', 'SW'], bs.seatDepth || 'front', a); }
      else { const d = Assets.def(p.k); if (d.seatPoints) life.addSeats(rec, d.seatPoints, d.seatDirs, d.seatDepth || 'front', a); }
    }
  }

  update(dt) {
    if (!this.lifeDone) { this.lifeT = (this.lifeT || 0) - dt; if (this.lifeT <= 0) { this.lifeT = 1; this.joinLife(); } }
    // the fountain splashes while someone is near (sound only when the chief is)
    void gdist; void dt; void DEPTH;
  }

  setEnabled(v) {
    this.enabled = v;
    for (const im of this.imgs) im.setVisible(v);
    for (const ob of this.obs) ob.active = v;
  }
  revealObjects() { return this.imgs.slice(); }
}
