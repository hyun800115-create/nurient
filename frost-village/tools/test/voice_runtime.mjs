// 눈꽃말 voices — Node tests for src/voice (determinism, sequencing, prosody, keywords, concurrency,
// queue / priority / distance / ducking / volume, manifest consistency, no allocations per frame).
//   node --expose-gc tools/test/voice_runtime.mjs        (exit code 0 = all pass)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VillageVoice, VOICE_TYPES, EMOTIONS, moodOf, keywordsOf, textLength, voiceFor, speakerId } from '../../src/voice/VillageVoice.js';
import { WORDS } from '../../src/voice/lexicon.js';
import { CAST } from '../../src/voice/cast.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAN = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/voice/manifest.json'), 'utf8'));

export class FakeBackend {
  constructor(keys) { this.t = 0; this.plays = []; this.bus = []; this.chg = []; this.keys = new Set(keys); this.record = true; }
  now() { return this.t; }
  has(k) { return this.keys.has(k); }
  play(key, off, dur, when, rate, gain, ch) { const h = { key, off, dur, when, rate, gain, ch, stop: null, made: this.t }; if (this.record) this.plays.push(h); return h; }
  stop(h, when) { if (h) h.stop = when; }
  setChannelGain(ch, g, r) { this.chg.push([this.t, ch, g, r]); }
  setBusGain(g, r) { this.bus.push([this.t, g, r]); this.busG = g; }
}

const keys = Object.keys(MAN.audio);
const mk = (o = {}) => { const b = new FakeBackend(keys); return { b, vv: new VillageVoice(Object.assign({ manifest: MAN, backend: b }, o)) }; };
const run = (vv, b, secs, dt = 1 / 60, each) => { for (let t = 0; t < secs; t += dt) { b.t += dt; vv.update(dt); if (each) each(); } };

const LINES = ['안녕하세요 촌장님!', '오늘 정말 춥다…', '생선 사러 갈래?', '고마워요!', '흥, 시끄러워.', 'ㅋㅋㅋ 너무 웃겨', '배고파 ㅠㅠ',
  '우와! 눈사람이다!', '빵 냄새가 정말 좋아요', '콩이랑 같이 놀자!', '오늘도 열심히 일해야지', '내일 기차 타고 읍내 갈 거야', '어디 가세요?',
  '눈이 펑펑 와요', '이 생선 얼마예요?', '아이고, 깜빡했네', '맛있는 빵 사세요~', '촌장님 덕분에 마을이 따뜻해졌어요. 정말 고마워요!',
  '음…', '야호! 신난다!!', '왜 그래?', '친구야 같이 가자', '할머니, 안녕히 주무세요', 'Hello?', '🙂', '', 'ㅠㅠ', '좋아!'];
const SPEAKERS = [{ key: 'npc_kid_boy' }, { key: 'npc_kid_girl' }, { key: 'npc_aunt' }, { key: 'npc_uncle' }, { key: 'npc_grandma' },
  { key: 'npc_grandpa' }, 'chief', { key: 'npc_herbalist' }, { key: 'npc_toddler' }, { key: 'npc_young_man' }, { id: 17, kind: 'student' }, { id: 4, kind: 'elder' }];

let pass = 0, fail = 0;
const out = [];
function test(name, fn) {
  try { const r = fn(); out.push(`PASS ${name}${r ? '  ' + r : ''}`); pass++; } catch (e) { out.push(`FAIL ${name}: ${e.message}`); fail++; }
}
function ok(c, msg) { if (!c) throw new Error(msg || 'assertion failed'); }
const mean = (a) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);

// ---------------------------------------------------------------- data
test('manifest: 10 voice sprites, every marker inside its sprite, no overlaps', () => {
  ok(VOICE_TYPES.length === 10, 'voice types');
  for (const t of VOICE_TYPES) {
    const k = 'voice_' + t, a = MAN.audio[k];
    ok(a && a.voiceType === t, k + ' missing');
    const ms = Object.entries(a.markers).sort((x, y) => x[1].start - y[1].start);
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i][1];
      ok(m.start >= 0 && m.start + m.dur <= a.duration + 1e-6, `${k}/${ms[i][0]} outside`);
      if (i) ok(ms[i - 1][1].start + ms[i - 1][1].dur + 0.03 <= m.start, `${k}/${ms[i][0]} overlaps / gap < 30 ms`);
    }
  }
  return `${keys.length} sprites`;
});

test('manifest: every voice has the same core words, 3 fillers, 3 particles and all 10 emotes', () => {
  const words = (t) => Object.entries(MAN.audio['voice_' + t].markers).filter(([, m]) => m.kind === 'word').map(([id]) => id);
  let core = words(VOICE_TYPES[0]);
  for (const t of VOICE_TYPES) core = core.filter((w) => words(t).includes(w));
  ok(core.length >= 16, 'core words shared by all voices: ' + core.length);
  for (const t of VOICE_TYPES) {
    const M = MAN.audio['voice_' + t].markers;
    const kinds = (k) => Object.values(M).filter((m) => m.kind === k).length;
    ok(kinds('filler') === 3 && kinds('particle') === 3, t + ' fillers/particles');
    for (const e of EMOTIONS) ok(M['emo_' + e] && M['emo_' + e].emote === e, `${t} emote ${e}`);
    for (const id in M) if (M[id].kind !== 'emote') ok(WORDS[id], `${t}/${id} not in lexicon.js`);
  }
  return `${core.length} shared words`;
});

test('clip durations: words 0.1-0.9 s (median 0.15-0.6), emotes 0.15-1.4 s', () => {
  const w = [], e = [];
  for (const k of keys) for (const m of Object.values(MAN.audio[k].markers)) (m.kind === 'emote' ? e : w).push(m.dur);
  w.sort((a, b) => a - b);
  ok(w[0] >= 0.1 && w[w.length - 1] <= 0.9, `word range ${w[0]}..${w[w.length - 1]}`);
  const med = w[w.length >> 1];
  ok(med >= 0.15 && med <= 0.6, 'median ' + med);
  ok(Math.min(...e) >= 0.15 && Math.max(...e) <= 1.4, `emote range ${Math.min(...e)}..${Math.max(...e)}`);
  return `words ${w[0].toFixed(2)}..${w[w.length - 1].toFixed(2)} (median ${med.toFixed(2)}), emotes ${Math.min(...e).toFixed(2)}..${Math.max(...e).toFixed(2)}`;
});

test('cast: every CAST key maps to a voice type; pets are silent; roles fall back sensibly', () => {
  for (const k in CAST) ok(VOICE_TYPES.includes(CAST[k]), k);
  ok(voiceFor({ key: 'pet_dog', role: 'pet' }) === null, 'pet');
  ok(['kid_boy', 'kid_girl'].includes(voiceFor({ id: 3, kind: 'student' })), 'student');
  ok(['elder_m', 'elder_f'].includes(voiceFor({ id: 3, kind: 'elder' })), 'elder');
  ok(voiceFor('chief') === 'chief' && voiceFor({ key: 'npc_toddler' }) === 'squeaky', 'direct');
  // a TownSim body: shared doll key, the citizen decides (and is the id)
  const body = { key: 'tf:elder_slim', c: { id: 41, kind: 'elder' }, x: 0, y: 0 };
  ok(['elder_m', 'elder_f'].includes(voiceFor(body)) && speakerId(body) === 'c41', 'town body ' + voiceFor(body) + ' ' + speakerId(body));
});

// ---------------------------------------------------------------- planning
test('determinism: same (text, speaker) -> identical plan, across instances', () => {
  const a = mk().vv, b = mk().vv;
  let n = 0;
  for (const t of LINES) for (const s of SPEAKERS) {
    const p1 = JSON.stringify(a.plan(t, s)), p2 = JSON.stringify(b.plan(t, s)), p3 = JSON.stringify(a.plan(t, s));
    ok(p1 === p2 && p1 === p3, `plan differs for ${t} / ${speakerId(s)}`);
    n++;
  }
  return n + ' pairs';
});

test('variety: different lines / different residents of one voice type sound different', () => {
  const { vv } = mk();
  const sayings = new Set(LINES.map((t) => JSON.stringify(vv.plan(t, { key: 'npc_aunt' }))));
  ok(sayings.size >= LINES.length - 2, 'distinct lines ' + sayings.size);
  // two adult_f residents: same words may happen, but the register differs
  let diff = 0, tot = 0;
  for (let i = 0; i < 40; i++) {
    const p = vv.plan('오늘 날씨 좋네요', { id: i, kind: 'adult', voice: 'adult_f' }), q = vv.plan('오늘 날씨 좋네요', { id: i + 100, kind: 'adult', voice: 'adult_f' });
    tot++; if (Math.abs(p.items[0].rate - q.items[0].rate) > 0.01 || p.say !== q.say) diff++;
  }
  ok(diff / tot > 0.85, `only ${diff}/${tot} differ`);
  return `${sayings.size}/${LINES.length} distinct lines, ${diff}/${tot} resident pairs differ`;
});

test('length: longer text -> longer babble, capped at maxDur (+ end emote / particle)', () => {
  const { vv } = mk();
  const short = [], mid = [], long = [];
  const base = '바람이 불어서 눈이 날리고 우리는 모두 따뜻한 집으로 돌아가서 수프를 먹었어요 그리고 이야기를 했어요';
  for (const s of SPEAKERS) {
    short.push(vv.plan(base.slice(0, 4), s).duration);
    mid.push(vv.plan(base.slice(0, 14), s).duration);
    long.push(vv.plan(base, s).duration);
  }
  ok(mean(short) < mean(mid) && mean(mid) < mean(long), `means ${mean(short)} ${mean(mid)} ${mean(long)}`);
  let worst = 0;
  for (const t of LINES.concat([base + base + base])) for (const s of SPEAKERS) { const p = vv.plan(t, s); if (p) worst = Math.max(worst, p.duration); }
  ok(worst <= vv.maxDur + 1.0, 'worst ' + worst);
  ok(mean(long) <= vv.maxDur + 0.4, 'long mean ' + mean(long));
  return `mean ${mean(short).toFixed(2)} / ${mean(mid).toFixed(2)} / ${mean(long).toFixed(2)} s, worst ${worst.toFixed(2)} s`;
});

test('prosody: questions end rising (녹? / 응?), sad lower+slower than neutral, excited higher+faster', () => {
  const { vv } = mk();
  let qEnd = 0, qRise = 0, n = 0;
  for (let i = 0; i < 60; i++) {
    const p = vv.plan(['어디 가?', '이거 뭐야?', '같이 갈래?', '생선 있어요?'][i % 4], { id: i, kind: 'adult' });
    n++;
    const last = p.items[p.items.length - 1];
    if (last.id === 'q' || last.id === 'emo_question') qEnd++;
    const words = p.items.filter((x) => x.kind === 'word');
    if (words.length < 2 || words[words.length - 1].rate >= words[0].rate - 0.005) qRise++;
  }
  ok(qEnd === n, `question endings ${qEnd}/${n}`);
  ok(qRise / n >= 0.8, `rising ${qRise}/${n}`);
  const rates = (mood) => { const r = [], g = []; for (let i = 0; i < 40; i++) { const p = vv.plan('오늘은 그냥 그런 하루였어요', { id: i, kind: 'adult' }, { emotion: mood, emote: 0 }); for (const it of p.items) r.push(it.rate); for (let k = 1; k < p.items.length; k++) g.push(p.items[k].at - (p.items[k - 1].at + p.items[k - 1].dur / p.items[k - 1].rate)); } return [mean(r), mean(g)]; };
  const [rs, gs] = rates('sad'), [rn, gn] = rates(undefined), [re, ge] = rates('excited');
  ok(rs < rn && rn < re, `rates sad ${rs} neutral ${rn} excited ${re}`);
  ok(gs > gn && gn > ge, `gaps sad ${gs} neutral ${gn} excited ${ge}`);
  return `rate sad ${rs.toFixed(3)} < ${rn.toFixed(3)} < ${re.toFixed(3)}, gap ${gs.toFixed(3)} > ${gn.toFixed(3)} > ${ge.toFixed(3)} s`;
});

test('keywords: Korean words map to their 눈꽃말 words, in text order', () => {
  const { vv } = mk();
  const has = (t, s, ids, o) => { const p = vv.plan(t, s, o); const got = p.items.map((x) => x.id); let at = -1; for (const id of ids) { const i = got.indexOf(id); ok(i > at, `${t}: ${id} missing/out of order in ${got}`); at = i; } };
  has('생선이랑 빵 주세요', { key: 'npc_aunt' }, ['fish', 'bread'], { emote: 0 });
  has('촌장님 고마워요', { key: 'npc_grandpa' }, ['chief'], {});
  has('눈이 와서 추워요', 'chief', ['snow', 'cold'], { emote: 0 });
  const k = keywordsOf('물고기랑 물');
  ok(k[0].id === 'fish' && k[1].id === 'water', 'longest keyword wins: ' + JSON.stringify(k));
  const t = vv.plan('고마워요!', 'chief');
  ok(t.items.some((x) => x.id === 'emo_thanks' || x.id === 'thanks'), 'thanks said');
});

test('moods: punctuation and words pick the mood', () => {
  const m = (t) => moodOf(t).mood;
  ok(m('어디 가?') === 'question' && m('야호!') === 'excited' && m('흑흑 슬퍼') === 'sad' && m('ㅋㅋㅋ') === 'laugh', 'basic');
  ok(m('흥, 몰라') === 'grumpy' && m('고마워') === 'thanks' && m('맛있다') === 'yummy' && m('앗 실수') === 'oops', 'more');
  ok(m('우와 크다') === 'surprise' && m('안녕!') === 'greet' && m('그냥 그래') === 'neutral', 'rest');
  ok(textLength('안녕 abc 12') === 2 + 1 + 1, 'textLength');
});

test('emotes: every emotion plays its one-shot (start: greet/surprise/oops/grumpy, else end)', () => {
  const { vv } = mk();
  for (const e of EMOTIONS) {
    const p = vv.plan('오늘 하루도 즐겁게 보내요', { key: 'npc_kid_girl' }, { emotion: e });
    const i = p.items.findIndex((x) => x.id === 'emo_' + e);
    ok(i >= 0, e + ' missing');
    const start = ['greet', 'surprise', 'oops', 'grumpy'].includes(e);
    ok(start ? i === 0 : i === p.items.length - 1, `${e} at ${i}/${p.items.length}`);
  }
});

test('bubble hook: emote icons set the mood, the tap line name is not spoken, pets stay quiet', () => {
  const { vv } = mk();
  const r = { key: 'npc_kid_girl', role: 'kid' };
  const u = vv.speakBubble('하린\n같이 놀래?', r, 'emote_laugh');
  ok(u && u.mood === 'laugh', 'mood from icon');
  const p1 = vv.plan('같이 놀래?', r), p2 = vv.plan('하린\n같이 놀래?'.slice(3), r);
  ok(JSON.stringify(p1) === JSON.stringify(p2), 'name line stripped');
  ok(vv.speakBubble('멍!', { key: 'pet_dog', role: 'pet' }, null) === null, 'pet');
});

test('robust input: empty / emoji / latin / null / very long text never throw', () => {
  const { vv } = mk();
  for (const t of ['', '🙂🙂', 'Hello there?', null, undefined, 'ㅋ'.repeat(500), '가'.repeat(2000)]) vv.plan(t, 'kid_boy');
  ok(vv.plan('안녕', { key: 'pet_dog', role: 'pet' }) === null, 'pets are silent');
});

// ---------------------------------------------------------------- playing
test('sequencing: clips reach the audio clock in order, at t0 + at, never more than 0.12 s early', () => {
  const { vv, b } = mk();
  const u = vv.speak('촌장님 오늘 생선 많이 잡았어요!', { key: 'npc_uncle' });
  ok(u, 'spoken');
  const plan = vv.plan('촌장님 오늘 생선 많이 잡았어요!', { key: 'npc_uncle' });
  const t0 = b.t + 0.03;
  run(vv, b, 4, 1 / 60);
  ok(b.plays.length === plan.items.length, `played ${b.plays.length}/${plan.items.length}`);
  for (let i = 0; i < b.plays.length; i++) {
    const p = b.plays[i], it = plan.items[i];
    ok(Math.abs(p.when - (t0 + it.at)) < 2e-4, `item ${i} when ${p.when} vs ${t0 + it.at}`);
    ok(p.when - p.made <= 0.12 + 1e-9, `item ${i} scheduled ${p.when - p.made} s early`);
    ok(Math.abs(p.rate - it.rate) < 1e-3, 'rate');
    if (i) ok(p.when >= b.plays[i - 1].when + b.plays[i - 1].dur / b.plays[i - 1].rate - 2e-4, 'overlap within an utterance');
  }
  ok(vv.activeCount === 0, 'finished');
  return `${b.plays.length} clips`;
});

test('concurrency: never more than 2 lines at once; extra lines wait (<=3) or drop; waiting lines start later', () => {
  const { vv, b } = mk();
  for (let i = 0; i < 5; i++) vv.speak(LINES[i], SPEAKERS[i]);
  ok(vv.activeCount === 2 && vv.pendingCount === 3, `active ${vv.activeCount} pending ${vv.pendingCount}`);
  // a sixth line: the oldest waiting line makes room (the newest bubble is the one on screen)
  const first = vv.pending[0];
  ok(vv.speak(LINES[6], SPEAKERS[6]) && vv.stats.dropped === 1 && vv.pendingCount === 3 && !vv.pending.includes(first), 'oldest waiting dropped');
  let maxActive = 0;
  run(vv, b, 8, 1 / 60, () => { maxActive = Math.max(maxActive, vv.activeCount); });
  ok(maxActive <= 2, 'max active ' + maxActive);
  ok(vv.stats.spoken + vv.stats.expired === 5, `spoken ${vv.stats.spoken} expired ${vv.stats.expired}`);
  ok(vv.stats.spoken >= 3, 'waiting lines started later: ' + vv.stats.spoken);
  // a long random chatter session: count utterances overlapping in time via the recorded clips
  const s2 = mk({ maxWait: 1.0 });
  let worst = 0;
  for (let k = 0; k < 600; k++) {
    if (k % 7 === 0) s2.vv.speak(LINES[k % LINES.length], SPEAKERS[k % SPEAKERS.length]);
    run(s2.vv, s2.b, 0.1, 1 / 30);
    worst = Math.max(worst, s2.vv.activeCount);
  }
  const ends = {};
  for (const p of s2.b.plays) { const e = p.stop !== null ? Math.min(p.stop, p.when + p.dur / p.rate) : p.when + p.dur / p.rate; ends[p.ch] = ends[p.ch] || []; ends[p.ch].push([p.when, e]); }
  let overlap = 0;
  const ev = [];
  for (const ch in ends) { const iv = ends[ch]; ev.push([iv[0][0], 0]); for (const x of iv) ev.push([x[1], 0]); }
  const times = s2.b.plays.map((p) => p.when + 0.001);
  for (const t of times) { let n = 0; for (const p of s2.b.plays) { const e = p.stop !== null ? Math.min(p.stop, p.when + p.dur / p.rate) : p.when + p.dur / p.rate; if (p.when <= t && t < e) n++; } overlap = Math.max(overlap, n); }
  ok(worst <= 2 && overlap <= 2, `active ${worst}, overlapping clips ${overlap}`);
  return `stats ${JSON.stringify(s2.vv.stats)}; max simultaneous clips ${overlap}`;
});

test('queue: a waiting line older than maxWait is dropped', () => {
  const { vv, b } = mk({ maxWait: 0.5 });
  const long = '촌장님 오늘 생선 많이 잡았어요 빵도 많이 구웠고 마을이 정말 따뜻해졌어요';
  vv.speak(long, SPEAKERS[0]); vv.speak(long, SPEAKERS[1]); vv.speak('안녕', SPEAKERS[2]);
  ok(vv.pendingCount === 1, 'one waiting');
  run(vv, b, 0.7);
  ok(vv.pendingCount === 0 && vv.stats.expired === 1, 'expired');
});

test('priority: the chief (priority 2) interrupts chatter instead of waiting', () => {
  const { vv, b } = mk();
  vv.speak(LINES[0], SPEAKERS[0]); vv.speak(LINES[1], SPEAKERS[1]);
  run(vv, b, 0.2);
  const u = vv.speak('고마워요 여러분!', 'chief', { priority: 2 });
  ok(u && u.state === 'playing' && vv.stats.preempted === 1, 'preempted');
  ok(b.plays.some((p) => p.stop !== null), 'old clips stopped');
  ok(vv.activeCount === 2, 'still two');
});

test('one voice per speaker: a new bubble replaces what the same resident was saying', () => {
  const { vv, b } = mk();
  const r = { key: 'npc_kid_boy', x: 0, y: 0 };
  vv.speak('하나 둘 셋 넷 다섯 여섯 일곱', r);
  run(vv, b, 0.2);
  vv.speak('야호!', r);
  ok(vv.activeCount === 1 && vv.isSpeaking(r), 'one line');
});

test('distance hook: far speakers are not voiced; walking away stops the line', () => {
  let far = false;
  const { vv, b } = mk({ distance: (x) => (far || x > 1000 ? 0 : x > 500 ? 0.5 : 1) });
  ok(vv.speak('안녕', { key: 'npc_aunt', x: 2000, y: 0 }) === null, 'far -> null');
  const sp = { key: 'npc_aunt', x: 600, y: 0 };
  const u = vv.speak('촌장님 오늘 생선 많이 잡았어요 빵도 많이 구웠어요', sp);
  ok(u && b.chg.some(([, , g]) => Math.abs(g - 0.5) < 1e-9), 'half gain near the edge');
  run(vv, b, 0.3);
  far = true;
  run(vv, b, 1.0);
  ok(vv.activeCount === 0, 'stopped after walking away');
});

test('ducking + volume: duck() lowers the bus fast and restores it; volume 0 silences', () => {
  const { vv, b } = mk();
  const base = b.busG;
  ok(Math.abs(base - 0.4) < 1e-9, 'base gain 0.4 x volume 1: ' + base);
  vv.duck(0.3, 0.5);
  ok(Math.abs(b.busG - 0.12) < 1e-9 && b.bus[b.bus.length - 1][2] <= 0.05, 'ducked fast');
  run(vv, b, 0.6);
  ok(Math.abs(b.busG - 0.4) < 1e-9, 'restored ' + b.busG);
  vv.setVolume(0.5);
  ok(Math.abs(b.busG - 0.2) < 1e-9, 'volume');
  vv.setVolume(0);
  ok(vv.speak('안녕', 'kid_boy') === null, 'muted');
  vv.setVolume(1); vv.setEnabled(false);
  ok(vv.speak('안녕', 'kid_boy') === null, 'disabled');
});

test('not loaded yet: lines for a sprite that is not decoded are skipped quietly', () => {
  const b = new FakeBackend(keys.filter((k) => k !== 'voice_elder_m'));
  const vv = new VillageVoice({ manifest: MAN, backend: b });
  ok(vv.speak('안녕', { key: 'npc_grandpa' }) === null && vv.speak('안녕', { key: 'npc_grandma' }), 'only loaded voices');
});

test('no allocations per frame: 300k update() calls with 2 active lines + distance hook', () => {
  if (typeof global.gc !== 'function') return 'skipped (run with node --expose-gc)';
  const { vv, b } = mk({ distance: () => 1 });
  b.record = false;
  const long = '촌장님 오늘 생선 많이 잡았어요 빵도 많이 구웠어요 마을이 따뜻해요';
  vv.speak(long, { key: 'npc_uncle', x: 1, y: 1 }); vv.speak(long, { key: 'npc_aunt', x: 2, y: 2 });
  const N = 300000, dt = 1 / 60;
  const frames = () => { for (let i = 0; i < N; i++) vv.update(dt); };
  const empty = () => { let s = 0; for (let i = 0; i < N; i++) s += dt; return s; };
  const grow = (fn) => { global.gc(); const h0 = process.memoryUsage().heapUsed; fn(); return process.memoryUsage().heapUsed - h0; };
  for (let k = 0; k < 2; k++) { grow(frames); grow(empty); }          // warm up the JIT
  const g = Math.min(grow(frames), grow(frames)), base = Math.min(grow(empty), grow(empty));
  ok(vv.activeCount === 2, 'lines still active');                    // the clock (b.t) stands still
  // a single 16-byte object per frame would add 4.8 MB; allow 0.5 MB of engine noise over the empty loop
  ok(g - base < 0.5e6, `heap grew ${(g / 1024).toFixed(0)} KB (empty loop ${(base / 1024).toFixed(0)} KB)`);
  return `heap +${(g / 1024).toFixed(0)} KB for ${N / 1000}k frames (empty loop +${(base / 1024).toFixed(0)} KB)`;
});

console.log(out.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
