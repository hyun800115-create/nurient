// Story UI strings (ko + en). At integration they move into src/data/strings.js (P20) under the same keys; the
// story reads strings.js first and its own table second.

export const STR = {
  ko: {
    newsTitle: '솔방울 신문', newsNo: '제 {n}호', newsFirst: '창간호', newsSidebar: '마을 소식', newsClose: '닫기', newsWeather: '오늘의 날씨', newsQuote: '오늘의 한마디',
    cardTalk: '수다 떨기', cardAge: '{n}살', cardJob: '직업', cardHome: '집', cardBest: '단짝', cardSpouse: '배우자', cardPartner: '연인', cardKids: '아이',
    cardLikes: '좋아하는 것', cardChief: '촌장님에 대한 기억', cardNone: '아직 없어요', cardKnown: '단골 ★',
    nameTitle: '아기 이름을 지어 주세요!', nameSub: '{parents}네 아기예요', nameParents: '부모님이 정할게요', nameGift: '선물 상자도 함께 보낼게요',
    nameDone: '{name}! 예쁜 이름이에요', watch: '보러 가기', later: '나중에',
    gardenTitle: '기억의 정원', gardenRemember: '기억하는 사람들', farewellOffNote: '생애 이벤트를 끄면 이별 장면 없이 노년까지만 이어져요',
    // 설정 한 줄 (기획서_v5_생활과미션.md: "생애 이벤트: 켜기/끄기 (끄면 노년까지만, 이별 없음)") -> Settings.data.lifeFarewell
    setLifeEvents: '생애 이벤트', setLifeEventsSub: '끄면 노년까지만, 이별 없음',
    previewStone: '눈송이 할머니', previewTitle: '이야기 미리보기', previewNone: '근처에 주민이 없어요. 사람 많은 곳에서 다시 눌러 주세요',
    previewBusy: '지금은 다른 장면이 진행 중이에요',
    forgot: '주민들이 오늘 일을 조금 잊어버렸어요', saveFull: '이야기 저장 공간이 꽉 찼어요. 지난 이야기를 지킬게요',
    wedding: '결혼식', proposalYes: '네!', proposalAsk: '결혼해 줄래요?', vows: '평생 함께할게요', thanksChief: '촌장님, 그동안 고마웠어요. 마을이 참 따뜻해졌어요.',
    schoolBye: '다녀오겠습니다!', firstSteps: '아장아장!', wishSit: '아… 참 좋다', birthdayHb: '생일 축하해요!', dateLine: '오늘 정말 좋다',
    weather: { clear: '맑음', sunny: '화창함', mild: '포근함', cloudy: '흐림', light: '가랑눈', snow: '눈', heavy: '함박눈', blizzard: '눈보라', fog: '안개' },
  },
  en: {
    newsTitle: 'Pinecone News', newsNo: 'No. {n}', newsFirst: 'First issue', newsSidebar: 'Town notes', newsClose: 'Close', newsWeather: 'Weather', newsQuote: 'Overheard',
    cardTalk: 'Chat', cardAge: 'age {n}', cardJob: 'Job', cardHome: 'Home', cardBest: 'Best friend', cardSpouse: 'Spouse', cardPartner: 'Sweetheart', cardKids: 'Kids',
    cardLikes: 'Likes', cardChief: 'Remembers the chief', cardNone: 'not yet', cardKnown: 'Regular ★',
    nameTitle: 'Name the baby!', nameSub: 'The baby of {parents}', nameParents: 'Let the parents choose', nameGift: 'A gift box goes along too',
    nameDone: '{name}! What a lovely name', watch: 'Go and see', later: 'Later',
    gardenTitle: 'Memorial garden', gardenRemember: 'We remember', farewellOffNote: 'With life events off, residents grow old but never leave',
    setLifeEvents: 'Life events', setLifeEventsSub: 'Off: old age only, no farewells',
    previewStone: 'Grandma Snowflake', previewTitle: 'Story previews', previewNone: 'Nobody is nearby. Try again where people are',
    previewBusy: 'Another scene is playing right now',
    forgot: 'The townsfolk forgot a little of today', saveFull: 'The story save is full. The last good story is kept',
    wedding: 'Wedding', proposalYes: 'Yes!', proposalAsk: 'Will you marry me?', vows: 'Together, always', thanksChief: 'Chief, thank you for everything. The village has grown so warm.',
    schoolBye: 'I’m off to school!', firstSteps: 'Toddle toddle!', wishSit: 'Ah… this is lovely', birthdayHb: 'Happy birthday!', dateLine: 'What a lovely day',
    weather: { clear: 'Clear', sunny: 'Sunny', mild: 'Mild', cloudy: 'Cloudy', light: 'Light snow', snow: 'Snow', heavy: 'Heavy snow', blizzard: 'Blizzard', fog: 'Fog' },
  },
};

/** the string `key` in `lang` with {slots} filled */
export function s(lang, key, vars) {
  const t = (STR[lang] || STR.ko)[key] ?? STR.ko[key] ?? key;
  if (!vars || typeof t !== 'string') return t;
  return t.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}
