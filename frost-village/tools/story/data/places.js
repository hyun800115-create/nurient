// Kinds of places in town, the jobs they offer and how sociable they are. The game passes its own
// buildings (ids + kinds) with engine.world.addPlace(); the headless runner builds a default town
// (data/town.js). `asset` = the game sprite key the place usually maps to (for the integration).
//   social: how likely residents present there start a conversation (0..1)
//   open:   [from, to] hours (residents only come in opening hours, except homes)
//   cat:    home | shop | civic | outdoor | work

export const PLACE_KINDS = {
  home: { ko: '집', en: 'home', cat: 'home', social: 0.35, open: [0, 24], fire: 1.0, asset: 'townhouse_a' },
  plaza: { ko: '광장', en: 'the plaza', cat: 'outdoor', social: 1.0, open: [6, 22], asset: 'park_fountain' },
  park: { ko: '공원', en: 'the park', cat: 'outdoor', social: 0.9, open: [6, 21], asset: 'park_fountain' },
  playground: { ko: '놀이터', en: 'the playground', cat: 'outdoor', social: 1.0, open: [8, 19], asset: 'playground', kids: true },
  ice_rink: { ko: '스케이트장', en: 'the ice rink', cat: 'outdoor', social: 0.85, open: [9, 20], asset: 'ice_rink' },
  beach_fire: { ko: '바닷가 모닥불', en: 'the beach campfire', cat: 'outdoor', social: 0.95, open: [7, 22], asset: 'log_seat' },
  harbor: { ko: '항구', en: 'the harbour', cat: 'work', social: 0.5, open: [5, 20], asset: 'harbor_office' },
  forest: { ko: '소나무 숲', en: 'the pine forest', cat: 'work', social: 0.25, open: [6, 18], asset: 'station_sawmill' },
  farm: { ko: '밀밭', en: 'the wheat field', cat: 'work', social: 0.25, open: [6, 18], asset: 'station_bakery' },
  mine: { ko: '광산', en: 'the mine', cat: 'work', social: 0.25, open: [6, 18], asset: 'station_smelter' },
  town_hall: { ko: '마을회관', en: 'the town hall', cat: 'civic', social: 0.5, open: [8, 20], asset: 'town_hall' },
  school: { ko: '학교', en: 'school', cat: 'civic', social: 0.85, open: [7, 17], asset: 'school' },
  clinic: { ko: '병원', en: 'the clinic', cat: 'civic', social: 0.3, open: [8, 19], asset: 'clinic' },
  police: { ko: '경찰서', en: 'the police station', cat: 'civic', social: 0.3, open: [0, 24], asset: 'police_station' },
  fire_station: { ko: '소방서', en: 'the fire station', cat: 'civic', social: 0.3, open: [0, 24], asset: 'fire_station' },
  bank: { ko: '은행', en: 'the bank', cat: 'civic', social: 0.5, open: [9, 17], asset: 'bank', queue: true },
  post_office: { ko: '우체국', en: 'the post office', cat: 'civic', social: 0.5, open: [9, 18], asset: 'post_office', queue: true },
  station: { ko: '기차역', en: 'the train station', cat: 'civic', social: 0.6, open: [6, 22], asset: 'train_station' },
  logistics: { ko: '물류센터', en: 'the logistics centre', cat: 'work', social: 0.45, open: [6, 19], asset: 'logistics_center', queue: true },
  furniture_workshop: { ko: '가구 공방', en: 'the furniture workshop', cat: 'work', social: 0.3, open: [7, 18], asset: 'furniture_workshop' },
  appliance_factory: { ko: '가전 공장', en: 'the appliance factory', cat: 'work', social: 0.3, open: [7, 18], asset: 'appliance_factory' },
  library: { ko: '도서관', en: 'the library', cat: 'civic', social: 0.25, open: [9, 19], asset: 'bookstore' },
  newspaper: { ko: '솔방울 신문사', en: 'the Pinecone Times office', cat: 'work', social: 0.4, open: [7, 19], asset: 'post_office' },
  builder_yard: { ko: '건설 사무소', en: 'the builders’ yard', cat: 'work', social: 0.35, open: [7, 18], asset: 'carpenter_workshop' },
  memorial: { ko: '추모 정원', en: 'the memorial garden', cat: 'outdoor', social: 0.2, open: [7, 19], asset: 'memorial_garden' },
  // shops (sell goods; owners pick up stock at the logistics centre and get settled there)
  bakery: { ko: '빵집', en: 'bakery', cat: 'shop', social: 0.7, open: [7, 19], shop: 'bakery', asset: 'cafe', fire: 1.6 },
  cafe: { ko: '카페', en: 'café', cat: 'shop', social: 1.0, open: [8, 21], shop: 'cafe', asset: 'cafe' },
  restaurant: { ko: '식당', en: 'restaurant', cat: 'shop', social: 0.9, open: [11, 21], shop: 'restaurant', asset: 'restaurant', fire: 1.6 },
  grocer: { ko: '슈퍼마켓', en: 'supermarket', cat: 'shop', social: 0.6, open: [8, 21], shop: 'grocer', asset: 'supermarket', queue: true },
  fishmonger: { ko: '생선 가게', en: 'fish shop', cat: 'shop', social: 0.5, open: [6, 17], shop: 'fishmonger', asset: 'fish_auction' },
  stall: { ko: '붕어빵 노점', en: 'bungeoppang stall', cat: 'shop', social: 0.85, open: [11, 21], shop: 'stall', asset: 'flower_stand', fire: 1.3 },
  hardware: { ko: '철물점', en: 'hardware shop', cat: 'shop', social: 0.4, open: [9, 18], shop: 'hardware', asset: 'hardware_store' },
  furniture_store: { ko: '가구점', en: 'furniture shop', cat: 'shop', social: 0.35, open: [10, 19], shop: 'furniture_store', asset: 'carpenter_workshop' },
  appliance_store: { ko: '가전 매장', en: 'appliance shop', cat: 'shop', social: 0.35, open: [10, 19], shop: 'appliance_store', asset: 'hardware_store' },
  bookstore: { ko: '서점', en: 'bookshop', cat: 'shop', social: 0.45, open: [10, 20], shop: 'bookstore', asset: 'bookstore' },
  florist: { ko: '꽃집', en: 'flower shop', cat: 'shop', social: 0.5, open: [9, 19], shop: 'florist', asset: 'flower_shop' },
  toy_shop: { ko: '장난감 가게', en: 'toy shop', cat: 'shop', social: 0.7, open: [10, 19], shop: 'toy_shop', asset: 'toy_shop' },
  clothing: { ko: '옷가게', en: 'clothes shop', cat: 'shop', social: 0.55, open: [10, 20], shop: 'clothing', asset: 'clothing_store' },
  general: { ko: '잡화점', en: 'general store', cat: 'shop', social: 0.55, open: [8, 20], shop: 'general', asset: 'shop_general' },
  salon: { ko: '미용실', en: 'hair salon', cat: 'shop', social: 1.0, open: [10, 19], shop: null, asset: 'hair_salon' },
};

// shop kinds a resident may dream of opening (with a loan), and their founding cost
export const SHOP_DREAMS = ['bakery', 'cafe', 'restaurant', 'stall', 'florist', 'bookstore', 'toy_shop', 'clothing', 'grocer', 'salon', 'furniture_store', 'appliance_store', 'hardware', 'general'];
export const SHOP_COST = { stall: 300, florist: 700, bookstore: 800, toy_shop: 800, clothing: 900, cafe: 1000, bakery: 1100, salon: 900, general: 900, grocer: 1300, restaurant: 1400, hardware: 1000, furniture_store: 1500, appliance_store: 1600 };

// cute shop-name adjectives: '눈꽃 카페', '모락모락 식당'
export const SHOP_ADJ = [
  ['눈꽃', 'Snowflake'], ['솔방울', 'Pinecone'], ['포근', 'Cosy'], ['모락모락', 'Steamy'], ['반짝', 'Twinkle'], ['달콤', 'Sweet'],
  ['따끈', 'Toasty'], ['하얀', 'White'], ['동글', 'Round'], ['별빛', 'Starlight'], ['오로라', 'Aurora'], ['펭귄', 'Penguin'],
  ['북극곰', 'Polar Bear'], ['뽀득', 'Crunchy Snow'], ['소복', 'Fresh Snow'], ['고드름', 'Icicle'], ['눈사람', 'Snowman'], ['겨울잠', 'Hibernation'],
];

// what jobs exist: place kind, hours, daily wage, condition tag, how others address them
//   title: honorific title used after the surname (김 순경님 → '{sur} 순경'), kid: how kids say it ('경찰 아저씨')
export const JOBS = {
  baker: { ko: '제빵사', en: 'baker', place: 'bakery', h: [6, 14], wage: 34, tag: 'j_food', kid: '빵집' },
  barista: { ko: '바리스타', en: 'barista', place: 'cafe', h: [8, 17], wage: 30, tag: 'j_food', kid: '카페' },
  cook: { ko: '요리사', en: 'cook', place: 'restaurant', h: [10, 20], wage: 34, tag: 'j_food', kid: '식당' },
  grocer: { ko: '슈퍼 주인', en: 'grocer', place: 'grocer', h: [8, 19], wage: 32, tag: 'j_shop', kid: '슈퍼' },
  fishmonger: { ko: '생선 장수', en: 'fishmonger', place: 'fishmonger', h: [6, 15], wage: 30, tag: 'j_shop', kid: '생선 가게' },
  stall_keeper: { ko: '붕어빵 장수', en: 'bungeoppang seller', place: 'stall', h: [11, 20], wage: 24, tag: 'j_food', kid: '붕어빵' },
  shopkeeper: { ko: '가게 주인', en: 'shopkeeper', place: 'shop', h: [9, 18], wage: 30, tag: 'j_shop', kid: null },
  hairdresser: { ko: '미용사', en: 'hairdresser', place: 'salon', h: [10, 19], wage: 30, tag: 'j_shop', kid: '미용실' },
  teacher: { ko: '선생님', en: 'teacher', place: 'school', h: [8, 16], wage: 36, tag: 'j_teacher', title: '선생님', kid: null },
  student: { ko: '학생', en: 'student', place: 'school', h: [8, 15], wage: 0, tag: 'j_student' },
  doctor: { ko: '의사', en: 'doctor', place: 'clinic', h: [9, 18], wage: 48, tag: 'j_doctor', title: '선생님', kid: '의사' },
  nurse: { ko: '간호사', en: 'nurse', place: 'clinic', h: [8, 17], wage: 34, tag: 'j_doctor', title: '간호사', kid: '간호사' },
  police: { ko: '경찰관', en: 'police officer', place: 'police', h: [8, 18], wage: 38, tag: 'j_police', title: '순경', kid: '경찰' },
  detective: { ko: '형사', en: 'detective', place: 'police', h: [9, 19], wage: 42, tag: 'j_police', title: '형사', kid: '형사' },
  firefighter: { ko: '소방관', en: 'firefighter', place: 'fire_station', h: [8, 20], wage: 38, tag: 'j_fire', title: '소방관', kid: '소방관' },
  banker: { ko: '은행원', en: 'banker', place: 'bank', h: [9, 17], wage: 42, tag: 'j_bank', title: '과장', kid: '은행' },
  teller: { ko: '창구 직원', en: 'bank teller', place: 'bank', h: [9, 16], wage: 34, tag: 'j_bank', kid: '은행' },
  picker: { ko: '물류 직원', en: 'warehouse picker', place: 'logistics', h: [7, 16], wage: 32, tag: 'j_logi', kid: '창고' },
  forklift: { ko: '지게차 기사', en: 'forklift driver', place: 'logistics', h: [7, 16], wage: 36, tag: 'j_logi', title: '기사', kid: '지게차' },
  driver: { ko: '배달 기사', en: 'delivery driver', place: 'logistics', h: [8, 17], wage: 34, tag: 'j_logi', title: '기사', kid: '택배' },
  clerk: { ko: '정산 직원', en: 'settlement clerk', place: 'logistics', h: [8, 17], wage: 34, tag: 'j_logi', kid: '창고' },
  carpenter: { ko: '목수', en: 'carpenter', place: 'furniture_workshop', h: [8, 17], wage: 36, tag: 'j_builder', kid: '목수' },
  factory: { ko: '공장 기술자', en: 'factory technician', place: 'appliance_factory', h: [8, 17], wage: 36, tag: 'j_builder', kid: '공장' },
  postal: { ko: '우체부', en: 'postal worker', place: 'post_office', h: [8, 17], wage: 32, tag: null, kid: '우체부' },
  station: { ko: '역무원', en: 'station attendant', place: 'station', h: [6, 18], wage: 32, tag: null, kid: '기차역' },
  hall_clerk: { ko: '마을회관 직원', en: 'town hall clerk', place: 'town_hall', h: [9, 17], wage: 34, tag: null, kid: null },
  reporter: { ko: '기자', en: 'reporter', place: 'newspaper', h: [9, 18], wage: 34, tag: 'j_reporter', title: '기자', kid: '기자' },
  librarian: { ko: '사서', en: 'librarian', place: 'library', h: [9, 18], wage: 30, tag: null, kid: '도서관' },
  fisher: { ko: '어부', en: 'fisher', place: 'harbor', h: [5, 13], wage: 32, tag: 'j_nature', kid: '어부' },
  dock: { ko: '부두 일꾼', en: 'dock worker', place: 'harbor', h: [7, 16], wage: 32, tag: 'j_nature', kid: '항구' },
  lumberjack: { ko: '나무꾼', en: 'lumberjack', place: 'forest', h: [7, 16], wage: 32, tag: 'j_nature', kid: '나무꾼' },
  farmer: { ko: '농부', en: 'farmer', place: 'farm', h: [7, 16], wage: 30, tag: 'j_nature', kid: '농부' },
  miner: { ko: '광부', en: 'miner', place: 'mine', h: [7, 16], wage: 34, tag: 'j_nature', kid: '광부' },
  builder: { ko: '건설 기사', en: 'builder', place: 'builder_yard', h: [8, 17], wage: 36, tag: 'j_builder', title: '반장', kid: '공사장' },
  mover: { ko: '이삿짐 기사', en: 'mover', place: 'builder_yard', h: [8, 17], wage: 32, tag: 'j_builder', kid: '이삿짐' },
  musician: { ko: '음악가', en: 'musician', place: 'plaza', h: [13, 21], wage: 22, tag: null, kid: null },
  painter: { ko: '화가', en: 'painter', place: 'park', h: [10, 17], wage: 22, tag: null, kid: null },
  retired: { ko: '은퇴', en: 'retired', place: null, h: null, wage: 0, tag: 'j_retired' },
  none: { ko: '쉬는 중', en: 'between jobs', place: null, h: null, wage: 0, tag: 'j_none' },
};

// how many of each job a single place of that kind employs
export const STAFF = {
  bakery: [['baker', 2]], cafe: [['barista', 2]], restaurant: [['cook', 2]], grocer: [['grocer', 2]], fishmonger: [['fishmonger', 1]],
  stall: [['stall_keeper', 1]], hardware: [['shopkeeper', 1]], furniture_store: [['shopkeeper', 1]], appliance_store: [['shopkeeper', 1]],
  bookstore: [['shopkeeper', 1]], florist: [['shopkeeper', 1]], toy_shop: [['shopkeeper', 1]], clothing: [['shopkeeper', 1]],
  general: [['shopkeeper', 1]], salon: [['hairdresser', 2]],
  school: [['teacher', 5]], clinic: [['doctor', 2], ['nurse', 2]], police: [['police', 5], ['detective', 1]], fire_station: [['firefighter', 6]],
  bank: [['banker', 2], ['teller', 3]], logistics: [['picker', 5], ['forklift', 2], ['driver', 3], ['clerk', 2]],
  furniture_workshop: [['carpenter', 4]], appliance_factory: [['factory', 5]], post_office: [['postal', 3]], station: [['station', 3]],
  town_hall: [['hall_clerk', 3]], newspaper: [['reporter', 2]], library: [['librarian', 1]], harbor: [['fisher', 6], ['dock', 4]],
  forest: [['lumberjack', 5]], farm: [['farmer', 5]], mine: [['miner', 5]], builder_yard: [['builder', 6], ['mover', 3]],
  plaza: [['musician', 1]], park: [['painter', 1]],
};
