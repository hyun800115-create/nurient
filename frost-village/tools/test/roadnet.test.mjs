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

// ================================================================ (v4.3 step B, L1) the village road graph vs plot table v2
// Node only, the v2 road graph (WORLD.roads + WORLD.v42.roads, every zone / land open): no road node stands inside a plot's
// ground (shown or hidden) or inside the 한마당 reserve (but the x = 990 road's cross_n / green); every fixed workshop plot, the
// hall's plot and the moved first house are reached by the roads from the plaza (Roads.path between their nearest nodes,
// the last leg off-road ≤ 6 m); the reserve keeps its walk road (cross_n → green → cross_s)
console.log('plot table v2 (village roads)');
{
  const N = Object.assign({}, WORLD.roads.nodes, (WORLD.v42.roads || {}).nodes || {});
  const E = WORLD.roads.edges.concat((WORLD.v42.roads || {}).edges || []);
  const VR = new Roads(() => true, { nodes: N, edges: E }, () => true);
  const FP = { S: [181, 91], M: [272, 136], L: [362, 181], XL: [525, 262] };
  const inDia = (p, x, y) => { const f = FP[p.size] || FP.M; return Math.abs(x - p.x) / (f[0] / 2) + Math.abs(y - p.y) / (f[1] / 2) < 1; };
  const inPoly = (P, x, y) => { let c = false; for (let a = 0, b = P.length - 1; a < P.length; b = a++) { const [xa, ya] = P[a], [xb, yb] = P[b]; if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / (yb - ya) + xa) c = !c; } return c; };
  const STEPB = ['w_hall', 'w_civic', 'd_tool', 'd_wh', 'd_cannery', 'd_store', 'd_labour', 'd_school', 'd_clinic', 'h43_2'];
  const under = [];
  for (const id of STEPB) { const p = WORLD.plots[id]; if (!p) { under.push(id + ' missing'); continue; } for (const n in N) if (inDia(p, N[n][0], N[n][1])) under.push(id + ':' + n); }
  ok(!under.length, 'no road node on a step-B plot\'s ground (' + STEPB.length + ' plots, hidden ones too)', under);
  const R0 = WORLD.reserves && WORLD.reserves.p47_plaza;
  ok(!!(R0 && Array.isArray(R0.poly) && R0.poly.length === 4), 'WORLD.reserves.p47_plaza has its ground polygon');
  const inRes = Object.keys(N).filter((n) => R0 && inPoly(R0.poly, N[n][0], N[n][1]));
  ok(inRes.sort().join() === 'cross_n,green', 'inside the 한마당 reserve only the x = 990 road\'s nodes (cross_n, green)', inRes);
  const keepRoad = ['cross_n|green', 'green|cross_s'].every((k) => { const [a, b] = k.split('|'); return E.some((e) => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a)); });
  ok(keepRoad, 'the walk road through the reserve stays (cross_n → green → cross_s)');
  const from = VR.byId.plaza_c.i, far = [], legs = [];
  for (const id of ['d_tool', 'd_wh', 'd_cannery', 'd_store', 'w_hall', 'h43_2', 'h43_1']) {
    const p = WORLD.plots[id];
    const dx = Array.isArray(p.drop) ? p.drop[0] : p.x + 2, dy = Array.isArray(p.drop) ? p.drop[1] : p.y + 87;
    const n = VR.nearest(dx, dy), nd = VR.nodes[n];
    const leg = Math.hypot(nd.x - dx, (nd.y - dy) * 2) / 64;
    const path = VR.path(from, n);
    // (porters walk to the workshops and the hall: ≤ 6 m off the road; a first house is a home, reached over the snow: ≤ 10 m)
    if (!path || leg > (/^h43_/.test(id) ? 10 : 6)) far.push(id + ' leg ' + leg.toFixed(1) + ' m to ' + nd.id + (path ? '' : ' (no path)'));
    legs.push(id + ' ' + leg.toFixed(1));
  }
  ok(!far.length, 'the roads reach every fixed workshop plot and the hall\'s plot (last leg ≤ 6 m) and the first houses (≤ 10 m) from the plaza: ' + legs.join(', '), far);
}

// ================================================================ (v4.3 step B, L2) 눈꽃 큰길, the hall's front square, the old office node
// Node only: the new nodes hut_door / hall_front / deck_head exist (w_b1 renamed, w_office gone from both graphs); the 큰길's
// pieces (roads `spine`) are drawn edges and run hall_front → w_rest → w_gate_n → w_b2 → hut_door → plaza_w, the south branch
// plaza_s → cross_n → green → cross_s (X-8) and the east half plaza_e → east_link → east_gate (region east); Roads.drawn carries
// the flag for Ground.drawRoads; the hall's front node stands in the front square (w_hall clear) but off the hall's ground and off
// its pads (TownHall SPOT); deck_head is a walk-only beach node that makes no route longer; the vehicles' p:hall is hall_front
console.log('눈꽃 큰길 (L2)');
{
  const N = WORLD.roads.nodes, E = WORLD.roads.edges;
  ok(['hut_door', 'hall_front', 'deck_head'].every((k) => Array.isArray(N[k])), 'the new nodes hut_door, hall_front, deck_head exist');
  const allIds = Object.keys(N).concat(Object.keys((WORLD.v42.roads || {}).nodes || {}));
  const allEdges = E.concat((WORLD.v42.roads || {}).edges || []);
  ok(!allIds.includes('w_office') && !allEdges.some((e) => e[0] === 'w_office' || e[1] === 'w_office') && !allIds.includes('w_b1'), 'no w_office (node or edge, v2 or v4.2 graph) and no w_b1 (renamed hut_door)');
  ok(WORLD.v42.office.node === 'hut_door', 'WORLD.v42.office.node names hut_door');
  const key = (a, b) => [a, b].sort().join('|');
  const spine = E.filter((e) => e[2] && e[2].spine).map((e) => key(e[0], e[1]));
  const WANT = [['hall_front', 'w_rest'], ['w_gate_n', 'w_rest'], ['w_b2', 'w_gate_n'], ['hut_door', 'w_b2'], ['plaza_w', 'hut_door'],
    ['plaza_s', 'cross_n'], ['cross_n', 'green'], ['green', 'cross_s'], ['plaza_e', 'east_link'], ['east_link', 'east_gate']].map(([a, b]) => key(a, b));
  ok(spine.length === WANT.length && WANT.every((k) => spine.includes(k)), 'the 큰길 = ' + WANT.length + ' drawn pieces: hall front → w_rest → w_gate_n → beach road → hut door → plaza_w; plaza_s → cross_s; plaza_e → east_gate', spine);
  ok(E.filter((e) => e[2] && e[2].spine).every((e) => e[2].draw !== false && e[2].walk !== false && !e[2].zone), 'every 큰길 piece is drawn and walked, in no zone (TXD-3: Ground paints it, ground_road only)');
  const east = E.filter((e) => e[2] && e[2].spine && e[2].region);
  ok(east.length === 2 && east.every((e) => e[2].region === 'east'), 'the east half is the only region piece (east): painted when the east land opens');
  const VR = new Roads(() => true, WORLD.roads, () => true);
  const vil = VR.drawn(null, null).filter((p) => p.spine).length, eh = VR.drawn(null, 'east').filter((p) => p.spine).length;
  ok(vil === 8 && eh === 2 && WORLD.paths.filter((p) => p.spine).length === 8, 'Roads.drawn and WORLD.paths carry the spine flag (village 8, east 2)', { vil, eh });
  // the hall's front node: in the front square, off the hall's ground and off the hall's pads
  const H = WORLD.plots.w_hall, hf = N.hall_front;
  const inSq = (H.clear || []).some(([dx, dy, r]) => Math.hypot(H.x + dx - hf[0], (H.y + dy - hf[1]) * 2) < r);
  const onHall = Math.abs(hf[0] - H.x) / 262.5 + Math.abs(hf[1] - H.y) / 131 < 1;
  const SPOT = { tax: [-20, 168], boardPad: [-200, 128], venue: [-150, 196], rankPad: [-186, 208] };
  const onPad = Object.entries(SPOT).filter(([k, [dx, dy]]) => { const hw = k === 'rankPad' ? 95 : 61; return Math.abs(hf[0] - H.x - dx) / hw + Math.abs(hf[1] - H.y - dy) / (hw / 2) < 1; }).map(([k]) => k);
  ok(inSq && !onHall && !onPad.length, 'hall_front (' + hf + ') stands in the hall\'s front square, off its ground and off the tax / board / ceremony pads', { inSq, onHall, onPad });
  const HR = new Roads(() => true, WORLD.roads, () => true);
  const hp = HR.path(HR.byId.hall_front.i, HR.byId.plaza_c.i);
  ok(!!hp, 'the hall\'s front square is on the road graph (hall_front → plaza_c)');
  // deck_head: walk-only (draw: false) and no route gets longer than with the beach_w — beach_n edge alone
  const dh = E.filter((e) => e[0] === 'deck_head' || e[1] === 'deck_head');
  ok(dh.length === 2 && dh.every((e) => e[2] && e[2].draw === false) && E.some((e) => key(e[0], e[1]) === key('beach_w', 'beach_n')), 'deck_head: two walk-only beach edges, beach_w — beach_n kept');
  const noDh = new Roads(() => true, { nodes: N, edges: E.filter((e) => e[0] !== 'deck_head' && e[1] !== 'deck_head') }, () => true);
  let longer = 0;
  const ids = Object.keys(N).filter((k) => k !== 'deck_head');
  for (const a of ids) for (const b of ids) {
    if (a >= b) continue;
    const p1 = HR.path(HR.byId[a].i, HR.byId[b].i), p0 = noDh.path(noDh.byId[a].i, noDh.byId[b].i);
    if (p1 && p0 && p1.len > p0.len + 0.5) longer++;
  }
  ok(longer === 0, 'with deck_head no route between two other nodes is longer', longer);
  const { PLACES } = await import(path.join(ROOT, 'src/vehicles/layout.js'));
  ok(PLACES['p:hall'] && PLACES['p:hall'].x === hf[0] && PLACES['p:hall'].y === hf[1], 'vehicles p:hall = hall_front (X-9)', PLACES['p:hall']);
  ok(PLACES['p:mail_east'] && PLACES['p:mail_east'].x === N.east_link[0] && PLACES['p:mail_east'].y === N.east_link[1], 'vehicles p:mail_east = east_link (did not move)');
}

console.log(`\nroadnet: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
