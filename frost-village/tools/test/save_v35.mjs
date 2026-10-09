// v3 -> v3.5 save migration test (분업: operators, collection piles, raw porters, the dog's affection).
//   node tools/test/save_v35.mjs           (Node part only: migration + sanitize)
//   node tools/test/save_v35.mjs --browser (also boots the game with v3 saves and checks the lines still run)
// Never wipe progress: every machine that ran on its own in v3 keeps running (operators and raw porters
// come with it); new things (piles, dog affection) start empty.
import { MIGRATE, sanitizeSave, SAVE_VERSION } from '../../src/core/Save.js';

const fail = [];
const check = (name, ok, info = '') => { console.log((ok ? '  ok  ' : ' FAIL ') + name + (info ? '  — ' + info : '')); if (!ok) fail.push(name); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const migrate = (o) => { o = clone(o); while (o.v !== SAVE_VERSION) o = MIGRATE[o.v](o); return sanitizeSave(o); };

const STATIONS = ['grill', 'sawmill', 'bakery', 'smelter', 'smokehouse'];
const DONE_V2 = ['hire_clerk_market', 'hire_fisherman', 'porter_grill', 'zone_forest', 'hire_clerk_trade', 'hire_lumberjack', 'porter_sawmill', 'zone_farm',
  'hire_farmer', 'porter_bakery', 'zone_mine', 'hire_miner', 'porter_smelter', 'zone_hunt', 'hire_hunter', 'porter_smokehouse'];
const MOVED = ['npc_grandpa', 'npc_aunt', 'npc_kid_girl', 'npc_kid_prankster', 'pet_dog', 'npc_kid_boy', 'npc_grandma', 'npc_young_man', 'npc_teen_girl', 'pet_cat',
  'npc_postman', 'npc_bard', 'npc_uncle', 'npc_blacksmith', 'npc_fashion', 'npc_chef', 'npc_herbalist', 'pet_penguin', 'npc_toddler', 'npc_yellow'];

// a v3 save: the whole v1/v2 village, the east land, a toolsmith, a cannery still being built
const v3 = {
  v: 3, t: 1765000000000, coins: 4321,
  progress: {
    done: Object.assign(Object.fromEntries(DONE_V2.map((k) => [k, true])), { tower_east: true }),
    paid: { hire2_lumberjack: 250 }, up: { capacity: 4, speed: 3 }, celebrated: true, hints: {}, seen: {},
    flags: { firstSale: true, firstTrade: true }, got: { hire2_lumberjack: { item_axe: 1 } },
  },
  stations: { grill: { i: 3, o: 5 }, sawmill: { i: 2, o: 9 }, bakery: { i: 4, o: 2 } },
  market: { stock: { item_fish_cooked: 4, item_bread: 6 }, cash: 12 }, trade: { stock: { item_plank: 2 }, cash: 3 },
  player: { x: 990, y: 900, stack: ['item_plank'] },
  life: { moved: MOVED, snowman: 1 },
  territory: { east: true },
  sites: {
    tower_east: { b: 'watchtower', st: 'done', got: { item_plank: 10 }, t: 7 },
    e_m1: { b: 'toolsmith', st: 'done', got: { item_plank: 8, item_ingot: 4 }, t: 9 },
    e_m2: { b: 'cannery', st: 'scaffold', got: { item_plank: 12, item_ingot: 6 }, t: 2 },
  },
  v3: { workshops: { toolsmith: { ins: { item_plank: 2, item_ingot: 1 }, outs: { item_axe: 1 } } } },
};

check('SAVE_VERSION is 4 or later (v3.5: 4, v4: 5)', SAVE_VERSION >= 4, String(SAVE_VERSION));
const m = MIGRATE[3](clone(v3));
const s = sanitizeSave(m);
check('v3 -> v3.5: version bumped', m.v === 4 && s.v >= 4);
check('v3 -> v3.5: coins, steps, upgrades, pad payments kept', s.coins === 4321 && DONE_V2.every((k) => s.progress.done[k]) && s.progress.done.tower_east && s.progress.up.capacity === 4 && s.progress.paid.hire2_lumberjack === 250 && s.progress.got.hire2_lumberjack.item_axe === 1);
check('v3 -> v3.5: every line keeps its automation (operator + raw porter)', STATIONS.every((st) => s.progress.done['op_' + st] && s.progress.done['raw_' + st]), Object.keys(s.progress.done).filter((k) => /^(op|raw)_/.test(k)).join(','));
check('v3 -> v3.5: the toolsmith and the cannery being built keep working by themselves', s.progress.done.op_toolsmith && s.progress.done.op_cannery);
check('v3 -> v3.5: stations, shelves, land, sites, residents kept', s.stations.sawmill.o === 9 && s.market.stock.item_bread === 6 && s.territory.east && s.sites.e_m2.st === 'scaffold' && s.life.moved.length === MOVED.length);
check('v3 -> v3.5: piles start empty, the dog starts as a stranger', Object.values(s.labour.piles).every((n) => n === 0) && s.dog.love === 0 && s.dog.gifts === 0, JSON.stringify({ l: s.labour, d: s.dog }));
// an early v3 player (clerk + fisherman only): the grill keeps cooking by itself, the fish reach it
{
  const z = migrate({ v: 3, coins: 30, progress: { done: { hire_clerk_market: true, hire_fisherman: true }, flags: { firstSale: true } } });
  check('early v3 save: cook + fish porter come with the fisherman, nothing else', z.progress.done.op_grill && z.progress.done.raw_grill && !z.progress.done.porter_grill && !z.progress.done.op_sawmill && !z.progress.done.zone_forest, JSON.stringify(z.progress.done));
}
// a v3 player who opened the farm but did not hire the farmer: the oven still bakes what the chief brings
{
  const z = migrate({ v: 3, coins: 30, progress: { done: { hire_clerk_market: true, hire_fisherman: true, zone_forest: true, hire_lumberjack: true, zone_farm: true }, flags: { firstSale: true } } });
  check('v3 save with an open farm: the oven keeps its baker, no wheat porter yet', z.progress.done.op_bakery && !z.progress.done.raw_bakery && z.progress.done.op_sawmill && z.progress.done.raw_sawmill && !z.progress.done.op_smelter, JSON.stringify(z.progress.done));
}
// a brand-new v3 save (nothing done) plays the v3.5 tutorial (the chief cooks first)
{
  const z = migrate({ v: 3, coins: 0, progress: { done: {} } });
  check('fresh v3 save: no free cook (the new tutorial runs)', !z.progress.done.op_grill, JSON.stringify(z.progress.done));
}
// the whole chain v1 -> v4
{
  const z = migrate({ v: 1, coins: 7, progress: { done: { hire_fisherman: true, hire2_fisherman: true } } });   // (v1's hire2_fisherman = the grill porter)
  check('v1 -> v2 -> v3 -> v3.5 chain', z.v === SAVE_VERSION && z.progress.done.porter_grill && z.progress.done.op_grill && z.progress.done.raw_grill && z.coins === 7, JSON.stringify(z.progress.done));
}
// hand-edited / corrupted v3.5 fields never brick the game
{
  const bad = sanitizeSave(Object.assign(migrate(v3), { labour: { piles: { fish: 'lots', log: -4, wheat: 1e9, ore: 7.6, gold: 5 } }, dog: { love: 900, gifts: -2, tricks: 'x' } }));
  check('corrupt v3.5: pile counts clamped, unknown piles dropped', bad.labour.piles.fish === 0 && bad.labour.piles.log === 0 && bad.labour.piles.wheat === 500 && bad.labour.piles.ore === 7 && bad.labour.piles.gold === undefined, JSON.stringify(bad.labour));
  check('corrupt v3.5: dog affection clamped to 0..100', bad.dog.love === 100 && bad.dog.gifts === 0 && bad.dog.tricks === 0, JSON.stringify(bad.dog));
  const none = sanitizeSave(Object.assign(migrate(v3), { labour: 'x', dog: null }));
  check('corrupt v3.5: missing labour / dog fields fall back to empty', none.labour && none.dog && none.dog.love === 0, JSON.stringify({ l: none.labour, d: none.dog }));
}

if (process.argv.includes('--browser')) {
  const { start } = await import('./serve.mjs');
  const { launch, openPage, tapStart, sleep, waitFor } = await import('./pw.mjs');
  const { installStepper, advance } = await import('./fv_step.mjs');
  const srv = await start(0, { prefix: '/fv/' });
  const browser = await launch();
  const { page, log } = await openPage(browser, srv.url + 'index.html');
  const boot = async (sv) => {
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
    // 1. the v3 village: operators at every station, raw porters, the forge works, the cannery gets its operator when built
    await boot(v3);
    await page.evaluate(() => window.__FV.teleport(990, 1500));     // the chief away from every work spot
    await advance(page, 20);
    let st = await page.evaluate(() => window.__FV.state());
    const ops = st.ops || {};
    check('v3 save boots: an operator stands at every station', STATIONS.every((k) => ops[k] && ops[k].hired && ops[k].ready), JSON.stringify(ops));
    check('v3 save boots: five raw porters + five goods porters', st.rawPorters.length === 5 && st.porters.filter((p) => !/warehouse/.test(p.role || '')).length >= 5, `raw=${st.rawPorters.length} porters=${st.porters.length}`);
    check('v3 save boots: the forge has its operator', ops.toolsmith && ops.toolsmith.hired, JSON.stringify(ops.toolsmith));
    check('v3 save boots: coins, land, residents kept', st.coins >= 4321 && st.territory.east === true && st.residents >= 17, `coins=${st.coins} residents=${st.residents}`);
    // the lines keep running with the chief away: something gets cooked and sawn
    const before = await page.evaluate(() => { const gs = window.__FV.scene; return { fish: gs.stations.grill.made || 0, plank: gs.stations.sawmill.made || 0, out: gs.stations.grill.outStack.count + gs.stations.sawmill.outStack.count }; });
    await page.evaluate(() => { const gs = window.__FV.scene; for (let i = 0; i < 6; i++) { gs.piles.fish.stack.push('item_fish_raw', null, gs.effects); gs.piles.log.stack.push('item_log', null, gs.effects); } });
    let worked = false;
    for (let i = 0; i < 40 && !worked; i++) { await advance(page, 1); worked = await page.evaluate(() => { const s = window.__FV.state(); return s.ops.grill.working || s.ops.sawmill.working; }); }
    check('v3 save: the stations keep working with the chief away', worked, JSON.stringify(before));
    // the cannery scaffold finishes -> its operator walks in by itself (it came with the v3 save)
    await advance(page, 30);
    st = await page.evaluate(() => window.__FV.state());
    check('v3 save: the cannery finishes and has its operator', st.built.cannery === 1 && st.ops.cannery && st.ops.cannery.hired, JSON.stringify({ built: st.built.cannery, op: st.ops.cannery, site: st.sites.e_m2 }));
    await page.evaluate(() => window.__FV.save());
    const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('frostVillage.save.v1')));
    check('saved again as the current version with piles + dog', raw.v === SAVE_VERSION && raw.labour && raw.labour.piles && raw.dog && typeof raw.dog.love === 'number', JSON.stringify({ v: raw.v, l: raw.labour, d: raw.dog }));

    // 2. the v4 round trip keeps piles and affection
    // (no meat porter in this save, so nobody empties the meat rack while the game boots)
    raw.labour.piles.meat = 9; raw.dog.love = 61; delete raw.progress.done.raw_smokehouse;
    await boot(raw);
    st = await page.evaluate(() => window.__FV.state());
    check('v3.5 round trip: pile and dog affection come back', st.piles.meat.n >= 9 && Math.round(st.dog.love) === 61, JSON.stringify({ p: st.piles.meat, d: st.dog && st.dog.love }));

    // 3. an early v3 save (clerk + fisherman): the cook and the fish porter are there
    await boot({ v: 3, coins: 40, progress: { done: { hire_clerk_market: true, hire_fisherman: true }, flags: { firstSale: true } } });
    st = await page.evaluate(() => window.__FV.state());
    check('early v3 save boots: cook at the grill, fish porter hired, next goal offered', st.ops.grill.hired && st.rawPorters.length === 1 && st.pads.includes('porter_grill') && st.pads.includes('zone_forest'), `pads=${st.pads.join(',')}`);

    // 4. a corrupted v4 save still boots
    await boot(Object.assign(clone(raw), { labour: { piles: { fish: 'x', ore: 1e99 } }, dog: { love: 'max' } }));
    st = await page.evaluate(() => window.__FV.state());
    check('corrupt v3.5 save boots', st && st.coins >= 0 && st.piles && st.dog, JSON.stringify(st && st.piles));
    check('no page errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  } catch (e) { check('browser part ran', false, e && e.stack || e); }
  await browser.close(); await srv.close();
}
console.log(fail.length ? `FAIL: ${fail.length} checks` : 'PASS');
process.exit(fail.length ? 1 : 0);
