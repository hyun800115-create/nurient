#!/usr/bin/env node
// Korean story samples for the designer (docs/story_samples.md).
//
//   node tools/story/samples.mjs [--seed 7] [--days 30] [--residents 250] [--out docs/story_samples.md]
//   (also: node tools/story/sim.mjs … --samples)
//
// Runs one town for N days with every line in Korean, listens to the event bus, and picks:
// 40 conversations between different pairs (with what each of them remembered at that moment),
// 5 rumour chains (who told whom, and how the story changed on the way), 3 newspaper front pages,
// a fire-and-rebuild story, a theft-chase-arrest-apology story, a love story and one resident's
// 30-day diary. Everything here comes from the engine as the game would see it — nothing is hand-written
// except the headings and the short explanations.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { StoryEngine } from './src/engine.js';
import { Metrics } from './src/metrics.js';
import { CHIEF } from './src/dialogue.js';
import { findMem, SRC_NEWS, SRC_TOLD } from './src/memory.js';
import { ageOf, groupOf, G_KID, G_TEEN, G_ADULT, G_ELDER } from './src/people.js';
import { pairKey } from './src/relations.js';
import { JOBS } from './data/places.js';
import { ITEMS } from './data/items.js';
import { FIRE_CAUSES } from './data/facts.js';
import { TRAIT_FLAGS, TRAIT_LABEL, AX } from './data/traits.js';
import { josa } from './lang/josa.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const STAGE_KO = ['모르는 사이', '아는 사이', '친구', '단짝', '연인', '약혼', '부부'];
const SRC_KO = ['직접 봄', '직접 겪음', '들음', '신문에서 읽음', '물어봐서 앎'];
const X_KO = ['', '조금 부풀려 기억', '꽤 부풀려 기억', '엄청 부풀려 기억'];
const KIND_KO = {
  meet: '첫 만남', friend: '친구가 됨', bestfriend: '단짝이 됨', crush: '짝사랑', sweetheart: '연애 시작', confess_no: '고백 거절', engaged: '약혼', wedding: '결혼식',
  baby: '아기 탄생', grow: '훌쩍 자람', first_job: '첫 직장', retire: '은퇴', farewell: '작별', memorial: '추모식', move_in: '이사 옴', move_plan: '이사 계획',
  move_out: '이사 감', move_within: '집 옮김', shop_plan: '가게 차릴 계획', shop_open: '새 가게 개업', new_job: '새 일자리', big_buy: '큰 물건 삼', deposit: '저금',
  loan: '은행 대출', loan_paid: '대출 다 갚음', bank_help: '은행이 대출을 늦춰 줌', theft: '좀도둑 사건', chase: '추격전', arrest: '도둑 붙잡힘', apology: '사과',
  wanted: '현상수배', tip: '주민 제보', queue_jump: '새치기', window: '눈덩이에 깨진 유리창', scuffle: '티격태격 다툼', reconcile: '화해', fire: '화재',
  fire_out: '불을 끔', ruin: '불탄 건물', cat_rescue: '고양이 구조', demolish: '철거', rebuilt: '다시 지음', housewarming: '집들이', chief: '촌장님 소식',
  pet: '강아지 소동', train: '기차 소식', weather: '날씨 소식', snowman: '큰 눈사람', concert: '작은 음악회', delivery: '물류센터 대량 입고', price: '물건값 변동',
  lost_found: '잃어버린 물건 찾음', prank: '장난', gift: '선물', help: '도와줌', slip: '빙판 꽈당', bigcatch: '월척', burnt_food: '음식 태움', outing: '나들이', sale: '할인 행사',
};
const TOPIC_KO = {
  greet: '인사', bye: '작별 인사', intro: '첫인사', small: '수다', rumor: '소문', ask: '질문', congrats: '축하', comfort: '위로', romance: '연애', quarrel: '말다툼',
  reconcile: '화해', invite: '약속 잡기', joke: '농담', recall: '추억', own: '내 소식', personal: '내 소식', shout: '외침', chief: '촌장님께',
};

function arg(args, k, d) { const i = args.indexOf('--' + k); return i >= 0 && i + 1 < args.length && !args[i + 1].startsWith('--') ? args[i + 1] : d; }

export function buildSamples(opts = {}) {
  const seed = opts.seed ?? 7, days = opts.days ?? 30, residents = opts.residents ?? 250;
  const e = new StoryEngine({ seed, population: residents, lang: 'ko', textMode: 'all', metrics: new Metrics() });
  const D = e.dialogue, W = e.world;

  // ------------------------------------------------------------ helpers
  const P = (id) => e.people[id];
  const nm = (id) => (id === CHIEF ? '촌장님' : id >= 0 && P(id) ? e.name(id, 'ko') : '누군가');
  const jobKo = (r) => {
    const g = groupOf(e, r);
    if (g === 0) return '아기';
    if (g <= G_KID) return ageOf(e, r) < 7 ? '유치원생' : r.job === 'student' ? '초등학생' : '어린이';
    if (r.job === 'student' || (g === G_TEEN && (r.job === 'none' || !JOBS[r.job]))) return '학생';
    if (r.job === 'retired') return '은퇴';
    if (r.job === 'none' || !JOBS[r.job]) return g === G_ELDER ? '은퇴' : '구직 중';
    return JOBS[r.job].ko;
  };
  const traits = (r) => { const out = []; for (const [flag, ax, op, v] of TRAIT_FLAGS) { const x = r.tr[AX[ax]]; if (op === '>' ? x > v : x < v) out.push(TRAIT_LABEL[flag][0]); } return out.slice(0, 2); };
  const who = (id) => { const r = P(id); if (!r) return nm(id); const t = traits(r); return `${nm(id)}(${ageOf(e, r)}살·${jobKo(r)}${t.length ? '·' + t.join('·') : ''})`; };
  const whoShort = (id) => { const r = P(id); return r ? `${nm(id)}(${ageOf(e, r)}살·${jobKo(r)})` : nm(id); };
  // up to n tellings spread over time, each saying something different
  const spread = (list, n) => {
    const out = [], shown = new Set(), core = (t) => t.replace(/[^가-힣]/g, '').slice(0, 6);   // the same opening words = the same line again
    const step = Math.max(1, Math.floor(list.length / n));
    for (let k = 0; k < list.length && out.length < n; k += step) {
      let j = k;
      while (j < list.length && shown.has(core(list[j].text))) j++;
      if (j >= list.length) break;
      shown.add(core(list[j].text)); out.push(list[j]);
      k = j;
    }
    return out;
  };
  const clockKo = (sec) => {
    const L = e.cfg.dayLength, d = Math.floor(sec / L), m = Math.floor(((sec - d * L) * 1440) / L), h = Math.floor(m / 60), mm = String(m % 60).padStart(2, '0');
    const part = h < 6 ? '새벽' : h < 12 ? '오전' : h < 18 ? '오후' : '저녁';
    return `${d + 1}일째 ${part} ${h > 12 ? h - 12 : h}:${mm}`;
  };
  const placeKo = (idx) => (idx >= 0 && W.places[idx] ? W.nameOf(W.places[idx], 'ko') : '어딘가');
  const mkB = (f) => ({ w: -1, to: -1, r: '', f, x: 0, d: 0, alt: -1, src: SRC_NEWS, from: -1, o: -1, p: -1, i: -1, h: -1, n: 0, s: '', fl: [] });
  const ko = D.grammar('ko');
  const press = (rule, f) => {
    if (!ko.has(rule)) return '';
    D.press = true;
    try { return D.written(rule, 'ko', { b: mkB(f), sp: e.alive[0] }); } finally { D.press = false; }
  };
  /** what really happened (headline style), for memory notes */
  const factKo = (f) => {
    if (!f) return '';
    const head = press('news.head.' + f.k, f);
    if (head) return head;
    const A = f.a >= 0 && P(f.a) ? nm(f.a) : '누군가', Bn = f.b >= 0 && P(f.b) ? nm(f.b) : '누군가';
    const I = f.i >= 0 && ITEMS[f.i] ? ITEMS[f.i].ko : '', Pl = f.p >= 0 ? placeKo(f.p) : '';
    const j = (w, x) => josa(w, x);
    const S = {
      big_buy: () => `${j(A, '이')} ${Pl ? Pl + '에서 ' : ''}${j(I || '큰 물건', '을')} 샀다`,
      help: () => `${j(A, '이')} ${j(Bn, '을')} 도와주었다`,
      prank: () => `${j(A, '이')} ${Bn}에게 장난을 쳤다`,
      gift: () => `${j(A, '이')} ${Bn}에게 ${j(I || '선물', '을')} 주었다`,
      slip: () => `${j(A, '이')} ${Pl ? Pl + '에서 ' : ''}꽈당 미끄러졌다`,
      burnt_food: () => `${j(A, '이')} ${j(I || '음식', '을')} 태웠다`,
      outing: () => `${j(A, '과')} ${j(Bn, '이')} ${Pl ? Pl + '에 ' : ''}놀러 갔다`,
      meet: () => `${j(A, '과')} ${j(Bn, '이')} 처음 만났다`,
      friend: () => `${j(A, '과')} ${j(Bn, '이')} 친구가 됐다`,
      bestfriend: () => `${j(A, '과')} ${j(Bn, '이')} 단짝이 됐다`,
      crush: () => `${j(A, '이')} ${j(Bn, '을')} 몰래 좋아한다`,
      confess_no: () => `${j(A, '이')} ${Bn}에게 고백했지만 친구로 지내기로 했다`,
      move_plan: () => `${A}네 가족이 곧 이사를 간다`,
      move_within: () => `${A}네 가족이 ${Pl ? Pl + '(으)로 ' : '새 집으로 '}옮겼다`.replace('(으)로', ''),
      shop_plan: () => `${j(A, '이')} 가게를 차리고 싶어 한다`,
      deposit: () => `${j(A, '이')} 은행에 저금했다`,
      bank_help: () => `은행이 ${A}의 대출 상환을 늦춰 주었다`,
      chase: () => `경찰이 ${j(A, '을')} 쫓아갔다`,
    };
    if (S[f.k]) return S[f.k]();
    const bits = [KIND_KO[f.k] || f.k];
    const ppl = [f.a, f.b].filter((x) => x >= 0 && P(x)).map(nm);
    if (ppl.length) bits.push(ppl.join('·'));
    if (f.i >= 0 && ITEMS[f.i]) bits.push(ITEMS[f.i].ko);
    if (f.p >= 0) bits.push(placeKo(f.p));
    return bits.join(' — ');
  };
  const memKo = (m) => {
    if (!m) return '모름';
    const bits = [];
    if (m.src === 2) bits.push(`${nm(m.from)}에게서 들음${m.h > 1 ? ` (${m.h}다리 건너 온 이야기)` : ''}`);
    else bits.push(SRC_KO[m.src] || '앎');
    if (m.x > 0) bits.push(X_KO[Math.min(3, m.x)]);
    if (m.d === 1) bits.push(m.alt >= 0 ? `장소를 ‘${placeKo(m.alt)}’${josa(placeKo(m.alt), '으로').slice(placeKo(m.alt).length)} 잘못 앎` : '어디서 있었는지는 모름');
    if (m.d === 2) bits.push(m.alt >= 0 && ITEMS[m.alt] ? `물건을 ‘${ITEMS[m.alt].ko}’${josa(ITEMS[m.alt].ko, '으로').slice(ITEMS[m.alt].ko.length)} 잘못 앎` : '무엇이었는지 헷갈림');
    if (m.d === 3) bits.push('누가 그랬는지는 모름');
    if (m.d === 4) bits.push('숫자를 부풀려 앎');
    if (m.lt) bits.push('오래 기억할 일');
    return bits.join(', ');
  };
  const snapMem = (r, f) => { const m = r ? findMem(r, f) : null; return m ? { src: m.src, from: m.from, h: m.h, x: m.x, d: m.d, alt: m.alt, lt: m.lt, s: m.s } : null; };

  // ------------------------------------------------------------ listen
  const talks = [], shouts = [], tellings = new Map(), relEv = [], incEv = [], buildEv = [], bankEv = [], lifeEv = [], moveEv = [], papers = [], wantedEv = [];
  const lastStage = new Map();     // pair -> stage after their last talk
  const descAt = new Map();        // fact id -> description written on the day it was first talked about
  const bodyAt = new Map();        // fact id -> the paper-style account, written then too
  const facts = new Map();
  const diaries = new Map();      // id -> [[day, lines]]
  e.on('fact', (f) => { facts.set(f.id, f); });
  e.on('relation', (x) => { lastStage.set(pairKey(x.a, x.b), lastStage.has(pairKey(x.a, x.b)) ? lastStage.get(pairKey(x.a, x.b)) : Math.max(0, x.stage - 1)); });
  e.on('relation', (x) => relEv.push(Object.assign({ t: e.now }, x)));
  e.on('incident', (x) => incEv.push(Object.assign({ t: e.now, lc: x.culprit >= 0 ? who(x.culprit) : '', lv: x.victim >= 0 ? who(x.victim) : '', pn: x.place ? placeKo(W.byId[x.place].idx) : '', bn: x.building ? placeKo(W.byId[x.building].idx) : '' }, x)));
  e.on('build', (x) => buildEv.push(Object.assign({ t: e.now }, x)));
  e.on('bank', (x) => { if (x.op !== 'deposit') bankEv.push(Object.assign({ t: e.now }, x)); });
  e.on('life', (x) => lifeEv.push(Object.assign({ t: e.now, la: x.a >= 0 && P(x.a) ? who(x.a) : '', lb: x.b >= 0 && P(x.b) ? who(x.b) : '' }, x)));
  e.on('move', (x) => moveEv.push(Object.assign({ t: e.now }, x)));
  e.on('wanted', (x) => wantedEv.push(Object.assign({ t: e.now }, x)));
  e.on('news', (x) => { if (x.text) papers.push({ day: x.day, text: x.text, head: x.paper.head, items: x.paper.items.slice() }); });
  e.on('talk', (t) => {
    if (!t.lines) return;
    const lines = t.lines.map((l) => ({ who: l.who, to: l.to, text: l.text, rule: l.rule, topic: l.topic }));
    const rec = { id: t.id, t: t.start, place: t.placeIdx, pn: '', a: t.a, b: t.b, topics: (t.topics || []).slice(), lines, mems: [], stage: -1, talks: 0 };
    if (t.shout) { rec.pn = placeKo(t.placeIdx); shouts.push(rec); return; }
    const rel = e.relationship(t.a, t.b);
    rec.stage = STAGE_KO.indexOf(({ stranger: '모르는 사이', acquaintance: '아는 사이', friend: '친구', 'best friend': '단짝', sweetheart: '연인', engaged: '약혼', spouse: '부부' })[rel.stage]);
    const pkey = pairKey(t.a, t.b);
    rec.before = lastStage.has(pkey) ? lastStage.get(pkey) : (rec.topics.includes('intro') ? 0 : rec.stage);
    lastStage.set(pkey, rec.stage);
    rec.talks = rel.talks || 0;
    rec.family = rel.family;
    rec.la = whoShort(t.a); rec.lb = whoShort(t.b); rec.pn = placeKo(t.placeIdx); rec.ga = groupOf(e, P(t.a)); rec.gb = groupOf(e, P(t.b));
    const used = new Set();
    for (const b of t.beats) {
      if (!b.f) continue;
      const key = b.f.id;
      if (!used.has(key)) {
        used.add(key);
        if (!descAt.has(key)) { descAt.set(key, factKo(b.f)); bodyAt.set(key, press('news.body.' + b.f.k, b.f)); }
        rec.mems.push({ f: b.f, desc: descAt.get(key), topic: b.topic, a: snapMem(P(t.a), b.f), b: snapMem(P(t.b), b.f) });
      }
      if (b.r === 'rumor.' + b.f.k) {
        let text = '';
        for (const l of lines) if (l.who === b.w && l.rule === b.r && !l.used) { l.used = true; text = l.text; break; }
        const sm = snapMem(P(b.w), b.f), lm = snapMem(P(b.to), b.f);
        const list = tellings.get(b.f.id) || [];
        // lf: whom the listener now credits for the story (a chain step only counts if they learnt it here)
        list.push({ t: t.start, place: t.placeIdx, pn: rec.pn, from: b.w, to: b.to, x: b.x, d: b.d, alt: b.alt, src: b.src, srcFrom: b.from, h: sm ? sm.h : 0, lf: lm && lm.src === SRC_TOLD ? lm.from : -2, text, talk: t.id });
        tellings.set(b.f.id, list);
      }
    }
    talks.push(rec);
  });

  // ------------------------------------------------------------ run (diaries written every night)
  const steps = Math.round((days * e.cfg.dayLength) / e.cfg.step);
  for (let i = 0; i < steps; i++) {
    const before = e.clock.minute;
    e.step();
    if (before < 1432 && e.clock.minute >= 1432) {
      const d = e.clock.day;
      for (const r of e.alive) {
        if (groupOf(e, r) < G_KID) continue;
        const lines = D.diary(r, d, 'ko');
        let list = diaries.get(r.id);
        if (!list) diaries.set(r.id, (list = []));
        list.push([d, lines]);
      }
    }
  }
  const summary = e.metrics.summary(e, { seed });

  // ------------------------------------------------------------ write
  const out = [];
  const w = (s = '') => out.push(s);
  const quote = (lines) => { for (const l of lines) w(`- **${nm(l.who)}**: ${l.text}`); };

  w('# 서리마을 이야기 샘플 — 주민들은 무슨 이야기를 할까?');
  w();
  w(`> 이 문서는 이야기 엔진(tools/story)이 **직접 만든** 결과입니다. 사람이 쓴 대사는 한 줄도 없어요. 주민 ${residents}명이 사는 마을을 ${days}일 동안 돌려(씨앗 번호 ${seed}) 생긴 일 중에서 골랐습니다. 같은 씨앗으로 다시 돌리면 똑같은 이야기가 나오고, 씨앗을 바꾸면 전혀 다른 마을 이야기가 펼쳐집니다.`);
  w();
  w('**이번 30일 동안 마을에서 생긴 일 (숫자)**');
  w();
  w(`- 대화 ${summary.talks.toLocaleString()}번, 말풍선 ${summary.lines.toLocaleString()}줄 — 그중 **서로 다른 문장 ${summary.uniqueLines.toLocaleString()}개**`);
  w(`- 같은 두 사람 사이에서 똑같은 문장이 다시 나온 비율: ${summary.pairRepeatRate}`);
  w(`- 소문: ${summary.gossip.tellings.toLocaleString()}번 전해짐, 큰 소식은 평균 ${summary.gossip.medianHoursTo25pct}시간(게임 시간) 만에 주민 4명 중 1명이 알게 됨, 부풀려진 횟수 ${summary.gossip.exaggerations}번, 내용이 바뀐 횟수 ${summary.gossip.distortions}번`);
  const L = summary.life, I = summary.incidents, B = summary.bank;
  w(`- 사랑과 가족: 새 연인 ${L.sweethearts}쌍, 약혼 ${L.engaged}쌍, 결혼식 ${L.weddings}번, 아기 ${L.babies}명, 이사 온 가족 ${L.movedIn}집, 떠난 가족 ${L.movedOut}집`);
  w(`- 사건(모두 귀엽게): 좀도둑 ${I.theft}번(잡힘 ${I.caught}, 현상수배 ${I.posters}), 새치기 ${I.queue}번, 눈덩이 유리창 ${I.window}번, 티격태격 ${I.scuffle}번, 화재 ${I.fire}번(작은 불 ${I.minor}, 다시 지음 ${I.rebuilt}) — 다친 사람은 0명`);
  w(`- 은행: 저금 ${B.deposits}번, 대출 ${B.loans}건(가게 ${B.byPurpose.shop || 0}·가구 ${B.byPurpose.furniture || 0}·집 ${B.byPurpose.house || 0}·재건축 ${B.byPurpose.rebuild || 0}), 다 갚은 대출 ${B.paidOff}건, 형편이 어려워 은행이 상환을 늦춰 준 경우 ${B.restructured + B.paused}번`);
  w();
  w('*참고: 이 시뮬레이션에서는 6일이 1년이에요(설정값). 그래서 30일 동안 다들 다섯 살씩 나이를 먹고, 아이들은 학교에 들어가고 어른이 되기도 해요. 이름 옆 나이는 그 장면 당시의 나이입니다.*');
  w();
  w('**읽는 법** — 대화마다 두 사람이 *그 순간* 무엇을 기억하고 있었는지 적어 두었어요. ‘직접 봄 / 직접 겪음 / 누구에게서 들음 / 신문에서 읽음’처럼 어디서 알게 됐는지, 그리고 소문이 건너오면서 **부풀려졌는지**, **장소·물건·사람이 바뀌었는지**도 함께 보여 줍니다. 말투(반말·존댓말)는 나이와 사이에 따라 자동으로 정해집니다.');
  w();

  // ------------------------------------------------------------ 1. 40 conversations
  w('---');
  w();
  w('## 1. 대화 40편 — 서로 다른 40쌍');
  w();
  const usedPairs = new Set(), usedPeople = new Map(), chosen = [];
  const stageStr = (t) => (t.before !== t.stage ? `${STAGE_KO[Math.max(0, t.before)]} → **${STAGE_KO[Math.max(0, t.stage)]}**` : STAGE_KO[Math.max(0, t.stage)]);
  const okTalk = (t) => {
    if (t.b < 0 || !P(t.a) || !P(t.b)) return false;
    if (usedPairs.has(pairKey(t.a, t.b))) return false;
    if ((usedPeople.get(t.a) || 0) >= 2 || (usedPeople.get(t.b) || 0) >= 2) return false;
    if (t.lines.length < 4 || t.lines.length > 11) return false;
    return true;
  };
  const take = (t, why) => { usedPairs.add(pairKey(t.a, t.b)); usedPeople.set(t.a, (usedPeople.get(t.a) || 0) + 1); usedPeople.set(t.b, (usedPeople.get(t.b) || 0) + 1); chosen.push([t, why]); };
  const has = (t, re) => t.topics.some((x) => re.test(x));
  // categories: [label, test, how many]
  const CATS = [
    ['처음 만난 두 사람', (t) => has(t, /^intro$/) && t.ga >= G_TEEN && t.gb >= G_TEEN, 2],
    ['처음 만난 꼬마들', (t) => has(t, /^intro$/) && t.ga === G_KID && t.gb === G_KID, 1],
    ['새로 이사 온 이웃', (t) => has(t, /^intro$/) && (P(t.a).flags & 8 || P(t.b).flags & 8), 1],
    ['도둑 소문 (전해지며 달라진)', (t) => has(t, /^rumor:(theft|arrest|wanted)$/) && t.mems.some((m) => (m.a && (m.a.x > 0 || m.a.d > 0)) || (m.b && (m.b.x > 0 || m.b.d > 0))), 2],
    ['불난 집 소문', (t) => has(t, /^rumor:(fire|fire_out|ruin|cat_rescue|rebuilt|demolish)$/), 2],
    ['결혼·아기 소문', (t) => has(t, /^rumor:(wedding|baby|engaged|sweetheart)$/), 2],
    ['새 이웃·새 가게 소문', (t) => has(t, /^rumor:(move_in|move_out|shop_open|new_job)$/), 2],
    ['동네 소소한 소문', (t) => has(t, /^rumor:(pet|snowman|slip|lost_found|bigcatch|concert|window|queue_jump|scuffle|chief|train|delivery)$/), 3],
    ['모르는 걸 물어보기', (t) => has(t, /^ask:/), 4],
    ['축하해 주기', (t) => has(t, /^congrats/), 2],
    ['위로해 주기', (t) => has(t, /^comfort/), 2],
    ['연인·부부', (t) => has(t, /^romance/) || t.stage >= 4, 3],
    ['말다툼과 화해', (t) => has(t, /^(quarrel|reconcile)/), 2, 3],
    ['함께한 추억', (t) => has(t, /^recall/), 2],
    ['놀러 가자는 약속', (t) => has(t, /^invite/), 1],
    ['농담', (t) => has(t, /^joke/), 2],
    ['내 소식 자랑', (t) => has(t, /^own/), 2],
    ['날씨·물가·촌장님·기차 수다', (t) => has(t, /^small:(weather|prices|chief|train|pet|shop|logistics|bank|snow|season)$/), 3],
    ['할머니·할아버지들의 수다', (t) => t.ga === G_ELDER && t.gb === G_ELDER, 1],
    ['어른과 아이', (t) => ((t.ga >= G_ADULT && t.gb === G_KID) || (t.gb >= G_ADULT && t.ga === G_KID)) && !t.family, 1],
  ];
  // spread over the month: walk the days in a fixed stride so samples come from early, middle and late
  for (const [label, test, n, minLines] of CATS) {
    const ok = (t) => (minLines ? t.b >= 0 && P(t.a) && P(t.b) && !usedPairs.has(pairKey(t.a, t.b)) && t.lines.length >= minLines && t.lines.length <= 12 : okTalk(t));
    const cand = talks.filter((t) => ok(t) && test(t));
    let k = 0;
    // n evenly spaced starting points over the month, each walking forward to the next usable talk
    for (let s = 0; s < n; s++) {
      const start = Math.floor(((s + 0.5) * cand.length) / n);
      for (let i = 0; i < cand.length; i++) {
        const t = cand[(start + i) % cand.length];
        if (!ok(t)) continue;
        take(t, label); k++;
        break;
      }
    }
  }
  // top up to 40 with varied talks
  for (let i = 0; chosen.length < 40 && i < talks.length; i += 97) { const t = talks[i]; if (okTalk(t) && t.lines.length >= 6) take(t, '그냥 일상'); }
  chosen.slice(0, 40).forEach(([t, why], i) => {
    w(`### ${i + 1}. ${why} — ${t.la} × ${t.lb}`);
    w();
    const st = stageStr(t);
    w(`*${clockKo(t.t)}, ${t.pn} · 사이: ${st}${t.talks > 1 ? ` (함께 나눈 대화 ${t.talks}번째)` : ''} · 주제: ${Array.from(new Set(t.topics.map((x) => TOPIC_KO[x.split(':')[0]] || x))).filter((x) => x !== '인사' && x !== '작별 인사').join(', ') || '인사'}*`);
    w();
    if (t.mems.length) {
      w('**그때 두 사람의 기억**');
      w();
      for (const m of t.mems.slice(0, 3)) {
        w(`- ${KIND_KO[m.f.k] || m.f.k} (${m.f.day + 1}일째 일) — 실제로는: “${m.desc}”`);
        const asked = m.topic && m.topic.startsWith('ask:');
        w(`  - ${nm(t.a)}: ${m.a ? memKo(m.a) : asked ? '궁금해서 물어봄' : '모름'} · ${nm(t.b)}: ${m.b ? memKo(m.b) : '모름'}`);
      }
      w();
    }
    quote(t.lines);
    w();
  });
  // the chief taps two residents
  w('### 덤: 촌장님이 주민을 톡 건드리면');
  w();
  w('촌장님(플레이어)이 주민을 누르면, 주민은 촌장님께 존댓말로 인사하고 자기가 아는 소문이나 궁금한 것을 이야기해요.');
  w();
  let chiefN = 0;
  for (const r of e.alive) {
    if (chiefN >= 3 || groupOf(e, r) < G_KID || r.id % 17 !== 3) continue;
    const t = e.talkTo(r.id, 'ko');
    if (!t || !t.lines || t.lines.length < 2) continue;
    w(`*${who(r.id)}*`);
    w();
    for (const l of t.lines) w(`- **${nm(l.who)}** → 촌장님: ${l.text}`);
    w();
    chiefN++;
  }

  // ------------------------------------------------------------ 2. rumour chains
  w('---');
  w();
  w('## 2. 소문은 이렇게 퍼져요 — 소문 사슬 5가지');
  w();
  w('한 사람이 직접 본 일이 친구에게, 그 친구의 친구에게 건너가는 길을 따라가 봤어요. 건너갈 때마다 조금씩 부풀거나, 장소·물건이 바뀌거나, 누가 그랬는지 잊히기도 합니다. (정직한 주민은 덜 부풀리고, 소문쟁이는 더 부풀려요.)');
  w();
  const chains = [];
  for (const [fid, list] of tellings) {
    list.sort((a, b) => a.t - b.t);
    // longest path: each step is told by the listener of the previous step, later in time
    let best = [];
    const dfs = (path) => {
      if (path.length > best.length || (path.length === best.length && changes(path) > changes(best))) best = path.slice();
      if (path.length >= 6) return;
      const last = path[path.length - 1];
      const seen = new Set(path.map((s) => s.from));
      for (const s of list) if (s.from === last.to && s.lf === s.from && s.t > last.t && !seen.has(s.to) && s.to !== path[0].from) { path.push(s); dfs(path); path.pop(); }
    };
    for (const s0 of list) if (s0.src <= 1 && s0.lf === s0.from) dfs([s0]);
    if (best.length >= 3) chains.push({ f: facts.get(fid) || list[0].f, fid, steps: best, told: list.length });
  }
  function changes(steps) { let c = 0; for (let i = 1; i < steps.length; i++) if (steps[i].x !== steps[i - 1].x || steps[i].d !== steps[i - 1].d) c++; return c; }
  chains.sort((a, b) => b.steps.length + changes(b.steps) * 1.5 - (a.steps.length + changes(a.steps) * 1.5) || a.fid - b.fid);
  const pickedKinds = new Set(), pickedChains = [];
  for (const c of chains) { if (pickedChains.length >= 5) break; const k = c.f ? c.f.k : '?'; if (pickedKinds.has(k)) continue; pickedKinds.add(k); pickedChains.push(c); }
  for (const c of chains) { if (pickedChains.length >= 5) break; if (!pickedChains.includes(c)) pickedChains.push(c); }
  pickedChains.forEach((c, i) => {
    const f = c.f;
    w(`### 소문 ${i + 1}. ${KIND_KO[f.k] || f.k} — “${descAt.get(c.fid) || factKo(f)}”`);
    w();
    const body = bodyAt.get(c.fid) || press('news.body.' + f.k, f);
    w(`*실제로 있었던 일 (${clockKo(f.sec)}${f.p >= 0 ? ', ' + placeKo(f.p) : ''}):* ${body || descAt.get(c.fid) || factKo(f)}`);
    w();
    w(`이 이야기는 ${days}일 동안 모두 ${c.told}번 전해졌고, 아래는 그중 한 갈래예요.`);
    w();
    c.steps.forEach((s, k) => {
      const notes = [];
      if (k === 0) notes.push(s.src === 1 ? '직접 겪은 사람' : '직접 본 사람');
      else notes.push(`${nm(s.from)}${josa(nm(s.from), '은').slice(nm(s.from).length)} 앞 사람에게서 들었어요`);
      const prev = k > 0 ? c.steps[k - 1] : null;
      if (s.x > (prev ? prev.x : 0)) notes.push(`여기서 이야기가 부풀었어요(${s.x}단계)`);
      if (s.d && (!prev || s.d !== prev.d || s.alt !== prev.alt)) {
        if (s.d === 1) notes.push(s.alt >= 0 ? `장소가 ‘${placeKo(s.alt)}’${josa(placeKo(s.alt), '으로').slice(placeKo(s.alt).length)} 바뀌었어요` : k === 0 && /^(fire|ruin)$/.test(f.k) ? '멀리서 연기만 봐서 어디인지는 몰라요' : '장소는 빠졌어요');
        if (s.d === 2) notes.push(s.alt >= 0 && ITEMS[s.alt] ? `물건이 ‘${ITEMS[s.alt].ko}’${josa(ITEMS[s.alt].ko, '으로').slice(ITEMS[s.alt].ko.length)} 바뀌었어요` : '물건이 헷갈렸어요');
        if (s.d === 3) notes.push('누가 그랬는지는 빠졌어요');
        if (s.d === 4) notes.push('숫자가 커졌어요');
      }
      w(`${k + 1}. **${nm(s.from)} → ${nm(s.to)}** (${clockKo(s.t)}, ${s.pn}) — ${notes.join(' · ')}`);
      w(`   > “${s.text}”`);
    });
    w();
  });

  // ------------------------------------------------------------ 3. newspapers
  w('---');
  w();
  w('## 3. 솔방울 신문 1면 3장');
  w();
  w('매일 아침 5시, 어제 마을에서 생긴 일이 신문으로 나와요. 신문을 읽은 주민은 그 소식을 기억했다가 이야기합니다(‘신문에서 봤어!’).');
  w();
  const scorePaper = (p) => { const k = p.head ? p.head.k : ''; return { fire: 5, ruin: 6, rebuilt: 6, wedding: 5, baby: 4, arrest: 4, theft: 3, shop_open: 4, move_in: 2 }[k] || 1; };
  const paperPick = [];
  const byHead = new Set();
  for (const p of papers.slice().sort((a, b) => scorePaper(b) - scorePaper(a) || a.day - b.day)) {
    if (paperPick.length >= 3) break;
    const k = p.head ? p.head.k : 'quiet';
    if (byHead.has(k)) continue;
    byHead.add(k); paperPick.push(p);
  }
  paperPick.sort((a, b) => a.day - b.day);
  for (const p of paperPick) {
    const x = p.text;
    w(`### ${x.masthead} — ${x.date} (제${x.no}호)`);
    w();
    w(`#### ${x.headline}`);
    w();
    w(x.lead);
    w();
    for (const a of x.articles) w(`- **${a.title}** ${a.body}`);
    w();
    for (const s of x.sidebar) w(`> ${s}  `);
    w();
    if (x.byline) w(`*${x.byline}*`);
    w();
  }

  // ------------------------------------------------------------ 4. fire and rebuild
  w('---');
  w();
  w('## 4. 불이 나고, 다시 짓기까지');
  w();
  const fires = incEv.filter((x) => x.kind === 'fire');
  const fireIds = Array.from(new Set(fires.map((x) => x.id)));
  const ruinFire = fireIds.find((id) => fires.some((x) => x.id === id && x.phase === 'ruin')) ?? fireIds[0];
  if (ruinFire !== undefined) {
    const evs = fires.filter((x) => x.id === ruinFire);
    const bId = evs[0].building, bPlace = W.byId[bId];
    const owner = evs[0].victim;
    const t0 = evs[0].t, tEnd = (evs.find((x) => x.phase === 'done') || evs[evs.length - 1]).t + 1;
    w(`**${evs[0].bn}** · 주인 ${owner >= 0 ? evs[0].lv : '없음'} · 불이 난 까닭: ${(FIRE_CAUSES.find((c) => c[0] === evs[0].cause) || [0, '알 수 없음'])[1]}`);
    w();
    w('아무도 다치지 않아요. 안에 있던 사람은 모두 빠져나오고, 소방관이 불을 끄면 구경하던 주민들이 박수를 칩니다.');
    w();
    const PH = { smoke: '연기가 피어오름 — 안에 있던 사람들이 밖으로 대피', dispatch: '신고 접수! 소방차 출동 (사이렌)', spray: '소방관들이 호스로 물을 뿌림', ruin: '불은 꺼졌지만 건물이 타 버림 — 가족은 친구네에서 지내기로', demolish: '굴착기·덤프트럭이 와서 불탄 건물 철거', construct: '공사장 울타리 — 새 건물을 짓는 중', done: '완성!', repair: '그을음 청소와 수리' };
    const timeline = [];
    for (const x of evs) timeline.push([x.t, `${PH[x.phase] || x.phase}${x.crew && x.crew.length && (x.phase === 'dispatch' || x.phase === 'spray') ? ` (소방관 ${x.crew.map(nm).join('·')})` : ''}`]);
    for (const x of buildEv) if (x.place === bId && x.t >= t0 && x.t <= tEnd + e.cfg.dayLength) timeline.push([x.t, `[건물] ${({ ruin: '불탄 건물로 바뀜', demolish: '철거 시작', construct: '다시 짓기 시작', done: x.level > 1 ? `새 건물 완성 — 전보다 한 단계 좋아짐(레벨 ${x.level})` : '새 건물 완성', scorched: '그을림', repaired: '수리 끝' })[x.op] || x.op}`]);
    for (const x of bankEv) if ((x.op === 'insurance' && x.place === bId) || (x.op === 'loan' && x.purpose === 'rebuild' && x.who === owner)) timeline.push([x.t, x.op === 'insurance' ? `[은행] 화재 보험금 ${x.amount}코인 지급` : `[은행] ${nm(x.who)}에게 재건축 대출 ${x.amount}코인 (하루 ${x.inst}코인씩 ${x.term}일)`]);
    const tOut = (evs.find((x) => x.phase === 'ruin' || x.phase === 'repair' || x.phase === 'out') || { t: t0 + e.cfg.dayLength }).t;   // later cries belong to another fire
    for (const s of shouts) if (s.t >= t0 && s.t <= tOut && s.topics.some((tp) => /fire|cheer/.test(tp) || /shout\.(fire|firefighter|cheer_fire)/.test(s.lines[0].rule))) if (/shout\.(fire|firefighter|cheer_fire)/.test(s.lines[0].rule)) timeline.push([s.t, `[외침] ${nm(s.lines[0].who)}: “${s.lines[0].text}”`]);
    timeline.sort((a, b) => a[0] - b[0]);
    for (const [t, s] of timeline) w(`- ${clockKo(t)} — ${s}`);
    w();
    // what people said about it
    const fireFacts = new Set();
    for (const f of facts.values()) if (f.p === bPlace.idx && f.sec >= t0 && f.sec <= tEnd + e.cfg.dayLength && /^(fire|fire_out|ruin|demolish|rebuilt|cat_rescue)$/.test(f.k)) fireFacts.add(f.id);
    const said = [];
    for (const fid of fireFacts) for (const s of tellings.get(fid) || []) said.push(s);
    said.sort((a, b) => a.t - b.t);
    if (said.length) {
      w(`**마을 사람들은 이렇게 이야기했어요** (모두 ${said.length}번 중 일부)`);
      w();
      for (const s of spread(said, 8)) w(`- ${clockKo(s.t)} ${nm(s.from)} → ${nm(s.to)}: “${s.text}”`);
      w();
    }
    const fp = papers.filter((p) => [p.head].concat(p.items).some((f) => f && fireFacts.has(f.id)));
    if (fp.length) {
      w('**신문 제목**');
      w();
      for (const p of fp) {
        const arts = [{ title: p.text.headline, f: p.head }].concat(p.text.articles.map((a, k) => ({ title: a.title, f: p.items[k] })));
        for (const a of arts) if (a.f && fireFacts.has(a.f.id)) w(`- ${p.text.date}: 「${a.title}」`);
      }
      w();
    }
    if (owner >= 0 && diaries.has(owner)) {
      const dd = diaries.get(owner).filter(([d]) => d >= Math.floor(t0 / e.cfg.dayLength) && d <= Math.floor(tEnd / e.cfg.dayLength) + 1);
      if (dd.length) {
        w(`**${nm(owner)}의 일기**`);
        w();
        for (const [d, lines] of dd) w(`- *${d + 1}일째* — ${lines.join(' ')}`);
        w();
      }
    }
  } else w('(이번 30일 동안은 큰불이 나지 않았어요.)');

  // ------------------------------------------------------------ 5. theft -> chase -> arrest -> apology
  w('---');
  w();
  w('## 5. 좀도둑 → 추격전 → 체포 → 사과');
  w();
  const thefts = incEv.filter((x) => x.kind === 'theft');
  const tIds = Array.from(new Set(thefts.map((x) => x.id)));
  const caughtId = tIds.find((id) => thefts.some((x) => x.id === id && x.phase === 'release')) ?? tIds.find((id) => thefts.some((x) => x.id === id && x.phase === 'arrest')) ?? tIds[0];
  if (caughtId !== undefined) {
    const evs = thefts.filter((x) => x.id === caughtId);
    const x0 = evs[0];
    w(`**${x0.pn}** · 슬쩍한 사람 ${x0.lc} · 가게 주인 ${x0.victim >= 0 ? x0.lv : '없음'} · 물건: ${(ITEMS.find((it) => it.id === x0.item) || { ko: x0.item }).ko}`);
    w();
    w('도둑질은 빵·생선·쿠키 같은 작은 것뿐이에요. 경찰은 호루라기를 불며 쫓아가고, 붙잡힌 사람은 경찰서에서 따뜻한 코코아를 마시며 반성한 뒤 사과하고 풀려나요.');
    w();
    const PH = { tipped: '이웃의 제보(또는 스스로 자수) — 아침에 경찰 출동', act: '슬쩍! 물건을 들고 가게를 나섬', chase: '경찰 출동 — 호루라기 삐익! 눈밭 추격전', arrest: '붙잡힘 (손을 뒤로)', station: '경찰서에서 반성의 시간', release: '사과하고 풀려남', wanted: '놓쳤다! 광장 게시판에 현상수배 포스터', done: '사건 끝' };
    const tl = [];
    for (const x of evs) tl.push([x.t, `${PH[x.phase] || x.phase}${x.officers && x.officers.length && (x.phase === 'chase' || x.phase === 'arrest') ? ` (${x.officers.map(nm).join('·')})` : ''}`]);
    const t0 = x0.t, tLast = evs[evs.length - 1].t, tEnd = tLast + e.cfg.dayLength;
    // officers' cries only while they are on this case (the same officer may be chasing someone else later that day)
    const onCase = [];
    for (let i = 0; i < evs.length; i++) if (evs[i].phase === 'chase' || evs[i].phase === 'tipped') { const end = evs.slice(i + 1).find((x) => x.phase === 'arrest' || x.phase === 'wanted'); onCase.push([evs[i].t, end ? end.t : tLast]); }
    const isCop = (id) => evs.some((x) => (x.officers || []).includes(id)) && id !== x0.culprit && id !== x0.victim;
    for (const s of shouts) if (s.t >= t0 && s.t <= tLast && (s.a === x0.culprit || s.a === x0.victim || isCop(s.a)) && (!isCop(s.a) || onCase.some(([a, b]) => s.t >= a && s.t <= b)) && /^shout\./.test(s.lines[0].rule) && !/fight|scuffle|separate|fire|cheer|queue|window|stop/.test(s.lines[0].rule)) tl.push([s.t, `[외침] ${nm(s.lines[0].who)}: “${s.lines[0].text}”`]);
    tl.sort((a, b) => a[0] - b[0]);
    for (const [t, s] of tl) w(`- ${clockKo(t)} — ${s}`);
    w();
    const tf = new Set();
    for (const f of facts.values()) if (f.sec >= t0 - 2 && f.sec <= tEnd && (f.a === x0.culprit || f.b === x0.culprit) && /^(theft|arrest|apology|wanted|tip|chase)$/.test(f.k)) tf.add(f.id);
    const said = [];
    for (const fid of tf) for (const s of tellings.get(fid) || []) said.push(s);
    said.sort((a, b) => a.t - b.t);
    if (said.length) {
      w(`**소문은 이렇게 돌았어요** (모두 ${said.length}번 중 일부)`);
      w();
      for (const s of spread(said, 8)) w(`- ${clockKo(s.t)} ${nm(s.from)} → ${nm(s.to)}: “${s.text}”`);
      w();
    }
    const tp = papers.filter((p) => [p.head].concat(p.items).some((f) => f && tf.has(f.id)));
    if (tp.length) {
      w('**신문 제목**');
      w();
      for (const p of tp) {
        const arts = [{ title: p.text.headline, f: p.head }].concat(p.text.articles.map((a, k) => ({ title: a.title, f: p.items[k] })));
        for (const a of arts) if (a.f && tf.has(a.f.id)) w(`- ${p.text.date}: 「${a.title}」`);
      }
      w();
    }
    for (const id of [x0.culprit, x0.victim]) {
      if (id < 0 || !diaries.has(id)) continue;
      const dd = diaries.get(id).filter(([d]) => d >= Math.floor(t0 / e.cfg.dayLength) && d <= Math.floor(tEnd / e.cfg.dayLength));
      if (!dd.length) continue;
      w(`**${nm(id)}의 일기**`);
      w();
      for (const [d, lines] of dd) w(`- *${d + 1}일째* — ${lines.join(' ')}`);
      w();
    }
  }

  // ------------------------------------------------------------ 6. love story
  w('---');
  w();
  w('## 6. 사랑 이야기');
  w();
  const sweet = lifeEv.filter((x) => x.op === 'sweetheart');
  const wed = lifeEv.filter((x) => x.op === 'wedding');
  const eng = lifeEv.filter((x) => x.op === 'engaged');
  const pk = (x) => pairKey(x.a, x.b);
  let couple = sweet.find((s) => wed.some((x) => pk(x) === pk(s))) || sweet.find((s) => eng.some((x) => pk(x) === pk(s))) || wed[0] || sweet[0];
  if (couple) {
    const A = couple.a, Bb = couple.b, key = pk(couple);
    w(`**${couple.la || who(A)}** 와 **${couple.lb || who(Bb)}**`);
    w();
    const marks = [];
    for (const x of relEv) if (pairKey(x.a, x.b) === key) marks.push([x.t, `사이가 ‘${STAGE_KO[x.stage]}’${josa(STAGE_KO[x.stage], '으로').slice(STAGE_KO[x.stage].length)} 바뀜`]);
    for (const x of lifeEv) if ((x.a === A && x.b === Bb) || (x.a === Bb && x.b === A)) marks.push([x.t, { sweetheart: '연인이 됨', engaged: `프러포즈 성공! 결혼식은 ${x.day + 1}일째`, wedding: `결혼식 (하객 ${(x.guests || []).length}명)`, baby: '아기 탄생' }[x.op] || x.op]);
    marks.sort((a, b) => a[0] - b[0]);
    for (const [t, s] of marks) w(`- ${clockKo(t)} — ${s}`);
    w();
    const theirs = talks.filter((t) => pairKey(t.a, t.b) === key && t.b >= 0);
    // early, the turning point and the later talks (romance first)
    const rom = theirs.filter((t) => has(t, /^romance/));
    const pick = [];
    const add = (t) => { if (t && !pick.includes(t)) pick.push(t); };
    add(theirs[0]);
    for (const t of rom) { if (pick.length >= 5) break; add(t); }
    add(theirs[Math.floor(theirs.length / 2)]);
    add(theirs[theirs.length - 1]);
    pick.sort((a, b) => a.t - b.t);
    w(`두 사람은 30일 동안 ${theirs.length}번 이야기를 나눴어요. 그중 몇 장면:`);
    w();
    for (const t of pick.slice(0, 7)) {
      w(`**${clockKo(t.t)}, ${t.pn}** (사이: ${stageStr(t)})`);
      w();
      quote(t.lines);
      w();
    }
    const others = talks.filter((t) => pairKey(t.a, t.b) !== key && t.mems.some((m) => /^(sweetheart|engaged|wedding)$/.test(m.f.k) && ((m.f.a === A && m.f.b === Bb) || (m.f.a === Bb && m.f.b === A))));
    if (others.length) {
      w('**동네 사람들의 반응**');
      w();
      const step = Math.max(1, Math.floor(others.length / 5));
      for (let k = 0, shown = 0; k < others.length && shown < 5; k += step, shown++) {
        const t = others[k];
        const lines = t.lines.filter((l) => /^(rumor|congrats|own):(sweetheart|engaged|wedding)$/.test(l.topic || ''));
        if (!lines.length) continue;
        w(`*${clockKo(t.t)}, ${t.pn} — ${t.la} × ${t.lb}*`);
        w();
        quote(lines.slice(0, 4));
        w();
      }
    }
  }

  // ------------------------------------------------------------ 7. one resident's 30-day diary
  w('---');
  w();
  w('## 7. 한 주민의 30일 일기');
  w();
  let bestId = -1, bestScore = -1;
  for (const [id, list] of diaries) {
    if (list.length < days - 1) continue;
    const r = P(id);
    if (!r || groupOf(e, r) < G_TEEN) continue;
    const distinct = new Set();
    for (const [, lines] of list) for (const l of lines.slice(1, -1)) distinct.add(l);
    const big = list.filter(([, lines]) => lines.length >= 4).length;
    const sc = distinct.size + big * 2;
    if (sc > bestScore) { bestScore = sc; bestId = id; }
  }
  if (bestId >= 0) {
    const r = P(bestId);
    w(`**${who(bestId)}** (나이·직업은 30일째 기준) — ${r.likes.slice(0, 2).map((li) => e.likes[li].ko).join('·')}${josa(e.likes[r.likes[1]].ko, '을').slice(e.likes[r.likes[1]].ko.length)} 좋아해요. 주민마다 하루에 겪은 일(본 일·들은 일·한 일) 중 중요한 것부터 골라 일기를 씁니다.`);
    w();
    for (const [d, lines] of diaries.get(bestId)) {
      w(`**${d + 1}일째**  `);
      w(lines.join(' '));
      w();
    }
  }
  w('---');
  w();
  w(`*만든 방법: \`node tools/story/samples.mjs --seed ${seed} --days ${days} --residents ${residents}\` (또는 \`node tools/story/sim.mjs --samples\`). 숫자와 대사는 모두 엔진이 만든 그대로입니다.*`);
  return { md: out.join('\n') + '\n', summary, engine: e };
}

async function main() {
  const args = process.argv.slice(2);
  const seed = +arg(args, 'seed', 7), days = +arg(args, 'days', 30), residents = +arg(args, 'residents', 250);
  const outPath = path.resolve(arg(args, 'out', path.join(HERE, '..', '..', 'docs', 'story_samples.md')));
  const t0 = performance.now();
  const { md } = buildSamples({ seed, days, residents });
  fs.writeFileSync(outPath, md);
  console.log(`story samples: ${outPath} (${md.length} chars, ${((performance.now() - t0) / 1000).toFixed(1)} s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
