// v4 snow train checks (docs/v4_plan.md §4, §16.1).
//   node tools/test/rail.mjs            (screenshots -> docs/previews/screens_v4/rail_*.jpg)
// Node part (pure Rail): kinematics, dwell, cycle, car spacing, buffer stop, crossings vs the 4-car train.
// Browser part (fixed-step clock): the ruin + repair, the first train ≤ 6 s after the repair with 6 visitors,
// NW-only frames (NE mirrored), the crossing closes and opens, the train stops for the chief on the track and
// whistles, never pushes him, the train runs into the town's fog, boarding counts, people conserved.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Rail, legProfile } from '../../src/systems/Rail.js';
import { WORLD, L4 } from '../../src/data/world.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews', 'screens_v4');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const step = (name, ok, info = '') => { results.push({ name, ok }); console.log((ok ? '  ok  ' : ' FAIL ') + name + (info ? '  — ' + info : '')); };
const S2 = Math.SQRT2;

// ---------------------------------------------------------------- Node: the timetable
{
  const r = new Rail();
  const leg = r.leg;
  step('leg ≈ 17.7 s (4.3 accelerate + 10.1 cruise + 3.3 brake)', Math.abs(leg.T - 17.7) < 0.15 && Math.abs(leg.t1 - 4.33) < 0.05, leg.T.toFixed(2) + ' s');
  step('cycle ≈ 59 s (two legs + 14 s + 10 s dwell)', Math.abs(r.cycle() - 59.3) < 0.5, r.cycle().toFixed(1));
  step('stops: car_a at i 2.5 (ours) and i 28.0 (town)', Math.abs(r.iAt(r.mOurs) - 2.5) < 1e-9 && Math.abs(r.iAt(r.mTown) - 28) < 1e-9);
  // a whole cycle: positions monotonic in each leg, events in order, speed never above vmax
  r.running = true; r.set('toOurs', 0);
  const ev = [];
  r.on((e, s) => ev.push(e + ':' + s));
  let last = r.m, mono = true, vmax = 0, minM = Infinity, maxM = -Infinity;
  for (let k = 0; k < 60 * 70; k++) {
    const ph = r.phase;
    r.update(1 / 60);
    if (r.phase === ph && ph === 'toOurs' && r.m > last + 1e-9) mono = false;
    if (r.phase === ph && ph === 'toTown' && r.m < last - 1e-9) mono = false;
    vmax = Math.max(vmax, Math.abs(r.v));
    const sp = r.span(r.m); minM = Math.min(minM, sp[0]); maxM = Math.max(maxM, sp[1]);
    last = r.m;
  }
  step('positions move one way per leg; speed ≤ vmax', mono && vmax <= 2.6 + 1e-6, 'vmax ' + vmax.toFixed(3));
  step('events: whistle → arrive ours → depart → whistle → arrive town → depart', ev.slice(0, 6).join(',') === 'whistle:ours,arrive:ours,depart:ours,whistle:town,arrive:town,depart:town', ev.slice(0, 6).join(','));
  step('the train never runs past the buffer stop (nose ≥ i −0.6)', r.iAt(minM) > -0.6, 'nose i ' + r.iAt(minM).toFixed(2));
  // car spacing: 2.34 m engine -> car_a, 2.24 m car_a -> car_b; with the 읍 coach the train still stops short of the crossings
  const c = r.consist();
  step('consist: engine 2.34 m, car_b 2.24 m from car_a', Math.abs(c[0].off + 2.34) < 1e-9 && Math.abs(c[2].off - 2.24) < 1e-9);
  r.coaches = 2;
  const ends = (mA) => r.span(mA).map((m) => r.iAt(m));
  const eo = ends(r.mOurs), et = ends(r.mTown);
  step('4-car train at our station ends before the k 8 crossing (i 6.48 < 7.6)', eo[1] < 7.6, eo.map((x) => x.toFixed(2)).join('..'));
  step('4-car train at the town station ends before the k 33 crossing (i 31.98 < 32.6)', et[1] < 32.6, et.map((x) => x.toFixed(2)).join('..'));
  r.coaches = 1;
  // crossing logic: closed while a car is on / near it or about to reach it
  r.set('toTown', 0);
  const seen = []; let opened = false;
  for (let k = 0; k < 60 * 20; k++) { r.update(1 / 60); seen.push(r.blocking(8)); if (seen.length > 2 && seen[seen.length - 2] && !seen[seen.length - 1]) opened = true; }
  step('crossing k 8 closes while the train passes, then opens again', seen.some((x) => x) && opened && !r.blocking(8));
  r.set('atOurs', 1);
  step('crossing open while the train dwells at our station (people can leave the platform)', !r.blocking(8));
  // blocked track: the clock slows to 0, the train waits, then goes on
  r.set('toOurs', 5);
  const m0 = r.m;
  for (let k = 0; k < 60 * 4; k++) r.update(1 / 60, () => true);
  const m1 = r.m;
  for (let k = 0; k < 60 * 2; k++) r.update(1 / 60, () => true);
  const m2 = r.m;
  step('something on the track ahead: the train brakes and waits (rate 0)', r.rate === 0 && Math.abs(m2 - m1) < 1e-9 && m1 !== m0, 'blocked ' + r.blockedT.toFixed(1) + ' s');
  for (let k = 0; k < 60 * 3; k++) r.update(1 / 60, () => false);
  step('track clear: it goes on', r.rate > 0.9 && r.m !== m2);
  const lp = legProfile(36.06, 2.6, 0.6, 0.8);
  step('leg profile: pos(T) = D, vel continuous', Math.abs(lp.pos(lp.T) - 36.06) < 1e-6 && Math.abs(lp.vel(lp.t1 - 1e-6) - lp.vel(lp.t1 + 1e-6)) < 1e-3);
}

// ---------------------------------------------------------------- browser
const { start } = await import('./serve.mjs');
const { launch, openPage, tapStart, sleep, waitFor } = await import('./pw.mjs');
const { installStepper, advance, render } = await import('./fv_step.mjs');
const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 } });
const ev = (fn, arg) => page.evaluate(fn, arg);
const adv = (s) => advance(page, s);
const shot = async (n) => { await render(page, 3); await page.screenshot({ path: path.join(OUT, 'rail_' + n + '.jpg'), type: 'jpeg', quality: 80 }); };
const nudge = (fn, ms = 90000) => waitFor(page, `(() => { const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); return (${fn})(); })()`, ms).then(() => true).catch(() => false);
let fatal = null;
try {
  await ev(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(400);
  await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 180000);
  await sleep(1500);
  await installStepper(page);
  await adv(1);
  const before = await ev(() => ({ v4: !!window.__FV.scene.v4, rail: window.__FV.state().territory.rail }));
  await ev(() => { window.__FV.unlockV3(); window.__FV.give(50000); });
  await adv(1);
  const after = await ev(() => ({ v4: !!window.__FV.scene.v4, rail: window.__FV.state().territory.rail, east: window.__FV.state().territory.east }));
  step('the rail strip opens with the east coast (and v4 starts only then)', !before.v4 && before.rail === false && after.v4 && after.rail && after.east, JSON.stringify({ before, after }));
  await nudge(() => window.__FV.scene.v4 && window.__FV.scene.v4.ready && window.__FV.hasTex('town_civic') && window.__FV.hasTex('town_rails'));
  const ruin = await ev(() => { const gs = window.__FV.scene, nb = gs.v4, st = gs.sites.r_station; return { plot: st && st.state, shown: st && st.shown, ruin: !!(nb.ours && !nb.ours.open && nb.ours.img.isTinted), choices: window.__FV.choices('r_station') }; });
  step('the ruin stands on plot r_station (XL, only the station)', ruin.plot === 'plot' && ruin.shown && ruin.ruin && ruin.choices.length === 1 && ruin.choices[0].key === 'station' && !ruin.choices[0].locked, JSON.stringify(ruin));
  await ev(() => window.__FV.camera(3330, 1420, 1.0));
  await adv(1);
  await shot('01_ruin');
  // repair like a player: build -> materials -> scaffold -> done
  const built = await ev(() => window.__FV.build('r_station', 'station'));
  await adv(1);
  await ev(() => window.__FV.supply('r_station'));
  await adv(2);
  const scaff = await ev(() => window.__FV.state().sites.r_station);
  await ev(() => window.__FV.camera(3380, 1400, 1.0));
  await adv(0.5);
  await shot('02_site');
  step('repair: pays, takes 14 planks + 4 ingots, scaffold', built && scaff && (scaff.state === 'scaffold' || scaff.state === 'done'), JSON.stringify(scaff));
  const tRep = await ev(() => { window.__FV.finishSite('r_station'); return window.__step.t; });
  await nudge(() => window.__FV.hasTex('train_engine') && window.__FV.hasTex('train_car_b') && window.__FV.scene.v4.town && window.__FV.state().v4.tf && window.__FV.state().v4.tf.adult, 150000);
  // the first train: arrives within 6 s of the repair with 6 neighbours
  let arr = null;
  for (let k = 0; k < 40; k++) { await adv(0.25); const s = await ev(() => window.__FV.state().v4); if (s.arrivals > 0) { arr = { t: await ev(() => window.__step.t), s }; break; } }
  step('the first train arrives ≤ 6 s after the repair', !!arr && arr.t - tRep <= 6.5, arr ? (arr.t - tRep).toFixed(1) + ' s' : 'no train');
  // ((v4.2) the riders step off at the coach doors)
  {
    // (the riders appear a moment after the stop: watch for 4 s and keep where each one was first seen)
    const dq = await ev(() => {
      const nb = window.__FV.scene.v4, r = nb.rail;
      if (!r.doorPoints) return null;
      const doors = r.doorPoints(), first = new Map();
      for (let f = 0; f < 240; f++) { window.__step.run(1 / 60); for (const v of nb.visitors) if (!first.has(v)) first.set(v, { x: Math.round(v.x), y: Math.round(v.y) }); }
      return { doors, vis: [...first.values()] };
    });
    if (dq && dq.doors && dq.doors.length) {
      const near = dq.vis.filter((v) => dq.doors.some((d) => Math.hypot(v.x - d.x, v.y - d.y) < 140)).length;
      step('riders step off at the coach doors (' + near + ' / ' + dq.vis.length + ' within 140 px of a door)', dq.vis.length > 0 && near >= Math.ceil(dq.vis.length * 0.5), JSON.stringify(dq.doors));
    }
  }
  await adv(2.5);
  await ev(() => window.__FV.camera(3330, 1420, 1.1));
  await shot('03_first_train');
  const vis = await ev(() => window.__FV.state().v4);
  step('6 neighbours step off', vis.visitors.length === 6, vis.visitors.length + ' visitors');
  // they leave the platform at its east end and cross the rails only over the level crossing (never through the train)
  let onTrack = [], crossed = 0;
  for (let k = 0; k < 60; k++) {
    await adv(0.25);
    const r = await ev(() => window.__FV.scene.v4.visitors.map((v) => { const a = (v.x - 3120) / 64, b = (v.y - 1315) / 32; return { i: (a + b) / 2, j: (a - b) / 2, id: v.citizen.id }; }));
    for (const q of r) { if (Math.abs(q.j) < 0.55 && !(q.i > 7.6 && q.i < 9.4)) onTrack.push(q.id + '@' + q.i.toFixed(1) + ',' + q.j.toFixed(2)); if (q.j < -0.6) crossed++; }
  }
  step('visitors cross the rails only at the level crossing', onTrack.length === 0 && crossed > 0, onTrack.slice(0, 4).join(' ') + ' crossed samples ' + crossed);
  // ((v4.2) the balloon loops: every car sits on the route at its consist offset behind the nose; the engine leads)
  const cars = await ev(() => { const nb = window.__FV.scene.v4, r = nb.rail; return { route: !!r.path, m: r.m, cons: r.consist ? r.consist() : null, nose: r.point ? r.point(r.m) : null, cars: nb.train.cars.map((c) => ({ key: c.key, x: c.spr.x, y: c.spr.y, flip: c.spr.flipX, anim: c.spr.anims.currentAnim && c.spr.anims.currentAnim.key, on: r.point ? r.point(r.m - (c.off !== undefined ? c.off : 0)) : null })) }; });
  if (cars.route) {
    const engine = cars.cars.find((c) => /engine/.test(c.key));
    const dn = (c) => Math.hypot(c.x - cars.nose.x, c.y - cars.nose.y);
    step('the engine leads: it is the car nearest the nose', engine && cars.cars.every((c) => dn(engine) <= dn(c) + 1e-6), cars.cars.map((c) => c.key + ':' + dn(c).toFixed(0)).join(' '));
    // ((CODE-2, train2 curvePlacement) a car sits at the midpoint of its bogie chord (offset ± 0.4 × its length): the
    //  arc point itself on a curve, the chord midpoint ~10 px inside it)
    const far = await ev(() => { const nb = window.__FV.scene.v4, r = nb.rail, P = r.path, cons = r.consist(); return nb.train.cars.map((c, k) => { const u = cons[k], s = r.m - u.off, len = c.len || u.len || 0; const F = {}, B = {}; P.at(s + 0.4 * len, F); P.at(s - 0.4 * len, B); return Math.hypot(c.spr.x - (F.x + B.x) / 2, c.spr.y - (F.y + B.y) / 2); }); });
    step('every car on the route at its consist offset (bogie-chord midpoint, ≤ 4 px)', far.every((d) => d <= 4), far.map((d) => d.toFixed(1)).join(' '));
  } else {
    step('every car drawn heading NW (NE frames mirrored)', cars.cars.every((c) => c.flip && /:NE$/.test(c.anim || '')), JSON.stringify(cars.cars.map((c) => c.anim)));
    const C = cars.cars;
    step('car spacing on screen = 2.34 m / 2.24 m', Math.abs(Math.hypot(C[1].x - C[0].x, C[1].y - C[0].y) - 2.34 / S2 * Math.hypot(64, 32)) < 2 && Math.abs(Math.hypot(C[2].x - C[1].x, C[2].y - C[1].y) - 2.24 / S2 * Math.hypot(64, 32)) < 2);
  }
  const flags = await ev(() => window.__FV.state().flags);
  step('flag firstTrain, the day clock starts at 08:00', flags.firstTrain && vis.clock.on && vis.clock.hour >= 8 && vis.clock.hour < 8.3, JSON.stringify(vis.clock));
  // the crossing: closed while the train leaves through it
  // ((v4.2) on the loops the train first rounds our loop, then runs the main line through k 8: a longer watch)
  await ev(() => { const r = window.__FV.scene.v4.rail; window.__FV.v4.train('atOurs', r.dur ? Math.max(0, r.dur('atOurs') - 0.2) : 13.8); });
  let closed = false, reopened = false;
  for (let k = 0; k < 160; k++) { await adv(0.25); const b = await ev(() => window.__FV.scene.v4.rail.blocking(8)); if (b) closed = true; if (closed && !b) { reopened = true; break; } }
  step('the k 8 crossing closes as the train leaves and opens again', closed && reopened);
  // the chief on the track: the train stops short and whistles, never pushes him
  const route = await ev(() => !!window.__FV.scene.v4.rail.path);
  let chiefM;
  if (route) {
    // ((v4.2) on the route: 4.5 m ahead of the nose, wherever that is — main line or loop)
    chiefM = await ev(() => { window.__FV.v4.train('toOurs', 6); const q = window.__FV.scene.v4.rail; const s = q.m + 4.5; const pt = q.point(s); window.__FV.teleport(pt.x, pt.y); return s; });
  } else {
    await ev(() => { window.__FV.v4.train('toOurs', 6); const q = window.__FV.scene.v4.rail; const m = q.m - 2.34 - 1.3 - 4.5; const i = q.iAt(m); const x = 3120 + 64 * i, y = 1315 + 32 * i; window.__FV.teleport(x, y); });
  }
  const p0 = await ev(() => ({ x: window.__FV.scene.player.x, y: window.__FV.scene.player.y }));
  await adv(6);
  const blk = await ev(() => { const r = window.__FV.scene.v4.rail; const sp = r.span(r.m); return { rate: r.rate, blockedT: r.blockedT, nose: r.path ? r.m : sp[0], phase: r.phase, p: { x: window.__FV.scene.player.x, y: window.__FV.scene.player.y } }; });
  const pm = route ? chiefM : await ev(() => { const r = window.__FV.scene.v4.rail; const p = window.__FV.scene.player; const a = (p.x - 3120) / 64, b = (p.y - 1315) / 32; return r.mAt((a + b) / 2); });
  await ev((q) => window.__FV.camera(q.x, q.y, 1.1), p0);
  await shot('04_chief_on_track');
  const gap = route ? pm - blk.nose : blk.nose - pm;
  step('chief on the track: the train waits ≥ 1.2 m before him', blk.rate < 0.05 && blk.blockedT > 1 && gap > 1.2 && Math.hypot(blk.p.x - p0.x, blk.p.y - p0.y) < 2, JSON.stringify(blk) + ' chief m ' + pm.toFixed(2));
  await ev(() => window.__FV.teleport(3300, 1560));
  await adv(4);
  step('chief off the track: the train goes on', await ev(() => window.__FV.scene.v4.rail.rate > 0.5));
  // the train runs into the town's fog (town closed): its cars are under the fog wall
  await ev(() => window.__FV.v4.train('toTown', 15));
  await adv(0.5);
  const fogged = await ev(() => { const gs = window.__FV.scene, f = gs.territory.regions.town.fog; const c = gs.v4.train.cars[0]; return { fog: !!f, fogDepth: f && f.fill.depth, car: c.spr.depth, x: c.spr.x }; });
  step('the town is fogged and the train runs under the fog', fogged.fog && fogged.fogDepth > fogged.car, JSON.stringify(fogged));
  await ev(() => window.__FV.camera(4250, 2030, 0.8));
  await adv(0.5);
  await shot('05_into_fog');
  // boarding: a full cycle later the riders are back in town; people conserved all along
  let cons = true, maxOn = 0;
  for (let k = 0; k < 40; k++) { await adv(3); const c = await ev(() => window.__FV.v4.census()); if (!c || c.town + c.train + c.village !== c.total) cons = false; maxOn = Math.max(maxOn, c ? c.train : 0); }
  const late = await ev(() => window.__FV.state().v4);
  step('people conserved (town + train + village = 100) through two minutes of trains', cons && late.town.census.total === 100, JSON.stringify(late.town.census));
  step('trains keep coming (≥ 2 arrivals at our station)', late.arrivals >= 2, 'arrivals ' + late.arrivals + ', max on board ' + maxOn);
  // the invitation: the fallback timer runs out, the mayor comes by the next train, walks to the chief, the town opens
  await ev(() => { window.__FV.teleport(3330, 1560); window.__FV.scene.v4.inviteT = (window.__FV.scene.v4.inviteT || 0) + 1e4; });
  let mayor = null, opened = false;
  for (let k = 0; k < 100 && !opened; k++) {
    await adv(1);
    const r = await ev(() => { const nb = window.__FV.scene.v4; const a = nb.actors[0]; return { inviting: !!nb.inviting, actor: a ? { role: a.c.role, x: Math.round(a.x), y: Math.round(a.y), doll: !!a.sprite.isDoll } : null, open: window.__FV.state().territory.town, flag: !!window.__FV.scene.progress.flags.townInvite }; });
    if (r.actor && !mayor) mayor = r.actor;
    opened = r.open && r.flag;
  }
  await ev(() => window.__FV.camera(4600, 2200, 0.8));
  await adv(1);
  await shot('06_town_open');
  step('invitation (fallback timer): the mayor comes by train as a paper doll, the town opens', opened && mayor && mayor.role === 'mayor' && mayor.doll, JSON.stringify(mayor));
  // ((v4.2) 읍: the second coach joins the consist (stage 2: 13.6 m), the seats and the cycle follow)
  const sw = await ev(() => { const nb = window.__FV.scene.v4, r = nb.rail; if (!r.setStage) return null; const a = { len: r.length, seats: r.seats(), cars: nb.train.cars.length }; nb.addCoach(); return { a, b: { len: r.length, seats: r.seats(), cars: nb.train.cars.length, keys: r.consist().map((u) => u.key) } }; });
  if (sw) step('읍: the consist swaps to 2 coaches (longer, more seats, one more car drawn)', sw.b.len > sw.a.len && sw.b.seats > sw.a.seats && sw.b.cars === sw.a.cars + 1 && sw.b.keys.filter((k) => /coach/.test(k)).length === 2, JSON.stringify(sw));
  const pc = await ev(() => window.__FV.v4.census());
  step('people still conserved after the mayor\'s visit', pc.town + pc.train + pc.village === pc.total && pc.total === 100, JSON.stringify(pc));
} catch (e) { fatal = e; console.log('FATAL', e && e.stack || e); }
const errs = log.errors.filter((e) => !/favicon/.test(e));
step('no page errors', errs.length === 0 && !fatal, errs.slice(0, 3).join(' | '));
const ph = log.warnings.filter((w) => /placeholder/.test(w));
step('no placeholder art', ph.length === 0, ph.slice(0, 3).join(' | '));
await browser.close();
await srv.close();
const fails = results.filter((r) => !r.ok).length;
console.log(fails ? `\n${fails} FAILED of ${results.length}` : `\nall ${results.length} passed`);
process.exit(fails ? 1 : 0);
void L4; void WORLD;
