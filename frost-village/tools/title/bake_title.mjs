// Title diorama bake — Node side.
//
//   node tools/title/bake_title.mjs                     full bake -> src/title/bake/ (webp atlases + title_bake.json)
//   node tools/title/bake_title.mjs --preview 1,2,3,4   layout check: stage composites -> --previewDir (default /tmp)
//   node tools/title/bake_title.mjs --out <dir>         write the bake somewhere else (e.g. assets/title_bake/)
//
// Runs tools/title/bake_page.js in headless Chromium with Phaser 3.90 and the game's REAL asset loader
// (src/core/Assets.js), so every picture is resolved exactly like the game does (fragment merge rules,
// later fragments win, anchors, anim frame lists). The page hands back trimmed PNG pieces; this script
// writes them to a work folder and calls tools/title/title_pack.py, which packs them into a few webp
// atlases per growth stage (so stage 1 can show while stages 2-4 still download) and writes the manifest
// the runtime (src/title/TitleDiorama.js) reads.
//
// Re-run after any change to src/title/layout.js or to the game art it uses. Deterministic output.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { start } from '../test/serve.mjs';
import { launch } from '../test/pw.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

const args = process.argv.slice(2);
const opt = (name, d) => { const i = args.indexOf('--' + name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : d; };
const OUT = path.resolve(ROOT, opt('out', 'src/title/bake'));
const WORK = path.resolve(opt('work', path.join(process.env.TMPDIR || '/tmp', 'title_bake_work')));
const PREVIEW = opt('preview', null);
const PREVIEW_DIR = path.resolve(opt('previewDir', path.join(process.env.TMPDIR || '/tmp', 'title_preview')));
const PREVIEW_SCALE = Number(opt('scale', 0.42));
const LABELS = !!opt('labels', false);

const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#333}</style>
<script src="lib/phaser.min.js"></script></head><body>
<script type="module" src="tools/title/bake_page.js"></script></body></html>`;

function writeDataUrl(file, url) {
  const b64 = url.slice(url.indexOf(',') + 1);
  fs.writeFileSync(file, Buffer.from(b64, 'base64'));
}

const t0 = Date.now();
const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 400, height: 300 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + (e && e.stack ? e.stack : e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('**/fv/__title_bake.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
await page.goto(srv.url + '__title_bake.html', { waitUntil: 'load' });
try {
  await page.waitForFunction(() => window.__BAKE && (window.__BAKE.ready || window.__BAKE.errors.length > 40), null, { timeout: 300000 });
} catch (e) {
  console.error('bake page did not get ready', errors.slice(0, 10));
  process.exit(1);
}
const pageErrors = await page.evaluate(() => window.__BAKE.errors);
if (pageErrors.length) console.log('[bake] page notes:', pageErrors.slice(0, 20));
console.log('[bake] loader ready in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');

if (PREVIEW) {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  const stages = String(PREVIEW === true ? '1,2,3,4' : PREVIEW).split(',').map(Number);
  for (const s of stages) {
    const url = await page.evaluate(([st, sc, lab]) => window.__BAKE.preview(st, sc, { labels: lab }), [s, PREVIEW_SCALE, LABELS]);
    const f = path.join(PREVIEW_DIR, `stage_${s}${LABELS ? '_labels' : ''}.png`);
    writeDataUrl(f, url);
    console.log('[bake] preview', f);
  }
} else {
  fs.rmSync(WORK, { recursive: true, force: true });
  fs.mkdirSync(path.join(WORK, 'pieces'), { recursive: true });
  const meta = { sprites: [], actors: [], ground: [], fx: [] };
  const take = async (what, list) => {
    const n = await page.evaluate((w) => { window.__BAKE.out = window.__BAKE[w](); return window.__BAKE.out.length; }, what);
    for (let i = 0; i < n; i += 24) {
      const chunk = await page.evaluate(([a, b]) => window.__BAKE.out.slice(a, b), [i, i + 24]);
      for (const p of chunk) {
        const file = p.name.replace(/[^a-zA-Z0-9_@.-]/g, '~') + '.png';
        writeDataUrl(path.join(WORK, 'pieces', file), p.png);
        delete p.png;
        p.file = file;
        list.push(p);
      }
    }
    console.log(`[bake] ${what}: ${n} pieces`);
  };
  await take('bakeSprites', meta.sprites);
  await take('bakeActors', meta.actors);
  await take('bakeGround', meta.ground);
  await take('bakeFx', meta.fx);
  meta.layoutInfo = await page.evaluate(() => window.__BAKE.info());
  fs.writeFileSync(path.join(WORK, 'pieces.json'), JSON.stringify(meta, null, 1));
  fs.mkdirSync(OUT, { recursive: true });
  const py = process.platform === 'win32' ? 'python' : 'python3';
  const out = execFileSync(py, [path.join(HERE, 'title_pack.py'), WORK, OUT], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(out);
}
if (errors.length) console.log('[bake] browser errors:', errors.slice(0, 10));
await browser.close();
await srv.close();
console.log('[bake] done in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
