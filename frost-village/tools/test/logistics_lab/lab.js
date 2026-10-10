// logistics_runtime lab: the real LogisticsHost (pure model + Phaser view) on a stand-in piece of the new town — the
// v4 street painter with the new-town streets added the way patch P19 adds them, the finished art (assets/logistics,
// the freight truck of assets/vehicles, cityfolk + townfolk + townfolk2 dolls, fx_city icons, ui pads), the real v4
// Effects and DayClock (night tint). The game's scale rules (720-wide logical view, render scale k from the device
// pixel ratio, world zoom x k). A fake town (sim_env.js) plays the shops, homes, the freight yard and the porters;
// run_lab.mjs drives everything with a fixed-step clock (window.__LAB).

import { Assets } from '../../../src/core/Assets.js';
import { View, MAX_RENDER_SCALE } from '../../../src/core/View.js';
import { FONT } from '../../../src/data/strings.js';
import { Effects } from '../../../src/systems/Effects.js';
import { DayClock } from '../../../src/systems/DayClock.js';
import { mergeTownfolkFragments } from '../../cityfolk_compose.js';
import { townfolkPreload, townfolkInstall } from '../../townfolk_compose.js';
import * as layout from '../../../src/city/logistics/layout.js';
import { LogisticsHost } from '../../../src/city/logistics/host.js';
import { LgxView } from '../../../src/city/logistics/view/LgxView.js';
import { LGX_TUNING } from '../../../src/city/logistics/tuning.js';
import { dirOf } from '../../../src/city/logistics/view/art.js';
import { extendWorld, LabGround, scenery, LabDolls, LabChief } from './lab_world.js';
import { Sim, PRICES } from './sim_env.js';

// ---------------------------------------------------------------------------------------------------- view size (main.js)
const W0 = 720, MIN_H = 1280, MAX_H = 1600;
{
  const iw = window.innerWidth || W0, ih = window.innerHeight || MIN_H;
  const h = Math.max(MIN_H, Math.min(MAX_H, Math.round((W0 * ih) / Math.max(1, iw))));
  const cssW = Math.max(1, Math.min(iw, (ih * W0) / h));
  const dpr = window.devicePixelRatio || 1;
  View.W = W0; View.H = h;
  View.k = Math.round(Math.max(1, Math.min(MAX_RENDER_SCALE, (cssW * dpr) / W0)) * 20) / 20;
}

const LATE = ['town', 'roads', 'logistics', 'vehicles', 'fx_city'];
const SPRITES = ['tree_pine_a', 'tree_pine_snow', 'tree_pine_b', 'snow_pile_a', 'snow_pile_b', 'bush_snow', 'lamp_post', 'item_plank', 'item_ingot', 'item_coin',
  'ui_icon_coin', 'ui_arrow', 'ui_pad_cash', 'ui_icon_box', 'ui_icon_settle', 'rail_x', 'rail_x_crossing', 'rail_x_end_n', 'rail_x_end_p'];
const CHARS = ['player', 'forklift', 'forklift_loaded', 'delivery_van_red', 'delivery_van_blue', 'delivery_van_mint', 'truck_cargo'];
const IMAGES = ['ground_snow', 'road_dirt', 'road_dirt_y', 'road_dirt_cross', 'road_cobble_wide', 'road_asphalt', 'sidewalk'];
const SHEETS = ['fx_smoke_puff', 'fx_sparkle', 'fx_poof'];
const ATLASES = ['fx_particles', 'roads_decals', 'town_rails'];
/** textures the module brings (what integration adds) */
const MODULE_TEX = /^(lgx_|veh_truck_cargo|cf_|ui4_icons)/;

const LAB = window.__LAB = { ready: false, errors: [], events: [], sounds: [], amb: {}, toasts: [], banners: [], sites: [], wanted: [], lang: 'ko', T: 600 * 3 + 25 * 9, ms: [], msModel: [], zoom: 0.8, coins: 0, t: 0 };
window.addEventListener('error', (e) => LAB.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => LAB.errors.push('rejection: ' + String(e.reason && e.reason.stack || e.reason)));

// ---------------------------------------------------------------------------------------------------- boot + load
let TFMAN = null;
class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    Assets.queueManifests(this.load);
    for (const f of LATE) this.load.json('manifest_' + f, 'assets/' + f + '/manifest.json');
    this.load.json('tf1', 'assets/townfolk/manifest.json');
    this.load.json('tf2', 'assets/townfolk2/manifest.json');
    this.load.json('cf', 'assets/cityfolk/manifest.json');
  }
  create() {
    Assets.mergeManifests(this.cache.json);
    for (const f of LATE) Assets.mergeLate(f, this.cache.json.get('manifest_' + f));
    // P5: townfolk <- townfolk2 <- cityfolk through the generic merge (cityfolk_compose.mergeTownfolkFragments)
    TFMAN = mergeTownfolkFragments(this.cache.json.get('tf1'), this.cache.json.get('tf2'), this.cache.json.get('cf'));
    LAB.lgxMan = this.cache.json.get('manifest_logistics');
    this.scene.start('Load');
  }
}

class Load extends Phaser.Scene {
  constructor() { super('Load'); }
  preload() {
    const m = Assets.m, L = this.load, atl = new Set(ATLASES), imgs = new Set();
    for (const a of LAB.lgxMan.atlases) atl.add(a.key);
    atl.add('ui4_icons');
    for (const k of SPRITES) { const d = m.sprites[k]; if (d && d.atlas) atl.add(d.atlas); else if (d && d.image) imgs.add(d.image); else if (m.images[k]) imgs.add(k); else LAB.errors.push('no sprite ' + k); }
    for (const c of CHARS) { const d = m.characters[c]; if (d && d.atlas) atl.add(d.atlas); else LAB.errors.push('no char ' + c); }
    for (const k of IMAGES) imgs.add(k);
    for (const k of atl) { const a = m.atlases[k]; if (a) L.atlas(k, 'assets/' + a.png, 'assets/' + a.json); else LAB.errors.push('no atlas ' + k); }
    for (const k of imgs) { const a = m.images[k]; if (a) L.image(k, 'assets/' + a.png); else LAB.errors.push('no image ' + k); }
    for (const k of SHEETS) { const s = m.spritesheets[k]; if (s) L.spritesheet(k, 'assets/' + s.png, { frameWidth: s.frameWidth, frameHeight: s.frameHeight }); else LAB.errors.push('no sheet ' + k); }
    townfolkPreload(this, TFMAN, 'assets/');
    L.on('loaderror', (f) => LAB.errors.push('load: ' + f.key));
  }
  async create() {
    const g = this.game;
    Assets.game = g;
    townfolkInstall(this, TFMAN);
    for (const k in Assets.m.sprites) Assets.spriteAnims(g, k);
    for (const k of SHEETS) Assets.sheetAnims(g, k);
    for (const c of CHARS) Assets.buildCharacter(g, c);
    try { await document.fonts.load('900 20px Pretendard'); } catch (e) { /* system font */ }
    this.scene.start('UI');
    this.scene.start('World');
    this.scene.bringToTop('UI');
  }
}

// ---------------------------------------------------------------------------------------------------- the world
class World extends Phaser.Scene {
  constructor() { super('World'); }

  create() {
    const cam = this.cameras.main;
    cam.setBackgroundColor('#dfe8f2');
    cam.setZoom(LAB.zoom * View.k);
    cam.setBounds(1900, 2000, 3900, 2800);
    this.ui = this.scene.get('UI');
    this.effects = new Effects(this);
    this.rn = extendWorld();
    this.ground = new LabGround(this, this.rn);
    this.decor = scenery(this);
    this.dolls = new LabDolls(this, TFMAN);
    this.chief = new LabChief(this);
    { const D = layout.layoutFor(); const [x, y] = layout.L(D.W + 6.0, D.F - 1.4); this.chief.set(x, y); }
    this.day = new DayClock(this, { T: LAB.T, on: true });
    this.focusAt = null;
    this.setup({});
    LAB.scene = this; LAB.game = this.game; LAB.ui = this.ui; LAB.Assets = Assets; LAB.MODULE_TEX = MODULE_TEX; LAB.layout = layout; LAB.dirOf = dirOf; LAB.TUNE = LGX_TUNING;
    LAB.ready = true;
  }

  isOnScreen(x, y, m = 0) { const v = this.cameras.main.worldView; return x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m; }

  /**
   * (re)build the centre for a scenario: { open (default true), T, fill: 0..1 (racks), producers, reveal, seed, lang,
   *   yardEvery, items: { item: n } (extra stock), warm: s of headless model time before the first frame }
   */
  setup(o = {}) {
    if (this.host) { this.host.destroy(); this.host = null; }
    if (o.T !== undefined) LAB.T = o.T;
    if (o.lang) LAB.lang = o.lang;
    LAB.events.length = 0; LAB.toasts.length = 0; LAB.banners.length = 0; LAB.sounds.length = 0; LAB.sites.length = 0;
    this.sim = new Sim({ seed: o.seed || 7, lang: LAB.lang, yardEvery: o.yardEvery || 40, yardFirst: o.yardFirst, fullShelves: o.fullShelves });
    this.ports = makePorts(this);
    const open = o.open !== false;
    const saved = open ? { v: 1, open: 1, gift: 1, tut: o.tut ? 1 : 0, day: Math.floor(LAB.T / 600), stock: {}, orders: [], cash: o.cash || 0 } : null;
    if (saved) {
      const f = o.fill === undefined ? 0.5 : o.fill;
      const caps = LGX_TUNING.cap;
      const mix = { materials: ['plank', 'ingot', 'log', 'ore'], food: ['bread', 'fish_cooked', 'meat_cooked'], goods: ['can', 'cloth', 'sugar'], tools: ['axe', 'pickaxe', 'rod'], furniture: ['sofa', 'bed', 'table', 'chair', 'wardrobe'], appliances: ['fridge', 'stove_iron', 'tv_retro', 'radio', 'washer'] };
      for (const [c, list] of Object.entries(mix)) { const n = Math.round(caps[c] * f); list.forEach((k, i) => { const q = Math.floor(n / list.length) + (i < n % list.length ? 1 : 0); if (q > 0) saved.stock[k] = (saved.stock[k] || 0) + q; }); }
      for (const [k, n] of Object.entries(o.items || {})) saved.stock[k.replace(/^item_/, '')] = n;
    }
    this.host = new LogisticsHost(this.ports, saved, { View: LgxView, man: LAB.lgxMan, seed: o.seed || 20261010, price: (k) => LGX_TUNING.prices[k] || PRICES[k] || 5 });
    LAB.host = this.host;
    if (o.producers !== false) {
      for (const [kind, s] of Object.entries(layout.PRODUCER_SPOTS)) this.host.api.addProducer(kind, 'p_' + kind, s.x, s.y);
      for (const p of this.host.model.producers.values()) p.feed(o.feed === undefined ? 12 : o.feed);
    }
    // the model's share of the tick (the rest of host.update is the view)
    { const mdl = this.host.model, up = mdl.update.bind(mdl); mdl.update = (dt, T, env) => { const a = performance.now(); up(dt, T, env); LAB.msModel.push(performance.now() - a); if (LAB.msModel.length > 6000) LAB.msModel.shift(); }; }
    LAB.ms.length = 0; LAB.msModel.length = 0;
    if (o.reveal) this.host.api.reveal(true);
    if (o.warm) this.warm(o.warm);
    this.snapNight();
  }
  /** model-only time (no drawing): owners, vans and the forklift get going */
  warm(sec) {
    const dt = 1 / 30, n = Math.round(sec / dt), H = this.host;
    for (let i = 0; i < n; i++) { LAB.T += dt; this.sim.tick(dt, H.api); H.model.update(dt, LAB.T, H.env); for (const ev of H.model.drain()) H.onModel(ev); H.model.drainView(); H.envT -= dt; if (H.envT <= 0) { H.envT = 1; H.env = { shops: this.sim.shopsList(), homes: this.sim.homesList() }; } }
  }

  /** the DayClock tint at the clock's hour now (no fade after a jump) */
  snapNight() { const d = this.day; d.T = LAB.T; const tg = d.target(d.hour()); d.cur.a = tg.a; d.cur.r = (tg.color >> 16) & 255; d.cur.g = (tg.color >> 8) & 255; d.cur.b = tg.color & 255; }

  look(x, y, z) { if (z) { LAB.zoom = z; this.cameras.main.setZoom(z * View.k); } this.cameras.main.centerOn(x, y); this.focusAt = null; }

  update(time, delta) {
    if (!LAB.ready || LAB.manual) return;
    this.tick(Math.min(0.05, delta / 1000));
  }

  tick(dt) {
    LAB.T += dt; LAB.t += dt;
    this.chief.update(dt, dirOf);
    this.sim.tick(dt, this.host.api);
    const t0 = performance.now();
    this.host.update(dt);
    LAB.ms.push(performance.now() - t0);
    if (LAB.ms.length > 6000) LAB.ms.shift();
    for (const r of this.dolls.live) { /* rigs are updated by the view */ void r; }
    const cam = this.cameras.main;
    if (this.focusAt && LAB.t < this.focusAt.until) { const k = 1 - Math.exp(-dt * 2.4); cam.centerOn(cam.midPoint.x + (this.focusAt.x - cam.midPoint.x) * k, cam.midPoint.y + (this.focusAt.y - cam.midPoint.y) * k); }
    cam.preRender();
    this.ground.update(1);
    this.day.T = LAB.T - dt;
    this.day.update(dt);
    this.ui.tick(dt);
  }
}

function makePorts(W) {
  const cam = () => W.cameras.main;
  return {
    clock: { T: () => LAB.T, hour: () => ((LAB.T / 25) % 24), day: () => Math.floor(LAB.T / 600), dark: () => W.day.cur.a, addLight: (x, y, k) => W.day.addLight(x, y, k) },
    lang: () => LAB.lang,
    coins: { add: (n, x, y, fly, tag) => { LAB.coins += n; LAB.events.push({ t: 'lab:coins', n, tag }); if (fly && W.isOnScreen(x, y, 0)) W.effects.floatText(x, y, '+' + n.toLocaleString(), '#ffe27a', 30); } },
    ui: { toast: (m, hold) => { LAB.toasts.push(m); W.ui.toast(m, hold); }, banner: (m, s) => { LAB.banners.push(m + ' / ' + (s || '')); W.ui.banner(m, s); } },
    sound: { play: (k) => LAB.sounds.push(k), at: (k) => LAB.sounds.push(k), ambience: (k, v) => { LAB.amb[k] = v; } },
    sites: { offer: (def) => LAB.sites.push(def) },
    world: { scene: W },
    chief: { x: () => W.chief.x, y: () => W.chief.y },
    emit: (e) => LAB.events.push(e),
    dolls: { make: (look) => W.dolls.make(look) },
    fx: {
      sheet: (k, x, y, o) => W.effects.sheet(k, x, y, o), burst: (n, x, y, q) => W.effects.burst(n, x, y, q),
      floatText: (x, y, t, c, s) => W.effects.floatText(x, y, t, c, s),
    },
    view: { rect: () => cam().worldView, zoom: () => LAB.zoom, focus: (x, y, ms) => { W.focusAt = { x, y, until: LAB.t + ms / 1000 }; }, onScreen: (x, y, m) => W.isOnScreen(x, y, m) },
    assets: { want: (keys) => { for (const k of keys) if (LAB.wanted.indexOf(k) < 0) LAB.wanted.push(k); }, manifest: (n) => (n === 'logistics' ? LAB.lgxMan : null) },
    shops: { list: () => W.sim.shopsList(), deliver: (id, items) => W.sim.deliver(id, items) },
    homes: { list: () => W.sim.homesList() },
  };
}

// ---------------------------------------------------------------------------------------------------- the HUD stand-in
const TXT = (size, color = '#ffffff', stroke = '#2b2f3a', st = 7, weight = '900') => ({ fontFamily: FONT, fontSize: size + 'px', fontStyle: weight, color, stroke, strokeThickness: st, resolution: 2 });

class UI extends Phaser.Scene {
  constructor() { super('UI'); }
  create() {
    View.applyUI(this.cameras.main);
    this.W = View.W; this.H = View.H;
    const top = 62;
    this.g = this.add.graphics();
    this.coinIcon = Assets.has('ui_icon_coin') ? Assets.image(this, 62, top, 'ui_icon_coin') : null;
    if (this.coinIcon) this.coinIcon.setScale(56 / this.coinIcon.frame.realWidth);
    this.coinT = this.add.text(100, top + 2, '', TXT(38)).setOrigin(0, 0.5);
    this.clockT = this.add.text(this.W - 40, top + 2, '', TXT(30)).setOrigin(1, 0.5);
    this.toastBox = this.add.container(this.W / 2, this.H - 230).setVisible(false).setDepth(50);
    this.toastG = this.add.graphics();
    this.toastText = this.add.text(0, 0, '', TXT(25, '#ffffff', '#2b2f3a', 0, '800')).setOrigin(0.5);
    this.toastText.setWordWrapWidth(600, true);
    this.toastBox.add([this.toastG, this.toastText]);
    this.bannerBox = this.add.container(this.W / 2, this.H * 0.27).setVisible(false).setDepth(60);
    this.bannerG = this.add.graphics();
    this.bannerText = this.add.text(0, -22, '', TXT(40, '#ffffff', '#1f4f8f', 10)).setOrigin(0.5);
    this.bannerSub = this.add.text(0, 34, '', TXT(21, '#ffffff', '#1f4f8f', 6, '800')).setOrigin(0.5);
    this.bannerBox.add([this.bannerG, this.bannerText, this.bannerSub]);
    this.toastT = 0; this.bannerT = 0;
  }
  toast(m, hold = 2200) {
    this.toastText.setText(m);
    const w = Math.max(260, Math.min(660, this.toastText.width + 60)), h = Math.max(64, this.toastText.height + 28);
    this.toastG.clear(); this.toastG.fillStyle(0x2b2f3a, 0.86); this.toastG.fillRoundedRect(-w / 2, -h / 2, w, h, 30);
    this.toastBox.setVisible(true).setAlpha(1); this.toastT = hold / 1000;
  }
  banner(m, s) {
    this.bannerText.setText(m); this.bannerSub.setText(s || '');
    const w = Math.max(480, this.bannerText.width + 80, this.bannerSub.width + 60), h = s ? 150 : 110;
    this.bannerG.clear(); this.bannerG.fillStyle(0x1f4f8f, 0.25); this.bannerG.fillRoundedRect(-w / 2 + 4, -h / 2 + 8, w, h, 34);
    this.bannerG.fillStyle(0x3d86d6, 1); this.bannerG.fillRoundedRect(-w / 2, -h / 2, w, h, 34);
    this.bannerG.lineStyle(6, 0xffffff, 0.9); this.bannerG.strokeRoundedRect(-w / 2, -h / 2, w, h, 34);
    this.bannerBox.setVisible(true).setAlpha(1).setScale(0.6);
    this.tweens.add({ targets: this.bannerBox, scale: 1, duration: 360, ease: 'Back.easeOut' });
    this.bannerT = 3.4;
  }
  tick(dt) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastBox.setVisible(false); }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.bannerBox.setVisible(false); }
    const top = 62, g = this.g;
    g.clear();
    g.fillStyle(0x1f3354, 0.35); g.fillRoundedRect(24, top - 34, 260, 68, 34);
    g.fillStyle(0x1f3354, 0.35); g.fillRoundedRect(this.W - 150, top - 30, 126, 60, 30);
    this.coinT.setText(Math.round(LAB.coins).toLocaleString());
    const h = (LAB.T / 25) % 24;
    this.clockT.setText(String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0'));
  }
}

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: Math.round(View.W * View.k),
  height: Math.round(View.H * View.k),
  backgroundColor: '#dfe8f2',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false, roundPixels: false },
  disablePreFX: true,
  banner: false,
  fps: { target: 60 },
  scene: [Boot, Load, World, UI],
});
LAB.game = game;
LAB.View = View;
