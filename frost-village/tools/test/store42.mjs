// (v4.2 fix, the designer's "잡화점 판매원있는데 판매를 안해 사람들도 거기로 못가는건지") the general store, fixed-step clock:
//   node tools/test/store42.mjs
// 1. every plot a 잡화점 can stand on (a fresh game, all land open): every line place it offers is standable and apart
//    (w_m2 used to send 3 customers into the pines / the fog, e_m1 2, e_m2 1): the line bends around them, 6 places
// 2. on the plots whose line the border pines cover (w_m2, e_m1, se_m1, s_l1, se_l1) those pines turn see-through for
//    the store's customers (x-ray; before, a 잡화점 customer was not an x-ray subject)
// 3. the 46-min save (대장간 3,079 px from the 잡화점): the forge makes runs of one tool kind for the shop, so the 도구
//    짐꾼 carries a full load (before: 3.0 tools a trip, the forge full 26 % of the time, tool shelves empty 85 %)
// 4. '판매대가 비었어요' over the shelf while it is empty and a customer waits; gone when goods arrive
// 5. save + reload clean, 0 page errors
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAVE = fs.readFileSync(path.join(HERE, 'fixtures', 'v41_save_smart_46min.json'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra).slice(0, 300) : '')); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 500) : '')); } };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
async function boot(save) {
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: 1 });
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
const errors = [];
try {
  // ---------------------------------------------------------------- 1 + 2. every plot (a fresh game, all land open)
  {
    const { page, log } = await boot(null);
    const R = await page.evaluate(() => {
      const H = window.__FV, gs = H.scene, C = gs.collision;
      H.unlockV3({ e_dock: 'boathouse' });
      gs.refreshSites();
      const out = {};
      for (const id of ['e_m1', 'e_m2', 's_m1', 's_m2', 'se_m1', 'w_m1', 'w_m2', 's_l1', 'se_l1']) {
        const st = gs.sites[id];
        if (!st || st.state !== 'plot') { out[id] = { skipped: st ? st.state : 'none' }; continue; }
        st.start('store', { instant: true }); st.finish(true);
        const m = gs.store;
        const places = [], P = [];
        for (let i = 0; i < m.maxQueue; i++) {
          const q = m.slotPos(i);
          const apart = P.every((p) => Math.hypot(p.x - q.x, (p.y - q.y) * 2) >= 40);
          const offPads = [m.cash, m.register, m.shelf].every((o) => Math.hypot(o.x - q.x, (o.y - q.y) * 2) >= 60);
          places.push(C.inWalk(q.x, q.y) && !C.blocked(q.x, q.y, 13) && apart && offPads);
          P.push(q);
        }
        out[id] = { n: m.maxQueue, ok: places.every(Boolean), bent: !!m.cfg.slots, store: m };
      }
      window.__stores = out;
      return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.skipped ? v : { n: v.n, ok: v.ok, bent: v.bent }]));
    });
    const plots = Object.entries(R).filter(([, v]) => !v.skipped);
    ok(plots.length >= 7, 'a 잡화점 stands on ' + plots.length + ' plots', R);
    ok(plots.every(([, v]) => v.ok), 'every line place is standable, apart from the others and off the pads', R);
    ok(plots.every(([, v]) => v.n === 6) && R.w_m2.bent && R.e_m1.bent && R.e_m2.bent && !R.s_m1.bent, 'every plot keeps its 6 places: w_m2 / e_m1 / e_m2 bend around the pines, s_m1 is straight', R);
    // x-ray: customers standing in the lines the border pines cover (w_m2, e_m1, se_m1, s_l1, se_l1)
    const XR = {};
    for (const id of ['w_m2', 'e_m1', 'se_m1', 's_l1', 'se_l1']) {
      if (!R[id] || R[id].skipped) continue;
      await page.evaluate((id) => {
        const gs = window.__FV.scene, m = window.__stores[id].store;
        for (const s of Object.values(window.__stores)) if (s.store) { s.store.cfg.spawnEvery = 1e9; s.store.spawnT = 1e9; }
        for (const c of m.queue.slice()) { if (c.despawn) c.despawn(); }
        m.queue.length = 0;
        for (let i = 0; i < m.maxQueue; i++) m.spawnCustomer(i);
        // (only one 잡화점 in a real game: let this plot's store be the one the x-ray looks at)
        if (!window.__keepStore) window.__keepStore = gs.store;
        gs.store = m;
        // the chief by the line, the camera on him (no pan to the land just opened)
        const p = m.slotPos(2);
        window.__FV.setInput(0, 0); window.__FV.teleport(p.x + 60, p.y + 60); gs.camFocus = null;
      }, id);
      await advance(page, 1.5);
      await page.evaluate(() => { window.__FV.scene.camFocus = null; });
      await advance(page, 0.5);
      await render(page, 2);   // (the camera moves only when a frame is drawn)
      XR[id] = await page.evaluate(() => {
        const gs = window.__FV.scene, m = gs.store, p = m.slotPos(2);
        const view = gs.cameras.main.worldView;
        // only the customers count: the chief is left out of the x-ray for this look
        gs.player.noXray = true;
        const subj = gs.occlusion.collect(view);
        const inX = m.queue.filter((c) => subj.indexOf(c) >= 0).length;
        gs.occlusion.t = 0; gs.occlusion.update(0.05);
        const faded = (gs.occluders || []).filter((o) => o.want !== undefined && o.want < 1).length;
        gs.player.noXray = false;
        return { queue: m.queue.length, inX, faded, view: [Math.round(view.centerX), Math.round(view.centerY)], line: [Math.round(p.x), Math.round(p.y)] };
      });
    }
    await page.evaluate(() => { window.__FV.scene.store = window.__keepStore; });
    const xs = Object.entries(XR);
    ok(xs.length >= 4 && xs.every(([, v]) => v.inX === v.queue && v.queue >= 3), 'the store\'s customers are x-ray subjects on every covered plot', XR);
    // (whether a pine's pixels really cover a customer depends on the look that came: one plot may miss now and then)
    ok(XR.w_m2 && XR.w_m2.faded >= 1 && xs.filter(([, v]) => v.faded >= 1).length >= xs.length - 1, 'the pines in front of those lines turn see-through (w_m2 and at least ' + (xs.length - 1) + ' of ' + xs.length + ' plots)', XR);
    for (const e of log.errors) errors.push('plots: ' + e);
    await page.context().close();
  }
  // ---------------------------------------------------------------- 3 + 4. the 46-min save
  {
    const { page, log } = await boot(SAVE);
    // the chief parked away from every pad; the 도구 짐꾼's loads counted as he sets out
    await page.evaluate(() => {
      const F = window.__FV, gs = F.scene, K = gs.workshops.find((w) => w.kind === 'toolsmith');
      F.teleport(1907, 482); F.setInput(0, 0);
      window.__T = { loads: [], kinds: [], fullT: 0, t: 0 };
      for (const p of gs.porters) {
        if (p.station !== K) continue;
        const of = p.finishLoad.bind(p);
        p.finishLoad = () => { const n = p.stack.count; of(); if (p.state === 'haul' && n > 0) window.__T.loads.push(n); };
      }
    });
    for (let i = 0; i < 30; i++) {
      await advance(page, 10);
      await page.evaluate(() => { const F = window.__FV, gs = F.scene, K = gs.workshops.find((w) => w.kind === 'toolsmith'), T = window.__T; F.teleport(1907, 482); const kinds = new Set(K.outStack.items.map((it) => it.type)); T.kinds.push(kinds.size); T.t += 10; if (K.outStack.count + K.outStack.incoming + 1 > K.outStack.max) T.fullT += 10; });
    }
    const T = await page.evaluate(() => window.__T);
    // (the first load is what the save left on the pad, made before the runs)
    const runs = T.loads.slice(1), avg = runs.length ? runs.reduce((a, b) => a + b, 0) / runs.length : 0;
    ok(runs.length >= 3 && avg >= 6, 'the 도구 짐꾼 carries ' + avg.toFixed(1) + ' tools a trip (before 3.0), ' + T.loads.length + ' trips in 5 min', T.loads);
    ok(T.kinds.filter((k) => k <= 2).length >= T.kinds.length * 0.8, 'the forge\'s pad holds one or two kinds (runs), not five', T.kinds.join(''));
    // 4. the shelf-empty cue
    const E = await page.evaluate(() => {
      const gs = window.__FV.scene, S = gs.store;
      for (const g of S.goods) while (S.stock.countOf(g) > 0) { const it = S.stock.pop(g); if (it && it.spr) gs.effects.releaseItem(it.spr); }
      // nobody restocks for these seconds
      S.sink.enabled = false;
      // one customer already waiting at the counter (the line as it was may still be walking in)
      for (const c of S.queue.slice()) { if (c.despawn) c.despawn(); }
      S.queue.length = 0;
      S.spawnCustomer(0); S.spawnT = 1e9;
      return { shelf: S.stock.count };
    });
    // the shelf kept empty for 7 s (whatever was already on its way is taken off again): the label comes after 4 s
    const seen = [];
    for (let i = 0; i < 14; i++) {
      await advance(page, 0.5);
      seen.push(await page.evaluate(() => {
        const gs = window.__FV.scene, S = gs.store, f = S.queue[0];
        const r = { t: S.emptyT ? +S.emptyT.toFixed(1) : 0, shown: !!(S.emptyLab && S.emptyLab.c.visible), stock: S.stock.count, front: f ? (f.arrived ? 'a' : '-') + f.state + f.need : null };
        for (const g of S.goods) while (S.stock.countOf(g) > 0) { const it = S.stock.pop(g); if (it && it.spr) gs.effects.releaseItem(it.spr); }
        return r;
      }));
    }
    const E1 = await page.evaluate(() => { const S = window.__FV.scene.store; return { text: S.emptyLab ? S.emptyLab.tx.text : null }; });
    const shownAt = seen.findIndex((r) => r.shown);
    ok(E.shelf === 0 && shownAt >= 0 && seen[shownAt].t >= 4 && E1.text === '판매대가 비었어요', '"판매대가 비었어요" over the empty shelf after 4 s of a customer waiting', { shownAt: (shownAt + 1) * 0.5, seen: seen.map((r) => r.t + (r.shown ? '*' : '') + '/' + r.stock + '/' + r.front).join(' ') });
    await page.evaluate(() => { const gs = window.__FV.scene, S = gs.store; S.sink.enabled = true; for (let i = 0; i < 6; i++) S.stock.push('item_can', null, gs.effects); });
    await advance(page, 1);
    const E2 = await page.evaluate(() => { const S = window.__FV.scene.store; return !!(S.emptyLab && S.emptyLab.c.visible); });
    ok(!E2, 'goods on the shelf: the label goes', E2);
    // 5. save + reload
    const sv = await page.evaluate(() => { window.__FV.save(); return localStorage.getItem('frostVillage.save.v1'); });
    ok(JSON.parse(sv).v === 7, 'saves as v7');
    for (const e of log.errors) errors.push('s46: ' + e);
    await page.context().close();
    const again = await boot(sv);
    const R2 = await again.page.evaluate(() => { const S = window.__FV.scene.store; return { n: S.maxQueue, bent: !!S.cfg.slots, stock: S.stock.count }; });
    ok(R2.n === 6 && R2.bent && R2.stock >= 1, 'reload: the w_m2 store keeps its 6 places (bent) and its stock', R2);
    for (const e of again.log.errors) errors.push('reload: ' + e);
    await again.page.context().close();
  }
} catch (e) { fail++; console.log('FATAL', e && e.stack || e); }
await browser.close(); await srv.close();
for (const e of errors.slice(0, 6)) console.log('  error: ' + String(e).slice(0, 300));
ok(errors.length === 0, '0 page errors', errors.length);
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} store42: ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
