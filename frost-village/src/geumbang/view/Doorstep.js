// Doorstep (view, plan §5.6): the 금방 parcels waiting on the steps — gb_parcel_doorstep f0 (fresh) / f1 (after 4 game
// hours: a snow cap on the box and the mat), a few px apart when one door has several; picked up (fade out); now
// and then unboxed: gb_parcel_open left by the door for a while, or 나비 the cat in it (gb_parcel_cat, blinking) and
// "고양이는 상자가 더 좋대요"; a morning pickup says "어? 자는 사이에 금방이 다녀갔네!". Stand-in: cardboard_box_m.

import { Assets } from '../../core/Assets.js';
import { spriteOf, pick, sprAnim, frameOf } from './art.js';
import { SpeechBubble } from './Courier.js';
import { gt } from '../strings.js';

const LEFT_S = 40;          // an unboxed box stays this long (s)

export class Doorstep {
  constructor(view) {
    this.view = view; this.scene = view.scene;
    this.imgs = new Map();        // box id -> image
    this.gone = [];               // fading images
    this.left = [];               // { img, t, bubble }
    this.key = pick('gb_parcel_doorstep', 'cardboard_box_m');
  }

  frameFor(b) {
    const d = Assets.def(this.key);
    const fr = d.states ? (b.snowy ? d.states.snowy : d.states.fresh) : d.frame;
    return fr;
  }

  update(dt) {
    const view = this.view, boxes = view.m.settle.door;
    const seen = new Set(), per = new Map();
    for (const b of boxes) {
      seen.add(b.id);
      const k = per.get(b.aid) || 0; per.set(b.aid, k + 1);
      if (!view.near(b.x, b.y, 200)) { const im = this.imgs.get(b.id); if (im) im.setVisible(false); continue; }
      let im = this.imgs.get(b.id);
      if (!im) {
        const s = spriteOf(this.key);
        if (!s) continue;
        im = this.scene.add.image(0, 0, s.tex, s.frame).setOrigin(s.anchor[0], s.anchor[1]);
        this.imgs.set(b.id, im);
      }
      const f = frameOf(Assets.def(this.key).atlas, this.frameFor(b));
      if (f && (im.texture.key !== f.tex || im.frame.name !== f.frame)) im.setTexture(f.tex, f.frame);
      // on the step, a little toward the camera; more boxes to the right of the first
      const x = b.x - 16 + k * 15, y = b.y + 8 + (k % 2) * 4;
      im.setVisible(true).setScale(this.key === 'gb_parcel_doorstep' ? 0.62 : 0.55).setPosition(x, y).setDepth(y);
    }
    for (const [id, im] of this.imgs) if (!seen.has(id)) { this.imgs.delete(id); this.gone.push(im); }
    for (let i = this.gone.length - 1; i >= 0; i--) { const im = this.gone[i]; im.setAlpha(im.alpha - dt * 1.8); if (im.alpha <= 0) { im.destroy(); this.gone.splice(i, 1); } }
    for (let i = this.left.length - 1; i >= 0; i--) {
      const L = this.left[i];
      L.t -= dt;
      if (L.bubble) L.bubble.tick(dt);
      if (L.t < 1) L.img.setAlpha(Math.max(0, L.t));
      if (L.t <= 0) { L.img.destroy(); if (L.bubble) L.bubble.destroy(); this.left.splice(i, 1); }
    }
  }

  /** gb:pickup { aid, id, unbox, cat, morning } */
  pickup(e) {
    const view = this.view, a = view.m.book.get(e.aid);
    if (!a || !view.near(a.door.x, a.door.y, 100)) return;
    const L = view.lang();
    let line = e.morning ? gt('gb_morning', null, L) : null;
    if (e.unbox) {
      const key = e.cat ? pick('gb_parcel_cat') : pick('gb_parcel_open');
      const s = key ? spriteOf(key) : null;
      if (s) {
        const x = a.door.x - 30, y = a.door.y + 14;
        const img = this.scene.add.sprite(x, y, s.tex, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setScale(0.62).setDepth(y);
        if (e.cat) { const k = sprAnim(this.scene, 'gb_parcel_cat', 'blink'); if (k) img.play(k); line = gt('gb_cat', null, L); }
        let bubble = null;
        if (line) { bubble = new SpeechBubble(view); bubble.show(line, x, y - 60, 2.6); }
        this.left.push({ img, t: LEFT_S, bubble });
        if (this.left.length > 6) { const o = this.left.shift(); o.img.destroy(); if (o.bubble) o.bubble.destroy(); }
        return;
      }
    }
    if (line) {
      const bubble = new SpeechBubble(view); bubble.show(line, a.door.x, a.door.y - 90, 2.6);
      const dummy = this.scene.add.image(-9999, -9999, '__WHITE').setVisible(false);
      this.left.push({ img: dummy, t: 2.7, bubble });
    }
  }

  objects() { return this.imgs.size + this.gone.length + this.left.length * 3; }
  destroy() { for (const im of this.imgs.values()) im.destroy(); for (const im of this.gone) im.destroy(); for (const L of this.left) { L.img.destroy(); if (L.bubble) L.bubble.destroy(); } }
}
