// fx_city fragment (assets/fx_city, CONTRACT_V8 §AC) in headless Chromium with Phaser 3.90 - no game code.
//   node tools/test/fx_city_phaser.mjs
// 1) LOAD TEST (1800x1040): loads assets/fx_city/manifest.json exactly like src/core/Assets.js would (spritesheets
//    with endFrame = frameCount - 1, the ui4_icons atlas, plain images for the panels), creates the sheet anims the
//    same way as Assets.sheetAnims (key = sheet key, frameCount / fps / repeat), checks every frame / atlas frame
//    exists, plays all FX over snow / plaza / sea / night strips, lays out the icons, stretches the 9-slice panels,
//    aims Rope jets in 8 directions + segment chains with the exact manifest.hoseAim rules (arc height from |dx| with
//    the no-hook cap, side bow, sway, rope_long by length, tip flipY for leftward aims, depth rule) and measures every
//    jet (no hook-back, bow on steep aims), plays the layered scuffle (fx_fight_cloud_back / _front in sync)
//    -> docs/previews/fxcity_phaser.png + <tmp>/fv_cache/fx_city/fx_city_phaser.json.
// 2) PHONE STREET (390x844 CSS px at DPR 3, 720 logical px wide like main.js, k = 1.65): real town buildings burning
//    per manifest.fireMount.buildings (townhouse_b + the 2-fire school), warm tint flicker, fx_fire_glow, window
//    fires, smoke, embers, two aimed Rope hoses, the fire truck + siren, police car + red / blue sirens, a layered
//    scuffle with two villagers inside, crowd with ? / idea / memory, alarm flash -> docs/previews/
//    fxcity_phone_z06.png and fxcity_phone_z12.png (camera zoom 0.6 and 1.2).
// Exit 1 on missing frames, page errors, 404s or a hooked / pole-straight jet.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, sleep } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTJ = path.join(os.tmpdir(), 'fv_cache', 'fx_city');

// ---- shared hose helpers (manifest.hoseAim, literally) -------------------------------------------------------
const HOSE_JS = `
const hoseCurve = (N, T, t = 0) => {
  const dx = T.x - N.x, dy = T.y - N.y, L = Math.hypot(dx, dy) || 1;
  let h = Math.max(8, Math.min(120, 0.3 * Math.abs(dx)));
  h = Math.min(h, Math.max(8, (1.2 * Math.abs(dx) - dy) / 4));
  const b = 0.06 * L * Math.max(0, 1 - Math.abs(dx) / (0.5 * Math.abs(dy) + 1)) + 0.025 * L * Math.sin(t * 1.7);
  let nx = -dy / L, ny = dx / L; if (nx < 0) { nx = -nx; ny = -ny; }
  return (s) => { const k = 4 * s * (1 - s); return { x: N.x + dx * s + nx * b * k, y: N.y + dy * s - h * k + ny * b * k }; };
};
const arcLen = (P) => { let l = 0, p = P(0); for (let q = 1; q <= 64; q++) { const r = P(q / 64); l += Math.hypot(r.x - p.x, r.y - p.y); p = r; } return l; };
function makeHose(scene, man, N, T, depth, opts = {}) {
  const A = man.hoseAim, out = { N, T };
  const P = hoseCurve(N, T, opts.t || 0), len = arcLen(P);
  const tex = len > A.ropeLongFromPx ? A.ropeTextureLong : A.ropeTexture;
  const n = Math.max(8, Math.round(len / 12)), pts = [];
  for (let q = 0; q <= n; q++) { const p = P(q / n); pts.push(new Phaser.Math.Vector2(p.x - N.x, p.y - N.y)); }
  const p1 = P(0.99), p2 = P(1), ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  if (opts.chain) {
    const seg = man.spritesheets.find((s) => s.key === A.segment), dense = [], cum = [0];
    for (let q = 0; q <= 200; q++) dense.push(P(q / 200));
    for (let q = 1; q <= 200; q++) cum.push(cum[q - 1] + Math.hypot(dense[q].x - dense[q - 1].x, dense[q].y - dense[q - 1].y));
    const total = cum[200], m = Math.max(1, Math.ceil(total / A.stepPx)), L = total / m;
    const at = (l) => { let q = 1; while (q < 200 && cum[q] < l) q++; const f = (l - cum[q - 1]) / Math.max(1e-6, cum[q] - cum[q - 1]); return { x: dense[q - 1].x + (dense[q].x - dense[q - 1].x) * f, y: dense[q - 1].y + (dense[q].y - dense[q - 1].y) * f }; };
    out.sprites = [];
    for (let q = 0; q < m; q++) {
      const a0 = at(q * L), a1 = at(Math.min(total, q * L + 2)), r = Math.atan2(a1.y - a0.y, a1.x - a0.x);
      out.sprites.push(scene.add.sprite(a0.x, a0.y, A.segment, 0).setOrigin(0, 0.5).setRotation(r)
        .setScale((L + 1) / seg.frameWidth, 1 - 0.3 * q / Math.max(1, m - 1)).setDepth(depth).play(A.segment));
    }
    out.tex = A.segment;
  } else {
    out.rope = scene.add.rope(N.x, N.y, tex, 0, pts, true).setDepth(depth);
    out.rope.scaleY = 1;
    out.tex = tex;
  }
  out.tip = scene.add.sprite(p2.x, p2.y, A.tip, 0).setOrigin(0, 0.5).setRotation(ang).setScale(0.7, 0.7)
    .setFlipY(T.x < N.x).setDepth(depth + 1).play(A.tip);
  out.endAngleDeg = ang * 180 / Math.PI; out.len = len;
  // measurements: does the jet hook back (rise above T then come DOWN steeply onto a target above N)?
  let minY = 1e9; for (let q = 0; q <= 64; q++) minY = Math.min(minY, P(q / 64).y);
  const dx = T.x - N.x, dy = T.y - N.y;
  const endSlopeDown = Math.atan2(p2.y - p1.y, Math.abs(p2.x - p1.x) + 1e-6) * 180 / Math.PI;    // + = falling
  out.hook = dy < 0 && endSlopeDown > 55;
  // maximum sideways deviation from the straight N->T line (a rigid pole has none)
  let dev = 0; for (let q = 0; q <= 64; q++) { const p = P(q / 64); dev = Math.max(dev, Math.abs((p.x - N.x) * dy - (p.y - N.y) * dx) / (Math.hypot(dx, dy) || 1)); }
  out.bow = dev;
  return out;
}
`;

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#dfe8f2}</style>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
const man = await (await fetch('assets/fx_city/manifest.json')).json();
window.__H = { ready: false, missing: [], anims: [], frames: 0, hoseSprites: 0, nine: 0, sheetFrames: {}, aims: [] };
const BASE = 'assets/';
${HOSE_JS}
class S extends Phaser.Scene {
  preload() {
    for (const a of man.spritesheets) this.load.spritesheet(a.key, BASE + a.png, { frameWidth: a.frameWidth, frameHeight: a.frameHeight, endFrame: a.frameCount - 1 });
    for (const a of man.atlases) this.load.atlas(a.key, BASE + a.png, BASE + a.json);
    for (const i of man.images) this.load.image(i.key, BASE + i.png);
  }
  create() {
    const H = window.__H, tex = this.textures, anims = this.anims;
    const cols = [0xf4f7fb, 0xd9a08a, 0x1f5fa8, 0x2b2f3a];
    for (let k = 0; k < 4; k++) this.add.rectangle(k * 300 + 150, 300, 300, 600, cols[k]).setDepth(-1e6);
    this.add.rectangle(1500, 520, 600, 1040, 0xf4f7fb).setDepth(-1e6);
    this.add.rectangle(600, 830, 1200, 420, 0xfff8ec).setDepth(-1e6);
    for (const s of man.spritesheets) {
      if (!tex.exists(s.key)) { H.missing.push('texture:' + s.key); continue; }
      const total = tex.get(s.key).frameTotal - 1;
      H.sheetFrames[s.key] = total;
      if (total < s.frameCount) H.missing.push(s.key + ': ' + total + ' frames < ' + s.frameCount);
      const end = Math.min(total, s.frameCount || total) - 1;
      anims.create({ key: s.key, frames: anims.generateFrameNumbers(s.key, { start: 0, end: Math.max(0, end) }), frameRate: s.fps, repeat: s.repeat });
      H.anims.push(s.key); H.frames += s.frameCount;
    }
    // every sheet playing (loops loop; one-shots restart every 2 s); fight back + front drawn in one cell, in sync
    const order = man.spritesheets.filter((s) => !s.key.startsWith('fx_hose_') && s.key !== 'fx_fight_cloud_front');
    let i = 0;
    for (const s of order) {
      const col = i % 8, row = Math.floor(i / 8);
      const x = 75 + col * 150, y = 140 + row * 175;
      const sc = Math.min(1, 140 / s.frameWidth, 160 / s.frameHeight);
      const spr = this.add.sprite(x, y + 60, s.key, 0).setOrigin(s.anchor[0], s.anchor[1]).setScale(sc).play(s.key);
      if (s.repeat === 0) this.time.addEvent({ delay: 2000, loop: true, callback: () => spr.play(s.key) });
      if (s.key === 'fx_fight_cloud_back') {
        const fr = man.spritesheets.find((q) => q.key === 'fx_fight_cloud_front');
        this.add.sprite(x, y + 60, fr.key, 0).setOrigin(fr.anchor[0], fr.anchor[1]).setScale(sc).setDepth(1).play(fr.key);
      }
      i++;
    }
    const icons = Object.entries(man.sprites).filter(([k, s]) => s.kind === 'icon');
    icons.forEach(([k, s], j) => {
      if (!tex.get(s.atlas).has(s.frame)) H.missing.push('icon:' + k);
      this.add.image(40 + (j % 13) * 88, 690 + Math.floor(j / 13) * 92, s.atlas, s.frame).setScale(0.8);
    });
    const nine = (k, x, y, w, h) => {
      const n = man.nineSlice[k];
      if (!n || !tex.exists(n.image)) { H.missing.push('nine:' + k); return null; }
      H.nine++;
      return this.add.nineslice(x, y, n.image, undefined, w, h, n.left, n.right, n.top, n.bottom).setOrigin(0, 0);
    };
    nine('ui_newspaper', 20, 860, 420, 170);
    nine('ui_newspaper_masthead', 32, 866, 396, man.sprites.ui_newspaper_masthead.frameSize[1]);
    if (tex.exists('ui_newspaper_logo')) this.add.image(230, 866 + 12 + 32, 'ui_newspaper_logo').setScale(0.8);
    nine('ui_newspaper_column', 36, 975, 190, 50);
    nine('ui_passbook', 460, 860, 330, 170);
    for (let r = 0; r < 2; r++) nine('ui_passbook_row', 505, 935 + r * 32, 265, 32);
    nine('ui_story_card', 810, 860, 360, 90);
    nine('ui_story_card_news', 810, 950, 360, 80);
    for (const k of ['ui_wanted_poster', 'ui_wanted_silhouette', 'ui_newspaper_logo', 'ui_newspaper_logo_en'])
      if (!tex.exists(k)) H.missing.push('image:' + k);
    this.add.image(1210, 620, 'ui_wanted_poster').setOrigin(0, 0).setScale(0.55);
    this.add.image(1210 + 48 * 0.55, 620 + 78 * 0.55, 'ui_wanted_silhouette').setOrigin(0, 0).setScale(0.55);
    // hose: 8 Rope aims around one nozzle (+ 2 chains), with the manifest rules; jets measured
    const N = { x: 1500, y: 330 }, dirs = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
    this.add.circle(N.x, N.y, 6, 0x3c4658).setDepth(50);
    dirs.forEach((d, q) => {
      const a = q * Math.PI / 4, T = { x: Math.round(N.x + Math.cos(a) * 250), y: Math.round(N.y + Math.sin(a) * 200) };
      const hz = makeHose(this, man, N, T, 10);
      this.add.sprite(T.x, T.y, 'fx_water_mist', 0).setOrigin(0.5, 0.6).setScale(0.6).setDepth(9).play('fx_water_mist');
      H.aims.push({ dir: d, tex: hz.tex, len: Math.round(hz.len), hook: hz.hook, bow: Math.round(hz.bow), flipTip: hz.tip.flipY });
      H.ropes = (H.ropes || []).concat([hz.rope]);
    });
    for (const T of [{ x: 1720, y: 640 }, { x: 1300, y: 600 }]) {
      const hz = makeHose(this, man, { x: 1500, y: 760 }, T, 10, { chain: true });
      H.hoseSprites += hz.sprites.length;
      H.aims.push({ dir: 'chain', tex: hz.tex, len: Math.round(hz.len), hook: hz.hook, bow: Math.round(hz.bow), flipTip: hz.tip.flipY });
    }
    let f = 0;
    const rs = man.spritesheets.find((s) => s.key === man.hoseAim.ropeTexture);
    this.time.addEvent({ delay: 1000 / rs.fps, loop: true, callback: () => { f = (f + 1) % rs.frameCount; (H.ropes || []).forEach((r) => r.setFrame(f)); } });
    H.rope = (H.ropes || []).length > 0;
    H.scene = this; H.ready = true;
  }
}
window.__H.game = new Phaser.Game({ type: Phaser.WEBGL, width: 1800, height: 1040, backgroundColor: '#eef3f9',
  render: { antialias: true }, scene: S, banner: false });
</script></body></html>`;

// ---- phone street (DPR 3, 720 logical px, camera zoom ZOOM * k) -----------------------------------------------
const PHONE = (ZOOM) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:#dbe6f2;height:100%;overflow:hidden}#game{width:100%;height:100%}</style>
<script src="lib/phaser.min.js"></script></head><body><div id="game"></div><script type="module">
const j = async (p) => (await fetch(p)).json();
const man = await j('assets/fx_city/manifest.json');
const town = await j('assets/town/manifest.json');
const veh = await j('assets/vehicles/manifest.json');
const vil = await j('assets/villagers/manifest.json');
const W = 720, H = Math.round(720 * innerHeight / innerWidth);
const k = Math.round(Math.max(1, Math.min(2, innerWidth * devicePixelRatio / 720)) * 20) / 20;
window.__R = { ready: false, k };
${HOSE_JS}
const NPCS = ['npc_red', 'npc_blue', 'npc_aunt', 'npc_grandpa', 'npc_kid_girl', 'npc_teen_girl', 'npc_young_man', 'npc_uncle'];
class S extends Phaser.Scene {
  preload() {
    const L = this.load;
    for (const a of man.spritesheets) L.spritesheet(a.key, 'assets/' + a.png, { frameWidth: a.frameWidth, frameHeight: a.frameHeight, endFrame: a.frameCount - 1 });
    for (const a of man.atlases) L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const a of town.atlases) L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const a of veh.atlases) if (['veh_fire_truck', 'veh_police_car'].includes(a.key)) L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const a of vil.atlases) if (NPCS.map((n) => 'vil_' + n).includes(a.key)) L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
  }
  create() {
    for (const s of man.spritesheets) this.anims.create({ key: s.key, frames: this.anims.generateFrameNumbers(s.key, { start: 0, end: s.frameCount - 1 }), frameRate: s.fps, repeat: s.repeat });
    const cam = this.cameras.main; cam.setBackgroundColor('#eef3f9');
    const g = this.add.graphics().setDepth(-1e5);
    g.fillStyle(0xc9d1db, 1); g.fillPoints([{ x: -900, y: 300 }, { x: 420, y: -360 }, { x: 680, y: -230 }, { x: -640, y: 430 }], true);
    const fx = (key, x, y, depth, scale = 1, flip = false) => { const s = man.spritesheets.find((q) => q.key === key);
      return this.add.sprite(x, y, key, 0).setOrigin(s.anchor[0], s.anchor[1]).setDepth(depth).setScale(scale).setFlipX(flip).play(key); };
    const bld = (key, x, y) => { const s = town.sprites[key]; return this.add.image(x, y, s.atlas, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(y); };
    const vfr = (c, anim, dir, i) => c.frameName.replace('{anim}', anim).replace('{dir}', dir).replace('{i}', i);
    const villager = (name, x, y, anim = 'idle', dir = 'S', flip = false) => {
      const c = vil.characters[name]; const key = name + '_' + anim + '_' + dir;
      if (!this.anims.exists(key)) this.anims.create({ key, frames: Array.from({ length: c.anims[anim].frames }, (_, i) => ({ key: c.atlas, frame: vfr(c, anim, dir, i) })), frameRate: c.anims[anim].fps, repeat: -1 });
      return this.add.sprite(x, y, c.atlas, vfr(c, anim, dir, 0)).setOrigin(c.anchor[0], c.anchor[1]).setFlipX(flip).setDepth(y).play(key);
    };
    const vehicle = (name, x, y, anim, dir) => {
      const c = veh.characters[name]; const key = name + anim + dir;
      this.anims.create({ key, frames: Array.from({ length: c.anims[anim].frames }, (_, i) => ({ key: c.atlas, frame: vfr(c, anim, dir, i) })), frameRate: c.anims[anim].fps, repeat: -1 });
      this.add.sprite(x, y, c.atlas, vfr(c, anim, dir, 0)).setOrigin(c.anchor[0], c.anchor[1]).setDepth(y).play(key);
      return c;
    };
    // a building on fire, exactly per manifest.fireMount (buildings table + tint flicker + glow/smoke/windows/embers)
    const burn = (key, x, y) => {
      const b = bld(key, x, y), m = man.fireMount.buildings[key];
      const tints = [0xffe2c8, 0xffd6b4, 0xffcfa6, 0xffdcbc];
      this.time.addEvent({ delay: 150, loop: true, callback: () => b.setTint(tints[Math.floor(Math.random() * 4)]) });
      fx('fx_fire_glow', x + m.glow[0], y + m.glow[1], y + 0.9, m.glow[2]).setAlpha(0.85);
      for (const [dx, dy, sk, sc, dep] of m.fires) fx(sk, x + dx, y + dy, y + dep, sc);
      fx('fx_smoke_column', x + m.smoke[0], y + m.smoke[1], y + 0.95, m.smoke[2]);
      fx('fx_embers', x + m.embers[0], y + m.embers[1], y + 2);
      for (const [dx, dy, flip, sc] of m.windows.slice(0, 2)) fx('fx_fire_window', x + dx, y + dy, y + 0.5, sc, flip);
      return m;
    };
    const hx = 120, hy = -100;
    bld('cafe', hx - 300, hy - 150); bld('townhouse_a', hx + 280, hy + 140);
    const m = burn('townhouse_b', hx, hy);
    burn('school', hx + 460, hy - 330);
    // fire truck + siren, firefighters (villager stand-ins) + aimed Rope hoses with sway
    const ft = vehicle('fire_truck', hx - 470, hy + 270, 'siren', 'SE');
    fx('fx_siren_glow_red', hx - 470 + ft.sirenPoint.SE[0], hy + 270 + ft.sirenPoint.SE[1], hy + 1000);
    villager('npc_red', hx - 260, hy + 180, 'idle', 'NE'); villager('npc_blue', hx + 30, hy + 270, 'idle', 'N');
    const f0 = m.fires[0], fs = man.spritesheets.find((s) => s.key === f0[2]);
    const T1 = { x: hx + f0[0] - 20, y: hy + f0[1] - 0.3 * fs.heightPx * f0[3] }, T2 = { x: hx + m.windows[0][0], y: hy + m.windows[0][1] };
    const hoses = [[{ x: hx - 245, y: hy + 130 }, T1], [{ x: hx + 40, y: hy + 215 }, T2]];
    const live = [];
    const depthJet = hy + 3.5;                                     // hoseAim.depth: max(firefighter, building + 1) + 0.5
    let t = 0;
    const redraw = () => {
      live.forEach((o) => { o.rope && o.rope.destroy(); o.tip.destroy(); }); live.length = 0;
      hoses.forEach(([N, T]) => live.push(makeHose(this, man, N, T, depthJet, { t })));
    };
    redraw();
    hoses.forEach(([N, T]) => { fx('fx_water_mist', T.x, T.y, depthJet + 1); const st = fx('fx_steam_puff', T.x + 12, T.y - 8, depthJet + 1); st.anims.repeat = -1; });
    let rf = 0; this.time.addEvent({ delay: 1000 / 30, loop: true, callback: () => { rf = (rf + 1) % 8; t += 1 / 30; redraw(); live.forEach((o) => { o.rope && o.rope.setFrame(rf); }); } });
    // police car + layered scuffle (back + two villagers + front, fightGuide.play) + simple cloud further down
    const pc = vehicle('police_car', hx - 540, hy + 540, 'siren', 'SE');
    fx('fx_siren_glow_red', hx - 540 + pc.sirenPoint.SE[0] - 10, hy + 540 + pc.sirenPoint.SE[1], hy + 3000);
    fx('fx_siren_glow_blue', hx - 540 + pc.sirenPoint.SE[0] + 10, hy + 540 + pc.sirenPoint.SE[1], hy + 3000);
    const fxp = { x: hx - 250, y: hy + 590 };
    fx('fx_fight_cloud_back', fxp.x, fxp.y, fxp.y - 10);
    villager('npc_uncle', fxp.x - 22, fxp.y - 2, 'angry', 'E'); villager('npc_young_man', fxp.x + 22, fxp.y + 2, 'angry', 'E', true);
    fx('fx_fight_cloud_front', fxp.x, fxp.y, fxp.y + 10);
    fx('fx_fight_cloud', hx - 20, hy + 700, hy + 700);
    // crowd + story fx, alarm on a streetlight
    [['npc_aunt', 120, 430], ['npc_grandpa', 190, 460], ['npc_kid_girl', 250, 410], ['npc_teen_girl', 60, 480]]
      .forEach(([n, x, y]) => villager(n, hx + x, hy + y, 'idle', 'NE'));
    fx('fx_question_mark', hx + 120, hy + 430 - 78, hy + 5000);
    fx('fx_memory_sparkle', hx + 190, hy + 460 - 70, hy + 5000);
    const lb = fx('fx_lightbulb_idea', hx + 250, hy + 410 - 70, hy + 5000); lb.anims.repeat = -1; lb.anims.repeatDelay = 800;
    const sl = town.sprites.streetlight; bld('streetlight', hx - 120, hy + 130);
    fx('fx_alarm_flash', hx - 120, hy + 130 - sl.topPx - 30, hy + 3000, 0.8);
    cam.setZoom(${ZOOM} * k); cam.centerOn(hx - 60, hy + 170 - (${ZOOM} < 0.9 ? 60 : 0));
    window.__R.ready = true;
  }
}
window.__R.game = new Phaser.Game({ type: Phaser.WEBGL, parent: 'game', width: Math.round(W * k), height: Math.round(H * k), backgroundColor: '#dbe6f2',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, render: { antialias: true, roundPixels: false }, scene: S, banner: false });
</script></body></html>`;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const errors = [];
const notFound = [];
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) notFound.push(r.url()); });
};
// 1) load test
const ctx = await browser.newContext({ viewport: { width: 1800, height: 1040 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
watch(page);
await page.route('**/fv/__fxcity.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
await page.goto(srv.url + '__fxcity.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__H && window.__H.ready, null, { timeout: 240000 });
await sleep(1500);
const res = await page.evaluate(() => {
  const H = window.__H, sc = H.scene;
  const playing = sc.children.list.filter((o) => o.anims && o.anims.isPlaying).length;
  return { anims: H.anims.length, framesChecked: H.frames, missing: H.missing, playing, hoseSprites: H.hoseSprites,
    nineSlices: H.nine, rope: H.rope, aims: H.aims, sheetFrames: H.sheetFrames, textures: Object.keys(sc.textures.list).length };
});
fs.mkdirSync(path.join(ROOT, 'docs', 'previews'), { recursive: true });
await page.screenshot({ path: path.join(ROOT, 'docs', 'previews', 'fxcity_phaser.png') });
await ctx.close();
// 2) phone street at zoom 0.6 and 1.2
const shots = [];
for (const z of [0.6, 1.2]) {
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const pp = await pctx.newPage();
  watch(pp);
  const name = '__fxphone' + String(z).replace('.', '') + '.html';
  await pp.route('**/fv/' + name, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: PHONE(z) }));
  await pp.goto(srv.url + name, { waitUntil: 'load' });
  await pp.waitForFunction(() => window.__R && window.__R.ready, null, { timeout: 240000 });
  await sleep(1800);
  const out = path.join(ROOT, 'docs', 'previews', 'fxcity_phone_z' + String(z).replace('.', '') + '.png');
  await pp.evaluate(() => window.__R.game.loop.sleep());
  await pp.screenshot({ path: out, timeout: 180000 });
  shots.push(path.relative(ROOT, out));
  await pctx.close();
}
const badJets = res.aims.filter((a) => a.hook || ((a.dir === 'N' || a.dir === 'S') && a.bow < 6) ||
  (a.flipTip !== (['SW', 'W', 'NW'].includes(a.dir))) && a.dir !== 'chain');
res.phone = shots;
res.badJets = badJets;
console.log(JSON.stringify({ ...res, sheetFrames: undefined }));
if (errors.length) console.log('ERRORS', errors.slice(0, 10));
if (notFound.length) console.log('404', notFound.slice(0, 10));
fs.mkdirSync(OUTJ, { recursive: true });
fs.writeFileSync(path.join(OUTJ, 'fx_city_phaser.json'), JSON.stringify({ res, errors, notFound }, null, 1));
await browser.close();
await srv.close();
process.exit(errors.length || notFound.length || res.missing.length || badJets.length ? 1 : 0);
