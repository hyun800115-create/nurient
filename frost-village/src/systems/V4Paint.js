// (v4-A stub, docs/v4_plan.md §17.4 A1) the rails and a simple paint of the v4 streets, baked into the ground
// tiles through Ground.addBakeHook. BUILD-B's RoadPaint (roads-kit edges, corners, curbs, cobble at 읍) takes
// this over: delete this file and its two lines in Neighbours.js then.
//   rails: rail_x tiles k = from..to on lattice line j = 0 (buffer stops at both ends, level crossings),
//          covered by snow drifts until the station is repaired
//   streets: the v4 dirt tracks (road_dirt / road_dirt_y), the station square (sidewalk), trodden footpaths

import { Assets } from '../core/Assets.js';
import { WORLD, L4 } from '../data/world.js';
import { rng } from '../core/Placeholders.js';

const RAIL_KEYS = ['rail_x', 'rail_x_crossing', 'rail_x_end_n', 'rail_x_end_p'];
export const PAINT_FILES = ['road_dirt', 'road_dirt_y', 'road_dirt_cross', 'sidewalk'];

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

export class V4Paint {
  constructor(gs, opts = {}) {
    this.gs = gs;
    this.drifts = opts.drifts !== false;
    const V = WORLD.v4;
    this.R = V.rail;
    const a = L4(this.R.from - 1, 0), b = L4(this.R.to + 2, 0);
    this.railRect = { x: a[0] - 160, y: a[1] - 140, w: b[0] - a[0] + 320, h: b[1] - a[1] + 280 };
    this.streetRect = { x: 2900, y: 1000, w: WORLD.width - 2900, h: WORLD.height - 1000 };
    this.hooks = [
      gs.ground.addBakeHook((ctx, x0, y0, w, h) => this.paintStreets(ctx, x0, y0, w, h), this.streetRect),
      gs.ground.addBakeHook((ctx, x0, y0, w, h) => this.paintRails(ctx, x0, y0, w, h), this.railRect),
    ];
    // the rail / road pictures arrive after the hooks: re-bake once they are here
    this.onArrive = (key) => {
      if (key === 'town_rails' || key === 'roads_decals') gs.ground.invalidate(this.railRect);
      if (PAINT_FILES.indexOf(key) >= 0) gs.ground.invalidate(this.streetRect);
    };
    Assets.arrivals.push(this.onArrive);
    gs.events.once('shutdown', () => this.destroy());
  }

  /** the station was repaired: the drifts on the rails go */
  setDrifts(v) { if (this.drifts === v) return; this.drifts = v; this.gs.ground.invalidate(this.railRect); }

  paintRails(ctx, x0, y0, w, h) {
    if (!RAIL_KEYS.every((k) => Assets.has(k))) return;
    const R = this.R;
    const cross = new Set(R.crossings || []);
    for (let k = R.from; k <= R.to; k++) {
      const [x, y] = L4(k + 0.5, 0);
      if (x < x0 - 180 || x > x0 + w + 180 || y < y0 - 140 || y > y0 + h + 140) continue;
      const key = k === R.from ? 'rail_x_end_n' : k === R.to ? 'rail_x_end_p' : cross.has(k) ? 'rail_x_crossing' : 'rail_x';
      drawAt(ctx, key, x, y);
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
    }
  }

  /** an X or Y street rectangle (lattice) as a polygon path */
  poly(ctx, i0, i1, j0, j1) {
    const p = [L4(i0, j0), L4(i1, j0), L4(i1, j1), L4(i0, j1)];
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    for (let k = 1; k < 4; k++) ctx.lineTo(p[k][0], p[k][1]);
    ctx.closePath();
  }

  pattern(ctx, key) {
    if (!Assets.has(key)) return null;
    const s = Assets.source(key);
    const p = ctx.createPattern(s.img, 'repeat');
    const G = WORLD.v4.G;
    if (p && p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().translate(G[0], G[1]));
    return p;
  }

  paintStreets(ctx, x0, y0, w, h) {
    const V = WORLD.v4;
    const box = (i0, i1, j0, j1) => {
      const xs = [L4(i0, j0)[0], L4(i1, j0)[0], L4(i1, j1)[0], L4(i0, j1)[0]], ys = [L4(i0, j0)[1], L4(i1, j0)[1], L4(i1, j1)[1], L4(i0, j1)[1]];
      return Math.max(...xs) > x0 - 40 && Math.min(...xs) < x0 + w + 40 && Math.max(...ys) > y0 - 40 && Math.min(...ys) < y0 + h + 40;
    };
    // footpaths first (soft trodden snow along the walk lines), then the square, then the dirt tracks
    const OFF = 30000;
    const soft = (lines, lw, color, blur) => {
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.shadowOffsetX = OFF; ctx.shadowOffsetY = 0;
      ctx.strokeStyle = '#000'; ctx.lineWidth = lw;
      ctx.beginPath();
      for (const [a, b] of lines) { ctx.moveTo(a[0] - OFF, a[1]); ctx.lineTo(b[0] - OFF, b[1]); }
      ctx.stroke();
      ctx.restore();
    };
    const paths = [];
    const addLine = (axis, fix, a, b) => {
      const p = axis === 'x' ? [L4(a, fix), L4(b, fix)] : [L4(fix, a), L4(fix, b)];
      if (box(Math.min(axis === 'x' ? a : fix, axis === 'x' ? b : fix) - 0.5, Math.max(axis === 'x' ? a : fix, axis === 'x' ? b : fix) + 0.5, (axis === 'x' ? fix : Math.min(a, b)) - 0.5, (axis === 'x' ? fix : Math.max(a, b)) + 0.5)) paths.push(p);
    };
    for (const s of V.streets) if (s.cls === 'path' && s.walk !== undefined) { const sp = s.walkSpan || (s.axis === 'x' ? s.i : s.j); addLine(s.axis, s.walk, sp[0], sp[1]); }
    for (const w2 of V.walkExtra || []) addLine(w2[0], w2[1], w2[2], w2[3]);
    if (paths.length) {
      soft(paths, 62, 'rgba(136,160,198,0.30)', 22);
      soft(paths, 26, 'rgba(150,138,130,0.20)', 12);
    }
    // the station square: paving stones under the snow
    for (const s of V.streets) {
      if (s.cls !== 'square' || !box(s.i[0], s.i[1], s.j[0], s.j[1])) continue;
      const pat = this.pattern(ctx, 'sidewalk');
      ctx.save();
      this.poly(ctx, s.i[0], s.i[1], s.j[0], s.j[1]);
      ctx.fillStyle = pat || 'rgba(190,196,206,0.8)';
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(244,247,251,0.75)'; ctx.lineWidth = 9; ctx.stroke();
      ctx.restore();
    }
    // dirt tracks
    for (const s of V.streets) {
      if (s.cls !== 'dirt' || !s.paint) continue;
      const sj = s.paintSpan || s.j;
      const [i0, i1, j0, j1] = s.axis === 'x' ? [s.i[0], s.i[1], s.paint[0], s.paint[1]] : [s.paint[0], s.paint[1], sj[0], sj[1]];
      if (!box(i0, i1, j0, j1)) continue;
      const pat = this.pattern(ctx, s.axis === 'x' ? 'road_dirt' : 'road_dirt_y');
      ctx.save();
      // soft cool shadow around the track, then the track, then a snow lip
      ctx.shadowColor = 'rgba(110,130,170,0.35)'; ctx.shadowBlur = 14;
      this.poly(ctx, i0, i1, j0, j1);
      ctx.fillStyle = pat || 'rgba(170,150,135,0.85)';
      ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowColor = 'rgba(0,0,0,0)';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(236,241,248,0.6)'; ctx.lineWidth = 10; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 4; ctx.stroke();
      ctx.restore();
    }
    // junction squares where a Y track meets an X track
    const xs = V.streets.filter((q) => q.cls === 'dirt' && q.axis === 'x' && q.paint), ys = V.streets.filter((q) => q.cls === 'dirt' && q.axis === 'y' && q.paint);
    const cpat = this.pattern(ctx, 'road_dirt_cross');
    for (const a of xs) for (const b of ys) {
      const bj = b.paintSpan || b.j;
      const i0 = Math.max(a.i[0], b.paint[0]), i1 = Math.min(a.i[1], b.paint[1]);
      const j0 = Math.max(a.paint[0], bj[0]), j1 = Math.min(a.paint[1], bj[1]);
      if (i1 <= i0 || j1 <= j0 || !box(i0, i1, j0, j1)) continue;
      this.poly(ctx, i0, i1, j0, j1);
      ctx.fillStyle = cpat || 'rgba(170,150,135,0.9)';
      ctx.fill();
    }
  }

  destroy() {
    const i = Assets.arrivals.indexOf(this.onArrive);
    if (i >= 0) Assets.arrivals.splice(i, 1);
    if (this.gs.ground) for (const h of this.hooks) this.gs.ground.removeBakeHook(h);
    this.hooks = [];
  }
}
