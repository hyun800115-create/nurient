// (v4.2 touch) 짐꾼 2 on every goods line + the 창고 직원 who grow with what the village makes, on the v4.1 46-min save
// (fixed-step clock, docs/기획서_v4_2_촌장.md §13).
//   node tools/test/porters42.mjs
// 1 the old save loads with the 2 창고 직원 it had, the village's making is counted (raw + goods a minute);
// 2 짐꾼 2 for the 대장간 / 통조림 공장 / 배 창고: due after porter2.fullForS (45 s) of a full output, its pad by the
//   line's door, paying hires a second porter of that line; not due 1 s before; the 5 station lines unchanged;
// 3 the crew grows by the rule (target = base + made a minute ÷ perMin, up to cap): one walks in from the edge of the
//   village (not at the 창고), a banner, he reaches the 창고 and works; one at a time (crew.every);
// 4 no flapping: the rate falls to 0 and nobody leaves; the cap holds with a huge rate;
// 5 save + reload: the crew is back at once (no walk), the 짐꾼 2 too; an old save's crew follows its own making;
// 6 the crew works (some carry), 0 page errors.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance } from './fv_step.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SAVE = fs.readFileSync(path.join(ROOT, 'tools/test/fixtures/v41_save_smart_46min.json'), 'utf8');
const results = [];
const step = (name, ok, info = '') => { results.push({ name, ok: !!ok }); console.log((ok ? '  ok  ' : ' FAIL ') + name + (info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 } });
const ev = (fn, arg) => page.evaluate(fn, arg);
const adv = (s) => advance(page, s);
const until = async (fn, max, chunk = 0.5, arg) => { for (let t = 0; t <= max; t += chunk) { if (await ev(fn, arg)) return t; await adv(chunk); } return -1; };
const boot = async (sv) => {
  // (a running game saves itself on pagehide: switch that off first, or the reload would bring back this game, not `sv`)
  if (sv !== undefined) await ev((s) => { const gs = window.__FV && window.__FV.scene; if (gs) gs.save = () => {}; localStorage.clear(); if (s) localStorage.setItem('frostVillage.save.v1', s); }, sv);
  await page.reload({ waitUntil: 'load', timeout: 180000 });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player && window.__FV.scene.v42 && window.__FV.scene.warehouse, 180000);
  await sleep(1000);
  await installStepper(page);
  await ev(() => { try { window.__FV.v42.v.seen.whatsNew = 1; } catch (e) { /* */ } window.__FV.teleport(-200, 700); window.__FV.setInput(0, 0); });
};
const crew = () => ev(() => window.__FV.v42.crew());
let fatal = null;
try {
  await boot(SAVE);
  // ---- 1. the old save
  const c0 = await crew();
  const m0 = await ev(() => window.__FV.scene.madeN || 0);
  await adv(30);
  const c1 = await crew();
  const m1 = await ev(() => window.__FV.scene.madeN || 0);
  step('1 the v4.1 save loads with its 2 창고 직원 (no crew field: base)', c0.crew === 2 && c0.extra === 0 && c0.base === 2, c0);
  step('1 what the village makes is counted (raw + goods)', m1 - m0 > 60, { in30s: m1 - m0, rate: c1.rate });

  // ---- 2. 짐꾼 2 on the three new lines
  const P = await ev(() => {
    const gs = window.__FV.scene, L = gs.v42.lines, B = window.__FV.v42;
    const n = (id) => gs.porters.filter((p) => p.station === gs.sourceById(id) && p.role === 'porter').length;
    const fs = (window.__BALv || {}).fullForS;
    const out = {};
    for (const id of ['toolsmith', 'cannery', 'dock']) {
      L.fullT[id] = 44; L.waitT[id] = 0;
      const before = L.offers().some((o) => o.id === 'p2_' + id);
      L.fullT[id] = 46;
      const after = L.offers().some((o) => o.id === 'p2_' + id);
      out[id] = { porters: n(id), before, after };
    }
    void B; void fs;
    return out;
  });
  step('2 대장간 · 통조림 공장 · 배 창고 have a goods porter each', ['toolsmith', 'cannery', 'dock'].every((k) => P[k].porters === 1), P);
  step('2 짐꾼 2 is due after 45 s of a full output (not at 44 s)', ['toolsmith', 'cannery', 'dock'].every((k) => !P[k].before && P[k].after), P);
  await adv(2);
  const pads = await ev(() => { const L = window.__FV.scene.v42.lines; return Object.keys(L.pads); });
  const pc = await ev(() => { const gs = window.__FV.scene, L = gs.v42.lines; const pad = L.pads.p2_cannery; if (!pad) return null; const w = gs.sourceById('cannery'); return { x: pad.x, y: pad.y, d: Math.round(Math.hypot(pad.x - w.outPad.x, pad.y - w.outPad.y)), label: pad.opts.labelFn(), open: !gs.collision.blocked(pad.x, pad.y, 16) }; });
  step('2 the 통조림 짐꾼 2 pad stands by the cannery door (open ground)', !!pc && pc.d < 160 && pc.open && /통조림/.test(pc.label), { pads, pc });
  if (pc) {
    await ev(([x, y]) => { const gs = window.__FV.scene; gs.economy.coins = Math.max(gs.economy.coins, 5000); window.__FV.teleport(x, y); window.__FV.setInput(0, 0); }, [pc.x, pc.y]);
    await until(() => !window.__FV.scene.v42.lines.pads.p2_cannery, 12);
    await ev(() => { window.__FV.teleport(-200, 700); });
  }
  await adv(3);
  const pc2 = await ev(() => { const gs = window.__FV.scene; const w = gs.sourceById('cannery'); return { porters: gs.porters.filter((p) => p.station === w && p.role === 'porter').length, p2: gs.v42.lines.p2.slice() }; });
  step('2 paying hires a second 통조림 porter', pc2.porters === 2 && pc2.p2.includes('cannery'), pc2);

  // ---- 3. the crew grows by the rule
  const per = await ev(async () => { const m = await import(new URL('src/data/balance.js', location.href).href); return m.BALANCE.warehouse.crew; });
  const t450 = await ev(() => window.__FV.v42.crew({ rate: 450 }).target);
  const want = Math.min(per.cap, 2 + Math.floor(Math.max(0, 450 - per.from) / per.perMin));
  step('3 rate 450 a minute: the target is 2 + (450 − from) ÷ perMin = ' + want, t450 === want && want > 2, { t450, per });
  // (the save's own village makes ~600 a minute, so one may already have walked in during steps 1–2: count from here)
  const n0 = (await crew()).crew;
  await ev(() => window.__FV.v42.crew({ rate: 1000, now: true }));
  await adv(1);
  const a1 = await ev(() => {
    const gs = window.__FV.scene, W = gs.warehouse, wp = W.porters[W.porters.length - 1];
    const f = wp.cameFrom || wp;
    return { crew: W.porters.length, state: wp.state, from: f, d: Math.round(Math.hypot(f.x - W.outPad.x, (f.y - W.outPad.y) * 2)), fromOnScreen: gs.isOnScreen(f.x, f.y, 0), target: window.__FV.v42.crew().target };
  });
  step('3 one more walks in from a village gate off screen (not at the 창고)', a1.crew === n0 + 1 && a1.state === 'arrive' && a1.d > 300 && !a1.fromOnScreen, { n0, ...a1 });
  await adv(20);
  const a2 = await crew();
  step('3 one at a time (crew.every)', a2.crew === n0 + 1, a2);
  const tHome = await until((k) => { const W = window.__FV.scene.warehouse, wp = W.porters[k]; return wp.state !== 'arrive'; }, 90, 1, n0);
  const home = await ev((k) => { const W = window.__FV.scene.warehouse, wp = W.porters[k]; return { state: wp.state, d: Math.round(Math.hypot(wp.x - wp.homePt.x, wp.y - wp.homePt.y)), job: wp.job ? wp.job.kind : null }; }, n0);
  step('3 he reaches the 창고 and starts work', tHome >= 0 && (home.d < 80 || home.job), { t: tHome, ...home });
  await ev(() => window.__FV.v42.crew({ rate: 1000 }));
  await adv(per.every + 2);
  const a3 = await crew();
  step('3 the next one comes after crew.every s', a3.crew === Math.min(per.cap, n0 + 2), a3);

  // ---- 4. no flapping, the cap
  await ev(() => window.__FV.v42.crew({ rate: 0 }));
  await adv(per.every * 2 + 5);
  const f1 = await crew();
  step('4 the making slows down: nobody leaves (no flapping)', f1.crew === a3.crew && f1.target === 2, f1);
  await ev(() => { window.__FV.v42.crew({ rate: 1e6 }); });
  for (let i = 0; i < 6; i++) { await ev(() => window.__FV.v42.crew({ now: true })); await adv(2); }
  const f2 = await crew();
  step('4 a huge rate: never more than the cap (' + per.cap + ')', f2.crew === per.cap, f2);

  // ---- 6 (before the reload) the crew works
  await ev(() => window.__FV.v42.crew({ rate: 420 }));
  let busy = 0, all = 0;
  for (let i = 0; i < 12; i++) { await adv(5); const b = await ev(() => { const W = window.__FV.scene.warehouse; return W.porters.map((p) => (p.job || p.state === 'haul' || p.state === 'unload' ? 1 : 0)); }); busy += b.reduce((s, x) => s + x, 0); all += b.length; }
  step('6 the bigger crew carries (share of 창고 직원 on a job)', busy / all > 0.3, { busyShare: +(busy / all).toFixed(2) });

  // ---- 5. save + reload
  const sv = await ev(() => { window.__FV.save(); return { save: localStorage.getItem('frostVillage.save.v1'), crew: window.__FV.v42.crew() }; });
  const blob = JSON.parse(sv.save);
  step('5 the save stays v7 with an additive v42.crew field', blob.v === 7 && blob.v42 && blob.v42.crew && blob.v42.crew.n === per.cap - 2, { v: blob.v, crew: blob.v42 && blob.v42.crew });
  await boot();
  const r1 = await ev(() => { const gs = window.__FV.scene, W = gs.warehouse; return { crew: W.porters.length, arriving: W.porters.filter((p) => p.state === 'arrive').length, near: W.porters.every((p) => Math.hypot(p.x - W.outPad.x, p.y - W.outPad.y) < 260), p2: gs.v42.lines.p2.slice(), can: gs.porters.filter((p) => p.station === gs.sourceById('cannery') && p.role === 'porter').length, st: window.__FV.v42.crew() }; });
  step('5 reload: the whole crew is back at the 창고 at once (no walk)', r1.crew === per.cap && !r1.arriving && r1.near, r1);
  step('5 reload: the 통조림 짐꾼 2 is back', r1.p2.includes('cannery') && r1.can === 2, r1);
  // an older v4.2 save with a crew of 4 and no rate: never below what was there, then grows with its own making
  const old = JSON.parse(SAVE);
  old.v42 = Object.assign({}, old.v42 || {}, { v: 1, crew: { n: 2 } });
  await boot(JSON.stringify(old));
  const o1 = await crew();
  await adv(130);
  const o2 = await crew();
  step('5 a save with a crew of 4: never below what was there', o1.crew === 4, o1);
  step('5 ... and it grows again from the village\'s own making (late village ≈ 400 a minute)', o2.crew > 4 && o2.rate > 200, o2);
} catch (e) { fatal = e; console.log('FATAL', e.stack || e.message); }
const errs = log.errors.filter((e) => !/AudioContext|play\(\) request/i.test(e));
step('0 no page errors', !errs.length && !fatal, errs.slice(0, 5));
const nOk = results.filter((r) => r.ok).length;
console.log(`\n${nOk}/${results.length} passed`);
await browser.close();
await srv.close();
process.exit(nOk === results.length ? 0 : 1);
