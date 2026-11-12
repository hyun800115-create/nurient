// The village: builds the world from data/world.js, runs every entity and system,
// saves/loads, and installs the window.__FV test hooks.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { Input } from '../core/Input.js';
import { Save, Settings, X43, SLICES43 } from '../core/Save.js';
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
// ---- (v4.2.0.1) the first-run tutorial (a finger shows what to do)
import { Onboarding } from '../systems/Onboarding.js';
import { Player } from '../entities/Player.js';
import { Worker, Porter } from '../entities/Worker.js';
import { Roads } from '../systems/Roads.js';
import { VillageLife } from '../systems/VillageLife.js';
import { Occlusion } from '../systems/Occlusion.js';
import { Perf } from '../core/Perf.js';
import { Culler } from '../systems/Culler.js';
import { Animal } from '../entities/Animal.js';
import { Station } from '../entities/Station.js';
import { Market, StageMarket, FOODS, GOODS, SHOP_FOODS } from '../entities/Seller.js';
import { Bakery43, BakeryStation } from '../entities/Bakery43.js';
import { Tree, Rock, Wheat } from '../entities/ResourceNode.js';
import { FishingDeck } from '../entities/FishingDeck.js';
import { Workshop43 } from '../entities/Workshop43.js';
import { TrashPad } from '../entities/TrashPad.js';
import { rng } from '../core/Placeholders.js';
import { View } from '../core/View.js';
// (v3) territory, construction, production chains
import { Territory } from '../systems/Territory.js';
import { Logistics, PRIO } from '../systems/Logistics.js';
import { Site, buildCost } from '../entities/Site.js';
import { Workshop } from '../entities/Workshop.js';
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
import { Residency } from '../core/Residency.js';
import { STORE_GOODS, TOOLS, MATERIALS, BAKERY_GOODS, priceOf } from '../data/items.js';
// ---- (v4-A) the neighbour town, the snow train, day and night
import { Neighbours } from '../systems/Neighbours.js';
// ---- (v4-C) the west strip: the town hall, the big restaurant, decor, settlers, houses that can always be built
import { Civic, isDecor } from '../systems/Civic.js';
import { TownHall } from '../entities/TownHall.js';
import { BigRestaurant } from '../entities/BigRestaurant.js';
import { Amenity } from '../entities/Amenity.js';
// ---- (v4-C2) the living water (docs/build_reports/water.md §6)
import { WaterSheets, WaterBudget } from '../systems/Water.js';
import { WATER_DATA } from '../core/Assets.js';
// ---- (v4.2.0.2) 관리자 모드: a new game asks for the 7 taps + PIN again
import { adminSceneStart } from '../systems/Admin.js';
// ---- (v4-C2) 눈꽃말, the village voices (docs/build_reports/voice.md §7)
import { attachVillageVoice } from '../voice/phaser.js';
import { voiceFor } from '../voice/cast.js';
// ---- (v4-C2) 주민과 수다 떨기 (docs/build_reports/chat.md)
import { ResidentChat } from '../systems/ResidentChat.js';
import { newChatId } from '../core/Save.js';
// ---- (v4.2) 촌장의 하루 (docs/v42_plan.md): the orchestrator and its systems
import { buildV42 } from '../systems/v42/index.js';
// ---- (v4.3 마을 깃발) the village's own flag on every pole (+ the new-game maker, the one-time card)
import { VillageFlags } from '../flag/VillageFlags.js';
// ---- (v4.3 step B, B0) the step-B seams: hidden plots get no Site; gs.v43 (the save's v43 block); the after-load hooks
import { isHidden } from '../systems/plotRules.js';
import { runAfterLoad, v43Holder } from '../systems/v43/index.js';
/** (v4.3 step B, L1) is (x, y) inside polygon P ([[x, y], …], screen px)? (the reserves' ground) */
const inPoly43 = (P, x, y) => { let c = false; for (let a = 0, b = P.length - 1; a < P.length; b = a++) { const [xa, ya] = P[a], [xb, yb] = P[b]; if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) c = !c; } return c; };

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
/** (v4-B, v3.5 known issue) a pine standing just in front of (below) a pile hides the pile and its label */
function hidesPile(x, y) {
  return pileSpots().some(([ax, ay]) => gdist(x, y, ax, ay) < 80 || (y > ay && y - ay < 150 && Math.abs(x - ax) < 110));
}

class UIProxy {
  constructor(game) { this.game = game; }
  get s() { const s = this.game.scene.getScene('UI'); return s && s.ready && s.sys.isActive() ? s : null; }
  setCoins(v, ms) { const s = this.s; if (s) s.setCoins(v, ms); }
  coinFly(wx, wy, n) { const s = this.s; if (s) s.coinFly(wx, wy, n); }
  toast(msg) { const s = this.s; if (s) s.toast(msg); }
  banner(msg, sub, opts) { const s = this.s; if (s) s.banner(msg, sub, opts); }
  setObjective(key, tg, text) { const s = this.s; if (s) s.setObjective(key, tg, text); }
  celebrate(v3) { const s = this.s; if (s) s.celebrate(v3); }
  openBuildMenu(site) { const s = this.s; if (s && s.openBuildMenu) s.openBuildMenu(site); }
  setPopulation(n, cap, waiting) { const s = this.s; if (s && s.setPopulation) s.setPopulation(n, cap, waiting); }
  zoomChanged() { const s = this.s; if (s && s.zoomChanged) s.zoomChanged(); }
  // ---- (v4-B) the order board / rank panels, the ceremony's badge
  openOrders() { const s = this.s; if (s && s.openOrders) s.openOrders(); }
  openRank() { const s = this.s; if (s && s.openRank) s.openRank(); }
  rankBadgeFly(wx, wy) { const s = this.s; if (s && s.rankBadgeFly) s.rankBadgeFly(wx, wy); }
  hudBottomFrac() { const s = this.s; return s && s.hudBottomFrac ? s.hudBottomFrac() : 0.24; }
  // ---- (v4.2) the panels' flags (관망 waits while one is open) and the v4.2 HUD / office panel
  get panelOpen() { const s = this.s; return !!(s && s.panelOpen); }
  get buildOpen() { const s = this.s; return !!(s && s.buildOpen); }
  get v4PanelOpen() { const s = this.s; return !!(s && s.v4PanelOpen); }
  get v42PanelOpen() { const s = this.s; return !!(s && s.v42PanelOpen); }
  get officePanel() { const s = this.s; return s ? s.officePanel || null : null; }
  get hud42() { const s = this.s; return s ? s.hud42 || null : null; }
}

const NO_AGENTS = [];

export class Game extends Phaser.Scene {
  constructor() { super('Game'); }

  // ((v4.2.0.1) broken: a quarantine restart — an existing player whose save broke, not a new player: no first-run tutorial)
  init(data) { this.fresh = !!(data && data.fresh); this.brokenRestart = !!(data && data.broken); }

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
      this.time.delayedCall(0, () => this.scene.restart({ fresh: true, broken: true }));
    }
  }

  build() {
    // ((v4.2 fix, robust M2) a new game (처음부터, a quarantine restart) starts in silence: every ambience bed the last
    //  scene asked for (the office, the wheel squeal, …) is set again by whoever plays it now
    for (const k in Audio.ambTarget) Audio.ambTarget[k] = 0;
    const W = WORLD.width, H = WORLD.height;
    this.W = W; this.H = H;
    this.font = FONT;
    this.ui = new UIProxy(this.game);
    this.saved = this.fresh ? null : Save.load();
    // ---- (v4.3 step B, S3) a held save (a village from a newer build): this game runs a fresh village that is never
    //  saved, under the card (UI scene, SaveHoldCard); onboarding and the flag maker stay shut (Save.lastUnreadable)
    this.saveHold = Save.held ? { why: Save.held, info: Save.newer || Save.failed || null } : null;
    const sv = this.saved || {};

    this.collision = new Collision(W, H);
    this.effects = new Effects(this);
    this.depthSort = new DepthSort();
    this.agents = [];          // moving characters (workers, customers) for separation
    this.workers = [];
    this.porters = [];
    this.interiors = [];        // (v4.2) cutaway buildings: Character.sync asks them for the depth of whoever stands inside
    this.lights43 = [];         // ((v4.3) the deck's / the workshop's lanterns (Neighbours' clock lights them): new each build
    this.zones = {};
    this.zoneObjs = {};
    this.statics = [];
    this.keysInUse = new Set();   // character looks taken by clerks / porters (residents and customers avoid them)
    this.roads = new Roads((z) => !!(this.zones[z] && this.zones[z].unlocked), undefined, (r) => !this.territory || this.territory.isOpen(r));
    this.roads.blocked = (x, y) => !!(this.collision && this.collision.blocked(x, y, 12));
    // ((v4.2.0.1) the same with room to spare: a way round something keeps off the walls (Paths.gridPath)
    this.roads.wide = (x, y) => !!(this.collision && this.collision.blocked(x, y, 22));
    // ((v4.2.0.1 final, review #3) the safety net's way round is planned for the walker's own radius (Roads.detour)
    this.roads.blockedR = (x, y, r) => !!(this.collision && this.collision.blocked(x, y, r));
    this.roads.offLand = (x, y) => !!(this.collision && this.collision.offLand(x, y));
    // ((bakefix) walls a long straight route must go round (Roads.routeOpen): the bakery cottage and the wheat field's fence
    this.roads.walls = (x, y) => this.routeWallAt(x, y);
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
    // (v4-C2) the chat record's id (a new game gets a new one: an old chat village is never read into it)
    this.cid = sv.cid || newChatId();
    // ---- (v4.3 step B, B0) the v43 block: the saved one, else a new village's (lay 2, letter + tour seen), else { lay: 0 }
    //  (a loaded save without one: R43 still remaps it once S lands). Serialized as `v43`
    this.v43 = v43Holder(sv.v43, this.saved === null);
    // ---- (v4.3 step B, S2) F0's `x` drawer (later builds' small keys; in v4.3 only the play log writes): written back as it
    //  came until something sets a key (Save.js X43)
    this.x43 = new X43(sv.x);
    // ---- (v4-C) the civic buildings + settlers (before the plots and the village life: people() counts settlers)
    this.civic = new Civic(this, sv.c1);
    this.queueLate = this.queueLate || (() => this.queueLateFiles());
    Residency.attach(this);
    this.applyGfx();
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
    const X0 = Math.min(0, Number(WORLD.left) || 0);     // (v4-C) the west strip lies at negative x
    const okPos = Number.isFinite(ps.x) && Number.isFinite(ps.y) && ps.x >= X0 + 40 && ps.x <= W - 40 && ps.y >= 0 && ps.y <= H - 40;
    const sp = { x: okPos ? ps.x : WORLD.player.x, y: okPos ? ps.y : WORLD.player.y };
    if (okPos) this.collision.resolve(sp, 16, true);     // ((v4.3 sea) true: a chief saved on his landing stays there
    const px = sp.x, py = sp.y;
    this.player = new Player(this, px, py);
    this.economy = new Economy(this, sv.coins !== undefined ? sv.coins : BALANCE.start.coins);
    // ((v4.2.0.2) 관리자 모드: 「코인 무제한」 stays on over a reload; how many times the admin panel opened; the speed never
    //  outlives the scene (×1 after a reload / a new game))
    this.economy.unlimited = sv.adminInf === 1;
    this.adminUses = Math.max(0, Math.floor(Number(sv.adminUses)) || 0);
    this.simSpeed = 1;
    try { this.tweens.timeScale = 1; this.time.timeScale = 1; this.anims.globalTimeScale = 1; } catch (e) { /* (a restarted scene keeps its managers) */ }
    adminSceneStart();
    this.progress = new Progression(this, sv.progress);
    this.tutorial = new Tutorial(this);
    // ---- (v4.2.0.1) the first-run tutorial: a new village (no save, not a quarantine restart, not a save that is there but
    //  could not be read — cut off / from a newer build) gets it; a save carries its bits only when it began with it (an old
    //  save never sees it)
    this.onboard = new Onboarding(this, sv.onb, this.saved === null && !this.brokenRestart && !(!this.fresh && Save.lastUnreadable));
    this.events.once('shutdown', () => { if (this.onboard) this.onboard.destroy(); });
    // ---- (v4.3 마을 깃발) a new village (the same rule) opens the flag maker as the UI comes up; an old one keeps the classic flag
    this.flags = new VillageFlags(this, sv, this.saved === null && !this.brokenRestart && !(!this.fresh && Save.lastUnreadable));
    // ---- (v4.2) made before the sites are restored (its own sites take their saved state)
    buildV42(this, sv);

    // lock zones that are not open yet
    for (const id in this.zones) if (!this.zones[id].unlocked) this.setZoneEnabled(id, false);
    // ---- (v4-A) the neighbours: made now when the rail strip is open, else when the tower_east site starts
    Neighbours.attach(this, sv.v4);
    // (v3) construction sites and buildings come back before the steps that use them (porters, boats...)
    this.restoreV3(sv);
    this.progress.init();
    this.restore(sv);
    this.restoreV3Stock(sv);
    this.settleShopOver();
    this.restoreLabour(sv);
    if (this.v42) this.v42.afterRestore(sv);
    // ((v4.3 review CD-1) every wall stands now (the hut / the office on the moved plot): a chief saved where they stand
    //  (an old village's beach campfire, the 관망 rest spot) goes out to the yard instead of staying stuck in the walls
    if (okPos) this.unstickChief();
    // ---- (v4.3 step B, B0) the after-load hooks (src/systems/v43/index.js: N's letter, P1), once per build; a hook that
    //  throws is logged and skipped. S fills `remapped` / `refunds43`
    runAfterLoad(this, { fresh: this.saved === null, remapped: false, refunds43: null });
    // ((v4.2 final) everything that stands is solid now: the store's line once more (plot e_m1 / the farm fence))
    if (this.store) this.refreshStoreLine();
    this.events.on('built', (k) => { if (k !== 'store' && this.store) this.refreshStoreLine(); });
    this.events.on('sold', () => this.progress.setFlag('firstSale'));
    // ((v4.3) the first houses' plots open with the forest: a side goal, said once)
    //  ((review CD-5) a restarted scene keeps its emitter: the listener goes with the scene, not one more per 처음부터)
    const onStep43 = (id) => { if (id === 'zone_forest') this.time.delayedCall(9000, () => { if (this.ui && this.sites.h43_1 && this.sites.h43_1.shown) this.ui.banner(t('house43Banner'), t('house43Sub')); }); };
    this.events.on('step', onStep43);
    this.events.once('shutdown', () => this.events.off('step', onStep43));
    this.events.on('traded', () => this.progress.setFlag('firstTrade'));
    // ((v4.3 밀밭 · 빵집) an old village whose bakery just moved out of the field: said once
    if (this.progress.bakeryMovedNow) this.time.delayedCall(5000, () => { if (this.ui && this.ui.banner) this.ui.banner(t('bakeryUp'), t('bakeryMoved')); });
    // spots residents never stand on (pads)
    this.padSpots = [];
    const spot = (pd, r) => { if (pd) this.padSpots.push({ x: pd.x, y: pd.y, r }); };
    for (const st of this.stationList) { spot(st.inPad, 70); spot(st.outPad, 70); if (st.op) { spot(st.op, 64); spot(st.op.post, 40); } }
    for (const id in this.piles) spot(this.piles[id], 80);
    spot(this.market.shelf, 70); spot(this.market.cash.pad, 70); spot(this.market.register, 64);
    spot(this.trade.shelf, 70); spot(this.trade.cash.pad, 70); spot(this.trade.register, 64); spot(this.trash, 64);
    // ((v4.3 밀밭 · 빵집) a reloaded bakery was built (Progression.init) before this list existed: its stall's pads join it here
    if (this.bakery && this.bakery.built) { const S = this.bakery.stall; spot(S.shelf, 70); spot(S.cash.pad, 70); spot(S.register, 64); }
    // ((review SHOP-5) every counter's register open now (a reload at stage 3: seat B's 빵·고기 register too)
    for (const k in this.market.seats || {}) if (this.market.seats[k].enabled) spot(this.market.seats[k], 64);
    // ((v4.3) the deck's reel spot on land (where the net's gather point was): nobody stands on it but the chief
    spot(this.deck ? this.deck.gather : null, 70);
    for (const id in WORLD.pads) spot(WORLD.pads[id], 90);
    // (v3) plots / their drop pads, the food box, second-worker pads, watchtower pads, the new buildings' pads
    for (const id in this.sites) { const st = this.sites[id]; spot({ x: st.dropX, y: st.dropY }, 80); spot(st, (st.def.footprint || [272])[0] * 0.5); }
    for (const id in WORLD.pads2 || {}) spot(WORLD.pads2[id], 90);
    for (const id in WORLD.towers || {}) spot(WORLD.towers[id], 120);
    if (this.foodBox) spot(this.foodBox, 80);
    // ((v4.2.0.1) every paid pad's spot: the ones standing now; a pad made later adds its own (UnlockPad))
    for (const id in WORLD.pads35 || {}) spot(WORLD.pads35[id], 80);
    for (const p of this.paidPads()) this.addPadSpot(p.x, p.y);
    this.events.on('built', (k, site) => { const b = site.built; if (b && b.inPad) spot(b.inPad, 70); if (b && b.outPad) spot(b.outPad, 70); if (b && b.op) { spot(b.op, 64); spot(b.op.post, 40); } });
    this.events.on('storeSold', () => this.progress.setFlag('firstStoreSale'));
    this.events.on('built', (k) => { if (k === 'toolsmith') this.time.delayedCall(3500, () => this.introduceFood()); });
    this.events.on('fedMiners', () => this.progress.setFlag('fedMiners'));
    // the people of the village (v2)
    this.life = new VillageLife(this, sv.life);
    // (v3.5) Nuri the dog: whistle, treats, fetch, petting (affection is saved)
    this.dog = new DogPlay(this, sv.dog);
    // (v4-C2) the residents' voices: lazy per voice type (each type's sprite when its first resident speaks; the
    // residents already living here are fetched after the title files). null without Web Audio: the old chatter stays
    try {
      const types = [...new Set(((this.life && this.life.residents) || []).map(voiceFor).filter((tp) => tp && tp !== 'chief'))];
      this.voice = attachVillageVoice(this, { volume: typeof Settings.data.voice === 'number' ? Settings.data.voice : 1, types });
    } catch (e) { console.warn('[FrostVillage] village voices unavailable:', e && e.message); this.voice = null; }
    Audio.onImportant = () => { if (this.voice) this.voice.duck(0.35, 0.7); };
    // (v4-C2) tap a resident -> 수다 떨기 (the chat code loads the first time a chat opens)
    this.residentChat = new ResidentChat(this);
    this.events.once('shutdown', () => { Audio.onImportant = null; this.voice = null; });
    this.occlusion = new Occlusion(this);
    this.culler = new Culler(this);       // (v4-B) pictures far outside the camera are not drawn (draw calls; runs before each drawn frame)
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
    const p0 = this.player;     // ((v4.3 review CD-1) where he stands now: unstickChief may have moved him)
    const tv = this.tutorial.inTutorial && WORLD.tutorialView && gdist(p0.x, p0.y, WORLD.tutorialView[0], WORLD.tutorialView[1]) < 500 ? WORLD.tutorialView : null;
    this.camTarget = tv ? { x: tv[0], y: tv[1] } : { x: p0.x, y: p0.y - 20 };
    this.camFocus = null;     // { x, y, until } temporary pan target
    this.camPan = null;       // (v4.3) { x, y } the 관망 look-around point (CameraDirector.free), null = the usual follow
    this.camGlide = false;    // (v4.3) gliding back to the chief after a look-around
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
    this.seaAmbience(0.3);
    // (v4-C2) the sea bed starts where its breakers land with the water's crests near the camera (water.md §6.9)
    Audio.ambSeek.amb_sea_waves = () => {
      const wv = this.ground && this.ground.water, d = Assets.audioDef('amb_sea_waves');
      if (!wv || !d || !d.swellPeriod) return 0;
      const cx = this.cameras.main.worldView.centerX;
      return wv.bedSeek(cx, shoreY(cx), d.swellPhase || 0, d.swellPeriod, d.duration || 42);
    };
    this.events.once('shutdown', () => { delete Audio.ambSeek.amb_sea_waves; });
    this.wireWaterDecor();
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
    // (v3.5 review) after-title pictures the village does not need yet wait (less memory early on)
    Assets.queued.clear();
    Assets.gate = (k) => this.lazyAllowed(k);
    // who is already at work comes first (no stand-in looks after loading a save): hired operators, the
    // 2nd / 3rd workers' looks, the dog — and a new game's first operator (the cook) right after
    const pr = this.progress, ops = (WORLD.labour && WORLD.labour.ops) || {};
    const working = [];
    for (const st in ops) if (ops[st].who && (pr.isDone('op_' + st) || (st === 'grill' && !pr.isDone('op_grill')))) working.push(ops[st].who);
    for (const w of this.workers) if (w.wantKey) working.push(w.wantKey);
    working.push('pet_dog');
    // then residents who live here already
    const first = working.concat((this.life && this.life.moved) || [], ['npc_clerk_a', 'npc_clerk_b', 'npc_porter_a', 'npc_porter_b']);
    // (v3) the building / construction / boat pictures come first once they are needed (plots may be on screen)
    const n = Assets.queueLazy(this.load, first, ['bakery43', 'market_s3', 'market_s2', 'bld_sites', 'bld_buildings', 'bld_buildings_2', 'boat_rowboat', 'boat_fishing']);
    if (want.length) Assets.queueAudio(this.load, (k) => want.indexOf(k) >= 0);
    this.lazyGateT = 2;
    if (!want.length && !n) return;
    this.startLazyLoad(() => { Audio.trimLoops(); Audio.applyMusic(); });
  }

  /** (v3.5 review) may after-title file `k` load now? (the 2nd / 3rd workers' looks: once the village is
   *  complete; the v3 buildings: from the farmer on — the first house plots come with the miner) */
  lazyAllowed(k) {
    const pr = this.progress, f = Assets.fragOf[k];
    if (f === 'water' && !WATER_DATA.test(k)) return WaterSheets.allowed(k);     // (v4-C2) only the water sheets a system asked for
    if (!pr) return true;
    // ((v4.3) the shop's stage pages: stage 2 once the forest is near (its pad shows), stage 3 once the farm is open
    const ms = /^market_s([2-9])$/.exec(k);
    //  ((review CD-2) a page of an earlier stage is never fetched (stage 3 carries its own sled): 1.15 MiB less at stage 3)
    //  ((v4.3 밀밭 · 빵집) stage 3 comes after village complete now (the first smoked meat sold): fetched from the hunt on)
    if (ms) { const n = Number(ms[1]), st = this.market ? this.market.stage : 1; if (st > n) return false; return st === n || (n === 2 ? pr.isDone('hire_fisherman') : pr.isDone('zone_hunt')); }
    // ((v4.3 밀밭 · 빵집) the bakery cottage, its stall and the field's 농막 / props: once the field is next (the lumberjack hired)
    if (k === 'bakery43') return pr.isDone('hire_lumberjack') || pr.isDone('zone_farm') || pr.isDone('bld_bakery');
    if (f === 'workers') return pr.complete || pr.anyDone(/^(hire[23]_|op_toolsmith)/);
    if (f === 'buildings') return pr.complete || pr.isDone('hire_farmer') || Object.keys(this.sites || {}).some((id) => this.sites[id].state !== 'plot');
    // ---- (v4-A) late v4 files: only the ones a v4 system asked for
    if (Assets.lateFrag.has(f)) return Assets.lateAllowed(k);
    return true;
  }

  /** (v4-A) fetch the late files a v4 system just asked for (pictures and sounds) */
  queueLateFiles() {
    if (!this.load) return;
    const n = Assets.queueLazy(this.load, [], []) + Assets.queueLateAudio(this.load);
    if (n) this.startLazyLoad(() => { Audio.trimLoops(); });
  }

  /** start (or join) a background load of after-title files; their animations are made as each arrives */
  startLazyLoad(onComplete) {
    if (!this.lazyOnFile) {
      this.lazyOnFile = (key) => { try { Assets.onLazyFile(key); } catch (e) { /* keep loading */ } };
      this.load.on('filecomplete', this.lazyOnFile);
      this.events.once('shutdown', () => { this.load.off('filecomplete', this.lazyOnFile); this.lazyOnFile = null; });
    }
    this.load.once('complete', () => { if (onComplete) onComplete(); });
    if (!this.load.isLoading()) this.load.start();
  }

  /** (v3.5 review) a gated after-title file became needed: fetch it now */
  checkLazyGates(dt) {
    this.lazyGateT = (this.lazyGateT || 0) - dt;
    if (this.lazyGateT > 0) return;
    this.lazyGateT = 2;
    if (!Assets.gate) return;
    const n = Assets.queueLazy(this.load, [], ['bakery43', 'market_s2', 'market_s3', 'bld_sites', 'bld_buildings', 'bld_buildings_2', 'boat_rowboat', 'boat_fishing']);
    if (n) this.startLazyLoad();
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
    for (const st of WORLD.stations) if (st.zone === id && !st.gate) ghost(st.sprite, st.x, st.y);     // ((v4.3) not the bakery: it is built by its own step
    if (id === 'forest') for (const [mx, my, k] of [[-1.6, 1.0, 'tree_pine_a'], [1.4, -1.8, 'tree_pine_snow'], [-2.6, -1.6, 'tree_pine_b'], [0.2, -3.0, 'tree_pine_a']]) { const p = isoPt(zx, zy, mx, my); ghost(k, p.x, p.y, 0.85); }
    if (id === 'farm') { const w = WORLD.wheat; for (const [i, j] of [[0, 0], [1, 1], [2, 0], [2, 2]]) { const p = isoPt(w.origin[0], w.origin[1], (i - 1) * w.step, (j - 1) * w.step); ghost('crop_wheat_3', p.x, p.y); } }
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
    // ((v4.3 밀밭 · 빵집) a decor picture on an after-title page (the field's 농막 / scarecrow / sled: assets/bakery43) takes its real
    //  look when the page comes
    this.lazyImage(img, key);
    if (opts.flip) img.setFlipX(true);
    if (opts.scale) { img.setScale(opts.scale); img.__bs = opts.scale; }
    const r = opts.r !== undefined ? opts.r : DECOR_R[key];
    let ob = null;
    // a flipped picture is mirrored inside its frame box: its foot (and so its collider) moves too
    const fx = opts.flip ? x + (img.frame.realWidth - 2 * img.displayOriginX) * (opts.scale || 1) : x;
    if (r) ob = this.collision.add(fx, y, r * (opts.scale || 1), key);
    img.__ob = ob;
    if (opts.zone) this.addToZone(opts.zone, img);
    if (opts.region && this.territory) this.territory.add(opts.region, img, opts.until);
    this.statics.push(img);
    if (/^tree_pine|lodge|hut|tent|mine_entrance|market|trade_post|station_/.test(key)) this.addOccluder(img);
    return img;
  }

  /**
   * ((bakefix) a point on something a long straight route must go round, not slide along (Roads.routeOpen's `walls` hook):
   * the bakery cottage's ring of wall circles (an open doorway, an open floor: no round collider) and the wheat field's
   * fence (a box with two gates and an open south side). A straight line from the east to the bakery's stall ran through
   * both: its customers pressed into the fence by the 농막 (stuck.mjs), the navigator's line crossed the cottage (nav.mjs)
   */
  routeWallAt(x, y) {
    const bk = !!(this.bakery && this.bakery.built), fo = !!(this.zones && this.zones.farm && this.zones.farm.unlocked);
    const key = (bk ? 1 : 0) + (fo ? 2 : 0);
    let W = this._routeWalls;
    if (!W || W.key !== key) {
      const list = [];
      if (bk && this.bakery.station && this.bakery.station.walls) for (const w of this.bakery.station.walls) list.push(w);
      const z = WORLD.zones.farm;
      if (fo && z && this.collision) for (const o of this.collision.all) if (!o.seg && o.tag && /^fence/.test(o.tag) && inIsoRect(o.x, o.y, z.center[0], z.center[1], z.size[0] + 1.2, z.size[1] + 1.2)) list.push(o);
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const o of list) { const R = o.r + 12; x0 = Math.min(x0, o.x - R); x1 = Math.max(x1, o.x + R); y0 = Math.min(y0, o.y - R / 2); y1 = Math.max(y1, o.y + R / 2); }
      W = this._routeWalls = { key, list, x0, x1, y0, y1 };
    }
    if (!W.list.length || x < W.x0 || x > W.x1 || y < W.y0 || y > W.y1) return false;
    for (const o of W.list) if (o.active && Math.hypot(x - o.x, (y - o.y) * 2) < o.r + 12) return true;
    return false;
  }

  /** tall things fade out when the player walks behind them */
  addOccluder(img, station) {
    const h = img.displayHeight * img.originY;
    const w = img.displayWidth;
    // x / hw: the picture's box (a quick pre-test; the alpha mask decides)
    // station: (v3.5 review) a station being worked stays solid for passers-by (only the chief fades it)
    (this.occluders || (this.occluders = [])).push({ img, x: img.x + (0.5 - img.originX) * w, y: img.y, hw: w * 0.5, top: h * 0.95, a: 1, big: w > 250, station: station || null });
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
      // ((v4.3) decor with an id: the camp's tents fold when their family moves into a first house (foldTents43)
      if (o && o.id) (this.decorById || (this.decorById = {}))[o.id] = img;
      if (key === 'campfire') {
        const fire = this.effects.loop('fx_fire', x, y - 14, 58, y + 1);
        if (fire) { if (o && o.zone) this.addToZone(o.zone, fire); if (o && o.region) this.territory.add(o.region, fire); }
        else this.fireSpots = (this.fireSpots || []).concat([{ x, y, zone: o && o.zone }]);
        this.campfires = (this.campfires || []).concat([{ x, y }]);
      }
      if (key === 'lamp_post') this.lamps = (this.lamps || []).concat([img]);
      if (key === 'flag_pole') (this.flagPoleImgs || (this.flagPoleImgs = [])).push({ img, x, y });     // (v4.3) VillageFlags
      // things floating in the sea bob gently (v4-C2: on the living water's swell once it is there: wireWaterDecor)
      const inSea = (key === 'boat_small' || key === 'ice_chunk') && y < shoreY(x) + 10;
      if (inSea || key === 'dock_pier') (this.seaDecor = this.seaDecor || []).push({ key, img, x, y, o, rot: img.rotation || 0, floats: inSea });
      if (inSea) {
        const tw = this.tweens.add({ targets: img, y: y + 4, angle: { from: -1.5, to: 1.5 }, duration: 1600 + (x % 7) * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: (x % 5) * 200 });
        this.seaDecor[this.seaDecor.length - 1].tween = tw;
      }
    }
  }

  /**
   * (v4-C2, water.md §6.3) things in the sea touch the living water: the pier's posts get foam collars and the deck a
   * shadow on the water; boats and ice ride the swell (heightAt / slopeAt, every frame while on screen) instead of
   * the old sine tween. Called once the Water exists (at creation, or when its textures arrived later).
   */
  wireWaterDecor() {
    const wv = this.ground && this.ground.water;
    if (!wv || !wv.isShader || this._waterDecor === wv) return;
    this._waterDecor = wv;
    this.floaters = [];
    for (const d of this.seaDecor || []) {
      const { key, img, x, y, o } = d;
      if (key === 'dock_pier') {
        // the pier's posts stand in the water: foam collars + the deck's shadow on the water
        for (const [mx, my] of [[-0.92, 0.7], [0.92, 0.7], [-0.92, 2.2], [0.92, 2.2]]) {
          const px = x + 45.25 * (mx + my), py = y + 22.63 * (mx - my);
          if (wv.shoreDistance(px, py) > 4) wv.addContact(px, py, 7, { foam: 0.85, shadow: 0.1 });
        }
        wv.addContact(x, y, 30, { foam: 0, shadow: 0.2 });
        continue;
      }
      if (!d.floats || !img.active) continue;
      if (d.tween) { d.tween.stop(); d.tween = null; }
      img.setPosition(x, y).setAngle(0).setRotation(d.rot);
      this.floaters.push({ img, x, y, tilt: key === 'boat_small' ? 0.3 : 0.15, rot: d.rot });
      const s = (o && o.scale) || 1;
      if (key === 'boat_small') { wv.addContact(x - 34 * s, y - 17 * s, 32 * s, { foam: 0.75, shadow: 0.22 }); wv.addContact(x + 34 * s, y + 17 * s, 32 * s, { foam: 0.75, shadow: 0.22 }); }
      else wv.addContact(x, y + 2, 26 * s, { foam: 0.6, shadow: 0.12 });
    }
    // the frame-time watchdog of the automatic '물결 품질' (only while the setting is automatic and the water is high)
    this.waterBudget = !Settings.data.water && wv.quality === 'high' ? new WaterBudget() : null;
    this.waterBudgetWait = 5;          // s: not during the first seconds (decoding, after-title files)
  }

  /** (v4-C2) per frame: floaters on the swell, night light on the water, the automatic water quality, the sea bed sound */
  updateWater(dt, delta) {
    const wv = this.ground.water;
    if (!wv) return;
    if (this.floaters && this.floaters.length) {
      const sl = this._floatSlope || (this._floatSlope = { x: 0, y: 0 });
      for (const f of this.floaters) {
        if (!f.img.active || !this.isOnScreen(f.x, f.y, 120)) continue;
        wv.slopeAt(f.x, f.y, undefined, sl);
        f.img.setPosition(f.x, f.y - wv.heightAt(f.x, f.y)).setRotation(f.rot + Math.max(-0.12, Math.min(0.12, -sl.x * f.tilt)));
      }
    }
    // night: the water's own light (glints, sky reflection, crest glow) dims under the DayClock overlay
    const ck = this.v4 && this.v4.clock;
    const dark = ck && ck.on && ck.cur && Settings.data.daynight !== false ? ck.cur.a : 0;
    if (Math.abs(dark - (this._waterDark || 0)) > 0.004) { this._waterDark = dark; wv.setLighting({ dark }); }
    if (this.waterBudget && !(this.simSpeed > 1)) {     // ((v4.2.0.2) not while 관리자 모드 runs the village ×2 / ×4)
      if (this.waterBudgetWait > 0) this.waterBudgetWait -= dt;
      else {
        const v = this.cameras.main.worldView;
        const r = this.waterBudget.sample(delta, v.y < shoreY(v.centerX) - 40);
        if (r) {
          this.waterBudget = null;
          if (r === 'low' && wv.quality !== 'low') { this.ground.setWaterQuality('low'); Settings.data.water = 'low'; Settings.save(); }
        }
      }
    }
    // the sea bed (audio5 amb_sea_waves) keeps the shore-swell crests in step with its breakers
    this.bedT = (this.bedT || 0) - dt;
    if (this.bedT <= 0) {
      this.bedT = 1;
      const snd = Audio.amb && Audio.amb.amb_sea_waves, d = Assets.audioDef('amb_sea_waves');
      if (snd && snd.isPlaying && d && d.swellPeriod) {
        const cx = this.cameras.main.worldView.centerX;
        const c = (snd.seek - (d.swellPhase || 0)) / d.swellPeriod;
        wv.syncPhase(c - Math.floor(c), cx, shoreY(cx));
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
    // ((v4.3) the fishing deck's reel spot and gangway foot keep clear as the net did)
    const spots = [[WORLD.deck.reel[0], WORLD.deck.reel[1], 170], [WORLD.deck.foot[0], WORLD.deck.foot[1], 120], [WORLD.player.x, WORLD.player.y, 120]];
    for (const id in WORLD.pads) { const p = WORLD.pads[id]; spots.push([p.x, p.y, 120]); if (p.hut) spots.push([p.hut[0], p.hut[1], 150]); }
    for (const d of WORLD.decor) if (/lodge|tent|pier|flag|campfire/.test(d[0])) spots.push([d[1], d[2], d[0] === 'chief_lodge' ? 230 : 120]);
    // (v3) building plots, watchtowers, pads of the new chains: room for the building and its pads
    const PR = { S: 190, M: 250, L: 310 };
    // ((v4.3 step B, plot table v2) a hidden plot (w_civic, d_school, d_clinic, d_labour: no Site, no pad) keeps only its own
    //  ground diamond (+ 20 px) and its `clear` spots free: the land is kept, the forest round it does not move)
    const FPH = { S: [181, 91], M: [272, 136], L: [362, 181], XL: [525, 262] };
    // (a pine in front of a plot would hide its pad and label behind its canopy)
    for (const id in WORLD.plots || {}) {
      const p = WORLD.plots[id];
      if (isHidden(p)) {
        const f = FPH[p.size] || FPH.M;
        if (Math.abs(x - p.x) / (f[0] / 2 + 20) + Math.abs(y - p.y) / (f[1] / 2 + 10) < 1) return true;
      } else { spots.push([p.x, p.y, PR[p.size] || 250]); spots.push([p.x, p.y + 100, 150]); spots.push([p.x, p.y + 220, 200]); }
      // ((v4 review) world.js plots.<id>.clear: more room in front of a plot — the town hall's little square)
      for (const c of Array.isArray(p.clear) ? p.clear : []) if (Array.isArray(c) && c.length >= 3) spots.push([p.x + c[0], p.y + c[1], c[2]]);
    }
    for (const id in WORLD.towers || {}) { const p = WORLD.towers[id]; spots.push([p.x, p.y, 170]); spots.push([p.x, p.y + 70, 130]); spots.push([p.x, p.y + 190, 160]); }
    for (const id in WORLD.pads2 || {}) { const p = WORLD.pads2[id]; spots.push([p.x, p.y, 120]); }
    if (WORLD.foodBox) spots.push([WORLD.foodBox.x, WORLD.foodBox.y, 140]);
    for (const q of pileSpots()) spots.push(q);
    // ((v4.3 밀밭 · 빵집) the bakery cottage, its stall, the line and its LINE / P2 pads keep clear (world.js bakery43.decorClear)
    for (const q of (WORLD.bakery43 && WORLD.bakery43.decorClear) || []) spots.push(q);
    // ((v4.3 step B, 광장 1) the 한마당 reserve (world.js WORLD.reserves): no new pine there, its trunk or its canopy)
    for (const id in WORLD.reserves || {}) {
      const P = WORLD.reserves[id].poly;
      if (Array.isArray(P) && (inPoly43(P, x, y) || inPoly43(P, x, y - 90))) return true;
    }
    for (const [sx, sy, r] of spots) if (gdist(x, y, sx, sy) < r) return true;
    return false;
  }

  buildTrees() {
    // decorative border forest
    const r = rng(1234);
    const kinds = ['tree_pine_a', 'tree_pine_b', 'tree_pine_snow', 'tree_pine_snow'];
    const X0 = Math.min(0, Number(WORLD.left) || 0);
    const gaps = (WORLD.v42 && WORLD.v42.treeGaps) || [];
    for (const [x0, y0, x1, y1, step, region, until] of WORLD.borderTrees) {
      // (v4-C) a band that makes room for land open from the start (the old west edge, beside the west strip) is
      // not made at all — its random numbers are still drawn, so every other pine stays exactly where it was
      const skip = !!(until && this.territory.regions[until] && this.territory.regions[until].cfg.open === true);
      let row = 0;
      for (let y = y0; y <= y1; y += step * 0.55, row++) {
        for (let x = x0; x <= x1; x += step) {
          const x2 = x + (r() - 0.5) * step * 0.6 + ((row % 2) * step) / 2;
          const y2 = y + (r() - 0.5) * step * 0.3;
          const k = kinds[Math.floor(r() * kinds.length)], fl = r() < 0.5, sc = 0.9 + r() * 0.25;
          if (skip || y2 < shoreY(x2) + 40 || this.blockedForDecor(x2, y2) || x2 > this.W - 20 || x2 < X0 + 20 || y2 > this.H) continue;
          // ((v4.2) gaps in the border forest: the town loop of the railway, the depot's dock apron)
          if (gaps.some((g) => x2 >= g[0] && x2 <= g[2] && y2 >= g[1] && y2 <= g[3])) continue;
          this.staticImage(k, x2, y2, { r: 24, flip: fl, scale: sc, region: region || this.territory.regionAt(x2, y2), until });   // (v4-A) until: gone when that land opens
        }
      }
    }
    for (const [x, y, k, region] of WORLD.extraTrees) if (!this.blockedForDecor(x, y)) this.staticImage(k, x, y, { r: 24, flip: x % 2 === 0, region: region || null });
  }

  buildResources() {
    // ((v4.3) the fishing deck on the water (start zone): it keeps the old net's surface, so `net` stays its name too
    this.deck = this.net = new FishingDeck(this, WORLD.deck);
    this.events.once('shutdown', () => { if (this.deck) this.deck.destroy(); });
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
        if (hidesPile(p.x, p.y)) continue;
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
      if (hidesPile(p.x, p.y)) continue;
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
    const skip = (i, j) => Array.isArray(w.skip) && w.skip.some((q) => Array.isArray(q) && q[0] === i && q[1] === j);
    for (let i = 0; i < w.rows; i++) {
      for (let j = 0; j < w.cols; j++) {
        if (skip(i, j)) continue;   // (v3.5 review) the oven's work spot stays clear of wheat
        const p = isoPt(w.origin[0], w.origin[1], (i - (w.rows - 1) / 2) * w.step, (j - (w.cols - 1) / 2) * w.step);
        const wh = new Wheat(this, p.x, p.y);
        this.wheat.push(wh);
        this.addToZone(w.zone, wh);
      }
    }
    // (v3) the new land's pines, ore rocks and second wheat field (appear when the fog clears)
    // ((v4.2) the pines where our railway loop now runs are not planted: WORLD.v42.removeDecor 'regionTree')
    const goneTrees = ((WORLD.v42 && WORLD.v42.removeDecor) || []).filter((d) => d[0] === 'regionTree');
    for (const [x, y, k, region] of WORLD.regionTrees || []) {
      if (goneTrees.some((d) => Math.abs(d[1] - x) < 12 && Math.abs(d[2] - y) < 12)) continue;
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
      // ((v4.3 밀밭 · 빵집) the bakery cottage is the oven station (same id); it is built by its own step (cfg.gate), not by the
      //  field's reveal (Bakery43 hides it until then)
      const s = c.id === 'bakery' ? new BakeryStation(this, c) : new Station(this, c);
      this.stations[c.id] = s;
      this.stationByInput[c.input] = s;
      this.stationList.push(s);
      if (WORLD.zones[c.zone].unlock && !c.gate) this.addToZone(c.zone, s);
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
    const PP = this.v42 && this.v42.pickup;
    for (const id in this.piles) {
      const pl = this.piles[id];
      if (pl.update(dt)) {
        on = true;
        // the chief takes the catch from the pile (like an output pad) ((v4.2) when the PickupPolicy allows)
        const can = !PP || PP.mayTake(pl, p, dt);
        if (ready && can) { if (pl.takeTo(p, p.capacity)) { this.padT = BALANCE.player.padItemInterval; if (PP) PP.took(p); } else if (pl.count > 0 && p.room <= 0) p.warnFull(); }
      }
    }
    if (PP) PP.endFrame();
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
    // ((v4.3) the plaza shop grows in stages (눈꽃 노점 → 가게 → 시장); the trade post is its 자재 창구 now: gs.trade is that
    //  counter (the old TradePost surface: stock, shelf, cash, flying, maxPerType, register, merchant). It opens with the
    //  shop's stage 2, which comes with the forest — as the trade post did)
    this.market = new StageMarket(this, WORLD.market);
    this.trade = this.market.mat;
    // ((v4.3 밀밭 · 빵집) the bakery cottage (the oven station) and its stall: hidden until 빵집 짓기 (bld_bakery)
    this.bakery = new Bakery43(this);
    this.trash = new TrashPad(this, WORLD.trash);
    // ((v4.3) 옷·신발 공방: the bench as a small workshop with its name on a board (Workshop43); `bench` stays its picture
    this.workshop43 = new Workshop43(this, WORLD.bench);
    this.workshop43.setVisible(false);
    this.bench = this.workshop43.img;
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
      // ((v4.3 step B, BP-19) a hidden plot (world.js `hidden: true`) gets no Site: no sprite, pad, sign or menu, never shown)
      if (isHidden(cfg)) continue;
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
    // ((v4.2 verify) a plot whose condition is a finished building ('b:' — the 서리 은행 needs the 촌장 사무실) appears
    //  when that building is done: before, plots refreshed only on a step / region, and after 읍 no step comes — an
    //  office built after 읍 never showed the bank plot until the game was reloaded)
    //  (show only: a building finishing never hides a plot or a site the tests / hooks put up)
    this.events.on('built', () => this.time.delayedCall(800, () => this.refreshSites(true)));
  }

  /** plots appear when their land is open and their step is done ((v4.2 verify) onlyShow: never hide one) */
  refreshSites(onlyShow) {
    for (const id in this.sites) {
      const st = this.sites[id];
      if (st.kind !== 'plot') continue;
      // ((v4.2) `also`: more conditions (a step / 'b:' / 'r:' / 'f:' or a list of them))
      const also = st.cfg.also ? [].concat(st.cfg.also) : [];
      // ((v4.3 step B, BP-17) a site that holds a building (a foundation, a scaffold or a finished one) is never hidden: it shows
      //  once its land is open, whatever its plot's `after` / `also` say now — an old village's buildings moved onto plot table v2
      //  (or a plot whose condition changed, v42_office: 'zone_mine') must not vanish)
      const held = st.state !== 'plot';
      const want = held ? (st.shown || this.territory.isOpen(st.region)) : this.territory.isOpen(st.region) && this.progress.met(st.cfg.after) && also.every((c) => this.progress.met(c));
      if (want === st.shown || (onlyShow && !want)) continue;
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
    // ---- (v4-C) the town hall's tax box, the big restaurant's pantry and cash
    const c1 = sv.c1 || {};
    if (this.civic && this.civic.hall && c1.hall) this.civic.hall.restore(c1.hall);
    if (this.civic && this.civic.restaurant && c1.rest) this.civic.restaurant.restore(c1.rest);
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
    if (this.civic) n += this.civic.popBonus();     // (v4-C) the town hall's rooms
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

  /** (v4-C2) the sea ambience: audio5's rolling sea (amb_sea_waves) once it is there, else the old amb_sea */
  seaAmbience(vol) {
    if (Assets.audioDef('amb_sea_waves') && !Assets.failed.has('amb_sea_waves')) { Audio.setAmbience('amb_sea_waves', vol); Audio.setAmbience('amb_sea', Audio.exists('amb_sea_waves') ? 0 : vol); }
    else Audio.setAmbience('amb_sea', vol);
  }

  onAssetArrived(fileKey) {
    // (v4-C2) the water's textures arrived after the village opened: the living sea replaces the old one
    if (WATER_DATA.test(fileKey) && this.ground && !this.ground.water && this.ground.tryUpgradeSea()) this.wireWaterDecor();
    for (let i = this.lazyImgs.length - 1; i >= 0; i--) {
      const q = this.lazyImgs[i];
      if (!q.img || !q.img.active) { this.lazyImgs.splice(i, 1); continue; }
      // ((v4.2.0.1, LAZY-1) a pooled item picture released / handed to another item since it was queued: not for it)
      if (q.gen !== undefined && q.img.__gen !== q.gen) { this.lazyImgs.splice(i, 1); continue; }
      if (Assets.pending(q.key)) continue;
      const anim = q.img.anims && q.img.anims.isPlaying ? q.img.anims.currentAnim && q.img.anims.currentAnim.key : null;
      // ((v4.2.0.1, LAZY-1) only a picture still on the stand-in takes the queued key: one its owner re-skinned meanwhile
      //  keeps what it shows now)
      if (!anim && (!q.img.texture || q.img.texture.key === 'fv_blank')) Assets.apply(q.img, q.key);
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
    } else if (bkey === 'station') {
      // ---- (v4-A) the old station is repaired: the trains run
      b = this.v4 ? this.v4.stationBuilt(site, instant) : null;
    } else if (/^house_/.test(bkey)) {
      b = new House(this, bkey, site);
      this.lazyImage(b.img, bkey);
      this.houses.push(b);
      if (this.life) this.life.capChanged(b, instant);
      this.foldTents43(site, b, instant);
    } else if (bkey === 'town_hall') {
      // ---- (v4-C) the town hall: tax box, notice board, more room, the ceremony venue
      b = new TownHall(this, site, instant);
      this.civic.hall = b;
      this.townHall = b;
      if (this.life) this.life.capChanged(b, instant);
    } else if (bkey === 'big_restaurant') {
      b = new BigRestaurant(this, site, instant);
      this.civic.restaurant = b;
      this.restaurant = b;
    } else if (this.v42 && this.v42.office && this.v42.office.handles(bkey)) {
      // ---- (v4.2) 촌장 사무실 / 서리 은행
      b = this.v42.office.makeBuilding(bkey, site, instant);
    } else if (this.v42 && this.v42.depot && this.v42.depot.handles && this.v42.depot.handles(bkey)) {
      // ---- (v4.2) 서리 물류창고
      b = this.v42.depot.makeBuilding(bkey, site, instant);
    } else if (isDecor(bkey)) {
      b = new Amenity(this, bkey, site);
      this.civic.addAmenity(b);
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

  /** ((v4.2.1) the cannery makes meat cans (the 고기 통조림 machine was bought: systems/MeatCan.js) */
  meatCansOn() { return !!(this.v42 && this.v42.meatcan && this.v42.meatcan.on); }
  /** ((v4.2.1) places the 잡화점's line gets once meat cans exist (the new buyers need room to queue) */
  storeQueueAdd() { return this.meatCansOn() ? Math.max(0, Math.min(4, Math.floor(Number(BALANCE.meatcan && BALANCE.meatcan.storeQueueAdd) || 0))) : 0; }

  /** the general store: a Market selling cans and tools (customers come along the roads) */
  makeStore(site) {
    const d = Assets.def('shop_general');
    const ip = d.inPoint || [131, 50], cp = d.cashPoint || [-32, 66], cu = (d.customerPoints && d.customerPoints[0]) || [-70, 37];
    const XO = (m) => [45.25 * m, 22.63 * m], YO = (m) => [45.25 * m, -22.63 * m];
    const cfg = {
      id: 'store', sprite: 'shop_general', x: site.x, y: site.y, goods: STORE_GOODS,
      shelf: [ip[0] + 18, ip[1] + 30], cash: [cp[0] - 20, cp[1] + 46], queueStart: [cu[0] - 30, cu[1] + 16],
      queueStep: YO(-0.9), queueTurn: 4, queueStep2: XO(-0.9), register: [cp[0] + 120, cp[1] + 74],
      // ((v4.2.1) the 7th tower, front centre: meat cans — inside the six towers' extents (the baked slot keeps its size)
      stockCols: [[-36, -6], [-12, 6], [12, -6], [36, 6], [-24, 18], [24, 18], [0, 18]],
      clerk: ['npc_clerk_a', 'npc_clerk_b', 'npc_aunt'], collider: [22, -12, 0.3], faceTo: [30, -40],
      maxQueue: 6, spawnEvery: 3.2, wantMax: 3, soldEvent: 'storeSold', shelfMax: 24, emptyLabel: true,
      available: () => STORE_GOODS.filter((g) => (g === 'item_can' ? this.isBuilt('cannery') : g === 'item_can_meat' ? this.meatCansOn() : this.isBuilt('toolsmith'))),
      // ((v4.2.1) once meat cans exist the guests come every meatcan.storeGuestK × the spawn time: new buyers for them)
      spawnK: () => (this.meatCansOn() ? Math.max(0.4, Math.min(1, Number(BALANCE.meatcan && BALANCE.meatcan.storeGuestK) || 0.75)) : 1),
    };
    // ((v4.3 step B, L1 — BP-20) a plot that names the store's line (world.js plots.d_store.storeLine: its queue start / steps / bend)
    const SL = site.cfg && site.cfg.storeLine;
    if (SL) for (const k of ['queueStart', 'queueStep', 'queueTurn', 'queueStep2']) if (SL[k] !== undefined) cfg[k] = SL[k];
    cfg.maxQueue0 = cfg.maxQueue;
    cfg.maxQueue += this.storeQueueAdd();
    const m = new Market(this, cfg);
    m.front = [-60, 30];
    if (this.padSpots) { this.padSpots.push({ x: m.shelf.x, y: m.shelf.y, r: 70 }, { x: m.cash.x, y: m.cash.y, r: 70 }, { x: m.register.x, y: m.register.y, r: 64 }); }
    this.storeLine(m, cfg);
    m.restoreQueue(1);
    return m;
  }

  /**
   * ((v4.2 fix, the designer's "잡화점 … 사람들도 거기로 못가는건지") a line place nobody can stand on — a border pine, the
   * edge of the open land (plots w_m2: places 4–6, e_m1: 5–6, e_m2: 6) — moves to the nearest free spot that goes on
   * from the place before it (the line bends around the pine). A customer sent there never arrived and walked on the
   * spot against the pine / the fog at the back of a line that looked stuck. The line keeps its 6 places (customers
   * walking in hold one: a shorter line let fewer come); where no spot is free the line ends there (at least 2).
   */
  storeLine(m, cfg) {
    const C = this.collision, n = m.maxQueue, pos = [];
    const keep = [m.cash, m.register, m.shelf].filter((o) => o && Number.isFinite(o.x));
    const ok = (x, y) => C.inWalk(x, y) && !C.blocked(x, y, 13) && !keep.some((o) => Math.hypot(o.x - x, (o.y - y) * 2) < 66) && !pos.some((q) => Math.hypot(q.x - x, (q.y - y) * 2) < 40);
    let moved = 0;
    for (let i = 0; i < n; i++) {
      const q = m.slotPos(i);
      if (ok(q.x, q.y)) { pos.push({ x: q.x, y: q.y }); continue; }
      const prev = pos[pos.length - 1] || q;
      let best = null, bd = Infinity;
      for (let r = 42; r <= 96 && !best; r += 18) {
        for (let a = 0; a < 16; a++) {
          const x = prev.x + Math.cos((a * Math.PI) / 8) * r, y = prev.y + Math.sin((a * Math.PI) / 8) * r * 0.5;
          if (!ok(x, y)) continue;
          const d = Math.hypot(x - q.x, (y - q.y) * 2);
          if (d < bd) { bd = d; best = { x, y }; }
        }
      }
      if (!best) break;
      pos.push(best);
      moved++;
    }
    if (!moved && pos.length === n) return;
    cfg.slots = pos;
    cfg.maxQueue = Math.max(2, pos.length);
  }

  /**
   * ((v4.2 final, gameplay review #1) the store's line worked out again. On a load the store is made while the zones
   * are still switched off (Game.create: restoreV3 before Progression.init reveals them), so on plot e_m1 the farm
   * fence was not solid yet and places 5–6 landed inside it — customers 5 and 6 walked on the spot in every session
   * after the first. Called when a zone opens, after a load, and when a building is finished (one next to the store
   * could cover a place). Customers in line walk to their new places by themselves (Customer.update reads slotPos).
   */
  refreshStoreLine() {
    const m = this.store;
    if (!m || !m.cfg) return false;
    const cfg = m.cfg, sig = () => JSON.stringify(cfg.slots || null) + '/' + cfg.maxQueue;
    const before = sig();
    delete cfg.slots;
    cfg.maxQueue = (cfg.maxQueue0 || 6) + this.storeQueueAdd();
    this.storeLine(m, cfg);
    return sig() !== before;
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
    // ((v4-C) a neighbours' order card that asks for a tool (the 철물점 wants an axe and a pickaxe): the forge makes it
    // too — before, once every hire pad had its tool, a card waiting for a pickaxe could only be swapped away)
    const G = this.v4 && this.v4.growth;
    if (G && G.active && G.needOf) for (const tl of TOOLS) { const n = G.needOf(tl); if (n > 0) o[tl] = (o[tl] || 0) + n; }
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

  /** ((v4.2.0.1) every paid pad standing now: Progression steps, the bench upgrades, the LineUpgrades offers, the office hire pad */
  paidPads() {
    const out = [], pr = this.progress, V = this.v42;
    if (pr) { for (const id in pr.pads) out.push(pr.pads[id]); for (const k in pr.upPads) out.push(pr.upPads[k]); }
    if (V && V.lines) for (const id in V.lines.pads) out.push(V.lines.pads[id]);
    if (V && V.office && V.office.hirePad) out.push(V.office.hirePad);
    return out;
  }

  /** ((v4.2.0.1) one live paid pad per spot: the shown pad (other than `exceptId`) whose floor diamond comes closer than
   *  16 px to a pad of half-width `hw` at (x, y) — |dx| + 2|dy| < hw + its hw + 16 — or null. skipBench: the bench
   *  upgrades step aside for a Progression pad (Progression.benchAside) */
  paidPadNear(x, y, hw, exceptId, skipBench) {
    const pr = this.progress;
    for (const p of this.paidPads()) {
      if (!p || !p.active || p.id === exceptId || !p.pad) continue;
      if (skipBench && pr && pr.upPads && (pr.upPads.capacity === p || pr.upPads.speed === p)) continue;
      if (Math.abs(p.x - x) + 2 * Math.abs(p.y - y) < hw + p.pad.w / 2 + 16) return p;
    }
    return null;
  }

  /** ((v4.2.0.1) a workshop's hire / 짐꾼 2 pad on a plot that names its own spot (world.js plots.<id>.pads.line /
   *  .p2, px from the plot centre: the default spot by its output pad was behind something there), or null */
  plotPad(src, which) {
    const c = src && src.isWorkshop && src.site && src.site.cfg, o = c && c.pads && c.pads[which];
    return Array.isArray(o) ? { x: src.site.x + o[0], y: src.site.y + o[1] } : null;
  }

  /** ((v4.2.0.1) how many of a paid pad's 29 sample points — its floor diamond and its price (coin + number) — a picture
   *  standing in front of it covers: a pine, a prop, a fence, a building. 2 or fewer is a pad in clear view (the 잡화점
   *  점원 pad; (v4.2.1) the 고기 통조림 기계 pad, MeatCan.padPos) */
  padCover(x, y) {
    const occ = this.occlusion, hw = 45.25 * 1.9, hh = hw / 2;
    let pts = this._padPts;
    if (!pts) {
      pts = this._padPts = [];
      for (let i = -4; i <= 4; i++) for (let j = -4; j <= 4; j++) if (Math.abs(i) + Math.abs(j) <= 3.8) pts.push([(i / 4) * hw, (j / 4) * hh]);
      for (const dx of [-36, -12, 12, 36]) pts.push([dx, 2]);         // the price (coin + number)
    }
    // (a picture covers the floor above its foot: only the ones standing below the pad's top edge, close by)
    // (the props, the trees — the forest's choppable ones too — and the buildings standing by: a 망루 next to the plot;
    //  not the goods in piles or in hands, which come and go)
    // ((v4.2.1) and the props the view culling has parked off the display list while the camera is far: Culler.parked)
    const park = (this.culler && this.culler.parked) || [];
    const near = this.statics.concat(this.children.list.concat(park).filter((o) => o && o.texture && /^(bld_|props_(?!items))/.test(o.texture.key)))
      .filter((o) => o && o.active && o.visible && o.frame && o.y > y - hh - 8 && o.y < y + 700 && Math.abs(o.x - x) < hw + 260);
    let n = 0;
    for (const [px, py] of pts) {
      const qx = x + px, qy = y + py;
      for (const o of near) {
        const b = o.getBounds();
        if (qx < b.x || qx > b.right || qy < b.y || qy > b.bottom) continue;
        let s = true;
        try { if (occ && occ.solid) s = occ.solid(o, qx, qy); } catch (e) { s = true; }
        if (s) { n++; break; }
      }
    }
    return n;
  }

  /** ((v4.2.0.1) the 잡화점 점원 pad: right of the register, a little in front of it. The store can stand on any M
   *  plot: where that spot is not walkable or a pine / prop / fence stands over the pad or its price (the border forest
   *  by se_m1, the rail fence and the 동남쪽 망루 by e_m2), the first clear spot of a few around the register — up
   *  and right of it last (on e_m2 the only open ground) — else the least covered one */
  storeClerkSpot() {
    const r = this.store.register, C = this.collision;
    const covered = (x, y) => this.padCover(x, y);
    let best = null;
    for (const o of [[150, 58], [150, 20], [190, 40], [150, 96], [110, 112], [230, 76], [190, -50]]) {
      const x = r.x + o[0], y = r.y + o[1];
      if (C.blocked(x, y, 16)) continue;
      const n = covered(x, y);
      if (n <= 2) return { x, y };
      if (!best || n < best.n) best = { x, y, n };
    }
    return best ? { x: best.x, y: best.y } : { x: r.x + 150, y: r.y + 58 };
  }

  /** ((v4.2.0.1) a paid pad's spot joins the places residents never stand on (once per spot) */
  addPadSpot(x, y) {
    const S = this.padSpots;
    if (!S || !Number.isFinite(x) || !Number.isFinite(y)) return;
    for (const q of S) if (Math.abs(q.x - x) < 4 && Math.abs(q.y - y) < 4) return;
    S.push({ x, y, r: 80 });
  }

  /** where the pad of a v3 step goes (towers: in front of the site; boat: by the boathouse; new porters / clerk: by their building) */
  padSpot(s) {
    // ((v4.2.0.1) towers.<id>.pad: the 남쪽 / 동남쪽 pads stood inside the closed land's fog bank)
    if (s.type === 'tower') { const w = WORLD.towers && WORLD.towers[s.id]; if (!w || (w.in && !this.territory.isOpen(w.in))) return null; const d = Array.isArray(w.pad) ? w.pad : (Assets.def('site_plot_S').dropPoint || [2, 64]); return { x: w.x + d[0], y: w.y + d[1] }; }
    if (s.type === 'boat') return this.boathouse ? this.boathouse.boatPad : null;
    if (s.type === 'porter') {
      const src = this.sourceById(s.station);
      if (!src || !src.outPad) return null;
      return this.plotPad(src, 'line') || { x: src.outPad.x + 120, y: src.outPad.y + 60 };
    }
    // ((v4.2.0.1) +58: the snow fort behind it now, not over its top; on another plot the first clear spot by the register)
    if (s.type === 'clerk' && s.seller === 'store' && this.store) return this.storeClerkSpot();
    // ---- (v4-B) the station porters' pad and the 승격식 pad on the station square
    if (s.type === 'stationPorter') { const q = WORLD.v4 && WORLD.v4.square; return q && this.territory.isOpen('rail') ? { x: q.porter.x, y: q.porter.y } : null; }
    if (s.type === 'rank') {
      // ---- (v4-C) the 승격식 is held in front of the town hall once it stands
      if (this.civic && this.civic.hall) return this.civic.hall.rankPadPos ? this.civic.hall.rankPadPos() : this.civic.hall.venue('rank');     // ((v4.2.0.1) off the tax box)
      const q = WORLD.v4 && WORLD.v4.square; return q && this.territory.isOpen('rail') ? { x: q.rank.x, y: q.rank.y } : null;
    }
    // ---- (v4-C) the big restaurant's staff (계산 점원 → 요리사 → 서빙 직원) on one spot beside it
    if (s.type === 'restStaff') { const r = this.civic && this.civic.restaurant; return r ? (r.hirePadPos ? r.hirePadPos() : { x: r.staffSpot.x, y: r.staffSpot.y }) : null; }     // ((v4.2.0.1) a metre out)
    // (v3.5) the operator of a v3 workshop: on the porter pad's spot (the porter pad follows it)
    if (s.type === 'operator') {
      const src = this.sourceById(s.station);
      if (!src || !src.outPad) return null;
      return this.plotPad(src, 'line') || { x: src.outPad.x + 120, y: src.outPad.y + 60 };
    }
    return null;
  }

  // ---------------------------------------------------------------- build menu
  openBuildMenu(site) { if (site && site.state === 'plot' && site.shown) this.ui.openBuildMenu(site); }

  /** the cards of the build menu for a plot: [{ key, cost, locked, reason, text, cat }] ((v4-C) Civic: houses can
   *  always be built, decor, the town hall and the big restaurant, and every locked card says what unlocks it) */
  buildChoices(site) { return this.civic.choices(site); }

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
    // ((v4.2 final) the zone's fence is solid now: the store's line goes round it)
    if (this.store) this.refreshStoreLine();
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

  /**
   * (v4-B, docs/v4_plan.md §11.3e) graphics tier — ((v4.3 perf) now the 그래픽 사양 preset of Perf.js (자동 / 고 / 중 / 저):
   * 저사양 = ground tiles at half resolution, fewer social pages and paper-doll rigs, the low texture budget; every
   * preset sets its own culling rate, doll caps, ground bake rate and water quality (Perf.applyGame).
   */
  applyGfx() {
    return Perf.applyGame(this);
  }

  // ((v4.3) not while the player looks around in 관망 (CameraDirector.free → camPan): the camera is theirs — a jump the
  //  player asked for (`mine`: the office panel's 「보러 가기」) glides their look-around point there instead.
  //  (review F11) during 관망 such a jump always does that (the camera with the chief first lets go of him): it stays
  //  there, and 「촌장님 보기」 brings it back — the same either way. (review F5) a rank ceremony shows its square: the
  //  camera comes back from looking around first (before, its focus was dropped and the camera glided to the chief))
  focusCamera(x, y, ms, mine) {
    const P = this.v42 && this.v42.pilot, C = P && P.cam;
    if (this.camPan || (mine && C && P.on)) {
      const R = this.v4 && this.v4.rank;
      if (R && R.ceremonyOn && C) C.attach();
      else { if (mine && C && (C.free || C.detach())) C.glideTo(x, y); return; }
    }
    this.camFocus = { x, y, until: this.time.now + ms };
  }

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

  /** (v4.3) a first house (world.js plots h43_1 / h43_2: `tents`, `family`): the camp's tent family moves in and its tents
   *  are packed away (a loaded village: the tents are simply gone) */
  foldTents43(site, house, instant) {
    const ids = site && site.cfg && site.cfg.tents;
    if (!Array.isArray(ids) || !ids.length) return;
    for (const id of ids) {
      const img = this.decorById && this.decorById[id];
      if (!img || !img.active || img.__folded) continue;
      img.__folded = true;
      if (img.__ob) img.__ob.active = false;
      if (instant) { img.setVisible(false); continue; }
      const sx = img.scaleX;
      this.time.delayedCall(1200, () => { if (img.active) this.effects.sheet('fx_poof', img.x, img.y - 30, { size: 210 }); });
      this.tweens.add({ targets: img, scaleY: 0.05, scaleX: sx * 0.7, alpha: 0, duration: 520, delay: 1200, ease: 'Quad.easeIn', onComplete: () => img.setVisible(false) });
    }
    if (!instant) {
      if (this.life && this.life.tentFamily) this.life.tentFamily(house, site.cfg.family || []);
      this.time.delayedCall(1800, () => { if (this.ui) this.ui.banner(t('house43Moved'), t('house43MovedSub')); });
    }
  }

  showBench(instant) {
    const b = this.bench;
    if (this.workshop43) this.workshop43.setVisible(true);
    b.setVisible(true);
    if (b.__ob) b.__ob.active = true;
    if (!instant) {
      if (this.ui && this.ui.banner) this.ui.banner(t('workshop43Open'), t('workshop43Sub'));
      b.setScale(0.01);
      this.tweens.add({ targets: b, scale: 1, duration: 500, ease: 'Back.easeOut' });
      // ((v4.3) the workshop's name board fades in once the picture has popped up)
      const sg = this.workshop43 && this.workshop43.sign;
      if (sg) { sg.setAlpha(0); this.tweens.add({ targets: sg, alpha: 1, delay: 380, duration: 260 }); }
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

  workerHome(type, index, rest) {
    // ((v4.3 밀밭 · 빵집) rest = the place an idle worker goes after a while (the farmers: by the 농막's door)
    const R = rest && WORLD.workerRest && WORLD.workerRest[type];
    if (R) {
      const key = 'rest:' + type + ':' + index, C = this._homes || (this._homes = {});
      if (C[key]) return C[key].slice();
      // ((bakefix) each worker's own rest spot (spots[index]); none left: he rests at home. The spot stays inside its land
      //  (zone): the old row (at + 34, 17 a worker) put 농부 2 · 3 outside the field's east fence)
      const sp = Array.isArray(R.spots) ? R.spots[index] : Array.isArray(R.at) ? [R.at[0] + index * 34, R.at[1] + index * 17] : null;
      if (!Array.isArray(sp)) return this.workerHome(type, index);
      const Z = R.zone && WORLD.zones[R.zone];
      const inZone = Z ? (qx, qy) => inIsoRect(qx, qy, Z.center[0], Z.center[1], Z.size[0], Z.size[1], 0.3) : undefined;
      const q = this.freeSpot(sp[0], sp[1], 16, 120, inZone);
      const out = [Math.round(q.x), Math.round(q.y)];
      if (this.collision.walk) C[key] = out;
      return out.slice();
    }
    const h = WORLD.workerHome[type];
    // ((v4.2.0.1) a home on open ground: the row (+40, +20 a worker) ran into the smelter, the sawmill, the hay bale
    //  and a fence, and an idle worker walked on the spot there for good. Looked up once per (type, index))
    const key = type + ':' + index, C = this._homes || (this._homes = {});
    if (C[key]) return C[key].slice();
    const q = this.freeSpot(h[0] + index * 40, h[1] + index * 20, 16, 140);
    const out = [Math.round(q.x), Math.round(q.y)];
    if (this.collision.walk) C[key] = out;          // (cached once the land is known: the fog moves homes otherwise)
    return out.slice();
  }

  /** ((v4.3 review CD-1) a saved chief inside a building's walls (the hut / the office on the moved plot) or the hut's floor,
   *  built after his spot was checked): out to the free spot nearest him, else to the hut's yard (no hut: the office's door,
   *  else where the yard was). ((v4.3 verify CM-1) the chief's own ground counts as free (Collision's chief flag, as at the
   *  spot's check before the walls stood): a chief saved on his landing at the water's edge, beyond everyone else's walk
   *  line, stays on it — autosave / app-pause saves come while he stands there fishing) */
  unstickChief() {
    const p = this.player, C = this.collision;
    if (!p || !C) return false;
    const O = this.v42 && this.v42.office;
    const inside = (img, key) => {
      if (!img || !img.active || !img.visible) return false;
      const fp = Assets.def(key).footprint || [272, 136];
      return Math.abs(p.x - img.x) / (fp[0] / 2) + Math.abs(p.y - img.y) / (fp[1] / 2) < 1;
    };
    // (the office is a cutaway the chief walks into: there only its walls count; the hut has no inside)
    const hut = O && O.hut, R = p.radius || 16;
    const inHut = !!(hut && inside(hut.img, 'chief_lodge'));
    if (!inHut && !C.blocked(p.x, p.y, R, null, true)) return false;
    // (in a wall somewhere else: the free spot nearest him first)
    let q = inHut ? null : this.freeSpot(p.x, p.y, R, 120);
    if (!q || C.blocked(q.x, q.y, R, null, true)) {
      // (WORLD.player is no longer the yard: since the sea it is by his landing)
      const H = WORLD.v42 && WORLD.v42.hut, B = O && O.building;
      const y = (hut && hut.spots && hut.spots.yard) || (B && B.spots && B.spots.door) || (H && H.yard ? { x: H.x + H.yard[0], y: H.y + H.yard[1] } : WORLD.player);
      q = this.freeSpot(y.x, y.y, R, 240);
    }
    p.x = q.x; p.y = q.y; p.vx = p.vy = 0;
    if (p.sync) p.sync(0);
    return true;
  }

  /** ((v4.2.0.1) the free spot nearest (x, y) for a walker of radius `rad` (rings out to `maxR` ground px), or (x, y)
   *  itself when it is free or nothing near is. `ok(x, y)`: a further test a spot must pass (reached from the pad) */
  freeSpot(x, y, rad = 14, maxR = 120, ok) {
    const C = this.collision;
    if (!C || (!C.blocked(x, y, rad) && (!ok || ok(x, y)))) return { x, y };
    for (let r = 12; r <= maxR; r += 12) {
      let best = null, bd = Infinity;
      const n = Math.max(8, Math.round(r / 6));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2, qx = x + Math.cos(a) * r, qy = y + (Math.sin(a) * r) / 2;
        if (C.blocked(qx, qy, rad) || (ok && !ok(qx, qy))) continue;
        // (all as near: the one most in front — south, away from the shore, seen by the camera)
        const d = -Math.sin(a);
        if (d < bd) { bd = d; best = { x: qx, y: qy }; }
      }
      if (best) return best;
    }
    return { x, y };
  }

  hireWorker(type, index, instant, x, y, role) {
    const home = Worker.homeFor(this, type, index, role);
    const w = new Worker(this, type, x !== undefined ? x : home[0], y !== undefined ? y : home[1], index, role);
    this.workers.push(w);
    // (v3.5) the line's collection pile appears with its first gatherer
    if (w.pile && !w.pile.shown) w.pile.setShown(true, !instant);
    // ((v4.3) a fisherman sits on the fishing deck: the deck grows to his tier (어부 2 → 2단, 어부 3 → 3단); a loaded village
    //  seats him at once, a new hire walks to the gangway and along the deck's lane to his stool)
    if (type === 'fisherman' && this.deck) {
      const n = this.workers.filter((q) => q.type === 'fisherman').length;
      this.deck.setTier(Math.max(n, index + 1), !instant);
      if (instant) w.seatNow();
    }
    if (!instant) {
      this.effects.sheet('fx_poof', w.x, w.y - 30, { size: 180 });
      this.effects.burst('star', w.x, w.y - 40, 12);
      w.sprite.setScale(0.1);
      this.tweens.add({ targets: w.sprite, scale: 1, duration: 450, ease: 'Back.easeOut' });
    }
    return w;
  }

  /** ((v4.2 touch) what the village makes, raw + goods, counted where it is made (a gatherer's drop on a collection
   *  pile, a station's or workshop's product, a boat's catch): the 창고 직원 grow with it (WarehouseCrew) */
  noteMade(n = 1) { this.madeN = (this.madeN || 0) + n; }

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
    // ((v4.2.0.1 final, soak R5) a new walk (nobody walked this one for a moment: it stood, worked, unloaded) starts
    //  its 'no closer' bookkeeping afresh: the last trip's best distance to the same drop spot made the next trip 'give
    //  up' 3 s in — the hunters stopped 40–250 px short of the smokehouse rack and threw the meat from there
    const now = this.walkClock || 0;
    if (!(now - a._frT <= 0.6)) { a._wpX = undefined; a._rpX = undefined; a._rpN = 0; }
    a._frT = now;
    a.ri = a.ri || 0;
    while (a.ri < r.length - 1 && gdist(a.x, a.y, r[a.ri].x, r[a.ri].y) < 34) a.ri++;
    const w = r[a.ri];
    const last = a.ri >= r.length - 1;
    // no closer to this point for a while (something stands on it, or a crowd blocks it): skip it,
    // or call the end of the route reached, so a carrier never circles an obstacle for good
    const dd = gdist(a.x, a.y, w.x, w.y);
    if (a._wpX !== w.x || a._wpY !== w.y) { a._wpX = w.x; a._wpY = w.y; a._wpBest = dd; a._wpT = 0; }
    else if (dd < a._wpBest - 6) { a._wpBest = dd; a._wpT = 0; }
    // ((v4.3 hotfix, designer: "짐꾼이 판자를 싣고 나올 때 울타리·풀숲에 걸려요") held up for 1.2 s on the way to a point
    //  more than 40 px off: a way round what stands there (the walker's own radius), ONCE per trip (keyed by the
    //  route's end: a detour's own points never start another one), before the 3 s skip below — a carrier no longer
    //  pushes a fence or a bush for seconds, and a crowd on its way never keeps it re-planning
    else if ((a._wpT += dt) > 1.2 && dd > 40 && a._wpT <= 3 && (a._wdX !== r[r.length - 1].x || a._wdY !== r[r.length - 1].y)) {
      const end = r[r.length - 1];
      a._wdX = end.x; a._wdY = end.y;
      const way = this.roads.detour(a.x, a.y, w.x, w.y, [], a.radius);
      if (way && way.length > 1) { r.splice(a.ri, 1, ...way); a._wpX = undefined; return false; }
    }
    else if (a._wpT > 3) {
      a._wpT = 0; a._wpBest = Infinity;
      if (!last) { a.ri++; return false; }
      // ((v4.2.0.1) the end of the route but still far from it (a fence corner, a wall, the fog's edge): a new way
      //  from here round what stood in the way, twice, before it counts as arrived — that 'arrival' let porters
      //  unload, the courier scoop a till and bank his sack through fences and walls)
      if (a._rpX !== w.x || a._rpY !== w.y) { a._rpX = w.x; a._rpY = w.y; a._rpN = 0; }
      if (dd > 60 && a._rpN < 2) {
        a._rpN++;
        const way = this.roads.detour(a.x, a.y, w.x, w.y, [], a.radius);
        if (way && way.length > 1) { r.length = 0; for (const q of way) r.push(q); a.ri = 0; a._wpX = undefined; return false; }
      }
      a.vx = a.vy = 0;
      return true;
    }
    if (this.moveAgent(a, w.x, w.y, speed, dt, last ? tol : 28)) {
      if (last) { a._rpN = 0; return true; }
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
    // ---- (v4-A) a faint train whistle from beyond the eastern fog
    if (this.territory && !this.territory.isOpen('rail')) this.time.delayedCall(2600, () => { this.ui.toast(t('villageCompleteRumor')); Audio.play(Audio.exists('sfx_steam_whistle') ? 'sfx_steam_whistle' : 'sfx_boat_horn', { volume: 0.25 }); });
  }

  // ------------------------------------------------------------------ helpers
  isOnScreen(x, y, margin = 0) {
    const v = this.cameras.main.worldView;
    return x > v.x - margin && x < v.right + margin && y > v.y - margin && y < v.bottom + margin;
  }
  /** ((v4.2.0.1) on screen or within `margin` of it, with the camera where it is NOW: worldView is only updated when a
   *  frame is drawn, so a camera cut (centerOn) is seen one frame late by isOnScreen) */
  isNearView(x, y, margin = 0) {
    if (this.isOnScreen(x, y, margin)) return true;
    const cam = this.cameras.main, z = Math.max(0.05, cam.zoom || 1);
    const hw = cam.width / z / 2 + margin, hh = cam.height / z / 2 + margin;
    return Math.abs(x - (cam.scrollX + cam.width / 2)) < hw && Math.abs(y - (cam.scrollY + cam.height / 2)) < hh;
  }
  isNear(x, y, d) { const p = this.player; return Math.abs(p.x - x) < d && Math.abs(p.y - y) < d; }
  /** ((v4.2.0.1 final, review #4) a walker standing at (x, y) cannot be seen at all: neither its feet nor the top of
   *  the tallest carry stack (~220 px above them) is near the view (a placement there is never seen to pop) */
  unseen(x, y) { return !this.isOnScreen(x, y, 120) && !this.isOnScreen(x, y - 220, 120); }

  /** positional sfx: only when (x, y) is on or near the screen, softer just outside it. `force` = always (the chief's own actions) */
  /** ((v4.3 hotfix, designer: "그 장소에 가면 주변 소리가 더 잘 들리게") a sound at a place in the village: full near the middle of
   *  the view, softer towards its edges, fading out about a screen beyond (opts.range > 1: heard farther, a train's
   *  whistle), panned left / right by where it is. force: always at full volume (still panned) */
  sfxAt(key, x, y, opts, force) {
    const cam = this.cameras.main, z = Math.max(0.05, cam.zoom || 1);
    const hw = Math.max(1, cam.width / 2), hh = Math.max(1, cam.height / 2);
    const dx = ((x - (cam.scrollX + hw)) * z) / hw, dy = ((y - (cam.scrollY + hh)) * z) / hh;
    const d = Math.hypot(dx, dy) / Math.max(0.5, (opts && opts.range) || 1);
    let f = 1;
    if (!force) {
      if (d > 2) return;
      f = d <= 0.55 ? 1 : d <= 1.25 ? 1 - ((d - 0.55) / 0.7) * 0.55 : 0.45 * (1 - (d - 1.25) / 0.75);
      if (f < 0.04) return;
    }
    const v = (opts && opts.volume) !== undefined ? opts.volume : 1;
    Audio.play(key, Object.assign({}, opts, { volume: v * f, pan: Math.max(-1, Math.min(1, dx)) * 0.55 }));
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
        // ((v4.2.0.1) opts.accept(type): is the item still wanted there when it lands? (a shop sold it, the train took
        //  the dock crate while it flew): no -> its picture goes, it never lands as an extra one that stays for good)
        if (opts.accept && !opts.accept(it.type)) { this.effects.releaseItem(s); return; }
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
  spawnItemTo(type, x, y, ch, isPlayer, delay = 0, fo) {
    const st = ch.stack;
    if (st.count + st.incoming >= (isPlayer ? this.player.capacity : st.max)) return false;
    st.reserve(type);
    const go = () => {
      const spr = this.effects.takeItem(type);
      spr.setScale(0.45);
      this.effects.fly(spr, x, y, () => st.nextPos(type), {
        // ((v4.3 sea) fo: a leap's arc / flip (the chief's fish from his float); the flight time stays 0.3 s
        dur: 300, height: fo && fo.height !== undefined ? fo.height : 70, spin: (fo && fo.spin) || 0, scaleTo: st.scale,
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
    let dx = tx - a.x, dy = ty - a.y;
    let d = Math.hypot(dx, dy);
    if (d <= arrive) { a.vx = a.vy = 0; a.stuckT = 0; if (a._mv) { a._mv.way = null; a._mv.retry = false; a._mv.settled = false; } return true; }
    // ((v4.2.0.1) the safety net for every walker: no closer to where it steers for 3.5 s (pressed into a fence, a
    //  wall, a pile) -> a way round it (Roads.detour: grid A*, the doors of walled buildings), twice; stuck close to
    //  the spot (a crowd on it, a prop over it) -> it stands there instead of walking on the spot; still stuck far
    //  away while off screen -> it is placed by the spot (never seen to pop). Nothing it carries changes.
    //  ((v4.2.0.1 final, review #1) standing there lasts 2 s, then one more short try (1.5 s): the crowd or the porter
    //  on the spot may have gone — it stood 28 px off a freed spot for good, and a shop's head of the line with it)
    //  ((v4.2.0.1 final, soak R5) and a new walk to the same spot (none for 0.6 s) starts afresh, like followRoute's
    const m = a._mv || (a._mv = { tx: NaN, ty: NaN, sx: NaN, sy: NaN, best: 0, t: 0, way: null, wi: 0, n: 0, st: 0, retry: false, lt: NaN });
    const now = this.walkClock || 0, fresh = !(now - m.lt <= 0.6);
    m.lt = now;
    if (fresh || !(Math.abs(m.tx - tx) <= 24 && Math.abs(m.ty - ty) <= 24)) { m.tx = tx; m.ty = ty; m.way = null; m.n = 0; m.sx = NaN; m.settled = false; m.retry = false; }
    if (m.settled) {
      if (gdist(a.x, a.y, tx, ty) < 48 && (m.st += dt) < 2) { a.vx = a.vy = 0; return true; }
      m.settled = false; m.retry = true; m.sx = NaN;
    }
    let sx = tx, sy = ty;
    if (m.way) {
      while (m.wi < m.way.length - 1 && gdist(a.x, a.y, m.way[m.wi].x, m.way[m.wi].y) < 24) m.wi++;
      if (m.wi < m.way.length - 1) { sx = m.way[m.wi].x; sy = m.way[m.wi].y; } else m.way = null;
    }
    const sd = gdist(a.x, a.y, sx, sy);
    if (m.sx !== sx || m.sy !== sy) { m.sx = sx; m.sy = sy; m.best = sd; m.t = 0; }
    else if (sd < m.best - 6) { m.best = sd; m.t = 0; m.retry = false; }
    else if ((m.t += dt) > (m.retry ? 1.5 : 3.5)) {
      m.t = 0; m.best = sd;
      const td = gdist(a.x, a.y, tx, ty);
      if (m.way) m.wi++;                                     // (a corner it cannot reach: the next one)
      else if (td < 40) { a.vx = a.vy = 0; a.stuckT = 0; m.settled = true; m.st = 0; a.locomotion(false); return true; }
      else if (m.n < 2 && this.roads) { m.n++; const w = this.roads.detour(a.x, a.y, tx, ty, [], a.radius); m.way = w && w.length > 1 ? w : null; m.wi = 0; }
      else if (this.unseen(a.x, a.y) && this.unseen(tx, ty)) {
        const q = this.freeSpot(tx, ty, a.radius || 12, 90);
        a.x = q.x; a.y = q.y; a.vx = a.vy = 0; a.stuckT = 0; m.n = 0;
        return gdist(a.x, a.y, tx, ty) <= Math.max(arrive, 40);
      }
    }
    if (sx !== tx || sy !== ty) { dx = sx - a.x; dy = sy - a.y; d = Math.hypot(dx, dy) || 1; }
    let vx = (dx / d) * speed, vy = (dy / d) * speed;
    // unstick: slide sideways for a moment when blocked
    if (a.sideT > 0) { a.sideT -= dt; const s = a.sideDir || 1; const ox = -vy * s, oy = vx * s; vx = vx * 0.3 + ox * 0.9; vy = vy * 0.3 + oy * 0.9; }
    // separation from other agents ((v4.2 fix, robust M1) not for the office's courier and aide, who cross the whole
    //  village all day: the O(agents) loop per step was most of the office's logic time)
    const list = a.noSeparate ? NO_AGENTS : this.agents;
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
    // ((v4.2.0.2) 관리자 모드 「시간 빠르게」: the village step runs 2 or 4 times a frame, each with the normal step — nothing
    //  moves further in one step than at ×1 (collisions, pads, flights); Admin.setSpeed scales the tweens / timers to match)
    const n = this.simSpeed > 1 ? Math.min(4, Math.floor(this.simSpeed)) : 1;
    // an exception inside Phaser's loop would stop the game for good: report it once, keep running
    try { for (let i = 0; i < n && !this._broken && !this.resetting; i++) this.tick(time, delta); } catch (e) { if (!this._tickErr) { this._tickErr = true; console.error('[FrostVillage] update error:', e); } }
  }

  tick(time, delta) {
    const dt = Math.min(0.05, delta / 1000);
    const inp = Input.update(time);
    const p = this.player;
    this.ground.update(dt);
    if (this.roads && this.roads.newFrame) this.roads.newFrame(dt);
    this.walkClock = (this.walkClock || 0) + dt;          // ((v4.2.0.1 final) followRoute / moveAgent: a new walk
    this.updateWater(dt, delta);
    // (v4-C2) the village voices follow the sound toggle (and the context: a suspended one would pile clips up)
    if (this.voice) {
      const on = Audio.started && Settings.data.sound && Audio.live;
      if (on !== this.voice.enabled) this.voice.setEnabled(on);
      this.voice.update(dt);
    }
    Residency.tick(dt);
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
    if (this.bakery) this.bakery.update(dt);
    // (v3) construction, workshops, storage, the store, houses, towers, boats, fog
    for (const id in this.sites) this.sites[id].update(dt);
    for (const w of this.workshops) w.update(dt);
    if (this.warehouse) this.warehouse.update(dt);
    if (this.store) this.store.update(dt);
    if (this.boathouse) this.boathouse.update(dt);
    // ((v4.2.0.1) the miners' food box was never updated: its food was never laid out nor drawn, deliveries flew to the
    //  world's corner and its label kept the count it had at load. The pad itself is handled in handlePlayerPads)
    if (this.foodBox) this.foodBox.update(dt);
    for (const h of this.houses) h.update(dt);
    for (const k in this.towers) this.towers[k].update(dt);
    this.territory.update(dt);
    for (const w of this.workers) w.update(dt);
    for (const w of this.porters) w.update(dt);
    for (const w of this.rawPorters) w.update(dt);
    if (this.life) this.life.update(dt);
    if (this.residentChat) this.residentChat.update(dt);
    if (this.dog) this.dog.update(dt);
    // ---- (v4-C) the town hall, the big restaurant, decor, settlers
    if (this.civic) this.civic.update(dt);
    // ---- (v4-A) the rail strip, the train, the town, day and night
    if (this.v4) this.v4.update(dt);
    // ---- (v4.2) 촌장의 하루
    if (this.v42) this.v42.update(dt);
    this.checkLazyGates(dt);
    this.v3T = (this.v3T || 0) - dt;
    if (this.v3T <= 0) {
      this.v3T = 1;
      if (!this.progress.celebrated3 && this.progress.v3Complete) this.time.delayedCall(2500, () => this.celebrate3());
    }
    this.tutorial.update(dt);
    if (this.onboard) { try { this.onboard.update(dt); } catch (e) { if (!this._onbErr) { this._onbErr = true; console.error('[FrostVillage] onboarding:', e); } } }
    if (this.flags) { try { this.flags.update(dt); } catch (e) { if (!this._flagErr) { this._flagErr = true; console.error('[FrostVillage] flags:', e); } } }
    if (this.occlusion) this.occlusion.update(dt);
    this.updateZoom(dt, delta);

    // camera target
    const ct = this.camTarget;
    let fx = p.x, fy = p.y - 30;
    if (this.tutorial.inTutorial && WORLD.tutorialView) {
      // first loop: frame net, grill, counter and queue together; follow the chief only near the edges
      // ((v4.2.0.1) the first-run tutorial moves the framing to the register / the clerk's pad for its steps there)
      const tv = (this.onboard && this.onboard.view) || WORLD.tutorialView;
      const v = this.cameras.main.worldView, hw = v.width / 2, hh = v.height / 2;
      fx = Math.max(p.x - hw + 120, Math.min(p.x + hw - 120, tv[0]));
      fy = Math.max(p.y - 30 - hh + 260, Math.min(p.y - 30 + hh - 260, tv[1]));
      // ((v4.2.0.1) the 점원 고용 pad right of the till stays in the frame, price and all, while the chief works near it
      //  (with the chief at the till the view's right edge stood 120 px past him: the pad's price was cut off there)
      //  ((v4.2.0.1) blended in over 240 px instead of switched on at 360 px: the switch swung the camera 240 px in a
      //   few frames every time the chief walked past x 1165 between the till and the net)
      const cp = this.progress && this.progress.pads && this.progress.pads.hire_clerk_market;
      if (cp && cp.active) {
        const d = Math.abs(cp.x - p.x);
        if (d < 360) {
          const want = Math.min(p.x + hw - 120, Math.max(fx, cp.x + cp.pad.w / 2 + 24 - hw));
          fx += (want - fx) * Math.min(1, (360 - d) / 240);
        }
      }
    }
    if (this.camFocus) { if (time < this.camFocus.until) { fx = this.camFocus.x; fy = this.camFocus.y; } else this.camFocus = null; }
    if (this.overview && !this.camFocus) { const r = this.overviewRect(); fx = r.x + r.w / 2; fy = r.y + r.h / 2 - 40; }
    let k = this.camFocus ? 1 - Math.pow(1 - 0.06, delta / 16.67) : 1 - Math.pow(1 - BALANCE.camera.lerp, delta / 16.67);
    // ((v4.3) 관망 둘러보기: the camera stays where the player's finger put it (CameraDirector.free, 1:1); back with the
    //  chief it glides there (pilot.camLerp) instead of jumping)
    if (this.camPan && !this.overview) { fx = this.camPan.x; fy = this.camPan.y; k = 1; this.camGlide = false; }
    else if (this.camGlide && !this.camFocus && !this.overview) {
      // (the long way back; near him the usual follow takes over — it keeps up with a walking chief)
      const gl = (BALANCE.v42 && BALANCE.v42.pilot && Number(BALANCE.v42.pilot.camLerp)) || 0.08;
      k = 1 - Math.pow(1 - gl, delta / 16.67);
      if (Math.abs(fx - ct.x) < 120 && Math.abs(fy - ct.y) < 120) this.camGlide = false;
    } else this.camGlide = false;
    // (v4.3 주민 따라가기) the followed resident wins over every other camera target (src/systems/residents/Follow.js)
    const RF = this.resFollow;
    if (RF && (RF.on || RF.back)) { k = RF.frame(ct, fx, fy, delta, k); if (RF.on) { fx = RF.px; fy = RF.py; } }
    ct.x += (fx - ct.x) * k; ct.y += (fy - ct.y) * k;

    // ambient snow
    this.snowT -= dt;
    if (this.snowT <= 0) {
      this.snowT = 0.09 / Math.max(0.05, Perf.p.snow);      // ((v4.3 perf) 중사양 0.6x, 저사양 0.3x
      const v = this.cameras.main.worldView;
      this.effects.emitters.snowfall.emitParticleAt(v.x + Math.random() * v.width, v.y - 20 + Math.random() * v.height * 0.6, 1);
    }

    // ambience by location
    this.ambT -= dt;
    if (this.ambT <= 0) {
      this.ambT = 0.25;
      // ((v4.3 review F6) where the ears are: the chief, or the camera while the player looks around in 관망)
      const L = this.camPan || p;
      const sea = Math.max(0, Math.min(1, 1 - (L.y - 400) / 900));
      this.seaAmbience(0.15 + sea * 0.6);
      let fire = 0;
      for (const s of this.stationList) if (s.working && s.enabled) { const d = Math.hypot(s.x - L.x, s.y - L.y); fire = Math.max(fire, 1 - d / 420); }
      for (const c of this.campfires || []) { const d = Math.hypot(c.x - L.x, c.y - L.y); fire = Math.max(fire, (1 - d / 350) * 0.7); }
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
    const r = this.overviewRect();
    return Math.min(vw / r.w, vh / (r.h + 80));
  }

  /** (v4-A) the land the overview frames: the area the chief is in (the village, or the rail strip + town) */
  overviewRect() {
    const T = this.territory;
    if (!T) return { x: 0, y: 0, w: this.W, h: this.H };
    // ((v4 review) the west strip (x < 0) has its own overview: with it the whole village came out at zoom 0.16,
    //  its labels specks; the chief's side of the old map edge is framed, like the v3.5 overview)
    const px = this.player ? this.player.x : 0, area = T.areaOf(px);
    // ((v4.3 verify LOOK-4) the land alone (landRect): the camera's bounds look a little past the sea's top edge)
    const land = T.landRect || T.camRect;
    if (area === 'village') { const west = px < 0; const r = T.areaRect(area, (q) => ((q.rect[0] + q.rect[2]) / 2 < 0) === west); if (r && r !== land) return r; }
    if (!T.isOpen('rail')) return land;
    return T.areaRect(area);
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
    // ---- (v4.2) 자동 줍기: every take path asks the one PickupPolicy (deliveries are never gated)
    const PP = this.v42 && this.v42.pickup;
    if (PP) PP.frame();
    const may = (src) => !PP || PP.mayTake(src, p, dt);
    const took = () => { this.padT = BALANCE.player.padItemInterval; if (PP) PP.took(p); };
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
        const can = may(s);
        if (ready && can) {
          if (s.takeTo(p, cap)) took();
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
    if (this.market.chiefOn()) on = true;
    // ((v4.3 밀밭 · 빵집) the bakery stall: its shelf pad takes bread, its till, its register R (the chief sells there)
    const bks = this.bakery && this.bakery.built ? this.bakery.stall : null;
    if (bks && bks.enabled) {
      if (bks.shelf.contains(p.x, p.y)) { on = true; if (ready && p.stack.hasAny(BAKERY_GOODS) && bks.feedFrom(p)) { this.padT = BALANCE.player.padItemInterval; bks.shelf.pulse(); bks.caseChanged(); } }
      if (bks.cash.pad.contains(p.x, p.y) || bks.register.chief) on = true;
    }
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
      else if (w.outPad.contains(p.x, p.y)) { on = true; const can = may(w); if (ready && can) { if (w.takeTo(p, cap)) took(); else if (w.outStack.count > 0 && p.room <= 0) p.warnFull(); } }
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
    if (bh && bh.enabled && bh.outPad.contains(p.x, p.y)) { on = true; const can = may(bh); if (ready && can) { if (bh.takeTo(p, cap)) took(); else if (bh.outStack.count > 0 && p.room <= 0) p.warnFull(); } }
    // (v3.5) the discard spot also comes early if the chief's full bag has nowhere to go (grill full both ways)
    if (!this._trashEarly && this.player.room <= 0 && this.tutorial && (this.trashCheckT = (this.trashCheckT || 0) - dt) <= 0) {
      this.trashCheckT = 0.5;
      const types = new Set(this.player.stack.items.map((i) => i.type));
      if (![...types].some((ty) => this.tutorial.destination(ty))) this._trashEarly = true;
    }
    this.trash.setEnabled(this.progress.isDone('hire_fisherman') || !!this._trashEarly);
    if (this.trash.update(dt)) on = true;
    // ---- (v4-B) the loading dock, the station till, a founded shop's delivery pad, a ribbon, a house site
    if (this.v4 && this.v4.growth && this.v4.growth.onPad) on = true;
    // ---- (v4-C) the restaurant's pantry / register / kitchen / cash, the town hall's tax box / notice board
    if (this.civic && this.civic.playerPads(dt)) on = true;
    return on;
  }

  /** true when the station that takes `item` can neither accept more input nor make more output (gathering would only fill the bag with things nobody takes) */
  stationBlocked(item) {
    const st = this.stationByInput && this.stationByInput[item];
    return !!(st && st.enabled && st.inStack.full && st.outStack.full);
  }

  fullToast() {
    // ((v4.2 final, gameplay review #9) not while 관망 drives the chief)
    if (this.v42 && this.v42.pilot && this.v42.pilot.on) return;
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
    // items in mid-air are saved where they are going; food a waiting customer got but has not paid for
    // yet (the queue is not saved) goes back on the shelf, and so do goods on their way to the merchant
    const shelf = (stock, types, extra) => { const o = {}, tm = (trim && trim.get(stock)) || {}; for (const ty of types) o[ty] = stock.countWithIncoming(ty) - (tm[ty] || 0) + ((extra && extra[ty]) || 0); return o; };
    const unpaid = {};
    // goods a porter is carrying are saved where they are going (v3: the place it is heading for;
    // sites and hire pads count them themselves)
    const tradeExtra = Object.assign({}, this.trade.flying);
    const storeExtra = {}, whExtra = {}, foodExtra = {}, wsExtra = {}, dockExtra = {}, pantryExtra = {}, exportExtra = {}, bakeryExtra = {};
    // ((v4.3 밀밭 · 빵집) the bakery stall's case (bread): its own place in the chain (the shop's rack takes fish + meat only)
    const BK = this.bakery && this.bakery.built ? this.bakery.stall : null;
    const add = (o, ty) => { o[ty] = (o[ty] || 0) + 1; };
    const sumOf = (o) => { let n = 0; for (const k in o) n += o[k]; return n; };
    // ((v4.2 robust review M2) every restore clamps to its place's cap, and the 창고 refuses raw goods: a load is
    //  saved at its destination only while that place still has room at the restore, else at the next place that
    //  takes it — its shelf, the restaurant pantry, the miners' food box, the 창고, its station (input / output) or
    //  pile, the boathouse, last the export dock — so a reload never loses what porters carry)
    const R = this.civic && this.civic.restaurant, F = this.v42 && this.v42.freight, W = this.warehouse, fb = this.foodBox;
    const pantry0 = R && R.enabled !== false ? R.serialize().pantry : null;
    const boat0 = this.boathouse ? this.boathouse.serialize() : null;
    const outOf = (ty) => this.stationList.find((q) => q.output === ty);
    const pileOf = (ty) => { for (const id in this.piles) if (this.piles[id].item === ty) return this.piles[id]; return null; };
    const BIN = {
      market: (ty) => SHOP_FOODS.indexOf(ty) >= 0 && this.market.stock.countWithIncoming(ty) + (unpaid[ty] || 0) < this.market.maxPerType && (add(unpaid, ty), true),
      bakery: (ty) => !!BK && BAKERY_GOODS.indexOf(ty) >= 0 && BK.stock.countWithIncoming(ty) + (bakeryExtra[ty] || 0) < BK.maxPerType && (add(bakeryExtra, ty), true),
      // ((v4.3) the shop's 자재 창구 (the trade post's place in the chain; its stock still saves as `trade`)
      mat: (ty) => GOODS.indexOf(ty) >= 0 && this.trade.enabled && this.trade.stock.countWithIncoming(ty) + (tradeExtra[ty] || 0) < this.trade.maxPerType && (add(tradeExtra, ty), true),
      store: (ty) => !!this.store && STORE_GOODS.indexOf(ty) >= 0 && this.store.stock.countWithIncoming(ty) + (storeExtra[ty] || 0) < this.store.maxPerType && (add(storeExtra, ty), true),
      pantry: (ty) => !!pantry0 && FOODS.indexOf(ty) >= 0 && (pantry0[ty] || 0) + (pantryExtra[ty] || 0) < R.pantryMax() && (add(pantryExtra, ty), true),
      food: (ty) => !!(fb && fb.active && fb.accepts(ty)) && Math.min(fb.max, fb.stock.count + fb.stock.incoming) + sumOf(foodExtra) < fb.max && (add(foodExtra, ty), true),
      wh: (ty) => !!(W && W.accepts(ty)) && W.total + (W.incoming || 0) + sumOf(whExtra) < W.cap && (add(whExtra, ty), true),
      input: (ty) => { const s = this.stationByInput[ty]; if (!s || !st[s.id] || (st[s.id].i || 0) >= s.inStack.max) return false; toStation(s.id, 1); return true; },
      out: (ty) => { const s = outOf(ty); if (!s || !st[s.id] || (st[s.id].o || 0) >= s.outStack.max) return false; st[s.id].o = (st[s.id].o || 0) + 1; return true; },
      pile: (ty) => { const pl = pileOf(ty); if (!pl || (piles[pl.id] || 0) >= Math.max(pl.stack.max + 8, pl.stack.max * 2)) return false; piles[pl.id] = (piles[pl.id] || 0) + 1; return true; },
      boat: (ty) => !!(boat0 && this.boathouse) && (ty === 'item_fish_raw' || ty === 'item_fish_big') && sumOf(boat0.catch || {}) + sumOf(dockExtra) < this.boathouse.outStack.max && (add(dockExtra, ty), true),
      dock: (ty) => !!F && (F.dock[ty] || 0) + (exportExtra[ty] || 0) < 999 && (add(exportExtra, ty), true),
    };
    const chainOf = (ty) => (BAKERY_GOODS.indexOf(ty) >= 0 ? ['bakery', 'pantry', 'food', 'wh', 'out', 'dock']
      : FOODS.indexOf(ty) >= 0 ? ['market', 'pantry', 'food', 'wh', 'out', 'dock']
      : GOODS.indexOf(ty) >= 0 ? ['mat', 'wh', 'out', 'dock']
        : STORE_GOODS.indexOf(ty) >= 0 ? ['store', 'wh', 'dock']
          : this.stationByInput[ty] ? ['input', 'pile', 'boat', 'wh', 'dock'] : ['wh', 'boat', 'dock']);
    this.saveLost = 0;
    const place = (ty, first) => {
      if (first && BIN[first] && BIN[first](ty)) return;
      for (const k of chainOf(ty)) if (k !== first && BIN[k](ty)) return;
      this.saveLost++;
    };
    for (const pr of this.porters) {
      const d = pr.dest;
      if (d && (d.kind === 'plot' || d.kind === 'tower' || d.items)) continue;
      for (const ty of pr.stack.items.map((i) => i.type).concat(pr.stack.inTypes)) {
        if (d && d.station && this.stations[d.station.id] === d.station) place(ty, 'input');
        else if (d && d.id && /_in$/.test(d.id) && d.id !== 'grill_in') {
          const k = d.id.replace(/_in$/, ''), w = this.workshops.find((q) => q.kind === k);
          const have = (w ? w.inStack.countWithIncoming(ty) : 0) + ((wsExtra[k] || {})[ty] || 0);
          if (w && w.inputTypes.indexOf(ty) >= 0 && have < w.bal.inputMax) (wsExtra[k] = wsExtra[k] || {})[ty] = ((wsExtra[k] || {})[ty] || 0) + 1;
          else place(ty, null);
        }
        else if (d && this.store && d === this.store.sink) place(ty, 'store');
        else if (d && BK && d === BK.sink) place(ty, 'bakery');
        else if (d && W && d === W.sink) place(ty, 'wh');
        else if (d && d === fb) place(ty, 'food');
        else if (d && R && d === R.sink) place(ty, 'pantry');
        else if (d && F && d === F.sink) place(ty, 'dock');
        else place(ty, null);
      }
    }
    // (a shelf can hold more than its max for a moment — a porter's load lands on a nearly full shelf, items fly in:
    //  the restore keeps maxPerType, the rest is saved elsewhere)
    const trim = new Map();
    for (const [seller, types] of [[this.market, SHOP_FOODS], [this.trade, GOODS], [this.store, STORE_GOODS], [BK, BAKERY_GOODS]]) {
      if (!seller || !seller.stock) continue;
      const tm = {};
      for (const ty of types) { const over = seller.stock.countWithIncoming(ty) - seller.maxPerType; if (over > 0) { tm[ty] = over; for (let k = 0; k < over; k++) place(ty, null); } }
      trim.set(seller.stock, tm);
    }
    // (the miners' food box itself can hold more than its max for a moment — items flying in: the rest goes elsewhere)
    const food0 = fb ? fb.serialize() : null;
    if (food0 && food0.food) {
      let over = sumOf(food0.food) - fb.max;
      for (const ty of ['item_meat_cooked', 'item_bread']) while (over > 0 && food0.food[ty] > 0) { food0.food[ty]--; over--; place(ty, null); }
    }
    for (const c of this.market.queue) for (const ty of c.bought.concat(c.flying || [])) place(ty, 'market');
    // (v3.5 review) what a gatherer carries is saved on his pile (it used to be lost on a reload); what raw porters
    // carry goes on into the input they are heading for, else back to the pile
    const typesOf = (ch) => ch.stack.items.map((i) => i.type).concat(ch.stack.inTypes);
    for (const w of this.workers) if (w.pile && w.pile.id in piles) for (const ty of typesOf(w)) place(ty, 'pile');
    for (const r of this.rawPorters) for (const ty of typesOf(r)) place(ty, r.dest && r.dest.station ? 'input' : 'pile');
    for (const c of this.store ? this.store.queue : []) for (const ty of c.bought.concat(c.flying || [])) place(ty, 'store');
    for (const c of BK ? BK.queue : []) for (const ty of c.bought.concat(c.flying || [])) place(ty, 'bakery');
    // ((v4.3 밀밭 · 빵집) the loaves still in the oven are saved on the rack (BakeryStation.serialize): past the rack's max they go
    //  to the stall's case, else on down the bread's chain)
    { const bs = this.stations.bakery, d = st.bakery; if (bs && d && d.o > bs.outStack.max) { const ov = d.o - bs.outStack.max; d.o = bs.outStack.max; for (let k = 0; k < ov; k++) place('item_bread', 'bakery'); } }
    // (v3.5 review) raw items on their way into a station that is already full go back onto its pile
    // (the input is restored up to its maximum: nothing may vanish on a reload)
    for (const s of this.stationList) {
      const d = st[s.id];
      if (!d) continue;
      const over = d.i - s.inStack.max;
      if (over <= 0) continue;
      d.i = s.inStack.max;
      const pid = PILE_OF_STATION[s.id];
      if (pid && this.piles[pid]) piles[pid] = (piles[pid] || 0) + over;
    }
    const merge = (a, b) => { const o = Object.assign({}, a || {}); for (const k in b) o[k] = (o[k] || 0) + b[k]; return o; };
    const sites = {};
    for (const id in this.sites) { const d = this.sites[id].serialize(); if (d) sites[id] = d; }
    const wss = {};
    for (const w of this.workshops) { const d = w.serialize(); if (wsExtra[w.kind]) d.ins = merge(d.ins, wsExtra[w.kind]); wss[w.kind] = d; }
    const food = food0;
    if (food) food.food = merge(food.food, foodExtra);
    const dock = boat0;
    if (dock) dock.catch = merge(dock.catch, dockExtra);
    const v3 = {
      warehouse: this.warehouse ? merge(this.warehouse.serialize(), whExtra) : undefined,
      food, dock, workshops: wss,
      store: this.store ? { stock: shelf(this.store.stock, STORE_GOODS, storeExtra), cash: this.store.cash.serialize() } : undefined,
    };
    const bkS = this.bakery ? this.bakery.stall : null;
    const pl = this.player.stack;
    const out = {
      territory: this.territory.serialize(),
      sites,
      v3,
      coins: this.economy.coins,
      progress: this.progress.serialize(),
      stations: st,
      market: { stock: shelf(this.market.stock, FOODS, unpaid), cash: this.market.cash.serialize() },
      // ((v4.3) one till for the whole shop: its coins save with `market` (an old save's trade cash is added to it on load)
      trade: { stock: shelf(this.trade.stock, GOODS, tradeExtra), cash: 0 },
      // ((v4.3 밀밭 · 빵집) the bakery stall's case and its till (bread no longer lies on the shop's rack)
      bakery: bkS ? { stock: BK ? shelf(BK.stock, BAKERY_GOODS, bakeryExtra) : { item_bread: 0 }, cash: bkS.cash.serialize() } : undefined,
      player: { x: Math.round(this.player.x), y: Math.round(this.player.y), stack: pl.items.map((i) => i.type).concat(pl.inTypes) },
      life: this.life ? this.life.serialize() : undefined,
      labour: { piles },
      dog: this.dog ? this.dog.serialize() : undefined,
      // ---- (v4-A) the v4 block (kept as it was when v4 is not running yet)
      v4: this.v4 ? this.v4.serialize() : (this.saved && this.saved.v4) || undefined,
      // ---- (v4-C) settlers, the town hall's tax box, the big restaurant's pantry and cash
      c1: this.civic ? this.civic.serialize() : undefined,
      cid: this.cid,
      // ---- (v4.2.0.1) the first-run tutorial's bits (only villages that began with it)
      onb: this.onboard ? this.onboard.serialize() : (this.saved && this.saved.onb) || undefined,
      // ---- (v4.3 마을 깃발) { s, b, p, pc, e, ec } (+ mk: 1 while the new-game maker is open); an old village without one: none
      flag: this.flags ? this.flags.serialize() : (this.saved && this.saved.flag) || undefined,
      // ---- (v4.2.0.2) 관리자 모드 (optional: only once the designer opened it / while 「코인 무제한」 is on)
      adminUses: this.adminUses > 0 ? this.adminUses : undefined,
      adminInf: this.economy.unlimited ? 1 : undefined,
      // ---- (v4.3 step B, B0) { lay, seen, refunds43 } (Save.js keeps it; S owns the full rules)
      v43: this.v43 || undefined,
      // ---- (v4.2) the v42 block + the bank (v5 format) / logistics (v8 format) slices
      ...(this.v42 ? this.v42.serialize() : { v42: this.saved && this.saved.v42, bank: this.saved && this.saved.bank, logistics: this.saved && this.saved.logistics }),
    };
    // ---- (v4.3 step B, S2) the `x` drawer and the later modules' top-level slices (missions, geumbang, haul, demand),
    //  passed through as they were loaded: a village a same-level build wrote keeps them here
    const x = this.x43 ? this.x43.serialize() : undefined;
    if (x) out.x = x;
    if (this.saved) for (const k in SLICES43) if (this.saved[k]) out[k] = this.saved[k];
    // (robust review M2) loads saved into the restaurant pantry / onto the export dock
    if (out.c1 && out.c1.rest && out.c1.rest.pantry && Object.keys(pantryExtra).length) out.c1.rest.pantry = merge(out.c1.rest.pantry, pantryExtra);
    if (out.v42 && out.v42.freight && Object.keys(exportExtra).length) out.v42.freight.dock = merge(out.v42.freight.dock, exportExtra);
    return out;
  }

  save(force) {
    if (this.resetting || this._broken || !this.player) return;
    const ok = Save.write(this.serialize());
    if (this.residentChat) this.residentChat.save();        // (v4-C2) only when a chat changed it
    // ((v4.3 step B) a held save is not "this place cannot save": its card / banner says what happened)
    if (!ok && !Save.held && !this._saveWarned) { this._saveWarned = true; this.ui.toast(t('noSave')); }
  }

  restore(sv) {
    const fx = this.effects;
    if (sv.stations) for (const s of this.stationList) s.restore(sv.stations[s.id]);
    // ((v4.3) the shop's stage is set by now (Progression.init): stage 3 racks hold 60 of a kind. What does not fit — an old
    //  trade post's goods with the 자재 창구 still closed — goes to the 창고, else it is paid at today's price into the till:
    //  nothing an old village owns may vanish)
    const over = {};
    const fillN = (stock, obj, max, ok) => { if (!obj) return; for (const ty in obj) { const n = Math.max(0, Math.floor(obj[ty] || 0)); const k = ok ? Math.min(max, n) : 0; for (let i = 0; i < k; i++) stock.push(ty, null, fx); if (n > k) over[ty] = (over[ty] || 0) + n - k; } };
    // ((v4.3 밀밭 · 빵집) bread on an old save's shop rack goes to the bakery (its stall, its rack, the 창고, else coins in its till)
    const oldBread = sv.market && sv.market.stock ? Math.max(0, Math.floor(Number(sv.market.stock.item_bread) || 0)) : 0;
    const mkStock = sv.market && sv.market.stock ? Object.assign({}, sv.market.stock) : null;
    if (mkStock) delete mkStock.item_bread;
    if (sv.market) fillN(this.market.stock, mkStock, this.market.maxPerType, true);
    if (sv.trade) fillN(this.trade.stock, sv.trade.stock, this.trade.maxPerType, this.trade.open);
    const tillCoins = (sv.market ? Math.max(0, Math.floor(Number(sv.market.cash) || 0)) : 0) + (sv.trade ? Math.max(0, Math.floor(Number(sv.trade.cash) || 0)) : 0);
    if (tillCoins > 0) this.market.cash.restore(tillCoins);
    this.shopOver = Object.keys(over).length ? over : null;
    // (what the shop took back at load: tests compare it with the save — sales start right after)
    const cnt = (st, types) => Object.fromEntries(types.map((ty) => [ty, st.countOf(ty)]));
    this.shopLoaded = { stage: this.market.stage, food: cnt(this.market.stock, FOODS), mat: cnt(this.trade.stock, GOODS), till: this.market.cash.value, over: Object.assign({}, over) };
    // ((v4.3 밀밭 · 빵집) the bakery: its saved case + till, then an old village's shop bread (stall → rack; the rest after the 창고's
    //  own stock came back: settleShopOver)
    {
      const bk = this.bakery ? this.bakery.restore(sv.bakery) : { stall: 0, over: 0 };
      let n = oldBread + bk.over;
      const res = { old: oldBread, saved: bk.stall, stall: 0, rack: 0, wh: 0, coins: 0 };
      if (n > 0 && this.bakery && this.bakery.built) {
        const S = this.bakery.stall, bs = this.stations.bakery;
        let k = Math.max(0, Math.min(n, S.maxPerType - S.stock.count));
        for (let i = 0; i < k; i++) S.stock.push('item_bread', null, fx);
        res.stall = k; n -= k;
        k = Math.max(0, Math.min(n, bs.outStack.max - bs.outStack.count - bs.outStack.incoming));
        for (let i = 0; i < k; i++) bs.outStack.push('item_bread', null, fx);
        res.rack = k; n -= k;
        S.caseShown = -1; S.caseChanged();
      }
      this.breadOver = n > 0 ? n : 0;
      res.rackAt = this.stations.bakery ? this.stations.bakery.outStack.count : 0;
      this.shopLoaded.bread = res;
    }
    if (sv.player && sv.player.stack) for (const ty of sv.player.stack.slice(0, this.player.capacity)) this.player.stack.push(ty, null, fx);
    this.market.restoreQueue(BALANCE.start.firstCustomers);
  }

  /** ((v4.3) what an old save's shelves held beyond the shop's racks (Game.restore): into the 창고 when there is room (after
   *  its own stock came back), the rest paid into the shop's till at today's price */
  settleShopOver() {
    // ((v4.3 밀밭 · 빵집) an old village's shop bread that found no room at the bakery: into the 창고, else paid at today's price
    //  into the bakery's till (the shop's while there is no bakery)
    const bo = this.breadOver || 0;
    this.breadOver = 0;
    if (bo > 0) {
      let n = bo;
      const W0 = this.warehouse, R = this.shopLoaded && this.shopLoaded.bread;
      if (W0 && W0.accepts('item_bread')) { const k = Math.max(0, Math.min(n, W0.cap - W0.total)); if (k) { W0.restore({ item_bread: k }); n -= k; if (R) R.wh = k; } }
      if (n > 0) { const c = n * priceOf('item_bread'); ((this.bakery && this.bakery.built) ? this.bakery.stall.cash : this.market.cash).addQuiet(c); if (R) R.coins = c; }
    }
    const over = this.shopOver;
    this.shopOver = null;
    if (!over) return;
    let coins = 0;
    const W = this.warehouse;
    for (const ty in over) {
      let n = over[ty];
      if (W && W.accepts(ty)) { const k = Math.max(0, Math.min(n, W.cap - W.total)); if (k) { W.restore({ [ty]: k }); n -= k; } }
      if (n > 0) coins += n * priceOf(ty);
    }
    if (coins > 0) this.market.cash.addQuiet(coins);
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
      // ---- (v4-C2) the living water, the village voices, resident chat
      water() { const w = gs.ground && gs.ground.water; return w ? Object.assign(w.info(), { floaters: (gs.floaters || []).length, budget: !!gs.waterBudget, dark: gs._waterDark || 0, sea: !!gs.ground.sea }) : { shader: false, sea: !!(gs.ground && gs.ground.sea), wait: !!(gs.ground && gs.ground.waitWater) }; },
      voice() {
        const v = gs.voice;
        if (!v) return null;
        const sp = (v.active || []).filter((u) => u).map((u) => u.voice);
        return { enabled: v.enabled, volume: v.volume, backend: !!v.backend, types: Object.keys(v.voices || {}), requested: Object.keys(v.requested || {}), stats: Object.assign({}, v.stats || {}), speaking: sp, maxVoices: v.maxVoices, pending: (v.pending || []).length };
      },
      chat() { return gs.residentChat ? gs.residentChat.state() : null; },
      chatOpen(key) {
        const r = gs.life && gs.life.residents.find((x) => (!key || x.key === key) && gs.residentChat.canChat(x));
        return r ? (gs.residentChat.open(r) ? r.key : null) : null;
      },
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
          bakery: gs.bakery ? gs.bakery.state() : null,
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
          // ---- (v4-A)
          v4: gs.v4 ? gs.v4.state() : null,
          // ---- (v4-C)
          civic: gs.civic ? gs.civic.state() : null,
          // ---- (v4.2)
          v42: gs.v42 ? gs.v42.state() : null,
        };
      },
      give(c) { gs.economy.add(Math.floor(c || 0)); return gs.economy.coins; },
      /** ((v4.3 밀밭 · 빵집) the bakery: built, the case / rack / oven / wheat, its till, line, clerk, baker (Bakery43.state) */
      bakery() { return gs.bakery ? gs.bakery.state() : null; },
      /** (v4.3) the fishing deck: state; { hire: n } hires fishermen up to n (the steps hire_fisherman / hire2 / hire3, their
       *  pads skipped: tests), { instant } seats them at once */
      deck(o) {
        if (!gs.deck) return null;
        if (o && o.hire) {
          const pr = gs.progress, ids = ['hire_fisherman', 'hire2_fisherman', 'hire3_fisherman'].slice(0, Math.min(3, o.hire));
          for (const id of ids) {
            if (pr.done[id]) continue;
            const s = STEPS.find((q) => q.id === id);
            pr.done[id] = true;
            const pad = pr.pads[id];
            if (pad) { pad.destroy(); delete pr.pads[id]; }
            pr.applyStep(s, !!o.instant, o.x, o.y);
          }
        }
        return gs.deck.state();
      },
      unlockAll() {
        const pr = gs.progress;
        for (const s of STEPS) {
          if (pr.done[s.id] || s.v3 || s.v4 || s.c1) continue;     // (v3 steps: unlockV3; v4 steps come with the neighbours; (v4-C) staff come with their building)
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
      /** (v4-B) texture residency: MiB by class, budget, loads / evictions (docs/v4_plan.md §11.5) */
      texStats() { return Residency.stats(); },
      /** (v4-B) view culling: { culled, passes, enabled }; cull(false) draws everything */
      cull(v) { const c = gs.culler; if (!c) return null; if (v !== undefined) c.setEnabled(v); return { culled: c.culled, passes: c.passes, enabled: c.enabled, ms: +c.ms.toFixed(3) }; },
      /** (v4-B) is atlas / image `k` loaded (any of its packed pages)? */
      hasTex(k) { return !!Assets.texOf(k); },
      /** (v4-B) the asset registry (tests: failed / queued / pages) */
      assets() { return Assets; },
      teleport(x, y) { gs.player.x = x; gs.player.y = y; gs.camTarget.x = x; gs.camTarget.y = y - 30; gs.player.sync(0); },
      setInput(vx, vy) { Input.override = (vx || vy) ? { x: vx, y: vy } : null; },
      where(name) {
        const S = gs.stations;
        const m = {
          net: gs.net.gather, grillIn: S.grill.inPad, grillOut: S.grill.outPad, shelf: gs.market.shelf, cash: gs.market.cash.pad,
          tradeShelf: gs.trade.shelf, tradeCash: gs.trade.cash.pad, bench: gs.bench, trash: gs.trash,
          register: gs.market.register, tradeRegister: gs.trade.register,
          // ((v4.3) the shop's counters: matShelf / matRegister (= trade*, only while the 자재 창구 is open), the food lanes'
          //  registers, the merchant; (review PT-4) the deck's reel spot and fish crate, the food lanes' shelf (one rack)
          matShelf: gs.trade.enabled ? gs.trade.shelf : null, matRegister: gs.trade.enabled ? gs.trade.register : null, merchant: gs.trade.merchant,
          reel: gs.deck ? gs.deck.gather : gs.net.gather, deckReel: gs.deck ? gs.deck.gather : null, crate: gs.piles.fish || null,
          fishShelf: gs.market.shelf, meatShelf: gs.market.shelf,
        };
        // ((v4.3 밀밭 · 빵집) the bakery: its stall's shelf pad / register R / till, the doorway pad W, the oven's in-pad I and the
        //  bread rack O, the baker's post, the stall itself, the field's 농막 (breadShelf = the stall's shelf now)
        const BKy = gs.bakery;
        if (BKy && BKy.built) {
          const S = BKy.stall, bs = gs.stations.bakery;
          Object.assign(m, { bakeryStall: S, bakeryShelf: S.shelf, breadShelf: S.shelf, bakeryRegister: S.register, bakeryCash: S.cash.pad, bakeryDoor: bs.op, bakeryIn: bs.inPad, bakeryOut: bs.outPad, bakeryRack: bs.outPad, bakeryPost: bs.op.post, bakeryCase: S.caseAt });
        }
        if (BKy) m.bakery = BKy.station;
        { const q = WORLD.roads.nodes.bakery_q; if (q) m.bakeryQ = { x: q[0], y: q[1] }; }
        if (gs.decorById && gs.decorById.farm43_hut) m.nongmak = gs.decorById.farm43_hut;
        for (const id in gs.market.lanes || {}) { const L = gs.market.lanes[id]; if (L.open && L.register) m[id + 'Register'] = L.register; }
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
        // (v4-C) the town hall (tax box, notice board pad, venue) and the big restaurant (pantry, kitchen, register, cash, staff pad)
        const cv = gs.civic;
        if (cv && cv.hall) { m.hallTax = cv.hall.tax.pad; m.hallBoard = cv.hall.boardPad; m.hallVenue = cv.hall.venue('rank'); m.hall = cv.hall; }
        if (cv && cv.restaurant) { const w = cv.restaurant.where(); m.restPantry = w.pantry; m.restKitchen = w.kitchen; m.restRegister = w.register; m.restCash = w.cash; m.restStaff = w.staff; m.restQueue = w.queue; m.restTablesPad = w.tablesPad; }
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
      choices(id) { const st = gs.sites[id]; return st ? gs.buildChoices(st).map((c) => ({ key: c.key, locked: c.locked, reason: c.reason, coins: c.cost.coins, text: c.text || undefined, cat: c.cat })) : null; },
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
      /** (v4-B) put n items of `type` in the chief's bag (test setup) */
      carry(type, n) { const st = gs.player.stack; for (let i = 0; i < (n || 1) && st.count < gs.player.capacity; i++) st.push(type, null, gs.effects); return st.count; },
      // ---------------- (v4-C) test helpers
      /** settlers, the hall, the restaurant, decor (Civic.state) */
      civic() { return gs.civic ? gs.civic.state() : null; },
      /** n settlers move in now (instant: no walk) */
      settlers(n, instant) { return gs.civic ? gs.civic.settlersArrive(n || 1, instant !== false) : 0; },
      /** put cooked food straight into the big restaurant's pantry ({ item_bread: 5, ... }) */
      restFood(m) { const R = gs.civic && gs.civic.restaurant; if (!R) return null; for (const k in m || {}) for (let i = 0; i < m[k] && R.pantry.countWithIncoming(k) < R.pantryMax(); i++) R.pantry.push(k, null, gs.effects); return R.state().pantry; },
      /** the build menu's tabs and cards as shown (UI scene) */
      menu() { const ui = gs.scene.get('UI'); return ui && ui.buildOpen ? { tab: ui.buildTab, tabs: ui.buildTabs, cards: (ui.buildCards || []).map((c) => ({ key: c.ch.key, locked: c.ch.locked, text: c.ch.text })), all: (ui.buildChoicesList || []).map((c) => ({ key: c.key, cat: c.cat, locked: c.locked, text: c.text })) } : null; },
      reset() { gs.resetProgress(); },
      // ---------------- (v4.2.0.1) the first-run tutorial
      /** { mode, act, step, bits, card, hand, target, tip, rects (screen boxes, logical px) } */
      onboard() { const o = gs.onboard; if (!o) return null; const ui = gs.scene.get('UI'); const st = o.state(); st.rects = ui && ui.onboardOv ? ui.onboardOv.rects() : null; return st; },
      onboardSkip() { if (gs.onboard) gs.onboard.skip(); return gs.onboard ? gs.onboard.state() : null; },
      onboardReplay() { return gs.onboard ? gs.onboard.replay() : false; },
      onboardNext() { if (gs.onboard) gs.onboard.next(); return gs.onboard ? gs.onboard.state() : null; },
      warnings() { return Array.from(Assets.warned); },
    });
    window.__FV = hooks;
  }
}
