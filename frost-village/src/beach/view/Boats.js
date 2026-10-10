// Boats and crabs (docs/v5_v8_plan.md §6.5 view/Boats): water-plane characters on the model's loops (anchor = the sea
// surface), bobbing and tilting with Water.js heightAt / slopeAt, a fx_wake_v2 V under them while they move. The
// swan pedal boats carry two beachgoers (sit at seats[dir], idle at seatsStand for the back views), drawn boat →
// riders (seatDrawOrder) → the over_ frame; mirrored headings flip every layer and negate dx. The banana boat is
// towed by the yacht (ships art, v6) on a rope from the yacht's stern to towPoint. Crabs scuttle sideways on the wet
// sand (dir = the movement direction) over a soft ellipse shadow.

import { art, MIRROR } from './art.js';
import { stream } from '../model/rng.js';
import { DEPTH } from '../../systems/DepthSort.js';

const WAKE = { SE: 'fx_wake_v2', S: 'fx_wake_v2_s', E: 'fx_wake_v2_e', NE: 'fx_wake_v2_ne', N: 'fx_wake_v2_n' };

export class Boats {
  constructor(view) {
    this.v = view;
    this.scene = view.scene;
    this.boats = new Map();       // id -> { spr, over, wake, riders: [rig], tow: {spr, wake, rope} }
    this.crabs = new Map();
    art.shadowTex(this.scene);
    art.dotTex(this.scene);
  }

  /** frame name + flip for a characters-style atlas */
  frame(def, anim, dir, t) {
    let d = dir, flip = false;
    if (!def.dirs.includes(d) && MIRROR[d]) { d = MIRROR[d]; flip = true; }
    if (!def.dirs.includes(d) && def.nearest && def.nearest[dir]) { const n = def.nearest[dir]; if (def.dirs.includes(n)) d = n; else if (MIRROR[n]) { d = MIRROR[n]; flip = true; } }
    if (!def.dirs.includes(d)) d = def.dirs[0];
    const a = def.anims[anim] || def.anims.idle;
    const i = Math.floor(t * a.fps) % a.frames;
    return { name: (def.frameName || '{anim}_{dir}_{i}').replace('{anim}', anim).replace('{dir}', d).replace('{i}', i), d, flip, i };
  }

  ensure(id, b) {
    let o = this.boats.get(id);
    if (o) return o;
    const def = art.charDef(b.key);
    if (!def || !def.atlas || !this.scene.textures.exists(def.atlas)) return null;
    o = { def, spr: this.scene.add.image(0, 0, def.atlas).setOrigin(def.anchor[0], def.anchor[1]), riders: [], tow: null };
    if (def.overlay) o.over = this.scene.add.image(0, 0, def.atlas).setOrigin(def.anchor[0], def.anchor[1]);
    if (b.riders) {
      const m = this.v.model, R = stream(m.seed, 'boat:' + id);
      for (let k = 0; k < b.riders; k++) {
        const person = m.looks.make(k === 0 && R.chance(0.6) ? 'family_beach' : 'swimmer', R);
        const rig = this.v.ports.dolls && this.v.ports.dolls.rig ? this.v.ports.dolls.rig(person, 'boat:' + id + ':' + k) : null;
        if (rig) o.riders.push(rig);
      }
    }
    if (b.tow) {
      const td = art.charDef(b.tow);
      if (td && td.atlas && this.scene.textures.exists(td.atlas)) {
        o.tow = { def: td, spr: this.scene.add.image(0, 0, td.atlas).setOrigin(td.anchor[0], td.anchor[1]), rope: this.scene.add.image(0, 0, 'bch_dot').setOrigin(0, 0.5).setTint(0xf4ead2) };
      }
    }
    this.boats.set(id, o);
    return o;
  }

  wake(o, slot, x, y, dir, scale, depth, t, on) {
    let key = WAKE[dir], flip = false;
    if (!key && MIRROR[dir]) { key = WAKE[MIRROR[dir]]; flip = true; }
    if (!key) key = 'fx_wake_v2';
    const S = this.scene;
    if (!on || !S.textures.exists(key)) { if (o[slot]) o[slot].setVisible(false); return; }
    if (!o[slot] || o[slot].texture.key !== key) {
      if (o[slot]) o[slot].destroy();
      o[slot] = S.add.sprite(x, y, key).setOrigin(0.5, 0.5);
      const k = art.sheet(S, key); if (k) o[slot].play(k);
    }
    o[slot].setVisible(true).setPosition(x, y).setFlipX(flip).setScale(scale).setDepth(depth).setAlpha(0.85);
    void t;
  }

  update(dt, T) {
    const m = this.v.model, W = this.v.sea, view = this.v.viewRect(), wt = W ? W.t : T;
    const list = m.sea.boats(T), seen = new Set();
    for (const b of list) {
      const p = m.sea.boatAt(b.id, T, b.on);
      if (!p) continue;
      const near = p.x > view.x - 400 && p.x < view.x + view.w + 400 && p.y > view.y - 300 && p.y < view.y + view.h + 300;
      if (!near) continue;
      const o = this.ensure(b.id, b);
      if (!o) continue;
      seen.add(b.id);
      const anim = p.moving ? 'move' : 'idle';
      const bob = W ? W.heightAt(p.x, p.y, wt) : Math.sin(T * 1.7) * 1.5;
      let tilt = 0;
      if (W && W.slopeAt) { const sl = W.slopeAt(p.x, p.y, wt, this._sl || (this._sl = { x: 0, y: 0 })); tilt = Math.max(-0.06, Math.min(0.06, (sl.x || 0) * 0.5)); }
      const F = this.frame(o.def, anim, p.dir, T + b.id.length * 0.13);
      o.spr.setTexture(o.def.atlas, F.name).setFlipX(F.flip).setPosition(p.x, p.y - bob).setDepth(p.y).setRotation(tilt).setVisible(true);
      const dx = (v) => (F.flip ? -v : v);
      // riders: sit facing the bow on the seats (idle at seatsStand for the back views), then the hull's front part
      if (o.riders.length && !p.moving) { for (const rig of o.riders) if (rig) rig.visible(false); if (o.over) o.over.setVisible(false); }     // moored: nobody aboard
      if (o.riders.length && o.def.seats && p.moving) {
        const back = F.d === 'NE' || F.d === 'N';
        const seats = back ? (o.def.seatsStand || o.def.seats)[F.d] : o.def.seats[F.d];
        const dirs = (o.def.seatDirs || {})[F.d] || [];
        const order = (o.def.seatDrawOrder || {})[F.d] || o.riders.map((_, k) => k);
        order.forEach((k, n) => {
          const rig = o.riders[k];
          if (!rig || !seats || !seats[k]) return;
          let d = dirs[k] || F.d;
          if (F.flip) d = { SE: 'SW', E: 'W', NE: 'NW', S: 'S' }[d] || d;
          rig.show(back ? 'idle' : 'sit', d);
          rig.at(p.x + dx(seats[k][0]), p.y - bob + seats[k][1], p.y + 0.1 + n * 0.05);
          rig.visible(true);
          rig.update(dt * 1000);
        });
        if (o.over) {
          const on = (o.def.overlay.frameName || 'over_{anim}_{dir}_{i}').replace('{anim}', anim).replace('{dir}', F.d).replace('{i}', F.i);
          if (this.scene.textures.get(o.def.atlas).has(on)) o.over.setTexture(o.def.atlas, on).setFlipX(F.flip).setPosition(p.x, p.y - bob).setDepth(p.y + 0.3).setRotation(tilt).setVisible(true);
          else o.over.setVisible(false);
        }
      }
      // the wake under a moving boat (the stern's water ring too)
      const wp = o.def.wakePoint && o.def.wakePoint[F.d];
      this.wake(o, 'wk', p.x, p.y - bob * 0.5, p.dir, (o.def.lengthM || 2.4) / 2.4, p.y - 2, T, p.moving);
      if (p.moving && W && W.ripple && wp && (T * 3 | 0) !== o.rk) { o.rk = T * 3 | 0; W.ripple(p.x + dx(wp[0]), p.y + wp[1], 0.6); }
      // the yacht towing the banana boat + the rope
      if (o.tow && b.on) {
        const q = m.sea.towAt(b.id, T), td = o.tow.def;
        const tb = W ? W.heightAt(q.x, q.y, wt) : 0;
        const TF = this.frame(td, 'move', q.dir, T);
        o.tow.spr.setTexture(td.atlas, TF.name).setFlipX(TF.flip).setPosition(q.x, q.y - tb).setDepth(q.y).setVisible(true);
        const twp = td.wakePoint && td.wakePoint[TF.d], tp = o.def.towPoint && o.def.towPoint[F.d];
        if (twp && tp) {
          const ax = q.x + (TF.flip ? -twp[0] : twp[0]), ay = q.y - tb + twp[1] + 10, bx = p.x + dx(tp[0]), by = p.y - bob + tp[1];
          const len = Math.hypot(bx - ax, by - ay);
          o.tow.rope.setPosition(ax, ay).setDisplaySize(len, 1.6).setRotation(Math.atan2(by - ay, bx - ax)).setDepth(Math.min(q.y, p.y) - 0.5).setVisible(true).setAlpha(0.85);
        }
        this.wake(o.tow, 'wk', q.x, q.y - tb * 0.5, q.dir, 2.6, q.y - 2, T, true);
      } else if (o.tow) { o.tow.spr.setVisible(false); o.tow.rope.setVisible(false); if (o.tow.wk) o.tow.wk.setVisible(false); }
    }
    for (const [id, o] of this.boats) if (!seen.has(id)) this.hide(o);
    this.updateCrabs(T, view);
  }

  hide(o) {
    o.spr.setVisible(false); if (o.over) o.over.setVisible(false); if (o.wk) o.wk.setVisible(false);
    for (const r of o.riders) r.visible(false);
    if (o.tow) { o.tow.spr.setVisible(false); o.tow.rope.setVisible(false); if (o.tow.wk) o.tow.wk.setVisible(false); }
  }

  updateCrabs(T, view) {
    const list = this.v.model.sea.crabs(T), S = this.scene, def = art.charDef('crab');
    if (!def || !def.atlas || !S.textures.exists(def.atlas)) return;
    const hid = this.v.hiddenCrab;
    for (const c of list) {
      let o = this.crabs.get(c.id);
      const near = c.x > view.x - 100 && c.x < view.x + view.w + 100 && c.y > view.y - 100 && c.y < view.y + view.h + 100;
      if (!near || c.id === hid) { if (o) { o.spr.setVisible(false); o.sh.setVisible(false); } continue; }
      if (!o) { o = { spr: S.add.image(0, 0, def.atlas).setOrigin(def.anchor[0], def.anchor[1]), sh: S.add.image(0, 0, 'bch_shadow').setDepth(DEPTH.SHADOW) }; o.spr.setInteractive && o.spr.setInteractive(); this.crabs.set(c.id, o); }
      const F = this.frame(def, c.anim, c.dir, T + c.id.length);
      o.spr.setTexture(def.atlas, F.name).setFlipX(F.flip).setPosition(c.x, c.y).setDepth(c.y).setVisible(true);
      o.sh.setPosition(c.x, c.y + 1).setDisplaySize(34, 14).setVisible(true);
    }
  }

  count() { let n = 0; for (const o of this.boats.values()) n += 3 + o.riders.length * 12 + (o.tow ? 3 : 0); return n + this.crabs.size * 2; }
  destroy() {
    for (const o of this.boats.values()) {
      for (const k of ['spr', 'over', 'wk']) if (o[k]) o[k].destroy();
      for (const r of o.riders) r.release();
      if (o.tow) { o.tow.spr.destroy(); o.tow.rope.destroy(); if (o.tow.wk) o.tow.wk.destroy(); }
    }
    for (const o of this.crabs.values()) { o.spr.destroy(); o.sh.destroy(); }
    this.boats.clear(); this.crabs.clear();
  }
}
