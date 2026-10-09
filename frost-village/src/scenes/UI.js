// HUD overlay: coin counter, settings panel (sound / music / language / reset with in-game
// confirm), toasts, banners, objective text + off-screen indicator, floating joystick.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { Input, JOY_RADIUS } from '../core/Input.js';
import { Settings } from '../core/Save.js';
import { FONT, t, setLang, getLang, fmt } from '../data/strings.js';
import { panel } from '../core/Panel.js';
import { View } from '../core/View.js';
import { BALANCE } from '../data/balance.js';
import { VERSION, BUILD_DATE } from '../data/version.js';
import { buildCost } from '../entities/Site.js';
// ---- (v4-B) the neighbour-town HUD: rank chip, order chip, clock, train edge icon, order / rank panels
import { HudV4 } from './UIv4.js';
// ---- (v4-C) the build menu's tabs
import { CATALOG, TABS } from '../systems/Civic.js';
const TAB_ICON = { work: ['ui_icon_hammer', 'ui_icon_tools', 'ui_icon_worker'], home: ['ui_icon_house', 'ui_icon_people'], decor: ['ui_icon_flower', 'ui_icon_happy', 'ui_icon_heart_full'], civic: ['ui_icon_fame', 'ui_icon_people', 'ui_icon_house'] };

const TXT = (size, color = '#ffffff', stroke = '#2b2f3a', st = 7, weight = '900') => ({
  fontFamily: FONT, fontSize: size + 'px', fontStyle: weight, color, stroke, strokeThickness: st, resolution: 2,
});

export class UI extends Phaser.Scene {
  constructor() { super('UI'); }

  create() {
    this.ready = false;
    this.gs = this.scene.get('Game');
    View.applyUI(this.cameras.main);
    const W = View.W, H = View.H;
    this.W = W; this.H = H;
    this.displayCoins = this.gs.economy.coins;
    this.targetCoins = this.displayCoins;
    this.coinDelay = 0;
    this.panelOpen = false;

    // ---- coin HUD
    this.coinBar = panel(this, 0, 0, 'ui_coin_bar', 230, 74).setOrigin(0, 0.5);
    this.coinIcon = Assets.image(this, 0, 0, 'ui_icon_coin');
    this.coinIcon.setScale(64 / Math.max(this.coinIcon.frame.realWidth, 1)).setOrigin(0.5);
    this.coinIcon.__bs = this.coinIcon.scaleX;
    this.coinText = this.add.text(0, 0, '0', TXT(40)).setOrigin(0, 0.5);

    // ---- (v3) population: villagers / room (+ waiting for a house)
    this.popBox = this.add.container(0, 0).setVisible(false);
    this.popBg = panel(this, 0, 0, 'ui_panel', 150, 50).setOrigin(0, 0.5).setAlpha(0.92);
    this.popIcon = Assets.image(this, 0, 0, Assets.pick('ui_icon_people', 'ui_icon_worker')).setOrigin(0.5);
    this.popIcon.setScale(40 / Math.max(this.popIcon.frame.realWidth, 1));
    this.popText = this.add.text(0, 0, '', TXT(24, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0, 0.5);
    this.popWait = this.add.text(0, 0, '', TXT(22, '#ffffff', '#c45a1a', 5, '900')).setOrigin(0, 0.5);
    this.popHouse = Assets.image(this, 0, 0, Assets.pick('ui_icon_house', 'ui_icon_lock')).setOrigin(0.5).setVisible(false);
    this.popHouse.setScale(30 / Math.max(this.popHouse.frame.realWidth, 1));
    this.popBox.add([this.popBg, this.popIcon, this.popText, this.popHouse, this.popWait]);
    this.popKey = '';

    // ---- settings button
    this.setBtn = this.makeIconButton(0, 0, 'ui_icon_settings', 84, () => this.openSettings());

    // ---- (v2) zoom buttons: + / - / whole village
    this.zoomInBtn = this.makeZoomButton('in', () => this.gs.zoomBy(BALANCE.camera.zoomStep));
    this.zoomOutBtn = this.makeZoomButton('out', () => this.gs.zoomBy(1 / BALANCE.camera.zoomStep));
    this.mapBtn = this.makeZoomButton('map', () => this.gs.toggleOverview());
    // ---- (v3.5) the whistle (call Kongi) + the dog's play bar (treat / fetch / pet + affection hearts)
    this.whistleBtn = this.makeIconButton(0, 0, Assets.pick('ui_icon_whistle', 'ui_icon_worker'), 80, () => { if (this.gs.dog) this.gs.dog.command('whistle'); });
    this.whistleBtn.icon.setScale(this.whistleBtn.icon.scaleX * 1.12);
    this.whistleBtn.setVisible(false);
    this.whistleBadge = this.add.text(0, 0, '', TXT(20, '#ffffff', '#d4426f', 5, '900')).setOrigin(0.5).setVisible(false);
    this.buildDogBar();
    this.buildChatButton();          // (v4-C2) 수다 떨기
    this.pinch = null;
    this.taps = {};

    // ---- objective
    this.objPanel = this.add.container(0, 0).setVisible(false);
    this.objBg = panel(this, 0, 0, 'ui_panel', 400, 62).setOrigin(0.5);
    this.objText = this.add.text(0, 1, '', TXT(26, '#2b2f3a', '#ffffff', 0, '800')).setOrigin(0.5);
    this.objPanel.add([this.objBg, this.objText]);
    this.objKey = null;

    // ---- off-screen indicator
    this.edge = Assets.image(this, 0, 0, 'ui_arrow').setVisible(false);
    this.edge.setScale(50 / Math.max(this.edge.frame.realWidth, 1)).setOrigin(0.5, 0.5);

    // ---- joystick
    this.joyBase = Assets.image(this, 0, 0, 'ui_joystick_base').setVisible(false).setAlpha(0.9);
    this.joyBase.setScale((JOY_RADIUS * 2.2) / Math.max(this.joyBase.frame.realWidth, 1));
    this.joyKnob = Assets.image(this, 0, 0, 'ui_joystick_knob').setVisible(false);
    this.joyKnob.setScale(84 / Math.max(this.joyKnob.frame.realWidth, 1));

    // ---- toast / banner
    this.toastBox = this.add.container(W / 2, H - 230).setVisible(false).setDepth(50);
    this.toastBg = panel(this, 0, 0, 'ui_panel', 300, 64).setOrigin(0.5).setTint(0x2b2f3a).setAlpha(0.88);
    this.toastText = this.add.text(0, 0, '', TXT(28, '#ffffff', '#2b2f3a', 0, '800')).setOrigin(0.5);
    this.toastBox.add([this.toastBg, this.toastText]);
    this.bannerBox = this.add.container(W / 2, H * 0.27).setVisible(false).setDepth(60);
    this.bannerBg = panel(this, 0, 0, 'ui_button_blue', 460, 104).setOrigin(0.5);
    this.bannerText = this.add.text(0, -4, '', TXT(50, '#ffffff', '#1f4f8f', 10)).setOrigin(0.5);
    this.bannerSub = this.add.text(0, 80, '', TXT(26, '#ffffff', '#1f3354', 6, '800')).setOrigin(0.5);
    this.bannerSubBg = this.add.graphics();   // soft dark pill so the subtitle reads over a busy village
    this.bannerBox.add([this.bannerBg, this.bannerText, this.bannerSubBg, this.bannerSub]);

    // coins flying to HUD
    this.flyPool = [];

    // ---- debug
    if (window.__FV_DEBUG) this.fps = this.add.text(12, 0, '', { fontFamily: 'monospace', fontSize: '20px', color: '#2b2f3a', backgroundColor: 'rgba(255,255,255,0.6)' }).setDepth(100);

    // ---- (v4-B) the neighbour-town chips and panels (hidden until the station opens)
    this.hud4 = new HudV4(this);

    this.layout();
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => { this.ready = false; this.panelOpen = false; this.scale.off('resize', this.onResize, this); });

    // ---- input (joystick anywhere that is not a button; a second finger turns it into a pinch zoom)
    this.input.on('pointerdown', (p, over) => {
      Audio.resume();    // iOS: bring sound back after a call / app switch (needs a user gesture)
      // (v3.5 review) a finger landing on the dog bar may still be the start of a drag: the joystick starts
      // too, and the button only fires when the finger lifts without moving (dogBarRelease)
      const onBar = over && over.length && over.every((o) => o.isDogBtn);
      if (this.panelOpen || this.buildOpen || this.v4PanelOpen || (over && over.length && !onBar)) return;
      if (!onBar) this.taps[p.id] = { x: p.x, y: p.y, t: this.time.now };
      const other = this.input.manager.pointers.find((q) => q && q.isDown && q.id !== p.id && q.id !== 0);
      if (other && !this.pinch) {
        // two fingers: zoom gesture (the joystick stops)
        Input.release();
        const d = Math.hypot(p.x - other.x, p.y - other.y);
        this.pinch = { a: other.id, b: p.id, d0: Math.max(20, d), z0: this.gs.overview ? this.gs.fitZoom() : this.gs.zoomTarget };
        delete this.taps[p.id]; delete this.taps[other.id];
        return;
      }
      if (this.pinch) return;
      Input.pointerDown(p);
    });
    this.input.on('pointermove', (p) => {
      if (this.pinch) {
        const ps = this.input.manager.pointers;
        const a = ps.find((q) => q && q.id === this.pinch.a), b = ps.find((q) => q && q.id === this.pinch.b);
        if (a && b && a.isDown && b.isDown) this.gs.setZoom(this.pinch.z0 * (Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.d0));
        return;
      }
      Input.pointerMove(p);
    });
    // lifting the steering finger while another finger is down hands the joystick to that finger
    const up = (p) => {
      this.dogBarRelease(p);
      // a short tap without moving: villagers / pets react
      const tp = this.taps[p.id];
      delete this.taps[p.id];
      if (tp && !this.pinch && !this.panelOpen && this.time.now - tp.t < 300 && Math.hypot(p.x - tp.x, p.y - tp.y) < 16 * View.k && this.gs.life) {
        const wp = this.gs.cameras.main.getWorldPoint(p.x, p.y);
        this.gs.life.tap(wp.x, wp.y);
      }
      if (this.pinch) {
        if (p.id === this.pinch.a || p.id === this.pinch.b) {
          // the other finger stays down: it does not become a joystick until it is lifted too
          const still = this.input.manager.pointers.some((q) => q && q.isDown && q.id !== p.id && q.id !== 0);
          if (!still) this.pinch = null; else this.pinch.ending = true;
        }
        if (this.pinch && this.pinch.ending && !this.input.manager.pointers.some((q) => q && q.isDown && q.id !== 0)) this.pinch = null;
        Input.release();
        return;
      }
      const mine = Input.joy.active && p.id === Input.joy.id;
      Input.pointerUp(p);
      if (!mine || this.panelOpen) return;
      const other = this.input.manager.pointers.find((q) => q && q !== p && q.isDown && q.id !== p.id);
      if (other) Input.pointerDown(other);
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
    this.input.on('gameout', () => { Input.release(); this.pinch = null; });
    // mouse wheel zoom (PC)
    this.input.on('wheel', (p, over, dx, dy) => {
      if (this.panelOpen || !dy) return;
      this.gs.zoomBy(dy > 0 ? 1 / 1.12 : 1.12);
    });

    this.setCoins(this.gs.economy.coins, 0);
    this.ready = true;
  }

  onResize(gameSize) {
    this.W = View.W; this.H = View.H;
    this.cameras.main.setSize(gameSize.width, gameSize.height);
    View.applyUI(this.cameras.main);
    this.layout();
  }

  layout() {
    const W = this.W, H = this.H;
    const top = 62 + View.safeTop;
    this.coinBar.setPosition(26, top);
    this.coinIcon.setPosition(64, top);
    this.coinText.setPosition(104, top + 2);
    this.popBox.setPosition(28, top + 152);
    this.setBtn.setPosition(W - 62, top);
    const zb = H - 168 - View.safeBottom;
    this.mapBtn.setPosition(W - 56, zb);
    this.zoomOutBtn.setPosition(W - 56, zb - 84);
    this.zoomInBtn.setPosition(W - 56, zb - 160);
    this.whistleBaseY = zb;
    this.whistleBtn.setPosition(62, zb - (this.whistleLift || 0));
    this.whistleBadge.setPosition(92, zb - (this.whistleLift || 0) - 30);
    this.objPanel.setPosition(W / 2, top + 88);
    this.toastBox.setPosition(W / 2, H - 230 - View.safeBottom);
    this.bannerBox.setPosition(W / 2, H * 0.27);
    if (this.fps) this.fps.setPosition(12, H - 34);
    if (this.panel) this.layoutPanel();
    if (this.buildOpen) this.closeBuildMenu(true);
    if (this.hud4) this.hud4.layout();
  }

  // ---------------------------------------------------------------- (v4-B) the neighbour-town HUD
  openOrders() { if (this.hud4 && !this.panelOpen && !this.buildOpen) this.hud4.openOrders(); }
  openRank() { if (this.hud4 && !this.panelOpen && !this.buildOpen) this.hud4.openRank(); }
  openBoard() { if (this.hud4 && !this.panelOpen && !this.buildOpen) this.hud4.openBoard(); }   // (v4-C) the town hall's notice board
  rankBadgeFly(wx, wy) { if (this.hud4) this.hud4.badgeFly(wx, wy); }

  // ---------------------------------------------------------------- widgets
  makeIconButton(x, y, iconKey, size, onClick) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(0x1f3354, 0.25); g.fillCircle(0, 5, size / 2);
    g.fillStyle(0xffffff, 0.95); g.fillCircle(0, 0, size / 2);
    g.lineStyle(4, 0xd7e3f2, 1); g.strokeCircle(0, 0, size / 2 - 2);
    const ic = Assets.image(this, 0, 0, iconKey).setOrigin(0.5);
    ic.setScale((size * 0.62) / Math.max(ic.frame.realWidth, 1));
    c.add([g, ic]);
    c.icon = ic;
    c.setSize(size, size);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => { this.tweens.add({ targets: c, scale: 0.88, duration: 70, yoyo: true }); Audio.play('sfx_click'); onClick(); });
    return c;
  }

  /** round zoom button: the UI-2 icon when there is one, otherwise a drawn + / - / map symbol */
  makeZoomButton(kind, onClick) {
    const key = { in: 'ui_icon_zoom_in', out: 'ui_icon_zoom_out', map: 'ui_icon_map' }[kind];
    const size = 70;
    if (Assets.has(key)) {
      const b = this.makeIconButton(0, 0, key, size, onClick);
      b.kind = kind;
      return b;
    }
    const c = this.add.container(0, 0);
    const g = this.add.graphics();
    g.fillStyle(0x1f3354, 0.25); g.fillCircle(0, 5, size / 2);
    g.fillStyle(0xffffff, 0.95); g.fillCircle(0, 0, size / 2);
    g.lineStyle(4, 0xd7e3f2, 1); g.strokeCircle(0, 0, size / 2 - 2);
    const ic = this.add.graphics();
    ic.lineStyle(7, 0x2a64a8, 1);
    if (kind === 'in') { ic.lineBetween(-13, 0, 13, 0); ic.lineBetween(0, -13, 0, 13); }
    else if (kind === 'out') ic.lineBetween(-13, 0, 13, 0);
    else {
      // folded map
      ic.lineStyle(3.5, 0x2a64a8, 1);
      ic.fillStyle(0xdcecff, 1);
      ic.beginPath(); ic.moveTo(-17, -11); ic.lineTo(-6, -15); ic.lineTo(6, -11); ic.lineTo(17, -15); ic.lineTo(17, 11); ic.lineTo(6, 15); ic.lineTo(-6, 11); ic.lineTo(-17, 15); ic.closePath(); ic.fillPath(); ic.strokePath();
      ic.lineBetween(-6, -15, -6, 11); ic.lineBetween(6, -11, 6, 15);
      ic.fillStyle(0xd9483b, 1); ic.fillCircle(11, -3, 4);
    }
    c.add([g, ic]);
    c.icon = ic;
    c.kind = kind;
    c.setSize(size, size);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => { this.tweens.add({ targets: c, scale: 0.88, duration: 70, yoyo: true }); Audio.play('sfx_click'); onClick(); });
    return c;
  }

  /** the village zoom changed: show the overview button as pressed while the whole village is shown */
  zoomChanged() {
    if (!this.mapBtn) return;
    const on = !!this.gs.overview;
    this.mapBtn.setAlpha(on ? 1 : 0.92);
    if (this.mapBtn.list && this.mapBtn.list[0] && this.mapBtn.list[0].clear && !this.mapBtn.__real) {
      const g = this.mapBtn.list[0], size = 70;
      g.clear();
      g.fillStyle(0x1f3354, 0.25); g.fillCircle(0, 5, size / 2);
      g.fillStyle(on ? 0xffe9a8 : 0xffffff, 0.95); g.fillCircle(0, 0, size / 2);
      g.lineStyle(4, on ? 0xffc83d : 0xd7e3f2, 1); g.strokeCircle(0, 0, size / 2 - 2);
    }
  }

  makeButton(x, y, w, h, style, label, onClick, size = 30) {
    const c = this.add.container(x, y);
    const bg = panel(this, 0, 0, 'ui_button_' + style, w, h).setOrigin(0.5);
    const tx = this.add.text(0, -3, label, style === 'gray' ? TXT(size, '#ffffff', '#4a5361', 6, '900') : TXT(size, '#ffffff', 'rgba(0,0,0,0.25)', 4, '900')).setOrigin(0.5);
    c.add([bg, tx]);
    c.bg = bg; c.text = tx;
    c.setSize(w, h);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => { this.tweens.add({ targets: c, scale: 0.94, duration: 70, yoyo: true }); Audio.play('sfx_click'); onClick(); });
    return c;
  }

  // ---------------------------------------------------------------- (v4-C2) 수다 떨기
  /** the "수다 떨기" pill that appears under a tapped resident (with a persona card) for a few seconds */
  buildChatButton() {
    const c = this.add.container(0, 0).setDepth(31).setVisible(false);
    const b = this.makeButton(0, 0, 236, 76, 'green', '', () => this.chatPressed(), 28);
    const ic = Assets.image(this, -84, -2, Assets.pick('emote_dots', 'emote_heart')).setOrigin(0.5);
    ic.setScale(44 / Math.max(1, ic.frame.realWidth));
    b.text.setText(t('chatBtn')).setX(18);
    b.add(ic);
    c.add(b);
    this.chatBtn = c; this.chatBtnB = b;
    this.chatFor = null; this.chatT = 0;
  }

  showChatButton(r) {
    if (!this.chatBtn || this.panelOpen || this.buildOpen || this.v4PanelOpen) return;
    this.chatFor = r; this.chatT = 6;
    this.chatBtnB.text.setText(t('chatBtn'));
    this.tweens.killTweensOf(this.chatBtn);
    this.chatBtn.setVisible(true).setScale(0.5).setAlpha(0);
    this.tweens.add({ targets: this.chatBtn, scale: 1, alpha: 1, duration: 200, ease: 'Back.easeOut' });
    this.placeChatButton(true);
    if (window.__FV) window.__FV.chatButton = true;
  }

  hideChatButton() {
    if (!this.chatBtn || !this.chatFor) return;
    this.chatFor = null;
    this.tweens.killTweensOf(this.chatBtn);
    this.tweens.add({ targets: this.chatBtn, scale: 0.6, alpha: 0, duration: 140, onComplete: () => { if (!this.chatFor) this.chatBtn.setVisible(false); } });
    if (window.__FV) window.__FV.chatButton = false;
  }

  chatPressed() {
    const r = this.chatFor, rc = this.gs.residentChat;
    this.hideChatButton();
    if (r && rc) rc.open(r);
  }

  /** under the resident's feet (their bubble is over the head), on screen, above the bottom buttons */
  placeChatButton(snap) {
    const r = this.chatFor;
    if (!r) return;
    const sp = this.worldToScreen(r.x, r.y);
    const x = Phaser.Math.Clamp(sp.x, 140, this.W - 140);
    const y = Phaser.Math.Clamp(sp.y + 62, 200 + View.safeTop, this.H - 250 - View.safeBottom);
    if (snap) this.chatBtn.setPosition(x, y);
    else this.chatBtn.setPosition(this.chatBtn.x + (x - this.chatBtn.x) * 0.3, this.chatBtn.y + (y - this.chatBtn.y) * 0.3);
  }

  updateChatButton(dt) {
    const r = this.chatFor;
    if (!r) return;
    this.chatT -= dt;
    const p = this.gs.player;
    const gone = !r.alive || r.lod || !r.sprite || !r.sprite.visible || this.chatT <= 0 || this.panelOpen || this.buildOpen || this.v4PanelOpen
      || (p && Math.hypot(p.x - r.x, (p.y - r.y) * 2) > 700) || !this.gs.isOnScreen(r.x, r.y, 20);
    if (gone) { this.hideChatButton(); return; }
    this.placeChatButton(false);
  }

  // ---------------------------------------------------------------- (v3.5) dog bar
  buildDogBar() {
    // (v3.5 review) phone-sized: 88 px buttons (≈ 47 CSS px), labels inside the panel, empty hearts with contrast
    const c = this.add.container(0, 0).setVisible(false).setDepth(30);
    const BW = 336, BH = 204;
    const bg = panel(this, 0, 0, 'ui_panel', BW, BH).setOrigin(0.5).setAlpha(0.97);
    c.add(bg);
    this.dogBg = bg;
    this.dogBarH = BH;
    // affection: 5 hearts (a partly filled heart is the full one cropped over the empty one)
    this.dogHearts = [];
    for (let i = 0; i < 5; i++) {
      const x = -84 + i * 42;
      const e = Assets.image(this, x, -70, Assets.pick('ui_icon_heart_empty', 'ui_icon_lock')).setOrigin(0.5);
      e.setScale(36 / Math.max(1, e.frame.realWidth));
      e.setTint(0x9aa4b8);
      const f = Assets.image(this, x, -70, Assets.pick('ui_icon_heart_full', 'ui_icon_check')).setOrigin(0.5);
      f.setScale(36 / Math.max(1, f.frame.realWidth));
      c.add([e, f]);
      this.dogHearts.push({ e, f });
    }
    this.dogBtns = [];
    const defs = [['treat', 'ui_icon_treat'], ['play', 'ui_icon_play'], ['pet', 'ui_icon_pet']];
    defs.forEach(([kind, icon], i) => {
      const x = -104 + i * 104, y = -4;
      const b = this.add.container(x, y);
      const g = this.add.graphics();
      g.fillStyle(0x1f3354, 0.22); g.fillCircle(0, 5, 44);
      g.fillStyle(0xffffff, 1); g.fillCircle(0, 0, 44);
      g.lineStyle(5, 0xffd27a, 1); g.strokeCircle(0, 0, 41);
      const ic = Assets.image(this, 0, -2, Assets.pick(icon, 'ui_icon_worker')).setOrigin(0.5);
      ic.setScale(70 / Math.max(1, ic.frame.realWidth));
      const cdG = this.add.graphics();
      const lab = this.add.text(0, 66, t(kind === 'treat' ? 'dogTreat' : kind === 'play' ? 'dogPlay' : 'dogPet'), TXT(25, '#2b2f3a', '#ffffff', 5, '900')).setOrigin(0.5);
      b.add([g, ic, cdG, lab]);
      // the whole column (button + its name) is the touch target
      // (a container's hit area is measured from its top-left: size 100 x 150 -> local x -50..50, y -50..90)
      b.setSize(100, 150);
      b.setInteractive(new Phaser.Geom.Rectangle(0, 25, 100, 140), Phaser.Geom.Rectangle.Contains);
      // (v3.5 review) a press only counts when the finger lifts without dragging: a drag that starts on
      // the bar still moves the chief (UI pointer handlers below)
      b.on('pointerdown', (ptr) => { this.barPress = { id: ptr.id, x: ptr.x, y: ptr.y, t: this.time.now, kind, b }; this.tweens.add({ targets: b, scale: 0.88, duration: 70, yoyo: true }); });
      b.isDogBtn = true;
      c.add(b);
      this.dogBtns.push({ kind, b, ic, cdG, lab });
    });
    this.dogBar = c;
    this.dogBarOn = false;
  }

  /** (v3.5 review) the dog-bar press ends: a tap fires the button, a drag was the joystick */
  dogBarRelease(p) {
    const bp = this.barPress;
    if (!bp || bp.id !== p.id) return;
    this.barPress = null;
    const moved = Math.hypot(p.x - bp.x, p.y - bp.y) > 22 * View.k;
    if (moved || this.time.now - bp.t > 900 || !this.dogBarOn) return;
    if (this.gs.dog) this.gs.dog.command(bp.kind);
  }

  updateDogBar(dt) {
    const d = this.gs.dog;
    // the whistle shows once Kongi lives in the village
    const has = !!(d && d.r);
    if (this.whistleBtn.visible !== has) { this.whistleBtn.setVisible(has); this.whistleBadge.setVisible(has); }
    if (has) {
      const h = Math.floor(d.hearts);
      const txt = h > 0 ? '♥' + h : '';
      if (this.whistleBadge.text !== txt) this.whistleBadge.setText(txt);
      // a gentle wiggle while the dog is on its way
      const wig = d.mode === 'come' ? Math.sin(this.time.now / 70) * 0.18 : 0;
      this.whistleBtn.icon.setRotation(wig);
      // (v3.5 review) until the whistle was used once: it pulses, and a one-time tip says what it does
      const seen = this.gs.progress && this.gs.progress.seen;
      // (not during the first fish loop: one thing at a time)
      if (seen && !seen.whistle && this.gs.tutorial && !this.gs.tutorial.inTutorial) {
        this.whistleHintT = (this.whistleHintT || 0) + dt;
        const k = 1 + Math.max(0, Math.sin(this.time.now / 220)) * 0.12;
        this.whistleBtn.setScale(k);
        if (!this.whistleTipShown && this.whistleHintT > 4 && !this.panelOpen) { this.whistleTipShown = true; this.toast(t('dogWhistleHint'), 4000); }
      } else if (this.whistleBtn.scale !== 1) this.whistleBtn.setScale(1);
    }
    // (v4-B, v3.5 known issue) the whistle steps up when a pad / plot label would sit under it (glides)
    if (has) {
      this.whistleChk = (this.whistleChk || 0) - dt;
      if (this.whistleChk <= 0) { this.whistleChk = 0.25; this.whistleLift = this.whistleLiftFor(); }
      const want = this.whistleBaseY - (this.whistleLift || 0), y0 = this.whistleBtn.y;
      if (Math.abs(y0 - want) > 0.5) { const y = y0 + (want - y0) * Math.min(1, dt * 10); this.whistleBtn.y = y; this.whistleBadge.y = y - 30; }
    }
    // (not over the whole-village view: the dog is a dot there)
    const on = !!(d && d.barVisible() && !this.gs.overview && (this.gs.zoomCur || 1) >= 0.7);
    if (on !== this.dogBarOn) {
      this.dogBarOn = on;
      this.tweens.killTweensOf(this.dogBar);
      if (on) { this.dogBar.setVisible(true).setScale(0.5).setAlpha(0); this.tweens.add({ targets: this.dogBar, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' }); }
      else this.tweens.add({ targets: this.dogBar, scale: 0.6, alpha: 0, duration: 160, onComplete: () => { if (!this.dogBarOn) this.dogBar.setVisible(false); } });
    }
    if (!on) return;
    const r = d.r;
    const sp = this.worldToScreen(r.x, r.y + (r.headTop || -40));
    // (above the chief's head too when he stands by the dog, with room for the hearts that rise between them;
    //  the gap follows the zoom so the bar does not float far away when zoomed out)
    const p = this.gs.player;
    const half = (this.dogBarH || 204) / 2, zk = (this.gs.cameras.main.zoom || 1) / View.k;
    let top = sp.y - half - 10 - 8 * zk;
    if (p && Math.abs(p.x - r.x) < 160 && Math.abs(p.y - r.y) < 90) { const pp = this.worldToScreen(p.x, p.y + p.headTop); top = Math.min(top, pp.y - half - 12 - 26 * zk); sp.x = (sp.x + pp.x) / 2; }
    // never over the guide text / the population badge at the top, nor the buttons at the bottom
    // ((v4-B) below the rank / order chips too)
    const minY = (this.hud4 ? Math.max(62 + View.safeTop + 152 + 26, this.hud4.bottom()) : 62 + View.safeTop + 152 + 26) + half, maxY = this.H - 250 - View.safeBottom - half * 0.4;
    const x = Phaser.Math.Clamp(sp.x, 180, this.W - 180), y = Phaser.Math.Clamp(top, minY, Math.max(minY, maxY));
    this.dogBar.setPosition(this.dogBar.x ? this.dogBar.x + (x - this.dogBar.x) * Math.min(1, dt * 12) : x, this.dogBar.y ? this.dogBar.y + (y - this.dogBar.y) * Math.min(1, dt * 12) : y);
    const love = d.hearts;
    for (let i = 0; i < 5; i++) {
      const q = this.dogHearts[i];
      const f = Math.max(0, Math.min(1, love - i));
      q.f.setVisible(f > 0.02);
      if (f > 0.02 && f < 0.999) { const fw = q.f.frame.realWidth, fh = q.f.frame.realHeight; q.f.setCrop(0, fh * (1 - f), fw, fh * f); }
      else if (q.f.isCropped) q.f.setCrop();
    }
    const busy = d.mode === 'scene';
    for (const q of this.dogBtns) {
      const cd = d.cooldown(q.kind), mx = d.cooldownMax(q.kind);
      const ready = cd <= 0 && !busy;
      q.b.setAlpha(ready ? 1 : 0.55);
      q.cdG.clear();
      if (cd > 0) {
        q.cdG.fillStyle(0x1f3354, 0.35);
        q.cdG.slice(0, 0, 42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (cd / mx), false);
        q.cdG.fillPath();
      }
    }
  }

  // ---------------------------------------------------------------- coins
  setCoins(v, delayMs) {
    this.targetCoins = v;
    if (delayMs) this.coinDelay = Math.max(this.coinDelay, delayMs / 1000);
    if (v < this.displayCoins) this.displayCoins = v;
  }

  /** how far the whistle button steps up so no world label (pad / plot sign) sits under it: 0, 110 or 220 px */
  whistleLiftFor() {
    const gs = this.gs, cam = gs.cameras.main, k = (cam.zoom || 1) / View.k;
    const boxes = [];
    const add = (o) => {
      if (!o || !o.label || !o.labelBg || !o.label.visible || !o.label.active) return;
      const c = this.worldToScreen(o.label.x, o.label.y), hw = o.labelBg.width * 0.5 * k, hh = o.labelBg.height * 0.5 * k;
      if (c.x - hw < 140 && c.y + hh > this.whistleBaseY - 300) boxes.push([c.x - hw, c.y - hh, c.x + hw, c.y + hh]);
    };
    const pads = gs.progress && gs.progress.pads;
    for (const id in pads || {}) add(pads[id]);
    for (const id in gs.sites || {}) add(gs.sites[id]);
    if (!boxes.length) return 0;
    const bx = 62, R = 48;
    const hit = (y) => boxes.some((b) => bx + R > b[0] && bx - R < b[2] && y + R > b[1] && y - R < b[3]);
    // (never up into the population badge / the v4 chips)
    const minTop = (this.hud4 ? Math.max(this.hud4.bottom(), 62 + View.safeTop + 180) : 62 + View.safeTop + 180) + 8;
    for (const lift of [0, 110, 220]) if (this.whistleBaseY - lift - R >= minTop && !hit(this.whistleBaseY - lift)) return lift;
    return 0;
  }

  /** (v4 review) the HUD's bottom edge (coins, population badge, the v4 chips) as a fraction of the screen height */
  hudBottomFrac() {
    const b = (this.hud4 ? Math.max(this.hud4.bottom(), 62 + View.safeTop + 180) : 62 + View.safeTop + 180) + 10;
    return this.H > 0 ? Math.min(0.6, b / this.H) : 0.24;
  }

  worldToScreen(wx, wy) {
    // (from the scroll + zoom themselves: cam.worldView is only refreshed when the frame is drawn)
    const cam = this.gs.cameras.main, z = cam.zoom || 1;
    const vx = cam.scrollX + cam.width * 0.5 * (1 - 1 / z), vy = cam.scrollY + cam.height * 0.5 * (1 - 1 / z);
    return { x: ((wx - vx) * z) / View.k, y: ((wy - vy) * z) / View.k };
  }

  coinFly(wx, wy, n) {
    const s = this.worldToScreen(wx, wy);
    const tx = this.coinIcon.x, ty = this.coinIcon.y;
    for (let i = 0; i < n; i++) {
      let c = this.flyPool.pop();
      if (!c) c = Assets.image(this, 0, 0, 'ui_icon_coin').setOrigin(0.5);
      c.setScale(40 / Math.max(c.frame.realWidth, 1)).setVisible(true).setAlpha(1).setDepth(40);
      const sx = s.x + (Math.random() - 0.5) * 40, sy = s.y + (Math.random() - 0.5) * 30;
      c.setPosition(sx, sy);
      const mx = sx + (Math.random() - 0.5) * 160, my = sy - 60 - Math.random() * 80;
      this.tweens.addCounter({
        from: 0, to: 1, duration: 520 + i * 40, delay: i * 45, ease: 'Sine.easeIn',
        onUpdate: (tw) => {
          const p = tw.getValue(), q = 1 - p;
          c.setPosition(q * q * sx + 2 * q * p * mx + p * p * tx, q * q * sy + 2 * q * p * my + p * p * ty);
        },
        onComplete: () => {
          c.setVisible(false); this.flyPool.push(c);
          this.popCoin();
          Audio.play('sfx_coin', { volume: 0.35, rate: 1 + Math.random() * 0.3, throttle: 45 });
        },
      });
    }
  }

  popCoin() {
    const ic = this.coinIcon;
    this.tweens.killTweensOf(ic);
    ic.setScale(ic.__bs * 1.25);
    this.tweens.add({ targets: ic, scale: ic.__bs, duration: 200, ease: 'Back.easeOut' });
  }

  // ---------------------------------------------------------------- messages
  toast(msg, hold) {
    this.toastText.setText(msg);
    this.toastBg.setSize(Math.max(260, this.toastText.width + 70), 64);
    const b = this.toastBox;
    this.tweens.killTweensOf(b);
    b.setVisible(true).setAlpha(1).setScale(0.7);
    this.tweens.add({ targets: b, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, delay: hold || 1500, duration: 350, onComplete: () => b.setVisible(false) });
  }

  banner(msg, sub) {
    const b = this.bannerBox;
    this.bannerText.setText(msg).setScale(1);
    this.bannerSub.setText(sub || '').setScale(1);
    // (v4-A) a long title / subtitle shrinks to fit a narrow phone instead of running off the screen
    const maxW = this.W - 40;
    if (this.bannerText.width + 90 > maxW) this.bannerText.setScale((maxW - 90) / this.bannerText.width);
    if (this.bannerSub.width + 44 > maxW) this.bannerSub.setScale((maxW - 44) / this.bannerSub.width);
    this.bannerBg.setSize(Math.max(360, this.bannerText.displayWidth + 90), 104);
    const g = this.bannerSubBg;
    g.clear();
    if (sub) {
      const w = this.bannerSub.displayWidth + 44, h = 50;
      g.fillStyle(0x1f3354, 0.62); g.fillRoundedRect(-w / 2, 80 - h / 2, w, h, h / 2);
    }
    this.tweens.killTweensOf(b);
    b.setVisible(true).setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: b, scale: 1, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, y: { from: this.H * 0.27, to: this.H * 0.25 }, delay: sub ? 3200 : 1700, duration: 400, onComplete: () => { b.setVisible(false); b.y = this.H * 0.27; } });
  }

  celebrate(v3) {
    if (v3) this.banner(t('v3Complete'), t('v3CompleteSub'));
    else this.banner(t('villageComplete'), t('villageCompleteSub'));
    const sf = Assets.sprite('fx_star');
    const fr = this.textures.get(sf.tex).get(sf.frame);
    const base = 22 / Math.max(8, fr.width);
    const cfg = {
      x: { min: 0, max: this.W }, y: -30, lifespan: 3200, speedY: { min: 200, max: 420 }, speedX: { min: -80, max: 80 },
      scale: { min: base * 0.7, max: base * 1.3 }, rotate: { start: 0, end: 540 }, frequency: 25, quantity: 2,
      tint: [0xff6f91, 0x3d8be0, 0x5cc86a, 0xffc83d, 0xd9483b, 0xffffff], duration: 2600,
    };
    if (sf.frame !== undefined) cfg.frame = sf.frame;
    const e = this.add.particles(0, 0, sf.tex, cfg).setDepth(55);
    this.time.delayedCall(6500, () => e.destroy());
  }

  setObjective(key, tg, text) {
    this.objTarget = tg;
    if (key !== this.objKey) {
      this.objKey = key;
      this.objCustom = text || null;
      if (!key) { this.objPanel.setVisible(false); }
      else {
        this.objText.setText(text || t(key));
        this.objBg.setSize(this.objText.width + 60, 62);
        this.objPanel.setVisible(true).setScale(0.8);
        this.tweens.add({ targets: this.objPanel, scale: 1, duration: 220, ease: 'Back.easeOut' });
      }
    }
  }

  // ---------------------------------------------------------------- (v3) population
  setPopulation(n, cap, waiting) {
    const key = n + '/' + cap + '/' + waiting;
    if (key === this.popKey) return;
    const first = !this.popKey;
    this.popKey = key;
    // shown once there is something to say about homes (the cap is reached or someone waits)
    const show = this.popBox.visible || waiting > 0 || n >= cap;
    this.popBox.setVisible(show);
    this.popText.setText(n + '/' + cap);
    this.popIcon.setPosition(26, 0);
    this.popText.setPosition(52, 1);
    let w = 52 + this.popText.width + 18;
    if (waiting > 0) {
      this.popHouse.setVisible(true).setPosition(w + 6, 0);
      this.popWait.setText('+' + waiting).setVisible(true).setPosition(w + 24, 1);
      w += 34 + this.popWait.width + 12;
    } else { this.popHouse.setVisible(false); this.popWait.setVisible(false); }
    this.popBg.setSize(Math.max(110, w), 50);
    if (show && !first) { this.tweens.killTweensOf(this.popBox); this.popBox.setScale(1.15); this.tweens.add({ targets: this.popBox, scale: 1, duration: 260, ease: 'Back.easeOut' }); }
  }

  // the village pauses under a menu. The SceneManager calls act at once (the ScenePlugin ones are queued to the
  // next frame, so a menu opened and closed within one frame would leave the village paused for good)
  pauseGame() { const m = this.game.scene; if (!m.isPaused('Game')) m.pause('Game'); }
  resumeGame() { const m = this.game.scene; if (m.isPaused('Game')) m.resume('Game'); }

  // ---------------------------------------------------------------- (v3) build menu
  /**
   * the chief stands on an empty plot: pick a building (cards: picture, name, cost, what it does).
   * (v4-C) the cards sit in tabs (일터 · 집 · 꾸미기 · 마을) — only the tabs this plot offers; every locked card says
   * what opens it (Civic.choices `text`)
   */
  openBuildMenu(site) {
    if (this.panelOpen || this.buildOpen) return;
    const gs = this.gs;
    this.buildOpen = true;
    this.buildSite = site;
    Input.release();
    this.pauseGame();
    const W = this.W, H = this.H;
    const choices = gs.buildChoices(site);
    this.buildChoicesList = choices;
    const catOf = (q) => q.cat || 'work';
    const tabs = TABS.filter((k) => choices.some((q) => catOf(q) === k));
    const per = Math.max(1, ...tabs.map((k) => choices.filter((q) => catOf(q) === k).length));
    const cols = Math.min(4, Math.max(2, per));
    const cw = cols === 4 ? 160 : 200, chh = 262, gap = 10;
    const rows = Math.ceil(per / cols);
    const tabH = tabs.length > 1 ? 80 : 0;
    const gridW = cols * cw + (cols - 1) * gap;
    const sheetW = Math.min(W - 24, Math.max(gridW + 40, tabs.length * 150 + 40));
    const sheetH = 130 + tabH + rows * chh + (rows - 1) * gap + 130;
    const top = H - sheetH - 20 - View.safeBottom;
    const c = this.add.container(0, 0).setDepth(85);
    const dim = this.add.rectangle(W / 2, H / 2, W * 2, H * 2, 0x1b2638, 0.35).setInteractive();
    dim.on('pointerdown', () => this.closeBuildMenu());
    const bg = panel(this, W / 2, top + sheetH / 2, 'ui_panel', sheetW, sheetH).setOrigin(0.5).setInteractive();
    c.add([dim, bg]);
    const title = this.add.text(W / 2, top + 46, t('buildTitle'), TXT(36, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0.5);
    const sub = this.add.text(W / 2, top + 88, t(site.only ? 'plotOnly_' + site.only : 'buildSize_' + site.size), TXT(22, '#6b7686', '#ffffff', 0, '800')).setOrigin(0.5);
    c.add([title, sub]);
    const close = this.makeIconButton(W / 2 + sheetW / 2 - 40, top + 40, 'ui_icon_close', 62, () => this.closeBuildMenu());
    c.add(close);
    // (v4-C) the tab row
    this.buildTabs = tabs;
    this.buildTabBtns = [];
    if (tabs.length > 1) {
      const tw = Math.min(170, (sheetW - 40 - (tabs.length - 1) * 8) / tabs.length), ty = top + 120 + 30;
      const tx0 = W / 2 - (tabs.length * tw + (tabs.length - 1) * 8) / 2 + tw / 2;
      tabs.forEach((k, i) => {
        const b = this.makeTab(k, tx0 + i * (tw + 8), ty, tw, 60, choices.filter((q) => catOf(q) === k));
        c.add(b.c);
        this.buildTabBtns.push(b);
      });
    }
    this.buildGrid = { gx0: W / 2 - gridW / 2 + cw / 2, y0: top + 120 + tabH + chh / 2, cols, cw, chh, gap };
    this.buildCardsC = this.add.container(0, 0);
    c.add(this.buildCardsC);
    this.buildCards = [];
    // confirm button
    const btn = this.makeButton(W / 2, top + sheetH - 72, Math.min(sheetW - 60, 460), 92, 'green', '', () => this.confirmBuild(), 30);
    c.add(btn);
    this.buildBtn = btn;
    this.buildPanel = c;
    // the first card: the next goal's building when this plot offers it, else the first open card
    const g = gs.progress && gs.progress.nextGoal ? gs.progress.nextGoal() : null;
    const goalCard = g && g.kind === 'build' ? choices.find((q) => q.key === g.id && !q.locked) : null;
    const firstOk = goalCard || choices.find((q) => !q.locked);
    this.buildTab = firstOk ? catOf(firstOk) : tabs[0];
    this.showBuildTab(this.buildTab, firstOk ? firstOk.key : null);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 150 });
    bg.setScale(0.9);
    this.tweens.add({ targets: bg, scale: 1, duration: 220, ease: 'Back.easeOut' });
    Audio.play('sfx_click');
    if (window.__FV) window.__FV.buildMenuOpen = true;
  }

  /** (v4-C) a tab of the build menu: icon + name (+ a dot when it has a card that can be built now) */
  makeTab(cat, x, y, w, h, cards) {
    const c = this.add.container(x, y);
    const g = this.add.graphics();
    const ic = Assets.image(this, -w / 2 + 30, 0, Assets.pick(...TAB_ICON[cat])).setOrigin(0.5);
    ic.setScale(34 / Math.max(1, ic.frame.realWidth, ic.frame.realHeight));
    const tx = this.add.text(-w / 2 + 54, 0, t('tab_' + cat), TXT(w < 150 ? 20 : 22, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0, 0.5);
    c.add([g, ic, tx]);
    const open = cards.filter((q) => !q.locked).length;
    if (!open) { ic.setAlpha(0.5); tx.setAlpha(0.6); }
    const draw = (on) => {
      g.clear();
      g.fillStyle(0x1f3354, 0.18); g.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, 18);
      g.fillStyle(on ? 0xffe9a8 : 0xf4f7fb, 1); g.fillRoundedRect(-w / 2, -h / 2, w, h, 18);
      g.lineStyle(4, on ? 0xffb52e : 0xd7e3f2, 1); g.strokeRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 16);
    };
    draw(false);
    c.setSize(w, h);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', () => { Audio.play('sfx_click'); this.showBuildTab(cat); });
    return { c, cat, draw };
  }

  /** (v4-C) show one tab's cards; `sel`: the card to pick (else keep the pick when it is in this tab) */
  showBuildTab(cat, sel) {
    if (!this.buildOpen || !this.buildCardsC) return;
    this.buildTab = cat;
    for (const b of this.buildTabBtns || []) b.draw(b.cat === cat);
    const G = this.buildGrid;
    this.buildCardsC.removeAll(true);
    this.buildCards = [];
    const list = (this.buildChoicesList || []).filter((q) => (q.cat || 'work') === cat);
    this.buildThumbWait = [];
    list.forEach((ch, i) => {
      const col = i % G.cols, row = Math.floor(i / G.cols);
      const n = Math.min(G.cols, list.length - row * G.cols);
      const x = G.gx0 + col * (G.cw + G.gap) + ((G.cols - n) * (G.cw + G.gap)) / 2, y = G.y0 + row * (G.chh + G.gap);
      const card = this.makeCard(ch, x, y, G.cw, G.chh);
      this.buildCardsC.add(card.c);
      this.buildCards.push(card);
      if (card.waiting) this.buildThumbWait.push(ch.key);
    });
    // (the pictures still missing are asked for again: Residency may have let their page go)
    if (this.buildThumbWait.length && this.gs.civic && this.gs.progress.met('tower_east')) {
      const keys = [];
      for (const k of this.buildThumbWait) for (const a of (CATALOG[k] && CATALOG[k].art) || []) keys.push(a);
      this.gs.civic.needArt(keys, () => {});
    }
    let key = sel !== undefined ? sel : this.buildSel;
    if (!list.some((q) => q.key === key)) { const ok = list.find((q) => !q.locked); key = ok ? ok.key : null; }
    this.selectCard(key, true);
  }

  makeCard(ch, x, y, w, h) {
    const c = this.add.container(x, y);
    const bg = panel(this, 0, 0, 'ui_card', w, h).setOrigin(0.5);
    const bgSel = panel(this, 0, 0, Assets.pick('ui_card_selected', 'ui_card'), w, h).setOrigin(0.5).setVisible(false);
    c.add([bg, bgSel]);
    // the picture: (v4-C) Civic.thumb (a late town picture shows the hammer until it is here)
    const civ = this.gs.civic;
    let spr = civ ? civ.thumb(ch.key) : null;
    const waiting = !spr && !!(civ && CATALOG[ch.key]);
    const wi = waiting && CATALOG[ch.key] && CATALOG[ch.key].waitIcon;
    if (!spr) spr = waiting ? (wi && Assets.has(wi) ? wi : 'ui_icon_hammer') : ({ toolsmith: 'station_toolsmith', cannery: 'station_cannery', store: 'shop_general', warehouse: 'warehouse', boathouse: 'boathouse', watchtower: 'watchtower', station: 'train_station' }[ch.key] || ch.key);   // (v4-A) station
    const th = Assets.image(this, 0, -h / 2 + 64, spr).setOrigin(0.5, 0.5);
    const fw = Math.max(1, th.frame.realWidth), fh = Math.max(1, th.frame.realHeight);
    th.setScale(Math.min((w - 24) / fw, (waiting ? 64 : 104) / fh));
    if (waiting) th.setAlpha(0.7);
    c.add(th);
    const name = this.add.text(0, -h / 2 + 132, t('b_' + ch.key), TXT(w < 180 ? 21 : 23, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0.5);
    if (name.width > w - 14) name.setScale((w - 14) / name.width);
    c.add(name);
    // cost: coins, then materials
    const coin = Assets.image(this, 0, 0, 'ui_icon_coin').setOrigin(0.5);
    coin.setScale(24 / Math.max(1, coin.frame.realWidth));
    const coinT = this.add.text(0, 0, fmt(ch.cost.coins || 0), TXT(20, ch.cost.coins > this.gs.economy.coins && !ch.locked ? '#c0392b' : '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0, 0.5);
    const cy = -h / 2 + 164;
    const cwid = 28 + coinT.width;
    coin.setPosition(-cwid / 2 + 12, cy); coinT.setPosition(-cwid / 2 + 28, cy + 1);
    c.add([coin, coinT]);
    const mats = [['item_plank', ch.cost.item_plank], ['item_ingot', ch.cost.item_ingot]].filter((q) => q[1] > 0);
    let mw = 0;
    const mparts = mats.map(([k, n]) => { const ic = Assets.image(this, 0, 0, k).setOrigin(0.5, 0.6); ic.setScale(30 / Math.max(ic.frame.realWidth, ic.frame.realHeight, 1)); const tx = this.add.text(0, 0, '×' + n, TXT(19, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0, 0.5); mw += 30 + tx.width + 10; return [ic, tx]; });
    let mx = -mw / 2;
    for (const [ic, tx] of mparts) { ic.setPosition(mx + 14, cy + 30); tx.setPosition(mx + 30, cy + 31); mx += 30 + tx.width + 10; c.add([ic, tx]); }
    const people = Math.floor(Number(ch.cost.people) || 0);
    // what it does, or (locked) what opens it
    let line;
    if (ch.locked) line = ch.text || t(ch.reason);
    else if (/^deco_/.test(ch.key)) line = t('bp_deco', { n: ch.happy || 0 });
    else if (ch.key === 'town_hall') line = t('bp_town_hall', { n: Math.floor(Number(((BALANCE.civic || {}).hall || {}).people) || 0) });
    else line = t('bp_' + ch.key, { n: people });
    const fs = line.length > 24 ? 14 : 15;
    const desc = this.add.text(0, h / 2 - 40, line, Object.assign(TXT(fs, ch.locked ? '#a5532a' : '#5d6b80', '#ffffff', 0, '800'), { align: 'center', wordWrap: { width: w - 22, useAdvancedWrap: true }, lineSpacing: 0 })).setOrigin(0.5);
    c.add(desc);
    if (ch.locked) {
      for (const o of [th, name, coin, coinT]) o.setAlpha(0.45);
      for (const [ic, tx] of mparts) { ic.setAlpha(0.45); tx.setAlpha(0.45); }
      const lk = Assets.image(this, w / 2 - 26, -h / 2 + 26, 'ui_icon_lock').setOrigin(0.5);
      lk.setScale(34 / Math.max(1, lk.frame.realWidth));
      c.add(lk);
    } else if (ch.happy > 0) {
      // decor: a little heart badge with the happiness it brings
      const hb = Assets.image(this, w / 2 - 28, -h / 2 + 28, Assets.pick('ui_icon_happy', 'ui_icon_heart_full', 'ui_icon_check')).setOrigin(0.5);
      hb.setScale(34 / Math.max(1, hb.frame.realWidth, hb.frame.realHeight));
      c.add(hb);
    }
    c.setSize(w, h);
    c.setInteractive({ useHandCursor: !ch.locked });
    c.on('pointerdown', () => { if (ch.locked) { this.tweens.add({ targets: c, x: c.x + 6, duration: 50, yoyo: true, repeat: 2 }); Audio.play('sfx_error', { volume: 0.4 }); return; } Audio.play('sfx_click'); this.selectCard(ch.key); });
    return { c, bg, bgSel, ch, waiting };
  }

  selectCard(key, fromTab) {
    // (v4-C) a card of another tab: show that tab first
    if (!fromTab && key) {
      const ch0 = (this.buildChoicesList || []).find((q) => q.key === key);
      if (ch0 && (ch0.cat || 'work') !== this.buildTab && this.buildCardsC) { this.showBuildTab(ch0.cat || 'work', key); return; }
    }
    this.buildSel = key;
    for (const cd of this.buildCards || []) {
      const on = cd.ch.key === key;
      cd.bg.setVisible(!on); cd.bgSel.setVisible(on);
      if (on && !fromTab) { this.tweens.killTweensOf(cd.c); cd.c.setScale(1.06); this.tweens.add({ targets: cd.c, scale: 1, duration: 200, ease: 'Back.easeOut' }); }
    }
    const ch = (this.buildChoicesList || []).find((q) => q.key === key);
    const b = this.buildBtn;
    if (!b) return;
    if (!ch || ch.locked) { b.text.setText(t('buildPick')); b.setAlpha(0.6); b.ok = false; return; }
    const cost = buildCost(ch.key).coins || 0;
    const ok = this.gs.economy.coins >= cost;
    b.text.setText(ok ? t('buildBtn', { name: t('b_' + ch.key) }) + '  ' + fmt(cost) : t('buildNoCoins') + ' (' + fmt(cost) + ')');
    b.setAlpha(ok ? 1 : 0.6);
    b.ok = ok;
  }

  /** (v4-C) a card waits for its late picture: redraw the tab once it is here */
  updateBuildThumbs(dt) {
    if (!this.buildOpen || !this.buildThumbWait || !this.buildThumbWait.length || !this.gs.civic) return;
    this.buildThumbT = (this.buildThumbT || 0) - dt;
    if (this.buildThumbT > 0) return;
    this.buildThumbT = 0.4;
    if (this.buildThumbWait.some((k) => this.gs.civic.thumb(k))) this.showBuildTab(this.buildTab, this.buildSel);
  }

  confirmBuild() {
    const key = this.buildSel, site = this.buildSite;
    if (!key || !site) return;
    if (!this.buildBtn.ok) { Audio.play('sfx_error', { volume: 0.5 }); this.toast(t('notEnoughCoins')); return; }
    this.closeBuildMenu(true);
    this.gs.tryBuild(site, key);
  }

  closeBuildMenu(immediate) {
    if (!this.buildOpen) return;
    this.buildOpen = false;
    const c = this.buildPanel;
    this.buildPanel = null; this.buildCards = null; this.buildBtn = null; this.buildCardsC = null; this.buildTabBtns = null; this.buildThumbWait = null;
    if (!this.panelOpen) this.resumeGame();
    if (window.__FV) window.__FV.buildMenuOpen = false;
    if (!c) return;
    if (immediate) { c.destroy(); return; }
    this.tweens.add({ targets: c, alpha: 0, duration: 120, onComplete: () => c.destroy() });
  }

  // ---------------------------------------------------------------- settings
  openSettings(instant) {
    if (this.panelOpen) return;
    if (this.buildOpen) this.closeBuildMenu(true);
    this.panelOpen = true;
    Input.release();
    const W = this.W, H = this.H;
    const c = this.add.container(0, 0).setDepth(80);
    const dim = this.add.rectangle(W / 2, H / 2, W * 2, H * 2, 0x1b2638, 0.5).setInteractive();
    dim.on('pointerdown', () => {});
    const bg = panel(this, W / 2, H / 2, 'ui_panel', 560, 1020).setOrigin(0.5);
    c.add([dim, bg]);
    this.panel = c; this.panelBg = bg; this.panelDim = dim;
    this.buildPanelContent(false);
    if (!instant) {
      c.setAlpha(0);
      this.tweens.add({ targets: c, alpha: 1, duration: 160 });
      bg.setScale(0.8);
      this.tweens.add({ targets: bg, scale: 1, duration: 240, ease: 'Back.easeOut' });
    }
    this.pauseGame();
  }

  buildPanelContent(confirm) {
    this.panelConfirm = confirm;
    if (this.panelItems) for (const o of this.panelItems) o.destroy();
    this.panelItems = [];
    const W = this.W, H = this.H, cx = W / 2, cy = H / 2;
    const add = (o) => { this.panel.add(o); this.panelItems.push(o); return o; };
    if (!confirm) {
      // (v4-C2) seven rows on a 90 px pitch (76 px buttons never overlap): + 물결 품질, 주민 목소리
      add(this.add.text(cx, cy - 452, t('settings'), TXT(44, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0.5));
      const row = (y, label, value, style, cb, icon) => {
        if (icon) { const ic = add(Assets.image(this, cx - 200, y, icon).setOrigin(0.5)); ic.setScale(54 / Math.max(ic.frame.realWidth, 1)); }
        add(this.add.text(cx - 160, y, label, TXT(32, '#2b2f3a', '#ffffff', 0, '800')).setOrigin(0, 0.5));
        add(this.makeButton(cx + 130, y, 200, 76, style, value, cb, 28));
      };
      const S = Settings.data;
      const Y = (i) => cy - 330 + i * 90;
      row(Y(0), t('sound'), S.sound ? t('on') : t('off'), S.sound ? 'green' : 'gray', () => { Audio.setSoundEnabled(!S.sound); this.buildPanelContent(false); }, S.sound ? 'ui_icon_sound_on' : 'ui_icon_sound_off');
      row(Y(1), t('music'), S.music ? t('on') : t('off'), S.music ? 'green' : 'gray', () => { Audio.setMusicEnabled(!S.music); this.buildPanelContent(false); }, S.music ? 'ui_icon_music_on' : 'ui_icon_music_off');
      // globe icon for the language row (drawn, there is no icon sprite for it)
      const gl = add(this.add.graphics());
      const ly = Y(2);
      gl.fillStyle(0x3d8be0, 1); gl.fillCircle(cx - 200, ly, 25);
      gl.lineStyle(3, 0xffffff, 0.95); gl.strokeCircle(cx - 200, ly, 25);
      gl.strokeEllipse(cx - 200, ly, 22, 50); gl.lineBetween(cx - 225, ly, cx - 175, ly);
      gl.lineBetween(cx - 221, ly - 13, cx - 179, ly - 13); gl.lineBetween(cx - 221, ly + 13, cx - 179, ly + 13);
      row(ly, t('language'), t('langName'), 'blue', () => {
        const l = getLang() === 'ko' ? 'en' : 'ko';
        setLang(l); Settings.data.lang = l; Settings.save();
        this.onLanguage();
        this.buildPanelContent(false);
      });
      // ---- (v4-B) 낮과 밤 (day & night tint on / off) and 그래픽 (auto / sharp / light)
      row(Y(3), t('set_daynight'), S.daynight !== false ? t('on') : t('off'), S.daynight !== false ? 'green' : 'gray', () => { S.daynight = S.daynight === false; Settings.save(); this.buildPanelContent(false); }, Assets.pick('ui_icon_night', 'ui_icon_day', 'ui_icon_settings'));
      const gfx = S.gfx === 'high' || S.gfx === 'low' ? S.gfx : 'auto';
      row(Y(4), t('set_gfx'), t('gfx_' + gfx), 'blue', () => { S.gfx = gfx === 'auto' ? 'high' : gfx === 'high' ? 'low' : 'auto'; Settings.save(); if (this.gs.applyGfx) this.gs.applyGfx(); this.buildPanelContent(false); }, Assets.pick('ui_icon_speed', 'ui_icon_settings'));
      // ---- (v4-C2) 물결 품질: 높음 / 간단 (the living water; Canvas / old sea: shown, has no effect)
      const gd = this.gs.ground;
      const wq = (S.water || (gd && gd.waterQuality) || 'high') === 'low' ? 'low' : 'high';
      const wy = Y(5);
      const wi = add(this.add.graphics());
      wi.fillStyle(0x2f86c9, 1); wi.fillCircle(cx - 200, wy, 25);
      wi.lineStyle(4, 0xffffff, 0.95);
      for (const dy of [-7, 5]) { wi.beginPath(); for (let i = 0; i <= 16; i++) { const x = cx - 216 + i * 2, y = wy + dy + Math.sin(i * 0.8) * 3.5; if (i) wi.lineTo(x, y); else wi.moveTo(x, y); } wi.strokePath(); }
      row(wy, t('waterQuality'), wq === 'high' ? t('qualityHigh') : t('qualityLow'), wq === 'high' ? 'green' : 'gray', () => {
        S.water = wq === 'high' ? 'low' : 'high'; Settings.save();
        if (gd && gd.setWaterQuality) gd.setWaterQuality(S.water);
        this.gs.waterBudget = null;          // the player chose: no automatic switch any more
        this.buildPanelContent(false);
      });
      // ---- (v4-C2) 주민 목소리 (눈꽃말 voices): 끔 / 작게 / 보통 / 크게
      const VOL = [0, 0.35, 0.7, 1];
      const vv = typeof S.voice === 'number' ? S.voice : 1;
      let vi = 0;
      for (let i = 0; i < VOL.length; i++) if (Math.abs(VOL[i] - vv) < Math.abs(VOL[vi] - vv)) vi = i;
      row(Y(6), t('voiceVol'), t('voice_' + vi), vi === 0 ? 'gray' : 'green', () => {
        S.voice = VOL[(vi + 1) % VOL.length]; Settings.save();
        if (this.gs.voice) this.gs.voice.setVolume(S.voice);
        this.buildPanelContent(false);
      }, Assets.pick('emote_music', 'ui_icon_people'));
      add(this.makeButton(cx - 130, cy + 330, 240, 80, 'gray', t('reset'), () => this.buildPanelContent(true), 26));
      add(this.makeButton(cx + 130, cy + 330, 240, 80, 'green', t('reload'), () => this.reloadGame(), 26));
      add(this.add.text(cx, cy - 404, VERSION + ' · ' + BUILD_DATE, TXT(22, '#6b7686', '#ffffff', 0, '700')).setOrigin(0.5));
      add(this.makeButton(cx, cy + 428, 260, 80, 'blue', t('close'), () => this.closeSettings(), 30));
    } else {
      add(this.add.text(cx, cy - 120, t('resetConfirm'), Object.assign(TXT(32, '#2b2f3a', '#ffffff', 0, '800'), { align: 'center', lineSpacing: 10 })).setOrigin(0.5));
      add(this.makeButton(cx, cy + 60, 360, 84, 'gray', t('yes'), () => { this.closeSettings(true); this.gs.resetProgress(); }, 30));
      add(this.makeButton(cx, cy + 160, 360, 84, 'green', t('no'), () => this.buildPanelContent(false), 30));
    }
    const close = add(this.makeIconButton(cx + 250, cy - 478, 'ui_icon_close', 70, () => this.closeSettings()));
    void close;
  }

  /** save, then reload the page (phones can't pull-to-refresh inside the game) */
  reloadGame() {
    try { this.gs.save(true); } catch (e) { /* keep going */ }
    try { window.location.reload(); } catch (e) { /* ignore */ }
  }

  /** after a resize / rotation: rebuild the open settings panel around the new centre */
  layoutPanel() {
    if (!this.panelOpen || !this.panel) return;
    const confirm = !!this.panelConfirm;
    this.closeSettings(true, true);
    this.openSettings(true);
    if (confirm) this.buildPanelContent(true);
  }

  closeSettings(immediate, keepPaused) {
    if (!this.panelOpen) return;
    this.panelOpen = false;
    const c = this.panel;
    this.panel = null; this.panelItems = null;
    if (!keepPaused && !this.buildOpen) this.resumeGame();
    if (immediate) { c.destroy(); return; }
    this.tweens.add({ targets: c, alpha: 0, duration: 140, onComplete: () => c.destroy() });
  }

  onLanguage() {
    // refresh world texts that depend on the language
    const gs = this.gs;
    for (const id in gs.progress.pads) gs.progress.pads[id].refresh();
    for (const k in gs.progress.upPads) gs.progress.upPads[k].refresh();
    for (const id in gs.zones) { const z = gs.zones[id]; if (z.outline) z.outline.txt.setText(t(z.cfg.name)); }
    // (v3.5) work spots, piles, the dog bar
    for (const x of gs.stationList.concat(gs.workshops)) if (x.op) x.op.refresh();
    for (const id in gs.piles) gs.piles[id].refresh();
    for (const q of this.dogBtns || []) q.lab.setText(t(q.kind === 'treat' ? 'dogTreat' : q.kind === 'play' ? 'dogPlay' : 'dogPet'));
    if (this.objKey) { this.objKey = null; }   // the tutorial re-sends the objective (re-translated) within 0.2 s
  }

  // ---------------------------------------------------------------- frame
  update(time, delta) {
    try { this.tick(time, delta); } catch (e) { if (!this._tickErr) { this._tickErr = true; console.error('[FrostVillage] UI error:', e); } }
  }

  tick(time, delta) {
    const dt = delta / 1000;
    // coin counter
    if (this.coinDelay > 0) this.coinDelay -= dt;
    else if (this.displayCoins !== this.targetCoins) {
      const diff = this.targetCoins - this.displayCoins;
      const step = Math.max(1, Math.ceil(Math.abs(diff) * Math.min(1, dt * 10)));
      this.displayCoins += Math.sign(diff) * Math.min(Math.abs(diff), step);
    }
    const s = fmt(this.displayCoins);
    if (this.coinText.text !== s) {
      this.coinText.setText(s);
      this.coinBar.setSize(Math.max(170, this.coinText.width + 128), 74);
    }
    // joystick
    const j = Input.joy;
    if (j.active && !this.panelOpen) {
      this.joyBase.setVisible(true).setPosition(j.bx, j.by);
      const dx = j.kx - j.bx, dy = j.ky - j.by, d = Math.hypot(dx, dy), m = Math.min(d, JOY_RADIUS);
      this.joyKnob.setVisible(true).setPosition(j.bx + (d ? (dx / d) * m : 0), j.by + (d ? (dy / d) * m : 0));
    } else { this.joyBase.setVisible(false); this.joyKnob.setVisible(false); }
    // objective edge indicator
    const tg = this.objTarget;
    if (tg && this.gs.tutorial && this.gs.tutorial.target) {
      const p = this.worldToScreen(tg.x, tg.y - (tg.h || 0) * 0.5);
      const M = 64;
      if (p.x < -10 || p.x > this.W + 10 || p.y < 120 || p.y > this.H + 10) {
        const cx = this.W / 2, cy = this.H / 2;
        const a = Math.atan2(p.y - cy, p.x - cx);
        const ex = Phaser.Math.Clamp(p.x, M, this.W - M), ey = Phaser.Math.Clamp(p.y, 150 + 40, this.H - M);
        const bob = Math.sin(time / 160) * 6;
        this.edge.setVisible(true).setPosition(ex - Math.cos(a) * bob, ey - Math.sin(a) * bob).setRotation(a - Math.PI / 2);
      } else this.edge.setVisible(false);
    } else this.edge.setVisible(false);
    this.updateDogBar(dt);
    this.updateChatButton(dt);
    if (this.hud4) this.hud4.update(dt);
    this.updateBuildThumbs(dt);
    if (this.fps) this.fps.setText('FPS ' + Math.round(this.game.loop.actualFps) + '  objs ' + this.gs.children.length);
  }
}
