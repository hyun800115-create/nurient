// =====================================================================
//  탈것 지도 (vehicles_runtime layout, docs/v5_v8_plan.md §4.2 / §6.3) — 길·정류장·차고지·화물장·신호등·배달 장소
//  좌표는 v4 '도로 격자' 그대로예요:  L(i, j) = (3120 + 64·(i + j),  1315 + 32·(i − j))
//    i = 화면 오른쪽 아래 (기찻길 방향),  j = 화면 오른쪽 위 (바다 쪽이 +).  한 칸 = √2 m.
//  건물은 모두 j 가 작은 쪽(화면 왼쪽 아래)을 바라봐요. 정류장은 길의 +j 쪽 인도에 있어요 (버스는 서쪽으로 가며 서요).
//  자리를 옮길 때는 숫자만 고치세요 (그다음 node --test tools/test/vehicles_lab/ 로 확인).
//  게임에 붙일 때 이 파일은 WORLD.v5 가 돼요 (P19). 길은 지어질 때 WORLD.v4.streets 에 덧붙여져요.
// =====================================================================

import { WORLD } from '../data/world.js';

export const G = [3120, 1315];
/** lattice (i, j) -> px [x, y] (not rounded) */
export function L(i, j) { return [G[0] + 64 * (i + j), G[1] + 32 * (i - j)]; }
/** px -> lattice { i, j } */
export function px2L(x, y) { const a = (x - G[0]) / 64, b = (y - G[1]) / 32; return { i: (a + b) / 2, j: (a - b) / 2 }; }
const P = (i, j) => { const [x, y] = L(i, j); return { x: Math.round(x), y: Math.round(y), i, j }; };

// ---------------------------------------------------------------------------------------------- 길 (RoadNet 형식)
//  cls 'dirt' + paint = 처음 칠하는 칸, eup = 읍(돌길)·도시(아스팔트) 때 쓰는 칸.  when = 무엇을 지으면 생기는지
//  conn_* = 서리 큰길 (광장 동문 ↔ 서리역), bank_st = 은행길, ave_s = 중앙로 남쪽
export const V5_STREETS = [
  { id: 'conn_e',   axis: 'x', i: [-5, 8],      j: [-8, -4],      cls: 'dirt', paint: [-8, -4], name: 'st_conn', when: 'depot' },      // 큰길 동쪽 (역 앞 ↔ 꺾이는 곳)
  { id: 'conn_w',   axis: 'x', i: [-17, -5],    j: [-5, -1],      cls: 'dirt', paint: [-5, -1], name: 'st_conn', when: 'road' },       // 큰길 서쪽 (광장 동문 쪽)
  { id: 'conn_jog', axis: 'y', i: [-7, -3],     j: [-8, -1],      cls: 'dirt', paint: [-7, -3], paintSpan: [-8, -1], name: 'st_conn', when: 'road' },   // 큰길 꺾이는 곳
  { id: 'bank_st',  axis: 'x', i: [23.1, 40.9], j: [-24.2, -22.2], cls: 'dirt', paint: [-24.2, -22.2], name: 'st_bank', when: 'depot' },  // 은행길 (기억의 정원 · 마구간 · 은행 · 버스 차고지 앞)
  { id: 'ave_s',    axis: 'y', i: [30, 34],     j: [-22.2, -18],  cls: 'dirt', paint: [30, 34], paintSpan: [-23.2, -18], name: 'st_ave', when: 'depot' },  // 중앙로 남쪽 (은행길까지)
];
//  읍·도시 때 쓰는 칸 (RoadNet 의 eup 형식: road = 찻길, walk = 인도 목록)
export const V5_EUP = {
  conn_e: { road: [-8, -4], walk: [[-4, -3]] },
  conn_w: { road: [-5, -1] },
  conn_jog: { road: [-7, -3] },
  bank_st: { road: [-24.2, -22.2] },
  ave_s: { road: [30, 34] },
};
/** streets that exist for the built flags (v4's main / back / ave are always there) */
export function streetsFor(built) {
  return V5_STREETS.filter((s) => !s.when || !!(built && built[s.when]));
}

// ---------------------------------------------------------------------------------------------- 정류장
//  at = 표지판(정류장 그림)의 격자 자리.  sign: shelter = 정류장 집 (썰매 정류장 → 버스 정류장), pole = 표지판 기둥,
//  town = 솔방울 마을에 원래 있던 썰매 정류장 (도시가 되면 옆에 버스 표지판이 생겨요).  free = 공짜 정류장
export const STOPS = {
  S1: { at: [-15, -0.45], street: 'conn_w', sign: 'shelter', name: { ko: '서리 광장 앞', en: 'Frost Plaza' }, side: 'village' },
  S2: { at: [-0.1, -3.6], street: 'conn_e', sign: 'shelter', name: { ko: '서리역', en: 'Frost Station' }, free: true, side: 'town' },
  S3: { at: [31.7, -1.9], street: 'main', sign: 'town', name: { ko: '솔방울 분수', en: 'Pinecone Fountain' }, free: true, side: 'town' },
  S4: { at: [41.6, -11.85], street: 'back', sign: 'pole', name: { ko: '솔방울 학교', en: 'Pinecone School' }, side: 'town' },
  S5: { at: [34.15, -22.05], street: 'bank_st', sign: 'pole', name: { ko: '은행 앞', en: 'Bank' }, side: 'town' },
};
for (const id in STOPS) { const s = STOPS[id]; const [x, y] = L(s.at[0], s.at[1]); s.x = Math.round(x); s.y = Math.round(y); s.id = id; }

// ---------------------------------------------------------------------------------------------- 버스 노선
//  stops = 서는 순서 (한 바퀴). terminal = 시간표 맞추는 정류장 (여기서 잠깐 쉬어요).
//  needs = 있어야 다니는 것. short = 서리 큰길이 없을 때 도는 짧은 노선
export const LINES = {
  1: { stops: ['S3', 'S2', 'S1'], terminal: 'S1', needs: ['depot'], short: { without: 'road', stops: ['S3', 'S2'], terminal: 'S2' }, name: { ko: '1번 버스', en: 'Bus 1' }, color: 0xe2574c },
  2: { stops: ['S2', 'S4', 'S5'], terminal: 'S2', needs: ['depot', 'stop:S4', 'stop:S5'], name: { ko: '2번 버스', en: 'Bus 2' }, color: 0x3f8fd6 },
  // v6: 3번 S3 → 항구 시장 → 여객선 터미널, v7: 4번 항구 → 해변 입구 (그 동네 길이 생기면 다녀요)
  3: { stops: ['S3', 'H1', 'H2'], terminal: 'S3', needs: ['v6'], name: { ko: '3번 버스', en: 'Bus 3' }, color: 0x46b07a },
  4: { stops: ['H2', 'B1'], terminal: 'H2', needs: ['v7'], name: { ko: '4번 버스', en: 'Bus 4' }, color: 0xf0a63a },
};

// ---------------------------------------------------------------------------------------------- 건물 (차고지·화물장)
//  row D (은행길 북쪽): 기억의 정원 · 마구간 차고지(도시 → 주유소) · 은행 · 버스 차고지
export const BUILDINGS = {
  stable:   { key: 'stable_depot', at: [27.66, -19.71], era: 2, swapTo: 'fuel_depot', street: 'bank_st' },
  busDepot: { key: 'bus_depot', at: [40.77, -20.14], era: 3, street: 'bank_st', doors: 'bus_depot_open' },
  yard:     { key: 'crate_stack', px: [1814, 1072], street: 'conn_w' },   // 서리 화물장 (광장 동문 120 px 아래)
};
for (const k in BUILDINGS) { const b = BUILDINGS[k]; if (b.at) { const [x, y] = L(b.at[0], b.at[1]); b.x = Math.round(x); b.y = Math.round(y); } else { b.x = b.px[0]; b.y = b.px[1]; } }

// ---------------------------------------------------------------------------------------------- 신호등 (도시)
//  큰길 × 중앙로 교차로. 신호등 그림 두 개: traffic_light 는 −Y(왼쪽 아래)를 봐요 → 중앙로에서 올라오는 차가 봐요,
//  traffic_light_b 는 +X(오른쪽 아래)를 봐요 → 큰길을 서쪽으로 오는 차가 봐요
export const LIGHTS = [
  { node: [32, -6], poles: [{ key: 'traffic_light', at: [34.45, -8.45], axis: 'y' }, { key: 'traffic_light_b', at: [34.45, -3.55], axis: 'x' }] },
];

// ---------------------------------------------------------------------------------------------- 주차 (도시)
//  주차장 (지을 수 있어요, 4칸) + 길가 주차칸 (stall_lines).  dir = 차가 서 있는 방향
export const PARKING = {
  lot: { key: 'parking_lot_s', at: [27.2, -27.0] },
  bays: [
    { at: [34.6, -25.6], dir: 'SE' }, { at: [37.6, -25.6], dir: 'SE' },
    { at: [-1.4, -9.7], dir: 'SE' }, { at: [1.6, -9.7], dir: 'SE' },
  ],
};
for (const b of PARKING.bays) { const [x, y] = L(b.at[0], b.at[1]); b.x = Math.round(x); b.y = Math.round(y); }
{ const [x, y] = L(PARKING.lot.at[0], PARKING.lot.at[1]); PARKING.lot.x = Math.round(x); PARKING.lot.y = Math.round(y); }

// ---------------------------------------------------------------------------------------------- 장소 (배달·짐)
const V4 = WORLD.v4 || {};
const town = {};
for (const b of ((V4.town && V4.town.buildings) || [])) town[b.id] = b;
const stationOf = (id) => (WORLD.stations || []).find((s) => s.id === id);
const R = (WORLD.roads && WORLD.roads.nodes) || {};
/** a town building's front (its door side, toward the street) */
const front = (id, dj = -1.4) => { const b = town[id]; return b ? P(b.i, b.j + dj) : null; };
const node = (k, dx = 0, dy = 0) => (R[k] ? { x: R[k][0] + dx, y: R[k][1] + dy } : null);

export const PLACES = {
  'p:yard':        { x: BUILDINGS.yard.x, y: BUILDINGS.yard.y, name: { ko: '서리 화물장', en: 'Frost freight yard' } },
  // curb = 차가 서는 곳 (서리역 정류장 S2 보다 동쪽: 버스와 화물차가 겹치지 않게)
  'p:cargo':       Object.assign(P(V4.square ? V4.square.cargo.i : 4.1, V4.square ? V4.square.cargo.j : -1.8), { curb: P(6.2, -4.6), name: { ko: '서리역 짐 싣는 곳', en: 'Station cargo pad' } }),
  'p:stable':      Object.assign(P(26.74, -21.6), { name: { ko: '마구간 차고지', en: 'Stable depot' } }),
  'p:busDepot':    Object.assign(P(40.0, -22.4), { name: { ko: '버스 차고지', en: 'Bus depot' } }),
  'p:cafe':        Object.assign(front('t_cafe') || P(21, -3.3), { name: { ko: '역앞 카페', en: 'Station café' } }),
  'p:town_rest':   Object.assign(front('t_rest') || P(45.8, -3.3), { name: { ko: '솔방울 식당', en: 'Pinecone restaurant' } }),
  'p:toy':         Object.assign(front('t_toy') || P(35.3, -3.3), { name: { ko: '장난감 가게', en: 'Toy shop' } }),
  'p:cloth':       Object.assign(front('t_cloth') || P(37.9, -3.3), { name: { ko: '옷 가게', en: 'Clothes shop' } }),
  'p:flower':      Object.assign(front('t_flower') || P(40.5, -3.3), { name: { ko: '꽃집', en: 'Flower shop' } }),
  'p:book':        Object.assign(front('t_book') || P(23.5, -3.3), { name: { ko: '책방', en: 'Bookshop' } }),
  'p:clinic':      Object.assign(front('t_clinic', -1.3) || P(46.8, -11.8), { name: { ko: '솔방울 병원', en: 'Pinecone clinic' } }),
  'p:school':      Object.assign(front('t_school', -1.3) || P(39.3, -11.8), { name: { ko: '솔방울 학교', en: 'Pinecone school' } }),
  'p:mail_square': Object.assign(P(6.2, -3.4), { name: { ko: '서리역 우체통', en: 'Station mailbox' } }),
  'p:mail_east':   Object.assign(node('east_link') || { x: 1600, y: 930 }, { name: { ko: '동쪽 길 우체통', en: 'East path mailbox' } }),
  'p:mail_farm':   Object.assign(node('farm_link') || { x: 1196, y: 1158 }, { name: { ko: '밭 앞 우체통', en: 'Farm mailbox' } }),
  'p:mail_forest': Object.assign(node('forest_link') || { x: 772, y: 1148 }, { name: { ko: '숲 앞 우체통', en: 'Forest mailbox' } }),
  'p:herbalist':   Object.assign(node('w_x') || { x: -470, y: 1190 }, { name: { ko: '서쪽 숲마을 약초꾼', en: 'Herbalist (west wood)' } }),
  'p:big_rest':    Object.assign(node('w_rest') || { x: -330, y: 900 }, { name: { ko: '큰 식당', en: 'Big restaurant' } }),
  'p:hall':        Object.assign(node('w_front') || { x: -880, y: 2110 }, { name: { ko: '마을회관', en: 'Village hall' } }),
  'p:bakery':      Object.assign((() => { const s = stationOf('bakery'); return s ? { x: s.x - 118, y: s.y + 60 } : { x: 1290, y: 1330 }; })(), { name: { ko: '빵집', en: 'Bakery' } }),
};

// ---------------------------------------------------------------------------------------------- 촌장 배달 운전 (미션 B1–B12)
//  route 이름 → 출발 장소 + 들르는 장소들.  vehicle 은 미션이 정해요 (dog_sled / truck_cargo_chief)
//  shops 는 그때 문을 연 가게들 (ports.freight.shopTargets) 중 4곳, 없으면 아래 목록.  ver = 그 버전부터
export const DRIVE_ROUTES = {
  mail:      { start: 'p:yard', stops: ['p:mail_east', 'p:mail_farm', 'p:mail_square', 'p:cafe'], icon: 'item_letter' },
  herbs:     { start: 'p:yard', stops: ['p:herbalist', 'p:clinic'], icon: 'item_herb' },
  cafe:      { start: 'p:yard', stops: ['p:cafe'], icon: 'item_bread' },
  shops:     { start: 'p:yard', stops: ['p:book', 'p:toy', 'p:cloth', 'p:flower'], dynamic: 'shops', icon: 'item_goods' },
  lunch:     { start: 'p:yard', stops: ['p:big_rest', 'p:town_rest'], icon: 'item_fish_cooked' },
  cake:      { start: 'p:yard', stops: ['p:bakery', 'p:hall'], icon: 'item_cake' },
  export:    { start: 'p:yard', stops: ['h:warehouse', 'h:export', 'h:export'], ver: 6 },
  auction:   { start: 'p:yard', stops: ['h:auction'], ver: 6 },
  icecream:  { start: 'p:yard', stops: ['b:icecream'], ver: 7 },
  hotel:     { start: 'h:ferry', stops: ['b:hotel'], ver: 7 },
  logistics: { start: 'c:logistics', stops: ['p:book', 'p:toy', 'p:cloth', 'p:flower'], ver: 8 },
  furniture: { start: 'c:logistics', stops: ['p:town_home'], ver: 8 },
};

// ---------------------------------------------------------------------------------------------- 개썰매 눈길 (마을 길)
//  마을의 눈길(WORLD.roads)도 촌장님 탈것(개썰매·촌장 트럭)은 달릴 수 있어요. 광장 한가운데(plaza_c)와 바닷가는 빼요.
//  link = 서리 큰길 서쪽 끝(격자)과 마을 길 점을 잇는 짧은 눈길
export const TRACK_LINK = { node: 'east_gate', lattice: [-17, -3] };
const NO_TRACK = /^(plaza_c|beach_|gap_n)/;
/**
 * sled tracks from the v2 road graph: [{ id, a, b, pts: [[x, y]...] }] (both ends are graph node names; `open(edge)`
 * says whether that edge's zone / region is open). Edges through the middle of the plaza and the beach are left out.
 */
export function sledTracks(roads, open) {
  const N = (roads && roads.nodes) || {}, out = [];
  for (const e of (roads && roads.edges) || []) {
    const [a, b, o = {}] = e;
    if (!N[a] || !N[b] || NO_TRACK.test(a) || NO_TRACK.test(b)) continue;
    if (o.walk === false) continue;
    if (open && !open(o)) continue;
    out.push({ id: a + '~' + b, a, b, pts: [N[a]].concat(o.via || [], [N[b]]).map((p) => [p[0], p[1]]) });
  }
  if (N[TRACK_LINK.node]) {
    const [x, y] = L(TRACK_LINK.lattice[0], TRACK_LINK.lattice[1]);
    out.push({ id: 'link~' + TRACK_LINK.node, a: TRACK_LINK.node, b: '@road', pts: [N[TRACK_LINK.node].slice(), [Math.round(x), Math.round(y)]], road: TRACK_LINK.lattice.slice() });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------- 도시 승격식 (탈것 몫)
//  아스팔트로 바뀌는 길 (안쪽부터 바깥으로 물결처럼) + 신호등
export const CITY_UPGRADE = { streets: ['main', 'ave', 'back', 'conn_e', 'conn_w', 'conn_jog', 'ave_s', 'bank_st'], centre: [32, -6] };
