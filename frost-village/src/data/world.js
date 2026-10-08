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
  // (v3) 새 땅의 밭·채석장: 그 땅(region)이 열리면 함께 보임 (잠금 발판 없음)
  field2: { center: [520, 2980],  size: [6.6, 6.6], floor: 'ground_farm',  unlock: null, region: 'south', name: 'z_field2' },
  quarry: { center: [2560, 2060], size: [6.6, 6.6], floor: 'ground_rock',  unlock: null, region: 'se',    name: 'z_quarry' },
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

// 바닷가 선 (y 값보다 위쪽이 바다). WORLD.shore 의 숫자로 계산합니다.
//   (v3) slope: 동쪽(from 보다 오른쪽)으로 갈수록 해안선이 아래로 내려감 = 동쪽 해안 (배 창고가 있는 곳)
export function shoreY(x) {
  const s = WORLD.shore;
  let y = s.base;
  for (const [a, f, ph] of s.waves) y += a * Math.sin(x * f + ph);
  const sl = s.slope;
  if (sl) {
    const d = x - sl.from;
    if (d > 0) y += d < sl.knee ? (sl.k * d * d) / (2 * sl.knee) : sl.k * (d - sl.knee / 2);
  }
  return y;
}

export const WORLD = {
  // (v3) 전체 지도 크기. 처음 마을은 왼쪽 위 1800 x 2620 이고, 나머지는 눈안개(망루를 세우면 열림)
  // (v4) 동쪽으로 넓어짐: 3000 → 6144 (서리역 앞 3000~4150, 솔방울 마을 4150~6144)
  width: 6144,
  height: 3450,

  // 바닷가: y 값보다 위쪽이 바다. 물결 모양 = base + Σ amp*sin(x*freq + phase)
  //   slope: x 가 from 보다 크면 해안선이 k 비율로 내려감 (knee = 부드럽게 꺾이는 길이 px)
  shore: { base: 372, waves: [[16, 0.0052, 0.4], [7, 0.0165, 1.7], [3, 0.041, 0.2]], slope: { from: 1880, knee: 220, k: 0.5 } },

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
    clerk: ['npc_clerk_a', 'villager_c'],          // (v2) 점원 모습: 앞의 그림이 아직 없으면 다음 것 (그림이 오면 바뀜)
  },
  trade: {
    sprite: 'trade_post', x: trade[0], y: trade[1], zone: 'forest',
    shelf: rel(trade, Z('plaza', -4.6, -2.85)),    // 판자/주괴 놓는 발판 (앞쪽)
    cash: rel(trade, Z('plaza', -2.1, -2.75)),     // 상인이 낸 코인
    merchant: [93, 46],                            // (v3) 상인(손님) 위치: 교역소 앞 오른쪽 끝에서 물건을 사 감 (점원은 썰매 뒤 계산대 자리에 섬)
    register: rel(trade, Z('plaza', -6.55, -1.75)),// (v2) 촌장이 서는 계산대 발판 (교역소 왼쪽 끝)
    staff: [61, -21],                              // 점원이 서는 곳 (썰매 뒤 계산대). 그림에 staffPoints 가 있으면 그것을 씀
    clerk: ['npc_clerk_b', 'npc_merchant'],        // (v2) 점원 모습 (위와 같음)
  },
  // 버리기 발판: 위에 잠깐 서 있으면 들고 있는 물건을 모닥불에 던져 버립니다 (어부 고용 후 나타남)
  trash: { x: 560, y: 700, fire: [520, 574] },
  bench: { sprite: 'upgrade_bench', x: bench[0], y: bench[1], pads: { capacity: rel(bench, Z('plaza', 1.55, -4.75)), speed: rel(bench, Z('plaza', 5.65, -4.45)) } },

  // ── 자원 ───────────────────────────────────────────────
  net: { x: 880, y: 398, gather: [0, 86], fisherSpot: [-128, 30] },
  // extra: (v3.5) a few more pines [mx, my] (zone metres) so three lumberjacks find work in the forest
  trees: { zone: 'forest', grid: 2.05, jitter: 0.3, margin: 0.95, scale: 0.9, cornerCut: -5.5, extra: [[0.6, -3.4], [1.0, -0.6], [1.8, -2.4]], avoid: [[sawmill[0], sawmill[1], 170], [sawmill[0] - 104, sawmill[1] - 52, 90], [sawmill[0] + 104, sawmill[1] + 52, 90], [sawmill[0] - 72, sawmill[1] + 36, 120], [sawmill[0] - 120, sawmill[1] + 84, 80], [Z('forest', -3.2, 2.4)[0], Z('forest', -3.2, 2.4)[1], 90]] },
  rocks: [
    // (v3.5 리뷰: 첫 바위를 울타리 옆(-2.6, -0.4)에서 광산 안쪽으로 — 북쪽에서 오면 울타리에 막혔어요)
    [...Z('mine', 1.0, -1.4), 'rock_ore'], [...Z('mine', -0.6, -1.6), 'rock_ore_b'], [...Z('mine', -2.8, -2.8), 'rock_ore_b'],
    [...Z('mine', 0.9, -3.2), 'rock_ore'], [...Z('mine', -0.6, 0.6), 'rock_ore'], [...Z('mine', 2.6, -1.0), 'rock_ore_b'],
    [...Z('mine', -1.2, -3.9), 'rock_ore'],
  ],
  // skip: 비워 두는 밭 칸 [줄, 칸] — 오븐 바로 앞 칸은 빵집 아주머니(와 촌장)가 서서 일하는 자리라 비워 둠 (v3.5 리뷰)
  wheat: { zone: 'farm', origin: Z('farm', 1.6, -1.8), rows: 3, cols: 3, step: 1.5, skip: [[0, 2]] },
  hunt: { zone: 'hunt' },

  // ── 해금 / 고용 발판 ────────────────────────────────────
  //  worker: 고용되는 일꾼, hut: 일꾼 오두막 위치 (구역이 열릴 때 함께 나타남)
  pads: {
    hire_fisherman:  { x: 900,  y: 700,  worker: 'fisherman',  hut: [585, 470] },
    zone_forest:     { x: 760,  y: 1130, zone: 'forest' },
    hire_lumberjack: { x: 790, y: 1215, worker: 'lumberjack', hut: [300, 1010] },   // (v3.5: off the sawmill's input pad)
    zone_farm:       { x: 1190, y: 1135, zone: 'farm' },
    hire_farmer:     { x: 1636, y: 1229, worker: 'farmer',     hut: [1606, 1112] },
    zone_mine:       { x: 760,  y: 1760, zone: 'mine' },
    hire_miner:      { ...P('mine', -0.4, 3.6), worker: 'miner',      hut: [236, 1730] },
    zone_hunt:       { x: 1160, y: 1800, zone: 'hunt' },
    hire_hunter:     { x: 1640, y: 1990, worker: 'hunter',     hut: [1616, 1790] },
    // (v2) 점원 고용: 첫 판매 / 첫 교역 뒤에 나타남. 점원이 있으면 촌장이 계산대에 서 있지 않아도 손님이 돈을 냄
    hire_clerk_market: { x: 1496, y: 794, clerk: 'market' },
    hire_clerk_trade:  { ...P('plaza', -2.6, -3.95), clerk: 'trade' },
    // (v2) 짐꾼 고용: 그 가공소의 일꾼을 고용하면 나타남. 짐꾼이 완성품을 길을 따라 판매대·교역소로 날라 줌
    porter_grill:      { x: 905,  y: 705,  station: 'grill' },
    porter_sawmill:    { x: 790, y: 1215, station: 'sawmill' },
    porter_bakery:     { x: 1636, y: 1229, station: 'bakery' },
    porter_smelter:    { ...P('mine', -0.4, 3.6), station: 'smelter' },
    porter_smokehouse: { x: 1640, y: 1990, station: 'smokehouse' },
  },

  // (v3.5) 분업: 기술자·짐꾼 고용 발판 (한 줄의 발판은 하나씩 차례로 나타나므로 같은 자리를 써요)
  //   op_* = 가공 기술자, raw_* = 재료 짐꾼 (모아두는 곳 → 가공소). 상품 짐꾼은 위의 porter_*
  //   hire3_* = 세 번째 일꾼 (도구 + 코인)
  pads35: {
    op_grill:       { x: 900,  y: 700 },
    raw_grill:      { x: 900,  y: 700 },
    op_sawmill:     { x: 790, y: 1215 },
    raw_sawmill:    { x: 790, y: 1215 },
    op_bakery:      { x: 1636, y: 1229 },
    raw_bakery:     { x: 1636, y: 1229 },
    op_smelter:     { ...P('mine', -0.4, 3.6) },
    raw_smelter:    { ...P('mine', -0.4, 3.6) },
    op_smokehouse:  { x: 1640, y: 1990 },
    raw_smokehouse: { x: 1640, y: 1990 },
    hire3_fisherman:  { x: 985, y: 468 },
    hire3_lumberjack: { x: 720, y: 1415 },
    hire3_farmer:     { x: 1585, y: 1480 },
    hire3_hunter:     { x: 1140, y: 2195 },
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
      village: [990, 2240], tents_w: [620, 2380], tents_e: [1360, 2380], gate: [990, 2560],
      forest_in: [690, 1290], farm_in: [1290, 1290], mine_in: [700, 1960], hunt_in: [1260, 1980],
      beach_w: [690, 610], beach_n: [1000, 500], beach_e: [1300, 572], plaza_e: [1335, 905], gap_n: [1078, 556],
      // (v3) 새 땅의 길 (망루를 세워 그 땅이 열리면 생김)
      east_link: [1600, 930], east_gate: [1830, 950], e_mid: [2120, 980], e_dock: [2270, 790], e_east: [2560, 1180], e_south: [2330, 1290],
      s_gate: [990, 2760], s_cross: [990, 2980], s_w: [600, 3090], s_e: [1360, 3050], s_s: [990, 3290],
      se_n: [2330, 1650], se_c: [2330, 2330], se_s: [2320, 2960], se_gate: [1830, 2400], se_e: [2700, 2420],
      // ---- (v4-A) 역 가는 길 (동쪽 해안 → 서리역 광장). 그 너머 길은 WORLD.v4.walk 에서 자동으로 만들어져요
      v_link_w: [2640, 1139], v_link_e: [3184, 1411],
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
      ['village', 'gate'],
      // 구역 안 길 (구역이 열리면 나타남)
      ['forest_gate', 'forest_in', { zone: 'forest' }], ['farm_gate', 'farm_in', { zone: 'farm' }],
      ['mine_gate', 'mine_in', { zone: 'mine' }], ['hunt_gate', 'hunt_in', { zone: 'hunt' }],
      // (v3) 새 땅의 길: region = 이 땅이 열려야 생김
      ['plaza_e', 'east_link', { region: 'east' }], ['east_link', 'east_gate', { region: 'east' }], ['east_gate', 'e_mid', { region: 'east' }],
      ['e_mid', 'e_dock', { region: 'east', via: [[2200, 880]] }], ['e_mid', 'e_south', { region: 'east', via: [[2230, 1150]] }], ['e_south', 'e_east', { region: 'east' }],
      ['gate', 's_gate', { region: 'south' }], ['s_gate', 's_cross', { region: 'south' }], ['s_cross', 's_w', { region: 'south', via: [[800, 3040]] }],
      ['s_cross', 's_e', { region: 'south', via: [[1180, 3010]] }], ['s_cross', 's_s', { region: 'south' }],
      ['e_south', 'se_n', { region: 'se' }], ['se_n', 'se_c', { region: 'se', via: [[2360, 2000]] }], ['se_c', 'se_s', { region: 'se', via: [[2300, 2650]] }],
      ['tents_e', 'se_gate', { region: 'se', via: [[1600, 2400]] }], ['se_gate', 'se_c', { region: 'se', via: [[2080, 2360]] }], ['se_c', 'se_e', { region: 'se' }],
      // ---- (v4-A) 역 가는 길
      ['e_east', 'v_link_w', { region: 'rail' }], ['v_link_w', 'v_link_e', { region: 'rail' }],
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
    ['bench', ...Z('plaza', -1.4, -6.4)], ['barrel', 1545, 800], ['crate', 1522, 826, { scale: 0.85 }],
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
    // (v3.5: 숲의 장작 더미와 밭의 작은 짚더미는 '모아두는 곳'(labour.piles)의 소품이 되었어요)
    ['tree_stump', ...Z('forest', 2.6, -1.2), { zone: 'forest' }],
    ['hay_bale', ...Z('farm', 3.2, 2.6), { zone: 'farm' }], ['barrel', ...Z('farm', -3.3, -2.1), { zone: 'farm' }],
    ['mine_entrance', ...Z('mine', -2.6, 2.6), { zone: 'mine' }],   // (v3.5: the crate and barrel went to the ore pile / out of the blacksmith's way)
    ['lamp_post', ...Z('mine', 0.4, 3.9), { zone: 'mine' }],
    ['hay_bale', ...Z('hunt', 2.6, -2.8), { zone: 'hunt' }], ['bush_snow', ...Z('hunt', 3.2, 0.4), { zone: 'hunt' }], ['bush_snow', ...Z('hunt', -2.8, -2.6), { zone: 'hunt' }],
    ['snow_pile_b', ...Z('hunt', 0.4, -3.4), { zone: 'hunt' }],
    // (v3) 새 땅의 장식 (그 땅이 열리면 보임)
    // 동쪽 해안: 부두 마을
    ['signpost', 1880, 1005, { region: 'east' }], ['lamp_post', 2010, 905, { region: 'east' }], ['lamp_post', 2230, 1060, { region: 'east' }],
    ['barrel', 2150, 690, { region: 'east' }], ['crate', 2180, 712, { region: 'east' }], ['crate', 2158, 735, { region: 'east', scale: 0.8 }],
    ['ice_chunk', 2620, 520, { region: 'east' }], ['ice_chunk', 2380, 420, { region: 'east', scale: 0.7 }], ['boat_small', 2760, 560, { region: 'east', flip: true, scale: 0.9 }],
    ['firewood_pile', 2440, 1310, { region: 'east' }], ['tree_stump', 2700, 1360, { region: 'east' }], ['tree_stump', 2580, 1400, { region: 'east' }],
    ['bush_snow', 1960, 1120, { region: 'east' }], ['snow_pile_a', 2440, 1440, { region: 'east' }], ['snow_pile_b', 2860, 880, { region: 'east' }],
    ['campfire', 2060, 790, { region: 'east' }], ['bench', 2330, 960, { region: 'east' }], ['flag_pole', 2480, 760, { region: 'east' }],
    // 남쪽 들판: 밭과 쉼터
    ['hay_bale', 840, 2900, { region: 'south' }], ['hay_bale', 880, 2930, { region: 'south', scale: 0.85 }], ['hay_bale', 260, 3260, { region: 'south' }],
    ['lamp_post', 1060, 2920, { region: 'south' }], ['lamp_post', 920, 3200, { region: 'south' }], ['signpost', 1060, 3060, { region: 'south' }],
    ['barrel', 640, 2760, { region: 'south' }], ['crate', 670, 2785, { region: 'south' }], ['bush_snow', 1560, 2780, { region: 'south' }],
    ['snow_pile_a', 420, 3290, { region: 'south' }], ['snow_pile_b', 1640, 3100, { region: 'south' }], ['campfire', 560, 2700, { region: 'south' }],
    ['bench', 640, 2668, { region: 'south' }],
    // 동남쪽 언덕: 채석장과 언덕 마을
    ['mine_entrance', 2770, 1960, { region: 'se' }], ['crate', 2380, 1880, { region: 'se' }], ['barrel', 2410, 1905, { region: 'se' }],
    ['lamp_post', 2420, 2240, { region: 'se' }], ['lamp_post', 2260, 2700, { region: 'se' }], ['signpost', 2250, 2400, { region: 'se' }],
    ['tree_stump', 2150, 1960, { region: 'se' }], ['snow_pile_a', 2600, 2350, { region: 'se' }], ['snow_pile_b', 1980, 3200, { region: 'se' }],
    ['bush_snow', 2850, 2520, { region: 'se' }], ['bush_snow', 2200, 3150, { region: 'se' }], ['firewood_pile', 2480, 2520, { region: 'se' }],
    ['campfire', 2440, 2620, { region: 'se' }], ['ice_chunk', 2750, 3220, { region: 'se', scale: 0.6 }],
  ],

  // 가장자리 소나무 숲 (장식, 벨 수 없음): 자동 배치 영역 [x0, y0, x1, y1, 간격, (v3) 이 땅이 열려야 보임]
  borderTrees: [
    [0, 420, 150, 2620, 100], [1650, 420, 1800, 2620, 100], [0, 2560, 760, 2620, 115], [1180, 2560, 1800, 2620, 115],
    // (v4) 7번째 값 = 이 땅이 열리면 사라지는 나무 (동쪽 끝 숲은 서리역 앞 땅이 열리면 비켜 줌)
    [2880, 300, 3000, 1500, 100, 'east', 'rail'], [2880, 1500, 3000, 3450, 100, 'se', 'rail'], [1800, 3380, 3000, 3450, 115, 'se'],
    [0, 2620, 150, 3450, 100, 'south'], [0, 3380, 1800, 3450, 115, 'south'],
    // ---- (v4-A) 서리역 앞·솔방울 마을의 가장자리 숲
    [3000, 3380, 4150, 3450, 115, 'rail'], [4150, 3380, 6144, 3450, 115, 'town'], [6024, 300, 6144, 3450, 100, 'town'],
  ],
  // 그 밖에 흩어진 소나무 [x, y, 종류] (구역 안이나 길 위면 자동으로 빠짐)
  extraTrees: [
    [260, 720, 'tree_pine_snow'], [190, 860, 'tree_pine_a'], [300, 930, 'tree_pine_b'], [1600, 760, 'tree_pine_snow'], [1560, 900, 'tree_pine_a'],
    [1680, 980, 'tree_pine_b'], [880, 1350, 'tree_pine_snow'], [1100, 1460, 'tree_pine_a'], [190, 1560, 'tree_pine_snow'],
    [1660, 1640, 'tree_pine_snow'], [760, 2220, 'tree_pine_a'], [1540, 2300, 'tree_pine_snow'], [330, 2330, 'tree_pine_b'],
    [600, 2570, 'tree_pine_snow'], [1340, 2580, 'tree_pine_a'], [180, 2260, 'tree_pine_a'], [1700, 2230, 'tree_pine_b'],
    [1240, 2260, 'tree_pine_a'], [520, 2240, 'tree_pine_snow'],
    // (v3) 새 땅의 소나무 [x, y, 종류, 땅]
    [1960, 1380, 'tree_pine_a', 'east'], [2120, 1420, 'tree_pine_snow', 'east'], [1900, 760, 'tree_pine_b', 'east'], [2480, 860, 'tree_pine_snow', 'east'],
    [2700, 840, 'tree_pine_a', 'east'], [2250, 1440, 'tree_pine_b', 'east'],
    [300, 2780, 'tree_pine_snow', 'south'], [180, 3150, 'tree_pine_a', 'south'], [1650, 2760, 'tree_pine_b', 'south'], [1700, 3020, 'tree_pine_snow', 'south'],
    [880, 2800, 'tree_pine_a', 'south'], [1660, 3250, 'tree_pine_b', 'south'], [1240, 2720, 'tree_pine_snow', 'south'],
    [1980, 1700, 'tree_pine_snow', 'se'], [2700, 1700, 'tree_pine_a', 'se'], [2850, 2250, 'tree_pine_b', 'se'], [1950, 2600, 'tree_pine_a', 'se'],
    [2820, 2950, 'tree_pine_a', 'se'], [2150, 2150, 'tree_pine_snow', 'se'], [2480, 2860, 'tree_pine_b', 'se'],
  ],

  // 바닥 데칼 [키, x, y, 크기배율, 회전(도)]
  decals: [
    ['decal_snow_drift_a', 360, 660, 1], ['decal_snow_drift_b', 1580, 700, 1], ['decal_snow_drift_a', 760, 1580, 1.1], ['decal_snow_drift_b', 1220, 1590, 1],
    ['decal_snow_drift_a', 1580, 2420, 1], ['decal_snow_drift_b', 330, 2440, 1], ['decal_puddle_ice', 1120, 1520, 1], ['decal_puddle_ice', 640, 2250, 0.9],
    ['decal_dirt_patch', 560, 1720, 0.9], ['decal_dirt_patch', 300, 2120, 1],
    ['decal_footprints', 1010, 1720, 1], ['decal_footprints', 970, 2100, 1], ['decal_footprints', 760, 520, 0.9], ['decal_snow_drift_b', 1250, 1150, 0.8],
  ],

  // ── (v3) 땅 넓히기 ───────────────────────────────────────
  //  rect: [왼쪽 x, 위 y, 오른쪽 x, 아래 y]. 처음엔 start 만 보이고, 나머지는 눈안개로 덮여 있음.
  //  tower: 이 땅을 여는 망루, center: 안개가 걷힐 때 카메라가 비추는 곳
  territory: {
    start: { rect: [0, 0, 1800, 2620] },
    east:  { rect: [1800, 0, 3000, 1500], tower: 'tower_east', name: 'r_east', center: [2330, 1020] },
    south: { rect: [0, 2620, 1800, 3450], tower: 'tower_south', name: 'r_south', center: [960, 3000] },
    se:    { rect: [1800, 1500, 3000, 3450], tower: 'tower_se', name: 'r_se', center: [2360, 2380] },
    // ---- (v4-A) 서리역 앞: 동쪽 망루에 불이 켜질 때 east 와 함께 열려요 (openWith)
    rail:  { rect: [3000, 0, 4150, 3450], name: 'r_rail', center: [3420, 1560], openWith: 'east' },
    // ---- (v4-A) 솔방울 마을: 촌장님 초대(첫 가게 개업 뒤)로 열려요 (openFlag)
    town:  { rect: [4150, 0, 6144, 3450], name: 'r_town', center: [4900, 2450], openFlag: 'townInvite' },
  },
  // 망루 공사장 (x, y = 망루 중심). 비용 발판은 공사장 앞(자재 내려놓는 곳)에 생김
  //   in: 이 땅이 열려 있어야 발판이 나타남 (없으면 처음 마을)
  towers: {
    tower_east:  { x: 1660, y: 845, region: 'east' },
    tower_south: { x: 1450, y: 2505, region: 'south' },
    tower_se:    { x: 2870, y: 1370, region: 'se', in: 'east' },
  },
  // 빈 건설 부지: size S(2x2m, 집) / M(3x3m, 모든 건물) / L(4x4m, 모든 건물 + 장식)
  //   region: 이 땅이 열리면 나타남, after: 이 단계를 마치면 나타남, only: 이 건물만 지을 수 있음,
  //   shore: (바닷가 부지) 해안선에서 이만큼 아래 (y 대신)
  plots: {
    v_house1: { x: 1600, y: 2235, size: 'S', region: 'start', after: 'hire_miner' },
    v_house2: { x: 430, y: 2310, size: 'S', region: 'start', after: 'hire_miner' },
    e_dock:   { x: 2330, shore: 46, size: 'M', region: 'east', only: 'boathouse' },
    e_m1:     { x: 2040, y: 1190, size: 'M', region: 'east' },
    e_m2:     { x: 2520, y: 985, size: 'M', region: 'east' },
    s_m1:     { x: 1360, y: 2860, size: 'M', region: 'south' },
    s_m2:     { x: 1470, y: 3235, size: 'M', region: 'south' },
    s_l1:     { x: 780, y: 3220, size: 'L', region: 'south' },
    s_s1:     { x: 1160, y: 3190, size: 'S', region: 'south' },
    se_m1:    { x: 2700, y: 2640, size: 'M', region: 'se' },
    se_l1:    { x: 2060, y: 2860, size: 'L', region: 'se' },
    se_s1:    { x: 2560, y: 3090, size: 'S', region: 'se' },
    se_s3:    { x: 2560, y: 1700, size: 'S', region: 'se' },
    se_s2:    { x: 2060, y: 1820, size: 'S', region: 'se' },
    // ---- (v4-A) 눈에 덮인 옛 기차역 (XL 부지, 서리역만 고칠 수 있음). drop = 자재 내려놓는 발판 (승격식 발판 자리)
    r_station: { x: 3410, y: 1330, size: 'XL', region: 'rail', only: 'station', drop: [3200, 1441] },
  },
  // 새 땅의 자원: 벨 수 있는 소나무, 광석 바위, 밀밭 (그 땅이 열리면 나타남)
  regionTrees: [
    // 동쪽 해안 숲 ((v4) [2720, 1240] 소나무는 '역 가는 길' 바로 옆이라 뺐어요)
    [2620, 1290, 'tree_pine_a', 'east'], [2690, 1360, 'tree_pine_b', 'east'], [2590, 1420, 'tree_pine_a', 'east'],
    [2780, 1420, 'tree_pine_snow', 'east'], [2950, 1150, 'tree_pine_b', 'east'], [2930, 1010, 'tree_pine_a', 'east'],
    // 남쪽 들판의 작은 숲
    [230, 2860, 'tree_pine_snow', 'south'], [320, 2940, 'tree_pine_a', 'south'], [220, 3020, 'tree_pine_b', 'south'], [300, 3150, 'tree_pine_snow', 'south'],
    // 동남쪽 언덕 숲
    [2770, 1900, 'tree_pine_a', 'se'], [2860, 1990, 'tree_pine_snow', 'se'], [2780, 2090, 'tree_pine_b', 'se'], [2880, 2140, 'tree_pine_a', 'se'],
  ],
  regionRocks: [
    [...Z('quarry', -1.6, -0.6), 'rock_ore'], [...Z('quarry', 0.4, -1.8), 'rock_ore_b'], [...Z('quarry', 1.6, 0.2), 'rock_ore'],
    [...Z('quarry', -0.6, 1.4), 'rock_ore_b'], [...Z('quarry', -1.9, -2.2), 'rock_ore'],
  ],
  regionWheat: { zone: 'field2', origin: Z('field2', 0, 0), rows: 3, cols: 3, step: 1.6 },

  // (v3) 광산 식량 상자: 광부가 빵·훈제 고기를 먹어야 광석을 캠
  foodBox: { x: 690, y: 1752 },
  // (v3) 도구가 있어야 고용되는 두 번째 일꾼 발판 (x, y) — 코인 + 도구 1개
  pads2: {
    hire2_fisherman:  { x: 985, y: 468, worker: 'fisherman', tool: 'item_rod' },
    hire2_lumberjack: { x: 720, y: 1415, worker: 'lumberjack', tool: 'item_axe' },
    hire2_farmer:     { x: 1585, y: 1480, worker: 'farmer', tool: 'item_sickle' },
    hire2_miner:      { x: 835, y: 1800, worker: 'miner', tool: 'item_pickaxe' },
    hire2_hunter:     { x: 1140, y: 2195, worker: 'hunter', tool: 'item_bow' },
  },
  // 보트 창고 기준 위치 (px): 배 사기 발판, 배가 나가는 바닷길 (정박 지점 기준), 고기 잡는 곳
  boathouse: {
    boatPad: [-196, 52],
    route: [[90, -110], [190, -250], [230, -420]],
    fishArea: [240, -470, 150],
  },
  // ── (v3.5) 분업: 가공소 작업 자리와 모아두는 곳 ──────────────────────
  //  ops: 가공소마다 (가공소 중심 기준 px)
  //    pad = 촌장이 서서 직접 가공하는 작업 자리, op = 고용한 기술자가 서는 곳, dir = 기술자가 바라보는 방향
  //    (S 남·SE·E 동·NE·N 북·NW·W 서·SW), who = 기술자 캐릭터, chiefAnim = 촌장이 일할 때 동작
  //    (give 두 손으로 내려놓기 / chop 도끼질 / mine 망치질 / harvest 손놀림 / idle 가만히 바라봄), chiefDir = 촌장이 바라보는 방향 (없으면 가공소 쪽)
  //  piles: 일꾼이 잡은 것을 모아두는 곳 (x, y = 발판), prop = 옆에 놓는 소품 (rack = 고기 걸이), propAt = 소품 위치 (발판 기준)
  //         labelY = 이름표 높이 (발판 기준, 없으면 -92)
  labour: {
    ops: {
      //  (v3.5 리뷰: 촌장은 등을 돌리지 않고 옆모습·앞모습으로 일해요 — give = 두 손으로 내려놓기, 반복)
      grill:      { pad: [-70, 35],  op: [57, -28],  dir: 'SW', who: 'npc_chef',       chiefAnim: 'give', chiefDir: 'SE' },
      sawmill:    { pad: [-72, 36],  op: [54, -27],  dir: 'SW', who: 'npc_sawyer',     chiefAnim: 'chop', chiefDir: 'SE' },
      bakery:     { pad: [2, 64],    op: [10, 50],   dir: 'S',  who: 'npc_aunt',       chiefAnim: 'give', chiefDir: 'SE' },
      smelter:    { pad: [-14, 66],  op: [-6, 48],   dir: 'S',  who: 'npc_blacksmith', chiefAnim: 'mine', chiefDir: 'SE' },
      smokehouse: { pad: [-10, 66],  op: [-22, 46],  dir: 'S',  who: 'npc_smoker',     chiefAnim: 'give', chiefDir: 'SE' },
      // (v3 건물: 부지 중심 기준) 대장간은 광부 영감이 모루 앞에서 도구를 두드려요
      toolsmith:  { pad: [-70, 66],  op: [-66, 8],   dir: 'E',  who: 'miner_b',        chiefAnim: 'mine', chiefDir: 'SE' },
      cannery:    { pad: [-60, 70],  op: [-44, 20],  dir: 'E',  who: 'npc_cannery',    chiefAnim: 'give', chiefDir: 'SE' },
    },
    piles: {
      fish:  { x: 772, y: 532, item: 'item_fish_raw', station: 'grill', worker: 'fisherman', prop: 'barrel', propAt: [-52, -18], zone: 'plaza' },
      log:   { ...P('forest', -1.55, -1.55), item: 'item_log', station: 'sawmill', worker: 'lumberjack', prop: 'firewood_pile', propAt: [-58, -22], propR: 30, zone: 'forest' },
      wheat: { ...P('farm', 2.5, 1.1), item: 'item_wheat', station: 'bakery', worker: 'farmer', prop: 'hay_bale', propAt: [56, -20], propR: 26, zone: 'farm' },
      ore:   { ...P('mine', -1.4, 0.8), item: 'item_ore', station: 'smelter', worker: 'miner', prop: 'crate', propAt: [46, -30], propR: 24, zone: 'mine' },   // (v3.5 리뷰: 상자를 뒤로 — 서쪽 바위로 가는 길을 막지 않게)
      meat:  { ...P('hunt', 2.6, -0.6), item: 'item_meat_raw', station: 'smokehouse', worker: 'hunter', prop: 'rack', propAt: [-84, -4], labelY: -100, zone: 'hunt' },
    },
  },

  // 두 번째 일꾼이 쉬는 곳 (첫 일꾼 자리에서 이만큼 떨어짐)
  worker2Offset: [52, 26],

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
      // (v3) 새 땅의 쉼터 (그 땅이 열리면 나타남)
      ['log_seat', 2060, 740, { id: 'seat_east_n', after: 'r:east' }], ['log_seat_y', 1965, 765, { id: 'seat_east_w', after: 'r:east' }],
      ['picnic_table', 470, 2760, { id: 'picnic_s', after: 'r:south' }], ['sled', 700, 2840, { id: 'sled_s', after: 'r:south' }],
      ['log_seat', 2440, 2570, { id: 'seat_se_n', after: 'r:se' }], ['log_seat_x', 2535, 2595, { id: 'seat_se_e', after: 'r:se' }],
      ['igloo', 2120, 2420, { id: 'igloo_se', after: 'r:se' }], ['snow_fort', 2620, 2860, { id: 'fort_se', after: 'r:se' }],
    ],
    // 주민이 머무는 곳: 중심 [x, y], 반지름 r(px), 하는 일 acts, after = 이 단계를 마쳐야 사람들이 감
    //   acts: sit(의자에 앉기) warm(불 쬐기) chat(수다) read(게시판) play(눈싸움·술래잡기·눈사람) wander(산책) concert(공연)
    areas: {
      // stage: 음유시인이 연주하는 자리 (보면대가 없는 모닥불)
      beach_w:   { at: [540, 615], r: 130, acts: ['sit', 'warm', 'chat'], fire: [520, 590], stage: [432, 506] },
      notice:    { at: [520, 870], r: 120, acts: ['read', 'chat'] },
      playground:{ at: [1440, 560], r: 150, acts: ['play', 'chat', 'wander'] },
      plaza_s:   { at: [990, 1210], r: 110, acts: ['chat', 'wander'] },
      doghouse:  { at: [1430, 1030], r: 90, acts: ['chat', 'wander'] },
      green_fire:{ at: [740, 1610], r: 150, acts: ['sit', 'warm', 'chat', 'concert'], fire: [740, 1575], after: 'zone_forest' },
      green_e:   { at: [1280, 1600], r: 170, acts: ['chat', 'play', 'wander', 'sit'], after: 'zone_farm' },
      green_w:   { at: [380, 1610], r: 140, acts: ['chat', 'wander', 'play'], after: 'hire_miner' },
      south:     { at: [990, 2470], r: 220, acts: ['chat', 'sit', 'warm', 'wander'], fire: [870, 2525], stage: [955, 2572], after: 'zone_hunt' },
      // (v3) 새 땅 (망루를 세워 열리면 주민들이 놀러 감)
      east_dock: { at: [2080, 830], r: 140, acts: ['sit', 'warm', 'chat', 'wander'], fire: [2060, 790], after: 'r:east' },
      south_fields: { at: [560, 2730], r: 140, acts: ['chat', 'wander', 'warm', 'play'], fire: [560, 2700], after: 'r:south' },
      se_hill:   { at: [2400, 2650], r: 170, acts: ['sit', 'warm', 'chat', 'play', 'wander'], fire: [2440, 2620], after: 'r:se' },
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

// paths to draw on the snow = road edges that are drawn, walkable or not, and belong to no zone / new land
WORLD.paths = WORLD.roads.edges.filter((e) => !(e[2] && (e[2].draw === false || e[2].zone || e[2].region))).map((e) => {
  const N = WORLD.roads.nodes;
  return [N[e[0]]].concat((e[2] && e[2].via) || [], [N[e[1]]]);
});
// (v3) every drawn road, also the ones of zones / new land (decor trees keep clear of them)
WORLD.allPaths = WORLD.roads.edges.filter((e) => !(e[2] && e[2].draw === false)).map((e) => {
  const N = WORLD.roads.nodes;
  return [N[e[0]]].concat((e[2] && e[2].via) || [], [N[e[1]]]);
});
// (v3) plots on the shore: y follows the shoreline
for (const id in WORLD.plots) { const pl = WORLD.plots[id]; if (pl.shore !== undefined && pl.y === undefined) pl.y = Math.round(shoreY(pl.x) + pl.shore); }

// =====================================================================
// ---- (v4-A) 이웃 마을 솔방울 마을 · 눈썰매 기차 · 서리역 앞 (docs/v4_plan.md §3)
//  v4 의 모든 것은 '도로 격자' 위에 있어요: 한 칸 = √2 m = 화면 128 x 64 마름모.
//    L(i, j) = (3120 + 64·(i + j),  1315 + 32·(i − j))
//    i = 화면 오른쪽 아래로 (기찻길 방향),  j = 화면 오른쪽 위로 (바다 쪽이 +)
//  기찻길은 j = 0 줄이에요. 건물은 모두 j 가 작은 쪽(화면 왼쪽 아래)을 바라봐요.
//  자리를 옮길 때는 i, j 만 고치면 x, y 는 자동으로 계산돼요.
//  (고친 뒤: node tools/test/v4_layout.mjs 로 겹치는 곳이 없는지 확인하세요)
// =====================================================================
const G4 = [3120, 1315];
/** 격자 (i, j) → 화면 px [x, y] */
export function L4(i, j) { return [Math.round(G4[0] + 64 * (i + j)), Math.round(G4[1] + 32 * (i - j))]; }
/** 화면 px → 격자 { i, j } */
export function px2L4(x, y) { const a = (x - G4[0]) / 64, b = (y - G4[1]) / 32; return { i: (a + b) / 2, j: (a - b) / 2 }; }
const at4 = (o) => { const [x, y] = L4(o.i, o.j); return Object.assign(o, { x, y }); };

WORLD.v4 = {
  G: G4,
  // ── 기찻길 (j = 0 줄). 타일 k 는 칸 [k, k+1) 을 덮음. from/to = 첫·마지막 타일 (끝에는 차막이)
  //    crossings = 건널목 타일 (사람은 여기서만 기찻길을 건너요). sign = 동쪽 끝 표지판 (v6 갈매기 항구)
  rail: { j: 0, from: -1, to: 46, crossings: [8, 33], sign: { i: 46.6, j: -1.2 } },
  // ── 역 (기차가 서는 곳). carA = 손님 칸(앞 객차)이 서는 i. 기관차는 늘 서쪽(마을 쪽) 끝에 있어요
  stations: {
    ours: at4({ key: 'train_station', i: 2.5, j: 2.03, carA: 2.5, plot: 'r_station', name: 'stn_ours' }),   // 서리역
    town: at4({ key: 'train_station', i: 28.0, j: 2.03, carA: 28.0, name: 'stn_town' }),                    // 솔방울역
  },
  // ── 역 광장의 발판들 (B 가 씀): 짐 싣는 곳, 주문판, 역 금고, 역 짐꾼 고용, 승격식
  square: {
    cargo: at4({ i: 4.1, j: -1.8 }), board: at4({ i: 2.6, j: -2.4 }), cash: at4({ i: 6.3, j: -1.6 }),
    porter: at4({ i: 7.6, j: -2.4 }), rank: at4({ i: 2.6, j: -1.35 }),
  },
  // ── 가게·집 부지 (B 가 씀). size: M 가게, L 큰 가게, S 집. m = [X m, Y m]
  lots: {
    lotA1: at4({ i: 9.65, j: -1.9, size: 'M', m: [3.4, 3.0] }), lotA2: at4({ i: 12.3, j: -1.9, size: 'M', m: [3.4, 3.0] }), lotA3: at4({ i: 14.95, j: -1.9, size: 'M', m: [3.4, 3.0] }),
    lotB1: at4({ i: 12.8, j: -10.25, size: 'M', m: [3.4, 3.0] }), lotB2: at4({ i: 15.45, j: -10.25, size: 'M', m: [3.4, 3.0] }), lotB3: at4({ i: 18.1, j: -10.25, size: 'M', m: [3.4, 3.0] }),
    lotB5: at4({ i: 21.2, j: -10.25, size: 'L', m: [4.4, 3.4] }),
    lotH1: at4({ i: 16.0, j: -15.2, size: 'S', m: [2.6, 2.6] }), lotH2: at4({ i: 18.4, j: -15.2, size: 'S', m: [2.6, 2.6] }), lotH3: at4({ i: 20.8, j: -15.2, size: 'S', m: [2.6, 2.6] }),
    lotH4: at4({ i: 25.5, j: -15.2, size: 'S', m: [2.6, 2.6] }), lotH5: at4({ i: 27.9, j: -15.2, size: 'S', m: [2.6, 2.6] }),
  },
  // ── 길 (B 의 RoadNet 이 칠하고, 사람·탈것이 다녀요).
  //    corridor = 영원히 비워 두는 칸 (i: [시작, 끝], j: [시작, 끝]), paint = v4 에 칠하는 칸 (j 또는 i 범위), cls = 길 종류
  //    walk = 사람이 걷는 선 (X 길: j 값, Y 길: i 값)
  streets: [
    { id: 'link',      axis: 'x', i: [-6.5, 2.0],  j: [-1.5, -0.5],  cls: 'path',   name: 'st_link' },                             // 역 가는 길 (v2 길로 그려요)
    { id: 'square',    axis: 'x', i: [2.0, 8.3],   j: [-3.0, -0.75], cls: 'square', walk: -1.6, walkSpan: [2.0, 8.5], name: 'st_square' },  // 역 광장
    { id: 'main',      axis: 'x', i: [8.0, 49.5],  j: [-9.0, -3.0],  cls: 'dirt',   paint: [-6.0, -4.0], walk: -4.5, walkSpan: [8.2, 49.5], name: 'st_main' },   // 역앞 거리 → 솔방울 큰길
    { id: 'back',      axis: 'x', i: [13.0, 50.0], j: [-14.0, -12.0], cls: 'dirt',  paint: [-14.0, -12.0], walk: -13.0, name: 'st_back' },   // 뒷길 / 학교길
    { id: 'ave',       axis: 'y', i: [30.0, 34.0], j: [-18.0, -9.0], cls: 'dirt',   paint: [30.0, 34.0], walk: 30.4, walkSpan: [-17.5, -4.5], name: 'st_ave' },  // 솔방울 중앙로
    { id: 'shopalley', axis: 'y', i: [23.3, 24.3], j: [-18.0, -9.0], cls: 'path',   walk: 23.8, walkSpan: [-17.5, -4.5], name: 'st_shopalley' },          // 가게 골목
    { id: 'homes',     axis: 'x', i: [17.0, 30.0], j: [-18.0, -17.0], cls: 'path',  walk: -17.5, walkSpan: [17.0, 30.4], name: 'st_homes' },   // 집 앞길
    { id: 'apts',      axis: 'x', i: [34.0, 47.0], j: [-18.0, -17.0], cls: 'path',  walk: -17.5, walkSpan: [30.4, 47.0], name: 'st_apts' },   // 아파트 앞길
    { id: 'alley_t',   axis: 'y', i: [33.0, 34.0], j: [-3.0, -0.75], cls: 'path',   walk: 33.5, walkSpan: [-4.5, -0.75], name: 'st_alley' },   // 역 골목
    { id: 'platform_e', axis: 'x', i: [30.5, 34.0], j: [0.75, 1.75], cls: 'path',   walk: 1.25, walkSpan: [25.6, 33.5], name: 'st_platform' }, // 솔방울역 승강장 → 승강장 끝길
    { id: 'xing_ours', axis: 'y', i: [8.0, 9.0],   j: [-0.75, 1.0],  cls: 'xing',   walk: 8.5, walkSpan: [-1.6, 1.0], xing: 8, name: 'st_xing' },     // 건널목 (서리역)
    { id: 'xing_town', axis: 'y', i: [33.0, 34.0], j: [-0.75, 1.0],  cls: 'xing',   walk: 33.5, walkSpan: [-0.75, 1.25], xing: 33, name: 'st_xing' }, // 건널목 (솔방울역)
  ],
  // ── 사람이 걷는 선 (위 길 말고 더 필요한 연결). [축, 고정값, 시작, 끝]
  //    x 축: j 고정, i 시작~끝 / y 축: i 고정, j 시작~끝
  walkExtra: [
    ['y', 2.0, -1.6, -1.0],    // 역 가는 길 끝(v_link_e) → 역 광장
    ['x', 1.0, 0.8, 8.5],      // 서리역 승강장 → 동쪽 끝 → 건널목
    ['y', 8.2, -4.5, -1.6],    // 역 광장 → 역앞 거리
  ],
  // ── 솔방울 마을 건물 21채 (+ 마을 입구). role: 하는 일 (주민 일정이 씀), home: 사는 사람 수
  town: {
    buildings: [
      at4({ id: 't_station', key: 'train_station', i: 28.0, j: 2.03, role: 'station', home: 1 }),
      at4({ id: 't_police',  key: 'police_box', i: 31.6, j: 2.6, role: 'police', label: 'tb_police' }),
      at4({ id: 't_cafe',    key: 'cafe', i: 21.0, j: -1.9, role: 'shop', home: 2 }),
      at4({ id: 't_book',    key: 'bookstore', i: 23.5, j: -1.9, role: 'shop', home: 1 }),
      at4({ id: 't_play',    key: 'playground', i: 26.4, j: -1.9, role: 'play' }),
      at4({ id: 't_fountain', key: 'park_fountain', i: 29.5, j: -1.9, role: 'park' }),
      at4({ id: 't_sled',    key: 'sled_stop', i: 31.7, j: -1.9, role: 'stop' }),
      at4({ id: 't_toy',     key: 'toy_shop', i: 35.3, j: -1.9, role: 'shop', home: 1 }),
      at4({ id: 't_cloth',   key: 'clothing_store', i: 37.9, j: -1.9, role: 'shop', home: 2 }),
      at4({ id: 't_flower',  key: 'flower_shop', i: 40.5, j: -1.9, role: 'shop', home: 1 }),
      at4({ id: 't_hair',    key: 'hair_salon', i: 43.1, j: -1.9, role: 'shop', home: 1 }),
      at4({ id: 't_rest',    key: 'restaurant', i: 45.8, j: -1.9, role: 'shop', home: 2 }),
      at4({ id: 't_post',    key: 'post_office', i: 35.5, j: -10.5, role: 'post' }),
      at4({ id: 't_school',  key: 'school', i: 39.3, j: -10.5, role: 'school' }),
      at4({ id: 't_hall',    key: 'town_hall', i: 43.5, j: -10.5, role: 'hall', home: 3 }),
      at4({ id: 't_clinic',  key: 'clinic', i: 46.8, j: -10.5, role: 'clinic' }),
      at4({ id: 't_fire',    key: 'fire_station', i: 49.9, j: -10.5, role: 'fire', home: 2 }),
      at4({ id: 't_apt1',    key: 'apartment_a', i: 35.7, j: -15.3, role: 'home', home: 24 }),
      at4({ id: 't_apt2',    key: 'apartment_b', i: 38.95, j: -15.3, role: 'home', home: 18 }),
      at4({ id: 't_apt3',    key: 'apartment_a', i: 42.2, j: -15.3, role: 'home', home: 24 }),
      at4({ id: 't_apt4',    key: 'apartment_b', i: 45.45, j: -15.3, role: 'home', home: 18 }),
      // 마을 입구 (서리역 앞 땅에 서 있어서 기찻길을 찾았을 때부터 보여요). board = 간판 글자
      at4({ id: 't_gate', key: 'town_gate', i: 18.05, j: -2.2, role: 'gate', region: 'rail', board: 'townName' }),
    ],
    // 거리 소품 [키, i, j]: 가로등은 솔방울 큰길 보도(j −3.5)에 (가게 문·골목을 피해서), 건널목엔 쌍가로등,
    //   분수·놀이터 앞 의자 (사람이 걷는 선 j −4.5 와 겹치지 않게)
    props: [
      ['streetlight', 19.8, -3.5], ['streetlight', 25.0, -3.5], ['streetlight', 31.4, -3.5],
      ['streetlight', 36.9, -3.5], ['streetlight', 41.9, -3.5], ['streetlight', 47.6, -3.5],
      ['streetlight_double', 7.55, -0.85], ['streetlight_double', 32.75, -1.0],
      ['bench_x', 28.9, -3.35], ['bench_x', 30.1, -3.35], ['bench_x', 26.6, -3.35],
    ],
  },
  // ── 집 창문 불빛 (밤): [건물 id, dx, dy] (나중에 채움)
  windowGlows: [],
};
