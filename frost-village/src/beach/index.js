// beach_runtime module entry for the ModuleHost (docs/v5_v8_plan.md §5.2 / §6.5). Nothing runs until the lead's P1
// block constructs it; v4 behaves exactly as today without it.
//   BEACH_MODULE — 햇살 해변: the call at harbour ★2, the road east, the snow-to-sand walk and the reveal, the clean-up,
//   the lifeguard (해수욕장 개장), the beach founding board (7 shops), the resort hotel + pool, the aquarium, the beach
//   crowd, boats and crabs, night lights, events (모래성 대회 · 불꽃놀이 · 북극곰 수영 대회 · 축제 주간), P9–P12 (slice 2 KB)

import { BeachHost } from './host.js';
import { BeachView } from './view/BeachView.js';
import { sanitizeBeach, BEACH_SLICE } from './save.js';

/** art and sound (late fragments: only these files; Residency classes `beach` (area) and `dollBeach` evict them) */
export const FRAGMENTS = {
  beach: ['beach_ground_decals', 'beach_nature', 'beach_play', 'beach_service', 'beach_shade', 'beach_tiles', 'beach_water', 'beach_crab', 'beach_swan_pedal_boat', 'beach_kayak_crew', 'beach_banana_boat_crew', 'ground_sand', 'ground_sand_wet'],
  beach_bld: ['bbld_hotel', 'bbld_shops', 'bbld_civic', 'bbld_street'],          // + bbld_glow at dusk (lazy)
  beachfolk: ['bf_head_0', 'bf_child_slim_0', 'bf_adult_slim_0', 'bf_adult_slim_1', 'bf_adult_slim_2', 'bf_elder_slim_0', 'bf_elder_slim_1'],
  water: ['fx_swim_ripple', 'fx_splash_small', 'fx_splash_big', 'fx_wake_v2', 'fx_wake_v2_ne', 'fx_sparkle_water'],
  audio5: ['bgm_beach', 'amb_beach', 'sfx_wave_wash', 'sfx_wave_wash_2', 'sfx_wave_wash_3', 'sfx_wave_crash_1', 'sfx_wave_crash_2', 'sfx_wave_crash_3', 'sfx_splash_1', 'sfx_splash_1b',
    'sfx_splash_1c', 'sfx_splash_2', 'sfx_lifeguard_whistle', 'sfx_icecream_bell', 'sfx_beachball_bounce', 'sfx_hotel_bell', 'sfx_pool_splash', 'sfx_sand_step_1', 'sfx_sand_step_2',
    'sfx_sand_step_3', 'sfx_sand_step_4', 'sfx_sand_step_5', 'sfx_beach_kids_1', 'sfx_beach_kids_2', 'sfx_beach_kids_3', 'sfx_beach_kids_4'],
  ships: ['ship_yacht'],                                                          // the banana boat's tow (v6 art)
};
/** harbour ★2 opens the beach (the call comes a minute later) */
const harbor2 = (gs) => !!(gs && gs.later && gs.later.harbor && gs.later.harbor.star && gs.later.harbor.star() >= 2);

export const BEACH_MODULE = {
  id: 'beach', version: 1, saveKey: BEACH_SLICE.key, capBytes: BEACH_SLICE.cap,
  needs: ['harbor', 'missions?', 'story?', 'vehicles?'],
  gate: harbor2,
  prefetch: (gs, assets) => {
    assets.fragment('beach', { only: ['beach_nature', 'beach_ground_decals', 'ground_sand', 'ground_sand_wet'] });   // the walk east shows sand and palms first
    assets.fragment('audio5', { audio: ['bgm_beach', 'amb_beach', 'sfx_sand_step_1', 'sfx_sand_step_2', 'sfx_sand_step_3'] });
  },
  create: (ports, saved) => new BeachHost(ports, saved, { View: BeachView }),
  sanitize: sanitizeBeach,
  previews: {
    // 이야기 미리보기 (designer menu, §5.8): 해변 하루 · 북극곰 수영
    beachDay: (host) => host.view && host.view.preview('day'),
    polarSwim: (host) => host.view && host.view.preview('polar'),
  },
};

export const MODULES = [BEACH_MODULE];
