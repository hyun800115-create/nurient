// Corrupted / odd save variants, fast path: one boot, then for each variant write the raw save into
// localStorage and restart the Game scene (Game.create is the only reader of the save).
// A variant that crashes Game.create triggers a full page reload to confirm the crash survives reloads.
// ((v4.3 step B, S) every variant carries the step-B marker (asStepB: it must hit sanitize, not the R43 remap); the content
//  level / x variants: a save from a newer build (lv 46, v 9) is held — after the boot, a save and the gathering the stored
//  text is byte-identical and the newer card is up — and a same-level save with an x drawer / junk x loads. Those rows are
//  asserted (FAIL lines, exit 1); the rest is the report it always was. (S4) Two rows without the marker go through R43:
//  r43Old loads remapped and plays (stored back on the new map: lay 2, lv 43); r43Forced (the test switch
//  __FV_TEST_FAIL43 = 'check') is held under the failure card with the stored text byte-identical)
//   node tools/test/review_robust_save_fast.mjs
import { newPage, bootToGame, launch, start, sleep, writeJSON, OUT } from './review_robust_lib.mjs';
import { asStepB } from './v43_helpers.mjs';

const srv = await start(0, { prefix: '/fv/' });
const URL = srv.url + 'index.html';
const browser = await launch();
const KEY = 'frostVillage.save.v1';
const base = { v: 1, t: Date.now(), coins: 120, progress: { done: { hire_fisherman: true }, paid: {}, up: { capacity: 0, speed: 0 } }, stations: {}, market: { stock: {}, cash: 0 }, trade: { stock: {}, cash: 0 }, player: { x: 900, y: 1150, stack: [] } };
const J = (o) => JSON.stringify(asStepB(o));
const variants = {
  oldVersion0: J({ ...base, v: 0, coins: 999 }),
  futureVersion2: J({ ...base, v: 2, coins: 999 }),
  coinsString: J({ ...base, coins: 'abc' }),
  coinsNumString: J({ ...base, coins: '250' }),
  coinsNegative: J({ ...base, coins: -500 }),
  coinsFloat: J({ ...base, coins: 12.7 }),
  coinsHuge: J({ ...base, coins: 1e308 }),
  playerXString: J({ ...base, player: { x: 'abc', y: 1150, stack: [] } }),
  playerXNull: J({ ...base, player: { x: null, y: null, stack: [] } }),
  playerOffWorld: J({ ...base, player: { x: -5000, y: 99999, stack: [] } }),
  stackString: J({ ...base, player: { x: 900, y: 1150, stack: 'item_fish_raw' } }),
  stackBadTypes: J({ ...base, player: { x: 900, y: 1150, stack: ['item_fish_raw', 5, null, 'nope'] } }),
  stackTooBig: J({ ...base, player: { x: 900, y: 1150, stack: Array(500).fill('item_log') } }),
  upgradeNegative: J({ ...base, progress: { ...base.progress, up: { capacity: -1, speed: -1 } } }),
  upgradeString: J({ ...base, progress: { ...base.progress, up: { capacity: 'x', speed: 'y' } } }),
  upgradeFloat: J({ ...base, progress: { ...base.progress, up: { capacity: 1.5, speed: 0.5 } } }),
  paidNegative: J({ ...base, progress: { ...base.progress, paid: { zone_forest: -500 } } }),
  progressNull: J({ ...base, progress: null }),
  doneArray: J({ ...base, progress: { done: ['hire_fisherman'], paid: {}, up: {} } }),
  doneSkipAhead: J({ ...base, progress: { done: { hire_hunter: true, hire2_miner: true }, paid: {}, up: {} } }),
  stationsWeird: J({ ...base, stations: { grill: { i: 'abc', o: 1e9 }, bogus: { i: 3 } } }),
  marketBadStock: J({ ...base, market: { stock: { item_fish_cooked: 'lots', item_log: 5 }, cash: 'NaN' } }),
  marketStockArray: J({ ...base, market: { stock: [3, 4], cash: 10 } }),
  marketCashString: J({ ...base, market: { stock: {}, cash: '15' } }),
  cashHuge: J({ ...base, market: { stock: {}, cash: 1e15 } }),
  stackObject: J({ ...base, player: { x: 900, y: 1150, stack: {} } }),
  marketNull: J({ ...base, market: { stock: null, cash: null }, trade: null }),
  // ---- (v4.3 step B) the content level and F0's x drawer
  futureLv46: J({ ...base, v: 8, lv: 46, coins: 999 }),
  futureV9: J({ ...base, v: 9, coins: 999 }),
  futureLvString: J({ ...base, v: 8, lv: '46', coins: 999 }),
  sameLvX: J({ ...base, v: 8, lv: 43, x: { log: [[2, 1, 0, 0, 0]], fest: { last: 20261224 } }, haul: { v: 1, q: [] } }),
  xJunk: J({ ...base, v: 8, lv: 43, x: { log: 'z'.repeat(5000), Bad: 1, mail: [1, 2], constructor: 5 }, missions: 'nope', geumbang: { big: 'y'.repeat(3000) } }),
  xArray: J({ ...base, v: 8, x: [1, 2, 3], lv: 'abc' }),
  // ---- (v4.3 step B, S4) no marker: through the R43 remap
  r43Old: JSON.stringify({ ...base, sites: { e_m1: { b: 'toolsmith', st: 'done' }, w_hall: { b: 'town_hall', st: 'foundation', got: { item_plank: 25 } }, junk: 'x' } }),
  r43Forced: JSON.stringify({ ...base, coins: 321 }),
};
const SWITCH = { r43Forced: 'check' };
const NEWER = ['futureLv46', 'futureV9', 'futureLvString'];

const { page, ctx, log } = await newPage(browser);
await bootToGame(page, URL);
const hide = () => page.evaluate(() => { const g = window.__FV.game; for (const k of ['Game', 'UI']) { const s = g.scene.getScene(k); if (s && s.cameras && s.cameras.main) s.cameras.main.setVisible(false); } });
await hide();
const from = (process.argv.find((a) => a.startsWith('from=')) || '').slice(5);
let results = {};
try { if (from) results = JSON.parse((await import('node:fs')).readFileSync(OUT + '/save_fast_results.json', 'utf8')); } catch (e) { /* */ }
let started = !from;
for (const [name, raw] of Object.entries(variants)) {
  if (!started) { if (name === from) started = true; else continue; }
  const errBefore = log.errors.length;
  const r = await page.evaluate(async ([k, raw, sw]) => {
    const FV = window.__FV, g = FV.game;
    const frames = (n, cond) => new Promise((res, rej) => { const f0 = g.loop.frame, t0 = performance.now(); const iv = setInterval(() => { if (g.loop.frame - f0 >= n || (cond && cond())) { clearInterval(iv); res(g.loop.frame - f0); } else if (performance.now() - t0 > 20000) { clearInterval(iv); rej(new Error('LOOP DEAD: frame counter stuck at ' + g.loop.frame + ' for 20 s')); } }, 16); });
    try { localStorage.setItem(k, raw); } catch (e) { /* */ }
    if (sw) window.__FV_TEST_FAIL43 = sw;
    const gs0 = g.scene.getScene('Game');
    g.scene.stop('UI');
    gs0.scene.restart({ fresh: false });
    await frames(20);
    delete window.__FV_TEST_FAIL43;
    const gs = g.scene.getScene('Game');
    const out = { gameStatus: gs.sys.settings.status, uiActive: g.scene.isActive('UI') };
    if (!g.scene.isActive('UI') || !FV.state) return out;
    for (const sc of ['Game', 'UI']) g.scene.getScene(sc).cameras.main.setVisible(false);
    const s0 = FV.state();
    Object.assign(out, { coins: s0.coins, coinsIsNaN: Number.isNaN(gs.economy.coins), hud: g.scene.getScene('UI').coinText.text, pos: [s0.player.x, s0.player.y], cap: s0.player.capacity, speed: gs.player.speed, stack: s0.player.stack.length, stackTypes: [...new Set(s0.player.stack)].slice(0, 6), done: s0.done, workers: s0.workers.length, market: s0.market, trade: s0.trade, grill: s0.stations.grill, padPaid: Object.fromEntries(Object.entries(gs.progress.pads).map(([id, p]) => [id, p.paid + '/' + p.cost + ' ' + p.costText.text])) });
    // can the chief move?
    const p0 = { x: gs.player.x, y: gs.player.y };
    FV.setInput(1, 0.3); await frames(30); FV.setInput(0, 0);
    out.moved = Math.round(Math.hypot(gs.player.x - p0.x, gs.player.y - p0.y));
    out.posAfter = [gs.player.x, gs.player.y].map((v) => (Number.isFinite(v) ? Math.round(v) : String(v)));
    out.camScroll = [gs.cameras.main.scrollX, gs.cameras.main.scrollY].map((v) => (Number.isFinite(v) ? Math.round(v) : String(v)));
    // can the chief gather?
    FV.clearStack();
    const n = FV.where('net'); FV.teleport(n.x, n.y);
    out.gatherFrames = await frames(240, () => FV.state().player.stack.length >= 2);
    out.gathered = FV.state().player.stack.length;
    // can the chief earn? put 3 cooked fish on the shelf and wait for a sale, then collect
    for (let i = 0; i < 3; i++) gs.market.stock.push('item_fish_cooked', null, gs.effects);
    await frames(240, () => gs.market.cash.value > 0 && !Number.isNaN(gs.market.cash.value));
    out.marketCashAfterSale = String(gs.market.cash.value);
    const c = FV.where('cash'); FV.teleport(c.x, c.y); await frames(40);
    out.coinsAfterCollect = String(gs.economy.coins);
    // what does the next save look like?
    FV.save();
    try { const sv = JSON.parse(localStorage.getItem(k)); out.savedBack = { v: sv.v, lv: sv.lv, lay: sv.v43 ? sv.v43.lay : null, refunds: sv.v43 && sv.v43.refunds43 ? sv.v43.refunds43.coins : null, d_tool: sv.sites && sv.sites.d_tool ? sv.sites.d_tool.b : null, coins: sv.coins, cash: sv.market && sv.market.cash, pos: [sv.player.x, sv.player.y], stackLen: sv.player.stack.length, up: sv.progress.up, paid: sv.progress.paid }; } catch (e) { out.savedBack = 'unreadable ' + e.message; }
    out.warnings = FV.warnings();
    // ((v4.3 step B) the stored text after all of that, and the hold / card)
    out.storedSame = localStorage.getItem(k) === raw;
    out.held = window.__FV_SAVE_HELD || null;
    const hc = document.getElementById('fh-root');
    out.card = !!(hc && !hc.hidden);
    return out;
  }, [KEY, raw, SWITCH[name] || null]).catch((e) => ({ evalError: e.message.split('\n')[0] }));
  r.errors = log.errors.slice(errBefore).map((e) => e.slice(0, 220));
  if (r.evalError && /LOOP DEAD/.test(r.evalError)) r.loopDead = true;
  if (!r.uiActive || r.loopDead) {
    // crashed: does it survive a full reload (the bad save is still there)?
    await page.screenshot({ path: `${OUT}/savefast_${name}_crash.jpg`, type: 'jpeg', quality: 60 });
    await page.reload({ waitUntil: 'load' });
    try {
      await page.waitForFunction(() => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), null, { timeout: 90000 });
      await sleep(300);
      const c = await page.$('canvas'); const b = await c.boundingBox();
      // (v4-C2) the new title may want more than one tap (sound on / skip / start)
      for (let i = 0; i < 8; i++) {
        await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height * 0.6);
        if (await page.waitForFunction(() => window.__FV.game.scene.isActive('UI'), null, { timeout: 2500 }).then(() => true).catch(() => false)) break;
      }
      await sleep(8000);
      r.afterReload = await page.evaluate(() => ({ uiActive: window.__FV.game.scene.isActive('UI'), gameStatus: window.__FV.game.scene.getScene('Game').sys.settings.status, saveStillThere: !!localStorage.getItem('frostVillage.save.v1') }));
      await page.screenshot({ path: `${OUT}/savefast_${name}_after_reload.jpg`, type: 'jpeg', quality: 60 });
    } catch (e) { r.afterReload = 'error ' + e.message.split('\n')[0]; }
    r.errorsAfterReload = log.errors.slice(errBefore + r.errors.length).map((e) => e.slice(0, 220));
    // recover for the next variant
    await page.evaluate(() => localStorage.clear());
    await page.reload({ waitUntil: 'load' });
    await bootToGame(page, URL, { fresh: false });
    await hide();
  }
  results[name] = { raw: raw.slice(0, 160), ...r };
  console.log(name, JSON.stringify(r));
  writeJSON('save_fast_results.json', results);
}
// ((v4.3 step B) the asserted rows)
let bad = 0;
const row = (name, ok, info) => { console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(info).slice(0, 300))); if (!ok) bad++; };
for (const n of NEWER) { const r = results[n]; if (r) row(n + ': held as newer, the card up, the stored text byte-identical after boot + save + play', r.uiActive && r.held === 'newer' && r.card && r.storedSame === true && !(r.errors || []).length, { held: r && r.held, card: r && r.card, same: r && r.storedSame, err: r && r.errors }); }
for (const n of ['sameLvX', 'xJunk', 'xArray']) { const r = results[n]; if (r) row(n + ': loads and plays (no hold), saved back as lv 43', r.uiActive && !r.held && !r.card && r.savedBack && r.savedBack.v === 8 && r.savedBack.lv === 43 && !(r.errors || []).length, { held: r && r.held, savedBack: r && r.savedBack, err: r && r.errors }); }
{ const r = results.r43Old; if (r) row('r43Old: an old save (no marker) loads remapped and plays; saved back on the new map (lay 2, lv 43, the toolsmith on d_tool, refunds43 1,200 + 9 planks)', r.uiActive && !r.held && !r.card && r.savedBack && r.savedBack.lay === 2 && r.savedBack.lv === 43 && r.savedBack.d_tool === 'toolsmith' && r.savedBack.refunds >= 1200 && !(r.errors || []).length, { held: r && r.held, savedBack: r && r.savedBack, err: r && r.errors }); }
{ const r = results.r43Forced; if (r) row('r43Forced: the forced R43 failure holds the save (failed43, the card up), the stored text byte-identical after boot + save + play', r.uiActive && r.held === 'failed43' && r.card && r.storedSame === true && !(r.errors || []).length, { held: r && r.held, card: r && r.card, same: r && r.storedSame, err: r && r.errors }); }
console.log(bad ? '\nsave_fast: ' + bad + ' FAILED' : '\nsave_fast: step-B rows ok');
await browser.close(); await srv.close();
process.exit(bad ? 1 : 0);
