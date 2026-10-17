// 금방 art set (assets/geumbang, CONTRACT_GEUMBANG section AO) in headless Chromium with Phaser 3.90 - no game code.
//   node tools/test/geumbang_phaser.mjs            (run under `nice -n 10`; one browser at a time)
// Loads assets/geumbang/manifest.json + both pages NEXT TO the existing sets it builds on (assets/logistics: the
// centre + delivery_van_red; assets/vehicles: dog_sled + a town car; ground / road textures), checks that every
// frame, anim, dir, overlay and patch the manifest names exists, registers the anims, and builds a phone-sized scene
// the documented way:
//   * the logistics centre with gb_nameplate_ko INSTEAD of the baked nameplate, the swaying gb_banner, dock 1 rolling
//     up and a gb_van backed into bay 1 playing `unload` as a PATCH over idle_SE_0 (+ the red van for comparison);
//   * a gb_van driving a loop through all 8 headings: SE / NE / NW / SW legs (SW, NW = flipX) with the S / E / N / W
//     corner frames for 0.3 s at each corner, the roof sign riding roofSignPoint + bobPx (never flipped);
//   * a gb_van at a kerb playing `door` (patch) in NE, gb_sign, gb_flag (wave), both lockers (open patch),
//     doorstep parcels (fresh / snowy), the open parcel, the cat, s / m / l parcels, the dog sled with its pennant
//     at sledPennant[dir][anim][frame] - on snow, cobble and dirt;
//   * night = the game's MULTIPLY tint (DayClock: 0x5a6aa8 at darkness 0.45) + ADD glows, lit roof signs, the sign and
//     locker lit PATCHES.
// Phone 390 x 844 CSS at DPR 3 (canvas = 720 logical px x View.k, camera zoom = z x View.k, as src/main.js) at
// zoom 0.6 / 1.0 / 1.2 / 1.6, day + night, and 360 x 640 at DPR 2 (zoom 1.0, day).  Measures the van mark and the
// roof sign in CSS px at zoom 0.6.  Writes docs/previews/gb_phaser_390_day_night.png, gb_phaser_360.png and
// $GB_OUT/geumbang_phaser.json.  Exit 1 on missing frames, page errors or 404s.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.env.GB_OUT || '/tmp/fv_cache/geumbang';
fs.mkdirSync(OUT, { recursive: true });

const HTML = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<style>html,body{margin:0;height:100%;background:#dbe6f2;overflow:hidden}#game{width:100%;height:100%}</style>
<script src="lib/phaser.min.js"></script></head><body><div id="game"></div><script type="module">
const GB = await (await fetch('assets/geumbang/manifest.json')).json();
const LG = await (await fetch('assets/logistics/manifest.json')).json();
const VH = await (await fetch('assets/vehicles/manifest.json')).json();
const G = window.__G = { ready: false, missing: [], anims: 0, frames: 0, errors: [] };
const W = 720;
const iw = window.innerWidth, ih = window.innerHeight, dpr = window.devicePixelRatio || 1;
const H = Math.max(1280, Math.min(1600, Math.round(W * ih / iw)));
const cssW = Math.min(iw, ih * W / H);
const K = Math.round(Math.max(1, Math.min(2, cssW * dpr / W)) * 20) / 20;
G.view = { W, H, K, cssW, dpr };
const DUSK = { color: 0x5a6aa8, a: 0.45 };
class S extends Phaser.Scene {
  preload() {
    for (const a of GB.atlases) this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const k of ['lgx_center_a', 'lgx_center_c', 'lgx_center_d', 'lgx_delivery_van_red', 'lgx_items']) {
      const a = LG.atlases.find((x) => x.key === k); this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    }
    for (const k of ['veh_dog_sled', 'veh_car_a_red']) {
      const a = VH.atlases.find((x) => x.key === k); this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    }
    this.load.image('g_snow', 'assets/ground/ground_snow.png');
    this.load.image('g_cobble', 'assets/roads/road_cobble_wide.png');
    this.load.image('g_dirt', 'assets/roads/road_dirt.png');
  }
  create() {
    const tex = this.textures, gs = GB.sprites, gc = GB.characters;
    const has = (a, f) => tex.exists(a) && tex.get(a).has(f);
    const need = (a, f, why) => { G.frames++; if (!has(a, f)) G.missing.push(why + ':' + f); };
    // ---------------------------------------------------------------- frame checks + anims
    const van = gc.gb_van, turn = gc.gb_van_turn;
    for (const [an, a] of Object.entries(van.anims)) for (const d of van.dirs) {
      const names = []; for (let i = 0; i < a.frames; i++) names.push(an + '_' + d + '_' + i);
      for (const n of names) { need('gb_van_0', n, 'gb_van'); if (!a.patch) need('gb_van_0', 'over_' + n, 'gb_van'); }
      this.anims.create({ key: 'gbv:' + an + ':' + d, frames: names.filter((n) => has('gb_van_0', n)).map((n) => ({ key: 'gb_van_0', frame: n })), frameRate: a.fps, repeat: a.repeat });
      G.anims++;
    }
    for (const d of turn.dirs) { need('gb_van_0', 'turn_' + d + '_0', 'turn'); need('gb_van_0', 'over_turn_' + d + '_0', 'turn'); }
    for (const [k, s] of Object.entries(gs)) {
      if (s.frameName) {
        for (const d of s.dirs) for (let i = 0; i < s.anims.flutter.frames; i++) need(s.atlas, s.frameName.replace('{dir}', d).replace('{i}', i), k);
        for (const d of s.dirs) { this.anims.create({ key: 'spr:' + k + ':' + d, frames: [0, 1, 2, 3].map((i) => ({ key: s.atlas, frame: 'gb_pennant_' + d + '_' + i })), frameRate: s.anims.flutter.fps, repeat: -1 }); G.anims++; }
        continue;
      }
      need(s.atlas, s.frame, k);
      for (const [an, a] of Object.entries(s.anims || {})) {
        for (const f of a.frames) need(s.atlas, f, k + '.' + an);
        this.anims.create({ key: 'spr:' + k + ':' + an, frames: a.frames.filter((f) => has(s.atlas, f)).map((f) => ({ key: s.atlas, frame: f })), frameRate: a.fps, repeat: a.repeat, repeatDelay: a.repeatDelay || 0 });
        G.anims++;
      }
    }
    for (const c of ['lgx_center_a', 'lgx_center_c', 'lgx_center_d']) if (!tex.exists(c)) G.missing.push('atlas ' + c);
    const ds = VH.characters.dog_sled;
    for (const an of ['idle', 'move']) for (const d of ['SE', 'NE']) {
      this.anims.create({ key: 'sled:' + an + ':' + d, frames: Array.from({ length: ds.anims[an].frames }, (_, i) => ({ key: ds.atlas, frame: an + '_' + d + '_' + i })), frameRate: ds.anims[an].fps, repeat: -1 });
    }
    const red = LG.characters.delivery_van_red;
    // ---------------------------------------------------------------- helpers
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x262e52, 1); g.fillEllipse(64, 32, 128, 64); g.generateTexture('fv_shadow', 128, 64); g.destroy();
    const c = document.createElement('canvas'); c.width = c.height = 128; const cx = c.getContext('2d');
    const rg = cx.createRadialGradient(64, 64, 2, 64, 64, 64); rg.addColorStop(0, 'rgba(255,214,140,1)'); rg.addColorStop(0.4, 'rgba(255,190,110,0.45)'); rg.addColorStop(1, 'rgba(255,170,90,0)');
    cx.fillStyle = rg; cx.fillRect(0, 0, 128, 128); tex.addCanvas('fv_glow', c);
    const base = (d) => (d === 'SW' ? 'SE' : d === 'NW' ? 'NE' : d);
    const flipOf = (d) => d === 'SW' || d === 'NW' || d === 'W';
    const glows = []; const lit = []; G.lit = false;
    const glowAt = (fn, k) => { const im = this.add.image(0, 0, 'fv_glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(1e6 + 1).setVisible(false).setScale(k); glows.push({ im, fn }); };
    // ---------------------------------------------------------------- ground
    this.add.tileSprite(0, 0, 4000, 3200, 'g_snow').setOrigin(0, 0).setDepth(-1e6);
    this.add.tileSprite(0, 1800, 4000, 520, 'g_cobble').setOrigin(0, 0).setDepth(-1e6 + 1);
    this.add.tileSprite(2300, 2320, 1700, 600, 'g_dirt').setOrigin(0, 0).setDepth(-1e6 + 1);
    this.add.tileSprite(0, 2440, 1100, 260, 'g_dirt').setOrigin(0, 0).setDepth(-1e6 + 1);   // the sled crosses dirt -> snow
    // ---------------------------------------------------------------- the centre (manifest rules) + 금방 layers
    const C = LG.sprites.logistics_center, ox = 1300, oy = 1200;
    const lgxFrame = (k) => { const s = LG.sprites[k]; return [s.atlas, s.frame]; };
    const lay = (key, d) => { const [a, f] = lgxFrame(key); return this.add.image(ox, oy, a, f).setOrigin(C.anchor[0], C.anchor[1]).setDepth(oy - 600 + d); };
    lay(C.layers.apron, -0.45); const shell = lay(C.layers.shell, 0);
    const plate = this.add.image(ox, oy, 'gb_bld_0', gs.gb_nameplate_ko.frame).setOrigin(C.anchor[0], C.anchor[1]).setDepth(oy - 600 + gs.gb_nameplate_ko.depthOffset);
    const d1 = this.add.sprite(ox, oy, 'lgx_center_a', 'logistics_center_dock1_0').setOrigin(C.anchor[0], C.anchor[1]).setDepth(oy - 600 + 0.001);
    const d1anim = LG.sprites.logistics_center_dock1.anims.dock_door;
    this.anims.create({ key: 'dock1', frames: d1anim.frames.map((f) => ({ key: 'lgx_center_a', frame: f })), frameRate: d1anim.fps, repeat: 0 });
    d1.play('dock1');
    lay(C.patches.dock2, 0.001); lay(C.layers.props, 0.01);
    const banner = this.add.sprite(ox, oy, 'gb_bld_0', gs.gb_banner_ko.frame).setOrigin(C.anchor[0], C.anchor[1]).setDepth(oy - 600 + gs.gb_banner_ko.depthOffset).play('spr:gb_banner_ko:sway');
    G.hub = { plate: plate.frame.name, banner: banner.anims.isPlaying };
    for (const op of C.outdoorProps) { const s = LG.sprites[op.sprite]; this.add.image(ox + op.point[0], oy + op.point[1], s.atlas, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(oy + op.point[1]); }
    // ---------------------------------------------------------------- vans
    const makeVan = (lang) => {
      const o = {};
      o.sh = this.add.image(0, 0, 'fv_shadow').setAlpha(0.32);
      o.body = this.add.sprite(0, 0, 'gb_van_0', 'idle_SE_0').setOrigin(van.anchor[0], van.anchor[1]);
      o.over = this.add.image(0, 0, 'gb_van_0', 'over_idle_SE_0').setOrigin(van.anchor[0], van.anchor[1]);
      o.patch = this.add.sprite(0, 0, 'gb_van_0', 'door_SE_0').setVisible(false);
      o.sign = this.add.image(0, 0, 'gb_van_0', 'gb_roofsign_' + lang + '_0').setOrigin(0.5, 1);
      o.lang = lang; o.dir = 'SE'; o.anim = 'idle'; o.turn = null;
      o.place = (x, y) => {
        o.x = x; o.y = y;
        const tdir = o.turn, d = tdir || o.dir, rd = tdir ? (tdir === 'W' ? 'E' : tdir) : base(d), fl = flipOf(d);
        const ent = tdir ? turn : van;
        if (tdir) { o.body.anims.stop(); o.body.setFrame('turn_' + rd + '_0'); o.body.setOrigin(turn.anchor[0], turn.anchor[1]); o.over.setFrame('over_turn_' + rd + '_0').setOrigin(turn.anchor[0], turn.anchor[1]); }
        else {
          o.body.setOrigin(van.anchor[0], van.anchor[1]); o.over.setOrigin(van.anchor[0], van.anchor[1]);
          const key = 'gbv:' + o.anim + ':' + rd; if (!o.body.anims.currentAnim || o.body.anims.currentAnim.key !== key) o.body.play(key);
          o.over.setFrame('over_' + o.body.frame.name);
        }
        o.body.setFlipX(fl); o.over.setFlipX(fl);
        const sh = ent.shadow[rd];
        o.sh.setPosition(x, y + 2).setDisplaySize(sh[0], sh[1] * 1.15).setAngle(fl ? -sh[2] : sh[2]);
        let bob = 0;
        if (!tdir && van.anims[o.anim].bobPx) { const i = o.body.anims.currentFrame ? o.body.anims.currentFrame.index - 1 : 0; bob = van.anims[o.anim].bobPx[i] || 0; }
        const p = ent.roofSignPoint[rd];
        o.sign.setPosition(x + (fl ? -p[0] : p[0]), y + p[1] + bob).setFrame('gb_roofsign_' + o.lang + '_' + (G.lit ? 1 : 0));
        for (const im of [o.body, o.over, o.sh]) im.setPosition(x, y);
        o.body.setDepth(y); o.over.setDepth(y + 0.01); o.sh.setDepth(y - 0.5); o.sign.setDepth(y + 0.02); o.patch.setDepth(y + 0.015);
        o.lights = (ent.lightPoints[rd] || []).map((q) => [x + (fl ? -q[0] : q[0]), y + q[1]]);
      };
      o.playPatch = (anim, d) => {
        const a = van.anims[anim]; o.body.anims.stop(); o.body.setFrame('idle_' + base(d) + '_0'); o.over.setFrame('over_idle_' + base(d) + '_0');
        o.patch.setVisible(true).setOrigin(a.anchor[0], a.anchor[1]).setPosition(o.x, o.y).setFlipX(flipOf(d));
        const frames = Array.from({ length: a.frames }, (_, i) => anim + '_' + base(d) + '_' + i);
        const fwd = () => { let i = 0; const t = this.time.addEvent({ delay: 1000 / a.fps, repeat: a.frames - 1, callback: () => { o.patch.setFrame(frames[Math.min(i, frames.length - 1)]); i++; } }); return t; };
        fwd();
        this.time.delayedCall(1000 / a.fps * a.frames + 1400, () => { let i = a.frames - 1; this.time.addEvent({ delay: 1000 / a.fps, repeat: a.frames - 1, callback: () => { o.patch.setFrame(frames[Math.max(0, i)]); i--; if (i < 0) o.patch.setVisible(false); } }); });
      };
      glowAt(() => G.lit && o.sign.visible ? [o.sign.x, o.sign.y - 22] : null, 0.75);
      for (let k = 0; k < 2; k++) glowAt(() => G.lit && o.lights ? o.lights[k] : null, 0.35);
      return o;
    };
    const dock = C.dockVehiclePoints.delivery_van[0];
    const vDock = makeVan('ko'); vDock.dir = 'SE'; vDock.place(ox + dock[0], oy + dock[1]);
    const unloadLoop = () => { vDock.playPatch('unload', 'SE'); this.time.delayedCall(5200, unloadLoop); };
    this.time.delayedCall(400, unloadLoop);
    G.dockVan = [vDock.x, vDock.y];
    // the red reference van + a town car on the cobble street
    const rv = this.add.sprite(1000, 2010, red.atlas, 'idle_SE_0').setOrigin(red.anchor[0], red.anchor[1]).setDepth(2010);
    this.add.image(1000, 2012, 'fv_shadow').setAlpha(0.32).setDisplaySize(red.shadow.SE[0], red.shadow.SE[1] * 1.15).setAngle(red.shadow.SE[2]).setDepth(2009);
    const car = VH.characters.car_a_red; this.add.sprite(640, 2120, car.atlas, 'idle_SE_0').setOrigin(car.anchor[0], car.anchor[1]).setDepth(2120);
    // a van at a kerb opening its door (NE) and one in SW (mirror) on the cobble
    const vKerb = makeVan('en'); vKerb.dir = 'NE'; vKerb.place(1360, 2050);
    const doorLoop = () => { vKerb.playPatch('door', 'NE'); this.time.delayedCall(3200, doorLoop); };
    this.time.delayedCall(800, doorLoop);
    const vSW = makeVan('ko'); vSW.dir = 'SW'; vSW.anim = 'move'; vSW.place(1700, 2160);
    // the loop van: SE -> E -> NE -> N -> NW -> W -> SW -> S -> SE
    const loopVan = makeVan('ko'); loopVan.anim = 'move';
    const L0 = [2300, 1640], legs = [['SE', 2, 1, 'E'], ['NE', 2, -1, 'N'], ['NW', -2, -1, 'W'], ['SW', -2, 1, 'S']];
    const LEN = 300, SPEED = 140, TURN = 0.3;
    let t = 0; G.headings = new Set();
    this.events.on('update', (_, dt) => {
      t += dt / 1000;
      const legT = LEN / SPEED, per = legT * 4; const u = t % per; const k = Math.floor(u / legT); const f = (u - k * legT) / legT;
      let x = L0[0], y = L0[1];
      for (let j = 0; j < k; j++) { const [, ax, ay] = legs[j]; const n = Math.hypot(ax, ay); x += ax / n * LEN; y += ay / n * LEN; }
      const [d, ax, ay] = legs[k]; const n = Math.hypot(ax, ay); x += ax / n * LEN * f; y += ay / n * LEN * f;
      const tl = TURN / 2 / legT;
      loopVan.dir = d; loopVan.turn = f > 1 - tl ? legs[k][3] : f < tl ? legs[(k + 3) % 4][3] : null;
      G.headings.add(loopVan.turn || d);
      loopVan.place(x, y);
      // the dog sled + pennant (sledPennant[dir][anim][frame])
      sled.x = 1100 + 260 * Math.sin(t * 0.5); const sd = Math.cos(t * 0.5) >= 0 ? 'SE' : 'NW';
      const sb = base(sd), sfl = flipOf(sd);
      const key = 'sled:move:' + sb; if (!sled.anims.currentAnim || sled.anims.currentAnim.key !== key) sled.play(key);
      sled.setFlipX(sfl).setPosition(sled.x, 2560 + (sd === 'SE' ? 0 : 0)).setDepth(2560);
      const fi = sled.anims.currentFrame ? sled.anims.currentFrame.index - 1 : 0;
      const q = gs.gb_pennant.sledPennant[sb].move[fi];
      pen.setPosition(sled.x + (sfl ? -q[0] : q[0]), 2560 + q[1]).setFlipX(sfl).setDepth(2560.5);
      const pk = 'spr:gb_pennant:' + sb; if (!pen.anims.currentAnim || pen.anims.currentAnim.key !== pk) pen.play(pk);
      for (const gl of glows) { const p = gl.fn(); gl.im.setVisible(!!p); if (p) gl.im.setPosition(p[0], p[1]); }
      if (overlay) { const v = this.cameras.main.worldView; overlay.setPosition(v.x - 80, v.y - 80).setDisplaySize(v.width + 160, v.height + 160); }
    });
    const sled = this.add.sprite(900, 2560, ds.atlas, 'move_SE_0').setOrigin(ds.anchor[0], ds.anchor[1]);
    const pen = this.add.sprite(0, 0, 'gb_bld_0', 'gb_pennant_SE_0').setOrigin(gs.gb_pennant.anchor[0], gs.gb_pennant.anchor[1]);
    // ---------------------------------------------------------------- props + items
    const prop = (k, x, y, frame) => { const s = gs[k]; return this.add.sprite(x, y, 'gb_bld_0', frame || s.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(y); };
    const sign = prop('gb_sign', ox - 430, oy + 330);
    const signLit = prop('gb_sign', ox - 430, oy + 330, gs.gb_sign.states.lit).setDepth(oy + 330.01).setVisible(false); lit.push(signLit);
    glowAt(() => G.lit ? [sign.x, sign.y - 170] : null, 1.0);
    prop('gb_flag', ox + 600, oy + 420).play('spr:gb_flag:wave');
    for (const [k, x, y] of [['gb_locker_a', ox - 200, oy + 560], ['gb_locker_b', ox + 820, oy + 260]]) {
      const b = prop(k, x, y);
      const l = prop(k, x, y, gs[k].states.lit).setDepth(y + 0.01).setVisible(false); lit.push(l);
      const op = prop(k, x, y, gs[k].anims.open.frames[0]).setDepth(y + 0.02);
      const cyc = () => { op.play('spr:' + k + ':open'); this.time.delayedCall(1600, () => op.playReverse('spr:' + k + ':open')); this.time.delayedCall(3000, cyc); };
      cyc();
      glowAt(() => G.lit ? [x + (k.endsWith('a') ? -10 : 10), y - 100] : null, 0.45);
      G[k] = { slots: gs[k].slotPoints.length, open: gs[k].openSlot };
    }
    prop('gb_parcel_doorstep', 560, 1560, gs.gb_parcel_doorstep.states.fresh);
    prop('gb_parcel_doorstep', 640, 1600, gs.gb_parcel_doorstep.states.snowy);
    prop('gb_parcel_open', 720, 1560);
    prop('gb_parcel_cat', 800, 1600).play('spr:gb_parcel_cat:blink');
    let ix = 560; for (const k of ['gb_parcel_s', 'gb_parcel_m', 'gb_parcel_l']) { prop(k, ix, 1680); ix += 70; }
    // stacked parcels at a van's parcelPoints-ground (as the courier hands them out)
    // ---------------------------------------------------------------- night
    let overlay = null;
    G.setNight = (on) => {
      G.lit = on;
      if (on && !overlay) { overlay = this.add.image(0, 0, '__WHITE').setOrigin(0, 0).setDepth(1e6).setBlendMode(Phaser.BlendModes.MULTIPLY); const mix = (ch) => Math.round(255 * (1 - DUSK.a) + ch * DUSK.a); overlay.setTint((mix((DUSK.color >> 16) & 255) << 16) | (mix((DUSK.color >> 8) & 255) << 8) | mix(DUSK.color & 255)); }
      if (overlay) overlay.setVisible(on);
      for (const l of lit) l.setVisible(on);
    };
    G.look = (x, y, z) => { const cam = this.cameras.main; cam.setZoom(z * K); cam.centerOn(x, y); };
    G.focus = { hub: [ox + 120, oy + 260], street: [1700, 1900], items: [720, 1700], all: [1450, 1900] };
    G.measure = () => {
      // CSS px of a game px at zoom z: z * K * cssW / (W * K) = z * cssW / W
      const R = 0.5, markPx = 2 * R * 64 * Math.SQRT1_2;
      const signFrame = this.textures.getFrame('gb_van_0', 'gb_roofsign_ko_0');
      return { cssPerGamePxAtZ06: 0.6 * cssW / W, markCss: markPx * 0.6 * cssW / W, roofSignCss: signFrame.cutWidth * 0.6 * cssW / W };
    };
    G.scene = this; G.ready = true;
  }
}
G.game = new Phaser.Game({ type: Phaser.WEBGL, parent: 'game', width: Math.round(W * K), height: Math.round(H * K), backgroundColor: '#dbe6f2',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, render: { antialias: true, roundPixels: false },
  disablePreFX: true, fps: { target: 30, forceSetTimeOut: true }, scene: S, banner: false });
</script></body></html>`;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const errors = [];
const notFound = [];
const results = {};
const shots = [];
async function run(vw, vh, dpr, plans) {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) notFound.push(r.url()); });
  await page.route('**/fv/__gb.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  await page.goto(srv.url + '__gb.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__G && window.__G.ready, null, { timeout: 240000 });
  await page.waitForTimeout(2500);
  const key = vw + 'x' + vh;
  results[key] = await page.evaluate(() => ({ view: window.__G.view, missing: window.__G.missing, frames: window.__G.frames, anims: window.__G.anims, measure: window.__G.measure(), hub: window.__G.hub, lockers: [window.__G.gb_locker_a, window.__G.gb_locker_b] }));
  for (const [zoom, night, focus] of plans) {
    await page.evaluate(([z, n, f]) => { window.__G.setNight(n); const p = window.__G.focus[f]; window.__G.look(p[0], p[1], z); }, [zoom, night, focus]);
    await page.waitForTimeout(1800);
    await page.evaluate(() => window.__G.game.loop.sleep());
    const file = path.join(OUT, `gb_phaser_${key}_z${zoom}_${night ? 'night' : 'day'}_${focus}.png`);
    await page.screenshot({ path: file, timeout: 240000 });
    await page.evaluate(() => window.__G.game.loop.wake());
    shots.push({ key, zoom, night, focus, file });
  }
  results[key].headings = await page.evaluate(() => [...window.__G.headings].sort());
  await ctx.close();
}
await run(390, 844, 3, [[0.6, false, 'all'], [0.6, true, 'all'], [1.0, false, 'hub'], [1.0, true, 'hub'], [1.2, false, 'street'], [1.2, true, 'street'], [1.6, false, 'items'], [1.6, true, 'items']]);
await run(360, 640, 2, [[1.0, false, 'street']]);
await browser.close();
await srv.close();
// contact sheets (Pillow): 390 x 844 rows = zooms, day | night; 360 x 640 alone
const py = `
import json, sys
from PIL import Image, ImageDraw, ImageFont
shots = json.loads(sys.argv[1]); out = sys.argv[2]
f = ImageFont.truetype(sys.argv[3], 26)
rows = {}
for s in shots:
    if s['key'] == '390x844':
        rows.setdefault(s['zoom'], {})['night' if s['night'] else 'day'] = s['file']
W = 468; H = 1013
sheet = Image.new('RGB', (W * 2 + 30, (H + 50) * len(rows) + 10), (40, 44, 60))
d = ImageDraw.Draw(sheet)
for r, z in enumerate(sorted(rows)):
    for c, k in enumerate(('day', 'night')):
        im = Image.open(rows[z][k]).convert('RGB').resize((W, H), Image.LANCZOS)
        sheet.paste(im, (10 + c * (W + 10), 10 + r * (H + 50) + 40))
        d.text((14 + c * (W + 10), 10 + r * (H + 50)), '390x844 DPR3  zoom %s  %s' % (z, k), font=f, fill=(255, 255, 255))
sheet.save(out + '/gb_phaser_390_day_night.png', optimize=True)
for s in shots:
    if s['key'] == '360x640':
        Image.open(s['file']).convert('RGB').save(out + '/gb_phaser_360.png', optimize=True)
`;
fs.writeFileSync(path.join(OUT, 'gb_sheet.py'), py);
const prev = path.join(ROOT, 'docs', 'previews');
execFileSync('python3', [path.join(OUT, 'gb_sheet.py'), JSON.stringify(shots), prev, path.join(ROOT, 'tools', 'fonts', 'Jua-Regular.ttf')]);
const missing = Object.values(results).flatMap((r) => r.missing);
const res = { results, shots: shots.map((s) => path.basename(s.file)), errors, notFound, missing };
fs.writeFileSync(path.join(OUT, 'geumbang_phaser.json'), JSON.stringify(res, null, 1));
console.log(JSON.stringify({ frames: results['390x844'].frames, anims: results['390x844'].anims, missing: missing.length, headings: results['390x844'].headings,
  measure: results['390x844'].measure, view390: results['390x844'].view, view360: results['360x640'].view, errors: errors.slice(0, 5), notFound: notFound.slice(0, 5) }));
const ok = !missing.length && !errors.length && !notFound.length && results['390x844'].headings.length === 8 &&
  results['390x844'].measure.markCss >= 12 && results['390x844'].measure.roofSignCss >= 30;
console.log(ok ? 'geumbang_phaser: OK' : 'geumbang_phaser: FAIL');
process.exit(ok ? 0 : 1);
