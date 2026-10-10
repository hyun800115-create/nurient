// 사건·사고 글자 (incidents_runtime strings, ko + en). 게임에 붙일 때 src/data/strings.js 로 옮겨져요 (P20).
// 사건은 모두 귀엽고 아무도 다치지 않아요: '죽음', '다침', '병원' 같은 말은 쓰지 않아요.

export const ISTR = {
  // ---- 설정 · 건물
  setting:      { ko: '사건·사고', en: 'Incidents' },
  settingOn:    { ko: '켜기', en: 'On' },
  settingOff:   { ko: '끄기', en: 'Off' },
  settingSub:   { ko: '끄면 도둑·다툼·화재가 없어요 (이사는 그대로)', en: 'Off: no thieves, scuffles or fires (moving still happens)' },
  police:       { ko: '서리 경찰서', en: 'Police station' },
  policeOpen:   { ko: '경찰서 완공! 경찰관 두 명이 순찰을 돌아요', en: 'The police station is open! Two officers start their patrol' },
  fireLevel:    { ko: '소방서 레벨 {n}! 소방차가 더 빨리 와요', en: 'Fire station level {n}! The fire truck comes faster' },
  hydrant:      { ko: '소화전', en: 'Fire hydrant' },
  hydrantDone:  { ko: '소화전 설치! 불이 조금 줄어요 ({n}개)', en: 'Hydrant installed! Fewer fires ({n})' },
  drill:        { ko: '소방 훈련', en: 'Fire drill' },
  drillDone:    { ko: '소방 훈련 끝! 이제 불이 나도 걱정 없어요', en: 'Drill done! The brigade is ready' },
  safety:       { ko: '안심', en: 'Safety' },
  // ---- 좀도둑
  theftToast:   { ko: '{shop}에서 좀도둑! 경찰관이 쫓아가요', en: 'A petty thief at the {shop}! The police give chase' },
  caught:       { ko: '도둑을 잡았어요! 경찰서에서 반성 중이에요', en: 'Caught! Now saying sorry at the police station' },
  escaped:      { ko: '도둑이 도망쳤어요… 광장 게시판에 현상수배 포스터!', en: 'The thief got away… a wanted poster goes up on the plaza board!' },
  released:     { ko: '{name}이(가) 사과하고 집에 돌아갔어요', en: '{name} said sorry and went home' },
  tipped:       { ko: '제보가 들어왔어요! 현상수배범을 찾았어요', en: 'A tip came in! The wanted thief was found' },
  wanted:       { ko: '현상수배', en: 'WANTED' },
  wantedWho:    { ko: '누굴까요?', en: 'Who is it?' },
  wantedItem:   { ko: '{item} 도둑', en: '{item} thief' },
  wantedReward: { ko: '보상 {n}', en: 'Reward {n}' },
  // ---- 새치기 · 눈덩이 · 티격태격
  queueToast:   { ko: '줄 서기 소동! 새치기는 안 돼요', en: 'A queue squabble! No cutting in line' },
  windowToast:  { ko: '눈덩이가 창문에 쿵! 범인은 꼬마?', en: 'A snowball hit a window! A kid did it?' },
  windowSorry:  { ko: '꼬마가 엄마랑 사과하러 왔어요', en: 'The kid came to say sorry with a parent' },
  scuffleToast: { ko: '티격태격! 경찰관이 말리러 가요', en: 'A scuffle! An officer steps in' },
  handshake:    { ko: '화해했어요! 악수 꾹', en: 'Made up! A big handshake' },
  // ---- 불
  fireToast:    { ko: '{place}에 불이 났어요! 소방차 출동!', en: 'Fire at the {place}! The fire truck is on its way!' },
  fireOut:      { ko: '불을 껐어요! 아무도 다치지 않았어요', en: 'The fire is out! Nobody was hurt' },
  fireRuin:     { ko: '{place}이(가) 다 탔어요… 모두 무사해요! 보험으로 다시 지어요', en: 'The {place} burned down… everyone is safe! Insurance will rebuild it' },
  demolish:     { ko: '불탄 건물을 치워요 (굴착기 · 덤프트럭)', en: 'Clearing the burnt building (excavator · dump truck)' },
  construct:    { ko: '새로 짓는 중이에요', en: 'Rebuilding' },
  rebuilt:      { ko: '{place}을(를) 더 멋지게 다시 지었어요!', en: 'The {place} is rebuilt — even nicer!' },
  rebuiltSame:  { ko: '{place}을(를) 다시 지었어요!', en: 'The {place} is rebuilt!' },
  // ---- 이사
  moveIn:       { ko: '{fam}이(가) 이사 왔어요!', en: '{fam} moved in!' },
  moveInSub:    { ko: '새 이웃에게 인사해요', en: 'Say hello to the new neighbours' },
  moveOut:      { ko: '{fam}이(가) 이사를 떠나요', en: '{fam} is moving away' },
  moveOutSub:   { ko: '새로운 모험을 찾아서, 안녕!', en: 'Off on a new adventure — goodbye!' },
  newFamily:    { ko: '새 가족', en: 'A new family' },
  familyOf:     { ko: '{name}네', en: 'The {name} family' },
  someone:      { ko: '누군가', en: 'someone' },
  // ---- 말풍선 (사람들이 하는 말)
  sThief:       { ko: ['도둑이야!', '앗, 내 {item}!'], en: ['Stop, thief!', 'Hey, my {item}!'] },
  sFlee:        { ko: ['히익—!', '배고파서 그만…'], en: ['Eek—!', 'I was just hungry…'] },
  sChase:       { ko: ['거기 서!', '삐익—! 멈춰요!'], en: ['Stop right there!', 'Tweeet! Halt!'] },
  sArrest:      { ko: ['잡았다!', '경찰서로 가요~'], en: ['Got you!', 'Off to the station~'] },
  sCaught:      { ko: ['죄송해요…', '다시는 안 그럴게요…'], en: ['I’m sorry…', 'I won’t do it again…'] },
  sThink:       { ko: ['어디로 갔지…?', '흐음…'], en: ['Where did they go…?', 'Hmm…'] },
  sSorry:       { ko: ['정말 죄송해요. 두 배로 갚을게요', '반성 많이 했어요…'], en: ['I’m really sorry. I’ll pay you back twice', 'I learned my lesson…'] },
  sForgive:     { ko: ['다음부턴 그러지 마요~', '괜찮아요, 빵 하나 더 줄게요'], en: ['Don’t do it again, okay?', 'It’s fine — have another bun'] },
  sQueue:       { ko: ['새치기하면 안 돼요!', '줄 서세요~!'], en: ['No cutting in line!', 'Please queue up~!'] },
  sQueueSorry:  { ko: ['앗, 죄송해요! 뒤로 갈게요', '급해서 그만…'], en: ['Oops, sorry! I’ll go to the back', 'I was in a hurry…'] },
  sWindow:      { ko: ['앗! 유리창이…!', '도망가자!'], en: ['Uh-oh! The window…!', 'Run!'] },
  sWindowWho:   { ko: ['누구야~?', '눈덩이가 어디서…?'], en: ['Who did that~?', 'Where did that come from…?'] },
  sWindowSorry: { ko: ['유리창 깨서 죄송해요…'], en: ['Sorry I broke your window…'] },
  sWindowOk:    { ko: ['괜찮아, 다음엔 조심하렴'], en: ['That’s alright, be careful next time'] },
  sFight:       { ko: ['네가 먼저 그랬잖아!', '아니거든!'], en: ['You started it!', 'Did not!'] },
  sSeparate:    { ko: ['그만! 그만!', '삐익—! 둘 다 멈춰요!'], en: ['Stop! Stop!', 'Tweeet! Both of you, stop!'] },
  sShake:       { ko: ['미안해…', '나도 미안해. 악수!'], en: ['Sorry…', 'Me too. Shake?'] },
  sFire:        { ko: ['불이야!', '연기가 나요!'], en: ['Fire!', 'Smoke!'] },
  sAlarm:       { ko: ['소방서에 알렸어요!', '땡땡땡!'], en: ['I rang the fire station!', 'Ding-ding-ding!'] },
  sCrew:        { ko: ['물러서세요! 금방 꺼요!', '물 대포 발사!'], en: ['Stand back! We’ll have it out in no time!', 'Water on!'] },
  sOut:         { ko: ['불 다 껐어요!', '모두 무사해요!'], en: ['Fire’s out!', 'Everyone is safe!'] },
  sCheer:       { ko: ['소방관 최고!', '와아—!', '고마워요!'], en: ['Firefighters are the best!', 'Hooray—!', 'Thank you!'] },
  sSafe:        { ko: ['우리 가족 다 괜찮아요', '집은 다시 지으면 돼요'], en: ['My family is all fine', 'We can build the house again'] },
  sMoveIn:      { ko: ['이삿짐 왔어요!', '여기가 우리 새 집이야!'], en: ['The truck is here!', 'This is our new home!'] },
  sMovers:      { ko: ['영차!', '조심조심~'], en: ['Heave-ho!', 'Careful~'] },
  sMoveOut:     { ko: ['그동안 고마웠어요!', '잘 지내요~ 안녕!'], en: ['Thank you for everything!', 'Take care~ bye!'] },
  sDrill:       { ko: ['훈련이에요~ 진짜 불 아니에요!', '호스 준비!'], en: ['Just a drill~ not a real fire!', 'Hose ready!'] },
};

/** item names for the wanted posters and the shouts */
export const ITEM_NAME = {
  item_bread: { ko: '빵', en: 'bun' }, item_fish_cooked: { ko: '생선구이', en: 'grilled fish' }, item_fish_raw: { ko: '생선', en: 'fish' },
  item_can: { ko: '통조림', en: 'tin' }, item_cake: { ko: '케이크', en: 'cake' }, item_apple: { ko: '사과', en: 'apple' }, item_flower: { ko: '꽃', en: 'flower' },
};

/** 받침 check for a Hangul word (the last syllable) */
export function hasBatchim(word) {
  const s = String(word || '');
  const c = s.charCodeAt(s.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return false;
  return (c - 0xac00) % 28 !== 0;
}

/** {key} vars and 이(가) / 을(를) / 은(는) / 와(과) particles after a filled var */
export function it(lang, key, vars, pick) {
  const e = ISTR[key];
  if (!e) return key;
  let s = e[lang === 'en' ? 'en' : 'ko'];
  if (Array.isArray(s)) s = s[(pick | 0) % s.length];
  if (!vars) return s;
  return String(s).replace(/\{(\w+)\}(이\(가\)|을\(를\)|은\(는\)|와\(과\)|가)?/g, (m, k, p) => {
    const v = vars[k] !== undefined ? String(vars[k]) : '';
    if (!p) return v;
    const b = hasBatchim(v);
    if (p === '이(가)') return v + (b ? '이' : '가');
    if (p === '을(를)') return v + (b ? '을' : '를');
    if (p === '은(는)') return v + (b ? '은' : '는');
    if (p === '와(과)') return v + (b ? '과' : '와');
    return v + p;
  });
}

export function itemName(item, lang) { const n = ITEM_NAME[item]; return n ? n[lang === 'en' ? 'en' : 'ko'] : (lang === 'en' ? 'snack' : '간식'); }
/** how many lines a shout key has */
export const lines = (key, lang) => { const e = ISTR[key]; const s = e && e[lang === 'en' ? 'en' : 'ko']; return Array.isArray(s) ? s.length : 1; };
