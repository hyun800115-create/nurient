// GbApp (view, plan §6 + ui6 appLayout): the 금방 마켓 app — a non-pausing 720 × 1100 logical panel drawn as the
// chief's phone (ui_gb_phone + notch, the gold header with the logo and the tagline, 금방이 runs in from the right),
// five tabs (오늘 · 주문 · 상품 · 기사님 · 후기, icon + word), a scrolling content rect (drag), cards (ui_gb_card):
//   오늘     주문 · 배달 · 줄어든 재고 · 코인, the rack bars per category (with the level a game day ago), 특가, the
//            newest review
//   주문     ≤ 12 open + 6 done cards: who + items, the tracker 주문 → 고르기 → 포장 → 배달 중 → 도착 (badges AND words), the
//            ETA, 따라가기 (the camera follows the parcel; any touch hands it back), the doorstep photo of done ones
//   상품     every catalogue item: stock, 금방 price, status (특가 / 판매 중 / 가게 먼저 / 품절), 팔기·쉬기, 특가
//   기사님   the vans and the sled with their drivers and what they do; the offered upgrade card (들이기 · cost)
//   후기     the last 12 reviews (4–5 stars)
// Taps ≥ 88 logical (44 CSS), body text 30, nothing under 24. Rebuilt only when its data changed (≤ 2 Hz).

import { View } from '../../core/View.js';
import { DEPTH } from '../../systems/DepthSort.js';
import { spriteOf, frameOf, textStyle, sprAnim } from './art.js';
import { nine, lay } from './GbChip.js';
import { gt, itemsLine, costLine, GB_ITEM_NAMES } from '../strings.js';
import { catOf } from '../model/orders.js';

const TABS = [['today', 'gb_tab_today', 'ui_icon_gb_today'], ['orders', 'gb_tab_orders', 'ui_icon_gb_order'], ['goods', 'gb_tab_goods', 'ui_icon_gb_catalog'], ['crew', 'gb_tab_crew', 'ui_icon_gb_crew'], ['reviews', 'gb_tab_reviews', 'ui_icon_gb_review']];
const STEPS = ['order', 'pick', 'pack', 'go', 'done'];
const CATS = ['materials', 'food', 'goods', 'tools'];
const VAN_LINE = { bay: 'gb_van_idle', load: 'gb_van_bay', out: 'gb_van_drive', leg: 'gb_van_drive', curb: 'gb_van_curb', home: 'gb_van_back', spurA: 'gb_van_back', spurB: 'gb_van_back', pivot: 'gb_van_back', reverse: 'gb_van_back', wait: 'gb_van_wait', break: 'gb_van_break' };
const UP_ICON = { pack: 'ui_icon_gb_catalog', van2: 'ui_icon_gb_van', van3: 'ui_icon_gb_van', sled2: 'ui_icon_gb_sled', lockA: 'ui_icon_gb_locker', lockP: 'ui_icon_gb_locker', dawn: 'ui_icon_gb_dawn', back: 'ui_icon_gb_van' };
const UP_WHY = { pack: 'gb_up_why_pack', van2: 'gb_up_why_van', van3: 'gb_up_why_van', sled2: 'gb_up_why_sled', dawn: 'gb_up_why_dawn', lockA: 'gb_up_why_lock', lockP: 'gb_up_why_lock', back: 'gb_up_why_back' };
const NAVY = '#2B4F7E', BROWN = '#6B5D48', INK = '#3B3F52';
const hhmm = (T) => { const h = ((T / 25) % 24 + 24) % 24; return String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0'); };

export class GbApp {
  constructor(view) {
    this.view = view; this.m = view.m;
    const ui = this.ui = view.uiScene, L = this.L = lay();
    this.open = false; this.tab = 'today'; this.dirty = true; this.sig = ''; this.refreshT = 0; this.scroll = 0; this.contentH = 0;
    this.levels = {}; this.levelDay = -1;
    const H = View.H || 1280;
    this.top = Math.round((H - L.panel[1]) / 2);
    this.n = 0;
    // the dim behind the phone (a tap there closes the app)
    this.dim = ui.add.rectangle(360, H / 2, 720, H, 0x1d2b44, 0.3).setDepth(DEPTH.TOP - 6).setVisible(false).setInteractive();
    this.dim.on('pointerdown', () => this.close());
    this.root = ui.add.container(0, this.top).setDepth(DEPTH.TOP - 5).setVisible(false);
    // the phone
    const ph = nine(ui, 'ui_gb_phone', L.panel[0], L.panel[1]);
    if (ph) this.root.add(ph.setOrigin(0, 0));
    else { const g = ui.add.graphics(); g.fillStyle(0x3b3f52, 1).fillRoundedRect(0, 0, L.panel[0], L.panel[1], 56).fillStyle(0xf8f1e4, 1).fillRoundedRect(L.screen[0], L.screen[1], L.screen[2], L.screen[3], 30); this.root.add(g); }
    // swallow taps on the phone itself (non-pausing, but the village does not get them)
    const pz = ui.add.zone(0, 0, L.panel[0], L.panel[1]).setOrigin(0, 0).setInteractive();
    pz.on('pointerdown', (p) => { this.dragY = p.y; this.dragS = this.scroll; this.dragging = p.y > this.top + L.content[1]; });
    pz.on('pointermove', (p) => { if (this.dragging && p.isDown) this.setScroll(this.dragS - (p.y - this.dragY)); });
    pz.on('pointerup', () => { this.dragging = false; });
    this.root.add(pz);
    const notch = spriteOf('ui_gb_phone_notch');
    if (notch) this.root.add(ui.add.image(L.notch[0], L.notch[1], notch.tex, notch.frame));
    // the header
    const Hd = L.header, hr = Hd.rect;
    const hb = nine(ui, 'ui_gb_header', hr[2], hr[3]);
    if (hb) this.root.add(hb.setOrigin(0, 0).setPosition(hr[0], hr[1]));
    else { const g = ui.add.graphics(); g.fillStyle(0xf2b33d, 1).fillRoundedRect(hr[0], hr[1], hr[2], hr[3], { tl: 30, tr: 30, bl: 0, br: 0 }); this.root.add(g); }
    const logo = spriteOf('ui_gb_logo_' + (view.lang() === 'en' ? 'en' : 'ko'));
    if (logo) this.root.add(ui.add.image(Hd.logo[0], Hd.logo[1], logo.tex, logo.frame).setOrigin(0, 0).setScale(Hd.logo[2]));
    else this.root.add(ui.add.text(Hd.logo[0], Hd.logo[1] + 6, gt('gb_app', null, view.lang()), textStyle(48, NAVY, '#fff7e6', 8, '900')).setOrigin(0, 0));
    this.tagline = ui.add.text(Hd.tagline[0], Hd.tagline[1], gt('gb_tagline', null, view.lang()), textStyle(Hd.tagline[2], NAVY, '#fff7e6', 0, '800')).setOrigin(0, 0.5);
    this.root.add(this.tagline);
    // the mascot runs in under the close button (masked by the screen)
    const ms = spriteOf('ui_gb_mascot');
    if (ms) {
      this.mascot = ui.add.sprite(Hd.mascot[0], Hd.mascot[1], ms.tex, ms.frame).setOrigin(ms.anchor[0], ms.anchor[1]).setScale(Hd.mascot[2]);
      const mg = ui.make.graphics({ add: false }); mg.fillStyle(0xffffff).fillRect(L.screen[0], this.top + L.screen[1], L.screen[2], L.screen[3]);
      this.mascot.setMask(mg.createGeometryMask());
      this.root.add(this.mascot);
    }
    const cl = Hd.close;
    const cg = ui.add.graphics();
    cg.fillStyle(0xfff7e6, 1).fillCircle(cl[0], cl[1], cl[2] / 2 + 4).lineStyle(4, 0x2b4f7e, 1).strokeCircle(cl[0], cl[1], cl[2] / 2 + 4);
    cg.lineStyle(5, 0x2b4f7e, 1).lineBetween(cl[0] - 9, cl[1] - 9, cl[0] + 9, cl[1] + 9).lineBetween(cl[0] + 9, cl[1] - 9, cl[0] - 9, cl[1] + 9);
    this.root.add(cg);
    const cz = ui.add.zone(cl[0] - 44, cl[1] - 44, 88, 88).setOrigin(0, 0).setInteractive();
    cz.on('pointerdown', () => this.close());
    this.root.add(cz);
    // the tabs
    this.tabs = [];
    const T = L.tabs, x0 = Math.round((L.panel[0] - (TABS.length * T.w + (TABS.length - 1) * T.gap)) / 2);
    TABS.forEach(([id, key, icon], i) => {
      const x = x0 + i * (T.w + T.gap), y = T.y;
      const off = nine(ui, 'ui_gb_tab', T.w / T.scale, 64), on = nine(ui, 'ui_gb_tab_on', T.w / T.scale, 64);
      for (const b of [off, on]) if (b) { b.setOrigin(0, 0).setScale(T.scale).setPosition(x, y); this.root.add(b); }
      const ic = spriteOf(icon);
      const im = ic ? ui.add.image(x + T.w / 2, y + 12 + T.icon / 2, ic.tex, ic.frame).setDisplaySize(T.icon, T.icon) : null;
      if (im) this.root.add(im);
      const fs = view.lang() === 'en' ? T.fontEn : T.font;
      const tx = ui.add.text(x + T.w / 2, y + 12 + T.icon + T.iconGap, gt(key, null, view.lang()), textStyle(fs, T.colorOff, '#ffffff', 0, '900')).setOrigin(0.5, 0);
      this.root.add(tx);
      const z = ui.add.zone(x, y, T.w, T.h).setOrigin(0, 0).setInteractive();
      z.on('pointerdown', () => this.show(id));
      this.root.add(z);
      this.tabs.push({ id, off, on, tx, im });
    });
    // the content (masked, scrolled)
    const C = L.content;
    this.content = ui.add.container(C[0], C[1]);
    const mk = ui.make.graphics({ add: false }); mk.fillStyle(0xffffff).fillRect(C[0], this.top + C[1], C[2], C[3]);
    this.content.setMask(mk.createGeometryMask());
    this.root.add(this.content);
    this.items = [];
  }

  // ------------------------------------------------------------------------------------------ open / close
  show(tab) {
    const first = !this.open;
    this.open = true;
    this.root.setVisible(true); this.dim.setVisible(true);
    if (tab && tab !== this.tab) { this.tab = tab; this.scroll = 0; }
    this.dirty = true;
    for (const t of this.tabs) {
      const on = t.id === this.tab;
      if (t.on) t.on.setVisible(on); if (t.off) t.off.setVisible(!on);
      t.tx.setColor(on ? this.L.tabs.colorOn : this.L.tabs.colorOff);
      if (t.im) t.im.setAlpha(on ? 1 : 0.75);
    }
    if (first && this.mascot) {
      const R = this.L.header.mascotRunIn || { from: [763, 174], to: [540, 174], ms: 600 };
      this.mascot.setPosition(R.from[0], R.from[1]);
      const run = sprAnim(this.ui, 'ui_gb_mascot', 'run'), idle = sprAnim(this.ui, 'ui_gb_mascot', 'idle');
      if (run) this.mascot.play(run);
      this.runT = 0; this.runFrom = R.from; this.runTo = R.to; this.runMs = R.ms; this.idleAnim = idle;
    }
    this.view.sound('sfx_gb_chime');
    this.refresh(true);
  }

  close() {
    this.open = false;
    this.root.setVisible(false); this.dim.setVisible(false);
  }

  setScroll(s) { this.scroll = Math.max(0, Math.min(Math.max(0, this.contentH - this.L.content[3]), s)); this.content.y = this.L.content[1] - this.scroll; }

  update(dt) {
    if (!this.open) return;
    if (this.runT !== undefined && this.runT >= 0 && this.mascot) {
      this.runT += dt * 1000;
      const u = Math.min(1, this.runT / this.runMs);
      this.mascot.setPosition(this.runFrom[0] + (this.runTo[0] - this.runFrom[0]) * u, this.runFrom[1]);
      if (u >= 1) { this.runT = -1; if (this.idleAnim) this.mascot.play(this.idleAnim); }
    }
    this.refreshT -= dt;
    if (this.refreshT <= 0) { this.refreshT = 0.5; this.refresh(false); }
  }

  // ------------------------------------------------------------------------------------------ building blocks
  clear() { for (const o of this.items) o.destroy(); this.items.length = 0; }
  add(o) { this.content.add(o); this.items.push(o); return o; }
  txt(x, y, s, size, color = INK, o = {}) {
    const t = this.ui.add.text(x, y, s, textStyle(size, color, o.stroke || '#ffffff', o.st || 0, o.w || '800')).setOrigin(o.ox || 0, o.oy || 0);
    if (o.wrap) t.setWordWrapWidth(o.wrap, true);
    if (o.align) t.setAlign(o.align);
    return this.add(t);
  }
  icon(key, x, y, size, alpha = 1) { const s = spriteOf(key); if (!s) return null; return this.add(this.ui.add.image(x, y, s.tex, s.frame).setDisplaySize(size, size).setAlpha(alpha)); }
  card(y, h) {
    const W = this.L.card.w;
    const c = nine(this.ui, 'ui_gb_card', W, h);
    if (c) this.add(c.setOrigin(0, 0).setPosition(0, y));
    else { const g = this.ui.add.graphics(); g.fillStyle(0xfffbf3, 1).fillRoundedRect(0, y, W, h, 24).lineStyle(3, 0xe3d3b4, 1).strokeRoundedRect(0, y, W, h, 24); this.add(g); }
    return y;
  }
  /** a pill button (ui_gb_chip at 64 × scale), ≥ 88 tall to tap */
  button(x, y, w, label, fn, o = {}) {
    const k = o.scale || this.L.button.scale || 1.375, h = 64;
    const b = nine(this.ui, o.key || 'ui_gb_chip', w / k, h);
    if (b) this.add(b.setOrigin(0, 0).setScale(k).setPosition(x, y));
    else { const g = this.ui.add.graphics(); g.fillStyle(0xfff7e6, 1).fillRoundedRect(x, y, w, h * k, (h * k) / 2).lineStyle(3, 0xf2b33d, 1).strokeRoundedRect(x, y, w, h * k, (h * k) / 2); this.add(g); }
    let tx = x + w / 2;
    if (o.icon) { const ic = spriteOf(o.icon); if (ic) { this.icon(o.icon, x + 48, y + (h * k) / 2, 40); tx = x + 48 + 24 + (w - 72) / 2; } }
    this.txt(tx, y + (h * k) / 2, label, o.font || 28, o.color || NAVY, { ox: 0.5, oy: 0.5, w: '900' });
    const z = this.add(this.ui.add.zone(x, y, w, Math.max(88, h * k)).setOrigin(0, 0).setInteractive());
    z.on('pointerup', (p) => { if (Math.abs(p.y - (this.dragY || p.y)) > 14) return; fn(); });
    return h * k;
  }

  // ------------------------------------------------------------------------------------------ the tabs
  signature() {
    const m = this.m, t = m.settle.today;
    switch (this.tab) {
      case 'today': return [t.orders, t.delivered, t.coins, t.units, CATS.map((c) => Math.round(this.level(c) * 50)).join(','), Object.keys(m.orders.deals).join(','), m.settle.rev.length && m.settle.rev[0].join('')].join('|');
      case 'orders': return m.orders.list.map((o) => o.id + o.st + (o.van || '')).join(',') + '|' + (this.view.recent || []).map((r) => r.id).join(',') + '|' + Math.floor(m.T / 10);
      case 'goods': return Object.keys(m.tune.catalog).map((k) => this.count(k) + (m.orders.dealOn(k, m.T) ? 'd' : '') + (m.orders.selling[k] === false ? 'x' : '') + (m.guard.paused(k) ? 'p' : '')).join(',');
      case 'crew': return (m.disp ? m.disp.vans.map((v) => v.st + v.stopI).join(',') : '') + '|' + (m.sled ? m.sled.st + m.sled.queue.length : '') + '|' + (m.up.offer || '') + JSON.stringify(m.up.lv);
      case 'reviews': return m.settle.rev.map((r) => r.join(':')).join(',');
      default: return '';
    }
  }

  count(k) { const s = this.view.host.env.source; return s && s.count ? s.count(k) : 0; }
  level(c) { const s = this.view.host.env.source; return s && s.level ? s.level(c) : 0; }

  refresh(force) {
    // yesterday's rack levels (the view keeps them; not saved)
    const day = this.m.day;
    if (day !== this.levelDay) { this.prevLevels = this.levelDay >= 0 ? Object.assign({}, this.levels) : null; this.levelDay = day; }
    for (const c of CATS) this.levels[c] = this.level(c);
    const sig = this.tab + '#' + this.signature();
    if (!force && sig === this.sig && !this.dirty) return;
    this.sig = sig; this.dirty = false;
    this.clear();
    const L = this.view.lang();
    let h = 0;
    if (this.tab === 'today') h = this.today(L);
    else if (this.tab === 'orders') h = this.orders(L);
    else if (this.tab === 'goods') h = this.goods(L);
    else if (this.tab === 'crew') h = this.crew(L);
    else h = this.reviews(L);
    this.contentH = h;
    this.setScroll(this.scroll);
    this.n = this.items.length;
  }

  today(L) {
    const m = this.m, t = m.settle.today, C = this.L.card;
    let y = 0;
    // four numbers
    this.card(y, 232);
    const cells = [['gb_today_orders', t.orders, 'ui_icon_gb_order'], ['gb_today_delivered', t.delivered, 'ui_icon_gb_van'], ['gb_today_drop', t.units, 'ui_icon_gb_catalog'], ['gb_today_coins', t.coins, spriteOf('ui_icon_coin') ? 'ui_icon_coin' : 'ui_icon_gb_today']];
    cells.forEach(([k, v, ic], i) => {
      const cx = 28 + (i % 2) * 310, cy = y + 24 + Math.floor(i / 2) * 100;
      this.icon(ic, cx + 30, cy + 40, 52);
      this.txt(cx + 68, cy + 6, gt(k, null, L), C.small, BROWN);
      this.txt(cx + 68, cy + 38, (i === 2 ? '−' : '') + Number(v).toLocaleString(), 40, NAVY, { w: '900' });
    });
    y += 232 + C.gap;
    // the racks (now, and a game day ago)
    this.card(y, 300);
    this.txt(28, y + 20, gt('gb_today_racks', null, L), C.font, INK, { w: '900' });
    const g = this.add(this.ui.add.graphics());
    CATS.forEach((c, i) => {
      const by = y + 76 + i * 54, lv = this.levels[c] || 0, pv = this.prevLevels ? this.prevLevels[c] : null;
      this.txt(28, by - 2, gt('gb_cat_' + c, null, L), C.small, BROWN);
      const x0 = 200, w = 400;
      g.fillStyle(0xeee3cf, 1).fillRoundedRect(x0, by + 4, w, 26, 13);
      g.fillStyle(0xf2b33d, 1).fillRoundedRect(x0, by + 4, Math.max(26, w * lv), 26, 13);
      if (pv !== null && pv !== undefined) { g.fillStyle(0x2b4f7e, 1).fillRect(x0 + w * pv - 2, by - 2, 4, 38); }
    });
    if (this.prevLevels) this.txt(600, y + 26, '▮ ' + gt('gb_today_yday', null, L), 24, NAVY, { ox: 1 });
    y += 300 + C.gap;
    // deals + the newest review
    const deals = Object.keys(m.orders.deals).filter((k) => m.orders.dealOn(k, m.T)).slice(0, 4);
    const rev = m.settle.rev[0];
    this.card(y, 220);
    this.txt(28, y + 20, gt('gb_today_deals', null, L), C.font, INK, { w: '900' });
    if (deals.length) deals.forEach((k, i) => { const cx = 100 + i * 150; this.icon(k, cx, y + 104, 84); this.txt(cx, y + 150, (GB_ITEM_NAMES[L] || GB_ITEM_NAMES.ko)[k] || k, 24, BROWN, { ox: 0.5, wrap: 140, align: 'center' }); });
    else this.txt(28, y + 74, '—', C.small, BROWN);
    y += 220 + C.gap;
    if (rev) {
      this.card(y, 180);
      this.txt(28, y + 20, gt('gb_today_review', null, L), C.small, BROWN);
      this.stars(28, y + 70, rev[2]);
      this.txt(28, y + 100, gt('gb_rev_' + rev[0], null, L), C.font, INK, { wrap: 590 });
      y += 180 + C.gap;
    }
    return y;
  }

  stars(x, y, n) { for (let i = 0; i < 5; i++) { const k = i < n ? 'ui_gb_star_full' : 'ui_gb_star_empty'; if (!this.icon(k, x + 16 + i * 34, y + 10, 30)) this.txt(x + i * 30, y - 6, i < n ? '★' : '☆', 28, '#d9962a'); } }

  orders(L) {
    const m = this.m, C = this.L.card, O = this.L.orderCard, host = this.view.host;
    let y = 0;
    const open = m.orders.list.slice(0, 12), done = (this.view.recent || []).slice(0, 6);
    this.txt(8, y, gt('gb_open_orders', { n: m.orders.list.length }, L) + ' · ' + gt('gb_done_orders', { n: m.settle.today.delivered }, L), C.small, BROWN);
    y += 48;
    if (!open.length && !done.length) { this.card(y, 160); this.txt(323, y + 80, gt('gb_no_orders', null, L), C.font, BROWN, { ox: 0.5, oy: 0.5 }); return y + 160; }
    for (const o of open) {
      this.card(y, O.h);
      this.txt(28, y + 22, host.who(o.aid, o.hid), C.font, INK, { w: '900' });
      this.txt(28, y + 64, itemsLine(o.got, L) + (o.tomorrow ? ' · ' + gt('gb_tomorrow', null, L) : ''), C.small, BROWN);
      const cur = o.st === 'pick' ? 1 : o.st === 'pack' ? 2 : 3;
      this.tracker(y + O.trackerY - 10, cur, L, o.st === 'ready');
      this.txt(28, y + O.etaY, gt('gb_eta', { s: this.eta(o) }, L), C.small, NAVY, { w: '900' });
      this.button(O.button[0] + 96, y + O.button[1] - 8, O.button[2] + 20, gt('gb_follow', null, L), () => { this.close(); host.api.follow(o.id); }, { icon: 'ui_icon_gb_follow' });
      y += O.h + C.gap;
    }
    for (const r of done) {
      const ph = r.how === 'doorstep' && (this.view.photos || []).find((p) => p.aid === r.aid);
      this.card(y, 200);
      this.txt(28, y + 22, host.who(r.aid, r.hid), C.font, INK, { w: '900' });
      this.txt(28, y + 64, gt('gb_eta_done', { t: hhmm(r.T) }, L) + (r.how === 'doorstep' ? ' · ' + gt('gb_doorstep_done', null, L) : ''), C.small, BROWN);
      this.icon('ui_gb_step_done_on', 60, y + 140, 54);
      this.txt(100, y + 124, '+' + (r.coins || 0), C.font, NAVY, { w: '900' });
      if (ph && this.ui.textures.exists(ph.key)) {
        const fr = spriteOf('ui_gb_photo');
        const px = 460, py = y + 100;
        this.add(this.ui.add.image(px - 88 + 24 + 64, py - 68 + 16 + 40, ph.key).setDisplaySize(128, 80));
        if (fr) this.add(this.ui.add.image(px, py, fr.tex, fr.frame));
      }
      y += 200 + C.gap;
    }
    return y;
  }

  /** the five steps: badges (on / off), the line between, and the word under each (never colour alone) */
  tracker(y, cur, L, waiting) {
    const T = this.L.tracker, n = STEPS.length, g = this.add(this.ui.add.graphics());
    const xs = STEPS.map((s, i) => T.x0 + (i * (T.x1 - T.x0)) / (n - 1));
    for (let i = 0; i < n - 1; i++) { g.lineStyle(8, i < cur ? 0xf2b33d : 0xe3d3b4, 1).lineBetween(xs[i] + T.badge / 2, y, xs[i + 1] - T.badge / 2, y); }
    const fs = L === 'en' ? T.labelFontEn : T.labelFont, words = [];
    STEPS.forEach((s, i) => {
      const on = i <= cur;
      if (!this.icon('ui_gb_step_' + s + '_' + (on ? 'on' : 'off'), xs[i], y, T.badge, i === cur && waiting ? 0.75 : 1)) { g.fillStyle(on ? 0xf2b33d : 0xe3d3b4, 1).fillCircle(xs[i], y, T.badge / 2); }
      words.push(this.txt(xs[i], y + T.badge / 2 + T.labelGap, gt('gb_step_' + (i + 1), null, L), fs, i === cur ? T.colorNow : on ? T.colorDone : T.colorOff, { ox: 0.5, w: i === cur ? '900' : '700' }));
    });
    // the five words share one scale so they fit the card side by side ("On the way · Delivered"), then slide apart
    const GAP = 10, lo = 12, hi = this.L.card.w - 12;
    const k = Math.min(1, (hi - lo - GAP * (n - 1)) / words.reduce((a, t) => a + t.width, 0));
    const hw = words.map((t) => { t.setScale(k); return (t.width * k) / 2; });
    const x = xs.slice();
    x[0] = Math.max(x[0], lo + hw[0]);
    for (let i = 1; i < n; i++) x[i] = Math.max(x[i], x[i - 1] + hw[i - 1] + hw[i] + GAP);
    x[n - 1] = Math.min(x[n - 1], hi - hw[n - 1]);
    for (let i = n - 2; i >= 0; i--) x[i] = Math.min(x[i], x[i + 1] - hw[i + 1] - hw[i] - GAP);
    words.forEach((t, i) => { t.x = x[i]; });
  }

  /** seconds to the door (estimate): what is left of the hub work, the wait for a van, the route */
  eta(o) {
    const m = this.m, H = m.tune.hub, V = m.tune.van;
    let s = 0;
    if (o.st === 'pick') s += (o.lines.length - o.picked) * H.pickLineS + H.packS + V.waitS * 0.5 + 60;
    else if (o.st === 'pack') s += H.packS + V.waitS * 0.5 + 60;
    else if (o.st === 'ready' && !o.van) s += V.waitS * 0.4 + 60;
    else {
      const v = m.disp && m.disp.vans.find((q) => q.id === o.van);
      if (v) {
        const left = v.path ? Math.max(0, v.path.len - v.s) : 0;
        let ahead = 0;
        for (let k = v.stopI; k < v.tour.length; k++) { if (v.tour[k].visits.some((q) => q.orders.indexOf(o) >= 0)) break; ahead++; }
        s += left / 4 + ahead * 28 + (v.st === 'load' ? V.loadS : 0) + 12;
      } else s += 40;
    }
    return Math.max(10, Math.round(s / 10) * 10);
  }

  goods(L) {
    const m = this.m, C = this.L.card;
    let y = 0;
    const names = GB_ITEM_NAMES[L] || GB_ITEM_NAMES.ko;
    const items = Object.keys(m.tune.catalog).sort((a, b) => CATS.indexOf(catOf(a)) - CATS.indexOf(catOf(b)) || (a < b ? -1 : 1));
    let cat = null;
    for (const k of items) {
      if (catOf(k) !== cat) { cat = catOf(k); this.txt(8, y + 6, gt('gb_cat_' + cat, null, L), C.small, BROWN, { w: '900' }); y += 48; }
      const h = 150;
      this.card(y, h);
      this.icon(k, 62, y + h / 2, 72);
      this.txt(112, y + 16, names[k] || k, C.font, INK, { w: '900' });
      const price = m.orders.priceOf(k, (q) => (this.view.host.env.price ? this.view.host.env.price(q) : 1));
      const n = this.count(k);
      this.txt(112, y + 56, gt('gb_goods_stock', { n }, L) + ' · ' + gt('gb_goods_price', { p: price }, L), 26, BROWN);
      // status (icon-free words on a ribbon: 특가 / 판매 중 / 가게 먼저 / 품절 / 쉬는 중)
      const paused = m.orders.selling[k] === false, deal = m.orders.dealOn(k, m.T), guard = m.guard.paused(k), out = n <= m.tune.orders.keepFloor;
      const st = paused ? 'gb_resting' : out ? 'gb_soldout' : guard ? 'gb_shop_first' : deal ? 'gb_deal' : 'gb_selling';
      this.ribbon(112, y + 116, gt(st, null, L), st === 'gb_deal');
      // 팔기 · 쉬기 and 특가 (the hit areas are 88 tall)
      this.toggle(420, y + 20, !paused, L, () => { m.sell(k, paused); this.dirty = true; this.refresh(true); });
      if (!deal && !paused) this.smallButton(546, y + 84, gt('gb_deal_btn', null, L), () => { this.view.host.api.deal(k); this.dirty = true; this.refresh(true); });
      y += h + 10;
    }
    return y;
  }

  ribbon(x, y, label, gold) {
    // display size w x 36 (the 9-slice is drawn at 4/3 and scaled 0.75 so its corners stay crisp); the word is centred on it
    const t = this.ui.add.text(0, 0, label, textStyle(24, gold ? NAVY : BROWN, '#ffffff', 0, '900'));
    const w = Math.ceil(t.width + 40);
    const r = gold ? nine(this.ui, 'ui_gb_ribbon', w / 0.75, 48) : null;
    if (r) this.add(r.setOrigin(0, 0.5).setPosition(x, y).setScale(0.75));
    else { const g = this.add(this.ui.add.graphics()); g.fillStyle(gold ? 0xf2b33d : 0xeee3cf, 1).fillRoundedRect(x, y - 17, w, 34, 17); }
    t.setPosition(x + w / 2, y).setOrigin(0.5, 0.5);
    this.add(t);
  }

  toggle(x, y, on, L, fn) {
    const T = this.L.toggle, g = this.add(this.ui.add.graphics());
    g.fillStyle(on ? 0xf2b33d : 0xd8cdb8, 1).fillRoundedRect(x, y + 6, T.w, T.h, T.h / 2);
    g.fillStyle(0xffffff, 1).fillCircle(on ? x + T.w - T.h / 2 : x + T.h / 2, y + 6 + T.h / 2, T.h / 2 - 5);
    this.txt(x + T.w + 10, y + 6 + T.h / 2, gt(on ? 'gb_sell_on' : 'gb_sell_off', null, L), 26, on ? NAVY : BROWN, { oy: 0.5, w: '900' });
    const z = this.add(this.ui.add.zone(x - 10, y - 16, T.w + 110, T.hitH).setOrigin(0, 0).setInteractive());
    z.on('pointerup', (p) => { if (Math.abs(p.y - (this.dragY || p.y)) > 14) return; fn(); });
  }

  smallButton(x, y, label, fn) {
    const g = this.add(this.ui.add.graphics());
    g.fillStyle(0xfff7e6, 1).fillRoundedRect(x, y, 84, 44, 22).lineStyle(3, 0xf2b33d, 1).strokeRoundedRect(x, y, 84, 44, 22);
    this.txt(x + 42, y + 22, label, 24, NAVY, { ox: 0.5, oy: 0.5, w: '900' });
    const z = this.add(this.ui.add.zone(x - 4, y - 22, 92, 88).setOrigin(0, 0).setInteractive());
    z.on('pointerup', (p) => { if (Math.abs(p.y - (this.dragY || p.y)) > 14) return; fn(); });
  }

  crew(L) {
    const m = this.m, C = this.L.card, host = this.view.host;
    let y = 0;
    // the offered upgrade first
    const off = m.up.offer;   // a kind ('van2'); the price comes from up.cost(kind)
    if (off) {
      this.card(y, C.h);
      this.icon(UP_ICON[off] || 'ui_icon_gb', 70, y + 70, 76);
      this.txt(124, y + 26, gt(m.up.name(off), null, L), 34, NAVY, { w: '900' });
      const n = off === 'pack' ? m.orders.list.filter((o) => o.st === 'pick' || o.st === 'pack').length : off === 'dawn' ? m.settle.today.overnight : off === 'sled2' ? (m.sled ? m.sled.queue.length : 0) : m.orders.list.filter((o) => o.st === 'ready').length;
      this.txt(124, y + 76, gt(UP_WHY[off], { n }, L), C.small, BROWN, { wrap: 490 });
      this.button(C.w - 330, y + C.h - 112, 300, gt('gb_up_buy', { cost: costLine(m.up.cost(off), L) }, L), () => { if (host.api.upgrade(off)) { this.dirty = true; this.refresh(true); } });
      y += C.h + C.gap;
    }
    const vans = m.disp ? m.disp.vans : [];
    for (const v of vans) {
      this.card(y, 150);
      this.icon('ui_icon_gb_van', 66, y + 75, 80);
      this.txt(124, y + 26, gt(v.night ? (v.id === 1 ? 'gb_crew_n1' : 'gb_crew_n2') : 'gb_crew_d' + v.id, null, L), C.font, INK, { w: '900' });
      const stop = v.tour[v.stopI], who = stop && stop.visits[0] ? host.who(stop.visits[0].aid, stop.visits[0].orders[0] && stop.visits[0].orders[0].hid) : '';
      this.txt(124, y + 74, gt(VAN_LINE[v.st] || 'gb_van_idle', { who }, L) + (v.load.length ? ' · ' + gt('gb_tag_s', { n: v.load.length }, L) : ''), C.small, BROWN, { wrap: 490 });
      y += 150 + C.gap;
    }
    if (m.sled) {
      this.card(y, 150);
      this.icon('ui_icon_gb_sled', 66, y + 75, 80);
      this.txt(124, y + 26, gt('gb_crew_rider', null, L), C.font, INK, { w: '900' });
      this.txt(124, y + 74, gt(m.sled.st === 'stand' ? 'gb_sled_idle' : 'gb_sled_run', null, L) + (m.sled.queue.length ? ' · ' + gt('gb_tag_s', { n: m.sled.queue.length }, L) : ''), C.small, BROWN, { wrap: 490 });
      y += 150 + C.gap;
    } else if (m.village) {
      this.card(y, 130);
      this.icon('ui_icon_gb_sled', 66, y + 65, 72, 0.5);
      this.txt(124, y + 44, gt('gb_sled_soon', null, L), C.small, BROWN, { wrap: 490 });
      y += 130 + C.gap;
    }
    // the hub crew (names)
    this.card(y, 150);
    this.txt(28, y + 24, [gt('gb_crew_dispatcher', null, L), gt('gb_crew_picker', null, L), gt('gb_crew_packer', null, L), gt('gb_crew_sorter', null, L)].join(' · '), C.small, INK, { wrap: 590 });
    this.txt(28, y + 92, gt('gb_driver_name', null, L), 26, BROWN);
    y += 150 + C.gap;
    return y;
  }

  reviews(L) {
    const m = this.m, C = this.L.card, host = this.view.host;
    let y = 0;
    if (!m.settle.rev.length) { this.card(y, 160); this.txt(323, y + 80, '—', C.font, BROWN, { ox: 0.5, oy: 0.5 }); return 160; }
    for (const r of m.settle.rev.slice(0, 12)) {
      this.card(y, 170);
      this.stars(28, y + 30, r[2]);
      this.txt(220, y + 22, host.who(r[1], null), 26, BROWN);
      this.txt(28, y + 76, gt('gb_rev_' + r[0], null, L), C.font, INK, { wrap: 590 });
      y += 170 + C.gap;
    }
    return y;
  }

  objects() { return this.open ? 30 + this.items.length : 0; }
  destroy() { this.clear(); this.root.destroy(); this.dim.destroy(); }
}
