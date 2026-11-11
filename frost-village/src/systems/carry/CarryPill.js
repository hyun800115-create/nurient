// (v4.3, designer: 「촌장이 들고있는것이 무엇인지 알수있게. 그리고 정확하게 어디로 가야하는지도 잘 나타나게」) the 짐 이름표:
// a little plate floating over the chief's own load, the same size on screen at every zoom.
//   row 1   ★ [icon] 빵 5  [icon] 생선 3 …  ·  [가방] 8/26          (the ★ = the chief's own load; porters carry towers too)
//           a full bag: the bag part in red 「26/26 가득」; the first-run tutorial: no bag part (its reel stops early)
//           (the kinds count the items still flying to him too: they always add up to the bag's number)
//   row 2   → 먹거리 진열대 · 13m   (the navigator's place: 4 s after it changes, and while that place is off screen)
//           빵 5 → 빵집 가판대 · 13m +1곳   (a mixed load: the kind that goes there when it takes one, '+N곳' as on the chip;
//                                            the kind's name gives way when the row would get too wide)
//           a pinned place (목표 창's walk, the notice board): only when it takes something of the load, else no row 2
//           받아 줄 곳이 없어요 / 먹거리 진열대 가득   (nowhere takes it now: red-brown, while it lasts)
// Shown while his hands are not empty; not while seated, in a panel, the overview or a ceremony, under an emote over his
// head (the tutorial's thumbs-up), or while he stands on the place where the navigator's own name plate shows. Not
// interactive (the floating joystick owns drags). While it shows, ChiefAura's star pin stays down (one ★, never two).
// Everything is made once at start (hidden). ((v4.3 review) the plate is a nine-slice of a texture drawn once and the ★ /
// the tail are images — no Graphics re-tessellated every frame (on the Canvas renderer, which has no nine-slice, the box
// is a Graphics redrawn only when its size changes); each frame compares numbers and the same strings only: the texts
// are formatted, set and coloured again only when what they say changes (one text render per change).

import { Assets } from '../../core/Assets.js';
import { t, getLang } from '../../data/strings.js';
import { gdist } from '../../core/Iso.js';
import { DEPTH } from '../DepthSort.js';
import { stackStep } from '../../entities/ItemStack.js';

const FONT_PX = 26;          // world px at scale 1 (about 13 CSS px on a 390 px phone, like the navigator's plate)
const ICON = 34;
const WHERE_S = 4;           // s row 2 stays after the place changes
const PIN_NEAR = 90;         // px (gdist): a bag item's place this near a pinned place = the pin takes it (nav.pinArrivePx)
const AT_PAD = 110;          // px (gdist): standing on the place (its pad + the last steps in): the navigator's plate is there
const ROW2_MAX = 540;        // world px at scale 1: row 2 with a kind's name stays under about 3/4 of the screen (0.92 x 576 of 720)
const RES = 2;               // the baked plate parts are drawn at 2x (shown at 1/2)
const STAR = (() => { const p = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 4.6 : 11, a = -Math.PI / 2 + i * Math.PI / 5; p.push({ x: Math.cos(a) * r, y: Math.sin(a) * r }); } return p; })();
// the plate texture (world px): a 64 x 56 body at (2, 2), its shadow 4 px lower, the 3 px gold rim; nine-slice borders
const PB_W = 64, PB_H = 56, PT_W = PB_W + 4, PT_H = PB_H + 8, SL_L = 24, SL_R = 24, SL_T = 24, SL_B = 28;

const CARRY_STR = {
  ko: { c_full: '가득', c_where: '→ {place} · {m}m', c_whereHere: '→ {place}', c_whereKind: '{item} {n} → {place} · {m}m', c_whereKindHere: '{item} {n} → {place}', c_none: '받아 줄 곳이 없어요', c_fullAt: '{place} 가득 · 잠시 기다려요' },
  en: { c_full: 'full', c_where: '→ {place} · {m} m', c_whereHere: '→ {place}', c_whereKind: '{item} {n} → {place} · {m} m', c_whereKindHere: '{item} {n} → {place}', c_none: 'Nowhere takes it now', c_fullAt: '{place} is full · wait a moment' },
};
function ct(key, p) {
  const L = CARRY_STR[getLang()] || CARRY_STR.ko;
  let s = L[key] !== undefined ? L[key] : CARRY_STR.ko[key];
  if (p) for (const k in p) s = s.split('{' + k + '}').join(String(p[k]));
  return s;
}
/** an item's short name ('빵', 'Bread'); '' when it has none */
function itemName(ty) { let s = t(ty); if (getLang() === 'en' && s) s = s.charAt(0).toUpperCase() + s.slice(1); return s === ty ? '' : s; }
/** set a text and its colour with one render: Phaser's setColor re-renders even when nothing changed */
function setTextCol(tx, s, col) {
  if (tx.style.color !== col) { tx.style.color = col; if (tx.text === s) { tx.updateText(); return; } }
  tx.setText(s);
}

/** the plate's parts, drawn once on small canvases: the box (nine-slice source), the ★, the tail */
function canvasTex(scene, key, w, h, draw) {
  const T = scene.textures;
  if (T.exists(key)) return;
  const c = T.createCanvas(key, w, h);
  if (!c) return;
  try { draw(c.context); } catch (e) { /* a blank texture is still a texture */ }
  c.refresh();
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - r); ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + r); ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}
function makePlateTex(scene) {
  if (!scene || !scene.textures) return;
  canvasTex(scene, 'fv_carry_plate', PT_W * RES, PT_H * RES, (ctx) => {
    ctx.scale(RES, RES);
    ctx.fillStyle = 'rgba(31,51,84,0.22)'; roundRect(ctx, 2, 6, PB_W, PB_H, 20); ctx.fill();
    ctx.fillStyle = 'rgba(255,248,236,0.97)'; roundRect(ctx, 2, 2, PB_W, PB_H, 20); ctx.fill();
    ctx.strokeStyle = '#e8a33d'; ctx.lineWidth = 3; roundRect(ctx, 2, 2, PB_W, PB_H, 20); ctx.stroke();
  });
  canvasTex(scene, 'fv_carry_star', 34 * RES, 34 * RES, (ctx) => {
    ctx.scale(RES, RES);
    ctx.beginPath(); ctx.moveTo(17 + STAR[0].x, 17 + STAR[0].y); for (let i = 1; i < 10; i++) ctx.lineTo(17 + STAR[i].x, 17 + STAR[i].y); ctx.closePath();
    ctx.fillStyle = '#ffc83d'; ctx.fill();
    ctx.lineJoin = 'round'; ctx.strokeStyle = '#5a3a26'; ctx.lineWidth = 2.5; ctx.stroke();
  });
  // (the tail: its top edge at (12, 3), its point at (12, 13))
  canvasTex(scene, 'fv_carry_tail', 24 * RES, 16 * RES, (ctx) => {
    ctx.scale(RES, RES);
    ctx.beginPath(); ctx.moveTo(3, 3); ctx.lineTo(21, 3); ctx.lineTo(12, 13); ctx.closePath();
    ctx.fillStyle = 'rgba(255,248,236,0.97)'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(3, 3); ctx.lineTo(12, 13); ctx.lineTo(21, 3);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = '#e8a33d'; ctx.lineWidth = 3; ctx.stroke();
  });
}

export class CarryPill {
  constructor(gs, v42) {
    this.gs = gs;
    this.v42 = v42;
    this.alpha = 0;
    this.shown = false;           // (ChiefAura reads it: the star pin stays down)
    this.counts = [];             // pooled [type, n] pairs
    this.lastPad = null; this.whereT = 0;
    this.popT = 0; this.lastCount = 0;
    this.pinD = null; this.pinT = 0; this.pinOk = false;
    this.relabel();
    const style = (col) => ({ fontFamily: gs.font, fontSize: FONT_PX + 'px', fontStyle: '900', color: col, stroke: '#ffffff', strokeThickness: 0, resolution: 2 });
    const c = this.c = gs.add.container(0, 0).setDepth(DEPTH.LABEL - 40).setVisible(false);
    makePlateTex(gs);
    // the box: a nine-slice (WebGL); Phaser draws no nine-slice on Canvas: a Graphics there (Canvas arcs are cheap)
    const R = gs.sys.game.renderer, canvas = !!(R && R.type === Phaser.CANVAS);
    this.webgl = !!(R && R.type === Phaser.WEBGL);
    this.plate = null; this.g = null;
    if (!canvas && typeof gs.add.nineslice === 'function' && gs.textures.exists('fv_carry_plate')) {
      this.plate = gs.add.nineslice(0, 0, 'fv_carry_plate', undefined, PT_W * RES, PT_H * RES, SL_L * RES, SL_R * RES, SL_T * RES, SL_B * RES).setOrigin(0, 0).setScale(1 / RES);
    } else this.g = gs.add.graphics();
    this.star = gs.add.image(0, 0, 'fv_carry_star').setOrigin(0.5).setScale(1 / RES);
    this.tail = gs.add.image(0, 0, 'fv_carry_tail').setOrigin(12 / 24, 3 / 16).setScale(1 / RES);
    this.ic1 = Assets.image(gs, 0, 0, 'item_fish_cooked').setOrigin(0.5).setVisible(false);
    this.ic2 = Assets.image(gs, 0, 0, 'item_fish_cooked').setOrigin(0.5).setVisible(false);
    this.bagIc = Assets.image(gs, 0, 0, Assets.pick('ui_icon_backpack', 'ui_icon_hand', 'ui_icon_coin')).setOrigin(0.5);
    this.bagIc.setScale(ICON * 0.85 / Math.max(1, this.bagIc.frame.realWidth, this.bagIc.frame.realHeight));
    this.tx1 = gs.add.text(0, 0, '', style('#2b2f3a')).setOrigin(0, 0.5);
    this.tx2 = gs.add.text(0, 0, '', style('#2b2f3a')).setOrigin(0, 0.5);
    this.txBag = gs.add.text(0, 0, '', style('#2b2f3a')).setOrigin(0, 0.5);
    this.row2 = gs.add.text(0, 0, '', Object.assign(style('#1f5f66'), { fontSize: '22px', fontStyle: '800' })).setOrigin(0.5).setVisible(false);
    this.row1Objs = [this.ic1, this.tx1, this.ic2, this.tx2, this.bagIc, this.txBag];
    c.add([this.plate || this.g, this.star, this.tail, ...this.row1Objs, this.row2]);
    for (const o of c.list) o.noCull = true;
    c.noCull = true;
    this.w1 = 0; this.h = 0; this.pw = -1; this.ph = -1;
  }

  hooks(H) { H.carry = { state: () => this.state() }; }
  /** (a language change) both rows are laid out again */
  relabel() { this.l1Lang = null; this.r2Lang = null; }

  /** may the plate show now? */
  allowed(p) {
    const gs = this.gs, ui = gs.game && gs.game.scene ? gs.game.scene.getScene('UI') : null;
    if (!p || !p.stack || (p.stack.count + p.stack.incoming) <= 0) return false;
    if (p.seat || gs.overview) return false;
    if (p.sprite && p.sprite.visible === false) return false;
    const rk = gs.v4 && gs.v4.rank;
    if (rk && rk.ceremonyOn) return false;
    // ((v4.3 review) + the office / depot panel and the '새로워진 것' card (v42PanelOpen); each panel by its own state too:
    //  the shared flag is cleared by whichever closes first)
    if (ui && (ui.panelOpen || ui.buildOpen || ui.v4PanelOpen || ui.v42PanelOpen || ui.adminOpen || ui.moveOpen || (ui.goals && ui.goals.c) || (ui.residents && ui.residents.isOpen && ui.residents.isOpen())
      || (ui.officePanel && ui.officePanel.isOpen && ui.officePanel.isOpen()) || (ui.hud42 && ui.hud42.card))) return false;
    // ((v4.3 review) an emote / a chat bubble over his head (the first-run tutorial's thumbs-up): the plate covered it
    const B = gs.life && gs.life.bubbles;
    if (B && B.active) for (let i = 0; i < B.active.length; i++) if (B.active[i].who === p) return false;
    // ((v4.3 review) standing on the place the load goes to: the navigator's name plate stands right there (same depth)
    const nav = this.v42 && this.v42.nav, d = nav && nav.active ? nav.dest : null;
    if (d && d.pad && nav.badge && nav.badge.visible && gdist(p.x, p.y, d.pad.x, d.pad.y) < AT_PAD) return false;
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

  /** the two rows' contents (formatted and set again only when what they say changes) */
  fill(p, dt) {
    const st = p.stack, cap = p.capacity || st.max || 0;     // (the bag's size; the stack's own max is a drawing cap)
    // count by kind (pooled pairs): the items on him and ((v4.3 review) those still flying to him: the kinds add up to
    // the bag's number, and the first item shows at once — no empty plate before it lands); largest first
    const C = this.counts; let n = 0;
    for (let k = 0; k < 2; k++) {
      const L = k ? st.inTypes.length : st.items.length;
      for (let i = 0; i < L; i++) {
        const ty = k ? st.inTypes[i] : st.items[i].type; let j = 0;
        for (; j < n; j++) if (C[j][0] === ty) { C[j][1]++; break; }
        if (j === n) { if (!C[n]) C[n] = ['', 0]; C[n][0] = ty; C[n][1] = 1; n++; }
      }
    }
    // ties: the kind that ends up on top (the last one flying in, else the top item): a landing never reorders them
    const topTy = st.inTypes.length ? st.inTypes[st.inTypes.length - 1] : st.items.length ? st.items[st.items.length - 1].type : '';
    for (let a = 1; a < n; a++) for (let b = a; b > 0; b--) {
      const x = C[b], y = C[b - 1];
      if (x[1] > y[1] || (x[1] === y[1] && x[0] === topTy)) { C[b] = y; C[b - 1] = x; } else break;
    }
    const gs = this.gs, om = gs.onboard && gs.onboard.mode, tut = !!(gs.tutorial && gs.tutorial.inTutorial) || om === 'act1' || om === 'act2' || om === 'tour';
    const count = st.count + st.incoming, full = cap > 0 && count >= cap, lang = getLang();
    // row 1: laid out again only when one of these changed
    const a0 = n ? C[0][0] : '', a1 = n ? C[0][1] : 0, b0 = n > 1 ? C[1][0] : '', b1 = n > 1 ? C[1][1] : 0, more = n > 2;
    if (lang !== this.l1Lang || a0 !== this.l1A || a1 !== this.l1An || b0 !== this.l1B || b1 !== this.l1Bn || more !== this.l1More || tut !== this.l1Tut || count !== this.l1Count || cap !== this.l1Cap || full !== this.l1Full) {
      this.l1Lang = lang; this.l1A = a0; this.l1An = a1; this.l1B = b0; this.l1Bn = b1; this.l1More = more; this.l1Tut = tut; this.l1Count = count; this.l1Cap = cap; this.l1Full = full;
      if (count > this.lastCount && this.lastCount > 0) this.popT = 0.16;
      this.lastCount = count;
      this.pinT = 0;                                   // (the load changed: does a pinned place take it? asked again)
      this.layout1(C, n, tut, count, cap, full);
    }
    // row 2: the navigator's place (or why nowhere takes it)
    const nav = this.v42 && this.v42.nav;
    const d = nav && nav.active ? nav.dest : null;
    let mode = 0, m = 0;                               // 0 none · 1 → place · m · 2 → place (here) · 3 nowhere / full
    if (d && !tut) {
      if (d.pad && !d.mission) {
        // ((v4.3 review) a pinned place (목표 창's walk, the notice board) is the trip's target, not the load's place:
        //  row 2 names it only while it takes something in the bag (an order's dock with its goods, the food box with
        //  food); else no row 2 — the line and the HUD chip show the pin
        if (!d.pinned || this.pinTakes(d, n, dt)) {
          if (d.pad !== this.lastPad) { this.lastPad = d.pad; this.whereT = WHERE_S; }
          this.whereT -= dt;
          const vw = gs.cameras.main.worldView;
          const off = d.pad.x < vw.x || d.pad.x > vw.right || d.pad.y < vw.y || d.pad.y > vw.bottom;
          if (this.whereT > 0 || off) {
            mode = nav.routeLen > 0 ? 1 : 2;
            if (mode === 1) m = Math.max(1, Math.round(nav.routeLen / 64));
          }
        }
      } else if (d.none) mode = 3;
    } else this.lastPad = null;
    // ((v4.3 review) a mixed load whose kinds do not all go there (another place takes some: '+N곳', like the HUD chip; a
    //  kind nowhere takes): when the place takes one kind, which one and how many ('빵 5 → 빵집 가판대'). (The kinds the
    //  navigator counted when it made this dest — it re-picks 4 times a second — so a kind just picked up does not flash
    //  the prefix before the navigator has seen it)
    if (d !== this.dObj) { this.dObj = d; this.dKinds = n; }
    const split = mode === 1 || mode === 2 ? !d.pinned && ((d.others || 0) > 0 || (!!d.types && d.types.length > 0 && d.types.length < this.dKinds)) : false;
    const one = split && !!d.types && d.types.length === 1;
    const lab = d ? d.name || d.label || '' : '', lpv = d && d.lp ? d.lp.st || '' : '';
    const ty = one ? d.type : '', tn = one ? d.n : 0, oth = split ? d.others || 0 : 0;
    if (mode !== this.r2Mode || m !== this.r2M || lab !== this.r2Lab || lpv !== this.r2Lp || lang !== this.r2Lang || ty !== this.r2Ty || tn !== this.r2N || oth !== this.r2O) {
      this.r2Mode = mode; this.r2M = m; this.r2Lab = lab; this.r2Lp = lpv; this.r2Lang = lang; this.r2Ty = ty; this.r2N = tn; this.r2O = oth;
      let s2 = '';
      if (mode === 1 || mode === 2) {
        const place = nav.placeName(d);
        if (place) {
          const more = oth > 0 ? ' ' + t('navMore', { n: oth }) : '', kk = mode === 1 ? 'c_whereKind' : 'c_whereKindHere';
          // ((v4.3 review) the kind's name gives way when the row would grow past ROW2_MAX — row 1 and the HUD chip name
          //  the kinds: 'Smoked meat 12 → Loading dock at Frost Station · 133 m +2 more' took 9/10 of a phone's width.
          //  Judged at 100 m or more, so it does not come and go as the metres count down)
          const kind = ty && this.textW(ct(kk, { item: itemName(ty), n: tn, place, m: Math.max(100, m) }) + more) <= ROW2_MAX;
          s2 = (kind ? ct(kk, { item: itemName(ty), n: tn, place, m }) : mode === 1 ? ct('c_where', { place, m }) : ct('c_whereHere', { place })) + more;
        }
      } else if (mode === 3) {
        const place = d.label ? t(d.label, d.lp || undefined) : '';
        s2 = place ? ct('c_fullAt', { place }) : ct('c_none');
      }
      const r = this.row2, was = r.visible ? r.text : '';
      if (s2) setTextCol(r, s2, mode === 3 ? '#b2462a' : '#1f5f66');
      if (r.visible !== !!s2) r.setVisible(!!s2);
      if ((s2 || '') !== was) this.drawPlate();
    }
  }

  /** row 2's width for a string, measured without drawing it (its own canvas, its own font) */
  textW(s) {
    const r = this.row2, ctx = r.context;
    if (!ctx || !ctx.measureText) return 0;
    ctx.font = r.style._font;
    return ctx.measureText(s).width;
  }

  /** ((v4.3 review) does the pinned place take something in the bag? (asked 4 times a second and when the load changes) */
  pinTakes(d, n, dt) {
    this.pinT -= dt;
    if (d === this.pinD && this.pinT > 0) return this.pinOk;
    this.pinD = d; this.pinT = 0.25;
    const gs = this.gs, T = gs.tutorial, C = this.counts, px = d.pad.x, py = d.pad.y;
    const G = gs.v4 && gs.v4.growth, dock = !!(G && G.active && G.dockPad && G.needOf && gdist(G.dockPad.x, G.dockPad.y, px, py) < PIN_NEAR);
    const fb = gs.foodBox && gs.foodBox.pad && gs.foodBox.accepts && gdist(gs.foodBox.pad.x, gs.foodBox.pad.y, px, py) < PIN_NEAR ? gs.foodBox : null;
    let ok = false;
    try {
      for (let i = 0; i < n && !ok; i++) {
        const ty = C[i][0];
        if (dock && G.needOf(ty) > 0) ok = true;                                     // an order's dock with its goods
        else if (fb && fb.accepts(ty) && fb.room() > 0) ok = true;                  // the food box with food
        else {
          const q = T && T.destination ? T.destination(ty) : null;                   // the place the bag item goes to anyway
          if (q && q.pad && gdist(q.pad.x, q.pad.y, px, py) < PIN_NEAR) ok = true;
        }
      }
    } catch (e) { ok = false; }
    this.pinOk = ok;
    return ok;
  }

  layout1(C, n, tut, count, cap, full) {
    const fitIcon = (im, ty) => { Assets.apply(im, ty); im.setOrigin(0.5).setScale(ICON / Math.max(1, im.frame.realWidth, im.frame.realHeight)).setVisible(true); };
    let x = 30;                                   // after the ★
    if (n > 0) {
      fitIcon(this.ic1, C[0][0]); this.ic1.bx = x + ICON / 2; x += ICON + 4;
      this.tx1.setText(itemName(C[0][0]) + ' ' + C[0][1]); this.tx1.bx = x; x += this.tx1.width + 10;
    } else { this.ic1.setVisible(false); this.tx1.setText(''); }
    if (n > 1) {
      fitIcon(this.ic2, C[1][0]); this.ic2.bx = x + ICON / 2; x += ICON + 4;
      // (two kinds: the second one's name too while it fits; three or more: …)
      const nm = itemName(C[1][0]);
      this.tx2.setText((x + 220 < 420 && nm ? nm + ' ' : '') + C[1][1] + (n > 2 ? ' …' : '')).setVisible(true); this.tx2.bx = x; x += this.tx2.width + 10;
    } else { this.ic2.setVisible(false); this.tx2.setText('').setVisible(false); }
    if (!tut && cap > 0) {
      x += 6;
      this.bagIc.setVisible(true); this.bagIc.bx = x + ICON * 0.42; x += ICON * 0.85 + 4;
      setTextCol(this.txBag, count + '/' + cap + (full ? ' ' + ct('c_full') : ''), full ? '#c0392b' : '#2b2f3a');
      this.txBag.setVisible(true); this.txBag.bx = x;
      x += this.txBag.width;
    } else { this.bagIc.setVisible(false); this.txBag.setVisible(false); }
    this.w1 = x + 16;
    this.drawPlate();
  }

  /** the plate: a cream rounded box (two rows when row 2 shows), the ★ at its left, a tail down to his load */
  drawPlate() {
    const w1 = Math.max(120, this.w1), r2 = this.row2.visible && this.row2.text;
    const w = Math.max(w1, r2 ? this.row2.width + 36 : 0), h = r2 ? 82 : 48;
    const x0 = -w / 2, y0 = -h;
    // the box (bottom edge on the tail at y 0): only when its size changes
    if (w !== this.pw || h !== this.ph) {
      this.pw = w; this.ph = h;
      if (this.plate) this.plate.setPosition(x0 - 2, y0 - 2).setSize((w + 4) * RES, (h + 8) * RES);
      else if (this.g) {
        const g = this.g;
        g.clear();
        g.fillStyle(0x1f3354, 0.22); g.fillRoundedRect(x0, y0 + 4, w, h, 20);
        g.fillStyle(0xfff8ec, 0.97); g.fillRoundedRect(x0, y0, w, h, 20);
        g.lineStyle(3, 0xe8a33d, 1); g.strokeRoundedRect(x0, y0, w, h, 20);
      }
    }
    // row 1 sits in the top 48 px, left-aligned from the plate's left edge
    // (row 1 starts at the plate's left: layout1 keeps each piece's x from there in `bx`; centred when row 2 is wider)
    const lx = x0 + Math.max(0, (w - w1) / 2);
    this.star.setPosition(lx + 18, y0 + 24);
    const R1 = this.row1Objs;
    for (let i = 0; i < R1.length; i++) { const o = R1[i]; o.y = y0 + 24; o.x = lx + (o.bx || 0); }
    this.row2.setPosition(0, y0 + 64);
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
    return { shown: this.shown, visible: this.c.visible, alpha: +this.alpha.toFixed(2), row1: [this.tx1.text, this.tx2.visible ? this.tx2.text : null, this.txBag.visible ? this.txBag.text : null].filter((x) => x !== null && x !== ''), row2: this.row2.visible ? this.row2.text : null, x: Math.round(this.c.x), y: Math.round(this.c.y), scale: +this.c.scaleX.toFixed(3),
      plate: this.plate ? 'nine' : 'gfx', webgl: this.webgl, w: Math.round(this.pw), h: Math.round(this.ph) };
  }

  destroy() { if (this.c) this.c.destroy(); }
}
