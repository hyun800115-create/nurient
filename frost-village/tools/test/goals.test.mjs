// (v4.3) 목표 창 · 자동 이동, Node only (a Phaser stub, a mock village):
//   node tools/test/goals.test.mjs
// The words: ko / en have the same keys and the same {slots}. The main road: the 15 first-loop / zone steps in order,
// every main goal has a name of its own. The walk (goals/GoalWalk): drives through Input.pilot only while walking (the
// pilot's vector otherwise), arrives within 8 px of the exact spot on the mock village, blocks paying on the way only;
// a joystick (a test's setInput), a finger held ≥ 0.12 s and a key cancel it at once with a toast; locked / passive /
// off-land / tutorial / 관망 cases say why; a wall it cannot pass is given up after a while ('stuck').
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.Phaser = { GameObjects: { Graphics: class {}, Container: class {}, Sprite: class {}, Image: class {} }, BlendModes: {}, Math: {}, Geom: {}, Scene: class {} };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const { GOAL_STR, gt } = await import(path.join(ROOT, 'src/systems/goals/strings.js'));
const { MAIN_STEPS, V42_BUILDS, GoalBook } = await import(path.join(ROOT, 'src/systems/goals/GoalBook.js'));
const { GoalWalk } = await import(path.join(ROOT, 'src/systems/goals/GoalWalk.js'));
const { GOALS, STEPS, Progression } = await import(path.join(ROOT, 'src/systems/Progression.js'));
const { Input } = await import(path.join(ROOT, 'src/core/Input.js'));
const { t, setLang } = await import(path.join(ROOT, 'src/data/strings.js'));
const { BALANCE } = await import(path.join(ROOT, 'src/data/balance.js'));

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 400) : '')); } };

console.log('the words');
{
  const ko = GOAL_STR.ko, en = GOAL_STR.en;
  const kk = Object.keys(ko), ek = Object.keys(en);
  ok(kk.length === ek.length && kk.every((k) => k in en), 'ko and en have the same keys (' + kk.length + ')', kk.filter((k) => !(k in en)).concat(ek.filter((k) => !(k in ko))));
  const slots = (s) => (s.match(/\{(\w+)(\|[^}]*)?\}/g) || []).map((m) => m.replace(/\|.*\}/, '}')).sort().join(',');
  const bad = kk.filter((k) => slots(ko[k]) !== slots(en[k]));
  ok(!bad.length, 'every key has the same {slots} in both languages', bad);
  setLang('ko');
  ok(gt('g_arrived', { place: '광장 판매대' }) === '도착했어요 · 광장 판매대', 'gt fills a slot', gt('g_arrived', { place: '광장 판매대' }));
  ok(gt('g_progress', { done: 3, all: 45 }) === '큰 목표 3 / 45', 'gt fills two slots');
  setLang('en');
  ok(gt('g_title') === 'Village goals', 'English when the game is in English');
  setLang('ko');
  ok(gt('no_such_key') === 'no_such_key', 'an unknown key comes back as itself');
}

console.log('the main road');
{
  const ids = MAIN_STEPS.map((s) => s.id);
  const want = ['hire_clerk_market', 'op_grill', 'hire_fisherman', 'zone_forest', 'op_sawmill', 'hire_lumberjack', 'zone_farm', 'op_bakery', 'hire_farmer', 'zone_mine', 'op_smelter', 'hire_miner', 'zone_hunt', 'op_smokehouse', 'hire_hunter'];
  ok(JSON.stringify(ids) === JSON.stringify(want), '15 first-loop / zone steps in order', ids);
  ok(MAIN_STEPS.every((s) => t(s.id) !== s.id), 'each has its pad words');
  const named = GOALS.every((g) => {
    if (g.kind === 'build') return t('b_' + g.id) !== 'b_' + g.id;
    if (g.kind === 'region') return t(g.step) !== g.step;
    if (g.kind === 'step') return STEPS.some((s) => s.id === g.id) && t(g.id) !== g.id;
    return true;
  });
  ok(named, 'every v4 goal (building / watchtower / pad) has words for its name');
  ok(V42_BUILDS.every(([, b]) => t('b_' + b) !== 'b_' + b), 'the three v4.2 buildings have names');
}

// ── a mock village: open snow, a wall at x = 600 when `wall` is on ─────────────────────────────────────────────────
function village(o = {}) {
  const toasts = [];
  const pinned = [];
  const pilot = { on: !!o.pilotOn, countdown: 0, stopped: 0, blocksPay() { return false; }, stop() { this.on = false; this.stopped++; } };
  const base = () => (pilot.on ? { x: 0.5, y: 0 } : null);
  Input.pilot = base;
  const gs = {
    time: { now: 0 },
    player: { x: 0, y: 0, radius: 16, stack: { count: 0, items: [] } },
    tutorial: { inTutorial: !!o.tutorial },
    onboard: o.onboard || null,
    collision: { offLand: (x, y) => y < -2000, inLand: () => null },
    roads: { route: (x0, y0, x1, y1, out) => { out.length = 0; out.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 + 30 }, { x: x1, y: y1 }); return out; }, detour: () => null },
    ui: { toast: (m) => toasts.push(m) },
    economy: { coins: 1000 },
    scene: { get: () => null },
    v42: { pilot, nav: { pinned: null, pin(p) { this.pinned = { pad: { x: p.x, y: p.y } }; pinned.push(p); return true; }, unpin() { this.pinned = null; } } },
  };
  return { gs, toasts, pinned, pilot, base };
}
/** a frame: Input.update (the human / our vector) -> the chief moves like Player.update -> the walk decides */
function frame(gs, W, dt = 1 / 60, wall) {
  gs.time.now += dt * 1000;
  const v = Input.update(gs.time.now);
  if (v.mag > 0.05) {
    const sp = BALANCE.player.speed, vf = BALANCE.player.verticalFactor;
    let nx = gs.player.x + v.x * sp * dt;
    const ny = gs.player.y + v.y * sp * vf * dt;
    if (wall && nx > 600) nx = 600;
    gs.player.x = nx; gs.player.y = ny;
  }
  W.update(dt);
}
const row = (x, y, extra) => Object.assign({ id: 'pad_x', name: '시험 발판', icon: 'ui_icon_goal', state: 'now', place: { x, y } }, extra || {});

console.log('a walk: there exactly, nothing paid on the way');
{
  const { gs, toasts, pinned, pilot } = village();
  const W = new GoalWalk(gs, gs.v42);
  ok(Input.pilot === W.wrap && Input.pilot() === null, 'the input slot gives the pilot\'s (none) while not walking');
  const r = W.go(row(900, 420));
  ok(r.ok && W.on && pinned.length === 1 && pinned[0].quiet, 'go(): walking, the guide pinned on the place (quiet)', r);
  ok(pilot.blocksPay('hire') === true, 'pads take nothing while walking');
  let s = 0;
  while (W.on && s < 20) { frame(gs, W); s += 1 / 60; }
  const d = Math.hypot(gs.player.x - 900, (gs.player.y - 420) * 2);
  ok(!W.on && W.last === 'arrived' && d <= 8, 'arrived within 8 px of the exact spot (' + d.toFixed(1) + ' px, ' + s.toFixed(1) + ' s)');
  ok(pilot.blocksPay('hire') === false, 'on arrival the pads work again (standing there pays)');
  ok(toasts.some((m) => /도착/.test(m)), 'a toast says it arrived', toasts);
  ok(Input.pilot() === null, 'no vector left after arrival');
  ok(gs.v42.nav.pinned === null, 'the guide pin ends with the walk');
}

console.log('the player takes over at once');
{
  for (const how of ['joystick', 'finger', 'keys']) {
    const { gs, toasts } = village();
    const W = new GoalWalk(gs, gs.v42);
    W.go(row(1500, 300));
    for (let i = 0; i < 30; i++) frame(gs, W);
    const at = [gs.player.x, gs.player.y];
    if (how === 'joystick') Input.override = { x: -1, y: 0 };
    else if (how === 'finger') { Input.joy.active = true; Input.joy.bx = Input.joy.kx = 100; Input.joy.by = Input.joy.ky = 100; }
    else Input.keys = { left: { isDown: true }, right: { isDown: false }, up: { isDown: false }, down: { isDown: false }, left2: { isDown: false }, right2: { isDown: false }, up2: { isDown: false }, down2: { isDown: false } };
    let n = 0;
    while (W.on && n < 60) { frame(gs, W); n++; }
    const ms = Math.round((n * 1000) / 60);
    ok(!W.on && W.last === 'human' && ms <= (how === 'finger' ? 160 : 40), how + ': the walk stops (' + ms + ' ms)', { last: W.last, n });
    ok(toasts.some((m) => /직접 조종/.test(m)), how + ': a toast says control is back');
    Input.override = null; Input.joy.active = false; Input.keys = null;
    frame(gs, W);
    ok(Input.pilot() === null && Math.hypot(gs.player.x - at[0], gs.player.y - at[1]) > 0, how + ': no walk vector afterwards');
  }
}

console.log('why not');
{
  const { gs, toasts } = village();
  const W = new GoalWalk(gs, gs.v42);
  const cur = { name: '벌목장 열기' };
  let r = W.go({ id: 'zone_farm', name: '농장 열기', state: 'next', place: null }, cur);
  ok(!r.ok && r.why === 'locked' && /벌목장 열기/.test(toasts[toasts.length - 1]), 'a later goal with no place yet: locked, names the current one', toasts[toasts.length - 1]);
  r = W.go({ id: 'firstTrain', name: '첫 기차', state: 'wait', why: 'passive', place: null }, cur);
  ok(!r.ok && r.why === 'passive' && /저절로/.test(toasts[toasts.length - 1]), 'a goal that comes by itself says so');
  r = W.go({ id: 'warehouse', name: '창고 짓기', state: 'now', why: 'noplot', place: null }, cur);
  ok(!r.ok && r.why === 'noplot', 'no free plot: says so');
  r = W.go(row(300, -3000));
  ok(!r.ok && r.why === 'noway' && !W.on, 'a place off the land (the fog, the sea): cannot go');
  r = W.go(row(gs.player.x + 4, gs.player.y));
  ok(!r.ok && r.why === 'here', 'already there');
  gs.tutorial.inTutorial = true;
  r = W.go(row(800, 200));
  ok(!r.ok && r.why === 'tutorial' && !W.on, 'not during the tutorial');
  gs.tutorial.inTutorial = false;
  gs.onboard = { mode: 'act2' };
  ok(!W.go(row(800, 200)).ok, 'not during the onboarding\'s Act 2');
  gs.onboard = { mode: 'act3' };
  ok(W.go(row(800, 200)).ok, 'fine in Act 3 (the tips)');
  W.stop('human', true);
}

console.log('관망 on: switched off first; a walk stops when 관망 starts');
{
  const { gs, toasts, pilot } = village({ pilotOn: true });
  const W = new GoalWalk(gs, gs.v42);
  ok(Input.pilot() && Input.pilot().x === 0.5, 'the pilot drives through the same slot while 관망 is on');
  const r = W.go(row(700, 300));
  ok(r.ok && !pilot.on && pilot.stopped === 1 && /관망을 끄고/.test(toasts[toasts.length - 1]), '관망 off, the walk on, one toast', toasts);
  for (let i = 0; i < 20; i++) frame(gs, W);
  pilot.on = true;
  frame(gs, W);
  ok(!W.on && W.last === 'pilot', '관망 started: the walk gives way');
  pilot.on = false;
}

console.log('a wall: another way, then given up');
{
  const { gs, toasts } = village();
  const W = new GoalWalk(gs, gs.v42);
  W.go(row(1200, 0));
  let s = 0;
  while (W.on && s < 30) { frame(gs, W, 1 / 30, true); s += 1 / 30; }
  ok(!W.on && W.last === 'stuck' && s < 12, 'stuck behind the wall: given up after ' + s.toFixed(1) + ' s (detour tried ' + W.detours + 'x)');
  ok(toasts.some((m) => /막혔/.test(m)), 'a toast says the way is blocked');
  ok(gs.v42.nav.pinned !== null, 'the guide line stays (the pin is kept)');
}

console.log('(review M1) the 창고 with no free plot: "no free plot", not "comes by itself"');
{
  setLang('ko');
  const toasts = [];
  const gs = {
    time: { now: 0 }, player: { x: 0, y: 0, radius: 16 }, tutorial: { inTutorial: false, plotFor: () => null }, onboard: null,
    sites: {}, isBuilt: (k) => k === 'station' || k === 'toolsmith', isBuilding: () => false, buildChoices: () => [],
    territory: { isOpen: (r) => r === 'east' }, economy: { coins: 5000 }, ui: { toast: (m) => toasts.push(m) },
    v4: null, v42: { pilot: null, nav: null }, paidPads: () => [], collision: null, roads: null,
  };
  const pr = new Progression(gs, { done: { hire_hunter: true, tower_east: true }, flags: { firstTrain: true } });
  for (const s of MAIN_STEPS) pr.done[s.id] = true;
  gs.progress = pr;
  const B = new GoalBook(gs);
  const wh = B.mainRows().rows.find((r) => r.id === 'warehouse');
  ok(wh && wh.why === 'noplot' && B.sub(wh) === gt('g_noPlot'), 'its line: 「' + (wh && B.sub(wh)) + '」', wh && { state: wh.state, why: wh.why });
  const W = new GoalWalk(gs, gs.v42);
  const r = W.go(wh, B.read(3, 4).cur);
  ok(!r.ok && r.why === 'noplot' && toasts[toasts.length - 1] === gt('g_noPlot'), 'a tap says so too (「' + toasts[toasts.length - 1] + '」)', r);
  const b = B.read(3, 4);
  ok(b.cur && b.cur.id === 'fedMiners' && B.sub(b.cur) === gt('g_fedSub'), '(review L7) 광부 식량: a line under its name (「' + (b.cur && B.sub(b.cur)) + '」)', b.cur && { id: b.cur.id, sub: B.sub(b.cur) });
  const lockedRow = { id: 'boat_rowboat', state: 'next', place: null, coins: 700, items: null };
  ok(/잠김$/.test(B.sub(lockedRow)), '(review L7) a later goal with no place yet says 잠김 (「' + B.sub(lockedRow) + '」)');
  W.destroy();
}

console.log('(review L4 / L5 / L6) a ceremony or a panel pauses the walk; a finished target ends it; the old pin comes back');
{
  const { gs, toasts, pinned } = village();
  const W = new GoalWalk(gs, gs.v42);
  const board = { pad: { x: 50, y: 50 }, label: 'place_dock_stn' };
  gs.v42.nav.pinned = board;
  const ref = { done: false };
  W.go(row(1400, 200, { place: { x: 1400, y: 200, ref } }));
  ok(pinned.length === 1 && pinned[0].goal && pinned[0].restore === board, 'the walk pins its place and keeps the notice-board pin to put back', pinned[0] && { goal: pinned[0].goal, restore: pinned[0].restore === board });
  for (let i = 0; i < 20; i++) frame(gs, W);
  gs.v4 = { rank: { ceremonyOn: true } };
  frame(gs, W);                         // (the vector of the frame before is used once)
  const at = [gs.player.x, gs.player.y];
  for (let i = 0; i < 600; i++) frame(gs, W);
  ok(W.on && Math.hypot(gs.player.x - at[0], gs.player.y - at[1]) < 1 && W.stuckT === 0, 'the 읍 ceremony: he waits where he is for 10 s (still walking, no stuck clock)', { on: W.on, moved: Math.hypot(gs.player.x - at[0], gs.player.y - at[1]), stuckT: W.stuckT });
  gs.v4 = null;
  gs.ui.buildOpen = true;
  for (let i = 0; i < 30; i++) frame(gs, W);
  ok(W.on && Math.hypot(gs.player.x - at[0], gs.player.y - at[1]) < 1, 'the build menu open: he waits too');
  gs.ui.buildOpen = false;
  for (let i = 0; i < 30; i++) frame(gs, W);
  ok(W.on && Math.hypot(gs.player.x - at[0], gs.player.y - at[1]) > 20, '…and walks on after');
  ref.done = true;
  frame(gs, W);
  ok(!W.on && W.last === 'gone' && /이미 끝나서/.test(toasts[toasts.length - 1]), 'the target finished meanwhile: the walk ends with a line saying so (「' + toasts[toasts.length - 1] + '」)', W.last);
  W.destroy();
}

console.log('destroy');
{
  const { gs, base } = village();
  const W = new GoalWalk(gs, gs.v42);
  W.destroy();
  ok(Input.pilot === null && base, 'the input slot is cleared with the scene');
}

console.log(fail === 0 ? 'goals.test: ' + pass + ' passed, 0 failed' : 'goals.test: ' + pass + ' passed, ' + fail + ' FAILED');
process.exit(fail ? 1 : 0);
