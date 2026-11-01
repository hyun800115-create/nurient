// (v4.2.0.2) the game's own synchronous SHA-256 (src/core/sha256.js, used by 관리자 모드's PIN check), Node only:
//   node tools/test/sha256.test.mjs
// - the FIPS 180-4 / NIST CAVP examples: "", "abc", the 448-bit and 896-bit messages, one million "a"
// - the common "quick brown fox" pair, and every padding edge (lengths 0..130 bytes: 55 / 56 / 63 / 64 / 119 / 120 …)
// - 400 random strings (ASCII, Korean, emoji / surrogate pairs, a lone surrogate) agree with node:crypto byte for byte
// - utf8Bytes without TextEncoder (the hand-written path) gives the same bytes as TextEncoder
// - the admin salt + digest in src/systems/Admin.js have the right shape (the PIN itself is not known here, not searched)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const { sha256Hex, sha256Bytes, utf8Bytes } = await import(path.join(ROOT, 'src/core/sha256.js'));

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra) : '')); } };
const node = (s) => crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

console.log('NIST / FIPS 180-4 vectors');
const V = [
  ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
  ['abc', 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
  ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq', '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
  ['abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu', 'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1'],
  ['The quick brown fox jumps over the lazy dog', 'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592'],
  ['The quick brown fox jumps over the lazy dog.', 'ef537f25c895bfa782526529a9b63d97aa631564d5d789c2b765448c8635fb6c'],
];
for (const [m, h] of V) ok(sha256Hex(m) === h, JSON.stringify(m.length > 24 ? m.slice(0, 24) + '…' : m) + ' -> ' + h.slice(0, 16) + '…', sha256Hex(m));
{
  const a = 'a'.repeat(1000000);
  const t0 = Date.now();
  const h = sha256Hex(a);
  ok(h === 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0', 'one million "a" (' + (Date.now() - t0) + ' ms)', h);
}

console.log('padding edges (0..130 bytes)');
{
  const bad = [];
  for (let n = 0; n <= 130; n++) { const s = 'x'.repeat(n); if (sha256Hex(s) !== node(s)) bad.push(n); }
  ok(!bad.length, 'every length 0..130 agrees with node:crypto (55, 56, 63, 64, 119, 120 included)', bad);
  const bytes = Uint8Array.from({ length: 300 }, (_, i) => (i * 37 + 11) & 255);
  ok(Buffer.from(sha256Bytes(bytes)).toString('hex') === crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex'), 'raw bytes (all 256 byte values) agree with node:crypto');
}

console.log('random strings vs node:crypto');
{
  let seed = 20261101;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  const pools = ['0123456789', 'abcdefghijklmnopqrstuvwxyz:-_ ', '눈꽃마을관리자모드비밀번호', '😀🎄❄️🐶', '\u0000\u007f\u0080߿ࠀ￿'];
  const bad = [];
  for (let i = 0; i < 400; i++) {
    const n = Math.floor(rnd() * 90);
    let s = '';
    for (let k = 0; k < n; k++) { const p = pools[Math.floor(rnd() * pools.length)]; const cs = Array.from(p); s += cs[Math.floor(rnd() * cs.length)]; }
    if (sha256Hex(s) !== node(s)) bad.push(s);
  }
  ok(!bad.length, '400 random strings (digits, ASCII, Korean, emoji, edge code points)', bad.slice(0, 3));
  // the salt + digits shape the PIN check hashes (no real PIN: a few made-up ones)
  for (const d of ['0', '12', '000000', '987654321012']) ok(sha256Hex('snowbloom-admin-v1:' + d) === node('snowbloom-admin-v1:' + d), 'salt + "' + d + '" agrees');
}

console.log('utf8Bytes without TextEncoder');
{
  const TE = globalThis.TextEncoder;
  const samples = ['', 'abc', '관리자 모드', '😀 눈꽃 ❄️', 'a\ud800b', '\udc00', '߿ࠀ￿'];
  const want = samples.map((s) => Array.from(new TE().encode(s)).join(','));
  globalThis.TextEncoder = undefined;
  let got;
  try { got = samples.map((s) => Array.from(utf8Bytes(s)).join(',')); } finally { globalThis.TextEncoder = TE; }
  ok(want.every((w, i) => w === got[i]), 'the hand-written UTF-8 path gives TextEncoder\'s bytes (incl. lone surrogates -> U+FFFD)', got.filter((g, i) => g !== want[i]));
}

console.log('the admin constants');
{
  const src = fs.readFileSync(path.join(ROOT, 'src/systems/Admin.js'), 'utf8');
  const salt = /ADMIN_SALT\s*=\s*'([^']*)'/.exec(src), dg = /ADMIN_DIGEST\s*=\s*'([0-9a-f]*)'/.exec(src);
  ok(salt && salt[1] === 'snowbloom-admin-v1:', 'Admin.js salt is "snowbloom-admin-v1:"');
  ok(dg && dg[1] === 'd9f3df00a1f0341803ff8b72628fcc25bf81a2be7eb60806408e4c71ff71d1e7', 'Admin.js stores only the given digest (64 hex)');
  const code = src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  const panel = fs.readFileSync(path.join(ROOT, 'src/scenes/AdminPanel.js'), 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  ok(!/prompt\s*\(/.test(code + panel) && !/crypto\.subtle/.test(code + panel), 'no window.prompt / crypto.subtle in Admin.js or AdminPanel.js (comments aside)');
}

console.log('\nsha256: ' + pass + ' ok, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
