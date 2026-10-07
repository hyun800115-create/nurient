// =====================================================================
//  게임 안의 모든 글자 (한국어 ko / 영어 en)
//  {n}, {name} 같은 부분은 게임이 숫자/이름으로 바꿔 넣습니다.
// =====================================================================

export const STRINGS = {
  ko: {
    title: '서리마을 개척기',
    subtitle: 'Frost Village',
    tapToStart: '탭하여 시작',
    loading: '불러오는 중…',
    continueHint: '이어서 하기',

    // HUD / 토스트
    bagFull: '가방이 가득 찼어요!',
    notEnoughCoins: '코인이 부족해요',
    stationFull: '가득 찼어요!',
    saved: '저장되었습니다',
    resetDone: '처음부터 다시 시작해요',

    // 설정
    settings: '설정',
    sound: '효과음',
    music: '음악',
    language: '언어',
    langName: '한국어',
    reset: '처음부터 하기',
    resetConfirm: '정말 처음부터 다시 할까요?\n모든 진행 상황이 사라져요.',
    yes: '네, 다시 할래요',
    no: '아니요',
    on: '켜짐',
    off: '꺼짐',
    close: '닫기',

    // 튜토리얼 / 목표
    obj_fish: '그물 앞에 서서 물고기를 모으세요',
    obj_grill: '생선을 그릴 발판에 내려놓으세요',
    obj_take: '구운 생선을 가져가세요',
    obj_sell: '구운 생선을 판매대에 놓으세요',
    obj_cash: '손님이 낸 코인을 주우세요',
    obj_unlock: '코인을 들고 발판 위에 서 보세요',
    obj_wait: '손님이 오고 있어요…',

    // 발판 이름
    hire_fisherman: '어부 고용',
    hire_lumberjack: '나무꾼 고용',
    hire_farmer: '농부 고용',
    hire_miner: '광부 고용',
    hire_hunter: '사냥꾼 고용',
    hire2_fisherman: '어부 추가 고용',
    hire2_lumberjack: '나무꾼 추가 고용',
    hire2_farmer: '농부 추가 고용',
    hire2_miner: '광부 추가 고용',
    hire2_hunter: '사냥꾼 추가 고용',
    zone_forest: '벌목장',
    zone_farm: '농장',
    zone_mine: '광산',
    zone_hunt: '사냥터',
    up_capacity: '가방',
    up_speed: '신발',
    max: 'MAX',
    level: 'Lv.{n}',

    // 구역 / 시설 이름
    z_plaza: '광장',
    z_forest: '소나무 숲',
    z_farm: '밀밭',
    z_mine: '광산',
    z_hunt: '사냥터',
    unlocked: '{name} 열림!',
    hired: '{name} 합류!',
    upgraded: '{name} 업그레이드!',
    villageComplete: '마을 완성!',
    villageCompleteSub: '모든 구역이 열렸어요! 일꾼을 더 고용해 보세요',
    newCustomer: '손님이 왔어요',
    capacityUp: '가방 +{n}',
    speedUp: '속도 업!',
  },

  en: {
    title: 'Frost Village',
    subtitle: '서리마을 개척기',
    tapToStart: 'Tap to start',
    loading: 'Loading…',
    continueHint: 'Continue',

    bagFull: 'Your bag is full!',
    notEnoughCoins: 'Not enough coins',
    stationFull: 'It\'s full!',
    saved: 'Saved',
    resetDone: 'Starting over',

    settings: 'Settings',
    sound: 'Sound',
    music: 'Music',
    language: 'Language',
    langName: 'English',
    reset: 'Reset progress',
    resetConfirm: 'Really start over?\nAll progress will be lost.',
    yes: 'Yes, reset',
    no: 'No',
    on: 'On',
    off: 'Off',
    close: 'Close',

    obj_fish: 'Stand by the net to catch fish',
    obj_grill: 'Drop the fish on the grill pad',
    obj_take: 'Pick up the grilled fish',
    obj_sell: 'Put the grilled fish on the counter',
    obj_cash: 'Collect the coins',
    obj_unlock: 'Stand on the pad with your coins',
    obj_wait: 'Customers are coming…',

    hire_fisherman: 'Hire Fisher',
    hire_lumberjack: 'Hire Lumberjack',
    hire_farmer: 'Hire Farmer',
    hire_miner: 'Hire Miner',
    hire_hunter: 'Hire Hunter',
    hire2_fisherman: 'Another Fisher',
    hire2_lumberjack: 'Another Lumberjack',
    hire2_farmer: 'Another Farmer',
    hire2_miner: 'Another Miner',
    hire2_hunter: 'Another Hunter',
    zone_forest: 'Lumber Camp',
    zone_farm: 'Farm',
    zone_mine: 'Mine',
    zone_hunt: 'Hunting Ground',
    up_capacity: 'Backpack',
    up_speed: 'Boots',
    max: 'MAX',
    level: 'Lv.{n}',

    z_plaza: 'Plaza',
    z_forest: 'Pine Forest',
    z_farm: 'Wheat Farm',
    z_mine: 'Mine',
    z_hunt: 'Hunting Ground',
    unlocked: '{name} unlocked!',
    hired: '{name} joined!',
    upgraded: '{name} upgraded!',
    villageComplete: 'Village Complete!',
    villageCompleteSub: 'Every area is open! Hire more workers',
    newCustomer: 'A customer arrived',
    capacityUp: 'Bag +{n}',
    speedUp: 'Speed up!',
  },
};

let current = 'ko';

export function detectLang() {
  try {
    const nav = (navigator.language || navigator.userLanguage || 'ko').toLowerCase();
    return nav.startsWith('ko') ? 'ko' : 'en';
  } catch (e) { return 'ko'; }
}

export function setLang(l) { current = STRINGS[l] ? l : 'ko'; }
export function getLang() { return current; }

export function t(key, params) {
  const table = STRINGS[current] || STRINGS.ko;
  let s = table[key];
  if (s === undefined) s = STRINGS.ko[key];
  if (s === undefined) return key;
  if (params) for (const k in params) s = s.split('{' + k + '}').join(String(params[k]));
  return s;
}

export const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif";
