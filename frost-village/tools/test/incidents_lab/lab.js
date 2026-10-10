// incidents_runtime lab: the real IncidentsHost (pure model + Phaser view) on a stand-in piece of the world — the 솔방울
// town as v4 lays it out with the real RoadPaint at 도시 paving, the new-town streets to the police station, a corner of
// the village plaza with the wanted board — the finished art (civic, fx_city, cityfolk + townfolk + townfolk2, the
// vehicles / logistics trucks, emotes, life2), the game's Bubbles for every line, the game's Effects, the game's
// DayClock tint, and a Residency stand-in that loads each incident's art when it comes on stage (lab_art.js).
// Incidents come from the module's own ScriptedSource (host fallback, planning off): run_lab.mjs starts them with a
// fixed-step clock through window.__LAB.

import { Assets } from '../../../src/core/Assets.js';
import { View, MAX_RENDER_SCALE } from '../../../src/core/View.js';
import { FONT } from '../../../src/data/strings.js';
import { Effects } from '../../../src/systems/Effects.js';
import { Bubbles } from '../../../src/systems/Bubbles.js';
import { DayClock } from '../../../src/systems/DayClock.js';
import { mergeTownfolkFragments, Cityfolk } from '../../cityfolk_compose.js';
import { townfolkPreload, townfolkInstall } from '../../townfolk_compose.js';
import { IncidentsHost } from '../../../src/city/incidents/host.js';
import { IncidentsView } from '../../../src/city/incidents/view/IncidentsView.js';
import * as layout from '../../../src/city/incidents/layout.js';
import { extendWorld, LabGround, LabTown } from './lab_world.js';
import { LabDolls } from './lab_dolls.js';
import { LabArt } from './lab_art.js';

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

const LATE = ['town', 'roads', 'life2', 'civic', 'fx_city', 'vehicles', 'logistics'];
const ATLASES = ['town_civic', 'town_shops', 'town_homes', 'town_park', 'town_street', 'town_rails', 'roads_decals', 'props_nature', 'props_decor', 'props_buildings', 'bld_buildings', 'bld_buildings_2', 'bld_sites',
  'life_props', 'emotes', 'fx_particles', 'ui_icons', 'ui2_icons', 'civ_props', 'civ_police', 'civ_moving', 'ui4_icons', 'veh_police_car'];
const LIFE2 = ['flower_stand', 'ribbon_garland'];
const IMAGES = ['ground_snow', 'ground_plaza', 'road_dirt', 'road_dirt_y', 'road_dirt_cross', 'road_cobble_wide', 'road_asphalt', 'sidewalk', 'ui_wanted_poster', 'ui_wanted_silhouette', 'ui_chat_bubble'];
const SHEETS = ['fx_poof', 'fx_sparkle', 'fx_coin_spin', 'fx_hit', 'fx_build_dust', 'fx_snow_splat', 'fx_hearts', 'fx_sweat_drops', 'fx_alarm_flash', 'fx_siren_glow_red', 'fx_siren_glow_blue', 'fx_question_mark'];
/** textures the module brings (what integration adds; townfolk / townfolk2 pages are counted apart) */
const MODULE_TEX = /^(cf_|civ_|fx_fire|fx_smoke_column|fx_embers|fx_hose|fx_water_mist|fx_steam_puff|fx_fight|fx_alarm|fx_siren|fx_demolish|fx_question|ui4_icons|ui_wanted|veh_police_car|veh_fire_truck|lgx_moving_truck|inc_)/;

const LAB = window.__LAB = { ready: false, errors: [], events: [], sounds: [], loops: [], music: [], toasts: [], banners: [], cards: [], sites: [], lang: 'ko', T: 600 * 5 + 25 * 10, zoom: 0.85, ms: [], msModel: [], msView: [], t: 0, incOn: true };
window.addEventListener('error', (e) => LAB.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => LAB.errors.push('rejection: ' + String(e.reason && e.reason.stack || e.reason)));

// ---------------------------------------------------------------------------------------------------- boot + load
let MAN = null;
class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    Assets.queueManifests(this.load);
    for (const f of LATE) this.load.json('manifest_' + f, 'assets/' + f + '/manifest.json');
    for (const f of ['townfolk', 'townfolk2', 'cityfolk']) this.load.json('tf_' + f, 'assets/' + f + '/manifest.json');
  }
  create() {
    Assets.mergeManifests(this.cache.json);
    for (const f of LATE) Assets.mergeLate(f, this.cache.json.get('manifest_' + f));
    MAN = mergeTownfolkFragments(this.cache.json.get('tf_townfolk'), this.cache.json.get('tf_townfolk2'), this.cache.json.get('tf_cityfolk'));
    this.scene.start('Load');
  }
}

class Load extends Phaser.Scene {
  constructor() { super('Load'); }
  preload() {
    const m = Assets.m, L = this.load;
    const atl = new Set(ATLASES);
    for (const k of LIFE2) { const d = m.sprites[k]; if (d && d.atlas) atl.add(d.atlas); }
    for (const k of atl) { const a = m.atlases[k]; if (a) L.atlas(k, 'assets/' + a.png, 'assets/' + a.json); else LAB.errors.push('no atlas ' + k); }
    for (const k of IMAGES) { const a = m.images[k]; if (a) L.image(k, 'assets/' + a.png); else LAB.errors.push('no image ' + k); }
    for (const k of SHEETS) { const s = m.spritesheets[k]; if (s) L.spritesheet(k, 'assets/' + s.png, { frameWidth: s.frameWidth, frameHeight: s.frameHeight }); else LAB.errors.push('no sheet ' + k); }
    // townfolk + townfolk2 (v4/v5 resident) + the cityfolk baseline pages (head, loco); the rest per incident (LabArt)
    const base = new Set(['cf_head_0', 'cf_loco_0']);
    townfolkPreload(this, { atlases: MAN.atlases.filter((a) => !/^cf_/.test(a.key) || base.has(a.key)) }, 'assets/');
    L.on('loaderror', (f) => LAB.errors.push('load: ' + f.key));
  }
  async create() {
    const g = this.game;
    Assets.game = g;
    townfolkInstall(this, { atlases: MAN.atlases.filter((a) => this.textures.exists(a.key)) });
    for (const k in Assets.m.sprites) Assets.spriteAnims(g, k);
    for (const k of SHEETS) Assets.sheetAnims(g, k);
    try { await document.fonts.load('900 20px Pretendard'); } catch (e) { /* system font */ }
    this.scene.start('UI');
    this.scene.start('World');
    this.scene.bringToTop('UI');
  }
}

// ---------------------------------------------------------------------------------------------------- people of the lab
const ROSTER = [];
{
  const homes = ['lotH1#1', 'lotH2#1', 'lotH3#1', 'lotH4#1', 'vh1#1', 'vh2#1'];
  let sid = 1;
  homes.forEach((home, h) => {
    ROSTER.push({ pid: 'p:' + sid, sid: sid++, age: 33 + h, hh: 'h' + h, home });
    ROSTER.push({ pid: 'p:' + sid, sid: sid++, age: 30 + h, hh: 'h' + h, home });
    ROSTER.push({ pid: 'p:' + sid, sid: sid++, age: h % 2 ? 9 : 16, hh: 'h' + h, home });
  });
  for (const [role, n] of [['police', 2], ['firefighter', 3]]) for (let k = 0; k < n; k++) ROSTER.push({ pid: 'p:' + sid, sid: sid++, age: 30 + k * 4, role, hh: role, home: role === 'police' ? 'c_police' : 't_fire' });
}
const NAMES_KO = ['민준', '서연', '하준', '지우', '도윤', '서아', '시우', '하윤', '은우', '지아', '선우', '수아', '유준', '채원', '지호', '다은', '건우', '예린', '현우', '소율', '준서', '하린', '우진'];
const NAMES_EN = ['Minjun', 'Seoyeon', 'Hajun', 'Jiwoo', 'Doyun', 'Seoa', 'Siwoo', 'Hayun', 'Eunwoo', 'Jia', 'Sunwoo', 'Sua', 'Yujun', 'Chaewon', 'Jiho', 'Daeun', 'Gunwoo', 'Yerin', 'Hyunwoo', 'Soyul', 'Junseo', 'Harin', 'Woojin'];
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// ---------------------------------------------------------------------------------------------------- the world
class World extends Phaser.Scene {
  constructor() { super('World'); }

  create() {
    const cam = this.cameras.main;
    cam.setBackgroundColor('#dfe9f2');
    cam.setZoom(LAB.zoom * View.k);
    cam.setBounds(-1400, 0, 7544, 4600);
    this.ui = this.scene.get('UI');
    this.effects = new Effects(this);
    this.rn = extendWorld();
    this.ground = new LabGround(this, this.rn);
    this.town = new LabTown(this);
    this.tf = new Cityfolk(MAN.townfolk);
    this.art = new LabArt(this, MAN, LAB);
    this.dolls = new LabDolls(this, this.tf, this.art);
    this.bubbles = new Bubbles(this);
    this.day = new DayClock(this, { T: LAB.T, on: true });
    this.setup({});
    LAB.scene = this; LAB.game = this.game; LAB.ui = this.ui; LAB.Assets = Assets; LAB.MODULE_TEX = MODULE_TEX; LAB.layout = layout; LAB.art = this.art; LAB.town = this.town;
    LAB.ready = true;
  }

  isOnScreen(x, y, m = 0) { const v = this.cameras.main.worldView; return x > v.x - m && x < v.right + m && y > v.y - m && y < v.bottom + m; }

  /** (re)build the module for a scenario: { saved, T, lang, on } */
  setup(o = {}) {
    if (this.host) { this.host.destroy(); this.host = null; }
    if (o.T !== undefined) LAB.T = o.T;
    if (o.lang) LAB.lang = o.lang;
    LAB.incOn = o.on !== false;
    for (const k of ['events', 'sounds', 'loops', 'music', 'toasts', 'banners', 'cards', 'sites', 'ms', 'msModel', 'msView']) LAB[k].length = 0;
    for (const id of this.town.b.keys()) { this.town.hide(id, false); this.town.tint(id, null); }
    this.ports = makePorts(this);
    this.host = new IncidentsHost(this.ports, o.saved || { v: 1, police: 1, drill: 1, hydrants: [[layout.HYDRANT_SPOTS[1].x, layout.HYDRANT_SPOTS[1].y], [layout.HYDRANT_SPOTS[2].x, layout.HYDRANT_SPOTS[2].y]] }, { View: IncidentsView, seed: 20261010, fallback: true, plan: false, places: this.town.storyPlaces(), roster: ROSTER });
    LAB.host = this.host;
    this.art.onReady = (a) => { if (this.host && this.host.view) this.host.view.artReady(a); };
    const mdl = this.host.model, up = mdl.update.bind(mdl);
    mdl.update = (dt, T, env) => { const a = performance.now(); up(dt, T, env); LAB.msModel.push(performance.now() - a); if (LAB.msModel.length > 8000) LAB.msModel.shift(); };
    this.snapNight();
  }

  snapNight() { const d = this.day; d.T = LAB.T; const tg = d.target(d.hour()); d.cur.a = tg.a; d.cur.r = (tg.color >> 16) & 255; d.cur.g = (tg.color >> 8) & 255; d.cur.b = tg.color & 255; }

  look(x, y, z) { if (z) { LAB.zoom = z; this.cameras.main.setZoom(z * View.k); } this.cameras.main.centerOn(x, y); }

  update(time, delta) { if (!LAB.ready || LAB.manual) return; this.tick(Math.min(0.05, delta / 1000)); }

  tick(dt) {
    LAB.T += dt; LAB.t += dt;
    const t0 = performance.now();
    this.host.update(dt);
    LAB.ms.push(performance.now() - t0);
    if (LAB.ms.length > 8000) LAB.ms.shift();
    if (LAB.follow) { const p = LAB.follow(); if (p) this.cameras.main.centerOn(p.x, p.y); }
    this.cameras.main.preRender();
    this.bubbles.update(dt);
    this.ground.update(1);
    this.day.T = LAB.T - dt;
    this.day.update(dt);
    this.ui.tick(dt);
  }
}

function makePorts(W) {
  const cam = () => W.cameras.main;
  const person = (ref) => ROSTER.find((p) => p.pid === ref || p.sid === ref) || null;
  return {
    clock: { T: () => LAB.T, hour: () => ((LAB.T / 25) % 24), day: () => Math.floor(LAB.T / 600) },
    lang: () => LAB.lang,
    settings: { get: (k) => (k === 'incidents' ? LAB.incOn : undefined) },
    emit: (e) => LAB.events.push(Object.assign({ T: Math.round(LAB.T * 10) / 10 }, e)),
    ui: {
      toast: (m) => { LAB.toasts.push(m); W.ui.toast(m); },
      banner: (m, s) => { LAB.banners.push(m + ' / ' + (s || '')); W.ui.banner(m, s); },
      card: (c) => { LAB.cards.push(c); W.ui.card(c); },
      scene: () => W.ui,
    },
    sound: {
      at: (k, x, y, o) => { LAB.sounds.push(k); },
      play: (k) => { LAB.sounds.push(k); },
      loop: (k, x, y, o) => { const h = { k, on: true, stop() { h.on = false; }, volume(v) { h.v = v; } }; LAB.loops.push(h); return h; },
      music: (k) => LAB.music.push(k || 'off'),
    },
    view: { rect: () => cam().worldView, onScreen: (x, y, m) => W.isOnScreen(x, y, m) },
    world: {
      scene: W,
      building: (id) => W.town.building(id), place: (id) => W.town.place(id), hide: (id, on) => W.town.hide(id, on), tint: (id, c) => W.town.tint(id, c),
      upgrade: (id) => W.town.upgrade(id), name: (id, lang) => W.town.name(id, lang), storyPlaces: () => W.town.storyPlaces(),
    },
    roads: { route: (a, b, mode) => { const r = W.rn.route(a, b, { mode: mode === 'drive' ? 'drive' : 'walk' }); return r ? r.pts : null; } },
    dolls: { make: (look) => W.dolls.make(look) },
    say: (who, text, emote, dur) => W.bubbles.chat(who, text, emote, dur),
    emote: (who, key, dur) => W.bubbles.emote(who, key, dur),
    clearSay: (who) => W.bubbles.clear(who),
    people: {
      roster: () => ROSTER, person: (ref) => person(ref),
      look: (pid) => { const p = person(pid); return p ? { seed: hash(p.pid), age: p.age } : null; },
      name: (pid, lang) => { const p = person(pid); const i = p ? p.sid % NAMES_KO.length : hash(String(pid)) % NAMES_KO.length; return (lang === 'en' ? NAMES_EN : NAMES_KO)[i]; },
    },
    residency: { want: (c) => W.art.wantArt(String(c).replace('incident:', '')), drop: (c) => W.art.dropArt(String(c).replace('incident:', '')) },
    stage: { free: () => true, request: () => {}, end: () => {} },
    fx: { burst: (n, x, y, q) => W.effects.burst(n, x, y, q), sheet: (k, x, y, o) => W.effects.sheet(k, x, y, o) },
    sites: { offer: (d) => LAB.sites.push(d) },
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
    this.clockT = this.add.text(this.W - 40, top + 2, '', TXT(30)).setOrigin(1, 0.5);
    this.safeT = this.add.text(40, top + 2, '', TXT(28)).setOrigin(0, 0.5);
    this.toastBox = this.add.container(this.W / 2, this.H - 230).setVisible(false).setDepth(50);
    this.toastG = this.add.graphics();
    this.toastText = this.add.text(0, 0, '', TXT(25, '#ffffff', '#2b2f3a', 0, '800')).setOrigin(0.5);
    this.toastBox.add([this.toastG, this.toastText]);
    this.bannerBox = this.add.container(this.W / 2, this.H * 0.27).setVisible(false).setDepth(60);
    this.bannerG = this.add.graphics();
    this.bannerText = this.add.text(0, -22, '', TXT(40, '#ffffff', '#1f4f8f', 10)).setOrigin(0.5);
    this.bannerSub = this.add.text(0, 34, '', TXT(21, '#ffffff', '#1f4f8f', 6, '800')).setOrigin(0.5);
    this.bannerBox.add([this.bannerG, this.bannerText, this.bannerSub]);
    // the story card (bottom-left, 520 × 120: patch P12's card slot)
    this.cardBox = this.add.container(24, this.H - 420).setVisible(false).setDepth(55);
    this.cardG = this.add.graphics();
    this.cardIcon = this.add.image(62, 60, '__DEFAULT').setVisible(false);
    this.cardText = this.add.text(118, 40, '', TXT(24, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0, 0.5);
    this.cardSub = this.add.text(118, 80, '', TXT(19, '#5b6b80', '#ffffff', 0, '800')).setOrigin(0, 0.5);
    this.cardBox.add([this.cardG, this.cardIcon, this.cardText, this.cardSub]);
    this.toastT = 0; this.bannerT = 0; this.cardT = 0;
  }
  toast(m, hold = 2400) {
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
  card(c) {
    this.cardText.setText(c.text || ''); this.cardSub.setText(c.sub || '');
    const w = Math.max(420, Math.min(this.W - 48, Math.max(this.cardText.width, this.cardSub.width) + 150)), h = 120;
    const g = this.cardG; g.clear();
    g.fillStyle(0x24324a, 0.22); g.fillRoundedRect(4, 8, w, h, 26);
    g.fillStyle(0xfffaf0, 1); g.fillRoundedRect(0, 0, w, h, 26);
    g.lineStyle(4, 0xf0c46a, 1); g.strokeRoundedRect(0, 0, w, h, 26);
    if (c.icon && Assets.has(c.icon)) { Assets.apply(this.cardIcon, c.icon); this.cardIcon.setOrigin(0.5).setScale(76 / Math.max(1, this.cardIcon.frame.realWidth)).setVisible(true); } else this.cardIcon.setVisible(false);
    if (!c.sub) this.cardText.setY(60); else this.cardText.setY(42);
    this.cardBox.setVisible(true).setAlpha(1).setX(-40); this.tweens.add({ targets: this.cardBox, x: 24, duration: 300, ease: 'Back.easeOut' });
    this.cardT = 4.2;
  }
  tick(dt) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastBox.setVisible(false); }
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) this.bannerBox.setVisible(false); }
    if (this.cardT > 0) { this.cardT -= dt; if (this.cardT <= 0) this.cardBox.setVisible(false); }
    const top = 62, g = this.g;
    g.clear();
    g.fillStyle(0x1f3354, 0.35); g.fillRoundedRect(this.W - 150, top - 30, 126, 60, 30);
    g.fillStyle(0x1f3354, 0.35); g.fillRoundedRect(24, top - 30, 200, 60, 30);
    const h = (LAB.T / 25) % 24;
    this.clockT.setText(String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0'));
    const host = LAB.host;
    this.safeT.setText((LAB.lang === 'en' ? 'Safety ' : '안심 ') + (host ? host.api.safety() : 100) + '%');
  }
}

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  width: Math.round(View.W * View.k),
  height: Math.round(View.H * View.k),
  backgroundColor: '#dfe9f2',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, pixelArt: false, roundPixels: false },
  disablePreFX: true,
  banner: false,
  fps: { target: 60 },
  scene: [Boot, Load, World, UI],
});
LAB.game = game;
LAB.View = View;
