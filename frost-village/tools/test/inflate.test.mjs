// (v4.3 perf) src/core/inflate.js (raw DEFLATE for 마을 옮기기 on WebViews without DecompressionStream) against Node's
// zlib, on stored / fixed / dynamic blocks, every level, texts like a village code and random bytes; damaged data and
// the size limit must throw.   node tools/test/inflate.test.mjs
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRaw } from '../../src/core/inflate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const check = (name, ok, info = '') => { if (ok) pass++; else fail++; console.log((ok ? '  ok  ' : ' FAIL ') + name + (info !== '' ? '  — ' + info : '')); };
const same = (a, b) => a.length === b.length && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

const inputs = [
  ['empty', new Uint8Array(0)],
  ['one byte', new Uint8Array([65])],
  ['repeats (long matches)', new Uint8Array(70000).fill(97)],
  ['random 50 KB (stored blocks)', Uint8Array.from({ length: 50000 }, () => (rnd() * 256) | 0)],
  ['text', new TextEncoder().encode('행복한 눈꽃마을 이야기 '.repeat(500))],
];
// a real village save as JSON (what a 마을 옮기기 code carries)
for (const f of ['v41_save_smart_46min.json', 'v42_village_late.json']) {
  const p = path.join(HERE, 'fixtures', f);
  if (fs.existsSync(p)) inputs.push(['fixture ' + f, new Uint8Array(fs.readFileSync(p))]);
}
for (const [name, data] of inputs) {
  for (const level of [0, 1, 6, 9]) {
    const z = zlib.deflateRawSync(data, { level });
    let out = null, err = '';
    try { out = inflateRaw(new Uint8Array(z)); } catch (e) { err = e.message; }
    check(`${name}, level ${level} (${data.length} -> ${z.length} B)`, out && same(out, data), err);
  }
}
// fixed Huffman only (Z_FIXED)
{
  const data = new TextEncoder().encode(JSON.stringify({ a: Array.from({ length: 400 }, (_, i) => i % 17) }));
  const z = zlib.deflateRawSync(data, { strategy: zlib.constants.Z_FIXED });
  check('fixed Huffman blocks', same(inflateRaw(new Uint8Array(z)), data));
}
// damaged / too big
{
  const data = new TextEncoder().encode('snow '.repeat(3000));
  const z = new Uint8Array(zlib.deflateRawSync(data));
  let t1 = '';
  try { inflateRaw(z.subarray(0, z.length >> 1)); } catch (e) { t1 = e.message; }
  check('a cut code throws (damaged)', t1 === 'damaged', t1);
  let t2 = '';
  try { inflateRaw(z, 1000); } catch (e) { t2 = e.message; }
  check('over the limit throws (too big)', t2 === 'too big', t2);
  const bad = z.slice(); bad[0] = 0xff;
  let t3 = 'no throw';
  try { const o = inflateRaw(bad); t3 = same(o, data) ? 'same' : 'different'; } catch (e) { t3 = 'threw ' + e.message; }
  check('a flipped header byte never gives the original back', t3 !== 'same', t3);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
