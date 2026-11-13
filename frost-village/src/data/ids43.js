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
  g43s4: 'g43s4',          // (B0b) G: the mkt_s4 pad may show (GOALS43 row 9 became current, or 읍 with goals43.s4Early)
});
export const SEEN43 = Object.freeze({
  letter: 'letter43',      // the 「마을 새 단장」 letter was read (N)
  tour: 'tour43',          // the 「새 지도 보기」 tour was done or skipped (N)
  s4offer: 's4offer',      // the stage-4 offer banner after the ceremony was shown (H)
  // (B0b, postdepot_addendum.md §5.5) the post-depot chain (G) and the 읍장 취임 맛보기 (T). The row markers are the
  //  G43 ids of rows 1–8 themselves (v43.seen.g43_staff …); seen keys are lower case only (sanitizeV43 drops the rest, BP-46)
  g43open: 'g43open',      // G: the chain opened (every V42_BUILDS building stands; baselines taken)
  g43all: 'g43all',        // G: rows 1–8 all marked; replaces the eight row keys (BP-54)
  g43ready: 'g43ready',    // G: the taste pad was shown once (its banner); the pad stays from then on (BP-43)
  taste: 'eup_taste',      // T: the 읍장 취임 맛보기 was seen (End or Skip). Never part of v4.4's ceremony predicate (§5.6)
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
  goal43: 'goal43',        // (B0b) G: a post-depot row               { id, state: 'pre' | 'now' | 'done' | 'open' }
  taste: 'taste',          // (B0b) T: the 읍장 취임 맛보기            { state: 'pad' | 'start' | 'title' | 'teaser' | 'end' | 'skip' }
});

// ---- (v4.3 step B, B0b — postdepot_addendum.md §3, §5, §6.1) the post-depot chain GOALS43 (package G, after the v4.2
//  buildings on the main road) and the 읍장 취임 맛보기 (package T, its row 10). Row ids 1–8 are also their v43.seen
//  markers (/^[a-z0-9_]{1,24}$/); row 9 is the mkt_s4 step itself (STEP43.shop4); row 10's marker is SEEN43.taste
export const G43 = Object.freeze({
  staff: 'g43_staff',      // 1 물류창고 직원 {n}명 뽑기 (depot hires ≥ goals43.need.staff)
  fork: 'g43_fork',        // 2 물류창고에 지게차 들이기
  st2: 'g43_st2',          // 3 가공소 2단 하나 더 (against the baseline x.g43.u; soft)
  deco: 'g43_deco',        // 4 마을 꾸미기 {n}곳 더 (against the baseline x.g43.k; soft)
  house: 'g43_house',      // 5 첫 집 두 채 짓기 (soft: lockVacant)
  dlv: 'g43_dlv',          // 6 이웃 마을 정기 납품 {n}번 (counter x.g43.d)
  train: 'g43_train',      // 7 기차로 짐 {n}번 보내기 (counter x.g43.t; passive, never gates rows 9–10)
  shop: 'g43_shop',        // 8 가게 키우기: mkt_s3 + hire_clerk_s3 (soft)
  s4: 'mkt_s4',            // 9 가게 4단 「눈꽃마을 시장」 (= STEP43.shop4; only when STEPS has it, BP-53)
  taste: 'g43_taste',      // 10 읍장 취임 맛보기 (only when EupTaste.enabled, BP-53)
});
// ---- the `x` drawer keys of step B (Save.js keepX: /^[a-z][a-z0-9_]{0,15}$/). S adds the named cap X_CAPS.g43 = 48 (BP-47)
export const X43KEY = Object.freeze({
  goals: 'g43',            // G: { d, t, k, u } deliveries, trains, decor baseline, 2단 baseline (removed once rows 3, 4, 6, 7 are marked)
});
