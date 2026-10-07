// =====================================================================
//  월드 배치 (world.js) — 마을 지도. 좌표는 화면 픽셀(px) 기준.
//  x: 오른쪽으로 갈수록 커짐, y: 아래로 갈수록 커짐.
//  구역(zone)의 size 는 미터(m) 단위 [X축 길이, Y축 길이] — 아이소 마름모 모양이 됩니다.
//  (1m 이동 = 오른쪽아래 (+45, +23)px 또는 오른쪽위 (+45, -23)px)
// =====================================================================

export const WORLD = {
  width: 1800,
  height: 2620,

  // 바닷가: y 값보다 위쪽이 바다. 물결 모양 = base + Σ amp*sin(x*freq + phase)
  shore: { base: 372, waves: [[16, 0.0052, 0.4], [7, 0.0165, 1.7], [3, 0.041, 0.2]] },

  player: { x: 960, y: 560 },          // 시작 위치

  // ── 구역 ───────────────────────────────────────────────
  // floor: 바닥 텍스처, unlock: 이 구역을 여는 해금 id (null = 처음부터 열림)
  zones: {
    plaza:  { center: [960, 790],  size: [12, 12], floor: 'ground_plaza', unlock: null,          name: 'z_plaza' },
    forest: { center: [420, 1330], size: [9, 9],   floor: 'ground_dirt',  unlock: 'zone_forest', name: 'z_forest', floorAlpha: 0.55 },
    farm:   { center: [1405, 1345],size: [8.5, 8.5], floor: 'ground_farm', unlock: 'zone_farm',  name: 'z_farm' },
    mine:   { center: [445, 1985], size: [9, 9],   floor: 'ground_rock',  unlock: 'zone_mine',   name: 'z_mine' },
    hunt:   { center: [1370, 2010],size: [9.5, 9.5], floor: 'ground_dirt', unlock: 'zone_hunt',  name: 'z_hunt', floorAlpha: 0.45 },
  },

  // ── 가공소 ─────────────────────────────────────────────
  // in / out: 입구·출구 발판 위치 (가공소 기준 상대 px)
  stations: [
    { id: 'grill',      sprite: 'station_grill',      x: 1010, y: 610,  in: [-112, -38], out: [112, 50],  input: 'item_fish_raw', output: 'item_fish_cooked', zone: 'plaza',  sfx: 'sfx_sizzle', fire: [0, -30] },
    { id: 'sawmill',    sprite: 'station_sawmill',    x: 690,  y: 1150, in: [-118, -40], out: [116, 52],  input: 'item_log',      output: 'item_plank',       zone: 'forest', sfx: 'sfx_saw' },
    { id: 'bakery',     sprite: 'station_bakery',     x: 1180, y: 1180, in: [-128, 4],   out: [96, 70],   input: 'item_wheat',    output: 'item_bread',       zone: 'farm',   sfx: 'sfx_oven', smoke: [42, -150] },
    { id: 'smelter',    sprite: 'station_smelter',    x: 735,  y: 1830, in: [-126, 6],   out: [104, 62],  input: 'item_ore',      output: 'item_ingot',       zone: 'mine',   sfx: 'sfx_smelt', smoke: [-14, -150] },
    { id: 'smokehouse', sprite: 'station_smokehouse', x: 1140, y: 1840, in: [-130, 10],  out: [110, 62],  input: 'item_meat_raw', output: 'item_meat_cooked', zone: 'hunt',   sfx: 'sfx_sizzle', smoke: [-10, -140] },
  ],

  // ── 판매처 ─────────────────────────────────────────────
  market: {
    sprite: 'market_counter', x: 1250, y: 805,
    shelf: [118, 58],              // 음식 놓는 발판 (판매대 기준)
    cash: [20, 128],               // 손님 코인 쌓이는 발판
    queueStart: [-70, 40],         // 맨 앞 손님 위치
    queueStep: [-40, 20],          // 줄 간격 (뒤로 갈수록)
    serveFace: 'NE',
    entry: [[960, 2650], [960, 1180], [930, 1040]],   // 손님이 걸어오는 길 (마지막 점 다음에 줄 끝으로)
    exit: [[960, 1180], [960, 2650]],
  },
  trade: {
    sprite: 'trade_post', x: 640, y: 905, zone: 'forest',
    shelf: [-60, 108],             // 판자/주괴 놓는 발판
    cash: [128, 76],
    merchant: [44, -6],            // 상인 서 있는 위치
  },
  bench: { sprite: 'upgrade_bench', x: 1360, y: 1030, pads: { capacity: [-130, 62], speed: [10, 120] } },

  // ── 자원 ───────────────────────────────────────────────
  net: { x: 900, y: 395, gather: [0, 92], fisherSpot: [-118, 46] },
  trees: { zone: 'forest', grid: 1.55, jitter: 0.35, margin: 0.9, avoid: [[690, 1150, 190], [270, 1250, 130]] },
  rocks: [
    [300, 1900, 'rock_ore'], [470, 1880, 'rock_ore_b'], [215, 2010, 'rock_ore_b'], [395, 2035, 'rock_ore'],
    [560, 2010, 'rock_ore'], [330, 2150, 'rock_ore_b'], [500, 2140, 'rock_ore'],
  ],
  wheat: { zone: 'farm', origin: [1420, 1360], rows: 3, cols: 3, step: 1.5 },
  hunt: { zone: 'hunt' },

  // ── 해금 / 고용 발판 ────────────────────────────────────
  //  worker: 고용되는 일꾼, hut: 일꾼 오두막 위치 (구역이 열릴 때 함께 나타남)
  pads: {
    hire_fisherman:  { x: 690,  y: 600,  worker: 'fisherman',  hut: [560, 505] },
    zone_forest:     { x: 760,  y: 1030, zone: 'forest' },
    hire_lumberjack: { x: 330,  y: 1190, worker: 'lumberjack', hut: [205, 1120] },
    zone_farm:       { x: 1180, y: 1060, zone: 'farm' },
    hire_farmer:     { x: 1570, y: 1250, worker: 'farmer',     hut: [1660, 1170] },
    zone_mine:       { x: 760,  y: 1700, zone: 'mine' },
    hire_miner:      { x: 210,  y: 1850, worker: 'miner',      hut: [110, 1790] },
    zone_hunt:       { x: 1160, y: 1700, zone: 'hunt' },
    hire_hunter:     { x: 1580, y: 1860, worker: 'hunter',     hut: [1680, 1800] },
    hire2_fisherman: { x: 600,  y: 640,  worker: 'fisherman' },
    hire2_lumberjack:{ x: 430,  y: 1150, worker: 'lumberjack' },
    hire2_farmer:    { x: 1600, y: 1360, worker: 'farmer' },
    hire2_miner:     { x: 280,  y: 1800, worker: 'miner' },
    hire2_hunter:    { x: 1560, y: 1960, worker: 'hunter' },
  },

  // 고용된 일꾼의 시작/대기 위치
  workerHome: {
    fisherman: [700, 520], lumberjack: [380, 1210], farmer: [1530, 1300], miner: [280, 1880], hunter: [1520, 1900],
  },

  // ── 길 (눈이 다져진 길) ─────────────────────────────────
  paths: [
    [[960, 2700], [960, 1990], [960, 1500], [950, 1080]],
    [[960, 1500], [760, 1440], [700, 1250]],
    [[960, 1500], [1160, 1420], [1240, 1260]],
    [[960, 1990], [800, 1960], [760, 1880]],
    [[960, 1990], [1100, 1980], [1140, 1930]],
    [[960, 2300], [760, 2360], [560, 2380]],
    [[960, 2300], [1160, 2360], [1360, 2380]],
  ],

  // ── 울타리 ─────────────────────────────────────────────
  //  zone 의 가장자리 중 어느 변에 울타리를 칠지: tl(왼쪽위) tr(오른쪽위) bl(왼쪽아래) br(오른쪽아래)
  //  gaps: 변 위의 [시작m, 끝m] 구간은 비워 둠 (입구)
  fences: [
    { zone: 'plaza',  edges: { tr: [[5.4, 12]] } },
    { zone: 'forest', edges: { tl: [], bl: [[3.5, 6]] } },
    { zone: 'farm',   edges: { tr: [], br: [[2.5, 5]] } },
    { zone: 'mine',   edges: { tl: [[3, 5.5]], bl: [] } },
    { zone: 'hunt',   edges: { tr: [], br: [], bl: [[3.5, 6.5]], tl: [[6, 9.5]] } },
  ],

  // ── 장식 (구역이 잠겨 있어도 보이는 것들) ───────────────────
  // [스프라이트, x, y, {zone: 해금 후에만 보임, flip: 좌우 반전, scale}]
  decor: [
    // 바다
    ['dock_pier', 1450, 300], ['boat_small', 1640, 250], ['ice_chunk', 210, 310], ['ice_chunk', 470, 335, { scale: 0.7 }],
    ['boat_small', 1280, 210, { flip: true, scale: 0.85 }],
    // 해변 / 광장
    ['lamp_post', 820, 520], ['barrel', 1130, 520], ['crate', 1185, 545], ['crate', 1160, 500, { scale: 0.8 }],
    ['flag_pole', 1440, 620], ['bench', 845, 950], ['lamp_post', 1100, 1000], ['barrel', 520, 760], ['firewood_pile', 470, 700],
    ['snow_pile_a', 300, 520], ['snow_pile_b', 380, 600], ['bush_snow', 1560, 560], ['bush_snow', 1620, 640], ['snow_pile_b', 1680, 520],
    ['signpost', 1010, 1110], ['campfire', 560, 600],
    // 남쪽 마을
    ['chief_lodge', 930, 2400], ['tent_a', 640, 2330], ['tent_a', 1230, 2330, { flip: true }], ['campfire', 960, 2200],
    ['flag_pole', 1140, 2170], ['lamp_post', 880, 2190], ['lamp_post', 1050, 2550], ['firewood_pile', 760, 2480], ['barrel', 1180, 2480],
    ['crate', 1220, 2510], ['bench', 1050, 2240], ['hay_bale', 1300, 2440], ['snow_pile_a', 520, 2470], ['bush_snow', 1400, 2470],
    ['snow_pile_b', 760, 2200],
    // 길가
    ['lamp_post', 1010, 1500], ['lamp_post', 900, 1790], ['signpost', 905, 1530], ['bush_snow', 1030, 1660], ['snow_pile_b', 880, 1630],
    ['barrel', 1040, 1890], ['crate', 870, 2050], ['bush_snow', 860, 1270], ['snow_pile_a', 1080, 1300],
    // 구역 장식 (해금 후)
    ['firewood_pile', 160, 1300, { zone: 'forest' }], ['tree_stump', 560, 1440, { zone: 'forest' }],
    ['hay_bale', 1640, 1420, { zone: 'farm' }], ['hay_bale', 1700, 1380, { zone: 'farm', scale: 0.85 }], ['barrel', 1260, 1490, { zone: 'farm' }],
    ['mine_entrance', 430, 1790, { zone: 'mine' }], ['crate', 640, 1960, { zone: 'mine' }], ['barrel', 610, 2110, { zone: 'mine' }],
    ['hay_bale', 1300, 2160, { zone: 'hunt' }], ['bush_snow', 1550, 2100, { zone: 'hunt' }], ['bush_snow', 1220, 2060, { zone: 'hunt' }],
    ['snow_pile_b', 1450, 1880, { zone: 'hunt' }],
  ],

  // 가장자리 소나무 숲 (장식, 벨 수 없음): 자동 배치 영역 [x0, y0, x1, y1, 간격]
  borderTrees: [
    [0, 420, 140, 2620, 105], [1660, 420, 1800, 2620, 105], [0, 2520, 1800, 2620, 120],
  ],
  // 그 밖에 흩어진 소나무 [x, y, 종류]
  extraTrees: [
    [250, 720, 'tree_pine_snow'], [180, 880, 'tree_pine_a'], [330, 940, 'tree_pine_b'], [1600, 760, 'tree_pine_snow'], [1520, 880, 'tree_pine_a'],
    [1660, 980, 'tree_pine_b'], [880, 1380, 'tree_pine_snow'], [1060, 1390, 'tree_pine_a'], [180, 1600, 'tree_pine_snow'], [700, 1580, 'tree_pine_a'],
    [1180, 1580, 'tree_pine_b'], [1660, 1620, 'tree_pine_snow'], [760, 2220, 'tree_pine_a'], [1520, 2290, 'tree_pine_snow'], [320, 2320, 'tree_pine_b'],
    [600, 2560, 'tree_pine_snow'], [1340, 2580, 'tree_pine_a'], [180, 2240, 'tree_pine_a'], [1700, 2200, 'tree_pine_b'],
  ],

  // 바닥 데칼 [키, x, y, 크기배율, 회전(도)]
  decals: [
    ['decal_snow_drift_a', 360, 660, 1], ['decal_snow_drift_b', 1580, 700, 1], ['decal_snow_drift_a', 760, 1560, 1.1], ['decal_snow_drift_b', 1200, 1560, 1],
    ['decal_snow_drift_a', 1580, 2400, 1], ['decal_snow_drift_b', 330, 2420, 1], ['decal_puddle_ice', 1120, 1510, 1], ['decal_puddle_ice', 640, 2230, 0.9],
    ['decal_dirt_patch', 560, 1800, 1.2], ['decal_dirt_patch', 280, 2080, 1], ['decal_dirt_patch', 760, 1210, 0.8],
    ['decal_footprints', 980, 1700, 1], ['decal_footprints', 940, 2100, 1], ['decal_footprints', 760, 520, 0.9],
  ],
};
