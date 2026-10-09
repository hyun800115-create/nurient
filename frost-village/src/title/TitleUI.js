// Title UI (screen space, the UI camera): "터치하여 시작" pill, the PC hint, the version label, the settings
// gear (when the lead passes onSettings), the skip hint and the growth-stage chips of the intro, the
// "마을이 자랐어요!" ribbon of the idle title. Layout: TITLE_LAYOUT (config.js) + safe-area insets.
import { FONT, t } from '../data/strings.js';
import { Assets } from '../core/Assets.js';
import { TITLE_TEXT } from './config.js';

const D = 60;

export class TitleUI {
  /**
   * opts: { lang, touch, version, safeTop, safeBottom, onSettings, onSkip, reduced, cap (stages the intro shows) }
   */
  constructor(scene, put, W, H, layout, opts) {
    this.scene = scene; this.put = put; this.W = W; this.H = H; this.L = layout; this.o = opts;
    this.tx = TITLE_TEXT[opts.lang] || TITLE_TEXT.ko;
    this.t = 0;
    this.tapOn = false; this.tapK = 0;
    this.build();
  }

  add(o, d = D) { o.setDepth(d); this.put(o); return o; }

  text(x, y, str, size, style = {}) {
    return this.scene.add.text(x, y, str, Object.assign({ fontFamily: FONT, fontSize: size + 'px', fontStyle: '900', color: '#ffffff', stroke: '#1d2a44', strokeThickness: Math.round(size / 5), resolution: 2 }, style));
  }

  build() {
    const s = this.scene, W = this.W, H = this.H, o = this.o;
    const sb = o.safeBottom || 0, st = o.safeTop || 0;
    // --- start pill
    this.tapY = H * this.L.tapY - sb;
    const box = this.add(s.add.container(W / 2, this.tapY), D + 2);
    const label = this.text(0, 0, o.touch ? this.tx.tap : this.tx.click, 40, { stroke: '#173d7a', strokeThickness: 9 }).setOrigin(0.5);
    const pw = Math.max(330, label.width + 96), ph = 84;
    const g = s.add.graphics();
    g.fillStyle(0x0d1d3d, 0.35); g.fillRoundedRect(-pw / 2, -ph / 2 + 6, pw, ph, ph / 2);
    g.fillStyle(0x2f78d0, 0.92); g.fillRoundedRect(-pw / 2, -ph / 2, pw, ph, ph / 2);
    g.fillStyle(0x5aa2f0, 1); g.fillRoundedRect(-pw / 2 + 6, -ph / 2 + 5, pw - 12, ph * 0.46, (ph * 0.46) / 2);
    g.lineStyle(4, 0xffffff, 0.9); g.strokeRoundedRect(-pw / 2 + 2, -ph / 2 + 2, pw - 4, ph - 4, ph / 2 - 2);
    box.add([g, label]);
    box.setAlpha(0).setVisible(false);
    this.tapBox = box;
    // --- PC hint (mouse / keyboard players)
    if (!o.touch) {
      this.pcHint = this.add(this.text(W / 2, this.tapY + 70, t('pcHint'), 21, { fontStyle: '700', strokeThickness: 5 }).setOrigin(0.5).setAlpha(0));
    }
    // --- version (bottom-left, quiet)
    if (o.version) this.version = this.add(this.text(18, H - 14 - sb, o.version, 19, { fontStyle: '700', color: '#e9f1fb', strokeThickness: 4 }).setOrigin(0, 1).setAlpha(0.8));
    // --- settings gear (top-right) - only when the game gives the title a settings panel to open
    if (o.onSettings) {
      const gx = W - 58, gy = st + 58;
      const btn = this.add(s.add.container(gx, gy), D + 3);
      const c = s.add.graphics();
      c.fillStyle(0x0d1d3d, 0.3); c.fillCircle(0, 4, 38);
      c.fillStyle(0xffffff, 0.96); c.fillCircle(0, 0, 37);
      c.lineStyle(3, 0xc9d8ea, 1); c.strokeCircle(0, 0, 35);
      const ic = Assets.sprite('ui_icon_settings');
      const icon = s.add.image(0, 0, ic.tex, ic.frame).setOrigin(0.5);
      icon.setScale(46 / Math.max(1, icon.frame.realWidth));
      btn.add([c, icon]);
      btn.setSize(84, 84).setInteractive({ useHandCursor: true });
      btn.on('pointerdown', () => { btn.setScale(0.9); });
      btn.on('pointerup', () => { btn.setScale(1); o.onSettings(); });
      btn.on('pointerout', () => btn.setScale(1));
      btn.setAlpha(0);
      this.gear = btn;
    }
    // --- intro hint (bottom centre): "탭하면 소리가 켜져요" -> "한 번 더 탭하면 건너뛰어요", or "탭하면 건너뛰어요"
    this.skip = this.add(this.text(W / 2, H - 46 - sb, this.tx.skip, 22, { fontStyle: '700', color: '#ffffff', strokeThickness: 5 }).setOrigin(0.5).setAlpha(0));
    this.hintMode = 'skip';
    // --- skip pill (intro, bottom right): skips at once, sound or not
    if (o.onSkip) {
      const lb = this.text(0, 0, this.tx.skipBtn, 24, { fontStyle: '800', strokeThickness: 0, color: '#ffffff' }).setOrigin(1, 0.5);
      const bw = Math.max(150, lb.width + 74), bh = 54;
      const bx = W - 22 - bw / 2, by = H - 44 - sb;
      const pill = this.add(s.add.container(bx, by), D + 3);
      const g = s.add.graphics();
      g.fillStyle(0x0d1d3d, 0.42); g.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
      g.lineStyle(2.5, 0xffffff, 0.75); g.strokeRoundedRect(-bw / 2 + 1, -bh / 2 + 1, bw - 2, bh - 2, bh / 2 - 1);
      // two small "fast forward" triangles (drawn: no font glyph needed)
      g.fillStyle(0xffffff, 1);
      const ax = bw / 2 - 40;
      g.fillTriangle(ax - 9, -9, ax - 9, 9, ax + 3, 0); g.fillTriangle(ax + 3, -9, ax + 3, 9, ax + 15, 0);
      lb.setX(ax - 16);
      pill.add([g, lb]);
      pill.setSize(bw + 20, bh + 24).setInteractive({ useHandCursor: true });
      pill.on('pointerdown', () => { pill.setScale(0.92); });
      pill.on('pointerup', () => { pill.setScale(1); if (this.skipOn) o.onSkip(); });
      pill.on('pointerout', () => pill.setScale(1));
      pill.setAlpha(0);
      this.skipPill = pill;
      this.skipOn = false;
    }
    // --- stage chips (intro): 개척 › 마을 › 읍 › 도시 (up to the stages this phone shows)
    this.chips = [];
    const names = this.tx.stages;
    const nc = Math.max(1, Math.min(4, o.cap || 4));
    const cw = 118, gap = 26, total = cw * nc + gap * (nc - 1);
    const cy = H * this.L.chipsY - sb;
    for (let i = 1; i <= nc; i++) {
      const x = W / 2 - total / 2 + cw / 2 + (i - 1) * (cw + gap);
      const ct = this.add(s.add.container(x, cy), D + 1);
      const bg = s.add.graphics();
      const lb = this.text(0, 0, names[i], 26, { strokeThickness: 0, color: '#ffffff' }).setOrigin(0.5);
      ct.add([bg, lb]);
      ct.setAlpha(0);
      this.chips.push({ ct, bg, lb, on: false, k: 0 });
      if (i < nc) {
        const ar = this.add(this.text(x + cw / 2 + gap / 2, cy, '›', 30, { strokeThickness: 0, color: '#ffffff' }).setOrigin(0.5).setAlpha(0), D + 1);
        this.chips[i - 1].arrow = ar;
      }
    }
    this.drawChips(0);
    this.chipsAlpha = 0; this.chipsTarget = 0;
    // --- "the village grew" ribbon
    this.ribbon = this.add(s.add.container(W / 2, H * 0.30), D + 4);
    const rl = this.text(0, 0, this.tx.grew, 34, { stroke: '#7a3b0c', strokeThickness: 8, color: '#fff6d6' }).setOrigin(0.5);
    const rw = rl.width + 90;
    const rg = s.add.graphics();
    rg.fillStyle(0x7a3b0c, 0.35); rg.fillRoundedRect(-rw / 2, -30, rw, 66, 24);
    rg.fillStyle(0xf0a43a, 1); rg.fillRoundedRect(-rw / 2, -34, rw, 64, 24);
    rg.lineStyle(4, 0xffe9a8, 1); rg.strokeRoundedRect(-rw / 2 + 3, -31, rw - 6, 58, 21);
    this.ribbon.add([rg, rl]);
    this.ribbon.setAlpha(0).setVisible(false);
    this.ribbonT = -1;
  }

  drawChips(cur) {
    this.chips.forEach((c, i) => {
      const on = i + 1 <= cur, now = i + 1 === cur;
      const w = 118, h = 50;
      c.bg.clear();
      c.bg.fillStyle(0x0d1d3d, 0.35); c.bg.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, h / 2);
      c.bg.fillStyle(now ? 0xf0a43a : on ? 0x2f78d0 : 0xffffff, now ? 1 : on ? 0.92 : 0.28);
      c.bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      if (now) { c.bg.lineStyle(3, 0xfff1c0, 1); c.bg.strokeRoundedRect(-w / 2 + 1.5, -h / 2 + 1.5, w - 3, h - 3, h / 2 - 1.5); }
      c.lb.setColor(on ? '#ffffff' : '#e9f1fb');
      if (now && !c.on) c.k = 1;
      c.on = now;
    });
    this.cur = cur;
  }

  /** intro: show the stage chips with stage `s` active */
  setChip(s) { this.chipsTarget = 1; if (s !== this.cur) this.drawChips(s); }
  hideChips() { this.chipsTarget = 0; }
  /** intro hint + skip pill; mode 'sound' | 'again' | 'skip' picks the hint text */
  showSkip(on, mode) {
    this.skipTarget = on ? 1 : 0;
    this.skipOn = !!on;
    if (mode && mode !== this.hintMode) {
      this.hintMode = mode;
      const c = !this.o.touch;
      const tx = this.tx;
      this.skip.setText(mode === 'sound' ? (c ? tx.soundClick : tx.sound) : mode === 'again' ? (c ? tx.againClick : tx.again) : (c ? tx.skipClick : tx.skip));
      if (on) this.hintPop = 1;
    }
  }
  showTap() { if (this.tapOn) return; this.tapOn = true; this.tapBox.setVisible(true); this.tapK = 0; }
  showRibbon() { this.ribbonT = 0; this.ribbon.setVisible(true); }

  /** back to the start of the intro */
  reset() {
    this.tapOn = false; this.tapK = 0; this.tapBox.setVisible(false).setAlpha(0);
    if (this.pcHint) this.pcHint.setAlpha(0);
    if (this.gear) this.gear.setAlpha(0);
    this.skipTarget = 0; this.skip.setAlpha(0); this.skipOn = false;
    if (this.skipPill) this.skipPill.setAlpha(0);
    this.chipsTarget = 0; this.chipsAlpha = 0; this.drawChips(0);
    this.ribbonT = -1; this.ribbon.setVisible(false);
  }

  update(dt) {
    this.t += dt;
    const red = this.o.reduced;
    // chips
    this.chipsAlpha += (this.chipsTarget - this.chipsAlpha) * Math.min(1, dt * 5);
    for (const c of this.chips) {
      c.ct.setAlpha(this.chipsAlpha);
      if (c.arrow) c.arrow.setAlpha(this.chipsAlpha * 0.8);
      if (c.k > 0) { c.k = Math.max(0, c.k - dt * 2.6); }
      const pop = red ? 1 : 1 + Math.sin((1 - c.k) * Math.PI) * c.k * 0.35;
      c.ct.setScale(pop);
    }
    // intro hint + skip pill
    if (this.skipTarget !== undefined) {
      const a = this.skip.alpha + ((this.skipTarget * 0.9) - this.skip.alpha) * Math.min(1, dt * 4);
      this.skip.setAlpha(a);
      if (this.hintPop > 0) { this.hintPop = Math.max(0, this.hintPop - dt * 3); this.skip.setScale(red ? 1 : 1 + 0.12 * Math.sin(this.hintPop * Math.PI)); }
      if (this.skipPill) {
        const pa = this.skipPill.alpha + ((this.skipTarget) - this.skipPill.alpha) * Math.min(1, dt * 4);
        this.skipPill.setAlpha(pa);
        if (this.skipPill.input) this.skipPill.input.enabled = pa > 0.3;
      }
    }
    // start pill: pop in, then a gentle pulse
    if (this.tapOn) {
      this.tapK = Math.min(1, this.tapK + dt / 0.45);
      const k = this.tapK;
      const pop = red ? 1 : (k < 1 ? 0.6 + 0.4 * (1 + 0.25 * Math.sin(k * Math.PI)) * k : 1 + 0.04 * Math.sin(this.t * 4.2));
      this.tapBox.setScale(pop).setAlpha(Math.min(1, k * 2) * (k < 1 || red ? 1 : 0.9 + 0.1 * Math.sin(this.t * 4.2)));
      if (this.pcHint) this.pcHint.setAlpha(k * 0.95);
      if (this.gear) this.gear.setAlpha(k);
    }
    // the gear only takes taps while it can be seen
    if (this.gear && this.gear.input) this.gear.input.enabled = this.tapOn && this.gear.alpha > 0.5;
    // ribbon: pop, hold, fade
    if (this.ribbonT >= 0) {
      this.ribbonT += dt;
      const r = this.ribbonT;
      const a = r < 0.3 ? r / 0.3 : r < 2.4 ? 1 : Math.max(0, 1 - (r - 2.4) / 0.5);
      this.ribbon.setAlpha(a).setScale(red ? 1 : r < 0.3 ? 0.7 + r : 1);
      if (r > 3) { this.ribbonT = -1; this.ribbon.setVisible(false); }
    }
  }
}
