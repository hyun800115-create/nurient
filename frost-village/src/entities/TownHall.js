// 마을회관 (v4-C, docs/기획서_v4_추가요청.md §3): the village's town hall on an XL plot of the west strip.
//   - 세금 상자 (tax box): a cash pad that fills with coins for every resident (balance.js civic.hall.taxPerPerson
//     coins a minute each, up to taxCap); the chief collects it like any till
//   - 마을 게시판 (notice board): today's requests and news from the systems that already exist (the order board,
//     the big restaurant, empty beds, the next goal) — the place v5's missions will go
//   - more room (civic.hall.people beds) and a happier village (civic.hall.happy, Civic.happyBonus)
//   - the venue: the 승격식 (rank ceremony) pad stands in front of the hall once it is built, and `venue(kind)` is
//     the hook a v5 wedding will use
// The hall's picture is town art (page town_civic@hall, a late fragment): a stand-in until it arrives.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { BALANCE } from '../data/balance.js';
import { t, fmt } from '../data/strings.js';
import { Pad } from './Pad.js';
import { CashPad } from './Seller.js';
import { TownBuilding } from './TownBuilding.js';
import { floatLabel } from './Shop.js';

// places in front of the hall (px from the plot centre; the hall faces −Y: its front is lower left)
const SPOT = { tax: [-20, 168], board: [-268, 64], boardPad: [-200, 128], venue: [-150, 196], wedding: [-110, 150] };

export class TownHall {
  constructor(gs, site, instant) {
    this.gs = gs; this.site = site;
    this.x = site.x; this.y = site.y;
    this.enabled = true;
    this.key = 'town_hall';
    const P = (k) => ({ x: this.x + SPOT[k][0], y: this.y + SPOT[k][1] });
    // the tax box
    const tp = P('tax');
    this.tax = new CashPad(gs, tp.x, tp.y);
    this.taxAcc = 0;
    this.taxT = 0;
    this.taxLabel = floatLabel(gs, tp.x + 6, tp.y - 168, 'ui_icon_coin');
    // the notice board (a life prop: loaded with the village) and its pad
    const bp = P('board');
    const r = Assets.sprite('notice_board');
    this.board = gs.add.image(bp.x, bp.y, r.tex, r.frame).setOrigin(r.anchor[0], r.anchor[1]).setDepth(bp.y);
    if (gs.lazyImage) gs.lazyImage(this.board, 'notice_board');
    this.boardOb = gs.collision.add(bp.x, bp.y, 28, 'board');
    const pp = P('boardPad');
    this.boardPad = new Pad(gs, pp.x, pp.y, 'input', 1.3, { tex: Assets.pick('ui_pad_register', 'ui_pad_input'), tint: 0xd8f0ff, icon: Assets.pick('ui_icon_mission', 'ui_icon_request', 'ui_icon_people'), iconSize: 40 });
    this.boardLabel = floatLabel(gs, pp.x, pp.y - 70, null);
    this.boardLabel.set(t('hall_board'));
    this.boardStand = 0;
    this.boardLeave = false;
    this.bellHour = -1;
    this.bld = null;
    this.makeArt();
    if (!instant) gs.time.delayedCall(1500, () => { if (gs.life) gs.life.cheer(); });
  }

  /** the hall's picture: town art (its manifest first) */
  makeArt() {
    const gs = this.gs;
    const go = () => {
      if (this.bld || !gs.sys || !gs.sys.isActive()) return;
      this.bld = new TownBuilding(gs, { id: 'c1_hall', key: 'town_hall', x: this.x, y: this.y, role: 'hall' });
      this.bld.setEnabled && this.bld.setEnabled(this.enabled);
      if (!this.enabled && this.bld.img) this.bld.img.setVisible(false);
    };
    if (gs.civic) gs.civic.needArt(['town_hall'], go); else go();
  }

  /** the door (new residents of the hall's rooms walk here) */
  get door() { return this.bld && this.bld.door ? { x: this.bld.door.x, y: this.bld.door.y + 8 } : { x: this.x - 127, y: this.y + 71 }; }

  /** a place for an event in front of the hall: 'rank' (승격식), 'wedding' (v5) */
  venue(kind) { const s = SPOT[kind === 'wedding' ? 'wedding' : 'venue']; return { x: this.x + s[0], y: this.y + s[1] }; }

  taxPerMin() {
    const gs = this.gs, H = (BALANCE.civic && BALANCE.civic.hall) || {};
    const n = gs.life ? gs.life.people() : 0;
    return Math.max(0, Number(H.taxPerPerson) || 0) * n;
  }

  update(dt) {
    const gs = this.gs, H = (BALANCE.civic && BALANCE.civic.hall) || {};
    const cap = Math.max(1, Math.floor(Number(H.taxCap) || 1500));
    // taxes: a little every few seconds, coins fly out of the hall door into the box
    if (this.tax.value < cap) this.taxAcc += (this.taxPerMin() / 60) * dt;
    this.taxT -= dt;
    if (this.taxT <= 0) {
      this.taxT = 6;
      const n = Math.min(Math.floor(this.taxAcc), cap - this.tax.value);
      if (n > 0) {
        this.taxAcc -= n;
        const door = this.bld && this.bld.door ? this.bld.door : { x: this.x - 127, y: this.y + 63 };
        if (gs.isOnScreen(this.tax.x, this.tax.y, 200)) this.tax.add(n, door.x, door.y - 40);
        else this.tax.value += n;
      }
      if (this.tax.value >= cap) this.taxAcc = 0;
    }
    this.tax.update(dt);
    const now = gs.time.now;
    this.taxLabel.set(this.tax.value >= cap ? t('hall_tax_full') : t('hall_tax', { n: Math.round(this.taxPerMin()) }));
    this.taxLabel.bob(now);
    this.boardLabel.bob(now + 700);
    // the bell at noon (once the neighbours' clock runs)
    const ck = gs.v4 && gs.v4.clock;
    if (ck && ck.on && ck.hour) {
      const h = Math.floor(ck.hour());
      if (h !== this.bellHour) { if (h === 12 && this.bellHour >= 0 && gs.isOnScreen(this.x, this.y, 400)) Audio.play(Audio.exists('sfx_bell_hall') ? 'sfx_bell_hall' : 'sfx_unlock', { volume: 0.6 }); this.bellHour = h; }
    }
  }

  /** the chief on the tax box (CashPad.update collects) or the board pad (stand still: the board opens) */
  playerPads(dt) {
    const gs = this.gs, p = gs.player;
    if (!this.enabled) return false;
    let on = false;
    if (this.tax.pad.contains(p.x, p.y)) on = true;
    if (this.boardPad.contains(p.x, p.y)) {
      on = true;
      if (!this.boardLeave) {
        this.boardStand += dt;
        if (this.boardStand >= (Number(BALANCE.player.padDelay) || 0.5) && p.vx === 0 && p.vy === 0) { this.boardLeave = true; this.openBoard(); }
      }
    } else { this.boardStand = 0; this.boardLeave = false; }
    return on;
  }

  openBoard() {
    const gs = this.gs;
    const s = gs.scene.get('UI');
    if (s && s.openBoard) s.openBoard();
    Audio.play('sfx_click', { volume: 0.5 });
  }

  /** what the board shows: [{ icon, text }] requests, then news */
  boardLines() {
    const gs = this.gs, out = { requests: [], news: [] };
    const req = (icon, text) => out.requests.push({ icon, text });
    const news = (icon, text) => out.news.push({ icon, text });
    // requests: the neighbours' focus order, an empty pantry at the restaurant, people waiting for a home, hungry miners
    const g = gs.v4 && gs.v4.growth;
    if (g && g.active && g.focusCard) {
      const c = g.focusCard();
      if (c) for (const k in c.need) if ((c.got[k] || 0) < c.need[k]) { req(k, t('board_order', { item: t(k), got: c.got[k] || 0, need: c.need[k], shop: c.shop ? t('shop_' + c.shop) : t('order_standing') })); break; }
    }
    const R = gs.civic && gs.civic.restaurant;
    if (R) { const low = R.lowFood(); if (low) req(low, t('board_rest_low', { item: t(low) })); }
    if (gs.life && gs.life.waiting.length) req('ui_icon_house', t('board_homes', { n: gs.life.waiting.length }));
    if (gs.foodBox && gs.foodBox.active && gs.foodBox.count === 0 && gs.workers.some((w) => w.hungry)) req('item_bread', t('board_miners'));
    // news: the village in numbers
    const cv = gs.civic;
    if (gs.life) news('ui_icon_house', t('board_people', { n: gs.life.people(), cap: gs.popCap() }));
    if (cv) { const v = cv.freeBeds(); if (v > 0 && gs.progress.complete) news('ui_icon_house', t('board_vacant', { n: v })); if (cv.settlers > 0) news('ui_icon_happy', t('board_settlers', { n: cv.settlers })); }
    if (R) news('item_fish_cooked', t('board_rest_special', { coins: fmt(R.comboPrice()) }));
    const happy = g && g.happiness ? g.happiness() : null;
    if (happy !== null) news('ui_icon_happy', t('board_happy', { n: happy }));
    else if (cv) news('ui_icon_happy', t('board_decor', { n: cv.happyBonus() }));
    news('ui_icon_coin', t('board_tax', { n: Math.round(this.taxPerMin()) }));
    const tu = gs.tutorial && gs.tutorial.goalText ? gs.tutorial.goalText() : null;
    if (tu && tu.text) news('ui_icon_goal', tu.text);
    return out;
  }

  setEnabled(v) {
    this.enabled = v;
    this.tax.setEnabled(v); this.boardPad.setVisible(v); this.board.setVisible(v);
    this.taxLabel.c.setVisible(v); this.boardLabel.c.setVisible(v);
    if (this.bld && this.bld.img) this.bld.img.setVisible(v);
  }
  revealObjects() { const o = [this.board, this.tax.pad.img, this.boardPad.img]; if (this.bld && this.bld.img) o.push(this.bld.img); return o; }

  serialize() { return { tax: this.tax.serialize(), acc: Math.round(this.taxAcc * 100) / 100 }; }
  restore(d) {
    if (!d || typeof d !== 'object') return;
    const cap = Math.max(1, Math.floor(Number(((BALANCE.civic && BALANCE.civic.hall) || {}).taxCap) || 1500));
    this.tax.restore(Math.min(cap, Math.max(0, Math.floor(Number(d.tax) || 0))));
    this.taxAcc = Math.max(0, Math.min(1000, Number(d.acc) || 0));
  }
  state() { return { tax: this.tax.value, perMin: Math.round(this.taxPerMin() * 10) / 10, art: !!(this.bld && this.bld.img && Assets.has('town_hall')) }; }
}
