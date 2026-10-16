// (v4.2, docs/v42_plan.md §3.3 + §15) 자동 줍기 — PickupPolicy on every take path, fixed-step clock:
//   node tools/test/pickup.mjs
// From the v4.1 46-min save (village complete): for the station output (grill), the boathouse catch, a collection
// pile (fish) and gathering (a pine): 'auto' takes while crossing at full speed (v4.1); 'still' takes nothing when
// crossing, and takes after 0.35 s standing; 'off' never takes on its own, the 줍기 tap takes one load, holding
// streams; the HUD shows the 줍기 button only in 'off' with something takeable. A fresh game forces 'auto' through the
// first loop (setting 'off' notwithstanding). Deliveries are never gated.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAVE = fs.readFileSync(path.join(HERE, 'fixtures', 'v41_save_smart_46min.json'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 300) : '')); } };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
async function boot(save) {
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: 1 });
  await page.evaluate((sv) => { try { localStorage.clear(); if (sv) localStorage.setItem('frostVillage.save.v1', sv); } catch (e) { /* */ } }, save);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 120000);
  await sleep(2500);
  await installStepper(page);
  await page.evaluate(() => { if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1; });
  await advance(page, 1);
  return { page, log };
}

try {
  const { page, log } = await boot(SAVE);
  const setMode = (m) => page.evaluate((mode) => { window.__FV.v42.settings({ pickup: mode }); return window.__FV.v42.v.pickup.mode; }, m);
  // fill a source so there is something to take; returns its pad centre
  const prep = async (src) => {
    // (items still flying into the bag from the last take land first)
    await page.evaluate(() => { const F = window.__FV; F.setInput(0, 0); F.teleport(F.scene.market.x + 200, F.scene.market.y + 260); F.v42.v.pickup.release(); F.v42.v.pickup.oneLoad = false; });
    await advance(page, 0.8);
    return page.evaluate((k) => {
    const gs = window.__FV.scene, F = window.__FV;
    F.clearStack();
    gs.workers.forEach((w) => { w.paused = true; });
    let pad, stack, item;
    if (k === 'grill') { const s = gs.stations.grill; pad = s.outPad; stack = s.outStack; item = s.cfg.output; }
    else if (k === 'boat') { const b = gs.boathouse; pad = b.outPad; stack = b.outStack; item = 'item_fish_raw'; }
    else { const p = gs.piles.fish; pad = p.pad; stack = p.stack; item = p.item; }
    while (stack.count < Math.min(stack.max, 12)) stack.push(item, null, gs.effects);
    // the porters of that source stand still while we test (their takes are not the chief's)
    for (const pr of gs.porters.concat(gs.rawPorters)) { pr.__upd = pr.__upd || pr.update; pr.update = () => {}; }
    return { x: pad.x, y: pad.y, have: stack.count };
  }, src);
  };
  const bag = () => page.evaluate(() => window.__FV.scene.player.stack.count + window.__FV.scene.player.stack.incoming);
  // cross the pad at full speed: start 220 px to the left, push right for ~1.4 s
  const cross = async (p) => {
    await page.evaluate(({ x, y }) => { window.__FV.teleport(x - 230, y); window.__FV.setInput(1, 0); }, p);
    await advance(page, 1.6);
    await page.evaluate(() => window.__FV.setInput(0, 0));
    await advance(page, 0.2);
    return bag();
  };
  const stand = async (p, sec) => { await page.evaluate(({ x, y }) => { window.__FV.setInput(0, 0); window.__FV.teleport(x, y); }, p); await advance(page, sec); return bag(); };

  for (const src of ['grill', 'boat', 'pile']) {
    console.log(src);
    let p = await prep(src);
    ok((await setMode('auto')) === 'auto' && (await cross(p)) > 0, src + ': 켬 (auto) takes while crossing at full speed (v4.1)');
    p = await prep(src);
    ok((await setMode('still')) === 'still' && (await cross(p)) === 0, src + ': 멈추면 (still) takes nothing while crossing');
    p = await prep(src);
    const a = await stand(p, 0.2), b = await stand(p, 0.6);
    ok(a === 0 && b > 0, src + ': 멈추면 takes after standing 0.35 s', { a, b });
    p = await prep(src);
    await setMode('off');
    const c = await cross(p);
    const d = await stand(p, 1.0);
    ok(c === 0 && d === 0, src + ': 끔 (off) never takes on its own', { c, d });
    const hud = await page.evaluate(() => window.__FV.scene.scene.get('UI').hud42.state());
    ok(hud.pick === true || (await page.evaluate(() => !!window.__FV.v42.v.pickup.offer())), src + ': the 줍기 button is offered on the pad');
    await page.evaluate(() => { const PP = window.__FV.v42.v.pickup; PP.press(); PP.release(); });
    await advance(page, 1.5);
    const e = await bag();
    ok(e > 0, src + ': 줍기 tap takes a load', { e });
    p = await prep(src);
    await page.evaluate(({ x, y }) => window.__FV.teleport(x, y), p);
    await page.evaluate(() => window.__FV.v42.v.pickup.press());
    await advance(page, 0.5);
    const f = await bag();
    await page.evaluate(() => window.__FV.v42.v.pickup.release());
    ok(f > 0, src + ': holding 줍기 streams', { f });
  }

  console.log('gathering');
  {
    await page.evaluate(() => { const gs = window.__FV.scene; window.__FV.clearStack(); for (const pr of gs.porters.concat(gs.rawPorters)) if (pr.__upd) pr.update = pr.__upd; });
    const tree = await page.evaluate(() => { const n = window.__FV.where('tree'); return n; });
    ok(!!tree, 'a pine to gather', tree);
    if (tree) {
      await setMode('still');
      // walk past the tree without stopping: nothing gathered
      await page.evaluate(({ x, y }) => { window.__FV.teleport(x - 200, y); window.__FV.setInput(1, 0); }, tree);
      await advance(page, 1.6);
      await page.evaluate(() => window.__FV.setInput(0, 0));
      const g0 = await page.evaluate(() => !!window.__FV.scene.player.node);
      await page.evaluate(() => window.__FV.clearStack());
      await page.evaluate(({ x, y }) => window.__FV.teleport(x, y), tree);
      await advance(page, 0.25);
      const g1 = await page.evaluate(() => !!window.__FV.scene.player.node);
      await advance(page, 0.6);
      const g2 = await page.evaluate(() => !!window.__FV.scene.player.node);
      ok(!g0 && !g1 && g2, '멈추면: gathering starts only after standing still', { g0, g1, g2 });
      await setMode('off');
      await page.evaluate(() => window.__FV.clearStack());
      await page.evaluate(({ x, y }) => window.__FV.teleport(x + 2, y), tree);
      await advance(page, 1.2);
      const g3 = await page.evaluate(() => !!window.__FV.scene.player.node);
      await page.evaluate(() => window.__FV.v42.v.pickup.press());
      await advance(page, 0.6);
      const g4 = await page.evaluate(() => !!window.__FV.scene.player.node);
      await page.evaluate(() => window.__FV.v42.v.pickup.release());
      await advance(page, 0.3);
      const g5 = await page.evaluate(() => !!window.__FV.scene.player.node);
      ok(!g3 && g4 && !g5, '끔: gathers only while 줍기 is held', { g3, g4, g5 });
    }
  }

  console.log('deliveries are never gated');
  {
    await setMode('off');
    const r = await page.evaluate(() => {
      const gs = window.__FV.scene, F = window.__FV;
      F.clearStack();
      const mk = gs.market;
      for (const ty of ['item_fish_cooked']) while (mk.stock.countOf(ty) > 0) { const it = mk.stock.pop(ty); if (it && it.spr) gs.effects.releaseItem(it.spr); }
      F.carry('item_fish_cooked', 6);
      return { x: mk.shelf.x + 30, y: mk.shelf.y + 22, before: mk.stock.countOf('item_fish_cooked') };
    });
    await page.evaluate(({ x, y }) => window.__FV.teleport(x, y), r);
    await advance(page, 2);
    const after = await page.evaluate(() => window.__FV.scene.market.stock.countWithIncoming('item_fish_cooked'));
    ok(after > r.before, 'off: the chief still fills the shelf', { before: r.before, after });
    await setMode('auto');
  }
  ok(log.errors.length === 0, 'no errors (46-min save)', log.errors.slice(0, 3));
  await page.context().close();

  console.log('the first loop forces 켬');
  {
    const { page: p2, log: l2 } = await boot(null);
    const m = await p2.evaluate(() => { window.__FV.v42.settings({ pickup: 'off' }); return { mode: window.__FV.v42.v.pickup.mode, tut: !!(window.__FV.scene.tutorial && window.__FV.scene.tutorial.inTutorial) }; });
    ok(m.tut && m.mode === 'auto', 'fresh game: setting 끔 but the mode stays auto in the tutorial', m);
    await p2.evaluate(() => window.__FV.v42.settings({ pickup: 'auto' }));
    ok(l2.errors.length === 0, 'no errors (fresh game)', l2.errors.slice(0, 3));
    await p2.context().close();
  }
} catch (e) { fail++; console.log('FATAL', e && e.stack || e); }
console.log('\n' + pass + ' passed, ' + fail + ' failed');
await browser.close();
await srv.close();
process.exit(fail ? 1 : 0);
