// (v4.3 step B, B0b stub — WP-T owns this file) 읍장 취임 맛보기: GOALS43 row 10, a free stand-on pad at the hall's
// 승격식 spot that opens a 9–21 s scene (bells, residents, confetti, a 「읍장」 card, then a teaser card).
// docs/redesign_v43/stepB/postdepot_addendum.md §5, BP-43 … BP-46, BP-51, BP-57.
//
//   EupTaste.enabled            whether row 10 exists (BP-53). B0b false; T sets true; v4.4 retires it (LV < 44)
//   EupTaste.attach(gs, info)   registered on the after-load seam by src/systems/v43/index.js (after G's). T: the pad, the
//                               start rule (stand 0.6 s), the scene. While the scene runs it sets gs.v4.rank.hold =
//                               'taste' (Rank.js, BP-51: every `ceremonyOn` reader holds as for the 승격식, Rank's own clock
//                               does not run) and clears it at the end and on the scene's 'shutdown'. It writes only
//                               v43.seen.eup_taste (SEEN43.taste) and never gives anything (BP-44)
//   the cards                   src/scenes/EupTasteCard.js, made lazily in the UI scene (gs.ui is a UIProxy: no `add`)
//
// B0b: does nothing.

export const EupTaste = {
  stub: true,              // (B0b: T deletes this line; v43_contracts.test.mjs checks the stub only while it is set)
  enabled: false,
  /** after-load hook (src/systems/v43/hooks.js runAfterLoad) */
  attach(gs, info) { /* T */ },
};
