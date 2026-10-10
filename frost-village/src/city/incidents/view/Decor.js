// The module's small street things, drawn only near the view: fire hydrants the chief built (civic `fire_hydrant`),
// the fire alarm posts on the street corners (`fire_alarm_post`, `ring` + fx_alarm_flash at its lamp + the bell),
// welcome mats at new families' doors and the for-sale / sold signs of moving homes.

import { put, sdef, Assets, DEPTH } from './art.js';
import { ALARM_POSTS } from '../layout.js';

const NEAR = 1500;

export class Decor {
  constructor(view) {
    this.view = view;
    this.scene = view.scene;
    this.items = new Map();       // key -> { kind, x, y, obj, extra }
    this.want = [];
  }

  /** what should exist: [{ key, kind: 'hydrant' | 'alarm' | 'mat' | 'sign', sprite, x, y }] */
  sync(state) {
    const W = [];
    for (const [x, y] of state.hydrants || []) W.push({ key: 'h' + x + ',' + y, sprite: 'fire_hydrant', x, y });
    ALARM_POSTS.forEach((p, k) => W.push({ key: 'a' + k, sprite: 'fire_alarm_post', x: p.x, y: p.y, alarm: true }));
    const M = this.view.host.model.moves;
    for (const [home] of M.mats) { const d = this.doorOf(home); if (d) W.push({ key: 'm' + home, sprite: 'welcome_mat', x: d.x, y: d.y + 4, depth: DEPTH.GROUND_DECAL + 5 }); }
    for (const home of new Set([...M.forSale, ...M.sold.keys()])) { const s = M.sign(home); const d = this.doorOf(home); if (s && d) W.push({ key: 's' + home + s, sprite: s, x: d.x - 96, y: d.y + 44 }); }
    this.want = W;
    const keys = new Set(W.map((w) => w.key));
    for (const [k, it] of this.items) if (!keys.has(k)) { if (it.obj) it.obj.destroy(); this.items.delete(k); }
  }

  doorOf(home) {
    const b = this.view.pos(String(home).split('#')[0]);
    if (!b) return null;
    const d = sdef(b.key) || {};
    const dp = d.doorPoint || [-60, 40];
    return { x: b.x + dp[0], y: b.y + dp[1] };
  }

  /** ring an alarm post for `secs` (anim + flash + bell) */
  ring(post, secs = 8) {
    const it = Array.from(this.items.values()).find((i) => i.x === post.x && i.y === post.y);
    const V = this.view;
    V.sound('sfx_fire_alarm_bell', post.x, post.y, 0.7);
    if (!it || !it.obj) return;
    const a = Assets.spriteAnim('fire_alarm_post', 'ring');
    if (a && it.obj.play) it.obj.play(a);
    const d = sdef('fire_alarm_post') || {};
    const lp = (d.fxPoints && d.fxPoints.lamp) || [3, -74];
    const f = V.sheets.play('fx_alarm_flash', post.x + lp[0], post.y + lp[1], { depth: post.y + 2, scale: 0.6 });
    V.later(secs, () => { if (f) V.sheets.release(f); if (it.obj && it.obj.stop) { it.obj.stop(); it.obj.setFrame(sdef('fire_alarm_post').frame); } });
  }

  update() {
    const v = this.view.rect();
    for (const w of this.want) {
      const near = !v || Math.hypot(Math.max(0, v.x - w.x, w.x - (v.x + v.width)), Math.max(0, v.y - w.y, w.y - (v.y + v.height))) < NEAR;
      let it = this.items.get(w.key);
      if (near && !it) {
        let obj = put(this.scene, w.sprite, w.x, w.y, w.depth);
        if (obj && w.alarm) { const sp = this.scene.add.sprite(obj.x, obj.y, obj.texture.key, obj.frame.name).setOrigin(obj.originX, obj.originY).setDepth(obj.depth); obj.destroy(); obj = sp; }
        it = { kind: w.sprite, x: w.x, y: w.y, obj };
        this.items.set(w.key, it);
      } else if (!near && it) { if (it.obj) it.obj.destroy(); this.items.delete(w.key); }
    }
  }

  destroy() { for (const it of this.items.values()) if (it.obj) it.obj.destroy(); this.items.clear(); }
  get count() { return this.items.size; }
}
