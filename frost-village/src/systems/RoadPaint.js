// RoadPaint (v4-B, docs/v4_plan.md §10.3): the v4 streets and the rails, baked into the ground tiles through
// Ground.addBakeHook — a port of tools/fx/gen_roads.py compose() and the roads manifest's roadKit rules:
//   - textures per cell (pattern origin at the grid origin G, scale 1): road_dirt (ruts along X), road_dirt_y,
//     road_dirt_cross (junction squares), road_cobble_wide (읍), sidewalk (the square, 읍 sidewalks)
//   - snow_edge_* between paved and snow cells, snow_corner_* / snow_inner_* at the lattice points (the corner
//     piece owns the first cell of both edges leaving it), curb_* between carriageway and sidewalk (읍)
//   - footpaths (가게 골목, 집 앞길, ...) as soft trodden snow until 읍 makes them sidewalks
//   - the rails: rail_x, rail_x_crossing, rail_x_end_n/p on lattice line j = 0, under snow drifts until the
//     station is repaired
// The pictures it uses are bake-only: when the camera has been far from the streets for a while they are taken
// out of the texture memory and fetched again the next time a street tile is baked (Ground keeps the baked
// tiles; a tile baked without them is re-baked when they arrive).

import { Assets } from '../core/Assets.js';
import { RailPath } from './RailPath.js';
import { WORLD, L4 } from '../data/world.js';
import { rng } from '../core/Placeholders.js';
import { CELL } from './RoadNet.js';

const RAIL_KEYS = ['rail_x', 'rail_x_crossing', 'rail_x_end_n', 'rail_x_end_p'];
export const PAINT_FILES = ['road_dirt', 'road_dirt_y', 'road_dirt_cross', 'sidewalk', 'roads_decals'];
const EUP_FILES = ['road_cobble_wide'];
// ((v4.2 CODE-2) + train2_rails: the two loop decals (assets/train2, a bake-only page: released with the others))
const BAKE_ONLY = ['road_dirt', 'road_dirt_y', 'road_dirt_cross', 'sidewalk', 'road_cobble_wide', 'roads_decals', 'town_rails', 'train2_rails'];
const LOOP_DECALS = ['rail_loop_ours', 'rail_loop_town'];
const RELEASE_AFTER = 10;      // s with the view far from the streets before their pictures leave the memory
const FAR = 800;               // px from the street area that counts as far (the ground bakes ~710 px around the view)
const NEAR = 1300;             // px: coming back closer than this fetches them again before a tile needs them

/** draw one atlas sprite with its anchor at (x, y) (trimmed frames placed where the untrimmed frame would be) */
function drawAt(ctx, key, x, y, alpha = 1, scale = 1) {
  const s = Assets.source(key);
  if (s.ph) return false;
  const f = s.frame, a = s.anchor || [0.5, 0.5];
  const rw = f.realWidth || f.cutWidth, rh = f.realHeight || f.cutHeight;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.drawImage(s.img, f.cutX, f.cutY, f.cutWidth, f.cutHeight, -a[0] * rw + (f.x || 0), -a[1] * rh + (f.y || 0), f.cutWidth, f.cutHeight);
  ctx.restore();
  return true;
}

/** a roads-kit piece (untrimmed frame, integer anchorPx): drawn at round(anchor) - anchorPx */
function piece(ctx, key, ax, ay) {
  const d = Assets.def(key);
  if (!d || !d.anchorPx || !Assets.has(key)) return false;
  const s = Assets.source(key), f = s.frame;
  ctx.drawImage(s.img, f.cutX, f.cutY, f.cutWidth, f.cutHeight, Math.round(ax) - d.anchorPx[0], Math.round(ay) - d.anchorPx[1], f.cutWidth, f.cutHeight);
  return true;
}

const PAVED = (c) => !!c && (c.t === CELL.ROAD || c.t === CELL.WALK || c.t === CELL.SQUARE);

export class RoadPaint {
  constructor(gs, roadNet, opts = {}) {
    this.gs = gs;
    this.rn = roadNet;
    this.drifts = opts.drifts !== false;
    this.rank = opts.rank || 1;
    const V = WORLD.v4;
    // ((v4.2) the main line k −6 … 41 with a balloon loop at each end (docs/v42_plan.md §5.1): straight tiles + the
    //  loops' curves painted procedurally until the train2 loop decals are wired in (CODE-2))
    this.R = (WORLD.v42 && WORLD.v42.rail) || V.rail;
    this.path = WORLD.v42 && WORLD.v42.rail ? new RailPath(WORLD.v42.rail, V.G) : null;
    const a = L4(this.R.from - 1, 0), b = L4(this.R.to + 2, 0);
    this.railRect = { x: a[0] - 160, y: a[1] - 140, w: b[0] - a[0] + 320, h: b[1] - a[1] + 280 };
    if (this.path) {
      // grow the rect over both loops (+ the ballast and a margin)
      let x0 = this.railRect.x, y0 = this.railRect.y, x1 = x0 + this.railRect.w, y1 = y0 + this.railRect.h;
      this.path.sample(0, this.path.length, 0.5, (o) => { x0 = Math.min(x0, o.x - 120); x1 = Math.max(x1, o.x + 120); y0 = Math.min(y0, o.y - 90); y1 = Math.max(y1, o.y + 90); });
      this.railRect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    this.streetRect = this.computeRect();
    this.hooks = [
      gs.ground.addBakeHook((ctx, x0, y0, w, h) => this.paintStreets(ctx, x0, y0, w, h), this.streetRect),
      gs.ground.addBakeHook((ctx, x0, y0, w, h) => this.paintRails(ctx, x0, y0, w, h), this.railRect),
    ];
    this.farT = 0;
    this.released = false;
    // the pictures arrive after the hooks (or come back after a release): re-bake what was baked without them
    this.onArrive = (key) => {
      if (key === 'town_rails' || key === 'roads_decals' || key === 'train2_rails') gs.ground.invalidate(this.railRect);
      if (PAINT_FILES.indexOf(key) >= 0 || EUP_FILES.indexOf(key) >= 0) gs.ground.invalidate(this.streetRect);
    };
    Assets.arrivals.push(this.onArrive);
    if (roadNet && roadNet.onChange) roadNet.onChange(() => { this.streetRect = this.computeRect(); if (!this.wiping) gs.ground.invalidate(this.streetRect); });
    gs.events.once('shutdown', () => this.destroy());
  }

  /** the bounding box (px) of every street cell (+ the footpaths) */
  computeRect() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (i, j) => { const [x, y] = L4(i, j); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const s of WORLD.v4.streets) { if (s.id === 'link') continue; grow(s.i[0], s.j[0]); grow(s.i[1], s.j[0]); grow(s.i[1], s.j[1]); grow(s.i[0], s.j[1]); if (s.paintSpan) { grow(s.i[0], s.paintSpan[0]); grow(s.i[1], s.paintSpan[1]); } }
    return { x: x0 - 160, y: y0 - 120, w: x1 - x0 + 320, h: y1 - y0 + 240 };
  }

  /** (v4.2) the 물류창고 lanes (WORLD.v42.streets: dirt + the apron + the trodden footpath), painted once the depot
   *  stands — kept out of RoadNet (v5 / v8 take the ids over) */
  addV42Streets() {
    if (this.v42Hook || !WORLD.v42) return;
    const S = WORLD.v42.streets || [];
    const rects = [];
    for (const s of S) {
      if (s.axis === 'path') continue;
      const I = s.paintI || (s.axis === 'y' && s.paint ? s.paint : s.i), J = s.axis === 'x' && s.paint ? s.paint : s.j;
      rects.push({ i: I, j: J, key: s.axis === 'y' ? 'road_dirt_y' : 'road_dirt' });
      if (s.apron) rects.push({ i: [s.apron[0], s.apron[1]], j: [s.apron[2], s.apron[3]], key: 'road_dirt' });
    }
    const walk = (S.find((q) => q.axis === 'path') || {}).pts || [];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (i, j) => { const [x, y] = L4(i, j); x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const r of rects) { grow(r.i[0], r.j[0]); grow(r.i[1], r.j[0]); grow(r.i[1], r.j[1]); grow(r.i[0], r.j[1]); }
    for (const [i, j] of walk) grow(i, j);
    const rect = { x: x0 - 80, y: y0 - 60, w: x1 - x0 + 160, h: y1 - y0 + 120 };
    this.v42Rects = rects; this.v42Walk = walk;
    this.want(['road_dirt', 'road_dirt_y']);
    this.v42Hook = this.gs.ground.addBakeHook((ctx) => this.paintV42(ctx), rect);
    this.hooks.push(this.v42Hook);
    this.gs.ground.invalidate(rect);
  }
  paintV42(ctx) {
    for (const r of this.v42Rects || []) {
      const pat = this.pattern(ctx, r.key) || this.pattern(ctx, 'road_dirt');
      const c = [L4(r.i[0], r.j[0]), L4(r.i[1], r.j[0]), L4(r.i[1], r.j[1]), L4(r.i[0], r.j[1])];
      ctx.save();
      ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (const q of c) ctx.lineTo(q[0], q[1]); ctx.closePath();
      ctx.fillStyle = pat || '#b9a68c';
      ctx.globalAlpha = pat ? 1 : 0.7;
      ctx.fill();
      ctx.restore();
    }
    // the footpath: trodden snow dots along its points
    const W = this.v42Walk || [];
    ctx.save();
    ctx.fillStyle = 'rgba(168, 150, 128, 0.55)';
    for (let k = 1; k < W.length; k++) {
      const [a, b] = [W[k - 1], W[k]], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.35);
      for (let q = 0; q <= n; q++) { const [x, y] = L4(a[0] + ((b[0] - a[0]) * q) / n, a[1] + ((b[1] - a[1]) * q) / n); ctx.beginPath(); ctx.ellipse(x + ((q * 7) % 9) - 4, y, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }

  /** the station was repaired: the drifts on the rails go */
  setDrifts(v) { if (this.drifts === v) return; this.drifts = v; this.gs.ground.invalidate(this.railRect); }

  /** (읍) the cobble picture; with `animate` the ceremony re-bakes tile by tile (wipeRects) */
  setRank(level, animate) {
    this.rank = level;
    this.wiping = !!animate;
    this.want(EUP_FILES);
    if (!animate) this.gs.ground.invalidate(this.streetRect);
    else this.gs.time.delayedCall(4000, () => { this.wiping = false; });
  }

  /** the street rectangle as 1024 px tile rects, nearest to (cx, cy) first (the ceremony's repave wipe) */
  wipeRects(cx, cy) {
    const r = this.streetRect, T = 1024, out = [];
    for (let ty = Math.floor(r.y / T); ty <= Math.floor((r.y + r.h) / T); ty++) {
      for (let tx = Math.floor(r.x / T); tx <= Math.floor((r.x + r.w) / T); tx++) {
        const x = tx * T + T / 2, y = ty * T + T / 2;
        out.push({ x, y, d: Math.hypot(x - cx, (y - cy) * 2), rect: { x: tx * T + 1, y: ty * T + 1, w: T - 2, h: T - 2 } });
      }
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  // ------------------------------------------------------------------ bake-only pictures
  want(keys) {
    let n = 0;
    for (const k of keys) {
      if (this.gs.textures.exists(k)) continue;
      Assets.queued.delete(k);
      Assets.lateWant.add(k);
      n++;
    }
    if (n) {
      this.released = false;
      const roads = keys.filter((k) => k !== 'town_rails' && k !== 'train2_rails');
      if (roads.length) Assets.loadFragment(this.gs, 'roads', { only: roads });
      if (keys.indexOf('town_rails') >= 0) Assets.loadFragment(this.gs, 'town', { only: ['town_rails'] });
      if (keys.indexOf('train2_rails') >= 0) Assets.loadFragment(this.gs, 'train2', { only: ['train2_rails'] });
    }
  }
  ready(keys) { for (const k of keys) if (!Assets.has(k) && !this.gs.textures.exists(k)) return false; return true; }

  /** called by Neighbours every frame: release the pictures while the camera is far from the streets */
  update(dt) {
    const gs = this.gs, v = gs.cameras.main.worldView, r = this.streetRect, rr = this.railRect;
    const far = (q) => v.right < q.x - FAR || v.x > q.x + q.w + FAR || v.bottom < q.y - FAR || v.y > q.y + q.h + FAR;
    if (far(r) && far(rr) && !gs.ground.dirty.size) this.farT += dt; else this.farT = 0;
    if (this.farT > RELEASE_AFTER && !this.released) this.release();
    // (the ground tiles are a pool: a street tile is baked again when the camera comes back; fetch the pictures
    //  while the camera approaches, so the tile is baked with its street, not re-baked a moment later)
    if (this.released) {
      const near = (q) => !(v.right < q.x - NEAR || v.x > q.x + q.w + NEAR || v.bottom < q.y - NEAR || v.y > q.y + q.h + NEAR);
      if (near(r) || near(rr)) { this.released = false; this.want(BAKE_ONLY.filter((k) => this.needs(k))); }
    }
  }

  /** a bake-only picture this painter uses now (the 읍 cobble only after the upgrade) */
  needs(k) { if (k === 'train2_rails') return !!this.path; return EUP_FILES.indexOf(k) < 0 || this.rank >= 2; }

  release() {
    const gs = this.gs;
    this.released = true;
    for (const k of BAKE_ONLY) {
      if (!gs.textures.exists(k)) continue;
      try { gs.textures.remove(k); } catch (e) { continue; }
      Assets.queued.delete(k);
      Assets.cache.delete(k);
      for (const sk in Assets.m.sprites) { const d = Assets.m.sprites[sk]; if (d && (d.atlas === k || d.image === k)) Assets.cache.delete(sk); }
    }
  }

  // ------------------------------------------------------------------ rails
  paintRails(ctx, x0, y0, w, h) {
    if (!RAIL_KEYS.every((k) => Assets.has(k))) { this.want(['town_rails']); return; }
    const R = this.R;
    const cross = new Set(R.crossings || []);
    // ((v4.2) the loops: (CODE-2) the train2 decals over the plain straight tiles — a difference matte over exactly
    //  the rail_x tiles under them, so the joints at A and T have no seam; (CODE-1 fallback) the curves painted first
    //  and the straight tiles over the turnouts)
    const decals = !!this.path && LOOP_DECALS.every((k) => Assets.has(k));
    if (this.path && !decals) { this.want(['train2_rails']); this.paintLoops(ctx, x0, y0, w, h); }
    for (let k = R.from; k <= R.to; k++) {
      const [x, y] = L4(k + 0.5, 0);
      if (x < x0 - 180 || x > x0 + w + 180 || y < y0 - 140 || y > y0 + h + 140) continue;
      const key = this.path ? (cross.has(k) ? 'rail_x_crossing' : 'rail_x') : k === R.from ? 'rail_x_end_n' : k === R.to ? 'rail_x_end_p' : cross.has(k) ? 'rail_x_crossing' : 'rail_x';
      drawAt(ctx, key, x, y);
    }
    if (decals) {
      for (const k of LOOP_DECALS) {
        const d = Assets.def(k), at = d.anchorWorldPx;
        if (!at) continue;
        const fs = d.frameSize || [600, 420];
        if (at[0] + fs[0] < x0 - 40 || at[0] - fs[0] > x0 + w + 40 || at[1] + fs[1] < y0 - 40 || at[1] - fs[1] > y0 + h + 40) continue;
        drawAt(ctx, k, at[0], at[1]);
      }
    }
    if (this.drifts && Assets.has('decal_snow_drift_a')) {
      const r = rng(4242);
      for (let k = R.from; k <= R.to; k++) {
        const a = r(), b = r(), c = r();
        const [x, y] = L4(k + 0.5 + (a - 0.5) * 0.4, (b - 0.5) * 0.5);
        if (x < x0 - 200 || x > x0 + w + 200 || y < y0 - 160 || y > y0 + h + 160) continue;
        drawAt(ctx, c < 0.5 ? 'decal_snow_drift_a' : 'decal_snow_drift_b', x, y, 0.97, 0.75 + a * 0.35);
        if (c < 0.6) { const [x2, y2] = L4(k + 0.95, 0.1); drawAt(ctx, 'decal_snow_drift_b', x2, y2, 0.9, 0.55 + b * 0.3); }
      }
      // (v4.2) the loops lie under the same drifts until the station is repaired
      if (this.path) {
        const P = this.path, o = {};
        for (const seg of P.segs) {
          if (seg.kind !== 'arc' && !(seg.kind === 'line' && Math.abs(seg.a[1]) > 0.1)) continue;
          for (let u = 0.3; u < seg.len; u += 1.2) {
            const a = r(), b = r();
            P.at(seg.s0 + u, o);
            if (o.x < x0 - 200 || o.x > x0 + w + 200 || o.y < y0 - 160 || o.y > y0 + h + 160) continue;
            drawAt(ctx, a < 0.5 ? 'decal_snow_drift_a' : 'decal_snow_drift_b', o.x, o.y, 0.95, 0.7 + b * 0.35);
          }
        }
      }
    }
  }

  /** (v4.2 CODE-1) the curved parts of both loops, painted like the rail_x tiles: ballast, sleepers, two rails, snow */
  paintLoops(ctx, x0, y0, w, h) {
    const P = this.path, G = P.G;
    const X = (i, j) => G[0] + 64 * (i + j), Y = (i, j) => G[1] + 32 * (i - j);
    const r = rng(9191);
    const segs = P.segs.filter((q) => q.kind === 'arc' || (q.kind === 'line' && Math.abs(q.a[1]) > 0.1));
    const o = {};
    const inView = (s0, len) => {
      let hit = false;
      P.sample(s0, len, 1, (q) => { if (q.x > x0 - 140 && q.x < x0 + w + 140 && q.y > y0 - 100 && q.y < y0 + h + 100) hit = true; });
      return hit;
    };
    for (const seg of segs) {
      if (!inView(seg.s0, seg.len)) continue;
      const n = Math.max(2, Math.ceil(seg.len / 0.12));
      const pts = [];
      for (let k = 0; k <= n; k++) { P.at(seg.s0 + (seg.len * k) / n, o); pts.push({ i: o.i, j: o.j, ni: -o.dj, nj: o.di }); }
      const edge = (off) => pts.map((p) => [X(p.i + p.ni * off, p.j + p.nj * off), Y(p.i + p.ni * off, p.j + p.nj * off)]);
      const band = (a, b, fill) => {
        const L = edge(a), Rr = edge(b).reverse();
        ctx.beginPath();
        ctx.moveTo(L[0][0], L[0][1]);
        for (const q of L) ctx.lineTo(q[0], q[1]);
        for (const q of Rr) ctx.lineTo(q[0], q[1]);
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      };
      // ballast (a soft dark rim, the grey bed, a lighter crown)
      band(-0.66, 0.66, 'rgba(120,128,140,0.55)');
      band(-0.6, 0.6, '#8d8f94');
      band(-0.48, 0.48, '#9b9da3');
      // sleepers every ~0.47 m
      const sl = Math.max(1, Math.round(seg.len / 0.47));
      for (let k = 0; k < sl; k++) {
        P.at(seg.s0 + ((k + 0.5) * seg.len) / sl, o);
        const ni = -o.dj, nj = o.di, ti = o.di * 0.06, tj = o.dj * 0.06;
        const c = [[-0.46, -1], [0.46, -1], [0.46, 1], [-0.46, 1]].map(([a, b]) => [X(o.i + ni * a + ti * b, o.j + nj * a + tj * b), Y(o.i + ni * a + ti * b, o.j + nj * a + tj * b)]);
        ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (const q of c) ctx.lineTo(q[0], q[1]); ctx.closePath();
        ctx.fillStyle = '#8f5f48'; ctx.fill();
        ctx.strokeStyle = 'rgba(70,44,34,0.55)'; ctx.lineWidth = 1; ctx.stroke();
      }
      // the two rails (gauge 0.9 m = ±0.318 cell): dark steel + a bright top
      for (const off of [-0.318, 0.318]) {
        const L = edge(off);
        ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1] + 1); for (const q of L) ctx.lineTo(q[0], q[1] + 1);
        ctx.strokeStyle = '#4f535c'; ctx.lineWidth = 3.4; ctx.lineJoin = 'round'; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1] - 0.6); for (const q of L) ctx.lineTo(q[0], q[1] - 0.6);
        ctx.strokeStyle = '#c4ccd8'; ctx.lineWidth = 1.3; ctx.stroke();
      }
      // a little snow on the ballast edges
      ctx.fillStyle = 'rgba(246,249,253,0.9)';
      for (let u = 0.2; u < seg.len; u += 0.55) {
        const a = r(), b = r();
        if (a > 0.55) continue;
        P.at(seg.s0 + u, o);
        const side = b < 0.5 ? -0.58 : 0.58;
        const cx = X(o.i - o.dj * side, o.j + o.di * side), cy = Y(o.i - o.dj * side, o.j + o.di * side);
        ctx.beginPath(); ctx.ellipse(cx, cy, 7 + a * 10, 3 + a * 4, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  // ------------------------------------------------------------------ streets
  pattern(ctx, key) {
    if (!Assets.has(key)) return null;
    const s = Assets.source(key);
    const p = ctx.createPattern(s.img, 'repeat');
    const G = WORLD.v4.G;
    if (p && p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().translate(G[0], G[1]));
    return p;
  }

  /** the texture of a paved cell */
  texOf(c) {
    if (c.t === CELL.WALK || c.t === CELL.SQUARE) return 'sidewalk';
    if (c.cls >= 2) return 'road_asphalt';
    if (c.cls >= 1) return 'road_cobble_wide';
    if (c.junction) return 'road_dirt_cross';
    const s = WORLD.v4.streets.find((q) => q.id === c.street);
    return s && s.axis === 'y' ? 'road_dirt_y' : 'road_dirt';
  }

  paintStreets(ctx, x0, y0, w, h) {
    const rn = this.rn;
    if (!rn || !rn.cells) return;
    const need = PAINT_FILES.concat(this.rank >= 2 ? EUP_FILES : []);
    if (!this.ready(need)) this.want(need);
    const V = WORLD.v4;
    // cells meeting this tile (+ a margin for the edge pieces)
    const inTile = (ci, cj) => {
      const [ax, ay] = L4(ci, cj), [bx, by] = L4(ci + 1, cj + 1);
      const xa = Math.min(ax, bx) - 70, xb = Math.max(ax, bx) + 140, ya = Math.min(ay, by) - 80, yb = Math.max(ay, by) + 80;
      return xb > x0 && xa < x0 + w && yb > y0 && ya < y0 + h;
    };
    const cells = [];
    for (const c of rn.cells.values()) if (PAVED(c) && inTile(c.ci, c.cj)) cells.push(c);
    // 1. footpaths that are not paved yet: soft trodden snow along their walk lines (+ the extra walk lines)
    const paths = [];
    const addLine = (axis, fix, a, b) => { const p = axis === 'x' ? [L4(a, fix), L4(b, fix)] : [L4(fix, a), L4(fix, b)]; paths.push(p); };
    for (const s of V.streets) if (s.cls === 'path' && s.walk !== undefined && !(rn.level && rn.level[s.id] !== undefined)) { const sp = s.walkSpan || (s.axis === 'x' ? s.i : s.j); addLine(s.axis, s.walk, sp[0], sp[1]); }
    for (const w2 of V.walkExtra || []) addLine(w2[0], w2[1], w2[2], w2[3]);
    if (paths.length) {
      this.soft(ctx, paths, 62, 'rgba(136,160,198,0.30)', 22);
      this.soft(ctx, paths, 26, 'rgba(150,138,130,0.20)', 12);
    }
    if (!cells.length) return;
    // 2. textures: each texture's cells as one path
    const byTex = new Map();
    for (const c of cells) { const k = this.texOf(c); if (!byTex.has(k)) byTex.set(k, []); byTex.get(k).push(c); }
    for (const [key, list] of byTex) {
      const pat = this.pattern(ctx, key);
      ctx.save();
      ctx.beginPath();
      for (const c of list) {
        const p0 = L4(c.ci, c.cj), p1 = L4(c.ci + 1, c.cj), p2 = L4(c.ci + 1, c.cj + 1), p3 = L4(c.ci, c.cj + 1);
        ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.closePath();
      }
      ctx.fillStyle = pat || (key === 'sidewalk' ? 'rgba(214,210,205,0.95)' : key === 'road_cobble_wide' ? 'rgba(170,160,150,0.95)' : 'rgba(190,176,162,0.9)');
      ctx.fill();
      ctx.restore();
    }
    // 3. snow edges + corners, 4. curbs (읍) — the roads-kit edge / corner rules
    if (!Assets.has('snow_edge_x')) return;
    const cellAt = (i, j) => rn.cell(i, j);
    const done = new Set();
    const vis = (i, j) => inTile(i - 1, j - 1) || inTile(i, j);
    const ijs = new Set();
    for (const c of cells) for (let di = 0; di <= 1; di++) for (let dj = 0; dj <= 1; dj++) ijs.add((c.ci + di + 512) * 1024 + (c.cj + dj + 512));
    // corners first (they own the first cell of the edges leaving them)
    const Q = { e: [1, 1], s: [1, -1], w: [-1, -1], n: [-1, 1] };
    for (const k of ijs) {
      const i = Math.floor(k / 1024) - 512, j = (k % 1024) - 512;
      if (!vis(i, j)) continue;
      const q = {};
      for (const name in Q) { const [sx, sy] = Q[name]; q[name] = cellAt(i + (sx - 1) / 2, j + (sy - 1) / 2); }
      const names = Object.keys(Q);
      const paved = names.filter((n) => PAVED(q[n]));
      let key = null, quarter = null;
      if (paved.length === 3) { quarter = names.find((n) => !PAVED(q[n])); key = 'snow_corner_' + quarter; }
      else if (paved.length === 1) { quarter = paved[0]; key = 'snow_inner_' + quarter; }
      else if (paved.length === 4) {
        const walks = names.filter((n) => q[n].t === CELL.WALK), roads = names.filter((n) => q[n].t === CELL.ROAD);
        if (walks.length === 1 && roads.length === 3) { quarter = walks[0]; key = 'curb_corner_' + quarter; }
        else if (roads.length === 1 && walks.length === 3) { quarter = roads[0]; key = 'curb_inner_' + quarter; }
      }
      if (!key) continue;
      const [x, y] = L4(i, j);
      if (piece(ctx, key, x, y)) {
        const [sx, sy] = Q[quarter];
        done.add('x' + (sx > 0 ? i : i - 1) + ',' + j);
        done.add('y' + i + ',' + (sy > 0 ? j : j - 1));
      }
    }
    // straight pieces
    const variant = (base, i, j) => { const v = ((i * 7 + j * 13) % 3 + 3) % 3; return v ? base + '_' + v : base; };
    for (const c of cells) {
      const i = c.ci, j = c.cj;
      // the four edges of this paved cell: X edges at j (toward -Y neighbour (i, j-1)) and j+1; Y edges at i and i+1
      const edges = [
        ['x', i, j, cellAt(i, j - 1), true],          // segment (i,j)-(i+1,j): this cell is +Y of it, the other (i, j-1) -Y
        ['x', i, j + 1, cellAt(i, j + 1), false],     // segment (i,j+1)-(i+1,j+1): the other is +Y
        ['y', i, j, cellAt(i - 1, j), false],         // segment (i,j)-(i,j+1): the other (i-1, j) is -X
        ['y', i + 1, j, cellAt(i + 1, j), true],      // segment (i+1,j)-(i+1,j+1): the other is +X
      ];
      for (const [ax, ei, ej, other, otherNear] of edges) {
        const id = ax + ei + ',' + ej;
        if (done.has(id)) continue;
        let fam = null;
        if (!PAVED(other)) fam = 'snow_edge';
        else if (c.t === CELL.ROAD && other.t === CELL.WALK) fam = 'curb';
        else continue;
        done.add(id);
        // *_x if the walk / snow cell is the +Y one, *_x_near if it is the -Y one (Y edges: *_y = -X side, *_y_near = +X)
        let key;
        if (ax === 'x') key = fam + '_x' + (otherNear ? '_near' : '');
        else key = fam + '_y' + (otherNear ? '_near' : '');
        const [lx, ly] = L4(ei, ej);
        piece(ctx, variant(key, ei, ej), ax === 'x' ? lx + 32 : lx + 32, ax === 'x' ? ly + 16 : ly - 16);
      }
    }
  }

  /** soft feathered strokes (a far-off stroke whose blurred shadow lands on the path) */
  soft(ctx, lines, lw, color, blur) {
    const OFF = 30000;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.shadowOffsetX = OFF; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#000'; ctx.lineWidth = lw;
    ctx.beginPath();
    for (const [a, b] of lines) { ctx.moveTo(a[0] - OFF, a[1]); ctx.lineTo(b[0] - OFF, b[1]); }
    ctx.stroke();
    ctx.restore();
  }

  destroy() {
    const i = Assets.arrivals.indexOf(this.onArrive);
    if (i >= 0) Assets.arrivals.splice(i, 1);
    if (this.gs.ground) for (const h of this.hooks) this.gs.ground.removeBakeHook(h);
    this.hooks = [];
  }
}
