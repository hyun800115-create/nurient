// =====================================================================
//  Title diorama layout: where everything stands on the little island and when it appears.
//  Shared by the runtime (src/title/TitleDiorama.js) and the bake tool (tools/title/bake_title.mjs).
//
//  Units: metres on the iso ground plane, origin = island centre.
//    +X (mx) runs screen down-right, +Y (my) runs screen up-right (same axes as the game, Iso.js).
//    screen px at 1x = ((mx + my) * 45.25, (mx - my) * 22.63)
//  Road cells are sqrt(2) m (the road kit grid: lattice (i, j) = (i, j) * sqrt(2) m).
//
//  The story, back to front:
//    stage 1 개척  the camp on the north-east shore (the sea up-right, like in the game)
//    stage 2 마을  houses, stations, the watchtower and a dirt lane along that shore
//    stage 3 읍    the rail bridge + station (back-left), a cobble main street, town houses
//    stage 4 도시  the street becomes an asphalt avenue with buses and cars, apartments,
//                  and the harbour with quay, ferry terminal and lighthouse on the south-west shore
// =====================================================================

export const AX = 45.2548;      // px per metre along the iso axes (x component)
export const AY = 22.6274;      // (y component)
export const CELL = Math.SQRT2;
export const WATER_PX = 30;     // the sea surface sits this far below the land (harbor manifest waterPx)

/** metres -> 1x world px */
export function wx(mx, my) { return (mx + my) * AX; }
export function wy(mx, my) { return (mx - my) * AY; }

/** island outline: a rounded square ("squircle") in metres, gently wobbled; the harbour edge is straight */
export const ISLAND = {
  half: 14,          // metres from the centre to the middle of each side
  power: 6,          // squircle exponent (higher = squarer corners)
  wobble: 0.55,      // metres of organic wobble on the natural shores
  seed: 11,
  bankPx: WATER_PX,  // visible snow bank between land and sea on the camera side
  // straight quay on the south-west shore (my = -half) between these mx (stage 4 lays quay tiles on it)
  quay: { from: 0.0, to: 13.2 },
};

export const STAGE_NAMES = {
  ko: ['', '개척', '마을', '읍', '도시'],
  en: ['', 'Camp', 'Village', 'Town', 'City'],
};

// ---------------------------------------------------------------- ground (road kit cells)
// Roads are laid with the game's road kit (assets/roads/manifest.json roadKit): cells (i, j) with
// class dirt / town / city. Each stage lists what it ADDS; later layers paint over earlier ones.
//   rect: [i0, i1) x [j0, j1)   type: 'road' | 'walk'
export const GROUND = {
  // stage 1: the trading deck under the camp (ground_plaza planks) + trodden snow
  1: {
    plaza: [{ x0: -0.7, x1: 7.4, y0: 8.6, y1: 12.5 }],
    decals: [
      ['decal_dirt_patch', -1.6, 9.7, 1.0], ['decal_footprints', 1.6, 13.3, 0.9], ['decal_path_b', 1.2, 13.4, 0.8],
      ['decal_footprints', -2.8, 9.8, 0.8], ['decal_snow_drift_a', -5.4, 12.8, 1], ['decal_snow_drift_b', 9.6, 7.0, 1],
    ],
  },
  // stage 2: a dirt lane along the shore (1-lane track, cells j 4..5) and a path down to the middle
  2: {
    cls: 'dirt',
    cells: [
      { i0: -2, i1: 10, j0: 4, j1: 6, type: 'road' },
      { i0: 2, i1: 4, j0: 1, j1: 4, type: 'road' },
    ],
    decals: [['decal_path_a', -3.6, 3.6, 0.9], ['decal_footprints', 10.6, 4.4, 0.9]],
  },
  // stage 3: the rail (along X at my = rail.my) over a trestle bridge, and the cobble main street
  3: {
    cls: 'town',
    cells: [
      { i0: -10, i1: 10, j0: -4, j1: 0, type: 'road' },
      { i0: 2, i1: 4, j0: 0, j1: 4, type: 'road' },
    ],
    plaza: [],
    decals: [],
  },
  // stage 4: the avenue gets asphalt, sidewalks, curbs and markings; the harbour quay and piers
  4: {
    cls: 'city',
    cells: [
      { i0: -10, i1: 10, j0: -4, j1: 0, type: 'road' },
      { i0: -10, i1: 10, j0: -5, j1: -4, type: 'walk' },
      { i0: -10, i1: 10, j0: 0, j1: 1, type: 'walk' },
      { i0: 2, i1: 4, j0: 1, j1: 4, type: 'road' },
      { i0: 1, i1: 2, j0: 1, j1: 4, type: 'walk' },
      { i0: 4, i1: 5, j0: 1, j1: 4, type: 'walk' },
    ],
    decals: [],
  },
};

/** the railway: track centre along X, from the open sea (bridge) to the buffer stop */
export const RAIL = { my: 3.6, from: -30, to: -2.1, stage: 3 };

/** the harbour piers (stage 4): pier_y chains going -Y from the quay at these mx */
export const PIERS = [{ mx: 2.2, len: 3 }];

// ---------------------------------------------------------------- objects
// { k: sprite key, x, y: metres, s: stage it appears, u: stage it is gone (optional),
//   f: flipX, w: stands on the water (+WATER_PX), big: big pop (puff + sound), hero: pops first }
export const OBJECTS = [
  // ---- stage 0: the snowy island before anyone came (pines, rocks, drifts)
  { k: 'tree_pine_snow', x: -12.6, y: 11.6, s: 0 }, { k: 'tree_pine_a', x: -11.2, y: 12.8, s: 0 },
  { k: 'tree_pine_b', x: -12.9, y: 9.6, s: 0 }, { k: 'tree_pine_snow', x: -10.6, y: 10.6, s: 0, u: 3 },
  { k: 'tree_pine_a', x: -12.8, y: -11.8, s: 0 }, { k: 'tree_pine_snow', x: -11.4, y: -12.9, s: 0 },
  { k: 'tree_pine_b', x: -13.1, y: -9.6, s: 0 }, { k: 'tree_pine_snow', x: -12.2, y: -7.4, s: 0 },
  { k: 'tree_pine_snow', x: 12.4, y: 12.6, s: 0 }, { k: 'tree_pine_b', x: 13.1, y: 10.6, s: 0 },
  { k: 'tree_pine_a', x: 13.2, y: 4.2, s: 0 }, { k: 'tree_pine_snow', x: 12.9, y: 6.6, s: 0 },
  { k: 'tree_pine_snow', x: 13.0, y: -3.4, s: 0 }, { k: 'tree_pine_a', x: 12.6, y: -7.6, s: 0 },
  // the clearing that the town will need
  { k: 'tree_pine_snow', x: -6.4, y: 4.6, s: 0, u: 3 }, { k: 'tree_pine_a', x: -8.8, y: 7.0, s: 0, u: 3 },
  { k: 'tree_pine_b', x: 6.4, y: -9.6, s: 0, u: 3 }, { k: 'tree_pine_snow', x: 8.8, y: -11.4, s: 0, u: 4 },
  { k: 'tree_pine_snow', x: -4.0, y: -10.6, s: 0, u: 3 }, { k: 'tree_pine_a', x: 1.2, y: -11.6, s: 0, u: 3 },
  { k: 'tree_pine_b', x: 9.6, y: -4.8, s: 0, u: 4 }, { k: 'tree_pine_snow', x: 7.2, y: 2.6, s: 0, u: 3 },
  { k: 'tree_pine_a', x: -2.6, y: -2.6, s: 0, u: 3 }, { k: 'tree_pine_snow', x: 3.4, y: -6.0, s: 0, u: 3 },
  { k: 'rock_rubble', x: -13.0, y: 2.4, s: 0 }, { k: 'snow_pile_a', x: 11.6, y: -10.6, s: 0 },
  { k: 'bush_snow', x: 11.8, y: 8.6, s: 0 }, { k: 'ice_chunk', x: 13.6, y: 14.9, s: 0, w: 1 },
  { k: 'ice_chunk', x: -14.6, y: 8.0, s: 0, w: 1 },

  // ---- stage 1 개척: the camp (flag first, then the grill, the counter, tent, fire, pier, boat)
  //   grill in the middle of the trading deck, the counter to its right, the fire + tent to its left,
  //   the pier and the rowboat behind on the shore (the sea is up-right)
  { k: 'flag_pole', x: 5.2, y: 13.6, s: 1, hero: 1 },
  { k: 'station_grill', x: 0.6, y: 11.4, s: 1, big: 1 },
  { k: 'market_counter', x: 5.6, y: 10.6, s: 1, big: 1 },
  { k: 'tent_a', x: -3.0, y: 11.4, s: 1, u: 2 },
  { k: 'campfire', x: -1.2, y: 9.4, s: 1 },
  { k: 'log_seat_x', x: -2.3, y: 8.3, s: 1 },
  { k: 'dock_pier', x: 1.6, y: 15.0, s: 1 },
  { k: 'boat_small', x: 3.4, y: 15.8, s: 1, w: 1 },
  { k: 'fish_net', x: -0.4, y: 13.9, s: 1 },
  { k: 'barrel', x: 7.3, y: 10.1, s: 1 }, { k: 'crate', x: 6.9, y: 9.1, s: 1 },
  { k: 'firewood_pile', x: -4.7, y: 10.0, s: 1 },

  // ---- stage 2 마을: houses along the shore, stations, the watchtower, the lodge
  { k: 'house_a', x: -3.0, y: 11.6, s: 2, big: 1 },            // the tent became a cabin
  { k: 'house_c', x: -5.8, y: 12.6, s: 2, big: 1 },
  { k: 'worker_hut', x: -6.0, y: 8.8, s: 2 },
  { k: 'boathouse', x: 8.4, y: 13.0, s: 2, big: 1 },
  { k: 'watchtower', x: 11.2, y: 11.4, s: 2, big: 1, hero: 1 },
  { k: 'chief_lodge', x: 9.8, y: 8.4, s: 2, big: 1 },
  { k: 'station_sawmill', x: -1.2, y: 4.6, s: 2, u: 3 },
  { k: 'station_bakery', x: 6.2, y: 4.2, s: 2 },
  { k: 'house_b', x: 9.4, y: 4.0, s: 2, u: 4 },
  { k: 'lamp_post', x: 2.6, y: 8.3, s: 2 }, { k: 'lamp_post', x: 8.0, y: 6.0, s: 2 },
  { k: 'snowman_3', x: -3.6, y: 7.2, s: 2 },
  { k: 'dog_house', x: -4.6, y: 8.0, s: 2 },
  { k: 'fence_log_x', x: 11.4, y: 6.8, s: 2 }, { k: 'fence_log_x', x: 12.4, y: 6.8, s: 2 },
  { k: 'sled', x: 4.0, y: 7.4, s: 2 },

  // ---- stage 3 읍: station on the rail, town houses on the cobble street, town hall, fountain
  { k: 'train_station', x: -8.4, y: 6.5, s: 3, big: 1, hero: 1 },
  { k: 'town_hall', x: -3.4, y: -9.6, s: 3, big: 1 },
  { k: 'park_fountain', x: -8.6, y: -9.2, s: 3 },
  { k: 'townhouse_a', x: -11.6, y: -9.0, s: 3, big: 1 },
  { k: 'cafe', x: 0.4, y: 3.0, s: 3, big: 1 },
  { k: 'bookstore', x: 7.8, y: 3.4, s: 3, u: 4 },
  { k: 'townhouse_b', x: 0.8, y: -9.2, s: 3, big: 1 },
  { k: 'townhouse_c', x: 3.6, y: -9.0, s: 3, u: 4 },
  { k: 'flower_shop', x: 10.8, y: 3.0, s: 3, u: 4 },
  { k: 'streetlight', x: -6.0, y: 1.6, s: 3 }, { k: 'streetlight', x: -1.0, y: 1.6, s: 3 },
  { k: 'streetlight', x: 5.8, y: 1.6, s: 3 }, { k: 'streetlight', x: -9.8, y: -6.6, s: 3 },
  { k: 'streetlight', x: -1.0, y: -6.6, s: 3 }, { k: 'streetlight', x: 6.6, y: -6.6, s: 3 },
  { k: 'bench_x', x: -6.2, y: -7.2, s: 3 }, { k: 'sled_stop', x: 10.4, y: 1.4, s: 3, u: 4 },

  // ---- stage 4 도시: apartments, shops, the bus stop, traffic lights; the harbour
  { k: 'apartment_a', x: 10.6, y: 3.6, s: 4, big: 1, hero: 1 },
  { k: 'apartment_b', x: 4.8, y: -10.4, s: 4, big: 1 },
  { k: 'supermarket', x: 8.0, y: -9.8, s: 4, big: 1 },
  { k: 'restaurant', x: 6.6, y: 3.2, s: 4, big: 1 },
  { k: 'bus_stop', x: 1.2, y: -7.6, s: 4 },
  { k: 'traffic_light', x: 4.4, y: 2.2, s: 4 }, { k: 'traffic_light', x: 1.4, y: -6.8, s: 4 },
  { k: 'lighthouse', x: 12.6, y: -12.6, s: 4, big: 1, hero: 1 },
  { k: 'ferry_terminal', x: 10.6, y: -11.6, s: 4, big: 1 },
  { k: 'harbor_crane', x: -1.2, y: -12.4, s: 4, big: 1 },
  { k: 'container_stack', x: 1.8, y: -12.4, s: 4 },
  { k: 'harbor_lamp', x: 6.0, y: -13.2, s: 4 }, { k: 'harbor_lamp', x: -4.4, y: -13.2, s: 4 },
  { k: 'bollard', x: 4.0, y: -13.6, s: 4 }, { k: 'bollard', x: 8.2, y: -13.6, s: 4 },
  { k: 'crate_stack', x: -6.0, y: -12.6, s: 4 },
  { k: 'streetlight_double', x: 2.2, y: 0.8, s: 4 }, { k: 'streetlight_double', x: 9.0, y: -6.0, s: 4 },
  { k: 'buoy', x: 6.0, y: -19.0, s: 4, w: 1 },
];

// ---------------------------------------------------------------- moving life
// paths are lists of [mx, my] waypoints; `loop` = go round, otherwise back and forth.
export const ACTORS = [
  // the chief with a tower of grilled fish: pier -> grill -> counter and back (stage 1+)
  { id: 'chief', char: 'player', s: 1, anim: 'carry_walk', speed: 1.5, stack: 'item_fish_cooked', stackN: 9,
    path: [[1.8, 13.6], [1.5, 10.2], [4.8, 9.3], [1.5, 10.2]], loop: true },
  // 콩이 trots in circles around the camp fire
  { id: 'kongi', char: 'pet_dog', s: 1, anim: 'run', speed: 2.2, path: [[-1.2, 8.1], [0.1, 9.4], [-1.2, 10.7], [-2.5, 9.4]], loop: true },
  // villagers on the dirt lane (stage 2+)
  { id: 'v1', char: 'villager_a', s: 2, anim: 'walk', speed: 1.1, path: [[-1.0, 6.4], [11.0, 6.4]] },
  { id: 'v2', char: 'villager_b', s: 2, anim: 'walk', speed: 1.0, path: [[12.0, 7.4], [-1.8, 7.4]] },
  { id: 'fisher', char: 'fisherman', s: 2, anim: 'work', speed: 0, path: [[1.4, 16.2]], dir: 'NE' },
  { id: 'lumber', char: 'lumberjack', s: 2, anim: 'carry_walk', speed: 1.2, path: [[5.0, 2.2], [5.0, 8.0]] },
  // town folk on the sidewalks (stage 3+), harbour hands (stage 4)
  { id: 'v3', char: 'villager_c', s: 3, anim: 'walk', speed: 1.0, path: [[-12.0, -6.3], [10.0, -6.3]] },
  { id: 'v4', char: 'farmer', s: 3, anim: 'walk', speed: 1.05, path: [[9.0, 0.7], [-9.0, 0.7]] },
  { id: 'v5', char: 'villager_a', s: 3, anim: 'walk', speed: 0.95, path: [[-10.0, 0.75], [7.0, 0.75]] },
  { id: 'v6', char: 'hunter', s: 4, anim: 'walk', speed: 1.1, path: [[8.0, -6.5], [-8.0, -6.5]] },
  { id: 'v7', char: 'miner', s: 4, anim: 'carry_walk', speed: 0.9, path: [[-4.0, -12.4], [7.5, -12.4]] },
];

/** vehicles: drive along X lanes of the main street (right-hand traffic, see roadKit laneCentres) */
export const VEHICLES = [
  { id: 'sleigh', char: 'horse_sleigh_bus', s: 3, u: 4, lane: -4.24, dir: 1, speed: 2.2, gap: 4 },
  { id: 'bus', char: 'retro_bus', s: 4, lane: -4.24, dir: 1, speed: 2.6, gap: 3 },
  { id: 'car1', char: 'car_a_red', s: 4, lane: -1.41, dir: -1, speed: 3.4, gap: 2 },
  { id: 'car2', char: 'car_b_mint', s: 4, lane: -4.24, dir: 1, speed: 3.2, gap: 6 },
  { id: 'car3', char: 'car_d_cream', s: 4, lane: -1.41, dir: -1, speed: 3.0, gap: 9 },
];

/** the snow train: engine + coach + wagon arrive over the bridge and stop at the station.
 *  The idle title's train comes the long way (fromMx); the intro's pulls in from introRun metres before the
 *  stop within introSec (its whistle is part of the 읍 beat). */
export const TRAIN = { s: 3, cars: ['train_engine', 'train_car_a', 'train_car_b'], spacing: [2.34, 2.24],
  stopMx: -8.4 + 2.34, fromMx: -30, speed: 2.6, introRun: 8, introSec: 2.3 };

/** ships on the sea */
export const SHIPS = [
  // the ferry docks below the lighthouse, in the open water under the city (drawn at 0.85: a full-size
  // ferry would hide the harbour); the intro has it glide in from introRun metres out
  { id: 'ferry', char: 'ferry', s: 4, my: -19.0, stopMx: 13.0, fromMx: -34, toMx: 40, speed: 1.7, dir: 'SE', scale: 0.85, introRun: 4.5 },
  { id: 'sail', char: 'sailboat', s: 4, my: -7.4, fromMx: 15.5, toMx: 31, speed: 0.75, dir: 'SE' },
  { id: 'rowboat', char: 'boat_rowboat', s: 2, anim: 'row', my: 17.6, fromMx: -6, toMx: 12, speed: 0.6, dir: 'SE' },
];

/** gulls circle over the harbour / the camp */
export const GULLS = [
  { s: 2, cx: 3.0, cy: 15.0, r: 3.2, h: 140, speed: 0.55 },
  { s: 4, cx: 6.0, cy: -15.0, r: 4.0, h: 180, speed: 0.45 },
  { s: 4, cx: -2.0, cy: -16.0, r: 3.0, h: 210, speed: 0.6 },
];

// ---------------------------------------------------------------- camera
// focus point (metres) and how many metres of island width the screen should show (zoom follows the
// phone's width). The intro eases between these; the idle title holds the one of its stage.
/** the idle title's framing where it differs from the intro's CAMERA: the camp and the village sit in the
 *  middle of the screen with the sea above them, instead of floating over a field of empty snow */
export const IDLE_CAMERA = {
  1: { mx: 1.4, my: 12.0, span: 9.8 },
  2: { mx: 1.8, my: 9.8, span: 13.2 },
};

export const CAMERA = {
  1: { mx: 2.2, my: 10.4, span: 11 },
  2: { mx: 2.5, my: 8.7, span: 14.5 },
  3: { mx: -0.6, my: 2.6, span: 19.5 },
  4: { mx: 0.0, my: 0.0, span: 24.5 },
};
