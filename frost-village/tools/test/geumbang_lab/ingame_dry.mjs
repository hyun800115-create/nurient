// The 금방 integration dry run in the REAL v4.2 game (no v4.2 file is edited): index.html with the v4.1 46-min save,
// the depot force-built (window.__FV.v42.depot, the v4.2 test hook), then the module added at runtime exactly as patch
// G-P1 would add it — `gs.v42.add('gb', new GeumbangSystem(gs, gs.v42, gs.v42.saved, null))` — the letter due, the
// 금방 개업 pad paid by standing on it, the first order followed to the door, the app opened. It proves the port adapter
// (src/geumbang/ports_v4.js) against the live objects and shows what each missing patch costs.
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers nice -n 15 node tools/test/geumbang_lab/ingame_dry.mjs
// -> docs/previews/geumbang_lab_ingame_*.jpg + geumbang_lab_ingame.json (errors, ms per tick, objects, textures)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from '../serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from '../pw.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews');
const SAVE = fs.readFileSync(path.join(ROOT, 'tools', 'test', 'fixtures', 'v41_save_smart_46min.json'), 'utf8');
const W = 390, H = 844;

const srv = await start();
const browser = await launch();
const out = { shots: [], errors: [], steps: [] };
const step = (s) => { out.steps.push(s); console.log('  ' + s); };
try {
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: W, height: H }, dpr: 2 });
  await page.evaluate((sv) => { try { localStorage.clear(); localStorage.setItem('frostVillage.save.v1', sv); } catch (e) { /* */ } }, SAVE);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 180000);
  await sleep(1500);
  await page.evaluate(() => {
    const game = window.__FV.game; game.loop.sleep();
    let T = game.loop.time || performance.now(); const DT = 1000 / 60;
    window.__run = (sec) => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { T += DT; game.headlessStep(T, DT); } };
    window.__draw = () => { T += DT; game.step(T, DT); };
  });
  const run = async (sec) => { for (let s = 0; s < sec; s += 5) await page.evaluate((d) => window.__run(d), Math.min(5, sec - s)); };
  const warm = async (sec) => { await page.evaluate(() => window.__FV.game.loop.wake()); await sleep(sec * 1000); await page.evaluate(() => window.__FV.game.loop.sleep()); };
  const until = async (fn, maxS, chunk = 1, label = '') => { for (let t = 0; t < maxS; t += chunk) { if (await page.evaluate(fn)) return true; await run(chunk); } step('timeout ' + label); return false; };
  const shot = async (name, cam) => {
    if (cam) await page.evaluate((c) => window.__FV.camera(c.x, c.y, c.z), cam);
    await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); if (ui && ui.bannerBox && ui.bannerBox.visible && !window.__keepBanner) { ui.tweens.killTweensOf(ui.bannerBox); ui.bannerBox.setVisible(false); } for (let i = 0; i < 12; i++) window.__draw(); });
    const file = 'geumbang_lab_ingame_' + name + '.jpg';
    await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 84, timeout: 120000 });
    out.shots.push(file);
    step('shot ' + file);
  };
  await warm(3);
  // ---- the v4.2 state 금방 needs: the depot built with stock, the day clock running (10:00)
  await page.evaluate(() => {
    const F = window.__FV, gs = F.scene, v = gs.v42;
    if (v && !v.seen.whatsNew) { v.seen.whatsNew = 1; const ui = F.game.scene.getScene('UI'); if (ui.hud42 && ui.hud42.card && ui.hud42.closeCard) ui.hud42.closeCard(); }
    F.v42.depot({ build: true });
    F.v42.depot({ stock: { item_plank: 60, item_ingot: 40, item_fish_cooked: 40, item_bread: 50, item_axe: 8, item_log: 40, item_can: 20, item_meat_cooked: 20, item_fish_raw: 20, item_wheat: 16 } });
    const nb = gs.v4;
    if (nb && nb.clock) { if (!nb.clock.on && nb.clock.start) nb.clock.start(); nb.clock.set(10); }
    gs.economy.add(12000);
  });
  await warm(6);
  const built = await until(() => { const d = window.__FV.scene.v42.depot; return !!(d && d.building && d.building.ready); }, 30, 1, 'depot building');
  step('depot ready ' + built);
  // ---- the module, added the way G-P1 adds it (one more v4.2 system)
  const added = await page.evaluate(async () => {
    const mod = await import(new URL('src/geumbang/ports_v4.js', location.href).href);
    const gs = window.__FV.scene, v = gs.v42;
    const sys = v.add('gb', new mod.GeumbangSystem(gs, v, v.saved, null));
    if (sys.hooks) sys.hooks(window.__FV.v42);
    window.__gb = sys;
    return { ok: !!sys, gate: sys.gateOpen() };
  });
  step('module added ' + JSON.stringify(added));
  await run(1);
  const st0 = await page.evaluate(() => { const s = window.__gb; return { host: !!s.host, entries: s.entries.length, zones: s.host ? s.host.model.book.list().reduce((o, a) => { o[a.zone] = (o[a.zone] || 0) + 1; return o; }, {}) : null, first: s.host ? (s.host.model.book.households().find((h) => h.first) || {}).name : null }; });
  step('host ' + JSON.stringify(st0));
  // ---- the letter (forced: one game day of gate otherwise) and the pad
  await page.evaluate(() => { const m = window.__gb.host.model; m.gateT = 1e9; });
  await run(1);
  await warm(8);            // the late pages (geumbang, ui6, geumbangfolk, audio8, the dog sled) arrive
  const pad = await page.evaluate(() => { const s = window.__gb; return s.pad ? { x: s.pad.x, y: s.pad.y } : null; });
  step('pad ' + JSON.stringify(pad));
  if (pad) {
    await page.evaluate((p) => window.__FV.teleport(p.x + 60, p.y + 60), pad);
    await run(0.5);
    await shot('pad', { x: pad.x + 120, y: pad.y - 60, z: 0.9 });
    await page.evaluate((p) => window.__FV.teleport(p.x, p.y), pad);
    await until(() => window.__gb.host.model.st >= 1, 40, 1, 'pad paid');
  }
  step('st ' + await page.evaluate(() => window.__gb.host.model.st));
  await run(2.2);
  await page.evaluate(() => { window.__keepBanner = true; });
  await shot('ceremony', null);
  await page.evaluate(() => { window.__keepBanner = false; });
  await until(() => window.__gb.host.model.st === 2 && window.__gb.host.model.orders.list.some((o) => o.first), 30, 0.5, 'first order');
  await run(3);
  await shot('first_pick', null);
  await until(() => { const o = window.__gb.host.model.orders.list.find((q) => q.first); return !o || o.st === 'gone'; }, 120, 1, 'first van out');
  await run(6);
  await shot('first_drive', null);
  await until(() => { const m = window.__gb.host.model, v = m.disp && m.disp.vans[0]; return v && v.st === 'curb' && v.tl && v.beat >= 0 && ['ring', 'open', 'hand'].includes((v.tl.beats[v.beat] || {}).k); }, 120, 0.5, 'ring');
  await shot('first_ring', null);
  step('ring frame ' + JSON.stringify(await page.evaluate(() => { const gs = window.__FV.scene, m = window.__gb.host.model, v = m.disp.vans[0], o = m.orders.list.find((q) => q.first), a = o ? m.book.get(o.aid) : null, c = gs.cameras.main, r = gs.territory.camRect; return { cam: [Math.round(c.midPoint.x), Math.round(c.midPoint.y), +(c.zoom).toFixed(2)], van: [Math.round(v.x), Math.round(v.y)], door: a ? [Math.round(a.door.x), Math.round(a.door.y)] : null, aid: o ? o.aid : null, camRect: [r.x, r.y, r.w, r.h] }; })));
  await until(() => window.__gb.host.model.settle.today.delivered >= 1, 60, 0.5, 'delivered');
  await run(1.5);
  await shot('first_joy', null);
  // ---- a while of ordinary orders, then the hub and the app
  await run(60);
  const D = await page.evaluate(() => { const b = window.__FV.scene.v42.depot.building; return { x: b.x, y: b.y }; });
  await page.evaluate(() => window.__gb.host.api.reveal(true));
  await run(1);
  await shot('hub', { x: D.x - 20, y: D.y - 40, z: 0.85 });
  await page.evaluate(() => window.__gb.host.api.reveal(false));
  await page.evaluate(() => { const v = window.__gb.host.view; if (v && v.openApp) v.openApp('orders'); });
  await run(0.6);
  await shot('app', null);
  await page.evaluate(() => { const v = window.__gb.host.view; if (v && v.app && v.app.close) v.app.close(); });
  // ---- numbers: the module's ms per tick (host incl. view, model alone), objects, textures; the save slice
  const nums = await page.evaluate(async () => {
    const { TF } = await import(new URL('src/core/Townfolk.js', location.href).href);
    const s = window.__gb, h = s.host, gs = window.__FV.scene;
    let ms = 0, mm = 0, n = 0;
    for (let i = 0; i < 300; i++) { window.__run(1 / 60); ms += h.ms; mm += h.msModel; n++; }
    const sl = gs.v42.serialize().geumbang;
    const tex = window.__FV.texStats();
    const tm = gs.textures, mod = /^(gb_bld_0|gb_van_0|gbf_road_0|gbf_hub_0|ui6_gb|gb_photo_)/;
    let mib = 0;
    for (const k of tm.getTextureKeys()) if (mod.test(k)) { const src = tm.get(k).source[0]; if (src) mib += (src.width * src.height * 4) / 1048576; }
    return { msHost: +(ms / n).toFixed(3), msModel: +(mm / n).toFixed(4), objects: h.view ? h.view.objects() : 0, sceneObjects: gs.children.length, texMiB: tex.totalMiB, moduleMiB: +mib.toFixed(2), slice: sl ? JSON.stringify(sl).length : 0, today: h.model.settle.today, vans: h.model.disp ? h.model.disp.vans.map((v) => v.st) : [], view: !!h.view, tfGb: !!TF.gb, zones: h.model.book.list().reduce((o, a) => { o[a.zone] = (o[a.zone] || 0) + 1; return o; }, {}) };
  });
  out.numbers = nums;
  step('numbers ' + JSON.stringify(nums));
  out.errors = log.errors.slice(0, 40);
  out.missing404 = log.missing404.slice(0, 20);
  out.warnings = log.warnings.filter((w) => /gb|금방|geumbang/i.test(w)).slice(0, 20);
  await page.close();
} catch (e) {
  out.errors.push('runner: ' + String(e && e.stack ? e.stack : e).split('\n').slice(0, 4).join(' | '));
}
fs.writeFileSync(path.join(OUT, 'geumbang_lab_ingame.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify({ shots: out.shots.length, errors: out.errors, missing404: out.missing404 }, null, 1));
await browser.close();
await srv.close();
