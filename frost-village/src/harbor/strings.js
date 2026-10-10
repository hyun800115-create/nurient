// 항구 글자 (harbor_runtime strings, ko + en). 게임에 붙일 때 src/data/strings.js 로 옮겨져요 (P20).

export const HSTR = {
  // ---- 항구가 열리는 날
  hornFar:      { ko: '동쪽 바다 끝에서 뱃고동 소리가 들려요…', en: 'A ship’s horn sounds far to the east…' },
  rumour1:      { ko: '동쪽 바다 끝에 옛 항구가 있대!', en: 'They say there’s an old harbour at the east end of the sea!' },
  rumour2:      { ko: '갈매기가 많아서 갈매기 항구래.', en: 'So many gulls there — they call it Gull Harbour.' },
  found:        { ko: '갈매기 항구를 찾았어요!', en: 'We found Gull Harbour!' },
  foundSub:     { ko: '항구를 살리면 바다 너머 사람과 물건이 와요', en: 'Revive it and people and goods will come from across the sea' },
  // ---- 항구 살리기 (현장 이름)
  s_railExt:    { ko: '동쪽 철길 잇기', en: 'Extend the rail east' },
  s_station:    { ko: '항구역 고치기', en: 'Repair the harbour station' },
  s_auction:    { ko: '수산물 경매장', en: 'Fish auction' },
  s_lighthouse: { ko: '등대 불 밝히기', en: 'Light the lighthouse' },
  s_terminal:   { ko: '여객선 터미널', en: 'Ferry terminal' },
  s_crane:      { ko: '크레인 + 세관', en: 'Crane + customs' },
  s_shipyard:   { ko: '조선소', en: 'Shipyard' },
  stepDone:     { ko: '{name} 완성!', en: '{name} is ready!' },
  // ---- 배
  ferryIn:      { ko: '여객선이 들어와요 · 손님 {n}명', en: 'The ferry is in · {n} visitors' },
  ferryHorn:    { ko: '뿌우— 여객선이 떠나요', en: 'Toot! The ferry is leaving' },
  cargoIn:      { ko: '화물선 도착! 수출 주문: {order}', en: 'Cargo ship in! Export order: {order}' },
  cargoDue:     { ko: '{h}시까지 수출 부두로', en: 'To the export quay by {h}:00' },
  trawlerHome:  { ko: '원양어선이 참치를 싣고 돌아왔어요', en: 'A trawler is home with tuna' },
  trawlerOrder: { ko: '원양어선 주문 · 조선소에서 만들고 있어요', en: 'Trawler ordered · the shipyard is building it' },
  trawlerLaunch:{ ko: '새 원양어선 진수! 바다로 나가요', en: 'A new trawler slides into the sea!' },
  rareFish:     { ko: '희귀한 물고기가 잡혔대요!', en: 'They caught a rare fish!' },
  // ---- 수출 · 수입
  exportPad:    { ko: '수출 부두', en: 'Export quay' },
  exportLeft:   { ko: '{item} {n}개 더', en: '{n} more {item}' },
  exportDone:   { ko: '수출 주문 완료! 배가 가득 찼어요', en: 'Export order done! The ship is full' },
  exportGone:   { ko: '화물선이 떠났어요. 다음 배를 기다려요', en: 'The cargo ship left. Wait for the next one' },
  importFirst:  { ko: '첫 {kind} 수입! {what}', en: 'First {kind} import! {what}' },
  i_sugar:      { ko: '설탕', en: 'sugar', what: { ko: '빵집에서 케이크를 만들 수 있어요', en: 'the bakery can make cakes' } },
  i_cloth:      { ko: '천', en: 'cloth', what: { ko: '솔방울 옷가게가 우리 옷감을 사요', en: 'the Pinecone clothing shop buys our cloth' } },
  i_glass:      { ko: '유리', en: 'glass', what: { ko: '집에 창문을 달 수 있어요 (2단계 집)', en: 'houses can get windows (level 2)' } },
  i_spice:      { ko: '향신료', en: 'spices', what: { ko: '식당 생선 요리가 더 비싸게 팔려요', en: 'cooked fish sells for more at the restaurants' } },
  // ---- 경매
  auctionPad:   { ko: '경매 발판', en: 'Auction pad' },
  auctionBell:  { ko: '딸랑딸랑! 경매 시작', en: 'Ding-ding! The auction starts' },
  auctionCall:  { ko: '자, 싱싱한 참치 {n}마리!', en: 'Fresh tuna, {n} of them!' },
  auctionCall2: { ko: '자, 싱싱한 생선이요!', en: 'Fresh fish, who’ll bid?' },
  auctionSold:  { ko: '낙찰! +{coins}', en: 'Sold! +{coins}' },
  nextBell:     { ko: '다음 경매 {s}초', en: 'Next auction {s}s' },
  fishWaiting:  { ko: '생선 {n}', en: '{n} fish' },
  sails:        { ko: '{t} 출항', en: 'sails {t}' },
  // ---- 관광객 · 손님
  guest_chef:   { ko: '유명한 요리사가 왔어요! 오늘 해산물 식당 매출 두 배', en: 'A famous chef is here! The seafood restaurant earns double today' },
  guest_merchant:{ ko: '큰 상인이 왔어요: {item} 30개를 비싸게 사 간대요', en: 'A big merchant came: buys 30 {item} at a good price' },
  guest_photographer:{ ko: '사진사가 항구 사진을 찍어 갔어요 (명성 +5)', en: 'A photographer took pictures of the harbour (fame +5)' },
  settler:      { ko: '새 주민이 배를 타고 왔어요 · 선원 숙소에 살아요', en: 'A new resident came by ferry · lives at the sailors’ lodge' },
  star:         { ko: '갈매기 항구 ★{n}!', en: 'Gull Harbour ★{n}!' },
  star2:        { ko: '항구 축제가 열려요 · 예인선이 도와줘요', en: 'Harbour festival · the tugboat helps out' },
  star3:        { ko: '돛단배와 요트가 바다를 누벼요', en: 'Sailboats and yachts cruise the sea' },
  // ---- 귀여운 일
  P7:           { ko: '갈매기가 관광객 생선구이를 낚아챘어요!', en: 'A gull snatched a tourist’s grilled fish!' },
  P8:           { ko: '크레인 상자가 흔들흔들~', en: 'The crane’s crate wobbles~' },
  // ---- 이름
  coastLine:    { ko: '해안선 기차', en: 'Coast line' },
  harbor:       { ko: '갈매기 항구', en: 'Gull Harbour' },
};

/** text in lang with {placeholders} */
export function ht(lang, key, vars) {
  const e = HSTR[key];
  let s = e ? (e[lang] || e.ko) : key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}

/** item names the harbour shows (export orders, pads) */
export const HITEM = {
  item_can: ['통조림', 'cans'], item_plank: ['판자', 'planks'], item_bread: ['빵', 'bread'], item_fish_cooked: ['구운 생선', 'grilled fish'],
  item_ingot: ['주괴', 'ingots'], tools: ['도구', 'tools'], item_fish_big: ['참치', 'tuna'], item_fish_raw: ['생선', 'fish'],
};
export function itemName(lang, item) { const e = HITEM[item]; return e ? e[lang === 'en' ? 1 : 0] : item; }
