// (v4.3 step B, B0b stub — WP-T owns this file) the 읍장 취임 맛보기 cards: the 「읍장」 title card, then the teaser card
// (「다음 업데이트에서 열려요」: 읍장 수업 1 · 마을 경영 창, 지도에서 마을 돌보기; no version number, BP-45).
// docs/redesign_v43/stepB/postdepot_addendum.md §5.3. T makes it on first use in the UI scene itself
// (`ui.eupTaste = ui.eupTaste || new EupTasteCard(ui)`), never mounted from UI.js; it destroys itself on the UI scene's
// 'shutdown' and re-lays itself on 'resize'.
//
// B0b: an empty card that never opens.

export class EupTasteCard {
  constructor(ui) {
    this.ui = ui;
    this.isOpen = false;
  }
}
// (B0b: T deletes this line; v43_contracts.test.mjs checks the stub only while it is set)
EupTasteCard.stub = true;
