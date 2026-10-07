// The village: builds the world from data/world.js, runs every entity and system,
// saves/loads, and installs the window.__FV test hooks.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { Input } from '../core/Input.js';
import { Save, Settings } from '../core/Save.js';
import { isoPt, isoRect, gdist, gdist2, inIsoRect } from '../core/Iso.js';
import { BALANCE } from '../data/balance.js';
import { WORLD } from '../data/world.js';
import { FONT, t } from '../data/strings.js';
import { DEPTH, DepthSort } from '../systems/DepthSort.js';
import { Collision, shoreY } from '../systems/Collision.js';
import { Effects } from '../systems/Effects.js';
import { Ground } from '../systems/Ground.js';
import { Economy } from '../systems/Economy.js';
import { Progression, STEPS } from '../systems/Progression.js';
import { Tutorial, PRODUCT_ZONE } from '../systems/Tutorial.js';
import { Player } from '../entities/Player.js';
import { Worker, Porter } from '../entities/Worker.js';
import { Roads } from '../systems/Roads.js';
import { VillageLife } from '../systems/VillageLife.js';
import { Occlusion } from '../systems/Occlusion.js';
import { Animal } from '../entities/Animal.js';
import { Station } from '../entities/Station.js';
import { Market, TradePost, FOODS, GOODS } from '../entities/Seller.js';
import { Tree, Rock, Wheat, Net } from '../entities/ResourceNode.js';
import { TrashPad } from '../entities/TrashPad.js';
import { rng } from '../core/Placeholders.js';
import { View } from '../core/View.js';
// (v3) territory, construction, production chains
import { Territory } from '../systems/Territory.js';
import { Logistics, PRIO } from '../systems/Logistics.js';
import { Site, buildCost } from '../entities/Site.js';
import { Workshop, Smith } from '../entities/Workshop.js';
import { Warehouse } from '../entities/Warehouse.js';
import { WarehousePorter, RawPorter } from '../entities/Worker.js';
// (v3.5) division of labour: station work spots + operators, collection piles
import { OperatorSpot, Pile, PILE_OF_STATION } from '../systems/Labour.js';
import { DogPlay } from '../systems/DogPlay.js';
import { House } from '../entities/House.js';
import { FoodBox } from '../entities/FoodBox.js';
import { Tower } from '../entities/Tower.js';
import { Boathouse } from '../entities/Boathouse.js';
import { BUILD_UNLOCK, UNIQUE_BUILDINGS } from '../systems/Progression.js';
import { STORE_GOODS, TOOLS, MATERIALS } from '../data/items.js';

// obstacle radius (ground space px) for static decor
const DECOR_R = {
  barrel: 20, crate: 26, lamp_post: 12, flag_pole: 14, bench: 40, firewood_pile: 36, hay_bale: 30, signpost: 12,
  campfire: 30, bush_snow: 24, ice_chunk: 0, snow_pile_a: 0, snow_pile_b: 0, tent_a: 80, chief_lodge: 170,
  worker_hut: 98, dock_pier: 0, boat_small: 0, mine_entrance: 120, tree_stump: 18, upgrade_bench: 70,
};

/** (v3.5) clearings for the collection piles (trees and decor keep away) */
function pileSpots() {
  const out = [];
  const P = (WORLD.labour && WORLD.labour.piles) || {};
  for (const id in P) out.push([P[id].x, P[id].y, 125]);
  return out;
}

class UIProxy {
  constructor(game) { this.game = game; }
  get s() { const s = this.game.scene.getScene('UI'); return s && s.ready && s.sys.isActive() ? s : null; }
  setCoins(v, ms) { const s = this.s; if (s) s.setCoins(v, ms); }
  coinFly(wx, wy, n) { const s = this.s; if (s) s.coinFly(wx, wy, n); }
  toast(msg) { const s = this.s; if (s) s.toast(msg); }
  banner(msg, sub) { const s = this.s; if (s) s.banner(msg, sub); }
  setObjective(key, tg, text) { const s = this.s; if (s) s.setObjective(key, tg, text); }
  celebrate(v3) { const s = this.s; if (s) s.celebrate(v3); }
  openBuildMenu(site) { const s = this.s; if (s && s.openBuildMenu) s.openBuildMenu(site); }
  setPopulation(n, cap, waiting) { const s = this.s; if (s && s.setPopulation) s.setPopulation(n, cap, waiting); }
  zoomChanged() { const s = this.s; if (s && s.zoomChanged) s.zoomChanged(); }
}

export class Game extends Phaser.Scene {
  constructor() { super('Game'); }

  init(data) { this.fresh = !!(data && data.fresh); }

  create() {
    this._broken = false;
    try {
      this.build();
    } catch (e) {
      this._broken = true;
      // a save that cannot be restored must never brick the game: keep a copy aside and start fresh
      console.error('[FrostVillage] could not restore the saved game, starting fresh:', e);
      if (this.fresh) throw e;
      Save.quarantine();
      this.time.delayedCall(0, () => this.scene.restart({ fresh: true }));
    }
  }

  build() {
    const W = WORLD.width, H = WORLD.height;
    this.W = W; this.H = H;
    this.font = FONT;
    this.ui = new UIProxy(this.game);
    this.saved = this.fresh ? null : Save.load();
    const sv = this.saved || {};

    this.collision = new Collision(W, H);
    this.effects = new Effects(this);
    this.depthSort = new DepthSort();
    this.agents = [];          // moving characters (workers, customers) for separation
    this.workers = [];
    this.porters = [];
    this.zones = {};
    this.zoneObjs = {};
    this.statics = [];
    this.keysInUse = new Set();   // character looks taken by clerks / porters (residents and customers avoid them)
    this.roads = new Roads((z) => !!(this.zones[z] && this.zones[z].unlocked), undefined, (r) => !this.territory || this.territory.isOpen(r));
    this.roads.blocked = (x, y) => !!(this.collision && this.collision.blocked(x, y, 12));
    // (v3) who needs what (porters ask), the pictures that arrive after the title
    this.logistics = new Logistics(this);
    this.lazyImgs = [];
    const onArrive = (key) => this.onAssetArrived(key);
    Assets.arrivals.push(onArrive);
    this.events.once('shutdown', () => { const i = Assets.arrivals.indexOf(onArrive); if (i >= 0) Assets.arrivals.splice(i, 1); });
    this.sites = {};
    this.workshops = [];
    this.houses = [];
    this.towers = {};
    this.warehouse = null;
    this.boathouse = null;
    this.store = null;
    this.built = {};              // building key -> count finished
    this.piles = {};              // (v3.5) collection piles of the production lines
    this.rawPorters = [];         // (v3.5) pile -> station porters

    this.ground = new Ground(this);
    this.territory = new Territory(this, sv.territory);
    this.buildZones();
    // roads inside zones: their own picture, shown when the zone opens
    for (const id in this.zones) {
      const ov = this.ground.roadOverlay(id, this.roads.drawn(id));
      this.zones[id].roads = ov;
      if (ov && !this.zones[id].unlocked) ov.setAlpha(0);
    }
    // (v3) roads of the new land: their own picture, shown when the fog clears
    this.regionRoads = {};
    for (const id in this.territory.regions) {
      if (id === 'start') continue;
      const ov = this.ground.roadOverlay('region_' + id, this.roads.drawn(null, id));
      this.regionRoads[id] = ov;
      if (ov && !this.territory.isOpen(id)) ov.setAlpha(0);
    }
    this.buildFences();
    this.buildDecor();
    this.buildTrees();
    this.buildResources();
    this.buildStations();
    this.buildLabour();
    this.buildSellers();
    this.buildHuts();
    this.buildV3();

    const ps = sv.player || {};
    const okPos = Number.isFinite(ps.x) && Number.isFinite(ps.y) && ps.x >= 40 && ps.x <= W - 40 && ps.y >= 0 && ps.y <= H - 40;
    const sp = { x: okPos ? ps.x : WORLD.player.x, y: okPos ? ps.y : WORLD.player.y };
    if (okPos) this.collision.resolve(sp, 16);
    const px = sp.x, py = sp.y;
    this.player = new Player(this, px, py);
    this.economy = new Economy(this, sv.coins !== undefined ? sv.coins : BALANCE.start.coins);
    this.progress = new Progression(this, sv.progress);
    this.tutorial = new Tutorial(this);

    // lock zones that are not open yet
    for (const id in this.zones) if (!this.zones[id].unlocked) this.setZoneEnabled(id, false);
    // (v3) construction sites and buildings come back before the steps that use them (porters, boats...)
    this.restoreV3(sv);
    this.progress.init();
    this.restore(sv);
    this.restoreV3Stock(sv);
    this.restoreLabour(sv);
    this.events.on('sold', () => this.progress.setFlag('firstSale'));
    this.events.on('traded', () => this.progress.setFlag('firstTrade'));
    // spots residents never stand on (pads)
    this.padSpots = [];
    const spot = (pd, r) => { if (pd) this.padSpots.push({ x: pd.x, y: pd.y, r }); };
    for (const st of this.stationList) { spot(st.inPad, 70); spot(st.outPad, 70); if (st.op) { spot(st.op, 64); spot(st.op.post, 40); } }
    for (const id in this.piles) spot(this.piles[id], 80);
    spot(this.market.shelf, 70); spot(this.market.cash.pad, 70); spot(this.market.register, 64);
    spot(this.trade.shelf, 70); spot(this.trade.cash.pad, 70); spot(this.trade.register, 64); spot(this.trash, 64);
    spot(WORLD.net.gather ? { x: WORLD.net.x + WORLD.net.gather[0], y: WORLD.net.y + WORLD.net.gather[1] } : null, 70);
    for (const id in WORLD.pads) spot(WORLD.pads[id], 90);
    // (v3) plots / their drop pads, the food box, second-worker pads, watchtower pads, the new buildings' pads
    for (const id in this.sites) { const st = this.sites[id]; spot({ x: st.dropX, y: st.dropY }, 80); spot(st, (st.def.footprint || [272])[0] * 0.5); }
    for (const id in WORLD.pads2 || {}) spot(WORLD.pads2[id], 90);
    for (const id in WORLD.towers || {}) spot(WORLD.towers[id], 120);
    if (this.foodBox) spot(this.foodBox, 80);
    this.events.on('built', (k, site) => { const b = site.built; if (b && b.inPad) spot(b.inPad, 70); if (b && b.outPad) spot(b.outPad, 70); if (b && b.op) { spot(b.op, 64); spot(b.op.post, 40); } });
    this.events.on('storeSold', () => this.progress.setFlag('firstStoreSale'));
    this.events.on('built', (k) => { if (k === 'toolsmith') this.time.delayedCall(3500, () => this.introduceFood()); });
    this.events.on('fedMiners', () => this.progress.setFlag('fedMiners'));
    // the people of the village (v2)
    this.life = new VillageLife(this, sv.life);
    // (v3.5) Kongi the dog: whistle, treats, fetch, petting (affection is saved)
    this.dog = new DogPlay(this, sv.dog);
    this.occlusion = new Occlusion(this);
    this.updatePopulation();

    // ambient snowfall around the camera
    this.snow = this.effects.emitter('snowfall');
    this.snow.setDepth(DEPTH.FX - 10);
    this.snowT = 0;

    // camera (v3: bounded to the open land, plus a peek at the fog)
    const cam = this.cameras.main;
    const cb = this.territory.camRect || { x: 0, y: 0, w: W, h: H };
    cam.setBounds(cb.x, cb.y, cb.w, cb.h);
    this.zoomBase = BALANCE.camera.zoom;
    // (v2) player zoom: pinch / wheel / +- buttons / overview (smoothly follows zoomTarget)
    const savedZoom = Settings.data.zoom;
    this.zoomTarget = Number.isFinite(savedZoom) ? Phaser.Math.Clamp(savedZoom, BALANCE.camera.zoomMin, BALANCE.camera.zoomMax) : this.zoomBase;
    this.zoomCur = this.zoomTarget;
    this.overview = false;
    cam.setZoom(this.zoomCur * View.k);
    // the canvas resolution (View.k) can change on rotation / resize
    const onResize = () => cam.setZoom(this.zoomCur * View.k);
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));
    cam.setBackgroundColor('#dbe6f2');
    const tv = this.tutorial.inTutorial && WORLD.tutorialView && gdist(px, py, WORLD.tutorialView[0], WORLD.tutorialView[1]) < 500 ? WORLD.tutorialView : null;
    this.camTarget = tv ? { x: tv[0], y: tv[1] } : { x: px, y: py - 20 };
    this.camFocus = null;     // { x, y, until } temporary pan target
    cam.startFollow(this.camTarget, false, 1, 1);
    cam.centerOn(this.camTarget.x, this.camTarget.y);
    // (v3) bake the ground the first view needs right away (the rest is baked as the camera moves)
    {
      const vw = cam.width / (this.zoomCur * View.k), vh = cam.height / (this.zoomCur * View.k);
      this.ground.ensure({ x: this.camTarget.x - vw / 2, y: this.camTarget.y - vh / 2, right: this.camTarget.x + vw / 2, bottom: this.camTarget.y + vh / 2 }, Infinity, 200);
    }

    this.padT = 0;
    this.playerOnPad = false;
    this.saveT = 0;
    this.ambT = 0;

    Input.attachKeyboard(this);
    if (window.__FV_DEBUG) {
      this.input.keyboard.on('keydown-M', () => this.economy.add(1000));
    }

    this.onVis = () => { if (document.visibilityState === 'hidden') { this.save(true); Input.release(); } };
    this.onHide = () => this.save(true);
    document.addEventListener('visibilitychange', this.onVis);
    window.addEventListener('pagehide', this.onHide);
    this.events.once('shutdown', () => { document.removeEventListener('visibilitychange', this.onVis); window.removeEventListener('pagehide', this.onHide); });

    this.installHooks();
    this.scene.launch('UI');
    Audio.playMusic('bgm_village');
    Audio.setAmbience('amb_wind', 0.5);
    Audio.setAmbience('amb_sea', 0.3);
    Audio.setAmbience('amb_fire', 0);
    this.loadDeferredAudio();
  }

  /**
   * Left out of the preload (faster title), fetched now in the background: village music + ambience
   * and the villager / building atlases (residents appear as their art arrives).
   */
  loadDeferredAudio() {
    const want = Object.keys(Assets.m.audio).filter((k) => Assets.isDeferredAudio(k) && !this.cache.audio.exists(k) && !Assets.failed.has(k));
    this.load.on('loaderror', (f) => Assets.onLoadError(f, this.load));
    // residents who live here already come first
    const first = ((this.life && this.life.moved) || []).concat(['npc_clerk_a', 'npc_clerk_b', 'npc_porter_a', 'npc_porter_b']);
    // (v3) the building / construction / boat pictures come first (small, and plots may be on screen)
    const n = Assets.queueLazy(this.load, first, ['bld_sites', 'bld_buildings', 'bld_buildings_2', 'boat_rowboat', 'boat_fishing']);
    if (want.length) Assets.queueAudio(this.load, (k) => want.indexOf(k) >= 0);
    if (!want.length && !n) return;
    const onFile = (key) => { try { Assets.onLazyFile(key); } catch (e) { /* keep loading */ } };
    this.load.on('filecomplete', onFile);
    this.events.once('shutdown', () => this.load.off('filecomplete', onFile));
    this.load.once('complete', () => { this.load.off('filecomplete', onFile); Audio.trimLoops(); Audio.applyMusic(); });
    this.load.start();
  }

  // ------------------------------------------------------------------ building
  buildZones() {
    for (const id in WORLD.zones) {
      const z = WORLD.zones[id];
      const floor = this.ground.zoneFloor(id, z);
      const unlocked = !z.unlock;
      this.zones[id] = { id, cfg: z, floor, unlocked, outline: null };
      this.zoneObjs[id] = [];
      if (!unlocked) {
        floor.setAlpha(0);
        this.zones[id].outline = this.makeLockedOutline(id, z);
      }
      // (v3) a field / quarry of the new land: appears with its land
      if (z.region) this.territory.add(z.region, floor);
    }
  }

  makeLockedOutline(id, z) {
    const g = this.add.graphics().setDepth(DEPTH.OUTLINE);
    const pts = isoRect(z.center[0], z.center[1], z.size[0], z.size[1]);
    // faint frosted fill
    g.fillStyle(0xc9d6e8, 0.28);
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < 4; i++) g.lineTo(pts[i].x, pts[i].y); g.closePath(); g.fillPath();
    // dashed border
    g.lineStyle(5, 0xffffff, 0.9);
    for (let i = 0; i < 4; i++) {
      const a = pts[i], b = pts[(i + 1) % 4];
      const len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.floor(len / 26);
      for (let k = 0; k < n; k += 2) {
        const t0 = k / n, t1 = Math.min(1, (k + 1) / n);
        g.lineBetween(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0, a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
      }
    }
    // a frosted preview of what is inside (station + a few resources), so the zone is not an empty void
    const ghosts = [];
    const ghost = (key, x, y, sc) => {
      if (!Assets.has(key)) return;
      const im = Assets.image(this, x, y, key).setAlpha(0.2).setTint(0x9fb3cc).setDepth(DEPTH.OUTLINE + 1 + y * 0.01);
      if (sc) im.setScale(sc);
      ghosts.push(im);
    };
    const [zx, zy] = z.center;
    for (const st of WORLD.stations) if (st.zone === id) ghost(st.sprite, st.x, st.y);
    if (id === 'forest') for (const [mx, my, k] of [[-1.6, 1.0, 'tree_pine_a'], [1.4, -1.8, 'tree_pine_snow'], [-2.6, -1.6, 'tree_pine_b'], [0.2, -3.0, 'tree_pine_a']]) { const p = isoPt(zx, zy, mx, my); ghost(k, p.x, p.y, 0.85); }
    if (id === 'farm') { const w = WORLD.wheat; for (const [i, j] of [[0, 0], [1, 1], [2, 0], [0, 2]]) { const p = isoPt(w.origin[0], w.origin[1], (i - 1) * w.step, (j - 1) * w.step); ghost('crop_wheat_3', p.x, p.y); } }
    if (id === 'mine') for (const [x, y, k] of WORLD.rocks.slice(0, 4)) ghost(k, x, y);
    if (id === 'hunt') for (const [mx, my, k] of [[2.6, -2.8, 'hay_bale'], [-2.8, -2.6, 'bush_snow'], [3.2, 0.4, 'bush_snow']]) { const p = isoPt(zx, zy, mx, my); ghost(k, p.x, p.y); }
    const lock = Assets.image(this, zx, zy - 14, 'ui_icon_lock').setDepth(DEPTH.PAD_TEXT);
    const lf = lock.frame; lock.setScale(60 / Math.max(lf.realWidth, 1)).setOrigin(0.5, 0.5).setAlpha(0.95);
    const txt = this.add.text(zx, zy + 34, t(z.name), { fontFamily: FONT, fontSize: '34px', fontStyle: '900', color: '#ffffff', stroke: '#4a5a72', strokeThickness: 8, resolution: 2 }).setOrigin(0.5, 0.5).setDepth(DEPTH.PAD_TEXT).setAlpha(0.97);
    return { g, lock, txt, ghosts };
  }

  addToZone(zone, obj) { if (zone && this.zoneObjs[zone]) this.zoneObjs[zone].push(obj); }

  staticImage(key, x, y, opts = {}) {
    const img = Assets.image(this, x, y, key).setDepth(y + (opts.depthOff || 0));
    if (opts.flip) img.setFlipX(true);
    if (opts.scale) { img.setScale(opts.scale); img.__bs = opts.scale; }
    const r = opts.r !== undefined ? opts.r : DECOR_R[key];
    let ob = null;
    // a flipped picture is mirrored inside its frame box: its foot (and so its collider) moves too
    const fx = opts.flip ? x + (img.frame.realWidth - 2 * img.displayOriginX) * (opts.scale || 1) : x;
    if (r) ob = this.collision.add(fx, y, r * (opts.scale || 1), key);
    img.__ob = ob;
    if (opts.zone) this.addToZone(opts.zone, img);
    if (opts.region && this.territory) this.territory.add(opts.region, img);
    this.statics.push(img);
    if (/^tree_pine|lodge|hut|tent|mine_entrance|market|trade_post|station_/.test(key)) this.addOccluder(img);
    return img;
  }

  /** tall things fade out when the player walks behind them */
  addOccluder(img) {
    const h = img.displayHeight * img.originY;
    const w = img.displayWidth;
    // x / hw: the picture's box (a quick pre-test; the alpha mask decides)
    (this.occluders || (this.occluders = [])).push({ img, x: img.x + (0.5 - img.originX) * w, y: img.y, hw: w * 0.5, top: h * 0.95, a: 1, big: w > 250 });
  }

  buildFences() {
    // posts shared by two edges / zones are placed once (a doubled post doubles its baked shadow)
    const posts = new Set();
    const post = (x, y, zone) => {
      const k = Math.round(x / 6) + ',' + Math.round(y / 6);
      if (posts.has(k)) return;
      posts.add(k);
      this.staticImage('fence_post', x, y, { zone, r: 16 });
    };
    for (const f of WORLD.fences) {
      const z = WORLD.zones[f.zone];
      const [cx, cy] = z.center;
      const hw = z.size[0] / 2, hh = z.size[1] / 2;
      const gated = z.unlock ? f.zone : null;
      // edge definitions: start point (local m), direction axis, length
      const E = {
        tl: { sx: -hw, sy: -hh, ax: 'y', len: z.size[1] },   // left -> top   (along +Y)
        tr: { sx: -hw, sy: hh, ax: 'x', len: z.size[0] },    // top -> right  (along +X)
        bl: { sx: -hw, sy: -hh, ax: 'x', len: z.size[0] },   // left -> bottom(along +X)
        br: { sx: hw, sy: -hh, ax: 'y', len: z.size[1] },    // bottom -> right (along +Y)
      };
      for (const e in f.edges) {
        const d = E[e], gaps = f.edges[e];
        const n = Math.floor(d.len);
        const off = (d.len - n) / 2;
        let lastIn = false;
        for (let i = 0; i < n; i++) {
          const m = off + i + 0.5;
          const inGap = gaps.some((g) => m >= g[0] && m <= g[1]);
          const mx = d.sx + (d.ax === 'x' ? m : 0), my = d.sy + (d.ax === 'y' ? m : 0);
          const p = isoPt(cx, cy, mx, my);
          if (inGap) {
            if (lastIn) { // cap the run with a post
              const q = isoPt(cx, cy, d.sx + (d.ax === 'x' ? m - 0.5 : 0), d.sy + (d.ax === 'y' ? m - 0.5 : 0));
              post(q.x, q.y, gated);
            }
            lastIn = false;
            continue;
          }
          if (!lastIn && i > 0) {
            const q = isoPt(cx, cy, d.sx + (d.ax === 'x' ? m - 0.5 : 0), d.sy + (d.ax === 'y' ? m - 0.5 : 0));
            post(q.x, q.y, gated);
          }
          this.staticImage(d.ax === 'x' ? 'fence_log_x' : 'fence_log_y', p.x, p.y, { zone: gated, r: 22 });
          lastIn = true;
        }
        // end posts
        const s = isoPt(cx, cy, d.sx, d.sy);
        const ePt = isoPt(cx, cy, d.sx + (d.ax === 'x' ? d.len : 0), d.sy + (d.ax === 'y' ? d.len : 0));
        if (!gaps.some((g) => g[0] <= 0.6)) post(s.x, s.y, gated);
        if (!gaps.some((g) => g[1] >= d.len - 0.6)) post(ePt.x, ePt.y, gated);
      }
    }
  }

  buildDecor() {
    for (const d of WORLD.decor) {
      const [key, x, y, o] = d;
      const img = this.staticImage(key, x, y, o || {});
      if (key === 'campfire') {
        const fire = this.effects.loop('fx_fire', x, y - 14, 58, y + 1);
        if (fire) { if (o && o.zone) this.addToZone(o.zone, fire); if (o && o.region) this.territory.add(o.region, fire); }
        else this.fireSpots = (this.fireSpots || []).concat([{ x, y, zone: o && o.zone }]);
        this.campfires = (this.campfires || []).concat([{ x, y }]);
      }
      if (key === 'lamp_post') this.lamps = (this.lamps || []).concat([img]);
      // things floating in the sea bob gently
      if ((key === 'boat_small' || key === 'ice_chunk') && y < shoreY(x) + 10) {
        this.tweens.add({ targets: img, y: y + 4, angle: { from: -1.5, to: 1.5 }, duration: 1600 + (x % 7) * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: (x % 5) * 200 });
      }
    }
  }

  /** true if a decorative tree at (x, y) would sit inside a zone, on a path or on gameplay objects */
  blockedForDecor(x, y) {
    for (const id in WORLD.zones) {
      const z = WORLD.zones[id];
      if (inIsoRect(x, y, z.center[0], z.center[1], z.size[0] + 1.6, z.size[1] + 1.6)) return true;
      // the canopy (~1.5-2.5 m above the trunk on screen) must not cover the zone either
      if (inIsoRect(x, y - 90, z.center[0], z.center[1], z.size[0] + 0.6, z.size[1] + 0.6)) return true;
      if (inIsoRect(x, y - 170, z.center[0], z.center[1], z.size[0], z.size[1])) return true;
    }
    for (const pts of WORLD.allPaths || WORLD.paths) {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy;
        const tt = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2));
        if (Math.hypot(ax + vx * tt - x, ay + vy * tt - y) < 75) return true;
      }
    }
    const spots = [[WORLD.net.x, WORLD.net.y, 170], [WORLD.player.x, WORLD.player.y, 120]];
    for (const id in WORLD.pads) { const p = WORLD.pads[id]; spots.push([p.x, p.y, 120]); if (p.hut) spots.push([p.hut[0], p.hut[1], 150]); }
    for (const d of WORLD.decor) if (/lodge|tent|pier|flag|campfire/.test(d[0])) spots.push([d[1], d[2], d[0] === 'chief_lodge' ? 230 : 120]);
    // (v3) building plots, watchtowers, pads of the new chains: room for the building and its pads
    const PR = { S: 190, M: 250, L: 310 };
    // (a pine in front of a plot would hide its pad and label behind its canopy)
    for (const id in WORLD.plots || {}) { const p = WORLD.plots[id]; spots.push([p.x, p.y, PR[p.size] || 250]); spots.push([p.x, p.y + 100, 150]); spots.push([p.x, p.y + 220, 200]); }
    for (const id in WORLD.towers || {}) { const p = WORLD.towers[id]; spots.push([p.x, p.y, 170]); spots.push([p.x, p.y + 70, 130]); spots.push([p.x, p.y + 190, 160]); }
    for (const id in WORLD.pads2 || {}) { const p = WORLD.pads2[id]; spots.push([p.x, p.y, 120]); }
    if (WORLD.foodBox) spots.push([WORLD.foodBox.x, WORLD.foodBox.y, 140]);
    for (const q of pileSpots()) spots.push(q);
    for (const [sx, sy, r] of spots) if (gdist(x, y, sx, sy) < r) return true;
    return false;
  }

  buildTrees() {
    // decorative border forest
    const r = rng(1234);
    const kinds = ['tree_pine_a', 'tree_pine_b', 'tree_pine_snow', 'tree_pine_snow'];
    for (const [x0, y0, x1, y1, step, region] of WORLD.borderTrees) {
      let row = 0;
      for (let y = y0; y <= y1; y += step * 0.55, row++) {
        for (let x = x0; x <= x1; x += step) {
          const x2 = x + (r() - 0.5) * step * 0.6 + ((row % 2) * step) / 2;
          const y2 = y + (r() - 0.5) * step * 0.3;
          const k = kinds[Math.floor(r() * kinds.length)], fl = r() < 0.5, sc = 0.9 + r() * 0.25;
          if (y2 < shoreY(x2) + 40 || this.blockedForDecor(x2, y2) || x2 > this.W - 20 || y2 > this.H) continue;
          this.staticImage(k, x2, y2, { r: 24, flip: fl, scale: sc, region: region || this.territory.regionAt(x2, y2) });
        }
      }
    }
    for (const [x, y, k, region] of WORLD.extraTrees) if (!this.blockedForDecor(x, y)) this.staticImage(k, x, y, { r: 24, flip: x % 2 === 0, region: region || null });
  }

  buildResources() {
    // net (start zone)
    const n = WORLD.net;
    this.net = new Net(this, n.x, n.y, n);
    // forest trees on a jittered iso grid
    this.trees = [];
    const tz = WORLD.zones[WORLD.trees.zone];
    const cfg = WORLD.trees;
    const r = rng(77);
    const kinds = ['tree_pine_a', 'tree_pine_snow', 'tree_pine_b'];
    const hw = tz.size[0] / 2 - cfg.margin, hh = tz.size[1] / 2 - cfg.margin;
    for (let mx = -hw; mx <= hw + 0.01; mx += cfg.grid) {
      for (let my = -hh; my <= hh + 0.01; my += cfg.grid) {
        const p = isoPt(tz.center[0], tz.center[1], mx + (r() - 0.5) * cfg.jitter, my + (r() - 0.5) * cfg.jitter);
        if (cfg.avoid.some(([ax, ay, ar]) => gdist(p.x, p.y, ax, ay) < ar)) continue;
        if (r() < 0.12) continue;
        // the zone's far-left corner runs into the border pines: a chief chopping there would vanish
        if (mx + my < (cfg.cornerCut !== undefined ? cfg.cornerCut : -1e9)) continue;
        // (v3.5) the collection pile of the wood line keeps a clearing
        if (pileSpots().some(([ax, ay]) => gdist(p.x, p.y, ax, ay) < 80)) continue;
        const tr = new Tree(this, p.x, p.y, kinds[Math.floor(r() * kinds.length)]);
        if (cfg.scale) { tr.img.setScale(cfg.scale); tr.img.__bs = cfg.scale; tr.scale = cfg.scale; }
        this.addOccluder(tr.img);
        this.trees.push(tr);
        this.addToZone(WORLD.trees.zone, tr);
      }
    }
    // (v3.5) a few more pines of the forest
    for (const [mx, my] of cfg.extra || []) {
      const p = isoPt(tz.center[0], tz.center[1], mx, my);
      const tr = new Tree(this, p.x, p.y, kinds[Math.floor((mx * 7 + my * 3 + 9) % 3)]);
      if (cfg.scale) { tr.img.setScale(cfg.scale); tr.img.__bs = cfg.scale; tr.scale = cfg.scale; }
      this.addOccluder(tr.img);
      this.trees.push(tr);
      this.addToZone(WORLD.trees.zone, tr);
    }
    // ore rocks
    this.rocks = [];
    for (const [x, y, k] of WORLD.rocks) { const rk = new Rock(this, x, y, k); this.rocks.push(rk); this.addToZone('mine', rk); }
    // wheat plots
    this.wheat = [];
    const w = WORLD.wheat;
    for (let i = 0; i < w.rows; i++) {
      for (let j = 0; j < w.cols; j++) {
        const p = isoPt(w.origin[0], w.origin[1], (i - (w.rows - 1) / 2) * w.step, (j - (w.cols - 1) / 2) * w.step);
        const wh = new Wheat(this, p.x, p.y);
        this.wheat.push(wh);
        this.addToZone(w.zone, wh);
      }
    }
    // (v3) the new land's pines, ore rocks and second wheat field (appear when the fog clears)
    for (const [x, y, k, region] of WORLD.regionTrees || []) {
      const tr = new Tree(this, x, y, k);
      tr.img.setScale(0.9); tr.img.__bs = 0.9; tr.scale = 0.9;
      this.addOccluder(tr.img);
      this.trees.push(tr);
      this.territory.add(region, tr);
    }
    for (const [x, y, k] of WORLD.regionRocks || []) { const rk = new Rock(this, x, y, k); this.rocks.push(rk); this.territory.add(this.territory.regionAt(x, y), rk); }
    const w2 = WORLD.regionWheat;
    if (w2) {
      const reg = (WORLD.zones[w2.zone] && WORLD.zones[w2.zone].region) || this.territory.regionAt(w2.origin[0], w2.origin[1]);
      for (let i = 0; i < w2.rows; i++) {
        for (let j = 0; j < w2.cols; j++) {
          const p = isoPt(w2.origin[0], w2.origin[1], (i - (w2.rows - 1) / 2) * w2.step, (j - (w2.cols - 1) / 2) * w2.step);
          const wh = new Wheat(this, p.x, p.y);
          this.wheat.push(wh);
          this.territory.add(reg, wh);
        }
      }
    }
    // animals
    this.animals = [];
    const hz = WORLD.zones[WORLD.hunt.zone];
    const A = BALANCE.resources.animal;
    for (let i = 0; i < A.deer + A.boar; i++) {
      const a = new Animal(this, i < A.deer ? 'deer' : 'boar', hz);
      this.animals.push(a);
      this.addToZone(WORLD.hunt.zone, a);
    }
  }

  buildStations() {
    this.stations = {};
    this.stationList = [];
    this.stationByInput = {};
    for (const c of WORLD.stations) {
      const s = new Station(this, c);
      this.stations[c.id] = s;
      this.stationByInput[c.input] = s;
      this.stationList.push(s);
      if (WORLD.zones[c.zone].unlock) this.addToZone(c.zone, s);
    }
  }

  /** (v3.5) the work spot of every station and the collection pile of every production line */
  buildLabour() {
    const L = WORLD.labour || {};
    for (const st of this.stationList) {
      st.op = new OperatorSpot(this, st, (L.ops || {})[st.id]);
      if (!this.zones[st.cfg.zone] || !this.zones[st.cfg.zone].unlocked) st.op.setEnabled(false);
    }
    for (const id in L.piles || {}) {
      const cfg = L.piles[id];
      const pile = new Pile(this, id, cfg);
      this.piles[id] = pile;
      if (cfg.zone && WORLD.zones[cfg.zone] && WORLD.zones[cfg.zone].unlock) this.addToZone(cfg.zone, pile);
    }
  }

  /** (v3.5) the station / workshop with this id */
  stationById(id) { return this.stations[id] || this.workshops.find((w) => w.kind === id) || null; }

  /** (v3.5) hire the operator of station `id` (it walks from the hire pad to the work spot) */
  hireOperator(id, instant, x, y) {
    const st = this.stationById(id);
    if (!st || !st.op) return null;
    const op = st.op.hire(instant, x, y);
    if (!instant) { this.focusCamera(st.x, st.y - 40, 1600); this.time.delayedCall(900, () => { if (this.life && op.alive) this.life.bubbles.emote(op, Assets.pick('emote_thumbs', 'emote_heart'), 1.6); }); }
    return op;
  }

  /** (v3.5) the pile of station `id`'s line (shown once something is collected there) */
  pileFor(id) { return this.piles[PILE_OF_STATION[id]] || null; }

  /** (v3.5) hire the raw porter of station `id` (pile -> station input) */
  hireRawPorter(id, instant, x, y) {
    const st = this.stations[id], pile = this.pileFor(id);
    if (!st || !pile) return null;
    if (!pile.shown) pile.setShown(true, !instant);
    const home = RawPorter.homeFor(this, pile);
    const pr = new RawPorter(this, pile, st, x !== undefined && !instant ? x : home[0], y !== undefined && !instant ? y : home[1], this.rawPorters.length);
    this.rawPorters.push(pr);
    if (this.life) this.life.release(pr.key);
    if (!instant) {
      this.effects.sheet('fx_poof', pr.x, pr.y - 30, { size: 180 });
      this.effects.burst('star', pr.x, pr.y - 40, 12);
      pr.sprite.setScale(0.1);
      this.tweens.add({ targets: pr.sprite, scale: 1, duration: 450, ease: 'Back.easeOut' });
    }
    return pr;
  }

  /** (v3.5) the look of the `index`-th worker of a profession: base, then its variants (workers manifest
   *  professions{}); a look reserved for a station operator (the toolsmith's old miner) is skipped */
  workerKey(type, index) {
    const order = (Assets.professions && Assets.professions[type]) || [type];
    const reserved = new Set(Object.values((WORLD.labour && WORLD.labour.ops) || {}).map((o) => o.who));
    const list = order.filter((k) => k === type || (!reserved.has(k) && Assets.m.characters[k]));
    if (!list.length) return type;
    return list[Math.max(0, index) % list.length];
  }

  /** (v3.5) operators, work spots and collection piles; true while the chief stands on one of them */
  updateLabour(dt) {
    let on = false;
    for (const s of this.stationList) if (s.op && s.op.update(dt)) on = true;
    for (const w of this.workshops) if (w.op && w.op.update(dt)) on = true;
    const p = this.player, ready = this.padT <= 0;
    for (const id in this.piles) {
      const pl = this.piles[id];
      if (pl.update(dt)) {
        on = true;
        // the chief takes the catch from the pile (like an output pad)
        if (ready) { if (pl.takeTo(p, p.capacity)) this.padT = BALANCE.player.padItemInterval; else if (pl.count > 0 && p.room <= 0) p.warnFull(); }
      }
    }
    return on;
  }

  /** (v3.5) piles + what raw porters carry */
  restoreLabour(sv) {
    const L = sv.labour || {};
    for (const id in this.piles) {
      const pl = this.piles[id];
      const n = L.piles && L.piles[id];
      if (n) pl.restore(n);
      // a pile is there once its line's gatherer works (or something lies on it)
      if (!pl.shown && (n > 0 || this.workers.some((w) => w.pile === pl) || this.rawPorters.some((r) => r.pile === pl))) pl.setShown(true);
    }
  }

  buildSellers() {
    this.market = new Market(this, WORLD.market);
    this.trade = new TradePost(this, WORLD.trade);
    this.addToZone(WORLD.trade.zone, this.trade);
    this.trash = new TrashPad(this, WORLD.trash);
    const b = WORLD.bench;
    this.bench = this.staticImage(b.sprite, b.x, b.y, {});
    this.bench.setVisible(false);
    if (this.bench.__ob) this.bench.__ob.active = false;
  }

  buildHuts() {
    for (const id in WORLD.pads) {
      const p = WORLD.pads[id];
      if (!p.hut) continue;
      const zone = { fisherman: null, lumberjack: 'forest', farmer: 'farm', miner: 'mine', hunter: 'hunt' }[p.worker];
      this.staticImage('worker_hut', p.hut[0], p.hut[1], { zone, scale: 0.8, r: 80 });
    }
  }

  // ------------------------------------------------------------------ v3: land, plots, chains
  buildV3() {
    // building plots (empty until something is chosen); watchtower sites are made when their pad is paid
    for (const id in WORLD.plots || {}) {
      const cfg = WORLD.plots[id];
      const site = new Site(this, id, cfg, 'plot');
      site.region = cfg.region || this.territory.regionAt(cfg.x, cfg.y);
      this.sites[id] = site;
      site.setShown(false);
      this.lazyImage(site.img, 'site_plot_' + site.size);
    }
    // the miners' food box (appears with v3)
    if (WORLD.foodBox) this.foodBox = new FoodBox(this, WORLD.foodBox);
    // boat fish can go to the grill too (logistics: v3.5 every station's input is a sink)
    const grill = this.stations.grill;
    if (grill) this.grillSink = grill.inSink;
    this.events.on('region', () => this.refreshSites());
    this.events.on('step', () => this.time.delayedCall(800, () => this.refreshSites()));
  }

  /** plots appear when their land is open and their step is done */
  refreshSites() {
    for (const id in this.sites) {
      const st = this.sites[id];
      if (st.kind !== 'plot') continue;
      const want = this.territory.isOpen(st.region) && this.progress.met(st.cfg.after);
      if (want === st.shown) continue;
      st.setShown(want);
      if (want && st.state === 'plot' && this.isOnScreen(st.x, st.y, 200) && st.img) {
        const o = st.img; o.setScale(0.01);
        this.tweens.add({ targets: o, scale: 1, duration: 420, ease: 'Back.easeOut' });
        if (st.pad) this.popIn({ pad: st.pad, label: st.label, x: st.dropX, y: st.dropY });
      }
    }
  }

  /** (v3) restore construction sites, buildings and their stock from the save (before the steps are applied) */
  restoreV3(sv) {
    const sites = sv.sites || {};
    for (const id in sites) {
      const d = sites[id];
      if (!d || !d.b) continue;
      let site = this.sites[id];
      if (!site && WORLD.towers && WORLD.towers[id]) site = this.makeTowerSite(id);
      if (!site) continue;
      site.start(d.b, { instant: true, got: d.got, t: d.t });
      if (d.st === 'done') site.finish(true);
      else if (d.st === 'scaffold' && site.state !== 'scaffold') site.beginScaffold(true, d.t);
    }
    this.refreshSites();
  }

  /** (v3) what lies in the new buildings (after the steps: the boat exists by now) */
  restoreV3Stock(sv) {
    const v = sv.v3 || {};
    if (v.warehouse && this.warehouse) this.warehouse.restore(v.warehouse);
    if (this.foodBox) { if (v.food) this.foodBox.restore(v.food); if (this.isBuilt('toolsmith') && !this.foodBox.active) this.foodBox.activate(true, 0); }
    if (v.dock && this.boathouse) this.boathouse.restore(v.dock);
    if (v.workshops) for (const w of this.workshops) w.restore(v.workshops[w.kind]);
    if (v.store && this.store) {
      const fx = this.effects;
      for (const ty in v.store.stock || {}) if (STORE_GOODS.indexOf(ty) >= 0) for (let i = 0; i < Math.min(this.store.maxPerType, v.store.stock[ty] || 0); i++) this.store.stock.push(ty, null, fx);
      this.store.cash.restore(v.store.cash);
    }
  }

  /** (v3) the miners' food box appears (after the forge is built): miners eat bread / smoked meat from now on */
  introduceFood() {
    const fb = this.foodBox;
    if (!fb || fb.active) return;
    fb.activate(false, Math.max(0, Math.floor(BALANCE.food.startGift) || 0));
    this.focusCamera(fb.x, fb.y - 40, 2400);
    this.ui.banner(t('foodIntro'), t('foodIntroSub'));
    Audio.play('sfx_build');
    this.save(true);
  }

  /** population: residents who live here / room in the village (balance.js population3 + houses) */
  popCap() {
    let n = Math.max(0, Math.floor(BALANCE.population3.baseCap) || 19);
    for (const h of this.houses) n += h.people;
    return n;
  }

  updatePopulation() {
    if (!this.life) return;
    const n = this.life.people(), cap = this.popCap(), w = this.life.waiting.length;
    this.ui.setPopulation(n, cap, w);
  }

  /** (v3) every main goal reached: the frontier village is complete */
  celebrate3() {
    if (this.progress.celebrated3) return;
    this.progress.celebrated3 = true;
    Audio.play('sfx_complete');
    this.ui.celebrate(true);
    if (this.life) this.time.delayedCall(1200, () => this.life.party());
    const p = this.player;
    for (let i = 0; i < 12; i++) {
      this.time.delayedCall(i * 280, () => {
        const x = p.x + (Math.random() - 0.5) * 560, y = p.y - 160 - Math.random() * 320;
        this.effects.burst('confetti', x, y, 22); this.effects.burst('star', x, y, 12);
      });
    }
    this.effects.shake(300, 0.006);
    this.save(true);
  }

  makeTowerSite(id) {
    const cfg = Object.assign({ size: 'S' }, WORLD.towers[id]);
    const site = new Site(this, id, cfg, 'tower');
    site.region = this.territory.regionAt(cfg.x, cfg.y);
    site.towerRegion = cfg.region;
    this.sites[id] = site;
    return site;
  }

  /** (v3) the watchtower pad was paid: its construction site appears (planks / ingots must come) */
  startTower(id, instant) {
    if (this.sites[id] && this.sites[id].state !== 'plot') return;
    const site = this.sites[id] || this.makeTowerSite(id);
    site.start('watchtower', { instant });
  }

  /** a picture whose atlas loads after the title: re-apply it when the atlas arrives */
  lazyImage(img, key, after) { if (img && Assets.pending(key)) this.lazyImgs.push({ img, key, after }); }

  onAssetArrived(fileKey) {
    for (let i = this.lazyImgs.length - 1; i >= 0; i--) {
      const q = this.lazyImgs[i];
      if (!q.img || !q.img.active) { this.lazyImgs.splice(i, 1); continue; }
      if (Assets.pending(q.key)) continue;
      const anim = q.img.anims && q.img.anims.isPlaying ? q.img.anims.currentAnim && q.img.anims.currentAnim.key : null;
      if (!anim) Assets.apply(q.img, q.key);
      if (q.after) { try { q.after(q.img); } catch (e) { /* keep going */ } }
      this.lazyImgs.splice(i, 1);
    }
    // occluder boxes of the pictures that just got their real size
    for (const o of this.occluders || []) {
      if (o.img && o.img.active && (o.hw < 4 || o.top < 4)) {
        const img = o.img, h = img.displayHeight * img.originY, w = img.displayWidth;
        o.x = img.x + (0.5 - img.originX) * w; o.hw = w * 0.5; o.top = h * 0.95; o.big = w > 250;
      }
    }
    if (this.towers) for (const k in this.towers) this.towers[k].refreshFire();
    void fileKey;
  }

  /** is a building of this kind finished? */
  isBuilt(bkey) { return (this.built[bkey] || 0) > 0; }

  /** create the working building on a finished site */
  makeBuilding(bkey, site, instant) {
    this.built[bkey] = (this.built[bkey] || 0) + 1;
    let b = null;
    if (bkey === 'toolsmith' || bkey === 'cannery') {
      b = new Workshop(this, bkey, site);
      this.lazyImage(b.img, b.recipe.sprite);
      this.workshops.push(b);
      // (v3.5) the chief works the forge / the press at its work spot until its operator is hired
      b.op = new OperatorSpot(this, b, WORLD.labour && WORLD.labour.ops[bkey]);
      // (a v3 save's forge / press came with its operator: the step is done before the building stands)
      if (this.progress && this.progress.isDone('op_' + bkey)) this.time.delayedCall(instant ? 0 : 1400, () => this.hireOperator(bkey, true));
    } else if (bkey === 'warehouse') {
      b = new Warehouse(this, site);
      this.lazyImage(b.img, 'warehouse');
      this.warehouse = b;
      const n = Math.max(0, Math.min(6, Math.floor(BALANCE.warehouse.porters) || 2));
      for (let i = 0; i < n; i++) {
        const wp = new WarehousePorter(this, b, b.outPad.x + 40 + i * 30, b.outPad.y + 50, this.porters.length);
        this.porters.push(wp);
        b.porters.push(wp);
        if (this.life) this.life.release(wp.key);
        if (!instant) { wp.sprite.setScale(0.1); this.tweens.add({ targets: wp.sprite, scale: 1, duration: 450, delay: 600 + i * 200, ease: 'Back.easeOut' }); }
      }
    } else if (bkey === 'boathouse') {
      b = new Boathouse(this, site);
      this.boathouse = b;
    } else if (bkey === 'store') {
      b = this.makeStore(site);
      this.store = b;
    } else if (bkey === 'watchtower') {
      b = new Tower(this, site, site.towerRegion);
      this.towers[site.id] = b;
      if (instant) { if (this.territory.isOpen(site.towerRegion)) b.light(true); else { b.light(true); this.territory.reveal(site.towerRegion, true); } }
      else this.time.delayedCall(900, () => b.light(false));
    } else if (/^house_/.test(bkey)) {
      b = new House(this, bkey, site);
      this.lazyImage(b.img, bkey);
      this.houses.push(b);
      if (this.life) this.life.capChanged(b, instant);
    }
    if (b && !instant) {
      for (const o of b.revealObjects ? b.revealObjects() : []) {
        if (!o || !o.setScale) continue;
        const sx = o.scaleX, sy = o.scaleY;
        o.setScale(0.01);
        this.tweens.add({ targets: o, scaleX: sx, scaleY: sy, duration: 520, ease: 'Back.easeOut' });
      }
      if (bkey !== 'watchtower') {
        this.focusCamera(site.x, site.y - 80, 1800);
        this.ui.banner(t('builtDone', { name: t('b_' + bkey) }), t('bsub_' + bkey));
      }
    }
    if (site.cfg && site.cfg.size === 'L' && bkey !== 'watchtower') this.dressBigPlot(site, b);
    if (b && !this.territory.isOpen(site.region)) this.territory.add(site.region, b);
    this.time.delayedCall(instant ? 0 : 1200, () => this.progress.syncPads());
    this.updatePopulation();
    return b;
  }

  /** an M building on a big (L) plot gets a few props around it so the ground is not empty */
  dressBigPlot(site, b) {
    // around the sides, never on a pad / the unload spot / a customer's place of the building
    const keep = [];
    const pt = (o) => { if (o && Number.isFinite(o.x)) keep.push(o); };
    if (b) {
      pt(b.inPad); pt(b.outPad); pt(b.sink); pt(b.shelf); pt(b.register); pt(b.cash && b.cash.pad);
      if (b.slotPos) for (let i = 0; i < 4; i++) pt(b.slotPos(i));
    }
    const o = [['lamp_post', -235, 10], ['barrel', 236, -14], ['crate', 262, 18], ['firewood_pile', -222, -62], ['barrel', -190, 96], ['crate', 205, 100]];
    let n = 0;
    for (const [k, dx, dy] of o) {
      const x = site.x + dx, y = site.y + dy;
      if (keep.some((q) => gdist(q.x, q.y, x, y) < 110) || n >= 4) continue;
      n++;
      const img = this.staticImage(k, x, y, {});
      if (!this.territory.isOpen(site.region)) this.territory.add(site.region, img);
    }
  }

  /** the general store: a Market selling cans and tools (customers come along the roads) */
  makeStore(site) {
    const d = Assets.def('shop_general');
    const ip = d.inPoint || [131, 50], cp = d.cashPoint || [-32, 66], cu = (d.customerPoints && d.customerPoints[0]) || [-70, 37];
    const XO = (m) => [45.25 * m, 22.63 * m], YO = (m) => [45.25 * m, -22.63 * m];
    const cfg = {
      id: 'store', sprite: 'shop_general', x: site.x, y: site.y, goods: STORE_GOODS,
      shelf: [ip[0] + 18, ip[1] + 30], cash: [cp[0] - 20, cp[1] + 46], queueStart: [cu[0] - 30, cu[1] + 16],
      queueStep: YO(-0.9), queueTurn: 4, queueStep2: XO(-0.9), register: [cp[0] + 120, cp[1] + 74],
      stockCols: [[-36, -6], [-12, 6], [12, -6], [36, 6], [-24, 18], [24, 18]],
      clerk: ['npc_clerk_a', 'npc_clerk_b', 'npc_aunt'], collider: [22, -12, 0.3], faceTo: [30, -40],
      maxQueue: 6, spawnEvery: 3.2, wantMax: 3, soldEvent: 'storeSold', shelfMax: 24,
      available: () => STORE_GOODS.filter((g) => (g === 'item_can' ? this.isBuilt('cannery') : this.isBuilt('toolsmith'))),
    };
    const m = new Market(this, cfg);
    m.front = [-60, 30];
    if (this.padSpots) { this.padSpots.push({ x: m.shelf.x, y: m.shelf.y, r: 70 }, { x: m.cash.x, y: m.cash.y, r: 70 }, { x: m.register.x, y: m.register.y, r: 64 }); }
    m.restoreQueue(1);
    return m;
  }

  /** objects with an output pad porters can empty (v1 stations, v3 workshops, the boat's catch pad) */
  sources() {
    const out = this._src || (this._src = []);
    out.length = 0;
    for (const s of this.stationList) out.push(s);
    for (const w of this.workshops) out.push(w);
    if (this.boathouse) out.push(this.boathouse);
    return out;
  }

  sourceById(id) {
    if (this.stations[id]) return this.stations[id];
    if (id === 'dock') return this.boathouse;
    return this.workshops.find((w) => w.kind === id) || null;
  }

  /** tools the hire pads are still waiting for (tool -> count) */
  toolsWanted() {
    const o = {};
    for (const id in this.progress.pads) {
      const p = this.progress.pads[id];
      if (!p.items || p.done || !p.active) continue;
      for (const k in p.items) if (TOOLS.indexOf(k) >= 0) o[k] = (o[k] || 0) + Math.max(0, p.items[k] - (p.got[k] || 0) - p.itemStack.countWithIncoming(k));
    }
    return o;
  }

  /** tools of a kind already on their way to a pad (porters / the chief carrying them) */
  toolsInTransit(tool) {
    let n = this.player.stack.countOf(tool);
    for (const pr of this.porters) n += pr.stack.countOf(tool);
    return n;
  }

  /** items of `type` porters are carrying to sink `sink` (saved as delivered) */
  carriedTo(sink, type) {
    let n = 0;
    for (const pr of this.porters) if (pr.dest === sink) n += pr.stack.countOf(type) + pr.stack.inTypes.filter((q) => q === type).length;
    return n;
  }

  /** where the pad of a v3 step goes (towers: in front of the site; boat: by the boathouse; new porters / clerk: by their building) */
  padSpot(s) {
    if (s.type === 'tower') { const w = WORLD.towers && WORLD.towers[s.id]; if (!w || (w.in && !this.territory.isOpen(w.in))) return null; const d = Assets.def('site_plot_S').dropPoint || [2, 64]; return { x: w.x + d[0], y: w.y + d[1] }; }
    if (s.type === 'boat') return this.boathouse ? this.boathouse.boatPad : null;
    if (s.type === 'porter') {
      const src = this.sourceById(s.station);
      if (!src || !src.outPad) return null;
      return { x: src.outPad.x + 120, y: src.outPad.y + 60 };
    }
    if (s.type === 'clerk' && s.seller === 'store' && this.store) return { x: this.store.register.x + 150, y: this.store.register.y + 20 };
    // (v3.5) the operator of a v3 workshop: on the porter pad's spot (the porter pad follows it)
    if (s.type === 'operator') {
      const src = this.sourceById(s.station);
      if (!src || !src.outPad) return null;
      return { x: src.outPad.x + 120, y: src.outPad.y + 60 };
    }
    return null;
  }

  // ---------------------------------------------------------------- build menu
  openBuildMenu(site) { if (site && site.state === 'plot' && site.shown) this.ui.openBuildMenu(site); }

  /** the cards of the build menu for a plot: [{ key, cost, locked, reason, fits }] */
  buildChoices(site) {
    const keys = site.only ? [site.only] : (site.size === 'S' ? ['house_c', 'house_a', 'house_b'] : ['toolsmith', 'boathouse', 'warehouse', 'cannery', 'store', 'house_c', 'house_a', 'house_b'].filter((k) => k !== 'boathouse'));
    const out = [];
    for (const k of keys) {
      const c = buildCost(k);
      let reason = null;
      const need = BUILD_UNLOCK[k];
      if (need && !this.progress.met(need)) reason = 'lock_' + k;
      else if (UNIQUE_BUILDINGS.indexOf(k) >= 0 && (this.isBuilt(k) || this.isBuilding(k))) reason = 'lockBuilt';
      else if (/^house_/.test(k) && this.life && !this.life.wantsHouse()) reason = 'lockNoOne';
      // a big plot is kept for the big buildings until every one of them stands (no plot left for the
      // store would stop the progression); after that, houses may fill the spare big plots too
      else if (/^house_/.test(k) && site.size !== 'S' && UNIQUE_BUILDINGS.some((u) => u !== 'boathouse' && !this.isBuilt(u) && !this.isBuilding(u))) reason = 'lockBigPlot';
      out.push({ key: k, cost: c, locked: !!reason, reason });
    }
    // what can be built first
    out.sort((a, b) => (a.locked - b.locked));
    return out;
  }

  isBuilding(bkey) { for (const id in this.sites) { const s = this.sites[id]; if (s.building === bkey && s.state !== 'done') return true; } return false; }

  /** the player chose `bkey` for `site` in the build menu: pay and lay the foundation */
  tryBuild(site, bkey) {
    if (!site || site.state !== 'plot') return false;
    const ch = this.buildChoices(site).find((c) => c.key === bkey);
    if (!ch || ch.locked) return false;
    const coins = Math.max(0, Math.floor(ch.cost.coins) || 0);
    if (this.economy.coins < coins) { this.ui.toast(t('notEnoughCoins')); Audio.play('sfx_error', { volume: 0.5 }); return false; }
    this.economy.spend(coins);
    const p = this.player;
    for (let i = 0; i < Math.min(8, Math.ceil(coins / 40)); i++) {
      this.time.delayedCall(i * 50, () => { const spr = this.effects.takeItem('item_coin'); spr.setScale(0.7); this.effects.fly(spr, p.x, p.y - 60, { x: site.x, y: site.y }, { dur: 320, height: 60, scaleTo: 0.35, onDone: (sp) => this.effects.releaseItem(sp) }); });
    }
    this.effects.floatText(site.x, site.y - 80, '-' + coins, '#ffd84a', 30);
    Audio.play('sfx_pad_fill', { volume: 0.6, rate: 1.2 });
    site.start(bkey, {});
    this.ui.banner(t('buildStart', { name: t('b_' + bkey) }), t('buildStartSub'));
    this.events.emit('buildChosen', bkey, site);
    this.save(true);
    return true;
  }

  // ------------------------------------------------------------------ zones
  setZoneEnabled(id, v) {
    for (const o of this.zoneObjs[id]) {
      if (o.setEnabled) o.setEnabled(v);
      else { o.setVisible(v); if (o.__ob) o.__ob.active = v; }
    }
  }

  revealZone(id, instant) {
    const z = this.zones[id];
    if (!z || z.unlocked) return;
    z.unlocked = true;
    this.setZoneEnabled(id, true);
    if (this.roads) this.roads.invalidate();
    if (z.roads) { if (instant) z.roads.setAlpha(1); else this.tweens.add({ targets: z.roads, alpha: 1, duration: 900, delay: 500 }); }
    if (!instant && this.life) this.time.delayedCall(900, () => this.life.cheer());
    if (z.outline) {
      const o = z.outline; z.outline = null;
      const all = [o.g, o.lock, o.txt].concat(o.ghosts || []);
      if (instant) for (const x of all) x.destroy();
      else this.tweens.add({ targets: all, alpha: 0, duration: 400, onComplete: () => { for (const x of all) x.destroy(); } });
    }
    if (instant) { z.floor.setAlpha(1); return; }
    // cinematic reveal: pan the camera, fade the floor in, pop every object in
    const [cx, cy] = z.cfg.center;
    this.focusCamera(cx, cy, BALANCE.camera.revealPanMs + BALANCE.camera.revealHoldMs + 600);
    z.floor.setAlpha(0);
    this.tweens.add({ targets: z.floor, alpha: 1, duration: 700, delay: 350 });
    Audio.play('sfx_build');
    const objs = [];
    for (const o of this.zoneObjs[id]) {
      if (o.revealObjects) objs.push(...o.revealObjects());
      else if (o.img) objs.push(o.img);
      else if (o.sprite) objs.push(o.sprite);
      else objs.push(o);
    }
    objs.sort((a, b) => gdist2(a.x, a.y, cx, cy) - gdist2(b.x, b.y, cx, cy));
    objs.forEach((o, i) => {
      const sx = o.scaleX, sy = o.scaleY;
      o.setScale(0.01);
      this.tweens.add({ targets: o, scaleX: sx, scaleY: sy, duration: 420, delay: 450 + i * 22, ease: 'Back.easeOut' });
      if (i % 4 === 0) this.time.delayedCall(450 + i * 22, () => this.effects.burst('snowhit', o.x, o.y - 10, 4));
    });
    this.time.delayedCall(500, () => { this.effects.sheet('fx_poof', cx, cy, { size: 360 }); this.effects.shake(220, 0.006); });
  }

  focusCamera(x, y, ms) { this.camFocus = { x, y, until: this.time.now + ms }; }

  /** the part of the world the camera shows (or is about to: it follows camTarget) */
  viewRect() {
    const cam = this.cameras.main, ct = this.camTarget;
    const z = Math.max(0.05, cam.zoom || 1);
    const w = cam.width / z, h = cam.height / z;
    const wv = cam.worldView;
    const cx = ct ? ct.x : wv.centerX, cy = ct ? ct.y : wv.centerY;
    const r = this._vr || (this._vr = { x: 0, y: 0, right: 0, bottom: 0 });
    // cover both where the camera is and where it is going
    r.x = Math.min(wv.x, cx - w / 2); r.y = Math.min(wv.y, cy - h / 2);
    r.right = Math.max(wv.right, cx + w / 2); r.bottom = Math.max(wv.bottom, cy + h / 2);
    return r;
  }

  showBench(instant) {
    const b = this.bench;
    b.setVisible(true);
    if (b.__ob) b.__ob.active = true;
    if (!instant) {
      b.setScale(0.01);
      this.tweens.add({ targets: b, scale: 1, duration: 500, ease: 'Back.easeOut' });
      this.effects.sheet('fx_poof', b.x, b.y - 30, { size: 220 });
      Audio.play('sfx_build');
      this.focusCamera(b.x, b.y, 1600);
    }
  }

  popIn(pad) {
    const objs = [pad.pad.img, pad.label];
    for (const o of objs) {
      const sx = o.scaleX, sy = o.scaleY;
      o.setScale(0.01);
      this.tweens.add({ targets: o, scaleX: sx, scaleY: sy, duration: 380, ease: 'Back.easeOut' });
    }
    this.effects.sheet('fx_sparkle', pad.x, pad.y - 10, { size: 120 });
  }

  workerHome(type, index) {
    const h = WORLD.workerHome[type];
    return [h[0] + index * 40, h[1] + index * 20];
  }

  hireWorker(type, index, instant, x, y, role) {
    const home = Worker.homeFor(this, type, index, role);
    const w = new Worker(this, type, x !== undefined ? x : home[0], y !== undefined ? y : home[1], index, role);
    this.workers.push(w);
    // (v3.5) the line's collection pile appears with its first gatherer
    if (w.pile && !w.pile.shown) w.pile.setShown(true, !instant);
    if (!instant) {
      this.effects.sheet('fx_poof', w.x, w.y - 30, { size: 180 });
      this.effects.burst('star', w.x, w.y - 40, 12);
      w.sprite.setScale(0.1);
      this.tweens.add({ targets: w.sprite, scale: 1, duration: 450, ease: 'Back.easeOut' });
    }
    return w;
  }

  /** (v2) a porter for station `id`'s products */
  hirePorter(id, instant, x, y) {
    const st = this.sourceById(id);
    if (!st) return null;
    const home = Porter.homeFor(this, st);
    const pr = new Porter(this, st, x !== undefined && !instant ? x : home[0], y !== undefined && !instant ? y : home[1], this.porters.length);
    this.porters.push(pr);
    if (this.life) this.life.release(pr.key);
    if (!instant) {
      this.effects.sheet('fx_poof', pr.x, pr.y - 30, { size: 180 });
      this.effects.burst('star', pr.x, pr.y - 40, 12);
      pr.sprite.setScale(0.1);
      this.tweens.add({ targets: pr.sprite, scale: 1, duration: 450, ease: 'Back.easeOut' });
    }
    return pr;
  }

  /** follow agent `a`'s waypoint list `a.route` (from roads.route); true on arrival at the last point */
  followRoute(a, speed, dt, tol = 10) {
    const r = a.route;
    if (!r || !r.length) return true;
    a.ri = a.ri || 0;
    while (a.ri < r.length - 1 && gdist(a.x, a.y, r[a.ri].x, r[a.ri].y) < 34) a.ri++;
    const w = r[a.ri];
    const last = a.ri >= r.length - 1;
    // no closer to this point for a while (something stands on it, or a crowd blocks it): skip it,
    // or call the end of the route reached, so a carrier never circles an obstacle for good
    const dd = gdist(a.x, a.y, w.x, w.y);
    if (a._wpX !== w.x || a._wpY !== w.y) { a._wpX = w.x; a._wpY = w.y; a._wpBest = dd; a._wpT = 0; }
    else if (dd < a._wpBest - 6) { a._wpBest = dd; a._wpT = 0; }
    else if ((a._wpT += dt) > 3) {
      a._wpT = 0; a._wpBest = Infinity;
      if (!last) { a.ri++; return false; }
      a.vx = a.vy = 0;
      return true;
    }
    if (this.moveAgent(a, w.x, w.y, speed, dt, last ? tol : 28)) {
      if (last) return true;
      a.ri++;
    }
    return false;
  }

  celebrate() {
    Audio.play('sfx_complete');
    if (this.life) this.time.delayedCall(1200, () => this.life.party());
    this.ui.celebrate();
    const p = this.player;
    this.effects.sheet('fx_unlock', p.x, p.y - 20, { size: 320 });
    this.effects.sheet('fx_levelup', p.x, p.y + 4, { size: 240 });
    for (let i = 0; i < 10; i++) {
      this.time.delayedCall(i * 300, () => {
        const x = p.x + (Math.random() - 0.5) * 520, y = p.y - 160 - Math.random() * 320;
        this.effects.burst('confetti', x, y, 22);
        this.effects.burst('star', x, y, 12);
        this.effects.burst('glow', x, y, 1);
      });
    }
    this.effects.shake(300, 0.006);
    this.effects.vibrate(80);
  }

  // ------------------------------------------------------------------ helpers
  isOnScreen(x, y, margin = 0) {
    const v = this.cameras.main.worldView;
    return x > v.x - margin && x < v.right + margin && y > v.y - margin && y < v.bottom + margin;
  }
  isNear(x, y, d) { const p = this.player; return Math.abs(p.x - x) < d && Math.abs(p.y - y) < d; }

  /** positional sfx: only when (x, y) is on or near the screen, softer just outside it. `force` = always (the chief's own actions) */
  sfxAt(key, x, y, opts, force) {
    if (!force) {
      if (!this.isOnScreen(x, y, 220)) return;
      if (!this.isOnScreen(x, y, 0)) opts = Object.assign({}, opts, { volume: ((opts && opts.volume) !== undefined ? opts.volume : 1) * 0.5 });
    }
    Audio.play(key, opts);
  }

  findGatherable(x, y, range) {
    let best = null, bd = range * range;
    const check = (n) => {
      if (!n.ready()) return;
      const d = gdist2(x, y, n.x, n.y);
      if (d < bd) { bd = d; best = n; }
    };
    check(this.net);
    if (gdist2(x, y, this.net.gather.x, this.net.gather.y) < 55 * 55 && this.net.ready()) return this.net;
    for (const n of this.trees) check(n);
    for (const n of this.rocks) {
      if (!n.ready()) continue;
      const rr = range + n.standDist - 40;
      const d = gdist2(x, y, n.x, n.y);
      if (d < rr * rr && d - (n.standDist - 40) * (n.standDist - 40) < bd) { bd = Math.max(1, d - (n.standDist - 40) ** 2); best = n; }
    }
    for (const n of this.wheat) check(n);
    for (const n of this.animals) check(n);
    return best;
  }

  /** move one item from stack A to stack B in an arc; returns true if started */
  moveItem(from, to, types, opts = {}) {
    if (to.room <= 0) return false;
    const it = from.pop(types);
    if (!it) return false;
    to.reserve(it.type);
    const fx = it.spr.x, fy = it.spr.y;
    const isPlayerDest = to === this.player.stack;
    this.effects.fly(it.spr, fx, fy, () => to.nextPos(it.type), {
      dur: opts.dur || 240, height: opts.height || 60, scaleTo: to.scale,
      onDone: (s) => {
        to.arrive(it.type);
        to.push(it.type, s);
        if (from === this.player.stack && PRODUCT_ZONE[it.type] && (to === this.market.stock || to === this.trade.stock)) this.progress.hints[PRODUCT_ZONE[it.type]] = true;
        if (opts.sfx === 'pickup' || isPlayerDest) {
          if (isPlayerDest) Audio.play('sfx_pickup', { volume: 0.7, rate: 0.9 + Math.min(0.9, to.count * 0.045), throttle: 30 });
        } else if (opts.sfx === 'drop' && this.isNear(fx, fy, 500)) Audio.play('sfx_drop', { volume: 0.5, rate: 0.85 + Math.min(0.7, to.count * 0.03), throttle: 40 });
      },
    });
    return true;
  }

  /** spawn a fresh item at (x, y) that flies into character `ch`'s stack */
  spawnItemTo(type, x, y, ch, isPlayer, delay = 0) {
    const st = ch.stack;
    if (st.count + st.incoming >= (isPlayer ? this.player.capacity : st.max)) return false;
    st.reserve(type);
    const go = () => {
      const spr = this.effects.takeItem(type);
      spr.setScale(0.45);
      this.effects.fly(spr, x, y, () => st.nextPos(type), {
        dur: 300, height: 70, scaleTo: st.scale,
        onDone: (s) => {
          st.arrive(type);
          if (!ch.alive) { this.effects.releaseItem(s); return; }
          st.push(type, s);
          if (isPlayer) {
            Audio.play('sfx_pickup', { volume: 0.75, rate: 0.9 + Math.min(0.9, st.count * 0.05), throttle: 30 });
            if (st.count >= this.player.capacity) this.effects.floatText(ch.x, ch.y + ch.headTop - 30, 'MAX', '#ffd84a', 26);
          }
        },
      });
    };
    if (delay > 0) this.time.delayedCall(delay, go); else go();
    return true;
  }

  /** steer an agent toward (tx, ty); returns true when within `arrive` px */
  moveAgent(a, tx, ty, speed, dt, arrive = 8) {
    const dx = tx - a.x, dy = ty - a.y;
    const d = Math.hypot(dx, dy);
    if (d <= arrive) { a.vx = a.vy = 0; a.stuckT = 0; return true; }
    let vx = (dx / d) * speed, vy = (dy / d) * speed;
    // unstick: slide sideways for a moment when blocked
    if (a.sideT > 0) { a.sideT -= dt; const s = a.sideDir || 1; const ox = -vy * s, oy = vx * s; vx = vx * 0.3 + ox * 0.9; vy = vy * 0.3 + oy * 0.9; }
    // separation from other agents
    const list = this.agents;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === a || !o.alive) continue;
      const ex = a.x - o.x, ey = (a.y - o.y) * 2;
      const e2 = ex * ex + ey * ey;
      if (e2 < 900 && e2 > 0.01) { const e = Math.sqrt(e2); vx += (ex / e) * 60; vy += (ey / e) * 30; }
    }
    const px = a.x, py = a.y;
    const p = a._mp || (a._mp = { x: 0, y: 0 });
    p.x = a.x + vx * dt; p.y = a.y + vy * dt;
    this.collision.resolve(p, a.radius);
    a.x = p.x; a.y = p.y;
    a.vx = vx; a.vy = vy;
    const moved = Math.hypot(a.x - px, a.y - py);
    if (moved < speed * dt * 0.25) { a.stuckT = (a.stuckT || 0) + dt; if (a.stuckT > 0.35) { a.sideT = 0.7; a.sideDir = Math.random() < 0.5 ? -1 : 1; a.stuckT = 0; } }
    else a.stuckT = 0;
    a.face(vx, vy);
    a.locomotion(true);
    return false;
  }

  // ------------------------------------------------------------------ update
  update(time, delta) {
    if (this._broken || !this.player) return;    // create() failed and a fresh restart is queued
    // an exception inside Phaser's loop would stop the game for good: report it once, keep running
    try { this.tick(time, delta); } catch (e) { if (!this._tickErr) { this._tickErr = true; console.error('[FrostVillage] update error:', e); } }
  }

  tick(time, delta) {
    const dt = Math.min(0.05, delta / 1000);
    const inp = Input.update(time);
    const p = this.player;
    this.ground.update(dt);
    p.update(dt, inp);

    // player pad interactions
    this.playerOnPad = this.progress.update(dt);
    this.padT -= dt;
    const onPadNow = this.handlePlayerPads(dt);
    const onLabour = this.updateLabour(dt);
    this.playerOnPad = this.playerOnPad || onPadNow || onLabour;

    this.net.update(dt);
    for (const n of this.trees) n.update(dt);
    for (const n of this.rocks) n.update(dt);
    for (const n of this.wheat) n.update(dt);
    for (const a of this.animals) a.update(dt);
    for (const s of this.stationList) s.update(dt);
    this.market.update(dt);
    this.trade.update(dt);
    // (v3) construction, workshops, storage, the store, houses, towers, boats, fog
    for (const id in this.sites) this.sites[id].update(dt);
    for (const w of this.workshops) w.update(dt);
    if (this.warehouse) this.warehouse.update(dt);
    if (this.store) this.store.update(dt);
    if (this.boathouse) this.boathouse.update(dt);
    for (const h of this.houses) h.update(dt);
    for (const k in this.towers) this.towers[k].update(dt);
    this.territory.update(dt);
    for (const w of this.workers) w.update(dt);
    for (const w of this.porters) w.update(dt);
    for (const w of this.rawPorters) w.update(dt);
    if (this.life) this.life.update(dt);
    if (this.dog) this.dog.update(dt);
    this.v3T = (this.v3T || 0) - dt;
    if (this.v3T <= 0) {
      this.v3T = 1;
      if (!this.progress.celebrated3 && this.progress.v3Complete) this.time.delayedCall(2500, () => this.celebrate3());
    }
    this.tutorial.update(dt);
    if (this.occlusion) this.occlusion.update(dt);
    this.updateZoom(dt, delta);

    // camera target
    const ct = this.camTarget;
    let fx = p.x, fy = p.y - 30;
    if (this.tutorial.inTutorial && WORLD.tutorialView) {
      // first loop: frame net, grill, counter and queue together; follow the chief only near the edges
      const v = this.cameras.main.worldView, hw = v.width / 2, hh = v.height / 2;
      fx = Math.max(p.x - hw + 120, Math.min(p.x + hw - 120, WORLD.tutorialView[0]));
      fy = Math.max(p.y - 30 - hh + 260, Math.min(p.y - 30 + hh - 260, WORLD.tutorialView[1]));
    }
    if (this.camFocus) { if (time < this.camFocus.until) { fx = this.camFocus.x; fy = this.camFocus.y; } else this.camFocus = null; }
    if (this.overview && !this.camFocus) { const r = this.territory.camRect; fx = r.x + r.w / 2; fy = r.y + r.h / 2 - 40; }
    const k = this.camFocus ? 1 - Math.pow(1 - 0.06, delta / 16.67) : 1 - Math.pow(1 - BALANCE.camera.lerp, delta / 16.67);
    ct.x += (fx - ct.x) * k; ct.y += (fy - ct.y) * k;

    // ambient snow
    this.snowT -= dt;
    if (this.snowT <= 0) {
      this.snowT = 0.09;
      const v = this.cameras.main.worldView;
      this.effects.emitters.snowfall.emitParticleAt(v.x + Math.random() * v.width, v.y - 20 + Math.random() * v.height * 0.6, 1);
    }

    // ambience by location
    this.ambT -= dt;
    if (this.ambT <= 0) {
      this.ambT = 0.25;
      const sea = Math.max(0, Math.min(1, 1 - (p.y - 400) / 900));
      Audio.setAmbience('amb_sea', 0.15 + sea * 0.6);
      let fire = 0;
      for (const s of this.stationList) if (s.working && s.enabled) { const d = Math.hypot(s.x - p.x, s.y - p.y); fire = Math.max(fire, 1 - d / 420); }
      for (const c of this.campfires || []) { const d = Math.hypot(c.x - p.x, c.y - p.y); fire = Math.max(fire, (1 - d / 350) * 0.7); }
      Audio.setAmbience('amb_fire', Math.max(0, fire) * 0.8);
    }
    Audio.updateAmbience(dt);

    this.saveT += dt;
    if (this.saveT >= BALANCE.autosaveEvery) { this.saveT = 0; this.save(false); }
  }

  // ------------------------------------------------------------------ zoom (v2)
  /** zoom that shows the whole village */
  fitZoom() {
    const cam = this.cameras.main;
    const vw = cam.width / View.k, vh = cam.height / View.k;
    const r = this.territory ? this.territory.camRect : { w: this.W, h: this.H };
    return Math.min(vw / r.w, vh / (r.h + 80));
  }

  /** camera bounds = the open land (+ a peek at the fog) */
  resetBounds() { const r = this.territory.camRect; this.cameras.main.setBounds(r.x, r.y, r.w, r.h); }

  /** set the zoom the camera glides to (clamped); `keepOverview` keeps the whole-village view */
  setZoom(z, keepOverview) {
    const C = BALANCE.camera;
    if (!keepOverview && this.overview) { this.overview = false; this.resetBounds(); }
    this.zoomTarget = Phaser.Math.Clamp(z, C.zoomMin, C.zoomMax);
    if (!this.overview) { Settings.data.zoom = Math.round(this.zoomTarget * 100) / 100; this._zoomSaveT = 1.2; }
    this.ui.zoomChanged();
  }

  zoomBy(f) { this.setZoom((this.overview ? this.prevZoom || this.zoomBase : this.zoomTarget) * f); }

  /** toggle the whole-village view */
  toggleOverview() {
    const cam = this.cameras.main;
    if (this.overview) { this.overview = false; this.resetBounds(); this.setZoom(this.prevZoom || this.zoomBase); return; }
    this.prevZoom = this.zoomTarget;
    this.overview = true;
    // the whole village fits the screen: no bounds, so it sits in the middle
    cam.removeBounds();
    this.zoomTarget = this.fitZoom();
    this.ui.zoomChanged();
  }

  updateZoom(dt, delta) {
    const cam = this.cameras.main;
    if (this.overview) this.zoomTarget = this.fitZoom();
    if (Math.abs(this.zoomCur - this.zoomTarget) > 0.0005) {
      const k = 1 - Math.pow(1 - BALANCE.camera.zoomSmooth, delta / 16.67);
      this.zoomCur += (this.zoomTarget - this.zoomCur) * k;
      if (Math.abs(this.zoomCur - this.zoomTarget) < 0.001) this.zoomCur = this.zoomTarget;
      cam.setZoom(this.zoomCur * View.k);
    }
    if (this._zoomSaveT > 0) { this._zoomSaveT -= dt; if (this._zoomSaveT <= 0) Settings.save(); }
  }

  handlePlayerPads(dt) {
    const p = this.player;
    let on = false;
    const ready = this.padT <= 0;
    const cap = p.capacity;
    for (const s of this.stationList) {
      if (!s.enabled) continue;
      if (s.inPad.contains(p.x, p.y)) {
        on = true;
        if (ready && p.stack.countOf(s.input) > 0) {
          if (s.feedFrom(p)) { this.padT = BALANCE.player.padItemInterval; s.inPad.pulse(); }
          else this.fullToast();
        }
      } else if (s.outPad.contains(p.x, p.y)) {
        on = true;
        if (ready) {
          if (s.takeTo(p, cap)) this.padT = BALANCE.player.padItemInterval;
          else if (s.outStack.count > 0 && p.room <= 0) p.warnFull();
        }
      }
    }
    if (this.market.shelf.contains(p.x, p.y)) {
      on = true;
      if (ready && p.stack.hasAny(FOODS) && this.market.feedFrom(p)) { this.padT = BALANCE.player.padItemInterval; this.market.shelf.pulse(); }
    }
    if (this.trade.enabled && this.trade.shelf.contains(p.x, p.y)) {
      on = true;
      if (ready && p.stack.hasAny(GOODS) && this.trade.feedFrom(p)) { this.padT = BALANCE.player.padItemInterval; this.trade.shelf.pulse(); }
    }
    if (this.market.cash.pad.contains(p.x, p.y) || (this.trade.enabled && this.trade.cash.pad.contains(p.x, p.y))) on = true;
    if (this.market.register.chief || (this.trade.enabled && this.trade.register.chief)) on = true;
    // (v3) construction sites (plot pad: the build menu; drop pad: materials), workshops, storage, food, store, the catch
    for (const id in this.sites) {
      const st = this.sites[id];
      if (!st.shown) continue;
      if (st.state === 'plot' && st.pad && st.pad.contains(p.x, p.y)) on = true;
      else if (st.state === 'foundation' && st.dropPad && st.dropPad.contains(p.x, p.y)) {
        on = true;
        if (ready && st.feedFromPlayer()) this.padT = BALANCE.player.padItemInterval;
      }
    }
    for (const w of this.workshops) {
      if (!w.enabled) continue;
      if (w.inPad.contains(p.x, p.y)) { on = true; if (ready && w.feedFrom(p)) { this.padT = BALANCE.player.padItemInterval; w.inPad.pulse(); } }
      else if (w.outPad.contains(p.x, p.y)) { on = true; if (ready) { if (w.takeTo(p, cap)) this.padT = BALANCE.player.padItemInterval; else if (w.outStack.count > 0 && p.room <= 0) p.warnFull(); } }
    }
    const wh = this.warehouse;
    if (wh && wh.enabled) {
      if (wh.inPad.contains(p.x, p.y)) { on = true; if (ready && p.stack.count > 0 && wh.feedFrom(p)) { this.padT = BALANCE.player.padItemInterval; wh.inPad.pulse(); } }
      else if (wh.outPad.contains(p.x, p.y)) on = true;
    }
    if (this.foodBox && this.foodBox.active && this.foodBox.pad.contains(p.x, p.y)) { on = true; if (ready && this.foodBox.feedFromPlayer()) this.padT = BALANCE.player.padItemInterval; }
    const sto = this.store;
    if (sto && sto.enabled) {
      if (sto.shelf.contains(p.x, p.y)) { on = true; if (ready && p.stack.hasAny(STORE_GOODS) && sto.feedFrom(p)) { this.padT = BALANCE.player.padItemInterval; sto.shelf.pulse(); } }
      if (sto.cash.pad.contains(p.x, p.y) || sto.register.chief) on = true;
    }
    const bh = this.boathouse;
    if (bh && bh.enabled && bh.outPad.contains(p.x, p.y)) { on = true; if (ready) { if (bh.takeTo(p, cap)) this.padT = BALANCE.player.padItemInterval; else if (bh.outStack.count > 0 && p.room <= 0) p.warnFull(); } }
    // (v3.5) the discard spot also comes early if the chief's full bag has nowhere to go (grill full both ways)
    if (!this._trashEarly && this.player.room <= 0 && this.tutorial && (this.trashCheckT = (this.trashCheckT || 0) - dt) <= 0) {
      this.trashCheckT = 0.5;
      const types = new Set(this.player.stack.items.map((i) => i.type));
      if (![...types].some((ty) => this.tutorial.destination(ty))) this._trashEarly = true;
    }
    this.trash.setEnabled(this.progress.isDone('hire_fisherman') || !!this._trashEarly);
    if (this.trash.update(dt)) on = true;
    return on;
  }

  /** true when the station that takes `item` can neither accept more input nor make more output (gathering would only fill the bag with things nobody takes) */
  stationBlocked(item) {
    const st = this.stationByInput && this.stationByInput[item];
    return !!(st && st.enabled && st.inStack.full && st.outStack.full);
  }

  fullToast() {
    this._fullT = this._fullT || 0;
    if (this.time.now - this._fullT > 2500) { this._fullT = this.time.now; this.ui.toast(t('stationFull')); }
  }

  // ------------------------------------------------------------------ save / load
  serialize() {
    const st = {};
    for (const s of this.stationList) st[s.id] = s.serialize();
    // (v3.5) what raw porters carry goes back to the pile (or on into the input they are heading for)
    const piles = {};
    for (const id in this.piles) piles[id] = this.piles[id].serialize();
    const toStation = (sid, n) => { if (st[sid]) st[sid].i = (st[sid].i || 0) + n; };
    for (const r of this.rawPorters) {
      const n = r.stack.count + r.stack.incoming;
      if (!n) continue;
      if (r.dest && r.dest.station) toStation(r.dest.station.id, n);
      else piles[r.pile.id] = (piles[r.pile.id] || 0) + n;
    }
    // items in mid-air are saved where they are going; food a waiting customer got but has not paid for
    // yet (the queue is not saved) goes back on the shelf, and so do goods on their way to the merchant
    const shelf = (stock, types, extra) => { const o = {}; for (const ty of types) o[ty] = stock.countWithIncoming(ty) + ((extra && extra[ty]) || 0); return o; };
    const unpaid = {};
    for (const c of this.market.queue) for (const ty of c.bought.concat(c.flying || [])) unpaid[ty] = (unpaid[ty] || 0) + 1;
    // goods a porter is carrying are saved where they are going (v3: the place it is heading for;
    // sites and hire pads count them themselves)
    const tradeExtra = Object.assign({}, this.trade.flying);
    const storeExtra = {}, whExtra = {}, foodExtra = {}, wsExtra = {}, dockExtra = {};
    const add = (o, ty) => { o[ty] = (o[ty] || 0) + 1; };
    for (const pr of this.porters) {
      const d = pr.dest;
      if (d && (d.kind === 'plot' || d.kind === 'tower' || d.items)) continue;
      for (const ty of pr.stack.items.map((i) => i.type).concat(pr.stack.inTypes)) {
        if (d && d.station && this.stations[d.station.id] === d.station) toStation(d.station.id, 1);
        else if (d && this.store && d === this.store.sink) add(storeExtra, ty);
        else if (d && this.warehouse && d === this.warehouse.sink) add(whExtra, ty);
        else if (d && d === this.foodBox) add(foodExtra, ty);
        else if (d && d.id && /_in$/.test(d.id) && d.id !== 'grill_in') { const k = d.id.replace(/_in$/, ''); (wsExtra[k] = wsExtra[k] || {})[ty] = ((wsExtra[k] || {})[ty] || 0) + 1; }
        else if (FOODS.indexOf(ty) >= 0) add(unpaid, ty);
        else if (GOODS.indexOf(ty) >= 0) add(tradeExtra, ty);
        else if (STORE_GOODS.indexOf(ty) >= 0) add(storeExtra, ty);
        else if (ty === 'item_fish_raw' || ty === 'item_fish_big') add(dockExtra, ty);
        else add(whExtra, ty);
      }
    }
    for (const c of this.store ? this.store.queue : []) for (const ty of c.bought.concat(c.flying || [])) add(storeExtra, ty);
    const merge = (a, b) => { const o = Object.assign({}, a || {}); for (const k in b) o[k] = (o[k] || 0) + b[k]; return o; };
    const sites = {};
    for (const id in this.sites) { const d = this.sites[id].serialize(); if (d) sites[id] = d; }
    const wss = {};
    for (const w of this.workshops) { const d = w.serialize(); if (wsExtra[w.kind]) d.ins = merge(d.ins, wsExtra[w.kind]); wss[w.kind] = d; }
    const food = this.foodBox ? this.foodBox.serialize() : null;
    if (food) food.food = merge(food.food, foodExtra);
    const dock = this.boathouse ? this.boathouse.serialize() : null;
    if (dock) dock.catch = merge(dock.catch, dockExtra);
    const v3 = {
      warehouse: this.warehouse ? merge(this.warehouse.serialize(), whExtra) : undefined,
      food, dock, workshops: wss,
      store: this.store ? { stock: shelf(this.store.stock, STORE_GOODS, storeExtra), cash: this.store.cash.serialize() } : undefined,
    };
    const pl = this.player.stack;
    return {
      territory: this.territory.serialize(),
      sites,
      v3,
      coins: this.economy.coins,
      progress: this.progress.serialize(),
      stations: st,
      market: { stock: shelf(this.market.stock, FOODS, unpaid), cash: this.market.cash.serialize() },
      trade: { stock: shelf(this.trade.stock, GOODS, tradeExtra), cash: this.trade.cash.serialize() },
      player: { x: Math.round(this.player.x), y: Math.round(this.player.y), stack: pl.items.map((i) => i.type).concat(pl.inTypes) },
      life: this.life ? this.life.serialize() : undefined,
      labour: { piles },
      dog: this.dog ? this.dog.serialize() : undefined,
    };
  }

  save(force) {
    if (this.resetting || this._broken || !this.player) return;
    const ok = Save.write(this.serialize());
    if (!ok && !this._saveWarned) { this._saveWarned = true; this.ui.toast(t('noSave')); }
  }

  restore(sv) {
    const fx = this.effects;
    if (sv.stations) for (const s of this.stationList) s.restore(sv.stations[s.id]);
    const fill = (stock, obj, max) => { if (!obj) return; for (const ty in obj) for (let i = 0; i < Math.min(max, obj[ty] || 0); i++) stock.push(ty, null, fx); };
    if (sv.market) { fill(this.market.stock, sv.market.stock, this.market.maxPerType); this.market.cash.restore(sv.market.cash); }
    if (sv.trade) { fill(this.trade.stock, sv.trade.stock, this.trade.maxPerType); this.trade.cash.restore(sv.trade.cash); }
    if (sv.player && sv.player.stack) for (const ty of sv.player.stack.slice(0, this.player.capacity)) this.player.stack.push(ty, null, fx);
    this.market.restoreQueue(BALANCE.start.firstCustomers);
  }

  resetProgress() {
    this.resetting = true;
    Save.clear();
    Input.release();
    Audio.stopMusic();
    this.scene.stop('UI');
    this.scene.restart({ fresh: true });
    this.resetting = false;
  }

  // ------------------------------------------------------------------ test hooks
  installHooks() {
    const gs = this;
    const hooks = window.__FV || {};
    Object.assign(hooks, {
      game: this.game,
      scene: gs,
      state() {
        const p = gs.player;
        return {
          coins: gs.economy.coins,
          player: { x: Math.round(p.x), y: Math.round(p.y), anim: p.animName, stack: p.stack.items.map((i) => i.type), capacity: p.capacity },
          done: Object.keys(gs.progress.done).filter((k) => gs.progress.done[k]),
          upgrades: Object.assign({}, gs.progress.up),
          stations: Object.fromEntries(gs.stationList.map((s) => [s.id, { enabled: s.enabled, in: s.inStack.count, out: s.outStack.count, working: s.working }])),
          market: { stock: gs.market.stock.count, cash: gs.market.cash.value, queue: gs.market.queue.length, waitingPay: gs.market.waitingPay, staffed: gs.market.register.staffed, clerk: !!gs.market.register.clerk },
          trade: { enabled: gs.trade.enabled, stock: gs.trade.stock.count, cash: gs.trade.cash.value, staffed: gs.trade.register.staffed, clerk: !!gs.trade.register.clerk },
          workers: gs.workers.map((w) => ({ type: w.type, state: w.state, carry: w.stack.count })),
          porters: gs.porters.map((w) => ({ station: w.station ? w.station.id : 'warehouse', key: w.key, state: w.state, carry: w.stack.count, type: w.carriedType ? w.carriedType() : null, dest: w.dest ? w.dest.id : null, x: Math.round(w.x), y: Math.round(w.y) })),
          flags: Object.assign({}, gs.progress.flags),
          residents: gs.life ? gs.life.residents.length : 0,
          // (v3)
          territory: Object.fromEntries(Object.keys(gs.territory.regions).map((k) => [k, gs.territory.regions[k].open])),
          sites: Object.fromEntries(Object.keys(gs.sites).filter((k) => gs.sites[k].shown || gs.sites[k].state !== 'plot').map((k) => { const st = gs.sites[k]; return [k, { state: st.state, b: st.building, shown: st.shown, need: st.need, got: Object.fromEntries(MATERIALS.map((m) => [m, st.stock.countOf(m)])), t: Math.round(st.buildT * 10) / 10 }]; })),
          built: Object.assign({}, gs.built),
          food: gs.foodBox ? { active: gs.foodBox.active, count: gs.foodBox.count, eaten: gs.foodBox.eaten } : null,
          hungry: gs.workers.filter((w) => w.hungry).length,
          warehouse: gs.warehouse ? { total: gs.warehouse.total, counts: Object.assign({}, gs.warehouse.counts) } : null,
          workshops: Object.fromEntries(gs.workshops.map((w) => [w.kind, { in: w.inStack.count, out: w.outStack.count, outs: w.serialize().outs, working: w.working }])),
          store: gs.store ? { stock: gs.store.stock.count, cash: gs.store.cash.value, queue: gs.store.queue.length, clerk: !!gs.store.register.clerk, waitingPay: gs.store.waitingPay } : null,
          boat: gs.boathouse && gs.boathouse.boat ? { level: gs.boathouse.level, state: gs.boathouse.boat.state, cargo: gs.boathouse.boat.cargo.count, x: Math.round(gs.boathouse.boat.x), y: Math.round(gs.boathouse.boat.y), catch: gs.boathouse.outStack.count } : null,
          population: gs.life ? { people: gs.life.people(), cap: gs.popCap(), waiting: gs.life.waiting.length } : null,
          goal: gs.progress.nextGoal() ? gs.progress.nextGoal().id : null,
          // (v3.5) division of labour + the dog
          ops: Object.fromEntries(gs.stationList.concat(gs.workshops).filter((x) => x.op).map((x) => [x.id, { hired: !!x.op.operator, ready: !!(x.op.operator && x.op.operator.ready), key: x.op.operator ? x.op.operator.key : null, anim: x.op.operator ? x.op.operator.animRes : null, chief: x.op.chief, working: x.working, in: x.inStack.count, out: x.outStack.count }])),
          piles: Object.fromEntries(Object.keys(gs.piles).map((k) => [k, { n: gs.piles[k].count, shown: gs.piles[k].shown }])),
          rawPorters: gs.rawPorters.map((w) => ({ station: w.target.id, key: w.key, state: w.state, carry: w.stack.count, dest: w.dest ? w.dest.id : null, x: Math.round(w.x), y: Math.round(w.y) })),
          workerKeys: gs.workers.map((w) => w.wantKey || w.key),
          dog: gs.dog ? gs.dog.state() : null,
          v3Complete: gs.progress.v3Complete, celebrated3: gs.progress.celebrated3,
          zoom: Math.round(gs.zoomCur * 100) / 100,
          zones: Object.fromEntries(Object.keys(gs.zones).map((k) => [k, gs.zones[k].unlocked])),
          objective: gs.tutorial.textKey,
          pads: Object.keys(gs.progress.pads),
          fps: Math.round(gs.game.loop.actualFps),
        };
      },
      give(c) { gs.economy.add(Math.floor(c || 0)); return gs.economy.coins; },
      unlockAll() {
        const pr = gs.progress;
        for (const s of STEPS) {
          if (pr.done[s.id] || s.v3) continue;     // (v3 steps: unlockV3)
          pr.done[s.id] = true;
          const pad = pr.pads[s.id];
          if (pad) { pad.destroy(); delete pr.pads[s.id]; }
          pr.applyStep(s, true);
          if (gs.life) gs.life.stepInstant(s.id);
        }
        if (gs.life && !pr.flags.firstSale) gs.life.stepInstant('first_sale');
        pr.flags.firstSale = true; pr.flags.firstTrade = true;
        pr.openBench(true);
        pr.celebrated = true;
        for (const z of ['forest', 'farm', 'mine', 'hunt']) pr.hints[z] = true;
        pr.syncPads();
        gs.refreshSites();
        gs.save(true);
        return Object.keys(pr.done);
      },
      teleport(x, y) { gs.player.x = x; gs.player.y = y; gs.camTarget.x = x; gs.camTarget.y = y - 30; gs.player.sync(0); },
      setInput(vx, vy) { Input.override = (vx || vy) ? { x: vx, y: vy } : null; },
      where(name) {
        const S = gs.stations;
        const m = {
          net: gs.net.gather, grillIn: S.grill.inPad, grillOut: S.grill.outPad, shelf: gs.market.shelf, cash: gs.market.cash.pad,
          tradeShelf: gs.trade.shelf, tradeCash: gs.trade.cash.pad, bench: gs.bench, trash: gs.trash,
          register: gs.market.register, tradeRegister: gs.trade.register,
        };
        for (const s of gs.stationList) { m[s.id + 'In'] = s.inPad; m[s.id + 'Out'] = s.outPad; }
        for (const id in gs.progress.pads) m[id] = gs.progress.pads[id];
        for (const k in gs.progress.upPads) m['up_' + k] = gs.progress.upPads[k];
        for (const id in gs.zones) m['zone:' + id] = { x: gs.zones[id].cfg.center[0], y: gs.zones[id].cfg.center[1] };
        // (v3)
        for (const id in gs.sites) { const st = gs.sites[id]; m['plot:' + id] = { x: st.dropX, y: st.dropY }; m['site:' + id] = st; }
        for (const w of gs.workshops) { m[w.kind + 'In'] = w.inPad; m[w.kind + 'Out'] = w.outPad; m[w.kind] = w; }
        if (gs.foodBox) m.foodBox = gs.foodBox;
        if (gs.warehouse) { m.warehouseIn = gs.warehouse.inPad; m.warehouseOut = gs.warehouse.outPad; m.warehouse = gs.warehouse; }
        if (gs.store) { m.storeShelf = gs.store.shelf; m.storeCash = gs.store.cash.pad; m.storeRegister = gs.store.register; m.store = gs.store; }
        if (gs.boathouse) { m.dockOut = gs.boathouse.outPad; m.boathouse = gs.boathouse; if (gs.boathouse.boat) m.boat = gs.boathouse.boat; }
        for (const id in gs.towers) m['tower:' + id] = gs.towers[id];
        // (v3.5) work spots, operator posts, collection piles
        for (const x of gs.stationList.concat(gs.workshops)) if (x.op) { m['op:' + x.id] = x.op; m['post:' + x.id] = x.op.post; }
        for (const id in gs.piles) m['pile:' + id] = gs.piles[id];
        if (gs.dog && gs.dog.r) m.dog = gs.dog.r;
        for (const id in gs.territory.regions) { const r = gs.territory.regions[id]; const c = r.cfg.center || [(r.rect[0] + r.rect[2]) / 2, (r.rect[1] + r.rect[3]) / 2]; m['region:' + id] = { x: c[0], y: c[1] }; }
        if (name === 'tree') { const tr = gs.trees.find((n) => n.ready()); return tr && tr.standPoint(tr.x + 60, tr.y + 30); }
        if (name === 'rock') { const n = gs.rocks.find((r) => r.ready()); return n && n.standPoint(n.x + 80, n.y + 60); }
        if (name === 'wheat') { const n = gs.wheat.find((r) => r.ready()); return n && n.standPoint(n.x - 60, n.y + 30); }
        if (name === 'animal') { const n = gs.animals.find((a) => a.ready() && !a.targetedBy) || gs.animals.find((a) => a.ready()); return n && { x: Math.round(n.x - 30), y: Math.round(n.y + 10) }; }
        const o = m[name];
        return o ? { x: Math.round(o.x), y: Math.round(o.y) } : null;
      },
      camera(x, y, zoom) {
        const cam = gs.cameras.main;
        gs.overview = false;
        if (zoom) { gs.zoomCur = gs.zoomTarget = zoom; cam.setZoom(zoom * View.k); if (zoom < 0.7) { cam.removeBounds(); gs._freeCam = true; } }
        if (x !== undefined) { gs.focusCamera(x, y, 1e9); gs.camTarget.x = x; gs.camTarget.y = y; cam.centerOn(x, y); }
        else { gs.camFocus = null; gs._freeCam = false; gs.zoomCur = gs.zoomTarget = BALANCE.camera.zoom; cam.setZoom(gs.zoomCur * View.k); gs.resetBounds(); }
      },
      /** (v2) player zoom like the buttons: zoom(z) sets it, zoom('in'|'out'|'overview') */
      zoom(z) {
        if (z === 'in') gs.zoomBy(BALANCE.camera.zoomStep);
        else if (z === 'out') gs.zoomBy(1 / BALANCE.camera.zoomStep);
        else if (z === 'overview') gs.toggleOverview();
        else if (Number.isFinite(z)) gs.setZoom(z);
        return { target: gs.zoomTarget, cur: gs.zoomCur, overview: gs.overview };
      },
      /** (v2) make a village-life event happen now (chat, snowball, tag, concert, snowman, cheer, party, wave, shiver, sit, tap, tapPet, moveIn) */
      lifeEvent(name) { return gs.life ? gs.life.trigger(name) : false; },
      life() { return gs.life ? gs.life.state() : null; },
      /** (v2) tap at a world point (resident / pet reactions) */
      tapWorld(x, y) { const r = gs.life && gs.life.tap(x, y); return r ? r.key : null; },
      roads(ax, ay, bx, by) { return gs.roads.route(ax, ay, bx, by, []).map((p) => [Math.round(p.x), Math.round(p.y)]); },
      // ---------------- (v3) test helpers
      /** choose building `bkey` on plot `id` like the build menu (pays its coins); false if not allowed */
      build(id, bkey) { const st = gs.sites[id]; return st ? gs.tryBuild(st, bkey) : false; },
      /** the build menu's cards for plot `id` */
      choices(id) { const st = gs.sites[id]; return st ? gs.buildChoices(st).map((c) => ({ key: c.key, locked: c.locked, reason: c.reason, coins: c.cost.coins })) : null; },
      openMenu(id) { const st = gs.sites[id]; if (st) gs.openBuildMenu(st); return !!st; },
      /** put every missing material on a site at once (test setup) */
      supply(id) { const st = gs.sites[id]; if (!st || st.state !== 'foundation') return false; for (const m in st.need) while (st.stock.countWithIncoming(m) < st.need[m]) st.stock.push(m, null, gs.effects); return true; },
      /** finish a site's building right now (no scaffold time) */
      finishSite(id) { const st = gs.sites[id]; if (!st || st.state === 'plot' || st.state === 'done') return false; st.finish(false); return true; },
      /** v3 shortcut for tests: open every land and put a building on chosen plots (instant) */
      unlockV3(plan) {
        const P = plan || { e_m1: 'toolsmith', e_dock: 'boathouse', e_m2: 'warehouse', s_m1: 'cannery', s_m2: 'store', v_house1: 'house_a', v_house2: 'house_b' };
        hooks.unlockAll();
        const pr = gs.progress;
        for (const tw of ['tower_east', 'tower_south', 'tower_se']) {
          if (!pr.done[tw]) { pr.done[tw] = true; const pad = pr.pads[tw]; if (pad) { pad.destroy(); delete pr.pads[tw]; } }
          const st = gs.sites[tw] || gs.makeTowerSite(tw);
          if (st.state === 'plot') st.start('watchtower', { instant: true });
          if (st.state !== 'done') st.finish(true);
        }
        gs.refreshSites();
        for (const id in P) { const st = gs.sites[id]; if (!st || st.state !== 'plot') continue; st.start(P[id], { instant: true }); st.finish(true); }
        if (gs.foodBox && !gs.foodBox.active) gs.foodBox.activate(true, 10);
        // (v3.5) the new workshops come with their operators (like the v3 smith)
        for (const id of ['op_toolsmith', 'op_cannery']) hooks.doneStep(id);
        pr.flags.fedMiners = true;
        pr.syncPads();
        gs.save(true);
        return Object.assign({}, gs.built);
      },
      /** complete a pad step now (v3 pads included: towers start their site, boats sail) */
      completeStep(id) { const s = STEPS.find((q) => q.id === id); const pad = gs.progress.pads[id]; if (!s || !pad) return false; if (pad.items) for (const k in pad.items) pad.got[k] = pad.items[k]; pad.paid = pad.cost; pad.complete(); return true; },
      /** (v3.5) mark a step done right away (its worker / operator / porter appears at its place) */
      doneStep(id) {
        const pr = gs.progress, s = STEPS.find((q) => q.id === id);
        if (!s || pr.done[id]) return false;
        pr.done[id] = true;
        const pad = pr.pads[id]; if (pad) { pad.destroy(); delete pr.pads[id]; }
        pr.applyStep(s, true);
        if (gs.life) gs.life.stepInstant(id);
        pr.syncPads();
        return true;
      },
      /** (v3.5) dog play: 'whistle' | 'treat' | 'play' | 'pet' | 'tap' (returns false when not possible now) */
      dog(cmd) { return gs.dog ? gs.dog.command(cmd) : false; },
      save() { gs.save(true); },
      clearStack() { gs.player.stack.clear(gs.effects); gs.player.node = null; return 0; },
      reset() { gs.resetProgress(); },
      warnings() { return Array.from(Assets.warned); },
    });
    window.__FV = hooks;
  }
}
