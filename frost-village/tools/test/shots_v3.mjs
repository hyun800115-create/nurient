// v3 screenshots (생산 사슬과 땅 넓히기) -> docs/previews/screens_v3/NN_name.jpg
//   node tools/test/shots_v3.mjs [--only 07]
// Plays the v3 flow on the fixed-step clock with the real systems (pads, porters, builders, boats);
// only coins and raw goods on output pads are handed in so it stays short. Phone viewport 390x844 @2x.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render, walkStep } from './fv_step.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews', 'screens_v3');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 } });
const ev = (fn, a) => page.evaluate(fn, a);
const adv = (s) => advance(page, s);
const wait = async (fn, sec, a) => { for (let t = 0; t < sec; t += 0.25) { if (await ev(fn, a)) return true; await adv(0.25); } return false; };
const where = (n) => ev((k) => window.__FV.where(k), n);
const cam = (x, y, z) => ev(([x, y, z]) => window.__FV.camera(x, y, z), [x, y, z]);
const walk = (t, tol) => walkStep(page, t, { tol: tol || 14 });
const shots = [];
const shot = async (name) => {
  if (only && !name.startsWith(only)) return;
  await render(page, 3);
  await page.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 84 });
  shots.push(name); console.log('shot', name);
};
const pushOut = (id, type, n) => ev(([id, type, n]) => { const gs = window.__FV.scene; const s = gs.stations[id]; for (let i = 0; i < n; i++) s.outStack.push(type, null, gs.effects); }, [id, type, n]);
const aside = () => ev(() => { window.__FV.clearStack(); window.__FV.teleport(1000, 1160); });

try {
  await ev(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  await sleep(600);
  await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 180000);
  await waitFor(page, () => window.__FV.game.textures.exists('bld_buildings') && window.__FV.game.textures.exists('bld_sites'), 180000).catch(() => {});
  await installStepper(page);
  await ev(() => { window.__FV.unlockAll(); window.__FV.give(4000); });
  await adv(3);

  // 01 the fog wall at the edge of the village, the first watchtower pad in front of it
  const tp = await where('tower_east');
  await walk({ x: tp.x - 120, y: tp.y + 90 });
  await cam(tp.x + 40, tp.y - 60, 0.85); await adv(1);
  await shot('01_fog_wall_tower_pad');
  // 02 pay the pad -> the site; porters bring the planks on their backs
  await walk(tp);
  await wait(() => window.__FV.state().done.includes('tower_east'), 10);
  await aside();
  await pushOut('sawmill', 'item_plank', 12);
  await wait(() => window.__FV.scene.porters.some((p) => p.dest && p.dest.id === 'tower_east' && p.stack.count > 0 && p.y < 1000), 80);
  { const p = await ev(() => { const w = window.__FV.scene.porters.find((q) => q.dest && q.dest.id === 'tower_east'); return w ? { x: w.x, y: w.y } : null; }); if (p) { await cam(p.x + 60, p.y - 50, 1.1); await adv(0.3); } }
  await shot('02_porter_carries_planks');
  await cam(tp.x, tp.y - 120, 0.95);
  await wait(() => { const s = window.__FV.state().sites.tower_east; return s && s.state === 'scaffold'; }, 90);
  await adv(2.2);
  await shot('03_tower_scaffold_builders');
  // 04 lit: the beacon catches fire, the fog rolls back, the camera pans to the new land
  await wait(() => window.__FV.state().built.watchtower, 60);
  await adv(1.4);
  await shot('04_tower_lit');
  await adv(1.6);
  await shot('05_fog_clearing');
  await wait(() => window.__FV.state().territory.east, 20);
  await adv(3);
  await cam(2250, 1000, 0.6); await adv(1);
  await shot('06_new_land_east');
  await ev(() => window.__FV.camera());

  // 07 build menu on a plot
  await walk(await where('plot:e_m1'), 10);
  await wait(() => window.__FV.buildMenuOpen, 6);
  await ev(() => { const ui = window.__FV.game.scene.getScene('UI'); ui.selectCard('toolsmith'); });
  await render(page, 2);
  await shot('07_build_menu');
  await ev(() => window.__FV.game.scene.getScene('UI').confirmBuild());
  await aside();
  await pushOut('sawmill', 'item_plank', 9); await pushOut('smelter', 'item_ingot', 5);
  const e1 = await where('site:e_m1');
  await cam(e1.x - 30, e1.y - 20, 1.0);
  await wait(() => { const s = window.__FV.state().sites.e_m1; return s && s.got.item_plank + s.got.item_ingot >= 4; }, 80);
  await shot('08_foundation_materials_arrive');
  await wait(() => { const s = window.__FV.state().sites.e_m1; return s && s.state === 'scaffold'; }, 90);
  await adv(3);
  await shot('09_scaffold_builders');
  await wait(() => window.__FV.state().built.toolsmith, 40);
  await adv(0.5);
  await shot('10_building_done');
  await ev(() => window.__FV.camera());

  // 11 the toolsmith at work: the hire pad waits for an axe
  await pushOut('sawmill', 'item_plank', 2); await pushOut('smelter', 'item_ingot', 2);
  await wait(() => window.__FV.scene.workshops.some((w) => w.kind === 'toolsmith' && w.working), 60);
  await cam(e1.x + 10, e1.y + 10, 1.25); await adv(0.6);
  await shot('11_toolsmith_working');
  const hp = await where('hire2_lumberjack');
  if (hp) { await walk({ x: hp.x + 90, y: hp.y + 60 }); await cam(hp.x, hp.y - 20, 1.2); await adv(0.5); await shot('12_tool_gated_hire_pad'); }
  await ev(() => window.__FV.camera());

  // 13 the mine food box and a hungry miner
  await wait(() => { const f = window.__FV.state().food; return f && f.active; }, 15);
  await ev(() => { const gs = window.__FV.scene; while (gs.foodBox.stock.count) gs.effects.releaseItem(gs.foodBox.stock.pop().spr); gs.foodBox.refresh(); for (const w of gs.workers) if (w.type === 'miner') w.oreLeft = 1; for (const k of ['bakery', 'smokehouse']) { gs.stations[k].inStack.clear(gs.effects); gs.stations[k].outStack.clear(gs.effects); } for (const p of gs.porters) if (p.station && (p.station.id === 'bakery' || p.station.id === 'smokehouse')) p.stack.clear(gs.effects); });
  await wait(() => window.__FV.state().hungry > 0, 60);
  const fb = await where('foodBox');
  await walk({ x: fb.x + 120, y: fb.y + 70 });
  await cam(fb.x + 40, fb.y - 40, 1.2); await adv(1.2);
  await shot('13_mine_food_box_hungry');
  await ev(() => window.__FV.camera());

  // everything else (instant), then the boat, cannery, store, warehouse, houses
  await ev(() => { window.__FV.give(30000); window.__FV.unlockV3(); });
  await adv(3);
  await walk(await where('boat_rowboat'));
  await wait(() => window.__FV.state().done.includes('boat_rowboat'), 10);
  await wait(() => { const b = window.__FV.state().boat; return b && b.state === 'out' && b.y < 560; }, 40);
  { const b = await where('boat'); await cam(b.x - 40, b.y + 30, 1.15); await adv(0.4); }
  await shot('14_rowboat_wake');
  await ev(() => window.__FV.camera());
  // cannery: fish + ingots in, cans out
  await ev(() => { const gs = window.__FV.scene; const c = gs.workshops.find((w) => w.kind === 'cannery'); for (let i = 0; i < 9; i++) c.inStack.push('item_fish_raw', null, gs.effects); for (let i = 0; i < 3; i++) c.inStack.push('item_ingot', null, gs.effects); });
  await wait(() => { const w = window.__FV.state().workshops.cannery; return w && w.out >= 3 && w.working; }, 30);
  { const c = await where('cannery'); await cam(c.x + 10, c.y, 1.2); await adv(0.3); }
  await shot('15_cannery');
  // store: clerk, cans on the shelf, a queue
  await ev(() => { const gs = window.__FV.scene; for (let i = 0; i < 10; i++) gs.store.stock.push('item_can', null, gs.effects); for (const t of ['item_axe', 'item_rod']) for (let i = 0; i < 2; i++) gs.store.stock.push(t, null, gs.effects); });
  await walk(await where('storeRegister'));
  await wait(() => window.__FV.scene.progress.flags.firstStoreSale, 60);
  await wait(() => window.__FV.state().pads.includes('hire_clerk_store'), 10);
  await walk(await where('hire_clerk_store'));
  await wait(() => { const c = window.__FV.scene.store.register.clerk; return c && c.state === 'post'; }, 40);
  await ev(() => window.__FV.teleport(2300, 1250));
  await wait(() => window.__FV.state().store.queue >= 3, 60);
  { const s = await where('storeRegister'); await cam(s.x - 60, s.y - 50, 1.15); await adv(0.5); }
  await shot('16_store_clerk_queue');
  // warehouse: overflow coming in
  await ev(() => { const gs = window.__FV.scene; for (const id of ['smelter', 'sawmill']) { const S = gs.stations[id]; for (let i = 0; i < S.outStack.max; i++) S.outStack.push(S.output, null, gs.effects); } });
  await wait(() => window.__FV.state().warehouse.total > 6, 90);
  { const w = await where('warehouse'); await cam(w.x - 20, w.y + 10, 1.0); await adv(0.3); }
  await shot('17_warehouse');
  // houses: someone waits, a house is built, they walk in
  {
    const plot = await ev(() => { const gs = window.__FV.scene; const p = Object.values(gs.sites).find((q) => q.kind === 'plot' && q.state === 'plot' && q.shown && q.size === 'S'); return p ? p.id : null; });
    if (plot) {
      // (two residents step out of the village and wait for a home, so the move-in can be filmed)
      await ev(() => { const L = window.__FV.scene.life; for (const k of ['npc_postman', 'npc_bard']) { const r = L.byKey[k]; if (r) L.despawn(r); const i = L.moved.indexOf(k); if (i >= 0) L.moved.splice(i, 1); if (L.waiting.indexOf(k) < 0) L.waiting.push(k); } });
      await ev((id) => { window.__FV.build(id, 'house_a'); window.__FV.supply(id); }, plot);
      const h = await where('site:' + plot);
      await cam(h.x - 60, h.y + 20, 1.0);
      await wait((id) => window.__FV.state().sites[id].state === 'done', 40, plot);
      await adv(3.2);
      await shot('18_house_move_in');
    }
  }
  // 19 the fishing boat (big catch), 20 overview, 21 the finale
  await ev(() => { window.__FV.clearStack(); const gs = window.__FV.scene; gs.player.stack.push('item_rod', null, gs.effects); });
  await walk(await where('boat_fishing'));
  await wait(() => window.__FV.state().done.includes('boat_fishing'), 15);
  await wait(() => { const b = window.__FV.state().boat; return b && b.state === 'fish'; }, 60);
  { const b = await where('boat'); await cam(b.x, b.y + 40, 1.1); await adv(0.3); }
  await shot('19_fishing_boat');
  await ev(() => { window.__FV.camera(); window.__FV.zoom('overview'); });
  await adv(3);
  await shot('20_overview');
  await ev(() => window.__FV.zoom('overview'));
  await adv(1.5);
  await ev(() => { const pr = window.__FV.scene.progress; pr.flags.fedMiners = true; if (pr.pads.hire2_lumberjack) window.__FV.completeStep('hire2_lumberjack'); });
  await wait(() => window.__FV.state().celebrated3, 20);
  await adv(1.2);
  await shot('21_v3_complete');
} catch (e) { console.log('FATAL', e && e.stack || e); }
console.log('page errors:', log.errors.length);
for (const e of log.errors.slice(0, 5)) console.log('  ', e.slice(0, 400));
console.log('placeholders:', (await ev(() => window.__FV.warnings()).catch(() => [])).join(',') || 'none');
console.log('shots:', shots.length);
await browser.close(); await srv.close();
