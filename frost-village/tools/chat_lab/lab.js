// 서리마을 수다방 — the chat lab page (bundled into dist/chat_lab/index.html by build.mjs).
// Works fully offline; lights up AI replies when `await claude.use("sample")` resolves in a claude.ai
// artifact viewer. State lives in localStorage (wrapped; the page works without it).

import { ChatVillage, ChatEngine, ChatPanel, LAB_RESIDENTS, MOOD_KO, refName, ko } from '../../src/chat/index.js';
import ASSETS from './gen/assets.js';

const STORE = 'frost-chat-lab:v1';
const PREF = 'frost-chat-lab:ai';
const $ = (id) => document.getElementById(id);
const h = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
const HEART = '<svg viewBox="0 0 24 22" aria-hidden="true"><path d="M12 21.2 10.6 20C5.4 15.4 2 12.3 2 8.4 2 5.3 4.4 3 7.4 3c1.8 0 3.5.8 4.6 2.1C13.1 3.8 14.8 3 16.6 3 19.6 3 22 5.3 22 8.4c0 3.9-3.4 7-8.6 11.6L12 21.2z" fill="currentColor"/></svg>';
const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

const assets = {
  portrait: (k) => ASSETS.portraits[k] || null,
  emote: (n) => ASSETS.emotes[n] || null,
  icon: (n) => ASSETS.icons[n] || null,
};

// ------------------------------------------------------------------ state
function load() {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return null;
    // a save from a newer build is kept aside, never overwritten by this older page
    if (ChatVillage.isFuture(raw)) { if (!localStorage.getItem(STORE + ':newer')) localStorage.setItem(STORE + ':newer', raw); return null; }
    return ChatVillage.deserialize(raw, { roster: LAB_RESIDENTS });
  } catch (e) { /* storage blocked */ }
  return null;
}
function save() { try { localStorage.setItem(STORE, JSON.stringify(village.serialize())); } catch (e) { /* storage blocked or full */ } }
function pref(v) { try { if (v === undefined) return localStorage.getItem(PREF); localStorage.setItem(PREF, v); } catch (e) { return null; } return null; }

/** a brand-new village gets two small example chats (offline, marked 예시) so the log is not empty */
function seed(v) {
  const e = new ChatEngine({ village: v, rng: v.rng });
  const runs = [['npc_kid_girl', '당근 선물이야!'], ['npc_aunt', '아주머니 빵 냄새 최고예요, 멋져요!']];
  return (async () => {
    for (const [key, text] of runs) { e.open(key); await e.send(key, text); e.close(key); }
    for (const x of v.corpus.e) x.ex = 1;
    for (const k in v.mems) { const m = v.mems[k]; for (const ep of m.ep) ep.ex = 1; m.log = []; m.said = []; }
    v.advance(); v.advance();
    return v;
  })();
}

let village = load();
const fresh = !village;
if (!village) village = new ChatVillage({ roster: LAB_RESIDENTS, seed: 11 });
const engine = new ChatEngine({ village });
let sampleFn = null;
let aiPref = pref() !== 'off';

const panel = new ChatPanel({
  engine, assets,
  onClose: (key, spread) => {
    save(); render(); showSpread(spread);
    // the cards were redrawn: give focus back to the one that opened the chat
    const card = document.querySelector('.card[data-key="' + key + '"]');
    if (card) { try { card.focus({ preventScroll: true }); } catch (e) { /* */ } }
  },
  onChange: (what) => { if (what === 'message') { save(); renderCounts(); renderMode(); } },
});

// ------------------------------------------------------------------ AI (claude.ai "sample")
async function connectAI() {
  const c = typeof window !== 'undefined' ? window.claude : null;
  if (!c || typeof c.use !== 'function') { engine.setSample(null); renderMode(); return; }
  try { sampleFn = await c.use('sample'); } catch (e) { sampleFn = null; }
  engine.setSample(sampleFn || null);
  engine.setForcedOffline(!aiPref);
  renderMode();
}

function renderMode() {
  const st = engine.status();
  const pill = $('mode-pill'), txt = $('mode-text'), hint = $('mode-hint'), sw = $('ai-switch'), tg = $('ai-toggle');
  pill.dataset.mode = st.mode;
  const avail = !!sampleFn && !['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(st.reason);
  sw.hidden = !avail;
  tg.checked = avail && aiPref;
  if (st.mode === 'ai') {
    txt.textContent = 'AI가 대답해요';
    hint.textContent = 'AI 수다는 보는 사람 자신의 Claude 사용량을 써요. 처음 보낼 때 허락을 한 번 물어봐요. (남은 AI 수다 ' + Math.max(0, st.budget - st.used) + '번)';
  } else {
    txt.textContent = '마을 말투로 대답해요';
    hint.textContent = st.reason === 'forced' ? 'AI를 끄면 인터넷 없이 마을 말투로 대답해요. 기억과 소문은 똑같이 쌓여요.'
      : st.reason === 'not_granted' ? 'AI 사용을 허락하지 않아서 마을 말투로 대답해요. 기억과 소문은 그대로 쌓여요.'
      : st.reason === 'budget' ? '오늘 AI 수다는 여기까지예요. 마을 말투로 계속 이야기할 수 있어요.'
      : sampleFn ? 'AI를 쓸 수 없어서 마을 말투로 대답해요.'
      : '인터넷이 없어도 마을 말투로 수다를 떨 수 있어요. claude.ai에서 열면 AI가 대답해요.';
  }
}

$('ai-toggle').addEventListener('change', (e) => {
  aiPref = e.target.checked;
  pref(aiPref ? 'on' : 'off');
  engine.setForcedOffline(!aiPref);
  renderMode();
});

// ------------------------------------------------------------------ rendering
function hearts(aff) {
  const box = h('span', 'hearts');
  const full = Math.round(aff / 10) / 2;
  for (let i = 0; i < 5; i++) { const s = h('i', full >= i + 1 ? 'on' : full >= i + 0.5 ? 'half' : ''); s.innerHTML = HEART; box.append(s); }
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', '호감 ' + Math.round(aff) + '점');
  return box;
}

function img(src, cls, alt = '') { const i = h('img', cls); if (src) i.src = src; i.alt = alt; i.decoding = 'async'; return i; }

/** what a resident would say if you walked up now (preview only; nothing is marked as said) */
function previewLine(key) {
  const v = village, mem = v.mem(key);
  const g = v.corpus.pickGossip(key, { day: v.day, said: mem.said, rng: () => 0.5, minFresh: 0.1 });
  if (g) return { text: v.corpus.sayGossip(g.entry, g.kn, key, v.personas, v.level(key), v.chiefName, () => 0), fresh: v.corpus.fresh(g.entry, v.day) > 0.6 };
  const last = [...mem.log].reverse().find((l) => l[0] === 'r');
  if (last) return { text: last[1], fresh: false };
  const p = v.personas[key];
  return { text: (p.catch && p.catch[0]) || '…', fresh: false };
}

function renderPeople() {
  const box = $('people');
  box.textContent = '';
  for (const key of LAB_RESIDENTS) {
    const p = village.personas[key], mem = village.mem(key);
    const card = h('button', 'card');
    card.type = 'button';
    card.dataset.key = key;
    card.setAttribute('aria-label', p.name + ', ' + p.job + ', ' + village.stage(key).ko + '. 수다 떨기');
    card.append(img(assets.portrait(key), 'ph'));
    const mood = assets.emote({ happy: 'heart', excited: 'sparkle', calm: 'heart', shy: 'sweat', sad: 'tear', grumpy: 'anger', sleepy: 'zzz', worried: 'sweat' }[mem.mood] || 'heart');
    if (mood) { const m = img(mood, 'mood', MOOD_KO[mem.mood] || ''); m.title = MOOD_KO[mem.mood] || ''; card.append(m); }
    card.append(h('span', 'nm', p.name), h('span', 'job', p.job), hearts(mem.aff));
    const pv = previewLine(key);
    card.append(h('span', 'say', pv.text));
    if (pv.fresh) card.classList.add('fresh');
    const heard = village.corpus.knownBy(key, 'g').filter((x) => x.o !== key).length;
    const badges = h('span', 'badges');
    if (heard) { const b = h('span', 'badge'); const ic = assets.icon('rumor'); if (ic) b.append(img(ic)); b.append(document.createTextNode('들은 소문 ' + heard)); badges.append(b); }
    const remembered = mem.ep.length + mem.sum.length + mem.facts.length;
    if (remembered) { const b = h('span', 'badge'); const ic = assets.icon('memory'); if (ic) b.append(img(ic)); b.append(document.createTextNode('기억 ' + remembered)); badges.append(b); }
    if (badges.childNodes.length) card.append(badges);
    card.addEventListener('click', () => panel.open(key, card));
    box.append(card);
  }
}

function renderWorld() {
  const w = village.world;
  const night = village.part >= 2;
  const ic = assets.icon(night ? 'night' : 'day');
  if (ic) $('w-ic').src = ic;
  const when = $('w-when');
  when.textContent = (village.day + 1) + '일째 ' + (w.partKo || '아침') + ' ';
  when.append(h('small', null, w.weatherKo || '눈'));
  const news = $('w-news');
  news.textContent = '';
  news.append(h('b', null, '솔방울 신문 '), document.createTextNode((w.news && w.news[0]) || '오늘도 평화로운 서리마을이에요.'));
  $('w-advance').textContent = village.part >= 3 ? '다음 날로' : '시간 흐르기';
}

let filter = null;
function renderLog() {
  const v = village;
  const entries = v.corpus.e.slice().sort((a, b) => b.d - a.d || b.i - a.i);
  const g = entries.filter((x) => x.k === 'g'), l = entries.filter((x) => x.k === 'l');
  const stats = $('log-stats');
  stats.textContent = '';
  const st = (n, label) => { const d = h('div', 'stat'); d.append(h('b', null, String(n)), h('span', null, label)); stats.append(d); };
  st(g.length, '퍼지는 소문');
  st(l.length, '새로 배운 대사');
  st(Math.max(1, Math.round(v.sizeBytes() / 1024)) + 'KB', '저장 크기');

  const fl = $('log-filters');
  fl.textContent = '';
  const fchip = (key, label) => {
    const b = h('button', 'fchip' + (key ? '' : ' all'));
    b.type = 'button';
    b.setAttribute('aria-pressed', String(filter === key));
    if (key) b.append(img(assets.portrait(key)));
    b.append(document.createTextNode(label));
    b.addEventListener('click', () => { filter = key; renderLog(); });
    fl.append(b);
  };
  fchip(null, '전체');
  for (const k of LAB_RESIDENTS) if (v.corpus.e.some((x) => x.o === k || (x.kn && x.kn.some((n) => n[0] === k)))) fchip(k, v.personas[k].short);

  const list = $('log-list');
  list.textContent = '';
  const shown = entries.filter((x) => !filter || x.o === filter || (x.kn && x.kn.some((n) => n[0] === filter)));
  if (!shown.length) {
    const e = h('div', 'empty');
    const ic = assets.icon('story'); if (ic) e.append(img(ic));
    e.append(document.createTextNode('아직 마을이 배운 이야기가 없어요. 주민과 수다를 떨면 여기에 쌓여요.'));
    list.append(e);
    return;
  }
  for (const x of shown.slice(0, 60)) list.append(entryCard(x));
}

function entryCard(x) {
  const v = village;
  const card = h('article', 'entry');
  const head = h('div', 'eh');
  head.append(img(assets.portrait(x.o), ''));
  const who = h('span', 'wholine');
  const p = v.personas[x.o];
  const nm = p ? p.short : '누군가';
  who.append(h('span', 'who', nm), document.createTextNode(x.k === 'g' ? ko.particle(nm, '이') + ' 시작한 소문' : '의 새 대사'));
  head.append(who);
  const tags = h('span', 'tags');
  const fresh = v.corpus.fresh(x, v.day);
  if (x.d >= v.day && !x.ex) tags.append(h('span', 'tag new', '새 이야기'));
  tags.append(h('span', 'tag' + (x.src === 'a' ? ' ai' : ''), x.src === 'a' ? 'AI 수다' : '마을 말투'));
  if (x.ex) tags.append(h('span', 'tag', '예시'));
  tags.append(h('span', 'tag', x.d === v.day ? '오늘' : x.d === v.day - 1 ? '어제' : (x.d + 1) + '일째'));
  head.append(tags);
  card.append(head);
  const q = h('q');
  q.textContent = x.k === 'g' ? v.corpus.plain(x, v.personas, v.chiefName) : v.corpus.sayLine(x, x.o, v.personas, v.level(x.o), v.chiefName);
  card.append(q);
  if (x.k === 'g') {
    const kn = (x.kn || []).filter((n) => n[0] !== x.o);
    const row = h('div', 'kn');
    if (kn.length) {
      const faces = h('span', 'faces');
      for (const n of kn.slice(0, 7)) { const f = img(assets.portrait(n[0]), ''); f.title = v.personas[n[0]] ? v.personas[n[0]].short : ''; faces.append(f); }
      row.append(faces);
      const hops = kn.map((n) => (n[2] && v.personas[n[2]] ? refName(v.personas, '__narrator__', n[2]) : '?') + '→' + (v.personas[n[0]] ? v.personas[n[0]].short : '?'));
      row.append(h('span', 'kt', kn.length + '명이 알아요 · ' + hops.slice(0, 3).join(', ') + (hops.length > 3 ? ' …' : '')));
    } else row.append(h('span', 'kt', fresh > 0 ? '아직 아무도 몰라요. 시간이 흐르면 친한 주민에게 퍼져요.' : '이제는 잊혀 가는 이야기예요.'));
    card.append(row);
  }
  return card;
}

function renderCounts() {
  const n = village.corpus.e.length;
  const el = $('log-n');
  el.textContent = String(n);
  if (n) el.removeAttribute('data-zero'); else el.setAttribute('data-zero', '');
}

function render() { renderWorld(); renderPeople(); renderCounts(); renderMode(); if (!$('view-log').hidden) renderLog(); }

// ------------------------------------------------------------------ tabs
function showTab(id) {
  const log = id === 'log';
  $('view-people').hidden = log;
  $('view-log').hidden = !log;
  $('tab-people').setAttribute('aria-selected', String(!log));
  $('tab-log').setAttribute('aria-selected', String(log));
  if (log) renderLog();
}
$('tab-people').addEventListener('click', () => showTab('people'));
$('tab-log').addEventListener('click', () => showTab('log'));
for (const t of ['tab-people', 'tab-log']) $(t).addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const other = t === 'tab-people' ? 'tab-log' : 'tab-people'; $(other).focus(); showTab(other === 'tab-log' ? 'log' : 'people'); } });

// ------------------------------------------------------------------ time
$('w-advance').addEventListener('click', () => {
  const r = village.advance();
  save();
  render();
  showSpread(r.spread || []);
});

// ------------------------------------------------------------------ "소문이 퍼졌어요"
const queue = [];
let spreadTimer = 0;
function showSpread(events) {
  for (const e of events || []) queue.push(e);
  if (!spreadTimer) nextSpread();
}
function nextSpread() {
  const box = $('spread');
  const e = queue.shift();
  if (!e) { box.hidden = true; spreadTimer = 0; return; }
  const v = village;
  const x = v.corpus.byId(e.id);
  if (!x) { nextSpread(); return; }
  box.textContent = '';
  const pair = h('span', 'pair');
  pair.append(img(assets.portrait(e.from), 'p'), img(assets.icon('rumor'), 'arrow'), img(assets.portrait(e.to), 'p'));
  const a = v.personas[e.from].short, b = v.personas[e.to].short;
  const t = h('span', 't', ko.josa(a, '이') + ' ' + b + '에게 소문을 전했어요');
  const q = h('span', 'q', '“' + v.corpus.plain(x, v.personas, v.chiefName) + '”');
  const close = h('button', 'x', '×');
  close.type = 'button';
  close.setAttribute('aria-label', '닫기');
  close.addEventListener('click', () => { clearTimeout(spreadTimer); queue.length = 0; box.hidden = true; spreadTimer = 0; });
  box.append(pair, t, close, q);
  box.hidden = false;
  if (!reduce()) { box.classList.remove('show'); void box.offsetWidth; box.classList.add('show'); }
  spreadTimer = setTimeout(nextSpread, 4200);
}

// ------------------------------------------------------------------ reset (in-page confirm; no confirm())
function askReset() {
  const box = $('reset-box');
  box.textContent = '';
  box.append(h('span', null, '모든 기억과 소문을 지울까요?'));
  const yes = h('button', 'btn', '지우기'); yes.type = 'button'; yes.id = 'reset-yes';
  const no = h('button', 'btn ghost', '그대로 두기'); no.type = 'button'; no.id = 'reset-no';
  yes.addEventListener('click', async () => {
    try { localStorage.removeItem(STORE); } catch (e) { /* */ }
    if (panel.isOpen) panel.close(true);
    village = await seed(new ChatVillage({ roster: LAB_RESIDENTS, seed: 11 }));
    engine.village = village; engine.rng = village.rng; panel.village = village;
    engine.sessions = Object.create(null); engine.created = Object.create(null); engine.streak = Object.create(null);
    save(); restoreReset(); render();
  });
  no.addEventListener('click', restoreReset);
  box.append(yes, no);
  yes.focus();
}
function restoreReset() {
  const box = $('reset-box');
  box.textContent = '';
  const b = h('button', 'btn ghost', '마을 처음부터 다시'); b.type = 'button'; b.id = 'reset';
  b.addEventListener('click', askReset);
  box.append(b);
}
$('reset').addEventListener('click', askReset);

// ------------------------------------------------------------------ start
(async () => {
  const brand = assets.icon('rumor');
  if (brand) $('brand-ic').append(img(brand, ''));
  if (fresh) { await seed(village); save(); }
  render();
  connectAI();
  if (typeof window !== 'undefined') window.__lab = { get village() { return village; }, engine, panel, save, render };
})();
