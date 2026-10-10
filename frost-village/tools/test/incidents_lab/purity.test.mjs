// incidents_runtime layer rules (docs/v5_v8_plan.md §5.1): the model and data files are pure (no Phaser, window,
// document, scenes / entities / systems, no Math.random or Date); the host imports only its own files (+ src/data);
// the views use v4 core / systems only as libraries and never another module.
//   nice -n 15 node --test tools/test/incidents_lab/purity.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './fake_env.mjs';

const H = path.join(ROOT, 'src', 'city', 'incidents');
const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, f)) : []);
const imports = (file) => Array.from(fs.readFileSync(file, 'utf8').matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)).map((m) => m[1]);
const code = (file) => fs.readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const OTHER = /src\/(story|missions|bank|vehicles|harbor|beach|city\/logistics|kit)\//;

test('model + data files are pure', () => {
  const pure = files(path.join(H, 'model')).concat(['layout.js', 'tuning.js', 'save.js', 'strings.js'].map((f) => path.join(H, f)));
  assert.ok(pure.length >= 12);
  for (const f of pure) {
    const rel = path.relative(ROOT, f);
    for (const imp of imports(f)) {
      const abs = path.resolve(path.dirname(f), imp);
      assert.ok(!/src\/(scenes|entities|systems|core)\//.test(abs + '/'), rel + ' imports ' + imp);
      assert.ok(!OTHER.test(abs + '/'), rel + ' imports another module: ' + imp);
    }
    const c = code(f);
    assert.ok(!/\bPhaser\b/.test(c), rel + ' uses Phaser');
    assert.ok(!/\bwindow\s*[.[]|\bdocument\s*\.|localStorage/.test(c), rel + ' uses the browser');
    assert.ok(!/Math\.random|Date\.now|new Date|performance\.now/.test(c), rel + ' uses a clock or Math.random');
  }
});

test('host imports only its own files (+ src/data); views and index import no other module', () => {
  for (const imp of imports(path.join(H, 'host.js'))) {
    const abs = path.resolve(H, imp);
    assert.ok(abs.startsWith(H) || /src\/data\//.test(abs), 'host.js imports ' + imp);
  }
  for (const f of files(path.join(H, 'view')).concat([path.join(H, 'index.js')])) for (const imp of imports(f)) {
    const abs = path.resolve(path.dirname(f), imp);
    assert.ok(!OTHER.test(abs + '/'), path.relative(ROOT, f) + ' imports another module: ' + imp);
    assert.ok(!/src\/(scenes|entities)\//.test(abs + '/'), path.relative(ROOT, f) + ' imports a v4 scene / entity: ' + imp);
  }
});

test('nothing outside the module paths imports the module (it is not wired into v4 yet)', () => {
  const walk = (d, out = []) => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); const s = fs.statSync(p); if (s.isDirectory()) walk(p, out); else if (/\.js$/.test(n)) out.push(p); } return out; };
  for (const f of walk(path.join(ROOT, 'src'))) {
    if (f.startsWith(H)) continue;
    assert.ok(!/city\/incidents\//.test(fs.readFileSync(f, 'utf8')), path.relative(ROOT, f) + ' refers to src/city/incidents');
  }
});
