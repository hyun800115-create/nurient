// =====================================================================
//  월드 배치 (world.js) — 마을 지도.
//  좌표는 화면 픽셀(px): x 는 오른쪽으로, y 는 아래로 갈수록 커집니다.
//  구역(zone) 안의 물건은 Z('구역', mx, my) 로 '구역 중심에서 몇 미터' 로 적습니다.
//    mx: +1 이면 오른쪽 아래로 1m (+45, +23 px),  my: +1 이면 오른쪽 위로 1m (+45, -23 px)
//  구역 size 는 [X축 m, Y축 m] — 아이소 마름모 모양 바닥이 됩니다.
// =====================================================================

const ZONES = {
  plaza:  { center: [990, 800],   size: [14, 14],   floor: 'ground_plaza', unlock: null,          name: 'z_plaza' },
  forest: { center: [470, 1250],  size: [9, 9],     floor: 'ground_dirt',  unlock: 'zone_forest', name: 'z_forest', floorAlpha: 0.5 },
  farm:   { center: [1410, 1270], size: [8, 8],     floor: 'ground_farm',  unlock: 'zone_farm',   name: 'z_farm' },
  mine:   { center: [430, 1900],  size: [9, 9],     floor: 'ground_rock',  unlock: 'zone_mine',   name: 'z_mine' },
  hunt:   { center: [1400, 1960], size: [8.5, 8.5], floor: 'ground_dirt',  unlock: 'zone_hunt',   name: 'z_hunt', floorAlpha: 0.45 },
};

/** zone-local metres -> screen px [x, y] */
export function Z(zone, mx, my) {
  const c = ZONES[zone].center;
  return [Math.round(c[0] + 45.25 * (mx + my)), Math.round(c[1] + 22.63 * (mx - my))];
}
const P = (zone, mx, my) => { const [x, y] = Z(zone, mx, my); return { x, y }; };

// station pads are placed at the ends of the station's long axis (world X) or in front (-Y)
const XOFF = (m) => [Math.round(45.25 * m), Math.round(22.63 * m)];      // along +X
const YOFF = (m) => [Math.round(45.25 * m), Math.round(-22.63 * m)];     // along +Y

const grill = Z('plaza', -4.5, 4.8);
const market = Z('plaza', 2.0, 2.8);
const trade = Z('plaza', -4.6, -1.0);
const bench = Z('plaza', 3.6, -4.6);
const sawmill = Z('forest', 1.3, 2.6);
const bakery = Z('farm', -1.6, 1.2);
const smelter = Z('mine', 1.6, 2.4);
const smokehouse = Z('hunt', -1.8, 1.6);

const rel = (a, b) => [b[0] - a[0], b[1] - a[1]];

export const WORLD = {
  width: 1800,
  height: 2620,

  // 바닷가: y 값보다 위쪽이 바다. 물결 모양 = base + Σ amp*sin(x*freq + phase)
  shore: { base: 372, waves: [[16, 0.0052, 0.4], [7, 0.0165, 1.7], [3, 0.041, 0.2]] },

  player: { x: 935, y: 520 },          // 시작 위치
  // 첫 판매(튜토리얼) 동안 카메라가 비추는 곳: 그물·그릴·판매대·손님 줄이 한 화면에 들어오도록
  // (촌장이 화면 가장자리로 가면 카메라가 따라감)
  tutorialView: [1095, 670],

  zones: ZONES,

  // ── 가공소 ─────────────────────────────────────────────
  // in / out: 입구·출구 발판 위치 (가공소 기준 상대 px)
  stations: [
    { id: 'grill',      sprite: 'station_grill',      x: grill[0], y: grill[1], in: XOFF(-2.15), out: XOFF(2.15), input: 'item_fish_raw', output: 'item_fish_cooked', zone: 'plaza', sfx: 'sfx_sizzle', fire: [0, -30], porterHome: [-52, 44] },
    { id: 'sawmill',    sprite: 'station_sawmill',    x: sawmill[0], y: sawmill[1], in: XOFF(-2.3), out: XOFF(2.3), input: 'item_log', output: 'item_plank', zone: 'forest', sfx: 'sfx_saw' },
    { id: 'bakery',     sprite: 'station_bakery',     x: bakery[0], y: bakery[1], in: [118, 28], out: [-118, 30], input: 'item_wheat', output: 'item_bread', zone: 'farm', sfx: 'sfx_oven', smoke: [40, -150] },
    { id: 'smelter',    sprite: 'station_smelter',    x: smelter[0], y: smelter[1], in: [-122, 4], out: [112, 52], input: 'item_ore', output: 'item_ingot', zone: 'mine', sfx: 'sfx_smelt', smoke: [-14, -150] },
    { id: 'smokehouse', sprite: 'station_smokehouse', x: smokehouse[0], y: smokehouse[1], in: [122, 26], out: [-124, 40], input: 'item_meat_raw', output: 'item_meat_cooked', zone: 'hunt', sfx: 'sfx_sizzle', smoke: [-10, -140] },
  ],

  // ── 판매처 ─────────────────────────────────────────────
  market: {
    sprite: 'market_counter', x: market[0], y: market[1],
    shelf: rel(market, Z('plaza', 4.35, 2.8)),     // 음식 놓는 발판 (판매대 오른쪽 끝)
    cash: rel(market, Z('plaza', 4.7, 0.3)),       // 손님 코인 쌓이는 발판
    queueStart: rel(market, Z('plaza', 2.0, 1.25)),// 맨 앞 손님 위치 (판매대 앞)
    queueStep: YOFF(-0.9),                         // 줄 간격 (뒤로 갈수록 왼쪽 아래)
    queueTurn: 6,                                  // 이 수만큼 선 뒤에는 줄이 꺾여서
    queueStep2: XOFF(0.9),                         //   이 방향(오른쪽 아래)으로 이어짐
    // 손님이 걸어오는 길 (끝나면 줄 끝으로). 손님은 화면 밖에서 이 길 위의 가장 가까운 곳에 나타납니다.
    // (주의: 모든 점은 걸을 수 있는 땅 안쪽이어야 합니다 — 지도 아래 끝 y 2570 보다 위)
    entry: [[990, 2200], [990, 1260], [1080, 1080]],
    exit: [[1080, 1080], [990, 1260], [990, 2200]],     // 다 산 손님이 돌아가는 길 (화면 밖으로 나가거나 길 끝에 닿으면 사라짐)
    // (v2) 계산대: 손님은 여기에 촌장(또는 점원)이 서 있어야 돈을 내고 떠납니다
    register: rel(market, Z('plaza', 6.0, 3.4)),   // 촌장이 서는 계산대 발판 (판매대 오른쪽 끝, 진열대 옆)
    staff: rel(market, Z('plaza', 2.1, 3.95)),     // 점원이 서는 곳 (판매대 뒤). 그림에 staffPoints 가 있으면 그것을 씀
    clerk: ['npc_clerk_a', 'npc_aunt'],            // (v2) 점원 모습: 앞의 그림이 아직 없으면 다음 것 (그림이 오면 바뀜)
  },
  trade: {
    sprite: 'trade_post', x: trade[0], y: trade[1], zone: 'forest',
    shelf: rel(trade, Z('plaza', -4.6, -2.85)),    // 판자/주괴 놓는 발판 (앞쪽)
    cash: rel(trade, Z('plaza', -2.1, -2.75)),     // 상인이 낸 코인
    merchant: rel(trade, Z('plaza', -4.3, 0.5)),   // 상인 위치 (썰매 뒤)
    register: rel(trade, Z('plaza', -6.55, -1.75)),// (v2) 촌장이 서는 계산대 발판 (교역소 왼쪽 끝)
    staff: rel(trade, Z('plaza', -6.55, -1.75)),   // (v2) 점원이 서는 곳 (계산대 자리). 그림에 staffPoints 가 있으면 그것을 씀
    clerk: ['npc_clerk_b', 'npc_merchant'],        // (v2) 점원 모습 (위와 같음)
  },
  // 버리기 발판: 위에 잠깐 서 있으면 들고 있는 물건을 모닥불에 던져 버립니다 (어부 고용 후 나타남)
  trash: { x: 560, y: 700, fire: [520, 574] },
  bench: { sprite: 'upgrade_bench', x: bench[0], y: bench[1], pads: { capacity: rel(bench, Z('plaza', 1.55, -4.75)), speed: rel(bench, Z('plaza', 5.65, -4.45)) } },

  // ── 자원 ───────────────────────────────────────────────
  net: { x: 880, y: 398, gather: [0, 86], fisherSpot: [-128, 30] },
  trees: { zone: 'forest', grid: 2.05, jitter: 0.3, margin: 0.95, scale: 0.9, cornerCut: -5.5, avoid: [[sawmill[0], sawmill[1], 170], [sawmill[0] - 104, sawmill[1] - 52, 90], [sawmill[0] + 104, sawmill[1] + 52, 90], [Z('forest', -3.2, 2.4)[0], Z('forest', -3.2, 2.4)[1], 90]] },
  rocks: [
    [...Z('mine', -2.6, -0.4), 'rock_ore'], [...Z('mine', -0.6, -1.6), 'rock_ore_b'], [...Z('mine', -2.8, -2.8), 'rock_ore_b'],
    [...Z('mine', 0.9, -3.2), 'rock_ore'], [...Z('mine', -0.6, 0.6), 'rock_ore'], [...Z('mine', 2.6, -1.0), 'rock_ore_b'],
    [...Z('mine', -1.2, -3.9), 'rock_ore'],
  ],
  wheat: { zone: 'farm', origin: Z('farm', 1.3, -1.2), rows: 3, cols: 3, step: 1.5 },
  hunt: { zone: 'hunt' },

  // ── 해금 / 고용 발판 ────────────────────────────────────
  //  worker: 고용되는 일꾼, hut: 일꾼 오두막 위치 (구역이 열릴 때 함께 나타남)
  pads: {
    hire_fisherman:  { x: 900,  y: 700,  worker: 'fisherman',  hut: [585, 470] },
    zone_forest:     { x: 760,  y: 1130, zone: 'forest' },
    hire_lumberjack: { ...P('forest', -0.6, 3.6), worker: 'lumberjack', hut: [300, 1010] },
    zone_farm:       { x: 1190, y: 1135, zone: 'farm' },
    hire_farmer:     { ...P('farm', -1.0, 3.0), worker: 'farmer',     hut: [1606, 1112] },
    zone_mine:       { x: 760,  y: 1760, zone: 'mine' },
    hire_miner:      { ...P('mine', -0.4, 3.6), worker: 'miner',      hut: [236, 1730] },
    zone_hunt:       { x: 1160, y: 1800, zone: 'hunt' },
    hire_hunter:     { ...P('hunt', 1.6, 2.6), worker: 'hunter',     hut: [1616, 1790] },
    // (v2) 점원 고용: 첫 판매 / 첫 교역 뒤에 나타남. 점원이 있으면 촌장이 계산대에 서 있지 않아도 손님이 돈을 냄
    hire_clerk_market: { x: 1496, y: 794, clerk: 'market' },
    hire_clerk_trade:  { ...P('plaza', -2.6, -3.95), clerk: 'trade' },
    // (v2) 짐꾼 고용: 그 가공소의 일꾼을 고용하면 나타남. 짐꾼이 완성품을 길을 따라 판매대·교역소로 날라 줌
    porter_grill:      { x: 905,  y: 705,  station: 'grill' },
    porter_sawmill:    { ...P('forest', -1.0, 3.3), station: 'sawmill' },
    porter_bakery:     { ...P('farm', 0.6, 3.1), station: 'bakery' },
    porter_smelter:    { ...P('mine', 0.9, 3.6), station: 'smelter' },
    porter_smokehouse: { ...P('hunt', 2.9, 1.5), station: 'smokehouse' },
  },

  // 고용된 일꾼의 대기 위치
  workerHome: {
    fisherman: [700, 470], lumberjack: Z('forest', -2.0, 1.6), farmer: Z('farm', -0.2, 2.2), miner: Z('mine', -0.2, 2.2), hunter: Z('hunt', 0.6, 2.2),
  },

  // ── 길 (v2: 길 그래프) ───────────────────────────────────
  //  nodes: 이름: [x, y]  /  edges: [시작, 끝, { zone: 이 구역이 열려야 생김, draw: false 면 그리지 않음 (광장 바닥 위 등),
  //                                            walk: false 면 걷지 않음, via: [[x, y], ...] 중간 굽은 점 }]
  //  짐꾼·손님·새 주민은 이 길을 따라 걸어 다닙니다 (마지막 몇 미터만 길 밖으로).
  //  모든 점은 걸을 수 있는 땅 위에 있어야 합니다 (장식·건물과 겹치지 않게).
  roads: {
    nodes: {
      plaza_c:  [1000, 770],  plaza_s: [990, 1095], plaza_sw: [705, 965], plaza_se: [1262, 968], plaza_w: [600, 830],
      forest_link: [772, 1148], farm_link: [1196, 1158],
      cross_n: [990, 1440], forest_gate: [790, 1300], farm_gate: [1180, 1320],
      green: [990, 1700], cross_s: [990, 2040], mine_gate: [790, 1950], hunt_gate: [1170, 1980],
      village: [990, 2240], tents_w: [620, 2380], tents_e: [1360, 2380], gate: [990, 2560], gate_out: [990, 2700],
      forest_in: [690, 1290], farm_in: [1290, 1290], mine_in: [700, 1960], hunt_in: [1260, 1980],
      beach_w: [690, 610], beach_n: [1000, 500], beach_e: [1300, 572], plaza_e: [1335, 905], gap_n: [1078, 556],
    },
    edges: [
      ['plaza_c', 'plaza_s', { draw: false }], ['plaza_c', 'plaza_sw', { draw: false }], ['plaza_c', 'plaza_se', { draw: false }],
      ['plaza_c', 'plaza_w', { draw: false }], ['plaza_w', 'plaza_sw', { draw: false }],
      ['plaza_c', 'plaza_e', { draw: false }], ['plaza_e', 'plaza_se', { draw: false }],
      ['beach_w', 'beach_n', { draw: false }], ['beach_n', 'beach_e', { draw: false }],
      // 광장 위쪽 울타리 틈 (그릴 옆): 광장 <-> 바닷가 오른쪽 놀이터
      ['plaza_c', 'gap_n', { draw: false }], ['gap_n', 'beach_n', { draw: false }], ['gap_n', 'beach_e', { draw: false }], ['beach_w', 'plaza_w', { draw: false }], ['beach_w', 'plaza_c', { draw: false }],
      ['plaza_s', 'cross_n', { via: [[990, 1150]] }],
      ['plaza_sw', 'forest_link'], ['forest_link', 'forest_gate', { via: [[786, 1230]] }],
      ['plaza_se', 'farm_link'], ['farm_link', 'farm_gate', { via: [[1186, 1240]] }],
      ['cross_n', 'forest_gate', { via: [[880, 1390]] }], ['cross_n', 'farm_gate', { via: [[1090, 1390]] }],
      ['cross_n', 'green'], ['green', 'cross_s'],
      ['cross_s', 'mine_gate', { via: [[880, 2000]] }], ['cross_s', 'hunt_gate', { via: [[1090, 2010]] }],
      ['cross_s', 'village'],
      ['village', 'tents_w', { via: [[800, 2330]] }], ['village', 'tents_e', { via: [[1180, 2330]] }],
      ['village', 'gate'], ['gate', 'gate_out', { walk: false }],
      // 구역 안 길 (구역이 열리면 나타남)
      ['forest_gate', 'forest_in', { zone: 'forest' }], ['farm_gate', 'farm_in', { zone: 'farm' }],
      ['mine_gate', 'mine_in', { zone: 'mine' }], ['hunt_gate', 'hunt_in', { zone: 'hunt' }],
    ],
  },
  paths: null,   // (자동: 위 roads 에서 그리는 길만 모아 만듦)

  // ── 울타리 ─────────────────────────────────────────────
  //  zone 의 가장자리: tl(왼쪽위) tr(오른쪽위) bl(왼쪽아래) br(오른쪽아래)
  //  gaps: 변 위의 [시작m, 끝m] 구간은 비워 둠 (입구). tl/bl 은 왼쪽 꼭짓점부터, tr 은 위 꼭짓점부터, br 은 아래 꼭짓점부터 잰 거리
  fences: [
    { zone: 'plaza',  edges: { tr: [[0, 3.2]] } },
    { zone: 'forest', edges: { tl: [], bl: [] } },
    { zone: 'farm',   edges: { tr: [], br: [] } },
    { zone: 'mine',   edges: { tl: [[6.2, 9]], bl: [] } },
    { zone: 'hunt',   edges: { tr: [], br: [], bl: [[0, 2.5]], tl: [[0.8, 5.2]] } },
  ],

  // ── 장식 ───────────────────────────────────────────────
  // [스프라이트, x, y, {zone: 해금 후에만 보임, flip: 좌우 반전, scale: 크기}]
  decor: [
    // 바다
    ['dock_pier', 1460, 300], ['boat_small', 1650, 250], ['ice_chunk', 210, 318], ['ice_chunk', 470, 340, { scale: 0.7 }],
    ['boat_small', 1290, 214, { flip: true, scale: 0.85 }], ['ice_chunk', 1120, 350, { scale: 0.55 }],
    // 해변
    ['lamp_post', 800, 480], ['barrel', 1150, 470], ['crate', 1205, 492], ['crate', 1182, 448, { scale: 0.8 }],
    ['flag_pole', 1250, 530], ['snow_pile_a', 300, 520], ['snow_pile_b', 345, 640], ['bush_snow', 1620, 545], ['bush_snow', 1640, 660],
    ['snow_pile_b', 1720, 600], ['campfire', 520, 590], ['firewood_pile', 430, 650], ['barrel', 640, 520],
    // 광장
    ['lamp_post', ...Z('plaza', -6.6, -6.6)], ['lamp_post', ...Z('plaza', 6.6, -6.6)], ['lamp_post', ...Z('plaza', -0.5, 6.7)],
    ['bench', ...Z('plaza', -1.4, -6.4)], ['barrel', 1590, 812], ['crate', 1565, 838, { scale: 0.85 }],
    ['signpost', 1068, 1214], ['bush_snow', ...Z('plaza', 1.0, 7.3)], ['snow_pile_b', ...Z('plaza', 7.4, 1.5)],
    // 남쪽 마을
    ['chief_lodge', 960, 2400], ['tent_a', 660, 2380], ['tent_a', 1260, 2370, { flip: true }], ['campfire', 870, 2525],
    ['flag_pole', 1345, 2285], ['lamp_post', 700, 2270], ['lamp_post', 1080, 2560], ['firewood_pile', 760, 2500], ['barrel', 1200, 2500],
    ['crate', 1240, 2530], ['bench', 975, 2555], ['hay_bale', 1340, 2470], ['snow_pile_a', 520, 2490], ['bush_snow', 1420, 2480],
    ['snow_pile_b', 780, 2250], ['barrel', 820, 2420],
    // 길가
    ['lamp_post', 1040, 1500], ['lamp_post', 940, 1850], ['signpost', 940, 1520], ['bush_snow', 1052, 1660], ['snow_pile_b', 900, 1720],
    ['barrel', 1050, 1900], ['crate', 920, 2080], ['bush_snow', 900, 1250], ['lamp_post', 920, 1215],
    ['ice_chunk', 1060, 1760, { scale: 0.6 }],
    // 마을 마당의 모닥불 (음유시인 공연 자리)
    ['campfire', 740, 1575],
    // 구역 장식 (해금 후)
    ['firewood_pile', ...Z('forest', -3.4, 1.0), { zone: 'forest' }], ['tree_stump', ...Z('forest', 2.6, -1.2), { zone: 'forest' }],
    ['hay_bale', ...Z('farm', 3.2, 2.6), { zone: 'farm' }], ['hay_bale', ...Z('farm', 3.0, 1.8), { zone: 'farm', scale: 0.85 }], ['barrel', ...Z('farm', -3.3, -2.1), { zone: 'farm' }],
    ['mine_entrance', ...Z('mine', -2.6, 2.6), { zone: 'mine' }], ['crate', ...Z('mine', 2.8, 0.6), { zone: 'mine' }], ['barrel', ...Z('mine', 3.4, -0.4), { zone: 'mine' }],
    ['lamp_post', ...Z('mine', 0.4, 3.9), { zone: 'mine' }],
    ['hay_bale', ...Z('hunt', 2.6, -2.8), { zone: 'hunt' }], ['bush_snow', ...Z('hunt', 3.2, 0.4), { zone: 'hunt' }], ['bush_snow', ...Z('hunt', -2.8, -2.6), { zone: 'hunt' }],
    ['snow_pile_b', ...Z('hunt', 0.4, -3.4), { zone: 'hunt' }],
  ],

  // 가장자리 소나무 숲 (장식, 벨 수 없음): 자동 배치 영역 [x0, y0, x1, y1, 간격]
  borderTrees: [
    [0, 420, 150, 2620, 100], [1650, 420, 1800, 2620, 100], [0, 2560, 760, 2620, 115], [1180, 2560, 1800, 2620, 115],
  ],
  // 그 밖에 흩어진 소나무 [x, y, 종류] (구역 안이나 길 위면 자동으로 빠짐)
  extraTrees: [
    [260, 720, 'tree_pine_snow'], [190, 860, 'tree_pine_a'], [300, 930, 'tree_pine_b'], [1600, 760, 'tree_pine_snow'], [1560, 900, 'tree_pine_a'],
    [1680, 980, 'tree_pine_b'], [880, 1350, 'tree_pine_snow'], [1100, 1460, 'tree_pine_a'], [190, 1560, 'tree_pine_snow'],
    [1660, 1640, 'tree_pine_snow'], [760, 2220, 'tree_pine_a'], [1540, 2300, 'tree_pine_snow'], [330, 2330, 'tree_pine_b'],
    [600, 2570, 'tree_pine_snow'], [1340, 2580, 'tree_pine_a'], [180, 2260, 'tree_pine_a'], [1700, 2230, 'tree_pine_b'],
    [1240, 2260, 'tree_pine_a'], [520, 2240, 'tree_pine_snow'],
  ],

  // 바닥 데칼 [키, x, y, 크기배율, 회전(도)]
  decals: [
    ['decal_snow_drift_a', 360, 660, 1], ['decal_snow_drift_b', 1580, 700, 1], ['decal_snow_drift_a', 760, 1580, 1.1], ['decal_snow_drift_b', 1220, 1590, 1],
    ['decal_snow_drift_a', 1580, 2420, 1], ['decal_snow_drift_b', 330, 2440, 1], ['decal_puddle_ice', 1120, 1520, 1], ['decal_puddle_ice', 640, 2250, 0.9],
    ['decal_dirt_patch', 560, 1720, 0.9], ['decal_dirt_patch', 300, 2120, 1],
    ['decal_footprints', 1010, 1720, 1], ['decal_footprints', 970, 2100, 1], ['decal_footprints', 760, 520, 0.9], ['decal_snow_drift_b', 1250, 1150, 0.8],
  ],

  // ── 마을 생활 (v2, docs/주민기획.md) ─────────────────────
  life: {
    // 새 주민이 걸어 들어오는 마을 입구 (길 그래프의 이름)
    gate: 'gate',
    // 생활 소품 [스프라이트, x, y, { id: 이름, after: '이 단계를 마치면 나타남', flip, scale }]
    // (자리를 옮길 때: 발판·손님 줄·길·일하는 곳과 겹치지 않게)
    props: [
      // 바닷가 왼쪽 모닥불 둘레 통나무 의자 (어르신들이 불을 쬐며 앉아 있음)
      ['log_seat', 520, 536, { id: 'seat_beach_n' }], ['log_seat_y', 425, 561, { id: 'seat_beach_w' }], ['log_seat_x', 615, 561, { id: 'seat_beach_e' }],
      // 광장 서쪽 게시판 (수다 떠는 곳), 광장 남쪽 입구 줄등
      ['notice_board', 470, 812, { id: 'notice' }],
      ['lantern_string', 990, 1182, { id: 'lanterns_s' }],
      // 바닷가 오른쪽 놀이터: 눈사람 자리, 눈 요새, 눈덩이 더미
      ['snowman_0', 1352, 486, { id: 'snowman' }], ['snow_fort', 1530, 612, { id: 'fort' }], ['snowball_pile', 1440, 556, { id: 'pile' }],
      ['sled', 1600, 470, { id: 'sled_beach', after: 'hire_fisherman' }],
      // 광장 동남쪽 강아지 집
      ['dog_house', 1490, 1000, { id: 'doghouse' }],
      // 마을 마당 (숲·밀밭 아래): 모닥불 둘레 의자, 소풍 탁자, 그네, 스케이트장, 이글루, 빨랫줄
      ['log_seat', 740, 1521, { id: 'seat_green_n', after: 'zone_forest' }], ['log_seat_y', 645, 1546, { id: 'seat_green_w', after: 'zone_forest' }],
      ['log_seat_x', 835, 1546, { id: 'seat_green_e', after: 'zone_forest' }], ['music_stand', 640, 1630, { id: 'stand', after: 'hire_lumberjack' }],
      ['picnic_table', 1235, 1555, { id: 'picnic', after: 'zone_farm' }],
      ['kids_swing', 1440, 1610, { id: 'swing', after: 'hire_farmer' }],
      ['ice_rink', 1215, 1700, { id: 'rink', after: 'zone_mine' }],
      ['igloo', 330, 1565, { id: 'igloo', after: 'hire_miner' }],
      ['clothesline', 470, 2440, { id: 'clothes', after: 'zone_hunt' }],
      ['lantern_string', 800, 2290, { id: 'lanterns_v', after: 'zone_hunt' }],
    ],
    // 주민이 머무는 곳: 중심 [x, y], 반지름 r(px), 하는 일 acts, after = 이 단계를 마쳐야 사람들이 감
    //   acts: sit(의자에 앉기) warm(불 쬐기) chat(수다) read(게시판) play(눈싸움·술래잡기·눈사람) wander(산책) concert(공연)
    areas: {
      // stage: 음유시인이 연주하는 자리 (보면대가 없는 모닥불)
      beach_w:   { at: [540, 615], r: 130, acts: ['sit', 'warm', 'chat'], fire: [520, 590], stage: [604, 642] },
      notice:    { at: [520, 870], r: 120, acts: ['read', 'chat'] },
      playground:{ at: [1440, 560], r: 150, acts: ['play', 'chat', 'wander'] },
      plaza_s:   { at: [990, 1210], r: 110, acts: ['chat', 'wander'] },
      doghouse:  { at: [1430, 1030], r: 90, acts: ['chat', 'wander'] },
      green_fire:{ at: [740, 1610], r: 150, acts: ['sit', 'warm', 'chat', 'concert'], fire: [740, 1575], after: 'zone_forest' },
      green_e:   { at: [1280, 1600], r: 170, acts: ['chat', 'play', 'wander', 'sit'], after: 'zone_farm' },
      green_w:   { at: [380, 1610], r: 140, acts: ['chat', 'wander', 'play'], after: 'hire_miner' },
      south:     { at: [990, 2470], r: 220, acts: ['chat', 'sit', 'warm', 'wander'], fire: [870, 2525], stage: [955, 2572], after: 'zone_hunt' },
    },
    // 주민 이사 순서 (balance.js 의 population 과 함께): 단계 이름 -> 이사 오는 주민
    //   목록에 있는 주민의 그림이 아직 없으면 (예: 2차 주민) 건너뛰고 다음 사람이 옴
    moveIns: {
      start: ['npc_grandpa', 'npc_aunt', 'npc_kid_girl', 'npc_kid_prankster', 'pet_dog'],
      first_sale: ['npc_kid_boy'],
      hire_fisherman: ['npc_grandma', 'npc_young_man'],
      zone_forest: ['npc_teen_girl', 'pet_cat', 'npc_postman'],
      hire_lumberjack: ['npc_bard', 'npc_uncle'],
      zone_farm: ['npc_blacksmith', 'npc_fashion', 'npc_chef'],
      hire_farmer: ['npc_herbalist', 'pet_penguin', 'npc_toddler'],
      zone_mine: ['npc_yellow', 'npc_red', 'npc_painter'],
      hire_miner: ['npc_blue', 'npc_doctor'],
      zone_hunt: ['npc_skater', 'npc_guard', 'npc_merchant'],
      hire_hunter: ['npc_captain'],
    },
  },
};

// paths to draw on the snow = road edges that are drawn, walkable or not, and belong to no zone
WORLD.paths = WORLD.roads.edges.filter((e) => !(e[2] && (e[2].draw === false || e[2].zone))).map((e) => {
  const N = WORLD.roads.nodes;
  return [N[e[0]]].concat((e[2] && e[2].via) || [], [N[e[1]]]);
});
