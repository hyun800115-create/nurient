// Settlement — the 물류 금고 (the till pad on the forecourt with its little coin pile), the stamp at the counter
// ("쾅!" + the receipt-and-stamp icon + sfx_stamp, then sfx_coin_count and the coins), the owners' thank-you bubbles,
// and the chip over the roof: today's deliveries and what is in the till.

import { spriteImage, spriteFrame, def } from './art.js';
import { lt, ltPick } from '../strings.js';

const TXT = (size, color = '#ffffff', stroke = '#2b2f3a', st = 6) => ({ fontFamily: 'Pretendard, "Apple SD Gothic Neo", sans-serif', fontSize: size + 'px', fontStyle: '900', color, stroke, strokeThickness: st, resolution: 2 });

export class Settlement {
  constructor(view) {
    this.v = view;
    const sc = this.scene = view.scene;
    const [tx, ty] = [view.bx + view.geo.till[0], view.by + view.geo.till[1]];
    this.tx = tx; this.ty = ty;
    this.pad = spriteImage(sc, 'ui_pad_cash', tx, ty);
    if (this.pad) this.pad.setDepth(view.D - 0.44).setScale(0.62).setAlpha(0.95);
    this.coins = [];
    this.cash = -1;
    // the chip over the roof: [box] today · [coin] till. One container, counter-scaled when zoomed out so it stays
    // readable (x1 at zoom >= 0.85, up to x1.45 at zoom 0.6)
    const [cx, cy] = [view.bx + view.chip[0], view.by + view.chip[1]];
    this.chip = { x: 0, y: 0 };
    this.chipC = sc.add.container(cx, cy).setDepth(view.labelDepth);
    this.chipG = sc.add.graphics();
    this.chipBox = spriteImage(sc, 'ui_icon_box', -118, 0);
    this.chipCoin = spriteImage(sc, 'ui_icon_coin', 26, 0);
    for (const im of [this.chipBox, this.chipCoin]) if (im) im.setOrigin(0.5, 0.5).setDisplaySize(40, 40);
    this.chipA = sc.add.text(-92, 0, '0', TXT(26)).setOrigin(0, 0.5);
    this.chipB = sc.add.text(52, 0, '0', TXT(26, '#ffe27a')).setOrigin(0, 0.5);
    this.chipC.add([this.chipG, this.chipBox, this.chipCoin, this.chipA, this.chipB].filter(Boolean));
    this.chipK = 1;
    this.drawChip(0, 0);
    this.pops = [];
    this.thanksI = 0;
  }
  drawChip(today, cash) {
    const g = this.chipG, { x, y } = this.chip;
    this.chipA.setText(String(today));
    this.chipB.setText(Math.floor(cash).toLocaleString());
    const w = 290;
    g.clear();
    g.fillStyle(0x1f3354, 0.28); g.fillRoundedRect(x - w / 2 + 3, y - 26 + 5, w, 52, 26);
    g.fillStyle(0x2b4f7e, 0.92); g.fillRoundedRect(x - w / 2, y - 26, w, 52, 26);
    g.lineStyle(4, 0xffffff, 0.85); g.strokeRoundedRect(x - w / 2, y - 26, w, 52, 26);
  }
  /** the till's coin pile follows the cash (up to 6 coins) */
  pile(cash) {
    const n = cash <= 0 ? 0 : Math.min(6, 1 + Math.floor(cash / 120));
    while (this.coins.length < n) {
      const k = this.coins.length;
      const im = spriteImage(this.scene, 'item_coin', this.tx + [-10, 10, 0, -8, 9, 0][k], this.ty - 4 - Math.floor(k / 3) * 7 + [0, 2, -4, -6, -4, -9][k]);
      if (!im) break;
      im.setDepth(this.v.D - 0.43 + k * 1e-4).setScale(0.55);
      this.coins.push(im);
    }
    while (this.coins.length > n) this.coins.pop().destroy();
  }
  update(dt, info) {
    const z = this.v.P.view && this.v.P.view.zoom ? this.v.P.view.zoom() : 1;
    const k = Math.round(Math.min(1.45, Math.max(1, 0.85 / Math.max(0.3, z))) * 20) / 20;
    if (k !== this.chipK) { this.chipK = k; this.chipC.setScale(k); }
    if (Math.floor(info.cash) !== this.cash || info.today !== this.today) { this.cash = Math.floor(info.cash); this.today = info.today; this.drawChip(info.today, info.cash); this.pile(info.cash); }
    for (const p of this.pops.slice()) { p.t += dt; if (p.t >= p.life) { for (const o of p.objs) o.destroy(); this.pops.splice(this.pops.indexOf(p), 1); } }
  }
  /** the clerk stamps the ledger: "쾅!" */
  stamp(inside) {
    const v = this.v, sc = this.scene;
    const x = v.bx + v.counter[0], y = v.by + v.counter[1];
    v.sfxAt('sfx_stamp', x, y, 1);
    if (!inside) return;
    // above the heads of the clerk and the owner (the people are ~100 px tall)
    const icon = spriteImage(sc, 'ui_icon_settle', x + 30, y - 128);
    const txt = sc.add.text(x - 36, y - 122, lt(v.lang, 'stamp'), TXT(30, '#ffffff', '#c0392b', 7)).setOrigin(0.5).setDepth(v.labelDepth - 2).setScale(0.3);
    sc.tweens.add({ targets: txt, scale: 1, duration: 160, ease: 'Back.easeOut' });
    sc.tweens.add({ targets: txt, y: y - 150, alpha: 0, delay: 650, duration: 420 });
    const objs = [txt];
    if (icon) {
      icon.setDepth(v.labelDepth - 2).setOrigin(0.5).setDisplaySize(10, 10);
      sc.tweens.add({ targets: icon, displayWidth: 54, displayHeight: 54, duration: 180, ease: 'Back.easeOut' });
      sc.tweens.add({ targets: icon, y: y - 160, alpha: 0, delay: 700, duration: 420 });
      objs.push(icon);
    }
    this.pops.push({ t: 0, life: 1.3, objs });
  }
  /** the coins of a settlement: a float at the counter and three coins hopping to the till */
  coinsFly(n, inside, agentPos) {
    const v = this.v, sc = this.scene;
    const x = v.bx + v.counter[0], y = v.by + v.counter[1];
    v.sfxAt('sfx_coin_count', x, y, 0.8);
    const fx = v.P.fx;
    if (fx && fx.floatText) fx.floatText(inside ? x : this.tx, (inside ? y : this.ty) - 70, '+' + n.toLocaleString(), '#ffe27a', 28);
    for (let k = 0; k < 3; k++) {
      const f = spriteFrame('item_coin');
      if (!f) break;
      const d = def('item_coin');
      const im = sc.add.image(inside ? x : agentPos ? agentPos[0] : this.tx, (inside ? y : agentPos ? agentPos[1] : this.ty) - 40, f.tex, f.frame).setOrigin(d.anchor[0], d.anchor[1]).setScale(0.5).setDepth(v.labelDepth - 3);
      const ox = im.x, oy = im.y;
      const o = { k: 0 };
      sc.tweens.add({ targets: o, k: 1, delay: 120 * k, duration: 520, ease: 'Sine.easeInOut',
        onUpdate: () => { const t = o.k; im.setPosition(ox + (this.tx - ox) * t, oy + (this.ty - 8 - oy) * t - Math.sin(t * Math.PI) * 90); },
        onComplete: () => im.destroy() });
    }
  }
  /** an owner says thank you as they leave the counter */
  thanks(pos) {
    if (!pos) return;
    const v = this.v;
    const line = ltPick(v.lang, 'thanks', this.thanksI++);
    if (v.P.say) { v.P.say(pos[0], pos[1] - 150, line, 1.8); return; }
    this.bubble(pos[0], pos[1] - 150, line, 1.8);
  }
  bubble(x, y, text, life) {
    const sc = this.scene;
    const t = sc.add.text(x, y, text, TXT(22, '#2b2f3a', '#ffffff', 0)).setOrigin(0.5).setDepth(this.v.labelDepth + 2);
    const w = t.width + 26, h = t.height + 14;
    const g = sc.add.graphics().setDepth(this.v.labelDepth + 1);
    g.fillStyle(0xffffff, 0.96); g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 14);
    g.fillTriangle(x - 8, y + h / 2 - 1, x + 8, y + h / 2 - 1, x, y + h / 2 + 10);
    g.lineStyle(3, 0x2b4f7e, 0.35); g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 14);
    this.pops.push({ t: 0, life, objs: [t, g] });
  }
  /** the till emptied into the coin counter */
  collected() { this.cash = -1; }
  setVisible(on) {
    for (const o of [this.pad, this.chipC].concat(this.coins)) if (o) o.setVisible(on);
  }
  destroy() { for (const o of [this.pad, this.chipC].concat(this.coins)) if (o) o.destroy(); for (const p of this.pops) for (const o of p.objs) o.destroy(); }
}
