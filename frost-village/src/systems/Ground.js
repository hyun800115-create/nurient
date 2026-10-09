// Static ground: scrolling sea + fish schools (live tileSprites that follow the view) and the snowy land
// baked into a fixed pool of reused 512² canvas tiles (snow pattern, shoreline foam, paths, decals, rails and
// streets through bake hooks, zone floors and zone / region roads once they are shown). (v4-B, docs/v4_plan.md
// §11.3c: the old 1024² tiles, zone floors and road overlays were canvases that were never freed.)

import { Assets } from '../core/Assets.js';
import { WORLD } from '../data/world.js';
import { DEPTH } from './DepthSort.js';
import { shoreY } from './Collision.js';
import { isoRect } from '../core/Iso.js';
import { rng } from '../core/Placeholders.js';

function pattern(ctx, key, scale = 1) {
  const s = Assets.source(key);
  const p = ctx.createPattern(s.img, 'repeat');
  if (p && p.setTransform && scale !== 1 && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().scale(scale));
  return p;
}

function drawFrame(ctx, key, x, y, scale = 1, rot = 0, alpha = 1) {
  const s = Assets.source(key);
  const f = s.frame;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  ctx.scale(scale, scale);
  const w = f.cutWidth, h = f.cutHeight;
  ctx.drawImage(s.img, f.cutX, f.cutY, w, h, -w / 2, -h / 2, w, h);
  ctx.restore();
}

// (v4-B, docs/v4_plan.md §11.3c) the land is baked into a FIXED POOL of 512² canvas slots, reused (never
// created / destroyed while playing: Phaser keeps a removed canvas in its pool). Level 0 = one world px per
// tile px (512 world px a tile) at zoom >= 0.85; level 1 = half resolution (1024 world px in a slot) below
// that; level 2 = quarter (2048 px) for the overview. A slot far from the view is re-used for a new tile.
const SLOT = 512;
// a 1-texel gutter on every side: neighbouring tiles overlap by two texels, so no seam shows between them at
// fractional zooms (a tile covers TW world px: 510 at full resolution)
const GUT = 1;
const TW = SLOT - 2 * GUT;
const LEVEL_ZOOM = [0.85, 0.42];
const LEVEL_MARGIN = [200, 320, 480];   // world px around the view that should already be baked
const POOL = 28;                         // slots (1 MiB each); about 24 cover a phone view at zoom 0.85
const TRIM_AFTER = 15;                   // s a slot may keep a tile nobody needed before it is given back
export function levelFor(z) { return z >= LEVEL_ZOOM[0] ? 0 : z >= LEVEL_ZOOM[1] ? 1 : 2; }
/** device px per user px of a 2D context (shadow offsets / blur are in device px) */
export function devScale(ctx) {
  try { const m = ctx.getTransform(); return Math.hypot(m.a, m.b) || 1; } catch (e) { return 1; }
}

/**
 * (v4-B) a picture that lies on the ground (a zone floor, a region's roads): drawn into the ground tiles once
 * it is fully shown; while it fades in (or before the tiles under it are re-baked) it is its own image. Same
 * surface as the Image it replaces: alpha / visible / setAlpha / setVisible / setEnabled, tweenable.
 */
class GroundLayer {
  constructor(ground, id, rect, draw, order, depth) {
    this.ground = ground; this.id = id; this.rect = rect; this.draw = draw; this.order = order; this.depth = depth;
    this.x = rect.x; this.y = rect.y;
    this._a = 1; this._v = true;
    this.merged = false;     // drawn into the tiles
    this.img = null;         // its own image (fading in / until the tiles are re-baked)
    this.active = true;
    ground.watch(this);
  }
  get alpha() { return this._a; }
  set alpha(v) { v = +v; if (v !== this._a) { this._a = v; this.ground.watch(this); } }
  get visible() { return this._v; }
  set visible(v) { v = !!v; if (v !== this._v) { this._v = v; this.ground.watch(this); } }
  setAlpha(a) { this.alpha = a === undefined ? 1 : a; return this; }
  setVisible(v) { this.visible = v; return this; }
  setEnabled(v) { this.visible = v; return this; }
  setDepth() { return this; }
  get want() { return this._v && this._a > 0.001; }
  get full() { return this._v && this._a >= 0.999; }
}

export class Ground {
  constructor(gs) {
    this.gs = gs;
    const W = WORLD.width, H = WORLD.height;
    this.W = W; this.H = H;
    let maxShore = 0;
    for (let x = 0; x <= W; x += 8) maxShore = Math.max(maxShore, shoreY(x));
    this.maxShore = maxShore;

    // --- sea (live, scrolling): Ground.makeSea() — the one place the sea is made (the living water of v7
    // replaces this method only)
    this.seaH = Math.ceil(maxShore + 40);
    this.makeSea();
    this.t = 0;

    // --- baked land: a pool of 512² slots, tiles made when the camera comes near and re-used far away
    this.slots = [];
    this.tiles = this.slots;     // (perf tests read tiles.length / baked)
    this.byId = new Map();       // tile id (level * 1e6 + ty * 1000 + tx) -> slot
    this.pool = POOL;
    this.minLevel = 0;           // (low graphics: 1 = never full resolution)
    this.level = 0;
    this.baked = 0;
    this.evictions = 0;
    this.trimmed = 0;
    this.trimT = 0;
    this.checkT = 0;
    // (v4-A, plan §10.2) extra layers baked into the tiles (rails, v4 streets: fn(ctx, x0, y0, w, h)) and
    // tiles to re-bake in place (one per check) when such a layer changes
    this.hooks = [];
    this.dirty = new Set();
    // (v4-B) zone floors and roads of zones / regions: merged into the tiles once shown
    this.layers = [];
    this.watched = new Set();
    gs.events.once('shutdown', () => this.destroyTiles());
  }

  /** (v4-B) low graphics: tiles at half resolution at every zoom, a smaller pool */
  setLow(low) {
    const lv = low ? 1 : 0;
    if (lv === this.minLevel) return;
    this.minLevel = lv;
    this.pool = low ? 20 : POOL;
  }

  /**
   * (v4-B, docs/v4_plan.md §10.2 / §11.3c) the sea and the two fish schools. A Phaser TileSprite owns a canvas as
   * big as itself: one as wide as the 6144 px world cost 63 MiB (+ 9 for the fish). These follow the camera
   * instead and are only as big as the view (below zoom 0.5 they are drawn at half resolution and scaled 2x —
   * the sea is soft anyway). The pattern stays fixed in the world: tilePosition = the sprite's world position
   * (+ the drift), so moving the sprite never moves the waves.
   */
  makeSea() {
    const gs = this.gs;
    this.sea = gs.add.tileSprite(0, -200, 64, 64, Assets.sprite('water_sea').tex).setOrigin(0, 0).setDepth(DEPTH.WATER);
    const fs = Assets.sprite('fish_school');
    this.fish1 = gs.add.tileSprite(0, 40, 64, 200, fs.tex, fs.frame).setOrigin(0, 0).setDepth(DEPTH.FISH).setAlpha(0.55);
    this.fish2 = gs.add.tileSprite(0, 150, 64, 200, fs.tex, fs.frame).setOrigin(0, 0).setDepth(DEPTH.FISH).setAlpha(0.35);
    this.seaFit(true);
  }

  /** fit the sea / fish sprites to the camera view (called every frame, cheap; resizes only on a new size class) */
  seaFit(force) {
    const gs = this.gs, cam = gs.cameras && gs.cameras.main;
    if (!cam || !this.sea) return;
    const z = Math.max(0.05, cam.zoom || 1);
    const wv = cam.worldView;
    // the view (the world view is refreshed only when a frame is drawn: use the camera's own numbers)
    const vw = cam.width / z, vh = cam.height / z;
    const ct = gs.camTarget;
    const cx = ct ? ct.x : (wv.width ? wv.centerX : cam.scrollX + cam.width / 2);
    const cy = ct ? ct.y : (wv.height ? wv.centerY : cam.scrollY + cam.height / 2);
    const k = (gs.zoomCur || 1) < 0.5 ? 2 : 1;
    // size class: the view + a margin, rounded up to 256 px (a resize re-allocates the canvas: rarely)
    const sw = Math.ceil((vw + 640) / k / 256) * 256;
    let x0 = Math.floor((cx - vw / 2 - 320) / (64 * k)) * 64 * k;
    // inside the world only (beyond its edges there is no land to cover the sea)
    const span = sw * k;
    if (span <= this.W) x0 = Math.max(0, Math.min(this.W - span, x0));
    const top = -200, bottom = this.seaH;
    const vis = cy - vh / 2 - 320 < bottom;
    const sh = Math.ceil((bottom - top) / k / 64) * 64;
    if (force || this.sea.__k !== k || this.sea.__w !== sw) {
      this.sea.setSize(sw, sh);
      this.sea.setScale(k); this.sea.setTileScale(1 / k, 1 / k);
      this.sea.__k = k; this.sea.__w = sw;
      for (const f of [this.fish1, this.fish2]) { f.setSize(sw, Math.ceil(200 / k)); f.setScale(k); }
      this.fish1.setTileScale(1 / k, 1 / k);
      this.fish2.setTileScale(0.8 / k, 0.8 / k);
    }
    this.sea.setPosition(x0, top);
    this.fish1.setPosition(x0, 40);
    this.fish2.setPosition(x0, 150);
    this.sea.setVisible(vis);
    this.fish1.setVisible(vis);
    this.fish2.setVisible(vis);
  }

  /** the camera zoom the tiles are made for */
  zoomNow() { const gs = this.gs; return gs.zoomCur || (gs.cameras && gs.cameras.main ? gs.cameras.main.zoom : 1) || 1; }

  /** bake the tiles around the camera view (`max` per call; Infinity = all that are needed now) */
  ensure(view, max = 1, margin) {
    this.settleLayers();
    const lv = Math.min(2, Math.max(this.minLevel, levelFor(this.zoomNow())));
    const T = TW << lv;
    const m = margin !== undefined ? margin : LEVEL_MARGIN[lv];
    const cols = Math.ceil(this.W / T), rows = Math.ceil(this.H / T);
    const x0 = Math.max(0, Math.floor((view.x - m) / T)), x1 = Math.min(cols - 1, Math.floor((view.right + m) / T));
    const y0 = Math.max(0, Math.floor((view.y - m) / T)), y1 = Math.min(rows - 1, Math.floor((view.bottom + m) / T));
    const cx = (view.x + view.right) / 2, cy = (view.y + view.bottom) / 2;
    const need = this._need || (this._need = new Set());
    need.clear();
    const list = this._list || (this._list = []);
    list.length = 0;
    const now = this.t;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const id = lv * 1e6 + ty * 1000 + tx;
        need.add(id);
        const s = this.byId.get(id);
        if (s) { s.used = now; continue; }
        const inView = tx * T < view.right && (tx + 1) * T > view.x && ty * T < view.bottom && (ty + 1) * T > view.y;
        const d = Math.abs((tx + 0.5) * T - cx) + Math.abs((ty + 0.5) * T - cy);
        list.push({ id, tx, ty, k: (inView ? 0 : 1e7) + d });
      }
    }
    this.level = lv;
    if (!list.length) return 0;
    list.sort((a, b) => a.k - b.k);
    let n = 0;
    for (const c of list) {
      if (n >= max) break;
      const slot = this.takeSlot(view, need);
      if (!slot) break;
      this.bakeInto(slot, lv, c.tx, c.ty);
      n++;
    }
    return n;
  }

  /** a free slot (a new one while the pool is not full, else the one farthest from the view that is not needed) */
  takeSlot(view, need) {
    for (const s of this.slots) if (s.id < 0) return s;
    if (this.slots.length < this.pool) {
      const gs = this.gs, i = this.slotN = (this.slotN || 0) + 1;
      const key = 'fv_gslot_' + i;
      if (gs.textures.exists(key)) gs.textures.remove(key);
      const ct = gs.textures.createCanvas(key, SLOT, SLOT);
      // (§18 #5, the faint line across the sea) only the tile itself is drawn, not its gutter: neighbours used to
      // overlap by the gutter, and where the bake is see-through (the shallow water fading out to sea) the overlap
      // drew twice — a thin darker line along every tile edge. The gutter stays in the canvas for the filtering.
      const img = gs.add.image(0, 0, key).setOrigin(0, 0).setDepth(DEPTH.GROUND).setVisible(false).setCrop(GUT, GUT, TW, TW);
      const s = { i, key, ct, img, id: -1, lv: 0, tx: 0, ty: 0, used: 0 };
      this.slots.push(s);
      return s;
    }
    const cx = (view.x + view.right) / 2, cy = (view.y + view.bottom) / 2;
    let best = null, bk = -1;
    for (const s of this.slots) {
      if (need.has(s.id)) continue;
      const T = TW << s.lv;
      const x = s.tx * T, y = s.ty * T;
      const inView = x < view.right && x + T > view.x && y < view.bottom && y + T > view.y;
      const k = (inView ? 0 : 1e7) + Math.abs(x + T / 2 - cx) + Math.abs(y + T / 2 - cy);
      if (k > bk) { bk = k; best = s; }
    }
    if (!best) return null;
    this.byId.delete(best.id);
    this.dirty.delete(best.id);
    best.id = -1;
    best.img.setVisible(false);
    this.evictions++;
    return best;
  }

  /**
   * slots whose tile was not needed for TRIM_AFTER s and that are out of view are given back (a destroyed canvas
   * texture shrinks its canvas to 1×1: the memory is freed); the pool grows again when the view needs it
   */
  trim(view) {
    const now = this.t, need = this._need;
    for (let k = this.slots.length - 1; k >= 0; k--) {
      const s = this.slots[k];
      if (need && need.has(s.id)) continue;
      if (now - s.used < TRIM_AFTER) continue;
      if (s.id >= 0) {
        const T = TW << s.lv, x = s.tx * T, y = s.ty * T;
        if (x < view.right && x + T > view.x && y < view.bottom && y + T > view.y) continue;
        this.byId.delete(s.id);
        this.dirty.delete(s.id);
      }
      try { s.img.destroy(); if (this.gs.textures.exists(s.key)) this.gs.textures.remove(s.key); } catch (e) { /* teardown */ }
      this.slots.splice(k, 1);
      this.trimmed++;
    }
  }

  /** bake tile (lv, tx, ty) into a slot (also a re-bake in place: the old picture shows until refresh) */
  bakeInto(slot, lv, tx, ty) {
    const T = TW << lv, s = 1 / (1 << lv), g = GUT << lv;
    const x0 = tx * T - g, y0 = ty * T - g;
    const w = Math.min(SLOT << lv, this.W + g - x0), h = Math.min(SLOT << lv, this.H + g - y0);
    const ctx = slot.ct.context;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, SLOT, SLOT);
    ctx.setTransform(s, 0, 0, s, 0, 0);
    this.bakeChunk(ctx, x0, y0, w, h);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    slot.ct.refresh();
    const id = lv * 1e6 + ty * 1000 + tx;
    if (slot.id !== id) { if (slot.id >= 0) this.byId.delete(slot.id); slot.id = id; this.byId.set(id, slot); }
    slot.lv = lv; slot.tx = tx; slot.ty = ty; slot.used = this.t;
    // finer levels above coarser ones (a coarse tile shows under while the fine one is on its way)
    slot.img.setPosition(x0, y0).setScale(1 << lv).setDepth(DEPTH.GROUND - lv).setVisible(true);
    this.dirty.delete(id);
    this.baked++;
  }

  /** (v4-A) a layer baked into the ground tiles after the paths: fn(ctx, x0, y0, w, h) for tiles meeting rect {x, y, w, h} */
  addBakeHook(fn, rect) {
    const h = { fn, rect: rect || null };
    this.hooks.push(h);
    this.invalidate(rect);
    return h;
  }

  removeBakeHook(h) { const i = this.hooks.indexOf(h); if (i >= 0) { this.hooks.splice(i, 1); this.invalidate(h.rect); } }

  /** (v4-A) baked tiles meeting rect (all when null) are re-baked in place, one per check, nearest the view first */
  invalidate(rect) {
    for (const s of this.slots) {
      if (s.id < 0) continue;
      const T = TW << s.lv, x = s.tx * T, y = s.ty * T;
      if (rect && (x > rect.x + rect.w || x + T < rect.x || y > rect.y + rect.h || y + T < rect.y)) continue;
      this.dirty.add(s.id);
    }
  }

  /** is a baked tile meeting rect waiting for its re-bake? */
  dirtyIn(rect) {
    for (const id of this.dirty) {
      const s = this.byId.get(id);
      if (!s) continue;
      const T = TW << s.lv, x = s.tx * T, y = s.ty * T;
      if (!(x > rect.x + rect.w || x + T < rect.x || y > rect.y + rect.h || y + T < rect.y)) return true;
    }
    return false;
  }

  /** (v4-A) re-bake one dirty tile in its own slot (no hole while it is redrawn) */
  rebakeOne(view) {
    if (!this.dirty.size) return false;
    let best = null, bd = Infinity;
    const cx = view ? (view.x + view.right) / 2 : 0, cy = view ? (view.y + view.bottom) / 2 : 0;
    for (const id of this.dirty) {
      const s = this.byId.get(id);
      if (!s) { this.dirty.delete(id); continue; }
      const T = TW << s.lv;
      // tiles of the level in use first (a coarse tile hidden under fine ones can wait)
      const d = (s.lv === this.level ? 0 : 1e7) + Math.abs((s.tx + 0.5) * T - cx) + Math.abs((s.ty + 0.5) * T - cy);
      if (d < bd) { bd = d; best = s; }
    }
    if (!best) return false;
    this.bakeInto(best, best.lv, best.tx, best.ty);
    return true;
  }

  runHooks(ctx, x0, y0, w, h) {
    for (const hk of this.hooks) {
      const r = hk.rect;
      if (r && (x0 > r.x + r.w || x0 + w < r.x || y0 > r.y + r.h || y0 + h < r.y)) continue;
      try { ctx.save(); hk.fn(ctx, x0, y0, w, h); } catch (e) { if (!this._hookErr) { this._hookErr = true; console.error('[FrostVillage] ground hook:', e); } } finally { ctx.restore(); }
    }
  }

  destroyTiles() {
    const gs = this.gs;
    for (const s of this.slots) {
      try { s.img.destroy(); if (gs.textures.exists(s.key)) gs.textures.remove(s.key); } catch (e) { /* scene teardown */ }
    }
    this.slots.length = 0;
    this.byId.clear();
    this.dirty.clear();
    for (const L of this.layers) this.dropImg(L);
  }

  // ---------------------------------------------------------------- (v4-B) layers merged into the tiles
  watch(L) { this.watched.add(L); }

  /** layer states: merge fully shown layers into the tiles, give fading ones their own image (runs every frame) */
  settleLayers() {
    if (!this.watched.size) return;
    for (const L of this.watched) {
      if (!L.active) { this.watched.delete(L); this.dropImg(L); continue; }
      const full = L.full, want = L.want;
      if (full !== L.merged) { L.merged = full; this.invalidate(L.rect); }
      // its own image while it is not (yet) in the tiles under it
      const needImg = want && (!L.merged || this.dirtyIn(L.rect));
      if (needImg) {
        if (!L.img) this.makeImg(L);
        if (L.img) { L.img.setAlpha(L.merged ? 1 : L._a); L.img.setVisible(true); }
      } else if (L.img) this.dropImg(L);
      if (!needImg && !L.img) this.watched.delete(L);
    }
  }

  makeImg(L) {
    const gs = this.gs, r = L.rect;
    const key = 'fv_layer_' + L.id;
    if (gs.textures.exists(key)) gs.textures.remove(key);
    const ct = gs.textures.createCanvas(key, Math.max(1, Math.ceil(r.w)), Math.max(1, Math.ceil(r.h)));
    if (!ct) return;
    const ctx = ct.context;
    ctx.save();
    ctx.translate(-r.x, -r.y);
    try { L.draw(ctx, r.x, r.y, r.w, r.h); } catch (e) { console.error(e); }
    ctx.restore();
    ct.refresh();
    L.img = gs.add.image(r.x, r.y, key).setOrigin(0, 0).setDepth(L.depth);
  }

  dropImg(L) {
    if (!L.img) return;
    const gs = this.gs, key = L.img.texture && L.img.texture.key;
    L.img.destroy();
    L.img = null;
    try { if (key && gs.textures.exists(key)) gs.textures.remove(key); } catch (e) { /* teardown */ }
  }

  /** merged layers meeting the tile, floors first then roads */
  drawLayers(ctx, x0, y0, w, h) {
    for (let o = 0; o < 2; o++) {
      for (const L of this.layers) {
        if (L.order !== o || !L.merged) continue;
        const r = L.rect;
        if (x0 > r.x + r.w || x0 + w < r.x || y0 > r.y + r.h || y0 + h < r.y) continue;
        try { ctx.save(); L.draw(ctx, x0, y0, w, h); } catch (e) { console.error(e); } finally { ctx.restore(); }
      }
    }
  }

  bakeChunk(ctx, x0, y0, w, h) {
    ctx.save();
    ctx.translate(-x0, -y0);
    const H = this.H, W = this.W;
    const xa = x0 - 16, xb = x0 + w + 16;
    // land polygon below the shoreline (only the part of this tile)
    const land = () => {
      ctx.beginPath();
      ctx.moveTo(xa, shoreY(xa));
      for (let x = xa; x <= xb; x += 8) ctx.lineTo(x, shoreY(x));
      ctx.lineTo(xb, shoreY(xb)); ctx.lineTo(xb, y0 + h + 10); ctx.lineTo(xa, y0 + h + 10); ctx.closePath();
    };
    // shallow turquoise water hugging the shoreline (over the live sea, fading out to sea)
    let tileShore = Infinity;
    for (let x = xa; x <= xb; x += 16) tileShore = Math.min(tileShore, shoreY(x));
    let tileShoreMax = 0;
    for (let x = xa; x <= xb; x += 16) tileShoreMax = Math.max(tileShoreMax, shoreY(x));
    if (y0 < tileShoreMax + 20) this.drawShallow(ctx, x0, y0, w, h);
    // snow
    ctx.fillStyle = pattern(ctx, 'ground_snow') || '#eef3f9';
    land(); ctx.fill();
    // soft blue shading toward the map edges (gives depth). (v4-A) a 240 px band on each side whatever the
    // map width (the v3 map was 3000 px wide: 8 % of it), so the first village looks exactly as before
    const vg = ctx.createLinearGradient(0, 0, W, 0);
    const band = Math.min(0.5, 240 / W);
    vg.addColorStop(0, 'rgba(120,150,200,0.10)'); vg.addColorStop(band, 'rgba(120,150,200,0)');
    vg.addColorStop(1 - band, 'rgba(120,150,200,0)'); vg.addColorStop(1, 'rgba(120,150,200,0.10)');
    ctx.fillStyle = vg; land(); ctx.fill();

    if (y0 < tileShoreMax + 80 && y0 + h > tileShore - 120) this.bakeShore(ctx, xa, xb);
    this.bakePaths(ctx, x0, y0, w, h);
    if (this.hooks.length) this.runHooks(ctx, x0, y0, w, h);
    this.bakeDecals(ctx, x0, y0, w, h);
    // (v4-B) zone floors and the roads of zones / regions, once shown (they were images of their own)
    if (this.layers.length) this.drawLayers(ctx, x0, y0, w, h);
    ctx.restore();
    void H;
  }

  /** the shallow band (~130 px above the wavy shoreline, alpha ramping toward the beach) for one tile */
  drawShallow(ctx, x0, y0, w, h) {
    // (v4-B) scratch canvases at the tile's resolution (a half-resolution tile needs a quarter of the pixels)
    const k = devScale(ctx), cw = Math.max(1, Math.ceil(w * k)), ch = Math.max(1, Math.ceil(h * k));
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    const g = c.getContext('2d');
    g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    g.fillStyle = pattern(g, 'water_shallow') || 'rgba(120,200,230,1)';
    g.fillRect(x0, y0, w, h);
    // (build the mask separately: destination-in clears everything outside each drawn shape)
    const m = document.createElement('canvas');
    m.width = cw; m.height = ch;
    const mg = m.getContext('2d');
    mg.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    const band = 130;
    for (let x = x0 - 6; x < x0 + w + 6; x += 6) {
      const sy = shoreY(x + 3);
      const gr = mg.createLinearGradient(0, sy - band, 0, sy + 6);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(0.55, 'rgba(0,0,0,0.35)');
      gr.addColorStop(1, 'rgba(0,0,0,0.85)');
      mg.fillStyle = gr;
      mg.fillRect(x, sy - band, 6, band + 6);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(m, 0, 0);
    g.globalCompositeOperation = 'source-over';
    ctx.drawImage(c, x0, y0, w, h);
    c.width = c.height = m.width = m.height = 1;
  }

  bakeShore(ctx, xa, xb) {
    // icy rim + wet edge
    ctx.save();
    ctx.lineJoin = 'round';
    const line = (off) => { ctx.beginPath(); for (let x = xa - 8; x <= xb + 8; x += 8) { const y = shoreY(x) + off; if (x <= xa - 8) ctx.moveTo(x, y); else ctx.lineTo(x, y); } };
    ctx.strokeStyle = 'rgba(201,214,232,0.9)'; ctx.lineWidth = 12; line(6); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 7; line(1); ctx.stroke();
    ctx.strokeStyle = 'rgba(156,199,230,0.55)'; ctx.lineWidth = 5; line(-6); ctx.stroke();
    ctx.restore();
    // foam strip segments along the curve (texture: water above, land below; lip at anchor y)
    const foam = Assets.source('shore_foam');
    const f = foam.frame;
    const lip = (foam.def && foam.def.anchor ? foam.def.anchor[1] : 0.6) * f.cutHeight;
    const seg = 32;
    // segments start on a world grid so neighbouring tiles line up
    const s0 = Math.floor(xa / seg) * seg - seg;
    for (let x = s0; x < xb + seg; x += seg) {
      const y1 = shoreY(x), y2 = shoreY(x + seg);
      const ang = Math.atan2(y2 - y1, seg);
      ctx.save();
      ctx.translate(x, y1 + 4);
      ctx.rotate(ang);
      const sx = x + seg;   // texture offset follows the world x
      const u = ((sx % f.cutWidth) + f.cutWidth) % f.cutWidth;
      const sw = Math.min(seg + 1, f.cutWidth - u);
      ctx.drawImage(foam.img, f.cutX + u, f.cutY, sw, f.cutHeight, 0, -lip, sw + 0.6, f.cutHeight);
      ctx.restore();
    }
  }

  bakePaths(ctx, x0, y0, w, h) {
    const paths = WORLD.paths || [];
    this.drawRoads(ctx, paths, x0, y0, w, h);
    this.pathDecor(ctx, paths, x0, y0, w, h);
  }

  /**
   * Road surface for polylines `paths` into ctx (ctx maps world coordinates; the visible area is
   * x0, y0, w, h). With the v2 `ground_road` texture: textured road with soft edges; otherwise the
   * soft trodden-snow style. Junctions are one shape, so they never get darker.
   */
  drawRoads(ctx, paths, x0, y0, w, h) {
    if (!paths.length) return;
    const OFF = 30000;
    const stroke = (c, ox) => {
      c.beginPath();
      for (const pts of paths) pts.forEach((p, i) => (i ? c.lineTo(p[0] - ox, p[1]) : c.moveTo(p[0] - ox, p[1])));
    };
    // stroke far off-canvas: only its blurred shadow lands (soft feathered edges in every browser)
    // (shadow offset / blur are device px: scaled with the context, so half-resolution tiles look the same)
    const soft = (c, lw, color, blur) => {
      const k = devScale(c);
      c.save();
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.shadowColor = color; c.shadowBlur = blur * k; c.shadowOffsetX = OFF * k; c.shadowOffsetY = 0;
      c.strokeStyle = '#000'; c.lineWidth = lw;
      stroke(c, OFF); c.stroke();
      c.restore();
    };
    if (Assets.has('ground_road') && typeof document !== 'undefined') {
      // textured road: a soft mask filled with the road texture, over a soft shadowy rim
      soft(ctx, 92, 'rgba(110,130,170,0.30)', 22);
      const k = devScale(ctx);
      const tmp = document.createElement('canvas');
      tmp.width = Math.max(1, Math.ceil(w * k)); tmp.height = Math.max(1, Math.ceil(h * k));
      const t = tmp.getContext('2d');
      t.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
      soft(t, 70, 'rgba(0,0,0,1)', 14);
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.globalCompositeOperation = 'source-in';
      const pat = pattern(t, 'ground_road', 0.5);
      if (pat && pat.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix().translate(-x0 * k, -y0 * k).scale(0.5 * k));
      t.fillStyle = pat || '#b7a99a';
      t.fillRect(0, 0, tmp.width, tmp.height);
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.drawImage(tmp, x0, y0, w, h);
      ctx.restore();
      tmp.width = tmp.height = 1;
      return;
    }
    soft(ctx, 80, 'rgba(136,160,198,0.36)', 26);   // packed, slightly blue-grey trodden snow
    soft(ctx, 34, 'rgba(150,138,130,0.26)', 14);   // a hint of earth showing through in the middle
  }

  /** snow drifts and footprints along the paths (the random choices are the same whichever tile draws them) */
  pathDecor(ctx, paths, x0, y0, w, h) {
    const clip = x0 !== undefined;
    const near = (x, y) => !clip || (x > x0 - 120 && x < x0 + w + 120 && y > y0 - 120 && y < y0 + h + 120);
    ctx.save();
    // drift texture breaking up the edges
    const r1 = rng(11);
    if (Assets.has('decal_snow_drift_a')) {
      for (const pts of paths) {
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
          const len = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
          for (let d = 90; d < len - 60; d += 230 + r1() * 140) {
            const t = d / len, side = (r1() < 0.5 ? -1 : 1) * (34 + r1() * 10);
            const x = ax + (bx - ax) * t - Math.sin(ang) * side, y = ay + (by - ay) * t + Math.cos(ang) * side;
            const k = r1() < 0.5 ? 'decal_snow_drift_a' : 'decal_snow_drift_b', sc = 0.42 + r1() * 0.2;
            if (near(x, y)) drawFrame(ctx, k, x, y, sc, 0, 0.55);
          }
        }
      }
    }
    // footprints stamped along the paths (decal runs along the A axis = 26.6 deg)
    const hasFoot = Assets.has('decal_footprints');
    const r2 = rng(5);
    const A = Math.atan2(22.63, 45.25);
    for (const pts of paths) {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        const len = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
        if (hasFoot) {
          for (let d = 60; d < len - 40; d += 150 + r2() * 80) {
            const t = d / len, side = (r2() - 0.5) * 24;
            const x = ax + (bx - ax) * t - Math.sin(ang) * side, y = ay + (by - ay) * t + Math.cos(ang) * side;
            const rot = ang - A + (r2() < 0.5 ? Math.PI : 0);
            if (near(x, y)) drawFrame(ctx, 'decal_footprints', x, y, 0.42, rot, 0.45);
          }
        } else {
          ctx.fillStyle = 'rgba(150,170,205,0.28)';
          for (let d = 10; d < len; d += 26) {
            if (r2() < 0.35) continue;
            const t = d / len, side = (Math.floor(d / 26) % 2 ? 1 : -1) * 7;
            const x = ax + (bx - ax) * t - Math.sin(ang) * side, y = ay + (by - ay) * t + Math.cos(ang) * side;
            ctx.beginPath(); ctx.ellipse(x, y, 5, 3, ang, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    }
    ctx.restore();
  }

  bakeDecals(ctx, x0, y0, w, h) {
    for (const d of WORLD.decals) {
      const [key, x, y, sc = 1, rot = 0] = d;
      if (y < y0 - 300 || y > y0 + h + 300 || x < x0 - 400 || x > x0 + w + 400) continue;
      drawFrame(ctx, key, x, y, sc, (rot * Math.PI) / 180, 0.95);
    }
  }

  /**
   * roads that belong to a zone / a region (shown when it opens). (v4-B) A GroundLayer: its own image only
   * while it fades in, then part of the ground tiles (the separate canvas is released).
   */
  roadOverlay(id, paths) {
    if (!paths || !paths.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const pts of paths) for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    x0 = Math.floor(x0 - 90); y0 = Math.floor(y0 - 90); x1 = Math.ceil(x1 + 90); y1 = Math.ceil(y1 + 90);
    const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    const L = new GroundLayer(this, 'roads_' + id, rect, (ctx, cx, cy, cw, ch) => {
      this.drawRoads(ctx, paths, cx, cy, cw, ch);
      this.pathDecor(ctx, paths, cx, cy, cw, ch);
    }, 1, DEPTH.FLOOR + 10);
    this.layers.push(L);
    return L;
  }

  /** one zone floor (iso parallelogram); (v4-B) a GroundLayer like the roads (an image only while it fades in) */
  zoneFloor(id, z) {
    const [cx, cy] = z.center;
    const pts = isoRect(cx, cy, z.size[0], z.size[1]);
    const pad = 24;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    x0 = Math.floor(x0 - pad); y0 = Math.floor(y0 - pad); x1 = Math.ceil(x1 + pad); y1 = Math.ceil(y1 + pad);
    const rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    const L = new GroundLayer(this, 'floor_' + id, rect, (ctx) => this.drawFloor(ctx, z, pts, rect), 0, DEPTH.FLOOR);
    this.layers.push(L);
    return L;
  }

  /** draw a zone floor in world coordinates */
  drawFloor(ctx, z, pts, rect) {
    const [cx, cy] = z.center;
    const k = devScale(ctx);
    const poly = (inset = 0) => {
      ctx.beginPath();
      // inset toward the centre
      pts.forEach((p, i) => {
        const x = p.x + (cx - p.x) * inset, y = p.y + (cy - p.y) * inset;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      });
      ctx.closePath();
    };
    // soft snow-bank shadow around the floor
    ctx.save();
    ctx.shadowColor = 'rgba(90,110,150,0.35)'; ctx.shadowBlur = 18 * k; ctx.shadowOffsetY = 4 * k;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    poly(); ctx.fill();
    ctx.restore();
    ctx.save();
    poly(); ctx.clip();
    ctx.fillStyle = pattern(ctx, z.floor) || '#d9a08a';
    ctx.globalAlpha = 1;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    if (z.floorAlpha !== undefined && z.floorAlpha < 1) {
      // blend toward snow for soft floors (forest, hunting ground)
      ctx.globalAlpha = 1 - z.floorAlpha;
      ctx.fillStyle = pattern(ctx, 'ground_snow') || '#eef3f9';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.globalAlpha = 1;
    }
    // inner bevel / edge darkening
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(80,50,40,0.18)'; ctx.lineWidth = 14; poly(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3; poly(0.012); ctx.stroke();
    ctx.restore();
    // snow lip on the border
    ctx.strokeStyle = 'rgba(244,247,251,0.9)'; ctx.lineWidth = 5; poly(); ctx.stroke();
  }

  update(dt) {
    this.t += dt;
    // bake the land the camera is about to see (one tile per check, so a walk never hitches for long)
    // (v4-B) 512 px tiles: up to two per check (a quarter of the old tile each)
    this.settleLayers();
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.12;
      const view = this.gs.viewRect ? this.gs.viewRect() : this.gs.cameras.main.worldView;
      if (!this.ensure(view, 2) && this.dirty.size) this.rebakeOne(view);
      this.trimT -= 0.12;
      if (this.trimT <= 0) { this.trimT = 2; this.trim(view); }
    }
    // (the sprites follow the view; the pattern stays put in the world: offset by the sprite's own position)
    this.seaFit(false);
    const sea = this.sea;
    sea.tilePositionX = sea.x + this.t * 6;
    sea.tilePositionY = sea.y + 200 + Math.sin(this.t * 0.4) * 6;
    if (this.fish1) { this.fish1.tilePositionX = this.fish1.x + this.t * 22; this.fish1.tilePositionY = Math.sin(this.t * 0.7) * 5; }
    if (this.fish2) { this.fish2.tilePositionX = (this.fish2.x / 0.8) + 130 + this.t * 14; this.fish2.tilePositionY = 40; }
  }
}
