// 햇살 해변 숫자표 (docs/v5_v8_plan.md §6.5 → 통합 때 BALANCE.v7.beach 로 그대로 옮겨요).
// 기획자가 바꾸기 쉬운 숫자는 전부 여기에 있어요. 시간은 게임 초(하루 600초, 한 시간 25초), 돈은 코인이에요.
// beachTuning(BALANCE) 는 BALANCE.v7.beach 가 있으면 그 값을 먼저 쓰고, 없는 칸만 아래 기본값으로 채워요.

export const BEACH_TUNING = {
  // ── 해변 가는 길 (갈매기 항구 ★2 다음): 바닷가 큰길 동쪽 끝을 잇는 공사
  path: { coins: 5000, item_plank: 30, time: 15 },
  // ── 해변 청소: 모래밭의 미역·유목 조각 수, 촌장이 이만큼(px) 가까이 가면 주워요
  cleanup: { pieces: 12, reach: 56 },
  // ── 인명구조대 (해수욕장 개장): whistleGap = 구조요원 호루라기 사이 최소 간격(초)
  lifeguard: { coins: 6000, item_plank: 30, item_ingot: 6, time: 12, whistleGap: 40, driftChance: 0.05 },
  // ── 해변 주문판 (v4 가게 열기 방식 그대로, 두 번째 주문판): order = 주문이 나오는 순서, rent = 월세(코인/분),
  //    cards = 가게를 여는 주문 (물건: 개수; 설탕·천·유리는 항구에서 온 상자), buildTime = 짓는 시간(초)
  founding: {
    order: ['beach_cafe', 'icecream_shop', 'seafood_bbq', 'convenience_store', 'souvenir_shop', 'swimwear_shop', 'surf_shop'],
    rent: { beach_cafe: 30, icecream_shop: 35, seafood_bbq: 35, convenience_store: 40, souvenir_shop: 30, swimwear_shop: 30, surf_shop: 30 },
    cards: {
      beach_cafe: { item_bread: 40, item_cake: 10 },
      icecream_shop: { crate_sugar: 6, item_bread: 20 },
      seafood_bbq: { item_fish_cooked: 40, item_meat_cooked: 20 },
      convenience_store: { item_can: 40, item_bread: 30 },
      souvenir_shop: { item_plank: 40, item_ingot: 15 },
      swimwear_shop: { crate_cloth: 8 },
      surf_shop: { item_plank: 60 },
    },
    buildTime: 25,
  },
  // ── 해변 가게 선반: shelf = 한 가지 물건이 들어가는 개수, restockBelow = 이만큼(0.4 = 40%) 아래로 줄면 마을 물건을 주문해요,
  //    wholesale = 마을 물건을 보내면 '판매 가격 × wholesale' 코인, bonus = 해변까지 보내는 덤(× (1 + bonus))
  shops: {
    shelf: 20, restockBelow: 0.4, wholesale: 0.7, bonus: 0.3,
    goods: {                                  // 가게마다 손님이 사 가는 마을 물건
      beach_cafe: ['item_bread', 'item_cake'],
      icecream_shop: ['item_bread', 'crate_sugar'],
      seafood_bbq: ['item_fish_cooked', 'item_meat_cooked'],
      convenience_store: ['item_can', 'item_bread'],
      souvenir_shop: ['item_plank', 'item_ingot'],
      swimwear_shop: ['crate_cloth'],
      surf_shop: ['item_plank'],
      beach_bar: ['item_bread', 'item_fish_cooked'],
    },
    price: { item_cake: 18, crate_sugar: 14, crate_cloth: 16, crate_glass: 16 },   // balance.js 에 없는 물건 값
  },
  // ── 리조트 호텔: rooms = 등급별 방 수, stayDays = 머무는 날, spendPerDay = 방 하나가 하루에 쓰는 돈(최소, 최대),
  //    up = 2·3등급 올리는 값, checkinShare = 여객선 관광객 중 호텔에 묵는 비율, checkoutHour = 떠나는 시각
  hotel: { coins: 40000, item_plank: 120, item_ingot: 60, glassCrates: 20, time: 30, rooms: [12, 20, 32], stayDays: 2, spendPerDay: [20, 45],
           up: [15000, 25000], upTime: 14, checkinShare: 0.35, checkoutHour: 10, spendHour: 9, balconyFrom: 19, balconyTo: 23 },
  // ── 호텔 수영장 (호텔 ★2)
  pool: { coins: 20000, item_ingot: 40, time: 18 },
  // ── 작은 수족관: rareChance = 배가 희귀 물고기를 잡을 확률, ticket = 구경 한 번에 내는 돈
  aquarium: { coins: 18000, item_plank: 30, item_ingot: 20, time: 14, rareChance: 0.04, ticket: 5 },
  // ── 수영장이 생기면 저절로 생기는 덤 건물
  extras: ['beach_bar', 'pension', 'beach_arcade'],
  // ── 해변에 동시에 있는 사람: present = 해변에 있는 사람(최대), rigs = 자세히 그리는 사람, swimmers = 바다에서 노는 사람,
  //    sunbathers = 누워서 쉬는 사람, boats = 배, crabs = 꽃게, busyFrom~busyTo = 붐비는 시각
  live: { present: 60, rigs: 30, swimmers: 12, sunbathers: 16, boats: 4, crabs: 6, busyFrom: 10, busyTo: 17 },
  // ── 해변 별: 2 = 가게 5곳 + 호텔, 3 = 가게 7곳 + 수영장 + 수족관
  stars: { 2: { shops: 5, hotel: 1 }, 3: { shops: 7, pool: 1, aquarium: 1 } },
  // ── 해변 손님: ferryShare = 여객선 관광객 중 해변에 오는 비율, trainDelay = 해안 기차를 타고 오기까지(초),
  //    localsPerHour = 별(0~3)에 따라 한 시간에 놀러 오는 우리 동네 사람 무리, stayHours = 해변에 머무는 시간(시간),
  //    fallbackFerry = 항구가 없을 때 (실험실) 여객선이 오는 시각, fallbackN = 그때 내리는 사람 수
  crowd: { ferryShare: 0.5, trainDelay: [35, 80], localsPerHour: [0, 2.5, 4, 6], stayHours: [3, 6], fallbackFerry: [6.5, 10.5, 14.5, 18.5],
           fallbackN: 14, walk: 70, wade: 40, swim: 26, weekCrowd: 1.5 },
  // ── 놀이 시간 (초, 최소~최대)
  acts: { sunbathe: [40, 90], swim: [30, 60], splash: [14, 26], dig: [30, 55], volley: [36, 70], icecream: [3, 3], shop: [6, 10],
          stroll: [12, 24], sit: [16, 34], shower: [4, 6], watch: [8, 16], kite: [30, 60], surf: [24, 40], photo: [4, 6] },
  // ── 모래성: 아이들이 파면 이만큼(초)마다 한 단계씩 커져요
  sandcastle: { stageEvery: 20 },
  // ── 행사: 모래성 대회 / 불꽃놀이 / 북극곰 수영 대회 / 햇살 해변 축제 주간
  events: {
    contest: { kids: 6, secs: 80, gapDays: 5 },
    fireworks: { hour: 21, secs: 40, gapDays: 7, bursts: 26 },
    polar: { swimmers: 6, secs: 46, gapDays: 10, bread: 20 },
    week: { days: 7 },
  },
  // ── 귀여운 일 (P9~P12): 이야기 엔진이 없을 때 해변이 직접 고르는 간격
  happenings: { gapMin: 150, every: 300, range: 900 },
  // ── 엔진: 놀이 대본을 몇 초마다 한 번 돌릴지 (4 Hz)
  tick: 0.25,
};

const merge1 = (a, b) => {
  const out = Object.assign({}, a);
  for (const k in b || {}) {
    const v = b[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) ? Object.assign({}, a[k], v) : v;
  }
  return out;
};

/** BALANCE.v7.beach (if present) over the defaults, one level deep */
export function beachTuning(balance) {
  const b = balance && balance.v7 && balance.v7.beach;
  return b ? merge1(BEACH_TUNING, b) : BEACH_TUNING;
}

/** the progression steps, in order (sites, walks and the board) */
export const STEPS = ['path', 'reveal', 'cleanup', 'lifeguard', 'board', 'hotel', 'pool', 'aquarium', 'up2', 'up3'];
/** steps that are a build site (the game's Site flow: porters, scaffold, ribbon) */
export const SITE_STEPS = ['path', 'lifeguard', 'hotel', 'pool', 'aquarium', 'up2', 'up3'];
