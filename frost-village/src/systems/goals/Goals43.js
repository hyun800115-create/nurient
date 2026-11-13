// (v4.3 step B, B0b stub — WP-G owns this file) 물류창고 다음 목표: the post-depot chain GOALS43 on the main road, after
// the v4.2 buildings (docs/redesign_v43/stepB/postdepot_addendum.md §3, BP-35 … BP-56). G fills it; T reads its gate.
//
//   Goals43.attach(gs, info)     registered on the after-load seam by src/systems/v43/index.js (after N's letter, before
//                                P1). G: makes gs.goals43 (a new one at every Game.build: a scene restart keeps the scene
//                                object), ticks from the scene's 'update' event, listens to gs.events 'v4:train' /
//                                'v4:cardDone', and removes every listener on the scene's 'shutdown' (BP-56)
//   gs.goals43.rows(active, book)   the rows after the v4.2 buildings in the GoalBook shape
//                                { id, kind: 'g43', name, icon, coins, items, have, need, state, place, why };
//                                active = the v4.2 rows are all done (GoalBook.mainRows section 4)
//   gs.goals43.sideRows(cur, coins) side rows G adds (the depot pads that no not-done G row uses as its place)
//   gs.goals43.refs()            a Set of the places (Pad / Site objects, as in row.place.ref) of the G rows not done:
//                                GoalBook.sideRows never lists them as side rows (BP-52)
//   gs.goals43.sub(r)            the line under a 'g43' row, or null for GoalBook's generic line
//   gs.goals43.objective(T, mode)   Tutorial.v42Goal: 'place' -> { x, y, h, key, text, cost, pay, pad, hold } for a
//                                current row with a place, 'text' -> { key, text } for one without; else null (BP-55)
//   gs.goals43.current()         the current row (BAL-b's chain bot follows it), or null
//
// B0b: attach does nothing (gs.goals43 stays unset, so every seam is a no-op); the class answers "nothing".

import { G43 } from '../../data/ids43.js';

/** the rows in order (§3.1). `k` names the row's BALANCE.goals43.need / reward entries. Row 9 (`step`) is present only
 *  when STEPS has the mkt_s4 step, row 10 (`taste`) only when EupTaste.enabled (BP-53). G owns the rules */
export const GOALS43 = Object.freeze([
  Object.freeze({ id: G43.staff, k: 'staff', icon: ['ui_icon_staff', 'ui_icon_worker'] }),
  Object.freeze({ id: G43.fork, k: 'fork', icon: ['ui_icon_forklift', 'ui_icon_delivery'] }),
  Object.freeze({ id: G43.st2, k: 'st2', icon: ['ui_icon_speed', 'ui_icon_tools'], soft: true }),
  Object.freeze({ id: G43.deco, k: 'deco', icon: ['ui_icon_flower', 'ui_icon_house'], soft: true }),
  Object.freeze({ id: G43.house, k: 'house', icon: ['ui_icon_move_in', 'ui_icon_house'], soft: true }),
  Object.freeze({ id: G43.dlv, k: 'dlv', icon: ['ui_icon_mission', 'ui_icon_request'] }),
  Object.freeze({ id: G43.train, k: 'train', icon: ['ui_icon_boxcar', 'ui_icon_delivery'], passive: true }),
  Object.freeze({ id: G43.shop, k: 'shop', icon: ['ui_icon_stock', 'ui_icon_hammer'], soft: true }),
  Object.freeze({ id: G43.s4, k: 's4', icon: ['ui_icon_hammer'], step: true }),
  Object.freeze({ id: G43.taste, k: 'taste', icon: ['ui_badge_rank_2', 'ui_icon_title'], taste: true }),
]);

export class Goals43 {
  /** after-load hook (src/systems/v43/hooks.js runAfterLoad). B0b: does nothing */
  static attach(gs, info) { /* G */ }

  constructor(gs) { this.gs = gs; }
  rows(active, book) { return []; }
  sideRows(cur, coins) { return []; }
  refs() { return new Set(); }
  sub(r) { return null; }
  objective(T, mode) { return null; }
  current() { return null; }
}
// (B0b: G deletes this line; tools/test/v43_contracts.test.mjs checks the stub's answers only while it is set)
Goals43.stub = true;
