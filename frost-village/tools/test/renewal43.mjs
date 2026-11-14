// (v4.3 step B, WP-N) 「마을 새 단장」 letter and the 「새 지도 보기」 3-tap tour (build_plan.md §3.10), fixed-step clock:
//   node tools/test/renewal43.mjs [--shots DIR] [--only A|B|C|D]      (shots default: docs/previews/screens_v43/renewal_*.png)
// Old villages load through the real remap R43; the letter is asked for as players get it (window.__FV_LETTER43: an
// automated browser sees it only when asked, like the flag card).
//   A 412×915 ko  v43a3_late (a3.1, hall + office finished, the four workshops moved): the letter opens once after the
//                 load (bus letter {open}); its rows: the four workshops moved, the hall next to the office, the D21
//                 thank-you (hall · office), nothing about stage 4 or the bakery; the card fits (inside the screen, under
//                 the objective panel, clear of the right HUD column, every text and button inside); the village holds
//                 (v42PanelOpen, the flag card busy 'letter', G / T wait); a REAL tap on 「새 지도 보기」: the letter
//                 closes (seen.letter43 saved at once, bus letter {close, tour}), the tour starts at the hall (camera,
//                 ring, card with 「다음 ›」 / 「건너뛰기」, the finger tapping 「다음 ›」, nothing else takes a touch); two
//                 REAL taps on 「다음 ›」 (공방 거리, then the green and the shop), a third on 「다 봤어요」: tour43 saved,
//                 bus tour start / step 2 / step 3 / done 3, the camera back to the chief, the zoom back, the village
//                 free again. A reload: no letter, no tour, no bus event
//   B 360×640 ko  v4202_46min_admin (4.2.0.2, 읍 by admin, a pre-bakery village): the half-price stage-4 line and the
//                 bakery note in the letter, the bakery banner never shows; the card fits the smallest phone (shot);
//                 the flag maker's one-time card waits while the letter and the tour are up and comes after them;
//                 「건너뛰기」 at the first stop ends the tour (bus tour skip 1, tour43 saved)
//   C 412×915 en  v43_reprice_room (hall and office unfinished at the old price, a 창고 with room): the letter's numbers
//                 are refunds43's (2,705 coins, 20 planks in the 창고, spare materials included); the app closed before
//                 the letter was: the next load (no remap) shows it again; a REAL tap on 「Close」: letter43 + tour43
//                 saved, bus letter {close, tour: false} + tour {skip, 0}
//   D 412×915 ko  a new village: no letter, no run, letter43 / tour43 already seen, no bus event
//   0 page errors in every run
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render, until } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const FIX = path.join(HERE, 'fixtures');
const ai = process.argv.indexOf('--shots');
const SHOTS = ai > 0 && process.argv[ai + 1] ? path.resolve(process.argv[ai + 1]) : path.join(ROOT, 'docs', 'previews', 'screens_v43');
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? String(process.argv[i + 1] || '').toUpperCase() : null; })();
fs.mkdirSync(SHOTS, { recursive: true });
const SAVE_KEY = 'frostVillage.save.v1';
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg + (extra !== undefined && process.env.R43_VERBOSE ? '  — ' + JSON.stringify(extra).slice(0, 400) : '')); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra).slice(0, 900) : '')); } };
const info = (m) => console.log('  info ' + m);
const t0 = Date.now();

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const keysOf = (f) => { const d = JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8')); return d.keys ? d.keys : { [SAVE_KEY]: JSON.stringify(d) }; };

/** a page with `keys` in storage (null: a new village), the letter allowed (and the flag card when `flag`) */
async function boot(keys, vp, lang, opts = {}) {
  const P = await openPage(browser, srv.url + 'index.html', { viewport: vp, dpr: 1, locale: lang === 'en' ? 'en-US' : 'ko-KR' });
  await P.page.evaluate(([k, l]) => {
    localStorage.clear();
    if (k) for (const q in k) localStorage.setItem(q, k[q]);
    let s = {}; try { s = JSON.parse((k && k['frostVillage.settings.v1']) || '{}') || {}; } catch (e) { s = {}; }
    s.lang = l; localStorage.setItem('frostVillage.settings.v1', JSON.stringify(s));
  }, [keys, lang]);
  await P.page.reload({ waitUntil: 'load' });
  await enter(P.page, opts);
  return P;
}
/** title -> the village on the fixed clock; the letter (and the flag card) asked for before the scene is made */
async function enter(page, opts = {}) {
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title') && window.__FV43, 180000);
  await page.evaluate((o) => {
    window.__FV_LETTER43 = true;
    if (o.flag) window.__FV_FLAGMAKER = true;
    window.__bn = [];
  }, opts);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player && window.__FV.game.scene.getScene('UI').ready, 180000);
  await installStepper(page);
  await page.evaluate(() => {
    if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1;
    const U = window.__FV.game.scene.getScene('UI');
    if (U && !U.__r43) { const b = U.banner.bind(U); U.banner = (m, s, o) => { window.__bn.push(String(m) + ' / ' + String(s || '')); return b(m, s, o); }; U.__r43 = 1; }
  });
}
const R = (page) => page.evaluate(() => window.__FV43.renewal.state());
const bus = (page, name) => page.evaluate((n) => window.__FV43.recent().filter((e) => !n || e.name === n).map((e) => ({ n: e.name, d: e.data })), name);
const errorsOf = (log) => log.errors.filter((e) => !/favicon/i.test(e));
const stored = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('frostVillage.save.v1') || 'null'); } catch (e) { return null; } });
async function shot(page, name) { await render(page, 4); await page.screenshot({ path: path.join(SHOTS, name) }); }
/** a real touch at a point of the UI's logical 720-wide space. (A frame is drawn first: Phaser picks the topmost of the
 *  objects under a touch by the camera's last render list, and a player never touches a card before it was drawn) */
async function tapUI(page, x, y) {
  await render(page, 1);
  const cv = await page.$('canvas'); const bb = await cv.boundingBox(); const k = bb.width / 720;
  await page.touchscreen.tap(bb.x + x * k, bb.y + y * k);
  await sleep(200);
  await page.evaluate(() => window.__step.run(0.1));
}
const mid = (b) => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
/** the overlay as drawn (the tour's card, its buttons, the finger) */
const ov = (page) => page.evaluate(() => {
  const U = window.__FV.game.scene.getScene('UI'), O = U.onboardOv, r = O.rects();
  const B = (b) => (b && b.visible ? { x: Math.round(b.x), y: Math.round(b.y), label: b.text ? b.text.text : null } : null);
  return { mode: O.ob ? O.ob.mode : null, rects: r, next: B(O.nextBtn), skip: B(O.tourSkip), block: !!(O.block43 && O.block43.input && O.block43.input.enabled) };
});
/** the tour's frame: its card and buttons clear of the place (the ring) and above the toasts, the place on screen */
async function tourFrame(page, tag) {
  await render(page, 2);         // (the camera follows its target only on a drawn frame)
  const g = await page.evaluate(() => {
    const U = window.__FV.game.scene.getScene('UI'), O = U.onboardOv, r = O.rects() || {};
    const sp = (x, y) => { const p = U.worldToScreen(x, y); return [Math.round(p.x), Math.round(p.y)]; };
    const T = window.__FV43.renewal.state().run.tour;
    return { W: U.W, H: U.H, card: r.card, target: r.target, ring: T && T.ring ? sp(T.ring.x, T.ring.y) : null, next: O.nextBtn.visible ? [O.nextBtn.x, O.nextBtn.y] : null, skip: O.tourSkip.visible ? [O.tourSkip.x, O.tourSkip.y] : null, toastTop: U.H - 230 - 32 };
  });
  const over = (a, b) => !!(a && b && a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]);
  ok(g.card && g.ring && g.ring[0] > 0 && g.ring[0] < g.W && g.ring[1] > 200 && g.ring[1] < g.card[1] && !over(g.card, g.target), '[' + tag + '] the place (ring at ' + g.ring + ') on screen above the coach card, the card clear of it', g);
  ok(g.next && g.skip && g.next[1] + 32 < g.toastTop && g.skip[1] + 32 < g.toastTop, '[' + tag + '] 「다음 ›」 / 「건너뛰기」 above the toast line', g);
  return g;
}
const world = (page) => page.evaluate(() => {
  const gs = window.__FV.scene, U = window.__FV.game.scene.getScene('UI'), f = gs.camFocus;
  const vf = gs.flags, fm = U.flagMaker;
  return {
    focus: f ? { x: Math.round(f.x), y: Math.round(f.y) } : null, zoom: gs.zoomTarget, v42Open: !!U.v42PanelOpen, isOpen: !!(U.renewal43 && U.renewal43.isOpen),
    flagBusy: vf ? vf.busy() : null, flagShown: vf ? !!vf.cardShown : null, flagCard: !!(fm && (fm.c || fm.cardC)),
    g43Free: gs.goals43 && gs.goals43.screenFree ? gs.goals43.screenFree() : null, g43Open: gs.goals43 && gs.goals43.shown ? gs.goals43.shown.open : null,
    tasteBlocked: gs.eupTaste && gs.eupTaste.blocked ? gs.eupTaste.blocked() : 'n/a',
    seen: gs.v43 && gs.v43.seen ? Object.assign({}, gs.v43.seen) : null, player: [Math.round(gs.player.x), Math.round(gs.player.y)],
  };
});

/** the letter as laid out: inside the screen, under the objective panel, clear of the right HUD column, every text and
 *  both buttons inside the card */
async function letterCheck(page, tag) {
  const c = await page.evaluate(() => {
    const U = window.__FV.game.scene.getScene('UI'), st = U.renewal43.state();
    const out = { st, W: U.W, H: U.H, col: [] };
    for (let i = 0; i < (U.rightN || 0); i++) { const o = U.rightBoxes[i]; out.col.push({ l: Math.round(o.l), t: Math.round(o.t), b: Math.round(o.b) }); }
    out.obj = U.objPanel && U.objPanel.visible ? { y: Math.round(U.objPanel.y) } : null;
    return out;
  });
  const st = c.st, B = st.box;
  ok(st.open && st.shown && B, '[' + tag + '] the letter is open and drawn', st);
  if (!B) return c;
  ok(B[0] >= 8 && B[2] <= c.W - 8 && B[1] >= 0 && B[3] <= c.H - 120, '[' + tag + '] …inside the screen, above the bottom HUD (' + B.join(',') + ' of ' + c.W + '×' + c.H + ')', B);
  ok(!c.obj || B[1] >= c.obj.y + 31, '[' + tag + '] …under the objective panel', { B, obj: c.obj });
  const hits = c.col.filter((o) => B[2] > o.l - 4 && B[1] < o.b && B[3] > o.t);
  ok(hits.length === 0, '[' + tag + '] …clear of the right HUD column (' + c.col.length + ' chips' + (c.col.length ? '' : ': none showing') + ')', { B, col: c.col });
  const out = st.texts.filter((x) => x.l < B[0] + 2 || x.r > B[2] - 2 || x.t < B[1] + 2 || x.b > B[3] - 2);
  ok(st.texts.length >= 5 && out.length === 0, '[' + tag + '] …every text inside the card (' + st.texts.length + ')', out.length ? out : st.texts.map((x) => x.s));
  const inB = (b) => b && b[0] >= B[0] && b[2] <= B[2] && b[1] >= B[1] && b[3] <= B[3];
  ok(st.btns && inB(st.btns.tour) && inB(st.btns.close) && st.btns.tour[0] >= st.btns.close[2], '[' + tag + '] …「닫기」 and 「새 지도 보기」 side by side inside it', st.btns);
  const words = st.texts.map((x) => x.s).join(' ');
  ok(!/\d+\.\d+\.\d/.test(words) && !/\bv\s?\d/i.test(words) && !/버전/.test(words), '[' + tag + '] …no version number in its words');
  return c;
}

const errs = [];
const want = (s) => !ONLY || ONLY.indexOf(s) >= 0;
try {
  // ================================================================== A
  if (want('A')) {
    console.log('— A: 412×915 ko, v43a3_late (the full 3-tap tour)');
    const { page, log } = await boot(keysOf('v43a3_late.json'), { width: 412, height: 915 }, 'ko');
    const a0 = await R(page);
    ok(a0.allowed && a0.run && a0.run.phase === 'wait' || (a0.run && a0.run.phase === 'letter'), 'remapped at this load: the letter is due (a run made at the after-load seam)', a0);
    await advance(page, 2);
    const a1 = await R(page);
    const remap = (await bus(page, 'remap')).map((e) => e.d && e.d.ok);
    ok(remap.join() === 'true' && a1.run && a1.run.phase === 'letter' && a1.card.open && a1.card.shown, 'R43 ran (bus remap ok) and the letter is open 2 s after the load', { remap, a1: a1.run && a1.run.phase });
    const keys = a1.run.rows.map((r) => r.key);
    ok(keys.join() === 'moved,hall,thanks', 'its rows: the moved workshops, the hall, the D21 thank-you (no refund, no stage 4, no bakery)', a1.run.rows);
    const txt = a1.run.rows.map((r) => r.text + ' ' + (r.sub || '')).join(' | ');
    ok(/대장간 · 창고 · 통조림 공장 · 잡화점이 정해진 자리로/.test(txt) && /모두 그대로/.test(txt), '…「대장간 · 창고 · 통조림 공장 · 잡화점이 정해진 자리로 옮겼어요」 + 단계 · 물건 · 일꾼 그대로', txt);
    ok(/마을회관은 촌장님 사무실 옆/.test(txt) && /예전 값으로 지은 마을회관 · 촌장 사무실은 그대로예요/.test(txt), '…the hall moved next to the office; 「예전 값으로 지은 마을회관 · 촌장 사무실은 그대로예요. 고마워요!」', txt);
    const evL = await bus(page, 'letter');
    ok(evL.length === 1 && evL[0].d.state === 'open', 'bus: letter {open} once', evL);
    await letterCheck(page, 'A 412×915 ko');
    await shot(page, 'renewal_letter_412x915_ko.png');
    // the village holds under it
    const h1 = await world(page);
    ok(h1.v42Open && h1.isOpen && h1.flagBusy === 'letter', 'the village holds: ui.v42PanelOpen, ui.renewal43.isOpen, the flag card busy \'letter\'', h1);
    ok(h1.g43Free === false || h1.g43Free === null, 'G\'s open banner waits (screenFree false)', h1.g43Free);
    ok(h1.tasteBlocked !== null, 'T cannot start (blocked: ' + h1.tasteBlocked + ')', h1.tasteBlocked);
    // a touch on the village does not walk the chief
    const p0 = h1.player;
    const cv0 = await page.$('canvas'); const bb0 = await cv0.boundingBox();
    await page.mouse.move(bb0.x + bb0.width * 0.5, bb0.y + bb0.height * 0.85); await page.mouse.down();
    await page.mouse.move(bb0.x + bb0.width * 0.8, bb0.y + bb0.height * 0.85, { steps: 4 });
    await page.evaluate(() => window.__step.run(1));
    await page.mouse.up();
    const h1b = await world(page);
    ok(Math.hypot(h1b.player[0] - p0[0], h1b.player[1] - p0[1]) < 4 && (await R(page)).card.open, 'a drag on the village under the letter walks nobody and closes nothing', { p0, p1: h1b.player });
    // a REAL tap on 「새 지도 보기」
    const bt = (await R(page)).card.btns.tour;
    const zoom0 = h1.zoom;
    await tapUI(page, ...mid(bt));
    await page.evaluate(() => window.__step.run(0.6));
    const a2 = await R(page), w2 = await world(page), o2 = await ov(page), s2 = await stored(page);
    ok(!a2.card.shown && a2.run.phase === 'tour' && a2.run.seen.letter43 && !a2.run.seen.tour43, 'a REAL tap on 「새 지도 보기」: the letter closes (letter43), the tour runs', a2.run);
    ok(s2 && s2.v43 && s2.v43.seen && s2.v43.seen.letter43 === 1 && !s2.v43.seen.tour43, '…letter43 is in the stored save at once', s2 && s2.v43);
    const evA = (await bus(page)).filter((e) => e.n === 'letter' || e.n === 'tour').map((e) => e.n + ':' + e.d.state + (e.d.n !== undefined ? e.d.n : '') + (e.d.tour !== undefined ? '/' + e.d.tour : ''));
    ok(evA.join() === 'letter:open,letter:close/true,tour:start1', 'bus: letter open, letter close {tour}, tour start 1', evA);
    const T1 = a2.run.tour;
    ok(T1 && T1.stop === 'hall' && /마을회관은 촌장님 사무실 바로 옆/.test(T1.card.l1) && /세금 상자/.test(T1.card.l2) && T1.card.nextLabel === '다음 ›', 'stop 1: the hall and the office (the hall is built: its tax box and board out front)', T1);
    ok(o2.mode === 'tour43' && o2.rects && o2.rects.card && o2.next && o2.skip && o2.next.label === '다음 ›' && o2.block, 'the overlay draws the card with 「다음 ›」 / 「건너뛰기」; the blocker under it is on', o2);
    ok(w2.focus && Math.abs(w2.focus.x - 390) < 40 && w2.focus.y > 760 && T1.ring && w2.zoom <= 1.0001 && w2.v42Open, 'the camera looks between the hall (180, 760) and the office (600, 640), the ring at the hall front, zoom ≤ 1 (was ' + zoom0 + ')', { focus: w2.focus, ring: T1.ring, zoom: w2.zoom });
    await page.evaluate(() => window.__step.run(1.2));
    await tourFrame(page, 'A stop 1');
    const o2b = await ov(page);
    const nb = o2b.next, fb = o2b.rects && o2b.rects.finger;
    ok(fb && nb && fb[0] < nb.x + 100 && fb[2] > nb.x - 100 && fb[1] < nb.y + 60 && fb[3] > nb.y - 60, 'the finger taps 「다음 ›」', { finger: fb, next: nb });
    await shot(page, 'renewal_tour1_412x915_ko.png');
    // the HUD takes no touch during the tour (the goal window chip / settings): a tap on the objective panel opens nothing
    await tapUI(page, 360, 62 + 88);
    const hud = await page.evaluate(() => { const U = window.__FV.game.scene.getScene('UI'); return { panel: !!U.panelOpen, goals: !!(U.goals && U.goals.c), tour: window.__FV43.renewal.state().run.phase }; });
    ok(!hud.panel && !hud.goals && hud.tour === 'tour', 'a tap on the HUD during the tour opens nothing', hud);
    // two REAL taps on 「다음 ›」
    await tapUI(page, o2b.next.x, o2b.next.y);
    const a3 = await R(page), w3 = await world(page);
    ok(a3.run.tour && a3.run.tour.stop === 'work' && /공방 거리/.test(a3.run.tour.card.l1) && w3.focus && Math.abs(w3.focus.x - 267) < 40 && w3.focus.y > 1527, 'tap 1 on 「다음 ›」: stop 2, 공방 거리 (대장간 · 창고)', { tour: a3.run.tour, focus: w3.focus });
    await page.evaluate(() => window.__step.run(1.5));
    await tourFrame(page, 'A stop 2');
    await shot(page, 'renewal_tour2_412x915_ko.png');
    // something else takes the camera for a moment (a site that finishes pans to it for 1.6 s): the stop's place comes back
    const cam = await page.evaluate(() => {
      const gs = window.__FV.scene, fx = (f) => (f ? { x: Math.round(f.x), y: Math.round(f.y) } : null);
      gs.focusCamera(gs.player.x, gs.player.y - 40, 1600);
      window.__step.run(0.5);
      const mid = fx(gs.camFocus);
      window.__step.run(1.6);
      return { mid, after: fx(gs.camFocus), look: window.__FV43.renewal.state().run.tour.look, chief: [Math.round(gs.player.x), Math.round(gs.player.y - 40)] };
    });
    ok(cam.mid && cam.mid.x === cam.chief[0] && cam.after && cam.look && cam.after.x === cam.look.x && cam.after.y === cam.look.y, 'another 1.6 s camera pan during a stop: the stop\'s place comes back after it', cam);
    const o3 = await ov(page);
    await tapUI(page, o3.next.x, o3.next.y);
    await page.evaluate(() => window.__step.run(0.5));
    const a4 = await R(page), w4 = await world(page), o4 = await ov(page);
    ok(a4.run.tour && a4.run.tour.stop === 'green' && /마을 마당/.test(a4.run.tour.card.l1) && a4.run.tour.card.nextLabel === '다 봤어요' && o4.next && o4.next.label === '다 봤어요', 'tap 2: stop 3, the village green; its button says 「다 봤어요」', { tour: a4.run.tour, next: o4.next });
    ok(w4.focus && Math.abs(w4.focus.x - 1053) < 60 && w4.focus.y > 1400 && !a4.run.tour.panned, '…the camera on the green (the 한마당 reserve) first', w4.focus);
    await page.evaluate(() => window.__step.run(3.5));
    const a5 = await R(page), w5 = await world(page);
    ok(a5.run.tour.panned && w5.focus && w5.focus.y < 1200 && Math.abs(w5.focus.x - 1210) < 120, '…then it glides on to the first shop', { focus: w5.focus, ring: a5.run.tour.ring });
    await page.evaluate(() => window.__step.run(1.5));
    await tourFrame(page, 'A stop 3');
    await shot(page, 'renewal_tour3_412x915_ko.png');
    const o5 = await ov(page);
    await tapUI(page, o5.next.x, o5.next.y);
    await page.evaluate(() => window.__step.run(0.6));
    const a6 = await R(page), w6 = await world(page), o6 = await ov(page), s6 = await stored(page);
    ok(a6.run && a6.run.phase === 'done' && a6.run.seen.tour43 && s6.v43.seen.tour43 === 1, 'tap 3 on 「다 봤어요」: the tour is done, tour43 saved at once', { run: a6.run && a6.run.phase, saved: s6.v43.seen });
    ok(!w6.focus && Math.abs(w6.zoom - zoom0) < 1e-6 && !w6.v42Open && !w6.isOpen && !o6.next && !o6.block && o6.mode !== 'tour43', 'the camera back to the chief, the zoom back, the village free (no flag, no card, no blocker)', { w6, o6 });
    const evT = (await bus(page, 'tour')).map((e) => e.d.state + e.d.n);
    ok(evT.join() === 'start1,step2,step3,done3', 'bus: tour start 1, step 2, step 3, done 3', evT);
    ok(a6.run.stats.opens === 1 && a6.run.stats.closes === 1 && a6.run.stats.done === 1 && a6.run.stats.skips === 0, 'once each: open, close, done', a6.run.stats);
    // a reload: nothing
    await page.reload({ waitUntil: 'load' });
    await enter(page);
    await advance(page, 4);
    const a7 = await R(page), ev7 = (await bus(page)).filter((e) => e.n === 'letter' || e.n === 'tour' || e.n === 'remap');
    ok(!a7.due && !a7.run && !a7.card.open && !ev7.length, 'a reload: no remap, no letter, no tour, nothing on the bus', { a7, ev7 });
    errs.push(...errorsOf(log).map((e) => 'A ' + e));
    await page.context().close();
  }

  // ================================================================== B
  if (want('B')) {
    console.log('— B: 360×640 ko, v4202_46min_admin (읍, pre-bakery): half price, bakery note, the flag card after, 건너뛰기');
    const { page, log } = await boot(keysOf('v4202_46min_admin.json'), { width: 360, height: 640 }, 'ko', { flag: true });
    await advance(page, 2);
    const b1 = await R(page);
    const keys = b1.run ? b1.run.rows.map((r) => r.key) : [];
    ok(b1.run && b1.run.phase === 'letter' && b1.run.bakery && keys.indexOf('bakery') >= 0 && keys.indexOf('s4half') >= 0, 'the letter is open with the bakery note and the half-price line', b1.run);
    const s4 = b1.run.rows.find((r) => r.key === 's4half'), bk = b1.run.rows.find((r) => r.key === 'bakery');
    ok(s4 && s4.text === '4단 「눈꽃마을 시장」은 반값에 지어요 · 차례가 오면 목표 창에 나와요', '…「4단 「눈꽃마을 시장」은 반값에 지어요 · 차례가 오면 목표 창에 나와요」 (the addendum\'s wording)', s4);
    ok(bk && /빵집이 밀밭 옆 길목으로 이사했어요/.test(bk.text), '…the bakery note folded in', bk);
    const pr = await page.evaluate(() => { const gs = window.__FV.scene; return { s4half: !!gs.progress.flags.s4half, movedNow: !!gs.progress.bakeryMovedNow, bakery43: !!gs.progress.flags.bakery43 }; });
    ok(pr.s4half && pr.bakery43 && !pr.movedNow, 'progress: s4half (R43), bakery43 (the bakery came at this load), bakeryMovedNow cleared by the letter', pr);
    await letterCheck(page, 'B 360×640 ko');
    await shot(page, 'renewal_letter_360x640_ko.png');
    // the flag card waits while the letter is up (25 s), and while the tour runs
    await advance(page, 25);
    const b2 = await world(page);
    ok(b2.isOpen && b2.flagBusy === 'letter' && !b2.flagShown && !b2.flagCard, '25 s under the letter: the flag maker\'s card has not come (busy \'letter\')', b2);
    ok(!(await page.evaluate(() => window.__bn.some((s) => /빵집이 문을 열었어요/.test(s)))), 'the bakery banner never showed', await page.evaluate(() => window.__bn));
    ok(b2.g43Open === 0 || b2.g43Open === null, 'G\'s open banner was not shown under the letter', b2.g43Open);
    const bt = (await R(page)).card.btns.tour;
    await tapUI(page, ...mid(bt));
    await page.evaluate(() => window.__step.run(0.6));
    const o1 = await ov(page);
    ok(o1.mode === 'tour43' && o1.skip && o1.next, 'the tour at 360×640: 「다음 ›」 and 「건너뛰기」 under its card', o1);
    const T1 = (await R(page)).run.tour;
    // (this 읍 village has no hall: its plot is open (village complete), so the hall can be built there now — never
    //  「마을이 다 갖춰지면」 to a village that is complete)
    const hallOpen = await page.evaluate(() => { const s = window.__FV.scene.sites.w_hall; return !!(s && s.shown); });
    ok(T1 && T1.stop === 'hall' && (hallOpen ? T1.card.l2 === '이제 바로 여기에 지을 수 있어요' : /마을이 다 갖춰지면/.test(T1.card.l2)), 'stop 1 says the hall can be built there' + (hallOpen ? ' now (its plot is open)' : ' once the village is complete'), { l2: T1 && T1.card.l2, hallOpen });
    await page.evaluate(() => window.__step.run(1.5));
    await tourFrame(page, 'B 360×640 stop 1');
    await shot(page, 'renewal_tour1_360x640_ko.png');
    await advance(page, 5);
    ok(!(await world(page)).flagShown, 'the flag card waits during the tour too');
    await tapUI(page, o1.skip.x, o1.skip.y);
    await page.evaluate(() => window.__step.run(0.5));
    const b3 = await R(page), w3 = await world(page);
    const evT = (await bus(page, 'tour')).map((e) => e.d.state + e.d.n);
    ok(b3.run.phase === 'done' && b3.run.seen.tour43 && evT.join() === 'start1,skip1' && !w3.isOpen && !w3.v42Open && !w3.focus, 'a REAL tap on 「건너뛰기」 at stop 1 ends it: bus tour start 1, skip 1; tour43; the village free', { evT, w3 });
    // the flag card comes after the letter
    const came = await until(page, () => { const vf = window.__FV.scene.flags; return !!(vf && vf.cardShown); }, 60);
    const b4 = await world(page);
    ok(came && b4.flagShown, 'then the flag maker\'s one-time card comes (letter → flag card)', b4);
    errs.push(...errorsOf(log).map((e) => 'B ' + e));
    await page.context().close();
  }

  // ================================================================== C
  if (want('C')) {
    console.log('— C: 412×915 en, v43_reprice_room (the refunds), closed before reading, 「Close」');
    const { page, log } = await boot(keysOf('v43_reprice_room.json'), { width: 412, height: 915 }, 'en');
    await advance(page, 2);
    const c1 = await R(page);
    const rf = await page.evaluate(() => window.__FV.scene.v43.refunds43);
    ok(rf && rf.coins === 2705 && rf.wh.item_plank === 20 && rf.items.item_plank === 21 && rf.items.item_ingot === 10, 'refunds43 as R43 paid: 2,705 coins, 21 planks + 10 ingots spare, 20 planks into the 창고', rf);
    const keys = c1.run ? c1.run.rows.map((r) => r.key) : [];
    ok(c1.run && c1.run.phase === 'letter' && keys.join() === 'moved,hall,office,refund,bakery', 'its rows: moved, the hall goes on, the office goes on, the refund (and the bakery note: a pre-bakery village)', keys);
    const ref = c1.run.rows.find((r) => r.key === 'refund');
    ok(ref && ref.text === 'Prices went down: 2,705 coins came back to you' && ref.sub === 'Spare materials sold are included · the spare 20 planks went into the warehouse', 'the refund row says refunds43\'s numbers: 2,705 coins; 20 planks in the 창고; the rest sold into the coins', ref);
    await letterCheck(page, 'C 412×915 en');
    await shot(page, 'renewal_letter_412x915_en.png');
    // the stored village after a few seconds: on the new map, the letter unread
    await advance(page, 6);
    const s1 = await stored(page);
    ok(s1 && s1.lv === 43 && s1.v43 && s1.v43.lay === 2 && s1.v43.refunds43 && !(s1.v43.seen && s1.v43.seen.letter43), 'stored on the new map with the letter unread (the marker is written on close only)', s1 && s1.v43);
    // the app closed before the letter was: the next load shows it again (no remap this time)
    await page.reload({ waitUntil: 'load' });
    await enter(page);
    await advance(page, 2);
    const c2 = await R(page), rm2 = await bus(page, 'remap');
    ok(!rm2.length && c2.run && c2.run.phase === 'letter' && c2.card.shown, 'the next load (no remap): the unread letter opens again', { rm2, run: c2.run && c2.run.phase });
    const bc = c2.card.btns.close;
    await tapUI(page, ...mid(bc));
    await page.evaluate(() => window.__step.run(0.5));
    const c3 = await R(page), s3 = await stored(page), w3 = await world(page);
    const ev = (await bus(page)).filter((e) => e.n === 'letter' || e.n === 'tour').map((e) => e.n + ':' + e.d.state + (e.d.n !== undefined ? e.d.n : '') + (e.d.tour !== undefined ? '/' + e.d.tour : ''));
    ok(c3.run.phase === 'done' && s3.v43.seen.letter43 === 1 && s3.v43.seen.tour43 === 1 && !w3.isOpen && !w3.v42Open, 'a REAL tap on 「Close」: letter43 and tour43 saved, the village free', { seen: s3.v43.seen, w3 });
    ok(ev.join() === 'letter:open,letter:close/false,tour:skip0', 'bus: letter open, letter close {tour: false}, tour skip 0', ev);
    errs.push(...errorsOf(log).map((e) => 'C ' + e));
    await page.context().close();
  }

  // ================================================================== D
  if (want('D')) {
    console.log('— D: 412×915 ko, a new village');
    const { page, log } = await boot(null, { width: 412, height: 915 }, 'ko');
    await advance(page, 5);
    const d1 = await R(page), w1 = await world(page), ev = (await bus(page)).filter((e) => e.n === 'letter' || e.n === 'tour' || e.n === 'remap');
    ok(d1.allowed && !d1.due && !d1.run && !d1.card.open && !w1.isOpen && !ev.length, 'a new village: no letter, no run, nothing on the bus', { d1, ev });
    ok(w1.seen && w1.seen.letter43 === 1 && w1.seen.tour43 === 1, '…its v43 holder has letter43 and tour43 already', w1.seen);
    errs.push(...errorsOf(log).map((e) => 'D ' + e));
    await page.context().close();
  }
} catch (e) {
  fail++;
  console.log('  FAIL threw: ' + (e && e.stack ? e.stack : e));
} finally {
  ok(!errs.length, '0 page errors', errs.slice(0, 6));
  await browser.close();
  await srv.close();
}
console.log('shots: ' + SHOTS);
console.log('renewal43: ' + pass + ' passed, ' + fail + ' failed (' + Math.round((Date.now() - t0) / 1000) + ' s)');
process.exit(fail ? 1 : 0);
