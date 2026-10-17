// 금방 strings (docs/geumbang_plan.md §6, §7; copy book docs/geumbang_plan_player.md §13 adopted as written).
// gt(key, vars, lang) fills {name} slots; Korean particles after a name use josa(). Integration patch G-P10 merges
// these keys into src/data/strings.js (prefix gb_); until then the module reads its own copy.
// Brand safety (plan §7.4): no real company or service name appears anywhere in this file.

export const GB_STRINGS = {
  ko: {
    gb_name: '금방', gb_app: '금방 마켓', gb_centre: '금방 물류센터', gb_depot: '서리 물류창고', gb_arm: '금방물류',
    gb_slogan: '금방 왔지?', gb_tagline: '방금 시키면 금방 와요', gb_qa: '금방 뭐가 왔지? · 금방이 왔지!',
    gb_open_pad: '금방 개업', gb_jeong: '정 할머니', gb_open_banner: '금방 물류센터가 문을 열었어요!', gb_open_ready: '물류창고에서 온라인 마켓을 열 수 있어요',
    gb_new_card: '물류창고에서 온라인 마켓 "금방"을 열 수 있어요',
    gb_letter_from: '솔방울 아파트 2동 정 할머니',
    gb_letter: '촌장님, 요즘 역까지 장 보러 가기가 힘들어요. 물류창고에 물건이 그렇게 많다던데, 집 앞까지 갖다 주면 안 될까요?',
    gb_letter_note: '셈이: 이름은 \'금방\' 어때요? 방금 시키면 금방 가니까요.',
    gb_letter_yes: '금방 시작하기 · {cost}', gb_letter_no: '조금 더 생각해 볼게요',
    gb_toast_order: '띵동! 새 주문 · {who} · {items}', gb_toast_first: '첫 배달 완료! 왼쪽 위 금방 앱에서 주문을 볼 수 있어요',
    gb_step_1: '주문', gb_step_2: '고르기', gb_step_3: '포장', gb_step_4: '배달 중', gb_step_5: '도착',
    gb_eta: '약 {s}초 뒤 도착', gb_eta_done: '{t} 도착', gb_follow: '따라가기', gb_follow_end: '마을로 돌아가기',
    gb_clerk: '네~ 금방입니다!', gb_ring: '택배요~ 금방이에요!', gb_thanks_1: '방금 시켰는데 벌써요? 진짜 금방이네!',
    gb_thanks_elder: '아이고, 무거운 걸 여기까지. 고마워요, 기사님.', gb_thanks_snow: '눈길을 뚫고 왔네! 대단해요!',
    gb_thanks_chief: '촌장님 덕분에 이렇게 편해졌어요!', gb_first_thanks: '아이고, 방금 시켰는데 벌써 왔네! 진짜 금방이구먼.',
    gb_kid_q: '엄마, 금방 뭐가 왔어?', gb_kid_a: '금방이 왔지~!',
    gb_doorstep: '문 앞에 두고 갈게요~', gb_doorstep_done: '문 앞에 두었어요', gb_neighbour: '옆집에 맡겼어요',
    gb_morning: '어? 자는 사이에 금방이 다녀갔네!', gb_late_kid: '오늘은 금방이 아니라 조금방이네~',
    gb_late_driver: '죄송해요, 눈길이 미끄러워서요!', gb_locker_open: '딸깍! 금방 왔네.',
    gb_shop_first: '가게 먼저 · 잠깐 품절', gb_soldout: '품절', gb_deal: '오늘의 특가', gb_selling: '판매 중', gb_resting: '쉬는 중',
    gb_tomorrow: '내일 아침 도착', gb_waiting: '출고 대기 {n}', gb_cat: '고양이는 상자가 더 좋대요',
    gb_shift_end: '수고하셨어요!', gb_shift_go: '다녀오겠습니다!', gb_driver_safe: '안전하게, 그래도 금방!',
    gb_driver_name: '이름만 쌩쌩, 운전은 천천히', gb_sled_line: '눈길도 금방!', gb_sled_soon: '서리마을은 곧 개썰매로 갈게요',
    gb_up_pack: '포장대 2단', gb_up_van2: '금방 밴 2', gb_up_van3: '금방 밴 3', gb_up_sled2: '개썰매 2', gb_up_dawn: '새벽배송',
    gb_up_lockP: '광장 보관함', gb_up_lockA: '아파트 보관함', gb_up_back: '돌아오는 길 짐 싣기', gb_up_buy: '들이기 · {cost}',
    gb_up_why_pack: '포장을 기다리는 주문이 {n}개예요', gb_up_why_van: '실을 상자가 {n}개 기다려요',
    gb_up_why_sled: '옛 동네 상자가 {n}개 기다려요', gb_up_why_dawn: '밤에 주문이 {n}개씩 쌓여요',
    gb_up_why_lock: '한 번에 몰아서 넣고, 주민이 찾아가요', gb_up_why_back: '역에 남는 상자가 {n}개예요',
    gb_up_done: '{name}을(를) 들였어요!',
    gb_why_wait: '주문이 {n}개 기다려요',
    gb_tab_today: '오늘', gb_tab_orders: '주문', gb_tab_goods: '상품', gb_tab_crew: '기사님', gb_tab_reviews: '후기',
    gb_today_orders: '주문', gb_today_delivered: '배달', gb_today_drop: '줄어든 재고', gb_today_coins: '코인',
    gb_today_racks: '선반', gb_today_yday: '어제', gb_today_deals: '특가', gb_today_review: '새 후기',
    gb_no_orders: '아직 주문이 없어요', gb_open_orders: '진행 중 {n}', gb_done_orders: '도착 {n}',
    gb_cat_materials: '자재', gb_cat_food: '먹거리', gb_cat_goods: '생활용품', gb_cat_tools: '도구',
    gb_goods_stock: '남은 양 {n}', gb_goods_price: '{p}코인', gb_deal_btn: '특가', gb_sell_on: '팔기', gb_sell_off: '쉬기',
    gb_van_bay: '물류센터에서 짐 싣는 중', gb_van_idle: '물류센터에서 기다리는 중', gb_van_drive: '배달 가는 중',
    gb_van_curb: '{who}에게 배달 중', gb_van_back: '물류센터로 돌아오는 중', gb_van_break: '난로 옆에서 쉬는 중',
    gb_van_wait: '썰매가 지나가길 기다려요', gb_sled_idle: '역앞 금방 정류장에서 기다려요', gb_sled_run: '옛 동네 배달 중',
    gb_row_office: '금방 마켓 · 오늘 주문 {o} · 배달 {d} · 선반 −{s}', gb_inc: '금방',
    gb_news_day: '금방, 어제 {n}집에 배달', gb_news_racks: '물류창고 선반이 어제보다 {p}% 가벼워졌어요',
    gb_news_ad: '금방 마켓 · 금방 뭐가 왔지? 금방이 왔지!',
    gb_set_alerts: '금방 알림', gb_set_on: '켬', gb_set_quiet: '조용히', gb_set_off: '끔', gb_set_scenes: '금방 문 앞 장면',
    gb_cut_first: '첫 배달 출발', gb_cut_dawn: '새벽배송 출발', gb_cut_locker: '보관함이 열렸어요', gb_cut_cat: '고양이가 상자에 쏙',
    gb_watch: '금방 구경', gb_follow_cap_1: '주문 받음', gb_follow_cap_2: '고르는 중', gb_follow_cap_3: '포장 찌익',
    gb_follow_cap_4: '밴에 싣는 중', gb_follow_cap_5: '배달 가는 중', gb_follow_cap_6: '띵동!', gb_follow_skip: '화면을 누르면 끝나요',
    gb_box_s: '작은 상자', gb_box_m: '중간 상자', gb_box_l: '큰 상자', gb_stars: '별 {n}개',
    gb_rev_1: '고양이가 상자에서 안 나와요.', gb_rev_2: '자고 일어났더니 문 앞에 와 있었어요. 요정인가요?',
    gb_rev_3: '빵이 아직 따뜻했어요!', gb_rev_4: '기사님이 눈 털어 주고 가셨어요.', gb_rev_5: '장작 덕분에 오늘 밤 따뜻해요.',
    gb_rev_6: '아이가 상자 소리만 나면 뛰어나가요.', gb_rev_7: '방금 시켰는데 진짜 금방 왔어요.', gb_rev_8: '테이프 찌익 소리가 좋아요.',
    gb_rev_9: '할머니가 기사님 칭찬을 하루 종일 하세요.', gb_rev_10: '생선이 오늘 잡은 거래요. 맛있어요!',
    gb_rev_11: '상자에 금방이 스티커가 귀여워요.', gb_rev_12: '눈 오는 날에도 와 줘서 고마워요.',
    gb_who_house: '{name}네', gb_who_apt: '{bld} {name}네',
    gb_t_apt1: '솔방울 아파트 1동', gb_t_apt2: '솔방울 아파트 2동', gb_t_apt3: '솔방울 아파트 3동', gb_t_apt4: '솔방울 아파트 4동',
    gb_t_hall: '마을회관', gb_t_fire: '소방서', gb_stand: '역앞 금방 정류장', gb_village: '서리마을',
    gb_crew_dispatcher: '방금순 팀장', gb_crew_picker: '쏙쏙이', gb_crew_packer: '척척이', gb_crew_sorter: '영차',
    gb_crew_d1: '쌩쌩이', gb_crew_d2: '부릉이', gb_crew_d3: '씽씽이', gb_crew_rider: '뽀득이', gb_crew_n1: '반짝이', gb_crew_n2: '살금이',
    gb_tag_s: '{n}개', gb_items_more: '{a} 외 {n}',
  },
  en: {
    gb_name: 'Geumbang', gb_app: 'Geumbang Market', gb_centre: 'Geumbang Centre', gb_depot: 'Frost Depot', gb_arm: 'Geumbang Delivery',
    gb_slogan: 'Here already, right?', gb_tagline: 'Order now, here in a moment', gb_qa: 'What came just now? · Geumbang did!',
    gb_open_pad: 'Open Geumbang', gb_jeong: 'Grandma Jeong', gb_open_banner: 'Geumbang Centre is open!', gb_open_ready: 'The depot can open an online market',
    gb_new_card: 'The depot can open an online market, "Geumbang"',
    gb_letter_from: 'Grandma Jeong, Pinecone Apartments 2',
    gb_letter: 'Chief, the walk to the station shops is getting hard for me. They say the depot is full of goods. Could they bring things to my door?',
    gb_letter_note: 'Sem: How about calling it "Geumbang"? Order now, here in a moment.',
    gb_letter_yes: 'Start Geumbang · {cost}', gb_letter_no: 'Let me think about it',
    gb_toast_order: 'Ding-dong! New order · {who} · {items}', gb_toast_first: 'First delivery done! See the orders in the Geumbang app (top left)',
    gb_step_1: 'Ordered', gb_step_2: 'Picking', gb_step_3: 'Packing', gb_step_4: 'On the way', gb_step_5: 'Delivered',
    gb_eta: 'Arriving in about {s} s', gb_eta_done: 'Arrived {t}', gb_follow: 'Follow', gb_follow_end: 'Back to the village',
    gb_clerk: 'Hello, Geumbang here!', gb_ring: "Delivery! It's Geumbang!", gb_thanks_1: 'I just ordered! That really was quick!',
    gb_thanks_elder: 'Oh my, all this way with something so heavy. Thank you!', gb_thanks_snow: 'Right through the snow! Amazing!',
    gb_thanks_chief: 'Life is so easy now, thanks to the chief!', gb_first_thanks: 'Goodness, I only just ordered and it is here!',
    gb_kid_q: 'Mum, what just came?', gb_kid_a: 'Geumbang did!',
    gb_doorstep: "I'll leave it at the door!", gb_doorstep_done: 'Left at your door', gb_neighbour: 'Left with a neighbour',
    gb_morning: 'Oh! Geumbang came while I slept!', gb_late_kid: 'Not so quick today, huh?',
    gb_late_driver: 'Sorry, the snow was slippery!', gb_locker_open: "Click! It's here.",
    gb_shop_first: 'Shops first · back soon', gb_soldout: 'Sold out', gb_deal: "Today's deal", gb_selling: 'On sale', gb_resting: 'Paused',
    gb_tomorrow: 'Arrives tomorrow morning', gb_waiting: 'Waiting to go {n}', gb_cat: 'The cat likes the box better',
    gb_shift_end: 'Good work today!', gb_shift_go: 'Off we go!', gb_driver_safe: 'Safely, and still quick!',
    gb_driver_name: 'Fast names, careful driving', gb_sled_line: 'Quick through the snow, too!', gb_sled_soon: 'The dog sled will reach Frost Village soon',
    gb_up_pack: 'Packing level 2', gb_up_van2: 'Geumbang van 2', gb_up_van3: 'Geumbang van 3', gb_up_sled2: 'Dog sled 2', gb_up_dawn: 'Dawn delivery',
    gb_up_lockP: 'Plaza locker', gb_up_lockA: 'Apartment locker', gb_up_back: 'Load on the way back', gb_up_buy: 'Get it · {cost}',
    gb_up_why_pack: '{n} orders wait for packing', gb_up_why_van: '{n} parcels wait to be loaded',
    gb_up_why_sled: '{n} village parcels are waiting', gb_up_why_dawn: '{n} orders pile up every night',
    gb_up_why_lock: 'Fill it in one stop; residents pick up', gb_up_why_back: '{n} spare crates wait at the station',
    gb_up_done: '{name} is here!',
    gb_why_wait: '{n} orders are waiting',
    gb_tab_today: 'Today', gb_tab_orders: 'Orders', gb_tab_goods: 'Goods', gb_tab_crew: 'Crew', gb_tab_reviews: 'Reviews',
    gb_today_orders: 'Orders', gb_today_delivered: 'Delivered', gb_today_drop: 'Racks lighter', gb_today_coins: 'Coins',
    gb_today_racks: 'Racks', gb_today_yday: 'yesterday', gb_today_deals: 'Deals', gb_today_review: 'New review',
    gb_no_orders: 'No orders yet', gb_open_orders: 'Open {n}', gb_done_orders: 'Delivered {n}',
    gb_cat_materials: 'Materials', gb_cat_food: 'Food', gb_cat_goods: 'Household', gb_cat_tools: 'Tools',
    gb_goods_stock: '{n} left', gb_goods_price: '{p} coins', gb_deal_btn: 'Deal', gb_sell_on: 'Sell', gb_sell_off: 'Pause',
    gb_van_bay: 'Loading at the centre', gb_van_idle: 'Waiting at the centre', gb_van_drive: 'Out delivering',
    gb_van_curb: 'Delivering to {who}', gb_van_back: 'Heading back', gb_van_break: 'Warming up by the heater',
    gb_van_wait: 'Letting the sleigh pass', gb_sled_idle: 'Waiting at the station stand', gb_sled_run: 'Delivering in the old village',
    gb_row_office: 'Geumbang · orders {o} · delivered {d} · racks −{s}', gb_inc: 'Geumbang',
    gb_news_day: 'Geumbang delivered to {n} homes yesterday', gb_news_racks: 'The depot racks are {p}% lighter than yesterday',
    gb_news_ad: 'Geumbang Market · What came just now? Geumbang did!',
    gb_set_alerts: 'Geumbang alerts', gb_set_on: 'On', gb_set_quiet: 'Quiet', gb_set_off: 'Off', gb_set_scenes: 'Doorstep scenes',
    gb_cut_first: 'First delivery leaves', gb_cut_dawn: 'Dawn delivery leaves', gb_cut_locker: 'The locker opened', gb_cut_cat: 'A cat in the box',
    gb_watch: 'Geumbang watch', gb_follow_cap_1: 'Order in', gb_follow_cap_2: 'Picking', gb_follow_cap_3: 'Taping',
    gb_follow_cap_4: 'Loading the van', gb_follow_cap_5: 'On the way', gb_follow_cap_6: 'Ding-dong!', gb_follow_skip: 'Tap to skip',
    gb_box_s: 'small box', gb_box_m: 'medium box', gb_box_l: 'big box', gb_stars: '{n} stars',
    gb_rev_1: "The cat won't leave the box.", gb_rev_2: 'Woke up and it was at my door. Are they fairies?',
    gb_rev_3: 'The bread was still warm!', gb_rev_4: 'The driver brushed the snow off for me.', gb_rev_5: 'Warm tonight thanks to the firewood.',
    gb_rev_6: 'My kid runs out at every box sound.', gb_rev_7: 'I just ordered and it really came quick.', gb_rev_8: 'I love the tape sound.',
    gb_rev_9: 'Grandma praised the driver all day.', gb_rev_10: "Today's catch. Delicious!",
    gb_rev_11: 'The little parcel sticker is so cute.', gb_rev_12: 'Thank you for coming even in the snow.',
    gb_who_house: "{name}'s home", gb_who_apt: '{name} at {bld}',
    gb_t_apt1: 'Pinecone Apts 1', gb_t_apt2: 'Pinecone Apts 2', gb_t_apt3: 'Pinecone Apts 3', gb_t_apt4: 'Pinecone Apts 4',
    gb_t_hall: 'Town hall', gb_t_fire: 'Fire station', gb_stand: 'Station Geumbang stand', gb_village: 'Frost Village',
    gb_crew_dispatcher: 'Team lead Bang', gb_crew_picker: 'Ssokssok', gb_crew_packer: 'Cheokcheok', gb_crew_sorter: 'Yeongcha',
    gb_crew_d1: 'Ssaengssaeng', gb_crew_d2: 'Bureung', gb_crew_d3: 'Ssingssing', gb_crew_rider: 'Ppodeuk', gb_crew_n1: 'Banjjak', gb_crew_n2: 'Salgeum',
    gb_tag_s: '{n}', gb_items_more: '{a} +{n}',
  },
};

/** app names of the catalogue items (plan §5.2 table) */
export const GB_ITEM_NAMES = {
  ko: { item_bread: '갓 구운 빵', item_meat_cooked: '훈제 고기 한 팩', item_fish_cooked: '생선구이', item_can: '통조림 세트', item_plank: 'DIY 판자',
        item_axe: '새 도끼', item_rod: '새 낚싯대', item_sickle: '새 낫', item_bow: '새 활', item_pickaxe: '새 곡괭이',
        item_fish_raw: '오늘 잡은 생선', item_meat_raw: '집에서 굽는 생고기', item_log: '장작 한 묶음', item_wheat: '밀 한 자루' },
  en: { item_bread: 'Fresh bread', item_meat_cooked: 'Smoked meat pack', item_fish_cooked: 'Grilled fish', item_can: 'Tin set', item_plank: 'DIY planks',
        item_axe: 'New axe', item_rod: 'New rod', item_sickle: 'New sickle', item_bow: 'New bow', item_pickaxe: 'New pickaxe',
        item_fish_raw: "Today's catch", item_meat_raw: 'Meat to roast', item_log: 'Firewood bundle', item_wheat: 'Sack of wheat' },
};
/** short item words for toasts ("빵 3") */
export const GB_ITEM_SHORT = {
  ko: { item_bread: '빵', item_meat_cooked: '훈제 고기', item_fish_cooked: '생선구이', item_can: '통조림', item_plank: '판자', item_axe: '도끼',
        item_rod: '낚싯대', item_sickle: '낫', item_bow: '활', item_pickaxe: '곡괭이', item_fish_raw: '생선', item_meat_raw: '생고기', item_log: '장작', item_wheat: '밀', item_ingot: '주괴' },
  en: { item_bread: 'bread', item_meat_cooked: 'smoked meat', item_fish_cooked: 'grilled fish', item_can: 'tins', item_plank: 'planks', item_axe: 'axe',
        item_rod: 'rod', item_sickle: 'sickle', item_bow: 'bow', item_pickaxe: 'pickaxe', item_fish_raw: 'fish', item_meat_raw: 'meat', item_log: 'firewood', item_wheat: 'wheat', item_ingot: 'ingots' },
};

/** 을/를, 이/가, 은/는 after a Korean word (last syllable's final consonant) */
export function josa(word, pair) {
  const s = String(word || '');
  const c = s.charCodeAt(s.length - 1);
  const has = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 > 0 : false;
  const [a, b] = pair.split('/');
  return s + (has ? a : b);
}

/** a string with {slots} filled; unknown keys come back as the key (never throws) */
export function gt(key, vars, lang = 'ko') {
  const L = GB_STRINGS[lang] || GB_STRINGS.ko;
  let s = L[key];
  if (s === undefined) s = GB_STRINGS.ko[key];
  if (s === undefined) return key;
  if (vars) {
    s = s.replace(/\{(\w+)\}을\(를\)/g, (m, k) => (vars[k] !== undefined ? josa(vars[k], '을/를') : m));
    s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
  }
  return s;
}

/** "빵 3 · 장작 4" (max 2 lines, then "외 n") */
export function itemsLine(items, lang = 'ko') {
  const S = GB_ITEM_SHORT[lang] || GB_ITEM_SHORT.ko;
  const keys = Object.keys(items || {}).filter((k) => items[k] > 0).sort((a, b) => items[b] - items[a] || (a < b ? -1 : 1));
  const parts = keys.slice(0, 2).map((k) => (S[k] || k.replace(/^item_/, '')) + ' ' + items[k]);
  let s = parts.join(' · ');
  if (keys.length > 2) s = gt('gb_items_more', { a: s, n: keys.length - 2 }, lang);
  return s;
}

/** an upgrade price { coins, item_ingot? } -> "1,500 · 주괴 6" */
export function costLine(c, lang = 'ko') {
  const S = GB_ITEM_SHORT[lang] || GB_ITEM_SHORT.ko;
  let s = Number((c && c.coins) || 0).toLocaleString();
  for (const k of Object.keys(c || {})) if (k !== 'coins' && c[k] > 0) s += ' · ' + (S[k] || k.replace(/^item_/, '')) + ' ' + c[k];
  return s;
}

export const REVIEW_TPLS = 12;
