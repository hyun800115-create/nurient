// 이야기 카드 (docs/v5_v8_plan.md §6.1 "Known people", P12 ui.card): a soft card bottom-left (520 × 120 logical px)
// for the life beats of people the chief knows — sweethearts, a proposal, good news, a baby (with 이름 짓기), a first
// school day, a birthday, an elder's wish, a gentle farewell (a white flower, 14 s). One at a time; the host queues
// three and sends older ones to the hall board's 마을 소식. Never modal.

import { text, button, icon, popIn, INK, SOFT } from './widgets.js';

export class StoryCard {
  /** scene: the UI scene; art; layout: { x, y, w, h } (logical px); opts: { lang, onWatch(card), onName(card) } */
  constructor(scene, art, card, layout, opts = {}) {
    this.scene = scene;
    const lang = opts.lang || 'ko';
    const L = Object.assign({ x: 16, y: 1100, w: 520, h: 120 }, layout || {});
    const c = this.c = scene.add.container(L.x + L.w / 2, L.y + L.h / 2).setDepth(5000);
    const key = card.kind === 'farewell' || card.kind === 'forgot' ? 'ui_story_card' : card.kind === 'news' ? 'ui_story_card_news' : 'ui_story_card';
    const bg = art.nine(scene, 0, 0, key, L.w, L.h);
    if (bg && bg.setOrigin) bg.setOrigin(0.5, 0.5);
    if (bg) c.add(bg);
    const ix = -L.w / 2 + 50, iy = 6;
    const ic = card.flower ? icon(scene, art, ix, iy, 'item_bouquet', 66) : icon(scene, art, ix, iy, card.icon || 'ui_icon_story', 58);
    if (ic) c.add(ic);
    const hasBtn = !!(card.sheet || card.watch);
    const tw = L.w - 110 - (hasBtn ? 132 : 18);
    const main = text(scene, -L.w / 2 + 92, -L.h / 2 + 30, lang === 'en' ? card.en : card.ko, { size: 21, wrap: tw, color: INK });
    c.add(main);
    const sub = lang === 'en' ? card.subEn : card.subKo;
    if (sub) c.add(text(scene, -L.w / 2 + 92, main.y + main.height + 4, sub, { size: 17, weight: '700', wrap: tw, color: SOFT }));
    if (card.sheet === 'naming') c.add(button(scene, art, L.w / 2 - 74, 6, 124, 50, lang === 'en' ? 'Name' : '이름 짓기', () => opts.onName && opts.onName(card), { size: 20 }));
    else if (card.watch) c.add(button(scene, art, L.w / 2 - 74, 6, 124, 50, lang === 'en' ? 'Go see' : '보러 가기', () => opts.onWatch && opts.onWatch(card), { key: 'ui_button_green', size: 20 }));
    popIn(scene, c, 0.9);
  }
  close() {
    const c = this.c;
    if (!c || !c.scene) return;
    this.scene.tweens.add({ targets: c, alpha: 0, y: c.y + 20, duration: 220, onComplete: () => c.destroy() });
    this.c = null;
  }
}
