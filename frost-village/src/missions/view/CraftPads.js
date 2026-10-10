// Pads in the world (v4 Pad entity + the house float labels), shown only while something needs them:
//   꽃밭 (a flower bed): stand 3 s on its pad → a bouquet (≤ 12 per bed per game day). Shown while a mission needs a
//                bouquet the bag does not hold, or while today's "꽃 5송이 꺾기" (F7) is open (critique H-1).
//   빵집 케이크 (the bakery): bring 12 bread → the 빵집 아주머니 bakes a cake in 20 s → pick it up
//   선물 포장 (the general store): stand with any 3 goods → a gift box (nothing is taken with fewer, critique M-2)
//   꽃집 (the town's flower shop, when the game has one): a bouquet for 25 coins
//   출발 (the yard): a drive mission sets off here (critique C-2)
// Plus the sparkle of a lost thing to find (the mitten, the puppy …) and the ring that fills while the chief stands
// at a mission spot. The beds' picks and a cake in the oven are kept in the save (model.craftState).

import { Pad } from '../../entities/Pad.js';
import { Assets, icon, reicon, TXT, panel } from './ui.js';
import { mt } from '../strings.js';
import { unitsOf } from '../model/units.js';

const BAG = ['item_bouquet', 'item_cake', 'item_gift_box'];
const GOODS = ['item_bread', 'item_fish_cooked', 'item_meat_cooked', 'item_can', 'item_plank', 'item_ingot'];

export class CraftPads {
  constructor(host) {
    this.host = host;
    this.s = host.ports.world.scene;
    this.pads = new Map();      // pad id → { pad, label, item, kind, t, x, y }
    this.spark = new Map();     // mission id → sprite set
    const cr = host.model.craftState || {};
    this.picked = new Map((cr.p || []).map(([id, n]) => [id, { day: cr.d, n }]));   // bed id → { day, n }
    this.cake = Number.isFinite(cr.k) ? { t: cr.k, ready: cr.k >= host.cfg.craft.cakeTime } : null;
    this.ring = this.s.add.graphics().setDepth(41000);
    this.t = 0;
    this.warned = null;         // the pad whose "need more" line was just said
  }

  /** what to keep in the save (a few bytes) */
  saveState() {
    const day = this.host.ports.clock.day();
    const p = [];
    for (const [id, v] of this.picked) if (v.day === day && v.n > 0 && typeof id === 'string' && id.length <= 24) p.push([id, v.n]);
    const cr = { d: day };
    if (p.length) cr.p = p.slice(0, 6);
    if (this.cake) cr.k = Math.round(Math.min(this.host.cfg.craft.cakeTime, this.cake.t) * 10) / 10;
    this.host.model.craftState = cr;
  }

  /** which bag items are wanted now (missions in progress need more than the bag holds) */
  wanted() {
    const m = this.host.model, need = {};
    for (const i of m.list) {
      if (i.s !== 'a' && i.s !== 'b') continue;
      unitsOf(m.template(i)).forEach((u, j) => { if (u.t === 'deliver' && u.item && BAG.indexOf(u.item) >= 0) need[u.item] = (need[u.item] || 0) + Math.max(0, u.need - i.g[j]); });
    }
    for (const k in need) need[k] = Math.max(0, need[k] - (m.bag[k] || 0));
    return need;
  }

  /** today's "pick flowers" daily is still open */
  flowersToday() {
    const td = this.host.model.today();
    return !!(td && td.list.some((x) => x.code === 'F7' && !x.done));
  }

  /** the drive missions waiting to set off: [{ id, place }] */
  drives() {
    const h = this.host, out = [];
    if (h.driving || !h.wired('drive')) return out;
    for (const i of h.model.list) {
      if (i.s !== 'a' && i.s !== 'b') continue;
      const c = h.current(i);
      if (!c || c.u.how !== 'drive') continue;
      const from = (c.u.o && c.u.o.from) || 'p:yard', p = h.ports.places.pos(from);
      if (p && !out.some((d) => d.place === from)) out.push({ id: i.id, place: from, x: p.x, y: p.y, sled: c.u.o && c.u.o.vehicle === 'dog_sled' });
    }
    return out;
  }

  places() {
    const P = this.host.ports.places, out = [];
    for (const b of (P.list ? P.list('flowerbed') : [])) out.push({ id: b.id, x: b.x, y: b.y, item: 'item_bouquet', kind: 'bed' });
    const flo = P.pos('p:florist'); if (flo) out.push({ id: 'p:florist', x: flo.x, y: flo.y, item: 'item_bouquet', kind: 'buy' });
    const bake = P.pos('p:bakery'); if (bake) out.push({ id: 'p:bakery', x: bake.x, y: bake.y, item: 'item_cake', kind: 'cake' });
    const gift = P.pos('p:gift'); if (gift) out.push({ id: 'p:gift', x: gift.x, y: gift.y, item: 'item_gift_box', kind: 'gift' });
    return out;
  }

  /** a pad that makes `item` (for the hint arrow) */
  sourceOf(item) {
    for (const p of this.places()) if (p.item === item && p.kind !== 'buy') return { x: p.x, y: p.y };
    for (const p of this.places()) if (p.item === item) return { x: p.x, y: p.y };
    return null;
  }

  pad(id, x, y, iconKey, tint) {
    let v = this.pads.get(id);
    if (v) return v;
    const pad = new Pad(this.s, x, y, 'input', 1.3, { tex: Assets.pick('ui_pad_register', 'ui_pad_input'), tint, icon: iconKey, iconSize: 44 });
    const label = this.label(x, y - 74, iconKey);
    v = { pad, label, t: 0, x, y };
    this.pads.set(id, v);
    pad.pulse();
    return v;
  }

  update(dt) {
    this.t += dt;
    const h = this.host, P = h.ports, m = h.model, lang = h.lang(), C = h.cfg.craft;
    const need = this.wanted();
    const ch = P.chief, cx = ch.x(), cy = ch.y(), still = !ch.moving();
    const want = new Set();
    let onAny = null;
    const bob = (v) => { v.label.c.y = v.y - 74 + Math.sin(this.t * 2.2 + v.x * 0.01) * 4; };
    for (const pl of this.places()) {
      const show = pl.kind === 'bed' ? (need.item_bouquet > 0 || this.flowersToday())
        : pl.kind === 'cake' ? (need.item_cake > 0 || !!this.cake)
          : need[pl.item] > 0;
      if (!show) continue;
      want.add(pl.id);
      const v = this.pad(pl.id, pl.x, pl.y, pl.item, 0xffd6e6);
      bob(v);
      const on = v.pad.contains(cx, cy);
      if (on) onAny = pl.id;
      if (pl.kind === 'bed') {
        const day = P.clock.day(), pk = this.picked.get(pl.id) || { day, n: 0 };
        if (pk.day !== day) { pk.day = day; pk.n = 0; }
        this.picked.set(pl.id, pk);
        const left = C.bouquetsPerBed - pk.n;
        this.setLabel(v, left > 0 ? mt(lang, 'i_item_bouquet') + ' ' + left : mt(lang, 'i_tomorrow'));
        if (on && still && left > 0) {
          v.t += dt;
          if (v.t >= C.bouquetStand) { v.t = 0; pk.n++; m.pick(1); if (ch.flyIn) ch.flyIn('item_bouquet', pl.x, pl.y - 30); P.sound.play('sfx_harvest', { volume: 0.6 }); }
        } else v.t = 0;
        this.drawRing(on ? v.t / C.bouquetStand : 0, pl.x, pl.y);
      } else if (pl.kind === 'buy') {
        this.setLabel(v, mt(lang, 'm_buy_bouquet', { n: C.bouquetBuy }));
        if (on && still) {
          v.t += dt;
          if (v.t > 0.6) {
            v.t = -0.6;
            if (P.coins.value() >= C.bouquetBuy) { P.coins.spend(C.bouquetBuy); m.craft('item_bouquet', 1); if (ch.flyIn) ch.flyIn('item_bouquet', pl.x, pl.y - 30); P.sound.play('sfx_coin', { volume: 0.5 }); }
            else this.need(pl.id, mt(lang, 'm_pay_short', { n: C.bouquetBuy }));
          }
        } else v.t = 0;
      } else if (pl.kind === 'cake') {
        if (this.cake && !this.cake.ready) {
          this.cake.t += dt;
          this.setLabel(v, mt(lang, 'm_secs', { n: Math.max(1, Math.ceil(C.cakeTime - this.cake.t)) }));
          if (this.cake.t >= C.cakeTime) { this.cake.ready = true; P.sound.play('sfx_build_done', { volume: 0.6 }); }
        } else if (this.cake && this.cake.ready) {
          this.setLabel(v, mt(lang, 'i_item_cake') + ' ✓');
          if (on) { this.cake = null; m.craft('item_cake', 1); if (ch.flyIn) ch.flyIn('item_cake', pl.x, pl.y - 40); }
        } else {
          this.setLabel(v, mt(lang, 'm_cake_from', { n: C.cakeBread }));
          if (on && still) {
            if (ch.count('item_bread') >= C.cakeBread) { ch.take('item_bread', C.cakeBread, pl.x, pl.y - 40); this.cake = { t: 0, ready: false }; P.sound.play('sfx_drop', { volume: 0.6 }); }
            else this.need(pl.id, mt(lang, 'm_cake_from', { n: C.cakeBread }));
          }
        }
      } else if (pl.kind === 'gift') {
        const n = C.giftItems;
        this.setLabel(v, mt(lang, 'i_item_gift_box') + ' (' + n + ')');
        if (on && still) {
          v.t += dt;
          if (v.t > 0.6) {
            v.t = 0;
            // only when the chief holds enough goods: nothing is taken for a half-made gift
            let have = 0;
            for (const it of GOODS) have += ch.count(it);
            if (have >= n) {
              let got = 0;
              for (const it of GOODS) { while (got < n && ch.count(it) > 0) { if (ch.take(it, 1, pl.x, pl.y - 30) > 0) got++; else break; } }
              if (got >= n) { m.craft('item_gift_box', 1); if (ch.flyIn) ch.flyIn('item_gift_box', pl.x, pl.y - 40); P.sound.play('sfx_unlock', { volume: 0.6 }); }
            } else this.need(pl.id, mt(lang, 'm_gift_need', { n }));
          }
        } else v.t = 0;
      }
    }
    if (this.warned && this.warned !== onAny) this.warned = null;     // (stepped off: the next visit may say it again)
    // drive missions: the 출발 pad at the yard (one per place)
    for (const d of this.drives()) {
      const id = 'drive:' + d.place;
      want.add(id);
      const v = this.pad(id, d.x, d.y, 'ui_icon_steer', 0xd6ecff);
      bob(v);
      this.setLabel(v, mt(lang, d.sled ? 'm_drive_sled' : 'm_drive_truck'));
      const on = v.pad.contains(cx, cy);
      if (on && still) {
        v.t += dt;
        if (v.t >= h.cfg.drive.startStand) { v.t = -2; h.startDrive(d.id); }
      } else v.t = Math.min(0, v.t + dt);
      this.drawRing(on && v.t > 0 ? v.t / h.cfg.drive.startStand : 0, d.x, d.y);
    }
    for (const [id, v] of this.pads) if (!want.has(id)) { v.pad.img.destroy(); if (v.pad.icon) v.pad.icon.destroy(); v.label.c.destroy(); this.pads.delete(id); }
    // the ring of a mission spot the chief stands on
    const st = h.stand;
    if (st && st.id) this.drawRing(st.t / st.need, st.x, st.y);
    else if (!this.ringOwner) this.ring.clear();
    this.ringOwner = false;
    // sparkles twinkle
    for (const sp of this.spark.values()) { sp.a.setAlpha(0.6 + 0.4 * Math.sin(this.t * 6)); sp.a.setScale(sp.s * (0.85 + 0.25 * Math.sin(this.t * 4))); sp.b.setRotation(this.t * 1.5); }
  }

  /** a pad says what it still needs (once per visit) */
  need(id, text) {
    if (this.warned === id) return;
    this.warned = id;
    this.host.ports.ui.toast(text, 1500);
    this.host.ports.sound.play('sfx_error', { volume: 0.35 });
  }

  drawRing(f, x, y) {
    if (!(f > 0)) return;
    this.ringOwner = true;
    const g = this.ring;
    g.clear();
    g.lineStyle(9, 0xffffff, 0.75); g.beginPath(); g.arc(x, y - 110, 24, 0, Math.PI * 2); g.strokePath();
    g.lineStyle(9, 0xe35d8c, 1); g.beginPath(); g.arc(x, y - 110, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, f), false); g.strokePath();
  }

  label(x, y, item) {
    const s = this.s;
    const c = s.add.container(x, y).setDepth(y + 2000);
    const bg = panel(s, 0, 0, 'ui_panel', 140, 48).setOrigin(0.5);
    const ic = icon(s, -48, 0, [item], 32);
    const tx = s.add.text(-28, 0, '', TXT(19, '#2b2f3a', '#ffffff', 0, '800')).setOrigin(0, 0.5);
    c.add([bg, ic, tx]);
    return { c, bg, ic, tx, key: '' };
  }

  setLabel(v, text) {
    const L = v.label;
    if (L.key === text) return;
    L.key = text;
    L.tx.setText(text);
    const w = Math.max(110, L.tx.width + 76);
    L.bg.setSize(w, 48);
    L.ic.setX(-w / 2 + 26);
    L.tx.setX(-w / 2 + 48);
  }

  /** a lost thing glints in the snow */
  sparkle(id, x, y, what) {
    const s = this.s;
    const a = Assets.image(s, x, y - 14, Assets.pick('fx_spark', 'fx_star')).setDepth(y + 1).setBlendMode(Phaser.BlendModes.ADD);
    const sc = 44 / Math.max(1, a.frame.realWidth);
    a.setScale(sc);
    const b = Assets.image(s, x, y - 14, Assets.pick('fx_star', 'fx_spark')).setDepth(y + 2).setTint(0xfff3a0);
    b.setScale(26 / Math.max(1, b.frame.realWidth));
    const f = Assets.has('decal_footprints') ? Assets.image(s, x - 40, y + 10, 'decal_footprints').setDepth(-13500).setAlpha(0.7) : null;
    if (f) f.setScale(0.6);
    this.spark.set(id, { a, b, f, s: sc });
  }

  unsparkle(id, found) {
    const sp = this.spark.get(id);
    if (!sp) return;
    this.spark.delete(id);
    if (found) { this.s.tweens.add({ targets: [sp.a, sp.b], scale: 0.01, alpha: 0, duration: 260, onComplete: () => { sp.a.destroy(); sp.b.destroy(); } }); }
    else { sp.a.destroy(); sp.b.destroy(); }
    if (sp.f) this.s.tweens.add({ targets: sp.f, alpha: 0, delay: 2000, duration: 800, onComplete: () => sp.f.destroy() });
  }

  destroy() {
    for (const v of this.pads.values()) { v.pad.img.destroy(); if (v.pad.icon) v.pad.icon.destroy(); v.label.c.destroy(); }
    for (const id of Array.from(this.spark.keys())) this.unsparkle(id, false);
    this.ring.destroy();
  }
}
