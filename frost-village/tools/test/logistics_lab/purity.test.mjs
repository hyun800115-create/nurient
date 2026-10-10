// logistics_runtime layer rules (docs/v5_v8_plan.md §5.1): the model and the data files are pure (no Phaser, window,
// document, timers, Math.random; no scenes / entities / systems / core); the host imports only its own model and
// data; the views use v4 core (Assets) only as a library and never another module; nothing imports another
// module's internals.
//   nice -n 15 node --test tools/test/logistics_lab/purity.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const H = path.join(ROOT, 'src', 'city', 'logistics');
const files = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, f));
const imports = (file) => Array.from(fs.readFileSync(file, 'utf8').matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)).map((m) => m[1]);
const code = (file) => fs.readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const OTHER = /src\/(story|missions|bank|vehicles|beach|harbor|title|voice)\/|src\/city\/(?!logistics\/)/;

test('model + data files are pure: no Phaser / window / document / timers / Math.random, no v4 runtime', () => {
  const pure = files(path.join(H, 'model')).concat(['layout.js', 'tuning.js', 'save.js', 'strings.js', 'fragments.js'].map((f) => path.join(H, f)));
  for (const f of pure) {
    const rel = path.relative(ROOT, f);
    for (const imp of imports(f)) {
      const abs = path.resolve(path.dirname(f), imp) + '/';
      assert.ok(!/src\/(scenes|entities|systems|core)\//.test(abs), rel + ' imports ' + imp);
      assert.ok(!OTHER.test(abs), rel + ' imports another module: ' + imp);
    }
    const c = code(f);
    assert.ok(!/\bPhaser\b/.test(c), rel + ' uses Phaser');
    assert.ok(!/\bwindow\b|\bdocument\b|localStorage|\bnavigator\b/.test(c), rel + ' uses the browser');
    assert.ok(!/Math\.random|Date\.now|performance\.now|setTimeout|setInterval/.test(c), rel + ' uses wall time or Math.random');
  }
});

test('host imports only its own model / data; views and index import no other module', () => {
  for (const imp of imports(path.join(H, 'host.js'))) {
    const abs = path.resolve(H, imp);
    assert.ok(abs.startsWith(H + path.sep), 'host.js imports ' + imp);
  }
  assert.ok(!/\bPhaser\b/.test(code(path.join(H, 'host.js'))), 'host.js uses Phaser');
  for (const f of files(path.join(H, 'view')).concat([path.join(H, 'index.js')])) for (const imp of imports(f)) {
    const abs = path.resolve(path.dirname(f), imp) + '/';
    assert.ok(!OTHER.test(abs), path.relative(ROOT, f) + ' imports another module: ' + imp);
    assert.ok(!/src\/(scenes|entities|systems)\//.test(abs), path.relative(ROOT, f) + ' imports v4 runtime ' + imp);
  }
});

test('the lab and the tests only read the art (no writes under assets/)', () => {
  const lab = path.join(ROOT, 'tools', 'test', 'logistics_lab');
  for (const f of fs.readdirSync(lab).filter((x) => /\.(m?js)$/.test(x))) {
    const c = code(path.join(lab, f));
    assert.ok(!/writeFileSync\([^)]*assets/.test(c) && !/rmSync\([^)]*assets/.test(c), f + ' writes under assets/');
  }
});
