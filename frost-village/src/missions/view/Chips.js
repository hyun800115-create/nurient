// The mission chip (the focus mission: kind badge, short title, progress / deadline) and the fame chip (crown,
// title stars, points and a thin bar to the next title). UI scene, logical 720-wide space. The mission chip takes the
// space under v4's order chip (28, top + 212 → top + 290 while the order chip shows; v4 keeps its chip: P31 is
// gone, critique H-6); the fame chip sits on the right under the clock.

import { TXT, COL, icon, reicon, fit, panel, progressBar, KIND_ICON } from './ui.js';
import { mt, titleOf, hourLabel } from '../strings.js';
import { unitsOf } from '../model/units.js';

const HOUR = 25;

export class MissionChip {
  /** host = MissionsHost (model, ports, names); x, y = left middle */
  constructor(host, x, y) {
    this.host = host;
    const ui = this.ui = host.ports.ui.scene;
    const c = this.c = ui.add.container(x, y).setDepth(20).setVisible(false);
    this.baseY = y;
    this.w = 316;
    this.bg = panel(ui, 0, 0, 'ui_panel', this.w, 72).setOrigin(0, 0.5).setAlpha(0.96);
    this.ring = ui.add.graphics();
    this.badge = icon(ui, 36, -1, ['ui_icon_mission'], 38);
    this.title = ui.add.text(70, -14, '', TXT(19, COL.ink)).setOrigin(0, 0.5);
    this.bar = progressBar(ui, 70, 16, 150, 18, COL.bar);
    this.count = ui.add.text(228, 16, '', TXT(17, COL.ink, '#ffffff', 0, '900')).setOrigin(0, 0.5);
    this.item = icon(ui, 290, 14, ['item_bread'], 30);
    this.timer = icon(ui, 232, 16, ['ui_icon_timer'], 22).setVisible(false);
    this.num = ui.add.container(this.w - 6, -30);
    const ng = ui.add.graphics();
    ng.fillStyle(0xd4426f, 1); ng.fillCircle(0, 0, 14); ng.lineStyle(3, 0xffffff, 1); ng.strokeCircle(0, 0, 14);
    this.numT = ui.add.text(0, -1, '', TXT(17, '#ffffff', '#ffffff', 0, '900')).setOrigin(0.5);
    this.num.add([ng, this.numT]);
    c.add([this.bg, this.ring, this.badge, this.title, this.bar, this.count, this.timer, this.item, this.num]);
    c.setSize(this.w, 72);
    c.setInteractive(new Phaser.Geom.Rectangle(this.w / 2, 36, this.w, 72), Phaser.Geom.Rectangle.Contains);
    c.on('pointerup', () => host.open('active'));
    this.key = '';
    this.fid = null;
    this.t = 0;
  }

  setPosition(x, y) { this.baseY = y; this.c.setPosition(x, y); }

  update(dt) {
    this.t += dt;
    const h = this.host, m = h.model;
    const f = m.focus();
    const show = !!f && h.chipsVisible();
    if (this.c.visible !== show) this.pop(show);
    if (!show) return;
    // below v4's order chip while it shows (ports.ui.orderChip(): is it on screen)
    const UI = h.ports.ui, y = this.baseY + (UI && UI.orderChip && UI.orderChip() ? 78 : 0);
    if (Math.abs(this.c.y - y) > 0.5) this.c.y += (y - this.c.y) * Math.min(1, dt * 12);
    if (f.id !== this.fid) { this.fid = f.id; this.key = ''; if (this.c.visible) this.bounce(); }
    const t = m.template(f), lang = h.lang();
    const U = unitsOf(t);
    let need = 0, got = 0, item = null;
    U.forEach((u, j) => { need += u.need; got += Math.min(u.need, f.g[j]); if (!item && u.item && f.g[j] < u.need) item = u.item; });
    const T = h.ports.clock.T();
    const due = f.d ? Math.max(0, f.d - T) : 0;
    const n = m.active().length + m.board().length;
    const key = f.id + ':' + got + '/' + need + ':' + Math.ceil(due / 5) + ':' + lang + ':' + n;
    if (key === this.key) return;
    this.key = key;
    reicon(this.badge, [t.icon && /^ui_/.test(t.icon) ? t.icon : KIND_ICON[t.kind], KIND_ICON[t.kind]]);
    const g = this.ring;
    g.clear();
    g.fillStyle(0xfff3d6, 1); g.fillCircle(36, -1, 27);
    g.lineStyle(4, t.kind === 'request' ? COL.pinkHex : t.kind === 'event' ? 0x8a6ad8 : 0xe8a33d, 1); g.strokeCircle(36, -1, 27);
    this.title.setText(titleOf(t, lang, h.namesOf(f)));
    fit(this.title, this.w - 82);
    this.bar.set(need ? got / need : 0, got >= need ? COL.barDone : COL.bar);
    if (due > 0 && due < 6 * HOUR) {
      this.count.setText(hourLabel((h.ports.clock.hour() + due / HOUR) % 24)).setColor(due < 75 ? '#d4426f' : COL.ink);
      this.timer.setVisible(true); this.count.setX(250);
    } else {
      this.count.setText(got + '/' + need).setColor(COL.ink);
      this.timer.setVisible(false); this.count.setX(228);
    }
    const ik = item || (t.icon && /^item_/.test(t.icon) ? t.icon : null);
    this.item.setVisible(!!ik);
    if (ik) { reicon(this.item, [ik]); this.item.setX(this.count.x + this.count.width + 24); }
    this.num.setVisible(n > 1);
    this.numT.setText(String(n));
  }

  pop(on) {
    const ui = this.ui, c = this.c;
    ui.tweens.killTweensOf(c);
    if (on) { c.setVisible(true).setScale(0.6).setAlpha(0); ui.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' }); }
    else c.setVisible(false);
  }

  bounce() {
    const ui = this.ui;
    ui.tweens.killTweensOf(this.badge);
    const s = this.badge.scaleX;
    this.badge.setScale(s * 1.35);
    ui.tweens.add({ targets: this.badge, scale: s, duration: 320, ease: 'Back.easeOut' });
  }

  /** a short wiggle when progress arrives */
  nudge() {
    const ui = this.ui;
    ui.tweens.killTweensOf(this.c);
    this.c.setScale(1);
    ui.tweens.add({ targets: this.c, scale: 1.06, duration: 90, yoyo: true, ease: 'Sine.easeOut' });
  }

  destroy() { this.c.destroy(); }
}

export class FameChip {
  /** x, y = right middle */
  constructor(host, x, y) {
    this.host = host;
    const ui = this.ui = host.ports.ui.scene;
    const c = this.c = ui.add.container(x, y).setDepth(20).setVisible(false);
    this.w = 214;
    this.bg = panel(ui, 0, 0, 'ui_panel', this.w, 60).setOrigin(1, 0.5).setAlpha(0.96);
    this.crown = icon(ui, -this.w + 32, -2, ['ui_icon_title', 'ui_icon_fame'], 44);
    this.stars = ui.add.container(-this.w + 62, -14);
    this.text = ui.add.text(-this.w + 62, 6, '', TXT(18, COL.ink)).setOrigin(0, 0.5);
    this.barG = ui.add.graphics();
    this.flair = icon(ui, -14, -26, ['ui_icon_steer'], 26).setVisible(false);
    c.add([this.bg, this.crown, this.stars, this.text, this.barG, this.flair]);
    c.setSize(this.w, 60);
    c.setInteractive(new Phaser.Geom.Rectangle(-this.w / 2, 30, this.w, 60), Phaser.Geom.Rectangle.Contains);
    c.on('pointerup', () => host.open('titles'));
    this.key = '';
    this.shown = -1;
  }

  setPosition(x, y) { this.c.setPosition(x, y); }

  update(dt) {
    const h = this.host;
    const show = h.chipsVisible();
    if (this.c.visible !== show) this.c.setVisible(show);
    if (!show) return;
    const fi = h.model.fameInfo(), lang = h.lang();
    // the number counts up toward the real points
    if (this.shown < 0 || this.shown > fi.pts) this.shown = fi.pts;   // first frame / a loaded save: no count-down
    if (this.shown < fi.pts) this.shown = Math.min(fi.pts, this.shown + Math.max(1, (fi.pts - this.shown) * dt * 4));
    const pts = Math.floor(this.shown);
    const key = pts + ':' + fi.title + ':' + lang + ':' + (fi.flairs.driver ? 1 : 0);
    if (key === this.key) return;
    this.key = key;
    this.text.setText(mt(lang, 'm_fame_n', { n: pts }));
    fit(this.text, this.w - 74);
    // 1–5 stars for the title
    if (this.stars.__lv !== fi.title) {
      this.stars.__lv = fi.title;
      this.stars.removeAll(true);
      for (let i = 0; i < 5; i++) {
        const st = icon(this.ui, i * 19 + 8, 0, ['ui_icon_fame'], 18);
        if (i >= fi.title) st.setAlpha(0.22).setTint(0x8c96a6);
        this.stars.add(st);
      }
    }
    const g = this.barG;
    g.clear();
    const bx = -this.w + 62, by = 22, bw = this.w - 80;
    const f = fi.next ? (pts - fi.at) / Math.max(1, fi.next - fi.at) : 1;
    g.fillStyle(0x2b2f3a, 0.16); g.fillRoundedRect(bx, by, bw, 7, 3.5);
    g.fillStyle(COL.fame, 1); g.fillRoundedRect(bx, by, Math.max(7, bw * Math.max(0, Math.min(1, f))), 7, 3.5);
    this.flair.setVisible(!!fi.flairs.driver);
    if (fi.flairs.crown) this.crown.setTint(fi.flairs.crown === 'gold' ? 0xfff0a0 : 0xffffff); else this.crown.clearTint();
  }

  /** where a flying badge / star should land (UI coords) */
  target() { return { x: this.c.x - this.w + 32, y: this.c.y }; }

  bump() {
    const ui = this.ui;
    ui.tweens.killTweensOf(this.crown);
    const s = this.crown.scaleX;
    this.crown.setScale(s * 1.4);
    ui.tweens.add({ targets: this.crown, scale: s, duration: 300, ease: 'Back.easeOut' });
  }

  destroy() { this.c.destroy(); }
}
