// (v4.2.1 물류 손질 / L0) the designer's screenshots (docs/logistics_plan.md §B1) -> docs/previews/screens_v421/
//   node tools/test/shots_v421.mjs [--only 01,02] [--size 390x844] [--dpr 2] [--lang ko] [--suffix _360]
// 01 the 창고 card at village complete (the 25-min save, the build menu on a free M plot)
// 02 the forced no-plot case: the goal line '빈 땅이 생기면 창고를 지을 수 있어요'
// 03 a raw porter waiting at a full station (the 광석 짐꾼 by the ore pile: the smelter's input full; he does not walk away)
// 04 the 창고 crew carrying fish from the fish pile to the 통조림 공장 (the link)
// 05 a 창고 직원 walking in with the arrival banner
// 06 a 솔방울 shop selling after 읍 (its town buyers come every 20 s)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const REPO = path.resolve(opt('--repo', path.resolve(HERE, '..', '..')));
const OUT = path.resolve(opt('--out', path.join(HERE, '..', '..', 'docs', 'previews', 'screens_v421')));
fs.mkdirSync(OUT, { recursive: true });
const ONLY = opt('--only', '') ? opt('--only', '').split(',') : null;
const [W, H] = opt('--size', '390x844').split('x').map(Number);
const DPR = Number(opt('--dpr', '2'));
const LANG = opt('--lang', 'ko');
const SUFFIX = opt('--suffix', '');
const fixture = (n) => fs.readFileSync(path.join(HERE, 'fixtures', n), 'utf8');
const { start } = await import(path.join(REPO, 'tools/test/serve.mjs'));
const { launch, openPage, tapStart, sleep, waitFor } = await import(path.join(HERE, 'pw.mjs'));

const SCENES = [
  { name: '01_warehouse_card', save: 'v41_save_smart_25min.json', secs: 1, menu: true, setup: () => {
    const gs = window.__FV.scene; if (gs.economy.coins < 2000) gs.economy.add(2000 - gs.economy.coins);
    const id = ['w_m1', 'w_m2', 'e_m2'].find((k) => gs.sites[k] && gs.sites[k].state === 'plot' && gs.sites[k].shown);
    const st = gs.sites[id]; window.__FV.teleport(st.dropX, st.dropY + 60); window.__FV.openMenu(id);
    return { x: st.x, y: st.y, z: 1.0 };
  } },
  { name: '02_warehouse_wait_plot', save: 'v41_save_smart_25min.json', secs: 2, setup: () => {
    const gs = window.__FV.scene, pr = gs.progress;
    for (const k in gs.sites) { const st = gs.sites[k]; if (st.kind === 'plot' && st.state === 'plot' && (st.size === 'M' || st.size === 'L') && !st.only) { if (st.setShown) st.setShown(false); else st.shown = false; } }
    // (the goal that waits for a plot, as when nothing else is left to do)
    pr.nextGoal = () => ({ id: 'warehouse', kind: 'build', waitPlot: true });
    // (empty hands, away from the stalls and cash pads: no carry / cash hint takes the line over)
    // (no "pick up the coins first" lead: the tills emptied into the purse, as if the chief had just walked past them)
    window.__FV.clearStack();
    for (const c of gs.tutorial.cashes(true)) { const n = c.takeAll ? c.takeAll(null) : 0; if (n > 0) gs.economy.add(n); }
    // (forced case, for the shot only: the cash / buy-a-pad leads off, so the goal line is the one that shows)
    gs.tutorial.cashHint = () => false; gs.tutorial.nextAction = () => false; pr.affordablePad = () => null;
    const w = gs.sites.w_m1 || gs.sites.w_m2; window.__FV.teleport(w.x + 40, w.y + 160);
    return { x: w.x + 20, y: w.y + 60, z: 1.0 };
  } },
  { name: '03_raw_porter_waits', save: 'v41_save_smart_46min.json', secs: 8, setup: () => {
    const gs = window.__FV.scene, fx = gs.effects, st = gs.stations.smelter, pile = gs.piles.ore;
    while (st.inStack.count < st.inStack.max) st.inStack.push('item_ore', null, fx);
    while (pile.stack.count < pile.stack.max) pile.stack.push('item_ore', null, fx);
    window.__hold = () => { while (st.inStack.count < st.inStack.max) st.inStack.push('item_ore', null, fx); };
    window.__FV.teleport(pile.x - 500, pile.y + 300);
    return { x: (pile.x + st.inPad.x) / 2, y: (pile.y + st.inPad.y) / 2 + 20, z: 1.1 };
  } },
  { name: '04_crew_fish_to_cannery', save: 'v41_save_smart_46min.json', secs: 0, setup: () => {
    const gs = window.__FV.scene, fx = gs.effects, C = gs.workshops.find((w) => w.kind === 'cannery'), pile = gs.piles.fish;
    for (const s of gs.sources()) { if (!s.outStack || s === C) continue; while (s.outStack.count > s.outStack.max * 0.3) { const it = s.outStack.pop(); if (it && it.spr) fx.releaseItem(it.spr); else if (!it) break; } }
    while (C.inStack.countOf('item_fish_raw') > 0) { const it = C.inStack.pop('item_fish_raw'); if (it && it.spr) fx.releaseItem(it.spr); }
    while (pile.stack.count < pile.stack.max) pile.stack.push('item_fish_raw', null, fx);
    for (const k in gs.piles) if (k !== 'fish') { const p = gs.piles[k]; while (p.stack.count > p.stack.max * 0.5) { const it = p.stack.pop(); if (it && it.spr) fx.releaseItem(it.spr); else if (!it) break; } }
    // wait until a 창고 직원 walks with fish to the cannery, then until he is on the last stretch (the cannery in view)
    for (let i = 0; i < 240; i++) { window.__run(0.5); const p = gs.warehouse.porters.find((q) => q.job && q.job.kind === 'link' && q.state === 'haul' && q.stack.count >= 4); if (p) { window.__who = p; break; } }
    const p = window.__who || gs.warehouse.porters[0], ip = C.inPad || C;
    for (let i = 0; i < 200 && window.__who && p.state === 'haul' && Math.hypot(p.x - ip.x, p.y - ip.y) > 420; i++) window.__run(0.25);
    window.__FV.teleport(p.x - 700, p.y + 500);
    window.__linkShot = { found: !!window.__who, state: p.state, carried: p.stack.count, type: p.carriedType && p.carriedType(), d: Math.round(Math.hypot(p.x - ip.x, p.y - ip.y)) };
    return { x: (p.x + ip.x) / 2, y: (p.y + ip.y) / 2 - 40, z: 0.72 };
  } },
  { name: '05_crew_arrives', save: 'v41_save_smart_46min.json', secs: 0.2, keepBanner: true, warm: 6, setup: () => {
    window.__quiet(); window.__flushBanners(); window.__FV.clearStack(); window.__FV.teleport(-200, 700);
    window.__FV.v42.crew({ rate: 1e6, now: true }); return null;
  }, then: () => { const W = window.__FV.scene.warehouse, wp = W.porters[W.porters.length - 1]; window.__run(0.5); wp._spd = wp.speed; wp.speed = 0; return { x: (wp.x + W.outPad.x) / 2, y: (wp.y + W.outPad.y) / 2 - 40, z: 1.05 }; },
  after: () => { const W = window.__FV.scene.warehouse, wp = W.porters[W.porters.length - 1]; if (wp._spd) wp.speed = wp._spd; } },
  { name: '06_shop_after_eup', save: 'v41_save_smart_46min.json', secs: 30, setup: () => {
    const gs = window.__FV.scene, pr = gs.progress, G = gs.v4.growth;
    if (gs.v4.rank.level < 2) { pr.flags.rankEup = true; pr.done.rank_eup = true; const pad = pr.pads.rank_eup; if (pad) { pad.destroy(); delete pr.pads.rank_eup; } gs.v4.rank.ceremony(true); }
    const shop = Object.values(G.shops).find((s) => s.st === 'open' && s.shop === 'cafe') || Object.values(G.shops).find((s) => s.st === 'open');
    for (const ty of shop.sells) G.deliver ? null : null;
    window.__day(12);
    window.__FV.teleport(shop.x + 250, shop.y + 260);
    return { x: shop.x, y: shop.y + 40, z: 1.1 };
  } },
];

const srv = await start(0, { prefix: '/fv/', root: REPO });
const browser = await launch();
const made = [], errors = [];
let page = null, log = null, ctx = null, loaded = null;
const bootSave = async (name) => {
  if (ctx) { for (const e of log.errors) errors.push('page: ' + e); await ctx.close(); }
  ({ page, log, ctx } = await openPage(browser, srv.url + 'index.html', { viewport: { width: W, height: H }, dpr: DPR, locale: LANG === 'en' ? 'en-US' : 'ko-KR' }));
  await page.evaluate((sv) => { try { localStorage.clear(); localStorage.setItem('frostVillage.save.v1', sv); } catch (e) { /* */ } }, fixture(name));
  await page.reload({ waitUntil: 'load', timeout: 300000 });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 300000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player && window.__FV.scene.v42, 300000);
  await sleep(1500);
  await page.evaluate(() => {
    const game = window.__FV.game; game.loop.sleep();
    let T = game.loop.time || performance.now(); let D = Date.now(); Date.now = () => D; const DT = 1000 / 60;
    window.__run = (sec) => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { if (window.__hold) window.__hold(); T += DT; D += DT; game.headlessStep(T, DT); } };
    window.__draw = () => { T += DT; D += DT; game.step(T, DT); };
    window.__day = (h = 10) => { const nb = window.__FV.scene.v4; if (nb && nb.clock) { if (!nb.clock.on && nb.clock.start) nb.clock.start(); nb.clock.set(h); } };
    window.__quiet = () => { const S = window.__FV.v42.v.seen; for (const k of ['up', 'p2', 'p34', 'big']) S[k] = new Proxy(Object.assign({}, S[k] || {}), { get: (o, q) => (typeof q === 'string' ? 1 : o[q]) }); };
    window.__flushBanners = () => { const v = window.__FV.v42 && window.__FV.v42.v; if (v) { v.bannerQ = []; v.bannerGapT = 0; } const ui = window.__FV.game.scene.getScene('UI'); if (ui && ui.bannerBox && ui.bannerBox.visible) { ui.tweens.killTweensOf(ui.bannerBox); ui.bannerBox.setVisible(false); } };
    try { window.__FV.v42.v.seen.whatsNew = 1; } catch (e) { /* */ }
    window.__quiet();
  });
  loaded = name;
};
const warm = async (sec) => { await page.evaluate(() => window.__FV.game.loop.wake()); await sleep(sec * 1000); await page.evaluate(() => window.__FV.game.loop.sleep()); };
for (const sc of SCENES.filter((s) => !ONLY || ONLY.some((o) => s.name.startsWith(o)))) {
  try {
    await bootSave(sc.save);
    await warm(3);
    await page.evaluate(() => window.__flushBanners());
    let cam = await page.evaluate(sc.setup);
    if (cam) await page.evaluate((c) => window.__FV.camera(c.x, c.y, c.z), cam);
    for (let s = 0; s < (sc.secs || 0); s += 2) await page.evaluate((d) => window.__run(d), Math.min(2, sc.secs - s));
    if (sc.then) cam = await page.evaluate(sc.then);
    if (cam && cam.follow) cam = await page.evaluate(() => { const p = window.__who; return p ? { x: p.x, y: p.y - 30, z: 1.25 } : null; });
    if (cam) await page.evaluate((c) => window.__FV.camera(c.x, c.y, c.z), cam);
    await warm(sc.warm || 3);
    if (!sc.keepBanner) await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); if (ui && ui.bannerBox && ui.bannerBox.visible) { ui.tweens.killTweensOf(ui.bannerBox); ui.bannerBox.setVisible(false); } });
    if (cam) await page.evaluate((c) => window.__FV.camera(c.x, c.y, c.z), cam);
    await page.evaluate(() => { for (let i = 0; i < 12; i++) window.__draw(); });
    const file = sc.name + SUFFIX + '.jpg';
    await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 84, timeout: 120000 });
    const st = await page.evaluate(() => { const gs = window.__FV.scene, c = window.__FV.v42.crew ? window.__FV.v42.crew() : null; return { link: window.__linkShot || undefined, crew: c && c.crew, objective: gs.tutorial && gs.tutorial.text, goal: gs.progress.nextGoal() ? gs.progress.nextGoal().id : null }; });
    made.push([file, st]);
    if (sc.after) await page.evaluate(sc.after);
    await page.evaluate(() => { window.__hold = null; });
  } catch (e) { errors.push(sc.name + ': ' + String(e.message || e).split('\n')[0]); }
}
if (log) for (const e of log.errors) errors.push('page: ' + e);
for (const [f, st] of made) console.log('  ' + f + '  ' + JSON.stringify(st));
if (errors.length) { console.log('errors:'); for (const e of errors.slice(0, 20)) console.log('  ' + e); }
await browser.close();
await srv.close();
process.exit(errors.length ? 1 : 0);
