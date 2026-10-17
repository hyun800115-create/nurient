// (v4.2, docs/v42_plan.md §8.1) the v4.2 HUD of the UI scene (logical 720-wide space, phone 390 x 844 CSS):
//   관망 button      right column above the zoom buttons (after village complete; lit while on)
//   줍기 button      left of the zoom-out button (자동 줍기 = 끔 and something takeable)
//   nav chip         bottom centre '[icon] 구운 생선 8 → 광장 판매대 · 12m' (tap: the next place, hold: hide for this load)
//   nav edge badge   the place off screen: item icon + metres, the notch toward it
//   관망 caption     top centre '관망 중 · 촌장님은 지금: …' + '화면을 만지면 다시 조종해요'; the 3 s countdown chip
//   업무 chip        under the order chip (after 총총이: the office panel anywhere)
//   새로워진 것      a card once per save that came from v4.1
//   열차 카드        tap the train: consist, riders, crates, next stop
// Icons: the ui5 art when it is there (CODE-2), else generated stand-ins (fxTex) or existing icons. (CODE-2) The ui5
// icons and the ui_chip plate live on the v42_core page that arrives after the first sale: reskin() swaps them in
// place (the chips are built 64 px tall and scaled uniformly, ui5 notes: below 64 the pill turns into a lemon).

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { View } from '../core/View.js';
import { panel } from '../core/Panel.js';
import { FONT, t, fmt } from '../data/strings.js';
import { makeAll } from '../systems/v42/fxTex.js';

const TXT = (size, color = '#ffffff', stroke = '#2b2f3a', st = 7, weight = '900') => ({
  fontFamily: FONT, fontSize: size + 'px', fontStyle: weight, color, stroke, strokeThickness: st, resolution: 2,
});
/** the first key with art (ui5 first), else the generated stand-in */
const pickIcon = (...keys) => { for (const k of keys) { if (!k) continue; try { if (Assets.has(k)) return k; } catch (e) { /* */ } } return keys[keys.length - 1]; };
const fit = (im, size) => { im.setScale(size / Math.max(1, im.frame.realWidth, im.frame.realHeight)); return im; };

export class HudV42 {
  constructor(ui) {
    this.ui = ui;
    this.t = 0;
    makeAll(ui);
    // ---- 관망 button (a round button like the zoom ones)
    this.obsBtn = this.roundButton(pickIcon('ui_icon_binoculars', 'fv_icon_binoculars'), 64, () => { const P = this.pilot; if (P) P.toggle(); });
    this.obsBtn.setVisible(false);
    // ---- 줍기 button: hand + the item it would take + how many
    const pb = this.pickBtn = ui.add.container(0, 0).setDepth(22).setVisible(false);
    const g = ui.add.graphics();
    g.fillStyle(0x1f3354, 0.25); g.fillCircle(0, 5, 38);
    g.fillStyle(0xfff8ec, 0.97); g.fillCircle(0, 0, 38);
    g.lineStyle(5, 0x2cb7a8, 1); g.strokeCircle(0, 0, 35);
    this.pickHand = fit(Assets.image(ui, -6, -4, pickIcon('ui_icon_hand', 'fv_icon_hand')).setOrigin(0.5), 46);
    this.pickItem = fit(Assets.image(ui, 18, 14, 'item_fish_raw').setOrigin(0.5), 30);
    this.pickN = ui.add.text(22, -26, '', TXT(18, '#ffffff', '#1f6f68', 5)).setOrigin(0.5);
    this.pickLab = ui.add.text(0, 50, t('pickBtn'), TXT(18, '#ffffff', '#1f3354', 5)).setOrigin(0.5);
    pb.add([g, this.pickHand, this.pickItem, this.pickN, this.pickLab]);
    pb.setSize(84, 84);
    pb.setInteractive({ useHandCursor: true });
    pb.on('pointerdown', () => { const PP = this.pickup; if (PP) PP.press(); ui.tweens.add({ targets: pb, scale: 0.9, duration: 70, yoyo: true }); Audio.play('sfx_click', { volume: 0.5 }); });
    const rel = () => { const PP = this.pickup; if (PP) PP.release(); };
    pb.on('pointerup', rel); pb.on('pointerout', rel); pb.on('pointerupoutside', rel);
    // ---- nav chip
    const nc = this.navChip = ui.add.container(0, 0).setDepth(21).setVisible(false);
    this.navBg = panel(ui, 0, 0, 'ui_panel', 300, 54).setOrigin(0.5).setAlpha(0.95);
    this.navIcon = fit(Assets.image(ui, 0, 0, 'item_fish_cooked').setOrigin(0.5), 36);
    this.navText = ui.add.text(0, 0, '', TXT(21, '#1f5f66', '#ffffff', 0, '800')).setOrigin(0, 0.5);
    this.navMore = ui.add.text(0, 0, '', TXT(18, '#ffffff', '#c45a1a', 5, '900')).setOrigin(0, 0.5);
    nc.add([this.navBg, this.navIcon, this.navText, this.navMore]);
    nc.setSize(300, 54);
    nc.setInteractive({ useHandCursor: true });
    nc.on('pointerdown', () => { this.navDown = ui.time.now; });
    nc.on('pointerup', () => {
      const N = this.nav;
      if (!N || this.navDown === null) return;
      const held = ui.time.now - this.navDown > 500;
      this.navDown = null;
      if (held) N.hideLoad(); else N.next();
      Audio.play('sfx_click', { volume: 0.4 });
    });
    this.navDown = null;
    // ---- nav edge badge
    const eb = this.edge = ui.add.container(0, 0).setDepth(19).setVisible(false);
    this.edgeRing = ui.add.image(0, 0, pickIcon('nav_edge', 'fv_nav_edge')).setOrigin(0.5).setScale(0.9);
    this.edgeIcon = fit(Assets.image(ui, 0, 0, 'item_fish_cooked').setOrigin(0.5), 34);
    this.edgeText = ui.add.text(0, 44, '', TXT(18, '#ffffff', '#1f5f66', 5)).setOrigin(0.5);
    eb.add([this.edgeRing, this.edgeIcon, this.edgeText]);
    // ---- 관망 caption + countdown
    const oc = this.obsCap = ui.add.container(0, 0).setDepth(23).setVisible(false);
    this.obsBg = panel(ui, 0, 0, 'ui_panel', 520, 76).setOrigin(0.5).setAlpha(0.94);
    this.obsText = ui.add.text(0, -12, '', TXT(21, '#1f3354', '#ffffff', 0, '800')).setOrigin(0.5);
    this.obsHint = ui.add.text(0, 18, t('obs_hint'), TXT(17, '#5b6676', '#ffffff', 0, '700')).setOrigin(0.5);
    oc.add([this.obsBg, this.obsText, this.obsHint]);
    const cd = this.countChip = ui.add.container(0, 0).setDepth(23).setVisible(false);
    this.countBg = panel(ui, 0, 0, 'ui_panel', 360, 56).setOrigin(0.5).setAlpha(0.95).setTint(0xdff7f3);
    this.countText = ui.add.text(0, 0, '', TXT(22, '#1f5f66', '#ffffff', 0, '800')).setOrigin(0.5);
    cd.add([this.countBg, this.countText]);
    // ---- 업무 chip (after 총총이)
    const wc = this.workChip = ui.add.container(0, 0).setDepth(20).setVisible(false);
    this.workBg = panel(ui, 0, 0, 'ui_panel', 132, 50).setOrigin(0, 0.5).setAlpha(0.95);
    this.workIcon = fit(Assets.image(ui, 26, 0, pickIcon('ui_icon_office', 'fv_icon_office')).setOrigin(0.5), 36);
    this.workText = ui.add.text(50, 0, t('officeChip'), TXT(20, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0, 0.5);
    this.workBadge = ui.add.text(122, -18, '', TXT(16, '#ffffff', '#d4426f', 5, '900')).setOrigin(0.5);
    wc.add([this.workBg, this.workIcon, this.workText, this.workBadge]);
    wc.setSize(132, 50);
    wc.setInteractive(new Phaser.Geom.Rectangle(66, 25, 132, 50), Phaser.Geom.Rectangle.Contains);
    wc.on('pointerup', () => { const O = this.v42 && this.v42.office; if (O && O.openPanel) O.openPanel('chip'); });
    this.card = null;
    this.layout();
    this.artOn = false;
    this.reskin();
    this.onArrive = () => { if (!this.artOn) this.reskin(); };
    Assets.arrivals.push(this.onArrive);
    ui.events.once('shutdown', () => { const i = Assets.arrivals.indexOf(this.onArrive); if (i >= 0) Assets.arrivals.splice(i, 1); });
  }

  /** (CODE-2) the ui5 icons + the ui_chip plates, once the v42_core page is here */
  reskin() {
    if (this.artOn || !Assets.has('ui_icon_binoculars')) return false;
    const ui = this.ui;
    Assets.apply(this.obsBtn.icon, 'ui_icon_binoculars'); fit(this.obsBtn.icon.setOrigin(0.5), 64 * 0.7);
    Assets.apply(this.pickHand, 'ui_icon_hand'); fit(this.pickHand.setOrigin(0.5), 50);
    Assets.apply(this.workIcon, 'ui_icon_office'); fit(this.workIcon.setOrigin(0.5), 38);
    if (Assets.has('nav_edge')) { Assets.apply(this.edgeRing, 'nav_edge'); this.edgeRing.setOrigin(0.5).setScale(0.9); this.edgeArt = true; }
    // the chips: a ui_chip pill 64 tall, scaled to the chip's height
    if (Assets.has('ui_chip')) {
      const chip = (old, h, ox) => {
        const c = old.parentContainer, i = c ? c.getIndex(old) : 0, w = old.width || 200;
        const n = panel(ui, old.x, old.y, 'ui_chip', Math.max(64, w * 64 / h), 64).setOrigin(ox, 0.5).setScale(h / 64).setAlpha(old.alpha);
        n.__h = h;
        if (c) { c.addAt(n, i); c.remove(old, true); } else old.destroy();
        return n;
      };
      this.navBg = chip(this.navBg, 54, 0.5);
      this.obsBg = chip(this.obsBg, 76, 0.5);
      this.countBg = chip(this.countBg, 56, 0.5);
      this.workBg = chip(this.workBg, 50, 0);
      this.navKey = null;
      this.chipArt = true;
    }
    this.artOn = true;
    return true;
  }

  /** a chip plate's size in chip units (the ui_chip art is built 64 tall and scaled) */
  chipSize(bg, w, h) { if (bg.__h) bg.setSize(Math.max(64, w * 64 / bg.__h), 64); else bg.setSize(w, h); }

  get gs() { return this.ui.gs; }
  get v42() { return this.ui.gs && this.ui.gs.v42; }
  get nav() { return this.v42 && this.v42.nav; }
  get pickup() { return this.v42 && this.v42.pickup; }
  get pilot() { return this.v42 && this.v42.pilot; }

  roundButton(key, size, onClick) {
    const ui = this.ui, c = ui.add.container(0, 0).setDepth(22);
    const g = ui.add.graphics();
    c.drawBg = (lit) => {
      g.clear();
      g.fillStyle(0x1f3354, 0.25); g.fillCircle(0, 5, size / 2);
      g.fillStyle(lit ? 0xffe9a8 : 0xffffff, 0.95); g.fillCircle(0, 0, size / 2);
      g.lineStyle(4, lit ? 0xffc83d : 0xd7e3f2, 1); g.strokeCircle(0, 0, size / 2 - 2);
    };
    c.drawBg(false);
    const ic = fit(Assets.image(ui, 0, 0, key).setOrigin(0.5), size * 0.66);
    c.add([g, ic]);
    c.icon = ic;
    c.setSize(size, size);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => { ui.tweens.add({ targets: c, scale: 0.88, duration: 70, yoyo: true }); Audio.play('sfx_click'); onClick(); });
    return c;
  }

  layout() {
    const ui = this.ui, W = ui.W, H = ui.H;
    const zb = H - 168 - View.safeBottom;
    this.obsBtn.setPosition(W - 57, zb - 264);
    this.pickBtn.setPosition(W - 174, zb - 87);
    this.navChip.setPosition(W / 2, H - 92 - View.safeBottom);
    this.obsCap.setPosition(W / 2, 62 + View.safeTop + 300);
    this.countChip.setPosition(W / 2, H * 0.62);
    this.workChip.setPosition(28, 62 + View.safeTop + 348);
    if (this.card) this.closeCard(true);
  }

  update(dt) {
    if (this.trainCard) { this.tcT -= dt; if (this.tcT <= 0) { this.tcT = 0.25; this.fillTrainCard(); } }
    const ui = this.ui, gs = this.gs, v = this.v42;
    this.t += dt;
    if (!v || !gs || !gs.player) return;
    const busy = ui.panelOpen || ui.buildOpen || ui.v4PanelOpen || ui.v42PanelOpen || gs.overview;
    // 관망 button
    const P = this.pilot;
    const showObs = !!(P && v.complete && !busy && !(gs.tutorial && gs.tutorial.inTutorial));
    if (this.obsBtn.visible !== showObs) this.obsBtn.setVisible(showObs);
    if (showObs && this.obsLit !== P.on) { this.obsLit = P.on; this.obsBtn.drawBg(P.on); }
    // 줍기 button
    const PP = this.pickup;
    const off = PP && PP.mode === 'off' && !busy && !(P && P.on);
    const offer = off ? PP.offer() : null;
    if (this.pickBtn.visible !== !!offer) this.pickBtn.setVisible(!!offer);
    if (offer) {
      if (offer.icon && this.pickItemKey !== offer.icon) { this.pickItemKey = offer.icon; Assets.apply(this.pickItem, offer.icon); fit(this.pickItem.setOrigin(0.5), 30); }
      this.pickItem.setVisible(!!offer.icon);
      this.pickN.setText(offer.n > 0 ? String(Math.min(99, offer.n)) : '');
      this.pickBtn.setAlpha(PP.held ? 1 : 0.97);
    }
    // nav chip + edge badge
    const N = this.nav;
    const chip = N && !busy ? N.chip() : null;
    if (this.navChip.visible !== !!chip) this.navChip.setVisible(!!chip);
    if (chip) {
      const key = chip.icon + '|' + chip.text + '|' + chip.more;
      if (key !== this.navKey) {
        this.navKey = key;
        if (chip.icon && chip.icon !== this.navIconKey) { this.navIconKey = chip.icon; Assets.apply(this.navIcon, chip.icon); fit(this.navIcon.setOrigin(0.5), 36); }
        this.navText.setText(chip.text);
        this.navMore.setText(chip.more ? t('navMore', { n: chip.more }) : '');
        const w = Math.min(ui.W - 40, this.navText.width + (chip.more ? this.navMore.width + 14 : 0) + 78);
        this.chipSize(this.navBg, w, 54);
        this.navIcon.setX(-w / 2 + 28);
        this.navText.setX(-w / 2 + 52);
        this.navMore.setX(-w / 2 + 52 + this.navText.width + 10);
        if (!this.chipArt) this.navBg.setTint(chip.none ? 0xffe4d6 : 0xffffff);
        this.navText.setColor(chip.none ? '#b2462a' : '#1f5f66');
      }
    }
    this.updateEdge(N, busy);
    // 관망 caption + countdown
    const capOn = !!(P && P.on && !busy);
    if (this.obsCap.visible !== capOn) this.obsCap.setVisible(capOn);
    if (capOn) {
      const s = t('obs_caption', { act: P.caption() });
      if (this.obsText.text !== s) { this.obsText.setText(s); this.chipSize(this.obsBg, Math.min(ui.W - 30, Math.max(this.obsText.width, this.obsHint.width) + 56), 76); }
    }
    const cd = P && P.countdown > 0 && !P.on ? Math.ceil(P.countdown) : 0;
    if (this.countChip.visible !== !!cd) this.countChip.setVisible(!!cd);
    if (cd) { const s = t('obs_count', { n: cd }); if (this.countText.text !== s) { this.countText.setText(s); this.chipSize(this.countBg, this.countText.width + 56, 56); } }
    // 업무 chip
    const O = v.office;
    const showWork = !!(O && O.chipOn && O.chipOn()) && !busy;
    if (this.workChip.visible !== showWork) this.workChip.setVisible(showWork);
    if (showWork) { const n = O.badgeCount ? O.badgeCount() : 0; const s = n > 0 ? String(n) : ''; if (this.workBadge.text !== s) this.workBadge.setText(s); }
    // 새로워진 것
    if (!this.card && v.whatsNewDue && v.whatsNewDue() && !busy) this.openCard();
  }

  updateEdge(N, busy) {
    const ui = this.ui;
    let show = false;
    const d = N && N.active && N.dest && N.dest.pad ? N.dest : null;
    if (d && !busy) {
      const p = ui.worldToScreen(d.pad.x, d.pad.y - 30);
      if (p.x < -10 || p.x > ui.W + 10 || p.y < 120 || p.y > ui.H + 10) {
        const M = 60, cx = ui.W / 2, cy = ui.H / 2;
        const a = Math.atan2(p.y - cy, p.x - cx);
        // ((robust review L1) the left column holds the HUD chips (rank, 32/32, order card, 업무) down to ≈ 450 logical
        //  px: on that side the badge stays below them; on the right only the settings / day buttons are up there)
        const ex = Phaser.Math.Clamp(p.x, M, ui.W - M), ey = Phaser.Math.Clamp(p.y, ex < ui.W * 0.45 ? 480 : 220, ui.H - 240 - View.safeBottom);
        this.edge.setPosition(ex, ey);
        this.edgeRing.setRotation(a);
        // (art: the metres sit on the side away from the arrow)
        if (this.edgeArt) this.edgeText.setPosition(-Math.cos(a) * 50, -Math.sin(a) * 50);
        if (this.edgeKey !== d.type) { this.edgeKey = d.type; Assets.apply(this.edgeIcon, d.type); fit(this.edgeIcon.setOrigin(0.5), 34); }
        const m = Math.max(1, Math.round((N.routeLen || 0) / 64)) + 'm';
        if (this.edgeText.text !== m) this.edgeText.setText(m);
        show = true;
      }
    }
    if (this.edge.visible !== show) this.edge.setVisible(show);
  }

  // ------------------------------------------------------------------ "새로워진 것" (once per save from v4.1)
  openCard() {
    const ui = this.ui, v = this.v42, W = ui.W, H = ui.H;
    const lines = [['wn_1', pickIcon('ui_icon_halo', 'fv_halo')], ['wn_2', pickIcon('ui_icon_route', 'fv_nav_edge')], ['wn_3', pickIcon('ui_icon_binoculars', 'fv_icon_binoculars')]];
    if (v.trainNew && v.trainNew()) lines.push(['wn_4', pickIcon('ui_icon_coach', 'ui_icon_delivery', 'fv_icon_office')]);
    const c = ui.add.container(0, 0).setDepth(85);
    const dim = ui.add.rectangle(W / 2, H / 2, W * 2, H * 2, 0x1b2638, 0.45).setInteractive();
    const ph = 210 + lines.length * 96;
    const bg = panel(ui, W / 2, H / 2, 'ui_panel', 600, ph).setOrigin(0.5);
    c.add([dim, bg]);
    c.add(ui.add.text(W / 2, H / 2 - ph / 2 + 56, t('wn_title'), TXT(40, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0.5));
    lines.forEach(([k, ic], i) => {
      const y = H / 2 - ph / 2 + 130 + i * 96;
      const im = Assets.image(ui, W / 2 - 230, y, ic).setOrigin(0.5);
      fit(im, ic === 'fv_halo' ? 70 : 58);
      c.add(im);
      c.add(ui.add.text(W / 2 - 180, y, t(k), Object.assign(TXT(24, '#2b2f3a', '#ffffff', 0, '800'), { wordWrap: { width: 420 } })).setOrigin(0, 0.5));
    });
    c.add(ui.makeButton(W / 2, H / 2 + ph / 2 - 60, 260, 80, 'green', t('wn_ok'), () => this.closeCard(), 30));
    this.card = c;
    ui.v42PanelOpen = true;
    c.setAlpha(0);
    ui.tweens.add({ targets: c, alpha: 1, duration: 200 });
    if (window.__FV) window.__FV.whatsNew = true;
  }

  closeCard(quiet) {
    const ui = this.ui, c = this.card;
    if (!c) return;
    this.card = null;
    ui.v42PanelOpen = false;
    if (this.v42) this.v42.whatsNewSeen();
    if (window.__FV) window.__FV.whatsNew = false;
    if (quiet) { c.destroy(); return; }
    ui.tweens.add({ targets: c, alpha: 0, duration: 140, onComplete: () => c.destroy() });
  }

  // ------------------------------------------------------------------ 열차 카드 (tap the train)
  openTrainCard() {
    const ui = this.ui, W = ui.W, H = ui.H, gs = this.gs, nb = gs && gs.v4;
    if (!nb || !nb.rail || this.trainCard) return;
    if (this.card || ui.panelOpen || ui.v4PanelOpen) return;
    const c = ui.add.container(0, 0).setDepth(84);
    const pw = 600, ph = 400, cx = W / 2, cy = H - 300 - View.safeBottom - ph / 2 + 60;
    const bg = panel(ui, cx, cy, 'ui_panel', pw, ph).setOrigin(0.5).setInteractive();
    c.add(bg);
    c.add(ui.add.text(cx, cy - ph / 2 + 46, t('trainCard'), TXT(32, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0.5));
    // the consist as little chips, engine first
    const units = nb.rail.consist();
    const names = { train_engine: 'car_engine', train_coach: 'car_coach0', train_boxcar: 'car_box0', train_flatcar: 'car_flat' };
    const cw = Math.min(124, (pw - 60) / units.length - 8);
    units.forEach((u, i) => {
      const x = cx - ((units.length - 1) * (cw + 8)) / 2 + i * (cw + 8), y = cy - ph / 2 + 112;
      const col = u.key === 'train_engine' ? 0xe0544a : u.key === 'train_coach' ? 0x7fb2ff : u.key === 'train_boxcar' ? 0x5f9a5a : 0xa98a62;
      const g = ui.add.graphics();
      g.fillStyle(col, 1); g.fillRoundedRect(x - cw / 2, y - 22, cw, 44, 10);
      g.fillStyle(0x2b2f3a, 1); g.fillCircle(x - cw / 4, y + 24, 7); g.fillCircle(x + cw / 4, y + 24, 7);
      c.add(g);
      c.add(ui.add.text(x, y, t(names[u.key] || 'car_engine'), TXT(17, '#ffffff', '#2b2f3a', 4, '900')).setOrigin(0.5));
    });
    this.tcLines = [0, 1, 2].map((k) => { const tx = ui.add.text(cx - pw / 2 + 48, cy - ph / 2 + 190 + k * 52, '', TXT(25, '#2b2f3a', '#ffffff', 0, '800')).setOrigin(0, 0.5); c.add(tx); return tx; });
    c.add(ui.add.text(cx, cy + ph / 2 - 34, t('tapClose'), TXT(18, '#7a8494', '#ffffff', 0, '700')).setOrigin(0.5));
    bg.on('pointerup', () => this.closeTrainCard());
    this.trainCard = c;
    this.tcT = 0;
    this.fillTrainCard();
    c.setAlpha(0);
    ui.tweens.add({ targets: c, alpha: 1, duration: 160 });
    Audio.play('sfx_click', { volume: 0.5 });
  }
  fillTrainCard() {
    const gs = this.gs, nb = gs && gs.v4, r = nb && nb.rail;
    if (!this.trainCard || !r) return;
    const F = this.v42 && this.v42.freight;
    const riders = r.phase === 'toOurs' || r.phase === 'atTown' ? nb.onBoard.length : 0;
    const crates = F ? F.aboard() : 0, cap = F ? F.cap() : 56;
    const stop = (k) => t(k === 'ours' ? 'stn_ours' : 'stn_town');
    let l3;
    if (r.phase === 'atOurs' || r.phase === 'atTown') l3 = t('trainCardDwell', { stop: stop(r.phase === 'atOurs' ? 'ours' : 'town'), s: Math.ceil(r.dur(r.phase) - r.t) });
    else if (r.path && (r.path.wrap(r.m) < r.path.loopLen || r.path.wrap(r.m - r.path.sTownLoop) < r.path.loopLen)) l3 = t('trainCardLoop');
    else l3 = t('trainCardNext', { stop: stop(r.phase === 'toOurs' ? 'ours' : 'town'), s: Math.ceil(r.untilArrival()) });
    const L = [t('trainCardRiders', { n: riders }), t('trainCardCrates', { n: crates, cap }), l3];
    this.tcLines.forEach((tx, i) => { if (tx.text !== L[i]) tx.setText(L[i]); });
  }
  closeTrainCard() {
    const ui = this.ui, c = this.trainCard;
    if (!c) return;
    this.trainCard = null;
    ui.tweens.add({ targets: c, alpha: 0, duration: 120, onComplete: () => c.destroy() });
  }

  state() {
    return { trainCard: !!this.trainCard, obs: this.obsBtn.visible, pick: this.pickBtn.visible, chip: this.navChip.visible ? this.navText.text : null, edge: this.edge.visible, caption: this.obsCap.visible ? this.obsText.text : null, count: this.countChip.visible ? this.countText.text : null, work: this.workChip.visible, card: !!this.card };
  }
}

export { fmt };
