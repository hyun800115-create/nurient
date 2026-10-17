// geumbang_lab world (shared by the Node tests and the lab page): the stand-in neighbourhood the 금방 module runs
// on — the real v4 솔방울 마을 street grid (WORLD.v4 at 읍: main / back / ave cobble, RoadNet with the town's door
// spurs), the v4.2 depot at WORLD.v42.depot, the households of the town buildings (TownSim's home capacities split
// into families) and the district lots, plus a small stand-in 서리마을 lane of four log cabins west of the station
// with a village sled track from the 역앞 금방 정류장 (G1b). Nothing here is game code; nothing here changes a file.

import { WORLD, L4 } from '../../../src/data/world.js';
import { RoadNet } from '../../../src/systems/RoadNet.js';
import { LaneGraph } from '../../../src/vehicles/model/lanes.js';
import { mulberry32Lab } from './lab_rng.js';

const SURN = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍'];
const GIVEN = ['민지', '서준', '하은', '도윤', '지우', '예준', '수아', '시우', '지호', '서연', '하준', '윤서', '유나', '건우', '채원', '은우'];

/** the old-village stand-in: cabins (log houses from assets/buildings) on a sled track west of the station */
export const VILLAGE = {
  // node ids -> px (the stand = the 역앞 금방 정류장 at lattice (6.0, −6.5)); a lane south-west of the stand
  nodes: { st: L4(6.0, -6.5), v1: [2960, 1790], v2: [2800, 1712], v3: [2630, 1790], v4: [2790, 1880] },
  edges: [['st', 'v1'], ['v1', 'v2'], ['v2', 'v3'], ['v1', 'v4'], ['v4', 'v3']],
  stand: 'st',
  // log cabins (assets/buildings house_a / b / c), doors on the lane (≤ 2.5 m from a node)
  cabins: [
    { aid: 'vh1', key: 'house_a', x: 2905, y: 1650, flip: false, fam: '어부', kind: 'fisher' },
    { aid: 'vh2', key: 'house_b', x: 2690, y: 1640, flip: true, fam: '광부', kind: 'miner' },
    { aid: 'vh3', key: 'house_c', x: 2585, y: 1868, flip: true, fam: '할머니', kind: 'elder' },
    { aid: 'vh4', key: 'house_a', x: 2905, y: 1920, flip: false, fam: '아이', kind: 'child' },
  ],
};

/** doors of the town buildings + lots (the game's Neighbours rule) */
export function townDoors(V, doorPointOf) {
  const doors = [];
  for (const b of V.town.buildings) { const d = doorPointOf(b.key); if (d) doors.push({ id: b.id, x: b.x + d[0], y: b.y + d[1] }); }
  for (const id in V.lots) { const l = V.lots[id]; const [x, y] = L4(l.i, l.j - l.m[1] / 2 / Math.SQRT2 - 0.2); doors.push({ id, x, y }); }
  return doors;
}

/** the v4 roads at 읍 + the vehicles module's lane graph (opts.inPlace: the lab page paints WORLD.v4 itself) */
export function makeRoads(doorPointOf, opts = {}) {
  const V = opts.inPlace ? WORLD.v4 : Object.assign({}, WORLD.v4, { streets: WORLD.v4.streets.slice(), eup: Object.assign({}, WORLD.v4.eup) });
  const doors = townDoors(V, doorPointOf);
  const rn = new RoadNet(V, { doors });
  for (const id of ['main', 'back', 'ave']) rn.upgrade(id, opts.cls || 'cobble');
  for (const id of WORLD.v4.eup.sidewalks || []) rn.upgrade(id, 'sidewalk');
  const lg = new LaneGraph(rn);
  return { rn, lg, V, doors };
}

/** a person */
function person(r, pid, kind, fam) {
  const name = kind === 'elder' ? (fam || SURN[Math.floor(r() * SURN.length)]) + ' 할머니' : SURN[Math.floor(r() * SURN.length)] + GIVEN[Math.floor(r() * GIVEN.length)];
  const favs = ['item_bread', 'item_fish_cooked', 'item_meat_cooked', 'item_bread', 'item_can'];
  return { pid, name, kind, fav: favs[Math.floor(r() * favs.length)] };
}

/**
 * the address entries the module's AddressBook reads (the ports_v4 shape): homes of the town buildings with their
 * households, the district lots, the village cabins. Seeded: the same seed gives the same families.
 */
export function makeEntries(doors, opts = {}) {
  const r = mulberry32Lab(opts.seed || 4343);
  const V = WORLD.v4;
  const entries = [];
  let pidN = 0;
  const pid = () => 'p' + (++pidN);
  const doorOf = (id) => doors.find((d) => d.id === id);
  for (const b of V.town.buildings) {
    if (!b.home || b.role === 'station') continue;
    const d = doorOf(b.id);
    if (!d) continue;
    const kind = b.role === 'home' ? 'apt' : b.role === 'shop' ? 'shop' : b.role === 'hall' ? 'hall' : b.role === 'fire' ? 'fire' : 'house';
    const households = [];
    let left = Math.round(b.home * (opts.fill || 0.75));
    let h = 0;
    while (left > 0) {
      const size = kind === 'apt' ? Math.min(left, 1 + Math.floor(r() * 3)) : left;
      const people = [];
      const elder = kind === 'apt' && r() < 0.22, kids = kind === 'apt' && size >= 2 && r() < 0.4;
      for (let k = 0; k < size; k++) people.push(person(r, pid(), k === 0 && elder ? 'elder' : k === size - 1 && kids ? 'child' : kind === 'shop' ? 'keeper' : 'adult'));
      households.push({ hid: b.id + ':' + (h++), people, name: people[0].name.split(' ')[0] });
      left -= size;
    }
    // 정 할머니 lives in 아파트 2동 (the first order's household)
    if (b.id === 't_apt2') households.unshift({ hid: 't_apt2:jeong', people: [{ pid: 'jeong', name: '정 할머니', kind: 'elder', fav: 'item_bread' }], name: '정 할머니', first: true });
    entries.push({ aid: b.id, kind, name: 'gb_' + b.id, door: { x: d.x, y: d.y }, doorNode: 'd:' + b.id, households, key: b.key, bx: b.x, by: b.y });
  }
  for (const id of Object.keys(V.lots).sort()) {
    const l = V.lots[id];
    const d = doorOf(id);
    if (!d) continue;
    const shop = l.size !== 'S';
    if (opts.lots === false) continue;
    const size = shop ? 2 : 1 + Math.floor(r() * 3);
    const people = [];
    for (let k = 0; k < size; k++) people.push(person(r, pid(), shop && k === 0 ? 'keeper' : k === 2 ? 'child' : 'adult'));
    entries.push({ aid: id, kind: shop ? 'shop' : 'house', name: id, door: { x: d.x, y: d.y }, doorNode: 'd:' + id, households: [{ hid: id + ':0', people, name: people[0].name }], lot: true });
  }
  if (opts.village !== false) {
    for (const c of VILLAGE.cabins) {
      const people = [person(r, pid(), c.kind === 'elder' ? 'elder' : 'adult', c.kind === 'elder' ? '송' : null)];
      if (c.kind === 'child') people.push(person(r, pid(), 'child'));
      if (c.kind === 'fisher' || c.kind === 'miner') people[0].kind = c.kind;
      const dp = { house_a: [-63, 32], house_b: [-57, 46], house_c: [-74, 26] }[c.key] || [-60, 30];
      entries.push({ aid: c.aid, kind: 'village', name: 'gb_village', door: { x: c.x + (c.flip ? -dp[0] : dp[0]), y: c.y + dp[1] }, households: [{ hid: c.aid + ':0', people, name: people[0].name }], cabin: c });
    }
  }
  return entries;
}

/** the village graph in the model's format ({ nodes: { id: [x, y] }, edges, stand }) with the cabins' doors */
export function villageGraph() { return { nodes: Object.assign({}, VILLAGE.nodes), edges: VILLAGE.edges.slice(), stand: VILLAGE.stand }; }

export { WORLD, L4 };
