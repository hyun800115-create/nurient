// What each incident kind is on stage (pure data, docs/v5_v8_plan.md §6.7). The story engine owns the phases and
// their timers (src/story/engine/src/incidents.js); this table says which phases the game shows, which phases wait
// for the game's pictures (ackWait), which art each kind needs and which outcomes count as "resolved well".
//
//   theft    act → chase* → arrest → station → release → done        (chase → wanted → tipped → arrest …: not caught)
//   queue    argue → done (apology | scuffle)
//   window   crash → wait (next morning 08:30) → done (apology with a parent)
//   scuffle  fight* → separate → done (handshake)
//   fire     smoke → dispatch* → spray* → repair → done (minor)  |  → ruin → demolish → construct → done (rebuilt)
//   (* = the engine waits for the game's ack when ackWait is on)

export const KINDS = ['theft', 'queue', 'window', 'scuffle', 'fire'];

export const KIND = {
  theft:   { scene: 'chase',   stage: ['act', 'chase', 'arrest'], ack: ['chase'], art: 'crime', icon: 'ui_icon_thief', apology: 'release' },
  queue:   { scene: 'queue',   stage: ['argue'], ack: [], art: 'crowd', icon: 'ui_icon_story' },
  window:  { scene: 'window',  stage: ['crash'], ack: [], art: 'crowd', icon: 'ui_icon_story', apology: 'done' },
  scuffle: { scene: 'scuffle', stage: ['fight', 'separate'], ack: ['fight'], art: 'crime', icon: 'ui_icon_badge' },
  fire:    { scene: 'fire',    stage: ['smoke', 'dispatch', 'spray'], ack: ['dispatch', 'spray'], art: 'fire', icon: 'ui_icon_fire_alert' },
  // not story incidents, staged by this module with their own slots
  drill:   { scene: 'fire',    stage: ['smoke', 'dispatch', 'spray'], ack: [], art: 'fire', icon: 'ui_icon_hydrant' },
  moving:  { scene: 'moving',  stage: ['in', 'out'], ack: [], art: 'moving', icon: 'ui_icon_move_in' },
};

/** the phases a kind can be put on stage in (a fire seen half way through still shows the hose) */
export const stageable = (kind, phase) => !!(KIND[kind] && KIND[kind].stage.indexOf(phase) >= 0);
/** the engine waits for our ack in this phase (cfg.ackWait) */
export const ackPhase = (kind, phase) => !!(KIND[kind] && KIND[kind].ack.indexOf(phase) >= 0);

/**
 * Art each staged kind needs while it is on stage (Residency classes `incident:<art>`, plan §6.7 budgets): the
 * cityfolk pages (cityfolk manifest cfPages.incidents), the fx_city groups (manifest conventions.lazy), the civic /
 * logistics / vehicles atlases and the audio6 sounds. MiB = RGBA source sums (cityfolk cfPages, fx_city report,
 * civic report); measured again in the lab (docs/build_reports/incidents_runtime.md §6).
 */
export const ART = {
  crime: {
    cityfolk: ['head', 'loco', 'rush', 'crowd', 'scuffle'], fx: ['fx_fight_cloud', 'fx_fight_cloud_back', 'fx_fight_cloud_front', 'fx_siren_glow_red', 'fx_siren_glow_blue', 'fx_question_mark'],
    atlases: ['veh_police_car'], audio: ['bgm_chase', 'sfx_police_whistle', 'sfx_siren_police', 'sfx_cuffs_click', 'sfx_comic_fight', 'sfx_crowd_gasp'], mib: 67.0 + 5.5 + 2,
  },
  crowd: {
    cityfolk: ['head', 'loco', 'crowd'], fx: ['fx_question_mark'], atlases: [], audio: ['sfx_crowd_gasp'], mib: 28.5,
  },
  fire: {
    // (cf_rush_2 holds only elder frames: an elder hurries at a walk in a fire scene, -7.2 MiB keeps the group
    // under the +70 MiB transient budget)
    cityfolk: ['head', 'loco', 'rush', 'crowd', 'fire'], cfSkip: ['cf_rush_2'],
    fx: ['fx_fire_bld_s', 'fx_fire_bld_m', 'fx_fire_glow', 'fx_fire_window', 'fx_smoke_column', 'fx_embers', 'fx_hose_rope', 'fx_hose_tip', 'fx_water_mist', 'fx_steam_puff', 'fx_alarm_flash', 'fx_siren_glow_red'],
    atlases: ['veh_fire_truck', 'civ_props'], audio: ['amb_fire_big', 'sfx_fire_flare', 'sfx_fire_alarm_bell', 'sfx_siren_fire', 'sfx_hose_spray', 'sfx_steam_hiss', 'sfx_crowd_gasp', 'sfx_crowd_cheer_small', 'sfx_collapse_soft'], mib: 59.8 - 7.2 + 19.6,
  },
  rebuild: {
    cityfolk: ['head', 'loco', 'work', 'crowd'], fx: ['fx_demolish_dust'],
    atlases: ['civ_ruins', 'civ_smoke', 'civ_demo', 'civ_decals', 'civ_excavator', 'civ_dump_truck', 'civ_props', 'bld_sites'], audio: ['sfx_excavator', 'sfx_demolish_crunch', 'amb_construction'], mib: 40.0 + 3,
  },
  moving: {
    cityfolk: ['head', 'loco', 'work'], fx: [], atlases: ['lgx_moving_truck', 'civ_moving', 'civ_props'], audio: ['sfx_moving_truck', 'sfx_box_drop'], mib: 28.3 + 6,
  },
  // the police station's own car in its bay (held while the station is near the view)
  station: {
    cityfolk: [], fx: [], atlases: ['veh_police_car'], audio: [], mib: 5.5,
  },
  // the rebuilt house's opening (v4's flower stands by the door): held while the building shows 'rebuilt'
  opening: {
    cityfolk: [], fx: [], atlases: ['life2_wedding'], audio: [], mib: 1.6,
  },
};

/** outcomes that end an incident (engine I.outcome at phase 'done') and which ones are "resolved well" for 안심 */
export const GOOD_OUTCOMES = { released: 1, apology: 1, handshake: 1, minor: 1, scuffle: 1, surrender: 1, tip: 1 };
