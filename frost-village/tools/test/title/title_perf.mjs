// Relative cost of the new living title vs the old title (src/scenes/Title.js), same browser, same canvas.
//   node tools/test/title/title_perf.mjs [--frames 30]
// Boots the real Boot + Preload with either the old Title or src/title/TitleScene (idle at stage 4, night:
// the busiest state) and measures per frame: JS update time (logic), draw calls + texture binds (WebGL
// instrumentation), and GPU time (frame + readPixels sync, SwiftShader). The two pages are measured
// interleaved so the shared-CPU noise hits both alike. Prints a JSON summary.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from '../serve.mjs';
import { loadPlaywright } from '../pw.mjs';
import { installStepper } from '../fv_step.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const N = Number((args[args.indexOf('--frames') + 1]) || 30) || 30;
const lab = fs.readFileSync(path.join(ROOT, 'tools', 'test', 'title_lab.mjs'), 'utf8');
const HTML_NEW = lab.slice(lab.indexOf('const HTML = `') + 14, lab.indexOf('</script></body></html>`;') + 23);
const HTML_OLD = HTML_NEW.replace("import { TitleScene } from './src/title/TitleScene.js';", "import { Title as TitleScene } from './src/scenes/Title.js';");

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'] });
const srv = await start(0, { prefix: '/fv/' });

async function open(html, isNew) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ko-KR' });
  if (isNew) await ctx.addInitScript(() => {
    localStorage.setItem('frostVillage.save.v1', JSON.stringify({ v: 4, progress: { done: {} }, city: { open: true } }));
    localStorage.setItem('frostVillage.title.v1', JSON.stringify({ introSeen: true, shown: 4 }));
  });
  const page = await ctx.newPage();
  await page.route('**/fv/__perf.html*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await page.goto(srv.url + '__perf.html', { waitUntil: 'load' });
  if (isNew) {
    await page.waitForFunction(() => { const T = window.__TITLE; if (!T) return false; const st = window.__LAB.TitleAssets.state; return [1, 2, 3, 4].every((g) => st[g] === 'ready') && window.__LAB.TitleAssets.artSettled(); }, null, { timeout: 180000 });
  } else {
    await page.waitForFunction(() => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), null, { timeout: 180000 });
  }
  await installStepper(page);
  await page.evaluate(() => {
    const g = window.__FV.game, gl = g.renderer.gl;
    window.__FV.scene = g.scene.getScene('Title');
    const C = window.__GLC = { draws: 0, binds: 0 };
    const d1 = gl.drawArrays.bind(gl), d2 = gl.drawElements.bind(gl), bt = gl.bindTexture.bind(gl);
    gl.drawArrays = (...a) => { C.draws++; return d1(...a); };
    gl.drawElements = (...a) => { C.draws++; return d2(...a); };
    gl.bindTexture = (...a) => { C.binds++; return bt(...a); };
    window.__step.run(3);
  });
  return { ctx, page };
}

const measure = (page) => page.evaluate(() => {
  const g = window.__FV.game, gl = g.renderer.gl, px = new Uint8Array(4), C = window.__GLC;
  window.__step.frame(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  C.draws = 0; C.binds = 0;
  const a = performance.now(); window.__step.frame(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return { gpu: performance.now() - a, draws: C.draws, binds: C.binds };
});
const logic = (page) => page.evaluate(() => window.__step.bench(120));
const objects = (page) => page.evaluate(() => window.__FV.scene.children.length);

const pNew = await open(HTML_NEW, true);
const pOld = await open(HTML_OLD, false);
const res = { new: [], old: [] };
for (let i = 0; i < N; i++) { res.new.push(await measure(pNew.page)); res.old.push(await measure(pOld.page)); }
const med = (xs) => { const s = xs.slice().sort((a, b) => a - b); return +s[Math.floor(s.length / 2)].toFixed(1); };
const sum = (k) => ({
  gpuMedianMs: med(res[k].map((r) => r.gpu)), drawCalls: med(res[k].map((r) => r.draws)), textureBinds: med(res[k].map((r) => r.binds)),
});
const out = {
  canvas: await pNew.page.evaluate(() => [window.__FV.game.canvas.width, window.__FV.game.canvas.height]),
  newTitle: Object.assign(sum('new'), { logic: await logic(pNew.page), objects: await objects(pNew.page), state: await pNew.page.evaluate(() => window.__TITLE.state()) }),
  oldTitle: Object.assign(sum('old'), { logic: await logic(pOld.page), objects: await objects(pOld.page) }),
};
out.gpuRatio = +(out.newTitle.gpuMedianMs / Math.max(0.1, out.oldTitle.gpuMedianMs)).toFixed(2);
console.log(JSON.stringify(out, null, 1));
await browser.close();
await srv.close();
