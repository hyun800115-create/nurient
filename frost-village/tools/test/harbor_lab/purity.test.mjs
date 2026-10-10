// harbor_runtime layer rules (docs/v5_v8_plan.md §5.1): the model is pure (no Phaser, window, document, scenes,
// entities, systems); the view uses v4 entities / systems / core only as libraries and never another module;
// nothing in the harbour imports another module's internals.
//   nice -n 15 node --test tools/test/harbor_lab/purity.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './fake_env.mjs';

const H = path.join(ROOT, 'src', 'harbor');
const files = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, f));
const imports = (file) => Array.from(fs.readFileSync(file, 'utf8').matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)).map((m) => m[1]);
const code = (file) => fs.readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const OTHER = /src\/(story|missions|bank|vehicles|beach|city)\//;

test('model + data files are pure: no Phaser / window / document, no scenes / entities / systems', () => {
  const pure = files(path.join(H, 'model')).concat(['layout.js', 'tuning.js', 'save.js', 'strings.js'].map((f) => path.join(H, f)));
  for (const f of pure) {
    const rel = path.relative(ROOT, f);
    for (const imp of imports(f)) {
      const abs = path.resolve(path.dirname(f), imp);
      assert.ok(!/src\/(scenes|entities|systems|core)\//.test(abs + '/'), rel + ' imports ' + imp);
      assert.ok(!OTHER.test(abs + '/'), rel + ' imports another module: ' + imp);
    }
    const c = code(f);
    assert.ok(!/\bPhaser\b/.test(c), rel + ' uses Phaser');
    assert.ok(!/\bwindow\b|\bdocument\b|localStorage/.test(c), rel + ' uses the browser');
    assert.ok(!/Math\.random/.test(c), rel + ' uses Math.random (seeded streams only)');
  }
});

test('host imports only its own model / data (+ src/data); views import no other module', () => {
  for (const imp of imports(path.join(H, 'host.js'))) {
    const abs = path.resolve(H, imp);
    assert.ok(abs.startsWith(H) || /src\/data\//.test(abs), 'host.js imports ' + imp);
  }
  for (const f of files(path.join(H, 'view')).concat([path.join(H, 'index.js')])) for (const imp of imports(f)) {
    const abs = path.resolve(path.dirname(f), imp);
    assert.ok(!OTHER.test(abs + '/'), path.relative(ROOT, f) + ' imports another module: ' + imp);
  }
});
