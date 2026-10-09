// Node tests of src/systems/Water.js without a browser (headless Water: scene = null -> field + JS maths only).
//   node tools/test/water_lab/node_test.mjs            -> prints a JSON summary, exit 1 on a failed assertion
// Checks: the village field (the Ground.js config) builds and reports its cost; slopeAt == the derivative of
// heightAt (< 5 %); the ring packing (strongest near the view, the same set for heightAt and the shader; low =
// 6 rings); breakwater crash points face the swell only and their bursts travel along the wall; a baked field
// round trip gives the same heights; the sea bed has no crisp step where the nearest shore type changes;
// the static shader costs stay inside the budgets (fetches, fragment uniform vectors <= 60).
import { Water, WaterMask, WATER_PX, waterShaderCosts } from '../../../src/systems/Water.js';
import { shoreY, WORLD } from '../../../src/data/world.js';

const out = { ok: true, fails: [] };
const fail = (m) => { out.ok = false; out.fails.push(m); };
const ms = (f) => { const a = performance.now(); const r = f(); return [r, +(performance.now() - a).toFixed(1)]; };

// ------------------------------------------------------------------ the village (Ground.js config)
const W = WORLD.width;
let maxShore = 0;
for (let x = 0; x <= W; x += 8) maxShore = Math.max(maxShore, shoreY(x));
const villageOpts = { region: { x: 0, y: -200, w: W, h: Math.ceil(maxShore + 40) + 200 }, mask: WaterMask.shoreY(shoreY), defaultShore: 'snowbank', palette: 'winter_sea' };
const [village, buildMs] = ms(() => new Water(null, villageOpts));
const vi = village.info();
out.village = { field: vi.field, fieldScale: vi.fieldScale, fieldCells: vi.fieldCells, buildMs, swellDir: village.swellDir.map((v) => +v.toFixed(3)), crashPoints: vi.crashPoints, openEdges: vi.openEdges, sig: vi.sig };

// slopeAt == derivative of heightAt (finite differences at +-0.25 px), at points across the coast. heightAt is
// built on a bilinear 8-bit field, so its derivative steps at cell edges: judge p95 relative + max absolute error.
{
  const errs = [], absd = [];
  const sl = { x: 0, y: 0 };
  for (const t of [1.3, 4.7, 8.15]) {
    for (let x = 300; x < W - 300; x += 377) {
      const sy = shoreY(x);
      for (const dy of [-12, -30, -60, -120, -260, -420]) {
        const y = sy + dy;
        village.slopeAt(x, y, t, sl);
        const e = 0.25;
        const fx = (village.heightAt(x + e, y, t) - village.heightAt(x - e, y, t)) / (2 * e);
        const fy = (village.heightAt(x, y + e, t) - village.heightAt(x, y - e, t)) / (2 * e);
        const dd = Math.hypot(sl.x - fx, sl.y - fy);
        absd.push(dd); errs.push(dd / Math.max(0.05, Math.hypot(fx, fy)));
      }
    }
  }
  errs.sort((a, b) => a - b);
  const p95 = errs[Math.floor(errs.length * 0.95)], maxAbs = Math.max(...absd);
  out.slope = { samples: errs.length, p50RelErr: +errs[errs.length >> 1].toFixed(4), p95RelErr: +p95.toFixed(4), maxAbsErr: +maxAbs.toFixed(4) };
  if (p95 > 0.05 || maxAbs > 0.012) fail('slopeAt differs from the derivative of heightAt: p95 ' + (p95 * 100).toFixed(1) + ' %, max ' + maxAbs.toFixed(4));
}

// rings: a boat wake (31 puffs, 0.28 s apart) + a cannonball; packing keeps the strongest near the view
{
  const w = village;
  w.setTime(10);
  w.clearRipples();
  for (let k = 0; k < 31; k++) w.ripple(1200 + k * 6, 200 + k * 3, 0.9, 10 - k * 0.28);
  w.ripple(1500, 260, 1.8, 9.2);
  w.ripple(5000, 300, 2.0, 9.9);                 // far away from the view below: culled
  w._vr.set([1000, 0, 1800, 600]); w._vrOk = true; w._pkDirty = true;
  const hi = []; w.heightAt(0, 0); for (let i = 0; i < w._pkN; i++) hi.push(+(w._pk[i * 4 + 2]).toFixed(2));
  w.setQuality('low');
  const lo = []; w.heightAt(0, 0); for (let i = 0; i < w._pkN; i++) lo.push(+(w._pk[i * 4 + 2]).toFixed(2));
  w.setQuality('high');
  out.rings = { pool: w._rlN, highPacked: hi.length, lowPacked: lo.length, lowBirthTimes: lo };
  if (hi.length !== 12 || lo.length !== 6) fail('ring packing counts ' + hi.length + ' / ' + lo.length);
  if (lo.indexOf(9.2) < 0) fail('the cannonball ring (strength 1.8) is not among the 6 low-quality rings');
  if (lo.some((t0) => t0 < 10 - 0.28 * 4 - 0.01 && t0 !== 9.2)) fail('low quality packs old wake rings before newer ones');
  if (hi.some((t0) => t0 === 9.9)) fail('a ring far outside the view was packed');
  w.clearRipples(); w._vrOk = false;
}

// ------------------------------------------------------------------ beach + offshore breakwater (lab scene geometry)
const ISO = { ax: [45.2548, 22.6274], ay: [45.2548, -22.6274] };
const iso = (cx, cy, mx, my) => [cx + ISO.ax[0] * mx + ISO.ay[0] * my, cy + ISO.ax[1] * mx + ISO.ay[1] * my];
function beachOpts() {
  const C = { x: 1000, y: 640 };
  const P = (mx, my) => iso(C.x, C.y, mx, my);
  const shoreX = (my) => 0.9 * Math.sin(my * 0.21) + 0.45 * Math.sin(my * 0.53 + 1.1);
  const pts = [];
  for (let my = -30; my <= 30; my += 0.5) pts.push(...P(shoreX(my), my));
  const land = [...pts, ...P(34, 30), ...P(34, -30)];
  const bwX = -13.5, bwY0 = 3.0, Q2 = Math.SQRT2, bwEnd = bwY0 + 8 * Q2 + Q2 / 2;
  const bwZ0 = [...P(bwX - 1.7, bwY0 - 0.9), ...P(bwX + 1.7, bwY0 - 0.9), ...P(bwX + 1.7, bwEnd), ...P(bwX - 1.7, bwEnd)];
  const bwWater = bwZ0.map((v, i) => (i % 2 ? v + WATER_PX : v));
  return { P, opts: { region: { x: -200, y: -300, w: 2400, h: 1900 }, mask: { land: [{ poly: land, waterPx: 0 }, { poly: bwZ0, waterPx: WATER_PX }] },
    shoreTypes: [{ type: 'breakwater', poly: bwWater }], defaultShore: 'sand', palette: 'tropical' }, bwX, bwY0, bwEnd };
}
{
  const B = beachOpts();
  const [beach, bms] = ms(() => new Water(null, B.opts));
  const bi = beach.info();
  out.beach = { field: bi.field, buildMs: bms, crashPoints: bi.crashPoints, swellDir: beach.swellDir.map((v) => +v.toFixed(3)) };
  // crash points face the swell (exposure) and sit at the wall foot (shore distance small)
  for (const p of beach.crashPoints) {
    if (p.expo < 0.3) fail('crash point facing away from the swell');
    const d = beach.shoreDistance(p.x, p.y);
    if (d < 0 || d > 30) fail('crash point not at the wall foot: d ' + d.toFixed(1));
  }
  // bursts travel along the wall and come back every crest: group the events by crest (gaps > 2.5 s split them);
  // a group of 3+ must take >= 0.3 s (a sweep, not one synchronous blast), and no silence longer than 2 periods
  const times = [];
  beach.crashEvents(0, 36, (x, y, s, tc) => times.push(+tc.toFixed(2)));
  times.sort((a, b) => a - b);
  const groups = [];
  for (const t of times) { const g = groups[groups.length - 1]; if (g && t - g[g.length - 1] < 2.5) g.push(t); else groups.push([t]); }
  const spans = groups.map((g) => +(g[g.length - 1] - g[0]).toFixed(2));
  let maxGap = 0;
  for (let i = 1; i < groups.length; i++) maxGap = Math.max(maxGap, groups[i][0] - groups[i - 1][groups[i - 1].length - 1]);
  out.beach.crashes36s = times.length; out.beach.crestGroups = groups.length; out.beach.groupSpans = spans; out.beach.maxGap = +maxGap.toFixed(2);
  if (!times.length) fail('no crash events on the beach breakwater in 36 s');
  if (groups.some((g, i) => g.length >= 3 && spans[i] < 0.3)) fail('a crest throws its sprays all at once: ' + spans);
  if (maxGap > 12.5) fail('no spray for ' + maxGap.toFixed(1) + ' s');
  // sea bed: no crisp step anywhere in open water (depth gradient small everywhere it is > 0.5 m)
  let maxStep = 0, at = null;
  for (let y = -250; y < 1550; y += 6) for (let x = -150; x < 2150; x += 6) {
    const d = beach.shoreDistance(x, y);
    if (d < 60) continue;
    const a = beach.seaDepth(x, y), b = beach.seaDepth(x + 6, y), c = beach.seaDepth(x, y + 3);
    const st = Math.max(Math.abs(b - a), Math.abs(c - a)) / Math.max(0.3, a);
    if (st > maxStep) { maxStep = st; at = [x, y, +a.toFixed(2)]; }
  }
  out.beach.maxRelDepthStep = +maxStep.toFixed(3); out.beach.maxStepAt = at;
  if (maxStep > 0.12) fail('sea-bed depth step ' + maxStep.toFixed(3) + ' (relative per 6 px) at ' + at);
  // baked round trip: the same heights from the stacked RGB bytes
  const bk = beach.bakeData();
  const again = new Water(null, Object.assign({}, B.opts, { baked: { rgb: bk.rgb, meta: bk.meta } }));
  let dmax = 0;
  for (let i = 0; i < 400; i++) {
    const x = -100 + (i * 977) % 2200, y = -200 + (i * 613) % 1700;
    dmax = Math.max(dmax, Math.abs(again.heightAt(x, y, 3.3) - beach.heightAt(x, y, 3.3)));
  }
  out.beach.bakedFrom = again.stats.fieldFrom; out.beach.bakedMaxDiff = +dmax.toFixed(5);
  if (again.stats.fieldFrom !== 'baked' || dmax > 1e-9) fail('baked field round trip differs: ' + dmax);
  const wrong = new Water(null, Object.assign({}, B.opts, { waterPx: 7, baked: { rgb: bk.rgb, meta: bk.meta } }));
  if (wrong.stats.fieldFrom === 'baked') fail('a baked field was used for a different region config');
}

// ------------------------------------------------------------------ harbour: quay + breakwater, one wall convention
{
  const C = { x: 1060, y: 700 }, Q2 = Math.SQRT2;
  const P = (mx, my) => iso(C.x, C.y, mx, my);
  const Lx = 9 * Q2, Ly = 9 * Q2;
  const land = [...P(0, 0), ...P(-Lx, 0), ...P(-Lx, Ly), ...P(0, Ly)];
  const bwY = 6 * Q2, bwX1 = 4 * Q2 + 1.6;
  const breakwater = [...P(-0.2, bwY - 1.8), ...P(-0.2, bwY + 1.8), ...P(bwX1, bwY + 1.8), ...P(bwX1 + 1.0, bwY), ...P(bwX1, bwY - 1.8)];
  const bwWater = breakwater.map((v, i) => (i % 2 ? v + WATER_PX : v));
  const h = new Water(null, { region: { x: 150, y: -200, w: 2400, h: 1800 }, waterPx: WATER_PX, mask: { land: [land, breakwater] },
    shoreTypes: [{ type: 'breakwater', poly: bwWater }], defaultShore: 'quay', palette: 'harbor', swellDir: [-0.55, 0.83] });
  const hi = h.info();
  // one wall convention: the z0 footprints seen 30 px lower are the land at the water plane; every crash point
  // is in the water outside that (the seaward foot: in front of the wall, or hidden behind the deck so the spray
  // rises over its top from the far side)
  let onDeck = 0, front = 0, behind = 0;
  const inPolyN = (p, x, y) => { let c = false; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) { const xi = p[i], yi = p[i + 1], xj = p[j], yj = p[j + 1]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  for (const p of h.crashPoints) {
    if (inPolyN(bwWater, p.x, p.y) || inPolyN(land.map((v, i) => (i % 2 ? v + WATER_PX : v)), p.x, p.y)) onDeck++;
    else if (inPolyN(breakwater, p.x, p.y)) behind++; else front++;
  }
  out.harbor = { field: hi.field, crashPoints: hi.crashPoints, onDeck, front, behind, openEdges: hi.openEdges };
  if (onDeck) fail(onDeck + ' harbour crash points on the breakwater deck');
}

// ------------------------------------------------------------------ static shader budgets
out.shaders = waterShaderCosts();
for (const [k, v] of Object.entries(out.shaders)) {
  if (v.fragUniformVectors > 60) fail(k + ' uses ' + v.fragUniformVectors + ' fragment uniform vectors (> 60)');
  if (k.endsWith('low') && v.fetches > 2) fail(k + ' has ' + v.fetches + ' fetches (> 2)');
}

console.log(JSON.stringify(out, null, 1));
process.exit(out.ok ? 0 : 1);
