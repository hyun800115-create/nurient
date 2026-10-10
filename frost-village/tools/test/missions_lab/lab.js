// missions_bank lab: the real MissionsHost + BankHost running on a stand-in piece of 서리마을 (a snowy plaza with the
// 광장 게시판, the bakery stall, a bench, the kids' snowman, a flower bed, and row D's bank) with the finished art,
// at the game's own scale rules (720-wide logical UI, render scale k from the device pixel ratio, world zoom × k).
// Nothing here is game code: the lab plays the part of Game.js / UI.js through the Ports facade (fake_ports.js).
// The runner (run_lab.mjs) drives it with a fixed-step clock through window.__LAB.

import { Assets } from '../../../src/core/Assets.js';
import { View, MAX_RENDER_SCALE } from '../../../src/core/View.js';
import { FONT } from '../../../src/data/strings.js';
import { MissionsHost } from '../../../src/missions/host.js';
import { BankHost } from '../../../src/bank/host.js';
import { tpl } from '../../../src/missions/data/catalog.js';
import { FakeWorld } from './fake_world.mjs';
import { makePorts } from './fake_ports.js';

// ---------------------------------------------------------------------------------------------------- view size (main.js)
const W = 720, MIN_H = 1280, MAX_H = 1600;
function updateView() {
  const iw = window.innerWidth || W, ih = window.innerHeight || MIN_H;
  const h = Math.max(MIN_H, Math.min(MAX_H, Math.round((W * ih) / Math.max(1, iw))));
  const cssW = Math.max(1, Math.min(iw, (ih * W) / h));
  const dpr = window.devicePixelRatio || 1;
  View.W = W; View.H = h;
  View.k = Math.round(Math.max(1, Math.min(MAX_RENDER_SCALE, (cssW * dpr) / W)) * 20) / 20;
}
updateView();

const LATE = ['ui3', 'fx_city', 'civic', 'life2', 'town'];
const VIL = { 'v:npc_aunt': 'npc_aunt', 'v:npc_uncle': 'npc_uncle', 'v:npc_grandma': 'npc_grandma', 'v:npc_grandpa': 'npc_grandpa', 'v:npc_kid_boy': 'npc_kid_boy', 'v:npc_kid_girl': 'npc_kid_girl',
  'v:npc_teen_girl': 'npc_teen_girl', 'v:npc_young_man': 'npc_young_man', 'pet:pet_cat': 'pet_cat', 'pet:pet_penguin': 'pet_penguin',
  't:12': 'npc_merchant', 't:31': 'npc_teen_girl', 't:47': 'npc_grandma', 't:58': 'npc_kid_boy', 's:1': 'npc_doctor', 's:2': 'npc_skater' };
const CHARS = ['player', 'npc_aunt', 'npc_uncle', 'npc_grandma', 'npc_grandpa', 'npc_kid_boy', 'npc_kid_girl', 'npc_teen_girl', 'npc_young_man', 'pet_cat', 'pet_penguin', 'npc_merchant', 'npc_bard', 'npc_clerk_a', 'npc_clerk_b', 'npc_doctor', 'npc_skater'];
const ATLASES = ['ui_icons', 'ui2_icons', 'ui3_icons', 'ui4_icons', 'emotes', 'fx_particles', 'props_nature', 'props_decor', 'props_items', 'props_buildings', 'life_props', 'life2_items', 'life2_decor', 'life2_wedding', 'civ_bank', 'town_street'];
const IMAGES = ['ui_panel', 'ui_button_blue', 'ui_button_green', 'ui_button_gray', 'ui_coin_bar', 'ui_mission_card', 'ui_mission_card_done', 'ui_mission_board', 'ui_progress_bg', 'ui_progress_fill',
  'ui_passbook', 'ui_passbook_row', 'ui_chat_bubble', 'ground_snow', 'ground_plaza', 'decal_path_a', 'decal_path_b', 'decal_snow_drift_a', 'decal_snow_drift_b', 'decal_footprints', 'portrait_player'];
/** textures the module brings (what integration adds); everything else is the lab's stand-in world */
const MODULE_TEX = /^(ui3_icons|ui4_icons|ui_mission_|ui_progress_|ui_passbook|civ_bank|life2_items|life2_decor|life2_wedding)/;

const LAB = window.__LAB = { ready: false, log: [], events: [], errors: [], ms: { missions: [], bank: [] }, lang: 'ko' };
window.addEventListener('error', (e) => LAB.errors.push(String(e.message)));

// ---------------------------------------------------------------------------------------------------- boot: manifests, files
class Boot extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    Assets.queueManifests(this.load);
    for (const f of LATE) this.load.json('manifest_' + f, 'assets/' + f + '/manifest.json');
  }
  create() {
    Assets.mergeManifests(this.cache.json);
    for (const f of LATE) Assets.mergeLate(f, this.cache.json.get('manifest_' + f));
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
    const imgs = new Set(IMAGES);
    for (const c of CHARS) imgs.add('portrait_' + c);
    for (const k of imgs) { const a = m.images[k]; if (a) L.image(k, 'assets/' + a.png); }
  }
  async create() {
    const g = this.game;
    Assets.game = g;
    for (const k in Assets.m.sprites) Assets.spriteAnims(g, k);
    for (const c of CHARS) Assets.buildCharacter(g, c);
    try { await document.fonts.load('800 20px Pretendard'); await document.fonts.load('900 20px Pretendard'); } catch (e) { /* system font */ }
    this.scene.start('UI');
    this.scene.start('World');
    this.scene.bringToTop('UI');
  }
}

// ---------------------------------------------------------------------------------------------------- a character figure
/** a villager sprite that can play `anim` facing `dir` (mirrored dirs flip) */
export function figure(scene, key, x, y) {
  const s = scene.add.sprite(x, y, '__DEFAULT');
  const def = Assets.charDef(key);
  s.setOrigin(def.anchor[0], def.anchor[1]);
  const shadow = scene.add.ellipse(x, y, (def.shadow || [46, 18])[0], (def.shadow || [46, 18])[1], 0x3a4a6a, 0.16);
  const f = {
    key, obj: s, shadow, pose: null, dir: 'S', headTop: def.headTop || -80,
    setPose(anim, dir) {
      dir = dir || this.dir;
      const mir = { SW: 'SE', W: 'E', NW: 'NE' }[dir];
      const base = mir || dir;
      const k = Assets.charAnim(key, anim, base);
      if (s.anims.currentAnim && s.anims.currentAnim.key === k && this.dir === dir) return;
      s.play(k, true);
      s.setFlipX(!!mir);
      this.pose = anim; this.dir = dir;
    },
    destroy() { s.destroy(); shadow.destroy(); },
  };
  s.on('destroy', () => shadow.destroy());
  f.setPose('idle', 'S');
  return f;
}

// ---------------------------------------------------------------------------------------------------- the world
class World extends Phaser.Scene {
  constructor() { super('World'); }

  create() {
    const cam = this.cameras.main;
    cam.setBackgroundColor('#eef3f9');
    this.zoom = 1;
    cam.setZoom(this.zoom * View.k);
    this.fw = new FakeWorld({ rank: 2, income: 1800, T: 10 * 25 - 8 * 25 + 600 * 2, wall0: Date.UTC(2026, 9, 12, 10, 0) });
    for (const f of ['b:deco_flowers', 'b:store', 'b:town_hall', 'life', 'b:depot', 'b:deco_rink']) this.fw.set(f);
    this.people = new Map();    // pid → figure (+ walk state)
    this.places = new Map();    // place id → { x, y, name }
    this.decorSpots = [[900, 700], [960, 740], [1140, 600], [1210, 640], [1380, 760], [700, 1110], [1180, 1240], [880, 1280]];
    this.ground();
    this.props();
    this.residents();
    this.chief();
    this.ui = this.scene.get('UI');
    this.ports = makePorts(this);
    this.missions = new MissionsHost(this.ports, null, { seed: 2026 });
    this.bank = new BankHost(this.ports, null, { at: { x: 2140, y: 860 } });
    this.bank.account.siteOffered = true;
    this.bank.openBank(true);
    this.lookAt(1000, 820);
    LAB.scene = this; LAB.ui = this.ui; LAB.game = this.game; LAB.ready = true;
    this.input.on('pointerup', (p) => this.tap(p));
  }

  // -- stand-in ground: snow tiles + a baked terracotta plaza diamond with paths and drifts
  ground() {
    const snow = this.add.tileSprite(1150, 900, 4200, 3200, 'ground_snow').setDepth(-15000);
    snow.setTileScale(0.6);
    const c = this.textures.createCanvas('lab_plaza', 800, 400), ctx = c.getContext();
    const pl = this.textures.get('ground_plaza').getSourceImage();
    const pat = ctx.createPattern(pl, 'repeat');
    ctx.save();
    ctx.beginPath(); ctx.moveTo(400, 8); ctx.lineTo(792, 200); ctx.lineTo(400, 392); ctx.lineTo(8, 200); ctx.closePath();
    ctx.fillStyle = '#c99a72'; ctx.fill();
    ctx.globalAlpha = 0.9; ctx.fillStyle = pat; ctx.setTransform(0.55, 0, 0, 0.55, 0, 0); ctx.fill(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.restore();
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.moveTo(400, 8); ctx.lineTo(792, 200); ctx.lineTo(400, 392); ctx.lineTo(8, 200); ctx.closePath(); ctx.stroke();
    c.refresh();
    this.add.image(1000, 780, 'lab_plaza').setDepth(-14000);
    const deco = (k, x, y, s = 1, a = 1) => { const im = Assets.image(this, x, y, k).setDepth(-13500).setScale(s).setAlpha(a); return im; };
    deco('decal_path_a', 1420, 1020, 1.6, 0.9); deco('decal_path_a', 1640, 1130, 1.6, 0.9); deco('decal_path_a', 1860, 1020, 1.4, 0.8); deco('decal_path_b', 760, 1090, 1.4, 0.85);
    deco('decal_snow_drift_a', 720, 560, 1.1); deco('decal_snow_drift_b', 1320, 520, 1.1); deco('decal_snow_drift_a', 860, 1240, 1);
    deco('decal_footprints', 1150, 1040, 0.9, 0.7); deco('decal_footprints', 900, 660, 0.9, 0.6);
    // a cobbled apron in front of the bank (row D)
    const ap = this.add.graphics().setDepth(-13900);
    ap.fillStyle(0xd9cfc2, 1); ap.beginPath(); ap.moveTo(2140 - 330, 860 + 40); ap.lineTo(2140 - 30, 860 + 190); ap.lineTo(2140 + 270, 860 + 40); ap.lineTo(2140 - 30, 860 - 110); ap.closePath(); ap.fillPath();
    ap.lineStyle(6, 0xffffff, 0.8); ap.strokePath();
  }

  sprite(k, x, y, s = 1, flip = false) { const im = Assets.image(this, x, y, k).setDepth(y).setScale(s); if (flip) im.setFlipX(true); return im; }

  props() {
    const S = (k, x, y, s, f) => this.sprite(k, x, y, s, f);
    // houses and trees behind the plaza, trees in front
    S('worker_hut', 740, 470, 0.85); S('chief_lodge', 1290, 430, 0.72);
    for (const [x, y, k, s] of [[560, 560, 'tree_pine_snow', 0.95], [610, 470, 'tree_pine_a', 0.85], [1450, 560, 'tree_pine_snow', 0.9], [1500, 650, 'tree_pine_a', 0.8],
      [620, 1300, 'tree_pine_snow', 0.95], [1380, 1330, 'tree_pine_b', 0.9], [1010, 1420, 'tree_pine_snow', 0.9], [560, 1050, 'tree_pine_b', 0.85],
      [1880, 640, 'tree_pine_snow', 0.95], [2440, 720, 'tree_pine_a', 0.85], [2470, 1050, 'tree_pine_snow', 0.9], [1760, 1260, 'tree_pine_a', 0.8], [2300, 1240, 'tree_pine_b', 0.85]]) S(k, x, y, s);
    for (const [x, y, k] of [[700, 1180, 'snow_pile_a'], [1330, 1180, 'snow_pile_b'], [1930, 960, 'snow_pile_a'], [600, 760, 'bush_snow'], [1420, 860, 'bush_snow']]) S(k, x, y, 0.9);
    // 광장 게시판 (the plaza notice board) at the plaza's top corner
    S('notice_board', 1010, 600, 0.85);
    this.places.set('p:board', { x: 1000, y: 640 });
    // the bakery (빵집 아주머니's oven) on the left; the cake pad in front of it
    S('station_bakery', 735, 720, 0.85);
    this.places.set('p:bakery', { x: 800, y: 830 });
    S('picnic_table', 800, 1030, 0.85);
    this.places.set('p:picnic', { x: 800, y: 1060 });
    // the kids' snowman on the right
    S('snowman_3', 1210, 880, 0.8);
    this.places.set('p:snowman', { x: 1170, y: 930 });
    // a bench for grandma, lamp posts
    S('bench', 900, 925, 1); S('lamp_post', 870, 650, 1); S('lamp_post', 1150, 680, 1); S('signpost', 1500, 980, 1);
    S('firewood_pile', 640, 920, 0.9);
    // a flower bed (꽃밭) below the plaza and the gift-wrap stall of the 잡화점 (crates + barrel)
    S('flower_stand', 1060, 1110, 0.85); S('flower_stand', 1120, 1140, 0.75, true);
    this.places.set('flowerbed1', { x: 1030, y: 1160, kind: 'flowerbed' });
    S('crate', 1290, 1080, 1); S('crate', 1320, 1100, 0.85); S('barrel', 1260, 1110, 1);
    this.places.set('p:gift', { x: 1270, y: 1150 });
    this.places.set('p:school', { x: 640, y: 1240 });
    this.places.set('p:rink', { x: 640, y: 1240 });
    this.places.set('p:depot', { x: 1900, y: 700 });
    this.places.set('p:bank', { x: 2140, y: 860 });
  }

  residents() {
    const add = (pid, x, y, dir, anim = 'idle') => {
      const f = figure(this, VIL[pid], x, y);
      f.obj.setDepth(y); f.shadow.setDepth(y - 1);
      f.setPose(anim, dir);
      f.pid = pid; f.walk = null;
      this.people.set(pid, f);
      return f;
    };
    add('v:npc_aunt', 830, 790, 'SE');
    add('v:npc_grandma', 900, 915, 'SE', 'sit');
    add('v:npc_grandpa', 690, 960, 'SE');
    add('v:npc_kid_boy', 1140, 945, 'NE', 'happy');
    add('v:npc_kid_girl', 1265, 950, 'NW');
    add('pet:pet_cat', 975, 960, 'SW', 'loaf');
    add('pet:pet_penguin', 1300, 790, 'SW');
    add('t:12', 1340, 1030, 'SW');
    add('v:npc_young_man', 1090, 760, 'SW');
    // grandma sits on the bench (seat height)
    const g = this.people.get('v:npc_grandma');
    g.obj.y -= 22; g.obj.setDepth(926);
  }

  chief() {
    const f = this.chiefFig = figure(this, 'player', 1000, 830);
    f.obj.setDepth(830); f.shadow.setDepth(829);
    f.setPose('idle', 'S');
    this.stack = [];         // carried items (on the head, like v4)
    this.stackImgs = [];
    this.chiefMove = null;
    this.flyPool = [];
  }

  // -- the lab's game loop: one fixed step
  update(time, delta) {
    const dt = Math.min(0.05, delta / 1000);
    this.fw.advance(dt);
    this.moveChief(dt);
    this.movePeople(dt);
    const a = performance.now();
    this.missions.update(dt);
    const b = performance.now();
    this.bank.update(dt);
    const c = performance.now();
    LAB.ms.missions.push(b - a); LAB.ms.bank.push(c - b);
    if (LAB.ms.missions.length > 1200) { LAB.ms.missions.splice(0, 600); LAB.ms.bank.splice(0, 600); }
    this.drawStack();
    if (this.ui && this.ui.tick) this.ui.tick(dt);
  }

  moveChief(dt) {
    const f = this.chiefFig, mv = this.chiefMove;
    const carrying = this.stack.length > 0;
    if (!mv) { f.setPose(carrying ? 'carry_idle' : 'idle', f.dir); return; }
    const o = f.obj, tg = mv.path[0];
    const dx = tg.x - o.x, dy = tg.y - o.y, d = Math.hypot(dx, dy);
    const sp = 255 * dt;
    if (d <= sp) { o.setPosition(tg.x, tg.y); mv.path.shift(); if (!mv.path.length) { this.chiefMove = null; if (mv.done) mv.done(); } }
    else o.setPosition(o.x + (dx / d) * sp, o.y + (dy / d) * sp * 0.74 / 0.74);
    f.setPose(carrying ? 'carry_walk' : 'walk', dirOf(dx, dy));
    o.setDepth(o.y); f.shadow.setPosition(o.x, o.y).setDepth(o.y - 1);
  }

  movePeople(dt) {
    for (const f of this.people.values()) {
      const w = f.walk;
      if (!w) { f.shadow.setPosition(f.obj.x, f.obj.y + (f.pose === 'sit' ? 22 : 0)); continue; }
      const o = f.obj, tg = w.path[w.i];
      const dx = tg.x - o.x, dy = tg.y - o.y, d = Math.hypot(dx, dy), sp = (w.speed || 70) * dt;
      if (d <= sp) { o.setPosition(tg.x, tg.y); w.i = (w.i + 1) % w.path.length; }
      else { o.setPosition(o.x + (dx / d) * sp, o.y + (dy / d) * sp); f.setPose('walk', dirOf(dx, dy)); }
      o.setDepth(o.y); f.shadow.setPosition(o.x, o.y).setDepth(o.y - 1);
    }
  }

  // -- the chief's stack on his head
  drawStack() {
    const f = this.chiefFig, o = f.obj;
    while (this.stackImgs.length < this.stack.length) this.stackImgs.push(Assets.image(this, 0, 0, 'item_bread').setOrigin(0.5, 0.75));
    for (let i = 0; i < this.stackImgs.length; i++) {
      const im = this.stackImgs[i];
      if (i >= this.stack.length) { im.setVisible(false); continue; }
      if (im.__k !== this.stack[i]) { im.__k = this.stack[i]; Assets.apply(im, this.stack[i]); im.setOrigin(0.5, 0.75); }
      const bob = this.chiefMove ? Math.sin(this.time.now / 90) * 1.5 : 0;
      im.setVisible(true).setScale(0.62).setPosition(o.x + (i % 2 ? 3 : -3), o.y - 86 - i * 11 + bob).setDepth(o.y + 1 + i * 0.01);
    }
  }

  give(item, n) { for (let i = 0; i < n; i++) this.stack.push(item); }
  count(item) { let n = 0; for (const k of this.stack) if (k === item) n++; return n; }
  take(item, n, tx, ty) {
    let k = 0;
    for (let i = this.stack.length - 1; i >= 0 && k < n; i--) {
      if (this.stack[i] !== item) continue;
      this.stack.splice(i, 1); k++;
      this.fly(item, this.chiefFig.obj.x, this.chiefFig.obj.y - 90 - i * 11, tx, ty, k * 70);
    }
    return k;
  }
  fly(item, x, y, tx, ty, delay = 0, done) {
    let s = this.flyPool.pop();
    if (!s) s = Assets.image(this, 0, 0, item);
    Assets.apply(s, item);
    s.setOrigin(0.5).setVisible(true).setAlpha(1).setScale(0.6).setDepth(30000).setPosition(x, y);
    const mx = (x + tx) / 2, my = Math.min(y, ty) - 70;
    this.tweens.addCounter({ from: 0, to: 1, delay, duration: 380, ease: 'Sine.easeInOut', onUpdate: (tw) => { const p = tw.getValue(), q = 1 - p; s.setPosition(q * q * x + 2 * q * p * mx + p * p * tx, q * q * y + 2 * q * p * my + p * p * ty); s.setScale(0.6 - 0.2 * p); }, onComplete: () => { s.setVisible(false); this.flyPool.push(s); if (done) done(); } });
  }

  walkChief(points, done) { this.chiefMove = { path: points.map((p) => ({ x: p[0], y: p[1] })), done }; }

  lookAt(x, y) { this.cameras.main.centerOn(x, y); }
  setZoom(z) { this.zoom = z; this.cameras.main.setZoom(z * View.k); }

  tap(p) {
    if (this.ui && this.ui.blocking && this.ui.blocking()) return;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    // the order the ModuleHost uses in the game: missions (bubbles) first, then the bank (cutaway), then v4
    if (this.missions.tap(wp.x, wp.y)) return;
    this.bank.tap(wp.x, wp.y);
  }

  /** decor a reward gives: placed on the next free plaza spot with a sparkle */
  placeDecor(key) {
    const sp = this.decorSpots.shift() || [1000 + Math.random() * 200, 500];
    if (!Assets.has(key)) return null;
    const im = this.sprite(key, sp[0], sp[1], 0.9);
    im.setScale(0.2).setAlpha(0);
    this.tweens.add({ targets: im, scale: 0.9, alpha: 1, duration: 420, ease: 'Back.easeOut' });
    const st = Assets.image(this, sp[0], sp[1] - 60, 'fx_star').setDepth(30000).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe28a);
    st.setScale(0.1);
    this.tweens.add({ targets: st, scale: 1.4, alpha: 0, duration: 900, onComplete: () => st.destroy() });
    if (key === 'music_stand' && !this.people.has('v:npc_bard')) {
      VIL['v:npc_bard'] = 'npc_bard';
      const f = figure(this, 'npc_bard', sp[0] + 40, sp[1] + 30);
      f.obj.setDepth(sp[1] + 30); f.setPose('perform', 'SE');
      f.pid = 'v:npc_bard';
      this.people.set('v:npc_bard', f);
    }
    return im;
  }
}

export function dirOf(dx, dy) {
  const a = Math.atan2(dy, dx) * 180 / Math.PI;
  if (a > -22.5 && a <= 22.5) return 'E';
  if (a > 22.5 && a <= 67.5) return 'SE';
  if (a > 67.5 && a <= 112.5) return 'S';
  if (a > 112.5 && a <= 157.5) return 'SW';
  if (a > 157.5 || a <= -157.5) return 'W';
  if (a > -157.5 && a <= -112.5) return 'NW';
  if (a > -112.5 && a <= -67.5) return 'N';
  return 'NE';
}

// ---------------------------------------------------------------------------------------------------- the HUD stand-in
const TXT = (size, color = '#ffffff', stroke = '#2b2f3a', st = 7, weight = '900') => ({ fontFamily: FONT, fontSize: size + 'px', fontStyle: weight, color, stroke, strokeThickness: st, resolution: 2 });

class UI extends Phaser.Scene {
  constructor() { super('UI'); }
  create() {
    View.applyUI(this.cameras.main);
    this.W = View.W; this.H = View.H;
    const top = 62;
    this.panels = 0;
    // coins (UI.js look)
    this.coins = 4200;
    this.coinBar = this.nine('ui_coin_bar', 26, top, 236, 74).setOrigin(0, 0.5);
    this.coinIcon = Assets.image(this, 64, top, 'ui_icon_coin'); this.coinIcon.setScale(64 / this.coinIcon.frame.realWidth);
    this.coinText = this.add.text(104, top + 2, '', TXT(40)).setOrigin(0, 0.5);
    this.shownCoins = this.coins;
    // population box + rank chip (v4 HUD positions) so the module's chips are seen in their real company
    const pop = this.add.container(28, top + 152);
    pop.add(this.nine('ui_panel', 0, 0, 150, 50).setOrigin(0, 0.5).setAlpha(0.92));
    const pi = Assets.image(this, 26, 0, Assets.pick('ui_icon_people', 'ui_icon_worker')); pi.setScale(40 / pi.frame.realWidth);
    pop.add([pi, this.add.text(52, 0, '58/64', TXT(24, '#2b2f3a', '#ffffff', 0)).setOrigin(0, 0.5)]);
    const rc = this.add.container(188, top + 152);
    rc.add(this.nine('ui_panel', 0, 0, 156, 54).setOrigin(0, 0.5).setAlpha(0.95));
    const rb = Assets.image(this, 26, 0, 'ui_badge_rank_2'); rb.setScale(42 / rb.frame.realWidth);
    rc.add([rb, this.add.text(52, -12, '읍', TXT(19, '#2b2f3a', '#ffffff', 0)).setOrigin(0, 0.5)]);
    const bars = this.add.graphics();
    [[0x6bbf59, 1], [0xe8a33d, 1], [0xe35d8c, 1]].forEach(([c], i) => { bars.fillStyle(c, 1); bars.fillRoundedRect(52, 2 + i * 7, 92, 4, 2); });
    rc.add(bars);
    // the clock and settings
    const ck = this.add.graphics();
    ck.fillStyle(0x1f3354, 0.22); ck.fillCircle(this.W - 62, top + 95, 28); ck.fillStyle(0xfff8ec, 0.95); ck.fillCircle(this.W - 62, top + 92, 28);
    ck.lineStyle(5, 0xffc83d, 1); ck.beginPath(); ck.arc(this.W - 62, top + 92, 24, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (10 / 24)); ck.strokePath();
    const ci = Assets.image(this, this.W - 62, top + 92, 'ui_icon_day'); ci.setScale(38 / ci.frame.realWidth);
    const sb = this.add.graphics(); sb.fillStyle(0x1f3354, 0.25); sb.fillCircle(this.W - 62, top + 5, 42); sb.fillStyle(0xffffff, 0.95); sb.fillCircle(this.W - 62, top, 42);
    const si = Assets.image(this, this.W - 62, top, 'ui_icon_settings'); si.setScale(52 / si.frame.realWidth);
    // toast + banner (UI.js look)
    this.toastBox = this.add.container(this.W / 2, this.H - 230).setVisible(false).setDepth(50);
    this.toastBg = this.nine('ui_panel', 0, 0, 300, 64).setOrigin(0.5).setTint(0x2b2f3a).setAlpha(0.88);
    this.toastText = this.add.text(0, 0, '', TXT(28, '#ffffff', '#2b2f3a', 0, '800')).setOrigin(0.5);
    this.toastBox.add([this.toastBg, this.toastText]);
    this.bannerBox = this.add.container(this.W / 2, this.H * 0.27).setVisible(false).setDepth(60);
    this.bannerBg = this.nine('ui_button_blue', 0, 0, 460, 104).setOrigin(0.5);
    this.bannerText = this.add.text(0, -4, '', TXT(50, '#ffffff', '#1f4f8f', 10)).setOrigin(0.5);
    this.bannerBox.add([this.bannerBg, this.bannerText]);
    this.flyPool = [];
    this.bubbles = [];
  }
  nine(key, x, y, w, h) { const n = Assets.nine(key); return this.add.nineslice(x, y, n.tex, n.frame, w, h, n.l, n.r, n.t, n.b); }
  blocking() { return this.panels > 0; }

  tick(dt) {
    if (this.shownCoins !== this.coins) {
      const d = this.coins - this.shownCoins;
      this.shownCoins += Math.sign(d) * Math.max(1, Math.ceil(Math.abs(d) * Math.min(1, dt * 6)));
      if (Math.abs(this.coins - this.shownCoins) < 2) this.shownCoins = this.coins;
    }
    const s = String(Math.floor(this.shownCoins)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (this.coinText.text !== s) this.coinText.setText(s);
    // speech bubbles follow their speaker
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.t += dt;
      const f = b.who;
      const wp = LAB.scene.cameras.main;
      const p = this.toScreen(f.obj.x, f.obj.y + f.headTop - 6);
      // keep the whole bubble on screen (the tail stays over the speaker)
      const half = b.w / 2 + 8, cx = Phaser.Math.Clamp(p.x, half, this.W - half);
      b.c.setPosition(cx, Math.max(b.h + 70, p.y));
      b.tail.x = Phaser.Math.Clamp(p.x - cx, -b.w / 2 + 24, b.w / 2 - 24);
      if (b.t > b.dur) { b.c.destroy(); this.bubbles.splice(i, 1); }
      else if (b.t > b.dur - 0.25) b.c.setAlpha((b.dur - b.t) / 0.25);
    }
  }

  toScreen(wx, wy) {
    const cam = LAB.scene.cameras.main, z = cam.zoom || 1;
    const vx = cam.scrollX + cam.width * 0.5 * (1 - 1 / z), vy = cam.scrollY + cam.height * 0.5 * (1 - 1 / z);
    return { x: ((wx - vx) * z) / View.k, y: ((wy - vy) * z) / View.k };
  }

  toast(msg, hold) {
    this.toastText.setText(msg);
    this.toastBg.setSize(Math.max(260, this.toastText.width + 70), 64);
    const b = this.toastBox;
    this.tweens.killTweensOf(b);
    b.setVisible(true).setAlpha(1).setScale(0.7);
    this.tweens.add({ targets: b, scale: 1, duration: 200, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, delay: hold || 1500, duration: 350, onComplete: () => b.setVisible(false) });
  }

  banner(msg) {
    const b = this.bannerBox;
    this.bannerText.setText(msg);
    this.bannerBg.setSize(Math.max(360, this.bannerText.width + 90), 104);
    this.tweens.killTweensOf(b);
    b.setVisible(true).setAlpha(1).setScale(0.3);
    this.tweens.add({ targets: b, scale: 1, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({ targets: b, alpha: 0, delay: 1700, duration: 400, onComplete: () => b.setVisible(false) });
  }

  coinFly(wx, wy, n) {
    const s = this.toScreen(wx, wy), tx = this.coinIcon.x, ty = this.coinIcon.y;
    for (let i = 0; i < n; i++) {
      let c = this.flyPool.pop();
      if (!c) c = Assets.image(this, 0, 0, 'ui_icon_coin').setOrigin(0.5);
      c.setScale(40 / c.frame.realWidth).setVisible(true).setAlpha(1).setDepth(40);
      const sx = s.x + (i * 37 % 40) - 20, sy = s.y + (i * 23 % 30) - 15;
      c.setPosition(sx, sy);
      const mx = sx + ((i * 53) % 160) - 80, my = sy - 60 - ((i * 31) % 80);
      this.tweens.addCounter({ from: 0, to: 1, duration: 520 + i * 40, delay: i * 45, ease: 'Sine.easeIn',
        onUpdate: (tw) => { const p = tw.getValue(), q = 1 - p; c.setPosition(q * q * sx + 2 * q * p * mx + p * p * tx, q * q * sy + 2 * q * p * my + p * p * ty); },
        onComplete: () => { c.setVisible(false); this.flyPool.push(c); const ic = this.coinIcon; ic.setScale(64 / ic.frame.realWidth * 1.2); this.tweens.add({ targets: ic, scale: 64 / ic.frame.realWidth, duration: 200 }); } });
    }
  }

  /** a speech bubble over a figure (emotes ui_chat_bubble + ui_chat_tail, the game's Bubbles look) */
  say(fig, text, emote, dur = 2.6) {
    const old = this.bubbles.find((b) => b.who === fig);
    if (old) { old.c.destroy(); this.bubbles.splice(this.bubbles.indexOf(old), 1); }
    const c = this.add.container(0, 0).setDepth(30);
    const tx = this.add.text(0, 0, text, { fontFamily: FONT, fontSize: '20px', fontStyle: '800', color: '#2b2f3a', align: 'center', lineSpacing: 2, resolution: 2, wordWrap: { width: 270, useAdvancedWrap: true } }).setOrigin(0.5);
    const hasIc = !!(emote && Assets.has(emote));
    const w = Math.max(80, Math.min(300, tx.width + 30 + (hasIc ? 38 : 0))), h = Math.max(56, tx.height + 30);
    const n = Assets.nine('ui_chat_bubble');
    const body = this.add.nineslice(0, 0, n.tex, n.frame, w, h, n.l, n.r, n.t, n.b).setOrigin(0.5, 1);
    const tail = Assets.image(this, 0, -20, 'ui_chat_tail').setOrigin(0.5, 0);
    c.add([body, tail]);
    const cy = -h + 8 + (h - 26) / 2;
    if (hasIc) { const ic = Assets.image(this, -w / 2 + 31, cy, emote); ic.setScale(34 / ic.frame.realWidth); c.add(ic); tx.setPosition(19, cy); } else tx.setPosition(0, cy);
    c.add(tx);
    c.setScale(0.2);
    this.tweens.add({ targets: c, scale: 1, duration: 220, ease: 'Back.easeOut' });
    this.bubbles.push({ c, who: fig, t: 0, dur, w, h, tail });
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
LAB.Assets = Assets;
LAB.tpl = tpl;
LAB.MODULE_TEX = MODULE_TEX;
