// (designer report "내비서 날 빨리 안따라와 나와 속도 동일하게") 총총이 (the aide, src/entities/staff/Staff.js Aide) keeps
// up with the chief: she walks at his speed (base × shoes), a little faster when she has fallen behind, never stops and
// starts while he walks, and settles beside him when he stops. Fixed-step clock, the v4.1 46-min save + the office.
//   node tools/test/aidefollow.mjs [--json out.json] [--dpr 3]
// Runs (distance = ground metres between her and the chief, 64 px a metre, sampled every 0.1 s):
//   straight · base speed (no shoes), straight · max shoes, zig-zag · max shoes, south · max shoes, then each stops
// Checks: steady state (from 1.5 s after he starts until he stops) within 3 m (zig-zag 3.5 m) · no stop-and-go while
// he walks (her anim stays the walk; her speed never under half of his unless she is sliding round a prop) · on straight
// runs on average at least his speed · her walk plays faster at his speed (timeScale) · 2 s after he stops she stands
// still beside him (0.5–2.5 m) · he jumps 1250 px away on screen: she walks up within 5 s · the stay-home rules (far
// from the office — her way home planned once —, the chief inside the office, 관망) and the teleport rule (far, off
// screen, the camera elsewhere) still hold · her way home at her follow pace · back from far away she comes out of the
// office to him · 0 page errors.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance } from './fv_step.mjs';
import { asStepB } from './v43_helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
// ((v4.3 step B, S6 — the B0 suite audit, BP-21: asStepB) 총총이 follows the chief on the saved village: the fixture carries the step-B
//  marker, so the R43 remap (workshops to their d_* plots, the chief back at the hut door) is no part of this test
const SAVE = asStepB(JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'v41_save_smart_46min.json'), 'utf8')));
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 400) : '')); } };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const out = { runs: {} };
const errors = [];
try {
  const INIT = `try { if (!sessionStorage.getItem('__afInit')) { sessionStorage.setItem('__afInit', '1'); localStorage.clear(); localStorage.setItem('frostVillage.save.v1', ${JSON.stringify(JSON.stringify(SAVE))}); } } catch (e) {}`;
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: Number(arg('--dpr') || 1), init: INIT });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 180000);
  await sleep(1500);
  await installStepper(page);
  await page.evaluate(() => { if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1; });
  await advance(page, 1);
  await page.evaluate(() => { window.__FV.v42.office({ build: true }); window.__FV.v42.office({ hire: ['sem', 'ttal', 'bok', 'chong'] }); });
  await advance(page, 1);
  const hired = await page.evaluate(() => !!window.__FV.scene.v42.office.staff.chong);
  ok(hired, '총총이 is hired');
  // ((check) the office swaps its stand-in staff for the officefolk dolls when that art arrives (Staff.redress: a new
  //  Aide in her place): wait for the doll, and read her from the office every sample (a swap mid-run left the test
  //  watching the old, destroyed one: 16 m "behind", 0 px/s)
  for (let i = 0; i < 120; i++) {
    if (await page.evaluate(() => { const a = window.__FV.scene.v42.office.staff.chong; return !!(a && a.dressedOf); })) break;
    await page.evaluate(() => window.__step.run(0.5)); await sleep(250);
  }

  /** put the chief at (x, y) with shoes `lvl`, the aide beside him, let her settle */
  const setup = (x, y, lvl) => page.evaluate(([x, y, lvl]) => {
    const F = window.__FV, gs = F.scene, a = gs.v42.office.staff.chong;
    const ck = gs.v4 && gs.v4.clock; if (ck && ck.on) ck.set(10);
    gs.progress.up.speed = lvl;
    F.setInput(0, 0); F.teleport(x, y);
    if (a.seat) a.standUp();
    a.x = x - 70; a.y = y + 30; a.route.length = 0; a.target = null; a.lastHx = 1; a.lastHy = 0;
    window.__step.run(3);
    return { speed: gs.player.speed };
  }, [x, y, lvl]);

  /** drive the chief: input(t) -> [ix, iy] for `secs`, then stand `still` s; sample every 0.1 s */
  const drive = async (name, input, secs, still) => {
    const rows = await page.evaluate(([src, secs, still]) => {
      const F = window.__FV, gs = F.scene, p = gs.player;
      let a = gs.v42.office.staff.chong;
      const inp = new Function('t', 'return (' + src + ')(t);');
      const R = [];
      let ax = a.x, ay = a.y, px = p.x, py = p.y;
      const gd = (x1, y1, x2, y2) => Math.hypot(x1 - x2, (y1 - y2) * 2);
      for (let t = 0; t < secs + still - 1e-6; t += 0.1) {
        const moving = t < secs - 1e-6;
        const v = moving ? inp(t) : [0, 0];
        F.setInput(v[0], v[1]);
        window.__step.run(0.1);
        a = gs.v42.office.staff.chong;
        const ts = a.sprite && a.sprite.anims ? a.sprite.anims.timeScale : 1;
        // touching a prop (a fence, a tree): she slides around it — a bump, not a stop-and-go of her own
        const bump = (gs.collision.all || []).some((o) => o.active && !o.seg && Math.hypot(o.x - a.x, (o.y - a.y) * 2) < o.r + (a.radius || 12) + 8);
        R.push({ t: +(t + 0.1).toFixed(1), moving, bump, d: +(gd(a.x, a.y, p.x, p.y) / 64).toFixed(2),
          as: Math.round(Math.hypot(a.x - ax, a.y - ay) / 0.1), cs: Math.round(Math.hypot(p.x - px, p.y - py) / 0.1),
          anim: a.animName, ts: +(ts || 1).toFixed(2), doing: a.doing });
        ax = a.x; ay = a.y; px = p.x; py = p.y;
      }
      F.setInput(0, 0);
      return R;
    }, [input.toString(), secs, still]);
    out.runs[name] = rows;
    return rows;
  };

  const judge = (name, rows, secs, maxD, speedCheck) => {
    const steady = rows.filter((r) => r.moving && r.t >= 1.5 && r.t <= secs);
    const dMax = Math.max(...steady.map((r) => r.d));
    const slow = steady.filter((r) => (r.as < 0.5 * r.cs && !r.bump) || r.anim !== 'walk');
    const bumps = steady.filter((r) => r.bump).length;
    const meanA = steady.reduce((s, r) => s + r.as, 0) / steady.length, meanC = steady.reduce((s, r) => s + r.cs, 0) / steady.length;
    const tsMin = Math.min(...steady.map((r) => r.ts));
    const after = rows.filter((r) => !r.moving && r.t >= secs + 2 - 1e-6);
    const last = rows[rows.length - 1];
    const stillMoves = after.filter((r) => r.as > 3).length;
    const summary = { dMax, slow: slow.length, bumps, meanAide: Math.round(meanA), meanChief: Math.round(meanC), tsMin, stopD: last.d, stillMoves, series: rows.filter((r, i) => i % 5 === 4).map((r) => r.d).join(' ') };
    console.log('  ' + name + ': ' + JSON.stringify(summary));
    ok(dMax <= maxD, name + ': steady state within ' + maxD + ' m (max ' + dMax + ' m)');
    ok(slow.length === 0, name + ': no stop-and-go while he walks (under half his speed away from props, or not walking: ' + slow.length + ' of ' + steady.length + ' samples; ' + bumps + ' prop bumps)', slow.slice(0, 3));
    // (on a zig-zag she walks the smoother line behind him: shorter than his, so no mean-speed check there)
    if (speedCheck) ok(meanA >= 0.95 * meanC, name + ': on average at least his speed (' + Math.round(meanA) + ' vs ' + Math.round(meanC) + ' px/s)');
    ok(tsMin >= 1.5, name + ': her walk plays faster at his speed (timeScale ' + tsMin + ')');
    ok(last.d >= 0.5 && last.d <= 2.5 && stillMoves === 0, name + ': 2 s after he stops she stands beside him (' + last.d + ' m, moves ' + stillMoves + ')');
    out[name] = summary;
  };

  console.log('straight, base speed');
  await setup(150, 1050, 0);
  judge('straight_base', await drive('straight_base', (t) => [1, 0], 4.5, 3), 4.5, 3.0, true);
  console.log('straight, max shoes');
  await setup(150, 1050, 4);
  judge('straight_max', await drive('straight_max', (t) => [1, 0], 3.3, 3), 3.3, 3.0, true);
  console.log('zig-zag, max shoes');
  await setup(150, 1080, 4);
  judge('zigzag_max', await drive('zigzag_max', (t) => [0.8, Math.floor(t / 0.5) % 2 ? 0.6 : -0.6], 3.3, 3), 3.3, 3.5);
  console.log('south, max shoes');
  await setup(560, 520, 4);
  judge('south_max', await drive('south_max', (t) => [0, 1], 3.0, 3), 3.0, 3.0, true);

  console.log('rules');
  const rules = await page.evaluate(() => {
    const F = window.__FV, gs = F.scene, O = gs.v42.office, p = gs.player, B = O.building;
    const a = new Proxy({}, { get: (t, k) => { const v = O.staff.chong[k]; return typeof v === 'function' ? v.bind(O.staff.chong) : v; }, set: (t, k, v) => { O.staff.chong[k] = v; return true; }, deleteProperty: (t, k) => delete O.staff.chong[k] });
    const r = {};
    const dm = () => +(Math.hypot(a.x - p.x, (a.y - p.y) * 2) / 64).toFixed(2);
    const away = (s) => { F.setInput(0, 0); F.teleport(200, 1050); window.__step.run(s); };
    // the teleport rule: the camera is elsewhere (a camera cut), she is far and both her place and her spot are off
    // screen: she appears by him
    away(2);
    F.teleport(1450, 1050); a.x = 200; a.y = 1050; a.route.length = 0; a.target = null;
    gs.focusCamera(3000, 2600, 5000); gs.camTarget.x = 3000; gs.camTarget.y = 2600; window.__step.frame();
    window.__step.run(0.3);
    r.teleport = dm();
    gs.camFocus = null; gs.camTarget.x = p.x; gs.camTarget.y = p.y - 30; window.__step.frame();
    // on screen she never pops: he jumps 1250 px away, she walks up to him (the roads, then beside him)
    away(2);
    F.teleport(1450, 1050); a.x = 200; a.y = 1050; a.route.length = 0; a.target = null; window.__step.frame();
    let t = 0; while (dm() > 3 && t < 12) { window.__step.run(0.1); t += 0.1; }
    r.catchUpS = +t.toFixed(1); r.catchUpD = dm(); r.shoes = gs.progress.up.speed;
    // far from the office: she goes home (her way planned once, not every frame)
    away(2);
    let plans = 0; const wt = a.walkTo; a.walkTo = function (...q) { plans++; return wt.apply(this, q); };
    const hx = a.home.x, hy = a.home.y, dh0 = Math.hypot(a.x - hx, a.y - hy);
    F.teleport(O.x + 2600, O.y + 200); window.__step.run(2);
    delete a.walkTo;
    r.far = { doing: a.doing, plans, closer: Math.round(dh0 - Math.hypot(a.x - hx, a.y - hy)) };
    // the chief inside the office: she goes to her desk
    away(2);
    const e = B.spots.entry; F.teleport(e.x, e.y); window.__step.run(1);
    r.inside = { doing: a.doing, onFloor: !!(B.cw && B.cw.onFloor(p.x, p.y)) };
    // 관망 at the office: home too, then she follows again
    away(2);
    const po = O.pilotOffice; O.pilotOffice = () => true; window.__step.run(1); r.pilot = a.doing; O.pilotOffice = po;
    window.__step.run(1); r.back = a.doing;
    // ((check) her way home at her follow pace: settled beside him first (her last steps were slow), then 관망 /
    //  he steps inside: px/s while she walks home (it was the pace of her last settling step, 26–43 px/s)
    const homePace = (how) => {
      const D = B.spots.door;
      F.setInput(0, 0); F.teleport(D.x + 260, D.y + 160); window.__step.run(5);
      const po2 = O.pilotOffice;
      if (how === 'pilot') O.pilotOffice = () => true; else F.teleport(B.spots.entry.x, B.spots.entry.y);
      // (px/s while she is on her way: the frames with a route target, until she sits down)
      let x = a.x, y = a.y, dist = 0, tw = 0;
      for (let i = 0; i < 180; i++) { const on = !!a.target; window.__step.run(1 / 60); if (on) { dist += Math.hypot(a.x - x, a.y - y); tw += 1 / 60; } x = a.x; y = a.y; }
      O.pilotOffice = po2;
      const v = Math.round(dist / Math.max(tw, 1 / 60));
      F.teleport(D.x + 260, D.y + 160); window.__step.run(2);
      return v;
    };
    r.homePace = { pilot: homePace('pilot'), inside: homePace('inside'), chief: Math.round(gs.player.speed) };
    // ((check) back from far away while she sits at her desk: she comes out through the door (steering straight at him
    //  she pressed against the office wall, 3–4 m away, hidden by the closed shell)
    r.outOfOffice = [];
    for (const [bx, by] of [[300, 200], [150, 120], [-200, 260]]) {
      F.setInput(0, 0); F.teleport(O.x + 2600, O.y + 200); window.__step.run(25);
      const seated = !!a.seat;
      F.teleport(B.spots.door.x + bx, B.spots.door.y + by);
      let tt = 0; while ((dm() > 3 || (B.cw && B.cw.onFloor(a.x, a.y))) && tt < 8) { window.__step.run(0.1); tt += 0.1; }
      r.outOfOffice.push({ at: [bx, by], seated, s: +tt.toFixed(1), d: dm(), inside: !!(B.cw && B.cw.onFloor(a.x, a.y)) });
    }
    return r;
  });
  console.log('  ' + JSON.stringify(rules));
  ok(rules.teleport <= 4, 'teleport rule: far, off screen and the camera elsewhere: she appears by him (' + rules.teleport + ' m)');
  ok(rules.catchUpS <= 5, 'he jumps 1250 px away on screen: she walks up within 3 m in ' + rules.catchUpS + ' s (shoes ' + rules.shoes + ')', rules);
  ok(rules.far.doing !== 'follow' && rules.far.closer > 0, 'far from the office she goes home', rules.far);
  ok(rules.far.plans <= 3, 'her way home is planned once, not every frame (' + rules.far.plans + ' plans in 2 s)');
  ok(!rules.inside.onFloor || rules.inside.doing !== 'follow', 'the chief inside the office: she goes to her desk', rules.inside);
  ok(rules.pilot !== 'follow' && rules.back === 'follow', '관망 at the office: home; then follows again', rules);
  ok(rules.homePace.pilot >= 0.8 * rules.homePace.chief && rules.homePace.inside >= 0.8 * rules.homePace.chief, 'her way home at her follow pace (관망 ' + rules.homePace.pilot + ', he steps inside ' + rules.homePace.inside + ' px/s; his ' + rules.homePace.chief + ')', rules.homePace);
  ok(rules.outOfOffice.every((q) => q.seated && !q.inside && q.d <= 3 && q.s < 6), 'back from far away: she leaves her desk and comes out of the office to him within 6 s (' + rules.outOfOffice.map((q) => q.s + ' s').join(', ') + ')', rules.outOfOffice);
  out.rules = rules;
  for (const e of log.errors) errors.push(e);
  await page.context().close();
} catch (e) { fail++; console.log('FATAL', e && e.stack || e); }
await browser.close(); await srv.close();
for (const e of errors.slice(0, 6)) console.log('  error: ' + String(e).slice(0, 300));
ok(errors.length === 0, '0 page errors', errors.length);
const J = arg('--json'); if (J) fs.writeFileSync(J, JSON.stringify(out, null, 1));
console.log(`\n${fail === 0 ? 'PASS' : 'FAIL'} aidefollow: ${pass}/${pass + fail}`);
process.exit(fail === 0 ? 0 : 1);
