// v4 layout check (docs/v4_plan.md §3, §16.1): WORLD.v4 in src/data/world.js against the town manifest, with
// the rules of tools/test/v4_layout_ref.py: inside its region (46 px inset), ≥ 60 px from the sea, no overlaps
// (0.12-cell margin), nothing on a street corridor or the track ballast, crossings clear of a 4-car train;
// plus: street props off painted cells and walk lines, the walk graph (RoadNet) connected with every door
// reachable, and the numbers equal to the reference script.
//   node tools/test/v4_layout.mjs [-v]
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WORLD, shoreY, L4, px2L4 } from '../../src/data/world.js';
import { RoadNet } from '../../src/systems/RoadNet.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'town', 'manifest.json'), 'utf8')).sprites;
const V = process.argv.includes('-v');
const S2 = Math.SQRT2, INSET = 46;
const problems = [];
const bad = (...a) => problems.push(a.join(' '));
const V4 = WORLD.v4;
const REG = {};
for (const id of ['rail', 'town']) REG[id] = WORLD.territory[id].rect;

const fpm = (k) => { const v = MAN[k] && MAN[k].footprintM; return Array.isArray(v) ? v : [0.6, 0.6]; };
const objs = [];
const add = (name, key, i, j, region, kind, X, Y) => { if (X === undefined) [X, Y] = fpm(key); objs.push({ name, key, i, j, region, kind, X, Y }); };
add('our_station', 'train_station', V4.stations.ours.i, V4.stations.ours.j, 'rail', 'station');
const SQ = V4.square;
add('cargo_pad', 'pad', SQ.cargo.i, SQ.cargo.j, 'rail', 'pad', 1.6, 1.6);
add('order_board', 'notice_board', SQ.board.i, SQ.board.j, 'rail', 'prop', 1.4, 0.5);
add('stn_cash', 'pad', SQ.cash.i, SQ.cash.j, 'rail', 'pad', 1.5, 1.5);
add('stn_porter_pad', 'pad', SQ.porter.i, SQ.porter.j, 'rail', 'pad', 1.4, 1.4);
add('rank_pad', 'pad', SQ.rank.i, SQ.rank.j, 'rail', 'pad', 1.6, 1.6);
for (const id in V4.lots) { const l = V4.lots[id]; add(id, 'lot', l.i, l.j, 'rail', 'lot', l.m[0], l.m[1]); }
for (const b of V4.town.buildings) {
  if (!MAN[b.key]) { bad(b.id, 'unknown art', b.key); continue; }
  const region = b.region || 'town';
  add(b.id === 't_station' ? 'town_station' : b.id === 't_gate' ? 'town_gate' : b.id, b.key, b.i, b.j, region, b.role === 'station' ? 'station' : b.role === 'gate' ? 'gate' : 'bld');
}
const rect = (o, m = 0) => { const hx = o.X / 2 / S2 + m, hy = o.Y / 2 / S2 + m; return [o.i - hx, o.i + hx, o.j - hy, o.j + hy]; };
const corners = (o) => { const [a, b, c, d] = rect(o); return [L4(a, c), L4(b, c), L4(b, d), L4(a, d)]; };
for (const o of objs) {
  const r = REG[o.region];
  for (const [x, y] of corners(o)) {
    if (o.kind !== 'gate' && !(x >= r[0] + INSET && x <= r[2] - INSET && y <= r[3] - INSET)) bad(o.name, 'outside region', x, y);
    if (y < shoreY(x) + 60) bad(o.name, 'too close to the sea', x, y);
  }
}
for (let a = 0; a < objs.length; a++) for (let b = a + 1; b < objs.length; b++) {
  const A = rect(objs[a], 0.12), B = rect(objs[b], 0.12);
  if (A[0] < B[1] && B[0] < A[1] && A[2] < B[3] && B[2] < A[3]) bad(objs[a].name, 'overlaps', objs[b].name);
}
const streets = V4.streets;
for (const s of streets) {
  const [i0, i1] = s.i, [j0, j1] = s.j;
  for (const o of objs) {
    if ((o.kind === 'pad' || o.kind === 'prop') && s.id === 'square') continue;
    if (o.kind === 'gate' && s.id === 'main') continue;
    if (o.kind === 'station' && s.id.startsWith('platform')) continue;
    const A = rect(o);
    if (A[0] < i1 && i0 < A[1] && A[2] < j1 && j0 < A[3]) bad(o.name, 'on street', s.id);
  }
  if (s.id === 'link') continue;
  for (const [x, y] of [L4(i0, j0), L4(i1, j0), L4(i1, j1), L4(i0, j1)]) {
    if (!(x >= 3000 + INSET && x <= WORLD.width - INSET && y <= WORLD.height - INSET)) bad(s.id, 'street corner outside', x, y);
    if (y < shoreY(x) + 60) bad(s.id, 'street near the sea', x, y);
  }
}
for (const o of objs) { if (o.kind === 'station') continue; const A = rect(o); if (A[2] < 0.75 && -0.75 < A[3]) bad(o.name, 'on the track ballast'); }
// the 4-car 읍 train must not stand on a crossing at either station
const consist = (ia, coaches) => { const out = [ia - 2.34 / S2, ia]; let x = ia; if (coaches === 2) { x += 2.24 / S2; out.push(x); } x += 2.24 / S2; out.push(x); return [out[0] - 1.3 / S2, x + 1.15 / S2]; };
for (const [st, xing] of [['ours', V4.rail.crossings[0]], ['town', V4.rail.crossings[1]]]) {
  for (const co of [1, 2]) { const e = consist(V4.stations[st].carA, co); if (e[1] > xing - 0.4) bad('train at ' + st, 'covers the crossing', e[1].toFixed(2)); if (st === 'ours' && e[0] < V4.rail.from + 0.4) bad('train at ours', 'past the buffer stop', e[0].toFixed(2)); }
}
// street props: not on painted cells, not on a walk line, not inside a building
const walkLines = [];
for (const s of streets) if (s.walk !== undefined) walkLines.push({ axis: s.axis, fix: s.walk, span: s.walkSpan || (s.axis === 'x' ? s.i : s.j) });
for (const w of V4.walkExtra) walkLines.push({ axis: w[0], fix: w[1], span: [w[2], w[3]] });
for (const [key, i, j] of V4.town.props) {
  if (!MAN[key]) { bad('prop', key, 'unknown art'); continue; }
  const fm = MAN[key].footprintM;
  const [X, Y] = Array.isArray(fm) ? fm : [fm.radius * 2, fm.radius * 2];
  const p = { name: key + '@' + i + ',' + j, i, j, X, Y };
  const A = rect(p);
  for (const s of streets) {
    if (!s.paint) continue;
    const sj = s.paintSpan || s.j;
    const pr = s.axis === 'x' ? [s.i[0], s.i[1], s.paint[0], s.paint[1]] : [s.paint[0], s.paint[1], sj[0], sj[1]];
    if (A[0] < pr[1] && pr[0] < A[1] && A[2] < pr[3] && pr[2] < A[3]) bad(p.name, 'on painted street', s.id);
  }
  for (const w of walkLines) {
    const lo = Math.min(w.span[0], w.span[1]), hi = Math.max(w.span[0], w.span[1]);
    const along = w.axis === 'x' ? [A[0], A[1]] : [A[2], A[3]], across = w.axis === 'x' ? [A[2], A[3]] : [A[0], A[1]];
    if (along[1] > lo && along[0] < hi && across[0] < w.fix + 0.3 && across[1] > w.fix - 0.3) bad(p.name, 'on a walk line', w.axis, w.fix);
  }
  for (const o of objs) { if (o.kind === 'pad' || o.kind === 'prop') continue; const B = rect(o, 0.05); if (A[0] < B[1] && B[0] < A[1] && A[2] < B[3] && B[2] < A[3]) bad(p.name, 'inside', o.name); }
  if (Math.abs(j) < 0.75) bad(p.name, 'on the track ballast');
}
// walk graph: connected, every door joined, no walk edge through a building (door spurs excepted)
const doors = [];
for (const b of V4.town.buildings) { const d = MAN[b.key] && MAN[b.key].doorPoint; if (d) doors.push({ id: b.id, x: b.x + d[0], y: b.y + d[1] }); }
for (const id in V4.lots) { const l = V4.lots[id]; const fp = l.m; doors.push({ id, x: L4(l.i, l.j - fp[1] / 2 / S2 - 0.2)[0], y: L4(l.i, l.j - fp[1] / 2 / S2 - 0.2)[1] }); }
const rn = new RoadNet(V4, { doors });
const g = rn.walkGraph();
const ids = Object.keys(g.nodes), adj = new Map(ids.map((k) => [k, []]));
for (const [a, b] of g.edges) { adj.get(a).push(b); adj.get(b).push(a); }
const seen = new Set([ids[0]]), q = [ids[0]];
while (q.length) { const n = q.pop(); for (const m of adj.get(n)) if (!seen.has(m)) { seen.add(m); q.push(m); } }
if (seen.size !== ids.length) bad('walk graph', 'not connected', seen.size + '/' + ids.length, ids.filter((k) => !seen.has(k)).slice(0, 6).join(','));
for (const d of doors) if (!rn.doorNode(d.id)) bad('door', d.id, 'not joined to a walk line');
if (!g.nodes.v_link_e) bad('walk graph', 'does not join the v2 road at v_link_e');
const xingEdges = g.edges.filter((e) => e[2].xing !== undefined);
if (xingEdges.length < 2) bad('walk graph', 'crossing edges missing', xingEdges.length);
for (const e of rn.edges) {
  if (e.street === 'door') continue;
  for (let k = 1; k < 8; k++) {
    const i = e.a.i + (e.b.i - e.a.i) * k / 8, j = e.a.j + (e.b.j - e.a.j) * k / 8;
    for (const o of objs) {
      if (o.kind === 'pad' || o.kind === 'prop' || o.kind === 'lot' || o.kind === 'gate') continue;
      if (o.kind === 'station' && e.street.startsWith('platform') || (o.kind === 'station' && e.street.startsWith('extra'))) continue;
      const A = rect(o, -0.05);
      if (i > A[0] && i < A[1] && j > A[2] && j < A[3]) { bad('walk edge', e.street, 'goes through', o.name, i.toFixed(1), j.toFixed(1)); break; }
    }
    if (Math.abs(j) < 0.7 && e.xing < 0) bad('walk edge', e.street, 'crosses the track outside a crossing', i.toFixed(1), j.toFixed(1));
  }
}
// same numbers as the reference script (python3 tools/test/v4_layout_ref.py --json)
try {
  const tmp = path.join(ROOT, '.v4_layout_ref.json');
  execFileSync('python3', [path.join(ROOT, 'tools', 'test', 'v4_layout_ref.py'), '--json', tmp], { stdio: 'pipe' });
  const ref = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  fs.unlinkSync(tmp);
  const mine = new Map(objs.map((o) => [o.name, o]));
  for (const r of ref.objs) {
    const o = mine.get(r.name);
    if (!o) { bad('ref', r.name, 'missing in world.js'); continue; }
    if (Math.abs(o.i - r.i) > 1e-6 || Math.abs(o.j - r.j) > 1e-6) bad('ref', r.name, 'differs', o.i, o.j, 'vs', r.i, r.j);
  }
  for (const r of ref.streets) {
    const s = streets.find((q) => q.id === r.id);
    if (!s) { bad('ref street', r.id, 'missing'); continue; }
    if (s.i[0] !== r.i[0] || s.i[1] !== r.i[1] || s.j[0] !== r.j[0] || s.j[1] !== r.j[1]) bad('ref street', r.id, 'corridor differs');
  }
} catch (e) { console.log('  (reference script not run: ' + e.message.split('\n')[0] + ')'); }
// v2 link nodes on the lattice
const vw = WORLD.roads.nodes.v_link_w, ve = WORLD.roads.nodes.v_link_e;
if (!vw || !ve || L4(-6.5, -1).join() !== vw.join() || L4(2, -1).join() !== ve.join()) bad('v2 link nodes', 'not at L(-6.5,-1) / L(2,-1)');
void px2L4;
if (V) { console.log('objects', objs.length, 'walk nodes', ids.length, 'edges', g.edges.length, 'doors', Object.keys(rn.doorNodes).length); }
console.log(problems.length ? problems.map((p) => ' FAIL ' + p).join('\n') : '  ok  v4 layout: no problems (' + objs.length + ' objects, ' + streets.length + ' streets, ' + ids.length + ' walk nodes)');
process.exit(problems.length ? 1 : 0);
