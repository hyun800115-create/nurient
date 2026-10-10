// VehicleSprite — one logistics vehicle drawn the vehicles convention's way (assets/logistics conventions.vehicles):
// an ellipse shadow, the body (2 rendered headings + flipX mirrors), the people at their seats (`sit` facing front,
// `idle` at seatsStand in the back views), then the over_* overlay frame in front of them. Used for the forklift
// (lift frames set by hand from the fork height), the delivery vans and the freight truck.

import { Assets } from '../../../core/Assets.js';
import { baseDir, frameOf, shadowTex } from './art.js';

export class VehicleSprite {
  constructor(view) {
    this.v = view;
    const sc = this.scene = view.scene;
    this.shadow = sc.add.image(0, 0, shadowTex(sc)).setVisible(false);
    this.body = sc.add.sprite(0, 0, '__WHITE').setVisible(false);
    this.over = sc.add.image(0, 0, '__WHITE').setVisible(false);
    this.key = null; this.akey = ''; this.seats = new Map();
  }
  setKey(key) {
    if (this.key === key) return true;
    if (!Assets.built[key]) Assets.buildCharacter(this.scene.game, key);
    const d = Assets.charDef(key);
    if (!d || !d.atlas || d._placeholder) return false;
    this.key = key; this.def = d; this.akey = '';
    this.body.setOrigin(d.anchor[0], d.anchor[1]);
    this.over.setOrigin(d.anchor[0], d.anchor[1]);
    return true;
  }
  /**
   * o: { key, x, y, dir (SE|NE|SW|NW), anim ('idle'|'move'|'lift'), liftI (0..5), alpha, depth, shadowDepth,
   *      people: [{ seat, rig }] (rigs from the view's pool), speed (anim timeScale) }
   */
  sync(o) {
    if (!this.setKey(o.key)) { this.hide(); return; }
    const d = this.def, { base, flip } = baseDir(o.dir), sx = flip ? -1 : 1;
    const a = o.alpha === undefined ? 1 : o.alpha;
    if (o.anim === 'lift') {
      const n = (d.anims.lift && d.anims.lift.frames) || 6;
      const f = frameOf(d.atlas, 'lift_' + base + '_' + Math.max(0, Math.min(n - 1, o.liftI || 0)));
      if (f) { this.body.anims.stop(); this.body.setTexture(f.tex, f.frame); }
      this.akey = '';
    } else {
      const k = Assets.charAnim(this.key, o.anim || 'idle', base);
      if (k !== this.akey) { this.body.play(k, true); this.akey = k; }
      this.body.anims.timeScale = o.speed || 1;
    }
    this.body.setVisible(true).setFlipX(flip).setPosition(o.x, o.y).setDepth(o.depth).setAlpha(a);
    const sh = (d.shadow && d.shadow[base]) || [d.frameSize[0] * 0.8, 60, base === 'SE' ? 26.57 : -26.57];
    this.shadow.setVisible(true).setPosition(o.x, o.y + 2).setDisplaySize(sh[0], sh[1] * 1.12).setAngle(flip ? -sh[2] : sh[2]).setDepth(o.shadowDepth).setAlpha(Math.min(1, a * 1.05));
    // people in their seats (front views sit; back views stand at seatsStand: their legs are behind the body anyway)
    const fr = this.body.frame && this.body.frame.name;
    const anim = o.anim || 'idle';
    const bob = d.anims[anim] && d.anims[anim].bobPx && this.body.anims && this.body.anims.currentFrame ? (d.anims[anim].bobPx[(this.body.anims.currentFrame.index || 1) - 1] || 0) : 0;
    const back = base === 'NE';
    const pdir = flip ? (back ? 'NW' : 'SW') : (back ? 'NE' : 'SE');
    let drawn = 0;
    const order = (d.seatDrawOrder && d.seatDrawOrder[base]) || [0, 1];
    for (const si of order) {
      const p = (o.people || []).find((q) => q.seat === si);
      if (!p || !p.rig) continue;
      const pts = (!back ? d.seats : (d.seatsStand || d.seats))[base];
      const pt = pts && pts[si];
      if (!pt) continue;
      p.rig.play(back ? 'idle' : 'sit', pdir);
      p.rig.place(o.x + pt[0] * sx, o.y + pt[1] + bob, o.depth + 0.001 + drawn * 0.0004, a);
      drawn++;
    }
    if (drawn && d.overlay && fr) {
      const f = frameOf(d.overlay.atlas, 'over_' + fr);
      if (f) this.over.setTexture(f.tex, f.frame).setVisible(true).setFlipX(flip).setPosition(o.x, o.y).setDepth(o.depth + 0.004).setAlpha(a);
      else this.over.setVisible(false);
    } else this.over.setVisible(false);
  }
  /** a px point of the art for the current heading (cargoPoint, rearDoorPoint ...) in world px */
  point(table, dir, x, y) {
    const d = this.def; if (!d || !d[table]) return [x, y];
    const { base, flip } = baseDir(dir); const p = d[table][base]; if (!p) return [x, y];
    const q = Array.isArray(p[0]) ? p[0] : p;
    return [x + (flip ? -q[0] : q[0]), y + q[1]];
  }
  hide() { this.body.setVisible(false); this.shadow.setVisible(false); this.over.setVisible(false); }
  destroy() { this.body.destroy(); this.shadow.destroy(); this.over.destroy(); }
}
