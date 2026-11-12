// (v4.3 step B 「마을 새 단장 둘째 걸음」, WP-S) the step-B save: docs/redesign_v43/stepB/map_save.md §6.1
//   node tools/test/save_v43.mjs [--node] [--out <dir>]        (--node: the Node checks only; the browser part needs the
//                                                               shared lock: scratchpad/v43/stepB/lane_b.sh)
// Built with S1–S3 (lv, the newer-save hold, the write guard, x and the slices, the hold cards). S4 (remap43, check43,
// keepPre43, the failure card's trigger) adds map_save §6.1 rows 2–4 and 11 and browser B1–B3 / B5 here.
//
// Node:
//   1  SAVE_VERSION 8, LV 43, MIGRATE[7] only changes the number, stamp() = { v, lv, t } first, PRE43_KEY / CODE_FMT
//   5  F0s: the isNewerSave matrix, storedIsNewer (head and fallback), dryRun newerSave; S1 with a Map-backed
//      localStorage: a stored lv 46 / v 9 save is never written over (byte-identical) and the stale hold fires once;
//      a stored v7 / v8 / lv 43 save is written normally; Save.load holds a newer save (nothing written, nothing copied,
//      every writer refused, quarantine moves nothing), Save.clear copies first, a stale hold's save is left alone
//   6  x: 300 random drawers within caps are byte-identical; over-cap keys are trimmed oldest first (warned); the total
//      holds; hostile input never throws; the X43 holder
//   7  slices: at cap verbatim, cap + 1 dropped (warned); the real module sanitizers' outputs pass byte-identically;
//      same-level pass-through: a step-B village with x + every slice survives load -> serialize -> save byte for byte
//   8  the v43 block: fuzz (never throws, passes itself), toggles, refunds43, src
//   9  G-4 (progress.got keeps every ITEMS kind) and G-5 (v42.seen.boost)
//  10  size: the save at caps < 24,576 (warns > 16,384)
//  11  (part) PRE43_KEY never travels in a code
// Browser (one Chromium, the real game; shots to --out, default scratchpad/v43/stepB/s/shots):
//   B4a a stored lv 46 village: the newer card; SAVE_KEY / .chat / settings byte-identical after 60 s of game time plus
//       visibilitychange / pagehide; nothing copied aside; 「마을 코드 만들기」 exports the STORED village; the input stays
//       off; 「새 마을로 시작」 asks, keeps the village (the 불러오기 spare + the backup slot) and starts a village that saves
//   B4b a stored v 9 village: the same card; 「새로 고침」 reloads into it again, the save untouched
//   B4c a second, newer tab: during play a newer save lands in storage; every later autosave is refused (the stored text
//       stays byte-identical), the banner shows once
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const FIX = path.join(HERE, 'fixtures');
const argv = process.argv.slice(2);
const NODE_ONLY = argv.includes('--node');
const OUTDIR = argv.includes('--out') ? path.resolve(argv[argv.indexOf('--out') + 1]) : '/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v43/stepB/s/shots';
const fails = [];
let passed = 0;
const check = (name, ok, info = '') => {
  console.log((ok ? '  ok  ' : ' FAIL ') + name + (info !== '' && info != null ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 400) : ''));
  if (ok) passed++; else fails.push(name);
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
let seed = 4343;
const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

/** a Map-backed localStorage (opts.quota: the most characters it holds) */
function memStorage(init, opts = {}) {
  const m = new Map(Object.entries(init || {}));
  const used = () => { let n = 0; for (const [k, v] of m) n += k.length + v.length; return n; };
  return {
    get length() { return m.size; },
    key(i) { return Array.from(m.keys())[i] ?? null; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) {
      v = String(v);
      if (opts.quota != null && used() - (m.has(k) ? k.length + m.get(k).length : 0) + k.length + v.length > opts.quota) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, v);
    },
    removeItem(k) { m.delete(k); },
    clear() { m.clear(); },
    dump() { return Object.fromEntries(Array.from(m.entries()).sort()); },
  };
}

globalThis.window = globalThis.window || {};
const SV = await import('../../src/core/Save.js');
const T = await import('../../src/core/Transfer.js');
const ids = await import('../../src/data/ids43.js');
const { SAVE_KEY, CHAT_KEY, SETTINGS_KEY, BACKUP_KEY, BAD_KEY, SAVE_VERSION, LV, MIGRATE, Save, ChatSave, Settings, sanitizeSave, migrateSave } = SV;
const LATE = JSON.parse(fs.readFileSync(path.join(FIX, 'v42_village_late.json'), 'utf8')).keys;
const S46 = JSON.parse(fs.readFileSync(path.join(FIX, 'v41_save_smart_46min.json'), 'utf8'));

// ================================================================== 1. constants
console.log('— 1 constants and the stamp');
{
  check('SAVE_VERSION 8, LV 43 (= ids43.LV)', SAVE_VERSION === 8 && LV === 43 && ids.LV === LV, [SAVE_VERSION, LV]);
  const a = { v: 7, coins: 5, onb: 14, progress: { flags: { meatCan: true } } }, b = MIGRATE[7](clone(a));
  check('MIGRATE[7] only changes the number (no MIGRATE[8])', b.v === 8 && same(Object.assign({}, b, { v: 7 }), a) && !MIGRATE[8], b);
  const s = SV.stamp({ coins: 3, v43: { lay: 2 } });
  check('stamp(): { v, lv, t } first, in that order, then the state', same(Object.keys(s), ['v', 'lv', 't', 'coins', 'v43']) && s.v === 8 && s.lv === 43 && Number.isFinite(s.t), Object.keys(s));
  check('JSON of a stamped save starts {"v":8,"lv":43,"t":', JSON.stringify(s).startsWith('{"v":8,"lv":43,"t":'), JSON.stringify(s).slice(0, 30));
  check('PRE43_KEY = BACKUP_KEY + ".pre43" (= ids43); CODE_FMT 2 (= ids43)', SV.PRE43_KEY === BACKUP_KEY + '.pre43' && SV.PRE43_KEY === ids.PRE43_KEY && T.CODE_FMT === 2 && ids.CODE_FMT === 2, [SV.PRE43_KEY, T.CODE_FMT]);
  check('sanitizeSave never writes lv or t (stamp fields, like t: Save.write adds them)', (() => { const o = sanitizeSave({ v: 8, lv: 43, t: 5, coins: 1 }); return !('lv' in o) && !('t' in o) && o.v === 8; })());
}

// ================================================================== 5. F0s
console.log('— 5 F0s: newer saves');
{
  const M = [
    [{ v: 9 }, true], [{ v: 8, lv: 44 }, true], [{ v: 8, lv: 46 }, true], [{ v: 8, lv: 50 }, true], [{ v: 9, lv: 50 }, true],
    [{ v: 8, lv: 43 }, false], [{ v: 8 }, false], [{ v: 7 }, false], [{ v: 1 }, false], [{ v: 8, lv: 'abc' }, false], [{ v: 8, lv: null }, false],
    [{ v: 8, lv: -5 }, false], [{ v: 8, lv: '46' }, true], [{ v: '9' }, true], [{ lv: 1e9 }, true], [{ v: 8, lv: 43.5 }, true], [{}, false],
  ];
  const bad = M.filter(([o, want]) => SV.isNewerSave(o) !== want).map(([o]) => o);
  const notObj = [null, undefined, 5, 'x', [], [9], true].filter((o) => SV.isNewerSave(o));
  check('isNewerSave: v > 8 or lv > 43 (numeric strings count; garbage / missing lv = not newer) — ' + M.length + ' cases', !bad.length && !notObj.length, { bad, notObj });
  const H = [
    ['{"v":8,"lv":46,"t":1,"coins":5}', true], ['{"v":9,"t":1}', true], ['{"v":8,"lv":43,"t":1}', false], ['{"v":8,"t":1}', false], ['{"v":7,"t":1}', false],
    ['{"v":8,"lv":44}', true], ['{"t":1,"v":8,"lv":46}', true], ['{"coins":5,"v":9}', true], ['{"coins":5,"v":8}', false], ['{"v":12345,"t":1}', true],
    ['not json', false], ['', false], ['[1,2]', false], ['{"v":8,"lvx":99,"t":1}', false], ['{"v":8,"t":1,"geumbang":{"lv":{"van":3}}}', false],
    // (review) an lv right after v that is not a plain 1–4 digit number: parsed, so it agrees with isNewerSave
    ['{"v":8,"lv":"46","t":1}', true], ['{"v":8,"lv":12345,"t":1}', true], ['{"v":8,"lv":43.5,"t":1}', true], ['{"v":8,"lv":"43","t":1}', false], ['{"v":8}', false],
  ];
  const badH = H.filter(([r, want]) => SV.storedIsNewer(r) !== want).map(([r]) => r);
  check('storedIsNewer: the head decides ({"v":8,"lv":46,…), else the whole text is parsed — ' + H.length + ' cases', !badH.length, badH);
  const base = JSON.parse(LATE[SAVE_KEY]);
  const dr = (o) => T.dryRun({ [SAVE_KEY]: JSON.stringify(Object.assign({}, base, o)) });
  check('dryRun: lv 46 and v 9 codes -> newerSave; lv 43 loads', dr({ v: 8, lv: 46 }).error === 'newerSave' && dr({ v: 9 }).error === 'newerSave' && dr({ v: 8, lv: 43 }).ok);
}
// S1: the write guard (a second tab / the updated app wrote a newer save)
{
  const state = { coins: 77, progress: {} };
  const heard = [];
  const off = Save.onHold((why) => heard.push(why));
  const cases = [
    ['lv 46 at the head', '{"v":8,"lv":46,"t":1,"coins":999}'],
    ['v 9 at the head', '{"v":9,"t":1,"coins":999}'],
    ['lv 46 not at the head (parsed)', '{"t":1,"lv":46,"v":8,"coins":999}'],
  ];
  for (const [nm, raw] of cases) {
    window.__FV_NO_SAVE = undefined;
    const st = memStorage({ [SAVE_KEY]: raw, [CHAT_KEY]: 'chat-x', [SETTINGS_KEY]: '{"sound":false}' });
    window.localStorage = st;
    heard.length = 0;
    const r = [Save.write(state), Save.write(state), Save.write(state), ChatSave.write('abcd', { a: 1 })];
    Settings.save();
    const d = st.dump();
    check('S1 ' + nm + ': every write refused, the stored save / chat / settings byte-identical, the stale hold heard once',
      r.every((x) => x === false) && d[SAVE_KEY] === raw && d[CHAT_KEY] === 'chat-x' && d[SETTINGS_KEY] === '{"sound":false}' && Save.held === 'stale' && same(heard, ['stale']) && window.__FV_NO_SAVE === true && window.__FV_SAVE_HELD === 'stale' && !d[BACKUP_KEY],
      { r, held: Save.held, heard, keys: Object.keys(d) });
    Save.release();
    check('S1 ' + nm + ': release() lifts it (the guard back as it was)', Save.held === null && window.__FV_NO_SAVE === undefined && !window.__FV_SAVE_HELD && ChatSave.blocked === false);
  }
  const older = [['v7', '{"v":7,"t":1,"coins":5}'], ['v8 without lv', '{"v":8,"t":1,"coins":5}'], ['lv 43', '{"v":8,"lv":43,"t":1,"coins":5}'], ['not JSON', '{"v":8,"coi'], ['none', null]];
  const badW = [];
  for (const [nm, raw] of older) {
    const st = memStorage(raw == null ? {} : { [SAVE_KEY]: raw });
    window.localStorage = st;
    heard.length = 0;
    const ok = Save.write(state);
    const now = st.getItem(SAVE_KEY) || '';
    if (!ok || !now.startsWith('{"v":8,"lv":43,"t":') || JSON.parse(now).coins !== 77 || Save.held || heard.length) badW.push(nm);
  }
  check('S1: a stored v7 / v8 / lv 43 / broken / missing save is written normally ({"v":8,"lv":43,"t":… head)', !badW.length, badW);
  // (review) a chat closed before the next autosave: the newer build's chat record is not written over either
  {
    window.__FV_NO_SAVE = undefined;
    const st = memStorage({ [SAVE_KEY]: '{"v":8,"lv":46,"t":1,"coins":999}', [CHAT_KEY]: 'chat-new' });
    window.localStorage = st;
    heard.length = 0;
    const r = ChatSave.write('abcd', { a: 1 });
    check('S1: ChatSave.write with a newer stored save: refused, the chat record byte-identical, the stale hold starts', r === false && st.getItem(CHAT_KEY) === 'chat-new' && Save.held === 'stale' && same(heard, ['stale']), { r, held: Save.held, heard });
    Save.release();
    const st2 = memStorage({ [SAVE_KEY]: '{"v":8,"lv":43,"t":1,"coins":5}' });
    window.localStorage = st2;
    check('S1: ChatSave.write with a same-level stored save writes as before', ChatSave.write('abcd', { a: 1 }) === true && JSON.parse(st2.getItem(CHAT_KEY)).cid === 'abcd' && !Save.held);
  }
  off();
}
// (review) migrateSave refuses a newer save (its "null: an unknown / future version" contract), so Admin.adminBackup's
//  "the backup slot holds a readable copy it may write over" test never counts a newer village (kept by Save.clear) as one
{
  const base = clone(S46);
  check('migrateSave: an lv 46 / lv "46" / v 9 save -> null; lv 43, no lv and a garbage lv still load',
    migrateSave(Object.assign(clone(base), { v: 8, lv: 46 })) === null && migrateSave(Object.assign(clone(base), { v: 8, lv: '46' })) === null && migrateSave(Object.assign(clone(base), { v: 9 })) === null &&
    !!migrateSave(Object.assign(clone(base), { v: 8, lv: 43 })) && !!migrateSave(clone(base)) && !!migrateSave(Object.assign(clone(base), { lv: 'abc' })));
}
// F0s: Save.load holds a newer save
{
  const raw46 = JSON.stringify(Object.assign({ v: 8, lv: 46, t: 1 }, S46, { v: 8, lv: 46 }));
  const st = memStorage({ [SAVE_KEY]: raw46, [CHAT_KEY]: 'chat-46', [SETTINGS_KEY]: '{"sound":true}' });
  window.localStorage = st;
  window.__FV_NO_SAVE = undefined;
  const heard = [];
  const off = Save.onHold((why, info) => heard.push([why, info]));
  const out = Save.load();
  const d0 = st.dump();
  check('Save.load of an lv 46 village: null, held "newer" (Save.newer { v: 8, lv: 46 }), lastUnreadable, nothing copied aside',
    out === null && Save.held === 'newer' && same(Save.newer, { v: 8, lv: 46 }) && Save.lastUnreadable === true && d0[SAVE_KEY] === raw46 && !d0[BACKUP_KEY] && !d0[BACKUP_KEY + '.2'] && heard.length === 1 && heard[0][0] === 'newer',
    { out: !!out, held: Save.held, newer: Save.newer, keys: Object.keys(d0) });
  const w = [Save.write({ coins: 1 }), ChatSave.write('abcd', { x: 1 })];
  Settings.save();
  Save.quarantine();
  const d1 = st.dump();
  check('held: Save.write / ChatSave.write / Settings.save refused, Save.quarantine moves nothing (every key byte-identical)', w.every((x) => x === false) && same(d1, d0), { w, keys: Object.keys(d1) });
  // a full storage: the copy cannot be made -> clear() removes nothing and the hold stays
  const tight = memStorage(d0, { quota: Object.entries(d0).reduce((n, [k, v]) => n + k.length + v.length, 0) + 10 });
  window.localStorage = tight;
  Save.clear();
  check('Save.clear while held on a full storage: the copy cannot be made, so nothing is removed and the hold stays', Save.held === 'newer' && same(tight.dump(), d0), { held: Save.held, keys: Object.keys(tight.dump()) });
  window.localStorage = st;
  Save.clear();
  const d2 = st.dump();
  check('Save.clear while held (map_save G-11): the village copied to the backup slot first, then removed; the hold lifted',
    d2[BACKUP_KEY] === raw46 && !(SAVE_KEY in d2) && !(CHAT_KEY in d2) && Save.held === null && !window.__FV_NO_SAVE, Object.keys(d2));
  check('after that a new village saves normally', Save.write({ coins: 3 }) === true && st.getItem(SAVE_KEY).startsWith('{"v":8,"lv":43,'));
  // a second backup: an earlier different backup stays, the newer village goes to .2
  const st2 = memStorage({ [SAVE_KEY]: raw46, [BACKUP_KEY]: 'an older backup' });
  window.localStorage = st2;
  Save.load();
  Save.clear();
  check('Save.clear while held with an older backup: that one stays, the village goes to backup.2', st2.getItem(BACKUP_KEY) === 'an older backup' && st2.getItem(BACKUP_KEY + '.2') === raw46 && !st2.getItem(SAVE_KEY) && !Save.held);
  // a stale hold: the stored village belongs to the newer build — clear() leaves it
  const rawS = '{"v":8,"lv":46,"t":1,"coins":5}';
  const st3 = memStorage({ [SAVE_KEY]: rawS, [CHAT_KEY]: 'chat-s' });
  window.localStorage = st3;
  Save.write({ coins: 1 });
  const wasStale = Save.held === 'stale';
  Save.clear();
  check('Save.clear while stale: the newer build\'s save and chat are left alone, the hold lifted (the next write holds again)', wasStale && st3.getItem(SAVE_KEY) === rawS && st3.getItem(CHAT_KEY) === 'chat-s' && Save.held === null && Save.write({ coins: 2 }) === false && Save.held === 'stale');
  Save.release();
  // a load decides again: a hold of an earlier load is lifted when the stored save is fine now
  window.localStorage = memStorage({ [SAVE_KEY]: raw46 });
  Save.load();
  const h1 = Save.held;
  window.localStorage = memStorage({ [SAVE_KEY]: JSON.stringify(S46) });
  const o2 = Save.load();
  check('Save.load decides again: a later load of a good save lifts the earlier hold', h1 === 'newer' && !!o2 && Save.held === null && !window.__FV_NO_SAVE && Save.newer === null);
  // a guard that was on before the hold stays on after it
  window.__FV_NO_SAVE = true;
  window.localStorage = memStorage({ [SAVE_KEY]: raw46 });
  Save.load();
  Save.release();
  check('release() puts window.__FV_NO_SAVE back as it was before the hold (a page that was already reloading)', window.__FV_NO_SAVE === true);
  window.__FV_NO_SAVE = undefined;
  // a newer chat record seen while held stays protected after the hold lifts
  window.localStorage = memStorage({ [SAVE_KEY]: raw46, [CHAT_KEY]: '{"v":9,"cid":"abcd","chat":{}}' });
  Save.load();
  ChatSave.load('abcd');
  Save.release();
  check('a newer chat record found while held stays blocked after the hold is lifted', ChatSave.blocked === true && ChatSave.write('abcd', { a: 1 }) === false);
  ChatSave.clear();
  // v 9 too
  window.localStorage = memStorage({ [SAVE_KEY]: '{"v":9,"t":1,"coins":5}' });
  check('Save.load of a v 9 save: held "newer"', Save.load() === null && Save.held === 'newer' && same(Save.newer, { v: 9, lv: 0 }));
  Save.release();
  off();
  delete window.localStorage;
}

// ================================================================== 6. x
console.log('— 6 the x drawer');
const { keepX, X_CAPS, X_TOTAL, X_MAX_KEYS, X_UNKNOWN_CAP, X43, saveWarnings } = SV;
const warnsSince = (n0) => saveWarnings.slice(n0);
{
  check('caps (Q26): log 512, mgmt 256, needs 1024, daily 512, rewards 512, money 896, book 1024, mail 512, wk 1024, unknown 512; total 6,400; ≤ 24 keys',
    same(X_CAPS, { log: 512, mgmt: 256, needs: 1024, daily: 512, rewards: 512, money: 896, book: 1024, mail: 512, wk: 1024 }) && X_UNKNOWN_CAP === 512 && X_TOTAL === 6400 && X_MAX_KEYS === 24);
  // random drawers within the caps (made through JSON.stringify, as the game writes them)
  const KN = Object.keys(X_CAPS);
  const val = (cap, depth = 0) => {
    const r = rnd();
    if (depth > 2 || r < 0.15) return pick([0, 1, -3, 12.5, 'a', '서리', true, false, null, 'item_plank', 1e6]);
    if (r < 0.55) { const a = []; const n = Math.floor(rnd() * 8); for (let i = 0; i < n; i++) a.push(val(cap, depth + 1)); return a; }
    const o = {}; const n = Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++) o[pick(['a', 'b', 'k1', '7', '12', 'z_', 'log', 'sea', '0'])] = val(cap, depth + 1);
    return o;
  };
  let bad = 0, ex = null;
  for (let i = 0; i < 300; i++) {
    const x = {};
    const n = 1 + Math.floor(rnd() * 10);
    for (let j = 0; j < n; j++) {
      const k = rnd() < 0.75 ? pick(KN) : pick(['fest', 'plaza', 'care', 'fund', 'z9', 'q_1']);
      let v = val(X_CAPS[k] || X_UNKNOWN_CAP);
      while (JSON.stringify(v).length > (X_CAPS[k] || X_UNKNOWN_CAP)) v = val(64, 2);
      x[k] = v;
    }
    if (JSON.stringify(x).length > X_TOTAL) continue;
    const txt = JSON.stringify(x);
    const got = keepX(JSON.parse(txt));
    if (JSON.stringify(got) !== txt) { bad++; if (!ex) ex = { txt: txt.slice(0, 200), got: JSON.stringify(got).slice(0, 200) }; }
  }
  check('300 random drawers within the caps: keepX gives the same JSON byte for byte (key order kept, integer-like keys too)', bad === 0, ex || '');
  // over-cap keys: trimmed oldest first
  const w0 = saveWarnings.length;
  const log = []; for (let i = 0; i < 100; i++) log.push(['m43', i, 'ok']);
  const x1 = keepX({ log, money: { d: [[1, 2, 3]], n: 5 } });
  const kept = x1.log;
  const tail = log.slice(log.length - kept.length);
  check('an array over its cap (x.log 100 rows) keeps its newest rows, ≤ 512, and warns "trim"', JSON.stringify(kept).length <= 512 && same(kept, tail) && kept.length > 10 && warnsSince(w0).some((w) => w.k === 'x.log' && w.what === 'trim' && w.n === 100 - kept.length) && same(x1.money, { d: [[1, 2, 3]], n: 5 }), { kept: kept.length, w: warnsSince(w0) });
  const book = { n: 7, sea: Array.from({ length: 200 }, (_, i) => 'fish' + i), land: Array.from({ length: 60 }, (_, i) => 'l' + i) };
  const x2 = keepX(clone({ book }));
  check('an object over its cap (x.book, ' + JSON.stringify(book).length + ' chars) gives up the oldest entries of its longest array until it fits; the rest stays',
    JSON.stringify(book).length > 1024 && JSON.stringify(x2.book).length <= 1024 && x2.book.n === 7 && x2.book.sea.length < 200 && same(x2.book.sea, book.sea.slice(book.sea.length - x2.book.sea.length)) && same(x2.book.land, book.land.slice(book.land.length - x2.book.land.length)),
    { len: JSON.stringify(x2.book).length, sea: x2.book.sea.length, land: x2.book.land.length });
  const w1 = saveWarnings.length;
  const x3 = keepX({ mail: 'x'.repeat(600), fest: { last: 20261224, got: [2025, 2026] }, zz: { s: 'y'.repeat(700) }, log: [1, 2] });
  check('a value that cannot be trimmed (a long string; an object with no array) is dropped with a warning; the others stay', !('mail' in x3) && !('zz' in x3) && same(x3.fest, { last: 20261224, got: [2025, 2026] }) && same(x3.log, [1, 2]) && warnsSince(w1).filter((w) => w.what === 'drop').length === 2, { keys: Object.keys(x3), w: warnsSince(w1) });
  // the total
  const big = {};
  for (const k of KN) { const a = []; while (JSON.stringify(a).length + 8 < X_CAPS[k]) a.push(1234); big[k] = a; }
  for (let i = 0; i < 6; i++) { const a = []; while (JSON.stringify(a).length + 8 < 500) a.push(55555); big['u' + i] = a; }
  const xb = keepX(clone(big));
  const kn = KN.every((k) => same(xb[k], big[k]));
  check('the total ≤ 6,400: unknown keys give way first (the newest first); every known key at its cap stays whole', JSON.stringify(xb).length <= X_TOTAL && kn && !('u5' in xb && JSON.stringify(xb.u5) === JSON.stringify(big.u5)), { total: JSON.stringify(xb).length, keys: Object.keys(xb).length });
  const many = {}; for (let i = 0; i < 30; i++) many['k' + i] = i;
  const w2 = saveWarnings.length;
  const xm = keepX(many);
  check('at most 24 keys (the first 24 kept, warned)', Object.keys(xm).length === 24 && xm.k0 === 0 && xm.k23 === 23 && !('k24' in xm) && warnsSince(w2).some((w) => w.k === 'x' && w.what === 'keys' && w.n === 6));
  // hostile input
  let deep = 1; for (let i = 0; i < 20000; i++) deep = [deep];
  let deepO = {}; const deepRoot = deepO; for (let i = 0; i < 20000; i++) { deepO.a = {}; deepO = deepO.a; }
  const hostile = [
    [], 'x', 5, true, null, [1, 2, 3], new Array(1e5).fill(1),
    JSON.parse('{"__proto__":{"evil":1},"log":[1]}'), { constructor: { a: 1 }, prototype: 1, log: [2] }, { Log: 1, 'a-b': 2, aaaaaaaaaaaaaaaaa: 3, '1x': 4, log: [3] },
    { log: deep }, { book: deepRoot }, { log: 'z'.repeat(1 << 20) }, { mail: { a: [1, 2], b: 'x'.repeat(2000) } },
    Object.fromEntries(Array.from({ length: 100000 }, (_, i) => ['k' + i, i])), { f: () => 1, u: undefined, log: [4] },
  ];
  let threw = 0, polluted = false, idem = 0;
  const t0 = Date.now();
  for (const h of hostile) {
    let r;
    try { r = keepX(h); } catch (e) { threw++; continue; }
    if (r && (Object.prototype.hasOwnProperty.call(r, '__proto__') || 'constructor' in r && Object.prototype.hasOwnProperty.call(r, 'constructor') || ({}).evil)) polluted = true;
    try { if (r && JSON.stringify(keepX(clone(r))) !== JSON.stringify(r)) idem++; } catch (e) { idem++; }
  }
  check('hostile x (arrays as x, 20,000-deep nesting, a 1 MB string, __proto__ / constructor keys, 100,000 keys): never throws, nothing polluted, idempotent, fast', threw === 0 && !polluted && idem === 0 && Date.now() - t0 < 4000, { threw, polluted, idem, ms: Date.now() - t0 });
  const h2 = keepX(JSON.parse('{"__proto__":{"evil":1},"log":[1]}'));
  const h3 = keepX({ constructor: { a: 1 }, log: [2] });
  check('… __proto__ and constructor never become keys of the drawer', same(h2, { log: [1] }) && same(h3, { log: [2] }), [h2, h3]);
  // through sanitizeSave
  const sv = sanitizeSave({ v: 8, coins: 1, x: { log: [[2, 1, 1200, 3, 0]], money: { w: [1, 2] }, fest: { last: 1 } } });
  check('sanitizeSave keeps x (its own copy), and leaves it out when there is nothing in it', same(sv.x, { log: [[2, 1, 1200, 3, 0]], money: { w: [1, 2] }, fest: { last: 1 } }) && !('x' in sanitizeSave({ v: 8, x: {} })) && !('x' in sanitizeSave({ v: 8, x: [1] })) && !('x' in sanitizeSave({ v: 8 })));
  // the holder
  const base = { log: [1], fest: { a: 1 } };
  const H = new X43(base);
  const same0 = H.serialize() === base;
  const okSet = H.set('log', [1, 2, 3]);
  const tooBig = H.set('mail', Array.from({ length: 200 }, (_, i) => 'letter number ' + i));
  const badK = H.set('Bad-Key', 1);
  const rm = H.set('fest', undefined);
  const out = H.serialize();
  check('X43: untouched it serializes the loaded drawer itself; set() fits (a key over its cap is trimmed: false), refuses a bad key, removes with undefined',
    same0 && okSet && same(H.get('log'), [1, 2, 3]) && tooBig === false && JSON.stringify(H.get('mail')).length <= 512 && badK === false && rm && !('fest' in out) && same(base, { log: [1], fest: { a: 1 } }), { same0, okSet, tooBig, badK, rm, out: Object.keys(out) });
  check('X43 of no drawer: serialize() undefined until a key is set', new X43(undefined).serialize() === undefined && (() => { const h = new X43(null); h.set('log', [1]); return same(h.serialize(), { log: [1] }); })());
}

// ================================================================== 7. slices
console.log('— 7 the module slices');
const { SLICES43, keepSlice } = SV;
{
  check('SLICES43: missions 3072, geumbang 1400, haul 768, demand 1024', same(SLICES43, { missions: 3072, geumbang: 1400, haul: 768, demand: 1024 }));
  const exact = (n) => { const o = { v: 1, d: '' }; o.d = 'x'.repeat(n - JSON.stringify(o).length); return o; };
  const bad = [];
  for (const k in SLICES43) {
    const cap = SLICES43[k];
    const at = exact(cap), over = exact(cap + 1);
    const w0 = saveWarnings.length;
    const a = keepSlice(at, cap, k), b = keepSlice(over, cap, k);
    if (JSON.stringify(a) !== JSON.stringify(at) || a === at) bad.push(k + ' at cap');
    if (b !== null || !warnsSince(w0).some((w) => w.k === k && w.what === 'drop')) bad.push(k + ' cap+1');
    const s = sanitizeSave({ v: 8, [k]: at }), s2 = sanitizeSave({ v: 8, [k]: over });
    if (JSON.stringify(s[k]) !== JSON.stringify(at) || k in s2) bad.push(k + ' via sanitizeSave');
  }
  check('each slice at its cap is kept verbatim (a copy); cap + 1 is dropped with a warning (also through sanitizeSave)', !bad.length, bad);
  const notObj = ['x', 5, [1, 2], true].map((v) => keepSlice(v, 3072, 'missions'));
  check('a slice that is not a plain object is dropped', notObj.every((v) => v === null) && keepSlice(undefined, 10, 'haul') === null);
  // the modules' own sanitizer outputs (as v4.4 / v4.6 would write them) pass byte for byte
  const MS = await import('../../src/missions/save.js');
  const { CATALOG } = await import('../../src/missions/data/catalog.js');
  const codes = CATALOG.map((t) => t.code);
  const rawM = { v: 1, sd: 123456, rs: 99, n: 1, t5: 4321, bt: 12, rq: 3, b: [], a: [], p: [], o: [], c: {}, bag: {} };
  let id = 1;
  for (const k of ['b', 'a', 'p', 'o']) for (let i = 0; i < 10; i++) rawM[k].push({ i: id++, c: codes[(id * 7) % codes.length], t0: 1000 + id, g: [1, 2, 3, 4, 5, 6, 7, 8], tp: 50, d: 9, gv: 'npc_aunt', w: 'shop:cafe', nm: 'npc_minji', k: 'kind' + id, sg: 2, pl: 'lot_h3', wi: 'wish' + id });
  for (const c of codes) rawM.c[c] = 1234567;
  const sm = MS.fitCap(MS.sanitizeMissions(rawM));
  const sizeM = JSON.stringify(sm).length;
  const km = keepSlice(JSON.parse(JSON.stringify(sm)), SLICES43.missions, 'missions');
  check('missions: sanitizeMissions + fitCap at its cap (' + sizeM + ' / 3072) passes keepSlice byte for byte', sizeM <= 3072 && sizeM > 2048 && JSON.stringify(km) === JSON.stringify(sm), sizeM);
  const GB = await import('../../src/geumbang/save.js');
  const rawG = { v: 1, st: 2, lv: { van: 3, pack: 1, sled: 2, dawn: 1, back: 1, lockP: 1, lockA: 1 }, seq: 9999, seed: 4242, day: 30, ord: [], door: [], staff: [], days: [], tot: [100, 90, 12345, 400], rev: [], seen: 7 };
  for (let i = 0; i < 30; i++) rawG.ord.push(['g' + (1000 + i), 'a:t_apt' + (i % 3), 'pc', 'bread3,can2,plank1', 30 + i]);
  for (let i = 0; i < 16; i++) rawG.door.push(['a' + i, 'm', 3]);
  for (let i = 0; i < 12; i++) rawG.staff.push(100000 + i);
  for (let i = 0; i < 7; i++) rawG.days.push([10, 9, 500]);
  for (let i = 0; i < 12; i++) rawG.rev.push(['tpl' + i, 'a' + i, 5]);
  const sg = GB.fitGeumbang(GB.sanitizeGeumbang(rawG));
  const sizeG = JSON.stringify(sg).length;
  const kg = keepSlice(JSON.parse(JSON.stringify(sg)), SLICES43.geumbang, 'geumbang');
  check('geumbang: sanitizeGeumbang + fitGeumbang at its cap (' + sizeG + ' / 1400) passes keepSlice byte for byte', sizeG <= 1400 && sizeG > 1000 && JSON.stringify(kg) === JSON.stringify(sg), sizeG);
  // same-level pass-through: a step-B village (lv 43) carrying x and every slice -> load -> the game's serialize -> save
  const sameLv = Object.assign(clone(JSON.parse(LATE[SAVE_KEY])), {
    v: 8, lv: 43, v43: { lay: 2, seen: { letter43: 1, tour43: 1 } },
    x: { log: [[2, 1, 1200, 3, 0]], fest: { last: 20261224, got: [2026] }, money: { w: [[1, 2], [3, 4]] } },
    missions: sm, geumbang: sg, haul: { v: 1, q: [[1, 'ore', 12]], t: 5 }, demand: { v: 1, d: { bread: [1, 2, 3] } },
  });
  const rawTxt = JSON.stringify(sameLv);
  const loaded = migrateSave(JSON.parse(rawTxt));
  // what Game.serialize does with them (Game.js: x43.serialize(), the SLICES43 pass-through), then Save.write's stamp
  const xh = new X43(loaded.x);
  const state = { coins: loaded.coins, v43: loaded.v43 };
  const x = xh.serialize(); if (x) state.x = x;
  for (const k in SLICES43) if (loaded[k]) state[k] = loaded[k];
  const again = JSON.parse(JSON.stringify(SV.stamp(state)));
  const per = ['x', 'missions', 'geumbang', 'haul', 'demand'].filter((k) => JSON.stringify(again[k]) !== JSON.stringify(sameLv[k]));
  check('same-level pass-through: x and every slice survive load -> serialize -> save byte for byte', !per.length && same(again.v43, sameLv.v43), per);
}

// ================================================================== 8. the v43 block
console.log('— 8 the v43 block');
{
  const { sanitizeV43 } = SV;
  const full = { lay: 2, toggles: { counters: { fish: false, meat: 0, mat: true, 'Bad!': false }, stations: { grill: false } }, seen: { letter43: 1, tour43: true, s4offer: 1, no: 0, 'Bad-key': 1 },
    refunds43: { coins: 1200, items: { item_plank: 14, junk: 3 }, wh: { item_ingot: 6 }, moved: 3, kept: 0, extra: 'x' }, src: { v: 7, lv: 0 }, unknown: { a: 1 } };
  const s = sanitizeV43(full);
  check('sanitizeV43 keeps lay, toggles (only "off" entries), seen (1 / true), refunds43 (all five fields), src; drops the rest',
    same(s, { lay: 2, toggles: { counters: { fish: false, meat: false }, stations: { grill: false } }, seen: { letter43: 1, tour43: 1, s4offer: 1 }, refunds43: { coins: 1200, items: { item_plank: 14 }, wh: { item_ingot: 6 }, moved: 3, kept: 0 }, src: { v: 7, lv: 0 } }), s);
  check('a new village\'s block / an old save\'s { lay: 0 } pass unchanged; refunds43 with lists counts them', same(sanitizeV43({ lay: 2, seen: { letter43: 1, tour43: 1 } }), { lay: 2, seen: { letter43: 1, tour43: 1 } }) && same(sanitizeV43({ lay: 0 }), { lay: 0 }) && sanitizeV43({ lay: 2, refunds43: { moved: [[1], [2]], kept: [1] } }).refunds43.moved === 2);
  const junk = [null, undefined, 0, -1, 1e99, NaN, 'x', '', [], {}, [1, 2], { a: 1 }, true, -0.5, 'letter43', { lay: 99 }, { evil: { __proto__: 1 } }];
  const mutate = (o, depth) => {
    if (depth > 3 || rnd() < 0.2) return pick(junk);
    if (Array.isArray(o)) return o.map((x) => (rnd() < 0.3 ? mutate(x, depth + 1) : x));
    if (o && typeof o === 'object') { const r = {}; for (const k in o) if (rnd() > 0.1) r[k] = rnd() < 0.3 ? mutate(o[k], depth + 1) : o[k]; if (rnd() < 0.2) r['k' + Math.floor(rnd() * 99)] = pick(junk); return r; }
    return rnd() < 0.5 ? pick(junk) : o;
  };
  let threw = 0, unstable = 0, extra = 0;
  for (let i = 0; i < 300; i++) {
    let a;
    try { a = sanitizeV43(mutate(clone(full), 0)); } catch (e) { threw++; continue; }
    if (a && !same(sanitizeV43(a), a)) unstable++;
    if (a && Object.keys(a).some((k) => ['lay', 'toggles', 'seen', 'refunds43', 'src'].indexOf(k) < 0)) extra++;
    if (a && !(a.lay >= 0 && a.lay <= 9 && Number.isInteger(a.lay))) extra++;
  }
  check('300 fuzzed blocks: never throws, sanitizeV43(sanitizeV43(x)) = sanitizeV43(x), only the five fields, lay an int 0..9', threw === 0 && unstable === 0 && extra === 0, { threw, unstable, extra });
  const big = { lay: 2, toggles: { counters: {}, stations: {} }, seen: {} };
  for (let i = 0; i < 40; i++) { big.toggles.counters['c' + i] = false; big.toggles.stations['s' + i] = false; big.seen['k' + i] = 1; }
  const sb = sanitizeV43(big);
  check('limits: ≤ 12 counters, ≤ 16 stations, ≤ 32 seen keys', Object.keys(sb.toggles.counters).length === 12 && Object.keys(sb.toggles.stations).length === 16 && Object.keys(sb.seen).length === 32);
  const r = migrateSave(Object.assign(clone(S46), { v43: full }));
  check('migrateSave keeps the block (sanitizeSave calls sanitizeV43)', same(r.v43, s));
}

// ================================================================== 9. G-4, G-5
console.log('— 9 G-4 / G-5');
{
  const s = sanitizeSave({ v: 8, progress: { got: { mkt_s3: { item_plank: 5 }, bld_bakery: { item_plank: 4 }, mkt_s4: { item_plank: 20, item_ingot: 8 }, up_tool: { item_axe: 1 }, odd: { item_nope: 3, item_plank: -2 } } } });
  check('G-4: progress.got keeps every ITEMS kind (planks on mkt_s3 / bld_bakery, planks + ingots on mkt_s4, tools); unknown items dropped',
    same(s.progress.got, { mkt_s3: { item_plank: 5 }, bld_bakery: { item_plank: 4 }, mkt_s4: { item_plank: 20, item_ingot: 8 }, up_tool: { item_axe: 1 }, odd: { item_plank: 0 } }), s.progress.got);
  const v = (b) => SV.sanitizeV42({ v: 1, seen: { boost: b } }).seen;
  check('G-5: v42.seen.boost kept (0..3), not written when 0 / absent; idempotent', v(2).boost === 2 && v(7).boost === 3 && !('boost' in v(0)) && !('boost' in v(undefined)) && same(SV.sanitizeV42(SV.sanitizeV42({ v: 1, seen: { boost: 2 } })), SV.sanitizeV42({ v: 1, seen: { boost: 2 } })));
}

// ================================================================== 10. size
console.log('— 10 size at caps');
{
  const raw = clone(JSON.parse(LATE[SAVE_KEY]));
  // bank ≤ 1 KB, logistics ≤ 2 KB (their caps), the four slices at their caps, x at X_TOTAL, a realistic v43 block
  raw.bank = { v: 1, open: 1, sv: 123456789, ld: 1234567, tk: 999, v6: 1, so: 1, t5: 1234567890, ln: { a: 999999, l: 888888, f: 77777, t0: 123456789, d0: 1234, rs: 3, ps: 1, k: 'build' }, rw: [], ins: [] };
  for (let i = 0; i < 8; i++) raw.bank.rw.push([1234567, 'interest', 123456789, 1234567890]);
  for (let i = 0; i < 24 && JSON.stringify(SV.keepBank(raw.bank)).length < 1000; i++) raw.bank.ins.push(['ins' + i, 123456, 999983]);
  raw.bank = SV.keepBank(raw.bank);
  while (JSON.stringify(raw.bank).length > 1024) raw.bank.ins.pop();
  raw.logistics = { v: 1, open: 1, gift: 1, tut: 1, day: 1234567, seq: 123456789, stock: {}, orders: [], cash: 12345678, chains: [], lv3: [], days: [], made: [1234567, 1234567], tot: [12345678, 1234567890, 123456789] };
  for (const k of ['bread', 'ore', 'plank', 'ingot', 'fish_cooked', 'meat_cooked', 'log', 'wheat', 'can', 'fish_raw']) raw.logistics.stock[k] = 9999;
  for (let i = 0; i < 12; i++) raw.logistics.orders.push(['order' + i, 'shop:cafe' + i, 'svps', { bread: 99, can: 99 }, { ore: 99 }]);
  for (let i = 0; i < 10; i++) raw.logistics.days.push(999999);
  for (let i = 0; i < 6; i++) raw.logistics.chains.push({ id: 'chain_' + i, k: 'f', in: 99, out: ['chair', 'table', 'sofa', 'bed', 'wardrobe'], m: 1234567, r: 1234567 });
  for (let i = 0; i < 32; i++) raw.logistics.lv3.push('house_' + i + '_' + 'x'.repeat(24));
  raw.logistics = SV.keepLogistics(raw.logistics);
  const exact = (n) => { const o = { v: 1, d: '' }; o.d = 'x'.repeat(n - JSON.stringify(o).length); return o; };
  for (const k in SLICES43) raw[k] = exact(SLICES43[k]);
  raw.x = {};
  for (const k of Object.keys(X_CAPS)) { const a = []; while (JSON.stringify(a).length + 8 < X_CAPS[k] - 2) a.push(1234567); raw.x[k] = a; }
  raw.x.fest = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  raw.v43 = { lay: 2, seen: { letter43: 1, tour43: 1, s4offer: 1 }, refunds43: { coins: 3800, items: { item_plank: 30, item_ingot: 10 }, wh: { item_plank: 14 }, moved: 4, kept: 0 }, src: { v: 7, lv: 0 } };
  raw.flag = { s: 1, b: 2, p: 3, pc: 4, e: 5, ec: 6 };
  raw.bakery = { stock: { item_bread: 60 }, cash: 9999 };
  raw.onb = 14;
  const s = sanitizeSave(raw);
  const xLen = JSON.stringify(s.x).length;
  const size = JSON.stringify(SV.stamp(s)).length;
  const base = JSON.stringify(SV.stamp(sanitizeSave(clone(JSON.parse(LATE[SAVE_KEY]))))).length;
  console.log('       late v4.2 village ' + base + ' B; at caps ' + size + ' B (x ' + xLen + ', bank ' + JSON.stringify(s.bank).length + ', logistics ' + JSON.stringify(s.logistics).length + ', slices ' + Object.keys(SLICES43).reduce((n, k) => n + JSON.stringify(s[k]).length, 0) + ', v43 ' + JSON.stringify(s.v43).length + ')');
  check('the save at caps < 24,576 B (' + size + ')' + (size > 16384 ? ' — over the 16,384 B warning line (expected at caps)' : ''), size < 24576 && xLen <= X_TOTAL && xLen > 6000, size);
  // the v43 block at its own limits (toggles are written from v4.4, whose saves this build refuses): reported only
  const v43max = { lay: 2, toggles: { counters: {}, stations: {} }, seen: {}, refunds43: raw.v43.refunds43, src: raw.v43.src };
  for (let i = 0; i < 16; i++) { v43max.toggles.stations['station_' + i] = false; if (i < 12) v43max.toggles.counters['counter_' + i] = false; }
  for (let i = 0; i < 32; i++) v43max.seen['seen_key_number_' + i] = 1;
  const sizeMax = JSON.stringify(SV.stamp(sanitizeSave(Object.assign(clone(raw), { v43: v43max })))).length;
  console.log('       (info) with the v43 block at its own limits (32 seen keys, 28 toggles): ' + sizeMax + ' B');
}

// ================================================================== 11. pre43 (S4 writes it; here: it never travels)
console.log('— 11 pre43 (part)');
check('PRE43_KEY is not a game key (never in a code; 불러오기 never removes it)', !T.isGameKey(SV.PRE43_KEY));

delete globalThis.window;
if (!NODE_ONLY) await browserPart();
console.log('\nsave_v43: ' + passed + ' passed, ' + fails.length + ' failed');
process.exit(fails.length ? 1 : 0);

// ================================================================ the real game (B4)
async function browserPart() {
  const { start } = await import('./serve.mjs');
  const { launch, openPage, sleep, waitFor } = await import('./pw.mjs');
  const { installStepper, advance, render, until } = await import('./fv_step.mjs');
  fs.mkdirSync(OUTDIR, { recursive: true });
  const srv = await start(0, { prefix: '/fv/' });
  const browser = await launch();
  const origin = srv.url.replace(/\/fv\/$/, '');
  const shot = async (page, n) => { await page.screenshot({ path: path.join(OUTDIR, n + '.png') }); };
  const errs = [];
  const newPage = async (keys, opts = {}) => {
    const o = await openPage(browser, srv.url + 'index.html', Object.assign({ viewport: { width: 390, height: 844 }, dpr: 2 }, opts));
    await o.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin }).catch(() => {});
    await o.page.evaluate((k) => { localStorage.clear(); for (const n in k) localStorage.setItem(n, k[n]); }, keys || {});
    await o.page.reload({ waitUntil: 'load' });
    return o;
  };
  // (not tapStart: on a busy machine its next tap can land on the hold card as it comes up — its 「새로 고침」 reloads the
  //  page. Taps stop as soon as the title has started)
  const startGame = async (page) => {
    const c = await page.$('canvas');
    const b = await c.boundingBox();
    for (let i = 0; i < 20; i++) {
      const st = await page.evaluate(() => { const sc = window.__FV.game.scene.getScene('Title'); const s = sc && sc.screen; return !window.__FV.game.scene.isActive('Title') || !!(s && s.started); });
      if (st) return;
      await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height * 0.6);
      await sleep(2500);
    }
  };
  const boot = async (page) => {
    await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
    await sleep(400);
    await startGame(page);
    await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 180000);
    await sleep(800);
    await installStepper(page);
    await advance(page, 0.3);
  };
  const stored = (page) => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
  const hide = (page) => page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); });
  const card = (page) => page.evaluate(() => {
    const r = document.getElementById('fh-root'), b = document.getElementById('fh-bar');
    const vis = (el) => !!el && !el.hidden && el.getBoundingClientRect().height > 0;
    const c = document.querySelector('.fh-card');
    const box = c ? c.getBoundingClientRect() : null;
    return {
      card: vis(r), bar: vis(b), kind: c && c.dataset.kind, title: (document.getElementById('fh-title') || {}).textContent || '',
      body: (document.getElementById('fh-body') || {}).textContent || '', b1: (document.getElementById('fh-b1') || {}).textContent || '',
      barText: (document.getElementById('fh-bar-text') || {}).textContent || '', ask: vis(document.getElementById('fh-ask')),
      msg: (document.getElementById('fh-msg') || {}).textContent || '',
      fits: box ? box.left >= 0 && box.right <= innerWidth + 0.5 && box.top >= 0 && box.bottom <= innerHeight + 0.5 : null,
      held: window.__FV_SAVE_HELD || null, noSave: !!window.__FV_NO_SAVE,
      uiInput: window.__FV.game.scene.getScene('UI').input.enabled,
      holds: (window.__FV43 ? window.__FV43.recent() : []).filter((e) => e.name === 'hold').map((e) => e.data && e.data.kind),
      onb: window.__FV.scene.onboard ? window.__FV.scene.onboard.mode || null : null,
      maker: !!(window.__FV.scene.flags && window.__FV.scene.flags.mk),
    };
  });
  const click = (page, id) => page.evaluate((i) => { const el = document.getElementById(i); if (el) el.click(); return !!el; }, id);
  try {
    // ============================================================ B4a: a stored lv 46 village
    console.log('— B4a: a village from a newer build (lv 46)');
    const raw46 = JSON.stringify(Object.assign({ v: 8, lv: 46, t: 1790000000000 }, S46, { v: 8, lv: 46 }));
    const keysA = { [SAVE_KEY]: raw46, [CHAT_KEY]: '{"v":1,"cid":"abcd1234","chat":{}}', [SETTINGS_KEY]: '{"sound":false,"music":false,"lang":"ko"}' };
    const A = await newPage(keysA);
    await boot(A.page);
    // (the title may have written its own keys before the game loaded: the sound setting, the title prefs)
    const sBoot = await stored(A.page);
    await advance(A.page, 1);
    const c0 = await card(A.page);
    check('B4a: the newer card shows (title, update / code / new buttons), held "newer", the bus heard { kind: newer }, the input off',
      c0.card && c0.kind === 'newer' && /더 새 버전에서 저장된 마을/.test(c0.title) && c0.held === 'newer' && c0.noSave && c0.holds.indexOf('newer') >= 0 && c0.uiInput === false, c0);
    check('B4a: no first-run tutorial and no flag maker behind it', !c0.maker && (c0.onb === null || c0.onb === 'off'), { onb: c0.onb, maker: c0.maker });
    await render(A.page);
    await shot(A.page, 'newer_390x844_ko');
    check('B4a: the card fits the 390x844 screen', c0.fits === true);
    // 60 s of game time (12 autosaves), then the app going to the background
    await advance(A.page, 60);
    await hide(A.page);
    await sleep(300);
    const sA = await stored(A.page);
    check('B4a: after 60 s + visibilitychange / pagehide every stored key is byte-identical (save, chat, settings, as at the boot); nothing copied aside',
      sA[SAVE_KEY] === raw46 && sA[CHAT_KEY] === keysA[CHAT_KEY] && same(sA, sBoot) && !sA[BACKUP_KEY] && !sA[BACKUP_KEY + '.2'] && !sA[BAD_KEY], { keys: Object.keys(sA), changed: Object.keys(sA).filter((k) => sA[k] !== sBoot[k]) });
    await A.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); });
    // 「마을 코드 만들기」: 마을 옮기기 › 내보내기 over the card, holding the STORED village
    await click(A.page, 'fh-b2');
    await waitFor(A.page, () => { const t = document.getElementById('fm-code-out'); return t && /SNOWBLOOM2\./.test(t.value); }, 30000);
    const code = await A.page.evaluate(() => document.getElementById('fm-code-out').value);
    const dc = await T.decodeVillage(code);
    check('B4a: 「마을 코드 만들기」 makes a code of the stored village byte for byte (its chat and settings too)', dc.ok && dc.keys[SAVE_KEY] === raw46 && dc.keys[CHAT_KEY] === keysA[CHAT_KEY] && /마을 옮기기 코드 · \d/.test(code.split('\n')[0]), dc.error || code.split('\n')[0]);
    await A.page.evaluate(() => document.getElementById('fm-close').click());
    await sleep(200);
    const c1 = await card(A.page);
    check('B4a: closing 마을 옮기기 leaves the card up and the input off', c1.card && c1.uiInput === false && (await stored(A.page))[SAVE_KEY] === raw46, c1);
    // 「새 마을로 시작」: asks first
    await click(A.page, 'fh-b3');
    const c2 = await card(A.page);
    await render(A.page);
    await shot(A.page, 'newer_ask_390x844_ko');
    await click(A.page, 'fh-no');
    const c3 = await card(A.page);
    check('B4a: 「새 마을로 시작」 asks first; 「취소」 goes back, nothing changed', c2.ask && /예비 사본/.test((await A.page.evaluate(() => document.getElementById('fh-q').textContent))) && !c3.ask && c3.card && (await stored(A.page))[SAVE_KEY] === raw46);
    const gs0 = await A.page.evaluate(() => { window.__gs0 = window.__FV.scene; return true; });
    await click(A.page, 'fh-b3');
    await click(A.page, 'fh-yes');
    // (the spare code is made first (async), then the scene restarts: step the clock while waiting)
    const fresh = await until(A.page, () => !window.__FV_SAVE_HELD && window.__FV.game.scene.isActive('UI') && window.__FV.scene && window.__FV.scene.player && window.__FV.game.scene.getScene('Game').fresh === true, 60);
    check('B4a: 「네, 새 마을로」 starts a new village (the Game scene restarted fresh)', gs0 && fresh);
    await advance(A.page, 8);
    const sA2 = await stored(A.page);
    const spare = await T.decodeVillage(sA2[T.MOVE_BACKUP_KEY] || '');
    const c4 = await card(A.page);
    check('B4a: then the newer village is the 불러오기 spare (a code of its keys) and in the backup slot; the hold is lifted',
      spare.ok && spare.keys[SAVE_KEY] === raw46 && spare.keys[CHAT_KEY] === keysA[CHAT_KEY] && sA2[BACKUP_KEY] === raw46 && !c4.held && !c4.card && !c4.noSave, { spare: spare.error, backup: (sA2[BACKUP_KEY] || '').slice(0, 30), c4 });
    check('B4a: … and a new village that saves ({"v":8,"lv":43,"t":…, a new chat id)', typeof sA2[SAVE_KEY] === 'string' && sA2[SAVE_KEY].startsWith('{"v":8,"lv":43,"t":') && JSON.parse(sA2[SAVE_KEY]).coins !== S46.coins && c4.uiInput === true, (sA2[SAVE_KEY] || '').slice(0, 40));
    errs.push(...A.log.errors);
    await A.ctx.close();
    // the other screens: 360x640 / 412x915 ko, 390x844 en
    for (const [w, hgt, lang] of [[360, 640, 'ko'], [412, 915, 'ko'], [390, 844, 'en']]) {
      const P = await newPage({ [SAVE_KEY]: raw46, [SETTINGS_KEY]: JSON.stringify({ lang }) }, { viewport: { width: w, height: hgt } });
      await boot(P.page);
      await advance(P.page, 1);
      await render(P.page);
      const c = await card(P.page);
      await shot(P.page, 'newer_' + w + 'x' + hgt + '_' + lang);
      check('B4a: ' + w + 'x' + hgt + ' ' + lang + ': the card shows and fits', c.card && c.fits === true && (lang === 'en' ? /newer version/.test(c.title) : /더 새 버전/.test(c.title)), { fits: c.fits, title: c.title });
      errs.push(...P.log.errors);
      await P.ctx.close();
    }

    // ============================================================ B4b: v 9
    console.log('— B4b: a v 9 village');
    const raw9 = JSON.stringify(Object.assign({ v: 9, t: 1790000000000 }, S46, { v: 9 }));
    const B = await newPage({ [SAVE_KEY]: raw9 });
    await boot(B.page);
    await advance(B.page, 1);
    const b0 = await card(B.page);
    check('B4b: a v 9 save: the same card, held, the web build\'s first button reloads', b0.card && b0.kind === 'newer' && b0.held === 'newer' && /새로 고침/.test(b0.b1), b0);
    await Promise.all([B.page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }).catch(() => null), click(B.page, 'fh-b1')]);
    await boot(B.page);
    await advance(B.page, 6);
    const b1 = await card(B.page);
    const sB = await stored(B.page);
    check('B4b: after the reload the card is back and the save untouched', b1.card && b1.held === 'newer' && sB[SAVE_KEY] === raw9 && !sB[BACKUP_KEY], { card: b1.card, held: b1.held });
    errs.push(...B.log.errors);
    await B.ctx.close();

    // ============================================================ B4c: a second, newer tab
    console.log('— B4c: a second, newer tab writes the village during play');
    const C = await newPage({ [SAVE_KEY]: JSON.stringify(JSON.parse(fs.readFileSync(path.join(FIX, 'v41_save_smart_25min.json'), 'utf8'))) });
    await boot(C.page);
    await advance(C.page, 6);
    const own = (await stored(C.page))[SAVE_KEY] || '';
    check('B4c: this tab saves normally first ({"v":8,"lv":43,…)', own.startsWith('{"v":8,"lv":43,"t":'), own.slice(0, 30));
    const newer = '{"v":8,"lv":46,"t":1,' + own.slice(own.indexOf('"t":') + 4).replace(/^\d+,/, '');
    await C.page.evaluate(([k, v]) => localStorage.setItem(k, v), [SAVE_KEY, newer]);
    await advance(C.page, 16);
    await hide(C.page);
    await sleep(200);
    await C.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); });
    await advance(C.page, 6);
    const cc = await card(C.page);
    const sC = await stored(C.page);
    await render(C.page);
    await shot(C.page, 'stale_390x844_ko');
    check('B4c: every later autosave / pagehide is refused (the newer save byte-identical), the banner shows once, the game plays on',
      sC[SAVE_KEY] === newer && cc.bar && !cc.card && cc.held === 'stale' && /새로 고침/.test(cc.barText) && cc.holds.filter((k) => k === 'stale').length === 1 && cc.uiInput === true, { same: sC[SAVE_KEY] === newer, cc });
    errs.push(...C.log.errors);
    await C.ctx.close();
  } catch (e) {
    check('browser part ran to the end', false, String((e && e.stack) || e).slice(0, 600));
  }
  check('browser: 0 page errors', errs.length === 0, errs.slice(0, 5));
  await browser.close();
  await srv.close();
}
