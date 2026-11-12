// (v4.2, docs/v42_plan.md §7 + §15) 관망 모드, Node only:
//   node tools/test/pilot.test.mjs
// agenda.choose() is a pure function of (snapshot, seed, day, index, current): 200 random snapshots decide the same
// twice and in a replayed sequence; the pilot never walks to a pay / hire / upgrade pad or a plot (urgentTarget and
// begin() drop them; blocksPay() while on, '고용만' lets only hires through); a 10-minute run on a mock village where
// a chore is always waiting still changes activity ≥ 6 times with ≥ 4 different ones (the chore break + AGAIN
// cool-downs); ((v4.3) 둘러보기) a touch / key on the village no longer ends 관망 — a finger past the slop and the keys
// look around (Input.pan / panKeys → CameraDirector: detached, clamped to the camera bounds incl. 150 px over the sea's top,
// no cut while detached, attach() glides back), only the button (toggle) hands control back; ((v4.3 a3.1) 수금 on an
// emptied till goes on to the next till ≥ 200 in the same act, never to one on a pay pad); never Math.random.
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
  ok(A.AGAIN && A.CHORES.length === 3 && A.CHORES.indexOf('collect') >= 0 && A.AGAIN.office >= 60 && A.AGAIN.rest >= 30, 'AGAIN cool-downs for the leisure activities; 급한 일 · 업무 · 수금 share the chore break', A.AGAIN);
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
  // ((v4.3) a human on the village does not end 관망 any more; the button does)
  ok(Q.on && Input.watch && Input.watch() === true, 'on before the touch; Input.watch() says so');
  Input.onHuman('touch'); Input.onHuman('move');
  ok(Q.on && Q.stats.yields === 0, 'a touch / move on the village does not end 관망 (only the button does)');
  Q.toggle();
  ok(!Q.on && Q.stats.yields === 1 && Input.pilot() === null && Input.watch() === false, 'the 관망 button hands control back at once (no pilot vector left)');
  Q.countdown = 2.5; Input.onHuman('touch');
  ok(Q.countdown === 0, 'off: a touch still stops the auto-start countdown');
  ok(randomCalls === 0, 'never Math.random (' + randomCalls + ')');
  P.destroy(); Q.destroy();
}

// ((v4.3) 둘러보기: Input routes a finger / the keys to the camera while 관망 is on; CameraDirector moves it)
console.log('둘러보기: a finger and the keys look around, the camera stays the player\'s until 「촌장님 보기」');
{
  const { gs } = village();
  // a camera 720 x 1280 logical at zoom 1 over the open land (camRect: 150 px over the sea's top edge)
  gs.cameras = { main: { zoom: 1, width: 720, height: 1280 } };
  gs.zoomCur = 1;
  gs.camTarget = { x: 1500, y: 900 };
  gs.territory = { camRect: { x: -800, y: -150, w: 5000, h: 3600 } };
  gs.player.x = 1500; gs.player.y = 930;
  const P = new ChiefPilot(gs, gs.v42, { cid: 7 });
  P.start('test');
  ok(P.hinting === true || Settings.data.obsPanHint === true, 'the first 관망: the look-around hint (once per device)');
  // a joystick finger: a tap stays a tap, a drag pans (no joystick)
  Input.pointerDown({ id: 1, x: 300, y: 600 });
  ok(Input.pan.active && !Input.joy.active, 'a finger on the village during 관망 looks around: no joystick');
  Input.pointerMove({ id: 1, x: 306, y: 604 });
  ok(Input.pan.dx === 0 && Input.pan.dy === 0 && !Input.pan.moved, 'inside the slop (a tap) nothing moves');
  Input.pointerMove({ id: 1, x: 200, y: 560 });
  ok(Input.pan.moved && Input.pan.dx === -100 && Input.pan.dy === -40, 'past the slop the whole drag counts (' + Input.pan.dx + ', ' + Input.pan.dy + ')');
  const v = Input.update(1000);
  ok(Q_on(P) && Input.joy.active === false && v === Input.vec, 'Input.update during a drag: still 관망, the pilot\'s vector');
  P.update(1 / 60);
  ok(P.cam.free && Math.round(P.cam.free.x) === 1600 && Math.round(P.cam.free.y) === 940 && gs.camPan === P.cam.free, 'the village moves with the finger: the camera detached by (+100, +40) world px at zoom 1', P.cam.free);
  Input.pointerUp({ id: 1 });
  ok(!Input.pan.active && P.on, 'the finger lifts: 관망 goes on');
  // clamp: far up-left stops at the bounds (view centre ≥ camRect.x + 360, ≥ camRect.y + 640)
  P.cam.panBy(-9000, -9000);
  ok(P.cam.free.x === -800 + 360 && P.cam.free.y === -150 + 640, 'clamped to the camera bounds, 150 px over the top included (' + P.cam.free.x + ', ' + P.cam.free.y + ')');
  P.cam.panBy(50, 0);
  ok(P.cam.free.x === -800 + 360 + 50, 'and back at once (no dead zone past the edge)');
  P.cam.panBy(1e5, 1e5);
  ok(P.cam.free.x === -800 + 5000 - 360 && P.cam.free.y === -150 + 3600 - 640, 'the far corner too');
  // zoom 2: half the view, a wider range; a logical px is half a world px
  gs.cameras.main.zoom = 2; gs.zoomCur = 2;
  P.cam.panBy(1e5, 1e5);
  ok(P.cam.free.x === -800 + 5000 - 180, 'at zoom 2 the range follows the smaller view (' + P.cam.free.x + ')');
  const x0 = P.cam.free.x;
  Input.pointerDown({ id: 2, x: 100, y: 100 }); Input.pointerMove({ id: 2, x: 140, y: 100 });
  P.update(1 / 60); Input.pointerUp({ id: 2 });
  ok(Math.abs(P.cam.free.x - (x0 - 20)) < 0.01, 'a 40 px drag at zoom 2 moves 20 world px (' + (P.cam.free.x - x0).toFixed(2) + ')');
  gs.cameras.main.zoom = 1; gs.zoomCur = 1;
  // a flick glides on, then stops
  P.cam.panBy(-2000, -1000);
  Input.pointerDown({ id: 3, x: 400, y: 600 });
  for (let i = 1; i <= 6; i++) { Input.pointerMove({ id: 3, x: 400 - 30 * i, y: 600 }); P.update(1 / 60); }
  Input.pointerUp({ id: 3 });
  const f0 = P.cam.free.x;
  for (let i = 0; i < 120; i++) P.update(1 / 60);
  const f1 = P.cam.free.x;
  ok(f1 > f0 + 40 && P.cam.vel.x === 0, 'a flick glides on a little and stops (' + Math.round(f1 - f0) + ' px)');
  // ((review F1) a pinch's second finger (UI → Input.release) stops the look-around where it is: no glide with the
  //  first finger's speed while both fingers are held still)
  Input.pointerDown({ id: 6, x: 400, y: 600 });
  for (let i = 1; i <= 3; i++) { Input.pointerMove({ id: 6, x: 400 - 25 * i, y: 600 }); P.update(1 / 60); }
  const pv = Math.abs(P.cam.vel.x);
  Input.release();
  const r0 = P.cam.free.x;
  for (let i = 0; i < 40; i++) P.update(1 / 60);
  ok(pv > 100 && Math.abs(P.cam.free.x - r0) < 0.01 && P.cam.vel.x === 0 && !Input.pan.flick, 'a second finger (a pinch) stops the look-around: no glide (speed was ' + Math.round(pv) + ' px/s, moved ' + (P.cam.free.x - r0).toFixed(2) + ' px)');
  // ((review F10) the slop is the UI's tap slop: a 15 px move is still a tap (it may chat with a resident), no pan
  Input.pointerDown({ id: 7, x: 300, y: 600 }); Input.pointerMove({ id: 7, x: 315, y: 600 });
  ok(!Input.pan.moved && Input.pan.dx === 0, 'a 15 px move is still a tap: no pan (PAN_SLOP 16)');
  Input.pointerUp({ id: 7 });
  P.update(1 / 60);
  ok(!Input.pan.flick && P.cam.vel.x === 0, 'a tap lifted: no glide');
  // keys in 관망: they pan, the chief is not steered by them, 관망 goes on
  Input.keys = { left: { isDown: false }, left2: { isDown: false }, right: { isDown: true }, right2: { isDown: false }, up: { isDown: false }, up2: { isDown: false }, down: { isDown: false }, down2: { isDown: false } };
  const k0 = P.cam.free.x;
  Input.update(2000);
  ok(Input.panKeys.x === 1 && P.on, 'a key during 관망: panKeys, 관망 goes on');
  P.update(0.5);
  ok(Math.abs(P.cam.free.x - (k0 + 450)) < 1, 'the keys look around at pilot.panKeys px/s (' + Math.round(P.cam.free.x - k0) + ' px in 0.5 s)');
  Input.keys.right.isDown = false; Input.update(2100);
  // no cut while detached
  P.cam.nextCut = 0;
  gs.events.emit('built', 'x', { x: 1500, y: 900 });
  const cuts0 = P.cam.cuts;
  P.update(0.1);
  ok(P.cam.cuts === cuts0 && P.cam.blocked >= 1 && P.cam.free, 'an event while looking around: no cut (held back ' + P.cam.blocked + ')');
  // a jump the player asked for (the office panel's 「보러 가기」) glides the free point there; a finger takes over
  ok(P.cam.glideTo(1200, 1400) === true, 'a jump the player asked for while looking around: a glide of the free point');
  for (let i = 0; i < 90; i++) P.update(1 / 60);
  ok(Math.hypot(P.cam.free.x - 1200, P.cam.free.y - 1400) < 2 && !P.cam.goal, 'it arrives (' + Math.round(P.cam.free.x) + ', ' + Math.round(P.cam.free.y) + ')');
  P.cam.glideTo(3000, 2000); P.update(1 / 60);
  Input.pointerDown({ id: 5, x: 300, y: 600 }); Input.pointerMove({ id: 5, x: 260, y: 600 }); P.update(1 / 60); Input.pointerUp({ id: 5 });
  ok(!P.cam.goal, 'a finger takes over from the glide');
  // 「촌장님 보기」: attached, a glide back, the cuts again later
  ok(P.cam.attach() === true && !P.cam.free && gs.camPan === null && gs.camGlide === true && P.cam.nextCut >= 8, '「촌장님 보기」: attached, the camera glides back, no cut in the next 8 s');
  // the button while looking around: off, the camera glides back
  P.cam.panBy(300, 0);
  ok(!!P.cam.free, 'looking around again');
  P.toggle();
  ok(!P.on && !P.cam.free && gs.camPan === null && gs.camGlide === true && !Input.pan.active, 'the 관망 button: off, the camera glides back to the chief');
  // off: the same finger steers the chief again (a joystick)
  Input.pointerDown({ id: 4, x: 300, y: 600 });
  ok(Input.joy.active && !Input.pan.active, 'after 관망 a finger is the joystick again');
  Input.release();
  Input.keys = null;
  P.destroy();
}
function Q_on(P) { return P.on; }

// ((v4.2 CODE-2 review fixes) the night, the day's train, 누리, a load first
console.log('the day: night rest, one train a day, 누리, the bag first');
{
  const base = { now: 0, urgent: false, lunchOpen: true, bagCount: 0, bagRoom: 8, work: true, noCourier: false, cashMax: 0, trainSoon: false, trainNear: false, chatMate: false, chatIdle: 0, office: true, paperNew: false, unread: 0, dog: false, dogIdle: 0, locked: {} };
  const pickAt = (over, n = 40) => { const c = Object.assign({}, base, over); const out = {}; for (let k = 0; k < n; k++) { const a = A.choose(c, 9, 1, k, null).act; out[a] = (out[a] || 0) + 1; } return out; };
  const at3 = pickAt({ hour: 3 });
  ok((at3.evening || 0) === 40, 'at 03:00 the evening (the office lamp, the stove) beats hauling (' + JSON.stringify(at3) + ')');
  const at20 = pickAt({ hour: 20.5 });
  ok((at20.work || 0) === 40, 'at 20:30 the day\'s 업무 still beats the evening (' + JSON.stringify(at20) + ')');
  ok(pickAt({ hour: 3, urgent: true }).urgent === 40, 'an urgent chore still wakes him at night');
  const tr = pickAt({ hour: 14, trainSoon: true, trainNear: true, trainToday: false });
  ok((tr.train || 0) === 40, 'the day\'s first train watch beats the afternoon chores (' + JSON.stringify(tr) + ')');
  ok(!pickAt({ hour: 14, trainSoon: true, trainNear: true, trainToday: true }).train, 'a second watch the same day does not');
  const dg = pickAt({ hour: 15, work: false, dog: true, dogIdle: 700 });
  ok((dg.dog || 0) === 40, '누리 after 10 minutes without a game comes before a rest (' + JSON.stringify(dg) + ')');
  const lunchBag = pickAt({ hour: 12.2, bagCount: 5 });
  ok(!lunchBag.lunch && (lunchBag.work || 0) === 40, 'with a load to deliver, lunch waits: 업무 first (' + JSON.stringify(lunchBag) + ')');
  ok((pickAt({ hour: 12.2, bagCount: 5, work: false }).lunch || 0) === 40, 'a load nobody takes does not block lunch');
  // between two loads (bag empty) the 업무 minimum time does not hold off lunch
  const c = Object.assign({}, base, { hour: 12.1 });
  let lunches = 0; for (let k = 0; k < 40; k++) if (A.choose(c, 9, 1, k, { act: 'work', t: 3, min: 20, max: 60 }).act === 'lunch') lunches++;
  ok(lunches >= 30, 'lunch takes over 업무 between two loads (' + lunches + '/40)');
  const c2 = Object.assign({}, base, { hour: 12.1, bagCount: 3 });
  ok(A.choose(c2, 9, 1, 0, { act: 'work', t: 3, min: 20, max: 60 }).kept === true, 'a load in the bag keeps 업무 for its minimum time');
}

// (the running watch / game is judged as it began: starting it must not take its own bonus and range away)
console.log('a train watch and a game with 누리 last once begun');
{
  const { gs } = village();
  const rail = { running: true, phase: 'toOurs', untilArrival: () => 12 };
  gs.v4 = { ours: { x: 2000, y: 0, wait: [{ x: 1960, y: 10 }] }, rail, clock: { on: true, day: () => 2, hour: () => 15 } };
  gs.dog.r = { x: 1100, y: 0 };                       // 누리 1,100 px away: in range only after 10 minutes without a game
  const P = new ChiefPilot(gs, gs.v42, { cid: 4242 });
  P.start('test');
  let c0 = P.context();
  ok(c0.trainSoon && c0.trainNear && !c0.trainToday && A.score('train', c0) >= 55, 'the day\'s first train, 2,000 px away: a watch (' + A.score('train', c0) + ')');
  P.begin('train');
  let c1 = P.context();
  ok(c1.trainNear && !c1.trainToday && A.score('train', c1) >= 55, 'once begun the watch keeps its range and bonus (' + A.score('train', c1) + ')');
  rail.phase = 'atOurs';
  ok(A.score('train', P.context()) !== null, 'it goes on while the train stands at the platform');
  rail.phase = 'fromOurs';
  ok(A.score('train', P.context()) === null, 'and ends when the train leaves');
  P.begin('rest');
  rail.phase = 'toOurs';
  const c2 = P.context();
  ok(c2.trainToday && !c2.trainNear, 'after the watch: the day\'s watch is done (range back to 1,500 px)');
  const d0 = P.context();
  ok(d0.dog && d0.dogIdle >= 600 && A.score('dog', d0) >= 35, '누리 after a long while, 1,100 px away: a game (' + A.score('dog', d0) + ')');
  P.begin('dog');
  const d1 = P.context();
  ok(d1.dog && A.score('dog', d1) >= 35, 'once begun the game keeps its range and bonus (' + A.score('dog', d1) + ')');
  P.begin('rest');
  const d2 = P.context();
  ok(!d2.dog && d2.dogIdle < 600, 'after the game: 누리 1,100 px away is out of range again');
  P.destroy();
}

// ((v4.3 a3.1) 수금: the till he steps on is emptied at once (CashPad); the same act goes on to the next till ≥ 200 worth
//  the walk, never one on a pay pad — he stood on the empty pad until the act ran out)
console.log('수금: an emptied till sends him on to the next one');
{
  Settings.data.observeSpend = 'none';
  const day = (tills, secs, each) => {
    const { gs } = village();
    gs.tills = tills; gs.stationList = []; gs.life.residents = []; gs.dog = null;      // nothing but 수금 to do
    const P = new ChiefPilot(gs, gs.v42, { cid: 4242 });
    P.start('test');
    for (let k = 0; k < secs * 10; k++) {
      gs.time.now += 100;
      P.update(0.1);
      const v = Input.pilot();
      if (v) { gs.player.x += v.x * 220 * 0.1; gs.player.y += v.y * 220 * 0.1; }
      for (const c of tills) if (c.value > 0 && Math.hypot(gs.player.x - c.x, 2 * (gs.player.y - c.y)) < 20) { gs.economy.coins += c.value; c.value = 0; }
      each(P);
    }
    P.destroy();
    return gs;
  };
  const a = { x: 300, y: 200, value: 900 }, b = { x: -400, y: -300, value: 600 }, seq = [], acts = new Set();
  const g1 = day([a, b], 14, (P) => { const c = P.act; if (c && c.act === 'collect') { acts.add(c); const q = c.target && c.target.till; if (q && seq[seq.length - 1] !== q) seq.push(q); } });
  ok(seq[0] === a && seq[1] === b && acts.size === 1, 'the near full till, then — in the same 수금 — the next till ≥ 200', { seq: seq.map((q) => (q === a ? 'a' : 'b')), acts: acts.size });
  ok(a.value === 0 && b.value === 0 && g1.economy.coins === 6500, 'both tills taken (' + g1.economy.coins + ')');
  const a2 = { x: 300, y: 200, value: 900 }, onPad = { x: 900, y: 310, value: 700 };    // up_a's upgrade pad (900, 300)
  let toPad = 0;
  day([a2, onPad], 40, (P) => { const tg = P.act && P.act.target; if (tg && tg.till === onPad) toPad++; });
  ok(a2.value === 0 && onPad.value === 700 && toPad === 0, 'never on to a till on a pay pad (' + toPad + ' frames)');
}

Math.random = realRandom;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
