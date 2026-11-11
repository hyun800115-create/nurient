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
// 6 world: pads.mkt_s4 (B0: on the mkt_s3 spot); the mkt_s4 step, once P adds it, is the §2 row; WORLD.v43
//   { oldStart = the hut door, shopFront }; the ids43 plot ids that exist today are WORLD.plots rows
// 7 strings: every package's start / end anchor pair once, in order, in ko and in en
// 8 the seams in Game.js / UI.js are where the plan says (runAfterLoad after unstickChief and before the bakery banner;
//   gs.v43 held and serialized; buildV3 skips hidden plots; both cards mounted)
// 9 tools/test/v43_helpers.mjs asStepB / isStepB on a save object, its text and a keys fixture
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
  ok(names.length === 8 && new Set(names).size === names.length && names.every((n) => /^[a-z0-9]+$/.test(n)), 'EV43: 8 distinct event names', names);
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
  ok(!s4 || (s4.type === 'shop' && s4.level === 4 && s4.after === 'f:rankEup' && s4.side === true), s4 ? 'the mkt_s4 step is { type: shop, level: 4, after: f:rankEup, side }' : 'no mkt_s4 step yet (P adds it), so the pad is never shown', s4);
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
  const PK = ['L', 'S', 'P', 'H', 'M', 'N', 'P1'];
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
  ok(!bad.length, 'ko and en each carry the 7 start / end pairs (L, S, P, H, M, N, P1) once, in order', bad);
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

if (skipped.length) console.log('  skipped (B0-only, S\'s rules are in): ' + skipped.join(' · '));
console.log(fail === 0 ? 'v43_contracts.test: ' + pass + ' passed, 0 failed' : 'v43_contracts.test: ' + pass + ' passed, ' + fail + ' FAILED');
process.exit(fail ? 1 : 0);
