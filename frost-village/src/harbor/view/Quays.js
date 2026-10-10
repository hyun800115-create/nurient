// The harbour's ground (harbor_runtime view, docs/v5_v8_plan.md §6.4 "quays, piers, breakwater baked"):
//   * one Ground bake hook (ports.ground.bakeHook(fn, rect), v4 Ground.addBakeHook) that, inside the harbour's
//     rectangle, cuts the south sea out of the snow (the living water shows through), paves the quay apron, chains
//     the quay wall tiles (quay_x along the quay, quay_y down the basin's west wall), draws the rocky point under the
//     lighthouse and lays the breakwater tiles — all baked, 0 display objects;
//   * the Water region for the basin and the open sea (palette 'harbor'): the same coast as one land polygon, the
//     breakwater and the slipway, all z0 footprints whose walls show (WATER_PX), per-segment shore types.

import { L, SEA, BREAKWATER, SLIP_RECT, WATER_PX } from '../layout.js';
import { Assets } from '../../core/Assets.js';

/** the harbour ground rect (px): every bake tile meeting it runs the hook */
export const GROUND_RECT = { x: 4200, y: 3300, w: 7200, h: 2200 };
/** the Water region (px): the basin, the mouth and the open sea south of the quay (≈ 280 k fine field cells) */
export const WATER_REGION = { x: 4400, y: 3330, w: 5600, h: 1600 };

const flat = (pts) => { const o = []; for (const p of pts) o.push(p[0], p[1]); return o; };
const P = (i, j) => L(i, j);

/** the coast (z0 land edge), west -> east: the basin's west wall, the quay, the rocky point, the east coast */
export function coastLine() {
  return [P(SEA.westI, -80), P(SEA.westI, SEA.quayJ), P(SEA.rock[0], SEA.quayJ), P(SEA.rock[1], SEA.coastJ), P(150, SEA.coastJ)];
}
/** land polygon (everything north / west of the coast), z0 */
export function landPoly() {
  const c = coastLine(), e = c[c.length - 1], s = c[0];
  return c.concat([[e[0], -800], [s[0], -800]]);
}
/** sea polygon (south / east of the coast), z0 — what the bake cuts out of the snow */
export function seaPoly() {
  const c = coastLine(), e = c[c.length - 1], s = c[0];
  return c.concat([[e[0], 9000], [s[0], 9000]]);
}
export function breakwaterPoly() {
  const b = BREAKWATER, j0 = b.j - b.half, j1 = b.j + b.half;
  return [P(b.i0, j0), P(b.i0, j1), P(b.i1, j1), P(b.i1 + 0.75, b.j), P(b.i1, j0)];
}
export function slipPoly() { const s = SLIP_RECT; return [P(s.i0, s.j0), P(s.i0, s.j1), P(s.i1, s.j1), P(s.i1, s.j0)]; }
/** the rocky point under the lighthouse (z0 footprint strip along the coast, for the shore type) */
function rockPoly() { return [P(SEA.rock[0] - 0.2, SEA.quayJ + 0.4), P(SEA.rock[0] - 0.2, SEA.quayJ - 2), P(SEA.rock[1] + 0.4, SEA.coastJ - 2), P(SEA.rock[1] + 30, SEA.coastJ - 2), P(SEA.rock[1] + 30, SEA.coastJ + 0.6)]; }
const shifted = (poly, d) => poly.map((p) => [p[0], p[1] + d]);

/** Water options for the harbour region (ports.water.region(opts) / new Water(scene, opts)) */
export function waterOpts(extra = {}) {
  return Object.assign({
    region: WATER_REGION,
    waterPx: WATER_PX,
    // one wall convention (docs/build_reports/water.md §6.6): z0 footprints, quay / breakwater / rock walls show
    mask: { land: [flat(landPoly()), flat(breakwaterPoly()), flat(slipPoly())] },
    shoreTypes: [
      { type: 'breakwater', poly: flat(shifted(breakwaterPoly(), WATER_PX)) },
      { type: 'rock', poly: flat(shifted(rockPoly(), WATER_PX)) },
    ],
    defaultShore: 'quay',
    palette: 'harbor',
    swellDir: [0.55, -0.83],            // the swell rolls in from the open sea toward the quay (G space)
  }, extra);
}

// ------------------------------------------------------------------------------------------------ the bake
/** draw an atlas picture with its anchor at (x, y) (trimmed frames where the untrimmed frame would be) */
function drawAt(ctx, key, x, y, alpha = 1) {
  if (!Assets.has(key)) return false;
  const s = Assets.source(key);
  if (s.ph) return false;
  const f = s.frame, a = s.anchor || [0.5, 0.5];
  const rw = f.realWidth || f.cutWidth, rh = f.realHeight || f.cutHeight;
  const ox = Math.round(x - a[0] * rw + (f.x || 0)), oy = Math.round(y - a[1] * rh + (f.y || 0));
  ctx.globalAlpha = alpha;
  ctx.drawImage(s.img, f.cutX, f.cutY, f.cutWidth, f.cutHeight, ox, oy, f.cutWidth, f.cutHeight);
  ctx.globalAlpha = 1;
  return true;
}
function path(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]); ctx.closePath(); }
/** tiny seeded noise for the boulders (the bake is the same every time) */
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class Quays {
  /** opts: { steps: () => Set of revived steps (the breakwater lamp), want(keys) } */
  constructor(opts = {}) {
    this.opts = opts;
    this.tiles = this.layout();
  }

  /** every baked tile: [key, x, y] (anchors at the quay edge line / breakwater axis) */
  layout() {
    const t = [];
    // west wall first (quay_y, sea on +X), then the quay (quay_x, sea on -Y) over it at the inner corner
    for (let j = SEA.quayJ - 0.5; j > -46; j -= 1) t.push(['quay_y', ...P(SEA.westI, j)]);
    for (let i = SEA.westI + 0.5; i < SEA.rock[0]; i += 1) t.push(['quay_x', ...P(i, SEA.quayJ)]);
    return t;
  }

  /**
   * the breakwater along world X (the east end is the round head with the green harbour light). Not baked: a ship
   * sailing the inner lane behind it must pass BEHIND its tetrapods, so its tiles are sprites at one depth that the
   * fleet orders against the ships (Fleet.update, frontOf)
   */
  breakwaterTiles() {
    const t = [], B = BREAKWATER;
    for (let i = B.i0 + 0.5; i < B.i1 - 0.5; i += 1) t.push(['breakwater_x', ...P(i, B.j)]);
    t.push(['breakwater_end_xp', ...P(B.i1 - 0.5, B.j)]);
    return t;
  }

  /** the Ground bake hook: (ctx, x0, y0, w, h) in world px */
  paint(ctx, x0, y0, w, h) {
    const inTile = (x, y, m) => x > x0 - m && x < x0 + w + m && y > y0 - m && y < y0 + h + m;
    ctx.save();
    // 1. the sea: cut out of the snow (the Water body underneath shows through)
    ctx.globalCompositeOperation = 'destination-out';
    path(ctx, seaPoly()); ctx.fillStyle = '#000'; ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // 2. the quay apron: big cobbles from the quay edge back to the quay lane (j -12 .. -8.75)
    const apron = [P(SEA.westI - 1.4, -8.75), P(SEA.rock[0] + 0.4, -8.75), P(SEA.rock[0] + 0.4, SEA.quayJ), P(SEA.westI, SEA.quayJ), P(SEA.westI, -16), P(SEA.westI - 1.4, -16)];
    const pat = this.pattern(ctx, 'road_cobble_wide');
    path(ctx, apron);
    ctx.fillStyle = pat || '#c9d0d8';
    ctx.fill();
    // a soft snowy seam where the apron meets the quay lane / the snow
    ctx.save(); path(ctx, apron); ctx.clip();
    ctx.lineWidth = 26; ctx.strokeStyle = 'rgba(236,242,250,0.55)';
    ctx.beginPath(); ctx.moveTo(...P(SEA.westI - 1.4, -8.75)); ctx.lineTo(...P(SEA.rock[0] + 0.4, -8.75)); ctx.stroke();
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(236,242,250,0.65)';
    ctx.beginPath(); ctx.moveTo(...P(SEA.westI - 1.4, -16)); ctx.lineTo(...P(SEA.westI - 1.4, -8.75)); ctx.stroke();
    ctx.restore();
    // 3. the rocky point and the east coast: a dark wet rock face down to the water + snowy boulders on the edge
    this.rocks(ctx, x0, y0, w, h);
    // 4. tiles (quay walls, breakwater)
    for (const [key, x, y] of this.tiles) if (inTile(x, y, 220)) drawAt(ctx, key, x, y);
    ctx.restore();
  }

  pattern(ctx, key) {
    if (!Assets.has(key)) { if (this.opts.want) this.opts.want([key]); return null; }
    const s = Assets.source(key);
    if (s.ph) return null;
    const p = ctx.createPattern(s.img, 'repeat');
    if (p && p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().translate(3120, 1315));
    return p;
  }

  rocks(ctx, x0, y0, w, h) {
    const c = [P(SEA.rock[0] - 0.05, SEA.quayJ), P(SEA.rock[1], SEA.coastJ), P(150, SEA.coastJ)];
    if (c[0][0] > x0 + w + 200 || c[2][0] < x0 - 200) return;
    // the face: the edge line and the same line WATER_PX lower
    const face = c.concat(c.slice().reverse().map((p) => [p[0], p[1] + WATER_PX + 4]));
    path(ctx, face);
    const g = ctx.createLinearGradient(0, c[0][1], 0, c[0][1] + 40);
    g.addColorStop(0, '#7d8ea3'); g.addColorStop(1, '#4b5d75');
    ctx.fillStyle = g; ctx.fill();
    // boulders along the edge (seeded), snow caps on top
    const r = rng(8812);
    for (let s = 0; s < 1; s += 0.012) {
      const a = r(), b = r(), d = r();
      const seg = s < 0.3 ? 0 : 1, u = seg === 0 ? s / 0.3 : (s - 0.3) / 0.7;
      const p0 = c[seg], p1 = c[seg + 1];
      const x = p0[0] + (p1[0] - p0[0]) * u + (a - 0.5) * 14, y = p0[1] + (p1[1] - p0[1]) * u + 6 + b * (WATER_PX - 6);
      if (x < x0 - 60 || x > x0 + w + 60 || y < y0 - 60 || y > y0 + h + 60) continue;
      const rx = 9 + d * 13, ry = rx * 0.62;
      ctx.fillStyle = d < 0.5 ? '#6d7f96' : '#8193a8';
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath(); ctx.ellipse(x - rx * 0.12, y - ry * 0.45, rx * 0.72, ry * 0.42, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(40,52,72,0.25)';
      ctx.beginPath(); ctx.ellipse(x + rx * 0.2, y + ry * 0.55, rx * 0.8, ry * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  /** the hook's world rect */
  rect() { return GROUND_RECT; }
}
