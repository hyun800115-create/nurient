// v2 -> v3 save migration test (생산 사슬과 땅 넓히기).
//   node tools/test/save_v3.mjs           (Node part only: migration + sanitize)
//   node tools/test/save_v3.mjs --browser (also boots the game with a finished v2 village, then a mid-v3 save)
// Never wipe progress: everything a v2 player had stays; the new land, plots and chains start fresh.
import { MIGRATE, sanitizeSave, SAVE_VERSION } from '../../src/core/Save.js';

const fail = [];
const check = (name, ok, info = '') => { console.log((ok ? '  ok  ' : ' FAIL ') + name + (info ? '  — ' + info : '')); if (!ok) fail.push(name); };
const clone = (o) => JSON.parse(JSON.stringify(o));

// a v2 save of a player who finished the village: porters, both clerks, 24 residents, upgrades
const DONE_V2 = ['hire_clerk_market', 'hire_fisherman', 'porter_grill', 'zone_forest', 'hire_clerk_trade', 'hire_lumberjack', 'porter_sawmill', 'zone_farm',
  'hire_farmer', 'porter_bakery', 'zone_mine', 'hire_miner', 'porter_smelter', 'zone_hunt', 'hire_hunter', 'porter_smokehouse'];
const MOVED = ['npc_grandpa', 'npc_aunt', 'npc_kid_girl', 'npc_kid_prankster', 'pet_dog', 'npc_kid_boy', 'npc_grandma', 'npc_young_man', 'npc_teen_girl', 'pet_cat',
  'npc_postman', 'npc_bard', 'npc_uncle', 'npc_blacksmith', 'npc_fashion', 'npc_chef', 'npc_herbalist', 'pet_penguin', 'npc_toddler', 'npc_yellow', 'npc_red',
  'npc_painter', 'npc_blue', 'npc_doctor', 'npc_skater', 'npc_guard', 'npc_merchant', 'npc_captain'];
const v2 = {
  v: 2, t: 1765000000000, coins: 2345,
  progress: {
    done: Object.fromEntries(DONE_V2.map((k) => [k, true])),
    paid: { up_capacity: 30 }, up: { capacity: 5, speed: 4 }, celebrated: true, hints: { forest: true, farm: true }, seen: { upgradeHint: true },
    flags: { firstSale: true, firstTrade: true },
  },
  stations: { grill: { i: 3, o: 5 }, sawmill: { i: 2, o: 9 }, smelter: { i: 1, o: 4 } },
  market: { stock: { item_fish_cooked: 4, item_bread: 6 }, cash: 12 }, trade: { stock: { item_plank: 2 }, cash: 3 },
  player: { x: 990, y: 900, stack: ['item_plank', 'item_plank'] },
  life: { moved: MOVED, snowman: 2 },
};

check('SAVE_VERSION is 3', SAVE_VERSION === 3, String(SAVE_VERSION));
const m = MIGRATE[2](clone(v2));
const s = sanitizeSave(m);
check('v2 -> v3: version bumped', m.v === 3 && s.v === 3);
check('v2 -> v3: coins, steps, upgrades kept', s.coins === 2345 && DONE_V2.every((k) => s.progress.done[k]) && s.progress.up.capacity === 5 && s.progress.up.speed === 4 && s.progress.paid.up_capacity === 30);
check('v2 -> v3: flags + celebration kept', s.progress.flags.firstSale && s.progress.flags.firstTrade && s.progress.celebrated);
check('v2 -> v3: stations, shelves, carried items kept', s.stations.sawmill.o === 9 && s.market.stock.item_bread === 6 && s.trade.stock.item_plank === 2 && s.player.stack.length === 2);
check('v2 -> v3: residents kept (nobody evicted)', s.life.moved.length === MOVED.length && s.life.snowman === 2, String(s.life.moved.length));
check('v2 -> v3: new land closed, no sites, no v3 stock', Object.keys(s.territory).length === 0 && Object.keys(s.sites).length === 0 && !s.v3.warehouse && !s.v3.store && !s.progress.celebrated3);
// the whole chain from v1 also lands on v3
{ let o = { v: 1, coins: 7, progress: { done: { hire_fisherman: true, hire2_fisherman: true } } }; while (o.v !== SAVE_VERSION) o = MIGRATE[o.v](o); const z = sanitizeSave(o); check('v1 -> v2 -> v3 chain', z.v === 3 && z.progress.done.porter_grill && z.coins === 7); }

// a mid-v3 save
const v3 = Object.assign(clone(v2), {
  v: 3,
  territory: { east: true },
  sites: {
    tower_east: { b: 'watchtower', st: 'done', got: { item_plank: 10 }, t: 7 },
    e_m1: { b: 'toolsmith', st: 'done', got: { item_plank: 8, item_ingot: 4 }, t: 9 },
    e_dock: { b: 'boathouse', st: 'scaffold', got: { item_plank: 12, item_ingot: 2 }, t: 3.5 },
    v_house1: { b: 'house_c', st: 'foundation', got: { item_plank: 2 }, t: 0 },
  },
  v3: {
    food: { on: true, food: { item_bread: 7, item_meat_cooked: 2 } },
    workshops: { toolsmith: { ins: { item_plank: 3, item_ingot: 2 }, outs: { item_axe: 1 } } },
  },
});
v3.progress.done.tower_east = true;
v3.progress.got = { hire2_lumberjack: { item_axe: 1 } };
v3.progress.paid.hire2_lumberjack = 250;
v3.progress.flags.fedMiners = true;
v3.life.moved = MOVED.slice(0, 20);
v3.life.waiting = ['npc_painter'];
const s3 = sanitizeSave(clone(v3));
check('v3 save: land, sites, stock kept', s3.territory.east === true && s3.sites.e_dock.st === 'scaffold' && s3.sites.e_dock.got.item_plank === 12 && s3.v3.food.food.item_bread === 7 && s3.v3.workshops.toolsmith.outs.item_axe === 1 && s3.progress.got.hire2_lumberjack.item_axe === 1);
// hand-edited / corrupted v3 fields never brick the game
const bad = sanitizeSave(Object.assign(clone(v3), {
  territory: { east: 'yes', narnia: true, south: true },
  sites: { e_m1: { b: 'castle', st: 'done' }, '../x': { b: 'store', st: 'done' }, e_m2: { b: 'store', st: 'flying' }, s_m1: { b: 'cannery', st: 'scaffold', got: { item_plank: -5, item_gold: 3 }, t: 1e9 } },
  v3: { warehouse: { item_plank: 'many', item_ingot: 1e99, nonsense: 3 }, food: 'full', dock: { level: 99, catch: { item_fish_big: -1 } }, workshops: { toolsmith: { ins: { item_ore: 5 } } }, store: { stock: { item_can: NaN }, cash: -4 } },
  progress: Object.assign(clone(v3.progress), { got: { hire2_miner: { item_pickaxe: 'x', item_bomb: 1 }, 'bad id!': { item_axe: 1 } } }),
}));
check('corrupt v3: unknown land / buildings / states dropped', bad.territory.south === true && !bad.territory.east && !bad.territory.narnia && !bad.sites.e_m1 && !bad.sites['../x'] && !bad.sites.e_m2 && bad.sites.s_m1.t === 600 && bad.sites.s_m1.got.item_plank === 0 && bad.sites.s_m1.got.item_gold === undefined, JSON.stringify({ t: bad.territory, s: bad.sites }));
check('corrupt v3: counts clamped, junk dropped', bad.v3.warehouse.item_plank === 0 && bad.v3.warehouse.item_ingot === 1e7 && bad.v3.warehouse.nonsense === undefined && bad.v3.food === undefined && bad.v3.dock.level === 2 && bad.v3.dock.catch.item_fish_big === 0 && !bad.v3.workshops.toolsmith.ins.item_ore && bad.v3.store.cash === 0, JSON.stringify(bad.v3));
check('corrupt v3: pad tools sanitized', bad.progress.got.hire2_miner.item_pickaxe === 0 && bad.progress.got.hire2_miner.item_bomb === undefined && !bad.progress.got['bad id!']);

if (process.argv.includes('--browser')) {
  const { start } = await import('./serve.mjs');
  const { launch, openPage, tapStart, sleep, waitFor } = await import('./pw.mjs');
  const { installStepper, advance } = await import('./fv_step.mjs');
  const srv = await start(0, { prefix: '/fv/' });
  const browser = await launch();
  const { page, log } = await openPage(browser, srv.url + 'index.html');
  const boot = async (sv) => {
    // (no autosave from the page being left: it would write the old game over the save under test)
    await page.evaluate((x) => { window.__FV_NO_SAVE = true; localStorage.clear(); if (x) localStorage.setItem('frostVillage.save.v1', JSON.stringify(x)); }, sv);
    await page.reload({ waitUntil: 'load' });
    await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 90000);
    await sleep(800);
    await tapStart(page);
    await waitFor(page, () => window.__FV.state && window.__FV.scene.life && window.__FV.game.scene.isActive('UI'), 180000);
    await sleep(1500);
    await installStepper(page);
    await advance(page, 3);
  };
  try {
    // 1. a finished v2 village: everything there, the first watchtower is the next goal
    await boot(v2);
    let st = await page.evaluate(() => window.__FV.state());
    check('v2 save boots: steps, coins, upgrades', DONE_V2.every((k) => st.done.includes(k)) && st.coins >= 2345 && st.upgrades.capacity === 5, st.done.length + ' done');
    check('v2 save boots: 5 porters, both clerks', st.porters.length === 5 && st.market.clerk && st.trade.clerk, st.porters.length + ' porters');
    check('v2 save boots: residents kept, more than the base house limit', st.population.people > st.population.cap && st.residents >= 20, JSON.stringify(st.population) + ' residents=' + st.residents);
    check('v2 save boots: first watchtower offered, land closed', st.pads.includes('tower_east') && !st.territory.east && st.goal === 'east', `pads=${st.pads.join(',')} goal=${st.goal}`);
    check('v2 save boots: tutorial points at the watchtower', /tower/.test(st.objective || ''), String(st.objective));
    await page.evaluate(() => window.__FV.save());
    let raw = await page.evaluate(() => JSON.parse(localStorage.getItem('frostVillage.save.v1')));
    check('saved again as v3', raw.v === 3 && raw.life.moved.length >= MOVED.length && raw.territory && Object.keys(raw.territory).length === 0);

    // 2. a mid-v3 save comes back exactly
    await boot(v3);
    st = await page.evaluate(() => window.__FV.state());
    check('v3 save boots: east land open, tower lit', st.territory.east === true && st.sites.tower_east && st.sites.tower_east.state === 'done', JSON.stringify(st.territory));
    check('v3 save boots: toolsmith stands, boathouse scaffold, house foundation', st.built.toolsmith && st.sites.e_dock.state === 'scaffold' && st.sites.v_house1.state === 'foundation' && st.sites.v_house1.got.item_plank === 2, JSON.stringify(st.sites));
    check('v3 save boots: food box + forge stock', st.food.active && st.food.count === 9 && st.workshops.toolsmith.outs.item_axe === 1, JSON.stringify({ f: st.food, w: st.workshops }));
    const pad = await page.evaluate(() => { const p = window.__FV.scene.progress.pads.hire2_lumberjack; return p ? { paid: p.paid, got: p.got } : null; });
    check('v3 save boots: hire pad keeps paid coins + the delivered axe', pad && pad.paid === 250 && pad.got.item_axe === 1, JSON.stringify(pad));
    await advance(page, 20);
    st = await page.evaluate(() => window.__FV.state());
    check('v3 save: the scaffold finishes after loading', st.built.boathouse === 1 || st.sites.e_dock.state === 'done', JSON.stringify(st.sites.e_dock));
    await page.evaluate(() => window.__FV.save());
    raw = await page.evaluate(() => JSON.parse(localStorage.getItem('frostVillage.save.v1')));
    check('v3 round trip', raw.v === 3 && raw.territory.east === true && raw.sites.e_m1.st === 'done' && raw.v3.food.on === true, JSON.stringify(raw.sites));

    // 3. a corrupted v3 save still boots
    await boot(Object.assign(clone(v3), { sites: { e_m1: { b: 'castle', st: 'done' }, e_m2: { b: 'store', st: 'scaffold', got: { item_plank: -3 } } }, territory: { east: 1, se: true }, v3: { warehouse: 'x', food: { on: true, food: { item_bread: 1e9 } } } }));
    st = await page.evaluate(() => window.__FV.state());
    check('corrupt v3 save boots', st && st.coins >= 0 && typeof st.territory === 'object', JSON.stringify(st && st.territory));
    check('no page errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  } catch (e) { check('browser part ran', false, e && e.stack || e); }
  await browser.close(); await srv.close();
}
console.log(fail.length ? `FAIL: ${fail.length} checks` : 'PASS');
process.exit(fail.length ? 1 : 0);
