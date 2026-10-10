// incidents_runtime module entry for the ModuleHost (docs/v5_v8_plan.md §5.2 / §6.7). Nothing runs until the lead's
// P1 block constructs it; v4 (and v5–v7) behave exactly as today without it.
//   INCIDENTS_MODULE — 사건·사고: petty thieves and chases, queue squabbles, snowball windows, dust-cloud scuffles,
//   fires with firefighters, ruins → demolition → rebuilt one level better, moving trucks, the wanted board, the police
//   station, fire-station levels and hydrants, the 안심 bar (rank 4) and the "사건·사고: 켜기 / 끄기" switch (slice 2 KB)

import { IncidentsHost } from './host.js';
import { IncidentsView } from './view/IncidentsView.js';
import { sanitizeIncidents, INCIDENTS_SLICE } from './save.js';
import { ART } from './model/scripts.js';

/** art and sound (late fragments: only these files; Residency classes `incident:<art>` load the rest per scene) */
export const FRAGMENTS = {
  civic: ['civ_police', 'civ_props', 'civ_ruins', 'civ_smoke', 'civ_demo', 'civ_decals', 'civ_excavator', 'civ_dump_truck', 'civ_moving'],
  fx_city: ['ui4_icons', 'fx_alarm_flash', 'fx_siren_glow_red', 'fx_siren_glow_blue', 'fx_question_mark', 'ui_wanted_poster', 'ui_wanted_silhouette'],
  vehicles: ['veh_police_car', 'veh_fire_truck'],
  logistics: ['lgx_moving_truck'],
  audio6: ['sfx_police_whistle', 'sfx_fire_alarm_bell', 'sfx_crowd_gasp', 'sfx_crowd_cheer_small'],
  cityfolk: ['cf_head_0', 'cf_loco_0'],
  life2: ['life2_wedding'],
};
export { ART };

/**
 * the texture keys of an art group (Residency class `incident:<art>`): its cityfolk pages' atlases (minus `cfSkip`,
 * e.g. the elder-only cf_rush_2 in the fire group), its fx sheets and its atlases. `cfPages` = the merged
 * townfolk manifest's `cfPages` (assets/cityfolk/manifest.json cityfolk.cfPages).
 */
export function artKeys(art, cfPages) {
  const A = ART[art];
  if (!A) return [];
  const skip = new Set(A.cfSkip || []), out = [];
  for (const p of A.cityfolk || []) for (const a of ((cfPages && cfPages.groups && cfPages.groups[p]) || { atlases: [] }).atlases) if (!skip.has(a) && !out.includes(a)) out.push(a);
  for (const k of (A.fx || []).concat(A.atlases || [])) if (!out.includes(k)) out.push(k);
  return out;
}

/** v8: the new town is open (the logistics module runs, or the newtown region opened) */
const v8 = (gs) => !!(gs && ((gs.later && gs.later.logistics) || (gs.territory && gs.territory.isOpen && gs.territory.isOpen('newtown'))));

export const INCIDENTS_MODULE = {
  id: 'incidents', version: 1, saveKey: INCIDENTS_SLICE.key, capBytes: INCIDENTS_SLICE.cap,
  needs: ['story?', 'vehicles?', 'missions?', 'bank?', 'logistics?'],
  gate: v8,
  prefetch: (gs, assets) => {
    assets.fragment('civic', { only: ['civ_police', 'civ_props'] });
    assets.fragment('fx_city', { only: FRAGMENTS.fx_city });
    assets.fragment('audio6', { audio: FRAGMENTS.audio6 });
  },
  create: (ports, saved) => new IncidentsHost(ports, saved, { View: IncidentsView }),
  sanitize: sanitizeIncidents,
  previews: {
    // 이야기 미리보기 (designer menu, §5.8): 도둑 추격 · 불 끄기 (+ the rest of the set)
    chase: (host) => host.api.preview('theft', { outcome: 'caught' }),
    fire: (host) => host.api.preview('fire', { outcome: 'minor' }),
    ruin: (host) => host.api.preview('fire', { outcome: 'ruin', ruinWait: 20, demolish: 40, construct: 40 }),
    scuffle: (host) => host.api.preview('scuffle'),
    queue: (host) => host.api.preview('queue'),
    window: (host) => host.api.preview('window', { wait: 12 }),
  },
};

export const MODULES = [INCIDENTS_MODULE];
