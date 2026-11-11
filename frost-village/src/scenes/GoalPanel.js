// (v4.3) 목표 창 — the designer: "미션(퀘스트)이 있는데 미션퀘스트가 뭐가 남아있는지 보이는 상태창 있었으면 좋겠어".
//   button   a round 「목표」 button in the right column above the 관망 one (ui3 ui_icon_mission), with a small badge
//            counting the goals the coins pay for now; a tap on the objective panel opens the window too
//   window   non-pausing, a tap outside / ✕ closes it (ui.v42PanelOpen, like the office panel): the progress of the main
//            road, 지금 할 일 (the current main goal: icon, name, cost / progress, 「가기」), 다음 목표 (the next three,
//            or what waits), 해 볼 수 있는 일 (the side goals standing now, affordable first; as many as fit), the
//            finished ones as a count. A tap on a row: the chief walks there (goals/GoalWalk); one without a place
//            says why (locked, comes by itself, no free plot)
//   when     only after the first-run tutorial hands over (the fisherman hired; the onboarding not in Act 1 / 2 /
//            its replay tour) — the first two minutes stay the tutorial's
// Sizes in the UI scene's 720-wide logical space (360 CSS px: ×0.5): names 26 px, lines 21 px.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { Input } from '../core/Input.js';
import { View } from '../core/View.js';
import { panel } from '../core/Panel.js';
import { FONT } from '../data/strings.js';
import { gt } from '../systems/goals/strings.js';

const TXT = (size, color = '#2b2f3a', weight = '800', extra) => Object.assign({ fontFamily: FONT, fontSize: size + 'px', fontStyle: weight, color, resolution: 2 }, extra || {});
const has = (k) => { try { return !!k && Assets.has(k); } catch (e) { return false; } };
const pick = (...keys) => { for (const k of keys) if (has(k)) return k; return keys[keys.length - 1]; };
const fit = (im, s) => { im.setScale(s / Math.max(1, im.frame.realWidth, im.frame.realHeight)); return im; };
const BTN = 64;
/** a small goal flag drawn in code (the ui3 mission icon only comes with the neighbours' pages, ≈ 20 min in) */
function drawFlag(g, s) {
  g.clear();
  g.fillStyle(0x1f3354, 0.22); g.fillEllipse(-s * 0.06, s * 0.38, s * 0.62, s * 0.16);
  g.fillStyle(0xffffff, 1); g.fillEllipse(-s * 0.1, s * 0.34, s * 0.5, s * 0.14);
  g.lineStyle(s * 0.09, 0x6b4a2b, 1); g.lineBetween(-s * 0.2, s * 0.34, -s * 0.2, -s * 0.36);
  g.fillStyle(0xe8553d, 1); g.fillTriangle(-s * 0.16, -s * 0.38, s * 0.36, -s * 0.2, -s * 0.16, -s * 0.02);
  g.lineStyle(s * 0.045, 0x9e2f22, 1); g.strokeTriangle(-s * 0.16, -s * 0.38, s * 0.36, -s * 0.2, -s * 0.16, -s * 0.02);
  g.fillStyle(0xffc83d, 1); g.fillCircle(-s * 0.2, -s * 0.4, s * 0.075);
  return g;
}
/** the goal icon: the ui3 art when it is here, else the drawn flag (a container child either way) */
function goalIcon(ui, x, y, size) {
  if (has('ui_icon_mission')) return fit(Assets.image(ui, x, y, 'ui_icon_mission').setOrigin(0.5), size);
  const g = drawFlag(ui.add.graphics(), size);
  g.setPosition(x, y);
  return g;
}

export class GoalPanel {
  constructor(ui) {
    this.ui = ui;
    this.c = null;
    this.t = 0;
    this.readT = 0;
    this.key = '';
    this.badgeN = 0;
    // ---- the HUD button + its 「목표」 label + the badge
    const b = this.btn = ui.add.container(0, 0).setDepth(22).setVisible(false);
    const g = ui.add.graphics();
    g.fillStyle(0x1f3354, 0.25); g.fillCircle(0, 5, BTN / 2);
    g.fillStyle(0xfffaf0, 0.97); g.fillCircle(0, 0, BTN / 2);
    g.lineStyle(4, 0xe8a33d, 1); g.strokeCircle(0, 0, BTN / 2 - 2);
    this.btnArt = has('ui_icon_mission');
    this.btnIcon = goalIcon(ui, 0, -1, BTN * 0.68);
    this.btnLabBg = ui.add.graphics();
    this.btnLab = ui.add.text(0, BTN / 2 + 14, gt('g_btn'), TXT(17, '#ffffff', '900')).setOrigin(0.5);
    this.badge = ui.add.container(BTN / 2 - 6, -BTN / 2 + 6).setVisible(false);
    const bg2 = ui.add.graphics();
    bg2.fillStyle(0xd4426f, 1); bg2.fillCircle(0, 0, 14); bg2.lineStyle(3, 0xffffff, 1); bg2.strokeCircle(0, 0, 14);
    this.badgeText = ui.add.text(0, 0, '', TXT(17, '#ffffff', '900')).setOrigin(0.5);
    this.badge.add([bg2, this.badgeText]);
    b.add([g, this.btnIcon, this.btnLabBg, this.btnLab, this.badge]);
    this.sizeLab();
    b.setSize(BTN + 8, BTN + 30);
    b.setInteractive(new Phaser.Geom.Rectangle(0, 0, BTN + 8, BTN + 30), Phaser.Geom.Rectangle.Contains);
    b.on('pointerdown', () => { ui.tweens.add({ targets: b, scale: 0.9, duration: 70, yoyo: true }); Audio.play('sfx_click'); this.open('button'); });
    this.layout();
  }

  get gs() { return this.ui.gs; }
  get walk() { const v = this.gs && this.gs.v42; return v && v.goalwalk; }
  isOpen() { return !!this.c; }

  sizeLab() {
    const s = gt('g_btn');
    if (this.btnLab.text !== s) this.btnLab.setText(s);
    const w = this.btnLab.width + 18, h = 26, gr = this.btnLabBg;
    gr.clear();
    gr.fillStyle(0x7a4a0c, 0.9); gr.fillRoundedRect(-w / 2, BTN / 2 + 14 - h / 2, w, h, h / 2);
  }

  layout() {
    const ui = this.ui, W = ui.W, H = ui.H;
    const zb = H - 168 - View.safeBottom;
    // (right column, above the 관망 button at zb - 264 and its label)
    this.btn.setPosition(W - 57, zb - 362);
    if (this.c) this.close(true);
  }

  /** may the window open now? (after the tutorial; no other panel; not on the overview map) */
  available() {
    const W = this.walk;
    return !!(W && W.available);
  }
  busy() {
    const ui = this.ui, gs = this.gs, rk = gs && gs.v4 && gs.v4.rank;
    // ((review L4) + the 읍 ceremony (its own camera and banners)
    return !!(ui.panelOpen || ui.adminOpen || ui.buildOpen || ui.v4PanelOpen || (ui.v42PanelOpen && !this.c) || (gs && gs.overview) || (rk && rk.ceremonyOn));
  }

  update(dt) {
    const ui = this.ui, gs = this.gs;
    this.t += dt;
    if (!gs || !gs.player) return;
    const av = this.available();
    const show = av && !this.busy() && !this.c;
    if (this.btn.visible !== show) {
      this.btn.setVisible(show);
      if (show) { this.btn.setScale(0.6).setAlpha(0); ui.tweens.add({ targets: this.btn, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' }); }
    }
    // (the ui3 icon arrives with the neighbours' pages: it takes the drawn flag's place)
    if (show && !this.btnArt && has('ui_icon_mission')) {
      this.btnArt = true;
      const i = this.btn.getIndex(this.btnIcon), n = goalIcon(ui, 0, -1, BTN * 0.68);
      this.btn.addAt(n, i); this.btn.remove(this.btnIcon, true); this.btnIcon = n;
    }
    // the objective panel opens the window too (only while it can)
    const op = ui.objPanel, ob = ui.objBg;
    if (op && ob) {
      const want = av && op.visible;
      if (want) {
        const w = Math.round(ob.width || 400);
        if (!op.input) {
          op.setSize(w, 62); op.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, 62), Phaser.Geom.Rectangle.Contains); this.objW = w;
          // ((review M3) only a touch that BEGAN on the panel and stayed put opens the window: Phaser sends pointerup to
          //  whatever lies under the finger when it lifts, so a joystick drag ending up here opened it)
          op.on('pointerdown', (ptr) => { this.objDown = ptr ? ptr.downTime : 0; });
          op.on('pointerup', (ptr) => {
            const down = this.objDown;
            this.objDown = null;
            if (down === null || down === undefined || (ptr && ptr.downTime !== down)) return;
            if (ptr && Number.isFinite(ptr.downX) && Math.hypot(ptr.x - ptr.downX, ptr.y - ptr.downY) > 36) return;
            this.open('objective');
          });
        }
        else if (this.objW !== w) { this.objW = w; op.setSize(w, 62); op.input.hitArea.setSize(w, 62); }
        if (op.input && !op.input.enabled) op.setInteractive();
      } else if (op.input && op.input.enabled) op.disableInteractive();
    }
    // the badge: goals the coins pay for now (a second's look is enough)
    this.readT -= dt;
    if (this.readT <= 0 && (show || this.c)) {
      this.readT = this.c ? 0.5 : 1;
      const W = this.walk;
      let book = null;
      try { book = W ? W.read(3, 12) : null; } catch (e) { book = null; }
      if (book) {
        const n = (book.cur && book.cur.afford && book.cur.place ? 1 : 0) + book.side.filter((r) => r.afford).length;
        if (n !== this.badgeN) { this.badgeN = n; this.badge.setVisible(n > 0); this.badgeText.setText(n > 9 ? '9+' : String(n)); }
        if (this.c) this.fill(book);
      }
    }
    if (this.btnLab.text !== gt('g_btn')) this.sizeLab();
  }

  // ------------------------------------------------------------------ the window
  open(src) {
    const ui = this.ui;
    if (this.c) return;
    if (!this.available()) { if (src === 'objective') return; ui.toast(gt('g_tutorial')); return; }
    if (this.busy()) return;
    Input.release();
    const W = ui.W, H = ui.H;
    const pw = Math.min(W - 32, 660);
    const top0 = 110 + View.safeTop;
    const ph = Math.min(H - top0 - 150 - View.safeBottom, 1100);
    const top = Math.max(top0, Math.round((H - ph) / 2) - 20);
    this.box = { pw, ph, top, x0: W / 2 - pw / 2 };
    const c = ui.add.container(0, 0).setDepth(72);
    const dim = ui.add.rectangle(W / 2, H / 2, W * 2, H * 2, 0x1b2638, 0.35).setInteractive();
    dim.on('pointerup', () => this.close());
    const bg = panel(ui, W / 2, top + ph / 2, 'ui_panel', pw, ph).setOrigin(0.5).setInteractive();
    bg.on('pointerup', () => {});
    c.add([dim, bg]);
    const x0 = this.box.x0;
    c.add(goalIcon(ui, x0 + 52, top + 50, 52));
    this.title = ui.add.text(x0 + 90, top + 50, gt('g_title'), TXT(34, '#2b2f3a', '900')).setOrigin(0, 0.5);
    c.add(this.title);
    if (ui.makeIconButton) c.add(ui.makeIconButton(W / 2 + pw / 2 - 42, top + 44, 'ui_icon_close', 60, () => this.close()));
    this.body = ui.add.container(0, 0);
    c.add(this.body);
    this.c = c;
    ui.v42PanelOpen = true;
    this.key = '';
    c.setAlpha(0);
    ui.tweens.add({ targets: c, alpha: 1, duration: 140 });
    Audio.play('sfx_click', { volume: 0.5 });
    this.src = src || null;
    const Wk = this.walk;
    try { this.fill(Wk.read(3, 12)); } catch (e) { console.error('[goals] window', e); }
    this.readT = 0.5;
    if (window.__FV) window.__FV.goalsOpen = true;
  }

  close(quiet) {
    const ui = this.ui, c = this.c;
    if (!c) return;
    this.c = null;
    this.rows = null;
    ui.v42PanelOpen = false;
    if (window.__FV) window.__FV.goalsOpen = false;
    if (quiet) { c.destroy(); return; }
    ui.tweens.add({ targets: c, alpha: 0, duration: 110, onComplete: () => c.destroy() });
  }

  /** the window's rows from a GoalBook.read() (rebuilt only when what it shows changed) */
  fill(book) {
    const ui = this.ui, B = this.box;
    if (!this.c || !B) return;
    const sig = (r) => (r ? [r.id, r.state, r.coins, r.afford ? 1 : 0, r.place ? 1 : 0, r.have, r.need, r.building ? r.building.got : '', r.why, r.name].join('|') : '-');
    const key = [book.done, book.all, has('ui_mission_card') ? 1 : 0, sig(book.cur)].concat(book.next.map(sig), book.side.map(sig), [book.sideMore]).join('/');
    if (key === this.key) return;
    this.key = key;
    const body = this.body;
    body.removeAll(true);
    this.rows = [];
    const x0 = B.x0 + 24, cw = B.pw - 48, bottom = B.top + B.ph - 24;
    let y = B.top + 100;
    // progress of the main road
    const pt = ui.add.text(x0 + 4, y, gt('g_progress', { done: book.done, all: book.all }), TXT(22, '#4a5568', '900')).setOrigin(0, 0.5);
    body.add(pt);
    const bx = x0 + pt.width + 22, bw = Math.max(80, x0 + cw - bx - 6), f = Math.max(0, Math.min(1, book.done / Math.max(1, book.all)));
    const bar = ui.add.graphics();
    bar.fillStyle(0x2b2f3a, 0.14); bar.fillRoundedRect(bx, y - 8, bw, 16, 8);
    if (f > 0) { bar.fillStyle(0x5cc86a, 1); bar.fillRoundedRect(bx, y - 8, Math.max(16, bw * f), 16, 8); }
    body.add(bar);
    y += 44;
    const head = (k) => { body.add(ui.add.text(x0 + 4, y, gt(k), TXT(23, '#1f6f68', '900')).setOrigin(0, 0.5)); y += 38; };
    // 지금 할 일
    head('g_now');
    if (book.cur) { this.row(book.cur, y, 124, true, book.cur); y += 124 + 14; }
    else { body.add(ui.add.text(B.x0 + B.pw / 2, y + 30, gt('g_none'), TXT(21, '#6b7686', '800', { wordWrap: { width: cw - 20 } })).setOrigin(0.5)); y += 74; }
    // 다음 목표
    const RH = 84, GAP = 8;
    if (book.next.length) {
      head('g_next');
      for (const r of book.next) { this.row(r, y, RH, false, book.cur); y += RH + GAP; }
      y += 6;
    }
    // 해 볼 수 있는 일 (as many as fit above the footer)
    const foot = 92;
    head('g_side');
    const room = Math.max(0, Math.floor((bottom - foot - y + GAP) / (RH + GAP)));
    const side = book.side.slice(0, room);
    const more = book.sideMore + (book.side.length - side.length);
    if (!book.side.length) { body.add(ui.add.text(x0 + 8, y + 18, gt('g_sideNone'), TXT(20, '#6b7686', '800')).setOrigin(0, 0.5)); y += 46; }
    for (const r of side) { this.row(r, y, RH, false, book.cur); y += RH + GAP; }
    if (more > 0) { body.add(ui.add.text(x0 + cw - 6, y + 4, gt('g_more', { n: more }), TXT(19, '#6b7686', '800')).setOrigin(1, 0.5)); }
    // footer: the finished ones, the hint
    const fy = bottom - 56;
    const ck = fit(Assets.image(ui, x0 + 20, fy, pick('ui_icon_check', 'ui_icon_goal')).setOrigin(0.5), 30);
    body.add(ck);
    body.add(ui.add.text(x0 + 44, fy, gt('g_done', { n: book.done }), TXT(21, '#2f8f4e', '900')).setOrigin(0, 0.5));
    const hint = ui.add.text(B.x0 + B.pw / 2, bottom - 16, gt('g_tapHint'), TXT(18, '#7a8494', '800')).setOrigin(0.5);
    if (hint.width > cw) hint.setScale(cw / hint.width);
    body.add(hint);
  }

  /** one goal row: card, icon, name, the line under it, 「가기」 / a lock / an hourglass / a tick */
  row(r, y, h, big, cur) {
    const ui = this.ui, B = this.box, body = this.body;
    const x0 = B.x0 + 24, cw = B.pw - 48, cy = y + h / 2;
    const done = r.state === 'done';
    const dim = r.state === 'next' && !r.place;
    const cardKey = done && has('ui_mission_card_done') ? 'ui_mission_card_done' : has('ui_mission_card') ? 'ui_mission_card' : 'ui_panel';
    const card = panel(ui, B.x0 + B.pw / 2, cy, cardKey, cw, h).setOrigin(0.5);
    if (big && r.place) card.setTint(0xfff3cf);
    else if (dim) card.setTint(0xe9edf2);
    body.add(card);
    const isz = big ? 70 : 52;
    const ik = has(r.icon) ? r.icon : pick('ui_icon_goal', 'ui_icon_map');
    const ic = fit(Assets.image(ui, x0 + 18 + isz / 2, cy, ik).setOrigin(0.5), isz);
    if (dim) ic.setAlpha(0.55);
    body.add(ic);
    // right side: 가기 (a place) / a lock (next, none yet) / an hourglass (waits) / nothing
    const goW = big ? 128 : 104;
    let rightW = 0;
    if (r.place && !done) {
      const gx = x0 + cw - 16 - goW / 2;
      const chip = panel(ui, gx, cy, has('ui_chip') ? 'ui_chip' : 'ui_panel', goW, 56).setOrigin(0.5).setTint(r.afford ? 0xffe9a8 : 0xdff7f3);
      const gtx = ui.add.text(gx, cy - 1, gt('g_go') + ' ›', TXT(big ? 25 : 22, r.afford ? '#7a4a0c' : '#1f6f68', '900')).setOrigin(0.5);
      if (gtx.width > goW - 16) gtx.setScale((goW - 16) / gtx.width);
      body.add([chip, gtx]);
      rightW = goW + 20;
    } else if (!done) {
      // (an hourglass: it comes by itself; a lock: locked, or (review M1) no free plot for it yet)
      const lk = r.why !== 'noplot' && (r.state === 'wait' || r.why === 'passive') ? pick('ui_icon_timer', 'ui_icon_calendar', 'ui_icon_lock') : pick('ui_icon_lock', 'ui_icon_goal');
      body.add(fit(Assets.image(ui, x0 + cw - 40, cy, lk).setOrigin(0.5), 34).setAlpha(0.8));
      rightW = 60;
    }
    const tx = x0 + 18 + isz + 16, tw = cw - (tx - x0) - rightW - 8;
    const sub = subOf(this.walk, r);
    const name = ui.add.text(tx, sub ? cy - (big ? 17 : 15) : cy, r.name, TXT(big ? 28 : 25, dim ? '#7a8494' : '#2b2f3a', '900')).setOrigin(0, 0.5);
    if (name.width > tw) name.setScale(tw / name.width);
    body.add(name);
    if (sub) {
      const col = r.afford ? '#2f8f4e' : r.why === 'noplot' ? '#b2462a' : '#6b7686';
      const st = ui.add.text(tx, cy + (big ? 20 : 17), sub, TXT(big ? 22 : 20, col, '800')).setOrigin(0, 0.5);
      if (st.width > tw) st.setScale(tw / st.width);
      body.add(st);
    }
    card.setInteractive({ useHandCursor: true });
    card.on('pointerdown', () => { this.downRow = r.id; });
    card.on('pointerup', () => { if (this.downRow !== r.id) return; this.downRow = null; this.tap(r, cur, card); });
    this.rows.push({ id: r.id, y: cy, card });
  }

  /** a row tapped: walk there (the window closes) or say why not */
  tap(r, cur, card) {
    const ui = this.ui, W = this.walk;
    if (!W) return;
    ui.tweens.add({ targets: card, scaleX: 0.97, scaleY: 0.97, duration: 70, yoyo: true });
    Audio.play('sfx_click', { volume: 0.5 });
    const res = W.go(r, cur);
    if (res && res.ok) this.close();
  }

  /** the language changed: the button's label, the open window's words */
  relabel() { this.sizeLab(); if (this.c) { this.key = ''; if (this.title) this.title.setText(gt('g_title')); this.readT = 0; } }

  /** (tests) the window as shown */
  state() {
    return { button: this.btn.visible, badge: this.badge.visible ? this.badgeText.text : null, open: !!this.c, rows: this.rows ? this.rows.map((q) => q.id) : [], objTap: !!(this.ui.objPanel && this.ui.objPanel.input && this.ui.objPanel.input.enabled), btnAt: [Math.round(this.btn.x), Math.round(this.btn.y)],
      fit: this.c ? this.fitBox() : null, texts: this.c ? this.body.list.filter((o) => o.type === 'Text').map((o) => o.text) : null };
  }
  /** (tests) the window's box and how far its rows / texts reach (logical px) */
  fitBox() {
    const B = this.box;
    let minX = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const o of this.body.list) {
      if (!o.getBounds || o.type === 'Graphics') continue;
      const r = o.getBounds();
      minX = Math.min(minX, r.x); maxX = Math.max(maxX, r.right); maxY = Math.max(maxY, r.bottom);
    }
    return { left: B.x0, right: B.x0 + B.pw, top: B.top, bottom: B.top + B.ph, minX: Math.round(minX), maxX: Math.round(maxX), maxY: Math.round(maxY) };
  }

  /** (tests) tap the row of goal `id` like a finger would */
  tapRow(id) {
    const q = this.rows && this.rows.find((x) => x.id === id);
    if (!q) return false;
    q.card.emit('pointerdown'); q.card.emit('pointerup');
    return true;
  }

  destroy() { if (this.c) this.close(true); }
}

/** the line under a row's name (GoalBook.sub) */
function subOf(W, r) { try { return W && W.book ? W.book.sub(r) : ''; } catch (e) { return ''; } }
