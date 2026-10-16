// Train cars + loop rails (assets/train2, docs/CONTRACT_V42.md section AK) in headless Chromium with Phaser 3.90 -
// no game code.   node tools/test/train2_phaser.mjs [--no-gif] [--quick]
//
// 1) LOAD TEST (desktop 1700 x 1000): assets/train2 + every assets/town atlas side by side (the existing engine,
//    car_a / car_b, rails, buildings); every {anim}_{dir}_{i} frame of the three cars in the dirs each anim lists,
//    8 shadow frames, every rail sprite / prop frame; anims registered exactly like src/core/Assets.js
//    buildCharacter (`<key>:<anim>:<dir>`, anims[a].dirs) and spriteAnims (`spr:<key>:<anim>`), played; a measured
//    flipX check (a mirrored heading keeps its anchor: the cars are packed symmetric about the anchor); a labelled
//    8-heading sheet of engine + coach + box car + flat car -> docs/previews/tr2_phaser_sheet.png.
// 2) PHONE (390 x 844 CSS, DPR 3, 720 logical px, camera zoom Z * k like View.k): the ours loop baked the way
//    RoadPaint bakes rails (rail_x k -6 .. 12 at L(k + 0.5, 0), then rail_loop_ours at its anchorWorldPx), the
//    rail_fence_x run + end post, the switch stand, the water tower (pour), the chief for scale; the consist placed by
//    a RailPath-like route (lines + R 1.75-cell arcs from the plan section 5.1, cross-checked against the manifest's
//    pathPx), per-car heading from the chord between its bogie points (+-0.4 x length) -> nearest of 8 -> rendered
//    dir + flipX, shadows per heading, wheel frames from the distance run (trackPerLoopM), crate icons on the flat car
//    cargoSlots, box car door_open while stopped.  Stills at zoom 0.6 / 1.0 / 1.2 / 1.6 (day), night at 1.0 and 0.6
//    (DayClock MULTIPLY tint at darkness 0.45 + ADD glows at windowPoints / lampPoints), the stop at the platform
//    (door open, heading NW), the town loop with the 읍 consist, and the procedural-fallback comparison.
// 3) GIFS: the 마을 and 읍 consists running round the ours loop at zoom 0.6 and 1.0 (frames -> ffmpeg palette GIF).
// (polish) cars placed by the manifest's trainConsist.curvePlacement (chord midpoint + heading hysteresis; 'arc' =
// today's Train.updateRoute, compared in tr2_loop_curve_cmp.png); night glows at nightGlow (window 0.35, lamp 0.5,
// end-door windows dark); the water tower behind the loop, pouring = pourBase + the overlay anim; the tower hints
// are checked against src/data/world.js shoreY / WORLD.width (read-only import).
// Writes docs/previews/tr2_phaser_*.png, tr2_phone_*.png, tr2_loop_*.gif and /tmp/fv_cache/train2/phaser/train2_phaser.json.
// Exit 1 on missing frames, page errors, 404s, a misplaced flip, or a route that does not match the decal's pathPx.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, sleep } from './pw.mjs';
import { WORLD, shoreY, L4 } from '../../src/data/world.js';     // read-only: the shore under the water tower hints

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREV = path.join(ROOT, 'docs', 'previews');
const OUTJ = process.env.TR2_OUT || '/tmp/fv_cache/train2/phaser';
const ARGS = process.argv.slice(2);
const NOGIF = ARGS.includes('--no-gif');
const QUICK = ARGS.includes('--quick');
const ONLY = (ARGS.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
fs.mkdirSync(PREV, { recursive: true });
fs.mkdirSync(OUTJ, { recursive: true });

// ------------------------------------------------------------------------------------------------ shared page code
const COMMON = String.raw`
const j = async (p) => (await fetch(p)).json();
const T2 = await j('assets/train2/manifest.json');
const TOWN = await j('assets/town/manifest.json');
const GROUND = await j('assets/ground/manifest.json');
const LGX = await j('assets/logistics/manifest.json');
const CHARS = await j('assets/characters/manifest.json');
const S2 = Math.SQRT2;
const L = (i, j) => [3120 + 64 * (i + j), 1315 + 32 * (i - j)];
const MIR = { SW: 'SE', W: 'E', NW: 'NE' };
const HEAD = ['SE', 'E', 'NE', 'N', 'NW', 'W', 'SW', 'S'];        // ground angle 0, 45, ... (i axis = SE, j axis = NE)
const charDef = (k) => T2.characters[k] || TOWN.characters[k];
const ENGINE_BACK = (T2.trainConsist.couplerOverride || {}).train_engine || {};
const coupler = (k) => Object.assign({}, charDef(k).couplerM, k === 'train_engine' ? ENGINE_BACK : {});
const CONSIST = { village: T2.trainConsist.village.order, eup: T2.trainConsist.eup.order };

// --- route (plan 5.1) in "ours" lattice coordinates; the town end is the world mirror i -> 36 - i
function buildRoute(end, iStart, iEnd) {
  const mi = end === 'town' ? (i) => 36 - i : (i) => i;
  const pcs = [
    { t: 'line', a: [iStart, 0], b: [-6, 0] },
    { t: 'arc', c: [-6, 1.75], th0: -90, th1: -270 },         // A -> far -> B
    { t: 'line', a: [-6, 3.5], b: [-4.5, 3.5] },               // B -> C
    { t: 'arc', c: [-4.5, 1.75], th0: 90, th1: 0 },            // C -> D
    { t: 'arc', c: [-1, 1.75], th0: 180, th1: 270 },           // D -> T (heading +i)
    { t: 'line', a: [-1, 0], b: [iEnd, 0] },
  ];
  const pts = [];
  const marks = {};
  for (const p of pcs) {
    const n = p.t === 'line' ? Math.max(2, Math.ceil(Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) / 0.02)) : Math.ceil(Math.abs(p.th1 - p.th0) / 0.5);
    for (let k = pts.length ? 1 : 0; k <= n; k++) {
      const f = k / n;
      let q;
      if (p.t === 'line') q = [p.a[0] + (p.b[0] - p.a[0]) * f, p.a[1] + (p.b[1] - p.a[1]) * f];
      else { const th = (p.th0 + (p.th1 - p.th0) * f) * Math.PI / 180; q = [p.c[0] + 1.75 * Math.cos(th), p.c[1] + 1.75 * Math.sin(th)]; }
      pts.push(q);
    }
  }
  const s = [0];
  for (let k = 1; k < pts.length; k++) s.push(s[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]) * S2);
  for (const [nm, q] of Object.entries({ A: [-6, 0], T: [-1, 0] })) {
    let best = 0, bd = 1e9;
    for (let k = 0; k < pts.length; k++) { const d = Math.hypot(pts[k][0] - q[0], pts[k][1] - q[1]); if (d < bd - 1e-9 || (d < bd + 1e-9 && nm === 'T' && k > best)) { bd = d; best = k; } }
    marks[nm] = s[best];
  }
  // the loop's own T: the second pass (exit), A: the first
  const mirror = pts.map(([i, jj]) => [mi(i), jj]);
  return { pts: mirror, s, len: s[s.length - 1], marks, end,
    at(sq) {
      sq = Math.max(0, Math.min(this.len, sq));
      let lo = 0, hi = this.s.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (this.s[mid] <= sq) lo = mid; else hi = mid; }
      const f = (sq - this.s[lo]) / Math.max(1e-9, this.s[hi] - this.s[lo]);
      const a = this.pts[lo], b = this.pts[hi];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    } };
}
// s of the exit pass through T (the train trails back through the turnout)
function exitT(route) { let best = 0; for (let k = 0; k < route.pts.length; k++) { const i = route.end === 'town' ? 36 - route.pts[k][0] : route.pts[k][0]; if (Math.abs(i + 1) < 0.011 && Math.abs(route.pts[k][1]) < 0.011) best = route.s[k]; } return best; }

function makeGlow(scene) {
  if (scene.textures.exists('fv_glow')) return;
  const s = 96, c = scene.textures.createCanvas('fv_glow', s, s), g = c.context;
  const gr = g.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,236,180,0.95)'); gr.addColorStop(0.25, 'rgba(255,214,140,0.55)');
  gr.addColorStop(0.6, 'rgba(255,190,110,0.16)'); gr.addColorStop(1, 'rgba(255,180,100,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s); c.refresh();
}

// a train on a route: one sprite + one shadow per unit, crate icons on the flat car
class TrainView {
  constructor(scene, order, route, opts = {}) {
    this.sc = scene; this.route = route; this.order = order; this.units = []; this.opts = opts;
    // (polish M5) placement on curves: 'chord' = the manifest's trainConsist.curvePlacement (car at the midpoint of
    // its bogie chord, heading with hysteresis), 'arc' = the car at its arc point (Train.updateRoute today)
    this.mode = opts.place || 'chord';
    let off = 0;
    order.forEach((k, n) => {
      const def = charDef(k);
      if (n > 0) off += coupler(order[n - 1]).back - coupler(k).front;
      const spr = scene.add.sprite(0, 0, def.atlas, 'idle_SE_0').setOrigin(def.anchor[0], def.anchor[1]);
      const sf = def.shadowFrames;
      const sh = scene.add.image(0, 0, sf.atlas, sf.frames.SE).setOrigin(sf.anchor[0], sf.anchor[1]).setDepth(-500 + n * 0.01);
      const u = { key: k, def, spr, sh, off: off + (-coupler(order[0]).front), crates: [] };
      if (k === 'train_flatcar') {
        const icons = ['item_crate_food', 'item_crate_produce', 'item_crate_cans', 'cardboard_box_m', 'item_crate_bread', 'item_crate_tools'];
        const stack = [2, 1, 3, 2, 1, 2];
        for (let q = 0; q < 6; q++) { const st = []; for (let h = 0; h < stack[q]; h++) { const it = LGX.sprites[icons[(q + h) % icons.length]]; st.push(scene.add.image(0, 0, it.atlas, it.frame).setOrigin(0.5, 0.75).setScale(def.cargoScale)); } u.crates.push(st); }
      }
      this.units.push(u);
    });
    this.length = off + coupler(order[order.length - 1]).back - coupler(order[0]).front;
  }
  heading(sA, len, prev) {
    const a = this.route.at(sA + 0.4 * len), b = this.route.at(sA - 0.4 * len);
    const ang = Math.atan2(a[1] - b[1], a[0] - b[0]) * 180 / Math.PI;
    const near = HEAD[((Math.round(ang / 45) % 8) + 8) % 8];
    if (this.mode === 'chord' && prev) {
      const pa = HEAD.indexOf(prev) * 45, dd = Math.abs(((ang - pa) % 360 + 540) % 360 - 180);
      if (dd < 22.5 + 8) return prev;                 // hysteresis: keep the heading until 8 deg past the sector edge
    }
    return near;
  }
  setMode(m) { this.mode = m; for (const u of this.units) u.hd = null; }
  /** nose at route s; dist = metres run (wheels); stopped: idle (door_open frame "door" for the box car) */
  place(sNose, dist, moving, door = -1) {
    const out = [];
    this.units.forEach((u, n) => {
      const def = u.def, sA = sNose - u.off, len = def.lengthM || 2.6;
      let i, jj;
      if (this.mode === 'chord') {
        const a = this.route.at(sA + 0.4 * len), b = this.route.at(sA - 0.4 * len);
        i = (a[0] + b[0]) / 2; jj = (a[1] + b[1]) / 2;
      } else [i, jj] = this.route.at(sA);
      const [x, y] = L(i, jj);
      const dir = this.heading(sA, len, u.hd), rd = MIR[dir] || dir, flip = !!MIR[dir];
      u.hd = dir;
      let anim = moving ? 'move' : 'idle', fi = 0;
      if (moving) { const loop = def.trackPerLoopM || 1.7; fi = Math.floor(((dist / loop) * 8) % 8 + 8) % 8; }
      if (!moving && u.key === 'train_boxcar' && door >= 0 && def.anims.door_open && def.anims.door_open.dirs.includes(rd)) { anim = 'door_open'; fi = door; }
      const fname = anim + '_' + rd + '_' + fi;
      u.spr.setTexture(def.atlas, fname).setFlipX(flip);
      // Phaser mirrors a frame about its middle: origin (1 - ax) keeps the anchor on the track for any frame
      u.spr.setOrigin(flip ? 1 - def.anchor[0] : def.anchor[0], def.anchor[1]).setPosition(x, y).setDepth(y + n * 0.001);
      const sf = def.shadowFrames;
      u.sh.setTexture(sf.atlas, sf.frames[dir]).setPosition(x, y);
      u.at = { x, y, dir, rd, flip, frame: fname };
      if (u.crates.length) {
        const slots = def.cargoSlots[rd];
        u.crates.forEach((st, q) => st.forEach((im, h) => { const s = slots[q]; im.setPosition(x + (flip ? -s[0] : s[0]), y + s[1] - h * def.stackStep).setDepth(y + n * 0.001 + 0.0001 * (q * 4 + h + 1)); }));
      }
      out.push(u.at);
    });
    return out;
  }
  /** night glow points (world px): coach windows + lanterns, flat car tail lamps, engine lamp */
  lights() {
    const pts = [];
    for (const u of this.units) {
      const d = u.def, a = u.at; if (!a) continue;
      const sx = a.flip ? -1 : 1;
      // (polish M2) the manifest's nightGlow strengths; endWindowPoints stay dark (endWindowK 0)
      const ng = d.nightGlow || {};
      if (d.windowPoints) for (const p of d.windowPoints[a.rd] || []) pts.push({ x: a.x + sx * p[0], y: a.y + p[1], k: ng.windowK ?? 0.35, d: a.y + 0.5 });
      if (ng.endWindowK && d.endWindowPoints) for (const p of d.endWindowPoints[a.rd] || []) pts.push({ x: a.x + sx * p[0], y: a.y + p[1], k: ng.endWindowK, d: a.y + 0.5 });
      if (d.lampPoints) for (const p of d.lampPoints[a.rd] || []) pts.push({ x: a.x + sx * p[0], y: a.y + p[1], k: ng.lampK ?? 0.5, red: u.key === 'train_flatcar', d: a.y + 0.5 });
      if (d.lampPoint && d.lampPoint[a.rd]) { const p = d.lampPoint[a.rd]; pts.push({ x: a.x + sx * p[0], y: a.y + p[1], k: 1.2, d: a.y + 0.5 }); }
    }
    return pts;
  }
}

function loadAll(L_) {
  for (const a of T2.atlases) L_.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
  for (const a of TOWN.atlases) L_.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
}
`;

// ------------------------------------------------------------------------------------------------ 1) load test page
const LOAD_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#eef3f9}</style>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
${COMMON}
window.__L = { ready: false, missing: [], anims: [], frames: 0 };
class S extends Phaser.Scene {
  preload() { loadAll(this.load); }
  create() {
    const R = window.__L, tex = this.textures;
    const has = (a, f) => tex.exists(a) && tex.get(a).has(f);
    // characters: Assets.buildCharacter semantics
    for (const [k, v] of Object.entries(T2.characters)) {
      for (const [an, a] of Object.entries(v.anims)) for (const d of (a.dirs || v.dirs)) {
        const names = []; for (let i = 0; i < a.frames; i++) names.push(v.frameName.replace('{anim}', an).replace('{dir}', d).replace('{i}', i));
        for (const n of names) { R.frames++; if (!has(v.atlas, n)) R.missing.push(k + ':' + n); }
        const key = k + ':' + an + ':' + d;
        this.anims.create({ key, frames: names.filter((n) => has(v.atlas, n)).map((n) => ({ key: v.atlas, frame: n })), frameRate: a.fps, repeat: a.repeat });
        R.anims.push(key);
      }
      for (const [d, n] of Object.entries(v.shadowFrames.frames)) { R.frames++; if (!has(v.shadowFrames.atlas, n)) R.missing.push(k + ':shadow ' + d); }
      if (Object.keys(v.shadowFrames.frames).length !== 8) R.missing.push(k + ': shadow headings != 8');
    }
    // sprites: Assets.spriteAnims semantics
    for (const [k, s] of Object.entries(T2.sprites)) {
      R.frames++; if (!has(s.atlas, s.frame)) R.missing.push(k + ':' + s.frame);
      for (const f of s.frames || []) { R.frames++; if (!has(s.atlas, f)) R.missing.push(k + ':' + f); }
      if (s.pourBase) { R.frames++; if (!has(s.atlas, s.pourBase)) R.missing.push(k + ':' + s.pourBase); }
      for (const [an, a] of Object.entries(s.anims || {})) {
        for (const f of a.frames) { R.frames++; if (!has(s.atlas, f)) R.missing.push(k + ':' + f); }
        const key = 'spr:' + k + ':' + an;
        this.anims.create({ key, frames: a.frames.map((f) => ({ key: s.atlas, frame: f })), frameRate: a.fps, repeat: a.repeat });
        R.anims.push(key);
      }
    }
    // the town engine too (the consist's leader)
    const e = TOWN.characters.train_engine;
    for (const an of Object.keys(e.anims)) for (const d of e.dirs) this.anims.create({ key: 'train_engine:' + an + ':' + d, frames: Array.from({ length: e.anims[an].frames }, (_, i) => ({ key: e.atlas, frame: an + '_' + d + '_' + i })), frameRate: e.anims[an].fps, repeat: -1 });
    // ---- 8-heading sheet: engine + coach + box car + flat car, shadows, mirrored dirs by flipX (origin 1 - ax)
    this.add.rectangle(850, 500, 1700, 1000, 0xeef3f9).setDepth(-1e6);
    const D8 = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'];
    const rows = ['train_engine', 'train_coach', 'train_boxcar', 'train_flatcar'];
    R.playing = 0; R.flip = [];
    rows.forEach((k, r) => {
      const def = charDef(k);
      this.add.text(8, 30 + r * 240, k, { fontFamily: 'sans-serif', fontSize: '15px', color: '#334' });
      D8.forEach((d, c) => {
        const x = 110 + c * 205, y = 200 + r * 240, rd = MIR[d] || d, flip = !!MIR[d];
        const sf = def.shadowFrames;
        this.add.image(x, y, sf.atlas, sf.frames[d]).setOrigin(sf.anchor[0], sf.anchor[1]).setDepth(y - 1);
        const s = this.add.sprite(x, y, def.atlas, 'idle_' + rd + '_0').setOrigin(flip ? 1 - def.anchor[0] : def.anchor[0], def.anchor[1]).setFlipX(flip).setDepth(y);
        s.play(k + ':move:' + rd); R.playing++;
        this.add.text(x - 30, y + 30, d, { fontFamily: 'sans-serif', fontSize: '13px', color: '#556' }).setDepth(1e5);
        this.add.circle(x, y, 2.5, 0xff2266).setDepth(1e5);
      });
    });
    R.scene = this; R.ready = true;
  }
}
window.__L.game = new Phaser.Game({ type: Phaser.WEBGL, width: 1700, height: 1000, backgroundColor: '#eef3f9', render: { antialias: true, preserveDrawingBuffer: true }, scene: S, banner: false });
</script></body></html>`;

// flip probe page: where does a flipped, origin-(1 - ax) frame put its pixels? (expects the mirror image about the anchor)
const FLIP_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#000}</style>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
${COMMON}
window.__F = { ready: false };
class S extends Phaser.Scene {
  preload() { loadAll(this.load); }
  create() {
    const res = [];
    const cases = [['train_engine', 'idle_E_0'], ['train_coach', 'idle_E_0'], ['train_flatcar', 'idle_SE_0'], ['train_boxcar', 'idle_NE_0']];
    cases.forEach(([k, fr], n) => {
      const def = charDef(k), x = 150 + n * 300, y = 250;
      const a = this.add.sprite(x, y, def.atlas, fr).setOrigin(def.anchor[0], def.anchor[1]);
      const b = this.add.sprite(x, y + 300, def.atlas, fr).setOrigin(1 - def.anchor[0], def.anchor[1]).setFlipX(true);
      res.push({ k, x, y });
    });
    window.__F.cases = res; window.__F.ready = true;
  }
}
window.__F.game = new Phaser.Game({ type: Phaser.WEBGL, width: 1200, height: 700, backgroundColor: '#000000', render: { antialias: false, preserveDrawingBuffer: true }, scene: S, banner: false });
</script></body></html>`;

// ------------------------------------------------------------------------------------------------ 2) phone page
// cfg: { zoom, scene: 'loop'|'stop'|'town', consist: 'village'|'eup', night, fallback, s (nose s), door, cam: [x, y] }
const PHONE = (cfg) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:#dbe6f2;height:100%;overflow:hidden}#game{width:100%;height:100%}</style>
<script src="lib/phaser.min.js"></script></head><body><div id="game"></div><script type="module">
${COMMON}
const CFG = ${JSON.stringify(cfg)};
const W = 720, H = Math.round(720 * innerHeight / innerWidth);
const k = Math.round(Math.max(1, Math.min(2, innerWidth * devicePixelRatio / 720)) * 20) / 20;
window.__R = { ready: false, k, cfg: CFG };
class S extends Phaser.Scene {
  preload() {
    loadAll(this.load);
    for (const im of GROUND.images) if (im.key === 'ground_snow') this.load.image(im.key, 'assets/' + im.png);
    for (const a of LGX.atlases) if (a.key === 'lgx_items') this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const a of CHARS.atlases) if (a.key === 'char_player') this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
  }
  create() {
    const R = window.__R, cam = this.cameras.main;
    const end = CFG.scene === 'town' ? 'town' : 'ours';
    const sp = T2.sprites, loopKey = end === 'town' ? 'rail_loop_town' : 'rail_loop_ours', lp = sp[loopKey];
    const [cx, cy] = CFG.cam;
    // ground: snow, pattern anchored like RoadPaint (world origin)
    this.add.tileSprite(cx - 1400, cy - 2000, 2800, 4000, 'ground_snow').setOrigin(0, 0).setDepth(-2000).setTilePosition(cx - 1400, cy - 2000);
    // rails (ground layer, baked order): plain rail_x tiles, then the loop decal
    const rx = TOWN.sprites.rail_x;
    const ks = end === 'town' ? [26, 41] : [-6, 12];
    for (let kk = ks[0]; kk <= ks[1]; kk++) { const [x, y] = L(kk + 0.5, 0); this.add.image(x, y, rx.atlas, rx.frame).setOrigin(rx.anchor[0], rx.anchor[1]).setDepth(-1500 + kk * 0.001); }
    if (!CFG.fallback) {
      this.add.image(lp.anchorWorldPx[0], lp.anchorWorldPx[1], lp.atlas, lp.frame).setOrigin(lp.anchor[0], lp.anchor[1]).setDepth(-1400);
    } else {
      // the CODE-1 procedural stand-in (plan 16.1): ballast band, sleepers and two rails drawn along the route arcs
      const g = this.add.graphics().setDepth(-1400);
      const rt = buildRoute(end, -1, -1);
      const sA = rt.marks.A, sT = exitT(rt);
      const P = rt.pts.filter((q, n) => rt.s[n] >= sA - 0.3 && rt.s[n] <= sT + 0.3 && n % 3 === 0);
      // offsets in lattice space (cells): normal of the centre line, then projected with L()
      const off = (d) => P.map((q, n) => { const a = P[Math.max(0, n - 1)], b = P[Math.min(P.length - 1, n + 1)];
        const di = b[0] - a[0], dj = b[1] - a[1], len = Math.hypot(di, dj) || 1; return L(q[0] - dj / len * d, q[1] + di / len * d); });
      const band = (d0, d1, col, al) => { const A = off(d0), B = off(d1).reverse(); g.fillStyle(col, al); g.fillPoints([...A, ...B].map(([x, y]) => new Phaser.Geom.Point(x, y)), true); };
      band(-0.61, 0.61, 0x9a948c, 0.95);
      const T0 = off(-0.42), T1 = off(0.42);
      g.lineStyle(5, 0x7a5233, 1); for (let n = 0; n < T0.length; n += 3) g.lineBetween(T0[n][0], T0[n][1], T1[n][0], T1[n][1]);
      for (const d of [-0.318, 0.318]) { const Q = off(d); g.lineStyle(3, 0x5b6a7c, 1); g.beginPath(); g.moveTo(Q[0][0], Q[0][1]); for (const q of Q) g.lineTo(q[0], q[1]); g.strokePath(); }
    }
    // fence run, switch stand, water tower (props are y-sorted with the actors)
    if (end === 'ours') {
      const f = sp.rail_fence_x, fe = sp.rail_fence_x_end, run = f.run.ours;
      for (const [x, y] of run.worldPx) this.add.image(x, y, f.atlas, f.frame).setOrigin(f.anchor[0], f.anchor[1]).setDepth(y);
      this.add.image(run.endWorldPx[0], run.endWorldPx[1], fe.atlas, fe.frame).setOrigin(fe.anchor[0], fe.anchor[1]).setDepth(run.endWorldPx[1]);
    }
    const ss = sp.rail_switch_stand, ph = lp.placeHint;
    R.switchStand = this.add.image(ph.rail_switch_stand.worldPx[0], ph.rail_switch_stand.worldPx[1], ss.atlas, ss.frames[0]).setOrigin(ss.anchor[0], ss.anchor[1]).setDepth(ph.rail_switch_stand.worldPx[1]);
    // (polish H1 / H2) the water tower behind the loop; pouring = pourBase + the pour overlay anim on a 2nd sprite
    const wt = sp.rail_water_tower, wp = ph.rail_water_tower.worldPx;
    const tower = this.add.sprite(wp[0], wp[1], wt.atlas, CFG.pour ? wt.pourBase : wt.frame).setOrigin(wt.anchor[0], wt.anchor[1]).setDepth(wp[1]);
    this.anims.create({ key: 'spr:rail_water_tower:pour', frames: wt.anims.pour.frames.map((f) => ({ key: wt.atlas, frame: f })), frameRate: wt.anims.pour.fps, repeat: -1 });
    if (CFG.pour) R.towerPour = this.add.sprite(wp[0], wp[1], wt.atlas, wt.anims.pour.frames[0]).setOrigin(wt.anchor[0], wt.anchor[1]).setDepth(wp[1] + 0.001).play('spr:rail_water_tower:pour');
    R.tower = tower;
    // the chief for scale, beside the platform side of the track
    const pl = CHARS.characters.player, cp = end === 'town' ? L(33.2, -1.3) : L(1.6, -1.25);
    this.add.sprite(cp[0], cp[1], pl.atlas, 'idle_S_0').setOrigin(pl.anchor[0], pl.anchor[1]).setDepth(cp[1]);
    // the train on its route
    const route = buildRoute(end, 16, 12);
    const tv = new TrainView(this, CONSIST[CFG.consist], route, { place: CFG.place || 'chord' });
    R.route = { len: route.len, marks: route.marks, exitT: exitT(route), trainLen: tv.length };
    // cross-check: the route's loop part vs the decal's pathPx (T -> D -> C -> B -> A)
    let maxDev = 0;
    for (const [px, py] of lp.pathPx) {
      const wx = lp.anchorWorldPx[0] + px, wy = lp.anchorWorldPx[1] + py;
      let best = 1e9; for (const [i, jj] of route.pts) { const [x, y] = L(i, jj); best = Math.min(best, Math.hypot(x - wx, y - wy)); }
      maxDev = Math.max(maxDev, best);
    }
    R.pathDevPx = Math.round(maxDev * 100) / 100;
    // night: DayClock overlay (MULTIPLY, never darker than the floor) + ADD glows
    let overlay = null; const glows = [];
    if (CFG.night) {
      makeGlow(this);
      const a = 0.45, NIGHT = [0x5a, 0x6a, 0xa8], mix = (ch) => Math.round(255 * (1 - a) + ch * a);
      overlay = this.add.image(0, 0, '__WHITE').setOrigin(0, 0).setDepth(1e6).setBlendMode(Phaser.BlendModes.MULTIPLY).setTint((mix(NIGHT[0]) << 16) | (mix(NIGHT[1]) << 8) | mix(NIGHT[2]));
    }
    const drawNight = () => {
      if (!overlay) return;
      const v = cam.worldView; overlay.setPosition(v.x - 80, v.y - 80).setDisplaySize(v.width + 160, v.height + 160);
      const pts = tv.lights();
      const sl = ss.lampPoint, swp = ph.rail_switch_stand.worldPx;
      pts.push({ x: swp[0] + sl[0], y: swp[1] + sl[1], k: 0.4 });
      pts.forEach((p, n) => { let g = glows[n]; if (!g) { g = this.add.image(0, 0, 'fv_glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(1e6 + 1); glows.push(g); }
        g.setVisible(true).setPosition(p.x, p.y).setScale(1.25 * p.k).setAlpha(0.75).setTint(p.red ? 0xff7766 : 0xffffff); });
      for (let n = pts.length; n < glows.length; n++) glows[n].setVisible(false);
    };
    R.place = (s, dist, moving, door) => { const at = tv.place(s, dist, moving, door); R.switchStand.setFrame(ss.frames[s - tv.length < R.route.exitT && s > R.route.exitT - 0.5 ? 1 : 0]); drawNight(); return at; };
    // cfg.s: { ref: 'A' (first pass of A) | 'X' (exit pass of T), d: metres }
    const sOf = (v) => (v.ref === 'X' ? R.route.exitT : route.marks.A) + v.d;
    R.sOf = sOf;
    cam.setZoom(CFG.zoom * k); cam.centerOn(cx, cy);
    cam.preRender();                      // worldView valid before the night overlay is sized
    R.at = R.place(sOf(CFG.s), 0, !CFG.stopped, CFG.door === undefined ? -1 : CFG.door);
    if (CFG.noTrain) for (const u of tv.units) { u.spr.setVisible(false); u.sh.setVisible(false); u.crates.forEach((st) => st.forEach((im) => im.setVisible(false))); }
    R.css = (wx, wy) => { const v = cam.worldView, r = this.game.canvas.getBoundingClientRect(); return [r.left + (wx - v.x) / v.width * r.width, r.top + (wy - v.y) / v.height * r.height]; };
    R.setPlace = (m) => tv.setMode(m);
    R.scene = this; R.tv = tv; R.ready = true;
  }
}
window.__R.game = new Phaser.Game({ type: Phaser.WEBGL, parent: 'game', width: Math.round(W * k), height: Math.round(H * k), backgroundColor: '#dbe6f2',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, render: { antialias: true, roundPixels: false, preserveDrawingBuffer: true }, scene: S, banner: false });
</script></body></html>`;

// ------------------------------------------------------------------------------------------------ run
const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const errors = [];
const notFound = [];
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', (r) => { if (r.status() >= 400) notFound.push(r.url()); });
};
const res = {};
const t0 = Date.now();

// 1) load test
{
  const ctx = await browser.newContext({ viewport: { width: 1700, height: 1000 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  watch(page);
  await page.route('**/fv/__tr2load.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: LOAD_HTML }));
  await page.goto(srv.url + '__tr2load.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__L && window.__L.ready, null, { timeout: 240000 });
  await sleep(1200);
  Object.assign(res, await page.evaluate(() => {
    const R = window.__L, sc = R.scene;
    const atl = Object.keys(sc.textures.list).filter((k) => !k.startsWith('__'));
    return { textures: atl.length, train2Atlases: atl.filter((k) => ['train_coach', 'train_boxcar', 'train_flatcar', 'train2_rails'].includes(k)).length,
      anims: R.anims.length, framesChecked: R.frames, missing: R.missing, playing: sc.children.list.filter((o) => o.anims && o.anims.isPlaying).length };
  }));
  await page.evaluate(() => window.__L.game.loop.sleep());
  await page.screenshot({ path: path.join(PREV, 'tr2_phaser_sheet.png'), timeout: 240000 });
  await ctx.close();
}
// flip probe: compare the pixel bbox of the flipped sprite with the mirror of the plain one about the anchor
{
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 700 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  watch(page);
  await page.route('**/fv/__tr2flip.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: FLIP_HTML }));
  await page.goto(srv.url + '__tr2flip.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__F && window.__F.ready, null, { timeout: 240000 });
  await sleep(800);
  const png = path.join(OUTJ, 'flip_probe.png');
  await page.screenshot({ path: png });
  const cases = await page.evaluate(() => window.__F.cases);
  await ctx.close();
  // bbox analysis in python (no image libs in node)
  const py = `
import json, sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB'); cases = json.loads(sys.argv[2]); out = []
for c in cases:
    def bb(y0):
        crop = im.crop((c['x'] - 150, y0 - 220, c['x'] + 150, y0 + 70)).point(lambda v: 255 if v > 8 else 0).convert('L')
        b = crop.getbbox(); return [b[0] + c['x'] - 150, b[2] + c['x'] - 150] if b else None
    a, f = bb(c['y']), bb(c['y'] + 300)
    out.append({'k': c['k'], 'plain': a, 'flipped': f, 'err': max(abs((2 * c['x'] - a[1]) - f[0]), abs((2 * c['x'] - a[0]) - f[1])) if a and f else 99})
print(json.dumps(out))`;
  const o = execFileSync('python3', ['-c', py, png, JSON.stringify(cases)], { encoding: 'utf8' });
  res.flip = JSON.parse(o);
}

// 2) phone stills
const phone = async (name, cfg, vh = 844) => {
  const pctx = await browser.newContext({ viewport: { width: 390, height: vh }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const pp = await pctx.newPage();
  watch(pp);
  const file = '__tr2_' + name + '.html';
  await pp.route('**/fv/' + file, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: PHONE(cfg) }));
  await pp.goto(srv.url + file, { waitUntil: 'load' });
  await pp.waitForFunction(() => window.__R && window.__R.ready, null, { timeout: 240000 });
  await sleep(1500);
  return { pp, pctx };
};
const OURS_CAM = [2930, 1190];
const stills = [];
const info = {};
const ON_CURVE = { ref: 'A', d: 11 };          // nose past the far semicircle: cars on the semicircle, B -> C and the straight
const STOP_V = { ref: 'A', d: -5.2 * Math.SQRT2 };   // plan 5.2: 마을 nose at i -0.8 heading NW
const STOP_E = { ref: 'A', d: -3.1 * Math.SQRT2 };   // 읍 nose at i -2.9
const shots = [
  ['day_z06', { zoom: 0.6, scene: 'loop', consist: 'eup', s: ON_CURVE, cam: [3010, 1230], pour: true }],
  ['day_z10', { zoom: 1.0, scene: 'loop', consist: 'eup', s: ON_CURVE, cam: OURS_CAM, pour: true }],
  ['day_z12', { zoom: 1.2, scene: 'loop', consist: 'eup', s: ON_CURVE, cam: [2920, 1170], pour: true }],
  ['day_z16', { zoom: 1.6, scene: 'loop', consist: 'eup', s: ON_CURVE, cam: [2870, 1110], pour: true }],
  ['night_z10', { zoom: 1.0, scene: 'loop', consist: 'eup', s: ON_CURVE, cam: OURS_CAM, night: true }],
  ['night_z06', { zoom: 0.6, scene: 'loop', consist: 'village', s: { ref: 'X', d: 3 }, cam: [3010, 1230], night: true }],
  ['stop_z10', { zoom: 1.0, scene: 'loop', consist: 'village', s: STOP_V, stopped: true, door: 3, cam: [3250, 1370] }],
  ['stop_z06', { zoom: 0.6, scene: 'loop', consist: 'eup', s: STOP_E, stopped: true, door: 3, cam: [3200, 1330] }],
  ['town_z06', { zoom: 0.6, scene: 'town', consist: 'eup', s: ON_CURVE, cam: [5800, 2560] }],
  ['fallback_z10', { zoom: 1.0, scene: 'loop', consist: 'village', s: STOP_V, cam: OURS_CAM, fallback: true, noTrain: true }],
  ['decal_z10', { zoom: 1.0, scene: 'loop', consist: 'village', s: STOP_V, cam: OURS_CAM, noTrain: true }],
];
for (const [name, cfg] of (ONLY.length ? shots.filter(([n]) => ONLY.includes(n)) : QUICK ? shots.slice(0, 2) : shots)) {
  const { pp, pctx } = await phone(name, cfg);
  const st = await pp.evaluate(() => ({ at: window.__R.at, route: window.__R.route, dev: window.__R.pathDevPx, k: window.__R.k }));
  info[name] = st;
  await pp.evaluate(() => window.__R.game.loop.sleep());
  const out = path.join(PREV, 'tr2_phone_' + name + '.png');
  await pp.screenshot({ path: out, timeout: 240000 });
  stills.push(path.relative(ROOT, out));
  await pctx.close();
}
res.phone = stills;
res.phoneInfo = info;
res.pathDevPx = Math.max(...Object.values(info).map((v) => v.dev));

// (polish H2) the water tower hints against the game's own shore line and world edge (node side, src/data/world.js)
{
  const T2M = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'train2', 'manifest.json'), 'utf8'));
  const half = 0.8 / Math.SQRT2;
  res.towerHints = {};
  for (const key of ['rail_loop_ours', 'rail_loop_town']) {
    const [ti, tj] = T2M.sprites[key].placeHint.rail_water_tower.lattice;
    let shore = 1e9;
    for (const [di, dj] of [[-half, half], [half, half], [-half, -half], [half, -half]]) { const [x, y] = L4(ti + di, tj + dj); shore = Math.min(shore, y - shoreY(x)); }
    const wt = T2M.sprites.rail_water_tower, [x] = L4(ti, tj);
    res.towerHints[key] = { lattice: [ti, tj], footprintAboveShorePx: Math.round(shore), spriteX: [Math.round(x - wt.anchorPx[0]), Math.round(x - wt.anchorPx[0] + wt.frameSize[0])], worldW: WORLD.width };
  }
  res.towerBad = Object.values(res.towerHints).filter((t) => t.footprintAboveShorePx < 60 || t.spriteX[0] < 0 || t.spriteX[1] > t.worldW).length;
}

// (polish M5) arc-point vs chord-midpoint placement round the ours loop (읍 consist, zoom 0.6), the critic's picks
if (!ONLY.length || ONLY.includes('curve_cmp')) {
  const D_PICK = [11.2, 12.0, 12.8, 20.0, 20.8, 21.6];
  const { pp, pctx } = await phone('curve_cmp', { zoom: 0.6, scene: 'loop', consist: 'eup', s: { ref: 'A', d: 8 }, cam: [3010, 1150], pour: true }, 440);
  const dir = path.join(OUTJ, 'curve_cmp');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const picks = [];
  for (const mode of ['arc', 'chord']) {
    await pp.evaluate((m) => window.__R.setPlace(m), mode);
    for (let d = 8; d <= 21.65; d += 0.4) {
      const dd = Math.round(d * 10) / 10;
      await pp.evaluate((v) => { const R = window.__R; R.place(R.sOf({ ref: 'A', d: v }), v, true, -1); }, dd);
      if (D_PICK.some((q) => Math.abs(q - dd) < 0.05)) {
        await pp.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const f = path.join(dir, mode + '_' + dd.toFixed(1) + '.png');
        await pp.screenshot({ path: f, timeout: 120000 });
        picks.push([mode, dd, f]);
      }
    }
  }
  await pctx.close();
  const out = path.join(PREV, 'tr2_loop_curve_cmp.png');
  const py = `
import json, sys
from PIL import Image, ImageDraw, ImageFont
picks = json.loads(sys.argv[1]); out = sys.argv[2]
try:
    F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
except Exception:
    F = ImageFont.load_default()
cols = sorted({p[1] for p in picks}); rows = ['arc', 'chord']
# the loop part of the 1170 x 1320 capture (zoom 0.6, DPR 3), shown at half device size (~ the phone's CSS size x 1.5)
box = (170, 230, 870, 900); w, h = (box[2] - box[0]) // 2, (box[3] - box[1]) // 2
lw = 300
sheet = Image.new('RGB', (lw + len(cols) * (w + 6) + 6, 40 + len(rows) * (h + 6) + 6), (238, 243, 249))
d = ImageDraw.Draw(sheet)
for c, dd in enumerate(cols):
    d.text((lw + 10 + c * (w + 6), 8), 'd = %.1f m' % dd, fill=(40, 50, 70), font=F)
for r, m in enumerate(rows):
    y = 40 + r * (h + 6)
    d.text((10, y + h // 2 - 40), 'arc point' if m == 'arc' else 'chord midpoint', fill=(40, 50, 70), font=F)
    d.text((10, y + h // 2 - 10), '(Train.js today)' if m == 'arc' else '+ 8 deg hysteresis', fill=(90, 100, 120), font=F)
    d.text((10, y + h // 2 + 20), '' if m == 'arc' else '(curvePlacement)', fill=(90, 100, 120), font=F)
for m, dd, f in picks:
    c, r = cols.index(dd), rows.index(m)
    im = Image.open(f).convert('RGB').crop(box).resize((w, h), Image.LANCZOS)
    sheet.paste(im, (lw + 6 + c * (w + 6), 40 + r * (h + 6)))
sheet.save(out)`;
  execFileSync('python3', ['-c', py, JSON.stringify(picks), out]);
  res.curveCmp = path.relative(ROOT, out);
}

// 3) GIFs: the consist round the ours loop (frames -> ffmpeg)
const gifs = [];
if (!NOGIF && !ONLY.length) {
  const runs = [
    // (polish) framed so the water tower behind the loop shows whole
    ['village_z06', { zoom: 0.6, scene: 'loop', consist: 'village', s: { ref: 'A', d: 0 }, cam: [3040, 1085], pour: true }, 240],
    ['eup_z06', { zoom: 0.6, scene: 'loop', consist: 'eup', s: { ref: 'A', d: 0 }, cam: [3040, 1085], pour: true }, 240],
    ['eup_z10', { zoom: 1.0, scene: 'loop', consist: 'eup', s: { ref: 'A', d: 0 }, cam: [2985, 1065], pour: true }, 380],
  ];
  for (const [name, cfg, vh] of (QUICK ? runs.slice(0, 1) : runs)) {
    const { pp, pctx } = await phone('gif_' + name, cfg, vh);
    const meta = await pp.evaluate(() => window.__R.route);
    // nose from 4 cells before A (on the straight, heading NW) until the tail has trailed 1 m past T heading SE
    const sA = meta.marks.A, sEnd = meta.exitT + meta.trainLen + 1.0;
    const s0 = sA - 4 * Math.SQRT2;
    const step = 0.45;
    const n = Math.ceil((sEnd - s0) / step);
    const dir = path.join(OUTJ, 'gif_' + name);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const tg = Date.now();
    for (let f = 0; f <= n; f++) {
      const s = s0 + f * step;
      await pp.evaluate(([sq, d]) => { window.__R.place(sq, d, true, -1); }, [s, s - s0]);
      await pp.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await pp.screenshot({ path: path.join(dir, String(f).padStart(4, '0') + '.png'), timeout: 120000 });
    }
    console.log('gif', name, n + 1, 'frames', Math.round((Date.now() - tg) / 1000), 's');
    await pctx.close();
    const gif = path.join(PREV, 'tr2_loop_' + name + '.gif');
    // device px / 2 (585 px wide: a phone screen at 1.5 x CSS), 10 fps, one palette for the whole run
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '10', '-i', path.join(dir, '%04d.png'), '-vf',
      'scale=585:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a', gif]);
    gifs.push({ gif: path.relative(ROOT, gif), frames: n + 1, kb: Math.round(fs.statSync(gif).size / 1024) });
  }
}
res.gifs = gifs;
res.seconds = Math.round((Date.now() - t0) / 1000);
const flipBad = (res.flip || []).filter((c) => c.err > 2);
res.flipBad = flipBad;
console.log(JSON.stringify({ ...res, phoneInfo: undefined }, null, 0));
if (errors.length) console.log('ERRORS', errors.slice(0, 10));
if (notFound.length) console.log('404', notFound.slice(0, 10));
fs.writeFileSync(path.join(OUTJ, ONLY.length ? 'train2_phaser_only.json' : 'train2_phaser.json'), JSON.stringify({ res, errors, notFound }, null, 1));
await browser.close();
await srv.close();
process.exit(errors.length || notFound.length || res.missing.length || flipBad.length || res.pathDevPx > 3 || res.towerBad ? 1 : 0);
