// =====================================================================
//  서리마을 개척기 — 밸런스 설정 파일 (balance.js)
// ---------------------------------------------------------------------
//  게임의 모든 숫자가 이 파일 한 곳에 모여 있습니다.
//  코딩을 몰라도 숫자만 바꾸고 저장 → 브라우저 새로고침 하면 바로 반영됩니다.
//  (주의: 쉼표 , 와 괄호 { } [ ] 는 지우지 마세요!)
//  (값을 잘못 적으면 — 0, 음수, 글자 등 — 게임이 안전한 값으로 바꿔서 실행하고,
//   브라우저 콘솔(F12)에 "[balance.js] ..." 경고를 남깁니다. 비용·가격은 1 이상의 정수로 적어 주세요.)
//  시간 단위는 '초', 거리 단위는 '픽셀(px)' 입니다. (1m ≈ 64px)
// =====================================================================

export const BALANCE = {
  // ── 시작 상태 ───────────────────────────────────────────────
  start: {
    coins: 0,                 // 처음 가진 코인
    firstCustomers: 3,        // 시작할 때 이미 줄 서 있는 손님 수
  },

  // ── 카메라 ─────────────────────────────────────────────────
  camera: {
    zoom: 1.2,                // 화면 확대 배율 (클수록 캐릭터가 크게 보임, 1.0 ~ 1.4 추천)
    lerp: 0.12,               // 카메라가 플레이어를 따라가는 부드러움 (0~1, 작을수록 느긋하게 따라감)
    revealPanMs: 750,         // 새 구역이 열릴 때 카메라가 이동하는 시간(밀리초)
    revealHoldMs: 900,        // 새 구역을 보여주는 시간(밀리초)
    // (v2) 확대·축소 — 두 손가락 핀치, 마우스 휠, 화면의 +/- 버튼, '전체 보기' 버튼
    zoomMin: 0.6,             // 가장 멀리 (작게) 볼 때 배율
    zoomMax: 1.7,             // 가장 가까이 (크게) 볼 때 배율
    zoomStep: 1.25,           // +/- 버튼 한 번에 커지는/작아지는 배율
    zoomSmooth: 0.18,         // 확대·축소가 따라가는 부드러움 (0~1, 작을수록 천천히)
  },

  // ── 플레이어 (촌장) ──────────────────────────────────────────
  player: {
    speed: 255,               // 기본 이동 속도 (px/초)
    verticalFactor: 0.74,     // 위/아래로 움직일 때 속도 비율 (원근감, 1이면 좌우와 같음)
    gatherRange: 78,          // 이 거리 안에 자원이 있으면 멈춰 섰을 때 자동으로 채집
    stillDelay: 0.08,         // 멈춘 뒤 채집을 시작하기까지 걸리는 시간(초)
    padDelay: 0.5,            // 잠금/고용/업그레이드 발판 위에 서서 코인이 빠져나가기 시작하기까지 시간(초)
                              //   (지나가다 밟았을 때 코인이 새지 않도록 0.4 ~ 0.6 추천)
    trashDelay: 0.6,          // '버리기' 발판 위에 이만큼 서 있어야 들고 있는 물건을 버리기 시작(초)
    padItemInterval: 0.075,   // 가공소/판매대 발판에서 아이템이 하나씩 날아가는 간격(초)
    carryScale: 0.62,         // 손에 든 아이템 탑의 크기 배율
    carryOnHead: true,        // true: 아이템 탑을 머리 위에 이고 다님 (얼굴이 가려지지 않음) / false: 가슴 앞에 듦
  },

  // ── 업그레이드 (작업대) ───────────────────────────────────────
  //  values = 단계별 값, costs = 다음 단계로 올리는 비용 (costs 개수 = values 개수 - 1)
  upgrades: {
    capacity: {               // 가방: 한 번에 들 수 있는 아이템 개수
      values: [6, 10, 14, 18, 22, 26],
      costs: [40, 90, 170, 300, 480],
    },
    speed: {                  // 신발: 이동 속도 배율
      values: [1.0, 1.15, 1.3, 1.45, 1.6],
      costs: [50, 120, 240, 400],
    },
  },

  // ── 판매 가격 (아이템 1개당 코인) ──────────────────────────────
  prices: {
    item_fish_cooked: 4,      // 구운 생선 (식당)
    item_bread: 7,            // 빵 (식당)
    item_meat_cooked: 12,     // 훈제 고기 (식당)
    item_plank: 5,            // 판자 (교역소)
    item_ingot: 10,           // 주괴 (교역소)
  },

  // ── 해금 / 고용 비용 (기획서 §4) ────────────────────────────────
  //  (시뮬레이션 기준: 처음 하는 사람 약 20~30분에 마을 완성)
  costs: {
    hire_fisherman: 30,       // 1. 어부 고용
    zone_forest: 100,         // 2. 벌목장 (숲 + 제재소 + 교역소)
    hire_lumberjack: 150,     // 3. 나무꾼 고용
    // 4. 가방 업그레이드 → 위 upgrades 의 단계별 비용
    zone_farm: 350,           // 5. 농장 (밀밭 + 빵 오븐)
    hire_farmer: 450,         // 6. 농부 고용
    zone_mine: 750,           // 7. 광산 (광석 바위 + 제련소)
    hire_miner: 850,          // 8. 광부 고용
    zone_hunt: 1250,          // 9. 사냥터 (사슴·멧돼지 + 훈제장)
    hire_hunter: 1500,        // 10. 사냥꾼 고용 → 마을 완성
    // (v2) 점원: 첫 판매(교역) 뒤 바로 나타남. 점원이 계산대를 맡으면 촌장이 서 있지 않아도 돈을 받음
    hire_clerk_market: 25,    // 판매대 점원
    hire_clerk_trade: 60,     // 교역소 점원
    // (v2) 짐꾼: 그 줄의 일꾼을 고용하면 나타남. 가공소 완성품을 길을 따라 판매대·교역소로 날라 줌
    porter_grill: 150,        // 구운 생선 짐꾼
    porter_sawmill: 300,      // 판자 짐꾼
    porter_bakery: 500,       // 빵 짐꾼
    porter_smelter: 800,      // 주괴 짐꾼
    porter_smokehouse: 1000,  // 훈제 고기 짐꾼
  },
  payDuration: 1.6,           // 발판에 코인을 다 내는 데 걸리는 대략적인 시간(초) — 비싸도 이 시간 안에 끝남

  // ── 가공소 (재료 1개 → 완성품 1개) ──────────────────────────────
  //  time = 1개 가공 시간(초), inputMax = 입구에 쌓을 수 있는 최대 개수, outputMax = 출구 최대 개수
  stations: {
    grill:      { time: 1.0, inputMax: 30, outputMax: 36 },   // 생선 그릴: 생선 → 구운 생선
    sawmill:    { time: 1.0, inputMax: 30, outputMax: 36 },   // 제재소: 통나무 → 판자
    bakery:     { time: 1.1, inputMax: 30, outputMax: 36 },   // 빵 오븐: 밀 → 빵
    smelter:    { time: 1.2, inputMax: 30, outputMax: 36 },   // 제련소: 광석 → 주괴
    smokehouse: { time: 1.2, inputMax: 30, outputMax: 36 },   // 훈제장: 생고기 → 훈제 고기
  },

  // ── 자원 ─────────────────────────────────────────────────
  resources: {
    tree:  { hp: 3, regrow: 7 },          // 나무: 통나무 3개 → 그루터기 → 7초 뒤 다시 자람
    rock:  { hp: 4, regrow: 9 },          // 광석 바위: 광석 4개 → 잔해 → 9초 뒤 다시 생김
    wheat: { growTime: 8, yield: 2 },     // 밀: 8초에 걸쳐 자라고, 다 자라면 밀 2개
    net:   { max: 6, refill: 1.1 },       // 그물: 물고기 최대 6마리, 1.1초마다 1마리 들어옴
    animal: {
      deer: 3, boar: 2,                   // 사냥터에 있는 사슴 / 멧돼지 수
      hp: 2,                              // 맞혀야 하는 횟수
      meat: 2,                            // 잡으면 나오는 생고기 개수
      respawn: 6,                         // 다시 나타나기까지 시간(초)
      speed: 55,                          // 돌아다니는 속도
      fleeSpeed: 115,                     // 플레이어를 피해 도망가는 속도
      fleeRange: 120,                     // 이 거리 안으로 오면 도망감
    },
  },

  // ── 일꾼 ─────────────────────────────────────────────────
  workers: {
    speed: 150,               // 이동 속도
    capacity: 5,              // 한 번에 나르는 개수
    porterCapacity: 8,        // 배달꾼이 한 번에 나르는 완성품 개수
    // 작업 동작을 몇 번 반복해야 자원 1개를 얻는지 (클수록 느림)
    cyclesPerItem: { fisherman: 2, lumberjack: 1, farmer: 1, miner: 1, hunter: 1 },
    hunterRange: 230,         // 사냥꾼이 활을 쏘는 거리
  },

  // ── 손님 (식당 판매대) ─────────────────────────────────────────
  customers: {
    spawnEvery: 2.0,          // 새 손님이 오는 간격(초)
    maxQueue: 10,             // 줄 설 수 있는 최대 손님 수 (판매대로 걸어오는 손님 포함)
    wantMin: 1,               // 원하는 개수 최소
    wantMax: 3,               // 원하는 개수 최대 (처음)
    wantMaxLate: 5,           // 원하는 개수 최대 (마을이 커진 뒤)
    takeInterval: 0.2,        // 판매대에서 하나씩 가져가는 간격(초)
    speed: 120,               // 걷는 속도
    shelfMax: 40,             // 판매대에 음식 종류별로 올려 둘 수 있는 최대 개수
  },

  // ── 계산대 (v2) ──────────────────────────────────────────
  register: {
    chiefPayTime: 0.35,       // 촌장이 계산대에 서 있을 때 손님 한 명이 돈을 내는 시간(초)
    clerkPayTime: 0.55,       // 점원이 계산할 때 손님 한 명이 돈을 내는 시간(초)
    clerkTradeSlow: 1.25,     // 교역소 점원이 상인에게 물건을 파는 속도 (1 = 촌장과 같음, 클수록 느림)
  },

  // ── 마을 주민 (v2, docs/주민기획.md) ──────────────────────────
  //  이사 오는 순서는 world.js 의 life.moveIns 에 있습니다.
  population: {
    maxActive: 24,            // 한꺼번에 돌아다니는 주민 최대 수 (휴대폰이 느려지지 않게)
    moveInDelay: 2.5,         // 해금하고 나서 새 주민이 이사 오기까지(초)
    moveInGap: 2.0,           // 여러 명이 이사 올 때 사이 간격(초)
  },
  life: {
    walkSpeed: 70,            // 주민 걷는 속도 (px/초)
    runSpeed: 150,            // 뛰는 속도 (술래잡기, 눈싸움)
    stayMin: 14,              // 한 곳에 머무는 시간 (초, 최소)
    stayMax: 40,              //                    (초, 최대)
    chatEvery: 5,             // 주민끼리 수다를 시작해 보는 간격(초)
    snowballEvery: 16,        // 눈싸움이 일어나는 간격(초)
    tagEvery: 45,             // 아이들 술래잡기 간격(초)
    tagLength: 16,            // 술래잡기 시간(초)
    concertEvery: 80,         // 음유시인 공연 간격(초)
    concertLength: 24,        // 공연 시간(초)
    snowmanStageTime: 9,      // 아이들이 눈사람 한 단계를 만드는 데 걸리는 시간(초)
    snowmanKeep: 150,         // 다 만든 눈사람이 서 있는 시간(초) — 지나면 장난꾸러기가 무너뜨리고 다시 만듦
    waveRange: 170,           // 촌장이 이 거리 안을 지나가면 손을 흔듦 (px)
    waveCooldown: 25,         // 같은 주민이 다시 손 흔들기까지(초)
    shiverChance: 0.08,       // 가만히 있을 때 오들오들 떠는 확률
    bubbleTime: 2.6,          // 말풍선이 떠 있는 시간(초)
    partyLength: 22,          // 마을 완성 잔치 시간(초)
  },

  // ── 교역소 (상인) ──────────────────────────────────────────
  trade: {
    buyInterval: 0.28,        // 상인이 물건 1개를 사 가는 간격(초)
    shelfMax: 40,             // 교역소에 종류별로 올려 둘 수 있는 최대 개수
  },

  // ── 코인 ─────────────────────────────────────────────────
  cash: {
    pileVisualMax: 48,        // 계산대 위에 보이는 동전 최대 개수 (더 많아도 값은 그대로 쌓임)
    collectInterval: 0.03,    // 동전을 줍는 애니메이션 간격(초)
  },

  // ── 저장 ─────────────────────────────────────────────────
  autosaveEvery: 5,           // 자동 저장 간격(초)

  // =====================================================================
  //  (v3) 생산 사슬과 땅 넓히기
  // =====================================================================
  // ── 망루: 코인을 내면 공사가 시작되고, 자재(판자·주괴)가 모두 오면 지어져 불이 켜지며 눈안개가 걷힘
  //    coins = 발판에서 내는 코인, item_plank / item_ingot = 공사장에 날라야 하는 자재 개수, time = 짓는 시간(초)
  towers: {
    tower_east:  { coins: 300,  item_plank: 10, item_ingot: 0, time: 7 },    // 1. 동쪽 해안
    tower_south: { coins: 1100, item_plank: 16, item_ingot: 4, time: 9 },    // 2. 남쪽 들판
    tower_se:    { coins: 2600, item_plank: 22, item_ingot: 8, time: 10 },   // 3. 동남쪽 언덕
  },
  // ── 건물: 빈 부지에 서서 고르면 코인을 내고, 자재가 오면 비계 → 완성
  //    people = 집에 살 수 있는 주민 수
  buildings: {
    toolsmith: { coins: 400,  item_plank: 8,  item_ingot: 4, time: 9 },     // 대장간 (도구 만들기)
    warehouse: { coins: 600,  item_plank: 14, item_ingot: 4, time: 10 },    // 창고 (넘치는 물건 보관)
    boathouse: { coins: 700,  item_plank: 12, item_ingot: 2, time: 10 },    // 보트 창고 (배 사기)
    cannery:   { coins: 1000, item_plank: 12, item_ingot: 6, time: 10 },    // 통조림 공장
    store:     { coins: 1300, item_plank: 16, item_ingot: 6, time: 10 },    // 잡화점
    house_c:   { coins: 80,   item_plank: 6,  item_ingot: 0, time: 6, people: 2 },   // 뾰족집 (2명)
    house_a:   { coins: 160,  item_plank: 10, item_ingot: 0, time: 7, people: 3 },   // 통나무집 (3명)
    house_b:   { coins: 320,  item_plank: 10, item_ingot: 3, time: 8, people: 4 },   // 돌집 (4명)
  },
  // ── 인구: 처음부터 살 수 있는 주민 수 (이보다 많으면 집을 지어야 이사 옴; 강아지·고양이·펭귄은 세지 않음)
  population3: {
    baseCap: 19,
  },
  // ── 도구가 있어야 고용되는 두 번째 일꾼 (코인 + 도구 1개를 발판에 가져와야 함)
  hire2: {
    hire2_lumberjack: 600,    // 나무꾼 2 (도끼)
    hire2_miner: 900,         // 광부 2 (곡괭이)
    hire2_farmer: 800,        // 농부 2 (낫)
    hire2_fisherman: 500,     // 어부 2 (낚싯대)
    hire2_hunter: 1200,       // 사냥꾼 2 (활)
  },
  // ── 새 가게·가공소 직원
  costs3: {
    porter_toolsmith: 700,    // 도구 짐꾼 (도구를 발판·잡화점으로)
    porter_cannery: 900,      // 통조림 짐꾼 (통조림을 잡화점으로)
    porter_dock: 600,         // 생선 짐꾼 (배가 잡아 온 생선을 통조림 공장·그릴로)
    hire_clerk_store: 400,    // 잡화점 점원
  },
  // ── 새 가공소: time = 한 번 만드는 시간(초), inputMax = 재료 종류별 최대, outputMax = 완성품 최대
  stations3: {
    toolsmith: { time: 3.0, inputMax: 8, outputMax: 12 },   // 판자 1 + 주괴 1 → 도구 1
    cannery:   { time: 2.6, inputMax: 18, outputMax: 30 },  // 생선 3 (참치는 1마리 = 생선 3) + 주괴 1 → 통조림 3
  },
  // ── 새 물건 가격 (잡화점, 1개당 코인)
  prices3: {
    item_can: 12,             // 통조림
    item_axe: 40, item_pickaxe: 40, item_rod: 40, item_sickle: 40, item_bow: 40,   // 도구
  },
  // ── 광산 식량 상자
  food: {
    boxMax: 20,               // 식량 상자에 들어가는 최대 개수 (빵 + 훈제 고기)
    orePerFood: 5,            // 광부가 광석을 이만큼 캘 때마다 식량 1개를 먹음
    startGift: 6,             // 식량 상자가 처음 생길 때 들어 있는 빵
  },
  // ── 창고
  warehouse: {
    capacity: 300,            // 창고에 넣을 수 있는 물건 개수 (모든 종류 합)
    porters: 2,               // 창고에 딸린 짐꾼 수
    overflowAt: 0.6,          // 가공소 출구가 이만큼(0~1) 차면 창고 짐꾼이 창고로 옮김
    restockBelow: 0.25,       // 판매대가 이만큼(0~1)보다 비면 창고에서 꺼내 채움
  },
  // ── 배: 보트 창고에서 사고, 어부가 바다에 나가 고기를 잡아 옴
  boats: {
    rowboat: { coins: 700, speed: 70, fishTime: 12, fish: 6, big: 0 },                       // 나룻배
    fishing: { coins: 1800, speed: 100, fishTime: 8, fish: 4, big: 4, tool: 'item_rod' },    // 어선 (코인 + 낚싯대)
    dockTime: 2.5,            // 부두에서 짐을 내리고 다시 나가기까지(초)
  },
  // ── 건설
  build: {
    builders: 2,              // 공사장에 오는 목수 수
    porterCapacity: 10,       // 창고 짐꾼이 한 번에 나르는 개수
  },
};
