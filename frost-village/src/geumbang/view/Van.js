// Van (view): one 금방 van drawn the manifest's way (assets/geumbang gb_van = the red van's rig in the 금방 livery):
// a soft shadow, the body (SE / NE rendered, SW / NW mirrored; the 45° corner frames gb_van_turn S / E / N, W
// mirrored), the door / unload PATCHES over idle_<dir>_0 (under the riders, their own overlay replaces over_idle),
// the driver at seat 0 (idle at seatsStand; seat 0 is empty while the door patch is open), the over_* overlay, the
// camera-facing roof sign (never flipped; mirrored vans place it at −p.x + mirrorShiftPx), night glows at the visible
// lamps and the lit roof sign. Stand-in without the art: the blue logistics van + a code-drawn "금방" board.

import { Assets } from '../../core/Assets.js';
import { DEPTH } from '../../systems/DepthSort.js';
import { frameOf, shadowTex, glowTex, baseDir, textStyle } from './art.js';

const TURN = new Set(['S', 'E', 'N', 'W']);

export class Van {
  constructor(view) {
    this.view = view;
    const sc = this.scene = view.scene;
    this.shadow = sc.add.image(0, 0, shadowTex(sc)).setDepth(DEPTH.SHADOW + 2).setVisible(false);
    this.body = sc.add.sprite(0, 0, '__WHITE').setVisible(false);
    this.patch = sc.add.image(0, 0, '__WHITE').setVisible(false);
    this.over = sc.add.image(0, 0, '__WHITE').setVisible(false);
    this.roof = sc.add.image(0, 0, '__WHITE').setVisible(false);
    this.roofGlow = sc.add.image(0, 0, glowTex(sc)).setVisible(false);
    this.glows = [];
    this.key = Assets.m.characters.gb_van ? 'gb_van' : (Assets.m.characters.delivery_van_blue ? 'delivery_van_blue' : null);
    if (this.key && !Assets.built[this.key]) Assets.buildCharacter(sc.game, this.key);
    this.def = this.key ? Assets.charDef(this.key) : null;
    this.turn = Assets.m.characters.gb_van_turn || null;
    this.standIn = this.key !== 'gb_van';
    if (this.standIn) this.board = sc.add.text(0, 0, '금방', textStyle(18, '#2b4f7e', '#f4ede0', 6, '900')).setOrigin(0.5, 1).setVisible(false);
    this.anim = ''; this.base = ''; this.mode = '';
    this.puffT = 0.5 + Math.random();
  }

  /**
   * v: { x, y, dk (SE NE SW NW | S E N W), v (m/s), rev }
   * o: { night 0..1, lang, driver: rig | null, patch: { anim: 'door' | 'unload', f: frame index } | null, alpha, dt, moving }
   */
  sync(v, o) {
    if (!this.def) return;
    const a = o.alpha === undefined ? 1 : o.alpha;
    const turn = TURN.has(v.dk) && this.turn && !this.standIn;
    const { base, flip } = baseDir(turn ? v.dk : (TURN.has(v.dk) ? (v.dk === 'E' ? 'SE' : v.dk === 'W' ? 'SW' : v.dk === 'S' ? 'SE' : 'NE') : v.dk));
    const def = turn ? this.turn : this.def;
    const sx = flip ? -1 : 1, shift = flip ? (def.mirrorShiftPx || 0) : 0;
    const px = (p) => v.x + p[0] * sx + shift;
    const x = v.x, y = v.y;
    let bob = 0;
    if (turn) {
      const f = frameOf(this.turn.atlas, 'turn_' + base + '_0');
      if (this.mode !== 'turn' || this.base !== base) { this.body.anims.stop(); if (f) this.body.setTexture(f.tex, f.frame); this.body.setOrigin(this.turn.anchor[0], this.turn.anchor[1]); this.mode = 'turn'; this.base = base; this.anim = ''; }
    } else {
      const moving = o.moving !== undefined ? o.moving : v.v > 0.12;
      const anim = o.patch ? 'patch' : moving ? 'move' : 'idle';
      if (anim === 'patch') {
        if (this.mode !== 'patch' || this.base !== base) { this.body.anims.stop(); const f = frameOf(this.def.atlas, 'idle_' + base + '_0'); if (f) this.body.setTexture(f.tex, f.frame); }
      } else if (anim !== this.anim || base !== this.base || this.mode !== 'drive') {
        this.body.play(Assets.charAnim(this.key, anim, base), true);
      }
      this.body.setOrigin(this.def.anchor[0], this.def.anchor[1]);
      this.anim = anim; this.base = base; this.mode = anim === 'patch' ? 'patch' : 'drive';
      if (anim === 'move') this.body.anims.timeScale = Math.max(0.4, Math.min(1.5, v.v / 3.5));
      const fr = this.body.anims.currentFrame, A = this.def.anims[anim === 'patch' ? 'idle' : anim];
      if (fr && A && A.bobPx) bob = A.bobPx[(fr.index || 1) - 1] || 0;
    }
    this.body.setVisible(true).setPosition(x, y).setDepth(y).setFlipX(flip).setAlpha(a);
    // shadow
    const sh = (def.shadow && def.shadow[base]) || [220, 80, base === 'SE' ? 26.57 : -26.57];
    this.shadow.setVisible(true).setPosition(x, y + 2).setDisplaySize(sh[0], sh[1] * 1.12).setAngle(flip ? -sh[2] : sh[2]).setAlpha(Math.min(1, a * 1.1));
    // the patch (door / unload) under the riders, its own overlay over them
    let overFrame = null, overAnchor = def.anchor;
    if (o.patch && !turn && this.def.anims[o.patch.anim]) {
      const P = this.def.anims[o.patch.anim];
      const i = Math.max(0, Math.min(P.frames - 1, o.patch.f | 0));
      const f = frameOf(this.def.atlas, o.patch.anim + '_' + base + '_' + i);
      if (f) this.patch.setTexture(f.tex, f.frame).setOrigin(P.anchor[0], P.anchor[1]).setVisible(true).setFlipX(flip).setPosition(x, y).setDepth(y + (P.patchDepth || 0.0005)).setAlpha(a);
      else this.patch.setVisible(false);
      overFrame = (P.overlay || 'over_' + o.patch.anim + '_{dir}_{i}').replace('{dir}', base).replace('{i}', i);
      overAnchor = P.anchor;
    } else this.patch.setVisible(false);
    // the driver at seat 0 (empty while the driver door is open)
    const seatEmpty = o.patch && o.patch.anim === 'door';
    if (o.driver) {
      const st = (def.seatsStand && def.seatsStand[base]) || (def.seats && def.seats[base]);
      if (st && !seatEmpty && o.driverIn !== false && !(turn && base === 'N')) {
        const p = st[0];
        o.driver.visible(true);
        o.driver.play('idle', turn ? (flip ? 'W' : base) : (flip ? (base === 'SE' ? 'SW' : 'NW') : base));
        o.driver.place(px(p), y + p[1] + bob, y + 0.001, a);
      } else o.driver.visible(false);
    }
    // the overlay (doors / window frames in front of the riders)
    const fr = this.body.frame && this.body.frame.name;
    if (!overFrame && fr) overFrame = 'over_' + fr;
    const of = overFrame ? frameOf((def.overlay && def.overlay.atlas) || def.atlas, overFrame) : null;
    if (of && o.driver) this.over.setTexture(of.tex, of.frame).setOrigin(overAnchor[0], overAnchor[1]).setVisible(true).setFlipX(flip).setPosition(x, y).setDepth(y + 0.004).setAlpha(a);
    else this.over.setVisible(false);
    // the roof sign: camera-facing, never flipped
    const rp = def.roofSignPoint && def.roofSignPoint[base];
    const night = o.night || 0;
    if (rp && !this.standIn) {
      const rs = Assets.m.sprites['gb_roofsign_' + (o.lang === 'en' ? 'en' : 'ko') + '_' + (night > 0.35 ? 1 : 0)];
      const f = rs ? frameOf(rs.atlas, rs.frame) : null;
      if (f) this.roof.setTexture(f.tex, f.frame).setOrigin(0.5, 1).setVisible(true).setPosition(x + (flip ? -rp[0] + (def.mirrorShiftPx || 0) : rp[0]), y + rp[1] + bob).setDepth(y + 0.02).setAlpha(a);
      else this.roof.setVisible(false);
      // (the halo sits just under the sign: the lettering stays readable; with the van, so a house in front hides it)
      if (night > 0.35) this.roofGlow.setVisible(true).setPosition(this.roof.x, this.roof.y - 24).setScale(2.4, 1.3).setDepth(y + 0.019).setAlpha(Math.min(0.7, night * 0.9) * a);
      else this.roofGlow.setVisible(false);
    } else if (this.board && rp === undefined) {
      this.board.setVisible(true).setPosition(x, y - 120 + bob).setDepth(y + 0.02).setAlpha(a);
    } else this.roof.setVisible(false);
    // lamps at night (visible ones only: lightsVisible / tailsVisible)
    const pts = [];
    const TL = (def.tailPoints && def.tailPoints[base]) || [], TV = (def.tailsVisible && def.tailsVisible[base]) || [];
    if (night > 0.05) {
      const L = (def.lightPoints && def.lightPoints[base]) || [], LV = (def.lightsVisible && def.lightsVisible[base]) || [];
      L.forEach((p, k) => { if (LV[k] !== false) pts.push({ p, kind: 0 }); });
      if (!o.hazard) TL.forEach((p, k) => { if (TV[k] !== false) pts.push({ p, kind: 1 }); });
    }
    // hazards at the curb (plan §5.6 park): the visible tail lamps blink amber, day and night
    if (o.hazard && ((o.t || 0) % 0.8) < 0.42) TL.forEach((p, k) => { if (TV[k] !== false) pts.push({ p, kind: 2 }); });
    while (this.glows.length < pts.length) this.glows.push(this.scene.add.image(0, 0, glowTex(this.scene)).setVisible(false));
    const TINT = [0xfff0c8, 0xff6a5a, 0xffb43a], SC = [0.9, 0.5, 0.62];
    for (let i = 0; i < this.glows.length; i++) {
      const g = this.glows[i], q = pts[i];
      if (!q) { if (g.visible) g.setVisible(false); continue; }
      const al = q.kind === 2 ? 0.55 + night * 0.4 : Math.min(0.95, night * 1.6) * (q.kind === 1 ? 0.8 : 1);
      // lamp glows at the van's depth (+ over its overlay): a building in front of the van hides them too
      g.setVisible(true).setPosition(px(q.p), y + q.p[1]).setScale(SC[q.kind]).setTint(TINT[q.kind]).setAlpha(Math.min(1, al * 1.25) * a).setDepth(y + 0.025);
    }
    // exhaust in the cold
    if (o.dt && this.view.near(x, y)) {
      this.puffT -= o.dt;
      const e = def.exhaustPoint && def.exhaustPoint[base];
      if (this.puffT <= 0 && e) { this.view.puff(px(e), y + e[1]); this.puffT = v.v > 0.2 ? 0.9 : 1.7; }
    }
  }

  /** a world point of the van in its current heading (doorPoints, rearDoorPoint, cargoPoint, parcelPoints) */
  point(v, field, k) {
    const turn = TURN.has(v.dk) && this.turn && !this.standIn;
    const def = turn ? this.turn : this.def;
    const { base, flip } = baseDir(turn ? v.dk : (TURN.has(v.dk) ? 'SE' : v.dk));
    const t = def && def[field] && def[field][base];
    if (!t) return { x: v.x, y: v.y };
    const p = Array.isArray(t[0]) ? t[k || 0] : t;
    const shift = flip ? (def.mirrorShiftPx || 0) : 0;
    return { x: v.x + p[0] * (flip ? -1 : 1) + shift, y: v.y + p[1] };
  }

  hide() {
    for (const o of [this.body, this.patch, this.over, this.roof, this.roofGlow, this.shadow]) o.setVisible(false);
    if (this.board) this.board.setVisible(false);
    for (const g of this.glows) g.setVisible(false);
  }

  objects() { return 6 + this.glows.length; }
  destroy() { for (const o of [this.body, this.patch, this.over, this.roof, this.roofGlow, this.shadow].concat(this.glows)) o.destroy(); if (this.board) this.board.destroy(); }
}
