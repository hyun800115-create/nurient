// The mission panel (non-pausing, like the v4 order board): the cork board (ui3 ui_mission_board) with tabs
// 진행 중 · 게시판 · 오늘 · 이번 주 · 칭호, mission cards (ui_mission_card / _done) with kind icons, progress bars
// (ui_progress_bg / _fill), coin and fame rewards, '받기' / '다른 미션' buttons, the streak strip with the snowman
// shield, the week's three stages with the decor it gives, and the five chief titles with their badges.

import { TXT, COL, icon, fit, panel, button, roundButton, progressBar, has, KIND_ICON, Assets } from './ui.js';
import { mt, titleOf, hourLabel, fmtN } from '../strings.js';
import { unitsOf } from '../model/units.js';
import { tpl as tplOf } from '../data/catalog.js';
import { TITLE_REWARDS } from '../model/fame.js';

const TABS = [
  { id: 'active', key: 'm_tab_active', icon: 'ui_icon_request' },
  { id: 'board', key: 'm_tab_board', icon: 'ui_icon_mission' },
  { id: 'today', key: 'm_tab_today', icon: 'ui_icon_day' },
  { id: 'week', key: 'm_tab_week', icon: 'ui_icon_calendar' },
  { id: 'titles', key: 'm_tab_titles', icon: 'ui_icon_title' },
];
const HOUR = 25;
const CARD_H = 142, GAP = 10;

export class MissionPanel {
  constructor(host) {
    this.host = host;
    this.ui = host.ports.ui.scene;
    this.p = null;
    this.tab = 'active';
  }

  get W() { return this.ui.W || 720; }
  get H() { return this.ui.H || 1280; }
  isOpen() { return !!this.p; }
  snd(k, o) { this.host.ports.sound.play(k, o); }

  open(tab) {
    if (tab) this.tab = tab;
    if (this.p) { this.lastKey = ''; this.build(); return; }
    const ui = this.ui, W = this.W, H = this.H;
    const c = ui.add.container(0, 0).setDepth(70);
    const dim = ui.add.rectangle(W / 2, H / 2, W * 2, H * 2, 0x1b2638, 0.35).setInteractive();
    dim.on('pointerup', () => this.close());
    c.add(dim);
    this.p = { c, root: null };
    if (this.host.ports.ui.panelOpened) this.host.ports.ui.panelOpened(true);
    this.build();
    c.setAlpha(0);
    ui.tweens.add({ targets: c, alpha: 1, duration: 140 });
    this.snd('sfx_click', { volume: 0.5 });
  }

  close(immediate) {
    const p = this.p;
    if (!p) return;
    this.p = null;
    if (this.host.ports.ui.panelOpened) this.host.ports.ui.panelOpened(false);
    if (immediate) { p.c.destroy(); return; }
    this.ui.tweens.add({ targets: p.c, alpha: 0, duration: 120, onComplete: () => p.c.destroy() });
  }

  update(dt) {
    if (!this.p) return;
    this.t = (this.t || 0) - dt;
    if (this.t > 0) return;
    this.t = 0.25;
    const key = this.contentKey();
    if (key !== this.lastKey) this.build();
  }

  contentKey() {
    const m = this.host.model, T = Math.floor(this.host.ports.clock.T() / 5);
    const L = m.list.map((i) => i.id + i.s + i.g.join('.')).join('|');
    const td = m.today(), wk = m.week(), fi = m.fameInfo();
    return [this.tab, L, JSON.stringify(td), JSON.stringify(wk), fi.pts, this.host.lang(), T, Object.values(m.bag).join(',')].join('#');
  }

  /** (re)build the whole panel for the current tab */
  build() {
    const ui = this.ui, W = this.W, H = this.H, h = this.host, lang = h.lang();
    this.lastKey = this.contentKey();
    if (this.p.root) this.p.root.destroy();
    const root = this.p.root = ui.add.container(0, 0);
    this.p.c.add(root);
    const pw = Math.min(W - 24, 680), ph = Math.min(H - 150, 1180);
    const top = Math.max(96 + (h.ports.ui.safeTop || 0), (H - ph) / 2);
    this.box = { pw, ph, top, x0: W / 2 - pw / 2 };
    const bg = panel(ui, W / 2, top + ph / 2, has('ui_mission_board') ? 'ui_mission_board' : 'ui_panel', pw, ph).setOrigin(0.5).setInteractive();
    bg.on('pointerup', () => {});
    root.add(bg);
    // title on the snowy wooden rail
    const ttl = ui.add.text(W / 2 + 22, top + 32, mt(lang, 'm_panel'), TXT(30, '#ffffff', '#5a3a26', 7)).setOrigin(0.5);
    root.add(icon(ui, ttl.x - ttl.width / 2 - 26, top + 31, ['ui_icon_mission'], 44));
    root.add(ttl);
    root.add(roundButton(ui, W / 2 + pw / 2 - 34, top + 30, 'ui_icon_close', 60, () => this.close(), (k, o) => this.snd(k, o)));
    // the fame strip
    this.fameStrip(root, top + 96, pw - 76);
    // tabs
    const tw = (pw - 76) / TABS.length, ty = top + 162;
    TABS.forEach((tb, i) => {
      const x = W / 2 - (pw - 76) / 2 + tw * i + tw / 2;
      const on = tb.id === this.tab;
      const c = ui.add.container(x, ty);
      const b = panel(ui, 0, 0, on ? 'ui_button_blue' : 'ui_panel', tw - 6, 58).setOrigin(0.5);
      if (!on) b.setAlpha(0.95);
      const ic = icon(ui, -tw / 2 + 24, -1, [tb.icon], 28);
      const lb = ui.add.text(10, -2, mt(lang, tb.key), on ? TXT(19, '#ffffff', 'rgba(0,0,0,0.25)', 4) : TXT(19, COL.brown)).setOrigin(0.5);
      fit(lb, tw - 54);
      c.add([b, ic, lb]);
      // a pink dot: something to look at on that tab
      if (!on && this.tabDot(tb.id)) { const d = ui.add.graphics(); d.fillStyle(0xd4426f, 1); d.fillCircle(tw / 2 - 14, -20, 8); d.lineStyle(2, 0xffffff, 1); d.strokeCircle(tw / 2 - 14, -20, 8); c.add(d); }
      c.setSize(tw - 6, 58);
      c.setInteractive({ useHandCursor: true });
      c.on('pointerdown', (p, lx, ly, ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); if (this.tab !== tb.id) { this.tab = tb.id; this.snd('sfx_click', { volume: 0.5 }); this.build(); } });
      root.add(c);
    });
    const area = { x0: W / 2 - (pw - 72) / 2, w: pw - 72, y: top + 214, bottom: top + ph - 70 };
    if (this.tab === 'active') this.tabActive(root, area);
    else if (this.tab === 'board') this.tabBoard(root, area);
    else if (this.tab === 'today') this.tabToday(root, area);
    else if (this.tab === 'week') this.tabWeek(root, area);
    else this.tabTitles(root, area);
  }

  tabDot(id) {
    const m = this.host.model;
    if (id === 'active') return m.bubbles().length > 0;
    if (id === 'today') { const td = m.today(); return !!(td && !td.all); }
    return false;
  }

  fameStrip(root, y, w) {
    const ui = this.ui, W = this.W, lang = this.host.lang();
    const fi = this.host.model.fameInfo();
    root.add(panel(ui, W / 2, y, 'ui_panel', w, 62).setOrigin(0.5).setAlpha(0.97));
    const x0 = W / 2 - w / 2;
    root.add(icon(ui, x0 + 36, y - 1, ['ui_badge_rank_' + fi.title, 'ui_icon_title'], 54));
    const nm = ui.add.text(x0 + 72, y - 12, mt(lang, 't_' + fi.title), TXT(21, COL.ink)).setOrigin(0, 0.5);
    root.add(nm);
    const pts = ui.add.text(x0 + w - 18, y - 12, mt(lang, 'm_fame_n', { n: fmtN(fi.pts) }), TXT(19, COL.gold)).setOrigin(1, 0.5);
    root.add(pts);
    const bar = progressBar(ui, x0 + 72, y + 14, w - 92 - 150, 16, COL.fame);
    bar.set(fi.next ? (fi.pts - fi.at) / Math.max(1, fi.next - fi.at) : 1);
    root.add(bar);
    const nx = ui.add.text(x0 + w - 18, y + 14, fi.next ? mt(lang, 'm_next_title', { n: fmtN(fi.next - fi.pts) }) : mt(lang, 'm_title_max'), TXT(15, COL.soft, '#ffffff', 0, '800')).setOrigin(1, 0.5);
    fit(nx, 160);
    root.add(nx);
  }

  // ------------------------------------------------------------------------------------------------ tabs
  tabActive(root, a) {
    const m = this.host.model, lang = this.host.lang();
    const list = m.active().slice().sort((x, y) => (x.d || 1e12) - (y.d || 1e12) || x.t0 - y.t0);
    const waiting = m.bubbles();
    let y = a.y;
    const room = Math.floor((a.bottom - a.y) / (CARD_H + GAP));
    let shown = 0;
    for (const i of list) { if (shown >= room) break; this.missionCard(root, a.x0, y, a.w, i, {}); y += CARD_H + GAP; shown++; }
    if (shown < room && waiting.length) {
      root.add(this.ui.add.text(a.x0 + 12, y + 14, '♥ ' + mt(lang, 'm_new_req'), TXT(19, COL.pink)).setOrigin(0, 0.5));
      y += 34;
      for (const i of waiting) {
        if (y + CARD_H > a.bottom) break;
        this.missionCard(root, a.x0, y, a.w, i, { accept: true }); y += CARD_H + GAP; shown++;
      }
    }
    if (!list.length && !waiting.length) this.empty(root, a, mt(lang, 'm_empty_active'));
    this.footer(root, a, this.bagLine());
  }

  tabBoard(root, a) {
    const m = this.host.model, lang = this.host.lang();
    let y = a.y;
    for (const i of m.board()) { this.missionCard(root, a.x0, y, a.w, i, { swap: true }); y += CARD_H + GAP; }
    if (!m.board().length) this.empty(root, a, mt(lang, 'm_empty_board'));
    else {
      // how the board works, in one easy line (no 받기: these fill up as the chief plays)
      const note = this.ui.add.text(this.W / 2, y + 14, mt(lang, 'm_board_note', { n: Math.round(this.host.cfg.swapAfter / 60) }),
        Object.assign(TXT(19, COL.brown, '#ffffff', 0, '800'), { align: 'center', lineSpacing: 4, wordWrap: { width: a.w - 60, useAdvancedWrap: true } })).setOrigin(0.5, 0).setAlpha(0.85);
      root.add(note);
    }
    const pk = m.parked().length;
    this.footer(root, a, pk ? mt(lang, 'm_parked', { n: pk }) : '');
  }

  tabToday(root, a) {
    const ui = this.ui, m = this.host.model, lang = this.host.lang(), W = this.W;
    const td = m.today();
    let y = a.y;
    root.add(ui.add.text(a.x0 + 10, y + 12, mt(lang, 'm_daily_title') + '  ·  ' + mt(lang, 'm_daily_reset'), TXT(18, COL.brown, '#ffffff', 0, '800')).setOrigin(0, 0.5));
    y += 32;
    if (td) for (let k = 0; k < td.list.length; k++) {
      const it = td.list[k], t = tplOf(it.code);
      this.card(root, a.x0, y, a.w, { t, g: it.g, done: it.done, coins: this.host.model.pay(this.host.cfg.daily.pay), fame: this.host.cfg.daily.fame, title: titleOf(t, lang, {}), sub: mt(lang, 'm_kind_daily') });
      y += CARD_H - 18 + GAP;
    }
    // the bonus for all three
    const allC = this.host.model.pay(this.host.cfg.daily.allPay);
    const bonus = ui.add.container(W / 2, y + 30);
    bonus.add(panel(ui, 0, 0, td && td.all ? 'ui_button_green' : 'ui_panel', a.w, 56).setOrigin(0.5));
    const bt = ui.add.text(0, -2, mt(lang, 'm_daily_all', { coins: fmtN(allC), fame: this.host.cfg.daily.allFame }), td && td.all ? TXT(20, '#ffffff', 'rgba(0,0,0,0.25)', 4) : TXT(20, COL.ink)).setOrigin(0.5);
    fit(bt, a.w - 40);
    bonus.add(bt);
    root.add(bonus);
    y += 76;
    this.streakStrip(root, a, y);
  }

  streakStrip(root, a, y) {
    const ui = this.ui, m = this.host.model, lang = this.host.lang(), W = this.W;
    const st = m.streak();
    const H = 170;
    root.add(panel(ui, W / 2, y + H / 2, 'ui_panel', a.w, H).setOrigin(0.5).setAlpha(0.97));
    root.add(icon(ui, a.x0 + 36, y + 32, ['ui_icon_calendar'], 40));
    root.add(ui.add.text(a.x0 + 66, y + 32, st.n ? mt(lang, 'm_streak', { n: st.n }) : mt(lang, 'm_streak_none'), TXT(22, COL.ink)).setOrigin(0, 0.5));
    // seven days: rewards on 2, 3, 5, 7
    const day = st.n ? ((st.n - 1) % 7) + 1 : 0;
    const R = this.host.cfg.streak.rewards;
    const pw = (a.w - 40) / 7;
    for (let d = 1; d <= 7; d++) {
      const x = a.x0 + 20 + pw * (d - 1) + pw / 2, yy = y + 92;
      const g = ui.add.graphics();
      const done = d <= day;
      g.fillStyle(done ? 0xffc83d : 0xe9e2d2, 1); g.fillCircle(x, yy, 25);
      g.lineStyle(3, done ? 0xe8a33d : 0xd2c5a8, 1); g.strokeCircle(x, yy, 25);
      root.add(g);
      const r = R[d];
      const ik = r ? (r.flair ? 'ui_icon_title' : r.decor ? 'ui_icon_flower' : r.pay ? 'ui_icon_coin' : 'ui_icon_fame') : null;
      if (ik) root.add(icon(ui, x, yy, [ik], 32).setAlpha(done ? 1 : 0.75));
      else root.add(ui.add.text(x, yy, String(d), TXT(20, done ? '#ffffff' : COL.soft, done ? '#e8a33d' : '#ffffff', done ? 3 : 0)).setOrigin(0.5));
      root.add(ui.add.text(x, yy + 36, String(d), TXT(14, COL.soft, '#ffffff', 0, '800')).setOrigin(0.5));
    }
    // the snowman shield
    const sh = has('snowman_3') ? Assets.image(ui, a.x0 + a.w - 34, y + 40, 'snowman_3') : null;
    if (sh) { sh.setScale(46 / Math.max(1, sh.frame.realHeight)).setOrigin(0.5, 0.55); if (!st.shield) sh.setAlpha(0.35); root.add(sh); }
    const shT = ui.add.text(a.x0 + a.w - 62, y + 32, st.shield ? mt(lang, 'm_shield_free') : mt(lang, 'm_shield_used'), TXT(14, st.shield ? COL.blue : COL.soft, '#ffffff', 0, '800')).setOrigin(1, 0.5);
    fit(shT, a.w - 300);
    root.add(shT);
  }

  tabWeek(root, a) {
    const ui = this.ui, m = this.host.model, lang = this.host.lang(), W = this.W, cfg = this.host.cfg;
    const wk = m.week();
    if (!wk) { this.empty(root, a, mt(lang, 'm_empty_board')); return; }
    const t = tplOf(wk.code);
    let y = a.y + 8;
    const Hc = 250;
    root.add(panel(ui, W / 2, y + Hc / 2, wk.stage >= 3 ? 'ui_mission_card_done' : 'ui_mission_card', a.w, Hc).setOrigin(0.5));
    root.add(icon(ui, a.x0 + 82, y + 58, [t.icon, 'ui_icon_calendar'], 66));
    const tt = ui.add.text(a.x0 + 128, y + 44, mt(lang, 'm_week_title') + ' · ' + titleOf(t, lang, {}), TXT(25, COL.ink)).setOrigin(0, 0.5);
    fit(tt, a.w - 150);
    root.add(tt);
    // which stage, and what counts (in easy words)
    const how = ui.add.text(a.x0 + 128, y + 78, mt(lang, 'm_week_stage', { s: wk.stage }) + ' · ' + mt(lang, 'wk_' + t.sig), TXT(19, COL.soft, '#ffffff', 0, '800')).setOrigin(0, 0.5);
    fit(how, a.w - 150);
    root.add(how);
    // three stages along one bar
    const bx = a.x0 + 60, bw = a.w - 120, by = y + 150;
    const max = t.stages[2];
    const bar = progressBar(ui, bx, by, bw, 24, wk.stage >= 3 ? COL.barDone : COL.fame);
    bar.set(Math.min(1, wk.g / max));
    root.add(bar);
    t.stages.forEach((s, k) => {
      const x = bx + bw * (s / max);
      const done = wk.stage > k;
      const g = ui.add.graphics();
      g.fillStyle(done ? 0x5cc86a : 0xfff8ec, 1); g.fillCircle(x, by, 17); g.lineStyle(3, done ? 0x3c9a4a : 0xd2c5a8, 1); g.strokeCircle(x, by, 17);
      root.add(g);
      root.add(icon(ui, x, by, [done ? 'ui_icon_check' : 'ui_icon_fame'], 22));
      const lx = Math.min(x, a.x0 + a.w - 74);      // the last stage's labels stay inside the card
      root.add(ui.add.text(lx, by + 34, fmtN(s), TXT(17, COL.ink, '#ffffff', 0, '900')).setOrigin(0.5));
      const r = ui.add.text(lx, by + 58, '+' + fmtN(m.pay(cfg.weekly.pay[k])) + ' · ★' + cfg.weekly.fame[k], TXT(14, COL.gold, '#ffffff', 0, '800')).setOrigin(0.5);
      fit(r, bw / 3);
      root.add(r);
    });
    root.add(ui.add.text(bx + bw, by - 32, fmtN(wk.g) + ' / ' + fmtN(max), TXT(17, COL.ink)).setOrigin(1, 0.5));
    // the decor of the week, shown for real
    y += Hc + 18;
    const dec = cfg.weekly.decor[Math.floor(wk.w / 7) % cfg.weekly.decor.length];
    const Hd = 210;
    root.add(panel(ui, W / 2, y + Hd / 2, 'ui_panel', a.w, Hd).setOrigin(0.5).setAlpha(0.97));
    if (has(dec)) {
      // fit the decor art inside the card (its own anchor sits at the base: centre it instead)
      const im = Assets.image(ui, a.x0 + 140, y + Hd / 2 + 4, dec).setOrigin(0.5, 0.5);
      const s = Math.min(150 / Math.max(1, im.frame.realHeight), 200 / Math.max(1, im.frame.realWidth));
      im.setScale(s);
      root.add(im);
    }
    const dt = ui.add.text(a.x0 + 270, y + 80, mt(lang, 'm_week_decor', { decor: mt(lang, 'd_' + dec) }), Object.assign(TXT(22, COL.ink), { wordWrap: { width: a.w - 300, useAdvancedWrap: true } })).setOrigin(0, 0.5);
    root.add(dt);
    root.add(ui.add.text(a.x0 + 270, y + 150, mt(lang, 'm_daily_reset').replace(/내일 새벽 5시에/, '월요일 새벽 5시에').replace('New ones at 5 a.m.', 'New goal on Monday 5 a.m.'), TXT(16, COL.soft, '#ffffff', 0, '800')).setOrigin(0, 0.5));
  }

  tabTitles(root, a) {
    const ui = this.ui, m = this.host.model, lang = this.host.lang(), W = this.W;
    const fi = m.fameInfo(), T = this.host.cfg.fame.titles;
    const rh = Math.min(150, Math.floor((a.bottom - a.y) / 5) - 8);
    for (let lv = 1; lv <= 5; lv++) {
      const y = a.y + (lv - 1) * (rh + 8);
      const got = fi.title >= lv, cur = fi.title === lv;
      const bg = panel(ui, W / 2, y + rh / 2, cur ? 'ui_mission_card_done' : 'ui_mission_card', a.w, rh).setOrigin(0.5);
      if (!got) bg.setAlpha(0.8);
      root.add(bg);
      const b = icon(ui, a.x0 + 86, y + rh / 2, ['ui_badge_rank_' + lv, 'ui_icon_title'], rh - 30);
      if (!got) b.setTint(0xb8bec8).setAlpha(0.75);
      root.add(b);
      root.add(ui.add.text(a.x0 + 150, y + rh / 2 - 30, mt(lang, 't_' + lv), TXT(24, got ? COL.ink : COL.soft)).setOrigin(0, 0.5));
      root.add(ui.add.text(a.x0 + a.w - 24, y + rh / 2 - 30, mt(lang, 'm_fame_n', { n: fmtN(T[lv - 1]) }), TXT(18, got ? COL.gold : COL.soft)).setOrigin(1, 0.5));
      const desc = mt(lang, 'tr_' + lv) + (mt(lang, 'tx_' + lv) ? '\n' + mt(lang, 'tx_' + lv) : '');
      if (desc) {
        const d = ui.add.text(a.x0 + 150, y + rh / 2 + 14, desc, Object.assign(TXT(16, got ? COL.brown : COL.soft, '#ffffff', 0, '800'), { lineSpacing: 2, wordWrap: { width: a.w - 270, useAdvancedWrap: true } })).setOrigin(0, 0.5);
        fit(d, a.w - 270, rh - 64);
        root.add(d);
      }
      // the reward's own art, small, on the right
      const R = TITLE_REWARDS[lv];
      if (R && has(R.decor[0])) {
        const im = Assets.image(ui, a.x0 + a.w - 58, y + rh - 14, R.decor[0]);
        im.setScale(Math.min((rh - 48) / Math.max(1, im.frame.realHeight), 90 / Math.max(1, im.frame.realWidth)));
        if (!got) im.setAlpha(0.45);
        root.add(im);
      }
      if (cur) {
        const bar = progressBar(ui, a.x0 + 150, y + rh - 22, a.w - 320, 14, COL.fame);
        bar.set(fi.next ? (fi.pts - fi.at) / Math.max(1, fi.next - fi.at) : 1);
        root.add(bar);
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ cards
  /** a live mission instance as a card */
  missionCard(root, x0, y, w, inst, opts) {
    const h = this.host, m = h.model, lang = h.lang(), t = m.template(inst);
    const names = h.namesOf(inst);
    let sub = mt(lang, 'm_kind_' + t.kind);
    if (inst.gv && t.kind === 'request') sub = mt(lang, 'm_from', { giver: names.from }) + (inst.w && inst.w !== inst.gv ? '  ' + mt(lang, 'm_to', { to: names.to }) : '');
    const T = h.ports.clock.T();
    let dueTxt = null;
    if (inst.d) {
      const left = inst.d - T;
      dueTxt = left < h.cfg.focusDeadline ? mt(lang, 'm_due_soon') : mt(lang, 'm_due', { h: hourLabel((h.ports.clock.hour() + left / HOUR) % 24) });
    }
    const fame = Array.isArray(t.fame) ? t.fame[0] + '~' + t.fame[2] : t.fame;
    const coins = t.stages ? m.pay(t.pay / 3) : (t.kind === 'drive' ? m.pay(t.pay) : m.pay(t.pay));
    const card = this.card(root, x0, y, w, { t, g: inst.g, done: false, coins, fame, title: titleOf(t, lang, names), sub, due: dueTxt });
    if (opts.swap && m.canSwap(inst.id)) {
      card.add(button(this.ui, w - 92, CARD_H / 2 - 4, 150, 50, 'blue', mt(lang, 'm_swap'), () => { m.swap(inst.id); this.lastKey = ''; }, 21, (k, o) => this.snd(k, o)));
    }
    if (opts.accept) {
      card.add(button(this.ui, w - 92, CARD_H / 2 - 4, 150, 50, 'green', mt(lang, 'm_accept'), () => { h.accept(inst.id); this.lastKey = ''; }, 22, (k, o) => this.snd(k, o)));
    }
    return card;
  }

  /** a card: { t, g, done, coins, fame, title, sub, due } — x0 = left edge, y = top */
  card(root, x0, y, w, d) {
    const ui = this.ui, lang = this.host.lang();
    const daily = d.t.kind === 'daily';
    const Hc = daily ? CARD_H - 18 : CARD_H;
    const c = ui.add.container(x0, y);
    root.add(c);
    const U = unitsOf(d.t);
    let need = 0, got = 0, item = null;
    U.forEach((u, j) => { need += u.need; const gj = (d.g && d.g[j]) || 0; got += Math.min(u.need, gj); if (!item && gj < u.need) item = u.item || (u.any && u.any[0]) || null; });
    const done = d.done || (need > 0 && got >= need);
    c.add(panel(ui, w / 2, Hc / 2, done ? (has('ui_mission_card_done') ? 'ui_mission_card_done' : 'ui_panel') : (has('ui_mission_card') ? 'ui_mission_card' : 'ui_panel'), w, Hc).setOrigin(0.5));
    // kind / item icon in a soft round plate
    const plate = ui.add.graphics();
    plate.fillStyle(0xffffff, 0.75); plate.fillCircle(80, Hc / 2 - 2, 38);
    c.add(plate);
    const ik = d.t.icon && /^item_/.test(d.t.icon) ? [KIND_ICON[d.t.kind]] : [d.t.icon, KIND_ICON[d.t.kind]];
    c.add(icon(ui, 80, Hc / 2 - 2, ik, 58));
    if (d.t.icon && /^item_/.test(d.t.icon)) c.add(icon(ui, 102, Hc / 2 + 20, [d.t.icon], 34));
    const tx = 128, colR = w - 22;
    const title = ui.add.text(tx, 32, d.title, TXT(23, COL.ink)).setOrigin(0, 0.5);
    fit(title, w - tx - 150);
    c.add(title);
    const sub = ui.add.text(tx, 64, d.sub || '', TXT(17, COL.soft, '#ffffff', 0, '800')).setOrigin(0, 0.5);
    fit(sub, w - tx - 150);
    c.add(sub);
    if (d.due) {
      const tm = icon(ui, tx + sub.displayWidth + 22, 64, ['ui_icon_timer'], 24);
      const dt = ui.add.text(tm.x + 16, 64, d.due, TXT(17, '#d4426f', '#ffffff', 0, '900')).setOrigin(0, 0.5);
      c.add([tm, dt]);
    }
    // progress
    const bw = w - tx - 210, by = Hc - 34;
    const bar = progressBar(ui, tx, by, bw, 22, done ? COL.barDone : COL.bar);
    bar.set(need ? got / need : 0);
    c.add(bar);
    let cx = tx + bw + 10;
    if (item) { c.add(icon(ui, cx + 14, by, [item], 28)); cx += 32; }
    c.add(ui.add.text(cx, by, got + '/' + need, TXT(18, done ? COL.green : COL.ink)).setOrigin(0, 0.5));
    // rewards (top right): coins, fame
    if (d.coins > 0) {
      c.add(icon(ui, colR - 108, 30, ['ui_icon_coin'], 26));
      c.add(ui.add.text(colR - 92, 30, '+' + fmtN(d.coins), TXT(19, COL.gold)).setOrigin(0, 0.5));
    }
    c.add(icon(ui, colR - 108, d.coins > 0 ? 62 : 30, ['ui_icon_fame'], 26));
    c.add(ui.add.text(colR - 92, d.coins > 0 ? 62 : 30, '+' + d.fame, TXT(19, '#c4517a')).setOrigin(0, 0.5));
    if (done) { const ck = icon(ui, w - 30, 18, ['ui_icon_check'], 30); c.add(ck); }
    return c;
  }

  empty(root, a, text) {
    const t = this.ui.add.text(this.W / 2, a.y + 120, text, Object.assign(TXT(22, COL.brown, '#ffffff', 0, '800'), { align: 'center', lineSpacing: 6 })).setOrigin(0.5);
    root.add(t);
  }

  footer(root, a, text) {
    if (!text) return;
    const t = this.ui.add.text(this.W / 2, a.bottom + 34, text, TXT(18, COL.brown, '#ffffff', 0, '800')).setOrigin(0.5);
    fit(t, a.w);
    root.add(t);
  }

  bagLine() {
    const b = this.host.model.bag, lang = this.host.lang();
    const parts = [];
    for (const k in b) if (b[k] > 0) parts.push(mt(lang, 'i_' + k) + ' ' + b[k]);
    return parts.length ? mt(lang, 'm_bag') + ': ' + parts.join(' · ') : '';
  }

  destroy() { this.close(true); }
}
