// (v4.2, docs/v42_plan.md §5 + §15) the balloon-loop railway, Node only:
//   node tools/test/rail42.test.mjs
// RailPath: closed and C1-continuous route, loop 24.7 m, the heading sequence round our loop, curve segments;
// RouteRail: engine leads in 100 % of moving samples (never reverses), the nose comes back to the turnout after the
// tail left the main line, stops / coach / box-car spans (§5.2), crossings open while dwelling, cycle 85 ± 3 s for
// both stages, blocking + whistle + arrive / depart events; the legacy Rail (the v6 coast line's model) unchanged.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const { WORLD } = await import(path.join(ROOT, 'src/data/world.js'));
const { RailPath, dirOf } = await import(path.join(ROOT, 'src/systems/RailPath.js'));
const { Rail, RouteRail, UNITS } = await import(path.join(ROOT, 'src/systems/Rail.js'));

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); } };
const S2 = Math.SQRT2;
const near = (a, b, e) => Math.abs(a - b) <= e;

console.log('route geometry');
const P = new RailPath(WORLD.v42.rail, WORLD.v4.G);
ok(near(P.loopLen, 24.74, 0.05), 'loop T1 → round → T1 = 24.7 m (' + P.loopLen.toFixed(2) + ')');
ok(near(P.length, 2 * P.loopLen + 2 * 38 * S2, 0.01), 'route = 2 loops + main line both ways (' + P.length.toFixed(2) + ' m)');
{
  // closed and C1-continuous: no position jump, no heading jump
  const o = {}, q = {};
  let maxStep = 0, maxTurn = 0;
  const ds = 0.02;
  for (let s = 0; s <= P.length + 1e-9; s += ds) {
    P.at(s, o); P.at(s + ds, q);
    maxStep = Math.max(maxStep, Math.hypot(q.i - o.i, q.j - o.j));
    maxTurn = Math.max(maxTurn, Math.acos(Math.max(-1, Math.min(1, o.di * q.di + o.dj * q.dj))));
  }
  ok(maxStep <= ds / S2 + 1e-6, 'continuous: max step ' + maxStep.toFixed(5) + ' cells per ' + ds + ' m');
  ok(maxTurn < 0.02, 'C1: max heading change per ' + ds + ' m = ' + maxTurn.toFixed(4) + ' rad (R 1.75 cells)');
  const a = P.at(0), b = P.at(P.length - 1e-6);
  ok(Math.hypot(a.i - b.i, a.j - b.j) < 1e-4, 'closed: the route ends where it starts');
  // the points of §5.1
  const pts = [[0, -1, 0], [P.segs[1].s0, -6, 0], [P.segs[2].s0, -6, 3.5], [P.segs[3].s0, -4.5, 3.5], [P.segs[4].s0, -2.75, 1.75], [P.segs[6].s0, 37, 0], [P.segs[7].s0, 42, 0], [P.segs[8].s0, 42, 3.5], [P.segs[9].s0, 40.5, 3.5], [P.segs[10].s0, 38.75, 1.75]];
  ok(pts.every(([s, i, j]) => { const p = P.at(s + 1e-9); return near(p.i, i, 1e-6) && near(p.j, j, 1e-6); }), 'T1, A, B, C, D and T2, A′, B′, C′, D′ at their lattice points');
  const lm = P.at(P.segs[1].s0 + P.segs[1].len / 2), rm = P.at(P.segs[7].s0 + P.segs[7].len / 2);
  ok(near(lm.i, -7.75, 1e-6) && near(lm.j, 1.75, 1e-6) && near(lm.x, 2736, 0.5) && near(lm.y, 1011, 0.5), 'leftmost (−7.75, 1.75) = (2736, 1011) px');
  ok(near(rm.i, 43.75, 1e-6) && near(rm.x, 6032, 0.5) && near(rm.y, 2659, 0.5), 'rightmost (43.75, 1.75) = (6032, 2659) px');
  // the heading sequence round our loop (§5.3): NW → N → NE → E → SE → S → SW → S → SE
  const seq = [];
  for (let s = 0; s <= P.loopLen + 0.5; s += 0.05) { const p = P.at(s); const d = dirOf(p.di, p.dj); if (seq[seq.length - 1] !== d) seq.push(d); }
  ok(seq.join(' ') === 'NW N NE E SE S SW S SE', 'heading sequence round our loop: ' + seq.join(' '));
  const seqT = [];
  for (let s = P.sTownLoop; s <= P.sTownLoop + P.loopLen + 0.5; s += 0.05) { const p = P.at(s); const d = dirOf(p.di, p.dj); if (seqT[seqT.length - 1] !== d) seqT.push(d); }
  ok(seqT.join(' ') === 'SE E NE N NW W SW W NW', 'heading sequence round the town loop: ' + seqT.join(' '));
  // the loop never comes near the main line except at the turnout (ballast ± 0.61 cell)
  let minJ = Infinity;
  for (let s = P.segs[1].s0; s < P.segs[4].s0; s += 0.05) minJ = Math.min(minJ, P.at(s).j);
  ok(minJ >= -1e-6, 'our loop stays on the sea side (min j ' + minJ.toFixed(3) + ')');
  ok(P.curves.length === 6 && near(P.curves.reduce((a, c) => a + c[1] - c[0], 0), 2 * 15.55, 0.1), '15.6 m of each loop is curved');
}

console.log('consist + stops (§5.2)');
for (const stage of [1, 2]) {
  const r = new RouteRail();
  r.setStage(stage);
  const units = r.consist();
  ok(units[0].key === 'train_engine' && units[0].off === Math.min(...units.map((u) => u.off)), 'stage ' + stage + ': the engine is the leading unit');
  ok(near(r.length, stage === 1 ? 10.6 : 13.6, 1e-9), 'stage ' + stage + ': nose → tail ' + r.length.toFixed(2) + ' m');
  ok(r.seats() === (stage === 1 ? 16 : 32) && r.freightCap() === 56, 'stage ' + stage + ': seats ' + r.seats() + ', freight ' + r.freightCap());
  r.running = true;
  r.set('atOurs', 1);
  const span = (key, k = 0) => { const u = units.filter((q) => q.key === key)[k]; const a = r.path.at(r.m - u.off - u.len / 2), b = r.path.at(r.m - u.off + u.len / 2); return [Math.min(a.i, b.i), Math.max(a.i, b.i)]; };
  const nose = r.path.at(r.m), tail = r.path.at(r.m - r.length);
  ok(near(nose.i, stage === 1 ? -0.8 : -2.9, 1e-6) && near(nose.j, 0, 1e-9), 'stage ' + stage + ': nose at i ' + nose.i.toFixed(2));
  ok(near(tail.i, stage === 1 ? 6.70 : 6.72, 0.011), 'stage ' + stage + ': tail at i ' + tail.i.toFixed(2));
  const coach = span('train_coach', stage === 1 ? 0 : 1);
  ok(near(coach[0], stage === 1 ? 1.04 : 1.06, 0.011) && near(coach[1], stage === 1 ? 3.16 : 3.18, 0.011) && coach[0] >= -0.05 && coach[1] <= 5.05, 'stage ' + stage + ': 객차 at the platform [' + coach.map((v) => v.toFixed(2)) + ']');
  const box = span('train_boxcar');
  ok(box[0] <= 4.1 && box[1] >= 4.1, 'stage ' + stage + ': 화물칸 [' + box.map((v) => v.toFixed(2)) + '] opposite the 짐 싣는 곳 (i 4.1)');
  ok(!r.blocking(8) && !r.blocking(33), 'stage ' + stage + ': crossings 8 and 33 open while it dwells at ours');
  r.set('atTown', 1);
  const tn = r.path.at(r.m), tc = span('train_coach', 0);
  ok(near(tn.i, 31.6, 1e-6) && near(tc[0], 27.64, 0.011) && near(tc[1], 29.76, 0.011), 'stage ' + stage + ': at the town nose 31.6, 객차 [' + tc.map((v) => v.toFixed(2)) + ']');
  ok(!r.blocking(33) && !r.blocking(8), 'stage ' + stage + ': crossings open while it dwells at the town');
  ok(near(r.cycle(), 85, 3), 'stage ' + stage + ': cycle ' + r.cycle().toFixed(1) + ' s (85 ± 3)');
}

console.log('a full cycle (engine leads, never reverses)');
for (const stage of [1, 2]) {
  const r = new RouteRail();
  r.setStage(stage);
  r.running = true;
  r.set('atOurs', 0);
  const ev = [];
  r.on((e, s) => ev.push(e + ':' + s));
  let back = 0, moving = 0, lead = 0, prevM = r.m, travelled = 0;
  let tailOffMainAt = null, noseBackAtT1 = null, minGap = Infinity;
  const dt = 1 / 30;
  const o = {}, e = {};
  for (let t = 0; t < r.cycle() + 1; t += dt) {
    r.update(dt, () => false);
    const m = r.m, d = r.path.wrap(m - prevM);
    if (d > r.path.length / 2) back++;
    travelled += d < r.path.length / 2 ? d : 0;
    prevM = m;
    if (r.moving) {
      moving++;
      // the engine's anchor lies behind the nose along the direction of travel
      r.path.at(m, o); r.path.at(m - r.consist()[0].off, e);
      const dot = (o.i - e.i) * o.di + (o.j - e.j) * o.dj;
      if (dot > 0) lead++;
    }
    // the nose comes back to T1 (route s = loopLen) only after the tail has left the main line (s > 0 of the loop)
    if (r.phase === 'toTown') {
      const loopS = r.path.wrap(m);       // 0 = T1 heading into our loop
      if (loopS < r.path.loopLen) {
        const tailS = loopS - r.length;
        if (tailS > 0 && tailOffMainAt === null) tailOffMainAt = t;
        if (loopS > r.path.loopLen - 0.2 && noseBackAtT1 === null) noseBackAtT1 = t;
        if (tailS > -1e9) minGap = Math.min(minGap, r.path.loopLen - loopS + (tailS < 0 ? 0 : tailS));
      }
    }
  }
  ok(back === 0, 'stage ' + stage + ': never moves backwards (' + back + ' reverse steps)');
  ok(moving > 0 && lead === moving, 'stage ' + stage + ': the engine leads in ' + lead + ' / ' + moving + ' moving samples');
  ok(tailOffMainAt !== null && noseBackAtT1 !== null && tailOffMainAt < noseBackAtT1, 'stage ' + stage + ': the tail leaves the main line (' + (tailOffMainAt || 0).toFixed(1) + ' s) before the nose returns to T1 (' + (noseBackAtT1 || 0).toFixed(1) + ' s)');
  ok(near(travelled, r.path.length, 0.2), 'stage ' + stage + ': one cycle = one round of the route (' + travelled.toFixed(1) + ' m)');
  const want = ['depart:ours', 'whistle:town', 'arrive:town', 'depart:town', 'whistle:ours', 'arrive:ours'];
  ok(want.every((w) => ev.indexOf(w) >= 0) && ev.indexOf('depart:ours') < ev.indexOf('arrive:town') && ev.indexOf('arrive:town') < ev.indexOf('arrive:ours'), 'stage ' + stage + ': events in order (' + ev.filter((x) => !/curve/.test(x)).join(', ') + ')');
  ok(ev.filter((x) => /^curve/.test(x)).length >= 2, 'stage ' + stage + ': the wheels squeal into the curves (' + ev.filter((x) => /^curve/.test(x)).length + ')');
}

console.log('kinematics');
{
  const r = new RouteRail();
  r.running = true;
  r.set('toTown', 0);
  let maxV = 0, maxVc = 0;
  for (let t = 0; t < r.dur('toTown'); t += 0.05) {
    r.update(0.05, () => false);
    if (r.phase !== 'toTown') break;
    const v = r.speed;
    if (r.onCurve()) maxVc = Math.max(maxVc, v); else maxV = Math.max(maxV, v);
  }
  ok(maxV <= 3.4 + 1e-6 && maxV > 3.0, 'top speed ' + maxV.toFixed(2) + ' m/s on the straight (≤ 3.4)');
  ok(maxVc <= 2.2 + 1e-6, 'curve speed ' + maxVc.toFixed(2) + ' m/s while any car is on a curve (≤ 2.2)');
  ok(near(r.legTown.T, 30.4, 0.6) && near(r.legOurs.T, 34.9, 0.6), 'legs ' + r.legTown.T.toFixed(1) + ' / ' + r.legOurs.T.toFixed(1) + ' s (plan 30.4 / 34.9)');
}

console.log('blocking');
{
  const r = new RouteRail();
  r.running = true;
  r.set('toTown', 0);
  // run until the nose is ~ 5 m before crossing 8 heading SE: blocked
  const xs = r.xings.find((q) => q.k === 8).s[0];
  let closedBefore = false, t = 0;
  while (t < 60) { r.update(0.05, () => false); t += 0.05; const d = r.path.ahead(r.m, xs); if (d < 4 && d > 1) { closedBefore = r.blocking(8); break; } }
  ok(closedBefore, 'crossing 8 closes before the nose reaches it');
  let reopened = false;
  for (let k = 0; k < 600; k++) { r.update(0.05, () => false); if (r.path.ahead(xs, r.m) > r.length + 3 && !r.blocking(8)) { reopened = true; break; } }
  ok(reopened, 'and opens again after the tail has passed');
  // something on the track: the train brakes and stops, then goes on
  const r2 = new RouteRail();
  r2.running = true;
  r2.set('toTown', 20);
  let blocked = true;
  for (let k = 0; k < 200; k++) r2.update(0.05, () => blocked);
  ok(r2.rate < 0.01 && r2.blockedT > 2, 'blocked: the clock stops (rate ' + r2.rate.toFixed(2) + ')');
  blocked = false;
  for (let k = 0; k < 60; k++) r2.update(0.05, () => blocked);
  ok(r2.rate > 0.9, 'cleared: it goes on');
}

console.log('stage change keeps the leg');
{
  const r = new RouteRail();
  r.running = true;
  r.set('toOurs', 10);
  const f = r.t / r.dur('toOurs');
  r.setStage(2);
  ok(r.stage === 2 && r.coaches === 2 && near(r.t / r.dur('toOurs'), f, 1e-9), '읍: E + 객차 + 객차 + 화물칸 + 무개화차, same fraction of the leg');
  ok(r.consist().map((u) => u.key).join(',') === 'train_engine,train_coach,train_coach,train_boxcar,train_flatcar', 'stage 2 consist');
  ok(UNITS.train_boxcar.freight + UNITS.train_flatcar.freight === 56, 'freight cars 32 + 24 = 56');
}

console.log('legacy Rail (the v6 coast line keeps the push-pull model)');
{
  const r = new Rail();
  ok(typeof r.mAt === 'function' && r.consist()[0].key === 'train_engine' && r.consist().some((q) => q.key === 'train_car_b') && !r.path, 'legacy consist + no path');
  r.running = true;
  r.set('toTown', 0);
  const m0 = r.m;
  for (let k = 0; k < 100; k++) r.update(0.05, () => false);
  ok(r.m > m0, 'legacy train still pushed toward the town');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
