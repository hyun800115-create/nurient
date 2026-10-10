// Import hygiene for missions_bank (node --test tools/test/missions_lab/purity.test.mjs):
//   - the pure model files never touch Phaser, the DOM, the clock of the machine or a view file, so they run in Node,
//     in a Worker and in the tests exactly as in the game;
//   - nothing in src/missions/** or src/bank/** imports another v5 module or v4 game code except the few v4 helpers
//     the views are allowed to use (core/Assets, core/Panel, core/View, entities/Pad);
//   - every relative import resolves to a file that exists.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = path.join(ROOT, 'src');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const FILES = [...walk(path.join(SRC, 'missions')), ...walk(path.join(SRC, 'bank'))];
const rel = (p) => path.relative(SRC, p).split(path.sep).join('/');
const isView = (r) => /\/view\//.test(r) || /\/host\.js$/.test(r) || /^missions\/index\.js$/.test(r);
const PURE = FILES.filter((p) => !isView(rel(p)));

/** the code without comments and strings (so a word in a comment or a Korean line never trips the check) */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, "''");
}
const importsOf = (src) => Array.from(src.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"]([^'"]+)['"]/gm)).map((m) => m[1]);

test('pure model files: no Phaser, DOM, timers or wall clock, and no view imports', () => {
  assert.ok(PURE.length >= 14, 'pure files found: ' + PURE.length);
  const banned = [/\bPhaser\b/, /(?<![.\w])window(?!\s*:)\b/, /\bdocument\b/, /\blocalStorage\b/, /\bsetTimeout\b/, /\bsetInterval\b/, /\brequestAnimationFrame\b/, /\bDate\.now\s*\(/, /\bnew Date\s*\(\s*\)/, /\bperformance\.now\b/, /\bMath\.random\b/];
  for (const p of PURE) {
    const src = fs.readFileSync(p, 'utf8'), c = code(src), r = rel(p);
    for (const b of banned) assert.ok(!b.test(c), r + ' uses ' + b);
    for (const i of importsOf(src)) {
      assert.ok(i.startsWith('.'), r + ' imports a package: ' + i);
      const to = rel(path.resolve(path.dirname(p), i));
      assert.ok(!isView(to), r + ' imports a view / host: ' + to);
      assert.ok(/^(missions|bank)\//.test(to), r + ' imports game code: ' + to);
    }
  }
});

test('views and hosts import only their own module and the allowed v4 helpers', () => {
  // (index.js also reads BALANCE.v5 from data/balance.js, where the lead adds the v5 block (P20); view/ui.js takes
  // the game's FONT family from data/strings.js)
  const ALLOWED_V4 = new Set(['core/Assets.js', 'core/Panel.js', 'core/View.js', 'entities/Pad.js', 'data/balance.js', 'data/strings.js']);
  for (const p of FILES) {
    const src = fs.readFileSync(p, 'utf8'), r = rel(p);
    for (const i of importsOf(src)) {
      const to = rel(path.resolve(path.dirname(p), i));
      assert.ok(fs.existsSync(path.join(SRC, to)), r + ' → missing ' + to);
      if (/^(missions|bank)\//.test(to)) continue;
      assert.ok(ALLOWED_V4.has(to), r + ' imports v4 code outside the allowed helpers: ' + to);
    }
  }
});

test('no file outside src/missions and src/bank imports this module (it is wired in later, by patches)', () => {
  const others = walk(SRC).filter((p) => !/^(missions|bank)\//.test(rel(p)));
  for (const p of others) {
    const src = fs.readFileSync(p, 'utf8');
    for (const i of importsOf(src)) {
      const to = rel(path.resolve(path.dirname(p), i));
      assert.ok(!/^(missions|bank)\//.test(to), rel(p) + ' already imports ' + to + ' (the Integration patches say where it should)');
    }
  }
});
