// 수출 부두 · 경매 발판 (harbor_runtime view): the two pads the chief (and trucks / porters) drop goods on, painted
// on the quay with a chip that says what is wanted — the open export order's items left and when its ship
// leaves; the auction pad's fish waiting and the next bell. Items taken from the chief hop onto the pad.

import { PADS, LR } from '../layout.js';
import { padTex, Chip, has, put, DEPTH } from './art.js';
import { ht, itemName } from '../strings.js';
import { hourOf } from '../model/time.js';

export class Pads {
  constructor(view) {
    this.v = view;
    this.sc = view.scene;
    this.pads = {};
    this.hops = [];
    this.t = 0;
  }

  make(kind) {
    const sc = this.sc, p = PADS[kind], [x, y] = LR(p.i, p.j);
    const key = kind === 'export' ? padTex(sc, 'hb_pad_export', '#2e4a7a', 'rgba(244,236,214,0.92)') : padTex(sc, 'hb_pad_auction', '#2a8a8a', 'rgba(222,244,240,0.92)');
    const img = sc.add.image(x, y, key).setDepth(DEPTH.PAD);
    const icon = put(sc, kind === 'export' ? 'crate_stack' : 'item_fish_big', x, y + 4, DEPTH.PAD_ITEM);
    if (icon) icon.setScale(kind === 'export' ? 0.34 : 0.9).setAlpha(0.9);
    const chip = new Chip(sc, DEPTH.LABEL - 10);
    const sub = new Chip(sc, DEPTH.LABEL - 10);
    return (this.pads[kind] = { x, y, img, icon, chip, sub, text: '' });
  }

  update(dt) {
    const v = this.v, m = v.model;
    this.t -= dt;
    for (const kind of ['export', 'auction']) {
      const on = m.has(kind === 'export' ? 'crane' : 'auction');
      let P = this.pads[kind];
      if (!on) { if (P) this.vis(P, false); continue; }
      if (!P) P = this.make(kind);
      const near = v.near(P.x, P.y, 160);
      this.vis(P, near);
      if (!near || this.t > 0) continue;
      const lang = v.lang();
      if (kind === 'export') {
        const c = m.trade.current(m.T);
        P.chip.set(P.x, P.y - 158, ht(lang, 'exportPad'), 0xffffff);
        if (c) {
          const left = Object.keys(c.items).map((k) => [k, c.items[k] - (c.got[k] || 0)]).filter((q) => q[1] > 0).map((q) => itemName(lang, q[0]) + ' ' + q[1]).join(' · ');
          const h = Math.floor(hourOf(c.due)), mm = Math.floor((hourOf(c.due) % 1) * 60);
          P.sub.set(P.x, P.y - 124, (left || ht(lang, 'exportDone')) + '  ·  ' + ht(lang, 'sails', { t: h + ':' + String(mm).padStart(2, '0') }), 0xfff4dc).visible(true);
        } else P.sub.set(P.x, P.y - 124, ht(lang, 'exportGone'), 0xe8eef6).visible(true);
      } else {
        const A = m.auction, s = Math.round(A.next(m.T));
        const waiting = A.pad.item_fish_raw + A.pad.item_fish_big + A.boxes * 10;
        P.chip.set(P.x, P.y - 158, ht(lang, 'auctionPad') + (waiting ? '  ·  ' + ht(lang, 'fishWaiting', { n: waiting }) : ''), 0xffffff);
        P.sub.set(P.x, P.y - 124, ht(lang, 'nextBell', { s: Number.isFinite(s) ? s : '-' }), 0xdff4f0).visible(true);
      }
    }
    if (this.t <= 0) this.t = 0.25;
    // items hopping from the chief onto a pad
    for (const h of this.hops) {
      h.t += dt;
      const u = Math.min(1, h.t / 0.35);
      h.img.setPosition(h.x0 + (h.x1 - h.x0) * u, h.y0 + (h.y1 - h.y0) * u - Math.sin(Math.PI * u) * 60).setDepth(h.y1 + 50);
      if (u >= 1) { h.img.destroy(); h.done = true; }
    }
    this.hops = this.hops.filter((h) => !h.done);
  }

  vis(P, on) { P.img.setVisible(on); if (P.icon) P.icon.setVisible(on); P.chip.visible(on); P.sub.visible(on); }

  /** the host took `item` from the chief onto pad `kind` */
  took(kind, item) {
    const v = this.v, P = this.pads[kind], ch = v.ports.chief;
    if (!P || !has(item) || this.hops.length > 6) return;
    const x0 = ch && ch.x ? ch.x() : P.x, y0 = ch && ch.y ? ch.y() - 60 : P.y - 60;
    const img = put(this.sc, item, x0, y0, P.y + 50);
    if (!img) return;
    img.setScale(0.8);
    this.hops.push({ img, x0, y0, x1: P.x + (Math.random() - 0.5) * 40, y1: P.y - 6, t: 0 });
  }

  destroy() { for (const k in this.pads) { const P = this.pads[k]; P.img.destroy(); if (P.icon) P.icon.destroy(); P.chip.destroy(); P.sub.destroy(); } for (const h of this.hops) h.img.destroy(); }
}
