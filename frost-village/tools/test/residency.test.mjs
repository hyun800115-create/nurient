// (v4.3 step B, TX-a — docs/redesign_v43/stepB/build_plan.md §3.6, map_tx.md T-1 … T-4) Node only, no browser:
//   node tools/test/residency.test.mjs
// src/core/Residency.js on a stand-in scene (plain objects for the textures, the display list, the camera, the renderer):
// 1 T-1 the line per screen: must − the renderer's render targets (each counted once) − 6 − 18, for the texbudget
//   viewport, a full-HD and a QHD phone; a renderer without pipelines gives the plain line; an on-demand page is let in
//   only while total + what may still come (pages on their way, area pages queued again ≤ 15 s, the ground pool's
//   room to its cap for 12 s after the view moved) + its size stays under the line
// 2 T-3d the live rects: around what shows an area's page (+ 64 px), a stand-in waiting for one counts at its place, the
//   static rect while nothing shows it; the core areas' near / far are the preset's × 0.65
// 3 no area goes while it is near, nor while a camera cut is on its way back (camFocus); a far area goes after its TTL
// 4 T-2 swap order: an area coming back near the line makes every far area go at once, farthest first; a page a near
//   area lists and the pages coming back stay; RoadPaint's bake-only set goes only beyond its NEAR of the streets / rails
// 5 T-4 the shop's earlier stage pages go once nothing shows them (not held: nothing brings them back)
// 6 T-3f an area page counts as an after-title picture once the village runs (Assets.isLazy), not before (boot load)
// 7 the UI guard: a page a UI panel shows stays when its area is far
// 8 「처음부터」 (a scene restart): every shop stage page is an after-title picture (a stage-1 stall after T-4 waits on the
//   stand-in); a rebuild while a core page is held watches Assets.image's stand-ins until the first tick; a station built
//   on the stand-in is dressed (art + work loop) when its page arrives
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis.window || {};
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const near = (a, b, d) => Math.abs(a - b) <= d;

const { Assets } = await import(path.join(ROOT, 'src/core/Assets.js'));
const { Residency } = await import(path.join(ROOT, 'src/core/Residency.js'));
const { Perf } = await import(path.join(ROOT, 'src/core/Perf.js'));
const { RoadPaint } = await import(path.join(ROOT, 'src/systems/RoadPaint.js'));

// ---------------------------------------------------------------------------------------------- the stand-in scene
const MiB = 1048576;
const PAGES = { props_buildings: [1088, 1720], deck43: [756, 1044], bakery43: [1024, 332], market_s1: [508, 280], market_s2: [884, 340], market_s3: [836, 388],
  bld_work: [774, 2032], bld_east: [1440, 752], bld_buildings_2: [1024, 1024], boat_rowboat: [1024, 1024], boat_fishing: [1024, 1024],
  'town_civic@rest': [1024, 1024], 'town_civic@hall': [1024, 544], 'town_shops@a': [1024, 1024], town_park: [512, 512], town_homes: [1024, 1024], town_street: [1024, 1024],
  office_bld: [512, 512], 'office_bld@closed': [1024, 600], civ_bank: [512, 512], veh_cargo_sleigh: [512, 512] };
const SPR = { station_grill: ['props_buildings', 'station_grill'], warehouse: ['bld_work', 'warehouse'], station_toolsmith: ['bld_work', 'station_toolsmith'],
  station_cannery: ['bld_east', 'station_cannery'], shop_general: ['bld_east', 'shop_general'], market_s1_back: ['market_s1', 'market_s1_back'],
  market_s2_back: ['market_s2', 'market_s2_back'], market_s3_back: ['market_s3', 'market_s3_back'], deck43_t1_back: ['deck43', 'deck43_t1_back'] };
Assets.packed = { atlases: {} };
for (const k in PAGES) Assets.m.atlases[k] = { key: k, png: k + '.png', json: k + '.json', bytes: PAGES[k][0] * PAGES[k][1] * 4 };
for (const k in SPR) Assets.m.sprites[k] = { atlas: SPR[k][0], frame: SPR[k][1], anchor: [0.4, 0.6], frameSize: [440, 420] };
Assets.fragOf.props_buildings = 'props';
Assets.fragOf.deck43 = 'deck43';

function obj(key, x, y, opt = {}) {
  const { frame, ...o } = opt;
  return Object.assign({ texture: { key }, frame: { name: frame || '__BASE' }, x, y, displayWidth: 400, displayHeight: 400, originX: 0.5, originY: 0.6, scaleX: 1, scaleY: 1,
    scrollFactorX: 1, scrollFactorY: 1, visible: true, active: true, anims: null,
    setTexture(k) { this.texture = { key: k }; return this; }, setVisible(v) { this.visible = v; return this; } }, o);
}
function rtList(n, w, h) { const a = []; for (let i = 0; i < n; i++) a.push({ width: w, height: h }); return a; }
function scene(opts = {}) {
  const list = {};
  const textures = {
    list,
    exists: (k) => k in list,
    remove: (k) => { delete list[k]; },
    get: (k) => list[k],
    createCanvas: (k, w, h) => { list[k] = { source: [{ width: w, height: h, isCanvas: true }] }; return { refresh() {} }; },
  };
  for (const k of opts.loaded || Object.keys(PAGES)) if (PAGES[k]) list[k] = { source: [{ width: PAGES[k][0], height: PAGES[k][1] }] };
  // (the rest of a busy village: over the soft budget the far areas' TTL is townTtl, not 6x)
  if (opts.filler) list.filler = { source: [{ width: 1024, height: opts.filler * 256 }] };
  const children = { list: opts.objects || [] };
  const ui = { children: { list: opts.ui || [] } };
  const gs = {
    children, lazyImgs: [], camFocus: null, camPan: null, market: { stage: opts.stage || 1 }, civic: opts.civic || null, v4: opts.v4 || null,
    cameras: { main: { zoom: 1.2, width: 720, height: 1558, worldView: { x: 0, y: 0, right: 600, bottom: 1298 } } },
    camTarget: { x: opts.x || 900, y: opts.y || 900 },
    time: { now: 0 },
    events: { once() {}, emit() {} },
    queueLateFiles() { this.queued = (this.queued || 0) + 1; },
  };
  gs.game = { textures, anims: { anims: { each() {} }, exists: () => false, get: () => null, remove() {} },
    scene: { getScenes: () => [gs, ui] }, renderer: opts.renderer === undefined ? null : opts.renderer };
  gs.textures = textures;
  for (const o of children.list) o.scene = gs;
  return gs;
}
/** n region ticks (0.5 s each), the clock moving with them */
function ticks(gs, n) { for (let i = 0; i < n; i++) { gs.time.now += 500; Residency.checkT = 0; Residency.tick(0.5); } }
const at = (gs, x, y) => { gs.camTarget.x = x; gs.camTarget.y = y; };

// ---------------------------------------------------------------------------------------------- 1 T-1 the line
console.log('— T-1 the line per screen');
{
  // Phaser's pipeline manager: its own targets + each pipeline's (some shared): count each object once
  const mk = (cw, ch) => { const shared = rtList(4, cw, ch); const own = rtList(2, cw, ch); const half = rtList(2, cw / 2, ch / 2);
    const pipes = new Map([['MultiPipeline', { renderTargets: [] }], ['UtilityPipeline', { renderTargets: shared.concat(own) }], ['PostFX', { renderTargets: half }]]);
    return { pipelines: { renderTargets: shared, pipelines: { each(fn) { for (const [k, p] of pipes) fn(k, p); } }, postPipelineInstances: [] } }; };
  const cases = [['texbudget 390x844x2 (k 1.1)', 792, 1714], ['full HD 412x915x2.625 (k 1.5)', 1080, 2400], ['QHD 1440 wide (k 2)', 1440, 3200]];
  const lines = [];
  for (const [label, cw, ch] of cases) {
    const gs = scene({ renderer: mk(cw, ch) });
    Residency.attach(gs);
    const rt = Residency.renderTargets(), want = (6 * cw * ch + 2 * (cw / 2) * (ch / 2)) * 4 / MiB;
    ok(near(rt, want, 0.01), label + ': render targets counted once each (' + rt.toFixed(1) + ' MiB)', { rt, want });
    const L = Residency.line();
    ok(near(L, 455 - rt - 24, 0.01), label + ': line = 455 − ' + rt.toFixed(1) + ' − 24 = ' + L.toFixed(1), L);
    lines.push(L);
    ok(Residency.stats().line === +L.toFixed(1) && Residency.stats().rtMiB === +rt.toFixed(1), label + ': stats() reports the line and the render targets');
  }
  ok(lines[0] > lines[1] && lines[1] > lines[2], 'a bigger screen lowers the line', lines.map((x) => +x.toFixed(1)));
  // the systems' own targets (stack bake, water, night overlay): the pipelines hold 17 MiB at the texbudget canvas, the GL
  // probe measures 33.8 — the canvas-sized estimate (8.5 + 5.9 buffers) wins there; at 1080 x 2400 it gives ~67 (measured)
  for (const [label, cw, ch, want] of [['texbudget canvas 720x1558', 720, 1558, 33.8], ['full-HD canvas 1080x2400', 1080, 2400, 67]]) {
    const gs = scene({ renderer: { pipelines: { renderTargets: rtList(4, 720, 1558) } } });
    gs.game.canvas = { width: cw, height: ch };
    Residency.attach(gs);
    ok(near(Residency.renderTargets(), want, 0.5), label + ': render targets ' + Residency.renderTargets().toFixed(1) + ' MiB (GL measured ' + want + ')');
  }
  const gs0 = scene({ renderer: null });
  Residency.attach(gs0);
  ok(Residency.renderTargets() === 0 && Residency.line() === 431, 'no renderer pipelines: render targets 0, line 431');
  // the old refusal line was must − 30 = 425 on every screen
  ok(lines[0] < 425, 'at the texbudget viewport the line is under the old must − 30 (425)', lines[0]);
}

// ---------------------------------------------------------------------------------------------- 1b the line holds for a burst
console.log('— T-1 a burst of on-demand wants cannot overshoot the line');
{
  for (const k of ['soc_a', 'soc_b', 'soc_c']) Assets.m.atlases[k] = { key: k, png: k + '.png', json: k + '.json', bytes: 6 * MiB, onDemand: true, cls: 'social' };
  // line 431 (no renderer); the filler puts the total 9-10 MiB under it: one 6 MiB page fits, a second one on its way
  // (asked for, not loaded yet) leaves no room for a third
  // (only the core's pages, all near the plaza: no far area whose room makeRoom could take)
  const near0 = ['props_buildings', 'deck43', 'bakery43', 'market_s1'];
  const g0 = scene({ loaded: near0 });
  Residency.attach(g0);
  const base = Residency.measure();
  const gs = scene({ loaded: near0, filler: Math.floor(431 - base - 9) });
  Residency.attach(gs);
  ticks(gs, 1);
  const tot = Residency.total;
  const a = Residency.want('soc_a');
  ok(!a && Assets.demanded.has('soc_a'), 'the first page is asked for (total ' + tot.toFixed(1) + ' + 6 <= line ' + Residency.line() + ')');
  const r0 = Residency.refused;
  Residency.want('soc_b');
  ok(Residency.refused === r0 + 1 && !Assets.demanded.has('soc_b'), 'the next one is refused: the first is still on its way (in flight ' + Residency.inflight().toFixed(1) + ' MiB)');
  // ((TX-a verify) a page that failed for good stays in `demanded` (Assets.onLoadError): it is not on its way any more
  Assets.failed.add('soc_a');
  ok(Residency.inflight() === 0, 'a page that failed for good does not count in flight (it would hold the line down for the session)');
  Assets.failed.delete('soc_a');
  Assets.demanded.delete('soc_a');
  ok(Residency.inflight() === 0, 'nothing in flight once it is let go');
  // the ground pool still to fill counts: 10 of 28 one-MiB slots in use leave 18 MiB that the view's tiles may take
  gs.ground = { pool: 28, slots: Array.from({ length: 10 }, () => ({ ct: { width: 512, height: 512 } })) };
  ok(near(Residency.groundRoom(), 18, 0.01) && near(Residency.ahead(), 18, 0.01), 'the ground pool\'s room (18 of 28 slots free = 18 MiB) counts as what may still come');
  const r1 = Residency.refused;
  Residency.want('soc_b');
  ok(Residency.refused === r1 + 1 && !Assets.demanded.has('soc_b'), 'a page that fits only while the ground pool is half empty is refused (the view\'s tiles would put it over the line)');
  gs.ground.slots.length = 28;
  ok(Residency.groundRoom() === 0, 'a full pool has no room left');
  Residency.want('soc_b');
  ok(Assets.demanded.has('soc_b'), 'with the pool full (its MiB already in the total) the page fits again');
  Assets.demanded.delete('soc_b');
  // an area page queued again (an area coming near) is on its way until it arrives, at most 15 s
  Assets.m.atlases.area_x = { key: 'area_x', png: 'x.png', json: 'x.json', bytes: 7 * MiB };
  Residency.coming.set('area_x', gs.time.now);
  ok(near(Residency.inflight(), 7, 0.01), 'an area page queued again counts in flight (7 MiB)');
  gs.time.now += 16000;
  ok(Residency.inflight() === 0 && !Residency.coming.has('area_x'), 'after 15 s it no longer does (a dropped load must not hold the line down)');
  gs.ground.slots.length = 10;
  ok(Residency.groundRoom() === 0, 'a view standing still for 12 s has the tiles it needs: no ground room counted (no phantom refusals)');
  at(gs, 3420, 1640);
  ticks(gs, 1);
  ok(near(Residency.groundRoom(), 18, 0.01), 'the view moved (to the station): the pool\'s room counts again');
  delete gs.ground;
}

// ---------------------------------------------------------------------------------------------- 2 live rects, near / far
console.log('— T-3d live rects, T-3e the core areas\' near / far');
{
  const R = (id) => ({ core: { k: 0.65 }, work: { k: 0.65 }, eastside: { k: 0.65 }, village: {} })[id];
  ok(Residency.nearPx(R('core')) === Perf.p.near * 0.65 && Residency.farPx(R('core')) === Perf.p.far * 0.65, 'core near / far = preset × 0.65 (' + Perf.p.near * 0.65 + ' / ' + Perf.p.far * 0.65 + ')');
  ok(Residency.nearPx(R('village')) === Perf.p.near && Residency.farPx(R('village')) === Perf.p.far, 'other areas keep the preset\'s near / far');
  // the a3.1 layout: toolsmith on e_m1 (2040, 1190), warehouse on e_m2 (2520, 985): bld_work's rect is around them
  const tool = obj('bld_work', 2040, 1190), wh = obj('bld_work', 2520, 985);
  const gs = scene({ objects: [tool, wh, obj('props_buildings', 600, 640)] });
  Residency.attach(gs);
  ticks(gs, 1);
  const w = Residency.live.work;
  ok(w && near(w[0], 2040 - 200 - 64, 1) && near(w[2], 2520 + 200 + 64, 1) && near(w[1], 985 - 240 - 64, 1) && near(w[3], 1190 + 160 + 64, 1), 'work rect = the box around the warehouse and the toolsmith + 64', w);
  ok(!Residency.live.eastside, 'eastside: nothing shows bld_east -> no live rect (the static one is used)', Residency.live);
  ok(Residency.rectOf({ id: 'eastside', live: true, rect: [1, 2, 3, 4] })[0] === 1, 'rectOf falls back to the static rect');
  // a stand-in waiting for the cannery (lazyImgs) counts at its place
  const standIn = obj('fv_blank', 1360, 2860, { displayWidth: 2, displayHeight: 2 });
  standIn.scene = gs;
  gs.children.list.push(standIn);
  gs.lazyImgs.push({ img: standIn, key: 'station_cannery' });
  Residency.liveT = 0;
  ticks(gs, 1);
  const e = Residency.live.eastside;
  ok(e && near(e[0], 1360 - 176 - 64, 1) && near(e[3], 2860 + 168 + 64, 1), 'a stand-in waiting for bld_east counts (frameSize × anchor) at its place', e);
  // a UI-scene picture (scrollFactor 0) does not move the rect
  gs.children.list.push(obj('bld_work', 50, 50, { scrollFactorX: 0, scrollFactorY: 0 }));
  Residency.liveT = 0;
  ticks(gs, 1);
  ok(Residency.live.work[0] > 1700, 'a picture that does not scroll with the world is not a user', Residency.live.work);
}

{
  // the hall's page is town art too: the town's own hall (inside the town area) does not stretch the core to the town; a
  // village hall on an old west plot (outside every other area listing the page) does stretch it there
  const gs = scene({ objects: [obj('props_buildings', 600, 640), obj('town_civic@hall', 5000, 1500)], civic: { hall: {}, amenities: [] } });
  Residency.attach(gs);
  ticks(gs, 1);
  ok(Residency.live.core[2] < 1000, 'the town\'s hall (in the town area) does not stretch the core\'s rect', Residency.live.core);
  gs.children.list.push(Object.assign(obj('town_civic@hall', -780, 1880), { scene: gs }));
  Residency.liveT = 0;
  ticks(gs, 1);
  ok(Residency.live.core[0] < -900 && Residency.live.core[2] < 1000, 'a village hall on the old west plot does', Residency.live.core);
}

// ---------------------------------------------------------------------------------------------- 3 near / camFocus / TTL
console.log('— no area goes while near or under camFocus; a far one after its TTL');
{
  const objs = [obj('props_buildings', 600, 640, { frame: 'chief_lodge' }), obj('deck43', 1100, 420), obj('bld_work', 60, 1530), obj('bld_work', 475, 1525), obj('bld_east', 1890, 485), obj('bld_east', 1740, 1030), obj('market_s1', 1150, 950)];
  const gs = scene({ objects: objs, x: 1000, y: 900, filler: 300 });
  Residency.attach(gs);
  ticks(gs, 60);
  const tex = gs.game.textures;
  ok(['props_buildings', 'deck43', 'bakery43', 'market_s1', 'bld_work', 'bld_east'].every((k) => tex.exists(k)), 'at the plaza (30 s) every core page stays');
  // the station: the core areas are far; a camera cut on its way back (camFocus) keeps them
  at(gs, 3420, 1640);
  gs.camFocus = { x: 1000, y: 900, until: 1e12 };
  ticks(gs, 60);
  ok(['props_buildings', 'deck43', 'bld_work', 'bld_east'].every((k) => tex.exists(k)), 'at the station under camFocus (30 s): nothing goes', Residency.stats().areas);
  // back at the plaza, then the station again without a cut: not before the TTL (10 s over the soft budget)
  gs.camFocus = null;
  at(gs, 1000, 900);
  ticks(gs, 2);
  at(gs, 3420, 1640);
  ticks(gs, 8);
  ok(tex.exists('props_buildings') && tex.exists('bld_work'), 'at the station 4 s: not before the TTL');
  ticks(gs, 20);
  ok(['props_buildings', 'deck43', 'bakery43', 'market_s1', 'bld_work', 'bld_east'].every((k) => !tex.exists(k) && Assets.held.has(k)), 'after the TTL the core pages are out and held', Residency.stats().areas);
  ok(objs.every((o) => o.texture.key === 'fv_blank'), 'what showed them shows the stand-in');
  ok(['bld_work', 'bld_east', 'props_buildings'].every((k) => Assets.isLazy(k)), 'T-3f: held core pages count as after-title pictures (queued again when near)');
  // the hysteresis band: between near and far nothing changes
  at(gs, 1000 + 1300, 900);       // core rect right edge ~1250 + view half 300: gap ~ 450..
  const before = Residency.loads;
  ticks(gs, 10);
  // back to the plaza: the core pages come back (queued)
  at(gs, 1000, 900);
  ticks(gs, 1);
  ok(Residency.loads > before && ['props_buildings', 'bld_work', 'bld_east'].every((k) => !Assets.held.has(k)) && gs.queued > 0, 'back at the plaza the core pages are queued again', { loads: Residency.loads, before });
}

// ---------------------------------------------------------------------------------------------- 4 T-2 swap order
console.log('— T-2 swap, don\'t stack');
{
  const objs = [obj('props_buildings', 600, 640), obj('bld_work', 60, 1530), obj('bld_east', 1890, 485)];
  let released = 0;
  const paint = { releaseIfFar(v) { if (v.x > 2600 || v.right < -500) { released++; return true; } return false; } };
  // the renderer: line = 455 − rt − 15; rt chosen so the totals here sit over line − 15
  const gs = scene({ objects: objs, x: 1000, y: 900, v4: { paint }, filler: 260, renderer: { pipelines: { renderTargets: rtList(1, 4096, 4096 * 2) } } });
  Residency.attach(gs);
  ticks(gs, 2);
  // the town square: town pages held (they went while the camera was in the village)
  for (const k of ['town_civic@rest', 'town_shops@a', 'town_homes', 'town_street']) { gs.game.textures.remove(k); Assets.held.add(k); }
  const order = [];
  const ev = Residency.evictArea.bind(Residency);
  Residency.evictArea = (pages) => { order.push(pages.slice().sort().join('+')); return ev(pages); };
  at(gs, 4900, 2450);
  Residency.checkT = 0; gs.time.now += 500; Residency.tick(0.5);
  Residency.evictArea = ev;
  const tex = gs.game.textures;
  ok(Residency.swaps >= 1, 'the town coming back near the line swapped (swaps ' + Residency.swaps + ', line ' + Residency.line().toFixed(1) + ', total ' + Residency.total.toFixed(1) + ')');
  ok(['props_buildings', 'bld_work', 'bld_east', 'bld_buildings_2', 'boat_rowboat'].every((k) => !tex.exists(k)), 'the core and village pages went at once (no TTL wait)', order);
  // farthest first: the core / work areas (x ≤ ~2000) are farther from the town square than the village rect (to x 3000)
  const iWork = order.findIndex((s) => s.includes('bld_work')), iVil = order.findIndex((s) => s.includes('bld_buildings_2'));
  ok(iWork >= 0 && iVil >= 0 && iWork < iVil, 'farthest area first (work before village)', order);
  ok(['town_civic@rest', 'town_shops@a', 'town_homes', 'town_street'].every((k) => !Assets.held.has(k)), 'the town pages coming back were kept and queued');
  ok(tex.exists('town_civic@hall') || !Assets.held.has('town_civic@hall'), 'a page a near area lists (the hall page: town) stays');
  ok(released === 1, 'RoadPaint\'s bake-only set released with the swap (view beyond its NEAR)', released);
  // under camFocus no swap
  const gs2 = scene({ objects: [obj('props_buildings', 600, 640)], v4: { paint }, renderer: { pipelines: { renderTargets: rtList(1, 4096, 4096 * 2) } } });
  Residency.attach(gs2);
  ticks(gs2, 2);
  gs2.game.textures.remove('town_homes'); Assets.held.add('town_homes');
  gs2.camFocus = { x: 0, y: 0, until: 1e12 };
  at(gs2, 4900, 2450);
  const s0 = Residency.swaps;
  ticks(gs2, 1);
  ok(Residency.swaps === s0 && gs2.game.textures.exists('props_buildings'), 'no swap while a camera cut is on its way back');
  // RoadPaint.releaseIfFar on the real class: only beyond NEAR (1300 px) of both the streets and the rails
  const rp = Object.create(RoadPaint.prototype);
  const have = new Set(['road_dirt', 'roads_decals']);
  rp.gs = { textures: { exists: (k) => have.has(k), remove: (k) => have.delete(k) } };
  rp.streetRect = { x: 3000, y: 1500, w: 3000, h: 1200 };
  rp.railRect = { x: 3000, y: 1200, w: 3000, h: 600 };
  rp.released = false;
  ok(!rp.releaseIfFar({ x: 1800, right: 2400, y: 600, bottom: 1900 }) && have.size === 2, 'RoadPaint: 600 px from the streets (inside NEAR) keeps its set');
  ok(rp.releaseIfFar({ x: 700, right: 1300, y: 300, bottom: 1600 }) && rp.released && have.size === 0, 'RoadPaint: 1700 px away (beyond NEAR of both) lets it go at once');
  ok(!rp.releaseIfFar({ x: 700, right: 1300, y: 300, bottom: 1600 }), 'RoadPaint: already released -> nothing more');
}

// ---------------------------------------------------------------------------------------------- 5 T-4 stage pages
console.log('— T-4 the shop\'s earlier stage pages');
{
  const s3 = obj('market_s3', 1150, 950), s2 = obj('market_s2', 1150, 950);
  const gs = scene({ objects: [s3, s2, obj('props_buildings', 600, 640)], stage: 3 });
  Residency.attach(gs);
  ticks(gs, 1);
  const tex = gs.game.textures;
  ok(!tex.exists('market_s1') && tex.exists('market_s2') && tex.exists('market_s3'), 'stage 3: s1 (nothing shows it) went, s2 (still shown) stays');
  s2.setVisible(false);
  ticks(gs, 1);
  ok(!tex.exists('market_s2') && tex.exists('market_s3') && !Assets.held.has('market_s2') && !Assets.held.has('market_s1'), 'once hidden s2 goes too; neither is held (nothing brings them back)');
  ok(s2.texture.key === '__WHITE' && !s2.visible, 'the hidden picture still on s2 points at __WHITE');
  ok(Residency.stageDrops === 2, 'stageDrops counts them', Residency.stageDrops);
}

// ---------------------------------------------------------------------------------------------- 6 T-3f boot pages
console.log('— T-3f boot pages and the after-title rule');
{
  ok(Assets.areaPages.has('props_buildings') && Assets.areaPages.has('deck43') && Assets.areaPages.has('market_s1'), 'once the village runs the core\'s boot pages are area pages');
  // before any village (a fresh registry state): the boot load must not treat them as after-title pictures
  const saved = new Set(Assets.areaPages);
  Assets.areaPages.clear();
  ok(!Assets.isLazy('props_buildings') && !Assets.isLazy('deck43'), 'before Residency.attach props_buildings / deck43 load at boot (not lazy)');
  for (const k of saved) Assets.areaPages.add(k);
  ok(Assets.isLazy('props_buildings') && Residency.areaPage('deck43'), 'after attach they are after-title pictures');
}

// ---------------------------------------------------------------------------------------------- 6b a working station
console.log('— a station working when its page goes');
{
  const anims = { isPlaying: true, currentAnim: { key: 'spr:station_grill:work' }, currentFrame: { frame: {} }, stop() { this.isPlaying = false; } };
  const grill = obj('props_buildings', 900, 1000, { frame: 'station_grill_work_2', anims });
  const gs = scene({ objects: [grill] });
  gs.lazyImgs = [];
  Residency.attach(gs);
  Residency.evictArea(['props_buildings']);
  ok(grill.texture.key === 'fv_blank' && !anims.isPlaying && anims.currentAnim === null, 'its loop stops and is forgotten (a later play() of the dropped key must not restart the destroyed anim)', { cur: anims.currentAnim, tex: grill.texture.key });
  ok(gs.lazyImgs.length === 1 && gs.lazyImgs[0].key === 'station_grill' && typeof gs.lazyImgs[0].after === 'function', 'it waits for the page as station_grill and replays its loop on arrival', gs.lazyImgs.map((q) => q.key));
}

// ---------------------------------------------------------------------------------------------- 6c parked pictures
console.log('— pictures the view culling parked off the display list');
{
  const hut = obj('props_buildings', 236, 1730, { frame: 'station_grill' });
  const gs = scene({ objects: [obj('props_buildings', 600, 640)] });
  gs.culler = { parked: [Object.assign(hut, { scene: gs })] };
  Residency.attach(gs);
  Residency.liveT = 0;
  ticks(gs, 1);
  ok(Residency.live.core[1] <= 1730 - 240 && Residency.live.core[3] >= 1730 + 160, 'a parked picture is a user of its page (the core rect reaches it)', Residency.live.core);
  Residency.evictArea(['props_buildings']);
  ok(hut.texture.key === 'fv_blank' && gs.lazyImgs.some((q) => q.img === hut), 'evictArea re-skins a parked picture too (it waits for the page, no dead frame when it comes back on the list)', { tex: hut.texture.key, q: gs.lazyImgs.map((q) => q.key) });
}

// ---------------------------------------------------------------------------------------------- 7 UI guard
console.log('— a page a UI panel shows stays');
{
  const card = obj('bld_east', 200, 300, { scrollFactorX: 0, scrollFactorY: 0 });
  const gs = scene({ objects: [obj('bld_east', 1890, 485), obj('bld_work', 60, 1530)], ui: [card] });
  Residency.attach(gs);
  ticks(gs, 1);
  const tex = gs.game.textures;
  Residency.evictArea(['bld_east', 'bld_work']);
  ok(tex.exists('bld_east') && !tex.exists('bld_work'), 'evictArea skips bld_east while a build card shows it; bld_work goes');
  card.setVisible(false);
  Residency.evictArea(['bld_east']);
  ok(!tex.exists('bld_east'), 'the card closed: it goes');
}

// ---------------------------------------------------------------------------------------------- 8 the village built again
// 「처음부터」 is a scene restart (Game.resetProgress), not a page reload: the shop's stage-1 page T-4 let go, and the core's
// boot pages an area holds, are out of memory while the new village is built
console.log('— 「처음부터」: the village built again while core pages are out of memory');
{
  const gs = scene({ stage: 1, loaded: Object.keys(PAGES).filter((k) => k !== 'market_s1' && k !== 'props_buildings') });
  Assets.game = gs.game;
  for (const k in gs.game.textures.list) gs.game.textures.list[k].has = () => true;
  Assets.held.clear();
  Assets.held.add('props_buildings');
  Assets.areaPages.delete('market_s1');
  Residency.attach(gs);
  ok(['market_s1', 'market_s2', 'market_s3'].every((k) => Assets.areaPages.has(k) && Assets.isLazy(k)), 'every shop stage page counts as an after-title picture (stage 1 too)');
  ok(Assets.pending('market_s1_back') && Assets.sprite('market_s1_back').tex === 'fv_blank', 'a stage-1 stall built after T-4 let market_s1 go waits on the stand-in (not a placeholder box)');
  ok(typeof Assets.standIn === 'function', 'a rebuild with a held core page: Assets.image stand-ins are watched');
  const hut = obj('fv_blank', 600, 640);
  Assets.standIn(hut, 'station_grill');
  Assets.standIn(hut, 'station_grill');
  Assets.standIn(obj('fv_blank', 0, 0), 'shop_general');
  ok(gs.lazyImgs.length === 2 && gs.lazyImgs[0].img === hut && gs.lazyImgs[0].key === 'station_grill', 'a stand-in on a core page is queued once for its page', gs.lazyImgs.map((q) => q.key));
  // a station: Station builds with Assets.sprite (not Assets.image) — dressed when its page comes
  let played = null;
  const img = Object.assign(obj('fv_blank', 900, 1000), { setOrigin() { return this; }, play(k) { played = k; return this; } });
  const idle = Object.assign(obj('fv_blank', 1000, 1000), { setOrigin() { return this; }, play() { return this; } });
  gs.stationList = [{ img, cfg: { sprite: 'station_grill' }, working: true, workAnim: null }, { img: idle, cfg: { sprite: 'station_grill' }, working: false, workAnim: null }];
  gs.game.anims.exists = (k) => k === 'spr:station_grill:work';
  gs.lazyImgs.push({ img: idle, key: 'station_grill' });
  Residency.arrived('bakery43');
  ok(img.texture.key === 'fv_blank', 'another page arriving leaves it on the stand-in');
  gs.game.textures.list.props_buildings = { source: [{ width: 10, height: 10 }], has: () => true };
  Residency.arrived('props_buildings');
  ok(img.texture.key === 'props_buildings' && gs.stationList[0].workAnim === 'spr:station_grill:work' && played === 'spr:station_grill:work', 'its page arrived: the station shows its art and plays its work loop', { tex: img.texture.key, anim: gs.stationList[0].workAnim, played });
  ok(idle.texture.key === 'fv_blank', 'a station already queued in Game.lazyImgs is left to Game (dressed there with its own after-step)');
  ticks(gs, 1);
  ok(Assets.standIn === null, 'after the first tick the rebuild is over (no more watching)');
  // a normal boot holds nothing: no watching
  Assets.held.clear();
  Residency.attach(scene({}));
  ok(Assets.standIn === null, 'a normal boot (nothing held): Assets.image is not watched');
  Assets.game = null;
}

console.log(`\nresidency.test: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
