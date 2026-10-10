// =====================================================================
//  갈매기 항구 숫자표 (harbor_runtime, docs/v5_v8_plan.md §6.4)
//  나중에 게임에 붙일 때 이 표가 그대로 src/data/balance.js 의 BALANCE.v6.harbor 로 옮겨져요 (P20).
//  숫자만 고치면 돼요. 시간은 게임 초(하루 = 600초, 한 시간 = 25초), 시각은 0~24 시예요.
//  값 = 코인, item_plank / item_ingot = 공사에 드는 판자 / 주괴 개수, time = 공사 초.
// =====================================================================

export const HARBOR_TUNING = {
  // ---- 항구 살리기 (순서대로 하나씩 열려요)
  railExt:   { coins: 12000, item_plank: 80, item_ingot: 40, time: 25 },  // 0. 동쪽 철길 잇기 (안개가 걷히고 잠든 항구가 보여요)
  station:   { coins: 8000,  item_plank: 40, item_ingot: 20, time: 14 },  // 1. 항구역 + 솔방울 동쪽 정거장 (해안선 기차가 달려요)
  auction:   { coins: 6000,  item_plank: 30, time: 12,                    // 2. 수산물 경매장
               smallEvery: 50, smallFrom: 8, smallTo: 18,                 //    작은 경매: 50초(2시간)마다, 8시~18시
               bigAt: 16.75,                                              //    큰 경매: 16시 45분 (첫 원양어선이 15시 50분에 돌아와 상자를 다 내린 뒤)
               premium: 1.5,                                              //    경매 발판에 놓은 생선은 1.5배 값
               base: { item_fish_raw: 4, item_fish_big: 20 },             //    기본 값 (× 1.5 → 생선 6, 참치 30)
               tunaPrice: 30, tunaPerBox: 10 },                           //    원양어선 생선 상자 하나 = 참치 10마리 × 30
  lighthouse:{ coins: 3000,  item_ingot: 10, time: 8, nightFerry: 22.5 }, // 3. 등대 불 밝히기 (밤 22시 30분 여객선이 생겨요; 18시 30분 배가 떠난 뒤라야 항구 안 뱃길이 비어요)
  terminal:  { coins: 15000, item_plank: 60, item_ingot: 30, time: 18 },  // 4. 여객선 터미널
  ferry:     { at: [6.5, 10.5, 14.5, 18.5], dwell: 34,                    //    여객선 도착 시각, 머무는 초 (34초: 앞 배가 입구를 지나가야 다음 배가 들어와요)
               tourists: [8, 20], wantMin: 2, wantMax: 5, stayFerries: 2,  //    관광객 수, 사고 싶은 물건 수, 몇 번째 배로 돌아가는지
               spendPerItem: 11, townChance: 0.6,                         //    물건 하나에 쓰는 돈, 기차 타고 솔방울·우리 마을로 놀러 갈 확률
               guestChance: 0.25, settlerChance: 0.35, settlersMax: 20,   //    특별 손님 확률, 새 주민 확률, 항구 주민 최대 수
               board: 8 },                                                //    배가 떠나기 몇 초 전에 관광객이 배에 올라타는지
  crane:     { coins: 20000, item_plank: 40, item_ingot: 40, time: 18 },  // 5. 크레인 + 세관
  cargo:     { at: 11.2, dwell: 150, exportMult: 2.0, deadlineShips: 1,   //    화물선 11시 10분 도착 (10시 30분 여객선이 닿은 바로 뒤, 항구 입구가 빌 때), 150초(6시간) 머묾, 수출값 2배, 다음 배까지가 마감
               liftEvery: 3.2 },                                          //    크레인 한 번 들어 옮기는 데 걸리는 초 (움직임 2초 + 쉼)
  imports:   { order: ['sugar', 'cloth', 'glass', 'spice'],               //    수입이 열리는 순서 (배마다 하나씩)
               sugar: { crates: 6, cake: { item_bread: 2, sugar: 1, time: 2.4, price: 18 } },  // 설탕 → 케이크
               cloth: { crates: 8 },                                      //    천 → 솔방울 옷가게
               glass: { crates: 10, houseLv2: true, happyCap: 12 },       //    유리 → 창문 있는 집 (2단계)
               spice: { crates: 6, cookedBoost: 1.25 } },                 //    향신료 → 식당 생선 요리 값 1.25배
  shipyard:  { coins: 25000, item_plank: 60, item_ingot: 30, time: 20 },  // 6. 조선소
  trawler:   { coins: 30000, item_plank: 80, item_ingot: 40, build: 60,   //    원양어선 한 척 값, 조선소에서 만드는 초
               out: 5, back: 15, haul: 25, unload: 20, catch: 8, max: 3,  //    나가는 시각, 돌아오는 시각, 그물 올리는 초, 생선 내리는 초, 상자 수, 최대 척수
               rareChance: 0.08 },                                        //    희귀 물고기가 잡힐 확률 (미션 E10)
  stars:     { 2: { ships: 20, exports: 200, tourists: 150 }, 3: { ships: 60, exports: 800, tourists: 600 } },  // 항구 별 ★2 · ★3
  coast:     { dwell: 10, cars: 3, speed: 2.6, accel: 0.6, brake: 0.8, whistleBefore: 2.5 },  // 해안선 기차 (v4 기차와 같은 속도)
  exports:   { 1: [{ item_can: 60, item_plank: 120 }, { item_bread: 80, item_fish_cooked: 60 }, { item_ingot: 50, tools: 3 }],
               2: [{ item_can: 120, item_plank: 200, item_ingot: 60 }, { item_fish_big: 20, item_can: 80 }],
               3: 'mix' },                                                //    ★3: 위 주문 두 개를 합쳐 1.5배
  make:      { item_can: 240, item_plank: 360, item_bread: 300, item_fish_cooked: 360, item_ingot: 240, tools: 24, item_fish_big: 60 },  // 도시 무렵 하루(600초)에 만들 수 있는 어림 양 (수출 주문이 너무 크지 않은지 검사할 때만 써요)
  gulls: 6,                                                               // 갈매기 수 (화면에 최대 6마리)
  happen:    { every: 300, gapMin: 150 },                                 // 귀여운 일 (갈매기 습격, 크레인 상자 흔들흔들) 간격
  ships:     { sidle: 64, turn: 1.2, accelS: 3.0, astern: 0.6, basin: 1.5, seaSpeed: 2.2, maxDelay: 300 },  // 배: 옆으로 밀릴 때 속도(px/초), 방향 바꾸는 초, 가속 초, 뒤로 갈 때 속도 배율, 항구 안 속도 배율, 먼 바다 속도 배율, 최대 늦어짐(초)
  budget:    { ships: 6, people: 24, liveMargin: 700 },                   // 화면에 그리는 배 · 사람 최대 수, 화면 밖 이만큼(px)까지 그리기
};

/** BALANCE.v6.harbor (when the game has it) merged one level deep over the defaults above */
export function harborTuning(balance) {
  const B = (balance && balance.v6 && balance.v6.harbor) || null;
  const out = {};
  for (const k in HARBOR_TUNING) {
    const d = HARBOR_TUNING[k];
    const o = B && B[k];
    out[k] = d && typeof d === 'object' && !Array.isArray(d) ? Object.assign({}, d, o && typeof o === 'object' ? o : {}) : (o !== undefined ? o : d);
  }
  return out;
}

/** the revive steps in order (cost rows above) */
export const STEPS = ['railExt', 'station', 'auction', 'lighthouse', 'terminal', 'crane', 'shipyard'];
