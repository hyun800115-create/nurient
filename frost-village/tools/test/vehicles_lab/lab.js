// vehicles_runtime lab: the real VehiclesHost (model + view) on a stand-in piece of the world — the real v4 street
// grid and painter (RoadNet + RoadPaint) with the v5 streets added the way patch P19 adds them, the town's buildings
// from WORLD.v4, the station, people as the real paper dolls, the finished vehicle art. The game's scale rules
// (720-wide logical UI, render scale k from the device pixel ratio, world zoom × k). The lab plays Game.js / UI.js
// through the Ports facade; run_lab.mjs drives it with a fixed-step clock through window.__LAB.

import { Assets } from '../../../src/core/Assets.js';
import { View, MAX_RENDER_SCALE } from '../../../src/core/View.js';
import { FONT } from '../../../src/data/strings.js';
import { DEPTH } from '../../../src/systems/DepthSort.js';
import { WORLD, L4 } from '../../../src/data/world.js';
import { mergeTownfolkManifests } from '../../townfolk2_compose.js';
import { townfolkPreload, townfolkInstall } from '../../townfolk_compose.js';
import * as layout from '../../../src/vehicles/layout.js';
import { VehiclesHost } from '../../../src/vehicles/host.js';
import { VehiclesView } from '../../../src/vehicles/view/VehiclesView.js';
import { shadowTex } from '../../../src/vehicles/view/art.js';
import { Effects } from '../../../src/systems/Effects.js';
import { makeRoads } from './world_stub.js';
import { LabGround } from './lab_ground.js';
import { LabTown, dirOf } from './lab_town.js';

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

const LATE = ['vehicles', 'roads', 'town', 'ui3'];
// (the cars are not here: the module asks for its palette's ≤ 4 car atlases through ports.assets.fragment, like the game)
const VEH_ATLASES = ['veh_horse_sleigh_bus', 'veh_horse_sleigh_bus_over', 'veh_steam_wagon', 'veh_dog_sled', 'veh_cargo_sleigh', 'veh_retro_bus', 'veh_truck_cargo', 'veh_truck_cargo_chief',
  'veh_depots', 'veh_street', 'veh_lots', 'veh_signs'];
const ATLASES = VEH_ATLASES.concat(['ui_icons', 'ui2_icons', 'ui3_icons', 'emotes', 'fx_particles', 'props_nature', 'props_decor', 'props_items', 'town_civic', 'town_shops', 'town_homes', 'town_park', 'town_street', 'town_rails', 'roads_decals', 'life_props']);
const IMAGES = ['ui_panel', 'ui_button_blue', 'ui_button_green', 'ui_button_gray', 'ui_coin_bar', 'ground_snow', 'road_dirt', 'road_dirt_y', 'road_dirt_cross', 'road_cobble_wide', 'road_asphalt', 'sidewalk'];
const CHARS = ['player', 'horse_sleigh_bus', 'steam_wagon', 'dog_sled', 'cargo_sleigh', 'retro_bus', 'truck_cargo', 'truck_cargo_chief'];
/** textures the module brings (what integration adds) */
const MODULE_TEX = /^(veh_|road_asphalt$)/;

const LAB = window.__LAB = { ready: false, errors: [], events: [], sounds: [], toasts: [], banners: [], asked: new Set(), lateLoads: [], lang: 'ko', T: 600 * 2 + 25 * 2.4, stick: { x: 0, y: 0 }, ms: [], zoom: 0.85 };
window.addEventListener('error', (e) => LAB.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => LAB.errors.push('rejection: ' + String(e.reason && e.reason.stack || e.reason)));
const hourOf = (T) => (((T / 25) + 8) % 24 + 24) % 24;

// ---------------------------------------------------------------------------------------------------- boot + load
let TFMAN = null;
class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    Assets.queueManifests(this.load);
    for (const f of LATE) this.load.json('manifest_' + f, 'assets/' + f + '/manifest.json');
    this.load.json('tf1', 'assets/townfolk/manifest.json');
    this.load.json('tf2', 'assets/townfolk2/manifest.json');
  }
  create() {
    Assets.mergeManifests(this.cache.json);
    for (const f of LATE) Assets.mergeLate(f, this.cache.json.get('manifest_' + f));
    TFMAN = mergeTownfolkManifests(this.cache.json.get('tf1'), this.cache.json.get('tf2'));
    this.scene.start('Load');
  }
}

class Load extends Phaser.Scene {
  constructor() { super('Load'); }
  preload() {
    const m = Assets.m, L = this.load;
    const atl = new Set(ATLASES);
    for (const c of CHARS) { const d = m.characters[c]; if (d && d.atlas) atl.add(d.atlas); }
    for (const k of atl) { const a = m.atlases[k]; if (a) L.atlas(k, 'assets/' + a.png, 'assets/' + a.json); else LAB.errors.push('no atlas ' + k); }
    for (const k of IMAGES) { const a = m.images[k]; if (a) L.image(k, 'assets/' + a.png); else LAB.errors.push('no image ' + k); }
    for (const k of ['fx_smoke_puff', 'fx_sparkle']) { const s = m.spritesheets[k]; if (s) L.spritesheet(k, 'assets/' + s.png, { frameWidth: s.frameWidth, frameHeight: s.frameHeight }); }
    townfolkPreload(this, TFMAN, 'assets/');
    L.on('loaderror', (f) => LAB.errors.push('load: ' + f.key));
  }
  async create() {
    const g = this.game;
    Assets.game = g;
    townfolkInstall(this, TFMAN);
    for (const k in Assets.m.sprites) Assets.spriteAnims(g, k);
    for (const k of ['fx_smoke_puff', 'fx_sparkle']) Assets.sheetAnims && Assets.sheetAnims(g, k);
    for (const c of CHARS) Assets.buildCharacter(g, c);
    try { await document.fonts.load('900 20px Pretendard'); } catch (e) { /* system font */ }
    this.scene.start('UI');
    this.scene.start('World');
    this.scene.bringToTop('UI');
  }
}

// ---------------------------------------------------------------------------------------------------- the world
const STREETS0 = WORLD.v4.streets.slice();
const EUP0 = Object.assign({}, WORLD.v4.eup);

class World extends Phaser.Scene {
  constructor() { super('World'); }

  create() {
    const cam = this.cameras.main;
    cam.setBackgroundColor('#e6eef7');
    cam.setZoom(LAB.zoom * View.k);
    shadowTex(this);
    this.ui = this.scene.get('UI');
    this.decor = [];
    this.effects = new Effects(this);      // the game's own juice (particle presets)
    this.followFn = null;
    this.night = null;
    this.town = new LabTown(this, TFMAN);
    this.labEra = 2;
    this.setupWorld({ rank: 2 });
    LAB.scene = this; LAB.game = this.game; LAB.ui = this.ui; LAB.Assets = Assets; LAB.MODULE_TEX = MODULE_TEX; LAB.layout = layout;
    LAB.ready = true;
  }

  // -- the static stand-in world: town buildings, the station, props, pines (the roads are baked by LabGround)
  props() {
    for (const o of this.decor) o.destroy();
    this.decor = [];
    const put = (k, x, y, s = 1, flip = false) => { if (!Assets.has(k)) { LAB.errors.push('art ' + k); return null; } const im = Assets.image(this, x, y, k).setDepth(y).setScale(s); if (flip) im.setFlipX(true); this.decor.push(im); return im; };
    const V = WORLD.v4;
    for (const b of V.town.buildings) put(b.key, b.x, b.y);
    put('train_station', V.stations.ours.x, V.stations.ours.y);
    for (const p of V.town.props) { const [x, y] = L4(p[1], p[2]); put(p[0], x, y); }
    // pines and snow around the 큰길 and row D (clear of the streets)
    const pines = [[-14.5, -7.2], [-11.2, -7.6], [-8.6, 1.2], [-12.5, 1.4], [-16.8, 1.0], [-1.5, -10.6], [3.0, -11.2], [6.5, -10.0], [19.0, -27.6], [21.0, -30.6], [33.0, -28.4], [36.5, -27.9], [40.8, -27.2], [43.5, -24.4], [22.0, -21.8], [46.5, -20.6], [-19.6, -4.4], [-19.0, 0.6]];
    pines.forEach(([i, j], k) => { const [x, y] = layout.L(i, j); put(k % 3 === 0 ? 'tree_pine_a' : k % 3 === 1 ? 'tree_pine_snow' : 'tree_pine_b', Math.round(x), Math.round(y), 0.9 + (k % 4) * 0.05, k % 2 === 0); });
    for (const [i, j, k] of [[-13.6, -0.2, 'lamp_post'], [-7.6, -0.6, 'lamp_post'], [-1.9, -3.3, 'lamp_post'], [26.0, -21.4, 'bench'], [-16.4, 0.2, 'signpost'], [29.0, -24.9, 'snow_pile_a'], [-4.0, -9.2, 'snow_pile_b'], [12.0, -9.3, 'bush_snow']]) { const [x, y] = layout.L(i, j); put(k, Math.round(x), Math.round(y)); }
  }

  /**
   * (re)build the world for a scenario: { rank, built: { depot, road, yard, lot, stops: [], wagons }, lines: {}, homes, hour }
   */
  setupWorld(o = {}) {
    if (this.host) { this.host.destroy(); this.host = null; }
    if (this.ground) this.ground.destroy();
    WORLD.v4.streets.length = 0;
    for (const s of STREETS0) WORLD.v4.streets.push(s);
    for (const k in WORLD.v4.eup) if (!(k in EUP0)) delete WORLD.v4.eup[k];
    const rank = o.rank || 2;
    this.labEra = rank >= 3 ? 3 : 2;
    this.roads = makeRoads({ inPlace: true, cls: rank >= 3 ? 'asphalt' : 'cobble' });
    this.ground = new LabGround(this, this.roads.rn);
    this.ground.showBays = rank >= 3;
    this.props();
    for (const w of this.town.walkers.slice()) this.town.removeWalker(w);
    this.town.queues = {};
    LAB.T = o.T !== undefined ? o.T : 600 * 2 + 25 * ((o.hour !== undefined ? o.hour : 10.4) - 8);
    LAB.rank = rank;
    this.homes = o.homes || [];
    // founded shops that want restocking (v4 Growth.shopTargets): the 중앙로 shop row
    this.shops = (o.shops || ['p:book', 'p:toy', 'p:flower']).map((id) => { const p = layout.PLACES[id]; return { id, x: p.x, y: p.y, name: p.name[LAB.lang] || p.name.ko, need: { item_goods: 6 } }; });
    this.yardStock = 1e6;
    this.delivered = {};
    const b = o.built || {};
    const saved = { v: 1, era: rank >= 3 ? 3 : 2, built: { depot: b.depot !== false ? 1 : 0, road: b.road !== false ? 1 : 0, yard: b.yard !== false ? 1 : 0, wagons: b.wagons | 0, busDepot: rank >= 3 ? 1 : 0, lot: b.lot ? 1 : 0, porter: b.porter ? 1 : 0, stops: b.stops || ['S1', 'S4', 'S5'] }, lines: Object.assign({ 1: 0, 2: 0, 3: 0, 4: 0 }, o.lines || {}), riders: [], cars: o.cars || [], pal: o.pal || [], chief: { best: {} }, rs: 12345 };
    this.ports = makePorts(this);
    this.host = new VehiclesHost(this.ports, saved, { View: VehiclesView, seed: o.seed || 2026 });
    this.ground.rn = this.ports.roads.net();
    this.ground.refreshMarks();
    LAB.host = this.host;
    // the model's share of the tick (the rest of host.update is the view)
    { const mdl = this.host.model, up = mdl.update.bind(mdl); LAB.msModel = []; mdl.update = (dt, T) => { const a = performance.now(); up(dt, T); LAB.msModel.push(performance.now() - a); if (LAB.msModel.length > 4000) LAB.msModel.shift(); }; }
    // people waiting at the built stops
    for (const id in layout.STOPS) if (this.host.model.stopBuilt(id)) this.town.fillStop(id, id === 'S1' ? 2 : 3);
    // the chief stands on the village square until a scenario puts him somewhere
    { const [cx, cy] = layout.L(-11.5, 1.6); this.town.chiefMove = null; this.town.hideChief(false); this.town.setChief(Math.round(cx), Math.round(cy)); this.town.chiefPose('idle', 'S'); }
    this.followFn = null; LAB.followChief = false; LAB.followVeh = null; LAB.auto = null; LAB.stick = { x: 0, y: 0 };
    LAB.events.length = 0; LAB.toasts.length = 0; LAB.banners.length = 0; LAB.sounds.length = 0; LAB.ms.length = 0; if (LAB.msModel) LAB.msModel.length = 0;
  }

  update(time, delta) {
    if (!LAB.ready || LAB.manual) return;
    this.tick(Math.min(0.05, delta / 1000));
  }

  /** one step of the lab's world (also driven by LAB.run with a fixed step) */
  tick(dt) {
    LAB.T += dt;
    this.town.update(dt);
    if (LAB.auto) this.autopilot();
    const t0 = performance.now();
    this.host.update(dt);
    const t1 = performance.now();
    LAB.ms.push(t1 - t0);
    if (LAB.ms.length > 4000) LAB.ms.shift();
    if (this.followFn) { const p = this.followFn(); if (p) this.cameras.main.centerOn(p.x, p.y); }
    else if (LAB.followChief) this.cameras.main.centerOn(this.town.chiefPos.x, this.town.chiefPos.y - 60);
    else if (LAB.followVeh) { const v = this.host.model.sim.get(LAB.followVeh); if (v) this.cameras.main.centerOn(v.x, v.y - 50); }
    // (a headless step does not render: keep the camera's world view current for the ground and the culling)
    this.cameras.main.preRender();
    this.ground.update(1);
    this.updateNight();
    this.ui.tick(dt);
  }

  // -- FX through the game's Effects presets (what the integration maps ports.fx to): chimney smoke, breath / exhaust
  // steam, snow dust behind runners and paws
  puff(x, y, size) { this.effects.burst(size >= 40 ? 'smoke' : 'steam', x, y, 1); }
  kick(x, y) { this.effects.burst('snowhit', x, y, 2); }

  // -- night: the game's DayClock multiply tint (a stand-in)
  nightFactor() { const h = hourOf(LAB.T); if (h >= 20 || h < 6) return 1; if (h >= 17) return (h - 17) / 3; if (h < 8) return 1 - (h - 6) / 2; return 0; }
  updateNight() {
    const a = this.nightFactor() * 0.5;
    if (a < 0.01) { if (this.night) this.night.setVisible(false); return; }
    if (!this.night) this.night = this.add.image(0, 0, '__WHITE').setOrigin(0, 0).setDepth(DEPTH.FX - 30).setBlendMode(Phaser.BlendModes.MULTIPLY);
    const v = this.cameras.main.worldView, m = 100;
    const mix = (c) => Math.round(255 * (1 - a) + c * a);
    this.night.setVisible(true).setPosition(v.x - m, v.y - m).setDisplaySize(v.width + 2 * m, v.height + 2 * m).setTint((mix(52) << 16) | (mix(70) << 8) | mix(140));
  }

  look(x, y, z) { const c = this.cameras.main; if (z) { LAB.zoom = z; c.setZoom(z * View.k); } c.centerOn(x, y); c.preRender(); }

  /**
   * the lab's driver (the Node test's bot, as a thumb would do it): the stick points down the guide's out-lane near a
   * junction, else along the heading; `LAB.auto` = { k: stick length, brakeAt?: [x, y] }
   */
  autopilot() {
    const m = this.host.model, st = m.chief.state();
    if (!st.active) { LAB.stick = { x: 0, y: 0 }; return; }
    const v = m.chief.vehicle(), here = m.herePos(v), s = m.chief.run.stops[m.chief.run.i];
    let sx = v.hx, sy = v.hy;
    const path = here && s && s.pos ? m.graph.route(here, s.pos, { allow: v.allow }) : null;
    const c = path && path.find((p) => p.t === 'C');
    const ci = path ? path.indexOf(c) : -1;
    let ahead = 0; if (path) for (let i = 0; i < ci; i++) ahead += path[i].s1 - path[i].s0;
    if (c && ahead < 12 && m.graph.conns[c.id].turn !== 'U') { const to = m.graph.lanes[m.graph.conns[c.id].to]; sx = to.pts[1].x - to.pts[0].x; sy = to.pts[1].y - to.pts[0].y; }
    // the stop is behind (much shorter from the lane beside): pull the stick back, the vehicle stops and turns round
    const onLane = v.path && v.path[m.sim.pieceIndex(v, v.ps)].t === 'L';
    const tw = here && onLane ? m.graph.twin(here.lane) : -1;
    if (st.blocked === 'noRoom') this.autoOn = 2.5;            // no room to turn: drive on a bit first
    if (this.autoOn > 0) this.autoOn -= 1 / 60;
    else if (tw >= 0 && path && s && s.pos) { const alt = m.graph.route({ lane: tw, s: Math.max(0.1, m.graph.lanes[tw].len - here.s) }, s.pos, { allow: v.allow }); if (alt && m.graph.pathLen(alt) + 15 < m.graph.pathLen(path)) { sx = -v.hx; sy = -v.hy; } }
    const d = Math.hypot(sx, sy) || 1, k = LAB.auto.k || 0.9;
    LAB.stick = { x: sx / d * k, y: sy / d * k };
  }
}

// ---------------------------------------------------------------------------------------------------- the ports
function makePorts(world) {
  const town = world.town, cam = () => world.cameras.main;
  const roads = world.roads;
  const STOPS = layout.STOPS;
  const ports = {
    world: { scene: world },
    ui: { scene: world.ui, safeTop: 0, toast: (m, h) => { LAB.toasts.push(m); world.ui.toast(m, h); }, banner: (m, s) => { LAB.banners.push(m); world.ui.banner(m, s); } },
    rank: () => LAB.rank,
    lang: () => LAB.lang,
    clock: { T: () => LAB.T, hour: () => hourOf(LAB.T), night: () => world.nightFactor(), dayOf: (T) => Math.floor(T / 600) },
    emit: (e) => LAB.events.push(e),
    assets: {
      manifest: (n) => Assets.lateManifest && Assets.lateManifest[n],
      // the game's Assets.loadFragment(scene, name, { only }) stand-in: late atlases, loaded once, on demand
      fragment: (name, o) => {
        const L = world.load;
        let n = 0;
        for (const k of (o && o.only) || []) {
          const a = Assets.m.atlases[k];
          if (!a || world.textures.exists(k) || LAB.asked.has(k)) continue;
          LAB.asked.add(k); LAB.lateLoads.push(k);
          L.atlas(k, 'assets/' + a.png, 'assets/' + a.json); n++;
        }
        if (n && !L.isLoading()) L.start();
      },
    },
    roads: {
      net: () => roads.rn,
      street: (id) => WORLD.v4.streets.find((s) => s.id === id),
      addStreet: (s, eup, cls) => {
        if (WORLD.v4.streets.some((q) => q.id === s.id)) return false;
        WORLD.v4.streets.push(Object.assign({}, s));
        WORLD.v4.eup[s.id] = eup;
        roads.rn.upgrade(s.id, cls);
        return true;
      },
      upgrade: (id, cls) => roads.rn.upgrade(id, cls),
      tracks: () => roads.tracks(),
    },
    town: {
      walkers: () => town.positions(),
      hurry: (x, y, r) => town.hurry(x, y, r),
      board: (stop, n, line, to) => {
        const q = town.queues[stop] || [];
        const out = [];
        const bus = world.host && world.host.model.sim.list.find((v) => v.role === 'bus' && v.state === 'dwell' && v.lastGoal && v.lastGoal.tag === 'stop:' + stop);
        while (out.length < n && q.length) {
          const w = q.shift();
          w.still = false;
          const door = bus ? doorOf(bus, 1) : { x: w.x + 60, y: w.y + 40 };
          w.path = [{ x: w.x, y: w.y }, door]; w.i = 1; w.done = (ww) => { ww.leaving = true; };
          out.push({ pid: w.id, look: w.rig.spr.person, to: stop === 'S1' ? 'S3' : 'S1' });
        }
        // a few more who were on their way (seated straight away)
        const extra = Math.min(n - out.length, stop === 'S1' ? 1 : 3);
        for (let i = 0; i < extra; i++) out.push({ pid: 'x' + Math.floor(LAB.T * 10) + i, look: 7000 + Math.floor(LAB.T) + i * 13, to: stop === 'S1' ? to[to.length - 1] : (to.indexOf('S1') >= 0 ? 'S1' : to[0]) });
        world.time.delayedCall(4000, () => town.fillStop(stop, stop === 'S1' ? 2 : 3));
        return out;
      },
      alight: (stop, riders) => {
        const bus = world.host && world.host.model.sim.list.find((v) => v.role === 'bus' && v.state === 'dwell' && v.lastGoal && v.lastGoal.tag === 'stop:' + stop);
        if (!bus) return;
        const s = STOPS[stop];
        riders.slice(0, 4).forEach((r, i) => {
          const d = doorOf(bus, 1);
          const away = stop === 'S1' ? [[d.x - 40, d.y + 30], [1830, 950], [1600, 930]] : [[d.x + 30, d.y - 20], [s.x + 140 + i * 30, s.y - 50 - i * 12]];
          world.time.delayedCall(300 + i * 350, () => town.addWalker(r.look, [[d.x, d.y]].concat(away), { fadeIn: true, done: (w) => { w.leaving = true; } }));
        });
      },
    },
    freight: {
      take: (n) => { const q = Math.min(n, world.yardStock); world.yardStock -= q; if (!q) return {}; const a = Math.ceil(q * 0.4), b = Math.ceil(q * 0.3); return { item_plank: a, item_bread: b, item_fish_cooked: q - a - b }; },
      deliver: (to, items) => { for (const k in items) world.delivered[to] = (world.delivered[to] || 0) + items[k]; },
      shopTargets: () => (world.shops || []),
      shelf: (id) => { const s = (world.shops || []).find((q) => q.id === id); return s ? { x: s.x, y: s.y - 60 } : null; },
    },
    homes: () => world.homes,
    flag: () => false,
    rail: { blocking: () => false },
    view: {
      rect: () => cam().worldView,
      zoom: () => LAB.zoom,
      onScreen: (x, y, m = 0) => { const v = cam().worldView; return x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m; },
      toScreen: (x, y) => { const c = cam(), v = c.worldView; return { x: (x - v.x) * c.zoom / View.k, y: (y - v.y) * c.zoom / View.k }; },
      follow: (fn) => { world.followFn = fn; },
    },
    input: { stick: () => LAB.stick },
    chief: {
      x: () => town.chiefPos.x, y: () => town.chiefPos.y,
      hide: (on) => town.hideChief(on),
      place: (x, y) => town.setChief(x, y),
    },
    dolls: { make: (look) => town.rig(look), chief: () => town.chiefRig() },
    fx: { puff: (x, y, s, d) => world.puff(x, y, s, d), kick: (x, y) => world.kick(x, y), fx: world.effects },
    sound: { play: (k) => LAB.sounds.push(k), at: (k) => LAB.sounds.push(k), loop: (k, v) => { LAB.loops = LAB.loops || {}; LAB.loops[k] = v; } },
  };
  return ports;
}

/** the far-side door of a bus (doorPoints[1]; mirrored headings negate dx) */
function doorOf(v, k) {
  const def = Assets.charDef(v.key);
  const flip = v.dk === 'SW' || v.dk === 'NW';
  const base = v.dk === 'SW' ? 'SE' : v.dk === 'NW' ? 'NE' : v.dk;
  const p = def.doorPoints && def.doorPoints[base] ? def.doorPoints[base][k] : [0, 0];
  return { x: v.x + p[0] * (flip ? -1 : 1), y: v.y + p[1] };
}

// ---------------------------------------------------------------------------------------------------- the HUD stand-in
const TXT = (size, color = '#ffffff', stroke = '#2b2f3a', st = 7, weight = '900') => ({ fontFamily: FONT, fontSize: size + 'px', fontStyle: weight, color, stroke, strokeThickness: st, resolution: 2 });

class UI extends Phaser.Scene {
  constructor() { super('UI'); }
  create() {
    View.applyUI(this.cameras.main);
    this.W = View.W; this.H = View.H;
    const top = 62;
    this.coinBar = this.nine('ui_coin_bar', 26, top, 236, 74).setOrigin(0, 0.5);
    const ci = Assets.image(this, 64, top, 'ui_icon_coin'); ci.setScale(64 / ci.frame.realWidth);
    this.add.text(104, top + 2, '12,480', TXT(40)).setOrigin(0, 0.5);
    // the rank chip (v4 HUD position)
    this.rank = this.add.container(188 + 100, top + 152);
    this.rankBg = this.nine('ui_panel', 0, 0, 156, 54).setOrigin(0, 0.5).setAlpha(0.95);
    this.rankBadge = Assets.image(this, 26, 0, 'ui_badge_rank_2'); this.rankBadge.setScale(42 / this.rankBadge.frame.realWidth);
    this.rankT = this.add.text(52, 0, '읍', TXT(22, '#2b2f3a', '#ffffff', 0)).setOrigin(0, 0.5);
    this.rank.add([this.rankBg, this.rankBadge, this.rankT]);
    this.rank.x = 28;
    // the clock
    this.clockG = this.add.graphics();
    this.clockI = Assets.image(this, this.W - 62, top + 92, 'ui_icon_day'); this.clockI.setScale(38 / this.clockI.frame.realWidth);
    // toast + banner (UI.js look)
    this.toastBox = this.add.container(this.W / 2, this.H - 230).setVisible(false).setDepth(50);
    this.toastBg = this.nine('ui_panel', 0, 0, 300, 64).setOrigin(0.5).setTint(0x2b2f3a).setAlpha(0.88);
    this.toastText = this.add.text(0, 0, '', TXT(26, '#ffffff', '#2b2f3a', 0, '800')).setOrigin(0.5);
    this.toastBox.add([this.toastBg, this.toastText]);
    this.bannerBox = this.add.container(this.W / 2, this.H * 0.27).setVisible(false).setDepth(60);
    this.bannerBg = this.nine('ui_button_blue', 0, 0, 520, 150).setOrigin(0.5);
    this.bannerText = this.add.text(0, -22, '', TXT(46, '#ffffff', '#1f4f8f', 10)).setOrigin(0.5);
    this.bannerSub = this.add.text(0, 36, '', TXT(20, '#ffffff', '#1f4f8f', 6, '800')).setOrigin(0.5);
    this.bannerBox.add([this.bannerBg, this.bannerText, this.bannerSub]);
    // the floating joystick (drawn while the lab's stick is held)
    this.joyB = Assets.image(this, 150, this.H - 300, 'ui_joystick_base').setVisible(false).setAlpha(0.9);
    this.joyB.setScale(172 / this.joyB.frame.realWidth);
    this.joyK = Assets.image(this, 150, this.H - 300, 'ui_joystick_knob').setVisible(false);
    this.joyK.setScale(84 / this.joyK.frame.realWidth);
    this.toastT = 0; this.bannerT = 0;
  }
  nine(key, x, y, w, h) { const n = Assets.nine(key); return this.add.nineslice(x, y, n.tex, n.frame, w, h, n.l, n.r, n.t, n.b); }
  toast(m, hold = 1600) { this.toastText.setText(m); this.toastBg.setSize(Math.max(260, this.toastText.width + 60), 64); this.toastBox.setVisible(true).setAlpha(1); this.toastT = hold / 1000; }
  banner(m, s) { this.bannerText.setText(m); this.bannerSub.setText(s || ''); this.bannerBg.setSize(Math.max(480, this.bannerText.width + 80, this.bannerSub.width + 60), s ? 150 : 110); this.bannerBox.setVisible(true).setAlpha(1).setScale(0.6); this.tweens.add({ targets: this.bannerBox, scale: 1, duration: 360, ease: 'Back.easeOut' }); this.bannerT = 3.2; }
  tick(dt) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastBox.setVisible(false); }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.bannerBox.setVisible(false); }
    const r = LAB.rank >= 3;
    this.rankT.setText(r ? (LAB.lang === 'en' ? 'City' : '도시') : (LAB.lang === 'en' ? 'Town' : '읍'));
    if (Assets.has(r ? 'ui_badge_rank_3' : 'ui_badge_rank_2')) Assets.apply(this.rankBadge, r ? 'ui_badge_rank_3' : 'ui_badge_rank_2');
    const h = hourOf(LAB.T), top = 62;
    this.clockG.clear();
    this.clockG.fillStyle(0x1f3354, 0.22); this.clockG.fillCircle(this.W - 62, top + 95, 28); this.clockG.fillStyle(0xfff8ec, 0.95); this.clockG.fillCircle(this.W - 62, top + 92, 28);
    this.clockG.lineStyle(5, 0xffc83d, 1); this.clockG.beginPath(); this.clockG.arc(this.W - 62, top + 92, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (h / 24)); this.clockG.strokePath();
    if (Assets.has(h >= 19 || h < 6 ? 'ui_icon_night' : 'ui_icon_day')) Assets.apply(this.clockI, h >= 19 || h < 6 ? 'ui_icon_night' : 'ui_icon_day');
    const s = LAB.stick, on = Math.hypot(s.x, s.y) > 0.05 && LAB.showJoy;
    this.joyB.setVisible(on); this.joyK.setVisible(on);
    if (on) this.joyK.setPosition(this.joyB.x + s.x * 60, this.joyB.y + s.y * 60);
  }
}

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: Math.round(View.W * View.k),
  height: Math.round(View.H * View.k),
  backgroundColor: '#dbe6f2',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false, roundPixels: false },
  disablePreFX: true,
  banner: false,
  fps: { target: 60 },
  scene: [Boot, Load, World, UI],
});
LAB.game = game;
LAB.View = View;
LAB.dirOf = dirOf;
LAB.doorOf = doorOf;
