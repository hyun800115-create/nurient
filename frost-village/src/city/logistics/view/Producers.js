// Producers — the 가구 공방 and the 가전 공장 (assets/logistics producers, station conventions): the station sprite
// playing anims.work while it makes something, the operator in profile at workSpot facing E (drawn above the station),
// planks / ingots stacked on the input pad, finished pieces on the output pad, soft fx_smoke_puff from the chimney while
// working (smokeFx), and the pile hopping into the centre's van when it picks up.

import { Assets } from '../../../core/Assets.js';
import { def, spriteFrame } from './art.js';

const KEY = { furniture: 'furniture_workshop', appliance: 'appliance_factory' };
const LOOK = { furniture: { preset: 'construction_worker', seed: 61 }, appliance: { preset: 'warehouse_worker', seed: 73 } };

export class Producers {
  constructor(view) {
    this.v = view;
    this.list = new Map();       // producer id -> part
    this.shown = true;
  }
  /**
   * pos: { x, y } world anchor of the building; pos.station === false when the game draws the building itself (then
   * only the operator, the pads, the smoke are drawn here)
   */
  add(p, pos) {
    if (!pos || this.list.has(p.id)) return;
    const v = this.v, sc = v.scene, key = KEY[p.kind], d = def(key), f = spriteFrame(key);
    if (!d || !f) return;
    const img = sc.add.sprite(pos.x, pos.y, f.tex, f.frame).setOrigin(d.anchor[0], d.anchor[1]).setDepth(pos.y);
    if (pos.station === false) img.setAlpha(0);
    const op = v.rig(LOOK[p.kind], 'op:' + p.id);
    this.list.set(p.id, { id: p.id, kind: p.kind, key, d, img, op, x: pos.x, y: pos.y, ins: [], outs: [], smokeT: 0, working: false, beatT: 0, beat: 'idle', inQ: -1, outKey: '' });
  }
  update(dt, list) {
    for (const q of list) {
      const e = this.list.get(q.id);
      if (!e) continue;
      const vis = this.v.near(e.x, e.y, 600);
      e.img.setVisible(vis);
      if (e.op) e.op.visible(vis);
      for (const im of e.ins.concat(e.outs)) im.setVisible(vis);
      if (!vis) continue;
      // the machine
      if (q.working !== e.working) {
        e.working = q.working;
        const k = Assets.spriteAnim(e.key, 'work');
        if (q.working && k) e.img.play(k, true);
        else { e.img.anims.stop(); const f = spriteFrame(e.key); if (f) e.img.setTexture(f.tex, f.frame); }
      }
      if (q.working) {
        e.smokeT -= dt;
        if (e.smokeT <= 0 && this.v.P.fx && this.v.P.fx.sheet) {
          e.smokeT = 0.75;
          const s = e.d.fxPoints && e.d.fxPoints.smoke;
          if (s) this.v.P.fx.sheet('fx_smoke_puff', e.x + s[0], e.y + s[1], { size: 96, depth: e.y + 3 });
        }
      }
      // the operator: working the machine (push) or sweeping up while it waits
      if (e.op) {
        e.beatT -= dt;
        if (e.beatT <= 0) { e.beatT = q.working ? 1.2 : 2.5; e.beat = q.working ? 'push' : (e.beat === 'sweep' ? 'idle' : 'sweep'); }
        const w = e.d.workSpot || { point: e.d.staffPoints[0], dir: 'E' };
        e.op.play(e.beat, e.beat === 'sweep' ? 'SE' : w.dir || 'E');
        e.op.update(dt);
        e.op.place(e.x + w.point[0], e.y + w.point[1], e.y + 0.5, 1);
      }
      // planks / ingots on the input pad, finished pieces on the output pad
      if (q.inQ !== e.inQ) { e.inQ = q.inQ; this.stackIn(e, Math.min(9, q.inQ)); }
      const outKey = q.outQ.join(',');
      if (outKey !== e.outKey) { e.outKey = outKey; this.stackOut(e, q.outQ); }
    }
  }
  stackIn(e, n) {
    const item = e.kind === 'furniture' ? 'item_plank' : 'item_ingot';
    const d = def(item), f = spriteFrame(item);
    while (e.ins.length > n) e.ins.pop().destroy();
    if (!d || !f) return;
    const [ix, iy] = e.d.inPoint;
    while (e.ins.length < n) {
      const k = e.ins.length, col = k % 3, row = Math.floor(k / 3);
      const im = this.v.scene.add.image(e.x + ix - 16 + col * 16, e.y + iy + col * 6 - row * 9, f.tex, f.frame).setOrigin(d.anchor[0], d.anchor[1]).setScale(0.62).setDepth(e.y + iy + 0.2 + k * 1e-3);
      e.ins.push(im);
    }
  }
  stackOut(e, items) {
    for (const im of e.outs) im.destroy();
    e.outs = [];
    const [ox, oy] = e.d.outPoint;
    items.slice(0, 8).forEach((k, i) => {
      const d = def(k), f = spriteFrame(k);
      if (!d || !f) return;
      const col = i % 4, row = Math.floor(i / 4);
      const x = e.x + ox - 30 + col * 20 - row * 14, y = e.y + oy - 4 + col * 10 + row * 8;
      e.outs.push(this.v.scene.add.image(x, y, f.tex, f.frame).setOrigin(d.anchor[0], d.anchor[1]).setScale(0.62).setDepth(y + 0.1));
    });
  }
  /** the centre's van picked the pile up: the pieces hop toward it */
  pickup(id, to) {
    const e = this.list.get(id);
    if (!e || !to) return;
    const sc = this.v.scene;
    e.outs.forEach((im, k) => {
      const ox = im.x, oy = im.y, o = { t: 0 };
      im.setDepth(this.v.labelDepth - 5);
      sc.tweens.add({ targets: o, t: 1, delay: 90 * k, duration: 480, ease: 'Sine.easeInOut',
        onUpdate: () => { im.setPosition(ox + (to[0] - ox) * o.t, oy + (to[1] - 60 - oy) * o.t - Math.sin(o.t * Math.PI) * 110).setScale(0.62 * (1 - 0.4 * o.t)); },
        onComplete: () => im.destroy() });
    });
    e.outs = []; e.outKey = '';
    this.v.sfxAt('sfx_box_drop', e.x, e.y, 0.6);
  }
  count() { return this.list.size; }
  owns(rig) { for (const e of this.list.values()) if (e.op === rig) return true; return false; }
  destroy() { for (const e of this.list.values()) { e.img.destroy(); if (e.op) this.v.drop(e.op); for (const im of e.ins.concat(e.outs)) im.destroy(); } this.list.clear(); }
}
