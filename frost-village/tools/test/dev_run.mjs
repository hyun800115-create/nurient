// Run a screenshot / check scenario against one booted game on the fixed-step clock (fv_step.mjs).
//   node tools/test/dev_run.mjs <scenario.mjs> [--out dir] [--vp 390x844] [--keep]   (fresh save unless --keep)
// The scenario module: export default async ({ page, ev, adv, shot, walk, log, st }) => { ... }
//   ev(fnOrString, arg)  evaluate in the page       adv(sec)  advance game time
//   shot(name)           draw + screenshot to <out>/<name>.jpg
//   walk({x, y}, tol)    joystick walk (game time)    st()      __FV.state()
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render, walkStep } from './fv_step.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const file = args[0];
const OUT = opt('--out', '/tmp/fv_dev');
fs.mkdirSync(OUT, { recursive: true });
const vp = opt('--vp', '390x844').split('x').map(Number);

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: vp[0], height: vp[1] } });
let code = 0;
try {
  if (!args.includes('--keep')) { await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* */ } }); await page.reload({ waitUntil: 'load' }); }
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(500);
  await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 60000);
  await sleep(1500);
  await installStepper(page);
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const adv = (sec) => advance(page, sec);
  const shot = async (name) => { await render(page, 3); await page.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 84 }); console.log('shot', name); };
  const walk = (t, tol) => walkStep(page, t, { tol: tol || 18 });
  const st = () => page.evaluate(() => window.__FV.state());
  const mod = await import(pathToFileURL(path.resolve(file)).href);
  await mod.default({ page, ev, adv, shot, walk, log: console.log, st, sleep });
} catch (e) {
  code = 1;
  console.log('FATAL', e && e.stack || e);
}
console.log('page errors:', log.errors.length);
for (const e of log.errors.slice(0, 8)) console.log('  ', e.slice(0, 600));
const warn = await page.evaluate(() => (window.__FV && window.__FV.warnings ? window.__FV.warnings() : [])).catch(() => []);
console.log('placeholder keys:', warn.join(', ') || 'none');
await browser.close();
await srv.close();
process.exit(code || (log.errors.length ? 1 : 0));
