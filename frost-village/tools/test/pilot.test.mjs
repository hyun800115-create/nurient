// (v4.2, docs/v42_plan.md §7 + §15) 관망 모드, Node only:
//   node tools/test/pilot.test.mjs
// agenda.choose() is a pure function of (snapshot, seed, day, index, current): 200 random snapshots decide the same
// twice and in a replayed sequence; the pilot never walks to a pay / hire / upgrade pad or a plot (urgentTarget and
// begin() drop them; blocksPay() while on, '고용만' lets only hires through); a 10-minute run on a mock village where
// a chore is always waiting still changes activity ≥ 6 times with ≥ 4 different ones (the chore break + AGAIN
// cool-downs); a human touch hands control back in the same call; never Math.random.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const A = await import(path.join(ROOT, 'src/systems/pilot/agenda.js'));
const W = await import(path.join(ROOT, 'src/systems/pilot/work.js'));
const { ChiefPilot } = await import(path.join(ROOT, 'src/systems/pilot/ChiefPilot.js'));
const { Input } = await import(path.join(ROOT, 'src/core/Input.js'));
const { Settings } = await import(path.join(ROOT, 'src/core/Save.js'));

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); } };

// Math.random is never used by the pilot
const realRandom = Math.random;
let randomCalls = 0;
Math.random = () => { randomCalls++; return realRandom(); };

console.log('choose(): pure and deterministic');
{
  const r = A.rng32(12345);
  const snaps = [];
  for (let k = 0; k < 200; k++) {
    snaps.push({
      now: r() * 3000, hour: r() * 24, urgent: r() < 0.4, lunchOpen: r() < 0.5, bagCount: r() < 0.5 ? 0 : 3, bagRoom: 8,
      work: r() < 0.6, noCourier: r() < 0.5, cashMax: Math.floor(r() * 900), trainSoon: r() < 0.3, trainNear: r() < 0.5,
      chatMate: r() < 0.6, chatIdle: r() * 400, office: r() < 0.7, paperNew: r() < 0.3, unread: Math.floor(r() * 4), dog: r() < 0.4,
      locked: r() < 0.3 ? { urgent: 99999 } : {},
    });
  }
  const cur = (k) => (k % 3 === 0 ? null : { act: A.ACTS[k % A.ACTS.length], t: (k * 7) % 50, min: 20, max: 40 });
  const a = snaps.map((c, k) => A.choose(c, 77, 3, k, cur(k)));
  const b = snaps.map((c, k) => A.choose(JSON.parse(JSON.stringify(c)), 77, 3, k, cur(k)));
  ok(a.every((x, k) => x.act === b[k].act && x.score === b[k].score), '200 snapshots: the same decision twice');
  const c = snaps.map((s, k) => A.choose(s, 78, 3, k, cur(k)));
  ok(a.some((x, k) => x.act !== c[k].act) || a.every((x) => x.score === Infinity), 'another seed can decide otherwise (jitter is seeded, not constant)');
  ok(a.every((x, k) => !(snaps[k].locked.urgent && x.act === 'urgent')), 'a locked activity is never chosen');
  ok(a.every((x) => A.ACTS.indexOf(x.act) >= 0), 'always one of the ten activities');
  const kept = A.choose({ ...snaps[0], urgent: true, locked: { urgent: 1e9 }, now: 0 }, 1, 0, 0, { act: 'urgent', t: 1, min: 4, max: 25 });
  ok(kept.act !== 'urgent', 'the minimum time does not keep a locked activity (the chore break wins)');
  ok(A.AGAIN && A.CHORES.length === 2 && A.AGAIN.office >= 60 && A.AGAIN.rest >= 30, 'AGAIN cool-downs for the leisure activities', A.AGAIN);
}

// ── a mock village ────────────────────────────────────────────────────────────────────────────────────────────────
function village() {
  const listeners = {};
  const pads = { up_a: { x: 900, y: 300 }, up_b: { x: -400, y: 650 }, hire_c: { x: 1300, y: 900 } };
  const gs = {
    events: { on: (e, f) => ((listeners[e] = listeners[e] || []).push(f)), off: (e, f) => { listeners[e] = (listeners[e] || []).filter((g) => g !== f); }, emit: (e, ...a) => (listeners[e] || []).forEach((f) => f(...a)) },
    time: { now: 0, delayedCall: () => null },
    player: { x: 0, y: 0, stack: { count: 0, items: [] }, room: 8, play() {}, faceTo() {} },
    progress: { pads },
    sites: { plot_a: { x: 2000, y: 200, state: 'plot', dropX: 2050, dropY: 230 }, done_b: { x: 600, y: -300, state: 'done' } },
    tutorial: { inTutorial: false, target: null, textKey: '', destination: () => ({ pad: { x: 300, y: -200 }, label: 'place_market' }) },
    v42: { complete: true, office: null, news: null, lines: { pads: { p2_fish: { x: 1100, y: -500 } } } },
    v4: null,
    economy: { coins: 5000 },
    roads: { route: (x0, y0, x1, y1, out) => { out.length = 0; out.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, { x: x1, y: y1 }); return out; } },
    ui: { toast() {}, banner() {} },
    zoomTarget: 1, zoomBy: true, focusCamera() {}, camFocus: null,
    tills: [{ x: 700, y: 700, value: 350 }, { x: -200, y: 200, value: 40 }],
    life: { residents: [{ key: 'r1', x: 150, y: 80, sprite: {}, faceTo() {} }, { key: 'r2', x: -300, y: -100, sprite: {}, faceTo() {} }], bubbles: null },
    campfires: [{ x: -500, y: 300 }], benches: [{ x: 400, y: 400 }],
    market: { x: 200, y: 100 },
    stationList: [{ enabled: true, outStack: { count: 6, max: 10 }, outPad: { x: -600, y: -400 }, cfg: { output: 'item_fish_cooked' } }],
    piles: {},
    dog: { r: { x: 60, y: 60 }, command() {} },
  };
  return { gs, pads, listeners };
}

console.log('targets: never a pay / hire / upgrade pad or a plot');
{
  const { gs, pads } = village();
  ok(W.isPayTarget(gs, pads.up_a.x + 10, pads.up_a.y - 10), 'an upgrade pad is a pay target');
  ok(W.isPayTarget(gs, 1100, -500), 'a line-upgrade pad (v42.lines) is a pay target');
  ok(W.isPayTarget(gs, 2050, 230), 'a plot drop point is a pay target');
  ok(!W.isPayTarget(gs, 600, -300), 'a finished site is not');
  gs.tutorial.target = { x: 900, y: 300 }; gs.tutorial.textKey = 'obj_sell';
  ok(W.urgentTarget(gs) === null, 'the arrow on a pay pad: no urgent target');
  gs.tutorial.target = { x: 50, y: 50 }; gs.tutorial.textKey = 'obj_unlock_shop';
  ok(W.urgentTarget(gs) === null, 'an unlock / hire / porter objective: no urgent target');
  gs.tutorial.textKey = 'obj_sell';
  ok(!!W.urgentTarget(gs), 'a register to serve: an urgent target');
}

console.log('a 10-minute day with a chore always waiting');
{
  const { gs, pads } = village();
  Settings.data.observeSpend = 'none';
  const P = new ChiefPilot(gs, gs.v42, { cid: 4242 });
  ok(Input.pilot && Input.pilot() === null, 'Input.pilot gives nothing while off');
  ok(P.start('test') === true && P.on, 'start');
  ok(P.blocksPay('build') && P.blocksPay('hire'), 'pads ignore the piloted chief (spend off)');
  Settings.data.observeSpend = 'hire';
  ok(!P.blocksPay('hire') && P.blocksPay('build') && P.blocksPay('upgrade'), "'고용만': hires only");
  Settings.data.observeSpend = 'none';
  // every begin(): the target is never a pay target
  let payTargets = 0, begins = 0;
  const begin0 = P.begin.bind(P);
  P.begin = (a) => { begin0(a); begins++; const tg = P.act && P.act.target; if (tg && W.isPayTarget(gs, tg.x, tg.y)) payTargets++; };
  const starts = [];
  const seen = new Set();
  let last = null;
  // the arrow keeps pointing somewhere: a register (fine), then an upgrade pad (never followed)
  const arrows = [[{ x: 250, y: 150 }, 'obj_sell'], [pads.up_a, 'obj_sell'], [{ x: -350, y: 120 }, 'obj_serve'], [pads.hire_c, 'obj_serve']];
  const dt = 0.1;
  let maxStuck = 0;
  for (let k = 0; k < 6000; k++) {
    gs.time.now += dt * 1000;
    const [tg, key] = arrows[Math.floor(k / 400) % arrows.length];
    gs.tutorial.target = tg; gs.tutorial.textKey = key;
    P.update(dt);
    const v = Input.pilot();
    if (v) { gs.player.x += v.x * 220 * dt; gs.player.y += v.y * 220 * dt; }
    const a = P.act && P.act.act;
    if (a && a !== last) { starts.push([+(k * dt).toFixed(1), a]); seen.add(a); }
    last = a;
    maxStuck = Math.max(maxStuck, P.stuckT);
  }
  console.log('     ' + starts.map(([t, a]) => t + ' ' + a).join(' · '));
  ok(begins > 0 && payTargets === 0, 'never walks to a pay / hire / upgrade pad (' + begins + ' begins)');
  ok(starts.length >= 6, '≥ 6 activities in 10 min (' + starts.length + ')');
  ok(seen.size >= 4, '≥ 4 different activities (' + [...seen].join(', ') + ')');
  ok(seen.has('urgent') || seen.has('work'), 'chores still happen');
  ok(P.stats.stuck === 0, 'never stuck (' + P.stats.stuck + ')');
  ok(gs.economy.coins === 5000, 'no coins spent');
  // replay: the same seed, the same snapshots -> the same day
  const g2 = village();
  const Q = new ChiefPilot(g2.gs, g2.gs.v42, { cid: 4242 });
  Q.start('test');
  const s2 = []; let l2 = null;
  for (let k = 0; k < 6000; k++) {
    g2.gs.time.now += dt * 1000;
    const [tg, key] = arrows[Math.floor(k / 400) % arrows.length];
    g2.gs.tutorial.target = tg; g2.gs.tutorial.textKey = key;
    Q.update(dt);
    const v = Input.pilot();
    if (v) { g2.gs.player.x += v.x * 220 * dt; g2.gs.player.y += v.y * 220 * dt; }
    const a = Q.act && Q.act.act;
    if (a && a !== l2) s2.push([+(k * dt).toFixed(1), a]);
    l2 = a;
  }
  ok(JSON.stringify(s2) === JSON.stringify(starts), 'replayed with the same seed: the same day');
  // hand-back: a human touch ends 관망 in the same call
  ok(Q.on, 'on before the touch');
  Input.onHuman();
  ok(!Q.on && Q.stats.yields === 1 && Input.pilot() === null, 'a human touch hands control back at once (no pilot vector left)');
  ok(randomCalls === 0, 'never Math.random (' + randomCalls + ')');
  P.destroy(); Q.destroy();
}

Math.random = realRandom;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
