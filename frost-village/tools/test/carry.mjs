// (v4.3) 짐 이름표 + the HUD layout (designer: 「돈 옆에 인구수 · 다음 할 일은 바로 밑 가운데 · 납품 / 업무 / 마을 진도는 오른쪽 해
// 밑으로」 and 「촌장이 들고있는것이 무엇인지 · 정확하게 어디로」).
//   node tools/test/carry.mjs        (about 2 minutes; screenshots in docs/previews/screens_v43/carry_*.png)
// The pill: hidden with empty hands; ★ + the kinds by count + the bag (red 「가득」 when full); row 2 = the navigator's
// place (→ place · m) or why nowhere takes it; hidden in a panel / the overview; ChiefAura's star pin stays down while it
// shows; the same size on screen at zoom 0.7 and 1.5. The HUD: the population chip on the coin row right of the
// counter, the objective centred below, the right-hand column (정기 납품 · 업무 · 마을 진도) under the clock, right-
// aligned, without overlaps, at 412×915 ko and 360×640 en.
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
  await sleep(800);
  let P = await pill(page);
  ok(!P.visible, '[' + run.tag + '] empty hands: no pill', P);
  await page.evaluate(() => { const F = window.__FV; F.carry('item_bread', 5); F.carry('item_fish_cooked', 3); });
  await sleep(1500);
  P = await pill(page);
  const bread = run.lang === 'en' ? 'Bread 5' : '빵 5';
  ok(P.visible && P.alpha > 0.9 && P.row1[0] === bread, '[' + run.tag + '] carrying: the pill shows the biggest kind first (' + P.row1.join(' | ') + ')', P);
  ok(P.row1.some((s) => /3$/.test(s)), '[' + run.tag + '] …and the second kind', P);
  ok(P.row1.some((s) => /^8\/\d+$/.test(s)), '[' + run.tag + '] …and the bag (8/cap)', P);
  ok(P.row2 && P.row2.startsWith('→ '), '[' + run.tag + '] row 2 says where it goes: ' + P.row2, P);
  // (the pin eases down over 0.2 s of game time: on a busy machine that takes a few frames more)
  let pin = 1; for (let i = 0; i < 20 && pin >= 0.2; i++) { pin = await page.evaluate(() => window.__FV.v42.v.aura.pinA); if (pin >= 0.2) await sleep(200); }
  ok(pin < 0.2, '[' + run.tag + '] ChiefAura\'s star pin stays down while the pill shows (' + pin.toFixed(2) + ')');
  await page.screenshot({ path: path.join(SHOTS, 'carry_' + run.tag + '_mixed.png') });
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
  errors.push(...log.errors);
  await page.close();
}
ok(errors.length === 0, 'no page errors', errors.slice(0, 5));
await browser.close();
srv.close && srv.close();
console.log('\ncarry: ' + pass + ' passed, ' + fail + ' failed  (wall ' + Math.round((Date.now() - T0) / 1000) + 's)');
process.exit(fail ? 1 : 0);
