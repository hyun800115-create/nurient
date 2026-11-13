// (v4.3) 목표 창 · 자동 이동, Node only (a Phaser stub, a mock village):
//   node tools/test/goals.test.mjs
// The words: ko / en have the same keys and the same {slots}. The main road: the 17 first-loop / zone steps in order,
// every main goal has a name of its own; (v4.3 step B, P) the hall first after village complete at 1,200 + 16 + 4, the v4.2
// buildings without the office (a side goal from the mine on: 400 + 8, its card says the staff come at 읍; at 읍 a main row
// before the bank while it is still the hut), the staff after 읍 only, the mkt_s4 row (flag g43s4, also mkt_s3; half price
// for an s4half village), and the plot rules (plotRules) behind Tutorial.plotFor and Progression.freePlotFor.
// The walk (goals/GoalWalk): drives through Input.pilot only while walking (the
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
const { GOALS, STEPS, Progression, BUILD_UNLOCK, stepPrice } = await import(path.join(ROOT, 'src/systems/Progression.js'));
const { buildCost } = await import(path.join(ROOT, 'src/entities/Site.js'));
const { Tutorial } = await import(path.join(ROOT, 'src/systems/Tutorial.js'));
const { Office } = await import(path.join(ROOT, 'src/systems/office/Office.js'));
const { menuKinds } = await import(path.join(ROOT, 'src/systems/plotRules.js'));
const { WORLD } = await import(path.join(ROOT, 'src/data/world.js'));
const ids43 = await import(path.join(ROOT, 'src/data/ids43.js'));
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
  const want = ['hire_clerk_market', 'op_grill', 'hire_fisherman', 'zone_forest', 'op_sawmill', 'hire_lumberjack', 'zone_farm', 'bld_bakery', 'hire_clerk_bakery', 'op_bakery', 'hire_farmer', 'zone_mine', 'op_smelter', 'hire_miner', 'zone_hunt', 'op_smokehouse', 'hire_hunter'];
  ok(JSON.stringify(ids) === JSON.stringify(want), '17 first-loop / zone steps in order (with the bakery split: 빵집 짓기, 빵집 판매원)', ids);
  ok(MAIN_STEPS.every((s) => t(s.id) !== s.id), 'each has its pad words');
  const named = GOALS.every((g) => {
    if (g.kind === 'build') return t('b_' + g.id) !== 'b_' + g.id;
    if (g.kind === 'region') return t(g.step) !== g.step;
    if (g.kind === 'step') return STEPS.some((s) => s.id === g.id) && t(g.id) !== g.id;
    return true;
  });
  ok(named, 'every v4 goal (building / watchtower / pad) has words for its name');
  ok(V42_BUILDS.every(([, b]) => t('b_' + b) !== 'b_' + b), 'the v4.2 buildings have names');
  ok(JSON.stringify(V42_BUILDS.map((q) => q[1])) === JSON.stringify(['bank42', 'depot42']), '(v4.3 step B) the v4.2 buildings after 읍: the bank and the depot (the office left the list)', V42_BUILDS);
}

// ── (v4.3 step B, P) the chief's buildings and the mkt_s4 row, on a mock village with plot-table-v2 sites ─────────────
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pick4 = (c) => ({ coins: c.coins, item_plank: c.item_plank || 0, item_ingot: c.item_ingot || 0, time: c.time });
/** a Site-like plot from its world.js row (the fields GoalBook / Tutorial / Progression read) */
function plotSite(id, over) {
  const cfg = WORLD.plots[id];
  const st = { id, kind: 'plot', cfg, x: cfg.x, y: cfg.y, size: cfg.size, only: cfg.only || null, replace: cfg.replace || null, state: 'plot', shown: true, building: null, need: {}, stock: { countOf: () => 0 }, pad: { id: 'pad:' + id, contains: () => false } };
  st.dropX = Array.isArray(cfg.drop) ? cfg.drop[0] : cfg.x; st.dropY = Array.isArray(cfg.drop) ? cfg.drop[1] : cfg.y + 90;
  return Object.assign(st, over || {});
}
/** opts: { eup, built: [keys], sites: { id: overrides }, coins, flags } */
function pVillage(o = {}) {
  setLang('ko');
  const built = new Set(o.built || []);
  // (읍: every v4 goal done — its buildings too)
  if (o.eup) for (const g of GOALS) if (g.kind === 'build') built.add(g.id);
  const sites = {};
  for (const id of ['w_hall', 'w_rest', 'v42_office', 'v42_bank', 'v42_depot', 'd_wh', 'e_m1', 'h43_1']) if (WORLD.plots[id]) sites[id] = plotSite(id, (o.sites || {})[id]);
  const rk = { level: o.eup ? 2 : 1, bars: () => [], people: () => 45 };
  const gs = {
    time: { now: 0, delayedCall: () => {} }, events: { emit: () => {} },
    player: { x: -600, y: 900, radius: 16, stack: { count: 0, items: [] } },
    sites, economy: { coins: o.coins === undefined ? 5000 : o.coins },
    isBuilt: (k) => built.has(k), isBuilding: (k) => Object.values(sites).some((q) => q.building === k && q.state !== 'plot' && q.state !== 'done'),
    buildChoices: (st) => menuKinds(st).map((k) => ({ key: k, locked: false, cost: buildCost(k, st.id) })),
    territory: { isOpen: () => true }, v4: { rank: rk, growth: { openShopCount: () => 5 } }, v42: { lines: null, office: null }, paidPads: () => [], ui: {},
  };
  const T = Object.create(Tutorial.prototype); T.gs = gs; T.inTutorialFlag = false;
  gs.tutorial = T;
  const done = {};
  for (const s of MAIN_STEPS) done[s.id] = true;
  const flags = Object.assign({ firstTrain: true, fedMiners: true, townInvite: true, townVisit: true }, o.eup ? { rankEup: true } : {}, o.flags || {});
  const pr = new Progression(gs, { done, flags });
  if (o.eup) { pr.done.tower_east = pr.done.hire2_lumberjack = pr.done.boat_rowboat = pr.done.boat_fishing = true; pr.done.rank_eup = true; }
  gs.progress = pr;
  return { gs, pr, T, sites, built };
}

console.log('(v4.3 step B, P) the hall at village complete');
{
  ok(GOALS[0].id === 'town_hall' && GOALS[0].kind === 'build' && GOALS.filter((g) => g.id === 'town_hall').length === 1, 'GOALS: the town hall first after village complete (once)', GOALS.slice(0, 3).map((g) => g.id));
  ok(BUILD_UNLOCK.town_hall === 'hire_hunter' && BUILD_UNLOCK.town_hall === ids43.HALL_UNLOCK && BUILD_UNLOCK.big_restaurant === 'tower_east', 'BUILD_UNLOCK.town_hall = hire_hunter (ids43 HALL_UNLOCK); the restaurant still at tower_east', { hall: BUILD_UNLOCK.town_hall, rest: BUILD_UNLOCK.big_restaurant });
  ok(same(pick4(buildCost('town_hall', 'w_hall')), { coins: 1200, item_plank: 16, item_ingot: 4, time: 14 }), 'the hall costs 1,200 + 판자 16 + 주괴 4 (time 14)', buildCost('town_hall', 'w_hall'));
  const { gs, pr, T, sites } = pVillage({ coins: 5000 });
  const g = pr.nextGoal();
  ok(g && g.id === 'town_hall', 'a village just complete: the next goal is the hall', g && g.id);
  ok(T.plotFor('town_hall') === sites.w_hall, 'Tutorial.plotFor(town_hall) = w_hall, never w_rest (its `types` take the restaurant alone), though w_rest is nearer', { got: T.plotFor('town_hall') && T.plotFor('town_hall').id });
  ok(T.plotFor('big_restaurant') === sites.w_rest, 'Tutorial.plotFor(big_restaurant) = w_rest');
  const B = new GoalBook(gs), r = B.read(3, 6);
  ok(r.cur && r.cur.id === 'town_hall' && r.cur.coins === 1200 && same(r.cur.items, { item_plank: 16, item_ingot: 4 }) && r.cur.place && r.cur.place.ref === sites.w_hall, 'the goal window: 지금 = 마을회관 짓기 (1,200 + 16 + 4), its walk to the w_hall plot', r.cur && { id: r.cur.id, coins: r.cur.coins, items: r.cur.items, ref: r.cur.place && r.cur.place.ref && r.cur.place.ref.id });
  const tx = T.goalText();
  ok(tx && /^obj_next_build:town_hall/.test(tx.key) && /1,200|1200/.test(tx.text), 'the objective line names the hall and its price (「' + (tx && tx.text) + '」)', tx);
}

console.log('(v4.3 step B, P) Progression.freePlotFor / Tutorial.plotFor through plotRules');
{
  const v = pVillage({ sites: { d_wh: { shown: false } } });
  ok(v.pr.freePlotFor('warehouse') === false, 'freePlotFor(warehouse): a free generic M plot (types: houses + decor) does not count', Object.keys(v.sites));
  v.sites.d_wh.shown = true;
  ok(v.pr.freePlotFor('warehouse') === true && v.T.plotFor('warehouse') === v.sites.d_wh, 'with d_wh shown: freePlotFor and plotFor find the 창고\'s own plot');
  ok(v.pr.freePlotFor('house_c') === true && v.T.plotFor('house_c') === v.sites.h43_1, 'a house: the plots whose rules take it (the S first-house plot nearest)');
  ok(v.T.plotFor('house_a') === v.sites.e_m1, 'house_a: the generic M plot (its `types` take houses), not the house_c-only S plot', v.T.plotFor('house_a') && v.T.plotFor('house_a').id);
  v.sites.e_m1.shown = false;
  ok(v.T.plotFor('deco_rink') === null, 'decor with no plot whose rules take it: none');
}

console.log('(v4.3 step B, P) the office: a side goal from the mine on, the bank guard at 읍, the staff after 읍');
{
  ok(same(pick4(buildCost('chief_office', 'v42_office')), { coins: 400, item_plank: 8, item_ingot: 0, time: 8 }), 'the office costs 400 + 판자 8 (balance.js hut.office)', buildCost('chief_office', 'v42_office'));
  ok(WORLD.plots.v42_office.after === 'zone_mine', 'its plot opens with the mine (world.js, L1)', WORLD.plots.v42_office.after);
  // before 읍: a side row, no main row
  const a = pVillage({ built: ['town_hall'] });
  const ra = new GoalBook(a.gs).read(3, 9);
  const side = ra.side.find((q) => q.id === 'plot:v42_office');
  ok(side && side.coins === 400 && same(side.items, { item_plank: 8 }) && side.name === gt('g_office43') && side.place && side.place.ref === a.sites.v42_office, 'before 읍: a side row 「' + (side && side.name) + '」 400 + 판자 8, its walk to the hut\'s plot', side);
  ok(!new GoalBook(a.gs).mainRows().rows.some((q) => q.id === 'v42:chief_office'), 'before 읍: no office row on the main road');
  // the idle hint: only when the coins also pay for the next main goal (the hall)
  const pathHint = (v) => { const tg = { set: null }; const set = (x, y, h, key) => { tg.set = { x, y, key }; }; const r = v.T.office43Hint(set); return { r, set: tg.set, textKey: v.T.textKey }; };
  const h0 = pVillage({ coins: 1500 });
  const h0r = pathHint(h0);
  ok(!h0r.r, 'the office hint waits while the coins (1,500) do not cover the hall (1,200) + the office (400) — never ahead of the next main goal', h0r);
  const h1 = pVillage({ coins: 1700 });
  const h1r = pathHint(h1);
  ok(h1r.r && h1r.set && h1r.set.key === 'obj_office43' && h1r.set.x === h1.sites.v42_office.dropX, 'with 1,700 coins: the hint points at the hut\'s plot (obj_office43)', h1r);
  const h2 = pVillage({ coins: 9000, eup: true });
  ok(!pathHint(h2).r, 'after 읍 no side hint (v42Goal leads there: the bank guard)');
  ok(t('obj_office43') !== 'obj_office43' && t('bp_chief_office') !== 'bp_chief_office' && /읍/.test(t('bp_chief_office')), 'its words: the hint and the build card\'s line (「' + t('bp_chief_office') + '」)');
  // after 읍, still the hut: the office first on the main road and in the objective, no side row
  const b = pVillage({ eup: true, built: ['town_hall'] });
  b.gs.v42 = { lines: null, office: null };
  const rb = new GoalBook(b.gs).read(3, 9);
  ok(rb.cur && rb.cur.id === 'v42:chief_office' && rb.cur.coins === 400 && rb.cur.place && rb.cur.place.ref === b.sites.v42_office, 'at 읍 with the hut still there: 지금 = 촌장 사무실 짓기 (the bank needs it)', rb.cur && { id: rb.cur.id, coins: rb.cur.coins });
  ok(rb.next.length && rb.next[0].id === 'v42:bank42' && !rb.side.some((q) => q.id === 'plot:v42_office'), '…then the bank; the office is not a side row too', { next: rb.next.map((q) => q.id), side: rb.side.map((q) => q.id) });
  const gb = Tutorial.prototype.v42Goal.call(b.T);
  ok(gb && gb.key === 'obj_next_build:chief_office' && gb.cost === 400 && gb.x === b.sites.v42_office.dropX, 'the objective after 읍: the office plot first (the bank guard)', gb);
  // ((P verify) 읍 with a v4 goal open again — here an older village whose 승격식 came before its hall: still 읍, so the
  //  office stays a main row in 「다음」 (before the bank), never the 「직원은 읍이 되면 와요」 side row
  const bh = pVillage({ eup: true, built: [] });
  bh.built.delete('town_hall');
  bh.gs.v42 = { lines: null, office: null };
  const rbh = new GoalBook(bh.gs).read(3, 30), mbh = new GoalBook(bh.gs).mainRows().rows;
  const ofr = mbh.find((q) => q.id === 'v42:chief_office');
  ok(rbh.cur && rbh.cur.id === 'town_hall' && ofr && ofr.state === 'next' && mbh.indexOf(ofr) < mbh.findIndex((q) => q.id === 'v42:bank42') && !rbh.side.some((q) => q.id === 'plot:v42_office'),
    '읍 with the hall still to build: 지금 = the hall; the office a main row in 「다음」 before the bank, not a side row', { cur: rbh.cur && rbh.cur.id, office: ofr && ofr.state, side: rbh.side.map((q) => q.id) });
  // the office built: the bank is next; the hire pad leads only after 읍
  const c = pVillage({ eup: true, built: ['town_hall', 'chief_office'], sites: { v42_office: { state: 'done' } } });
  const hp = { id: 'staff_sem', role: 'sem', x: 490, y: 745, remaining: 500, active: true, done: false, maxed: false, pad: { contains: () => false }, needsLeave: false };
  c.gs.v42 = { lines: null, office: { hirePad: hp } };
  const rc = new GoalBook(c.gs).read(3, 9);
  ok(rc.cur && rc.cur.id === 'v42:bank42' && !rc.next.concat([rc.cur]).some((q) => q.id === 'v42:chief_office'), 'the office built (before 읍): no office row at 읍, the bank is 지금', rc.cur && rc.cur.id);
  const gc = Tutorial.prototype.v42Goal.call(c.T);
  ok(gc && gc.key === 'obj_next:staff_sem:500', 'after 읍 the objective leads to the hire pad first', gc && gc.key);
  c.gs.v4.rank.level = 1;
  const gc1 = Tutorial.prototype.v42Goal.call(c.T);
  ok(!gc1 || gc1.key !== 'obj_next:staff_sem:500', 'before 읍 the hire branch never leads (no staff before 읍)', gc1 && gc1.key);
  // Office.nextRole / staffRows: all four after 읍; hired staff stay
  const off = (level, hired) => { const o = Object.create(Office.prototype); o.gs = { v4: { rank: { level } } }; o.building = {}; o.seeds = ['sem', 'ttal', 'bok', 'chong'].map((r) => (hired.indexOf(r) >= 0 ? 7 : 0)); o.staff = {}; return o; };
  ok(off(1, []).nextRole() === null && off(1, ['sem']).nextRole() === null, 'before 읍: no hire pad at all (Office.nextRole null), also after an older village\'s 셈이');
  ok(off(2, []).nextRole() === 'sem' && off(2, ['sem', 'ttal']).nextRole() === 'bok' && off(2, ['sem', 'ttal', 'bok']).nextRole() === 'chong', 'after 읍: 셈이 → 딸랑이 → 소복이 → 총총이 as before');
  const rows1 = off(1, []).staffRows();
  ok(rows1.length === 4 && rows1.every((q) => !q.hired && /읍이 되면 와요/.test(q.text) && !/코인/.test(q.text)), 'the 직원 tab before 읍: 「… · 읍이 되면 와요」 on every row, no price', rows1.map((q) => q.text));
  const rows2 = off(2, []).staffRows();
  ok(rows2.every((q) => /코인/.test(q.text)), 'after 읍: the price and the pad as before', rows2.map((q) => q.text));
  ok(off(1, []).deskTab() === 'staff' && off(1, ['sem']).deskTab() === 'stock', 'the desk pad opens 직원 until 셈이 works, then 재고');
}

console.log('(v4.3 step B, P) the mkt_s4 row');
{
  const s4 = STEPS.find((q) => q.id === ids43.STEP43.shop4);
  ok(s4 && s4.type === 'shop' && s4.level === 4 && s4.after === 'f:rankEup' && s4.flag === ids43.FLAG43.g43s4 && s4.also === 'mkt_s3' && s4.side === true, 'STEPS mkt_s4 = { shop, level 4, after f:rankEup, flag g43s4, also mkt_s3, side } (postdepot_addendum §4.1)', s4);
  ok(!MAIN_STEPS.some((q) => q.id === 'mkt_s4') && s4.v4 === true, 'side: never on MAIN_STEPS / nextPad (the main road shows it as GOALS43 row 9); v4: the tests\' unlockAll leaves it alone');
  ok(same(stepPrice(s4, {}), { coins: 2000, items: { item_plank: 20, item_ingot: 8 } }) && same(stepPrice(s4, { s4half: true }), { coins: 1000, items: { item_plank: 10, item_ingot: 4 } }), 'its price: 2,000 + 20 + 8; half (market43.stage4Old) for an s4half village', [stepPrice(s4, {}), stepPrice(s4, { s4half: true })]);
  const m3 = STEPS.find((q) => q.id === 'mkt_s3');
  ok(same(stepPrice(m3, { s4half: true }), { coins: 400, items: { item_plank: 8 } }), 'the half price is for the 4단 only (3단 stays 400 + 8)');
  const vis = (flags, done) => { const v = pVillage({ eup: true, flags }); Object.assign(v.pr.done, done || {}); return v.pr.visibleSteps().some((q) => q.id === 'mkt_s4'); };
  ok(!vis({}, { mkt_s3: true }) && !vis({ s4half: true }, { mkt_s3: true }), 'no mkt_s4 pad at 읍 without g43s4 (an s4half village too: no early pad, no banner)');
  ok(vis({ g43s4: true }, { mkt_s3: true }) && !vis({ g43s4: true }, {}), 'with g43s4: shown on top of 3단 only (also: mkt_s3)');
  const full = pVillage({ eup: true }), half = pVillage({ eup: true, flags: { s4half: true } });
  const rf = new GoalBook(full.gs).stepRow(s4, 'now'), rh = new GoalBook(half.gs).stepRow(s4, 'now');
  ok(rf.coins === 2000 && same(rf.items, { item_plank: 20, item_ingot: 8 }) && rh.coins === 1000 && same(rh.items, { item_plank: 10, item_ingot: 4 }), 'the goal window\'s row before the pad stands: full, and half for s4half (Progression.stepPrice)', { rf: [rf.coins, rf.items], rh: [rh.coins, rh.items] });
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
    sites: {}, isBuilt: (k) => k === 'station' || k === 'toolsmith' || k === 'town_hall', isBuilding: () => false, buildChoices: () => [],
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
