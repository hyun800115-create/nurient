// 금방 module entry (plan §12). Nothing runs until the lead's G-P1 block constructs it behind its gate (the v4.2
// depot built); v4.2 behaves exactly as today without it (reqlog_gb.mjs: the first 20 minutes stay byte-identical).
//   GEUMBANG_MODULE — the online market + the 금방 delivery (vans, couriers, the dog sled), slice ≤ 1,400 B

import { BALANCE } from '../data/balance.js';
import { GeumbangHost } from './host.js';
import { sanitizeGeumbang, GEUMBANG_SLICE } from './save.js';
import { gbTuning } from './tuning.js';

/** the late art and sound (plan §10.4 residency): pages load where they are seen */
export const FRAGMENTS = {
  geumbang: { core: ['gb_bld_0'], van: ['gb_van_0'] },          // gb_bld_0 → gb_core (with ui6's resident icons) at G-P14
  geumbangfolk: { road: ['gbf_road_0'], hub: ['gbf_hub_0'] },
  ui6: { resident: ['ui6_gb'] },                                  // the app frames move to a transient page at G-P14
  audio8: { sprite: ['audio8_sprite'] },
};

const depotBuilt = (gs) => !!(gs && gs.v42 && gs.v42.depot && gs.v42.depot.built);

export const GEUMBANG_MODULE = {
  id: 'geumbang', version: 1, saveKey: GEUMBANG_SLICE.key, capBytes: GEUMBANG_SLICE.cap,
  needs: [],
  gate: depotBuilt,                                               // D2: nothing loads before the depot exists
  prefetch: (gs, assets) => {
    assets.fragment('geumbang', { only: FRAGMENTS.geumbang.core });
    assets.fragment('ui6', { only: FRAGMENTS.ui6.resident });
    assets.fragment('audio8', { audio: ['sfx_gb_doorbell', 'sfx_gb_doorbell_2', 'sfx_gb_horn', 'sfx_gb_chime', 'sfx_gb_thump', 'sfx_gb_thump_2', 'sfx_gb_jingle', 'sfx_gb_tape', 'sfx_gb_tape_2', 'sfx_gb_scan', 'sfx_gb_locker'] });
  },
  create: (ports, saved, View) => new GeumbangHost(ports, saved, { View, tuning: gbTuning(BALANCE) }),
  sanitize: sanitizeGeumbang,
};

export const MODULES = [GEUMBANG_MODULE];
export { GeumbangHost };
