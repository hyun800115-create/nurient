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

    this.layout();
    this.scale.on('resize', this.onResize, this);
    this.events.once('shutdown', () => { this.ready = false; this.panelOpen = false; this.scale.off('resize', this.onResize, this); });

    // ---- input (joystick anywhere that is not a button; a second finger turns it into a pinch zoom)
    this.input.on('pointerdown', (p, over) => {
      Audio.resume();    // iOS: bring sound back after a call / app switch (needs a user gesture)
      if (this.panelOpen || this.buildOpen || (over && over.length)) return;
      this.taps[p.id] = { x: p.x, y: p.y, t: this.time.now };
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
    this.objPanel.setPosition(W / 2, top + 88);
    this.toastBox.setPosition(W / 2, H - 230 - View.safeBottom);
    this.bannerBox.setPosition(W / 2, H * 0.27);
    if (this.fps) this.fps.setPosition(12, H - 34);
    if (this.panel) this.layoutPanel();
    if (this.buildOpen) this.closeBuildMenu(true);
  }

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

  // ---------------------------------------------------------------- coins
  setCoins(v, delayMs) {
    this.targetCoins = v;
    if (delayMs) this.coinDelay = Math.max(this.coinDelay, delayMs / 1000);
    if (v < this.displayCoins) this.displayCoins = v;
  }

  worldToScreen(wx, wy) {
    const cam = this.gs.cameras.main;
    const v = cam.worldView;
    return { x: ((wx - v.x) * cam.zoom) / View.k, y: ((wy - v.y) * cam.zoom) / View.k };
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
  toast(msg) {
    this.toastText.setText(msg);
    this.toastBg.setSize(Math.max(260, this.toastText.width + 70), 64);
    const b = this.toastBox;
    this.tweens.killTweensOf(b);
    b.setVisible(true).setAlpha(1).setScale(0.7);
    this.tweens.add({ targets: b, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, delay: 1500, duration: 350, onComplete: () => b.setVisible(false) });
  }

  banner(msg, sub) {
    const b = this.bannerBox;
    this.bannerText.setText(msg);
    this.bannerSub.setText(sub || '');
    this.bannerBg.setSize(Math.max(360, this.bannerText.width + 90), 104);
    const g = this.bannerSubBg;
    g.clear();
    if (sub) {
      const w = this.bannerSub.width + 44, h = 50;
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
  /** the chief stands on an empty plot: pick a building (cards: picture, name, cost, what it does) */
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
    const cols = Math.min(4, Math.max(2, choices.length));
    const cw = cols === 4 ? 160 : 200, chh = 262, gap = 10;
    const rows = Math.ceil(choices.length / cols);
    const sheetW = Math.min(W - 24, cols * cw + (cols - 1) * gap + 40);
    const sheetH = 130 + rows * chh + (rows - 1) * gap + 130;
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
    this.buildCards = [];
    const gx0 = W / 2 - ((cols * cw + (cols - 1) * gap) / 2) + cw / 2;
    choices.forEach((ch, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = gx0 + col * (cw + gap), y = top + 120 + chh / 2 + row * (chh + gap);
      const card = this.makeCard(ch, x, y, cw, chh);
      c.add(card.c);
      this.buildCards.push(card);
    });
    // confirm button
    const btn = this.makeButton(W / 2, top + sheetH - 72, Math.min(sheetW - 60, 460), 92, 'green', '', () => this.confirmBuild(), 30);
    c.add(btn);
    this.buildBtn = btn;
    this.buildPanel = c;
    const firstOk = choices.find((q) => !q.locked);
    this.selectCard(firstOk ? firstOk.key : null);
    c.setAlpha(0);
    this.tweens.add({ targets: c, alpha: 1, duration: 150 });
    bg.setScale(0.9);
    this.tweens.add({ targets: bg, scale: 1, duration: 220, ease: 'Back.easeOut' });
    Audio.play('sfx_click');
    if (window.__FV) window.__FV.buildMenuOpen = true;
  }

  makeCard(ch, x, y, w, h) {
    const c = this.add.container(x, y);
    const bg = panel(this, 0, 0, 'ui_card', w, h).setOrigin(0.5);
    const bgSel = panel(this, 0, 0, Assets.pick('ui_card_selected', 'ui_card'), w, h).setOrigin(0.5).setVisible(false);
    c.add([bg, bgSel]);
    const spr = { toolsmith: 'station_toolsmith', cannery: 'station_cannery', store: 'shop_general', warehouse: 'warehouse', boathouse: 'boathouse', watchtower: 'watchtower' }[ch.key] || ch.key;
    const th = Assets.image(this, 0, -h / 2 + 64, spr).setOrigin(0.5, 0.5);
    const fw = Math.max(1, th.frame.realWidth), fh = Math.max(1, th.frame.realHeight);
    th.setScale(Math.min((w - 24) / fw, 104 / fh));
    c.add(th);
    const name = this.add.text(0, -h / 2 + 132, t('b_' + ch.key), TXT(w < 180 ? 21 : 23, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0.5);
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
    const line = ch.locked ? t(ch.reason) : t('bp_' + ch.key, { n: people });
    const desc = this.add.text(0, h / 2 - 40, line, Object.assign(TXT(15, ch.locked ? '#a5532a' : '#5d6b80', '#ffffff', 0, '800'), { align: 'center', wordWrap: { width: w - 26, useAdvancedWrap: true }, lineSpacing: 1 })).setOrigin(0.5);
    c.add(desc);
    if (ch.locked) {
      for (const o of [th, name, coin, coinT]) o.setAlpha(0.45);
      for (const [ic, tx] of mparts) { ic.setAlpha(0.45); tx.setAlpha(0.45); }
      const lk = Assets.image(this, w / 2 - 26, -h / 2 + 26, 'ui_icon_lock').setOrigin(0.5);
      lk.setScale(34 / Math.max(1, lk.frame.realWidth));
      c.add(lk);
    }
    c.setSize(w, h);
    c.setInteractive({ useHandCursor: !ch.locked });
    c.on('pointerdown', () => { if (ch.locked) { this.tweens.add({ targets: c, x: c.x + 6, duration: 50, yoyo: true, repeat: 2 }); Audio.play('sfx_error', { volume: 0.4 }); return; } Audio.play('sfx_click'); this.selectCard(ch.key); });
    return { c, bg, bgSel, ch };
  }

  selectCard(key) {
    this.buildSel = key;
    for (const cd of this.buildCards || []) {
      const on = cd.ch.key === key;
      cd.bg.setVisible(!on); cd.bgSel.setVisible(on);
      if (on) { this.tweens.killTweensOf(cd.c); cd.c.setScale(1.06); this.tweens.add({ targets: cd.c, scale: 1, duration: 200, ease: 'Back.easeOut' }); }
    }
    const ch = (this.buildChoicesList || []).find((q) => q.key === key);
    const b = this.buildBtn;
    if (!b) return;
    if (!ch) { b.text.setText(t('buildPick')); b.setAlpha(0.6); b.ok = false; return; }
    const cost = buildCost(ch.key).coins || 0;
    const ok = this.gs.economy.coins >= cost;
    b.text.setText(ok ? t('buildBtn', { name: t('b_' + ch.key) }) + '  ' + fmt(cost) : t('buildNoCoins') + ' (' + fmt(cost) + ')');
    b.setAlpha(ok ? 1 : 0.6);
    b.ok = ok;
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
    this.buildPanel = null; this.buildCards = null; this.buildBtn = null;
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
    const bg = panel(this, W / 2, H / 2, 'ui_panel', 560, 640).setOrigin(0.5);
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
      add(this.add.text(cx, cy - 262, t('settings'), TXT(44, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0.5));
      const row = (y, label, value, style, cb, icon) => {
        if (icon) { const ic = add(Assets.image(this, cx - 200, y, icon).setOrigin(0.5)); ic.setScale(54 / Math.max(ic.frame.realWidth, 1)); }
        add(this.add.text(cx - 160, y, label, TXT(32, '#2b2f3a', '#ffffff', 0, '800')).setOrigin(0, 0.5));
        add(this.makeButton(cx + 130, y, 200, 76, style, value, cb, 28));
      };
      const S = Settings.data;
      row(cy - 150, t('sound'), S.sound ? t('on') : t('off'), S.sound ? 'green' : 'gray', () => { Audio.setSoundEnabled(!S.sound); this.buildPanelContent(false); }, S.sound ? 'ui_icon_sound_on' : 'ui_icon_sound_off');
      row(cy - 50, t('music'), S.music ? t('on') : t('off'), S.music ? 'green' : 'gray', () => { Audio.setMusicEnabled(!S.music); this.buildPanelContent(false); }, S.music ? 'ui_icon_music_on' : 'ui_icon_music_off');
      // globe icon for the language row (drawn, there is no icon sprite for it)
      const gl = add(this.add.graphics());
      gl.fillStyle(0x3d8be0, 1); gl.fillCircle(cx - 200, cy + 50, 25);
      gl.lineStyle(3, 0xffffff, 0.95); gl.strokeCircle(cx - 200, cy + 50, 25);
      gl.strokeEllipse(cx - 200, cy + 50, 22, 50); gl.lineBetween(cx - 225, cy + 50, cx - 175, cy + 50);
      gl.lineBetween(cx - 221, cy + 37, cx - 179, cy + 37); gl.lineBetween(cx - 221, cy + 63, cx - 179, cy + 63);
      row(cy + 50, t('language'), t('langName'), 'blue', () => {
        const l = getLang() === 'ko' ? 'en' : 'ko';
        setLang(l); Settings.data.lang = l; Settings.save();
        this.onLanguage();
        this.buildPanelContent(false);
      });
      add(this.makeButton(cx - 130, cy + 170, 240, 80, 'gray', t('reset'), () => this.buildPanelContent(true), 26));
      add(this.makeButton(cx + 130, cy + 170, 240, 80, 'green', t('reload'), () => this.reloadGame(), 26));
      add(this.add.text(cx, cy - 214, VERSION + ' · ' + BUILD_DATE, TXT(22, '#6b7686', '#ffffff', 0, '700')).setOrigin(0.5));
      add(this.makeButton(cx, cy + 262, 260, 80, 'blue', t('close'), () => this.closeSettings(), 30));
    } else {
      add(this.add.text(cx, cy - 120, t('resetConfirm'), Object.assign(TXT(32, '#2b2f3a', '#ffffff', 0, '800'), { align: 'center', lineSpacing: 10 })).setOrigin(0.5));
      add(this.makeButton(cx, cy + 60, 360, 84, 'gray', t('yes'), () => { this.closeSettings(true); this.gs.resetProgress(); }, 30));
      add(this.makeButton(cx, cy + 160, 360, 84, 'green', t('no'), () => this.buildPanelContent(false), 30));
    }
    const close = add(this.makeIconButton(cx + 250, cy - 290, 'ui_icon_close', 70, () => this.closeSettings()));
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
    if (this.fps) this.fps.setText('FPS ' + Math.round(this.game.loop.actualFps) + '  objs ' + this.gs.children.length);
  }
}
