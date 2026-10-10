// =====================================================================
//  탈것 숫자표 (vehicles_runtime, docs/v5_v8_plan.md §6.3)
//  나중에 게임에 붙일 때 이 표가 그대로 src/data/balance.js 의 BALANCE.v5.vehicles 로 옮겨져요.
//  숫자만 고치면 돼요. 속도는 초당 미터(m/s), 시간은 게임 초(하루 = 600초, 한 시간 = 25초) 예요.
//  한 칸 = 약 1.4 m 예요 (길 한 줄 차선 = 2칸).
// =====================================================================

export const VEHICLES_TUNING = {
  // ---- 지을 것들 (값 = 코인, item_* = 재료 개수, time = 공사 초)
  depot:       { coins: 3000, item_plank: 30, item_ingot: 6, time: 10 },   // 마구간 차고지 (도시가 되면 그 자리에서 주유소로 바뀌어요)
  road:        { coins: 5000, item_plank: 40, item_ingot: 10, time: 20 },  // 서리 큰길 (광장 동문 ↔ 서리역)
  stop:        { coins: 600, time: 3 },                                     // 정류장 하나 (S2 서리역·S3 솔방울 분수는 무료)
  freightYard: { coins: 1200, time: 4 },                                    // 서리 화물장 (짐을 모아 두는 곳)
  busDepot:    { coins: 0, time: 0 },                                       // 버스 차고지: 도시 승격식이 공짜로 지어 줘요

  // ---- 읍 시대 탈것
  sleighBus:   { coins: 3500, speed: 3.0, seats: 8, dwell: 8, headway: 70, accel: 0.9 },   // 말썰매 버스 (손님 8명 + 마부)
  steamWagon:  { coins: 4000, item_ingot: 20, speed: 3.4, capacity: 30, loadTime: 4, unloadPerItem: 0.12, accel: 0.8 },  // 증기 짐차
  cargoSleigh: { capacity: 20, speed: 2.6 },                                 // 짐수레 썰매 (역 짐꾼이 쓰는 썰매, 12 → 20개)
  dogSled:     { speed: 5.5, accel: 2.2 },                                   // 촌장님 개썰매 (편지 배달 미션)

  // ---- 도시 시대 탈것
  retroBus:    { coins: 6000, speed: 5.0, seats: 9, dwell: 6, headway: 50, accel: 1.2 },  // 레트로 버스 (운전기사 + 손님 8명)
  truck:       { coins: 7000, speed: 5.5, capacity: 40, loadTime: 3, unloadPerItem: 0.1, accel: 1.4 },  // 운송트럭
  chiefTruck:  { speed: 6.0, coast: 0.6, accel: 2.4 },                       // 촌장님 트럭: 손을 떼면 최고 속도의 60 % 로 천천히 가요
  cars:        { maxMoving: 6, maxParked: 24, colours: 4, speed: 5.0, accel: 1.8, tripEvery: 45, parkMin: 60, parkMax: 180 },  // 주민 자동차 (한 번에 움직이는 차, 세워 둔 차, 한 번에 쓰는 색 수)

  // ---- 길과 신호
  //  green / yellow = 한 방향 초록·노랑 불 초, red = 다른 방향이 초록인 동안 (그래서 한 바퀴 = (6 + 2) × 2 = 16초)
  //  blockAhead = 사람 앞 몇 m 에서 서는지, gap / headwayS = 앞차와의 거리 (1.2 m + 0.9초 × 속도)
  //  bellAfter = 사람이 길에 서 있으면 몇 초 기다렸다가 딸랑딸랑 (도시는 빵!) 한 번 울리는지
  traffic:     { green: 6, yellow: 2, red: 6, blockAhead: 1.5, honkEvery: 3, gap: 1.2, headwayS: 0.9, bellAfter: 2 },
  speedByClass: { dirt: 3, cobble: 4, asphalt: 5.5, horses: 2.5 },          // 길 종류별 최고 속도 (말·개썰매는 흙길에서 2.5)
  turnSpeed:   { S: 99, L: 2.4, R: 2.0, U: 1.5 },                            // 모퉁이 돌 때 최고 속도 (직진은 제한 없음)
  brake:       { comfort: 2.2, hard: 6.0 },                                  // 브레이크 (보통 / 급정거)

  // ---- 주차장
  parking_lot_s: { coins: 1500, item_ingot: 4, time: 5, happy: 2 },

  // ---- 도시 승격식: 길이 한 줄씩 아스팔트로 바뀌는 간격 (초, 중앙로에서 바깥으로)
  ceremony:    { wipeStep: 0.6 },

  // ---- 운전 미션 (배달)
  //  기준 시간 par = 길이 ÷ (최고 속도 × 0.6) + 정류장마다 8초. par 안에 오면 ★★★, 1.3배 안이면 ★★, 그 밖은 ★ (실패는 없어요)
  //  turnHold = 멈춘 채로 조이스틱을 뒤로 이만큼(초) 당기고 있으면 그 자리에서 빙 돌아요
  drive:       { parFactor: 0.6, perStop: 8, star2: 1.3, unload: 2.5, stopReach: 3.4, turnHold: 0.5 },

  // ---- 버스 손님
  riders:      { days: 10, villageCap: 24 },                                 // 손님 수를 기억하는 날 수, 우리 마을에 한꺼번에 있을 수 있는 이웃 수 (v4 maxInVillage)

  // ---- 그림 (텍스처 메모리)
  residency:   { maxKeys: 8, ttl: 20, maxMiB: 45 },                          // 한꺼번에 올려 두는 탈것 그림 수, 안 보이면 20초 뒤 내림
  budget:      { simulated: 24, materialised: 12, passengersDrawn: 4, liveMargin: 900 },  // 움직이는 탈것 최대 수, 화면에 그리는 최대 수, 버스 한 대에 그리는 손님 수
};

/** BALANCE.v5.vehicles (when the game has it) merged one level deep over the defaults above */
export function vehiclesTuning(balance) {
  const B = (balance && balance.v5 && balance.v5.vehicles) || null;
  const out = {};
  for (const k in VEHICLES_TUNING) {
    const d = VEHICLES_TUNING[k];
    const o = B && B[k];
    out[k] = d && typeof d === 'object' && !Array.isArray(d) ? Object.assign({}, d, o && typeof o === 'object' ? o : {}) : (o !== undefined ? o : d);
  }
  return out;
}
