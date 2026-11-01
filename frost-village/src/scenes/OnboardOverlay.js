// (v4.2.0.1) 첫 실행 튜토리얼의 화면 — what the first-run tutorial draws in the UI scene (logic: systems/Onboarding.js).
//
//   finger        the pointing mitten (ui7 ui_finger / ui_finger_press; a drawn stand-in without the atlas), anchored on
//                 the fingertip. It demonstrates gestures on the glass — DRAG (with a see-through joystick, the chief does
//                 not move), LIFT, STEP-OFF, TAP on a HUD button, PINCH — and never points at the village itself: the
//                 yellow arrow and the pulse ring on the ground say where
//   coach card    one or two short lines (bottom slot, or the top slot when the place it talks about is down there)
//   skip chip     「건너뛰기 ›」 (Acts 1–2): one tap ends everything
//   tip bubble    Act 3 / the tour's button tips, with a pulsing ring round the button and a small ×
//   spotlight     a soft dim with a hole (ui_spot_hole) round "stay here" places, only while the chief stands still
// Nothing here is interactive except the skip chip, the tour's 「다음 ›」 / 「건너뛰기」, the tip's × and a tip bubble inside
// the settings panel (it takes the tap instead of the button under it): every other touch starts the joystick as usual.
// Never covers what it points at: the card slot, the ghost joystick spot and the spotlight are worked out in screen space
// every frame (rects() is the test hook's view of them).

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { Input, JOY_RADIUS } from '../core/Input.js';
import { View } from '../core/View.js';
import { panel } from '../core/Panel.js';
import { FONT, t } from '../data/strings.js';
import { BALANCE } from '../data/balance.js';

const TXT = (size, color, weight = '900') => ({ fontFamily: FONT, fontSize: size + 'px', fontStyle: weight, color, resolution: 2 });
const DRAG_T = 2.4, LIFT_T = 1.3, STEP_T = 2.0, TAP_T = 1.6, PINCH_T = 2.2;
const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const hit = (a, b, g = 0) => !!(a && b && a[0] - g < b[2] && a[2] + g > b[0] && a[1] - g < b[3] && a[3] + g > b[1]);
const area = (a, b, g = 0) => (a && b ? Math.max(0, Math.min(a[2] + g, b[2]) - Math.max(a[0] - g, b[0])) * Math.max(0, Math.min(a[3] + g, b[3]) - Math.max(a[1] - g, b[1])) : 0);

export class OnboardOverlay {
  constructor(ui) {
    this.ui = ui;
    this.gs = ui.gs;
    this.canvas = !!(ui.sys.game.renderer && ui.sys.game.renderer.type === Phaser.CANVAS);
    this.t = 0;
    this.hid = -1; this.ht = 0;
    this.cid = -1;
    this.tipN = -1;
    this._rects = null;
    this.build();
    ui.input.on('gameobjectdown', this.onObjDown, this);
    ui.input.on('pointerdown', this.onDown, this);
    ui.input.on('pointerup', this.onUp, this);
    ui.events.once('shutdown', () => { ui.input.off('gameobjectdown', this.onObjDown, this); ui.input.off('pointerdown', this.onDown, this); ui.input.off('pointerup', this.onUp, this); });
  }

  get ob() { return this.gs.onboard || null; }

  // ------------------------------------------------------------------ pieces
  build() {
    const ui = this.ui;
    // the soft spotlight: four dim rectangles round a radial hole (under every HUD object, over the village)
    this.spotC = ui.add.container(0, 0).setDepth(-5).setVisible(false).setAlpha(0);
    this.spotR = [0, 1, 2, 3].map(() => ui.add.rectangle(0, 0, 10, 10, 0x1b2638, 0.3).setOrigin(0, 0));
    this.spotHole = Assets.has('ui_spot_hole') ? Assets.image(ui, 0, 0, 'ui_spot_hole').setOrigin(0.5).setTint(0x1b2638).setAlpha(0.3) : null;
    this.spotC.add(this.spotR.concat(this.spotHole ? [this.spotHole] : []));
    this.spotA = 0;
    // the ghost joystick (same art and size as the real one, see-through)
    this.gBase = Assets.image(ui, 0, 0, 'ui_joystick_base').setDepth(70).setVisible(false);
    this.gBase.setScale((JOY_RADIUS * 2.2) / Math.max(this.gBase.frame.realWidth, 1));
    this.gKnob = Assets.image(ui, 0, 0, 'ui_joystick_knob').setDepth(70).setVisible(false);
    this.gKnob.setScale(84 / Math.max(this.gKnob.frame.realWidth, 1));
    // tap ripples
    const rk = Assets.has('ui_tap_ripple') ? 'ui_tap_ripple' : 'ui_ring_fill';
    this.rips = [0, 1, 2].map(() => { const r = Assets.image(ui, 0, 0, rk).setOrigin(0.5).setDepth(74).setVisible(false); if (rk !== 'ui_tap_ripple') r.setTint(0xffe27a); r.__base = 96 / Math.max(1, r.frame.realWidth); r.__t = -1; return r; });
    // fingers (two for the pinch)
    this.realFinger = Assets.has('ui_finger');
    if (!this.realFinger) this.makeFallback();
    this.fingers = [0, 1].map(() => {
      const f = this.realFinger ? Assets.image(ui, 0, 0, 'ui_finger') : ui.add.image(0, 0, 'fv_finger').setOrigin(26 / 128, 13 / 128);
      f.setDepth(75).setVisible(false);
      f.__ax = f.originX; f.__ay = f.originY;
      f.__base = 112 / Math.max(1, f.frame.realHeight);
      f.__press = false;
      return f;
    });
    // the coach card
    const cc = this.cardC = ui.add.container(0, 0).setDepth(58).setVisible(false);
    this.cardBg = panel(ui, 0, 0, 'ui_panel', 520, 76).setOrigin(0.5);
    this.cardCheck = Assets.image(ui, 0, 0, 'ui_icon_check').setOrigin(0.5).setVisible(false);
    this.cardCheck.setScale(40 / Math.max(1, this.cardCheck.frame.realWidth));
    this.t1 = ui.add.text(0, 0, '', TXT(30, '#2b2f3a')).setOrigin(0.5);
    this.t2 = ui.add.text(0, 0, '', TXT(24, '#4c5a6e', '800')).setOrigin(0.5);
    cc.add([this.cardBg, this.cardCheck, this.t1, this.t2]);
    this.nextBtn = ui.makeButton(0, 0, 200, 64, 'blue', t('onb_next'), () => { const o = this.ob; if (o) o.next(); }, 26);
    this.tourSkip = ui.makeButton(0, 0, 200, 64, 'gray', t('onb_skip'), () => { const o = this.ob; if (o) o.skip(); }, 24);
    this.nextBtn.setDepth(59).setVisible(false); this.tourSkip.setDepth(59).setVisible(false);
    this.cardA = 0;
    // the skip chip: 150 x 52 to see, 200 x 84 to hit
    const sc = this.skipC = ui.add.container(0, 0).setDepth(58).setVisible(false);
    this.skipBg = panel(ui, 0, 0, 'ui_button_gray', 150, 52).setOrigin(0.5).setAlpha(0.9);
    this.skipTx = ui.add.text(0, -2, t('onb_skip'), Object.assign(TXT(22, '#ffffff'), { stroke: '#4a5361', strokeThickness: 5 })).setOrigin(0.5);
    sc.add([this.skipBg, this.skipTx]);
    sc.setSize(150, 52);
    sc.setInteractive(new Phaser.Geom.Rectangle(-25, -16, 200, 84), Phaser.Geom.Rectangle.Contains);
    // (a TAP skips: the finger lifts on it without moving. A drag that starts on the chip — it sits where a thumb walks
    //  the chief — starts the joystick like anywhere else (UI.create's pointerdown, isOnbSkip) and skips nothing)
    sc.on('pointerdown', (p) => { this.chipPress = { id: p.id, x: p.x, y: p.y, t: ui.time.now }; ui.tweens.add({ targets: sc, scale: 0.92, duration: 70, yoyo: true }); });
    sc.isOnbSkip = true;
    // the tip bubble + the ring round its button
    const tc = this.tipC = ui.add.container(0, 0).setDepth(58).setVisible(false);
    this.tipBg = panel(ui, 0, 0, 'ui_bubble_body', 420, 100).setOrigin(0.5);
    this.tipTail = Assets.image(ui, 0, 0, 'ui_bubble_tail').setOrigin(0.5, 0);
    this.tipTail.setScale(30 / Math.max(1, this.tipTail.frame.realWidth));
    this.tipT1 = ui.add.text(0, 0, '', TXT(26, '#2b2f3a')).setOrigin(0.5);
    this.tipT2 = ui.add.text(0, 0, '', TXT(22, '#4c5a6e', '800')).setOrigin(0.5);
    const x = this.tipX = ui.add.container(0, 0);
    const xg = ui.add.graphics();
    xg.fillStyle(0x8e99a8, 1); xg.fillCircle(0, 0, 17); xg.lineStyle(3, 0xffffff, 1); xg.strokeCircle(0, 0, 17);
    const xt = ui.add.text(0, -2, '×', TXT(26, '#ffffff')).setOrigin(0.5);
    x.add([xg, xt]);
    x.setSize(56, 56);
    x.setInteractive(new Phaser.Geom.Rectangle(0, 0, 56, 56), Phaser.Geom.Rectangle.Contains);
    x.on('pointerdown', () => { const o = this.ob; if (o && o.tip) { if (o.mode === 'tour') o.next(); else o.endTip(o.tip); } });
    // (L6) inside the settings panel the bubble sits over a row of buttons (처음부터 하기 / 새로고침): a tap on it ends the
    //  tip and goes no further. Outside the panel it takes nothing (a touch there walks the chief)
    this.tipHit = ui.add.zone(0, 0, 420, 100);
    this.tipHit.setInteractive();
    this.tipHit.input.enabled = false;
    this.tipHit.on('pointerdown', () => { const o = this.ob; if (o && o.tip && this.ui.panelOpen) o.noteTap('panel', (this.ut || 0) + 1e-3); });
    tc.add([this.tipHit, this.tipTail, this.tipBg, this.tipT1, this.tipT2, x]);
    this.tipRing = Assets.image(ui, 0, 0, rk).setOrigin(0.5).setDepth(57).setVisible(false).setTint(0xffe27a);
    this.tipRing.__base = 1 / Math.max(1, this.tipRing.frame.realWidth);
    this.layout();
  }

  /** the mitten drawn with Graphics (the ui7 atlas did not load): fingertip at (26, 13) of a 128 frame */
  makeFallback() {
    const ui = this.ui;
    if (ui.textures.exists('fv_finger')) return;
    const g = ui.make.graphics({ x: 0, y: 0, add: false });
    const draw = (dx, dy, col, a, line) => {
      g.save();
      g.translateCanvas(26 + dx, 13 + dy);
      g.rotateCanvas(-0.56);
      g.fillStyle(col, a);
      g.fillRoundedRect(-10, -1, 20, 50, 10);           // the index finger
      g.fillRoundedRect(-17, 38, 46, 44, 18);           // the palm
      if (line) {
        g.lineStyle(3, 0x2c4268, 1);
        g.strokeRoundedRect(-10, -1, 20, 50, 10);
        g.strokeRoundedRect(-17, 38, 46, 44, 18);
        g.fillStyle(0xffffff, 1);
        g.fillRoundedRect(-8.5, 0.5, 17, 47, 8.5);
        g.fillRoundedRect(-15.5, 39.5, 43, 41, 16.5);
        g.fillStyle(0x25a595, 1); g.fillRoundedRect(-16, 78, 46, 16, 6);
        g.lineStyle(2, 0x0e4c47, 1); g.strokeRoundedRect(-16, 78, 46, 16, 6);
        g.lineStyle(2, 0xc7f3ec, 0.9);
        for (const x of [-6, 6, 18]) g.lineBetween(x, 81, x, 91);
      }
      g.restore();
    };
    draw(4, 6, 0x1f3354, 0.25, false);
    draw(0, 0, 0x2c4268, 1, true);
    g.generateTexture('fv_finger', 128, 128);
    g.destroy();
  }

  layout() {
    const ui = this.ui, W = ui.W, H = ui.H;
    this.skipC.setPosition(W / 2, H - 70 - View.safeBottom);
  }

  /** the language changed (설정 › 언어): the chip and the tour's buttons say it again; the card follows by itself */
  relabel() {
    this.skipTx.setText(t('onb_skip'));
    this.nextBtn.text.setText(t('onb_next'));
    this.tourSkip.text.setText(t('onb_skip'));
    this.cardKey = null; this.tipN = -1;
    const o = this.ob;
    if (o && o.relang) o.relang();          // (L7: an Act 2 / tour card or a tip set once says it again in the new language)
  }

  // ------------------------------------------------------------------ input
  /** which HUD button a tap went to (tips complete when the player uses the thing) */
  onObjDown(p, obj) {
    const o = this.ob;
    if (!o) return;
    const ui = this.ui, h = ui.hud42;
    const name = obj === ui.whistleBtn ? 'whistle' : obj === ui.mapBtn ? 'map' : obj === ui.zoomOutBtn || obj === ui.zoomInBtn ? 'zoomOut'
      : obj === ui.setBtn ? 'settings' : h && obj === h.obsBtn ? 'obs' : h && obj === h.navChip ? 'nav' : null;
    if (name) o.noteTap(name);
  }

  onDown() { const o = this.ob; if (o && this.ui.panelOpen) o.noteTap('panel', this.ut); }

  /** the skip chip: a tap (lifted on the chip, moved < 16 px, within 0.6 s) */
  onUp(p) {
    const c = this.chipPress;
    if (!c || p.id !== c.id) return;
    this.chipPress = null;
    const moved = Math.hypot(p.x - c.x, p.y - c.y), b = this.skipC;
    const lx = View.toLogical(p.x), ly = View.toLogical(p.y);
    const on = b.visible && Math.abs(lx - b.x) <= 100 && Math.abs(ly - b.y) <= 42;
    if (on && moved < 16 * View.k && this.ui.time.now - c.t < 600) { Audio.play('sfx_click'); const o = this.ob; if (o) o.skip(); }
  }

  // ------------------------------------------------------------------ geometry
  /** world point -> UI logical px */
  sp(x, y) { return this.ui.worldToScreen(x, y); }
  zs() { return (this.gs.cameras.main.zoom || 1) / View.k; }
  /** a pad / place on the ground (+ the yellow arrow over it) as a screen box */
  placeBox(pt, h) {
    if (!pt) return null;
    const s = this.sp(pt.x, pt.y), z = this.zs();
    const top = h ? s.y - (h + 16 + 70) * z : s.y - 48 * z;
    return [s.x - 75 * z, top, s.x + 75 * z, s.y + 42 * z];
  }
  chiefBox() { const p = this.gs.player, s = this.sp(p.x, p.y), z = this.zs(); return [s.x - 34 * z, s.y - 122 * z, s.x + 34 * z, s.y + 12 * z]; }

  /** a HUD button's centre and radius (null when it is not on screen) */
  btnPos(name) {
    const ui = this.ui, h = ui.hud42, W = ui.W, H = ui.H, cx = W / 2, cy = H / 2;
    const B = (o, r) => (o && o.visible ? { x: o.x, y: o.y, r } : null);
    switch (name) {
      case 'whistle': return B(ui.whistleBtn, 40);
      case 'zoomOut': return B(ui.zoomOutBtn, 35);
      case 'zoomIn': return B(ui.zoomInBtn, 35);
      case 'map': return B(ui.mapBtn, 35);
      case 'settings': return B(ui.setBtn, 42);
      case 'obs': return h ? B(h.obsBtn, 32) : null;
      case 'nav': return h && h.navChip && h.navChip.visible ? { x: h.navChip.x, y: h.navChip.y, r: 27, w: (h.navBg && (h.navBg.displayWidth || h.navBg.width)) || 300 } : null;
      case 'move': return ui.panelOpen ? { x: cx - 130, y: cy + 428, r: 40, w: 240 } : null;
      case 'playTab': return ui.panelOpen ? { x: cx + 122, y: cy - 348, r: 33, w: 236 } : null;
      case 'dogbar': return ui.dogBar && ui.dogBar.visible ? { x: ui.dogBar.x, y: ui.dogBar.y, r: 102, w: 336, noFinger: true } : null;
      default: return null;
    }
  }
  btnVisible(name) { return !!this.btnPos(name); }

  hudBoxes() {
    const out = [];
    for (const n of ['whistle', 'zoomOut', 'zoomIn', 'map', 'settings', 'obs']) { const b = this.btnPos(n); if (b) out.push([b.x - b.r, b.y - b.r, b.x + b.r, b.y + b.r]); }
    const ui = this.ui, top = 62 + View.safeTop;
    out.push([0, top - 40, 270, top + 40]);
    if (this.skipC.visible) out.push([this.skipC.x - 100, this.skipC.y - 42, this.skipC.x + 100, this.skipC.y + 42]);
    void ui;
    return out;
  }

  // ------------------------------------------------------------------ frame (UI.tick)
  update(dt) {
    const ob = this.ob, ui = this.ui;
    this.t += dt;
    this.ut = (this.ut || 0) + dt;
    if (!ob || ob.mode === 'off') { if (!this.allHidden) this.hideAll(); return; }
    this.allHidden = false;
    try { ob.ov = this; ob.uiUpdate(dt, ui, this); } catch (e) { if (!this._err) { this._err = true; console.error('[FrostVillage] onboarding tips:', e); } }
    const gs = this.gs;
    const panelUp = !!(ui.panelOpen || ui.adminOpen || ui.buildOpen || ui.v4PanelOpen || ui.v42PanelOpen);     // ((v4.2.0.2) + 관리자 모드)
    const tip = ob.tip;
    const tipInPanel = tip && (tip.btn === 'move' || tip.btn === 'playTab');
    const tipInMap = tip && tip.id === 'T4' && gs.overview;
    const quiet = panelUp || gs.overview;
    const bannerUp = ui.bannerBox && ui.bannerBox.visible;
    this.bannerGone = bannerUp ? 0 : (this.bannerGone || 0) + dt;
    // the skip chip (Acts 1–2)
    this.skipC.setVisible(!!ob.showSkip && !quiet);
    // the card
    this.updateCard(dt, !quiet && !(bannerUp || this.bannerGone < 0.3));
    // the tip bubble
    if (tip && (!quiet || tipInPanel || tipInMap)) this.updateTip(dt, tip, panelUp && tipInPanel); else { this.tipC.setVisible(false); this.tipRing.setVisible(false); }
    // the finger: a tip's gesture, else the step's
    const h = tip && (!quiet || tipInPanel || tipInMap) ? null : quiet ? null : ob.hand;
    if (!tip || (quiet && !tipInPanel && !tipInMap)) this.updateHand(dt, h);
    // the spotlight
    this.updateSpot(dt, quiet ? null : ob.spot);
    this.ripples(dt);
  }

  hideAll() {
    if (this.cardC.visible) this.cardC.setVisible(false);
    this.nextBtn.setVisible(false); this.tourSkip.setVisible(false);
    if (this.skipC.visible) this.skipC.setVisible(false);
    this.tipC.setVisible(false); this.tipRing.setVisible(false);
    for (const f of this.fingers) f.setVisible(false);
    this.gBase.setVisible(false); this.gKnob.setVisible(false);
    if (this.spotC.visible) { this.spotA = 0; this.spotC.setVisible(false).setAlpha(0); }
    for (const r of this.rips) { r.setVisible(false); r.__t = -1; }
    this.hid = -1; this.cid = -1;
    this._rects = null;
    this.allHidden = true;           // (an old village: nothing to do every frame after this)
  }

  // ------------------------------------------------------------------ card
  updateCard(dt, show) {
    const ob = this.ob, c = ob.card, ui = this.ui;
    if (!c) { this.cardC.setVisible(false); this.nextBtn.setVisible(false); this.tourSkip.setVisible(false); this.cid = -1; this.cardBox = null; return; }
    const W = ui.W, H = ui.H, top = 62 + View.safeTop;
    // texts (re-fitted when they change)
    const key = c.id + '|' + c.l1 + '|' + (c.l2 || '') + '|' + (c.mini ? 1 : 0) + '|' + (c.check ? 1 : 0);
    const fresh = c.id !== this.cid;
    if (key !== this.cardKey) {
      this.cardKey = key;
      this.fitCard(c);
    }
    // the slot: bottom unless the place it talks about (or the chief, in "stay" steps) is under it; it changes
    // mid-step only when that lasts 0.5 s
    const target = ob.mode === 'act1' || ob.mode === 'act2' || ob.mode === 'tour' ? this.targetBox() : null;
    const ch = this.cardH, cw = this.cardW;
    const bottomY = H - 280 - View.safeBottom - (c.next ? 40 : 0);
    const topY = ob.mode === 'act2' ? top + 168 : top + 96;
    const boxAt = (y) => [W / 2 - cw / 2, y - ch / 2, W / 2 + cw / 2, y + ch / 2];
    const over = (y) => hit(boxAt(y), target, 40) || (ob.spot && ob.spot.pts && hit(boxAt(y), this.chiefBox(), 30));
    if (fresh) { this.cid = c.id; this.slot = c.top || c.mini ? 'top' : over(bottomY) ? 'top' : 'bottom'; this.overT = 0; this.popCard(); }
    else if (!c.top && !c.mini) {
      const y = this.slot === 'top' ? topY : bottomY;
      this.overT = over(y) ? this.overT + dt : 0;
      if (this.overT > 0.5) { this.slot = this.slot === 'top' ? 'bottom' : 'top'; this.overT = 0; }
    } else this.slot = 'top';
    let y = this.slot === 'top' ? topY + (ch - 76) / 2 : bottomY;
    if (c.next && this.slot === 'top') y += 0;
    this.cardC.setPosition(W / 2, y);
    this.cardBox = show ? boxAt(y) : null;
    // hidden under a banner (and 0.3 s after), faded in / out
    const want = show ? 1 : 0;
    this.cardA += Math.sign(want - this.cardA) * Math.min(Math.abs(want - this.cardA), dt / 0.15);
    this.cardC.setVisible(this.cardA > 0.01).setAlpha(this.cardA);
    // the tour's buttons sit under the card
    const btns = !!c.next && this.cardA > 0.5;
    this.nextBtn.setVisible(btns); this.tourSkip.setVisible(btns);
    if (btns) { const by = y + ch / 2 + 44; this.nextBtn.setPosition(W / 2 + 110, by); this.tourSkip.setPosition(W / 2 - 110, by); }
    // a gentle wiggle when S1 waits long (10 s without a touch)
    if (ob.mode === 'act1' && ob.cur === 'move' && !ob.moved && ob.a1T > 10 && !this.wiggled) { this.wiggled = true; ui.tweens.add({ targets: this.cardC, angle: { from: -2, to: 2 }, duration: 90, yoyo: true, repeat: 3, onComplete: () => this.cardC.setAngle(0) }); }
  }

  fitCard(c) {
    const ui = this.ui, W = ui.W;
    const top = c.top || c.mini;
    const one = top && !c.full;           // (the top slot says one line — the closing card says both)
    const maxW = (top ? W - 48 : 520) - 48 - (c.check ? 52 : 0);
    const fit = (tx, s, txt) => {
      tx.setScale(1).setWordWrapWidth(null).setFontSize(s).setText(txt || '');
      if (!txt) return 0;
      if (tx.width > maxW) {
        if (tx.width * 0.85 <= maxW || top) tx.setScale(Math.max(top ? 0.6 : 0.85, maxW / tx.width));
        else { tx.setScale(0.85).setWordWrapWidth(maxW / 0.85, true).setAlign('center'); }
      }
      return tx.displayHeight;
    };
    const h1 = fit(this.t1, c.mini ? 26 : 30, c.l1);
    const h2 = one || !c.l2 ? fit(this.t2, 24, '') : fit(this.t2, 24, c.l2);
    this.t2.setVisible(h2 > 0);
    const tw = Math.max(this.t1.displayWidth, h2 ? this.t2.displayWidth : 0) + (c.check ? 52 : 0);
    const cw = Math.min(top ? W - 48 : 520, Math.max(top ? 200 : 300, tw + 56));
    const ch = Math.max(c.mini ? 60 : 76, 26 + h1 + (h2 ? 8 + h2 : 0));
    this.cardW = cw; this.cardH = ch;
    this.cardBg.setSize(cw, ch);
    const ox = c.check ? 26 : 0;
    const y1 = h2 ? -ch / 2 + 13 + h1 / 2 : 0;
    this.t1.setPosition(ox, y1);
    if (h2) this.t2.setPosition(ox, y1 + h1 / 2 + 8 + h2 / 2);
    this.cardCheck.setVisible(!!c.check).setPosition(-this.t1.displayWidth / 2 - 12 + ox - 18, y1);
  }

  popCard() {
    const ui = this.ui, c = this.cardC;
    ui.tweens.killTweensOf(c);
    c.setScale(0.86);
    ui.tweens.add({ targets: c, scale: 1, duration: 200, ease: 'Back.easeOut' });
  }

  targetBox() {
    const ob = this.ob;
    if (ob.mode === 'act1' && ob.target) return this.placeBox(ob.ringAt || ob.target, ob.target.h);
    if (ob.ringAt) return this.placeBox(ob.ringAt, 0);
    if (ob.mode === 'act1' && ob.spot && ob.spot.pts) return this.placeBox(ob.spot.pts[0], 0);
    return null;
  }

  // ------------------------------------------------------------------ the finger
  /**
   * where the ghost joystick demo happens: the first spot clear of the chief, the target, the card and the HUD — and
   * (playtest #4) of the village's own things (the stations, the pads, the line of customers and their order bubbles),
   * so the press never lands on something that reads as "tap this". When no spot is clear, the one that covers least
   * (a press on a thing counts most)
   */
  ghostSpot(dir) {
    const ui = this.ui, W = ui.W, H = ui.H;
    // (the lower half first — where a thumb drags, and where the boardwalk is mostly empty — then higher up)
    const C = [[W * 0.62, H - 560], [W * 0.38, H - 560], [W * 0.5, H - 470], [W * 0.28, H - 450], [W * 0.72, H - 450],
      [W * 0.2, H - 450], [W * 0.8, H - 450], [W * 0.5, H - 660], [W * 0.25, H * 0.5], [W * 0.75, H * 0.5], [W * 0.5, H * 0.42],
      [W * 0.3, H * 0.36], [W * 0.7, H * 0.36]];
    const obs = [this.chiefBox(), this.targetBox()].concat(this.hudBoxes()).filter(Boolean);
    const card = this.cardBox;
    const things = this.worldBoxes();
    let best = null, ba = Infinity;
    for (let n = 0; n < C.length; n++) {
      const [x, y] = C[n];
      const ex = x + dir.x * JOY_RADIUS, ey = y + dir.y * JOY_RADIUS;
      const flip = Math.max(x, ex) > W - 140;
      const fp = [Math.min(x, ex) - (flip ? 80 : 24), Math.min(y, ey) - 18, Math.max(x, ex) + (flip ? 24 : 80), Math.max(y, ey) + 104];
      const gb = [x - 86, y - 86, x + 86, y + 86];
      const box = [Math.min(fp[0], gb[0]), Math.min(fp[1], gb[1]), Math.max(fp[2], gb[2]), Math.max(fp[3], gb[3])];
      const press = [x - 46, y - 46, x + 46, y + 46];
      let a = 0, w = 0;
      for (const o of obs) a += area(box, o, 40);
      if (card) a += area(box, card, 12);
      if (box[0] < 0 || box[2] > W || box[1] < 0 || box[3] > H) a += 1e5;
      for (const o of things) w += area(press, o, 8) * 4 + area(box, o, 0) * 0.5;
      if (a === 0 && w === 0) return { x, y };
      const sc = a * 10 + w + n * 50;
      if (sc < ba) { ba = sc; best = { x, y }; }
    }
    return best;
  }

  /**
   * the village's things on screen, logical px: the real drawn bounds of the first loop's stations (net, grill, the
   * stall with its shelf / register / cash pad), the active pads, the customers in line with their order bubbles and
   * the villagers (and 누리) walking by with room for a chat bubble over the head
   */
  worldBoxes() {
    const gs = this.gs, W = this.ui.W, H = this.ui.H, z = this.zs(), out = [];
    const push = (b) => { if (b && b[2] > 0 && b[0] < W && b[3] > 0 && b[1] < H && b[2] - b[0] < W * 0.9) out.push(b); };
    const box = (o, up) => {
      if (!o || o.visible === false || typeof o.getBounds !== 'function') return;
      let r; try { r = o.getBounds(); } catch (e) { return; }
      if (!r || !Number.isFinite(r.x) || r.width <= 0) return;
      const a = this.sp(r.x, r.y), b = this.sp(r.right, r.bottom);
      push([a.x, a.y - (up || 0) * z, b.x, b.y]);
    };
    const all = (src) => { if (src && typeof src.revealObjects === 'function') { try { for (const o of src.revealObjects()) box(o); } catch (e) { /* */ } } };
    const m = gs.market, gr = gs.stations && gs.stations.grill;
    if (gs.net) box(gs.net.img);
    all(gr); all(m);
    if (m) for (const c of m.queue || []) { box(c.sprite); if (c.bubble && c.bubble.visible) box(c.bubble); }
    const pads = gs.progress && gs.progress.pads;
    if (pads) for (const k in pads) { const q = pads[k]; if (q && q.active && !q.done) box(q.pad && q.pad.img); }
    const life = gs.life && gs.life.residents;
    if (life) for (const r of life) if (r && r.alive !== false) box(r.sprite, 40);
    return out;
  }

  /** drag direction on screen: from the chief toward the place */
  dirTo(to) {
    const p = this.gs.player;
    if (!to) return { x: 0.7, y: -0.7 };
    // (playtest #3: toward the next point of the way there — round a crate, not into it)
    const o = this.ob, w = o && o.via ? o.via(to) || to : to;
    const a = this.sp(p.x, p.y), b = this.sp(w.x, w.y);
    // (the stick's up/down walks at verticalFactor speed: the knob leans so that copying it walks straight at the place)
    const vf = Number(BALANCE.player && BALANCE.player.verticalFactor) || 1;
    const dx = b.x - a.x, dy = (b.y - a.y) / vf, d = Math.hypot(dx, dy);
    return d > 4 ? { x: dx / d, y: dy / d } : { x: 0.7, y: -0.7 };
  }

  /** put finger i's tip on (x, y): flipped near the right edge, pressed or not */
  finger(i, x, y, a, press, sc = 1, rot = 0, flip) {
    const f = this.fingers[i], W = this.ui.W;
    const fl = flip !== undefined ? flip : x > W - 140;
    if (f.flipX !== fl) { f.setFlipX(fl); f.setOrigin(fl ? 1 - f.__ax : f.__ax, f.__ay); }
    if (this.realFinger && press !== f.__press) { f.__press = press; Assets.apply(f, press ? 'ui_finger_press' : 'ui_finger'); f.setOrigin(fl ? 1 - f.__ax : f.__ax, f.__ay); }
    const k = this.realFinger ? 1 : press ? 0.94 : 1;
    f.setVisible(a > 0.01).setPosition(x, y).setAlpha(a).setScale(f.__base * sc * k).setRotation(rot);
  }

  ripple(x, y) {
    const r = this.rips.find((q) => q.__t < 0) || this.rips[0];
    r.__t = 0; r.setPosition(x, y).setVisible(true);
  }

  ripples(dt) {
    for (const r of this.rips) {
      if (r.__t < 0) continue;
      r.__t += dt;
      const k = r.__t / 0.45;
      if (k >= 1) { r.__t = -1; r.setVisible(false); continue; }
      r.setScale(r.__base * (0.3 + 0.8 * k)).setAlpha(0.9 * (1 - k));
    }
  }

  ghost(x, y, kx, ky, a) {
    const on = a > 0.01;
    this.gBase.setVisible(on).setPosition(x, y).setAlpha(0.45 * a);
    this.gKnob.setVisible(on).setPosition(kx, ky).setAlpha(0.7 * a);
  }

  updateHand(dt, h) {
    // the real joystick is under the player's own finger: the demo steps aside in the same frame
    if (!h || Input.joy.active || (h.g !== 'lift' && Input.vec.mag > 0.05 && !Input.override)) {
      if (this.fingers[0].visible || this.gBase.visible) { for (const f of this.fingers) f.setVisible(false); this.ghost(0, 0, 0, 0, 0); }
      this.hid = h && Input.joy.active ? this.hid : -1;
      this.fingerBox = null; this.ghostC = null;
      return;
    }
    if (this.fingers[0].depth !== 75) for (const f of this.fingers) f.setDepth(75);
    if (h.id !== this.hid) { this.hid = h.id; this.ht = 0; this.loopN = -1; }
    this.ht += dt;
    this.fingers[1].setVisible(false);
    const P = h.g === 'lift' ? LIFT_T : h.g === 'stepoff' ? STEP_T : DRAG_T;
    const n = Math.floor(this.ht / P), lt = this.ht - n * P;
    if (n !== this.loopN) {
      this.loopN = n;
      if (!h.loop && n > 0 && h.g !== 'lift') { for (const f of this.fingers) f.setVisible(false); this.ghost(0, 0, 0, 0, 0); this.fingerBox = null; this.ghostC = null; return; }
      if (h.g === 'lift' && n > 0) { for (const f of this.fingers) f.setVisible(false); this.ghost(0, 0, 0, 0, 0); this.fingerBox = null; this.ghostC = null; return; }
      // a new loop: the direction and the spot again (the camera may have moved)
      const ob = this.ob;
      this.dir = h.g === 'stepoff' ? this.stepDir(h.to) : this.dirTo(h.to);
      if (h.g === 'lift') this.dir = { x: 0, y: 0 };
      this.spot0 = this.ghostSpot(h.g === 'drag' ? this.dir : { x: 0, y: 0 }) || { x: this.ui.W * 0.62, y: this.ui.H - 560 };
      this.pressed = false;
      void ob;
    }
    const s = this.spot0, d = this.dir;
    // the bigger hand after 10 s without a touch (S1)
    const ob = this.ob;
    const sc = ob && ob.mode === 'act1' && ob.cur === 'move' && !ob.moved && ob.a1T > 10 ? 1.1 : 1;
    let fx = s.x, fy = s.y, a = 1, press = false, kx = s.x, ky = s.y, ga = 0, fs = sc;
    if (h.g === 'drag') {
      if (lt < 0.25) { const k = ease(lt / 0.25); fx = s.x + 30 * (1 - k); fy = s.y + 30 * (1 - k); a = k; }
      else if (lt < 1.65) {
        press = true;
        if (!this.pressed) { this.pressed = true; this.ripple(s.x, s.y); }
        ga = clamp01((lt - 0.25) / 0.1);
        const k = ease(clamp01((lt - 0.35) / 0.8));
        kx = s.x + d.x * JOY_RADIUS * k; ky = s.y + d.y * JOY_RADIUS * k;
        fx = kx; fy = ky;
      } else {
        const k = clamp01((lt - 1.65) / 0.45);
        kx = s.x + d.x * JOY_RADIUS; ky = s.y + d.y * JOY_RADIUS;
        fx = kx; fy = ky - 30 * k; a = 1 - k; ga = 1 - k;
      }
    } else if (h.g === 'stepoff') {
      if (lt < 0.25) { const k = ease(lt / 0.25); fx = s.x + 30 * (1 - k); fy = s.y + 30 * (1 - k); a = k; }
      else if (lt < 1.2) {
        press = true;
        if (!this.pressed) { this.pressed = true; this.ripple(s.x, s.y); }
        ga = clamp01((lt - 0.25) / 0.1);
        const q = lt < 0.75 ? ease(clamp01((lt - 0.3) / 0.4)) : 1 - ease(clamp01((lt - 0.75) / 0.4));
        kx = s.x + d.x * 50 * q; ky = s.y + d.y * 50 * q; fx = kx; fy = ky;
      } else { const k = clamp01((lt - 1.2) / 0.45); fx = s.x; fy = s.y - 30 * k; a = 1 - k; ga = 1 - k; }
      if (lt >= 1.65) this.pressed = false;
    } else if (h.g === 'lift') {
      press = lt < 0.4; ga = lt < 0.4 ? 1 : 1 - clamp01((lt - 0.4) / 0.8);
      if (!this.pressed) { this.pressed = true; this.ripple(s.x, s.y); }
      const k = clamp01((lt - 0.4) / 0.8);
      fy = s.y - 40 * k; a = 1 - k; fs = sc * (1 + 0.1 * k);
    }
    if (h.g === 'drag' && lt >= 2.1) { a = 0; ga = 0; }
    this.finger(0, fx, fy, a, press, fs, 0, s.x > this.ui.W - 140 || fx > this.ui.W - 140);
    this.ghost(s.x, s.y, kx, ky, ga);
    const f = this.fingers[0];
    this.fingerBox = f.visible ? (() => { const b = f.getBounds(); return [b.x, b.y, b.right, b.bottom]; })() : null;
    this.ghostC = ga > 0.01 ? { x: s.x, y: s.y, r: 86 } : null;
  }

  /** STEP-OFF: the knob goes away from the pad (from the pad's screen point toward the chief's, else down) */
  stepDir(to) {
    const p = this.gs.player;
    if (!to) return { x: 0, y: 1 };
    const a = this.sp(to.x, to.y), b = this.sp(p.x, p.y + 60);
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    return d > 4 ? { x: dx / d, y: dy / d } : { x: 0, y: 1 };
  }

  // ------------------------------------------------------------------ tips
  updateTip(dt, tp, inPanel) {
    const ui = this.ui, W = ui.W, H = ui.H, b = this.btnPos(tp.btn);
    const depth = inPanel ? 86 : 58;
    if (this.tipHit.input) this.tipHit.input.enabled = !!(inPanel && b);
    if (!b) { this.tipC.setVisible(false); this.tipRing.setVisible(false); for (const f of this.fingers) f.setVisible(false); return; }
    if (tp.n !== this.tipN) {
      this.tipN = tp.n; this.tipT = 0;
      this.tipT1.setScale(1).setText(tp.l1 || '');
      this.tipT2.setScale(1).setText(tp.l2 || '');
      const maxW = 420 - 40;
      for (const tx of [this.tipT1, this.tipT2]) if (tx.width > maxW) tx.setScale(Math.max(0.7, maxW / tx.width));
      const h2 = tp.l2 ? this.tipT2.displayHeight : 0;
      this.tipW = Math.min(W - 40, Math.max(220, Math.max(this.tipT1.displayWidth, h2 ? this.tipT2.displayWidth : 0) + 64));
      this.tipH = 24 + this.tipT1.displayHeight + (h2 ? 6 + h2 : 0) + 22;
      this.tipBg.setSize(this.tipW, this.tipH);
      this.tipT1.setPosition(0, h2 ? -this.tipH / 2 + 22 + this.tipT1.displayHeight / 2 : 0);
      this.tipT2.setVisible(!!h2).setPosition(0, this.tipT1.y + this.tipT1.displayHeight / 2 + 6 + h2 / 2);
      this.tipX.setPosition(this.tipW / 2 - 8, -this.tipH / 2 + 8);
      this.tipHit.setSize(this.tipW, this.tipH);
      if (this.tipHit.input && this.tipHit.input.hitArea) this.tipHit.input.hitArea.setTo(0, 0, this.tipW, this.tipH);
      this.tipC.setScale(0.8);
      ui.tweens.killTweensOf(this.tipC);
      ui.tweens.add({ targets: this.tipC, scale: 1, duration: 200, ease: 'Back.easeOut' });
      this.tapPh = -1;
    }
    this.tipT += dt;
    // the bubble: toward the middle of the screen from the button, its tail pointing at it
    const below = b.y < H * 0.35;
    const gap = b.noFinger ? 18 : 34;
    let by = below ? b.y + b.r + gap + this.tipH / 2 : b.y - b.r - gap - this.tipH / 2;
    if (b.noFinger) by = b.y - b.r - gap - this.tipH / 2;
    const bx = Math.max(20 + this.tipW / 2, Math.min(W - 20 - this.tipW / 2, b.x));
    // (playtest: the ⚙ tip's bubble lay over the goal panel) — outside the settings panel the bubble steps past the goal
    //  panel (below it when it hangs down from a top button); its tail then goes, the ring and the finger still say which
    let tail = true;
    const op = ui.objPanel;
    if (!inPanel && op && op.visible) {
      const ow = (ui.objBg && ui.objBg.width) || 400, oq = [op.x - ow / 2, op.y - 31, op.x + ow / 2, op.y + 31];
      if (hit([bx - this.tipW / 2, by - this.tipH / 2, bx + this.tipW / 2, by + this.tipH / 2], oq, 6)) { by = below ? oq[3] + 12 + this.tipH / 2 : oq[1] - 12 - this.tipH / 2; tail = false; }
    }
    this.tipTail.setVisible(tail);
    this.tipC.setVisible(true).setDepth(depth).setPosition(bx, by);
    const tx = Math.max(-this.tipW / 2 + 30, Math.min(this.tipW / 2 - 30, b.x - bx));
    if (below) this.tipTail.setFlipY(true).setOrigin(0.5, 1).setPosition(tx, -this.tipH / 2 + 4);
    else this.tipTail.setFlipY(false).setOrigin(0.5, 0).setPosition(tx, this.tipH / 2 - 4);
    this.tipBox = [bx - this.tipW / 2, by - this.tipH / 2, bx + this.tipW / 2, by + this.tipH / 2];
    // the ring round the button
    if (!b.noFinger) {
      const k = 1 + Math.sin(this.t * 7) * 0.06, d = (b.w ? Math.max(b.r * 2, Math.min(b.w, 140)) : b.r * 2) + 26;
      this.tipRing.setVisible(true).setDepth(depth - 1).setPosition(b.x, b.y).setScale(this.tipRing.__base * d * k, this.tipRing.__base * (b.w ? b.r * 2 + 26 : d) * k).setAlpha(0.9);
    } else this.tipRing.setVisible(false);
    // the gesture
    for (const f of this.fingers) f.setDepth(depth + 1);
    this.gBase.setVisible(false); this.gKnob.setVisible(false);
    if (b.noFinger || !tp.g) { for (const f of this.fingers) f.setVisible(false); this.fingerBox = null; return; }
    if (tp.g === 'pinch' && this.tipT < PINCH_T * 2) { this.pinch(this.tipT); return; }
    this.fingers[1].setVisible(false);
    this.tap(tp.g === 'pinch' ? this.btnPos('zoomOut') || b : b, tp.g === 'pinch' ? this.tipT - PINCH_T * 2 : this.tipT);
  }

  /** TAP: approach, press + ripple, release, a second tap, rest; up to 4 loops, then it rests on the rim */
  tap(b, tt) {
    const ui = this.ui, W = ui.W, H = ui.H;
    const dx = W / 2 - b.x, dy = H / 2 - b.y, d = Math.hypot(dx, dy) || 1;
    let tx = b.x + (dx / d) * 0.45 * b.r, ty = b.y + (dy / d) * 0.45 * b.r;
    let flip = b.x > W / 2;
    // (playtest: the finger covered the words it explains — 길 안내's chip, 마을 옮기기) a wide chip / button is tapped at
    //  its left end (its icon), the hand turned away to the left, the words stay clear
    if (b.w && b.w > 2 * b.r + 40) { tx = b.x - b.w / 2 + 26; ty = b.y + 4; flip = true; }
    const n = Math.floor(tt / TAP_T), lt = n >= 4 ? TAP_T : tt - n * TAP_T;
    const ph = n * 10 + (lt < 0.42 ? 0 : 1) + (lt < 0.94 ? 0 : 1);
    let x = tx, y = ty, a = 1, press = false;
    if (lt < 0.3) { const k = ease(lt / 0.3); x = tx + (flip ? -1 : 1) * 40 * (1 - k); y = ty + 40 * (1 - k); a = k; }
    else if (lt < 0.42) press = true;
    else if (lt < 0.82) { y = ty - 8; }
    else if (lt < 0.94) press = true;
    if (press && ph !== this.tapPh) { this.tapPh = ph; this.ripple(tx, ty); }
    this.finger(0, x, y, a, press, 1, 0, flip);
    const f = this.fingers[0];
    this.fingerBox = f.visible ? (() => { const q = f.getBounds(); return [q.x, q.y, q.right, q.bottom]; })() : null;
  }

  /** PINCH: two fingers spread from 40 to 160 px apart and close again, at a spot clear of the chief */
  pinch(tt) {
    const ui = this.ui, W = ui.W, H = ui.H;
    const cb = this.chiefBox();
    let cx = W / 2, cy = H * 0.5;
    if (hit([cx - 140, cy - 80, cx + 140, cy + 150], cb, 20)) cy = cb[1] > H * 0.5 ? H * 0.32 : H * 0.62;
    const lt = tt % PINCH_T;
    const k = lt < 0.7 ? ease(lt / 0.7) : lt < 1.0 ? 1 : lt < 1.7 ? 1 - ease((lt - 1.0) / 0.7) : 0;
    const half = (40 + 120 * k) / 2;
    const a = lt > 1.9 ? 1 - clamp01((lt - 1.9) / 0.3) : clamp01(lt / 0.15);
    // (one hand from the lower right pointing up-left, the other turned round from the upper left)
    this.finger(0, cx + half * 0.7, cy + half * 0.7, a, true, 0.9, 0, false);
    this.finger(1, cx - half * 0.7, cy - half * 0.7, a, true, 0.9, Math.PI, false);
    this.fingerBox = null;
  }

  // ------------------------------------------------------------------ the spotlight
  updateSpot(dt, sp) {
    // (the Canvas renderer cannot tint the hole, and without the ui7 hole a square cut-out would look broken: no dim then,
    //  the ring and the arrow still show the place)
    if (this.canvas || !this.spotHole) { this.spotC.setVisible(false); this.spotBox = null; return; }
    const ui = this.ui, W = ui.W, H = ui.H;
    let want = 0, cx = 0, cy = 0, R = 0;
    if (sp && !(this.ob && this.ob.mode === 'act1' && this.ob.collapsed)) {
      if (sp.ui === 'coins') { const top = 62 + View.safeTop; cx = 143; cy = top; R = 125; want = 1; }
      else if (sp.pts && sp.pts.length) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const o of sp.pts) { if (!o) continue; const s = this.sp(o.x, o.y - 30); x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x); y1 = Math.max(y1, s.y); }
        cx = (x0 + x1) / 2; cy = (y0 + y1) / 2;
        R = Math.max(110, Math.hypot(x1 - x0, y1 - y0) / 2 + 110 * (sp.pts.length > 1 ? 1 : 0.4) + (sp.pts.length > 1 ? 0 : 40));
        // never while he walks (the world must stay clear), never bigger than 45 % of the screen width
        want = Input.vec.mag > 0.05 || 2 * R > W * 0.45 ? 0 : 1;
      }
    }
    if (want) { this.spotX = cx; this.spotY = cy; this.spotRad = R; }
    this.spotA += want ? Math.min(1 - this.spotA, dt / 0.25) : -Math.min(this.spotA, dt / 0.2);
    if (this.spotA <= 0.01) { if (this.spotC.visible) this.spotC.setVisible(false); this.spotBox = null; return; }
    const S = this.spotRad * 1.3, x = this.spotX, y = this.spotY;
    const [a, b, c, d] = this.spotR;
    a.setPosition(-10, -10).setSize(W + 20, Math.max(0, y - S + 10));
    b.setPosition(-10, y + S).setSize(W + 20, Math.max(0, H - (y + S) + 10));
    c.setPosition(-10, y - S).setSize(Math.max(0, x - S + 10), 2 * S);
    d.setPosition(x + S, y - S).setSize(Math.max(0, W - (x + S) + 10), 2 * S);
    for (const r of this.spotR) r.setDisplaySize(r.width, r.height);
    if (this.spotHole) this.spotHole.setPosition(x, y).setDisplaySize(2 * S, 2 * S);
    this.spotC.setVisible(true).setAlpha(this.spotA);
    this.spotBox = [x - this.spotRad, y - this.spotRad, x + this.spotRad, y + this.spotRad];
  }

  /** the test hook's view: the screen boxes of the card, finger, ghost joystick, target, chief (logical px) */
  rects() {
    const ob = this.ob;
    if (!ob || ob.mode === 'off') return null;
    const t1 = this.t1, t2 = this.t2;
    return {
      screen: [this.ui.W, this.ui.H], slot: this.slot || null,
      card: this.cardC.visible && this.cardC.alpha > 0.5 ? this.cardBox : null,
      cardW: this.cardW || 0, textW: Math.max(t1.displayWidth, t2.visible ? t2.displayWidth : 0),
      finger: this.fingers[0].visible ? this.fingerBox : null,
      ghost: this.gBase.visible ? this.ghostC : null,
      target: this.targetBox(), chief: this.chiefBox(),
      tip: this.tipC.visible ? this.tipBox : null, skip: this.skipC.visible ? [this.skipC.x - 75, this.skipC.y - 26, this.skipC.x + 75, this.skipC.y + 26] : null,
      spot: this.spotC.visible ? this.spotBox : null,
    };
  }

  destroy() { /* scene objects go with the UI scene */ }
}
