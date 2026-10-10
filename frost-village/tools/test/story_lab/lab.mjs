// Story lab captures (one browser at a time, each group < 2 min):
//   nice -n 15 node tools/test/story_lab/lab.mjs <group> [--out DIR] [--desktop] [--inline] [--query k=v&…]
// groups: town · talks · proposal · wedding · baby · ui · stroller · school · wish · farewell · farewell_off · perf
// Stills: <out>/story_lab_*.jpg (phone 390 x 844 @ DPR 3 unless --desktop: 1280 x 800 @ DPR 1); GIFs: <out>/story_lab_*.gif
// (frames stepped deterministically with __LAB.advance, assembled with ffmpeg). Prints a JSON summary (stats, shot log).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from '../serve.mjs';
import { launch, openPage, waitFor } from '../pw.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
const group = args[0] || 'town';
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes('--' + k);
const OUT = path.resolve(opt('out', path.join(ROOT, 'docs', 'previews')));
const FRAMES = path.resolve(opt('frames', path.join(process.env.TMPDIR || '/tmp', 'story_lab_frames')));
const desktop = flag('desktop');
fs.mkdirSync(OUT, { recursive: true });

const QUERY = {
  farewell: 'tune=farewellFirstAfterMin:0', farewell_off: 'tune=farewellFirstAfterMin:0&farewell=0',
};
let query = [QUERY[group] || '', flag('inline') ? 'inline=1' : '', opt('query', '')].filter(Boolean).join('&');
if (flag('nohud')) query += (query ? '&' : '') + 'hud=0';

const { url, close } = await start();
const browser = await launch();
const t0 = Date.now();
const summary = { group, desktop, query, shots: [], gifs: [] };
try {
  const vp = desktop ? { viewport: { width: 1280, height: 800 }, dpr: 1, isMobile: false, hasTouch: false } : { viewport: { width: 390, height: 844 }, dpr: 3 };
  const { page, log } = await openPage(browser, url + 'tools/test/story_lab/lab.html' + (query ? '?' + query : ''), vp);
  const suffix = desktop ? '_desktop' : '';
  await page.exposeFunction('labSnap', async (name) => {
    const file = path.join(OUT, name + suffix + '.jpg');
    process.stderr.write('snap ' + name + ' @' + Math.round((Date.now() - t0) / 1000) + 's\n');
    await page.screenshot({ path: file, type: 'jpeg', quality: 86, timeout: 60000 });
    summary.shots.push(path.relative(ROOT, file));
  });
  await page.exposeFunction('labFrame', async (name, i) => {
    const dir = path.join(FRAMES, name + suffix);
    if (i === 0) { fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); }
    await page.screenshot({ path: path.join(dir, 'f_' + String(i).padStart(4, '0') + '.png'), scale: desktop ? 'device' : 'css' });
  });
  await waitFor(page, () => window.__LAB && (window.__LAB.ready || window.__LAB.errors.length), 60000);
  if (!flag('quiet')) process.stderr.write('ready after ' + (Date.now() - t0) + ' ms\n');
  await page.evaluate(() => window.__LAB.manual(true));
  summary.warm = await page.evaluate(() => window.__LAB.warm());
  if (!flag('quiet')) process.stderr.write('warm ' + JSON.stringify(summary.warm) + ' @' + Math.round((Date.now() - t0) / 1000) + 's\n');

  const ev = (fn, a) => page.evaluate(fn, a);
  const S = (name, o) => ev(async ([n, oo]) => { window.__LAB.quiet = !!oo.quiet; try { return await window.__LAB.shots[n](oo); } finally { window.__LAB.quiet = false; } }, [name, o || {}]);
  const res = {};
  switch (group) {
    case 'town': res.town = await S('town'); break;
    case 'talks': res.talks = await S('talks'); break;
    case 'proposal': res.proposal = await S('proposal', { gif: true, banner: true }); break;
    case 'wedding': res.proposal = await S('proposal', { quiet: true }); res.wedding = await S('wedding', { gif: !desktop }); break;
    case 'baby': res.baby = await S('baby'); res.naming = await S('naming'); break;
    case 'ui': res.proposal = await S('proposal', { quiet: true }); res.wedding = await S('wedding', { quiet: true }); res.news = await S('news'); res.person = await S('person'); break;
    case 'previews': res.stroller = await S('stroller'); res.school = await S('school'); res.wish = await S('wish'); break;
    case 'stroller': res.stroller = await S('stroller'); break;
    case 'school': res.school = await S('school'); break;
    case 'wish': res.wish = await S('wish'); break;
    case 'farewell': res.farewell = await S('farewell', { gif: true }); break;
    case 'farewell_off': res.farewellOff = await S('farewellOff'); break;
    case 'perf': {
      await page.evaluate(() => window.__LAB.manual(false));
      await page.evaluate(() => { const L = window.__LAB; L.setT(L.at(2, 15)); L.look(1290, 1180, 1.0); });
      await page.waitForTimeout(25000);
      break;
    }
    default: throw new Error('unknown group ' + group);
  }
  summary.result = res;
  summary.stats = await page.evaluate(() => window.__LAB.stats());
  summary.log = await page.evaluate(() => window.__LAB.shotLog || []);
  summary.console = { errors: log.errors.slice(0, 10), missing404: log.missing404.slice(0, 10) };
  // GIFs
  for (const d of fs.existsSync(FRAMES) ? fs.readdirSync(FRAMES) : []) {
    if (!d.startsWith('story_lab_')) continue;
    const dir = path.join(FRAMES, d);
    const st = fs.statSync(dir);
    if (st.mtimeMs < t0) continue;
    const out = path.join(OUT, d + '.gif');
    const fps = +(opt('gifps', '6'));
    const w = desktop ? 640 : 390;
    execFileSync('nice', ['-n', '15', 'ffmpeg', '-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(dir, 'f_%04d.png'),
      '-vf', `scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, out]);
    summary.gifs.push(path.relative(ROOT, out) + ' (' + Math.round(fs.statSync(out).size / 1024) + ' KiB)');
  }
} finally {
  summary.seconds = Math.round((Date.now() - t0) / 1000);
  console.log(JSON.stringify(summary, null, 1));
  await browser.close(); await close();
}
