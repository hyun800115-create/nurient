// ui6 (CONTRACT_GEUMBANG §AQ, the 금방 app kit) + audio8 (§AR, the 금방 sounds) in headless Chromium with Phaser 3.90
// - no game code is changed; the game's own src/core/Assets.js is imported read-only for the hand-over probe.
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers nice -n 10 node tools/test/ui6_phaser.mjs
// 0) STATIC: every key of ui6 / audio8 (sprites, atlases, nineSlice, audio, audioGroups) against every other
//    assets/*/manifest.json - no clash.
// 1) LOAD PAGE (1500 x 1500, DPR 1): ui6 next to the house sets (ui, ui3, ui5, props_items) the way Assets.js loads
//    them; every frame of every sprite exists with sourceSize = frameSize; the 9-slice frames are untrimmed and build
//    at app sizes; the mascot / bell anims come from Assets.spriteAnims and play; Assets.sprite / image / nine / has /
//    spriteAnim resolve every key (the CODE hand-over); audio8 loads under '__sprite_audio8' and is cut by the game's
//    own Assets.sliceSprite: every slice is dur + 30 ms, not silent, its 30 ms tail silent; groups resolve; all play.
//    -> docs/previews/ui6_phaser_sheet.png
// 2) PHONE (390 x 844 CSS @3x, logical 720 wide like main.js) at camera zoom 0.6 / 1.0 / 1.2 / 1.6, day and night
//    (MULTIPLY #5A6AA8 x 0.45): a snowy street with a real townhouse, the 금방 van (assets/geumbang), a locker, a sign,
//    a doorstep parcel, the doorbell FX at the door at 40 CSS px, an order bubble (ui_emote_bubble + cart + bread),
//    and the HUD: the 금방 chip (120 x 44 CSS) and a toast (<= 300 x 48 CSS).
//    -> docs/previews/ui6_phaser_z06_day.png ... + ui6_phaser_phone.png (montage)
// 3) THE APP (zoom 1.0): the 720 x 1100 logical panel built from the manifest's appLayout with real NineSlices - tabs
//    오늘 / 주문 / 상품 (ko, day), 주문 (en, night), and 주문 on a 360 x 640 phone; the doorstep photo is a real
//    128 x 80 RenderTexture under ui_gb_photo. Measures tap targets (>= 44 CSS px) and text (>= 15 CSS px body).
//    -> docs/previews/ui6_phaser_app_*.png + ui6_phaser_app.png (montage)
// Exit 1 on missing frames / wrong sizes / trimmed panels / clashes / audio slices / page errors / 404s / size gates.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, sleep } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREV = path.join(ROOT, 'docs', 'previews');
const CACHE = process.env.FV_UI6_CACHE || path.join(os.tmpdir(), 'fv_cache', 'ui6');
fs.mkdirSync(PREV, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });
const NEW = ['ui6', 'audio8'];
const problems = [];

// ---------------------------------------------------------------- 0) static key clash check
const keysOf = (m) => {
  const out = new Set();
  for (const k of Object.keys(m.sprites || {})) out.add('sprite:' + k);
  for (const a of m.atlases || []) out.add('tex:' + a.key);
  for (const i of m.images || []) out.add('tex:' + i.key);
  const ss = m.spritesheets || [];
  for (const s of Array.isArray(ss) ? ss : Object.keys(ss).map((key) => ({ key }))) out.add('tex:' + s.key);
  for (const k of Object.keys(m.characters || {})) out.add('char:' + k);
  for (const k of Object.keys(m.nineSlice || {})) out.add('nine:' + k);
  for (const k of Object.keys(m.audio || {})) out.add('audio:' + k);
  for (const k of Object.keys(m.audioGroups || {})) out.add('group:' + k);
  return out;
};
const frags = fs.readdirSync(path.join(ROOT, 'assets')).filter((d) => !d.startsWith('_') && fs.existsSync(path.join(ROOT, 'assets', d, 'manifest.json')));
const all = {};
for (const f of frags) { try { all[f] = keysOf(JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', f, 'manifest.json'), 'utf8'))); } catch (e) { /* another job writing it */ } }
const clashes = [];
for (const f of NEW) for (const k of all[f] || []) for (const g of frags) if (g !== f && all[g] && all[g].has(k)) clashes.push(`${f} ${k} also in ${g}`);
if (clashes.length) problems.push(...clashes.map((c) => 'clash: ' + c));
const UI6 = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'ui6', 'manifest.json'), 'utf8'));
const AU8 = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'audio8', 'manifest.json'), 'utf8'));

const FONT_CSS = `@font-face{font-family:'Pretendard';src:url('tools/fonts/Pretendard-ExtraBold.ttf') format('truetype');font-weight:800;}`;

// ---------------------------------------------------------------- 1) load page
const LOAD_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>${FONT_CSS}body{margin:0;background:#eef2f7}</style>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
const j = async (p) => (await fetch(p)).json();
const ui6 = await j('assets/ui6/manifest.json'), au = await j('assets/audio8/manifest.json');
const ui5 = await j('assets/ui5/manifest.json'), ui3 = await j('assets/ui3/manifest.json'), ui = await j('assets/ui/manifest.json');
const props = await j('assets/props/manifest.json');
await document.fonts.load('800 24px Pretendard');
const H = window.__H = { ready: false, missing: [], sizeBad: [], trimmed: [], nine: [], anims: {}, frames: 0, audio: { keys: {} }, probe: {} };
class S extends Phaser.Scene {
  preload() {
    const L = this.load;
    for (const m of [ui6, ui5, ui3, ui]) for (const a of m.atlases || []) L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const a of props.atlases) if (a.key === 'props_items') L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    L.audio('__sprite_audio8', ['assets/' + au.audioSprite.file]);
  }
  async create() {
    const tex = this.textures;
    // ---- every frame of every sprite; sourceSize = frameSize
    for (const k in ui6.sprites) {
      const s = ui6.sprites[k];
      if (!tex.exists(s.atlas)) { H.missing.push('atlas:' + s.atlas); continue; }
      const t = tex.get(s.atlas);
      const names = new Set([s.frame, ...(s.frameNames || [])]);
      for (const an in s.anims || {}) for (const f of s.anims[an].frames) names.add(f);
      for (const f of names) {
        if (!t.has(f)) { H.missing.push(k + ':' + f); continue; }
        H.frames++;
        const fr = t.get(f);
        if (s.frameSize && (fr.realWidth !== s.frameSize[0] || fr.realHeight !== s.frameSize[1])) H.sizeBad.push(k + ':' + f + ' ' + fr.realWidth + 'x' + fr.realHeight);
      }
    }
    for (const k in ui6.nineSlice) {
      const n = ui6.nineSlice[k], fr = tex.get(n.atlas).has(n.frame) ? tex.get(n.atlas).get(n.frame) : null;
      if (!fr) { H.missing.push('nine:' + k); continue; }
      if (fr.trimmed || fr.width !== fr.realWidth || fr.height !== fr.realHeight) H.trimmed.push(k);
    }
    // ---- the CODE hand-over: the game's own Assets.js with ui6 + audio8 merged late
    try {
      const { Assets } = await import('./src/core/Assets.js');
      Assets.game = this.game;
      Assets.mergeLate('ui6', ui6); Assets.mergeLate('audio8', au);
      const P = H.probe;
      const r = Assets.sprite('ui_icon_gb'); P.sprite_ui_icon_gb = { tex: r.tex, frame: r.frame, anchor: r.anchor, ph: !!r.ph };
      Assets.spriteAnims(this.game, 'ui_gb_mascot'); Assets.spriteAnims(this.game, 'fx_gb_bell');
      P.anims = { idle: Assets.spriteAnim('ui_gb_mascot', 'idle'), run: Assets.spriteAnim('ui_gb_mascot', 'run'), bow: Assets.spriteAnim('ui_gb_mascot', 'bow'), bell: Assets.spriteAnim('fx_gb_bell', 'play') };
      for (const a of Object.values(P.anims)) if (a) H.anims[a] = this.anims.get(a).frames.length;
      const im = Assets.image(this, -300, -300, 'ui_gb_logo_ko'); P.image_logo = im.texture.key + ':' + im.frame.name; im.destroy();
      P.has = {}; for (const k in ui6.sprites) P.has[k] = Assets.has(k);
      P.nine = {}; for (const k in ui6.nineSlice) { const nn = Assets.nine(k); P.nine[k] = { tex: nn.tex, frame: nn.frame, l: nn.l, r: nn.r, t: nn.t, b: nn.b }; }
      // audio: the game's own sliceSprite cuts the sprite (dur + 30 ms per key)
      Assets.sliceSprite('audio8', this.game);
      await new Promise((ok) => setTimeout(ok, 300));
      const ctx = this.sound.context;
      H.audio.ctxRate = ctx.sampleRate;
      for (const k in au.audioSprite.keys) {
        const b = this.cache.audio.get(k);
        if (!b || typeof b.getChannelData !== 'function') { H.missing.push('audio slice ' + k); continue; }
        const d = b.getChannelData(0), n = d.length, sr = b.sampleRate, du = au.audioSprite.keys[k][1];
        let pk = 0, tail = 0, head = 0;
        const body = Math.floor(du * sr), h5 = Math.floor(0.005 * sr);
        for (let i = 0; i < n; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; if (i >= body && v > tail) tail = v; if (i < h5 && v > head) head = v; }
        H.audio.keys[k] = { sec: +(n / sr).toFixed(4), peak: +pk.toFixed(3), tail30ms: +tail.toFixed(4), head5ms: +head.toFixed(4), sr };
      }
      H.audio.spriteGone = !this.cache.audio.exists('__sprite_audio8');
      P.groups = {}; for (const g in au.audioGroups) P.groups[g] = (Assets.audioGroup(g) || []).every((k) => this.cache.audio.exists(k));
      for (const k in au.audioSprite.keys) { try { this.sound.add(k, { volume: au.audio[k].volume }).play(); } catch (e) { H.missing.push('play ' + k + ': ' + e); } }
    } catch (err) { H.missing.push('probe: ' + err + ' ' + (err.stack || '')); }
    // ---- the sheet: icons at 96 / 48 / 32 next to the house icons, tracker, logos, mascot + bell anims, 9-slices
    const T = (x, y, s, size = 16, col = '#1d2b44') => this.add.text(x, y, s, { fontFamily: 'Pretendard, sans-serif', fontSize: size + 'px', fontStyle: '800', color: col, resolution: 2 });
    T(12, 8, 'ui6 in Phaser 3.90 - icons at 96 / 48 / 32 px, then the house icons (ui / ui3 / ui5) at 48 px', 20);
    const icons = Object.keys(ui6.sprites).filter((k) => k.startsWith('ui_icon_gb'));
    icons.forEach((k, i) => {
      const x = 60 + (i % 7) * 205, y = 90 + Math.floor(i / 7) * 120;
      this.add.image(x, y, 'ui6_gb', k);
      this.add.image(x + 80, y - 14, 'ui6_gb', k).setScale(0.5);
      this.add.image(x + 80, y + 30, 'ui6_gb', k).setScale(1 / 3);
      T(x - 48, y + 50, k.replace('ui_icon_', ''), 13, '#4b5873');
    });
    const house = [['ui_icons', 'ui_icon_coin'], ['ui3_icons', 'ui_icon_delivery'], ['ui3_icons', 'ui_icon_fame'], ['ui5_icons', 'ui_icon_depot'], ['ui5_icons', 'ui_icon_letter'], ['ui5_icons', 'ui_icon_staff'], ['ui5_icons', 'ui_icon_binoculars']];
    house.forEach(([a, f], i) => { if (tex.exists(a) && tex.get(a).has(f)) this.add.image(60 + i * 70, 340, a, f).setScale(48 / 96); });
    T(560, 330, '<- ui / ui3 / ui5 icons for the house style', 14, '#4b5873');
    // tracker row
    ['order', 'pick', 'pack', 'go', 'done'].forEach((k, i) => {
      this.add.image(60 + i * 90, 430, 'ui6_gb', 'ui_gb_step_' + k + '_on');
      this.add.image(60 + i * 90, 510, 'ui6_gb', 'ui_gb_step_' + k + '_off');
      if (i < 4) { this.add.image(105 + i * 90, 430, 'ui6_gb', 'ui_gb_line_on').setDisplaySize(26, 8); this.add.image(105 + i * 90, 510, 'ui6_gb', 'ui_gb_line_off').setDisplaySize(26, 8); }
    });
    ['off', 'on', 'now'].forEach((s, i) => this.add.image(520 + i * 40, 430, 'ui6_gb', 'ui_gb_dot_' + s));
    ['full', 'empty'].forEach((s, i) => this.add.image(520 + i * 40, 510, 'ui6_gb', 'ui_gb_star_' + s));
    // logos + mark
    this.add.image(780, 420, 'ui6_gb', 'ui_gb_logo_ko').setOrigin(0, 0.5);
    this.add.image(780, 505, 'ui6_gb', 'ui_gb_logo_en').setOrigin(0, 0.5);
    this.add.image(1110, 460, 'ui6_gb', 'ui_gb_mark');
    [48, 32, 24].forEach((s, i) => this.add.image(1210 + i * 50, 460, 'ui6_gb', 'ui_gb_mark').setScale(s / 128));
    // mascot anims + bell (looping the one-shots so the capture shows motion)
    const P = H.probe || {};
    [['idle', 70], ['run', 230], ['bow', 390]].forEach(([an, x]) => {
      const s = this.add.sprite(x, 700, 'ui6_gb', 'ui_gb_mascot_' + an + '_0').setOrigin(0.5, 0.9);
      if (P.anims && P.anims[an]) s.play({ key: P.anims[an], repeat: -1 });
      T(x - 20, 712, an, 14, '#4b5873');
    });
    for (let i = 0; i < 4; i++) this.add.image(540 + i * 74, 660, 'ui6_gb', 'fx_gb_bell_' + i);
    const bell = this.add.sprite(860, 660, 'ui6_gb', 'fx_gb_bell_0');
    if (P.anims && P.anims.bell) bell.play({ key: P.anims.bell, repeat: -1, repeatDelay: 400 });
    // 9-slices at app sizes
    const nine = (k, x, y, w, h, sc = 1) => {
      const n = ui6.nineSlice[k];
      const o = this.add.nineslice(x, y, n.atlas, n.frame, w, h, n.left, n.right, n.top, n.bottom).setOrigin(0, 0).setScale(sc);
      H.nine.push({ k, w: Math.round(o.width), h: Math.round(o.height), want: [w, h] });
      return o;
    };
    nine('ui_gb_phone', 20, 760, 360, 640);
    nine('ui_gb_header', 400, 760, 678 * 0.6, 150 * 0.6);
    nine('ui_gb_tab', 400, 870, 100, 64); nine('ui_gb_tab_on', 510, 870, 100, 64);
    nine('ui_gb_tab_on', 620, 870, 100, 64, 1.28);
    nine('ui_gb_card', 400, 970, 646 * 0.6, 256 * 0.6);
    nine('ui_gb_chip', 800, 970, 175, 64, 81 / 64);
    nine('ui_gb_toast', 800, 1070, 554 * 0.8, 89 * 0.8);
    nine('ui_gb_ribbon', 400, 1150, 150, 48);
    nine('ui_gb_ribbon', 570, 1150, 260, 48);
    this.add.image(980, 1270, 'ui6_gb', 'ui_gb_photo');
    H.scene = this; H.ready = true;
  }
}
window.__H.game = new Phaser.Game({ type: Phaser.WEBGL, width: 1500, height: 1450, backgroundColor: '#eef2f7', render: { antialias: true }, scene: S, banner: false });
</script></body></html>`;

// ---------------------------------------------------------------- 2) + 3) phone pages
const PHONE = (o) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${FONT_CSS}html,body{margin:0;background:#dbe6f2;height:100%;overflow:hidden}#game{width:100%;height:100%}</style>
<script src="lib/phaser.min.js"></script></head><body><div id="game"></div><script type="module">
const O = ${JSON.stringify(o)};
const j = async (p) => (await fetch(p)).json();
const ui6 = await j('assets/ui6/manifest.json'), gb = await j('assets/geumbang/manifest.json'), town = await j('assets/town/manifest.json');
const emo = await j('assets/emotes/manifest.json'), props = await j('assets/props/manifest.json'), ui = await j('assets/ui/manifest.json');
await document.fonts.load('800 28px Pretendard');
const W = 720, H = Math.round(720 * innerHeight / innerWidth);
const k = Math.round(Math.max(1, Math.min(3, innerWidth * devicePixelRatio / 720)) * 100) / 100;
const R = window.__R = { ready: false, k, H, m: {} };
const cssOf = (logical) => +(logical * innerWidth / 720).toFixed(1);      // UI logical px -> CSS px
const DEPTH = { GROUND: -15000, SHADOW: -11000, FX: 31000, LABEL: 41000 };
const FONT = 'Pretendard, sans-serif';
const txt = (sc, x, y, s, size, col, extra = {}) => sc.add.text(x, y, s, Object.assign({ fontFamily: FONT, fontSize: size + 'px', fontStyle: '800', color: col, resolution: 3 }, extra));
class S extends Phaser.Scene {
  constructor() { super('S'); }
  preload() {
    const L = this.load;
    for (const a of ui6.atlases) L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const a of gb.atlases) L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const a of town.atlases) if (a.key === 'town_homes') L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const a of emo.atlases || []) L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const a of props.atlases) if (a.key === 'props_items') L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const a of ui.atlases || []) L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const k2 of ['ground_snow']) L.image(k2, 'assets/ground/' + k2 + '.png');
    L.image('road_cobble_wide', 'assets/roads/road_cobble_wide.png'); L.image('road_dirt', 'assets/roads/road_dirt.png');
  }
  create() {
    const anims = this.anims;
    for (const key of ['ui_gb_mascot', 'fx_gb_bell']) { const s = ui6.sprites[key]; for (const an in s.anims) { const a = s.anims[an]; anims.create({ key: 'spr:' + key + ':' + an, frames: a.frames.map((f) => ({ key: s.atlas, frame: f })), frameRate: a.fps, repeat: a.repeat }); } }
    const van = gb.characters.gb_van;
    anims.create({ key: 'gbvan:idle:SE', frames: [0, 1].map((i) => ({ key: van.atlas, frame: 'idle_SE_' + i })), frameRate: 6, repeat: -1 });
    const cam = this.cameras.main;
    this.add.tileSprite(0, 0, 4200, 5200, 'ground_snow').setDepth(DEPTH.GROUND);
    const g = this.make.graphics({ x: 0, y: 0, add: false }); g.fillStyle(0xffffff, 1);
    g.fillPoints([[-2100, -900], [2100, 1200], [2100, 1380], [-2100, -720]].map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
    this.add.tileSprite(0, 0, 4200, 5200, 'road_cobble_wide').setDepth(DEPTH.GROUND + 1).setMask(g.createGeometryMask());
    // a townhouse with a 금방 parcel on its doorstep and the doorbell ringing over its door
    const th = town.sprites.townhouse_a, hx = 60, hy = -120;   // door clear of the HUD chip at every zoom
    this.add.image(hx, hy, th.atlas, th.frame).setOrigin(th.anchor[0], th.anchor[1]).setDepth(hy);
    const dp = th.doorPoint, dx = hx + dp[0], dy = hy + dp[1];
    // a trodden dirt path from the door down to the cobble road (snow / dirt / cobble grounds)
    const pg = this.make.graphics({ x: 0, y: 0, add: false }); pg.fillStyle(0xffffff, 1);
    const p0x = dx + 20, p0y = dy + 20, p1x = p0x - 300, p1y = p0y + 150;
    pg.fillPoints([[p0x + 30, p0y + 15], [p1x + 30, p1y + 15], [p1x - 30, p1y - 15], [p0x - 30, p0y - 15]].map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
    this.add.tileSprite(0, 0, 4200, 5200, 'road_dirt').setDepth(DEPTH.GROUND + 0.5).setMask(pg.createGeometryMask());
    const pd = gb.sprites.gb_parcel_doorstep;
    this.add.image(dx + 26, dy + 14, pd.atlas, O.night ? 'gb_parcel_doorstep_1' : 'gb_parcel_doorstep_0').setOrigin(pd.anchor[0], pd.anchor[1]).setDepth(dy + 14);
    const bellScale = 40 / (64 * O.zoom * k) * devicePixelRatio;                       // 40 CSS px at any zoom
    const bell = this.add.sprite(dx + 22, dy - 96, 'ui6_gb', 'fx_gb_bell_0').setDepth(DEPTH.LABEL - 50).setScale(bellScale);
    bell.play({ key: 'spr:fx_gb_bell:play', repeat: -1, repeatDelay: 700 });
    bell.anims.setProgress(0.6);
    R.m.bellCss = +(64 * bellScale * O.zoom * k / devicePixelRatio).toFixed(1);
    // the van on the road, its roof sign, a locker and the round sign
    const vx = 250, vy = 330;
    this.add.ellipse(vx, vy, 218 * 0.9, 81 * 0.9, 0x1d2b44, 0.22).setDepth(DEPTH.SHADOW);
    this.add.sprite(vx, vy, van.atlas, 'idle_SE_0').setOrigin(van.anchor[0], van.anchor[1]).setDepth(vy).play('gbvan:idle:SE');
    const rs = van.roofSignPoint.SE;
    this.add.image(vx + rs[0], vy + rs[1], van.atlas, 'gb_roofsign_ko_' + (O.night ? 1 : 0)).setOrigin(0.5, 1).setDepth(vy + 0.02);
    const lk = gb.sprites.gb_locker_a, sg = gb.sprites.gb_sign;
    this.add.image(-330, 260, lk.atlas, O.night ? 'gb_locker_a_1' : 'gb_locker_a_0').setOrigin(lk.anchor[0], lk.anchor[1]).setDepth(260);
    this.add.image(-170, 330, sg.atlas, O.night ? 'gb_sign_1' : 'gb_sign_0').setOrigin(sg.anchor[0], sg.anchor[1]).setDepth(330);
    // an order bubble over a resident's window (constant screen size): ui_emote_bubble + the cart + the item
    const eb = emo.sprites.ui_emote_bubble, bs = 0.75 / (O.zoom * k) * devicePixelRatio * (720 / innerWidth) * (innerWidth / 390);
    const bx = hx + 120, by = hy - 150;
    const bub = this.add.container(bx, by).setDepth(DEPTH.LABEL - 40).setScale(Math.min(2.4, Math.max(0.7, 1 / O.zoom)));
    bub.add(this.add.image(0, 0, eb.atlas, eb.frame).setOrigin(eb.anchor[0], eb.anchor[1]).setScale(1.25, 1));
    const cc = eb.contentCenter;
    bub.add(this.add.image(cc[0] - 22, cc[1], 'ui6_gb', 'ui_icon_gb_cart').setScale(40 / 96));
    const it = props.sprites.item_bread;
    bub.add(this.add.image(cc[0] + 24, cc[1] + 4, it.atlas, it.frame).setScale(36 / 72));
    if (O.night) this.add.rectangle(0, 0, 6000, 7000, 0x5a6aa8, 0.45).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(DEPTH.FX - 30);
    cam.setZoom(O.zoom * k); cam.centerOn(40, 90);
    this.scene.launch('U');
    R.worldReady = true;
  }
}
// ---- UI scene: logical 720 x H at k, like the game's UI scene
class U extends Phaser.Scene {
  constructor() { super('U'); }
  nine(key, x, y, w, h, sc = 1) {
    const n = ui6.nineSlice[key];
    return this.add.nineslice(x, y, n.atlas, n.frame, w / sc, h / sc, n.left, n.right, n.top, n.bottom).setOrigin(0, 0).setScale(sc);
  }
  create() {
    const cam = this.cameras.main; cam.setOrigin(0, 0).setZoom(k);
    if (O.mode === 'hud') this.hud(); else this.app();
    R.ready = true;
  }
  hud() {
    // caption
    this.add.rectangle(0, 0, 720, 64, 0xffffff, 0.85).setOrigin(0, 0);
    txt(this, 16, 10, '금방 HUD · zoom ' + O.zoom.toFixed(1) + ' · ' + (O.night ? '밤 night' : '낮 day'), 26, '#1d2b44');
    // the 금방 chip (plan §6: CSS (60, 270) -> logical (111, 499), 120 x 44 CSS): built 64 tall, scaled uniformly
    const ch = 44 * 720 / innerWidth, cw = 120 * 720 / innerWidth, cx = 111 - cw / 2, cy = 499 - ch / 2, sc = ch / 64;
    const chip = this.nine('ui_gb_chip', cx, cy, cw, ch, sc);
    this.add.image(cx + ch / 2 + 4, cy + ch / 2, 'ui6_gb', 'ui_icon_gb').setScale(ch * 0.74 / 96);
    txt(this, cx + ch + 4, cy + ch / 2, '배달 중 3', 28, '#2b4f7e').setOrigin(0, 0.5);
    this.add.circle(cx + cw - 8, cy + 6, 9, 0xf2b33d).setStrokeStyle(3, 0xffffff);
    R.m.chipCss = [cssOf(cw), cssOf(ch)];
    // the toast: top centre under the clock row, <= 300 x 48 CSS
    const tw = 300 * 720 / innerWidth, tht = 48 * 720 / innerWidth, tx = (720 - tw) / 2, ty = 82;
    this.nine('ui_gb_toast', tx, ty, tw, tht);
    this.add.image(tx + 52, ty + tht / 2, 'ui6_gb', 'ui_icon_gb_order').setScale(tht * 0.66 / 96);
    txt(this, tx + 84, ty + tht / 2, '띵동! 새 주문 · 민지네 · 빵 3', 28, '#3b3f52').setOrigin(0, 0.5);
    R.m.toastCss = [cssOf(tw), cssOf(tht)];
    // the mascot peeking (it runs in on the first order of the day)
    this.add.sprite(640, 499 + 40, 'ui6_gb', 'ui_gb_mascot_idle_0').setOrigin(0.5, 0.9).play('spr:ui_gb_mascot:idle').setScale(0.9);
  }
  app() {
    const L = ui6.conventions.appLayout, en = O.lang === 'en';
    const [PW, PH] = L.panel, px = 0, py = Math.round((H - PH) / 2);
    this.add.rectangle(0, 0, 720, H, 0x1d2436, 0.28).setOrigin(0, 0);
    const root = this.add.container(px, py);
    const n = (key, x, y, w, h, sc = 1) => { const o = this.nine(key, x, y, w, h, sc); root.add(o); return o; };
    const im = (key, x, y, size, ox = 0.5, oy = 0.5) => { const o = this.add.image(x, y, 'ui6_gb', key).setOrigin(ox, oy); if (size) o.setScale(size / Math.max(o.frame.realWidth, o.frame.realHeight)); root.add(o); return o; };
    const t = (x, y, s, size, col, ox = 0, oy = 0) => { const o = txt(this, x, y, s, size, col).setOrigin(ox, oy); root.add(o); R.m.minFont = Math.min(R.m.minFont || 99, size); return o; };
    n('ui_gb_phone', 0, 0, PW, PH);
    const hd = L.header, [hx, hy, hw, hh] = hd.rect;
    n('ui_gb_header', hx, hy, hw, hh);
    im(en ? 'ui_gb_logo_en' : 'ui_gb_logo_ko', hd.logo[0], hd.logo[1], 0, 0, 0);
    t(hd.tagline[0], hd.tagline[1], en ? 'Order now, here in a moment' : '방금 시키면 금방 와요', hd.tagline[2], '#2b4f7e', 0, 0.5);
    const [clx, cly, clr] = hd.close;
    const cg = this.add.graphics(); cg.fillStyle(0xfffbf3, 1).fillCircle(clx, cly, clr).lineStyle(3, 0xb07a1c, 1).strokeCircle(clx, cly, clr);
    cg.lineStyle(6, 0x2b4f7e, 1).lineBetween(clx - 13, cly - 13, clx + 13, cly + 13).lineBetween(clx - 13, cly + 13, clx + 13, cly - 13);
    root.add(cg);
    R.m.closeCss = cssOf(clr * 2);
    const ms = this.add.sprite(hd.mascot[0] + 220, hd.mascot[1], 'ui6_gb', 'ui_gb_mascot_run_0').setOrigin(0.5, 0.9).play('spr:ui_gb_mascot:run');
    root.add(ms);
    this.tweens.add({ targets: ms, x: hd.mascot[0], duration: 700, ease: 'Quad.out', onComplete: () => ms.play('spr:ui_gb_mascot:idle') });
    // tabs (built at 64 tall, scaled uniformly to 82 = 44 CSS: tap targets)
    const TB = L.tabs, tabs = [['today', 'ui_icon_gb_today', '오늘', 'Today'], ['order', 'ui_icon_gb_order', '주문', 'Order'], ['catalog', 'ui_icon_gb_catalog', '상품', 'Shop'], ['crew', 'ui_icon_gb_crew', '기사님', 'Crew'], ['review', 'ui_icon_gb_review', '후기', 'Stars']];
    let x = hx + (hw - (5 * TB.w + 4 * TB.gap)) / 2;
    for (const [key, ic, ko, en_] of tabs) {
      const on = key === O.tab;
      n(on ? 'ui_gb_tab_on' : 'ui_gb_tab', x, TB.y, TB.w, TB.h, TB.scale);
      const word = en ? en_ : ko, fs_ = en ? TB.fontEn : TB.font;
      const tt = txt(this, 0, 0, word, fs_, on ? '#2b4f7e' : '#8a7a62');
      const total = TB.icon + TB.iconGap + tt.width, sx = x + (TB.w - total) / 2;
      tt.setPosition(sx + TB.icon + TB.iconGap, TB.y + TB.h / 2).setOrigin(0, 0.5); root.add(tt); R.m.minFont = Math.min(R.m.minFont || 99, fs_);
      if (tt.width + TB.icon + TB.iconGap > TB.w - 12) R.m.tabOverflow = (R.m.tabOverflow || []).concat(word);
      im(ic, sx + TB.icon / 2, TB.y + TB.h / 2, TB.icon);
      if (key === 'review') { const d = this.add.circle(x + TB.w - 14, TB.y + 12, 8, 0xf2b33d).setStrokeStyle(2, 0xffffff); root.add(d); }
      x += TB.w + TB.gap;
    }
    R.m.tabCss = [cssOf(TB.w), cssOf(TB.h)];
    // content (masked to the screen under the tabs)
    const [cx0, cy0, cw, chh] = L.content, C = L.card, sr = L.screen;
    const content = this.add.container(0, 0); root.add(content);
    const mg = this.make.graphics({ x: 0, y: 0, add: false }); mg.fillStyle(0xffffff, 1).fillRoundedRect(px + sr[0], py + cy0 - 8, sr[2], sr[1] + sr[3] - cy0 + 8, { tl: 0, tr: 0, bl: 30, br: 30 });
    content.setMask(mg.createGeometryMask());
    const cn = (key, x, y, w, h, sc = 1) => { const o = this.nine(key, x, y, w, h, sc); content.add(o); return o; };
    const ci = (atlas, frame, x, y, size, ox = 0.5, oy = 0.5) => { const o = this.add.image(x, y, atlas, frame).setOrigin(ox, oy); if (size) o.setScale(size / Math.max(o.frame.realWidth, o.frame.realHeight)); content.add(o); return o; };
    const ct = (x, y, s, size, col, ox = 0, oy = 0) => { const o = txt(this, x, y, s, size, col).setOrigin(ox, oy); content.add(o); R.m.minFont = Math.min(R.m.minFont || 99, size); return o; };
    const item = (name, x, y, size) => { const s = props.sprites[name]; if (!s) return; const o = ci(s.atlas, s.frame, x, y, 0); const f = o.frame, cxo = f.realWidth / 2 - (f.x + f.width / 2), cyo = f.realHeight / 2 - (f.y + f.height / 2), sc = size / Math.max(f.width, f.height); o.setScale(sc).setPosition(x + cxo * sc, y + cyo * sc); };   // sized + centred on the trimmed content
    const tracker = (x0, x1, y, step) => {
      const T = L.tracker, keys = ['order', 'pick', 'pack', 'go', 'done'], words = en ? ['Ordered', 'Picking', 'Packing', 'On the way', 'Arrived'] : ['주문', '고르기', '포장', '배달 중', '도착'];
      const xs = keys.map((_, i) => x0 + (x1 - x0) * i / 4), b = T.badge;
      for (let i = 0; i < 4; i++) { const ln = ci('ui6_gb', i < step ? 'ui_gb_line_on' : 'ui_gb_line_off', (xs[i] + xs[i + 1]) / 2, y); ln.setDisplaySize(xs[i + 1] - xs[i] - b - 6, 8); }
      keys.forEach((kk, i) => {
        ci('ui6_gb', 'ui_gb_step_' + kk + (i <= step ? '_on' : '_off'), xs[i], y, b);
        if (i === step) ci('ui6_gb', 'ui_gb_dot_now', xs[i] + b / 2 - 4, y - b / 2 + 6, 0);
        ct(xs[i], y + b / 2 + T.labelGap, words[i], en ? T.labelFontEn : T.labelFont, i === step ? '#2b4f7e' : (i < step ? '#3b3f52' : '#807462'), 0.5, 0);
      });
    };
    const coin = (x, y, size) => ci('ui_icons', 'ui_icon_coin', x, y, size);
    if (O.tab === 'order') {
      ct(cx0 + 6, cy0 + 4, en ? 'On the way 3 · New 5' : '배달 중 3 · 새 주문 5', C.small, '#807462');
      let y = cy0 + 40; const OC = L.orderCard;
      cn('ui_gb_card', cx0, y, cw, OC.h);
      ct(cx0 + 30, y + 22, en ? 'Pine Apts 2 · Grandma Jeong' : '솔방울 아파트 2동 · 정 할머니', C.font, '#3b3f52');
      cn('ui_gb_ribbon', cx0 + cw - 168, y + 14, 150, 48);
      ct(cx0 + cw - 93, y + 37, en ? 'On way' : '배달 중', C.small, '#2b4f7e', 0.5, 0.5);
      item('item_log', cx0 + 52, y + 88, 40); ct(cx0 + 78, y + 88, '4', C.font, '#3b3f52', 0, 0.5);
      item('item_bread', cx0 + 128, y + 88, 40); ct(cx0 + 154, y + 88, '2', C.font, '#3b3f52', 0, 0.5);
      coin(cx0 + cw - 102, y + 88, 34); ct(cx0 + cw - 80, y + 88, '+22', C.font, '#b07a1c', 0, 0.5);
      tracker(cx0 + 60, cx0 + cw - 60, y + OC.trackerY, 3);
      ct(cx0 + 30, y + OC.etaY, en ? 'Left! About 20 s' : '출발! 약 20초 뒤 도착', C.small, '#3b3f52', 0, 0.5);
      const B = L.button, bx = cx0 + cw - OC.button[0], by = y + OC.button[1];
      cn('ui_gb_chip', bx, by, OC.button[2], B.h, B.scale);
      ci('ui6_gb', 'ui_icon_gb_follow', bx + 50, by + B.h / 2, 46);
      ct(bx + 82, by + B.h / 2, en ? 'Follow' : '따라가기', C.small, '#2b4f7e', 0, 0.5);
      R.m.buttonCss = cssOf(B.h);
      y += OC.h + C.gap;
      cn('ui_gb_card', cx0, y, cw, 236);
      ct(cx0 + 30, y + 20, en ? "Station St · Minji's" : '역앞 집 · 민지네', C.font, '#3b3f52');
      // the doorstep photo: a real 128 x 80 render texture under the frame
      const pr = ui6.sprites.ui_gb_photo.photoRect, phx = cx0 + 26, phy = y + 52;
      const rt = this.add.renderTexture(phx + pr[0], phy + pr[1], pr[2], pr[3]).setOrigin(0, 0);
      rt.fill(0xe6edf6);
      const th = town.sprites.townhouse_a;
      rt.draw(this.make.image({ key: th.atlas, frame: th.frame, add: false }).setScale(0.42).setOrigin(0.5, 0.75), 36, 92);
      rt.draw(this.make.image({ key: 'gb_bld_0', frame: 'gb_parcel_doorstep_1', add: false }).setOrigin(0.5, 0.75), 92, 70);
      content.add(rt);
      ci('ui6_gb', 'ui_gb_photo', phx, phy, 0, 0, 0);
      const aw = ct(cx0 + cw - 28, y + 34, en ? 'Arrived' : '도착', C.small, '#2b4f7e', 1, 0.5).width;
      ci('ui6_gb', 'ui_gb_step_done_on', cx0 + cw - 28 - aw - 8 - 22, y + 34, 44);
      for (let i = 0; i < 5; i++) ci('ui6_gb', 'ui_gb_star_full', cx0 + 240 + i * 36, y + 88, 34);
      ct(cx0 + 224, y + 122, en ? '"Ordered just now,\\nhere already? So fast!"' : '"방금 시켰는데 벌써요?\\n진짜 금방이네!"', C.small, '#3b3f52').setLineSpacing(10);
      y += 236 + C.gap;
      cn('ui_gb_card', cx0, y, cw, 220);
      ct(cx0 + 30, y + 22, en ? 'Bakery upstairs · Mr. Oh' : '빵집 위층 · 오 아저씨', C.font, '#3b3f52');
      item('item_fish_cooked', cx0 + 52, y + 88, 40); ct(cx0 + 78, y + 88, '3', C.font, '#3b3f52', 0, 0.5);
      tracker(cx0 + 60, cx0 + cw - 60, y + 152, 1);
    } else if (O.tab === 'today') {
      const stats = [['ui_icon_gb_order', '42', en ? 'Orders' : '주문'], ['ui_icon_gb_van', '38', en ? 'Delivered' : '배달'], ['ui_icon_gb_catalog', '−214', en ? 'Shelf' : '줄어든 재고'], [null, '+1,240', en ? 'Coins' : '코인']];
      stats.forEach(([ic, num, lab], i) => {
        const bx = cx0 + (i % 2) * (cw / 2 + 4), by = cy0 + 6 + Math.floor(i / 2) * 128;
        cn('ui_gb_card', bx, by, cw / 2 - 4, 120);
        if (ic) ci('ui6_gb', ic, bx + 66, by + 58, 64); else coin(bx + 66, by + 58, 56);
        ct(bx + 112, by + 42, num, 40, '#3b3f52', 0, 0.5); ct(bx + 112, by + 84, lab, C.small, '#807462', 0, 0.5);
      });
      let y = cy0 + 270;
      cn('ui_gb_card', cx0, y, cw, 280);
      ct(cx0 + 30, y + 20, en ? 'Depot shelves' : '물류센터 선반', C.font, '#3b3f52');
      const g2 = this.add.graphics(); content.add(g2);
      [['item_log', 0.42, 0.66], ['item_bread', 0.30, 0.48], ['item_fish_raw', 0.55, 0.71], ['item_ore', 0.62, 0.80]].forEach(([ik, now, yest], i) => {
        const ry = y + 84 + i * 46, x0 = cx0 + 84, x1 = cx0 + cw - 40;
        item(ik, cx0 + 54, ry + 8, 34);
        g2.fillStyle(0xece4d6, 1).fillRoundedRect(x0, ry, x1 - x0, 16, 8).fillStyle(0xf2b33d, 1).fillRoundedRect(x0, ry, (x1 - x0) * now, 16, 8);
        g2.lineStyle(3, 0x807462, 0.8).lineBetween(x0 + (x1 - x0) * yest, ry - 4, x0 + (x1 - x0) * yest, ry + 20);
      });
      y += 296;
      cn('ui_gb_card', cx0, y, cw, 140);
      cn('ui_gb_ribbon', cx0 + 22, y + 14, 150, 48); ct(cx0 + 97, y + 37, en ? 'Deal' : '지금 특가', C.small, '#2b4f7e', 0.5, 0.5);
      ['item_log', 'item_ore', 'item_fish_raw'].forEach((ik, i) => item(ik, cx0 + 230 + i * 70, y + 40, 44));
      ci('ui6_gb', 'ui_icon_gb_review', cx0 + 50, y + 100, 40);
      ct(cx0 + 80, y + 100, en ? '"Through the snow - amazing!"' : '"눈길을 뚫고 왔네! 대단해요!"', C.small, '#3b3f52', 0, 0.5);
    } else if (O.tab === 'catalog') {
      const rows = [['item_log', '장작', 'Firewood', 1, '특가', 'Deal', 'deal'], ['item_bread', '빵', 'Bread', 4, '가게 먼저', 'Shops first', 'pause'], ['item_fish_raw', '생선', 'Fish', 3, '판매 중', 'On sale', 'sale'], ['item_ore', '광석', 'Ore', 2, '판매 중', 'On sale', 'sale'], ['item_wheat', '밀', 'Wheat', 2, '품절', 'Sold out', 'out']];
      const g3 = this.add.graphics(); content.add(g3);
      rows.forEach(([ik, ko, en_, price, sk, se, st], i) => {
        const y = cy0 + 4 + i * 152;
        cn('ui_gb_card', cx0, y, cw, 140);
        item(ik, cx0 + 66, y + 68, 60);
        ct(cx0 + 116, y + 44, en ? en_ : ko, C.font, '#3b3f52', 0, 0.5);
        coin(cx0 + 130, y + 96, 28); ct(cx0 + 150, y + 96, String(price), C.small, '#b07a1c', 0, 0.5);
        if (st === 'deal') { cn('ui_gb_ribbon', cx0 + cw - 186, y + 20, 160, 48); ci('ui6_gb', 'ui_icon_gb_deal', cx0 + cw - 160, y + 44, 30); ct(cx0 + cw - 98, y + 44, en ? se : sk, C.small, '#2b4f7e', 0.5, 0.5); }
        else { cn('ui_gb_chip', cx0 + cw - 244, y + 19, 220, 50, 50 / 64); ct(cx0 + cw - 134, y + 44, en ? se : sk, C.small, st === 'sale' ? '#2b4f7e' : '#8a7a62', 0.5, 0.5); }
        const TG = L.toggle, on = st !== 'out', tx0 = cx0 + cw - 30 - TG.w, ty0 = y + 82, kr = TG.h / 2 - 3, kx = on ? tx0 + TG.w - TG.h / 2 : tx0 + TG.h / 2;
        g3.fillStyle(on ? 0xf2b33d : 0xe2dbce, 1).fillRoundedRect(tx0, ty0, TG.w, TG.h, TG.h / 2);
        g3.fillStyle(0xfffdf8, 1).fillCircle(kx, ty0 + TG.h / 2, kr).lineStyle(2, on ? 0xb07a1c : 0xbdb3a0, 1).strokeCircle(kx, ty0 + TG.h / 2, kr);
        R.m.toggleHitCss = cssOf(TG.hitH);
        ct(tx0 - 12, ty0 + TG.h / 2, on ? (en ? 'Sell' : '팔기') : (en ? 'Rest' : '쉬기'), C.small, '#3b3f52', 1, 0.5);
      });
      content.bringToTop(g3);   // the toggles sit on the cards
    }
    R.m.panelCss = [cssOf(PW), cssOf(PH)];
    R.m.bodyCss = cssOf(C.font); R.m.smallCss = cssOf(C.small); R.m.minFontCss = cssOf(R.m.minFont || 0);
  }
}
window.__R.game = new Phaser.Game({ type: Phaser.WEBGL, parent: 'game', width: Math.round(W * k), height: Math.round(H * k), backgroundColor: '#dbe6f2',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, render: { antialias: true, roundPixels: false }, scene: [S, U], banner: false });
</script></body></html>`;

// ---------------------------------------------------------------- run
const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const errors = [];
const notFound = [];
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) notFound.push(r.status() + ' ' + r.url()); });
};
const out = { clashes, fragmentsChecked: frags.length };
// 1) load page
{
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 1450 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  watch(page);
  await page.route('**/fv/__ui6_load.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: LOAD_HTML }));
  await page.goto(srv.url + '__ui6_load.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__H && window.__H.ready, null, { timeout: 240000 });
  await sleep(1500);
  const res = await page.evaluate(() => {
    const H = window.__H, sc = H.scene;
    const playing = sc.children.list.filter((o) => o.anims && o.anims.isPlaying).length;
    return { frames: H.frames, anims: H.anims, missing: H.missing, sizeBad: H.sizeBad, trimmedPanels: H.trimmed, nine: H.nine, audio: H.audio, playing, probe: H.probe };
  });
  await page.screenshot({ path: path.join(PREV, 'ui6_phaser_sheet.png'), timeout: 180000 });
  await ctx.close();
  out.load = res;
  if (res.missing.length) problems.push(...res.missing.map((m) => 'missing: ' + m));
  if (res.sizeBad.length) problems.push(...res.sizeBad.map((m) => 'sourceSize != frameSize: ' + m));
  if (res.trimmedPanels.length) problems.push('trimmed 9-slice panels: ' + res.trimmedPanels.join(', '));
  for (const n of res.nine) if (Math.abs(n.w - n.want[0]) > 0.6 || Math.abs(n.h - n.want[1]) > 0.6) problems.push(`nineslice ${n.k} ${n.w}x${n.h} != ${n.want}`);
  const P = res.probe || {};
  if (!P.sprite_ui_icon_gb || P.sprite_ui_icon_gb.tex !== 'ui6_gb' || P.sprite_ui_icon_gb.frame !== 'ui_icon_gb' || P.sprite_ui_icon_gb.ph) problems.push('probe: Assets.sprite(ui_icon_gb) ' + JSON.stringify(P.sprite_ui_icon_gb));
  if (P.image_logo !== 'ui6_gb:ui_gb_logo_ko') problems.push('probe: Assets.image(ui_gb_logo_ko) ' + P.image_logo);
  const wantAnims = { idle: 'spr:ui_gb_mascot:idle', run: 'spr:ui_gb_mascot:run', bow: 'spr:ui_gb_mascot:bow', bell: 'spr:fx_gb_bell:play' };
  for (const [a, key] of Object.entries(wantAnims)) if (!P.anims || P.anims[a] !== key) problems.push(`probe: anim ${a} ${P.anims && P.anims[a]}`);
  const frameCount = { 'spr:ui_gb_mascot:idle': 2, 'spr:ui_gb_mascot:run': 4, 'spr:ui_gb_mascot:bow': 2, 'spr:fx_gb_bell:play': 4 };
  for (const [key, nf] of Object.entries(frameCount)) if (res.anims[key] !== nf) problems.push(`anim ${key} has ${res.anims[key]} frames (want ${nf})`);
  if (!P.has || Object.values(P.has).some((v) => !v)) problems.push('probe: Assets.has false for ' + Object.entries(P.has || {}).filter(([, v]) => !v).map(([k]) => k).join(', '));
  for (const k in UI6.nineSlice) {
    const nn = (P.nine || {})[k], want = UI6.nineSlice[k];
    if (!nn || nn.tex !== 'ui6_gb' || nn.frame !== k || nn.l !== want.left || nn.r !== want.right || nn.t !== want.top || nn.b !== want.bottom) problems.push(`probe: Assets.nine(${k}) ${JSON.stringify(nn)}`);
  }
  for (const [k, [, dur]] of Object.entries(AU8.audioSprite.keys)) {
    const a = res.audio.keys[k];
    if (!a) { problems.push('audio slice missing: ' + k); continue; }
    if (Math.abs(a.sec - (dur + 0.03)) > 0.002) problems.push(`audio ${k}: slice ${a.sec} s != ${dur} + 0.03`);
    if (a.peak < 0.05) problems.push(`audio ${k}: slice is silent (peak ${a.peak})`);
    if (a.tail30ms > 0.02) problems.push(`audio ${k}: the 30 ms after the slice is not silent (${a.tail30ms}) - wrong offset?`);
    if (a.head5ms < 0.0005) problems.push(`audio ${k}: no sound in its first 5 ms (late start?)`);
  }
  if (!res.audio.spriteGone) problems.push('audio: __sprite_audio8 still in the cache after sliceSprite');
  for (const [g, ok] of Object.entries(P.groups || {})) if (!ok) problems.push('audio group ' + g + ' has a missing key');
}
// 2) + 3) phone pages
const phone = async (o, name, vw = 390, vh = 844, dpr = 3) => {
  const pctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  const pp = await pctx.newPage();
  watch(pp);
  const html = '__ui6_' + name + '.html';
  await pp.route('**/fv/' + html, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: PHONE(o) }));
  await pp.goto(srv.url + html, { waitUntil: 'load' });
  await pp.waitForFunction(() => window.__R && window.__R.ready && window.__R.worldReady, null, { timeout: 240000 });
  await sleep(o.mode === 'app' ? 1400 : 900);
  const r = await pp.evaluate(() => Object.assign({ k: window.__R.k, H: window.__R.H }, window.__R.m));
  const file = path.join(PREV, name + '.png');
  await pp.evaluate(() => window.__R.game.loop.sleep());
  await pp.screenshot({ path: file, timeout: 180000 });
  await pctx.close();
  return { r, file };
};
out.phone = {};
const hudShots = [];
for (const z of [0.6, 1.0, 1.2, 1.6]) {
  for (const night of (z > 1.2 ? [false] : [false, true])) {
    const name = 'ui6_phaser_z' + String(z.toFixed(1)).replace('.', '') + (night ? '_night' : '_day');
    const { r, file } = await phone({ zoom: z, night, mode: 'hud' }, name);
    out.phone[name] = r;
    hudShots.push(file);
    if (Math.abs(r.bellCss - 40) > 1) problems.push(`${name}: doorbell FX ${r.bellCss} CSS px (want 40)`);
    if (Math.abs(r.chipCss[1] - 44) > 0.5 || Math.abs(r.chipCss[0] - 120) > 0.5) problems.push(`${name}: chip ${r.chipCss} CSS px (want 120 x 44)`);
    if (r.toastCss[0] > 300.5 || r.toastCss[1] > 48.5) problems.push(`${name}: toast ${r.toastCss} CSS px (<= 300 x 48)`);
  }
}
{ // the small phone (360 x 640 CSS, DPR 2) at zoom 1.0, night
  const name = 'ui6_phaser_z10_night_360';
  const { r, file } = await phone({ zoom: 1.0, night: true, mode: 'hud' }, name, 360, 640, 2);
  out.phone[name] = r;
  hudShots.push(file);
  if (Math.abs(r.bellCss - 40) > 1) problems.push(`${name}: doorbell FX ${r.bellCss} CSS px (want 40)`);
  if (Math.abs(r.chipCss[1] - 44) > 0.5 || Math.abs(r.chipCss[0] - 120) > 0.5) problems.push(`${name}: chip ${r.chipCss} CSS px (want 120 x 44)`);
  if (r.toastCss[0] > 300.5 || r.toastCss[1] > 48.5) problems.push(`${name}: toast ${r.toastCss} CSS px (<= 300 x 48)`);
}
const appShots = [];
for (const [tab, lang, night, vw, vh, dpr] of [['today', 'ko', false, 390, 844, 3], ['order', 'ko', false, 390, 844, 3], ['catalog', 'ko', false, 390, 844, 3], ['order', 'en', true, 390, 844, 3], ['order', 'ko', false, 360, 640, 2]]) {
  const name = `ui6_phaser_app_${tab}_${lang}${night ? '_night' : ''}${vw === 360 ? '_360' : ''}`;
  const { r, file } = await phone({ zoom: 1.0, night, mode: 'app', tab, lang }, name, vw, vh, dpr);
  out.phone[name] = r;
  appShots.push(file);
  if (r.tabCss[1] < 44 - 0.05) problems.push(`${name}: tab height ${r.tabCss[1]} CSS px < 44 (tap target)`);
  if (r.closeCss < 44 - 0.05) problems.push(`${name}: close button ${r.closeCss} CSS px < 44`);
  if (r.buttonCss !== undefined && r.buttonCss < 44 - 0.05) problems.push(`${name}: 따라가기 button ${r.buttonCss} CSS px < 44`);
  if (r.bodyCss < 15 - 0.05) problems.push(`${name}: body text ${r.bodyCss} CSS px < 15`);
  if (r.minFontCss < 12 - 0.05) problems.push(`${name}: smallest text ${r.minFontCss} CSS px < 12`);
  if (r.toggleHitCss !== undefined && r.toggleHitCss < 44 - 0.05) problems.push(`${name}: toggle hit row ${r.toggleHitCss} CSS px < 44`);
  if (r.tabOverflow) problems.push(`${name}: tab words overflow the 128 tab: ${r.tabOverflow}`);
  if (r.H < 1100) problems.push(`${name}: the 1100 logical app panel does not fit (${r.H})`);
}
// labelled montages (CSS size)
const montage = (dst, files, cols, title, labels) => {
  const py = `
import sys, json
from PIL import Image, ImageDraw, ImageFont
dst, cols, title, labels = sys.argv[1], int(sys.argv[2]), sys.argv[3], json.loads(sys.argv[4])
files = sys.argv[5:]
ims = [Image.open(f).convert('RGB') for f in files]
h = 844
pad, head = 12, 54
ws = [round(im.size[0] * h / im.size[1]) for im in ims]
rows = (len(ims) + cols - 1) // cols
W = pad + sum(sorted(ws, reverse=True)[:cols]) + cols * pad
out = Image.new('RGB', (W, head + rows * (h + pad + 26)), (236, 241, 247))
d = ImageDraw.Draw(out)
try:
    f = ImageFont.truetype('${path.join(ROOT, 'tools', 'fonts', 'Pretendard-ExtraBold.ttf')}', 22)
    fs = ImageFont.truetype('${path.join(ROOT, 'tools', 'fonts', 'Pretendard-ExtraBold.ttf')}', 16)
except Exception:
    f = fs = ImageFont.load_default()
d.text((pad, 14), title, font=f, fill=(30, 40, 60))
x, y = pad, head
for i, im in enumerate(ims):
    if i and i % cols == 0:
        x, y = pad, y + h + pad + 26
    w = ws[i]
    out.paste(im.resize((w, round(im.size[1] * w / im.size[0])), Image.LANCZOS), (x, y))
    d.text((x, y + h + 4), labels[i], font=fs, fill=(60, 70, 90))
    x += w + pad
out.save(dst)
`;
  execFileSync('python3', ['-c', py, dst, String(cols), title, JSON.stringify(labels), ...files], { stdio: 'inherit' });
};
try {
  montage(path.join(PREV, 'ui6_phaser_phone.png'), hudShots, 4, '금방 HUD + world (snow / dirt path / cobble) in Phaser 3.90 on a 390 x 844 phone: zoom 0.6 / 1.0 / 1.2 / 1.6, day and night; last: 360 x 640 at night',
    hudShots.map((f) => path.basename(f, '.png').replace('ui6_phaser_', '')));
  montage(path.join(PREV, 'ui6_phaser_app.png'), appShots, 5, '금방 마켓 app in Phaser 3.90 (real NineSlices + appLayout): 오늘 / 주문 / 상품, 주문 en at night, 주문 on a 360 x 640 phone',
    appShots.map((f) => path.basename(f, '.png').replace('ui6_phaser_app_', '')));
} catch (e) { problems.push('montage: ' + e.message); }
await browser.close();
await srv.close();
if (errors.length) problems.push(...errors.slice(0, 10).map((e) => 'page error: ' + e));
if (notFound.length) problems.push(...notFound.slice(0, 10).map((e) => 'http: ' + e));
out.problems = problems;
fs.writeFileSync(path.join(CACHE, 'ui6_phaser.json'), JSON.stringify(out, null, 1));
const brief = { fragmentsChecked: out.fragmentsChecked, clashes: clashes.length, frames: out.load.frames, anims: out.load.anims, playing: out.load.playing,
  nine: out.load.nine.length, audio: { ctxRate: out.load.audio.ctxRate, slices: Object.keys(out.load.audio.keys).length },
  phone: Object.fromEntries(Object.entries(out.phone).map(([k2, r]) => [k2, r.tabCss ? { tab: r.tabCss, close: r.closeCss, button: r.buttonCss, body: r.bodyCss, small: r.smallCss, minFont: r.minFontCss, toggleHit: r.toggleHitCss, panel: r.panelCss } : { bell: r.bellCss, chip: r.chipCss, toast: r.toastCss }])) };
console.log(JSON.stringify(brief, null, 1));
console.log(problems.length ? 'PROBLEMS\n  ' + problems.join('\n  ') : 'OK - 0 problems');
process.exit(problems.length ? 1 : 0);
