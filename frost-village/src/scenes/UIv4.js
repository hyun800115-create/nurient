// (v4-B, docs/v4_plan.md §15.2) the neighbour-town HUD of the UI scene: the rank chip (badge + 마을/읍 + three mini
// bars), the order chip (the focus card: item + got/need + a progress line), the clock (sun / moon + day arc), the
// train edge icon, and the two non-pausing panels (the order board, the rank). Every chip stays hidden until the
// station opens; a tap outside a panel closes it. All sizes in the UI scene's logical 720-wide space.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { Input } from '../core/Input.js';
import { View } from '../core/View.js';
import { panel } from '../core/Panel.js';
import { BALANCE } from '../data/balance.js';
import { FONT, t, fmt } from '../data/strings.js';
import { L4 } from '../data/world.js';

const TXT = (size, color = '#ffffff', stroke = '#2b2f3a', st = 7, weight = '900') => ({
  fontFamily: FONT, fontSize: size + 'px', fontStyle: weight, color, stroke, strokeThickness: st, resolution: 2,
});
const BAR = { people: 0x6bbf59, shops: 0xe8a33d, happy: 0xe35d8c };
const has = (k) => { try { return Assets.has(k); } catch (e) { return false; } };
const icon = (ui, x, y, keys, size) => { const k = Assets.pick(...keys); const im = Assets.image(ui, x, y, k).setOrigin(0.5); im.setScale(size / Math.max(1, im.frame.realWidth, im.frame.realHeight)); im.__k = k; im.__keys = keys; im.__size = size; return im; };
/** re-apply an icon whose atlas arrived late (the first key that now has art) */
const reicon = (im) => { if (!im || !im.__keys) return; const k = Assets.pick(...im.__keys); if (k === im.__k) return; im.__k = k; Assets.apply(im, k); im.setOrigin(0.5).setScale(im.__size / Math.max(1, im.frame.realWidth, im.frame.realHeight)); };

export class HudV4 {
  constructor(ui) {
    this.ui = ui;
    this.panel = null;
    this.t = 0;
    const gs = ui.gs;
    // ---- rank chip
    const rc = this.rankChip = ui.add.container(0, 0).setVisible(false).setDepth(20);
    this.rankBg = panel(ui, 0, 0, 'ui_panel', 156, 54).setOrigin(0, 0.5).setAlpha(0.95);
    this.rankBadge = icon(ui, 26, 0, ['ui_badge_rank_1', 'ui_icon_fame', 'ui_icon_lock'], 42);
    this.rankText = ui.add.text(52, -12, '', TXT(19, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0, 0.5);
    this.rankBars = ui.add.graphics();
    rc.add([this.rankBg, this.rankBadge, this.rankText, this.rankBars]);
    rc.setSize(156, 54);
    rc.setInteractive(new Phaser.Geom.Rectangle(78, 27, 156, 54), Phaser.Geom.Rectangle.Contains);
    rc.on('pointerup', () => this.openRank());
    // ---- order chip
    const oc = this.orderChip = ui.add.container(0, 0).setVisible(false).setDepth(20);
    this.orderBg = panel(ui, 0, 0, 'ui_panel', 260, 56).setOrigin(0, 0.5).setAlpha(0.95);
    this.orderIcon = icon(ui, 26, -1, ['ui_icon_mission', 'ui_icon_request', 'ui_icon_lock'], 36);
    this.orderItem = icon(ui, 66, -1, ['item_bread'], 38);
    this.orderText = ui.add.text(92, -3, '', TXT(22, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0, 0.5);
    this.orderLine = ui.add.graphics();
    oc.add([this.orderBg, this.orderIcon, this.orderItem, this.orderText, this.orderLine]);
    oc.setSize(260, 56);
    oc.setInteractive(new Phaser.Geom.Rectangle(130, 28, 260, 56), Phaser.Geom.Rectangle.Contains);
    oc.on('pointerup', () => this.openOrders());
    // ---- clock
    const ck = this.clock = ui.add.container(0, 0).setVisible(false).setDepth(20);
    this.clockG = ui.add.graphics();
    this.clockIcon = icon(ui, 0, 0, ['ui_icon_day', 'ui_icon_lock'], 38);
    ck.add([this.clockG, this.clockIcon]);
    // ---- train edge icon ((v4 review) a round badge with the snow train's engine in it and a pointer toward the
    //      train: the bare delivery icon read like a stray truck)
    const te = this.trainEdge = ui.add.container(0, 0).setVisible(false).setDepth(19);
    this.trainEdgeG = ui.add.graphics();
    this.trainEdgePtr = ui.add.graphics();
    this.trainEdgeIcon = icon(ui, 0, 0, ['ui_icon_delivery', 'ui_icon_porter', 'ui_icon_backpack'], 40);
    this.trainEdgeEngine = null;
    const g = this.trainEdgeG;
    g.fillStyle(0x1f3354, 0.25); g.fillCircle(0, 4, 31);
    g.fillStyle(0xfff8ec, 0.97); g.fillCircle(0, 0, 31);
    g.lineStyle(5, 0xe8a33d, 1); g.strokeCircle(0, 0, 29);
    const pg = this.trainEdgePtr;
    pg.fillStyle(0xe8a33d, 1); pg.fillTriangle(38, 0, 26, -10, 26, 10);
    te.add([pg, g, this.trainEdgeIcon]);
    this.layout();
  }

  get nb() { return this.ui.gs && this.ui.gs.v4; }

  layout() {
    const ui = this.ui, top = 62 + View.safeTop;
    this.rankChip.setPosition(188, top + 152);
    this.orderChip.setPosition(28, top + 212);
    this.clock.setPosition(ui.W - 62, top + 92);
    if (this.panel) this.closePanel(true);
  }

  /** bottom of the chips on screen (the dog bar keeps clear of them) */
  bottom() { return 62 + View.safeTop + (this.orderChip.visible ? 268 : this.rankChip.visible ? 178 : 178); }

  // ------------------------------------------------------------------ chips
  update(dt) {
    const ui = this.ui, nb = this.nb;
    this.t += dt;
    const open = !!(nb && nb.ours && nb.ours.open);
    const g = nb && nb.growth, rk = nb && nb.rank;
    const showRank = open && !!rk && !ui.gs.overview;
    const showOrder = open && !!(g && g.active && g.focusCard()) && !ui.gs.overview;
    const showClock = open && !!(nb && nb.clock && nb.clock.on) && !ui.gs.overview;
    if (this.rankChip.visible !== showRank) this.pop(this.rankChip, showRank);
    if (this.orderChip.visible !== showOrder) this.pop(this.orderChip, showOrder);
    if (this.clock.visible !== showClock) this.clock.setVisible(showClock);
    this.refreshT = (this.refreshT || 0) - dt;
    if (this.refreshT <= 0) {
      this.refreshT = 0.25;
      reicon(this.rankBadge); reicon(this.orderIcon); reicon(this.clockIcon); reicon(this.trainEdgeIcon);
      if (showRank) this.drawRank();
      if (showOrder) this.drawOrder();
      if (this.panel && this.panel.refresh) this.panel.refresh();
    }
    if (showClock) this.drawClock();
    this.updateTrainEdge();
  }

  pop(c, on) {
    const ui = this.ui;
    ui.tweens.killTweensOf(c);
    if (on) { c.setVisible(true).setScale(0.6).setAlpha(0); ui.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' }); }
    else c.setVisible(false);
  }

  drawRank() {
    const rk = this.nb.rank;
    const lv = rk.level;
    const badge = 'ui_badge_rank_' + Math.min(5, lv);
    if (this.rankBadge.__keys[0] !== badge) { this.rankBadge.__keys = [badge, 'ui_icon_fame', 'ui_icon_lock']; this.rankBadge.__k = null; reicon(this.rankBadge); }
    const txt = t('rank_' + lv);
    if (this.rankText.text !== txt) this.rankText.setText(txt);
    const bars = rk.bars();
    const key = bars.map((b) => b.v + '/' + b.need).join(',') + lv;
    if (key === this._rankKey) return;
    this._rankKey = key;
    const gr = this.rankBars;
    gr.clear();
    bars.forEach((b, i) => {
      const x = 52, y = 2 + i * 7, w = 92;
      gr.fillStyle(0x2b2f3a, 0.18); gr.fillRoundedRect(x, y, w, 4, 2);
      const f = lv >= 2 ? 1 : Math.max(0, Math.min(1, b.v / Math.max(1, b.need)));
      if (f > 0) { gr.fillStyle(BAR[b.key], 1); gr.fillRoundedRect(x, y, Math.max(4, w * f), 4, 2); }
    });
    this.rankBg.setSize(Math.max(156, 52 + Math.max(92, this.rankText.width) + 14), 54);
  }

  drawOrder() {
    const g = this.nb.growth, c = g.focusCard();
    if (!c) return;
    const ty = Object.keys(c.need).find((k) => c.got[k] < c.need[k]) || Object.keys(c.need)[0];
    if (this.orderItem.__keys[0] !== ty) { this.orderItem.__keys = [ty]; this.orderItem.__k = null; reicon(this.orderItem); }
    const s = c.got[ty] + '/' + c.need[ty] + '  ' + (c.shop ? t('order_to', { shop: t('shop_' + c.shop) }) : t('order_standing'));
    if (this.orderText.text !== s) {
      this.orderText.setText(s);
      this.orderText.setScale(Math.min(1, 210 / Math.max(1, this.orderText.width)));
      this.orderBg.setSize(Math.max(200, 92 + this.orderText.displayWidth + 16), 56);
    }
    let need = 0, got = 0;
    for (const k in c.need) { need += c.need[k]; got += Math.min(c.need[k], c.got[k]); }
    const f = need ? got / need : 0;
    const w = this.orderBg.width - 30;
    if (this._oline !== Math.round(f * 100) + ':' + w) {
      this._oline = Math.round(f * 100) + ':' + w;
      const l = this.orderLine;
      l.clear(); l.fillStyle(0x2b2f3a, 0.15); l.fillRoundedRect(15, 18, w, 4, 2);
      l.fillStyle(0xe8a33d, 1); l.fillRoundedRect(15, 18, Math.max(4, w * f), 4, 2);
    }
  }

  drawClock() {
    const nb = this.nb, h = nb.clock.hour(), night = h >= 19 || h < 6;
    const want = night ? 'ui_icon_night' : 'ui_icon_day';
    if (this.clockIcon.__keys[0] !== want) { this.clockIcon.__keys = [want, 'ui_icon_lock']; this.clockIcon.__k = null; reicon(this.clockIcon); }
    const k = Math.floor(h * 4);
    if (k === this._ck) return;
    this._ck = k;
    const gr = this.clockG;
    gr.clear();
    gr.fillStyle(0x1f3354, 0.22); gr.fillCircle(0, 3, 28);
    gr.fillStyle(night ? 0x2c3e66 : 0xfff8ec, 0.95); gr.fillCircle(0, 0, 28);
    gr.lineStyle(5, night ? 0x8fa6d8 : 0xffc83d, 1);
    gr.beginPath(); gr.arc(0, 0, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (h / 24), false); gr.strokePath();
  }

  /** the train is off screen while the chief is in the neighbours' area: an icon at the screen edge */
  updateTrainEdge() {
    const ui = this.ui, gs = ui.gs, nb = this.nb;
    let show = false;
    if (nb && nb.rail && nb.rail.running && gs.territory && gs.territory.areaOf && gs.territory.areaOf(gs.player.x) === 'neighbours' && !gs.overview && !this.panel) {
      const [x, y] = L4(nb.rail.iAt(nb.rail.m), 0);
      const p = ui.worldToScreen(x, y - 60);
      if (p.x < -20 || p.x > ui.W + 20 || p.y < 140 || p.y > ui.H + 20) {
        const M = 56, cx = ui.W / 2, cy = ui.H / 2;
        const ex = Phaser.Math.Clamp(p.x, M, ui.W - M), ey = Phaser.Math.Clamp(p.y, 330, ui.H - 430 - View.safeBottom);
        const a = Math.atan2(p.y - cy, p.x - cx);
        const bob = Math.sin(this.t * 5) * 4;
        this.trainEdge.setPosition(ex - Math.cos(a) * bob, ey - Math.sin(a) * bob);
        this.trainEdgePtr.setRotation(Math.atan2(p.y - ey, p.x - ex));
        this.trainEngineIcon();
        show = true;
      }
    }
    if (this.trainEdge.visible !== show) this.trainEdge.setVisible(show);
  }

  /** the engine's first idle frame in the badge (once the train's art is here), else the delivery icon */
  trainEngineIcon() {
    if (this.trainEdgeEngine) return;
    // (the train is rendered NE and drawn mirrored as NW: Train.js HEAD)
    const ui = this.ui, an = ui.anims.get('train_engine:idle:NE') || ui.anims.get('train_engine:move:NE');
    const f = an && an.frames && an.frames[0] ? an.frames[0].frame : null;
    if (!f || !f.texture || !ui.textures.exists(f.texture.key)) return;
    const im = ui.add.image(0, 4, f.texture.key, f.name).setOrigin(0.5, 0.62).setFlipX(true);
    im.setScale(50 / Math.max(1, f.realWidth, f.realHeight));
    this.trainEdgeEngine = im;
    this.trainEdge.add(im);
    this.trainEdgeIcon.setVisible(false);
  }

  // ------------------------------------------------------------------ panels (non-pausing; a tap outside closes)
  openPanel(build) {
    const ui = this.ui;
    if (this.panel) this.closePanel(true);
    if (ui.panelOpen || ui.buildOpen) return null;
    Input.release();
    const W = ui.W, H = ui.H;
    const c = ui.add.container(0, 0).setDepth(70);
    const dim = ui.add.rectangle(W / 2, H / 2, W * 2, H * 2, 0x1b2638, 0.35).setInteractive();
    dim.on('pointerup', () => this.closePanel());
    c.add(dim);
    const p = { c, items: [], refresh: null };
    this.panel = p;
    ui.v4PanelOpen = true;
    build(p);
    c.setAlpha(0);
    ui.tweens.add({ targets: c, alpha: 1, duration: 140 });
    Audio.play('sfx_click', { volume: 0.5 });
    return p;
  }

  closePanel(immediate) {
    const ui = this.ui, p = this.panel;
    if (!p) return;
    this.panel = null;
    ui.v4PanelOpen = false;
    if (immediate) { p.c.destroy(); return; }
    ui.tweens.add({ targets: p.c, alpha: 0, duration: 120, onComplete: () => p.c.destroy() });
  }

  /** the order board: up to 3 cards (shop, items got/need, progress, reward, 다른 주문) */
  openOrders() {
    const nb = this.nb, g = nb && nb.growth;
    if (!g || !g.active) return;
    this.openPanel((p) => {
      const ui = this.ui, W = ui.W, H = ui.H;
      const cw = Math.min(W - 60, 640), ch = 150, gap = 14;
      const n = Math.max(1, g.cards.length);
      const ph = 150 + n * (ch + gap) + 96;
      const top = Math.max(110 + View.safeTop, (H - ph) / 2);
      const boardKey = has('ui_mission_board') ? 'ui_mission_board' : 'ui_panel';
      const bg = panel(ui, W / 2, top + ph / 2, boardKey, cw + 40, ph).setOrigin(0.5).setInteractive();
      bg.on('pointerup', () => {});
      p.c.add(bg);
      p.c.add(ui.add.text(W / 2, top + 58, t('orders_title'), TXT(34, '#ffffff', '#5a3a26', 7, '900')).setOrigin(0.5));
      const close = ui.makeIconButton(W / 2 + cw / 2 + 2, top + 30, 'ui_icon_close', 62, () => this.closePanel());
      p.c.add(close);
      const content = ui.add.container(0, 0);
      p.c.add(content);
      const hint = ui.add.text(W / 2, top + ph - 50, t('order_hint'), Object.assign(TXT(17, '#5d4632', '#ffffff', 0, '800'), { align: 'center', lineSpacing: 4, wordWrap: { width: cw - 40 } })).setOrigin(0.5);
      p.c.add(hint);
      let lastKey = '';
      p.refresh = () => {
        const key = g.cards.map((c) => c.id + ':' + Object.values(c.got).join('.') + ':' + (g.canSwap(c) ? 1 : 0)).join('|');
        if (key === lastKey) return;
        lastKey = key;
        content.removeAll(true);
        if (!g.cards.length) { content.add(ui.add.text(W / 2, top + 150, t('order_empty'), TXT(24, '#5d4632', '#ffffff', 0, '800')).setOrigin(0.5)); return; }
        g.cards.forEach((c, i) => {
          const y = top + 110 + i * (ch + gap) + ch / 2, x0 = W / 2 - cw / 2;
          const done = g.cardDone(c);
          const cardKey = done ? 'ui_mission_card_done' : 'ui_mission_card';
          const card = panel(ui, W / 2, y, has(cardKey) ? cardKey : 'ui_panel', cw, ch).setOrigin(0.5);
          content.add(card);
          const name = c.shop ? t('shop_' + c.shop) : t('order_standing');
          content.add(ui.add.text(x0 + 48, y - 46, name, TXT(26, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0, 0.5));
          // item rows
          let ix = x0 + 48, need = 0, got = 0;
          for (const k in c.need) {
            const im = icon(ui, ix + 20, y - 4, [k], 40);
            const tx = ui.add.text(ix + 44, y - 4, c.got[k] + '/' + c.need[k], TXT(22, c.got[k] >= c.need[k] ? '#2f8f4e' : '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0, 0.5);
            content.add([im, tx]);
            ix += 44 + tx.width + 22;
            need += c.need[k]; got += Math.min(c.need[k], c.got[k]);
          }
          // progress bar
          const bw = cw - 260, by = y + 40, bx = x0 + 48;
          const pb = panel(ui, bx, by, has('ui_progress_bg') ? 'ui_progress_bg' : 'ui_panel', bw, 26).setOrigin(0, 0.5);
          content.add(pb);
          const f = need ? got / need : 0;
          if (f > 0) { const pf = panel(ui, bx, by, has('ui_progress_fill') ? 'ui_progress_fill' : 'ui_panel', Math.max(30, 30 + (bw - 30) * f), 26).setOrigin(0, 0.5); pf.setTint(done ? 0x5cc86a : 0xe8a33d); content.add(pf); }
          // reward (coins)
          const rw = g.cardReward(c);
          const coin = icon(ui, x0 + cw - 150, y - 44, ['ui_icon_coin'], 30);
          const rt = ui.add.text(x0 + cw - 130, y - 44, '+' + fmt(rw), TXT(22, '#b07a10', '#ffffff', 0, '900')).setOrigin(0, 0.5);
          content.add([coin, rt]);
          if (g.canSwap(c)) {
            const b = ui.makeButton(x0 + cw - 110, y + 34, 170, 62, 'blue', t('order_swap'), () => { g.swap(c.id); lastKey = ''; p.refresh(); }, 22);
            content.add(b);
          }
        });
      };
      p.refresh();
    });
  }

  /** the rank: the badge, three bars with ✓, the rewards of 읍 */
  openRank() {
    const nb = this.nb, rk = nb && nb.rank;
    if (!rk) return;
    this.openPanel((p) => {
      const ui = this.ui, W = ui.W, H = ui.H;
      const pw = Math.min(W - 40, 620), ph = 660;
      const top = Math.max(110 + View.safeTop, (H - ph) / 2);
      const bg = panel(ui, W / 2, top + ph / 2, 'ui_panel', pw, ph).setOrigin(0.5).setInteractive();
      bg.on('pointerup', () => {});
      p.c.add(bg);
      p.c.add(ui.makeIconButton(W / 2 + pw / 2 - 40, top + 40, 'ui_icon_close', 62, () => this.closePanel()));
      const lv = rk.level;
      const badge = icon(ui, W / 2, top + 100, ['ui_badge_rank_' + Math.min(5, lv), 'ui_icon_fame', 'ui_icon_lock'], 128);
      p.c.add(badge);
      p.c.add(ui.add.text(W / 2, top + 186, t('rank_panel') + ' · ' + t('rank_' + lv), TXT(30, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0.5));
      const content = ui.add.container(0, 0);
      p.c.add(content);
      let lastKey = '';
      p.refresh = () => {
        const bars = rk.bars();
        const key = bars.map((b) => b.v).join(',') + rk.level;
        if (key === lastKey) return;
        lastKey = key;
        content.removeAll(true);
        const x0 = W / 2 - pw / 2 + 40;
        if (rk.level < 2) {
          content.add(ui.add.text(W / 2, top + 236, t('rank_next'), TXT(22, '#6b7686', '#ffffff', 0, '800')).setOrigin(0.5));
          bars.forEach((b, i) => {
            const y = top + 288 + i * 64;
            content.add(ui.add.text(x0, y, t('bar_' + b.key), TXT(24, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0, 0.5));
            const bw = pw - 300, bx = x0 + 110;
            const gr = ui.add.graphics();
            gr.fillStyle(0x2b2f3a, 0.15); gr.fillRoundedRect(bx, y - 10, bw, 20, 10);
            const f = Math.max(0, Math.min(1, b.v / Math.max(1, b.need)));
            if (f > 0) { gr.fillStyle(BAR[b.key], 1); gr.fillRoundedRect(bx, y - 10, Math.max(20, bw * f), 20, 10); }
            content.add(gr);
            content.add(ui.add.text(bx + bw + 14, y, (b.full ? '✓ ' : '') + b.v + '/' + b.need, TXT(22, b.full ? '#2f8f4e' : '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0, 0.5));
          });
          content.add(ui.add.text(W / 2, top + 500, t('rank_rewards'), TXT(22, '#6b7686', '#ffffff', 0, '800')).setOrigin(0.5));
          const rw = ['rewardCobble', 'rewardRent', 'rewardCoach', 'rewardTown', 'rewardLots'].map((k) => '· ' + t(k)).join('\n');
          content.add(ui.add.text(W / 2, top + 574, rw, Object.assign(TXT(18, '#2b2f3a', '#ffffff', 0, '700'), { align: 'center', lineSpacing: 4 })).setOrigin(0.5));
        } else {
          content.add(ui.add.text(W / 2, top + 300, t('rank_title_2'), TXT(30, '#2f8f4e', '#ffffff', 0, '900')).setOrigin(0.5));
          content.add(ui.add.text(W / 2, top + 380, t('rank_city_later'), TXT(22, '#6b7686', '#ffffff', 0, '800')).setOrigin(0.5));
        }
      };
      p.refresh();
    });
  }

  /**
   * (v4-C) the town hall's notice board (마을 게시판): today's requests and village news, read from the systems
   * that already run (TownHall.boardLines); the place v5's missions will go
   */
  openBoard() {
    const gs = this.ui.gs, hall = gs && gs.civic && gs.civic.hall;
    if (!hall) return;
    this.openPanel((p) => {
      const ui = this.ui, W = ui.W, H = ui.H;
      const pw = Math.min(W - 40, 640), ph = 760;
      const top = Math.max(110 + View.safeTop, (H - ph) / 2);
      const boardKey = has('ui_mission_board') ? 'ui_mission_board' : 'ui_panel';
      const bg = panel(ui, W / 2, top + ph / 2, boardKey, pw, ph).setOrigin(0.5).setInteractive();
      bg.on('pointerup', () => {});
      p.c.add(bg);
      p.c.add(ui.add.text(W / 2, top + 58, t('board_title'), TXT(32, '#ffffff', '#5a3a26', 7, '900')).setOrigin(0.5));
      p.c.add(ui.makeIconButton(W / 2 + pw / 2 - 36, top + 30, 'ui_icon_close', 62, () => this.closePanel()));
      const content = ui.add.container(0, 0);
      p.c.add(content);
      p.c.add(ui.add.text(W / 2, top + ph - 46, t('board_soon'), TXT(18, '#5d4632', '#ffffff', 0, '800')).setOrigin(0.5));
      let lastKey = '';
      p.refresh = () => {
        const L = hall.boardLines();
        const key = JSON.stringify(L);
        if (key === lastKey) return;
        lastKey = key;
        content.removeAll(true);
        const x0 = W / 2 - pw / 2 + 50, cw = pw - 80;
        let y = top + 116;
        const head = (txt) => { content.add(ui.add.text(x0, y, txt, TXT(24, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0, 0.5)); y += 42; };
        const row = (r) => {
          const card = panel(ui, W / 2, y, has('ui_mission_card') ? 'ui_mission_card' : 'ui_panel', cw, 56).setOrigin(0.5);
          content.add(card);
          content.add(icon(ui, x0 + 26, y, [r.icon, 'ui_icon_goal', 'ui_icon_coin'], 34));
          const tx = ui.add.text(x0 + 56, y, r.text, Object.assign(TXT(19, '#2b2f3a', '#ffffff', 0, '800'), { wordWrap: { width: cw - 80, useAdvancedWrap: true } })).setOrigin(0, 0.5);
          if (tx.height > 52) tx.setScale(52 / tx.height);
          content.add(tx);
          y += 62;
        };
        head(t('board_requests'));
        if (!L.requests.length) { content.add(ui.add.text(W / 2, y, t('board_empty'), TXT(20, '#6b7686', '#ffffff', 0, '800')).setOrigin(0.5)); y += 50; }
        for (const r of L.requests.slice(0, 4)) row(r);
        y += 10;
        head(t('board_news'));
        const room = Math.max(1, Math.floor((top + ph - 90 - y) / 62));
        for (const r of L.news.slice(0, room)) row(r);
      };
      p.refresh();
    });
  }

  /** the ceremony: the badge flies from the square (world) to the rank chip */
  badgeFly(wx, wy) {
    const ui = this.ui;
    const s = ui.worldToScreen(wx, wy);
    const b = icon(ui, s.x, s.y, ['ui_badge_rank_2', 'ui_icon_fame', 'ui_icon_lock'], 128).setDepth(65);
    b.setScale(b.scaleX * 0.3);
    const to = { x: this.rankChip.x + 26, y: this.rankChip.y };
    const sc = b.scaleX;
    ui.tweens.add({ targets: b, scale: sc * 3.3, duration: 500, ease: 'Back.easeOut' });
    ui.tweens.add({ targets: b, x: to.x, y: to.y, scale: (42 / 128) * sc * 3.3 / 1, delay: 1600, duration: 900, ease: 'Cubic.easeIn', onComplete: () => { b.destroy(); this._rankKey = null; this.pop(this.rankChip, true); } });
  }
}
