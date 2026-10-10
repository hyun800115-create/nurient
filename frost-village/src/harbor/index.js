// harbor_runtime module entry for the ModuleHost (docs/v5_v8_plan.md §5.2 / §6.4). Nothing runs until the lead's
// P1 block constructs it; v4 behaves exactly as today without it.
//   HARBOR_MODULE — 갈매기 항구: the call at 도시, the rail east, the sleepy harbour revived step by step, ferries with
//   tourists, cargo ships with export contracts and imports, trawlers and the fish auction, the coast line (slice 2 KB)

import { HarborHost } from './host.js';
import { HarborView } from './view/HarborView.js';
import { sanitizeHarbor, HARBOR_SLICE } from './save.js';

/** art and sound (late fragments: only these files; Residency class `ship` evicts ship pages out of view) */
export const FRAGMENTS = {
  harbor: ['harbor_landmarks', 'harbor_landmarks_2', 'harbor_buildings', 'harbor_props', 'harbor_water'],
  ships: ['ship_ferry', 'ship_cargo_ship', 'ship_trawler_big', 'ship_tugboat', 'ship_sailboat', 'ship_yacht', 'ship_seagull'],
  audio4: ['sfx_ship_horn_big', 'sfx_ferry_bell', 'sfx_seagull_1', 'sfx_seagull_2', 'sfx_seagull_3', 'sfx_crane', 'sfx_auction_bell', 'sfx_rope_creak', 'amb_harbor', 'bgm_harbor'],
  water: ['fx_wake_v2', 'fx_wake_v2_ne', 'fx_wave_crash', 'fx_splash_small', 'fx_splash_big'],
};
const rank3 = (gs) => !!(gs && gs.v4 && gs.v4.rank && gs.v4.rank.level >= 3);

export const HARBOR_MODULE = {
  id: 'harbor', version: 1, saveKey: HARBOR_SLICE.key, capBytes: HARBOR_SLICE.cap,
  needs: ['vehicles?', 'missions?', 'story?'],
  gate: rank3,                                              // the call comes 1 min after 도시
  prefetch: (gs, assets) => {
    assets.fragment('harbor', { only: FRAGMENTS.harbor });
    assets.fragment('ships', { only: ['ship_seagull'] });   // the other ship pages when a ship is in view (Residency `ship`)
    assets.fragment('audio4', { audio: ['sfx_ship_horn_big', 'sfx_seagull_1', 'sfx_seagull_2'] });
  },
  create: (ports, saved) => new HarborHost(ports, saved, { View: HarborView }),
  sanitize: sanitizeHarbor,
  previews: {
    // 이야기 미리보기 (designer menu, §5.8): 여객선 도착 · 화물선 크레인
    ferry: (host) => host.view && host.view.preview('ferry'),
    crane: (host) => host.view && host.view.preview('crane'),
  },
};

export const MODULES = [HARBOR_MODULE];
