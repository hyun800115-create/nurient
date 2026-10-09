// v3.5 -> v4 save migration (docs/v4_plan.md §12, §16.1). Never wipe progress.
//   node tools/test/save_v4.mjs             Node part: migration + sanitize (real v3.5 saves in tools/test/fixtures/,
//                                           made by the v3.5 build's smart bot at 0.5 / 12 / 21 / 38 game minutes),
//                                           a full v4 block round trip, 20 corrupted v4 shapes
//   node tools/test/save_v4.mjs --browser   also boots the game: every fixture loads with nothing lost (the ones
//                                           past tower_east get the rail strip + the ruin), the corrupted shapes boot,
//                                           reloads mid-founding / mid-train / mid-ceremony, the v4 block passes
//                                           through a save where the neighbours are not there yet, idle income
//                                           over 120 s within ±6 % of the v3.5 build (when --v35 <dir> is given)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MIGRATE, sanitizeSave, sanitizeV4, SAVE_VERSION } from '../../src/core/Save.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const fail = [];
const check = (name, ok, info = '') => { console.log((ok ? '  ok  ' : ' FAIL ') + name + (info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 400) : '')); if (!ok) fail.push(name); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const migrate = (o) => { o = clone(o); while (o.v !== SAVE_VERSION) o = MIGRATE[o.v](o); return sanitizeSave(o); };

check('SAVE_VERSION is 5 or later (v4: 5, v4.1: 6)', SAVE_VERSION >= 5, String(SAVE_VERSION));
check('a v4 (v3.5) -> v5 step exists', typeof MIGRATE[4] === 'function');

// ---------------------------------------------------------------- real v3.5 saves
const fixtures = fs.existsSync(FIX) ? fs.readdirSync(FIX).filter((f) => /^v35_save_.*\.json$/.test(f)).sort() : [];
check('real v3.5 saves present (0.5 / 12 / 21 / 38 min)', fixtures.length >= 4, fixtures.join(', '));
const FX = {};
for (const f of fixtures) {
  const raw = JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
  FX[f] = raw;
  const s = migrate(raw);
  const doneA = Object.keys(raw.progress.done || {}).filter((k) => raw.progress.done[k]), doneB = Object.keys(s.progress.done).filter((k) => s.progress.done[k]);
  check(f + ': version 4 -> ' + SAVE_VERSION, raw.v === 4 && s.v === SAVE_VERSION);
  check(f + ': coins, steps, upgrades kept', s.coins === raw.coins && doneA.every((k) => s.progress.done[k]) && doneB.length >= doneA.length && JSON.stringify(s.progress.up) === JSON.stringify(raw.progress.up), { coins: [raw.coins, s.coins], done: [doneA.length, doneB.length] });
  check(f + ': stations, shelves, residents, land, sites kept', JSON.stringify(s.stations) === JSON.stringify(sanitizeSave(clone(raw)).stations) && (s.life ? s.life.moved.length : 0) === ((raw.life && raw.life.moved) || []).length && JSON.stringify(s.territory) === JSON.stringify(sanitizeSave(clone(raw)).territory) && Object.keys(s.sites || {}).length === Object.keys(raw.sites || {}).length);
  check(f + ': labour piles and the dog kept', JSON.stringify(s.labour) === JSON.stringify(sanitizeSave(clone(raw)).labour) && JSON.stringify(s.dog) === JSON.stringify(sanitizeSave(clone(raw)).dog));
}

// ---------------------------------------------------------------- a full v4 block round trip
const full = {
  v: 1, clock: { t: 312.5, day: 3, on: true },
  town: { seed: 2611, open: true, extra: [[100, 'keeper', 'lotA1'], [101, 'resident', 'lotA1'], [109, 'resident', 'lotH1']], regulars: [[46, 2], [48, 1]] },
  orders: { cards: [{ shop: null, need: { item_bread: 40 }, got: { item_bread: 7 }, idle: 21 }, { shop: 'supermarket', need: { item_can: 30 }, got: { item_can: 4 }, idle: 3 }], done: ['cafe', 'restaurant'], standing: 2 },
  cargo: { item_bread: 3 },
  shops: { lotA1: { shop: 'cafe', st: 'open', t: 0, stock: { item_bread: 5 } }, lotA2: { shop: 'restaurant', st: 'ribbon', t: 12.5, stock: {} }, lotA3: { shop: 'carpenter_workshop', st: 'build', t: 7, stock: {} } },
  houses: { lotH1: { st: 'done', got: { item_plank: 20 }, t: 30, look: 2 }, lotH2: { st: 'site', got: { item_plank: 6 }, t: 0, look: 1 } },
  cash: 1234, rentAcc: 55, happy: { n: 12, sum: 9.5 }, rank: 2, porters: 1,
};
const rt = sanitizeV4(clone(full));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
check('v4 round trip: clock', eq(rt.clock, full.clock), rt.clock);
check('v4 round trip: town (seed, open, households, regulars)', eq(rt.town, full.town), rt.town);
check('v4 round trip: order cards, done, standing', rt.orders.cards.length === 2 && rt.orders.cards[0].got.item_bread === 7 && rt.orders.cards[1].shop === 'supermarket' && eq(rt.orders.done, full.orders.done) && rt.orders.standing === 2, rt.orders);
check('v4 round trip: shops (state, timer, stock)', eq(rt.shops, full.shops), rt.shops);
check('v4 round trip: houses', eq(rt.houses, full.houses), rt.houses);
check('v4 round trip: 역 금고, rent, happiness, rank, porters, cargo', rt.cash === 1234 && rt.rentAcc === 55 && eq(rt.happy, full.happy) && rt.rank === 2 && rt.porters === 1 && rt.cargo.item_bread === 3);
// the whole save keeps the block
const whole = migrate(Object.assign(clone(FX[fixtures[fixtures.length - 1]] || { v: 4, coins: 1, progress: { done: {} } }), { v4: clone(full) }));
check('the save keeps its v4 block through migrate + sanitize', whole.v4 && whole.v4.rank === 2 && eq(whole.v4.shops, full.shops));

// ---------------------------------------------------------------- 20 corrupted v4 shapes
const bad = [
  null, 7, 'x', [], { clock: 'noon' }, { clock: { t: -5, day: -2, on: 'yes' } },
  { town: { seed: 'a', open: 1, extra: [[1, 'KEEPER!', 'lot A1'], 'junk', [NaN, 'keeper']] } },
  { orders: { cards: 'three' } }, { orders: { cards: [{ shop: 'casino', need: { item_bread: 5 } }, { need: { item_gold: 9 } }, { need: { item_bread: -3 } }, null] } },
  { orders: { cards: [{ need: { item_bread: 1e9 }, got: { item_bread: 1e9 }, idle: 1e12 }], done: ['cafe', 'cafe', 'bank', 7] } },
  { shops: { lotZZ: { shop: 'cafe', st: 'open' }, lotA1: { shop: 'cafe', st: 'party', t: 1e9, stock: { item_bread: -4, item_gold: 3 } }, lotA2: { shop: 'cafe' } } },
  { shops: 'all of them' }, { houses: { lotA1: { st: 'done' }, lotH1: { st: 'flying', got: 'lots', t: -1, look: 99 } } },
  { cash: -100, rentAcc: 1e12 }, { cash: 'rich', rentAcc: NaN }, { happy: { n: 1e9, sum: -5 } }, { happy: 'very' },
  { rank: 9, porters: 99 }, { cargo: { item_bread: 1e9, item_gold: 3 } }, { v: 99, clock: { t: 1e9 }, town: { extra: new Array(500).fill([1, 'resident', 'lotA1']) } },
];
check('20 corrupted shapes', bad.length === 20);
let threw = 0, ok20 = 0;
for (const b of bad) {
  try {
    const r = sanitizeV4(clone(b));
    if (r === null || (r.v === 1 && r.cash >= 0 && r.cash <= 1e9 && r.rank >= 1 && r.rank <= 2 && r.porters <= 2 && r.orders.cards.length <= 3 && Object.values(r.shops).every((s) => ['wait', 'build', 'ribbon', 'open'].includes(s.st)) && r.town.extra.length <= 64 && r.happy.sum <= r.happy.n && r.happy.n <= 200 && r.clock.t <= 3600)) ok20++;
  } catch (e) { threw++; }
}
check('corrupted v4 blocks never throw and come out bounded', threw === 0 && ok20 === bad.length, { threw, ok: ok20 });
const one = sanitizeV4({ shops: { lotA1: { shop: 'cafe', st: 'open' }, lotA2: { shop: 'cafe', st: 'open' } } });
check('one shop of a kind', Object.keys(one.shops).length === 1);
const lotClash = sanitizeV4({ shops: { lotA1: { shop: 'cafe', st: 'open' } }, houses: { lotA1: { st: 'done' } } });
check('a house never on a shop lot', !lotClash.houses.lotA1);

// ---------------------------------------------------------------- browser part
if (args.includes('--browser')) {
  const { start } = await import('./serve.mjs');
  const { launch, openPage, tapStart, sleep, waitFor } = await import('./pw.mjs');
  const { installStepper, advance } = await import('./fv_step.mjs');
  const srv = await start(0, { prefix: '/fv/' });
  const browser = await launch();
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 } });
  const ev = (fn, a) => page.evaluate(fn, a);
  const KEY = 'frostVillage.save.v1';
  const nudge = (fn, ms = 60000) => waitFor(page, `(() => { const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); return (${fn})(); })()`, ms).then(() => true).catch(() => false);
  /** boot the game with `raw` (a save string or object) in localStorage; returns false when it did not start */
  const boot = async (raw) => {
    // (__FV_NO_SAVE: the running game's pagehide autosave must not overwrite the save we just put there)
    await ev(([k, v]) => { try { window.__FV_NO_SAVE = true; localStorage.clear(); if (v !== null) localStorage.setItem(k, v); } catch (e) { /* */ } }, [KEY, raw === null ? null : (typeof raw === 'string' ? raw : JSON.stringify(raw))]);
    await page.reload({ waitUntil: 'load' });
    await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
    await sleep(300);
    await tapStart(page);
    const up = await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 120000).then(() => true).catch(() => false);
    if (!up) return false;
    await sleep(500);
    await installStepper(page);
    await advance(page, 2);
    return true;
  };
  const errs0 = () => log.errors.length;
  try {
    // every real v3.5 save loads, nothing lost
    for (const f of fixtures) {
      const raw = FX[f];
      const e0 = errs0();
      const up = await boot(raw);
      const st = up ? await ev(() => { const s = window.__FV.state(); return { coins: s.coins, done: Object.keys(window.__FV.scene.progress.done).length, moved: window.__FV.scene.life ? window.__FV.scene.life.moved.length : 0, rail: window.__FV.scene.territory.isOpen('rail'), v4: !!window.__FV.scene.v4 }; }) : null;
      const doneA = Object.keys(raw.progress.done || {}).filter((k) => raw.progress.done[k]).length;
      check('browser ' + f + ': boots, coins / steps / residents kept', up && st && st.coins >= raw.coins - 5 && st.done >= doneA && st.moved >= ((raw.life && raw.life.moved) || []).length, st);
      if (raw.progress.done && raw.progress.done.tower_east) {
        await nudge(() => window.__FV.scene.v4 && window.__FV.scene.v4.ready, 60000);
        const r = await ev(() => { const gs = window.__FV.scene, st = gs.sites.r_station; return { rail: gs.territory.isOpen('rail'), ruin: !!(st && st.state === 'plot' && gs.v4.ours && !gs.v4.ours.open) }; });
        check('browser ' + f + ': past tower_east -> the rail strip and the ruin', r.rail && r.ruin, r);
      }
      // saved again as v5, still everything there
      const again = await ev((k) => { window.__FV.save(); return JSON.parse(localStorage.getItem(k)); }, KEY);
      check('browser ' + f + ': saved again as v' + SAVE_VERSION, again.v === SAVE_VERSION && again.coins >= raw.coins - 5);
      check('browser ' + f + ': no page errors', errs0() === e0, log.errors.slice(e0, e0 + 3));
    }
    // the corrupted v4 shapes boot (inside a real save)
    const base = FX[fixtures[fixtures.length - 1]] || { v: 4, coins: 100, progress: { done: {} } };
    let booted = 0;
    const e1 = errs0();
    for (const b of bad) { const s = Object.assign(clone(base), { v: 5, v4: b }); if (await boot(s)) booted++; }
    check('20 corrupted v4 blocks: the game boots every time', booted === bad.length && errs0() === e1, { booted, errors: log.errors.slice(e1, e1 + 3) });
    // pass-through: a save whose village has no tower_east yet keeps its v4 block (Neighbours not built)
    const early = FX[fixtures[0]];
    await boot(Object.assign(clone(early), { v: 5, v4: clone(full) }));
    const pt = await ev((k) => { window.__FV.save(); const s = JSON.parse(localStorage.getItem(k)); return { nb: !!window.__FV.scene.v4, v4: s.v4 }; }, KEY);
    check('the v4 block passes through while the neighbours are not there', !pt.nb && pt.v4 && pt.v4.rank === 2 && pt.v4.shops && pt.v4.shops.lotA1 && pt.v4.shops.lotA1.shop === 'cafe', { nb: pt.nb, rank: pt.v4 && pt.v4.rank });
    // reloads mid-founding / mid-train / mid-ceremony (a fresh v4 run through the hooks)
    await boot(null);
    await ev(() => { window.__FV.unlockV3(); window.__FV.give(50000); });
    await advance(page, 2);
    await nudge(() => window.__FV.scene.v4 && window.__FV.scene.v4.ready, 90000);
    await ev(() => window.__FV.v4.repair());
    await nudge(() => window.__FV.hasTex('train_engine') && window.__FV.scene.v4.town && window.__FV.state().v4.tf && window.__FV.state().v4.tf.adult, 120000);
    for (let k = 0; k < 30 && !(await ev(() => window.__FV.state().v4.arrivals > 0)); k++) await advance(page, 1);
    await advance(page, 2);
    await ev(() => window.__FV.v4.fill(0));
    await advance(page, 1);
    await ev(() => { const s = Object.values(window.__FV.scene.v4.growth.shops)[0]; if (s) s.startBuild(false, 9); });
    await advance(page, 2);
    const mid = await ev(() => { window.__FV.save(); const s = Object.values(window.__FV.v4.growth().shops)[0]; return { shop: s && s.shop, st: s && s.st, t: s && s.t, train: window.__FV.v4.state().train, coins: window.__FV.state().coins, till: window.__FV.v4.growth().till }; });
    const saved = await ev((k) => localStorage.getItem(k), KEY);
    await boot(saved);
    await nudge(() => window.__FV.scene.v4 && window.__FV.scene.v4.ready && window.__FV.scene.v4.growth && Object.keys(window.__FV.scene.v4.growth.shops).length > 0, 60000);
    await advance(page, 1);
    const back = await ev(() => { const s = Object.values(window.__FV.v4.growth().shops)[0]; return { shop: s && s.shop, st: s && s.st, t: s && s.t, coins: window.__FV.state().coins, till: window.__FV.v4.growth().till }; });
    check('reload mid-founding: the build goes on where it was', back.shop === mid.shop && back.st === 'build' && back.t >= mid.t - 0.5 && back.t <= mid.t + 4, { mid, back });
    check('reload mid-founding: coins and 역 금고 kept', Math.abs(back.coins - mid.coins) < 30 && Math.abs(back.till - mid.till) < 30, { mid, back });
    // (v4 review C1) a reload with the repaired station: real pictures for the station, the town and the shops (no
    // placeholder cached before the late town manifest arrived)
    await advance(page, 3);
    const art = await ev(() => { const nb = window.__FV.scene.v4, ph = (o) => !!(o && o.texture && /^ph__/.test(o.texture.key)); return { warnings: window.__FV.warnings(), ours: nb.ours && nb.ours.img ? nb.ours.img.texture.key : null, phBld: (nb.buildings || []).filter((b) => ph(b.img)).length, phShops: Object.values(nb.growth.shops).filter((s) => ph(s.bld && s.bld.img) || ph(s.siteImg)).length }; });
    check('reload with the station repaired: no placeholder art (station / town / shops), no missing-asset warnings', art.warnings.length === 0 && art.ours && !/^ph__/.test(art.ours) && art.phBld === 0 && art.phShops === 0, art);
    // mid-train: the train between stations
    await ev(() => window.__FV.v4.train('toOurs', 6));
    await advance(page, 0.5);
    const tr0 = await ev(() => { window.__FV.save(); return window.__FV.v4.state().train; });
    await boot(await ev((k) => localStorage.getItem(k), KEY));
    await nudge(() => window.__FV.scene.v4 && window.__FV.scene.v4.ready, 60000);
    await advance(page, 1);
    const tr1 = await ev(() => window.__FV.v4.state().train);
    check('reload mid-train: the timetable resumes (no stuck train)', !!tr1 && typeof tr1.phase === 'string', { before: tr0 && tr0.phase, after: tr1 && tr1.phase });
    // mid-ceremony: the rank was paid, the reload lands in 읍 with every reward
    await ev(() => { const nb = window.__FV.scene.v4; nb.rank.ceremony(false); });
    await advance(page, 2);
    await ev(() => window.__FV.save());
    await boot(await ev((k) => localStorage.getItem(k), KEY));
    await nudge(() => window.__FV.scene.v4 && window.__FV.scene.v4.ready, 60000);
    await advance(page, 3);
    const cer = await ev(() => { const nb = window.__FV.scene.v4; const rn = window.__FV.scene.roadNet || nb.roadNet; return { level: nb.rank.level, ceremony: nb.rank.ceremonyOn, cobble: rn ? rn.cellList(1).filter((c) => c.cls === 1).length : 0, coaches: nb.rail.consist().length }; });
    check('reload mid-ceremony: 읍 with its rewards, no half ceremony', cer.level === 2 && !cer.ceremony && cer.cobble > 0 && cer.coaches >= 3, cer);
    const w2 = await ev(() => window.__FV.warnings());
    check('reload in 읍: no missing-asset warnings', w2.length === 0, w2.slice(0, 5));
    // idle income over 120 s (v4 build) vs the v3.5 build, same save (needs --v35 <dir of the v3.5 build>)
    const V35 = opt('--v35', '');
    const last = FX[fixtures[fixtures.length - 1]];
    const idle = async (pg, raw) => {
      await pg.evaluate(([k, v]) => { window.__FV_NO_SAVE = true; localStorage.clear(); localStorage.setItem(k, v); }, [KEY, JSON.stringify(raw)]);
      await pg.reload({ waitUntil: 'load' });
      await waitFor(pg, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
      await sleep(300);
      await tapStart(pg);
      await waitFor(pg, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 120000);
      await sleep(1500);
      await installStepper(pg);
      await advance(pg, 5);
      // (coins + what waits on the cash pads: market, trade post, general store)
      const money = () => pg.evaluate(() => { const gs = window.__FV.scene, v = (c) => (c && c.cash ? Number(c.cash.value) || 0 : 0); return gs.economy.coins + v(gs.market) + v(gs.trade) + v(gs.store); });
      const a = await money();
      await advance(pg, 120);
      const b = await money();
      return b - a;
    };
    if (V35 && last) {
      const srv2 = await start(0, { prefix: '/fv/', root: V35 });
      const p2 = await openPage(browser, srv2.url + 'index.html', { viewport: { width: 390, height: 844 } });
      // (two runs each: one 120 s run swings ±6 % on its own with the random customers)
      const inc35 = Math.round(((await idle(p2.page, last)) + (await idle(p2.page, last))) / 2);
      const inc4 = Math.round(((await idle(page, last)) + (await idle(page, last))) / 2);
      const diff = inc35 ? Math.abs(inc4 - inc35) / Math.max(1, inc35) : 0;
      check('idle income over 120 s (mean of 2 runs) within ±6 % of v3.5 (' + inc4 + ' vs ' + inc35 + ')', diff <= 0.06, { inc4, inc35, diff: +diff.toFixed(3) });
      await srv2.close();
    } else console.log('  (skipped: idle income vs v3.5 — pass --v35 <dir of the v3.5 build>)');
  } catch (e) { check('browser part ran', false, e && e.stack || String(e)); }
  await browser.close();
  await srv.close();
}

console.log(fail.length ? `\nFAIL (${fail.length})` : '\nPASS');
process.exit(fail.length ? 1 : 0);
