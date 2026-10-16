// (v4.2, docs/v42_plan.md §1 guardrail 1) the first minutes ask the server for exactly what v4.1 asked for:
//   node tools/test/reqlog42.mjs --base <a v4.1 copy of frost-village (git archive 56a97d1)> [--minutes 5]
// Both builds boot a fresh profile (Math.random seeded the same), start the game and let the smart bot (each build's
// own review_gameplay_bot.js) play the first loop on the fixed-step clock (a real frame drawn every 0.5 s of game time,
// so view-driven lazy loads happen). Every asset request is logged as its path (no origin, no query; the dev build's
// ES modules under src/ are code, not the asset log — the artifact bundles them). The residents' looks and voices are
// a random cast, so `vil_npc_<who>.social.*` and `voice_<who>.*` count as one kind each (same number asked for).
// Checks:
//   boot -> village running: the same requests (as a multiset)
//   up to the first sale:     the same requests
//   after it, to --minutes:   at most one extra request kind in v4.2 (the `v42_core` page of CODE-2) and none missing
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, sleep, waitFor, tapStart } from './pw.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BASE = opt('--base', '');
const MIN = Number(opt('--minutes', '5'));
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 600) : '')); } };
if (!BASE || !fs.existsSync(path.join(BASE, 'index.html'))) { console.log('reqlog42: --base <v4.1 copy> is required (skipped)'); process.exit(0); }

async function run(root, label) {
  const srv = await start(0, { prefix: '/rq/', root });
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'ko-KR' });
  // (the same random cast in both builds as far as their code asks the same questions)
  await ctx.addInitScript(() => { let a = 12345 >>> 0; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String((e && e.message) || e)));
  const reqs = [];
  let phase = 'boot';
  const norm = (q) => q.replace(/^(assets\/_packed\/vil_npc_)[a-z0-9_]+(\.social\.(png|json))$/, '$1*$2').replace(/^(assets\/voice\/voice_)[a-z0-9_]+(\.(ogg|mp3|m4a))$/, '$1*$2');
  page.on('request', (r) => { const u = r.url(); const i = u.indexOf('/rq/'); if (i < 0) return; const q = u.slice(i + 4).split('?')[0]; if (!/^(assets|lib)\//.test(q)) return; reqs.push([phase, norm(q)]); });
  await page.goto(srv.url + 'index.html', { waitUntil: 'load', timeout: 300000 });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  reqs.length = 0;
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 300000);
  // (the bot reads the balance / world tables, as review_gameplay_sim.mjs gives them: modules already loaded, no request)
  await page.evaluate(async () => { window.__BAL = (await import(new URL('src/data/balance.js', location.href).href)).BALANCE; window.__WORLD = (await import(new URL('src/data/world.js', location.href).href)).WORLD; });
  await sleep(500);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 300000);
  await sleep(3000);
  phase = 'loop';
  await page.evaluate(() => {
    const game = window.__FV.game;
    game.loop.sleep();
    let D = Date.now(); let T = game.loop.time || performance.now();
    Date.now = () => D;
    const DT = 1000 / 60;
    window.__sim = { simT: 0, run(sec, tick) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { if (tick) tick(DT / 1000); T += DT; D += DT; this.simT += DT / 1000; if (i % 30 === 29) game.step(T, DT); else game.headlessStep(T, DT); } } };
  });
  await page.addScriptTag({ path: path.join(root, 'tools/test/review_gameplay_bot.js') });
  await page.evaluate(() => Object.assign(window.__bot.opts, { policy: 'smart', upg: 'greedy', minBatch: 3, think: 0, mag: 1 }));
  let saleAt = null;
  for (let s = 0; s < MIN * 60; s += 2) {
    const earned = await page.evaluate(() => { window.__sim.run(2, window.__bot.tick); return window.__FV.scene.economy.earned || 0; });
    if (saleAt === null && earned > 0) { saleAt = s + 2; await sleep(1500); phase = 'after'; }
  }
  await sleep(2000);
  await browser.close();
  await srv.close();
  console.log(`  ${label}: ${reqs.length} requests (boot ${reqs.filter((r) => r[0] === 'boot').length}, first loop ${reqs.filter((r) => r[0] === 'loop').length}, after the first sale ${reqs.filter((r) => r[0] === 'after').length}) · first sale at ${saleAt} s · errors ${errors.length}`);
  return { reqs, saleAt, errors };
}

const count = (list) => { const m = new Map(); for (const k of list) m.set(k, (m.get(k) || 0) + 1); return m; };
const diff = (a, b) => { const A = count(a), B = count(b), more = [], less = []; for (const [k, n] of B) if (n > (A.get(k) || 0)) more.push(k + (n - (A.get(k) || 0) > 1 ? ' ×' + (n - (A.get(k) || 0)) : '')); for (const [k, n] of A) if (n > (B.get(k) || 0)) less.push(k); return { more, less }; };

const t0 = Date.now();
console.log('request log: v4.1 copy vs this build, fresh profile, first ' + MIN + ' game minutes');
const a = await run(path.resolve(BASE), 'v4.1');
const b = await run(ROOT, 'v4.2');
const pick = (r, ph) => r.reqs.filter((q) => q[0] === ph).map((q) => q[1]);
const d1 = diff(pick(a, 'boot'), pick(b, 'boot'));
ok(!d1.more.length && !d1.less.length, 'boot -> village running: the same requests', d1);
const d2 = diff(pick(a, 'loop'), pick(b, 'loop'));
ok(!d2.more.length && !d2.less.length, 'up to the first sale: the same requests', d2);
// (after the first sale the two runs are not frame-identical any more: compare the files asked for, not the order)
const sa = new Set(pick(a, 'after').concat(pick(a, 'loop'), pick(a, 'boot'))), sb = new Set(pick(b, 'after').concat(pick(b, 'loop'), pick(b, 'boot')));
const extra = [...sb].filter((k) => !sa.has(k)), missing = [...sa].filter((k) => !sb.has(k));
ok(extra.length <= 1, 'after the first sale: at most one new file (' + extra.length + ')', extra);
ok(missing.length === 0, 'after the first sale: nothing v4.1 asked for is missing', missing);
ok(a.errors.length === 0 && b.errors.length === 0, 'no page errors', a.errors.concat(b.errors).slice(0, 4));
console.log(`\n${pass} passed, ${fail} failed  (wall ${((Date.now() - t0) / 1000) | 0}s)`);
process.exit(fail ? 1 : 0);
