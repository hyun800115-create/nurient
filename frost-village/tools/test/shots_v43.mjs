// (v4.3 step B, M — build_plan §3.9 / §5 gate G6) the plaza shop's four stages on a phone: 360×640 and 412×915, ko and en,
// day and night, stages 1–4 (눈꽃 노점 · 눈꽃 가게 · 눈꽃 시장 · 눈꽃마을 시장), each with its lines filled (three customers a
// line), the merchant(s) at the 자재 창구, the bakery's stall and its line beside it and the HUD's right-hand column in the
// same frame. For each shot it checks, as drawn:
//   - the stage's board and every counter plate are on screen (their legibility with full racks: clerk_view.mjs)
//   - no line place of one counter stands on another counter's register pad / line (the lines keep apart)
//   - the shop's board and plates are clear of the HUD's right-hand column and the coin row
//   - (stage 4) the second 자재 window: its register pad 「계산대 2」 and the second merchant are on screen
// A contact sheet per size goes with the shots.
//   node tools/test/shots_v43.mjs [--out DIR] [--sizes 360x640,412x915] [--langs ko,en] [--stages 1,2,3,4] [--fixture v42_village_late.json]
// The village is a late fixture (the 46-min bot village; v4 runs, so the night comes from the day clock). It loads through
// the step-B remap like a tester's village. The stages are set by hook (Seller.setStage: each stage's page is fetched when
// the shop is at that stage); the mkt_s4 row is added in the page while P is not merged (tools/test/stage4_helpers.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { addStage4Row } from './stage4_helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(opt('--out', path.join(ROOT, 'docs', 'previews', 'screens_v43', 'shop')));
const SIZES = opt('--sizes', '360x640,412x915').split(',');
const LANGS = opt('--langs', 'ko,en').split(',');
const STAGES = opt('--stages', '1,2,3,4').split(',').map(Number);
const FIX = opt('--fixture', 'v42_village_late.json');
fs.mkdirSync(OUT, { recursive: true });
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const T0 = Date.now();
const raw = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', FIX), 'utf8'));
const KEYS = raw.keys ? raw.keys : { 'frostVillage.save.v1': JSON.stringify(raw) };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const errors = [];
const made = [];

for (const size of SIZES) for (const lang of LANGS) {
  const [W, H] = size.split('x').map(Number);
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: W, height: H }, dpr: 1, locale: lang === 'en' ? 'en-US' : 'ko-KR' });
  const ev = (fn, a) => page.evaluate(fn, a);
  await ev(([K, lg]) => {
    try {
      localStorage.clear();
      for (const k in K) localStorage.setItem(k, K[k]);
      let st = {}; try { st = JSON.parse(K['frostVillage.settings.v1'] || '{}') || {}; } catch (e) { st = {}; }
      Object.assign(st, { lang: lg, sound: false, music: false, daynight: true });
      localStorage.setItem('frostVillage.settings.v1', JSON.stringify(st));
    } catch (e) { /* */ }
  }, [KEYS, lang]);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  await addStage4Row(page);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 180000);
  await sleep(2000);
  await ev(() => {
    const F = window.__FV, game = F.game, g = F.scene;
    try { if (F.v42) F.v42.v.seen.whatsNew = 1; } catch (e) { /* */ }
    // (the renewal letter / flag card / cards a remapped village opens first are not what these shots are about)
    try { const ui = game.scene.getScene('UI'); if (ui.hud42 && ui.hud42.card && ui.hud42.closeCard) ui.hud42.closeCard(); } catch (e) { /* */ }
    F.give(20000);
    for (const id of ['hire_clerk_trade', 'hire_clerk_market', 'hire_clerk_s3']) { try { F.doneStep(id); } catch (e) { /* */ } }
    game.loop.sleep();
    let T = game.loop.time || performance.now(); const DT = 1000 / 60;
    window.__run = (sec) => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { T += DT; game.headlessStep(T, DT); } };
    window.__draw = () => { T += DT; game.step(T, DT); };
    g.market.spawnT = 1e9;
  });
  const run = async (sec) => { for (let s = 0; s < sec; s += 5) await ev((d) => window.__run(d), Math.min(5, sec - s)); };
  // (the loop awake for a moment: pages arrive while it runs)
  const warmUntil = async (fn, arg, maxS) => {
    await ev(() => window.__FV.game.loop.wake());
    const t0 = Date.now();
    let okk = false;
    while (Date.now() - t0 < (maxS || 30) * 1000) { if (await ev(fn, arg)) { okk = true; break; } await sleep(300); }
    await ev(() => window.__FV.game.loop.sleep());
    return okk;
  };
  for (const st of STAGES) {
    await ev((st) => { const m = window.__FV.scene.market; m.setStage(st, true); }, st);
    const have = await warmUntil((st) => { const A = window.__FV.assets(); return !A.pending('market_s' + st + '_back') && !A.pending('bakery43_stall_back'); }, st, 40);
    ok(have, `[${size} ${lang}] stage ${st}: its page is in`);
    for (const night of [false, true]) {
      const cam = await ev(([st, night]) => {
        const F = window.__FV, g = F.scene, m = g.market, T = g.trade, nb = g.v4, B = g.bakery;
        if (nb && nb.clock) { if (!nb.clock.on && nb.clock.start) nb.clock.start(); nb.clock.set(night ? 21.5 : 11); }
        // the lines: three customers in every open line, standing; the merchant(s) at the 자재 창구; a full-ish rack
        for (const ty of ['item_fish_cooked', 'item_meat_cooked']) while (m.stock.countOf(ty) < 24) m.stock.push(ty, null, g.effects);
        if (T.enabled) for (const ty of ['item_plank', 'item_ingot']) while (T.stock.countOf(ty) < 14) T.stock.push(ty, null, g.effects);
        for (const L of Object.values(m.lanes)) { for (const c of L.queue.slice()) { try { c.despawn(); } catch (e) { /* */ } } L.queue.length = 0; }
        for (const c of m.leaving.slice()) { try { c.despawn(); } catch (e) { /* */ } } m.leaving.length = 0;
        for (const L of m.openLanes()) for (let i = 0; i < 3; i++) {
          const c = m.spawnCustomer(i); const f = c.market; const k = f.queue.indexOf(c); if (k >= 0) f.queue.splice(k, 1);
          L.queue.push(c); c.market = L; const q = L.slotPos(L.queue.length - 1); c.x = q.x; c.y = q.y; c.path.length = 0;
          c.setWant(L.types[0]); c.state = 'wait'; c.arrived = true; c.faceTo(L.x + L.cfg.faceTo[0], L.y + L.cfg.faceTo[1]); c.showBubble(); c.sync(0);
        }
        if (B && B.built && B.stall && B.stall.spawnCustomer) { const S = B.stall; while (S.queue.length < 3) S.spawnCustomer(S.queue.length); S.spawnT = 1e9; }
        F.clearStack();
        // the chief beside the shop's east end (out of the lines); the camera between the shop and the bakery's stall
        F.teleport(m.x + 380, m.y + 260); F.setInput(0, 0);
        const bx = B && B.stall ? B.stall.x : m.x + 400, by = B && B.stall ? B.stall.y : m.y + 150;
        // (the shop's board below the HUD's right-hand column: the camera a little above the shop-bakery line)
        return { x: Math.round(m.x * 0.7 + bx * 0.3), y: Math.round(m.y * 0.7 + by * 0.3 - 110) };
      }, [st, night]);
      await run(1.2);
      await ev((c) => window.__FV.camera(c.x, c.y, 0.9), cam);
      await ev(() => { const ui = window.__FV.game.scene.getScene('UI'); if (ui && ui.bannerBox && ui.bannerBox.visible) { ui.tweens.killTweensOf(ui.bannerBox); ui.bannerBox.setVisible(false); } });
      await ev(() => { for (let i = 0; i < 20; i++) window.__draw(); });
      const file = `shop_s${st}_${night ? 'night' : 'day'}_${W}x${H}_${lang}.jpg`;
      await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 82, timeout: 120000 });
      made.push(file);
      // what is drawn where (screen px): the board, the plates, the register pads, the lines' front places, the HUD's
      //  right-hand column and coin row
      const R = await ev(() => {
        const g = window.__FV.scene, m = g.market, cam = g.cameras.main, ui = window.__FV.game.scene.getScene('UI');
        const k = cam.zoom, sx = (x) => (x - cam.worldView.x) * k, sy = (y) => (y - cam.worldView.y) * k;
        const scr = (o) => { if (!o || !o.visible) return null; const b = o.getBounds(); return [Math.round(sx(b.x)), Math.round(sy(b.y)), Math.round(sx(b.right)), Math.round(sy(b.bottom))]; };
        const sw = g.scale.width, sh = g.scale.height;
        const plates = m.plates.filter((p) => p.on).map((p) => ({ key: p.key, box: scr(p.img) }));
        const regs = Object.keys(m.seats).filter((s) => m.seats[s].enabled && m.seats[s].pad.img.visible).map((s) => ({ seat: s, box: scr(m.seats[s].pad.img), at: [Math.round(sx(m.seats[s].x)), Math.round(sy(m.seats[s].y))] }));
        const fronts = m.openLanes().map((L) => { const q = L.slotPos(0); return { lane: L.id, at: [Math.round(sx(q.x)), Math.round(sy(q.y))] }; });
        let col = null;
        if (ui && ui.rightBoxes) for (let i = 0; i < (ui.rightN || 0); i++) { const r = ui.rightBoxes[i]; if (r && r.b) col = col ? [Math.min(col[0], r.l !== undefined ? r.l : sw - 160), col[1], sw, Math.max(col[3], r.b)] : [r.l !== undefined ? r.l : sw - 160, 0, sw, r.b]; }
        const coin = ui && ui.coinBar ? [0, 0, Math.round(ui.coinBar.x + ui.coinBar.width), Math.round(ui.coinBar.y + 40)] : null;
        const T = g.trade;
        return { sw, sh, stage: m.stage, sign: scr(m.sign), plates, regs, fronts, col, coin, m2: T.open2 ? [Math.round(sx(T.merchant2.x)), Math.round(sy(T.merchant2.y))] : null, m1: T.enabled ? [Math.round(sx(T.merchant.x)), Math.round(sy(T.merchant.y))] : null };
      });
      const inScr = (b) => b && b[0] >= -2 && b[1] >= -2 && b[2] <= R.sw + 2 && b[3] <= R.sh + 2;
      const ovl = (a, b) => a && b && Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
      const tag = `[${W}x${H} ${lang} s${st} ${night ? 'night' : 'day'}]`;
      const boxes = [R.sign].concat(R.plates.map((p) => p.box)).filter(Boolean);
      ok(R.stage === st && R.sign && inScr(R.sign) && R.plates.every((p) => inScr(p.box)), `${tag} the board and ${R.plates.length} plate(s) on screen`, R);
      const hud = boxes.some((b) => ovl(b, R.col) > 0 || ovl(b, R.coin) > 0);
      ok(!hud, `${tag} the board and the plates are clear of the HUD's right-hand column and the coin row`, { col: R.col, coin: R.coin, boxes });
      // a line's front place never on another counter's register pad (iso distance on screen)
      const near = []; for (const f of R.fronts) for (const r of R.regs) if (Math.hypot(f.at[0] - r.at[0], 2 * (f.at[1] - r.at[1])) < 26) near.push(f.lane + '@' + r.seat);
      ok(!near.length, `${tag} no line's front place stands on a register pad`, near);
      if (st === 4) ok(!!R.m2 && R.regs.some((r) => r.seat === 'M2' && inScr(r.box)), `${tag} the second 자재 window: its register pad 「계산대 2」 and the second merchant are on screen`, { m2: R.m2, regs: R.regs });
    }
  }
  errors.push(...log.errors);
  await page.context().close();
}
// a contact sheet per size (day and night of every stage, the first language)
try {
  const { createRequire } = await import('node:module');
  const req = createRequire(import.meta.url);
  let sharp = null; try { sharp = req('sharp'); } catch (e) { sharp = null; }
  if (sharp) {
    for (const size of SIZES) {
      const files = made.filter((f) => f.indexOf('_' + size + '_' + LANGS[0]) > 0);
      const [W, H] = size.split('x').map(Number), s = 0.5, cw = Math.round(W * s), ch = Math.round(H * s), cols = 4;
      const comp = await Promise.all(files.map(async (f, i) => ({ input: await sharp(path.join(OUT, f)).resize(cw, ch).toBuffer(), left: (i % cols) * cw, top: Math.floor(i / cols) * ch })));
      await sharp({ create: { width: cols * cw, height: Math.ceil(files.length / cols) * ch, channels: 3, background: '#203040' } }).composite(comp).jpeg({ quality: 80 }).toFile(path.join(OUT, 'sheet_' + size + '.jpg'));
    }
  }
} catch (e) { console.log('  (no contact sheet: ' + String(e.message || e).split('\n')[0] + ')'); }
ok(errors.length === 0, 'no page errors', errors.slice(0, 4));
await browser.close(); await srv.close();
console.log(`shots_v43: ${pass} passed, ${fail} failed, ${made.length} shots in ${OUT} (wall ${Math.round((Date.now() - T0) / 1000)} s)`);
process.exit(fail ? 1 : 0);
