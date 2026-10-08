// ChatPanel: the "주민과 수다 떨기" bottom sheet (DOM overlay; DOM is needed for Korean IME on
// phones). Works at 390x844 with the on-screen keyboard open (visualViewport-aware: the input row
// always stays above the keyboard), keyboard and screen-reader friendly, reduced-motion aware.
//
//   const panel = new ChatPanel({ engine, assets, onClose(key, spreadEvents) {}, onChange() {} });
//   panel.open('npc_aunt', openerElement);
//
// assets: { portrait(key) -> url, emote(name) -> url, icon(name) -> url } (any may return null).
// Colours come from CSS tokens (--fc-*); call ChatPanel.tokensCss() for a default set when the host
// page has none (the lab defines its own, with a dark theme).

import { MOOD_KO, MOOD_EMOTE } from './sanitize.js';
import { SRC_KO } from './memory.js';
import { refName } from './personas.js';
import { josa } from './ko.js';

export const CHIPS = [
  { id: 'how', text: '요즘 어때?' },
  { id: 'gossip', text: '무슨 소문 있어?' },
  { id: 'gift', text: '선물 줄게', tray: true },
  { id: 'favor', text: '도와줄 일 있어?' },
  { id: 'bye', text: '잘 지내!' },
];
export const GIFT_ITEMS = ['빵', '생선', '코코아', '귤', '꽃', '털실', '당근', '광석'];

const NOTE_TEXT = {
  consent: '처음 AI로 말을 보내면 "이 페이지가 Claude를 써도 될까요?" 하는 확인 창이 한 번 떠요. 수다는 보는 사람 자신의 Claude 사용량을 써요.',
  'offline-switch': 'AI를 쓸 수 없어서, 지금부터는 마을 말투로 수다를 떨어요. 기억과 소문은 그대로 쌓여요.',
  budget: '오늘 AI 수다는 여기까지예요. 마을 말투로는 계속 이야기할 수 있어요.',
  tired: '이 주민은 이제 일하러 가야 해서, 지금부터는 마을 말투로 대답해요.',
  wait: 'AI가 잠깐 바빠요. 조금 쉬었다가 다시 보내 주세요.',
  relogin: 'Claude에 다시 로그인해야 AI 수다를 이어 갈 수 있어요.',
  retry: '말이 중간에 끊겼어요. 다시 보내 볼까요?',
  cancelled: '대답을 멈췄어요.',
};

const reduceMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const h = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };

const HEART = '<svg viewBox="0 0 24 22" aria-hidden="true"><path d="M12 21.2 10.6 20C5.4 15.4 2 12.3 2 8.4 2 5.3 4.4 3 7.4 3c1.8 0 3.5.8 4.6 2.1C13.1 3.8 14.8 3 16.6 3 19.6 3 22 5.3 22 8.4c0 3.9-3.4 7-8.6 11.6L12 21.2z" fill="currentColor"/></svg>';
const SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.2 15.6 12 3.4 13.8z" fill="currentColor"/></svg>';
const STOP = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2.5" fill="currentColor"/></svg>';
const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

export class ChatPanel {
  constructor({ engine, assets = {}, onClose = null, onChange = null, mount = null } = {}) {
    this.engine = engine;
    this.village = engine.village;
    this.assets = assets;
    this.onClose = onClose;
    this.onChange = onChange;
    this.mount = mount || document.body;
    this.key = null;
    this.ctl = null;
    this.pending = 0;
    this.typer = null;
    this.consentShown = false;
    this.notesShown = new Set();
    ChatPanel.injectCss();
    this.build();
  }

  // ---------------------------------------------------------------- DOM
  build() {
    const root = this.root = h('div', 'fc-root');
    root.hidden = true;
    const back = this.backdrop = h('div', 'fc-backdrop');
    back.addEventListener('click', () => this.close());
    const sheet = this.sheet = h('section', 'fc-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'fc-name');

    // header
    const head = h('header', 'fc-head');
    this.portrait = h('img', 'fc-portrait');
    this.portrait.alt = '';
    const who = h('div', 'fc-who');
    this.nameEl = h('h2', 'fc-name'); this.nameEl.id = 'fc-name';
    this.subEl = h('p', 'fc-sub');
    const meta = h('div', 'fc-meta');
    this.moodEl = h('span', 'fc-mood');
    this.heartsEl = h('span', 'fc-hearts');
    this.heartsEl.setAttribute('role', 'img');
    this.modeEl = h('span', 'fc-mode');
    meta.append(this.moodEl, this.heartsEl);
    who.append(this.nameEl, this.subEl, meta);
    const close = this.closeBtn = h('button', 'fc-icon-btn fc-close');
    close.type = 'button'; close.innerHTML = CLOSE; close.setAttribute('aria-label', '수다 닫기');
    close.addEventListener('click', () => this.close());
    head.append(this.portrait, who, this.modeEl, close);

    // tabs
    const tabs = h('div', 'fc-tabs');
    tabs.setAttribute('role', 'tablist');
    this.tabChat = this.tab('수다', 'chat');
    this.tabMem = this.tab('기억', 'mem');
    tabs.append(this.tabChat, this.tabMem);

    // chat view
    const chat = this.chatView = h('div', 'fc-view fc-chatview');
    chat.id = 'fc-view-chat';
    chat.setAttribute('role', 'tabpanel');
    this.list = h('div', 'fc-list');
    this.list.setAttribute('role', 'log');
    this.live = h('div', 'fc-sr');
    this.live.setAttribute('aria-live', 'polite');
    chat.append(this.list, this.live);

    // memory view
    const mem = this.memView = h('div', 'fc-view fc-memview');
    mem.id = 'fc-view-mem';
    mem.setAttribute('role', 'tabpanel');
    mem.hidden = true;

    // chips + gift tray + input
    const foot = this.foot = h('div', 'fc-foot');
    const chips = this.chips = h('div', 'fc-chips');
    chips.setAttribute('aria-label', '빠른 대답');
    for (const c of CHIPS) {
      const b = h('button', 'fc-chip', c.text);
      b.type = 'button';
      b.addEventListener('click', () => (c.tray ? this.toggleTray() : this.submit(c.text)));
      if (c.tray) { b.setAttribute('aria-expanded', 'false'); this.giftChip = b; }
      chips.append(b);
    }
    const tray = this.tray = h('div', 'fc-tray');
    tray.hidden = true;
    for (const it of GIFT_ITEMS) {
      const b = h('button', 'fc-tray-item', it);
      b.type = 'button';
      b.addEventListener('click', () => { this.toggleTray(false); this.submit(it + ' 선물이야!'); });
      tray.append(b);
    }
    const heartOnly = h('button', 'fc-tray-item fc-tray-plain', '마음만');
    heartOnly.type = 'button';
    heartOnly.addEventListener('click', () => { this.toggleTray(false); this.submit('선물 줄게'); });
    tray.append(heartOnly);

    const form = this.form = h('form', 'fc-form');
    form.setAttribute('autocomplete', 'off');
    const input = this.input = h('input', 'fc-input');
    input.id = 'fc-input';
    input.type = 'text';
    input.maxLength = this.engine.opts.inputMax || 80;
    input.placeholder = '하고 싶은 말을 적어 보세요';
    input.setAttribute('enterkeyhint', 'send');
    input.setAttribute('aria-label', '주민에게 할 말');
    const count = this.countEl = h('span', 'fc-count');
    count.setAttribute('aria-hidden', 'true');
    input.addEventListener('input', () => this.updateCount());
    input.addEventListener('focus', () => setTimeout(() => this.scrollEnd(), 250));
    const send = this.sendBtn = h('button', 'fc-send');
    send.type = 'submit';
    send.innerHTML = SEND;
    send.setAttribute('aria-label', '보내기');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (this.ctl) { this.ctl.abort(); return; }
      this.submit(input.value);
    });
    const wrap = h('div', 'fc-inputwrap');
    wrap.append(input, count);
    form.append(wrap, send);
    foot.append(chips, tray, form);

    sheet.append(head, tabs, chat, mem, foot);
    root.append(back, sheet);
    this.mount.append(root);

    root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); if (!this.tray.hidden) this.toggleTray(false); else this.close(); }
      if (e.key === 'Tab') this.trapFocus(e);
    });
    this.onViewport = () => this.fitViewport();
  }

  tab(label, id) {
    const b = h('button', 'fc-tab', label);
    b.type = 'button';
    b.id = 'fc-tab-' + id;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', 'fc-view-' + id);
    b.addEventListener('click', () => this.showTab(id));
    return b;
  }

  showTab(id) {
    const chat = id === 'chat';
    this.chatView.hidden = !chat;
    this.memView.hidden = chat;
    this.foot.hidden = !chat;
    this.tabChat.setAttribute('aria-selected', String(chat));
    this.tabMem.setAttribute('aria-selected', String(!chat));
    if (!chat) this.renderMemory(); else this.scrollEnd();
  }

  trapFocus(e) {
    const f = [...this.sheet.querySelectorAll('button, input, [tabindex]')].filter((x) => !x.disabled && x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  fitViewport() {
    const vv = window.visualViewport;
    if (!vv || this.root.hidden) return;
    const kb = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
    this.sheet.style.setProperty('--fc-kb', kb + 'px');
    this.sheet.style.setProperty('--fc-vh', vv.height + 'px');
    this.sheet.classList.toggle('fc-kb-open', kb > 60);
    if (kb > 60) this.scrollEnd();
  }

  // ---------------------------------------------------------------- open / close
  open(key, returnFocus) {
    if (this.key) this.close(true);
    const v = this.village;
    const p = v.personas[key];
    if (!p) return;
    this.key = key;
    this.returnFocus = returnFocus || document.activeElement;
    this.list.textContent = '';
    this.portrait.src = this.assets.portrait ? this.assets.portrait(key) || '' : '';
    this.nameEl.textContent = p.name;
    this.subEl.textContent = p.job;
    this.input.value = '';
    this.updateCount();
    this.toggleTray(false);
    this.root.hidden = false;
    document.documentElement.classList.add('fc-lock');
    if (!reduceMotion()) { this.sheet.classList.remove('fc-in'); void this.sheet.offsetWidth; this.sheet.classList.add('fc-in'); }
    if (window.visualViewport) { window.visualViewport.addEventListener('resize', this.onViewport); window.visualViewport.addEventListener('scroll', this.onViewport); }
    this.fitViewport();
    this.showTab('chat');

    // earlier talk (kept in memory), then the resident speaks first
    const mem = v.mem(key);
    const earlier = mem.log.slice(-8);
    if (earlier.length) {
      for (const [who, text, emote, src] of earlier) this.bubble(who === 'p' ? 'p' : 'r', text, { emote, src, old: true });
      this.divider('다시 만났어요');
    }
    this.updateHeader();
    const status = this.engine.status();
    if (this.engine.modeFor(key) === 'ai' && !this.consentShown && this.engine.aiCalls === 0) { this.note('consent', NOTE_TEXT.consent, 'info'); this.consentShown = true; }
    const lines = this.engine.open(key);
    let delay = reduceMotion() ? 0 : 280;
    for (const l of lines) {
      const t = delay;
      this.pending++;
      setTimeout(() => { this.pending--; if (this.key === key) { this.bubble('r', l.text, { emote: l.emote, src: 'o', reveal: true }); this.announce(l.text); } }, t);
      delay += reduceMotion() ? 0 : 650 + l.text.length * 12;
    }
    this.modeEl.dataset.mode = status.mode;
    setTimeout(() => { try { this.input.focus({ preventScroll: true }); } catch (e) { /* */ } }, reduceMotion() ? 0 : 320);
    if (this.onChange) this.onChange('open', key);
  }

  close(silent) {
    if (!this.key) return;
    if (this.ctl) this.ctl.abort();
    const key = this.key;
    this.key = null;
    this.root.hidden = true;
    document.documentElement.classList.remove('fc-lock');
    if (window.visualViewport) { window.visualViewport.removeEventListener('resize', this.onViewport); window.visualViewport.removeEventListener('scroll', this.onViewport); }
    const spread = this.engine.close(key);
    if (this.returnFocus && this.returnFocus.focus) { try { this.returnFocus.focus({ preventScroll: true }); } catch (e) { /* */ } }
    if (!silent && this.onClose) this.onClose(key, spread);
    if (this.onChange) this.onChange('close', key);
  }

  get isOpen() { return !!this.key; }

  // ---------------------------------------------------------------- header
  updateHeader(delta) {
    const v = this.village, key = this.key;
    if (!key) return;
    const mem = v.mem(key);
    const st = v.stage(key);
    this.subEl.textContent = v.personas[key].job + ' · ' + st.ko;
    const mood = mem.mood;
    this.moodEl.textContent = '';
    const em = this.img(this.assets.emote, MOOD_EMOTE[mood] || 'heart', 'fc-mood-ic');
    if (em) this.moodEl.append(em);
    this.moodEl.append(document.createTextNode(MOOD_KO[mood] || '기분 좋음'));
    const full = Math.round(mem.aff / 10) / 2;           // 0..5 in halves
    this.heartsEl.textContent = '';
    for (let i = 0; i < 5; i++) {
      const s = h('span', 'fc-heart' + (full >= i + 1 ? ' on' : full >= i + 0.5 ? ' half' : ''));
      s.innerHTML = HEART;
      this.heartsEl.append(s);
    }
    this.heartsEl.setAttribute('aria-label', '호감 ' + Math.round(mem.aff) + '점, ' + st.ko);
    const mode = this.engine.modeFor(key);
    this.modeEl.textContent = mode === 'ai' ? 'AI 수다' : '마을 말투';
    this.modeEl.dataset.mode = mode;
    this.modeEl.title = mode === 'ai' ? '대답을 AI(Claude)가 만들어요' : '인터넷 없이 마을 말투로 대답해요';
    if (delta && !reduceMotion()) {
      const f = h('span', 'fc-float' + (delta < 0 ? ' down' : ''), (delta > 0 ? '+' : '') + delta);
      this.heartsEl.append(f);
      setTimeout(() => f.remove(), 1300);
    }
  }

  // ---------------------------------------------------------------- messages
  img(fn, name, cls) {
    const src = fn && name ? fn(name) : null;
    if (!src) return null;
    const i = h('img', cls);
    i.src = src; i.alt = ''; i.decoding = 'async';
    return i;
  }

  bubble(who, text, { emote, src, old, reveal, interrupted } = {}) {
    const row = h('div', 'fc-row fc-' + (who === 'p' ? 'me' : 'them') + (old ? ' fc-old' : ''));
    const b = h('div', 'fc-bubble');
    const t = h('span', 'fc-text');
    b.append(t);
    if (who !== 'p') {
      const e = this.img(this.assets.emote, emote, 'fc-emote');
      if (e) b.append(e);
      if (src === 'a') b.classList.add('fc-ai');
    }
    if (interrupted) b.classList.add('fc-cut');
    row.append(b);
    this.list.append(row);
    if (reveal && !reduceMotion() && who !== 'p') this.typewrite(t, text);
    else t.textContent = text;
    this.scrollEnd();
    return { row, b, t };
  }

  setEmote(bub, emote) {
    if (!bub) return;
    const old = bub.b.querySelector('.fc-emote');
    if (old) old.remove();
    const e = this.img(this.assets.emote, emote, 'fc-emote');
    if (e) { bub.b.append(e); if (!reduceMotion()) e.classList.add('fc-pop'); }
  }

  /** reveal text a few characters at a time (catching up when the stream runs ahead) */
  typewrite(el, target, done) {
    if (el._tw) cancelAnimationFrame(el._tw.raf);
    const st = el._tw || (el._tw = { shown: el.textContent.length });
    st.target = target;
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(80, now - last); last = now;
      const behind = st.target.length - st.shown;
      if (behind <= 0) { el.textContent = st.target; st.raf = 0; if (done) done(); return; }
      st.shown = Math.min(st.target.length, st.shown + Math.max(1, Math.round((dt / 1000) * (38 + behind * 2.2))));
      el.textContent = st.target.slice(0, st.shown);
      this.scrollEnd();
      st.raf = requestAnimationFrame(step);
    };
    st.raf = requestAnimationFrame(step);
  }

  typing() {
    const row = h('div', 'fc-row fc-them fc-typing-row');
    const b = h('div', 'fc-bubble fc-typing');
    b.setAttribute('aria-label', '생각하는 중');
    for (let i = 0; i < 3; i++) b.append(h('i'));
    row.append(b);
    this.list.append(row);
    this.scrollEnd();
    return row;
  }

  divider(text) { const d = h('div', 'fc-divider', text); this.list.append(d); }

  note(id, text, kind = 'info', action) {
    const n = h('div', 'fc-note fc-note-' + kind);
    const ic = this.img(this.assets.icon, kind === 'story' ? 'story' : kind === 'warn' ? 'question' : kind === 'spread' ? 'rumor' : 'memory', 'fc-note-ic');
    if (ic) n.append(ic);
    const t = h('span', 'fc-note-text', text);
    n.append(t);
    if (action) {
      const b = h('button', 'fc-note-btn', action.label);
      b.type = 'button';
      b.addEventListener('click', () => { b.disabled = true; action.run(); });
      n.append(b);
    }
    this.list.append(n);
    this.scrollEnd();
    return n;
  }

  announce(text) { this.live.textContent = ''; setTimeout(() => { this.live.textContent = text; }, 30); }

  scrollEnd() { const l = this.chatView; if (l) l.scrollTop = l.scrollHeight; }

  updateCount() {
    const n = this.input.value.length, max = this.input.maxLength;
    this.countEl.textContent = n ? n + '/' + max : '';
    this.countEl.classList.toggle('near', n > max - 10);
  }

  toggleTray(force) {
    const show = force === undefined ? this.tray.hidden : !!force;
    this.tray.hidden = !show;
    if (this.giftChip) this.giftChip.setAttribute('aria-expanded', String(show));
    if (show) { const f = this.tray.querySelector('button'); if (f) f.focus(); }
  }

  setBusy(on) {
    this.sendBtn.innerHTML = on ? STOP : SEND;
    this.sendBtn.setAttribute('aria-label', on ? '대답 멈추기' : '보내기');
    this.sendBtn.classList.toggle('fc-stop', on);
    for (const b of this.chips.querySelectorAll('button')) b.disabled = on;
  }

  // ---------------------------------------------------------------- sending
  async submit(text, retry) {
    const key = this.key;
    if (!key || this.ctl || this.engine.busy) return;
    const clean = String(text || '').trim();
    if (!clean && !retry) { this.input.focus(); return; }
    const wait = this.engine.waitMs();
    if (wait > 0 && this.engine.modeFor(key) === 'ai') {
      this.sendBtn.classList.add('fc-wait');
      setTimeout(() => this.sendBtn.classList.remove('fc-wait'), wait);
      return;
    }
    if (!retry) { this.bubble('p', clean); this.input.value = ''; this.updateCount(); }
    const ai = this.engine.modeFor(key) === 'ai';
    const typing = this.typing();
    const ctl = this.ctl = new AbortController();
    this.setBusy(true);
    let bub = null, started = performance.now();
    const onPartial = (p) => {
      if (this.key !== key) return;
      if (!bub) { typing.remove(); bub = this.bubble('r', '', { src: 'a' }); }
      this.typewrite(bub.t, p);
    };
    const out = retry ? await this.engine.retry(key, { signal: ctl.signal, onPartial }) : await this.engine.send(key, clean, { signal: ctl.signal, onPartial });
    this.ctl = null;
    if (this.key !== key) { this.setBusy(false); return; }
    // offline replies "type" for a moment so the chat breathes
    if (out.source !== 'ai' && out.ok) {
      const min = reduceMotion() ? 120 : 520 + Math.min(700, (out.reply || '').length * 9);
      const left = min - (performance.now() - started);
      if (left > 0) await new Promise((r) => setTimeout(r, left));
      if (this.key !== key) { this.setBusy(false); return; }
    }
    typing.remove();
    this.setBusy(false);
    if (out.note === 'empty' || out.note === 'busy') { if (bub) bub.row.remove(); return; }
    if (out.note === 'cooldown') { return; }
    if (out.ok) {
      if (!bub) bub = this.bubble('r', '', { src: out.source === 'ai' ? 'a' : 'o' });
      if (out.source !== 'ai') bub.b.classList.remove('fc-ai'); else bub.b.classList.add('fc-ai');
      if (reduceMotion()) bub.t.textContent = out.reply; else this.typewrite(bub.t, out.reply);
      this.setEmote(bub, out.emote);
      this.announce(out.reply);
      this.updateHeader(out.affinity && out.affinity.delta);
      if (out.note && NOTE_TEXT[out.note] && !this.notesShown.has(out.note)) { this.notesShown.add(out.note); this.note(out.note, NOTE_TEXT[out.note], 'warn'); }
      const fresh = (out.gossip || []).filter((g) => !g.dup);
      if (fresh.length) this.note('story', '마을이 새 이야기를 배웠어요 · “' + fresh[0].text + '”', 'story');
      if (out.favor) this.note('favor', '부탁을 받았어요 · ' + out.favor.s, 'info');
    } else {
      if (out.partial) {
        if (!bub) bub = this.bubble('r', out.partial, { src: 'a', interrupted: true });
        else { this.typewrite(bub.t, out.partial); bub.b.classList.add('fc-cut'); }
      } else if (bub) bub.row.remove();
      if (out.note === 'cancelled') this.note('cancelled', NOTE_TEXT.cancelled, 'info');
      else if (out.retry) this.note(out.note, NOTE_TEXT[out.note] || NOTE_TEXT.retry, 'warn', { label: '다시 보내기', run: () => this.submit('', true) });
    }
    if (this.onChange) this.onChange('message', key, out);
  }

  // ---------------------------------------------------------------- memory tab
  renderMemory() {
    const v = this.village, key = this.key;
    if (!key) return;
    const mem = v.mem(key);
    const box = this.memView;
    box.textContent = '';
    const sec = (title, items, empty) => {
      const s = h('section', 'fc-msec');
      s.append(h('h3', 'fc-mtitle', title));
      if (!items.length) s.append(h('p', 'fc-mempty', empty));
      else { const ul = h('ul', 'fc-mlist'); for (const it of items) ul.append(it); s.append(ul); }
      box.append(s);
    };
    const item = (text, tags) => {
      const li = h('li', 'fc-mitem');
      li.append(h('span', 'fc-mtext', text));
      if (tags && tags.length) { const tg = h('span', 'fc-mtags'); for (const t of tags) tg.append(h('span', 'fc-tag', t)); li.append(tg); }
      return li;
    };
    const dayKo = (d) => (d === v.day ? '오늘' : d === v.day - 1 ? '어제' : d + 1 + '일째');
    box.append(h('p', 'fc-mlead', josa(v.personas[key].name, '이') + ' 촌장님과 나눈 이야기 중 기억하는 것들이에요. 수다를 떨수록 쌓이고, 오래된 일은 짧게 요약돼요.'));
    sec('촌장님에 대해 아는 것', mem.facts.slice().reverse().map((f) => item(f.s, [dayKo(f.d)])), '아직 몰라요. 좋아하는 걸 알려 줘 보세요.');
    sec('기억하는 일', mem.ep.slice().reverse().map((e) => item(e.s, [dayKo(e.d), e.src === 't' && e.by ? refName(v.personas, key, e.by) + '한테 들음' : SRC_KO[e.src] || '직접 함', e.ai ? 'AI 수다' : '마을 말투'].concat(e.tp.slice(0, 1), e.ex ? ['예시'] : []))), '아직 없어요.');
    if (mem.sum.length) sec('오래된 기억 (요약)', mem.sum.map((s) => item(s.s, [s.tp + ' 얘기 ' + s.n + '번', '마지막 ' + dayKo(s.d)])), '');
    sec('부탁', mem.favors.map((f) => item(f.s, [f.done ? '해결!' : '아직', dayKo(f.d)])), '받은 부탁이 없어요.');
    const heard = v.corpus.knownBy(key, 'g').filter((x) => x.o !== key).sort((a, b) => b.d - a.d).slice(0, 8);
    sec('들은 소문', heard.map((x) => { const kn = v.corpus.knower(x, key); return item(v.corpus.plain(x, v.personas, v.chiefName), [kn && kn[2] ? refName(v.personas, key, kn[2]) + '한테 들음' : '마을 소문', dayKo(x.d)]); }), '아직 들은 소문이 없어요.');
    const own = v.corpus.e.filter((x) => x.o === key).length;
    box.append(h('p', 'fc-mfoot', '이 주민이 시작한 마을 이야기 ' + own + '개 · 지금까지 수다 ' + mem.talks + '번 (AI ' + mem.ai + '번)'));
  }

  // ---------------------------------------------------------------- styles
  static tokensCss() {
    return ':root{--fc-paper:#fffaf0;--fc-paper-2:#fde9c4;--fc-rim:#efd6a3;--fc-ink:#3a4562;--fc-ink-soft:#7a84a0;--fc-accent:#f39b2f;--fc-accent-ink:#ffffff;--fc-berry:#ff5f8f;--fc-heart-empty:#c3cee0;--fc-mint:#2f9e86;--fc-frost:#e6eef8;--fc-shade:rgba(40,52,84,.38);--fc-shadow:rgba(58,69,98,.2);--fc-focus:#2f7de1;--fc-display:"Jua","Apple SD Gothic Neo","Noto Sans KR",sans-serif;--fc-body:Pretendard,"Apple SD Gothic Neo","Noto Sans KR","Malgun Gothic",sans-serif}';
  }

  static injectCss() {
    if (typeof document === 'undefined' || document.getElementById('fc-style')) return;
    const s = document.createElement('style');
    s.id = 'fc-style';
    s.textContent = PANEL_CSS;
    document.head.append(s);
  }
}

export const PANEL_CSS = `
.fc-lock,.fc-lock body{overflow:hidden}
.fc-root{position:fixed;inset:0;z-index:50;font-family:var(--fc-body);color:var(--fc-ink)}
.fc-backdrop{position:absolute;inset:0;background:var(--fc-shade)}
.fc-sheet{--fc-kb:0px;--fc-vh:100dvh;position:absolute;left:0;right:0;bottom:var(--fc-kb);margin:0 auto;max-width:560px;height:min(calc(var(--fc-vh) - 28px - env(safe-area-inset-top,0px)),760px);display:flex;flex-direction:column;background:var(--fc-paper);border:3px solid var(--fc-rim);border-bottom:0;border-radius:26px 26px 0 0;box-shadow:0 -10px 34px var(--fc-shadow);padding-bottom:env(safe-area-inset-bottom,0px);overflow:hidden}
.fc-sheet.fc-kb-open{height:calc(var(--fc-vh) - 8px);padding-bottom:0;border-radius:18px 18px 0 0}
.fc-sheet.fc-in{animation:fc-up .32s cubic-bezier(.2,.9,.3,1.15)}
@keyframes fc-up{from{transform:translateY(40%);opacity:.4}to{transform:none;opacity:1}}
.fc-head{display:grid;grid-template-columns:auto 1fr auto auto;align-items:center;gap:10px;padding:14px 14px 8px 16px}
.fc-portrait{width:56px;height:56px;border-radius:50%;background:var(--fc-frost);border:3px solid var(--fc-rim);object-fit:cover;flex:none}
.fc-who{min-width:0}
.fc-name{margin:0;font-family:var(--fc-display);font-weight:400;font-size:21px;line-height:1.15;color:var(--fc-ink)}
.fc-sub{margin:2px 0 4px;font-size:12.5px;color:var(--fc-ink-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fc-meta{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.fc-mood{display:inline-flex;align-items:center;gap:3px;font-size:12px;font-weight:700;color:var(--fc-ink);background:var(--fc-frost);border-radius:999px;padding:2px 8px 2px 3px}
.fc-mood-ic{width:18px;height:18px}
.fc-hearts{position:relative;display:inline-flex;gap:1px}
.fc-heart{width:15px;height:14px;color:var(--fc-heart-empty);display:inline-block}
.fc-heart svg{width:100%;height:100%;display:block}
.fc-heart.on{color:var(--fc-berry)}
.fc-heart.half{color:var(--fc-berry);opacity:.5}
.fc-float{position:absolute;right:-6px;top:-4px;font:700 13px var(--fc-body);color:var(--fc-berry);animation:fc-float 1.2s ease-out forwards;pointer-events:none}
.fc-float.down{color:var(--fc-ink-soft)}
@keyframes fc-float{from{transform:translateY(4px);opacity:0}25%{opacity:1}to{transform:translateY(-18px);opacity:0}}
.fc-mode{align-self:start;margin-top:4px;font-size:11px;font-weight:700;letter-spacing:.02em;padding:3px 8px;border-radius:999px;background:var(--fc-frost);color:var(--fc-ink-soft);white-space:nowrap}
.fc-mode[data-mode=ai]{background:var(--fc-mint);color:var(--fc-accent-ink)}
.fc-icon-btn{width:38px;height:38px;border-radius:50%;border:2px solid var(--fc-rim);background:var(--fc-paper);color:var(--fc-ink-soft);display:grid;place-items:center;cursor:pointer;padding:0;align-self:start}
.fc-icon-btn svg{width:18px;height:18px}
.fc-tabs{display:flex;gap:6px;padding:0 16px 8px;border-bottom:2px dashed var(--fc-rim)}
.fc-tab{flex:none;font:700 14px var(--fc-body);color:var(--fc-ink-soft);background:none;border:0;border-radius:999px;padding:6px 14px;cursor:pointer}
.fc-tab[aria-selected=true]{background:var(--fc-paper-2);color:var(--fc-ink)}
.fc-view{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
.fc-chatview{padding:12px 14px 8px}
.fc-list{display:flex;flex-direction:column;gap:8px}
.fc-row{display:flex}
.fc-me{justify-content:flex-end}
.fc-old{opacity:.6}
.fc-bubble{position:relative;max-width:min(80%,420px);padding:9px 13px;border-radius:18px;font-size:15.5px;line-height:1.45;word-break:keep-all;overflow-wrap:anywhere;box-shadow:0 2px 0 var(--fc-shadow)}
.fc-them .fc-bubble{background:var(--fc-frost);color:var(--fc-ink);border-top-left-radius:6px;margin-left:12px}
.fc-them .fc-bubble.fc-ai{background:var(--fc-frost)}
.fc-me .fc-bubble{background:var(--fc-paper-2);color:var(--fc-ink);border-top-right-radius:6px}
.fc-emote{position:absolute;left:-14px;top:-12px;width:28px;height:28px;filter:drop-shadow(0 1px 1px var(--fc-shadow))}
.fc-pop{animation:fc-pop .4s cubic-bezier(.2,1.6,.4,1)}
@keyframes fc-pop{from{transform:scale(.3)}to{transform:none}}
.fc-cut .fc-text::after{content:" (끊김)";color:var(--fc-ink-soft);font-size:12px}
.fc-typing{display:inline-flex;gap:5px;align-items:center;padding:12px 14px}
.fc-typing i{width:7px;height:7px;border-radius:50%;background:var(--fc-ink-soft);animation:fc-dot 1s infinite ease-in-out}
.fc-typing i:nth-child(2){animation-delay:.15s}.fc-typing i:nth-child(3){animation-delay:.3s}
@keyframes fc-dot{0%,80%,100%{transform:translateY(0);opacity:.45}40%{transform:translateY(-4px);opacity:1}}
.fc-divider{align-self:center;font-size:11.5px;color:var(--fc-ink-soft);padding:2px 10px;margin:4px 0;border-radius:999px;background:var(--fc-frost)}
.fc-note{align-self:center;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;max-width:94%;font-size:12.5px;line-height:1.45;color:var(--fc-ink);background:var(--fc-paper);border:2px dashed var(--fc-rim);border-radius:14px;padding:7px 11px;margin:2px 0}
.fc-note-story{border-style:solid;background:var(--fc-paper-2)}
.fc-note-ic{width:22px;height:22px;flex:none}
.fc-note-text{min-width:0;flex:1}
.fc-note-btn{font:700 12.5px var(--fc-body);border:0;border-radius:999px;background:var(--fc-accent);color:var(--fc-accent-ink);padding:5px 12px;cursor:pointer}
.fc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.fc-foot{border-top:2px dashed var(--fc-rim);padding:8px 12px 10px;display:flex;flex-direction:column;gap:8px;background:var(--fc-paper)}
.fc-chips{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 -12px;padding:0 12px}
.fc-chips::-webkit-scrollbar{display:none}
.fc-chip{flex:none;font:700 13.5px var(--fc-body);color:var(--fc-ink);background:var(--fc-paper);border:2px solid var(--fc-rim);border-radius:999px;padding:6px 12px;cursor:pointer}
.fc-chip:disabled{opacity:.45}
.fc-tray{display:flex;flex-wrap:wrap;gap:6px;padding:8px;border-radius:14px;background:var(--fc-frost)}
.fc-tray-item{font:700 13px var(--fc-body);border:0;border-radius:10px;background:var(--fc-paper);color:var(--fc-ink);padding:6px 10px;cursor:pointer}
.fc-tray-plain{background:var(--fc-paper-2)}
.fc-form{display:flex;gap:8px;align-items:center}
.fc-inputwrap{position:relative;flex:1;min-width:0}
.fc-input{width:100%;box-sizing:border-box;font:16px var(--fc-body);color:var(--fc-ink);background:var(--fc-frost);border:2px solid transparent;border-radius:999px;padding:10px 54px 10px 16px;outline:none}
.fc-input::placeholder{color:var(--fc-ink-soft)}
.fc-input:focus{border-color:var(--fc-accent);background:var(--fc-paper)}
.fc-count{position:absolute;right:14px;top:50%;transform:translateY(-50%);font-size:11px;color:var(--fc-ink-soft);font-variant-numeric:tabular-nums}
.fc-count.near{color:var(--fc-berry)}
.fc-send{flex:none;width:46px;height:46px;border-radius:50%;border:0;background:var(--fc-accent);color:var(--fc-accent-ink);display:grid;place-items:center;cursor:pointer;box-shadow:0 3px 0 var(--fc-shadow)}
.fc-send svg{width:22px;height:22px}
.fc-send.fc-stop{background:var(--fc-ink);color:var(--fc-paper)}
.fc-send.fc-wait{opacity:.55}
.fc-memview{padding:12px 16px 20px}
.fc-mlead{margin:0 0 10px;font-size:13px;line-height:1.55;color:var(--fc-ink-soft)}
.fc-msec{margin:0 0 14px}
.fc-mtitle{margin:0 0 6px;font-family:var(--fc-display);font-weight:400;font-size:16px;color:var(--fc-ink)}
.fc-mlist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.fc-mitem{background:var(--fc-frost);border-radius:12px;padding:8px 10px;display:flex;flex-direction:column;gap:4px}
.fc-mtext{font-size:14px;line-height:1.45;color:var(--fc-ink)}
.fc-mtags{display:flex;gap:4px;flex-wrap:wrap}
.fc-tag{font-size:11px;font-weight:700;color:var(--fc-ink-soft);background:var(--fc-paper);border-radius:999px;padding:1px 7px}
.fc-mempty{margin:0;font-size:13px;color:var(--fc-ink-soft)}
.fc-mfoot{margin:6px 0 0;font-size:12px;color:var(--fc-ink-soft)}
.fc-root button:focus-visible,.fc-root input:focus-visible{outline:3px solid var(--fc-focus);outline-offset:2px}
@media (prefers-reduced-motion:reduce){.fc-sheet.fc-in,.fc-pop,.fc-float{animation:none}.fc-typing i{animation:none;opacity:.7}}
`;
