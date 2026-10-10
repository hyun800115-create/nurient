// The v7 cute happenings on stage (docs/v5_v8_plan.md §6.5): nobody is ever hurt, everyone laughs.
//   P9  꽃게에 물린 발가락: a crab sidles up to a sunbather's feet, pinch — they hop up (!), rub, then laugh
//   P10 파도에 무너진 모래성: a big wave washes over a tall castle (splash), a tear, then the kids start again
//   P11 날아간 비치볼: a beach ball blows out to sea, the lifeguard swims out with the red tube and brings it back
//   P12 바람에 날아간 파라솔: a parasol tumbles along the beach — stand in its way to catch it (+2 fame)

import { art } from './art.js';
import { DEPTH } from '../../systems/DepthSort.js';

export class Happenings {
  constructor(view) {
    this.v = view;
    this.scene = view.scene;
    this.cur = null;
  }

  start(ev) {
    this.stop();
    const d = ev.data || {};
    this.cur = { id: ev.id, d, t0: this.v.T, until: ev.until, done: {} };
    const S = this.scene;
    if (ev.id === 'P9') {
      const def = art.charDef('crab');
      if (def && S.textures.exists(def.atlas)) this.cur.crab = S.add.image(0, 0, def.atlas).setOrigin(def.anchor[0], def.anchor[1]);
      this.v.hiddenCrab = 'crab' + d.crab;
    }
    if (ev.id === 'P11') { this.cur.ball = art.image(S, 'beach_ball', d.from[0], d.from[1]); if (this.cur.ball) this.cur.ball.setScale(0.5); }
    if (ev.id === 'P12') {
      this.cur.par = art.image(S, d.key, d.x0, d.y0);
      this.v.beach.flying = d.prop;
      this.v.sound.at('sfx_wave_wash', d.x0, d.y0, 0.3);
    }
  }

  stop() {
    const c = this.cur;
    if (!c) return;
    for (const k of ['crab', 'ball', 'par']) if (c[k]) c[k].destroy();
    if (c.guard) c.guard.release();
    this.v.hiddenCrab = null;
    this.v.beach.flying = null;
    this.cur = null;
  }

  once(k) { if (this.cur.done[k]) return false; this.cur.done[k] = true; return true; }

  update(dt, T) {
    const c = this.cur;
    if (!c) return;
    if (T > c.until + 1) { this.stop(); return; }
    const d = c.d, G = this.v.goers, fx = this.v.fx;
    if (c.id === 'P9') {
      const v = this.v.model.crowd.byId.get(d.vid), def = art.charDef('crab');
      if (!v || !c.crab || !def) return;
      const sx = d.x + 150, sy = d.y + 60, tx = d.x - 24, ty = d.y + 14;
      const f = Math.max(0, Math.min(1, (T - c.t0) / (d.pinchAt - c.t0)));
      const back = T > d.pinchAt + 1.2 ? Math.min(1, (T - d.pinchAt - 1.2) / 3) : 0;
      const x = back ? tx + (sx + 60 - tx) * back : sx + (tx - sx) * f, y = back ? ty + (sy + 30 - ty) * back : sy + (ty - sy) * f;
      const moving = (f > 0 && f < 1) || (back > 0 && back < 1);
      const dir = back ? 'E' : 'W';
      const F = this.v.boats.frame(def, moving ? 'walk' : 'idle', dir, T);
      c.crab.setTexture(def.atlas, F.name).setFlipX(F.flip).setPosition(x, y).setDepth(y + 1);
      if (T >= d.pinchAt && this.once('pinch')) {
        G.flash(d.vid, 'happy', 1.0, 'SE');
        fx.emote('emote_exclaim', d.x, d.y, 1.4, 80);
        this.v.sound.at('sfx_beach_kids', d.x, d.y, 0.5);
      }
      if (T >= d.pinchAt + 1.1 && this.once('rub')) { G.flash(d.vid, 'sad', 2.2, 'SE'); fx.emote('emote_sweat', d.x, d.y, 1.6, 96); }
      if (T >= d.pinchAt + 3.4 && this.once('laugh')) { G.flash(d.vid, 'happy', 1.6, 'S'); fx.emote('emote_laugh', d.x, d.y, 2, 100); }
    }
    if (c.id === 'P10') {
      const it = this.v.beach.item(d.castle);
      if (!it) return;
      if (T >= d.waveAt && this.once('wave')) {
        fx.sheet('fx_splash_big', it.x - 10, it.y + 6, it.y + 3, 1.1);
        fx.sheet('fx_splash_small', it.x + 24, it.y + 10, it.y + 3, 0.9);
        if (this.v.sea && this.v.sea.ripple) this.v.sea.ripple(it.x, it.y + 30, 2.2);
        this.v.sound.at('sfx_wave_crash', it.x, it.y, 0.55);
        const kid = this.diggerAt(d.castle);
        if (kid) fx.emote('emote_tear', kid.x, kid.y, 2.2, 82);
      }
      if (T >= d.rebuild && this.once('again')) { const kid = this.diggerAt(d.castle); if (kid) fx.emote('emote_idea', kid.x, kid.y, 2, 82); }
    }
    if (c.id === 'P11') this.ball(c, T);
    if (c.id === 'P12') {
      const p = this.v.model.parasolAt(d, T);
      if (c.par && p) c.par.setPosition(p.x, p.y - p.z).setRotation(p.flying ? Math.sin(p.rot) * 0.5 : 0.25).setDepth(p.y + 4);
      if (T >= d.landAt + 2.2 && this.once('back')) { this.v.beach.flying = null; if (c.par) c.par.setVisible(false); }
    }
  }

  /** P11: the ball drifts out, the tower's lifeguard swims out with the rescue tube and brings it back */
  ball(c, T) {
    const d = c.d, b = c.ball, W = this.v.sea;
    if (!b) return;
    let x, y;
    if (T < d.kickAt) { x = d.from[0]; y = d.from[1]; }
    else if (T < d.paddleAt + 3) { const f = Math.min(1, (T - d.kickAt) / (d.paddleAt + 3 - d.kickAt)); x = d.from[0] + (d.to[0] - d.from[0]) * f; y = d.from[1] + (d.to[1] - d.from[1]) * f; }
    else if (T < d.backAt) { x = d.to[0]; y = d.to[1]; }
    else { const f = Math.min(1, (T - d.backAt) / 5); x = d.to[0] + (d.from[0] - d.to[0]) * f; y = d.to[1] + (d.from[1] - d.to[1]) * f; }
    const bob = W ? W.heightAt(x, y, W.t) : 0;
    b.setPosition(x, y - bob - 6).setDepth(y + 1).setAngle(Math.sin(T * 2) * 20);
    if (T >= d.kickAt && this.once('kick')) { this.v.fx.emote('emote_exclaim', d.from[0], d.from[1], 1.6, 70); }
    // the lifeguard: a swimmer doll of the tower's guard (the tower stays manned by the station's second guard)
    if (T >= d.paddleAt && !c.guard && this.once('guard')) {
      const m = this.v.model, R = { next: () => 0.37, fn: () => 0.37 };
      const person = m.looks.make('lifeguard', R);
      c.guard = this.v.ports.dolls && this.v.ports.dolls.rig ? this.v.ports.dolls.rig(person, 'p11') : null;
      this.v.sound.at('sfx_lifeguard_whistle', d.tower[0], d.tower[1] - 90, 0.6);
    }
    if (c.guard) {
      const t0 = d.paddleAt, t1 = d.paddleAt + 4.5, t2 = d.backAt, t3 = d.backAt + 5;
      let gx, gy, anim = 'swim', dir = 'SW';
      if (T < t1) { const f = (T - t0) / (t1 - t0); gx = d.from[0] + (d.to[0] + 26 - d.from[0]) * f; gy = d.from[1] + (d.to[1] + 6 - d.from[1]) * f; }
      else if (T < t2) { gx = d.to[0] + 26; gy = d.to[1] + 6; dir = 'W'; }
      else { const f = Math.min(1, (T - t2) / (t3 - t2)); gx = d.to[0] + 26 + (d.from[0] - d.to[0]) * f; gy = d.to[1] + 6 + (d.from[1] - d.to[1]) * f; dir = 'NE'; }
      const gb = W ? W.heightAt(gx, gy, W.t) : 0;
      c.guard.show(anim, dir);
      c.guard.at(gx, gy - gb, gy);
      c.guard.visible(T < t3 + 0.5);
      c.guard.update(16);
      if (T >= t3 && this.once('cheer')) { this.v.fx.emote('emote_star', d.from[0], d.from[1], 2.2, 90); this.v.sound.at('sfx_beach_kids', d.from[0], d.from[1], 0.6); }
    }
  }

  diggerAt(castle) {
    for (const s of this.v.model.slots.of('dig')) if (s.castle === castle && s.by) { const v = this.v.model.crowd.byId.get(s.by); if (v) return { x: v.x, y: v.y }; }
    return null;
  }

  count() { const c = this.cur; return c ? (c.crab ? 1 : 0) + (c.ball ? 1 : 0) + (c.par ? 1 : 0) + (c.guard ? 12 : 0) : 0; }
  destroy() { this.stop(); }
}
