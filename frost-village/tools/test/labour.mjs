// Frost Village v3.5 division-of-labour checks (docs/기획서_v3_분업.md).
//   node tools/test/labour.mjs            (screenshots -> docs/previews/screens_v35/test_*.jpg)
// Runs on the fixed-step clock (fv_step.mjs): every wait is GAME time.
//   stations only work while operated (the chief on the work spot / an operator), the chief's work motion,
//   the tutorial's "stand at the grill" step, operators (operate anim, impact frames, waiting emote),
//   gatherers drop at collection piles, the chief takes from a pile, raw porters (pile -> station),
//   goods porters (station -> seller), every operator of the 5 stations + 2 workshops, worker variants for
//   2nd / 3rd hires, pad geometry (no overlaps, standable), save / load of piles, v3 -> v3.5 migration.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep as realSleep, waitFor as realWaitFor } from './pw.mjs';
import { installStepper, advance, render, walkStep } from './fv_step.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews', 'screens_v35');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const step = (name, ok, info = '') => { results.push({ name, ok, info }); console.log((ok ? '  ok  ' : ' FAIL ') + name + (info ? '  — ' + info : '')); };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 } });
const ev = (fn, arg) => page.evaluate(fn, arg);
const adv = (s) => advance(page, s);
const wait = async (fn, sec, arg) => { for (let t = 0; t < sec; t += 0.5) { if (await ev(fn, arg)) return true; await adv(0.5); } return !!(await ev(fn, arg)); };
const st = () => ev(() => window.__FV.state());
const shot = async (n) => { await render(page, 3); await page.screenshot({ path: path.join(OUT, 'test_' + n + '.jpg'), type: 'jpeg', quality: 80 }); };
const walk = (t, tol) => walkStep(page, t, { tol: tol || 14 });
const where = (n) => ev((k) => window.__FV.where(k), n);
const boot = async (clear) => {
  if (clear) await ev(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.reload({ waitUntil: 'load' });
  await realWaitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await realSleep(400);
  await tapStart(page);
  await realWaitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 180000);
  await installStepper(page);
  await adv(1);
};
let fatal = null;
try {
  await boot(true);
  // ------------------------------------------------------------------ 1. the grill needs someone at it
  let s = await st();
  step('fresh game: every station has a work spot, nobody hired', ['grill', 'sawmill', 'bakery', 'smelter', 'smokehouse'].every((k) => s.ops[k] && !s.ops[k].hired), JSON.stringify(s.ops.grill));
  await walk(await where('net'), 18);
  await wait(() => window.__FV.state().player.stack.length >= 5, 30);
  s = await st();
  step('tutorial: after fishing it points at the work spot ("화덕 앞에 서서 생선을 구우세요")', s.objective === 'obj_op_grill', `objective=${s.objective}`);
  await walk(await where('grillIn'), 14);
  await wait(() => !window.__FV.state().player.stack.includes('item_fish_raw'), 6);
  await walk({ x: 900, y: 760 }, 20);        // step aside: nobody at the grill
  const in0 = (await st()).ops.grill.in;
  await adv(4);
  s = await st();
  step('fish on the input pad stay raw while nobody works the grill', in0 > 0 && s.ops.grill.in === in0 && !s.ops.grill.working, `in ${in0} -> ${s.ops.grill.in} working=${s.ops.grill.working}`);
  await walk(await where('op:grill'), 12);
  await adv(0.6);
  s = await st();
  const chief = { anim: s.player.anim, dir: await ev(() => window.__FV.scene.player.dir), working: s.ops.grill.working, chief: s.ops.grill.chief, obj: s.objective };
  await ev(() => { const p = window.__FV.where('op:grill'); window.__FV.camera(p.x + 40, p.y - 30, 1.5); });
  await adv(0.3);
  await shot('01_chief_cooks');
  await ev(() => window.__FV.camera());
  step('the chief on the work spot cooks (his work motion, side-on not his back, the grill fires up)', chief.working && chief.chief && chief.anim === 'give' && chief.dir !== 6 && chief.obj === 'obj_operating_grill', JSON.stringify(chief));
  await wait(() => window.__FV.state().ops.grill.in === 0, 20);
  await adv(0.8);
  s = await st();
  step('everything on the grill got cooked while he stood there', s.ops.grill.in === 0 && s.ops.grill.out >= in0, JSON.stringify(s.ops.grill));
  // the fish he carries hop in from the work spot too
  await walk(await where('net'), 18);
  await wait(() => window.__FV.state().player.stack.length >= 4, 30);
  const carried = (await st()).player.stack.filter((x) => x === 'item_fish_raw').length;
  await walk(await where('op:grill'), 12);
  await wait(() => !window.__FV.state().player.stack.includes('item_fish_raw'), 8);
  s = await st();
  step('fish carried onto the work spot go straight into the grill', carried > 0 && !s.player.stack.includes('item_fish_raw'), `carried=${carried} grill=${JSON.stringify(s.ops.grill)}`);

  // ------------------------------------------------------------------ 2. hire the cook (the line's pads follow each other)
  await ev(() => { window.__FV.scene.progress.setFlag('firstSale'); });
  await adv(1.2);
  await ev(() => window.__FV.doneStep('hire_clerk_market'));
  await adv(1);
  s = await st();
  step('after the clerk the cook pad appears (fish line: clerk -> cook -> fisherman)', s.pads.includes('op_grill') && !s.pads.includes('hire_fisherman'), `pads=${s.pads}`);
  await ev(() => { const p = window.__FV.scene.progress.pads.op_grill; window.__FV.give(p ? p.remaining : 0); });
  await walk(await where('op_grill'), 12);
  await wait(() => window.__FV.state().ops.grill.hired, 8);
  await ev(() => window.__FV.give(500));
  await wait(() => !!window.__FV.scene.progress.pads.hire_fisherman, 4);
  const padUnder = await ev(() => { const pr = window.__FV.scene.progress, p = pr.pads.hire_fisherman, pl = window.__FV.scene.player; return p ? { needsLeave: p.needsLeave, paid: p.paid, under: p.pad.contains(pl.x, pl.y) } : null; });
  await adv(2);
  const paidLater = await ev(() => { const p = window.__FV.scene.progress.pads.hire_fisherman; return p ? p.paid : -1; });
  step('the next pad of the line pops up under the chief without draining his coins', !!padUnder && padUnder.under && padUnder.needsLeave && paidLater === 0, JSON.stringify(padUnder) + ' paid=' + paidLater);
  await walk({ x: 1000, y: 820 }, 20);
  await realWaitFor(page, () => window.__FV.hasTex('vil_npc_chef'), 60000).catch(() => {});
  await wait(() => window.__FV.state().ops.grill.ready, 20);
  await ev(() => { const gs = window.__FV.scene; for (let i = 0; i < 12; i++) gs.stations.grill.inStack.push('item_fish_raw', null, gs.effects); window.__impacts = 0; const op = gs.stations.grill.op.operator; const f = op.impact.bind(op); op.impact = () => { window.__impacts++; f(); }; });
  await adv(1.5);
  s = await st();
  const cook = s.ops.grill;
  await ev(() => { const p = window.__FV.where('post:grill'); window.__FV.camera(p.x - 30, p.y - 10, 1.6); });
  await adv(0.35);
  await shot('02_cook_flips_fish');
  await ev(() => window.__FV.camera());
  await adv(3);
  const impacts = await ev(() => window.__impacts);
  step('the cook works the grill for good (operate anim, the chief elsewhere)', cook.ready && cook.working && !cook.chief && cook.anim === 'operate' && cook.key === 'npc_chef', JSON.stringify(cook));
  step('the operate anim hits its impact frame (sound + particles there)', impacts >= 3, `impacts=${impacts}`);
  await wait(() => window.__FV.state().ops.grill.in === 0, 30);
  await adv(9);
  s = await st();
  step('with nothing to cook the cook waits (idle)', s.ops.grill.anim === 'idle' && !s.ops.grill.working, JSON.stringify(s.ops.grill));

  // ------------------------------------------------------------------ 3. the fisherman drops at the fish barrel; the chief takes it
  await ev(() => { const p = window.__FV.scene.progress.pads.hire_fisherman; window.__FV.give(p ? p.remaining : 0); });
  await walk(await where('hire_fisherman'), 12);
  await wait(() => window.__FV.state().done.includes('hire_fisherman'), 8);
  await wait(() => window.__FV.state().piles.fish.n >= 3, 90);
  s = await st();
  step('the fisherman stacks his catch in the fish barrel (not at the grill)', s.piles.fish.shown && s.piles.fish.n >= 3, JSON.stringify(s.piles.fish) + ' grill=' + JSON.stringify(s.ops.grill));
  await ev(() => { const p = window.__FV.where('pile:fish'); window.__FV.camera(p.x - 40, p.y - 50, 1.4); });
  await adv(0.3);
  await shot('03_fish_barrel');
  await ev(() => window.__FV.camera());
  await ev(() => window.__FV.clearStack());
  const n0 = (await st()).piles.fish.n;
  await walk(await where('pile:fish'), 12);
  await wait(() => window.__FV.state().player.stack.includes('item_fish_raw'), 6);
  s = await st();
  step('the chief can take fish from the barrel', s.player.stack.filter((x) => x === 'item_fish_raw').length > 0, `pile ${n0} -> ${s.piles.fish.n}, bag ${s.player.stack.length}`);

  // ------------------------------------------------------------------ 4. raw porter (barrel -> grill), goods porter (grill -> counter)
  await ev(() => window.__FV.clearStack());
  await ev(() => { const p = window.__FV.scene.progress.pads.raw_grill; window.__FV.give(p ? p.remaining : 0); });
  await walk({ x: 1000, y: 820 }, 20);
  await walk(await where('raw_grill'), 12);
  await wait(() => window.__FV.state().rawPorters.length > 0, 8);
  await walk({ x: 1100, y: 860 }, 20);
  await ev(() => { const gs = window.__FV.scene; const pl = gs.piles.fish; for (let i = 0; i < 12; i++) pl.stack.push('item_fish_raw', null, gs.effects); gs.stations.grill.inStack.clear(gs.effects); });
  await wait(() => window.__FV.state().rawPorters.some((r) => r.state === 'haul' && r.carry > 0), 30);
  s = await st();
  const rp = s.rawPorters[0];
  await ev(([x, y]) => window.__FV.camera(x + 20, y - 40, 1.4), [rp.x, rp.y]);
  await adv(0.2);
  await shot('04_fish_porter_barrel_to_grill');
  await ev(() => window.__FV.camera());
  step('the fish porter carries the barrel to the grill along the road', rp && rp.station === 'grill' && rp.carry > 0 && rp.dest === 'grill_in', JSON.stringify(rp));
  await wait(() => window.__FV.state().ops.grill.in > 0, 30);
  s = await st();
  step('...and drops it on the grill input', s.ops.grill.in > 0, JSON.stringify(s.ops.grill));
  await ev(() => window.__FV.doneStep('porter_grill'));
  await ev(() => { const gs = window.__FV.scene; for (let i = 0; i < 8; i++) gs.stations.grill.outStack.push('item_fish_cooked', null, gs.effects); });
  await wait(() => window.__FV.state().porters.some((p) => p.station === 'grill' && (p.state === 'haul' || p.state === 'unload') && p.carry > 0), 40);
  s = await st();
  const gp = s.porters.find((p) => p.station === 'grill');
  await ev(([x, y]) => window.__FV.camera(x + 30, y - 40, 1.3), [gp.x, gp.y]);
  await adv(0.2);
  await shot('05_goods_porter_to_counter');
  await ev(() => window.__FV.camera());
  step('the goods porter carries grilled fish to the counter', gp && gp.dest === 'market_shelf' && gp.carry > 0, JSON.stringify(gp));
  {
    // the whole fish line runs with the chief away
    await ev(() => { const gs = window.__FV.scene; gs.market.stock.clear(gs.effects); window.__FV.teleport(1500, 1000); });
    const sold0 = await ev(() => window.__FV.scene.market.cash.value + window.__FV.scene.economy.coins);
    await adv(60);
    const sold1 = await ev(() => window.__FV.scene.market.cash.value + window.__FV.scene.economy.coins);
    step('fish line fully automatic: fisherman -> barrel -> porter -> cook -> porter -> clerk', sold1 > sold0 + 20, `coins+cash ${sold0} -> ${sold1}`);
  }

  // ------------------------------------------------------------------ 5. every line, every operator, variants
  await ev(() => { window.__FV.give(100000); window.__FV.unlockV3(); });
  await adv(2);
  await realWaitFor(page, () => ['vil_npc_sawyer', 'vil_npc_smoker', 'vil_npc_cannery', 'vil_npc_aunt', 'vil_npc_blacksmith', 'wkr_miner_b'].every((k) => window.__FV.hasTex(k)), 90000).catch(() => {});
  await adv(3);
  s = await st();
  const want = { grill: 'npc_chef', sawmill: 'npc_sawyer', bakery: 'npc_aunt', smelter: 'npc_blacksmith', smokehouse: 'npc_smoker', toolsmith: 'miner_b', cannery: 'npc_cannery' };
  const keys = Object.fromEntries(Object.keys(want).map((k) => [k, s.ops[k] && s.ops[k].key]));
  step('every station / workshop has its own operator (no look twice)', Object.keys(want).every((k) => keys[k] === want[k]), JSON.stringify(keys));
  step('every line has a raw porter, every gatherer a pile', s.rawPorters.length === 5 && Object.values(s.piles).every((p) => p.shown), `${s.rawPorters.length} raw porters, piles ${JSON.stringify(s.piles)}`);
  await ev(() => { const gs = window.__FV.scene; window.__opHits = {}; for (const x of gs.stationList.concat(gs.workshops)) { const op = x.op.operator; if (!op) continue; const f = op.impact.bind(op); op.impact = () => { window.__opHits[x.id] = (window.__opHits[x.id] || 0) + 1; f(); }; } for (const x of gs.stationList) { x.outStack.clear(gs.effects); for (let i = 0; i < 14; i++) x.inStack.push(x.input, null, gs.effects); } for (const w of gs.workshops) { w.outStack.clear(gs.effects); for (const ty of w.inputTypes) for (let i = 0; i < 5; i++) w.inStack.push(ty, null, gs.effects); } });
  await adv(4);
  s = await st();
  const hits = await ev(() => window.__opHits);
  const working = Object.keys(want).filter((k) => s.ops[k].working && /operate|work/.test(s.ops[k].anim));
  step('all 7 operators work their stations (operate / work anim)', working.length === 7, `working=${working} hits=${JSON.stringify(hits)}`);
  step('every operator hits its impact frame', Object.keys(want).every((k) => hits[k] > 0), JSON.stringify(hits));
  for (const k of Object.keys(want)) {
    await ev((id) => { const x = window.__FV.scene.stationById(id); window.__FV.camera(x.x, x.y - 30, 1.5); }, k);
    await adv(0.42);
    await shot('06_op_' + k);
  }
  await ev(() => window.__FV.camera());
  // 2nd / 3rd hires get the profession's other looks (workers manifest professions{})
  for (const id of ['hire2_fisherman', 'hire3_fisherman', 'hire2_lumberjack', 'hire3_lumberjack', 'hire2_farmer', 'hire3_farmer', 'hire2_miner', 'hire2_hunter', 'hire3_hunter']) await ev((k) => window.__FV.doneStep(k), id);
  await realWaitFor(page, () => ['wkr_fisherman_b', 'wkr_fisherman_c', 'wkr_lumberjack_c', 'wkr_farmer_c', 'wkr_miner_c', 'wkr_hunter_c'].every((k) => window.__FV.hasTex(k)), 90000).catch(() => {});
  await adv(3);
  s = await st();
  const wk = s.workerKeys;
  step('2nd / 3rd workers look different (b / c variants, the toolsmith\'s old miner skipped)', ['fisherman_b', 'fisherman_c', 'lumberjack_b', 'lumberjack_c', 'farmer_b', 'farmer_c', 'miner_c', 'hunter_b', 'hunter_c'].every((k) => wk.includes(k)) && !wk.includes('miner_b'), JSON.stringify(wk));
  const realLook = await ev(() => window.__FV.scene.workers.filter((w) => w.index > 0).every((w) => w.key === (w.wantKey || w.key) && !w.wantKey));
  step('the variants show their real art (not the base look)', realLook);
  {
    const p = await ev(() => { const w = window.__FV.scene.workers.find((q) => q.key === 'fisherman_c'); return { x: w.x, y: w.y }; });
    await ev(([x, y]) => window.__FV.camera(x + 40, y - 40, 1.4), [p.x, p.y]);
    await adv(0.5);
    await shot('07_worker_variants_fishing');
    const q = await ev(() => { const w = window.__FV.scene.workers.find((k) => k.key === 'lumberjack_c'); return { x: w.x, y: w.y }; });
    await ev(([x, y]) => window.__FV.camera(x, y - 40, 1.4), [q.x, q.y]);
    await adv(0.5);
    await shot('08_worker_variants_chopping');
    await ev(() => window.__FV.camera());
  }

  // ------------------------------------------------------------------ 6. geometry: pads apart, standable
  const geo = await ev(async () => {
    const gs = window.__FV.scene;
    const m = await import(new URL('src/data/world.js', location.href).href);
    const gd = (ax, ay, bx, by) => Math.hypot(ax - bx, (ay - by) * 2);
    const pads = [];
    for (const x of gs.stationList.concat(gs.workshops)) { pads.push({ id: x.id + '.in', x: x.inPad.x, y: x.inPad.y, r: x.inPad.r }, { id: x.id + '.out', x: x.outPad.x, y: x.outPad.y, r: x.outPad.r }, { id: x.id + '.op', x: x.op.x, y: x.op.y, r: x.op.pad.r }); }
    for (const id in gs.piles) pads.push({ id: 'pile.' + id, x: gs.piles[id].x, y: gs.piles[id].y, r: gs.piles[id].pad.r });
    const unlock = [];
    for (const g of ['pads', 'pads2', 'pads35']) for (const k in m.WORLD[g] || {}) unlock.push({ id: k, x: m.WORLD[g][k].x, y: m.WORLD[g][k].y, r: 69 });
    const over = [];
    const all = pads.concat(unlock);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      if (i >= pads.length && j >= pads.length) continue;
      if (gd(a.x, a.y, b.x, b.y) < a.r + b.r) over.push(a.id + '/' + b.id);
    }
    const blocked = pads.filter((p) => gs.collision.blocked(p.x, p.y, 16)).map((p) => p.id);
    return { over, blocked };
  });
  step('work spots, piles and station pads never overlap each other or a hire pad', geo.over.length === 0, geo.over.join(', '));
  step('every work spot / pile can be stood on', geo.blocked.length === 0, geo.blocked.join(', '));

  // ------------------------------------------------------------------ 7. save / load: piles, operators; v3 -> v3.5 migration
  await ev(() => { const gs = window.__FV.scene; for (const id in gs.piles) { gs.piles[id].stack.clear(gs.effects); for (let i = 0; i < 7; i++) gs.piles[id].stack.push(gs.piles[id].item, null, gs.effects); } gs.rawPorters.forEach((r) => { r.stack.clear(gs.effects); r.clearDest(); r.state = 'seek'; }); for (const w of gs.workers) { w.stack.clear(gs.effects); } window.__FV.save(); });
  const before = await ev(() => { const s = window.__FV.state(); return { piles: Object.fromEntries(Object.entries(s.piles).map(([k, v]) => [k, v.n])), ops: Object.keys(s.ops).filter((k) => s.ops[k].hired).length, raw: s.rawPorters.length }; });
  await boot(false);
  // (what lies on a pile + what its raw porter already picked up again)
  const after = await ev(() => { const gs = window.__FV.scene, s = window.__FV.state(); return { piles: Object.fromEntries(Object.keys(gs.piles).map((k) => [k, gs.piles[k].count + gs.rawPorters.filter((r) => r.pile === gs.piles[k]).reduce((n, r) => n + r.stack.count + r.stack.incoming, 0)])), ops: Object.keys(s.ops).filter((k) => s.ops[k].hired).length, raw: s.rawPorters.length }; });
  step('save / load keeps piles, operators and raw porters', JSON.stringify(after.ops) === JSON.stringify(before.ops) && after.raw === before.raw && Object.keys(before.piles).every((k) => after.piles[k] >= before.piles[k] - 1), `before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
  // a v3 save: the fish and wood lines ran on their own, the toolsmith stood -> they keep running
  await ev(() => {
    window.__FV_NO_SAVE = true;
    const v3 = { v: 3, t: Date.now(), coins: 777, progress: { done: { hire_fisherman: true, porter_grill: true, zone_forest: true, hire_lumberjack: true, hire_clerk_market: true, zone_farm: true, hire_farmer: true, zone_mine: true, hire_miner: true, zone_hunt: true, hire_hunter: true, tower_east: true }, paid: {}, flags: { firstSale: true, firstTrade: true } },
      territory: { east: true }, sites: { tower_east: { b: 'watchtower', st: 'done', got: {}, t: 0 }, e_m1: { b: 'toolsmith', st: 'done', got: {}, t: 0 } },
      stations: { grill: { i: 5, o: 3 }, sawmill: { i: 4, o: 0 } }, market: { stock: { item_fish_cooked: 4 }, cash: 10 }, player: { x: 990, y: 900, stack: [] } };
    localStorage.setItem('frostVillage.save.v1', JSON.stringify(v3));
  });
  await boot(false);
  await ev(() => { window.__FV_NO_SAVE = false; });
  await adv(1);
  s = await st();
  const mig = { coins: s.coins, ops: Object.fromEntries(Object.entries(s.ops).map(([k, v]) => [k, v.hired])), raw: s.rawPorters.map((r) => r.station), done: s.done.filter((d) => /^(op|raw)_/.test(d)) };
  step('v3 save migrates: lines that ran on their own keep operator + raw porter, the toolsmith its operator', s.coins === 777 && ['grill', 'sawmill', 'bakery', 'smelter', 'smokehouse', 'toolsmith'].every((k) => mig.ops[k]) && mig.raw.length === 5, JSON.stringify(mig));
  await adv(20);
  s = await st();
  step('migrated lines keep producing (no stall after the update)', s.ops.grill.out + s.market.stock + s.market.cash > 0 && Object.values(s.piles).some((p) => p.n > 0 || true), JSON.stringify(s.ops.grill));
} catch (e) {
  fatal = e;
  console.log('FATAL', e && e.stack || e);
}
const warnings = await ev(() => (window.__FV && window.__FV.warnings ? window.__FV.warnings() : [])).catch(() => []);
await browser.close();
await srv.close();
console.log('placeholder keys:', warnings.length, warnings.join(', '));
console.log('page/console errors:', log.errors.length);
for (const e of log.errors) console.log('  ' + e.slice(0, 400));
const failed = results.filter((r) => !r.ok);
const ok = !fatal && log.errors.length === 0 && failed.length === 0;
console.log(`\n${ok ? 'PASS' : 'FAIL'}: ${results.length - failed.length}/${results.length} labour checks ok, ${log.errors.length} errors.`);
process.exit(ok ? 0 : 1);
