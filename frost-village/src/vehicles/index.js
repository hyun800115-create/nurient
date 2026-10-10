// vehicles_runtime module entry for the ModuleHost (docs/v5_v8_plan.md §5.2 / §6.3). Nothing runs until the lead's
// P1 block constructs it; v4 behaves exactly as today without it.
//   VEHICLES_MODULE — sleigh buses / steam wagon / dog sled (읍) → retro buses / trucks / cars / the chief's truck
//   (도시); stops, depots, the freight yard, riding, traffic lights, the chief's delivery drives   (slice 1.5 KB)

import { BALANCE } from '../data/balance.js';
import { VehiclesHost } from './host.js';
import { VehiclesView } from './view/VehiclesView.js';
import { sanitizeVehicles, VEHICLES_SLICE } from './save.js';

const v5 = () => (BALANCE && BALANCE.v5) || {};
const rank2 = (gs) => !!(gs && gs.v4 && gs.v4.rank && gs.v4.rank.level >= 2);

/** art and sound per era (late fragments: only these files; Residency class `vehicle` keeps ≤ 8 keys) */
export const FRAGMENTS = {
  era2: { vehicles: ['veh_horse_sleigh_bus', 'veh_horse_sleigh_bus_over', 'veh_steam_wagon', 'veh_dog_sled', 'veh_cargo_sleigh', 'veh_depots', 'veh_street', 'veh_signs'], audio3: ['sfx_sleigh_bells', 'sfx_horse_trot', 'sfx_steam_whistle', 'sfx_brakes', 'sfx_door'] },
  era3: { vehicles: ['veh_retro_bus', 'veh_truck_cargo', 'veh_truck_cargo_chief', 'veh_depots', 'veh_street', 'veh_signs', 'veh_lots'], roads: ['road_asphalt', 'roads_decals'], audio3: ['sfx_truck_engine', 'sfx_bus_horn', 'sfx_car_honk_1', 'sfx_car_honk_2', 'sfx_brakes', 'sfx_door'] },
  cars: ['veh_car_a_blue', 'veh_car_a_red', 'veh_car_a_yellow', 'veh_car_b_blue', 'veh_car_b_mint', 'veh_car_b_red', 'veh_car_c_blue', 'veh_car_c_orange', 'veh_car_c_red', 'veh_car_d_blue', 'veh_car_d_cream', 'veh_car_d_red'],
};

export const VEHICLES_MODULE = {
  id: 'vehicles', version: 1, saveKey: VEHICLES_SLICE.key, capBytes: VEHICLES_SLICE.cap,
  needs: ['missions?'],
  gate: rank2,                                             // era 2 starts at 읍
  prefetch: (gs, assets) => {
    const era = gs && gs.v4 && gs.v4.rank && gs.v4.rank.level >= 3 ? 'era3' : 'era2';
    for (const f in FRAGMENTS[era]) assets.fragment(f, { only: FRAGMENTS[era][f].filter((k) => !/^(sfx|amb)_/.test(k)), audio: FRAGMENTS[era][f].filter((k) => /^(sfx|amb)_/.test(k)) });
  },
  create: (ports, saved) => new VehiclesHost(ports, saved, { View: VehiclesView, tuning: v5().vehicles }),
  sanitize: sanitizeVehicles,
  previews: {
    // 이야기 미리보기 (designer menu, §5.8): 버스 타기 · 개썰매 배달 · 도시 승격식
    busRide: (host) => { const near = host.api.stopNear(host.ports.chief.x(), host.ports.chief.y(), 9999); return near ? host.api.ride(near, near === 'S1' ? 'S3' : 'S1') : null; },
    sledRun: (host) => host.api.drive({ tpl: 'preview', vehicle: 'dog_sled', route: 'mail' }),
    cityCeremony: (host) => host.onFeed({ t: 'rank', level: 3, ceremony: true }),
  },
};

export const MODULES = [VEHICLES_MODULE];
