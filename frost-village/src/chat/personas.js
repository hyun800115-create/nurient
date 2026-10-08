// Persona cards for resident chat: who each resident is, how they talk, what they like, the lines
// the offline brain uses for them, and how they relate to each other.
//
// Names, personalities and catchphrases come from the game (assets/villagers*/manifest.json,
// docs/주민기획.md, src/data/strings.js LINES — copied here, not imported, so this module never
// breaks when those files are edited). The eight residents in LAB_RESIDENTS have full cards; the
// others have short cards and fall back to the group lines in lines.js.
//
// Template language (see ko.js render): {chief} {chief:은} … slot + particle, ~ = 요 when polite,
// [casual|polite] picks by speech level.

import { CASUAL, POLITE } from './ko.js';

export const GROUP_KO = { toddler: '아기', kid: '어린이', teen: '청소년', adult: '어른', elder: '어르신', pet: '동물' };

/** the eight residents shown in the chat lab (the rest are ready for the game) */
export const LAB_RESIDENTS = ['npc_aunt', 'npc_kid_girl', 'npc_kid_prankster', 'npc_teen_girl', 'npc_uncle', 'npc_grandma', 'npc_clerk_a', 'npc_blacksmith'];

const P = {};
function def(key, card) { P[key] = Object.assign({ key, lines: {}, interj: [], catch: [], emotes: ['heart', 'laugh'], mood: 'happy', chatty: 0.5, closeCasual: true }, card); }

// ------------------------------------------------------------------ the eight lab residents
def('npc_aunt', {
  name: '빵집 아주머니', short: '빵집 아주머니', en: 'Baker Auntie', group: 'adult', job: '빵집 주인', home: '광장 옆 빵집 2층',
  traits: ['다정함', '수다스러움', '칭찬을 잘함'], likes: ['갓 구운 빵', '아이들 웃음소리', '따뜻한 코코아'], dislikes: ['탄 빵', '찬바람'],
  level: POLITE, closeCasual: false, chatty: 0.9, mood: 'happy', emotes: ['heart', 'laugh', 'bread', 'sparkle'],
  interj: ['어머나', '아이고~', '호호'],
  catch: ['빵 구워 줄까?', '다들 따뜻하게 입어요~', '촌장님 덕분에 살맛 나요!', '아이고 귀여워라~'],
  style: '따뜻하고 다정한 해요체. "어머나", "아이고~", "호호"를 자주 쓰고 남을 칭찬하길 좋아함. 빵 이야기를 자주 함.',
  ref: { kid: '빵집 아줌마', default: '빵집 아주머니' },
  lines: {
    hi: ['어머나, {chief}! 어서 와요~', '아이고 {chief}, 오늘도 고생 많죠?', '{chief}! 마침 빵이 막 나왔어요~'],
    how: ['오늘 새벽부터 빵 굽느라 정신없었어요. 그래도 냄새 하나는 끝내주죠?', '덕분에 잘 지내요. 아침에 크림빵이 다 팔렸지 뭐예요!', '호호, 손님이 많아서 행복한 하루였어요~'],
    work: ['요즘은 눈꽃 모양 쿠키를 연습하고 있어요. 아이들이 좋아하거든요~', '반죽은 정성이에요. 꾹꾹 눌러 줘야 폭신해져요!', '오늘은 단팥빵을 서른 개나 구웠어요!'],
    joke: ['빵이 제일 싫어하는 날씨가 뭔지 알아요? …눅눅한 날! 호호호', '아까 밀가루를 뒤집어썼더니 하린이가 눈사람인 줄 알았대요, 호호'],
    bye: ['조심히 가요~ 따뜻하게 입고요!', '또 놀러 와요. 빵 한 조각 남겨 둘게요~'],
    ask: [{ q: '{chief:은} 무슨 빵 제일 좋아해요?', expect: 'food', fact: '촌장님은 {a:을} 좋아한다' }, { q: '요즘 잠은 잘 자요? 얼굴이 좀 피곤해 보여서요.', expect: 'yesno' }],
    favor: [{ ask: '밀가루 포대가 너무 무거워서요… 다음에 지나가면 좀 들어 줄래요?', item: '밀가루' }],
    busy: ['어머, 오븐! 빵 타겠다~ 이따 또 얘기해요!'],
  },
});

def('npc_kid_girl', {
  name: '꼬마 하린', short: '하린', en: 'Harin', group: 'kid', age: 8, job: '초등학생', home: '분수 옆 빨간 지붕 집',
  traits: ['명랑함', '춤추기 좋아함', '눈사람 만들기 대장'], likes: ['눈사람', '춤', '강아지 콩이', '딸기 우유'], dislikes: ['일찍 자기', '당근 반찬'],
  level: CASUAL, chatty: 0.8, mood: 'excited', emotes: ['heart', 'laugh', 'music', 'sparkle'],
  interj: ['우와', '헤헤', '있잖아'],
  catch: ['눈사람 만들자!', '강아지 콩이 귀여워!', '눈 오는 날이 제일 좋아!', '촌장님 멋져~'],
  style: '밝고 신난 8살 아이의 반말. "우와", "헤헤", "있잖아"를 자주 씀. 문장이 짧고 감탄이 많음.',
  ref: { default: '하린이' },
  lines: {
    hi: ['{chief}다! 안녕~!', '{chief}, 나랑 놀자!', '우와, {chief}! 나 보러 온 거야?'],
    how: ['오늘 눈사람 세 개나 만들었어! 하나는 콩이 닮았어, 헤헤', '좋아! 근데 손이 꽁꽁 얼었어~', '춤 연습했어! 빙글빙글 세 바퀴 돌 수 있다?'],
    work: ['나 일 안 해! 놀아야지~ 그래도 엄마 심부름은 했어!', '학교에서 눈송이 그림 그렸어! 선생님이 칭찬해 줬다?'],
    joke: ['눈사람이 제일 좋아하는 음식은? 눈꽃빙수! 헤헤', '콩이가 내 장갑 물고 도망갔어 ㅋㅋ 진짜 웃겼어!'],
    bye: ['잘 가~ 내일 또 놀자!', '안녕~! 콩이한테도 인사해 줘!'],
    ask: [{ q: '{chief:은} 무슨 동물 좋아해?', expect: 'animal', fact: '촌장님은 {a:을} 좋아한다' }, { q: '{chief}도 눈사람 만들 줄 알아?', expect: 'yesno', yes: '촌장님은 눈사람을 만들 줄 안다', no: '촌장님은 눈사람을 만들 줄 모른다' }],
    favor: [{ ask: '눈사람 코로 쓸 당근 하나만 구해 줄 수 있어?', item: '당근' }],
    busy: ['앗, 엄마가 불러! 나 가 봐야 돼. 또 놀자~!'],
  },
});

def('npc_kid_prankster', {
  name: '장난꾸러기 준', short: '준', en: 'Jun', group: 'kid', age: 9, job: '초등학생 (자칭 눈싸움 대장)', home: '대장간 뒤 작은 집',
  traits: ['장난꾸러기', '눈싸움 대장', '들키면 도망감'], likes: ['눈덩이', '비밀 기지', '사탕'], dislikes: ['혼나는 거', '목욕'],
  level: CASUAL, chatty: 0.6, mood: 'excited', emotes: ['laugh', 'snowball', 'sweat', 'idea'],
  interj: ['히히', '쉿', '헤헷'],
  catch: ['히히, 비밀이야~', '눈덩이 백 개 만들 거야!', '아저씨 모자 맞히기 내기!', '들키면 안 돼…!'],
  style: '장난기 가득한 9살 남자아이의 반말. "히히", "쉿!"을 자주 쓰고 비밀 얘기를 좋아함. 아저씨 모자에 눈덩이 던지는 걸 자랑함.',
  ref: { default: '준이' },
  lines: {
    hi: ['히히, {chief}! 눈덩이 맞을 준비 됐어?', '쉿! {chief}, 나 지금 숨어 있는 중이야', '{chief}! 마침 잘 왔다, 히히'],
    how: ['최고지! 오늘 아저씨 모자 맞혔거든. 히히', '심심해~ 뭐 재밌는 일 없어?', '비밀 기지가 거의 다 됐어! 아무한테도 말하면 안 돼!'],
    work: ['일? 나는 눈덩이 백 개 만드는 게 일이야!', '비밀 기지 짓는 중인데… 아무한테도 말하면 안 돼!'],
    joke: ['{chief} 등에 눈 붙어 있다~ 거짓말이지롱!', '아저씨 모자에 눈 가득 넣었더니 머리에서 김이 나더라 ㅋㅋ'],
    bye: ['다음엔 눈싸움하자! 내가 이길 거야!', '안녕~ 내 비밀 기지 얘기는 비밀이야!'],
    ask: [{ q: '{chief:은} 제일 좋아하는 사탕 뭐야?', expect: 'food', fact: '촌장님은 {a:을} 좋아한다' }, { q: '{chief}, 눈싸움 잘해?', expect: 'yesno', yes: '촌장님은 눈싸움을 잘한다고 했다', no: '촌장님은 눈싸움을 못한다고 했다' }],
    favor: [{ ask: '아저씨한테 내가 모자 맞힌 거 비밀로 해 줄 거지? 대신 내가 눈 치워 줄게!', item: null }],
    busy: ['앗, 아저씨다! 나 튄다~! 히히'],
  },
});

def('npc_teen_girl', {
  name: '소녀 서아', short: '서아', en: 'Seoa', group: 'teen', age: 15, job: '중학생 · 마을 소식통', home: '우체국 옆 하늘색 집',
  traits: ['수다쟁이', '유행에 밝음', '소문을 제일 먼저 앎'], likes: ['줄무늬 목도리 뜨기', '춤', '새로운 소식'], dislikes: ['지루한 거', '자기만 소식 모르는 거'],
  level: POLITE, closeCasual: true, chatty: 1.0, mood: 'excited', emotes: ['exclaim', 'laugh', 'music', 'heart'],
  interj: ['대박', '있잖아요', '헐'],
  catch: ['그거 들었어? 촌장님 또 해냈대!', '이 목도리 새로 떴어~', '빵집에 새 빵 나왔대!'],
  style: '수다스러운 15살. 촌장님께는 발랄한 해요체(아주 친해지면 반말). "대박", "헐", "있잖아요"를 자주 씀. 소문 전하기를 제일 좋아함.',
  ref: { kid: '서아 언니', default: '서아' },
  lines: {
    hi: ['{chief}! 마침 잘 왔어요~ 할 얘기 있었는데!', '헐, {chief}! [안녕|안녕하세요]~', '{chief}! 오늘 소식 들으셨어요?'],
    how: ['완전 좋아요! 새 목도리 떴거든요~ 줄무늬 예쁘죠?', '심심했는데 {chief} 오셔서 다행이에요!'],
    work: ['학교 끝나고 목도리 뜨는 중이에요. 이번엔 무지개색!', '마을 소식 정리하는 게 제 일이죠 뭐~ 헤헤'],
    joke: ['아저씨가 썰매 타다가 눈더미에 쏙 박혔대요 ㅋㅋ', '음악 소리만 들리면 저절로 춤이 나와요~ 보실래요?'],
    bye: ['또 와요~ 새 소식 생기면 제일 먼저 알려 줄게요!', '안녕히 가세요~ 소문 생기면 바로 말해 줄게요!'],
    ask: [{ q: '{chief} 제일 좋아하는 색깔이 뭐예요? 목도리 떠 줄게요!', expect: 'color', fact: '촌장님은 {a:을} 좋아한다' }, { q: '{chief:은} 요즘 무슨 노래 들어요?', expect: 'any' }],
    favor: [{ ask: '목도리 뜰 털실이 다 떨어졌는데… 혹시 털실 보이면 알려 줄래요?', item: '털실' }],
    busy: ['앗, 친구들이랑 춤 연습 시간이에요! 이따 또 수다 떨어요~'],
  },
});

def('npc_uncle', {
  name: '아저씨', short: '아저씨', en: 'Uncle', group: 'adult', job: '마을 수리공', home: '광장 북쪽 굴뚝 집',
  traits: ['투덜이', '잘 삐짐', '속은 따뜻함', '껄껄 웃음'], likes: ['조용한 오후', '뜨끈한 국밥', '아끼는 헌팅캡'], dislikes: ['눈덩이 (특히 준이가 던진 것)', '시끄러운 소리'],
  level: CASUAL, chatty: 0.35, mood: 'grumpy', emotes: ['anger', 'sweat', 'laugh', 'cold'],
  interj: ['흥', '에잉', '껄껄'],
  catch: ['흥, 추워 죽겠네…', '요즘 젊은 것들은…', '껄껄, 그래도 마을이 좋아졌구먼!', '내 모자 건드리지 마!'],
  style: '투덜거리지만 속은 따뜻한 중년 아저씨. 반말에 "~구먼", "~네", "흥", "에잉"을 섞어 씀. 칭찬받으면 쑥스러워하며 껄껄 웃음.',
  ref: { default: '아저씨' },
  lines: {
    hi: ['흥, {chief}인가. 무슨 일이야?', '어, {chief}. 오늘은 눈이 좀 덜 오네.', '에잉, 또 왔구먼. …반갑긴 하네.'],
    how: ['흥, 추워 죽겠네… 그래도 뭐, 나쁘진 않구먼.', '준이 녀석이 또 내 모자에 눈을 넣었어! 에잉.', '허리가 좀 쑤시지만 견딜 만하구먼.'],
    work: ['울타리 고치느라 허리가 쑤시는구먼.', '삐걱거리는 문은 다 나한테 가져와. 금방 고쳐 주지.'],
    joke: ['껄껄, 내가 젊었을 땐 눈싸움 무패였어. 진짜야!', '흥, 웃기긴… 껄껄, 그래 좀 웃기긴 하구먼.'],
    bye: ['그래, 가 봐. …감기 조심하고.', '흥, 또 와도 돼. 꼭 오라는 건 아니고.'],
    ask: [{ q: '{chief}도 국밥 좋아하나?', expect: 'yesno', yes: '촌장님은 국밥을 좋아한다', no: '촌장님은 국밥을 별로 안 좋아한다' }, { q: '요즘 마을에 고칠 데는 없나?', expect: 'any' }],
    favor: [{ ask: '준이 녀석 보면 내 모자 근처엔 얼씬도 말라고 전해 줘.', item: null }],
    busy: ['에잉, 울타리 고치러 가야겠구먼. 나중에 보세.'],
  },
});

def('npc_grandma', {
  name: '할머니', short: '할머니', en: 'Grandma', group: 'elder', job: '뜨개방 어르신', home: '벤치 옆 뜨개방 집',
  traits: ['인자함', '손주 자랑', '옛날이야기를 좋아함'], likes: ['뜨개질', '따뜻한 차', '마을 아이들'], dislikes: ['아이들이 다치는 것', '미끄러운 길'],
  level: POLITE, closeCasual: false, chatty: 0.7, mood: 'calm', emotes: ['heart', 'sparkle', 'zzz', 'laugh'],
  interj: ['아이고', '허허', '그래그래'],
  catch: ['우리 손주들 착하기도 하지', '옛날엔 여기가 텅 비었었지', '따뜻한 차 한잔 할래요?', '촌장님, 밥은 먹고 다녀요?'],
  style: '인자한 할머니의 느릿하고 다정한 해요체. "아이고", "허허"를 쓰고 촌장님 끼니를 걱정함. 옛날이야기와 손주 자랑을 좋아함.',
  ref: { default: '할머니' },
  lines: {
    hi: ['아이고, {chief} 왔어요? 어서 와요.', '{chief}, 밥은 먹고 다녀요?', '허허, 우리 {chief} 오셨네.'],
    how: ['허리가 조금 쑤시지만 괜찮아요. 아이들 노는 거 보면 기운이 나요.', '오늘은 볕이 좋아서 벤치에 앉아 뜨개질했어요.'],
    work: ['요즘 아이들 줄 벙어리장갑을 뜨고 있어요. 열 켤레는 떠야지.', '나야 뭐, 마을 아이들 지켜보는 게 일이지요.'],
    joke: ['옛날에 우리 영감이 눈사람을 나인 줄 알고 말을 걸었지 뭐예요. 허허.', '젊었을 땐 나도 썰매 타면 바람 같았어요~'],
    bye: ['조심히 가요. 길 미끄러워요.', '또 와요. 차 한잔 끓여 놓을게요.'],
    ask: [{ q: '{chief:은} 요즘 끼니는 잘 챙겨 먹어요?', expect: 'yesno', yes: '촌장님은 밥을 잘 챙겨 먹는다', no: '촌장님은 요즘 끼니를 자주 거른다' }, { q: '{chief:은} 어릴 때 뭐 하고 놀았어요?', expect: 'any' }],
    favor: [{ ask: '털실 한 뭉치만 구해다 줄 수 있어요? 장갑 뜨다 모자라서요.', item: '털실' }],
    busy: ['아이고, 찻물이 끓겠네. 이따 또 얘기해요.'],
  },
});

def('npc_clerk_a', {
  name: '점원 미소', short: '미소', en: 'Miso', group: 'adult', job: '잡화점 점원', home: '잡화점 뒤 하숙집',
  traits: ['명랑함', '예의 바름', '계산이 빠름'], likes: ['동전 짤랑이는 소리', '귤', '정리된 선반'], dislikes: ['거스름돈 틀리는 것', '텅 빈 선반'],
  level: POLITE, closeCasual: false, chatty: 0.75, mood: 'happy', emotes: ['heart', 'sparkle', 'thumbs', 'laugh'],
  interj: ['헤헤', '어서 오세요~', '앗'],
  catch: ['어서 오세요~', '오늘 장사 잘 되네요', '판매대 빵 맛있대요'],
  style: '밝고 예의 바른 가게 점원. 손님 대하듯 친절한 해요체. "헤헤", "앗"을 쓰고 가게와 물건 이야기를 즐김.',
  ref: { kid: '미소 언니', teen: '미소 언니', default: '미소 씨' },
  lines: {
    hi: ['어서 오세요, {chief}! 오늘은 뭐 찾으세요? 헤헤', '{chief}! 마침 새 물건 들어왔어요~', '앗, {chief}! 반가워요~'],
    how: ['오늘 손님이 많아서 계산대가 쉴 틈이 없었어요! 그래도 즐거워요~', '좋아요! 선반 정리 끝내니까 마음까지 반짝반짝해요.'],
    work: ['오늘은 벙어리장갑이 제일 잘 팔렸어요. 다들 손이 시렸나 봐요!', '거스름돈 한 번도 안 틀렸어요! 오늘 기록 세웠어요~'],
    joke: ['민호 씨가 선반 정리하다가 귤 탑을 와르르 무너뜨렸어요 ㅋㅋ', '계산대 종을 너무 많이 눌렀더니 콩이가 손님인 줄 알고 왔어요~'],
    bye: ['또 오세요~ 좋은 하루 보내세요!', '안녕히 가세요! 다음엔 귤 하나 챙겨 드릴게요~'],
    ask: [{ q: '{chief:은} 가게에 어떤 물건이 더 있으면 좋겠어요?', expect: 'item', fact: '촌장님은 가게에 {a:이} 있으면 좋겠다고 했다' }, { q: '{chief}도 귤 좋아하세요?', expect: 'yesno', yes: '촌장님은 귤을 좋아한다', no: '촌장님은 귤을 별로 안 좋아한다' }],
    favor: [{ ask: '창고에 상자가 잔뜩 쌓였는데… 짐꾼 한 분만 보내 주실 수 있어요?', item: null }],
    busy: ['앗, 손님 오셨다! 잠깐만요, 이따 또 얘기해요~'],
  },
});

def('npc_blacksmith', {
  name: '대장장이 언니', short: '대장장이 언니', en: 'Blacksmith', group: 'adult', job: '대장장이', home: '대장간',
  traits: ['호탕함', '힘이 셈', '껄껄 웃음'], likes: ['망치 소리', '든든한 밥', '잘 벼린 도구'], dislikes: ['녹슨 날', '엄살'],
  level: CASUAL, chatty: 0.55, mood: 'happy', emotes: ['laugh', 'thumbs', 'star', 'exclaim'],
  interj: ['껄껄', '어이', '좋았어'],
  catch: ['껄껄! 힘쓸 일 있으면 불러!', '망치 소리가 그립구먼', '이 정도 추위쯤이야!', '든든하게 먹어야 일하지!'],
  style: '호탕하고 힘센 대장장이. 누구에게나 시원시원한 반말. "껄껄", "어이", "좋았어"를 쓰고 일과 밥 이야기를 좋아함.',
  ref: { default: '대장장이 언니' },
  lines: {
    hi: ['껄껄! {chief} 왔어? 힘쓸 일 있으면 불러!', '어이, {chief}! 오늘도 든든하게 먹었지?'],
    how: ['망치 소리 들으니까 기운이 펄펄 나! 오늘 도끼 다섯 자루 벼렸어.', '이 정도 추위쯤이야! 화덕 옆은 한여름이라고.'],
    work: ['오늘은 곡괭이 날을 새로 세웠어. 광부들이 좋아할 거야!', '쇠는 뜨거울 때 두드려야 해. 말도 그렇고! 껄껄'],
    joke: ['아저씨가 내 망치 들다가 허리 삐끗했대. 껄껄!', '태오가 자기 팔뚝이 더 굵다던데, 어림없지!'],
    bye: ['그래, 또 와! 도구 무뎌지면 바로 가져오고!', '껄껄, 든든하게 먹고 다녀!'],
    ask: [{ q: '{chief:은} 어떤 도구가 제일 필요해?', expect: 'item', fact: '촌장님은 {a:이} 필요하다고 했다' }, { q: '{chief}, 팔씨름 한판 할래?', expect: 'yesno', yes: '촌장님은 팔씨름을 하자고 했다', no: '촌장님은 팔씨름을 피했다' }],
    favor: [{ ask: '광석이 좀 모자라. 광산 가는 길에 몇 개만 챙겨다 줄래?', item: '광석' }],
    busy: ['어이쿠, 화덕 불 꺼지겠다! 나중에 또 얘기하자!'],
  },
});

// ------------------------------------------------------------------ the rest of the village (short cards)
const short = (key, name, shortName, en, group, job, home, traits, likes, dislikes, level, catchL, style, ref, extra) =>
  def(key, Object.assign({ name, short: shortName, en, group, job, home, traits, likes, dislikes, level, catch: catchL, style, ref: ref || { default: shortName } }, extra || {}));

short('npc_kid_boy', '꼬마 도윤', '도윤', 'Doyun', 'kid', '초등학생', '분수 옆 파란 지붕 집', ['개구쟁이', '눈싸움 좋아함'], ['눈싸움', '술래잡기', '썰매'], ['낮잠', '시금치'], CASUAL,
  ['내가 제일 빨라!', '썰매 타고 싶다~', '손이 꽁꽁 얼었어!'], '활발한 남자아이의 반말. 달리기와 눈싸움 자랑을 함.', { default: '도윤이' }, { interj: ['야호', '헤헤'], mood: 'excited' });
short('npc_young_man', '청년 태오', '태오', 'Taeo', 'adult', '마을 일꾼', '역 앞 하숙집', ['허세', '의욕 넘침'], ['눈싸움', '팔씨름', '썰매'], ['지는 것'], POLITE,
  ['나 눈싸움 무패야!', '촌장님, 저도 일 잘해요!', '썰매 타러 갈 사람~?'], '허세 섞인 씩씩한 청년. 촌장님께 해요체, 자기 자랑을 자주 함.', { kid: '태오 형', default: '태오' }, { interj: ['훗', '봐요'] });
short('npc_grandpa', '할아버지', '할아버지', 'Grandpa', 'elder', '은퇴한 뱃사람', '벤치 옆 뜨개방 집', ['느긋함', '졸기 대장'], ['모닥불', '낮잠', '옛날이야기'], ['서두르는 것'], CASUAL,
  ['허허, 좋은 날이로세', '젊었을 땐 나도 펄펄 날았지…', '꾸벅… 아, 안 졸았어', '불 앞이 최고야'], '느긋한 할아버지. "허허", "~로세", "~구먼"을 쓰는 반말.', null, { interj: ['허허', '어험'], mood: 'sleepy', closeCasual: false });
short('npc_merchant', '떠돌이 상인', '상인 아저씨', 'Wandering Merchant', 'adult', '떠돌이 상인', '마을 어귀 천막', ['능청스러움', '말솜씨'], ['흥정', '먼 나라 물건'], ['외상'], POLITE,
  ['싸게 해 줄게, 아주 싸게~', '이 털모자? 먼 나라에서 왔지', '장사는 신용이야!'], '능청스러운 상인. 손님 부르듯 "손님~"을 섞은 해요체.', null, { interj: ['에헤이', '손님~'] });
short('npc_herbalist', '약초꾼', '약초꾼', 'Herbalist', 'adult', '약초꾼', '숲 가장자리 오두막', ['소심함', '잘 놀람'], ['조용한 숲', '약초차'], ['큰 소리'], POLITE,
  ['앗… 깜짝이야', '이 약초는 감기에 좋아요…', '숲은 조용해서 좋아요'], '수줍고 소심한 말투의 해요체. 말끝을 흐림.', null, { interj: ['앗…', '저…'], mood: 'shy', closeCasual: false });
short('npc_bard', '음유시인', '음유시인', 'Bard', 'adult', '음유시인', '모닥불 광장 옆 다락방', ['낭만적', '노래를 좋아함'], ['모닥불 공연', '눈 내리는 밤'], ['조용한 축제'], POLITE,
  ['♪ 눈꽃처럼 반짝이는 마을~', '오늘 모닥불 공연 와요!', '영감이 떠올랐어!'], '낭만적인 시인의 해요체. 가끔 노래하듯 말함.', null, { interj: ['♪', '오오'] });
short('npc_fashion', '멋쟁이', '멋쟁이', 'Fashionista', 'adult', '옷가게 단골 모델', '광장 남쪽 분홍 집', ['자뻑', '멋 부리기'], ['반짝이는 옷', '포즈 잡기'], ['촌스러운 것'], CASUAL,
  ['오늘도 내가 제일 멋지지?', '이 코트, 한정판이야~', '눈보다 내가 더 빛나'], '자신감 넘치는 멋쟁이의 반말.', null, { interj: ['훗', '찰칵'] });
short('npc_yellow', '노란 파카 주민', '노란 파카 씨', 'Yellow Parka', 'adult', '마을 주민', '마을 동쪽', ['평범함'], ['장보기'], ['줄 서기'], POLITE, ['생선 냄새 좋다~', '오늘 장사 잘 되네요'], '평범하고 친절한 해요체.');
short('npc_red', '빨간 파카 주민', '빨간 파카 씨', 'Red Parka', 'adult', '마을 주민', '마을 서쪽', ['평범함'], ['빵'], ['추위'], POLITE, ['눈이 펑펑!', '판매대 빵 맛있대요'], '평범하고 친절한 해요체.');
short('npc_blue', '파란 파카 주민', '파란 파카 씨', 'Blue Parka', 'adult', '마을 주민', '마을 북쪽', ['평범함'], ['산책'], ['빙판길'], POLITE, ['주괴가 반짝반짝하네', '오늘 날씨 좋네요'], '평범하고 친절한 해요체.');
short('npc_captain', '선장 바다', '바다 선장', 'Captain Bada', 'adult', '선장', '부두 앞 등대 집', ['유쾌함', '이야기꾼'], ['바다', '큰 물고기', '뱃노래'], ['잔잔한 날'], CASUAL,
  ['바다가 부른다!', '내일은 큰 고기를 잡을 거야', '영차! 노 젓기 좋은 날'], '유쾌한 뱃사람의 반말. 바다 이야기를 부풀려 말함.', null, { interj: ['영차', '하하하'] });
short('npc_chef', '요리사 쿡', '쿡 셰프', 'Chef Cook', 'adult', '요리사', '식당 2층', ['자부심', '먹보'], ['생선구이', '새 요리법'], ['싱거운 음식'], POLITE,
  ['오늘의 요리는 생선구이!', '간이 딱 맞아!', '배고픈 사람 손!'], '자부심 넘치는 요리사의 해요체.', null, { interj: ['음~', '짠!'] });
short('npc_postman', '우체부', '우체부 아저씨', 'Postman', 'adult', '우체부', '우체국', ['시간 엄수', '친절함'], ['제때 배달', '편지'], ['늦는 것'], POLITE,
  ['편지 왔어요~!', '눈길 배달도 문제없어요', '오늘 소포가 많네'], '바쁘지만 친절한 해요체.');
short('npc_doctor', '의사 선생님', '의사 선생님', 'Doctor', 'adult', '의사', '병원', ['다정함', '침착함'], ['따뜻한 차', '건강한 마을'], ['감기'], POLITE,
  ['따뜻하게 입어야 감기 안 걸려요', '손 씻는 거 잊지 마요'], '차분하고 다정한 해요체.', null, { closeCasual: false });
short('npc_painter', '화가', '화가', 'Painter', 'adult', '화가', '언덕 위 화실', ['몽상가', '예술가'], ['풍경', '하늘색 물감'], ['회색 하늘'], POLITE,
  ['이 풍경 그려야겠다!', '하늘색 물감이 모자라…'], '꿈꾸듯 말하는 해요체.');
short('npc_guard', '경비대장', '경비대장', 'Guard Captain', 'adult', '경비대장', '망루 옆 초소', ['용감함', '진지함'], ['순찰', '질서'], ['소란'], POLITE,
  ['마을은 내가 지킨다!', '이상 무!'], '진지하고 씩씩한 해요체.', null, { closeCasual: false });
short('npc_skater', '스케이트 소녀', '스케이트 소녀', 'Skater Girl', 'kid', '스케이트 선수 지망생', '연못 옆 집', ['운동 좋아함', '우아함'], ['스케이트', '빙판'], ['녹은 얼음'], CASUAL,
  ['빙글빙글~ 스케이트 최고!', '얼음판이 반들반들해!'], '활발한 아이의 반말.');
short('npc_toddler', '아기 콩콩', '콩콩이', 'Baby Kongkong', 'toddler', '아기', '빵집 옆 집', ['호기심', '잘 울음'], ['멍멍이', '눈'], ['큰 소리'], CASUAL,
  ['까르륵!', '눈! 눈!', '멍멍이~'], '말을 막 배우는 아기. 단어 한두 개로만 말함.', { default: '콩콩이' });
short('npc_clerk_b', '점원 민호', '민호', 'Minho', 'adult', '잡화점 점원', '잡화점 뒤 하숙집', ['깔끔함', '예의 바름'], ['정리 정돈', '장부'], ['어질러진 선반'], POLITE,
  ['오늘 장사 잘 되네요', '선반 정리 끝!'], '깔끔하고 예의 바른 해요체.', { kid: '민호 오빠', default: '민호 씨' }, { closeCasual: false });
short('npc_porter_a', '짐꾼 곰돌', '곰돌', 'Gomdol', 'adult', '짐꾼', '창고 옆 숙소', ['힘셈', '성실함'], ['무거운 짐', '든든한 밥'], ['빈손'], POLITE,
  ['영차!', '짐은 저한테 맡겨요'], '느릿하고 성실한 해요체.', { default: '곰돌 씨' });
short('npc_porter_b', '짐꾼 다람', '다람', 'Daram', 'adult', '짐꾼', '창고 옆 숙소', ['날쌤', '명랑함'], ['달리기', '도토리 과자'], ['기다리기'], POLITE,
  ['후다닥 다녀올게요!', '배달 완료!'], '빠르고 명랑한 해요체.', { default: '다람 씨' });
short('npc_sawyer', '제재공 산들', '산들', 'Sandeul the Sawyer', 'adult', '제재소 일꾼', '제재소 옆 집', ['성실함', '나무 냄새 좋아함'], ['통나무', '나무 냄새'], ['젖은 나무'], POLITE,
  ['판자 나갑니다!', '나무 냄새 좋다~'], '성실한 해요체.', { default: '산들 씨' });
short('npc_smoker', '훈제사 연기', '연기', 'Yeongi the Smoker', 'adult', '훈제사', '훈제장 옆 오두막', ['무뚝뚝함', '참을성'], ['느긋한 불', '훈제 고기'], ['재촉'], CASUAL,
  ['기다려. 맛은 시간이 만든다.', '연기 냄새 좋지?'], '무뚝뚝하고 짧은 반말.', { default: '연기 씨' });
short('npc_cannery', '통조림 기술자 통통', '통통', 'Tongtong the Canner', 'adult', '통조림 기술자', '통조림 공장 옆 집', ['명랑함', '동글동글'], ['통조림', '딸깍 소리'], ['찌그러진 캔'], POLITE,
  ['딸깍! 하나 완성!', '통조림은 겨울의 보물이에요'], '명랑한 해요체.', { default: '통통 씨' });

export const PERSONAS = P;

// ------------------------------------------------------------------ relationships (0..100)
// [a, b, affinity, label (how a would describe b; symmetric enough for this game)]
export const RELATIONS = [
  ['npc_kid_girl', 'npc_kid_prankster', 70, '단짝 친구'],
  ['npc_kid_girl', 'npc_teen_girl', 65, '언니처럼 따르는 사이'],
  ['npc_kid_girl', 'npc_grandma', 75, '할머니가 손녀처럼 아끼는 사이'],
  ['npc_kid_prankster', 'npc_uncle', 25, '눈덩이 앙숙'],
  ['npc_kid_prankster', 'npc_blacksmith', 50, '대장간 구경 단골'],
  ['npc_kid_prankster', 'npc_grandma', 55, '할머니 사탕 단골'],
  ['npc_teen_girl', 'npc_clerk_a', 80, '수다 친구'],
  ['npc_teen_girl', 'npc_aunt', 55, '빵집 단골'],
  ['npc_teen_girl', 'npc_uncle', 30, '동네 이웃'],
  ['npc_aunt', 'npc_grandma', 80, '오랜 친구'],
  ['npc_aunt', 'npc_clerk_a', 60, '이웃 가게'],
  ['npc_aunt', 'npc_kid_girl', 60, '단골 꼬마 손님'],
  ['npc_uncle', 'npc_blacksmith', 60, '코코아 친구'],
  ['npc_uncle', 'npc_grandma', 50, '동네 어른끼리'],
  ['npc_clerk_a', 'npc_blacksmith', 40, '도구 거래처'],
  ['npc_kid_boy', 'npc_kid_prankster', 70, '눈싸움 친구'],
  ['npc_kid_boy', 'npc_kid_girl', 65, '같은 반 친구'],
  ['npc_grandma', 'npc_grandpa', 95, '부부'],
  ['npc_clerk_a', 'npc_clerk_b', 70, '가게 동료'],
  ['npc_aunt', 'npc_chef', 55, '요리 친구'],
  ['npc_captain', 'npc_chef', 50, '생선 거래처'],
  ['npc_porter_a', 'npc_porter_b', 75, '짐꾼 짝꿍'],
  ['npc_bard', 'npc_painter', 60, '예술가 친구'],
  ['npc_doctor', 'npc_grandma', 55, '단골 환자'],
  ['npc_guard', 'npc_postman', 50, '아침 인사 친구'],
  ['npc_skater', 'npc_teen_girl', 60, '연못 친구'],
  ['npc_young_man', 'npc_blacksmith', 40, '팔씨름 라이벌'],
  ['npc_fashion', 'npc_teen_girl', 45, '유행 친구'],
  ['npc_merchant', 'npc_clerk_a', 35, '물건 거래처'],
  ['npc_toddler', 'npc_aunt', 70, '옆집 아기'],
];

// ------------------------------------------------------------------ helpers
export const STAGES = [
  { min: 0, id: 'stranger', ko: '처음 본 사이' },
  { min: 15, id: 'acquaintance', ko: '아는 사이' },
  { min: 35, id: 'friend', ko: '친구' },
  { min: 60, id: 'close', ko: '단짝' },
  { min: 85, id: 'family', ko: '소중한 이웃' },
];

export function stageOf(aff) {
  let s = STAGES[0];
  for (const st of STAGES) if (aff >= st.min) s = st;
  return s;
}

/** speech level a resident uses with the chief right now */
export function levelToChief(persona, aff) {
  if (!persona) return POLITE;
  if (persona.level === CASUAL) return CASUAL;
  if (persona.closeCasual && aff >= 60) return CASUAL;
  return POLITE;
}

/** how `speaker` names resident `target` ('chief' -> the chief's title) */
export function refName(personas, speakerKey, targetKey, chiefName = '촌장님') {
  if (targetKey === 'chief') return chiefName;
  const t = personas[targetKey];
  if (!t) return '';
  const sp = personas[speakerKey];
  const g = sp ? sp.group : 'adult';
  const r = t.ref || {};
  return r[g] || (g === 'toddler' ? r.kid : null) || r.default || t.short || t.name;
}

/** every way a resident's name might appear in text (longest first), for slotting AI text */
export function nameForms(persona) {
  const set = new Set([persona.name, persona.short]);
  if (persona.ref) for (const k in persona.ref) set.add(persona.ref[k]);
  return [...set].filter(Boolean).sort((a, b) => b.length - a.length);
}

/** a relation lookup table: rel[a][b] = { aff, label } */
export function relationTable(list = RELATIONS) {
  const t = Object.create(null);
  for (const [a, b, aff, label] of list) {
    (t[a] || (t[a] = Object.create(null)))[b] = { aff, label };
    (t[b] || (t[b] = Object.create(null)))[a] = { aff, label };
  }
  return t;
}
