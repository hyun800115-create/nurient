// The beach ground, baked into the game's ground tiles through a bake hook (docs/v5_v8_plan.md §6.5 view/Sand):
//   1 snow (the game's) · 2 ground_sand on the sand cells, ground_sand_wet on the wet band (both patterns anchored at
//   the lattice origin, clipped to the land so the sea stays the Water.js sea) · 3 the dry ↔ wet kit (manifest.wetKit)
//   · 4 the sand ↔ snow kit (manifest.sandKit: the west edge where the snow thins past the lighthouse, the rail
//   ballast in the north) · 5 decals (towels, shells, ripples, the volleyball court) by what is open · 6 the boardwalk.
// paint(ctx, x0, y0, w, h) draws in world px (Ground.bakeChunk has translated the context). The kit rules are the
// reference implementation's (tools/fx/gen_beach_ground.py kit_compose_preview), cell for cell.

import { art } from './art.js';
import { G, L, sandCell, wetCell, landPoly, PROPS, boardwalkTiles, SANDCELLS } from '../layout.js';

const Q = { '-1,1': 'n', '1,1': 'e', '1,-1': 's', '-1,-1': 'w' };

/** cell -> 'S' (the "other" texture of a kit) or 'A' (sand): the snow kit sees the sea as sand (no pieces there) */
const snowCell = (i, j) => (sandCell(i, j) || j < -18 ? 'A' : 'S');
const wetKitCell = (i, j) => (j <= -19 ? 'S' : 'A');

/** the kit pieces (name, x, y) for one kit over the lattice range — exactly kit_compose_preview's rules */
export function kitPieces(prefix, cell, i0, i1, j0, j1) {
  const owned = new Set(), out = [];
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const q = [[-1, 1, cell(i - 1, j)], [1, 1, cell(i, j)], [1, -1, cell(i, j - 1)], [-1, -1, cell(i - 1, j - 1)]];
      const snow = q.filter((x) => x[2] === 'S');
      let name = null, qx = 0, qy = 0;
      if (snow.length === 1) { [qx, qy] = snow[0]; name = prefix + '_corner_' + Q[qx + ',' + qy]; }
      else if (snow.length === 3) { const s = q.find((x) => x[2] !== 'S'); [qx, qy] = s; name = prefix + '_inner_' + Q[qx + ',' + qy]; }
      if (!name) continue;
      const [x, y] = L(i, j);
      out.push([name, x, y]);
      owned.add('x' + (qx > 0 ? i : i - 1) + ',' + j);
      owned.add('y' + i + ',' + (qy > 0 ? j : j - 1));
    }
  }
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      let a = cell(i, j - 1), b = cell(i, j);
      if (a !== b && !owned.has('x' + i + ',' + j)) {
        const nm = b === 'S' ? prefix + '_edge_x' : prefix + '_edge_x_near', v = (((i * 7 + j * 13) % 3) + 3) % 3;
        const [x, y] = L(i, j);
        out.push([v ? nm + '_' + v : nm, x + 32, y + 16]);
      }
      a = cell(i - 1, j); b = cell(i, j);
      if (a !== b && !owned.has('y' + i + ',' + j)) {
        const nm = a === 'S' ? prefix + '_edge_y' : prefix + '_edge_y_near', v = (((i * 7 + j * 13) % 3) + 3) % 3;
        const [x, y] = L(i, j);
        out.push([v ? nm + '_' + v : nm, x + 32, y - 16]);
      }
    }
  }
  return out;
}

export class Sand {
  /** ok(need) -> bool (the model's gates); extra: fn(ctx, x0, y0, w, h) painted last (the lab's street) */
  constructor(scene, ok) {
    this.scene = scene;
    this.ok = ok;
    this.pats = {};
    this.land = landPoly();
    this.sig = '';
    // the kits never change: computed once
    const i0 = SANDCELLS.westRamp[0] - 2, i1 = SANDCELLS.i1 + 1, j0 = SANDCELLS.j0 - 1, j1 = SANDCELLS.j1 + 1;
    this.snowKit = kitPieces('ground_sand_snow', snowCell, i0, i1, j0, j1);
    this.wetKit = kitPieces('ground_sand_wet', wetKitCell, i0, i1, j0, j1);
    const [ax, ay] = L(SANDCELLS.westRamp[0] - 2, SANDCELLS.j1 + 2), [bx, by] = L(SANDCELLS.i1 + 2, SANDCELLS.j0 - 2);
    const [cx] = L(SANDCELLS.westRamp[0] - 2, SANDCELLS.j0 - 2), [, dy] = L(SANDCELLS.i1 + 2, SANDCELLS.j1 + 2);
    this.rect = { x: Math.min(ax, cx) - 140, y: Math.min(ay, dy) - 140, w: Math.max(bx, cx) - Math.min(ax, cx) + 280, h: Math.max(by, dy) - Math.min(ay, dy) + 280 };
  }

  /** what is open changes the decals (towels, the court): a new signature means the tiles must be re-baked */
  signature() { return PROPS.filter((p) => p.layer === 'decal').map((p) => (this.ok(p.need) ? 1 : 0)).join('') + (this.ok('cleanup') ? 'b' : ''); }

  pattern(ctx, key) {
    const k = key + (ctx.canvas ? ':' + (ctx.canvas.width || 0) : '');
    if (this.pats[key] && this.pats[key].ctx === ctx) return this.pats[key].p;
    const tex = this.scene.textures.exists(key) ? this.scene.textures.get(key) : null;
    if (!tex) return null;
    const p = ctx.createPattern(tex.getSourceImage(), 'repeat');
    if (p && p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().translateSelf(G[0], G[1]));
    this.pats[key] = { ctx, p };
    void k;
    return p;
  }

  drawPiece(ctx, key, x, y, alpha = 1) {
    const f = art.frameSource(key);
    if (!f) return;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(f.img, f.sx, f.sy, f.sw, f.sh, Math.round(x + f.ox), Math.round(y + f.oy), f.sw, f.sh);
    if (alpha !== 1) ctx.globalAlpha = 1;
  }

  /** the bake hook */
  paint(ctx, x0, y0, w, h) {
    const r = this.rect;
    if (x0 > r.x + r.w || x0 + w < r.x || y0 > r.y + r.h || y0 + h < r.y) return;
    const sand = this.pattern(ctx, 'ground_sand'), wet = this.pattern(ctx, 'ground_sand_wet');
    if (!sand) return;
    const near = (x, y, m = 140) => x > x0 - m && x < x0 + w + m && y > y0 - m && y < y0 + h + m;
    ctx.save();
    // clip to the land (the sea is Water.js under the ground)
    const lp = this.land;
    ctx.beginPath(); ctx.moveTo(lp[0], lp[1]); for (let k = 2; k < lp.length; k += 2) ctx.lineTo(lp[k], lp[k + 1]); ctx.closePath();
    ctx.clip();
    // sand and wet cells (one path each)
    const cells = (test) => {
      ctx.beginPath();
      for (let cj = SANDCELLS.j0; cj < SANDCELLS.j1; cj++) {
        for (let ci = SANDCELLS.westRamp[0] - 1; ci < SANDCELLS.i1; ci++) {
          if (!test(ci, cj)) continue;
          const a = L(ci, cj), b = L(ci + 1, cj), c = L(ci + 1, cj + 1), d = L(ci, cj + 1);
          if (!near((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 120)) continue;
          ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
        }
      }
    };
    ctx.fillStyle = sand; cells((ci, cj) => sandCell(ci, cj) || (cj < -18 && ci >= SANDCELLS.westRamp[0])); ctx.fill();
    if (wet) { ctx.fillStyle = wet; cells((ci, cj) => wetCell(ci, cj) || (cj < -19 && ci >= SANDCELLS.westRamp[0])); ctx.fill(); }
    for (const [n, x, y] of this.wetKit) if (near(x, y)) this.drawPiece(ctx, n, x, y);
    ctx.restore();
    for (const [n, x, y] of this.snowKit) if (near(x, y)) this.drawPiece(ctx, n, x, y);
    // decals by what is open, then the boardwalk
    for (const p of PROPS) {
      if (p.layer !== 'decal' || !this.ok(p.need)) continue;
      const [x, y] = L(p.i, p.j);
      if (near(x, y, 300)) this.drawPiece(ctx, p.key, x, y);
    }
    if (this.ok('cleanup')) for (const t of boardwalkTiles()) { const [x, y] = L(t.i, t.j); if (near(x, y, 160)) this.drawPiece(ctx, t.key, x, y); }
  }
}
