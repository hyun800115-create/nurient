// (v4.2 fix, the designer's "위에 어선은 있는 선착장은 짐꾼이 없는건가 여기 생선이 그대로야") the 생선 짐꾼 (porter_dock) comes with
// the rowboat. Before, he was a 600-coin side pad beside the catch that no arrow pointed at: without him nobody carries
// the boat's catch (the chief by hand only), the catch pad fills, the boat waits at the pier with a full hold.
//   node tools/test/dockporter.mjs            (fixed-step clock)
// Checks: an older save with the boat but not him gets him on load, a part-payment on his pad comes back · the catch
// pad does not stay full · saved done, no part-payment left · reload: one porter, no second refund · the 46-min save
// (fishing boat, tuna) without him: the pier pile drains · a new game: buying the rowboat brings him, the banner says so,
// no 600-coin pad ever appears · 0 page errors.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fx = (n) => JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', n), 'utf8'));
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra).slice(0, 300) : '')); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 400) : '')); } };

// the v4.1 35-min save (rowboat bought): without the 생선 짐꾼, 250 coins paid on his pad
const save35 = fx('v41_save_smart_35min.json');
delete save35.progress.done.porter_dock;
save35.progress.paid = Object.assign({}, save35.progress.paid, { porter_dock: 250 });
// the v4.1 46-min save (fishing boat, tuna in the catch): without him
const save46 = fx('v41_save_smart_46min.json');
delete save46.progress.done.porter_dock;
if (save46.progress.paid) delete save46.progress.paid.porter_dock;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const boot = async (saveObj) => {
  const INIT = `try { if (!sessionStorage.getItem('__dpInit')) { sessionStorage.setItem('__dpInit', '1'); localStorage.clear(); const sv = ${JSON.stringify(saveObj ? JSON.stringify(saveObj) : null)}; if (sv) localStorage.setItem('frostVillage.save.v1', sv); } } catch (e) {}`;
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: 1, init: INIT });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 180000);
  await sleep(1500);
  await installStepper(page);
  await page.evaluate(() => { if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1; });
  await advance(page, 1);
  return { page, log };
};
const dockState = () => { const gs = window.__FV.scene; return { done: !!gs.progress.done.porter_dock, pad: !!gs.progress.pads.porter_dock, dockPorters: gs.porters.filter((p) => p.station === gs.boathouse).length, coins: gs.economy.coins, paid: gs.progress.paid.porter_dock || 0, catch: gs.boathouse ? gs.boathouse.outStack.count : null, max: gs.boathouse ? gs.boathouse.outStack.max : null }; };
const errors = [];
try {
  // ---------------------------------------------------------------- 1. the 35-min save: rowboat, no 생선 짐꾼
  {
    const { page, log } = await boot(save35);
    const s0 = await page.evaluate(dockState);
    ok(s0.done && s0.dockPorters === 1 && !s0.pad, 'an older save with the boat but not the 생선 짐꾼: he is there after loading', s0);
    ok(s0.coins === save35.coins + 250 && s0.paid === 0, 'the 250 coins paid on his pad come back', { before: save35.coins, after: s0.coins });
    const rows = [];
    for (let i = 0; i < 36; i++) { await page.evaluate(() => window.__FV.teleport(107, 1582)); await advance(page, 5); rows.push(await page.evaluate(() => window.__FV.scene.boathouse.outStack.count)); }
    const late = rows.slice(12);
    ok(Math.max(...late) < s0.max * 0.9, 'the catch pad does not stay full (3 game minutes, max ' + Math.max(...late) + ' of ' + s0.max + ')', rows.join(','));
    const sv = await page.evaluate(() => { window.__FV.save(); return localStorage.getItem('frostVillage.save.v1'); });
    const d = JSON.parse(sv);
    ok(d.v === 7 && !!d.progress.done.porter_dock && !(d.progress.paid || {}).porter_dock, 'saved (v7): porter_dock done, no part-payment left', { v: d.v, done: !!d.progress.done.porter_dock, paid: (d.progress.paid || {}).porter_dock });
    for (const e of log.errors) errors.push('save35: ' + e);
    await page.context().close();
    const again = await boot(d);
    const s1 = await again.page.evaluate(dockState);
    ok(s1.dockPorters === 1 && s1.coins === d.coins, 'reload: exactly one 생선 짐꾼, no second refund', { s1, saved: d.coins });
    for (const e of again.log.errors) errors.push('reload: ' + e);
    await again.page.context().close();
  }
  // ---------------------------------------------------------------- 2. the 46-min save: fishing boat (tuna), no 생선 짐꾼
  {
    const { page, log } = await boot(save46);
    const s0 = await page.evaluate(dockState);
    ok(s0.done && s0.dockPorters === 1, 'the 46-min save (fishing boat) without him: he is there after loading', s0);
    const rows = [];
    for (let i = 0; i < 24; i++) { await page.evaluate(() => window.__FV.teleport(107, 1582)); await advance(page, 10); rows.push(await page.evaluate(() => { const B = window.__FV.scene.boathouse; return B.outStack.count; })); }
    const late = rows.slice(6);
    ok(late.filter((n) => n >= s0.max * 0.9).length <= 2, 'the pier pile drains with tuna in the catch (4 game minutes, every 10 s)', rows.join(','));
    for (const e of log.errors) errors.push('save46: ' + e);
    await page.context().close();
  }
  // ---------------------------------------------------------------- 3. a new game: buying the rowboat brings him
  {
    const { page, log } = await boot(null);
    await page.evaluate(() => { const F = window.__FV; F.give(20000); F.unlockV3(); F.teleport(2200, 900); });
    await advance(page, 2);
    const pads = await page.evaluate(() => Object.keys(window.__FV.scene.progress.pads).filter((k) => /boat|dock/.test(k)));
    const bought = await page.evaluate(() => window.__FV.completeStep('boat_rowboat'));
    await advance(page, 0.4);
    const s = await page.evaluate(() => { const F = window.__FV, gs = F.scene, ui = F.game.scene.getScene('UI'); return Object.assign({ boat: !!gs.progress.done.boat_rowboat, sub: ui && ui.bannerSub ? ui.bannerSub.text : null }, (() => { const q = {}; q.done = !!gs.progress.done.porter_dock; q.dockPorters = gs.porters.filter((p) => p.station === gs.boathouse).length; q.pad = !!gs.progress.pads.porter_dock; return q; })()); });
    ok(pads.indexOf('boat_rowboat') >= 0 && bought && s.boat && s.done && s.dockPorters === 1 && !s.pad, 'buying the rowboat: the 생선 짐꾼 comes with it, no 600-coin pad', s);
    ok(s.sub === '생선 짐꾼도 함께 와서 잡은 생선을 날라요', 'the rowboat banner says he came along: "' + s.sub + '"');
    await advance(page, 3);
    const s2 = await page.evaluate(() => { const gs = window.__FV.scene; return { pad: !!gs.progress.pads.porter_dock, dockPorters: gs.porters.filter((p) => p.station === gs.boathouse).length }; });
    ok(!s2.pad && s2.dockPorters === 1, 'no 생선 짐꾼 pad appears later, still one porter', s2);
    for (const e of log.errors) errors.push('fresh: ' + e);
    await page.context().close();
  }
} catch (e) { fail++; console.log('FATAL', e && e.stack || e); }
await browser.close(); await srv.close();
for (const e of errors.slice(0, 6)) console.log('  error: ' + String(e).slice(0, 300));
ok(errors.length === 0, '0 page errors', errors.length);
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} dockporter: ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
