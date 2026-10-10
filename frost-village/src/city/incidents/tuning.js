// =====================================================================
//  사건·사고 숫자표 (incidents_runtime, docs/v5_v8_plan.md §6.7)
//  나중에 게임에 붙일 때 이 표가 그대로 src/data/balance.js 의 BALANCE.v8.incidents 로 옮겨져요 (P20).
//  숫자만 고치면 돼요. 시간은 게임 초(하루 = 600초, 한 시간 = 25초), 거리는 화면 px 예요.
//  값 = 코인, item_plank / item_ingot = 공사에 드는 판자 / 주괴 개수, time = 공사 초.
//  사건은 모두 귀엽고 아무도 다치지 않아요. 마을이 행복할수록 드물어요.
// =====================================================================

export const INCIDENTS_TUNING = {
  on: true,                     // 사건·사고 처음 상태 (설정 '사건·사고: 켜기 / 끄기' 에서 바꿔요)
  incidentRate: 0.4,            // 좀도둑·새치기·눈덩이·티격태격 정도 (이야기 엔진 기본값 × 0.4 → 하루 약 0.8번)
  fireRate: 0.05,               // 불이 나는 정도 (주민 250명당 하루 0.05번 ≈ 20일에 한 번)
  fireGapDays: 4,               // 불과 불 사이는 적어도 이만큼(게임 날) 떨어져요
  happy: { at0: 1.25, at1: 0.75 },   // 마을 행복 0% 일 때 ×1.25, 100% 일 때 ×0.75 (행복하면 사건이 줄어요)
  hydrant: { coins: 400, fireCut: 0.05, cutMax: 0.4, max: 24 },   // 소화전 하나 400코인, 불 5% 줄임 (최대 40%), 최대 24개
  fireStation: {                // 솔방울 소방서 레벨 (t_fire). 레벨마다 불이 10% 줄고 소방차가 빨리 와요
    2: { coins: 12000, item_plank: 40, item_ingot: 30, time: 14, fireCut: 0.1 },
    3: { coins: 20000, item_plank: 60, item_ingot: 40, time: 18, fireCut: 0.1 },
  },
  police: { coins: 15000, item_plank: 60, item_ingot: 30, time: 16, officers: 2 },   // 경찰서 (새 시가지; 자리는 layout.js POLICE_PLACES)
  drillFirst: true,             // 소방 훈련(미션 C14)을 마치기 전에는 불이 나지 않아요
  // ---- 무대 (눈앞에서 보여 주기)
  stageRange: 1200,             // 화면 가장자리에서 이만큼(px) 안에서 생긴 사건만 눈앞에서 보여 줘요
  unstageRange: 1700,           // 보여 주던 사건에서 이만큼 멀어지면 무대를 내려요 (이야기는 계속돼요)
  ackTimeout: { 'theft:chase': 45, 'fire:dispatch': 40, 'fire:spray': 45, 'scuffle:fight': 25 },   // 화면 연출이 늦어도 이야기가 멈추지 않게: 이 초가 지나면 넘어가요
  offAck: { 'theft:chase': 27, 'fire:dispatch': 12, 'fire:spray': 20, 'scuffle:fight': 10 },      // 화면 밖 사건은 이만큼 뒤에 넘어가요 (엔진의 보통 길이)
  minShow: { 'theft:chase': 12, 'fire:dispatch': 3, 'fire:spray': 10, 'scuffle:fight': 6 },       // 화면에서 적어도 이만큼은 보여 줘요
  tail: { theft: 11, queue: 5, window: 6, scuffle: 6, fire: 10, drill: 6, apology: 7 },            // 사건이 끝난 뒤 박수·인사하는 초
  // ---- 그림 메모리 (사건이 무대에 오를 때만 그림을 불러요)
  transientMiB: 70, transientMaxS: 90, releaseAfter: 15,
  // ---- 안심 막대 (큰 도시 승격 조건: 90%)
  safety: { days: 10, resolveWithin: 600, prior: 0 },   // 최근 10일, 하루(600초) 안에 해결되고 불이 폐허가 되기 전에 꺼지면 '안심'
  //   prior: 계산할 때 '잘 끝난 사건'을 이만큼 미리 넣어 둬요 (0 = 기획서 그대로; 2로 하면 조용한 주에 한 번 불이 나도 0 %가 아니라 67 %)
  // ---- 불탄 집
  ruinCoolS: 120,               // 폐허에서 연기가 이만큼(초) 피어오른 뒤 식어요
  rebuiltShowS: 60,             // 다시 지은 집 반짝반짝 리본 (초)
  // ---- 이사
  moving: { unload: 6, boxes: 4, carry: 4.5, welcomeDays: 1, saleSigns: 8 },   // 이삿짐 트럭 내리는 초, 상자 수, 상자 하나 나르는 초, 환영 매트 날 수, 매물 표지판 최대
  // ---- 귀여운 숫자
  crowd: { min: 3, max: 6, ring: 150 },        // 구경꾼 수, 건물에서 떨어져 서는 거리(px)
  reward: { tipFame: 5, catFame: 3 },          // 제보 명성, 고양이 구조를 본 명성
};

/** BALANCE.v8.incidents (when the game has it) merged one level deep over the defaults above */
export function incidentsTuning(balance) {
  const B = (balance && balance.v8 && balance.v8.incidents) || null;
  const out = {};
  for (const k in INCIDENTS_TUNING) {
    const d = INCIDENTS_TUNING[k];
    const o = B ? B[k] : undefined;          // (B && B[k] would hand back null for every number when there is no v8 block)
    out[k] = d && typeof d === 'object' && !Array.isArray(d) ? Object.assign({}, d, o && typeof o === 'object' ? o : {}) : (o !== undefined ? o : d);
  }
  return out;
}
