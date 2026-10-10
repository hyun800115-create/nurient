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

  // ── 해금 / 고용 비용 (기획서 §4, v3.5 분업: docs/기획서_v3_분업.md) ──────────────
  //  한 생산 라인의 고용 순서: 가공 기술자 → 채집 일꾼 → 재료 짐꾼 → 상품 짐꾼 (뒤로 갈수록 조금씩 비쌈)
  //  (생선 라인은 맨 앞에 점원). 기술자가 없으면 촌장이 가공소 작업 자리에 서 있어야 가공돼요.
  costs: {
    // 생선 라인 (튜토리얼)
    hire_clerk_market: 12,    // 1. 판매대 점원 (첫 판매 뒤) — 계산을 대신 해 줌
    op_grill: 30,             // 2. 요리사 쿡 — 생선 굽기를 대신 해 줌
    hire_fisherman: 45,       // 3. 어부 — 물고기를 잡아 그물 옆 생선 통에 쌓음
    raw_grill: 70,            //    생선 짐꾼 — 생선 통 → 화덕
    porter_grill: 100,        //    판매 짐꾼 — 화덕 → 판매대
    // 나무 라인
    zone_forest: 90,          // 4. 벌목장 (숲 + 제재소 + 교역소)
    hire_clerk_trade: 50,     //    교역소 점원 (첫 교역 뒤)
    op_sawmill: 110,          // 5. 제재공 산들
    hire_lumberjack: 150,     // 6. 나무꾼
    raw_sawmill: 170,         //    통나무 짐꾼 — 통나무 더미 → 제재소
    porter_sawmill: 220,      //    판자 짐꾼 — 제재소 → 교역소
    // 밀 라인 (가방 업그레이드는 나무꾼 고용 뒤 작업대에서 → 위 upgrades)
    zone_farm: 300,           // 7. 농장 (밀밭 + 빵 오븐)
    op_bakery: 260,           // 8. 빵집 아주머니
    hire_farmer: 380,         // 9. 농부
    raw_bakery: 340,          //    밀 짐꾼
    porter_bakery: 420,       //    빵 짐꾼
    // 광석 라인
    zone_mine: 600,           // 10. 광산 (광석 바위 + 제련소)
    op_smelter: 480,          // 11. 대장장이 언니
    hire_miner: 700,          // 12. 광부
    raw_smelter: 560,         //     광석 짐꾼
    porter_smelter: 640,      //     주괴 짐꾼
    // 사냥 라인
    zone_hunt: 950,           // 13. 사냥터 (사슴·멧돼지 + 훈제장)
    op_smokehouse: 760,       // 14. 훈제사 연기
    hire_hunter: 1150,        // 15. 사냥꾼 → 마을 완성
    raw_smokehouse: 650,      //     고기 짐꾼 (v3.5 리뷰: 820 → 650, 마을 완성 뒤 기다림 줄이기)
    porter_smokehouse: 750,   //     훈제 고기 짐꾼 (900 → 750)
  },
  payDuration: 1.6,           // 발판에 코인을 다 내는 데 걸리는 대략적인 시간(초) — 비싸도 이 시간 안에 끝남

  // ── 가공소 (재료 1개 → 완성품 1개) ──────────────────────────────
  //  time = 1개 가공 시간(초), inputMax = 입구에 쌓을 수 있는 최대 개수, outputMax = 출구 최대 개수
  stations: {
    grill:      { time: 0.8, inputMax: 30, outputMax: 36 },   // 생선 그릴(화덕): 생선 → 구운 생선
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
    porterCapacity: 14,       // 배달꾼(상품 짐꾼)이 한 번에 나르는 완성품 개수 (v3.5 리뷰: 8 → 14, 늘어난 일꾼이 만든 것도 팔리도록)
    // 작업 동작을 몇 번 반복해야 자원 1개를 얻는지 (클수록 느림)
    cyclesPerItem: { fisherman: 2, lumberjack: 1, farmer: 1, miner: 1, hunter: 1 },
    hunterRange: 230,         // 사냥꾼이 활을 쏘는 거리
  },

  // ── 손님 (식당 판매대) ─────────────────────────────────────────
  customers: {
    spawnEvery: 2.0,          // 새 손님이 오는 간격(초)
    spawnEveryLate: 1.3,      // (v3.5) 마을 완성 뒤 새 손님이 오는 간격(초) — 두 번째·세 번째 일꾼이 만든 음식도 팔려요
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
    tower_se:    { coins: 1700, item_plank: 24, item_ingot: 10, time: 10 },  // 3. 동남쪽 언덕 (v3.5 리뷰: 2200 → 1700)
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
    // ---- (v4-C) 마을 건물 (서쪽 숲마을의 아주 큰 부지) — 하는 일은 아래 civic 칸에 있어요
    town_hall:      { coins: 2400, item_plank: 30, item_ingot: 10, time: 14 },   // 마을회관 (시청)
    big_restaurant: { coins: 1500, item_plank: 24, item_ingot: 6, time: 12 },    // 큰 식당
    // ---- (v4-C) 꾸미기: happy = 마을 행복도가 이만큼 올라요 (같은 것을 또 지으면 절반씩만)
    deco_snowman:    { coins: 120, item_plank: 0,  item_ingot: 0, time: 3, happy: 2 },   // 눈사람 동상 (작은 부지)
    deco_bench:      { coins: 90,  item_plank: 4,  item_ingot: 0, time: 3, happy: 1 },   // 쉼터 의자 + 가로등 (작은 부지, 주민이 앉아요)
    deco_lamp:       { coins: 80,  item_plank: 0,  item_ingot: 1, time: 3, happy: 1 },   // 가로등 한 쌍 (작은 부지, 밤에 불이 켜져요)
    deco_flowers:    { coins: 160, item_plank: 3,  item_ingot: 0, time: 4, happy: 2 },   // 꽃밭 (작은 부지)
    deco_rink:       { coins: 400, item_plank: 0,  item_ingot: 0, time: 5, happy: 3 },   // 스케이트장 (건설 부지)
    deco_playground: { coins: 550, item_plank: 12, item_ingot: 0, time: 6, happy: 4 },   // 놀이터 (건설 부지, 아이들이 놀아요)
    deco_fountain:   { coins: 750, item_plank: 0,  item_ingot: 4, time: 6, happy: 5 },   // 분수 공원 (건설 부지, 주민이 둘레에 앉아요)
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
  // ── (v3.5) 세 번째 일꾼 (코인 + 도구 1개) — 두 번째 일꾼과 또 다른 모습의 사람이 와요
  hire3: {
    //    (v3.5 리뷰: 모아두는 곳이 이미 넘쳐서 세 번째 일꾼이 버는 돈이 적어요 → 값을 낮춤)
    hire3_fisherman: 450,     // 어부 3 (낚싯대)
    hire3_lumberjack: 500,    // 나무꾼 3 (도끼)
    hire3_farmer: 600,        // 농부 3 (낫)
    hire3_hunter: 700,        // 사냥꾼 3 (활)
  },
  // ── 새 가게·가공소 직원
  costs3: {
    op_toolsmith: 220,        // 도구 장인 (광부 영감) — 대장간에서 도구를 대신 두드림
    op_cannery: 600,          // 통조림 기술자 통통
    porter_toolsmith: 600,    // 도구 짐꾼 (도구를 발판·잡화점으로)
    porter_cannery: 800,      // 통조림 짐꾼 (통조림을 잡화점으로)
    porter_dock: 600,         // 생선 짐꾼 (배가 잡아 온 생선을 통조림 공장·화덕으로)
    hire_clerk_store: 400,    // 잡화점 점원
  },
  // ── (v3.5) 분업
  labour: {
    chiefSpeed: 1.25,         // 촌장이 직접 가공할 때 속도 배율 (1 = 기술자와 같음, 클수록 빨리 구움)
    pileMax: 40,              // 모아두는 곳(생선 통·통나무 더미·밀 더미·광석 더미·고기 걸이)에 쌓이는 최대 개수
    rawCapacity: 8,           // 재료 짐꾼이 한 번에 나르는 개수
  },
  // ── (v3.5) 강아지 콩이와 놀기 (기획서_v4 §5)
  dog: {
    callRange: 140,           // 콩이가 촌장 곁 이만큼(px) 안에 오면 놀기 메뉴가 떠요
    stayTime: 12,             // 아무것도 안 하면 이만큼(초) 뒤 다시 놀러 가요
    treatCooldown: 25,        // 간식 주기 다시 쓰기까지(초)
    playCooldown: 10,         // 공 던지기 다시 쓰기까지(초)
    petCooldown: 15,          // 쓰다듬기 다시 쓰기까지(초)
    //  (v3.5 리뷰: 하트 5개가 1분도 안 돼 다 차서 친밀도를 천천히 오르게 바꿨어요)
    treatLove: 8,             // 간식 하나에 오르는 친밀도 (0~100)
    playLove: 3,              // 공 놀이 한 번에 오르는 친밀도
    petLove: 3,               // 쓰다듬기 한 번에 오르는 친밀도
    trickAt: 50,              // 친밀도가 이만큼 넘으면 가끔 혼자 재주를 부려요
    giftAt: 75,               // 친밀도가 이만큼 넘으면 가끔 선물(코인)을 물어 와요
    giftEvery: 150,           // 선물을 물어 오는 간격(초, 대략)
    giftCoins: 6,             // 선물 코인 (이 값 ±절반)
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
    fishing: { coins: 1200, speed: 100, fishTime: 8, fish: 4, big: 4, tool: 'item_rod' },    // 어선 (코인 + 낚싯대) (v3.5 리뷰: 1500 → 1200)
    dockTime: 2.5,            // 부두에서 짐을 내리고 다시 나가기까지(초)
  },
  // ── 건설
  build: {
    builders: 2,              // 공사장에 오는 목수 수
    porterCapacity: 10,       // 창고 짐꾼이 한 번에 나르는 개수
  },

  // =====================================================================
  //  (v4) 이웃 마을 솔방울 마을과 눈썰매 기차 (docs/v4_plan.md)
  // =====================================================================
  v4: {
    // ---- (v4-A) 세상·기차·주민·밤낮
    // ── 서리역 고치기 (눈에 덮인 옛 역): 코인 + 자재, time = 고치는 시간(초)
    station: { coins: 500, item_plank: 14, item_ingot: 4, time: 12 },
    // ── 눈썰매 기차: speed = 최고 속도(m/초), accel / brake = 출발·멈출 때 빨라지고 느려지는 정도(m/초²)
    //    dwellOurs / dwellTown = 서리역 / 솔방울역에 서 있는 시간(초), seats = 손님 자리, coachSeats = 객차를 하나 더 달면 늘어나는 자리
    //    firstRide = 첫 기차 손님 수, firstDelay = 역을 고친 뒤 첫 기차가 오기까지(초)
    //    whistleBefore = 도착 몇 초 전에 기적을 울릴지, blockAhead = 앞에 누가 있으면 이만큼(m) 앞에서 멈춤
    train: { speed: 2.6, accel: 0.6, brake: 0.8, dwellOurs: 14, dwellTown: 10, seats: 12, coachSeats: 8,
             firstRide: 6, firstDelay: 3, whistleBefore: 2.5, blockAhead: 1.5 },
    // ── 기차로 오는 손님: 기차 한 대 손님 = base + 가게 수 × perShop + (등급-1) × perRank (자리 수까지)
    //    dawn / day / dusk / night = 새벽·낮·저녁·밤 배율, wantMin~wantMax = 사고 싶은 개수
    //    patience = 줄이 꽉 차 있으면 이만큼(초) 기다리다 그냥 감, regularAt = 이만큼 오면 단골(★)
    //    storeChance = 잡화점에 들를 확률, shopChance = 새로 연 가게에 들를 확률, speed = 걷는 속도(px/초)
    //    maxInVillage = 우리 마을에 한꺼번에 와 있는 이웃 최대 수 (이보다 많으면 다음 기차는 덜 태워 와요; 폰이 버벅이지 않게)
    visitors: { base: 4, perShop: 1, perRank: 3, dawn: 0.5, day: 1.0, dusk: 1.3, night: 0.1,
                wantMin: 2, wantMax: 4, patience: 60, shopChance: 0.45, storeChance: 0.25, regularAt: 3, speed: 105, maxInVillage: 24 },
    // ── 솔방울 마을: people = 주민 수, peopleRank2 = 읍이 되면, seed = 주민을 만드는 씨앗(바꾸면 다른 사람들)
    //    walk = 걷는 속도(px/초), tripChance = 하루에 우리 마을로 나들이 갈 확률,
    //    inviteAfter = 첫 가게가 안 열려도 첫 기차 뒤 이만큼(초) 지나면 촌장님이 초대하러 와요
    town: { people: 100, peopleRank2: 120, seed: 2611, walk: 70, tripChance: 0.35, inviteAfter: 480 },
    // ── 낮과 밤: length = 하루 길이(초, 600 = 10분 = 한 시간 25초), startHour = 첫 기차가 오는 시각
    //    darkness = 밤 어둡기(0~0.6, 0.45 = 화면이 70% 밝기까지만 어두워져요), fade = 바뀌는 데 걸리는 시간(초)
    //    dawn / dayStart / dusk / night = 새벽·낮·저녁·밤이 시작하는 시각, lightsOn / lightsOff = 가로등 켜고 끄는 시각
    day: { on: true, length: 600, startHour: 8, darkness: 0.45, fade: 8,
           dawn: 6, dayStart: 8, dusk: 17, night: 20, lightsOn: 19, lightsOff: 6.5 },
    // ── 성능: maxRigs = 자세히 그리는 주민 수 (가벼운 폰은 maxRigsLow), maxLite = 간단히 그리는 주민 수
    //    margin / near = 화면 밖 이만큼(px)까지 그리기 / 걷게 하기, maxGlows = 한 화면의 불빛 수
    perf: { maxRigs: 32, maxRigsLow: 16, maxLite: 40, margin: 120, near: 600, maxGlows: 40 },
    // ── 주민의 하루 (시각, 각자 ±0.4시간씩 달라요)
    //    school.leave = 아이들이 집을 나서는 시각 (학교까지 걸어서 15초쯤 걸려요)
    //    adult: out~home 사이에 가게 심부름(errandMin~errandMax 분)·공원 산책·카페·잠깐 집(homeStay 시간까지)을 섞어서 해요
    townLife: {
      jitter: 0.4,
      school: { leave: 7.2, bell: 8, recess: 10.5, recessEnd: 10.83, lunch: 12, lunchEnd: 12.67, out: 15, home: 17.5 },
      teen: { cafe: 15.5, home: 17.5 },
      shop: { open: 7.67, lunch: 12, lunchEnd: 12.67, close: 18.5 },
      civic: { start: 7.75, teacherEnd: 16, end: 18 },
      adult: { out: 8, home: 19, walkChance: 0.3, walkEnd: 20, errandMin: 6, errandMax: 15, homeStay: 0.8, tripFrom: 13, tripTo: 18 },
      elder: { out: 9, cafe: 11, clinicChance: 0.2, home: 18, tripMorning: [9, 12], tripAfternoon: [14, 17] },
      night: { dozers: 3, patrol: 1 },
    },

    // ---- (v4-B) 주문·가게·등급·집·텍스처
    // ── 도매: 짐 싣는 곳 / 새 가게 선반 / 목수 집터에 물건을 보내면 '판매 가격 × rate' 코인이 역 금고에 쌓여요
    wholesale: { rate: 0.7 },
    // ── 주문판: cards = 한 번에 걸리는 주문 카드 수, swapAfter = 진행이 없으면 이만큼(초) 뒤 '다른 주문' 버튼
    //    bonus = 가게를 여는 주문을 다 채우면 (필요한 물건 값 합계 × bonus) 코인을 더 줘요
    //    standingBonus = 정기 납품 주문의 보너스 (standingBonusRank2 = 읍이 된 뒤)
    //    standing = 가게 5곳이 다 열린 뒤 돌아가며 나오는 정기 납품 주문 (물건: 개수)
    orders: { cards: 3, swapAfter: 180, bonus: 0.5, standingBonus: 0.3, standingBonusRank2: 0.5,
              standing: [{ item_bread: 40 }, { item_fish_cooked: 50 }, { item_plank: 40 }, { item_ingot: 25 }, { item_can: 30 }, { item_meat_cooked: 25 }] },
    // ── 가게 열기 (주문을 다 채우면 다음 기차로 가게 주인과 목수가 와서 지어요)
    //    buildTime = 짓는 시간(초), ribbonAuto = 테이프를 안 잘라도 이만큼(초) 뒤 저절로 개업, household = 주인 가족 수
    //    order = 주문이 나오는 순서, lots = 가게가 서는 자리 (world.js v4.lots)
    //    shops.<가게>: need = 주문 (물건: 개수), rent = 월세(코인/분), sells = 파는 물건 (= 채워 주는 물건),
    //                  after = 이게 있어야 주문이 나와요 (zone_xxx = 땅, b:건물 = 지은 건물)
    //    shopShelf = 새 가게 선반 한 칸(물건 하나)에 들어가는 개수, inlandEvery = 솔방울 마을 손님이 이만큼(초)마다 하나씩 사 감
    //    restockBelow = 선반이 이만큼(0.4 = 40%) 아래로 줄면 역 짐꾼이 한꺼번에 채워 줘요 (촌장은 언제든 채울 수 있어요)
    founding: { buildTime: 25, ribbonAuto: 90, household: 2,
                order: ['cafe', 'restaurant', 'carpenter_workshop', 'hardware_store', 'supermarket'],
                lots: { cafe: 'lotA1', restaurant: 'lotA2', carpenter_workshop: 'lotA3', hardware_store: 'lotB1', supermarket: 'lotB5' },
                shops: {
                  cafe:               { need: { item_bread: 30 },                               rent: 20, sells: ['item_bread'],                                   after: 'zone_farm' },
                  restaurant:         { need: { item_fish_cooked: 40, item_meat_cooked: 15 },   rent: 30, sells: ['item_fish_cooked', 'item_meat_cooked'],         after: 'zone_hunt' },
                  carpenter_workshop: { need: { item_plank: 50 },                               rent: 25, sells: [],                                               after: 'zone_forest' },
                  hardware_store:     { need: { item_ingot: 25, item_axe: 1, item_pickaxe: 1 }, rent: 30, sells: ['item_axe', 'item_pickaxe', 'item_rod', 'item_sickle', 'item_bow'], after: 'b:toolsmith' },
                  supermarket:        { need: { item_can: 10, item_bread: 20 },                 rent: 40, sells: ['item_can', 'item_bread'],                       after: 'b:cannery' },
                },
                shopShelf: 20, inlandEvery: 40, restockBelow: 0.4 },
    // ── 역 짐꾼 (역 광장에서 고용): 첫째 / 둘째 값 (둘째는 가게가 3곳 열린 뒤), 한 번에 나르는 개수
    stationPorter: [600, 1100], stationPorterCapacity: 12,
    // 역 짐꾼은 남는 물건만 나르지만, 새 가게 주문(창업 주문)에 필요한 물건은 공장 앞에 이만큼만 쌓여도 가져가요
    // (v4 리뷰: 4 였을 때 화살표만 따라가는 봇은 가게 5곳을 끝내 못 열었어요 → 1)
    stationPorterFoundingMin: 1,
    // ── 목수의 집 (목공소가 열리면): item_plank = 집 하나에 드는 판자, time = 짓는 시간(초), people = 이사 오는 사람 수
    //    lots = 집터 (lotsRank2 = 읍이 된 뒤 더 생기는 집터)
    houses: { item_plank: 20, time: 30, people: 4, lots: ['lotH1', 'lotH2', 'lotH3'], lotsRank2: ['lotH4', 'lotH5', 'lotB2', 'lotB3'] },
    // ── 월세: cap = 역 금고에 쌓이는 월세의 최대, autoFromRank = 이 등급부터 역 금고가 저절로 비워짐, autoEvery = 몇 초마다
    rent: { cap: 2000, autoFromRank: 2, autoEvery: 15 },
    // ── 행복: window = 최근 손님 몇 명으로 계산할지, base = 가장 낮은 행복 (손님이 다 아쉬워해도)
    //    (기차 손님은 좋아하는 음식이 진열대에 없으면 다른 걸 사 가며 반쯤만 기뻐해요: 진열대를 채워 두면 행복이 올라요)
    //    (v4 리뷰: base 50 + 꾸미기 24 면 손님이 다 아쉬워해도 74 라 행복 막대가 아무 뜻이 없었어요 → 30)
    happiness: { window: 40, base: 30 },
    // ── 등급: 2 = 읍 (people = 사람 수, shops = 연 가게 수, happy = 행복, coins = 승격식 비용)
    //    (v4 봇 측정: 3000 이면 조건이 다 찬 뒤 1~2분 만에 읍이 돼서(잘하는 봇 39분) 14000 으로 올렸다가,
    //     v4 리뷰에서 조건이 다 찬 뒤 코인만 모으며 5분 넘게 기다려서 11000 으로 내림)
    rank: { 2: { people: 45, shops: 5, happy: 80, coins: 11000 } },
    // ── 승격식: length = 길이(초), skipAfter = 이만큼(초) 지나면 조이스틱으로 건너뛰기
    ceremony: { length: 12, skipAfter: 3 },
    // ── 텍스처 메모리 (MiB): mustMiB = 넘으면 안 되는 한도, targetMiB = 목표, lowMiB = 가벼운 그래픽 목표,
    //    softGap = 목표보다 이만큼 아래부터 안 쓰는 그림을 치워요, uploadsPerSec = 1초에 새로 올리는 그림 수
    //    socialPages = 주민의 몸짓 그림(웃기, 손 흔들기...)을 한 번에 몇 명 것까지 들고 있을지,
    //    socialTtl = 안 쓴 몸짓 그림을 몇 초 뒤에 치울지, townTtl = 멀리 있는 동네 그림을 몇 초 뒤에 치울지
    tex: { mustMiB: 455, targetMiB: 300, lowMiB: 200, softGap: 24, uploadsPerSec: 10, socialPages: 5, socialTtl: 30, townTtl: 10 },
  },

  // =====================================================================
  //  (v4-C) 서쪽 숲마을 · 마을회관 · 큰 식당 · 꾸미기 · 이주민 (docs/기획서_v4_추가요청.md)
  //   짓는 비용은 위 buildings 칸 (town_hall, big_restaurant, deco_...) 에 있어요
  // =====================================================================
  civic: {
    // ── 마을회관 (시청)
    hall: {
      taxPerPerson: 1.2,      // 주민 1명이 1분에 내는 세금(코인) → 마을회관 앞 세금 상자에 쌓여요
      taxCap: 1500,           // 세금 상자에 쌓이는 최대 코인 (촌장이 가져가야 다시 쌓여요)
      people: 6,              // 마을회관이 늘려 주는 집 자리 (주민 수 한도 +)
      happy: 8,               // 마을 행복도 +
    },
    // ── 큰 식당
    restaurant: {
      dishMult: 1.3,          // 한 접시 값 = 그 음식의 판매 가격 × dishMult
      comboMult: 1.6,         // 정식(생선구이 + 빵 + 훈제고기) 값 = 세 가지 판매 가격의 합 × comboMult
      comboChance: 0.4,       // 세 가지가 다 있을 때 손님이 정식을 시킬 확률
      spawnEvery: 5,          // 손님이 오는 간격(초)
      maxQueue: 6,            // 주문하려고 줄 서는 최대 손님 수
      pantryMax: 30,          // 식재료 칸 하나(음식 한 종류)에 넣어 두는 최대 개수
      cookTime: 1.4,          // 한 접시 요리하는 시간(초)
      cookTimeCombo: 2.4,     // 정식 요리하는 시간(초)
      eatTime: 9,             // 앉아서 먹는 시간(초)
      eatTimeCombo: 13,       // 정식을 먹는 시간(초)
      patience: 70,           // 자리에서 음식을 기다리는 최대 시간(초) — 넘으면 돈을 안 내고 그냥 가요
      visitorChance: 0.3,     // 기차 타고 온 이웃이 큰 식당에 들를 확률
      // 직원 고용비 (처음엔 촌장이 직접: 계산대에 서고, 주방 발판에 서서 요리·서빙)
      staff: { cashier: 450, cook: 700, server: 900 },   // 계산 점원 / 요리사 / 서빙 직원
    },
    // ── 꾸미기·마을회관이 올려 주는 행복도의 합이 이보다 커지지 않아요 (v4 리뷰: 24 → 12, 손님이 기뻐야 읍이 돼요)
    happyCap: 12,
    // ── 이주민: 주민이 다 들어가고도 빈 방이 남으면 이웃 마을·바깥 길에서 새 이웃이 이사 와요 (광부를 고용한 뒤부터)
    settlers: {
      every: 45,              // 이만큼(초)마다 한 가족 (행복도가 높을수록 조금 더 자주)
      householdMin: 1,        // 한 번에 오는 사람 수 (최소)
      householdMax: 2,        //                    (최대)
      maxVacant: 6,           // 집의 빈 방이 이만큼 남아 있으면 이주민이 들어올 때까지 집을 더 짓지 않아요 (마을회관 방은 안 세요)
    },
  },
  // =====================================================================
  //  (v4.2) 촌장의 하루 — 후광 · 자동 줍기 · 길 안내 · 넘치는 재고 · 새 기차 · 촌장 사무실 · 은행 · 물류창고 · 관망 모드
  //  (docs/v42_plan.md, 대표님용: docs/기획서_v4_2_촌장.md)
  // =====================================================================
  v42: {
    // ── 촌장 후광: ringPx = 고리 너비(px, 화면 배율 1일 때), fullZoom 보다 작게 보면 고리를 키워서 폰에서 늘 같은 크기로 보여요
    //    (maxScale = 최대 몇 배까지 키울지), pinZoom = 이보다 멀리 보면 머리 위에 별 표시,
    //    crowdN / crowdR = 반경 crowdR(px) 안에 사람이 crowdN 명 이상이면 별 표시, glowDay / glowNight = 몸 뒤 광채 진하기(낮·밤)
    aura: { ringPx: 70, fullZoom: 1.2, maxScale: 2, pinZoom: 0.8, crowdN: 4, crowdR: 160, glowDay: 0.35, glowNight: 0.6 },
    // ── 촌장 응원 (마을이 다 갖춰진 뒤): 일꾼 근처(radius px)에 still 초 이상 가만히 서 있으면 그 일꾼들이 mult 배 빨리 일해요
    //    (mult 를 1 로 하면 꺼져요)
    cheer: { mult: 1.1, still: 2, radius: 200 },
    // ── 자동 줍기 '멈추면': 발판 위에서 stillSpeed(px/초)보다 느리게 stillS 초 있어야 집어요 (채집은 gatherStillS 초)
    //    tipSpeed = 처음으로 '지나가다 주웠어요' 알림을 띄우는 빠르기 (최고 속도의 비율)
    pickup: { stillS: 0.35, stillSpeed: 20, gatherStillS: 0.35, tipSpeed: 0.6 },
    // ── 길 안내: dotEvery = 점 사이 간격(px), maxDots = 점 최대 개수, hideNear = 촌장 가까이(px)의 점은 숨김,
    //    replanEvery = 길을 다시 찾는 최소 간격(초), strayPx = 길에서 이만큼 벗어나면 다시 찾기, straightUnder = 이보다 가까우면 곧장
    nav: { dotEvery: 48, maxDots: 16, hideNear: 90, replanEvery: 1.0, strayPx: 80, straightUnder: 360 },
    // ── 짐꾼 규칙 (F1·F2): 판매대가 shelfEmptyAfter 초 넘게 비면 그곳이 먼저 (우선순위 shelfEmptyPrio),
    //    대장간·통조림 공장 재료는 inputUrgentBelow(0~1) 아래로 줄었을 때만 급하고 그 밖엔 inputCalmPrio,
    //    travelPxPerPoint = 이만큼(px) 멀 때마다 우선순위 1 깎기 (먼 곳보다 가까운 곳)
    porters: { shelfEmptyPrio: 48, shelfEmptyAfter: 10, inputUrgentBelow: 0.25, inputCalmPrio: 42, travelPxPerPoint: 300 },
    // ── 창고 짐꾼 (F3): direct = 가득 찬 출구의 물건을 원하는 판매대가 있으면 창고를 거치지 않고 바로 (directMinPrio 이상인 곳)
    warehouse: { direct: true, directMinPrio: 40 },
    // ── 짐꾼 2 (F4): 그 줄의 출구가 fullAt(0~1) 이상 찬 시간이 모두 fullForS 초가 되고 창고가 있으면 발판이 생겨요. costs = 줄마다 값
    porter2: { fullAt: 0.8, fullForS: 90, costs: { grill: 500, sawmill: 600, bakery: 700, smelter: 800, smokehouse: 900 } },
    // ── 가공소 2단 (F5): timeMult = 한 개 만드는 시간 배율 (0.66 = 1.5배 빨리), 그 줄 일꾼이 3명이 되면 발판이 생겨요
    station2: { timeMult: 0.66, costs: { grill: 900, sawmill: 1000, bakery: 1100, smelter: 1400, smokehouse: 1600 } },
    // ── 남는 물건 (기차 수출 · 물류창고로 보낼 것)
    //    outAt / outForS = 가공소 출구가 outAt 이상으로 outForS 초 → 남음 (가까운 localPx 안에 원하는 곳이 없을 때)
    //    pileAt / pileForS / pileKeep = 모아두는 곳이 pileAt 이상으로 pileForS 초 → 남음 (pileKeep 개는 남겨 둬요)
    //    whAt / whKeep = 창고가 whAt 넘게 차면 whKeep 까지 줄여요, boatAt = 배 창고 생선이 이만큼 차면 남음
    surplus: { outAt: 0.7, outForS: 20, localPx: 1500, pileAt: 0.95, pileForS: 30, pileKeep: 20, whAt: 0.7, whKeep: 0.5, boatAt: 0.9 },
    // ── 역 짐꾼 3 / 4 (물류창고가 생긴 뒤): 값
    stationPorter34: [1000, 1500],
    // ── 기차 수출 (F7): perTrain = 기차 한 번에 싣는 상자 (화물칸 32 + 무개화차 24), big = '화물칸 크게' 뒤,
    //    bigCost = 화물칸 크게 값, bigOfferWait / bigOfferS = 수출 상자가 이만큼 bigOfferS 초 기다리면 '화물칸 크게' 제안,
    //    exportRate = 수출 값 (판매 가격 × exportRate, 역 금고로), loadEvery = 상자 하나 싣는 간격(초)
    freight: { perTrain: 56, big: 88, bigCost: 2000, bigOfferWait: 60, bigOfferS: 120, exportRate: 0.5, loadEvery: 0.14 },
    // ── 서리 물류창고 (F8)
    depot: {
      site: { coins: 6000, item_plank: 40, item_ingot: 20, time: 20 },              // 짓는 값 (코인 + 자재), 짓는 시간(초)
      caps: { materials: 160, food: 160, goods: 120, tools: 60 },                   // 선반 종류별 최대 개수
      sleigh: { cap: 60, speed: 2.5, loadS: 8, secondCost: 2500 },                  // 화물 썰매: 한 번에 싣는 개수, 속도(m/초), 싣는 시간(초), 한 대 더 값
      sell: { every: 8, rate: 0.6, open: 7, close: 20,                              // 상인이 오는 간격(초), 값 비율, 여는 시각 ~ 닫는 시각
              perMin: { materials: 20, food: 30, goods: 20, tools: 6 } },           // 종류별 1분에 팔 수 있는 최대 개수
      rawPrice: { item_fish_raw: 1, item_log: 1, item_wheat: 1, item_ore: 2, item_meat_raw: 3 },   // 날것을 팔 때 값 (추정 — 봇으로 맞춰요)
    },
    // ── 촌장 사무실: site = 짓는 값, hire = 직원 값 (셈이 / 딸랑이 / 소복이 / 총총이),
    //    revealPx / revealHyst = 촌장이 문에서 이만큼(px) 안에 오면 지붕이 투명해져요 (떨림 방지 여유), deskPadS = 책상 발판에 서 있는 시간(초)
    office: { site: { coins: 1800, item_plank: 20, item_ingot: 6, time: 10 },
              hire: { sem: 500, ttal: 900, bok: 700, chong: 900 }, revealPx: 260, revealHyst: 60, deskPadS: 0.4 },
    // ── 수금원 딸랑이: every = 도는 간격(초), rushAt = 한 곳에 이만큼 쌓이면 바로 출발, minPad = 이만큼 넘게 쌓인 곳만 들러요,
    //    speed = 걷는 속도(px/초), vaultAt = 이만큼 넘게 입금하면 금고 문이 빙글
    courier: { every: 60, rushAt: 1000, minPad: 100, speed: 150, vaultAt: 5000 },
    // ── 서리 은행: 짓는 값
    bank: { site: { coins: 3000, item_plank: 24, item_ingot: 12, time: 12 } },
    // ── 재고판(셈이): window = 흐름을 재는 시간(초), emptyS / fullS = 이만큼(초) 비어 / 차 있으면 '부족·길 막힘' / '남음'
    ledger: { window: 300, emptyS: 30, fullS: 60 },
    // ── 서리 소식(신문): hour = 신문이 나오는 시각, keep = 보관하는 신문 수
    news: { hour: 6, keep: 3 },
    // ── 편지: minH ~ maxH = 새 편지 간격(게임 시간), maxUnread = 안 읽은 편지 최대, archiveDays = 답장 안 한 편지가 사라지는 날 수
    letters: { minH: 2, maxH: 4, maxUnread: 6, archiveDays: 2 },
    // ── 관망 모드: decideEvery = 할 일을 고르는 간격(초), jitter = 고를 때 섞는 정도, hysteresis = 하던 일을 계속하려는 정도,
    //    minZoom = 관망 중 가장 멀리 보는 배율, camLerp = 카메라가 따라가는 부드러움, cutEvery = 볼거리로 카메라가 가는 간격(초, 최소~최대),
    //    cutHold = 볼거리를 보여 주는 시간(초), cutRange = 이만큼(px) 안의 볼거리만, stuckSide / stuckDrop = 막혔을 때 비키기 / 포기(초)
    //    agenda = 시간대별 하고 싶은 일 배율 [시작 시, 끝 시, 일, 배율]
    pilot: { decideEvery: 0.5, jitter: 0.1, hysteresis: 0.2, minZoom: 0.7, camLerp: 0.08, cutEvery: [45, 90], cutHold: [6, 8],
             cutRange: 2500, stuckSide: 3, stuckDrop: 8,
             agenda: [[7, 9, 'office', 1.5], [9, 12, 'work', 1.3], [13, 17, 'work', 1.15], [17, 20, 'chat', 1.5], [17, 20, 'rest', 1.2]] },
    // ── 새 기차: speed = 곧은 길 속도(m/초), curve = 고리를 돌 때 속도, accel / brake = 출발·멈출 때, dwellOurs / dwellTown = 서 있는 시간(초)
    //    coachSeats = 객차 한 칸 자리, labels = 새 기차가 처음 몇 번 들어올 때 칸마다 이름표를 띄울지
    train: { speed: 3.4, curve: 2.2, accel: 0.7, brake: 0.8, dwellOurs: 12, dwellTown: 8, coachSeats: 16, labels: 3 },
  },
};
