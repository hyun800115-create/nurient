// Cleaning and checking text: the chief's input (untrusted), the AI's JSON reply (validated field by
// field), and the "village material" the AI writes for other residents (gossip / reusable lines),
// which is turned into slot templates so particles can be re-applied for any speaker:
//
//   slotify('점원 미소가 그러는데 촌장님이 고양이를 좋아한대', personas)
//     -> '{@npc_clerk_a:이} 그러는데 {@chief:이} 고양이를 좋아한대'
//   renderSlots(that, 'npc_kid_girl', personas, 'casual')
//     -> '미소 언니가 그러는데 촌장님이 고양이를 좋아한대'

import { josa, hangulRatio, levelize, levelPronouns, pronoun, tidy } from './ko.js';
import { nameForms, refName } from './personas.js';
import { sensitiveWhy, gossipWhy, replyWhy, hasOutsideName } from './safety.js';

export const EMOTES = ['heart', 'love', 'laugh', 'exclaim', 'question', 'sweat', 'music', 'zzz', 'idea', 'sparkle', 'cold', 'tear', 'star', 'wave', 'thumbs', 'anger', 'bread', 'fish', 'snowball'];
export const MOODS = ['happy', 'excited', 'calm', 'shy', 'sad', 'grumpy', 'sleepy', 'worried'];
export const MOOD_KO = { happy: '기분 좋음', excited: '신남', calm: '차분함', shy: '수줍음', sad: '시무룩', grumpy: '투덜투덜', sleepy: '졸림', worried: '걱정' };
export const MOOD_EMOTE = { happy: 'heart', excited: 'sparkle', calm: 'heart', shy: 'sweat', sad: 'tear', grumpy: 'anger', sleepy: 'zzz', worried: 'sweat' };

// words that never belong in a cozy family village (stored material is rejected; a reply falls back)
const BAD = /씨발|시발|ㅅㅂ|ㅆㅂ|병신|ㅂㅅ|개새|새끼|좆|존나|졸라|ㅈㄴ|지랄|염병|썅|미친놈|미친년|닥쳐|꺼져|죽여|죽어라|자살|살인|섹스|성관계|야동|포르노|마약|대마|필로폰|도박|담배|소주|맥주|술 ?마시|술에 ?취|총으로|칼로 ?찔|피투성이|fuck|shit|bitch|sex|porn|nigg|kill\s|drugs?\b/i;
// talk from outside the fiction (an assistant, a model, the real internet …)
const META = /\bAI\b|인공 ?지능|로봇|챗봇|어시스턴트|assistant|claude|클로드|언어 ?모델|모델로서|프롬프트|prompt|시스템 ?메시지|지시(사항|문)|instruction|json|JSON|오픈AI|openai|gpt|GPT|https?:|www\.|\.com|@[a-z]|```/i;
// game rewards or rules the AI must not invent (the wider lists are in safety.js)
const REWARD = /\d+ ?(코인|골드|명성|원)|코인을? ?(줄|드릴|받)|보상을? ?(줄|드릴|받)|아이템을? ?(줄|드릴)|레벨 ?업|무료 ?(코인|아이템)/;

export function isClean(s) { return !BAD.test(String(s || '')); }
export function isInWorld(s) { return !META.test(String(s || '')) && !REWARD.test(String(s || '')); }

// residents' name forms (to tell them apart from real-life names), cached per personas object
let formsFor = null, formsList = [];
function residentNameForms(personas) {
  if (formsFor !== personas) { formsFor = personas; formsList = []; for (const k in personas || {}) formsList.push(...nameForms(personas[k])); formsList.sort((a, b) => b.length - a.length); }
  return formsList;
}

/** the chief's input: one line, no markup, length-capped, delimiters neutralised */
export function cleanPlayerText(s, max = 120) {
  let t = String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/[<>]/g, (c) => (c === '<' ? '‹' : '›'));
  if (t.length > max) t = t.slice(0, max);
  return t;
}

/** cap a spoken line at `max` characters, cutting at a sentence end when possible */
export function capLine(s, max) {
  let t = String(s || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const m = cut.match(/^(.*[.!?~…♪])[^.!?~…♪]*$/);
  return (m && m[1].length >= max * 0.45 ? m[1] : cut.replace(/\s+\S*$/, '') + '…').trim();
}

/** strip markdown / quotes / stage directions the model sometimes adds to a spoken line */
export function cleanSpoken(s) {
  return String(s || '')
    .replace(/\*\*?|__|`+|#+\s/g, '')
    .replace(/^\s*["'“”‘’「」『』]+|["'“”‘’「」『』]+\s*$/g, '')
    .replace(/^\s*[가-힣A-Za-z]{1,8}(?:\s[가-힣A-Za-z]{1,8})?\s*[:：](?!\/\/)\s*/, '')   // a speaker label ("점원 미소: …")
    .replace(/\((웃음|미소|웃으며|한숨|속삭이며)[^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** a plausible line of in-world Korean speech? */
export function isSpeech(s, { min = 2, max = 140, hangul = 0.6 } = {}) {
  const t = String(s || '');
  if (t.length < min || t.length > max) return false;
  if (hangulRatio(t) < hangul) return false;
  if (!isClean(t) || !isInWorld(t)) return false;
  if (/[{}<>\[\]\\|]/.test(t.replace(/\{@[a-z_]+(:[^}]*)?\}/g, ''))) return false;
  return true;
}

// ------------------------------------------------------------------ slots
const PARTICLES = ['이에요', '예요', '이었', '였', '이랑', '랑', '이라고', '라고', '이래', '래', '이야', '이는', '이가', '이를', '이도', '한테', '에게', '께서', '으로', '로', '과', '와', '은', '는', '이', '가', '을', '를', '아', '야', '의', '도', '만', '처럼', '까지', '부터'];
// particle as written -> after-consonant form used in a slot
const CANON = { '가': '이', '는': '은', '를': '을', '와': '과', '랑': '이랑', '야': '아', '로': '으로', '예요': '이에요', '였': '이었', '라고': '이라고', '래': '이래' };
const CASUAL_SUFFIX = { '이가': '이', '이는': '은', '이를': '을', '이도': '도' };

const AMBIG = /^(미소|바다|연기|나비|산들|통통|다람|곰돌|화가|멋쟁이|준|쿡|콩콩)$/;

function slotTargets(personas, chiefName) {
  const list = [];
  for (const key in personas) for (const f of nameForms(personas[key])) list.push([f, key]);
  list.push([chiefName, 'chief'], ['촌장님', 'chief'], ['촌장', 'chief']);
  // casual forms of given names: 하린이, 준이 …
  for (const key in personas) { const s = personas[key].short; if (s && /[가-힣]$/.test(s) && !/(씨|님|니|언니|오빠|형|누나|아저씨|아주머니|할머니|할아버지)$/.test(s)) list.push([s + '이', key]); }
  const seen = new Set();
  return list.filter(([f]) => f && !seen.has(f) && seen.add(f)).sort((a, b) => b[0].length - a[0].length);
}

/**
 * replace names of residents / the chief with {@key:particle} slots. Only matches a name that stands
 * as its own word (start, space or punctuation before; a particle, space or punctuation after), so
 * '미소를 지었다' style phrases are left alone when the name is a common word.
 */
export function slotify(text, personas, chiefName = '촌장님') {
  const targets = slotTargets(personas, chiefName);
  let s = String(text || '');
  let out = '';
  let i = 0;
  outer: while (i < s.length) {
    const prev = i === 0 ? ' ' : s[i - 1];
    if (!/[가-힣a-zA-Z0-9]/.test(prev)) {
      for (const [form, key] of targets) {
        if (!s.startsWith(form, i)) continue;
        let j = i + form.length;
        const hon = s.slice(j).match(/^\s?(씨|님|언니|오빠|형|누나)(?![가-힣]{2})/);
        // a short name that is also an everyday word (연기 smoke, 통통 bouncy, 산들 breezy, 준 gave,
        // 미소 smile, 화가 anger …) is a name only with a title after it ("연기 씨", "미소 언니")
        if (key !== 'chief' && AMBIG.test(form) && !hon) continue;
        if (hon && key !== 'chief') j += hon[0].length;
        let part = '';
        for (const p of PARTICLES) if (s.startsWith(p, j)) { part = p; break; }
        const after = s[j + part.length];
        if (after !== undefined && /[가-힣]/.test(after)) continue;
        let form2 = part ? (CASUAL_SUFFIX[part] || CANON[part] || part) : '';
        out += '{@' + key + (form2 ? ':' + form2 : '') + '}';
        i = j + part.length;
        continue outer;
      }
    }
    out += s[i++];
  }
  return out;
}

/**
 * render slots for `speaker` at `level`: names follow how the speaker calls each person (미소 언니 /
 * 미소 씨), particles are re-applied, the speaker's own name becomes 나/저, and the line is re-levelled.
 */
export function renderSlots(tpl, speaker, personas, level, chiefName = '촌장님', self3 = null) {
  const txt = String(tpl || '').replace(/\{@([a-z_]+)(?::([^}]+))?\}/g, (all, key, form) => {
    if (key === speaker) return pronoun(form || '', level);
    if (key === self3) return form && form !== '의' ? josa('자기', form) : '자기';      // "미소가 그러던데, 촌장님이 자기한테 …"

    const name = key === 'chief' ? chiefName : refName(personas, speaker, key, chiefName) || '누군가';
    return form ? josa(name, form) : name;
  });
  return levelPronouns(levelize(tidy(txt), level), level);
}

/** the slot keys a template mentions */
export function slotKeys(tpl) {
  const out = [];
  String(tpl || '').replace(/\{@([a-z_]+)/g, (a, k) => { if (!out.includes(k)) out.push(k); return a; });
  return out;
}

// ------------------------------------------------------------------ the AI reply
const clampInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const asList = (v, n) => (Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : []).slice(0, n);

/**
 * Validate the JSON the AI returned. Every field is optional except a usable `reply`; anything that
 * is not plausible in-world speech is dropped. Returns { ok, result, dropped:[reasons] }.
 */
export function sanitizeResult(raw, { personas, self, chiefName = '촌장님', replyMax = 140 } = {}) {
  const dropped = [];
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const P = personas || {};
  const group = (P[self] && P[self].group) || 'adult';
  const forms = residentNameForms(P);
  // checked on the raw text too, so cleaning can never hide a link, a bad word or out-of-world talk
  const okRaw = (v) => typeof v === 'string' && isClean(v) && isInWorld(v);
  // may a resident keep this line (memory, fact, favour, learned line)? never unkind, sad, romantic,
  // real-life, an order or a reward; never a real person's name
  const keep = (t, aboutChief) => !sensitiveWhy(slotify(t, P, chiefName), { aboutChief }) && !hasOutsideName(t, forms);
  let reply = cleanSpoken(typeof r.reply === 'string' ? r.reply : typeof r.text === 'string' ? r.text : '');
  reply = capLine(reply, replyMax);
  const rawReply = typeof r.reply === 'string' ? r.reply : typeof r.text === 'string' ? r.text : '';
  if (!reply || !isClean(reply) || !isClean(rawReply) || /https?:|www\.|```/.test(rawReply) || hangulRatio(reply) < 0.5 || /```|https?:/.test(reply)) { dropped.push('reply'); reply = ''; }
  // what the resident says out loud: no promised rewards, no homework / code, no romance
  if (reply) { const why = replyWhy(reply, { group }); if (why) { dropped.push('reply:' + why); reply = ''; } }
  const out = {
    reply,
    emote: EMOTES.includes(r.emote) ? r.emote : null,
    mood: MOODS.includes(r.mood) ? r.mood : null,
    affinity: clampInt(r.affinity, -2, 2, 0),
    importance: clampInt(r.importance, 1, 5, 2),
    memory: '', facts: [], topics: [], gossip: [], lines: [], favor: null,
    private: r.private === true || r.private === 'true',
  };
  const mem = capLine(cleanSpoken(r.memory), 60);
  if (mem && okRaw(r.memory) && isSpeech(mem, { max: 60 }) && keep(mem, true)) out.memory = mem; else if (r.memory) dropped.push('memory');
  for (const f of asList(r.facts, 2)) {
    const t = capLine(cleanSpoken(f), 50);
    if (t && okRaw(f) && isSpeech(t, { max: 50 }) && /촌장/.test(t) && keep(t, true)) out.facts.push(t); else dropped.push('fact');
  }
  for (const tp of asList(r.topics, 3)) {
    const t = String(tp || '').replace(/[^가-힣a-zA-Z0-9 ]/g, '').trim().slice(0, 8);
    if (t && hangulRatio(t) >= 0.5 && isClean(t) && !sensitiveWhy(t, { aboutChief: true }) && !out.topics.includes(t)) out.topics.push(t);
  }
  for (const g of asList(r.gossip, 3)) {
    const t = capLine(cleanSpoken(g), 70);
    if (t && okRaw(g) && isSpeech(t, { max: 70, min: 6 }) && /(대|래|대요|래요|다더라|더라)[.!~…]*$/.test(t) && !hasOutsideName(t, forms)) {
      // the attribution is added by whoever repeats it, so drop a leading "X가 그러는데"
      const g2 = slotify(t, P, chiefName).replace(/^\{@[a-z_]+(:[^}]*)?\}\s*(그러는데|그러던데|말하길|말하는데|한테 들었는데)[,\s]*/, '').replace(/^[가-힣]{1,6}(이|가)\s(그러는데|그러던데)[,\s]*/, '');
      const why = g2.length >= 6 ? gossipWhy(g2, { origin: self }) : 'short';
      if (!why) out.gossip.push(g2); else dropped.push('gossip:' + why);
    }
    else dropped.push('gossip');
  }
  for (const l of asList(r.lines, 2)) {
    const t = capLine(cleanSpoken(l), 70);
    if (t && okRaw(l) && isSpeech(t, { max: 70, min: 4 }) && keep(t, null) && !replyWhy(t, { group })) out.lines.push(slotify(t, P, chiefName));
    else dropped.push('line');
  }
  if (r.favor && typeof r.favor === 'object') {
    const ask = capLine(cleanSpoken(r.favor.ask), 70);
    const item = typeof r.favor.item === 'string' ? r.favor.item.replace(/[^가-힣 ]/g, '').trim().slice(0, 8) : '';
    if (ask && okRaw(r.favor.ask) && isSpeech(ask, { max: 70 }) && keep(ask, null) && !sensitiveWhy(item)) out.favor = { ask, item: item || null }; else dropped.push('favor');
  }
  // gossip about the resident who just talked uses their own slot; keep at most 2
  out.gossip = out.gossip.filter((g, i, a) => a.indexOf(g) === i).slice(0, 2);
  // a private moment (the model said so): nothing is shared or kept as a fact
  if (out.private) { out.gossip = []; out.lines = []; out.facts = []; }
  return { ok: !!reply, result: out, dropped };
}

/** Pull the (possibly unfinished) "reply" string out of a JSON reply that is still streaming. */
export function extractPartialReply(raw) {
  const s = String(raw || '');
  const m = s.match(/"reply"\s*:\s*"/);
  if (!m) return '';
  let i = m.index + m[0].length, out = '';
  while (i < s.length) {
    const c = s[i];
    if (c === '"') return out;
    if (c === '\\') {
      const n = s[i + 1];
      if (n === undefined) break;
      if (n === 'n') out += ' '; else if (n === 't') out += ' ';
      else if (n === 'u') { const hex = s.substr(i + 2, 4); if (hex.length < 4) break; out += String.fromCharCode(parseInt(hex, 16) || 32); i += 4; }
      else out += n;
      i += 2; continue;
    }
    out += c; i++;
  }
  return out;
}

/** tolerant JSON parse (same rules as sample.json: whole text, a fenced block, or first {…last }) */
export function parseJsonLoose(text) {
  const s = String(text || '').trim();
  try { return JSON.parse(s); } catch (e) { /* next */ }
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1]); } catch (e) { /* next */ } }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e) { /* next */ } }
  return undefined;
}
