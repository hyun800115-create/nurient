// Texture budget (v4-B, docs/v4_plan.md §11.2 / §11.5), fixed-step clock:
//   node tools/test/texbudget.mjs [--bot 20] [--out file.json]
// Scenarios: title; a new game (and, with --bot N, the smart bot to minute N, sampled every 5 game s); the v3.5
// village complete (unlockV3); full v4 (station, town open, 5 shops, 50 people, rank 읍); a camera tour (plaza ->
// station -> along the track -> town square -> zoom 0.6 -> overview -> back to the plaza).
// Measures Phaser's source-sum (window.__FV.texStats) and, through an init script that wraps texImage2D /
// texStorage2D / deleteTexture, the live GL bytes; the two must agree within 10 %.
// Fails if a "must" (new game 368, full v4 455) is exceeded for more than 2 s of samples, or the return to the
// start of the tour ends more than 5 MiB above where it began (after the residency TTLs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const BOT = Number(opt('--bot', '0'));
const OUT = opt('--out', path.join(HERE, '..', '..', 'docs', 'build_reports', 'texbudget_v4.json'));
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log((ok ? '  ok  ' : ' FAIL ') + name + (info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };

// live GL texture bytes (level 0 of every texImage2D / texStorage2D, minus deleted textures)
const GL_PROBE = `(() => {
  const live = new Map(); let bound = new WeakMap(); let total = 0;
  const wrap = (P) => {
    if (!P || P.__fvWrapped) return; P.__fvWrapped = true;
    const bind = P.bindTexture, img = P.texImage2D, sto = P.texStorage2D, del = P.deleteTexture, act = P.activeTexture;
    P.activeTexture = function (u) { this.__unit = u; return act.call(this, u); };
    P.bindTexture = function (t, tex) { const m = this.__bound || (this.__bound = {}); m[(this.__unit || 0) + ':' + t] = tex; return bind.call(this, t, tex); };
    const cur = (gl, t) => (gl.__bound || {})[(gl.__unit || 0) + ':' + t];
    const set = (tex, bytes) => { if (!tex) return; const was = live.get(tex) || 0; live.set(tex, bytes); total += bytes - was; };
    P.texImage2D = function (...a) {
      const r = img.apply(this, a);
      if (a[1] === 0) { let w = 0, h = 0; if (a.length >= 9) { w = a[3]; h = a[4]; } else { const s = a[5]; w = s && (s.width || s.videoWidth || s.displayWidth) || 0; h = s && (s.height || s.videoHeight || s.displayHeight) || 0; } set(cur(this, a[0]), w * h * 4); }
      return r;
    };
    if (sto) P.texStorage2D = function (t, lv, f, w, h) { const r = sto.call(this, t, lv, f, w, h); set(cur(this, t), w * h * 4); return r; };
    P.deleteTexture = function (tex) { const b = live.get(tex) || 0; total -= b; live.delete(tex); return del.call(this, tex); };
  };
  wrap(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
  wrap(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
  window.__glTex = () => ({ MiB: +(total / 1048576).toFixed(1), n: live.size });
})();`;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, init: GL_PROBE });
const ev = (fn, a) => page.evaluate(fn, a);
const nudge = (fn, ms = 120000) => waitFor(page, `(() => { const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); return (${fn})(); })()`, ms).then(() => true).catch(() => false);
const samples = [];
const sample = async (label) => {
  const s = await ev(() => { const st = window.__FV.texStats ? window.__FV.texStats() : null; return { st, gl: window.__glTex ? window.__glTex() : null }; });
  const r = { label, MiB: s.st ? s.st.totalMiB : null, gl: s.gl ? s.gl.MiB : null, byCls: s.st && s.st.byCls, social: s.st && s.st.social, areas: s.st && s.st.areas, ground: s.st && s.st.ground };
  samples.push(r);
  console.log(`  [${label}] ${r.MiB} MiB (GL ${r.gl})`);
  return r;
};
/** advance `sec` game s sampling every `every` s; returns the samples */
const run = async (label, sec, every = 5) => { const out = []; for (let t = 0; t < sec; t += every) { await advance(page, every); out.push(await sample(label + ' +' + (t + every) + 's')); } return out; };
const overFor = (list, must) => list.filter((r) => r.MiB > must).length * 5;
let fatal = null;
try {
  await ev(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  await sleep(1500);
  const title = await ev(() => { const g = window.__FV.game; let b = 0; for (const k in g.textures.list) { if (/^__/.test(k)) continue; for (const s of g.textures.list[k].source) b += s.width * s.height * 4; } return +(b / 1048576).toFixed(1); });
  samples.push({ label: 'title', MiB: title });
  check('title <= 90 MiB', title <= 90, title);
  await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 240000);
  await sleep(4000);
  await installStepper(page);
  const ng = await run('new game', 30);
  check('new game <= 368 MiB (must)', overFor(ng, 368) <= 2, Math.max(...ng.map((r) => r.MiB)));
  check('new game <= 240 MiB (target)', Math.max(...ng.map((r) => r.MiB)) <= 240, Math.max(...ng.map((r) => r.MiB)));
  if (BOT > 0) {
    await page.addScriptTag({ path: path.join(HERE, 'review_gameplay_bot.js') });
    const bs = [];
    for (let t = 0; t < BOT * 60; t += 5) { await ev(() => window.__step.run(5, window.__bot.tick)); if (t % 30 === 0) bs.push(await sample('bot ' + (t / 60).toFixed(1) + ' min')); }
    check('new game + bot to minute ' + BOT + ' <= 368 MiB (must)', overFor(bs, 368) <= 2 * 6, Math.max(...bs.map((r) => r.MiB)));
    await ev(() => window.__FV.setInput(0, 0));
  }
  await ev(() => { window.__FV.unlockV3(); window.__FV.give(50000); });
  await advance(page, 2);
  await nudge(() => window.__FV.scene.v4 && window.__FV.scene.v4.ready);
  const v3 = await run('v3.5 village complete', 20);
  check('v3.5 village complete <= 455 MiB (must)', overFor(v3, 455) <= 2, Math.max(...v3.map((r) => r.MiB)));
  // full v4: station, first train, town open, 5 shops, houses, rank 읍
  await ev(() => window.__FV.v4.repair());
  await nudge(() => window.__FV.hasTex('train_engine') && window.__FV.scene.v4.town && window.__FV.state().v4.tf && window.__FV.state().v4.tf.adult, 180000);
  for (let k = 0; k < 30 && !(await ev(() => window.__FV.state().v4.arrivals > 0)); k++) await advance(page, 1);
  await ev(() => window.__FV.v4.openTown());
  await nudge(() => window.__FV.hasTex('town_homes') && window.__FV.state().v4.tf.child, 180000);
  await ev(() => window.__FV.v4.foundAll());
  for (let k = 0; k < 3; k++) { const id = await ev(() => window.__FV.v4.house()); if (id) await advance(page, 35); }
  await ev(() => { window.__FV.v4.happy(Array(40).fill(1)); const nb = window.__FV.scene.v4; nb.rank.ceremony(false); });
  await advance(page, 15);
  const tour = [];
  const at = async (label, x, y, zoom, sec = 20) => {
    await ev(([x, y, z]) => { window.__FV.camera(); if (z) window.__FV.zoom(z); window.__FV.teleport(x, y); }, [x, y, zoom || 0]);
    const s = await run(label, sec);
    tour.push(...s);
    return s[s.length - 1];
  };
  const m = await ev(() => { const k = window.__FV.scene.market; return { x: k.x + 120, y: k.y + 180 }; });
  const plaza0 = await at('full v4 plaza', m.x, m.y, 1.2, 30);
  await at('east dock', 2700, 700, 1.2);
  await at('our station', 3420, 1640, 1.2);
  await at('along the track', 3900, 1900, 1.2);
  await at('town square', 4900, 2450, 1.2, 30);
  await at('town zoom 0.6', 4900, 2450, 0.6);
  await ev(() => window.__FV.zoom('overview'));
  tour.push(...(await run('overview', 15)));
  const plaza1 = await at('back at the plaza', m.x, m.y, 1.2, 45);
  const peak = Math.max(...tour.map((r) => r.MiB));
  check('full v4, any view <= 455 MiB (must)', overFor(tour, 455) <= 2, peak);
  check('full v4, plaza <= 300 MiB (target)', plaza0.MiB <= 300, plaza0.MiB);
  check('full v4 tour peak <= 300 MiB (target)', peak <= 300, peak);
  check('return to the start of the tour <= start + 5 MiB', plaza1.MiB <= plaza0.MiB + 5, { start: plaza0.MiB, end: plaza1.MiB });
  const agree = tour.filter((r) => r.gl).map((r) => Math.abs(r.gl - r.MiB) / Math.max(1, r.MiB));
  check('GL bytes agree with the source-sum within 10 % (median)', agree.length && agree.sort((a, b) => a - b)[Math.floor(agree.length / 2)] <= 0.10, agree.length ? +agree[Math.floor(agree.length / 2)].toFixed(3) : 'no GL probe');
} catch (e) { fatal = e; console.log('FATAL', e && e.stack || e); }
check('no page errors', !log.errors.length && !fatal, log.errors.slice(0, 3));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ when: new Date().toISOString(), samples, results }, null, 1));
const pass = results.filter((r) => r.ok).length;
console.log(`\ntexbudget: ${pass}/${results.length} passed  (samples -> ${OUT})`);
await browser.close();
await srv.close();
process.exit(pass === results.length ? 0 : 1);
