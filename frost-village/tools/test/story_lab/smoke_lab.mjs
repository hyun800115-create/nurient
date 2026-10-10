// Quick boot check of the story lab page (one browser, < 1 min):  nice -n 15 node tools/test/story_lab/smoke_lab.mjs [query]
// Prints the lab stats and writes one screenshot to the scratch dir given by $SHOT (default /tmp/story_lab_smoke.png).
import { start } from '../serve.mjs';
import { launch, openPage, sleep, waitFor } from '../pw.mjs';

const q = process.argv[2] || '';
const { url, close } = await start();
const browser = await launch();
try {
  const { page, log } = await openPage(browser, url + 'tools/test/story_lab/lab.html' + (q ? '?' + q : ''), { viewport: { width: 390, height: 844 }, dpr: 3 });
  await waitFor(page, () => window.__LAB && (window.__LAB.ready || window.__LAB.errors.length), 60000);
  await sleep(4000);
  const st = await page.evaluate(() => window.__LAB.stats());
  console.log(JSON.stringify(st, null, 1));
  console.log('console errors:', log.errors.slice(0, 10), '404:', log.missing404.slice(0, 10));
  await page.screenshot({ path: process.env.SHOT || '/tmp/story_lab_smoke.png' });
} finally { await browser.close(); await close(); }
