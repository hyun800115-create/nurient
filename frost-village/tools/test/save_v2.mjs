// v1 -> v2 save migration test.
//   node tools/test/save_v2.mjs           (Node part only: migration + sanitize)
//   node tools/test/save_v2.mjs --browser (also boots the game with an old v1 save)
import { MIGRATE, sanitizeSave, SAVE_VERSION } from '../../src/core/Save.js';

const fail = [];
const check = (name, ok, info = '') => { console.log((ok ? '  ok  ' : ' FAIL ') + name + (info ? '  — ' + info : '')); if (!ok) fail.push(name); };

// an old (v1) save of a player who finished the village and bought two couriers, paying for a third
const v1 = {
  v: 1, t: 1760000000000, coins: 1234,
  progress: {
    done: { hire_fisherman: true, zone_forest: true, hire_lumberjack: true, zone_farm: true, hire_farmer: true, zone_mine: true, hire_miner: true, zone_hunt: true, hire_hunter: true, hire2_fisherman: true, hire2_farmer: true },
    paid: { hire2_lumberjack: 300, up_capacity: 20 }, up: { capacity: 2, speed: 1 }, celebrated: true, hints: { forest: true }, seen: { upgradeHint: true },
  },
  stations: { grill: { i: 3, o: 5 } }, market: { stock: { item_fish_cooked: 4 }, cash: 12 }, trade: { stock: { item_plank: 2 }, cash: 3 },
  player: { x: 990, y: 900, stack: ['item_fish_raw', 'item_fish_raw'] },
};
check('SAVE_VERSION is 2', SAVE_VERSION === 2, String(SAVE_VERSION));
const m = MIGRATE[1](JSON.parse(JSON.stringify(v1)));
const s = sanitizeSave(m);
check('version bumped', m.v === 2 && s.v === 2);
check('coins kept', s.coins === 1234);
check('couriers became porters', s.progress.done.porter_grill === true && s.progress.done.porter_bakery === true && !s.progress.done.hire2_fisherman, JSON.stringify(s.progress.done));
check('partial courier payment kept', s.progress.paid.porter_sawmill === 300 && s.progress.paid.up_capacity === 20, JSON.stringify(s.progress.paid));
check('first sale / trade flags set', s.progress.flags.firstSale === true && s.progress.flags.firstTrade === true);
check('upgrades + stations + shelf kept', s.progress.up.capacity === 2 && s.stations.grill.o === 5 && s.market.stock.item_fish_cooked === 4 && s.player.stack.length === 2);
check('no life yet (residents derived on load)', s.life === undefined);
// fresh-ish v1 save (nothing unlocked): no flags
const s0 = sanitizeSave(MIGRATE[1]({ v: 1, coins: 5, progress: { done: {} } }));
check('new player: no first-sale flag', !s0.progress.flags.firstSale);
// v2 life sanitize
const s2 = sanitizeSave({ v: 2, life: { moved: ['npc_aunt', 'npc_aunt', 42, '../x', 'pet_dog'], snowman: 9 } });
check('life sanitized', JSON.stringify(s2.life.moved) === '["npc_aunt","pet_dog"]' && s2.life.snowman === 3, JSON.stringify(s2.life));

if (process.argv.includes('--browser')) {
  const { start } = await import('./serve.mjs');
  const { launch, openPage, tapStart, sleep, waitFor } = await import('./pw.mjs');
  const srv = await start(0, { prefix: '/fv/' });
  const browser = await launch();
  const { page, log } = await openPage(browser, srv.url + 'index.html');
  try {
    await page.evaluate((sv) => { localStorage.clear(); localStorage.setItem('frostVillage.save.v1', JSON.stringify(sv)); }, v1);
    await page.reload({ waitUntil: 'load' });
    await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 90000);
    await sleep(800);
    await tapStart(page);
    await waitFor(page, () => window.__FV.state && window.__FV.scene.life, 60000);
    await sleep(3000);
    const st = await page.evaluate(() => window.__FV.state());
    check('old save loads: progress', st.done.includes('porter_grill') && st.done.includes('hire_hunter') && st.coins >= 1234, st.done.join(','));
    check('old save loads: 2 porters working', st.porters.length === 2, JSON.stringify(st.porters));
    check('old save loads: clerk pads offered', st.pads.includes('hire_clerk_market') && st.pads.includes('hire_clerk_trade'), st.pads.join(','));
    const life = await page.evaluate(() => window.__FV.life());
    check('old save loads: residents moved in for every unlock', life.moved.length >= 15, life.moved.length + ' moved');
    await page.evaluate(() => window.__FV.save());
    const raw = await page.evaluate(() => JSON.parse(localStorage.getItem('frostVillage.save.v1')));
    check('saved again as v2 with life', raw.v === 2 && raw.life && raw.life.moved.length >= 15);
    check('no page errors', log.errors.length === 0, log.errors.slice(0, 3).join(' | '));
  } catch (e) { check('browser part ran', false, e.message); }
  await browser.close(); await srv.close();
}
console.log(fail.length ? `FAIL: ${fail.length} checks` : 'PASS');
process.exit(fail.length ? 1 : 0);
