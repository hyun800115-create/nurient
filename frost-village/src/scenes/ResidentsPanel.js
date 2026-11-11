// (v4.3) 마을 주민 창 — the designer: "인구수 누르면 마을주민의 이름 나이 성별 직장 현재하고있는 행동을 보이는 상태창 …
// 마을주민이 많으면 페이지 넘기는식으로 … 자세히 누르면 마을주민 하나하나 상세 프로필 … 사진 모서리 하단에 주민따라가기 버튼".
//   chip     the population chip (UI.popBox, "72/72") shows once the tutorial hands over and becomes a button: a 「›」
//            after the number, three soft pulses the first time (progress.seen.resWin). Its place is unchanged here
//   list     「마을 주민 N명」: the people the chip counts (systems/residents/roster.js), 6 a page with ◀ 3 / 12 ▶ (a swipe
//            flips too), filter chips 전체 · 일하는 주민 · 아이 · 어르신. A row: portrait (the resident's existing 128 px
//            portrait picture, else a head crop of their idle frame — no new textures), 이름 · 나이 · 성별, 직장,
//            ● 지금 하는 일 (live, 2 Hz) and 「자세히」
//   profile  portrait with 「따라가기」 on its bottom corner; 이름 · 나이 · 성별 · 직장 · 월급 (· 세금) · 행복도 (bar, face);
//            지금 하는 일 · 사는 곳 · 가족 / 같이 사는 사람 / 친한 사이 (each name opens that profile; ◀ 뒤로) · 행복한 이유
//            · 가치 추구 · 성격 · 좋아하는 것 · 촌장님과의 사이 · 오늘 일정 · 이사 온 때
//   follow   systems/residents/Follow.js
// Non-pausing (the village lives on), a tap outside / ✕ / Escape / the Android back key closes it (src/core/Back.js);
// it blocks the chief's input like the other panels (ui.v42PanelOpen) and never opens during the tutorial, a ceremony,
// the overview or another panel. Rows are built once per open and reused across pages (setText only on change);
// live text refreshes at 2 Hz for the visible rows only. Sizes in the UI's 720-wide logical space.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { Input } from '../core/Input.js';
import { View } from '../core/View.js';
import { Back } from '../core/Back.js';
import { panel } from '../core/Panel.js';
import { FONT, fmt, getLang } from '../data/strings.js';
import { Roster, DOT } from '../systems/residents/roster.js';
import { Follow } from '../systems/residents/Follow.js';
import { VALUE_BY_ID } from '../systems/residents/data.js';
import { rt } from '../systems/residents/strings.js';

const TXT = (size, color = '#2b2f3a', weight = '800', extra) => Object.assign({ fontFamily: FONT, fontSize: size + 'px', fontStyle: weight, color, resolution: 2 }, extra || {});
const PER = 6;
const FILTERS = ['all', 'work', 'kid', 'elder'];
const FACE = { 4: 'emote_love', 3: 'emote_laugh', 2: 'emote_dots', 1: 'emote_sweat' };
const BAR = (s) => (s >= 60 ? 0x4cb860 : s >= 40 ? 0xe8c23d : 0xf08a3a);
const ready = (k) => { try { return !!k && Assets.has(k) && !Assets.pending(k); } catch (e) { return false; } };
const fitIcon = (im, s) => { im.setScale(s / Math.max(1, im.frame.realWidth, im.frame.realHeight)); return im; };

/** fit a text to maxW: the base size, then `min`, then cut with … (measured only when the text or the room changed) */
function fitText(tx, s, maxW, base, min) {
  if (tx.__src === s && tx.__w === maxW) return;
  tx.__src = s; tx.__w = maxW;
  if (tx.style.fontSize !== base + 'px') tx.setFontSize(base);
  if (tx.text !== s) tx.setText(s);
  if (tx.width <= maxW) return;
  if (min && min < base) { tx.setFontSize(min); if (tx.width <= maxW) return; }
  let n = Math.max(1, Math.floor(s.length * maxW / tx.width) - 1);
  tx.setText(s.slice(0, n) + '…');
  while (n > 1 && tx.width > maxW) { n--; tx.setText(s.slice(0, n) + '…'); }
}

/** the 128 px portrait picture of a look, when it is loaded (never asked for: it comes with its fragment) */
const portraitKey = (look) => { const d = Assets.m.characters[look]; return d && d.portrait; };

/** a portrait: the 128 px portrait picture, else the head of the idle frame (setCrop), else the first letter */
function setPortrait(ui, img, letter, look, name, cx, cy, size) {
  const d = Assets.m.characters[look];
  const pk = d && d.portrait;
  if (ready(pk)) {
    const r = Assets.sprite(pk);
    img.setTexture(r.tex, r.frame).setCrop().setOrigin(0.5, 1);
    const s = (size * 0.94) / Math.max(1, img.frame.realWidth, img.frame.realHeight);
    img.setScale(s).setPosition(cx, cy + size / 2 - 3).setVisible(true);
    letter.setVisible(false);
    return 'portrait';
  }
  try {
    if (Assets.charReady(look)) {
      const an = ui.gs.game.anims.get(Assets.charAnim(look, 'idle', 'S'));
      const fr = an && an.frames && an.frames[0] && an.frames[0].frame;
      if (fr) {
        const def = Assets.charDef(look);
        const W = fr.realWidth, H = fr.realHeight;
        const ax = W * (def.anchor ? def.anchor[0] : 0.5), ay = H * (def.anchor ? def.anchor[1] : 0.8125);
        const head = ay + (def.headTop || -84), sz = H * 0.5, sx = ax - sz / 2, sy = head - sz * 0.06;
        img.setTexture(fr.texture.key, fr.name).setOrigin(0, 0);
        img.setCrop(sx, sy, sz, sz);
        const k = size * 0.94 / sz;
        img.setScale(k).setPosition(cx - (sx + sz / 2) * k, cy - (sy + sz / 2) * k).setVisible(true);
        letter.setVisible(false);
        return 'frame';
      }
    }
  } catch (e) { /* the letter */ }
  img.setVisible(false);
  letter.setText((name || '?').charAt(0)).setVisible(true).setPosition(cx, cy);
  return 'letter';
}

function frameG(g, cx, cy, size, r, back) {
  g.clear();
  if (back) { g.fillStyle(0xeaf2fb, 1); g.fillRoundedRect(cx - size / 2, cy - size / 2, size, size, r); }
  else { g.lineStyle(4, 0xd7e3f2, 1); g.strokeRoundedRect(cx - size / 2 + 2, cy - size / 2 + 2, size - 4, size - 4, r); }
  return g;
}

export class ResidentsPanel {
  constructor(ui) {
    this.ui = ui;
    this.roster = new Roster(ui.gs);
    this.follow = new Follow(ui, this);
    this.c = null;
    this.view = null;
    this.page = 0;
    this.filter = 'all';
    this.stack = [];
    this.pid = null;
    this.rows = null;
    this.flist = [];
    this.liveT = 0;
    this.chipT = 0;
    this.chipOn = null;
    this.inited = false;
    this.act = { key: '', text: '', dot: 0, x: 0, y: 0, where: '', body: null, params: null };
    this.hap = { score: 0, face: 2, reasons: [] };
    this.onBack = () => this.backStep();
    // ---- the chip's 「›」 and its tap area (children of the population chip)
    const pb = ui.popBox;
    this.chev = ui.add.text(0, 1, '›', TXT(30, '#6b7686', '900')).setOrigin(0, 0.5).setVisible(false);
    this.chipHit = ui.add.zone(0, 0, 110, 50).setOrigin(0, 0.5);
    this.chipHit.on('pointerup', () => { Audio.play('sfx_click', { volume: 0.5 }); this.open('chip'); });
    pb.add([this.chev, this.chipHit]);
    // ---- Escape (a computer's back key)
    const kb = ui.input && ui.input.keyboard;
    if (kb) {
      this.onEsc = () => { Back.handle(); };
      kb.on('keydown-ESC', this.onEsc);
      ui.events.once('shutdown', () => { kb.off('keydown-ESC', this.onEsc); });
    }
    ui.events.once('shutdown', () => { if (this.follow.on) this.follow.stop('reset', false); Back.pop(this.onBack); this.c = null; this.rows = null; });
    this.hooks = this.makeHooks();
  }

  get gs() { return this.ui.gs; }
  isOpen() { return !!this.c; }

  // ================================================================ when
  /** the chip shows and is a button: the first-run tutorial has handed over (not in Act 1 / 2) */
  chipAvailable() {
    const gs = this.gs;
    if (!gs || !gs.player || !gs.life) return false;
    if (gs.tutorial && gs.tutorial.inTutorial) return false;
    const ob = gs.onboard;
    return !(ob && (ob.mode === 'act1' || ob.mode === 'act2'));
  }
  /** may the window open now? (also not during the replay tour) */
  available() { const ob = this.gs && this.gs.onboard; return this.chipAvailable() && !(ob && ob.mode === 'tour'); }
  busy() {
    const ui = this.ui, gs = this.gs;
    return !!(ui.panelOpen || ui.adminOpen || ui.buildOpen || ui.v4PanelOpen || ui.moveOpen || (ui.v42PanelOpen && !this.c)
      || (gs && gs.overview) || (gs && gs.v4 && gs.v4.rank && gs.v4.rank.ceremonyOn) || (gs && gs.residentChat && gs.residentChat.isOpen));
  }

  // ================================================================ the HUD chip (UI.setPopulation calls chipSized)
  /** the 「›」 after the chip's number and the tap area; returns the chip's new width */
  chipSized(w) {
    const on = !!this.chipOn;
    this.chev.setVisible(on);
    if (!on) { if (this.chipHit.input) this.chipHit.disableInteractive(); return w; }
    this.chev.setPosition(w - 8, 1);
    w += 20;
    this.chipHit.setSize(w, 54);
    if (!this.chipHit.input) this.chipHit.setInteractive({ useHandCursor: true });
    else { this.chipHit.setInteractive(); if (this.chipHit.input.hitArea) this.chipHit.input.hitArea.setTo(0, 0, w, 54); }
    return w;
  }

  pulseChip() {
    const ui = this.ui, pb = ui.popBox;
    ui.tweens.killTweensOf(pb);
    pb.setScale(1);
    ui.tweens.add({ targets: pb, scale: 1.08, duration: 300, yoyo: true, repeat: 2, ease: 'Sine.easeInOut', onComplete: () => pb.setScale(1) });
  }

  // ================================================================ open / close
  open(src, pid) {
    const ui = this.ui;
    if (this.c) { if (pid) this.showProfile(pid, false); return true; }
    if (!this.available()) { if (src === 'chip' && ui.toast) ui.toast(rt('r_tutorial')); return false; }
    if (this.busy()) return false;
    Input.release();
    this.roster.readChat();
    const W = ui.W, H = ui.H;
    const pw = Math.min(W - 32, 660), top0 = 110 + View.safeTop;
    const ph = Math.min(H - top0 - 150 - View.safeBottom, 1100);
    const top = Math.max(top0, Math.round((H - ph) / 2) - 20);
    this.box = { pw, ph, top, x0: Math.round(W / 2 - pw / 2) };
    const c = ui.add.container(0, 0).setDepth(72);
    const dim = ui.add.rectangle(W / 2, H / 2, W * 2, H * 2, 0x1b2638, 0.35).setInteractive();
    dim.on('pointerup', () => this.close());
    const bg = panel(ui, W / 2, top + ph / 2, 'ui_panel', pw, ph).setOrigin(0.5).setInteractive();
    bg.on('pointerup', (p) => this.swipe(p));
    this.closeBtn = ui.makeIconButton(this.box.x0 + pw - 40, top + 40, 'ui_icon_close', 60, () => this.close());
    this.body = ui.add.container(0, 0);
    c.add([dim, bg, this.body, this.closeBtn]);
    this.c = c;
    ui.v42PanelOpen = true;
    Back.push(this.onBack);
    c.setAlpha(0);
    ui.tweens.add({ targets: c, alpha: 1, duration: 140 });
    Audio.play('sfx_click', { volume: 0.5 });
    this.page = 0; this.filter = 'all'; this.stack.length = 0;
    if (pid && this.roster.get(pid)) this.showProfile(pid, false);
    else this.showList();
    if (window.__FV) window.__FV.residentsOpen = true;
    return true;
  }

  close(instant) {
    const ui = this.ui, c = this.c;
    if (!c) return;
    this.c = null;
    this.rows = null; this.listC = null; this.profC = null; this.view = null;
    ui.v42PanelOpen = false;
    Back.pop(this.onBack);
    if (window.__FV) window.__FV.residentsOpen = false;
    if (instant) c.destroy();
    else ui.tweens.add({ targets: c, alpha: 0, duration: 110, onComplete: () => c.destroy() });
  }

  /** back: a profile → the one before it / the list; the list → closed */
  backStep() {
    if (!this.c) return false;
    if (this.view === 'profile') {
      if (this.stack.length) this.showProfile(this.stack.pop(), true);
      else this.showList();
      return true;
    }
    this.close();
    return true;
  }

  layout() {
    if (this.follow.on) this.follow.layout();
    if (!this.c) return;
    const s = { view: this.view, pid: this.pid, page: this.page, filter: this.filter, stack: this.stack.slice() };
    this.close(true);
    if (!this.open('layout')) return;
    this.page = s.page; this.filter = s.filter; this.stack = s.stack;
    if (s.view === 'profile' && s.pid) this.showProfile(s.pid, true); else this.showList();
  }

  relabel() { if (this.c) this.layout(); }

  /** a horizontal swipe on the list flips the page */
  swipe(p) {
    if (this.view !== 'list' || !p) return false;
    const k = View.k || 1, dx = (p.upX - p.downX) / k, dy = (p.upY - p.downY) / k;
    if (Math.abs(dx) > 80 && Math.abs(dy) < 60) { this.flip(dx < 0 ? 1 : -1); return true; }
    return false;
  }

  // ================================================================ the list
  showList() {
    this.view = 'list'; this.pid = null; this.stack.length = 0;
    if (this.profC) { this.profC.destroy(); this.profC = null; }
    if (!this.listC) this.buildList();
    this.listC.setVisible(true);
    this.liveT = 0;
    this.fillList(true);
  }

  buildList() {
    const ui = this.ui, B = this.box, x0 = B.x0, top = B.top, pw = B.pw, W = ui.W;
    const C = this.listC = ui.add.container(0, 0);
    this.body.add(C);
    this.chipKey = '';
    const ic = ready('ui_icon_people') ? fitIcon(Assets.image(ui, x0 + 50, top + 46, 'ui_icon_people').setOrigin(0.5), 46) : null;
    this.title = ui.add.text(x0 + (ic ? 84 : 32), top + 46, '', TXT(32, '#2b2f3a', '900')).setOrigin(0, 0.5);
    if (ic) C.add(ic);
    C.add(this.title);
    // filter chips (green = the one shown; both plates made once, toggled)
    this.chips = FILTERS.map((f) => {
      const g0 = panel(ui, 0, 0, 'ui_panel', 140, 52).setOrigin(0.5);
      const g1 = panel(ui, 0, 0, 'ui_button_green', 140, 52).setOrigin(0.5).setVisible(false);
      const tx = ui.add.text(0, 0, '', TXT(20, '#2b2f3a', '900')).setOrigin(0.5);
      const cc = ui.add.container(0, top + 112, [g0, g1, tx]);
      g0.setInteractive({ useHandCursor: true }); g1.setInteractive({ useHandCursor: true });
      const pick = () => { if (this.filter !== f) { Audio.play('sfx_click', { volume: 0.4 }); this.filter = f; this.page = 0; this.fillList(true); } };
      g0.on('pointerup', pick); g1.on('pointerup', pick);
      C.add(cc);
      return { f, cc, g0, g1, tx };
    });
    // rows
    const RH = this.RH = Math.max(112, Math.min(140, Math.floor((B.ph - 150 - 110) / PER)));
    const dy = Math.round((RH - 8) * 0.26);
    this.rows = [];
    for (let i = 0; i < PER; i++) {
      const y = top + 150 + RH * i + RH / 2;
      const r = { i, y, pid: null, look: null };
      r.card = panel(ui, W / 2, y, 'ui_panel', pw - 40, RH - 8).setOrigin(0.5).setTint(0xfffaf0).setInteractive({ useHandCursor: true });
      r.card.on('pointerup', (p) => { if (this.swipe(p)) return; if (r.pid) this.openFromList(r.pid); });
      const px = x0 + 20 + 42;
      r.fb = frameG(ui.add.graphics(), px, y, 84, 18, true);
      r.img = ui.add.image(px, y, '__WHITE').setVisible(false);
      r.letter = ui.add.text(px, y, '', TXT(40, '#6b7686', '900')).setOrigin(0.5).setVisible(false);
      r.ff = frameG(ui.add.graphics(), px, y, 84, 18, false);
      const tx = x0 + 124;
      r.name = ui.add.text(tx, y - dy, '', TXT(26, '#2b2f3a', '900')).setOrigin(0, 0.5);
      r.age = ui.add.text(tx, y - dy + 2, '', TXT(20, '#6b7686', '800')).setOrigin(0, 0.5);
      r.pill = ui.add.graphics();
      r.pillT = ui.add.text(0, y - dy + 1, '', TXT(16, '#ffffff', '900')).setOrigin(0.5);
      r.job = ui.add.text(tx, y, '', TXT(21, '#1f6f68', '800')).setOrigin(0, 0.5);
      r.dot = ui.add.graphics().setPosition(tx + 5, y + dy);
      r.act = ui.add.text(tx + 16, y + dy, '', TXT(21, '#4a5568', '800')).setOrigin(0, 0.5);
      const bx = x0 + pw - 20 - 58;
      r.btn = panel(ui, bx, y, 'ui_button_blue', 116, 54).setOrigin(0.5).setInteractive({ useHandCursor: true });
      r.btn.on('pointerup', () => { if (r.pid) this.openFromList(r.pid); });
      r.btnT = ui.add.text(bx, y - 1, rt('r_more'), TXT(22, '#ffffff', '900')).setOrigin(0.5);
      if (r.btnT.width > 100) r.btnT.setScale(100 / r.btnT.width);
      r.c = ui.add.container(0, 0, [r.card, r.fb, r.img, r.letter, r.ff, r.name, r.age, r.pill, r.pillT, r.job, r.dot, r.act, r.btn, r.btnT]);
      r.dyy = dy;
      C.add(r.c);
      this.rows.push(r);
    }
    this.empty = ui.add.text(W / 2, top + 150 + RH * 1.5, rt('r_empty'), TXT(24, '#6b7686', '800')).setOrigin(0.5).setVisible(false);
    C.add(this.empty);
    // pager
    const py = top + B.ph - 56;
    this.prev = this.arrowBtn(W / 2 - 150, py, -1);
    this.next = this.arrowBtn(W / 2 + 150, py, 1);
    this.pageT = ui.add.text(W / 2, py, '', TXT(26, '#2b2f3a', '900')).setOrigin(0.5);
    C.add([this.prev, this.next, this.pageT]);
  }

  arrowBtn(x, y, dir) {
    const ui = this.ui, c = ui.add.container(x, y), R = 32;
    const g = ui.add.graphics();
    g.fillStyle(0x1f3354, 0.22); g.fillCircle(0, 4, R);
    g.fillStyle(0xffffff, 0.97); g.fillCircle(0, 0, R);
    g.lineStyle(4, 0xd7e3f2, 1); g.strokeCircle(0, 0, R - 2);
    g.lineStyle(7, 0x3b6fb6, 1);
    g.beginPath(); g.moveTo(-7 * dir, -12); g.lineTo(7 * dir, 0); g.lineTo(-7 * dir, 12); g.strokePath();
    c.add(g);
    c.setSize(R * 2, R * 2);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerup', () => { if (c.alpha < 0.9) return; Audio.play('sfx_click', { volume: 0.4 }); this.flip(dir); });
    return c;
  }

  flip(d) {
    const n = this.pages();
    const p = Math.max(0, Math.min(n - 1, this.page + d));
    if (p === this.page) return;
    this.page = p;
    this.fillList(true);
  }

  pages() { return Math.max(1, Math.ceil(this.flist.length / PER)); }

  /** the filtered list + counts (one pass) */
  filterList() {
    const all = this.roster.list(), out = this.flist;
    out.length = 0;
    const n = this.counts || (this.counts = { all: 0, work: 0, kid: 0, elder: 0 });
    n.all = all.length; n.work = 0; n.kid = 0; n.elder = 0;
    for (const p of all) {
      const c = this.roster.category(p);
      if (c.work) n.work++;
      if (c.kid) n.kid++;
      if (c.elder) n.elder++;
      if (this.filter === 'all' || c[this.filter]) out.push(p);
    }
    this.listSig = this.roster.sig;
    return out;
  }

  fillList(full) {
    if (!this.listC || this.view !== 'list') return;
    const L = this.filterList(), n = this.counts;
    const title = rt('r_title', { n: n.all });
    if (this.title.text !== title) this.title.setText(title);
    // chips: widths to their words, shrunk together when they do not fit (laid out again only when a count changed)
    const ck = this.filter + n.all + '|' + n.work + '|' + n.kid + '|' + n.elder + getLang();
    if (ck !== this.chipKey) { this.chipKey = ck; this.layoutChips(n); }
    const pages = this.pages();
    if (this.page >= pages) this.page = pages - 1;
    const p0 = this.page * PER;
    for (const r of this.rows) {
      const p = L[p0 + r.i] || null;
      if (!p) { r.c.setVisible(false); r.pid = null; continue; }
      r.c.setVisible(true);
      if (full || r.pid !== p.pid || r.lang !== getLang()) this.fillRowStatic(r, p);
      this.fillRowLive(r, p);
    }
    this.empty.setVisible(!L.length);
    const pt = rt('r_page', { p: this.page + 1, n: pages });
    if (this.pageT.text !== pt) this.pageT.setText(pt);
    this.prev.setAlpha(this.page > 0 ? 1 : 0.35);
    this.next.setAlpha(this.page < pages - 1 ? 1 : 0.35);
  }

  layoutChips(n) {
    const B = this.box;
    const keys = { all: 'r_f_all', work: 'r_f_work', kid: 'r_f_kid', elder: 'r_f_elder' };
    let tot = 0;
    for (const ch of this.chips) {
      const s = rt(keys[ch.f], { n: n[ch.f] });
      if (ch.tx.text !== s) ch.tx.setText(s);
      ch.tx.setScale(1);
      ch.w = ch.tx.width + 30; tot += ch.w;
    }
    const room = B.pw - 40 - 8 * (this.chips.length - 1);
    const k = Math.min(1, room / tot);
    let x = B.x0 + 20;
    for (const ch of this.chips) {
      const w = ch.w * k;
      ch.tx.setScale(Math.min(1, (w - 16) / Math.max(1, ch.tx.width)));
      ch.cc.x = x + w / 2;
      ch.g0.setSize(w, 52); ch.g1.setSize(w, 52);
      if (ch.g0.input && ch.g0.input.hitArea) ch.g0.input.hitArea.setTo(0, 0, w, 52);
      if (ch.g1.input && ch.g1.input.hitArea) ch.g1.input.hitArea.setTo(0, 0, w, 52);
      const on = ch.f === this.filter;
      ch.g0.setVisible(!on); ch.g1.setVisible(on);
      ch.tx.setColor(on ? '#ffffff' : '#2b2f3a');
      x += w + 8;
    }
  }

  fillRowStatic(r, p) {
    const ui = this.ui, R = this.roster, B = this.box;
    r.pid = p.pid; r.lang = getLang();
    const px = B.x0 + 20 + 42;
    const name = R.shortName(p);
    if (r.look !== p.look) { r.look = p.look; r.pmode = setPortrait(ui, r.img, r.letter, p.look, name, px, r.y, 84); }
    else if (r.pmode === 'letter') r.letter.setText(name.charAt(0));
    const age = rt('r_age', { n: p.age });
    if (r.age.text !== age) r.age.setText(age);
    const pillW = 30, tx = B.x0 + 124, col = 356;
    const nameMax = col - (r.age.width + 10 + pillW + 8);
    fitText(r.name, name, nameMax, 26, 22);
    const ax = tx + r.name.displayWidth + 10;
    r.age.x = ax;
    const pxl = ax + r.age.width + 8 + pillW / 2, py = r.y - r.dyy + 1;
    r.pill.clear();
    r.pill.fillStyle(p.sex === 'f' ? 0xe05a8a : 0x3d7be0, 1);
    r.pill.fillRoundedRect(pxl - pillW / 2, py - 12, pillW, 24, 8);
    r.pillT.setText(rt(p.sex === 'f' ? 'r_f' : 'r_m')).setPosition(pxl, py);
  }

  fillRowLive(r, p) {
    const R = this.roster, a = this.act;
    // (the portrait pictures arrive with their fragment after the title: swap the stand-in when it is here)
    if (r.pmode !== 'portrait' && ready(portraitKey(p.look))) r.pmode = setPortrait(this.ui, r.img, r.letter, p.look, R.shortName(p), this.box.x0 + 20 + 42, r.y, 84);
    R.resolve(p);
    fitText(r.job, R.jobText(p), 356, 21, 18);
    R.action(p, a);
    fitText(r.act, a.text, 340, 21, 18);
    if (r.dotC !== a.dot) { r.dotC = a.dot; r.dot.clear(); r.dot.fillStyle(a.dot, 1); r.dot.fillCircle(0, 0, 5); }
    r.actKey = a.key;
  }

  openFromList(pid) { Audio.play('sfx_click', { volume: 0.45 }); this.showProfile(pid, true); }

  // ================================================================ the profile
  /** show pid's profile; from a family name (push: the one shown now goes on the back stack) */
  showProfile(pid, fromHere, push) {
    const p = this.roster.get(pid);
    if (!p || !this.c) return false;
    if (push && this.pid && this.view === 'profile') { this.stack.push(this.pid); if (this.stack.length > 8) this.stack.shift(); }
    if (!fromHere && !push) this.stack.length = 0;
    this.view = 'profile'; this.pid = pid;
    if (this.listC) this.listC.setVisible(false);
    if (this.profC) { this.profC.destroy(); this.profC = null; }
    this.buildProfile(p, false);
    // (a long card on a short screen: once more, tighter)
    if (this.profBottom > this.box.top + this.box.ph - 14) { this.profC.destroy(); this.buildProfile(p, true); }
    this.liveT = 0;
    this.fillProfileLive();
    return true;
  }

  buildProfile(p, tight) {
    const ui = this.ui, B = this.box, R = this.roster, x0 = B.x0, top = B.top, pw = B.pw, L = getLang() === 'en' ? 'en' : 'ko';
    const C = this.profC = ui.add.container(0, 0);
    this.body.add(C);
    this.nowDotC = null; this.hScore = null; this.hFaceN = null;     // (new objects: drawn afresh)
    R.resolve(p);
    // ---- ◀ 목록 / ◀ 뒤로
    const bl = rt(this.stack.length ? 'r_back2' : 'r_back');
    const bt = ui.add.text(0, 0, bl, TXT(22, '#2b2f3a', '900')).setOrigin(0.5);
    const bw = Math.max(132, bt.width + 34);
    const bb = panel(ui, x0 + 28 + bw / 2, top + 40, 'ui_panel', bw, 52).setOrigin(0.5).setTint(0xeef6ff).setInteractive({ useHandCursor: true });
    bt.setPosition(x0 + 28 + bw / 2, top + 40);
    bb.on('pointerup', () => { Audio.play('sfx_click', { volume: 0.4 }); this.backStep(); });
    C.add([bb, bt]);
    // ---- portrait + 따라가기 on its bottom corner
    const PS = 200, pcx = x0 + 24 + PS / 2, pcy = top + 96 + PS / 2;
    const fb = frameG(ui.add.graphics(), pcx, pcy, PS, 28, true);
    const img = ui.add.image(pcx, pcy, '__WHITE').setVisible(false);
    const letter = ui.add.text(pcx, pcy, '', TXT(80, '#6b7686', '900')).setOrigin(0.5).setVisible(false);
    const ff = frameG(ui.add.graphics(), pcx, pcy, PS, 28, false);
    this.profPortrait = setPortrait(ui, img, letter, p.look, R.shortName(p), pcx, pcy, PS);
    this.profImg = { img, letter, look: p.look, name: R.shortName(p), x: pcx, y: pcy, s: PS };
    C.add([fb, img, letter, ff]);
    const fx = x0 + 24 + PS - 40, fy = top + 96 + PS - 4;
    const fbtn = panel(ui, fx, fy, 'ui_button_green', 168, 56).setOrigin(0.5).setInteractive({ useHandCursor: true });
    const eye = ui.add.graphics();
    eye.fillStyle(0xffffff, 1); eye.fillEllipse(0, 0, 28, 17);
    eye.fillStyle(0x2e7d4f, 1); eye.fillCircle(0, 0, 5.5);
    const ft = ui.add.text(0, fy - 1, rt('r_follow'), TXT(22, '#ffffff', '900')).setOrigin(0, 0.5);
    if (ft.width > 112) ft.setScale(112 / ft.width);
    const fw = 28 + 8 + ft.displayWidth;
    eye.setPosition(fx - fw / 2 + 14, fy);
    ft.x = fx - fw / 2 + 36;
    fbtn.on('pointerup', () => this.followNow(p.pid));
    this.followBtn = fbtn;
    C.add([fbtn, eye, ft]);
    // ---- the header column right of the portrait
    // (the header column starts right of the 따라가기 button's overhang)
    const hx = fx + 84 + 8, hw = x0 + pw - 24 - hx;
    const nm = ui.add.text(hx, top + 112, '', TXT(34, '#2b2f3a', '900')).setOrigin(0, 0.5);
    fitText(nm, R.fullName(p), hw, 34, 26);
    const sex = rt(p.sex === 'f' ? 'r_female' : 'r_male');
    const sub = ui.add.text(hx, top + 156, getLang() === 'en' ? 'Age ' + p.age + ' · ' + sex : rt('r_age', { n: p.age }) + ' · ' + sex, TXT(22, '#6b7686', '800')).setOrigin(0, 0.5);
    this.profJob = ui.add.text(hx, top + 192, '', TXT(22, '#1f6f68', '800')).setOrigin(0, 0.5);
    fitText(this.profJob, R.jobText(p), hw, 22, 18);
    const wg = R.wage(p, {});
    let wtxt = '';
    if (wg.pay === 'salary') wtxt = rt('r_wage', { m: fmt(wg.month), d: fmt(wg.day) });
    else if (wg.pay === 'pension') wtxt = rt('r_pension', { m: fmt(wg.month), d: fmt(wg.day) });
    else if (wg.pay === 'pocket') wtxt = rt('r_pocket', { m: fmt(wg.month), d: fmt(wg.day) });
    else if (wg.pay === 'none') wtxt = rt('r_nowage');
    const wt = ui.add.text(hx, top + 228, '', TXT(22, '#2b2f3a', '800')).setOrigin(0, 0.5);
    fitText(wt, wtxt, hw, 22, 17);
    C.add([nm, sub, this.profJob, wt]);
    let hy = top + 268;
    const tax = R.taxPerDay();
    this.profTax = tax && wg.pay !== 'toddler' ? rt('r_tax', { n: tax }) : '';
    if (this.profTax) {
      const tt = ui.add.text(hx, top + 258, '', TXT(18, '#7a8494', '800')).setOrigin(0, 0.5);
      fitText(tt, this.profTax, hw, 18, 16);
      C.add(tt);
      hy = top + 294;
    }
    // ---- 행복도: face + bar + number (live)
    const bw2 = this.hBarW = Math.max(120, Math.min(200, hw - 48 - 10 - 104));
    this.hFace = ui.add.image(hx + 20, hy, '__WHITE').setVisible(false);
    this.hBarBg = ui.add.graphics();
    this.hBarBg.fillStyle(0xdfe6ef, 1); this.hBarBg.fillRoundedRect(hx + 48, hy - 9, bw2, 18, 9);
    this.hBar = ui.add.graphics();
    this.hNum = ui.add.text(hx + 48 + bw2 + 10, hy, '', TXT(20, '#2b2f3a', '900')).setOrigin(0, 0.5);
    this.hRoom = hw - (48 + bw2 + 10);
    this.hBarX = hx + 48; this.hBarY = hy;
    C.add([this.hFace, this.hBarBg, this.hBar, this.hNum]);
    // ---- the rows
    const lx = x0 + 28, vx = x0 + 188, vw = pw - 28 - 160 - 24;
    const gap = tight ? 6 : (B.ph >= 1080 ? 16 : 10), vs = tight ? 20 : 22, ls = tight ? 18 : 20;
    let y = Math.max(top + 336, hy + 40);
    const label = (key) => { const l = ui.add.text(lx, y + 2, rt(key), TXT(ls, '#6b7686', '800')).setOrigin(0, 0); if (l.width > 150) l.setScale(150 / l.width); C.add(l); return l; };
    const value = (s, lines, color, size) => {
      const v = ui.add.text(vx, y, s, TXT(size || vs, color || '#2b2f3a', '800', { wordWrap: { width: vw, useAdvancedWrap: true }, maxLines: lines || 2 })).setOrigin(0, 0);
      C.add(v);
      return v;
    };
    const rowEnd = (h) => { y += Math.max(h, ls + 8) + gap; };
    // 지금 하는 일 (live: a dot + the text)
    label('r_l_now');
    this.nowDot = ui.add.graphics().setPosition(vx + 6, y + vs * 0.62);
    this.nowT = ui.add.text(vx + 18, y, '', TXT(vs, '#2b2f3a', '800')).setOrigin(0, 0);
    this.nowW = vw - 18; this.nowBase = vs;
    C.add([this.nowDot, this.nowT]);
    rowEnd(vs * 1.3);
    // 사는 곳
    label('r_l_home');
    const mates = R.housemates(p);
    const fam = R.family(p);
    const famSet = new Set(fam.map((q) => q.p));
    let home = R.homeText(p);
    if (p.home && p.home.kind !== 'persona') home += ' · ' + (mates.length ? rt('r_with', { n: mates.length + 1 }) : rt('r_alone'));
    const hv = value(home, 2);
    rowEnd(hv.height);
    // 가족 / 같이 사는 사람 / 친한 사이: name buttons
    const chips = (key, list, lines) => {
      if (!list.length) return;
      label(key);
      const h = this.nameChips(C, list, vx, y, vw, lines, tight);
      rowEnd(h);
    };
    chips('r_l_family', fam, 3);
    const others = mates.filter((q) => !famSet.has(q)).map((q) => ({ p: q, rel: '' }));
    chips('r_l_mates', others, 2);
    chips('r_l_friends', R.friends(p), 2);
    // 행복한 이유 (live; two lines kept)
    this.whyL = label('r_l_why');
    this.whyT = value('', 2);
    rowEnd(Math.max(this.whyT.height, vs * 2.5));
    // 가치 추구 + its line
    label('r_l_values');
    const vals = R.values(p).map((id) => VALUE_BY_ID[id]).filter(Boolean);
    const v1 = value(vals.map((v) => v[L === 'en' ? 'en' : 'ko']).join(' · '), 1, '#2b2f3a');
    y += v1.height + 2;
    const v2 = value(vals.length ? '“' + vals[0].line[L] + '”' : '', 2, '#7a8494', tight ? 18 : 20);
    y -= v1.height + 2;
    rowEnd(v1.height + 2 + v2.height);
    // 성격 · 좋아하는 것
    label('r_l_traits'); rowEnd(value(R.traits(p).join(' · '), 2).height);
    label('r_l_likes'); rowEnd(value(R.likes(p).join(' · '), 2).height);
    label('r_l_chief'); rowEnd(value(R.chiefText(p), 1).height);
    label('r_l_sched'); rowEnd(value(R.scheduleText(p), 2).height);
    label('r_l_moved'); rowEnd(value(R.movedText(p), 2).height);
    this.profBottom = y - gap;
    this.profFields = {
      pid: p.pid, name: R.fullName(p), short: R.shortName(p), age: p.age, sex: p.sex, job: R.jobText(p), wage: wtxt, tax: this.profTax, home,
      family: fam.map((q) => ({ pid: q.p.pid, name: R.shortName(q.p), rel: q.rel })), mates: others.map((q) => q.p.pid), friends: R.friends(p).map((q) => q.p.pid),
      values: R.values(p).slice(), valueLine: vals.length ? vals[0].line[L] : '', traits: R.traits(p).slice(), likes: R.likes(p).slice(),
      chief: R.chiefText(p), sched: R.scheduleText(p), moved: R.movedText(p), portrait: this.profPortrait,
    };
  }

  /** name buttons with their relation words, flowing over `lines` lines; returns the height used */
  nameChips(C, list, x, y, w, lines, tight) {
    const ui = this.ui, R = this.roster, H = 40, gap = 8;
    let cx = x, cy = y, line = 1, shown = 0;
    for (let i = 0; i < list.length; i++) {
      const q = list[i];
      const t = ui.add.text(0, 0, R.shortName(q.p) + ' ›', TXT(tight ? 19 : 20, '#1f4f8f', '900')).setOrigin(0.5);
      const bw = t.width + 24;
      const rel = q.rel ? ui.add.text(0, 0, q.rel, TXT(tight ? 17 : 18, '#6b7686', '800')).setOrigin(0, 0.5) : null;
      const need = bw + (rel ? 6 + rel.width : 0);
      if (cx > x && cx + need > x + w) {
        if (line >= lines) { t.destroy(); if (rel) rel.destroy(); break; }
        line++; cx = x; cy += H + 6;
      }
      const b = panel(ui, cx + bw / 2, cy + H / 2, 'ui_panel', bw, H).setOrigin(0.5).setTint(0xeef6ff).setInteractive({ useHandCursor: true });
      t.setPosition(cx + bw / 2, cy + H / 2);
      const pid = q.p.pid;
      b.on('pointerup', () => { Audio.play('sfx_click', { volume: 0.4 }); this.showProfile(pid, true, true); });
      b.__pid = pid;
      C.add([b, t]);
      if (rel) { if (rel.width > x + w - (cx + bw + 6)) rel.setScale(Math.max(0.6, (x + w - (cx + bw + 6)) / rel.width)); rel.setPosition(cx + bw + 6, cy + H / 2); C.add(rel); }
      cx += need + gap + 4;
      shown++;
    }
    if (shown < list.length) {
      const m = ui.add.text(Math.min(cx, x + w - 60), cy + H / 2, rt('r_more_n', { n: list.length - shown }), TXT(18, '#6b7686', '800')).setOrigin(0, 0.5);
      C.add(m);
    }
    return cy - y + H;
  }

  fillProfileLive() {
    if (this.view !== 'profile' || !this.profC) return;
    const R = this.roster, p = R.get(this.pid);
    if (!p) { this.showList(); return; }
    const a = this.act;
    const pi = this.profImg;
    if (pi && this.profPortrait !== 'portrait' && ready(portraitKey(pi.look))) { this.profPortrait = setPortrait(this.ui, pi.img, pi.letter, pi.look, pi.name, pi.x, pi.y, pi.s); if (this.profFields) this.profFields.portrait = this.profPortrait; }
    R.resolve(p);
    R.action(p, a);
    fitText(this.nowT, a.text, this.nowW, this.nowBase, 18);
    if (this.nowDotC !== a.dot) { this.nowDotC = a.dot; this.nowDot.clear(); this.nowDot.fillStyle(a.dot, 1); this.nowDot.fillCircle(0, 0, 6); }
    this.nowKey = a.key;
    const jt = R.jobText(p);
    if (this.profJob.__src !== jt) fitText(this.profJob, jt, this.profJob.__w || 380, 22, 18);
    const h = R.happiness(p, this.hap);
    const num = rt('r_happy', { n: h.score });
    if (this.hNum.text !== num) { this.hNum.setText(num); if (this.hNum.width > this.hRoom) this.hNum.setScale(this.hRoom / this.hNum.width); else this.hNum.setScale(1); }
    if (this.hScore !== h.score) {
      this.hScore = h.score;
      this.hBar.clear(); this.hBar.fillStyle(BAR(h.score), 1);
      this.hBar.fillRoundedRect(this.hBarX, this.hBarY - 9, Math.max(18, this.hBarW * h.score / 100), 18, 9);
    }
    if (this.hFaceN !== h.face) {
      this.hFaceN = h.face;
      const fk = FACE[h.face];
      if (ready(fk)) { const r = Assets.sprite(fk); this.hFace.setTexture(r.tex, r.frame).setOrigin(0.5).setVisible(true); fitIcon(this.hFace, 40); }
      else this.hFace.setVisible(false);
    }
    const why = h.reasons.map((k) => R.reasonText(k)).filter(Boolean).join(' · ');
    if (this.whyT.text !== why) this.whyT.setText(why);
    const wl = rt(h.score >= 60 ? 'r_l_why' : 'r_l_why2');
    if (this.whyL.text !== wl) { this.whyL.setText(wl); this.whyL.setScale(this.whyL.width > 150 ? 150 / this.whyL.width : 1); }
  }

  followNow(pid) {
    const p = this.roster.get(pid);
    if (!p) return false;
    Audio.play('sfx_click', { volume: 0.5 });
    this.close(true);
    return this.follow.start(p);
  }

  // ================================================================ frame (UI scene)
  update(dt) {
    const ui = this.ui, gs = this.gs;
    if (!gs || !gs.player) return;
    // (reload fix) the chip was never drawn after a reload: Game.updatePopulation ran before the UI scene existed
    if (!this.inited && ui.ready) { this.inited = true; this.chipOn = this.chipAvailable(); ui.popKey = ''; gs.updatePopulation(); }
    this.chipT -= dt;
    if (this.chipT <= 0) {
      this.chipT = 0.5;
      const H = window.__FV;
      if (H && H.residents !== this.hooks) H.residents = this.hooks;
      const on = this.chipAvailable();
      if (on !== this.chipOn) {
        this.chipOn = on;
        ui.popKey = ''; gs.updatePopulation();
        const pr = gs.progress;
        if (on && pr && pr.seen && !pr.seen.resWin && ui.popBox.visible) { pr.seen.resWin = true; this.pulseChip(); }
      }
    }
    this.follow.update(dt);
    if (!this.c) return;
    // a ceremony / the overview / the tour while open: close
    const ob = gs.onboard;
    if ((gs.v4 && gs.v4.rank && gs.v4.rank.ceremonyOn) || gs.overview || (ob && ob.mode === 'tour') || ui.panelOpen || ui.buildOpen) { this.close(); return; }
    this.liveT -= dt;
    if (this.liveT > 0) return;
    this.liveT = 0.5;
    if (this.view === 'list') this.fillList(false);
    else this.fillProfileLive();
  }

  // ================================================================ test hooks (window.__FV.residents)
  makeHooks() {
    const self = this;
    const rowState = (r) => {
      const p = self.roster.get(r.pid);
      return {
        pid: r.pid, name: r.name.text, age: r.age.text, sex: r.pillT.text, job: r.job.text, action: r.act.text, actionKey: r.actKey, portrait: r.pmode,
        fit: { name: [Math.round(r.name.displayWidth), 356], job: [Math.round(r.job.displayWidth), 356], act: [Math.round(r.act.displayWidth), 340], line1: Math.round(r.pillT.x + 15 - (self.box.x0 + 124)) },
        body: p ? p.bodyKind : null,
      };
    };
    return {
      following: null,
      open(pid) { return self.open('test', pid); },
      tapChip() { if (!self.ui.popBox.visible || !self.chev.visible) return false; return self.open('chip'); },
      close() { self.close(true); return true; },
      back() { return Back.handle(); },
      page(n) { if (n !== undefined && self.view === 'list') { self.page = Math.max(0, Math.min(self.pages() - 1, n)); self.fillList(true); } return self.page; },
      flip(d) { self.flip(d); return self.page; },
      filter(f) { if (f && FILTERS.indexOf(f) >= 0 && self.view === 'list') { self.filter = f; self.page = 0; self.fillList(true); } return self.filter; },
      profile(pid) { return self.c ? self.showProfile(pid, true, false) : self.open('test', pid); },
      family(i) { const C = self.profC; if (!C) return null; const bs = C.list.filter((o) => o.__pid); const b = bs[i || 0]; if (!b) return null; b.emit('pointerup'); return b.__pid; },
      more(i) { const r = self.rows && self.rows[i || 0]; if (!r || !r.pid) return null; r.btn.emit('pointerup'); return r.pid; },
      followBtn() { if (!self.followBtn || !self.c) return false; self.followBtn.emit('pointerup'); return true; },
      follow(pid) { const p = self.roster.get(pid); if (!p) return false; self.close(true); return self.follow.start(p); },
      unfollow() { self.follow.stop('x'); return true; },
      chipX() { if (self.follow.x) { self.follow.x.emit('pointerdown'); return true; } return false; },
      list() { return self.roster.list().map((p) => p.pid); },
      person(pid) {
        const R = self.roster, p = R.get(pid);
        if (!p) return null;
        R.resolve(p);
        const a = R.action(p, {});
        const h = R.happiness(p, {});
        return { pid, kind: p.kind, key: p.key || null, look: p.look, name: R.shortName(p), full: R.fullName(p), age: p.age, sex: p.sex, job: R.jobText(p), jobNow: R.jobNow(p), home: R.homeText(p),
          wage: R.wage(p, {}), values: R.values(p).slice(), action: a.text, actionKey: a.key, where: a.where, place: [Math.round(a.x || 0), Math.round(a.y || 0)], body: p.bodyKind, happy: h.score, reasons: h.reasons.slice() };
      },
      state() {
        const ui = self.ui;
        return {
          available: self.available(), chipAvailable: self.chipAvailable(), busy: self.busy(), open: !!self.c, view: self.view, page: self.page, pages: self.c ? self.pages() : 0, filter: self.filter,
          n: self.roster.list().length, people: self.gs.life ? self.gs.life.people() : 0, shown: self.flist.length, counts: self.counts ? Object.assign({}, self.counts) : null,
          chip: { visible: ui.popBox.visible, text: ui.popText.text, tappable: self.chev.visible, x: Math.round(ui.popBox.x), y: Math.round(ui.popBox.y), w: Math.round(ui.popBg.width) },
          title: self.title && self.view === 'list' ? self.title.text : null, pageText: self.pageT && self.view === 'list' ? self.pageT.text : null,
          rows: self.view === 'list' && self.rows ? self.rows.filter((r) => r.pid && r.c.visible).map(rowState) : [],
          profile: self.view === 'profile' && self.profFields ? Object.assign({}, self.profFields, { now: self.nowT.text, nowKey: self.nowKey, happy: self.hScore, why: self.whyT.text, bottom: Math.round(self.profBottom), boxBottom: self.box.top + self.box.ph, back: self.stack.slice() }) : null,
          follow: self.follow.state(), box: self.box ? Object.assign({}, self.box) : null, back: Back.size,
        };
      },
    };
  }
}
