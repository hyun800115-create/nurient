// vehicles_lab ground: 1024 px canvas tiles baked near the camera the way the game's Ground bakes them — snow, the
// shoreline, then the v4 RoadPaint hooks (streets, curbs, snow edges, rails: the real painter, unchanged), then the
// asphalt markings of patch P18 (src/vehicles/model/markings.js). Tiles far from the view are dropped; a road
// upgrade re-bakes the tiles it touches (nearest first: the 도시 wipe).

import { Assets } from '../../../src/core/Assets.js';
import { RoadPaint } from '../../../src/systems/RoadPaint.js';
import { DEPTH } from '../../../src/systems/DepthSort.js';
import { WORLD, shoreY } from '../../../src/data/world.js';
import { markings } from '../../../src/vehicles/model/markings.js';
import { PARKING } from '../../../src/vehicles/layout.js';

const T = 1024;
const PAD = 2;          // tiles overlap by 2 px: no seams from linear filtering at the edges

export class LabGround {
  constructor(scene, rn, opts = {}) {
    this.scene = scene;
    this.rn = rn;
    this.tiles = new Map();        // 'tx,ty' -> { img, key }
    this.queue = [];
    this.hooks = [];
    this.marks = [];
    this.maxTiles = opts.maxTiles || 9;
    const gs = {
      ground: { addBakeHook: (fn, rect) => { const h = { fn, rect }; this.hooks.push(h); return h; }, removeBakeHook: (h) => { const i = this.hooks.indexOf(h); if (i >= 0) this.hooks.splice(i, 1); }, invalidate: (r) => this.invalidate(r), dirty: new Set() },
      events: scene.events, textures: scene.textures, time: scene.time, cameras: scene.cameras,
    };
    this.paint = new RoadPaint(gs, rn, { drifts: false, rank: 2 });
    // integration patch P19b: RoadPaint.computeRect() makes a new rect when streets are added, but its bake hook
    // keeps the first one, so a street outside the old box is never painted; keep the hook's rect current
    if (rn && rn.onChange) rn.onChange(() => { if (this.paint.hooks && this.paint.hooks[0]) this.paint.hooks[0].rect = this.paint.streetRect; this.invalidate(this.paint.streetRect); });
    this.refreshMarks();
  }

  /** the asphalt markings (none before 도시) */
  refreshMarks() { this.marks = markings(this.rn, { bays: this.showBays ? PARKING.bays : [] }); }

  invalidate(r) {
    this.refreshMarks();
    for (const [k, t] of this.tiles) {
      const [tx, ty] = k.split(',').map(Number);
      const x0 = tx * T, y0 = ty * T;
      if (r && (x0 > r.x + r.w || x0 + T < r.x || y0 > r.y + r.h || y0 + T < r.y)) continue;
      t.dirty = true;
    }
  }

  /** bake missing / dirty tiles around the camera (at most `n` per call, nearest first) */
  update(n = 2) {
    const v = this.scene.cameras.main.worldView, m = 300;
    const want = [];
    for (let ty = Math.floor((v.y - m) / T); ty <= Math.floor((v.bottom + m) / T); ty++) for (let tx = Math.floor((v.x - m) / T); tx <= Math.floor((v.right + m) / T); tx++) want.push([tx, ty]);
    const cx = v.centerX, cy = v.centerY;
    want.sort((a, b) => Math.hypot((a[0] + 0.5) * T - cx, (a[1] + 0.5) * T - cy) - Math.hypot((b[0] + 0.5) * T - cx, (b[1] + 0.5) * T - cy));
    let done = 0;
    const keep = new Set(want.map((w) => w.join(',')));
    for (const [tx, ty] of want) {
      const k = tx + ',' + ty, t = this.tiles.get(k);
      if (t && !t.dirty) continue;
      if (done >= n) break;
      this.bake(tx, ty);
      done++;
    }
    // drop far tiles
    if (this.tiles.size > this.maxTiles) for (const [k, t] of this.tiles) if (!keep.has(k)) { t.img.destroy(); this.scene.textures.remove(t.key); this.tiles.delete(k); }
    return done;
  }
  /** everything in view baked now (before a capture) */
  bakeAll() { let g = 40; while (g-- > 0 && this.update(4)) { /* */ } }

  bake(tx, ty) {
    const sc = this.scene, k = tx + ',' + ty, key = 'lab_ground_' + tx + '_' + ty;
    let t = this.tiles.get(k);
    let c = t ? sc.textures.get(key) : sc.textures.createCanvas(key, T + 2 * PAD, T + 2 * PAD);
    const ctx = c.getContext();
    const x0 = tx * T, y0 = ty * T;
    ctx.save();
    ctx.clearRect(0, 0, T + 2 * PAD, T + 2 * PAD);
    ctx.translate(-x0 + PAD, -y0 + PAD);
    // snow
    const snow = Assets.has('ground_snow') ? Assets.source('ground_snow').img : null;
    if (snow) { const p = ctx.createPattern(snow, 'repeat'); if (p.setTransform) p.setTransform(new DOMMatrix().scale(0.6)); ctx.fillStyle = p; } else ctx.fillStyle = '#eef3f9';
    ctx.fillRect(x0 - PAD, y0 - PAD, T + 2 * PAD, T + 2 * PAD);
    // the sea above the shoreline (a stand-in for the living water)
    ctx.beginPath();
    ctx.moveTo(x0 - 4, y0 - 4);
    for (let x = x0 - 4; x <= x0 + T + 4; x += 8) ctx.lineTo(x, shoreY(x));
    ctx.lineTo(x0 + T + 4, y0 - 4); ctx.closePath();
    const sea = ctx.createLinearGradient(0, y0, 0, y0 + T);
    sea.addColorStop(0, '#5f9fcb'); sea.addColorStop(1, '#7cc0e2');
    ctx.fillStyle = sea; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 10; ctx.beginPath();
    for (let x = x0 - 4; x <= x0 + T + 4; x += 8) (x === x0 - 4 ? ctx.moveTo(x, shoreY(x) + 2) : ctx.lineTo(x, shoreY(x) + 2));
    ctx.stroke();
    // soft blue shading in the far south-west (depth)
    // the v4 street / rail painter
    for (const h of this.hooks) {
      const r = h.rect;
      if (r && (x0 > r.x + r.w || x0 + T < r.x || y0 > r.y + r.h || y0 + T < r.y)) continue;
      ctx.save(); try { h.fn(ctx, x0, y0, T, T); } catch (e) { console.error('hook', e); } ctx.restore();
    }
    // P18: lane dashes, crosswalks, stall lines
    for (const mk of this.marks) {
      if (mk.x < x0 - 200 || mk.x > x0 + T + 200 || mk.y < y0 - 120 || mk.y > y0 + T + 120) continue;
      piece(ctx, mk.key, mk.x, mk.y, mk.flipX, mk.flipY);
    }
    ctx.restore();
    c.refresh();
    if (!t) { const img = sc.add.image(x0 - PAD, y0 - PAD, key).setOrigin(0, 0).setDepth(DEPTH.GROUND); t = { img, key }; this.tiles.set(k, t); }
    t.dirty = false;
  }

  destroy() { for (const t of this.tiles.values()) { t.img.destroy(); this.scene.textures.remove(t.key); } this.tiles.clear(); }
}

/** a roads-kit piece: untrimmed frame drawn at round(anchor) - anchorPx (RoadPaint's rule), with optional flips */
export function piece(ctx, key, ax, ay, fx, fy) {
  const d = Assets.def(key);
  if (!d || !d.anchorPx || !Assets.has(key)) return false;
  const s = Assets.source(key), f = s.frame;
  ctx.save();
  ctx.translate(Math.round(ax), Math.round(ay));
  if (fx || fy) ctx.scale(fx ? -1 : 1, fy ? -1 : 1);
  ctx.drawImage(s.img, f.cutX, f.cutY, f.cutWidth, f.cutHeight, -d.anchorPx[0], -d.anchorPx[1], f.cutWidth, f.cutHeight);
  ctx.restore();
  return true;
}

export { WORLD };
