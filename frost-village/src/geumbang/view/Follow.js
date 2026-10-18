// Follow (view, plan §3.3 + §6 따라가기): the camera follows one parcel — the first order (정 할머니, automatic) or any
// order from the app's 따라가기 — with a caption chip per step: 주문 받음 → 고르는 중 (the cutaway opens) → 포장 찌익 →
// 밴에 싣는 중 → 배달 가는 중 → 띵동!, then holds on the door and hands the camera back. Any touch ends it at once.
// The camera is the game's: ports.view.lookAt(x, y, zoom) each frame, ports.view.release() at the end.

import { DEPTH } from '../../systems/DepthSort.js';
import { View } from '../../core/View.js';
import { textStyle } from './art.js';
import { nine } from './GbChip.js';
import { gt } from '../strings.js';

const HOLD = 3.2;            // s on the door after the hand-over
const ZOOM = 1.0;            // world zoom while following (×k by the camera)

export class Follow {
  constructor(view) { this.view = view; this.active = false; this.first = false; this.cap = 0; this.ui = null; }

  onEvent(e) {
    if (e.t === 'gb:order' && e.first && !this.active) {
      const S = this.view.P.settings;
      if (!S || !S.scenes || S.scenes() !== 'off') this.start(e.id);
    }
    if (!this.active) return;
    if (e.t === 'gb:delivered' && e.id === this.id) { this.doneT = 0; this.door = { x: e.x, y: e.y }; }
    if (e.t === 'gb:restock' && e.id === this.id) this.stop();
  }

  start(id) {
    const m = this.view.m, o = m.orders.get(id);
    if (!o) return false;
    this.active = true; this.id = id; this.first = !!o.first; this.t = 0; this.doneT = -1; this.door = null; this.cap = 0; this.last = null;
    this.capUI();
    this.tapOff = this.onTap(() => this.stop());
    return true;
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    const V = this.view.P.view;
    if (V && V.release) V.release();
    this.view.hub.reveal(false);
    if (this.c) this.c.setVisible(false);
    if (this.tapOff) { this.tapOff(); this.tapOff = null; }
  }

  onTap(fn) {
    const P = this.view.P;
    if (P.input && P.input.onTap) return P.input.onTap(fn);
    const scenes = [this.view.scene, this.view.uiScene].filter(Boolean);
    let armed = false;
    const h = () => { if (armed) fn(); };
    // (the tap that started following — the app's 따라가기 — is not the one that ends it)
    this.view.addTicker(() => { armed = true; return true; });
    for (const s of scenes) s.input.on('pointerdown', h);
    return () => { for (const s of scenes) s.input.off('pointerdown', h); };
  }

  /** where the parcel is now, and the caption step (1..6) */
  where() {
    const view = this.view, m = view.m, o = m.orders.get(this.id), hub = view.hub, b = hub.bld();
    if (!o) return this.door ? { x: this.door.x, y: this.door.y - 40, cap: 6 } : this.last;
    if (o.st === 'pick' || o.st === 'pack') {
      const role = o.st === 'pick' ? 'picker' : 'packer';
      const c = hub.crew.find((q) => q.role === role) || hub.crew[0];
      const p = c ? c.home : b ? { x: b.x, y: b.y } : null;
      if (!p) return null;
      return { x: p.x, y: p.y - 30, cap: o.st === 'pick' ? (this.t < 2.4 ? 1 : 2) : 3, reveal: true };
    }
    if (o.st === 'ready') {
      const v = o.van && m.disp ? m.disp.vans.find((q) => q.id === o.van) : null;
      if (v) return { x: v.x - 40, y: v.y - 40, cap: 4, reveal: false };
      if (!b) return null;
      return { x: b.x + hub.lay.pile[0], y: b.y + hub.lay.pile[1] - 30, cap: 3, reveal: true };
    }
    if (o.st === 'gone') {
      if (o.van === 'sled' && m.sled) { const q = (m.sleds || [m.sled]).find((z) => z.load && z.load.includes(o)) || m.sled; return { x: q.x, y: q.y - 30, cap: 5 }; }
      const v = m.disp ? m.disp.vans.find((q) => q.id === o.van) : null;
      if (!v) return this.last;
      if (v.st === 'curb' && v.tl) {
        const a = m.book.get(o.aid);
        const bt = v.tl.beats[Math.max(0, v.beat)];
        const ring = bt && (bt.k === 'ring' || bt.k === 'open' || bt.k === 'hand' || bt.k === 'joy') && bt.aid === o.aid;
        // (the doorstep beats frame the courier and the door; the walk there, the van and the courier together)
        const vd = view.vans && view.vans.get(v.id), cr = vd && vd.courier && vd.courier.px !== undefined ? { x: vd.courier.px, y: vd.courier.py } : null;
        const d = a ? a.door : { x: v.x, y: v.y };
        const p = ring ? (cr ? { x: (cr.x + d.x) / 2, y: (cr.y + d.y) / 2 } : d) : cr ? { x: (v.x + cr.x) / 2, y: (v.y + cr.y) / 2 } : { x: (v.x + d.x) / 2, y: (v.y + d.y) / 2 };
        return { x: p.x, y: p.y - 40, cap: ring ? 6 : 5 };
      }
      return { x: v.x, y: v.y - 40, cap: v.st === 'load' ? 4 : 5 };
    }
    return this.last;
  }

  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const w = this.where();
    if (w) this.last = w;
    const view = this.view, V = view.P.view;
    if (w) {
      if (V && V.lookAt) V.lookAt(w.x, w.y, ZOOM);
      if (w.reveal !== undefined) view.hub.reveal(!!w.reveal);
      if (w.cap !== this.cap) { this.cap = w.cap; this.caption(); }
    }
    // (critique H6) stop() hides the caption: return at once, or the banner check below shows it again for good
    if (this.doneT >= 0) { this.doneT += dt; if (this.doneT > HOLD) { this.stop(); return; } }
    if (this.t > 240) { this.stop(); return; }          // never longer than 4 minutes
    if (this.c && this.active) {
      const a = Math.min(1, this.capT += dt * 5); this.c.setScale(0.85 + 0.15 * a);
      // (in the game: the 금방 개업 banner sits in the caption's band for its 3.6 s — the caption waits under it)
      const U = view.P.ui, under = !!(U && U.bannerOn && U.bannerOn());
      if (this.c.visible === under) this.c.setVisible(!under);
    }
  }

  capUI() {
    const ui = this.view.uiScene;
    if (!ui || this.c) { if (this.c) this.c.setVisible(true); return; }
    // (right of the HUD's left column — the v4.2 rank / 32/32 / 정기 납품 chips end at x ≈ 300, y ≈ 300 — and well above
    //  the subject at the screen's centre: a van's roof sign never meets it)
    this.c = ui.add.container(360, 400 + (View.safeTop || 0)).setDepth(DEPTH.TOP - 12);
    this.bg = null;
    this.tx = ui.add.text(0, -6, '', textStyle(34, '#2B4F7E', '#ffffff', 0, '900')).setOrigin(0.5, 0.5);
    this.sub = ui.add.text(0, 44, gt('gb_follow_skip', null, this.view.lang()), textStyle(24, '#ffffff', '#2b2f3a', 6, '800')).setOrigin(0.5, 0.5);
    this.c.add([this.tx, this.sub]);
  }

  caption() {
    if (!this.c) return;
    const ui = this.view.uiScene, L = this.view.lang();
    this.tx.setText(gt('gb_follow_cap_' + this.cap, null, L));
    const w = Math.max(240, this.tx.width + 90);
    if (this.bg) this.bg.destroy();
    this.bg = nine(ui, 'ui_gb_ribbon', w, 64);
    if (this.bg) this.bg.setOrigin(0.5, 0.5).setPosition(0, -4);
    else { this.bg = ui.add.graphics(); this.bg.fillStyle(0xf2b33d, 1).fillRoundedRect(-w / 2, -36, w, 64, 30); }
    this.c.addAt(this.bg, 0);
    this.c.setVisible(true);
    this.capT = 0;
    if (this.cap === 1) this.view.sound('sfx_gb_chime');
  }

  destroy() { this.stop(); if (this.c) this.c.destroy(); }
}
