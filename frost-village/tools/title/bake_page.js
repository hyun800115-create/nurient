// Title diorama bake — browser side (loaded by tools/title/bake_title.mjs in headless Chromium).
// Uses the game's REAL asset loader (src/core/Assets.js: manifests, fragment merge rules, anims) to
// resolve every sprite of src/title/layout.js, then draws with canvas 2D:
//   - one trimmed picture per sprite key (+ the frames of the moving actors), at the stage's bake scale
//   - the island ground: base (land, snow bank, shallow water, foam) and one overlay per stage
//     (camp deck, dirt lane, rails + bridge + cobble street, asphalt avenue + quay + piers)
//     laid with the road kit rules of assets/roads/manifest.json (roadKit)
// Everything is handed back to Node as PNG data URLs; tools/title/title_pack.py packs and encodes.
import { Assets } from '../../src/core/Assets.js';
import * as L from '../../src/title/layout.js';

const B = window.__BAKE = { ready: false, errors: [], log: [] };
const LATE = ['town', 'vehicles', 'harbor', 'ships', 'roads', 'beach'];

// ------------------------------------------------------------------ what to bake
/** bake scale per stage (pictures first seen when the camera is closer get more pixels) */
export const STAGE_SCALE = { 0: 1.0, 1: 1.0, 2: 0.85, 3: 0.72, 4: 0.62 };
const GROUND_SCALE = 0.62;

/** animated sprites (prop / building work loops) baked as frame lists */
const SPRITE_ANIMS = { station_grill: 'work', campfire: null, watchtower: 'work', park_fountain: 'water', buoy: 'bob', lighthouse: 'light' };

/** actors: [char, anim, dirs, scaleStage] */
function actorList() {
  const out = [];
  const add = (char, anim, dirs, s, opts = {}) => out.push({ char, anim, dirs, s, ...opts });
  add('pet_dog', 'run', ['S', 'SE', 'E', 'NE', 'N'], 1);
  add('pet_dog', 'idle', ['S', 'SE'], 1);
  for (const c of L.TRAIN.cars) { add(c, 'move', ['SE'], 3, { shadow: true }); add(c, 'idle', ['SE'], 3, { shadow: true, frames: 1 }); }
  for (const v of L.VEHICLES) add(v.char, 'move', ['SE'], v.s, { vshadow: true });
  add('ferry', 'move', ['SE'], 4, { layered: true });
  add('ferry', 'idle', ['SE'], 4, { layered: true, frames: 1 });
  add('sailboat', 'move', ['NE'], 4);
  add('boat_rowboat', 'row', ['SE'], 2);
  add('seagull', 'fly', ['SE', 'NE'], 2);
  return out;
}

// ------------------------------------------------------------------ boot: load with the real loader
class BakeScene extends Phaser.Scene {
  constructor() { super('bake'); }
  preload() {
    this.load.on('loaderror', (f) => { B.errors.push('loaderror ' + (f && f.key)); Assets.onLoadError(f, this.load); });
    Assets.queueManifests(this.load);
    for (const f of LATE) this.load.json('manifest_' + f, 'assets/' + f + '/manifest.json');
  }
  create() {
    Assets.mergeManifests(this.cache.json);
    for (const f of LATE) { const j = this.cache.json.get('manifest_' + f); if (j) Assets.mergeLate(f, j); else B.errors.push('no manifest ' + f); }
    const need = neededFiles();
    const m = Assets.m;
    for (const k of need) {
      const a = m.atlases[k];
      if (a) {
        if (a.format === 'tfatlas') continue;
        this.load.atlas(k, 'assets/' + a.png, 'assets/' + a.json);
      } else if (m.images[k]) this.load.image(k, 'assets/' + m.images[k].png);
      else B.errors.push('unknown file ' + k);
    }
    B.need = Array.from(need);
    this.load.once('complete', () => {
      Assets.finalize(this.game);
      B.scene = this;
      B.ready = true;
    });
    this.load.start();
  }
}

function spriteFile(key) {
  const d = Assets.m.sprites[key];
  if (d) return d.atlas || d.image;
  if (Assets.m.images[key]) return key;
  return null;
}
function neededFiles() {
  const need = new Set();
  const addSprite = (k) => { const f = spriteFile(k); if (f) need.add(f); else B.errors.push('no sprite ' + k); };
  for (const o of L.OBJECTS) addSprite(o.k);
  for (const k of ['ground_snow', 'ground_plaza', 'ground_dirt', 'ground_rock', 'water_shallow', 'shore_foam', 'decal_dirt_patch', 'decal_footprints',
    'decal_path_a', 'decal_path_b', 'decal_snow_drift_a', 'decal_snow_drift_b', 'road_dirt', 'road_dirt_y', 'road_dirt_cross', 'road_cobble_wide',
    'road_asphalt', 'sidewalk', 'snow_edge_x', 'rail_x', 'rail_x_end_p', 'pier_x', 'pier_y', 'quay_x', 'quay_corner', 'pier_root_yp', 'pier_end_yn',
    'pier_end_xn', 'item_fish_cooked', 'rock_rubble']) addSprite(k);
  for (const a of actorList()) {
    const d = Assets.m.characters[a.char];
    if (!d) { B.errors.push('no character ' + a.char); continue; }
    need.add(d.atlas);
    if (d.shadowFrames && d.shadowFrames.atlas) need.add(d.shadowFrames.atlas);
  }
  return need;
}

// ------------------------------------------------------------------ drawing helpers
function tex() { return B.scene.textures; }
/** frame info for a sprite key: { img, cx, cy, cw, ch, tx, ty, rw, rh, ax, ay } (anchor in untrimmed px) */
function spriteFrame(key) {
  const r = Assets.sprite(key);
  if (r.ph) throw new Error('placeholder for ' + key);
  return frameInfo(r.tex, r.frame, r.anchor);
}
function frameInfo(texKey, frameName, anchor) {
  const t = tex().get(texKey);
  const f = frameName !== undefined ? t.get(frameName) : t.get();
  if (!f || f.name === '__BASE' && frameName !== undefined) throw new Error('missing frame ' + texKey + ':' + frameName);
  return { img: t.getSourceImage(), cx: f.cutX, cy: f.cutY, cw: f.cutWidth, ch: f.cutHeight, tx: f.x, ty: f.y, rw: f.realWidth, rh: f.realHeight,
    ax: anchor[0] * f.realWidth, ay: anchor[1] * f.realHeight };
}
/** draw frame info with its anchor at (x, y), scale s, optional flip */
function drawFI(ctx, fi, x, y, s = 1, flip = false, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(flip ? -s : s, s);
  ctx.drawImage(fi.img, fi.cx, fi.cy, fi.cw, fi.ch, fi.tx - fi.ax, fi.ty - fi.ay, fi.cw, fi.ch);
  ctx.restore();
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

/** crop to the non-transparent box; returns { c, x0, y0 } */
function trim(c, pad = 1) {
  const ctx = c.getContext('2d');
  const { width: w, height: h } = c;
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) if (d[row + x * 4 + 3] > 2) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return { c: canvas(2, 2), x0: 0, y0: 0, empty: true };
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const o = canvas(x1 - x0 + 1, y1 - y0 + 1);
  o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return { c: o, x0, y0 };
}

/** render one piece: draw(ctx) with the anchor at (ax, ay) inside a (w x h) canvas, trim, return meta */
function piece(name, w, h, ax, ay, draw) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  draw(ctx);
  const t = trim(c);
  return { name, png: t.c.toDataURL('image/png'), w: t.c.width, h: t.c.height, ax: +(ax - t.x0).toFixed(2), ay: +(ay - t.y0).toFixed(2) };
}

// ------------------------------------------------------------------ sprite pieces
function stageOfKey() {
  const st = {};
  for (const o of L.OBJECTS) { const s = Math.max(1, o.s); if (st[o.k] === undefined || s < st[o.k]) st[o.k] = s; }
  return st;
}

function bakeSprites() {
  const out = [];
  const st = stageOfKey();
  for (const key in st) {
    const s = STAGE_SCALE[st[key]];
    const fi = spriteFrame(key);
    const def = Assets.def(key);
    const meta = { key, stage: st[key], scale: s, fx: def.fxPoints || null, topPx: def.topPx || 0, footprint: def.footprint || null };
    const W = fi.rw * s + 4, H = fi.rh * s + 4, ax = fi.ax * s + 2, ay = fi.ay * s + 2;
    const p = piece(key, W, H, ax, ay, (ctx) => drawFI(ctx, fi, ax, ay, s));
    out.push(Object.assign(p, meta));
    // animated: bake its frames (same canvas geometry so they share the anchor)
    const an = SPRITE_ANIMS[key];
    if (an && def.anims && def.anims[an]) {
      const frames = def.anims[an].frames;
      for (let i = 0; i < frames.length; i++) {
        const f2 = frameInfo(def.atlas, frames[i], def.anchor || [0.5, 0.5]);
        const p2 = piece(key + '@' + an + '_' + i, W, H, ax, ay, (ctx) => drawFI(ctx, f2, ax, ay, s));
        out.push(Object.assign(p2, { key, stage: st[key], scale: s, animOf: key, anim: an, i, fps: def.anims[an].fps || 8 }));
      }
    }
  }
  return out;
}

/** shadow ellipse of a vehicle (manifest shadow[dir] = [w, h, angleDeg]) */
function drawVehShadow(ctx, sh, x, y, s) {
  if (!sh) return;
  const [w, h, ang] = sh;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((ang * Math.PI) / 180);
  ctx.scale(s, s);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
  g.addColorStop(0, 'rgba(40,55,90,0.42)'); g.addColorStop(0.7, 'rgba(40,55,90,0.25)'); g.addColorStop(1, 'rgba(40,55,90,0)');
  ctx.scale(1, h / w);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function bakeActors() {
  const out = [];
  for (const a of actorList()) {
    const d = Assets.charDef(a.char);
    const s = STAGE_SCALE[a.s];
    const an = d.anims[a.anim];
    if (!an) { B.errors.push('no anim ' + a.char + ':' + a.anim); continue; }
    const n = a.frames || an.frames || 1;
    for (const dir of a.dirs) {
      // canvas big enough for the frame and its shadow
      const fs = d.frameSize || [128, 128];
      const pad = a.layered ? 40 : 60;
      const W = fs[0] * s + pad * 2, H = fs[1] * s + pad * 2;
      const ax = d.anchor[0] * fs[0] * s + pad, ay = d.anchor[1] * fs[1] * s + pad;
      for (let i = 0; i < n; i++) {
        const name = a.char + ':' + a.anim + ':' + dir + ':' + i;
        const p = piece(name, W, H, ax, ay, (ctx) => {
          if (a.shadow && d.shadowFrames) {
            const sf = d.shadowFrames;
            const fi = frameInfo(sf.atlas, sf.frames[dir], sf.anchor);
            drawFI(ctx, fi, ax, ay, s);
          }
          if (a.vshadow && d.shadow && d.shadow[dir]) drawVehShadow(ctx, d.shadow[dir], ax, ay, s);
          if (a.layered) {
            const base = (d.base || 'base_{dir}').replace('{dir}', dir);
            drawFI(ctx, frameInfo(d.atlas, base, d.anchor), ax, ay, s);
            if (a.anim === 'move') { const foam = 'foam_' + dir + '_' + (i % 4); if (tex().get(d.atlas).has(foam)) drawFI(ctx, frameInfo(d.atlas, foam, d.anchor), ax, ay, s); }
          }
          const fname = d.frameName.replace('{anim}', a.anim).replace('{dir}', dir).replace('{i}', i);
          drawFI(ctx, frameInfo(d.atlas, fname, d.anchor), ax, ay, s);
        });
        out.push(Object.assign(p, { key: name, stage: a.s, scale: s, actor: a.char, anim: a.anim, dir, i, n, fps: an.fps || 10 }));
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ ground
const G = { x0: -1500, y0: -980, x1: 1560, y1: 880 };   // world px box of the ground layers

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** island outline in metres (closed list of [mx, my]) */
export function islandPoly() {
  const I = L.ISLAND, R = I.half, p = I.power, n = 220, r = rng(I.seed);
  // smooth wobble: a few random sines
  const waves = [];
  for (let k = 0; k < 6; k++) waves.push([2 + Math.floor(r() * 7), r() * Math.PI * 2, (0.3 + r() * 0.7) * I.wobble]);
  const pts = [];
  for (let k = 0; k < n; k++) {
    const t = (k / n) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const rr = R / Math.pow(Math.pow(Math.abs(c), p) + Math.pow(Math.abs(s), p), 1 / p);
    let w = 0;
    for (const [f, ph, a] of waves) w += Math.sin(t * f + ph) * a;
    let mx = c * (rr + w), my = s * (rr + w);
    // the harbour edge: straight
    if (my < 0 && mx > I.quay.from - 1.2 && mx < I.quay.to + 0.6 && my < -R + 1.4) my = -R;
    pts.push([mx, my]);
  }
  return pts;
}

function toPx(mx, my, s, ox, oy) { return [ox + L.wx(mx, my) * s, oy + L.wy(mx, my) * s]; }

function pathPoly(ctx, pts, s, ox, oy, dy = 0) {
  ctx.beginPath();
  pts.forEach(([mx, my], i) => { const [x, y] = toPx(mx, my, s, ox, oy); if (i) ctx.lineTo(x, y + dy * s); else ctx.moveTo(x, y + dy * s); });
  ctx.closePath();
}

function pattern(ctx, key, s, ox, oy, alpha) {
  const fi = spriteFrame(key);
  const c = canvas(fi.cw, fi.ch);
  const cx = c.getContext('2d');
  if (alpha !== undefined) cx.globalAlpha = alpha;
  cx.drawImage(fi.img, fi.cx, fi.cy, fi.cw, fi.ch, 0, 0, fi.cw, fi.ch);
  const p = ctx.createPattern(c, 'repeat');
  p.setTransform(new DOMMatrix([s, 0, 0, s, ox, oy]));
  return p;
}

function groundCanvas(s) {
  const W = (G.x1 - G.x0) * s, H = (G.y1 - G.y0) * s;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  return { c, ctx, ox: -G.x0 * s, oy: -G.y0 * s };
}

/** base: shallow water ring, foam, snow bank, snow top, drifts */
function bakeGroundBase(s) {
  const { c, ctx, ox, oy } = groundCanvas(s);
  const poly = islandPoly();
  const bank = L.ISLAND.bankPx;
  // shallow turquoise ring at water level, soft edge
  const ring = canvas(c.width, c.height);
  const rc = ring.getContext('2d');
  rc.filter = `blur(${Math.round(34 * s)}px)`;
  rc.lineJoin = 'round';
  rc.strokeStyle = '#fff'; rc.fillStyle = '#fff';
  pathPoly(rc, poly, s, ox, oy, bank);
  rc.lineWidth = 150 * s; rc.stroke(); rc.fill();
  rc.filter = 'none';
  rc.globalCompositeOperation = 'source-in';
  rc.fillStyle = pattern(rc, 'water_shallow', s, ox, oy);
  rc.fillRect(0, 0, c.width, c.height);
  ctx.globalAlpha = 0.85;
  ctx.drawImage(ring, 0, 0);
  ctx.globalAlpha = 1;
  // foam: two soft white lines hugging the bank foot
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.filter = `blur(${Math.max(1, Math.round(5 * s))}px)`;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 26 * s;
  pathPoly(ctx, poly, s, ox, oy, bank + 3); ctx.stroke();
  ctx.filter = `blur(${Math.max(1, Math.round(2 * s))}px)`;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 7 * s;
  pathPoly(ctx, poly, s, ox, oy, bank + 1); ctx.stroke();
  ctx.restore();
  // snow bank: the land shape pushed down to the water, shaded
  ctx.save();
  pathPoly(ctx, poly, s, ox, oy, bank);
  ctx.fillStyle = '#b9c9dd'; ctx.fill();
  // bank face gradient: one fill of the down-shifted shape with a vertical gradient per pixel row is
  // not possible, so stack a few shifted copies from dark (bottom) to light (top)
  const steps = 8;
  for (let k = steps; k >= 0; k--) {
    const t = k / steps;
    const col = `rgb(${Math.round(150 + (1 - t) * 70)},${Math.round(168 + (1 - t) * 64)},${Math.round(196 + (1 - t) * 46)})`;
    pathPoly(ctx, poly, s, ox, oy, bank * t);
    ctx.fillStyle = col; ctx.fill();
  }
  ctx.restore();
  // rocky texture on the bank face (multiply, faint)
  ctx.save();
  pathPoly(ctx, poly, s, ox, oy, bank); ctx.clip();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = pattern(ctx, 'ground_rock', s, ox, oy);
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.restore();
  // snow top
  ctx.save();
  pathPoly(ctx, poly, s, ox, oy, 0);
  ctx.fillStyle = pattern(ctx, 'ground_snow', s, ox, oy);
  ctx.fill();
  ctx.clip();
  // soft rim light along the edge + a little blue shade toward the back
  ctx.lineJoin = 'round';
  ctx.filter = `blur(${Math.max(1, Math.round(10 * s))}px)`;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 30 * s;
  pathPoly(ctx, poly, s, ox, oy, 0); ctx.stroke();
  ctx.filter = 'none';
  const g = ctx.createLinearGradient(0, oy - 650 * s, 0, oy + 650 * s);
  g.addColorStop(0, 'rgba(150,175,215,0.16)'); g.addColorStop(0.5, 'rgba(150,175,215,0)'); g.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
  ctx.restore();
  // drifts
  const r = rng(77);
  for (let k = 0; k < 16; k++) {
    const mx = (r() * 2 - 1) * 12, my = (r() * 2 - 1) * 12;
    const [x, y] = toPx(mx, my, s, ox, oy);
    drawFI(ctx, spriteFrame(r() < 0.5 ? 'decal_snow_drift_a' : 'decal_snow_drift_b'), x, y, s * (0.7 + r() * 0.5), r() < 0.5, 0.75);
  }
  return finishGround('ground_base', c, s, 0);
}

function finishGround(name, c, s, stage) {
  const t = trim(c, 2);
  return { name, stage, png: t.c.toDataURL('image/png'), w: t.c.width, h: t.c.height, scale: s,
    // world px of the top-left pixel
    x: +(G.x0 + t.x0 / s).toFixed(2), y: +(G.y0 + t.y0 / s).toFixed(2) };
}

/** clip a stage overlay to the land (roads end at the shore) */
function clipLand(ctx, s, ox, oy) {
  pathPoly(ctx, islandPoly(), s, ox, oy, 0);
  ctx.clip();
}

// --- road kit
const NONE = 0, ROAD = 1, WALK = 2;
function cellMap(cells) {
  const m = new Map();
  for (const r of cells) for (let i = r.i0; i < r.i1; i++) for (let j = r.j0; j < r.j1; j++) m.set(i + ',' + j, r.type === 'walk' ? WALK : ROAD);
  return m;
}
function latticePx(i, j, s, ox, oy) { return [ox + (64 * (i + j)) * s, oy + (32 * (i - j)) * s]; }
function cellPath(ctx, list, s, ox, oy) {
  ctx.beginPath();
  for (const [i, j] of list) {
    const a = latticePx(i, j, s, ox, oy), b = latticePx(i + 1, j, s, ox, oy), c = latticePx(i + 1, j + 1, s, ox, oy), d = latticePx(i, j + 1, s, ox, oy);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
  }
}
/** a road-kit piece (untrimmed, integer anchorPx) at world px (x, y) */
function kitPiece(ctx, key, x, y, s) {
  const def = Assets.def(key);
  const fi = spriteFrame(key);
  const ap = def.anchorPx || [fi.ax, fi.ay];
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  ctx.drawImage(fi.img, fi.cx, fi.cy, fi.cw, fi.ch, fi.tx - ap[0], fi.ty - ap[1], fi.cw, fi.ch);
  ctx.restore();
}
function variant(key, i, j) {
  const v = ((i * 7 + j * 13) % 3 + 3) % 3;
  const k = v ? key + '_' + v : key;
  return Assets.m.sprites[k] ? k : key;
}

function drawRoadKit(ctx, cls, cells, s, ox, oy) {
  const m = cellMap(cells);
  const at = (i, j) => m.get(i + ',' + j) || NONE;
  const paved = (t) => t !== NONE;
  let I0 = 1e9, I1 = -1e9, J0 = 1e9, J1 = -1e9;
  for (const r of cells) { I0 = Math.min(I0, r.i0); I1 = Math.max(I1, r.i1); J0 = Math.min(J0, r.j0); J1 = Math.max(J1, r.j1); }
  // 1) textures
  const byTex = {};
  for (const [k, t] of m) {
    const [i, j] = k.split(',').map(Number);
    let key;
    if (cls === 'city') {
      key = t === ROAD ? 'road_asphalt' : 'sidewalk';
      // convex sidewalk corner -> carriageway texture (its curb_corner paints the paving)
      if (t === WALK) {
        for (const [sx, sy] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) if (at(i + sx, j) === ROAD && at(i, j + sy) === ROAD && at(i + sx, j + sy) === ROAD) key = 'road_asphalt';
      }
    } else if (cls === 'town') key = 'road_cobble_wide';
    else {
      const ax = paved(at(i - 1, j)) || paved(at(i + 1, j));
      const ay = paved(at(i, j - 1)) || paved(at(i, j + 1));
      // a 2-cell-wide track: the cross direction always has one paved neighbour, so look 2 cells out
      const runX = paved(at(i - 1, j)) && paved(at(i + 1, j));
      const runY = paved(at(i, j - 1)) && paved(at(i, j + 1));
      key = runX && runY ? 'road_dirt_cross' : runY && !runX ? 'road_dirt_y' : 'road_dirt';
      if (!ax && ay) key = 'road_dirt_y';
    }
    (byTex[key] = byTex[key] || []).push([i, j]);
  }
  for (const key in byTex) {
    ctx.save();
    cellPath(ctx, byTex[key], s, ox, oy);
    ctx.fillStyle = pattern(ctx, key, s, ox, oy);
    ctx.fill();
    ctx.restore();
  }
  // 2+3) corners first (they own edges), then straight edges, snow then curbs
  const skip = new Set();
  const corners = [];
  const Q = { e: [1, 1], s: [1, -1], w: [-1, -1], n: [-1, 1] };
  const cellQ = (i, j, q) => { const [sx, sy] = Q[q]; return at(i + (sx - 1) / 2, j + (sy - 1) / 2); };
  for (let i = I0 - 1; i <= I1 + 1; i++) for (let j = J0 - 1; j <= J1 + 1; j++) {
    const qs = ['e', 's', 'w', 'n'];
    const types = qs.map((q) => cellQ(i, j, q));
    const nNone = types.filter((t) => t === NONE).length;
    const own = (fam, q) => {
      const [sx, sy] = Q[q];
      skip.add(fam + 'x' + (sx > 0 ? i : i - 1) + ',' + j);
      skip.add(fam + 'y' + i + ',' + (sy > 0 ? j : j - 1));
    };
    if (nNone === 1) { const q = qs[types.indexOf(NONE)]; corners.push(['snow_corner_' + q, i, j, 3]); own('s', q); }
    else if (nNone === 3) { const q = qs[types.findIndex((t) => t !== NONE)]; corners.push(['snow_inner_' + q, i, j, 3]); own('s', q); }
    if (cls === 'city' && nNone === 0) {
      const nWalk = types.filter((t) => t === WALK).length;
      if (nWalk === 1) { const q = qs[types.indexOf(WALK)]; corners.push(['curb_corner_' + q, i, j, 4]); own('c', q); }
      else if (nWalk === 3) { const q = qs[types.indexOf(ROAD)]; corners.push(['curb_inner_' + q, i, j, 4]); own('c', q); }
    }
  }
  const edges = [];
  for (let i = I0 - 1; i <= I1 + 1; i++) for (let j = J0 - 1; j <= J1 + 1; j++) {
    // X edge (i,j)-(i+1,j) between (i,j-1) and (i,j)
    {
      const a = at(i, j - 1), b = at(i, j);
      const fam = (paved(a) !== paved(b)) ? 's' : (cls === 'city' && a !== b && paved(a) && paved(b)) ? 'c' : null;
      if (fam && !skip.has(fam + 'x' + i + ',' + j)) {
        const farSide = fam === 's' ? b === NONE : b === WALK;     // the snow / walk cell is +Y
        const base = (fam === 's' ? 'snow_edge_x' : 'curb_x') + (farSide ? '' : '_near');
        const p = latticePx(i, j, s, ox, oy);
        edges.push([variant(base, i, j), p[0] + 32 * s, p[1] + 16 * s, fam === 's' ? 3 : 4]);
      }
    }
    // Y edge (i,j)-(i,j+1) between (i-1,j) and (i,j)
    {
      const a = at(i - 1, j), b = at(i, j);
      const fam = (paved(a) !== paved(b)) ? 's' : (cls === 'city' && a !== b && paved(a) && paved(b)) ? 'c' : null;
      if (fam && !skip.has(fam + 'y' + i + ',' + j)) {
        const farSide = fam === 's' ? a === NONE : a === WALK;     // the snow / walk cell is -X
        const base = (fam === 's' ? 'snow_edge_y' : 'curb_y') + (farSide ? '' : '_near');
        const p = latticePx(i, j, s, ox, oy);
        edges.push([variant(base, i, j), p[0] + 32 * s, p[1] - 16 * s, fam === 's' ? 3 : 4]);
      }
    }
  }
  const all = edges.concat(corners.map(([k, i, j, layer]) => { const p = latticePx(i, j, s, ox, oy); return [k, p[0], p[1], layer]; }));
  for (const layer of [3, 4]) for (const [k, x, y, l] of all) if (l === layer) kitPiece(ctx, k, x, y, s);
  // 5) markings: centre line of X roads (city)
  if (cls === 'city') {
    for (const r of cells) {
      if (r.type !== 'road' || r.j1 - r.j0 !== 4) continue;
      const J = r.j0 + 2;
      for (let i = r.i0 + 1; i + 1 < r.i1; i += 2) { const p = latticePx(i, J, s, ox, oy); kitPiece(ctx, 'lane_x', p[0] + 64 * s, p[1] + 32 * s, s); }
    }
  }
}

function plazaRects(ctx, list, s, ox, oy) {
  for (const r of list) {
    ctx.save();
    pathPoly(ctx, [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]], s, ox, oy, 0);
    ctx.fillStyle = pattern(ctx, 'ground_plaza', s, ox, oy);
    ctx.shadowColor = 'rgba(60,80,120,0.35)'; ctx.shadowBlur = 8 * s; ctx.shadowOffsetY = 3 * s;
    ctx.fill();
    ctx.restore();
  }
}

function decals(ctx, list, s, ox, oy) {
  for (const [k, mx, my, sc] of list || []) { const [x, y] = toPx(mx, my, s, ox, oy); drawFI(ctx, spriteFrame(k), x, y, s * (sc || 1), false, 0.9); }
}

function chainX(ctx, key, my, from, to, s, ox, oy) {
  const fi = spriteFrame(key);
  for (let mx = from; mx <= to + 1e-6; mx += L.CELL) { const [x, y] = toPx(mx, my, s, ox, oy); drawFI(ctx, fi, Math.round(x), Math.round(y), s); }
}

function bakeGroundStage(stage, s) {
  const { c, ctx, ox, oy } = groundCanvas(s);
  const gd = L.GROUND[stage] || {};
  ctx.save();
  clipLand(ctx, s, ox, oy);
  if (gd.plaza) plazaRects(ctx, gd.plaza, s, ox, oy);
  if (gd.cells) drawRoadKit(ctx, gd.cls, gd.cells, s, ox, oy);
  decals(ctx, gd.decals, s, ox, oy);
  ctx.restore();
  if (stage === L.RAIL.stage) {
    // trestle bridge over the sea (pier deck tiles under the rails), then the track
    const edge = landEdgeX(L.RAIL.my);
    chainX(ctx, 'pier_x', L.RAIL.my, L.RAIL.from, edge + 0.6, s, ox, oy);
    chainX(ctx, 'rail_x', L.RAIL.my, L.RAIL.from, L.RAIL.to - L.CELL, s, ox, oy);
    const [x, y] = toPx(L.RAIL.to, L.RAIL.my, s, ox, oy);
    drawFI(ctx, spriteFrame('rail_x_end_p'), x, y, s);
  }
  if (stage === 4) {
    // quay wall along the straight harbour edge, then the piers
    const q = L.ISLAND.quay;
    chainX(ctx, 'quay_x', -L.ISLAND.half + 0.25, q.from, q.to, s, ox, oy);
    for (const p of L.PIERS) {
      const root = -L.ISLAND.half - 0.4;
      const put = (key, my) => { const [x, y] = toPx(p.mx, my, s, ox, oy); drawFI(ctx, spriteFrame(key), Math.round(x), Math.round(y), s); };
      put('pier_root_yp', root);
      for (let n = 1; n <= p.len; n++) put('pier_y', root - n * L.CELL);
      put('pier_end_yn', root - (p.len + 1) * L.CELL);
    }
  }
  return finishGround('ground_s' + stage, c, s, stage);
}

/** mx where the land ends going -X along the line my */
function landEdgeX(my) {
  const poly = islandPoly();
  let best = 0;
  for (let k = 0; k < poly.length; k++) {
    const [ax, ay] = poly[k], [bx, by] = poly[(k + 1) % poly.length];
    if ((ay - my) * (by - my) <= 0 && ay !== by) { const x = ax + ((my - ay) / (by - ay)) * (bx - ax); if (x < best) best = x; }
  }
  return best;
}

// ------------------------------------------------------------------ preview (layout iteration)
/** full composite of a stage at scale s (ground + objects sorted by depth), for looking at the layout */
function preview(stage, s = 0.5, opts = {}) {
  const W = (G.x1 - G.x0) * s, H = (G.y1 - G.y0 + 400) * s;
  const c = canvas(W, H);
  const ctx = c.getContext('2d');
  const ox = -G.x0 * s, oy = (-G.y0 + 400) * s;
  ctx.fillStyle = '#2a6fb5'; ctx.fillRect(0, 0, W, H);
  const layers = [bakeGroundBase(s)];
  for (let k = 1; k <= stage; k++) layers.push(bakeGroundStage(k, s));
  return Promise.all(layers.map((g) => new Promise((res) => { const im = new Image(); im.onload = () => res([g, im]); im.src = g.png; }))).then((list) => {
    for (const [g, im] of list) ctx.drawImage(im, ox + g.x * s, oy + g.y * s);
    const objs = L.OBJECTS.filter((o) => o.s <= stage && !(o.u && o.u <= stage));
    objs.sort((a, b) => L.wy(a.x, a.y) - L.wy(b.x, b.y));
    for (const o of objs) {
      const [x, y] = toPx(o.x, o.y, s, ox, oy);
      drawFI(ctx, spriteFrame(o.k), x, y + (o.w ? L.WATER_PX * s : 0), s, !!o.f);
      if (opts.labels) { ctx.font = `${Math.round(22 * s * 2)}px sans-serif`; ctx.fillStyle = '#c00'; ctx.fillText(o.k, x, y); }
    }
    return c.toDataURL('image/png');
  });
}

B.bakeSprites = () => bakeSprites();
B.bakeActors = () => bakeActors();
B.bakeGround = () => { const out = [bakeGroundBase(GROUND_SCALE)]; for (let k = 1; k <= 4; k++) out.push(bakeGroundStage(k, GROUND_SCALE)); return out; };
B.preview = preview;
B.islandPoly = islandPoly;
B.STAGE_SCALE = STAGE_SCALE;

window.__BAKE.game = new Phaser.Game({ type: Phaser.CANVAS, width: 64, height: 64, banner: false, scene: BakeScene, audio: { noAudio: true } });
