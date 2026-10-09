// Frost Village v3.5 screenshots for the designer (분업 + 강아지 놀기) -> docs/previews/screens_v35/NN_*.jpg
//   node tools/test/shots_v35.mjs [--only 05]      (phone viewport 390x844, fixed-step clock: GAME time)
// Each shot is framed on the people it is about (the camera fits their bounding box).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep as realSleep, waitFor as realWaitFor } from './pw.mjs';
import { installStepper, advance, render, walkStep } from './fv_step.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews', 'screens_v35');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 } });
const ev = (fn, arg) => page.evaluate(fn, arg);
const adv = (s) => advance(page, s);
const wait = async (fn, sec, arg, stepS = 0.25) => { for (let t = 0; t < sec; t += stepS) { if (await ev(fn, arg)) return true; await adv(stepS); } return !!(await ev(fn, arg)); };
const st = () => ev(() => window.__FV.state());
const made = [];
const shot = async (n) => {
  if (ONLY && !n.startsWith(ONLY)) return;
  await render(page, 3);
  const f = path.join(OUT, n + '.jpg');
  await page.screenshot({ path: f, type: 'jpeg', quality: 84 });
  made.push(f); console.log('shot', n);
};
const walk = (t, tol) => walkStep(page, t, { tol: tol || 16 });
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
/** fit the camera on world points [[x, y], ...] (margin px around them), at most maxZoom */
const frame = async (pts, maxZoom = 1.7, margin = 110, dy = -40) => {
  const z = await frameNow(pts, maxZoom, margin, dy);
  // (draw once so the camera's view is current, then let the x-ray fade what stands in front of people)
  await render(page, 1); await adv(0.25);
  return z;
};
const frameNow = (pts, maxZoom, margin, dy) => ev(([p, mz, mg, oy]) => {
  const gs = window.__FV.scene, cam = gs.cameras.main;
  const k = cam.zoom / (gs.zoomCur || 1);
  const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
  const x0 = Math.min(...xs) - mg, x1 = Math.max(...xs) + mg, y0 = Math.min(...ys) - mg - 90, y1 = Math.max(...ys) + mg;
  const z = Math.max(0.5, Math.min(mz, cam.width / ((x1 - x0) * k), (cam.height * 0.78) / ((y1 - y0) * k)));
  window.__FV.camera((x0 + x1) / 2, (y0 + y1) / 2 + oy, z);
  return z;
}, [pts, maxZoom, margin, dy]);
const free = () => ev(() => window.__FV.camera());
/** tap a UI-scene object like a finger */
const tapUI = async (getXY) => {
  const xy = await ev(getXY);
  const c = await page.$('canvas'); const b = await c.boundingBox();
  const k = b.width / 720;
  await page.touchscreen.tap(b.x + xy.x * k, b.y + xy.y * k);
  await render(page, 1);
};
const dogBtn = (i) => tapUI(new Function(`const ui = window.__FV.game.scene.getScene('UI'); const q = ui.dogBtns[${i}]; return { x: ui.dogBar.x + q.b.x, y: ui.dogBar.y + q.b.y };`));
const xyOf = (expr) => ev(new Function(`const gs = window.__FV.scene; const o = (${expr}); return o ? [Math.round(o.x), Math.round(o.y)] : null;`));

let fatal = null;
try {
  // ================================================================ the fish line, from the first minute
  await boot(true);
  await realWaitFor(page, () => ['vil_npc_chef'].every((k) => window.__FV.hasTex(k)), 90000).catch(() => {});
  // 01: the chief cooks at the grill himself (no cook yet)
  await walk(await where('net'), 18);
  await wait(() => window.__FV.state().player.stack.length >= 6, 30);
  await walk(await where('op:grill'), 12);
  await wait(() => window.__FV.state().ops.grill.working, 6);
  await adv(0.5);
  {
    const p = await xyOf('gs.player'), g = await xyOf('gs.stations.grill');
    await frame([p, g], 1.9, 90);
    await adv(0.35);
    await shot('01_chief_cooking_at_grill');
  }
  // 02: the cook hired, flipping fish
  await ev(() => { const pr = window.__FV.scene.progress; pr.flags.firstSale = true; window.__FV.give(500); window.__FV.doneStep('hire_clerk_market'); });
  await adv(1);
  await walk({ x: 1000, y: 860 }, 20);
  await ev(() => window.__FV.completeStep('op_grill'));
  await wait(() => window.__FV.state().ops.grill.ready, 30);
  await ev(() => { const gs = window.__FV.scene; for (let i = 0; i < 8; i++) gs.stations.grill.inStack.push('item_fish_raw', null, gs.effects); });
  await wait(() => { const s = window.__FV.state().ops.grill; return s.working && s.anim === 'operate'; }, 8);
  await adv(0.6);
  {
    const c = await xyOf('gs.stations.grill.op.operator'), g = await xyOf('gs.stations.grill');
    await frame([c, g], 2.0, 80);
    await adv(0.2);
    await shot('02_cook_flipping_fish');
  }
  // 03: the fisherman fills the barrel, the fish porter carries it to the grill
  await ev(() => { window.__FV.doneStep('hire_fisherman'); window.__FV.doneStep('raw_grill'); });
  await free();
  await ev(() => { const gs = window.__FV.scene; gs.stations.grill.inStack.clear(gs.effects); for (let i = 0; i < 16; i++) gs.piles.fish.stack.push('item_fish_raw', null, gs.effects); window.__FV.teleport(1040, 900); });
  await wait(() => window.__FV.scene.rawPorters.some((r) => r.state === 'haul' && r.stack.count > 0), 40);
  await wait(() => { const r = window.__FV.scene.rawPorters[0]; const g = window.__FV.scene.stations.grill; return r && Math.hypot(r.x - g.x, r.y - g.y) < 150; }, 10, undefined, 0.1);
  {
    const r = await xyOf('gs.rawPorters[0]'), b = await xyOf('gs.piles.fish'), g = await xyOf('gs.stations.grill');
    await frame([r, b, g], 1.6, 70);
    await adv(0.2);
    await shot('03_fish_porter_barrel_to_grill');
  }
  // 04: the goods porter carries grilled fish to the counter
  await ev(() => window.__FV.doneStep('porter_grill'));
  await ev(() => { const gs = window.__FV.scene; for (let i = 0; i < 8; i++) gs.stations.grill.outStack.push('item_fish_cooked', null, gs.effects); });
  await wait(() => window.__FV.scene.porters.some((p) => p.state === 'haul' && p.stack.count > 0), 40);
  // (half-way between the grill and the counter)
  await wait(() => { const gs = window.__FV.scene, p = gs.porters.find((q) => q.state === 'haul'), m = gs.market.shelf, g = gs.stations.grill; if (!p) return false; const d = Math.hypot(p.x - m.x, p.y - m.y), all = Math.hypot(g.x - m.x, g.y - m.y); return d < all * 0.85; }, 20, undefined, 0.1);
  {
    const p = await xyOf("gs.porters.find((q) => q.state === 'haul') || gs.porters[0]"), m = await xyOf('gs.market.shelf');
    await frame([p, m], 1.6, 80);
    await adv(0.2);
    await shot('04_goods_porter_to_counter');
  }
  await free();

  // ================================================================ the whole village (v1 + v3 lands)
  await ev(() => { window.__FV.give(100000); window.__FV.unlockAll(); window.__FV.unlockV3(); });
  await adv(2);
  await realWaitFor(page, () => ['vil_npc_sawyer', 'vil_npc_smoker', 'vil_npc_cannery', 'vil_npc_aunt', 'vil_npc_blacksmith', 'wkr_miner_b'].every((k) => window.__FV.hasTex(k)), 90000).catch(() => {});
  for (const id of ['hire2_fisherman', 'hire3_fisherman', 'hire2_lumberjack', 'hire3_lumberjack', 'hire2_farmer', 'hire3_farmer', 'hire2_miner', 'hire2_hunter', 'hire3_hunter']) await ev((k) => window.__FV.doneStep(k), id);
  await realWaitFor(page, () => ['wkr_fisherman_b', 'wkr_fisherman_c', 'wkr_lumberjack_b', 'wkr_lumberjack_c', 'wkr_farmer_b', 'wkr_farmer_c', 'wkr_miner_c', 'wkr_hunter_b', 'wkr_hunter_c'].every((k) => window.__FV.hasTex(k)), 90000).catch(() => {});
  await ev(() => window.__FV.teleport(1000, 1500));
  await adv(4);
  // 05: every operator at work (stations stocked, outputs emptied)
  const OPS = ['grill', 'sawmill', 'bakery', 'smelter', 'smokehouse', 'toolsmith', 'cannery'];
  for (const [i, id] of OPS.entries()) {
    await ev((k) => {
      const gs = window.__FV.scene, x = gs.stationById(k);
      x.outStack.clear(gs.effects);
      if (x.inputTypes) { for (const ty of x.inputTypes) for (let j = 0; j < 6; j++) x.inStack.push(ty, null, gs.effects); } else for (let j = 0; j < 12; j++) x.inStack.push(x.input, null, gs.effects);
    }, id);
    await wait((k) => { const s = window.__FV.state().ops[k]; return s && s.working && /operate|work/.test(s.anim); }, 12, id, 0.2);
    await adv(0.3 + (i % 3) * 0.17);
    const o = await xyOf(`gs.stationById('${id}').op.operator`), x = await xyOf(`gs.stationById('${id}')`);
    await frame([o, x], 2.0, 70);
    await adv(0.25);
    await shot(`05_op_${i + 1}_${id}`);
  }
  await free();
  // 06: the collection piles (each with its gatherer bringing things in)
  const PILES = { fish: 'fisherman', log: 'lumberjack', wheat: 'farmer', ore: 'miner', meat: 'hunter' };
  for (const [i, id] of Object.keys(PILES).entries()) {
    await ev((k) => { const gs = window.__FV.scene, p = gs.piles[k]; for (let j = 0; j < 14; j++) p.stack.push(p.item, null, gs.effects); }, id);
    await adv(0.4);
    const p = await xyOf(`gs.piles['${id}']`);
    await frame([p, [p[0] - 110, p[1] - 30], [p[0] + 110, p[1] + 50]], 1.9, 60);
    await adv(0.3);
    await shot(`06_pile_${i + 1}_${id}`);
  }
  await free();
  // 07: three looks of one profession working side by side
  await adv(6);
  // the biggest group of one profession close together (working if possible), waited for up to a minute
  const group = (ty) => ev((t) => {
    const ws = window.__FV.scene.workers.filter((w) => w.type === t);
    let best = [];
    for (const a of ws) {
      const g = ws.filter((b) => Math.hypot(b.x - a.x, (b.y - a.y) * 1.6) < 420);
      const score = g.length * 10 + g.filter((b) => b.state === 'work').length * 12;
      const bs = best.length * 10 + best.filter((b) => b.state === 'work').length * 12;
      if (score > bs) best = g;
    }
    return { n: ws.length, pts: best.map((w) => [Math.round(w.x), Math.round(w.y)]), work: best.filter((w) => w.state === 'work').length };
  }, ty);
  for (const [i, type] of ['fisherman', 'lumberjack', 'farmer', 'hunter'].entries()) {
    if (type === 'lumberjack') { const p = await xyOf('gs.piles.log'); await ev(([x, y]) => window.__FV.teleport(x + 90, y + 150), p); }
    let g = await group(type);
    for (let t = 0; t < 140 && !(g.pts.length >= Math.min(3, g.n) && g.work >= 2); t++) { await adv(0.5); g = await group(type); }
    console.log('  variants', type, JSON.stringify(g));
    await frame(g.pts, 1.8, 90);
    await adv(0.3);
    await shot(`07_variants_${i + 1}_${type}`);
  }
  await free();

  // ================================================================ the dog: whistle, run in, treat / play / pet
  await realWaitFor(page, () => !!(window.__FV.scene.dog && window.__FV.scene.dog.r), 90000).catch(() => {});
  await ev(() => { const d = window.__FV.scene.dog; d.love = 34; d.roam(d.r); window.__FV.clearStack(); window.__FV.teleport(1180, 1640); window.__FV.zoom(1.35); });
  await adv(3);
  // move the dog away so it has to come running
  await ev(() => { const r = window.__FV.scene.dog.r; r.x = 820; r.y = 1500; if (r.sprite) r.sprite.setPosition(r.x, r.y); });
  await adv(0.3);
  await tapUI(() => { const ui = window.__FV.game.scene.getScene('UI'); return { x: ui.whistleBtn.x, y: ui.whistleBtn.y }; });
  await adv(0.35);
  {
    const p = await xyOf('gs.player'), d = await xyOf('gs.dog.r');
    await frame([p, d], 1.5, 90, -10);
    await adv(0.1);
    await shot('08_whistle_dog_hears');
  }
  await wait(() => { const s = window.__FV.state(); return s.dog.dog && Math.hypot(s.dog.dog.x - s.player.x, (s.dog.dog.y - s.player.y) * 2) < 300; }, 20, undefined, 0.1);
  {
    const p = await xyOf('gs.player'), d = await xyOf('gs.dog.r');
    await frame([p, d], 1.8, 90, -10);
    await adv(0.05);
    await shot('09_dog_running_in');
  }
  await wait(() => window.__FV.state().dog.mode === 'near', 20, undefined, 0.25);
  await adv(0.5);
  const near = async (z) => { const p = await xyOf('gs.player'), d = await xyOf('gs.dog.r'); await frame([p, d], z || 2.0, 110, -40); };
  await near(); await adv(0.1);
  await shot('10_dog_bar');
  // treat: give -> eat -> hearts
  await dogBtn(0);
  await wait(() => /treat:give/.test(window.__FV.state().dog.scene || ''), 3, undefined, 0.05);
  await adv(0.35); await near();
  await shot('11_treat_give');
  await wait(() => /treat:eat/.test(window.__FV.state().dog.scene || ''), 3, undefined, 0.05);
  await adv(0.5); await near();
  await shot('12_treat_eat');
  await wait(() => window.__FV.state().dog.mode !== 'scene', 5, undefined, 0.05);
  await adv(0.15); await near();
  await shot('13_treat_hearts');
  // pet: crouch + roll + hearts
  await adv(1.2);
  await dogBtn(2);
  await wait(() => /pet:pet/.test(window.__FV.state().dog.scene || ''), 3, undefined, 0.05);
  await adv(1.05); await near();
  await shot('14_pet_roll_hearts');
  await wait(() => window.__FV.state().dog.mode !== 'scene', 6, undefined, 0.2);
  // play: throw -> fetch -> bring back, then the catch
  await adv(1.2);
  await dogBtn(1);
  await wait(() => /play:flight/.test(window.__FV.state().dog.scene || ''), 3, undefined, 0.05);
  await adv(0.2);
  { const p = await xyOf('gs.player'), d = await xyOf('gs.dog.r'); await frame([p, d, [p[0] + (d[0] > p[0] ? 280 : -280), p[1] + 40]], 1.6, 90, -20); }
  await shot('15_play_throw');
  await wait(() => /play:back/.test(window.__FV.state().dog.scene || ''), 8, undefined, 0.1);
  await adv(0.3);
  { const p = await xyOf('gs.player'), d = await xyOf('gs.dog.r'); await frame([p, d], 1.8, 100, -20); }
  await shot('16_play_bring_back');
  await wait(() => window.__FV.state().dog.mode !== 'scene', 8, undefined, 0.2);
  await adv(1.3);
  await dogBtn(1);
  await wait(() => { const s = window.__FV.state().dog; return s.dog && s.dog.anim === 'catch'; }, 4, undefined, 0.05);
  await adv(0.1);
  { const p = await xyOf('gs.player'), d = await xyOf('gs.dog.r'); await frame([p, d], 1.8, 100, -30); }
  await shot('17_play_catch');
  await wait(() => window.__FV.state().dog.mode !== 'scene', 8, undefined, 0.2);
  await adv(0.2); await near();
  await shot('18_play_hearts');
  await free();

  // ================================================================ overview
  await ev(() => { window.__FV.teleport(1000, 1100); });
  await adv(1);
  await ev(() => window.__FV.camera(1000, 1150, 0.62));
  await adv(1.5);
  await shot('19_village_lines');
  await free();
  await adv(0.5);
  await ev(() => window.__FV.zoom('overview'));
  await adv(2.5);
  await shot('20_overview');
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
console.log(`${made.length} screenshots in ${OUT}`);
process.exit(fatal || log.errors.length ? 1 : 0);
