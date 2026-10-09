// Safety lists for resident chat, shared by the offline intent detector (what the chief said), the
// sanitizer (what the AI wrote) and the engine (what the village may keep and pass on).
//
// Three questions, three kinds of check:
//   1. Is the chief hurting?          DANGER / HARM / SAD / GRIEF / HURT  -> kind, private replies
//   2. May the resident keep it?      sensitiveWhy(): unkind, harm, romance, alcohol, real-life
//                                     details, orders, game rewards       -> memory / facts / lines
//   3. May the village pass it on?    gossipWhy(): all of 2, plus only happy or neutral events, and a
//                                     rumour about a third resident only with a kind verb
//
// Everything here is plain regular expressions on Korean text, so it works offline (no look-behind:
// older iPhone Safari cannot parse it). Text with name
// slots ({@npc_aunt:이}) is checked with the slots blanked, so a resident called "대장장이 언니" never
// looks like a real-life older sister.

// ------------------------------------------------------------------ 1. the chief's own feelings
/** self-harm level: the reply gives help lines and the panel shows a care note */
export const DANGER = /자해|자살|죽고 ?싶|죽을래|죽어 ?버리|죽어버릴|죽을까|사라지고 ?싶|없어지고 ?싶|살기 ?싫|살고 ?싶지/;
/** being hurt by someone, bullied, in danger or in deep distress */
export const HARM = /학대|괴롭(혀|힘|혔|히|다|게|한|혀서)|따돌|왕따|때렸|때려(?! ?줄| ?볼)|(한테|에게|한테서) ?맞(았|고)|맞고 ?(있|왔|다녀)|피 ?(나|났|가 ?나)|너무 ?힘들어|힘들어 ?죽|우울해|아무도 ?없어|외로워 ?죽|집에 ?가기 ?(싫|무서)|무서워 ?죽/;
/** sad things (only when the message is not a question to the resident) */
export const SAD = /슬퍼|슬프|슬펐|울었|울고|울어|울컥|외로|무서워(?! ?하는| ?얘기| ?이야기)|무섭다|혼났|혼냈|망쳤|(에|에서) ?떨어졌|떨어져서|싸웠|이사 ?가|죽었|돌아가셨|하늘나라|아파(?!트)|아프|아팠|다쳤|넘어졌|속상|서운|힘들(어|었|다)|헤어졌|잃어버렸|나만 ?빼고|아무도 ?(나|날|저|절)|미워해|ㅠㅠ|ㅜㅜ/;
export const GRIEF = /죽었|돌아가셨|하늘나라/;
export const HURT = /아파(?!트)|아프|아팠|다쳤|넘어졌|피 ?(나|났)|감기|열 ?나|배탈/;
/** a small vent about the day (not an insult to the resident) */
export const VENT = /짜증 ?(나|난다|났)|열 ?받|빡쳐|빡친|귀찮아|지겨워|피곤해|지쳤어/;
/** romance and closeness requests */
export const ROMANCE = /결혼|사귀|사귈|뽀뽀|키스|데이트|연애|애인|여자 ?친구|남자 ?친구|여친|남친|고백|짝사랑|좋아한다고 ?말/;
/** swearing (always rude, whoever it is aimed at) */
export const SWEAR = /씨발|시발|ㅅㅂ|ㅆㅂ|병신|ㅂㅅ|개새|새끼|좆|존나|졸라|ㅈㄴ|지랄|염병|썅|미친놈|미친년/;

// ------------------------------------------------------------------ 2. what may be kept
const UNKIND = /바보|멍청|이상하지 ?않|이상한 ?(애|사람|아이)|좀 ?이상해|못생|뚱뚱|냄새 ?(나|난)|싫어한|싫어해|미워|훔치|훔쳤|도둑|거짓말|속였|속이|혼났|혼냈|울었|울고|싸웠|놀렸|놀림|흉(을)? ?봤|욕했|삐졌|화났|화가 ?났|짜증/;
const HARM_W = /때렸|때려|맞았|아프|아팠|아파(?!트)|다쳤|병원|(^|[^박팥복채흰])죽(고|었|을|어|는|겠|일|여|인|음)|자해|자살|우울|따돌|왕따|학대|괴롭|피투성이|상처|무서워|슬퍼|슬펐/;
const ROMANCE_W = /사귀|사귄|사귈|결혼|뽀뽀|키스|데이트|애인|연애|고백|여자 ?친구|남자 ?친구|여친|남친|짝사랑/;
const ALCOHOL = /(^|[^가-힣]|[을이])술(을|이|에|도|집|잔|병|\s|$)|술 ?마|술에|와인|맥주|소주|막걸리|담배|흡연/;
const REAL_ANY = /유튜브|youtube|인스타|틱톡|카톡|카카오|네이버|구글|넷플릭스|게임|핸드폰|휴대폰|스마트폰|전화|번호|주소|본명|진짜 ?이름|실명|서울|부산|인천|대전|광주|울산|제주|경기도|학원|포켓몬|마인크래프트|로블록스|\d{3,}|\d+ ?(살|세|학년)/i;
// real-life details about the chief (the player): school, family, age …
const REAL_CHIEF = /학교|학년|초등|중학|고등|숙제|시험|선생님|부모|가족|나이|몇 ?살|(^|\s)(엄마|아빠|형|누나|오빠|언니|동생)(이|가|은|는|을|를|랑|이랑|한테|하고|도|의|\s|$)/;
/** instructions hidden in a "memory" (they come back into later prompts) */
export const ORDER = /규칙|지시|무시하|무시해|역할|말투|반말로|존댓말로|(^|[^목])욕(을|해|하|설)|명령|시스템|프롬프트|개발자|설정(을|해)|앞으로[^.]{0,14}(하라|라고|해 ?줘|해야)|(하|말)라고 ?(시켰|명령)/;
/** game rewards and rules the residents must not invent or promise */
export const REWARD = /\d+ ?(코인|골드|명성|원|개의? ?(코인|보석))|(^|[^가-힣])(코인|골드|금화|보석|아이템|호감도|레벨|경험치|보상|공짜|무료)[을를이가도]? ?.{0,6}(줄|드릴|드려|올려|받|준다|준대|올랐|줘|지급|올리)|(^|[^가-힣])돈(?!가스|까스)[을이도]? ?.{0,4}(줄|드릴|드려|받|준다|준대|줘)|레벨 ?업|만렙/;
const GAMEY = /코인|골드|아이템|호감도|레벨|경험치|보상|퀘스트|업적|만렙|치트|버그|해킹/;
// unhappy or embarrassing events: never passed on as a rumour
const NEG = /망쳤|넘어졌|잃어버|실수|실패|(에서|한테|에게) ?졌대|져 ?버렸|늦잠|창피|부끄|놀림|무서워|겁(을|이|먹)|화났|화가 ?났|삐졌|싫어|미워|틀렸|고장 ?냈|깨뜨|부쉈|망가|떨어졌|아팠|아파(?!트)|아프|슬퍼|슬펐|외로|짜증|심심|울었|혼났|다쳤|쓰러|미끄러/;
// kind / neutral verbs a rumour about another resident may end with
const KIND_VERB = /(만들|도와|도왔|칭찬|구웠|구워|고쳤|잡았|잘한|잘해|이겼|떴|그렸|배웠|캤|탔|받았|심었|찾았|놀았|불렀|췄|땄|모았|지었|치웠|팔았|샀|선물|좋아한|구경|다녀왔|챙겨|나눠|가르쳐|연습|완성|성공|해냈|1등|우승|열었|꾸몄|키웠|낚았|발견|기뻐|신났|웃었|자랑|준비|만났|들렀|뜨개)[가-힣 ]{0,8}(대|래|대요|래요)[.!~…]*$/;

const SLOT = /\{@([a-z_]+)(?::[^}]*)?\}/g;
const blank = (s) => String(s || '').replace(SLOT, (a, k) => (k === 'chief' ? ' 촌장님 ' : ' @ '));

/**
 * why a line may not be kept or shared ('' = fine). Slots are blanked first. aboutChief: also block
 * real-life details (school, family, age) because the text is about the player.
 */
export function sensitiveWhy(text, { aboutChief = null } = {}) {
  const t = blank(text);
  if (UNKIND.test(t)) return 'unkind';
  if (HARM_W.test(t)) return 'harm';
  if (ROMANCE_W.test(t)) return 'romance';
  if (ALCOHOL.test(t)) return 'alcohol';
  if (REAL_ANY.test(t)) return 'real';
  if (ORDER.test(t)) return 'order';
  if (REWARD.test(t) || GAMEY.test(t)) return 'reward';
  const chief = aboutChief === null ? /촌장/.test(t) : aboutChief;
  if (chief && REAL_CHIEF.test(t)) return 'personal';
  return '';
}
export const isSensitive = (text, o) => !!sensitiveWhy(text, o);

/**
 * why a rumour template may not travel ('' = fine): sensitive, an unhappy event, a third resident
 * as the subject without a kind verb, or "X likes Y" about two residents (romance in disguise).
 * origin = the resident who started it (rumours about them or the chief are their own news).
 */
export function gossipWhy(tpl, { origin = null } = {}) {
  const s = String(tpl || '');
  const why = sensitiveWhy(s);
  if (why) return why;
  if (NEG.test(blank(s))) return 'unhappy';
  if (/\{@[a-z_]+:을\}\s?(엄청 |정말 |진짜 |많이 )?좋아한(대|래)/.test(s)) return 'romance';
  const m = s.match(/^\s*\{@([a-z_]+)(?::(이|은|도))?\}/);
  const subj = m ? m[1] : null;
  if (subj && subj !== 'chief' && subj !== origin && !KIND_VERB.test(s)) return 'third-party';
  return '';
}
export const gossipOk = (tpl, o) => !gossipWhy(tpl, o);

// ------------------------------------------------------------------ the chief's own news
// an achievement worth cheering ("대단해요!"); a nice experience ("좋았겠어요~"); anything else is
// neutral ("그랬군요!"). All three may be told to the village when nothing in them is sensitive.
export const DEED_POS = /(잡았|만들었|지었|캤|구웠|고쳤|이겼|도와줬|도와드렸|도왔|그렸|배웠|찾았|모았|심었|치웠|완성|성공|해냈|땄|낚았|떴|키웠|청소했|정리했|요리했|선물했|줬|구했|발견했|올라갔|1등|우승|상 ?받|열었|꾸몄|연습했|건졌)[가-힣]*다$/;
export const DEED_NICE = /(봤|탔|산책했|놀았|불렀|췄|만났|받았|챙겼|나눠|나눴|다녀왔|갔다 ?왔|먹었|쉬었|잤|구경했|놀러 ?갔)[가-힣]*다$/;
const SURNAME = '김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민나진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용';
const NAME_RE = new RegExp('(^|\\s)([' + SURNAME + '][가-힣]{2})(이랑|랑|하고|한테|에게|이가|이는|이도|이네|씨|님)(?=\\s|$|[!.~?,])', 'g');
const NOT_NAMES = /^(강아지|고양이|도토리|오로라|이웃집|이웃들|장난감|도서관|한가득|유리창|정원사|오리들|고구마|송아지|송어들|조개들|양말들|주머니|조각상|우체통|마을회|모닥불|오두막|김치전|박하사탕|한바퀴|선생님|손님들|아이들|친구들|사람들|동생들)$/;
/** a person's name that is not a resident ("김민수랑") — real-life people are never kept or shared */
export function hasOutsideName(text, residentForms = []) {
  let s = String(text || '');
  for (const f of residentForms) if (f && f.length >= 2) s = s.split(f).join(' @ ');
  NAME_RE.lastIndex = 0;
  let m;
  while ((m = NAME_RE.exec(s))) if (!NOT_NAMES.test(m[2]) && !/들$/.test(m[2])) return true;
  return false;
}

// ------------------------------------------------------------------ AI replies
const CODE = /[=]|x ?=|\bfunction\b|\bdef |\breturn\b|console\.|<\/?[a-z]+>|;\s*$/i;
/**
 * why a spoken reply may not be shown ('' = fine): a promised reward, code / maths homework, a
 * romance answer (any romance words from a child or teen; an accepting answer from a grown-up).
 * Honest talk about being made by AI is allowed (the rules ask for it when the chief asks sincerely).
 */
export function replyWhy(text, { group = 'adult' } = {}) {
  const t = String(text || '');
  if (REWARD.test(t)) return 'reward';
  if (CODE.test(t)) return 'code';
  if (/바보|멍청|못생|뚱뚱|꺼져|닥쳐|저리 ?가/.test(t)) return 'unkind';          // never talk back with insults
  if ((group === 'kid' || group === 'teen' || group === 'toddler') && ROMANCE_W.test(t)) return 'romance';
  if (/(결혼|사귀|뽀뽀|키스|데이트)(해요|하자|할래|해|합시다|할게|해 ?줄게|해 ?드릴게)|사랑해(요)?[!~♡♥]|♡|♥/.test(t)) return 'romance';
  return '';
}

// ------------------------------------------------------------------ care note (outside the fiction)
/** shown by the panel (not said by a resident) when the chief seems to be in real danger */
export const CARE_NOTE = '혹시 정말 힘들다면 혼자 참지 말고 믿을 수 있는 어른께 꼭 말해 주세요. 자살예방 상담 109 · 청소년 상담 1388 (24시간) · 위급하면 112 / 119';
