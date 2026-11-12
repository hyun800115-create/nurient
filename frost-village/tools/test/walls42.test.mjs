// (v4.2 CODE-2 review fix, gameplay M2) the office / bank / depot walls: Node only.
//   node tools/test/walls42.test.mjs
// The buildings' footprint walls (Collision.addWalls: capsules along the footprint edges, the door's opening cut out)
// plus the office manifest's wall circles, exactly as OfficeBuilding / BankBuilding42 add them. A chief (radius 16)
// steered straight at the 책상 pad / the 창구 pad from many sides at 255 px/s never gets onto the floor through a wall
// (the reviewer walked through the back, the east and the bank's front wall); through the door he does.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const { Collision } = await import(path.join(ROOT, 'src/systems/Collision.js'));
const { WORLD } = await import(path.join(ROOT, 'src/data/world.js'));
const { polyHas } = await import(path.join(ROOT, 'src/entities/Cutaway.js'));

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); } };

const om = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/office/manifest.json'), 'utf8')).sprites.chief_office;
const cm = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/civic/manifest.json'), 'utf8')).sprites.bank;

/** steer a radius-16 walker from (x, y) at (tx, ty) for `sec` s; the path it took */
function walk(C, x, y, tx, ty, sec, via) {
  const p = { x, y }, tr = [];
  const pts = (via || []).concat([{ x: tx, y: ty }]);
  let wi = 0;
  for (let t = 0; t < sec; t += 1 / 60) {
    const w = pts[Math.min(wi, pts.length - 1)];
    const dx = w.x - p.x, dy = w.y - p.y, d = Math.hypot(dx, dy);
    if (d < 12) { if (wi < pts.length - 1) { wi++; continue; } break; }
    p.x += (dx / d) * 255 / 60; p.y += (dy / d) * 255 * 0.74 / 60;
    C.resolve(p, 16);
    tr.push({ x: p.x, y: p.y });
  }
  return tr;
}

function building(name, x, y, fp, door, circles, wallR, gapW) {
  const C = new Collision(WORLD.width, WORLD.height);
  for (const [dx, dy, r] of circles) C.add(x + dx, y + dy, r, name);
  const poly = fp.map((q) => ({ x: x + q[0], y: y + q[1] }));
  C.addWalls(poly, wallR, name, [{ x: door.x, y: door.y, w: gapW }], true);
  return { C, poly };
}

console.log('촌장 사무실: the walls hold, the door lets him in');
{
  const O = WORLD.v42.office, x = O.x, y = O.y, L = om.floorLiftPx || 17;
  const door = { x: x + om.doorPoint[0], y: y + om.doorPoint[1] };
  const pad = { x: x + om.chiefDeskPad[0], y: y + om.chiefDeskPad[1] + L };
  const { C, poly } = building('office', x, y, om.footprintPoly, door, om.wallCircles, 8, 84);
  // the reviewer's runs: from behind (the back wall), from the east, from the hire pad (the front), from the north-west
  // ((v4.3 review SUITES-4) the same 8 starts around the office wherever its plot is: they were picked round (110, 810))
  const from = [[110, 671], [430, 790], [8, 891], [-200, 700], [150, 600], [380, 900], [-60, 960], [300, 700]].map(([a, b]) => [a + x - 110, b + y - 810]);
  let inside = 0;
  for (const [fx, fy] of from) {
    const tr = walk(C, fx, fy, pad.x, pad.y, 8);
    const end = tr[tr.length - 1];
    const onFloor = polyHas(poly, end.x, end.y - 0) && Math.hypot(end.x - pad.x, (end.y - pad.y) * 2) < 60;
    if (onFloor) inside++;
  }
  ok(inside === 0, 'straight at the 책상 pad from 8 sides: never through a wall (' + inside + ' got in)');
  const entry = { x: x + om.entryPoint[0], y: y + om.entryPoint[1] + L };
  const tr = walk(C, door.x + 40, door.y + 60, pad.x, pad.y, 10, [{ x: door.x, y: door.y + 6 }, entry]);
  const end = tr[tr.length - 1];
  ok(Math.hypot(end.x - pad.x, (end.y - pad.y) * 2) < 40, 'through the door (door → entry → pad) he reaches the 책상 pad', { end: [Math.round(end.x), Math.round(end.y)], pad: [Math.round(pad.x), Math.round(pad.y)] });
}

console.log('서리 은행: the front wall holds, the door lets him in');
{
  const B = WORLD.v42.bank, x = B.x, y = B.y;
  const door = { x: x + cm.doorPoint[0], y: y + cm.doorPoint[1] };
  const cp = { x: x + cm.counterPoints[1][0], y: y + cm.counterPoints[1][1] + 10 };
  const { C } = building('bank', x, y, cm.footprintPoly, door, [], 10, 112);
  const from = [[-322, 720], [-287, 700], [-200, 700], [-100, 620], [-500, 450], [-330, 380]];
  let inside = 0;
  for (const [fx, fy] of from) { const tr = walk(C, fx, fy, cp.x, cp.y, 8); const e = tr[tr.length - 1]; if (Math.hypot(e.x - cp.x, (e.y - cp.y) * 2) < 50) inside++; }
  ok(inside === 0, 'straight at the 창구 pad from 6 sides: never through a wall (' + inside + ' got in)');
  const tr = walk(C, door.x - 40, door.y + 60, cp.x, cp.y, 10, [{ x: door.x, y: door.y }, { x: door.x + 60, y: door.y - 40 }]);
  const e = tr[tr.length - 1];
  ok(Math.hypot(e.x - cp.x, (e.y - cp.y) * 2) < 40, 'through the door he reaches the 창구 pad', { end: [Math.round(e.x), Math.round(e.y)], pad: [Math.round(cp.x), Math.round(cp.y)] });
}

console.log('Collision.addWalls: a gap only where asked');
{
  const C = new Collision(WORLD.width, WORLD.height);
  const segs = C.addWalls([{ x: 1000, y: 1000 }, { x: 1400, y: 1000 }], 8, 't', [{ x: 1200, y: 1000, w: 80 }], false);
  ok(segs.length === 2, 'one wall with a door: two segments');
  ok(C.blocked(1100, 1000, 16) && !C.blocked(1200, 1000, 16), 'blocked on the wall, free in the door');
}

// ================================================================ (v4.3 step B, L1) the hall's plot beside the hut / office
// w_hall (180, 760) XL stands next to the hut's plot (v42_office): the hall's colliders exactly as TownBuilding.addCollision
// makes them (two circles along its footprint's long axis) with the hut's walls (ChiefHut, before the office) or the office's
// walls (after it). A chief (radius 16) walks from the hall's front square to the hut door / the office's hire pad and back
// past the hall to the plaza, and the lane between the two buildings stays open (≥ 3 chief widths)
console.log('마을회관 터 (w_hall) beside the hut / the office');
{
  const tm = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/town/manifest.json'), 'utf8')).sprites.town_hall;
  const H = WORLD.plots.w_hall, HUT = WORLD.v42.hut, O = WORLD.v42.office;
  const hallCircles = () => {
    const [X, Y] = tm.footprintM, long = Math.max(X, Y), short = Math.min(X, Y), n = Math.max(2, Math.min(4, Math.round(long / short + 0.6))), r = short * 0.5 * 45.25 * 1.1, out = [];
    for (let k = 0; k < n; k++) { const sx = (k / (n - 1) - 0.5) * (long - short), mx = X >= Y ? sx : 0, my = X >= Y ? 0 : sx; out.push([H.x + 45.25 * (mx + my), H.y + 22.63 * (mx - my), r]); }
    return out;
  };
  ok(!!(H && H.x === 180 && H.y === 760 && H.size === 'XL'), 'w_hall is the XL plot at (180, 760)', H);
  const front = { x: H.x - 140, y: H.y + 230 };          // the hall's front square (w_hall clear[0])
  const plaza = { x: WORLD.roads.nodes.plaza_w[0], y: WORLD.roads.nodes.plaza_w[1] };
  const hire = { x: O.hire[0], y: O.hire[1] };
  // (a) the hut (before the office): its walls + the hall
  {
    const C = new Collision(WORLD.width, WORLD.height);
    for (const [dx, dy, r] of HUT.walls) C.add(HUT.x + dx, HUT.y + dy, r, 'hut');
    const hc = hallCircles(); for (const [x, y, r] of hc) C.add(x, y, r, 'town_hall');
    const door = { x: HUT.x + HUT.door[0], y: HUT.y + HUT.door[1] };
    let gap = Infinity;
    for (const [hx, hy, hr] of hc) for (const [dx, dy, r] of HUT.walls) gap = Math.min(gap, Math.hypot(hx - HUT.x - dx, (hy - HUT.y - dy) * 2) - hr - r);
    ok(gap >= 3 * 32, 'hut and hall: the lane between them is ' + Math.round(gap) + ' ground px (≥ 3 chief widths)');
    const t1 = walk(C, front.x, front.y, door.x, door.y, 10, [{ x: H.x + 250, y: H.y + 160 }]), e1 = t1[t1.length - 1];
    ok(Math.hypot(e1.x - door.x, (e1.y - door.y) * 2) < 40, 'from the hall\'s front square the chief reaches the hut door', { end: [Math.round(e1.x), Math.round(e1.y)], door });
    const t2 = walk(C, door.x, door.y, plaza.x, plaza.y, 10), e2 = t2[t2.length - 1];
    ok(Math.hypot(e2.x - plaza.x, (e2.y - plaza.y) * 2) < 40, 'from the hut door to the plaza (plaza_w) past the hall', { end: [Math.round(e2.x), Math.round(e2.y)] });
  }
  // (b) the office (its walls and wall circles, as in the first section) + the hall
  {
    const L = om.floorLiftPx || 17, x = O.x, y = O.y;
    const door = { x: x + om.doorPoint[0], y: y + om.doorPoint[1] };
    const { C, poly } = building('office', x, y, om.footprintPoly, door, om.wallCircles, 8, 84);
    const hc = hallCircles(); for (const [hx, hy, r] of hc) C.add(hx, hy, r, 'town_hall');
    let gap = Infinity;
    for (const [hx, hy, hr] of hc) for (const q of poly) gap = Math.min(gap, Math.hypot(hx - q.x, (hy - q.y) * 2) - hr);
    ok(gap >= 3 * 32, 'office and hall: ' + Math.round(gap) + ' ground px between the hall\'s colliders and the office\'s corners (≥ 3 chief widths)');
    const t1 = walk(C, front.x, front.y, hire.x, hire.y, 10, [{ x: H.x + 250, y: H.y + 160 }]), e1 = t1[t1.length - 1];
    ok(Math.hypot(e1.x - hire.x, (e1.y - hire.y) * 2) < 40, 'from the hall\'s front square the chief reaches the office\'s hire pad (490, 745)', { end: [Math.round(e1.x), Math.round(e1.y)], hire });
    const entry = { x: x + om.entryPoint[0], y: y + om.entryPoint[1] + L }, pad = { x: x + om.chiefDeskPad[0], y: y + om.chiefDeskPad[1] + L };
    const t2 = walk(C, hire.x, hire.y, pad.x, pad.y, 10, [{ x: door.x, y: door.y + 6 }, entry]), e2 = t2[t2.length - 1];
    ok(Math.hypot(e2.x - pad.x, (e2.y - pad.y) * 2) < 40, 'from the hire pad through the office door to the 책상 pad, the hall beside it', { end: [Math.round(e2.x), Math.round(e2.y)] });
    const hallIn = hc.some(([hx, hy, r]) => polyHas(poly, hx, hy) || Math.hypot(hx - hire.x, (hy - hire.y) * 2) < r + 86);
    ok(!hallIn, 'the hall\'s colliders stay off the office floor and off the hire pad\'s floor');
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
