// (v4.2, docs/v42_plan.md §6.7) the office panel — non-pausing, 720 x 1100 logical, a tap outside closes it.
// Tabs appear with their staff (a locked tab names who to hire): 재고 (셈이) · 소식 + 편지 (소복이) · 직원 · 통장 (the bank).
//   재고   the StockLedger's rows: status colour (부족 red / 길 막힘 orange / 남음 blue / 적당 green), pile → in/out → shelf,
//          flows per minute, a fix button that hops the camera to the pad (가공소 2단 · 짐꾼 2 · 물류창고로 보내요)
//   소식   today's paper (masthead, date + weather, headlines, an ad, the letters link)
//   편지   the inbox with the letters' buttons
//   직원   one line per person and what they do now; locked roles show cost and the hire pad
//   통장   the passbook (last 8 rows) and today's income by source as bars
// Art: (CODE-2) the ui5 set: tab plates ui_office_tab(_on) with the tab icons (ui_icon_inventory / news / letter /
// staff / bank), the 재고 rows on the ui_chalk_panel chalkboard with the glossy ui_status dots, each letter on its own
// ui_letter paper (the plates and papers live on the on-demand page ui5_icons@panels: asked for while the panel is
// open, the cream stand-ins until it is here; the icons are on the resident v42_core page).

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { View } from '../core/View.js';
import { Input } from '../core/Input.js';
import { panel } from '../core/Panel.js';
import { Residency } from '../core/Residency.js';
import { FONT, t, fmt } from '../data/strings.js';

const TXT = (size, color = '#2b2f3a', weight = '800', extra) => Object.assign({ fontFamily: FONT, fontSize: size + 'px', fontStyle: weight, color, resolution: 2 }, extra || {});
const STAT = { short: [0xd9534f, 'stat_short'], jam: [0xf0a030, 'stat_jam'], surplus: [0x5b8fd9, 'stat_surplus'], ok: [0x5cb85c, 'stat_ok'] };
const TABS = [['stock', 'tab_stock', 'sem'], ['news', 'tab_news', 'bok'], ['letters', 'tab_letters', 'bok'], ['staff', 'tab_staff', null], ['bank', 'tab_bank', 'bank']];
const TAB_ICON = { stock: 'ui_icon_inventory', news: 'ui_icon_news', letters: 'ui_icon_letter', staff: 'ui_icon_staff', bank: 'ui_icon_bank' };
const STAT_DOT = { short: 'ui_status_0', jam: 'ui_status_1', surplus: 'ui_status_2', ok: 'ui_status_3' };
const PANELS = 'ui5_icons@panels';
const fit = (im, s) => { im.setScale(s / Math.max(1, im.frame.realWidth, im.frame.realHeight)); return im; };

export class OfficePanel {
  constructor(ui) { this.ui = ui; this.c = null; this.tab = 'stock'; this.key = ''; this.t = 0; }

  get gs() { return this.ui.gs; }
  get office() { return this.gs && this.gs.v42 && this.gs.v42.office; }
  isOpen() { return !!this.c; }

  open(tab, src) {
    const ui = this.ui;
    if (!this.office) return;
    if (this.c) { this.show(tab || this.tab); return; }
    if (ui.panelOpen || ui.buildOpen || ui.v4PanelOpen) return;
    Input.release();
    this.src = src;
    const W = ui.W, H = ui.H;
    const pw = Math.min(W - 24, 700), ph = Math.min(H - 220 - View.safeTop - View.safeBottom, 1100);
    const top = Math.max(96 + View.safeTop, (H - ph) / 2);
    this.box = { pw, ph, top, x0: W / 2 - pw / 2 };
    const c = ui.add.container(0, 0).setDepth(72);
    const dim = ui.add.rectangle(W / 2, H / 2, W * 2, H * 2, 0x1b2638, 0.35).setInteractive();
    dim.on('pointerup', () => this.close());
    const bg = panel(ui, W / 2, top + ph / 2, 'ui_panel', pw, ph).setOrigin(0.5).setInteractive();
    bg.on('pointerup', () => {});
    c.add([dim, bg]);
    c.add(fit(Assets.image(ui, this.box.x0 + 50, top + 46, Assets.pick('ui_icon_office', 'ui_icon_mission', 'ui_icon_story', 'ui_icon_lock')).setOrigin(0.5), 46));
    c.add(ui.add.text(this.box.x0 + 84, top + 46, t('officeTitle'), TXT(32, '#2b2f3a', '900')).setOrigin(0, 0.5));
    if (ui.makeIconButton) c.add(ui.makeIconButton(W / 2 + pw / 2 - 40, top + 40, 'ui_icon_close', 60, () => this.close()));
    this.tabsC = ui.add.container(0, 0);
    this.body = ui.add.container(0, 0);
    c.add([this.tabsC, this.body]);
    this.c = c;
    ui.v42PanelOpen = true;
    if (Residency.gs) Residency.want(PANELS);
    c.setAlpha(0);
    // ((v4.2 fix, visual L5) the panel's plates live on an on-demand page: while it is on its way (the first open of a
    //  session) the panel waits up to 1.2 s invisible instead of showing the plain cream fallback and then jumping)
    this.waitArt = Assets.has('ui_office_tab') ? 0 : 1.2;
    if (!this.waitArt) ui.tweens.add({ targets: c, alpha: 1, duration: 140 });
    Audio.play('sfx_click', { volume: 0.5 });
    this.show(tab || 'stock');
    if (window.__FV) window.__FV.officePanel = this.tab;
  }

  close() {
    const ui = this.ui, c = this.c;
    if (!c) return;
    this.c = null;
    ui.v42PanelOpen = false;
    if (window.__FV) window.__FV.officePanel = null;
    ui.tweens.add({ targets: c, alpha: 0, duration: 110, onComplete: () => c.destroy() });
  }

  /** is tab `id` open to the player? (null = yes, else the reason text) */
  locked(id) {
    const O = this.office, need = (TABS.find((q) => q[0] === id) || [])[2];
    if (!need) return null;
    if (need === 'bank') return O.bank ? null : t('tabLockedBank');
    return O.hired(need) ? null : t('tabLocked', { role: t('role_' + need), name: t('staff_' + need) });
  }

  show(tab) {
    if (!this.c) { this.open(tab, 'show'); return; }      // (a tab asked for while the panel is closed: open it there)
    const ui = this.ui, B = this.box;
    this.tab = tab;
    if (window.__FV) window.__FV.officePanel = tab;
    this.tabsC.removeAll(true);
    const tw = (B.pw - 40) / TABS.length;
    const art = Assets.has('ui_office_tab');
    this.panelArt = art;
    TABS.forEach(([id, key], i) => {
      const x = B.x0 + 20 + tw * i + tw / 2, y = B.top + 112;
      const on = id === tab, lock = this.locked(id);
      let g;
      if (art) {
        // (ui5 plates: built 72 tall, scaled to the row; the raised one for the open tab)
        g = panel(ui, x, y + (on ? -3 : 2), on ? 'ui_office_tab_on' : 'ui_office_tab', (tw - 6) * 72 / 64, 72).setOrigin(0.5).setScale(64 / 72);
        if (lock) g.setAlpha(0.6);
      } else {
        g = panel(ui, x, y, 'ui_panel', tw - 8, 60).setOrigin(0.5);
        g.setTint(on ? 0xffe7a8 : lock ? 0xd6dbe3 : 0xffffff);
      }
      const ic = TAB_ICON[id] && Assets.has(TAB_ICON[id]) ? fit(Assets.image(ui, x - tw / 2 + 26, y, TAB_ICON[id]).setOrigin(0.5), 34).setAlpha(lock ? 0.5 : 1) : null;
      const label = t(key) + (id === 'letters' && this.gs.v42.news && this.gs.v42.news.unread() ? ' ●' : '');
      // ((v4.2 fix, visual M6) with an icon the label starts right of it and shrinks to the room left ('Letters' and
      //  'Passbook' ran under their icons in English)
      const room = ic ? tw - 26 - 17 - 6 - 8 : tw - 14;
      const tx = ui.add.text(ic ? x - tw / 2 + 26 + 17 + 6 : x, y, label, TXT(ic ? 20 : 23, lock ? '#8a93a3' : on ? '#1f5f66' : '#2b2f3a', '900')).setOrigin(ic ? 0 : 0.5, 0.5);
      if (tx.width > room) tx.setScale(room / tx.width);
      g.setInteractive({ useHandCursor: true });
      g.on('pointerup', () => { Audio.play('sfx_click', { volume: 0.4 }); this.show(id); });
      this.tabsC.add(ic ? [g, ic, tx] : [g, tx]);
    });
    this.key = '';
    this.fill();
  }

  /** rebuild the body when its data changed (2 Hz from update) */
  fill() {
    const O = this.office;
    if (!this.c || !O) return;
    const key = this.tab + '|' + this.dataKey();
    if (key === this.key) return;
    this.key = key;
    this.body.removeAll(true);
    const lock = this.locked(this.tab);
    if (lock) { this.text(this.box.x0 + this.box.pw / 2, this.box.top + 300, lock, 26, '#5b6676', 0.5); return; }
    this['tab_' + this.tab]();
  }

  dataKey() {
    const v = this.gs.v42, O = this.office;
    switch (this.tab) {
      case 'stock': return v.ledger ? v.ledger.rows().map((r) => r.status + r.pile + '.' + r.out + '.' + r.shelf + '.' + r.flow.join(',')).join('|') : '';
      case 'news': return v.news ? v.news.list.length + ':' + v.news.day + ':' + v.news.unread() : '';
      case 'letters': return v.news ? v.news.inbox.map((r) => r.id + ':' + r.state).join(',') : '';
      case 'staff': return O.staffRows().map((r) => r.text).join('|');
      case 'bank': return O.log.length + ':' + O.depositedTotal + ':' + JSON.stringify(O.income);
      case 'depot': { const Dp = v.depot; return Dp && Dp.built ? Dp.model.stock.ver + ':' + Dp.sleighs.map((x) => x.state + x.count()).join(',') : 'none'; }
      default: return '';
    }
  }

  // ------------------------------------------------------------------ helpers
  text(x, y, s, size, color, ox, extra) { const tx = this.ui.add.text(x, y, s, TXT(size || 22, color || '#2b2f3a', '800', extra)).setOrigin(ox === undefined ? 0 : ox, 0.5); this.body.add(tx); return tx; }
  icon(x, y, key, size) { const im = fit(Assets.image(this.ui, x, y, Assets.pick(key, 'ui_icon_lock')).setOrigin(0.5), size); this.body.add(im); return im; }
  button(x, y, w, label, fn, style) { const b = this.ui.makeButton(x, y, w, 56, style || 'blue', label, fn, 20); this.body.add(b); return b; }
  hop(x, y) { this.close(); this.gs.focusCamera(x, y, 2600); }

  // ------------------------------------------------------------------ 재고
  tab_stock() {
    const v = this.gs.v42, B = this.box, L = v.ledger, gs = this.gs;
    const rows = L ? L.rows() : [];
    const W = gs.warehouse;
    let top = t('stockTop', { n: fmt(L ? L.total() : 0), w: W ? W.total : 0, wc: W ? W.cap : 0 });
    if (v.depot && v.depot.built) top += t('stockTopDepot', { d: v.depot.total(), dc: v.depot.capTotal() });
    this.text(B.x0 + 36, B.top + 176, top, 21, '#2b2f3a');
    // (CODE-2) the rows on 셈이's chalkboard (ui5 ui_chalk_panel): chalk-white writing, glossy status dots
    const chalk = Assets.has('ui_chalk_panel');
    const ink = chalk ? ['#fdfbf2', '#d9e8dc', '#b9d3c2'] : ['#2b2f3a', '#5b6676', '#7a8494'];
    // (the board's wooden frame is ~28 px: the first row starts below it, the last ends above it)
    const y0 = chalk ? 262 : 240;
    if (chalk && rows.length) { const bh = rows.length * 128 + 56; this.body.add(panel(this.ui, B.x0 + B.pw / 2, B.top + 206 + bh / 2, 'ui_chalk_panel', B.pw - 36, bh).setOrigin(0.5)); }
    rows.forEach((r, i) => {
      const y = B.top + y0 + i * 128;
      const [col, sk] = STAT[r.status] || STAT.ok;
      if (Assets.has(STAT_DOT[r.status] || 'ui_status_3')) this.body.add(fit(Assets.image(this.ui, B.x0 + 46, y, STAT_DOT[r.status] || 'ui_status_3').setOrigin(0.5), 30));
      else { const g = this.ui.add.graphics(); g.fillStyle(col, 1); g.fillCircle(B.x0 + 46, y, 13); this.body.add(g); }
      this.icon(B.x0 + 90, y, r.product, 44);
      this.text(B.x0 + 122, y - 20, t('line_' + r.line) + ' · ' + t(sk), 22, ink[0]);
      const pile = r.pile === null ? '-' : Math.min(r.pile, r.pileCap || r.pile) + (r.pileCap && r.pile >= r.pileCap ? ' ' + t('pileFull') : '');
      this.text(B.x0 + 122, y + 12, t('stockRow', { pile, in: r.in, out: r.out, shelf: r.shelf }), 18, ink[1]);
      this.text(B.x0 + 122, y + 40, t('stockFlow', { a: r.flow[0], b: r.flow[1], c: r.flow[2] }), 16, ink[2]);
      const st = gs.stations[r.line];
      if (r.status === 'short' && st) this.button(B.x0 + B.pw - 110, y, 170, t('fix_station2'), () => this.hop(st.x, st.y + 60), 'blue');
      else if (r.status === 'jam' && st) this.button(B.x0 + B.pw - 110, y, 170, t('fix_p2'), () => this.hop(st.outPad.x, st.outPad.y), 'blue');
      else if (r.status === 'surplus') { const G = gs.v4 && gs.v4.growth; if (G && G.dock) this.button(B.x0 + B.pw - 110, y, 170, t('fix_depot'), () => this.hop(G.dock.x - 92, G.dock.y), 'blue'); }
    });
  }

  // ------------------------------------------------------------------ 소식
  tab_news() {
    const v = this.gs.v42, B = this.box, N = v.news;
    const P = N ? N.papers() : [];
    const cx = B.x0 + B.pw / 2;
    this.text(cx, B.top + 190, t('newsMast'), 40, '#2b2f3a', 0.5, { fontStyle: '900' });
    if (!P.length) { this.text(cx, B.top + 280, t('newsNone'), 22, '#5b6676', 0.5); return; }
    const p = P[P.length - 1];
    this.text(cx, B.top + 238, t('newsDate', { day: p.day + 1, weather: p.weather }), 20, '#5b6676', 0.5);
    const g = this.ui.add.graphics(); g.lineStyle(3, 0x2b2f3a, 1); g.lineBetween(B.x0 + 40, B.top + 262, B.x0 + B.pw - 40, B.top + 262); this.body.add(g);
    p.lines.forEach((ln, i) => this.text(B.x0 + 44, B.top + 300 + i * 70, (i === 0 ? '■ ' : '· ') + ln, i === 0 ? 25 : 21, '#2b2f3a', 0, { wordWrap: { width: B.pw - 90 } }));
    this.text(B.x0 + 44, B.top + 300 + p.lines.length * 70 + 10, t('ad_' + (p.day % 4)), 18, '#8a5a2a');
    const n = N.unread();
    if (n > 0) { const b = this.button(cx, B.top + B.ph - 80, 320, t('newsLetters', { n }), () => this.show('letters'), 'green'); void b; }
  }

  // ------------------------------------------------------------------ 편지
  tab_letters() {
    const v = this.gs.v42, B = this.box, N = v.news;
    const L = N ? N.letters().slice().reverse() : [];
    if (!L.length) { this.text(B.x0 + B.pw / 2, B.top + 280, t('lettersNone'), 24, '#5b6676', 0.5); return; }
    let y = B.top + 180;
    // (CODE-2) each letter on its own ui5 letter paper (ruled, a pinecone stamp in the corner)
    const paper = Assets.has('ui_letter');
    for (const lt of L.slice(0, 4)) {
      if (N && lt.state === 0) N.markRead(lt.id);
      const done = lt.state >= 2;
      const sheet = paper ? panel(this.ui, B.x0 + B.pw / 2, y - 26, 'ui_letter', B.pw - 40, 120).setOrigin(0.5, 0) : null;
      if (sheet) { this.body.add(sheet); if (done) sheet.setAlpha(0.6); }
      const px = paper ? 60 : 40, py = paper ? 44 : 0;
      this.text(B.x0 + px, y + py, t('letterFrom', { from: lt.from }) + (done ? ' · ' + t('letterArchived') : ''), 22, done ? '#8a93a3' : '#2b2f3a');
      const body = this.text(B.x0 + px, y + py + 34, lt.body, 18, done ? '#9aa2b0' : '#4a5361', 0, { wordWrap: { width: B.pw - px * 2 - 20 } });
      body.setOrigin(0, 0);
      let by = y + py + 40 + body.height + 30;
      if (!done) {
        lt.buttons.forEach((b, i) => this.button(B.x0 + 40 + 150 + i * 310, by, 290, t(b.k, b.a || {}), () => { N.answer(lt.id, i); this.key = ''; this.fill(); }, i === 0 ? 'green' : 'gray'));
        by += 50;
      }
      if (sheet) sheet.setSize(B.pw - 40, Math.max(150, by - (y - 26) + 12));
      y = by + (paper ? 46 : 26);
      if (y > B.top + B.ph - 120) break;
    }
  }

  // ------------------------------------------------------------------ 직원
  tab_staff() {
    const B = this.box, O = this.office;
    this.text(B.x0 + 36, B.top + 180, t('staffTitle'), 26, '#2b2f3a');
    O.staffRows().forEach((r, i) => {
      const y = B.top + 250 + i * 90;
      this.icon(B.x0 + 64, y, r.hired ? (Assets.has('ui_icon_staff') ? 'ui_icon_staff' : 'ui_icon_worker') : 'ui_icon_lock', 46);
      this.text(B.x0 + 104, y, r.text, 21, r.hired ? '#2b2f3a' : '#8a93a3', 0, { wordWrap: { width: B.pw - 140 } });
    });
  }

  // ------------------------------------------------------------------ 통장
  tab_bank() {
    const B = this.box, O = this.office;
    this.text(B.x0 + 36, B.top + 180, t('bankTitle'), 26, '#2b2f3a');
    const rows = O.log.slice(-8).reverse();
    if (!rows.length) this.text(B.x0 + 40, B.top + 240, t('bankNone'), 21, '#5b6676');
    rows.forEach((r, i) => {
      const [day, , n, minute] = r;
      const time = String(Math.floor((minute || 0) / 60)).padStart(2, '0') + ':' + String((minute || 0) % 60).padStart(2, '0');
      this.text(B.x0 + 40, B.top + 236 + i * 44, t('pbRow', { day: day + 1, time, what: t('pbDeposit'), n: fmt(n) }), 20, '#2b2f3a');
    });
    // today's income by source
    const y0 = B.top + 236 + 8 * 44 + 30;
    this.text(B.x0 + 40, y0, t('incomeToday'), 22, '#2b2f3a');
    const inc = O.income, keys = ['market', 'trade', 'store', 'rest', 'tax', 'station', 'export', 'depot'];
    const F = this.gs.v42.freight;
    const vals = keys.map((k) => (k === 'export' ? (F ? F.stats.coins : 0) : inc[k] || 0));
    const max = Math.max(1, ...vals);
    const g = this.ui.add.graphics();
    this.body.add(g);
    keys.forEach((k, i) => {
      const y = y0 + 44 + i * 38;
      this.text(B.x0 + 40, y, t('inc_' + k), 18, '#5b6676');
      const w = (B.pw - 330) * (vals[i] / max);
      g.fillStyle(0xe8b33d, 1); g.fillRoundedRect(B.x0 + 170, y - 11, Math.max(4, w), 22, 6);
      this.text(B.x0 + 180 + Math.max(4, w), y, fmt(vals[i]), 17, '#2b2f3a');
    });
  }

  // ------------------------------------------------------------------ 물류창고 (its door pad / the 재고 row)
  tab_depot() {
    const B = this.box, v = this.gs.v42, Dp = v.depot;
    this.text(B.x0 + 36, B.top + 180, t('depotTitle'), 28, '#2b2f3a');
    if (!Dp || !Dp.built) { this.text(B.x0 + 40, B.top + 240, t('depotSiteSub'), 21, '#5b6676'); return; }
    const M = Dp.model, g = this.ui.add.graphics();
    this.body.add(g);
    ['materials', 'food', 'goods', 'tools'].forEach((c, i) => {
      const y = B.top + 250 + i * 56, cap = Number(M.stock.cap[c]) || 1, n = M.stock.total(c);
      this.text(B.x0 + 40, y, t('cat_' + c), 21, '#2b2f3a');
      const w = B.pw - 330;
      g.fillStyle(0xe3e8ef, 1); g.fillRoundedRect(B.x0 + 170, y - 12, w, 24, 8);
      g.fillStyle(0x5b8fd9, 1); g.fillRoundedRect(B.x0 + 170, y - 12, Math.max(6, w * Math.min(1, n / cap)), 24, 8);
      this.text(B.x0 + 180 + w, y, n + ' / ' + cap, 18, '#2b2f3a');
    });
    const T = M.today, F = v.freight;
    const y0 = B.top + 250 + 4 * 56 + 30;
    this.text(B.x0 + 40, y0, t('depotTotal', { n: M.total(), cap: M.capTotal() }), 21, '#2b2f3a');
    this.text(B.x0 + 40, y0 + 46, t('depotToday', { n: T.sales, c: fmt(T.coins) }), 21, '#2b2f3a');
    this.text(B.x0 + 40, y0 + 92, t('depotIn', { n: T.inflow }), 21, '#2b2f3a');
    this.text(B.x0 + 40, y0 + 138, t('depotExp', { n: F ? F.stats.exported : 0 }), 21, '#2b2f3a');
    Dp.sleighs.forEach((sl, i) => this.text(B.x0 + 40, y0 + 190 + i * 40, '🛷 ' + t(sl.stateText()) + ' · ' + sl.count(), 20, '#5b6676'));
  }

  update(dt) {
    if (!this.c) return;
    if (this.waitArt > 0) {
      this.waitArt -= dt;
      const here = Assets.has('ui_office_tab');
      if (here || this.waitArt <= 0) { this.waitArt = 0; if (here) this.show(this.tab); this.ui.tweens.add({ targets: this.c, alpha: 1, duration: 140 }); }
      else if ((this.t -= dt) <= 0) { this.t = 0.3; if (Residency.gs) Residency.want(PANELS); }
      return;
    }
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0.5;
      // (CODE-2) the panel page: kept in memory while the panel is open; drawn with it the moment it arrives
      if (Residency.gs) Residency.want(PANELS);
      if (!this.panelArt && Assets.has('ui_office_tab')) { this.show(this.tab); return; }
      this.fill();
    }
  }
}
