// The beach people on screen (docs/v5_v8_plan.md §6.5 view/Beachgoers): ≤ 30 paper-doll rigs for the visitors
// nearest the view (the model keeps everyone; far ones cost nothing), the staff at their staffPoints / staffDepths,
// hotel guests on the balconies at night. Swimmers sit ON the sea surface and bob with Water.js heightAt, an
// fx_swim_ripple one depth below and a water.ripple(x, y, 0.55) about once a second; splashers kick fx_splash_small on
// splash_play's impact frame at splashPoint; sunbathers lie with the FEET direction and a lieShadow ellipse; sitters
// take their seat's depth rule; the volleyball rally plays ball_throw / ball_catch on their impact frames with the
// real beach_ball between them; the ice-cream line advances and the served kid hops with a star.
//
// Rigs come from ports.dolls.rig(person) (the game's DollSprite after P5; the lab's beachfolk compositor rig):
//   rig.show(anim, dir, frame?) · rig.at(x, y, depth) · rig.visible(on) · rig.alpha(a) · rig.update(ms) · rig.release()
//   rig.anim (what really plays: pickAnim) · rig.ballPoint(anim, dir, i) · rig.splashPoint(dir) · rig.lieShadow(dir) · rig.bodyK()

import { art } from './art.js';
import { DEPTH } from '../../systems/DepthSort.js';
import { stream } from '../model/rng.js';
import { WATER_ANIMS } from '../model/activities.js';

const IMPACT = { splash_play: 2, ball_throw: 3, ball_catch: 2 };

export class Beachgoers {
  constructor(view) {
    this.v = view;
    this.scene = view.scene;
    this.rigs = new Map();          // visitor id -> { rig, shadow, ripple, ... }
    this.staffRigs = new Map();     // staff id -> { rig, ... }
    this.balc = new Map();          // balcony slot id -> { rig }
    this.over = new Map();          // visitor id -> { anim, dir, until } short overrides (a hop, a wave)
    this.ballImg = null;
    this.lastBounce = 0;
    this.rippleT = new Map();
    this.cap = view.model.cfg.live.rigs;
    this.sel = [];
    art.shadowTex(this.scene);
  }

  // ------------------------------------------------------------------------------------------ rig pool
  take(person, id) {
    const D = this.v.ports.dolls;
    if (!D || !D.rig) return null;
    const rig = D.rig(person, id);
    if (!rig) return null;
    const shadow = this.scene.add.image(0, 0, 'bch_shadow').setDepth(DEPTH.SHADOW).setVisible(false);
    return { rig, shadow, ripple: null, lastFrame: -1 };
  }
  drop(r) {
    if (!r) return;
    r.rig.release();
    if (r.shadow) r.shadow.destroy();
    if (r.ripple) r.ripple.destroy();
    if (r.lie) r.lie.destroy();
  }

  // ------------------------------------------------------------------------------------------ per frame
  update(dt, T) {
    const m = this.v.model, c = m.crowd, view = this.v.viewRect();
    // who gets a rig (the ≤ cap visitors nearest the view) is re-chosen 5× a second or when the view jumps; the
    // chosen ones are drawn every frame
    const moved = !this.selView || Math.abs(view.x - this.selView.x) + Math.abs(view.y - this.selView.y) > 120 || Math.abs(view.w - this.selView.w) > 40;
    if (moved || T - (this.selT || -1e9) >= 0.2 || T < this.selT) this.select(c, view, T);
    for (const v of this.sel) {
      if (!c.byId.has(v.id)) continue;
      let r = this.rigs.get(v.id);
      if (!r) { r = this.take(v.person, 'v' + v.id); if (!r) continue; this.rigs.set(v.id, r); }
      this.drawVisitor(v, c.posAt(v, T), r, dt, T);
    }
    this.drawBall(T);
    this.drawStaff(dt, T, view);
    this.drawBalconies(dt, T, view);
  }

  select(c, view, T) {
    const cx = view.x + view.w / 2, cy = view.y + view.h / 2, mg = 260, want = [];
    for (const v of c.list) {
      const p = c.posAt(v, T);
      if (p.x < view.x - mg || p.x > view.x + view.w + mg || p.y < view.y - mg - 80 || p.y > view.y + view.h + mg) continue;
      want.push([Math.abs(p.x - cx) + Math.abs(p.y - cy) * 1.5, v]);
    }
    want.sort((a, b) => a[0] - b[0]);
    this.sel = want.slice(0, this.cap).map((w) => w[1]);
    const keep = new Set(this.sel.map((v) => v.id));
    for (const [id, r] of this.rigs) if (!keep.has(id) || !c.byId.has(id)) { this.drop(r); this.rigs.delete(id); }
    this.selT = T;
    this.selView = { x: view.x, y: view.y, w: view.w };
  }

  /** anim / dir / frame / depth / bob for one visitor this frame */
  drawVisitor(v, p, r, dt, T) {
    const m = this.v.model, W = this.v.sea;
    let anim = p.anim, dir = p.dir, frame, depth = p.y, x = p.x, y = p.y;
    const act = v.mode === 'act' ? v.act : null, s = v.slot;
    if (act) {
      anim = v.anim; dir = v.dir;
      if (s && s.depth === 'front') depth = s.py + 0.5;
      else if (s && s.depth === 'deck') depth = s.py + 0.6;
      if (act.kind === 'volley') { const vb = this.volley(v, T); anim = vb.anim; dir = vb.dir; frame = vb.frame; }
      if (act.kind === 'surf' && act.ride) { const sr = this.surf(v, act, T); x = sr.x; y = sr.y; anim = sr.anim; dir = sr.dir; depth = y; }
      if ((act.kind === 'stroll' || act.kind === 'gaze') && !s) depth = y;
    }
    const o = this.over.get(v.id);
    if (o) { if (T < o.until) { anim = o.anim; dir = o.dir || dir; } else this.over.delete(v.id); }
    const wet = WATER_ANIMS.has(anim) || (p.wet && anim !== 'walk');
    let bob = 0;
    if (wet && W) bob = W.heightAt(x, y, W.t);
    if (anim !== r.sa || dir !== r.sd || frame !== r.sf) { r.rig.show(anim, dir, frame); r.sa = anim; r.sd = dir; r.sf = frame; }
    r.rig.at(x, y - bob, depth);
    if (!r.shown) { r.rig.visible(true); r.shown = true; }
    r.rig.update(dt * 1000);
    // shadows / ripples
    const lying = anim === 'sunbathe';
    const onTowel = lying && s && !s.depth;
    const ground = !wet && !lying && !(s && (s.depth === 'front' || s.depth === 'deck') && act);
    r.shadow.setVisible(ground || (act && act.kind === 'sit' && s && s.gx !== undefined));
    if (ground) r.shadow.setPosition(x, y + 1).setScale(0.62 * (v.age === 'child' ? 0.8 : 1), 0.62 * (v.age === 'child' ? 0.8 : 1));
    else if (act && act.kind === 'sit' && s && s.gx !== undefined) r.shadow.setPosition(s.gx, s.gy).setScale(0.7, 0.7);
    if (onTowel) {
      if (!r.lie) { const sh = r.rig.lieShadow ? r.rig.lieShadow(dir) : null; r.lie = this.scene.add.image(x, y, 'bch_shadow').setDepth(DEPTH.SHADOW + 1); r.lieDef = sh; }
      const sh = r.lieDef;
      if (sh) r.lie.setPosition(x + sh.center[0], y + sh.center[1]).setDisplaySize(sh.length, sh.width).setAngle(sh.angleDeg).setAlpha(0.8);
      else r.lie.setPosition(x, y).setScale(1.1, 0.6);
      r.lie.setVisible(true);
    } else if (r.lie) { r.lie.destroy(); r.lie = null; }
    if (wet && anim !== 'splash_play' && anim !== 'surf') this.ripple(v, r, x, y, bob, T);
    else if (r.ripple) r.ripple.setVisible(false);
    if (anim === 'splash_play') this.splash(v, r, x, y, dir, T);
  }

  /** the ring around a swimmer (one depth below) + a water ring about once a second */
  ripple(v, r, x, y, bob, T) {
    const S = this.scene;
    if (!r.ripple) {
      if (!S.textures.exists('fx_swim_ripple')) return;
      r.ripple = S.add.sprite(x, y, 'fx_swim_ripple');
      const sd = art.sheetDef('fx_swim_ripple');
      if (sd && sd.anchor) r.ripple.setOrigin(sd.anchor[0], sd.anchor[1]);
      const k = art.sheet(S, 'fx_swim_ripple');
      if (k) r.ripple.play({ key: k, startFrame: v.id % 12 });
      const bk = r.rig.bodyK ? r.rig.bodyK() : 1;
      r.ripple.setScale(r.rig.anim === 'float' ? 1.05 : 0.9 * bk);
    }
    r.ripple.setVisible(true).setPosition(x, y - bob * 0.6).setDepth(y - 1);
    const W = this.v.sea;
    if (W && W.ripple) {
      const nt = this.rippleT.get(v.id) || 0;
      if (T >= nt) { W.ripple(x, y, 0.55); this.rippleT.set(v.id, T + 0.9 + (v.id % 5) * 0.08); }
    }
  }

  /** splash_play kicks water on its impact frame */
  splash(v, r, x, y, dir, T) {
    const f = r.rig.frame;
    if (f === IMPACT.splash_play && r.lastFrame !== f) {
      const sp = r.rig.splashPoint ? r.rig.splashPoint(dir) : [0, -10];
      this.v.fx.sheet('fx_splash_small', x + (sp ? sp[0] : 0), y + (sp ? sp[1] : -10), y + 2, 0.7);
      if (this.v.sea && this.v.sea.ripple) this.v.sea.ripple(x, y, 0.8);
      if ((v.id + Math.floor(T)) % 4 === 0) this.v.sound.at('sfx_splash_beach', x, y, 0.45);
    }
    r.lastFrame = f;
  }

  /** a surfer: ride SE along the lane on the board, then paddle back (swim NW) */
  surf(v, act, T) {
    const R = act.ride, cyc = R.ride + R.back, t = (T - R.t0) % cyc;
    if (t < R.ride) { const f = t / R.ride; return { x: R.x0 + (R.x1 - R.x0) * f, y: R.y0 + (R.y1 - R.y0) * f, anim: 'surf', dir: 'SE' }; }
    const f = (t - R.ride) / R.back;
    return { x: R.x1 + (R.x0 - R.x1) * f, y: R.y1 + (R.y0 - R.y1) * f + Math.sin(f * Math.PI) * 18, anim: this.v.model.looks.pickAnim(v.person, 'swim'), dir: 'NW' };
  }

  /** the volleyball rally: who throws, who catches, which frame (impact frames line up with the ball) */
  volley(v, T) {
    const c = this.v.model.crowd.court, r = c.rally, dir = v.slot ? v.slot.dir : 'S';
    if (!r) return { anim: 'idle', dir };
    if (v.id === r.from && T >= r.tT && T < r.tR + 0.32) return { anim: 'ball_throw', dir, frame: Math.min(5, Math.floor((T - r.tT) * 10)) };
    if (v.id === r.to && T >= r.tA - 0.2) return { anim: 'ball_catch', dir, frame: Math.min(5, Math.floor((T - (r.tA - 0.2)) * 10)) };
    return { anim: 'idle', dir };
  }

  /** the ball between the players: in the hands at ballPoint, a high arc in the air */
  drawBall(T) {
    const c = this.v.model.crowd.court, r = c.rally;
    if (!r || !c.players.length) { if (this.ballImg) this.ballImg.setVisible(false); return; }
    if (!this.ballImg) {
      this.ballImg = art.image(this.scene, 'beach_ball', 0, 0);
      if (!this.ballImg) return;
      // centre the origin on the drawn ball (the item frame is a trimmed 72² cell, anchor (36, 54)); its radius is the trim
      const f = this.ballImg.frame, ss = (f.data && f.data.spriteSourceSize) || { x: 0, y: 0, w: f.cutWidth, h: f.cutHeight };
      this.ballImg.setOrigin((ss.x + ss.w / 2) / f.realWidth, (ss.y + ss.h / 2) / f.realHeight);
      this.ballR = Math.max(6, Math.min(ss.w, ss.h) / 2);
    }
    const A = this.rigs.get(r.from), B = this.rigs.get(r.to);
    const va = this.v.model.crowd.byId.get(r.from), vb = this.v.model.crowd.byId.get(r.to);
    if (!va || !vb) { this.ballImg.setVisible(false); return; }
    const pt = (rig, v, anim, frame) => {
      const bp = rig && rig.rig.ballPoint ? rig.rig.ballPoint(anim, v.slot ? v.slot.dir : 'S', frame) : null;
      return bp ? { x: v.x + bp[0], y: v.y + bp[1], front: bp[2], rad: bp[3] || 12 } : { x: v.x, y: v.y - 46, front: true, rad: 12 };
    };
    let x, y, rad, depth;
    if (T < r.tR) { const p = pt(A, va, 'ball_throw', Math.max(0, Math.min(3, Math.floor((T - r.tT) * 10)))); x = p.x; y = p.y; rad = p.rad; depth = va.y + (p.front ? 0.3 : -0.3); }
    else if (T < r.tA) {
      const a = pt(A, va, 'ball_throw', 3), b = pt(B, vb, 'ball_catch', 2), f = (T - r.tR) / (r.tA - r.tR);
      x = a.x + (b.x - a.x) * f; y = a.y + (b.y - a.y) * f - Math.sin(f * Math.PI) * (70 + Math.abs(b.x - a.x) * 0.25); rad = a.rad + (b.rad - a.rad) * f; depth = Math.max(va.y, vb.y) + 2;
    } else { const p = pt(B, vb, 'ball_catch', Math.min(5, Math.floor((T - (r.tA - 0.2)) * 10))); x = p.x; y = p.y; rad = p.rad; depth = vb.y + (p.front ? 0.3 : -0.3); }
    const k = rad / this.ballR;
    this.ballImg.setVisible(true).setPosition(x, y).setScale(k).setDepth(depth).setAngle(T * 240 % 360);
    if (T >= r.tA && this.lastBounce !== r.tA) { this.lastBounce = r.tA; this.v.sound.at('sfx_beachball_bounce', x, y, 0.6); }
  }

  // ------------------------------------------------------------------------------------------ staff and balconies
  drawStaff(dt, T, view) {
    const m = this.v.model, list = m.staff(T), seen = new Set();
    for (const s of list) {
      if (!s.on) continue;
      if (s.x < view.x - 200 || s.x > view.x + view.w + 200 || s.y < view.y - 200 || s.y > view.y + view.h + 300) continue;
      seen.add(s.id);
      let r = this.staffRigs.get(s.id);
      if (!r) {
        const R = stream(m.seed, 'staff:' + s.id);
        const person = m.looks.make(s.preset, R);
        r = this.take(person, 's:' + s.id);
        if (!r) continue;
        r.phase = R.next() * 10;
        this.staffRigs.set(s.id, r);
      }
      let anim = 'idle', dir = s.dir;
      // a little life on duty: a word now and then, a wave; the lifeguard looks out to sea, whistles when needed
      const t = (T + r.phase) % 11;
      if (s.role !== 'lifeguard' && t > 8.2 && t < 9.6) anim = 'talk';
      if ((s.role === 'doorman' || s.role === 'bellhop') && t > 4 && t < 5) anim = 'wave';
      const o = this.over.get('s:' + s.id);
      if (o && T < o.until) { anim = o.anim; dir = o.dir || dir; }
      const depth = s.depth === 'front' ? s.ay + 0.5 : s.y;
      if (anim !== r.sa || dir !== r.sd) { r.rig.show(anim, dir); r.sa = anim; r.sd = dir; }
      r.rig.at(s.x, s.y, depth);
      if (!r.shown) { r.rig.visible(true); r.shown = true; }
      r.rig.update(dt * 1000);
      r.shadow.setVisible(s.depth !== 'front').setPosition(s.x, s.y + 1).setScale(0.62);
    }
    for (const [id, r] of this.staffRigs) if (!seen.has(id)) { this.drop(r); this.staffRigs.delete(id); }
  }

  drawBalconies(dt, T, view) {
    const m = this.v.model, list = m.balconies(T), seen = new Set();
    for (const b of list) {
      if (b.x < view.x - 200 || b.x > view.x + view.w + 200 || b.y < view.y - 300 || b.y > view.y + view.h + 200) continue;
      seen.add(b.id);
      let r = this.balc.get(b.id);
      if (!r) { const R = stream(m.seed, 'bal:' + b.seed); r = this.take(m.looks.make(R.chance(0.5) ? 'beach_tourist' : 'sunbather', R), 'b:' + b.id); if (!r) continue; r.shadow.setVisible(false); this.balc.set(b.id, r); }
      const hotel = this.v.beach.item(b.key === 'pension' ? 'b2_pension' : 'b_resort_hotel');
      const wave = b.wave && ((T + b.seed % 7) % 9) < 2.2;
      const ba = wave ? 'wave' : 'idle';
      if (ba !== r.sa || b.dir !== r.sd) { r.rig.show(ba, b.dir); r.sa = ba; r.sd = b.dir; }
      r.rig.at(b.x, b.y, (hotel ? hotel.y : b.y) + 0.5);
      if (!r.shown) { r.rig.visible(true); r.shown = true; }
      r.rig.update(dt * 1000);
    }
    for (const [id, r] of this.balc) if (!seen.has(id)) { this.drop(r); this.balc.delete(id); }
  }

  /** a short anim on someone (vid or 's:<staff id>') */
  flash(id, anim, secs, dir) { this.over.set(id, { anim, until: this.v.T + secs, dir }); }
  /** where a visitor / staff member is drawn (emotes, fx) */
  posOf(id) {
    if (typeof id === 'string' && id.startsWith('s:')) { const s = this.v.model.staff(this.v.T).find((x) => 's:' + x.id === id); return s ? { x: s.x, y: s.y } : null; }
    const v = this.v.model.crowd.byId.get(id);
    if (!v) return null;
    const p = this.v.model.crowd.posAt(v, this.v.T);
    return { x: p.x, y: p.y, wet: p.wet || WATER_ANIMS.has(v.anim) };
  }
  count() { let n = 0; for (const r of this.rigs.values()) n += (r.rig.layers ? r.rig.layers() : 12) + 2; for (const r of this.staffRigs.values()) n += (r.rig.layers ? r.rig.layers() : 12) + 1; for (const r of this.balc.values()) n += r.rig.layers ? r.rig.layers() : 12; return n + (this.ballImg ? 1 : 0); }
  live() { return this.rigs.size; }
  destroy() {
    for (const r of this.rigs.values()) this.drop(r);
    for (const r of this.staffRigs.values()) this.drop(r);
    for (const r of this.balc.values()) this.drop(r);
    this.rigs.clear(); this.staffRigs.clear(); this.balc.clear();
    if (this.ballImg) this.ballImg.destroy();
  }
}
