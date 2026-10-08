// Topic tags and small word lists for resident chat: what a line is about (생선, 빵, 눈 …), gift
// items the chief may name, and the nouns accepted as answers to a resident's question.

export const TOPICS = [
  { tag: '생선', re: /생선|물고기|낚시|고기 ?잡|고등어|연어|송어|대구/ },
  { tag: '빵', re: /빵|베이커리|크루아상|케이크|쿠키|반죽/ },
  { tag: '눈사람', re: /눈사람/ },
  { tag: '눈싸움', re: /눈싸움|눈덩이|눈뭉치/ },
  { tag: '날씨', re: /날씨|추워|춥|추운|바람|맑|눈보라|따뜻|더워|덥|함박눈|눈이 ?(와|온|내|펑)|햇살|구름|안개|오로라/ },
  { tag: '썰매', re: /썰매|스케이트|빙판|얼음/ },
  { tag: '동물', re: /강아지|멍멍|콩이|고양이|나비|야옹|펭귄|뽀삐|동물|새끼 ?곰|토끼/ },
  { tag: '음식', re: /코코아|수프|요리|밥|배고|맛있|먹|국밥|귤|사탕|우유|차 ?한/ },
  { tag: '일', re: /일하|일은|일이|일 ?많|장사|가게|손님|일터|대장간|망치|공방|창고|짐|배달|가공|제재|통조림/ },
  { tag: '마을', re: /마을|광장|공사|건물|짓|지었|새 집|분수|우물/ },
  { tag: '기차', re: /기차|기찻길|역|솔방울|이웃 ?마을/ },
  { tag: '음악', re: /노래|음악|춤|연주|공연|모닥불/ },
  { tag: '가족', re: /가족|엄마|아빠|할머니|할아버지|손주|동생|언니|오빠|형|누나|아기/ },
  { tag: '친구', re: /친구|같이 ?놀|놀자|단짝/ },
  { tag: '꿈', re: /꿈|소원|되고 ?싶|하고 ?싶|미래/ },
  { tag: '학교', re: /학교|숙제|공부|선생님|시험|수업/ },
  { tag: '건강', re: /감기|아파|아픈|병원|기침|열 ?나|피곤|졸려/ },
  { tag: '바다', re: /바다|배 ?타|항구|선장|파도|부두/ },
  { tag: '뜨개질', re: /뜨개|목도리|장갑|털실|스웨터/ },
  { tag: '선물', re: /선물/ },
];

/** gift items the chief can name (noun -> tag); longer names first */
export const ITEMS = [
  ['크림빵', '빵'], ['단팥빵', '빵'], ['빵', '빵'], ['쿠키', '빵'], ['케이크', '빵'],
  ['생선구이', '음식'], ['훈제 고기', '음식'], ['통조림', '음식'], ['생선', '생선'], ['코코아', '음식'], ['수프', '음식'],
  ['귤', '음식'], ['사탕', '음식'], ['딸기 우유', '음식'], ['우유', '음식'], ['당근', '음식'], ['국밥', '음식'], ['차', '음식'],
  ['꽃', '선물'], ['목도리', '뜨개질'], ['장갑', '뜨개질'], ['털실', '뜨개질'], ['모자', '선물'], ['편지', '선물'],
  ['통나무', '일'], ['판자', '일'], ['광석', '일'], ['주괴', '일'], ['도끼', '일'], ['곡괭이', '일'], ['망치', '일'], ['밀가루', '빵'],
  ['장난감', '선물'], ['공', '선물'], ['썰매', '썰매'], ['스케이트', '썰매'], ['그림', '선물'], ['책', '선물'],
].sort((a, b) => b[0].length - a[0].length);

export const ANIMALS = ['강아지', '고양이', '펭귄', '토끼', '곰', '여우', '사슴', '부엉이', '다람쥐', '물개', '햄스터', '새', '말', '오리', '돌고래', '고래', '판다', '양'];
export const COLORS = ['빨간색', '주황색', '노란색', '초록색', '파란색', '남색', '보라색', '분홍색', '하늘색', '하얀색', '검은색', '갈색', '회색', '민트색', '무지개색', '빨강', '파랑', '노랑', '초록', '보라', '분홍', '하양', '검정'];
export const FOODS = ['크림빵', '단팥빵', '소보로빵', '식빵', '크루아상', '케이크', '쿠키', '초코', '초콜릿', '딸기', '귤', '사과', '바나나', '생선구이', '국밥', '라면', '떡볶이', '김밥', '피자', '치킨', '호떡', '붕어빵', '군고구마', '코코아', '우유', '딸기 우유', '사탕', '젤리', '아이스크림', '수프', '빵'];

/** topic tags found in a text (in TOPICS order, at most `max`) */
export function topicsOf(text, max = 3) {
  const out = [];
  for (const t of TOPICS) if (t.re.test(text)) { out.push(t.tag); if (out.length >= max) break; }
  return out;
}

/** gift items named in a text */
export function itemsOf(text) {
  const out = [];
  let s = String(text || '');
  for (const [name, tag] of ITEMS) {
    const i = s.indexOf(name);
    if (i >= 0) { out.push({ name, tag }); s = s.slice(0, i) + ' '.repeat(name.length) + s.slice(i + name.length); }
  }
  return out;
}

/** a topic-tag noun for display: '생선' -> '생선 얘기' */
export function topicPhrase(tag) { return tag + ' 얘기'; }
