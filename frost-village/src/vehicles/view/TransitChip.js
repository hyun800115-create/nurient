// TransitChip (vehicles_runtime view, UI scene): standing at a stop shows "다음 버스 12초 · 어디로?" with a little
// bus of this era; tapping it lists where the lines go (line colour, stop name, a tiny picture of the stop); picking
// one books the ride. While waiting / riding the chip says so (and "안 탈래요" cancels the wait).

import { Assets } from '../../core/Assets.js';
import { FONT } from '../../data/strings.js';
import { vt } from '../strings.js';

const TXT = (size, color = '#2b2f3a', stroke = '#ffffff', st = 0, weight = '900') => ({ fontFamily: FONT, fontSize: size + 'px', fontStyle: weight, color, stroke, strokeThickness: st, resolution: 2 });

export class TransitChip {
  constructor(view) {
    this.view = view;
    const ui = this.ui = view.ui;
    this.W = ui.W || 720; this.H = ui.H || 1280;
    this.c = ui.add.container(this.W / 2, this.H - 318).setDepth(70).setVisible(false);
    this.bg = this.nine('ui_panel', 0, 0, 440, 96).setOrigin(0.5).setAlpha(0.97);
    this.busIcon = ui.add.image(-168, 6, '__WHITE').setVisible(false);
    this.t1 = ui.add.text(-112, -16, '', TXT(28)).setOrigin(0, 0.5);
    this.t2 = ui.add.text(-112, 20, '', TXT(22, '#3f7fd0', '#ffffff', 0, '800')).setOrigin(0, 0.5);
    this.c.add([this.bg, this.busIcon, this.t1, this.t2]);
    this.bg.setInteractive({ useHandCursor: true }).on('pointerup', () => this.tap());
    this.list = null;
    this.stop = null;
    this.state = 'off';
  }

  nine(key, x, y, w, h) { const n = Assets.nine(key); return this.ui.add.nineslice(x, y, n.tex, n.frame, w, h, n.l, n.r, n.t, n.b); }

  /** the little bus picture of this era (the real vehicle art at a tiny scale) */
  icon() {
    const key = this.view.host.model.roleKey('bus');
    if (this.iconKey === key) return;
    this.iconKey = key;
    const def = Assets.charDef(key);
    const f = def && def.atlas ? Assets.texOf(def.atlas, 'idle_SE_0') : null;
    if (f) { this.busIcon.setTexture(f, 'idle_SE_0').setVisible(true).setOrigin(def.anchor[0], def.anchor[1]).setScale(key === 'horse_sleigh_bus' ? 0.2 : 0.24); }
  }

  update() {
    const host = this.view.host, api = host.api, lang = host.lang();
    const P = this.view.ports;
    const riding = api.riding();
    const b = host.booking && host.booking.state === 'waiting' ? host.booking : null;
    let stop = null;
    if (!riding && !b && !api.chiefDriving() && P.chief) stop = api.stopNear(P.chief.x(), P.chief.y());
    if (riding) {
      const name = this.stopName(riding.to, lang);
      this.show('riding', vt(lang, 'riding', { stop: name }).split(' · ')[0], vt(lang, 'riding', { stop: name }).split(' · ')[1] || '');
    } else if (b) {
      const eta = host.model.transit.eta(b.from);
      this.show('waiting', vt(lang, 'rideWait', { s: Number.isFinite(eta) ? Math.ceil(eta) : '…' }), vt(lang, 'cancel'));
    } else if (stop) {
      this.stop = stop;
      const eta = host.model.transit.eta(stop);
      const l1 = !Number.isFinite(eta) ? vt(lang, 'noBus') : eta < 1 ? vt(lang, 'nextBusNow') : vt(lang, 'nextBus', { s: Math.ceil(eta) });
      this.show('stop', l1, Number.isFinite(eta) ? vt(lang, 'whereTo') : '');
    } else { this.hide(); if (this.list) this.closeList(); }
  }

  show(state, a, b) {
    this.icon();
    if (!this.c.visible) { this.c.setVisible(true).setScale(0.85).setAlpha(0); this.ui.tweens.add({ targets: this.c, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' }); }
    this.state = state;
    if (this.t1.text !== a) this.t1.setText(a);
    if (this.t2.text !== b) this.t2.setText(b);
  }
  hide() { if (this.c.visible) this.c.setVisible(false); this.state = 'off'; }

  stopName(id, lang) { const s = this.view.host.model.layout.STOPS[id]; return s ? (s.name[lang] || s.name.ko) : id; }

  tap() {
    const host = this.view.host;
    if (this.state === 'waiting') { host.api.cancelRide(); host.booking = null; return; }
    if (this.state !== 'stop' || !this.stop) return;
    if (this.list) { this.closeList(); return; }
    this.openList(this.stop);
  }

  /** where can I go from here: one row per stop the lines reach */
  openList(from) {
    const host = this.view.host, lang = host.lang(), ui = this.ui;
    const dests = host.api.destinations(from);
    if (!dests.length) return;
    const h = 92 + dests.length * 78;
    const c = this.list = ui.add.container(this.W / 2, this.c.y - 60 - h / 2).setDepth(71);
    c.add(this.nine('ui_panel', 0, 0, 470, h).setOrigin(0.5));
    c.add(ui.add.text(0, -h / 2 + 38, vt(lang, 'whereTo'), TXT(28)).setOrigin(0.5));
    dests.forEach((d, i) => {
      const y = -h / 2 + 100 + i * 78;
      const line = host.model.layout.LINES[d.line];
      const row = this.nine('ui_button_gray', 0, y, 420, 66).setOrigin(0.5).setInteractive({ useHandCursor: true });
      const dot = ui.add.graphics();
      dot.fillStyle(line ? line.color : 0x888888, 1); dot.fillCircle(-176, y, 18);
      dot.lineStyle(4, 0xffffff, 1); dot.strokeCircle(-176, y, 18);
      const n = ui.add.text(-176, y + 1, String(d.line), TXT(20, '#ffffff', '#2b2f3a', 0)).setOrigin(0.5);
      const t = ui.add.text(-142, y, this.stopName(d.stop, lang), TXT(26)).setOrigin(0, 0.5);
      row.on('pointerup', () => { this.closeList(); host.api.ride(from, d.stop); });
      c.add([row, dot, n, t]);
    });
    c.setScale(0.9).setAlpha(0);
    ui.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 200, ease: 'Back.easeOut' });
  }
  closeList() { if (this.list) { this.list.destroy(); this.list = null; } }

  destroy() { this.closeList(); this.c.destroy(); }
}
