// 솔방울 물류센터 strings: Korean + English (designer-facing and in-game). lt(lang, key, vars) fills {name} slots.

export const LSTR = {
  name: { ko: '솔방울 물류센터', en: 'Pinecone Logistics Centre' },
  site: { ko: '물류센터 짓기', en: 'Build the logistics centre' },
  letter: { ko: '은행장님 편지: "가게들이 물건을 더 빨리 받고 싶어해요. 큰 물류센터를 지으면 어떨까요?"', en: 'A letter from the bank manager: "The shops want their goods faster. How about a big logistics centre?"' },
  opened: { ko: '솔방울 물류센터가 문을 열었어요!', en: 'The Pinecone Logistics Centre is open!' },
  openedSub: { ko: '가게 주인들이 물건을 받아 가고 정산해요', en: 'Shop owners pick up their goods and settle up here' },
  tapHint: { ko: '건물을 눌러 보세요!', en: 'Tap the building!' },
  hoverHint: { ko: '건물에 마우스를 올려 보세요!', en: 'Hover over the building!' },
  revealFirst: { ko: '선반 위 물건 높이가 진짜 재고예요', en: 'The stacks on the shelves are the real stock' },
  settle: { ko: '정산 +{n}', en: 'Settled +{n}' },
  stamp: { ko: '쾅!', en: 'Stamp!' },
  firstSettle: { ko: '{shop} 사장님이 정산했어요! 도장 쾅!', en: '{shop} settled up — stamp!' },
  today: { ko: '오늘 배송 {n}', en: 'Today {n}' },
  till: { ko: '물류 금고', en: 'Logistics till' },
  tillN: { ko: '물류 금고 {n}', en: 'Till {n}' },
  stockLow: { ko: '{cat} 선반이 비어 가요', en: 'The {cat} racks are running low' },
  houseLv3: { ko: '새 살림이 왔어요! 행복 +{n}', en: 'New furniture arrived! Happiness +{n}' },
  diary: { ko: '"새 소파가 왔다!"', en: '"Our new sofa is here!"' },
  diaryAlt: { ko: ['"새 냉장고가 왔다!"', '"침대가 푹신푹신해!"', '"텔레비전에서 노래가 나와!"', '"식탁에 다 같이 앉았어!"'], en: ['"Our new fridge is here!"', '"The bed is so soft!"', '"There is music on the TV!"', '"We all sat at the new table!"'] },
  moveIn: { ko: '이사 온 집에 가구를 보냈어요', en: 'Furniture sent to the new household' },
  producerOpen: { ko: '{name}이 일을 시작했어요', en: '{name} is at work' },
  furniture: { ko: '가구 공방', en: 'Furniture workshop' },
  appliance: { ko: '가전 공장', en: 'Appliance factory' },
  pickupVan: { ko: '물류센터 밴이 {n}개를 가지러 왔어요', en: 'The centre van picked up {n}' },
  ready: { ko: '물건 준비됐어요!', en: 'Your order is ready!' },
  thanks: { ko: ['고마워요!', '잘 받아 갈게요!', '역시 빨라요!', '다음에 또 올게요!'], en: ['Thank you!', 'Got it, thanks!', 'So quick!', 'See you next time!'] },
  waiting: { ko: '물건 기다리는 중…', en: 'Waiting for my order…' },
  cats: {
    ko: { materials: '재료', food: '식품', goods: '생활용품', tools: '공구', furniture: '가구', appliances: '가전' },
    en: { materials: 'materials', food: 'food', goods: 'goods', tools: 'tools', furniture: 'furniture', appliances: 'appliances' },
  },
};

/** a string by key for a language, with {name} slots filled */
export function lt(lang, key, vars) {
  const e = LSTR[key];
  if (!e) return key;
  let s = e[lang === 'en' ? 'en' : 'ko'];
  if (Array.isArray(s)) s = s[(((vars && vars.i) || 0) % s.length + s.length) % s.length];
  if (typeof s !== 'string') return key;
  if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}
/** one line of a list string (cycled) */
export function ltPick(lang, key, i) {
  const e = LSTR[key]; if (!e) return key;
  const a = e[lang === 'en' ? 'en' : 'ko'];
  return Array.isArray(a) ? a[((i % a.length) + a.length) % a.length] : a;
}
export function catName(lang, cat) { return (LSTR.cats[lang === 'en' ? 'en' : 'ko'] || {})[cat] || cat; }
