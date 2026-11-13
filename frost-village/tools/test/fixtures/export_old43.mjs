// (v4.3 step B 「마을 새 단장 둘째 걸음」, S5 — WP-S) export real villages from OLD builds as step-B fixtures (map_save §5.2,
// build_plan §3.5 S5, BP-10 / BP-22 / BP-27). The old build runs in its own detached git worktree, used read-only: this
// script imports that tree's own test helpers (serve.mjs, pw.mjs, review_gameplay_bot.js) and serves its game; nothing is
// written inside it. Browser: run it through the shared lane (scratchpad/v43/stepB/lane_b.sh … 'fixtures/export_old43:…').
//
//   node tools/test/fixtures/export_old43.mjs --recipe <name> --game <old worktree>/frost-village [--out <dir>] [--seed N]
//
// Recipes (the commit the worktree must be at; what is exported to --out, default this folder):
//   v4202     38c233c (4.2.0.2, v7; Play production / closed testers)  a new game played by the smart bot (seed 1), the
//             first-run tutorial off (as for every village begun before 4.2.0.1): v4202_25min.json at 25 min,
//             v4202_46min_admin.json at 46 min after the admin panel's own functions ran (adminBackup -> the 관리자 사본
//             key frostVillage.move.admin, countUse -> adminUses 1, setUnlimited -> adminInf 1: what a village whose admin
//             panel was opened carries; the PIN is not involved)
//   v4202tut  38c233c  a new game WITH the first-run tutorial (window.__FV_ONBOARD = true: under a test driver the build
//             turns it off) to 3.5 min -> v4202_fresh_tut.json (its onb bits)
//   v421      977f02e (4.2.1, v8; AAB 4022)  v41_save_smart_46min with the cannery on w_m2 (its mcan pad) and the store on
//             e_m2, the meat-can offer seen with 300 coins already on its pad, played 2 min -> v421_meatcan.json
//   a22       920ddf1 (a2.2, v8; AAB 4312)  v42_village_late (every key, chat too) with depot crew 2 + the forklift and 400
//             coins on the next staff pad, played 2 min -> v43a22_late.json (shop43 at init; no bakery43 in a2.x)
//   a31late   e28089a / 12d598f (a3.1, v8; AAB 4314 — a3 4313 writes the same shape)  v42_village_late with depot crew 2 +
//             forklift, a village flag, played 2 min with the residents window seen -> v43a3_late.json
//   a31fresh  e28089a / 12d598f  a new game with the first-run tutorial on, played by the smart bot (seed 1) to 25 min
//             -> v43a3_fresh25.json
// Every export: all frostVillage.* keys but the save's own spares (save.backup*, *.bad) as { _note, _from, keys }; the save
// must be pre-B (no v43, no lv: make_v43.mjs assertPreB) — a tree that already has step B is refused.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertPreB } from './make_v43.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const RECIPE = opt('--recipe', '');
const GAME = path.resolve(opt('--game', ''));
const OUT = path.resolve(opt('--out', HERE));
const SEED = Number(opt('--seed', '1'));
const SAVE_KEY = 'frostVillage.save.v1';
const clone = (o) => JSON.parse(JSON.stringify(o));
const read = (f) => JSON.parse(fs.readFileSync(path.join(HERE, f), 'utf8'));

const RECIPES = {
  v4202: { commits: ['38c233c'], build: '4.2.0.2', fresh: true, bot: true, minutes: 46.2, at: [[25, 'v4202_25min.json'], [46, 'v4202_46min_admin.json', { admin: true }]] },
  v4202tut: { commits: ['38c233c'], build: '4.2.0.2', fresh: true, bot: true, onboard: true, minutes: 3.6, at: [[3.5, 'v4202_fresh_tut.json']] },
  v421: { commits: ['977f02e'], build: '4.2.1', base: () => {
    const s = read('v41_save_smart_46min.json');
    const can = s.sites.e_m2, store = s.sites.w_m2;
    s.sites.w_m2 = can; s.sites.e_m2 = store;                    // the cannery on w_m2 (its mcan pad, world.js 4.2.1), the store on e_m2
    s.progress.seen = Object.assign({}, s.progress.seen, { mcanOffer: true });
    s.v42 = { v: 1, offerPaid: { mcan: 300 } };
    return { [SAVE_KEY]: JSON.stringify(s) };
  }, play: 120, at: [[0, 'v421_meatcan.json']] },
  a22: { commits: ['920ddf1'], build: 'v4.3.0-a2.2', base: () => {
    const k = clone(read('v42_village_late.json').keys);
    const s = JSON.parse(k[SAVE_KEY]);
    s.v42.depot = Object.assign({}, s.v42.depot, { hires: 2, fork: 1, hp: { staff: 400, fork: 0 } });
    k[SAVE_KEY] = JSON.stringify(s);
    return k;
  }, play: 120, at: [[0, 'v43a22_late.json']] },
  a31late: { commits: ['e28089a', '12d598f'], build: 'v4.3.0-a3.1', base: () => {
    const k = clone(read('v42_village_late.json').keys);
    const s = JSON.parse(k[SAVE_KEY]);
    s.v42.depot = Object.assign({}, s.v42.depot, { hires: 2, fork: 1 });
    s.flag = { s: 2, b: 1, p: 3, pc: 4, e: 2, ec: 5 };
    k[SAVE_KEY] = JSON.stringify(s);
    return k;
  }, play: 120, seen: { resWin: true }, at: [[0, 'v43a3_late.json']] },
  a31fresh: { commits: ['e28089a', '12d598f'], build: 'v4.3.0-a3.1', fresh: true, bot: true, onboard: true, minutes: 25.2, at: [[25, 'v43a3_fresh25.json']] },
};
const NOTES = {
  'v4202_fresh_tut.json': 'a 4.2.0.2 (38c233c, v7) new game with the first-run tutorial on (window.__FV_ONBOARD: under a test driver the build turns it off), smart bot seed 1, at 3.5 game min: its onb bits, no admin',
  'v4202_25min.json': 'a 4.2.0.2 (38c233c, v7) village at 25 game min (smart bot, seed 1) begun without the first-run tutorial (no onb: like every village begun before 4.2.0.1), workshops on generic plots',
  'v4202_46min_admin.json': 'a 4.2.0.2 (38c233c, v7) village at 46 game min (smart bot, seed 1, begun without the first-run tutorial: no onb) whose admin panel was used: the admin functions ran (관리자 사본 frostVillage.move.admin, adminUses 1, adminInf 1 = 코인 무제한 on)',
  'v421_meatcan.json': 'a 4.2.1 (977f02e, v8, AAB 4022) village: v41_save_smart_46min with the cannery on w_m2 (its mcan pad) and the store on e_m2; the meat-can offer seen, 300 coins on the mcan pad; played 2 game min in 4.2.1 (no shop43)',
  'v43a22_late.json': 'an a2.2 (920ddf1, v8, AAB 4312) village: v42_village_late (every key, chat too) with depot crew 2 + the forklift (400 coins on the next staff pad), played 2 game min in a2.2: shop43 at init, no bakery43, bread at the shop',
  'v43a3_late.json': 'an a3.1 (e28089a = 12d598f code, v8, AAB 4314; a3 / AAB 4313 writes the same shape) village: v42_village_late with depot crew 2 + forklift and a village flag, played 2 game min in a3.1 (shop43 + bakery43, the bakery slice), residents window seen',
  'v43a3_fresh25.json': 'an a3.1 (e28089a, v8) new game at 25 game min with the first-run tutorial on (window.__FV_ONBOARD), smart bot seed 1; its new-game flag kept with the maker\'s 「이대로 시작」: onb, flag, the bakery, workshops on generic plots',
};

const R = RECIPES[RECIPE];
if (!R || !fs.existsSync(path.join(GAME, 'tools/test/pw.mjs'))) {
  console.error('usage: export_old43.mjs --recipe ' + Object.keys(RECIPES).join('|') + ' --game <old worktree>/frost-village [--out dir] [--seed N]');
  process.exit(2);
}
const head = execFileSync('git', ['-C', GAME, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (!R.commits.some((c) => head.startsWith(c))) { console.error('export_old43: ' + GAME + ' is at ' + head.slice(0, 10) + ', recipe ' + RECIPE + ' wants ' + R.commits.join(' / ')); process.exit(2); }
if (fs.existsSync(path.join(GAME, 'src/core/Remap43.js'))) { console.error('export_old43: this tree has step B (src/core/Remap43.js): not a pre-B build'); process.exit(2); }

const imp = (f) => import(pathToFileURL(path.join(GAME, 'tools/test', f)).href);
const { start } = await imp('serve.mjs');
const { launch, openPage, sleep, waitFor, tapStart } = await imp('pw.mjs');

// seeded Math.random (mulberry32), before the page's own scripts
const seedInit = (R && R.onboard ? 'window.__FV_ONBOARD = true;' : '') + `(() => { let a = ${SEED >>> 0} || 1; Math.random = function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();`;

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
let rc = 0;
try {
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 360, height: 720 }, dpr: 1, init: seedInit });
  const keys0 = R.base ? R.base() : {};
  await page.evaluate((k) => { localStorage.clear(); for (const n in k) localStorage.setItem(n, k[n]); }, keys0);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  // (the bot reads the build's own balance / world, as review_gameplay_sim sets them)
  await page.evaluate(async () => {
    window.__BAL = (await import(new URL('src/data/balance.js', location.href).href)).BALANCE;
    window.__WORLD = (await import(new URL('src/data/world.js', location.href).href)).WORLD;
  });
  await sleep(400);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 180000);
  await sleep(600);
  // the fixed-step clock (as review_gameplay_sim does): game time does not depend on how slow the machine is
  await page.evaluate(() => {
    const game = window.__FV.game;
    game.loop.sleep();
    let D = Date.now();
    let T = game.loop.time || performance.now();
    Date.now = () => D;
    const DT = 1000 / 60;
    window.__x43 = { t: 0, run(sec, tick) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { if (tick) tick(DT / 1000); T += DT; D += DT; this.t += DT / 1000; game.headlessStep(T, DT); } } };
  });
  if (R.bot) {
    await page.addScriptTag({ path: path.join(GAME, 'tools/test/review_gameplay_bot.js') });
    await page.evaluate(() => Object.assign(window.__bot.opts, { policy: 'smart', upg: 'greedy', minBatch: 3, think: 0, mag: 1 }));
  }
  const total = R.bot ? R.minutes * 60 : R.play;
  const at = R.at.map((a) => [R.bot ? a[0] * 60 : total, a[1], a[2] || {}]).sort((x, y) => x[0] - y[0]);
  const exportNow = async (file, o) => {
    if (o.admin) {
      const a = await page.evaluate(async () => {
        const A = await import(new URL('src/systems/Admin.js', location.href).href);
        const gs = window.__FV.scene;
        const b = await A.adminBackup(gs);
        const uses = A.countUse(gs);
        const inf = A.setUnlimited(gs, true);
        return { copy: b.copy, uses, inf };
      });
      console.log('  admin: ' + JSON.stringify(a));
    }
    if (R.seen) await page.evaluate((sn) => { Object.assign(window.__FV.scene.progress.seen, sn); }, R.seen);
    const keys = await page.evaluate(() => {
      try { window.__FV.save(); } catch (e) { /* */ }
      const o = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!/^frostVillage\./.test(k) || /^frostVillage\.save\.backup/.test(k) || /\.bad$/.test(k)) continue;
        o[k] = localStorage.getItem(k);
      }
      return o;
    });
    const sorted = {};
    for (const k of Object.keys(keys).sort()) sorted[k] = keys[k];
    assertPreB(file, sorted);
    const s = JSON.parse(sorted[SAVE_KEY]);
    const info = await page.evaluate(() => { const gs = window.__FV.scene; return { t: window.__x43.t, flagDone: window.__x43.flagDone || 0, coins: gs.economy.coins, done: Object.keys(gs.progress.done).filter((k) => gs.progress.done[k]).length }; });
    const fx = { _note: '(v4.3 step B, S5 — export_old43.mjs --recipe ' + RECIPE + ') ' + NOTES[file], _from: { commit: head.slice(0, 7), build: R.build, gameSec: Math.round(info.t), seed: R.bot ? SEED : null }, keys: sorted };
    fs.writeFileSync(path.join(OUT, file), JSON.stringify(fx, null, 1) + '\n');
    const sites = Object.entries(s.sites || {}).map(([k, d]) => k + ':' + d.b + (d.st === 'done' ? '' : '(' + d.st + ')')).join(' ');
    console.log('  wrote ' + file + ' — v ' + s.v + ', ' + Math.round(info.t) + ' s, coins ' + s.coins + ', ' + info.done + ' steps, onb ' + (s.onb || '-') + ', flag ' + (s.flag ? JSON.stringify(s.flag) : '-') + (info.flagDone ? ' (maker closed x' + info.flagDone + ')' : '') + ', admin ' + (s.adminUses || 0) + '/' + (s.adminInf || 0) + ', keys ' + Object.keys(sorted).length + '\n    sites: ' + sites);
  };
  let tNow = 0;
  for (const [tAt, file, o] of at) {
    while (tNow < tAt) {
      const step = Math.min(10, tAt - tNow);
      // (a3+ new game: the flag maker opens over the village and pauses it — the player's 「이대로 시작」 (finish(true)) keeps
      //  the flag it offers; the first-run tutorial goes on as it would)
      await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); const fm = ui && ui.flagMaker; if (fm && fm.c && typeof fm.finish === 'function') { fm.finish(true); window.__x43.flagDone = (window.__x43.flagDone || 0) + 1; } });
      await page.evaluate((s) => window.__x43.run(s, window.__bot ? window.__bot.tick : null), step);
      tNow += step;
    }
    await exportNow(file, o);
  }
  const errs = log.errors.filter((e) => !/Failed to load resource/.test(e));
  console.log('page errors: ' + errs.length + (errs.length ? '\n  ' + errs.slice(0, 5).join('\n  ') : ''));
} catch (e) {
  console.error('FAIL export_old43 ' + RECIPE + ': ' + ((e && e.stack) || e));
  rc = 1;
}
await browser.close();
await srv.close();
process.exit(rc);
