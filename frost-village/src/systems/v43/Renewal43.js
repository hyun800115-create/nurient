// (v4.3 step B, B0 stub — WP-N owns this file) 「마을 새 단장」: the standalone letter card a remapped village reads once
// (built from v43.refunds43), then the 「새 지도 보기」 3-tap tour (src/scenes/OnboardOverlay.js). build_plan.md §3.10, BP-5.
//
//   Renewal43.afterLoad(gs, info)   registered on the after-load seam by src/systems/v43/index.js. N: on info.remapped
//                                   and !gs.v43.seen.letter43 it opens the card (and clears progress.bakeryMovedNow so the
//                                   bakery banner at Game.build does not fire); a new game shows nothing
//   Renewal43Card                   the card in the UI scene, mounted by UI.create (BP-26) as ui.renewal43
//
// B0: both do nothing.

export const Renewal43 = {
  /** after-load hook (src/systems/v43/hooks.js runAfterLoad) */
  afterLoad(gs, info) { /* N */ },
};

/** the letter card (UI scene). B0 stub: never opens */
export class Renewal43Card {
  constructor(ui) {
    this.ui = ui;
    this.isOpen = false;
  }
  /** open the letter for `gs.v43.refunds43`; returns whether it opened */
  open(data) { return false; }
  close() { this.isOpen = false; }
}
