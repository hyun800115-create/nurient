// logistics_lab stand-in world: the ground baked the way the game's Ground bakes it (1024 px canvas tiles: snow, then
// the bake hooks — the real v4 RoadPaint for the streets, with the new-town streets added the way patch P19 adds them),
// pines and snow around the new town, cityfolk paper-doll rigs (ports.dolls) and the chief. Nothing here is game
// code and nothing here changes a file: WORLD.v4 is mutated in this page's memory only.

import { Assets } from '../../../src/core/Assets.js';
import { DEPTH } from '../../../src/systems/DepthSort.js';
import { RoadNet } from '../../../src/systems/RoadNet.js';
import { RoadPaint } from '../../../src/systems/RoadPaint.js';
import { WORLD } from '../../../src/data/world.js';
import { STREETS, STREETS_EUP, L, layoutFor } from '../../../src/city/logistics/layout.js';
import { Cityfolk, CityfolkSprite } from '../../cityfolk_compose.js';
import { mulberry32 } from '../../townfolk_compose.js';

const T = 1024, PAD = 2;

/** P19 in memory: the new-town streets (+ their 도시 asphalt) */
export function extendWorld() {
  const V = WORLD.v4;
  for (const s of STREETS) if (!V.streets.some((q) => q.id === s.id)) V.streets.push(Object.assign({}, s));
  V.eup = V.eup || {};
  for (const k of Object.keys(STREETS_EUP)) V.eup[k] = STREETS_EUP[k];
  const rn = new RoadNet(V);
  for (const s of STREETS) { try { rn.upgrade(s.id, 'asphalt'); } catch (e) { /* */ } }
  return rn;
}

/**
 * the v6 south sea east of the new town (i > 55, j < -12; plan §4.1) as a flat paint in the stand-in ground — the lab
 * has no Water shader; it is here so the dock lane's place on the quay land reads right. Quay wall in stone.
 */
export function seaHook() {
  const P = [L(55, -12), L(110, -12), L(110, -70), L(55, -70)];
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  const rect = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  const fn = (ctx) => {
    ctx.beginPath(); P.forEach((p, k) => (k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    const g = ctx.createLinearGradient(rect.x, rect.y, rect.x + 600, rect.y + 900);
    g.addColorStop(0, '#5f9fbf'); g.addColorStop(1, '#4c8db0');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 14; ctx.strokeStyle = '#a7aeb5';
    ctx.beginPath(); ctx.moveTo(...L(55, -70)); ctx.lineTo(...L(55, -12)); ctx.lineTo(...L(110, -12)); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.moveTo(L(55, -70)[0] + 9, L(55, -70)[1] + 5); ctx.lineTo(L(55, -12)[0] + 9, L(55, -12)[1] + 5); ctx.stroke();
  };
  return { fn, rect };
}

export class LabGround {
  constructor(scene, rn) {
    this.scene = scene;
    this.tiles = new Map();
    this.hooks = [];
    this.maxTiles = 14;
    const gs = {
      ground: { addBakeHook: (fn, rect) => this.addBakeHook(fn, rect), removeBakeHook: (h) => this.removeBakeHook(h), invalidate: (r) => this.invalidate(r), dirty: new Set() },
      events: scene.events, textures: scene.textures, time: scene.time, cameras: scene.cameras,
    };
    this.paint = new RoadPaint(gs, rn, { drifts: false, rank: 3 });
    const sea = seaHook();
    this.addBakeHook(sea.fn, sea.rect);
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

/** pines and snow around the new town (behind the centre, south of the street); positions follow the placement */
export function scenery(scene) {
  const out = [];
  const D = layoutFor(), dW = D.W - 46.2, dF = D.F + 33.8;
  const put = (k, i0, j0, s = 1, flip = false) => {
    const i = i0 + dW, j = j0 + dF;
    if (!Assets.has(k) || (i > 54.4 && j < -12)) return;                 // never in the south sea
    const [x, y] = L(i, j); const im = Assets.image(scene, Math.round(x), Math.round(y), k).setDepth(y).setScale(s); if (flip) im.setFlipX(true); out.push(im);
  };
  const pines = [[45.0, -26.4], [47.6, -25.6], [50.2, -26.2], [52.8, -25.4], [55.4, -26.0], [57.6, -25.2], [61.8, -26.8], [63.0, -29.6], [62.6, -32.6], [63.6, -35.0],
    [38.2, -27.5], [41.0, -27.0], [43.2, -28.4], [36.0, -40.6], [39.4, -41.4], [44.0, -41.2], [48.6, -41.8], [53.4, -41.0], [57.0, -41.6], [61.0, -40.4], [64.0, -38.6]];
  // behind the centre (north): a loose row on the snow field (s = i + j, d = i - j)
  for (const [sum, d] of [[9.5, 62.5], [13.5, 65.0], [16.5, 61.5], [20.0, 64.0], [23.5, 61.8], [26.5, 64.6], [7.0, 67.0], [18.0, 68.2], [11.0, 59.6]]) pines.push([(sum + d) / 2, (sum - d) / 2]);
  pines.forEach(([i, j], k) => put(k % 3 === 0 ? 'tree_pine_a' : k % 3 === 1 ? 'tree_pine_snow' : 'tree_pine_b', i, j, 0.82 + (k % 4) * 0.06, k % 2 === 0));
  for (const [i, j, k] of [[44.6, -29.6, 'snow_pile_a'], [45.6, -33.2, 'bush_snow'], [62.0, -31.2, 'snow_pile_b'], [61.6, -34.6, 'bush_snow'], [41.6, -39.4, 'snow_pile_a'], [47.0, -39.6, 'bush_snow'], [52.0, -39.4, 'snow_pile_b'], [58.4, -39.2, 'bush_snow']]) put(k, i, j);
  for (const [i, j] of [[44.0, -35.75], [52.0, -35.75], [57.8, -35.75]]) put('lamp_post', i, j, 0.95);
  // around the producers' M plots (stand-ins near the v4 plot se_m1)
  const putXY = (k, x, y, s = 1, flip = false) => { if (!Assets.has(k)) return; const im = Assets.image(scene, x, y, k).setDepth(y).setScale(s); if (flip) im.setFlipX(true); out.push(im); };
  for (const [k, dx, dy, s] of [['tree_pine_snow', -230, -150, 0.9], ['tree_pine_a', -60, -230, 0.85], ['tree_pine_b', 180, -200, 0.9], ['tree_pine_snow', 420, -90, 0.85], ['tree_pine_a', 520, 120, 0.9], ['bush_snow', -250, 90, 1], ['snow_pile_a', 200, 260, 1], ['tree_pine_b', -330, 260, 0.9], ['lamp_post', 120, 110, 0.95]]) putXY(k, 2700 + dx, 2640 + dy, s, dx > 0);
  return out;
}

// ---------------------------------------------------------------------------------------------------- dolls + chief
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

/** a doll rig with the ports.dolls surface: play / place / visible / update / setLook / destroy (cityfolk rules) */
class DollRig {
  constructor(dolls, person) {
    this.d = dolls;
    this.spr = new CityfolkSprite(dolls.scene, dolls.tf, person, -9999, -9999);
    this.anim = 'idle'; this.dir = 'S'; this.on = true; this.depth = 0; this.alpha = 1;
    dolls.live.add(this);
  }
  setLook(look) { this.spr.person = this.d.person(look); this.spr._key = ''; this.spr.refresh(true); }
  play(anim, dir) { if (anim !== this.anim || dir !== this.dir) { this.spr.play(anim, dir); this.anim = anim; this.dir = dir; } }
  place(x, y, depth, alpha = 1) {
    const s = this.spr;
    s.x = x; s.y = y; this.depth = depth; this.alpha = alpha;
    for (let j = 0; j < s.visibleCount; j++) { const im = s.sprites[j]; im.setPosition(x + im._dx, y + im._dy).setDepth(depth + im._z * 1e-6).setAlpha(alpha).setVisible(this.on); }
  }
  visible(on) { this.on = on; const s = this.spr; for (let j = 0; j < s.sprites.length; j++) s.sprites[j].setVisible(on && j < s.visibleCount); }
  update(dt) { this.spr.update(dt * 1000); if (this.on) this.place(this.spr.x, this.spr.y, this.depth, this.alpha); }
  destroy() { this.spr.destroy(); this.d.live.delete(this); }
}

export class LabDolls {
  constructor(scene, tfMan) {
    this.scene = scene;
    this.tf = new Cityfolk(tfMan.townfolk);
    this.cache = new Map();
    this.live = new Set();
  }
  person(look) {
    const key = typeof look === 'object' && look ? (look.preset || 'any') + ':' + (look.seed || look.sid || 0) : 'n:' + look;
    let p = this.cache.get(key);
    if (p) return p;
    const seed = typeof look === 'object' && look ? (look.seed || hashStr(String(look.sid || 1))) : hashStr(String(look));
    const G = this.tf.T.generator;
    const preset = look && look.preset && G.presets[look.preset] ? look.preset : undefined;
    p = this.tf.generate(mulberry32(seed >>> 0), preset);
    this.cache.set(key, p);
    return p;
  }
  make(look) { return new DollRig(this, this.person(look)); }
  get n() { return this.live.size; }
}

/** the chief (the player character), standing or walking a polyline */
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
    const p = this.path[0], dx = p.x - this.x, dy = p.y - this.y, Lh = Math.hypot(dx, dy * 2), st = 150 * dt;
    if (Lh <= st) { this.set(p.x, p.y); this.path.shift(); } else this.set(this.x + dx * st / Lh, this.y + dy * st / Lh);
    if (Lh > 1) this.dir = dirOf(dx, dy);
    this.pose('walk', this.dir);
  }
}
