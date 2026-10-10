// =====================================================================
//  갈매기 항구 지도 (harbor_runtime layout, docs/v5_v8_plan.md §4.1 / §4.3)
//  게임에 붙일 때 이 표가 src/data/world.js 의 WORLD.v6 으로 옮겨져요 (P19).
//  좌표는 v4 와 같은 격자예요:  L(i, j) = (3120 + 64·(i + j),  1315 + 32·(i − j))
//    i = 화면 오른쪽 아래로 (기찻길 방향),  j = 화면 오른쪽 위로 (북쪽 바다 쪽이 +)
//    한 칸 = √2 m = 화면 128 x 64 마름모.  바다 물높이는 땅보다 30 px 아래예요 (WATER_PX).
//  항구는 마을 동쪽의 따뜻한 남쪽 바다에 있어요. 건물은 모두 바다(−j, 화면 왼쪽 아래)를 바라봐요.
// =====================================================================
// Pure data + geometry helpers (no Phaser). Engineering notes in English.

export const G = [3120, 1315];
/** lattice (i, j) -> world px [x, y] at land level (float) */
export const L = (i, j) => [G[0] + 64 * (i + j), G[1] + 32 * (i - j)];
/** like world.js L4: rounded px */
export const LR = (i, j) => { const p = L(i, j); return [Math.round(p[0]), Math.round(p[1])]; };
/** world px (land level) -> lattice { i, j } */
export const px2L = (x, y) => { const a = (x - G[0]) / 64, b = (y - G[1]) / 32; return { i: (a + b) / 2, j: (a - b) / 2 }; };
/** sea surface: 30 px below land level (assets/harbor waterPx, Water.js WATER_PX) */
export const WATER_PX = 30;
/** a point ON THE WATER at lattice (i, j): its screen px */
export const W = (i, j) => { const p = L(i, j); return [p[0], p[1] + WATER_PX]; };
/** screen px of a water-plane point -> lattice */
export const wpx2L = (x, y) => px2L(x, y - WATER_PX);
/** one lattice cell along an axis = this many screen px (√(64² + 32²)) */
export const PX_PER_CELL = Math.hypot(64, 32);
export const CELL_M = Math.SQRT2;
const r2 = (v) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------------------------------------- the south sea (§4.1)
// 바다 = i > 55 이고 j < southJ(i) 인 곳.  안벽(quay) j −12 (i 55~86), 바위 곶 (i 86~90), 그 동쪽은 해안 j −19.
export const SEA = { westI: 55, quayJ: -12, rock: [86, 90], coastJ: -19 };
export function southJ(i) {
  if (i <= SEA.westI) return -Infinity;               // 서쪽 = 땅 (항구 서쪽 벽 i 55)
  if (i <= SEA.rock[0]) return SEA.quayJ;             // 안벽
  if (i < SEA.rock[1]) return SEA.quayJ + (SEA.coastJ - SEA.quayJ) * (i - SEA.rock[0]) / (SEA.rock[1] - SEA.rock[0]);  // 바위 곶
  return SEA.coastJ;                                   // 동쪽 해안 (v7 에 모래사장)
}
/** shore type of the land edge at lattice i (Water.js SHORE_TYPES) */
export function shoreAt(i) { return i <= SEA.rock[0] ? 'quay' : i < SEA.rock[1] ? 'rock' : 'snowbank'; }

// 방파제: j −22 줄, 서쪽 i 59 ~ 동쪽 i 70 (끝은 둥근 머리 + 초록 등대). 입구(뱃길) = i 70 ~ 86.
//  (plan §4.1 said i 57 … 80. Changed for two physical reasons, see the build report §"Map changes":
//   a 21 m cargo ship (14.9 cells) cannot turn inside a 8.7-cell-deep basin, so it is pushed in SIDEWAYS through a
//   mouth wider than its length (16 cells); and the root starts at i 59 so the deep-sea trawler (14 m) fits its
//   berth along the basin's west wall, leaving that end to the open sea behind the trawler.)
export const BREAKWATER = { j: -22, i0: 59, i1: 70, half: 1.27, crown: 0.46 };
export const MOUTH = { i0: 70, i1: 86, j: -22 };
/** footprint rect of the breakwater (lattice) */
export const BREAKWATER_RECT = { i0: BREAKWATER.i0, i1: BREAKWATER.i1, j0: BREAKWATER.j - BREAKWATER.half, j1: BREAKWATER.j + BREAKWATER.half };
/** the shipyard slipway runs 0.64 cells (0.9 m) out over the water */
export const SLIP_RECT = { i0: 55.4, i1: 60.35, j0: -12.64, j1: -12 };

export function onBreakwater(i, j) { const b = BREAKWATER_RECT; return i >= b.i0 && i <= b.i1 && j >= b.j0 && j <= b.j1; }
/** is lattice (i, j) open water (no land, breakwater or slipway)? */
export function isSea(i, j) {
  if (!(i > SEA.westI && j < southJ(i))) return false;
  if (onBreakwater(i, j)) return false;
  const s = SLIP_RECT;
  if (i >= s.i0 && i <= s.i1 && j >= s.j0) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------- regions (§4.1, P16/P19)
export const REGIONS = {
  harbor:   { rect: [6144, 0, 10752, 4600], name: 'r_harbor' },
  harbor_w: { rect: [5200, 3450, 6144, 4600], openWith: 'harbor', name: 'r_harbor' },
};
export const WORLD_V6 = { width: 10752, height: 4864 };

// ---------------------------------------------------------------------------------------------- buildings (§4.3)
//  step = 몇 번째 '항구 살리기' 에서 다시 살아나는지 (그 전에는 낡은 회색 건물)
const B = (id, key, i, j, step, extra = {}) => { const [x, y] = LR(i, j); return Object.assign({ id, key, i, j, x, y, step }, extra); };
export const BUILDINGS = [
  // 안벽 줄 (앞 = 안벽, j −12)
  B('h_shipyard', 'shipyard', 57.87, -10.23, 6, { role: 'shipyard' }),
  B('h_ferry_terminal', 'ferry_terminal', 62.91, -10.59, 4, { role: 'terminal' }),
  B('h_fish_auction', 'fish_auction', 67.60, -10.59, 2, { role: 'auction' }),
  B('h_customs_house', 'customs_house', 71.57, -10.73, 5, { role: 'customs' }),
  B('h_harbor_warehouse', 'harbor_warehouse', 75.69, -10.37, 5, { role: 'warehouse' }),
  B('h_harbor_crane', 'harbor_crane', 79.39, -11.08, 5, { role: 'crane' }),
  // 둘째 줄 (바닷가 큰길 북쪽, 앞 j −3.2)
  B('h2_harbor_market', 'harbor_market', 57.98, -2.21, 4, { role: 'market' }),
  B('h2_seafood_restaurant', 'seafood_restaurant', 62.43, -2.07, 4, { role: 'restaurant' }),
  //  (선원 숙소 · 항구 사무소는 계획표(§4.3)보다 동쪽으로 1.25 칸: 건널목(k 65)에서 큰길로 내려오는 골목 i 65~66 이
  //   숙소 바닥을 지나갔어요. 이제 골목은 식당과 숙소 사이로 지나가요.)
  B('h2_sailor_lodge', 'sailor_lodge', 67.36, -2.14, 1, { role: 'lodge', home: 12 }),
  B('h2_harbor_office', 'harbor_office', 70.95, -2.14, 1, { role: 'office', home: 4 }),
  // 항구역 (기찻길 북쪽) · 등대 (바위 곶)
  B('h_station', 'train_station', 62.00, 2.03, 1, { role: 'station' }),
  B('h_lighthouse', 'lighthouse', 88.40, -11.40, 3, { role: 'lighthouse' }),
];
export const BLD = Object.fromEntries(BUILDINGS.map((b) => [b.id, b]));

// ---------------------------------------------------------------------------------------------- rail + coast line (§4.3, D8)
//  기찻길을 k 46 → 98 로 이어요 (끝 차막이 k 98). 건널목 = 8, 33 (v4) + 65 (항구), 97 (해변).
export const RAIL = { from: -1, to: 98, toV4: 46, crossings: [8, 33, 65, 97], sign: { i: 46.6, j: -1.2 } };
//  해안선 기차 (coast): 솔방울 동쪽 정거장 ↔ 항구역 (↔ 해변역, v7). carA = 손님 칸이 서는 i (기관차는 서쪽 끝).
export const COAST = {
  stops: {
    halt: { carA: 37.5, name: { ko: '솔방울 동쪽', en: 'Pinecone East' } },
    harbor: { carA: 62, name: { ko: '항구역', en: 'Harbour Stn' } },
    beach: { carA: 94, name: { ko: '해변역', en: 'Beach Stn' } },
  },
  order: ['halt', 'harbor', 'beach'],
  // the v4 main line's car offsets (Rail.consist): engine −2.34, car_a 0, car_b +2.24 · nose −1.3 / tail +1.15 m
  consist: [{ key: 'train_engine', off: -2.34 }, { key: 'train_car_a', off: 0 }, { key: 'train_car_b', off: 2.24 }],
  nose: 1.3, tail: 1.15,
};
//  솔방울 동쪽 정거장의 소품 (새 그림 없이: 의자, 쌍가로등, 표지판) · 승강장 = j 1.25 걷는 길
export const HALT_PROPS = [['bench_x', 36.4, 1.7], ['streetlight_double', 38.9, 1.0], ['signpost', 35.6, 1.3]];

// ---------------------------------------------------------------------------------------------- streets (P19: appended to WORLD.v4.streets)
export const STREETS = [
  { id: 'blvd_h', axis: 'x', i: [49.5, 86.0], j: [-9.0, -3.0], cls: 'dirt', paint: [-8.0, -4.0], walk: -3.6, walkSpan: [49.5, 86.0], region: 'harbor', name: 'st_blvd_h' },   // 바닷가 큰길
  { id: 'xing_h', axis: 'y', i: [65.0, 66.0], j: [-0.75, 1.0], cls: 'xing', walk: 65.5, walkSpan: [-0.75, 1.25], xing: 65, region: 'harbor', name: 'st_xing' },              // 항구 건널목
  { id: 'alley_h', axis: 'y', i: [65.0, 66.0], j: [-3.0, -0.75], cls: 'path', walk: 65.5, walkSpan: [-3.6, -0.75], region: 'harbor', name: 'st_alley' },                      // 건널목 → 큰길
  { id: 'platform_h', axis: 'x', i: [58.5, 66.0], j: [0.75, 1.75], cls: 'path', walk: 1.25, walkSpan: [58.5, 65.5], region: 'harbor', name: 'st_platform' },                 // 항구역 승강장
  { id: 'quay_h', axis: 'x', i: [55.5, 86.0], j: [-8.75, -8.0], cls: 'path', walk: -8.4, walkSpan: [55.6, 85.5], region: 'harbor', name: 'st_quay' },                        // 안벽 뒤 골목
];
//  도시(rank 3) 에서는 아스팔트 2차로 + 북쪽 보도 (v4 eup 와 같은 모양)
export const STREETS_EUP = { blvd_h: { road: [-8.0, -4.0], walk: [[-4.0, -3.0]], cls: 'asphalt' }, sidewalks: ['alley_h', 'platform_h', 'quay_h'] };

// ---------------------------------------------------------------------------------------------- pads, spots, props
//  export = 수출 짐 놓는 곳 (크레인 동쪽 안벽), auction = 촌장님 생선 경매 발판, imports = 수입 상자 쌓는 곳
export const PADS = {
  export: { i: 83.0, j: -10.1 },
  auction: { i: 66.6, j: -8.6 },
  trawler: { i: 59.9, j: -8.75 },       // 원양어선 주문 발판 (조선소 뒤)
};
export const SPOTS = {
  importPile: { i: 77.0, j: -9.35 },    // 창고 옆 수입 상자 더미 (크레인이 내려놓은 상자를 일꾼이 옮겨요)
  craneDrop: { i: 76.48, j: -11.08 },   // harbor_crane dropPoint (manifest)
  catchPile: { i: 69.16, j: -11.75 },   // fish_auction inPoint: 어선 일꾼이 생선 상자를 내려놓는 곳
  fishQuay: { i: 54.75, j: -13.4 },     // 서쪽 벽 어선 부두 (어선에서 생선 상자를 받는 곳: 조선소 서쪽 포장 마당)
  stationDoor: { i: 62.0, j: 0.6 },
  lighthouseKeeper: { i: 87.97, j: -12.47 },
};
//  소품: [키, i, j, (scale)] — 안벽 끝 계선주, 가로등, 그물 걸이, 상자, 컨테이너, 닻 장식
export const PROPS = [
  ['bollard', 81.0, -11.72], ['bollard', 83.4, -11.72], ['bollard', 85.6, -11.72], ['bollard', 55.32, -13.2], ['bollard', 55.32, -16.6], ['bollard', 55.32, -20.2],
  ['bollard', 60.5, -11.72], ['bollard', 65.33, -11.72], ['bollard', 69.87, -11.72],
  //  (안벽 줄 뒤 가로등은 지붕에 가려 불빛만 지붕 위에 떠 보여서, 두 개는 큰길 보도 쪽 건물 사이로 옮겼어요)
  ['harbor_lamp', 54.4, -8.4], ['harbor_lamp', 60.56, -3.85], ['harbor_lamp', 73.6, -3.85], ['harbor_lamp', 81.8, -8.6], ['harbor_lamp', 85.2, -11.2],
  ['net_rack', 54.0, -10.8], ['anchor_decor', 84.6, -9.0], ['barrel_stack', 64.6, -8.3],
  ['container_stack', 80.9, -9.0], ['container_red', 84.9, -7.1, 0.92],
];
//  방파제 위 · 바위 곶 소품 (lantern_string 은 ★3)
export const BREAKWATER_PROPS = [['bollard', 61.5, -21.6], ['bollard', 65.5, -21.6]];
//  물 위 부표 (water props): 입구 양쪽
export const BUOYS = [{ i: 71.6, j: -24.6 }, { i: 86.6, j: -21.6 }];

// ---------------------------------------------------------------------------------------------- ships (assets/ships manifest)
//  length / beam in lattice cells (metres / √2). The node test checks them against the manifest.
export const SHIP_DIMS = {
  ferry: { lengthM: 16.0, beamM: 5.2 }, cargo_ship: { lengthM: 21.0, beamM: 5.6 }, trawler_big: { lengthM: 14.0, beamM: 4.6 },
  tugboat: { lengthM: 6.2, beamM: 3.0 }, sailboat: { lengthM: 5.6, beamM: 2.0 }, yacht: { lengthM: 7.2, beamM: 2.6 },
  boat_fishing: { lengthM: 4.6, beamM: 1.8 }, boat_rowboat: { lengthM: 3.0, beamM: 1.3 },
};
export const shipCells = (key) => { const d = SHIP_DIMS[key]; return { len: d.lengthM / CELL_M, beam: d.beamM / CELL_M }; };

// headings ships use (vehicles style): NE = +j, SW = −j, SE = +i, NW = −i  (S = toward the camera, unused by routes)
export const HEAD = { NE: [0, 1], SW: [0, -1], SE: [1, 0], NW: [-1, 0] };
export const AXIS = { NE: 'j', SW: 'j', SE: 'i', NW: 'i' };

//  배가 서는 곳 (berth). 여객선 자리는 터미널 잔교 끝에 맞춰 계산 (ships.md: anchor = terminal + gangwayPoint − gangwayFarPoint)
//   F 여객선 · C 화물선 (크레인 앞, 밤에는 원양어선) · W 서쪽 벽 어선 부두 · T 예인선 (방파제 바깥) · V 마을 배 두 척 (안벽 앞, 배 길 밖)
export const BERTHS = {
  F: { i: 65.04, j: -16.71, head: 'NW', ship: 'ferry' },
  C: { i: 78.5, j: -14.2, head: 'NW', ship: 'cargo_ship' },
  W: { i: 56.75, j: -17.75, head: 'NE', ship: 'trawler_big' },
  T: { i: 64.0, j: -25.6, head: 'NW', ship: 'tugboat' },
  V1: { i: 61.0, j: -13.45, head: 'SE', ship: 'boat_fishing' },     // along the quay between the slip and the gangway
  V2: { i: 66.8, j: -13.3, head: 'NW', ship: 'boat_rowboat' },      // by the auction hall's catch drop
};
//  배가 다니는 길 (모두 격자 축을 따라: 앞으로 / 뒤로 / 옆으로(예인선이 밀어 줌)).  turn = 제자리에서 방향 바꾸기
//   lanes (바깥 바다, 동쪽에서 들어오고 동쪽으로 나가요): 여객선 들어오는 길 j −22.4, 항구 안 길 j −18.6,
//   여객선 나가는 길 = 화물선 길 j −26.3, 원양어선 들어오는 길 j −30, 나가는 길 = 돛단배 길 j −33.5, 요트 j −35.4.
//   mouthI = 입구에서 옆으로 밀리는 곳, seaI = 수평선 너머 (배가 나타나고 사라지는 곳)
export const LANES = { ferryArr: -22.4, ferryIn: -18.6, ferryDep: -26.3, cargo: -26.3, trawler: -30.0, trawlerOut: -33.5, leisure: -33.5, yacht: -35.4, mouthI: 80, seaI: 98 };
//  원양어선이 그물을 끌어올리는 곳: 원양어선 길 위에서 멈춰 서서 (NW, 선미 = 화면 오른쪽 아래) 그물을 올려요
export const HAUL = { i: 72.0, j: -30.0, head: 'NW' };
//  bow of the trawler at W points to the quay; it backs out (SW) to the haul lane.

/** the ferry berth from the manifests (ships.md §4): returns { i, j } on the water plane for dir NW */
export function ferryBerthFrom(harborMan, shipsMan) {
  const t = harborMan.sprites.ferry_terminal, f = shipsMan.characters.ferry;
  const [ax, ay] = LR(BLD.h_ferry_terminal.i, BLD.h_ferry_terminal.j);
  const gp = t.gangwayPoint, far = f.gangwayFarPoint.NE;            // NW = NE mirrored (dx negated)
  const x = ax + gp[0] - (-far[0]), y = ay + gp[1] - far[1];
  const p = wpx2L(x, y);
  return { i: r2(p.i), j: r2(p.j), x, y };
}

// ---------------------------------------------------------------------------------------------- people places (TownSim kinds, P6)
//  항구 사람들: 부두 일꾼, 선원, 경매사, 등대지기, 관광객 (assets/harbor townfolk_presets.json)
export const PEOPLE = {
  dock_worker: { preset: 'dock_worker', n: 4, at: ['h_harbor_crane', 'h_harbor_warehouse'], ko: '부두 일꾼', en: 'dock worker' },
  sailor: { preset: 'sailor', n: 3, at: ['h2_sailor_lodge', 'h_shipyard'], ko: '선원', en: 'sailor' },
  auctioneer: { preset: 'auctioneer', n: 1, at: ['h_fish_auction'], ko: '경매사', en: 'auctioneer' },
  lighthouse_keeper: { preset: 'lighthouse_keeper', n: 1, at: ['h_lighthouse'], ko: '등대지기', en: 'lighthouse keeper' },
  tourist: { preset: 'tourist', n: 0, ko: '관광객', en: 'tourist' },
};

// ---------------------------------------------------------------------------------------------- walk paths (px helpers for views)
//  people walk along these polylines (land level): quay lane behind the quay row, the boulevard sidewalk,
//  the crossing to the station
export const WALK = {
  quay: [[55.8, -8.4], [86.0, -8.4]],
  sidewalk: [[50.0, -3.6], [86.0, -3.6]],
  toStation: [[65.5, -3.6], [65.5, 1.25], [62.0, 1.25]],
  gangway: [[64.45, -11.83], [64.47, -12.69], [64.47, -13.5]],          // ferry_terminal boardPoints (lattice)
  terminalOut: [[64.45, -11.83], [64.6, -9.0], [65.5, -8.4]],
  fishQuay: [[54.75, -13.4], [54.75, -8.4]],                             // 조선소 서쪽 마당으로 (조선소를 뚫고 가지 않게)
};
/** a lattice polyline -> px points */
export const pathPx = (pts) => pts.map(([i, j]) => LR(i, j));

// ---------------------------------------------------------------------------------------------- colliders (P7, ports.collision)
//  건물 충돌 원: 촌장님이 건물을 뚫고 지나가지 않게. 땅 위의 원 (격자 반지름 c 칸) = 화면 r = c · 64√2 px
//  (v4 Collision 의 거리 dx² + (2·dy)²). 원은 건물 바닥 안에만 있어서 뒤 골목 · 보도 · 발판은 그대로 걸을 수 있어요.
const RPX = 64 * Math.SQRT2;
/**
 * collision circles of the harbour buildings: [{ id, x, y, r }] (px; r in Collision's metric).
 * fpOf(key) -> footprintM [along i, along j] (metres, from the manifest). The station copies v4 RailStation.addCollision
 * (four circles behind the platform).
 */
export function colliders(fpOf) {
  const out = [];
  for (const b of BUILDINGS) {
    if (b.key === 'train_station') {
      for (const [di, j, r] of [[-2.1, 2.9, 62], [-0.6, 2.9, 62], [0.9, 2.9, 62], [2.1, 2.7, 50]]) { const [x, y] = LR(b.i + di, j); out.push({ id: b.id, x, y, r }); }
      continue;
    }
    const f = fpOf(b.key);
    if (!f || !(f[0] > 0) || !(f[1] > 0)) continue;
    const fi = f[0] / CELL_M, fj = f[1] / CELL_M, c = Math.min(fi, fj) / 2 * 0.85;
    const n = Math.max(1, Math.ceil(fi / (2 * c) - 0.25)), span = Math.max(0, fi / 2 - c);
    for (let k = 0; k < n; k++) {
      const di = n === 1 ? 0 : -span + (2 * span * k) / (n - 1);
      const [x, y] = LR(b.i + di, b.j);
      out.push({ id: b.id, x, y, r: Math.round(c * RPX) });
    }
  }
  return out;
}

/** everything the lead copies into WORLD.v6 (P19) */
export function worldV6() {
  return { size: WORLD_V6, regions: REGIONS, rail: RAIL, coast: COAST, streets: STREETS, eup: STREETS_EUP, buildings: BUILDINGS, sea: SEA, breakwater: BREAKWATER };
}
