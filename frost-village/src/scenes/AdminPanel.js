// (v4.2.0.2) 관리자 모드 · admin mode — the PIN keypad and the admin panel, drawn in the UI scene with the game's own
// panels and buttons (ui_panel 9-slice, UI.makeButton / makeIconButton). The logic (PIN, lock, actions, backup) is
// src/systems/Admin.js. How it opens: 설정 → the version text tapped 7 times within 4 s → this keypad (digits, 지우기, 확인)
// → the right PIN → the game saves; the first opening on a village keeps it as the 관리자 사본 (Admin.adminBackup: later
// openings keep that copy, and the subtitle says which village it holds) → the panel. Once unlocked, 7 taps open the panel
// directly until the app restarts (or a new game starts). The game is paused while the keypad or the panel is up.
// Tests: window.__FV.adminState() (read only — nothing here opens the panel without the taps) — tools/test/admin.mjs.

import { Audio } from '../core/Audio.js';
import { Input } from '../core/Input.js';
import { View } from '../core/View.js';
import { panel } from '../core/Panel.js';
import { FONT, t, fmt, getLang } from '../data/strings.js';
import {
  AdminSession, versionTap, tryPin, lockLeft, adminBackup, countUse, giveCoins, setUnlimited, finishSites, buyPads,
  maxBag, setSpeed, hasClock, toggleDayNight, canReplay, replayTutorial, offeredPads, SPEEDS, ADMIN_PIN_MAX,
} from '../systems/Admin.js';
import { BALANCE } from '../data/balance.js';

const TXT = (size, color = '#ffffff', stroke = '#2b2f3a', st = 7, weight = '900') => ({
  fontFamily: FONT, fontSize: size + 'px', fontStyle: weight, color, stroke, strokeThickness: st, resolution: 2,
});
const KP_W = 520, KP_H = 840;          // keypad
const p2 = (n) => (n < 10 ? '0' : '') + n;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 「11월 1일 14:18」 / "Nov 1, 14:18" (the time of the village the 관리자 사본 holds) */
function shortWhen(ms) {
  const d = new Date(ms), hm = p2(d.getHours()) + ':' + p2(d.getMinutes());
  return getLang() === 'en' ? MON[d.getMonth()] + ' ' + d.getDate() + ', ' + hm : (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + hm;
}
const PW = 600;                        // panel width (its height follows the rows)

export class AdminPanel {
  constructor(ui) {
    this.ui = ui;
    this.kp = null;            // the keypad { c, bg, dots, ask, err, lock, btns }
    this.pn = null;            // the panel { c, bg, items, btns }
    this.digits = '';
    this.busy = false;
    this.status = '';
    this.statusErr = false;
    this.sub = '';
    this.shakes = 0;
    this.lastBackup = null;
    ui.adminOpen = false;
    // the little HUD note while 시간 빠르게 / 코인 무제한 is on (so a coin counter that does not drop is never a mystery)
    this.chip = ui.add.container(0, 0).setDepth(32).setVisible(false);
    this.chipBg = ui.add.graphics();
    this.chipText = ui.add.text(0, 0, '', TXT(22, '#ffffff', '#1f3354', 0, '900')).setOrigin(0, 0.5);
    this.chip.add([this.chipBg, this.chipText]);
    this.chipKey = '';
    const H = window.__FV || (window.__FV = {});
    this.stateFn = () => this.state();
    H.adminState = this.stateFn;
    ui.events.once('shutdown', () => this.destroy());
  }

  get gs() { return this.ui.gs; }

  // ------------------------------------------------------------------ the 7 taps
  /** a tap on the settings panel's version text */
  onVersionTap() {
    if (this.kp || this.pn || this.busy) return;
    if (!versionTap(Date.now())) return;
    if (AdminSession.unlocked) this.enter();
    else this.openKeypad();
  }

  // ------------------------------------------------------------------ keypad
  openKeypad() {
    if (this.kp) return;
    this.digits = '';
    this.buildKeypad();
    Input.release();
    this.ui.pauseGame();
    if (this.kp) {
      const c = this.kp.c;
      c.setAlpha(0);
      this.ui.tweens.add({ targets: c, alpha: 1, duration: 140 });
    }
  }

  buildKeypad() {
    const ui = this.ui, W = ui.W, H = ui.H, cx = W / 2, cy = H / 2;
    const c = ui.add.container(0, 0).setDepth(90);
    const dim = ui.add.rectangle(W / 2, H / 2, W * 2, H * 2, 0x1b2638, 0.45).setInteractive();
    dim.on('pointerdown', () => {});
    const bg = panel(ui, cx, cy, 'ui_panel', KP_W, KP_H).setOrigin(0.5);
    c.add([dim, bg]);
    const top = cy - KP_H / 2;
    const add = (o) => { c.add(o); return o; };
    add(ui.add.text(cx, top + 66, t('adm_title'), TXT(40, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0.5));
    const ask = add(ui.add.text(cx, top + 122, t('adm_pinAsk'), TXT(26, '#4a5568', '#ffffff', 0, '800')).setOrigin(0.5));
    // the typed digits: one dot each (never the digits themselves)
    const box = add(ui.add.graphics());
    box.fillStyle(0xeef3f9, 1); box.fillRoundedRect(cx - 190, top + 166, 380, 72, 20);
    box.lineStyle(3, 0xc9d6e6, 1); box.strokeRoundedRect(cx - 190, top + 166, 380, 72, 20);
    const dots = add(ui.add.text(cx, top + 203, '', TXT(34, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0.5));
    const err = add(ui.add.text(cx, top + 270, '', TXT(25, '#c0392b', '#ffffff', 0, '900')).setOrigin(0.5));
    const lock = add(ui.add.text(cx, top + 304, '', TXT(22, '#5b6676', '#ffffff', 0, '800')).setOrigin(0.5));
    const btns = {};
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'ok'];
    keys.forEach((k, i) => {
      const x = cx + ((i % 3) - 1) * 146, y = top + 386 + Math.floor(i / 3) * 112;
      const lab = k === 'clear' ? t('adm_clear') : k === 'ok' ? t('adm_ok') : k;
      const style = k === 'clear' ? 'gray' : k === 'ok' ? 'green' : 'blue';
      const b = add(ui.makeButton(x, y, 130, 96, style, lab, () => this.key(k), k.length === 1 ? 42 : 28));
      if (b.text.width > 112) b.text.setScale(112 / b.text.width);
      b.adminKey = k;
      btns[k] = b;
    });
    // ((v4.2.0.2 fix R5) not while 「확인하고 있어요…」: the right PIN was taken, the panel opens when the backup is made —
    //  an X then closed the keypad and the panel opened anyway)
    const close = add(ui.makeIconButton(cx + KP_W / 2 - 40, top + 40, 'ui_icon_close', 62, () => { if (!this.busy) this.closeKeypad(); }));
    btns.close = close;
    this.kp = { c, bg, dim, ask, dots, err, lock, btns };
    this.refreshKeypad();
  }

  refreshKeypad() {
    const k = this.kp;
    if (!k) return;
    const n = this.digits.length;
    k.dots.setText(n ? '●'.repeat(n).split('').join(' ') : '');
    if (k.dots.width > 350) k.dots.setScale(350 / k.dots.width); else k.dots.setScale(1);
    const left = lockLeft(Date.now());
    const locked = left > 0;
    k.lockSec = locked ? Math.ceil(left / 1000) : 0;
    k.lock.setText(locked ? t('adm_pinLocked', { s: k.lockSec }) : '');
    // (the X stays live through the lock; while busy it is dimmed with the keys: it does nothing then)
    for (const id in k.btns) k.btns[id].setAlpha((locked && id !== 'close') || this.busy ? 0.5 : 1);
    k.lockedShown = locked;
  }

  key(k) {
    if (!this.kp || this.busy) return;
    if (lockLeft(Date.now()) > 0) { this.shake(); return; }
    if (k === 'clear') { this.digits = this.digits.slice(0, -1); this.kp.err.setText(''); this.refreshKeypad(); return; }
    if (k === 'ok') { this.check(); return; }
    if (this.digits.length >= ADMIN_PIN_MAX) { this.shake(); return; }
    this.digits += k;
    this.kp.err.setText('');
    this.refreshKeypad();
  }

  check() {
    const kp = this.kp;
    if (!kp) return;
    if (!this.digits.length) { this.shake(); return; }
    const r = tryPin(this.digits, Date.now());
    this.digits = '';
    if (r === 'ok') { this.refreshKeypad(); this.enter(); return; }
    kp.err.setText(t('adm_pinWrong'));
    this.shake();
    Audio.play('sfx_error', { volume: 0.5 });
    this.refreshKeypad();
  }

  shake() {
    const kp = this.kp;
    if (!kp) return;
    this.shakes++;
    const ui = this.ui;
    ui.tweens.killTweensOf(kp.c);
    kp.c.x = 0;
    ui.tweens.add({ targets: kp.c, x: { from: -18, to: 18 }, duration: 45, yoyo: true, repeat: 3, onComplete: () => { if (kp.c.active) kp.c.x = 0; } });
    try { if (this.gs && this.gs.effects && this.gs.effects.vibrate) this.gs.effects.vibrate(60); } catch (e) { /* */ }
  }

  closeKeypad(immediate) {
    const kp = this.kp;
    if (!kp) return;
    this.kp = null;
    this.digits = '';
    const ui = this.ui;
    ui.tweens.killTweensOf(kp.c);
    // back to the settings panel (still open underneath): the game stays paused for it
    if (!ui.panelOpen && !this.pn && !ui.buildOpen) ui.resumeGame();
    if (immediate) kp.c.destroy();
    else ui.tweens.add({ targets: kp.c, alpha: 0, duration: 120, onComplete: () => kp.c.destroy() });
  }

  // ------------------------------------------------------------------ into the panel: backup first
  /** the PIN is right (or this page is already unlocked): save + the 관리자 사본 (made or kept), count the use, open the panel */
  async enter() {
    if (this.busy || this.pn) return;
    const ui = this.ui, gs = this.gs;
    this.busy = true;
    if (this.kp) { this.kp.ask.setText(t('adm_pinCheck')); this.refreshKeypad(); }
    let res = null;
    try { res = await adminBackup(gs); } catch (e) { res = null; }
    this.busy = false;
    if (!ui.ready || !ui.sys || !ui.sys.isActive() || !gs || !gs.player) return;
    this.lastBackup = res;
    const uses = countUse(gs);
    Audio.play('sfx_unlock', { volume: 0.6 });
    this.closeKeypad(true);
    if (ui.panelOpen) ui.closeSettings(true, true);
    // (kept as data: the line is written in the language of the moment it is drawn)
    this.subErr = !(res && (res.copy || res.kept || res.save));
    this.subKept = !!(res && res.kept);
    this.subWhen = (res && res.when) || 0;
    this.subUses = uses;
    this.status = '';
    this.statusErr = false;
    this.openPanel(false);
  }

  // ------------------------------------------------------------------ the panel
  openPanel(instant) {
    if (this.pn) return;
    const ui = this.ui;
    ui.adminOpen = true;
    Input.release();
    ui.pauseGame();
    const c = ui.add.container(0, 0).setDepth(85);
    const dim = ui.add.rectangle(ui.W / 2, ui.H / 2, ui.W * 2, ui.H * 2, 0x1b2638, 0.5).setInteractive();
    dim.on('pointerdown', () => {});
    const bg = panel(ui, ui.W / 2, ui.H / 2, 'ui_panel', PW, 900).setOrigin(0.5);
    c.add([dim, bg]);
    this.pn = { c, dim, bg, items: [], btns: {} };
    this.buildContent();
    if (!instant) {
      c.setAlpha(0);
      ui.tweens.add({ targets: c, alpha: 1, duration: 160 });
      bg.setScale(0.85);
      ui.tweens.add({ targets: bg, scale: 1, duration: 240, ease: 'Back.easeOut' });
    }
  }

  /** (re)draws the rows: after every button the toggles show the new state */
  buildContent() {
    const P = this.pn, ui = this.ui, gs = this.gs;
    if (!P) return;
    for (const o of P.items) o.destroy();
    P.items = []; P.btns = {};
    const add = (o) => { P.c.add(o); P.items.push(o); return o; };
    const clock = hasClock(gs);
    const W = ui.W, H = ui.H, cx = W / 2;
    // heights: title 0..140, rows, status, close
    const rowsH = 92 * 7 + 22 + (clock ? 92 : 0);
    const PH = 178 + rowsH - 92 + 76 + 74 + 40 + 36;
    const top = Math.round(H / 2 - PH / 2);
    P.bg.setSize(PW, PH).setPosition(cx, H / 2);
    P.top = top; P.h = PH;
    add(ui.add.text(cx, top + 58, t('adm_title'), TXT(42, '#2b2f3a', '#ffffff', 0, '900')).setOrigin(0.5));
    // the 관리자 사본: made now, or the earlier one kept (with the time of the village it holds — what 되돌리기 brings back)
    const head = this.subErr ? t('adm_backupFail') : this.subKept && this.subWhen ? t('adm_copyKept', { d: shortWhen(this.subWhen) }) : t('adm_copyNew');
    this.sub = head + ' · ' + t('adm_uses', { n: this.subUses || gs.adminUses || 1 });
    const sub = add(ui.add.text(cx, top + 108, this.sub, TXT(21, this.subErr ? '#c0392b' : '#4f7a52', '#ffffff', 0, '800')).setOrigin(0.5));
    if (sub.width > PW - 60) sub.setScale((PW - 60) / sub.width);
    P.btns.close = add(ui.makeIconButton(cx + PW / 2 - 40, top + 46, 'ui_icon_close', 64, () => this.closePanel()));
    const label = (y, txt) => {
      const lt = add(ui.add.text(cx - 272, y, txt, TXT(27, '#2b2f3a', '#ffffff', 0, '800')).setOrigin(0, 0.5));
      const maxW = 172;
      if (lt.width > maxW) { lt.setFontSize(23); lt.setWordWrapWidth(maxW, true); lt.setLineSpacing(-4); if (lt.height > 70 || lt.width > maxW) lt.setScale(Math.min(maxW / lt.width, 70 / lt.height)); }
      return lt;
    };
    const btn = (id, x, y, w, style, txt, cb, size = 25) => {
      const b = add(ui.makeButton(x, y, w, 76, style, txt, () => this.act(id, cb), size));
      const room = w - 18;
      if (b.text.width > room) b.text.setScale(room / b.text.width);
      b.adminId = id;
      P.btns[id] = b;
      return b;
    };
    const area3 = (i) => cx - 90 + 58 + i * 127;          // three 116-wide buttons in cx-90 .. cx+280
    let y = top + 178;
    // ---- 코인 넣기 +1,000 / +10,000 / +100,000
    label(y, t('adm_coins'));
    [1000, 10000, 100000].forEach((n, i) => btn('coins' + n, area3(i), y, 116, 'green', '+' + fmt(n), () => { giveCoins(gs, n); return t('adm_gave', { n: fmt(n) }); }, 24));
    y += 92;
    // ---- 코인 무제한 켜짐 / 꺼짐 (+ what it does)
    const inf = !!gs.economy.unlimited;
    label(y, t('adm_inf'));
    btn('inf', cx + 180, y, 200, inf ? 'green' : 'gray', inf ? t('adm_infOn') : t('off'), () => { const on = setUnlimited(gs, !gs.economy.unlimited); return on ? t('adm_infSet') : t('adm_infUnset'); }, 26);
    const note = add(ui.add.text(cx - 272, y + 44, t('adm_infNote'), TXT(19, inf ? '#2f8f4e' : '#6b7686', '#ffffff', 0, '800')).setOrigin(0, 0.5));
    if (note.width > 540) note.setScale(540 / note.width);
    y += 92 + 22;
    // ---- 짓는 건물 바로 완성
    const sites = Object.keys(gs.sites || {}).filter((k) => gs.sites[k].state === 'foundation' || gs.sites[k].state === 'scaffold').length;
    btn('finish', cx, y, 544, 'blue', t('adm_finish') + (sites ? '  (' + sites + ')' : ''), () => { const n = finishSites(gs); return n ? t('adm_finished', { n }) : '!' + t('adm_noSites'); }, 26);
    y += 92;
    // ---- 발판 바로 사기: 가까운 발판 하나 / 보이는 발판 모두
    label(y, t('adm_pads'));
    const bought = (r) => (!r.n ? '!' + t('adm_noPads') : r.n === 1 && r.name ? t('adm_boughtOne', { name: r.name }) : t('adm_bought', { n: r.n }));
    btn('padNear', cx, y, 180, 'blue', t('adm_padNear'), () => bought(buyPads(gs, 'near')), 23);
    btn('padAll', cx + 190, y, 180, 'blue', t('adm_padAll'), () => bought(buyPads(gs, 'all')), 23);
    y += 92;
    // ---- 가방 최대
    const U = BALANCE.upgrades.capacity, bagMax = gs.progress.up.capacity >= U.values.length - 1;
    const bb = btn('bag', cx, y, 544, bagMax ? 'gray' : 'blue', bagMax ? t('adm_bagMax') : t('adm_bagNow', { n: gs.progress.capacity() }), () => { const n = maxBag(gs); return n ? t('adm_bagDone', { n }) : '!' + t('adm_bagMax'); }, 26);
    if (bagMax) bb.setAlpha(0.7);
    y += 92;
    // ---- 시간 빠르게 ×1 / ×2 / ×4
    label(y, t('adm_speed'));
    const sp = gs.simSpeed > 1 ? gs.simSpeed : 1;
    SPEEDS.forEach((n, i) => btn('speed' + n, area3(i), y, 116, sp === n ? 'green' : 'gray', '×' + n, () => { const k = setSpeed(gs, n); return k > 1 ? t('adm_speedSet', { n: k }) : t('adm_speedOne'); }, 28));
    y += 92;
    // ---- 낮/밤 바꾸기 (only with the day clock)
    if (clock) {
      btn('daynight', cx, y, 544, 'blue', t('adm_daynight'), () => { const r = toggleDayNight(gs); return r === 'night' ? t('adm_night') : r === 'day' ? t('adm_day') : '!' + t('adm_noTutorial'); }, 26);
      y += 92;
    }
    // ---- 튜토리얼 다시 보기 (closes the panel and plays the replay, like 설정 › 놀이)
    const rep = canReplay(gs);
    const rb = btn('tutorial', cx, y, 544, rep ? 'blue' : 'gray', t('adm_tutorial'), () => {
      if (!canReplay(gs)) return '!' + t('adm_noTutorial');
      this.closePanel(true);
      if (replayTutorial(gs)) Input.release();
      return null;
    }, 26);
    if (!rep) rb.setAlpha(0.7);
    y += 76;
    // ---- what the last button did
    P.statusText = add(ui.add.text(cx, y, this.status || '', TXT(24, this.statusErr ? '#c0392b' : '#2f6fb3', '#ffffff', 0, '900')).setOrigin(0.5));
    if (P.statusText.width > PW - 50) P.statusText.setScale((PW - 50) / P.statusText.width);
    y += 74;
    // ---- 관리자 모드 닫기
    const cb = add(ui.makeButton(cx, y, 420, 80, 'gray', t('adm_close'), () => this.closePanel(), 28));
    if (cb.text.width > 390) cb.text.setScale(390 / cb.text.width);
    cb.adminId = 'closeBtn';
    P.btns.closeBtn = cb;
  }

  /** a panel button: run it, show what happened, redraw the toggles */
  act(id, fn) {
    if (!this.pn) return;
    let msg = null;
    try { msg = fn(); } catch (e) { console.error('[FrostVillage] admin', id, e); msg = '!' + String(e && e.message || e).slice(0, 60); }
    if (!this.pn) return;          // (튜토리얼 다시 보기 closed it)
    this.lastAct = id;
    if (typeof msg === 'string') { this.statusErr = msg[0] === '!'; this.status = this.statusErr ? msg.slice(1) : msg; }
    this.buildContent();
  }

  closePanel(immediate) {
    const P = this.pn;
    if (!P) return;
    this.pn = null;
    const ui = this.ui;
    ui.adminOpen = false;
    if (!ui.panelOpen && !ui.buildOpen && !this.kp) ui.resumeGame();
    ui.tweens.killTweensOf(P.c); ui.tweens.killTweensOf(P.bg);
    if (immediate) { P.c.destroy(); return; }
    ui.tweens.add({ targets: P.c, alpha: 0, duration: 140, onComplete: () => P.c.destroy() });
  }

  // ------------------------------------------------------------------ resize / frame
  /** after a resize / rotation: the keypad (typed digits kept) and the panel are redrawn around the new centre */
  layout() {
    if (this.kp) { const d = this.digits, e = this.kp.err.text; this.kp.c.destroy(); this.kp = null; this.buildKeypad(); this.digits = d; this.kp.err.setText(e); this.refreshKeypad(); }
    if (this.pn) { const P = this.pn; P.c.destroy(); this.pn = null; this.ui.adminOpen = false; this.openPanel(true); }
    this.chipKey = '';
  }

  update() {
    if (this.kp) {
      // the lock's countdown (redrawn once a second, and once when it ends)
      const left = lockLeft(Date.now()), sec = left > 0 ? Math.ceil(left / 1000) : 0;
      if (sec !== (this.kp.lockSec || 0) || (!sec && this.kp.lockedShown)) this.refreshKeypad();
    }
    this.updateChip();
  }

  updateChip() {
    const ui = this.ui, gs = this.gs;
    if (!gs || !gs.economy) return;
    const sp = gs.simSpeed > 1 ? gs.simSpeed : 1, inf = !!gs.economy.unlimited;
    const show = sp > 1 || inf;
    const key = show ? [t('adm_chip'), sp, inf, Math.round(ui.coinBar.width), View.safeTop].join('|') : '';
    if (key === this.chipKey) return;
    this.chipKey = key;
    this.chip.setVisible(show);
    if (!show) return;
    const parts = [t('adm_chip')];
    if (sp > 1) parts.push('×' + sp);
    if (inf) parts.push('∞');
    this.chipText.setText(parts.join(' · '));
    const w = this.chipText.width + 28, h = 40;
    const g = this.chipBg;
    g.clear();
    g.fillStyle(0x2b2f3a, 0.82); g.fillRoundedRect(0, -h / 2, w, h, h / 2);
    g.lineStyle(2, 0xffd84a, 0.9); g.strokeRoundedRect(0, -h / 2, w, h, h / 2);
    this.chipText.setPosition(14, 0);
    this.chip.setPosition(26 + ui.coinBar.width + 12, 62 + View.safeTop);
    this.chipW = w;
  }

  // ------------------------------------------------------------------ tests (read only)
  rects() {
    const out = [];
    const put = (id, b, kind) => {
      if (!b || !b.active) return;
      const tx = b.text;
      out.push({ id, kind, x: Math.round(b.x), y: Math.round(b.y), w: b.width, h: b.height, alpha: +b.alpha.toFixed(2), visible: b.visible,
        text: tx ? tx.text : null, textW: tx ? Math.round(tx.width * tx.scaleX) : 0 });
    };
    if (this.kp) for (const id in this.kp.btns) put(id, this.kp.btns[id], 'key');
    if (this.pn) for (const id in this.pn.btns) put(id, this.pn.btns[id], 'panel');
    return out;
  }

  state() {
    const gs = this.gs, S = AdminSession;
    return {
      keypad: !!this.kp, panel: !!this.pn, busy: this.busy, digits: this.digits.length, dots: this.kp ? this.kp.dots.text : '',
      err: this.kp ? this.kp.err.text : '', lockText: this.kp ? this.kp.lock.text : '', lockLeft: lockLeft(Date.now()),
      unlocked: S.unlocked, wrong: S.wrong, taps: S.taps.length, shakes: this.shakes,
      speed: gs ? (gs.simSpeed > 1 ? gs.simSpeed : 1) : 1, unlimited: !!(gs && gs.economy && gs.economy.unlimited), uses: gs ? gs.adminUses || 0 : 0,
      status: this.status, statusErr: this.statusErr, sub: this.sub, lastAct: this.lastAct || null, backup: this.lastBackup,
      panelBox: this.pn ? { top: this.pn.top, h: this.pn.h, w: PW } : null, keypadBox: this.kp ? { top: this.ui.H / 2 - KP_H / 2, h: KP_H, w: KP_W } : null,
      chip: this.chip.visible ? { text: this.chipText.text, x: this.chip.x, y: this.chip.y, w: this.chipW } : null,
      pads: gs && gs.paidPads ? { offered: offeredPads(gs, false).length, onScreen: offeredPads(gs, true).length } : null,
      buttons: this.rects(),
    };
  }

  destroy() {
    this.kp = null; this.pn = null;
    const H = window.__FV;
    if (H && H.adminState === this.stateFn) delete H.adminState;
  }
}
