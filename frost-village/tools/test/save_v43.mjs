// (v4.3 step B 「마을 새 단장 둘째 걸음」, WP-S) the step-B save: docs/redesign_v43/stepB/map_save.md §6.1
//   node tools/test/save_v43.mjs [--node] [--out <dir>] [--s4-only] [--b1-all] [--g8-all] [--p-gate]
//     --node: the Node checks only (the browser part needs the shared lock: scratchpad/v43/stepB/lane_b.sh); --s4-only: of
//     the browser part only the R43 rows (B1–B3, B5); --b1-all / --g8-all: B1 / B2 on every pre-B fixture (B2 × throw and
//     check) instead of the representative set; --p-gate: the P-GATE row is hard even before P is merged
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

// ================================================================== S4: R43 (map_save §6.1 rows 2–4, 11; build_plan §3.5 S4)
const RM = await import('../../src/core/Remap43.js');
const { WORLD } = await import('../../src/data/world.js');
const { priceOf } = await import('../../src/data/items.js');
const { asStepB } = await import('./v43_helpers.mjs');
const { migrateSaveEx } = SV;
const fixtureSave = (f) => { const d = JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8')); return d.keys ? JSON.parse(d.keys[SAVE_KEY]) : d; };
const fixtureKeys = (f) => { const d = JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8')); return d.keys ? d.keys : { [SAVE_KEY]: JSON.stringify(d) }; };
const isO = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const cnt = (v) => Math.max(0, Math.floor(Number(v) || 0));
const PRICE = { item_plank: priceOf('item_plank'), item_ingot: priceOf('item_ingot') };
/** every pre-B fixture there is (the node-made ones and those exported from old builds, S5) */
const PREB = fs.readdirSync(FIX).filter((f) => /\.json$/.test(f) && !/^v43_(newer|samelv)/.test(f)).sort();
const expectFail = (f) => { const d = JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8')); return d._expect === 'fail'; };

const ST_IO = Object.fromEntries((WORLD.stations || []).map((q) => [q.id, [q.input, q.output]]));
/** (map_save §4.4) coins and items over every place of a (sanitized) save; sites from `rawSites` when given (the pre-B
 *  layout as it was stored: a building the new plot table would refuse before the move still holds its materials) */
function census(s, rawSites) {
  const C = { coins: 0, items: {} };
  const add = (k, n) => { n = cnt(n); if (n) C.items[k] = (C.items[k] || 0) + n; };
  const addAll = (o, pre) => { if (isO(o)) for (const k in o) add((pre || '') + k, o[k]); };
  const coin = (n) => { C.coins += cnt(n); };
  coin(s.coins);
  for (const k of ['market', 'trade', 'bakery']) if (isO(s[k])) { coin(s[k].cash); addAll(s[k].stock); }
  const v3 = s.v3 || {};
  if (isO(v3.store)) { coin(v3.store.cash); addAll(v3.store.stock); }
  addAll(v3.warehouse);
  if (isO(v3.food)) addAll(v3.food.food);
  if (isO(v3.dock)) addAll(v3.dock.catch);
  if (isO(v3.workshops)) for (const w in v3.workshops) { addAll(v3.workshops[w].ins); addAll(v3.workshops[w].outs); }
  if (isO(s.c1)) { if (isO(s.c1.hall)) { coin(s.c1.hall.tax); coin(s.c1.hall.stn); } if (isO(s.c1.rest)) { coin(s.c1.rest.cash); addAll(s.c1.rest.pantry); } }
  if (isO(s.v4)) {
    coin(s.v4.cash); coin(s.v4.rentAcc); addAll(s.v4.cargo);
    if (isO(s.v4.shops)) for (const id in s.v4.shops) addAll(s.v4.shops[id].stock);
    if (isO(s.v4.orders)) { for (const c of s.v4.orders.cards || []) addAll(c.got); if (isO(s.v4.orders.kept)) for (const k in s.v4.orders.kept) addAll(s.v4.orders.kept[k]); }
    if (isO(s.v4.houses)) for (const id in s.v4.houses) addAll(s.v4.houses[id].got);
  }
  if (isO(s.v42)) {
    const o = s.v42.office || {};
    coin(o.bag); coin(o.safe); coin(o.hirePaid);
    if (isO(s.v42.offerPaid)) for (const k in s.v42.offerPaid) coin(s.v42.offerPaid[k]);
    const dp = s.v42.depot || {};
    if (isO(dp.hp)) for (const k in dp.hp) coin(dp.hp[k]);
    addAll(dp.load);
    if (isO(s.v42.freight)) { addAll(s.v42.freight.dock); addAll(s.v42.freight.cars); }
  }
  if (isO(s.logistics)) { coin(s.logistics.cash); addAll(s.logistics.stock, 'lgx:'); }
  if (isO(s.bank)) coin(s.bank.sv);
  if (isO(s.progress)) { addAll(s.progress.paid, 'paid:'); if (isO(s.progress.got)) for (const id in s.progress.got) addAll(s.progress.got[id]); }
  if (isO(s.player)) for (const k of s.player.stack || []) add(k, 1);
  if (isO(s.labour)) addAll(s.labour.piles, 'pile:');
  // (a station's input / output by its item: an old village's shop bread moves onto the bakery's rack at load — a3)
  if (isO(s.stations)) for (const id in s.stations) { const io = ST_IO[id]; add(io ? io[0] : 'st:' + id + ':i', s.stations[id].i); add(io ? io[1] : 'st:' + id + ':o', s.stations[id].o); }
  const sites = rawSites || s.sites || {};
  // (a foundation's delivered materials; a scaffold's are in its frame — Site.beginScaffold empties its stock — so they are no
  //  longer things the village holds)
  for (const id in sites) { const d = sites[id]; if (isO(d) && SV.SITE_RULES.BUILDINGS.indexOf(d.b) >= 0 && d.st === 'foundation' && isO(d.got)) for (const m of ['item_plank', 'item_ingot']) add(m, d.got[m]); }
  // (paid coins on step pads are coins too)
  for (const k in C.items) if (/^paid:/.test(k)) { C.coins += C.items[k]; delete C.items[k]; }
  return C;
}
const chain = (s) => { let o = clone(s), v = o.v; while (v !== SAVE_VERSION && MIGRATE[v]) { o = MIGRATE[v](o); v = o.v; } return o; };

console.log('— 2 every pre-B fixture through migrateSaveEx (R43) — ' + PREB.length + ' fixtures');
{
  const HOMES = RM.MOVE43;
  const HIDDEN = Object.keys(WORLD.plots).filter((id) => WORLD.plots[id].hidden === true);
  const S0 = WORLD.v43.oldStart, SF = WORLD.v43.shopFront;
  const bad = { fail: [], lay: [], census: [], homes: [], hidden: [], idem: [], keep: [], src: [], chief: [], mutate: [], expected: [] };
  const report = [];
  for (const f of PREB) {
    const raw = fixtureSave(f);
    const rawTxt = JSON.stringify(raw);
    const r = migrateSaveEx(clone(raw));
    if (JSON.stringify(raw) !== rawTxt) bad.mutate.push(f);
    if (expectFail(f)) { if (!(r.fail && !r.save)) bad.expected.push(f); continue; }
    if (!r.save || r.fail || !r.remapped) { bad.fail.push(f + ': ' + (r.fail ? r.fail.reason : 'no save')); continue; }
    const s = r.save, R = r.r;
    if (!(s.v43 && s.v43.lay === 2 && s.v43.refunds43)) bad.lay.push(f);
    // the census: the same coins and items as the village loaded without the move, plus exactly the refunds
    const pre = chain(raw);
    const base = sanitizeSave(asStepB(pre));
    const cA = census(base, pre.sites), cB = census(s);
    const want = clone(cA.items);
    // (a foundation's extras leave its got; what goes to the 창고 is there; a scaffold's come from its frame)
    for (const m in R.fromGot) want[m] = (want[m] || 0) - R.fromGot[m];
    for (const m in R.toWh) want[m] = (want[m] || 0) + R.toWh[m];
    for (const m in want) if (!want[m]) delete want[m];
    if (cB.coins !== cA.coins + R.coins || !same(Object.entries(want).sort(), Object.entries(cB.items).sort())) bad.census.push(f + ': coins ' + cA.coins + ' + ' + R.coins + ' vs ' + cB.coins + ' items ' + JSON.stringify(Object.keys(want).filter((k) => want[k] !== cB.items[k]).map((k) => [k, want[k], cB.items[k]])));
    // every workshop / XL building on its home
    for (const id in s.sites) { const d = s.sites[id]; if (HOMES[d.b] && HOMES[d.b] !== id) bad.homes.push(f + ': ' + d.b + ' on ' + id); }
    for (const id of HIDDEN) if (s.sites[id]) bad.hidden.push(f + ': ' + id);
    // a second load is a no-op
    const again = migrateSaveEx(JSON.parse(JSON.stringify(SV.stamp(s))));
    if (again.remapped || !again.save || !same(Object.assign({}, again.save), s)) bad.idem.push(f);
    // what the move never touches
    const keepSame = Object.keys(Object.assign({}, base, s)).filter((k) => ['sites', 'coins', 'v3', 'player', 'v43', 'progress'].indexOf(k) < 0 && !same(base[k], s[k]));
    const pB = clone(base.progress), pS = clone(s.progress);
    delete pS.flags.s4half; delete pB.flags.s4half;
    const v3B = Object.assign({}, base.v3, { warehouse: null }), v3S = Object.assign({}, s.v3, { warehouse: null });
    if (keepSame.length || !same(pB, pS) || !same(v3B, v3S)) bad.keep.push(f + ': ' + keepSame.concat(!same(pB, pS) ? ['progress'] : [], !same(v3B, v3S) ? ['v3'] : []).join(','));
    if (!same(s.v43.src, { v: Math.floor(raw.v), lv: 0 })) bad.src.push(f + ': ' + JSON.stringify(s.v43.src));
    const officeOpen = isO(s.sites.v42_office) && s.sites.v42_office.st !== 'done';
    const at = officeOpen ? SF : S0;
    if (s.player.x !== at[0] || s.player.y !== at[1] || !same(s.player.stack, base.player.stack)) bad.chief.push(f);
    report.push(f.replace(/\.json$/, '') + ' ' + R.moved.length + '/' + R.kept.length + (R.coins ? ' +' + R.coins : ''));
  }
  console.log('       moved/kept (+coins): ' + report.join(' · '));
  check('2: every pre-B fixture remaps (lay 2, refunds43) — check43 + check43b pass; migrateSaveEx never changes its input', !bad.fail.length && !bad.lay.length && !bad.mutate.length, bad.fail.concat(bad.lay, bad.mutate));
  check('2: the census (coins + items over every place) equals the village loaded without the move, plus exactly the refunds', !bad.census.length, bad.census);
  check('2: every workshop on its d_* plot, the hall on w_hall, the restaurant on w_rest; nothing on a hidden plot', !bad.homes.length && !bad.hidden.length, bad.homes.concat(bad.hidden));
  check('2: a second load is a no-op (stamped output -> not remapped, the same save)', !bad.idem.length, bad.idem);
  check('2: the move touches only sites / coins / 창고 / the chief\'s spot / v43 / s4half (onb, admin*, flag, bakery, flags, resWin, v42 incl. the depot crew (D20), v4, c1 … as before)', !bad.keep.length, bad.keep);
  check('2: v43.src = { v of the stored save, lv 0 } (BP-23)', !bad.src.length, bad.src);
  check('2: the chief restarts at WORLD.v43.oldStart (the shop front while the office site is unfinished); his stack kept', !bad.chief.length, bad.chief);
  check('2: the hand-made N3 fixture (_expect fail) is refused (check43b), never loaded', !bad.expected.length, bad.expected);
  // map_save §6.2: migrateSave of each v4.1 fixture carries v43.lay 2
  const v41 = PREB.filter((f) => /^v41_/.test(f)).map((f) => migrateSave(fixtureSave(f)));
  check('2 (save_v42 row): migrateSave of each v4.1 fixture carries v43.lay 2', v41.length === 5 && v41.every((s) => s && s.v43 && s.v43.lay === 2));
  const exported = ['v4202_fresh_tut', 'v4202_25min', 'v4202_46min_admin', 'v421_meatcan', 'v43a22_late', 'v43a3_late', 'v43a3_fresh25'].filter((n) => !fs.existsSync(path.join(FIX, n + '.json')));
  check('S5: the fixtures exported from the old builds are all here (4.2.0.2 ×3, 4.2.1 meat cans, a2.2, a3.1 ×2)', !exported.length, exported);
}

console.log('— 3 XL swap and reprice');
{
  const go = (f) => migrateSaveEx(fixtureSave(f));
  const both = go('v43_xl_swap_both.json');
  check('3: XL swap (hall on w_rest + restaurant on w_hall): swapped, both done, nothing refunded', both.save && both.save.sites.w_hall.b === 'town_hall' && both.save.sites.w_rest.b === 'big_restaurant' && both.save.sites.w_hall.st === 'done' && both.r.coins === 0 && both.r.moved.some((m) => m[0] === 'w_rest' && m[1] === 'w_hall'), both.fail || both.r && both.r.moved);
  const h = go('v43_xl_swap_hall.json'), rs = go('v43_xl_swap_rest.json');
  check('3: the hall alone on w_rest -> w_hall (w_rest empty); a restaurant foundation alone on w_hall -> w_rest with its 4 planks', h.save && h.save.sites.w_hall.b === 'town_hall' && !h.save.sites.w_rest && rs.save && rs.save.sites.w_rest.b === 'big_restaurant' && rs.save.sites.w_rest.st === 'foundation' && rs.save.sites.w_rest.got.item_plank === 4 && !rs.save.sites.w_hall);
  const kp = migrateSaveEx(fixtureSave('v43_xl_swap_kept.json'));
  const rk = RM.remap43(MIGRATE[7](fixtureSave('v43_xl_swap_kept.json')));
  check('3: N3 (hall on w_rest, a house on w_hall): remap43 keeps the hall where it is and logs it (kept 1); check43b refuses the move -> fail', rk.r.kept.length === 1 && rk.r.kept[0][0] === 'w_rest' && rk.save.v43.refunds43.kept === 1 && rk.save.sites.w_rest.b === 'town_hall' && kp.fail && /check43b house_b on w_hall/.test(kp.fail.reason) && !kp.save, kp.fail);
  const room = go('v43_reprice_room.json'), full = go('v43_reprice_full.json'), nowh = go('v43_reprice_nowh.json');
  const P = PRICE;
  check('3: reprice with 창고 room (hall foundation 25/8 + office scaffold, 20 places): +1,200 +1,400; extras 9/4 off the hall\'s got and 12/6 out of the office\'s frame: 20 planks to the 창고, 1 plank + 10 ingots as coins; the foundation\'s got = the new need, the scaffold\'s untouched; office t 9.5 -> 8; chief at the shop front',
    room.save && room.r.coins === 2600 + P.item_plank + 10 * P.item_ingot && same(room.r.toWh, { item_plank: 20 }) && same(room.r.asCoins, { item_plank: 1, item_ingot: 10 }) && same(room.r.fromGot, { item_plank: 9, item_ingot: 4 }) && same(room.r.fromFrame, { item_plank: 12, item_ingot: 6 }) && same(room.save.sites.w_hall.got, { item_plank: 16, item_ingot: 4 }) && same(room.save.sites.v42_office.got, { item_plank: 20, item_ingot: 6 }) && room.save.sites.v42_office.t === 8 && room.save.v3.warehouse.item_plank === 20 && Object.values(room.save.v3.warehouse).reduce((a, b) => a + b, 0) === 300 && room.save.player.x === WORLD.v43.shopFront[0],
    room.r && { coins: room.r.coins, toWh: room.r.toWh, asCoins: room.r.asCoins });
  check('3: reprice with a full 창고 (hall scaffold): +1,200 and the 14 planks + 6 ingots its frame took above the new need, as coins; the scaffold stays a scaffold', full.save && full.r.coins === 1200 + 14 * P.item_plank + 6 * P.item_ingot && !Object.keys(full.r.toWh).length && full.save.sites.w_hall.st === 'scaffold' && same(full.r.fromFrame, { item_plank: 14, item_ingot: 6 }), full.r && full.r.coins);
  // a scaffold as the old game saves it (its got 0: the materials are in the frame) gets the same refund
  const real = RM.remap43({ v: 8, coins: 5, sites: { w_hall: { b: 'town_hall', st: 'scaffold', got: { item_plank: 0, item_ingot: 0 }, t: 20 } } });
  check('3: a scaffold as an old build saves it (got 0 / 0, t 20): +1,200 and 14 planks + 6 ingots out of its frame (coins: no 창고), got untouched, t -> 14; check43 passes',
    real.r.coins === 1200 + 14 * P.item_plank + 6 * P.item_ingot && same(real.save.sites.w_hall.got, { item_plank: 0, item_ingot: 0 }) && real.save.sites.w_hall.t === 14 && RM.check43({ v: 8, coins: 5, sites: { w_hall: { b: 'town_hall', st: 'scaffold', got: { item_plank: 0, item_ingot: 0 }, t: 20 } } }, real.save, real.r).ok, real.r);
  check('3: reprice without a 창고 (hall 25/8 + office 12/2): +2,600 and 13 planks + 6 ingots as coins', nowh.save && nowh.r.coins === 2600 + 13 * P.item_plank + 6 * P.item_ingot && !Object.keys(nowh.r.toWh).length && same(nowh.save.v43.refunds43.items, { item_plank: 13, item_ingot: 6 }), nowh.r && nowh.r.coins);
  check('3: refunds43 says it (coins, items, wh, moved, kept) and the coins are in the wallet', room.save.v43.refunds43.coins === room.r.coins && same(room.save.v43.refunds43.wh, { item_plank: 20 }) && room.save.coins === sanitizeSave(fixtureSave('v43_reprice_room.json')).coins + room.r.coins);
  // D21: a finished hall / office keeps its old price
  const done = migrateSaveEx(Object.assign(clone(S46), { sites: Object.assign({}, S46.sites, { v42_office: { b: 'chief_office', st: 'done' } }) }));
  check('3: D21 — a finished hall and office are not repriced (no refund)', done.save && done.r.coins === 0 && !done.r.repriced.length);
  // remap43 itself
  const hand = { v: 8, coins: 10, sites: { w_hall: { b: 'big_restaurant', st: 'done' }, w_rest: { b: 'house_a', st: 'done' }, e_m1: { b: 'town_hall', st: 'done' }, e_m2: { b: 'town_hall', st: 'foundation', got: { item_plank: 40 } } }, progress: { flags: { rankEup: true } } };
  const h1 = RM.remap43(clone(hand));
  check('3: a mover that must stay keeps its own spot and nobody takes it (restaurant stays on w_hall: w_rest holds a house; then no hall may take w_hall)',
    h1.save.sites.w_hall.b === 'big_restaurant' && h1.save.sites.e_m1.b === 'town_hall' && h1.save.sites.e_m2.b === 'town_hall' && h1.r.kept.length === 3 && !h1.r.moved.length && RM.check43(hand, h1.save, h1.r).ok, h1.r.kept);
  check('3: a village already 읍 (flags.rankEup, or v4.rank 2) gets progress.flags.s4half; others do not', h1.save.progress.flags.s4half === true && RM.remap43({ v: 8, v4: { rank: 2 } }).save.progress.flags.s4half === true && !RM.remap43({ v: 8, progress: { flags: {} } }).save.progress.flags.s4half);
  check('3: unfinished hall planks above the need: got 40 -> 16, 24 as coins (no finished 창고)', h1.save.sites.e_m2.got.item_plank === 16 && h1.r.asCoins.item_plank === 24 && h1.r.coins === 1200 + 24 * P.item_plank);
  const whScaf = RM.remap43({ v: 8, sites: { w_hall: { b: 'town_hall', st: 'scaffold', got: { item_plank: 30, item_ingot: 10 } }, d_x: { b: 'warehouse', st: 'scaffold' } }, v3: { warehouse: {} } });
  check('3: a 창고 still being built takes nothing: the extras are coins', !Object.keys(whScaf.r.toWh).length && whScaf.r.asCoins.item_plank === 14);
  // check43 catches a remap that went wrong
  const base = MIGRATE[7](fixtureSave('v43_reprice_room.json'));
  const good = RM.remap43(base);
  const tamper = [
    ['a building vanished', (s) => { delete s.sites.d_tool; }],
    ['a building appeared', (s) => { s.sites.s_m2 = { b: 'house_a', st: 'done' }; }],
    ['coins off by one', (s) => { s.coins += 1; }],
    ['a workshop left behind', (s) => { s.sites.e_m1 = s.sites.d_tool; delete s.sites.d_tool; }],
    ['the 창고 got one more', (s) => { s.v3.warehouse.item_plank += 1; }],
    ['a pad payment changed', (s) => { s.progress.paid = Object.assign({}, s.progress.paid, { zzz: 5 }); }],
    ['a site kept extra planks', (s) => { s.sites.w_hall.got.item_plank += 1; }],
    ['the store stock changed', (s) => { s.v3.store.stock.item_can = (s.v3.store.stock.item_can || 0) + 1; }],
    ['no marker', (s) => { s.v43.lay = 1; }],
  ];
  const missed = tamper.filter(([, fn]) => { const s = clone(good.save); fn(s); return RM.check43(base, s, good.r).ok; }).map(([n]) => n);
  check('3: check43 passes the real remap and catches every tampered one (' + tamper.length + ' kinds)', RM.check43(base, good.save, good.r).ok && !missed.length, missed);
  const outS = sanitizeSave(good.save);
  const brokenOut = clone(outS); delete brokenOut.sites.d_wh;
  check('3: check43b passes sanitize\'s real output and catches a building it lost', RM.check43b(good.save, outS, SV.SITE_RULES).ok && !RM.check43b(good.save, brokenOut, SV.SITE_RULES).ok);
}

console.log('— 4 the failure path (V-N12 switch; Transfer migrateFail)');
{
  const raw = fixtureSave('v42_save_office_ttal.json');
  const a = migrateSaveEx(clone(raw), { fail: 'throw' }), b = migrateSaveEx(clone(raw), { fail: 'check' });
  check('4: opts.fail throw / check -> no save, fail { kind v43, reason }', !a.save && a.fail && a.fail.kind === 'v43' && /remap43 threw/.test(a.fail.reason) && !b.save && /check43/.test(b.fail.reason), [a.fail, b.fail]);
  globalThis.__FV_TEST_FAIL43 = 'check';
  const m = migrateSave(clone(raw));
  const keys = fixtureKeys('v42_village_late.json');
  const dr = T.dryRun(keys);
  delete globalThis.__FV_TEST_FAIL43;
  check('4: with the switch on, migrateSave gives null and Transfer.dryRun of that village\'s code gives migrateFail (with the reason)', m === null && !dr.ok && dr.error === 'migrateFail' && /check43/.test(dr.info.reason), dr);
  const dk = T.dryRun(fixtureKeys('v43_xl_swap_kept.json'));
  check('4: a code R43 cannot move (N3 fixture) -> migrateFail; a good old code dry-runs with summary.remap43', !dk.ok && dk.error === 'migrateFail' && (() => { const d = T.dryRun(fixtureKeys('v43_reprice_room.json')); return d.ok && d.summary.remap43 && d.summary.remap43.coins === 2600 + PRICE.item_plank + 10 * PRICE.item_ingot && d.summary.remap43.moved === 4; })());
  check('4: a step-B village dry-runs with no remap (summary.remap43 null)', (() => { const d = T.dryRun({ [SAVE_KEY]: JSON.stringify(SV.stamp(migrateSave(clone(raw)))) }); return d.ok && d.summary.remap43 === null; })());
  // Save.load: the hold
  const rawTxt = JSON.stringify(raw);
  for (const sw of ['throw', 'check']) {
    window.__FV_NO_SAVE = undefined;
    const st = memStorage({ [SAVE_KEY]: rawTxt, [CHAT_KEY]: 'chat-1' });
    window.localStorage = st;
    globalThis.__FV_TEST_FAIL43 = sw;
    const heard = [];
    const off = Save.onHold((why) => heard.push(why));
    const out = Save.load();
    delete globalThis.__FV_TEST_FAIL43;
    const w = [Save.write({ coins: 1 }), ChatSave.write('abcd', { a: 1 })];
    Save.quarantine();
    const d = st.dump();
    check('4: Save.load with the switch "' + sw + '": null, held failed43 (Save.failed.reason), lastUnreadable; the pre-B copy kept; every write refused; SAVE_KEY / chat byte-identical; no quarantine',
      out === null && Save.held === 'failed43' && Save.failed && Save.failed.kind === 'v43' && Save.failed.at === 'load' && Save.lastUnreadable === true && same(heard, ['failed43']) && d[SV.PRE43_KEY] === rawTxt && d[SAVE_KEY] === rawTxt && d[CHAT_KEY] === 'chat-1' && w.every((x) => x === false) && !d[BAD_KEY] && !d[BACKUP_KEY],
      { held: Save.held, failed: Save.failed, keys: Object.keys(d) });
    off();
    Save.release();
  }
  // G8 in Node: every pre-B fixture x { throw, check }: no save, Transfer refuses, Save.load holds it byte-identical
  {
    const g8 = [];
    for (const f of PREB) {
      const keys = fixtureKeys(f);
      for (const sw of ['throw', 'check']) {
        globalThis.__FV_TEST_FAIL43 = sw;
        window.__FV_NO_SAVE = undefined;
        const st = memStorage(keys);
        window.localStorage = st;
        const out = Save.load();
        const w = Save.write({ coins: 1 });
        const dr = T.dryRun(keys);
        delete globalThis.__FV_TEST_FAIL43;
        if (out !== null || Save.held !== 'failed43' || w !== false || st.getItem(SAVE_KEY) !== keys[SAVE_KEY] || st.getItem(SV.PRE43_KEY) !== keys[SAVE_KEY] || dr.error !== 'migrateFail') g8.push(f + '/' + sw);
        Save.release();
      }
    }
    check('4 (G8, Node): every pre-B fixture (' + PREB.length + ') x { throw, check }: Save.load holds it (SAVE_KEY byte-identical, PRE43 = the stored text, writes refused); Transfer.dryRun -> migrateFail', !g8.length, g8);
  }
  // a good old village: pending until Game.build confirms
  {
    window.__FV_NO_SAVE = undefined;
    const st = memStorage({ [SAVE_KEY]: rawTxt });
    window.localStorage = st;
    const out = Save.load();
    const pend = [Save.pending43, Save.remapped, Save.held];
    const w0 = Save.write({ coins: 5 }), c0 = ChatSave.write('abcd', { a: 1 });
    const stored0 = st.getItem(SAVE_KEY);
    Save.confirm43();
    const w1 = Save.write(Object.assign({}, out, { coins: 6 }));
    check('4: a good old village: loaded remapped (Save.remapped, Save.remap), writes refused while pending43 (nothing stored), written after confirm43',
      out && out.v43.lay === 2 && same(pend, [true, true, null]) && Save.remap && Save.remap.moved.length === 4 && w0 === false && c0 === false && stored0 === rawTxt && w1 === true && JSON.parse(st.getItem(SAVE_KEY)).v43.lay === 2 && st.getItem(SV.PRE43_KEY) === rawTxt,
      { pend, w0, c0, w1 });
    // failWith after a load: the stored village stays, the hold starts
    const st2 = memStorage({ [SAVE_KEY]: rawTxt });
    window.localStorage = st2;
    Save.load();
    Save.failWith('skip', 'd_tool');
    const w2 = Save.write({ coins: 7 });
    check('4: Save.failWith("skip") on a pending village: held failed43 (reason "skip: d_tool", at build), the write refused, SAVE_KEY byte-identical', Save.held === 'failed43' && /^skip: d_tool/.test(Save.failed.reason) && Save.failed.at === 'build' && !Save.pending43 && w2 === false && st2.getItem(SAVE_KEY) === rawTxt);
    Save.release();
    // Save.clear while failed43: the stored village is copied first (G-11)
    Save.load();
    Save.failWith('restore', new Error('x'));
    Save.clear();
    check('4: 「새 마을로 시작」 while failed43: the stored village goes to the backup slot first, then the hold lifts', st2.getItem(BACKUP_KEY) === rawTxt && !st2.getItem(SAVE_KEY) && Save.held === null && st2.getItem(SV.PRE43_KEY) === rawTxt);
    window.__FV_NO_SAVE = undefined;
  }
  delete window.localStorage;
}

console.log('— 11 pre43');
{
  const { keepPre43, PRE43_KEY, PRE43_SLOTS } = SV;
  const st = memStorage({});
  const a = '{"v":7,"t":1,"coins":5}', b = '{"v":8,"t":2,"coins":6}', c = '{"v":8,"t":3,"coins":7}';
  const r1 = keepPre43(st, a), r1b = keepPre43(st, a), r2 = keepPre43(st, b), r2b = keepPre43(st, b), r3 = keepPre43(st, c);
  check('11: keepPre43 writes once, byte-identical; the same village again: nothing new; a second village -> .2; a third: nowhere (nothing overwritten)',
    r1 === PRE43_KEY && r1b === PRE43_KEY && r2 === PRE43_KEY + '.2' && r2b === PRE43_KEY + '.2' && r3 === null && st.getItem(PRE43_KEY) === a && st.getItem(PRE43_KEY + '.2') === b && same(PRE43_SLOTS, [PRE43_KEY, PRE43_KEY + '.2']), [r1, r2, r3]);
  const full = memStorage({}, { quota: 10 });
  check('11: keepPre43 never throws (a full storage, no storage, no text)', keepPre43(full, a) === null && keepPre43(null, a) === null && keepPre43(st, '') === null && keepPre43(st, null) === null);
  check('11: neither slot is a game key (never in a code)', PRE43_SLOTS.every((k) => !T.isGameKey(k)));
  // applyVillage leaves them in place
  window.__FV_NO_SAVE = undefined;
  const st2 = memStorage({ [SAVE_KEY]: '{"v":8,"lv":43,"t":1,"coins":1}', [PRE43_KEY]: a, [PRE43_KEY + '.2']: b, 'frostVillage.title.v1': '{}' });
  const res = await T.applyVillage({ [SAVE_KEY]: '{"v":8,"lv":43,"t":2,"coins":9}' }, { storage: st2 });
  check('11: 불러오기 (applyVillage) leaves both pre43 slots as they are (and removes the old game keys the new village lacks)', res.ok && st2.getItem(PRE43_KEY) === a && st2.getItem(PRE43_KEY + '.2') === b && !st2.getItem('frostVillage.title.v1'), res);
  window.__FV_NO_SAVE = undefined;
  // a pre-B village's code is format 1 (an older build may read it); a step-B one format 2
  const pre = await T.encodeVillage({ [SAVE_KEY]: a }, { fmt: 1 }), now = await T.encodeVillage({ [SAVE_KEY]: '{"v":8,"lv":43}' }), odd = await T.encodeVillage({ [SAVE_KEY]: a }, { fmt: 7 });
  const dpre = await T.decodeVillage(pre.code);
  check('11: encodeVillage fmt 1 -> SNOWBLOOM1 (read back here); anything else -> SNOWBLOOM2', /^SNOWBLOOM1\./.test(pre.code) && dpre.ok && dpre.keys[SAVE_KEY] === a && /^SNOWBLOOM2\./.test(now.code) && /^SNOWBLOOM2\./.test(odd.code));
}

console.log('— 12 [P-GATE] NEW43 = the live price (must stay green from P\'s merge on)');
let pending = 0;
{
  const H = { get(t, k) { if (k === Symbol.toPrimitive) return () => 0; if (!(k in t)) t[k] = new Proxy(function () {}, H); return t[k]; }, construct() { return new Proxy({}, H); }, apply() { return new Proxy(function () {}, H); } };
  if (!globalThis.Phaser) globalThis.Phaser = new Proxy(function () {}, H);
  const { buildCost } = await import('../../src/entities/Site.js');
  const pick = (c) => ({ coins: c.coins, item_plank: c.item_plank || 0, item_ingot: c.item_ingot || 0, time: c.time });
  const live = { town_hall: pick(buildCost('town_hall', 'w_hall')), chief_office: pick(buildCost('chief_office', 'v42_office')) };
  const plan = { town_hall: pick(RM.NEW43('town_hall')), chief_office: pick(RM.NEW43('chief_office')) };
  const old = { town_hall: pick(RM.OLD43.town_hall), chief_office: pick(RM.OLD43.chief_office) };
  const ok = same(live, plan);
  const beforeP = same(live, old);
  if (!ok && beforeP && !argv.includes('--p-gate')) {
    pending++;
    console.log('  PENDING [P-GATE] Site.buildCost still gives the pre-B prices (hall ' + live.town_hall.coins + ', office ' + live.chief_office.coins + '): P is not merged. From P\'s merge on this must read hall 1200 + 16 + 4, office 400 + 8 + 0 (NEW43, Remap43.js); run with --p-gate to make it hard');
  } else {
    check('12 [P-GATE]: NEW43(b) === Site.buildCost(b) for the hall (1,200 + 16 + 4) and the office (400 + 8): the remap repriced to what the game charges', ok, { live, plan });
  }
}

delete globalThis.window;
if (!NODE_ONLY) await browserPart();
console.log('\nsave_v43: ' + passed + ' passed, ' + fails.length + ' failed' + (pending ? ', ' + pending + ' pending (P-GATE: P not merged)' : ''));
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
    // (--s4-only: the R43 rows below only, without B4a–c)
    if (!argv.includes('--s4-only')) {
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
    }

    // ============================================================ S4: R43 in the real game (map_save §6.1 B1–B3, B5)
    const ALL_B1 = argv.includes('--b1-all');
    const G8_ALL = argv.includes('--g8-all');
    const have = (f) => fs.existsSync(path.join(FIX, f));
    const keysOf = (f) => fixtureKeys(f);
    // (the remap's event: the game's own serialize at the moment R43's village stands, before any game time — the census)
    const armRemapSnap = (page) => page.evaluate(() => { window.__remapSnap = null; window.__FV43.on('remap', (d) => { try { window.__remapSnap = { d, s: window.__FV.game.scene.getScene('Game').serialize() }; } catch (e) { window.__remapSnap = { d, err: String(e) }; } }); });
    const bootArmed = async (page) => {
      await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title') && window.__FV43, 180000);
      await armRemapSnap(page);
      await sleep(400);
      await startGame(page);
      await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 180000);
      await sleep(800);
      await installStepper(page);
    };
    const gameView = (page) => page.evaluate(() => {
      const gs = window.__FV.scene;
      const sites = {};
      for (const id in gs.sites) { const s = gs.sites[id]; if (s.state !== 'plot') sites[id] = { b: s.building, st: s.state, shown: !!s.shown }; }
      return { sites, skipped: (gs.restoreSkipped || []).slice(), held: window.__FV_SAVE_HELD || null, onb: gs.onboard ? gs.onboard.mode || null : null, maker: !!(gs.flags && gs.flags.mk), v43: gs.v43, remapEv: (window.__FV43.recent() || []).filter((e) => e.name === 'remap').map((e) => e.data && e.data.ok), snap: window.__remapSnap };
    });

    // ---------------- B1: each pre-B fixture boots remapped
    console.log('— B1: old villages boot on the new map');
    const B1 = PREB.filter((f) => !expectFail(f) && (ALL_B1 || /^(v35_save_38min|v41_save_smart_46min|v42_save_office_ttal|v42_village_late|v43a2_bread|v43a1_village|v43_xl_swap_both|v43_reprice_room|v4202_|v421_|v43a22_|v43a3_)/.test(f)));
    const b1bad = { boot: [], sites: [], shown: [], census: [], stored: [], again: [], ui: [] };
    const b1conv = [];
    for (const f of B1) {
      const keys = keysOf(f);
      const raw = keys[SAVE_KEY];
      const mig = migrateSaveEx(JSON.parse(raw));
      const P = await newPage(keys, { viewport: { width: 360, height: 640 }, dpr: 1 });
      try {
        await bootArmed(P.page);
        const v = await gameView(P.page);
        if (!(v.remapEv.length === 1 && v.remapEv[0] === true && !v.held && v.v43 && v.v43.lay === 2 && !v.skipped.length)) b1bad.boot.push(f + ' ' + JSON.stringify({ ev: v.remapEv, held: v.held, skipped: v.skipped }));
        if (v.onb && v.onb !== 'off' || v.maker) b1bad.ui.push(f + ' onb ' + v.onb + ' maker ' + v.maker);
        // every site of the remapped save stands, as saved, and is shown (BP-17)
        const want = mig.save.sites;
        const miss = Object.keys(want).filter((id) => !v.sites[id] || v.sites[id].b !== want[id].b || (want[id].st === 'done') !== (v.sites[id].st === 'done'));
        const extra = Object.keys(v.sites).filter((id) => !want[id]);
        if (miss.length || extra.length) b1bad.sites.push(f + ' miss ' + miss.join(',') + ' extra ' + extra.join(','));
        const hidden = Object.keys(v.sites).filter((id) => !v.sites[id].shown);
        if (hidden.length) b1bad.shown.push(f + ': ' + hidden.join(','));
        // census: the game's own serialize as the remapped village stands = the Node census of the remapped save
        if (!v.snap || !v.snap.s) b1bad.census.push(f + ' no snapshot ' + (v.snap && v.snap.err));
        else {
          const cG = census(v.snap.s), cN = census(mig.save);
          const dk = Object.keys(Object.assign({}, cG.items, cN.items)).filter((k) => (cG.items[k] || 0) !== (cN.items[k] || 0));
          // (a3's own load steps may pay goods that find no room — an old shop's bread, an old trade post's goods — into a till
          //  at today's price: an item may only turn into exactly its price in coins, nothing may appear or vanish)
          const more = dk.filter((k) => (cG.items[k] || 0) > (cN.items[k] || 0));
          const paid = dk.reduce((n, k) => n + Math.max(0, (cN.items[k] || 0) - (cG.items[k] || 0)) * (/^item_/.test(k) ? priceOf(k) : NaN), 0);
          if (more.length || cG.coins - cN.coins !== paid) b1bad.census.push(f + ' coins ' + cN.coins + ' -> ' + cG.coins + ' items ' + JSON.stringify(dk.map((k) => [k, cN.items[k] || 0, cG.items[k] || 0])).slice(0, 300));
          else if (dk.length) b1conv.push(f.replace(/\.json$/, '') + ': ' + dk.map((k) => k + ' ' + ((cN.items[k] || 0) - (cG.items[k] || 0))).join(', ') + ' -> +' + paid + ' coins');
        }
        // a few seconds later the village is stored on the new map (lay 2, lv 43); the pre-B text is kept as it was
        await advance(P.page, 6);
        const st = await stored(P.page);
        const now = JSON.parse(st[SAVE_KEY] || 'null');
        if (!(now && now.lv === 43 && now.v43 && now.v43.lay === 2 && st[SV.PRE43_KEY] === raw)) b1bad.stored.push(f + ' ' + JSON.stringify({ lv: now && now.lv, lay: now && now.v43 && now.v43.lay, pre43: st[SV.PRE43_KEY] === raw }));
        // the next start: no remap again
        await P.page.reload({ waitUntil: 'load' });
        await bootArmed(P.page);
        const v2 = await gameView(P.page);
        if (v2.remapEv.length || v2.held || !v2.v43 || !v2.v43.refunds43 || (await stored(P.page))[SV.PRE43_KEY] !== raw) b1bad.again.push(f + ' ' + JSON.stringify({ ev: v2.remapEv, held: v2.held }));
        if (f === 'v43_reprice_room.json') { await render(P.page); await shot(P.page, 'b1_reprice_room_360x640'); }
      } catch (e) { b1bad.boot.push(f + ' threw ' + String(e && e.message).slice(0, 160)); }
      errs.push(...P.log.errors);
      await P.ctx.close();
    }
    console.log('       booted: ' + B1.map((f) => f.replace(/\.json$/, '')).join(' · '));
    if (b1conv.length) console.log('       (a3 load steps paid goods into a till at price: ' + b1conv.join(' · ') + ')');
    check('B1: every old village loads remapped once (EV43.remap ok, no hold, lay 2, restoreSkipped empty) — ' + B1.length + ' fixtures', !b1bad.boot.length, b1bad.boot);
    check('B1: no first-run tutorial and no flag maker on an old village', !b1bad.ui.length, b1bad.ui);
    check('B1: every site of the remapped save stands as saved (workshops on d_*, hall w_hall, restaurant w_rest), nothing more', !b1bad.sites.length, b1bad.sites);
    check('B1: every restored site is shown (BP-17)', !b1bad.shown.length, b1bad.shown);
    check('B1: the game\'s census as the village stands = the Node census of the remapped save (coins + items over every place; a3\'s load steps may only pay goods into a till at their price)', !b1bad.census.length, b1bad.census);
    check('B1: then stored on the new map ({"v":8,"lv":43, lay 2); PRE43 holds the stored pre-B text byte for byte', !b1bad.stored.length, b1bad.stored);
    check('B1: the next start does not remap again (no event, refunds43 kept, PRE43 unchanged)', !b1bad.again.length, b1bad.again);

    // ---------------- B2: forced failure (G8): the stored village never changes
    console.log('— B2: a move that fails (G8, __FV_TEST_FAIL43)');
    const G8 = G8_ALL ? PREB.filter((f) => !expectFail(f)) : ['v42_village_late.json', 'v43_reprice_room.json'].concat(['v4202_46min_admin.json', 'v43a3_late.json'].filter(have));
    const b2bad = { card: [], same: [], code: [], misc: [] };
    let shotDone = false;
    for (const f of G8) {
      for (const sw of G8_ALL ? ['throw', 'check'] : [f === 'v43_reprice_room.json' ? 'throw' : 'check']) {
        const keys = Object.assign({}, keysOf(f));
        // (BP-15) an OLDER village in PRE43 already: the card's code must still be the stored one
        keys[SV.PRE43_KEY] = '{"v":7,"t":1,"coins":5,"note":"an older village"}';
        const P = await newPage(keys, { viewport: { width: 390, height: 844 }, dpr: 1, init: `window.__FV_TEST_FAIL43 = ${JSON.stringify(sw)};` });
        try {
          await bootArmed(P.page);
          const s0 = await stored(P.page);
          await advance(P.page, 1);
          const c = await card(P.page);
          const which = await P.page.evaluate(() => (document.getElementById('fh-which') || {}).textContent || '');
          if (!(c.card && c.kind === 'fail' && /새 지도로 옮기지 못했어요/.test(c.title) && c.held === 'failed43' && c.uiInput === false && /문제: /.test(which) && !c.maker && (c.onb === null || c.onb === 'off'))) b2bad.card.push(f + '/' + sw + ' ' + JSON.stringify({ card: c.card, kind: c.kind, held: c.held, which }));
          if (!shotDone) { await render(P.page); await shot(P.page, 'fail_390x844_ko'); shotDone = true; }
          await advance(P.page, 60);
          await hide(P.page);
          await sleep(300);
          await P.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); });
          const s1 = await stored(P.page);
          if (!(s1[SAVE_KEY] === keys[SAVE_KEY] && same(s1, s0) && !s1[BAD_KEY] && !s1[BACKUP_KEY] && s1[SV.PRE43_KEY] === keys[SV.PRE43_KEY])) b2bad.same.push(f + '/' + sw + ' changed ' + Object.keys(Object.assign({}, s0, s1)).filter((k) => s0[k] !== s1[k]).join(','));
          // 「마을 코드 만들기」: the STORED keys (BP-15), a format-1 code (a pre-B village)
          await click(P.page, 'fh-b2');
          await waitFor(P.page, () => { const t = document.getElementById('fm-code-out'); return t && /SNOWBLOOM\d\./.test(t.value); }, 30000);
          const code = await P.page.evaluate(() => document.getElementById('fm-code-out').value);
          const dc = await T.decodeVillage(code);
          const dr = dc.ok ? T.dryRun(dc.keys) : null;
          if (!(dc.ok && dc.keys[SAVE_KEY] === keys[SAVE_KEY] && /SNOWBLOOM1\./.test(code) && dr && dr.ok && dr.summary.remap43)) b2bad.code.push(f + '/' + sw + ' ' + JSON.stringify({ ok: dc.ok, same: dc.ok && dc.keys[SAVE_KEY] === keys[SAVE_KEY], fmt1: /SNOWBLOOM1\./.test(code), dr: dr && (dr.error || !!dr.summary.remap43) }));
          await P.page.evaluate(() => document.getElementById('fm-close').click());
          // with the switch, the same code in this page's 불러오기 dry run: migrateFail (Transfer refuses it)
          const inPage = await P.page.evaluate(async (cd) => { const T2 = await import(new URL('src/core/Transfer.js', location.href).href); const d = await T2.decodeVillage(cd); return d.ok ? T2.dryRun(d.keys).error || 'ok' : 'decode ' + d.error; }, code);
          if (inPage !== 'migrateFail') b2bad.misc.push(f + '/' + sw + ' in-page dryRun ' + inPage);
        } catch (e) { b2bad.card.push(f + '/' + sw + ' threw ' + String(e && e.message).slice(0, 160)); }
        errs.push(...P.log.errors.filter((x) => !/test switch/.test(x)));
        await P.ctx.close();
      }
    }
    console.log('       G8 boots: ' + G8.map((f) => f.replace(/\.json$/, '')).join(' · ') + (G8_ALL ? ' (× throw, check)' : ''));
    check('B2: the failure card shows (「마을을 새 지도로 옮기지 못했어요」, the 문제 line), held failed43, input off, no tutorial / flag maker', !b2bad.card.length, b2bad.card);
    check('B2: every stored key byte-identical after 60 s of game time + visibilitychange / pagehide; no .bad, no backup; the older PRE43 untouched', !b2bad.same.length, b2bad.same);
    check('B2: 「마을 코드 만들기」 gives the STORED village (never the older PRE43, BP-15) as a format-1 code that dry-runs (and remaps) without the switch', !b2bad.code.length, b2bad.code);
    check('B2: with the switch on, the same code\'s 불러오기 dry run is refused with migrateFail', !b2bad.misc.length, b2bad.misc);

    // ---------------- B3: the remapped village cannot be built (restore throw / a skipped site)
    console.log('— B3: a remapped village that cannot be built');
    for (const sw of ['restore', 'skip']) {
      const keys = keysOf('v42_village_late.json');
      const P = await newPage(keys, { viewport: { width: 390, height: 844 }, dpr: 1, init: `window.__FV_TEST_FAIL43 = ${JSON.stringify(sw)};` });
      try {
        await waitFor(P.page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title') && window.__FV43, 180000);
        await armRemapSnap(P.page);
        await sleep(400);
        await startGame(P.page);
        await waitFor(P.page, () => window.__FV.game.scene.isActive('UI') && window.__FV.scene && window.__FV.scene.player && window.__FV_SAVE_HELD, 180000);
        await sleep(800);
        await installStepper(P.page);
        await advance(P.page, 20);
        await hide(P.page);
        await sleep(300);
        const c = await card(P.page);
        const s = await stored(P.page);
        const which = await P.page.evaluate(() => (document.getElementById('fh-which') || {}).textContent || '');
        check('B3 (' + sw + '): the failure card (「' + (sw === 'restore' ? 'restore' : 'skip') + '」 in its 문제 line), no quarantine (.bad untouched), SAVE_KEY byte-identical after 20 s + pagehide, the bus said remap { ok: false }',
          c.card && c.kind === 'fail' && c.held === 'failed43' && new RegExp(sw).test(which) && !s[BAD_KEY] && s[SAVE_KEY] === keys[SAVE_KEY] && s[SV.PRE43_KEY] === keys[SAVE_KEY] && (sw === 'restore' || (await P.page.evaluate(() => window.__FV43.recent().some((e) => e.name === 'remap' && e.data && e.data.ok === false)))),
          { card: c.card, held: c.held, which, bad: !!s[BAD_KEY], same: s[SAVE_KEY] === keys[SAVE_KEY] });
      } catch (e) { check('B3 (' + sw + ') ran', false, String(e && e.message).slice(0, 200)); }
      errs.push(...P.log.errors.filter((x) => !/test switch/.test(x)));
      await P.ctx.close();
    }

    // ---------------- B5: 마을 옮기기 with old / newer / unmovable codes; the 「새 단장 전 마을」 rows
    console.log('— B5: 마을 옮기기');
    {
      const P = await newPage(keysOf('v42_village_late.json'), { viewport: { width: 390, height: 844 }, dpr: 2 });
      await boot(P.page);
      await advance(P.page, 6);
      const openMove = async (tab) => {
        await P.page.evaluate((tb) => { window.__FV.lastMoveCode = null; const ui = window.__FV.game.scene.getScene('UI'); ui.movePanel = null; return import(new URL('src/scenes/MovePanel.js', location.href).href).then((m) => m.openMovePanel(ui, tb)); }, tab || 'out');
        await waitFor(P.page, () => window.__FV.moveOpen === true, 10000);
      };
      await openMove('out');
      await waitFor(P.page, () => window.__FV.lastMoveCode && document.getElementById('fm-code-out').value.length > 50, 30000);
      const out0 = await P.page.evaluate(() => ({ code: document.getElementById('fm-code-out').value, pre: !document.getElementById('fm-pre43').hidden, rows: document.getElementById('fm-pre43').innerText }));
      check('B5: after the move, 내보내기 makes a format-2 code of the village now and lists 「새 단장 전 마을」 with its save time', /SNOWBLOOM2\./.test(out0.code) && out0.pre && /새 단장 전 마을/.test(out0.rows) && /예전 지도/.test(out0.rows), out0.rows.slice(0, 120));
      await render(P.page);
      await shot(P.page, 'move_pre43_390x844_ko');
      await P.page.click('#fm-pre43-1');
      await waitFor(P.page, () => window.__FV.lastMoveCode && window.__FV.lastMoveCode.src && document.getElementById('fm-code-out').value.length > 50, 30000);
      const pc = await P.page.evaluate(() => ({ code: document.getElementById('fm-code-out').value, back: !document.getElementById('fm-pre43-back').hidden, lead: document.querySelector('#fm-view-out .fm-p').textContent }));
      const dpc = await T.decodeVillage(pc.code);
      const raw0 = keysOf('v42_village_late.json')[SAVE_KEY];
      check('B5: 「이 마을 코드 만들기」: a format-1 code whose save is the pre-B text byte for byte (the other keys of now), headed 새 단장 전 마을; 「지금 마을 코드 보기」 goes back',
        dpc.ok && dpc.keys[SAVE_KEY] === raw0 && /SNOWBLOOM1\./.test(pc.code) && /새 단장 전 마을 코드/.test(pc.code.split('\n')[0]) && pc.back && /예전 버전/.test(pc.lead), { ok: dpc.ok, head: pc.code.split('\n')[0] });
      await P.page.click('#fm-pre43-back');
      await waitFor(P.page, () => window.__FV.lastMoveCode && !window.__FV.lastMoveCode.src, 30000);
      // 불러오기
      await P.page.click('#fm-tab-in');
      const tryCode = async (text) => {
        await P.page.fill('#fm-code-in', text);
        await P.page.evaluate(() => { window.__FV.lastMoveCheck = null; });
        await P.page.click('#fm-load');
        await waitFor(P.page, () => window.__FV.lastMoveCheck, 30000);
        await sleep(100);
        return P.page.evaluate(() => ({ check: window.__FV.lastMoveCheck, msg: document.getElementById('fm-msg-in').textContent, card: !document.getElementById('fm-confirm').hidden, cardText: document.getElementById('fm-confirm').innerText }));
      };
      const enc = async (keys, o) => (await T.encodeVillage(keys, o)).code;
      const v7 = await tryCode(await enc(keysOf(have('v4202_25min.json') ? 'v4202_25min.json' : 'v42_village_late.json'), { fmt: 1 }));
      const rp = await tryCode(await enc(keysOf('v43_reprice_room.json'), { fmt: 1 }));
      check('B5: an old (v7) code and a reprice code are found, the card says they move onto the new map (and the coins back)', v7.check.ok && v7.card && /새 지도로 옮겨요/.test(v7.cardText) && rp.check.ok && /새 지도로 옮겨요: 건물 4채가 새 자리로 · 2,705코인을 돌려받아요/.test(rp.cardText), [v7.cardText.slice(0, 200), rp.cardText.slice(0, 200)]);
      if (have('v43a3_late.json')) { const a3 = await tryCode(await enc(keysOf('v43a3_late.json'), { fmt: 1 })); check('B5: an a3.1 code is found and moves', a3.check.ok && /새 지도로 옮겨요/.test(a3.cardText), a3.cardText.slice(0, 200)); }
      await P.page.click('#fm-no');
      const nw = await tryCode(await enc(keysOf('v43_newer_lv46.json')));
      const mf = await tryCode(await enc(keysOf('v43_xl_swap_kept.json'), { fmt: 1 }));
      check('B5: an lv 46 code -> newerSave text; a code R43 cannot move -> migrateFail text; nothing changed', !nw.check.ok && nw.check.error === 'newerSave' && /더 새 버전/.test(nw.msg) && !mf.check.ok && mf.check.error === 'migrateFail' && /새 지도로 옮기지 못했어요/.test(mf.msg) && (await stored(P.page))[SV.PRE43_KEY] === raw0, [nw.check, mf.check, mf.msg]);
      // a format-2 code reads; a format-3 one is 'newer'
      const c2 = await enc({ [SAVE_KEY]: (await stored(P.page))[SAVE_KEY] });
      const head = c2.split('.').slice(0, 3).join('.'), body = c2.slice(head.length + 1, c2.lastIndexOf('.'));
      const t3 = 'SNOWBLOOM3' + head.slice('SNOWBLOOM2'.length) + '.' + body;
      const c3 = t3 + '.' + T.crc32(t3);
      const r2 = await tryCode(c2), r3 = await tryCode(c3);
      check('B5: a SNOWBLOOM2 code is read; a SNOWBLOOM3 code answers "newer"', r2.check.ok && !r3.check.ok && r3.check.error === 'newer', [r2.check.ok, r3.check.error]);
      // import the reprice village for real: the page reloads into it, remapped with its refunds
      await P.page.click('#fm-no').catch(() => {});
      await tryCode(await enc(keysOf('v43_reprice_room.json'), { fmt: 1 }));
      await Promise.all([P.page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }), P.page.click('#fm-yes')]);
      await bootArmed(P.page);
      const v = await gameView(P.page);
      const sNow = await stored(P.page);
      check('B5: 바꾸기 with the old reprice village: it loads remapped (refunds43 2,705 coins), the 불러오기 spare holds the village before; PRE43 keeps the first pre-B village (no second copy needed: .2 holds the imported one)',
        v.remapEv.length === 1 && v.remapEv[0] === true && v.v43.refunds43 && v.v43.refunds43.coins === 2705 && sNow[SV.PRE43_KEY] === raw0 && sNow[SV.PRE43_KEY + '.2'] === keysOf('v43_reprice_room.json')[SAVE_KEY] && !!sNow[T.MOVE_BACKUP_KEY], { ev: v.remapEv, r: v.v43 && v.v43.refunds43, pre2: !!sNow[SV.PRE43_KEY + '.2'] });
      errs.push(...P.log.errors);
      await P.ctx.close();
    }
  } catch (e) {
    check('browser part ran to the end', false, String((e && e.stack) || e).slice(0, 600));
  }
  check('browser: 0 page errors', errs.length === 0, errs.slice(0, 5));
  await browser.close();
  await srv.close();
}
