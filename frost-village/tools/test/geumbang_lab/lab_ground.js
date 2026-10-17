// geumbang_lab ground: 1024 px canvas tiles baked near the camera the way the game's Ground bakes them — snow, then
// the real v4 RoadPaint hooks (streets with the 읍 cobble, curbs, sidewalks, rails) + RoadPaint.addV42Streets (the
// depot's dirt lanes, the apron, the footpath), then what the Integration section adds as paint: the bay-1 apron
// (lgx_dock j −27.6 → −29.6, patch G-P3) and the spur's S-jog between ave_s and 중앙로 (i 30–34, j −19.8 … −18),
// and the old village's trodden sled track (G1b). Far tiles are dropped. Nothing here is game code.

import { Assets } from '../../../src/core/Assets.js';
import { RoadPaint } from '../../../src/systems/RoadPaint.js';
import { DEPTH } from '../../../src/systems/DepthSort.js';
import { L4 } from '../../../src/data/world.js';
import { VILLAGE } from './lab_world.js';

const T = 1024, PAD = 2;
/** the paint the module's integration adds (lattice rects) */
export const GB_PAINT = [
  { i: [32.3, 36.3], j: [-29.6, -27.6], key: 'road_dirt' },        // bay 1 apron (G-P3)
  { i: [30, 34], j: [-19.8, -18], key: 'road_dirt' },              // the spur's S-jog onto 중앙로 (G-P3)
];

export class LabGround {
  constructor(scene, rn) {
    this.scene = scene; this.rn = rn;
    this.tiles = new Map(); this.hooks = []; this.maxTiles = 12;
    const gs = {
      ground: { addBakeHook: (fn, rect) => { const h = { fn, rect }; this.hooks.push(h); return h; }, removeBakeHook: (h) => { const i = this.hooks.indexOf(h); if (i >= 0) this.hooks.splice(i, 1); }, invalidate: (r) => this.invalidate(r), dirty: new Set() },
      events: scene.events, textures: scene.textures, time: scene.time, cameras: scene.cameras,
    };
    this.paint = new RoadPaint(gs, rn, { drifts: false, rank: 2 });
    this.paint.addV42Streets();
    this.hooks.push({ fn: (ctx) => this.paintGb(ctx), rect: null });
  }

  invalidate(r) {
    for (const [k, t] of this.tiles) {
      const [tx, ty] = k.split(',').map(Number), x0 = tx * T, y0 = ty * T;
      if (r && (x0 > r.x + r.w || x0 + T < r.x || y0 > r.y + r.h || y0 + T < r.y)) continue;
      t.dirty = true;
    }
  }

  paintGb(ctx) {
    const pat = this.paint.pattern(ctx, 'road_dirt');
    for (const r of GB_PAINT) {
      const c = [L4(r.i[0], r.j[0]), L4(r.i[1], r.j[0]), L4(r.i[1], r.j[1]), L4(r.i[0], r.j[1])];
      ctx.save(); ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (const q of c) ctx.lineTo(q[0], q[1]); ctx.closePath();
      ctx.fillStyle = pat || '#b9a68c'; ctx.globalAlpha = pat ? 1 : 0.7; ctx.fill(); ctx.restore();
    }
    // the village sled track: a trodden snow band between the nodes
    ctx.save();
    ctx.strokeStyle = 'rgba(176, 160, 140, 0.42)'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 46;
    ctx.beginPath();
    for (const [a, b] of VILLAGE.edges) { const p = VILLAGE.nodes[a], q = VILLAGE.nodes[b]; ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(150, 132, 112, 0.35)'; ctx.lineWidth = 6;
    for (const off of [-9, 9]) { ctx.beginPath(); for (const [a, b] of VILLAGE.edges) { const p = VILLAGE.nodes[a], q = VILLAGE.nodes[b]; ctx.moveTo(p[0], p[1] + off * 0.5); ctx.lineTo(q[0], q[1] + off * 0.5); } ctx.stroke(); }
    ctx.restore();
  }

  update(n = 2) {
    const v = this.scene.cameras.main.worldView, m = 300;
    const want = [];
    for (let ty = Math.floor((v.y - m) / T); ty <= Math.floor((v.bottom + m) / T); ty++) for (let tx = Math.floor((v.x - m) / T); tx <= Math.floor((v.right + m) / T); tx++) want.push([tx, ty]);
    const cx = v.centerX, cy = v.centerY;
    want.sort((a, b) => Math.hypot((a[0] + 0.5) * T - cx, (a[1] + 0.5) * T - cy) - Math.hypot((b[0] + 0.5) * T - cx, (b[1] + 0.5) * T - cy));
    let done = 0;
    const keep = new Set(want.map((w) => w.join(',')));
    for (const [tx, ty] of want) {
      const t = this.tiles.get(tx + ',' + ty);
      if (t && !t.dirty) continue;
      if (done >= n) break;
      this.bake(tx, ty); done++;
    }
    if (this.tiles.size > this.maxTiles) for (const [k, t] of this.tiles) if (!keep.has(k)) { t.img.destroy(); this.scene.textures.remove(t.key); this.tiles.delete(k); }
    return done;
  }
  bakeAll() { let g = 40; while (g-- > 0 && this.update(4)) { /* */ } }

  bake(tx, ty) {
    const sc = this.scene, k = tx + ',' + ty, key = 'gblab_ground_' + tx + '_' + ty;
    let t = this.tiles.get(k);
    const c = t ? sc.textures.get(key) : sc.textures.createCanvas(key, T + 2 * PAD, T + 2 * PAD);
    const ctx = c.getContext(), x0 = tx * T, y0 = ty * T;
    ctx.save();
    ctx.clearRect(0, 0, T + 2 * PAD, T + 2 * PAD);
    ctx.translate(-x0 + PAD, -y0 + PAD);
    const snow = Assets.has('ground_snow') ? Assets.source('ground_snow').img : null;
    if (snow) { const p = ctx.createPattern(snow, 'repeat'); if (p.setTransform) p.setTransform(new DOMMatrix().scale(0.6)); ctx.fillStyle = p; } else ctx.fillStyle = '#eef3f9';
    ctx.fillRect(x0 - PAD, y0 - PAD, T + 2 * PAD, T + 2 * PAD);
    for (const h of this.hooks) {
      const r = h.rect;
      if (r && (x0 > r.x + r.w || x0 + T < r.x || y0 > r.y + r.h || y0 + T < r.y)) continue;
      ctx.save(); try { h.fn(ctx, x0, y0, T, T); } catch (e) { console.error('hook', e); } ctx.restore();
    }
    ctx.restore();
    c.refresh();
    if (!t) { const img = sc.add.image(x0 - PAD, y0 - PAD, key).setOrigin(0, 0).setDepth(DEPTH.GROUND); t = { img, key }; this.tiles.set(k, t); }
    t.dirty = false;
  }

  destroy() { for (const t of this.tiles.values()) { t.img.destroy(); this.scene.textures.remove(t.key); } this.tiles.clear(); }
}
