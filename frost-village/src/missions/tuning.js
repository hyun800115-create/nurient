// =====================================================================
//  (v5) 촌장 미션 · 명성 숫자표 (missions_bank 모듈)
// ---------------------------------------------------------------------
//  게임에 넣을 때 이 블록이 그대로 balance.js 의 BALANCE.v5.missions 로 옮겨져요 (docs/v5_v8_plan.md P20).
//  그 전에는 이 파일의 값이 쓰여요. 숫자만 바꾸고 저장하면 돼요.
//  시간 단위: 초 (게임 하루 = 600초 = 10분, 게임 1시간 = 25초).  pay = '지금 1분 수입'의 몇 배.
// =====================================================================

export const MISSIONS_TUNING = {
  board: 3,                // 게시판에 한 번에 걸리는 미션 카드 수
  refresh: 20,             // 미션 하나를 끝내면 이만큼(초) 뒤에 새 카드가 걸려요
  swapAfter: 120,          // 이만큼(초) 동안 진행이 없으면 '다른 미션' 버튼이 생겨요 (하던 것은 보관함에 그대로 남아요)
  bubblesOnScreen: 2,      // 화면 안에 동시에 보이는 부탁 말풍선 최대 수
  bubblesWorld: 4,         // 마을 전체에 떠 있는 부탁 말풍선 최대 수
  acceptedMax: 3,          // 한꺼번에 받아 둘 수 있는 부탁 수
  requestEvery: [45, 90],  // 새 부탁 말풍선이 생기는 간격 (최소, 최대 초)
  bubbleLife: 360,         // 아무도 안 받은 말풍선은 이만큼(초) 뒤에 사라져요
  acceptRange: 90,         // 주민 곁 이만큼(px) 안에 0.5초 서 있으면 부탁 카드가 떠요
  acceptStill: 0.5,        //   (가만히 서 있어야 하는 시간, 초) — 걸어와서 멈췄을 때만 떠요 (일하느라 서 있을 땐 안 떠요)
  payFloor: 100,           // 보상 코인의 최소값 (× 시대: 읍 1, 도시 2, 큰 도시 3)
  income: { window: 300 }, // '지금 1분 수입' = 최근 300초 동안 번 코인의 1분 평균 (미션·대출 돈은 빼고)
  focusDeadline: 75,       // 마감이 이만큼(초 = 게임 3시간) 안에 있는 행사 미션이 맨 먼저 칩에 떠요
  revalidate: 5,           // 이만큼(초)마다 미션을 할 수 있는지 다시 확인 (받는 사람이 이사 갔으면 조용히 끝내요)
  daily:  { count: 3, pay: 0.5, fame: 5, allPay: 1.0, allFame: 15, resetHour: 5, clock: 'real' },   // clock: 'real' = 실제 날짜 / 'game' = 게임 하루
  weekly: { pay: [2, 3, 5], fame: [20, 30, 50], resetDay: 1, resetHour: 5,                         // resetDay 1 = 월요일
            decor: ['wedding_arch', 'lantern_string', 'igloo', 'snow_fort', 'kids_swing'] },         // 주마다 돌아가며 주는 장식
  streak: { rewards: { 2: { fame: 10 }, 3: { decor: 'deco_flowers' }, 5: { pay: 3 }, 7: { fame: 50, flair: 'crown' } },
            shieldPerWeek: 1, comboRequests: 5, comboWindow: 900, comboFame: 5, driveStars: 3, driveFame: 20,
            crownHours: 24, driverFlair: 600 },  // 왕관은 실제 24시간, '베스트 드라이버'는 게임 하루(600초)
  drive:  { par: { slackPerStop: 8, vmaxShare: 0.6 }, stars: [1.0, 1.3, 2.0], payByStars: [0.6, 0.85, 1.0], bonusFame3: 5,
            startStand: 0.6 },   // 화물장 '출발' 발판에 이만큼(초) 서 있으면 운전이 시작돼요 (게시판 카드의 '출발' 버튼도 돼요)
  fame:   { titles: [0, 150, 400, 900, 2000], riders: 25, lifeBeat: 5, newThing: 5, happening: 2,
            settlerBoost: [0, 0.1, 0.1, 0.2, 0.3], touristBoost: [0, 0, 0, 0.2, 0.3] },
  craft:  { bouquetStand: 3, bouquetsPerBed: 12, bouquetBuy: 25, cakeBread: 12, cakeTime: 20, giftItems: 3, bagMax: 12 },
  escort: { near: 110, along: 12 },  // 함께 가기: 주민 곁 이만큼(px) 안에 가면 따라와요 / 목적지를 모르면 이만큼(초) 함께 걸으면 끝
  goalLastHour: 18,        // '오늘' 목표(통조림 30개 등)는 이 시각 전에만 새로 걸려요 (끝낼 시간이 있게)
  maxParked: 6,            // 보관함에 넣어 둘 수 있는 미션 수
  eventStale: 1800,        // 마감이 없는 행사 미션이 이만큼(초 = 게임 3일) 아무 진행이 없으면 조용히 끝나요
  boardStale: 1500,        // 게시판 카드가 이만큼(초 = 게임 2.5일) 아무 진행이 없으면 조용히 내려가고 새 카드가 걸려요
  schoolAge: 7,            // 이 나이 생일이면 다음 날 '첫 등교 함께 가기' (이야기 엔진의 schoolAge 와 같아야 해요)
};

/** BALANCE.v5.missions (when it exists) over these defaults — one level deep, unknown keys ignored */
export function missionsTuning(over) {
  const out = JSON.parse(JSON.stringify(MISSIONS_TUNING));
  if (!over || typeof over !== 'object') return out;
  for (const k in out) {
    if (!(k in over)) continue;
    const a = out[k], b = over[k];
    if (a && typeof a === 'object' && !Array.isArray(a) && b && typeof b === 'object' && !Array.isArray(b)) Object.assign(a, b);
    else if (typeof b === typeof a || (Array.isArray(a) && Array.isArray(b))) out[k] = b;
  }
  return out;
}
