// 눈꽃말 (the village language) — residents babble their bubble lines in cute village speech.
//
// speak(text, speaker, opts) turns a bubble's Korean text into a short sequence of 눈꽃말 clips from
// that speaker's voice sprite (assets/voice): deterministic per (text, speaker) — the same line always
// sounds the same — with length scaled to the text (capped), Korean keywords mapped to their 눈꽃말 words
// (고마워 -> 꼬맙뿌, 촌장 -> 촌촌님...) and meaningless babble around them, prosody from punctuation / emotion
// (rising on '?', bright on '!', lower and slower when sad), a per-resident register, legato delivery
// (the next word starts in the previous word's fading tail), a sentence-end particle and an emotive
// one-shot (뽀얄!, 히히히, 우와!, 흐잉...) at the start or end when the emotion fits.
// At most `maxVoices` (2) utterances sound at once; others wait briefly in a small queue or are dropped.
// Distance hook, ducking under important sfx, a global voice volume, pause / resume (menus pause the Game
// scene), lazy per-voice loading (ready / need), and no allocations per frame (all utterance / item
// objects are pooled; update() only walks fixed arrays).
//
// Standalone: no Phaser import. Playback goes through a backend (src/voice/webaudio.js for browsers and
// Phaser, a recording fake in tools/test/voice_runtime.mjs and tools/voice/demo.mjs):
//   backend.now() -> seconds          backend.has(key) -> bool (sprite decoded)
//   backend.play(key, offset, dur, when, rate, gain, ch) -> handle
//   backend.stop(handle, when)        backend.setChannelGain(ch, gain, rampS)   backend.setBusGain(gain, rampS)
// Integration plan: docs/build_reports/voice.md §7.

import { WORDS } from './lexicon.js';
import { VOICE_TYPES, voiceFor, speakerId, personaPitch, hashStr } from './cast.js';

export { VOICE_TYPES, voiceFor, speakerId, hashStr };
export const EMOTIONS = ['greet', 'laugh', 'surprise', 'excited', 'sad', 'grumpy', 'question', 'thanks', 'yummy', 'oops'];

const MAX_ITEMS = 12;            // clips per utterance (emote + words + particle)
const LOOKAHEAD = 0.12;          // s: clips are handed to the audio clock this far ahead
const START_LAG = 0.03;          // s: first clip starts this long after speak()
const RESYNC = 0.05;             // s: a clip handed out later than this (stalled frames, a paused scene) moves
                                 //    the rest of its line along instead of firing everything at once
const EMOTE_AT_START = { greet: 1, surprise: 1, oops: 1, grumpy: 1 };
// prosody per mood: st = semitones (playback rate, so higher is also a bit faster), gap = scale of the
// small random gap between words, pause = seconds added to every gap (sad lines drag, excited ones run
// on), decl = semitones per word (declination), jit = random semitone spread per word
const PROSODY = {
  neutral: { st: 0, gap: 1, pause: 0, decl: -0.3, jit: 0.9 },
  bright: { st: 0.6, gap: 0.85, pause: -0.004, decl: -0.15, jit: 0.9 },      // a line that only ends in '!'
  question: { st: 0.3, gap: 1, pause: 0, decl: 0.1, jit: 0.6 },
  greet: { st: 0.8, gap: 0.9, pause: 0, decl: -0.25, jit: 0.6 },
  laugh: { st: 0.8, gap: 0.85, pause: -0.003, decl: -0.2, jit: 0.7 },
  surprise: { st: 1.0, gap: 0.85, pause: -0.003, decl: -0.25, jit: 0.7 },
  excited: { st: 1.5, gap: 0.7, pause: -0.008, decl: -0.1, jit: 0.8 },
  sad: { st: -1.7, gap: 1.4, pause: 0.07, decl: -0.45, jit: 0.3 },
  grumpy: { st: -1.1, gap: 1.0, pause: 0.012, decl: -0.4, jit: 0.4 },
  thanks: { st: 0.6, gap: 0.95, pause: 0, decl: -0.25, jit: 0.5 },
  yummy: { st: 0.8, gap: 0.9, pause: 0, decl: -0.25, jit: 0.6 },
  oops: { st: 0.5, gap: 0.9, pause: 0, decl: -0.25, jit: 0.6 },
};
// gap factor per voice type (kids rattle on, elders take their time)
const TEMPO = { kid_boy: 0.8, kid_girl: 0.8, squeaky: 0.7, adult_m: 1, young_m: 0.9, adult_f: 0.9, chief: 0.9, elder_m: 1.35, elder_f: 1.3, big_gruff: 1.1, sweet: 1.15 };
// residents sharing a voice type sit on one of these registers (semitones), picked by their id
export const SPEAKER_BINS = [-2.2, -1.1, 0, 1.1, 2.2];
// how far above its recorded pitch a voice may be played (semitones): small voices stay cute, never
// piercing (clips top out near 650-700 Hz, so nothing in the game goes past ~750 Hz); down to rate 0.72
const MAX_UP = { squeaky: 1.0, kid_girl: 2.0, kid_boy: 2.5 };
const MAX_UP_DEFAULT = 4.5;
const RATE_MIN = 0.72;
// mood from the text: the earliest cue in the line wins (흥, 웃기긴 -> grumpy; 껄껄, 그래도... -> laugh)
const MOOD_RX = [
  ['laugh', /ㅋㅋ|ㅎㅎ|하하|히히|호호|헤헤|킥킥|낄낄|푸하|웃겨|웃기|깔깔|까르륵|껄껄|허허|키득/],
  ['sad', /ㅠ|ㅜ|흑흑|흐잉|힝|슬퍼|슬프|속상|외로|울고/],
  ['grumpy', /흥[!.,~]|^흥|짜증|화나|화가 나|에잇|투덜|시끄러|귀찮|차가워|가만 안 둬|^야아+[!~]/],
  ['oops', /^앗|^으앗|^이런|^어머|아이고|어이쿠|깜빡|실수/],
  ['surprise', /우와|^와+아*[!~]|헉|깜짝|세상에|대박|굉장/],
  ['thanks', /고마|고맙|감사/],
  ['yummy', /맛있|맛나|냠|꿀맛/],
  ['greet', /^안녕|반가|어서 ?와|좋은 아침/],
  ['excited', /야호|신난|신나|만세|최고|!!|좋아!/],
];
const YAHO = /야호|신나|신난|만세/;            // the 야호! one-shot is kept for lines that really cheer
const EMOTE_DUP = { greet: 'hello', thanks: 'thanks', yummy: 'yummy', surprise: 'wow', oops: 'oops' };
// bubble emote icons (assets/emotes) that tell the mood of the line
export const EMOTE_ICON = {
  emote_laugh: 'laugh', emote_anger: 'grumpy', emote_question: 'question', emote_exclaim: 'surprise', emote_sweat: 'oops',
  emote_star: 'excited', emote_sparkle: 'excited', emote_snowball: 'excited', emote_wave: 'greet',
};

// keyword table (longest first): [kw, wordId, wordStartOnly]
const KW = [];
for (const id in WORDS) for (const k of WORDS[id].kw || []) KW.push(k[0] === '^' ? [k.slice(1), id, true] : [k, id, false]);
KW.sort((a, b) => b[0].length - a[0].length);
const WORD_EDGE = ' \t\n,.!?~…·[](){}|"\'“”‘’-';

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

/** mood of a line: { mood, question, exclaim, lead (the line opens with the cue), weak (punctuation only) } */
export function moodOf(text) {
  const t = String(text || '').trim();
  const question = /[?？]\s*[~♪!]*\s*$/.test(t) || /[?？]/.test(t.slice(-3));
  const exclaim = /![\s~♪]*$/.test(t);
  let best = null, at = Infinity;
  for (const [m, rx] of MOOD_RX) {
    const hit = rx.exec(t);
    if (hit && hit.index < at) { best = m; at = hit.index; }
  }
  if (best) return { mood: best, question, exclaim, lead: at <= 1 };
  return { mood: question ? 'question' : exclaim ? 'excited' : 'neutral', question, exclaim, weak: true };
}

/** does a stop-list word (kwNot) of `id` cover the keyword hit text[at, at + len)? (선물 is not 물 water) */
function blocked(text, id, at, len) {
  const not = WORDS[id].kwNot;
  if (!not) return false;
  for (const n of not) {
    for (let p = text.indexOf(n, Math.max(0, at - n.length + 1)); p >= 0 && p <= at; p = text.indexOf(n, p + 1)) {
      if (p + n.length >= at + len) return true;
    }
  }
  return false;
}

/** 눈꽃말 words whose Korean keywords appear in the text, in text order: [{id, at}] */
export function keywordsOf(text, max = 3) {
  const found = [];
  const used = [];
  for (const [k, id, edge] of KW) {
    if (found.some((f) => f.id === id)) continue;
    // first occurrence not inside a longer keyword already taken (물고기 is fish, not water + 고기),
    // not inside a stop-list word (선물, 금방...), and at a word start when the keyword asks for it (^응)
    for (let at = text.indexOf(k); at >= 0; at = text.indexOf(k, at + 1)) {
      if (edge && at > 0 && WORD_EDGE.indexOf(text[at - 1]) < 0) continue;
      let clash = false;
      for (const u of used) if (at < u[1] && at + k.length > u[0]) { clash = true; break; }
      if (clash || blocked(text, id, at, k.length)) continue;
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
    for (let i = 0; i < MAX_ITEMS; i++) this.items.push({ id: '', kind: '', off: 0, dur: 0, at: 0, rate: 1, gain: 1, kw: false, handle: null });
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
   *       maxDur (s, 2.6), distance (fn(x, y, speaker) -> 0..1), enabled (true),
   *       loader (fn(spriteKey, voiceType): fetch + decode that voice's sprite; see need())
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
    this.loader = opts.loader || null;
    this.requested = {};                  // voice type -> 1 once its sprite was asked for
    this.voices = {};                     // type -> { key, volume, words[], babble[], fillers[], particles{}, emotes{}, m{} }
    this.pool = [];
    for (let i = 0; i < this.maxVoices + this.maxPending + 2; i++) this.pool.push(new Utterance());
    this.active = new Array(this.maxVoices).fill(null);
    this.pending = [];                    // Utterances waiting (bounded by maxPending)
    this.chans = this.maxVoices + 1;      // one spare channel so a fading line never blocks a new one
    this.chanBusy = new Array(this.chans).fill(0);
    this.uidSeq = 0;
    this.paused = false; this.pausedAt = 0;
    this.duckLevel = 1; this.duckTarget = 1; this.duckUntil = 0; this.busSent = -1;
    this.stats = { spoken: 0, queued: 0, dropped: 0, preempted: 0, expired: 0, resynced: 0, notLoaded: 0 };
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
        if (mk.kind === 'word') v.words.push(id);
        else if (mk.kind === 'babble') v.babble.push(id);
        else if (mk.kind === 'filler') v.fillers.push(id);
        else if (mk.kind === 'particle') v.particles[id] = 1;
        else if (mk.kind === 'emote') (v.emotes[mk.emote] = v.emotes[mk.emote] || []).push(id);
      }
      for (const e in v.emotes) v.emotes[e].sort();      // emo_excited, emo_excited2, emo_excited3
      if (!v.babble.length) v.babble = v.words.slice();   // an older manifest without babble words
      this.voices[a.voiceType] = v;
    }
    return this;
  }

  /** sprite keys of the given voice types (for Assets.loadFragment(scene, 'voice', { audio })) */
  keysFor(types) { return (types || VOICE_TYPES).map((t) => this.voices[t] && this.voices[t].key).filter(Boolean); }

  hasVoice(type) { return !!this.voices[type]; }

  _typeOf(who) { return typeof who === 'string' && VOICE_TYPES.indexOf(who) >= 0 ? who : voiceFor(who); }

  /**
   * Can `who` (speaker or voice type) be heard right now? (manifest merged, backend up, its sprite decoded.)
   * When not, its sprite is asked for (need) so it is ready for a later line. The game keeps its old
   * sfx_chatter for lines said while this is false.
   */
  ready(who) {
    const t = this._typeOf(who);
    const V = t && this.voices[t];
    if (!V || !this.backend) return false;
    if (this.backend.has(V.key)) return true;
    this.need(t);
    return false;
  }

  /** ask the loader for a voice type's sprite (once) */
  need(type) {
    const V = this.voices[type];
    if (!V || this.requested[type] || !this.loader) return false;
    this.requested[type] = 1;
    try { this.loader(V.key, type); } catch (e) { /* the caller's loader failed: stay silent */ }
    return true;
  }

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
    const weak = !opts.emotion && mo.weak;
    const question = opts.emotion === 'question' || mo.question;
    const P = (weak && mood === 'excited' ? PROSODY.bright : PROSODY[mood]) || PROSODY.neutral;
    const tempo = TEMPO[type] || 1;
    // per-resident register: one of five steps from the speaker id (+ persona tweak)
    const spkSt = SPEAKER_BINS[hashStr('pitch|' + sid) % SPEAKER_BINS.length] + personaPitch(sp) + (opts.pitch || 0);
    const stHi = MAX_UP[type] === undefined ? MAX_UP_DEFAULT : MAX_UP[type];
    // emote one-shot: always when asked for, often when the text shows it, never for punctuation-only moods
    let emote = null;
    const want = opts.emote !== undefined ? opts.emote : (opts.emotion ? 1 : weak ? 0 : mo.lead ? 0.92 : 0.65);
    if (mood !== 'neutral' && V.emotes[mood] && rnd() < want) emote = mood;
    if (!emote && question && opts.emote !== 0 && rnd() < 0.25 && V.emotes.question) emote = 'question';
    let emoteId = null;
    if (emote) {
      const takes = V.emotes[emote];
      // 야호! only where the line cheers; other excited lines get another take (와랄라!, 뿌룰루!)
      if (emote === 'excited' && takes.length > 1) emoteId = YAHO.test(text) ? takes[0] : takes[1 + Math.floor(rnd() * (takes.length - 1))];
      else emoteId = takes[0];
    }
    const atStart = emote && EMOTE_AT_START[emote];
    // how many words: ~1 per 2.4 syllables of Korean, 1..6
    const len = textLength(text);
    let nWords = Math.max(1, Math.min(6, Math.round(len / 2.4)));
    if (emote && nWords > 1 && len < 9) nWords--;
    // keywords first (in text order), then babble around them; an emote that says the keyword
    // (고마워 -> 꼬맙뿌!, 안녕 -> 뽀얄!) takes that word's place
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
      const filler = V.fillers.length && s > 0 && s < slots - 1 && rnd() < 0.2;
      const pool = filler ? V.fillers : V.babble;
      let id = pool[Math.floor(rnd() * pool.length)];
      for (let tries = 0; tries < 6 && (id === last || seq.indexOf(id) >= 0); tries++) id = pool[Math.floor(rnd() * pool.length)];
      seq.push(id);
      last = id;
    }
    // a short keyword now and then said twice, the village way (뉨뉨! 뮐리 뮐리)
    if (seq.length < 5 && rnd() < 0.12) {
      const i = Math.floor(rnd() * seq.length);
      if (V.m[seq[i]] && V.m[seq[i]].syl <= 2 && V.m[seq[i]].kind === 'word') seq.splice(i, 0, seq[i]);
    }
    // sentence-end particle: 뀰? for questions, 얄! now and then after '!', 뇰 (falling) after a statement
    let particle = null;
    if (question) { if (!(emote === 'question' && !atStart) && V.particles.q) particle = 'q'; }
    else if (emote && !atStart) particle = null;                   // the end emote closes the line
    else if (mo.exclaim) { if (rnd() < 0.25 && V.particles.excl) particle = 'excl'; }
    else if (rnd() < 0.4 && V.particles.end) particle = 'end';
    const statement = !question && !mo.exclaim;
    // phrase break where the text has a comma / sentence break
    const brk = text.search(/[,，…]|[.!?~]\s+\S/);
    const brkSlot = brk > 0 ? Math.max(1, Math.round((brk / text.length) * seq.length)) : -1;
    // ---- lay the clips out in time: each clip starts where the previous one's sound ends (its quiet tail
    // overlaps), plus a small gap that can be negative (legato); a real pause only at commas
    let end = 0, i = 0, full = 0, prevFin = '';
    const cap = opts.maxDur || this.maxDur;
    const rLo = RATE_MIN, rHi = Math.pow(2, stHi / 12);
    const add = (id, gap, st, gain, kw) => {
      const mk = V.m[id];
      if (!mk || u.count >= MAX_ITEMS) return false;
      const rate = Math.min(rHi, Math.max(rLo, Math.pow(2, st / 12)));
      if (prevFin === 's' && gap < 0) gap = 0;                     // keep a final stop's closure (받침)
      const it = u.items[u.count++];
      it.id = id; it.kind = mk.kind; it.off = mk.start; it.dur = mk.dur; it.rate = rate; it.gain = gain; it.kw = !!kw;
      it.at = u.count === 1 ? 0 : Math.max(0, end + gap); it.handle = null;
      end = it.at + (mk.dur - (mk.tail || 0)) / rate;
      full = Math.max(full, it.at + mk.dur / rate);
      prevFin = mk.fin || '';
      return true;
    };
    const jit = () => (rnd() - 0.5) * 2 * P.jit;
    const gapW = () => ((-0.015 + rnd() * 0.04) * P.gap + P.pause) * tempo;
    if (emote && atStart) add(emoteId, 0, spkSt + P.st * 0.5 + jit() * 0.5, 1.0);
    const reserve = (particle ? 0.3 : 0) + (emote && !atStart ? 0.6 : 0);
    for (let w = 0; w < seq.length; w++) {
      const mk = V.m[seq[w]];
      if (!mk) continue;
      const isKw = kws.some((k) => k.id === seq[w]);
      if (u.count > 0 && !isKw && end + mk.dur + reserve > cap) continue;     // over the cap: skip babble, keep keywords
      let gap = mk.kind === 'filler' ? gapW() * 0.5 : gapW();
      if (w === brkSlot) gap += (0.12 + rnd() * 0.08) * tempo;
      if (emote && atStart && w === 0) gap = (0.03 + rnd() * 0.05) * tempo;
      let st = spkSt + P.st + P.decl * i + jit();
      const lastWord = w === seq.length - 1;
      if (question && lastWord) st += 1.2;
      if (statement && lastWord) st -= 1.5;                        // the phrase-final fall
      const gain = (mk.kind === 'filler' ? 0.9 : 1) * (lastWord && statement ? 0.94 : 1) * (0.96 + rnd() * 0.08);
      if (add(seq[w], gap, st, gain, isKw)) i++;
    }
    if (particle) add(particle, (0.0 + rnd() * 0.02) * tempo, spkSt + P.st + P.decl * i * 0.5 + (particle === 'q' ? 0.6 : particle === 'end' ? -1.0 : 0.4), 0.95);
    if (emote && !atStart) add(emoteId, (0.05 + rnd() * 0.06) * tempo, spkSt + P.st * 0.5 + jit() * 0.5, 1.0);
    u.duration = full;
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
      items.push({ id: it.id, kind: it.kind, at: +it.at.toFixed(4), dur: it.dur, tail: (mk && mk.tail) || 0, rate: +it.rate.toFixed(4),
        gain: +it.gain.toFixed(3), kw: it.kw, hangul: (mk && mk.say) || (WORDS[it.id] ? WORDS[it.id].hangul : it.id) });
    }
    return { voice: u.voice, key: u.key, speaker: u.sid, mood: u.mood, duration: +u.duration.toFixed(4), items,
      say: items.map((x) => x.hangul).join(' ') };
  }

  // ------------------------------------------------------------------ playing
  /**
   * Say `text` (a bubble line) with `speaker`'s voice. Returns the utterance (pooled: read .duration /
   * .uid right away, do not keep it) or null (voice off, too far, unknown voice, not loaded yet, dropped).
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
    if (!this._plan(u, text, speaker, opts)) { this._free(u); this.stats.dropped++; return null; }
    if (!this.backend.has(u.key)) { this.need(u.voice); this._free(u); this.stats.notLoaded++; return null; }
    u.uid = ++this.uidSeq; u.speaker = speaker && typeof speaker === 'object' ? speaker : null;
    u.priority = pri; u.gain = opts.volume === undefined ? 1 : opts.volume; u.dist = dist;
    u.x = x === undefined ? NaN : x; u.y = y === undefined ? NaN : y;
    const now = this.backend.now();
    const slot = this.paused ? -1 : this._freeSlot(now);
    if (slot >= 0) { this._start(u, slot, now); return u; }
    // busy: a more important line takes the place of the least important one
    let low = -1;
    if (!this.paused) {
      for (let i = 0; i < this.maxVoices; i++) {
        const a = this.active[i];
        if (a && a.priority < pri && (low < 0 || a.priority < this.active[low].priority)) low = i;
      }
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
      let when = u.t0 + it.at;
      if (when > now + LOOKAHEAD) break;
      if (now - when > RESYNC) {                // frames stalled / the scene was paused: carry on from here
        u.t0 += now - when; when = now; this.stats.resynced++;
      }
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

  /**
   * The game paused (a menu paused the Game scene; the audio clock keeps running): clips already handed
   * to the clock but not started yet are taken back, the word being said finishes, and every line
   * continues where it stopped on resume(). Waiting lines wait for the resume too.
   */
  pause() {
    if (this.paused || !this.backend) return;
    const now = this.backend.now();
    this.paused = true; this.pausedAt = now;
    for (let s = 0; s < this.maxVoices; s++) {
      const u = this.active[s];
      if (!u) continue;
      for (let i = u.next - 1; i >= 0; i--) {
        const it = u.items[i];
        if (u.t0 + it.at <= now) break;           // already sounding: let the word finish
        if (it.handle !== null) this.backend.stop(it.handle, now);
        it.handle = null;
        u.next = i;
      }
    }
  }

  resume() {
    if (!this.paused || !this.backend) return;
    const d = this.backend.now() - this.pausedAt;
    this.paused = false;
    for (let s = 0; s < this.maxVoices; s++) if (this.active[s]) this.active[s].t0 += d;
    for (let i = 0; i < this.pending.length; i++) this.pending[i].queuedAt += d;
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
    if (!this.backend || this.paused) return;
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
