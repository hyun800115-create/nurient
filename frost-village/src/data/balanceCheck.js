// Safety net for hand-edited balance.js values. A typo (0, a negative number, text, a missing
// line) must never make a pad that cannot be completed or freeze the game, so every value the
// code depends on is checked once at start-up; anything unusable is replaced by a safe value and
// reported in the browser console (F12) as "[balance.js] ...".

import { BALANCE } from './balance.js';

const DEFAULT_COST = 100;

function warn(path, was, now) {
  try { console.warn('[balance.js] ' + path + ' = ' + JSON.stringify(was) + ' is not usable, using ' + JSON.stringify(now) + ' instead'); } catch (e) { /* */ }
}

/** fix BALANCE[path] in place: number within [min, max] (optionally a whole number) */
function fixNum(obj, key, path, min, max, def, int) {
  if (!obj || typeof obj !== 'object') return;
  const v = obj[key];
  let n = v === undefined || v === null || v === '' ? NaN : (typeof v === 'number' ? v : Number(v));
  if (!Number.isFinite(n)) n = def;
  if (int) n = Math.round(n);
  n = Math.max(min, Math.min(max, n));
  if (n !== v) { if (!(v === undefined && isOptional(path))) warn(path, v, n); obj[key] = n; }
}

// settings that older balance.js files may not have yet (filled in silently)
const OPTIONAL = new Set(['player.trashDelay', 'customers.shelfMax', 'customers.spawnEveryLate', 'trade.shelfMax', 'workers.porterCapacity',
  'costs.hire_clerk_market', 'costs.hire_clerk_trade', 'costs.porter_grill', 'costs.porter_sawmill', 'costs.porter_bakery', 'costs.porter_smelter', 'costs.porter_smokehouse',
  'camera.zoomMin', 'camera.zoomMax', 'camera.zoomStep', 'camera.zoomSmooth']);
// (v3.5) operator / raw-porter costs, third workers, labour and dog settings are filled in silently too
// (v4-C) the town hall / big restaurant / decor and the civic settings too
const isOptional = (path) => OPTIONAL.has(path) || /^(register|population|life|labour|dog|hire3|costs3|v4|civic)\./.test(path) || /^costs\.(op|raw)_/.test(path) || /^buildings\.(town_hall|big_restaurant|deco_)/.test(path);

function fixList(arr, path, min, max, int) {
  if (!Array.isArray(arr)) return;
  for (let i = 0; i < arr.length; i++) fixNum(arr, i, path + '[' + i + ']', min, max, arr[i - 1] !== undefined ? arr[i - 1] : min, int);
}

export function checkBalance() {
  const B = BALANCE;
  if (!B || typeof B !== 'object') return;
  B.player = B.player || {};
  fixNum(B.player, 'speed', 'player.speed', 20, 2000, 255);
  fixNum(B.player, 'verticalFactor', 'player.verticalFactor', 0.2, 2, 0.74);
  fixNum(B.player, 'gatherRange', 'player.gatherRange', 10, 400, 78);
  fixNum(B.player, 'padDelay', 'player.padDelay', 0, 5, 0.5);
  fixNum(B.player, 'trashDelay', 'player.trashDelay', 0.1, 5, 0.6);
  fixNum(B.player, 'padItemInterval', 'player.padItemInterval', 0.01, 2, 0.075);
  fixNum(B.player, 'carryScale', 'player.carryScale', 0.1, 3, 0.62);
  fixNum(B, 'payDuration', 'payDuration', 0.1, 60, 1.6);
  fixNum(B, 'autosaveEvery', 'autosaveEvery', 1, 600, 5);
  // costs: whole coins, at least 1 (0 would make a pad that never completes)
  B.costs = B.costs || {};
  for (const k of ['hire_fisherman', 'zone_forest', 'hire_lumberjack', 'zone_farm', 'hire_farmer', 'zone_mine', 'hire_miner', 'zone_hunt', 'hire_hunter',
    'hire_clerk_market', 'hire_clerk_trade', 'porter_grill', 'porter_sawmill', 'porter_bakery', 'porter_smelter', 'porter_smokehouse']) fixNum(B.costs, k, 'costs.' + k, 1, 1e9, DEFAULT_COST, true);
  // (v3.5 분업) operator + raw porter pads of each line; their defaults follow the line's gatherer cost
  const LINE_WORKER = { grill: 'hire_fisherman', sawmill: 'hire_lumberjack', bakery: 'hire_farmer', smelter: 'hire_miner', smokehouse: 'hire_hunter' };
  for (const st in LINE_WORKER) {
    const base = B.costs[LINE_WORKER[st]];
    fixNum(B.costs, 'op_' + st, 'costs.op_' + st, 1, 1e9, Math.max(1, Math.round(base * 0.7)), true);
    fixNum(B.costs, 'raw_' + st, 'costs.raw_' + st, 1, 1e9, Math.max(1, Math.round(base * 1.1)), true);
  }
  B.hire2 = B.hire2 || {};
  for (const w of ['lumberjack', 'miner', 'farmer', 'fisherman', 'hunter']) fixNum(B.hire2, 'hire2_' + w, 'hire2.hire2_' + w, 1, 1e9, 800, true);
  B.hire3 = B.hire3 || {};
  const H3 = { fisherman: 450, lumberjack: 500, farmer: 600, hunter: 700 };
  for (const w in H3) fixNum(B.hire3, 'hire3_' + w, 'hire3.hire3_' + w, 1, 1e9, H3[w], true);
  B.costs3 = B.costs3 || {};
  const C3 = { op_toolsmith: 220, op_cannery: 600, porter_toolsmith: 600, porter_cannery: 800, porter_dock: 600, hire_clerk_store: 400 };
  for (const k in C3) fixNum(B.costs3, k, 'costs3.' + k, 1, 1e9, C3[k], true);
  const L = B.labour = B.labour || {};
  fixNum(L, 'chiefSpeed', 'labour.chiefSpeed', 0.1, 10, 1.25);
  fixNum(L, 'pileMax', 'labour.pileMax', 1, 500, 40, true);
  fixNum(L, 'rawCapacity', 'labour.rawCapacity', 1, 100, 8, true);
  const DG = B.dog = B.dog || {};
  const dogNums = { callRange: [30, 1000, 140], stayTime: [1, 600, 12], treatCooldown: [0, 3600, 25], playCooldown: [0, 3600, 10], petCooldown: [0, 3600, 15],
    treatLove: [0, 100, 8], playLove: [0, 100, 3], petLove: [0, 100, 3], trickAt: [0, 100, 50], giftAt: [0, 100, 75], giftEvery: [5, 36000, 150], giftCoins: [0, 1e6, 6] };
  for (const k in dogNums) { const [lo, hi, d] = dogNums[k]; fixNum(DG, k, 'dog.' + k, lo, hi, d); }
  // prices: whole coins >= 1
  B.prices = B.prices || {};
  for (const k of ['item_fish_cooked', 'item_bread', 'item_meat_cooked', 'item_plank', 'item_ingot']) fixNum(B.prices, k, 'prices.' + k, 1, 1e6, 1, true);
  // upgrades: values >= something, costs whole >= 1, exactly values.length - 1 costs
  B.upgrades = B.upgrades || {};
  const UP = { capacity: { min: 1, max: 500, int: true, def: [6] }, speed: { min: 0.2, max: 5, int: false, def: [1] } };
  for (const kind in UP) {
    const u = B.upgrades[kind] = B.upgrades[kind] || {};
    if (!Array.isArray(u.values) || !u.values.length) { warn('upgrades.' + kind + '.values', u.values, UP[kind].def); u.values = UP[kind].def.slice(); }
    fixList(u.values, 'upgrades.' + kind + '.values', UP[kind].min, UP[kind].max, UP[kind].int);
    if (!Array.isArray(u.costs)) u.costs = [];
    fixList(u.costs, 'upgrades.' + kind + '.costs', 1, 1e9, true);
    while (u.costs.length < u.values.length - 1) { const c = (u.costs[u.costs.length - 1] || 100) * 2; warn('upgrades.' + kind + '.costs[' + u.costs.length + ']', undefined, c); u.costs.push(c); }
  }
  B.stations = B.stations || {};
  for (const id of ['grill', 'sawmill', 'bakery', 'smelter', 'smokehouse']) {
    const st = B.stations[id] = B.stations[id] || {};
    fixNum(st, 'time', 'stations.' + id + '.time', 0.05, 600, 1.2);
    fixNum(st, 'inputMax', 'stations.' + id + '.inputMax', 1, 500, 30, true);
    fixNum(st, 'outputMax', 'stations.' + id + '.outputMax', 1, 500, 36, true);
  }
  B.customers = B.customers || {};
  const C = B.customers;
  fixNum(C, 'spawnEvery', 'customers.spawnEvery', 0.3, 600, 2.6);
  fixNum(C, 'spawnEveryLate', 'customers.spawnEveryLate', 0.3, 600, C.spawnEvery);
  fixNum(C, 'maxQueue', 'customers.maxQueue', 1, 30, 6, true);
  fixNum(C, 'wantMin', 'customers.wantMin', 1, 50, 1, true);
  fixNum(C, 'wantMax', 'customers.wantMax', C.wantMin, 50, 3, true);
  fixNum(C, 'wantMaxLate', 'customers.wantMaxLate', C.wantMin, 50, 5, true);
  fixNum(C, 'takeInterval', 'customers.takeInterval', 0.02, 10, 0.2);
  fixNum(C, 'speed', 'customers.speed', 20, 1000, 120);
  fixNum(C, 'shelfMax', 'customers.shelfMax', 1, 500, 40, true);
  B.trade = B.trade || {};
  fixNum(B.trade, 'buyInterval', 'trade.buyInterval', 0.02, 60, 0.28);
  fixNum(B.trade, 'shelfMax', 'trade.shelfMax', 1, 500, 40, true);
  B.workers = B.workers || {};
  fixNum(B.workers, 'speed', 'workers.speed', 20, 1000, 150);
  fixNum(B.workers, 'capacity', 'workers.capacity', 1, 100, 5, true);
  fixNum(B.workers, 'porterCapacity', 'workers.porterCapacity', 1, 100, 14, true);
  fixNum(B.workers, 'hunterRange', 'workers.hunterRange', 40, 1000, 230);
  B.workers.cyclesPerItem = B.workers.cyclesPerItem || {};
  for (const w of ['fisherman', 'lumberjack', 'farmer', 'miner', 'hunter']) fixNum(B.workers.cyclesPerItem, w, 'workers.cyclesPerItem.' + w, 1, 50, 1, true);
  B.camera = B.camera || {};
  fixNum(B.camera, 'zoom', 'camera.zoom', 0.5, 3, 1.2);
  fixNum(B.camera, 'lerp', 'camera.lerp', 0.01, 1, 0.12);
  fixNum(B.camera, 'zoomMin', 'camera.zoomMin', 0.3, 1.5, 0.6);
  fixNum(B.camera, 'zoomMax', 'camera.zoomMax', Math.max(1, B.camera.zoomMin), 4, 1.7);
  fixNum(B.camera, 'zoomStep', 'camera.zoomStep', 1.02, 3, 1.25);
  fixNum(B.camera, 'zoomSmooth', 'camera.zoomSmooth', 0.01, 1, 0.18);
  B.register = B.register || {};
  fixNum(B.register, 'chiefPayTime', 'register.chiefPayTime', 0.05, 30, 0.35);
  fixNum(B.register, 'clerkPayTime', 'register.clerkPayTime', 0.05, 30, 0.55);
  fixNum(B.register, 'clerkTradeSlow', 'register.clerkTradeSlow', 0.2, 20, 1.25);
  B.population = B.population || {};
  fixNum(B.population, 'maxActive', 'population.maxActive', 0, 60, 24, true);
  fixNum(B.population, 'moveInDelay', 'population.moveInDelay', 0, 60, 2.5);
  fixNum(B.population, 'moveInGap', 'population.moveInGap', 0, 60, 2);
  const LF = B.life = B.life || {};
  const lifeNums = { walkSpeed: [10, 600, 70], runSpeed: [10, 900, 150], stayMin: [1, 600, 14], stayMax: [1, 1200, 40], chatEvery: [0.5, 600, 5],
    snowballEvery: [1, 3600, 16], tagEvery: [1, 3600, 45], tagLength: [2, 600, 16], concertEvery: [5, 3600, 80], concertLength: [3, 600, 24],
    snowmanStageTime: [0.5, 600, 9], snowmanKeep: [1, 36000, 150], waveRange: [0, 1000, 170], waveCooldown: [0, 3600, 25],
    shiverChance: [0, 1, 0.08], bubbleTime: [0.5, 30, 2.6], partyLength: [3, 600, 22] };
  for (const k in lifeNums) { const [lo, hi, d] = lifeNums[k]; fixNum(LF, k, 'life.' + k, lo, hi, d); }
  if (LF.stayMax < LF.stayMin) LF.stayMax = LF.stayMin;
  B.cash = B.cash || {};
  fixNum(B.cash, 'pileVisualMax', 'cash.pileVisualMax', 1, 500, 48, true);
  fixNum(B.cash, 'collectInterval', 'cash.collectInterval', 0.005, 2, 0.03);
  B.start = B.start || {};
  fixNum(B.start, 'coins', 'start.coins', 0, 1e9, 0, true);
  fixNum(B.start, 'firstCustomers', 'start.firstCustomers', 0, C.maxQueue, 3, true);
  const R = B.resources = B.resources || {};
  R.tree = R.tree || {}; fixNum(R.tree, 'hp', 'resources.tree.hp', 1, 100, 3, true); fixNum(R.tree, 'regrow', 'resources.tree.regrow', 0.1, 600, 7);
  R.rock = R.rock || {}; fixNum(R.rock, 'hp', 'resources.rock.hp', 1, 100, 4, true); fixNum(R.rock, 'regrow', 'resources.rock.regrow', 0.1, 600, 9);
  R.wheat = R.wheat || {}; fixNum(R.wheat, 'growTime', 'resources.wheat.growTime', 0.1, 600, 8); fixNum(R.wheat, 'yield', 'resources.wheat.yield', 1, 100, 2, true);
  R.net = R.net || {}; fixNum(R.net, 'max', 'resources.net.max', 1, 50, 6, true); fixNum(R.net, 'refill', 'resources.net.refill', 0.05, 600, 1.1);
  const A = R.animal = R.animal || {};
  fixNum(A, 'deer', 'resources.animal.deer', 0, 20, 3, true); fixNum(A, 'boar', 'resources.animal.boar', 0, 20, 2, true);
  fixNum(A, 'hp', 'resources.animal.hp', 1, 100, 2, true); fixNum(A, 'meat', 'resources.animal.meat', 1, 50, 2, true);
  fixNum(A, 'respawn', 'resources.animal.respawn', 0.1, 600, 6);
  // ---- (v4-A) 이웃 마을·기차·주민·밤낮 (docs/v4_plan.md §13)
  checkV4A(B);
  // ---- (v4-B) 주문·가게·등급·집·텍스처
  checkV4B(B);
  // ---- (v4-C) 마을회관·큰 식당·꾸미기·이주민
  checkC1(B);
}

// ---- (v4-C) 마을회관·큰 식당·꾸미기·이주민 (docs/기획서_v4_추가요청.md)
const C1_BUILD = {
  town_hall: { coins: 2400, item_plank: 30, item_ingot: 10, time: 14 }, big_restaurant: { coins: 1500, item_plank: 24, item_ingot: 6, time: 12 },
  deco_snowman: { coins: 120, item_plank: 0, item_ingot: 0, time: 3, happy: 2 }, deco_bench: { coins: 90, item_plank: 4, item_ingot: 0, time: 3, happy: 1 },
  deco_lamp: { coins: 80, item_plank: 0, item_ingot: 1, time: 3, happy: 1 }, deco_flowers: { coins: 160, item_plank: 3, item_ingot: 0, time: 4, happy: 2 },
  deco_rink: { coins: 400, item_plank: 0, item_ingot: 0, time: 5, happy: 3 }, deco_playground: { coins: 550, item_plank: 12, item_ingot: 0, time: 6, happy: 4 },
  deco_fountain: { coins: 750, item_plank: 0, item_ingot: 4, time: 6, happy: 5 },
};
function checkC1(B) {
  const BL = B.buildings = (B.buildings && typeof B.buildings === 'object') ? B.buildings : {};
  for (const k in C1_BUILD) {
    const d = C1_BUILD[k];
    const o = BL[k] = (BL[k] && typeof BL[k] === 'object') ? BL[k] : Object.assign({}, d);
    fixNum(o, 'coins', 'buildings.' + k + '.coins', 1, 1e9, d.coins, true);
    fixNum(o, 'item_plank', 'buildings.' + k + '.item_plank', 0, 200, d.item_plank, true);
    fixNum(o, 'item_ingot', 'buildings.' + k + '.item_ingot', 0, 200, d.item_ingot, true);
    fixNum(o, 'time', 'buildings.' + k + '.time', 1, 600, d.time);
    if ('happy' in d) fixNum(o, 'happy', 'buildings.' + k + '.happy', 0, 50, d.happy, true);
  }
  const C = B.civic = (B.civic && typeof B.civic === 'object') ? B.civic : {};
  const H = C.hall = (C.hall && typeof C.hall === 'object') ? C.hall : {};
  fixNum(H, 'taxPerPerson', 'civic.hall.taxPerPerson', 0, 100, 1.2);
  fixNum(H, 'taxCap', 'civic.hall.taxCap', 1, 1e7, 1500, true);
  fixNum(H, 'people', 'civic.hall.people', 0, 40, 6, true);
  fixNum(H, 'happy', 'civic.hall.happy', 0, 50, 8, true);
  const R = C.restaurant = (C.restaurant && typeof C.restaurant === 'object') ? C.restaurant : {};
  const RN = { dishMult: [0.1, 20, 1.3], comboMult: [0.1, 20, 1.6], comboChance: [0, 1, 0.4], spawnEvery: [0.5, 600, 5], cookTime: [0.1, 120, 1.4],
    cookTimeCombo: [0.1, 120, 2.4], eatTime: [0.5, 600, 9], eatTimeCombo: [0.5, 600, 13], patience: [5, 3600, 70], visitorChance: [0, 1, 0.3] };
  for (const k in RN) { const [lo, hi, d] = RN[k]; fixNum(R, k, 'civic.restaurant.' + k, lo, hi, d); }
  fixNum(R, 'maxQueue', 'civic.restaurant.maxQueue', 1, 20, 6, true);
  fixNum(R, 'pantryMax', 'civic.restaurant.pantryMax', 1, 200, 30, true);
  const S = R.staff = (R.staff && typeof R.staff === 'object') ? R.staff : {};
  const SD = { cashier: 450, cook: 700, server: 900 };
  for (const k in SD) fixNum(S, k, 'civic.restaurant.staff.' + k, 1, 1e9, SD[k], true);
  fixNum(C, 'happyCap', 'civic.happyCap', 0, 100, 12, true);
  const ST = C.settlers = (C.settlers && typeof C.settlers === 'object') ? C.settlers : {};
  fixNum(ST, 'every', 'civic.settlers.every', 5, 3600, 45);
  fixNum(ST, 'householdMin', 'civic.settlers.householdMin', 1, 10, 1, true);
  fixNum(ST, 'householdMax', 'civic.settlers.householdMax', ST.householdMin, 10, 2, true);
  fixNum(ST, 'maxVacant', 'civic.settlers.maxVacant', 1, 100, 6, true);
}

// ---- (v4-B) 주문·가게·등급·집·텍스처 (docs/v4_plan.md §13)
const V4B_ITEMS = ['item_fish_raw', 'item_fish_cooked', 'item_log', 'item_plank', 'item_wheat', 'item_bread', 'item_ore', 'item_ingot', 'item_meat_raw', 'item_meat_cooked',
  'item_can', 'item_fish_big', 'item_axe', 'item_pickaxe', 'item_rod', 'item_sickle', 'item_bow'];
const V4B_SHOPS = {
  cafe: { need: { item_bread: 30 }, rent: 20, sells: ['item_bread'], after: 'zone_farm' },
  restaurant: { need: { item_fish_cooked: 40, item_meat_cooked: 15 }, rent: 30, sells: ['item_fish_cooked', 'item_meat_cooked'], after: 'zone_hunt' },
  carpenter_workshop: { need: { item_plank: 50 }, rent: 25, sells: [], after: 'zone_forest' },
  hardware_store: { need: { item_ingot: 25, item_axe: 1, item_pickaxe: 1 }, rent: 30, sells: ['item_axe', 'item_pickaxe', 'item_rod', 'item_sickle', 'item_bow'], after: 'b:toolsmith' },
  supermarket: { need: { item_can: 10, item_bread: 20 }, rent: 40, sells: ['item_can', 'item_bread'], after: 'b:cannery' },
};
const V4B_LOTS = ['lotA1', 'lotA2', 'lotA3', 'lotB1', 'lotB2', 'lotB3', 'lotB5', 'lotH1', 'lotH2', 'lotH3', 'lotH4', 'lotH5'];

/** an { item: count } table: known items, whole counts 1..999; an empty / broken table becomes `def` */
function fixNeed(obj, key, path, def) {
  const v = obj[key];
  const out = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const k in v) {
      if (V4B_ITEMS.indexOf(k) < 0) { warn(path + '.' + k, v[k], '(dropped: unknown item)'); continue; }
      const n = Math.round(Number(v[k]));
      if (!Number.isFinite(n) || n < 1) { warn(path + '.' + k, v[k], '(dropped)'); continue; }
      out[k] = Math.min(999, n);
    }
  }
  if (!Object.keys(out).length) { if (v !== undefined) warn(path, v, def); obj[key] = Object.assign({}, def); return; }
  obj[key] = out;
}

function checkV4B(B) {
  const V = B.v4 = (B.v4 && typeof B.v4 === 'object') ? B.v4 : {};
  const sub = (k) => (V[k] = (V[k] && typeof V[k] === 'object' && !Array.isArray(V[k])) ? V[k] : {});
  const W = sub('wholesale');
  fixNum(W, 'rate', 'v4.wholesale.rate', 0.1, 1, 0.7);
  const O = sub('orders');
  fixNum(O, 'cards', 'v4.orders.cards', 1, 3, 3, true);
  fixNum(O, 'swapAfter', 'v4.orders.swapAfter', 10, 3600, 180);
  fixNum(O, 'bonus', 'v4.orders.bonus', 0, 3, 0.5);
  fixNum(O, 'standingBonus', 'v4.orders.standingBonus', 0, 3, 0.3);
  fixNum(O, 'standingBonusRank2', 'v4.orders.standingBonusRank2', 0, 3, 0.5);
  const SD = [{ item_bread: 40 }, { item_fish_cooked: 50 }, { item_plank: 40 }, { item_ingot: 25 }, { item_can: 30 }, { item_meat_cooked: 25 }];
  if (!Array.isArray(O.standing) || !O.standing.length) { if (O.standing !== undefined) warn('v4.orders.standing', O.standing, SD); O.standing = SD.map((o) => Object.assign({}, o)); }
  for (let i = 0; i < O.standing.length; i++) { const box = { n: O.standing[i] }; fixNeed(box, 'n', 'v4.orders.standing[' + i + ']', SD[i % SD.length]); O.standing[i] = box.n; }
  const F = sub('founding');
  fixNum(F, 'buildTime', 'v4.founding.buildTime', 1, 600, 25);
  fixNum(F, 'ribbonAuto', 'v4.founding.ribbonAuto', 1, 3600, 90);
  fixNum(F, 'household', 'v4.founding.household', 1, 6, 2, true);
  fixNum(F, 'shopShelf', 'v4.founding.shopShelf', 1, 200, 20, true);
  fixNum(F, 'inlandEvery', 'v4.founding.inlandEvery', 1, 3600, 40);
  fixNum(F, 'restockBelow', 'v4.founding.restockBelow', 0.05, 1, 0.4);
  const S = F.shops = (F.shops && typeof F.shops === 'object' && !Array.isArray(F.shops)) ? F.shops : {};
  for (const k in V4B_SHOPS) {
    const d = V4B_SHOPS[k];
    const s = S[k] = (S[k] && typeof S[k] === 'object') ? S[k] : (warn('v4.founding.shops.' + k, S[k], d), Object.assign({}, d));
    fixNeed(s, 'need', 'v4.founding.shops.' + k + '.need', d.need);
    fixNum(s, 'rent', 'v4.founding.shops.' + k + '.rent', 0, 1e6, d.rent, true);
    if (!Array.isArray(s.sells)) { if (s.sells !== undefined) warn('v4.founding.shops.' + k + '.sells', s.sells, d.sells); s.sells = d.sells.slice(); }
    s.sells = s.sells.filter((it) => { const ok = V4B_ITEMS.indexOf(it) >= 0; if (!ok) warn('v4.founding.shops.' + k + '.sells', it, '(dropped: unknown item)'); return ok; });
    if (typeof s.after !== 'string' && s.after !== null) { if (s.after !== undefined) warn('v4.founding.shops.' + k + '.after', s.after, d.after); s.after = d.after; }
  }
  // the order: only shops that exist, each once; every shop needs its lot
  const order = Array.isArray(F.order) ? F.order.filter((k, i, a) => S[k] && a.indexOf(k) === i) : [];
  if (!order.length || (Array.isArray(F.order) && order.length !== F.order.length)) { warn('v4.founding.order', F.order, order.length ? order : Object.keys(V4B_SHOPS)); }
  F.order = order.length ? order : Object.keys(V4B_SHOPS);
  const DL = { cafe: 'lotA1', restaurant: 'lotA2', carpenter_workshop: 'lotA3', hardware_store: 'lotB1', supermarket: 'lotB5' };
  const L = F.lots = (F.lots && typeof F.lots === 'object' && !Array.isArray(F.lots)) ? F.lots : {};
  const used = new Set();
  for (const k of F.order) {
    let lot = L[k];
    if (V4B_LOTS.indexOf(lot) < 0 || used.has(lot)) { const d = DL[k] && !used.has(DL[k]) ? DL[k] : V4B_LOTS.find((x) => !used.has(x) && /^lot[AB]/.test(x)); warn('v4.founding.lots.' + k, lot, d); lot = d; L[k] = d; }
    used.add(lot);
  }
  const SP = V.stationPorter = Array.isArray(V.stationPorter) ? V.stationPorter : [600, 1100];
  while (SP.length < 2) SP.push(SP.length ? SP[SP.length - 1] : 600);
  fixList(SP, 'v4.stationPorter', 1, 1e9, true);
  fixNum(V, 'stationPorterCapacity', 'v4.stationPorterCapacity', 1, 60, 12, true);
  fixNum(V, 'stationPorterFoundingMin', 'v4.stationPorterFoundingMin', 1, 60, 1, true);
  const H = sub('houses');
  fixNum(H, 'item_plank', 'v4.houses.item_plank', 1, 999, 20, true);
  fixNum(H, 'time', 'v4.houses.time', 1, 600, 30);
  fixNum(H, 'people', 'v4.houses.people', 1, 8, 4, true);
  for (const [k, d] of [['lots', ['lotH1', 'lotH2', 'lotH3']], ['lotsRank2', ['lotH4', 'lotH5', 'lotB2', 'lotB3']]]) {
    if (!Array.isArray(H[k])) { if (H[k] !== undefined) warn('v4.houses.' + k, H[k], d); H[k] = d.slice(); }
    H[k] = H[k].filter((x) => { const ok = V4B_LOTS.indexOf(x) >= 0 && !used.has(x); if (!ok) warn('v4.houses.' + k, x, '(dropped: unknown lot or a shop lot)'); return ok; });
  }
  const R = sub('rent');
  fixNum(R, 'cap', 'v4.rent.cap', 1, 1e9, 2000, true);
  fixNum(R, 'autoFromRank', 'v4.rent.autoFromRank', 1, 9, 2, true);
  fixNum(R, 'autoEvery', 'v4.rent.autoEvery', 1, 600, 15);
  const HP = sub('happiness');
  fixNum(HP, 'window', 'v4.happiness.window', 1, 200, 40, true);
  fixNum(HP, 'base', 'v4.happiness.base', 0, 99, 30);
  const RK = sub('rank');
  const R2 = RK[2] = (RK[2] && typeof RK[2] === 'object') ? RK[2] : {};
  fixNum(R2, 'people', 'v4.rank.2.people', 1, 999, 45, true);
  fixNum(R2, 'shops', 'v4.rank.2.shops', 0, F.order.length, Math.min(5, F.order.length), true);
  fixNum(R2, 'happy', 'v4.rank.2.happy', 0, 100, 80);
  fixNum(R2, 'coins', 'v4.rank.2.coins', 1, 1e9, 11000, true);
  const C = sub('ceremony');
  fixNum(C, 'length', 'v4.ceremony.length', 3, 60, 12);
  fixNum(C, 'skipAfter', 'v4.ceremony.skipAfter', 0, C.length, 3);
  const T = sub('tex');
  fixNum(T, 'mustMiB', 'v4.tex.mustMiB', 64, 4096, 455);
  fixNum(T, 'targetMiB', 'v4.tex.targetMiB', 48, T.mustMiB, 300);
  fixNum(T, 'lowMiB', 'v4.tex.lowMiB', 48, T.targetMiB, 200);
  fixNum(T, 'softGap', 'v4.tex.softGap', 0, 200, 24);
  fixNum(T, 'uploadsPerSec', 'v4.tex.uploadsPerSec', 1, 60, 10);
  fixNum(T, 'socialPages', 'v4.tex.socialPages', 0, 40, 5);
  fixNum(T, 'socialTtl', 'v4.tex.socialTtl', 1, 600, 30);
  fixNum(T, 'townTtl', 'v4.tex.townTtl', 1, 600, 10);
}

function checkV4A(B) {
  const V = B.v4 = (B.v4 && typeof B.v4 === 'object') ? B.v4 : {};
  const sub = (k) => (V[k] = (V[k] && typeof V[k] === 'object' && !Array.isArray(V[k])) ? V[k] : {});
  const S = sub('station');
  fixNum(S, 'coins', 'v4.station.coins', 1, 1e9, 500, true);
  fixNum(S, 'item_plank', 'v4.station.item_plank', 0, 999, 14, true);
  fixNum(S, 'item_ingot', 'v4.station.item_ingot', 0, 999, 4, true);
  fixNum(S, 'time', 'v4.station.time', 1, 600, 12);
  const T = sub('train');
  fixNum(T, 'speed', 'v4.train.speed', 0.5, 6, 2.6);
  fixNum(T, 'accel', 'v4.train.accel', 0.05, 10, 0.6);
  fixNum(T, 'brake', 'v4.train.brake', 0.05, 10, 0.8);
  fixNum(T, 'dwellOurs', 'v4.train.dwellOurs', 2, 120, 14);
  fixNum(T, 'dwellTown', 'v4.train.dwellTown', 2, 120, 10);
  fixNum(T, 'seats', 'v4.train.seats', 1, 60, 12, true);
  fixNum(T, 'coachSeats', 'v4.train.coachSeats', 0, 60, 8, true);
  fixNum(T, 'firstRide', 'v4.train.firstRide', 1, 60, 6, true);
  fixNum(T, 'firstDelay', 'v4.train.firstDelay', 0, 60, 3);
  fixNum(T, 'whistleBefore', 'v4.train.whistleBefore', 0, 20, 2.5);
  fixNum(T, 'blockAhead', 'v4.train.blockAhead', 0.3, 10, 1.5);
  const VI = sub('visitors');
  fixNum(VI, 'base', 'v4.visitors.base', 0, 60, 4);
  fixNum(VI, 'perShop', 'v4.visitors.perShop', 0, 20, 1);
  fixNum(VI, 'perRank', 'v4.visitors.perRank', 0, 20, 3);
  for (const k of ['dawn', 'day', 'dusk', 'night']) fixNum(VI, k, 'v4.visitors.' + k, 0, 5, { dawn: 0.5, day: 1, dusk: 1.3, night: 0.1 }[k]);
  fixNum(VI, 'wantMin', 'v4.visitors.wantMin', 1, 20, 2, true);
  fixNum(VI, 'wantMax', 'v4.visitors.wantMax', VI.wantMin, 20, 4, true);
  fixNum(VI, 'patience', 'v4.visitors.patience', 5, 600, 60);
  fixNum(VI, 'shopChance', 'v4.visitors.shopChance', 0, 1, 0.45);
  fixNum(VI, 'storeChance', 'v4.visitors.storeChance', 0, 1, 0.25);
  fixNum(VI, 'maxInVillage', 'v4.visitors.maxInVillage', 1, 120, 24, true);
  fixNum(VI, 'regularAt', 'v4.visitors.regularAt', 1, 100, 3, true);
  fixNum(VI, 'speed', 'v4.visitors.speed', 20, 600, 105);
  const TW = sub('town');
  fixNum(TW, 'people', 'v4.town.people', 20, 192, 100, true);
  fixNum(TW, 'peopleRank2', 'v4.town.peopleRank2', TW.people, 192, 120, true);
  fixNum(TW, 'seed', 'v4.town.seed', 0, 4294967295, 2611, true);
  fixNum(TW, 'walk', 'v4.town.walk', 20, 300, 70);
  fixNum(TW, 'tripChance', 'v4.town.tripChance', 0, 1, 0.35);
  fixNum(TW, 'inviteAfter', 'v4.town.inviteAfter', 10, 3600, 480);
  const D = sub('day');
  if (typeof D.on !== 'boolean') { if (D.on !== undefined) warn('v4.day.on', D.on, true); D.on = true; }
  fixNum(D, 'length', 'v4.day.length', 60, 3600, 600);
  fixNum(D, 'startHour', 'v4.day.startHour', 0, 23.99, 8);
  fixNum(D, 'darkness', 'v4.day.darkness', 0, 0.6, 0.45);
  fixNum(D, 'fade', 'v4.day.fade', 0, 60, 8);
  // hours must be in order: dawn < dayStart < dusk < night, lights on after dusk starts
  fixNum(D, 'dawn', 'v4.day.dawn', 0, 23, 6);
  fixNum(D, 'dayStart', 'v4.day.dayStart', D.dawn, 23, 8);
  fixNum(D, 'dusk', 'v4.day.dusk', D.dayStart, 23.5, 17);
  fixNum(D, 'night', 'v4.day.night', D.dusk, 23.9, 20);
  fixNum(D, 'lightsOn', 'v4.day.lightsOn', D.dusk, D.night, 19);
  fixNum(D, 'lightsOff', 'v4.day.lightsOff', 0, D.dayStart, 6.5);
  const P = sub('perf');
  fixNum(P, 'maxRigs', 'v4.perf.maxRigs', 4, 48, 32, true);
  fixNum(P, 'maxRigsLow', 'v4.perf.maxRigsLow', 4, P.maxRigs, 16, true);
  fixNum(P, 'maxLite', 'v4.perf.maxLite', 0, 96, 40, true);
  fixNum(P, 'margin', 'v4.perf.margin', 0, 600, 120);
  fixNum(P, 'near', 'v4.perf.near', P.margin, 2000, 600);
  fixNum(P, 'maxGlows', 'v4.perf.maxGlows', 0, 96, 40, true);
  const TL = sub('townLife');
  fixNum(TL, 'jitter', 'v4.townLife.jitter', 0, 2, 0.4);
  const hours = (o, path, keys, dflt) => {
    const X = TL[o] = (TL[o] && typeof TL[o] === 'object') ? TL[o] : {};
    let lo = 0;
    keys.forEach((k, n) => { fixNum(X, k, 'v4.townLife.' + o + '.' + k, lo, 23.99, dflt[n]); lo = X[k]; });
    void path;
  };
  hours('school', 'school', ['leave', 'bell', 'recess', 'recessEnd', 'lunch', 'lunchEnd', 'out', 'home'], [7.2, 8, 10.5, 10.83, 12, 12.67, 15, 17.5]);
  hours('teen', 'teen', ['cafe', 'home'], [15.5, 17.5]);
  hours('shop', 'shop', ['open', 'lunch', 'lunchEnd', 'close'], [7.67, 12, 12.67, 18.5]);
  hours('civic', 'civic', ['start', 'teacherEnd', 'end'], [7.75, 16, 18]);
  const AD = TL.adult = (TL.adult && typeof TL.adult === 'object') ? TL.adult : {};
  fixNum(AD, 'out', 'v4.townLife.adult.out', 0, 23, 8); fixNum(AD, 'home', 'v4.townLife.adult.home', AD.out, 23.5, 19);
  fixNum(AD, 'walkChance', 'v4.townLife.adult.walkChance', 0, 1, 0.3); fixNum(AD, 'walkEnd', 'v4.townLife.adult.walkEnd', AD.home, 23.9, 20);
  fixNum(AD, 'errandMin', 'v4.townLife.adult.errandMin', 1, 120, 6); fixNum(AD, 'errandMax', 'v4.townLife.adult.errandMax', AD.errandMin, 240, 15);
  fixNum(AD, 'homeStay', 'v4.townLife.adult.homeStay', 0, 6, 0.8);
  fixNum(AD, 'tripFrom', 'v4.townLife.adult.tripFrom', AD.out, AD.home, 13); fixNum(AD, 'tripTo', 'v4.townLife.adult.tripTo', AD.tripFrom, AD.home, 18);
  const EL = TL.elder = (TL.elder && typeof TL.elder === 'object') ? TL.elder : {};
  fixNum(EL, 'out', 'v4.townLife.elder.out', 0, 23, 9); fixNum(EL, 'cafe', 'v4.townLife.elder.cafe', EL.out, 23, 11);
  fixNum(EL, 'clinicChance', 'v4.townLife.elder.clinicChance', 0, 1, 0.2); fixNum(EL, 'home', 'v4.townLife.elder.home', EL.cafe, 23.5, 18);
  for (const [k, d] of [['tripMorning', [9, 12]], ['tripAfternoon', [14, 17]]]) {
    if (!Array.isArray(EL[k]) || EL[k].length !== 2) { if (EL[k] !== undefined) warn('v4.townLife.elder.' + k, EL[k], d); EL[k] = d.slice(); }
    fixNum(EL[k], 0, 'v4.townLife.elder.' + k + '[0]', 0, 23, d[0]); fixNum(EL[k], 1, 'v4.townLife.elder.' + k + '[1]', EL[k][0], 23.9, d[1]);
  }
  const NI = TL.night = (TL.night && typeof TL.night === 'object') ? TL.night : {};
  fixNum(NI, 'dozers', 'v4.townLife.night.dozers', 0, 10, 3, true); fixNum(NI, 'patrol', 'v4.townLife.night.patrol', 0, 2, 1, true);
}
