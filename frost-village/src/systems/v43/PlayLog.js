// (v4.3 step B, B0 stub — WP-P1 owns this file) 놀이 기록 (테스터용): the opt-in play log, decisions.md §9 /
// build_plan.md §3.12. Off by default and off in production builds; records into the save's `x.log` (≤ 512 B) only after
// the player turned it on. It only LISTENS: the v43 bus (src/systems/v43/hooks.js, names in src/data/ids43.js EV43) and
// its own update for the joystick / 관망 seconds (BP-25). The migration result is read at export time from the save's
// v43.src and v43.refunds43 (BP-23).
//
// B0: does nothing.

export const PlayLog = {
  /** after-load hook (src/systems/v43/hooks.js runAfterLoad) */
  afterLoad(gs, info) { /* P1 */ },
};
