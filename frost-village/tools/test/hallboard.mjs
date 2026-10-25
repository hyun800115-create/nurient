// (v4.2 fix, the designer's "마을회관 오늘의 부탁 … 통조림 내가 가져다 줘도 안 들어가지네") the notice board says where each
// request's things go and a tap on the request starts the 길 안내 there. Fixed-step clock, the v4.1 46-min save
// (정기 납품: 통조림 23/30 — the designer's request):
//   node tools/test/hallboard.mjs [--shots DIR]      (DIR: 390×844 phone screenshots of the board and the guide)
// Checks: every request row has a place and a spot · the order row names 서리역 짐 싣는 곳 and its spot is the
// station's 짐 싣는 곳 pad · the board shows '→ 서리역 짐 싣는 곳' · a tap on the row (a real touch) closes the board and
// starts the guide with an empty bag (chip, route, ring) · walking there ends the guide on arrival (toast), the cans
// he carries go onto the order there · a filled order ends a guide to it · a long press on the chip ends it · the
// pantry / food box / house plot rows lead to their places · the hall itself takes nothing · save + reload clean.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const SHOTS = args.indexOf('--shots') >= 0 ? path.resolve(args[args.indexOf('--shots') + 1]) : '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const SAVE = fs.readFileSync(path.join(HERE, 'fixtures', 'v41_save_smart_46min.json'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra).slice(0, 300) : '')); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 400) : '')); } };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
async function boot(save) {
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: 2 });
  await page.evaluate((sv) => { try { localStorage.clear(); if (sv) localStorage.setItem('frostVillage.save.v1', sv); } catch (e) { /* */ } }, save);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 180000);
  await sleep(2500);
  await installStepper(page);
  await page.evaluate(() => { if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1; });
  await advance(page, 1);
  return { page, log };
}
// a moment of real frames: the scale manager refreshes the canvas bounds a touch is mapped with (the fixed-step clock
// only steps the game), then back to the fixed clock
const settle = async (page) => {
  await page.evaluate(() => window.__FV.game.loop.wake());
  await sleep(1500);
  await page.evaluate(() => { window.__FV.game.loop.sleep(); const ui = window.__FV.game.scene.getScene('UI'); if (ui && ui.scale && ui.scale.updateBounds) ui.scale.updateBounds(); });
};
const shot = async (page, name) => {
  if (!SHOTS) return;
  await settle(page);
  await render(page, 4);
  await page.screenshot({ path: path.join(SHOTS, name), type: 'jpeg', quality: 86, timeout: 180000 });
  console.log('  shot ' + path.join(SHOTS, name));
};

let errors = [];
try {
  const { page, log } = await boot(SAVE);
  // the chief at the hall's board pad, empty-handed
  const at = await page.evaluate(() => {
    const F = window.__FV, gs = F.scene, H = gs.civic && gs.civic.hall;
    if (!H) return null;
    F.clearStack(); F.setInput(0, 0); F.teleport(H.boardPad.x + 300, H.boardPad.y + 200);
    return { hall: [Math.round(H.x), Math.round(H.y)], pad: [Math.round(H.boardPad.x), Math.round(H.boardPad.y)] };
  });
  ok(!!at, 'the save has a 마을회관 with its board', at);
  await advance(page, 1);
  // ---- 1. the board's lines: every request has a place and a spot
  const L = await page.evaluate(() => {
    const gs = window.__FV.scene, H = gs.civic.hall, g = gs.v4.growth, Lb = H.boardLines();
    return {
      reqs: Lb.requests.map((r) => ({ icon: r.icon, text: r.text, label: r.where ? r.where.label : null, spot: r.where && r.where.spot ? r.where.spot() : null, valid: r.where && r.where.valid ? r.where.valid() : null })),
      dock: g && g.dockPad ? [Math.round(g.dockPad.x), Math.round(g.dockPad.y)] : null, need: g ? g.needOf('item_can') : null,
    };
  });
  const order = L.reqs.find((r) => r.icon === 'item_can');
  ok(!!order && /통조림/.test(order.text), 'the board asks for 통조림 (정기 납품 23/30)', order && order.text);
  ok(!!order && order.label === 'place_dock_stn' && order.spot && Math.round(order.spot.x) === L.dock[0] && Math.round(order.spot.y) === L.dock[1] && order.valid === true, 'its place is 서리역 짐 싣는 곳 and its spot is the station\'s 짐 싣는 곳 pad', { order, dock: L.dock });
  ok(L.reqs.every((r) => r.label && r.spot), 'every request row has a place and a spot', L.reqs.map((r) => [r.icon, r.label, !!r.spot]));
  // ---- 2. the board panel shows '→ 서리역 짐 싣는 곳' + '길 안내'
  await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); ui.openBoard(); });
  await advance(page, 0.6);
  const B = await page.evaluate(() => {
    const ui = window.__FV.game.scene.getScene('UI'), h = ui.hud4, p = h && h.panel;
    if (!p) return null;
    const texts = [], taps = [];
    const walk = (c) => { for (const o of c.list || []) { if (o.type === 'Text') texts.push(o.text); if (o.input && o.listenerCount && o.listenerCount('pointerup') > 0 && o.width < 700) taps.push(o); if (o.list) walk(o); } };
    walk(p.c);
    // the order row's card: a real touch at its centre (UI logical px -> CSS px)
    const card = taps.find((o) => o.height >= 70 && o.height <= 80);
    const cam = ui.cameras.main, cv = ui.game.canvas.getBoundingClientRect();
    const m = card ? card.getWorldTransformMatrix() : null;
    // UI logical px -> canvas px (camera) -> CSS px (the canvas' size on the page)
    const tap = m ? { x: cv.left + ((m.tx - cam.scrollX) * cam.zoom + cam.x) * (cv.width / ui.game.canvas.width), y: cv.top + ((m.ty - cam.scrollY) * cam.zoom + cam.y) * (cv.height / ui.game.canvas.height) } : null;
    return { texts, nTaps: taps.length, tap, card: card ? { x: m.tx, y: m.ty, w: card.width, h: card.height } : null, cam: { zoom: cam.zoom, x: cam.x, sx: cam.scrollX }, canvas: [ui.game.canvas.width, ui.game.canvas.height, cv.width, cv.height] };
  });
  ok(!!B && B.texts.some((x) => x === '→ 서리역 짐 싣는 곳'), 'the board shows "→ 서리역 짐 싣는 곳" under the request', B && B.texts.filter((x) => /→|길 안내/.test(x)));
  ok(!!B && B.texts.filter((x) => x === '길 안내').length === L.reqs.length && B.texts.indexOf('눌러서 길 안내') >= 0, 'each request row has a "길 안내" tag (+ the hint)', B && { taps: B.nTaps, tap: B.tap, card: B.card, cam: B.cam, canvas: B.canvas });
  await shot(page, 'hallboard_1_board.jpg');
  // ---- 3. a real touch on the order row: the board closes, the guide starts (empty bag)
  if (!SHOTS) await settle(page);
  if (B && B.tap) await page.touchscreen.tap(B.tap.x, B.tap.y);
  await advance(page, 0.5);
  const G = await page.evaluate(() => {
    const F = window.__FV, gs = F.scene, N = F.v42.v.nav, ui = F.game.scene.getScene('UI');
    N.update(0);
    const st = N.state();
    return { open: !!ui.hud4.panel, pinned: st.pinned, active: st.active, dest: st.dest, chip: st.chip, routeLen: st.routeLen, ring: N.ring.visible, bag: gs.player.stack.count, toast: ui.toastText ? ui.toastText.text : null };
  });
  ok(G.open === false && !!G.pinned && G.pinned.x === L.dock[0] && G.pinned.y === L.dock[1], 'a tap on the row closes the board and pins the guide on 서리역 짐 싣는 곳', G.pinned);
  ok(G.bag === 0 && G.active && G.dest && G.dest.pinned && G.routeLen > 300, 'the guide runs with an empty bag (route ' + G.routeLen + ' px)', { active: G.active, dest: G.dest });
  ok(!!G.chip && /서리역 짐 싣는 곳/.test(G.chip.text), 'the chip says where: ' + (G.chip && G.chip.text), G.chip);
  await page.evaluate(() => { const gs = window.__FV.scene; gs.cameras.main.centerOn(gs.player.x, gs.player.y); });
  await advance(page, 1.5);
  await shot(page, 'hallboard_2_guide.jpg');
  // ---- 4. carry 7 cans there: the guide ends on arrival, the cans go onto the order
  const before = await page.evaluate(() => { const F = window.__FV, g = F.scene.v4.growth; F.carry('item_can', 7); return g.needOf('item_can'); });
  await advance(page, 0.5);
  const keepPin = await page.evaluate(() => { const st = window.__FV.v42.v.nav.state(); return { pinned: !!st.pinned, dest: st.dest }; });
  ok(keepPin.pinned && keepPin.dest && keepPin.dest.pinned, 'with cans in the bag the board\'s place stays the guide\'s place', keepPin);
  await page.evaluate(() => { const F = window.__FV, g = F.scene.v4.growth; F.teleport(g.dockPad.x, g.dockPad.y); F.setInput(0, 0); });
  await advance(page, 4);
  const A = await page.evaluate(() => { const F = window.__FV, gs = F.scene, g = gs.v4.growth, st = F.v42.v.nav.state(), ui = F.game.scene.getScene('UI'); return { pinned: st.pinned, need: g.needOf('item_can'), bag: gs.player.stack.countOf('item_can'), toast: ui.toastText ? ui.toastText.text : null }; });
  ok(!A.pinned, 'on arrival the guide ends', A);
  ok(A.need === Math.max(0, before - 7) && A.bag === 0, 'the 7 cans went onto the order at 서리역 짐 싣는 곳 (need ' + before + ' -> ' + A.need + ')', A);
  // ---- 5. a filled order ends a guide to it; a long press on the chip ends one
  const V = await page.evaluate(() => {
    const F = window.__FV, gs = F.scene, H = gs.civic.hall, N = F.v42.v.nav, g = gs.v4.growth;
    F.clearStack(); F.teleport(H.boardPad.x + 300, H.boardPad.y + 200);
    const w = H.whereOf('order', 'item_can');
    const pinned = H.guideTo(w);
    // the order is filled by others meanwhile
    const c = g.cards.find((q) => q.need.item_can); if (c) c.got.item_can = c.need.item_can;
    return { pinned, valid: w.valid() };
  });
  await advance(page, 1.2);
  const V2 = await page.evaluate(() => !!window.__FV.v42.v.nav.state().pinned);
  ok(V.pinned && V.valid === false && V2 === false, 'a filled order ends the guide to it', { V, stillPinned: V2 });
  const LP = await page.evaluate(() => {
    const F = window.__FV, gs = F.scene, H = gs.civic.hall, N = F.v42.v.nav, R = gs.civic.restaurant;
    const w = H.whereOf('rest', 'item_bread');
    const p1 = H.guideTo(w); N.update(0.1);
    const st1 = N.state();
    N.hideLoad(); N.update(0.1);
    return { p1, dest1: st1.dest, pantry: [Math.round(R.pantryPad.x), Math.round(R.pantryPad.y)], after: N.state().pinned, active: N.state().active };
  });
  ok(LP.p1 && LP.dest1 && LP.dest1.x === LP.pantry[0] && LP.dest1.y === LP.pantry[1] && LP.dest1.label === 'place_rest', 'the restaurant row leads to 큰 식당 식재료 칸', LP);
  ok(!LP.after && !LP.active, 'a long press on the chip ends the guide', LP);
  const OT = await page.evaluate(() => {
    const F = window.__FV, gs = F.scene, H = gs.civic.hall, N = F.v42.v.nav, out = {};
    const fb = H.whereOf('food');
    out.food = fb ? { label: fb.label, spot: fb.spot(), box: gs.foodBox && gs.foodBox.pad ? [Math.round(gs.foodBox.pad.x), Math.round(gs.foodBox.pad.y)] : null } : null;
    const st = H.housePlot();
    out.plot = st ? { id: st.id, x: st.dropX, y: st.dropY } : null;
    const hw = H.whereOf('homes');
    out.homes = hw ? { label: hw.label, spot: hw.spot() } : null;
    N.unpin();
    return out;
  });
  ok(!!OT.food && OT.food.label === 'place_food' && OT.food.box && Math.round(OT.food.spot.x) === OT.food.box[0], 'the hungry-miners row leads to the 광부 식량 상자', OT.food);
  ok(!OT.plot || (OT.homes && Math.round(OT.homes.spot.x) === Math.round(OT.plot.x) && OT.homes.label === 'place_plot_house'), 'the homes row leads to the nearest plot that takes a house (' + (OT.plot ? OT.plot.id : 'none open') + ')', OT);
  // ---- 6. the hall takes nothing: cans on the board pad stay in the bag
  const HT = await page.evaluate(() => { const F = window.__FV, gs = F.scene, H = gs.civic.hall; F.clearStack(); F.carry('item_can', 3); F.teleport(H.boardPad.x, H.boardPad.y); F.setInput(0, 0); return null; });
  await advance(page, 2);
  const HT2 = await page.evaluate(() => { const F = window.__FV, gs = F.scene, ui = F.game.scene.getScene('UI'); const r = { bag: gs.player.stack.countOf('item_can'), open: !!ui.hud4.panel }; ui.hud4.closePanel(true); F.clearStack(); return r; });
  ok(HT2.bag === 3 && HT2.open, 'standing on the board pad with cans opens the board (it says where); the hall keeps nothing', HT2);
  // ---- 7. save + reload: clean (the guide is not saved)
  const sv = await page.evaluate(() => { window.__FV.save(); return localStorage.getItem('frostVillage.save.v1'); });
  ok(!!sv && JSON.parse(sv).v === 7, 'saves as v7', sv ? JSON.parse(sv).v : null);
  errors = errors.concat(log.errors);
  await page.context().close();
  const again = await boot(sv);
  const R2 = await again.page.evaluate(() => { const F = window.__FV, gs = F.scene; return { hall: !!(gs.civic && gs.civic.hall), pinned: !!F.v42.v.nav.state().pinned, lines: gs.civic.hall.boardLines().requests.length }; });
  ok(R2.hall && !R2.pinned && R2.lines >= 0, 'reload: the hall and its board are there, no guide left over', R2);
  errors = errors.concat(again.log.errors);
  await again.page.context().close();
} catch (e) { fail++; console.log('FATAL', e && e.stack || e); }
await browser.close(); await srv.close();
for (const e of errors.slice(0, 6)) console.log('  error: ' + String(e).slice(0, 300));
ok(errors.length === 0, '0 page errors', errors.length);
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} hallboard: ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
