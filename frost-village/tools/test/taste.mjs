// (v4.3 step B, WP-T) 읍장 취임 맛보기 (docs/redesign_v43/stepB/postdepot_addendum.md §5, §6.4), fixed-step clock:
//   node tools/test/taste.mjs [--shots DIR]          (shots default: docs/previews/screens_v43/taste_*.png)
// The late v4.2 village (hall, bank, depot; rank 1 with full bars) made 읍 by the step hook. (step B: a pre-B village, so it
// loads through the real remap R43 and N's 「마을 새 단장」 letter is due: every boot reads it as a player does —
// seen.letter43 / tour43, the card closed — since T never starts over the letter. Before section A saves the pre-taste
// village it also buys stage 4 by hook when this build has P's mkt_s4 step, so the real G's row 9 is done in B–D)
//   A 412×915 ko  the pad: absent at rank 1 and while the chain is not there (a stand-in gs.goals43 whose current row is
//                 not row 10, or no G and no seen.g43all); present at the hall's 승격식 spot once it is (G's current row 10,
//                 or without G seen.g43all), clear of the other pads; once shown it stays (a soft row back, g43all gone).
//                 The start: not while a panel is open, not before 0.6 s of standing still; then the scene: hold
//                 'taste' (never Rank's own ceremony: cerOn / state().ceremony false, Rank's clock still), framed at
//                 Rank.hallFrame(venue); the goal window and a 가기 walk say busy, the residents window stays shut, the
//                 관망 countdown does not start, the carry pill hides, the flag card waits; ≥ 6 residents at the hall at
//                 5 s; the title card at 3–8 s, the teaser at ≥ 8 s, clear of the right HUD column, every text inside,
//                 no version number; a REAL tap on [좋아요] ends it: hold null, seen.eup_taste, the pad gone, no toast;
//                 coins, office / depot hires, rank, progress.flags, x unchanged (the coin census: no add / spend from
//                 the taste); 관망 counts down again after it. Reload: the marker stays, no pad, standing there does nothing
//   B 360×640 en  the saved pre-taste village: the pad is back on load; a short drag before skipAfter does not skip; a
//                 scene restart mid-taste (title card up) leaves no hold, no card, no marker, the pad back; then a drag
//                 held from the start does not skip, a fresh drag after 3 s does (same end state + the toast before the
//                 teaser); the teaser card at 360×640 en
//   C 360×640 ko, D 412×915 en: the two cards (shots, fit, HUD column)
//   0 page errors in every run
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const FIX = path.join(HERE, 'fixtures');
const ai = process.argv.indexOf('--shots');
const SHOTS = ai > 0 && process.argv[ai + 1] ? path.resolve(process.argv[ai + 1]) : path.join(ROOT, 'docs', 'previews', 'screens_v43');
fs.mkdirSync(SHOTS, { recursive: true });
const SAVE_KEY = 'frostVillage.save.v1';
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg + (extra !== undefined && process.env.TASTE_VERBOSE ? '  — ' + JSON.stringify(extra).slice(0, 300) : '')); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 700) : '')); } };
const t0 = Date.now();

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const FXK = JSON.parse(fs.readFileSync(path.join(FIX, 'v42_village_late.json'), 'utf8')).keys;

async function boot(keys, vp, lang) {
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: vp, dpr: 1, locale: lang === 'en' ? 'en-US' : 'ko-KR' });
  await page.evaluate(([k, l]) => {
    localStorage.clear();
    for (const q in k) localStorage.setItem(q, k[q]);
    let s = {}; try { s = JSON.parse(k['frostVillage.settings.v1'] || '{}') || {}; } catch (e) { s = {}; }
    s.lang = l; localStorage.setItem('frostVillage.settings.v1', JSON.stringify(s));
  }, [keys, lang]);
  await page.reload({ waitUntil: 'load' });
  await ready(page);
  return { page, log };
}
async function ready(page) {
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player && window.__FV.game.scene.getScene('UI').ready, 180000);
  await sleep(2000);
  await installStepper(page);
  await page.evaluate(() => {
    if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1;
    // (step B) N's letter read (a remapped load): seen.letter43 / tour43, the card closed
    const gs = window.__FV.scene, U = window.__FV.game.scene.getScene('UI'), C = U && U.renewal43;
    if (!gs.v43 || typeof gs.v43 !== 'object') gs.v43 = { lay: 0 };
    if (!gs.v43.seen || typeof gs.v43.seen !== 'object') gs.v43.seen = {};
    gs.v43.seen.letter43 = 1; gs.v43.seen.tour43 = 1;
    if (C && C.isOpen && C.close) C.close();
  });
  await advance(page, 2);
}
const TS = (page) => page.evaluate(() => window.__FV43.taste.state());
/** run the scene's clock up to `at` s (from its start) */
const runTo = (page, at) => page.evaluate((a) => { const s = window.__FV43.taste.state(); if (s.on && a > s.t) window.__step.run(a - s.t); return window.__FV43.taste.state(); }, at);
const errorsOf = (log) => log.errors.filter((e) => !/favicon/i.test(e));
/** a stand-in gs.goals43 (the contract's whole API; only current() says something). With the real G in the build
 *  (a3.3: G and T merged) the real one is stopped first: it would go on ticking from its scene listeners, open the chain
 *  at 읍 and write seen.g43ready (sticky), so section A checks T's own gate rules against the stand-in only. Sections B–D
 *  load the saved village with the real G and check the G → T hand-over (g43ready, row 10 at T's pad, row 10 done) */
const setG = (page, id) => page.evaluate((cur) => {
  const gs = window.__FV.scene;
  if (gs.goals43 && typeof gs.goals43.destroy === 'function') gs.goals43.destroy();
  if (cur === null) { delete gs.goals43; return; }
  gs.goals43 = { rows: () => [], sideRows: () => [], refs: () => new Set(), sub: () => null, objective: () => null, current: () => ({ id: cur, kind: 'g43' }) };
}, id);

/** the card as laid out: inside the screen, under the objective panel, clear of the right HUD column, every text
 *  inside it; no version number in its words */
async function cardCheck(page, tag, phase) {
  const c = await page.evaluate(() => {
    const U = window.__FV.game.scene.getScene('UI'), card = U.eupTaste, st = card ? card.state() : null;
    const out = { st, W: U.W, H: U.H, col: [], safeTop: 0, texts: [] };
    for (let i = 0; i < (U.rightN || 0); i++) { const o = U.rightBoxes[i]; out.col.push({ l: Math.round(o.l), t: Math.round(o.t), b: Math.round(o.b) }); }
    out.obj = U.objPanel && U.objPanel.visible ? { y: Math.round(U.objPanel.y), h: 62, x: Math.round(U.objPanel.x), w: Math.round(U.objBg.width) } : null;
    if (card && card.c) for (const o of card.c.list) if (o.visible && o.type === 'Text' && o.text) { const b = o.getBounds(); out.texts.push({ s: o.text, l: Math.round(b.x), t: Math.round(b.y), r: Math.round(b.right), b: Math.round(b.bottom) }); }
    if (card && card.btn && card.btn.visible) { const b = card.btn.getBounds(); out.btnB = { l: Math.round(b.x), t: Math.round(b.y), r: Math.round(b.right), b: Math.round(b.bottom) }; }
    return out;
  });
  const st = c.st, B = st && st.box;
  ok(st && st.open && st.phase === phase && B, '[' + tag + '] the ' + phase + ' card is open', st);
  if (!B) return c;
  ok(B[0] >= 8 && B[2] <= c.W - 8 && B[1] >= 0 && B[3] <= c.H - 120, '[' + tag + '] …inside the screen (' + B.join(',') + ' of ' + c.W + '×' + c.H + ')', B);
  ok(!c.obj || B[1] >= c.obj.y + 31, '[' + tag + '] …under the objective panel', { B, obj: c.obj });
  const hits = c.col.filter((o) => B[2] > o.l - 4 && B[1] < o.b && B[3] > o.t);
  ok(c.col.length >= 1 && hits.length === 0, '[' + tag + '] …clear of the right HUD column (' + c.col.length + ' chips)', { B, col: c.col });
  const out = c.texts.filter((x) => x.l < B[0] + 2 || x.r > B[2] - 2 || x.t < B[1] + 2 || x.b > B[3] - 2);
  ok(c.texts.length >= (phase === 'title' ? 2 : 6) && out.length === 0, '[' + tag + '] …every text inside the card (' + c.texts.length + ')', out.length ? out : c.texts.map((x) => x.s));
  if (phase === 'teaser') ok(c.btnB && c.btnB.l >= B[0] && c.btnB.r <= B[2] && c.btnB.b <= B[3] && c.btnB.t >= B[1], '[' + tag + '] …[좋아요] inside the card', { btn: c.btnB, B });
  const words = st.texts.join(' ');
  ok(!/\d+\.\d+/.test(words) && !/\bv\s?\d/i.test(words) && !/버전/.test(words), '[' + tag + '] …no version number in its words', words);
  return c;
}
async function shot(page, name) { await render(page, 4); await page.screenshot({ path: path.join(SHOTS, name) }); }

let preTaste = null;      // the 읍 village with the chain done (seen.g43all), saved before the taste
try {
  // ================================================================== A
  console.log('— A: 412×915 ko, the late village');
  {
    const { page, log } = await boot(FXK, { width: 412, height: 915 }, 'ko');
    const bus0 = await page.evaluate(() => window.__FV43.recent().length);
    // rank 1 (the fixture is a 마을 with full bars): no pad even with the chain done
    const a0 = await page.evaluate(() => { const gs = window.__FV.scene; gs.v43.seen = gs.v43.seen || {}; gs.v43.seen.g43all = 1; window.__step.run(1.5); return { level: gs.v4.rank.level, st: window.__FV43.taste.state(), hall: !!(gs.civic && gs.civic.hall) }; });
    ok(a0.hall && a0.level === 1 && !a0.st.pad && !a0.st.gate && a0.st.enabled === true, 'rank 1 (마을), chain done: no pad (the taste needs 읍); EupTaste.enabled', a0);
    // 읍 by the step hook (the 승격식 paid, instantly); a stand-in G whose current row is not row 10
    await setG(page, 'g43_shop');
    const a1 = await page.evaluate(() => { const F = window.__FV, gs = F.scene; F.doneStep('rank_eup'); window.__step.run(1.5); return { level: gs.v4.rank.level, st: window.__FV43.taste.state() }; });
    ok(a1.level === 2 && !a1.st.pad && !a1.st.gate, '읍; with G in the build its rule wins: row 8 current → no pad (seen.g43all alone is not enough then)', a1);
    await setG(page, null);
    const a1b = await page.evaluate(() => { const gs = window.__FV.scene; delete gs.v43.seen.g43all; window.__step.run(1.5); return window.__FV43.taste.state(); });
    ok(!a1b.pad && !a1b.gate, 'no G and no seen.g43all (rows 1–8 not all done): no pad', a1b);
    // G's row 10 current → the pad
    await setG(page, 'g43_taste');
    const a2 = await page.evaluate(() => {
      window.__step.run(1.0);
      const gs = window.__FV.scene, h = gs.civic.hall, rp = h.rankPadPos(), st = window.__FV43.taste.state();
      return { st, rp, label: gs.eupTaste && gs.eupTaste.label ? gs.eupTaste.label.tx.text : null, bus: window.__FV43.recent().filter((e) => e.name === 'taste').map((e) => e.data.state) };
    });
    ok(a2.st.pad && a2.st.pad.x === Math.round(a2.rp.x) && a2.st.pad.y === Math.round(a2.rp.y) && a2.st.gate, 'G\'s current row is row 10: the pad stands at the hall\'s 승격식 spot (rankPadPos ' + Math.round(a2.rp.x) + ', ' + Math.round(a2.rp.y) + ')', a2);
    ok(a2.label === '읍장 취임 맛보기' && a2.bus.join() === 'pad', 'its label 「읍장 취임 맛보기」; the bus says taste {pad} once', a2);
    // sticky: a soft row gets its path back (G's current row 3 again), then no G at all: the pad stays
    await setG(page, 'g43_deco');
    const a3 = await page.evaluate(() => { window.__step.run(1.5); return window.__FV43.taste.state(); });
    await setG(page, null);
    const a3b = await page.evaluate(() => { window.__step.run(1.5); return window.__FV43.taste.state(); });
    ok(a3.pad && !a3.gate && a3b.pad && a3.shown, 'once shown it stays (G\'s current row back to 꾸미기; then no G and no seen.g43all)', { a3, a3b });
    // no G in this build: seen.g43all (rows 1–8 all marked) is the gate
    const a3c = await page.evaluate(() => { const gs = window.__FV.scene; gs.v43.seen.g43all = 1; return window.__FV43.taste.gate(); });
    ok(a3c === true, 'without G: seen.g43all opens the gate');
    // the pad keeps clear of the other pads (≥ 1.4 m = 90 px on the ground)
    const sp = await page.evaluate(() => {
      const gs = window.__FV.scene, P = gs.eupTaste.pad, out = [];
      const gd = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) * 2);
      const add = (name, o) => { if (o && Number.isFinite(o.x) && Number.isFinite(o.y) && o !== P) out.push({ name, d: Math.round(gd(P, o)) }); };
      const h = gs.civic.hall; add('hallTax', h.tax.pad); add('hallBoard', h.boardPad);
      for (const id in gs.progress.pads) add('step:' + id, gs.progress.pads[id]);
      const L = gs.v42 && gs.v42.lines; if (L && L.pads) for (const id in L.pads) add('line:' + id, L.pads[id]);
      if (gs.paidPads) for (const q of gs.paidPads()) add('paid:' + (q.id || '?'), q);
      out.sort((a, b) => a.d - b.d);
      return out.slice(0, 4);
    });
    ok(!sp.length || sp[0].d >= 90, 'the pad is ≥ 1.4 m from every other pad (nearest: ' + (sp[0] ? sp[0].name + ' ' + sp[0].d + ' px' : 'none') + ')', sp);
    // (step B: the chain's row 9 is stage 4, P's mkt_s4 step: bought here by hook — G's flag g43s4, then the step done —
    //  so the real G in B–D finds rows 1–9 settled; postdepot.mjs walks row 9 itself)
    const s4 = await page.evaluate(() => {
      const F = window.__FV, gs = F.scene, pr = gs.progress;
      if (!pr.stepPrice || pr.isDone('mkt_s4')) return { has: pr.isDone('mkt_s4'), done: pr.isDone('mkt_s4') };
      pr.setFlag('g43s4');
      const ok1 = F.doneStep('mkt_s4');
      window.__step.run(1.5);
      return { has: ok1, done: pr.isDone('mkt_s4'), flag: !!pr.flags.g43s4 };
    });
    console.log('  info stage 4 for the pre-taste village: ' + JSON.stringify(s4));
    // the 읍 village with the chain done, before the taste (B, C, D start from it)
    preTaste = await page.evaluate(() => { const gs = window.__FV.scene; gs.save(true); return localStorage.getItem('frostVillage.save.v1'); });
    ok(typeof preTaste === 'string' && preTaste.length > 1000 && JSON.parse(preTaste).v43 && JSON.parse(preTaste).v43.seen.g43all === 1 && (!s4.has || JSON.parse(preTaste).progress.done.mkt_s4), 'saved: the 읍 village with seen.g43all' + (s4.has ? ' and stage 4 bought' : '') + ' (for B, C, D)');

    // ---- the start rules
    const pad = (await TS(page)).pad;
    const census0 = await page.evaluate(() => {
      const gs = window.__FV.scene, E = gs.economy;
      // (the coin census: every add / spend while the scene runs, and whether the taste's files are on its stack)
      window.__coinLog = [];
      if (!E.__wrapped) {
        const add = E.add.bind(E), spend = E.spend.bind(E);
        E.add = (n, ...r) => { const s = (new Error().stack || ''); window.__coinLog.push({ k: 'add', n: Math.floor(n), taste: /EupTaste/.test(s) }); return add(n, ...r); };
        E.spend = (n) => { const before = E.coins, s = (new Error().stack || ''); const v = spend(n); window.__coinLog.push({ k: 'spend', n: before - E.coins, taste: /EupTaste/.test(s) }); return v; };
        E.__wrapped = true;
      }
      const o = gs.v42.office.state();
      return { coins: E.coins, depot: [gs.v42.depot.hires, gs.v42.depot.fork], office: o.staff.slice(), rank: gs.v4.rank.level, flags: JSON.stringify(gs.progress.flags), x: JSON.stringify(gs.x43.serialize() || null), v43: JSON.stringify(Object.assign({}, gs.v43, { seen: Object.assign({}, gs.v43.seen) })), done: Object.keys(gs.progress.done).length };
    });
    // a panel open (the residents window): standing there does not start it
    const b0 = await page.evaluate(([x, y]) => {
      const F = window.__FV;
      F.teleport(x + 260, y + 60); window.__step.run(0.3);
      F.teleport(x, y); window.__step.run(0.1);
      const open = F.residents.open();
      window.__step.run(1.5);
      const st = window.__FV43.taste.state();
      F.residents.close(); window.__step.run(0.3);
      return { open, st, after: window.__FV43.taste.state() };
    }, [pad.x, pad.y]);
    ok(b0.open && !b0.st.on && b0.st.blocked === 'panel' && b0.st.stand === 0, 'standing on it with the residents window open: nothing starts (the 0.6 s do not count)', b0.st);
    ok(!b0.after.on && b0.after.stand > 0 && b0.after.stand < 0.6, 'the window closed: it does not start that instant (0.3 s later still waiting)', b0.after);
    // step off; back on: not before 0.6 s of standing still
    const b1 = await page.evaluate(([x, y]) => {
      const F = window.__FV;
      F.teleport(x + 260, y + 60); window.__step.run(0.3);
      F.carry('item_bread', 2); window.__step.run(0.5);
      const pill = F.v42.carry.state();
      F.teleport(x, y); window.__step.run(0.4);
      const early = window.__FV43.taste.state();
      return { early, pill };
    }, [pad.x, pad.y]);
    ok(!b1.early.on && b1.early.stand > 0.3 && b1.early.stand < 0.6, 'back on the pad: nothing before 0.6 s of standing still', b1.early);
    ok(b1.pill.visible, '(the carry pill shows the bread before the scene)', b1.pill);
    const cT0 = await page.evaluate(() => { const R = window.__FV.scene.v4.rank; return { cT: R.cT === undefined ? null : R.cT, steps: (R.steps || []).length }; });
    const b2 = await page.evaluate(() => {
      window.__step.run(0.4);
      const gs = window.__FV.scene, R = gs.v4.rank, st = window.__FV43.taste.state(), v = gs.civic.hall.venue('rank');
      const hf = R.constructor.hallFrame(v);
      return { st, hold: R.hold, cerOn: R.cerOn, cer: R.ceremonyOn, rs: R.state(), focus: gs.camFocus ? { x: Math.round(gs.camFocus.x), y: Math.round(gs.camFocus.y) } : null, hf: { x: Math.round(hf.x), y: Math.round(hf.y) }, bus: window.__FV43.recent().filter((e) => e.name === 'taste').map((e) => e.data.state) };
    });
    ok(b2.st.on && b2.st.stats.starts === 1 && b2.bus.join() === 'pad,start', 'standing still 0.6 s starts the scene (bus: pad, start)', b2);
    ok(b2.hold === 'taste' && b2.cer === true && b2.cerOn === false && b2.rs.ceremony === false && b2.rs.hold === 'taste', 'Rank.hold = taste: ceremonyOn reads true, but cerOn and state().ceremony stay false (never Rank\'s own ceremony)', b2.rs);
    ok(b2.focus && b2.focus.x === b2.hf.x && b2.focus.y === b2.hf.y, 'the camera frames the hall at Rank.hallFrame(venue) (' + (b2.focus && b2.focus.x) + ', ' + (b2.focus && b2.focus.y) + ')', b2);
    ok(!b2.st.pad, 'the pad poofed away');

    // ---- while it runs: the village holds as for the 승격식
    const h1 = await page.evaluate(() => {
      const F = window.__FV, gs = F.scene, U = F.game.scene.getScene('UI'), P = gs.v42.pilot;
      // 관망: let it count down after 3 s idle (automated browsers never do unless asked)
      window.__FV_PILOT_AUTO = true;
      window.__obs0 = F.v42.settings().observeAfter;
      F.v42.settings({ observeAfter: 3 });
      window.__step.run(1.0);
      const win = F.v42.goals.open();
      const go = F.v42.goals.go('cur');
      const walk = F.v42.goals.goTo(gs.player.x + 200, gs.player.y + 100, 'test');
      const res = F.residents.open(); if (res) F.residents.close();
      window.__step.run(1.0);
      return { t: window.__FV43.taste.state().t, win: win ? win.open : null, busy: U.goals ? U.goals.busy() : null, go, walk, res, pill: gs.v42.carry.allowed(gs.player), bag: gs.player.stack.count, cd: P.countdown, pilotOn: P.on, flag: gs.flags && gs.flags.busy ? gs.flags.busy() : 'n/a' };
    });
    ok(h1.win === false && h1.busy === true, 'the goal window does not open (busy)', h1);
    ok(h1.go && h1.go.ok === false && (h1.go.why === 'busy' || h1.go.why === 'none') && h1.walk && h1.walk.ok === false && h1.walk.why === 'busy', 'a 가기 walk answers busy', { go: h1.go, walk: h1.walk });
    ok(h1.res === false, 'the residents window stays shut');
    // (the plate fades on real time, as carry.mjs measures it: a few real frames)
    for (let i = 0; i < 5; i++) { await sleep(120); await page.evaluate(() => window.__step.run(0.05)); }
    const pill1 = await page.evaluate(() => window.__FV.v42.carry.state());
    ok(h1.pill === false && h1.bag > 0 && pill1.visible === false, 'the carry pill hides (the bag still holds ' + h1.bag + ')', { allowed: h1.pill, pill1 });
    ok(h1.flag === 'ceremony', 'the flag card waits (VillageFlags.busy = ceremony)', h1.flag);
    // the gathering, the title card, the badge
    const g5 = await page.evaluate(() => {
      const st0 = window.__FV43.taste.state();
      window.__step.run(Math.max(0, 5 - st0.t));
      const gs = window.__FV.scene, v = gs.civic.hall.venue('rank');
      const near = gs.life.residents.filter((r) => Math.hypot(r.x - v.x, r.y - v.y) < 400).length;
      const party = gs.life.events.some((e) => e.kind === 'party');
      const P = gs.v42.pilot;
      return { t: window.__FV43.taste.state().t, near, all: gs.life.residents.length, party, cd: P.countdown, on: P.on, R: { cT: gs.v4.rank.cT === undefined ? null : gs.v4.rank.cT, steps: (gs.v4.rank.steps || []).length, cerOn: gs.v4.rank.cerOn }, card: window.__FV43.taste.state().card };
    });
    ok(g5.party && g5.near >= 6, 'at 5 s ' + g5.near + ' of ' + g5.all + ' residents are within 400 px of the hall\'s venue (party)', g5);
    ok(g5.cd === 0 && !g5.on, 'the 관망 countdown never starts (idle 6 s > observeAfter 3 s)', { cd: g5.cd, on: g5.on });
    ok(g5.R.cT === cT0.cT && g5.R.steps === cT0.steps && g5.R.cerOn === false, 'Rank\'s own ceremony steps never run (its clock unchanged)', { before: cT0, now: g5.R });
    ok(g5.card && g5.card.open && g5.card.phase === 'title' && g5.card.shown, 'the title card is up at 5 s', g5.card);
    const fly = await page.evaluate(() => { const U = window.__FV.game.scene.getScene('UI'); return U.children.list.filter((o) => o.depth === 65 && o.active).length; });
    await cardCheck(page, 'A 412×915 ko', 'title');
    await shot(page, 'taste_title_412x915_ko.png');
    const t75 = await runTo(page, 7.6);
    ok(t75.card && t75.card.phase === 'title' && t75.on, 'still the title card at 7.6 s', t75.card);
    const t9 = await runTo(page, 9.0);
    ok(t9.card && t9.card.phase === 'teaser' && t9.teaser && t9.on, 'the teaser card at 9 s (same frame), the scene waits for [좋아요]', t9.card);
    const bus1 = await page.evaluate(() => window.__FV43.recent().filter((e) => e.name === 'taste').map((e) => e.data.state));
    ok(bus1.join() === 'pad,start,title,teaser', 'bus: pad, start, title, teaser', bus1);
    void fly;
    await cardCheck(page, 'A 412×915 ko', 'teaser');
    await shot(page, 'taste_teaser_412x915_ko.png');
    // a REAL tap on [좋아요]
    const btn = (await TS(page)).card.btn;
    const cv = await page.$('canvas'); const bb = await cv.boundingBox(); const k = bb.width / 720;
    await page.touchscreen.tap(bb.x + btn.x * k, bb.y + btn.y * k);
    await sleep(250);
    const e1 = await page.evaluate(() => {
      window.__step.run(0.5);
      const F = window.__FV, gs = F.scene, R = gs.v4.rank, U = F.game.scene.getScene('UI'), st = window.__FV43.taste.state();
      return { st, hold: R.hold, cer: R.ceremonyOn, seen: gs.v43.seen.eup_taste, toast: U.toastBox.visible ? U.toastText.text : null, focus: gs.camFocus, bus: window.__FV43.recent().filter((e) => e.name === 'taste').map((e) => e.data.state), saved: JSON.parse(localStorage.getItem('frostVillage.save.v1')).v43 };
    });
    ok(!e1.st.on && e1.st.stats.ends === 1 && e1.st.stats.skips === 0 && e1.bus[e1.bus.length - 1] === 'end', 'a real tap on [좋아요] ends it (bus: end)', e1.st);
    ok(e1.hold === null && e1.cer === false && e1.seen === 1 && !e1.st.pad && e1.st.card && !e1.st.card.open, 'after the end: hold null, seen.eup_taste = 1, no pad, the card closed', e1);
    ok(e1.toast !== '진짜 취임식은 다음 업데이트에서 열려요', 'no toast after a normal end (the card\'s footer said it)', e1.toast);
    ok(e1.saved && e1.saved.seen && e1.saved.seen.eup_taste === 1, 'the marker is in the save at once', e1.saved);
    const census1 = await page.evaluate(() => {
      const gs = window.__FV.scene, E = gs.economy, o = gs.v42.office.state();
      const v43 = Object.assign({}, gs.v43, { seen: Object.assign({}, gs.v43.seen) }); delete v43.seen.eup_taste;
      return { coins: E.coins, depot: [gs.v42.depot.hires, gs.v42.depot.fork], office: o.staff.slice(), rank: gs.v4.rank.level, flags: JSON.stringify(gs.progress.flags), x: JSON.stringify(gs.x43.serialize() || null), v43: JSON.stringify(v43), done: Object.keys(gs.progress.done).length, log: window.__coinLog.slice(), mgmt: gs.x43.get('mgmt') };
    });
    const adds = census1.log.filter((q) => q.k === 'add').reduce((s, q) => s + q.n, 0), spends = census1.log.filter((q) => q.k === 'spend').reduce((s, q) => s + q.n, 0);
    ok(census1.log.every((q) => !q.taste) && census1.coins - census0.coins === adds - spends, 'coins: nothing added or spent by the taste (' + census0.coins + ' → ' + census1.coins + '; the village itself: +' + adds + ' −' + spends + ')', census1.log.slice(0, 8));
    ok(JSON.stringify(census1.depot) === JSON.stringify(census0.depot) && JSON.stringify(census1.office) === JSON.stringify(census0.office) && census1.rank === census0.rank && census1.done === census0.done, 'depot hires / forklift, office staff, rank and done steps unchanged', { before: census0, after: census1 });
    ok(census1.flags === census0.flags && census1.x === census0.x && census1.mgmt === undefined, 'progress.flags and the x drawer unchanged; no x.mgmt', { f0: census0.flags.slice(0, 200), f1: census1.flags.slice(0, 200) });
    ok(census1.v43 === census0.v43, 'v43: only seen.eup_taste was written', { before: census0.v43, after: census1.v43 });
    // 관망 counts down again now
    const p1 = await page.evaluate(() => { window.__step.run(4.0); const P = window.__FV.scene.v42.pilot; const r = { cd: P.countdown, on: P.on }; window.__FV_PILOT_AUTO = false; window.__FV.v42.pilot(false); window.__FV.v42.settings({ observeAfter: window.__obs0 }); window.__step.run(0.2); return r; });
    ok(p1.cd > 0 || p1.on, 'after the scene the 관망 countdown runs again (it was the hold that kept it)', p1);
    const p2 = await page.evaluate(() => { window.__step.run(0.5); return window.__FV.v42.carry.state().visible; });
    ok(p2 === true, 'the carry pill is back');
    // ---- reload: the marker stays; no pad; the scene never replays
    await page.reload({ waitUntil: 'load' });
    await ready(page);
    const r1 = await page.evaluate(([x, y]) => {
      const F = window.__FV, gs = F.scene;
      window.__step.run(2.0);
      const st0 = window.__FV43.taste.state();
      F.teleport(x, y); window.__step.run(2.0);
      return { seen: gs.v43.seen && gs.v43.seen.eup_taste, level: gs.v4.rank.level, st0, st: window.__FV43.taste.state(), coins: gs.economy.coins };
    }, [pad.x, pad.y]);
    ok(r1.seen === 1 && r1.level === 2, 'reload: seen.eup_taste = 1 kept (the save\'s keep-rule), still 읍', r1);
    ok(!r1.st0.pad && !r1.st0.gate && !r1.st.on && r1.st.stats.starts === 0, 'no pad; standing on its spot for 2 s starts nothing (no replay)', r1.st);
    const errs = errorsOf(log);
    ok(errs.length === 0, 'A: 0 page errors', errs.slice(0, 5));
    void bus0;
    await page.context().close();
  }

  // ================================================================== B
  console.log('— B: 360×640 en, the saved pre-taste village: skip, restart mid-scene');
  {
    const keys = Object.assign({}, FXK, { [SAVE_KEY]: preTaste });
    const { page, log } = await boot(keys, { width: 360, height: 640 }, 'en');
    const s0 = await page.evaluate(() => { window.__step.run(1.0); const gs = window.__FV.scene; return { st: window.__FV43.taste.state(), label: gs.eupTaste && gs.eupTaste.label ? gs.eupTaste.label.tx.text : null }; });
    ok(s0.st.pad && s0.st.gate && s0.label === 'Inauguration preview', 'on load the pad is there (seen.g43all in the save), labelled 「Inauguration preview」', s0);
    const pad = s0.st.pad;
    // (a3.3: G and T merged) the real G opened the chain on load (rows 1–8 done: g43all, no coins), wrote g43ready, and
    //  its row 10 is current with T's pad as its 가기 place
    const gg0 = await page.evaluate(() => {
      const gs = window.__FV.scene, G = gs.goals43;
      if (!G || !G.state) return null;
      const st = G.state(), cur = G.current(), pl = cur && cur.place, r10 = st.rows[st.rows.length - 1], r9 = st.rows.find((r) => r.id === 'mkt_s4');
      return { opened: st.opened, cur: st.cur, tasteReady: st.tasteReady, gate: window.__FV43.taste.gate(), seen: st.seen, paid: st.log.length, n: st.rows.length, nDefs: G.defs().length, r9: r9 ? r9.state : null, r10: r10 && { id: r10.id, state: r10.state }, placeIsPad: !!(pl && gs.eupTaste && gs.eupTaste.pad && pl.ref === gs.eupTaste.pad) };
    });
    ok(gg0 && gg0.opened && gg0.seen.g43all === 1 && gg0.seen.g43ready === 1 && gg0.paid === 0 && gg0.tasteReady === true && gg0.gate === true, 'the real G: the chain opened on load with rows 1–8 done (g43all, 0 coins) and wrote g43ready; tasteReady() opens T\'s gate', gg0);
    ok(gg0 && gg0.n === gg0.nDefs && (gg0.r9 === null || gg0.r9 === 'done') && gg0.cur === 'g43_taste' && gg0.r10 && gg0.r10.state === 'now' && gg0.placeIsPad, 'G\'s row 10 (' + (gg0 && gg0.n) + ' rows by data' + (gg0 && gg0.r9 ? ', row 9 stage 4 ✓' : ': no mkt_s4 step') + ') is current and its 가기 place is T\'s pad', gg0);
    // start; a short drag before skipAfter (3 s) does not skip
    const s1 = await page.evaluate(([x, y]) => {
      const F = window.__FV;
      F.teleport(x + 260, y + 60); window.__step.run(0.2);
      F.teleport(x, y); window.__step.run(1.0);
      const on = window.__FV43.taste.state().on;
      window.__step.run(1.0);
      F.setInput(0.8, 0); window.__step.run(0.3); F.setInput(0, 0); window.__step.run(0.1);
      const st = window.__FV43.taste.state();
      return { on, st };
    }, [pad.x, pad.y]);
    ok(s1.on && s1.st.on && s1.st.t < 3, 'a drag at ' + s1.st.t + ' s (before skipAfter) does not skip', s1.st);
    await runTo(page, 4.2);
    await cardCheck(page, 'B 360×640 en', 'title');
    await shot(page, 'taste_title_360x640_en.png');
    // a scene restart mid-scene (the title card up)
    await page.evaluate(() => { const gs = window.__FV.scene; window.__oldRank = gs.v4.rank; window.__oldCard = gs.scene.get('UI').eupTaste; gs.scene.restart(); });
    let up = false;
    for (let i = 0; i < 80 && !up; i++) {
      up = await page.evaluate(() => { window.__step.run(0.1); const F = window.__FV, gs = F.scene; return !!(gs && gs.player && gs.sys.isActive() && gs.eupTaste && !gs.eupTaste.dead && F.game.scene.getScene('UI').ready && gs.v4 && gs.v4.rank && gs.v4.rank !== window.__oldRank); });
      if (!up) await sleep(100);
    }
    const s2 = await page.evaluate(() => {
      window.__step.run(1.5);
      const F = window.__FV, gs = F.scene, U = F.game.scene.getScene('UI');
      return { st: window.__FV43.taste.state(), hold: gs.v4.rank.hold, cer: gs.v4.rank.ceremonyOn, oldHold: window.__oldRank.hold, oldCardDead: !!(window.__oldCard && (window.__oldCard.dead || !window.__oldCard.isOpen)), card: U.eupTaste ? U.eupTaste.state() : null, seen: !!(gs.v43.seen && gs.v43.seen.eup_taste) };
    });
    ok(up && s2.hold === null && s2.cer === false && s2.oldHold === null, 'a scene restart mid-scene: no hold left (old Rank cleared, new one none)', s2);
    ok(s2.oldCardDead && (!s2.card || !s2.card.open) && !s2.seen && s2.st.pad && !s2.st.on, '…no card left, no marker written, the pad is back', s2);
    // a drag held from the start does not skip; a fresh one after 3 s does
    const s3 = await page.evaluate(() => {
      const F = window.__FV;
      F.setInput(0.7, 0.2);
      const started = window.__FV43.taste.play();
      window.__step.run(4.2);
      const held = window.__FV43.taste.state();
      F.setInput(0, 0); window.__step.run(0.2);
      const rel = window.__FV43.taste.state();
      F.setInput(0, 0.8); window.__step.run(0.1); F.setInput(0, 0); window.__step.run(0.1);
      const gs = F.scene, U = F.game.scene.getScene('UI');
      return { started, held: { on: held.on, t: held.t }, rel: { on: rel.on, t: rel.t }, st: window.__FV43.taste.state(), hold: gs.v4.rank.hold, seen: gs.v43.seen.eup_taste, toast: U.toastBox.visible ? U.toastText.text : null, bus: window.__FV43.recent().filter((e) => e.name === 'taste').map((e) => e.data.state) };
    });
    ok(s3.started && s3.held.on && s3.held.t > 4 && s3.rel.on, 'a drag held from the start does not skip (4.2 s), nor letting go', s3);
    ok(!s3.st.on && s3.st.stats.skips === 1 && s3.bus[s3.bus.length - 1] === 'skip', 'a fresh drag after 3 s skips (bus: skip)', s3);
    ok(s3.hold === null && s3.seen === 1 && !s3.st.pad && s3.st.card && !s3.st.card.open, 'the same end state: hold null, seen.eup_taste, no pad, card closed', s3);
    ok(s3.toast === 'The real inauguration comes in the next update', 'a skip before the teaser: the toast 「The real inauguration comes in the next update」', s3.toast);
    const gg1 = await page.evaluate(() => {
      window.__step.run(1.2);
      const gs = window.__FV.scene, G = gs.goals43;
      if (!G || !G.state) return null;
      const st = G.state(), r10 = st.rows[st.rows.length - 1];
      return { cur: st.cur, tasteReady: st.tasteReady, r10: r10 && { id: r10.id, state: r10.state }, paid: st.log.length, seen: st.seen };
    });
    ok(gg1 && gg1.r10 && gg1.r10.id === 'g43_taste' && gg1.r10.state === 'done' && gg1.cur === null && gg1.tasteReady === false && gg1.paid === 0, 'the real G after the taste: row 10 done (seen.eup_taste), no current row left, the gate closed, no coins', gg1);
    // the teaser card at 360×640 en (the marker cleared by hand for the shot)
    const s4 = await page.evaluate(([x, y]) => { const gs = window.__FV.scene; window.__FV.teleport(x, y); window.__step.run(0.5); delete gs.v43.seen.eup_taste; return window.__FV43.taste.play(); }, [pad.x, pad.y]);
    ok(s4 === true, '(shot: the scene once more by the hook)');
    await runTo(page, 9.0);
    await cardCheck(page, 'B 360×640 en', 'teaser');
    await shot(page, 'taste_teaser_360x640_en.png');
    const s5 = await page.evaluate(() => { window.__FV43.taste.ok(); window.__step.run(0.3); const st = window.__FV43.taste.state(); return { on: st.on, seen: window.__FV.scene.v43.seen.eup_taste, hold: window.__FV.scene.v4.rank.hold }; });
    ok(!s5.on && s5.seen === 1 && s5.hold === null, '[OK] ends it', s5);
    const errs = errorsOf(log);
    ok(errs.length === 0, 'B: 0 page errors', errs.slice(0, 5));
    await page.context().close();
  }

  // ================================================================== C, D: the cards in the other two
  for (const run of [{ tag: 'C 360×640 ko', vp: { width: 360, height: 640 }, lang: 'ko', f: '360x640_ko' }, { tag: 'D 412×915 en', vp: { width: 412, height: 915 }, lang: 'en', f: '412x915_en' }]) {
    console.log('— ' + run.tag);
    const keys = Object.assign({}, FXK, { [SAVE_KEY]: preTaste });
    const { page, log } = await boot(keys, run.vp, run.lang);
    const p = await page.evaluate(() => {
      window.__step.run(1.0);
      const F = window.__FV, pd = window.__FV43.taste.state().pad;
      if (!pd) return false;
      F.teleport(pd.x + 260, pd.y + 60); window.__step.run(0.2); F.teleport(pd.x, pd.y);
      for (let i = 0; i < 90 && !window.__FV43.taste.state().on; i++) window.__step.run(1 / 30);
      return window.__FV43.taste.state().on;
    });
    ok(p === true, '[' + run.tag + '] standing on the pad starts the scene');
    await runTo(page, 4.2);
    await cardCheck(page, run.tag, 'title');
    await shot(page, 'taste_title_' + run.f + '.png');
    await runTo(page, 9.0);
    await cardCheck(page, run.tag, 'teaser');
    await shot(page, 'taste_teaser_' + run.f + '.png');
    const e = await page.evaluate(() => { window.__FV43.taste.ok(); window.__step.run(0.3); return window.__FV43.taste.state(); });
    ok(!e.on && e.hold === null, '[' + run.tag + '] [좋아요] ends it', e);
    const errs = errorsOf(log);
    ok(errs.length === 0, '[' + run.tag + '] 0 page errors', errs.slice(0, 5));
    await page.context().close();
  }
} catch (e) {
  fail++;
  console.log('  FAIL threw: ' + (e && e.stack ? e.stack : e));
} finally {
  await browser.close();
  await srv.close();
}
console.log('shots: ' + SHOTS);
console.log('taste: ' + pass + ' passed, ' + fail + ' failed (' + Math.round((Date.now() - t0) / 1000) + ' s)');
process.exit(fail ? 1 : 0);
