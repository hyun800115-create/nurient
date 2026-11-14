// (v4.3 step B 「마을 새 단장 둘째 걸음」, B0) the contracts and seams B0 fixes, Node only:
//   node tools/test/v43_contracts.test.mjs
// 1 save: a reload keeps `v43` and `c1.hall.stn` (Game's holder -> Save.write -> storage text -> Save.load's migrateSave
//   -> the holder again, and sanitizeSave twice = once); stn clamps at v4.rent.cap. While B0's minimal keep-rule is the
//   rule (Save.js has no sanitizeV43 yet) also: a pre-B save keeps its shape (every pre-B fixture), keepV43 clamps
//   lay / seen / refunds43. Those B0-only rows retire themselves when S's sanitizeV43 lands (save_v43.mjs owns them then)
//   (also the gs.v43 holder: a new village { lay: 2, letter43 + tour43 seen }, a loaded save without one { lay: 0 })
// 3 the after-load seam and the v43 bus: info defaults, a hook / listener that throws is skipped, off(), recent()
// 4 plotRules: today's rules exactly (`only`, else the Civic MENU of the size) for every plot x every building; only
//   w_civic / d_labour / d_school / d_clinic may be hidden (none in B0); isHidden reads a row or a Site
// 5 balance: the stage-4 keys are there with sane values (a 4th shelfMax / spawnMul entry for every shop stage);
//   balanceCheck repairs a broken hand edit and fills missing lines
// 6 world: pads.mkt_s4 (B0: on the mkt_s3 spot); the mkt_s4 step, once P adds it, is the §2 row (as amended by the
//   post-depot addendum: flag g43s4, also mkt_s3); WORLD.v43
//   { oldStart = the hut door, shopFront }; the ids43 plot ids that exist today are WORLD.plots rows
// 7 strings: every package's start / end anchor pair once, in order, in ko and in en (B0b: + G, T after P1; and the goal
//   window's own table goals/strings.js carries the G pair)
// 8 the seams in Game.js / UI.js are where the plan says (runAfterLoad after unstickChief and before the bakery banner;
//   gs.v43 held and serialized; buildV3 skips hidden plots; both cards mounted)
// 9 tools/test/v43_helpers.mjs asStepB / isStepB on a save object, its text and a keys fixture
// 10 (B0b, postdepot_addendum.md §6.1) the post-depot chain (G) and the 읍장 취임 맛보기 (T): the G43 ids, seen keys, flag
//   and x key are save-safe; the goals43 balance keys and their repairs; v43/index.js registers G and T between N and P1;
//   the stubs answer nothing (while they are the stubs; once G is in, the real Goals43 keeps the contract: attach makes
//   gs.goals43 with every seam, closed on a bare scene, its listeners gone at shutdown; once T is in, G and T on one bare
//   scene: row 10 listed, T's gate shut, both gone at shutdown); the GoalBook seams (rows, sub, side de-duplication, G's side
//   rows) and Tutorial.v42Goal's order, driven by a stand-in gs.goals43; the B0b class changes no row; Rank.hold:
//   ceremonyOn = cerOn || hold, a hold never ticks or ends the ceremony and is not state().ceremony; Rank.hallFrame is
//   the 승격식's hall framing, and the 승격식 runs as before while hold is unset
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.Phaser = { GameObjects: { Graphics: class {}, Container: class {}, Sprite: class {}, Image: class {} }, BlendModes: {}, Math: {}, Geom: {}, Scene: class {} };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const FIX = path.join(HERE, 'fixtures');
const imp = (p) => import(path.join(ROOT, p));

const SaveM = await imp('src/core/Save.js');
const { sanitizeSave, migrateSave, sanitizeC1, SAVE_VERSION } = SaveM;
// B0's minimal v43 keep-rule is the rule until S's sanitizeV43 lands (then save_v43.mjs checks the rules and the remap)
const B0_ONLY = typeof SaveM.sanitizeV43 !== 'function' && typeof SaveM.keepV43 === 'function';
const keepV43 = SaveM.keepV43;
const { BALANCE } = await imp('src/data/balance.js');
const { checkBalance } = await imp('src/data/balanceCheck.js');
const { WORLD } = await imp('src/data/world.js');
const ids = await imp('src/data/ids43.js');
const { isHidden, menuKinds, plotAccepts } = await imp('src/systems/plotRules.js');
const { MENU, CATALOG } = await imp('src/systems/Civic.js');
const v43 = await imp('src/systems/v43/index.js');
const H = await import(path.join(HERE, 'v43_helpers.mjs'));

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const clone = (o) => JSON.parse(JSON.stringify(o));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const CAP = Math.floor(BALANCE.v4.rent.cap);
const skipped = [];
const b0 = (msg, fn) => { if (B0_ONLY) fn(); else skipped.push(msg); };

// ================================================================== 1. save round trip
console.log('1 save: v43 and c1.hall.stn' + (B0_ONLY ? '' : ' (S\'s sanitizeV43 is in: the B0-only rows are skipped)'));
// Game.serialize's state, written the way Save.write writes it, read back the way Save.load reads it
const reload = (state, t) => migrateSave(JSON.parse(JSON.stringify(Object.assign({}, state, { v: SAVE_VERSION, t: t || 1 }))));
{
  const base = JSON.parse(fs.readFileSync(path.join(FIX, 'v41_save_smart_46min.json'), 'utf8'));
  const s0 = migrateSave(clone(base));
  b0('a v4.1 village migrates with no v43 block / no hall.stn; a loaded save without v43 holds { lay: 0 }', () => {
    ok(!!s0 && s0.v === SAVE_VERSION && !('v43' in s0), 'a v4.1 village migrates with no v43 block (old saves keep their shape)', s0 && Object.keys(s0));
    ok(!!s0 && !!s0.c1 && !(s0.c1.hall && 'stn' in s0.c1.hall), 'and no hall.stn', s0 && s0.c1);
    const hold = v43.v43Holder(s0.v43, false);
    ok(same(hold, { lay: 0 }), 'a loaded save without v43 holds { lay: 0 } (R43 still remaps it later)', hold);
    const back = reload(Object.assign(clone(s0), { v43: hold }));
    ok(!!back && same(back.v43, { lay: 0 }), 'a reload keeps v43 { lay: 0 }', back && back.v43);
  });
  // a new village: lay 2, the letter and the tour already seen
  const fresh = v43.v43Holder(undefined, true);
  ok(same(fresh, { lay: ids.LAY, seen: { letter43: 1, tour43: 1 } }) && ids.LAY === 2, 'a new village holds { lay: 2, seen: { letter43, tour43 } }', fresh);
  const state = Object.assign(clone(s0), { v43: fresh, c1: Object.assign(clone(s0.c1 || {}), { hall: { tax: 120, acc: 0.5, stn: 1600 } }) });
  const back = reload(state, 2);
  ok(!!back && same(back.v43, fresh), 'a reload keeps a new village\'s v43', back && back.v43);
  ok(!!back && back.c1 && back.c1.hall && back.c1.hall.stn === 1600 && back.c1.hall.tax === 120, 'a reload keeps c1.hall.stn above 1,500 (1,600) beside the tax box', back && back.c1 && back.c1.hall);
  ok(same(sanitizeSave(clone(back)), back) && same(reload(back, 3), Object.assign({}, back)), 'sanitizeSave of a sanitized save changes nothing; a second reload neither (v43 + stn)');
  const again = v43.v43Holder(back.v43, false);
  ok(same(again, fresh) && again !== back.v43 && again.seen !== back.v43.seen, 'the holder copies the saved block (the game never edits the loaded object)');
  // a remapped village (what S writes): seen and refunds43 kept
  const rv = { lay: 2, seen: { s4offer: 1 }, refunds43: { coins: 1200, items: { item_plank: 16 }, wh: {}, moved: 3, kept: 0 } };
  const back3 = reload(Object.assign(clone(s0), { v43: rv }), 4);
  ok(!!back3 && back3.v43.lay === 2 && same(back3.v43.seen, rv.seen) && same(back3.v43.refunds43, rv.refunds43), 'a remapped village\'s v43 (lay 2, seen, refunds43) is kept', back3 && back3.v43);
}
b0('keepV43 clamps lay / seen / refunds43, drops the rest, never throws, is idempotent', () => {
  const K = (x) => keepV43(x);
  ok(K(undefined) === null && K(null) === null && K(7) === null && K([1]) === null && K('x') === null, 'not an object -> no v43 block');
  ok(same(K({}), { lay: 0 }) && same(K({ lay: '2' }), { lay: 2 }) && same(K({ lay: 2.7 }), { lay: 2 }) && same(K({ lay: 12 }), { lay: 9 }) && same(K({ lay: -3 }), { lay: 0 }) && same(K({ lay: 'x' }), { lay: 0 }), 'lay: an int 0..9 (numeric text read, junk 0)');
  const sn = K({ lay: 2, seen: { letter43: 1, tour43: true, s4offer: 2, 'Bad-Key': 1, half: 'half', toolongkeytoolongkeytoolong: 1 } });
  ok(same(sn.seen, { letter43: 1, tour43: 1 }), 'seen: [a-z0-9_]{1,24} keys set to 1 / true become 1; anything else is dropped', sn.seen);
  const many = {}; for (let i = 0; i < 40; i++) many['k' + i] = 1;
  ok(Object.keys(K({ seen: many }).seen).length === 32, 'seen keeps at most 32 keys');
  ok(!('seen' in K({ lay: 2, seen: { x: 0 } })), 'an empty seen is not written');
  const big = { coins: 5, note: 'x'.repeat(600) };
  ok(!('refunds43' in K({ lay: 2, refunds43: big })) && !('refunds43' in K({ lay: 2, refunds43: [1, 2] })), 'refunds43 over 512 B (or not an object) is dropped');
  const junk = K({ lay: 2, toggles: { counters: { a: false } }, other: 1 });
  ok(same(junk, { lay: 2 }), 'other fields (toggles, src, unknown) are dropped until S\'s sanitizeV43 takes over', junk);
  let threw = false;
  const cyc = { lay: 2 }; cyc.refunds43 = { self: null }; cyc.refunds43.self = cyc.refunds43;
  try { K(cyc); } catch (e) { threw = true; }
  ok(!threw && K(cyc) === null, 'never throws (a cyclic refunds43 gives no block)');
  let fz = 0, idem = 0;
  let seed = 4242;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  const vals = [0, 1, 2, true, false, null, 'x', '2', -1, 1e9, 2.5, {}, [], { a: 1 }];
  for (let i = 0; i < 300; i++) {
    const o = { lay: vals[Math.floor(rnd() * vals.length)], seen: {}, refunds43: { coins: Math.floor(rnd() * 3000), items: { item_plank: Math.floor(rnd() * 30) } } };
    for (let k = 0; k < 6; k++) o.seen[['letter43', 'tour43', 's4offer', 'X', 'a b', 'zz'][Math.floor(rnd() * 6)]] = vals[Math.floor(rnd() * vals.length)];
    let r1, r2;
    try { r1 = K(o); r2 = K(clone(r1)); } catch (e) { fz++; continue; }
    if (!same(r1, r2)) idem++;
  }
  ok(fz === 0 && idem === 0, '300 random blocks: never throws, keepV43(keepV43(x)) = keepV43(x)', { fz, idem });
});
{
  const C = (h) => sanitizeC1({ settlers: 3, hall: h });
  ok(C({ tax: 10, acc: 0, stn: 1500 }).hall.stn === 1500, 'stn 1,500 kept');
  ok(C({ tax: 10, acc: 0, stn: 5000 }).hall.stn === CAP && CAP === 2000, 'stn above the cap clamps to v4.rent.cap (' + CAP + '), not to the tax box\'s taxCap', C({ tax: 10, stn: 5000 }).hall);
  ok(!('stn' in C({ tax: 10, acc: 0, stn: -4 }).hall) && !('stn' in C({ tax: 10, acc: 0, stn: 'abc' }).hall) && !('stn' in C({ tax: 10, acc: 0, stn: 0 }).hall) && !('stn' in C({ tax: 10, acc: 0 }).hall), 'stn 0 / negative / junk / absent -> not written');
  ok(C({ tax: 9999, acc: 0, stn: 10 }).hall.tax === 1500, 'the tax box keeps its own cap (taxCap 1,500)');
}
b0('every pre-B fixture loads with no v43 block and no hall.stn', () => {
  // B0 adds nothing to an old village (a pre-B fixture carries no v43 / lv: make_v43.mjs refuses one that does)
  const files = fs.readdirSync(FIX).filter((f) => f.endsWith('.json')).sort();
  const bad = [];
  let n = 0;
  for (const f of files) {
    const o = JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
    const raw = o.keys ? JSON.parse(o.keys['frostVillage.save.v1']) : o;
    if (!raw || raw.v43 !== undefined || raw.lv !== undefined) continue;
    n++;
    const s = migrateSave(raw);
    if (!s) { bad.push(f + ': does not load'); continue; }
    if ('v43' in s) bad.push(f + ': v43');
    if (s.c1 && s.c1.hall && 'stn' in s.c1.hall) bad.push(f + ': stn');
  }
  ok(n >= 12 && !bad.length, n + ' pre-B fixtures load with no v43 block and no hall.stn', bad);
});

// ================================================================== 3. the seams
console.log('3 the after-load seam and the bus');
{
  const seen = [];
  const offA = v43.onAfterLoad((gs, info) => seen.push(['a', gs, info]));
  const offB = v43.onAfterLoad(() => { throw new Error('boom (expected by the test)'); });
  const offC = v43.onAfterLoad((gs, info) => seen.push(['c', gs, info]));
  const err = console.error; let logged = 0; console.error = () => { logged++; };
  let threw = false, info;
  try { info = v43.runAfterLoad({ id: 'gs' }, { fresh: true }); } catch (e) { threw = true; }
  console.error = err;
  offA(); offB(); offC();
  ok(!threw && logged === 1, 'a hook that throws is logged and skipped (never reaches Game.create\'s catch)', { threw, logged });
  ok(seen.length === 2 && seen[0][0] === 'a' && seen[1][0] === 'c' && seen[0][1].id === 'gs', 'every other hook runs, in the order they were added', seen.map((q) => q[0]));
  ok(same(info, { fresh: true, remapped: false, refunds43: null }) && same(seen[0][2], info), 'info = { fresh, remapped, refunds43 } with defaults', info);
  seen.length = 0;
  v43.runAfterLoad({}, {});
  ok(seen.length === 0, 'off() removes a hook');
}
{
  const got = [];
  const n0 = v43.recent().length;
  const off1 = v43.on(ids.EV43.card, (d, name) => got.push([name, d]));
  const off2 = v43.on(ids.EV43.card, () => { throw new Error('listener boom (expected by the test)'); });
  const err = console.error; let logged = 0; console.error = () => { logged++; };
  v43.emit(ids.EV43.card, { id: 'chief_office', side: true });
  v43.emit(ids.EV43.letter, { state: 'open' });
  console.error = err;
  ok(got.length === 1 && got[0][0] === 'card' && got[0][1].id === 'chief_office' && logged === 1, 'emit reaches its listeners only; a listener that throws is logged and skipped', { got, logged });
  off1(); off2();
  v43.emit(ids.EV43.card, { id: 'x' });
  ok(got.length === 1, 'off() stops a listener');
  const r = v43.recent();
  ok(r.length - n0 === 3 && r[r.length - 1].name === 'card' && r[r.length - 2].name === 'letter' && r[r.length - 2].data.state === 'open', 'recent() lists what was emitted, newest last', r.slice(-3));
  for (let i = 0; i < 100; i++) v43.emit('milestone', { id: 'n' + i });
  ok(v43.recent().length === 64 && v43.recent()[63].data.id === 'n99', 'recent() keeps the last 64');
  const names = Object.values(ids.EV43);
  ok(names.length === 10 && new Set(names).size === names.length && names.every((n) => /^[a-z0-9]+$/.test(n)) && ids.EV43.goal43 === 'goal43' && ids.EV43.taste === 'taste', 'EV43: 10 distinct event names (B0b: + goal43, taste)', names);
}

// ================================================================== 4. plotRules
console.log('4 plotRules = today\'s rules');
{
  const plots = WORLD.plots, kinds = Object.keys(CATALOG).concat(['chief_office', 'bank42', 'depot42', 'station', 'labour_office', 'nope']);
  const today = (p, k) => (p.only ? p.only === k : (MENU[p.size] || MENU.M).indexOf(k) >= 0);
  // (rows with L1's `types` follow L's rule, checked by plots.mjs; every other row keeps today's rule exactly)
  const diff = [], typed = Object.keys(plots).filter((id) => plots[id].types !== undefined);
  for (const id in plots) if (plots[id].types === undefined) for (const k of kinds) if (plotAccepts(plots[id], k) !== today(plots[id], k)) diff.push(id + ':' + k);
  ok(Object.keys(plots).length >= 25 && !diff.length, 'plotAccepts = `only`, else the Civic MENU of the size, on ' + (Object.keys(plots).length - typed.length) + ' plots x ' + kinds.length + ' buildings' + (typed.length ? ' (' + typed.length + ' rows with `types` left to plots.mjs)' : ''), diff.slice(0, 10));
  ok(same(menuKinds({ size: 'XL' }), MENU.XL) && same(menuKinds(plots.v42_office), ['chief_office']) && same(menuKinds({ size: '?' }), MENU.M) && same(menuKinds(null), []), 'menuKinds: XL plot = the hall + the restaurant, `only` plot = its building, unknown size = M');
  const site = { only: null, size: 'S', cfg: { only: 'house_a', size: 'S' } };
  ok(same(menuKinds(site), ['house_a']) && plotAccepts({ only: 'town_hall', size: 'XL' }, 'town_hall') && !plotAccepts(plots.w_hall, 42), 'a Site reads its row\'s `only`; a non-string kind is refused');
  const hidden = Object.keys(plots).filter((id) => isHidden(plots[id]));
  const mayHide = [ids.PLOT43.civic, ids.PLOT43.labour, ids.PLOT43.school, ids.PLOT43.clinic];
  ok(hidden.every((id) => mayHide.indexOf(id) >= 0), 'only w_civic / d_labour / d_school / d_clinic may be hidden (' + (hidden.length ? hidden.join(', ') : 'none yet: L1 adds them') + ')', hidden);
  ok(isHidden({ hidden: true }) && isHidden({ cfg: { hidden: true } }) && !isHidden({ hidden: 'yes' }) && !isHidden(null) && !isHidden({}), 'isHidden: hidden === true on the row or on a Site\'s cfg');
}

// ================================================================== 5. balance
console.log('5 balance: the stage-4 keys');
{
  const M = BALANCE.market43, S4 = M.stage4 || {};
  const int = (v, lo) => Number.isInteger(v) && v >= lo;
  ok(int(S4.coins, 1) && int(S4.item_plank, 0) && int(S4.item_ingot, 0) && M.stage4Old > 0 && M.stage4Old <= 1, 'market43.stage4 { coins, item_plank, item_ingot } and stage4Old in (0, 1] (B0: 2,000 + 20 + 8, 0.5)', { s4: S4, old: M.stage4Old });
  const sellerSrc = fs.readFileSync(path.join(ROOT, 'src/entities/Seller.js'), 'utf8');
  const stMax = Number((sellerSrc.match(/export const SHOP_STAGE_MAX = (\d+);/) || [])[1]);
  ok((stMax === 3 || stMax === 4) && M.shelfMax.length >= 4 && M.spawnMul.length >= 4, 'shelfMax / spawnMul have a 4th entry (B0: 80, 1.2); SHOP_STAGE_MAX ' + stMax + (stMax === 3 ? ' — never read until M raises it' : ''), { shelf: M.shelfMax, mul: M.spawnMul });
  // balanceCheck repairs a broken hand edit (and fills a missing block silently)
  const keep = clone(M);
  M.stage4 = { coins: -5, item_plank: 'many', item_ingot: 1e6 }; M.stage4Old = 7; M.shelfMax = [40, 40, 60, 0]; M.spawnMul = [1, 1, 1.1, 'x'];
  const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  checkBalance();
  const fixed = { s4: clone(M.stage4), old: M.stage4Old, shelf: M.shelfMax.slice(), mul: M.spawnMul.slice() };
  delete M.stage4; delete M.stage4Old;
  checkBalance();
  const filled = { s4: clone(M.stage4), old: M.stage4Old };
  console.warn = warn;
  Object.assign(M, keep);
  ok(fixed.s4.coins === 1 && fixed.s4.item_plank === 20 && fixed.s4.item_ingot === 999 && fixed.old === 1 && fixed.shelf[3] === 1 && fixed.mul[3] === 1.1 && warned >= 5, 'balanceCheck clamps a broken stage4 / stage4Old / 4th entries (and says so)', fixed);
  ok(same(filled.s4, { coins: 2000, item_plank: 20, item_ingot: 8 }) && filled.old === 0.5, 'a balance.js without the stage-4 lines gets the defaults', filled);
  ok(same(M.stage4, keep.stage4) && same(M.shelfMax, keep.shelfMax) && same(M.spawnMul, keep.spawnMul), '(the test puts BALANCE back)');
}

// ================================================================== 6. world
console.log('6 world: pads.mkt_s4, WORLD.v43, the plot ids');
{
  const a = WORLD.pads.mkt_s4, b = WORLD.pads.mkt_s3;
  ok(!!a && Number.isFinite(a.x) && Number.isFinite(a.y), 'pads.mkt_s4 is a pad row (B0: on the mkt_s3 spot; M may move it)', a);
  // (only while the pad is inert: M may re-place it (§2 Pad row) in the same package that raises SHOP_STAGE_MAX to 4,
  //  and M's worktree is cut before S lands, so B0_ONLY alone would fail M's own run)
  const stMax6 = Number((fs.readFileSync(path.join(ROOT, 'src/entities/Seller.js'), 'utf8').match(/export const SHOP_STAGE_MAX = (\d+);/) || [])[1]);
  if (stMax6 === 3) b0('pads.mkt_s4 shares the mkt_s3 spot', () => ok(a.x === b.x && a.y === b.y && same(a.labelAt, b.labelAt), 'pads.mkt_s4 sits on the mkt_s3 spot (1525, 900), so padvis / v43_layout see nothing new', a));
  else skipped.push('pads.mkt_s4 on the mkt_s3 spot (SHOP_STAGE_MAX ' + stMax6 + ': M places it)');
  const { STEPS } = await imp('src/systems/Progression.js');
  const s4 = STEPS.find((s) => s.id === ids.STEP43.shop4);
  // ((B0b, postdepot_addendum.md BP-41 / §4.1) the row also waits for G's flag g43s4 (GOALS43 row 9) and for stage 3)
  ok(!s4 || (s4.type === 'shop' && s4.level === 4 && s4.after === 'f:rankEup' && s4.side === true && s4.flag === ids.FLAG43.g43s4 && s4.also === 'mkt_s3'), s4 ? 'the mkt_s4 step is { type: shop, level: 4, after: f:rankEup, flag: g43s4, also: mkt_s3, side }' : 'no mkt_s4 step yet (P adds it), so the pad is never shown', s4);
  const hut = WORLD.v42.hut;
  const door = [hut.x + hut.door[0], hut.y + hut.door[1]], os = WORLD.v43 && WORLD.v43.oldStart;
  const dDoor = Array.isArray(os) && os.every(Number.isFinite) ? Math.hypot(os[0] - door[0], (os[1] - door[1]) * 2) : Infinity;
  ok(dDoor <= 200, 'WORLD.v43.oldStart is at the hut door (' + os + ', ' + Math.round(dDoor) + ' px from ' + door + '; B0 = the door itself, L1 may nudge it)');
  const sf = WORLD.v43 && WORLD.v43.shopFront;
  ok(Array.isArray(sf) && sf.length === 2 && sf.every(Number.isFinite) && sf[1] > 0 && sf[0] > WORLD.left, 'WORLD.v43.shopFront is a point on the map (' + sf + ')');
  const now = ['hall', 'rest', 'house1', 'house2', 'office'].map((k) => ids.PLOT43[k]);
  ok(now.every((id) => !!WORLD.plots[id]), 'the ids43 plot ids that exist today are WORLD.plots rows', now.filter((id) => !WORLD.plots[id]));
  const pids = Object.values(ids.PLOT43);
  ok(new Set(pids).size === pids.length && pids.every((id) => /^[a-z0-9_]{1,40}$/.test(id)), 'PLOT43 ids are distinct and save-safe');
  ok(Object.keys(ids.WORKSHOP_PLOT43).every((k) => Object.values(ids.PLOT43).indexOf(ids.WORKSHOP_PLOT43[k]) >= 0), 'every workshop\'s fixed plot is a PLOT43 id');
}

// ================================================================== 7. strings
console.log('7 strings: the package anchors');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/data/strings.js'), 'utf8');
  const koAt = src.indexOf('\n  ko: {'), enAt = src.indexOf('\n  en: {'), endAt = src.indexOf('\n};', enAt);
  const parts = { ko: src.slice(koAt, enAt), en: src.slice(enAt, endAt) };
  const PK = ['L', 'S', 'P', 'H', 'M', 'N', 'P1', 'G', 'T'];
  const bad = [];
  for (const lang in parts) {
    let last = -1;
    for (const k of PK) {
      const s = parts[lang].split('// >>> v43B:' + k + ' start').length - 1, e = parts[lang].split('// <<< v43B:' + k + ' end').length - 1;
      const si = parts[lang].indexOf('// >>> v43B:' + k + ' start'), ei = parts[lang].indexOf('// <<< v43B:' + k + ' end');
      if (s !== 1 || e !== 1 || !(si < ei) || si < last) bad.push(lang + ':' + k);
      last = ei;
    }
  }
  ok(!bad.length, 'ko and en each carry the 9 start / end pairs (L, S, P, H, M, N, P1, G, T) once, in order', bad);
  // (B0b) the goal window's own word table: the G pair once in ko and once in en
  const gsrc = fs.readFileSync(path.join(ROOT, 'src/systems/goals/strings.js'), 'utf8');
  const gko = gsrc.indexOf('\n  ko: {'), gen = gsrc.indexOf('\n  en: {'), gend = gsrc.indexOf('\n};', gen);
  const gbad = [];
  for (const [lang, part] of [['ko', gsrc.slice(gko, gen)], ['en', gsrc.slice(gen, gend)]]) {
    const s1 = part.split('// >>> v43B:G start').length - 1, e1 = part.split('// <<< v43B:G end').length - 1;
    if (s1 !== 1 || e1 !== 1 || !(part.indexOf('// >>> v43B:G start') < part.indexOf('// <<< v43B:G end'))) gbad.push(lang);
  }
  ok(gko > 0 && gen > gko && gend > gen && !gbad.length, 'goals/strings.js: ko and en each carry the G start / end pair once', gbad);
  const { STRINGS } = await imp('src/data/strings.js');
  const ko = Object.keys(STRINGS.ko).length, en = Object.keys(STRINGS.en).length;
  ok(ko > 400 && en > 400, 'the tables still load (' + ko + ' ko / ' + en + ' en keys)');
}

// ================================================================== 8. the seams in the code
console.log('8 the seams in Game.js / UI.js');
{
  const g = fs.readFileSync(path.join(ROOT, 'src/scenes/Game.js'), 'utf8');
  const b0 = g.indexOf('\n  build() {'), b1 = g.indexOf('\n  buildFences', b0) > 0 ? g.indexOf('\n  buildFences', b0) : g.length;
  const body = g.slice(b0, b1);
  const u = body.indexOf('this.unstickChief();'), r = body.indexOf('runAfterLoad(this'), k = body.indexOf('bakeryMovedNow');
  ok(u > 0 && r > u && k > r, 'Game.build: runAfterLoad after unstickChief and before the bakery banner (N clears bakeryMovedNow)', { u, r, k });
  ok(/this\.v43 = /.test(body), 'Game.build holds gs.v43');
  const v3 = g.slice(g.indexOf('\n  buildV3() {'), g.indexOf('\n  refreshSites('));
  ok(/if \(isHidden\(cfg\)\) continue;/.test(v3) && v3.indexOf('isHidden(cfg)') < v3.indexOf('new Site('), 'Game.buildV3 skips a hidden plot before it makes a Site');
  const ser = g.slice(g.indexOf('\n  serialize() {'), g.indexOf('\n  save(force) {'));
  ok(/v43: this\.v43/.test(ser), 'Game.serialize writes v43');
  const ui = fs.readFileSync(path.join(ROOT, 'src/scenes/UI.js'), 'utf8');
  ok(/this\.saveHold = new SaveHoldCard\(this\)/.test(ui) && /this\.renewal43 = new Renewal43Card\(this\)/.test(ui), 'UI.create mounts the SaveHoldCard and Renewal43 card stubs');
  const { SaveHoldCard } = await imp('src/scenes/SaveHoldCard.js');
  ok(typeof SaveHoldCard === 'function' && typeof v43.Renewal43Card === 'function' && typeof v43.Renewal43.afterLoad === 'function' && typeof v43.PlayLog.afterLoad === 'function', 'the card classes and the after-load entries exist (S, N and P1 fill them)');
}

// ================================================================== 9. the test helper
console.log('9 v43_helpers');
{
  const s = { v: 8, coins: 3, v43: { lay: 0, seen: { letter43: 1 } } };
  const a = H.asStepB(s);
  ok(a !== s && a.v43.lay === 2 && a.v43.seen.letter43 === 1 && s.v43.lay === 0 && H.isStepB(a) && !H.isStepB(s), 'asStepB(save object): a marked copy, other v43 fields kept, the input untouched');
  const tx = H.asStepB(JSON.stringify({ v: 8 }));
  ok(typeof tx === 'string' && JSON.parse(tx).v43.lay === 2 && H.isStepB(tx), 'asStepB(save text) -> text');
  const fx = { _note: 'x', keys: { 'frostVillage.save.v1': JSON.stringify({ v: 8 }), 'frostVillage.save.v1.chat': '{}' } };
  const fa = H.asStepB(fx);
  ok(JSON.parse(fa.keys['frostVillage.save.v1']).v43.lay === 2 && fa.keys['frostVillage.save.v1.chat'] === '{}' && fa._note === 'x' && H.isStepB(fa) && !H.isStepB(fx), 'asStepB(keys fixture): only the save key is marked');
  ok(H.LAY === ids.LAY && H.SAVE_KEY === 'frostVillage.save.v1', 'LAY / SAVE_KEY come from ids43');
  const back = migrateSave(JSON.parse(JSON.stringify(H.asStepB(migrateSave(JSON.parse(fs.readFileSync(path.join(FIX, 'v41_save_smart_25min.json'), 'utf8')))))));
  ok(back && back.v43 && back.v43.lay === 2, 'a marked fixture still carries lay 2 after Save.load\'s migrateSave');
}

// ================================================================== 10. B0b: the post-depot chain and the taste
console.log('10 B0b: the post-depot chain (G) and the 읍장 취임 맛보기 (T)');
const G43V = ids.G43;
const strip2 = (o) => JSON.parse(JSON.stringify(o));
{
  // ---- ids: row ids are also the rows' v43.seen markers (rows 1–8), so they follow the seen-key rule
  const SEEN_KEY = /^[a-z0-9_]{1,24}$/;
  const G = ids.G43, gids = Object.values(G);
  ok(gids.length === 10 && new Set(gids).size === 10 && gids.every((k) => SEEN_KEY.test(k)), 'G43: 10 distinct row ids, save-safe (/^[a-z0-9_]{1,24}$/, the seen-key rule)', gids);
  ok(G.s4 === ids.STEP43.shop4 && G.s4 === 'mkt_s4' && G.taste === 'g43_taste' && gids.slice(0, 8).every((k) => /^g43_/.test(k)), 'row 9 is the mkt_s4 step itself, row 10 g43_taste, rows 1–8 g43_*');
  const S = ids.SEEN43;
  ok(S.g43open === 'g43open' && S.g43all === 'g43all' && S.g43ready === 'g43ready' && S.taste === 'eup_taste' && S.letter === 'letter43' && S.tour === 'tour43' && S.s4offer === 's4offer', 'SEEN43 += g43open, g43all, g43ready, taste: eup_taste (B0\'s three unchanged)', S);
  const sv = Object.values(S);
  ok(new Set(sv).size === sv.length && sv.every((k) => SEEN_KEY.test(k)) && sv.every((k) => gids.indexOf(k) < 0), 'every seen key is distinct, save-safe and never a row id', sv);
  ok(ids.FLAG43.g43s4 === 'g43s4' && ids.FLAG43.s4half === 's4half', 'FLAG43 += g43s4');
  // the save keeps every chain key (rows 1–8 + the four) next to today's three; 'eupTaste' (capitals) would be dropped (BP-46)
  const keepSeen = typeof SaveM.sanitizeV43 === 'function' ? SaveM.sanitizeV43 : keepV43;
  const seenIn = {};
  for (const k of [S.letter, S.tour, S.s4offer].concat(gids.slice(0, 8), [S.g43open, S.g43all, S.g43ready, S.taste, 'eupTaste'])) seenIn[k] = 1;
  const kept = keepSeen({ lay: 2, seen: seenIn });
  const keptKeys = Object.keys((kept && kept.seen) || {});
  ok(keptKeys.length === 15 && !('eupTaste' in kept.seen) && kept.seen.eup_taste === 1 && keptKeys.length <= 32, 'the save keeps all 15 chain + B0 seen keys (≤ 32) and drops eupTaste (BP-46)', keptKeys);
  // the x key: passes the drawer's key rule; G's value fits its named cap (BP-47: X_CAPS.g43 = 48, S6 added it)
  const XK = ids.X43KEY && ids.X43KEY.goals;
  ok(XK === 'g43' && /^[a-z][a-z0-9_]{0,15}$/.test(XK) && !(XK in Object.prototype), 'X43KEY.goals = g43 passes the x key rule', ids.X43KEY);
  const big = { d: 10, t: 10, k: 9999, u: 5 };
  ok(JSON.stringify(big).length <= 48, 'x.g43 at its largest (' + JSON.stringify(big) + ', ' + JSON.stringify(big).length + ' B) fits 48 B');
  if (typeof SaveM.keepX === 'function') {
    const x = SaveM.keepX({ [XK]: { d: 2, t: 1, k: 3, u: 0 } });
    ok(!!x && same(x[XK], { d: 2, t: 1, k: 3, u: 0 }), 'keepX keeps x.g43 byte for byte (under its named cap)', x);
  }
  // ((S6) the named cap is in Save.js: a hard row from here on (it was skipped while S had not added it)
  ok(!!SaveM.X_CAPS && SaveM.X_CAPS[XK] === 48 && Object.isFrozen(SaveM.X_CAPS), 'X_CAPS.g43 = 48 (S, BP-47)', SaveM.X_CAPS && SaveM.X_CAPS[XK]);
}
{
  // ---- balance: goals43 keys (inert until G / T) and their repairs
  const G = BALANCE.goals43 || {};
  const N = G.need || {}, R = G.reward || {}, T = G.taste || {};
  const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
  ok(isInt(N.staff, 1, 3) && isInt(N.st2, 1, 5) && isInt(N.deco, 1, 6) && isInt(N.dlv, 1, 10) && isInt(N.train, 1, 10), 'goals43.need in range (staff 1..3, st2 1..5, deco 1..6, dlv / train 1..10)', N);
  const rk = ['staff', 'fork', 'st2', 'deco', 'house', 'dlv', 'train', 'shop'];
  const sum = rk.reduce((a, k) => a + R[k], 0);
  ok(rk.every((k) => isInt(R[k], 0, 500)) && sum <= 2000, 'goals43.reward: 8 rows, each 0..500, ' + sum + ' in all (≤ 2,000)', R);
  ok(G.s4Early === false, 'goals43.s4Early false (stage 4 comes in its turn)');
  ok(T.standS > 0 && T.len >= 8 && T.len <= 30 && T.skipAfter >= 1 && T.skipAfter <= 5 && T.skipAfter < T.len && T.cardAuto <= T.len, 'goals43.taste { standS, len 8..30, skipAfter 1..5 < len, cardAuto ≤ len }', T);
  const { GOALS43 } = v43;
  ok(Array.isArray(GOALS43) && same(GOALS43.map((r) => r.id), [G43V.staff, G43V.fork, G43V.st2, G43V.deco, G43V.house, G43V.dlv, G43V.train, G43V.shop, G43V.s4, G43V.taste]), 'GOALS43 lists the 10 rows in the designer\'s order', GOALS43 && GOALS43.map((r) => r.id));
  ok(rk.every((k) => GOALS43.some((r) => r.k === k)) && Object.keys(N).every((k) => GOALS43.some((r) => r.k === k)), 'every goals43.need / reward key names a GOALS43 row');
  const keep = clone(G);
  const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  BALANCE.goals43 = { need: { staff: 0, st2: 'x', deco: 99, dlv: -1, train: 2.6 }, reward: { staff: 900, fork: 500, st2: 500, deco: 500, house: 500, dlv: 500, train: 500, shop: -3 }, s4Early: 'yes', taste: { standS: 0, len: 99, skipAfter: 9, cardAuto: 50 } };
  checkBalance();
  const fixed = clone(BALANCE.goals43), w1 = warned;
  delete BALANCE.goals43;
  checkBalance();
  const filled = clone(BALANCE.goals43), w2 = warned - w1;
  console.warn = warn;
  BALANCE.goals43 = keep;
  const fsum = rk.reduce((a, k) => a + fixed.reward[k], 0);
  ok(same(fixed.need, { staff: 1, st2: 1, deco: 6, dlv: 1, train: 3 }) && rk.every((k) => fixed.reward[k] >= 0 && fixed.reward[k] <= 500) && fsum <= 2000 && fixed.reward.shop === 0
    && fixed.s4Early === false && fixed.taste.len === 30 && fixed.taste.skipAfter === 5 && fixed.taste.cardAuto === 30 && fixed.taste.standS === 0.1 && w1 >= 10, 'balanceCheck repairs a broken goals43 (ranges, rewards scaled to ≤ 2,000, s4Early, taste) and says so', { fixed, fsum, w1 });
  ok(same(filled, { need: { staff: 2, st2: 1, deco: 2, dlv: 3, train: 3 }, reward: { staff: 300, fork: 300, st2: 150, deco: 100, house: 100, dlv: 200, train: 200, shop: 150 }, s4Early: false, taste: { standS: 0.6, len: 21, skipAfter: 3, cardAuto: 20 } }) && w2 === 0, 'a balance.js without goals43 gets the defaults, silently', { filled, w2 });
  // (verify) the upper ends: a staff target above the depot's 3 hires would leave row 1 (not soft) undoable
  console.warn = () => {};
  BALANCE.goals43 = { need: { staff: 9, st2: 9, dlv: 99, train: 99 }, reward: {}, taste: { len: 8, skipAfter: 9, cardAuto: 0 } };
  checkBalance();
  const hi = clone(BALANCE.goals43);
  console.warn = warn;
  BALANCE.goals43 = keep;
  ok(hi.need.staff === 3 && hi.need.st2 === 5 && hi.need.dlv === 10 && hi.need.train === 10 && hi.taste.skipAfter === 5 && hi.taste.skipAfter < hi.taste.len && hi.taste.cardAuto === 1, 'balanceCheck caps need at the depot\'s 3 hires / 5 lines / 10, and skipAfter stays below len', hi);
  ok(same(BALANCE.goals43, keep), '(the test puts BALANCE back)');
}
{
  // ---- the after-load order (N's letter, then G, then T, then P1) and the stubs
  const src = fs.readFileSync(path.join(ROOT, 'src/systems/v43/index.js'), 'utf8');
  const at = (re) => { const m = src.match(re); return m ? m.index : -1; };
  const iN = at(/onAfterLoad\(\(gs, \w+\) => Renewal43\.afterLoad/), iG = at(/onAfterLoad\(\(gs, \w+\) => Goals43\.attach/), iT = at(/onAfterLoad\(\(gs, \w+\) => EupTaste\.attach/), iP = at(/onAfterLoad\(\(gs, \w+\) => PlayLog\.afterLoad/);
  ok(iN >= 0 && iG > iN && iT > iG && iP > iT, 'v43/index.js registers Goals43.attach then EupTaste.attach, after N\'s letter and before P1', { iN, iG, iT, iP });
  ok(typeof v43.Goals43 === 'function' && typeof v43.Goals43.attach === 'function' && typeof v43.EupTaste.attach === 'function' && typeof v43.EupTaste.enabled === 'boolean', 'the entries exist (Goals43.attach, EupTaste.attach, EupTaste.enabled)');
  const { EupTasteCard } = await imp('src/scenes/EupTasteCard.js');
  ok(typeof EupTasteCard === 'function', 'src/scenes/EupTasteCard.js exports the card class (T fills it)');
  const st = [];
  if (v43.Goals43.stub === true) {
    const gs = {};
    v43.Goals43.attach(gs, { fresh: true });
    const g = new v43.Goals43(gs);
    const rf = g.refs();
    ok(!('goals43' in gs) && same(g.rows(true, null), []) && same(g.sideRows(null, 0), []) && rf instanceof Set && rf.size === 0 && g.sub({ kind: 'g43' }) === null && g.objective({}, 'place') === null && g.objective({}, 'text') === null && g.current() === null,
      'the Goals43 stub: attach leaves no gs.goals43; rows / sideRows [], refs an empty Set, sub / objective / current null');
  } else {
    st.push('the Goals43 stub (G is in)');
    // (G is in) the real class keeps B0b's contract: attach on a scene makes gs.goals43 with every seam; with nothing of
    //  a village (no progress, no v4.2) it is closed and answers nothing; the scene's shutdown takes its listeners
    const L = new Map();
    const events = { on(n, f) { L.set(n, (L.get(n) || []).concat([f])); }, off(n, f) { L.set(n, (L.get(n) || []).filter((q) => q !== f)); }, once(n, f) { this.on(n, f); }, emit(n, ...a) { for (const f of (L.get(n) || []).slice()) f(...a); } };
    const gs = { events };
    const g = v43.Goals43.attach(gs, { fresh: true });
    const n = () => [...L.values()].reduce((s, a) => s + a.length, 0);
    ok(gs.goals43 === g && g instanceof v43.Goals43 && ['rows', 'sideRows', 'refs', 'sub', 'objective', 'current', 'tasteReady'].every((k) => typeof g[k] === 'function') && n() >= 3, 'the real Goals43: attach makes gs.goals43 with every seam (rows, sideRows, refs, sub, objective, current, tasteReady) and its listeners', n());
    const rs = g.rows(true, null), rf = g.refs();
    // (rows by data, BP-53: row 9 while STEPS has the mkt_s4 step (P), row 10 while EupTaste.enabled (T))
    const { STEPS: ST } = await imp('src/systems/Progression.js');
    const hasS4 = ST.some((s) => s.id === ids.STEP43.shop4);
    ok(rs.length === v43.GOALS43.filter((d) => (d.step ? hasS4 : d.taste ? v43.EupTaste.enabled : true)).length && rs.every((r) => r.kind === 'g43' && (r.state === 'next' || r.state === 'done')) && rf instanceof Set && rf.size === 0 && same(g.sideRows(null, 0), []) && g.sub({ kind: 'pad' }) === null && g.objective({}, 'place') === null && g.objective({}, 'text') === null && g.current() === null && g.tasteReady() === false,
      'with no village it is closed: its rows locked, refs an empty Set, no side rows / objective / current row / taste gate');
    events.emit('shutdown');
    ok(gs.goals43 === null && n() === 0, 'the scene\'s shutdown removes every listener and gs.goals43 (BP-56)', n());
  }
  if (v43.EupTaste.stub === true) {
    const gs = {};
    v43.EupTaste.attach(gs, { fresh: true });
    ok(v43.EupTaste.enabled === false && Object.keys(gs).length === 0, 'the EupTaste stub: enabled false (row 10 absent), attach does nothing');
  } else {
    st.push('the EupTaste stub (T is in)');
    // (T is in, a3.3) G and T attached in the hook order on one bare scene: row 10 is in G's rows, T's gate asks G and
    //  stays shut (no 읍, chain closed), no pad / place; the scene's shutdown takes both and every listener
    const L = new Map();
    const events = { on(n, f) { L.set(n, (L.get(n) || []).concat([f])); }, off(n, f) { L.set(n, (L.get(n) || []).filter((q) => q !== f)); }, once(n, f) { this.on(n, f); }, emit(n, ...a) { for (const f of (L.get(n) || []).slice()) f(...a); } };
    const gs = { events };
    const n = () => [...L.values()].reduce((s, a) => s + a.length, 0);
    const g = v43.Goals43.attach(gs, { fresh: true });
    v43.EupTaste.attach(gs, { fresh: true });
    const E = gs.eupTaste;
    ok(v43.EupTaste.enabled === true && E && typeof E.destroy === 'function' && g && g.defs().some((d) => d.id === 'g43_taste') && g.rows(true, null).some((r) => r.id === 'g43_taste'), 'the real EupTaste: enabled, attach makes gs.eupTaste; G lists row 10 (g43_taste) because of it (BP-53)');
    ok(v43.EupTaste.gate(gs) === false && g.tasteReady() === false && !E.pad && v43.EupTaste.place(gs) === null, 'on a bare scene T\'s gate (G\'s tasteReady) is shut: no pad, no place');
    events.emit('shutdown');
    ok(gs.goals43 === null && gs.eupTaste === null && n() === 0, 'the scene\'s shutdown takes G and T and every listener', n());
  }
  if (EupTasteCard.stub === true) { const c = new EupTasteCard({}); ok(c.isOpen === false, 'the EupTasteCard stub never opens'); } else st.push('the EupTasteCard stub (T is in)');
  skipped.push(...st);
}
{
  // ---- the GoalBook seams (BP-49, BP-52), driven by a stand-in gs.goals43 on a mock village where every v4 goal is done
  const { GoalBook } = await imp('src/systems/goals/GoalBook.js');
  const mkPad = (id, x, y, remaining) => ({ id, x, y, remaining, active: true, done: false, maxed: false, items: null, got: {}, pad: { id }, opts: { icon: 'ui_icon_goal' }, labelText: { text: id } });
  const village = (builtFn) => {
    const fork = mkPad('t_fork', 300, 400, 3500), extra = mkPad('t_extra', 320, 420, 150), st2 = mkPad('t_st2', 340, 440, 900);
    const house = { id: 'h43_1', cfg: { side43: true }, state: 'plot', shown: true, only: WORLD.plots.h43_1 ? WORLD.plots.h43_1.only : 'house_c', dropX: 600, dropY: 1040, pad: { id: 'h43_1' } };
    const pr = { complete: true, pads: {}, flags: {}, done: {}, isDone: () => true, goalDone: () => true, nextGoal: () => null, met: () => true, goalNeed: () => 1, goalValue: () => 1, freePlotFor: () => null };
    const gs = { progress: pr, economy: { coins: 5000 }, isBuilt: builtFn || (() => true), isBuilding: () => false, v42: {}, sites: { h43_1: house }, paidPads: () => [fork, extra, st2], tutorial: null };
    return { gs, fork, extra, st2, house };
  };
  class Stand {
    constructor(v) { this.v = v; this.calls = { rows: [], sub: [], side: 0 }; }
    rows(active, book) {
      this.calls.rows.push([active, book instanceof GoalBook]);
      const v = this.v, base = { kind: 'g43', icon: 'ui_icon_goal', coins: 0, items: null, place: null, why: null };
      return [
        Object.assign({}, base, { id: G43V.staff, name: 'A', state: 'done' }),
        Object.assign({}, base, { id: G43V.fork, name: 'B', coins: 3500, state: active ? 'now' : 'next', place: { x: v.fork.x, y: v.fork.y, pad: v.fork.pad, ref: v.fork } }),
        Object.assign({}, base, { id: G43V.st2, name: 'C', coins: 900, state: 'next', place: { x: v.st2.x, y: v.st2.y, pad: v.st2.pad, ref: v.st2 } }),
        Object.assign({}, base, { id: G43V.house, name: 'D', coins: 80, state: 'next', place: { x: 600, y: 1040, pad: v.house.pad, ref: v.house } }),
        Object.assign({}, base, { id: G43V.train, name: 'E', state: 'wait', why: 'passive', have: 1, need: 3 }),
      ];
    }
    refs() { return new Set([this.v.fork, this.v.st2, this.v.house]); }
    sideRows(cur, coins) { this.calls.side++; return [{ id: 't_staff3', kind: 'pad', name: 'F', icon: 'ui_icon_goal', coins: 3000, items: null, state: 'side', place: { x: 1, y: 2 }, why: null, afford: coins >= 3000 }]; }
    sub(r) { this.calls.sub.push(r.id); return r.id === G43V.fork ? 'G43 LINE' : null; }
    objective() { return null; }
  }
  const v0 = village(), b0k = new GoalBook(v0.gs), base = b0k.read(3, 9);
  const sideIds0 = base.side.map((r) => r.id);
  ok(base.cur === null && ['t_fork', 't_extra', 't_st2', 'plot:h43_1'].every((id) => sideIds0.indexOf(id) >= 0), 'the mock village: every goal done, the three pads and the first-house plot are side rows', sideIds0);
  // the B0b class (G's stub) changes nothing
  if (v43.Goals43.stub === true) {
    v0.gs.goals43 = new v43.Goals43(v0.gs);
    const withStub = b0k.read(3, 9);
    ok(same(strip2(withStub), strip2(base)), 'gs.goals43 = the B0b class: the window reads exactly as without it');
    delete v0.gs.goals43;
  }
  // the stand-in: section 4 rows, the current row, side de-duplication, G's side rows, the sub line
  const v1 = village(), sd = new Stand(v1), bk = new GoalBook(v1.gs);
  v1.gs.goals43 = sd;
  const r1 = bk.read(3, 9), m1 = bk.mainRows();
  const sideIds = r1.side.map((r) => r.id);
  ok(sd.calls.rows[0] && sd.calls.rows[0][0] === true && sd.calls.rows[0][1] === true, 'mainRows asks gs.goals43.rows(active = true, the GoalBook) once every v4.2 building stands', sd.calls.rows[0]);
  ok(r1.cur && r1.cur.id === G43V.fork && r1.cur.kind === 'g43' && m1.rows.slice(-5).map((r) => r.id).join() === [G43V.staff, G43V.fork, G43V.st2, G43V.house, G43V.train].join(), 'G\'s rows come last on the main road; its "now" row is the window\'s 지금 할 일', r1.cur && r1.cur.id);
  ok(r1.all === base.all + 5 && r1.done === base.done + 1, 'the progress line counts G\'s rows (' + r1.done + ' / ' + r1.all + ')');
  ok(r1.next.map((r) => r.id).join() === [G43V.st2, G43V.house, G43V.train].join(), 'G\'s later rows are in 「다음」', r1.next.map((r) => r.id));
  ok(sideIds.indexOf('t_fork') < 0 && sideIds.indexOf('t_st2') < 0 && sideIds.indexOf('plot:h43_1') < 0, 'a pad or plot that a not-done G row uses as its place is never a side row too (refs(), not only the current one)', sideIds);
  ok(sideIds.indexOf('t_extra') >= 0 && sideIds.indexOf('t_staff3') >= 0 && sd.calls.side >= 1, 'other pads stay; G\'s own side rows (the depot pads) are added', sideIds);
  ok(bk.sub(r1.cur) === 'G43 LINE', 'sub(a g43 row) is G\'s own line first');
  const hr = r1.next.find((r) => r.id === G43V.house);
  const generic = bk.sub(Object.assign({}, hr, { kind: 'pad' }));
  ok(bk.sub(hr) === generic && generic !== '' && generic !== null, 'G answers null: the generic line (' + generic + ')');
  const nCalls = sd.calls.sub.length;
  bk.sub({ id: 'x', kind: 'step', state: 'next', coins: 10, items: null });
  ok(sd.calls.sub.length === nCalls, 'a row that is not g43 never asks G');
  // (verify) the seam is sub's FIRST line (§3.5): G is asked before the generic done line too
  ok(bk.sub(Object.assign({}, r1.cur, { state: 'done' })) === 'G43 LINE', 'sub asks G before the generic lines, a done g43 row too (the seam is the first line)');
  // before the depot: rows(active = false); the depot row is 지금 할 일 and G's row waits in 「다음」
  const v2 = village((b) => b !== 'depot42'), sd2 = new Stand(v2), bk2 = new GoalBook(v2.gs);
  v2.gs.goals43 = sd2;
  const r2 = bk2.read(3, 9);
  ok(sd2.calls.rows[0] && sd2.calls.rows[0][0] === false && r2.cur && r2.cur.id === 'v42:depot42' && r2.next.some((r) => r.id === G43V.fork && r.state === 'next'), 'before every v4.2 building stands: rows(active = false), the depot stays 지금 할 일', { calls: sd2.calls.rows, cur: r2.cur && r2.cur.id });
  // (verify) section 4 never takes 지금 할 일 from an earlier row: a G row that says 'now' while one is current stays behind it
  const v3 = village((b) => b !== 'depot42'), sd3 = new Stand(v3), bk3 = new GoalBook(v3.gs);
  sd3.rows = function (active, book) { return Stand.prototype.rows.call(this, true, book); };
  v3.gs.goals43 = sd3;
  const m3 = bk3.mainRows();
  ok(m3.cur && m3.cur.id === 'v42:depot42', 'a G row in state now never replaces an earlier current row (the !cur guard)', m3.cur && m3.cur.id);
}
{
  // ---- Tutorial.v42Goal: a G row with a place → the line offers (as before) → a G row's text only (BP-55)
  const { Tutorial } = await imp('src/systems/Tutorial.js');
  const line = { id: 'st2_grill', x: 50, y: 60, remaining: 900, active: true, done: false, maxed: false, pad: { id: 'st2_grill' }, needsLeave: false, opts: { labelFn: () => '가공소 2단' } };
  const goal = (lines, G) => {
    const gs = { v42: { lines: lines ? { pads: { st2_grill: line } } : null }, sites: {}, isBuilt: () => true, isBuilding: () => false };
    if (G) gs.goals43 = G;
    const T = { gs };
    return { c: Tutorial.prototype.v42Goal.call(T), T };
  };
  const asked = [];
  const G = (place, text) => ({ objective(T, mode) { asked.push([mode, T]); return mode === 'place' ? place : text; } });
  const P = { x: 300, y: 400, h: 112, key: 'obj_g43:g43_fork:0:3500', text: 'fork', cost: 3500, pay: true, pad: null, hold: true }, X = { key: 'obj_g43:g43_train:1:3', text: 'trains' };
  const plain = goal(true, null).c;
  ok(plain && plain.key === 'obj_next:st2_grill:900', 'no gs.goals43: the line offer, as before', plain && plain.key);
  if (v43.Goals43.stub === true) ok(same(strip2(goal(true, new v43.Goals43({})).c), strip2(plain)) && goal(false, new v43.Goals43({})).c === null, 'the B0b class changes nothing (line offer; nothing without one)');
  asked.length = 0;
  const a = goal(true, G(P, X));
  ok(a.c === P && asked.length === 1 && asked[0][0] === 'place' && asked[0][1] === a.T, 'a G row with a place comes before the line offers (objective(T, \'place\'))');
  asked.length = 0;
  const b = goal(true, G(null, X)).c;
  ok(b && b.key === plain.key && asked.length === 1, 'a G row without a place: the line offer leads (G\'s text is not asked)', asked.map((q) => q[0]));
  asked.length = 0;
  const c = goal(false, G(null, X)).c;
  ok(c === X && asked.map((q) => q[0]).join() === 'place,text', 'no line offer: G\'s text row (objective(T, \'text\'))', asked.map((q) => q[0]));
}
{
  // ---- Rank.hold (BP-51): ceremonyOn = cerOn || hold; Rank's own clock and end run on cerOn only
  const { Rank } = await imp('src/systems/Rank.js');
  const nbOf = (gs) => ({ gs, ready: false });
  const bare = () => new Rank(nbOf({ progress: { flags: {}, setFlag(k) { this.flags[k] = true; } } }), null);
  const r = bare();
  let ticks = 0, applied = 0;
  r.tickCeremony = () => { ticks++; };
  r.applyRewards = () => { applied++; };
  ok(r.ceremonyOn === false && r.hold === null && r.state().ceremony === false && r.state().hold === null, 'a new Rank: no ceremony, no hold');
  r.hold = 'taste';
  const s1 = r.state();
  ok(r.ceremonyOn === true && s1.ceremony === false && s1.hold === 'taste', 'hold = taste: ceremonyOn reads true (every reader pauses); state().ceremony stays false', s1);
  r.update(0.5);
  let threw = false;
  try { r.endCeremony(true); } catch (e) { threw = true; }
  ok(ticks === 0 && applied === 0 && !threw && r.ceremonyOn === true && r.hold === 'taste', 'a hold never ticks Rank\'s clock and endCeremony ignores it', { ticks, applied, threw });
  r.hold = null;
  ok(r.ceremonyOn === false, 'hold cleared: ceremonyOn false');
  r.ceremonyOn = true;
  ok(r.cerOn === true && r.state().ceremony === true && r.state().hold === null, 'a write ceremonyOn = true (as residents.mjs does) sets the ceremony itself');
  r.update(0.5);
  ok(ticks === 1, 'and the ceremony ticks as before');
  r.ceremonyOn = false;
  ok(r.ceremonyOn === false && r.cerOn === false, 'ceremonyOn = false ends it');
  const hf = Rank.hallFrame({ x: 1000, y: 800 });
  ok(same(hf, { x: 1060, y: 600 }), 'Rank.hallFrame(venue) = { x: venue.x + 60, y: venue.y − 200 }', hf);
  // the 승격식 itself at the hall, hold unset: framed by hallFrame, ticks on its clock, a skip after skipAfter ends it once
  const cam = [], emits = [], venue = { x: 1000, y: 800 };
  const noop = () => {};
  const gs = {
    progress: { flags: {}, setFlag(k) { this.flags[k] = true; } },
    civic: { hall: { venue: (k) => (k === 'rank' ? venue : null) } },
    focusCamera: (x, y, ms) => cam.push([x, y, ms]),
    life: { party: noop, people: () => 0 }, ui: { banner: noop, toast: noop, rankBadgeFly: noop }, effects: { burst: noop, shake: noop, sheet: noop },
    events: { emit: (n, v) => emits.push(n) }, save: noop, time: { delayedCall: noop },
    cameras: { main: { fadeOut: noop, fadeIn: noop, centerOn: noop, resetFX: noop, width: 800, height: 600, zoom: 1 } },
    camTarget: { x: 0, y: 0 }, player: { x: 0, y: 0 }, ground: { ensure: noop, invalidate: noop }, isOnScreen: () => false,
  };
  const nb = { gs, ready: false, gatherVisitors: noop, town: { gather: noop }, paint: null };
  const rk = new Rank(nb, null);
  let ap = 0;
  rk.applyRewards = () => { ap++; };
  rk.addLights = noop;
  const { Input } = await imp('src/core/Input.js');
  const ov0 = Input.override;
  const err = console.error; let errs = 0; console.error = () => { errs++; };
  rk.ceremony(false);
  const on0 = [rk.ceremonyOn, rk.state().ceremony, rk.state().hold];
  while (rk.cT < rk.cSkip - 0.75) rk.update(0.25);                     // ticks on its own clock up to just before skipAfter
  Input.override = { x: 1, y: 0 };
  rk.update(0.25);
  const stillOn = rk.ceremonyOn;                                        // a stick before skipAfter does not skip
  for (let i = 0; i < 40 && rk.cerOn; i++) rk.update(0.25);           // held past skipAfter: skip
  Input.override = ov0;
  console.error = err;
  ok(on0[0] === true && on0[1] === true && on0[2] === null, 'ceremony(): ceremonyOn and state().ceremony true, no hold', on0);
  ok(cam.length >= 1 && same(cam[0].slice(0, 2), [hf.x, hf.y]) && cam[0][2] === rk.cLen * 1000, 'the 승격식 at the hall is framed by Rank.hallFrame(venue) (' + cam[0] + ')', cam[0]);
  ok(emits.indexOf('v4:rankUp') >= 0 && rk.level === 2 && gs.progress.flags.rankEup === true, 'it still says v4:rankUp and makes the village 읍');
  ok(stillOn === true && rk.ceremonyOn === false && rk.state().ceremony === false && ap === 1 && rk.cT > rk.cSkip && rk.cT <= rk.cSkip + 0.5, 'a joystick after skipAfter (' + rk.cSkip + ' s) ends it once (rewards once), as before', { stillOn, on: rk.ceremonyOn, ap, cT: rk.cT });
  ok(errs === 0, 'no step threw on the mock village', errs);
}

if (skipped.length) console.log('  skipped (not this tree\'s rows: B0-only rows once S is in, B0b stub rows once G / T are in): ' + skipped.join(' · '));
console.log(fail === 0 ? 'v43_contracts.test: ' + pass + ' passed, 0 failed' : 'v43_contracts.test: ' + pass + ' passed, ' + fail + ' FAILED');
process.exit(fail ? 1 : 0);
