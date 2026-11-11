// (v4.3) 짐 이름표 + the HUD layout (designer: 「돈 옆에 인구수 · 다음 할 일은 바로 밑 가운데 · 납품 / 업무 / 마을 진도는 오른쪽 해
// 밑으로」 and 「촌장이 들고있는것이 무엇인지 · 정확하게 어디로」).
//   node tools/test/carry.mjs        (about 2 minutes; screenshots in docs/previews/screens_v43/carry_*.png)
// The pill: hidden with empty hands; ★ + the kinds by count + the bag (red 「가득」 when full); row 2 = the navigator's
// place (→ place · m) or why nowhere takes it; hidden in a panel / the overview; ChiefAura's star pin stays down while it
// shows; the same size on screen at zoom 0.7 and 1.5. The HUD: the population chip on the coin row right of the
// counter, the objective centred below, the right-hand column (정기 납품 · 업무 · 마을 진도) under the clock, right-
// aligned, without overlaps, at 412×915 ko and 360×640 en.
// ((v4.3 review) + the plate is a nine-slice on WebGL (no Graphics re-tessellated each frame); the kinds count the items
// still flying to him (no empty plate at the first pickup); a mixed load's row 2 says '+N곳' like the HUD chip; a pinned
// place (목표 창 / notice board) is named in row 2 only when it takes something in the bag; hidden in the office / card
// panels (v42PanelOpen), under an emote over his head, and on the place where the navigator's name plate stands; standing
// still nothing is rendered again, and no text is rendered twice for the same words and colour.)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, waitFor, sleep } from './pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = path.join(ROOT, 'tools', 'test', 'fixtures');
const SHOTS = path.join(ROOT, 'docs', 'previews', 'screens_v43');
fs.mkdirSync(SHOTS, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const T0 = Date.now();
const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const errors = [];

async function boot(fixture, vp, lang) {
  const t = fs.readFileSync(path.join(FIX, fixture), 'utf8'), o = JSON.parse(t);
  const q = o.keys ? { keys: o.keys } : { save: t };
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: vp, dpr: 1, locale: lang === 'en' ? 'en-US' : 'ko-KR' });
  await page.evaluate((q) => {
    localStorage.clear();
    if (q.keys) for (const k in q.keys) localStorage.setItem(k, q.keys[k]); else localStorage.setItem('frostVillage.save.v1', q.save);
    const st = q.keys && q.keys['frostVillage.settings.v1'] ? JSON.parse(q.keys['frostVillage.settings.v1']) : {};
    st.lang = q.lang; localStorage.setItem('frostVillage.settings.v1', JSON.stringify(st));
  }, Object.assign(q, { lang }));
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  await sleep(2500);
  const c = await page.$('canvas'); const b = await c.boundingBox();
  for (let i = 0; i < 12 && await page.evaluate(() => window.__FV.game.scene.isActive('Title')); i++) { await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height * 0.6); await sleep(1500); }
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player && window.__FV.game.scene.getScene('UI').ready, 180000);
  await page.evaluate(() => { try { if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1; } catch (e) { /* */ } });
  await sleep(2500);
  return { page, log };
}
const pill = (page) => page.evaluate(() => window.__FV.v42.carry.state());
const hud = (page) => page.evaluate(() => {
  const ui = window.__FV.game.scene.getScene('UI'), h4 = ui.hud4, h42 = ui.hud42;
  const box = (c, bg, oy) => c && c.visible ? { x: Math.round(c.x), y: Math.round(c.y), w: Math.round((bg && bg.width) || c.width), h: Math.round((bg && bg.height) || c.height) } : null;
  return { W: ui.W, coin: { x: Math.round(ui.coinBar.x), y: Math.round(ui.coinBar.y), w: Math.round(ui.coinBar.width) }, pop: box(ui.popBox, ui.popBg), obj: ui.objPanel.visible ? { x: Math.round(ui.objPanel.x), y: Math.round(ui.objPanel.y), w: Math.round(ui.objBg.width) } : null,
    clock: h4.clock.visible ? { x: Math.round(h4.clock.x), y: Math.round(h4.clock.y) } : null, order: box(h4.orderChip, h4.orderBg), work: box(h42.workChip, h42.workBg), rank: box(h4.rankChip, h4.rankBg) };
});

for (const run of [{ fx: 'v42_village_late.json', vp: { width: 412, height: 915 }, lang: 'ko', tag: 'ko412' }, { fx: 'v41_save_smart_46min.json', vp: { width: 360, height: 640 }, lang: 'en', tag: 'en360' }]) {
  console.log('== ' + run.tag + ' (' + run.fx + ')');
  const { page, log } = await boot(run.fx, run.vp, run.lang);
  // ---- the HUD
  const H = await hud(page);
  ok(H.pop && Math.abs(H.pop.y - H.coin.y) <= 2 && H.pop.x >= H.coin.x + H.coin.w + 4 && H.pop.x <= H.coin.x + H.coin.w + 30, '[' + run.tag + '] the population chip sits on the coin row, right of the counter', H);
  const col = [H.order, H.work, H.rank].filter(Boolean);
  ok(col.length >= 2, '[' + run.tag + '] the right-hand column shows (' + col.length + ' chips)', H);
  ok(col.every((c) => Math.abs(c.x + c.w - (H.W - 24)) <= 2), '[' + run.tag + '] …right-aligned under the clock', col);
  ok(col.every((c) => !H.clock || c.y - c.h / 2 > H.clock.y + 20), '[' + run.tag + '] …below the clock', { col, clock: H.clock });
  let sorted = true; for (let i = 1; i < col.length; i++) if (col[i].y - col[i].h / 2 < col[i - 1].y + col[i - 1].h / 2) sorted = false;
  ok(sorted, '[' + run.tag + '] …in order (정기 납품 · 업무 · 마을 진도) without overlaps', col);
  ok(col.every((c) => c.x > H.W / 2 - 40), '[' + run.tag + '] the left side under the coins is clear of chips', col);
  // ---- the pill (자동 줍기 off: else he picks up what lies around him right after the bag is emptied)
  await page.evaluate(() => { const F = window.__FV; F.v42.settings({ pickup: 'off' }); F.clearStack(); });
  // (just after the boot a busy machine can hold the frames back a few seconds: wait for the fade, then read)
  await sleep(800);
  let P = await pill(page);
  for (let i = 0; i < 20 && P.visible; i++) { await sleep(250); P = await pill(page); }
  ok(!P.visible, '[' + run.tag + '] empty hands: no pill', P);
  await page.evaluate(() => { const F = window.__FV; F.carry('item_bread', 5); F.carry('item_fish_cooked', 3); });
  await sleep(1500);
  P = await pill(page);
  const bread = run.lang === 'en' ? 'Bread 5' : '빵 5';
  for (let i = 0; i < 20 && !(P.visible && P.alpha > 0.9 && P.row1[0] === bread); i++) { await sleep(250); P = await pill(page); }
  ok(P.visible && P.alpha > 0.9 && P.row1[0] === bread, '[' + run.tag + '] carrying: the pill shows the biggest kind first (' + P.row1.join(' | ') + ')', P);
  ok(P.row1.some((s) => /3$/.test(s)), '[' + run.tag + '] …and the second kind', P);
  ok(P.row1.some((s) => /^8\/\d+$/.test(s)), '[' + run.tag + '] …and the bag (8/cap)', P);
  ok(P.row2 && /(^|\s)→ /.test(P.row2), '[' + run.tag + '] row 2 says where it goes: ' + P.row2, P);
  ok(P.plate === (P.webgl ? 'nine' : 'gfx'), '[' + run.tag + '] the plate is a nine-slice on WebGL (no Graphics redrawn each frame): ' + P.plate + ' / webgl ' + P.webgl, P);
  // ((review #6) a mixed load: another place takes some of it → '+N곳' as on the HUD chip; a place taking one kind → its name)
  const MX = await page.evaluate(() => { const N = window.__FV.v42.v.nav, d = N.dest; return { others: d ? d.others || 0 : 0, types: d && d.types ? d.types.slice() : [], n: d ? d.n : 0, more: N.chip() ? N.chip().more : 0, pill: window.__FV.v42.carry.state() }; });
  const moreTxt = (k) => (run.lang === 'en' ? '+' + k + ' more' : '+' + k + '곳');
  ok(!MX.others || (MX.pill.row2 && MX.pill.row2.endsWith(moreTxt(MX.others))), '[' + run.tag + '] …a mixed load: \'' + (MX.others ? moreTxt(MX.others) : '(one place)') + '\' when other kinds go elsewhere: ' + MX.pill.row2, MX);
  ok(!(MX.others && MX.types.length === 1) || (MX.pill.row2 && /^\S+.* \d+ → /.test(MX.pill.row2)), '[' + run.tag + '] …and which kind goes there when the place takes one kind', MX);
  // (the pin eases down over 0.2 s of game time: on a busy machine that takes a few frames more)
  let pin = 1; for (let i = 0; i < 20 && pin >= 0.2; i++) { pin = await page.evaluate(() => window.__FV.v42.v.aura.pinA); if (pin >= 0.2) await sleep(200); }
  ok(pin < 0.2, '[' + run.tag + '] ChiefAura\'s star pin stays down while the pill shows (' + pin.toFixed(2) + ')');
  await page.screenshot({ path: path.join(SHOTS, 'carry_' + run.tag + '_mixed.png') });
  // ((review #6, verify) a long row 2: the kind's name gives way when the row would pass about 3/4 of the screen (en:
  //  'Grilled fish 12 → Loading dock at Frost Station · 33 m +2 more'), and stays when it fits (ko)
  const LG = await page.evaluate(async () => {
    const F = window.__FV, N = F.v42.v.nav, c = F.v42.v.carry, G = F.scene.v4 && F.scene.v4.growth, d0 = N.active ? N.dest : null;
    if (!d0 || !d0.pad) return null;
    c.lastPad = null;
    N.dest = { type: 'item_fish_cooked', n: 12, pad: G && G.dockPad ? G.dockPad : d0.pad, sink: null, types: ['item_fish_cooked'], label: 'place_dock_stn', lp: null, others: 2 };
    N.pickT = 999;
    await new Promise((r) => setTimeout(r, 500));
    const s = F.v42.carry.state();
    N.pickT = 0;
    return { row2: s.row2, w: s.w, W: F.scene.scale.width };
  });
  if (LG) {
    const kindTxt = run.lang === 'en' ? 'Grilled fish 12 → ' : '구운 생선 12 → ';
    ok(LG.row2 && LG.row2.endsWith(moreTxt(2)) && (run.lang === 'en' ? !LG.row2.startsWith(kindTxt) : LG.row2.startsWith(kindTxt)) && LG.w * 0.92 <= LG.W * 0.8,
      '[' + run.tag + '] a long row 2: the kind\'s name ' + (run.lang === 'en' ? 'gives way' : 'stays when it fits') + ' (' + LG.row2 + ', ' + Math.round(LG.w * 0.92 / LG.W * 100) + '% of the screen)', LG);
  } else ok(false, '[' + run.tag + '] a long row 2 (no destination to test with)');
  await sleep(700);
  // ((review #5 / #14 / #15) standing still nothing renders again; no text is rendered twice for the same words + colour
  //  (Phaser's setColor re-renders even when nothing changed); walking, row 2's metres render once per change
  await page.evaluate(() => {
    const c = window.__FV.v42.v.carry, n = c._rn = { r2: 0, bag: 0, dup: 0 };
    const wrap = (o, k) => { const f = o.updateText; let last = null; o.updateText = function () { const key = this.text + '|' + this.style.color; if (key === last) n.dup++; last = key; n[k]++; if (k === 'r2') (n.seen || (n.seen = [])).push(this.text); return f.apply(this, arguments); }; };
    wrap(c.row2, 'r2'); wrap(c.txBag, 'bag');
  });
  await sleep(1200);
  const still = await page.evaluate(() => Object.assign({}, window.__FV.v42.v.carry._rn));
  //  (a re-planned route may change the metres once: never more, never the same words twice)
  ok(still.r2 <= 1 && still.bag === 0 && still.dup === 0, '[' + run.tag + '] standing still: nothing rendered again but a real change (' + JSON.stringify(still) + ')', still);
  await page.evaluate(() => window.__FV.carry('item_bread', 1));
  await sleep(500);
  const one = await page.evaluate(() => Object.assign({}, window.__FV.v42.v.carry._rn));
  ok(one.bag === 1, '[' + run.tag + '] one more item: the bag number rendered once (' + one.bag + ')', one);
  const before = await page.evaluate(() => { const p = window.__FV.scene.player; return [p.x, p.y]; });
  await page.evaluate(() => window.__FV.setInput(0.7, 0.35));
  await sleep(1800);
  await page.evaluate(() => window.__FV.setInput(0, 0));
  await sleep(300);
  const walk = await page.evaluate(() => Object.assign({}, window.__FV.v42.v.carry._rn, { row2: window.__FV.v42.carry.state().row2 }));
  ok(walk.dup === 0, '[' + run.tag + '] walking: row 2 rendered ' + walk.r2 + ' times, never twice for the same words (' + walk.dup + ' repeats)', walk);
  await page.evaluate((b) => { window.__FV.teleport(b[0], b[1]); }, before);
  await sleep(600);
  // the same size on screen at two zooms
  const scr = async (z) => { await page.evaluate((z) => { const p = window.__FV.scene.player; window.__FV.camera(p.x, p.y, z); }, z); await sleep(1500); const zz = await page.evaluate(() => window.__FV.scene.zoomCur || window.__FV.scene.cameras.main.zoom); const q = await pill(page); return q.scale * zz; };
  const a = await scr(0.7), b2 = await scr(1.5);
  ok(Math.abs(a - b2) / Math.max(a, b2) < 0.25, '[' + run.tag + '] about the same size on screen at zoom 0.7 and 1.5 (' + a.toFixed(2) + ' / ' + b2.toFixed(2) + ')');
  await page.evaluate(() => { const p = window.__FV.scene.player; window.__FV.camera(p.x, p.y, 1); });
  // a full bag
  await page.evaluate(() => { const F = window.__FV, p = F.scene.player; F.clearStack(); F.carry('item_plank', p.capacity); });
  await sleep(1200);
  P = await pill(page);
  const full = run.lang === 'en' ? 'full' : '가득';
  ok(P.row1.some((s) => s.endsWith(full)), '[' + run.tag + '] a full bag says ' + full + ' (' + P.row1.join(' | ') + ')', P);
  await page.screenshot({ path: path.join(SHOTS, 'carry_' + run.tag + '_full.png') });
  // ((review #4) a v4.2 panel (the office / depot panel, the '새로워진 것' card: ui.v42PanelOpen) hides it
  await page.evaluate(() => { window.__FV.game.scene.getScene('UI').v42PanelOpen = true; });
  await sleep(700);
  P = await pill(page);
  ok(!P.shown, '[' + run.tag + '] a v4.2 panel (v42PanelOpen) hides it', P);
  await page.evaluate(() => { window.__FV.game.scene.getScene('UI').v42PanelOpen = false; });
  await sleep(700);
  P = await pill(page);
  ok(P.shown, '[' + run.tag + '] …and it comes back after', P);
  // ((review #1) an emote over his head (the first-run tutorial's thumbs-up): the plate gives way, then comes back
  //  (the emote lasts 1 s of game time: on a busy machine the game runs slower than the clock, so wait for it to end)
  await page.evaluate(() => { const gs = window.__FV.scene; gs.life.bubbles.emote(gs.player, 'emote_thumbs', 1.0); });
  await sleep(450);
  P = await pill(page);
  ok(!P.shown, '[' + run.tag + '] an emote over his head: the plate gives way', P);
  let emo = true; for (let i = 0; i < 40 && emo; i++) { emo = await page.evaluate(() => { const gs = window.__FV.scene; return gs.life.bubbles.active.some((b) => b.who === gs.player); }); if (emo) await sleep(250); }
  await sleep(700);
  P = await pill(page);
  ok(!emo && P.shown, '[' + run.tag + '] …and comes back after it', P);
  // the overview (전체 지도) hides it (a menu that pauses the village covers it anyway)
  await page.evaluate(() => window.__FV.scene.toggleOverview());
  await sleep(1200);
  P = await pill(page);
  ok(!P.shown, '[' + run.tag + '] the overview hides it', P);
  await page.evaluate(() => window.__FV.scene.toggleOverview());
  await sleep(1500);
  P = await pill(page);
  ok(P.shown, '[' + run.tag + '] …and it comes back after', P);
  await page.evaluate(() => window.__FV.clearStack());
  await sleep(900);
  P = await pill(page);
  ok(!P.visible, '[' + run.tag + '] hands empty again: gone', P);
  // ((review #3 / #16) the first item still flying to him: the plate shows it at once (no empty plate), and the kinds
  //  always add up to the bag's number
  //  (read on the first frame the plate shows: the 0.3-s flight is game time, a busy machine runs it slower)
  const FL = await page.evaluate(() => new Promise((res) => {
    const F = window.__FV, gs = F.scene, p = gs.player;
    gs.spawnItemTo('item_bread', p.x + 80, p.y, p, true);
    let n = 0;
    const tick = () => {
      const s = F.v42.carry.state();
      if ((s.visible && s.alpha > 0) || ++n > 600) return res({ pill: s, count: p.stack.count, incoming: p.stack.incoming, frames: n });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  const bread1 = run.lang === 'en' ? 'Bread 1' : '빵 1';
  ok(FL.pill.visible && FL.pill.row1[0] === bread1, '[' + run.tag + '] the first item, the plate\'s first frame: ' + JSON.stringify(FL.pill.row1) + ' (still in the air: ' + FL.incoming + ')', FL);
  await sleep(600);
  // ((review #0) a pinned place (목표 창's walk / the notice board) that takes nothing in the bag: no '→' row
  const PN = await page.evaluate(() => {
    const F = window.__FV, gs = F.scene, p = gs.player, N = F.v42.v.nav, T = gs.tutorial, G = gs.v4 && gs.v4.growth;
    F.clearStack(); N.loadSig = null; F.carry('item_bread', 5);
    const away = (x, y) => {
      const far = (q) => !q || Math.hypot(q.x - x, (q.y - y) * 2) > 300;
      const d = T.destination('item_bread');
      return far(d && d.pad) && far(gs.foodBox && gs.foodBox.pad) && far(G && G.dockPad);
    };
    let spot = null;
    for (const [dx, dy] of [[700, 0], [-700, 0], [0, 450], [0, -450], [900, 400], [-900, -400]]) if (away(p.x + dx, p.y + dy)) { spot = { x: p.x + dx, y: p.y + dy }; break; }
    if (!spot) return null;
    N.pin({ x: spot.x, y: spot.y, name: 'TEST-PIN', icon: 'ui_icon_house', quiet: true, valid: () => true });
    return spot;
  });
  ok(!!PN, '[' + run.tag + '] (a spot away from where bread goes)', PN);
  await sleep(1200);
  let Q = await page.evaluate(() => ({ pill: window.__FV.v42.carry.state(), nav: window.__FV.v42.v.nav.state() }));
  ok(Q.nav.dest && Q.nav.dest.pinned && Q.pill.shown && !(Q.pill.row2 && Q.pill.row2.indexOf('→') >= 0), '[' + run.tag + '] a pin that takes nothing in the bag: no \'→\' row (' + Q.pill.row2 + ')', Q);
  // …a pinned place that does take it (an order's dock with its goods, else the place the bread goes): '→ place'
  const PT = await page.evaluate(() => {
    const F = window.__FV, gs = F.scene, N = F.v42.v.nav, T = gs.tutorial, G = gs.v4 && gs.v4.growth;
    N.unpin(true);
    if (G && G.active && G.dockPad && G.needOf('item_bread') > 0) { N.pin({ x: G.dockPad.x, y: G.dockPad.y, label: 'place_dock_stn', icon: 'item_bread', order: 'item_bread', valid: () => G.needOf('item_bread') > 0 }); return { order: true, name: N.placeName(N.pinned) }; }
    const d = T.destination('item_bread');
    if (!d || !d.pad) return null;
    N.pin({ x: d.pad.x, y: d.pad.y, name: 'TEST-PLACE', icon: 'item_bread', quiet: true, valid: () => true });
    return { order: false, name: 'TEST-PLACE' };
  });
  await sleep(1000);
  Q = await page.evaluate(() => ({ pill: window.__FV.v42.carry.state(), nav: window.__FV.v42.v.nav.state() }));
  ok(!PT || (Q.nav.dest && Q.nav.dest.pinned && Q.pill.row2 && Q.pill.row2.indexOf('→ ' + PT.name) >= 0), '[' + run.tag + '] a pinned place that takes the bread (' + (PT && PT.order ? 'the order\'s dock' : 'its own place') + '): ' + Q.pill.row2, { PT, Q });
  await page.evaluate(() => window.__FV.v42.v.nav.unpin(true));
  // ((review #2) on the place the load goes to, where the navigator's name plate stands: the pill gives way
  await page.evaluate(() => { const F = window.__FV; F.clearStack(); F.v42.v.nav.loadSig = null; F.carry('item_fish_cooked', 3); });
  await sleep(700);
  const AT = await page.evaluate(() => {
    const F = window.__FV, N = F.v42.v.nav, d = N.active ? N.dest : null;
    if (!d || !d.pad) return null;
    // (beside the place's pad, not on it: on it he would unload at once)
    const pad = d.pad, gd = (x, y) => Math.hypot(x - pad.x, (y - pad.y) * 2);
    for (const [dx, dy] of [[70, 0], [-70, 0], [85, 0], [-85, 0], [100, 0], [-100, 0], [0, 40], [0, -40], [0, 50], [0, -50]]) {
      const x = pad.x + dx, y = pad.y + dy;
      if (gd(x, y) < 105 && !(pad.contains && pad.contains(x, y, 12))) { F.teleport(x, y); return { x: Math.round(pad.x), y: Math.round(pad.y), at: [dx, dy], label: d.label }; }
    }
    return null;
  });
  await sleep(900);
  Q = await page.evaluate(() => { const N = window.__FV.v42.v.nav; return { pill: window.__FV.v42.carry.state(), badge: !!N.badge.visible, dest: N.state().dest, bag: window.__FV.scene.player.stack.count }; });
  ok(!!AT && Q.badge && !Q.pill.shown && Q.bag > 0, '[' + run.tag + '] beside the place where the navigator\'s name plate stands (' + (AT && AT.label) + '): the pill gives way', { AT, Q });
  await page.evaluate(() => { const F = window.__FV, p = F.scene.player; F.teleport(p.x + 500, p.y + 260); });
  await sleep(900);
  P = await pill(page);
  ok(P.shown, '[' + run.tag + '] …and comes back away from it', P);
  await page.evaluate(() => window.__FV.clearStack());
  errors.push(...log.errors);
  await page.close();
}
ok(errors.length === 0, 'no page errors', errors.slice(0, 5));
await browser.close();
srv.close && srv.close();
console.log('\ncarry: ' + pass + ' passed, ' + fail + ' failed  (wall ' + Math.round((Date.now() - T0) / 1000) + 's)');
process.exit(fail ? 1 : 0);
