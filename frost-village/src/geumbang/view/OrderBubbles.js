// OrderBubbles (view, plan §6): a new order pops a small bubble over the orderer's door for 2 s when it is on screen —
// ui_emote_bubble with ui_icon_gb_cart and the order's main item icon beside it, constant screen size (a pop in,
// a float up, a fade). ≤ 4 at once. Stand-ins: the code-drawn round bubble / no cart icon.

import { DEPTH } from '../../systems/DepthSort.js';
import { spriteOf } from './art.js';

const LIFE = 2.0;

export class OrderBubbles {
  constructor(view) { this.view = view; this.scene = view.scene; this.live = []; this.pool = []; }

  /** gb:order { aid, items } */
  add(e) {
    const view = this.view, a = view.m.book.get(e.aid);
    if (!a || !view.near(a.door.x, a.door.y, -30)) return;
    if (this.live.length >= 4) this.kill(this.live.shift());
    const main = Object.keys(e.items || {}).sort((p, q) => e.items[q] - e.items[p])[0];
    const b = this.pool.pop() || this.make();
    b.t = 0; b.x = a.door.x; b.y = a.door.y - 120;
    const set = (im, key) => { const s = key ? spriteOf(key) : null; if (s && im) { im.setTexture(s.tex, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setVisible(true); return true; } if (im) im.setVisible(false); return false; };
    b.hasBubble = set(b.bub, 'ui_emote_bubble');
    set(b.cart, 'ui_icon_gb_cart');
    set(b.item, main || null);
    b.g.setVisible(!b.hasBubble);
    this.live.push(b);
  }

  make() {
    const sc = this.scene;
    const b = { g: sc.add.graphics().setDepth(DEPTH.BUBBLE - 2), bub: sc.add.image(0, 0, '__WHITE').setDepth(DEPTH.BUBBLE - 2), cart: sc.add.image(0, 0, '__WHITE').setDepth(DEPTH.BUBBLE - 1), item: sc.add.image(0, 0, '__WHITE').setDepth(DEPTH.BUBBLE - 1) };
    b.g.fillStyle(0xfffbf3, 1).fillCircle(0, -54, 40).lineStyle(4, 0xd9962a, 1).strokeCircle(0, -54, 40).fillStyle(0xfffbf3, 1).fillTriangle(-10, -18, 10, -18, 0, 0);
    return b;
  }

  kill(b) { for (const o of [b.g, b.bub, b.cart, b.item]) o.setVisible(false); this.pool.push(b); }

  update(dt) {
    const s = 1 / Math.max(0.35, this.view.zoomWorld());
    for (let i = this.live.length - 1; i >= 0; i--) {
      const b = this.live[i];
      b.t += dt;
      if (b.t >= LIFE) { this.kill(b); this.live.splice(i, 1); continue; }
      const pop = Math.min(1, b.t / 0.18), k = s * (0.6 + 0.4 * (1 - Math.pow(1 - pop, 3))) * 0.8;
      const a = b.t > LIFE - 0.3 ? (LIFE - b.t) / 0.3 : 1;
      const y = b.y - b.t * 6;
      b.bub.setPosition(b.x, y).setScale(k).setAlpha(a);
      b.g.setPosition(b.x, y).setScale(k).setAlpha(a);
      // the cart left, the item right, inside the round bubble (content centre 0, −54.5; radius 35)
      const cy = y - 54.5 * k;
      b.cart.setPosition(b.x - 16 * k, cy).setScale(k * 0.42).setAlpha(a);
      b.item.setPosition(b.x + 15 * k, cy + 10 * k).setScale(k * 0.62).setAlpha(a);
    }
  }

  objects() { return (this.live.length + this.pool.length) * 4; }
  destroy() { for (const b of this.live.concat(this.pool)) for (const o of [b.g, b.bub, b.cart, b.item]) o.destroy(); }
}
