// (v4.3) 마을 주민 창 — the residents' data (pure tables; spec: scratchpad v43/residents/spec.md §2–§3, §7).
//   NAMED        the 25 named villagers who move in (world.js life.moveIns): the persona card fields the window shows,
//                copied from src/chat/personas.js (the chat module loads late; tools/test/residents.test.mjs keeps the
//                copy equal to it) + age · sex · job id · home · English words · 가치 추구 (designer-editable; values
//                marked * in the spec are new choices)
//   FAMILY       family ties that agree with what the residents already say in chat (personas.js RELATIONS) and the
//                v4.3 tent households (world.js plots h43_1 / h43_2 family)
//   FRIENDS      personas.js RELATIONS with affinity ≥ 60 (친한 사이)
//   AREA         the life areas' names (world.js life.areas + Civic.addArea ids)
//   JOB          job id -> name / workplace / hours / wage (the story engine's JOBS table where it has the job: hours and
//                coins per worked day, src/story/engine/data/places.js; four village jobs it lacks are added here)
//   SETTLER_JOBS the settlers' jobs, fixed order (a settler's index picks one; a job whose workplace is not built yet
//                reads 「아직 일자리를 찾는 중」 until it is — never reshuffled)
//   VALUES       가치 추구: nine values, their keywords (persona / manifest / story trait and like words) and a line each
// Nothing here is saved: everything the window shows is read from the game or derived from these tables.

import { JOBS } from '../../story/engine/data/places.js';

// ------------------------------------------------------------------ named villagers
// ko: the persona card (personas.js: name, short, job, home, traits, likes — kept equal by the unit test)
// en: the same in English; given: the given name the list shows (null = the full title)
// jobId: the story engine job (adopt.js VILLAGER_JOB + the spec's overrides); house: the v4.3 tent house they move into
// homeAt: life area ids (first one open) or 'st:<station>' — where a resident without a body is, for 따라가기
// values: 가치 추구 (two VALUES ids, hand-assigned from the scoring prototype)
const N = (o) => o;
export const NAMED = {
  npc_grandpa: N({ age: 76, sex: 'm', group: 'elder', jobId: 'retired', house: 'h43_2', homeAt: ['beach_w'], values: ['nature', 'friendship'], given: null,
    ko: { name: '할아버지', short: '할아버지', job: '은퇴한 뱃사람', home: '벤치 옆 뜨개방 집', traits: ['느긋함', '졸기 대장'], likes: ['모닥불', '낮잠', '옛날이야기'] },
    en: { job: 'former sailor', home: 'the knitting cottage by the bench', traits: ['easygoing', 'king of naps'], likes: ['campfires', 'naps', 'old stories'] } }),
  npc_aunt: N({ age: 44, sex: 'f', group: 'adult', jobId: 'baker', house: 'h43_1', homeAt: ['st:bakery', 'plaza_s'], values: ['family', 'food'], given: null,
    ko: { name: '빵집 아주머니', short: '빵집 아주머니', job: '빵집 주인', home: '광장 옆 빵집 2층', traits: ['다정함', '수다스러움', '칭찬을 잘함'], likes: ['갓 구운 빵', '아이들 웃음소리', '따뜻한 코코아'] },
    en: { job: 'bakery owner', home: 'above the bakery by the plaza', traits: ['kind', 'chatty', 'full of compliments'], likes: ['fresh bread', "children's laughter", 'hot cocoa'] } }),
  npc_kid_girl: N({ age: 8, sex: 'f', group: 'kid', jobId: 'student', house: 'h43_1', homeAt: ['playground'], values: ['friendship', 'art'], given: { ko: '하린', en: 'Harin' },
    ko: { name: '꼬마 하린', short: '하린', job: '초등학생', home: '분수 옆 빨간 지붕 집', traits: ['명랑함', '춤추기 좋아함', '눈사람 만들기 대장'], likes: ['눈사람', '춤', '강아지 누리', '딸기 우유'] },
    en: { job: 'primary school pupil', home: 'the red-roofed house by the fountain', traits: ['cheerful', 'loves to dance', 'snowman champion'], likes: ['snowmen', 'dancing', 'Nuri the dog', 'strawberry milk'] } }),
  // ((v4.3 step B, L2) 준's home line: his family's first house h43_2 stands by the green's swing now (world.js 1560, 1640: L1 moved it
  //  out of the 한마당 reserve), the forge is on d_tool far west ("대장간 뒤" no longer true)
  npc_kid_prankster: N({ age: 9, sex: 'm', group: 'kid', jobId: 'student', house: 'h43_2', homeAt: ['playground'], values: ['adventure', 'food'], given: { ko: '준', en: 'Jun' },
    ko: { name: '장난꾸러기 준', short: '준', job: '초등학생 (자칭 눈싸움 대장)', home: '그네 옆 작은 집', traits: ['장난꾸러기', '눈싸움 대장', '들키면 도망감'], likes: ['눈덩이', '비밀 기지', '사탕'] },
    en: { job: 'primary school pupil (self-made snowball captain)', home: 'the little house by the swing', traits: ['prankster', 'snowball captain', 'runs when caught'], likes: ['snowballs', 'secret bases', 'candy'] } }),
  npc_kid_boy: N({ age: 8, sex: 'm', group: 'kid', jobId: 'student', house: 'h43_2', homeAt: ['playground'], values: ['adventure', 'friendship'], given: { ko: '도윤', en: 'Doyun' },
    ko: { name: '꼬마 도윤', short: '도윤', job: '초등학생', home: '분수 옆 파란 지붕 집', traits: ['개구쟁이', '눈싸움 좋아함'], likes: ['눈싸움', '술래잡기', '썰매'] },
    en: { job: 'primary school pupil', home: 'the blue-roofed house by the fountain', traits: ['playful', 'loves snowball fights'], likes: ['snowball fights', 'tag', 'sledding'] } }),
  npc_grandma: N({ age: 73, sex: 'f', group: 'elder', jobId: 'retired', house: 'with:npc_grandpa', homeAt: ['beach_w'], values: ['family', 'friendship'], given: null,
    ko: { name: '할머니', short: '할머니', job: '뜨개방 어르신', home: '벤치 옆 뜨개방 집', traits: ['인자함', '손주 자랑', '옛날이야기를 좋아함'], likes: ['뜨개질', '따뜻한 차', '마을 아이들'] },
    en: { job: 'knitting-room elder', home: 'the knitting cottage by the bench', traits: ['gentle', 'proud of the grandkids', 'loves old stories'], likes: ['knitting', 'warm tea', 'the village children'] } }),
  npc_young_man: N({ age: 24, sex: 'm', group: 'adult', jobId: 'mover', homeAt: ['plaza_s'], values: ['honor', 'adventure'], given: { ko: '태오', en: 'Taeo' },
    ko: { name: '청년 태오', short: '태오', job: '마을 일꾼', home: '역 앞 하숙집', traits: ['허세', '의욕 넘침'], likes: ['눈싸움', '팔씨름', '썰매'] },
    en: { job: 'village handyman', home: 'the boarding house by the station', traits: ['show-off', 'full of drive'], likes: ['snowball fights', 'arm wrestling', 'sledding'] } }),
  npc_teen_girl: N({ age: 15, sex: 'f', group: 'teen', jobId: 'student', homeAt: ['notice'], values: ['friendship', 'art'], given: { ko: '서아', en: 'Seoa' },
    ko: { name: '소녀 서아', short: '서아', job: '중학생 · 마을 소식통', home: '우체국 옆 하늘색 집', traits: ['수다쟁이', '유행에 밝음', '소문을 제일 먼저 앎'], likes: ['줄무늬 목도리 뜨기', '춤', '새로운 소식'] },
    en: { job: 'middle school pupil · village news hound', home: 'the sky-blue house by the post office', traits: ['chatterbox', 'knows the trends', 'first to hear every rumour'], likes: ['knitting striped scarves', 'dancing', 'fresh news'] } }),
  npc_postman: N({ age: 38, sex: 'm', group: 'adult', jobId: 'postal', homeAt: ['notice'], values: ['diligence', 'friendship'], given: null,
    ko: { name: '우체부', short: '우체부 아저씨', job: '우체부', home: '우체국', traits: ['시간 엄수', '친절함'], likes: ['제때 배달', '편지'] },
    en: { job: 'postman', home: 'the post office', traits: ['punctual', 'friendly'], likes: ['on-time deliveries', 'letters'] } }),
  npc_bard: N({ age: 31, sex: 'm', group: 'adult', jobId: 'musician', homeAt: ['green_fire', 'beach_w'], values: ['art', 'nature'], given: null,
    ko: { name: '음유시인', short: '음유시인', job: '음유시인', home: '모닥불 광장 옆 다락방', traits: ['낭만적', '노래를 좋아함'], likes: ['모닥불 공연', '눈 내리는 밤'] },
    en: { job: 'bard', home: 'the attic by the campfire square', traits: ['romantic', 'loves to sing'], likes: ['campfire concerts', 'snowy nights'] } }),
  npc_uncle: N({ age: 48, sex: 'm', group: 'adult', jobId: 'carpenter', homeAt: ['plaza_s'], values: ['diligence', 'food'], given: null,
    ko: { name: '아저씨', short: '아저씨', job: '마을 수리공', home: '광장 북쪽 굴뚝 집', traits: ['투덜이', '잘 삐짐', '속은 따뜻함', '껄껄 웃음'], likes: ['조용한 오후', '뜨끈한 국밥', '아끼는 헌팅캡'] },
    en: { job: 'village repairman', home: 'the chimney house north of the plaza', traits: ['grumpy', 'sulks easily', 'warm inside', 'big belly laugh'], likes: ['quiet afternoons', 'hot gukbap', 'his favourite flat cap'] } }),
  npc_blacksmith: N({ age: 29, sex: 'f', group: 'adult', jobId: 'builder', homeAt: ['st:smelter', 'plaza_s'], values: ['diligence', 'food'], given: null,
    ko: { name: '대장장이 언니', short: '대장장이 언니', job: '대장장이', home: '대장간', traits: ['호탕함', '힘이 셈', '껄껄 웃음'], likes: ['망치 소리', '든든한 밥', '잘 벼린 도구'] },
    en: { job: 'blacksmith', home: 'the forge', traits: ['hearty', 'strong', 'big belly laugh'], likes: ['the ring of the hammer', 'a hearty meal', 'well-honed tools'] } }),
  npc_fashion: N({ age: 27, sex: 'f', group: 'adult', jobId: 'model', homeAt: ['plaza_s'], values: ['art', 'honor'], given: null,
    ko: { name: '멋쟁이', short: '멋쟁이', job: '옷가게 단골 모델', home: '광장 남쪽 분홍 집', traits: ['자뻑', '멋 부리기'], likes: ['반짝이는 옷', '포즈 잡기'] },
    en: { job: "the clothes shop's favourite model", home: 'the pink house south of the plaza', traits: ['self-admiring', 'always dressed up'], likes: ['sparkly clothes', 'striking poses'] } }),
  npc_chef: N({ age: 41, sex: 'm', group: 'adult', jobId: 'cook', homeAt: ['st:grill', 'plaza_s'], values: ['food', 'honor'], given: null,
    ko: { name: '요리사 쿡', short: '쿡 셰프', job: '요리사', home: '식당 2층', traits: ['자부심', '먹보'], likes: ['생선구이', '새 요리법'] },
    en: { job: 'cook', home: 'above the restaurant', traits: ['proud', 'foodie'], likes: ['grilled fish', 'new recipes'] } }),
  npc_herbalist: N({ age: 34, sex: 'f', group: 'adult', jobId: 'herbalist', homeAt: ['green_fire', 'notice'], values: ['nature', 'diligence'], given: null,
    ko: { name: '약초꾼', short: '약초꾼', job: '약초꾼', home: '숲 가장자리 오두막', traits: ['소심함', '잘 놀람'], likes: ['조용한 숲', '약초차'] },
    en: { job: 'herbalist', home: 'the hut at the edge of the forest', traits: ['timid', 'easily startled'], likes: ['the quiet forest', 'herbal tea'] } }),
  npc_toddler: N({ age: 2, sex: 'm', group: 'toddler', jobId: 'toddler', homeAt: ['st:bakery', 'plaza_s'], values: ['family', 'adventure'], given: { ko: '콩콩', en: 'Kongkong' },
    ko: { name: '아기 콩콩', short: '콩콩이', job: '아기', home: '빵집 옆 집', traits: ['호기심', '잘 울음'], likes: ['멍멍이', '눈'] },
    en: { job: 'baby', home: 'the house next to the bakery', traits: ['curious', 'cries easily'], likes: ['doggies', 'snow'] } }),
  npc_yellow: N({ age: 33, sex: 'm', group: 'adult', jobId: 'none', homeAt: ['doghouse'], values: ['money', 'friendship'], given: null,
    ko: { name: '노란 파카 주민', short: '노란 파카 씨', job: '마을 주민', home: '마을 동쪽', traits: ['평범함'], likes: ['장보기'] },
    en: { job: 'villager', home: 'the east side of the village', traits: ['ordinary'], likes: ['grocery shopping'] } }),
  npc_red: N({ age: 29, sex: 'f', group: 'adult', jobId: 'none', homeAt: ['notice'], values: ['food', 'friendship'], given: null,
    ko: { name: '빨간 파카 주민', short: '빨간 파카 씨', job: '마을 주민', home: '마을 서쪽', traits: ['평범함'], likes: ['빵'] },
    en: { job: 'villager', home: 'the west side of the village', traits: ['ordinary'], likes: ['bread'] } }),
  npc_painter: N({ age: 35, sex: 'f', group: 'adult', jobId: 'painter', homeAt: ['se_hill', 'green_e', 'plaza_s'], values: ['art', 'nature'], given: null,
    ko: { name: '화가', short: '화가', job: '화가', home: '언덕 위 화실', traits: ['몽상가', '예술가'], likes: ['풍경', '하늘색 물감'] },
    en: { job: 'painter', home: 'the studio on the hill', traits: ['dreamer', 'artist'], likes: ['landscapes', 'sky-blue paint'] } }),
  npc_blue: N({ age: 45, sex: 'm', group: 'adult', jobId: 'none', homeAt: ['playground'], values: ['nature', 'friendship'], given: null,
    ko: { name: '파란 파카 주민', short: '파란 파카 씨', job: '마을 주민', home: '마을 북쪽', traits: ['평범함'], likes: ['산책'] },
    en: { job: 'villager', home: 'the north side of the village', traits: ['ordinary'], likes: ['walks'] } }),
  npc_doctor: N({ age: 46, sex: 'f', group: 'adult', jobId: 'doctor', homeAt: ['plaza_s'], values: ['family', 'diligence'], given: null,
    ko: { name: '의사 선생님', short: '의사 선생님', job: '의사', home: '병원', traits: ['다정함', '침착함'], likes: ['따뜻한 차', '건강한 마을'] },
    en: { job: 'doctor', home: 'the clinic', traits: ['kind', 'calm'], likes: ['warm tea', 'a healthy village'] } }),
  npc_skater: N({ age: 12, sex: 'f', group: 'kid', jobId: 'student', homeAt: ['green_e', 'playground'], values: ['adventure', 'nature'], given: null,
    ko: { name: '스케이트 소녀', short: '스케이트 소녀', job: '스케이트 선수 지망생', home: '연못 옆 집', traits: ['운동 좋아함', '우아함'], likes: ['스케이트', '빙판'] },
    en: { job: 'skater in training', home: 'the house by the pond', traits: ['sporty', 'graceful'], likes: ['skating', 'the ice'] } }),
  npc_guard: N({ age: 43, sex: 'm', group: 'adult', jobId: 'police', homeAt: ['east_dock', 'doghouse'], values: ['honor', 'diligence'], given: null,
    ko: { name: '경비대장', short: '경비대장', job: '경비대장', home: '망루 옆 초소', traits: ['용감함', '진지함'], likes: ['순찰', '질서'] },
    en: { job: 'guard captain', home: 'the guard post by the watchtower', traits: ['brave', 'serious'], likes: ['patrols', 'order'] } }),
  npc_merchant: N({ age: 52, sex: 'm', group: 'adult', jobId: 'shopkeeper', homeAt: ['south', 'plaza_s'], values: ['money', 'friendship'], given: null,
    ko: { name: '떠돌이 상인', short: '상인 아저씨', job: '떠돌이 상인', home: '마을 어귀 천막', traits: ['능청스러움', '말솜씨'], likes: ['흥정', '먼 나라 물건'] },
    en: { job: 'wandering merchant', home: 'the tent at the village entrance', traits: ['sly', 'smooth talker'], likes: ['haggling', 'goods from far away'] } }),
  npc_captain: N({ age: 64, sex: 'm', group: 'adult', jobId: 'captain', homeAt: ['east_dock', 'beach_w'], values: ['nature', 'friendship'], given: null,
    ko: { name: '선장 바다', short: '바다 선장', job: '선장', home: '부두 앞 등대 집', traits: ['유쾌함', '이야기꾼'], likes: ['바다', '큰 물고기', '뱃노래'] },
    en: { job: 'sea captain', home: 'the lighthouse house by the pier', traits: ['jolly', 'storyteller'], likes: ['the sea', 'big fish', 'sea shanties'] } }),
};

// job looks that never move in (the job-body lookup still names them)
export const JOB_LOOKS = ['npc_sawyer', 'npc_smoker', 'npc_cannery', 'npc_clerk_a', 'npc_clerk_b', 'npc_porter_a', 'npc_porter_b'];

// ------------------------------------------------------------------ family (가족 관계): [a, b, a's word for b, b's word for a]
export const FAMILY = [
  ['npc_grandpa', 'npc_grandma', { ko: '배우자 (아내)', en: 'wife' }, { ko: '배우자 (남편)', en: 'husband' }],
  ['npc_grandpa', 'npc_kid_prankster', { ko: '손자', en: 'grandson' }, { ko: '할아버지', en: 'grandpa' }],
  ['npc_grandpa', 'npc_kid_boy', { ko: '손자', en: 'grandson' }, { ko: '할아버지', en: 'grandpa' }],
  ['npc_grandma', 'npc_kid_prankster', { ko: '손자', en: 'grandson' }, { ko: '할머니', en: 'grandma' }],
  ['npc_grandma', 'npc_kid_boy', { ko: '손자', en: 'grandson' }, { ko: '할머니', en: 'grandma' }],
  ['npc_kid_prankster', 'npc_kid_boy', { ko: '사촌', en: 'cousin' }, { ko: '사촌', en: 'cousin' }],
  ['npc_aunt', 'npc_kid_girl', { ko: '같이 사는 이웃 아이', en: 'the neighbour girl she looks after' }, { ko: '같이 사는 아주머니', en: 'the auntie she lives with' }],
  ['npc_aunt', 'npc_toddler', { ko: '옆집 아기', en: 'the baby next door' }, { ko: '옆집 빵 아줌마', en: 'the bread auntie next door' }],
];

// 친한 사이: personas.js RELATIONS with affinity ≥ 60 among the named villagers (FAMILY pairs left out)
export const FRIENDS = [
  ['npc_kid_girl', 'npc_kid_prankster', { ko: '단짝 친구', en: 'best friend' }, { ko: '단짝 친구', en: 'best friend' }],
  ['npc_kid_girl', 'npc_teen_girl', { ko: '언니처럼 따르는 사이', en: 'like a big sister' }, { ko: '동생처럼 아끼는 사이', en: 'like a little sister' }],
  ['npc_kid_girl', 'npc_grandma', { ko: '친할머니처럼 따르는 사이', en: 'like her own grandma' }, { ko: '손녀처럼 아끼는 사이', en: 'like a granddaughter' }],
  ['npc_aunt', 'npc_grandma', { ko: '오랜 친구', en: 'old friend' }, { ko: '오랜 친구', en: 'old friend' }],
  ['npc_uncle', 'npc_blacksmith', { ko: '코코아 친구', en: 'cocoa buddy' }, { ko: '코코아 친구', en: 'cocoa buddy' }],
  ['npc_kid_boy', 'npc_kid_prankster', { ko: '눈싸움 친구', en: 'snowball buddy' }, { ko: '눈싸움 친구', en: 'snowball buddy' }],
  ['npc_kid_boy', 'npc_kid_girl', { ko: '같은 반 친구', en: 'classmate' }, { ko: '같은 반 친구', en: 'classmate' }],
  ['npc_bard', 'npc_painter', { ko: '예술가 친구', en: 'fellow artist' }, { ko: '예술가 친구', en: 'fellow artist' }],
  ['npc_skater', 'npc_teen_girl', { ko: '연못 친구', en: 'pond friend' }, { ko: '연못 친구', en: 'pond friend' }],
];

// ------------------------------------------------------------------ places
export const AREA = {
  beach_w: { ko: '바닷가 모닥불', en: 'the beach campfire' },
  notice: { ko: '게시판 앞', en: 'the notice board' },
  playground: { ko: '놀이터', en: 'the playground' },
  plaza_s: { ko: '광장', en: 'the plaza' },
  doghouse: { ko: '누리 집 앞', en: "Nuri's dog house" },
  green_fire: { ko: '숲속 모닥불 쉼터', en: 'the forest campfire' },
  green_e: { ko: '동쪽 공원', en: 'the east park' },
  green_w: { ko: '서쪽 공원', en: 'the west park' },
  south: { ko: '남쪽 캠프', en: 'the south camp' },
  east_dock: { ko: '동쪽 부두', en: 'the east pier' },
  south_fields: { ko: '남쪽 들판', en: 'the south fields' },
  se_hill: { ko: '남동쪽 언덕', en: 'the south-east hill' },
  west_camp: { ko: '서쪽 숲 쉼터', en: 'the west forest camp' },
  west_field: { ko: '서쪽 눈밭', en: 'the west snowfield' },
};
export const AREA_ANY = { ko: '마을', en: 'the village' };

/** the stations' names (operators' workplaces) */
export const STATION = {
  grill: { ko: '화덕', en: 'the grill', role: { ko: '요리사', en: 'cook' } },
  sawmill: { ko: '제재소', en: 'the sawmill', role: { ko: '제재공', en: 'sawyer' } },
  bakery: { ko: '빵집', en: 'the bakery', role: { ko: '제빵사', en: 'baker' } },
  smelter: { ko: '용광로', en: 'the smelter', role: { ko: '대장장이', en: 'smith' } },
  smokehouse: { ko: '훈제실', en: 'the smokehouse', role: { ko: '훈제 장인', en: 'smoker' } },
  toolsmith: { ko: '대장간', en: 'the forge', role: { ko: '대장장이', en: 'smith' } },
  cannery: { ko: '통조림 공장', en: 'the cannery', role: { ko: '통조림 기술자', en: 'canner' } },
};

// ------------------------------------------------------------------ jobs
// ko / en: the job's name; at: its workplace (Roster.workplace resolves the point); work: the routine text key
// day: coins per worked day (JOBS wage, else the value here); h: working hours (JOBS h, else here)
const J = (id, ko, en, at, extra) => Object.assign({ id, ko, en, at, day: JOBS[id] ? JOBS[id].wage : 0, h: JOBS[id] && JOBS[id].h ? JOBS[id].h.slice() : null }, extra || {});
export const JOB = {
  fisher: J('fisher', '어부', 'fisher', 'deck'),
  builder: J('builder', '목수', 'carpenter', 'build'),
  carpenter: J('carpenter', '목수', 'carpenter', 'build'),
  lumberjack: J('lumberjack', '나무꾼', 'lumberjack', 'sawmill'),
  farmer: J('farmer', '농부', 'farmer', 'field'),
  miner: J('miner', '광부', 'miner', 'mine'),
  hunter: J('hunter', '사냥꾼', 'hunter', 'hunt', { day: 32, h: [6, 15] }),
  shopkeeper: J('shopkeeper', '가게 점원', 'shop assistant', 'market'),
  cook: J('cook', '요리사', 'cook', 'restaurant'),
  hall_clerk: J('hall_clerk', '마을회관 직원', 'town hall clerk', 'hall'),
  dock: J('dock', '창고 일꾼', 'warehouse hand', 'warehouse'),
  station: J('station', '역무원', 'station attendant', 'station'),
  teller: J('teller', '은행 창구 직원', 'bank teller', 'bank'),
  picker: J('picker', '물류 직원', 'depot hand', 'depot'),
  baker: J('baker', '제빵사', 'baker', 'bakery'),
  doctor: J('doctor', '의사', 'doctor', null),
  police: J('police', '경비대장', 'guard captain', null),
  postal: J('postal', '우체부', 'postman', null),
  mover: J('mover', '마을 일꾼', 'village handyman', null),
  musician: J('musician', '음유시인', 'bard', null),
  painter: J('painter', '화가', 'painter', null),
  captain: J('captain', '선장', 'sea captain', null, { day: 40 }),
  herbalist: J('herbalist', '약초꾼', 'herbalist', null, { day: 28 }),
  model: J('model', '모델', 'model', null, { day: 26 }),
  // not paid by an employer: the engine's pension / pocket money (econ.js nightly: elders 12 a day, kids 2 from a parent)
  retired: J('retired', '은퇴', 'retired', null, { day: 12, pay: 'pension' }),
  student: J('student', '학생', 'pupil', null, { day: 2, pay: 'pocket' }),
  none: J('none', '쉬는 중', 'between jobs', null, { day: 0, pay: 'none' }),
  toddler: J('toddler', '아기', 'baby', null, { day: 0, pay: 'toddler' }),
};
for (const k in JOB) if (!JOB[k].pay) JOB[k].pay = 'salary';

/** the settlers' jobs by index (fnv(cid|job|i) % 18): [job id, gate]. Gate: a Progression.met id, or a predicate name */
export const SETTLER_JOBS = [
  ['fisher', null], ['fisher', null], ['builder', null], ['lumberjack', 'zone_forest'], ['lumberjack', 'zone_forest'],
  ['farmer', 'zone_farm'], ['farmer', 'zone_farm'], ['miner', 'zone_mine'], ['miner', 'zone_mine'], ['hunter', 'zone_hunt'],
  ['shopkeeper', 'hire_clerk_market'], ['cook', 'b:big_restaurant'], ['hall_clerk', 'b:town_hall'], ['dock', 'b:warehouse'],
  ['station', '?station'], ['teller', '?bank'], ['picker', '?depot'], ['none', null],
];

// ------------------------------------------------------------------ 가치 추구
export const VALUES = [
  { id: 'family', ko: '가족', en: 'Family', line: { ko: '가족과 이웃이 따뜻하게 지내는 게 제일 소중해요', en: 'Family and neighbours keeping warm together matter most' },
    kw: ['다정', '인자', '손주', '아이들', '가족', '아기', 'praises_kids', 'gentle', 'caring', 'kind', 'toddler'] },
  { id: 'friendship', ko: '우정', en: 'Friendship', line: { ko: '친구들과 웃고 떠드는 시간이 제일 좋아요', en: 'Laughing and chatting with friends is the best time' },
    kw: ['수다', '명랑', '친절', '이야기', '유쾌', '단짝', '바둑', '윷', '농담', '웃음', 'chatty', 'cheerful', 'friendly', 'storyteller', 'jolly', 'tag', 'jokes', 'yut', 'baduk', 'funny'] },
  { id: 'diligence', ko: '성실', en: 'Hard work', line: { ko: '맡은 일은 끝까지 해내요', en: 'Always finishes the job' },
    kw: ['성실', '시간 엄수', '진지', '깔끔', '참을성', '정리', '제때', 'hardworking', 'diligent', 'punctual', 'serious', 'patient', 'tidy', 'operator', 'strong'] },
  { id: 'adventure', ko: '모험', en: 'Adventure', line: { ko: '새로운 일에 뛰어드는 게 신나요', en: 'Jumping into something new is exciting' },
    kw: ['장난', '개구쟁이', '용감', '운동', '의욕', '눈싸움', '비밀 기지', '썰매', '스케이트', '호기심', '얼음낚시', 'prankster', 'playful', 'brave', 'sporty', 'competitive', 'curious', 'snowball_fights', 'runs_away', 'skating', 'sledding', 'snowball', 'prank'] },
  { id: 'money', ko: '돈', en: 'Money', line: { ko: '차곡차곡 모아서 언젠가 큰 가게를 낼 거예요', en: 'Saving up, bit by bit, for a big shop one day' },
    kw: ['흥정', '말솜씨', '능청', '알뜰', '외상', '장사', '장보기', '구경', 'sly', 'calls_customers', 'thrifty', 'shopping'] },
  { id: 'honor', ko: '명예', en: 'Pride', line: { ko: '모두에게 멋지다는 말을 듣고 싶어요', en: 'Wants everyone to say "how cool!"' },
    kw: ['허세', '자뻑', '자부심', '멋', '경비', '질서', '순찰', '지는 것', 'show_off', 'vain', 'proud', 'protects', 'salutes'] },
  { id: 'nature', ko: '자연', en: 'Nature', line: { ko: '눈 덮인 숲과 바다가 있는 이 마을이 좋아요', en: 'Loves this village of snowy woods and sea' },
    kw: ['숲', '약초', '바다', '모닥불', '풍경', '빙판', '산책', '꽃', '별', '오로라', '화분', 'herbalist', 'sea', 'weather_wise', 'campfire', 'stars', 'aurora', 'flowers', 'walks', 'gardening', 'fishing'] },
  { id: 'art', ko: '예술', en: 'Art', line: { ko: '아름다운 걸 만들어서 나누고 싶어요', en: 'Wants to make beautiful things and share them' },
    kw: ['낭만', '노래', '춤', '몽상', '예술', '그림', '물감', '공연', '포즈', '옷', '뜨개', '사진', '음악', 'romantic', 'plays_music', 'dreamy', 'artist', 'paints_scenery', 'dance', 'poses', 'music', 'singing', 'dancing', 'painting', 'photos', 'knitting'] },
  { id: 'food', ko: '맛있는 음식', en: 'Good food', line: { ko: '맛있는 걸 먹을 때가 제일 행복해요', en: 'Happiest when eating something tasty' },
    kw: ['먹보', '빵', '요리', '생선구이', '국밥', '밥', '코코아', '우유', '사탕', '과자', '고구마', '붕어빵', '커피', 'foodie', 'serves_food', 'cooking', 'baking', 'coffee', 'cocoa', 'sweetpotato', 'bungeoppang'] },
];
export const VALUE_BY_ID = {};
for (const v of VALUES) VALUE_BY_ID[v.id] = v;

/** the settlers' job word for value scoring */
export const JOB_WORD = { fisher: '자연', farmer: '자연', hunter: '자연', lumberjack: '자연', cook: '요리', shopkeeper: '흥정', teller: '흥정', builder: '성실', dock: '성실', picker: '성실', miner: '성실', hall_clerk: '수다', station: '수다' };

// ------------------------------------------------------------------ happiness: what makes a like "built" (decor keys / areas)
export const LIKE_BUILT = [
  { words: ['스케이트', '빙판', 'skating'], amen: ['deco_rink'], prop: 'rink', ko: '스케이트장이 생겨서 신나요', en: 'The skating rink makes them happy' },
  { words: ['눈사람', '눈싸움', '눈덩이', '썰매', '술래', 'snowman', 'snowball', 'sledding'], amen: ['deco_playground'], prop: 'fort', ko: '놀이터에서 놀 수 있어서 신나요', en: 'There is a playground to play in' },
  { words: ['꽃', '산책', '화분', 'flowers', 'walks', 'gardening'], amen: ['deco_fountain', 'deco_flowers'], prop: null, ko: '꽃과 분수가 예뻐서 좋아요', en: 'The flowers and the fountain are lovely' },
  { words: ['모닥불', 'campfire'], amen: [], prop: 'stand', ko: '모닥불 쉼터가 있어서 좋아요', en: 'Glad there is a campfire to sit by' },
];
