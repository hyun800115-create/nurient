// chief_fx + ui5 + audio7 (CONTRACT_V42 §AG / §AL / §AM) in headless Chromium with Phaser 3.90 - no game code.
//   node tools/test/chief_fx_phaser.mjs
// 0) STATIC: every key of the three new fragments (sprites, atlases, nineSlice, audio, audioGroups) against every other
//    assets/*/manifest.json - no clash with an existing key.
// 1) LOAD PAGE (1600 x 1900, DPR 1): loads assets/chief_fx + assets/ui5 next to existing sets (char_player, chief2
//    char_player_b, ui_icons, ui3_icons, ui4_icons, props_items, ground / road textures) the way src/core/Assets.js does
//    (atlas per manifest.atlases, anims 'spr:<key>:<anim>' like Assets.spriteAnims), checks every frame name of every
//    sprite exists with sourceSize = frameSize, the 9-slice panels are untrimmed and stretch, and plays every FX over
//    snow / cobble / plaza / dirt / night columns, ui5 icons next to ui / ui3 / ui4 icons at 64 / 48 / 32 px, panels at
//    several sizes. Audio: loads audio7_sprite.mp3 under '__sprite_audio7' and cuts it exactly like Assets.sliceSprite
//    (start, dur + 30 ms), checks every slice / group / amb_office (24.000 s) after Chromium's decode, plays them.
//    -> docs/previews/chief_fx_phaser_sheet.png
// 2) PHONE (390 x 844 CSS px at DPR 3, 720 logical px wide like main.js, k = 1.65) at camera zoom 0.6 / 1.0 / 1.2,
//    day and night (MULTIPLY #5A6AA8 x 0.45 at DEPTH.FX - 30), + 1.6 by day (CONTRACT_V42's max): four chiefs (real
//    char_player / char_player_b art) with
//    the aura exactly per src/entities/ChiefAura.js + the chief_fx manifest rules (ring width 70 x min(2, 1.2 / zoom),
//    rank-2 band at ring scale, glow x1.15 at 0.35 / 0.6, 6 motes, star pin 22 CSS px when zoom < 0.8 or >= 4 people
//    within 160 px, nav notch), a crowd of 20 villagers, a carried stack, the navigator (chevron 56 px ahead, dots every
//    48 px, target ring anim, badge with an item icon) on real snow / cobble / plaza ground, the edge badge + a chip in
//    the UI scene; measures the ring / pin size in CSS px.
//    -> docs/previews/chief_fx_phaser_z06_day.png ... _z12_night.png, _z16_day.png + chief_fx_phaser_phone.png (montage)
// 3) PHONE UI (zoom 1.0): ui5 office panel mock (chalk panel, tabs, status rows, chips, letter) over the village.
//    -> docs/previews/ui5_phaser_phone.png
// Exit 1 on missing frames / wrong sizes / trimmed panels / key clashes / audio slices / page errors / 404s / sizes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, sleep } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREV = path.join(ROOT, 'docs', 'previews');
const CACHE = path.join(os.tmpdir(), 'fv_cache', 'chief_fx');
fs.mkdirSync(PREV, { recursive: true });
fs.mkdirSync(CACHE, { recursive: true });
const NEW = ['chief_fx', 'ui5', 'audio7'];
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
for (const f of NEW) {
  for (const k of all[f] || []) {
    // a group key is the first variant's own key (Audio.play picks a variant): not a clash inside audio7
    for (const g of frags) if (g !== f && all[g] && all[g].has(k)) clashes.push(`${f} ${k} also in ${g}`);
  }
}
if (clashes.length) problems.push(...clashes.map((c) => 'clash: ' + c));

// ---------------------------------------------------------------- 1) load page
const LOAD_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#e9eff6}</style>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
const j = async (p) => (await fetch(p)).json();
const fx = await j('assets/chief_fx/manifest.json'), ui5 = await j('assets/ui5/manifest.json'), au = await j('assets/audio7/manifest.json');
const ui4 = await j('assets/fx_city/manifest.json'), ui3 = await j('assets/ui3/manifest.json'), ui = await j('assets/ui/manifest.json');
const props = await j('assets/props/manifest.json');
const H = window.__H = { ready: false, missing: [], sizeBad: [], trimmed: [], nine: [], anims: {}, frames: 0, audio: { keys: {} }, notes: [] };
const GROUNDS = [['snow', 'ground_snow'], ['cobble', 'road_cobble_wide'], ['plaza', 'ground_plaza'], ['dirt', 'ground_dirt'], ['night', 'ground_snow']];
class S extends Phaser.Scene {
  preload() {
    const L = this.load;
    for (const m of [fx, ui5, ui4, ui3, ui]) for (const a of m.atlases || []) L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const a of props.atlases) if (a.key === 'props_items') L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    L.atlas('char_player', 'assets/characters/char_player.png', 'assets/characters/char_player.json');
    L.atlas('char_player_b', 'assets/chief2/char_player_b.png', 'assets/chief2/char_player_b.json');
    for (const k of ['ground_snow', 'ground_plaza', 'ground_dirt']) L.image(k, 'assets/ground/' + k + '.png');
    L.image('road_cobble_wide', 'assets/roads/road_cobble_wide.png');
    L.audio('__sprite_audio7', ['assets/' + au.audioSprite.file]);
    L.audio('amb_office', ['assets/' + au.audio.amb_office.files[0]]);
  }
  create() {
    const tex = this.textures, anims = this.anims;
    // ---- frames + anims (Assets.spriteAnims)
    for (const m of [fx, ui5]) {
      for (const k in m.sprites) {
        const s = m.sprites[k];
        if (!tex.exists(s.atlas)) { H.missing.push('atlas:' + s.atlas); continue; }
        const t = tex.get(s.atlas);
        for (const f of s.frameNames || [s.frame]) {
          if (!t.has(f)) { H.missing.push(k + ':' + f); continue; }
          H.frames++;
          const fr = t.get(f);
          if (s.frameSize && (fr.realWidth !== s.frameSize[0] || fr.realHeight !== s.frameSize[1])) H.sizeBad.push(k + ':' + f + ' ' + fr.realWidth + 'x' + fr.realHeight);
        }
        for (const an in s.anims || {}) {
          const a = s.anims[an], frames = [];
          for (const f of a.frames) if (t.has(f)) frames.push({ key: s.atlas, frame: f });
          const key = 'spr:' + k + ':' + an;
          if (!anims.exists(key)) anims.create({ key, frames, frameRate: a.fps || 8, repeat: a.repeat !== undefined ? a.repeat : -1 });
          H.anims[key] = frames.length;
          if (frames.length !== s.frames) H.missing.push(key + ' has ' + frames.length + ' of ' + s.frames + ' frames');
        }
      }
    }
    for (const k in ui5.nineSlice) {
      const n = ui5.nineSlice[k], fr = tex.exists(n.atlas) && tex.get(n.atlas).has(n.frame) ? tex.get(n.atlas).get(n.frame) : null;
      if (!fr) { H.missing.push('nine:' + k); continue; }
      if (fr.trimmed || fr.width !== fr.realWidth || fr.height !== fr.realHeight) H.trimmed.push(k);
    }
    // ---- columns: 5 grounds x 300 px, rows of FX
    const X0 = 100, CW = 300;
    GROUNDS.forEach(([name, key], c) => {
      this.add.tileSprite(X0 + c * CW + CW / 2, 500, CW, 1000, key).setDepth(-1000);
      this.add.text(X0 + c * CW + 8, 6, name, { fontFamily: 'sans-serif', fontSize: '18px', color: '#1d2b44', backgroundColor: '#ffffffcc', padding: { x: 4, y: 2 } }).setDepth(2000);
    });
    this.add.rectangle(X0 + 4 * CW + CW / 2, 500, CW, 1000, 0x5a6aa8, 0.45).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(900);
    const rows = [['chief_halo', 80], ['chief_halo_gold', 190], ['rank2 + halo', 300], ['glow + chief + motes', 480], ['nav_chevron 0/4/8/12', 600], ['nav_dot 0/1', 660], ['nav_ring', 750], ['nav_badge / nav_edge', 900]];
    rows.forEach(([n, y]) => this.add.text(6, y - 10, n, { fontFamily: 'sans-serif', fontSize: '12px', color: '#1d2b44', wordWrap: { width: 90 } }));
    for (let c = 0; c < 5; c++) {
      const cx = X0 + c * CW + CW / 2, night = c === 4;
      this.add.sprite(cx, 80, 'chief_fx', 'chief_halo_0').play('spr:chief_halo:play');
      this.add.sprite(cx, 190, 'chief_fx', 'chief_halo_gold_0').play('spr:chief_halo_gold:play');
      this.add.image(cx, 300, 'chief_fx', 'chief_halo_rank2_0').setScale(0.95);
      this.add.sprite(cx, 300, 'chief_fx', 'chief_halo_0').setScale(0.95).play('spr:chief_halo:play');
      // chief over his glow, ring at his feet (scale 140 / 192 like zoom 0.6), motes, star pin above (world scale at zoom 0.6)
      const fy = 520, sc = 140 / 192;
      this.add.sprite(cx, fy + 2, 'chief_fx', 'chief_halo_0').setScale(sc).play('spr:chief_halo:play');
      this.add.sprite(cx, fy + 4, 'chief_fx', 'chief_glow_back_0').setOrigin(0.5, 0.82).setScale(1.15).setAlpha(night ? 0.6 : 0.35).play('spr:chief_glow_back:play');
      this.add.ellipse(cx, fy, 46, 18, 0x1d2b44, 0.18);
      this.add.image(cx, fy, 'char_player', 'idle_S_0').setOrigin(0.5, 0.8125);
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2, m = this.add.sprite(cx + Math.cos(a) * 140 * 0.46, fy + Math.sin(a) * 140 * 0.23, 'chief_fx', 'chief_sparkle_0').setScale(sc * 0.75).setDepth(Math.sin(a) > 0 ? 1 : -1);
        const again = () => this.time.delayedCall(150 + i * 170, () => m.play('spr:chief_sparkle:play'));
        m.on('animationcomplete', again); again();
      }
      this.add.sprite(cx, fy - 81 - 14, 'chief_fx', 'chief_marker_0').setOrigin(0.5, 1).setScale(0.6).setDepth(1000).play('spr:chief_marker:play');
      [0, 4, 8, 12].forEach((k, i) => this.add.image(cx - 105 + i * 70, 600, 'chief_fx', 'nav_chevron_' + String(k).padStart(2, '0')));
      for (let i = 0; i < 6; i++) this.add.image(cx - 110 + i * 44, 660, 'chief_fx', 'nav_dot_' + (i === 3 ? 1 : 0));
      this.add.sprite(cx, 750, 'chief_fx', 'nav_ring_0').play('spr:nav_ring:play');
      const bd = fx.sprites.nav_badge, ir = bd.iconRect;
      this.add.image(cx - 60, 960, 'chief_fx', 'nav_badge_0').setOrigin(0.5, 1).setDepth(1000);
      this.add.image(cx - 60 - bd.frameSize[0] / 2 + ir[0] + ir[2] / 2, 960 - bd.frameSize[1] + ir[1] + ir[3] / 2, 'props_items', 'item_fish_cooked').setScale(44 / 72).setDepth(1001);
      const ed = fx.sprites.nav_edge, er = ed.iconRect, rot = -0.6 + c * 0.5;
      this.add.image(cx + 75, 900, 'chief_fx', 'nav_edge_0').setRotation(rot).setScale(0.9).setDepth(1000);
      this.add.image(cx + 75 + (er[0] + er[2] / 2 - ed.frameSize[0] / 2) * 0.9, 900 + (er[1] + er[3] / 2 - ed.frameSize[1] / 2) * 0.9, 'ui5_icons', 'ui_icon_office').setScale(0.9 * 34 / 96).setDepth(1001);
    }
    // ---- ui5 icons next to the house style (ui / ui3 / ui4), at 64 / 48 / 32 px
    this.add.rectangle(800, 1450, 1600, 900, 0xf6efe2).setDepth(-1000);
    this.add.text(10, 1008, 'ui5 icons at 64 / 48 / 32 px, then ui / ui3 / ui4 icons (house style) - panels 9-sliced at several sizes', { fontFamily: 'sans-serif', fontSize: '16px', color: '#1d2b44' });
    const icons = Object.keys(ui5.sprites).filter((k) => ui5.sprites[k].kind === 'icon' && k.startsWith('ui_icon_'));
    [64, 48, 32].forEach((sz, r) => icons.forEach((k, i) => {
      const s = ui5.sprites[k];
      this.add.image(48 + i * 84, 1070 + r * 70, s.atlas, s.frame).setScale(sz / Math.max(s.frameSize[0], s.frameSize[1]));
    }));
    const others = [[ui, 'ui_icon_coin'], [ui, 'ui_icon_backpack'], [ui3, 'ui_icon_fame'], [ui3, 'ui_icon_delivery'], [ui3, 'ui_icon_calendar'], [ui4, 'ui_icon_passbook'], [ui4, 'ui_icon_newspaper'], [ui4, 'ui_icon_piggy']];
    others.forEach(([m, k], i) => { const s = m.sprites[k]; if (s && tex.exists(s.atlas)) this.add.image(48 + i * 84, 1280, s.atlas, s.frame).setScale(64 / Math.max(...(s.frameSize || [64, 64]))); else H.notes.push('no ' + k); });
    ['ui_status_0', 'ui_status_1', 'ui_status_2', 'ui_status_3'].forEach((f, i) => this.add.image(760 + i * 44, 1280, 'ui5_icons', f));
    const nine = (k, x, y, w, h) => {
      const n = ui5.nineSlice[k];
      const o = this.add.nineslice(x, y, n.atlas, n.frame, w, h, n.left, n.right, n.top, n.bottom).setOrigin(0, 0);
      H.nine.push({ k, w: Math.round(o.width), h: Math.round(o.height), want: [w, h] });
      return o;
    };
    nine('ui_letter', 20, 1330, 320, 400); nine('ui_letter', 360, 1330, 420, 520);
    nine('ui_chalk_panel', 800, 1330, 320, 240); nine('ui_chalk_panel', 800, 1590, 560, 280);
    nine('ui_office_tab', 1140, 1330, 160, 72); nine('ui_office_tab_on', 1310, 1330, 160, 72); nine('ui_office_tab', 1140, 1410, 220, 72);
    nine('ui_chip', 1140, 1500, 200, 64); nine('ui_chip', 1360, 1500, 230, 52);
    // ---- audio7: cut like Assets.sliceSprite, check every slice / group / the loop
    const ctx = this.sound.context, buf = this.cache.audio.get('__sprite_audio7');
    if (!buf || typeof buf.getChannelData !== 'function') H.missing.push('audio: sprite not decoded');
    else {
      const sr = buf.sampleRate, nch = buf.numberOfChannels;
      H.audio.sr = sr; H.audio.ctxRate = ctx.sampleRate; H.audio.spriteSec = +buf.duration.toFixed(4);
      for (const k in au.audioSprite.keys) {
        const [st, dur] = au.audioSprite.keys[k];
        const a = Math.max(0, Math.floor(st * sr)), n = Math.max(1, Math.min(buf.length - a, Math.ceil((dur + 0.03) * sr)));
        const out = ctx.createBuffer(nch, n, sr);
        for (let c = 0; c < nch; c++) out.getChannelData(c).set(buf.getChannelData(c).subarray(a, a + n));
        this.cache.audio.add(k, out);
        const d = out.getChannelData(0);
        let pk = 0, tail = 0, head = 0;
        const t30 = Math.floor(0.03 * sr), h5 = Math.floor(0.005 * sr);
        for (let i = 0; i < n; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; if (i >= n - t30 && v > tail) tail = v; if (i < h5 && v > head) head = v; }
        H.audio.keys[k] = { sec: +(n / sr).toFixed(4), peak: +pk.toFixed(3), tail30ms: +tail.toFixed(4), head5ms: +head.toFixed(4) };
      }
      this.cache.audio.remove('__sprite_audio7');
      for (const g in au.audioGroups) for (const k of au.audioGroups[g]) if (!this.cache.audio.exists(k)) H.missing.push('audio group ' + g + ': ' + k);
      for (const k in au.audioSprite.keys) { try { this.sound.add(k, { volume: au.audio[k].volume }).play(); } catch (e) { H.missing.push('play ' + k + ': ' + e); } }
      const amb = this.cache.audio.get('amb_office');
      if (!amb || typeof amb.getChannelData !== 'function') H.missing.push('audio: amb_office not decoded');
      else {
        H.audio.amb = { sec: +amb.duration.toFixed(5), len: amb.length, sr: amb.sampleRate };
        try { this.sound.add('amb_office', { loop: true, volume: au.audio.amb_office.volume }).play(); } catch (e) { H.missing.push('play amb_office: ' + e); }
      }
    }
    H.scene = this; H.ready = true;
  }
}
window.__H.game = new Phaser.Game({ type: Phaser.WEBGL, width: 1600, height: 1900, backgroundColor: '#e9eff6', render: { antialias: true }, scene: S, banner: false });
</script></body></html>`;

// ---------------------------------------------------------------- 2) phone pages
const PHONE = (ZOOM, NIGHT, UI) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:#dbe6f2;height:100%;overflow:hidden}#game{width:100%;height:100%}</style>
<script src="lib/phaser.min.js"></script></head><body><div id="game"></div><script type="module">
const j = async (p) => (await fetch(p)).json();
const fx = await j('assets/chief_fx/manifest.json'), ui5 = await j('assets/ui5/manifest.json');
const chars = await j('assets/characters/manifest.json'), c2 = await j('assets/chief2/manifest.json');
const vil = await j('assets/villagers/manifest.json'), props = await j('assets/props/manifest.json'), emo = await j('assets/emotes/manifest.json');
const W = 720, H = Math.max(1280, Math.min(1600, Math.round(720 * innerHeight / innerWidth)));
const k = Math.round(Math.max(1, Math.min(2, innerWidth * devicePixelRatio / 720)) * 20) / 20;
const ZOOM = ${ZOOM}, NIGHT = ${NIGHT ? 'true' : 'false'}, UI = ${UI ? 'true' : 'false'};
const R = window.__R = { ready: false, k, zoom: ZOOM, night: NIGHT, chiefs: [] };
const A = { ringPx: 70, fullZoom: 1.2, maxScale: 2, pinZoom: 0.8, crowdN: 4, crowdR: 160, glowDay: 0.35, glowNight: 0.6 };
const NAV = { dotEvery: 48, maxDots: 16, hideNear: 90 };
const DEPTH = { GROUND: -15000, GROUND_DECAL: -13500, PAD: -12000, SHADOW: -11000, FX: 31000, LABEL: 41000 };
const gdist = (ax, ay, bx, by) => Math.hypot(ax - bx, (ay - by) * 2);
const NPCS = ['npc_aunt', 'npc_uncle', 'npc_grandma', 'npc_grandpa', 'npc_kid_boy', 'npc_kid_girl', 'npc_teen_girl', 'npc_young_man', 'npc_merchant', 'npc_bard'];
const css = (worldPx) => worldPx * ZOOM * 390 / 720;
class S extends Phaser.Scene {
  constructor() { super('S'); }
  preload() {
    const L = this.load;
    for (const a of fx.atlases) L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const a of ui5.atlases) L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    L.atlas('char_player', 'assets/characters/char_player.png', 'assets/characters/char_player.json');
    L.atlas('char_player_b', 'assets/chief2/char_player_b.png', 'assets/chief2/char_player_b.json');
    for (const a of props.atlases) if (a.key === 'props_items') L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const a of vil.atlases) if (NPCS.map((n) => 'vil_' + n).includes(a.key)) L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const s of emo.spritesheets) if (s.key === 'fx_music_notes') L.spritesheet(s.key, 'assets/' + s.png, { frameWidth: s.frameWidth, frameHeight: s.frameHeight, endFrame: s.frameCount - 1 });
    for (const k of ['ground_snow', 'ground_plaza']) L.image(k, 'assets/ground/' + k + '.png');
    L.image('road_cobble_wide', 'assets/roads/road_cobble_wide.png');
  }
  create() {
    const anims = this.anims;
    for (const kk in fx.sprites) { const s = fx.sprites[kk]; for (const an in s.anims || {}) { const a = s.anims[an]; anims.create({ key: 'spr:' + kk + ':' + an, frames: a.frames.map((f) => ({ key: s.atlas, frame: f })), frameRate: a.fps, repeat: a.repeat }); } }
    const mn = emo.spritesheets.find((s) => s.key === 'fx_music_notes');
    if (mn) anims.create({ key: 'fx_music_notes', frames: anims.generateFrameNumbers('fx_music_notes', { start: 0, end: mn.frameCount - 1 }), frameRate: mn.fps, repeat: -1 });
    const cam = this.cameras.main; cam.setBackgroundColor('#dbe6f2');
    // ---- ground: snow everywhere, a cobble road along the iso axis, two plaza diamonds (masked tile sprites)
    this.add.tileSprite(0, 0, 4200, 5200, 'ground_snow').setDepth(DEPTH.GROUND);
    const masked = (key, pts, depth) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false }); g.fillStyle(0xffffff, 1); g.fillPoints(pts.map(([x, y]) => new Phaser.Geom.Point(x, y)), true);
      return this.add.tileSprite(0, 0, 4200, 5200, key).setDepth(depth).setMask(g.createGeometryMask());
    };
    masked('road_cobble_wide', [[-2100, -1170], [2100, 930], [2100, 1110], [-2100, -990]], DEPTH.GROUND + 1);
    const dia = (cx, cy, hw, hh) => [[cx - hw, cy], [cx, cy - hh], [cx + hw, cy], [cx, cy + hh]];
    masked('ground_plaza', dia(200, -350, 230, 115), DEPTH.GROUND + 2);
    masked('ground_plaza', dia(190, 480, 250, 125), DEPTH.GROUND + 2);
    // ---- characters
    const animFor = (atlas, def, anim, dir) => {
      const key = atlas + ':' + anim + ':' + dir;
      if (!anims.exists(key)) {
        const a = def.anims[anim];
        anims.create({ key, frames: Array.from({ length: a.frames }, (_, i) => ({ key: atlas, frame: def.frameName.replace('{anim}', anim).replace('{dir}', dir).replace('{i}', i) })), frameRate: a.fps, repeat: -1 });
      }
      return key;
    };
    const MIRROR = { SW: 'SE', W: 'E', NW: 'NE' };
    const body = (atlas, def, x, y, anim, dir) => {
      const rd = MIRROR[dir] && !(def.anims[anim].dirs || def.dirs).includes(dir) ? MIRROR[dir] : dir;
      const s = this.add.sprite(x, y, atlas, def.frameName.replace('{anim}', anim).replace('{dir}', rd).replace('{i}', 0)).setOrigin(0.5, 0.8125).setDepth(y).setFlipX(rd !== dir);
      s.play({ key: animFor(atlas, def, anim, rd), startFrame: Math.floor(Math.random() * def.anims[anim].frames) });
      this.add.ellipse(x, y, 46, 18, 0x1d2b44, 0.2).setDepth(DEPTH.SHADOW);
      return s;
    };
    const player = chars.characters.player, pb = Object.assign({}, c2.characters.player_b);
    const people = [];
    const chief = (x, y, opts) => {
      const def = opts.b ? pb : player, atlas = opts.b ? 'char_player_b' : 'char_player';
      const s = body(atlas, def, x, y, opts.anim || 'idle', opts.dir || 'S');
      const c = { x, y, s, headTop: -81, stackH: 0, o: opts, t: Math.random() * 4, pulseK: 0, pinA: 0 };
      if (opts.stack) {   // a carried tower of logs at the carry point (stackStep 13 x scale 0.65)
        const cp = player.carryPoint[opts.dir || 'S'], it = props.sprites[opts.stack], st = 0.65;
        for (let i = 0; i < opts.stackN; i++) this.add.image(x + cp[0], y + cp[1] - i * it.stackStep * st, it.atlas, it.frame).setOrigin(it.anchor[0], it.anchor[1]).setScale(st).setDepth(y + 0.1 + i * 0.01);
        c.stackH = opts.stackN * it.stackStep * st;
      }
      c.band = this.add.image(x, y, 'chief_fx', 'chief_halo_rank2_0').setDepth(DEPTH.PAD + 1.99).setVisible(!!opts.rank2);
      c.ring = this.add.sprite(x, y, 'chief_fx', 'chief_halo_0').setDepth(DEPTH.PAD + 2).play('spr:chief_halo:play');
      c.gold = this.add.sprite(x, y, 'chief_fx', 'chief_halo_gold_0').setDepth(DEPTH.PAD + 2.01).play('spr:chief_halo_gold:play').setAlpha(0);
      c.glow = this.add.sprite(x, y, 'chief_fx', 'chief_glow_back_0').setOrigin(0.5, 0.82).play('spr:chief_glow_back:play');
      c.motes = [];
      for (let i = 0; i < 6; i++) {
        const m = this.add.sprite(x, y, 'chief_fx', 'chief_sparkle_0').setAlpha(0);
        const again = () => this.time.delayedCall(100 + Math.random() * 700, () => m.play('spr:chief_sparkle:play'));
        m.on('animationcomplete', again); again(); c.motes.push(m);
      }
      c.pin = this.add.sprite(x, y, 'chief_fx', 'chief_marker_0').setOrigin(0.5, 1).setDepth(DEPTH.LABEL - 30).play('spr:chief_marker:play').setAlpha(0);
      c.notch = this.add.image(x, y, 'chief_fx', 'nav_chevron_00').setDepth(DEPTH.PAD + 2.02).setVisible(false);
      if (opts.working) {   // his work stroke: the gold ring pulses on the impact frame, a sparkle at the hit
        const ip = player.anims.chop.impactPoint[opts.dir || 'S'];
        s.on('animationupdate', (an, fr) => { if (fr.index === player.anims.chop.impactFrame + 1) { c.pulseK = 1; this.add.sprite(x + ip[0], y + ip[1] - 20, 'chief_fx', 'chief_sparkle_0').setDepth(y + 1).play('spr:chief_sparkle:play').once('animationcomplete', function () { this.destroy(); }); } });
      }
      if (opts.notes && mn) this.add.sprite(x + 18, y - 20, 'fx_music_notes', 0).setOrigin(mn.anchor[0], mn.anchor[1]).setDepth(y + 2).setScale(0.8).play('fx_music_notes');
      R.chiefs.push(c);
      return c;
    };
    // ring width (ChiefAura.ringWidth) and the per-frame aura update (ChiefAura.update, chief_fx rules)
    const ringWidth = () => A.ringPx * (ZOOM < A.fullZoom ? Math.min(A.maxScale, A.fullZoom / ZOOM) : 1);
    const update = (c, dt) => {
      c.t += dt;
      const w = ringWidth(), sc = w / 192, x = c.x, y = c.y + 2, gold = c.o.working ? 1 : 0;
      c.pulseK = Math.max(0, c.pulseK - dt * 3);
      const breath = 0.85 + Math.sin(c.t * (Math.PI * 2 / 2.4)) * 0.1;
      c.ring.setPosition(x, y).setScale(sc).setAlpha(breath * (1 - gold));
      c.gold.setPosition(x, y).setScale(sc * (1 + c.pulseK * 0.12)).setAlpha(gold * (0.8 + c.pulseK * 0.2));
      if (c.o.rank2) c.band.setPosition(x, y).setScale(sc);
      const ga = A.glowDay + (A.glowNight - A.glowDay) * (NIGHT ? 1 : 0);
      c.glow.setPosition(x, c.y + 4).setScale(1.15).setDepth(c.y - 0.5).setAlpha(ga * (0.85 + Math.sin(c.t * 1.7) * 0.15));
      const spin = (c.t / 6) * Math.PI * 2, rx = w * 0.46, ry = w * 0.23;
      c.motes.forEach((m, i) => {
        const ang = spin + (i / 6) * Math.PI * 2, tw = 0.5 + 0.5 * Math.sin(c.t * 3.1 + i * 1.7);
        m.setPosition(x + Math.cos(ang) * rx, y + Math.sin(ang) * ry - 2 - tw * 4).setDepth(Math.sin(ang) > 0 ? c.y + 1 : c.y - 1).setAlpha(0.35 + tw * 0.55).setScale(sc * (0.55 + tw * 0.4) * 0.8);
      });
      if (c.o.notch !== undefined) {
        const kk = Math.round(((c.o.notch % (Math.PI * 2)) + Math.PI * 2) / (Math.PI / 8)) % 16;
        c.notch.setVisible(true).setFrame('nav_chevron_' + String(kk).padStart(2, '0')).setPosition(x + Math.cos(c.o.notch) * rx * 1.05, y + Math.sin(c.o.notch) * ry * 1.05).setScale(sc * 1.6).setAlpha(0.9);
      }
      let n = 0; for (const q of people) if (gdist(q.x, q.y, c.x, c.y) < A.crowdR) n++;
      c.crowd = n;
      const want = ZOOM < A.pinZoom || n >= A.crowdN || !!c.o.observe;
      c.pinA = want ? 1 : 0;
      let top = c.y + c.headTop - 14; if (c.stackH) top -= c.stackH + 26;
      c.pin.setPosition(x, top + Math.sin(c.t * 3) * 2).setScale((22 / (ZOOM * 390 / 720)) / 72).setAlpha(c.pinA);
    };
    // ---- the scene: a chief in a crowd on the cobble road, one working (gold) on snow, one at 읍 cheering on the
    //      plaza, one carrying logs along the navigator's route to a plaza target
    const C1 = chief(0, -60, {});
    const C2 = chief(-190, -360, { anim: 'chop', dir: 'SE', working: true });
    const C3 = chief(200, -360, { b: true, anim: 'cheer', dir: 'S', rank2: true, notes: true });
    const T = { x: 190, y: 500 }, P0 = { x: -200, y: 250 }, mid = { x: -30, y: 365 };
    const C4 = chief(P0.x, P0.y, { anim: 'carry_walk', dir: 'SE', stack: 'item_log', stackN: 3, notch: Math.atan2(mid.y - P0.y, mid.x - P0.x) });
    // a crowd of 20 villagers around the first chief (between 40 and 230 px)
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const DIRS = ['S', 'SE', 'E', 'SW', 'W', 'NE', 'NW', 'N'];
    for (let i = 0; i < 20; i++) {
      let x, y, tries = 0;
      do { const a = rnd() * Math.PI * 2, r = 55 + rnd() * 175; x = Math.cos(a) * r; y = -60 + Math.sin(a) * r * 0.5; tries++; }
      while (tries < 40 && people.some((q) => gdist(q.x, q.y, x, y) < 48));
      const name = NPCS[i % NPCS.length], def = vil.characters[name], dir = DIRS[Math.floor(rnd() * 8)];
      const anim = i % 3 ? 'idle' : 'walk';
      const okDir = (def.anims[anim].dirs || def.dirs).includes(dir) || MIRROR[dir];
      body(def.atlas, def, x, y, anim, okDir ? dir : 'S');
      people.push({ x, y });
    }
    // ---- the navigator (Navigator.draw): chevron 56 px ahead, dots every 48 px (not within 90 px of him nor 40 of
    //      the place), a light wave running to the target every 1.2 s, the target ring anim, the badge 90 px above
    const route = [mid, T];
    const ang = Math.atan2(mid.y - P0.y, mid.x - P0.x), kc = (Math.round(ang / (Math.PI / 8)) + 16) % 16;
    R.chevronFrame = kc;
    const chev = this.add.image(P0.x + Math.cos(ang) * 56, P0.y + Math.sin(ang) * 56 * 0.5 + 4, 'chief_fx', 'nav_chevron_' + String(kc).padStart(2, '0')).setDepth(DEPTH.PAD + 3);
    const dots = [];
    let s = NAV.dotEvery, px = P0.x, py = P0.y, along = 0;
    const total = route.reduce((acc, q, i) => acc + Math.hypot(q.x - (i ? route[i - 1].x : P0.x), q.y - (i ? route[i - 1].y : P0.y)), 0);
    for (const q of route) {
      const L = Math.hypot(q.x - px, q.y - py);
      while (s <= along + L && dots.length < NAV.maxDots) {
        const f = (s - along) / L, x = px + (q.x - px) * f, y = py + (q.y - py) * f;
        if (gdist(x, y, P0.x, P0.y) > NAV.hideNear && gdist(x, y, T.x, T.y) > 40) dots.push({ s, img: this.add.image(x, y, 'chief_fx', 'nav_dot_0').setDepth(DEPTH.PAD + 3) });
        s += NAV.dotEvery;
      }
      along += L; px = q.x; py = q.y;
    }
    R.dots = dots.length;
    this.add.sprite(T.x, T.y, 'chief_fx', 'nav_ring_0').setDepth(DEPTH.PAD + 3).play('spr:nav_ring:play');
    const bd = fx.sprites.nav_badge, ir = bd.iconRect;
    const badge = this.add.container(T.x, T.y - 90).setDepth(DEPTH.LABEL - 40);
    badge.add(this.add.image(0, 0, 'chief_fx', 'nav_badge_0').setOrigin(0.5, 1));
    const fish = props.sprites.item_fish_cooked;
    badge.add(this.add.image(-bd.frameSize[0] / 2 + ir[0] + ir[2] / 2, -bd.frameSize[1] + ir[1] + ir[3] / 2, fish.atlas, fish.frame).setScale(44 / 72));
    badge.add(this.add.text(0, 6, '생선구이', { fontFamily: 'sans-serif', fontSize: '19px', fontStyle: '800', color: '#1f5f66', stroke: '#ffffff', strokeThickness: 5, resolution: 2 }).setOrigin(0.5, 0));
    let wave = 0;
    // ---- night: the DayClock overlay (MULTIPLY #5A6AA8 x 0.45 at DEPTH.FX - 30); the pin and the badge are above it
    if (NIGHT) this.add.rectangle(0, 0, 6000, 7000, 0x5a6aa8, 0.45).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(DEPTH.FX - 30);
    this.events.on('update', (time, delta) => {
      const dt = Math.min(0.05, delta / 1000);
      for (const c of R.chiefs) update(c, dt);
      wave = (wave + dt / 1.2) % 1;
      for (const d of dots) { const w = Math.abs(((d.s / total) - wave + 1) % 1), lit = w < 0.12; d.img.setFrame(lit ? 'nav_dot_1' : 'nav_dot_0').setAlpha(lit ? 1 : 0.8); }
      chev.setAlpha(0.85 + Math.sin(time / 180) * 0.15);
      badge.y = T.y - 90 + Math.sin(time / 300) * 3;
    });
    for (const c of R.chiefs) update(c, 0.016);
    cam.setZoom(ZOOM * k); cam.centerOn(0, 60);
    // ---- measurements (CSS px on the 390 px phone)
    const w = ringWidth();
    R.ringWorld = w; R.ringCss = +css(w).toFixed(2); R.ringTubeCss = +css(w * 184 / 192).toFixed(2);
    R.pinCss = +css(72 * (22 / (ZOOM * 390 / 720)) / 72).toFixed(2);
    R.badgeCss = +css(bd.frameSize[0]).toFixed(1); R.chevCss = +css(64).toFixed(1); R.dotCss = +css(28).toFixed(1); R.targetRingCss = +css(160).toFixed(1);
    this.scene.launch('U');
    R.ready = true;
  }
}
// the UI scene: logical 720 x H at k (like the game's UI), a chip with a status dot, the screen-edge badge
class U extends Phaser.Scene {
  constructor() { super('U'); }
  create() {
    const cam = this.cameras.main; cam.setOrigin(0, 0).setZoom(k);
    const t = (x, y, s, size, col = '#1d2b44') => this.add.text(x, y, s, { fontFamily: 'sans-serif', fontSize: size + 'px', fontStyle: '800', color: col, stroke: '#ffffff', strokeThickness: 4, resolution: 2 });
    this.add.rectangle(0, 0, 720, 66, 0xffffff, 0.82).setOrigin(0, 0);
    t(16, 10, 'chief_fx · zoom ' + ZOOM.toFixed(1) + ' · ' + (NIGHT ? '밤 night' : '낮 day') + (UI ? ' · ui5' : ''), 26);
    t(16, 40, '390 x 844 CSS @3x · ring ' + R.ringCss + ' CSS px · pin ' + R.pinCss + ' CSS px', 17, '#4b5873');
    const chip = ui5.nineSlice.ui_chip;
    this.add.nineslice(16, 84, chip.atlas, chip.frame, 286, 56, chip.left, chip.right, chip.top, chip.bottom).setOrigin(0, 0);
    this.add.image(16 + 36, 84 + 28, 'ui5_icons', 'ui_status_0').setScale(0.9);
    this.add.image(16 + 72, 84 + 28, 'ui5_icons', 'ui_icon_route').setScale(34 / 96);
    t(16 + 94, 84 + 14, '생선구이 · 120 m', 19, '#1f5f66');
    // the edge badge: rotated toward an off-screen place to the lower right, the icon upright at its centre
    const ed = fx.sprites.nav_edge, rot = Math.atan2(1, 1.6);
    const ex = 720 - 60, ey = R.H = Math.round(this.scale.height / k * 0.62);
    this.add.image(ex, ey, 'chief_fx', 'nav_edge_0').setRotation(rot).setScale(0.9);
    this.add.image(ex, ey, 'ui5_icons', 'ui_icon_office').setScale(0.9 * 34 / 96);
    t(ex, ey + 44, '120 m', 18, '#1f5f66').setOrigin(0.5, 0);
    if (UI) this.officeMock();
  }
  // a mock of the 사무실 panel (OfficePanel) built only from ui5 pieces + ui_panel: tabs, chalk board with status rows,
  // icon row, the letter
  officeMock() {
    const n = (key, x, y, w, h) => { const s = ui5.nineSlice[key]; return this.add.nineslice(x, y, s.atlas, s.frame, w, h, s.left, s.right, s.top, s.bottom).setOrigin(0, 0); };
    const t = (x, y, s, size, col = '#1d2b44', stroke = true) => this.add.text(x, y, s, { fontFamily: 'sans-serif', fontSize: size + 'px', fontStyle: '800', color: col, stroke: stroke ? '#ffffff' : undefined, strokeThickness: stroke ? 3 : 0, resolution: 2 });
    const Y = 300;
    this.add.rectangle(0, 0, 720, 3000, 0x1d2b44, 0.35).setOrigin(0, 0);
    const tabs = [['ui_icon_office', '사무실', true], ['ui_icon_staff', '직원', false], ['ui_icon_bank', '은행', false], ['ui_icon_news', '소식', false]];
    tabs.forEach(([ic, label, on], i) => {
      n(on ? 'ui_office_tab_on' : 'ui_office_tab', 40 + i * 162, Y, 158, 72);
      this.add.image(40 + i * 162 + 40, Y + 38, 'ui5_icons', ic).setScale(40 / 96);
      t(40 + i * 162 + 66, Y + 24, label, 22, on ? '#1f5f66' : '#4b5873');
    });
    n('ui_chalk_panel', 40, Y + 66, 640, 420);
    const rows = [['ui_status_0', '생선구이', '부족'], ['ui_status_1', '통나무', '길 막힘'], ['ui_status_2', '빵', '남음'], ['ui_status_3', '통조림', '적당']];
    rows.forEach(([d, item, st], i) => {
      this.add.image(100, Y + 140 + i * 74, 'ui5_icons', d);
      t(130, Y + 124 + i * 74, item, 26, '#f4f1e6', false);
      t(470, Y + 124 + i * 74, st, 26, '#ffe9a0', false);
    });
    const icons = ['ui_icon_binoculars', 'ui_icon_hand', 'ui_icon_letter', 'ui_icon_inventory', 'ui_icon_halo', 'ui_icon_cheer', 'ui_icon_depot', 'ui_icon_sleigh', 'ui_icon_coach', 'ui_icon_boxcar', 'ui_icon_flatcar', 'ui_icon_play_tab', 'ui_icon_new'];
    icons.forEach((ic, i) => this.add.image(70 + (i % 7) * 96, Y + 540 + Math.floor(i / 7) * 86, 'ui5_icons', ic).setScale(i < 7 ? 64 / 96 : 48 / 96));
    n('ui_letter', 120, Y + 720, 480, 360);
    t(120 + 44, Y + 720 + 76, '촌장님께', 28, '#5a3b22', false);
    t(120 + 44, Y + 720 + 122, '눈꽃마을 사무실이 문을 열었어요.\\n편지와 소식은 여기로 와요.', 22, '#5a3b22', false);
    this.add.image(120 + 480 - 70, Y + 720 + 300, 'ui5_icons', 'ui_icon_new').setScale(0.8);
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
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  watch(page);
  await page.route('**/fv/__chieffx_load.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: LOAD_HTML }));
  await page.goto(srv.url + '__chieffx_load.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__H && window.__H.ready, null, { timeout: 240000 });
  await sleep(1500);
  const res = await page.evaluate(() => {
    const H = window.__H, sc = H.scene;
    const playing = sc.children.list.filter((o) => o.anims && o.anims.isPlaying).length;
    return { frames: H.frames, anims: H.anims, missing: H.missing, sizeBad: H.sizeBad, trimmedPanels: H.trimmed, nine: H.nine, audio: H.audio, notes: H.notes, playing,
      textures: Object.keys(sc.textures.list).length };
  });
  await page.evaluate(() => window.__H.game.loop.sleep());
  await page.screenshot({ path: path.join(PREV, 'chief_fx_phaser_sheet.png'), timeout: 180000 });
  await ctx.close();
  out.load = res;
  if (res.missing.length) problems.push(...res.missing.map((m) => 'missing: ' + m));
  if (res.sizeBad.length) problems.push(...res.sizeBad.map((m) => 'sourceSize != frameSize: ' + m));
  if (res.trimmedPanels.length) problems.push('trimmed 9-slice panels: ' + res.trimmedPanels.join(', '));
  for (const n of res.nine) if (Math.abs(n.w - n.want[0]) > 0.5 || Math.abs(n.h - n.want[1]) > 0.5) problems.push(`nineslice ${n.k} ${n.w}x${n.h} != ${n.want}`);
  const au = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'audio7', 'manifest.json'), 'utf8'));
  for (const [k, [, dur]] of Object.entries(au.audioSprite.keys)) {
    const a = res.audio.keys[k];
    if (!a) { problems.push('audio slice missing: ' + k); continue; }
    if (Math.abs(a.sec - (dur + 0.03)) > 0.002) problems.push(`audio ${k}: slice ${a.sec} s != ${dur} + 0.03`);
    if (a.peak < 0.05) problems.push(`audio ${k}: slice is silent (peak ${a.peak})`);
    if (a.tail30ms > 0.02) problems.push(`audio ${k}: the 30 ms tail after the slice is not silent (${a.tail30ms}) - wrong offset?`);
  }
  if (!res.audio.amb || Math.abs(res.audio.amb.sec - au.audio.amb_office.duration) > 0.001) problems.push('amb_office decoded ' + JSON.stringify(res.audio.amb) + ' != ' + au.audio.amb_office.duration + ' s');
}
// 2) phone pages
const shots = [];
const phone = async (z, night, ui, name) => {
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const pp = await pctx.newPage();
  watch(pp);
  const html = '__chieffx_' + name + '.html';
  await pp.route('**/fv/' + html, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: PHONE(z, night, ui) }));
  await pp.goto(srv.url + html, { waitUntil: 'load' });
  await pp.waitForFunction(() => window.__R && window.__R.ready, null, { timeout: 240000 });
  await sleep(2200);
  const r = await pp.evaluate(() => {
    const R = window.__R;
    return { k: R.k, ringWorld: R.ringWorld, ringCss: R.ringCss, ringTubeCss: R.ringTubeCss, pinCss: R.pinCss, badgeCss: R.badgeCss, chevCss: R.chevCss, dotCss: R.dotCss,
      targetRingCss: R.targetRingCss, chevronFrame: R.chevronFrame, dots: R.dots,
      chiefs: R.chiefs.map((c) => ({ crowd: c.crowd, pin: c.pinA, ring: c.ring.texture.key + ':' + c.ring.frame.name, ringScale: +c.ring.scaleX.toFixed(3), band: c.band.visible, gold: +c.gold.alpha.toFixed(2) })) };
  });
  const file = path.join(PREV, name + '.png');
  await pp.evaluate(() => window.__R.game.loop.sleep());
  await pp.screenshot({ path: file, timeout: 180000 });
  await pctx.close();
  shots.push(file);
  return r;
};
out.phone = {};
for (const z of [0.6, 1.0, 1.2, 1.6]) {
  for (const night of (z > 1.2 ? [false] : [false, true])) {
    const name = 'chief_fx_phaser_z' + String(z.toFixed(1)).replace('.', '') + (night ? '_night' : '_day');
    const r = await phone(z, night, false, name);
    out.phone[name] = r;
    const wantRing = 70 * (z < 1.2 ? Math.min(2, 1.2 / z) : 1) * z * 390 / 720;   // 45.5 CSS px up to fullZoom 1.2
    if (Math.abs(r.ringCss - wantRing) > 0.6) problems.push(`${name}: ring ${r.ringCss} CSS px (want ${wantRing.toFixed(1)})`);
    if (Math.abs(r.pinCss - 22) > 0.3) problems.push(`${name}: pin ${r.pinCss} CSS px (want 22)`);
    const pins = r.chiefs.map((c) => c.pin);
    const want = z < 0.8 ? [1, 1, 1, 1] : [1, 0, 0, 0];
    if (pins.join() !== want.join()) problems.push(`${name}: pins ${pins} (want ${want}: zoom < 0.8 or the crowd chief)`);
    if (r.chiefs[0].crowd < 4) problems.push(`${name}: crowd ${r.chiefs[0].crowd} < 4`);
    if (!r.chiefs[2].band) problems.push(`${name}: rank-2 band hidden`);
    if (r.dots < 5) problems.push(`${name}: only ${r.dots} route dots`);
  }
}
out.ui = await phone(1.0, false, true, 'ui5_phaser_phone');
// labelled montage of the six phone shots (1/3 size = the phone's CSS size)
try {
  const py = `
import sys
from PIL import Image, ImageDraw, ImageFont
files = sys.argv[2:]
ims = [Image.open(f).convert('RGB') for f in files]
w, h = ims[0].size[0] // 3, ims[0].size[1] // 3
pad, head = 12, 54
out = Image.new('RGB', (pad + 3 * (w + pad), head + 2 * (h + pad)), (236, 241, 247))
d = ImageDraw.Draw(out)
try:
    f = ImageFont.truetype('${path.join(ROOT, 'tools', 'fonts', 'Pretendard-ExtraBold.ttf')}', 22)
except Exception:
    f = ImageFont.load_default()
d.text((pad, 14), 'chief_fx in Phaser 3.90, 390 x 844 phone @3x at CSS size: zoom 0.6 / 1.0 / 1.2, day / night', font=f, fill=(30, 40, 60))
for i, im in enumerate(ims):
    z, n = i // 2, i % 2
    out.paste(im.resize((w, h), Image.LANCZOS), (pad + z * (w + pad), head + n * (h + pad)))
out.save(sys.argv[1])
`;
  execFileSync('python3', ['-c', py, path.join(PREV, 'chief_fx_phaser_phone.png'), ...shots.slice(0, 6)], { stdio: 'inherit' });
} catch (e) { problems.push('montage: ' + e.message); }
await browser.close();
await srv.close();
if (errors.length) problems.push(...errors.slice(0, 10).map((e) => 'page error: ' + e));
if (notFound.length) problems.push(...notFound.slice(0, 10).map((e) => 'http: ' + e));
out.problems = problems;
fs.writeFileSync(path.join(CACHE, 'chief_fx_phaser.json'), JSON.stringify(out, null, 1));
const brief = { fragmentsChecked: out.fragmentsChecked, clashes: clashes.length, frames: out.load.frames, anims: Object.keys(out.load.anims).length, playing: out.load.playing,
  nine: out.load.nine.length, audio: { sr: out.load.audio.sr, ctxRate: out.load.audio.ctxRate, slices: Object.keys(out.load.audio.keys).length, amb: out.load.audio.amb },
  phone: Object.fromEntries(Object.entries(out.phone).map(([k, r]) => [k, { ring: r.ringCss, pin: r.pinCss, pins: r.chiefs.map((c) => c.pin).join(''), crowd: r.chiefs[0].crowd, chev: r.chevronFrame, dots: r.dots }])) };
console.log(JSON.stringify(brief, null, 1));
console.log(problems.length ? 'PROBLEMS\n  ' + problems.join('\n  ') : 'OK - 0 problems');
process.exit(problems.length ? 1 : 0);
