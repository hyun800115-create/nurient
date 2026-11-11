// (v4.3 마을 깃발, src/flag) Node only:
//   node tools/test/flag.test.mjs
// 1 design.js: sanitizeFlag (a clean flag in, the same out; bad parts take the classic part; not a flag -> null; mk kept as
//   1 only), CLASSIC = red + yellow disc, 3000 random flags are valid and readable (emblem vs field contrast >= 2.1, pattern
//   vs field >= 1.45, the emblem on a cross >= 2.0 against it) and cover every shape / pattern / emblem / colour,
//   drawFlag / drawEmblem run every combination on a recording 2D context without throwing
// 2 strings: every key in ko and en, nothing English-only
// 3 Save: SAVE_VERSION stays 8; a save without `flag` stays without it; a flag is kept; a damaged one is mended or dropped;
//   300 fuzzed flags never throw
// 4 마을 옮기기 (Transfer.js): the flag rides in the code (encode -> decode -> dry run: summary.flag), markImported leaves it
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {}, removeItem: () => {} };
globalThis.window = globalThis.window || {};
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 400) : '')); } };

const D = await import(path.join(ROOT, 'src/flag/design.js'));
console.log('— design');
{
  const f = { s: 3, b: 7, p: 4, pc: 11, e: 12, ec: 2 };
  ok(JSON.stringify(D.sanitizeFlag(f)) === JSON.stringify(f), 'a clean flag comes back the same');
  const bad = D.sanitizeFlag({ s: 9, b: -1, p: '2', pc: 3.7, e: 'x', ec: 11, mk: true, junk: 1 });
  ok(bad && bad.s === 0 && bad.b === 0 && bad.p === 2 && bad.pc === 3 && bad.e === 1 && bad.ec === 11 && bad.mk === 1 && !('junk' in bad), 'bad parts take the classic part, mk kept as 1, junk dropped', bad);
  ok(D.sanitizeFlag(null) === null && D.sanitizeFlag([1, 2]) === null && D.sanitizeFlag('red') === null && D.sanitizeFlag({ q: 1 }) === null, 'not a flag -> null');
  ok(D.sanitizeFlag({ s: 1, mk: 2 }).mk === undefined, 'mk only as 1');
  ok(D.COLORS[D.CLASSIC.b].k === 'red' && D.COLORS[D.CLASSIC.ec].k === 'yellow' && D.EMBLEMS[D.CLASSIC.e] === 'disc' && D.SHAPES[D.CLASSIC.s] === 'rect' && D.PATTERNS[D.CLASSIC.p] === 'none', 'CLASSIC = today\'s red flag with the yellow disc');
  ok(D.SHAPES.length === 5 && D.PATTERNS.length === 6 && D.EMBLEMS.length === 14 && D.COLORS.length === 12, '5 shapes, 6 patterns, 13 emblems + none, 12 colours');
  let seed = 12345;
  const rng = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const seen = { s: new Set(), p: new Set(), e: new Set(), b: new Set(), ec: new Set() };
  let bad1 = [], worst = 99;
  for (let i = 0; i < 3000; i++) {
    const r = D.randomFlag(rng);
    const c = D.sanitizeFlag(r);
    if (!c || !D.sameFlag(c, r)) bad1.push(['invalid', r]);
    if (r.e && D.contrast(r.ec, r.b) < 2.1) bad1.push(['emblem', r]);
    if (r.p && D.contrast(r.pc, r.b) < 1.45) bad1.push(['pattern', r]);
    if (r.e && r.p === 4 && D.contrast(r.ec, r.pc) < 2.0) bad1.push(['cross', r]);
    if (r.e) worst = Math.min(worst, D.contrast(r.ec, r.b));
    for (const k in seen) seen[k].add(r[k]);
  }
  ok(bad1.length === 0, `3000 random flags valid and readable (worst emblem contrast ${worst.toFixed(2)})`, bad1.slice(0, 3));
  ok(seen.s.size === 5 && seen.p.size === 6 && seen.e.size === 14 && seen.b.size === 12 && seen.ec.size >= 10, 'random flags use every shape / pattern / emblem / field colour', Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, v.size])));
  // a recording 2D context
  const calls = { n: 0 };
  const ctx = new Proxy({}, { get(t, k) { if (k in t) return t[k]; if (k === 'createLinearGradient') return () => ({ addColorStop() {} }); return (...a) => { calls.n++; for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) throw new Error('NaN in ' + String(k)); }; }, set(t, k, v) { t[k] = v; return true; } });
  let thrown = null;
  try {
    for (let s = 0; s < 5; s++) for (let p = 0; p < 6; p++) for (let e = 0; e < 14; e++) {
      D.drawFlag(ctx, { s, b: (s + e) % 12, p, pc: (p + 3) % 12, e, ec: (e + 5) % 12 }, 2, 2, 120, 76, { skew: e % 2 ? 0.46 : 0 });
    }
    for (let e = 0; e < 14; e++) D.drawFlag(ctx, { s: 0, b: 0, p: 0, pc: 0, e, ec: 2 }, 0, 0, 64, 64, { parts: 'emblem' });
  } catch (e) { thrown = String(e && e.stack); }
  ok(!thrown && calls.n > 5000, `drawFlag: every shape x pattern x emblem draws (${calls.n} calls)`, thrown);
}

console.log('— strings');
{
  const S = await import(path.join(ROOT, 'src/flag/strings.js'));
  const ko = Object.keys(S.FLAG_STRINGS.ko), en = Object.keys(S.FLAG_STRINGS.en);
  const missEn = ko.filter((k) => typeof S.FLAG_STRINGS.en[k] !== 'string' || !S.FLAG_STRINGS.en[k].trim());
  const enOnly = en.filter((k) => !(k in S.FLAG_STRINGS.ko));
  ok(ko.length >= 20 && !missEn.length && !enOnly.length, `${ko.length} flag strings, each in ko and en`, { missEn, enOnly });
}

console.log('— save');
const SV = await import(path.join(ROOT, 'src/core/Save.js'));
const base = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'v41_save_smart_46min.json'), 'utf8'));
{
  ok(SV.SAVE_VERSION === 8, 'SAVE_VERSION stays 8');
  const a = SV.migrateSave(JSON.parse(JSON.stringify(base)));
  ok(a && a.flag === undefined, 'an old save (no flag) stays without one (the game shows the classic flag)');
  const f = { s: 1, b: 4, p: 5, pc: 2, e: 2, ec: 11 };
  const b = SV.migrateSave(Object.assign(JSON.parse(JSON.stringify(base)), { flag: f }));
  ok(b && D.sameFlag(b.flag, f) && b.flag.mk === undefined, 'a flag is kept', b && b.flag);
  const c = SV.migrateSave(Object.assign(JSON.parse(JSON.stringify(base)), { flag: Object.assign({ mk: 1 }, f) }));
  ok(c && c.flag.mk === 1, 'mk (the new-game maker still open) is kept');
  const d = SV.migrateSave(Object.assign(JSON.parse(JSON.stringify(base)), { flag: { s: 77, b: 4 } }));
  ok(d && d.flag && d.flag.s === 0 && d.flag.b === 4 && d.flag.e === 1, 'a damaged flag is mended part by part', d && d.flag);
  const e = SV.migrateSave(Object.assign(JSON.parse(JSON.stringify(base)), { flag: 'red' }));
  ok(e && e.flag === undefined && e.coins === a.coins, 'a flag that is not one is dropped, the rest of the save as before');
  let thrown = 0;
  const junk = [null, 0, -1, 1e9, 'x', [], {}, { s: NaN }, { s: Infinity }, { e: '13' }, { e: '999' }, true];
  for (let i = 0; i < 300; i++) {
    const fl = {};
    for (const k of ['s', 'b', 'p', 'pc', 'e', 'ec', 'mk']) if (Math.random() < 0.8) fl[k] = junk[Math.floor(Math.random() * junk.length)];
    try { const s = SV.migrateSave(Object.assign(JSON.parse(JSON.stringify(base)), { flag: Math.random() < 0.1 ? junk[i % junk.length] : fl })); if (!s) thrown++; else if (s.flag && !D.sanitizeFlag(s.flag)) thrown++; } catch (err) { thrown++; }
  }
  ok(thrown === 0, '300 fuzzed flags never throw / break the save');
}

console.log('— 마을 옮기기');
{
  const T = await import(path.join(ROOT, 'src/core/Transfer.js'));
  const f = { s: 2, b: 8, p: 1, pc: 2, e: 13, ec: 2 };
  const keys = { [SV.SAVE_KEY]: JSON.stringify(Object.assign(JSON.parse(JSON.stringify(base)), { flag: f, onb: 3 })) };
  const enc = await T.encodeVillage(keys, { made: 1700000000000 });
  const dec = await T.decodeVillage('친구에게 보내는 코드\n' + enc.code);
  ok(dec.ok, 'the code decodes', dec.error);
  const dr = dec.ok ? T.dryRun(dec.keys, dec.payload.made) : null;
  ok(dr && dr.ok && D.sameFlag(dr.summary.flag, f) && D.sameFlag(dr.save.flag, f), 'the flag rides in the code: dry run + confirm card summary', dr && dr.summary && dr.summary.flag);
  const k2 = { [SV.SAVE_KEY]: keys[SV.SAVE_KEY] };
  T.markImported(k2);
  ok(D.sameFlag(JSON.parse(k2[SV.SAVE_KEY]).flag, f), 'markImported (a village from elsewhere) keeps its flag');
  const old = await T.decodeVillage((await T.encodeVillage({ [SV.SAVE_KEY]: JSON.stringify(base) })).code);
  const dro = T.dryRun(old.keys, 0);
  ok(dro.ok && dro.summary.flag === null, 'an old village\'s code: no flag in the summary (classic on arrival)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
