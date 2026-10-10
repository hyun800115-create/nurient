// Beach activities (docs/v5_v8_plan.md §6.5 model/activities.js): the SLOTS people use, read from the finished
// manifests' points (towel / lounger / pool lyingPoints + lyingFeetDirs, seatPoints + seatDirs, sandcastle workPoints,
// volleyball playPoints + ballDirs, ice-cream customerPoints, shower standPoints, aquarium viewPoints, hotel
// balconyPoints) placed at the layout's props, plus generated water spots (swim inside the buoys, splash at the
// edge, surf lanes). Capacity is one person per slot; slots on one prop can be exclusive (a lounger is a bed OR a
// seat). Pure: no Phaser; `defs` = sprite defs of assets/beach + assets/beach_bld (manifest JSON).

import { L, PROPS, BUILDINGS, SWIM, SPLASH, SURF, KITES, PHOTO, AISLES, BOARDWALK, waterJ } from '../layout.js';

const OPP = { N: 'S', NE: 'SW', E: 'W', SE: 'NW', S: 'N', SW: 'NE', W: 'E', NW: 'SE' };
/** sunbathe dir (= where the FEET point) for lying spot k of a prop def (the beachfolk rule `sunbatheDirFor`) */
export function feetDir(def, k = 0) {
  if (def.lyingFeetDirs && def.lyingFeetDirs.length) return def.lyingFeetDirs[Math.min(k, def.lyingFeetDirs.length - 1)];
  if (def.lyingDirs && def.lyingDirs.length) return OPP[def.lyingDirs[Math.min(k, def.lyingDirs.length - 1)]];
  return 'SE';
}

/** what each activity plays, where, and for how long (the scripts' table). `water`: an anim in the sea. */
export const ACTS = {
  sunbathe: { slot: 'lie', anim: 'sunbathe', dur: 'sunbathe' },
  sit: { slot: 'sit', anim: 'sit', dur: 'sit' },
  dig: { slot: 'dig', anim: 'dig', dur: 'dig', kid: true },
  volley: { slot: 'ball', anim: 'ball_throw', dur: 'volley', group: 'court' },
  swim: { slot: 'swim', anim: 'swim', dur: 'swim', water: true },
  splash: { slot: 'splash', anim: 'splash_play', dur: 'splash', water: true },
  surf: { slot: 'surf', anim: 'surf', dur: 'surf', water: true, need: 'shop:surf_shop' },
  icecream: { slot: 'queue:cart', anim: 'idle', dur: 'icecream', need: 'shop:icecream_shop' },
  shop: { slot: 'queue:shop', anim: 'idle', dur: 'shop' },
  shower: { slot: 'shower', anim: 'idle', dur: 'shower' },
  watch: { slot: 'view', anim: 'idle', dur: 'watch', need: 'aquarium' },
  kite: { slot: 'kite', anim: 'idle', dur: 'kite' },
  photo: { slot: 'photo', anim: 'wave', dur: 'photo' },
  stroll: { slot: null, anim: 'walk', dur: 'stroll' },
  pool: { slot: 'pool', anim: 'swim', dur: 'swim', water: true, need: 'pool', guest: true },
  poolLie: { slot: 'poolLie', anim: 'sunbathe', dur: 'sunbathe', need: 'pool', guest: true },
};
/** townfolk2 `sit` renders S / SE / E (+ the mirrors SW / W): seats facing NE / NW / N cannot be sat on (they are
 *  dropped; beach_bld terrace seats facing the shop are such seats). The tests read the manifests to prove it. */
export const SIT_DIRS = new Set(['S', 'SE', 'E', 'SW', 'W']);
/** anims that happen in the water (the anchor is the sea surface; a land fallback must never go in) */
export const WATER_ANIMS = new Set(['swim', 'float', 'splash_play', 'surf']);

const px = (i, j) => { const p = L(i, j); return [Math.round(p[0]), Math.round(p[1])]; };

/**
 * build every slot. defs: { key: spriteDef }. Returns a SlotTable.
 * slot: { id, kind, x, y, dir, depth ('front' | 'behind' | 'deck' | null), prop, key, camp, need, excl, ord, gx, gy,
 *         lift (px drawn higher: seats / beds above the ground), anim }
 */
export function buildSlots(defs) {
  const out = [];
  const add = (s) => { s.by = null; out.push(s); return s; };
  for (const p of PROPS) {
    const def = defs[p.key];
    if (!def) continue;
    const [ax, ay] = px(p.i, p.j);
    const base = { prop: p.id, key: p.key, camp: p.camp || null, need: p.need || 'open', py: ay };
    const isDecal = p.layer === 'decal';
    (def.lyingPoints || []).forEach((pt, k) => add(Object.assign({}, base, { id: p.id + ':lie:' + k, kind: 'lie', x: ax + pt[0], y: ay + pt[1], dir: feetDir(def, k),
      depth: isDecal ? null : 'front', excl: p.id, lift: 0, ground: def.lyingFeetPoints ? null : null })));
    (def.seatPoints || []).forEach((pt, k) => {
      if (!SIT_DIRS.has((def.seatDirs || [])[k] || 'SW')) return;
      const dd = def.seatDepths ? def.seatDepths[k] : def.seatDepth || 'front';
      const g = def.seatGroundPoints && def.seatGroundPoints[k];
      add(Object.assign({}, base, { id: p.id + ':sit:' + k, kind: 'sit', x: ax + pt[0], y: ay + pt[1], dir: (def.seatDirs || [])[k] || 'SW', depth: dd, excl: def.lyingPoints ? p.id : p.id + ':' + k, gx: g ? ax + g[0] : ax + pt[0], gy: g ? ay + g[1] : ay + pt[1] + 26 }));
    });
    (def.workPoints || []).forEach((pt, k) => add(Object.assign({}, base, { id: p.id + ':dig:' + k, kind: 'dig', x: ax + pt[0], y: ay + pt[1], dir: (def.workDirs || [])[k] || 'SE', depth: 'behind', castle: p.id })));
    if (p.key === 'bucket_spade') (def.playPoints || []).forEach((pt, k) => add(Object.assign({}, base, { id: p.id + ':dig:' + k, kind: 'dig', x: ax + pt[0], y: ay + pt[1], dir: (def.playDirs || [])[k] || 'SE', depth: 'behind' })));
    if (p.court) (def.playPoints || []).forEach((pt, k) => add(Object.assign({}, base, { id: p.id + ':ball:' + k, kind: 'ball', x: ax + pt[0], y: ay + pt[1], dir: (def.ballDirs || def.playDirs || [])[k] || 'S', side: k < 2 ? 0 : 1, ord: k, group: 'court' })));
    if (p.key === 'icecream_cart') (def.customerPoints || []).forEach((pt, k) => add(Object.assign({}, base, { id: p.id + ':q:' + k, kind: 'queue:cart', x: ax + pt[0], y: ay + pt[1], dir: (def.customerDirs || [])[k] || 'NE', ord: k, group: 'cart' })));
    (def.standPoints || []).forEach((pt, k) => add(Object.assign({}, base, { id: p.id + ':shower:' + k, kind: 'shower', x: ax + pt[0], y: ay + pt[1], dir: (def.standDirs || [])[k] || 'SW' })));
    if (p.key === 'float_raft') (def.playPoints || []).forEach((pt, k) => add(Object.assign({}, base, { id: p.id + ':raft:' + k, kind: 'raft', x: ax + pt[0], y: ay + pt[1], dir: (def.playDirs || [])[k] || 'SW', depth: 'front', lift: Math.round((def.deckM || 0.35) * 55.43) })));
  }
  for (const b of BUILDINGS) {
    const def = defs[b.key];
    if (!def) continue;
    const [ax, ay] = px(b.i, b.j);
    const need = b.shop ? 'shop:' + b.shop : b.need || 'open';
    const base = { prop: b.id, key: b.key, need, py: ay };
    (def.customerPoints || []).forEach((pt, k) => add(Object.assign({}, base, { id: b.id + ':q:' + k, kind: 'queue:shop', x: ax + pt[0], y: ay + pt[1], dir: (def.customerDirs || [])[k] || 'NE', ord: k, group: b.id, shop: b.shop || b.key })));
    (def.seatPoints || []).forEach((pt, k) => SIT_DIRS.has((def.seatDirs || [])[k] || 'SW') && add(Object.assign({}, base, { id: b.id + ':sit:' + k, kind: 'sit', x: ax + pt[0], y: ay + pt[1], dir: (def.seatDirs || [])[k] || 'SW', depth: 'front', excl: b.id + ':' + k, gx: ax + pt[0], gy: ay + pt[1] + 26, terrace: true })));
    (def.viewPoints || []).forEach((pt, k) => add(Object.assign({}, base, { id: b.id + ':view:' + k, kind: 'view', x: ax + pt[0], y: ay + pt[1], dir: (def.viewDirs || [])[k] || 'NE' })));
    (def.showerPoints || []).forEach((pt, k) => add(Object.assign({}, base, { id: b.id + ':shower:' + k, kind: 'shower', x: ax + pt[0], y: ay + pt[1], dir: (def.showerDirs || [])[k] || 'NW' })));
    if (b.key === 'hotel_pool') {
      (def.swimPoints || []).forEach((pt, k) => add(Object.assign({}, base, { id: b.id + ':pool:' + k, kind: 'pool', x: ax + pt[0], y: ay + pt[1], dir: ['SW', 'SE', 'S', 'E', 'SW'][k % 5], depth: 'deck' })));
      (def.lyingPoints || []).forEach((pt, k) => add(Object.assign({}, base, { id: b.id + ':poolLie:' + k, kind: 'poolLie', x: ax + pt[0], y: ay + pt[1], dir: feetDir(def, k), depth: 'deck', excl: b.id + ':l' + k })));
    }
    (def.balconyPoints || []).forEach((pt, k) => add(Object.assign({}, base, { id: b.id + ':balc:' + k, kind: 'balcony', x: ax + pt[0], y: ay + pt[1], dir: (def.balconyDirs || [])[k] || 'SW', depth: 'deck', floor: (def.balconyFloors || [])[k] || 0 })));
  }
  // the sea: swimmers inside the buoys (a jittered grid), splash spots along the edge, surf lanes beyond
  let n = 0;
  for (let i = SWIM.i[0]; i <= SWIM.i[1] + 1e-6; i += SWIM.step[0]) {
    for (let j = SWIM.j[0], r = 0; j <= SWIM.j[1] + 1e-6; j += SWIM.step[1], r++) {
      const ii = i + (r % 2) * SWIM.step[0] * 0.5, jj = Math.min(j, waterJ(ii) - 0.55);
      const [x, y] = px(ii, jj);
      add({ id: 'swim:' + n++, kind: 'swim', x, y, dir: ['SW', 'S', 'SE', 'E', 'SW', 'S'][n % 6], prop: null, need: 'open', i: ii, j: jj });
    }
  }
  n = 0;
  for (let i = SPLASH.i[0]; i <= SPLASH.i[1] + 1e-6; i += SPLASH.step) {
    const jj = Math.min(SPLASH.j[0] + (n % 2) * 0.2, waterJ(i) - 0.22);
    const [x, y] = px(i, jj);
    add({ id: 'splash:' + n++, kind: 'splash', x, y, dir: ['S', 'SE', 'E', 'SW'][n % 4], prop: null, need: 'open', i, j: jj });
  }
  SURF.lanes.forEach(([j, i0, i1], k) => { const [x, y] = px(i0, j); const [x1, y1] = px(i1, j); add({ id: 'surf:' + k, kind: 'surf', x, y, x1, y1, dir: 'SE', prop: null, need: 'shop:surf_shop', lane: k }); });
  KITES.forEach(([i, j], k) => { const [x, y] = px(i, j); add({ id: 'kite:' + k, kind: 'kite', x, y, dir: 'SW', prop: null, need: 'open' }); });
  PHOTO.forEach(([i, j], k) => { const [x, y] = px(i, j); add({ id: 'photo:' + k, kind: 'photo', x, y, dir: 'S', prop: null, need: 'cleanup' }); });
  return new SlotTable(out);
}

/** the slot table: capacity 1 per slot, exclusive groups, queues in order */
export class SlotTable {
  constructor(list) {
    this.list = list;
    this.byId = new Map(list.map((s) => [s.id, s]));
    this.byKind = new Map();
    for (const s of list) { if (!this.byKind.has(s.kind)) this.byKind.set(s.kind, []); this.byKind.get(s.kind).push(s); }
    this.exclBy = new Map();           // excl key -> holder id
  }
  get(id) { return this.byId.get(id); }
  of(kind) { return this.byKind.get(kind) || []; }
  isFree(s) { return !s.by && !(s.excl && this.exclBy.has(s.excl)); }
  /** free slots of a kind that are usable (`ok(need)`), nearest to (x, y) first (stable for equal distance) */
  free(kind, ok, x, y, filter) {
    const out = [];
    for (const s of this.of(kind)) if (this.isFree(s) && (!ok || ok(s.need)) && (!filter || filter(s))) out.push(s);
    if (x !== undefined) out.sort((a, b) => (Math.abs(a.x - x) + 2 * Math.abs(a.y - y)) - (Math.abs(b.x - x) + 2 * Math.abs(b.y - y)) || (a.id < b.id ? -1 : 1));
    return out;
  }
  take(s, who) {
    if (!this.isFree(s)) return false;
    s.by = who;
    if (s.excl) this.exclBy.set(s.excl, who);
    return true;
  }
  release(s, who) {
    if (!s || s.by !== who) return;
    s.by = null;
    if (s.excl && this.exclBy.get(s.excl) === who) this.exclBy.delete(s.excl);
  }
  taken(kind) { let n = 0; for (const s of this.of(kind)) if (s.by) n++; return n; }
  /** the ordered queue slots of a group (cart / a shop) */
  queue(group) { return this.list.filter((s) => s.group === group && (s.kind === 'queue:cart' || s.kind === 'queue:shop')).sort((a, b) => a.ord - b.ord); }
  /** invariant: every slot held by at most one, every excl group by at most one holder */
  check() {
    const ex = new Map();
    for (const s of this.list) {
      if (!s.by || !s.excl) continue;
      const h = ex.get(s.excl);
      if (h && h !== s.by) return 'excl ' + s.excl + ' held by ' + h + ' and ' + s.by;
      ex.set(s.excl, s.by);
    }
    return null;
  }
}

// ── walking routes: along the boardwalk / the wet band and down the aisles (so nobody walks through a parasol)
const ROW_TOP = BOARDWALK.j + 0.05, ROW_WET = -18.95;
export function route(from, to) {
  const [fi, fj] = from.ij, [ti, tj] = to.ij;
  if (Math.abs(fi - ti) < 1.2 || (fj < -18.6 && tj < -18.6) || (fj > -13.6 && tj > -13.6)) return [[to.x, to.y]];
  if (fj < -19.0 || tj < -19.0) {
    // in or into the water: wade from / to the edge straight up / down the beach
    return null;
  }
  const near = (i) => AISLES.reduce((b, a) => (Math.abs(a - i) < Math.abs(b - i) ? a : b), AISLES[0]);
  const a1 = near(fi), a2 = near(ti);
  const rowJ = (fj + tj) / 2 < -16.2 ? ROW_WET : ROW_TOP;
  const pts = [[a1, fj], [a1, rowJ], [a2, rowJ], [a2, tj]].map(([i, j]) => px(i, j));
  pts.push([to.x, to.y]);
  // drop repeats (an aisle at the spot itself)
  const out = [];
  for (const p of pts) { const q = out[out.length - 1] || [from.x, from.y]; if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 3) out.push(p); }
  return out;
}
