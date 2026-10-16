// 촌장 사무실 fragment (assets/office, CONTRACT_V42 section AI) in headless Chromium with Phaser 3.90.
//   node tools/test/office_phaser.mjs
// (polish, docs/build_reports/v42_office_critique.md) the building is drawn by the GAME's own renderer
// src/entities/Cutaway.js (imported unchanged; an import map swaps its ../core/Assets.js for a 20-line shim that reads
// assets/office/manifest.json) and the people are the real ones: officefolk (tools/officefolk_compose.js, townfolk +
// townfolk2 + officefolk) at the desks / work spots / bench and the chief from chief2 (sit_write + its `_desk` forearm
// overlay at his desk, idle at his pad).
// 1) DESKTOP (1500 x 1000): every sprite / layer / overlay / anim / state frame resolves; anims registered like
//    src/core/Assets.js (spr:<key>:<anim>); Cutaway.js builds the office; REVEAL TOGGLE: a tap inside revealPoly
//    reveals (Cutaway.update fades the shell to openAlpha, _shell_cut in, inside layers on), a second tap closes, a tap
//    outside does nothing.  H1 PIXEL TEST: the same office drawn twice side by side - Cutaway.js closed vs the
//    documented closed look (_shell + _props only) - must give the same pixels (by day; the night glow is not in
//    cutaway.drawOrder).
// 2) PHONE (390 x 844 CSS px at DPR 3, 720 logical px like src/main.js, k = 1.65): the office at its plan spot
//    WORLD.v42.office (110, 810) next to the civic bank (-340, 570), staff at work, at camera zoom 0.6 / 1.0 / 1.2
//    (x k) revealed, + night closed (glow + DayClock lights) and night revealed (lightPointsOpen).
// OFFICE_DIR=<dir> runs it on a candidate pack instead of assets/office.
// Writes docs/previews/off_phaser.png, off_phaser_closed.png, off_phone_z06 / _z10 / _z12 / _night / _night_open.png
// and /tmp/fv_cache/office/office_phaser.json.  Exit 1 on missing frames, page errors, 404s, a reveal toggle that does
// not work or a closed look that differs from the documented one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, sleep } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUTJ = '/tmp/fv_cache/office';

// ---- the Assets shim the real Cutaway.js imports (def / image / texOf are all it uses) ------------------------------
const SHIM = `export const Assets = {
  man: null,
  def(key) { return (this.man && this.man.sprites[key]) || null; },
  image(gs, x, y, key) { const d = this.def(key); return gs.add.image(x, y, d.atlas, d.frame).setOrigin(d.anchor[0], d.anchor[1]); },
  texOf(atlas) { return atlas; },
};`;

// ---- shared in-page code ------------------------------------------------------------------------------------------
const PAGE_JS = `
import { Cutaway } from './src/entities/Cutaway.js';
import { Assets } from './src/core/Assets.js';
import { townfolkPreload, townfolkInstall, mulberry32 } from './tools/townfolk_compose.js';
import { mergeOfficefolk, Officefolk, OfficefolkSprite } from './tools/officefolk_compose.js';
const j = async (p) => (await fetch(p)).json();
const man = await j('assets/office/manifest.json');
Assets.man = man;
const tfMan = mergeOfficefolk(await j('assets/townfolk/manifest.json'), await j('assets/townfolk2/manifest.json'), await j('assets/officefolk/manifest.json'));
const c2 = await j('assets/chief2/manifest.json'), chars = await j('assets/characters/manifest.json');
const town = await j('assets/town/manifest.json'), civ = await j('assets/civic/manifest.json'), props = await j('assets/props/manifest.json');
const C = man.sprites.chief_office;
const SH = 0.5;
function shearText(scene, key, text, w, h, color) {
  // the game's way to write on a sheared board: a canvas texture drawn with a y-shear transform
  const pad = Math.ceil(Math.abs(SH) * w / 2) + 2, S = 3;
  const tex = scene.textures.createCanvas(key, w * S, (h + 2 * pad) * S), c = tex.context;
  c.setTransform(S, SH * S, 0, S, 0, (pad - SH * w / 2) * S);
  let size = h; c.font = '700 ' + size + 'px sans-serif';
  while (size > 6 && (c.measureText(text).width > w * 0.94 || size > h * 0.86)) { size--; c.font = '700 ' + size + 'px sans-serif'; }
  c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 1);
  tex.refresh();
  return { key, pad };
}
function shearBars(g, cx, cy, w, h) {
  const cols = [0x7ac478, 0xf2c14e, 0x78b4e6, 0xe8746a, 0xc8a0e6], vals = [0.82, 0.55, 0.68, 0.22, 0.9];
  const bw = (w - 8) / 5;
  for (let i = 0; i < 5; i++) {
    const x0 = -w / 2 + 4 + i * bw + 2, x1 = x0 + bw - 4, yb = h / 2 - 4, yt = yb - (h - 10) * vals[i];
    const P = (x, y) => ({ x: cx + x, y: cy + y + SH * x });
    g.fillStyle(cols[i], 0.92); g.fillPoints([P(x0, yt), P(x1, yt), P(x1, yb), P(x0, yb)], true);
  }
}
function registerAnims(scene, M) {
  const tex = scene.textures, has = (a, f) => tex.exists(a) && tex.get(a).has(f);
  for (const [k, s] of Object.entries(man.sprites)) {
    M.frames++;
    if (!has(s.atlas, s.frame)) M.missing.push(k + ':' + s.frame);
    for (const f of s.frames || []) { M.frames++; if (!has(s.atlas, f)) M.missing.push(k + ':' + f); }
    for (const [st, f] of Object.entries(s.states || {})) if (!has(s.atlas, f)) M.missing.push(k + '.state.' + st);
    for (const [an, a] of Object.entries(s.anims || {})) {
      const fr = a.frames.filter((f) => has(s.atlas, f)).map((f) => ({ key: s.atlas, frame: f }));
      M.frames += a.frames.length;
      if (fr.length !== a.frames.length) M.missing.push(k + '.' + an);
      const key = 'spr:' + k + ':' + an;
      if (!scene.anims.exists(key)) scene.anims.create({ key, frames: fr, frameRate: a.fps || 8, repeat: a.repeat ?? -1 });
      M.anims.push(key);
    }
  }
}
function preloadAll(scene, extra) {
  const L = scene.load;
  for (const a of man.atlases) L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
  townfolkPreload(scene, tfMan, 'assets/');
  for (const a of c2.atlases) L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
  for (const a of chars.atlases) if (a.key === 'char_player') L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
  if (extra) {
    for (const a of civ.atlases) if (a.key === civ.sprites.bank.atlas) L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const a of props.atlases) if (a.key === props.sprites.tree_pine_snow?.atlas) L.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
  }
}
function shadowTex(scene) {
  if (scene.textures.exists('fv_shadow')) return;
  const c = scene.textures.createCanvas('fv_shadow', 64, 32), x = c.context;
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(40,55,90,0.42)'); g.addColorStop(0.6, 'rgba(40,55,90,0.22)'); g.addColorStop(1, 'rgba(40,55,90,0)');
  x.save(); x.scale(1, 0.5); x.fillStyle = g; x.beginPath(); x.arc(32, 32, 32, 0, Math.PI * 2); x.fill(); x.restore(); c.refresh();
}
// the office the way the GAME draws it: src/entities/Cutaway.js (+ the sign text, board bars, night glow, mailbox and
// people the code adds around it, per the manifest conventions)
function office(scene, X, Y, opts) {
  const gs = scene;
  const cw = new Cutaway(gs, 'chief_office', X, Y, {});
  const order = C.cutaway.drawOrder, base = Y, idx = (n) => order.indexOf(n);
  const st = { cw, X, Y, people: [], extras: [], open: false, C };
  // sign text: alpha = shell alpha, hidden below hideBelowShellAlpha
  const sr = C.signRect, tx = shearText(scene, 'off_sign_' + X + '_' + Y, sr.text.ko, sr.widthPx, sr.heightPx, sr.color);
  st.sign = scene.add.image(X + sr.point[0], Y + sr.point[1], tx.key).setScale(1 / 3).setDepth(base + 0.01 * idx('chief_office_shell') + 0.001);
  st.board = scene.add.graphics().setDepth(base + 0.01 * idx('chief_office_back') + 0.001);
  shearBars(st.board, X + C.boardRect.point[0], Y + C.boardRect.point[1], C.boardRect.widthPx, C.boardRect.heightPx);
  // night glow: not in cutaway.drawOrder; the code draws night[] only while closed at night
  const g = man.sprites[C.cutaway.night[0]];
  st.glow = scene.add.image(X, Y, g.atlas, g.frame).setOrigin(g.anchor[0], g.anchor[1]).setDepth(base + 0.01 * idx('chief_office_shell') + 0.005).setVisible(false);
  // the mailbox: outside, depth max(y, building top + 0.01) when in front (frontTest)
  const top = base + 0.01 * order.length;
  for (const op of C.outdoorProps) {
    const s = man.sprites[op.sprite], x = op.point[0], y = op.point[1];
    const o = scene.add.sprite(X + x, Y + y, s.atlas, opts.flagUp ? s.states.up : s.frame).setOrigin(s.anchor[0], s.anchor[1]);
    const front = (y - x / 2 > C.frontTest.a) || (y + x / 2 > C.frontTest.b);
    o.setDepth(front ? Math.max(Y + y, top + 0.01) + y * 1e-6 : Y + y);
    st.mailbox = o;
  }
  st.poly = new Phaser.Geom.Polygon(C.revealPoly.map((p) => new Phaser.Geom.Point(X + p[0], Y + p[1])));
  st.sync = (night) => {
    const a = cw.alpha, sa = cw.layers[cw.fade.layer].alpha;
    st.sign.setAlpha(sa >= (sr.hideBelowShellAlpha || 0) ? sa : 0);
    st.board.setVisible(a > 0.02);
    st.glow.setVisible(!!night && a < 0.02);
    for (const p of st.people) p.vis(a > 0.02 || p.slot === 'outside');
  };
  return st;
}
// people, with the game's depth rules: inside bands = cw.slotDepth('@behind' | '@front', y); inside contact shadows
// right after _floor; the chief's desk overlay right after _interior_front
function addPeople(scene, st, tf, rng, opts) {
  const { cw, X, Y } = st, base = Y, order = C.cutaway.drawOrder, at = (n) => base + 0.01 * order.indexOf(n);
  const P = (p) => [X + p[0], Y + p[1]];
  shadowTex(scene);
  const add = (who, anim, dir, pt, slot, seated, item) => {
    const [x, y] = P(pt);
    const p = typeof who === 'string' ? tf.preset(who, rng) : who;
    const s = new OfficefolkSprite(scene, tf, p, x, y);
    s.play(anim, dir); s.frame = Math.floor(rng() * tf.T.anims[s.anim].frames); s.refresh(true);
    s.depthBase = slot === 'outside' ? y : cw.slotDepth('@' + slot, y); s.place();
    const sh = scene.add.image(x, y + (seated ? 25 : 0), 'fv_shadow').setDisplaySize(seated ? 46 : 52, seated ? 21 : 23)
      .setDepth(slot === 'outside' ? y - 0.5 : at('chief_office_floor') + 0.005);
    let it = null;
    if (item) { const d = man.sprites[item]; it = scene.add.image(x, y - 92, d.atlas, d.frame).setOrigin(0.5, 0.86).setScale(d.carryScale || 0.65).setDepth(s.depthBase + 0.003); }
    const rec = { s, slot, on: true, vis(v) {
      if (v === this.on) return;
      this.on = v;
      if (v) s.refresh(true); else for (const q of s.sprites) q.setVisible(false);
      sh.setVisible(v); if (it) it.setVisible(v);
    } };
    st.people.push(rec);
    return s;
  };
  const chief = (anim, dir, pt, slot, seated) => {
    const [x, y] = P(pt);
    const mir = { SW: 'SE', W: 'E', NW: 'NE' }, d = mir[dir] || dir;
    const isB = !!c2.characters.player_b.anims[anim];
    const atlas = isB ? 'char_player_b' : 'char_player', A = (isB ? c2.characters.player_b : chars.characters.player).anims[anim];
    const key = 'chief:' + anim + ':' + d;
    if (!scene.anims.exists(key)) scene.anims.create({ key, frames: Array.from({ length: A.frames }, (_, i) => ({ key: atlas, frame: anim + '_' + d + '_' + i })), frameRate: A.fps, repeat: -1 });
    const depth = slot === 'outside' ? y : cw.slotDepth('@' + slot, y);
    const s = scene.add.sprite(x, y, atlas, anim + '_' + d + '_0').setOrigin(0.5, 0.8125).setFlipX(!!mir[dir]).setDepth(depth);
    s.play(key);
    const sh = scene.add.image(x, y + (seated ? 25 : 0), 'fv_shadow').setDisplaySize(52, 23).setDepth(slot === 'outside' ? y - 0.5 : at('chief_office_floor') + 0.005);
    let dk = null;
    const DO = c2.characters.player_b.deskOverlay;
    if (seated && DO && DO.anims.includes(anim)) {
      // chief2's forearms / quill over the desk top: right after _interior_front, same frame index + flip
      const dkey = key + ':desk';
      if (!scene.anims.exists(dkey)) scene.anims.create({ key: dkey, frames: Array.from({ length: A.frames }, (_, i) => ({ key: atlas, frame: anim + '_' + d + '_' + i + DO.suffix })), frameRate: A.fps, repeat: -1 });
      dk = scene.add.sprite(x, y, atlas, anim + '_' + d + '_0' + DO.suffix).setOrigin(0.5, 0.8125).setFlipX(!!mir[dir]).setDepth(at('chief_office_interior_front') + 0.005);
      dk.play(dkey);
    }
    st.people.push({ slot, on: true, vis(v) { this.on = v; s.setVisible(v); sh.setVisible(v); if (dk) dk.setVisible(v); } });
    return s;
  };
  const roles = [['office_a', 'desk_write'], ['office_b', 'desk_type'], ['secretary', 'desk_phone'], ['courier', 'desk_count']];
  const bands = C.deskBands || C.deskPoints.map(() => 'behind');
  C.deskPoints.forEach((q, i) => add(roles[i][0], roles[i][1], C.deskDirs[i], q, bands[i], true));
  chief('sit_write', C.chiefDeskDir, C.chiefDeskPoint, 'behind', true);
  C.seatPoints.forEach((q, i) => add(tf.randomPerson(rng), 'sit', C.seatDirs[i], q, 'front', true));
  if (opts.busy) {
    // a standing person at the board and at the safe
    add('office_a', 'point_board', C.boardDir, C.boardPoint, 'behind', false);
    add('courier', 'scoop', C.safeDir, C.safePoint, 'front', false);
  }
  add('postal', 'idle', C.mailboxDir, C.mailboxPoint, 'outside', false, 'item_letter_bundle');
  if (opts.chiefOut) chief('idle', 'NE', [C.doorPoint[0] - 30, C.doorPoint[1] + 40], 'outside', false);
}
function play(scene, st, alert) {
  const { cw } = st;
  for (const n of Object.keys(C.overlays)) {
    const key = 'chief_office_' + n, s = man.sprites[key], im = cw.layers[key];
    if (!im) continue;
    const spr = scene.add.sprite(im.x, im.y, s.atlas, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(im.depth);
    im.setVisible(false);
    cw.layers[key] = spr;           // Cutaway.apply() keeps driving visibility
    if (s.anims && n !== 'safe') spr.play('spr:' + key + ':' + Object.keys(s.anims)[0]);
    if (n === 'safe') spr.play({ key: 'spr:chief_office_safe:open', repeat: -1, repeatDelay: 1200, yoyo: true });
    if (s.states && n.startsWith('lamp')) spr.setFrame(s.states[alert && n === 'lamp_a' ? 'alert' : 'warm']);
  }
  if (st.mailbox) st.mailbox.play({ key: 'spr:office_mailbox:pop', repeat: -1, repeatDelay: 1400 });
}
function nightLook(scene, st, open) {
  const a = 0.45, C0 = 0x5a6aa8, mix = (ch) => Math.round(255 * (1 - a) + ch * a);
  const ov = scene.add.image(-4000, -4000, '__WHITE').setOrigin(0, 0).setDisplaySize(9000, 9000).setDepth(1e6).setBlendMode(Phaser.BlendModes.MULTIPLY);
  ov.setTint((mix((C0 >> 16) & 255) << 16) | (mix((C0 >> 8) & 255) << 8) | mix(C0 & 255));
  const s = 96, ct = scene.textures.createCanvas('fv_glow', s, s), c = ct.context;
  const gr = c.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,236,180,0.95)'); gr.addColorStop(0.25, 'rgba(255,214,140,0.55)');
  gr.addColorStop(0.6, 'rgba(255,190,110,0.16)'); gr.addColorStop(1, 'rgba(255,180,100,0)');
  c.fillStyle = gr; c.fillRect(0, 0, s, s); ct.refresh();
  for (const p of open ? C.night.lightPointsOpen : C.night.lightPoints) scene.add.image(st.X + p[0], st.Y + p[1], 'fv_glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(1e6 + 1).setScale(1.0).setAlpha(0.64);
}
`;

const DESK = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#eef3f9}</style>
<script type="importmap">{"imports": {"/fv/src/core/Assets.js": "/fv/__assets_shim.js"}}</script>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
${PAGE_JS}
window.__O = { ready: false, missing: [], anims: [], frames: 0 };
class S extends Phaser.Scene {
  preload() { preloadAll(this, false); }
  create() {
    const O = window.__O;
    townfolkInstall(this, tfMan);
    registerAnims(this, O);
    const tf = new Officefolk(tfMan.townfolk), rng = mulberry32(7);
    const st = office(this, 470, 560, { flagUp: false });
    addPeople(this, st, tf, rng, { busy: true });
    play(this, st, true);
    st.sync(false);
    // items: 1x 3-high stacks + 2x, the mailbox frames at 1.5x
    let x = 900;
    for (const k of ['item_coin_sack_s', 'item_coin_sack_m', 'item_coin_sack_l', 'item_letter_bundle', 'item_newspaper_bundle', 'item_ledger']) {
      const s = man.sprites[k];
      for (let i = 0; i < 3; i++) this.add.image(x, 820 - i * s.stackStep, s.atlas, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(3000 + i);
      this.add.image(x, 960, s.atlas, s.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(3000).setScale(2);
      x += 92;
    }
    const mb = man.sprites.office_mailbox;
    ['office_mailbox', ...mb.anims.pop.frames].forEach((f, i) => this.add.image(960 + i * 120, 640, mb.atlas, f).setOrigin(mb.anchor[0], mb.anchor[1]).setScale(1.5).setDepth(3000));
    O.st = st;
    this.input.on('pointerdown', (p) => { if (Phaser.Geom.Polygon.Contains(st.poly, p.x, p.y)) { st.cw.reveal(!st.cw.revealed); O.toggles = (O.toggles || 0) + 1; } });
    O.scene = this; O.ready = true;
  }
  update(t, dt) { const O = window.__O; if (!O.st) return; O.st.cw.update(dt / 1000); O.st.sync(false); for (const p of O.st.people) if (p.s && p.on) { p.s.update(dt); p.s.place(); } }
}
window.__O.game = new Phaser.Game({ type: Phaser.WEBGL, width: 1500, height: 1000, backgroundColor: '#eef3f9',
  render: { antialias: true, preserveDrawingBuffer: true }, scene: S, banner: false });
</script></body></html>`;

// H1: two closed offices side by side on a plain background - left Cutaway.js (alpha 0, the game's renderer), right the
// documented closed look (_shell + _props only) - read back from the WebGL canvas and compared pixel for pixel
const PAIR = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#eef3f9}</style>
<script type="importmap">{"imports": {"/fv/src/core/Assets.js": "/fv/__assets_shim.js"}}</script>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
${PAGE_JS}
window.__P = { ready: false };
class S extends Phaser.Scene {
  preload() { for (const a of man.atlases) this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json); }
  create() {
    const P = window.__P, fw = C.frameSize[0], fh = C.frameSize[1], ax = C.anchor[0] * fw, ay = C.anchor[1] * fh;
    const A = [Math.round(ax) + 20, Math.round(ay) + 20], B = [A[0] + fw + 40, A[1]];
    const cw = new Cutaway(this, 'chief_office', A[0], A[1], {});
    ['chief_office_shell', 'chief_office_props'].forEach((k, i) => { const d = man.sprites[k]; this.add.image(B[0], B[1], d.atlas, d.frame).setOrigin(d.anchor[0], d.anchor[1]).setDepth(B[1] + i * 0.01); });
    P.cmp = () => new Promise((res) => this.game.renderer.snapshot((img) => {
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const c = cv.getContext('2d'); c.drawImage(img, 0, 0);
      const ga = c.getImageData(A[0] - Math.round(ax), A[1] - Math.round(ay), fw, fh).data;
      const gb = c.getImageData(B[0] - Math.round(ax), B[1] - Math.round(ay), fw, fh).data;
      let n = 0, worst = 0;
      for (let i = 0; i < ga.length; i += 4) {
        const d = Math.max(Math.abs(ga[i] - gb[i]), Math.abs(ga[i + 1] - gb[i + 1]), Math.abs(ga[i + 2] - gb[i + 2]));
        if (d > 6) n++;
        if (d > worst) worst = d;
      }
      res({ differingPx: n, worstDelta: worst, insideHiddenWhileClosed: [...cw.inside],
            drawnAlways: cw.order.filter((k) => k[0] !== '@' && !cw.inside.has(k) && k !== cw.fade.layer && k !== cw.cut) });
    }));
    P.ready = true;
  }
}
window.__P.game = new Phaser.Game({ type: Phaser.WEBGL, width: 1400, height: 600, backgroundColor: '#eef3f9',
  render: { antialias: true, preserveDrawingBuffer: true }, scene: S, banner: false });
</script></body></html>`;

const PHONE = (ZOOM, night, open) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:#dbe6f2;height:100%;overflow:hidden}#game{width:100%;height:100%}</style>
<script type="importmap">{"imports": {"/fv/src/core/Assets.js": "/fv/__assets_shim.js"}}</script>
<script src="lib/phaser.min.js"></script></head><body><div id="game"></div><script type="module">
${PAGE_JS}
const W = 720, H = Math.round(720 * innerHeight / innerWidth);
const k = Math.round(Math.max(1, Math.min(2, innerWidth * devicePixelRatio / 720)) * 20) / 20;
window.__R = { ready: false, k, missing: [], anims: [], frames: 0 };
const OX = 110, OY = 810, BX = -340, BY = 570;        // WORLD.v42.office / .bank
class S extends Phaser.Scene {
  preload() { preloadAll(this, true); }
  create() {
    const R = window.__R, cam = this.cameras.main;
    townfolkInstall(this, tfMan);
    registerAnims(this, R);
    cam.setBackgroundColor('#f4f7fb');
    const g = this.add.graphics().setDepth(-1e5);
    const road = (pts, w) => { g.lineStyle(w, 0xd6cbbd, 1); g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.strokePath(); for (const p of pts) { g.fillStyle(0xd6cbbd, 1); g.fillCircle(p[0], p[1], w / 2); } };
    road([[600, 830], [380, 930], [130, 985], [-120, 880]], 56);
    road([[-120, 880], [-170, 760], [-60, 640]], 56);
    road([[-458, 640], [-200, 760]], 34);
    road([[-62, 824], [-120, 880]], 30);
    g.fillStyle(0xf3d27a, 0.6); g.fillEllipse(-150, 905, 90, 45);       // the staff hire pad
    // the civic bank the way the game draws it (Cutaway.js, closed)
    Assets.man = civ; new Cutaway(this, 'bank', BX, BY, {}); Assets.man = man;
    if (props.sprites.tree_pine_snow) for (const [x, y] of [[420, 640], [-220, 1080], [520, 1120], [-560, 860], [280, 560], [-30, 1180]]) {
      const d = props.sprites.tree_pine_snow; this.add.image(x, y, d.atlas, d.frame).setOrigin(d.anchor[0], d.anchor[1]).setDepth(y);
    }
    const tf = new Officefolk(tfMan.townfolk), rng = mulberry32(5);
    const st = office(this, OX, OY, { flagUp: !${open} });
    addPeople(this, st, tf, rng, { busy: true, chiefOut: !${open} });
    play(this, st, false);
    if (${open}) { st.cw.reveal(true); st.cw.alpha = 1; st.cw.apply(); }
    st.sync(${night});
    if (${night}) nightLook(this, st, ${open});
    cam.setZoom(${ZOOM} * k); cam.centerOn(OX - 30, OY - (${ZOOM} < 0.9 ? 60 : 110));
    R.scene = this; R.st = st; R.ready = true;
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
  page.on('pageerror', (e) => errors.push(String(e && e.stack || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) notFound.push(r.url()); });
};
const route = async (page, name, body) => {
  await page.route('**/fv/__assets_shim.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: SHIM }));
  await page.route('**/fv/__' + name + '.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body }));
  // OFFICE_DIR=<dir>: test a candidate pack (e.g. off_pack.py --out <dir>) instead of assets/office
  if (process.env.OFFICE_DIR) {
    await page.route('**/fv/assets/office/*', (r) => {
      const f = path.join(process.env.OFFICE_DIR, path.basename(new URL(r.request().url()).pathname));
      if (!fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
      r.fulfill({ status: 200, contentType: f.endsWith('.json') ? 'application/json' : 'image/png', body: fs.readFileSync(f) });
    });
  }
};
const PREV = path.join(ROOT, 'docs', 'previews');
// a page that never gets ready: print what went wrong in it before failing
const ready = (pg, fn) => pg.waitForFunction(fn, null, { timeout: 240000 }).catch((e) => {
  console.log('NOT READY', String(e).split('\n')[0]);
  console.log('ERRORS', errors.slice(0, 10));
  console.log('404', notFound.slice(0, 10));
  process.exit(1);
});
fs.mkdirSync(PREV, { recursive: true });
// 1) desktop load + reveal toggle + the H1 pixel test
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
watch(page);
await route(page, 'office', DESK);
await page.goto(srv.url + '__office.html', { waitUntil: 'load' });
await ready(page, () => window.__O && window.__O.ready);
await sleep(1500);
await page.screenshot({ path: path.join(PREV, 'off_phaser_closed.png') });
const center = await page.evaluate(() => { const st = window.__O.st, c = st.C; return [st.X + c.chiefDeskPad[0], st.Y + c.chiefDeskPad[1] - 40]; });
const state = () => page.evaluate(() => { const st = window.__O.st, cw = st.cw; return { open: cw.revealed, alpha: +cw.alpha.toFixed(2), shell: +cw.layers[cw.fade.layer].alpha.toFixed(2), cut: +cw.layers[cw.cut].alpha.toFixed(2), cutVisible: cw.layers[cw.cut].visible, inside: [...cw.inside].every((k) => cw.layers[k].visible), glow: st.glow.visible }; });
const s0 = await state();
await page.mouse.click(center[0], center[1]);
await page.waitForFunction(() => window.__O.st.cw.alpha >= 1, null, { timeout: 20000, polling: 100 }).catch(() => {});
await sleep(500);
const s1 = await state();
await page.screenshot({ path: path.join(PREV, 'off_phaser.png') });
await page.mouse.click(center[0], center[1]);
await page.waitForFunction(() => window.__O.st.cw.alpha <= 0, null, { timeout: 20000, polling: 100 }).catch(() => {});
await sleep(300);
const s2 = await state();
await page.mouse.click(1450, 60);
await sleep(400);
const s3 = await state();
const res = await page.evaluate(() => {
  const O = window.__O, sc = O.scene;
  const playing = sc.children.list.filter((o) => o.anims && o.anims.isPlaying).length;
  return { anims: O.anims.length, framesChecked: O.frames, missing: O.missing, playing, people: O.st.people.length };
});
const revealOk = !s0.open && s0.shell === 1 && !s0.cutVisible && !s0.inside && s1.open && s1.shell <= 0.15 && s1.cut >= 0.9 && s1.inside &&
  !s2.open && s2.shell >= 0.95 && !s2.cutVisible && !s3.open;
res.reveal = { closed: s0, open: s1, closedAgain: s2, tapOutside: s3, ok: revealOk };
await ctx.close();
// H1 pixel test
const hctx = await browser.newContext({ viewport: { width: 1400, height: 600 }, deviceScaleFactor: 1 });
const hp = await hctx.newPage();
watch(hp);
await route(hp, 'pair', PAIR);
await hp.goto(srv.url + '__pair.html', { waitUntil: 'load' });
await ready(hp, () => window.__P && window.__P.ready);
await sleep(800);
const h1 = await hp.evaluate(() => window.__P.cmp());
await hp.screenshot({ path: path.join(OUTJ, 'office_h1_pair.png') });
await hctx.close();
res.h1 = h1;
const h1Ok = h1.differingPx <= 12;
// 2) phone shots
const shots = [];
for (const [z, night, open, name] of [[0.6, false, true, 'off_phone_z06'], [1.0, false, true, 'off_phone_z10'], [1.2, false, true, 'off_phone_z12'],
  [1.0, true, false, 'off_phone_night'], [1.0, true, true, 'off_phone_night_open']]) {
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const pp = await pctx.newPage();
  watch(pp);
  await route(pp, name, PHONE(z, night, open));
  await pp.goto(srv.url + '__' + name + '.html', { waitUntil: 'load' });
  await ready(pp, () => window.__R && window.__R.ready);
  await sleep(1500);
  const info = await pp.evaluate(() => ({ k: window.__R.k, missing: window.__R.missing.length, zoom: window.__R.scene.cameras.main.zoom }));
  await pp.evaluate(() => window.__R.game.loop.sleep());
  const out = path.join(PREV, name + '.png');
  await pp.screenshot({ path: out, timeout: 180000 });
  shots.push({ file: path.relative(ROOT, out), ...info, cssPerWorldPx: +(info.zoom * 390 / (720 * info.k)).toFixed(3) });
  await pctx.close();
}
res.phone = shots;
console.log(JSON.stringify(res));
if (errors.length) console.log('ERRORS', errors.slice(0, 10));
if (notFound.length) console.log('404', notFound.slice(0, 10));
if (!h1Ok) console.log('H1 FAIL: the Cutaway.js closed look differs from _shell + _props in', h1.differingPx, 'px');
fs.mkdirSync(OUTJ, { recursive: true });
fs.writeFileSync(path.join(OUTJ, 'office_phaser.json'), JSON.stringify({ res, errors, notFound }, null, 1));
await browser.close();
await srv.close();
process.exit(errors.length || notFound.length || res.missing.length || !revealOk || !h1Ok ? 1 : 0);
