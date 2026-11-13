// (v4.3 step B, WP-T) the 읍장 취임 맛보기 cards (docs/redesign_v43/stepB/postdepot_addendum.md §5.3): the 「읍장」 title card
// (the badge, 「읍장」, 「서리읍의 읍장님, 축하드려요!」), then, in the same frame, the teaser card: 「다음 업데이트에서 열려요」, two
// locked rows tagged 「곧 열려요」 (읍장 수업 1 · 마을 경영 창, 지도에서 마을 돌보기), the footer 「진짜 취임식은 다음 업데이트에서
// 열려요」 and [좋아요]. No version number anywhere (BP-45).
//
//   - made on first use in the UI scene itself (src/systems/v43/EupTaste.js: `ui.eupTaste = ui.eupTaste || new
//     EupTasteCard(ui)`; gs.ui is the Game scene's UIProxy, it has no `add`); never mounted from UI.js (plan §3.1). Its
//     objects are built the first time it opens; it destroys itself on the UI scene's 'shutdown' (and lets go of
//     ui.eupTaste then: a restarted UI scene keeps the scene object) and lays itself out again on 'resize'
//   - the frame: a ui_panel min(W − 48, 600) wide, under the objective panel and under the banner's band (the taste's
//     own banner is up while the title card comes), clear of the right-hand HUD column (정기 납품 · 업무 · 마을 진도:
//     ui.rightBoxes) — narrower and left of it where it would reach it, else below it (G6). Texts are measured and fitted
//     as OnboardOverlay.fitCard does (shrink, then wrap)
//   - input: only [좋아요] takes a tap. The card itself takes none: a touch on it starts the joystick as anywhere in the
//     village (a drag can skip the scene, EupTaste)

import { Assets } from '../core/Assets.js';
import { View } from '../core/View.js';
import { panel } from '../core/Panel.js';
import { FONT, t } from '../data/strings.js';

const TXT = (size, color, weight = '900') => ({ fontFamily: FONT, fontSize: size + 'px', fontStyle: weight, color, resolution: 2 });
const DEPTH = 56;            // over the HUD chips (20) and toasts (50), under banners (60) and the flying badge (65)
const PAD = 26;              // inside margin
const MIN_W = 440;           // narrower than this beside the HUD column: the card goes below the column instead

/** an icon image (the first key that has art), `size` px on its longer side */
function icon(ui, keys, size) {
  const k = Assets.pick(...keys);
  const im = Assets.image(ui, 0, 0, k).setOrigin(0.5);
  im.setScale(size / Math.max(1, im.frame.realWidth, im.frame.realHeight));
  return im;
}

export class EupTasteCard {
  constructor(ui) {
    this.ui = ui;
    this.isOpen = false;
    this.phase = null;           // 'title' | 'teaser' while open
    this.c = null;               // the card's container (built on the first open)
    this.btn = null;             // [좋아요] (a UI button: its own depth, screen coordinates)
    this.onOk = null;            // EupTaste: [좋아요] tapped
    this.box = null;             // [l, t, r, b] on screen (logical px) while open
    this.lk = '';                // what the last layout was made for (screen, HUD column, phase)
    this.dead = false;
    this.onResize = () => { this.lk = ''; if (this.isOpen) this.layout(); };
    this.onShutdown = () => this.destroy();
    ui.scale.on('resize', this.onResize);
    ui.events.once('shutdown', this.onShutdown);
  }

  // ------------------------------------------------------------------ build (once)
  build() {
    const ui = this.ui;
    const c = this.c = ui.add.container(0, 0).setDepth(DEPTH).setVisible(false);
    this.bg = panel(ui, 0, 0, 'ui_panel', 600, 300).setOrigin(0.5);
    // the title card
    this.badge = icon(ui, ['ui_badge_rank_2', 'ui_icon_fame', 'ui_icon_title'], 96);
    this.title = ui.add.text(0, 0, '', TXT(46, '#2b2f3a')).setOrigin(0.5);
    this.cheer = ui.add.text(0, 0, '', TXT(26, '#4c5a6e', '800')).setOrigin(0.5);
    // the teaser card
    this.head = ui.add.text(0, 0, '', TXT(31, '#2b2f3a')).setOrigin(0.5);
    this.rows = [['ui_icon_office', 'ui_icon_work', 'ui_icon_house'], ['ui_icon_map', 'ui_icon_flag', 'ui_icon_house']].map((keys) => {
      const r = {};
      r.plate = ui.add.graphics();
      r.ic = icon(ui, keys, 48);
      r.lock = icon(ui, ['ui_icon_lock'], 24);
      r.tx = ui.add.text(0, 0, '', TXT(24, '#2b2f3a', '800')).setOrigin(0, 0.5);
      r.tagBg = ui.add.graphics();
      r.tag = ui.add.text(0, 0, '', TXT(19, '#ffffff', '900')).setOrigin(0.5);
      return r;
    });
    this.foot = ui.add.text(0, 0, '', TXT(20, '#6b7686', '800')).setOrigin(0.5);
    c.add([this.bg, this.badge, this.title, this.cheer, this.head]);
    for (const r of this.rows) c.add([r.plate, r.ic, r.lock, r.tx, r.tagBg, r.tag]);
    c.add(this.foot);
    this.btn = ui.makeButton(0, 0, 220, 70, 'blue', t('taste_ok'), () => this.ok(), 28);
    this.btn.setDepth(DEPTH + 1).setVisible(false);
  }

  // ------------------------------------------------------------------ open / close
  /** show the title card ('title') or the teaser card ('teaser') in the same frame */
  open(phase) {
    if (this.dead) return false;
    if (!this.c) this.build();
    const fresh = !this.isOpen;
    this.isOpen = true;
    this.phase = phase === 'teaser' ? 'teaser' : 'title';
    this.fill();
    this.lk = '';
    this.layout();
    const ui = this.ui, c = this.c;
    ui.tweens.killTweensOf(c);
    c.setVisible(true).setAlpha(1);
    c.setScale(fresh ? 0.8 : 0.94);
    ui.tweens.add({ targets: c, scale: 1, duration: fresh ? 260 : 180, ease: 'Back.easeOut' });
    return true;
  }

  close(instant) {
    if (!this.c || !this.isOpen) { this.isOpen = false; this.phase = null; return; }
    this.isOpen = false;
    this.phase = null;
    this.box = null;
    const ui = this.ui, c = this.c;
    if (this.btn) this.btn.setVisible(false);
    ui.tweens.killTweensOf(c);
    if (instant) { c.setVisible(false); return; }
    ui.tweens.add({ targets: c, alpha: 0, scale: 0.92, duration: 200, onComplete: () => { if (!this.isOpen && c.active) c.setVisible(false).setAlpha(1); } });
  }

  ok() { if (this.isOpen && this.phase === 'teaser' && this.onOk) this.onOk(); }

  // ------------------------------------------------------------------ texts and layout
  fill() {
    const T = this.phase === 'title';
    this.badge.setVisible(T); this.title.setVisible(T); this.cheer.setVisible(T);
    this.head.setVisible(!T); this.foot.setVisible(!T);
    for (const r of this.rows) for (const k of ['plate', 'ic', 'lock', 'tx', 'tagBg', 'tag']) r[k].setVisible(!T);
    if (T) { this.title.setText(t('rank_title_2')); this.cheer.setText(t('taste_cheer')); }
    else {
      this.head.setText(t('taste_next'));
      this.rows[0].tx.setText(t('taste_l1')); this.rows[1].tx.setText(t('taste_l2'));
      for (const r of this.rows) r.tag.setText(t('taste_tag'));
      this.foot.setText(t('taste_foot'));
      if (this.btn && this.btn.text) this.btn.text.setText(t('taste_ok'));
    }
  }

  /** a text at font size `s` within `maxW`: shrinks to `minK`, then wraps (OnboardOverlay.fitCard); its height */
  fit(tx, s, maxW, minK) {
    tx.setScale(1).setWordWrapWidth(null).setFontSize(s);
    if (tx.width > maxW) {
      if (tx.width * (minK || 0.8) <= maxW) tx.setScale(maxW / tx.width);
      else tx.setScale(minK || 0.8).setWordWrapWidth(maxW / (minK || 0.8), true).setAlign('center');
    }
    return tx.displayHeight;
  }

  /** the frame on screen: { cx, y0, cw } (y0 = the card's top) for a card `ch` tall that wants `cw0` */
  frame(cw0, ch) {
    const ui = this.ui, W = ui.W, top = 62 + View.safeTop;
    const objB = top + 88 + 31;                          // the objective panel's lower edge (UI.layout)
    const banB = ui.H * 0.27 + 80 + 26;                  // the banner's band: its title plate and its subtitle pill
    let y0 = Math.max(objB, banB) + 14;
    let cw = cw0, cx = W / 2;
    // the right-hand column's chips the card would reach (they sit under the clock, top to bottom)
    const bx = ui.rightBoxes || [], n = ui.rightN || 0;
    let L = Infinity, B = -Infinity;
    for (let i = 0; i < n; i++) { const o = bx[i]; if (o && o.b + 10 > y0 && o.t - 10 < y0 + ch) { L = Math.min(L, o.l); B = Math.max(B, o.b); } }
    if (Number.isFinite(L) && cx + cw / 2 > L - 12) {
      const room = L - 12 - 24;
      if (room >= MIN_W) { cw = Math.min(cw0, room); cx = 24 + room / 2; }
      else y0 = B + 14;                                  // too narrow beside it: below the column, full width
    }
    return { cx, y0, cw };
  }

  /** lay the card out for the screen as it is now (again only when the screen, the HUD column or the phase changed) */
  layout() {
    if (!this.c || !this.isOpen) return;
    const ui = this.ui, W = ui.W;
    const bx = ui.rightBoxes || [], n = ui.rightN || 0;
    let col = '';
    for (let i = 0; i < n; i++) col += Math.round(bx[i].l) + ',' + Math.round(bx[i].t) + ',' + Math.round(bx[i].b) + ';';
    const key = W + 'x' + ui.H + '|' + View.safeTop + '|' + col + '|' + this.phase;
    if (key === this.lk) return;
    this.lk = key;
    const cw0 = Math.min(W - 48, 600);
    // two passes: the height at the full width says whether the column is reached; then the final width
    let ch = this.measure(cw0);
    let f = this.frame(cw0, ch);
    if (f.cw !== cw0) { ch = this.measure(f.cw); f = this.frame(cw0, ch); }
    if (f.cw !== cw0) ch = this.measure(f.cw);
    this.bg.setSize(f.cw, ch);
    this.c.setPosition(Math.round(f.cx), Math.round(f.y0 + ch / 2));
    this.box = [Math.round(f.cx - f.cw / 2), Math.round(f.y0), Math.round(f.cx + f.cw / 2), Math.round(f.y0 + ch)];
    if (this.btn) {
      const show = this.phase === 'teaser';
      this.btn.setVisible(show);
      if (show) this.btn.setPosition(Math.round(f.cx), Math.round(f.y0 + ch - 22 - 35));
    }
  }

  /** place the texts of the current phase for a card `cw` wide (local coordinates); returns its height */
  measure(cw) {
    const inner = cw - PAD * 2;
    if (this.phase === 'title') {
      const hT = this.fit(this.title, 46, inner, 0.7);
      const hC = this.fit(this.cheer, 26, inner, 0.8);
      const inH = 96 + 6 + hT + 6 + hC, ch = Math.max(250, 24 + inH + 26);
      let y = -inH / 2 + (24 - 26) / 2;                      // (the content centred, a little higher than the middle)
      this.badge.setPosition(0, y + 48); y += 96 + 6;
      this.title.setPosition(0, y + hT / 2); y += hT + 6;
      this.cheer.setPosition(0, y + hC / 2);
      return ch;
    }
    // the teaser: header, two locked rows, footer, [좋아요]
    const hH = this.fit(this.head, 31, inner, 0.75);
    const IC = 48, gap = 14, tx0 = IC + gap;                 // the row text starts right of its icon
    const rows = this.rows.map((r) => {
      const tagW = Math.max(96, (r.tag.setScale(1), r.tag.width) + 26), tagH = 34;
      const textMax = inner - tx0;
      r.tx.setScale(1).setWordWrapWidth(null).setFontSize(24);
      // the tag sits at the row's right end when it fits there, else under the text
      const side = r.tx.width + 14 + tagW <= textMax;
      const hX = this.fit(r.tx, 24, side ? textMax - 14 - tagW : textMax, 0.8);
      r.tx.setAlign('left');
      return { r, side, tagW, tagH, hX, h: Math.max(IC + 12, side ? hX + 16 : hX + 6 + tagH + 14) };
    });
    const hF = this.fit(this.foot, 20, inner, 0.85);
    const BTN = 70;
    const ch = 22 + hH + 14 + rows.reduce((s, q) => s + q.h + 8, 0) + 4 + hF + 14 + BTN + 22;
    let y = -ch / 2 + 22;
    this.head.setPosition(0, y + hH / 2); y += hH + 14;
    const L = -cw / 2 + PAD;
    for (const q of rows) {
      const { r } = q;
      const cy = y + q.h / 2;
      // a soft plate under the row (locked: greyed blue)
      r.plate.clear();
      r.plate.fillStyle(0xe9eef5, 1); r.plate.fillRoundedRect(L - 10, y, cw - PAD * 2 + 20, q.h, 16);
      r.ic.setPosition(L + IC / 2, cy).setAlpha(0.85);
      r.lock.setPosition(L + IC - 4, cy + IC / 2 - 8);
      const tx = L + tx0;
      const tagY = q.side ? cy : y + 8 + q.hX + 6 + q.tagH / 2;
      r.tx.setPosition(tx, q.side ? cy : y + 8 + q.hX / 2);
      const tagX = q.side ? L + (cw - PAD * 2) - q.tagW / 2 : tx + q.tagW / 2;
      r.tagBg.clear();
      r.tagBg.fillStyle(0x7f8da3, 1); r.tagBg.fillRoundedRect(tagX - q.tagW / 2, tagY - q.tagH / 2, q.tagW, q.tagH, q.tagH / 2);
      r.tag.setPosition(tagX, tagY - 1);
      y += q.h + 8;
    }
    y += 4;
    this.foot.setPosition(0, y + hF / 2);
    return ch;
  }

  /** every frame while the scene runs (EupTaste): follows the HUD column / a resize */
  tick() { if (this.isOpen) this.layout(); }

  /** test hooks: what is shown and where (screen, logical px) */
  state() {
    const vis = (o) => !!(o && o.visible);
    const texts = [];
    if (this.c && this.isOpen) {
      if (this.phase === 'title') texts.push(this.title.text, this.cheer.text);
      else { texts.push(this.head.text); for (const r of this.rows) texts.push(r.tx.text, r.tag.text); texts.push(this.foot.text); if (this.btn && this.btn.text) texts.push(this.btn.text.text); }
    }
    const b = this.btn;
    return {
      open: this.isOpen, phase: this.phase, shown: vis(this.c) && this.c.alpha > 0.5, box: this.box ? this.box.slice() : null, texts,
      btn: b && b.visible ? { x: Math.round(b.x), y: Math.round(b.y), w: 220, h: 70 } : null,
      screen: [this.ui.W, this.ui.H],
    };
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.isOpen = false;
    const ui = this.ui;
    try { ui.scale.off('resize', this.onResize); } catch (e) { /* */ }
    try { ui.events.off('shutdown', this.onShutdown); } catch (e) { /* */ }
    try { if (this.c) this.c.destroy(); } catch (e) { /* */ }
    try { if (this.btn) this.btn.destroy(); } catch (e) { /* */ }
    this.c = null; this.btn = null;
    if (ui.eupTaste === this) ui.eupTaste = null;
  }
}
