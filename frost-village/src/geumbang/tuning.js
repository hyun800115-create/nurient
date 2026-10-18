// 금방 tuning (docs/geumbang_plan.md §8.1): the BALANCE.v43.gb defaults. Integration patch G-P10 copies the `gb`
// block into src/data/balance.js (with these Korean comments) and balanceCheck.js ranges; until then the module
// runs on this copy. gbTuning(BALANCE) merges whatever BALANCE.v43.gb holds over the defaults (missing keys keep
// the default, so a partial balance block never breaks the module). Pure data: no Phaser, no window.

export const GB_TUNING = {
  gate:   { dayS: 600, fullAt: 0.6, fullForS: 120 },                 // 물류창고 후 하루, 또는 선반 60 % 이상 120초 → 편지
  open:   { coins: 4000, item_plank: 20, item_ingot: 10, time: 15, firstDelayS: 3.5 },  // 금방 개업 값 (코인 + 판자 + 주괴, 짓는 시간 초) · 문 연 뒤 첫 주문까지 초
  hours:  { open: 7, close: 21 },                                     // 금방이 일하는 시각 (밤에는 새벽배송이 있어야 해요)
  orders: { everyDays: 1.2, itemsMin: 2, itemsMax: 6, linesMax: 3, maxOpen: 24, perAddressOpen: 2, keepFloor: 4,
            hot: 0.6, hotMult: 1.5, low: 0.25, lowMult: 0.5, snowMult: 1.3, dealMult: 2, favW: 2,
            // 시각별 주문 배수 [시작, 끝, 배수] (끝이 24 넘으면 다음 날 새벽), 나머지 시각은 otherMult
            hourMult: [[7, 9, 1.2], [12, 13, 1.0], [18, 22, 1.6], [22, 26, 0.8], [26, 30, 0.2]], otherMult: 0.9,
            maxGapS: 30, firstItems: { item_log: 4, item_bread: 2 }, firstWaitS: 60,  // 첫 주문 (정 할머니: 장작 4 · 빵 2) · 물건이 없을 때 다른 주문을 막는 시간
            queueRounds: 1 },                                        // 기다리는 주문은 밴·썰매가 한 바퀴에 싣는 양까지만 (금방 가려면 줄이 짧아야 해요)
  // 주문할 수 있는 물건과 가중치 (가게에 없는 날것도 금방에서는 팔아요). 광석·주괴는 팔지 않아요
  catalog:{ item_bread: 1, item_meat_cooked: 0.8, item_fish_cooked: 1, item_can: 0.8, item_plank: 0.5,
            item_fish_raw: 1, item_meat_raw: 1, item_log: 1, item_wheat: 0.6,
            item_axe: 0.1, item_rod: 0.15, item_sickle: 0.1, item_bow: 0.1, item_pickaxe: 0.1 },
  // 가게 값 (BALANCE.prices 가 없을 때). 금방 값 = 가게 값 × priceRate (날것은 rawPrice)
  shopPrice: { item_bread: 7, item_meat_cooked: 12, item_fish_cooked: 4, item_can: 12, item_plank: 5,
               item_axe: 40, item_rod: 40, item_sickle: 40, item_bow: 40, item_pickaxe: 40 },
  guard:  { shelfMin: 0.5, resumeS: 60, meatShelf: 0.75, meatForS: 60 }, // 가게 먼저: 판매대가 모자라면 잠깐 품절
  hub:    { pickLineS: 4, packS: 3, loadEachS: 0.6, pickers: 1, packers: 1 },
  pay:    { priceRate: 0.8, rawPrice: { item_fish_raw: 2, item_meat_raw: 5, item_log: 2, item_wheat: 2 },
            promiseS: 150, happyOnTime: 0.95, happyLate: 0.8 },
  van:    { cap: 8, maxStops: 6, waitS: 50, loadS: 6, doorS: 3, accel: 1.5, speed: { dirt: 3.5, cobble: 4.5, asphalt: 5.5 },
            curbMaxM: 12, yieldAheadM: 2.5, honkAfterS: 6, skipAfterS: 20, mainWeight: 1.3, turnS: 0.3, max: 3,
            breakEvery: 3, breakS: 10, watchdogS: 60,
            decel: 2.6, turnSpeed: 2.0, reverseMult: 0.6, pivotS: 0.5, reverseM: 2.4, corridorM: 0.9, yieldNearM: 0.6,
            walkMaxM: 30,                                             // 문까지 걷는 길이 이보다 길면 밴이 못 가요
            idleWaitS: 12,                                            // 다른 밴이 모두 쉬고 있으면 상자가 이만큼만 기다리고 출발 (waitS 는 다른 밴이 나가 있을 때)
            lastTourH: 1.5, lastStops: 2,                             // 문 닫기 1.5시간 전부터는 짧은 배달만 (두 곳까지): 밤늦게까지 일하지 않아요
            avoidWalkM: 8 },                                          // 화물 썰매 길 위의 정차 자리는 이만큼 더 걷는 셈 (G-P2c 가 들어오면 안 써요)
  sled:   { cap: 4, speed: 2.6, waitS: 180, doorMaxM: 6 },            // 개썰매 (옛 동네)
  door:   { maxDoorstep: 16, snowCapH: 4, pickupPx: 200, unboxChance: 0.3, quietFrom: 21, quietTo: 8, photos: 3,
            pickupHour: 7, keepS: 600 },                              // 문 앞 상자: 눈 덮이는 시간(게임 시), 아침 7시에 가져가요
  up:     { pack2: 1200, van2: 2500, van3: 4000, sled2: 1500, lockerPlaza: [1800, 6], lockerApt: [1500, 6],
            dawn: 5000, backhaul: 800, packQueue: 6, packS: 60, vanWait: 10, vanS: 90, sledWait: 6, sledS: 90,
            dawnNights: 3, dawnWaiting: 8, backhaulDock: 60, backhaulS: 120, lockerDays: 2,
            collectS: 120 },                                          // 개썰매 2: 가득 찬 더미가 썰매를 이만큼 기다리면 (모든 썰매가 바쁠 때)
  locker: { cap: 12, fillEachS: 1.2, pickS: 50 },                     // 보관함 칸 수 · 한 상자 넣는 시간 · 주민이 찾아가기까지 (초, 아침 7시에는 모두)
  // 금방 몫: 물류창고 선반에 들어온 물건 가운데 금방이 먼저 챙겨 두는 양 (물건마다 per × 가중치(최대 1), 모두 합쳐 max).
  // 낮에는 솔방울 상인이 선반을 금방 비워서, 이게 없으면 금방은 밤에만 주문을 받아요
  share:  { per: 4, max: 24 },
  // 금방 집하: 쉬는 개썰매가 가득 찬 마을 더미(생선·고기·장작·밀·광석)에서 짐을 실어 역앞 짐 싣는 곳에 내려요 (화물 썰매와
  // 기차가 실어 가요). pileAt 이만큼 찬 더미만 · keep 더미에 남기는 비율 · cap 한 번에 싣는 양 · minLoad 이보다 적으면 안 가요 ·
  // reachM 썰매 길에서 더미까지 · dockMax 짐 싣는 곳에 이만큼 쌓여 있으면 쉬어요 · loadEachS / dropEachS 한 상자 싣고 내리는 시간 ·
  // everyS 확인 간격 · piles 한 번에 들르는 더미 수
  collect:{ on: true, pileAt: 0.85, keep: 0.4, cap: 24, minLoad: 6, reachM: 10, dockMax: 60, loadEachS: 0.35, dropEachS: 0.25, everyS: 4, piles: 2 },
  toast:  { minGapS: 30 },
  deal:   { durS: 600 },                                              // 오늘의 특가 버튼: 하루(600초) 동안 주문 2배
  // 기사님 문 앞 장면 (초): 차 세우기 · 뒷문 · 걷기 속도(m/초) · 띵동 · 문 열림 · 건네기 · 기쁨 · 차에 타기
  courier:{ parkS: 0.8, takeS: 0.8, carryMps: 1.3, walkMps: 1.6, nightMps: 1.0, ringS: 1.2, doorOpenS: 0.8, handS: 0.8,
            joyS: 1.6, dropS: 0.8, photoS: 0.5, insideS: 2.5, getInS: 0.6, perTrip: 3, aptMeet: 0.35 },
  review: { chance: 0.25, max: 12 },
  // 집마다 입맛 (할머니네 · 아이 있는 집 · 신혼집 · 광부네 · 가게 집 · 어부네): 물건 가중치에 곱해요 (없는 물건은 1)
  taste: {
    grandma:  { item_bread: 1.6, item_fish_cooked: 1.4, item_log: 1.5, item_can: 0.7, item_meat_raw: 0.6, item_plank: 0.4 },
    kids:     { item_bread: 1.5, item_can: 1.3, item_meat_cooked: 1.3, item_fish_cooked: 1.1, item_plank: 0.6 },
    newlywed: { item_meat_raw: 1.4, item_fish_raw: 1.3, item_wheat: 1.3, item_can: 1.0, item_plank: 1.2 },
    miner:    { item_meat_cooked: 1.7, item_can: 1.5, item_bread: 1.2, item_log: 1.2, item_pickaxe: 2 },
    shop:     { item_plank: 1.6, item_wheat: 1.4, item_log: 1.2, item_can: 1.1, item_axe: 1.5 },
    fisher:   { item_bread: 1.4, item_log: 1.3, item_wheat: 1.2, item_meat_raw: 1.2, item_rod: 2 },
  },
  tasteMix: { grandma: 1, kids: 1, newlywed: 1, miner: 0.6, shop: 0.6, fisher: 0.6 },   // 이유 없는 집은 이 비율로 정해요
  aptHousehold: [1, 3],                                                                    // 아파트 한 집에 사는 사람 수 (최소, 최대)
  happy:  { promiseS: 150 },
};

const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
function merge(base, over) {
  if (!isObj(over)) return base;
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  for (const k in over) {
    const b = base ? base[k] : undefined, v = over[k];
    if (isObj(b) && isObj(v)) out[k] = merge(b, v);
    else if (v !== undefined && v !== null && (typeof v === typeof b || b === undefined)) out[k] = v;
  }
  return out;
}

/** the tuning: BALANCE.v43.gb (when the balance block exists) over the defaults */
export function gbTuning(balance) {
  const over = balance && balance.v43 && balance.v43.gb;
  return over ? merge(GB_TUNING, over) : GB_TUNING;
}

/** the ≤ 24 h hour multiplier of the order rate (hours past midnight wrap: 22–26 = 22:00–02:00) */
export function hourMult(tune, hour) {
  const O = tune.orders;
  for (const [a, b, m] of O.hourMult) {
    if (hour >= a && hour < b) return m;
    if (hour + 24 >= a && hour + 24 < b) return m;
  }
  return O.otherMult;
}
