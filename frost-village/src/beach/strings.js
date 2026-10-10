// 햇살 해변 글자 (한국어 + English). bt(lang, key, vars) fills {name} style slots. Engineering comments in English;
// in-game text easy and warm (the 기획서 voice).

export const BSTR = {
  ko: {
    // the call and the way there
    callTourist: '따뜻한 바다는 어디예요?',
    callMaster: '등대 너머 동쪽엔 따뜻한 해류가 흘러서 눈이 안 쌓인대요',
    s_path: '해변 가는 길', s_lifeguard: '인명구조대', s_hotel: '리조트 호텔', s_pool: '호텔 수영장', s_aquarium: '작은 수족관',
    s_up2: '호텔 2등급 (방 20개)', s_up3: '호텔 3등급 (방 32개)',
    revealTitle: '햇살 해변을 찾았어요!', revealSub: '따뜻한 해류 덕분에 눈이 녹은 바닷가예요',
    cleanupHint: '모래밭의 미역과 나무 조각을 주워요 ({n}/{max})', cleanupDone: '깨끗해졌어요! 해변 입구가 생겼어요',
    open: '해수욕장 개장!', openSub: '관광객들이 바다로 놀러 와요',
    boardOpen: '해변 주문판이 생겼어요', shopOpen: '{name} 문을 열었어요!',
    hotelOpen: '리조트 호텔이 문을 열었어요!', hotelSub: '관광객이 이틀씩 묵으며 돈을 써요',
    poolOpen: '호텔 수영장 개장!', extras: '코코넛 바·바다 민박·반짝 오락실이 생겼어요',
    aquariumOpen: '작은 수족관이 문을 열었어요!', rareFish: '희귀한 물고기가 수족관에 들어왔어요!',
    hotelUp: '호텔이 {n}등급이 됐어요 (방 {rooms}개)',
    star: '햇살 해변 ★{n}', star2: '가게와 호텔로 북적여요', star3: '꿈의 휴양지가 됐어요! 햇살 해변 축제 주간이 시작돼요',
    checkin: '호텔 손님 {n}팀이 체크인했어요', whistle: '삐익! 부표 밖으로 나가면 안 돼요~',
    restock: '{name}에 {item}이(가) 모자라요', delivered: '{name}에 물건이 도착했어요 +{coins}',
    // events
    ev_contest: '모래성 대회', ev_contestGo: '모래성 대회가 시작됐어요! 제일 멋진 성을 골라 주세요',
    ev_contestPick: '{n}번 모래성이 1등이에요!', ev_fireworks: '여름 불꽃놀이', ev_fireworksGo: '밤 9시, 따뜻한 바다 위로 불꽃놀이!',
    ev_polar: '북극곰 수영 대회', ev_polarGo: '북극곰 수영 대회! 겨울 바다에 풍덩!', ev_polarDone: '으으 추워! 그래도 모두 해냈어요!',
    ev_week: '햇살 해변 축제 주간', ev_weekGo: '일주일 동안 해변이 더 북적여요!',
    // happenings
    p9: '꽃게가 일광욕하던 손님 발가락을 콕!', p10: '파도가 모래성을 쓸어 갔어요…', p11: '비치볼이 바다로 날아갔어요! 구조요원 출동!',
    p12: '바람에 파라솔이 날아가요! 길을 막아 주세요!', p12Catch: '촌장님이 파라솔을 잡았어요! 명성 +2',
    // places, shops
    beach: '햇살 해변', beach_gate: '해변 입구', warm_coast: '따뜻한 바닷가', polar: '북극곰 수영 대회 자리', sandcastles: '모래성 자리',
    beach_cafe: '파도 카페', icecream_shop: '구름 아이스크림', seafood_bbq: '조개구이집', convenience_store: '바닷가 편의점',
    souvenir_shop: '기념품 가게', swimwear_shop: '수영복 가게', surf_shop: '서핑 가게', beach_bar: '코코넛 바', pension: '바다 민박',
    beach_arcade: '반짝 오락실', resort_hotel: '햇살 리조트', mini_aquarium: '꼬마 수족관', lifeguard_station: '인명구조대',
    tourist_info: '관광 안내소', restroom_shower: '화장실·샤워장', hotel_pool: '호텔 수영장',
    boardGate: '햇살 해변', boardHotel: '햇살 리조트', boardSurf: '서핑 교실',
    talk1: '물이 정말 맑다!', talk2: '모래성 대회 나갈 거야', talk3: '구조요원 아저씨 멋있다', talk4: '아이스크림 먹자!', talk5: '눈 나라에 이런 바다가!',
    cold: '으으 추워!', cheer: '와아!', yum: '시원해~',
  },
  en: {
    callTourist: 'Where is the warm sea?',
    callMaster: 'Past the lighthouse a warm current flows, so snow never settles there',
    s_path: 'Road to the beach', s_lifeguard: 'Lifeguard station', s_hotel: 'Resort hotel', s_pool: 'Hotel pool', s_aquarium: 'Little aquarium',
    s_up2: 'Hotel level 2 (20 rooms)', s_up3: 'Hotel level 3 (32 rooms)',
    revealTitle: 'You found Sunny Beach!', revealSub: 'A warm current melts the snow on this shore',
    cleanupHint: 'Pick up the seaweed and driftwood ({n}/{max})', cleanupDone: 'All clean! The beach gate is up',
    open: 'The beach is open!', openSub: 'Tourists come to swim',
    boardOpen: 'The beach order board is up', shopOpen: '{name} is open!',
    hotelOpen: 'The resort hotel is open!', hotelSub: 'Tourists stay two days and spend each day',
    poolOpen: 'The hotel pool is open!', extras: 'Coconut bar, guesthouse and arcade are here',
    aquariumOpen: 'The little aquarium is open!', rareFish: 'A rare fish joined the aquarium!',
    hotelUp: 'The hotel is level {n} ({rooms} rooms)',
    star: 'Sunny Beach ★{n}', star2: 'Busy with shops and a hotel', star3: 'A dream resort! The Sunny Beach festival week begins',
    checkin: '{n} hotel parties checked in', whistle: 'Tweet! Stay inside the buoys~',
    restock: '{name} is short of {item}', delivered: 'Goods reached {name} +{coins}',
    ev_contest: 'Sandcastle contest', ev_contestGo: 'The sandcastle contest is on! Pick the best castle',
    ev_contestPick: 'Castle no. {n} wins!', ev_fireworks: 'Summer fireworks', ev_fireworksGo: '9 pm: fireworks over the warm sea!',
    ev_polar: 'Polar-bear swim', ev_polarGo: 'Polar-bear swim! Into the winter sea!', ev_polarDone: 'Brrr! Everyone made it!',
    ev_week: 'Sunny Beach festival week', ev_weekGo: 'The beach is busier for a whole week!',
    p9: 'A crab pinched a sunbather’s toe!', p10: 'A wave washed the sandcastle away…', p11: 'A beach ball blew out to sea! Lifeguard to the rescue!',
    p12: 'The wind took a parasol! Stand in its way!', p12Catch: 'The chief caught the parasol! Fame +2',
    beach: 'Sunny Beach', beach_gate: 'Beach gate', warm_coast: 'Warm coast', polar: 'Polar-bear swim spot', sandcastles: 'Sandcastle spot',
    beach_cafe: 'Wave Cafe', icecream_shop: 'Cloud Ice Cream', seafood_bbq: 'Clam Grill', convenience_store: 'Seaside Mart',
    souvenir_shop: 'Shell Souvenirs', swimwear_shop: 'Swim Ring Shop', surf_shop: 'Surf Shop', beach_bar: 'Coconut Bar', pension: 'Sea Guesthouse',
    beach_arcade: 'Sparkle Arcade', resort_hotel: 'Sunny Resort', mini_aquarium: 'Little Aquarium', lifeguard_station: 'Lifeguards',
    tourist_info: 'Tourist info', restroom_shower: 'Restrooms & showers', hotel_pool: 'Hotel pool',
    boardGate: 'Sunny Beach', boardHotel: 'Sunny Resort', boardSurf: 'Surf school',
    talk1: 'The water is so clear!', talk2: 'I’m entering the sandcastle contest', talk3: 'The lifeguard is so cool', talk4: 'Ice cream time!', talk5: 'A sea like this in snow country!',
    cold: 'Brrr!', cheer: 'Yay!', yum: 'So cool~',
  },
};

export function bt(lang, key, vars) {
  const L = BSTR[lang] || BSTR.ko;
  let s = L[key] !== undefined ? L[key] : BSTR.ko[key] !== undefined ? BSTR.ko[key] : key;
  if (vars) for (const k in vars) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}
