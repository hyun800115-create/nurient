// beach_runtime lab: the real BeachHost (model + view) on a stand-in piece of the v7 world — the beach district south of
// the harbour (sand and wet band baked through the module's bake hook into ground tiles, 바닷가 큰길, the lighthouse on
// its rocky point for context), the warm sea and the hotel pool as live Water.js regions, people as the real
// beachfolk paper dolls (townfolk + townfolk2 + beachfolk merged by tools/beachfolk_compose.js), the game's DayClock
// for dusk and night, the finished art as it is. Scale rules of the game (720-wide logical UI, render scale k from
// the device pixel ratio, world zoom × k). run_lab.mjs drives it with a fixed-step clock through window.__LAB.

import { Assets } from '../../../src/core/Assets.js';
import { View, MAX_RENDER_SCALE } from '../../../src/core/View.js';
import { FONT } from '../../../src/data/strings.js';
import { DEPTH } from '../../../src/systems/DepthSort.js';
import { DayClock } from '../../../src/systems/DayClock.js';
import { Water } from '../../../src/systems/Water.js';
import { shoreY } from '../../../src/data/world.js';
import { mergeBeachfolkManifests, Beachfolk } from '../../beachfolk_compose.js';
import { townfolkPreload, townfolkInstall } from '../../townfolk_compose.js';
import { BeachHost } from '../../../src/beach/host.js';
import { BeachView } from '../../../src/beach/view/BeachView.js';
import { looksFrom } from '../../../src/beach/looks.js';
import * as layout from '../../../src/beach/layout.js';
import { LabDolls } from './lab_dolls.js';
import { LabGround } from './lab_ground.js';
import { stream } from '../../../src/beach/model/rng.js';

// ---------------------------------------------------------------------------------------------------- view size (main.js)
const W = 720, MIN_H = 1280, MAX_H = 1600;
{
  const iw = window.innerWidth || W, ih = window.innerHeight || MIN_H;
  const h = Math.max(MIN_H, Math.min(MAX_H, Math.round((W * ih) / Math.max(1, iw))));
  const cssW = Math.max(1, Math.min(iw, (ih * W) / h));
  const dpr = window.devicePixelRatio || 1;
  View.W = W; View.H = h;
  View.k = Math.round(Math.max(1, Math.min(MAX_RENDER_SCALE, (cssW * dpr) / W)) * 20) / 20;
}

const LATE = ['beach', 'beach_bld', 'audio5', 'ships', 'harbor'];
const BEACH_ATLASES = ['beach_ground_decals', 'beach_nature', 'beach_play', 'beach_service', 'beach_shade', 'beach_tiles', 'beach_water', 'beach_crab', 'beach_swan_pedal_boat', 'beach_kayak_crew', 'beach_banana_boat_crew',
  'bbld_hotel', 'bbld_shops', 'bbld_civic', 'bbld_street'];
const ATLASES = BEACH_ATLASES.concat(['ship_yacht', 'harbor_landmarks_2', 'fx_particles', 'emotes', 'ui_icons', 'ui2_icons', 'props_nature', 'props_decor', 'char_player']);
const IMAGES = ['ground_snow', 'ground_sand', 'ground_sand_wet', 'water_waves_a', 'water_waves_b', 'water_foam', 'water_lut', 'water_shore_ramp', 'ui_panel', 'ui_button_blue', 'ui_coin_bar', 'fog_puff', 'fog_bank'];
const SHEETS = ['fx_swim_ripple', 'fx_splash_small', 'fx_splash_big', 'fx_wake_v2', 'fx_wake_v2_s', 'fx_wake_v2_e', 'fx_wake_v2_ne', 'fx_wake_v2_n', 'fx_sparkle_water', 'fx_wave_crash'];
/** textures the module brings (what integration adds; townfolk pages are counted separately) */
const MODULE_TEX = /^(beach_|bbld_|ground_sand|ship_yacht$|fx_swim|fx_splash|fx_wake|fx_sparkle_water|bch_)/;

const LAB = window.__LAB = { ready: false, errors: [], events: [], sounds: [], toasts: [], banners: [], reports: [], coins: 0, lang: 'ko', T: 600 * 2 + 25 * 11, zoom: 1, ms: [], msModel: [], stick: { x: 0, y: 0 }, lateLoads: [] };
window.addEventListener('error', (e) => LAB.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => LAB.errors.push('rejection: ' + String(e.reason && e.reason.stack || e.reason)));
const hourOf = (T) => ((T % 600) + 600) % 600 / 25;

// ---------------------------------------------------------------------------------------------------- boot + load
let MAN = null, WATER_MAN = null;
class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    Assets.queueManifests(this.load);
    for (const f of LATE) this.load.json('manifest_' + f, 'assets/' + f + '/manifest.json');
    this.load.json('tf1', 'assets/townfolk/manifest.json');
    this.load.json('tf2', 'assets/townfolk2/manifest.json');
    this.load.json('bf', 'assets/beachfolk/manifest.json');
  }
  create() {
    Assets.mergeManifests(this.cache.json);
    for (const f of LATE) Assets.mergeLate(f, this.cache.json.get('manifest_' + f));
    MAN = mergeBeachfolkManifests(this.cache.json.get('tf1'), this.cache.json.get('tf2'), this.cache.json.get('bf'));
    WATER_MAN = this.cache.json.get('manifest_water');
    this.scene.start('Load');
  }
}

class Load extends Phaser.Scene {
  constructor() { super('Load'); }
  preload() {
    const m = Assets.m, L = this.load;
    for (const k of ATLASES) { const a = m.atlases[k]; if (a) L.atlas(k, 'assets/' + a.png, 'assets/' + a.json); else LAB.errors.push('no atlas ' + k); }
    for (const k of IMAGES) { const a = m.images[k]; if (a) L.image(k, 'assets/' + a.png); else LAB.errors.push('no image ' + k); }
    for (const k of SHEETS) { const s = m.spritesheets[k]; if (s) L.spritesheet(k, 'assets/' + s.png, { frameWidth: s.frameWidth, frameHeight: s.frameHeight }); else LAB.errors.push('no sheet ' + k); }
    L.image('lab_cobble', 'assets/roads/road_cobble_wide.png');      // the stand-in 해변대로 (blvd_b) surface
    townfolkPreload(this, MAN, 'assets/');
    L.on('loaderror', (f) => LAB.errors.push('load: ' + f.key));
  }
  async create() {
    const g = this.game;
    Assets.game = g;
    townfolkInstall(this, MAN);
    for (const k in Assets.m.sprites) Assets.spriteAnims(g, k);
    for (const k of SHEETS) Assets.sheetAnims(g, k);
    Assets.buildCharacter(g, 'player');
    try { await document.fonts.load('900 20px Pretendard'); } catch (e) { /* system font */ }
    this.scene.start('UI');
    this.scene.start('World');
    this.scene.bringToTop('UI');
  }
}

// ---------------------------------------------------------------------------------------------------- the world
const STREET = (() => {
  const s = layout.STREETS[0], P = (i, j) => layout.L(i, j);
  const poly = [...P(s.i[0] - 30, s.j[0]), ...P(s.i[1], s.j[0]), ...P(s.i[1], s.j[1]), ...P(s.i[0] - 30, s.j[1])];
  const path = layout.PATH, pp = [...P(path.i[0], path.j[0]), ...P(path.i[1], path.j[0]), ...P(path.i[1], path.j[1]), ...P(path.i[0], path.j[1])];
  return [{ poly, key: 'lab_cobble', edge: '#a99f90' }, { poly: pp, color: '#e8d6ae' }];
})();

/** the land of the lab's world: north of the warm south sea (layout.waterJ) and south of the village's north sea */
const LAND = (() => {
  const south = [];
  for (let i = 40; i <= 140; i += 0.25) south.push(...layout.L(i, layout.waterJ(i)));
  south.push(...layout.L(140, 40), ...layout.L(40, 40));
  const north = [];
  for (let x = 600; x <= 2000; x += 8) north.push(x, shoreY(x));
  north.push(2000, 1600, 600, 1600);
  return [south.map(Math.round), north.map(Math.round)];
})();

class World extends Phaser.Scene {
  constructor() { super('World'); }
  create() {
    const cam = this.cameras.main;
    cam.setBackgroundColor('#2f8fb0');
    cam.setZoom(LAB.zoom * View.k);
    cam.setBounds(0, 0, 11264, 5888);      // the v7 world (plan §4.1: WORLD.width 11264, height 5888), like Game's camera
    this.ui = this.scene.get('UI');
    this.ground = new LabGround(this, { streets: STREET, max: 48, land: LAND });
    this.bf = new Beachfolk(MAN.townfolk);
    this.dolls = new LabDolls(this, this.bf);
    this.clock = new DayClock(this, { on: true, T: LAB.T });
    this.decor = [];
    this.focus = null;
    this.waters = [];
    // the chief (the player's character)
    this.chief = this.add.sprite(0, 0, 'char_player').setOrigin(0.5, 0.8125);
    this.chiefPos = { x: 0, y: 0 }; this.chiefDir = 'SW'; this.chiefMove = null;
    this.contextProps();
    LAB.scene = this; LAB.game = this.game; LAB.ui = this.ui; LAB.Assets = Assets; LAB.MODULE_TEX = MODULE_TEX; LAB.layout = layout; LAB.dolls = this.dolls; LAB.stream = stream;
    this.setup({});
    LAB.ready = true;
  }

  /** the harbour's lighthouse on its rocky point, a few snowy pines and the rail ballast north (context only) */
  contextProps() {
    const put = (k, i, j, s = 1, flip = false) => { const [x, y] = layout.LR(i, j); if (!Assets.has(k)) return null; const im = Assets.image(this, x, y, k).setDepth(y).setScale(s); if (flip) im.setFlipX(true); this.decor.push(im); return im; };
    put('lighthouse', 88.40, -11.40);
    const pines = [[84.0, -9.0], [85.2, -13.2], [83.4, -11.6], [86.6, -1.6], [84.4, -3.4], [87.0, 3.4], [91.0, 4.0], [98.0, 4.2], [105.0, 3.6], [112.0, 3.8], [119.0, 3.2], [124.6, -2.0]];
    pines.forEach(([i, j], k) => put(k % 2 ? 'tree_pine_snow' : 'tree_pine_a', i, j, 0.95, k % 3 === 0));
    // a far snowy village coast for the polar swim (x ≈ 1290): pines, snow drifts
    for (const [x, y, k] of [[1120, shoreY(1120) + 230, 'tree_pine_snow'], [1500, shoreY(1500) + 250, 'tree_pine_a'], [1440, shoreY(1440) + 180, 'snow_pile_a'], [1150, shoreY(1150) + 150, 'snow_pile_b'], [1600, shoreY(1600) + 200, 'tree_pine_snow']]) if (Assets.has(k)) this.decor.push(Assets.image(this, x, y, k).setDepth(y));
  }

  /** a Water.js region (the port): the warm sea, the pool, the village sea */
  water(opts) {
    const w = new Water(this, Object.assign({ manifest: WATER_MAN, quality: LAB.quality || 'high' }, opts));
    this.waters.push(w);
    return w;
  }
  villageSea() {
    if (this.vsea) return this.vsea;
    this.vsea = this.water({ region: { x: 860, y: 0, w: 900, h: 760 }, mask: { shoreY }, defaultShore: 'snowbank', palette: 'winter_sea' });
    return this.vsea;
  }

  ports() {
    const S = this, ui = this.ui;
    return {
      world: { scene: S, reveal: (name) => S.clearFog() },
      lang: () => LAB.lang,
      clock: {
        T: () => LAB.T,
        glow: () => (S.clock.lightsOn ? Math.min(1, S.clock.cur.a / 0.45) : 0),
        addLight: (x, y, k, o) => S.clock.addLight(x, y, k, o),
      },
      emit: (ev) => { LAB.events.push(ev); if (LAB.events.length > 4000) LAB.events.shift(); },
      coins: { add: (n, x, y, fly, tag) => { LAB.coins += n; LAB.coinsBy = LAB.coinsBy || {}; LAB.coinsBy[tag] = (LAB.coinsBy[tag] || 0) + n; } },
      ui: { toast: (m, h) => { LAB.toasts.push(m); ui.toast(m, h); }, banner: (m, s) => { LAB.banners.push(m); ui.banner(m, s); } },
      sites: { offer: (def) => { LAB.sites = LAB.sites || []; LAB.sites.push(def); } },
      chief: { x: () => S.chiefPos.x, y: () => S.chiefPos.y },
      dolls: { rig: (p, id) => S.dolls.rig(p, id), looks: looksFrom(S.bf) },
      ground: { bakeHook: (fn, rect) => S.ground.addBakeHook(fn, rect), invalidate: (r) => S.ground.invalidate(r), removeHook: (h) => S.ground.removeBakeHook(h) },
      water: { region: (o) => S.water(o), village: () => S.villageSea(), owned: true },
      view: {
        rect: () => { const v = S.cameras.main.worldView; return { x: v.x, y: v.y, w: v.width, h: v.height }; },
        onScreen: (x, y, m = 0) => { const v = S.cameras.main.worldView; return x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m; },
        focus: (x, y) => { S.focus = x === null || x === undefined ? null : { x, y }; },
      },
      sound: {
        play: (k, o) => LAB.sounds.push([LAB.T, k, 0, 0]),
        at: (k, x, y, o) => LAB.sounds.push([LAB.T, k, Math.round(x), Math.round(y)]),
        amb: (k, v) => LAB.sounds.push([LAB.T, 'amb:' + k, v, 0]),
        area: (a) => LAB.sounds.push([LAB.T, 'music:' + a, 0, 0]),
        group: (k) => Assets.audioGroup(k),
      },
      assets: { fragment: (name, o) => S.lateLoad(name, o), defs: () => Assets.m.sprites },
      missions: { report: (r) => { LAB.reports.push(r); return true; } },
    };
  }

  /** a lazy atlas on demand (bbld_glow at dusk) */
  lateLoad(name, o) {
    const want = (o && o.only) || [];
    const L = this.load;
    let n = 0;
    for (const k of want) { if (this.textures.exists(k)) continue; const a = Assets.m.atlases[k]; if (!a) continue; L.atlas(k, 'assets/' + a.png, 'assets/' + a.json); n++; LAB.lateLoads.push(k); }
    if (n) { L.once('complete', () => { for (const k in Assets.m.sprites) Assets.spriteAnims(this.game, k); }); L.start(); }
  }

  /**
   * (re)build the beach for a scenario: { stage: 'fresh'|'path'|'open'|'shops'|'hotel'|'full', shops, hour, day, lang, zoom, at: [i, j],
   *   chief: [i, j], fog, seed, quality }
   */
  setup(o = {}) {
    if (this.host) { this.host.destroy(); this.host = null; }
    for (const w of this.waters) w.destroy();
    this.waters = []; this.vsea = null;
    if (this.fog) { for (const f of this.fog) f.destroy(); this.fog = null; }
    LAB.lang = o.lang || 'ko';
    LAB.quality = o.quality || 'high';
    LAB.T = 600 * (o.day !== undefined ? o.day : 2) + 25 * (o.hour !== undefined ? o.hour : 11);
    this.clock.T = LAB.T;
    this.clock.cur = { r: 255, g: 255, b: 255, a: 0 };
    this.clock.lights = [];
    const ORDER = ['beach_cafe', 'icecream_shop', 'seafood_bbq', 'convenience_store', 'souvenir_shop', 'swimwear_shop', 'surf_shop'];
    const stage = o.stage || 'full';
    const steps = {};
    const upto = { fresh: [], path: ['path'], revealed: ['path', 'reveal'], open: ['path', 'reveal', 'cleanup', 'lifeguard', 'board'], shops: ['path', 'reveal', 'cleanup', 'lifeguard', 'board'],
      hotel: ['path', 'reveal', 'cleanup', 'lifeguard', 'board', 'hotel'], full: ['path', 'reveal', 'cleanup', 'lifeguard', 'board', 'hotel', 'pool', 'aquarium', 'up2', 'up3'] }[stage] || [];
    for (const k of upto) steps[k] = 1;
    const nShops = o.shops !== undefined ? o.shops : stage === 'full' ? 7 : stage === 'hotel' ? 5 : stage === 'shops' ? 4 : 0;
    const saved = { v: 1, steps, hotel: { level: steps.up3 ? 3 : steps.hotel ? 1 : 0, guests: steps.hotel ? [[steps.up3 ? 22 : 8, Math.floor(LAB.T / 600) + 2]] : [] }, shops: ORDER.slice(0, nShops), stars: { n: 0 }, events: { last: {} } };
    if (o.clean !== undefined) saved.clean = o.clean;
    this.ports_ = this.ports();
    this.host = new BeachHost(this.ports_, saved, { View: BeachView, seed: o.seed || 20261017, looks: this.ports_.dolls.looks, defs: Assets.m.sprites, callAfter: stage === 'fresh' ? 2 : 0, fallbackFerry: true });
    LAB.host = this.host;
    { const mdl = this.host.model, up = mdl.update.bind(mdl); mdl.update = (dt, T) => { const a = performance.now(); up(dt, T); LAB.msModel.push(performance.now() - a); if (LAB.msModel.length > 4000) LAB.msModel.shift(); }; }
    const c = o.chief || [104.5, -13.0];
    const [cx, cy] = layout.LR(c[0], c[1]);
    this.chiefPos = { x: cx, y: cy }; this.chiefMove = null; this.chiefDir = o.chiefDir || 'SW';
    this.chief.setVisible(o.hideChief !== true);
    const at = o.at || c;
    const [ax, ay] = layout.LR(at[0], at[1]);
    this.focus = o.follow === 'chief' ? null : { x: ax, y: ay };
    LAB.zoom = o.zoom || 1;
    this.cameras.main.setZoom(LAB.zoom * View.k);
    this.cameras.main.centerOn(this.focus ? ax : cx, this.focus ? ay : cy - 40);
    if (o.fog) this.makeFog();
    LAB.events.length = 0; LAB.toasts.length = 0; LAB.banners.length = 0; LAB.sounds.length = 0; LAB.ms.length = 0; LAB.msModel.length = 0; LAB.reports.length = 0; LAB.coins = 0; LAB.coinsBy = {};
    this.ground.invalidate(null);
  }

  /** the fog over `beach` until the reveal (the game's Territory fog; puffs here) */
  makeFog() {
    this.fog = [];
    for (let i = 88; i <= 124; i += 2.4) for (let j = -26; j <= -1; j += 2.4) {
      const [x, y] = layout.LR(i + ((j * 7) % 2), j);
      if (!this.textures.exists('fog_puff')) break;
      const f = this.add.image(x, y, 'fog_puff').setDepth(DEPTH.FX - 31).setScale(2.4).setAlpha(0.92);
      this.fog.push(f);
    }
  }
  clearFog() {
    if (!this.fog) return;
    for (const f of this.fog) this.tweens.add({ targets: f, alpha: 0, scale: 3.2, duration: 2200, delay: ((f.x * 3) % 700), onComplete: () => f.destroy() });
    this.fog = null;
  }

  /** walk the chief along lattice points [[i, j] ...] at speed px/s */
  walk(pts, speed = 150) { this.chiefMove = { pts: pts.map(([i, j]) => layout.LR(i, j)), k: 0, speed }; }

  update(time, delta) { if (!LAB.ready || LAB.manual) return; this.tick(Math.min(0.05, delta / 1000)); }

  tick(dt) {
    LAB.T += dt;
    this.clock.T = LAB.T - dt;
    this.clock.update(dt);
    this.moveChief(dt);
    const t0 = performance.now();
    this.host.update(dt);
    LAB.ms.push(performance.now() - t0);
    if (LAB.ms.length > 4000) LAB.ms.shift();
    for (const w of this.waters) w.update(dt);
    const cam = this.cameras.main;
    if (this.focus) { const cx = cam.midPoint.x, cy = cam.midPoint.y; cam.centerOn(cx + (this.focus.x - cx) * Math.min(1, dt * 2.2), cy + (this.focus.y - cy) * Math.min(1, dt * 2.2)); }
    else cam.centerOn(this.chiefPos.x, this.chiefPos.y - 60);
    cam.preRender();
    this.ground.update(cam.worldView);
    this.ui.tick(dt);
  }

  moveChief(dt) {
    const m = this.chiefMove, p = this.chiefPos;
    let moving = false;
    if (m && m.k < m.pts.length) {
      const [tx, ty] = m.pts[m.k], dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy), step = m.speed * dt;
      if (d <= step) { p.x = tx; p.y = ty; m.k++; } else { p.x += (dx / d) * step; p.y += (dy / d) * step; moving = true; this.chiefDir = LAB.dirOf(dx, dy); }
    }
    const dirs = ['S', 'SE', 'E', 'NE', 'N'], mir = { SW: 'SE', W: 'E', NW: 'NE' };
    const d = dirs.includes(this.chiefDir) ? this.chiefDir : mir[this.chiefDir] || 'S';
    const key = 'player:' + (moving ? 'walk' : 'idle') + ':' + d;
    if (this.anims.exists(key) && (!this.chief.anims.currentAnim || this.chief.anims.currentAnim.key !== key)) this.chief.play(key);
    this.chief.setFlipX(!!mir[this.chiefDir]).setPosition(p.x, p.y).setDepth(p.y);
  }
}
LAB.dirOf = (dx, dy) => { const D = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE']; return D[(Math.round(Math.atan2(2 * dy, dx) / (Math.PI / 4)) + 8) % 8]; };

// ---------------------------------------------------------------------------------------------------- the HUD (UI.js look)
const TXT = (size, color = '#ffffff', stroke = '#2b2f3a', sw = 6, weight = '900') => ({ fontFamily: FONT, fontSize: size + 'px', fontStyle: weight, color, stroke, strokeThickness: sw });
class UI extends Phaser.Scene {
  constructor() { super('UI'); }
  create() {
    View.applyUI(this.cameras.main);
    this.W = View.W; this.H = View.H;
    const top = 62;
    this.coinBar = this.nine('ui_coin_bar', 26, top, 236, 74).setOrigin(0, 0.5);
    const ci = Assets.image(this, 64, top, 'ui_icon_coin'); ci.setScale(64 / ci.frame.realWidth);
    this.coinT = this.add.text(104, top + 2, '0', TXT(40)).setOrigin(0, 0.5);
    this.clockG = this.add.graphics();
    this.clockT = this.add.text(this.W - 62, top + 92, '', TXT(18, '#2b2f3a', '#ffffff', 0)).setOrigin(0.5);
    this.toastBox = this.add.container(this.W / 2, this.H - 230).setVisible(false).setDepth(50);
    this.toastBg = this.nine('ui_panel', 0, 0, 300, 64).setOrigin(0.5).setTint(0x2b2f3a).setAlpha(0.88);
    this.toastText = this.add.text(0, 0, '', TXT(26, '#ffffff', '#2b2f3a', 0, '800')).setOrigin(0.5);
    this.toastBox.add([this.toastBg, this.toastText]);
    this.bannerBox = this.add.container(this.W / 2, this.H * 0.27).setVisible(false).setDepth(60);
    this.bannerBg = this.nine('ui_button_blue', 0, 0, 520, 150).setOrigin(0.5);
    this.bannerText = this.add.text(0, -22, '', TXT(44, '#ffffff', '#1f4f8f', 10)).setOrigin(0.5);
    this.bannerSub = this.add.text(0, 36, '', TXT(20, '#ffffff', '#1f4f8f', 6, '800')).setOrigin(0.5);
    this.bannerBox.add([this.bannerBg, this.bannerText, this.bannerSub]);
    this.toastT = 0; this.bannerT = 0;
  }
  nine(key, x, y, w, h) { const n = Assets.nine(key); return this.add.nineslice(x, y, n.tex, n.frame, w, h, n.l, n.r, n.t, n.b); }
  toast(m, hold = 1600) { this.toastText.setText(m); this.toastBg.setSize(Math.max(260, this.toastText.width + 60), 64); this.toastBox.setVisible(true).setAlpha(1); this.toastT = hold / 1000; }
  banner(m, s) { this.bannerText.setText(m); this.bannerSub.setText(s || ''); this.bannerBg.setSize(Math.max(480, this.bannerText.width + 80, this.bannerSub.width + 60), s ? 150 : 110); this.bannerBox.setVisible(true).setAlpha(1).setScale(0.6); this.tweens.add({ targets: this.bannerBox, scale: 1, duration: 360, ease: 'Back.easeOut' }); this.bannerT = 3.2; }
  tick(dt) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastBox.setVisible(false); }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.bannerBox.setVisible(false); }
    this.coinT.setText(String(Math.floor(12480 + (LAB.coins || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
    const h = hourOf(LAB.T), top = 62;
    this.clockG.clear();
    this.clockG.fillStyle(0x1f3354, 0.22); this.clockG.fillCircle(this.W - 62, top + 95, 30); this.clockG.fillStyle(0xfff8ec, 0.95); this.clockG.fillCircle(this.W - 62, top + 92, 30);
    this.clockG.lineStyle(5, h >= 19 || h < 6 ? 0x6f7fd8 : 0xffc83d, 1); this.clockG.beginPath(); this.clockG.arc(this.W - 62, top + 92, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (h / 24)); this.clockG.strokePath();
    this.clockT.setText(String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0'));
  }
}

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: Math.round(View.W * View.k),
  height: Math.round(View.H * View.k),
  backgroundColor: '#bfe6ea',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false, roundPixels: false },
  disablePreFX: true,
  banner: false,
  fps: { target: 60 },
  scene: [Boot, Load, World, UI],
});
LAB.game = game;
LAB.View = View;
