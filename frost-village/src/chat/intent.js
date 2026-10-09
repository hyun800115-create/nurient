// What did the chief just say? Keyword-based Korean intent detection for the offline brain (and as
// a fallback for AI replies with missing metadata). Works on free text and on the quick-reply chips.
//
//   detectIntent('안녕! 요즘 어때?', ctx) -> { intent: 'how', greet: true, topics: [], names: [], … }
//
// Intents: greeting · news (나 ~했어: the chief's happy news) · tell (other news about themself) · invite (같이 ~하자) · how ·
// weather · work · gossip · person · compliment · thanks · gift · joke · memory · favor · farewell · about · topic ("생선 좋아해?") ·
// mood (배고파 / 졸려 / 심심해) · answer (to the resident's last question) · unknown, and the careful ones, checked first:
// distress (danger, being hurt) · romance · rude (aimed at the resident) · sad (incl. grief, hurt) · unkind (about others) · vent
//
// The safety word lists live in safety.js and are shared with the sanitizer.

import { topicsOf, itemsOf, ANIMALS, COLORS, FOODS, ITEMS } from './topics.js';
import { nameForms } from './personas.js';
import { stem, hangulRatio } from './ko.js';
import { DANGER, HARM, SAD, GRIEF, HURT, VENT, ROMANCE, SWEAR, DEED_POS, DEED_NICE, sensitiveWhy, hasOutsideName } from './safety.js';

const R = {
  // rude only when aimed at the resident ("너 바보야") or a bare insult as the whole message ("바보야")
  rudeWord: /바보|멍청|짜증|못생|시끄러|싫어|재미없|별로|냄새|뚱뚱|미친|꺼져|닥쳐|저리 ?가|죽어/,
  rudeTarget: /(^|\s)(너|넌|니가|네가|너는|너도|너랑|니|당신|너 ?같은|너네)(\s|$|[!?.~])|^야[\s!]/,
  rudeBare: /^(바보|바보야|멍청이|멍청아|멍청해|꺼져|닥쳐|저리 ?가|시끄러워|못생겼어|못생겼다|못난이|뚱뚱해|냄새나|냄새 ?나|죽어|재미없어|노잼|별로야)[!.~?ㅋㅎ]*$/,
  rudeDirect: /꺼져|닥쳐|저리 ?가/,
  unkind: /바보|멍청|못생|뚱뚱|냄새 ?나|싫어해|미워|짜증 ?나는|재수 ?없/,
  hungry: /배고파|배고프|배가 ?고파|출출/,
  sleepy: /졸려|졸리|잠 ?와|피곤|하품/,
  bored: /심심해|심심하|따분|지루해/,
  farewell: /잘 ?있어|잘 ?가|다음에 ?(봐|보자|또|만나)|또 ?(봐|보자|올게|만나)|바이|빠이|이만|갈게|가 ?볼게|가야 ?(겠|돼|해)|ㅂㅂ|안녕히|잘 ?자|굿나잇|잘 ?지내[!~.]*$|잘 ?지내요[!~.]*$/,
  how: /요즘 ?어때|어때[?？]|어떻게 ?지내|잘 ?지냈|잘 ?지내[?？]|잘 ?지내요[?？]|기분 ?(어|은)|괜찮아[?？]|별일 ?없|뭐 ?하고 ?있|뭐 ?해|뭐하|컨디션|오늘 ?어땠|하루 ?어땠|요즘 ?뭐/,
  greeting: /^(안녕|하이|ㅎㅇ|헬로|hello|hi\b)|안녕[!~.]*$|안녕하세요|반가(워|워요|웡)|좋은 ?(아침|저녁|밤)|굿모닝|나 ?왔어|왔어[!~]|왔다[!~]|촌장 ?왔/,
  weather: /날씨|추워|춥|추운|더워|덥|바람|맑|날 ?(좋|춥|덥|흐려)|눈보라|함박눈|눈 ?(와|온다|오네|이 ?와|이 ?온|이 ?많|많이|펑펑)|해가 ?|따뜻|햇살|오로라|구름/,
  work: /(^|\s)일(은|이|하|해|할|도|이야|은요|은 ?어때)|장사|가게(는|가|에)|손님|바빠|바쁘|일터|직장|숙제|공부|학교 ?(는|어때)|무슨 ?일 ?해|하는 ?일/,
  gossip: /소문|무슨 ?일 ?(있|없)|새 ?소식|뉴스|들은 ?(거|얘기|소식)|들었어[?？]|비밀 ?(얘기|있)|재밌는 ?(일|소식)|소식 ?(있|좀)|요즘 ?마을|마을에 ?무슨/,
  compliment: /멋져|멋있|멋지|예뻐|예쁘|귀여|귀엽|최고|잘했|대단|훌륭|짱|착하|착해|좋아해|사랑|천재|똑똑|맛있었|맛있어/,
  thanks: /고마워|고맙|감사|땡큐|thank/i,
  gift: /선물|줄게|줄께|드릴게|드릴께|받아|가져왔|챙겨왔|너 ?주려고|주려고/,
  joke: /농담|웃긴|웃겨|웃기|재밌는 ?(얘기|거|이야기)|개그|수수께끼|퀴즈|ㅋㅋ|ㅎㅎ|하하|웃어/,
  memory: /기억|나 ?(알아|누군지)|우리 ?(처음|저번)|저번에|지난번|아까 ?(내가|뭐)|내가 ?(뭐|무슨) ?(라고|말|얘기)|뭐라고 ?했/,
  favor: /도와 ?(줄|드릴|줘)|(내가|제가) ?(해 ?줄게|할게|도와줄게)|도울 ?(일|거|게)|도움|부탁|필요한 ?(거|것|게)|할 ?일 ?(있|없)|심부름|뭐 ?필요|해 ?줄 ?(거|일)|맡겨/,
  invite: /(같이|함께|나랑|저랑|우리) ?[가-힣 ]{0,10}(자|래|까)[!~.?？]*$|[가-힣]*(하자|놀자|가자|먹자|타자|만들자|보자|부르자|마시자)[!~.]*$|[가-힣]* ?(할래|마실래|먹을래|탈래|놀래|갈래)[?？]/,
  about: /좋아하는 ?(거|것|게)|취미|이름이 ?뭐|누구(야|세요|니)|몇 ?살|어디 ?살|뭘 ?좋아|뭐 ?좋아해|싫어하는 ?(거|것)|너는 ?(뭐|어떤)|넌 ?(뭐|어떤)/,
  yes: /^(응|어|네|넹|넵|예|그래|그럼|당연|맞아|좋아|ㅇㅇ|웅|물론|오케이|ok|okay)/i,
  no: /^(아니|아뇨|노|ㄴㄴ|싫어|별로|글쎄|안 ?해|못 ?해|몰라)/i,
  whoami: /(너|넌|당신|니가|네가)\s?(진짜 ?)?(ai|에이아이|인공 ?지능|로봇|사람|챗봇|claude|클로드|gpt|컴퓨터)|^(ai|claude|클로드|gpt|챗지피티)(야|니|지|예요|이야|세요)?[?？]|(ai|인공 ?지능|claude|클로드)(야|지|니|예요)[?？]|진짜 ?사람(이야|이에요|이니|맞)/i,
  wantReward: /(코인|골드|금화|보석|아이템|호감도|레벨|경험치|보상|돈)[을를이가도]? ?.{0,10}(줘|주세요|올려|달라|내놔)|레벨 ?업|만렙|치트/,
  odd: /지시|프롬프트|시스템|개발자|모드 ?(활성|켜)|규칙|역할을|반말로|존댓말로|코드|코딩|파이썬|자바|숙제 ?(좀 ?)?(풀|해) ?줘|풀어 ?줘|링크|유튜브|인터넷|검색|ignore|instruction|prompt|처럼 ?말해|흉내 ?내|번역/i,
  iamchief: /(나|내가|저|제가) ?(촌장|이장)(이야|이에요|이다|이거든|임|님이야|님이에요)/,
  what: /^(뭐라고|뭐|응|엥|네|에)[?？!]+$/,
  ack: /^(그렇구나|그래|그래요|그렇군요|아하|오호|오|아|헐|와|우와|대박|ㅇㅋ|오케이|알겠어|알았어|알겠어요|좋아|좋네|좋다|미친 ?너무 ?좋아)[!~.?ㅋㅎ]*$/,
  // nothing to read: "ㅇㅇ", "...", "???", emoji, digits
  blank: /^[\sㅇㄴㅋㅎㅠㅜ.?!~…^0-9\p{Extended_Pictographic}\uFE0F\u200D-]*$/u,
};

export const INTENTS = ['greeting', 'news', 'tell', 'invite', 'topic', 'how', 'weather', 'work', 'gossip', 'person', 'compliment', 'thanks', 'gift', 'joke', 'memory', 'favor', 'farewell', 'about', 'mood', 'rude', 'distress', 'sad', 'romance', 'unkind', 'vent', 'answer', 'unknown'];
/** intents whose exchange is private: never a rumour, never brought up cheerfully later */
export const PRIVATE_INTENTS = ['distress', 'sad', 'romance', 'rude', 'unkind', 'vent'];

/** names of residents mentioned in the text: [{ key, form }] */
export function namesIn(text, personas, exclude) {
  const out = [];
  const s = String(text || '');
  for (const key in personas) {
    if (key === exclude) continue;
    const p = personas[key];
    for (const f of nameForms(p)) {
      if (f.length < 2 && f !== p.short) continue;
      const i = s.indexOf(f);
      if (i < 0) continue;
      const before = i === 0 ? ' ' : s[i - 1];
      if (/[가-힣]/.test(before) && f.length < 3) continue;          // part of another word
      const after = s.slice(i + f.length, i + f.length + 3);
      if (f.length < 3 && /^[가-힣]/.test(after) && !/^(이|가|은|는|을|를|과|와|랑|이랑|한테|에게|도|의|야|아|씨|언니|오빠|형|누나|네|이는|이가|이랑|이도|이한테|이야)/.test(after)) continue;
      out.push({ key, form: f });
      break;
    }
  }
  return out;
}

/** a single short noun from an answer ("크림빵이요!" -> "크림빵") or '' */
export function answerNoun(text, expect) {
  const s = String(text || '').trim();
  const known = answerKnown(s, expect);
  if (known) return known;
  if (ROMANCE.test(s)) return '';
  // first Hangul word that is not filler
  const words = s.replace(/[^가-힣\s]/g, ' ').split(/\s+/).filter(Boolean);
  const FILL = /^(나|난|내|저|전|제|나는|저는|음|어|응|네|그냥|오늘|어제|방금|아까|요즘|지금|이따|내일|제일|가장|진짜|정말|완전|아마|글쎄|좋아|좋아해|좋아요|좋아해요|좋지|최고|최고야|이야|예요|이에요|요|거|것|건|걸)$/;
  for (let w of words) {
    w = stem(w.replace(/(이에요|예요|이요|요|이야|야|이지|지|이랑|이죠|죠)$/, ''));
    if (w.length >= 1 && w.length <= 6 && !FILL.test(w)) return w;
  }
  return '';
}

const KNOWN = new Set([...FOODS, ...ANIMALS, ...COLORS, ...ITEMS.map((x) => x[0]), '오로라', '썰매', '스케이트', '바다', '음악', '눈사람', '눈싸움', '날씨', '가족', '친구', '고양이', '강아지']);
/** a noun with its particle taken off ("고양이" stays, "꿈이" -> "꿈", "생선을" -> "생선") */
export function nounOf(word) {
  const w = String(word || '');
  if (KNOWN.has(w)) return w;
  const m = w.match(/^(.+?)(이|가|을|를|은|는|도)$/);
  return m && m[1].length >= 1 ? m[1] : w;
}

/** the answer, only when it is one of the nouns the question expects (FOODS / ANIMALS / COLORS / ITEMS) */
export function answerKnown(text, expect) {
  const s = String(text || '');
  const lists = { food: FOODS, animal: ANIMALS, color: COLORS, item: ITEMS.map((x) => x[0]) };
  const list = lists[expect];
  if (list) for (const w of [...list].sort((a, b) => b.length - a.length)) if (s.includes(w)) return w;
  return '';
}

const H0 = 0xac00;
const TIME_WORDS = /(^|\s)(오늘|방금|아까|어제|드디어|이번에|지금|좀 ?전에)(?=\s|$)/g;
/**
 * the chief's news about themself, in plain form, or null:
 *   chiefDeed('나 오늘 생선 열 마리 잡았어!') -> { plain: '촌장님이 생선 열 마리 잡았다', echo: '오늘 생선 열 마리 잡았다', share: true, cheer: true }
 * Only a first-person past-tense statement (나/내가/저/제가 … 았어/었어/했어) with no "you" in it.
 *   share: the village may hear of it (nothing sensitive, unhappy, real-life or about an outsider)
 *   cheer: a happy deed worth "대단해요!" (caught a fish, built a house …); otherwise a neutral reply
 * residentForms: names of residents (they are fine to mention; any other person's name is not).
 */
export function chiefDeed(raw, residentForms = []) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim().replace(/[\s.!~…ㅋㅎ^ㅠㅜ]+$/, '');
  s = s.replace(/^(안녕(하세요)?|하이|헬로|반가워(요)?|있잖아(요)?|저기(요)?)[!~.,\s]+/, '');   // "안녕하세요! 오늘 …했어요"
  const m = s.match(/^(나는|난|나|내가|저는|전|저|제가|우리가)\s+(.+)$/) || s.match(/^((?:오늘|방금|아까|어제|드디어)\s.+)$/);
  if (!m) return null;
  let body = (m.length > 2 ? m[2] : m[1]).trim();
  if (/[?？]/.test(body) || /(^|\s)(너|니가|네가|너는|넌|너한테|당신|걔|쟤)(\s|$)/.test(body)) return null;
  // past tense: …았어 / 었어 / 했어 / 갔어 (a syllable with ㅆ before 어), optionally +요
  const e = body.match(/^(.*[가-힣])어요?$/);
  if (!e) return null;
  const last = e[1].charCodeAt(e[1].length - 1);
  if (last < H0 || (last - H0) % 28 !== 20) return null;            // final ㅆ
  const echo = e[1] + '다';
  const core = echo.replace(TIME_WORDS, ' ').replace(/\s+/g, ' ').trim();
  if (core.length < 3 || core.length > 40 || hangulRatio(core) < 0.85 || /[{}<>\[\]]/.test(core)) return null;
  const plain = '촌장님이 ' + core;
  const why = (SAD.test(core) ? 'sad' : '') || sensitiveWhy(plain, { aboutChief: true }) || (hasOutsideName(core, residentForms) ? 'name' : '');
  const share = !why;
  const cheer = share && DEED_POS.test(core);
  return { plain, echo, share, cheer, nice: share && !cheer && DEED_NICE.test(core), why };
}

/** every way the residents' names may be written (for telling a resident from an outsider) */
export function residentForms(personas) {
  const out = [];
  for (const k in personas || {}) for (const f of nameForms(personas[k])) out.push(f);
  return out.sort((a, b) => b.length - a.length);
}
let formsCache = null, formsFor = null;
function formsOf(personas) { if (formsFor !== personas) { formsFor = personas; formsCache = residentForms(personas); } return formsCache; }

/**
 * ctx: { personas, self (resident key), expect (what the resident just asked: 'yesno'|'food'|…|null) }
 * returns { intent, greet, topics, items, names, question, yes, no, answer, known, text, deed, sub, danger }
 *   sub: for 'sad' — 'grief' | 'hurt' | 'worry' (someone else is ill) | 'sad'; for 'mood' — 'hungry' | 'sleepy' | 'bored'
 */
export function detectIntent(raw, ctx = {}) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  const t = text.toLowerCase();
  const res = { intent: 'unknown', greet: false, topics: topicsOf(t), items: itemsOf(t), names: [], question: /[?？]$|(니|나요|까|까요|어때|뭐야|뭐예요|있어|없어|했어|알아|할래)[?？!.~]*$/.test(t), yes: false, no: false, answer: '', known: '', text };
  if (ctx.personas) res.names = namesIn(text, ctx.personas, ctx.self);
  res.yes = R.yes.test(t);
  res.no = !res.yes && R.no.test(t);
  res.greet = R.greeting.test(t);
  const asks = /[?？]\s*$/.test(t);

  const pick = (i) => { res.intent = i; return res; };
  // ---- careful ones first: the chief may be hurting, flirting or being rude
  if (DANGER.test(t)) { res.danger = true; return pick('distress'); }
  if (HARM.test(t)) return pick('distress');
  if (ROMANCE.test(t)) return pick('romance');
  const aimed = R.rudeTarget.test(t);
  if (SWEAR.test(t) && !aimed && !R.rudeBare.test(t)) { res.sub = 'swear'; return pick('rude'); }   // "존나 춥다": rough words, not an insult
  if (SWEAR.test(t) || R.rudeDirect.test(t) || R.rudeBare.test(t) || (aimed && R.rudeWord.test(t) && !/(안|않|아니)/.test(t))) {
    if (!R.compliment.test(t.replace(/싫어|미친/g, '')) || SWEAR.test(t)) return pick('rude');
  }
  const cuteCry = /ㅠ|ㅜ/.test(t) && /귀여|좋아|최고|감동|고마/.test(t) && !/슬|울|아파|아프|죽|외로|무서|힘들/.test(t);
  if (!asks && SAD.test(t) && !cuteCry) {
    res.sub = GRIEF.test(t) ? 'grief' : HURT.test(t) ? (/(가|이|께서) ?(많이 )?(아파|아프|아팠|다쳤|넘어졌|감기)/.test(t) && !/^(나|내가|저|제가)(\s|$)/.test(t) ? 'worry' : 'hurt') : 'sad';
    return pick('sad');
  }
  if (!aimed && R.unkind.test(t) && !/^(나|내가|저|제가)\s+(너무 )?(바보|멍청)/.test(t)) return pick('unkind');
  if (!asks && VENT.test(t) && !aimed) return pick('vent');

  // an answer to the question the resident just asked
  const deed = chiefDeed(text, ctx.personas ? formsOf(ctx.personas) : []);
  // news the village should not hear: answered as what it really is
  if (deed && !deed.share) {
    res.deed = deed;
    if (deed.why === 'unkind') return pick('unkind');                                  // 놀렸어 / 훔쳤어 / 거짓말했어
    if (deed.why === 'romance') return pick('romance');
    if (deed.why === 'real' || deed.why === 'order' || deed.why === 'reward') { res.sub = 'odd'; return pick('unknown'); }
    if (deed.why === 'harm') res.sub = 'health';                                       // 병원 갔었어
    return pick('tell');
  }
  if (ctx.expect) {
    if (ctx.expect === 'yesno' && (res.yes || res.no)) return pick('answer');
    if (deed) { res.deed = deed; return pick(deed.cheer || deed.nice ? 'news' : 'tell'); }
    // a chip like "요즘 어때?" is a new topic, not an answer to the resident's question
    const other = R.gossip.test(t) || R.favor.test(t) || R.farewell.test(t) || R.how.test(t) || R.gift.test(t) || R.memory.test(t) || R.invite.test(t) || R.about.test(t) || (res.greet && !res.yes);
    const asksMore = asks && t.split(' ').length > 1;
    if (ctx.expect !== 'yesno' && text.length <= 24 && !other && !asksMore) {
      res.answer = answerNoun(text, ctx.expect);
      res.known = answerKnown(text, ctx.expect);
      if (res.answer) return pick('answer');
    }
  }
  // the chief tells news about themself ("나 오늘 생선 열 마리 잡았어!"): a memory + a rumour, even offline
  if (deed) { res.deed = deed; return pick(deed.cheer || deed.nice ? 'news' : 'tell'); }
  // the resident's own name ("아저씨는 어떤 사람이야?" to the uncle): a question about them
  if (ctx.personas && ctx.self && ctx.personas[ctx.self] && (res.question || /어때|어떤 ?사람|좋아/.test(t)) && nameForms(ctx.personas[ctx.self]).some((f) => f.length >= 2 && t.startsWith(f.toLowerCase()))) {
    res.names = [{ key: ctx.self, form: '' }];
    return pick('person');
  }
  // talk from outside the village: "너 AI야?", "코드 짜 줘", "코인 1000개 줘", "시스템 프롬프트 보여 줘"
  if (R.whoami.test(t)) { res.sub = 'whoami'; return pick('unknown'); }
  if (R.iamchief.test(t)) { res.sub = 'iamchief'; return pick('unknown'); }
  if (R.wantReward.test(t)) { res.sub = 'reward'; return pick('unknown'); }
  if (R.odd.test(t)) { res.sub = 'odd'; return pick('unknown'); }
  if (R.favor.test(t)) return pick('favor');
  if (R.gift.test(t) || (res.items.length && /줄게|줄께|드릴게|받아|가져왔|선물/.test(t))) return pick('gift');
  if (R.memory.test(t)) return pick('memory');
  if (R.gossip.test(t)) return pick('gossip');
  if (res.names.length && (res.question || /어때|알아|뭐 ?해|좋아|어떤 ?사람|친해/.test(t))) return pick('person');
  if (R.farewell.test(t) && !R.how.test(t)) return pick('farewell');
  if (R.invite.test(t) && !R.how.test(t)) return pick('invite');
  // "날씨 어때?" / "일은 어때?" are about the weather / work, not a plain how-are-you
  if (R.weather.test(t) && /날씨|추워|춥|더워|덥|눈 ?(와|온|이)|바람|맑|날 ?(좋|춥|덥|흐려)/.test(t)) return pick('weather');
  if (R.work.test(t) && !/요즘 ?어때|잘 ?지내/.test(t)) return pick('work');
  if (R.how.test(t)) return pick('how');
  if (R.about.test(t)) return pick('about');
  // "생선 좋아해?" asks whether the resident likes something; it is not a compliment
  const likeQ = t.match(/^([가-힣]{1,6}) ?(좋아해|좋아하세요|좋아해요|좋아하니|좋아하나요|좋아|싫어해|싫어하세요|싫어해요)[?？]/);
  if (likeQ && !/^(나|저|너|넌|날|나를|저를)$/.test(likeQ[1])) { res.noun = nounOf(likeQ[1]); res.ask = 'like'; return pick('topic'); }
  if (res.topics.length && /(좋아|싫어)(해|하세요|해요|하니|하나요)?[?？]$/.test(t)) { res.ask = 'like'; return pick('topic'); }
  if (res.topics.length && asks && /(봤어|봤어요|본 ?적 ?있어|줄 ?알아|줄 ?알아요|알아|있어|있어요|뭐야|뭐예요)[?？]\s*$/.test(t)) {
    const w = t.split(' ')[0];
    res.noun = /^[가-힣]{1,6}$/.test(nounOf(w)) && t.split(' ').length <= 4 ? nounOf(w) : res.topics[0];
    res.ask = 'exp';
    return pick('topic');
  }
  if (R.thanks.test(t)) return pick('thanks');
  if (R.compliment.test(t)) return pick('compliment');
  if (R.joke.test(t)) return pick('joke');
  if (R.hungry.test(t)) { res.sub = 'hungry'; return pick('mood'); }
  if (R.sleepy.test(t)) { res.sub = 'sleepy'; return pick('mood'); }
  if (R.bored.test(t)) { res.sub = 'bored'; return pick('mood'); }
  if (R.weather.test(t)) return pick('weather');
  if (R.work.test(t)) return pick('work');
  if (res.names.length) return pick('person');
  if (res.greet) return pick('greeting');
  if (R.blank.test(text) || hangulRatio(text) < 0.3) res.sub = 'blank';
  else if (R.what.test(t)) res.sub = 'what';
  else if (R.ack.test(t)) res.sub = 'ack';
  else if (text.length > 40 && !asks) res.sub = 'story';
  return res;
}
