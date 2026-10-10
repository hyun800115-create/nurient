// DriveHUD (vehicles_runtime view, UI scene): the chief's delivery run — the clock and par, three stars that fall
// away as the clock passes par (never below ★), the next stop and how many are left, an edge arrow toward the stop
// when it is off screen, a big round 빵빵 button, a gentle line when something holds the vehicle (red light,
// someone crossing, a train) and the result card at the end. The joystick is the game's own.

import { Assets } from '../../core/Assets.js';
import { FONT } from '../../data/strings.js';
import { vt } from '../strings.js';

const TXT = (size, color = '#2b2f3a', stroke = '#ffffff', st = 0, weight = '900') => ({ fontFamily: FONT, fontSize: size + 'px', fontStyle: weight, color, stroke, strokeThickness: st, resolution: 2 });
const mmss = (s) => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

function star(g, x, y, r, fill, line) {
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.48 : r; pts.push(new Phaser.Math.Vector2(x + Math.cos(a) * rr, y + Math.sin(a) * rr)); }
  g.fillStyle(fill, 1); g.fillPoints(pts, true);
  g.lineStyle(4, line, 1); g.strokePoints(pts, true, true);
}

export class DriveHUD {
  constructor(view) {
    this.view = view;
    const ui = this.ui = view.ui;
    this.W = ui.W || 720; this.H = ui.H || 1280;
    const top = (view.ports.ui && view.ports.ui.safeTop) || 0;
    this.c = ui.add.container(this.W / 2, 196 + top).setDepth(72).setVisible(false);
    this.bg = this.nine('ui_panel', 0, 0, 392, 128).setOrigin(0.5).setAlpha(0.97);
    this.clock = ui.add.image(-150, -14, '__WHITE').setVisible(false);
    if (Assets.has('ui_icon_timer')) { Assets.apply(this.clock, 'ui_icon_timer'); this.clock.setVisible(true).setScale(48 / Math.max(1, this.clock.frame.realWidth)); }
    this.time = ui.add.text(-114, -16, '0:00', TXT(46)).setOrigin(0, 0.5);
    this.par = ui.add.text(-114, 26, '', TXT(20, '#6a7488', '#ffffff', 0, '800')).setOrigin(0, 0.5);
    this.stars = ui.add.graphics();
    this.c.add([this.bg, this.clock, this.time, this.par, this.stars]);
    this.nextBox = ui.add.container(this.W / 2, 196 + top + 92).setDepth(72).setVisible(false);
    this.nextBg = this.nine('ui_panel', 0, 0, 392, 56).setOrigin(0.5).setTint(0x2b3a58).setAlpha(0.9);
    this.nextT = ui.add.text(0, 0, '', TXT(22, '#ffffff', '#2b3a58', 0, '800')).setOrigin(0.5);
    this.nextBox.add([this.nextBg, this.nextT]);
    this.hint = ui.add.text(this.W / 2, 196 + top + 140, '', TXT(22, '#ffffff', '#c0392b', 6, '900')).setOrigin(0.5).setDepth(72).setVisible(false);
    // the edge arrow (ui_arrow points right in its art)
    this.arrow = ui.add.image(0, 0, '__WHITE').setDepth(72).setVisible(false);
    if (Assets.has('ui_arrow')) Assets.apply(this.arrow, 'ui_arrow');
    this.arrowM = ui.add.text(0, 0, '', TXT(20, '#ffffff', '#d23f7a', 6)).setOrigin(0.5).setDepth(72).setVisible(false);
    // 빵빵
    const bx = this.W - 112, by = this.H - 300;
    this.honk = ui.add.container(bx, by).setDepth(72).setVisible(false);
    const hg = ui.add.graphics();
    hg.fillStyle(0x1f3354, 0.25); hg.fillCircle(0, 6, 66);
    hg.fillStyle(0xffb347, 1); hg.fillCircle(0, 0, 66);
    hg.lineStyle(6, 0xffffff, 1); hg.strokeCircle(0, 0, 66);
    this.honkT = ui.add.text(0, 2, vt(view.host.lang(), 'honk'), TXT(32, '#ffffff', '#c06a10', 8)).setOrigin(0.5);
    this.honk.add([hg, this.honkT]);
    this.honk.setSize(140, 140).setInteractive({ useHandCursor: true }).on('pointerdown', () => { if (view.host.model.chief.honk()) { ui.tweens.add({ targets: this.honk, scale: 0.86, duration: 80, yoyo: true }); } });
    this.lastStars = -1;
    this.card = null;
  }

  nine(key, x, y, w, h) { const n = Assets.nine(key); return this.ui.add.nineslice(x, y, n.tex, n.frame, w, h, n.l, n.r, n.t, n.b); }

  update() {
    const host = this.view.host, lang = host.lang();
    const st = host.model.chief.state();
    if (!st.active) { for (const o of [this.c, this.nextBox, this.hint, this.arrow, this.arrowM, this.honk]) if (o.visible) o.setVisible(false); return; }
    if (!this.c.visible) { this.c.setVisible(true).setScale(0.8); this.ui.tweens.add({ targets: this.c, scale: 1, duration: 260, ease: 'Back.easeOut' }); this.honk.setVisible(true); this.nextBox.setVisible(true); }
    this.time.setText(mmss(st.t));
    this.par.setText(vt(lang, 'par', { s: Math.round(st.par) }));
    if (st.stars !== this.lastStars) {
      this.lastStars = st.stars;
      this.stars.clear();
      for (let i = 0; i < 3; i++) star(this.stars, 54 + i * 50, -6, 21, i < st.stars ? 0xffc83d : 0xdfe4ec, i < st.stars ? 0xd98a12 : 0xb6bfcc);
    }
    const left = st.n - st.i;
    const nm = st.next && st.next.name ? (typeof st.next.name === 'string' ? st.next.name : st.next.name[lang] || st.next.name.ko) : '';
    this.nextT.setText((nm ? vt(lang, 'next', { name: nm }) + ' · ' : '') + vt(lang, 'left', { n: left }));
    // what holds us up
    const why = st.blocked === 'noRoom' ? 'noRoom' : st.blocked === 'light' ? 'redLight' : st.blocked === 'junction' ? 'giveWay' : st.blocked === 'walker' ? 'walker' : st.blocked === 'rail' ? 'railBlocked' : null;
    if (why && (st.speed < 0.1 || why === 'noRoom')) { this.hint.setText(vt(lang, why)).setVisible(true); } else this.hint.setVisible(false);
    // the edge arrow toward the next stop when it is off screen
    const P = this.view.ports;
    if (st.next && P.view && P.view.toScreen) {
      const p = P.view.toScreen(st.next.x, st.next.y);
      const m = 70;
      const off = p.x < m || p.x > this.W - m || p.y < 300 || p.y > this.H - 380;
      if (off) {
        const cx = this.W / 2, cy = this.H / 2;
        const dx = p.x - cx, dy = p.y - cy, a = Math.atan2(dy, dx);
        const k = Math.min((this.W / 2 - m) / Math.max(1, Math.abs(dx)), (this.H / 2 - 330) / Math.max(1, Math.abs(dy)));
        const ax = cx + dx * k, ay = cy + dy * k;
        this.arrow.setVisible(true).setPosition(ax, ay).setRotation(a).setScale(0.9 + 0.08 * Math.sin(host.model.T * 6)).setTint(0xff5c9a);
        this.arrowM.setVisible(true).setPosition(ax - Math.cos(a) * 54, ay - Math.sin(a) * 54).setText(st.arrow ? st.arrow.m + 'm' : '');
      } else { this.arrow.setVisible(false); this.arrowM.setVisible(false); }
    }
  }

  /** the result card: stars pop one by one, the time, a new best */
  result(ev) {
    const ui = this.ui, lang = this.view.host.lang();
    if (this.card) this.card.destroy();
    const c = this.card = ui.add.container(this.W / 2, this.H * 0.4).setDepth(80);
    c.add(this.nine('ui_panel', 0, 0, 440, 240).setOrigin(0.5));
    c.add(ui.add.text(0, -78, vt(lang, 'driveDone', { s: Math.round(ev.s) }), TXT(32)).setOrigin(0.5));
    const g = ui.add.graphics();
    c.add(g);
    for (let i = 0; i < 3; i++) {
      const on = i < ev.stars;
      ui.time.delayedCall(250 + i * 260, () => { if (!c.scene) return; star(g, -90 + i * 90, 6, 34, on ? 0xffc83d : 0xdfe4ec, on ? 0xd98a12 : 0xb6bfcc); });
    }
    const sub = ev.late ? vt(lang, 'late') : ev.best ? vt(lang, 'driveBest') : vt(lang, 'par', { s: Math.round(ev.par) });
    c.add(ui.add.text(0, 80, sub, TXT(24, ev.best ? '#e2574c' : '#6a7488', '#ffffff', 0, '900')).setOrigin(0.5));
    c.setScale(0.6).setAlpha(0);
    ui.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });
    ui.time.delayedCall(3200, () => { if (this.card === c) { ui.tweens.add({ targets: c, alpha: 0, duration: 300, onComplete: () => { c.destroy(); if (this.card === c) this.card = null; } }); } });
  }

  destroy() { for (const o of [this.c, this.nextBox, this.hint, this.arrow, this.arrowM, this.honk]) o.destroy(); if (this.card) this.card.destroy(); }
}
