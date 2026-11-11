// (v4.3 마을 깃발) 「우리 마을 깃발」 — the flag maker (UI scene objects, depth 95), the one-time card for an old village and
// the settings row. Looks like the game's other panels (ui_panel, the UI's own buttons).
//
//   modes  'new'   right after 새로 시작 (VillageFlags.armMaker): a random flag to start with, 「이대로 시작」 (or back) starts
//                  the game with what is shown. The Game scene is paused under it, so the tutorial starts after.
//          'edit'  설정 › 놀이 › 「마을 깃발」 / 'card' the one-time card's 만들기: 「완료」, ✕ / back = keep the old flag.
//   layout title + hint · a big preview flag waving on its pole · [the chief's name: v4.4, NAME_SLOT] · tabs 모양 / 무늬 / 그림
//          · that tab's choices (cells >= 92 logical px) + its 12 colours · 🎲 다시 섞기 + 이대로 시작 / 완료.
//          Fits 720 x 1280 (360 x 640) .. 720 x 1600 (412 x 915); the extra height goes to the preview and the gaps.
//   cost   while open: the preview texture (fv_flag_big, 1.5x its display size) and the option sheet (fv_flag_ui); both go
//          when it closes. The Game is paused (like 설정); its loader is ticked from here so the village's files keep coming.
import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { Input } from '../core/Input.js';
import { View } from '../core/View.js';
import { panel } from '../core/Panel.js';
import { Back } from '../core/Back.js';
import { FONT } from '../data/strings.js';
import { COLORS, SHAPES, PATTERNS, EMBLEMS, plain, randomFlag, drawFlag, drawEmblem, hexOf, sameFlag, describe, luminance } from './design.js';
import { ft } from './strings.js';

const TXT = (size, color = '#ffffff', stroke = '#2b2f3a', st = 7, weight = '900') => ({
  fontFamily: FONT, fontSize: size + 'px', fontStyle: weight, color, stroke, strokeThickness: st, resolution: 2,
});
const BIG = 'fv_flag_big', SHEET = 'fv_flag_ui';
const NAME_SLOT = 0;          // (v4.4) the chief's name row goes between the preview and the tabs: its height here
const CONTENT = 590;          // the tallest tab's options + colours (logical px)
const RATIO = 1.58;           // flag width / height
const TABS = [['shape', 'flag_tab_shape'], ['pattern', 'flag_tab_pattern'], ['emblem', 'flag_tab_emblem']];
const TAB_W = 204, TAB_H = 88;  // a tab: >= 88 logical px tall = 44 CSS px on a 360-wide phone (a finger, not a fingertip)
const GOLD = 0xffc83d;
const BIG_S = 1.5;            // preview texture px per logical px
const SHEET_S = 1.5;
// the option sheet: slot sizes (logical px) per kind
const SLOT = { shape: [104, 64], pattern: [84, 52], emblem: [64, 64] };

/** a little flag on a pole (the settings row / the card): a picture of the shared world texture + a drawn pole */
function flagIcon(ui, x, y, size) {
  const c = ui.add.container(x, y);
  const g = ui.add.graphics();
  const h = size, pw = Math.max(3, size * 0.07);
  g.fillStyle(0x1f3354, 0.18); g.fillEllipse(-size * 0.28, h * 0.48, size * 0.42, size * 0.12);
  g.fillStyle(0xdfe3ea, 1); g.fillRect(-size * 0.3 - pw / 2, -h * 0.46, pw, h * 0.94);
  g.fillStyle(0xf2c048, 1); g.fillCircle(-size * 0.3, -h * 0.47, pw * 0.95);
  c.add(g);
  if (ui.textures.exists('fv_flag')) {
    const im = ui.add.image(-size * 0.3 + pw / 2 - 1, -h * 0.42, 'fv_flag', 'full').setOrigin(0, 0);
    im.setScale((size * 0.66) / Math.max(1, im.frame.realWidth));
    c.add(im);
  }
  return c;
}

export class FlagMaker {
  /** open the maker (mode 'new' | 'edit' | 'card'); false when it cannot open now (it says why) */
  static open(ui, vf, mode) {
    if (!ui || !ui.ready || !vf) return false;
    const m = ui.flagMaker || (ui.flagMaker = new FlagMaker(ui));
    return m.show(vf, mode || 'edit');
  }
  /** the one-time card of an old village */
  static card(ui, vf) {
    if (!ui || !ui.ready) return false;
    const m = ui.flagMaker || (ui.flagMaker = new FlagMaker(ui));
    return m.showCard(vf);
  }
  /** 설정 › 놀이: the 「마을 깃발」 row (UI.buildPlayTab's row() + add()) */
  static flagRow(ui, row, y, add, h) {
    const gs = ui.gs, vf = gs && gs.flags;
    const wait = !vf || vf.inTutorial() || (gs.v4 && gs.v4.rank && gs.v4.rank.ceremonyOn);
    const b = row(y, ft('set_flag'), ft('set_flag_btn'), wait ? 'gray' : 'blue', () => {
      if (!vf) return;
      if (vf.inTutorial()) { ui.toast(ft('flag_wait')); return; }
      if (gs.v4 && gs.v4.rank && gs.v4.rank.ceremonyOn) { ui.toast(ft('flag_busy')); return; }
      FlagMaker.open(ui, vf, 'edit');
    }, undefined, h);
    b.flagBtn = true;
    add(flagIcon(ui, ui.W / 2 - 200, y, 56));
    return b;
  }

  constructor(ui) {
    this.ui = ui;
    this.c = null;
    this.cardC = null;
    this.onBack = () => this.back();
    this.onUpdate = (time, delta) => this.tick(delta / 1000);
    this.onResize = () => { if (this.c) this.rebuild(); if (this.cardC) this.placeCard(); };
    // (Escape on a computer: a tick later, so a second Escape handler that calls Back.handle() — res_wt's residents
    //  window — closes this first and the next one finds it gone)
    this.onEsc = () => { if (this.c || this.cardC) ui.time.delayedCall(0, () => this.back()); };
    ui.events.once('shutdown', () => this.destroy());
  }

  // ------------------------------------------------------------------ open / close
  show(vf, mode) {
    const ui = this.ui, gs = ui.gs;
    if (this.c) return false;
    if (mode !== 'new') {
      if (vf.inTutorial()) { ui.toast(ft('flag_wait')); return false; }
      if (gs.v4 && gs.v4.rank && gs.v4.rank.ceremonyOn) { ui.toast(ft('flag_busy')); return false; }
      if (ui.panelOpen && ui.panel) ui.closeSettings(true, true);         // from 설정: the settings make way, the game stays paused
      if (ui.panelOpen || ui.buildOpen || ui.v4PanelOpen || ui.v42PanelOpen || ui.adminOpen) { ui.toast(ft('flag_busy')); return false; }
    }
    this.hideCard(true);
    this.vf = vf;
    this.mode = mode;
    this.spec = plain(vf.spec);
    this.orig = plain(vf.spec);
    this.tab = 'shape';
    this.T = 0; this.acc = 0;
    ui.panelOpen = true;
    Input.release();
    ui.pauseGame();
    this.build();
    Back.push(this.onBack);
    ui.events.on('update', this.onUpdate);
    ui.scale.on('resize', this.onResize);
    const kb = ui.input && ui.input.keyboard;
    if (kb) kb.on('keydown-ESC', this.onEsc);
    if (typeof window !== 'undefined' && window.__FV) window.__FV.flagMakerOpen = true;
    return true;
  }

  /** back / Escape: a new game starts with the flag shown; an edit is cancelled */
  back() {
    if (this.c) { if (this.mode === 'new') this.finish(true); else this.finish(false); return true; }
    if (this.cardC) { this.hideCard(); return true; }
    return false;
  }

  finish(commit) {
    const ui = this.ui, vf = this.vf;
    if (!this.c) return;
    let changed = false;
    if (commit) changed = vf.commit(this.spec, this.mode);
    this.close();
    if (commit && changed && this.mode !== 'new') ui.toast(ft('flag_saved'), undefined, { keep: true });   // (not replaced by one the resumed game makes at once)
  }

  close() {
    const ui = this.ui;
    if (!this.c) return;
    this.c.destroy();
    this.c = null;
    this.strips = null;
    Back.pop(this.onBack);
    ui.events.off('update', this.onUpdate);
    ui.scale.off('resize', this.onResize);
    const kb = ui.input && ui.input.keyboard;
    if (kb) kb.off('keydown-ESC', this.onEsc);
    for (const k of [BIG, SHEET]) if (ui.textures.exists(k)) ui.textures.remove(k);
    ui.panelOpen = false;
    if (!ui.buildOpen) ui.resumeGame();
    if (typeof window !== 'undefined' && window.__FV) window.__FV.flagMakerOpen = false;
  }

  rebuild() { const tab = this.tab; if (this.c) { this.c.destroy(); this.c = null; } this.tab = tab; this.build(); }

  /** the UI scene shuts down (a new game, a reload of the scene): its emitters outlive it, so every listener goes */
  destroy() {
    const ui = this.ui;
    try { Back.pop(this.onBack); } catch (e) { /* */ }
    ui.events.off('update', this.onUpdate);
    if (this.onCardTick) ui.events.off('update', this.onCardTick);
    ui.scale.off('resize', this.onResize);
    const kb = ui.input && ui.input.keyboard;
    if (kb) kb.off('keydown-ESC', this.onEsc);
    this.c = null; this.cardC = null; this.strips = null;
    if (typeof window !== 'undefined' && window.__FV) { window.__FV.flagMakerOpen = false; window.__FV.flagCard = false; }
    ui.flagMaker = null;
  }

  // ------------------------------------------------------------------ layout
  build() {
    const ui = this.ui, W = ui.W, H = ui.H, cx = W / 2;
    const top = View.safeTop + 12, bot = H - View.safeBottom - 12;
    const PW = 690, PH = bot - top;
    const c = ui.add.container(0, 0).setDepth(95);
    this.c = c;
    this.hit = {};
    const dim = ui.add.rectangle(W / 2, H / 2, W * 2, H * 2, 0x1b2638, 0.55).setInteractive();
    dim.on('pointerdown', () => {});
    c.add(dim);
    c.add(panel(ui, cx, top + PH / 2, 'ui_panel', PW, PH).setOrigin(0.5));
    c.add(ui.add.text(cx, top + 50, ft('flag_title'), TXT(42, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0.5));
    const hint = ui.add.text(cx, top + 92, ft('flag_hint'), TXT(20, '#6b7686', '#ffffff', 0, '700')).setOrigin(0.5);
    if (hint.width > PW - 60) hint.setScale((PW - 60) / hint.width);
    c.add(hint);
    if (this.mode !== 'new') {
      const x = ui.makeIconButton(cx + PW / 2 - 50, top + 50, 'ui_icon_close', 70, () => this.finish(false));
      c.add(x);
      this.hit.close = { x: cx + PW / 2 - 50, y: top + 50, w: 70, h: 70 };
    }
    // ---- the preview
    // the preview takes what the tallest tab (그림: 3 rows of pictures + 2 of colours, CONTENT px) leaves: 230 .. 420 px
    const pvTop = top + 118;
    const by0 = bot - 70;
    const pvH = Math.max(230, Math.min(420, Math.round(by0 - 52 - 16 - CONTENT - (pvTop + NAME_SLOT + 18 + TAB_H + 16) - 14)));
    this.buildPreview(c, cx, pvTop, PW - 48, pvH);
    // ---- (v4.4) the chief's name row: NAME_SLOT px here
    const tabY = pvTop + pvH + NAME_SLOT + 18 + TAB_H / 2;
    this.tabBtns = TABS.map(([id, key], i) => {
      const x = cx + (i - 1) * 216, on = this.tab === id;
      const b = ui.makeButton(x, tabY, TAB_W, TAB_H, on ? 'blue' : 'gray', ft(key), () => { if (this.tab !== id) { this.tab = id; this.buildTab(); } }, 30);
      if (b.text.width > 180) b.text.setScale(180 / b.text.width);
      b.tabId = id;
      c.add(b);
      return b;
    });
    this.hit.tabs = TABS.map(([id], i) => ({ id, x: cx + (i - 1) * 216, y: tabY, w: TAB_W, h: TAB_H }));
    // ---- the bottom buttons
    const by = bot - 70;
    const sh = ui.makeButton(cx - 190, by, 250, 96, 'blue', '', () => this.shuffle(), 30);
    const dice = ui.add.graphics();
    dice.fillStyle(0xffffff, 1); dice.fillRoundedRect(-14, -14, 28, 28, 6);
    dice.fillStyle(0x2a64a8, 1); for (const [px, py] of [[-7, -7], [7, 7], [0, 0], [7, -7], [-7, 7]]) dice.fillCircle(px, py, 2.6);
    dice.setPosition(-76, -2).setAngle(-12);
    sh.add(dice);
    sh.text.setText(ft('flag_shuffle')).setX(22);
    if (sh.text.width > 160) sh.text.setScale(160 / sh.text.width);
    c.add(sh);
    const st = ui.makeButton(cx + 130, by, 370, 104, 'green', ft(this.mode === 'new' ? 'flag_start' : 'flag_done'), () => this.finish(true), 36);
    if (st.text.width > 330) st.text.setScale(330 / st.text.width);
    c.add(st);
    this.hit.shuffle = { x: cx - 190, y: by, w: 250, h: 96 };
    this.hit.start = { x: cx + 130, y: by, w: 370, h: 104 };
    this.area = { x0: cx - (PW - 48) / 2, x1: cx + (PW - 48) / 2, y0: tabY + TAB_H / 2 + 16, y1: by - 52 - 16 };
    this.buildTab();
    this.drawBig();
  }

  buildPreview(c, cx, y0, w, h) {
    const ui = this.ui;
    const g = ui.add.graphics();
    g.fillStyle(0xcfe4f6, 1); g.fillRoundedRect(cx - w / 2, y0, w, h, 22);
    g.fillStyle(0xe4f0fb, 1); g.fillRoundedRect(cx - w / 2, y0, w, h * 0.55, { tl: 22, tr: 22, bl: 0, br: 0 });
    g.fillStyle(0xffffff, 0.55);
    for (const [fx, fy, r] of [[0.08, 0.18, 4], [0.9, 0.12, 3], [0.82, 0.62, 3.5], [0.15, 0.7, 3], [0.6, 0.08, 2.5], [0.95, 0.45, 2.5]]) g.fillCircle(cx - w / 2 + w * fx, y0 + h * fy, r);
    // the flag: as big as the box allows, its pole on the left
    const fh = Math.min(Math.round((h - 74) * 0.98), Math.round((w - 170) / RATIO));
    const fw = Math.round(fh * RATIO);
    const poleX = cx - fw / 2 - 30, fx = poleX + 6, fy = y0 + 40;
    // snow mound + pole + finial
    g.fillStyle(0xffffff, 1); g.fillEllipse(poleX + 4, y0 + h - 18, 150, 34);
    g.fillStyle(0xdfe3ea, 1); g.fillRect(poleX - 5, fy - 14, 10, y0 + h - 30 - (fy - 14));
    g.fillStyle(0xb7bfcb, 1); g.fillRect(poleX + 2, fy - 14, 3, y0 + h - 30 - (fy - 14));
    g.fillStyle(0xf2c048, 1); g.fillCircle(poleX, fy - 20, 10);
    g.fillStyle(0xfff1b8, 1); g.fillCircle(poleX - 3, fy - 23, 3.5);
    c.add(g);
    this.big = { fx, fy, fw, fh, n: 96 };      // (96 narrow strips: the wave's steps stay under ~1 px on the big flag)
    // the preview texture (the flag unskewed, BIG_S x): strips of it wave like the village's
    const tw = Math.ceil(fw * BIG_S) + 4, th = Math.ceil(fh * BIG_S) + 4;
    if (ui.textures.exists(BIG)) ui.textures.remove(BIG);
    const tex = ui.textures.createCanvas(BIG, tw, th);
    const n = this.big.n;
    for (let i = 0; i < n; i++) tex.add('s' + i, 0, 2 + (i * fw * BIG_S) / n, 0, (fw * BIG_S) / n, th);
    this.strips = [];
    for (let i = 0; i < n; i++) {
      const im = ui.add.image(fx + (i * fw) / n, fy - 2 / BIG_S, BIG, 's' + i).setOrigin(0, 0).setScale(1 / BIG_S);
      this.strips.push(im);
      c.add(im);
    }
    // the pole in front of the hoist
    const g2 = ui.add.graphics();
    g2.fillStyle(0xdfe3ea, 1); g2.fillRect(poleX - 5, fy - 10, 10, fh + 24);
    g2.fillStyle(0xb7bfcb, 1); g2.fillRect(poleX + 2, fy - 10, 3, fh + 24);
    c.add(g2);
    this.bigY0 = fy - 2 / BIG_S;
    this.hit.preview = { x: cx, y: y0 + h / 2, w, h };
  }

  /** the preview texture for the current flag */
  drawBig() {
    const ui = this.ui, B = this.big;
    if (!B || !ui.textures.exists(BIG)) return;
    const tex = ui.textures.get(BIG), ctx = tex.context;
    ctx.clearRect(0, 0, tex.width, tex.height);
    drawFlag(ctx, this.spec, 2, 2, B.fw * BIG_S, B.fh * BIG_S);
    tex.refresh();
  }

  /** the current tab's choices + colours */
  buildTab() {
    const ui = this.ui, c = this.c;
    if (this.tabC) this.tabC.destroy();
    const tc = ui.add.container(0, 0);
    c.add(tc);
    this.tabC = tc;
    for (const b of this.tabBtns) {
      const on = b.tabId === this.tab;
      b.bg.destroy();
      const nb = panel(ui, 0, 0, 'ui_button_' + (on ? 'blue' : 'gray'), TAB_W, TAB_H).setOrigin(0.5);
      b.addAt(nb, 0); b.bg = nb;
      b.text.setStyle(on ? TXT(30, '#ffffff', 'rgba(0,0,0,0.25)', 4, '900') : TXT(30, '#ffffff', '#4a5361', 6, '900'));
      b.setAlpha(on ? 1 : 0.86);
    }
    const A = this.area, cx = (A.x0 + A.x1) / 2;
    const field = { shape: 's', pattern: 'p', emblem: 'e' }[this.tab];
    const colorField = { shape: 'b', pattern: 'pc', emblem: 'ec' }[this.tab];
    const colorLabel = { shape: 'flag_bg', pattern: 'flag_pc', emblem: 'flag_ec' }[this.tab];
    const n = { shape: SHAPES.length, pattern: PATTERNS.length, emblem: EMBLEMS.length }[this.tab];
    const perRow = { shape: 5, pattern: 6, emblem: 5 }[this.tab];
    const cw = { shape: 118, pattern: 98, emblem: 114 }[this.tab], ch = { shape: 104, pattern: 96, emblem: 92 }[this.tab], gap = 10;
    const rows = Math.ceil(n / perRow);
    const SW = 6, sw = 96, sh = 88, sg = 10;
    const LBL = 40;
    const need = LBL + rows * ch + (rows - 1) * gap + 22 + LBL + 2 * sh + sg;
    const free = Math.max(0, A.y1 - A.y0 - need);
    let y = A.y0 + free * 0.4;
    // the choices
    const lbl = (txt, yy) => tc.add(ui.add.text(A.x0 + 6, yy, txt, TXT(26, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0, 0.5));
    lbl(ft({ shape: 'flag_tab_shape', pattern: 'flag_tab_pattern', emblem: 'flag_tab_emblem' }[this.tab]), y + LBL / 2 - 4);
    y += LBL;
    this.cells = [];
    const g = ui.add.graphics();
    tc.add(g);
    this.cellG = g;
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / perRow), k = i % perRow, inRow = Math.min(perRow, n - r * perRow);
      const x = cx + (k - (inRow - 1) / 2) * (cw + gap), yy = y + r * (ch + gap) + ch / 2;
      this.cells.push({ field, v: i, x, y: yy, w: cw, h: ch, kind: this.tab });
    }
    y += rows * ch + (rows - 1) * gap + 22 + free * 0.2;
    // the colours
    lbl(ft(colorLabel), y + LBL / 2 - 4);
    y += LBL;
    for (let i = 0; i < COLORS.length; i++) {
      const r = Math.floor(i / SW), k = i % SW;
      const x = cx + (k - (SW - 1) / 2) * (sw + sg), yy = y + r * (sh + sg) + sh / 2;
      this.cells.push({ field: colorField, v: i, x, y: yy, w: sw, h: sh, kind: 'color' });
    }
    // the option pictures (one sheet) + tap zones
    this.drawSheet();
    for (const q of this.cells) {
      if (q.kind !== 'color') {
        const fr = 'o' + q.v;
        if (ui.textures.exists(SHEET) && ui.textures.get(SHEET).has(fr)) {
          const im = ui.add.image(q.x, q.y, SHEET, fr).setOrigin(0.5).setScale(1 / SHEET_S);
          tc.add(im);
          q.img = im;
        }
      }
      const z = ui.add.zone(q.x, q.y, q.w, q.h).setInteractive({ useHandCursor: true });
      z.on('pointerdown', () => this.pick(q.field, q.v));
      tc.add(z);
    }
    this.hit.cells = this.cells.map((q) => ({ field: q.field, v: q.v, x: q.x, y: q.y, w: q.w, h: q.h }));
    this.drawCells();
  }

  /** the option pictures for the current tab in the current colours (shape: the whole flag in that shape; pattern: the
   *  pattern on the current shape; emblem: the emblem on a chip of the field colour) */
  drawSheet() {
    const ui = this.ui, kind = this.tab;
    const n = { shape: SHAPES.length, pattern: PATTERNS.length, emblem: EMBLEMS.length }[kind];
    const [sw, sh] = SLOT[kind];
    const pw = Math.ceil(sw * SHEET_S) + 4, ph = Math.ceil(sh * SHEET_S) + 4;
    const tw = pw * Math.min(n, 7), th = ph * Math.ceil(n / 7);
    let tex = ui.textures.exists(SHEET) ? ui.textures.get(SHEET) : null;
    if (tex && (tex.width !== tw || tex.height !== th || tex.__kind !== kind)) {
      // (the pictures on screen keep the old frames until rebuilt: they are rebuilt right after, in buildTab)
      if (tex.__kind !== kind || tex.width !== tw || tex.height !== th) { ui.textures.remove(SHEET); tex = null; }
    }
    if (!tex) {
      tex = ui.textures.createCanvas(SHEET, tw, th);
      tex.__kind = kind;
      for (let i = 0; i < n; i++) tex.add('o' + i, 0, (i % 7) * pw, Math.floor(i / 7) * ph, pw, ph);
    }
    const ctx = tex.context, S = SHEET_S;
    ctx.clearRect(0, 0, tw, th);
    for (let i = 0; i < n; i++) {
      const ox = (i % 7) * pw + 2, oy = Math.floor(i / 7) * ph + 2, w = sw * S, h = sh * S;
      const f = Object.assign({}, this.spec);
      if (kind === 'shape') { f.s = i; drawFlag(ctx, f, ox + (w - h * RATIO) / 2, oy, h * RATIO, h); }
      else if (kind === 'pattern') { f.p = i; f.e = 0; drawFlag(ctx, f, ox + (w - h * RATIO) / 2, oy, h * RATIO, h); }
      else {
        // a chip of the field colour, the emblem on it (none: a soft ∅)
        ctx.save();
        ctx.fillStyle = hexOf(this.spec.b);
        ctx.beginPath(); ctx.arc(ox + w / 2, oy + h / 2, h * 0.48, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 2 * S; ctx.strokeStyle = 'rgba(30,40,60,0.25)'; ctx.stroke();
        if (i === 0) {
          ctx.strokeStyle = luminance(this.spec.b) > 0.35 ? 'rgba(50,60,80,0.6)' : 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3.5 * S; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(ox + w / 2, oy + h / 2, h * 0.26, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(ox + w / 2 - h * 0.2, oy + h / 2 + h * 0.2); ctx.lineTo(ox + w / 2 + h * 0.2, oy + h / 2 - h * 0.2); ctx.stroke();
        } else drawEmblem(ctx, i, ox + w / 2, oy + h / 2, h * 0.32, hexOf(this.spec.ec), hexOf(this.spec.b));
        ctx.restore();
      }
    }
    tex.refresh();
  }

  /** the cells' cards, the colour dots and the gold ring on the chosen ones */
  drawCells() {
    const g = this.cellG;
    if (!g) return;
    g.clear();
    for (const q of this.cells) {
      const on = this.spec[q.field] === q.v;
      if (q.kind === 'color') {
        const r = Math.min(q.w, q.h) * 0.38;
        if (on) { g.fillStyle(GOLD, 1); g.fillCircle(q.x, q.y, r + 9); }
        g.fillStyle(0x1f3354, 0.18); g.fillCircle(q.x, q.y + 3, r + 2);
        g.fillStyle(0xffffff, 1); g.fillCircle(q.x, q.y, r + 3);
        g.fillStyle(Phaser.Display.Color.HexStringToColor(COLORS[q.v].hex).color, 1); g.fillCircle(q.x, q.y, r);
        if (q.v === 11) { g.lineStyle(2, 0xc9d3e0, 1); g.strokeCircle(q.x, q.y, r); }
        if (on) { g.lineStyle(4, 0xffffff, 1); g.strokeCircle(q.x, q.y, r * 0.42); }
        continue;
      }
      const x = q.x - q.w / 2, y = q.y - q.h / 2;
      if (on) { g.fillStyle(GOLD, 1); g.fillRoundedRect(x - 6, y - 6, q.w + 12, q.h + 12, 20); }
      g.fillStyle(0x1f3354, 0.12); g.fillRoundedRect(x, y + 4, q.w, q.h, 16);
      g.fillStyle(on ? 0xfffbea : 0xffffff, 1); g.fillRoundedRect(x, y, q.w, q.h, 16);
      g.lineStyle(3, on ? 0xe0a520 : 0xd7e3f2, 1); g.strokeRoundedRect(x + 1.5, y + 1.5, q.w - 3, q.h - 3, 15);
    }
  }

  pick(field, v) {
    if (!this.c || this.spec[field] === v) return;
    this.spec[field] = v;
    try { Audio.play('sfx_click', { volume: 0.55, throttle: 40 }); } catch (e) { /* */ }
    this.refresh();
  }

  shuffle() {
    let f = randomFlag(), k = 0;
    while (sameFlag(f, this.spec) && k++ < 5) f = randomFlag();
    this.spec = f;
    this.refresh();
    const ui = this.ui;
    if (this.strips) for (const s of this.strips) { ui.tweens.killTweensOf(s); s.setScale(1 / BIG_S); ui.tweens.add({ targets: s, scaleY: 1.06 / BIG_S, duration: 90, yoyo: true }); }
  }

  refresh() { this.drawBig(); this.drawSheet(); this.drawCells(); }

  // ------------------------------------------------------------------ frame
  tick(dt) {
    if (!this.c) return;
    this.T += dt;
    this.acc += dt;
    // the village's files keep coming while the paused Game waits (its loader runs on the Game's update)
    const L = this.ui.gs && this.ui.gs.load;
    if (L && L.isLoading && L.isLoading() && typeof L.update === 'function') { try { L.update(); } catch (e) { /* */ } }
    if (this.acc < 1 / 30 || !this.strips) return;
    this.acc = 0;
    const B = this.big, n = this.strips.length, om = 2 * Math.PI * 0.75, A = B.fh * 0.062;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const dy = A * Math.pow(u, 0.9) * (Math.sin(6.6 * u - om * this.T) + 0.2 * Math.sin(14 * u - om * 1.7 * this.T));
      const s = this.strips[i];
      s.y = this.bigY0 + dy;
      const u0 = i / n, u1 = (i + 1) / n;
      const b0 = 1 - 0.11 * (0.3 + 0.7 * u0) * (1 + Math.cos(6.6 * u0 - om * this.T)), b1 = 1 - 0.11 * (0.3 + 0.7 * u1) * (1 + Math.cos(6.6 * u1 - om * this.T));
      const c0 = Math.round(b0 * 255), c1 = Math.round(b1 * 255);
      s.setTint((c0 << 16) | (c0 << 8) | c0, (c1 << 16) | (c1 << 8) | c1, (c0 << 16) | (c0 << 8) | c0, (c1 << 16) | (c1 << 8) | c1);
    }
  }

  // ------------------------------------------------------------------ the one-time card (an old village)
  showCard(vf) {
    const ui = this.ui;
    if (this.cardC || this.c) return false;
    this.vf = vf;
    const c = ui.add.container(0, 0).setDepth(86);
    this.cardC = c;
    const pw = 620, ph = 250;
    const bg = panel(ui, 0, 0, 'ui_panel', pw, ph).setOrigin(0.5).setInteractive();
    bg.on('pointerdown', () => {});
    c.add(bg);
    c.add(flagIcon(ui, -pw / 2 + 96, -28, 112));
    const t1 = ui.add.text(-pw / 2 + 190, -66, ft('flag_card'), Object.assign(TXT(28, '#2b2f3a', '#ffffff', 0, '900'), { lineSpacing: 6 })).setOrigin(0, 0.5);
    if (t1.width > pw - 220) t1.setScale((pw - 220) / t1.width);
    c.add(t1);
    const t2 = ui.add.text(-pw / 2 + 190, -6, ft('flag_card_sub'), Object.assign(TXT(18, '#6b7686', '#ffffff', 0, '700'), { wordWrap: { width: pw - 220, useAdvancedWrap: true } })).setOrigin(0, 0.5);
    c.add(t2);
    const mk = ui.makeButton(70, 70, 230, 80, 'green', ft('flag_make'), () => { this.hideCard(); FlagMaker.open(ui, vf, 'card'); }, 30);
    const lt = ui.makeButton(-150, 70, 190, 80, 'gray', ft('flag_later'), () => this.hideCard(), 28);
    c.add([lt, mk]);
    this.cardBtns = { make: mk, later: lt };
    this.cardT = 40;
    this.placeCard();
    c.setAlpha(0);
    ui.tweens.add({ targets: c, alpha: 1, duration: 220 });
    Back.push(this.onBack);
    // (it slides away after 40 s — counted as 나중에 — and steps aside at once when a panel opens over it)
    this.onCardTick = (time, delta) => {
      this.cardT -= delta / 1000;
      if (this.cardT <= 0) this.hideCard();
      else if (ui.panelOpen || ui.buildOpen || ui.v4PanelOpen || ui.v42PanelOpen || ui.adminOpen) this.hideCard(true);
    };
    ui.events.on('update', this.onCardTick);
    if (!this.onResizeOn) { ui.scale.on('resize', this.onResize); this.onResizeOn = true; }
    if (typeof window !== 'undefined' && window.__FV) window.__FV.flagCard = true;
    return true;
  }
  placeCard() { const ui = this.ui; if (this.cardC) this.cardC.setPosition(ui.W / 2, Math.round(ui.H * 0.34)); }
  hideCard(quiet) {
    const ui = this.ui, c = this.cardC;
    if (!c) return;
    this.cardC = null;
    if (this.onCardTick) ui.events.off('update', this.onCardTick);
    if (!this.c) Back.pop(this.onBack);
    if (typeof window !== 'undefined' && window.__FV) window.__FV.flagCard = false;
    if (quiet) { c.destroy(); return; }
    ui.tweens.add({ targets: c, alpha: 0, duration: 160, onComplete: () => c.destroy() });
  }

  // ------------------------------------------------------------------ tests
  state() {
    const cardRects = this.cardC && this.cardBtns ? Object.fromEntries(Object.entries(this.cardBtns).map(([k, b]) => [k, { x: this.cardC.x + b.x, y: this.cardC.y + b.y, w: b.width, h: b.height }])) : null;
    return { open: !!this.c, mode: this.c ? this.mode : null, tab: this.c ? this.tab : null, spec: this.spec ? plain(this.spec) : null, names: this.spec ? describe(this.spec) : null, hit: this.c ? this.hit : null, card: !!this.cardC, cardRects, preview: this.big ? Object.assign({}, this.big) : null };
  }
}
