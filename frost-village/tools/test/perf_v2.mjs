// v2 performance: logic ms per frame with everything unlocked and the full population (fixed-step
// update-only timing, independent of headless rendering speed), plus a few rendered frames.
//   node tools/test/perf_v2.mjs [--residents 24]
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance } from './fv_step.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: 1 });
const ev = (fn, a) => page.evaluate(fn, a);
const out = {};
try {
  await ev(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 90000);
  await sleep(800);
  await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.scene.life, 60000);
  await installStepper(page);
  await ev(() => { window.__FV.give(5000); window.__FV.unlockAll(); });
  for (let i = 0; i < 120; i++) { await advance(page, 0.5); await sleep(250); if ((await ev(() => window.__FV.life().queued)) === 0) break; }
  // top up to the cap with extra villagers if fewer moved in (e.g. batch 2 art missing)
  const want = Number(opt('--residents', '24'));
  await ev((n) => { const l = window.__FV.scene.life; for (let i = 0; i < 40 && l.residents.length < n; i++) { const k = l.trigger('moveIn'); if (!k) break; l.update(0.016); } }, want);
  await advance(page, 30);
  const scenes = [['green (most residents)', 990, 1550, 1.2], ['plaza', 1050, 800, 1.2], ['overview (everything visible)', 900, 1310, 0.4]];
  for (const [name, x, y, z] of scenes) {
    await ev(([x, y, z]) => { window.__FV.camera(x, y, z); window.__FV.teleport(x, y + 30); }, [x, y, z]);
    await advance(page, 3);
    out[name] = await ev(() => {
      const gs = window.__FV.scene, l = gs.life;
      const b = window.__step.bench(600);
      // rendered frames (SwiftShader: slow, only relative)
      const rt = [];
      for (let i = 0; i < 20; i++) { const a = performance.now(); window.__step.frame(); rt.push(performance.now() - a); }
      rt.sort((p, q) => p - q);
      return Object.assign(b, { residents: l.residents.length, onScreen: l.residents.filter((r) => !r.lod).length, agents: gs.agents.length, events: l.events.map((e) => e.kind).join(','), frameWithRenderMs: +rt[10].toFixed(2) });
    });
    console.log(name, JSON.stringify(out[name]));
  }
} catch (e) { console.log('FATAL', e.stack || e); }
console.log('errors', log.errors.length, log.errors.slice(0, 5).join('\n'));
await browser.close(); await srv.close();
