// (v4.3 step B, B0 stub — WP-S owns this file) the save hold cards in the UI scene (build_plan.md §3.5, map_save §4):
//   - the R43 failure card (the village is kept as it was; 「코드 복사」 exports the CURRENT stored keys, BP-15),
//   - the newer-save card (「더 새 버전에서 저장된 마을이에요」: update / 코드 만들기 / 새 마을로 시작),
//   - the second-tab stale banner.
// Mounted by UI.create as ui.saveHold (BP-26), so S never edits UI.js. S also emits EV43.hold on the v43 bus when one shows.
//
// B0: never opens.

export class SaveHoldCard {
  constructor(ui) {
    this.ui = ui;
    this.isOpen = false;
    this.kind = null;          // 'fail' | 'newer' | 'stale' while open
  }
  /** show the card of `kind` ('fail' | 'newer' | 'stale'); returns whether it opened */
  open(kind, opts) { return false; }
  close() { this.isOpen = false; this.kind = null; }
}
