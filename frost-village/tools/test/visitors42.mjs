// (v4.2, docs/v42_plan.md §5.3 + §15) the loops make a round trip ≈ 85 s instead of 59 s, so each train brings
// ridersScale (= cycle / 59.3) times the riders: the neighbours who step off per game minute stay within ±10 % of v4.1.
//   node tools/test/visitors42.mjs --base <a v4.1 copy of frost-village> [--minutes 20]
// Both builds load the same v4.1 46-min save (village complete, station open), run on the fixed-step clock with the
// chief standing still, and count Neighbours.alightVisitor calls (every neighbour who steps off at our station).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, sleep, waitFor, tapStart } from './pw.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = opt('--base', '');
const MIN = Number(opt('--minutes', '20'));
const SAVE = fs.readFileSync(path.join(HERE, 'fixtures', 'v41_save_smart_46min.json'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 400) : '')); } };
if (!BASE || !fs.existsSync(path.join(BASE, 'index.html'))) { console.log('visitors42: --base <v4.1 copy> is required (skipped)'); process.exit(0); }

async function run(root, label) {
  const srv = await start(0, { prefix: '/vz/', root });
  const browser = await launch();
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: 1 });
  await page.evaluate((sv) => { try { localStorage.clear(); localStorage.setItem('frostVillage.save.v1', sv); } catch (e) { /* */ } }, SAVE);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 300000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 300000);
  await sleep(1500);
  await page.evaluate(() => {
    const game = window.__FV.game, gs = window.__FV.scene, nb = gs.v4;
    game.loop.sleep();
    let D = Date.now(); let T = game.loop.time || performance.now();
    Date.now = () => D;
    const DT = 1000 / 60;
    try { if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1; } catch (e) { /* */ }
    const w = window.__vz = { n: 0, byMin: [], trains: 0 };
    const al = nb.alightVisitor.bind(nb);
    nb.alightVisitor = (...a) => { w.n++; const m = Math.floor(window.__sim.simT / 60); w.byMin[m] = (w.byMin[m] || 0) + 1; return al(...a); };
    if (nb.rail && nb.rail.on) nb.rail.on('arrive', (where) => { if (where === 'ours' || where === undefined) w.trains++; });
    window.__sim = { simT: 0, run(sec) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { T += DT; D += DT; this.simT += DT / 1000; game.headlessStep(T, DT); } } };
  });
  for (let s = 0; s < MIN * 60; s += 10) await page.evaluate(() => window.__sim.run(10));
  const r = await page.evaluate(() => ({ n: window.__vz.n, byMin: window.__vz.byMin, trains: window.__vz.trains, cycle: window.__FV.scene.v4.rail.cycle ? +window.__FV.scene.v4.rail.cycle().toFixed(1) : null, inVillage: window.__FV.scene.v4.visitors.length }));
  await browser.close();
  await srv.close();
  console.log(`  ${label}: ${r.n} neighbours stepped off in ${MIN} min (${(r.n / MIN).toFixed(2)}/min) · cycle ${r.cycle} s · in the village now ${r.inVillage} · errors ${log.errors.length}`);
  return Object.assign(r, { errors: log.errors });
}

const t0 = Date.now();
console.log(`visitors per game minute: v4.1 copy vs this build, the 46-min save, ${MIN} game minutes`);
const a = await run(path.resolve(BASE), 'v4.1');
const b = await run(ROOT, 'v4.2');
// (the first 3 minutes are the save's own crowd settling: compare the rest)
const rate = (r) => { const m = r.byMin.slice(3, MIN); let s = 0; for (let i = 0; i < m.length; i++) s += m[i] || 0; return s / Math.max(1, MIN - 3); };
const ra = rate(a), rb = rate(b), k = rb / Math.max(0.01, ra);
console.log(`  minutes 3–${MIN}: v4.1 ${ra.toFixed(2)}/min · v4.2 ${rb.toFixed(2)}/min (${Math.round(k * 100)} %)`);
ok(Math.abs(k - 1) <= 0.1, 'visitors per game minute within ±10 % of v4.1 (' + Math.round(k * 100) + ' %)', { a: ra, b: rb });
ok(a.errors.length === 0 && b.errors.length === 0, 'no page errors', a.errors.concat(b.errors).slice(0, 4));
console.log(`\n${pass} passed, ${fail} failed  (wall ${((Date.now() - t0) / 1000) | 0}s)`);
process.exit(fail ? 1 : 0);
