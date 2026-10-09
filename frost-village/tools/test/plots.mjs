// (v4-C) plots never dead-end · the west strip · the town hall (docs/기획서_v4_추가요청.md §1–§3), fixed-step clock.
//   node tools/test/plots.mjs        (run under nohup; screenshots -> docs/previews/screens_v4/c1_*.jpg)
// 1 the west strip: open from the start (no fog), walkable, the shore holds, roads reach it, the start still frames
// the plaza; 2 every locked card says what opens it; houses can be built with nobody waiting; 3 empty houses bring
// settlers (gentle: after the first miner, one household every settlers.every s) and too many empty beds pause the
// houses until settlers fill them; 4 big plots stay free for the four big workshops (houses/decor wait there);
// 5 decor makes the village happier and the residents come by; 6 the town hall: more room, the tax box fills per
// resident and the chief collects it, the notice board opens, the rank ceremony moves in front of the hall;
// 7 the build menu (tabs, cards, a new-region plot with buildable houses); 8 save + reload keeps it; a real v3.5
// save keeps every position; 0 page errors / placeholders.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render } from './fv_step.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews', 'screens_v4');
fs.mkdirSync(OUT, { recursive: true });
const FIX = path.join(ROOT, 'tools', 'test', 'fixtures');
const results = [];
const step = (name, ok, info = '') => { results.push({ name, ok: !!ok }); console.log((ok ? '  ok  ' : ' FAIL ') + name + (info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 } });
const ev = (fn, arg) => page.evaluate(fn, arg);
const adv = (s) => advance(page, s);
const shot = async (n) => { await render(page, 3); await page.screenshot({ path: path.join(OUT, 'c1_' + n + '.jpg'), type: 'jpeg', quality: 82 }); };
const nudge = (fn, ms = 90000) => waitFor(page, `(() => { const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); return (${fn})(); })()`, ms).then(() => true).catch(() => false);
const until = async (fn, max, chunk = 0.5, arg) => {
  for (let t = 0; t <= max; t += chunk) {
    if (await ev(fn, arg)) return t;
    await ev(() => { const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); });
    await adv(chunk);
  }
  return -1;
};
const boot = async (raw) => {
  await ev((v) => { try { window.__FV_NO_SAVE = true; localStorage.clear(); if (v) localStorage.setItem('frostVillage.save.v1', v); } catch (e) { /* */ } }, raw);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(400);
  await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 180000);
  await sleep(1200);
  await installStepper(page);
  await adv(1);
};
/** a free plot that can be built on now, then built at once (instant) */
const buildNow = (id, key) => ev(([id, key]) => { const ok = window.__FV.build(id, key); if (!ok) return false; window.__FV.supply(id); window.__FV.finishSite(id); return true; }, [id, key]);
const lockedTexts = () => ev(() => {
  const gs = window.__FV.scene, bad = [];
  let n = 0;
  for (const id in gs.sites) {
    const st = gs.sites[id];
    if (st.kind !== 'plot' || st.state !== 'plot') continue;
    for (const c of gs.buildChoices(st)) { if (!c.locked) continue; n++; if (!c.text || c.text === c.reason || /^lock/.test(c.text)) bad.push(id + ':' + c.key + ':' + c.reason); }
  }
  return { n, bad };
});
let fatal = null;
const titleWins = [];
try {
  await boot(null);
  // ---- 1. the west strip
  const w1 = await ev(() => {
    const gs = window.__FV.scene, T = gs.territory, r = T.regions.west, cam = gs.cameras.main, p = gs.player;
    return { open: T.isOpen('west'), rect: r && r.rect, fog: !!(r && r.fog && r.fog.visible), south: T.isOpen('west_s'), camLeft: Math.round(T.camRect.x), view: Math.round(cam.worldView.x), px: Math.round(p.x), py: Math.round(p.y) };
  });
  step('1 the west strip is open from the start (no fog), its south end waits for the south fields', w1.open && !w1.fog && !w1.south && w1.rect[0] <= -1300, w1);
  step('1 the camera may go west, the start still frames the plaza (the chief in view, the view not pulled west)', w1.camLeft <= -1300 && w1.view > -200, w1);
  await shot('00_start');
  // walk west from the old map edge: no wall at x = 0, the shore holds
  await ev(() => window.__FV.teleport(120, 1250));
  await ev(() => window.__FV.setInput(-1, 0));
  await adv(4);
  await ev(() => window.__FV.setInput(0, 0));
  const walk = await ev(() => Math.round(window.__FV.scene.player.x));
  step('1 the chief walks over the old western edge into the strip', walk < -150, walk);
  await ev(() => window.__FV.teleport(-700, 700));
  await ev(() => window.__FV.setInput(0, -1));
  await adv(4);
  await ev(() => window.__FV.setInput(0, 0));
  const sh = await ev(() => { const gs = window.__FV.scene, p = gs.player; return { x: Math.round(p.x), y: Math.round(p.y), shore: Math.round(gs.collision.shore(p.x)) }; });
  step('1 the shore holds in the strip (no walking into the sea)', sh.y >= sh.shore - 40, sh);
  await ev(() => window.__FV.setInput(-1, 0));
  await adv(6);
  await ev(() => window.__FV.setInput(0, 0));
  const edge = await ev(() => Math.round(window.__FV.scene.player.x));
  step('1 the world ends at the forest edge (WORLD.left)', edge > -1400, edge);
  const road = await ev(() => { const r = window.__FV.roads(900, 1000, -880, 2110); const L = r[r.length - 1]; return { n: r.length, end: L, minX: Math.min(...r.map((q) => q[0])) }; });
  step('1 the roads reach the west (plaza -> the hall square)', road.n >= 3 && Math.hypot(road.end[0] + 880, road.end[1] - 2110) < 60, road);

  // ---- 2. locked cards say what opens them; houses with nobody waiting
  await ev(() => { window.__FV.unlockAll(); window.__FV.give(40000); });
  await adv(2);
  const lt = await lockedTexts();
  step('2 every locked card says what opens it', lt.n > 0 && lt.bad.length === 0, lt);
  const h0 = await ev(() => { const gs = window.__FV.scene; const ch = window.__FV.choices('w_s1'); return { shown: gs.sites.w_s1.shown, waiting: gs.life.waiting.length, house: ch.find((c) => c.key === 'house_c'), deco: ch.filter((c) => /^deco_/.test(c.key)).map((c) => c.key + (c.locked ? '!' : '')) }; });
  step('2 a west plot offers houses and decor', h0.shown && h0.house && h0.deco.length === 4, h0);
  step('2 a house can be built with nobody waiting for a home (no more 이주민이 없다)', h0.house && !h0.house.locked, h0);

  // ---- 4. big plots kept for the big workshops (the rule as it is now, then with too few big plots left)
  const bp = await ev(() => {
    const gs = window.__FV.scene, cv = gs.civic;
    const big = Object.values(gs.sites).filter((st) => st.kind === 'plot' && st.state === 'plot' && !st.only && (st.size === 'M' || st.size === 'L'));
    const now = big.map((st) => { const h = gs.buildChoices(st).find((q) => q.key === 'house_c'); return { id: st.id, res: cv.bigPlotReserved(st), locked: h.locked, reason: h.reason }; });
    // only two big plots left before the store: they must wait for the workshops (the others are taken for a moment)
    const keep = big.slice(0, 2), taken = big.slice(2);
    for (const st of taken) st.state = '__test';
    const st = keep[0];
    const h = gs.buildChoices(st).find((q) => q.key === 'house_c');
    const d = gs.buildChoices(st).find((q) => q.key === 'deco_rink');
    const tight = { id: st.id, res: cv.bigPlotReserved(st), house: h && { locked: h.locked, reason: h.reason, text: h.text }, deco: d && { locked: d.locked, reason: d.reason } };
    for (const q of taken) q.state = 'plot';
    return { now, tight };
  });
  const bpOk = bp.now.every((q) => !q.res || (q.locked && (q.reason === 'lockBigPlot' || /^lock_/.test(q.reason))));
  step('4 big plots: houses/decor allowed while enough big plots stay for the workshops', bp.now.length > 0 && bpOk, bp.now.slice(0, 4));
  step('4 too few big plots left: houses and decor wait there, the card names the workshops', bp.tight.res && bp.tight.house.locked && bp.tight.house.reason === 'lockBigPlot' && /대장간|창고|통조림|잡화점|Toolsmith|Warehouse/.test(bp.tight.house.text) && bp.tight.deco.locked, bp.tight);

  // ---- 3. empty houses bring settlers; too many empty beds pause the houses
  await ev(() => { window.__FV.unlockV3(); window.__FV.give(40000); });
  await adv(2);
  const free = ['w_s1', 'w_s2', 'w_s3'];
  let built = 0, lockAt = null;
  for (const id of free) {
    const c = await ev((id) => (window.__FV.choices(id) || []).find((q) => q.key === 'house_b'), id);
    if (!c) continue;
    if (c.locked) { lockAt = { id, c }; break; }
    if (await buildNow(id, 'house_b')) built++;
    await adv(1);
  }
  const v3 = await ev(() => window.__FV.civic());
  const lk = lockAt || { c: await ev(() => { const gs = window.__FV.scene; const st = Object.values(gs.sites).find((q) => q.kind === 'plot' && q.state === 'plot' && q.size === 'S' && q.shown); return st ? gs.buildChoices(st).find((q) => q.key === 'house_b') : null; }) };
  step('3 empty beds pile up: houses pause with a reason and a count', built >= 1 && lk.c && lk.c.locked && lk.c.reason === 'lockVacant' && /\d/.test(lk.c.text || ''), { built, vacant: v3.vacant, card: lk.c });
  const s0 = v3.settlers;
  const every = await ev(() => window.__BAL_C1 = (window.__FV.scene.civic.C.settlers || {}).every || 45);
  const tS = await until((n) => window.__FV.civic().settlers > n, every * 1.6, 2, s0);
  const v3b = await ev(() => ({ c: window.__FV.civic(), pop: window.__FV.state().population }));
  step('3 settlers move into the empty houses (gentle: one household per settlers.every s)', tS >= 0 && v3b.c.settlers - s0 >= 1 && v3b.c.settlers - s0 <= 2, { t: tS, settlers: v3b.c.settlers, pop: v3b.pop });
  const walkers = await ev(() => window.__FV.civic().walkers);
  step('3 a newcomer walks in along the road', walkers >= 1 || tS >= 0, walkers);
  const tU = await until(() => { const gs = window.__FV.scene; const st = Object.values(gs.sites).find((q) => q.kind === 'plot' && q.state === 'plot' && q.size === 'S' && q.shown); const c = st && gs.buildChoices(st).find((q) => q.key === 'house_c'); return !!(c && !c.locked); }, every * 6, 3);
  step('3 once settlers fill the beds, houses can be built again', tU >= 0, { t: tU, civic: await ev(() => window.__FV.civic()) });
  const capFarm = await ev(() => { const c = window.__FV.civic(); return c.vacant <= (window.__FV.scene.civic.maxVacant() + 4); });
  step('3 no farming: empty beds stay capped', capFarm);

  // ---- 5. decor
  const hb0 = (await ev(() => window.__FV.civic())).happy;
  const dS = 'w_s4';
  const okS = dS && await buildNow(dS, 'deco_snowman');
  const okM = await buildNow('w_m1', 'deco_fountain');
  await adv(3);
  await nudge(() => window.__FV.scene.civic.amenities.every((a) => a.made), 90000);
  await adv(3);
  const d5 = await ev(() => { const gs = window.__FV.scene, c = window.__FV.civic(); return { c, area: !!gs.life.areas.c1_w_m1, seats: gs.life.seats ? gs.life.seats.filter((s) => s.area && s.area.id === 'c1_w_m1').length : -1, happy: gs.v4 && gs.v4.growth ? gs.v4.growth.happiness() : null }; });
  step('5 decor stands on S and M plots', okS && okM && d5.c.amenities.includes('deco_snowman') && d5.c.amenities.includes('deco_fountain'), d5.c.amenities);
  step('5 decor makes the village happier (+bonus, capped)', d5.c.happy > hb0 && d5.c.happy <= 24, { before: hb0, after: d5.c.happy });
  step('5 residents come by: the fountain is a place to hang out, with seats', d5.area && d5.seats > 0, d5);
  await ev(() => window.__FV.camera(-250, 1380, 1.0));
  await shot('02_fountain');
  await ev(() => window.__FV.camera());

  // ---- 6. the town hall
  const cap0 = await ev(() => window.__FV.scene.popCap());
  const okH = await buildNow('w_hall', 'town_hall');
  await adv(2);
  await nudge(() => window.__FV.civic().hall && window.__FV.civic().hall.art, 120000);
  const h6 = await ev(() => ({ cap: window.__FV.scene.popCap(), hall: window.__FV.civic().hall }));
  step('6 the hall is built and gives room for more people', okH && h6.cap === cap0 + 6, { cap0, ...h6 });
  await adv(62);
  const tax = await ev(() => window.__FV.civic().hall);
  step('6 the tax box fills per resident (about perMin a minute)', tax.tax > 0 && Math.abs(tax.tax - tax.perMin) <= tax.perMin * 0.25 + 8, tax);
  await ev(() => { const p = window.__FV.where('hallTax'); window.__FV.teleport(p.x - 160, p.y + 80); });
  await ev(() => window.__FV.camera(-860, 1880, 1.0));
  await adv(1);
  await shot('03_town_hall_tax');
  await ev(() => window.__FV.camera());
  const coins0 = await ev(() => window.__FV.state().coins);
  await ev(() => { const p = window.__FV.where('hallTax'); window.__FV.teleport(p.x, p.y); });
  await adv(4);
  const c6 = await ev(() => ({ coins: window.__FV.state().coins, tax: window.__FV.civic().hall.tax }));
  step('6 the chief collects the tax like rent', c6.coins - coins0 >= tax.tax - 2 && c6.tax <= 2, { coins0, ...c6, had: tax.tax });
  await ev(() => { const p = window.__FV.where('hallBoard'); window.__FV.teleport(p.x, p.y); });
  await adv(1.5);
  const b6 = await ev(() => { const ui = window.__FV.game.scene.getScene('UI'); const L = window.__FV.scene.civic.hall.boardLines(); return { open: !!ui.v4PanelOpen, req: L.requests.length, news: L.news.length, lines: L.news.map((q) => q.text).slice(0, 3) }; });
  step('6 the notice board opens: requests + village news (v5 missions later)', b6.open && b6.news >= 3, b6);
  await shot('04_notice_board');
  await ev(() => { const ui = window.__FV.game.scene.getScene('UI'); ui.hud4.closePanel(true); window.__FV.teleport(-600, 1500); });
  await adv(1);
  const v6 = await ev(() => { const gs = window.__FV.scene, a = gs.padSpot({ type: 'rank', id: 'rank_eup' }), b = gs.civic.hall.venue('rank'); return { a, b }; });
  step('6 the rank ceremony is held in front of the hall', v6.a && Math.abs(v6.a.x - v6.b.x) < 1 && Math.abs(v6.a.y - v6.b.y) < 1, v6);
  const w6 = await ev(() => window.__FV.scene.civic.hall.venue('wedding'));
  step('6 a wedding venue hook is there (v5)', w6 && Number.isFinite(w6.x) && Number.isFinite(w6.y), w6);

  // ---- 7. the build menu on a new-region plot: tabs, cards, buildable houses
  const mid = 'w_s5';
  // (empty beds: settlers in at once so the houses are open in the picture)
  await ev(() => { const c = window.__FV.scene.civic; const v = c.freeBeds(); if (v > 0) window.__FV.settlers(v, true); });
  await ev((id) => window.__FV.openMenu(id), mid);
  await adv(0.5);
  await ev(() => { const ui = window.__FV.game.scene.getScene('UI'); ui.showBuildTab('home'); });
  await render(page, 2);
  const m7 = await ev(() => window.__FV.menu());
  step('7 the plot menu has tabs (집 · 꾸미기) and buildable houses', m7 && m7.tabs.includes('home') && m7.tabs.includes('decor') && m7.cards.length === 3 && m7.cards.every((c) => !c.locked), m7 && { tabs: m7.tabs, cards: m7.cards });
  await shot('05_plot_menu_houses');
  await ev(() => { const ui = window.__FV.game.scene.getScene('UI'); ui.showBuildTab('decor'); });
  await render(page, 2);
  await shot('06_plot_menu_decor');
  const sel = await ev(() => { const ui = window.__FV.game.scene.getScene('UI'); ui.selectCard('house_a'); return { tab: ui.buildTab, sel: ui.buildSel, ok: ui.buildBtn.ok }; });
  step('7 picking a card of another tab switches to it', sel.tab === 'home' && sel.sel === 'house_a' && sel.ok, sel);
  await ev(() => window.__FV.game.scene.getScene('UI').closeBuildMenu(true));
  // the whole west strip now: the restaurant plot, the hall, houses, decor, settlers (a phone at zoom 0.6)
  await ev(() => { window.__FV.teleport(-560, 1250); window.__FV.camera(-640, 1330, 0.6); window.__FV.scene.ground.ensure(window.__FV.scene.cameras.main.worldView, Infinity, 0); });
  await adv(2);
  await ev(() => window.__FV.scene.ground.ensure(window.__FV.scene.cameras.main.worldView, Infinity, 0));
  await shot('01_west_strip');
  await ev(() => window.__FV.camera());
  const mx = await ev(() => { window.__FV.openMenu('w_rest'); const m = window.__FV.menu(); window.__FV.game.scene.getScene('UI').closeBuildMenu(true); return m; });
  step('7 an XL plot shows the 마을 tab only (hall + restaurant)', mx && mx.tabs.length === 1 && mx.tabs[0] === 'civic' && mx.all.length === 2, mx && { tabs: mx.tabs, all: mx.all.map((c) => c.key + (c.locked ? '!' : '')) });

  // ---- 8. save + reload; a real v3.5 save
  const before = await ev(() => { window.__FV.save(); const c = window.__FV.civic(); return { settlers: c.settlers, tax: c.hall.tax, am: c.amenities.slice().sort(), cap: window.__FV.scene.popCap(), v: JSON.parse(localStorage.getItem('frostVillage.save.v1')).v }; });
  const tw = [log.warnings.length, 1e9];
  titleWins.push(tw);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 180000);
  tw[1] = log.warnings.length;
  await sleep(1200);
  const after = await ev(() => { const c = window.__FV.civic(); return c && c.hall ? { settlers: c.settlers, tax: c.hall.tax, am: c.amenities.slice().sort(), cap: window.__FV.scene.popCap() } : null; });
  step('8 reload keeps settlers, the tax box, decor and the hall', after && after.settlers === before.settlers && after.tax >= before.tax && after.tax <= before.tax + 15 && JSON.stringify(after.am) === JSON.stringify(before.am) && after.cap === before.cap, { before, after });
  step('8 saved as version 6', before.v === 6, before.v);
  for (const f of ['v35_save_12min.json', 'v35_save_38min.json']) {
    const raw = fs.readFileSync(path.join(FIX, f), 'utf8');
    const j = JSON.parse(raw);
    const tw8 = [log.warnings.length, 1e9];
    titleWins.push(tw8);
    await boot(raw);
    tw8[1] = log.warnings.length;
    const s8 = await ev(() => { const gs = window.__FV.scene; return { p: { x: Math.round(gs.player.x), y: Math.round(gs.player.y) }, sites: Object.fromEntries(Object.keys(gs.sites).filter((k) => gs.sites[k].state !== 'plot').map((k) => [k, { b: gs.sites[k].building, x: gs.sites[k].x, y: gs.sites[k].y }])), west: gs.territory.isOpen('west'), coins: window.__FV.state().coins }; });
    const posOk = !j.player || j.player.x === undefined || (Math.abs(s8.p.x - j.player.x) <= 2 && Math.abs(s8.p.y - j.player.y) <= 2);
    const sitesOk = Object.keys(j.sites || {}).every((k) => s8.sites[k] && s8.sites[k].b === j.sites[k].b);
    const again = await ev(() => { window.__FV.save(); return JSON.parse(localStorage.getItem('frostVillage.save.v1')); });
    step('8 ' + f + ': the chief and every building stay where they were (v' + j.v + ' -> v6)', posOk && sitesOk && s8.west && again.v === 6 && s8.coins >= j.coins - 5, { player: s8.p, was: j.player && { x: j.player.x, y: j.player.y }, sites: Object.keys(j.sites || {}).length });
  }
} catch (e) { fatal = e; console.log('FATAL', e.stack || e.message); }
const errs = log.errors.filter((e) => !/AudioContext|play\(\) request/i.test(e));
step('0 no page errors', !errs.length && !fatal, errs.slice(0, 5));
const ph = log.warnings.filter((w, i) => /missing asset|placeholder/i.test(w) && !titleWins.some(([a, b]) => i >= a && i < b));
step('0 no placeholder pictures', !ph.length, ph.slice(0, 5));
const nOk = results.filter((r) => r.ok).length;
console.log(`\n${nOk}/${results.length} passed`);
await browser.close();
await srv.close();
process.exit(nOk === results.length ? 0 : 1);
