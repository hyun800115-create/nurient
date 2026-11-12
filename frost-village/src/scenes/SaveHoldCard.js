// (v4.3 step B, S3 — WP-S owns this file) the save hold cards in the UI scene (build_plan.md §3.5, map_save §4.6, §4.7).
// While the save is held (Save.held, src/core/Save.js) nothing writes the stored village; these cards say why and offer
// the ways out. DOM, like 마을 옮기기 (MovePanel): real buttons, Korean text that wraps, safe-area aware, phone-first.
//
//   'newer'  (Save.held 'newer')  「더 새 버전에서 저장된 마을이에요」 — a modal card over the (unsaved) fresh village:
//            「게임 업데이트하기」 (the app: the Play page; the web build: reload), 「마을 코드 만들기」 (마을 옮기기 ›
//            내보내기 with the STORED keys: MovePanel's saveNow gives the stored save while held), 「새 마을로 시작」 (asks
//            first; the newer village goes to the 불러오기 spare as a code and to the backup slot, then a fresh village)
//   'fail'   (Save.held 'failed43', S4's R43 failure)  「마을을 새 지도로 옮기지 못했어요」 — modal: 「다시 해 보기」 (reload),
//            「마을 코드 만들기」 (the current stored keys, BP-15), 「새 마을로 시작」 (asks; the stored raw to the backup slot)
//   'stale'  (Save.held 'stale': a newer build saved the village meanwhile — a second tab, the updated app)  a banner at
//            the top 「새 버전에서 저장된 마을이에요 · 새로 고침해 주세요」 with 「새로 고침」; the game stays playable,
//            nothing it does is written
// Mounted by UI.create as ui.saveHold (BP-26). Opens by itself for a hold that came before the UI (Save.load) and listens
// for later ones (Save.onHold); says so on the v43 bus (EV43.hold { kind }). One DOM card per page, shared by every UI
// scene (a new UI after 처음부터 takes it over).

import { Save, SAVE_KEY, SAVE_VERSION, LV } from '../core/Save.js';
import { encodeVillage, snapshotKeys, getStore, MOVE_BACKUP_KEY } from '../core/Transfer.js';
import { t } from '../data/strings.js';
import { EV43 } from '../data/ids43.js';
import { emit } from '../systems/v43/hooks.js';
import { openMovePanel } from './MovePanel.js';

const KIND = { newer: 'newer', failed43: 'fail', stale: 'stale' };
const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.snowbloom.village';

const CSS = `
.fh-root{position:fixed;top:0;right:0;bottom:0;left:0;inset:0;z-index:58;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:12px;padding:max(12px,env(safe-area-inset-top,0px)) 12px max(12px,env(safe-area-inset-bottom,0px));font-family:Pretendard,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif;color:#2b2f3a;-webkit-text-size-adjust:100%}
.fh-root *,.fh-root *::before,.fh-root *::after,.fh-bar *{box-sizing:border-box}
.fh-root[hidden],.fh-bar[hidden],.fh-root [hidden]{display:none!important}
.fh-back{position:absolute;top:0;right:0;bottom:0;left:0;inset:0;background:rgba(27,38,56,.62)}
.fh-card{position:relative;width:100%;max-width:440px;max-height:100%;overflow-y:auto;overscroll-behavior:contain;background:#fffaf0;border:3px solid #efd6a3;border-radius:22px;box-shadow:0 10px 34px rgba(27,38,56,.35);padding:18px 16px 16px}
.fh-icon{width:54px;height:54px;margin:0 auto 6px;border-radius:50%;background:#e6eef8;display:flex;align-items:center;justify-content:center;font-size:30px;line-height:1}
.fh-card h2{margin:0 0 8px;font-size:20px;line-height:1.3;font-weight:900;text-align:center;color:#2b2f3a;word-break:keep-all}
.fh-p{margin:0 2px 8px;font-size:15px;line-height:1.55;color:#3a4562;word-break:keep-all}
.fh-small{margin:0 2px 10px;font-size:12.5px;color:#7a8499;text-align:center}
.fh-q{margin:6px 2px 4px;font-size:15px;line-height:1.5;font-weight:800;color:#2b2f3a;word-break:keep-all}
.fh-msg{margin:8px 2px 0;font-size:14px;line-height:1.45;font-weight:700;color:#23806c;word-break:keep-all}
.fh-msg.err{color:#b8322a}
.fh-msg:empty{display:none}
.fh-col{display:flex;flex-direction:column;gap:10px;margin-top:12px}
.fh-row{display:flex;gap:10px}
.fh-btn{flex:1 1 0;min-width:0;min-height:50px;padding:6px 12px;border:0;border-radius:14px;background:#3d8be0;color:#fff;font-family:inherit;font-size:16.5px;font-weight:900;line-height:1.2;box-shadow:0 3px 0 rgba(0,0,0,.16);cursor:pointer;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}
.fh-btn:active{transform:translateY(2px);box-shadow:0 1px 0 rgba(0,0,0,.16)}
.fh-btn.green{background:#2f9e5b}.fh-btn.gray{background:#8e99a8}.fh-btn.orange{background:#ef8a1f}
.fh-btn:disabled{opacity:.5}
.fh-bar{position:fixed;left:0;right:0;top:0;z-index:58;display:flex;justify-content:center;padding:8px 10px;padding-top:max(8px,env(safe-area-inset-top,0px));pointer-events:none;font-family:Pretendard,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif}
.fh-bar-in{pointer-events:auto;display:flex;align-items:center;gap:10px;width:100%;max-width:480px;padding:8px 8px 8px 14px;border-radius:16px;background:#2b2f3a;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.3)}
.fh-bar-t{flex:1;min-width:0;font-size:14.5px;line-height:1.35;font-weight:800;word-break:keep-all}
.fh-bar .fh-btn{flex:none;min-height:44px;font-size:15px;padding:6px 14px}
`;

const h = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
const STOP = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'mousedown', 'mousemove', 'mouseup', 'pointerdown', 'pointermove', 'pointerup', 'wheel', 'keydown', 'keyup', 'click'];
/** the game's own touch / mouse listeners on window never see what happens on the card (as MovePanel does) */
function shield(el) { for (const ev of STOP) el.addEventListener(ev, (e) => { e.stopPropagation(); }, { passive: true }); }
function isApp() { try { return !!(window.SnowbloomAndroid && typeof window.SnowbloomAndroid === 'object'); } catch (e) { return false; } }

let DOM = null;
function dom() {
  if (DOM || typeof document === 'undefined') return DOM;
  if (!document.getElementById('fh-style')) { const s = document.createElement('style'); s.id = 'fh-style'; s.textContent = CSS; document.head.appendChild(s); }
  // ---- the modal card
  const root = h('div', 'fh-root'); root.id = 'fh-root'; root.hidden = true;
  shield(root);
  const back = h('div', 'fh-back');
  const card = h('section', 'fh-card'); card.setAttribute('role', 'alertdialog'); card.setAttribute('aria-modal', 'true'); card.setAttribute('aria-labelledby', 'fh-title');
  const icon = h('div', 'fh-icon');
  const title = h('h2', null); title.id = 'fh-title';
  const body = h('p', 'fh-p'); body.id = 'fh-body';
  const which = h('p', 'fh-small'); which.id = 'fh-which';
  const main = h('div', 'fh-col'); main.id = 'fh-main';
  const b1 = h('button', 'fh-btn green'); b1.type = 'button'; b1.id = 'fh-b1';
  const b2 = h('button', 'fh-btn'); b2.type = 'button'; b2.id = 'fh-b2';
  const b3 = h('button', 'fh-btn gray'); b3.type = 'button'; b3.id = 'fh-b3';
  main.append(b1, b2, b3);
  const ask = h('div', null); ask.id = 'fh-ask'; ask.hidden = true;
  const q = h('p', 'fh-q'); q.id = 'fh-q';
  const askRow = h('div', 'fh-row');
  const yes = h('button', 'fh-btn orange'); yes.type = 'button'; yes.id = 'fh-yes';
  const no = h('button', 'fh-btn gray'); no.type = 'button'; no.id = 'fh-no';
  askRow.append(no, yes);
  ask.append(q, askRow);
  const msg = h('div', 'fh-msg'); msg.id = 'fh-msg'; msg.setAttribute('role', 'status');
  card.append(icon, title, body, which, main, ask, msg);
  root.append(back, card);
  // ---- the stale banner
  const bar = h('div', 'fh-bar'); bar.id = 'fh-bar'; bar.hidden = true;
  const barIn = h('div', 'fh-bar-in'); barIn.setAttribute('role', 'alert');
  shield(barIn);
  const barT = h('div', 'fh-bar-t'); barT.id = 'fh-bar-text';
  const barB = h('button', 'fh-btn'); barB.type = 'button'; barB.id = 'fh-bar-reload';
  barIn.append(barT, barB);
  bar.append(barIn);
  document.body.append(root, bar);
  DOM = { root, card, icon, title, body, which, main, b1, b2, b3, ask, q, yes, no, msg, bar, barT, barB, owner: null };
  for (const k of ['b1', 'b2', 'b3', 'yes', 'no', 'barB']) DOM[k].addEventListener('click', () => { const o = DOM.owner; if (o) o.press(k); });
  return DOM;
}

export class SaveHoldCard {
  constructor(ui) {
    this.ui = ui;
    this.isOpen = false;
    this.kind = null;          // 'fail' | 'newer' | 'stale' while open
    this.blocking = false;     // a modal card is up: the game's input stays off (MovePanel's close leaves it off)
    this.busy = false;
    this.asking = false;
    this.offHold = Save.onHold((why) => this.onHold(why));
    try { if (ui && ui.events) ui.events.once('shutdown', () => { this.offHold(); this.close(); }); } catch (e) { /* */ }
    // a hold that came before this UI (Save.load at Game.build)
    if (Save.held) this.onHold(Save.held);
  }

  onHold(why) { const k = KIND[why]; if (k) this.open(k); }

  /** show the card of `kind` ('fail' | 'newer' | 'stale'); returns whether it opened */
  open(kind, opts) {
    const D = dom();
    if (!D || !(kind === 'newer' || kind === 'fail' || kind === 'stale')) return false;
    if (this.isOpen && this.kind === kind) return true;
    if (this.isOpen) this.close();
    D.owner = this;
    this.isOpen = true;
    this.kind = kind;
    this.busy = false;
    this.asking = false;
    this.openedAt = Date.now();
    if (kind === 'stale') {
      D.barT.textContent = t('hold_staleText');
      D.barB.textContent = t('hold_reload');
      D.bar.hidden = false;
    } else {
      const info = (opts && opts.info) || (kind === 'newer' ? Save.newer : Save.failed) || {};
      D.card.dataset.kind = kind;
      D.icon.textContent = '❄';
      D.title.textContent = t(kind === 'newer' ? 'hold_newerTitle' : 'hold_failTitle');
      D.body.textContent = t(kind === 'newer' ? 'hold_newerBody' : 'hold_failBody');
      D.which.textContent = kind === 'newer' ? t('hold_newerWhich', { lv: (info.v | 0) + '.' + (info.lv | 0), now: SAVE_VERSION + '.' + LV }) : '';
      D.which.hidden = kind !== 'newer';
      D.b1.textContent = kind === 'newer' ? t(isApp() ? 'hold_update' : 'hold_updateWeb') : t('hold_retry');
      D.b2.textContent = t('hold_code');
      D.b3.textContent = t('hold_new');
      D.q.textContent = t(kind === 'newer' ? 'hold_newAsk' : 'hold_newAskFail');
      D.yes.textContent = t('hold_newYes');
      D.no.textContent = t('hold_cancel');
      this.showAsk(false);
      this.setMsg('');
      D.root.hidden = false;
      this.block(true);
    }
    try { window.__FV_HOLDCARD = { kind, t: Date.now() }; } catch (e) { /* */ }
    emit(EV43.hold, { kind });
    return true;
  }

  close() {
    if (DOM && DOM.owner === this) {
      DOM.root.hidden = true;
      DOM.bar.hidden = true;
      DOM.owner = null;
    }
    if (this.blocking) this.block(false);
    this.isOpen = false;
    this.kind = null;
    this.asking = false;
    try { if (window.__FV_HOLDCARD) window.__FV_HOLDCARD = null; } catch (e) { /* */ }
  }

  /** a modal card keeps the village's input off (the joystick, the keyboard) */
  block(on) {
    this.blocking = !!on;
    const ui = this.ui;
    try {
      if (ui && ui.input) ui.input.enabled = !on;
      const kb = ui && ui.game && ui.game.input && ui.game.input.keyboard;
      if (kb) kb.enabled = !on;
    } catch (e) { /* */ }
  }

  showAsk(on) {
    const D = DOM;
    if (!D) return;
    this.asking = !!on;
    D.main.hidden = !!on;
    D.ask.hidden = !on;
  }

  setMsg(text, err) { if (!DOM) return; DOM.msg.textContent = text || ''; DOM.msg.classList.toggle('err', !!err); }

  press(k) {
    if (this.busy || !this.isOpen) return;
    // (a tap meant for the title screen that lands as the card comes up is not a choice)
    if (Math.abs(Date.now() - (this.openedAt || 0)) < 600) return;
    const kind = this.kind;
    if (k === 'barB') { this.reload(); return; }
    if (k === 'b1') {
      if (kind === 'newer' && isApp()) {
        this.setMsg(t('hold_updateHint'));
        // (the app opens every link that is not the game's own in the phone's apps: here the Play Store)
        try { window.location.href = PLAY_URL; } catch (e) { /* */ }
      } else this.reload();
      return;
    }
    if (k === 'b2') {
      try { openMovePanel(this.ui, 'out'); } catch (e) { console.warn('[FrostVillage] hold card: 마을 옮기기 failed', e); }
      return;
    }
    if (k === 'b3') { this.setMsg(''); this.showAsk(true); return; }
    if (k === 'no') { this.showAsk(false); return; }
    if (k === 'yes') { this.startNew(); }
  }

  reload() { try { window.location.reload(); } catch (e) { /* */ } }

  /** 「새 마을로 시작」: the held village is kept first (the 불러오기 spare as a code for a newer one; the backup slot by
   *  Save.clear), then a fresh village that saves again. Nothing is removed when a copy cannot be made */
  async startNew() {
    if (this.busy) return;
    this.busy = true;
    const D = DOM, kind = this.kind;
    if (D) { D.yes.disabled = true; D.no.disabled = true; }
    this.setMsg(t('hold_newWorking'));
    let ok = true;
    if (kind === 'newer') {
      try {
        const st = getStore();
        const keys = snapshotKeys(st);
        if (typeof keys[SAVE_KEY] === 'string') {
          const enc = await encodeVillage(keys);
          st.setItem(MOVE_BACKUP_KEY, enc.code);
          ok = st.getItem(MOVE_BACKUP_KEY) === enc.code;
        }
      } catch (e) { ok = false; }
    }
    if (ok) {
      Save.clear();
      ok = !Save.held;
    }
    if (D) { D.yes.disabled = false; D.no.disabled = false; }
    this.busy = false;
    if (!ok) { this.showAsk(false); this.setMsg(t('hold_newFail'), true); return; }
    const gs = this.ui && this.ui.gs;
    this.close();
    if (gs && gs.resetProgress) gs.resetProgress();
    else this.reload();
  }
}
