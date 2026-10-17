// 금방 module layer rules (plan §12.1): the model and the data files are pure (no Phaser, window, document, timers,
// Math.random, wall time; no v4 scenes / entities / systems / core); the only other module they may import is the
// vehicles module's lane geometry (src/vehicles/model/{lanes,geom}.js, plan §5.5 "reuse the lane driver by import");
// the host imports only its own files + that lane graph; the views use v4 core (Assets / DepthSort) only as a
// library and never another module's internals; the lab and the tests never write under assets/.
//   nice -n 15 node --test tools/test/geumbang_lab/purity.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const H = path.join(ROOT, 'src', 'geumbang');
const files = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => path.join(dir, f)) : []);
const imports = (file) => Array.from(fs.readFileSync(file, 'utf8').matchAll(/^\s*import\s[^'"]*['"]([^'"]+)['"]/gm)).map((m) => m[1]);
const code = (file) => fs.readFileSync(file, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const OTHER = /src\/(story|missions|bank|harbor|beach|city|title|voice|chat)\//;
const VEH_OK = /src\/vehicles\/model\/(lanes|geom)\.js\/$/;

test('model + data files are pure', () => {
  const pure = files(path.join(H, 'model')).concat(['layout.js', 'tuning.js', 'save.js', 'strings.js'].map((f) => path.join(H, f)));
  for (const f of pure) {
    const rel = path.relative(ROOT, f);
    for (const imp of imports(f)) {
      const abs = path.resolve(path.dirname(f), imp) + '/';
      assert.ok(!/src\/(scenes|entities|systems|core|data)\//.test(abs), rel + ' imports ' + imp);
      assert.ok(!OTHER.test(abs), rel + ' imports another module: ' + imp);
      if (/src\/vehicles\//.test(abs)) assert.ok(VEH_OK.test(abs), rel + ' imports vehicles internals beyond the lane graph: ' + imp);
    }
    const c = code(f);
    assert.ok(!/\bPhaser\b/.test(c), rel + ' uses Phaser');
    assert.ok(!/\bwindow\b|\bdocument\b|localStorage|\bnavigator\b/.test(c), rel + ' uses the browser');
    assert.ok(!/Math\.random|Date\.now|performance\.now|setTimeout|setInterval/.test(c), rel + ' uses wall time or Math.random');
  }
});

test('host imports only its own files and the lane graph; no Phaser', () => {
  for (const imp of imports(path.join(H, 'host.js'))) {
    const abs = path.resolve(H, imp);
    assert.ok(abs.startsWith(H + path.sep) || VEH_OK.test(abs + '/'), 'host.js imports ' + imp);
  }
  assert.ok(!/\bPhaser\b/.test(code(path.join(H, 'host.js'))), 'host.js uses Phaser');
});

test('views and index import no other module and no v4 runtime systems / scenes / entities', () => {
  for (const f of files(path.join(H, 'view')).concat([path.join(H, 'index.js'), path.join(H, 'ports_v4.js')]).filter((x) => fs.existsSync(x))) {
    for (const imp of imports(f)) {
      const abs = path.resolve(path.dirname(f), imp) + '/';
      assert.ok(!OTHER.test(abs), path.relative(ROOT, f) + ' imports another module: ' + imp);
      if (/ports_v4\.js$/.test(f)) continue;           // the port adapter is the one file that knows v4.2 objects
      assert.ok(!/src\/(scenes|entities)\//.test(abs), path.relative(ROOT, f) + ' imports v4 runtime ' + imp);
      assert.ok(!/src\/systems\/(?!DepthSort)/.test(abs), path.relative(ROOT, f) + ' imports v4 systems ' + imp);
    }
  }
});

test('the lab and the tests only read the art (no writes under assets/ or src/ outside src/geumbang)', () => {
  const lab = path.join(ROOT, 'tools', 'test', 'geumbang_lab');
  for (const f of fs.readdirSync(lab).filter((x) => /\.(m?js)$/.test(x))) {
    const c = code(path.join(lab, f));
    assert.ok(!/writeFileSync\([^)]*assets/.test(c) && !/rmSync\([^)]*assets/.test(c), f + ' writes under assets/');
    assert.ok(!/writeFileSync\([^)]*['"]src\//.test(c), f + ' writes under src/');
  }
});
