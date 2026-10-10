// 아기 이름 짓기 (docs/v5_v8_plan.md §6.1 "Birth", mission C3): a bottom sheet with three names from the engine's
// pool for the newest generation (namePool) and "부모님이 정할게요"; a gift box goes along. Never modal: the game runs.

import { text, button, flat, icon, popIn, INK, SOFT } from './widgets.js';
import { s as str } from '../../strings.js';

export class NamingSheet {
  /** names: [{ ko, en }] (3), parents: '도윤 씨 & 서아 씨'; opts: { lang, onPick(name | null) } */
  constructor(scene, art, names, parents, screen, opts = {}) {
    this.scene = scene;
    const lang = opts.lang || 'ko';
    const W = screen.w - 32, H = 330;
    const c = this.c = scene.add.container(screen.w / 2, screen.h - H / 2 - 24).setDepth(5800);
    const bg = art.nine(scene, 0, 0, 'ui_panel', W, H) || flat(scene, W, H, 0xfff8ec);
    if (bg.setOrigin) bg.setOrigin(0.5, 0.5);
    c.add(bg);
    const st = icon(scene, art, -W / 2 + 70, -H / 2 + 70, 'ui_icon_baby', 80) || icon(scene, art, -W / 2 + 70, -H / 2 + 70, 'item_gift_box', 78);
    if (st) c.add(st);
    c.add(text(scene, -W / 2 + 128, -H / 2 + 34, str(lang, 'nameTitle'), { size: 30, color: INK }));
    c.add(text(scene, -W / 2 + 128, -H / 2 + 76, str(lang, 'nameSub', { parents }), { size: 19, weight: '700', color: SOFT }));
    const bw = Math.floor((W - 64 - 2 * 16) / 3);
    names.slice(0, 3).forEach((n, i) => {
      const b = button(scene, art, -W / 2 + 32 + bw / 2 + i * (bw + 16), 10, bw, 74, '', () => this.pick(n, opts), { key: 'ui_button_blue', size: 28 });
      b.label.setText(n.ko).setFontSize(30).setY(-12);
      const en = text(scene, 0, 20, n.en, { size: 16, weight: '700', color: '#e8f1ff', ox: 0.5, oy: 0.5 });
      b.add(en);
      c.add(b);
    });
    c.add(button(scene, art, 0, H / 2 - 56, W - 120, 56, str(lang, 'nameParents'), () => this.pick(null, opts), { key: 'ui_button_gray', size: 21 }));
    const gift = icon(scene, art, W / 2 - 54, -H / 2 + 60, 'item_gift_box', 64);
    if (gift) { c.add(gift); scene.tweens.add({ targets: gift, angle: { from: -6, to: 6 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' }); }
    popIn(scene, c, 0.95);
  }
  pick(n, opts) { if (opts.onPick) opts.onPick(n); this.close(); }
  close() { const c = this.c; if (!c || !c.scene) return; this.c = null; this.scene.tweens.add({ targets: c, y: c.y + 120, alpha: 0, duration: 220, onComplete: () => c.destroy() }); }
}
