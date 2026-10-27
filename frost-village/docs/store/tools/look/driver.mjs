// a long-lived game page for staging store pictures: POST /eval (body = JS function source, run in the page),
// POST /shot?path=..&type=png  (page screenshot), POST /quit
//   node driver.mjs <repo> <port> <save> <vw>x<vh> <dpr> [lang]
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
const [REPO, PORT, SAVE, SIZE, DPR, LANG = 'ko'] = process.argv.slice(2);
const [VW, VH] = SIZE.split('x').map(Number);
const { start } = await import(path.join(REPO, 'tools/test/serve.mjs'));
const { launch, openPage, tapStart, sleep, waitFor } = await import(path.join(REPO, 'tools/test/pw.mjs'));
const FIX = (n) => fs.readFileSync(path.join(REPO, 'tools/test/fixtures', n), 'utf8');
const srv = await start(0, { prefix: '/fv/', root: REPO });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: VW, height: VH }, dpr: Number(DPR), locale: LANG === 'en' ? 'en-US' : 'ko-KR' });
await page.evaluate(([sv, lang]) => { localStorage.clear(); localStorage.setItem('frostVillage.save.v1', sv); localStorage.setItem('frostVillage.settings.v1', JSON.stringify({ sound: false, music: false, lang, daynight: true, gfx: 'high', water: 'high' })); }, [FIX(SAVE), LANG]);
await page.reload({ waitUntil: 'load', timeout: 300000 });
await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 300000);
// the store pictures are taken at the phone's own sharpness: the slow-GPU fallback (View.forceK = 1, half resolution)
// is a watchdog for weak phones, and this software-rendered browser would trip it
await page.evaluate(() => { const L = window.__FV.game.loop; Object.defineProperty(L, 'actualFps', { get: () => 60, set: () => {}, configurable: true }); });
await sleep(300);
await tapStart(page);
await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 300000);
await sleep(1500);
const body = (req) => new Promise((r) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => r(s)); });
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname === '/eval') {
      const src = await body(req);
      const arg = u.searchParams.get('arg');
      const out = await page.evaluate(`(${src})(${arg || 'undefined'})`);
      res.end(JSON.stringify(out === undefined ? null : out));
    } else if (u.pathname === '/shot') {
      const p = u.searchParams.get('path');
      const opts = { path: p, type: p.endsWith('.jpg') ? 'jpeg' : 'png', timeout: 300000 };
      if (opts.type === 'jpeg') opts.quality = 95;
      await page.screenshot(opts);
      res.end(JSON.stringify({ ok: p }));
    } else if (u.pathname === '/wait') {
      await sleep(Number(u.searchParams.get('ms') || 1000)); res.end('{}');
    } else if (u.pathname === '/log') {
      res.end(JSON.stringify({ errors: log.errors.slice(-20), warn: log.warnings.slice(-10) }));
    } else if (u.pathname === '/quit') {
      res.end('{}'); await browser.close(); await srv.close(); process.exit(0);
    } else { res.statusCode = 404; res.end('?'); }
  } catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e.message || e).slice(0, 2000) })); }
});
server.listen(Number(PORT), '127.0.0.1', () => console.log('READY ' + PORT));
