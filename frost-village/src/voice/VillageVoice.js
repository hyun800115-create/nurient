// 눈꽃말 (the village language) — residents babble their bubble lines in cute village speech.
//
// speak(text, speaker, opts) turns a bubble's Korean text into a short sequence of 눈꽃말 clips from
// that speaker's voice sprite (assets/voice): deterministic per (text, speaker) — the same line always
// sounds the same — with length scaled to the text (capped), Korean keywords mapped to their 눈꽃말 words
// (고마워 -> 꼬맙뿌, 촌장 -> 촌촌님...), prosody from punctuation / emotion (rising on '?', excited on '!',
// lower and slower when sad), a small per-resident pitch offset, natural gaps, a sentence-end particle
// and an emotive one-shot (뽀얌!, 히히히, 우와!, 흐잉...) at the start or end when the emotion fits.
// At most `maxVoices` (2) utterances sound at once; others wait briefly in a small queue or are dropped.
// Distance hook, ducking under important sfx, a global voice volume, and no allocations per frame
// (all utterance / item objects are pooled; update() only walks fixed arrays).
//
// Standalone: no Phaser import. Playback goes through a backend (src/voice/webaudio.js for browsers and
// Phaser, a recording fake in tools/test/voice_runtime.mjs and tools/voice/demo.mjs):
//   backend.now() -> seconds          backend.has(key) -> bool (sprite decoded)
//   backend.play(key, offset, dur, when, rate, gain, ch) -> handle
//   backend.stop(handle, when)        backend.setChannelGain(ch, gain, rampS)   backend.setBusGain(gain, rampS)
// Integration plan: docs/build_reports/voice.md §Integration.

import { WORDS } from './lexicon.js';
import { VOICE_TYPES, voiceFor, speakerId, personaPitch, hashStr } from './cast.js';

export { VOICE_TYPES, voiceFor, speakerId, hashStr };
export const EMOTIONS = ['greet', 'laugh', 'surprise', 'excited', 'sad', 'grumpy', 'question', 'thanks', 'yummy', 'oops'];

const MAX_ITEMS = 12;            // clips per utterance (emote + words + particle)
const LOOKAHEAD = 0.12;          // s: clips are handed to the audio clock this far ahead
const START_LAG = 0.03;          // s: first clip starts this long after speak()
const EMOTE_AT_START = { greet: 1, surprise: 1, oops: 1, grumpy: 1 };
// prosody per mood: st = semitones (playback rate, so higher is also a bit faster), gap = pause factor,
// decl = semitones per word (declination), jit = random semitone spread per word
const PROSODY = {
  neutral: { st: 0, gap: 1, decl: -0.35, jit: 0.9 },
  question: { st: 0.3, gap: 1, decl: 0.1, jit: 0.6 },
  greet: { st: 0.8, gap: 0.9, decl: -0.3, jit: 0.6 },
  laugh: { st: 0.8, gap: 0.85, decl: -0.2, jit: 0.7 },
  surprise: { st: 1.0, gap: 0.85, decl: -0.25, jit: 0.7 },
  excited: { st: 1.6, gap: 0.7, decl: -0.15, jit: 0.8 },
  sad: { st: -1.7, gap: 1.5, decl: -0.45, jit: 0.3 },
  grumpy: { st: -1.1, gap: 0.95, decl: -0.4, jit: 0.4 },
  thanks: { st: 0.6, gap: 0.95, decl: -0.3, jit: 0.5 },
  yummy: { st: 0.8, gap: 0.9, decl: -0.3, jit: 0.6 },
  oops: { st: 0.5, gap: 0.9, decl: -0.3, jit: 0.6 },
};
// pause factor per voice type (kids rattle on, elders take their time)
const TEMPO = { kid_boy: 0.85, kid_girl: 0.85, squeaky: 0.7, adult_m: 1, adult_f: 0.95, chief: 0.9, elder_m: 1.35, elder_f: 1.3, big_gruff: 1.1, sweet: 1.15 };
// mood from the text (first match wins, in this order)
const MOOD_RX = [
  ['laugh', /ㅋㅋ|ㅎㅎ|하하|히히|호호|헤헤|킥킥|낄낄|푸하|웃겨|웃기/],
  ['sad', /ㅠ|ㅜ|흑흑|흐잉|힝|슬퍼|슬프|속상|외로|울고/],
  ['grumpy', /흥[!.]|^흥|짜증|화나|화가 나|에잇|투덜|시끄러|귀찮/],
  ['oops', /^앗|^이런|^어머|아이고|어이쿠|깜빡|실수/],
  ['surprise', /우와|^와[!~]|헉|깜짝|세상에|대박|굉장/],
  ['thanks', /고마|고맙|감사/],
  ['yummy', /맛있|맛나|냠|꿀맛/],
  ['greet', /^안녕|반가|어서 ?와|좋은 아침/],
  ['excited', /야호|신난|신나|만세|최고|!!|좋아!/],
];
const EMOTE_DUP = { greet: 'hello', thanks: 'thanks', yummy: 'yummy', surprise: 'wow' };
// bubble emote icons (assets/emotes) that tell the mood of the line
export const EMOTE_ICON = {
  emote_laugh: 'laugh', emote_anger: 'grumpy', emote_question: 'question', emote_exclaim: 'surprise', emote_sweat: 'oops',
  emote_star: 'excited', emote_sparkle: 'excited', emote_snowball: 'excited', emote_wave: 'greet',
};
// random babble only uses words with no strong meaning (a grumpy line never says 'thank you' by chance)
const BABBLE_CAT = { nature: 1, thing: 1, food: 1, action: 1, size: 1, number: 1 };
const BABBLE_ALSO = { friend: 1, baby: 1, we: 1 };
const BABBLE_NOT = { yummy: 1, hungry: 1, very: 1, cold: 1 };     // only when the text says so

// keyword table (longest first): [kw, wordId]
const KW = [];
for (const id in WORDS) for (const k of WORDS[id].kw || []) KW.push([k, id]);
KW.sort((a, b) => b[0].length - a[0].length);

function mulberry(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** syllable-ish length of a bubble text: hangul syllables + latin letters / 3 + digits / 2 */
export function textLength(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xAC00 && c <= 0xD7A3) n += 1;
    else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) n += 1 / 3;
    else if (c >= 48 && c <= 57) n += 0.5;
  }
  return n;
}

/** mood of a line: { mood, question, exclaim } */
export function moodOf(text) {
  const t = String(text || '').trim();
  const question = /[?？]\s*[~♪!]*\s*$/.test(t) || /[?？]/.test(t.slice(-3));
  const exclaim = /![\s~♪]*$/.test(t);
  for (const [m, rx] of MOOD_RX) {
    const hit = rx.exec(t);
    if (hit) return { mood: m, question, exclaim, lead: hit.index <= 1 };     // lead: the line opens with it (야호! 앗...)
  }
  return { mood: question ? 'question' : exclaim ? 'excited' : 'neutral', question, exclaim, weak: true };
}

/** 눈꽃말 words whose Korean keywords appear in the text, in text order: [{id, at}] */
export function keywordsOf(text, max = 3) {
  const found = [];
  const used = [];
  for (const [k, id] of KW) {
    if (found.some((f) => f.id === id)) continue;
    // first occurrence not inside a longer keyword already taken (물고기 is fish, not water + 고기)
    for (let at = text.indexOf(k); at >= 0; at = text.indexOf(k, at + 1)) {
      let clash = false;
      for (const u of used) if (at < u[1] && at + k.length > u[0]) { clash = true; break; }
      if (clash) continue;
      used.push([at, at + k.length]);
      found.push({ id, at });
      break;
    }
  }
  found.sort((a, b) => a.at - b.at);
  return found.slice(0, max);
}

class Utterance {
  constructor() {
    this.items = [];
    for (let i = 0; i < MAX_ITEMS; i++) this.items.push({ id: '', kind: '', off: 0, dur: 0, at: 0, rate: 1, gain: 1, handle: null });
    this.reset();
  }

  reset() {
    this.uid = 0; this.state = 'free'; this.count = 0; this.next = 0; this.duration = 0;
    this.voice = ''; this.key = ''; this.sid = ''; this.speaker = null; this.text = '';
    this.mood = 'neutral'; this.priority = 0; this.gain = 1; this.dist = 1; this.ch = -1;
    this.t0 = 0; this.queuedAt = 0; this.x = NaN; this.y = NaN; this.distT = 0; this.farT = 0;
  }
}

export class VillageVoice {
  /**
   * opts: manifest (assets/voice/manifest.json object), backend, maxVoices (2), maxPending (3),
   *       maxWait (s a queued line may wait, 1.2), baseGain (0.4 = old chatter call volume), volume (user 0..1),
   *       maxDur (s, 2.6), distance (fn(x, y, speaker) -> 0..1), enabled (true)
   */
  constructor(opts = {}) {
    this.backend = opts.backend || null;
    this.maxVoices = Math.max(1, opts.maxVoices || 2);
    this.maxPending = Math.max(0, opts.maxPending === undefined ? 3 : opts.maxPending);
    this.maxWait = opts.maxWait || 1.2;
    this.baseGain = opts.baseGain === undefined ? 0.4 : opts.baseGain;
    this.volume = opts.volume === undefined ? 1 : opts.volume;
    this.maxDur = opts.maxDur || 2.6;
    this.distance = opts.distance || null;
    this.enabled = opts.enabled !== false;
    this.voices = {};                     // type -> { key, volume, words[], fillers[], particles{}, emotes{}, m{} }
    this.pool = [];
    for (let i = 0; i < this.maxVoices + this.maxPending + 2; i++) this.pool.push(new Utterance());
    this.active = new Array(this.maxVoices).fill(null);
    this.pending = [];                    // Utterances waiting (bounded by maxPending)
    this.chans = this.maxVoices + 1;      // one spare channel so a fading line never blocks a new one
    this.chanBusy = new Array(this.chans).fill(0);
    this.uidSeq = 0;
    this.duckLevel = 1; this.duckTarget = 1; this.duckUntil = 0; this.busSent = -1;
    this.stats = { spoken: 0, queued: 0, dropped: 0, preempted: 0, expired: 0 };
    if (opts.manifest) this.setManifest(opts.manifest);
    if (this.backend) this._applyBus(this.backend.now(), true);
  }

  // ------------------------------------------------------------------ data
  setManifest(man) {
    const audio = (man && man.audio) || {};
    for (const key in audio) {
      const a = audio[key];
      if (!a || !a.markers || !a.voiceType) continue;
      const v = { key, volume: a.volume === undefined ? 1 : a.volume, words: [], babble: [], fillers: [], particles: {}, emotes: {}, m: a.markers };
      for (const id in a.markers) {
        const mk = a.markers[id];
        if (mk.kind === 'word') { v.words.push(id); const w = WORDS[id]; if (w && (BABBLE_CAT[w.cat] || BABBLE_ALSO[id]) && !BABBLE_NOT[id]) v.babble.push(id); }
        else if (mk.kind === 'filler') v.fillers.push(id);
        else if (mk.kind === 'particle') v.particles[id] = 1;
        else if (mk.kind === 'emote') v.emotes[mk.emote] = id;
      }
      this.voices[a.voiceType] = v;
    }
    return this;
  }

  /** sprite keys of the given voice types (for Assets.loadFragment(scene, 'voice', { audio })) */
  keysFor(types) { return (types || VOICE_TYPES).map((t) => this.voices[t] && this.voices[t].key).filter(Boolean); }

  hasVoice(type) { return !!this.voices[type]; }

  // ------------------------------------------------------------------ planning
  /**
   * Fill utterance `u` for (text, speaker). Deterministic: the only randomness is seeded by
   * hash(voice type | speaker id | text) (+ opts.variant).
   */
  _plan(u, text, sp, opts) {
    text = String(text || '');
    const type = opts.voice || voiceFor(sp);
    const V = type && this.voices[type];
    u.count = 0; u.next = 0; u.duration = 0;
    if (!V) return false;
    const sid = speakerId(sp);
    const rnd = mulberry(hashStr(type + '|' + sid + '|' + text + '|' + (opts.variant || 0)));
    const mo = moodOf(text);
    let mood = opts.emotion || mo.mood;
    if (EMOTIONS.indexOf(mood) < 0 && mood !== 'neutral') mood = 'neutral';
    const question = opts.emotion === 'question' || mo.question;
    const P = PROSODY[mood] || PROSODY.neutral;
    const tempo = TEMPO[type] || 1;
    // per-resident register: +-1.4 semitones from the speaker id (+ persona tweak)
    const sh = hashStr('pitch|' + sid);
    const spkSt = ((sh % 1000) / 999 - 0.5) * 2.8 + personaPitch(sp) + (opts.pitch || 0);
    // emote one-shot: always when asked for, often when the text shows it, never for plain lines
    let emote = null;
    const want = opts.emote !== undefined ? opts.emote : (opts.emotion ? 1 : mo.weak ? 0.35 : mo.lead ? 0.92 : 0.65);
    if (mood !== 'neutral' && V.emotes[mood] && rnd() < want) emote = mood;
    if (!emote && question && opts.emote !== 0 && rnd() < 0.25 && V.emotes.question) emote = 'question';
    const atStart = emote && EMOTE_AT_START[emote];
    // how many words: ~1 per 2.6 syllables of Korean, 1..6
    const len = textLength(text);
    let nWords = Math.max(1, Math.min(6, Math.round(len / 2.6)));
    if (emote && nWords > 1 && len < 9) nWords--;
    // keywords first (in text order), then babble around them; an emote that says the keyword
    // (고마워 -> 꼬맙뿌!, 안녕 -> 뽀얌!) takes that word's place
    const all = keywordsOf(text, 8);
    const kws = all.filter((k) => V.m[k.id] && V.m[k.id].kind === 'word' && EMOTE_DUP[emote] !== k.id).slice(0, 3);
    if (emote && all.length > kws.length && all.some((k) => EMOTE_DUP[emote] === k.id)) nWords = Math.max(len >= 6 ? 1 : 0, nWords - 1);
    if (opts.words !== undefined) nWords = opts.words;
    const seq = [];
    const nk = Math.min(kws.length, nWords);
    const slots = nWords;
    // place keywords at proportional positions
    const kwPos = [];
    for (let i = 0; i < nk; i++) kwPos.push(Math.min(slots - 1, Math.floor((kws[i].at / Math.max(1, text.length)) * slots + i * 0.01)));
    for (let i = 1; i < nk; i++) if (kwPos[i] <= kwPos[i - 1]) kwPos[i] = Math.min(slots - 1, kwPos[i - 1] + 1);
    let last = '';
    for (let s = 0, k = 0; s < slots; s++) {
      if (k < nk && kwPos[k] === s) { seq.push(kws[k++].id); last = seq[seq.length - 1]; continue; }
      const filler = V.fillers.length && s > 0 && s < slots - 1 && rnd() < 0.22;
      const pool = filler ? V.fillers : (V.babble.length ? V.babble : V.words);
      let id = pool[Math.floor(rnd() * pool.length)];
      for (let tries = 0; tries < 6 && (id === last || seq.indexOf(id) >= 0 || (k < nk && id === kws[k].id)); tries++) id = pool[Math.floor(rnd() * pool.length)];
      seq.push(id);
      last = id;
    }
    // a short word now and then said twice, the village way (뉨뉨! 뮐리 뮐리)
    if (seq.length < 5 && rnd() < 0.12) {
      const i = Math.floor(rnd() * seq.length);
      if (V.m[seq[i]] && V.m[seq[i]].syl <= 2 && V.m[seq[i]].kind === 'word') seq.splice(i, 0, seq[i]);
    }
    // sentence-end particle: 녹? for questions, 얍! when excited, 뇽 sometimes after a statement
    let particle = null;
    if (question && !(emote === 'question' && !atStart)) particle = V.particles.q ? 'q' : null;
    else if (mo.exclaim && (!emote || atStart) && rnd() < 0.55) particle = V.particles.excl ? 'excl' : null;
    else if (!emote && rnd() < 0.3) particle = V.particles.end ? 'end' : null;
    // phrase break where the text has a comma / sentence break
    const brk = text.search(/[,，…]|[.!?~]\s+\S/);
    const brkSlot = brk > 0 ? Math.max(1, Math.round((brk / text.length) * seq.length)) : -1;
    // ---- lay the clips out in time
    let t = 0, i = 0;
    const cap = opts.maxDur || this.maxDur;
    const add = (id, gap, st, gain) => {
      const mk = V.m[id];
      if (!mk || u.count >= MAX_ITEMS) return false;
      const rate = Math.min(1.4, Math.max(0.72, Math.pow(2, st / 12)));
      const it = u.items[u.count++];
      it.id = id; it.kind = mk.kind; it.off = mk.start; it.dur = mk.dur; it.rate = rate; it.gain = gain;
      it.at = t + gap; it.handle = null;
      t = it.at + mk.dur / rate;
      return true;
    };
    const jit = () => (rnd() - 0.5) * 2 * P.jit;
    const gapW = () => (0.05 + rnd() * 0.06) * P.gap * tempo;
    if (emote && atStart) add(V.emotes[emote], 0, spkSt + P.st * 0.5 + jit() * 0.5, 1.0);
    const reserve = (particle ? 0.3 : 0) + (emote && !atStart ? 0.7 : 0);
    for (let w = 0; w < seq.length; w++) {
      const mk = V.m[seq[w]];
      if (!mk) continue;
      const isKw = kws.some((k) => k.id === seq[w]);
      if (u.count > 0 && !isKw && t + mk.dur + reserve > cap) continue;     // over the cap: skip babble, keep keywords
      let gap = u.count === 0 ? 0 : (mk.kind === 'filler' ? gapW() * 0.55 : gapW());
      if (w === brkSlot) gap += (0.12 + rnd() * 0.08) * tempo;
      if (emote && atStart && w === 0) gap = (0.07 + rnd() * 0.06) * tempo;
      let st = spkSt + P.st + P.decl * i + jit();
      const lastWord = w === seq.length - 1;
      if (question && lastWord) st += 1.2;
      const gain = (mk.kind === 'filler' ? 0.9 : 1) * (lastWord && !question && !mo.exclaim ? 0.94 : 1) * (0.96 + rnd() * 0.08);
      if (add(seq[w], gap, st, gain)) i++;
    }
    if (particle) add(particle, (0.012 + rnd() * 0.02) * tempo, spkSt + P.st + P.decl * i * 0.5 + (particle === 'q' ? 0.6 : 0), 0.95);
    if (emote && !atStart) add(V.emotes[emote], (0.08 + rnd() * 0.07) * tempo, spkSt + P.st * 0.5 + jit() * 0.5, 1.0);
    u.duration = t;
    u.voice = type; u.key = V.key; u.sid = sid; u.mood = mood; u.text = text;
    return u.count > 0;
  }

  /** read-only description of what speak() would play (allocates: tests, previews, tools) */
  plan(text, speaker, opts = {}) {
    const u = new Utterance();
    if (!this._plan(u, text, speaker, opts)) return null;
    const items = [];
    for (let i = 0; i < u.count; i++) {
      const it = u.items[i];
      const mk = this.voices[u.voice].m[it.id];
      items.push({ id: it.id, kind: it.kind, at: +it.at.toFixed(4), dur: it.dur, rate: +it.rate.toFixed(4), gain: +it.gain.toFixed(3),
        hangul: (mk && mk.say) || (WORDS[it.id] ? WORDS[it.id].hangul : it.id) });
    }
    return { voice: u.voice, key: u.key, speaker: u.sid, mood: u.mood, duration: +u.duration.toFixed(4), items,
      say: items.map((x) => x.hangul).join(' ') };
  }

  // ------------------------------------------------------------------ playing
  /**
   * Say `text` (a bubble line) with `speaker`'s voice. Returns the utterance (pooled: read .duration /
   * .uid right away, do not keep it) or null (voice off, too far, unknown voice, dropped).
   * opts: emotion (one of EMOTIONS), emote (0..1 chance / 0 = never), volume (0..1), priority (0 chatter,
   *       1 important, 2 the chief), maxDur, x / y (else speaker.x / .y), queue (false = drop when busy),
   *       voice (override type), pitch (semitones), words (force a word count), variant (another take)
   */
  speak(text, speaker, opts = {}) {
    if (!this.enabled || !this.backend || this.volume <= 0.001) return null;
    const pri = opts.priority || 0;
    const x = opts.x !== undefined ? opts.x : speaker && typeof speaker === 'object' ? speaker.x : undefined;
    const y = opts.y !== undefined ? opts.y : speaker && typeof speaker === 'object' ? speaker.y : undefined;
    let dist = 1;
    if (this.distance && x !== undefined && y !== undefined) {
      dist = this.distance(x, y, speaker);
      if (!(dist > 0.01)) { this.stats.dropped++; return null; }
    }
    const sid = speakerId(speaker);
    this.stop(sid, true);                 // one line per speaker: a new bubble replaces the old voice
    const u = this._take(pri);
    if (!u) { this.stats.dropped++; return null; }
    if (!this._plan(u, text, speaker, opts) || !this.backend.has(u.key)) { this._free(u); this.stats.dropped++; return null; }
    u.uid = ++this.uidSeq; u.speaker = speaker && typeof speaker === 'object' ? speaker : null;
    u.priority = pri; u.gain = opts.volume === undefined ? 1 : opts.volume; u.dist = dist;
    u.x = x === undefined ? NaN : x; u.y = y === undefined ? NaN : y;
    const now = this.backend.now();
    const slot = this._freeSlot(now);
    if (slot >= 0) { this._start(u, slot, now); return u; }
    // busy: a more important line takes the place of the least important one
    let low = -1;
    for (let i = 0; i < this.maxVoices; i++) {
      const a = this.active[i];
      if (a && a.priority < pri && (low < 0 || a.priority < this.active[low].priority)) low = i;
    }
    if (low >= 0) {
      this._halt(this.active[low], now); this.stats.preempted++;
      const s2 = this._freeSlot(now);
      if (s2 >= 0) { this._start(u, s2, now); return u; }
    }
    if (opts.queue === false || this.maxPending === 0) { this._free(u); this.stats.dropped++; return null; }
    if (this.pending.length >= this.maxPending) {
      // drop the least important / oldest waiting line (or this one)
      let wi = 0;
      for (let i = 1; i < this.pending.length; i++) if (this.pending[i].priority < this.pending[wi].priority) wi = i;
      if (this.pending[wi].priority > pri) { this._free(u); this.stats.dropped++; return null; }
      this._free(this._unqueue(wi)); this.stats.dropped++;
    }
    u.state = 'pending'; u.queuedAt = now;
    this.pending.push(u); this.stats.queued++;
    return u;
  }

  /**
   * Bubbles.chat() hook: say a bubble's text, using its emote icon as a hint for the mood
   * (emote_laugh -> laugh, emote_anger -> grumpy, emote_question -> question ...). A "name\n" first line
   * (the tap line) is not spoken.
   */
  speakBubble(text, who, emoteKey, opts) {
    if (!text || !who || who.isPet || who.role === 'pet') return null;
    let t = String(text);
    const nl = t.indexOf('\n');
    if (nl >= 0 && nl < 16) t = t.slice(nl + 1);
    const emotion = emoteKey ? EMOTE_ICON[emoteKey] : undefined;
    const chief = voiceFor(who) === 'chief';                         // the player's own lines always get through
    if (!emotion && !opts && !chief) return this.speak(t, who);
    return this.speak(t, who, Object.assign(chief ? { priority: 2 } : {}, opts, emotion ? { emotion, emote: 0.8 } : null));
  }

  /** just an emotive one-shot (laugh, surprise...) in `speaker`'s voice */
  emote(speaker, emotion, opts = {}) {
    return this.speak('', speaker, Object.assign({}, opts, { emotion, emote: 1, words: 0 }));
  }

  /** remove pending[i] without allocating (splice would return a new array) */
  _unqueue(i) {
    const q = this.pending, u = q[i];
    for (let k = i; k < q.length - 1; k++) q[k] = q[k + 1];
    q.length--;
    return u;
  }

  _take() {
    for (const u of this.pool) if (u.state === 'free') { u.state = 'planning'; return u; }
    return null;
  }

  _free(u) { if (u) u.reset(); }

  _freeSlot(now) {
    for (let i = 0; i < this.maxVoices; i++) if (!this.active[i]) {
      for (let c = 0; c < this.chans; c++) if (this.chanBusy[c] <= now && !this._chanUsed(c)) return i;
      return -1;
    }
    return -1;
  }

  _chanUsed(c) { for (let i = 0; i < this.maxVoices; i++) if (this.active[i] && this.active[i].ch === c) return true; return false; }

  _start(u, slot, now) {
    let ch = 0;
    for (let c = 0; c < this.chans; c++) if (this.chanBusy[c] <= now && !this._chanUsed(c)) { ch = c; break; }
    u.ch = ch; u.state = 'playing'; u.t0 = now + START_LAG; u.next = 0; u.distT = 0; u.farT = 0;
    this.active[slot] = u;
    this.chanBusy[ch] = Infinity;
    this.backend.setChannelGain(ch, u.gain * u.dist, 0.004);
    this._applyBus(now, true);
    this._schedule(u, now);
    this.stats.spoken++;
  }

  _schedule(u, now) {
    const V = this.voices[u.voice];
    const vol = V ? V.volume : 1;
    while (u.next < u.count) {
      const it = u.items[u.next];
      const when = u.t0 + it.at;
      if (when > now + LOOKAHEAD) break;
      it.handle = this.backend.play(u.key, it.off, it.dur, when < now ? now : when, it.rate, it.gain * vol, u.ch);
      u.next++;
    }
  }

  /** stop an utterance now (short fade); its channel is free again after the fade */
  _halt(u, now) {
    if (!u || u.state !== 'playing') return;
    for (let i = 0; i < u.next; i++) if (u.items[i].handle !== null) this.backend.stop(u.items[i].handle, now + 0.05);
    this.backend.setChannelGain(u.ch, 0, 0.04);
    this.chanBusy[u.ch] = now + 0.06;
    for (let i = 0; i < this.maxVoices; i++) if (this.active[i] === u) this.active[i] = null;
    this._free(u);
  }

  _finish(slot, now) {
    const u = this.active[slot];
    this.chanBusy[u.ch] = now;
    this.active[slot] = null;
    this._free(u);
  }

  /** stop what `who` (speaker id, speaker object or utterance) is saying (or waiting to say) */
  stop(who, quiet) {
    if (!this.backend) return;
    const now = this.backend.now();
    const sid = who && who.uid !== undefined && who.items ? null : (typeof who === 'string' ? who : speakerId(who));
    for (let i = 0; i < this.maxVoices; i++) {
      const a = this.active[i];
      if (a && (a === who || (sid !== null && a.sid === sid))) this._halt(a, now);
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      if (p === who || (sid !== null && p.sid === sid)) { this._unqueue(i); this._free(p); if (!quiet) this.stats.dropped++; }
    }
  }

  stopAll() {
    if (!this.backend) return;
    const now = this.backend.now();
    for (let i = 0; i < this.maxVoices; i++) if (this.active[i]) this._halt(this.active[i], now);
    while (this.pending.length) this._free(this.pending.pop());
  }

  isSpeaking(who) {
    const sid = typeof who === 'string' ? who : speakerId(who);
    for (let i = 0; i < this.maxVoices; i++) if (this.active[i] && this.active[i].sid === sid) return true;
    return false;
  }

  get activeCount() { let n = 0; for (let i = 0; i < this.maxVoices; i++) if (this.active[i]) n++; return n; }
  get pendingCount() { return this.pending.length; }

  // ------------------------------------------------------------------ settings
  setVolume(v) { this.volume = Math.max(0, Math.min(1, +v || 0)); if (this.volume <= 0.001) this.stopAll(); this._applyBus(this.backend ? this.backend.now() : 0, true); }
  getVolume() { return this.volume; }
  setEnabled(on) { this.enabled = !!on; if (!on) this.stopAll(); }
  setDistanceModel(fn) { this.distance = fn || null; }

  /** duck the voices to `level` (0..1) for `hold` seconds (call when an important sound plays) */
  duck(level = 0.35, hold = 0.6) {
    if (!this.backend) return;
    const now = this.backend.now();
    this.duckTarget = Math.min(this.duckTarget, Math.max(0, level));
    this.duckUntil = Math.max(this.duckUntil, now + hold);
    this._applyBus(now, false);
  }

  _applyBus(now, force) {
    if (!this.backend) return;
    if (now >= this.duckUntil) this.duckTarget = 1;
    const g = this.volume * this.baseGain * this.duckTarget;
    if (!force && Math.abs(g - this.busSent) < 0.005) return;
    const ramp = g < this.busSent ? 0.03 : 0.25;          // duck fast, come back gently
    this.busSent = g;
    this.backend.setBusGain(g, ramp);
  }

  // ------------------------------------------------------------------ per frame (no allocations)
  update(dt) {
    if (!this.backend) return;
    const now = this.backend.now();
    this._applyBus(now, false);
    for (let s = 0; s < this.maxVoices; s++) {
      const u = this.active[s];
      if (!u) continue;
      this._schedule(u, now);
      // follow the speaker: distance gain (4x a second); far away for a while -> stop
      if (this.distance) {
        u.distT -= dt;
        if (u.distT <= 0) {
          u.distT = 0.25;
          const sp = u.speaker;
          const x = sp && sp.x !== undefined ? sp.x : u.x, y = sp && sp.y !== undefined ? sp.y : u.y;
          if (x === x && y === y) {
            const d = this.distance(x, y, sp);
            if (d <= 0.01) { u.farT += 0.25; if (u.farT >= 0.5) { this._halt(u, now); continue; } } else u.farT = 0;
            if (Math.abs(d - u.dist) > 0.03) { u.dist = d; this.backend.setChannelGain(u.ch, u.gain * d, 0.15); }
          }
        }
      }
      if (u.next >= u.count && now >= u.t0 + u.duration + 0.02) this._finish(s, now);
    }
    // waiting lines: drop stale ones, start the next when a voice is free
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (now - this.pending[i].queuedAt > this.maxWait) { this._free(this._unqueue(i)); this.stats.expired++; }
    }
    while (this.pending.length) {
      const slot = this._freeSlot(now);
      if (slot < 0) break;
      let bi = 0;
      for (let i = 1; i < this.pending.length; i++) if (this.pending[i].priority > this.pending[bi].priority) bi = i;
      this._start(this._unqueue(bi), slot, now);
    }
  }
}
