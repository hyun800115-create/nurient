// The game's buildings and spots -> the story's places (docs/v5_v8_plan.md §6.1 model/places.js). Pure.
//
//   const W = buildStoryWorld({ buildings, spots, households })
//   W.places   -> engine world defs [{ id, kind, x, y, cap?, tag?, locked?, name? }]
//   W.byGame   -> { gameBuildingId: storyPlaceId }        (TownSim place 't_cafe:line' -> 't_cafe')
//   W.homeOf   -> { householdKey: storyHomeId }          (one story home per household: apartments hold many)
//
// Coordinates: the story only uses them for travel times (|dx| + |dy| cells), so game px are divided by 50.

/** game asset key -> story place kind (data/places.js PLACE_KINDS) */
export const KIND_BY_KEY = {
  // 솔방울 마을 (town, assets/town)
  train_station: 'station', police_box: 'police', police_station: 'police', cafe: 'cafe', bookstore: 'bookstore', playground: 'playground',
  park_fountain: 'park', sled_stop: 'plaza', toy_shop: 'toy_shop', clothing_store: 'clothing', flower_shop: 'florist', hair_salon: 'salon',
  restaurant: 'restaurant', post_office: 'post_office', school: 'school', town_hall: 'town_hall', clinic: 'clinic', fire_station: 'fire_station',
  supermarket: 'grocer', hardware_store: 'hardware', carpenter_workshop: 'furniture_store', apartment_a: 'home', apartment_b: 'home',
  townhouse_a: 'home', townhouse_b: 'home', townhouse_c: 'home', townhouse_d: 'home',
  // later fragments (civic, life2, logistics, harbour, beach)
  bank: 'bank', memorial_garden: 'memorial', logistics_center: 'logistics', furniture_workshop: 'furniture_workshop', appliance_factory: 'appliance_factory',
  harbor_office: 'harbor', fish_auction: 'fishmonger', lighthouse: 'park', beach_cafe: 'cafe', resort_hotel: 'restaurant',
  // 서리마을 (our village): the market square, the big restaurant, the bakery line, houses, the ice rink, the campfire
  market: 'plaza', plaza: 'plaza', big_restaurant: 'restaurant', station_bakery: 'bakery', bakery: 'bakery', house: 'home', village_house: 'home',
  ice_rink: 'ice_rink', campfire: 'beach_fire', log_seat: 'beach_fire', shop_general: 'general', fishing_dock: 'harbor', station_sawmill: 'forest',
  station_smelter: 'mine', station_farm: 'farm', notice_board: 'plaza', village_school: 'school', village_clinic: 'clinic',
  // VillageLife areas (WORLD.life.areas: plaza_s, notice, playground, green_fire, east_dock …) where the named villagers
  // spend the day: the kit reports them as buildings { id: 'va:<area>', key: 'village_area' } (critique H9)
  village_area: 'plaza',
};

/** game role -> story kind (when the key is unknown) */
export const KIND_BY_ROLE = { station: 'station', police: 'police', shop: 'general', play: 'playground', park: 'park', stop: 'plaza', post: 'post_office',
  school: 'school', hall: 'town_hall', clinic: 'clinic', fire: 'fire_station', home: 'home', bank: 'bank', memorial: 'memorial', plaza: 'plaza' };

export const PX_PER_CELL = 50;

/**
 * input: { buildings: [{ id, key, role, x, y, ours?, locked?, name? }], spots: [{ id, kind, x, y, ours? }],
 *          households: [{ key, building, size }] }
 */
export function buildStoryWorld(input = {}) {
  const places = [];
  const byGame = Object.create(null);
  const homeOf = Object.create(null);
  const seen = new Set();
  const cell = (v) => Math.round((v || 0) / PX_PER_CELL);
  for (const b of input.buildings || []) {
    const kind = b.kind || KIND_BY_KEY[b.key] || KIND_BY_ROLE[b.role];
    if (!kind || seen.has(b.id)) continue;
    seen.add(b.id);
    byGame[b.id] = b.id;
    if (kind === 'home') continue;                       // homes are made per household below
    const def = { id: b.id, kind, x: cell(b.x), y: cell(b.y) };
    if (b.ours) def.tag = 'ours';
    if (b.locked) def.locked = true;
    if (b.name) def.name = b.name;
    places.push(def);
  }
  for (const s of input.spots || []) {
    if (seen.has(s.id) || !s.kind) continue;
    seen.add(s.id);
    byGame[s.id] = s.id;
    const def = { id: s.id, kind: s.kind, x: cell(s.x), y: cell(s.y) };
    if (s.ours) def.tag = 'ours';
    places.push(def);
  }
  // one story home per household, at its building (an apartment unit, a village house, a flat above a shop)
  const bpos = Object.create(null);
  for (const b of input.buildings || []) bpos[b.id] = b;
  const count = Object.create(null);
  for (const h of input.households || []) {
    const b = bpos[h.building] || { x: 0, y: 0 };
    const n = (count[h.building] = (count[h.building] || 0) + 1);
    const id = (h.building || 'home') + '#' + n;
    homeOf[h.key] = id;
    places.push({ id, kind: 'home', x: cell(b.x), y: cell(b.y), cap: Math.max(2, Math.min(8, (h.size || 1) + 1)) });
  }
  return { places, byGame, homeOf };
}

/** the story place of a TownSim place id ('t_cafe:line' -> 't_cafe'), or null */
export function placeOfTown(byGame, townPlace) {
  if (!townPlace) return null;
  const i = townPlace.indexOf(':');
  const b = i >= 0 ? townPlace.slice(0, i) : townPlace;
  return byGame[b] || null;
}
