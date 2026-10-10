// 솔방울 신문 (docs/v5_v8_plan.md §6.1 "Newspaper"): the non-pausing NewsPanel — the newsprint page (ui_newspaper
// 9-slice), the masthead strip with the baked logo (ui_newspaper_logo / _en), the issue line, a headline article
// with a photo slot, up to three article columns, a divider and the sidebar (weather, prices, the bank, a quote).
// Text is the engine's paperText(lang). The page is as tall as its stories (a quiet day is a short paper). Tap
// anywhere or 닫기 to close; the game keeps running.

import { text, button, icon, popIn, NEWS_INK, SOFT } from './widgets.js';
import { s as str } from '../../strings.js';

export class NewsPanel {
  /** paper: { masthead, no, date, headline, lead, articles [{ title, body }], sidebar [], byline }; screen: { w, h } */
  constructor(scene, art, paper, screen, opts = {}) {
    this.scene = scene;
    const lang = opts.lang || 'ko';
    const W = Math.min(680, screen.w - 32), maxH = Math.min(1100, screen.h - 200);
    const x0 = (screen.w - W) / 2;
    this.shade = scene.add.rectangle(screen.w / 2, screen.h / 2, screen.w, screen.h, 0x1f2a3c, 0.35).setInteractive().setDepth(5999);
    this.shade.on('pointerdown', () => this.close());
    const c = this.c = scene.add.container(0, 0).setDepth(6000);
    const page = art.nine(scene, x0 + W / 2, 0, 'ui_newspaper', W, 200);
    if (page) { page.setOrigin(0.5, 0); page.setInteractive(); c.add(page); }
    const inX = x0 + 26, inW = W - 52;
    // masthead + logo
    const mh = art.nine(scene, x0 + W / 2, 26 + 52, 'ui_newspaper_masthead', inW, 104);
    if (mh) { mh.setOrigin(0.5, 0.5); c.add(mh); }
    const logo = art.image(scene, x0 + W / 2, 26 + 46, lang === 'en' ? 'ui_newspaper_logo_en' : 'ui_newspaper_logo');
    if (logo) { logo.setOrigin(0.5, 0.5); const s = Math.min(1, (inW - 200) / logo.width, 64 / logo.height); logo.setScale(s); c.add(logo); }
    else c.add(text(scene, x0 + W / 2, 74, paper.masthead, { size: 44, ox: 0.5, oy: 0.5, color: NEWS_INK }));
    let y = 26 + 104 + 8;
    // the first edition the chief gets is the 창간호 (the host numbers issues from it, critique M3)
    const issue = paper.first || paper.no === 1 ? str(lang, 'newsFirst') : str(lang, 'newsNo', { n: paper.no });
    c.add(text(scene, inX + 4, y, issue + '  ·  ' + paper.date, { size: 17, weight: '700', color: SOFT }));
    if (paper.byline) c.add(text(scene, inX + inW - 4, y, paper.byline, { size: 17, weight: '700', color: SOFT, ox: 1 }));
    y += 32;
    // the headline story with a photo slot
    const photoW = 168, photoH = 136;
    const ph = art.nine(scene, inX + photoW / 2, y + photoH / 2, 'ui_newspaper_photo', photoW, photoH);
    if (ph) { ph.setOrigin(0.5, 0.5); c.add(ph); }
    const pic = icon(scene, art, inX + photoW / 2, y + photoH / 2, opts.photoIcon || 'ui_icon_story', 96);
    if (pic) c.add(pic);
    const hx = inX + photoW + 16, hw = inW - photoW - 16;
    const head = text(scene, hx, y - 2, paper.headline || '', { size: 31, wrap: hw, color: NEWS_INK, lineSpacing: 2 });
    c.add(head);
    const lead = text(scene, hx, head.y + head.height + 8, clip(paper.lead || '', 140), { size: 18, weight: '600', wrap: hw, color: NEWS_INK, lineSpacing: 5 });
    c.add(lead);
    y = Math.max(y + photoH, lead.y + lead.height) + 14;
    const divider = (yy) => { const dv = art.nine(scene, inX + inW / 2, yy, 'ui_newspaper_divider', inW, 16); if (dv) { dv.setOrigin(0.5, 0.5); c.add(dv); } };
    divider(y);
    y += 18;
    // up to three articles in columns (as tall as the longest). The column art has a 36 px headline band (headlineBox
    // y 9) and its body starts below the band's rule (nineSlice top 54 / contentInset top 56): the title fits the band
    // (smaller type, two lines when long), the body starts under the rule — never through it (critique M3)
    const arts = (paper.articles || []).slice(0, 3);
    if (arts.length) {
      const n = arts.length, gap = 12, colW = Math.floor((inW - gap * (n - 1)) / n);
      const band = { top: 9, h: 36 }, bodyTop = 58;
      const parts = arts.map((a, i) => {
        const cx = inX + i * (colW + gap);
        const t = headline(scene, cx + 12, y + band.top, colW - 24, band.h, a.title);
        const b = text(scene, cx + 12, y + bodyTop, clip(a.body, n === 1 ? 160 : 90), { size: 16, weight: '600', wrap: colW - 24, color: NEWS_INK, lineSpacing: 5 });
        return { cx, t, b };
      });
      const colH = Math.min(340, Math.max(...parts.map((p) => p.b.y + p.b.height - y)) + 16);
      for (const p of parts) {
        const col = art.nine(scene, p.cx + colW / 2, y + colH / 2, 'ui_newspaper_column', colW, colH);
        if (col) { col.setOrigin(0.5, 0.5); c.add(col); }
        c.add([p.t, p.b]);
      }
      y += colH + 14;
      divider(y); y += 18;
    }
    // the sidebar: weather, prices, the bank, a quote
    const side = (paper.sidebar || []).slice(0, 4);
    if (side.length) {
      c.add(text(scene, inX + 4, y, str(lang, 'newsSidebar'), { size: 19, color: NEWS_INK }));
      y += 32;
      for (const sline of side) { const t = text(scene, inX + 4, y, '• ' + clip(sline, 70), { size: 16, weight: '600', wrap: inW - 8, color: NEWS_INK }); c.add(t); y += t.height + 6; }
    }
    y += 16;
    const H = Math.min(maxH, Math.max(420, y + 76));
    if (page) page.setSize(W, H);
    c.add(button(scene, art, x0 + W - 90, H - 50, 130, 50, str(lang, 'newsClose'), () => this.close(), { size: 20 }));
    c.y = Math.max(90, Math.round((screen.h - H) / 2 - 30));
    this.h = H;
    popIn(scene, c, 0.92);
  }
  close() {
    const c = this.c;
    if (this.shade) { this.shade.destroy(); this.shade = null; }
    if (!c || !c.scene) return;
    this.c = null;
    this.scene.tweens.add({ targets: c, alpha: 0, duration: 200, onComplete: () => c.destroy() });
    if (this.onClose) this.onClose();
  }
}

function clip(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

/** a column title inside its headline band: one line at 18 px, else 15 px, else two lines at 14 px, centred in the band */
function headline(scene, x, y, w, h, title) {
  const s = String(title || '');
  for (const size of [18, 15]) {
    const t = text(scene, x, y + h / 2, s, { size, color: NEWS_INK, oy: 0.5 });
    if (t.width <= w) return t;
    t.destroy();
  }
  const t = text(scene, x, y + h / 2, clip(s, 40), { size: 14, wrap: w, color: NEWS_INK, lineSpacing: 0, oy: 0.5 });
  if (t.height > h + 2) { t.setText(clip(s, 22)); }
  return t;
}
