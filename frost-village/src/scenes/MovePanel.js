// (v4.2.1) 마을 옮기기 · Move village — the sheet behind the settings panel's 「마을 옮기기」 button (src/core/Transfer.js
// makes and reads the code). DOM, like the resident chat: a real text box (long-press paste, the phone's own copy menu,
// the Korean keyboard) and a scrollable code. Phone-first: 360x640 and 390x844 without overlaps; the box grows with the
// screen, the buttons stay 48 px tall.
//
//   내보내기  the game saves first, then the code (every game key, Transfer.isGameKey) with its size; 「복사하기」 (the
//            Android app's bridge, else navigator.clipboard, else select + execCommand) and, in the Android app only,
//            「공유하기」 (the phone's share sheet: KakaoTalk '나와의 채팅', a memo app, Gmail)
//   불러오기  paste (「붙여넣기」: the Android bridge, else navigator.clipboard.readText when the browser allows it; a long
//            press always works) -> 「불러오기」 checks the code (prefix, length, CRC32, decompress, JSON, app id), dry-runs
//            the save through Save.js migrateSave, shows what it found and asks; 「바꾸기」 keeps the current village as
//            a spare (되돌리기), writes the new one with the running game's saves blocked (window.__FV_NO_SAVE) and
//            reloads the page.
// The Android app (tools/apk) adds window.SnowbloomAndroid { copy(text), share(text), paste() } for its own pages only.
import { SAVE_KEY, SETTINGS_KEY, SAVE_VERSION, Save, Settings } from '../core/Save.js';
import { encodeVillage, decodeVillage, dryRun, applyVillage, snapshotKeys, getStore, backupCode } from '../core/Transfer.js';
import { getLang } from '../data/strings.js';

const S = {
  ko: {
    title: '마을 옮기기', tabOut: '내보내기', tabIn: '불러오기', close: '닫기', closeAria: '마을 옮기기 닫기',
    outLead: '지금 마을 전체(진행 상황, 주민들과의 수다 기억, 설정)를 글자 코드 하나로 만들었어요. 새 앱이나 다른 휴대폰의 「설정 → 마을 옮기기 → 불러오기」에 붙여 넣으면 이 마을이 그대로 옮겨 가요.',
    making: '코드를 만드는 중…', makeFail: '코드를 만들지 못했어요. 다시 해 볼까요?', retry: '다시 만들기',
    size: '코드 길이 {n}자', long: ' · 길어서 카카오톡에서는 잘릴 수 있어요. 메모 앱이나 Gmail(나에게 보내기)에 보관하세요.', copy: '복사하기', share: '공유하기',
    copied: '복사했어요! 이제 카카오톡이나 메모에 붙여 넣어 보관하세요.',
    copyFail: '자동 복사가 안 돼요. 코드 칸을 길게 눌러 「모두 선택」 → 「복사」를 해 주세요.',
    shareFail: '공유 창을 열지 못했어요. 「복사하기」를 써 주세요.', shared: '공유할 곳을 골라 주세요.',
    tip: "이 코드는 내 마을 전체예요. 카카오톡 '나와의 채팅'이나 메모에 붙여 넣어 보관하세요. 다른 사람에게 보내지 마세요.",
    inLead: '「내보내기」로 만든 마을 코드를 아래 칸에 붙여 넣고 「불러오기」를 누르세요.',
    placeholder: '여기를 길게 눌러 「붙여넣기」', paste: '붙여넣기', load: '불러오기', checking: '코드를 확인하는 중…',
    pasteFail: '자동으로 붙여 넣지 못했어요. 칸을 길게 눌러 「붙여넣기」를 골라 주세요.',
    found: '이 마을을 찾았어요', coins: '{n} 코인', residents: '주민 {n}명', day: '{n}일째', sites: '건물 {n}채',
    office: '촌장 사무실 있음', chat: '주민들과의 수다 기억 포함', made: '{d}에 만든 코드', saved: '{d}에 저장한 마을',
    ask: '지금 마을을 이 마을로 바꿀까요? 지금 마을은 예비 사본으로 남겨 둬요.', yes: '바꾸기', no: '취소',
    applying: '마을을 옮기는 중…', done: '다 됐어요! 새 마을을 여는 중…',
    spare: '예비 사본: {d}까지 하던 마을', undo: '예비 사본으로 되돌리기', undoAsk: '예비 사본 마을로 되돌릴까요? 지금 마을은 다시 예비 사본이 돼요.',
    unchanged: '지금 마을은 그대로예요.',
    rank: ['서리마을', '서리읍'],
    header: '[행복한 눈꽃마을 이야기] 마을 옮기기 코드 · {name} {coins}코인 · {d}',
    err: {
      empty: '먼저 코드를 붙여 넣어 주세요.',
      notCode: '마을 코드가 아니에요. 「SNOWBLOOM1.」로 시작하는 코드를 통째로 붙여 넣어 주세요.',
      cut: '코드가 중간에 잘렸어요{part}. 처음부터 끝까지 다시 복사해 붙여 넣어 주세요.',
      damaged: '코드의 글자가 바뀌었거나 빠졌어요. 받은 코드를 그대로 다시 복사해 붙여 넣어 주세요.',
      newer: '더 새 버전의 게임에서 만든 코드예요. 게임을 업데이트한 뒤 다시 해 주세요.',
      foreign: '이 게임의 마을 코드가 아니에요.',
      cantOpen: '이 기기에서는 이 코드를 열 수 없어요. 게임과 Android System WebView(또는 브라우저)를 업데이트해 주세요.',
      noVillage: '코드 안에 마을이 없어요.',
      tooBig: '코드가 너무 커서 열 수 없어요.',
      newerSave: '더 새 버전의 게임에서 만든 마을이에요. 게임을 업데이트한 뒤 다시 해 주세요.',
      badSave: '코드 안의 마을을 읽을 수 없어요.',
      noStorage: '이 화면에서는 저장을 할 수 없어서 마을을 불러올 수 없어요.',
      noRoom: '저장 공간이 모자라서 바꾸지 못했어요.',
    },
  },
  en: {
    title: 'Move village', tabOut: 'Export', tabIn: 'Import', close: 'Close', closeAria: 'Close Move village',
    outLead: 'Your whole village (progress, what the villagers remember from your chats, settings) is now one text code. Paste it into "Settings → Move village → Import" in the new app or on another phone and this village moves there as it is.',
    making: 'Making the code…', makeFail: 'Could not make the code. Try again?', retry: 'Make it again',
    size: 'Code length: {n} characters', long: ' · Long: a chat app may cut it. Keep it in a memo app or an e-mail to yourself.', copy: 'Copy', share: 'Share',
    copied: 'Copied! Now paste it into a chat with yourself or a memo to keep it.',
    copyFail: 'Copying did not work. Long-press the code, choose "Select all", then "Copy".',
    shareFail: 'Could not open sharing. Please use "Copy".', shared: 'Choose where to keep it.',
    tip: 'This code is your whole village. Keep it in a chat with yourself or a memo. Do not send it to other people.',
    inLead: 'Paste a village code made with "Export" into the box and press "Import".',
    placeholder: 'Long-press here to paste', paste: 'Paste', load: 'Import', checking: 'Checking the code…',
    pasteFail: 'Could not paste by itself. Long-press the box and choose "Paste".',
    found: 'Village found', coins: '{n} coins', residents: '{n} villagers', day: 'Day {n}', sites: '{n} buildings',
    office: 'Chief\'s office built', chat: 'Includes the villagers\' chat memories', made: 'Code made {d}', saved: 'Saved {d}',
    ask: 'Replace your current village with this one? Your current village is kept as a spare copy.', yes: 'Replace', no: 'Cancel',
    applying: 'Moving the village…', done: 'Done! Opening your village…',
    spare: 'Spare copy: the village you had until {d}', undo: 'Go back to the spare copy', undoAsk: 'Go back to the spare village? Your current village becomes the spare copy.',
    unchanged: 'Your current village has not changed.',
    rank: ['Frost Village', 'Frost Town'],
    header: '[Snowbloom Village] village code · {name} {coins} coins · {d}',
    err: {
      empty: 'Paste a code first.',
      notCode: 'This is not a village code. Paste the whole code that starts with "SNOWBLOOM1.".',
      cut: 'The code is cut off{part}. Copy it again from start to end and paste it.',
      damaged: 'Some characters of the code changed or are missing. Copy the code again exactly as you got it.',
      newer: 'This code comes from a newer version of the game. Update the game and try again.',
      foreign: 'This is not a village code of this game.',
      cantOpen: 'This device cannot open this code. Please update the game and Android System WebView (or the browser).',
      noVillage: 'There is no village in this code.',
      tooBig: 'This code is too big to open.',
      newerSave: 'This village comes from a newer version of the game. Update the game and try again.',
      badSave: 'The village in this code cannot be read.',
      noStorage: 'Saving is not possible here, so a village cannot be imported.',
      noRoom: 'Not enough storage space to replace the village.',
    },
  },
};

const CSS = `
html.fm-lock,html.fm-lock body{touch-action:auto!important}
.fm-root{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;box-sizing:border-box;padding:max(10px,env(safe-area-inset-top,0px)) 10px max(10px,env(safe-area-inset-bottom,0px));font-family:Pretendard,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif;color:#2b2f3a;-webkit-user-select:text;user-select:text;-webkit-touch-callout:default;-webkit-text-size-adjust:100%}
.fm-root *,.fm-root *::before,.fm-root *::after{box-sizing:border-box}
.fm-root[hidden],.fm-root [hidden]{display:none!important}
.fm-root button{-webkit-user-select:none;user-select:none;cursor:pointer;font-family:inherit;-webkit-tap-highlight-color:transparent}
.fm-back{position:absolute;inset:0;background:rgba(27,38,56,.55)}
.fm-sheet{position:relative;width:100%;max-width:480px;max-height:100%;display:flex;flex-direction:column;background:#fffaf0;border:3px solid #efd6a3;border-radius:22px;box-shadow:0 10px 34px rgba(27,38,56,.35);overflow:hidden}
.fm-head{display:flex;align-items:center;gap:10px;padding:12px 10px 4px 16px}
.fm-head h2{flex:1;margin:0;font-size:21px;line-height:1.2;font-weight:900;color:#2b2f3a}
.fm-x{flex:none;width:44px;height:44px;border-radius:50%;border:0;background:#e6eef8;color:#3a4562;display:flex;align-items:center;justify-content:center}
.fm-x svg{width:22px;height:22px}
.fm-tabs{display:flex;gap:8px;padding:6px 14px 8px}
.fm-tab{flex:1;min-height:46px;border-radius:13px;border:2px solid #d7e3f2;background:#fff;color:#56617e;font-size:16px;font-weight:800}
.fm-tab[aria-selected="true"]{background:#3d8be0;border-color:#3d8be0;color:#fff}
.fm-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:2px 14px 16px}
.fm-p{margin:2px 2px 10px;font-size:14.5px;line-height:1.5;color:#3a4562}
.fm-code{display:block;width:100%;height:clamp(96px,22vh,200px);margin:0;resize:none;padding:10px;border:2px solid #d7e3f2;border-radius:12px;background:#fff;color:#2b2f3a;font-family:ui-monospace,Menlo,Consolas,"Roboto Mono",monospace;font-size:12.5px;line-height:1.35;word-break:normal;overflow-wrap:anywhere;white-space:pre-wrap;overflow-y:auto}
.fm-code:focus{outline:3px solid #9cc3f2;outline-offset:0}
textarea.fm-in{font-size:16px;height:clamp(96px,20vh,180px)}
.fm-meta{margin:6px 2px 8px;font-size:13px;color:#56617e}
.fm-row{display:flex;gap:10px;margin:8px 0 0}
.fm-btn{flex:1 1 0;min-width:0;min-height:48px;padding:6px 10px;border:0;border-radius:14px;background:#3d8be0;color:#fff;font-size:16px;font-weight:900;line-height:1.15;box-shadow:0 3px 0 rgba(0,0,0,.16)}
.fm-btn:active{transform:translateY(2px);box-shadow:0 1px 0 rgba(0,0,0,.16)}
.fm-btn.green{background:#2f9e5b}.fm-btn.gray{background:#8e99a8}.fm-btn.orange{background:#ef8a1f}
.fm-btn:disabled{opacity:.5}
.fm-tip{margin:12px 0 0;padding:10px 12px;border-radius:12px;background:#fff1d6;border:2px solid #f3d39a;font-size:14px;line-height:1.5;color:#4a3a1a}
.fm-msg{margin:8px 2px 0;font-size:14px;line-height:1.45;font-weight:700;color:#23806c}
.fm-msg.err{color:#b8322a}
.fm-msg:empty{display:none}
.fm-card{margin:12px 0 0;padding:12px;border-radius:14px;background:#eef6ff;border:2px solid #bcd6f5}
.fm-card h3{margin:0 0 6px;font-size:16px;font-weight:900}
.fm-card ul{margin:0 0 6px;padding-left:20px;font-size:14.5px;line-height:1.55}
.fm-q{margin:6px 0 2px;font-size:14.5px;line-height:1.5;font-weight:800}
.fm-undo{margin:16px 0 0;padding:10px 2px 0;border-top:1px dashed #d7cbb0;font-size:13.5px;line-height:1.45;color:#56617e}
.fm-link{display:inline-block;margin-top:2px;padding:8px 0;border:0;background:none;color:#2f7de1;font-size:14.5px;font-weight:800;text-decoration:underline}
`;

/** a code longer than this may be cut by a chat app (KakaoTalk caps a message at about 10,000 characters) */
const LONG_CODE = 9000;
const CLOSE_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>';
const h = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? p[k] : m));
const num = (n) => String(Math.floor(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const pad2 = (n) => (n < 10 ? '0' : '') + n;
function when(ms, lang) {
  if (!ms) return '';
  const d = new Date(ms);
  return lang === 'ko' ? d.getFullYear() + '.' + pad2(d.getMonth() + 1) + '.' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
    : d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
/** may this page read the clipboard at all? (a frame without clipboard-read in its permissions policy — the claude.ai
 *  artifact — never can: no 「붙여넣기」 button there, a long press works) */
function clipboardReadAllowed() {
  try { const p = document.permissionsPolicy || document.featurePolicy; if (p && typeof p.allowsFeature === 'function') return p.allowsFeature('clipboard-read'); } catch (e) { /* */ }
  return true;
}
/** the Android app's bridge (tools/apk MainActivity, only on its own origin) */
function bridge() { try { const b = window.SnowbloomAndroid; return b && typeof b === 'object' ? b : null; } catch (e) { return null; } }

export class MovePanel {
  /**
   * host: { lang() -> 'ko' | 'en', saveNow() -> the fresh save string or null, onOpen(), onClose(), reload() }
   */
  constructor(host) {
    this.host = host || {};
    this.tab = 'out';
    this.busy = false;            // a code is being checked / a village written (불러오기)
    this.making = false;          // a code is being made (내보내기; never blocks 불러오기)
    this.applying = false;        // a village is being written: the sheet stays until the page reloads
    this.pending = null;          // { keys, summary } waiting for 바꾸기
    this.exported = null;         // { text, chars, summary }
    MovePanel.injectCss();
    this.build();
  }

  static injectCss() {
    if (typeof document === 'undefined' || document.getElementById('fm-style')) return;
    const s = document.createElement('style');
    s.id = 'fm-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  get L() { const l = this.host.lang ? this.host.lang() : 'ko'; return S[l] || S.ko; }
  get lang() { return this.host.lang ? this.host.lang() : 'ko'; }

  build() {
    const root = this.root = h('div', 'fm-root');
    root.hidden = true;
    root.id = 'fm-root';
    // the game's own touch / mouse listeners on window must never see what happens on the sheet (a tap here would
    // otherwise also land on the Phaser settings panel underneath)
    for (const ev of ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'mousedown', 'mousemove', 'mouseup', 'pointerdown', 'pointermove', 'pointerup', 'wheel', 'keydown', 'keyup']) {
      root.addEventListener(ev, (e) => { e.stopPropagation(); }, { passive: true });
    }
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (this.pending) this.cancelPending(); else this.close(); } });
    const back = h('div', 'fm-back');
    back.addEventListener('click', () => this.close());
    const sheet = this.sheet = h('section', 'fm-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'fm-title');

    const head = h('header', 'fm-head');
    this.titleEl = h('h2', null); this.titleEl.id = 'fm-title';
    const x = this.closeBtn = h('button', 'fm-x'); x.type = 'button'; x.innerHTML = CLOSE_SVG; x.id = 'fm-close';
    x.addEventListener('click', () => this.close());
    head.append(this.titleEl, x);

    const tabs = h('div', 'fm-tabs'); tabs.setAttribute('role', 'tablist');
    this.tabOut = this.makeTab('out'); this.tabIn = this.makeTab('in');
    tabs.append(this.tabOut, this.tabIn);

    const body = this.body = h('div', 'fm-body');
    // ---- 내보내기
    const out = this.outView = h('div', 'fm-view'); out.id = 'fm-view-out'; out.setAttribute('role', 'tabpanel');
    this.outLead = h('p', 'fm-p');
    this.codeOut = h('textarea', 'fm-code'); this.codeOut.id = 'fm-code-out'; this.codeOut.readOnly = true;
    this.codeOut.setAttribute('autocomplete', 'off'); this.codeOut.setAttribute('autocorrect', 'off'); this.codeOut.setAttribute('autocapitalize', 'off'); this.codeOut.spellcheck = false;
    this.codeOut.addEventListener('focus', () => { try { this.codeOut.select(); } catch (e) { /* */ } });
    this.metaOut = h('div', 'fm-meta'); this.metaOut.id = 'fm-size';
    const r1 = h('div', 'fm-row');
    this.copyBtn = h('button', 'fm-btn green'); this.copyBtn.type = 'button'; this.copyBtn.id = 'fm-copy';
    this.copyBtn.addEventListener('click', () => this.copy());
    this.shareBtn = h('button', 'fm-btn orange'); this.shareBtn.type = 'button'; this.shareBtn.id = 'fm-share';
    this.shareBtn.addEventListener('click', () => this.share());
    this.retryBtn = h('button', 'fm-btn'); this.retryBtn.type = 'button'; this.retryBtn.id = 'fm-retry';
    this.retryBtn.addEventListener('click', () => this.makeCode());
    r1.append(this.copyBtn, this.shareBtn, this.retryBtn);
    this.msgOut = h('div', 'fm-msg'); this.msgOut.id = 'fm-msg-out'; this.msgOut.setAttribute('role', 'status');
    this.tipEl = h('p', 'fm-tip');
    out.append(this.outLead, this.codeOut, this.metaOut, r1, this.msgOut, this.tipEl);

    // ---- 불러오기
    const inn = this.inView = h('div', 'fm-view'); inn.id = 'fm-view-in'; inn.setAttribute('role', 'tabpanel');
    this.inLead = h('p', 'fm-p');
    this.codeIn = h('textarea', 'fm-code fm-in'); this.codeIn.id = 'fm-code-in';
    this.codeIn.setAttribute('autocomplete', 'off'); this.codeIn.setAttribute('autocorrect', 'off'); this.codeIn.setAttribute('autocapitalize', 'off'); this.codeIn.spellcheck = false;
    this.codeIn.addEventListener('input', () => { if (this.pending) this.cancelPending(true); this.setMsg(this.msgIn, ''); });
    const r2 = h('div', 'fm-row');
    this.pasteBtn = h('button', 'fm-btn gray'); this.pasteBtn.type = 'button'; this.pasteBtn.id = 'fm-paste';
    this.pasteBtn.addEventListener('click', () => this.paste());
    this.loadBtn = h('button', 'fm-btn'); this.loadBtn.type = 'button'; this.loadBtn.id = 'fm-load';
    this.loadBtn.addEventListener('click', () => this.check(this.codeIn.value));
    r2.append(this.pasteBtn, this.loadBtn);
    this.msgIn = h('div', 'fm-msg'); this.msgIn.id = 'fm-msg-in'; this.msgIn.setAttribute('role', 'alert');
    // the confirm card
    const card = this.card = h('div', 'fm-card'); card.id = 'fm-confirm'; card.hidden = true;
    this.cardTitle = h('h3', null); this.cardList = h('ul', null); this.cardQ = h('p', 'fm-q');
    const r3 = h('div', 'fm-row');
    this.yesBtn = h('button', 'fm-btn orange'); this.yesBtn.type = 'button'; this.yesBtn.id = 'fm-yes';
    this.yesBtn.addEventListener('click', () => this.apply());
    this.noBtn = h('button', 'fm-btn gray'); this.noBtn.type = 'button'; this.noBtn.id = 'fm-no';
    this.noBtn.addEventListener('click', () => this.cancelPending());
    r3.append(this.noBtn, this.yesBtn);
    card.append(this.cardTitle, this.cardList, this.cardQ, r3);
    // the spare village of the last 불러오기
    const undo = this.undoBox = h('div', 'fm-undo'); undo.id = 'fm-undo'; undo.hidden = true;
    this.undoText = h('div', null);
    this.undoBtn = h('button', 'fm-link'); this.undoBtn.type = 'button'; this.undoBtn.id = 'fm-undo-btn';
    this.undoBtn.addEventListener('click', () => { const c = backupCode(); if (c) this.check(c, true); });
    undo.append(this.undoText, this.undoBtn);
    inn.append(this.inLead, this.codeIn, r2, this.msgIn, card, undo);

    body.append(out, inn);
    sheet.append(head, tabs, body);
    root.append(back, sheet);
    document.body.appendChild(root);
  }

  makeTab(id) {
    const b = h('button', 'fm-tab');
    b.type = 'button'; b.id = 'fm-tab-' + id;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => this.showTab(id));
    return b;
  }

  /** the words of the current language (the panel can be opened in either) */
  texts() {
    const L = this.L;
    this.titleEl.textContent = L.title;
    this.closeBtn.setAttribute('aria-label', L.closeAria);
    this.tabOut.textContent = L.tabOut; this.tabIn.textContent = L.tabIn;
    this.outLead.textContent = L.outLead;
    this.copyBtn.textContent = L.copy; this.shareBtn.textContent = L.share; this.retryBtn.textContent = L.retry;
    this.tipEl.textContent = L.tip;
    this.inLead.textContent = L.inLead;
    this.codeIn.placeholder = L.placeholder;
    this.pasteBtn.textContent = L.paste; this.loadBtn.textContent = L.load;
    this.yesBtn.textContent = L.yes; this.noBtn.textContent = L.no;
    this.undoBtn.textContent = L.undo;
    const br = bridge();
    this.shareBtn.hidden = !(br && typeof br.share === 'function');
    // (a browser that can read the clipboard, or the Android app; a long press always works)
    this.pasteBtn.hidden = !((br && typeof br.paste === 'function') || (navigator.clipboard && typeof navigator.clipboard.readText === 'function' && clipboardReadAllowed()));
  }

  get isOpen() { return !this.root.hidden; }

  open(tab) {
    if (this.isOpen) { this.showTab(tab || this.tab); return; }
    this.texts();
    this.root.hidden = false;
    document.documentElement.classList.add('fm-lock');
    this.returnFocus = document.activeElement;
    if (this.host.onOpen) this.host.onOpen();
    this.exported = null;
    this.cancelPending(true);
    this.setMsg(this.msgOut, ''); this.setMsg(this.msgIn, '');
    this.showTab(tab === 'in' ? 'in' : 'out');
  }

  close() {
    if (!this.isOpen || this.applying) return;
    this.root.hidden = true;
    document.documentElement.classList.remove('fm-lock');
    this.codeOut.value = '';
    this.metaOut.textContent = '';
    this.copyBtn.disabled = true; this.shareBtn.disabled = true;
    this.exported = null;
    this.cancelPending(true);
    if (this.host.onClose) this.host.onClose();
    try { if (this.returnFocus && this.returnFocus.focus) this.returnFocus.focus({ preventScroll: true }); } catch (e) { /* */ }
  }

  showTab(id) {
    this.tab = id === 'in' ? 'in' : 'out';
    const out = this.tab === 'out';
    this.tabOut.setAttribute('aria-selected', out ? 'true' : 'false');
    this.tabIn.setAttribute('aria-selected', out ? 'false' : 'true');
    this.outView.hidden = !out; this.inView.hidden = out;
    this.body.scrollTop = 0;
    if (out && !this.exported && !this.making) this.makeCode();
    if (!out) this.showUndo();
  }

  setMsg(el, text, isErr) { el.textContent = text || ''; el.classList.toggle('err', !!isErr); }

  // ---------------------------------------------------------------- 내보내기
  /** every game key, with the save written just now (so the code holds this very moment) */
  currentKeys() {
    const st = getStore();
    const keys = snapshotKeys(st);
    let raw = null;
    try { raw = this.host.saveNow ? this.host.saveNow() : null; } catch (e) { raw = null; }
    if (typeof raw === 'string' && raw) keys[SAVE_KEY] = raw;
    if (!st && !keys[SETTINGS_KEY]) { try { keys[SETTINGS_KEY] = JSON.stringify(Settings.data); } catch (e) { /* */ } }
    const sorted = {};
    for (const k of Object.keys(keys).sort()) sorted[k] = keys[k];
    return sorted;
  }

  async makeCode() {
    if (this.making || this.applying) return;
    const L = this.L;
    this.making = true;
    this.codeOut.value = '';
    this.metaOut.textContent = L.making;
    this.copyBtn.disabled = true; this.shareBtn.disabled = true; this.retryBtn.hidden = true;
    this.setMsg(this.msgOut, '');
    let res = null;
    try {
      const keys = this.currentKeys();
      if (!keys[SAVE_KEY]) throw new Error('no save');
      const made = Date.now();
      const dr = dryRun(keys, made);
      const enc = await encodeVillage(keys, { made });
      const sm = dr.ok ? dr.summary : null;
      const header = fill(L.header, { name: L.rank[sm && sm.rank === 2 ? 1 : 0], coins: num(sm ? sm.coins : 0), d: when(made, this.lang) });
      res = { text: header + '\n' + enc.code, code: enc.code, chars: enc.chars, comp: enc.comp, summary: sm, keys: Object.keys(keys) };
    } catch (e) {
      res = null;
      console.warn('[FrostVillage] move: export failed', e);
    }
    this.making = false;
    if (!this.isOpen) return;
    if (!res) {
      this.metaOut.textContent = '';
      this.setMsg(this.msgOut, L.makeFail, true);
      this.retryBtn.hidden = false;
      return;
    }
    this.exported = res;
    this.codeOut.value = res.text;
    // (a long code — a village with a lot of chat memory — may be cut by a chat app: the check catches that, but better
    //  to keep it where it cannot be cut)
    this.metaOut.textContent = fill(L.size, { n: num(res.text.length) }) + (res.text.length > LONG_CODE ? L.long : '');
    this.copyBtn.disabled = false; this.shareBtn.disabled = false;
    if (window.__FV) window.__FV.lastMoveCode = { chars: res.text.length, codeChars: res.chars, comp: res.comp, keys: res.keys };
  }

  async copy() {
    const L = this.L, ex = this.exported;
    if (!ex) return;
    let ok = false;
    const br = bridge();
    if (br && typeof br.copy === 'function') { try { ok = br.copy(ex.text) !== false; } catch (e) { ok = false; } }
    if (!ok && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try { await navigator.clipboard.writeText(ex.text); ok = true; } catch (e) { ok = false; }
    }
    if (!ok) {
      try { this.codeOut.focus({ preventScroll: true }); this.codeOut.select(); this.codeOut.setSelectionRange(0, ex.text.length); ok = !!document.execCommand('copy'); } catch (e) { ok = false; }
    }
    this.setMsg(this.msgOut, ok ? L.copied : L.copyFail, !ok);
    if (!ok) { try { this.codeOut.focus({ preventScroll: true }); this.codeOut.select(); } catch (e) { /* */ } }
  }

  share() {
    const L = this.L, ex = this.exported, br = bridge();
    if (!ex || !br || typeof br.share !== 'function') return;
    let ok = false;
    try { ok = br.share(ex.text) !== false; } catch (e) { ok = false; }
    this.setMsg(this.msgOut, ok ? L.shared : L.shareFail, !ok);
  }

  // ---------------------------------------------------------------- 불러오기
  async paste() {
    const L = this.L, br = bridge();
    let text = null;
    if (br && typeof br.paste === 'function') { try { const t = br.paste(); text = typeof t === 'string' && t ? t : null; } catch (e) { text = null; } }
    if (text == null && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      try { text = await navigator.clipboard.readText(); } catch (e) { text = null; }
    }
    if (!text) { this.setMsg(this.msgIn, L.pasteFail, true); try { this.codeIn.focus(); } catch (e) { /* */ } return; }
    this.codeIn.value = text;
    this.cancelPending(true);
    this.setMsg(this.msgIn, '');
  }

  errText(r) {
    const L = this.L;
    let s = L.err[r.error] || L.err.damaged;
    // ((have / want) only when letters are missing; a code cut in its last few checksum letters shows no numbers)
    if (r.error === 'cut') s = fill(s, { part: r.info && r.info.want && r.info.have < r.info.want ? ' (' + num(r.info.have) + ' / ' + num(r.info.want) + ')' : '' });
    return s + (r.error === 'empty' ? '' : ' ' + L.unchanged);
  }

  /** check a code; when it is good, show what it holds and ask */
  async check(text, isUndo) {
    if (this.busy) return;
    const L = this.L;
    this.cancelPending(true);
    this.busy = true;
    this.loadBtn.disabled = true;
    this.setMsg(this.msgIn, L.checking);
    let r = null;
    try {
      r = await decodeVillage(text);
      if (r.ok) {
        const dr = dryRun(r.keys, r.payload.made);
        r = dr.ok ? Object.assign(r, { summary: dr.summary }) : dr;
      }
    } catch (e) { r = { ok: false, error: 'damaged' }; }
    this.busy = false;
    this.loadBtn.disabled = false;
    if (window.__FV) window.__FV.lastMoveCheck = r.ok ? { ok: true, summary: r.summary, keys: Object.keys(r.keys) } : { ok: false, error: r.error, info: r.info || null };
    if (!r.ok) { this.setMsg(this.msgIn, this.errText(r), true); return; }
    this.setMsg(this.msgIn, '');
    this.pending = { keys: r.keys, summary: r.summary, undo: !!isUndo };
    const sm = r.summary, li = [];
    li.push(L.rank[sm.rank === 2 ? 1 : 0] + ' · ' + fill(L.coins, { n: num(sm.coins) }));
    li.push(fill(L.residents, { n: num(sm.residents) }) + (sm.day ? ' · ' + fill(L.day, { n: sm.day }) : '') + (sm.sites ? ' · ' + fill(L.sites, { n: sm.sites }) : ''));
    if (sm.office) li.push(L.office);
    if (sm.chat) li.push(L.chat);
    if (sm.made || sm.savedAt) li.push(sm.made ? fill(L.made, { d: when(sm.made, this.lang) }) : fill(L.saved, { d: when(sm.savedAt, this.lang) }));
    this.cardTitle.textContent = L.found;
    this.cardList.textContent = '';
    for (const s of li) this.cardList.appendChild(h('li', null, s));
    this.cardQ.textContent = isUndo ? L.undoAsk : L.ask;
    this.card.hidden = false;
    try { this.card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* */ }
  }

  cancelPending(quiet) {
    this.pending = null;
    if (this.card) this.card.hidden = true;
    void quiet;
  }

  async apply() {
    const p = this.pending, L = this.L;
    if (!p || this.busy) return;
    this.busy = true;
    this.applying = true;
    this.yesBtn.disabled = true; this.noBtn.disabled = true; this.loadBtn.disabled = true;
    this.setMsg(this.msgIn, L.applying);
    let r;
    try { r = await applyVillage(p.keys); } catch (e) { r = { ok: false, error: 'noRoom' }; }
    if (!r.ok) {
      this.busy = false;
      this.applying = false;
      this.yesBtn.disabled = false; this.noBtn.disabled = false; this.loadBtn.disabled = false;
      this.cancelPending(true);
      this.setMsg(this.msgIn, this.errText(r), true);
      return;
    }
    this.setMsg(this.msgIn, L.done);
    if (window.__FV) window.__FV.lastMoveApplied = { keys: Object.keys(p.keys), coins: p.summary.coins };
    setTimeout(() => { try { if (this.host.reload) this.host.reload(); else window.location.reload(); } catch (e) { /* */ } }, 450);
  }

  showUndo() {
    const c = backupCode();
    if (!c) { this.undoBox.hidden = true; return; }
    // (the date shown: when that village was last saved, read from the spare code itself)
    this.undoBox.hidden = false;
    this.undoText.textContent = fill(this.L.spare, { d: this.spareWhen || '…' });
    if (!this.spareWhen) {
      decodeVillage(c).then((r) => {
        if (!r.ok) { this.undoBox.hidden = true; return; }
        const dr = dryRun(r.keys, r.payload.made);
        const t = dr.ok && dr.summary.savedAt ? dr.summary.savedAt : r.payload.made;
        this.spareWhen = when(t, this.lang);
        this.undoText.textContent = fill(this.L.spare, { d: this.spareWhen });
      }).catch(() => { this.undoBox.hidden = true; });
    }
  }
}

/** the game's side: saves first, pauses the UI scene's input while the sheet is open (a tap on the sheet must never also
 *  press a Phaser button of the settings panel underneath), reloads after an import. One sheet per page (a new UI scene
 *  after 처음부터 하기 takes it over). */
let PANEL = null;
export function openMovePanel(ui, tab) {
  const gs = ui.gs;
  const host = {
    lang: () => (getLang() === 'en' ? 'en' : 'ko'),
    saveNow: () => {
      try { gs.save(true); } catch (e) { /* the stored one, or the one made below */ }
      let raw = null;
      try { raw = window.localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
      if (!raw || !Save.lastWriteOk) {
        try { raw = JSON.stringify(Object.assign({ v: SAVE_VERSION, t: Date.now() }, gs.serialize())); } catch (e) { /* keep the stored one */ }
      }
      return raw;
    },
    onOpen: () => {
      ui.moveOpen = true;
      if (ui.input) ui.input.enabled = false;
      const kb = ui.game.input && ui.game.input.keyboard;
      if (kb) kb.enabled = false;
      if (window.__FV) window.__FV.moveOpen = true;
    },
    onClose: () => {
      ui.moveOpen = false;
      if (ui.input) ui.input.enabled = true;
      const kb = ui.game.input && ui.game.input.keyboard;
      if (kb) kb.enabled = true;
      if (window.__FV) window.__FV.moveOpen = false;
    },
    reload: () => window.location.reload(),
  };
  if (!PANEL) PANEL = new MovePanel(host);
  else if (!PANEL.isOpen) PANEL.host = host;
  ui.movePanel = PANEL;
  PANEL.open(tab);
  return PANEL;
}
