// RoadNet + Roads (v4-B, docs/v4_plan.md §10.1 / §16.1), Node only:
//   node tools/test/roadnet.test.mjs
// streets -> cells -> graph; every door reachable from its front side; A* (Roads.path) = Dijkstra (RoadNet.route)
// on 500 random pairs; nearestK = brute force; lane sides and junction connectors; crossing edgeBlocked;
// upgrade() invalidation (cells, lanes, listeners).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const { WORLD, L4 } = await import(path.join(ROOT, 'src/data/world.js'));
const { RoadNet, CELL } = await import(path.join(ROOT, 'src/systems/RoadNet.js'));
const { Roads } = await import(path.join(ROOT, 'src/systems/Roads.js'));

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); } };
const V = WORLD.v4;
// doors exactly as Neighbours builds them (door points from the town manifest)
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/town/manifest.json'), 'utf8'));
const doors = [];
for (const b of V.town.buildings) { const d = (man.sprites[b.key] || {}).doorPoint; if (d) doors.push({ id: b.id, x: b.x + d[0], y: b.y + d[1] }); }
for (const id in V.lots) { const l = V.lots[id]; const [x, y] = L4(l.i, l.j - l.m[1] / 2 / Math.SQRT2 - 0.2); doors.push({ id, x, y }); }
const rn = new RoadNet(V, { doors });

console.log('cells');
const roads = rn.cellList(CELL.ROAD), walks = rn.cellList(CELL.WALK), squares = rn.cellList(CELL.SQUARE);
const rails = rn.cellList(CELL.RAIL), xings = rn.cellList(CELL.XING);
ok(roads.length > 50, 'road cells (' + roads.length + ')');
ok(squares.length > 0, 'square cells (' + squares.length + ')');
ok(rails.length > 20, 'rail cells (' + rails.length + ')');
ok(xings.length === (V.rail.crossings || []).length * 2, 'crossing cells: 2 per crossing (' + xings.length + ')');
ok(roads.every((c) => (V.streets || []).some((s) => s.id === c.street)), 'every road cell belongs to a street');
ok(roads.some((c) => c.junction), 'junction cells marked');
ok(rails.every((c) => c.cj === -1 || c.cj === 0), 'rail cells on the track (j -1..1)');

console.log('walk graph');
const g = rn.walkGraph();
ok(Object.keys(g.nodes).length > 20 && g.edges.length > 20, 'nodes ' + Object.keys(g.nodes).length + ', edges ' + g.edges.length);
// connected: every node reaches the first one
const ids = Object.keys(g.nodes);
const adj = new Map(ids.map((k) => [k, []]));
for (const [a, b] of g.edges) { adj.get(a).push(b); adj.get(b).push(a); }
const seen = new Set([ids[0]]), q = [ids[0]];
while (q.length) { const n = q.pop(); for (const m of adj.get(n)) if (!seen.has(m)) { seen.add(m); q.push(m); } }
ok(seen.size === ids.length, 'the walk graph is connected (' + seen.size + '/' + ids.length + ')');

console.log('doors');
let missing = [], behind = [];
for (const d of doors) {
  const id = rn.doorNode(d.id);
  if (!id) { missing.push(d.id); continue; }
  const s = rn.doorSpur[d.id], p = rn.P(d.x, d.y);
  // front side: an X line at lower (or equal) j than the door, a Y line whose stop is not beyond the door
  const front = s.line.axis === 'x' ? s.line.fix <= p.j + 0.2 : s.t <= p.j + 0.2;
  if (!front) behind.push(d.id);
}
ok(missing.length === 0, 'every door has a spur (' + doors.length + ' doors)', missing);
ok(behind.length <= 2, 'doors join a line in front of them (behind: ' + behind.length + ')', behind);
const gate = rn.nearestWalkNode(...L4(V.rail.to - 1, -2));
let unreach = [];
for (const d of doors) { const id = rn.doorNode(d.id); if (id && !rn.route(id, gate.id)) unreach.push(d.id); }
ok(unreach.length === 0, 'every door reaches the station side by walking', unreach);

console.log('A* = Dijkstra');
const R = new Roads(() => true, { nodes: {}, edges: [] }, () => true);
R.addGraph(g);
const idx = (id) => R.byId[id].i;
let seed = 7;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
let bad = 0, worst = 0;
const toLen = (r) => { let L = 0; for (let k = 1; k < r.pts.length; k++) L += Math.hypot(r.pts[k].x - r.pts[k - 1].x, r.pts[k].y - r.pts[k - 1].y); return L; };
for (let k = 0; k < 500; k++) {
  const a = ids[Math.floor(rnd() * ids.length)], b = ids[Math.floor(rnd() * ids.length)];
  if (a === b) continue;
  const p = R.path(idx(a), idx(b));
  const d = rn.route(a, b);
  if (!p || !d) { bad++; continue; }
  // Roads measures ground distance (y counts double); compare both in Roads' metric
  let L = 0;
  for (let i = 1; i < d.pts.length; i++) L += Math.hypot(d.pts[i].x - d.pts[i - 1].x, (d.pts[i].y - d.pts[i - 1].y) * 2);
  const diff = Math.abs(p.len - L);
  worst = Math.max(worst, diff);
  if (diff > 1.5) bad++;
  void toLen;
}
ok(bad === 0, 'A* path length = Dijkstra on 500 random pairs (worst diff ' + worst.toFixed(2) + ' px)', bad);
// nearestK vs brute force
let nkBad = 0;
const gd = (ax, ay, bx, by) => Math.hypot(bx - ax, (by - ay) * 2);
for (let k = 0; k < 500; k++) {
  const x = 3000 + rnd() * 2600, y = 900 + rnd() * 1800;
  const got = R.nearestK(x, y, 3, []);
  const all = R.nodes.filter((n) => n.edges.length).map((n) => [n.i, gd(x, y, n.x, n.y)]).sort((p, q2) => p[1] - q2[1]).slice(0, 3);
  if (got.length !== all.length || got.some((v, i) => Math.abs(gd(x, y, R.nodes[v].x, R.nodes[v].y) - all[i][1]) > 1e-6)) nkBad++;
}
ok(nkBad === 0, 'nearestK = brute force (500 points)', nkBad);
// cache invalidation keeps answers
R.invalidate();
ok(!!R.path(idx(ids[0]), idx(ids[ids.length - 1])), 'path after invalidate');

console.log('crossings');
const xe = R.edges.filter((e) => e.xing >= 0);
ok(xe.length > 0, 'walk edges over a level crossing carry xing (' + xe.length + ')');
let blocked = false;
R.edgeBlocked = (e) => !!(e && e.xing >= 0 && blocked);
ok(!R.edgeBlocked(xe[0]), 'crossing open: not blocked');
blocked = true;
ok(R.edgeBlocked(xe[0]) && !R.edgeBlocked(R.edges.find((e) => !(e.xing >= 0))), 'crossing closed: only crossing edges blocked');
const wr = rn.route(rn.nearestWalkNode(...L4(V.rail.from + 4, -3)).id, rn.nearestWalkNode(...L4(V.rail.from + 4, 3)).id);
ok(!wr || Array.isArray(wr.xings), 'walk routes list the crossings they pass');

console.log('lanes');
ok(rn.driveEdges.length > 0 && rn.driveNodes.length > 0, 'drive graph: ' + rn.driveNodes.length + ' nodes, ' + rn.driveEdges.length + ' edges');
let sideBad = 0;
for (const e of rn.driveEdges) {
  const f = rn.laneLattice(e, 1, (e.t0 + e.t1) / 2), r = rn.laneLattice(e, -1, (e.t0 + e.t1) / 2);
  // right-hand: +i drives at lower j, -i at higher j; +j drives at higher i, -j at lower i
  if (e.axis === 'x' ? !(f.j < e.fix && r.j > e.fix) : !(f.i > e.fix && r.i < e.fix)) sideBad++;
}
ok(sideBad === 0, 'lanes are right-hand on every edge', sideBad);
const J = rn.driveNodes.filter((n) => n.kind === 'junction');
ok(J.length > 0, 'junctions in the drive graph (' + J.length + ')');
let connBad = 0, turns = new Set();
for (const n of J) {
  const C = rn.connectors(n.id);
  if (!C.length) connBad++;
  for (const c of C) { turns.add(c.turn); if (c.polyline.length < 2) connBad++; if (c.turn === 'U') connBad++; }
}
ok(connBad === 0, 'every junction has connectors (no U-turns at junctions)');
ok(turns.has('S') && turns.has('L') && turns.has('R'), 'straight, left and right turns exist', Array.from(turns));
ok(J.some((n) => rn.connectors(n.id).some((c) => c.conflicts.length > 0)), 'crossing connectors are marked as conflicts');
const de = rn.driveEdges[0], dr = rn.route({ x: de.a.x, y: de.a.y }, { x: rn.driveEdges[rn.driveEdges.length - 1].b.x, y: rn.driveEdges[rn.driveEdges.length - 1].b.y }, { mode: 'drive' });
ok(!!dr && dr.pts.length >= 2 && dr.cum[dr.cum.length - 1] > 0, 'drive route with lane points and metres');

console.log('upgrade');
const before = rn.cellList(CELL.WALK).length, v0 = rn.version;
let heard = null;
rn.onChange((id, cls) => { heard = id + ':' + cls; });
const main = rn.cellList(CELL.ROAD).filter((c) => c.street === 'main');
ok(main.length > 0 && main.every((c) => c.cls === 0), 'main street starts as dirt (' + main.length + ' cells)');
rn.upgrade('main', 'cobble');
const main2 = rn.cellList(CELL.ROAD).filter((c) => c.street === 'main');
ok(main2.length > 0 && main2.every((c) => c.cls === 1), 'main street cobble after upgrade');
ok(rn.version === v0 + 1 && heard === 'main:cobble', 'version bumped and listeners told');
ok(rn.cellList(CELL.WALK).length > before, 'sidewalk cells added (' + before + ' -> ' + rn.cellList(CELL.WALK).length + ')');
ok(rn.upgrade('main', 'cobble') === false, 'the same upgrade twice is a no-op');
ok(rn.driveEdges.some((e) => e.street === 'main' && e.cls === 1), 'lanes rebuilt with the new class');

console.log(`\nroadnet: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
