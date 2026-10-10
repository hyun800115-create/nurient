// Request bubbles over residents (world space): a round emote bubble (emotes ui_emote_bubble) with what they need
// (the item, or the mission's icon), a little pink heart (ui3 ui_icon_request) and "×5". Accepted deliveries show a
// smaller "for me" bubble over the recipient with the count still missing, and a soft pink ring at their feet. Bubbles
// pop in, bob gently, keep a readable size between zoom 0.6 and 1.2, and are pooled (no allocation once warm).
// Only the two nearest bubbles on screen are full size; any others wait as small hearts.

import { Assets, icon, reicon, TXT } from './ui.js';
import { unitsOf } from '../model/units.js';

const DEPTH_BUBBLE = 40000;          // (DepthSort.DEPTH.BUBBLE)
const SCALE = 0.8;                   // bubble scale (emotes conventions: ~0.75)

export class RequestBubbles {
  constructor(host) {
    this.host = host;
    this.scene = host.ports.world.scene;
    this.live = new Map();          // key 'b:<id>' / 't:<id>' → view
    this.pool = [];
    this.t = 0;
  }

  make() {
    const s = this.scene;
    const c = s.add.container(0, 0).setDepth(DEPTH_BUBBLE);
    const ring = s.add.graphics();
    const bub = Assets.image(s, 0, 0, Assets.pick('ui_emote_bubble', 'ui_bubble')).setScale(SCALE);
    const it = icon(s, 0, -54.5 * SCALE, ['item_bread'], 46);
    const heart = icon(s, 27, -78, ['ui_icon_request', 'emote_heart'], 30);
    const cnt = s.add.text(20, -22, '', TXT(17, '#ffffff', '#d4426f', 5, '900')).setOrigin(0.5);
    c.add([bub, it, heart, cnt]);
    return { c, ring, bub, it, heart, cnt, pid: null, id: 0, born: 0 };
  }

  get(key) {
    let v = this.live.get(key);
    if (v) return v;
    v = this.pool.pop() || this.make();
    v.c.setVisible(true).setAlpha(1).setScale(0.2);
    v.ring.setVisible(false);
    v.born = this.t;
    this.scene.tweens.add({ targets: v.c, scale: 1, duration: 320, ease: 'Back.easeOut' });
    this.live.set(key, v);
    return v;
  }

  release(key, burst) {
    const v = this.live.get(key);
    if (!v) return;
    this.live.delete(key);
    const s = this.scene;
    v.ring.setVisible(false);
    s.tweens.killTweensOf(v.c);
    if (burst) {
      s.tweens.add({ targets: v.c, scale: 1.25, alpha: 0, duration: 220, ease: 'Sine.easeOut', onComplete: () => { v.c.setVisible(false); this.pool.push(v); } });
    } else { v.c.setVisible(false); this.pool.push(v); }
  }

  /** the item (or icon) a mission's bubble shows, and how many are still wanted */
  what(i) {
    const m = this.host.model, t = m.template(i);
    const U = unitsOf(t);
    for (let j = 0; j < U.length; j++) {
      const u = U[j];
      if (i.g[j] >= u.need) continue;
      if (u.t === 'deliver') return { key: u.item || u.any[0], n: u.need - i.g[j] };
      break;
    }
    return { key: t.emote && t.icon && !/^item_/.test(t.icon) ? t.emote : t.icon, n: 0 };
  }

  update(dt) {
    this.t += dt;
    const h = this.host, m = h.model, ppl = h.ports.people;
    const cam = this.scene.cameras.main;
    const z = (cam.zoom || 1) / (h.ports.view.k ? h.ports.view.k() : 1);
    const k = Math.max(0.95, Math.min(1.35, 1 / Math.sqrt(Math.max(0.3, z))));      // keep them readable zoomed out
    const want = new Set();
    // offered requests: a bubble over the giver. At most `bubblesOnScreen` full bubbles show on screen (the ones
    // nearest the chief); the others shrink to a small heart that can still be tapped (critique M-3)
    const ch = h.ports.chief, cx = ch.x(), cy = ch.y(), V = h.ports.view;
    const offered = [];
    for (const i of m.bubbles()) {
      if (!i.gv) continue;
      const p = ppl.pos(i.gv);
      if (!p) continue;
      const on = V && V.onScreen ? V.onScreen(p.x, p.y + (p.headTop || -80), 0) : true;
      offered.push({ i, p, on, d: Math.hypot(p.x - cx, p.y - cy) });
    }
    const full = new Set(offered.filter((o) => o.on).sort((a, b) => a.d - b.d).slice(0, h.cfg.bubblesOnScreen).map((o) => o.i.id));
    for (const { i, p, on } of offered) {
      const key = 'b:' + i.id;
      want.add(key);
      const v = this.get(key);
      v.id = i.id; v.pid = i.gv;
      const small = on && !full.has(i.id);
      v.small = small;
      const w = this.what(i);
      reicon(v.it, [w.key, 'ui_icon_request']);
      v.heart.setVisible(true);
      v.cnt.setText(w.n > 1 ? '×' + w.n : '').setVisible(w.n > 1 && !small);
      v.it.setVisible(!small);
      const bob = Math.sin((this.t + i.id * 0.37) * 2.6) * 3;
      v.c.setPosition(p.x, p.y + (p.headTop || -80) - 4 + bob);
      const kb = small ? k * 0.5 : k;
      v.c.list[0].setScale(SCALE * kb); v.it.setScale((46 / Math.max(1, v.it.frame.realWidth, v.it.frame.realHeight)) * k).setY(-54.5 * SCALE * k);
      if (small) v.heart.setPosition(0, -54.5 * SCALE * kb).setScale((30 / Math.max(1, v.heart.frame.realWidth)) * k);
      else v.heart.setPosition(27 * k, -78 * k).setScale((30 / Math.max(1, v.heart.frame.realWidth)) * k);
      v.cnt.setPosition(22 * k, -24 * k).setScale(k);
      // an untouched bubble fades a little in its last minute
      const left = h.cfg.bubbleLife - (h.ports.clock.T() - i.t0);
      v.c.setAlpha(left < 60 ? 0.55 + 0.45 * Math.max(0, left / 60) : 1);
    }
    // accepted deliveries: a "for me" bubble over the recipient (a person) + a ring at their feet
    for (const i of m.active()) {
      const t = m.template(i);
      if (!i.w || i.w.startsWith('p:') || t.src === 'event' && !unitsOf(t).some((u) => u.t === 'deliver')) continue;
      const w = this.what(i);
      if (!w.n) continue;
      const p = ppl.pos(i.w);
      if (!p) continue;
      const key = 't:' + i.id;
      want.add(key);
      const v = this.get(key);
      v.id = i.id; v.pid = i.w;
      reicon(v.it, [w.key]);
      v.it.setVisible(true); v.small = false;
      v.heart.setVisible(false);
      v.cnt.setText('×' + w.n).setVisible(true);
      const kk = k * 0.8;
      const bob = Math.sin((this.t + i.id) * 3.2) * 4;
      v.c.setPosition(p.x, p.y + (p.headTop || -80) - 4 + bob);
      v.c.list[0].setScale(SCALE * kk); v.it.setScale((42 / Math.max(1, v.it.frame.realWidth, v.it.frame.realHeight)) * kk).setY(-54.5 * SCALE * kk);
      v.cnt.setPosition(24 * kk, -22 * kk).setScale(kk);
      const g = v.ring;
      g.setVisible(true).clear().setDepth(p.y - 2);
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 4);
      g.lineStyle(4, 0xe35d8c, 0.55 + 0.35 * pulse);
      g.strokeEllipse(p.x, p.y + 2, 74 + 10 * pulse, 30 + 4 * pulse);
      g.fillStyle(0xff9ec0, 0.12 + 0.08 * pulse);
      g.fillEllipse(p.x, p.y + 2, 74 + 10 * pulse, 30 + 4 * pulse);
    }
    for (const key of Array.from(this.live.keys())) if (!want.has(key)) this.release(key, true);
  }

  /** the offered request under a world point (tap), or 0 */
  hit(x, y) {
    let best = 0, bd = 70 * 70;
    for (const [key, v] of this.live) {
      if (!key.startsWith('b:') || !v.c.visible) continue;
      const dx = x - v.c.x, dy = y - (v.c.y - (v.small ? 24 : 44));
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = v.id; }
    }
    return best;
  }

  /** display objects (budget counting) */
  count() { let n = 0; for (const v of this.live.values()) n += v.c.list.length + 2; return n; }

  destroy() {
    for (const v of this.live.values()) { v.c.destroy(); v.ring.destroy(); }
    for (const v of this.pool) { v.c.destroy(); v.ring.destroy(); }
    this.live.clear(); this.pool = [];
  }
}
