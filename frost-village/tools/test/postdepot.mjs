// (v4.3 step B, WP-G — postdepot_addendum.md §6.3 browser acceptance) 물류창고 다음 목표 in the real game, fixed-step clock:
//   node tools/test/postdepot.mjs [--only A|B|C|D|E]
//   (step B: every fixture here is a pre-B village, so it loads through the real remap R43 (lay < 2): N's 「마을 새 단장」
//    letter is due at that load. B and C read it at once as a player would (seen.letter43 / tour43, the card closed);
//    A reads it only after checking that the chain's open banner waits for it, BP-48)
//   A 412x915 ko   the late v4.2 village (office, bank, depot; 마을 with full bars): closed before 읍 (no row, no
//                  objective, no save key); the real 승격식 -> the chain opens once: baselines in x.g43, the rows it already
//                  has ✓ with no coins, the open banner held while the letter is unread, then shown once; the window's
//                  지금 할 일 is row 1 with its 가기 on the
//                  depot staff pad and a real tap walks him there; each row driven by hooks (staff, forklift, 2단, decor,
//                  first houses, standing deliveries, train departures with cargo): its place / wait, the objective line,
//                  its reward paid exactly once (a coin census of what Goals43 adds); row 6's 가기 the source pad empty-
//                  handed and the dock with the goods (a walk arrives there); a reload mid-chain keeps d / t / the
//                  baselines and pays nothing again (no second open banner); a scene restart counts one departure once;
//                  at the end of rows 1–8 g43all and x.g43 gone; row 9 (P's mkt_s4 step): current, G sets g43s4 once,
//                  the 가게 4단 pad stands at full price as its 가기 (never a side row too), the taste waits; bought by
//                  hook -> row 9 ✓ with no chain coins -> row 10 current at the taste pad; 0 page errors
//   B 412x915 ko   the 46-min v4.1 village (no office / bank / depot): nothing changes before the depot (no g43 save key,
//                  no objective, the window's current row is not a chain row, no g43 side row); 읍 + the depot by hook
//                  before the bank: still closed, a staff hire meanwhile is not paid; the office + bank by hook -> it opens
//                  with that row ✓ and 0 coins
//   C 360x640 en   the v4.2 office village (v42_save_office_ttal) opened: the goal window with the chain fits the smallest phone, no raw keys, no row
//                  id twice; 0 page errors
//   D 412x915 ko   (step B) the 4.2.0.2 46-min 읍 village (v4202_46min_admin, its save key only) through the real remap:
//                  remapped, s4half, the chain closed until the bank and the depot stand (by hook); then it opens with
//                  the rows it already has ✓ and 0 coins, the open banner once; rows 1–8 by their g43all marker (A drives
//                  them one by one) -> row 9 current, g43s4 set by G, the 가게 4단 pad at HALF price (1,000 + 판자 10 +
//                  주괴 4) as row 9's 가기, 「반값」 under the row; 0 page errors
//   E 412x915 ko   (step B) the a2.2 late village with a depot crew (v43a22_late) through the real remap: 읍 by hook ->
//                  직원 2명 and 지게차 ✓ with no coins over 5 s, the open banner once after the letter; a second load (no
//                  remap): no banner, no coins; 0 page errors
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, until } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures');
const ARRIVE = 12;
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? String(process.argv[i + 1] || '').toUpperCase() : null; })();
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg + (extra !== undefined && process.env.PD_VERBOSE ? '  — ' + JSON.stringify(extra).slice(0, 300) : '')); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra).slice(0, 700) : '')); } };
const info = (m) => console.log('  info ' + m);
const t0 = Date.now();

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const lateKeys = JSON.parse(fs.readFileSync(path.join(FIX, 'v42_village_late.json'), 'utf8')).keys;
const keysOf = (file) => ({ 'frostVillage.save.v1': fs.readFileSync(path.join(FIX, file), 'utf8') });

async function boot(keys, vp, lang, keepLetter) {
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: vp || { width: 412, height: 915 }, dpr: 1, locale: lang === 'en' ? 'en-US' : 'ko-KR' });
  await page.evaluate(([ks, l]) => {
    localStorage.clear();
    for (const k in ks) localStorage.setItem(k, ks[k]);
    let s = {};
    try { s = JSON.parse(ks['frostVillage.settings.v1'] || '{}') || {}; } catch (e) { s = {}; }
    s.lang = l;
    localStorage.setItem('frostVillage.settings.v1', JSON.stringify(s));
  }, [keys, lang || 'ko']);
  await page.reload({ waitUntil: 'load' });
  await enter(page, keepLetter);
  return { page, log };
}
/** (step B) N's 「마을 새 단장」 letter read, as a player does: seen.letter43 (and tour43: no tour on top), the card closed.
 *  -> { remapped: R43 ran at this load (G's own info), open: the card was up } */
async function readLetter(page) {
  return page.evaluate(() => {
    const gs = window.__FV.scene, U = window.__FV.game.scene.getScene('UI'), C = U && U.renewal43;
    const out = { remapped: !!(gs.goals43 && gs.goals43.info && gs.goals43.info.remapped), open: !!(C && C.isOpen) };
    if (!gs.v43 || typeof gs.v43 !== 'object') gs.v43 = { lay: 0 };
    if (!gs.v43.seen || typeof gs.v43.seen !== 'object') gs.v43.seen = {};
    gs.v43.seen.letter43 = 1; gs.v43.seen.tour43 = 1;
    if (C && C.isOpen && C.close) C.close();
    return out;
  });
}
/** title -> the village, the fixed clock, the census wrappers (keepLetter: N's letter is left unread) */
async function enter(page, keepLetter) {
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player && window.__FV.game.scene.getScene('UI').ready, 180000);
  await sleep(1500);
  await installStepper(page);
  await page.evaluate(() => { if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1; });
  if (!keepLetter) await readLetter(page);
  await census(page);
  await advance(page, 1);
}
/** what Goals43 adds to the coins (a stack census), the banners queued / shown */
async function census(page) {
  await page.evaluate(() => {
    const gs = window.__FV.scene, E = gs.economy, U = window.__FV.game.scene.getScene('UI');
    window.__gc = window.__gc || { coins: 0, calls: [] };
    if (!E.__g43) { const add = E.add.bind(E); E.add = (n, ...a) => { try { if (/Goals43/.test(new Error().stack || '')) { window.__gc.coins += Math.floor(n); window.__gc.calls.push(Math.floor(n)); } } catch (e) { /* */ } return add(n, ...a); }; E.__g43 = 1; }
    window.__qb = window.__qb || [];
    const v = gs.v42;
    if (v && !v.__g43) { const q = v.queueBanner.bind(v); v.queueBanner = (k, ...a) => { window.__qb.push(k); return q(k, ...a); }; v.__g43 = 1; }
    window.__bn = window.__bn || [];
    if (U && !U.__g43) { const b = U.banner.bind(U); U.banner = (m, s, o) => { window.__bn.push(String(m) + ' / ' + String(s || '')); return b(m, s, o); }; U.__g43 = 1; }
  });
}
const S = (page) => page.evaluate(() => { const g = window.__FV.scene.goals43; return g ? g.state() : null; });
const gcoins = (page) => page.evaluate(() => window.__gc.coins);
const book = (page) => page.evaluate(() => window.__FV.v42.goals.book(6, 20));
const objKey = (page) => page.evaluate(() => { const T = window.__FV.scene.tutorial, h = T && T.v42Goal ? T.v42Goal() : null; return h ? { key: h.key, text: h.text, x: h.x, y: h.y } : null; });
const row = (s, id) => (s && s.rows ? s.rows.find((r) => r.id === id) : null);
/** (diagnostics) the GOALS row people:45 as Rank counts it, and whether the chain runs (a GOALS row that regressed pauses it) */
const people = (page) => page.evaluate(() => { const gs = window.__FV.scene, nb = gs.v4, L = gs.life, c = gs.civic, G = gs.goals43; let moved = 0; for (const k of L.moved) if (!L.isPetKey(k)) moved++; const pr = gs.progress; return { people: nb.rank.people(), moved, settlers: c ? c.settlers : null, district: nb.districtPeople ? nb.districtPeople() : null, town: !!nb.town, running: !!(G && G.running()), complete: pr.complete, cur: (() => { const B = window.__FV.v42.goals.book(3, 0); return B.cur ? B.cur.id + ':' + B.cur.state : null; })() }; });
/** the 승격식 at the hall (as watchpan / the B0b probe do) until it ends */
async function promote(page, real) {
  return page.evaluate((rl) => {
    const gs = window.__FV.scene, R = gs.v4 && gs.v4.rank;
    if (!R) return null;
    if (rl) { R.level = 1; R.ceremony(false); window.__step.run(R.cLen + 1.5); }
    else { R.level = 2; gs.progress.setFlag('rankEup'); window.__step.run(1); }
    return { level: R.level, on: R.ceremonyOn };
  }, !!real);
}
/** a train leaves our station now with a crate aboard (the timetable jumped to the end of the dwell) */
async function departWithCargo(page) {
  return page.evaluate(() => {
    const F = window.__FV, gs = F.scene, Fr = gs.v42.freight, rail = gs.v4 && gs.v4.rail;
    if (!rail || !rail.running) return { ok: false, why: 'no rail' };
    F.v4.train('atOurs', 999);
    Fr.board('item_bread', 'card');
    let dep = 0;
    const fn = (e, stop) => { if (e === 'depart' && stop === 'ours') dep++; };
    const tx = () => { const x = gs.x43.get('g43'); return x ? x.t : null; };
    const t0 = tx();
    gs.events.on('v4:train', fn);
    window.__step.run(1.2);
    gs.events.off('v4:train', fn);
    return { ok: dep === 1, dep, aboard: Fr.cardAboard, t0, t1: tx() };
  });
}
/** walk to a row with the window's 가기 (goals.go) and step until it ends: { res, d, last } */
async function walk(page, which, maxS = 90) {
  const res = await page.evaluate((w) => window.__FV.v42.goals.go(w), which);
  if (!res.ok) return { res };
  await until(page, () => !window.__FV.v42.goals.state().on, maxS);
  const end = await page.evaluate(() => { const F = window.__FV, w = F.v42.goals.state(), p = F.scene.player; return { w, p: [p.x, p.y] }; });
  const T = end.w.target;
  return { res, last: end.w.last, d: T ? Math.hypot(end.p[0] - T.x, (end.p[1] - T.y) * 2) : null, target: T };
}
/** n free S plots get a decor at once (as a finished site) */
async function decorate(page, n) {
  return page.evaluate((k) => {
    const gs = window.__FV.scene, out = [];
    for (const id in gs.sites) {
      if (out.length >= k) break;
      const st = gs.sites[id];
      if (st.kind !== 'plot' || st.state !== 'plot' || !st.shown || st.size !== 'S' || st.only || (st.cfg && st.cfg.side43)) continue;
      st.start('deco_lamp', { instant: true }); st.finish(true); out.push(id);
    }
    // (no free S plot: a site of its own is not needed for the count — the built tally is what the row reads)
    while (out.length < k) { gs.built.deco_lamp = (gs.built.deco_lamp || 0) + 1; out.push('tally'); }
    return out;
  }, n);
}

try {
  // ================================================================== A: the late v4.2 village, the whole chain
  if (!ONLY || ONLY === 'A') {
    console.log('— A: the late v4.2 village (office, bank, depot), 412x915, ko');
    let { page, log } = await boot(lateKeys, null, 'ko', true);
    const a0 = await page.evaluate(() => { const gs = window.__FV.scene; return { g43: !!gs.goals43, level: gs.v4.rank.level, bank: gs.isBuilt('bank42'), depot: gs.isBuilt('depot42'), office: gs.isBuilt('chief_office'), seen: Object.keys((gs.v43 && gs.v43.seen) || {}), x: gs.x43.get('g43') }; });
    const s0 = await S(page), b0 = await book(page), o0 = await objKey(page);
    ok(a0.g43 && a0.office && a0.bank && a0.depot && a0.level === 1, 'the late village: gs.goals43 attached; office, bank and depot built; still 마을 (rank 1)', a0);
    ok(s0 && !s0.opened && s0.cur === null && s0.rows.every((r) => r.state === 'next' || r.state === 'done') && !a0.seen.some((k) => /^g43/.test(k)) && a0.x === undefined, 'before 읍: the chain is closed (rows locked, no g43 key, no x.g43)', { rows: s0 && s0.rows.map((r) => r.id + ':' + r.state), seen: a0.seen });
    ok(!(b0.cur && b0.cur.kind === 'g43') && !(o0 && /^obj_g43/.test(o0.key)), 'the window\'s current row and the objective are not chain rows (' + (b0.cur && b0.cur.id) + ' / ' + (o0 && o0.key) + ')');
    // the real 승격식 -> the chain opens at the next tick
    const pr = await promote(page, true);
    ok(pr && pr.level === 2 && !pr.on, 'the 승격식 ran: 읍', pr);
    const g0 = await gcoins(page);
    await until(page, () => { const g = window.__FV.scene.goals43; return !!(g && g.opened()); }, 6);
    const s1 = await S(page);
    ok(s1.opened && s1.x && s1.x.d === 0 && s1.x.t === 0 && Number.isInteger(s1.x.k) && Number.isInteger(s1.x.u), 'opened: v43.seen.g43open and x.g43 { d: 0, t: 0, k, u } (' + JSON.stringify(s1.x) + ')', s1.x);
    const pre = s1.rows.filter((r) => r.state === 'done').map((r) => r.id);
    ok((await gcoins(page)) === g0 && pre.every((id) => s1.seen[id] === 1 || s1.seen.g43all === 1), 'rows the village already has are ✓ with no coins (' + pre.join(', ') + ')', { pre, seen: s1.seen, coins: (await gcoins(page)) - g0 });
    // (a pre-B village: remapped at this load, so the open banner waits for N's letter, BP-48)
    const lt0 = await page.evaluate(() => { const g = window.__FV.scene.goals43; return { remapped: !!(g.info && g.info.remapped), letter: !!(window.__FV.scene.v43.seen || {}).letter43 }; });
    if (lt0.remapped && !lt0.letter) {
      await advance(page, 3);
      const held = await page.evaluate(() => ({ q: window.__qb.filter((k) => k === 'g43:open').length, due: window.__FV.scene.goals43.openDue }));
      ok(held.q === 0 && held.due === true, 'remapped at this load (R43), the letter unread: the open banner waits (BP-48)', held);
    } else info('the letter: ' + JSON.stringify(lt0));
    const lt = await readLetter(page);
    info('N\'s letter read (remapped ' + lt.remapped + ', card up ' + lt.open + ')');
    await until(page, () => window.__FV.scene.goals43.shown.open >= 1, 25);
    const bn = await page.evaluate(() => ({ q: window.__qb.filter((k) => k === 'g43:open').length, shown: window.__bn.filter((m) => /물류창고 다음 목표가 생겼어요/.test(m)).length, n: window.__FV.scene.goals43.shown.open }));
    ok(bn.q === 1 && bn.shown === 1 && bn.n === 1, 'the open banner 「물류창고 다음 목표가 생겼어요」 is shown once' + (lt0.remapped ? ', after the letter' : ''), bn);
    // row 1: the window, the objective, a real walk
    let b = await book(page);
    const sp = await page.evaluate(() => { const p = window.__FV.scene.v42.depot.pads.staff; return p ? { x: Math.round(p.x), y: Math.round(p.y), cost: p.remaining } : null; });
    ok(b.cur && b.cur.id === 'g43_staff' && b.cur.kind === 'g43' && sp && b.cur.place && b.cur.place.x === sp.x && b.cur.place.y === sp.y, 'the window\'s 지금 할 일 is row 1 (물류창고 직원 2명 뽑기), its 가기 the depot staff pad', { cur: b.cur, pad: sp });
    ok(/0 \/ 2/.test(b.cur.sub) && /1,200/.test(b.cur.sub), 'its line: 0 / 2 · 1,200 코인 (' + b.cur.sub + ')');
    ok(!b.side.some((r) => r.id === 'depot_staff' || r.id === 'depot_fork') && b.next.some((r) => r.id === 'g43_fork'), 'the depot pads are chain rows, never side rows too (the forklift in 「다음」)', { side: b.side.map((r) => r.id), next: b.next.map((r) => r.id) });
    let ob = await objKey(page);
    ok(ob && ob.key === 'obj_g43:g43_staff:0:' + sp.cost && /물류창고 직원 뽑기 0\/2/.test(ob.text), 'the objective: 「' + (ob && ob.text) + '」', ob);
    const tap = await page.evaluate(() => { const G = window.__FV.v42.goals; G.open(); return G.tapRow('g43_staff'); });
    await until(page, () => !window.__FV.v42.goals.state().on, 90);
    const w1 = await page.evaluate(() => { const F = window.__FV, w = F.v42.goals.state(), p = F.scene.player; return { w, p: [p.x, p.y] }; });
    const d1 = w1.w.target ? Math.hypot(w1.p[0] - w1.w.target.x, (w1.p[1] - w1.w.target.y) * 2) : null;
    ok(tap && w1.w.last === 'arrived' && d1 !== null && d1 <= ARRIVE, 'a real tap on the row walks him to the depot staff pad (' + (d1 === null ? '-' : d1.toFixed(1)) + ' px)', { tap, last: w1.w.last, d1 });
    await page.evaluate(() => { const F = window.__FV, gs = F.scene; F.teleport(gs.player.x + 160, gs.player.y + 120); F.setInput && F.setInput(0, 0); });
    // pay row 1 by hook (two hires): +reward once
    const c1 = await gcoins(page);
    // (standing on the pad after the walk may have paid part of it: the hook tops it up to two hires in all)
    await page.evaluate(() => { const D = window.__FV.scene.v42.depot; for (let i = 0; i < 3 && D.hires < 2; i++) { window.__FV.v42.depot({ hire: 'staff' }); window.__step.run(0.3); } window.__step.run(1.4); });
    let s = await S(page);
    ok(row(s, 'g43_staff').state === 'done' && (await gcoins(page)) - c1 === 300 && s.log.filter((q) => q.id === 'g43_staff').length === 1, 'two hires: row 1 ✓, +300 coins exactly once', { coins: (await gcoins(page)) - c1, log: s.log });
    await advance(page, 3);
    ok((await gcoins(page)) - c1 === 300, '…and never again');
    let q = await page.evaluate(() => window.__qb.slice());
    ok(q.indexOf('g43:g43_staff') >= 0, 'it was the current row: its 「목표 달성」 banner is queued (behind the depot\'s own)', q);
    b = await book(page);
    ok(b.cur && b.cur.id === 'g43_fork' && b.side.some((r) => r.id === 'depot_staff'), 'row 2 (지게차) is current; the third staff pad is a side row now', { cur: b.cur && b.cur.id, side: b.side.map((r) => r.id) });
    ob = await objKey(page);
    ok(ob && /^obj_g43:g43_fork/.test(ob.key), 'the objective follows: ' + (ob && ob.text));
    // row 2
    const c2 = await gcoins(page);
    await page.evaluate(() => { window.__FV.v42.depot({ hire: 'fork' }); window.__step.run(1.4); });
    s = await S(page);
    ok(row(s, 'g43_fork').state === 'done' && (await gcoins(page)) - c2 === 300, 'the forklift: row 2 ✓, +300', (await gcoins(page)) - c2);
    // row 3: its place / wait, then a 2단 by hook
    s = await S(page);
    const r3 = row(s, 'g43_st2');
    info('row 3 (2단): ' + r3.state + (r3.place ? ' 가기 (' + r3.place.x + ', ' + r3.place.y + ')' : '') + ' · ' + r3.sub);
    ok(r3.state === 'now' ? !!r3.place || !!r3.wait : (r3.state === 'wait' && !!r3.wait), 'row 3 has a 2단 pad / a gate pad as its 가기, or says why it waits', r3);
    const c3 = await gcoins(page);
    await page.evaluate(() => { const L = window.__FV.scene.v42.lines; const l = ['grill', 'sawmill', 'bakery', 'smelter', 'smokehouse'].find((k) => !L.up[k]); window.__FV.v42.lines({ up: { [l]: 1 } }); window.__step.run(1.4); });
    s = await S(page);
    ok(row(s, 'g43_st2').state === 'done' && (await gcoins(page)) - c3 === 150, 'one more 2단: row 3 ✓, +150', (await gcoins(page)) - c3);
    // row 4: decor
    const r4 = row(s, 'g43_deco');
    info('row 4 (꾸미기): ' + r4.state + ' ' + r4.why + (r4.place ? ' 가기 (' + r4.place.x + ', ' + r4.place.y + ')' : '') + ' · ' + r4.sub);
    ok(r4.state === 'now' ? !!r4.place : r4.why === 'noplot', 'row 4 leads to a free plot, or waits for one (noplot)', r4);
    const c4 = await gcoins(page);
    const dec = await decorate(page, 2);
    await advance(page, 1.4);
    s = await S(page);
    ok(row(s, 'g43_deco').state === 'done' && (await gcoins(page)) - c4 === 100, 'two decor built after the opening: row 4 ✓, +100 (' + dec.join(', ') + ')', (await gcoins(page)) - c4);
    // row 5: the first houses
    const r5 = row(s, 'g43_house');
    info('row 5 (첫 집): ' + r5.state + ' ' + r5.why + (r5.place ? ' 가기 (' + r5.place.x + ', ' + r5.place.y + ')' : '') + ' · ' + r5.sub);
    const c5 = await gcoins(page);
    if (r5.state !== 'done') {
      ok(r5.place ? r5.state === 'now' : !!r5.why, 'row 5 leads to a first-house plot, or waits (lockVacant: 빈 방이 차면)', r5);
      await page.evaluate(() => { const gs = window.__FV.scene; for (const id of ['h43_1', 'h43_2']) { const st = gs.sites[id]; if (!st || st.state === 'done') continue; st.setShown(true); if (st.state === 'plot') st.start(st.only, { instant: true }); if (st.state !== 'done') st.finish(true); } window.__step.run(1.4); });
      s = await S(page);
      ok(row(s, 'g43_house').state === 'done' && (await gcoins(page)) - c5 === 100, 'both first houses built: row 5 ✓, +100', (await gcoins(page)) - c5);
    } else info('row 5 was ✓ at the opening (no coins)');
    // row 6: where it leads, then deliveries
    await page.evaluate(() => { window.__FV.clearStack(); window.__step.run(0.3); });
    let r6 = row(await S(page), 'g43_dlv');
    const where = await page.evaluate(() => { const gs = window.__FV.scene, g = gs.v4.growth, c = g.cards.find((q) => !q.shop && !g.cardDone(q)); const ty = c ? Object.keys(c.need).find((k) => c.got[k] < c.need[k]) : null; const src = ty ? gs.tutorial.sourceOf(ty) : null; return { ty, src: src ? { x: Math.round(src.outPad.x), y: Math.round(src.outPad.y) } : null, dock: { x: Math.round(g.dockPad.x), y: Math.round(g.dockPad.y) } }; });
    ok(r6.state === 'now' && r6.place && (where.src ? r6.place.x === where.src.x && r6.place.y === where.src.y : r6.place.x === where.dock.x), 'row 6 empty-handed: its 가기 is the output pad of what the standing card needs (' + where.ty + ')', { place: r6.place, where });
    ob = await objKey(page);
    ok(ob && /^obj_g43:g43_dlv/.test(ob.key) && /정기 납품/.test(ob.text), 'the objective: 「' + (ob && ob.text) + '」');
    await page.evaluate((ty) => { window.__FV.carry(ty, 2); window.__step.run(0.3); }, where.ty);
    r6 = row(await S(page), 'g43_dlv');
    ok(r6.place && r6.place.x === where.dock.x && r6.place.y === where.dock.y, 'carrying it: the 가기 is the dock (짐 싣는 곳)', { place: r6.place, dock: where.dock });
    const w6 = await walk(page, 'cur', 90);
    ok(w6.res.ok && w6.last === 'arrived' && w6.d <= ARRIVE, 'a tap walks him to the dock (' + (w6.d === null || w6.d === undefined ? '-' : w6.d.toFixed(1)) + ' px)', w6);
    // (the station porters fill standing cards and the trains run by themselves meanwhile: each hook is measured on its own)
    const fill = () => page.evaluate(() => { const F = window.__FV, gs = F.scene, g = gs.v4.growth; const dx = () => { const x = gs.x43.get('g43'); return x ? x.d : null; }; const i = g.cards.findIndex((c) => !c.shop && !g.cardDone(c)); if (i < 0) return null; const d0 = dx(); F.v4.fill(i); const d1 = dx(); window.__step.run(2.2); return { d0, d1 }; });
    const f1 = await fill();
    const fShop = await page.evaluate(() => { const gs = window.__FV.scene, d0 = gs.x43.get('g43').d; gs.events.emit('v4:cardDone', { shop: 'cafe', need: {}, got: {} }); return [d0, gs.x43.get('g43').d]; });
    ok(f1 && f1.d1 === f1.d0 + 1 && fShop[1] === fShop[0], 'a standing card done: d + 1 (' + (f1 && f1.d0) + ' → ' + (f1 && f1.d1) + '); a founding card counts nothing', { f1, fShop });
    for (let i = 0; i < 3; i++) { const x = (await S(page)).x; if (!x || x.d >= 2) break; await fill(); }
    const dep1 = await departWithCargo(page);
    const dep0 = await page.evaluate(() => { const gs = window.__FV.scene, F = gs.v42.freight, a = F.cardAboard, t0 = gs.x43.get('g43').t; F.cardAboard = 0; gs.events.emit('v4:train', 'depart', 'ours'); const t1 = gs.x43.get('g43').t; F.cardAboard = a; return [t0, t1]; });
    ok(dep1.ok && dep1.t1 === dep1.t0 + 1 && dep0[1] === dep0[0], 'a departure from our station with cargo: t + 1 (' + dep1.t0 + ' → ' + dep1.t1 + '); one with nothing aboard counts nothing', { dep1, dep0 });
    await advance(page, 1.5);
    s = await S(page);
    ok(s.x && s.x.d >= 2 && s.x.t >= 1, 'mid-chain: x.g43 ' + JSON.stringify(s.x), s.x);
    const xBefore = s.x, dlvBefore = s.log.filter((q) => q.id === 'g43_dlv');
    // ---- a reload mid-chain
    await page.evaluate(() => window.__FV.save());
    const errA1 = log.errors.slice();
    await page.reload({ waitUntil: 'load' });
    await enter(page);
    await advance(page, 4);
    s = await S(page);
    // (d / t may only have grown meanwhile: the station porters and the trains go on by themselves)
    const xs = s.x || xBefore;
    ok(s.opened && (s.x ? s.x.k === xBefore.k && s.x.u === xBefore.u && s.x.d >= xBefore.d && s.x.t >= xBefore.t : !!s.seen.g43all) && row(s, 'g43_staff').state === 'done' && row(s, 'g43_house').state === 'done', 'a reload keeps the chain: x.g43 ' + JSON.stringify(xs) + ' (before ' + JSON.stringify(xBefore) + '), the done rows ✓', { x: s.x, before: xBefore });
    const rl = await page.evaluate(() => ({ coins: window.__gc.coins, open: window.__FV.scene.goals43.shown.open, q: window.__qb.filter((k) => /^g43:/.test(k)) }));
    ok(rl.coins === 0 && rl.open === 0 && rl.q.length === 0, 'after the reload nothing pays again and no banner repeats', rl);
    // ---- a scene restart into the same save: one departure counts once (no doubled listener, BP-56)
    const rs = await page.evaluate(() => {
      const g = window.__FV.game, gs0 = g.scene.getScene('Game');
      window.__FV.save();
      const n0 = gs0.events.listenerCount('v4:train');
      g.scene.stop('UI');
      gs0.scene.restart({ fresh: false });
      for (let i = 0; i < 30; i++) window.__step.run(0.1);
      return { n0 };
    });
    await waitFor(page, () => window.__FV.game.scene.isActive('UI') && window.__FV.scene && window.__FV.scene.goals43 && window.__FV.game.scene.getScene('UI').ready, 60000);
    await page.evaluate(() => { if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1; });
    await census(page);
    await advance(page, 2);
    info('after the restart: ' + JSON.stringify(await people(page)));
    const rs2 = await page.evaluate(() => { const gs = window.__FV.scene; return { n1: gs.events.listenerCount('v4:train'), x: gs.goals43.state().x }; });
    const dep2 = await departWithCargo(page);
    s = await S(page);
    ok(rs2.n1 === rs.n0 && dep2.ok && (dep2.t0 >= 3 || dep2.t1 === dep2.t0 + 1), 'a scene restart: the same number of v4:train listeners (' + rs.n0 + ' → ' + rs2.n1 + '), one departure counts exactly once (t ' + dep2.t0 + ' → ' + dep2.t1 + ')', { rs, rs2, dep2, x: s.x });
    // the rest of the chain: one more card, one more departure
    // (a GOALS row that regressed — people below 45 — pauses the chain by design (§3.2): wait for the village to come
    //  back rather than read a paused chain as a failure; say so when it does not)
    const pp6 = await people(page);
    if (!pp6.running) {
      info('the chain is paused (a GOALS row regressed): ' + JSON.stringify(pp6));
      await until(page, () => { const G = window.__FV.scene.goals43; return !!(G && G.running()); }, 60);
      info('…after waiting up to 60 s: ' + JSON.stringify(await people(page)));
    }
    const c6 = await gcoins(page);
    if (dlvBefore.length) {
      ok(dlvBefore.length === 1 && dlvBefore[0].n === 200 && row(s, 'g43_dlv').state === 'done', 'row 6 reached 3 before the reload (the station porters help): +200 once then, nothing after', dlvBefore);
    } else {
      for (let i = 0; i < 3; i++) { if ((await S(page)).seen.g43_dlv) break; await fill(); await advance(page, 1.2); }
      s = await S(page);
      ok(row(s, 'g43_dlv').state === 'done' && (await gcoins(page)) - c6 === 200 && s.log.filter((q) => q.id === 'g43_dlv').length === 1, 'the third standing card after the reload: row 6 ✓, +200 once (this session saw it count up)', { coins: (await gcoins(page)) - c6, log: s.log });
    }
    // (the trains run by themselves meanwhile: the restart's departure above may already have made it 3 and paid then; read
    //  the row, not its key — g43all may already have replaced the eight keys)
    const c7 = await gcoins(page), paid7 = row(await S(page), 'g43_train').state === 'done' ? 1 : 0;
    for (let i = 0; i < 3; i++) { if ((await S(page)).seen.g43_train) break; await departWithCargo(page); await advance(page, 1.4); }
    s = await S(page);
    ok(row(s, 'g43_train').state === 'done' && (await gcoins(page)) - c7 === (paid7 ? 0 : 200) && s.log.filter((q) => q.id === 'g43_train').length <= 1, 'the third departure with cargo: row 7 ✓, +200 once' + (paid7 ? ' (paid already at the restart\'s departure)' : ''), { coins: (await gcoins(page)) - c7, paid7, log: s.log });
    ok(row(s, 'g43_shop').state === 'done', 'row 8 (가게 키우기): ✓ (the shop43 stage-3 shop and its clerk)');
    ok(s.seen.g43all === 1 && !Object.keys(s.seen).some((k) => /^g43_/.test(k)) && s.x === null, 'every row done: g43all replaces the row keys, x.g43 is gone', { seen: s.seen, x: s.x });
    const saved = await page.evaluate(() => { window.__FV.save(); const sv = JSON.parse(localStorage.getItem('frostVillage.save.v1')); return { seen: sv.v43 && sv.v43.seen, x: sv.x && sv.x.g43 }; });
    ok(saved.seen && saved.seen.g43open === 1 && saved.seen.g43all === 1 && saved.x === undefined, 'the save carries v43.seen { g43open, g43all } and no x.g43', saved);
    // ---- row 9: 가게 4단 「눈꽃마을 시장」 (P's mkt_s4 step, BP-41): current now; G sets g43s4 once; the pad is its 가기
    const r9 = row(s, 'mkt_s4');
    if (r9) {
      await advance(page, 2);          // (setFlag -> Progression.syncPads 0.7 s later)
      s = await S(page);
      const p9 = await page.evaluate(() => { const gs = window.__FV.scene, pr = gs.progress, u = pr.pads.mkt_s4; return { flag: pr.flags.g43s4 === true, half: !!pr.flags.s4half, s3: pr.isDone('mkt_s3'), pad: u ? { x: Math.round(u.x), y: Math.round(u.y), cost: u.cost, items: u.items } : null }; });
      ok(s.cur === 'mkt_s4' && row(s, 'mkt_s4').state === 'now' && p9.flag && p9.s3, 'rows 1–8 done: row 9 (가게 4단) is the current row, G set g43s4 (3단 done)', { cur: s.cur, p9 });
      const full = !p9.half;
      ok(p9.pad && p9.pad.cost === (full ? 2000 : 1000) && p9.pad.items && p9.pad.items.item_plank === (full ? 20 : 10) && p9.pad.items.item_ingot === (full ? 8 : 4), 'the 가게 4단 pad stands at ' + (full ? 'full price (2,000 + 판자 20 + 주괴 8: not 읍 at the remap)' : 'half price (s4half)'), p9);
      const r9b = row(s, 'mkt_s4');
      ok(r9b.place && p9.pad && r9b.place.x === p9.pad.x && r9b.place.y === p9.pad.y, 'row 9\'s 가기 is the pad', { place: r9b.place, pad: p9.pad });
      b = await book(page);
      ok(b.cur && b.cur.id === 'mkt_s4' && !b.side.some((r) => r.id === 'mkt_s4'), 'the window: 지금 할 일 is row 9; the mkt_s4 pad is not a side row too', { cur: b.cur && b.cur.id, side: b.side.map((r) => r.id) });
      ob = await objKey(page);
      ok(ob && /^obj_g43:mkt_s4/.test(ob.key), 'the objective: 「' + (ob && ob.text) + '」', ob);
      ok(!s.tasteReady && !(await page.evaluate(() => !!(window.__FV.scene.eupTaste && window.__FV.scene.eupTaste.pad))), 'the taste pad waits for stage 4 (row 9 not settled)');
      const c9 = await gcoins(page);
      const bought = await page.evaluate(() => { const ok1 = window.__FV.completeStep('mkt_s4'); window.__step.run(2.0); return { ok1, done: window.__FV.scene.progress.isDone('mkt_s4') }; });
      s = await S(page);
      ok(bought.ok1 && bought.done && row(s, 'mkt_s4').state === 'done' && (await gcoins(page)) === c9 && s.log.every((q) => q.id !== 'mkt_s4'), 'stage 4 bought (hook): row 9 ✓, no chain coins (M\'s own banner is the payoff)', { bought, coins: (await gcoins(page)) - c9 });
      await advance(page, 1.5);
      s = await S(page);
    } else info('no row 9 in this tree (no mkt_s4 step)');
    b = await book(page);
    const r10 = row(s, 'g43_taste');
    ok(!(b.cur && b.cur.kind === 'g43' && b.cur.id !== 'g43_taste') && (!r10 || (b.cur && b.cur.id === 'g43_taste' && b.cur.place && s.tasteReady)), r10 ? 'rows 1–8 done: row 10 (읍장 취임 맛보기) is the current row, its 가기 the taste pad, the gate open' : 'the window has no chain row left to do (' + (b.cur && b.cur.id) + '; no row 10 in this tree)', { cur: b.cur, r10 });
    const errs = errA1.concat(log.errors).filter((e) => !/favicon/i.test(e));
    ok(errs.length === 0, 'A: 0 page errors', errs.slice(0, 5));
    await page.context().close();
  }

  // ================================================================== B: before the depot, and the depot before the bank
  if (!ONLY || ONLY === 'B') {
    console.log('— B: the 46-min v4.1 village (no office / bank / depot), 412x915, ko');
    const { page, log } = await boot(keysOf('v41_save_smart_46min.json'));
    await advance(page, 4);
    let s = await S(page);
    const b0 = await book(page), o0 = await objKey(page);
    const seen0 = await page.evaluate(() => Object.keys((window.__FV.scene.v43 && window.__FV.scene.v43.seen) || {}));
    ok(s && !s.opened && s.cur === null && s.x === null && !seen0.some((k) => /^g43/.test(k)), 'nothing before the depot: the chain closed, no g43 save key, no x.g43', { seen0, x: s && s.x });
    ok(!(b0.cur && b0.cur.kind === 'g43') && !b0.side.some((r) => /^depot_/.test(r.id)) && !(o0 && /^obj_g43/.test(o0.key)), 'the window\'s current row (' + (b0.cur && b0.cur.id) + '), its side rows and the objective (' + (o0 && o0.key) + ') are as before', { cur: b0.cur && b0.cur.id, obj: o0 && o0.key });
    const nDefs = await page.evaluate(() => window.__FV.scene.goals43.defs().length);
    ok(s.rows.length === nDefs && nDefs >= 8 && s.rows.every((r) => r.state === 'next' || r.state === 'done'), 'the chain\'s ' + nDefs + ' rows (8, + row 9 with the mkt_s4 step, + row 10 with the taste: by data) sit at the end of the road, locked (' + s.rows.filter((r) => r.state === 'done').length + ' ✓ already)', s.rows.map((r) => r.id + ':' + r.state));
    await promote(page, false);
    await page.evaluate(() => { window.__FV.v42.depot({ build: true }); window.__step.run(1); window.__FV.v42.depot({ hire: 'staff' }); window.__step.run(0.3); window.__FV.v42.depot({ hire: 'staff' }); window.__step.run(2.5); });
    s = await S(page);
    const b1 = await book(page);
    const dep = await page.evaluate(() => ({ depot: window.__FV.scene.isBuilt('depot42'), bank: window.__FV.scene.isBuilt('bank42'), hires: window.__FV.scene.v42.depot.hires, open: window.__FV.scene.goals43.shown.open, q: window.__qb.filter((k) => /^g43:/.test(k)) }));
    ok(dep.depot && !dep.bank && dep.hires === 2 && !s.opened && s.cur === null && dep.q.length === 0 && (await gcoins(page)) === 0, '읍 and the depot before the bank (two staff hired meanwhile): still closed, no banner, no coins', { dep, cur: b1.cur && b1.cur.id });
    ok(b1.cur && b1.cur.kind !== 'g43', 'the window\'s 지금 할 일 is the v4.2 building still missing (' + (b1.cur && b1.cur.id) + ')');
    await page.evaluate(() => { window.__FV.v42.office({ build: 'all' }); window.__step.run(2.5); });
    s = await S(page);
    ok(s.opened && row(s, 'g43_staff').state === 'done' && s.seen.g43_staff === 1 && (await gcoins(page)) === 0, 'the office and the bank built: the chain opens; the staff hired before is ✓ with 0 coins', { opened: s.opened, staff: row(s, 'g43_staff'), coins: await gcoins(page) });
    await until(page, () => window.__FV.scene.goals43.shown.open >= 1, 25);
    ok((await page.evaluate(() => window.__FV.scene.goals43.shown.open)) === 1, 'the open banner, once');
    const errs = log.errors.filter((e) => !/favicon/i.test(e));
    ok(errs.length === 0, 'B: 0 page errors', errs.slice(0, 5));
    await page.context().close();
  }

  // ================================================================== D: a remapped 읍 village (s4half): opening, row 9 at half price
  if (!ONLY || ONLY === 'D') {
    console.log('— D: the 4.2.0.2 46-min 읍 village through the real remap (s4half), 412x915, ko');
    const fx = JSON.parse(fs.readFileSync(path.join(FIX, 'v4202_46min_admin.json'), 'utf8'));
    const { page, log } = await boot({ 'frostVillage.save.v1': fx.keys['frostVillage.save.v1'] });
    await advance(page, 3);
    const d0 = await page.evaluate(() => { const gs = window.__FV.scene, G = gs.goals43, pr = gs.progress; return { remapped: !!(G.info && G.info.remapped), lay: gs.v43 && gs.v43.lay, s4half: pr.flags.s4half === true, level: gs.v4.rank.level, bank: gs.isBuilt('bank42'), depot: gs.isBuilt('depot42'), opened: G.opened(), seen: Object.keys((gs.v43 && gs.v43.seen) || {}) }; });
    ok(d0.remapped && d0.lay === 2 && d0.s4half && d0.level === 2 && !d0.bank && !d0.depot && !d0.opened, 'remapped at this load (lay 2), 읍 so s4half; no bank / depot yet: the chain is closed', d0);
    // (a 4.2.0.x 읍 village with no hall: step B's GOALS ask for the hall first (P), and the chain needs every GOALS row:
    //  the hall on w_hall by hook, then the office + bank and the depot)
    const dh = await page.evaluate(() => { const gs = window.__FV.scene, st = gs.sites.w_hall; const had = gs.isBuilt('town_hall'); if (!had && st && st.state === 'plot') { st.setShown(true); st.start('town_hall', { instant: true }); st.finish(true); } window.__step.run(1.5); return { had, now: gs.isBuilt('town_hall'), running0: gs.goals43.running() }; });
    ok(dh.now && !dh.running0, 'the hall stands (' + (dh.had ? 'it had one' : 'built on w_hall by hook') + '); still no bank / depot: closed', dh);
    await page.evaluate(() => { const F = window.__FV; F.v42.office({ build: 'all' }); window.__step.run(1); F.v42.depot({ build: true }); window.__step.run(2.5); });
    info('D: ' + JSON.stringify(await people(page)));
    let s = await S(page);
    const pre = s.rows.filter((r) => r.state === 'done').map((r) => r.id);
    ok(s.opened && (await gcoins(page)) === 0 && pre.every((id) => s.seen[id] === 1 || s.seen.g43all === 1 || id === 'mkt_s4' || id === 'g43_taste'), 'the bank and the depot built (hook): the chain opens; the rows it already has are ✓ with 0 coins (' + pre.join(', ') + ')', { pre, seen: s.seen });
    await until(page, () => window.__FV.scene.goals43.shown.open >= 1, 25);
    ok((await page.evaluate(() => window.__FV.scene.goals43.shown.open)) === 1, 'the open banner, once');
    // rows 1–8 by their marker (A drives each one); 3단 and its clerk done so the 4단 pad has its spot
    const d1 = await page.evaluate(() => {
      const F = window.__FV, gs = F.scene, pr = gs.progress;
      for (const id of ['mkt_s3', 'hire_clerk_s3']) if (!pr.isDone(id)) F.doneStep(id);
      gs.v43.seen.g43all = 1;
      window.__step.run(3);
      const u = pr.pads.mkt_s4;
      return { flag: pr.flags.g43s4 === true, pad: u ? { x: Math.round(u.x), y: Math.round(u.y), cost: u.cost, items: u.items } : null };
    });
    s = await S(page);
    const r9 = row(s, 'mkt_s4');
    if (r9) {
      ok(s.cur === 'mkt_s4' && d1.flag, 'rows 1–8 done: row 9 is current and G set g43s4', { cur: s.cur, d1 });
      ok(d1.pad && d1.pad.cost === 1000 && d1.pad.items && d1.pad.items.item_plank === 10 && d1.pad.items.item_ingot === 4, 'the 가게 4단 pad at half price for an s4half village: 1,000 + 판자 10 + 주괴 4', d1.pad);
      ok(r9.place && d1.pad && r9.place.x === d1.pad.x && r9.place.y === d1.pad.y && /반값/.test(r9.sub || ''), 'row 9\'s 가기 is the pad; its line says 「반값」 (' + r9.sub + ')', r9);
      const b = await book(page);
      ok(b.cur && b.cur.id === 'mkt_s4' && /반값/.test(b.cur.sub || '') && !b.side.some((r) => r.id === 'mkt_s4'), 'the window: 지금 할 일 is row 9 with 「반값」, not a side row too', { cur: b.cur, side: b.side.map((r) => r.id) });
    } else info('no row 9 in this tree (no mkt_s4 step)');
    const errs = log.errors.filter((e) => !/favicon/i.test(e));
    ok(errs.length === 0, 'D: 0 page errors', errs.slice(0, 5));
    await page.context().close();
  }

  // ================================================================== E: an a2.2 village with a depot crew through the real remap
  //  (postdepot_addendum.md §6.3 browser item 2, §6.9 final item 9): rows pre-done with coins unchanged, one open banner
  //  after the letter; a second load (no remap) opens nothing again
  if (!ONLY || ONLY === 'E') {
    console.log('— E: the a2.2 late village (depot crew 2 + forklift) through the real remap, 412x915, ko');
    const a22 = JSON.parse(fs.readFileSync(path.join(FIX, 'v43a22_late.json'), 'utf8')).keys;
    const { page, log } = await boot(a22, null, 'ko', true);
    const e0 = await page.evaluate(() => { const gs = window.__FV.scene, G = gs.goals43, D = gs.v42 && gs.v42.depot; return { remapped: !!(G && G.info && G.info.remapped), lay: gs.v43 && gs.v43.lay, level: gs.v4.rank.level, bank: gs.isBuilt('bank42'), depot: gs.isBuilt('depot42'), hires: D ? D.hires : null, fork: D ? D.fork : null, opened: !!(G && G.opened()) }; });
    ok(e0.remapped && e0.lay === 2 && e0.level === 1 && e0.bank && e0.depot && e0.hires >= 2 && !!e0.fork && !e0.opened, 'remapped at this load (lay 2); bank and depot standing, depot crew ' + e0.hires + ' + forklift; still 마을: the chain is closed', e0);
    await promote(page, false);
    const g0 = await gcoins(page);
    await until(page, () => { const g = window.__FV.scene.goals43; return !!(g && g.opened()); }, 6);
    let s = await S(page);
    ok(s.opened && row(s, 'g43_staff').state === 'done' && row(s, 'g43_fork').state === 'done' && (s.seen.g43_staff === 1 || s.seen.g43all === 1) && (s.seen.g43_fork === 1 || s.seen.g43all === 1), '읍 (hook): the chain opens with 직원 2명 and 지게차 ✓ (its crew), their markers written', { rows: s.rows.map((r) => r.id + ':' + r.state), seen: s.seen });
    await advance(page, 5);
    s = await S(page);
    ok((await gcoins(page)) === g0 && s.log.length === 0, 'the rows it already had paid nothing (coins from the chain unchanged over 5 s)', { coins: (await gcoins(page)) - g0, log: s.log });
    const held = await page.evaluate(() => ({ q: window.__qb.filter((k) => k === 'g43:open').length, due: window.__FV.scene.goals43.openDue, letter: !!(window.__FV.scene.v43.seen || {}).letter43 }));
    ok(held.letter || (held.q === 0 && held.due === true), 'the open banner waits while the letter is unread (BP-48)', held);
    await readLetter(page);
    await until(page, () => window.__FV.scene.goals43.shown.open >= 1, 25);
    await advance(page, 2);
    const bn = await page.evaluate(() => ({ q: window.__qb.filter((k) => k === 'g43:open').length, n: window.__FV.scene.goals43.shown.open }));
    ok(bn.q === 1 && bn.n === 1, 'then the open banner once, after the letter', bn);
    // the second load: no remap, the chain already open: no banner, nothing paid
    await page.evaluate(() => window.__FV.save());
    await page.reload({ waitUntil: 'load' });
    await enter(page);
    await advance(page, 5);
    s = await S(page);
    const e2 = await page.evaluate(() => { const gs = window.__FV.scene, G = gs.goals43; return { remapped: !!(G.info && G.info.remapped), coins: window.__gc.coins, open: G.shown.open, due: G.openDue, q: window.__qb.filter((k) => /^g43:/.test(k)) }; });
    ok(!e2.remapped && s.opened && row(s, 'g43_staff').state === 'done' && row(s, 'g43_fork').state === 'done' && e2.coins === 0 && e2.open === 0 && !e2.due && e2.q.length === 0, 'second load: no remap; the chain stays open with its ✓ rows; no open banner and no coins again', e2);
    const errs = log.errors.filter((e) => !/favicon/i.test(e));
    ok(errs.length === 0, 'E: 0 page errors', errs.slice(0, 5));
    await page.context().close();
  }

  // ================================================================== C: 360x640 en, the window with the chain
  if (!ONLY || ONLY === 'C') {
    console.log('— C: the v4.2 office village (office, bank, depot) opened, 360x640, en');
    const { page, log } = await boot(keysOf('v42_save_office_ttal.json'), { width: 360, height: 640 }, 'en');
    await promote(page, false);
    await until(page, () => { const g = window.__FV.scene.goals43; return !!(g && g.opened()); }, 6);
    await advance(page, 6);
    const p = await page.evaluate(() => { const G = window.__FV.v42.goals; G.open(); window.__step.run(0.6); return G.panel(); });
    const b = await book(page);
    const ids = [b.cur && b.cur.id].concat(b.next.map((r) => r.id), b.side.map((r) => r.id)).filter(Boolean);
    const texts = (p.texts || []).join(' | ');
    ok(p.open && p.fit && p.fit.maxY <= p.fit.bottom + 1 && p.fit.minX >= p.fit.left - 1 && p.fit.maxX <= p.fit.right + 1, 'the goal window with the chain fits 360x640 (every row and text inside)', p.fit);
    ok(!/g43_|obj_g43|\{\w+\}/.test(texts) && /depot/i.test(texts), 'English, no raw key or slot in it (' + texts.slice(0, 160) + ' …)', texts);
    ok(new Set(ids).size === ids.length, 'no row id listed twice', ids);
    const ob = await objKey(page);
    ok(ob && /^obj_g43:/.test(ob.key) && !/obj_g43|\{/.test(ob.text), 'the objective line in English: 「' + (ob && ob.text) + '」');
    await page.evaluate(() => window.__FV.v42.goals.close());
    const errs = log.errors.filter((e) => !/favicon/i.test(e));
    ok(errs.length === 0, 'C: 0 page errors', errs.slice(0, 5));
    await page.context().close();
  }
} catch (e) {
  fail++;
  console.log('  FAIL exception: ' + (e && e.stack ? e.stack : e));
} finally {
  await browser.close();
  await srv.close();
}
console.log(`postdepot: ${pass} passed, ${fail} failed  (wall ${Math.round((Date.now() - t0) / 1000)}s)`);
process.exit(fail ? 1 : 0);
