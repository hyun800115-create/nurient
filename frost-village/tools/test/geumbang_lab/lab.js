// geumbang_lab: the real 금방 module (GeumbangHost: the pure GbModel + the GbView) on a stand-in piece of the game —
// the real v4 street grid at 읍 with the real painter (RoadNet + RoadPaint + the v4.2 depot lanes), the town's
// buildings and lots from WORLD.v4 with the finished art, the v4.2 depot as the logistics_center cutaway (LabDepot),
// a stand-in 서리마을 lane of log cabins with a sled track, the real paper dolls (townfolk + officefolk +
// geumbangfolk), the real v4 Effects and DayClock (night tint), the game's scale rules (720-wide logical view, render
// scale k from the device pixel ratio, world zoom × k). run_lab.mjs drives it with a fixed-step clock (window.__LAB).

import { Assets } from '../../../src/core/Assets.js';
import { View, MAX_RENDER_SCALE } from '../../../src/core/View.js';
import { FONT } from '../../../src/data/strings.js';
import { DEPTH } from '../../../src/systems/DepthSort.js';
import { Effects } from '../../../src/systems/Effects.js';
import { DayClock } from '../../../src/systems/DayClock.js';
import { WORLD, L4 } from '../../../src/data/world.js';
import { townfolkPreload, townfolkInstall } from '../../townfolk_compose.js';
import { mergeGeumbangfolk } from '../../geumbangfolk_compose.js';
import { GeumbangHost } from '../../../src/geumbang/host.js';
import { GbView } from '../../../src/geumbang/view/GbView.js';
import { GB_TUNING } from '../../../src/geumbang/tuning.js';
import { L } from '../../../src/geumbang/layout.js';
import { makeRoads, makeEntries, villageGraph, VILLAGE } from './lab_world.js';
import { LabGround } from './lab_ground.js';
import { LabDolls } from './lab_dolls.js';
import { LabDepot, makeDepot } from './lab_depot.js';

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

const LATE = ['town', 'roads', 'logistics', 'vehicles', 'geumbang', 'ui6', 'audio8'];
const ATLASES = ['lgx_center_a', 'lgx_center_b', 'lgx_center_c', 'lgx_center_d', 'lgx_items', 'gb_bld_0', 'gb_van_0', 'ui6_gb', 'veh_dog_sled',
  'town_civic', 'town_shops', 'town_park', 'town_street', 'town_homes', 'town_rails', 'bld_buildings_2', 'bld_items', 'props_nature', 'props_decor', 'props_items',
  'fx_particles', 'emotes', 'roads_decals', 'ui_icons'];
const IMAGES = ['ground_snow', 'road_dirt', 'road_dirt_y', 'road_dirt_cross', 'road_cobble_wide', 'sidewalk'];
const SHEETS = ['fx_smoke_puff', 'fx_sparkle'];
const CHARS = ['gb_van', 'gb_van_turn', 'dog_sled'];
/** textures the module brings (what integration adds) */
export const MODULE_TEX = /^(gb_bld_0|gb_van_0|gbf_road_0|gbf_hub_0|ui6_gb|gb_photo_)/;
const SHOP_PRICE = { item_bread: 7, item_meat_cooked: 12, item_fish_cooked: 4, item_can: 12, item_plank: 5, item_axe: 40, item_rod: 40, item_sickle: 40, item_bow: 40, item_pickaxe: 40 };
const hourOf = (T) => ((T / 25) % 24 + 24) % 24;
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

const LAB = window.__LAB = { ready: false, errors: [], events: [], sounds: [], toasts: [], banners: [], lang: 'ko', T: 600 * 3 + 25 * 9, ms: [], msModel: [], zoom: 0.8, coins: 5000, t: 0, manual: false, inflowPerMin: 30 };
window.addEventListener('error', (e) => LAB.errors.push(String(e.message) + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
window.addEventListener('unhandledrejection', (e) => LAB.errors.push('rejection: ' + String(e.reason && e.reason.stack || e.reason)));

// ---------------------------------------------------------------------------------------------------- boot + load
let TFMAN = null;
class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    Assets.queueManifests(this.load);
    for (const f of LATE) this.load.json('manifest_' + f, 'assets/' + f + '/manifest.json');
    for (const f of ['townfolk', 'officefolk', 'geumbangfolk']) this.load.json('tf_' + f, 'assets/' + f + '/manifest.json');
  }
  create() {
    Assets.mergeManifests(this.cache.json);
    for (const f of LATE) Assets.mergeLate(f, this.cache.json.get('manifest_' + f));
    TFMAN = mergeGeumbangfolk(this.cache.json.get('tf_townfolk'), this.cache.json.get('tf_officefolk'), this.cache.json.get('tf_geumbangfolk'));
    // the office pages are not the 금방 crew's (v4.3 keeps them on demand): not loaded here
    TFMAN.atlases = TFMAN.atlases.filter((a) => !/^of_/.test(a.key));
    this.scene.start('Load');
  }
}

class Load extends Phaser.Scene {
  constructor() { super('Load'); }
  preload() {
    const m = Assets.m, Ld = this.load;
    for (const k of ATLASES) { const a = m.atlases[k]; if (a) Ld.atlas(k, 'assets/' + a.png, 'assets/' + a.json); else LAB.errors.push('no atlas ' + k); }
    for (const k of IMAGES) { const a = m.images[k]; if (a) Ld.image(k, 'assets/' + a.png); else LAB.errors.push('no image ' + k); }
    for (const k of SHEETS) { const s = m.spritesheets[k]; if (s) Ld.spritesheet(k, 'assets/' + s.png, { frameWidth: s.frameWidth, frameHeight: s.frameHeight }); }
    townfolkPreload(this, TFMAN, 'assets/');
    Ld.on('loaderror', (f) => LAB.errors.push('load: ' + f.key));
  }
  async create() {
    const g = this.game;
    Assets.game = g;
    townfolkInstall(this, TFMAN);
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
    cam.setBackgroundColor('#e6eef7');
    cam.setZoom(LAB.zoom * View.k);
    this.ui = this.scene.get('UI');
    this.effects = new Effects(this);
    const doorPointOf = (key) => (Assets.def(key) && Assets.def(key).doorPoint) || null;
    this.roads = makeRoads(doorPointOf, { inPlace: true });
    this.entries = makeEntries(this.roads.doors, { seed: 4343 });
    this.ground = new LabGround(this, this.roads.rn);
    this.decor = [];
    this.props();
    this.dolls = new LabDolls(this, TFMAN, this.entries);
    this.day = new DayClock(this, { T: LAB.T, on: true });
    this.lookAtP = null; this.focusAt = null;
    this.depotData = null; this.depot = null; this.host = null;
    LAB.scene = this; LAB.game = this.game; LAB.ui = this.ui; LAB.Assets = Assets; LAB.MODULE_TEX = MODULE_TEX; LAB.L = L; LAB.L4 = L4; LAB.WORLD = WORLD;
    LAB.setup = (o) => this.setup(o);
    LAB.step = (sec, dt) => this.stepFor(sec, dt);
    LAB.look = (x, y, z) => this.look(x, y, z);
    LAB.stats = () => this.stats();
    /** n orders now (the model's own OrderBook picks the households and baskets; the events go out as usual) */
    LAB.burst = (n) => {
      const m = this.host.model;
      let k = 0;
      for (let i = 0; i < n * 4 && k < n; i++) {
        m.orders.nextT = LAB.T;
        for (const o of m.orders.tick(0, LAB.T, hourOf(LAB.T), m.ctx())) { m.settle.ordered(o); m.emit({ t: 'gb:order', id: o.id, aid: o.aid, hid: o.hid, by: o.by, items: Object.assign({}, o.got) }); k++; }
      }
      return k;
    };
    this.setup({});
    LAB.ready = true;
  }

  // -- the static stand-in world: the town's buildings, lot houses, the village cabins, pines (roads are baked)
  props() {
    const put = (k, x, y, s = 1, flip = false) => { if (!Assets.has(k)) { LAB.errors.push('art ' + k); return null; } const im = Assets.image(this, x, y, k).setDepth(y).setScale(s); if (flip) im.setFlipX(true); this.decor.push(im); return im; };
    const V = WORLD.v4;
    for (const b of V.town.buildings) put(b.key, b.x, b.y);
    const houses = ['house_a', 'house_b', 'house_c'];
    Object.keys(V.lots).sort().forEach((id, n) => { const l = V.lots[id]; put(houses[n % 3], l.x, l.y + 6, l.size === 'S' ? 0.85 : 1); });
    for (const c of VILLAGE.cabins) put(c.key, c.x, c.y, 1, c.flip);
    const pines = [[19.0, -27.6], [21.0, -30.6], [23.4, -33.0], [26.0, -34.4], [31.2, -33.6], [37.6, -31.4], [39.5, -27.8], [41.2, -24.4], [22.0, -21.8], [27.5, -20.8]].map(([i, j]) => L4(i, j))
      // around the old-village lane (clear of the cabins and the sled track)
      .concat([[2470, 1640], [2500, 1990], [2700, 2060], [3040, 2040], [2560, 1540], [3150, 1880], [2440, 1820]]);
    pines.forEach(([x, y], k) => put(k % 3 === 0 ? 'tree_pine_a' : k % 3 === 1 ? 'tree_pine_snow' : 'tree_pine_b', x, y, 0.9 + (k % 4) * 0.05, k % 2 === 0));
    for (const [i, j, k] of [[29.0, -24.9, 'snow_pile_a'], [33.2, -31.6, 'snow_pile_a'], [6.8, -5.2, 'bush_snow'], [26.0, -21.4, 'bench'], [5.2, -7.8, 'lamp_post']]) { const [x, y] = L4(i, j); put(k, x, y); }
  }

  isOnScreen(x, y, m = 0) { const v = this.cameras.main.worldView; return x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m; }

  /**
   * (re)build the module for a scenario: { T, open (true: paid + opened), fill (racks 0..1), lv: { van, pack, sled, dawn, back,
   *   lockA, lockP }, reveal, lang, snow, homeAll, saved, seed, warm (s of model-only time), ceremonyS, inflowPerMin }
   */
  setup(o = {}) {
    if (this.host) { this.host.destroy(); this.host = null; }
    if (this.depot) { this.depot.destroy(); this.depot = null; }
    if (o.T !== undefined) LAB.T = o.T;
    if (o.lang) LAB.lang = o.lang;
    if (o.inflowPerMin !== undefined) LAB.inflowPerMin = o.inflowPerMin;
    LAB.snow = !!o.snow; LAB.homeAll = o.homeAll; LAB.inAcc = 0;
    LAB.events.length = 0; LAB.toasts.length = 0; LAB.banners.length = 0; LAB.sounds.length = 0;
    this.depotData = makeDepot(o.fill === undefined ? 0.7 : o.fill, o.seed || 7);
    this.depot = new LabDepot(this, this.depotData);
    this.depot.lang = LAB.lang;
    this.depot.labReveal = !!o.reveal;
    const ports = this.ports = makePorts(this);
    let saved = o.saved || null;
    if (!saved && o.open !== false) {
      const lv = Object.assign({ van: 1, pack: 0, sled: 1, dawn: 0, back: 0, lockP: 0, lockA: 0 }, o.lv || {});
      saved = { v: 1, st: o.fresh ? 0 : 2, lv, seq: 0, seed: o.seed || 20261017, day: Math.floor(LAB.T / 600), ord: [], door: [], staff: [], days: [], tot: [0, 0, 0, 0], rev: o.rev || [], seen: o.fresh ? 0 : 1 | 2 };
    }
    this.host = new GeumbangHost(ports, saved, { View: GbView, tuning: GB_TUNING, seed: o.seed || 20261017 });
    LAB.host = this.host; LAB.model = this.host.model; LAB.view = this.host.view;
    LAB.ms.length = 0; LAB.msModel.length = 0;
    this.day.T = LAB.T;
    if (o.warm) this.warm(o.warm);
    this.snapNight();
    return { addresses: this.host.model.book.list().length };
  }

  /** model-only time (no drawing): orders arrive, vans go */
  warm(sec) {
    const dt = 1 / 30, n = Math.round(sec / dt), H = this.host;
    for (let i = 0; i < n; i++) { LAB.T += dt; this.inflow(dt); H.model.tick(dt, LAB.T, hourOf(LAB.T)); for (const e of H.model.events.splice(0)) H.onEvent(e); }
  }

  inflow(dt) {
    LAB.inAcc = (LAB.inAcc || 0) + (LAB.inflowPerMin / 60) * dt;
    if (LAB.inAcc >= 1) { const k = Math.floor(LAB.inAcc); LAB.inAcc -= k; this.depotData.bring(k); }
  }

  /** the DayClock tint at the clock's hour now (no fade after a jump) */
  snapNight() { const d = this.day; d.T = LAB.T; const tg = d.target(d.hour()); d.cur.a = tg.a; d.cur.r = (tg.color >> 16) & 255; d.cur.g = (tg.color >> 8) & 255; d.cur.b = tg.color & 255; }

  look(x, y, z) { if (z) { LAB.zoom = z; this.cameras.main.setZoom(z * View.k); } this.cameras.main.centerOn(x, y); this.focusAt = null; }

  /** the module's camera (ports.view.lookAt / release): follows its target smoothly */
  lookAt(x, y, z) { this.lookAtP = { x, y, z }; }
  release() { this.lookAtP = null; }

  update(time, delta) {
    if (!LAB.ready || LAB.manual) return;
    this.tick(Math.min(0.05, delta / 1000));
  }

  stepFor(sec, dt = 1 / 30) { const n = Math.max(1, Math.round(sec / dt)); for (let i = 0; i < n; i++) this.tick(dt); return LAB.T; }

  tick(dt) {
    LAB.T += dt; LAB.t += dt;
    this.inflow(dt);
    this.depot.update(dt);
    const t0 = performance.now();
    this.host.update(dt);
    LAB.ms.push(performance.now() - t0);
    LAB.msModel.push(this.host.msModel || 0);
    if (LAB.ms.length > 6000) { LAB.ms.shift(); LAB.msModel.shift(); }
    const cam = this.cameras.main;
    if (this.lookAtP) {
      const p = this.lookAtP, k = 1 - Math.exp(-dt * 3.2);
      if (p.z && Math.abs(LAB.zoom - p.z) > 0.002) { LAB.zoom += (p.z - LAB.zoom) * k; cam.setZoom(LAB.zoom * View.k); }
      cam.centerOn(cam.midPoint.x + (p.x - cam.midPoint.x) * k, cam.midPoint.y + (p.y - cam.midPoint.y) * k);
    }
    cam.preRender();
    this.ground.update(1);
    this.day.T = LAB.T - dt;
    this.day.update(dt);
    this.ui.tick(dt);
  }

  stats() {
    const H = this.host, v = H.view, ms = LAB.ms.slice(-600), mm = LAB.msModel.slice(-600);
    const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
    const p95 = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length * 0.95)] : 0; };
    return { T: LAB.T, hour: hourOf(LAB.T), st: H.model.st, msHost: +avg(ms).toFixed(3), msHostP95: +p95(ms).toFixed(3), msModel: +avg(mm).toFixed(4), msModelP95: +p95(mm).toFixed(4), objects: v ? v.objects() : 0, sceneObjects: this.children.list.length, state: H.model.state(), dollsMs: +this.dolls.ms.toFixed(1) };
  }
}

function makePorts(W) {
  const D = () => W.depotData;
  return {
    clock: { T: () => LAB.T, hour: () => hourOf(LAB.T), day: () => Math.floor(LAB.T / 600), dark: () => (W.day ? W.day.cur.a : 0) },
    lang: () => LAB.lang,
    roads: { net: () => W.roads.rn, village: () => villageGraph() },
    town: {
      homes: () => W.entries,
      home: (aid, hid) => { if (LAB.homeAll !== undefined) return !!LAB.homeAll; const h = hourOf(LAB.T); const k = (hashStr(String(hid || aid)) + Math.floor(LAB.T / 600)) % 4; return h >= 17 || h < 9 || k !== 0; },
      passer: () => false,
      walkers: () => null,
    },
    depot: {
      count: (k) => D().count(k), pick: (i) => D().pick(i), restock: (i) => D().restock(i), level: (c) => D().level(c), fill: () => D().fill(),
      sleighBusy: () => !!LAB.sleighBusy, surplus: (items) => { for (const k in items) D().surplus += items[k]; }, dockSurplus: () => D().dock, takeSurplus: () => null,
      building: () => W.depot, reveal: (on) => { if (W.depot) W.depot.camReveal = !!on; }, stock: () => D().stock, staff: () => {},
    },
    coins: { till: (n) => { LAB.coins += n; }, spend: (cost) => { const c = typeof cost === 'number' ? cost : cost.coins || 0; if (LAB.coins < c) return false; LAB.coins -= c; return true; } },
    growth: { happy: () => {} },
    ledger: { shelf: () => [{ level: 0.8, status: 'ok' }] },
    price: (k) => SHOP_PRICE[k] || 1,
    weather: { snow: () => !!LAB.snow },
    settings: { alerts: () => LAB.alerts || 'on', scenes: () => (LAB.scenes === false ? 'off' : 'on'), setAlerts: (v) => { LAB.alerts = v; }, setScenes: (on) => { LAB.scenes = !!on; } },
    world: { scene: W },
    ui: { scene: W.ui, banner: (m, s) => { LAB.banners.push(m + ' / ' + (s || '')); W.ui.banner(m, s); }, toasted: (m) => LAB.toasts.push(m), busy: () => false },
    view: { onScreen: (x, y, m) => W.isOnScreen(x, y, m), lookAt: (x, y, z) => W.lookAt(x, y, z), release: () => W.release(), chief: () => LAB.chief || null },
    dolls: W.dolls,
    fx: { sheet: (k, x, y, o) => W.effects.sheet(k, x, y, o), burst: (n, x, y, q) => W.effects.burst(n, x, y, q), floatText: (x, y, t, c, s) => W.effects.floatText(x, y, t, c, s) },
    sound: { at: (k) => LAB.sounds.push(k), play: (k) => LAB.sounds.push(k) },
    emit: (e) => LAB.events.push(e),
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
    this.coinT = this.add.text(70, top + 2, '', TXT(36)).setOrigin(0, 0.5);
    this.clockT = this.add.text(this.W - 40, top + 2, '', TXT(30)).setOrigin(1, 0.5);
    // the v4.2 업무 chip stand-in (x 28, centre y 410, 132 × 50): the 금방 chip sits right under it
    this.work = this.add.graphics();
    this.work.fillStyle(0xfff7e6, 0.95).fillRoundedRect(28, 385, 132, 50, 25).lineStyle(3, 0x8fb4e0, 1).strokeRoundedRect(28, 385, 132, 50, 25);
    this.workT = this.add.text(94, 410, '업무', TXT(20, '#2b4f7e', '#ffffff', 0, '900')).setOrigin(0.5);
    this.bannerBox = this.add.container(this.W / 2, this.H * 0.27).setVisible(false).setDepth(60);
    this.bannerG = this.add.graphics();
    this.bannerText = this.add.text(0, -22, '', TXT(40, '#ffffff', '#1f4f8f', 10)).setOrigin(0.5);
    this.bannerSub = this.add.text(0, 34, '', TXT(21, '#ffffff', '#1f4f8f', 6, '800')).setOrigin(0.5);
    this.bannerBox.add([this.bannerG, this.bannerText, this.bannerSub]);
    this.bannerT = 0;
  }
  banner(m, s) {
    this.bannerText.setText(m); this.bannerSub.setText(s || '');
    const w = Math.max(480, this.bannerText.width + 80, this.bannerSub.width + 60), h = s ? 150 : 110;
    this.bannerG.clear(); this.bannerG.fillStyle(0x1f4f8f, 0.25); this.bannerG.fillRoundedRect(-w / 2 + 4, -h / 2 + 8, w, h, 34);
    this.bannerG.fillStyle(0x3d86d6, 1); this.bannerG.fillRoundedRect(-w / 2, -h / 2, w, h, 34);
    this.bannerG.lineStyle(6, 0xffffff, 0.9); this.bannerG.strokeRoundedRect(-w / 2, -h / 2, w, h, 34);
    this.bannerBox.setVisible(true).setAlpha(1).setScale(1);
    this.bannerT = 3.4;
  }
  tick(dt) {
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.bannerBox.setVisible(false); }
    const top = 62, g = this.g;
    g.clear();
    g.fillStyle(0x1f3354, 0.35); g.fillRoundedRect(24, top - 34, 240, 68, 34);
    g.fillStyle(0xf2c94c, 1); g.fillCircle(52, top, 18);
    g.fillStyle(0x1f3354, 0.35); g.fillRoundedRect(this.W - 150, top - 30, 126, 60, 30);
    this.coinT.setText(Math.round(LAB.coins).toLocaleString());
    const h = hourOf(LAB.T);
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
