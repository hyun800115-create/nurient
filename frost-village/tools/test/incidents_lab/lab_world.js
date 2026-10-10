// incidents_lab stand-in world: the 솔방울 town as v4 lays it out (WORLD.v4 streets + town buildings, the real
// RoadPaint at 도시 paving), the v5/v8 streets the police car needs (은행길, 중앙로 남쪽, ave_c — patch P19 in this page's
// memory only), village houses on the lots behind the main street, the police station plot (placement A, behind the logistics centre's spot), and a corner
// of the village plaza with the mission board and the wanted board. Ground tiles are baked the way the game's Ground
// bakes them (1024 px canvas tiles near the camera). Nothing here is game code and nothing here changes a file.

import { Assets } from '../../../src/core/Assets.js';
import { DEPTH } from '../../../src/systems/DepthSort.js';
import { RoadNet } from '../../../src/systems/RoadNet.js';
import { RoadPaint } from '../../../src/systems/RoadPaint.js';
import { WORLD, L4, Z } from '../../../src/data/world.js';
import { WANTED_BOARD, POLICE } from '../../../src/city/incidents/layout.js';

const T = 1024, PAD = 2;

/** v5 + v8 streets (vehicles / logistics layouts, plan §4.2 / §4.5) with walk lines; ave_c reaches 은행길's centre */
export const EXTRA_STREETS = [
  { id: 'bank_st', axis: 'x', i: [23.1, 40.9], j: [-24.2, -22.2], cls: 'dirt', paint: [-24.2, -22.2], walk: -22.4, walkSpan: [23.1, 40.9], name: 'st_bank' },
  { id: 'ave_s', axis: 'y', i: [30, 34], j: [-22.2, -18], cls: 'dirt', paint: [30, 34], paintSpan: [-23.2, -18], walk: 30.4, walkSpan: [-22.4, -17.5], name: 'st_ave' },
  { id: 'ave_c', axis: 'y', i: [36, 40], j: [-35.9, -24.2], cls: 'dirt', paint: [36, 40], paintSpan: [-35.9, -23.2], walk: 36.3, walkSpan: [-35.9, -22.4], name: 'st_ave_c' },
];

export function extendWorld() {
  const V = WORLD.v4;
  for (const s of EXTRA_STREETS) if (!V.streets.some((q) => q.id === s.id)) V.streets.push(Object.assign({}, s));
  V.eup = V.eup || {};
  V.eup.bank_st = { road: [-24.2, -22.2] }; V.eup.ave_s = { road: [30, 34] }; V.eup.ave_c = { road: [36, 40] };
  const rn = new RoadNet(V);
  for (const id of ['main', 'back', 'ave', 'bank_st', 'ave_s', 'ave_c']) { try { rn.upgrade(id, 'asphalt'); } catch (e) { /* */ } }
  for (const id of V.eup.sidewalks || []) { try { rn.upgrade(id, 'sidewalk'); } catch (e) { /* */ } }
  return rn;
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
    // the village plaza floor (a stand-in for the game's zone floor)
    const [cx, cy] = [990, 800];
    this.addBakeHook((ctx) => {
      const img = Assets.has('ground_plaza') ? Assets.source('ground_plaza').img : null;
      ctx.save();
      ctx.beginPath();
      const r = 7.4, ax = 45.25, ay = 22.63;
      ctx.moveTo(cx - ax * 2 * r, cy); ctx.lineTo(cx, cy - ay * 2 * r); ctx.lineTo(cx + ax * 2 * r, cy); ctx.lineTo(cx, cy + ay * 2 * r); ctx.closePath();
      ctx.fillStyle = img ? ctx.createPattern(img, 'repeat') : '#d9d3c8';
      ctx.globalAlpha = 0.5; ctx.fill();
      ctx.restore();
    }, { x: cx - 700, y: cy - 360, w: 1400, h: 720 });
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
    ctx.fillStyle = snow ? ctx.createPattern(snow, 'repeat') : '#eef3f9';
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
}

const NAMES = {
  t_cafe: ['카페', 'café'], t_book: ['책방', 'bookshop'], t_toy: ['장난감 가게', 'toy shop'], t_cloth: ['옷가게', 'clothes shop'], t_flower: ['꽃집', 'flower shop'],
  t_hair: ['미용실', 'hair salon'], t_rest: ['식당', 'restaurant'], t_post: ['우체국', 'post office'], t_school: ['학교', 'school'], t_hall: ['마을회관', 'town hall'],
  t_clinic: ['보건소', 'clinic'], t_fire: ['소방서', 'fire station'], lotH1: ['목수네 집', 'house'], lotH2: ['빨간 지붕 집', 'house'], lotH3: ['파란 대문 집', 'house'],
  lotH4: ['노란 집', 'house'], lotH5: ['초록 집', 'house'], vh1: ['통나무 집', 'cottage'], vh2: ['오두막', 'cottage'], vh3: ['작은 집', 'cottage'], t_apt1: ['아파트', 'apartments'], t_apt2: ['아파트', 'apartments'],
};
const UPGRADE = { house_a: 'house_b', house_b: 'house_c', townhouse_a: 'townhouse_c', townhouse_b: 'townhouse_d' };

/** the stand-in buildings: town buildings (WORLD.v4), houses on the H lots, two village cottages, scenery */
export class LabTown {
  constructor(scene) {
    this.scene = scene;
    this.b = new Map();
    const V = WORLD.v4;
    for (const d of V.town.buildings) { if (d.id === 't_gate') continue; this.add(d.id, d.key, d.x, d.y); }
    const homes = ['townhouse_a', 'townhouse_b', 'townhouse_c', 'townhouse_d', 'townhouse_a'];
    ['lotH1', 'lotH2', 'lotH3', 'lotH4', 'lotH5'].forEach((id, k) => { const l = V.lots[id]; this.add(id, homes[k], l.x, l.y); });
    for (const id of ['lotB1', 'lotB2', 'lotB3']) { const l = V.lots[id]; this.add(id, ['hardware_store', 'supermarket', 'carpenter_workshop'][['lotB1', 'lotB2', 'lotB3'].indexOf(id)], l.x, l.y); }
    // two village cottages by the plaza (a cottage rebuilt one level better becomes the next house)
    const [ax, ay] = Z('plaza', 3.2, -10.6), [bx, by] = Z('plaza', 7.6, -7.6);
    this.add('vh1', 'house_a', ax, ay); this.add('vh2', 'house_b', bx, by);
    // the plaza corner: the mission board, lamps, benches
    this.props = [];
    const put = (k, x, y, s = 1) => { if (!Assets.has(k)) return; const im = Assets.image(scene, Math.round(x), Math.round(y), k).setDepth(y).setScale(s); this.props.push(im); return im; };
    const [nx, ny] = Z('plaza', 4.6, -2.6); put('notice_board', nx, ny);
    put('lamp_post', ...Z('plaza', 6.6, -6.6)); put('bench', ...Z('plaza', 3.4, -5.8));
    for (const [k, i, j] of V.town.props) { const [x, y] = L4(i, j); put(k, x, y); }
    // pines and snow around the town edge and the new town
    const pines = [[20, -20.5], [24.8, -20.6], [28.6, -19.8], [42.5, -19.6], [47.6, -20.0], [51.2, -14.8], [52.4, -8.6], [52.0, -2.2], [34.2, -27.4], [33.4, -31.8], [46.4, -23.2], [55.6, -24.0], [42.0, -26.2]];
    pines.forEach(([i, j], k) => { const [x, y] = L4(i, j); const im = put(k % 3 === 0 ? 'tree_pine_a' : k % 3 === 1 ? 'tree_pine_snow' : 'tree_pine_b', x, y, 0.9 + (k % 3) * 0.06); if (im && k % 2) im.setFlipX(true); });
    for (const [k, i, j] of [['snow_pile_a', 50.6, -6.0], ['bush_snow', 33.2, -24.6], ['snow_pile_b', 46.0, -24.8], ['bush_snow', 21.6, -12.4]]) { const [x, y] = L4(i, j); put(k, x, y); }
    for (const [k, x, y] of [['tree_pine_snow', ...Z('plaza', 9.4, -3.0)], ['bush_snow', ...Z('plaza', 8.8, -10.6)]]) put(k, x, y);
    // the cottage lane: a third cottage, pines behind, a snowman, a stump and a log seat out front
    { const [cx, cy] = Z('plaza', -1.6, -10.4); this.add('vh3', 'house_c', cx, cy); }
    for (const [k, i, j, f] of [['tree_pine_snow', 1.2, -6.8, 0], ['tree_pine_a', -2.6, -6.6, 1], ['tree_pine_b', 5.4, -4.6, 0], ['tree_pine_snow', -4.8, -8.6, 1], ['tree_pine_a', 11.2, -6.2, 1],
      ['snowman_1', 0.6, -14.0, 0], ['tree_stump', 6.4, -12.6, 0], ['log_seat', 7.2, -11.2, 0], ['lamp_post', 1.2, -12.4, 0], ['bush_snow', -3.6, -13.0, 0], ['fence_log_x', 4.6, -13.8, 0], ['fence_log_x', -0.6, -13.8, 0]]) {
      const [x, y] = Z('plaza', i, j); const im = put(k, x, y); if (im && f) im.setFlipX(true);
    }
    void WANTED_BOARD; void POLICE;
  }

  add(id, key, x, y) {
    if (!Assets.has(key)) return;
    const img = Assets.image(this.scene, x, y, key).setDepth(y);
    this.b.set(id, { id, key, x, y, img });
  }

  building(id) { const r = this.b.get(String(id).split('#')[0]); return r ? { id: r.id, key: r.key, x: r.x, y: r.y } : null; }
  place(id) {
    if (id === 'plaza') { const [x, y] = Z('plaza', 0, 0); return { x, y }; }
    const r = this.building(id);
    return r ? { x: r.x, y: r.y, key: r.key, id: r.id } : null;
  }
  hide(id, on) { const r = this.b.get(id); if (r) r.img.setVisible(!on); }
  tint(id, c) { const r = this.b.get(id); if (r) { if (c === null || c === undefined) r.img.clearTint(); else r.img.setTint(c); } }
  upgrade(id) { const r = this.b.get(id); const k = r && UPGRADE[r.key]; if (k && Assets.has(k)) { r.key = k; Assets.apply(r.img, k); } return k || null; }
  name(id, lang) { const n = NAMES[id]; return n ? n[lang === 'en' ? 1 : 0] : null; }
  storyPlaces() {
    return { shops: ['t_toy', 't_cloth', 't_flower', 't_hair', 't_rest', 't_cafe', 't_book'], outdoor: ['t_fountain', 't_play', 't_sled'], homes: ['lotH1#1', 'lotH2#1', 'lotH3#1', 'lotH4#1', 'vh1#1', 'vh2#1'], queues: ['t_cafe', 't_rest', 't_flower'] };
  }
}
