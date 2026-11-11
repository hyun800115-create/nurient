// (v4.3) 마을 주민 창 · 주민 프로필 · 따라가기 — the window's words (한국어 + English).
// Its own table (like goals/strings.js) so the shared strings.js stays as it is; rt() fills {slots} and the Korean
// particles the same way t() does ({name|이/가}, {place|(으)로}, "…을(를)").

import { getLang, josa } from '../../data/strings.js';

export const RES_STR = {
  ko: {
    r_title: '마을 주민 {n}명',
    r_f_all: '전체 {n}', r_f_work: '일하는 주민 {n}', r_f_kid: '아이 {n}', r_f_elder: '어르신 {n}',
    r_more: '자세히',
    r_age: '{n}세', r_f: '여', r_m: '남', r_female: '여자', r_male: '남자',
    r_page: '{p} / {n}',
    r_empty: '이 목록에는 아직 아무도 없어요',
    r_back: '◀ 목록', r_back2: '◀ 뒤로',
    r_follow: '따라가기',
    r_tutorial: '튜토리얼이 끝나면 볼 수 있어요',
    r_busy: '지금은 열 수 없어요',
    // profile labels
    r_l_now: '지금 하는 일', r_l_home: '사는 곳', r_l_family: '가족', r_l_mates: '같이 사는 사람', r_l_friends: '친한 사이',
    r_l_why: '행복한 이유', r_l_why2: '기분이 그런 이유', r_l_values: '가치 추구', r_l_traits: '성격', r_l_likes: '좋아하는 것',
    r_l_chief: '촌장님과의 사이', r_l_moved: '이사 온 때', r_l_sched: '오늘 일정',
    r_happy: '행복도 {n}',
    r_face_4: '아주 행복해요', r_face_3: '행복해요', r_face_2: '그저 그래요', r_face_1: '조금 힘들어요',
    r_wage: '월급 {m}코인 · 하루 {d}코인', r_pension: '연금 한 달 {m}코인 · 하루 {d}코인', r_pocket: '용돈 한 달 {m}코인 · 하루 {d}코인',
    r_nowage: '아직 일자리를 찾는 중', r_tax: '세금 하루 {n}코인을 내요',
    r_job_at: '{place} · {job}', r_job_seek: '아직 일자리를 찾는 중', r_job_student: '학생', r_job_retired: '쉬는 중', r_job_baby: '아기',
    r_job_soon: '아직 일자리를 찾는 중 · {job} 일을 기다려요',
    r_home_tent: '천막 마당', r_home_house: '{house} {n}호', r_home_hall: '마을회관 숙소', r_home_first: '{house} (첫 집)',
    r_with: '{n}명이 함께 살아요', r_alone: '혼자 살아요',
    r_more_n: '외 {n}명',
    r_chief_rec: '{stage} · 수다 {n}번', r_chief_none: '{stage}', r_chief_settler: '아직 인사만 한 사이',
    r_moved_start: '처음부터 이 마을에 살았어요', r_moved_step: '{step} 뒤에 이사 왔어요', r_moved_settler: '{i}번째 이주민 · 빈 집으로 이사 왔어요',
    r_sched_free: '자유롭게 마을을 돌아다녀요', r_sched_work: '{a}–{b}시 {place}에서 일해요', r_sched_seek: '낮에는 마을회관에서 일자리를 알아봐요',
    r_sched_op: '{place}에서 일해요', r_sched_kid: '마을에서 친구들과 놀아요', r_sched_rest: '집과 마을에서 쉬어요',
    r_stage_stranger: '처음 본 사이', r_stage_acquaintance: '아는 사이', r_stage_friend: '친구', r_stage_close: '단짝', r_stage_family: '소중한 이웃',
    r_spouse: '배우자', r_mate: '같이 사는 이웃',
    // the steps after which named villagers moved in
    mv_first_sale: '첫 장사', mv_hire_fisherman: '어부를 고용한', mv_zone_forest: '숲을 연', mv_hire_lumberjack: '나무꾼을 고용한',
    mv_zone_farm: '밀밭을 연', mv_hire_farmer: '농부를 고용한', mv_zone_mine: '광산을 연', mv_hire_miner: '광부를 고용한',
    mv_zone_hunt: '사냥터를 연', mv_hire_hunter: '사냥꾼을 고용한',
    // workplaces (settlers / operators)
    wp_deck: '낚시 데크', wp_build: '마을 공사장', wp_sawmill: '숲 제재소', wp_field: '밀밭', wp_mine: '광산', wp_hunt: '사냥터',
    wp_market: '눈꽃 가게', wp_restaurant: '큰 식당', wp_hall: '마을회관', wp_warehouse: '창고', wp_station: '기차역', wp_bank: '은행',
    wp_depot: '물류창고', wp_bakery: '빵집',
    // happiness reasons
    h_house: '새집에서 살아요', h_home: '따뜻한 집이 있어요', h_tent: '천막에서 지내서 추워요', h_hall: '마을회관 숙소가 아늑해요',
    h_food: '시장에 먹을 게 넉넉해요', h_hungry: '먹을 게 떨어져서 배가 고파요', h_pretty: '마을이 예뻐졌어요',
    h_chief_close: '촌장님과 단짝이에요', h_chief_friend: '촌장님과 친해요', h_chief_new: '촌장님과는 아직 어색해요', h_chief_hall: '마을회관에서 촌장님을 만났어요',
    h_town_up: '이웃 마을 손님들이 즐거워해요', h_town_down: '이웃 마을 손님들이 시무룩해요',
    h_mood_up: '원래 밝은 성격이에요', h_mood_down: '오늘은 괜히 투덜투덜해요',
    // actions (지금 하는 일)
    act_party: '축제에서 춤추는 중', act_bard_go: '공연하러 모닥불로 가는 중', act_bard_play: '모닥불 앞에서 노래하는 중', act_bard_bow: '공연을 마치고 인사하는 중',
    act_concert_seat: '모닥불 옆에 앉아 노래 듣는 중', act_concert_go: '노래 들으러 가는 중', act_concert_dance: '노래에 맞춰 춤추는 중', act_concert: '모닥불에서 노래 듣는 중',
    act_chat: '{name|과/와} 수다 떠는 중', act_chat0: '이웃과 수다 떠는 중', act_snow_run: '눈덩이 던지고 도망가는 중', act_snow_chase: '{name|을/를} 쫓아가는 중', act_snowball: '눈싸움하는 중',
    act_tag_it: '술래잡기 술래 하는 중', act_tag: '술래잡기하는 중', act_snowman: '눈사람 만드는 중', act_snowman_break: '눈사람 무너뜨리는 장난 중',
    act_arrive_house: '새집으로 이사 가는 중', act_hello: '촌장님께 인사하는 중', act_arrive: '마을로 이사 오는 중',
    act_doze: '{area}에서 꾸벅꾸벅 조는 중', act_sit: '{area} 의자에 앉아 쉬는 중', act_to_seat: '앉을 자리 찾아가는 중', act_warm_go: '모닥불 쬐러 가는 중',
    act_read: '게시판 보는 중', act_skate: '스케이트 타는 중', act_shiver: '추워서 오들오들 떠는 중', act_wave: '촌장님께 손 흔드는 중',
    act_warm: '모닥불 쬐는 중', act_go: '{area|(으)로} 가는 중', act_stroll: '{area}에서 산책하는 중', act_relax: '{area}에서 쉬는 중', act_break: '잠깐 쉬는 중',
    act_op_go: '일터로 가는 중', act_op_grill: '생선 굽는 중', act_op_sawmill: '통나무를 판자로 켜는 중', act_op_bakery: '빵 굽는 중', act_op_smelter: '광석 녹이는 중',
    act_op_smokehouse: '고기 훈제하는 중', act_op_toolsmith: '도구 두드리는 중', act_op_cannery: '통조림 만드는 중', act_op_work: '일하는 중',
    act_op_full: '선반이 꽉 차서 쉬는 중', act_op_wait: '재료를 기다리는 중',
    act_clerk_go: '가게로 가는 중', act_clerk_serve: '손님 계산하는 중', act_clerk_wait: '손님을 기다리는 중', act_carry: '짐 나르는 중',
    act_soon: '곧 나올 거예요', act_home: '집에서 쉬는 중', act_sleep: '집에서 자는 중', act_breakfast: '집에서 아침 먹는 중',
    act_lunch_rest: '큰 식당에서 점심 먹는 중', act_lunch_box: '일터에서 도시락 먹는 중', act_seek: '일자리를 알아보는 중',
    act_eve_market: '시장에서 장 보는 중', act_eve_dinner: '큰 식당에서 저녁 먹는 중', act_eve_fire: '모닥불 쉼터에서 쉬는 중',
    act_w_fisher: '낚시 데크에서 고기 잡는 중', act_w_builder: '새 집을 짓는 중', act_w_lumberjack: '숲에서 나무 베는 중', act_w_farmer: '밭에서 밀 거두는 중',
    act_w_miner: '광산에서 광석 캐는 중', act_w_hunter: '사냥터에 나가 있는 중', act_w_shopkeeper: '가게에서 손님을 기다리는 중', act_w_cook: '큰 식당 주방에서 요리하는 중',
    act_w_hall_clerk: '마을회관에서 일하는 중', act_w_dock: '창고에서 짐 나르는 중', act_w_station: '역에서 기차를 기다리는 중', act_w_teller: '은행 창구에서 일하는 중',
    act_w_picker: '물류창고에서 상자 나르는 중',
    // 따라가기
    f_chip: '{name} 따라가는 중', f_home: '집 안에 있어요', f_inside: '{place} 안에서 일하는 중', f_sleep: '집에서 자는 중', f_away: '{place}에 있어요',
    f_gone: '{name|이/가} 마을 밖으로 나갔어요',
  },
  en: {
    r_title: 'Villagers ({n})',
    r_f_all: 'All {n}', r_f_work: 'Working {n}', r_f_kid: 'Kids {n}', r_f_elder: 'Elders {n}',
    r_more: 'More',
    r_age: '{n}', r_f: 'F', r_m: 'M', r_female: 'female', r_male: 'male',
    r_page: '{p} / {n}',
    r_empty: 'Nobody here yet',
    r_back: '◀ List', r_back2: '◀ Back',
    r_follow: 'Follow',
    r_tutorial: 'Available after the tutorial',
    r_busy: "Can't open right now",
    r_l_now: 'Now', r_l_home: 'Home', r_l_family: 'Family', r_l_mates: 'Lives with', r_l_friends: 'Close to',
    r_l_why: 'Why happy', r_l_why2: 'Why', r_l_values: 'Values', r_l_traits: 'Personality', r_l_likes: 'Likes',
    r_l_chief: 'With the chief', r_l_moved: 'Moved in', r_l_sched: 'Today',
    r_happy: 'Happiness {n}',
    r_face_4: 'Very happy', r_face_3: 'Happy', r_face_2: 'So-so', r_face_1: 'A bit down',
    r_wage: 'Salary {m} coins a month · {d} a day', r_pension: 'Pension {m} coins a month · {d} a day', r_pocket: 'Pocket money {m} a month · {d} a day',
    r_nowage: 'Still looking for work', r_tax: 'Pays {n} coins of tax a day',
    r_job_at: '{job} at {place}', r_job_seek: 'Still looking for work', r_job_student: 'Pupil', r_job_retired: 'Retired', r_job_baby: 'Baby',
    r_job_soon: 'Looking for work · waiting to be a {job}',
    r_home_tent: 'the tent camp', r_home_house: '{house} No. {n}', r_home_hall: 'the town hall rooms', r_home_first: '{house} (first house)',
    r_with: '{n} people live here', r_alone: 'Lives alone',
    r_more_n: '+{n} more',
    r_chief_rec: '{stage} · {n} chats', r_chief_none: '{stage}', r_chief_settler: 'Just said hello so far',
    r_moved_start: 'Has lived here from the start', r_moved_step: 'Moved in after {step}', r_moved_settler: 'Settler No. {i} · moved into an empty house',
    r_sched_free: 'Wanders around the village', r_sched_work: 'Works {a}–{b} h at {place}', r_sched_seek: 'Asks about jobs at the town hall by day',
    r_sched_op: 'Works at {place}', r_sched_kid: 'Plays with friends around the village', r_sched_rest: 'Rests at home and around the village',
    r_stage_stranger: 'Strangers', r_stage_acquaintance: 'Acquaintances', r_stage_friend: 'Friends', r_stage_close: 'Best friends', r_stage_family: 'Dear neighbours',
    r_spouse: 'spouse', r_mate: 'housemate',
    mv_first_sale: 'the first sale', mv_hire_fisherman: 'the fisherman was hired', mv_zone_forest: 'the forest opened', mv_hire_lumberjack: 'the lumberjack was hired',
    mv_zone_farm: 'the farm opened', mv_hire_farmer: 'the farmer was hired', mv_zone_mine: 'the mine opened', mv_hire_miner: 'the miner was hired',
    mv_zone_hunt: 'the hunting grounds opened', mv_hire_hunter: 'the hunter was hired',
    wp_deck: 'the fishing deck', wp_build: 'the building site', wp_sawmill: 'the forest sawmill', wp_field: 'the wheat field', wp_mine: 'the mine', wp_hunt: 'the hunting grounds',
    wp_market: 'the Snowbloom shop', wp_restaurant: 'the big restaurant', wp_hall: 'the town hall', wp_warehouse: 'the warehouse', wp_station: 'the station', wp_bank: 'the bank',
    wp_depot: 'the depot', wp_bakery: 'the bakery',
    h_house: 'Lives in a new house', h_home: 'Has a warm home', h_tent: 'Cold nights in a tent', h_hall: 'The town hall rooms are cosy',
    h_food: 'Plenty of food at the market', h_hungry: 'Hungry: the food ran out', h_pretty: 'The village got prettier',
    h_chief_close: 'Best friends with the chief', h_chief_friend: 'Gets on well with the chief', h_chief_new: 'Still shy with the chief', h_chief_hall: 'Met the chief at the town hall',
    h_town_up: 'The neighbours\' guests are cheerful', h_town_down: 'The neighbours\' guests are glum',
    h_mood_up: 'A sunny nature', h_mood_down: 'A bit grumpy today',
    act_party: 'dancing at the party', act_bard_go: 'heading to the campfire to play', act_bard_play: 'singing by the campfire', act_bard_bow: 'taking a bow',
    act_concert_seat: 'listening to the song by the fire', act_concert_go: 'going to hear the song', act_concert_dance: 'dancing to the music', act_concert: 'listening to music by the campfire',
    act_chat: 'chatting with {name}', act_chat0: 'chatting with the neighbours', act_snow_run: 'running away after a snowball', act_snow_chase: 'chasing {name}', act_snowball: 'in a snowball fight',
    act_tag_it: '"it" in a game of tag', act_tag: 'playing tag', act_snowman: 'building a snowman', act_snowman_break: 'knocking the snowman over',
    act_arrive_house: 'moving into the new house', act_hello: 'saying hello to the chief', act_arrive: 'moving into the village',
    act_doze: 'dozing off at {area}', act_sit: 'resting on a seat at {area}', act_to_seat: 'going to sit down', act_warm_go: 'going to warm up by the fire',
    act_read: 'reading the notice board', act_skate: 'skating', act_shiver: 'shivering in the cold', act_wave: 'waving at the chief',
    act_warm: 'warming up by the fire', act_go: 'on the way to {area}', act_stroll: 'strolling around {area}', act_relax: 'relaxing at {area}', act_break: 'taking a short break',
    act_op_go: 'on the way to work', act_op_grill: 'grilling fish', act_op_sawmill: 'sawing planks', act_op_bakery: 'baking bread', act_op_smelter: 'smelting ore',
    act_op_smokehouse: 'smoking meat', act_op_toolsmith: 'hammering tools', act_op_cannery: 'canning', act_op_work: 'working',
    act_op_full: 'waiting: the shelf is full', act_op_wait: 'waiting for ingredients',
    act_clerk_go: 'heading to the counter', act_clerk_serve: 'serving a customer', act_clerk_wait: 'waiting for customers', act_carry: 'carrying goods',
    act_soon: 'coming out soon', act_home: 'resting at home', act_sleep: 'asleep at home', act_breakfast: 'having breakfast at home',
    act_lunch_rest: 'having lunch at the big restaurant', act_lunch_box: 'having a packed lunch at work', act_seek: 'looking for work',
    act_eve_market: 'shopping at the market', act_eve_dinner: 'having dinner at the big restaurant', act_eve_fire: 'relaxing by the campfire',
    act_w_fisher: 'fishing on the deck', act_w_builder: 'building a new house', act_w_lumberjack: 'felling trees in the forest', act_w_farmer: 'harvesting wheat',
    act_w_miner: 'digging ore in the mine', act_w_hunter: 'out at the hunting grounds', act_w_shopkeeper: 'minding the shop', act_w_cook: 'cooking in the big kitchen',
    act_w_hall_clerk: 'working at the town hall', act_w_dock: 'moving crates at the warehouse', act_w_station: 'waiting for the train', act_w_teller: 'at the bank counter',
    act_w_picker: 'moving boxes at the depot',
    f_chip: 'Following {name}', f_home: 'Inside at home', f_inside: 'Working inside {place}', f_sleep: 'Asleep at home', f_away: 'At {place}',
    f_gone: '{name} left the village',
  },
};

/** the residents window's words with {slots} filled ({k|이/가} particle slots and "…을(를)" as in strings.t) */
export function rt(key, params) {
  const lang = getLang();
  const L = RES_STR[lang] || RES_STR.ko;
  let s = L[key];
  if (s === undefined) s = RES_STR.ko[key];
  if (s === undefined) return key;
  if (params) {
    for (const k in params) {
      const v = String(params[k]);
      if (s.indexOf('{' + k + '|') >= 0) s = s.replace(new RegExp('\\{' + k + '\\|([^}]+)\\}', 'g'), (m, pair) => v + josa(v, pair));
      s = s.split('{' + k + '}').join(v);
    }
  }
  if (s.indexOf(')') >= 0) s = s.replace(/([가-힣A-Za-z0-9])(이\(가\)|을\(를\)|은\(는\)|와\(과\)|\(으\)로)/g, (m, ch, p) => ch + josa(ch, { '이(가)': '이/가', '을(를)': '을/를', '은(는)': '은/는', '와(과)': '과/와', '(으)로': '(으)로' }[p]));
  return s;
}
