// (v4.2, docs/v42_plan.md §9 + §15) layout check for WORLD.v42 (src/data/world.js):
//   - both balloon loops (RailPath): ballast (± 0.61 cell) ≥ 60 px from the sea, ≥ 0.12 cell from every v4 building,
//     lot, pad and plot (the cannery plot e_m2), clear of the 역 가는 길 (j −1, ≥ 0.39 cell), of the 역전 파출소 and the
//     town platform; ballast x ≤ 6075 (inside the map, the town east border band split around it)
//   - the office and the bank (footprint polygons): on land (≥ 60 px from the sea), inside the world, clear of
//     every plot / site, of the v2 road graph's nodes, of each other and of the hire pad
//   - the 물류창고 (lattice rect): clear of the v4 lots, buildings and the non-v4.2 streets, its lanes, apron, door,
//     till and dock bay inside the map (y ≤ 3360), the sleigh route on streets
//   - the removed decor really exists where removeDecor says
//   node tools/test/v42_layout.mjs [-v]      -> 'no problems'
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WORLD, shoreY, L4, px2L4 } from '../../src/data/world.js';
import { RailPath } from '../../src/systems/RailPath.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'town', 'manifest.json'), 'utf8')).sprites;
const VERB = process.argv.includes('-v');
const S2 = Math.SQRT2;
const problems = [];
const bad = (...a) => problems.push(a.join(' '));
const V4 = WORLD.v4, V42 = WORLD.v42;

// ---------------------------------------------------------------- the v4 objects (as v4_layout.mjs builds them)
const fpm = (k) => { const v = MAN[k] && MAN[k].footprintM; return Array.isArray(v) ? v : v && v.radius ? [v.radius * 2, v.radius * 2] : [0.6, 0.6]; };
const objs = [];
const add = (name, i, j, X, Y, kind) => objs.push({ name, i, j, X, Y, kind });
add('our_station', V4.stations.ours.i, V4.stations.ours.j, ...fpm('train_station'), 'station');
const SQ = V4.square;
for (const k of ['cargo', 'board', 'cash', 'porter', 'rank']) if (SQ[k]) add('square_' + k, SQ[k].i, SQ[k].j, 1.5, 1.5, 'pad');
for (const id in V4.lots) { const l = V4.lots[id]; add(id, l.i, l.j, l.m[0], l.m[1], 'lot'); }
for (const b of V4.town.buildings) add(b.id, b.i, b.j, ...fpm(b.key), b.role || 'bld');
const rect = (o, m = 0) => { const hx = o.X / 2 / S2 + m, hy = o.Y / 2 / S2 + m; return [o.i - hx, o.i + hx, o.j - hy, o.j + hy]; };
const inRect = (A, i, j) => i > A[0] && i < A[1] && j > A[2] && j < A[3];
// v3 plots (diamonds of their size) in lattice terms
const PLOT_H = { S: 0.75, M: 1.06, L: 1.35, XL: 1.7 };
const plots = [];
for (const id in WORLD.plots || {}) {
  const p = WORLD.plots[id];
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
  const q = px2L4(p.x, p.y);
  plots.push({ name: 'plot ' + id, i: q.i, j: q.j, h: PLOT_H[p.size] || 1, x: p.x, y: p.y, size: p.size });
}

// ---------------------------------------------------------------- the loops
const P = new RailPath(V42.rail, V4.G);
const o = {};
let maxX = 0, minShore = Infinity, minJ = Infinity;
for (const seg of P.segs) {
  const loopPart = seg.kind === 'arc' || (seg.kind === 'line' && Math.abs(seg.a[1]) > 0.1) || (seg.kind === 'line' && !seg.main);
  if (!loopPart) continue;
  for (let u = 0; u <= seg.len; u += 0.25) {
    P.at(seg.s0 + Math.min(u, seg.len - 1e-6), o);
    for (const side of [-0.61, 0, 0.61]) {
      const i = o.i - o.dj * side, j = o.j + o.di * side;
      const [x, y] = L4(i, j);
      maxX = Math.max(maxX, x);
      minShore = Math.min(minShore, y - shoreY(x));
      minJ = Math.min(minJ, j);
      if (y < shoreY(x) + 60) bad('loop ballast', 'near the sea', x, y, '(' + (y - shoreY(x)).toFixed(0) + ' px)');
      for (const ob of objs) {
        if (ob.kind === 'station' && Math.abs(j) < 0.9) continue;       // the platform edge along the main line
        if (inRect(rect(ob, 0.12), i, j)) { bad('loop ballast', 'inside', ob.name, i.toFixed(2), j.toFixed(2)); break; }
      }
      for (const pl of plots) if (Math.abs(i - pl.i) + Math.abs(j - pl.j) < pl.h + 0.12 && Math.abs(i - pl.i) < pl.h + 0.12 && Math.abs(j - pl.j) < pl.h + 0.12) { bad('loop ballast', 'on', pl.name, i.toFixed(2), j.toFixed(2)); break; }
    }
  }
}
// (the plan's 6075 is the lattice-rightmost point (43.75, 1.75); the screen-rightmost ballast is at θ = 45° of the
//  semicircle, x ≈ 6134: inside the 6144-px world, the town's east border pines split around it (treeGaps))
if (maxX > WORLD.width - 8) bad('town loop', 'ballast x', maxX.toFixed(0), '> world width − 8');
const gapOk = (V42.treeGaps || []).some((g) => g[0] <= 6000 && g[2] >= 6144 && g[1] <= 2500 && g[3] >= 2800);
if (!gapOk) bad('town loop', 'the east border pines are not split around it');
if (minJ < -1 + 0.39 - 1e-6) bad('loop', 'too close to the 역 가는 길 (j −1)', minJ.toFixed(2));
// the platform corridor of the town station
const pe = V4.streets.find((s) => s.id === 'platform_e');
if (pe) for (let s = P.sTownLoop; s < P.sTownLoop + P.loopLen; s += 0.25) { P.at(s, o); if (o.i > pe.i[0] && o.i < pe.i[1] && o.j > pe.j[0] - 0.61 && o.j < pe.j[1] + 0.61 && Math.abs(o.j) > 0.05) { bad('town loop', 'on platform_e', o.i.toFixed(2), o.j.toFixed(2)); break; } }
// the loop is longer than the 읍 train
if (P.loopLen < 13.6 + 3) bad('loop', 'shorter than the 읍 train + margin', P.loopLen.toFixed(2));
// stops: the 읍 nose (i −2.9) on the straight route before A (−6); crossings open at both stages
if (!(V42.stops.ours[2] > V42.rail.loops.ours.a && V42.stops.ours[2] < V42.rail.loops.ours.t)) bad('stops', '읍 nose not on the loop straight');

// ---------------------------------------------------------------- office + bank
const poly = (b, pts) => pts.map(([x, y]) => [x, y]);
const OFF = V42.office, BANK = V42.bank;
const offPoly = poly(OFF, [[-117, 797], [137, 923], [337, 823], [83, 697]]);
const bankPoly = poly(BANK, [[-566, 561], [-322, 683], [-114, 579], [-358, 457]]);
const inPoly = (pts, x, y) => { let c = false; for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) { const [xa, ya] = pts[a], [xb, yb] = pts[b]; if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) c = !c; } return c; };
const polyDist = (pts, x, y) => { if (inPoly(pts, x, y)) return 0; let d = Infinity; for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) { const [x1, y1] = pts[b], [x2, y2] = pts[a]; const dx = x2 - x1, dy = y2 - y1; const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy))); d = Math.min(d, Math.hypot(x - (x1 + t * dx), (y - (y1 + t * dy)) * 2)); } return d; };
for (const [name, pts] of [['office', offPoly], ['bank', bankPoly]]) {
  for (const [x, y] of pts) {
    if (y < shoreY(x) + 60) bad(name, 'corner near the sea', x, y);
    if (x < WORLD.left + 46) bad(name, 'outside the world', x, y);
  }
  for (const pl of Object.entries(WORLD.plots || {})) {
    const [id, p] = pl;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || p.v42) continue;     // (its own plot)
    const r = PLOT_H[p.size] ? PLOT_H[p.size] * 128 : 136;
    if (polyDist(pts, p.x, p.y) < r * 0.9) bad(name, 'overlaps plot', id);
  }
  for (const id in WORLD.sites || {}) { const s = WORLD.sites[id]; if (Number.isFinite(s.x) && polyDist(pts, s.x, s.y) < 120) bad(name, 'next to site', id); }
  for (const id in (WORLD.roads && WORLD.roads.nodes) || {}) { const [x, y] = WORLD.roads.nodes[id]; if (inPoly(pts, x, y)) bad(name, 'covers road node', id); }
}
const hire = OFF.hire;
if (inPoly(offPoly, hire[0], hire[1]) || inPoly(bankPoly, hire[0], hire[1])) bad('office hire pad', 'inside a building');
for (const [x, y] of offPoly) if (inPoly(bankPoly, x, y)) bad('office', 'overlaps the bank');
for (const [x, y] of bankPoly) if (inPoly(offPoly, x, y)) bad('bank', 'overlaps the office');
// the new road node and the bank door spur on land
for (const id in V42.roads.nodes) { const [x, y] = V42.roads.nodes[id]; if (y < shoreY(x) + 40) bad('road node', id, 'in the sea'); if (inPoly(offPoly, x, y) || inPoly(bankPoly, x, y)) bad('road node', id, 'inside a building'); }

// ---------------------------------------------------------------- 물류창고
const D = V42.depot;
const dep = { name: 'depot', i0: 24.51, i1: 32.29, j0: -30.23, j1: -24.57 };
if (Math.abs((dep.i0 + dep.i1) / 2 - D.i) > 0.01 || Math.abs((dep.j0 + dep.j1) / 2 - D.j) > 0.01) bad('depot', 'centre differs from its footprint');
for (const ob of objs) { const A = rect(ob, 0.12); if (A[0] < dep.i1 && dep.i0 < A[1] && A[2] < dep.j1 && dep.j0 < A[3]) bad('depot', 'overlaps', ob.name); }
for (const s of V4.streets) {
  if (s.v42) continue;
  if (s.axis === 'path') continue;
  if (s.i[0] < dep.i1 && dep.i0 < s.i[1] && s.j[0] < dep.j1 && dep.j0 < s.j[1]) bad('depot', 'on street', s.id);
}
const inMap = (name, i, j) => { const [x, y] = L4(i, j); if (y > 3360) bad(name, 'below y 3360', x.toFixed(0), y.toFixed(0)); if (x > WORLD.width - 30 || x < WORLD.left) bad(name, 'outside the map', x.toFixed(0)); };
for (const [i, j] of [[dep.i0, dep.j0], [dep.i1, dep.j0], [dep.i1, dep.j1], [dep.i0, dep.j1]]) inMap('depot corner', i, j);
inMap('depot door', D.door[0], D.door[1]); inMap('depot till', D.till[0], D.till[1]); inMap('depot bay', D.bayPt[0], D.bayPt[1]);
for (const s of V42.streets) {
  if (s.axis === 'path') { for (const [i, j] of s.pts) inMap(s.id, i, j); continue; }
  // (what v4.2 paints: the paint span when a street is longer than its v4.2 part)
  const I = s.paintI || (s.axis === 'y' && s.paint ? s.paint : s.i), J = s.axis === 'x' && s.paint ? s.paint : s.j;
  for (const [i, j] of [[I[0], J[0]], [I[1], J[0]], [I[1], J[1]], [I[0], J[1]]]) inMap(s.id, i, j);
  if (s.apron) { const [a, b, c, d] = s.apron; for (const [i, j] of [[a, c], [b, c], [b, d], [a, d]]) inMap(s.id + ' apron', i, j); }
}
// the sleigh route: every leg on a street corridor (v4 + v4.2)
const corridors = V4.streets.concat(V42.streets).filter((s) => s.axis !== 'path' && s.id !== 'link');
const onStreet = (i, j) => corridors.some((s) => i >= s.i[0] - 0.35 && i <= s.i[1] + 0.35 && j >= s.j[0] - 0.35 && j <= s.j[1] + 0.35) || (Math.abs(j - D.bayPt[1]) < 0.4 && i >= D.bayPt[0] - 0.4 && i <= 36.9);
const R = V42.sleighRoute;
for (let k = 1; k < R.length; k++) {
  const [a, b] = [R[k - 1], R[k]];
  for (let u = 0; u <= 1.0001; u += 0.1) { const i = a[0] + (b[0] - a[0]) * u, j = a[1] + (b[1] - a[1]) * u; if (!onStreet(i, j) && !(k === 1 && u < 0.15)) { bad('sleigh route', 'leg', k, 'off the streets at', i.toFixed(1), j.toFixed(1)); break; } }
}

// ---------------------------------------------------------------- removed decor exists
const near = (list, x, y) => (list || []).some((q) => Math.abs(q[0] - x) < 12 && Math.abs(q[1] - y) < 12);
for (const [kind, x, y] of V42.removeDecor) {
  if (kind === 'tree' && !near(WORLD.extraTrees, x, y)) bad('removeDecor', 'no extra tree at', x, y);
  if (kind === 'regionTree' && !near(WORLD.regionTrees, x, y)) bad('removeDecor', 'no region tree at', x, y);
}

if (VERB) console.log('loop', P.loopLen.toFixed(2), 'm; ballast max x', maxX.toFixed(0), '; min px above the sea', minShore.toFixed(0), '; objects', objs.length, '; plots', plots.length);
console.log(problems.length ? problems.map((p) => ' FAIL ' + p).join('\n') : '  ok  v4.2 layout: no problems (loops, office, bank, depot, lanes, sleigh route)');
process.exit(problems.length ? 1 : 0);
