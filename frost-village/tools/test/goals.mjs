// (v4.3) 목표 창 · 자동 이동 · 길 안내 선, fixed-step clock, one browser:
//   node tools/test/goals.mjs
//   A 412x915 ko   a new game: during the first loop the 목표 button is hidden and the window refuses to open; once the
//                  tutorial hands over (the fisherman hired) the button shows, the window lists 벌목장 열기 as the current
//                  goal with the next ones; a tap walks the chief to its pad — he arrives on the exact spot, control is
//                  his again and standing there pays as if he walked
//   B 412x915 ko   the 25-min village: a REAL tap on the 목표 button opens the window (current / next / side rows); a
//                  tap on the objective panel opens it too; tapping rows walks the chief to several places, far ones
//                  too, and he arrives within ARRIVE px of each pad (never a teleport: he is seen on the way, the camera
//                  follows); the 길 안내 line ends on the exact spot meanwhile (its last point = the target, end marker);
//                  a joystick input stops a walk at once (toast); a locked goal / a place in the fog say why; 관망 on is
//                  switched off by a walk
//   C 360x640 en   the 46-min village: the window fits the smallest phone in English; a far walk arrives; the 길 안내
//                  while carrying bread to the dock: the drawn path runs from his boots to the exact place (the old dots
//                  stopped at 816 px), with the end marker, and glows at night; 0 page errors everywhere
//   (review fixes) the route reaches the place by itself (drawn = his boots + the route, nothing appended), the camera's
//   view (not its target) stays on him, a REAL joystick drag stops a walk, a drag ending on the objective panel opens
//   nothing, a plot walk opens its build menu on arrival, the trash pad keeps the bag during a walk, the yellow arrow
//   steps aside while he walks elsewhere, the line's render cost (renderWebGL) is measured, not only its update
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render, until } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.join(HERE, 'fixtures');
const ARRIVE = 12;            // ground px from the exact spot
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const t0 = Date.now();

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
async function boot(save, vp, lang) {
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: vp || { width: 412, height: 915 }, dpr: 1, locale: lang === 'en' ? 'en-US' : 'ko-KR' });
  await page.evaluate(([sv, l]) => { try { localStorage.clear(); if (sv) localStorage.setItem('frostVillage.save.v1', sv); localStorage.setItem('frostVillage.settings.v1', JSON.stringify({ lang: l })); } catch (e) { /* */ } }, [save, lang || 'ko']);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player && window.__FV.game.scene.getScene('UI').ready, 120000);
  await sleep(2000);
  await installStepper(page);
  await page.evaluate(() => { if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1; });
  await advance(page, 1);
  return { page, log };
}
const fixture = (n) => fs.readFileSync(path.join(FIX, n), 'utf8');

/** walk with goals.go(which) and step until it ends: { res, ms, end, d, seen, camOff, navEnd } */
async function walk(page, which, maxS = 70) {
  const p0 = await page.evaluate(() => { const p = window.__FV.scene.player; return [p.x, p.y]; });
  const res = await page.evaluate((w) => window.__FV.v42.goals.go(w), which);
  if (!res.ok) return { res };
  const d0 = res.target ? Math.round(Math.hypot(res.target.x - p0[0], (res.target.y - p0[1]) * 2)) : null;
  const S = { mid: null, navEnd: null, marker: false, seen: 0, camOff: 0, steps: 0, arrowElse: 0, routeOk: true };
  for (let t = 0; t < maxS; t += 0.5) {
    const s = await page.evaluate(() => {
      window.__step.run(0.5);
      // (the camera moves on drawn frames only: draw two, then read its view's middle)
      window.__step.frame(); window.__step.frame();
      const F = window.__FV, gs = F.scene, p = gs.player, w = F.v42.goals.state(), N = F.v42.v.nav, n = N.state(), cm = gs.cameras.main.midPoint;
      const T = gs.tutorial, tg = T && T.shownTarget ? T.shownTarget() : null;
      const arrowElse = !!(T && T.arrow.visible && w.target && tg && (Math.abs(tg.x - w.target.x) > 40 || Math.abs(tg.y - w.target.y) > 60));
      const rl = N.route[N.route.length - 1];
      return { on: w.on, last: w.last, p: [p.x, p.y], drawn: n.drawn, dest: n.dest, cam: [cm.x, cm.y + 30], target: w.target, arrowElse, routeEnd: rl ? [Math.round(rl.x), Math.round(rl.y)] : null, routeN: N.route.length };
    });
    S.steps++;
    if (s.on) {
      S.seen++;
      S.camOff = Math.max(S.camOff, Math.hypot(s.cam[0] - s.p[0], s.cam[1] - s.p[1]));
      if (s.arrowElse) S.arrowElse++;
      // (the route itself ends on the place, and the drawing is his boots + that route: nothing appended at the end)
      if (s.drawn && s.target && !(s.routeEnd && s.routeEnd[0] === s.target.x && s.routeEnd[1] === s.target.y && s.drawn.n === s.routeN + 1)) { S.routeOk = false; S.routeBad = { routeEnd: s.routeEnd, n: s.drawn.n, routeN: s.routeN, target: s.target }; }
      if (s.drawn && !S.navEnd) { S.navEnd = s.drawn.last; S.marker = s.drawn.marker; S.ring = s.drawn.ring; S.navFirst = s.drawn.first; S.chiefAt = s.p; S.target = s.target; }
      if (!S.mid && t >= 1) S.mid = s.p;
    }
    if (!s.on) break;
  }
  const end = await page.evaluate(() => { const F = window.__FV, p = F.scene.player, w = F.v42.goals.state(); return { w, p: [p.x, p.y] }; });
  const T = end.w.target;
  const d = T ? Math.hypot(end.p[0] - T.x, (end.p[1] - T.y) * 2) : null;
  return Object.assign(S, { res, end, d, d0, ms: S.steps * 500 });
}

try {
  // ================================================================== A: a new game
  console.log('— A: a new game, 412x915, ko');
  {
    const { page, log } = await boot(null);
    const a0 = await page.evaluate(() => { const G = window.__FV.v42.goals; const p0 = G.panel(); const o = G.open(); const b = G.book(); return { p0, o, b, tut: window.__FV.scene.tutorial.inTutorial, tap: G.tapObjective() }; });
    ok(a0.tut && !a0.p0.button && !a0.o.open && !a0.tap && !a0.p0.objTap, 'the first loop: the 목표 button is hidden, the window and the objective panel do not open it', a0.p0);
    // the first loop done (the hooks a bot would earn): the tutorial hands over
    await page.evaluate(() => { const F = window.__FV, pr = F.scene.progress; pr.flags.firstSale = true; for (const id of ['hire_clerk_market', 'op_grill', 'hire_fisherman']) F.doneStep(id); pr.syncPads(); });
    await advance(page, 2);
    const a1 = await page.evaluate(() => { const G = window.__FV.v42.goals; return { p: G.panel(), b: G.book(), tut: window.__FV.scene.tutorial.inTutorial }; });
    ok(!a1.tut && a1.p.button, 'after the hand-over the 목표 button shows', a1.p);
    ok(a1.b.cur && a1.b.cur.id === 'zone_forest' && a1.b.cur.place && a1.b.next.length === 3 && a1.b.next[0].id === 'op_sawmill' && a1.b.done === 3, 'the window: 지금 = 벌목장 열기 (its pad), then 제재공 · 나무꾼 · …, 3 done', { cur: a1.b.cur, next: a1.b.next.map((r) => r.id), done: a1.b.done, all: a1.b.all });
    const o1 = await page.evaluate(() => window.__FV.v42.goals.open());
    ok(o1.open && o1.rows[0] === 'zone_forest', 'it opens; the first row is the current goal', o1);
    // a tap on that row: he walks there, arrives on the spot, then paying works as if he had walked
    const cost = a1.b.cur.coins;
    await page.evaluate((c) => { window.__FV.scene.economy.coins = c + 50; }, cost);
    await page.evaluate(() => window.__FV.v42.goals.tapRow('zone_forest'));
    const st = await page.evaluate(() => { const F = window.__FV, w = F.v42.goals.state(), p = F.scene.player, pd = F.scene.progress.pads.zone_forest; return { w, p: [p.x, p.y], pad: pd ? [pd.x, pd.y] : null, open: F.v42.goals.panel().open }; });
    ok(!st.open && st.w.stats.started === 1, 'the tap closed the window and started the walk', st);
    // (tapRow started it; wait for it to end)
    await until(page, () => !window.__FV.v42.goals.state().on, 40);
    const e1 = await page.evaluate(() => { const F = window.__FV, w = F.v42.goals.state(), p = F.scene.player; return { w, p: [p.x, p.y] }; });
    const dA = Math.hypot(e1.p[0] - e1.w.target.x, (e1.p[1] - e1.w.target.y) * 2);
    ok(e1.w.last === 'arrived' && dA <= ARRIVE, 'he arrives on the 벌목장 pad (' + dA.toFixed(1) + ' px from its centre)', e1);
    const paid = await page.evaluate(() => { window.__step.run(2.5); const F = window.__FV, pr = F.scene.progress; return { done: pr.isDone('zone_forest'), pad: pr.pads.zone_forest ? pr.pads.zone_forest.paid : null, coins: F.scene.economy.coins }; });
    ok(paid.done || paid.pad > 0, 'standing there pays (control is his: as if he walked)', paid);
    ok(log.errors.length === 0, 'A: 0 page errors', log.errors.slice(0, 5));
    await page.context().close();
  }

  // ================================================================== B: the 25-min village
  console.log('— B: the 25-min village, 412x915, ko');
  {
    const { page, log } = await boot(fixture('v41_save_smart_25min.json'));
    const b0 = await page.evaluate(() => window.__FV.v42.goals.book(3, 12));
    console.log('       cur ' + (b0.cur && b0.cur.id) + ' · next ' + b0.next.map((r) => r.id + ':' + r.state).join(', ') + ' · side ' + b0.side.map((r) => r.id).join(', ') + ' · done ' + b0.done + '/' + b0.all);
    ok(b0.cur && b0.next.length >= 1 && b0.side.length >= 1 && b0.done >= 15, 'the book: a current goal, next goals, side goals, ≥ 15 done', { cur: b0.cur, n: b0.next.length, s: b0.side.length, done: b0.done });
    // ((v4.3 step B, P) the hall is the first goal after village complete (1,200 coins); the hut → office is a side row
    //  before 읍, never a main row)
    ok(b0.cur && b0.cur.id === 'town_hall' && b0.cur.coins === 1200 && b0.cur.place, '(step B) the 25-min village: 지금 = 마을회관 짓기 (1,200), with a place', b0.cur);
    ok(b0.side.some((r) => r.id === 'plot:v42_office' && r.coins === 400) && !b0.next.some((r) => r.id === 'v42:chief_office'), '(step B) the office is a side row (400) before 읍, not a main row', { side: b0.side.map((r) => r.id + ':' + r.coins), next: b0.next.map((r) => r.id) });
    // a REAL tap on the 목표 button
    const c = await page.$('canvas'); const bb = await c.boundingBox(); const k = bb.width / 720;
    const p0 = await page.evaluate(() => window.__FV.v42.goals.panel());
    await page.touchscreen.tap(bb.x + p0.btnAt[0] * k, bb.y + p0.btnAt[1] * k);
    await sleep(300);
    await page.evaluate(() => window.__step.run(0.6));
    const p1 = await page.evaluate(() => window.__FV.v42.goals.panel());
    ok(p1.open && p1.rows.length >= 3 && b0.cur && p1.rows[0] === b0.cur.id, 'a real tap on the 목표 button opens the window (rows: ' + p1.rows.join(', ') + ')', p1);
    ok(p1.fit && p1.fit.maxY <= p1.fit.bottom + 1 && p1.fit.minX >= p1.fit.left - 1 && p1.fit.maxX <= p1.fit.right + 1, 'every row and text inside the window', p1.fit);
    const paused = await page.evaluate(() => window.__FV.game.scene.isPaused('Game'));
    ok(!paused, 'the window does not pause the village');
    // a tap outside closes it
    await page.touchscreen.tap(bb.x + 20 * k, bb.y + (bb.height / k - 30) * k);
    await sleep(200);
    await page.evaluate(() => window.__step.run(0.4));
    ok(!(await page.evaluate(() => window.__FV.v42.goals.panel().open)), 'a tap outside closes it');
    // the objective panel opens it too
    await page.evaluate(() => { window.__FV.clearStack(); window.__step.run(3); });
    const ob = await page.evaluate(() => { const G = window.__FV.v42.goals; const r = G.tapObjective(); window.__step.run(0.3); const s = G.panel(); G.close(); return { r, open: s.open, tap: s.objTap }; });
    ok(ob.r && ob.open, 'a tap on the objective panel opens the window', ob);
    // walks: the current goal and the side goals, the farthest first (≥ 3 places)
    const targets = await page.evaluate(() => {
      const F = window.__FV, p = F.scene.player, b = F.v42.goals.book(3, 20);
      const all = [b.cur].concat(b.side).filter((r) => r && r.place);
      all.sort((a, c) => Math.hypot(c.place.x - p.x, (c.place.y - p.y) * 2) - Math.hypot(a.place.x - p.x, (a.place.y - p.y) * 2));
      return all.slice(0, 4).map((r) => ({ id: r.id, name: r.name, x: r.place.x, y: r.place.y, d: Math.round(Math.hypot(r.place.x - p.x, (r.place.y - p.y) * 2)) }));
    });
    ok(targets.length >= 3, '≥ 3 places to walk to (' + targets.map((q) => q.id + ' ' + q.d + ' px').join(', ') + ')', targets);
    let far = 0;
    for (const tg of targets) {
      // (keep coins away so standing there does not buy it: the next walk starts from that pad)
      await page.evaluate(() => { window.__FV.scene.economy.coins = 0; });
      const w = await walk(page, tg.id === b0.cur.id ? 'cur' : tg.id, 90);
      if (!w.res || !w.res.ok) { ok(false, 'walk to ' + tg.id, w.res); continue; }
      far = Math.max(far, w.d0 || 0);
      ok(w.end.w.last === 'arrived' && w.d <= ARRIVE, 'walked to ' + tg.name + ' (' + w.d0 + ' px from where he stood): arrived ' + (w.d || 0).toFixed(1) + ' px from the spot in ' + (w.ms / 1000).toFixed(1) + ' s', { last: w.end.w.last, d: w.d, stats: w.end.w.stats });
      ok(w.seen >= 2 && w.mid && Math.hypot(w.mid[0] - tg.x, w.mid[1] - tg.y) > 30, '  …walking, not a teleport (seen on the way)', { seen: w.seen, mid: w.mid });
      // (the walk's own target: a building goal's plot is the free plot nearest to him when he sets off)
      const wt = w.target || w.end.w.target;
      ok(w.navEnd && wt && w.navEnd[0] === wt.x && w.navEnd[1] === wt.y && w.marker && w.ring && w.ring[0] === wt.x && w.ring[1] === wt.y && w.routeOk, '  …the 길 안내 route reached the exact spot by itself, the line and its marker end there', { navEnd: w.navEnd, ring: w.ring, target: wt, marker: w.marker, routeBad: w.routeBad });
      ok(w.camOff < 260, '  …the camera\'s view followed him (' + Math.round(w.camOff) + ' px off at most)', w.camOff);
      ok(w.arrowElse === 0, '  …the yellow arrow stepped aside while he walked elsewhere', w.arrowElse);
      // ((v4.3 step B, L1) a walk can end on a plot's drop pad (the new d_wh spot): its build menu opens and pauses the walks
      //  that follow — close it before the next goal)
      await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); if (ui.buildOpen) ui.closeBuildMenu(true); });
    }
    ok(far >= 1200, 'one of them was far (' + far + ' px)');
    // a joystick input stops a walk at once (a walk to the place farthest from where he stands now)
    const farthest = () => {
      const F = window.__FV, p = F.scene.player, b = F.v42.goals.book(3, 20);
      const all = [b.cur].concat(b.side).filter((r) => r && r.place);
      all.sort((a, c) => Math.hypot(c.place.x - p.x, (c.place.y - p.y) * 2) - Math.hypot(a.place.x - p.x, (a.place.y - p.y) * 2));
      return all[0] ? (b.cur && all[0].id === b.cur.id ? 'cur' : all[0].id) : 'cur';
    };
    const far1 = await page.evaluate(farthest);
    await page.evaluate((id) => window.__FV.v42.goals.go(id), far1);
    await page.evaluate(() => { window.__step.run(0.6); window.__step.frame(); });
    // (a REAL touch drag on the village, through the browser's touch events)
    const cdp = await page.context().newCDPSession(page);
    const on0 = await page.evaluate(() => window.__FV.v42.goals.state().on);
    const jx = bb.x + 360 * k, jy = bb.y + (bb.height / k) * 0.62 * k;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: jx, y: jy, id: 7 }] });
    await page.evaluate(() => window.__step.frame());
    let nFr = 1;
    for (let i = 1; i <= 6; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: jx - i * 12, y: jy, id: 7 }] });
      await page.evaluate(() => window.__step.frame()); nFr++;
      if (!(await page.evaluate(() => window.__FV.v42.goals.state().on))) break;
    }
    const j = await page.evaluate(() => { const F = window.__FV, ui = F.game.scene.getScene('UI'), s = F.v42.goals.state(); return { on: s.on, last: s.last, toast: ui.toastBox.visible ? ui.toastText.text : null }; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.evaluate(() => { window.__step.frame(); window.__step.run(0.2); });
    ok(on0 && !j.on && j.last === 'human' && /직접 조종/.test(j.toast || '') && nFr <= 6, 'a real joystick drag stops the walk within ' + nFr + ' frames (toast 「' + j.toast + '」)', Object.assign({ on0, nFr }, j));
    // ((review M3) a drag that began on the village and ends on the objective panel opens nothing; a tap on it does)
    {
      await page.evaluate(() => { window.__FV.clearStack(); window.__step.run(3); window.__step.frame(); });
      const op = await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); return { x: ui.objPanel.x, y: ui.objPanel.y, vis: ui.objPanel.visible, inp: !!(ui.objPanel.input && ui.objPanel.input.enabled), H: ui.H }; });
      const sx = bb.x + 360 * k, sy = bb.y + op.H * 0.6 * k, ex = bb.x + op.x * k, ey = bb.y + op.y * k;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 8 }] });
      await page.evaluate(() => window.__step.frame());
      for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + (ex - sx) * i / 8, y: sy + (ey - sy) * i / 8, id: 8 }] }); await page.evaluate(() => window.__step.frame()); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(100);
      await page.evaluate(() => { window.__step.frame(); window.__step.run(0.3); });
      const dr = await page.evaluate(() => ({ open: window.__FV.v42.goals.panel().open }));
      await page.evaluate(() => window.__FV.v42.goals.close());
      // (and a real tap on it still opens the window)
      await page.touchscreen.tap(ex, ey);
      await sleep(150);
      await page.evaluate(() => { window.__step.frame(); window.__step.run(0.3); });
      const tp = await page.evaluate(() => ({ open: window.__FV.v42.goals.panel().open }));
      await page.evaluate(() => window.__FV.v42.goals.close());
      ok(op.vis && op.inp && !dr.open && tp.open, 'a joystick drag ending on the objective panel opens nothing; a real tap on it opens the window', { op, drag: dr.open, tap: tp.open });
    }
    // ((review L2) the trash pad keeps the bag while a walk is on (wedged on it for 1 s on the way)
    const tr = await page.evaluate(() => {
      const F = window.__FV, gs = F.scene, G = F.v42.goals, T = gs.trash;
      if (!T || !T.enabled) return { skip: true };
      F.clearStack(); F.carry('item_log', 4);
      F.teleport(T.x + 300, T.y + 150); window.__step.run(0.2);
      const sm = gs.stations.smelter;
      const r = G.goTo(sm.x + 80, sm.y + 140, 'far');
      F.teleport(T.x, T.y);
      const n0 = gs.player.stack.count;
      for (let i = 0; i < 60; i++) { if (G.state().on) F.teleport(T.x, T.y); window.__step.run(1 / 60); }
      const n1 = gs.player.stack.count, on = G.state().on;
      G.stop();
      F.clearStack();
      return { r, n0, n1, on };
    });
    if (tr.skip) console.log('       (no trash pad here: skipped)');
    else ok(tr.r && tr.r.ok && tr.n0 === 4 && tr.n1 === 4, 'wedged on the trash pad for 1 s during a walk: the bag stays (' + tr.n1 + '/4)', tr);
    // ((review L10) a walk to a first house's plot: on arrival its build menu opens (control is his: as if he walked)
    {
      const pr = await page.evaluate(() => { const b = window.__FV.v42.goals.book(3, 20); const r = b.side.find((q) => q.kind === 'plot' && q.place) || (b.cur && b.cur.kind === 'build' && b.cur.place ? b.cur : null); return r ? { id: b.cur && r.id === b.cur.id ? 'cur' : r.id, name: r.name } : null; });
      if (!pr) console.log('       (no plot to walk to here: skipped)');
      else {
        const w = await walk(page, pr.id, 90);
        const bo = await page.evaluate(() => { window.__step.run(1.2); const ui = window.__FV.game.scene.getScene('UI'), open = !!ui.buildOpen; if (open) ui.closeBuildMenu(true); return open; });
        ok(w.res && w.res.ok && w.end.w.last === 'arrived' && bo, 'a walk to 「' + pr.name + '」: arrived, and its build menu opened', { last: w.end && w.end.w.last, buildOpen: bo });
      }
    }
    // locked / unreachable
    const lk = await page.evaluate(() => {
      const G = window.__FV.v42.goals, b = G.book(6, 4), ui = window.__FV.game.scene.getScene('UI');
      const i = b.next.findIndex((r) => !r.place);
      const r = i >= 0 ? G.go(i) : null;
      const t1 = ui.toastText.text;
      const u = G.goTo(-6000, 300, 'fog');
      return { i, r, t1, u, on: G.state().on };
    });
    ok(lk.i >= 0 && lk.r && !lk.r.ok && (lk.r.why === 'locked' || lk.r.why === 'passive' || lk.r.why === 'noplot') && lk.t1, 'a later goal with no place yet: no walk, a friendly line (「' + lk.t1 + '」)', lk);
    ok(lk.u && !lk.u.ok && lk.u.why === 'noway' && !lk.on, 'a place off the land (the fog): cannot go', lk.u);
    // 관망 on: a walk switches it off
    const far2 = await page.evaluate(farthest);
    const pl = await page.evaluate((id) => {
      const F = window.__FV, P = F.v42.v.pilot;
      if (!P || !P.available) return { skip: true };
      P.start('test');
      window.__step.run(1);
      const on0 = P.on;
      const r = F.v42.goals.go(id);
      window.__step.run(0.5);
      const s = { on0, r, pilot: P.on, walk: F.v42.goals.state().on };
      F.v42.goals.stop();
      return s;
    }, far2);
    if (pl.skip) console.log('       (관망 not available here: skipped)');
    else ok(pl.on0 && pl.r.ok && !pl.pilot && pl.walk, '관망 on: the walk switches it off and walks', pl);
    ok(log.errors.length === 0, 'B: 0 page errors', log.errors.slice(0, 5));
    await page.context().close();
  }

  // ================================================================== C: the 46-min village, 360x640 en
  console.log('— C: the 46-min village, 360x640, en');
  {
    const { page, log } = await boot(fixture('v41_save_smart_46min.json'), { width: 360, height: 640 }, 'en');
    const p1 = await page.evaluate(() => { const G = window.__FV.v42.goals; G.open(); window.__step.run(0.3); return { p: G.panel(), b: G.book(3, 12) }; });
    console.log('       cur ' + (p1.b.cur && p1.b.cur.id) + ' · rows ' + p1.p.rows.join(', '));
    ok(p1.p.open && p1.p.rows.length >= 3 && p1.p.fit && p1.p.fit.maxY <= p1.p.fit.bottom + 1 && p1.p.fit.maxX <= p1.p.fit.right + 1 && p1.p.fit.minX >= p1.p.fit.left - 1, 'the window fits 360x640 in English (' + p1.p.rows.length + ' rows)', p1.p.fit);
    ok(p1.p.texts && p1.p.texts.every((s) => !/^g_/.test(s)), 'every line is in words (no raw keys)', p1.p.texts && p1.p.texts.filter((s) => /^g_/.test(s)));
    await page.evaluate(() => window.__FV.v42.goals.close());
    // a far walk
    const tg = await page.evaluate(() => {
      const F = window.__FV, p = F.scene.player, b = F.v42.goals.book(3, 20);
      const all = [b.cur].concat(b.side).filter((r) => r && r.place);
      all.sort((a, c) => Math.hypot(c.place.x - p.x, (c.place.y - p.y) * 2) - Math.hypot(a.place.x - p.x, (a.place.y - p.y) * 2));
      const r = all[0];
      return r ? { id: r.id, cur: b.cur && r.id === b.cur.id, d: Math.round(Math.hypot(r.place.x - p.x, (r.place.y - p.y) * 2)), name: r.name } : null;
    });
    if (tg) {
      await page.evaluate(() => { window.__FV.scene.economy.coins = 0; });
      const w = await walk(page, tg.cur ? 'cur' : tg.id, 90);
      ok(w.res && w.res.ok && w.end.w.last === 'arrived' && w.d <= ARRIVE, 'a far walk (' + tg.name + ', ' + w.d0 + ' px): arrived ' + (w.d || 0).toFixed(1) + ' px from the spot in ' + (w.ms / 1000).toFixed(1) + ' s', { res: w.res, last: w.end && w.end.w.last, d: w.d });
    } else ok(false, 'a place to walk to in the 46-min village');
    // the 길 안내 while carrying: the drawn path from his boots to the exact place, day and night
    const nv = await page.evaluate(() => {
      const F = window.__FV, gs = F.scene, N = F.v42.v.nav, sm = gs.stations.smelter;
      // (the clock set and its tint settled at once: it fades over a few seconds in play)
      const C = gs.v4 && gs.v4.clock;
      const settle = () => { if (!C) return; const q = C.target(C.hour()); C.cur.a = q.a; C.cur.r = (q.color >> 16) & 255; C.cur.g = (q.color >> 8) & 255; C.cur.b = q.color & 255; };
      F.clearStack(); N.loadSig = null; F.setInput(0, 0); F.teleport(sm.x + 80, sm.y + 140); F.carry('item_bread', 4);
      if (F.v4) F.v4.clock(11);
      settle();
      window.__step.run(0.8);
      N.pickT = 0; N.update(1 / 60);
      const day = N.state(), p = gs.player;
      if (F.v4) F.v4.clock(21.5);
      settle();
      window.__step.run(0.3);
      settle();
      window.__step.run(0.1);
      const night = N.state();
      const cost = (() => { let best = Infinity; for (let b = 0; b < 6; b++) { const a = performance.now(); for (let i = 0; i < 60; i++) N.update(1 / 60); best = Math.min(best, (performance.now() - a) / 60); } return best; })();
      // ((review M2) what the renderer spends on the line (its WebGL batch), not only the drawing commands: night, best of 4
      const orig = N.line.renderWebGL, st = { t: 0, n: 0 };
      N.line.renderWebGL = function (...a) { const t0 = performance.now(); const r = orig.apply(this, a); st.t += performance.now() - t0; st.n++; return r; };
      let render = Infinity;
      for (let b = 0; b < 4; b++) { st.t = st.n = 0; for (let i = 0; i < 30; i++) window.__step.frame(); if (st.n) render = Math.min(render, st.t / st.n); }
      N.line.renderWebGL = orig;
      if (F.v4) F.v4.clock(11);
      F.clearStack();
      return { day, night, chief: [p.x, p.y], cost, render };
    });
    const d = nv.day;
    ok(d.active && d.dest && d.drawn && d.drawn.last[0] === d.dest.x && d.drawn.last[1] === d.dest.y && d.drawn.marker, 'carrying bread to ' + (d.dest && d.dest.label) + ' (' + d.routeLen + ' px): the drawn path ends on the exact place, with the end marker', { dest: d.dest, drawn: d.drawn });
    ok(d.drawn && Math.hypot(d.drawn.first[0] - nv.chief[0], d.drawn.first[1] - nv.chief[1]) < 2, '…and starts at his boots (the whole way drawn, not 16 dots)', { first: d.drawn && d.drawn.first, chief: nv.chief });
    ok(!d.drawn.glow && nv.night.drawn && nv.night.drawn.glow, 'it glows above the night overlay after dark only', { day: d.drawn.glow, night: nv.night.drawn });
    ok(d.objects <= 20, '≤ 20 display objects (' + d.objects + ')');
    ok(nv.cost < 0.15, 'navigator update incl. the path ' + nv.cost.toFixed(3) + ' ms a frame (best of 6 batches)', nv.cost);
    ok(nv.render < 0.15, 'the line\'s render (WebGL batch, at night) ' + (Number.isFinite(nv.render) ? nv.render.toFixed(3) : nv.render) + ' ms a frame (was 0.25–0.37 with a disc at every corner and Graphics ellipses)', nv.render);
    ok(log.errors.length === 0, 'C: 0 page errors', log.errors.slice(0, 5));
    await page.context().close();
  }
} catch (e) {
  fail++;
  console.log('  FAIL exception: ' + (e && e.stack ? e.stack : e));
} finally {
  await browser.close();
  await srv.close();
}
console.log(`goals: ${pass} passed, ${fail} failed  (wall ${Math.round((Date.now() - t0) / 1000)}s)`);
process.exit(fail ? 1 : 0);
