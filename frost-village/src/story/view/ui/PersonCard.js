// 주민 카드 (docs/v5_v8_plan.md §6.1 "Person card", P34): v4's name card grows into a little profile — name, age,
// job, home, 단짝, spouse or sweetheart, children, likes, the last thing they remember about the chief — and keeps
// the chat's 수다 떨기 button. Data: StoryHost.api.card(pid) (≤ 1 game day old).

import { text, button, flat, icon, popIn, INK, SOFT } from './widgets.js';
import { s as str } from '../../strings.js';

export class PersonCard {
  /** card: engine card() + { known, regular }; at: { x, y } screen anchor (above the person); opts: { lang, onTalk, onClose } */
  constructor(scene, art, card, at, screen, opts = {}) {
    this.scene = scene;
    const lang = opts.lang || 'ko';
    const W = 420;
    const rows = [];
    const add = (k, v) => { if (v) rows.push([str(lang, k), v]); };
    add('cardJob', card.job);
    add('cardHome', card.home);
    if (card.spouse) add('cardSpouse', card.spouse.name);
    else if (card.partner) add('cardPartner', card.partner.name);
    if (card.best) add('cardBest', card.best.name);
    if (card.kids && card.kids.length) add('cardKids', card.kids.slice(0, 3).map((k) => k.name + (lang === 'en' ? ' (' + k.age + ')' : '(' + k.age + ')')).join(', '));
    add('cardLikes', (card.likes || []).slice(0, 3).join(', '));
    const H = 132 + rows.length * 34 + (card.chiefMemory ? 76 : 0) + 76;
    const x = Math.max(16 + W / 2, Math.min(screen.w - 16 - W / 2, at.x)), y = Math.max(140 + H / 2, Math.min(screen.h - 200 - H / 2, at.y - H / 2 - 40));
    const c = this.c = scene.add.container(x, y).setDepth(5500);
    const bg = art.nine(scene, 0, 0, 'ui_panel', W, H) || flat(scene, W, H, 0xfff8ec);
    if (bg.setOrigin) bg.setOrigin(0.5, 0.5);
    c.add(bg);
    let yy = -H / 2 + 22;
    const nm = text(scene, -W / 2 + 26, yy, card.name, { size: 30, color: INK });
    c.add(nm);
    c.add(text(scene, nm.x + nm.width + 10, yy + 9, str(lang, 'cardAge', { n: card.age }), { size: 19, weight: '700', color: SOFT }));
    if (card.regular || card.known) {
      const badge = text(scene, W / 2 - 24, yy + 6, card.regular ? str(lang, 'cardKnown') : '', { size: 17, color: '#d0802a', ox: 1 });
      c.add(badge);
    }
    yy += 52;
    for (const [k, v] of rows) {
      c.add(text(scene, -W / 2 + 26, yy, k, { size: 17, weight: '700', color: SOFT }));
      c.add(text(scene, -W / 2 + 140, yy - 1, v, { size: 19, weight: '800', color: INK, wrap: W - 166 }));
      yy += 34;
    }
    if (card.chiefMemory) {
      yy += 6;
      const ic = icon(scene, art, -W / 2 + 46, yy + 26, 'ui_icon_memory', 44);
      if (ic) c.add(ic);
      c.add(text(scene, -W / 2 + 78, yy, str(lang, 'cardChief'), { size: 15, weight: '700', color: SOFT }));
      c.add(text(scene, -W / 2 + 78, yy + 20, card.chiefMemory, { size: 18, weight: '700', color: INK, wrap: W - 104 }));
      yy += 76;
    }
    c.add(button(scene, art, 0, H / 2 - 44, 190, 54, str(lang, 'cardTalk'), () => opts.onTalk && opts.onTalk(card), { key: 'ui_button_green', size: 21 }));
    popIn(scene, c, 0.9);
  }
  close() { const c = this.c; if (!c || !c.scene) return; this.c = null; this.scene.tweens.add({ targets: c, alpha: 0, scale: 0.92, duration: 160, onComplete: () => c.destroy() }); }
}
