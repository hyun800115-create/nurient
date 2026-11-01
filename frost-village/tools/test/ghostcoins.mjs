// (v4.2.1) ghost coins: "손님이 낸 코인이 다 회수는 했는데 화면에 흐리게 남아있어" — a till emptied by the chief or by
// 딸랑이 kept showing its coin pile (the soft, baked picture of it) after every coin had been collected.
//   node tools/test/ghostcoins.mjs [--canvas] [--dpr 3]
// Cause: StackBaker.flush erased the slots of the queued stacks with dt.erase(erasers, 0, 0) — DynamicTexture.batchDraw
// draws a Game Object AT the x / y it is given, so every eraser landed on the texture's corner (0, 0) instead of on its
// slot: a pile that shrank or was cleared kept its old picture (and the slots near the corner were wiped by other
// stacks' erasers). Fix: dt.erase(erasers) (each eraser at its own slot).
// Also (CashPad, src/entities/Seller.js): coins still flying in when a till is emptied (a customer paid a moment
// before 딸랑이 / the station's self-empty / the chief took the till) landed afterwards on an empty till as coins
// worth nothing, and a chief who ran straight across a full till took its value but left the rest of its pile on
// the pad; 딸랑이 skips a till with no value, so those coins stayed for good. Fix: a coin that lands on a till holding
// no value (the chief not on its pad) is not added to the pile, and the coins on the pad when the chief takes the
// till keep following him after he steps off — even when a customer pays again before they have all flown (a busy
// till); a pile that holds no value follows him too.
// Checks (fresh game, real rendering through the fixed-step clock: the bake runs only on drawn frames):
//   chief     coins paid into the market till, the chief collects them: value 0, no coins, the baked picture is empty
//   walk-over the chief runs straight across a full till: he gets its value and the rest of the pile follows him
//   busy      ...and a customer pays again the moment he steps off: the coins he was paid for still follow him, only
//             the new payment's coins stay (a busy till used to keep most of the old pile under the new, small value)
//   courier   CashPad.takeAll (딸랑이's round): the same, also with coins still in the air when he takes the till
//   corner    a flush erases only its own slots: a mark inside the first slot (the texture's corner) survives the
//             re-bake of another stack
//   shelf     a baked shelf that sells out shows nothing (any baked stack that shrinks loses its old picture)
//   restore   a till restored from a save (reload) and then collected leaves nothing
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor, loadPlaywright } from './pw.mjs';
import { installStepper, advance } from './fv_step.mjs';
import { installCoinScan } from './coinscan.mjs';

const argv = process.argv.slice(2);
const CANVAS = argv.includes('--canvas');
const di = argv.indexOf('--dpr');
const DPR = di >= 0 ? +argv[di + 1] || 1 : 1;
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const frames = (page, n) => page.evaluate((k) => { for (let i = 0; i < k; i++) window.__step.frame(); }, n);

const srv = await start(0, { prefix: '/fv/' });
const browser = CANVAS
  ? await loadPlaywright().chromium.launch({ headless: true, args: ['--disable-webgl', '--disable-3d-apis', '--no-sandbox'] })
  : await launch();
const t0 = Date.now();
try {
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: DPR });
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 120000);
  await sleep(1500);
  await installStepper(page);
  await installCoinScan(page);
  await advance(page, 0.5);
  const R = await page.evaluate(() => window.__FV.game.renderer.type);
  console.log('renderer: ' + (R === 2 ? 'WebGL' : 'Canvas') + ', dpr ' + DPR);
  ok(CANVAS ? R === 1 : R === 2, 'the renderer under test (' + (CANVAS ? 'Canvas' : 'WebGL') + ')');

  const pad = await page.evaluate(() => { const t = window.__coins.till('market'); window.__FV.teleport(t.x + 170, t.y + 110); window.__FV.camera(t.x, t.y - 40, 1); return { x: t.x, y: t.y }; });
  /** coins paid in as a customer pays, landed and baked */
  const payIn = async (amount) => {
    await page.evaluate((a) => { const t = window.__coins.till('market'); t.add(a, t.x + 90, t.y - 70); }, amount);
    await advance(page, 1);
    await frames(page, 6);
    return page.evaluate(() => window.__coins.scan('market'));
  };

  console.log('chief');
  const s0 = await payIn(30);
  ok(s0.value >= 30 && s0.count > 0 && s0.bake && s0.pileInk && s0.pileInk.px > 0, 'coins on the till, drawn in its baked picture', { value: s0.value, count: s0.count, ink: s0.pileInk });
  await page.evaluate((p) => window.__FV.teleport(p.x, p.y), pad);
  for (let k = 0; k < 12; k++) { await page.evaluate(() => window.__step.run(0.25)); if (await page.evaluate(() => { const t = window.__coins.till('market'); return t.value === 0 && t.pile.count === 0 && t.pile.incoming === 0; })) break; }
  await page.evaluate((p) => window.__FV.teleport(p.x + 170, p.y + 110), pad);
  await advance(page, 0.5);
  await frames(page, 8);
  const s1 = await page.evaluate(() => window.__coins.scan('market'));
  ok(s1.value === 0 && s1.count === 0, 'the chief took every coin', { value: s1.value, count: s1.count });
  ok(s1.pileInk && s1.pileInk.px === 0, 'nothing left in the till\'s picture (' + (s1.pileInk ? s1.pileInk.px : '?') + ' px)', s1.pileInk);
  ok(!s1.ghost, 'no coin shows on the emptied till', s1.objs);

  console.log('walk-over');
  // the chief runs straight across a full till without stopping: he gets all its value at once, and the rest of its
  // coins must follow him (left on the pad they were worth nothing, and 딸랑이 never takes a till that holds no value)
  const w = await page.evaluate(async () => {
    const t = window.__coins.till('market');
    t.restore(144);                 // a full till: 48 coins
    for (let i = 0; i < 6; i++) window.__step.frame();
    const full = window.__coins.ink(t.pile);
    window.__FV.teleport(t.x - 260, t.y);
    window.__step.run(0.1);
    window.__FV.setInput(1, 0);
    let on = 0, n = 0;
    for (let i = 0; i < 45; i++) { window.__step.run(1 / 30); const p = window.__FV.scene.player; if (t.pad.contains(p.x, p.y)) { on++; n = t.pile.count; } }
    window.__FV.setInput(0, 0);
    const v = t.value;
    window.__step.run(2.5);
    for (let i = 0; i < 8; i++) window.__step.frame();
    return Object.assign(await window.__coins.scan('market'), { full, onPad: on / 30, leftWhenOff: n, valueAfterPass: v, chiefX: Math.round(window.__FV.scene.player.x - t.x) });
  });
  ok(w.onPad > 0 && w.onPad < 1 && w.valueAfterPass === 0, 'the chief crossed the till in ' + w.onPad.toFixed(2) + ' s and took its 144 coins (' + w.leftWhenOff + ' coins still on the pad as he stepped off)', { onPad: w.onPad, value: w.valueAfterPass, x: w.chiefX });
  ok(w.count === 0 && w.pileInk && w.pileInk.px === 0 && !w.ghost, 'the rest of the pile followed him: nothing left on the pad (' + w.count + ' coins, ' + (w.pileInk ? w.pileInk.px : '?') + ' px)', w.objs);
  await page.evaluate((p) => { window.__FV.teleport(p.x + 170, p.y + 110); window.__step.run(0.5); }, pad);

  console.log('busy');
  // a busy till: a customer pays 6 coins right as the chief steps off the pad (in the late village a payment often
  // comes within the second the rest of the pile takes to fly): the coins he was paid for must still follow him
  const wb = await page.evaluate(async () => {
    const t = window.__coins.till('market'), B = window.__FV.scene.__stackBaker;
    t.restore(144);                 // a full till: 48 coins
    for (let i = 0; i < 6; i++) window.__step.frame();
    window.__FV.teleport(t.x - 260, t.y);
    window.__step.run(0.1);
    window.__FV.setInput(1, 0);
    let was = false, left = -1;
    for (let i = 0; i < 45; i++) {
      window.__step.run(1 / 30);
      const p = window.__FV.scene.player, on = t.pad.contains(p.x, p.y);
      if (on) was = true;
      else if (was && left < 0) { left = t.pile.count; t.add(6, t.x + 90, t.y - 70); }
    }
    window.__FV.setInput(0, 0);
    window.__step.run(2.5);
    for (let i = 0; i < 8; i++) window.__step.frame();
    const s = await window.__coins.scan('market');
    const play = window.__coins.ink(t.pile);
    B.queue(t.pile); B.flush(true);
    return Object.assign(s, { left, play, fresh: window.__coins.ink(t.pile) });
  });
  ok(wb.left > 2, 'a customer paid 6 as the chief stepped off (' + wb.left + ' of the coins he took still on the pad)', { left: wb.left });
  ok(wb.value === 6 && wb.count === 2 && wb.incoming === 0, 'they followed him; only the 2 new coins stay (' + wb.count + ' coins, value ' + wb.value + ')', { value: wb.value, count: wb.count, incoming: wb.incoming });
  ok(wb.play && wb.fresh && wb.play.px > 0 && wb.play.px === wb.fresh.px, 'the till shows those 2 coins and nothing else (' + (wb.play ? wb.play.px : '?') + ' px, fresh bake ' + (wb.fresh ? wb.fresh.px : '?') + ' px)', wb.objs);
  await page.evaluate((p) => { const t = window.__coins.till('market'); t.takeAll(null); window.__FV.teleport(p.x + 170, p.y + 110); window.__step.run(0.5); }, pad);

  console.log('courier');
  await payIn(45);
  const s2 = await page.evaluate(async () => { const t = window.__coins.till('market'); const n = t.takeAll({ x: t.x + 220, y: t.y + 120 }); window.__step.run(1); for (let i = 0; i < 8; i++) window.__step.frame(); return Object.assign(await window.__coins.scan('market'), { taken: n }); });
  ok(s2.taken >= 45 && s2.value === 0 && s2.count === 0, '딸랑이 took the till (' + s2.taken + ')', { value: s2.value, count: s2.count });
  ok(s2.pileInk && s2.pileInk.px === 0 && !s2.ghost, 'nothing left after his round (' + (s2.pileInk ? s2.pileInk.px : '?') + ' px)', s2.objs);
  // a customer pays a moment before he takes the till: the coins are still in the air
  const s3 = await page.evaluate(async () => {
    const t = window.__coins.till('market');
    t.add(30, t.x + 90, t.y - 70);
    window.__step.run(0.15);
    const flying = t.pile.incoming;
    const n = t.takeAll({ x: t.x + 220, y: t.y + 120 });
    window.__step.run(1.5);
    for (let i = 0; i < 8; i++) window.__step.frame();
    return Object.assign(await window.__coins.scan('market'), { taken: n, flying });
  });
  ok(s3.taken === 30, 'he took the 30 coins paid (' + s3.taken + ', ' + s3.flying + ' coins still flying)');
  ok(s3.count === 0 && !s3.zeroValueCoins, 'no coin worth nothing lands on the emptied till afterwards (' + s3.count + ' coins, value ' + s3.value + ')', s3.objs);
  ok(s3.pileInk && s3.pileInk.px === 0 && !s3.ghost, 'and nothing shows there (' + (s3.pileInk ? s3.pileInk.px : '?') + ' px)', s3.objs);

  console.log('corner');
  const c = await page.evaluate(async () => {
    const gs = window.__FV.scene, B = gs.__stackBaker, s0 = B.stacks[0] && B.stacks[0].slot;
    if (!B || !s0) return { err: 'no baker / first slot' };
    const dt = B.dt, r = gs.renderer;
    const read = (x, y, w, h) => {
      let d;
      if (r.gl && dt.renderTarget) { const gl = r.gl, prev = r.currentFramebuffer; r.setFramebuffer(dt.renderTarget.framebuffer); d = new Uint8Array(w * h * 4); gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, d); r.setFramebuffer(prev || null); }
      else d = dt.context.getImageData(x, y, w, h).data;
      let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++; return n;
    };
    // a mark inside the first slot (which starts at the texture's corner)
    const mx = s0.x + 2, my = s0.y + 2;
    dt.fill(0xff00ff, 1, mx, my, 8, 8);
    const before = read(mx, my, 8, 8);
    // another stack (the market till) is re-baked alone
    const t = window.__coins.till('market');
    t.pile.push('item_coin', null, gs.effects);
    t.pile.layout(t.x, t.y + 4, t.y);
    B.dirty.clear();
    B.bake(t.pile);
    const after = read(mx, my, 8, 8);
    // tidy up: the mark goes (the first stack is redrawn), the coin goes
    t.pile.clear(gs.effects);
    B.dirty.add(B.stacks[0]); B.flush(true);
    return { before, after, first: s0.name + ' @' + s0.x + ',' + s0.y, till: t.pile.slot.name + ' @' + t.pile.slot.x + ',' + t.pile.slot.y };
  });
  ok(!c.err && c.before > 0, 'a mark drawn in the first slot (' + c.first + ')', c);
  ok(!c.err && c.after === c.before, 're-baking another stack (' + c.till + ') leaves it alone (' + c.before + ' -> ' + c.after + ' px)', c);

  console.log('shelf');
  // (the same erase serves every baked stack: a shelf that sells out must not keep the picture of its goods)
  const sh = await page.evaluate(() => {
    const gs = window.__FV.scene, st = gs.market.stock, n0 = st.count;
    if (n0) return { n0 };
    for (let i = 0; i < 6; i++) st.push('item_fish_cooked', null, gs.effects);
    for (let i = 0; i < 6; i++) window.__step.frame();
    const full = window.__coins.ink(st);
    for (let i = 0; i < 6; i++) { const it = st.pop('item_fish_cooked'); if (it && it.spr) gs.effects.releaseItem(it.spr); }
    for (let i = 0; i < 6; i++) window.__step.frame();
    return { n0, full, after: window.__coins.ink(st), n: st.count };
  });
  if (sh.n0) console.log('  (skipped: the shelf is not empty in this run)');
  else {
    ok(sh.full && sh.full.px > 0, 'six fish on the market shelf, drawn (' + (sh.full ? sh.full.px : '?') + ' px)');
    ok(sh.n === 0 && sh.after && sh.after.px === 0, 'sold out: the shelf\'s picture is empty (' + (sh.after ? sh.after.px : '?') + ' px)', sh);
  }

  console.log('restore');
  const s4 = await page.evaluate(async () => {
    const t = window.__coins.till('market');
    t.restore(36);                  // as Game.restore does for a saved till
    for (let i = 0; i < 6; i++) window.__step.frame();
    const full = window.__coins.ink(t.pile);
    window.__FV.teleport(t.x, t.y);
    for (let k = 0; k < 12 && (t.value > 0 || t.pile.count > 0); k++) window.__step.run(0.25);
    window.__FV.teleport(t.x + 170, t.y + 110);
    window.__step.run(0.5);
    for (let i = 0; i < 8; i++) window.__step.frame();
    return Object.assign(await window.__coins.scan('market'), { full });
  });
  ok(s4.full && s4.full.px > 0, 'a restored till shows its coins (' + (s4.full ? s4.full.px : '?') + ' px)');
  ok(s4.value === 0 && s4.count === 0 && s4.pileInk && s4.pileInk.px === 0 && !s4.ghost, 'collected after the reload: nothing left (' + (s4.pileInk ? s4.pileInk.px : '?') + ' px)', s4.objs);

  ok(log.errors.length === 0, 'no page errors', log.errors.slice(0, 3));
} finally {
  await browser.close();
  await srv.close();
}
console.log(`\n${pass} passed, ${fail} failed (${Math.round((Date.now() - t0) / 1000)} s)`);
process.exit(fail ? 1 : 0);
