// harbor_runtime lab: the real HarborHost (pure model + Phaser view) on a stand-in piece of the world — the v4
// street / rail painter extended to k 98 the way patch P19 extends it, the harbour's own ground bake and Water region,
// the finished art (assets/harbor, assets/ships, assets/water, townfolk + the harbour presets), the real v4 Train
// view drawing the coast line, the real v4 DayClock (night tint, lamps, the coast train's lamp), the real v4 Effects.
// The game's scale rules (720-wide logical view, render scale k from the device pixel ratio, world zoom × k). The
// lab plays Game.js / UI.js through the Ports facade; run_lab.mjs drives it with a fixed-step clock (window.__LAB).

import { Assets } from '../../../src/core/Assets.js';
import { View, MAX_RENDER_SCALE } from '../../../src/core/View.js';
import { FONT } from '../../../src/data/strings.js';
import { DEPTH } from '../../../src/systems/DepthSort.js';
import { Effects } from '../../../src/systems/Effects.js';
import { DayClock } from '../../../src/systems/DayClock.js';
import { Train } from '../../../src/entities/Train.js';
import { mergeTownfolkManifests } from '../../townfolk2_compose.js';
import { townfolkPreload, townfolkInstall } from '../../townfolk_compose.js';
import * as layout from '../../../src/harbor/layout.js';
import { HarborHost } from '../../../src/harbor/host.js';
import { HarborView } from '../../../src/harbor/view/HarborView.js';
import { STEPS } from '../../../src/harbor/tuning.js';
import { dirOf } from '../../../src/harbor/view/art.js';
import { extendWorld, LabGround, scenery, LabDolls, LabChief } from './lab_world.js';

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

const LATE = ['town', 'roads'];
const HARBOR_SPRITES = null;     // every sprite of assets/harbor
const SPRITES = ['train_station', 'bench_x', 'streetlight_double', 'signpost', 'rail_x', 'rail_x_crossing', 'rail_x_end_n', 'rail_x_end_p',
  'tree_pine_a', 'tree_pine_snow', 'tree_pine_b', 'snow_pile_a', 'snow_pile_b', 'bush_snow', 'lamp_post', 'decal_snow_drift_a', 'decal_snow_drift_b',
  'item_can', 'item_plank', 'item_bread', 'item_fish_raw', 'item_fish_cooked', 'item_ingot', 'item_fish_big', 'item_axe'];
const CHARS = ['player', 'ferry', 'cargo_ship', 'trawler_big', 'tugboat', 'sailboat', 'yacht', 'seagull', 'boat_fishing', 'boat_rowboat', 'train_engine', 'train_car_a', 'train_car_b'];
const IMAGES = ['ground_snow', 'road_dirt', 'road_dirt_y', 'road_dirt_cross', 'road_cobble_wide', 'road_asphalt', 'sidewalk', 'water_waves_a', 'water_waves_b', 'water_foam', 'water_lut', 'water_shore_ramp'];
const SHEETS = ['fx_smoke_puff', 'fx_sparkle', 'fx_poof', 'fx_wake_v2', 'fx_wake_v2_ne', 'fx_wake_v2_e', 'fx_wake_v2_s', 'fx_wave_crash', 'fx_splash_small', 'fx_splash_big'];
const ATLASES = ['fx_particles', 'roads_decals', 'town_rails'];
/** textures the module brings (what integration adds) */
const MODULE_TEX = /^(harbor_|ship_|water_|fx_wake|fx_wave|fx_splash|hb_)/;

const LAB = window.__LAB = { ready: false, errors: [], events: [], sounds: [], toasts: [], banners: [], sites: [], music: [], trainEv: [], wanted: [], opened: [], lang: 'ko', T: 600 * 3 + 25 * 10, rank: 3, ms: [], msModel: [], zoom: 0.85, coins: 250000, bag: {}, t: 0 };
window.addEventListener('error', (e) => LAB.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => LAB.errors.push('rejection: ' + String(e.reason && e.reason.stack || e.reason)));

// ---------------------------------------------------------------------------------------------------- boot + load
let TFMAN = null;
class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    Assets.queueManifests(this.load);
    for (const f of LATE) this.load.json('manifest_' + f, 'assets/' + f + '/manifest.json');
    this.load.json('manifest_harbor', 'assets/harbor/manifest.json');
    this.load.json('manifest_ships', 'assets/ships/manifest.json');
    this.load.json('harbor_presets', 'assets/harbor/townfolk_presets.json');
    this.load.json('tf1', 'assets/townfolk/manifest.json');
    this.load.json('tf2', 'assets/townfolk2/manifest.json');
  }
  create() {
    Assets.mergeManifests(this.cache.json);
    for (const f of LATE) Assets.mergeLate(f, this.cache.json.get('manifest_' + f));
    // P3: the harbour and ships fragments (late)
    Assets.mergeLate('harbor', this.cache.json.get('manifest_harbor'));
    Assets.mergeLate('ships', this.cache.json.get('manifest_ships'));
    TFMAN = mergeTownfolkManifests(this.cache.json.get('tf1'), this.cache.json.get('tf2'));
    // P6: the harbour townsfolk presets join the generator's presets
    Object.assign(TFMAN.townfolk.generator.presets, this.cache.json.get('harbor_presets').presets);
    this.scene.start('Load');
  }
}

class Load extends Phaser.Scene {
  constructor() { super('Load'); }
  preload() {
    const m = Assets.m, L = this.load, atl = new Set(ATLASES), imgs = new Set();
    const hs = Object.keys(this.cache.json.get('manifest_harbor').sprites);
    for (const k of hs.concat(SPRITES)) { const d = m.sprites[k]; if (d && d.atlas) atl.add(d.atlas); else if (d && d.image) imgs.add(d.image); else if (m.images[k]) imgs.add(k); else LAB.errors.push('no sprite ' + k); }
    for (const c of CHARS) { const d = m.characters[c]; if (d && d.atlas) atl.add(d.atlas); else LAB.errors.push('no char ' + c); }
    for (const k of IMAGES) imgs.add(k);
    for (const k of ['ui_icon_coin', 'ui_icon_day', 'ui_icon_night']) { const d = m.sprites[k]; if (d && d.atlas) atl.add(d.atlas); }
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
    cam.setBackgroundColor('#2c6e92');
    cam.setZoom(LAB.zoom * View.k);
    // the game's camera stays inside the open world (Territory.camRect; v6 world 10752 × 4864, P19)
    cam.setBounds(0, 0, layout.WORLD_V6.width, layout.WORLD_V6.height);
    this.ui = this.scene.get('UI');
    this.effects = new Effects(this);
    this.rn = extendWorld(3);
    this.ground = new LabGround(this, this.rn);
    this.decor = scenery(this);
    this.dolls = new LabDolls(this, TFMAN);
    this.chief = new LabChief(this);
    { const [x, y] = layout.LR(72.5, -6.2); this.chief.set(x, y); }
    this.v4 = { nearTown: () => false, train: null };
    this.day = new DayClock(this, { T: LAB.T, on: true });
    this.focusAt = null;
    this.setup({ steps: 7 });
    LAB.scene = this; LAB.game = this.game; LAB.ui = this.ui; LAB.Assets = Assets; LAB.MODULE_TEX = MODULE_TEX; LAB.layout = layout; LAB.STEPS = STEPS; LAB.dirOf = dirOf;
    LAB.ready = true;
  }

  isOnScreen(x, y, m = 0) { const v = this.cameras.main.worldView; return x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m; }

  /**
   * (re)build the harbour for a scenario: { steps: n revived (0..7), open, trawlers, star, T, stock, unlocked, seed, lang }
   */
  setup(o = {}) {
    if (this.host) { this.host.destroy(); this.host = null; }
    if (this.coastTrain) { this.coastTrain.destroy(); this.coastTrain = null; this.v4.train = null; }
    if (o.T !== undefined) LAB.T = o.T;
    if (o.lang) LAB.lang = o.lang;
    const n = o.steps === undefined ? 7 : o.steps;
    const steps = STEPS.slice(0, n);
    const saved = {
      v: 1, open: n > 0 || o.open ? 1 : 0, steps,
      fleet: { trawlers: o.trawlers === undefined ? (n >= 7 ? 2 : 0) : o.trawlers, building: o.building || 0 },
      stars: { n: o.star || 1, ships: 0, exports: 0, tourists: 0 },
      imports: { unlocked: o.unlocked || [], stock: o.stock || {} },
      cs: o.cs || 0,
    };
    LAB.events.length = 0; LAB.toasts.length = 0; LAB.banners.length = 0; LAB.sounds.length = 0; LAB.sites.length = 0;
    this.ports = makePorts(this);
    this.host = new HarborHost(this.ports, saved, { View: HarborView, seed: o.seed || 20261010 });
    LAB.host = this.host;
    // the model's share of the tick (the rest of host.update is the view)
    { const mdl = this.host.model, up = mdl.update.bind(mdl); mdl.update = (dt, T, env) => { const a = performance.now(); up(dt, T, env); LAB.msModel.push(performance.now() - a); if (LAB.msModel.length > 6000) LAB.msModel.shift(); }; }
    LAB.ms.length = 0; LAB.msModel.length = 0;
    this.snapNight();
  }

  /** the DayClock tint at the clock's hour now (no 8 s fade after a jump) */
  snapNight() { const d = this.day; d.T = LAB.T; const tg = d.target(d.hour()); d.cur.a = tg.a; d.cur.r = (tg.color >> 16) & 255; d.cur.g = (tg.color >> 8) & 255; d.cur.b = tg.color & 255; }

  look(x, y, z) { if (z) { LAB.zoom = z; this.cameras.main.setZoom(z * View.k); } this.cameras.main.centerOn(x, y); this.focusAt = null; LAB.follow = null; }

  update(time, delta) {
    if (!LAB.ready || LAB.manual) return;
    this.tick(Math.min(0.05, delta / 1000));
  }

  tick(dt) {
    LAB.T += dt; LAB.t += dt;
    this.chief.update(dt, dirOf);
    const t0 = performance.now();
    this.host.update(dt);
    LAB.ms.push(performance.now() - t0);
    if (LAB.ms.length > 6000) LAB.ms.shift();
    if (this.coastTrain) this.coastTrain.update(dt);
    // camera: a module focus (the reveal), a followed ship, or the lab's look
    const cam = this.cameras.main;
    if (this.focusAt && LAB.t < this.focusAt.until) { const k = 1 - Math.exp(-dt * 2.4); cam.centerOn(cam.midPoint.x + (this.focusAt.x - cam.midPoint.x) * k, cam.midPoint.y + (this.focusAt.y - cam.midPoint.y) * k); }
    else if (LAB.follow) { const p = LAB.follow(); if (p) cam.centerOn(p.x, p.y); }
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
    clock: { T: () => LAB.T, hour: () => ((LAB.T / 25) % 24), day: () => Math.floor(LAB.T / 600), dark: () => W.day.cur.a, addLight: (x, y, k) => W.day.addLight(x, y, k), jump: (T) => { LAB.T = T; W.snapNight(); } },
    lang: () => LAB.lang,
    rank: () => LAB.rank,
    coins: {
      add: (n, x, y, fly, tag) => { LAB.coins += n; LAB.events.push({ t: 'lab:coins', n, tag }); if (fly && W.isOnScreen(x, y, 0)) W.effects.floatText(x, y, '+' + n.toLocaleString(), '#ffe27a', 30); },
      spend: (n) => { const q = Math.min(LAB.coins, n); LAB.coins -= q; return q; }, value: () => LAB.coins,
    },
    ui: { toast: (m) => { LAB.toasts.push(m); W.ui.toast(m); }, banner: (m, s) => { LAB.banners.push(m + ' / ' + (s || '')); W.ui.banner(m, s); } },
    sound: { play: (k) => LAB.sounds.push(k), at: (k) => LAB.sounds.push(k), music: (a) => LAB.music.push(a) },
    sites: { offer: (def) => LAB.sites.push(def) },
    world: { scene: W, open: (id) => LAB.opened.push(id) },
    chief: {
      x: () => W.chief.x, y: () => W.chief.y,
      count: (item) => LAB.bag[item] || 0,
      take: (item, n) => { const q = Math.min(n, LAB.bag[item] || 0); LAB.bag[item] = (LAB.bag[item] || 0) - q; return q; },
    },
    emit: (e) => LAB.events.push(e),
    // P14: the coast line joins the rails list -> the v4 Train view draws it; DayClock reads its lamp (gs.v4.train)
    rail: {
      add: (line) => { W.coastTrain = new Train(W, line); W.v4.train = W.coastTrain; return true; },
      blockedAhead: () => false,
      event: (ev, stop, line) => LAB.trainEv.push([ev, stop, line]),
    },
    ground: { bakeHook: (fn, rect) => W.ground.addBakeHook(fn, rect), removeHook: (h) => W.ground.removeBakeHook(h) },
    dolls: { make: (look) => W.dolls.make(look) },
    fx: {
      sheet: (k, x, y, o) => W.effects.sheet(k, x, y, o), loop: (k, x, y, s, d) => W.effects.loop(k, x, y, s, d),
      burst: (n, x, y, q) => W.effects.burst(n, x, y, q), floatText: (x, y, t, c, s) => W.effects.floatText(x, y, t, c, s),
    },
    view: { rect: () => cam().worldView, zoom: () => LAB.zoom, focus: (x, y, ms) => { W.focusAt = { x, y, until: LAB.t + ms / 1000 }; } },
    assets: { want: (keys) => { for (const k of keys) LAB.wanted.push(k); } },
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
    this.toastBox.add([this.toastG, this.toastText]);
    this.bannerBox = this.add.container(this.W / 2, this.H * 0.27).setVisible(false).setDepth(60);
    this.bannerG = this.add.graphics();
    this.bannerText = this.add.text(0, -22, '', TXT(44, '#ffffff', '#1f4f8f', 10)).setOrigin(0.5);
    this.bannerSub = this.add.text(0, 34, '', TXT(21, '#ffffff', '#1f4f8f', 6, '800')).setOrigin(0.5);
    this.bannerBox.add([this.bannerG, this.bannerText, this.bannerSub]);
    this.toastT = 0; this.bannerT = 0;
  }
  toast(m, hold = 2200) {
    this.toastText.setText(m);
    const w = Math.max(260, this.toastText.width + 60);
    this.toastG.clear(); this.toastG.fillStyle(0x2b2f3a, 0.86); this.toastG.fillRoundedRect(-w / 2, -32, w, 64, 30);
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
  backgroundColor: '#2c6e92',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false, roundPixels: false },
  disablePreFX: true,
  banner: false,
  fps: { target: 60 },
  scene: [Boot, Load, World, UI],
});
LAB.game = game;
LAB.View = View;
void DEPTH; void HARBOR_SPRITES;
