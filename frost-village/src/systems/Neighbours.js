// Neighbours (v4, docs/v4_plan.md §17.1): the v4 orchestrator — the neighbour town 솔방울 마을, the rail strip
// and its station, the snow train, the townsfolk and their trips to our sellers, day and night.
// Lifecycle: nothing exists before the tower_east site starts (the first 20 minutes are v3.5 exactly); then the
// v4 manifests prefetch; when tower_east is lit the rail strip opens with the east coast and this is made (or on
// load when the strip is open). BUILD-B's systems (growth, rank) hang in this.growth / this.rank.
//   gs.v4.rail / .train / .town / .clock / .openTown()   events: v4:train, v4:visitorDone, v4:hour, v4:stationOpen, v4:townOpen

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { TF } from '../core/Townfolk.js';
import { BALANCE } from '../data/balance.js';
import { WORLD, L4, px2L4 } from '../data/world.js';
import { t, line } from '../data/strings.js';
import { gdist } from '../core/Iso.js';
import { DEPTH } from './DepthSort.js';
import { Rail } from './Rail.js';
import { RoadNet } from './RoadNet.js';
import { TownSim, F } from './TownSim.js';
import { DayClock } from './DayClock.js';
import { V4Paint, PAINT_FILES } from './V4Paint.js';
import { Train } from '../entities/Train.js';
import { RailStation, stationSign } from '../entities/RailStation.js';
import { TownBuilding } from '../entities/TownBuilding.js';
import { Visitor } from '../entities/Visitor.js';
import { Character } from '../entities/Character.js';

const TOWN_FIRST = ['town_rails', 'town_civic', 'town_street'];
const TOWN_REST = ['town_shops', 'town_homes', 'town_park'];
const TRAIN_FILES = ['train_engine', 'train_car_a', 'train_car_b'];
const AUDIO3 = ['sfx_steam_whistle', 'sfx_brakes', 'sfx_door', 'sfx_school_bell', 'sfx_bell_hall', 'sfx_mission_done', 'sfx_fame_up', 'sfx_sleigh_bells', 'amb_town', 'amb_night'];

/** a townsperson actor for scripted moments (the mayor, founders, builders): a Character with a doll */
export class Actor extends Character {
  constructor(gs, nb, citizen, x, y) {
    super(gs, 'tf:' + citizen.person.base, x, y, { person: citizen.person, radius: 13 });
    this.nb = nb; this.c = citizen; this.target = null; this.cb = null; this.speed = 95;
    gs.agents.push(this);
    this.sprite.setAlpha(0); this.shadow.setAlpha(0);
    gs.tweens.add({ targets: [this.sprite, this.shadow], alpha: 1, duration: 300 });
  }
  walkTo(x, y, cb) { this.route = this.gs.roads.route(this.x, this.y, x, y, []); this.ri = 0; this.target = { x, y }; this.cb = cb || null; return this; }
  say(key) { const B = this.nb.bubbles(); if (B) B.chat(this, line(key) || key, null, 2.8); return this; }
  emote(key) { const B = this.nb.bubbles(); if (B) B.emote(this, key, 1.8); return this; }
  update(dt) {
    if (!this.alive) return;
    if (this.target) {
      if (this.gs.followRoute(this, this.speed, dt, 10)) { this.target = null; this.vx = this.vy = 0; this.locomotion(false); const cb = this.cb; this.cb = null; if (cb) cb(this); }
    } else if (this.animName === 'walk') this.locomotion(false);
    if (this.alive) this.sync(dt);
  }
  release() {
    if (!this.alive) return;
    const i = this.gs.agents.indexOf(this);
    if (i >= 0) this.gs.agents.splice(i, 1);
    const j = this.nb.actors.indexOf(this);
    if (j >= 0) this.nb.actors.splice(j, 1);
    this.gs.tweens.add({ targets: [this.sprite, this.shadow], alpha: 0, duration: 300, onComplete: () => this.destroy() });
    this.alive = false;
  }
}

export class Neighbours {
  // ---------------------------------------------------------------- lifecycle
  /** wire v4 into the Game (called once in Game.build): made now when the rail strip is open, else later */
  static attach(gs, saved) {
    gs.v4 = null;
    gs.v4Saved = saved || null;
    if (gs.territory.isOpen('rail')) { gs.v4 = new Neighbours(gs, saved, true); return gs.v4; }
    const onSite = (site) => { if (site && site.id === 'tower_east') Neighbours.prefetch(gs); };
    gs.events.on('siteStarted', onSite);
    // a save with the tower_east site under way already
    const tw = gs.sites && gs.sites.tower_east;
    if (tw && tw.state !== 'plot') Neighbours.prefetch(gs);
    const onRegion = (id) => {
      if (id !== 'rail' || gs.v4) return;
      gs.events.off('region', onRegion);
      gs.events.off('siteStarted', onSite);
      gs.v4 = new Neighbours(gs, gs.v4Saved, false);
    };
    gs.events.on('region', onRegion);
    return null;
  }

  /** the tower_east site started: fetch the v4 manifests and the first pictures (silently) */
  static prefetch(gs) {
    if (gs._v4pre) return;
    gs._v4pre = true;
    Assets.loadFragment(gs, 'town', { only: TOWN_FIRST });
    Assets.loadFragment(gs, 'roads', { only: PAINT_FILES });
  }

  constructor(gs, saved, instant) {
    this.gs = gs;
    gs.v4 = this;
    const s = saved && typeof saved === 'object' ? saved : {};
    this.saved = s;
    this.growth = null;          // (BUILD-B) Growth: orders, cargo, founding
    this.rank = null;            // (BUILD-B) Rank: 마을 -> 읍
    this.visitors = [];
    this.actors = [];
    this.onBoard = [];           // citizens on the train now
    this.arrivals = 0;
    this.waitNext = { ours: [], town: [] };
    this.sendQ = [];
    this.district = 0;
    this.extra = Array.isArray(s.town && s.town.extra) ? s.town.extra.slice(0, 64) : [];
    this.regulars = Array.isArray(s.town && s.town.regulars) ? s.town.regulars : [];
    this.seed = (s.town && Number.isFinite(s.town.seed)) ? s.town.seed >>> 0 : (BALANCE.v4.town.seed >>> 0);
    this.ready = false;
    this.clock = new DayClock(gs, s.clock);
    this.rail = new Rail();
    this.rail.on((ev, stop) => this.onRail(ev, stop));
    this.buildings = [];
    Neighbours.prefetch(gs);
    gs.queueLate = gs.queueLate || (() => gs.queueLateFiles && gs.queueLateFiles());
    this.paint = new V4Paint(gs, { drifts: true });
    // the town pictures / data arrive late: build the town as soon as the town manifest is here
    Assets.loadFragment(gs, 'town', { only: TOWN_FIRST }, () => this.onTownManifest());
    if (!instant || !gs.progress.seen.railFound) this.revealSoon(instant ? 2000 : 1400);
    gs.events.on('built', (k) => { if (k === 'station') { /* (handled in stationBuilt) */ } });
    gs.events.on('siteStarted', (site) => { if (site && site.building === 'station') this.prefetchStation(); });
    gs.events.on('region', (id) => { if (id === 'town') this.onTownOpen(); });
    gs.events.once('shutdown', () => this.destroy());
    this.installHooks();
  }

  /** the station site started: sounds, the train, the townsfolk */
  prefetchStation() {
    if (this._preStation) return;
    this._preStation = true;
    const gs = this.gs;
    Assets.loadFragment(gs, 'audio3', { audio: AUDIO3 });
    Assets.loadFragment(gs, 'town', { only: TOWN_FIRST.concat(TRAIN_FILES) });
    Assets.loadFragment(gs, 'townfolk', {}, () => {
      TF.init(Assets.lateManifest.townfolk, gs.game);
      const want = TF.sheetsFor('adult').concat(TF.sheetsFor('elder'));
      for (const k of want) Assets.lateWant.add(k);
      gs.queueLateFiles();
      this.onTownfolk();
    });
  }

  /** the town manifest is here: the buildings, the station, the walk graph */
  onTownManifest() {
    if (this.ready) return;
    const gs = this.gs, V = WORLD.v4;
    this.ready = true;
    // walk graph (door spurs from the manifest) merged into the village roads
    const doors = [];
    for (const b of V.town.buildings) { const d = Assets.def(b.key).doorPoint; if (d) doors.push({ id: b.id, x: b.x + d[0], y: b.y + d[1] }); }
    for (const id in V.lots) { const l = V.lots[id]; const [x, y] = L4(l.i, l.j - l.m[1] / 2 / Math.SQRT2 - 0.2); doors.push({ id, x, y }); }
    this.roadNet = new RoadNet(V, { doors });
    gs.roadNet = this.roadNet;
    if (gs.roads.addGraph) gs.roads.addGraph(this.roadNet.walkGraph());
    // our station (the ruin until repaired) on the plot r_station
    const site = gs.sites && gs.sites[V.stations.ours.plot];
    const open = !!(site && site.state === 'done');
    this.ours = new RailStation(gs, V.stations.ours, { open });
    this.ours.img.setDepth(this.ours.y - 1);
    gs.territory.add('rail', this.ours);
    // the town (hidden in its fog until the invitation)
    for (const b of V.town.buildings) {
      if (b.role === 'station') { const tb = new TownBuilding(gs, b, { collision: false }); this.townStation = tb; this.addStationShape(tb); tb.boardText = stationSign(gs, tb.x, tb.y, t('stn_town')); this.buildings.push(tb); gs.territory.add(b.region || 'town', tb); continue; }
      const tb = new TownBuilding(gs, b);
      this.buildings.push(tb);
      gs.territory.add(b.region || 'town', tb);
    }
    let n = 0;
    for (const [key, i, j] of V.town.props) {
      const [x, y] = L4(i, j);
      const role = /^bench/.test(key) ? 'bench' : 'light';
      const tb = new TownBuilding(gs, { id: 'prop_' + key + '_' + (n++), key, x, y, i, j, role }, { occluder: false });
      this.buildings.push(tb);
      gs.territory.add(L4(i, j)[0] >= WORLD.territory.town.rect[0] ? 'town' : 'rail', tb);
    }
    // the sign post at the far end of the track (to the harbour, v6)
    const sg = V.rail.sign;
    if (sg) { const [x, y] = L4(sg.i, sg.j); this.signpost = gs.staticImage('signpost', x, y, { region: 'town' }); this.signText = gs.add.text(x, y - 92, t('signHarbor'), { fontFamily: gs.font, fontSize: '16px', fontStyle: '800', color: '#ffffff', stroke: '#4a5a72', strokeThickness: 5, resolution: 2 }).setOrigin(0.5).setDepth(y + 1); gs.territory.add('town', this.signText); }
    // lamps for the night: town street lights (one by one from the station outward), the station clocks
    for (const b of this.buildings) {
      if (b.role !== 'light') continue;
      const d = Assets.def(b.key), fp = d.fxPoints || {};
      for (const k of ['light', 'lightA', 'lightB']) if (fp[k]) this.clock.addLight(b.x + fp[k][0], b.y + fp[k][1], 1, Math.abs(b.x - 4912));
    }
    for (const st of [this.ours, this.townStation]) if (st) { const c = st.clock || (st.fx && st.fx.clock); if (c) this.clock.addLight(c.x, c.y, 0.7, Math.abs(c.x - 4912)); this.clock.addLight(st.x + 74, st.y - 46, 1, Math.abs(st.x - 4912)); }
    for (const img of gs.lamps || []) this.clock.addLight(img.x, img.y - 92, 0.9, 9000 + img.x);
    for (const c of gs.campfires || []) this.clock.addLight(c.x, c.y - 20, 1.3, 9500 + c.x);
    // the train (runs once the station is repaired)
    this.train = new Train(gs, this.rail);
    if (open) this.stationOpen(true);
    // the people of the town (when their manifest is here)
    if (open || this._preStation) this.prefetchStation();
    if (gs.territory.isOpen('town')) this.onTownOpen(true);
  }

  /** the town station: collision on its building only (the platform is walkable), its platform for the sim */
  addStationShape(tb) {
    tb.lift = Assets.def(tb.key).platformLiftPx || 18;
    const poly = (Assets.def(tb.key).platformPoly || [[-262, -49], [63, 114], [131, 80], [-195, -83]]).map((p) => ({ x: tb.x + p[0], y: tb.y + p[1] }));
    tb.onPlatform = (x, y) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i].y > y) !== (poly[j].y > y) && x < ((poly[j].x - poly[i].x) * (y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) inside = !inside; return inside; };
    for (const [i, j, r] of [[-2.1, 2.9, 62], [-0.6, 2.9, 62], [0.9, 2.9, 62], [2.1, 2.7, 50]]) {
      const [x, y] = L4(tb.cfg.i + i, j);
      tb.obstacles.push(this.gs.collision.add(x, y, r, 'station'));
    }
  }

  /** the townsfolk manifest is here: the people (they start living with the first train) */
  onTownfolk() {
    if (this.town || !TF.ok || !this.ready) { if (!this.ready) this._tfPending = true; return; }
    this.town = new TownSim(this, { seed: this.seed, extra: this.extra });
    for (const [id, v] of this.regulars) { const c = this.town.get(id); if (c && Number.isFinite(v)) { c.visits = Math.min(999, v); c.regular = v >= (BALANCE.v4.visitors.regularAt || 3); } }
    if (this.clock.on) this.town.start(this.clock.simT());
  }

  // ---------------------------------------------------------------- reveal / station / town
  /** the camera visits the ruin with the banner (once) */
  revealSoon(ms) {
    const gs = this.gs;
    gs.time.delayedCall(ms, () => {
      if (gs.progress.seen.railFound) return;
      gs.progress.seen.railFound = true;
      gs.focusCamera(3410, 1360, 2500);
      gs.ui.banner(t('railFound'), t('railFoundSub'));
      gs.save(true);
    });
  }

  /** Game.makeBuilding('station'): the repair is done */
  stationBuilt(site, instant) {
    if (!this.ours) this.onTownManifest();
    this.stationOpen(instant);
    const st = this.ours;
    return { revealObjects: () => [], setEnabled: (v) => st && st.setEnabled(v), station: st };
  }

  stationOpen(instant) {
    const gs = this.gs;
    if (this.rail.running) return;
    if (this.ours) this.ours.repair(instant);
    if (this.paint) this.paint.setDrifts(false);
    this.prefetchStation();
    this.rail.running = true;
    if (instant || gs.progress.flags.firstTrain) {
      // a reload: the train restarts dwelling at the town with 5 s left
      this.rail.set('atTown', this.rail.dur('atTown') - 5);
      if (gs.progress.flags.firstTrain) this.clock.start();
      if (this.town && this.clock.on && !this.town.started) this.town.start(this.clock.simT());
      return;
    }
    // the first train: it rolls in a few seconds after the repair
    const T = this.rail.leg.T, first = (BALANCE.v4.train.firstDelay || 3) + 3;
    this.rail.set('toOurs', Math.max(0, T - first));
    this.firstPending = true;
    gs.events.emit('v4:stationOpen');
    gs.time.delayedCall(700, () => gs.ui.banner(t('stationRepaired'), t('stationRepairedSub')));
  }

  /** the invitation (or a save): the fog over the town clears */
  openTown(instant) {
    const gs = this.gs;
    if (gs.territory.isOpen('town')) return false;
    gs.progress.setFlag('townInvite');
    gs.territory.reveal('town', instant, true);
    if (!instant) {
      // a ride along the track to the town station and back
      const a = L4(14, -1), b = L4(28, 0);
      gs.focusCamera(a[0], a[1], 1200);
      gs.time.delayedCall(1100, () => gs.focusCamera(b[0], b[1] - 60, 2000));
      gs.time.delayedCall(3200, () => { gs.camFocus = null; });
      gs.time.delayedCall(1400, () => gs.ui.banner(t('inviteTitle'), t('inviteSub')));
    }
    gs.save(true);
    return true;
  }

  onTownOpen(instant) {
    const gs = this.gs;
    if (this._townOpened) return;
    this._townOpened = true;
    Assets.loadFragment(gs, 'town', { only: TOWN_FIRST.concat(TOWN_REST) });
    if (TF.ok) { for (const k of TF.sheetsFor('child')) Assets.lateWant.add(k); gs.queueLateFiles(); }
    else this._wantChild = true;
    gs.events.emit('v4:townOpen');
    void instant;
  }

  townVisible() { return this.gs.territory.isOpen('town'); }
  nearTown() { const v = this.gs.cameras.main.worldView; return v.centerX > WORLD.territory.town.rect[0] - 300; }
  trainRuns() { return this.rail.running; }
  bubbles() { return this.gs.life ? this.gs.life.bubbles : null; }
  sellers() { const gs = this.gs; return [gs.market, gs.store].filter(Boolean); }
  charDef(key) { return Assets.charDef(key); }

  // ---------------------------------------------------------------- the train
  onRail(ev, stop) {
    const gs = this.gs;
    gs.events.emit('v4:train', ev, stop);
    if (ev === 'whistle') {
      const p = stop === 'ours' ? this.ours : this.townStation;
      if (p && gs.isOnScreen(p.x, p.y, 900)) Audio.play(Audio.exists('sfx_steam_whistle') ? 'sfx_steam_whistle' : 'sfx_boat_horn', { volume: gs.isOnScreen(p.x, p.y, 0) ? 0.9 : 0.45 });
      return;
    }
    if (ev === 'arrive') {
      const p = stop === 'ours' ? this.ours : this.townStation;
      if (p && gs.isOnScreen(p.x, p.y, 400)) { Audio.play('sfx_brakes', { volume: 0.7 }); if (this.train) this.train.puffs(3); }
      if (stop === 'ours') this.arriveOurs(); else this.arriveTown();
      for (const fn of this.waitNext[stop].splice(0)) { try { fn(); } catch (e) { console.error(e); } }
      return;
    }
    if (ev === 'depart' && stop === 'ours') {
      // whoever is still walking to the doors stays for the next train
      for (const v of this.visitors) if (v.stage === 'board') v.stage = 'home';
    }
  }

  /** riders for the next train to our village */
  ridersWanted() {
    const V = BALANCE.v4.visitors, T = BALANCE.v4.train;
    const shops = this.growth && this.growth.openShopCount ? this.growth.openShopCount() : 0;
    const rank = this.rank && this.rank.level ? this.rank.level : 1;
    const seats = (T.seats || 12) + (this.rail.coaches > 1 ? (T.coachSeats || 8) : 0);
    const mult = V[this.clock.phase()] !== undefined ? V[this.clock.phase()] : 1;
    return Math.max(1, Math.round(Math.min(V.base + shops * V.perShop + (rank - 1) * V.perRank, seats) * (this.clock.on ? mult : 1)));
  }

  arriveTown() {
    const gs = this.gs;
    const T = this.clock.simT();
    // home again: off the train at the town station
    const st = this.townStation;
    const pts = st && st.board && st.board.length ? st.board : [{ x: 4900, y: 2200 }];
    let k = 0;
    for (const c of this.onBoard) if (this.town) this.town.alight(c, T, pts[k++ % pts.length]);
    this.onBoard = [];
    // and the next riders get on (the waiting ones from the platform first)
    if (this.town) {
      const n = this.firstPending ? (BALANCE.v4.train.firstRide || 6) : this.ridersWanted();
      this.onBoard = this.town.pickRiders(n, { any: !this.townVisible() });
    }
    void gs;
  }

  arriveOurs() {
    const gs = this.gs;
    // the very first train: the clock starts, the town starts living
    if (this.firstPending || !gs.progress.flags.firstTrain) {
      gs.progress.setFlag('firstTrain');
      this.clock.start();
      this.firstTrainAt = gs.time.now;
      if (this.town && !this.town.started) this.town.start(this.clock.simT());
    }
    let riders = this.onBoard;
    this.onBoard = [];
    // a first train before the townsfolk are ready: they ride the next one
    if (this.firstPending && this.town && !riders.length) riders = this.town.pickRiders(BALANCE.v4.train.firstRide || 6, { any: true });
    const first = this.firstPending;
    this.firstPending = false;
    this.arrivals++;
    const st = this.ours;
    const pts = st ? st.board : [{ x: 3300, y: 1360 }];
    riders.forEach((c, i) => gs.time.delayedCall(450 + i * 250, () => this.alightVisitor(c, pts[i % pts.length])));
    if (riders.length && gs.isOnScreen(st.x, st.y, 500)) for (let i = 0; i < Math.min(3, riders.length); i++) gs.time.delayedCall(400 + i * 300, () => Audio.play('sfx_door', { volume: 0.45, throttle: 300 }));
    if (this.arrivals <= 3 && riders.length) gs.ui.toast(t('trainArrive', { n: riders.length }));
    if (first) {
      gs.focusCamera(st.x - 60, st.y + 40, 2500);
      gs.time.delayedCall(800, () => gs.ui.banner(t('firstTrain'), t('firstTrainSub')));
      gs.save(true);
    }
    // the visitors waiting on the platform board (during the dwell)
    let k = 0;
    for (const v of this.visitors) if (v.stage === 'platform' || (v.stage === 'home' && st && gdist(v.x, v.y, st.x, st.y) < 380)) gs.time.delayedCall(1500 + (k++) * 300, () => { if (v.alive && (v.stage === 'platform' || v.stage === 'home')) v.boardTrain(pts[k % pts.length]); });
  }

  /** a townsperson steps off the train at our station */
  alightVisitor(c, p) {
    const gs = this.gs;
    if (!c || !TF.ok) return;
    const plan = this.planFor(c);
    if (!plan) { this.onBoard.push(c); return; }           // nothing to buy anywhere: rides back
    c.flags = (c.flags & ~F.ON_TRAIN) | F.IN_VILLAGE;
    c.act = 'shop';
    const v = new Visitor(gs, this, c, p.x + (Math.random() - 0.5) * 14, p.y + (Math.random() - 0.5) * 8, plan);
    v.sprite.noFade = true;
    this.visitors.push(v);
    c.visitor = v;
  }

  /** where a visitor goes: the plaza market (foods), the general store, (B) a founded shop */
  planFor(c) {
    const gs = this.gs, V = BALANCE.v4.visitors;
    const r = Math.random;
    const mk = gs.market, sto = gs.store;
    const targets = [];
    const storeOk = !!(sto && sto.enabled && (sto.availableFoods ? sto.availableFoods().length : true));
    if (storeOk && r() < V.storeChance) { targets.push(sto); if (r() < 0.5) targets.push(mk); }
    else { targets.push(mk); if (storeOk && r() < V.storeChance) targets.push(sto); }
    const n = V.wantMin + Math.floor(r() * (V.wantMax - V.wantMin + 1));
    return { targets, want: { type: (mk.availableFoods()[0]) || 'item_fish_cooked', count: n } };
  }

  /** a free spot to look around near seller m while its line is full */
  browseSpot(m) {
    const a = (Math.random() - 0.5) * 2;
    return { x: m.x + 160 + a * 90, y: m.y + 150 + Math.abs(a) * 40 };
  }

  /** where a visitor waits for the train home */
  platformSpot(v) {
    const st = this.ours;
    const w = st ? st.wait : [{ x: 3300, y: 1360 }];
    const p = w[(v.citizen.id * 3) % w.length];
    return { x: p.x + ((v.citizen.id * 17) % 30 - 15), y: p.y + ((v.citizen.id * 11) % 14 - 7) };
  }

  /** the level crossing nearest a point */
  xingNear(x) { const R = WORLD.v4.rail.crossings; let best = R[0], bd = Infinity; for (const k of R) { const d = Math.abs(L4(k + 0.5, 0)[0] - x); if (d < bd) { bd = d; best = k; } } return best; }

  visitorAtPlatform(v) { void v; }
  visitorBoarded(v) {
    const c = v.citizen;
    c.flags = (c.flags & ~F.IN_VILLAGE) | F.ON_TRAIN;
    c.visitor = null;
    this.onBoard.push(c);
  }
  visitorGone(v) {
    const i = this.visitors.indexOf(v);
    if (i >= 0) this.visitors.splice(i, 1);
    const c = v.citizen;
    // gone without boarding (cleanup): home by the next train
    if (c && (c.flags & F.IN_VILLAGE)) { c.flags = (c.flags & ~F.IN_VILLAGE) | F.ON_TRAIN; c.visitor = null; this.onBoard.push(c); }
  }

  /** visitors of seller m that wait to get into its line (anonymous customers let them in first) */
  visitorsWaiting(m) {
    let n = 0;
    for (const v of this.visitors) if (v.target === m && (v.stage === 'browse' || (v.stage === 'walk' && gdist(v.x, v.y, m.x, m.y) < 900))) n++;
    return n;
  }

  /** the look of a new anonymous customer: a real townsperson (once the neighbours come by train) */
  pickLook(market) {
    const gs = this.gs;
    if (!gs.progress.flags.firstTrain || !this.town || !TF.ok) return null;
    const ready = { adult: TF.readyFor(Assets, 'adult'), elder: TF.readyFor(Assets, 'elder'), child: TF.readyFor(Assets, 'child') };
    if (!ready.adult) return null;
    const L = this.town.citizens;
    const ok = (c) => !(c.flags & (F.ON_TRAIN | F.IN_VILLAGE)) && (c.kind === 'adult' || c.kind === 'elder' || c.kind === 'teen') && ready[TF.age(c.person.base)] && !(c.body && c.body.alive);
    let c = null;
    for (let k = 0; k < 8 && !c; k++) { const q = L[Math.floor(Math.random() * L.length)]; if (ok(q) && (q.act === 'errand' || q.act === 'trip' || k > 3)) c = q; }
    if (!c) return null;
    void market;
    return { key: 'tf:' + c.person.base, person: c.person, citizen: c };
  }
  noteVisit(c) { if (!c) return; c.visits = (c.visits || 0) + 1; if (c.visits >= (BALANCE.v4.visitors.regularAt || 3)) c.regular = true; }

  /** is something standing on the track ahead of the train? (the chief, the dog) */
  trackBlocked(nose, dir, dist) {
    const gs = this.gs;
    const test = (x, y) => {
      const q = px2L4(x, y);
      if (Math.abs(q.j) > 0.64) return false;
      const m = this.rail.mAt(q.i);
      return dir > 0 ? (m > nose - 0.3 && m < nose + dist) : (m < nose + 0.3 && m > nose - dist);
    };
    if (test(gs.player.x, gs.player.y)) return true;
    if (gs.dog && gs.dog.r && test(gs.dog.r.x, gs.dog.r.y)) return true;
    return false;
  }

  // ---------------------------------------------------------------- update
  update(dt) {
    const gs = this.gs;
    if (!this.ready) return;
    const t0 = performance.now();
    this.rail.update(dt, (nose, dir, dist) => this.trackBlocked(nose, dir, dist));
    if (this.rail.blockedT > 0) {
      this.whT = (this.whT || 0) - dt;
      if (this.whT <= 0) { this.whT = 3; Audio.play(Audio.exists('sfx_steam_whistle') ? 'sfx_steam_whistle' : 'sfx_boat_horn', { volume: 0.8 }); }
      if (this.rail.blockedT > 2 && !this._offT) { this._offT = true; gs.ui.toast(t('obj_off_track')); }
    } else this._offT = false;
    const tr0 = performance.now();
    if (this.train) this.train.update(dt);
    this.clock.update(dt);
    const ts0 = performance.now();
    if (this.town) this.town.update(dt, this.clock.simT());
    this.msTown = (this.msTown || 0) * 0.95 + (performance.now() - ts0) * 0.05;
    this.msRail = (this.msRail || 0) * 0.95 + (ts0 - tr0) * 0.05;
    for (let i = this.visitors.length - 1; i >= 0; i--) { const v = this.visitors[i]; if (v.alive && v.stage !== 'shop') v.update(dt); }
    for (const a of this.actors.slice()) a.update(dt);
    if (gs.dollPool) gs.dollPool.update(dt);
    // townsfolk sheets that were asked for before the manifest arrived
    if (this._wantChild && TF.ok) { this._wantChild = false; for (const k of TF.sheetsFor('child')) Assets.lateWant.add(k); gs.queueLateFiles(); }
    if (this._tfPending && TF.ok && this.ready) { this._tfPending = false; this.onTownfolk(); }
    // invitation fallback: some minutes after the first train even with no shop open
    if (gs.progress.flags.firstTrain && !gs.progress.flags.townInvite && !this.inviting) {
      this.inviteT = (this.inviteT || 0) + dt;
      if (this.inviteT > (BALANCE.v4.town.inviteAfter || 480)) this.invite();
    }
    // the visit: the chief comes near the fountain
    if (gs.territory.isOpen('town') && !gs.progress.flags.townVisit) {
      const f = this.buildings.find((b) => b.id === 't_fountain');
      if (f && gdist(gs.player.x, gs.player.y, f.x, f.y) < 400) {
        gs.progress.setFlag('townVisit');
        gs.ui.banner(t('townWelcome'), t('townWelcomeSub', { n: this.town ? this.town.population() : 100 }));
        if (gs.life) gs.life.cheer();
      }
    }
    this.ms = (this.ms || 0) * 0.95 + (performance.now() - t0) * 0.05;
  }

  /** the mayor comes by the next train and invites the chief (B calls this when the first shop opens) */
  invite() {
    const gs = this.gs;
    if (this.inviting || gs.progress.flags.townInvite) return;
    this.inviting = true;
    if (!this.town || !TF.ok) { this.openTown(false); return; }
    const mayor = this.town.citizens.find((c) => c.role === 'mayor') || this.town.citizens[0];
    this.sendByTrain('mayor', { citizen: mayor }).onArrive((a) => {
      a.speed = 110;
      a.say('mayor_invite');
      const go = () => {
        const p = gs.player;
        a.walkTo(p.x + 70, p.y + 30, () => {
          a.faceTo(p.x, p.y); a.play('wave', true); a.emote('emote_wave'); a.say('mayor_invite');
          this.openTown(false);
          gs.time.delayedCall(3500, () => { a.walkTo(this.ours.wait[0].x, this.ours.wait[0].y, () => a.release()); });
        });
      };
      gs.time.delayedCall(600, go);
    });
    // a train that never comes (station not open) -> open anyway after a while
    gs.time.delayedCall(90000, () => { if (!gs.progress.flags.townInvite) this.openTown(false); });
  }

  // ---------------------------------------------------------------- B's API (A -> B, §17.3)
  /** someone from the town comes by the next train: handle.onArrive(actor => ...) */
  sendByTrain(kind, opts = {}) {
    const handle = { kind, opts, cbs: [], onArrive(fn) { this.cbs.push(fn); return this; } };
    this.sendQ.push(handle);
    this.onNextArrival('ours', () => {
      const i = this.sendQ.indexOf(handle);
      if (i >= 0) this.sendQ.splice(i, 1);
      const c = opts.citizen || (this.town && this.town.citizens.find((q) => (kind === 'builder' ? q.kind === 'builder' : q.kind === 'adult') && !(q.flags & (F.ON_TRAIN | F.IN_VILLAGE)) && !q.sent));
      if (!c || !TF.ok) return;
      c.sent = true;
      if (this.town) this.town.leave(c);
      c.flags = (c.flags & ~F.ON_TRAIN) | F.IN_VILLAGE;
      const p = this.ours.board[this.actors.length % this.ours.board.length];
      this.gs.time.delayedCall(500, () => {
        const a = new Actor(this.gs, this, c, p.x, p.y);
        this.actors.push(a);
        for (const fn of handle.cbs) { try { fn(a); } catch (e) { console.error(e); } }
      });
    });
    return handle;
  }
  onNextArrival(stop, fn) { this.waitNext[stop === 'town' ? 'town' : 'ours'].push(fn); }
  addCoach() { if (this.rail.coaches > 1) return; this.rail.coaches = 2; if (this.train) this.train.build(); }
  get people() { return this.town ? this.town.population() : 0; }

  // ---------------------------------------------------------------- occlusion / save / hooks
  /** characters that can hide behind the town's buildings (Occlusion.collect) */
  occlusionSubjects(add) {
    for (const v of this.visitors) { v.xrayMain = true; add(v); }
    for (const a of this.actors) { a.xrayMain = true; add(a); }
    if (this.town) for (const b of this.town.bodies) if (b.c) add(b);
    if (this.train) {
      const subs = this._carSubs || (this._carSubs = []);
      let k = 0;
      this.train.forEachVisible((spr, c) => { const o = subs[k] || (subs[k] = { alive: true, noXray: false, xrayMain: true }); o.sprite = spr; o.x = spr.x; o.y = spr.y; o.headTop = (c.def && c.def.headTop) || -90; k++; add(o); });
    }
  }

  serialize() {
    const regs = [];
    if (this.town) for (const c of this.town.citizens) if (c.visits > 0 && regs.length < 40) regs.push([c.id, c.visits]);
    const prev = this.saved || {};
    return Object.assign({}, prev, {
      v: 1,
      clock: this.clock.serialize(),
      town: { seed: this.seed, open: this.gs.territory.isOpen('town'), extra: this.extra.slice(0, 64), regulars: regs },
      growth: this.growth && this.growth.serialize ? this.growth.serialize() : prev.growth,
    });
  }

  state() {
    const tr = this.rail.state();
    tr.riders = this.onBoard.length;
    tr.cars = this.rail.consist().length;
    const town = this.town ? Object.assign({ people: this.town.population(), started: this.town.started }, this.town.stats, { census: this.town.census() }) : null;
    return {
      ready: this.ready, station: !!(this.ours && this.ours.open), train: tr, clock: this.clock.state(), town,
      visitors: this.visitors.map((v) => ({ id: v.citizen.id, stage: v.stage, state: v.state, x: Math.round(v.x), y: Math.round(v.y), target: v.target ? v.target.id : null, got: v.got })),
      dolls: this.gs.dollPool ? Object.assign({}, this.gs.dollPool.stats) : null,
      arrivals: this.arrivals, ms: { all: +(this.ms || 0).toFixed(3), town: +(this.msTown || 0).toFixed(3), rail: +(this.msRail || 0).toFixed(3) },
      tf: TF.ok ? { adult: TF.readyFor(Assets, 'adult'), elder: TF.readyFor(Assets, 'elder'), child: TF.readyFor(Assets, 'child') } : null,
    };
  }

  installHooks() {
    const gs = this.gs, nb = this;
    const H = window.__FV || (window.__FV = {});
    H.v4 = {
      nb,
      state: () => nb.state(),
      /** jump the timetable: train('toOurs', 12) */
      train(phase, tt) { nb.rail.set(phase, tt || 0); return nb.rail.state(); },
      /** set the clock hour (starts the clock if needed) */
      clock(hour) { if (!nb.clock.on) { nb.clock.start(); if (nb.town && !nb.town.started) nb.town.start(nb.clock.simT()); } nb.clock.set(hour); if (nb.town) { nb.town.T = nb.clock.simT(); for (const c of nb.town.citizens) if (!(c.flags & (F.ON_TRAIN | F.IN_VILLAGE))) { c.plan = null; c.day = -1; nb.town.settle(c, nb.town.T); } nb.town.lastHour = -1; } return nb.clock.state(); },
      openTown: () => nb.openTown(true),
      invite: () => nb.invite(),
      /** repair the station now (test setup) */
      repair() { const st = gs.sites[WORLD.v4.stations.ours.plot]; if (!st) return false; if (st.state === 'plot') st.start('station', { instant: true }); if (st.state !== 'done') st.finish(false); return true; },
      census: () => (nb.town ? nb.town.census() : null),
      town: () => nb.town,
      citizen: (id) => { const c = nb.town && nb.town.get(id); return c ? { id: c.id, kind: c.kind, role: c.role, act: c.act, state: c.state, x: Math.round(c.x), y: Math.round(c.y), home: c.home, flags: c.flags, lod: c.lod, body: !!c.body, name: c.name } : null; },
    };
  }

  destroy() {
    if (this.paint) this.paint.destroy();
    if (this.clock) this.clock.destroy();
    if (this.town) this.town.destroy();
    if (this.train) this.train.destroy();
  }
}

export { DEPTH };
