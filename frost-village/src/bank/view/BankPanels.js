// The bank's UI (UI scene, logical 720-wide):
//   CounterSheet  — standing on the 창구 pad: savings with the piggy, today's interest, the loan, 저금 / 꺼내기 / 통장
//   PassbookPanel — fx_city ui_passbook: the chief's rows (날짜 · 내용 · 금액 · 잔액, red bank stamps) and the
//                   books of the 5 nearest residents (from the story engine)
//   LoanSheet     — "은행에서 빌릴까요?" on a pad that is short of coins; resolves true / false
//   InsureSheet   — (v8) 화재 보험: the chief's buildings, the premium a day, 가입
// Sheets rebuild only when what they show changes shape; the coin count updates labels in place (critique M-6).

import { TXT, COL, icon, fit, panel, button, roundButton, has, Assets } from '../../missions/view/ui.js';
import { mt, fmtN } from '../../missions/strings.js';

const OP_KEY = { savings: 'b_op_savings', deposit: 'b_op_deposit', withdraw: 'b_op_withdraw', interest: 'b_op_interest', loan: 'b_op_loan', repay: 'b_op_repay', premium: 'b_op_premium', claim: 'b_op_claim' };
const STAMPED = new Set(['deposit', 'interest', 'repay', 'loan']);

export class CounterSheet {
  constructor(host) { this.host = host; this.ui = host.ports.ui.scene; this.c = null; this.key = ''; }
  get W() { return this.ui.W || 720; }
  get H() { return this.ui.H || 1280; }
  isOpen() { return !!this.c; }
  snd(k, o) { this.host.ports.sound.play(k, o); }

  open() {
    if (this.c) return;
    const ui = this.ui, W = this.W, H = this.H;
    this.c = ui.add.container(W / 2, H - 360 - (this.host.ports.ui.safeBottom || 0)).setDepth(66);
    this.key = '';
    this.build();
    this.c.setAlpha(0).setY(this.c.y + 50);
    ui.tweens.add({ targets: this.c, alpha: 1, y: this.c.y - 50, duration: 220, ease: 'Back.easeOut' });
    this.snd('sfx_click', { volume: 0.5 });
  }

  close() {
    const c = this.c;
    if (!c) return;
    this.c = null;
    this.ui.tweens.add({ targets: c, alpha: 0, y: c.y + 40, duration: 150, onComplete: () => c.destroy() });
  }

  /** what changes the sheet's shape (the coins only change the deposit labels: updated in place) */
  structKey() {
    const h = this.host, st = h.account.state();
    const dep = this.depAmount(st);
    return st.savings + ':' + (st.loan ? st.loan.left + ':' + st.loan.paused : '-') + ':' + (dep > 0 ? 1 : 0) + ':' + h.lang() + ':' + (h.insuranceOn() ? h.account.policies.size : '-');
  }
  depAmount(st) { const coins = this.host.ports.coins.value(); return Math.min(coins, st.loan ? st.loan.left : Math.max(0, st.cap - st.savings)); }

  update() {
    if (!this.c) return;
    if (this.structKey() !== this.key) { this.build(); return; }
    // the coins moved: only the two deposit labels change
    const lang = this.host.lang(), dep = this.depAmount(this.host.account.state());
    const t1 = mt(lang, 'b_deposit') + ' ' + fmtN(Math.min(1000, dep));
    if (this.b1 && this.b1.text.text !== t1) { this.b1.text.setText(t1); fit(this.b1.text, this.b1.w - 24); }
  }

  build() {
    const ui = this.ui, h = this.host, lang = h.lang(), st = h.account.state();
    this.key = this.structKey();
    this.builds = (this.builds || 0) + 1;
    this.c.removeAll(true);
    const cw = Math.min(this.W - 40, 664), ch = 300;
    const bg = panel(ui, 0, 0, has('ui_passbook') ? 'ui_passbook' : 'ui_panel', cw, ch).setOrigin(0.5).setInteractive();
    bg.on('pointerup', () => {});
    this.c.add(bg);
    const x0 = -cw / 2, y0 = -ch / 2;
    // title in the passbook's title box
    this.c.add(ui.add.text(x0 + 52, y0 + 26, mt(lang, 'b_name') + ' · ' + mt(lang, 'b_book_of', { name: mt(lang, 'b_chief') }), TXT(19, '#1f3b73')).setOrigin(0, 0.5));
    this.c.add(roundButton(ui, cw / 2 - 16, y0 - 4, 'ui_icon_close', 50, () => this.close(), (k, o) => this.snd(k, o)));
    // savings
    this.c.add(icon(ui, x0 + 96, y0 + 112, ['ui_icon_piggy', 'ui_icon_coin'], 84));
    this.c.add(ui.add.text(x0 + 152, y0 + 88, mt(lang, 'b_savings'), TXT(19, COL.soft, '#ffffff', 0, '800')).setOrigin(0, 0.5));
    this.c.add(ui.add.text(x0 + 152, y0 + 122, fmtN(st.savings), TXT(36, COL.ink)).setOrigin(0, 0.5));
    const it = ui.add.text(x0 + 152, y0 + 156, mt(lang, 'b_interest', { p: Math.round(h.cfg.interestPerDay * 1000) / 10 }) + ' · ' + mt(lang, 'b_cap', { n: fmtN(st.cap) }), TXT(17, COL.green, '#ffffff', 0, '800')).setOrigin(0, 0.5);
    fit(it, cw / 2 - 40);
    this.c.add(it);
    // the loan (right column)
    const lx = 40;
    this.c.add(icon(ui, lx + 30, y0 + 104, ['ui_icon_loan', 'ui_icon_coin'], 58));
    if (st.loan) {
      this.c.add(ui.add.text(lx + 66, y0 + 92, mt(lang, 'b_loan_left', { n: fmtN(st.loan.left) }), TXT(21, '#c4517a')).setOrigin(0, 0.5));
      // (inside the passbook's page frame: the page ends ~30 px before the panel edge)
      const note = ui.add.text(lx + 66, y0 + 126, mt(lang, st.loan.paused ? 'b_loan_paused' : 'b_loan_note'), Object.assign(TXT(17, COL.soft, '#ffffff', 0, '800'), { wordWrap: { width: cw / 2 - lx - 66 - 34, useAdvancedWrap: true } })).setOrigin(0, 0.5);
      fit(note, cw / 2 - lx - 66 - 34, 44);
      this.c.add(note);
    } else this.c.add(ui.add.text(lx + 66, y0 + 104, mt(lang, 'b_loan_none'), TXT(20, COL.soft)).setOrigin(0, 0.5));
    // (v8) fire insurance: a small button under the loan column
    if (h.insuranceOn()) {
      const n = h.account.policies.size;
      const ib = button(ui, lx + 150, y0 + 171, 212, 46, 'blue', mt(lang, 'b_insure') + (n ? ' · ' + n : ''), () => h.openInsurance(), 19, (k, o) => this.snd(k, o));
      ib.add(icon(ui, -84, -2, ['ui_icon_insurance', 'ui_icon_fire_alert'], 30));
      ib.text.setX(14);
      this.c.add(ib);
    }
    // buttons
    const by = ch / 2 - 56, snd = (k, o) => this.snd(k, o);
    const dep = this.depAmount(st);
    // four buttons in one row, laid out left to right inside the page (never overlapping)
    const gap = 10, ws = [176, 168, 132, 112], inner = cw - 56 - 22;
    const k = Math.min(1, (inner - gap * 3) / ws.reduce((a, b) => a + b, 0));
    const bx = []; let xx = x0 + 44;
    for (const w of ws) { bx.push(xx + (w * k) / 2); xx += w * k + gap; }
    // (the amounts are read when pressed: the labels follow the coins in place)
    const b1 = button(ui, bx[0], by, ws[0] * k, 64, 'green', mt(lang, 'b_deposit') + ' ' + fmtN(Math.min(1000, dep)), () => h.deposit(Math.min(1000, this.depAmount(h.account.state()))), 20, snd);
    b1.w = ws[0] * k;
    this.b1 = b1;
    const b2 = button(ui, bx[1], by, ws[1] * k, 64, 'green', mt(lang, 'b_deposit') + ' ' + mt(lang, 'b_all'), () => h.deposit(this.depAmount(h.account.state())), 20, snd);
    const b3 = button(ui, bx[2], by, ws[2] * k, 64, 'blue', mt(lang, 'b_withdraw'), () => h.withdraw(Math.min(st.savings, 1000)), 20, snd);
    const b4 = button(ui, bx[3], by, ws[3] * k, 64, 'gray', mt(lang, 'b_passbook'), () => h.openPassbook(), 20, snd);
    if (dep <= 0) { b1.setAlpha(0.45).disableInteractive(); b2.setAlpha(0.45).disableInteractive(); }
    if (st.savings <= 0) b3.setAlpha(0.45).disableInteractive();
    this.c.add([b1, b2, b3, b4]);
    if (st.loan) this.c.add(ui.add.text(0, by - 46, mt(lang, 'b_loan_first'), TXT(17, '#c4517a', '#ffffff', 0, '800')).setOrigin(0.5));
  }

  destroy() { if (this.c) this.c.destroy(); this.c = null; }
}

export class PassbookPanel {
  constructor(host) { this.host = host; this.ui = host.ports.ui.scene; this.p = null; this.who = 'chief'; }
  get W() { return this.ui.W || 720; }
  get H() { return this.ui.H || 1280; }
  isOpen() { return !!this.p; }
  snd(k, o) { this.host.ports.sound.play(k, o); }

  open(who) {
    this.who = who || 'chief';
    if (this.p) { this.build(); return; }
    const ui = this.ui, W = this.W, H = this.H;
    const c = ui.add.container(0, 0).setDepth(72);
    const dim = ui.add.rectangle(W / 2, H / 2, W * 2, H * 2, 0x1b2638, 0.35).setInteractive();
    dim.on('pointerup', () => this.close());
    c.add(dim);
    this.p = { c, root: null };
    if (this.host.ports.ui.panelOpened) this.host.ports.ui.panelOpened(true);
    this.build();
    c.setAlpha(0);
    ui.tweens.add({ targets: c, alpha: 1, duration: 140 });
    this.snd('sfx_newspaper', { volume: 0.5 });
  }

  close() {
    const p = this.p;
    if (!p) return;
    this.p = null;
    if (this.host.ports.ui.panelOpened) this.host.ports.ui.panelOpened(false);
    this.ui.tweens.add({ targets: p.c, alpha: 0, duration: 120, onComplete: () => p.c.destroy() });
  }

  build() {
    const ui = this.ui, W = this.W, H = this.H, h = this.host, lang = h.lang();
    if (this.p.root) this.p.root.destroy();
    const root = this.p.root = ui.add.container(0, 0);
    this.p.c.add(root);
    const rows = this.who === 'chief' ? h.account.rows.slice() : h.residentRows(this.who);
    const pw = Math.min(W - 30, 672), ph = Math.min(H - 220, 74 + 40 + Math.max(5, rows.length) * 46 + 96 + 236);
    const top = Math.max(110, (H - ph) / 2);
    const sp = Assets.def('ui_passbook');
    const ins = sp.contentInset || [42, 74, 22, 26], hy = sp.headerY || 66;
    const bg = panel(ui, W / 2, top + ph / 2, has('ui_passbook') ? 'ui_passbook' : 'ui_panel', pw, ph).setOrigin(0.5).setInteractive();
    bg.on('pointerup', () => {});
    root.add(bg);
    const x0 = W / 2 - pw / 2;
    const name = this.who === 'chief' ? mt(lang, 'b_chief') : h.ports.people.name(this.who, lang);
    const tt = ui.add.text(x0 + ins[0] + 8, top + 26, mt(lang, 'b_name') + ' · ' + mt(lang, 'b_book_of', { name }), TXT(20, '#1f3b73')).setOrigin(0, 0.5);
    fit(tt, pw - ins[0] - 90);
    root.add(tt);
    root.add(roundButton(ui, x0 + pw - 20, top - 6, 'ui_icon_close', 56, () => this.close(), (k, o) => this.snd(k, o)));
    // columns
    const cx = [x0 + ins[0] + 12, x0 + ins[0] + 112, x0 + pw - ins[2] - 250, x0 + pw - ins[2] - 26];
    const head = [mt(lang, 'b_col_date'), mt(lang, 'b_col_item'), mt(lang, 'b_col_amt'), mt(lang, 'b_col_bal')];
    head.forEach((t, k) => root.add(ui.add.text(cx[k], top + hy - 14, t, TXT(17, '#2a64a8')).setOrigin(k >= 2 ? 1 : 0, 0.5)));
    let y = top + ins[1] + 26;
    const rowH = 46;
    const maxRows = Math.max(3, Math.floor((ph - ins[1] - 230) / rowH));
    const show = rows.slice(-maxRows);
    if (!show.length) root.add(ui.add.text(W / 2, y + 30, '—', TXT(22, COL.soft)).setOrigin(0.5));
    let prevBal = null;
    const first = rows.length - show.length;
    if (first > 0) prevBal = rows[first - 1][3];
    for (const r of show) {
      const [day, op, rawAmt, bal] = r;
      // the amount as it moves the balance (a loan takes it down, a repayment brings it up); cash ops (premium,
      // claim) that leave the balance alone are grey (critique L-4)
      let amt = rawAmt;
      if (op === 'loan' && amt > 0) amt = -amt;                 // (a resident's book from the story: positive loans)
      const moved = prevBal === null ? (op !== 'premium' && op !== 'claim') : bal !== prevBal;
      prevBal = bal;
      root.add(panel(ui, W / 2 + (ins[0] - ins[2]) / 2, y, has('ui_passbook_row') ? 'ui_passbook_row' : 'ui_panel', pw - ins[0] - ins[2] - 4, 40).setOrigin(0.5).setAlpha(0.95));
      root.add(ui.add.text(cx[0], y, mt(lang, 'b_day', { n: day }), TXT(17, COL.ink, '#ffffff', 0, '800')).setOrigin(0, 0.5));
      root.add(ui.add.text(cx[1], y, mt(lang, OP_KEY[op] || 'b_op_deposit'), TXT(17, COL.ink, '#ffffff', 0, '800')).setOrigin(0, 0.5));
      const pos = amt >= 0;
      root.add(ui.add.text(cx[2], y, (pos ? '+' : '−') + fmtN(Math.abs(amt)), TXT(18, !moved ? COL.soft : pos ? '#2f8f4e' : '#d0453a')).setOrigin(1, 0.5));
      root.add(ui.add.text(cx[3], y, fmtN(bal), TXT(18, COL.ink)).setOrigin(1, 0.5));
      if (STAMPED.has(op) && has('ui_stamp_bank')) { const s = Assets.image(ui, cx[3] + 14, y - 2, 'ui_stamp_bank'); s.setScale(34 / Math.max(1, s.frame.realWidth)).setAlpha(0.85).setAngle(-12 + (day * 7) % 20); root.add(s); }
      y += rowH;
    }
    // what the book says now, in one pill (저금 n / 대출 n / 빚 없음)
    let sum;
    if (this.who === 'chief') { const st = h.account.state(); sum = st.loan ? mt(lang, 'b_res_loan', { n: fmtN(st.loan.left) }) : st.savings > 0 ? mt(lang, 'b_res_savings', { n: fmtN(st.savings) }) : mt(lang, 'b_res_none'); }
    else { const last = rows[rows.length - 1]; const b = last ? last[3] : 0; sum = b < 0 ? mt(lang, 'b_res_loan', { n: fmtN(-b) }) : b > 0 ? mt(lang, 'b_res_savings', { n: fmtN(b) }) : mt(lang, 'b_res_none'); }
    const sy = Math.max(y + 18, top + ins[1] + 26 + 5 * rowH);
    const stx = ui.add.text(0, 0, sum, TXT(20, '#1f3b73'));
    const sbg = panel(ui, x0 + pw - ins[2] - 20 - (stx.width + 56) / 2, sy, 'ui_panel', stx.width + 56, 46).setOrigin(0.5);
    stx.setPosition(sbg.x, sy).setOrigin(0.5);
    root.add([sbg, stx]);
    // the neighbours' books
    const ny = top + ph - 150;
    root.add(ui.add.text(x0 + ins[0] + 10, ny - 34, mt(lang, 'b_neighbours'), TXT(18, '#2a64a8')).setOrigin(0, 0.5));
    const list = ['chief'].concat(h.nearbyResidents(5));
    const bw = (pw - ins[0] - ins[2] - 10) / list.length;
    list.forEach((pid, k) => {
      const x = x0 + ins[0] + 5 + bw * k + bw / 2;
      const on = pid === this.who;
      const c = ui.add.container(x, ny + 40);
      const b = panel(ui, 0, 0, on ? 'ui_button_blue' : 'ui_panel', bw - 8, 112).setOrigin(0.5);
      c.add(b);
      const pk = pid === 'chief' ? 'portrait_player' : (h.ports.people.portrait ? h.ports.people.portrait(pid) : null);
      c.add(icon(ui, 0, -18, [pk, 'ui_icon_passbook'], 58));
      const nm = ui.add.text(0, 32, pid === 'chief' ? mt(lang, 'b_chief') : h.ports.people.name(pid, lang), on ? TXT(17, '#ffffff', 'rgba(0,0,0,0.25)', 3) : TXT(17, COL.ink)).setOrigin(0.5);
      fit(nm, bw - 16);
      c.add(nm);
      c.setSize(bw - 8, 112);
      c.setInteractive({ useHandCursor: true });
      c.on('pointerdown', (p, lx, ly, ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); if (this.who !== pid) { this.who = pid; this.snd('sfx_click', { volume: 0.5 }); this.build(); } });
      root.add(c);
    });
  }

  destroy() { if (this.p) this.p.c.destroy(); this.p = null; }
}

export class LoanSheet {
  constructor(host) { this.host = host; this.ui = host.ports.ui.scene; this.c = null; this.res = null; }
  get W() { return this.ui.W || 720; }
  get H() { return this.ui.H || 1280; }
  isOpen() { return !!this.c; }

  /** show a quote; resolves true when the chief borrows */
  ask(q) {
    if (this.c) this.done(false);
    return new Promise((resolve) => {
      this.res = resolve;
      // v4 blocks world input under it like under its own panels
      if (this.host.ports.ui.panelOpened) this.host.ports.ui.panelOpened(true);
      const ui = this.ui, W = this.W, H = this.H, h = this.host, lang = h.lang();
      const c = this.c = ui.add.container(W / 2, H * 0.5).setDepth(75);
      const dim = ui.add.rectangle(0, 0, W * 2, H * 2, 0x1b2638, 0.3).setInteractive();
      dim.on('pointerup', () => this.done(false));
      c.add(dim);
      const cw = Math.min(W - 40, 620), ch = 430;
      const bg = panel(ui, 0, 0, 'ui_panel', cw, ch).setOrigin(0.5).setInteractive();
      bg.on('pointerup', () => {});
      c.add(bg);
      c.add(icon(ui, 0, -ch / 2 + 82, ['ui_icon_loan', 'ui_icon_coin'], 112));
      c.add(ui.add.text(0, -ch / 2 + 166, mt(lang, 'b_offer_title'), TXT(30, COL.ink)).setOrigin(0.5));
      let y = -ch / 2 + 216;
      if (q.withdraw > 0) { c.add(ui.add.text(0, y, mt(lang, 'b_offer_sav', { n: fmtN(q.withdraw) }), TXT(21, '#2a64a8')).setOrigin(0.5)); y += 36; }
      if (q.amount > 0) {
        c.add(ui.add.text(0, y, mt(lang, 'b_offer_line', { n: fmtN(q.amount), p: Math.round(h.cfg.loanFee * 100) }), TXT(24, '#c4517a')).setOrigin(0.5)); y += 36;
        const f = ui.add.text(0, y, mt(lang, 'b_offer_fee', { n: fmtN(q.fee), t: fmtN(q.total) }) + ' · ' + mt(lang, 'b_loan_note'), TXT(17, COL.soft, '#ffffff', 0, '800')).setOrigin(0.5);
        fit(f, cw - 50);
        c.add(f); y += 30;
      }
      if (!q.covered) { const p = ui.add.text(0, y, mt(lang, 'b_offer_part', { s: fmtN(q.short), n: fmtN(q.withdraw + q.amount) }), TXT(17, '#d0453a', '#ffffff', 0, '800')).setOrigin(0.5); fit(p, cw - 50); c.add(p); }
      const snd = (k, o) => h.ports.sound.play(k, o);
      c.add(button(ui, -cw / 4 + 10, ch / 2 - 58, 220, 70, 'gray', mt(lang, 'b_no'), () => this.done(false), 25, snd));
      c.add(button(ui, cw / 4 - 10, ch / 2 - 58, 230, 70, 'green', q.amount > 0 ? mt(lang, 'b_borrow') : mt(lang, 'b_use_savings'), () => this.done(true), 26, snd));
      c.setScale(0.6).setAlpha(0);
      ui.tweens.add({ targets: c, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
      h.ports.sound.play('sfx_ticket_chime', { volume: 0.5 });
    });
  }

  done(v) {
    const c = this.c, r = this.res;
    this.c = null; this.res = null;
    if (c) {
      if (this.host.ports.ui.panelOpened) this.host.ports.ui.panelOpened(false);
      this.ui.tweens.add({ targets: c, alpha: 0, scale: 0.9, duration: 120, onComplete: () => c.destroy() });
    }
    if (r) r(!!v);
  }

  destroy() { if (this.c) { this.c.destroy(); if (this.host.ports.ui.panelOpened) this.host.ports.ui.panelOpened(false); } this.c = null; if (this.res) this.res(false); this.res = null; }
}

/** (v8) 화재 보험: the chief's buildings with their daily premium; 가입 insures one (the bank keeps ≤ 24) */
export class InsureSheet {
  constructor(host) { this.host = host; this.ui = host.ports.ui.scene; this.p = null; this.key = ''; }
  get W() { return this.ui.W || 720; }
  get H() { return this.ui.H || 1280; }
  isOpen() { return !!this.p; }
  snd(k, o) { this.host.ports.sound.play(k, o); }

  open() {
    if (this.p) return;
    const ui = this.ui, W = this.W, H = this.H;
    const c = ui.add.container(0, 0).setDepth(72);
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

  close() {
    const p = this.p;
    if (!p) return;
    this.p = null;
    if (this.host.ports.ui.panelOpened) this.host.ports.ui.panelOpened(false);
    this.ui.tweens.add({ targets: p.c, alpha: 0, duration: 120, onComplete: () => p.c.destroy() });
  }

  keyOf() { return this.host.lang() + JSON.stringify(this.host.insurable().map((b) => [b.id, b.insured, b.lapsed])); }
  update() { if (this.p && this.keyOf() !== this.key) this.build(); }

  build() {
    const ui = this.ui, W = this.W, H = this.H, h = this.host, lang = h.lang();
    this.key = this.keyOf();
    if (this.p.root) this.p.root.destroy();
    const root = this.p.root = ui.add.container(0, 0);
    this.p.c.add(root);
    const list = h.insurable();
    // a row is a mission card (9-slice, needs >= 80 px; text inside its content inset: pin and tab on the left)
    const rowH = 96, pw = Math.min(W - 30, 660), ph = Math.min(H - 220, 190 + Math.max(2, Math.min(8, list.length)) * rowH);
    const top = Math.max(110, (H - ph) / 2), x0 = W / 2 - pw / 2;
    const bg = panel(ui, W / 2, top + ph / 2, 'ui_panel', pw, ph).setOrigin(0.5).setInteractive();
    bg.on('pointerup', () => {});
    root.add(bg);
    root.add(icon(ui, x0 + 60, top + 56, ['ui_icon_insurance', 'ui_icon_fire_alert'], 64));
    const tt = ui.add.text(x0 + 104, top + 46, mt(lang, 'b_insure_title'), TXT(28, COL.ink)).setOrigin(0, 0.5);
    root.add(tt);
    const sub = ui.add.text(x0 + 104, top + 80, mt(lang, 'b_insure_line', { n: '…' }).replace(/^[^·]*·\s*/, ''), TXT(17, COL.soft, '#ffffff', 0, '800')).setOrigin(0, 0.5);
    fit(sub, pw - 140);
    root.add(sub);
    root.add(roundButton(ui, x0 + pw - 20, top - 6, 'ui_icon_close', 56, () => this.close(), (k, o) => this.snd(k, o)));
    let y = top + 122;
    if (!list.length) root.add(ui.add.text(W / 2, y + 30, mt(lang, 'b_insure_none'), TXT(20, COL.soft)).setOrigin(0.5));
    const cw = pw - 44, cl = W / 2 - cw / 2, cr = W / 2 + cw / 2;     // the card's left / right edge
    for (const b of list.slice(0, Math.floor((ph - 150) / rowH))) {
      const cy = y + rowH / 2 - 4;
      const row = panel(ui, W / 2, cy, has('ui_mission_card') ? (b.insured ? 'ui_mission_card_done' : 'ui_mission_card') : 'ui_panel', cw, rowH - 10).setOrigin(0.5);
      root.add(row);
      const name = b.name ? (b.name[lang] || b.name.ko) : String(b.id);
      const nt = ui.add.text(cl + 46, cy - 14, name, TXT(21, COL.ink)).setOrigin(0, 0.5);
      fit(nt, cw - 250);
      root.add(nt);
      const ln = ui.add.text(cl + 46, cy + 16, mt(lang, 'b_insure_line', { n: fmtN(b.premium) }), TXT(17, b.lapsed ? '#d0453a' : COL.soft, '#ffffff', 0, '800')).setOrigin(0, 0.5);
      fit(ln, cw - (b.insured ? 230 : 210));
      root.add(ln);
      if (b.insured) {
        // the done card has its own seal at the top right: the stamp and the words sit below it, inside the inset
        const it = ui.add.text(cr - 30, cy + 8, mt(lang, 'b_insured'), TXT(18, COL.green)).setOrigin(1, 0.5);
        fit(it, 120);
        root.add(icon(ui, cr - 30 - it.displayWidth - 26, cy + 6, ['ui_stamp_bank', 'ui_icon_check'], 42));
        root.add(it);
      } else if (!b.has) root.add(button(ui, cr - 92, cy - 2, 128, 54, 'green', mt(lang, 'b_insure_join'), () => { h.insure(b.id, b.cost); this.build(); }, 21, (k, o) => this.snd(k, o)));
      else root.add(ui.add.text(cr - 30, cy, mt(lang, 'b_insure_lapsed'), TXT(17, '#d0453a', '#ffffff', 0, '800')).setOrigin(1, 0.5));
      y += rowH;
    }
  }

  destroy() { if (this.p) this.p.c.destroy(); this.p = null; }
}
