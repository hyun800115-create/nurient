// (v4.3 step B 「마을 새 단장 둘째 걸음」, B0) the shared names of step B: plot ids, step ids, flags, seen keys, the save
// marker and the event names of the v43 bus (docs/redesign_v43/stepB/build_plan.md §2). Every package reads them from
// here and never spells them again. Plain data, no imports: Node tests and tools/test/v43_helpers.mjs read it too.
//
//   - an id here is never re-used for something else (a save keys its sites by plot id)
//   - the rows themselves (positions, `only`, `after`, `hidden`, `types`, `pads`) live in world.js (L owns them)
//   - a package that needs a name that is not here adds it in its own line at the end of the block it belongs to

// ---- the save marker (S writes `lv` after `v`; R43 remaps a save whose v43.lay < LAY)
export const LV = 43;                                    // save `lv` of every step-B build
export const LAY = 2;                                    // v43.lay: absent / 0 / 1 = the pre-B layout, 2 = plot table v2
export const PRE43_KEY = 'frostVillage.save.backup.pre43';   // the copy kept before the first remap (written once)
export const CODE_FMT = 2;                               // 마을 옮기기 code format from step B (codes carry `lv`)

// ---- plot ids (WORLD.plots keys). w_hall moves to (180, 760) XL in L1; w_civic keeps the old w_hall footprint, hidden
export const PLOT43 = Object.freeze({
  hall: 'w_hall',          // 마을회관 (only town_hall, after hire_hunter)
  rest: 'w_rest',          // 큰 식당 (the hall is no longer offered there)
  civic: 'w_civic',        // hidden: the old w_hall footprint, kept for later civic buildings
  tool: 'd_tool',          // 대장간
  wh: 'd_wh',              // 창고
  cannery: 'd_cannery',    // 통조림 공장 (pads: line, p2, mcan)
  store: 'd_store',        // 잡화점
  labour: 'd_labour',      // hidden: 인력 사무소 (step C, v4.4), only labour_office, after f:rankEup
  school: 'd_school',      // hidden (Q25)
  clinic: 'd_clinic',      // hidden (Q25)
  house1: 'h43_1',         // first houses (ids kept; h43_2 shifts in L1)
  house2: 'h43_2',
  office: 'v42_office',    // 촌장 사무실 (the hut's plot; after zone_mine, a side goal)
});
/** which fixed plot each workshop lives on (D6 / D19: one plot per workshop; R43 moves old ones there) */
export const WORKSHOP_PLOT43 = Object.freeze({ toolsmith: 'd_tool', warehouse: 'd_wh', cannery: 'd_cannery', store: 'd_store', labour_office: 'd_labour' });

// ---- step ids and unlocks
export const STEP43 = Object.freeze({
  shop4: 'mkt_s4',         // 4단 「눈꽃마을 시장」 (type 'shop', level 4, after f:rankEup, side; WORLD.pads.mkt_s4)
  hall: 'town_hall',       // the hall is a building goal: first in GOALS after village complete
});
export const HALL_UNLOCK = 'hire_hunter';                // BUILD_UNLOCK.town_hall from step B (P sets it)

// ---- progress.flags (true) and v43.seen keys (1)
export const FLAG43 = Object.freeze({
  s4half: 's4half',        // set by R43 for a village that was already 읍: stage 4 at market43.stage4Old × the price
});
export const SEEN43 = Object.freeze({
  letter: 'letter43',      // the 「마을 새 단장」 letter was read (N)
  tour: 'tour43',          // the 「새 지도 보기」 tour was done or skipped (N)
  s4offer: 's4offer',      // the stage-4 offer banner after the ceremony was shown (H)
});

// ---- the v43 bus (src/systems/v43/hooks.js emit / on, BP-25). Emitters: P, H, M, N, S; P1 only listens.
//   data is a small plain object; a listener never changes the game
export const EV43 = Object.freeze({
  card: 'card',            // P: a goal / side card shown            { id, side }
  goalwin: 'goalwin',      // P: the goal window opened               { from }
  milestone: 'milestone',  // P / H / M: complete, office, hall, rankEup, mkt_s4 … reached   { id }
  offer: 'offer',          // H: the stage-4 offer banner shown       { id: 'mkt_s4' }
  letter: 'letter',        // N: the 「마을 새 단장」 letter           { state: 'open' | 'close' }
  tour: 'tour',            // N: the 「새 지도 보기」 tour              { state: 'start' | 'step' | 'done' | 'skip', n }
  hold: 'hold',            // S: a save hold card shown               { kind: 'fail' | 'newer' | 'stale' }
  remap: 'remap',          // S: a pre-B village was remapped         { ok, refunds43 }
});
