// 솔방울 물류센터 숫자 표 (logistics_runtime, docs/v5_v8_plan.md §6.6). 게임에 넣을 때 이 표가 그대로
// balance.js 의 BALANCE.v8.logistics 로 옮겨 가요 (P20). 숫자만 고치면 돼요 — 코드는 안 건드려도 돼요.
// 시간 단위: 초 = 게임 초 (하루 600초, 한 시간 25초).

export const LGX_TUNING = {
  // ── 물류센터 짓기 (해변 ★2 뒤 은행장 편지 → 새 시가지 c_logistics 자리)
  centre: { coins: 50000, item_plank: 150, item_ingot: 80, time: 30 },
  // ── 문 여는 날 축하 선물: 텅 빈 선반으로 시작하지 않게 솔방울 마을이 보내 주는 물건 (0 이면 없음)
  openGift: { item_bread: 24, item_plank: 30, item_ingot: 12, item_can: 16, item_axe: 3, item_fish_cooked: 20 },
  // ── 정산: 가게 주인이 내는 돈 = 물건 값 × wholesaleRate (도매) × (1 + settleBonus)
  //    집(살림살이) 주문은 주민이 값을 그대로 내요 (homeRate 1.0)
  wholesaleRate: 0.7,
  settleBonus: 0.15,
  homeRate: 1.0,
  // ── 물류 금고: 정산한 돈이 여기에 쌓이고, collectEvery 초마다 저절로 촌장님 지갑으로 (읍부터, 월세와 같아요)
  collectEvery: 15,
  // ── 일하는 시간 (시). 이 밖에는 직원이 퇴근하고 밴도 안 와요
  hours: { open: 5.5, close: 22.5 },
  // ── 선반이 꽉 차는 물건 수 (분류마다). 재고 / 이 숫자 = 선반 높이 (1 = 꽉 찬 선반)
  cap: { materials: 160, food: 160, goods: 120, tools: 60, furniture: 40, appliances: 30 },
  // ── 지게차: 한 번에 나르는 물건 수, 속도(px/초), 후진할 때 속도 배수, 포크 올리기/내리기 (초, 각각)
  //    tidyS = 할 일 없이 이만큼(초) 서 있으면 '재고 정리' 한 바퀴 (재고는 그대로, 보기에만 바빠요)
  pallet: 20,
  forklift: { speed: 125, reverse: 0.6, liftS: 0.6, checkS: 0.5, tidyS: 5 },
  // ── 직원: 물건 하나 고르는 데 걸리는 초 (고르는 직원 한 명당), 포장 = packBase + 물건마다 packPer 초
  pickS: 0.9, packBase: 2.2, packPer: 0.18,
  // ── 정산 창구: 한 사람 정산하는 시간, 그중 도장 쾅! 은 stampAt 초에
  settleS: 3.0, stampAt: 1.5,
  // ── 가게 주문: pollS 초마다 가게 선반을 보고, 모자란 게 minNeed 개 이상이면 주문 (한 번에 최대 maxItems)
  //    walkInMax 개 이하의 작은 주문은 주인이 걸어와서 상자를 안고 가요 (그보다 크면 밴을 몰고 와요)
  //    max = 한꺼번에 열린 주문 수 (저장 한도와 같아요), waitStockS = 재고가 모자라면 이만큼 기다렸다가 있는 만큼 보내요
  orders: { pollS: 3, minNeed: 6, maxItems: 20, walkInMax: 6, max: 12, waitStockS: 75, giveUpS: 900 },
  // ── 차: 길에서 오가는 시간(초), 속도(px/초), 후진 속도 배수, 제자리에서 방향 바꾸는 시간(초),
  //    짐을 다 싣고 문이 닫힌 뒤 출발까지 기다리는 시간(초)
  van: { roadS: [10, 18], speed: 140, reverse: 0.8, turnS: 0.35, leaveWaitS: 0.8 },
  truck: { roadS: [12, 20] },
  // ── 사람 걷는 속도 (px/초, 동네 사람 60~90; 가게 주인들은 바빠서 조금 빨라요)
  walk: 80,
  // ── 들어오는 짐: maxWaiting = 오는 중이거나 하역장 앞에서 기다리는 트럭·밴이 이만큼이면 더 안 받아요
  //    (화물장이 물건을 갖고 있다가 다음에 보내요 — 하역장 앞에 차가 끝없이 줄 서지 않게)
  inbound: { maxWaiting: 3 },
  // ── 2차 → 3차 산업: 가구 공방 / 가전 공장 (마을 M 터에 지어요)
  //    recipe = 재료 3 → 물건 1, make = 만드는 시간(초), outMax = 다 만든 물건을 쌓아 두는 수,
  //    pickupAt = 이만큼 쌓이면 물류센터 밴이 가지러 와요 (idlePickupS 초가 지나면 덜 쌓여도 가져가요;
  //    가는 길에 다른 공방에 쌓인 것도 함께 실어요)
  furniture: { coins: 9000, item_plank: 30, time: 10, recipe: { item_plank: 3 }, make: 6, outMax: 8, pickupAt: 7, idlePickupS: 75, roadS: 14,
               makes: ['item_chair', 'item_table', 'item_sofa', 'item_bed', 'item_wardrobe'] },
  appliance: { coins: 12000, item_ingot: 30, time: 10, recipe: { item_ingot: 3 }, make: 8, outMax: 8, pickupAt: 7, idlePickupS: 75, roadS: 16,
               makes: ['item_radio', 'item_stove_iron', 'item_washer', 'item_fridge', 'item_tv_retro'] },
  // ── 가구·가전 값 (코인). 다른 물건 값은 balance.js 에서 와요
  prices: { item_chair: 25, item_table: 40, item_sofa: 70, item_bed: 80, item_wardrobe: 90,
            item_radio: 50, item_stove_iron: 90, item_washer: 110, item_fridge: 120, item_tv_retro: 140 },
  // ── 집 3단계 "살림살이": 가구 3 + 가전 1 을 배달하면 그 집 행복 +2 (모두 합쳐 최대 16)
  //    every = 이만큼(초)마다 살림살이가 아직 없는 집을 골라 배달을 준비해요, open = 한꺼번에 준비하는 배달 수,
  //    perVan = 밴 한 대가 한 번에 들르는 집 수
  houseLv3: { furniture: 3, appliance: 1, happy: 2, happyCap: 16, maxHouses: 32, every: 40, open: 2, perVan: 2 },
  // ── 이사 온 집에 보내는 새 살림 (story move-in): 가구 2 + 가전 1
  moveIn: { furniture: 2, appliance: 1 },
  // ── 이야기 엔진 가게(주민이 연 가게)의 물건 받기: 한꺼번에 무대에 올리는 수
  story: { open: 3, pending: 6 },
  // ── 하루 배송 기록 (큰 도시 막대: 하루 150) — 최근 며칠까지 저장
  days: 10,
  // ── 숫자가 아니라 그림·화면 (뷰): 지붕 투명 시간(ms, manifest 와 같게), 가까울 때만 그림 (px)
  fadeMs: 350,
  nearPx: 1500,
};

/** 게임의 BALANCE.v8.logistics 가 있으면 그 값을, 없으면 이 표를 써요 (얕게 합침) */
export function lgxTuning(BALANCE) {
  const b = BALANCE && BALANCE.v8 && BALANCE.v8.logistics;
  if (!b || typeof b !== 'object') return LGX_TUNING;
  const out = Object.assign({}, LGX_TUNING);
  for (const k of Object.keys(b)) {
    const v = b[k];
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && LGX_TUNING[k] && typeof LGX_TUNING[k] === 'object' ? Object.assign({}, LGX_TUNING[k], v) : v;
  }
  return out;
}
