// v2: close-up screenshots of both registers with their clerks (staff points), for review.
//   node tools/test/clerk_view.mjs  -> docs/previews/screens_v2/v2_20_clerk_market.jpg, v2_21_clerk_trade.jpg
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render, until } from './fv_step.mjs';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews', 'screens_v2');
const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 } });
const ev = (fn, a) => page.evaluate(fn, a);
try {
  await ev(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(800); await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.scene.life, 60000);
  const lz = () => ev(() => { const g = window.__FV.scene, A = window.__FV.Assets || null; const tex = g.textures.getTextureKeys().filter((k) => /^vil_/.test(k)).length; const L = g.load; return { vilTex: tex, loading: L.isLoading(), list: L.list.size, inflight: L.inflight.size, queue: L.queue.size, clerkA: g.textures.exists('vil_npc_clerk_a'), t: Math.round(performance.now() / 1000) }; });
  console.log('at start', JSON.stringify(await lz()));
  await sleep(10000);
  console.log('after 10 s real (loop running)', JSON.stringify(await lz()));
  await installStepper(page);
  await ev(() => { window.__FV.give(5000); window.__FV.unlockAll(); });
  await until(page, () => { const s = window.__FV.state(); return s.market.clerk && s.trade.clerk && window.__FV.scene.market.register.clerk.ready && window.__FV.scene.trade.register.clerk.ready; }, 60);
  await until(page, () => { const g = window.__FV.scene; return g.market.register.clerk.key.startsWith('npc_clerk') && g.trade.register.clerk.key.startsWith('npc_clerk'); }, 60);
  await ev(() => { const gs = window.__FV.scene; for (let i = 0; i < 6; i++) gs.market.stock.push('item_fish_cooked', null, gs.effects); });
  await advance(page, 8);
  console.log('after unlock waits', JSON.stringify(await lz()));
  const info = await ev(() => { const g = window.__FV.scene; const f = (r) => ({ key: r.clerk.key, at: [Math.round(r.clerk.x), Math.round(r.clerk.y)], staff: [Math.round(r.staff.x), Math.round(r.staff.y)], anim: r.clerk.animName }); return { market: f(g.market.register), trade: f(g.trade.register), m: [g.market.x, g.market.y], t: [g.trade.x, g.trade.y] }; });
  console.log(JSON.stringify(info));
  await ev(([x, y]) => { window.__FV.teleport(x - 260, y + 260); window.__FV.camera(x + 40, y - 20, 1.7); }, info.m);
  await advance(page, 1.5); await render(page, 3);
  await page.screenshot({ path: path.join(OUT, 'v2_20_clerk_market.jpg'), type: 'jpeg', quality: 84 });
  await ev(([x, y]) => { window.__FV.teleport(x + 260, y + 300); window.__FV.camera(x - 30, y - 20, 1.7); }, info.t);
  await ev(() => { const gs = window.__FV.scene; for (let i = 0; i < 6; i++) gs.trade.stock.push('item_plank', null, gs.effects); });
  await advance(page, 4); await render(page, 3);
  await page.screenshot({ path: path.join(OUT, 'v2_21_clerk_trade.jpg'), type: 'jpeg', quality: 84 });
} catch (e) { console.log('FATAL', e.stack || e); }
console.log('errors', log.errors.length, log.errors.slice(0, 3).join(' | '));
await browser.close(); await srv.close();
