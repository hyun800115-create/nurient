// v4 BUILD-A perf + look (docs/v4_plan.md §16.4): with the 100-person town, the train and the doll shoppers —
// logic per tick (fixed-step bench), draw calls per frame, display objects, texture memory (source-sum MiB,
// the v3.5 reviewers' probe), and the must-look screenshots for A's systems:
//   docs/previews/screens_v4/a_*.jpg  (plaza queue of townsfolk, train arriving, town overview, crowded street,
//   morning / noon / dusk / night, zoom 0.6 lite rigs)
//   node tools/test/v4a_perf.mjs            (numbers -> docs/previews/screens_v4/a_perf.json)
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render } from './fv_step.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews', 'screens_v4');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const step = (name, ok, info = '') => { results.push({ name, ok }); console.log((ok ? '  ok  ' : ' FAIL ') + name + (info ? '  — ' + info : '')); };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 } });
await page.addInitScript(() => {
  const C = window.__GLC = { draw: 0, bind: 0, upload: 0 };
  const patch = (proto) => {
    for (const m of ['drawElements', 'drawArrays']) { const o = proto[m]; proto[m] = function (...a) { C.draw++; return o.apply(this, a); }; }
    const b = proto.bindTexture; proto.bindTexture = function (...a) { C.bind++; return b.apply(this, a); };
    for (const m of ['texImage2D', 'texSubImage2D']) { const o = proto[m]; proto[m] = function (...a) { C.upload++; return o.apply(this, a); }; }
  };
  if (window.WebGLRenderingContext) patch(WebGLRenderingContext.prototype);
  if (window.WebGL2RenderingContext) patch(WebGL2RenderingContext.prototype);
});
const ev = (fn, arg) => page.evaluate(fn, arg);
const adv = (s) => advance(page, s);
const shot = async (n) => { await render(page, 3); await page.screenshot({ path: path.join(OUT, 'a_' + n + '.jpg'), type: 'jpeg', quality: 82 }); console.log('   shot a_' + n); };
const nudge = (fn, ms = 90000) => waitFor(page, `(() => { const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); return (${fn})(); })()`, ms).then(() => true).catch(() => false);

/** draw calls / binds / uploads per drawn frame, display objects, texture source-sum */
const measure = (label) => ev(async (label) => {
  const C = window.__GLC, gs = window.__FV.scene, g = window.__FV.game;
  for (let i = 0; i < 4; i++) window.__step.frame();
  const s = { draw: C.draw, bind: C.bind, upload: C.upload };
  const n = 12;
  for (let i = 0; i < n; i++) window.__step.frame();
  let texBytes = 0, nTex = 0;
  for (const k of Object.keys(g.textures.list)) {
    if (k === '__DEFAULT' || k === '__MISSING' || k === '__NORMAL') continue;
    const t = g.textures.list[k];
    for (const src of t.source) { texBytes += src.width * src.height * 4; nTex++; }
  }
  const kids = gs.children.list;
  let vis = 0, piles = 0;
  const pileSet = new Set();
  for (const p of Object.values(gs.piles || {})) if (p && p.stack && p.stack.items) for (const it of p.stack.items) if (it.spr) pileSet.add(it.spr);
  for (const o of kids) { if (o.visible) vis++; if (pileSet.has(o)) piles++; }
  const v4 = gs.v4 ? gs.v4.state() : null;
  return {
    label, drawPerFrame: +((C.draw - s.draw) / n).toFixed(1), bindPerFrame: +((C.bind - s.bind) / n).toFixed(1), uploadsPerFrame: +((C.upload - s.upload) / n).toFixed(2),
    objs: kids.length, visible: vis, pileItems: piles, texMiB: +(texBytes / 1048576).toFixed(1), textures: nTex,
    dolls: v4 && v4.dolls, live: v4 && v4.town ? v4.town.live : 0, visitors: v4 ? v4.visitors.length : 0, hour: v4 ? v4.clock.hour : null,
  };
}, label);
const bench = (n = 240) => ev((n) => window.__step.bench(n), n);

const R = { scenes: [], bench: {} };
let fatal = null;
try {
  await ev(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(400);
  await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 180000);
  await sleep(1500);
  await installStepper(page);
  await adv(2);
  R.scenes.push(await measure('new game (v3.5 content only)'));
  // a full v3 village, v4 on: station repaired, first train in, the town open, all doll sheets here
  await ev(() => { window.__FV.unlockV3(); window.__FV.give(50000); });
  await adv(1);
  await nudge(() => window.__FV.scene.v4 && window.__FV.scene.v4.ready && window.__FV.hasTex('town_civic'));
  R.scenes.push(await measure('v3 complete + rail strip open (ruin)'));
  await ev(() => window.__FV.v4.repair());
  await nudge(() => window.__FV.hasTex('train_engine') && window.__FV.scene.v4.town && window.__FV.state().v4.tf && window.__FV.state().v4.tf.adult && window.__FV.state().v4.tf.elder, 150000);
  // the train rolls in: the camera on our station
  await ev(() => window.__FV.camera(3330, 1420, 1.05));
  let t = 0;
  for (; t < 40; t++) { await adv(0.25); if (await ev(() => window.__FV.state().v4.arrivals > 0)) break; }
  await adv(1.2);
  await shot('train_arriving');
  await adv(5);
  await ev(() => window.__FV.camera(3330, 1480, 1.05));
  await adv(1);
  await shot('neighbours_step_off');
  await ev(() => window.__FV.v4.openTown());
  await nudge(() => ['town_shops', 'town_homes', 'town_park', 'town_street'].every((k) => window.__FV.hasTex(k)) && window.__FV.state().v4.tf.child, 150000);
  // the plaza: doll customers in line (anonymous customers look like townsfolk) + train visitors on the way
  await ev(() => { const m = window.__FV.scene.market; window.__FV.teleport(m.x + 120, m.y + 180); window.__FV.camera(m.x + 40, m.y + 60, 1.1); });
  await adv(40);
  const q = await ev(() => { const m = window.__FV.scene.market; return { line: m.queue.length, dolls: m.queue.filter((c) => c.sprite.isDoll).length, visitors: m.queue.filter((c) => c.citizen && c.stage).length }; });
  step('the plaza line is townsfolk now (paper dolls)', q.line > 0 && q.dolls >= Math.max(1, q.line - 1), JSON.stringify(q));
  await shot('plaza_queue');
  const tp = await ev(() => { const tr = window.__FV.scene.trade; return { citizen: !!(tr.merchant && tr.merchant.citizen), doll: !!(tr.merchant && tr.merchant.sprite.isDoll), kind: tr.merchant && tr.merchant.citizen && tr.merchant.citizen.kind }; });
  step('the trade post buyer is a townsperson (a builder of the town)', tp.citizen && tp.doll, JSON.stringify(tp));
  R.scenes.push(await measure('plaza with doll customers + visitors'));
  R.bench.plaza = await bench();
  // the town by the hour
  const town = [[4900, 2450, 1.0]];
  for (const [h, name] of [[8.4, 'town_morning'], [12.1, 'town_noon'], [17.7, 'town_dusk'], [21.4, 'town_night']]) {
    await ev((h) => window.__FV.v4.clock(h), h);
    await ev(([x, y, z]) => window.__FV.camera(x, y, z), town[0]);
    await adv(6);
    await shot(name);
    R.scenes.push(await measure(name));
    if (h === 12.1) R.bench.town_noon = await bench();
    if (h === 21.4) R.bench.town_night = await bench();
  }
  // a crowded street: school out at the fountain / playground
  await ev(() => window.__FV.v4.clock(15.05));
  await ev(() => window.__FV.camera(4780, 2330, 1.15));
  await adv(10);
  await shot('town_crowd');
  R.scenes.push(await measure('town school out (crowd)'));
  // zoomed out: lite rigs, then the overview of the neighbours' area
  await ev(() => window.__FV.v4.clock(12.5));
  await ev(() => window.__FV.camera(4900, 2500, 0.6));
  await adv(3);
  await shot('town_zoom06');
  R.scenes.push(await measure('town zoom 0.6 (lite rigs)'));
  await ev(() => { window.__FV.teleport(4900, 2500); window.__FV.camera(); window.__FV.scene.toggleOverview(); });
  await adv(3);
  await shot('overview');
  R.scenes.push(await measure('overview of the neighbours area'));
  R.bench.overview = await bench(120);
  await ev(() => { if (window.__FV.scene.overview) window.__FV.scene.toggleOverview(); });
  // numbers
  const P = await ev(() => { const nb = window.__FV.scene.v4; return { townMs: nb.town.stats.ms, all: nb.ms, census: nb.town.census(), rigs: window.__FV.scene.dollPool.stats }; });
  R.town = P;
  for (const s of R.scenes) console.log('   ' + JSON.stringify(s));
  console.log('   bench ' + JSON.stringify(R.bench));
  const maxDraw = Math.max(...R.scenes.slice(2).map((s) => s.drawPerFrame));
  // (judged on the median: on this shared machine other jobs' CPU spikes land in the mean; the mean is logged too)
  step('logic per tick (median): plaza ≤ 1.6 ms, town ≤ 2.1 ms (fixed-step bench, SwiftShader)', R.bench.plaza.p50 <= 1.6 && R.bench.town_noon.p50 <= 2.1,
    'p50 / mean: plaza ' + R.bench.plaza.p50 + ' / ' + R.bench.plaza.avg + ', town noon ' + R.bench.town_noon.p50 + ' / ' + R.bench.town_noon.avg + ', town night ' + R.bench.town_night.p50 + ' / ' + R.bench.town_night.avg);
  step('town sim ≤ 0.35 ms per frame', P.townMs <= 0.35, P.townMs.toFixed(3) + ' ms (all v4 ' + P.all.toFixed(3) + ' ms)');
  step('draw calls per frame logged (gate ≤ 12 is BUILD-B\'s pages work)', maxDraw > 0, 'max ' + maxDraw + ' ' + R.scenes.map((s) => s.label.split(' ')[0] + ':' + s.drawPerFrame).join(' '));
  const tex = R.scenes.map((s) => s.texMiB);
  step('texture memory logged (source-sum MiB; must ≤ 455 is BUILD-B\'s residency work)', tex.every((x) => x > 0), tex.join(' / '));
  fs.writeFileSync(path.join(OUT, 'a_perf.json'), JSON.stringify(R, null, 1));
} catch (e) { fatal = e; console.log('FATAL', e && e.stack || e); }
const errs = log.errors.filter((e) => !/favicon/.test(e));
step('no page errors', errs.length === 0 && !fatal, errs.slice(0, 3).join(' | '));
await browser.close();
await srv.close();
const fails = results.filter((r) => !r.ok).length;
console.log(fails ? `\n${fails} FAILED of ${results.length}` : `\nall ${results.length} passed`);
process.exit(fails ? 1 : 0);
