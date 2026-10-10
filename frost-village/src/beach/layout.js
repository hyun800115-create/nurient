// 햇살 해변 자리표 (docs/v5_v8_plan.md §4.4 → 통합 때 WORLD.v7 로 옮겨요). 좌표는 v4 격자 L(i, j):
//   L(i, j) = (3120 + 64·(i + j), 1315 + 32·(i − j)) px, 한 칸 = √2 m, i 가 커지면 화면 오른쪽 아래, j 가 커지면 오른쪽 위.
//   바다는 j < waterJ(i) 쪽 (화면 왼쪽 아래). 건물 앞면은 −Y (바다 쪽)을 봐요.
// What changed from the plan's table (and why): the first row is 1.6 cells further east, so a 3.6 m passage opens
// between the lighthouse (i 87.13–89.67) and the cafe for the path from 바닷가 큰길 down to the sand, and the beach
// gate (5.4 m wide) stands on the boardwalk's west end; the lifeguard station, arcade and restrooms continue the
// second row (the plan's table had no lot for them). layout.test.mjs checks every footprint against the others,
// the sea, the streets, the rail ballast and the region rects (the plan's §4.6 checks, module-owned copy).

import { shoreY } from '../data/world.js';

export const G = [3120, 1315];
export const S2 = Math.SQRT2;
export function L(i, j) { return [G[0] + 64 * (i + j), G[1] + 32 * (i - j)]; }
export function LR(i, j) { const p = L(i, j); return [Math.round(p[0]), Math.round(p[1])]; }
export function px2L(x, y) { const a = (x - G[0]) / 64, b = (y - G[1]) / 32; return [(a + b) / 2, (a - b) / 2]; }

// ── 바다 (따뜻한 해류): 등대 바위 곶 i 86–90 (j −12 → −19), 그 동쪽은 모래 해변 (물가 j ≈ −19, 살짝 굽어요)
export const SEA = { rock: [86, 90], quayJ: -12, coastJ: -19, east: 125, land: 140 };     // land: the mask's east end (past the region)
/** the waterline j at lattice i (south sea where j < waterJ(i)); the beach part waves gently (±0.32 cell) */
export function waterJ(i) {
  if (i <= SEA.rock[0]) return SEA.quayJ;
  if (i < SEA.rock[1]) return SEA.quayJ + (SEA.coastJ - SEA.quayJ) * (i - SEA.rock[0]) / (SEA.rock[1] - SEA.rock[0]);
  const w = 0.22 * Math.sin(i * 0.37 + 0.6) + 0.1 * Math.sin(i * 0.91 + 2.1);
  return SEA.coastJ + w * Math.min(1, (i - SEA.rock[1]) / 2);
}
export function seaAt(i, j) { return i > 55 && j < waterJ(i); }
export function shoreTypeAt(i) { return i <= SEA.rock[0] ? 'quay' : i < SEA.rock[1] ? 'rock' : 'sand'; }

// ── 모래 (sand cells): lattice cells (i, j) = square [i, i+1] × [j, j+1]; SAND = i 88..123, j −20..−1 (the street
//    and the boardwalk are painted over it); the snow-to-sand edge runs along i 86..90 (west) and the rail ballast (north)
export const SANDCELLS = { i0: 89, i1: 124, j0: -20, j1: -1, westRamp: [86, 90] };
/** is lattice cell (ci, cj) (min corner) sand? (the west edge steps from snow to sand between i 86 and 90) */
export function sandCell(ci, cj) {
  if (cj < SANDCELLS.j0 || cj >= SANDCELLS.j1 || ci >= SANDCELLS.i1) return false;
  // west: the snow thins between i 86 and 90 — a staircase that leans with j (more sand near the warm sea)
  const edge = 89 - Math.max(0, Math.min(3, Math.floor((-cj - 4) / 4)));
  return ci >= edge;
}
/** wet cells: the cell rows the swash reaches (j −20 and −19 along the beach) */
export function wetCell(ci, cj) { return sandCell(ci, cj) && cj <= -19 && ci >= 89; }

// ── 거리 (v7 바닷가 큰길 동쪽 끝): plan §4.4 blvd_b
export const STREETS = [{ id: 'blvd_b', axis: 'x', i: [86.0, 116.0], j: [-8.0, -4.0], cls: 'cobble', region: 'beach' }];
/** the little path from 바닷가 큰길 between the lighthouse and the cafe down to the gate (sand, no curb) */
export const PATH = { i: [90.0, 91.9], j: [-12.6, -8.0] };

// ── 건물 (front −Y)
export const B = (id, key, i, j, extra = {}) => Object.assign({ id, key, i, j }, extra);
export const ROW1 = [
  B('b_beach_cafe', 'beach_cafe', 93.76, -11.13, { shop: 'beach_cafe' }),
  B('b_icecream_shop', 'icecream_shop', 96.81, -11.27, { shop: 'icecream_shop' }),
  B('b_resort_hotel', 'resort_hotel', 101.14, -10.35, { need: 'hotel', board: 'boardHotel' }),
  B('b_hotel_pool', 'hotel_pool', 106.54, -10.31, { need: 'pool' }),
  B('b_seafood_bbq', 'seafood_bbq', 110.51, -11.13, { shop: 'seafood_bbq' }),
  B('b_surf_shop', 'surf_shop', 113.50, -11.20, { shop: 'surf_shop', board: 'boardSurf' }),
  B('b_convenience_store', 'convenience_store', 116.49, -11.13, { shop: 'convenience_store' }),
  B('b_mini_aquarium', 'mini_aquarium', 119.83, -11.06, { need: 'aquarium' }),
];
export const ROW2 = [
  B('b2_pension', 'pension', 89.84, -2.00, { need: 'extras' }),
  B('b2_tourist_info', 'tourist_info', 93.18, -2.28, { need: 'open' }),
  B('b2_souvenir_shop', 'souvenir_shop', 96.37, -2.07, { shop: 'souvenir_shop' }),
  B('b2_swimwear_shop', 'swimwear_shop', 99.77, -2.07, { shop: 'swimwear_shop' }),
  B('b2_beach_bar', 'beach_bar', 103.32, -2.00, { need: 'extras' }),
  B('b2_lifeguard_station', 'lifeguard_station', 107.00, -2.00, { need: 'lifeguard' }),
  B('b2_beach_arcade', 'beach_arcade', 110.76, -2.13, { need: 'extras' }),
  B('b2_restroom_shower', 'restroom_shower', 114.45, -2.21, { need: 'open' }),
];
export const STATION = B('b_station', 'train_station', 94.0, 2.03, { note: '해변역 (coast line stop "beach", harbour module)' });
export const GATE = B('b_beach_gate', 'beach_gate', 91.0, -13.25, { need: 'cleanup', board: 'boardGate' });
export const BUILDINGS = ROW1.concat(ROW2);
/** the hotel's water region (Water.js 'pool' palette) is the hotel_pool waterRegion at its anchor */
export const HOTEL = ROW1[2], POOL = ROW1[3];

// ── 나무 산책로 (boardwalk_x tiles, j −12.9, from the gate to the aquarium)
export const BOARDWALK = { j: -12.9, i0: 90.5, i1: 121.5 };
export function boardwalkTiles() {
  const out = [];
  const n = Math.round(BOARDWALK.i1 - BOARDWALK.i0);
  for (let k = 0; k <= n; k++) out.push({ key: k === 0 ? 'boardwalk_end_xn' : k === n ? 'boardwalk_end_xp' : 'boardwalk_x', i: BOARDWALK.i0 + k, j: BOARDWALK.j });
  return out;
}

// ── 소품 (props). need: when it shows ('nature' always; 'cleanup' after the clean-up; 'open' after the lifeguard;
//    'shop:<id>' with that shop; 'hotel' | 'pool' | 'aquarium' | 'extras'). layer: 'decal' (baked into the ground),
//    'sprite' (depth-sorted), 'water' (water-plane, anchor = sea surface). camp: a family / couple base.
const P = (id, key, i, j, need = 'open', extra = {}) => Object.assign({ id, key, i, j, need, layer: 'sprite' }, extra);
const D = (id, key, i, j, need = 'open', extra = {}) => Object.assign({ id, key, i, j, need, layer: 'decal' }, extra);
export const PROPS = [
  // nature (always there: the snow-to-sand walk shows them)
  P('palm_w', 'palm_tree_b', 89.35, -15.35, 'nature'),
  P('pine_w', 'beach_pine', 87.6, -14.0, 'nature'),
  P('palm_1', 'palm_tree_a', 95.45, -14.6, 'nature'),
  P('palm_2', 'palm_tree_a', 103.9, -14.2, 'nature'),
  P('palm_3', 'palm_tree_b', 108.95, -14.35, 'nature'),
  P('palm_4', 'palm_tree_a', 115.95, -14.65, 'nature'),
  P('palm_5', 'palm_tree_b', 121.75, -15.05, 'nature'),
  P('palm_n1', 'palm_tree_a', 87.5, -2.6, 'nature'),
  P('palm_n2', 'palm_tree_a', 104.9, -3.7, 'nature'),
  P('palm_n3', 'palm_tree_b', 117.6, -3.6, 'nature'),
  P('grass_1', 'dune_grass_a', 92.3, -14.15, 'nature'), P('grass_2', 'dune_grass_b', 97.6, -13.95, 'nature'),
  P('grass_3', 'dune_grass_c', 101.95, -13.85, 'nature'), P('grass_4', 'dune_grass_a', 112.0, -14.0, 'nature'),
  P('grass_5', 'dune_grass_b', 119.9, -14.0, 'nature'), P('grass_6', 'dune_grass_c', 89.6, -16.9, 'nature'),
  P('grass_7', 'dune_grass_a', 123.0, -16.6, 'nature'),
  P('drift_1', 'driftwood', 99.3, -18.55, 'cleanup', { seat: true }),
  P('star_1', 'starfish', 96.3, -18.45, 'nature'), P('star_2', 'starfish', 111.4, -18.5, 'nature'), P('star_3', 'starfish', 118.9, -18.4, 'nature'),
  D('shells_1', 'decal_shells', 94.2, -18.3, 'nature'), D('shells_2', 'decal_shells', 114.6, -18.4, 'nature'),
  D('ripples_1', 'decal_sand_ripples', 106.0, -17.3, 'nature'), D('ripples_2', 'decal_sand_ripples', 92.6, -16.0, 'nature'),
  D('ripples_3', 'decal_sand_ripples', 120.4, -17.0, 'nature'), D('steps_1', 'decal_footprints_sand', 100.9, -18.3, 'open'),
  D('steps_2', 'decal_footprints_sand', 109.8, -17.6, 'open'), D('weed_1', 'decal_seaweed', 103.2, -18.45, 'nature'),
  // boardwalk furniture
  P('lamp_1', 'beach_lamp', 93.6, -13.75, 'cleanup'), P('lamp_2', 'beach_lamp', 108.3, -13.75, 'cleanup'),
  P('lamp_3', 'beach_lamp', 113.0, -13.75, 'cleanup'), P('lamp_4', 'beach_lamp', 118.3, -13.75, 'cleanup'),
  P('lights_1', 'string_lights_x', 97.55, -13.6, 'hotel', { chain: 'lights' }), P('lights_2', 'string_lights_x', 100.38, -13.6, 'hotel', { chain: 'lights' }),
  P('lights_3', 'string_lights_x', 103.21, -13.6, 'hotel', { chain: 'lights' }),
  P('sign_gate', 'beach_sign_board', 89.9, -14.2, 'cleanup'),       // a small signpost (the gate arch carries the name)
  P('shower_1', 'beach_shower', 91.95, -15.0, 'open'),
  P('booth_1', 'changing_booth', 90.35, -16.3, 'open'),
  // camps: parasol + towels / loungers (+ toys)
  P('par_a', 'parasol_red', 93.6, -16.0, 'open', { camp: 'A' }),
  D('towel_a1', 'decal_towel_red', 94.75, -16.1, 'open', { camp: 'A' }), D('towel_a2', 'decal_towel_blue', 95.6, -16.1, 'open', { camp: 'A' }),
  P('ring_a', 'swim_ring_duck', 96.45, -16.8, 'open', { camp: 'A' }),
  P('par_b', 'parasol_blue', 98.1, -15.55, 'open', { camp: 'B' }),
  P('lng_b1', 'sun_lounger', 99.25, -15.7, 'open', { camp: 'B' }), P('lng_b2', 'sun_lounger', 100.0, -15.7, 'open', { camp: 'B' }),
  P('par_c', 'parasol_yellow', 104.9, -15.6, 'open', { camp: 'C' }),
  P('lng_c1', 'sun_lounger', 106.05, -15.75, 'open', { camp: 'C' }), P('lng_c2', 'sun_lounger', 106.8, -15.75, 'open', { camp: 'C' }),
  P('chair_c', 'beach_chair_folding', 104.4, -16.6, 'open', { camp: 'C' }),
  P('par_d', 'parasol_green', 116.25, -15.75, 'open', { camp: 'D' }),
  D('towel_d1', 'decal_towel_yellow', 117.4, -15.85, 'open', { camp: 'D' }), D('towel_d2', 'decal_towel_green', 118.25, -15.85, 'open', { camp: 'D' }),
  P('toys_d', 'bucket_spade', 117.3, -17.25, 'open', { camp: 'D' }),
  P('par_e', 'parasol_pink', 120.2, -16.35, 'open', { camp: 'E' }),
  P('lng_e1', 'sun_lounger', 121.35, -16.5, 'open', { camp: 'E' }),
  P('par_f', 'parasol_rainbow', 91.4, -17.75, 'shop:swimwear_shop', { camp: 'F' }),
  D('towel_f1', 'decal_towel_green', 92.55, -17.85, 'shop:swimwear_shop', { camp: 'F' }),
  D('towel_f2', 'decal_towel_red', 93.4, -17.85, 'shop:swimwear_shop', { camp: 'F' }),
  // sun towels (no parasol)
  D('towel_s1', 'decal_towel_yellow', 101.55, -18.0, 'open'), D('towel_s2', 'decal_towel_blue', 109.75, -18.45, 'shop:swimwear_shop'),
  // the lifeguard
  P('tower', 'lifeguard_tower', 101.75, -16.75, 'open'),
  P('buoy_stand', 'rescue_buoy_stand', 100.65, -16.2, 'open'),
  P('board_1', 'rescue_board', 102.65, -16.15, 'open'),
  // play
  D('court', 'decal_volleyball_court', 112.55, -16.35, 'shop:surf_shop'),
  P('net', 'volleyball_net', 112.55, -16.35, 'shop:surf_shop', { court: true }),
  P('castle_1', 'sandcastle_build_0', 96.0, -18.15, 'open', { stages: true }),
  P('castle_2', 'sandcastle_build_0', 105.2, -18.1, 'open', { stages: true }),
  P('castle_3', 'sandcastle_build_0', 108.55, -17.75, 'open', { stages: true }),
  P('castle_l', 'sandcastle_l', 114.7, -18.35, 'shop:icecream_shop'),
  P('castle_s', 'sandcastle_s', 120.6, -18.35, 'open'),
  P('toys_1', 'bucket_spade', 98.15, -17.95, 'open'),
  P('rack', 'surfboard_rack', 114.7, -14.05, 'shop:surf_shop'),
  // service
  P('cart', 'icecream_cart', 102.95, -14.45, 'shop:icecream_shop'),
  P('rental', 'rental_stand', 96.7, -14.3, 'shop:swimwear_shop'),
  P('corn', 'corn_stand', 121.6, -14.15, 'shop:seafood_bbq'),
  P('picnic', 'picnic_table_beach', 123.0, -16.9, 'extras'),
  P('swing', 'beach_swing', 123.35, -15.55, 'extras'),
  P('notice', 'beach_sign_notice', 99.95, -14.0, 'open'),       // its own painted map + ring (no text: the board is slanted)
  // on the water
  P('raft', 'float_raft', 104.4, -20.55, 'pool', { layer: 'water' }),
];
/** swim buoy line (water-plane tiles at stepPx along X + two end floats), j −21.2 */
export const BUOYS = { j: -21.25, i0: 94.0, i1: 116.0 };
export function buoyTiles() {
  const out = [];
  for (let i = BUOYS.i0 + 0.5; i < BUOYS.i1; i += 1) out.push({ key: 'swim_buoy_line_x', i, j: BUOYS.j });
  out.push({ key: 'swim_buoy_line_end', i: BUOYS.i0, j: BUOYS.j }, { key: 'swim_buoy_line_end', i: BUOYS.i1, j: BUOYS.j });
  return out;
}

// ── 물놀이 자리: swimmers inside the buoys, kids splashing at the edge, surfers further out, boats beyond the buoys
export const SWIM = { i: [95.0, 115.0], j: [-20.95, -19.75], step: [1.25, 0.6] };
export const SPLASH = { i: [93.0, 117.5], j: [-19.55, -19.2], step: 1.3 };
export const SURF = { lanes: [[-22.15, 97.0, 112.0], [-22.75, 99.0, 115.0]] };      // [j, i0, i1]
export const BOATS = {
  swan: { loop: [[95.6, -22.4], [101.6, -22.6], [102.6, -23.6], [96.6, -23.8]], shore: [94.6, -19.2], need: 'shop:swimwear_shop' },
  swan2: { loop: [[99.0, -23.2], [104.6, -23.0], [105.2, -24.2], [99.6, -24.4]], shore: [98.6, -19.2], need: 'shop:swimwear_shop' },
  kayak: { loop: [[106.0, -22.6], [113.0, -22.4], [113.6, -23.4], [106.4, -23.6]], need: 'shop:surf_shop' },
  banana: { loop: [[91.8, -26.9], [107.5, -27.2], [108.6, -28.6], [92.2, -28.4]], need: 'hotel' },     // well past the swans: the yacht's hull reaches ~2 cells up the screen
};
export const CRABS = { i: [92.0, 121.0], j: [-18.9, -17.9] };
/** kite flyers stand on the dry sand at the ends of the beach */
export const KITES = [[90.4, -18.3], [122.2, -18.5]];
/** tourist photo spots in front of the gate */
export const PHOTO = [[90.2, -14.3], [91.8, -14.35]];

// ── 사람이 다니는 길 (beachgoers walk: the gate → the boardwalk → down an aisle to their spot)
export const ENTRY = { gate: [91.0, -12.4], gateIn: [91.0, -14.0], station: [94.0, 0.6], east: [122.6, -13.2] };
/** aisles: clear lanes from the boardwalk down to the water (between the camps) */
export const AISLES = [91.0, 94.3, 97.0, 102.9, 107.55, 110.2, 115.6, 119.0, 122.4];

// ── 장소 (missions / story / events): p:beach_gate, p:warm_coast, p:polar, p:sandcastles, p:aquarium, p:hotel, p:icecream
export const PLACES = {
  beach_gate: { i: 91.0, j: -14.1 },
  warm_coast: { i: 88.6, j: -9.2 },           // past the lighthouse point on 바닷가 큰길: the snow thins here (E7)
  sandcastles: { i: 103.7, j: -17.2 },
  aquarium: { i: 119.4, j: -12.75 },
  hotel: { i: 100.3, j: -12.75 },
  icecream: { i: 102.4, j: -15.7 },
  beach: { i: 104.0, j: -16.5 },
};
/** the polar-bear swim happens at OUR snowy village coast (v4 world, north sea): a snowbank east of the dock pier */
export const POLAR = { x: 1290, crowdDy: 92, runDy: 30, swimDy: -54, width: 300 };
export function polarSpot() { const y = Math.round(shoreY(POLAR.x)); return { x: POLAR.x, y: y + POLAR.crowdDy, shoreY: y }; }
export function placePos(id) {
  if (id === 'polar') { const p = polarSpot(); return { x: p.x, y: p.y }; }
  const p = PLACES[id]; if (!p) return null;
  const [x, y] = L(p.i, p.j); return { x: Math.round(x), y: Math.round(y) };
}

// ── 해변 청소 (E8): 12 bits of seaweed and driftwood on the sand before the beach opens
export const CLEANUP = [[93.4, -15.4], [95.9, -17.6], [98.2, -16.4], [100.6, -18.3], [102.4, -15.2], [104.8, -17.0],
  [107.2, -18.4], [109.6, -15.6], [111.8, -17.8], [114.2, -16.2], [117.0, -18.2], [120.2, -15.2]];

// ── 처음 해변을 찾는 순간 (E7): walking east past this i on/near 바닷가 큰길 (or onto the sand)
export const REVEAL = { i: 88.2, pan: [[89.0, -15.5], [104.0, -16.5], [118.0, -16.8]] };

// ── 지역 (v7 world): plan §4.1
export const REGION = { beach: [5200, 4600, 11264, 5888], harbor: [6144, 0, 10752, 4600] };
export const WORLD_V7 = { width: 11264, height: 5888 };
/** Water.js tropical region (world px) and the land mask polygon (sand down to the waterline, waterPx 0) */
export function seaRegion() { return { x: 7100, y: 4300, w: 3800, h: 1700 }; }
export function landPoly() {
  const pts = [];
  // everything north of the coast is land, past every edge of seaRegion (else the Water mask would call the snow
  // north of the beach and east of it "sea" and draw a shore band along the polygon's edge)
  pts.push(...L(84.0, 40.0), ...L(84.0, -12.0));
  for (let i = 86; i <= SEA.land; i += 0.25) pts.push(...L(i, waterJ(i)));
  pts.push(...L(SEA.land, 40.0));
  return pts.map((v) => Math.round(v * 10) / 10);
}
/** shore types along the beach's water edge (world px rects) */
export function shoreTypes() {
  const [x0, y0] = L(86, -12), [x1, y1] = L(90, -19);
  return [{ type: 'rock', rect: [Math.min(x0, x1) - 60, Math.min(y0, y1) - 60, Math.max(x0, x1) + 40, Math.max(y0, y1) + 30] }];
}
