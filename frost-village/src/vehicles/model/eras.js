// Eras (vehicles_runtime model/eras.js): which art plays which role in which era, and the per-vehicle numbers the
// simulation needs (from the vehicles manifest + tuning). Era 2 = 읍 (rank 2), era 3 = 도시 (rank 3), v8 adds
// emergency / logistics vehicles through dispatch().

export const ROLES = {
  bus:     { 2: 'horse_sleigh_bus', 3: 'retro_bus' },
  freight: { 2: 'steam_wagon', 3: 'truck_cargo' },
  porter:  { 2: 'cargo_sleigh', 3: 'cargo_sleigh' },
  sled:    { 2: 'dog_sled', 3: 'dog_sled' },
  truck:   { 3: 'truck_cargo_chief' },
  stop:    { 2: 'sleigh_stop', 3: 'bus_stop' },
  stopY:   { 2: 'sleigh_stop_y', 3: 'bus_stop_y' },
  depot:   { 2: 'stable_depot', 3: 'fuel_depot' },
};

/** tuning block of each vehicle key */
export const TUNING_OF = {
  horse_sleigh_bus: 'sleighBus', retro_bus: 'retroBus', steam_wagon: 'steamWagon', truck_cargo: 'truck', cargo_sleigh: 'cargoSleigh',
  dog_sled: 'dogSled', truck_cargo_chief: 'chiefTruck',
  police_car: 'cars', fire_truck: 'truck', ambulance: 'cars',
};
/** horse / dog drawn: the snow does not slow them, the dirt does (speedByClass.horses) */
export const ANIMAL = new Set(['horse_sleigh_bus', 'cargo_sleigh', 'dog_sled']);
/** the chief's own vehicles: they may use the village snow tracks */
export const CHIEF_KEYS = new Set(['dog_sled', 'truck_cargo_chief']);

export const CAR_FAMILIES = ['car_a', 'car_b', 'car_c', 'car_d'];
export const CAR_KEYS = ['car_a_blue', 'car_a_red', 'car_a_yellow', 'car_b_blue', 'car_b_mint', 'car_b_red', 'car_c_blue', 'car_c_orange', 'car_c_red', 'car_d_blue', 'car_d_cream', 'car_d_red'];

export function eraOf(rank) { return rank >= 3 ? 3 : rank >= 2 ? 2 : 1; }
export function roleKey(role, era) { const r = ROLES[role]; if (!r) return null; return r[era] || r[3] || r[2] || null; }

// fallbacks when the manifest is not there (Node tests without the art still need lengths)
const FALLBACK = {
  horse_sleigh_bus: [7.9, 1.95, 9, 0], retro_bus: [7.2, 2.3, 9, 0], steam_wagon: [4.5, 1.86, 2, 0], truck_cargo: [5.5, 2.0, 2, 0],
  truck_cargo_chief: [5.5, 2.0, 1, null], cargo_sleigh: [4.9, 1.6, 1, 0], dog_sled: [3.1, 1.1, 1, 0],
  police_car: [4.3, 1.9, 4, 0], fire_truck: [7.0, 2.3, 2, 0], ambulance: [5.2, 2.0, 2, 0],
};

/**
 * numbers the simulation needs for a vehicle key: { key, len, width, seatCount, driverSeat, animal, vmax, accel, tuning }
 * man = the vehicles manifest (characters{}), tuning = vehiclesTuning()
 */
export function specOf(man, key, tuning) {
  const d = (man && man.characters && man.characters[key]) || null;
  const fb = FALLBACK[key] || (key && key.startsWith('car_') ? [3.8, 1.85, 4, 0] : [4.5, 2, 2, 0]);
  const seats = d && d.seats && d.seats.SE ? d.seats.SE.length + (d.driverSeat === null ? 1 : 0) : fb[2];
  const tn = TUNING_OF[key] || (key && key.startsWith('car_') ? 'cars' : 'cars');
  const T = (tuning && tuning[tn]) || {};
  return {
    key, len: d && d.lengthM ? d.lengthM : fb[0], width: d && d.widthM ? d.widthM : fb[1],
    seatCount: seats, driverSeat: d ? (d.driverSeat === undefined ? 0 : d.driverSeat) : fb[3],
    animal: ANIMAL.has(key), vmax: T.speed || 4, accel: T.accel || 1.2, tuning: tn,
  };
}

/** ≤ `n` car keys for this game (one colour per family first: a street of four different toys) */
export function carPalette(rng, n = 4) {
  const fams = CAR_FAMILIES.slice();
  const out = [];
  while (out.length < Math.min(n, CAR_KEYS.length)) {
    const fam = fams.length ? fams.splice(rng.int(fams.length), 1)[0] : CAR_FAMILIES[rng.int(CAR_FAMILIES.length)];
    const opts = CAR_KEYS.filter((k) => k.startsWith(fam + '_') && out.indexOf(k) < 0);
    if (opts.length) out.push(opts[rng.int(opts.length)]);
    else if (!fams.length) break;
  }
  return out;
}
