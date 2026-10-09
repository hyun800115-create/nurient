// Generic offline lines for resident chat, by intent. Persona cards (personas.js) override the most
// characterful ones (hi / how / work / joke / bye / ask / favor / busy); these fill everything else.
//
// Template language (ko.js render): {slot} {slot:을} {slot:이다} · {요} = 요 when polite ·
// [casual|polite]. Variant groups: def (everyone), kid (kids, toddler), old (casual grown-ups:
// 아저씨, 할아버지, 대장장이 …). Slots: chief, item, like, like2, dislike, job, weather, person,
// plike, rel, memo, fact, favor, topic, a.

export const GENERIC = {
  greeting: {
    def: ['{chief}! [안녕|안녕하세요]~', '어, {chief}! 반가워{요}~', '[왔어|오셨어요]? 반가워{요}~'],
    kid: ['{chief:이}다! 안녕~!', '우와, {chief}! 안녕!'],
    old: ['어, {chief} 왔구먼.', '허허, {chief}. 반갑네.'],
  },
  again: {
    def: ['또 [왔네|오셨네요]~ 헤헤', '{chief}, 또 [왔구나|오셨네요]! 반가워{요}~'],
    kid: ['또 왔다! 헤헤, 놀자~'],
    old: ['또 왔구먼. 껄껄.'],
  },
  how: {
    def: ['[나는|저는] 잘 지내{요}~ {chief:은}[?|요?]', '오늘은 {weather} 때문에 조금 추웠지만 괜찮아{요}~', '그럭저럭 잘 지내{요}~ {like} 생각하면서 힘내고 있어{요}~'],
    kid: ['완전 좋아! {chief:은}?', '좋아! 오늘 {like} 생각만 했어~'],
    old: ['그럭저럭 지내지. {chief:은} 어떤가?'],
  },
  weather: {
    snow: ['눈이 펑펑 오니까 마을이 하얗게 반짝반짝해{요}~', '이런 날엔 {like} 생각이 나{요}~', '눈 오는 날은 발자국 소리가 뽀득뽀득해서 좋아{요}~'],
    heavy: ['함박눈이 엄청 [와|와요]! 지붕 위에 눈이 소복소복~', '이렇게 눈이 많이 오면 눈사람 만들기 딱이[야|에요]~'],
    blizzard: ['눈보라가 장난 아니[야|에요]. 오늘은 집에 [있어야겠어|있어야겠어요]', '바람이 휘잉휘잉~ {chief}도 따뜻하게 [입어|입으세요]!'],
    clear: ['오늘은 하늘이 맑아서 기분이 좋아{요}~', '햇살이 눈에 반사돼서 반짝반짝[해|해요]~'],
    fog: ['안개가 자욱해서 앞이 잘 안 보[여|여요]. 조심히 [다녀|다니세요]!'],
    cold: ['손이 꽁꽁 얼었어{요}~ {chief}도 따뜻하게 [입어|입으세요]!'],
    old: ['허허, 이 정도 날씨쯤이야. 옛날엔 더 추웠지.'],
  },
  work: {
    def: ['오늘도 {job} 일 하느라 바빴어{요}~', '요즘 {job} 일이 재밌어{요}~ 손에 익었거든{요}~'],
    kid: ['나는 노는 게 일이야! 헤헤'],
    old: ['일이야 늘 하던 대로지 뭐.'],
  },
  gossipNone: {
    def: ['음… 요즘은 조용[해|해요]. 새 소식 생기면 제일 먼저 알려 줄게{요}~', '아직 들은 소문은 없어{요}~ {chief:은} 재밌는 일 있었어{요}?'],
    kid: ['음… 비밀인데, 아직 없어! 헤헤'],
  },
  // village rumours everyone knows (used when nobody has told this resident anything yet)
  rumorStatic: ['동쪽 안개 너머에 기찻길이 있대', '밤에 동쪽에서 기적 소리가 들렸대', '빵집에 새 빵이 나왔대', '광장 분수에 오리가 놀러 왔대', '이웃 솔방울 마을에도 눈이 엄청 왔대'],
  rumorIntro: { def: ['다들 그러던데,'], kid: ['있잖아,'] },
  person: {
    self: ['[나|저]? 헤헤, [나는|저는] {like:을} 제일 좋아해{요}~'],
    chief: ['{chief}? 우리 마을 최고의 촌장[이지|이죠]!'],
    high: ['{person}? [완전 좋아해|정말 좋아해요]! 우리 {rel:이다}~', '{person:이} 얼마나 좋은데{요}~ {plike:을} 좋아해서 같이 얘기하면 재밌어{요}~'],
    mid: ['{person}? 좋은 [사람이야|사람이에요]~ {plike:을} 좋아해{요}~', '{person:이랑}은 가끔 인사해{요}~ {plike} 얘기하면 신나 해{요}~'],
    low: ['{person}… 음, [좀 티격태격하는 사이야|조금 티격태격하는 사이예요]. 그래도 나쁜 [애는 아니야|사람은 아니에요]~'],
    none: ['{person}? 잘은 모르지만 {plike:을} 좋아한[대|대요]~'],
  },
  compliment: {
    def: ['[헤헤, 고마워|어머, 고마워요]~ {chief}도 [멋져|멋지세요]!', '[정말|정말요]? 기분 좋다~ 헤헤'],
    kid: ['헤헤, 진짜? {chief}도 최고야!'],
    old: ['흠흠… 칭찬은 무슨. …허허, 고맙구먼.'],
    again: ['또 칭찬이[야|에요]? [헤헤, 쑥스러워|아이참, 쑥스러워요]~', '[그만해~ 얼굴 빨개졌어|아이참, 얼굴 빨개졌어요]~'],
  },
  thanks: { def: ['[뭘|뭘요], 별거 아니[야|에요]~', '[헤헤, 나도 고마워|저도 고마워요]~'], old: ['허허, 고맙긴 뭘.'] },
  gift: {
    liked: ['와아, {item:이다}! [내가 제일 좋아하는 거야|제가 제일 좋아하는 거예요]! 고마워{요}~', '{item:이다}?! [나 이거 진짜 좋아해|저 이거 정말 좋아해요]! 고마워{요}~'],
    normal: ['{item:이다}! 고마워{요}~ 잘 쓸게{요}~', '[우와|어머], {item:을} [나한테|저한테] [주는 거야|주시는 거예요]? 고마워{요}~'],
    none: ['선물? [진짜|정말요]? 고마워{요}~ 두근두근해{요}~', '[나한테|저한테] 주는 거[야|예요]? 와, 고마워{요}~'],
    again: ['[또 줘|또 주시게요]? 오늘은 마음만 받을게{요}~'],
    favor: ['앗, [내가|제가] 부탁한 {item}! [진짜 고마워|정말 고마워요]~!'],
  },
  joke: {
    def: ['{chief}, 눈사람이 왜 웃었게{요}~? 당근 코가 간지러워서! 헤헤', '펭귄이 제일 좋아하는 과자는{요}? …펭귄 칩! 헤헤'],
    react: ['[ㅋㅋㅋ 진짜 웃겨|호호, 정말 재밌어요]~!', '[푸하하, 뭐야 그게|푸흡, 그게 뭐예요]~ ㅋㅋ'],
  },
  memoryNone: ['음… 우리 아직 얘기를 많이 못 했잖아{요}~ 오늘부터 잔뜩 기억할게{요}~'],
  memoryHas: ['[당연히 기억하지|그럼요, 기억하죠]! {memo}{요}~', '[그럼|그럼요]~ {memo}{요}~ [나 다 기억해|저 다 기억해요]!'],
  memoryFact: ['그리고 {fact}{요}~ [맞지|맞죠]?'],
  favorOpen: ['아까 부탁한 거 기억[하지|하시죠]? {favor}'],
  favorNone: ['지금은 괜찮아{요}~ 마음만으로도 고마워{요}~', '[음, 지금은 없어|음, 지금은 없어요]! 그래도 물어봐 줘서 고마워{요}~'],
  favorThanks: ['[진짜? 고마워|정말요? 고마워요]! 기억해 둘게{요}~'],
  farewell: { def: ['[잘 가|조심히 가세요]~ 또 [와|오세요]!', '[안녕|안녕히 가세요]~ 오늘 [재밌었어|즐거웠어요]!'], kid: ['잘 가~ 또 놀자!'], old: ['그래, 조심히 가게.'] },
  about: ['[나는|저는] {like:을} 제일 좋아해{요}~ {dislike:은} 좀 싫어{요}~', '좋아하는 거{요}? {like}! 그리고 {like2}도{요}~'],
  rude: { def: ['[치, 너무해|그런 말 들으니까 속상해요]…', '[흥! 나 삐졌어|어머, 그런 말은 좀 속상해요]…'], old: ['에잉, 말 한번 고약하구먼.'] },
  distress: ['{chief}, 많이 힘[든가 봐|드신가 봐요]. 그런 마음은 혼자 두지 말고 가족이나 선생님, 믿을 수 있는 사람한테 꼭 이야기해 [봐|보세요]. [나도|저도] 여기서 응원할게{요}.'],
  answerYes: ['[역시|역시요]! 그럴 줄 알았어{요}~', '[우와, 좋다|와, 좋네요]~!'],
  answerNo: ['[그렇구나|그렇군요]~ 괜찮아{요}~', '에이, [아쉽다|아쉽네요]~'],
  answerNoun: ['{a}! [나도|저도] {a} 좋아{요}~ 꼭 기억해 둘게{요}~', '{a:이다}? 오~ 기억해 둘게{요}~'],
  unknown: ['[그렇구나|그렇군요]~ {chief} 얘기 들으니까 [재밌다|재밌어요]!', '오~ [진짜|정말요]? 더 얘기해 [줘|주세요]!', '음… 무슨 말인지 잘 모르겠어{요}~ 다른 얘기 [해 줄래|해 주실래요]?'],
  topicLike: ['{topic}! [나도|저도] {topic} [좋아해|좋아해요]~', '{topic} 얘기[구나|군요]! [나|저] 그거 좋아해{요}~'],
  topicGeneric: ['{topic} 얘기[구나|군요]~ 재밌[다|네요]!', '오, {topic}? 더 [얘기해 줘|얘기해 주세요]~'],
  inviteYes: { def: ['좋아{요}! 지금 바로 [하자|해요]~', '[우와, 진짜? 좋아|정말요? 좋아요]! {topic} 최고[야|예요]~'], kid: ['좋아 좋아! 지금 당장 하자!', '야호! {topic} 하자~ 내가 이길 거야!'], old: ['껄껄, 좋지! 한판 하세.'] },
  inviteMaybe: ['음… 지금은 좀 바쁘니까 이따 [하자|해요]~', '그것도 재밌겠다{요}! 다음에 꼭 같이 [하자|해요]~'],
  confused: ['음… 그건 잘 모르겠어{요}~ 다른 얘기 [할래|할까요]?', '어라, 갑자기 머리가 하얘졌어{요}~ 다른 얘기 [하자|해요]!'],
  busy: ['앗, 이제 일하러 가 봐야겠어{요}~ 이따 또 얘기[하자|해요]!'],
  toddler: ['까르륵!', '{chief}! 눈! 눈!', '멍멍이~ 헤헤', '응! 응!', '빵! 빵!', '헤헤헤~'],
  // the opener when the chat opens, after a greeting
  openMemo: ['참, 저번에 {memo}{요}~', '저번에 {memo}{요}~ 헤헤'],
};

/** offline memory summaries (plain form, as the resident would write them in a diary) */
export const SUMMARY = {
  greeting: '촌장님이 인사하러 왔다',
  how: '촌장님이 내 안부를 물어봤다',
  weather: '촌장님이랑 날씨 얘기를 했다',
  work: '촌장님이 내 일에 대해 물어봤다',
  gossip: '촌장님한테 마을 소문을 전해 줬다',
  person: '촌장님이 {person} 얘기를 물어봤다',
  compliment: '촌장님이 나를 칭찬해 줬다',
  thanks: '촌장님이 나한테 고맙다고 했다',
  gift: '촌장님이 나한테 선물을 줬다',
  giftItem: '촌장님이 나한테 {item:을} 선물해 줬다',
  joke: '촌장님이랑 같이 웃었다',
  favor: '촌장님이 내 부탁을 들어주겠다고 했다',
  farewell: '촌장님이랑 즐겁게 수다를 떨었다',
  about: '촌장님이 내가 좋아하는 걸 물어봤다',
  rude: '촌장님이 나한테 서운한 말을 했다',
  distress: '촌장님이 많이 힘들어 보였다',
  answerNoun: '촌장님이 {a:을} 좋아한다고 알려 줬다',
  topic: '촌장님이랑 {topic} 얘기를 했다',
  invite: '촌장님이 같이 {topic}{하자}고 했다',
};

/** offline gossip other residents may spread ({@key} slots; {me} = the resident who talked) */
export const OFFLINE_GOSSIP = {
  gift: '{@chief:이} {@me}한테 선물을 줬대',
  giftItem: '{@chief:이} {@me}한테 {item:을} 선물했대',
  compliment: '{@chief:이} {@me:을} 엄청 칭찬했대',
  favor: '{@chief:이} {@me}의 부탁을 들어주기로 했대',
  favorDone: '{@chief:이} {@me}의 부탁을 들어줬대',
};
