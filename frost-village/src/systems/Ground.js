// Static ground: scrolling sea + fish schools (live tileSprites) and the snowy land baked once
// into a few canvas textures (snow pattern, shoreline foam, paths, decals). Zone floors are
// separate baked images so locked zones can fade in when they unlock.

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

const TILE = 1024;          // (v3) the land is baked in square tiles, lazily, as the camera comes near
const TILE_MARGIN = 420;   // px around the camera view that should already be baked

export class Ground {
  constructor(gs) {
    this.gs = gs;
    const W = WORLD.width, H = WORLD.height;
    this.W = W; this.H = H;
    let maxShore = 0;
    for (let x = 0; x <= W; x += 8) maxShore = Math.max(maxShore, shoreY(x));
    this.maxShore = maxShore;

    // --- sea (live, scrolling)
    const seaH = Math.ceil(maxShore + 40);
    this.sea = gs.add.tileSprite(0, -200, W, seaH + 200, Assets.sprite('water_sea').tex).setOrigin(0, 0).setDepth(DEPTH.WATER);
    this.fish1 = null; this.fish2 = null;
    const fs = Assets.sprite('fish_school');
    this.fish1 = gs.add.tileSprite(0, 40, W, 200, fs.tex, fs.frame).setOrigin(0, 0).setDepth(DEPTH.FISH).setAlpha(0.55);
    this.fish2 = gs.add.tileSprite(0, 150, W, 200, fs.tex, fs.frame).setOrigin(0, 0).setDepth(DEPTH.FISH).setAlpha(0.35).setTilePosition(130, 40);
    this.fish2.setTileScale(0.8, 0.8);
    this.t = 0;

    // --- baked land: square tiles made when the camera first comes near (a big map costs nothing until seen)
    this.cols = Math.ceil(W / TILE); this.rows = Math.ceil(H / TILE);
    this.tiles = new Array(this.cols * this.rows).fill(null);
    this.baked = 0;
    this.checkT = 0;
    // (v4-A, plan §10.2) extra layers baked into the tiles (rails, v4 streets: fn(ctx, x0, y0, w, h)) and
    // tiles to re-bake in place (one per check) when such a layer changes
    this.hooks = [];
    this.dirty = new Set();
    gs.events.once('shutdown', () => this.destroyTiles());
  }

  /** bake the tiles around the camera view (`max` per call; Infinity = all that are needed now) */
  ensure(view, max = 1, margin = TILE_MARGIN) {
    const x0 = Math.max(0, Math.floor((view.x - margin) / TILE)), x1 = Math.min(this.cols - 1, Math.floor((view.right + margin) / TILE));
    const y0 = Math.max(0, Math.floor((view.y - margin) / TILE)), y1 = Math.min(this.rows - 1, Math.floor((view.bottom + margin) / TILE));
    // tiles inside the view first, then the margin
    let n = 0;
    for (let pass = 0; pass < 2 && n < max; pass++) {
      for (let ty = y0; ty <= y1 && n < max; ty++) {
        for (let tx = x0; tx <= x1 && n < max; tx++) {
          const i = ty * this.cols + tx;
          if (this.tiles[i]) continue;
          const inView = tx * TILE < view.right && (tx + 1) * TILE > view.x && ty * TILE < view.bottom && (ty + 1) * TILE > view.y;
          if (pass === 0 && !inView) continue;
          this.bakeTile(tx, ty);
          n++;
        }
      }
    }
    return n;
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
    for (let ty = 0; ty < this.rows; ty++) {
      for (let tx = 0; tx < this.cols; tx++) {
        const i = ty * this.cols + tx;
        if (!this.tiles[i]) continue;
        if (rect && (tx * TILE > rect.x + rect.w || (tx + 1) * TILE < rect.x || ty * TILE > rect.y + rect.h || (ty + 1) * TILE < rect.y)) continue;
        this.dirty.add(i);
      }
    }
  }

  /** (v4-A) re-bake one dirty tile into its own canvas (no hole while it is redrawn) */
  rebakeOne(view) {
    if (!this.dirty.size) return false;
    let best = -1, bd = Infinity;
    const cx = view ? (view.x + view.right) / 2 : 0, cy = view ? (view.y + view.bottom) / 2 : 0;
    for (const i of this.dirty) {
      const tx = i % this.cols, ty = Math.floor(i / this.cols);
      const d = Math.abs((tx + 0.5) * TILE - cx) + Math.abs((ty + 0.5) * TILE - cy);
      if (d < bd) { bd = d; best = i; }
    }
    this.dirty.delete(best);
    const img = this.tiles[best];
    if (!img || !img.texture || !img.texture.context) return false;
    const tx = best % this.cols, ty = Math.floor(best / this.cols);
    const ct = img.texture, ctx = ct.context;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, ct.width, ct.height);
    this.bakeChunk(ctx, tx * TILE, ty * TILE, ct.width, ct.height);
    ct.refresh();
    return true;
  }

  runHooks(ctx, x0, y0, w, h) {
    for (const hk of this.hooks) {
      const r = hk.rect;
      if (r && (x0 > r.x + r.w || x0 + w < r.x || y0 > r.y + r.h || y0 + h < r.y)) continue;
      try { ctx.save(); hk.fn(ctx, x0, y0, w, h); } catch (e) { if (!this._hookErr) { this._hookErr = true; console.error('[FrostVillage] ground hook:', e); } } finally { ctx.restore(); }
    }
  }

  bakeTile(tx, ty) {
    const gs = this.gs;
    const x0 = tx * TILE, y0 = ty * TILE;
    const w = Math.min(TILE, this.W - x0), h = Math.min(TILE, this.H - y0);
    const key = 'fv_ground_' + tx + '_' + ty;
    if (gs.textures.exists(key)) gs.textures.remove(key);
    const ct = gs.textures.createCanvas(key, w, h);
    this.bakeChunk(ct.context, x0, y0, w, h);
    ct.refresh();
    this.tiles[ty * this.cols + tx] = gs.add.image(x0, y0, key).setOrigin(0, 0).setDepth(DEPTH.GROUND);
    this.baked++;
  }

  destroyTiles() {
    const gs = this.gs;
    for (let i = 0; i < this.tiles.length; i++) {
      if (!this.tiles[i]) continue;
      const k = this.tiles[i].texture.key;
      this.tiles[i].destroy();
      this.tiles[i] = null;
      try { if (gs.textures.exists(k)) gs.textures.remove(k); } catch (e) { /* scene teardown */ }
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
    ctx.restore();
    void H;
  }

  /** the shallow band (~130 px above the wavy shoreline, alpha ramping toward the beach) for one tile */
  drawShallow(ctx, x0, y0, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.translate(-x0, -y0);
    g.fillStyle = pattern(g, 'water_shallow') || 'rgba(120,200,230,1)';
    g.fillRect(x0, y0, w, h);
    // (build the mask separately: destination-in clears everything outside each drawn shape)
    const m = document.createElement('canvas');
    m.width = w; m.height = h;
    const mg = m.getContext('2d');
    mg.translate(-x0, -y0);
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
    ctx.drawImage(c, x0, y0);
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
    const soft = (c, lw, color, blur) => {
      c.save();
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.shadowColor = color; c.shadowBlur = blur; c.shadowOffsetX = OFF; c.shadowOffsetY = 0;
      c.strokeStyle = '#000'; c.lineWidth = lw;
      stroke(c, OFF); c.stroke();
      c.restore();
    };
    if (Assets.has('ground_road') && typeof document !== 'undefined') {
      // textured road: a soft mask filled with the road texture, over a soft shadowy rim
      soft(ctx, 92, 'rgba(110,130,170,0.30)', 22);
      const tmp = document.createElement('canvas');
      tmp.width = Math.ceil(w); tmp.height = Math.ceil(h);
      const t = tmp.getContext('2d');
      t.translate(-x0, -y0);
      soft(t, 70, 'rgba(0,0,0,1)', 14);
      t.setTransform(1, 0, 0, 1, 0, 0);
      t.globalCompositeOperation = 'source-in';
      const pat = pattern(t, 'ground_road', 0.5);
      if (pat && pat.setTransform && typeof DOMMatrix !== 'undefined') pat.setTransform(new DOMMatrix().translate(-x0, -y0).scale(0.5));
      t.fillStyle = pat || '#b7a99a';
      t.fillRect(0, 0, tmp.width, tmp.height);
      ctx.save();
      ctx.globalAlpha = 0.92;
      ctx.drawImage(tmp, x0, y0);
      ctx.restore();
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

  /** roads that belong to a zone, baked into their own image above the zone floor (shown when the zone opens) */
  roadOverlay(id, paths) {
    if (!paths || !paths.length) return null;
    const gs = this.gs;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const pts of paths) for (const p of pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    x0 = Math.floor(x0 - 90); y0 = Math.floor(y0 - 90); x1 = Math.ceil(x1 + 90); y1 = Math.ceil(y1 + 90);
    const key = 'fv_roads_' + id;
    if (gs.textures.exists(key)) gs.textures.remove(key);
    const ct = gs.textures.createCanvas(key, x1 - x0, y1 - y0);
    const ctx = ct.context;
    ctx.save();
    ctx.translate(-x0, -y0);
    this.drawRoads(ctx, paths, x0, y0, x1 - x0, y1 - y0);
    this.pathDecor(ctx, paths);
    ctx.restore();
    ct.refresh();
    return gs.add.image(x0, y0, key).setOrigin(0, 0).setDepth(DEPTH.FLOOR + 10);
  }

  /** bake one zone floor (iso parallelogram) into its own image; returns the Image */
  zoneFloor(id, z) {
    const gs = this.gs;
    const [cx, cy] = z.center;
    const pts = isoRect(cx, cy, z.size[0], z.size[1]);
    const pad = 24;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    x0 = Math.floor(x0 - pad); y0 = Math.floor(y0 - pad); x1 = Math.ceil(x1 + pad); y1 = Math.ceil(y1 + pad);
    const key = 'fv_floor_' + id;
    if (gs.textures.exists(key)) gs.textures.remove(key);
    const ct = gs.textures.createCanvas(key, x1 - x0, y1 - y0);
    const ctx = ct.context;
    ctx.translate(-x0, -y0);
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
    ctx.shadowColor = 'rgba(90,110,150,0.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 4;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    poly(); ctx.fill();
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    poly(); ctx.clip();
    ctx.fillStyle = pattern(ctx, z.floor) || '#d9a08a';
    ctx.globalAlpha = 1;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (z.floorAlpha !== undefined && z.floorAlpha < 1) {
      // blend toward snow for soft floors (forest, hunting ground)
      ctx.globalAlpha = 1 - z.floorAlpha;
      ctx.fillStyle = pattern(ctx, 'ground_snow') || '#eef3f9';
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.globalAlpha = 1;
    }
    // inner bevel / edge darkening
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(80,50,40,0.18)'; ctx.lineWidth = 14; poly(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3; poly(0.012); ctx.stroke();
    ctx.restore();
    // remove the black used for the shadow inside: redraw done above covers it; outside keep only shadow
    // snow lip on the border
    ctx.strokeStyle = 'rgba(244,247,251,0.9)'; ctx.lineWidth = 5; poly(); ctx.stroke();
    ct.refresh();
    return gs.add.image(x0, y0, key).setOrigin(0, 0).setDepth(DEPTH.FLOOR);
  }

  update(dt) {
    this.t += dt;
    // bake the land the camera is about to see (one tile per check, so a walk never hitches for long)
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.12;
      const view = this.gs.viewRect ? this.gs.viewRect() : this.gs.cameras.main.worldView;
      if (!this.ensure(view, 1) && this.dirty.size) this.rebakeOne(view);
    }
    this.sea.tilePositionX = this.t * 6;
    this.sea.tilePositionY = Math.sin(this.t * 0.4) * 6;
    if (this.fish1) { this.fish1.tilePositionX = this.t * 22; this.fish1.tilePositionY = Math.sin(this.t * 0.7) * 5; }
    if (this.fish2) { this.fish2.tilePositionX = 130 + this.t * 14; }
  }
}
