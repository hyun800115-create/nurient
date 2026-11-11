// (v4.3, designer: 「촌장이 들고있는것이 무엇인지 알수있게. 그리고 정확하게 어디로 가야하는지도 잘 나타나게」) the 짐 이름표:
// a little plate floating over the chief's own load, the same size on screen at every zoom.
//   row 1   ★ [icon] 빵 5  [icon] 생선 3 …  ·  [가방] 8/26          (the ★ = the chief's own load; porters carry towers too)
//           a full bag: the bag part in red 「26/26 가득」; the first-run tutorial: no bag part (its reel stops early)
//   row 2   → 먹거리 진열대 · 13m   (the navigator's place: 4 s after it changes, and while that place is off screen)
//           받아 줄 곳이 없어요 / 먹거리 진열대 가득   (nowhere takes it now: red-brown, while it lasts)
// Shown while his hands are not empty; not while seated, in a panel, the overview or a ceremony. Not interactive (the
// floating joystick owns drags). While it shows, ChiefAura's star pin stays down (one ★ marks him, never two).
// Everything is made once at start (hidden); texts are set again only when they change; no allocation per frame.

import { Assets } from '../../core/Assets.js';
import { t, getLang } from '../../data/strings.js';
import { DEPTH } from '../DepthSort.js';
import { stackStep } from '../../entities/ItemStack.js';

const FONT_PX = 26;          // world px at scale 1 (about 13 CSS px on a 390 px phone, like the navigator's plate)
const ICON = 34;
const WHERE_S = 4;           // s row 2 stays after the place changes
const STAR = (() => { const p = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 4.6 : 11, a = -Math.PI / 2 + i * Math.PI / 5; p.push({ x: Math.cos(a) * r, y: Math.sin(a) * r }); } return p; })();

const CARRY_STR = {
  ko: { c_full: '가득', c_where: '→ {place} · {m}m', c_whereHere: '→ {place}', c_none: '받아 줄 곳이 없어요', c_fullAt: '{place} 가득 · 잠시 기다려요' },
  en: { c_full: 'full', c_where: '→ {place} · {m} m', c_whereHere: '→ {place}', c_none: 'Nowhere takes it now', c_fullAt: '{place} is full · wait a moment' },
};
function ct(key, p) {
  const L = CARRY_STR[getLang()] || CARRY_STR.ko;
  let s = L[key] !== undefined ? L[key] : CARRY_STR.ko[key];
  if (p) for (const k in p) s = s.split('{' + k + '}').join(String(p[k]));
  return s;
}

export class CarryPill {
  constructor(gs, v42) {
    this.gs = gs;
    this.v42 = v42;
    this.alpha = 0;
    this.shown = false;           // (ChiefAura reads it: the star pin stays down)
    this.key1 = ''; this.key2 = '';
    this.counts = [];             // pooled [type, n] pairs
    this.lastPad = null; this.whereT = 0;
    this.popT = 0; this.lastCount = 0;
    const style = (col) => ({ fontFamily: gs.font, fontSize: FONT_PX + 'px', fontStyle: '900', color: col, stroke: '#ffffff', strokeThickness: 0, resolution: 2 });
    const c = this.c = gs.add.container(0, 0).setDepth(DEPTH.LABEL - 40).setVisible(false);
    this.g = gs.add.graphics();
    this.ic1 = Assets.image(gs, 0, 0, 'item_fish_cooked').setOrigin(0.5).setVisible(false);
    this.ic2 = Assets.image(gs, 0, 0, 'item_fish_cooked').setOrigin(0.5).setVisible(false);
    this.bagIc = Assets.image(gs, 0, 0, Assets.pick('ui_icon_backpack', 'ui_icon_hand', 'ui_icon_coin')).setOrigin(0.5);
    this.bagIc.setScale(ICON * 0.85 / Math.max(1, this.bagIc.frame.realWidth, this.bagIc.frame.realHeight));
    this.tx1 = gs.add.text(0, 0, '', style('#2b2f3a')).setOrigin(0, 0.5);
    this.tx2 = gs.add.text(0, 0, '', style('#2b2f3a')).setOrigin(0, 0.5);
    this.txBag = gs.add.text(0, 0, '', style('#2b2f3a')).setOrigin(0, 0.5);
    this.row2 = gs.add.text(0, 0, '', Object.assign(style('#1f5f66'), { fontSize: '22px', fontStyle: '800' })).setOrigin(0.5);
    c.add([this.g, this.ic1, this.tx1, this.ic2, this.tx2, this.bagIc, this.txBag, this.row2]);
    for (const o of c.list) o.noCull = true;
    c.noCull = true;
    this.w1 = 0; this.h = 0;
  }

  hooks(H) { H.carry = { state: () => this.state() }; }
  relabel() { this.key1 = ''; this.key2 = ''; }

  /** may the plate show now? */
  allowed(p) {
    const gs = this.gs, ui = gs.game && gs.game.scene ? gs.game.scene.getScene('UI') : null;
    if (!p || !p.stack || (p.stack.count + p.stack.incoming) <= 0) return false;
    if (p.seat || gs.overview) return false;
    if (p.sprite && p.sprite.visible === false) return false;
    const rk = gs.v4 && gs.v4.rank;
    if (rk && rk.ceremonyOn) return false;
    if (ui && (ui.panelOpen || ui.buildOpen || ui.v4PanelOpen || ui.adminOpen || ui.moveOpen || (ui.goals && ui.goals.c) || (ui.residents && ui.residents.isOpen && ui.residents.isOpen()))) return false;
    return true;
  }

  update(dt) {
    const gs = this.gs, p = gs.player;
    const want = this.allowed(p);
    // (fades in over 0.15 s, out over 0.25 s of real time: linear, so a slow phone (short clamped game steps) never
    //  leaves it half there)
    const now = performance.now(), rdt = Math.min(0.25, Math.max(0, (now - (this.lastNow || now)) / 1000));
    this.lastNow = now;
    this.alpha = want ? Math.min(1, this.alpha + rdt / 0.15) : Math.max(0, this.alpha - rdt / 0.25);
    if (this.alpha <= 0 && !want) {
      if (this.c.visible) this.c.setVisible(false);
      this.shown = false; this.lastPad = null;
      return;
    }
    if (!this.c.visible) this.c.setVisible(true);
    this.shown = this.alpha > 0.5;
    if (p && p.stack && p.stack.count + p.stack.incoming > 0) this.fill(p, dt);
    this.place(p, dt);
  }

  /** the two rows' contents (texts set again only when they change) */
  fill(p, dt) {
    const st = p.stack, cap = p.capacity || st.max || 0;     // (the bag's size; the stack's own max is a drawing cap)
    // count by kind (pooled pairs), largest first; ties: the top item's kind
    const C = this.counts; let n = 0;
    for (let i = 0; i < st.items.length; i++) {
      const ty = st.items[i].type; let j = 0;
      for (; j < n; j++) if (C[j][0] === ty) { C[j][1]++; break; }
      if (j === n) { if (!C[n]) C[n] = ['', 0]; C[n][0] = ty; C[n][1] = 1; n++; }
    }
    const topTy = st.items.length ? st.items[st.items.length - 1].type : '';
    for (let a = 1; a < n; a++) for (let b = a; b > 0; b--) {
      const x = C[b], y = C[b - 1];
      if (x[1] > y[1] || (x[1] === y[1] && x[0] === topTy)) { C[b] = y; C[b - 1] = x; } else break;
    }
    const gs = this.gs, om = gs.onboard && gs.onboard.mode, tut = !!(gs.tutorial && gs.tutorial.inTutorial) || om === 'act1' || om === 'act2' || om === 'tour';
    const count = st.count + st.incoming, full = cap > 0 && count >= cap;
    const k1 = getLang() + '|' + (n ? C[0][0] + ':' + C[0][1] : '') + '|' + (n > 1 ? C[1][0] + ':' + C[1][1] : '') + '|' + (n > 2 ? 'm' : '') + '|' + (tut ? '' : count + '/' + cap) + (full ? 'F' : '');
    if (k1 !== this.key1) {
      this.key1 = k1;
      if (count > this.lastCount && this.lastCount > 0) this.popT = 0.16;
      this.lastCount = count;
      this.layout1(C, n, tut, count, cap, full);
    }
    // row 2: the navigator's place (or why nowhere takes it)
    const nav = this.v42 && this.v42.nav;
    let s2 = '', bad = false;
    const d = nav && nav.active ? nav.dest : null;
    if (d && !tut) {
      if (d.pad && !d.mission) {
        if (d.pad !== this.lastPad) { this.lastPad = d.pad; this.whereT = WHERE_S; }
        this.whereT -= dt;
        const vw = gs.cameras.main.worldView;
        const off = d.pad.x < vw.x || d.pad.x > vw.right || d.pad.y < vw.y || d.pad.y > vw.bottom;
        if (this.whereT > 0 || off) {
          const place = nav.placeName(d), m = Math.max(1, Math.round((nav.routeLen || 0) / 64));
          s2 = place ? (nav.routeLen > 0 ? ct('c_where', { place, m }) : ct('c_whereHere', { place })) : '';
        }
      } else if (d.none) {
        bad = true;
        const place = d.label ? t(d.label, d.lp || undefined) : '';
        s2 = place ? ct('c_fullAt', { place }) : ct('c_none');
      }
    } else this.lastPad = null;
    const k2 = s2 + (bad ? '!' : '');
    if (k2 !== this.key2) {
      this.key2 = k2;
      this.row2.setText(s2).setVisible(!!s2).setColor(bad ? '#b2462a' : '#1f5f66');
      this.drawPlate();
    }
  }

  layout1(C, n, tut, count, cap, full) {
    const name = (ty) => { let s = t(ty); if (getLang() === 'en' && s) s = s.charAt(0).toUpperCase() + s.slice(1); return s === ty ? '' : s; };
    const fitIcon = (im, ty) => { Assets.apply(im, ty); im.setOrigin(0.5).setScale(ICON / Math.max(1, im.frame.realWidth, im.frame.realHeight)).setVisible(true); };
    let x = 30;                                   // after the ★
    if (n > 0) {
      fitIcon(this.ic1, C[0][0]); this.ic1.bx = x + ICON / 2; x += ICON + 4;
      this.tx1.setText(name(C[0][0]) + ' ' + C[0][1]); this.tx1.bx = x; x += this.tx1.width + 10;
    } else { this.ic1.setVisible(false); this.tx1.setText(''); }
    if (n > 1) {
      fitIcon(this.ic2, C[1][0]); this.ic2.bx = x + ICON / 2; x += ICON + 4;
      // (two kinds: the second one's name too while it fits; three or more: …)
      const nm = name(C[1][0]);
      this.tx2.setText((x + 220 < 420 && nm ? nm + ' ' : '') + C[1][1] + (n > 2 ? ' …' : '')).setVisible(true); this.tx2.bx = x; x += this.tx2.width + 10;
    } else { this.ic2.setVisible(false); this.tx2.setText('').setVisible(false); }
    if (!tut && cap > 0) {
      x += 6;
      this.bagIc.setVisible(true); this.bagIc.bx = x + ICON * 0.42; x += ICON * 0.85 + 4;
      this.txBag.setText(count + '/' + cap + (full ? ' ' + ct('c_full') : '')).setColor(full ? '#c0392b' : '#2b2f3a').setVisible(true); this.txBag.bx = x;
      x += this.txBag.width;
    } else { this.bagIc.setVisible(false); this.txBag.setVisible(false); }
    this.w1 = x + 16;
    this.drawPlate();
  }

  /** the plate: a cream rounded box (two rows when row 2 shows), the ★ at its left */
  drawPlate() {
    const g = this.g, w1 = Math.max(120, this.w1), r2 = this.row2.visible && this.row2.text;
    const w = Math.max(w1, r2 ? this.row2.width + 36 : 0), h = r2 ? 82 : 48;
    const x0 = -w / 2, y0 = -h;
    g.clear();
    g.fillStyle(0x1f3354, 0.22); g.fillRoundedRect(x0, y0 + 4, w, h, 20);
    g.fillStyle(0xfff8ec, 0.97); g.fillRoundedRect(x0, y0, w, h, 20);
    g.lineStyle(3, 0xe8a33d, 1); g.strokeRoundedRect(x0, y0, w, h, 20);
    // the ★ (gold with an ink rim)
    const sx = x0 + Math.max(0, (w - w1) / 2) + 18, sy = y0 + 24;
    g.fillStyle(0xffc83d, 1); g.lineStyle(2.5, 0x5a3a26, 1);
    g.beginPath(); g.moveTo(sx + STAR[0].x, sy + STAR[0].y); for (let i = 1; i < 10; i++) g.lineTo(sx + STAR[i].x, sy + STAR[i].y); g.closePath(); g.fillPath(); g.strokePath();
    // row 1 sits in the top 48 px, left-aligned from the plate's left edge
    // (row 1 starts at the plate's left: layout1 keeps each piece's x from there in `bx`; centred when row 2 is wider)
    const lx = x0 + Math.max(0, (w - w1) / 2);
    for (const o of [this.ic1, this.tx1, this.ic2, this.tx2, this.bagIc, this.txBag]) { o.y = y0 + 24; o.x = lx + (o.bx || 0); }
    this.row2.setPosition(0, y0 + 64);
    // (a small tail pointing down at his load)
    g.fillStyle(0xfff8ec, 0.97); g.fillTriangle(-9, 0, 9, 0, 0, 10);
    g.lineStyle(3, 0xe8a33d, 1); g.lineBetween(-9, 0, 0, 10); g.lineBetween(9, 0, 0, 10);
    this.h = h;
  }

  /** over his load, the same size on screen at every zoom */
  place(p, dt) {
    if (!p) return;
    const gs = this.gs, z = Math.max(0.3, gs.zoomCur || 1);
    let top = p.y - (p.liftY || 0) + (p.headTop || -60) - 6;
    if (p.stack && p.stack.count) { let h = 0; const it = p.stack.items, lim = Math.min(it.length, p.stack.drawMax || it.length); for (let i = 0; i < lim; i++) h += stackStep(it[i].type) * p.stack.scale; top -= h + 2; }
    let s = Math.min(1.6, Math.max(0.5, 0.92 / z));
    if (this.popT > 0) { this.popT = Math.max(0, this.popT - dt); s *= 1 + 0.12 * (this.popT / 0.16); }
    this.c.setPosition(p.x, top).setScale(s).setAlpha(this.alpha);
  }

  state() {
    return { shown: this.shown, visible: this.c.visible, alpha: +this.alpha.toFixed(2), row1: [this.tx1.text, this.tx2.visible ? this.tx2.text : null, this.txBag.visible ? this.txBag.text : null].filter((x) => x !== null && x !== ''), row2: this.row2.visible ? this.row2.text : null, x: Math.round(this.c.x), y: Math.round(this.c.y), scale: +this.c.scaleX.toFixed(3) };
  }

  destroy() { if (this.c) this.c.destroy(); }
}
