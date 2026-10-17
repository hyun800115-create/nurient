// (v4.2, docs/v42_plan.md §4.5 / §15) the census bot: the gameplay bot plays (fixed step) while every stock of the
// village is sampled every 10 s; at the end the §4.5 measures are printed and written as JSON.
//   node tools/test/review_gameplay_census.mjs --name c46 --minutes 20 --load save.json [--policy smart]
//        [--carry raw=12,goods=18,wh=12,stn=14]  (porter carry capacities, the designer's 짐꾼 question)
//        [--repo DIR]                             (run another checkout, e.g. the v4.1 baseline copy)
//        [--frules-early]                         (F1–F3 + Surplus from minute 0: window.__FV_FRULES_EARLY)
//        [--out DIR] [--early 40]                 (early = the first N game minutes counted apart: early piles)
//   node tools/test/review_gameplay_census.mjs --summarize file.census.json [more.json]   (measures of saved runs)
// Measures (shares of 10-s samples): market shelf empty per food, 교역소 empty per good, station outputs ≥ 90 %,
// any raw pile ≥ 90 % (and per pile), 창고 average stock, dock backlog (card crates + surplus), boathouse catch vs
// its cap, income per minute, and the early-pile share (the first `early` minutes of a fresh run).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

/** the §4.5 measures of census rows */
export function summarize(rows, opts = {}) {
  const early = Number(opts.early || 0) * 60;
  const pick = (f) => rows.filter(f);
  const late = rows.filter((r) => r.t >= early);
  const share = (rs, f) => (rs.length ? Math.round((rs.filter(f).length / rs.length) * 100) : null);
  const FOOD = ['bread', 'meat_cooked', 'fish_cooked'], GOOD = ['plank', 'ingot'];
  const o = { samples: rows.length, minutes: rows.length ? Math.round(rows[rows.length - 1].t / 60) : 0 };
  o.marketEmpty = Object.fromEntries(FOOD.map((k) => [k, share(late, (r) => !(r.market && r.market[k] > 0))]));
  o.tradeEmpty = Object.fromEntries(GOOD.map((k) => [k, share(late.filter((r) => r.trade), (r) => !(r.trade[k] > 0))]));
  o.out90 = {};
  for (const st of ['grill', 'sawmill', 'bakery', 'smelter', 'smokehouse']) {
    const rs = late.filter((r) => r.st && r.st[st]);
    o.out90[st] = share(rs, (r) => r.st[st][1] >= r.st[st][3] * 0.9);
  }
  const pileFull = (r, k) => r.piles && r.piles[k] !== undefined && r.piles[k] >= (r.pileMax || 40) * 0.9;
  o.pile90 = {};
  for (const k of ['fish', 'log', 'wheat', 'ore', 'meat']) o.pile90[k] = share(late.filter((r) => r.piles && r.piles[k] !== undefined), (r) => pileFull(r, k));
  o.anyPile90 = share(late, (r) => r.piles && Object.keys(r.piles).some((k) => pileFull(r, k)));
  if (early > 0) {
    const er = pick((r) => r.t < early);
    o.early = { minutes: early / 60, anyPile90: share(er, (r) => r.piles && Object.keys(r.piles).some((k) => pileFull(r, k))), pile90: {} };
    for (const k of ['fish', 'log', 'wheat', 'ore', 'meat']) o.early.pile90[k] = share(er.filter((r) => r.piles && r.piles[k] !== undefined), (r) => pileFull(r, k));
  }
  const whs = late.filter((r) => r.wh);
  o.whAvg = whs.length ? Math.round(whs.reduce((a, r) => a + r.wh[0], 0) / whs.length) : null;
  o.dockMax = Math.max(0, ...late.map((r) => (r.v4 ? r.v4.cargo : 0) + (r.v42 && r.v42.dock ? r.v42.dock : 0)));
  o.dockEnd = late.length ? ((late[late.length - 1].v4 || {}).cargo || 0) + ((late[late.length - 1].v42 || {}).dock || 0) : 0;
  const boat = (r) => r.boat || (typeof r.dock === 'number' ? [r.dock, 30] : null);
  o.boatMaxPct = Math.max(0, ...late.map((r) => (boat(r) ? Math.round((boat(r)[0] / Math.max(1, boat(r)[1])) * 100) : 0)));
  if (late.length > 1) { const a = late[0], b = late[late.length - 1]; o.incomePerMin = Math.round((b.earned - a.earned) / Math.max(1, (b.t - a.t) / 60)); }
  const ex = late.length ? late[late.length - 1].v42 : null;
  if (ex) o.exported = ex.exported || 0;
  return o;
}

if (opt('--summarize', '')) {
  for (const f of args.filter((a) => a.endsWith('.json'))) {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    console.log(path.basename(f), JSON.stringify(summarize(d.rows, { early: Number(opt('--early', '0')) })));
  }
  process.exit(0);
}

const REPO = path.resolve(opt('--repo', path.resolve(HERE, '..', '..')));
const NAME = opt('--name', 'census');
const OUT = path.resolve(opt('--out', '.'));
const MIN = Number(opt('--minutes', '20'));
const EARLY = Number(opt('--early', '0'));
fs.mkdirSync(OUT, { recursive: true });
const INIT_CWD = process.cwd();
const LOAD = opt('--load', '') ? path.resolve(INIT_CWD, opt('--load', '')) : '';
process.chdir(REPO);
const { start } = await import(path.join(REPO, 'tools/test/serve.mjs'));
const { launch, openPage, tapStart, sleep, waitFor } = await import(path.join(HERE, 'pw.mjs'));
const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
// (--nobake: the v4.1 way of drawing piles, one sprite per item; a perf comparison)
// (--frules-early: the v4.2 overflow rules F1–F3 + Surplus from the first minute, not only after village complete —
//  the designer's question whether a bigger porter bag alone or with F1–F5 empties the early piles)
const INIT = (args.includes('--nobake') ? 'window.__FV_NO_BAKE = true;' : '') + (args.includes('--frules-early') ? 'window.__FV_FRULES_EARLY = true;' : '');
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 360, height: 720 }, dpr: 1, init: INIT || undefined });
const t0 = Date.now();
const rows = [];
try {
  const saveTxt = LOAD ? fs.readFileSync(LOAD, 'utf8') : null;
  await page.evaluate((sv) => { try { localStorage.clear(); if (sv) localStorage.setItem('frostVillage.save.v1', sv); } catch (e) { /* */ } }, saveTxt);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await page.evaluate(async () => { const m = await import(new URL('src/data/balance.js', location.href).href); window.__BAL = m.BALANCE; });
  // porter carry capacities (before the game makes any porter)
  const CARRY = opt('--carry', '');
  if (CARRY) await page.evaluate((C) => {
    const B = window.__BAL, kv = Object.fromEntries(C.split(',').map((p) => p.split('=')).map(([k, v]) => [k, Number(v)]));
    if (kv.raw) B.labour.rawCapacity = kv.raw;
    if (kv.goods) B.workers.porterCapacity = kv.goods;
    if (kv.wh) B.build.porterCapacity = kv.wh;
    if (kv.stn) B.v4.stationPorterCapacity = kv.stn;
    window.__carry = kv;
  }, CARRY);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 120000);
  await sleep(1500);
  await page.evaluate(() => {
    const game = window.__FV.game;
    game.loop.sleep();
    const realNow = Date.now.bind(Date);
    let D = realNow(); let T = game.loop.time || performance.now();
    Date.now = () => D;
    const DT = 1000 / 60;
    try { if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1; } catch (e) { /* */ }
    window.__sim = { simT: 0, run(sec, botTick) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { if (botTick) botTick(DT / 1000); T += DT; D += DT; this.simT += DT / 1000; game.headlessStep(T, DT); } } };
  });
  await page.addScriptTag({ path: path.join(REPO, 'tools/test/review_gameplay_bot.js') });
  await page.evaluate((o) => Object.assign(window.__bot.opts, o), { policy: opt('--policy', 'smart'), upg: 'greedy', minBatch: 3, think: 0, mag: 1 });
  const census = () => page.evaluate(() => {
    const gs = window.__FV.scene;
    // (porters made by a save restore before --carry applied: their bags follow the patched capacity)
    if (window.__carry) {
      const C = window.__carry;
      for (const p of gs.rawPorters || []) if (C.raw && p.stack.max !== C.raw) p.stack.max = C.raw;
      for (const p of gs.porters || []) {
        const k = p.role === 'stationPorter' ? C.stn : p.wh ? C.wh : C.goods;
        if (k && p.stack.max !== k) p.stack.max = k;
      }
    }
    const cnt = (stack) => { const o = {}; for (const it of stack.items) o[it.type.slice(5)] = (o[it.type.slice(5)] || 0) + 1; return o; };
    const g = gs.v4 && gs.v4.growth;
    const F = gs.v42 && gs.v42.freight;
    const pileMax = Object.values(gs.piles || {})[0] ? Object.values(gs.piles)[0].stack.max : 40;
    return {
      t: Math.round(window.__sim.simT), coins: gs.economy.coins, earned: gs.economy.earned, pileMax,
      st: Object.fromEntries(gs.stationList.filter((s) => s.enabled).map((s) => [s.id, [s.inStack.count, s.outStack.count, s.inStack.max, s.outStack.max]])),
      piles: Object.fromEntries(Object.keys(gs.piles).filter((k) => gs.piles[k].shown).map((k) => [k, gs.piles[k].count])),
      market: cnt(gs.market.stock), trade: gs.trade.enabled ? cnt(gs.trade.stock) : null,
      wh: gs.warehouse && gs.warehouse.enabled ? [gs.warehouse.total] : null,
      boat: gs.boathouse && gs.boathouse.enabled ? [gs.boathouse.outStack.count, gs.boathouse.outStack.max] : null,
      v4: g ? { cargo: g.cargo } : null,
      v42: F ? { dock: F.dockCount(), aboard: F.aboard(), exported: F.stats.exported, exportCoins: F.stats.coins, lines: gs.v42.lines ? gs.v42.lines.state() : null,
        // (CODE-1 review) the 서리 물류창고's sales today [day, items, coins] and the tills' coins not yet collected
        dep: gs.v42.depot && gs.v42.depot.built ? [gs.v42.depot.model.day, gs.v42.depot.model.today.sales, gs.v42.depot.model.today.coins] : null,
        tills: gs.v42.office && gs.v42.office.tills ? gs.v42.office.tills().reduce((a, q) => a + (q.till.value || 0), 0) : null } : null,
      bag: gs.player.stack.count, task: window.__bot.task ? window.__bot.task.kind : null,
      nPorters: gs.porters.length, nRaw: gs.rawPorters.length,
      done: Object.keys(gs.progress.done).filter((k) => gs.progress.done[k]).length,
      celebrated: !!gs.progress.celebrated, rank: gs.v4 && gs.v4.rank ? gs.v4.rank.level : 0,
    };
  });
  for (let sec = 0; sec < MIN * 60; sec += 10) {
    await page.evaluate(() => window.__sim.run(10, window.__bot.tick));
    const c = await census();
    rows.push(c);
    if (sec % 300 === 290) { console.log(`[${NAME}] t=${c.t} earned=${c.earned} piles=${JSON.stringify(c.piles)} mk=${JSON.stringify(c.market)} tr=${JSON.stringify(c.trade)} wh=${JSON.stringify(c.wh)} v42=${JSON.stringify(c.v42 && { dock: c.v42.dock, ex: c.v42.exported })} wall=${((Date.now() - t0) / 1000) | 0}s`); fs.writeFileSync(path.join(OUT, NAME + '.census.json'), JSON.stringify({ args, rows }, null, 0)); }
  }
} catch (e) { console.log('FATAL', e && e.stack || e); }
const sum = summarize(rows, { early: EARLY });
fs.writeFileSync(path.join(OUT, NAME + '.census.json'), JSON.stringify({ args, rows, summary: sum, errors: log.errors.slice(0, 20) }, null, 0));
console.log(`[${NAME}] SUMMARY ${JSON.stringify(sum)}`);
console.log(`[${NAME}] DONE rows=${rows.length} errors=${log.errors.length} wall=${((Date.now() - t0) / 1000) | 0}s`);
await browser.close();
await srv.close();
process.exit(log.errors.length ? 1 : 0);
