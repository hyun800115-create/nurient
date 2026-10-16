// The chief's v4.2 anims (assets/chief2, CONTRACT_V42 section AH) in headless Chromium with Phaser 3.90 - no game code.
//   node tools/test/chief2_phaser.mjs
// 1) DESKTOP load test (1180 x 1340): loads assets/characters (char_player) + assets/chief2 (char_player_b), MERGES
//    characters.player_b into characters.player the way the contract says (extends: every anim of player_b joins the
//    player def, each anim keeping its own atlas), builds `player:<anim>:<dir>` anims like src/core/Assets.js
//    buildCharacter (per-anim dirs, SW / W = flipX of SE / E), checks every frame (+ the `_desk` overlays) and shows
//    the old idle / walk next to all 9 new anims in S / SE / E / SW / W at 1x, playing.
// 2) PHONE (390 x 844 CSS px at DPR 3, 720 logical px like src/main.js, k = 1.65) at camera zoom 0.6 / 1.0 / 1.2 / 1.6 (x k):
//    the real 촌장 사무실 (assets/office) revealed with the chief at his desk (chiefDeskPoint, facing SW, sit_read in
//    @behind + its `_desk` overlay right over chief_office_interior_front), and outside on the snow: warm_hands at the
//    campfire, doze on a log seat (its seatPoints), talk to a villager, wave, cheer and the old idle for scale.
// 3) OFFICE CLOSE-UP (polish): the real office at 3 px per world px, the chief at chiefDeskPoint with the zero-code
//    reading loop (sit_read_in -> sit_read_loop, the alias anims), sit_eat and the 22:00 doze on the desk chair (not at
//    the stove: stovePoint has no seat) with emote_zzz at headTopSit; the pacing hints (cheer repeatDelay, doze
//    frameHold) are passed to Phaser the way CODE-2 would.
// Writes docs/previews/chief2_phaser.png, chief2_phone_z06.png, chief2_phone_z10.png, chief2_phone_z12.png, chief2_phone_z16.png,
// chief2_office_close.png and /tmp/fv_cache/chief2/chief2_phaser.json.  Exit 1 on missing frames, page errors, 404s,
// alias frames that do not share their source rectangle, or anims that do not play.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, sleep } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTJ = '/tmp/fv_cache/chief2';

// ---- shared in-page code -------------------------------------------------------------------------------------------
const SHARED = `
// what CODE-2 does with an "extends" character: the anims join the base def, each keeping its own atlas
function mergeExtends(chars) {
  const out = JSON.parse(JSON.stringify(chars));
  for (const [k, d] of Object.entries(out)) {
    if (!d.extends || !out[d.extends]) continue;
    const base = out[d.extends];
    for (const [an, a] of Object.entries(d.anims)) base.anims[an] = Object.assign({ atlas: d.atlas }, a);
    base.headTopSit = d.headTopSit; base.seat = d.seat; base.deskOverlay = d.deskOverlay;
  }
  return out;
}
const MIRROR = { SW: 'SE', W: 'E', NW: 'NE' };
// Assets.buildCharacter: '<key>:<anim>:<dir>' for every rendered dir of each anim (+ '<key>:<anim>:<dir>:desk'),
// + the polish pacing hints: repeatDelay (ms) and frameHold {i: ms} -> Phaser per-frame duration
function buildChar(scene, key, def, M) {
  const tex = scene.textures;
  M.aliasBad = M.aliasBad || [];
  for (const [an, a] of Object.entries(def.anims)) {
    const atlas = a.atlas || def.atlas, hold = a.frameHold || {};
    for (const dir of (a.dirs || def.dirs)) {
      const names = Array.from({ length: a.frames }, (_, i) => def.frameName.replace('{anim}', an).replace('{dir}', dir).replace('{i}', i));
      for (const suffix of a.deskOverlay ? ['', '_desk'] : ['']) {
        const fr = names.map((n) => n + suffix).filter((n) => { M.frames++; const ok = tex.exists(atlas) && tex.get(atlas).has(n); if (!ok) M.missing.push(atlas + ':' + n); return ok; });
        if (a.aliasOf) fr.forEach((n, i) => {      // an alias frame IS its source frame (same rectangle, no texture)
          const src = def.frameName.replace('{anim}', a.aliasOf.anim).replace('{dir}', dir).replace('{i}', a.aliasOf.from + i) + suffix;
          const A = tex.get(atlas).get(n), B = tex.get(atlas).get(src);
          if (!B || A.cutX !== B.cutX || A.cutY !== B.cutY || A.cutWidth !== B.cutWidth || A.cutHeight !== B.cutHeight) M.aliasBad.push(n);
        });
        const k = key + ':' + an + ':' + dir + (suffix ? ':desk' : '');
        if (!scene.anims.exists(k)) scene.anims.create({ key: k, frames: fr.map((f, i) => (hold[i] ? { key: atlas, frame: f, duration: hold[i] } : { key: atlas, frame: f })),
          frameRate: a.fps, repeat: a.repeat ?? -1, repeatDelay: a.repeatDelay || 0 });
        M.anims.push(k);
      }
    }
  }
}
// Character.play: a mirrored dir plays its source dir flipped
function chief(scene, def, an, dir, x, y, depth, desk) {
  const src = MIRROR[dir] || dir, flip = !!MIRROR[dir];
  const s = scene.add.sprite(x, y, def.anims[an].atlas || def.atlas).setOrigin(def.anchor[0], def.anchor[1]).setFlipX(flip).setDepth(depth);
  s.play('player:' + an + ':' + src);
  let top = null;
  if (desk && def.anims[an].deskOverlay) {
    top = scene.add.sprite(x, y, def.anims[an].atlas).setOrigin(def.anchor[0], def.anchor[1]).setFlipX(flip).setDepth(desk);
    top.play('player:' + an + ':' + src + ':desk');
  }
  // an intro anim names its loop (sit_read_in -> sit_read_loop): chain it, sprite and overlay together
  const nx = def.anims[an].next;
  if (nx) s.once('animationcomplete', () => { s.play('player:' + nx + ':' + src); if (top) top.play('player:' + nx + ':' + src + ':desk'); });
  return { s, top };
}
`;

const DESK = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#c9d6e8}</style>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
const j = async (p) => (await fetch(p)).json();
const chars = await j('assets/characters/manifest.json'), c2 = await j('assets/chief2/manifest.json');
window.__C = { ready: false, missing: [], anims: [], frames: 0 };
${SHARED}
class S extends Phaser.Scene {
  preload() {
    for (const a of chars.atlases) if (a.key === 'char_player') this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const a of c2.atlases) this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
  }
  create() {
    const C = window.__C;
    const merged = mergeExtends(Object.assign({}, chars.characters, c2.characters));
    const def = merged.player;
    C.def = { anims: Object.keys(def.anims), headTop: def.headTop, headTopSit: def.headTopSit };
    buildChar(this, 'player', def, C);
    const g = this.add.graphics().setDepth(-10);
    const rows = [['idle', 'old'], ['walk', 'old'], ...Object.keys(c2.characters.player_b.anims).map((a) => [a, 'new'])];
    const dirs = ['S', 'SE', 'E', 'SW', 'W'];
    rows.forEach(([an, src], r) => {
      const y = 104 + r * 112;
      g.fillStyle(r % 2 ? 0xd3deec : 0xc9d6e8, 1); g.fillRect(0, y - 104, 1180, 112);
      g.fillStyle(0xe8eef6, 1); g.fillRect(170, y - 8, 1010, 16);
      this.add.text(10, y - 60, an + (src === 'old' ? '  (char_player)' : ''), { font: '700 15px sans-serif', color: '#2b2f3a' });
      const a = def.anims[an];
      this.add.text(10, y - 38, a.frames + ' f  ' + a.fps + ' fps' + (a.seated ? '  seated' : '') + (a.loopFrom ? '  loopFrom ' + a.loopFrom : ''), { font: '12px sans-serif', color: '#4a5060' });
      dirs.forEach((d, c) => {
        const x = 250 + c * 200;
        g.fillStyle(0x5a6e8c, 0.22); g.fillEllipse(x, y, 46, 18);
        chief(this, def, an, d, x, y, y);
        if (r === 0) this.add.text(x - 10, 0, d, { font: '700 13px sans-serif', color: '#2b2f3a' });
      });
    });
    C.scene = this; C.ready = true;
  }
}
window.__C.game = new Phaser.Game({ type: Phaser.WEBGL, width: 1180, height: 1580, backgroundColor: '#c9d6e8', render: { antialias: true }, scene: S, banner: false });
</script></body></html>`;

const PHONE = (ZOOM) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:#dbe6f2;height:100%;overflow:hidden}#game{width:100%;height:100%}</style>
<script src="lib/phaser.min.js"></script></head><body><div id="game"></div><script type="module">
const j = async (p) => (await fetch(p)).json();
const chars = await j('assets/characters/manifest.json'), c2 = await j('assets/chief2/manifest.json');
const off = await j('assets/office/manifest.json'), props = await j('assets/props/manifest.json'), life = await j('assets/life_props/manifest.json');
const v1 = await j('assets/villagers/manifest.json');
const W = 720, H = Math.round(720 * innerHeight / innerWidth);
const k = Math.round(Math.max(1, Math.min(2, innerWidth * devicePixelRatio / 720)) * 20) / 20;
window.__R = { ready: false, k, missing: [], anims: [], frames: 0 };
${SHARED}
class S extends Phaser.Scene {
  preload() {
    const L = this.load, want = (M, keys) => { for (const a of M.atlases) if (keys.includes(a.key)) L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json); };
    want(chars, ['char_player']); want(c2, ['char_player_b']); want(off, ['office_bld']);
    want(props, [props.sprites.campfire.atlas]); want(life, ['life_props']); want(v1, ['vil_npc_aunt']);
  }
  create() {
    const R = window.__R, cam = this.cameras.main;
    cam.setBackgroundColor('#f4f7fb');
    const merged = mergeExtends(Object.assign({}, chars.characters, c2.characters)), def = merged.player;
    buildChar(this, 'player', def, R);
    const g = this.add.graphics().setDepth(-1e5);
    g.fillStyle(0xc9d1db, 1); g.fillPoints([{ x: -1400, y: 520 }, { x: 900, y: -630 }, { x: 1150, y: -505 }, { x: -1150, y: 645 }], true);
    // the office, revealed (cut state), every layer at the anchor, depth = anchor y + depthOffsets
    const co = off.sprites.chief_office, X = 0, Y = 160;
    for (const item of co.drawOrder) {
      if (item.startsWith('@') || item === 'chief_office_glow') continue;
      const s = off.sprites[item];
      const o = this.add.sprite(X, Y, s.atlas, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(Y + co.depthOffsets[item]);
      if (item === co.fade.layer) o.setAlpha(co.fade.openAlpha);
    }
    const dp = co.chiefDeskPoint;
    R.desk = chief(this, def, 'sit_read_in', co.chiefDeskDir, X + dp[0], Y + dp[1], Y + co.bandDepth.behind + dp[1] * 1e-6,
      Y + co.depthOffsets.chief_office_interior_front + 0.005);
    // outside on the snow
    const spr = (M, key, x, y, d) => { const s = M.sprites[key]; return this.add.sprite(x, y, s.atlas, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(d ?? y); };
    const shadow = (x, y) => { g.fillStyle(0x5a6e8c, 0.22); g.fillEllipse(x, y, 46, 18); };
    spr(props, 'campfire', -175, 600);
    shadow(-235, 572); chief(this, def, 'warm_hands', 'SE', -235, 572, 572);
    const ls = life.sprites.log_seat;
    spr(life, 'log_seat', -60, 700);
    const sp0 = ls.seatPoints[0];
    shadow(-60 + sp0[0], 700 + sp0[1] + c2.characters.player_b.seat.floorBelowPx);
    chief(this, def, 'doze', 'S', -60 + sp0[0], 700 + sp0[1], 700 + 0.5);
    shadow(120, 600); chief(this, def, 'talk', 'SE', 120, 600, 600);
    const aunt = v1.characters.npc_aunt, an = 'idle', fn = (i) => aunt.frameName.replace('{anim}', an).replace('{dir}', 'E').replace('{i}', i);
    this.anims.create({ key: 'aunt', frames: Array.from({ length: aunt.anims[an].frames }, (_, i) => ({ key: aunt.atlas, frame: fn(i) })), frameRate: 6, repeat: -1 });
    shadow(178, 628); this.add.sprite(178, 628, aunt.atlas, fn(0)).setOrigin(aunt.anchor[0], aunt.anchor[1]).setFlipX(true).setDepth(628).play('aunt');
    shadow(250, 500); chief(this, def, 'wave', 'S', 250, 500, 500);
    shadow(230, 740); chief(this, def, 'cheer', 'SW', 230, 740, 740);
    shadow(70, 780); chief(this, def, 'idle', 'S', 70, 780, 780);
    // (polish) the re-posed anims in more dirs: wave W / SE (train watching from the side), cheer S / E with the pennant
    shadow(-200, 880); chief(this, def, 'wave', 'W', -200, 880, 880);
    shadow(-50, 900); chief(this, def, 'cheer', 'S', -50, 900, 900);
    shadow(110, 900); chief(this, def, 'cheer', 'E', 110, 900, 900);
    shadow(270, 870); chief(this, def, 'wave', 'SE', 270, 870, 870);
    cam.setZoom(${ZOOM} * k); cam.centerOn(${ZOOM} < 0.9 ? 0 : 10, ${ZOOM} < 0.9 ? 280 : ${ZOOM} > 1.4 ? 560 : 400);
    R.scene = this; R.ready = true;
  }
}
window.__R.game = new Phaser.Game({ type: Phaser.WEBGL, parent: 'game', width: Math.round(W * k), height: Math.round(H * k), backgroundColor: '#dbe6f2',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, render: { antialias: true, roundPixels: false }, scene: S, banner: false });
</script></body></html>`;

const OFFICE = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#c9d6e8}</style>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
const j = async (p) => (await fetch(p)).json();
const chars = await j('assets/characters/manifest.json'), c2 = await j('assets/chief2/manifest.json');
const off = await j('assets/office/manifest.json'), emo = await j('assets/emotes/manifest.json');
window.__O = { ready: false, missing: [], anims: [], frames: 0, panels: [] };
${SHARED}
class S extends Phaser.Scene {
  preload() {
    const L = this.load, want = (M, keys) => { for (const a of M.atlases) if (keys.includes(a.key)) L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json); };
    want(chars, ['char_player']); want(c2, ['char_player_b']); want(off, ['office_bld']);
    const z = emo.sprites && emo.sprites.emote_zzz;
    if (z) want(emo, [z.atlas]);
  }
  create() {
    const O = window.__O;
    const merged = mergeExtends(Object.assign({}, chars.characters, c2.characters)), def = merged.player;
    buildChar(this, 'player', def, O);
    const co = off.sprites.chief_office, dp = co.chiefDeskPoint, Z = 3;
    const panels = [['sit_read_in', 'sit_read_in -> sit_read_loop + _desk'],
                    ['sit_eat', 'sit_eat + _desk overlay'],
                    ['doze', '22:00 doze on the desk chair + zzz']];
    panels.forEach(([an, label], k) => {
      const cam = k ? this.cameras.add(k * 400, 0, 400, 560) : this.cameras.main.setViewport(0, 0, 400, 560);
      const X = k * 3000, Y = 0;
      for (const item of co.drawOrder) {
        if (item.startsWith('@') || item === 'chief_office_glow') continue;
        const s = off.sprites[item];
        const o = this.add.sprite(X, Y, s.atlas, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(Y + co.depthOffsets[item]);
        if (item === co.fade.layer) o.setAlpha(co.fade.openAlpha);
      }
      const c = chief(this, def, an, co.chiefDeskDir, X + dp[0], Y + dp[1], Y + co.bandDepth.behind + dp[1] * 1e-6,
        Y + co.depthOffsets.chief_office_interior_front + 0.005);
      O.panels.push(c);
      const zz = emo.sprites && emo.sprites.emote_zzz;
      if (an === 'doze' && zz) this.add.sprite(X + dp[0] + 6, Y + dp[1] + def.headTopSit - 4, zz.atlas, zz.frame).setOrigin(0.5, 1).setDepth(Y + 1).setScale(0.6);
      cam.setZoom(Z).centerOn(X + dp[0], Y + dp[1] - 30).setBackgroundColor('#e9eef5');
      this.add.text(X + dp[0] - 64, Y + dp[1] - 112, label, { font: '700 5px sans-serif', color: '#2b2f3a', resolution: 4 }).setDepth(1e6);
    });
    O.scene = this; O.ready = true;
  }
}
window.__O.game = new Phaser.Game({ type: Phaser.WEBGL, width: 1200, height: 560, backgroundColor: '#c9d6e8', render: { antialias: true }, scene: S, banner: false });
</script></body></html>`;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const errors = [], notFound = [];
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) notFound.push(r.url()); });
};
const PREV = path.join(ROOT, 'docs', 'previews');
fs.mkdirSync(PREV, { recursive: true });

// 1) desktop
const ctx = await browser.newContext({ viewport: { width: 1180, height: 1580 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
watch(page);
await page.route('**/fv/__chief2.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: DESK }));
await page.goto(srv.url + '__chief2.html', { waitUntil: 'load' });
await page.waitForFunction(() => window.__C && window.__C.ready, null, { timeout: 240000 });
const f0 = await page.evaluate(() => window.__C.scene.children.list.filter((o) => o.anims && o.anims.currentFrame).map((o) => o.anims.currentFrame.index));
await sleep(1300);
const res = await page.evaluate((f0) => {
  const C = window.__C, list = C.scene.children.list.filter((o) => o.anims && o.anims.currentFrame);
  const playing = list.filter((o) => o.anims.isPlaying).length;
  const moved = list.filter((o, i) => o.anims.currentFrame.index !== f0[i]).length;
  return { def: C.def, anims: C.anims.length, framesChecked: C.frames, missing: C.missing, aliasBad: C.aliasBad, sprites: list.length, playing, advanced: moved,
    cheerRepeatDelay: C.scene.anims.get('player:cheer:S').repeatDelay, dozeHoldMs: C.scene.anims.get('player:doze:S').frames[2].duration,
    readNow: list.filter((o) => o.anims.currentAnim && o.anims.currentAnim.key.startsWith('player:sit_read_')).map((o) => o.anims.currentAnim.key).slice(0, 3) };
}, f0);
await page.screenshot({ path: path.join(PREV, 'chief2_phaser.png') });
await ctx.close();

// 2) phone shots
const shots = [];
for (const [z, name] of [[0.6, 'chief2_phone_z06'], [1.0, 'chief2_phone_z10'], [1.2, 'chief2_phone_z12'], [1.6, 'chief2_phone_z16']]) {
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const pp = await pctx.newPage();
  watch(pp);
  await pp.route('**/fv/__' + name + '.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: PHONE(z) }));
  await pp.goto(srv.url + '__' + name + '.html', { waitUntil: 'load' });
  await pp.waitForFunction(() => window.__R && window.__R.ready, null, { timeout: 240000 });
  await sleep(1800);
  const info = await pp.evaluate(() => {
    const R = window.__R;
    return { k: R.k, missing: R.missing.length, zoom: R.scene.cameras.main.zoom, deskOverlay: !!(R.desk && R.desk.top && R.desk.top.anims.isPlaying),
      deskFrame: R.desk.s.frame.name, topFrame: R.desk.top && R.desk.top.frame.name };
  });
  await pp.evaluate(() => window.__R.game.loop.sleep());
  const out = path.join(PREV, name + '.png');
  await pp.screenshot({ path: out, timeout: 180000 });
  shots.push({ file: path.relative(ROOT, out), ...info, cssPerWorldPx: +(info.zoom * 390 / (720 * info.k)).toFixed(3),
    chiefCssPx: +(80 * info.zoom * 390 / (720 * info.k)).toFixed(1) });
  await pctx.close();
}
res.phone = shots;

// 3) office close-up: reading loop (aliases, overlay), lunch, and the 22:00 doze on the desk chair + zzz
{
  const octx = await browser.newContext({ viewport: { width: 1200, height: 560 }, deviceScaleFactor: 1 });
  const op = await octx.newPage();
  watch(op);
  await op.route('**/fv/__chief2_office.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: OFFICE }));
  await op.goto(srv.url + '__chief2_office.html', { waitUntil: 'load' });
  await op.waitForFunction(() => window.__O && window.__O.ready, null, { timeout: 240000 });
  await sleep(1500);
  const oi = await op.evaluate(() => { const O = window.__O; return { missing: O.missing.length, aliasBad: O.aliasBad.length,
    panels: O.panels.map((p) => ({ anim: p.s.anims.currentAnim && p.s.anims.currentAnim.key, frame: p.s.frame.name, top: p.top && p.top.frame.name })) }; });
  await op.evaluate(() => window.__O.game.loop.sleep());
  await op.screenshot({ path: path.join(PREV, 'chief2_office_close.png') });
  res.office = oi;
  await octx.close();
}
console.log(JSON.stringify(res, null, 1));
if (errors.length) console.log('ERRORS', errors.slice(0, 10));
if (notFound.length) console.log('404', notFound.slice(0, 10));
fs.mkdirSync(OUTJ, { recursive: true });
fs.writeFileSync(path.join(OUTJ, 'chief2_phaser.json'), JSON.stringify({ res, errors, notFound }, null, 1));
await browser.close();
await srv.close();
const bad = errors.length || notFound.length || res.missing.length || res.aliasBad.length || res.playing < res.sprites || res.advanced < res.sprites * 0.8 ||
  shots.some((s) => s.missing || !s.deskOverlay) || res.cheerRepeatDelay !== 600 || !(res.dozeHoldMs > 0) ||
  res.office.missing || res.office.aliasBad || !res.office.panels.every((p) => p.anim);
console.log(bad ? 'chief2_phaser: FAIL' : 'chief2_phaser: OK');
process.exit(bad ? 1 : 0);
