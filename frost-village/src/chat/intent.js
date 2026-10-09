// What did the chief just say? Keyword-based Korean intent detection for the offline brain (and as
// a fallback for AI replies with missing metadata). Works on free text and on the quick-reply chips.
//
//   detectIntent('안녕! 요즘 어때?', ctx) -> { intent: 'how', greet: true, topics: [], names: [], … }
//
// Intents: greeting · news (나 ~했어: the chief's own news) · invite (같이 ~하자) · how · weather · work · gossip · person · compliment · thanks · gift · joke ·
// memory · favor · farewell · about · topic ("생선 좋아해?") · rude · distress · answer (to the resident's last question) · unknown

import { topicsOf, itemsOf, ANIMALS, COLORS, FOODS, ITEMS } from './topics.js';
import { nameForms } from './personas.js';
import { stem, hangulRatio } from './ko.js';

const R = {
  distress: /죽고 ?싶|자살|사라지고 ?싶|살기 ?싫|너무 ?힘들어|힘들어 ?죽|우울해|괴롭힘|왕따|맞았어|때려|학대|아무도 ?없어|외로워 ?죽/,
  rude: /바보|멍청|꺼져|짜증|못생|시끄러|싫어 ?너|너 ?싫어|저리 ?가|재미없어|별로야 ?너|닥쳐|씨발|시발|ㅅㅂ|병신|ㅂㅅ|미친/,
  farewell: /잘 ?있어|잘 ?가|다음에 ?(봐|보자|또|만나)|또 ?(봐|보자|올게|만나)|바이|빠이|이만|갈게|가 ?볼게|가야 ?(겠|돼|해)|ㅂㅂ|안녕히|잘 ?자|굿나잇|잘 ?지내[!~.]*$|잘 ?지내요[!~.]*$/,
  how: /요즘 ?어때|어때[?？]|어떻게 ?지내|잘 ?지냈|잘 ?지내[?？]|잘 ?지내요[?？]|기분 ?(어|은)|괜찮아[?？]|별일 ?없|뭐 ?하고 ?있|뭐 ?해|뭐하|컨디션|오늘 ?어땠|하루 ?어땠|요즘 ?뭐/,
  greeting: /^(안녕|하이|ㅎㅇ|헬로|hello|hi\b)|안녕[!~.]*$|안녕하세요|반가(워|워요|웡)|좋은 ?(아침|저녁|밤)|굿모닝|나 ?왔어|왔어[!~]|왔다[!~]|촌장 ?왔/,
  weather: /날씨|추워|춥|추운|더워|덥|바람|맑|눈보라|함박눈|눈 ?(와|온다|오네|이 ?와|이 ?온|이 ?많|펑펑)|해가 ?|따뜻|햇살|오로라|구름/,
  work: /(^|\s)일(은|이|하|해|할|도|이야|은요|은 ?어때)|장사|가게(는|가|에)|손님|바빠|바쁘|일터|직장|숙제|공부|학교 ?(는|어때)|무슨 ?일 ?해|하는 ?일/,
  gossip: /소문|무슨 ?일 ?(있|없)|새 ?소식|뉴스|들은 ?(거|얘기|소식)|들었어[?？]|비밀 ?(얘기|있)|재밌는 ?(일|소식)|소식 ?(있|좀)|요즘 ?마을|마을에 ?무슨/,
  compliment: /멋져|멋있|멋지|예뻐|예쁘|귀여|최고|잘했|대단|훌륭|짱|착하|착해|좋아해|사랑|천재|똑똑/,
  thanks: /고마워|고맙|감사|땡큐|thank/i,
  gift: /선물|줄게|줄께|드릴게|드릴께|받아|가져왔|챙겨왔|너 ?주려고|주려고/,
  joke: /농담|웃긴|웃겨|웃기|재밌는 ?(얘기|거|이야기)|개그|수수께끼|퀴즈|ㅋㅋ|ㅎㅎ|하하|웃어/,
  memory: /기억|나 ?(알아|누군지)|우리 ?(처음|저번)|저번에|지난번|아까 ?(내가|뭐)|내가 ?(뭐|무슨) ?(라고|말|얘기)|뭐라고 ?했/,
  favor: /도와 ?(줄|드릴|줘)|도울 ?(일|거|게)|도움|부탁|필요한 ?(거|것|게)|할 ?일 ?(있|없)|심부름|뭐 ?필요|해 ?줄 ?(거|일)|맡겨/,
  invite: /(같이|함께|나랑|저랑|우리) ?[가-힣 ]{0,10}(자|래|까)[!~.?？]*$|[가-힣]+(하자|놀자|가자|먹자|타자|만들자|보자)[!~.]*$|[가-힣]+ ?할래[?？]/,
  romance: /결혼|사귀|뽀뽀|키스|데이트|연애|애인/,
  about: /좋아하는 ?(거|것|게)|취미|이름이 ?뭐|누구(야|세요|니)|몇 ?살|어디 ?살|뭘 ?좋아|뭐 ?좋아해|싫어하는 ?(거|것)|너는 ?(뭐|어떤)|넌 ?(뭐|어떤)/,
  yes: /^(응|어|네|넹|넵|예|그래|그럼|당연|맞아|좋아|ㅇㅇ|웅|물론|오케이|ok|okay)/i,
  no: /^(아니|아뇨|노|ㄴㄴ|싫어|별로|글쎄|안 ?해|못 ?해|몰라)/i,
};

export const INTENTS = ['greeting', 'news', 'invite', 'topic', 'how', 'weather', 'work', 'gossip', 'person', 'compliment', 'thanks', 'gift', 'joke', 'memory', 'favor', 'farewell', 'about', 'rude', 'distress', 'answer', 'unknown'];

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
  const lists = { food: FOODS, animal: ANIMALS, color: COLORS, item: ITEMS.map((x) => x[0]) };
  const list = lists[expect];
  if (list) for (const w of [...list].sort((a, b) => b.length - a.length)) if (s.includes(w)) return w;
  // first Hangul word that is not filler
  const words = s.replace(/[^가-힣\s]/g, ' ').split(/\s+/).filter(Boolean);
  const FILL = /^(나|난|내|저|전|제|나는|저는|음|어|응|네|그냥|오늘|어제|방금|아까|요즘|지금|이따|내일|제일|가장|진짜|정말|완전|아마|글쎄|좋아|좋아해|좋아요|좋아해요|좋지|최고|최고야|이야|예요|이에요|요|거|것|건|걸)$/;
  for (let w of words) {
    w = stem(w.replace(/(이에요|예요|이요|요|이야|야|이지|지|이랑|이죠|죠)$/, ''));
    if (w.length >= 1 && w.length <= 6 && !FILL.test(w)) return w;
  }
  return '';
}

const H0 = 0xac00;
const TIME_WORDS = /(^|\s)(오늘|방금|아까|어제|드디어|이번에|지금|좀 ?전에)(?=\s|$)/g;
/**
 * the chief's news about themself, in plain form, or null:
 *   chiefDeed('나 오늘 생선 열 마리 잡았어!') -> { plain: '촌장님이 생선 열 마리 잡았다', echo: '오늘 생선 열 마리 잡았다' }
 * Only a first-person past-tense statement (나/내가/저/제가 … 았어/었어/했어) with no "you" in it.
 */
export function chiefDeed(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim().replace(/[\s.!~…ㅋㅎ^]+$/, '');
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
  return { plain: '촌장님이 ' + core, echo };
}

/**
 * ctx: { personas, self (resident key), expect (what the resident just asked: 'yesno'|'food'|…|null) }
 * returns { intent, greet, topics, items, names, question, yes, no, answer, text }
 */
export function detectIntent(raw, ctx = {}) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  const t = text.toLowerCase();
  const res = { intent: 'unknown', greet: false, topics: topicsOf(t), items: itemsOf(t), names: [], question: /[?？]$|(니|나요|까|까요|어때|뭐야|뭐예요|있어|없어|했어|알아|할래)[?？!.~]*$/.test(t), yes: false, no: false, answer: '', text };
  if (ctx.personas) res.names = namesIn(text, ctx.personas, ctx.self);
  res.yes = R.yes.test(t);
  res.no = !res.yes && R.no.test(t);
  res.greet = R.greeting.test(t);

  const pick = (i) => { res.intent = i; return res; };
  if (R.distress.test(t)) return pick('distress');
  if (R.rude.test(t) && !R.compliment.test(t.replace(/싫어/g, ''))) return pick('rude');
  // an answer to the question the resident just asked
  const deed = chiefDeed(text);
  if (ctx.expect) {
    if (ctx.expect === 'yesno' && (res.yes || res.no)) return pick('answer');
    if (deed) { res.deed = deed; return pick('news'); }
    // a chip like "요즘 어때?" is a new topic, not an answer to the resident's question
    const other = R.gossip.test(t) || R.favor.test(t) || R.farewell.test(t) || R.how.test(t) || R.gift.test(t) || R.memory.test(t) || R.invite.test(t) || R.about.test(t) || (res.greet && !res.yes);
    const asks = /[?？]$/.test(t) && t.split(' ').length > 1;
    if (ctx.expect !== 'yesno' && text.length <= 24 && !other && !asks) {
      res.answer = answerNoun(text, ctx.expect);
      if (res.answer) return pick('answer');
    }
  }
  // the chief tells news about themself ("나 오늘 생선 열 마리 잡았어!"): a memory + a rumour, even offline
  if (deed) { res.deed = deed; return pick('news'); }
  if (R.favor.test(t)) return pick('favor');
  if (R.gift.test(t) || (res.items.length && /줄게|줄께|드릴게|받아|가져왔|선물/.test(t))) return pick('gift');
  if (R.memory.test(t)) return pick('memory');
  if (R.gossip.test(t)) return pick('gossip');
  if (res.names.length && (res.question || /어때|알아|뭐 ?해|좋아|어떤 ?사람|친해/.test(t))) return pick('person');
  if (R.farewell.test(t) && !R.how.test(t)) return pick('farewell');
  if (R.invite.test(t) && !R.how.test(t) && !R.romance.test(t)) return pick('invite');
  // "날씨 어때?" / "일은 어때?" are about the weather / work, not a plain how-are-you
  if (R.weather.test(t) && /날씨|추워|춥|더워|덥|눈 ?(와|온|이)|바람|맑/.test(t)) return pick('weather');
  if (R.work.test(t) && !/요즘 ?어때|잘 ?지내/.test(t)) return pick('work');
  if (R.how.test(t)) return pick('how');
  if (R.about.test(t)) return pick('about');
  // "생선 좋아해?" asks about a topic; it is not a compliment
  if (res.topics.length && /(좋아|싫어)(해|하세요|해요|하니|하나요)?[?？]$/.test(t)) return pick('topic');
  if (R.thanks.test(t)) return pick('thanks');
  if (R.compliment.test(t)) return pick('compliment');
  if (R.joke.test(t)) return pick('joke');
  if (R.weather.test(t)) return pick('weather');
  if (R.work.test(t)) return pick('work');
  if (res.names.length) return pick('person');
  if (res.greet) return pick('greeting');
  return res;
}
