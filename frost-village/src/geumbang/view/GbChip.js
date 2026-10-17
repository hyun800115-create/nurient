// GbChip (view, plan §6 + ui6 appLayout.hud): the HUD 금방 chip right under the v4.2 업무 chip — ui_gb_chip built at
// 64 tall and scaled 0.78125 (172 × 50 logical at (28, 445)), ui_icon_gb 36 px, "배달 중 3" / "주문 5" in 20 px navy, a
// gold dot when something is new, an invisible 88-tall hit rect that opens the 금방 앱 — and the 금방 toast
// (ui_gb_toast centred at (361, 148), 64 tall, ≤ 554 wide, icon 40, text 28; 3 s; it covers the v4.2 hint pill while
// it shows). Stand-ins: a code-drawn cream pill / dark toast.

import { DEPTH } from '../../systems/DepthSort.js';
import { Assets } from '../../core/Assets.js';
import { View } from '../../core/View.js';
import { frameOf, spriteOf, textStyle } from './art.js';
import { gt } from '../strings.js';

/** a ui6 nine-slice (untrimmed atlas frame) or null without the art */
export function nine(scene, key, w, h) {
  const d = Assets.m.nineSlice && Assets.m.nineSlice[key];
  const sp = Assets.def(key);
  const f = sp && sp.atlas ? frameOf(sp.atlas, sp.frame || key) : null;
  if (!d || !f || !scene.add.nineslice) return null;
  return scene.add.nineslice(0, 0, f.tex, f.frame, w, h, d.left, d.right, d.top, d.bottom);
}

export class GbChip {
  constructor(view) {
    this.view = view;
    const ui = this.ui = view.uiScene;
    const H = this.H = lay().hud;
    const C = H.chip;
    // (the HUD column sits under the notch inset like the v4.2 chips: View.safeTop)
    const st = this.st = View.safeTop || 0;
    this.c = ui.add.container(C.x, C.y + st).setDepth(DEPTH.TOP - 20).setVisible(false);
    const k = C.scale || 0.78125, w = C.w / k, h = 64;
    this.bg = nine(ui, 'ui_gb_chip', w, h);
    if (this.bg) this.bg.setOrigin(0, 0).setScale(k);
    else { this.bg = ui.add.graphics(); this.bg.fillStyle(0xfff7e6, 1).fillRoundedRect(0, 0, C.w, C.h, C.h / 2).lineStyle(3, 0xf2b33d, 1).strokeRoundedRect(0, 0, C.w, C.h, C.h / 2); }
    const ic = spriteOf('ui_icon_gb');
    this.icon = ic ? ui.add.image(C.icon[0], C.h / 2, ic.tex, ic.frame).setDisplaySize(C.icon[1], C.icon[1]) : null;
    this.text = ui.add.text(C.text[0], C.h / 2 + 1, '', textStyle(C.text[1] * 2, C.color || '#2B4F7E', '#ffffff', 0, '900')).setOrigin(0, 0.5).setScale(0.5);
    this.dot = ui.add.graphics();
    this.dot.fillStyle(0xd9962a, 1).fillCircle(C.dot[0], C.dot[1], C.dot[2]).fillStyle(0xf2b33d, 1).fillCircle(C.dot[0], C.dot[1], C.dot[2] - 2).lineStyle(2, 0xffffff, 1).strokeCircle(C.dot[0], C.dot[1], C.dot[2]);
    this.dot.setVisible(false);
    this.c.add([this.bg, this.icon, this.text, this.dot].filter(Boolean));
    // the hit rect (88 tall: ≥ 44 CSS)
    this.hit = ui.add.zone(C.hit[0], C.hit[1] + st, C.hit[2], C.hit[3]).setOrigin(0, 0).setDepth(DEPTH.TOP - 19);
    this.hit.setInteractive();
    this.hit.on('pointerdown', (p, lx, ly, ev) => { if (!this.c.visible) return; if (ev && ev.stopPropagation) ev.stopPropagation(); this.dot.setVisible(false); this.view.openApp('orders'); });
    this.bounceT = -1;
    this.lastTxt = '';
    // the toast
    const T = H.toast;
    this.tc = ui.add.container(T.centre[0], T.centre[1] + st).setDepth(DEPTH.TOP - 10).setVisible(false);
    this.tbg = null;
    const ti = spriteOf('ui_icon_gb');
    this.ticon = ti ? ui.add.image(0, 0, ti.tex, ti.frame).setDisplaySize(T.icon[1], T.icon[1]) : null;
    this.ttext = ui.add.text(0, 0, '', textStyle(T.text[1] * 2, T.color || '#3B3F52', '#ffffff', 0, '800')).setOrigin(0, 0.5).setScale(0.5);
    this.tc.add([this.ticon, this.ttext].filter(Boolean));
    this.toastT = 0;
  }

  /** the toast: "띵동! 새 주문 · 민지네 · 빵 3" (the host decides when) */
  toast(msg) {
    const T = this.H.toast, ui = this.ui;
    this.ttext.setWordWrapWidth(null).setScale(0.5).setText(msg);
    const tw = this.ttext.width * 0.5;
    const w = Math.min(T.wMax, Math.max(260, T.text[0] + tw + 30)), room = w - T.text[0] - 26;
    // too long for one line: a little smaller first, then two lines (the plate grows with them)
    let sc = 0.5;
    if (tw > room) { sc = Math.max(0.42, (0.5 * room) / tw); if (this.ttext.width * sc > room) this.ttext.setWordWrapWidth(room / sc, true); this.ttext.setScale(sc); }
    const h = Math.max(T.h, Math.ceil(this.ttext.height * sc + 22));
    if (this.tbg) this.tbg.destroy();
    this.tbg = nine(ui, 'ui_gb_toast', w, h);
    if (this.tbg) this.tbg.setOrigin(0.5, 0.5);
    else { this.tbg = ui.add.graphics(); this.tbg.fillStyle(0x2b2f3a, 0.86).fillRoundedRect(-w / 2, -h / 2, w, h, Math.min(h, T.h) / 2); }
    this.tc.addAt(this.tbg, 0);
    if (this.ticon) this.ticon.setPosition(-w / 2 + T.icon[0], 0);
    this.ttext.setPosition(-w / 2 + T.text[0], 1);
    this.tc.setVisible(true).setAlpha(1).setScale(0.9);
    this.toastT = (T.ms || 3000) / 1000;
    if (this.view.P.ui && this.view.P.ui.hidePill) this.view.P.ui.hidePill(this.toastT);
    return true;
  }

  ping() { if (!this.view.appOpen()) this.dot.setVisible(true); }
  bounce() { this.bounceT = 0; this.dot.setVisible(true); }

  update(dt) {
    const m = this.view.m, F = this.view.followV;
    // (after 정 할머니's parcel: the chip bounces in with the first-delivery toast, plan §3.3)
    const show = m.st === 2 && !!(m.seen & 2) && !this.view.host.firstToast && !(F.active && F.first) && !this.view.appOpen();
    this.c.setVisible(show);
    if (this.hit.input) this.hit.input.enabled = show;
    if (show) {
      const gone = m.orders.list.filter((o) => o.st === 'gone').length, open = m.orders.list.length;
      const L = this.view.lang();
      const txt = gone > 0 ? gt('gb_step_4', null, L) + ' ' + gone : gt('gb_tab_orders', null, L) + ' ' + open;
      if (txt !== this.lastTxt) { this.lastTxt = txt; this.text.setText(txt); const C = this.H.chip, room = C.w - C.text[0] - 14; this.text.setScale(Math.min(0.5, room / Math.max(1, this.text.width))); }
      if (this.bounceT >= 0) {
        this.bounceT += dt;
        const u = this.bounceT;
        const s = u < 0.18 ? 0.4 + u / 0.18 * 0.75 : u < 0.36 ? 1.15 - (u - 0.18) / 0.18 * 0.2 : 1;
        this.c.setScale(s);
        if (u > 0.4) { this.bounceT = -1; this.c.setScale(1); }
      }
    }
    if (this.toastT > 0) {
      this.toastT -= dt;
      this.tc.setScale(Math.min(1, this.tc.scale + dt * 2));
      if (this.toastT < 0.3) this.tc.setAlpha(Math.max(0, this.toastT / 0.3));
      if (this.toastT <= 0) this.tc.setVisible(false);
    }
  }

  objects() { return 8; }
  destroy() { this.c.destroy(); this.hit.destroy(); this.tc.destroy(); }
}

/** ui6 appLayout (manifest conventions) with the plan's numbers as the fallback */
export function lay() {
  const j = Assets.lateManifest && Assets.lateManifest.ui6;
  const c = j && j.conventions && j.conventions.appLayout;
  return c && c.hud && c.tabs ? c : DEFAULT_LAYOUT;
}

export const DEFAULT_LAYOUT = {
  panel: [720, 1100], screen: [21, 30, 678, 1040], notch: [360, 15.5],
  header: { rect: [21, 30, 678, 150], logo: [44, 46, 1], tagline: [52, 136, 28], close: [642, 92, 44], mascot: [540, 174, 1], mascotRunIn: { from: [763, 174], to: [540, 174], ms: 600 } },
  tabs: { y: 190, h: 88, w: 128, gap: 4, icon: 34, iconGap: 5, font: 28, fontEn: 26, scale: 1.375, colorOn: '#2B4F7E', colorOff: '#6B5D48' },
  content: [37, 290, 646, 780],
  card: { w: 646, h: 256, gap: 16, font: 30, small: 28, colorSecondary: '#6B5D48' },
  orderCard: { h: 348, trackerY: 152, button: [272, 240, 250], etaY: 284 },
  tracker: { y: 128, x0: 52, x1: 594, badge: 54, labelGap: 6, labelFont: 28, labelFontEn: 26, colorNow: '#2B4F7E', colorDone: '#3B3F52', colorOff: '#6B5D48' },
  button: { h: 88, scale: 1.375 }, toggle: { w: 112, h: 44, hitH: 88 },
  hud: {
    chip: { x: 28, y: 445, w: 172, h: 50, scale: 0.78125, icon: [27, 36], text: [52, 20], color: '#2B4F7E', dot: [160, 10, 8], hit: [28, 440, 172, 88] },
    toast: { centre: [361, 148], h: 64, wMax: 554, icon: [44, 40], text: [74, 28], color: '#3B3F52', ms: 3000 },
  },
};
