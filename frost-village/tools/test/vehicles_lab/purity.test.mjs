// vehicles_runtime import hygiene (docs/v5_v8_plan.md §5.1): the model is pure (no Phaser, window, document, timers,
// clock, Math.random) and imports only src/data and its own files; the view never imports another module's
// internals; no v4 file imports the module yet (it is wired in after v4 ships).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './fake_env.mjs';

const SRC = path.join(ROOT, 'src');
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : d.name.endsWith('.js') ? [path.join(dir, d.name)] : []));
const importsOf = (f) => Array.from(fs.readFileSync(f, 'utf8').matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)).map((m) => path.resolve(path.dirname(f), m[1]));
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1').replace(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g, "''");

test('model + data files are pure', () => {
  const pure = files(path.join(SRC, 'vehicles', 'model')).concat(['layout.js', 'tuning.js', 'strings.js', 'save.js', 'host.js'].map((f) => path.join(SRC, 'vehicles', f)));
  for (const f of pure) {
    const code = strip(fs.readFileSync(f, 'utf8'));
    for (const bad of [/\bPhaser\b/, /\bwindow\b/, /\bdocument\b/, /\bsetTimeout\b/, /\bsetInterval\b/, /\bDate\.now\b/, /\bperformance\b/, /Math\.random/]) assert.ok(!bad.test(code), path.relative(ROOT, f) + ' uses ' + bad);
    for (const imp of importsOf(f)) {
      const rel = path.relative(SRC, imp);
      const ok = rel.startsWith('data' + path.sep) || rel.startsWith('vehicles' + path.sep);
      assert.ok(ok, path.relative(ROOT, f) + ' imports ' + rel);
      assert.ok(!rel.startsWith('vehicles' + path.sep + 'view'), path.relative(ROOT, f) + ' imports the view');
    }
  }
});

test('views import only v4 libraries and their own module', () => {
  for (const f of files(path.join(SRC, 'vehicles', 'view'))) {
    for (const imp of importsOf(f)) {
      const rel = path.relative(SRC, imp);
      const ok = rel.startsWith('vehicles' + path.sep) || rel.startsWith('core' + path.sep) || rel.startsWith('data' + path.sep) || /^systems[\\/](DepthSort|Effects)\.js$/.test(rel);
      assert.ok(ok, path.relative(ROOT, f) + ' imports ' + rel);
    }
  }
});

test('nothing in the game imports the module yet', () => {
  const users = files(SRC).filter((f) => !f.includes(path.sep + 'vehicles' + path.sep)).filter((f) => importsOf(f).some((i) => i.includes(path.sep + 'vehicles' + path.sep)));
  assert.deepEqual(users.map((f) => path.relative(ROOT, f)), []);
});
