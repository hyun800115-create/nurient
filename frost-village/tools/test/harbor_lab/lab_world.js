// harbor_lab stand-in world: the ground baked the way the game's Ground bakes it (1024 px canvas tiles near the
// camera: snow, then the bake hooks — the real v4 RoadPaint for the streets and the rails, extended to k 98 with
// the harbour streets the way patch P19 adds them, then the harbour's own hook), pines and snow around the
// harbour, the coast-line halt, paper-doll rigs (ports.dolls) and the chief. Nothing here is game code and nothing
// here changes a file: WORLD.v4 is mutated in this page's memory only.

import { Assets } from '../../../src/core/Assets.js';
import { DEPTH } from '../../../src/systems/DepthSort.js';
import { RoadNet } from '../../../src/systems/RoadNet.js';
import { RoadPaint } from '../../../src/systems/RoadPaint.js';
import { WORLD } from '../../../src/data/world.js';
import { STREETS, STREETS_EUP, RAIL, L } from '../../../src/harbor/layout.js';
import { Townfolk2, TownfolkSprite2 } from '../../townfolk2_compose.js';
import { mulberry32 } from '../../townfolk_compose.js';

const T = 1024, PAD = 2;

/** P19 in memory: the rail to k 98 with the harbour crossings, the harbour streets (+ their 도시 paving) */
export function extendWorld(rank = 3) {
  const V = WORLD.v4;
  V.rail.to = RAIL.to;
  V.rail.crossings = RAIL.crossings.slice();
  for (const s of STREETS) if (!V.streets.some((q) => q.id === s.id)) V.streets.push(Object.assign({}, s));
  V.eup = V.eup || {};
  V.eup.blvd_h = STREETS_EUP.blvd_h;
  const rn = new RoadNet(V);
  if (rank >= 3) for (const id of ['main', 'back', 'ave', 'blvd_h']) { try { rn.upgrade(id, 'asphalt'); } catch (e) { /* not a street here */ } }
  return rn;
}

export class LabGround {
  constructor(scene, rn) {
    this.scene = scene;
    this.tiles = new Map();
    this.hooks = [];
    this.maxTiles = 12;
    const gs = {
      ground: { addBakeHook: (fn, rect) => this.addBakeHook(fn, rect), removeBakeHook: (h) => this.removeBakeHook(h), invalidate: (r) => this.invalidate(r), dirty: new Set() },
      events: scene.events, textures: scene.textures, time: scene.time, cameras: scene.cameras,
    };
    this.paint = new RoadPaint(gs, rn, { drifts: false, rank: 3 });
  }
  addBakeHook(fn, rect) { const h = { fn, rect }; this.hooks.push(h); this.invalidate(rect); return h; }
  removeBakeHook(h) { const i = this.hooks.indexOf(h); if (i >= 0) { this.hooks.splice(i, 1); this.invalidate(h.rect); } }
  invalidate(r) {
    for (const [k, t] of this.tiles) {
      const [tx, ty] = k.split(',').map(Number);
      const x0 = tx * T, y0 = ty * T;
      if (r && (x0 > r.x + r.w || x0 + T < r.x || y0 > r.y + r.h || y0 + T < r.y)) continue;
      t.dirty = true;
    }
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
    const sc = this.scene, k = tx + ',' + ty, key = 'lab_ground_' + tx + '_' + ty;
    let t = this.tiles.get(k);
    const c = t ? sc.textures.get(key) : sc.textures.createCanvas(key, T + 2 * PAD, T + 2 * PAD);
    const ctx = c.getContext();
    const x0 = tx * T, y0 = ty * T;
    ctx.save();
    ctx.clearRect(0, 0, T + 2 * PAD, T + 2 * PAD);
    ctx.translate(-x0 + PAD, -y0 + PAD);
    const snow = Assets.has('ground_snow') ? Assets.source('ground_snow').img : null;
    if (snow) { const p = ctx.createPattern(snow, 'repeat'); ctx.fillStyle = p; } else ctx.fillStyle = '#eef3f9';
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

/** pines and snow around the harbour (north of the rail, the hill behind the second row, the rocky point) */
export function scenery(scene) {
  const out = [];
  const put = (k, i, j, s = 1, flip = false) => { if (!Assets.has(k)) return; const [x, y] = L(i, j); const im = Assets.image(scene, Math.round(x), Math.round(y), k).setDepth(y).setScale(s); if (flip) im.setFlipX(true); out.push(im); };
  const pines = [[47.5, 3.6], [50.2, 4.4], [53.0, 3.3], [56.4, 4.8], [58.7, 3.4], [66.8, 3.7], [69.4, 4.6], [72.2, 3.3], [75.0, 4.1], [78.3, 3.5], [81.0, 4.4], [84.2, 3.2], [87.0, 4.0],
    [74.0, -1.7], [76.6, -1.9], [79.3, -1.6], [82.1, -2.0], [85.4, -1.7], [88.4, -1.2], [90.6, -3.6], [91.4, -7.0], [92.2, -10.4], [93.8, -13.6], [52.0, -11.5], [51.6, -14.8], [50.4, -18.0], [52.6, -21.4]];
  pines.forEach(([i, j], k) => put(k % 3 === 0 ? 'tree_pine_a' : k % 3 === 1 ? 'tree_pine_snow' : 'tree_pine_b', i, j, 0.85 + (k % 4) * 0.06, k % 2 === 0));
  for (const [i, j, k] of [[73.2, -2.2, 'snow_pile_a'], [77.4, -2.6, 'bush_snow'], [80.4, -2.0, 'snow_pile_b'], [84.0, -2.8, 'bush_snow'], [53.2, -1.6, 'snow_pile_a'], [53.4, 1.6, 'bush_snow'], [60.8, 3.0, 'lamp_post'], [64.0, 3.0, 'lamp_post'], [87.0, -6.6, 'snow_pile_b']]) put(k, i, j);
  return out;
}

// ---------------------------------------------------------------------------------------------------- dolls + chief
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** a doll rig with the ports.dolls surface: play / place / visible / update / setLook / destroy */
class DollRig {
  constructor(dolls, person) {
    this.d = dolls;
    this.spr = new TownfolkSprite2(dolls.scene, dolls.tf, person, -9999, -9999);
    this.anim = 'idle'; this.dir = 'S'; this.on = true; this.depth = 0; this.alpha = 1;
  }
  setLook(look) { this.spr.person = this.d.person(look); this.spr._key = ''; this.spr.refresh(true); }
  play(anim, dir) { if (anim !== this.anim || dir !== this.dir) { this.spr.play(anim, dir); this.anim = anim; this.dir = dir; } }
  place(x, y, depth, alpha = 1) {
    const s = this.spr;
    s.x = x; s.y = y; this.depth = depth; this.alpha = alpha;
    for (let j = 0; j < s.visibleCount; j++) { const im = s.sprites[j]; im.setPosition(x + im._dx, y + im._dy).setDepth(depth + im._z * 1e-6).setAlpha(alpha).setVisible(this.on); }
  }
  visible(on) { this.on = on; const s = this.spr; for (let j = 0; j < s.sprites.length; j++) s.sprites[j].setVisible(on && j < s.visibleCount); if (!on) for (const im of s.sprites) im.setPosition(-9999, -9999); }
  update(dt) { this.spr.update(dt * 1000); if (this.on) this.place(this.spr.x, this.spr.y, this.depth, this.alpha); }
  destroy() { this.spr.destroy(); this.d.n--; }
}

export class LabDolls {
  constructor(scene, tfMan) {
    this.scene = scene;
    this.tf = new Townfolk2(tfMan.townfolk);
    this.cache = new Map();
    this.n = 0;
  }
  person(look) {
    const key = typeof look === 'object' && look ? (look.preset || 'any') + ':' + (look.seed || 0) : 'n:' + look;
    let p = this.cache.get(key);
    if (p) return p;
    const seed = typeof look === 'object' && look ? (look.seed || 1) : hashStr(String(look));
    const G = this.tf.T.generator;
    const preset = look && look.preset && G.presets[look.preset] ? look.preset : undefined;
    p = this.tf.generate(mulberry32(seed >>> 0), preset);
    this.cache.set(key, p);
    if (this.cache.size > 300) this.cache.delete(this.cache.keys().next().value);
    return p;
  }
  make(look) { this.n++; return new DollRig(this, this.person(look)); }
}

/** the chief (the player character): walks a polyline at 150 px / s */
export class LabChief {
  constructor(scene) {
    this.scene = scene;
    const def = Assets.charDef('player');
    this.spr = scene.add.sprite(0, 0, '__WHITE').setOrigin(def.anchor[0], def.anchor[1]);
    this.x = 0; this.y = 0; this.path = null; this.dir = 'S';
    this.pose('idle', 'S');
  }
  pose(anim, dir) {
    const mir = { SW: 'SE', W: 'E', NW: 'NE' }[dir];
    const k = Assets.charAnim('player', anim, mir || dir);
    if (!this.spr.anims.currentAnim || this.spr.anims.currentAnim.key !== k) this.spr.play(k, true);
    this.spr.setFlipX(!!mir);
  }
  set(x, y) { this.x = x; this.y = y; this.spr.setPosition(x, y).setDepth(y); }
  walk(pts) { this.path = pts.map((p) => ({ x: p[0], y: p[1] })); }
  update(dt, dirOf) {
    if (!this.path || !this.path.length) { this.pose('idle', this.dir); return; }
    const p = this.path[0], dx = p.x - this.x, dy = p.y - this.y, L = Math.hypot(dx, dy * 2), st = 150 * dt;
    if (L <= st) { this.set(p.x, p.y); this.path.shift(); } else this.set(this.x + dx * st / L, this.y + dy * st / L);
    if (L > 1) this.dir = dirOf(dx, dy);
    this.pose('walk', this.dir);
  }
}
