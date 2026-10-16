// (v4.2, docs/v42_plan.md §7 + §15) 관망 soak, fixed-step clock:
//   node tools/test/pilot.mjs [--minutes 30] [--ref-minutes 30] [--no-ref] [--out DIR]
// From the v4.1 46-min save (village complete) the chief lives his day in 관망 for `minutes` game minutes:
//   0 page errors · no stretch > 20 s with a route and no progress · 0 coins spent and no pay-pad payment while
//   piloted · ≥ 6 activity starts in every 10 minutes (and ≥ 4 different ones overall) · a human key hands back in
//   the same frame (the human's vector moves him that frame) · income ≥ 80 % of the arrow-only bot's on the same save
//   and the same minutes (--no-ref skips that reference run).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const MIN = Number(opt('--minutes', '30'));
const REF_MIN = Number(opt('--ref-minutes', String(MIN)));
const OUT = opt('--out', '');
const SAVE = fs.readFileSync(path.join(HERE, 'fixtures', 'v41_save_smart_46min.json'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 400) : '')); } };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const t0 = Date.now();

async function boot() {
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: 1 });
  await page.evaluate((sv) => { try { localStorage.clear(); localStorage.setItem('frostVillage.save.v1', sv); } catch (e) { /* */ } }, SAVE);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 120000);
  await sleep(1500);
  await page.evaluate(async () => {
    const game = window.__FV.game;
    game.loop.sleep();
    const realNow = Date.now.bind(Date);
    let D = realNow(); let T = game.loop.time || performance.now();
    Date.now = () => D;
    const DT = 1000 / 60;
    try { if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1; } catch (e) { /* */ }
    window.__Input = (await import(new URL('src/core/Input.js', location.href).href)).Input;
    window.__sim = { simT: 0, run(sec, tick) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { if (tick) tick(DT / 1000); T += DT; D += DT; this.simT += DT / 1000; game.headlessStep(T, DT); } } };
  });
  return { page, log };
}

let pilotEarned = 0, refEarned = null;
try {
  // ── 관망 soak ──
  console.log(`관망 soak: ${MIN} game minutes from the 46-min save`);
  const { page, log } = await boot();
  const start0 = await page.evaluate(() => {
    const gs = window.__FV.scene, P = gs.v42.pilot;
    const w = window.__pw = { spends: [], starts: [], noProg: 0, maxNoProg: 0, last: null, lastXY: null };
    const spend0 = gs.economy.spend.bind(gs.economy);
    gs.economy.spend = (n) => { const got = spend0(n); if (P.on && got > 0) w.spends.push({ t: Math.round(window.__sim.simT), n: got, at: (new Error().stack || '').split('\n').slice(2, 4).join(' | ') }); return got; };
    const begin0 = P.begin.bind(P);
    P.begin = (a) => { begin0(a); w.starts.push([Math.round(window.__sim.simT), a]); };
    w.tick = (dt) => {
      if (!P.on) return;
      const p = gs.player;
      const moving = P.act && P.act.target && !P.arrived && P.route.length;
      if (moving && w.lastXY && Math.hypot(p.x - w.lastXY.x, p.y - w.lastXY.y) < 0.5) { w.noProg += dt; w.maxNoProg = Math.max(w.maxNoProg, w.noProg); }
      else if (!moving || (w.lastXY && Math.hypot(p.x - w.lastXY.x, p.y - w.lastXY.y) >= 0.5)) w.noProg = Math.max(0, w.noProg - dt * 0.5);
      w.lastXY = { x: p.x, y: p.y };
    };
    const st = window.__FV.v42.pilot(true);
    return { on: st.on, coins: gs.economy.coins, earned: gs.economy.earned, complete: gs.v42.complete };
  });
  ok(start0.on && start0.complete, '관망 starts on the 46-min save (village complete)', start0);
  const marks = [];
  for (let sec = 0; sec < MIN * 60; sec += 10) {
    const s = await page.evaluate(() => { window.__sim.run(10, window.__pw.tick); const gs = window.__FV.scene, P = gs.v42.pilot; return { t: Math.round(window.__sim.simT), on: P.on, act: P.act && P.act.act, coins: gs.economy.coins, earned: gs.economy.earned, stuck: P.stats.stuck, maxNoProg: +window.__pw.maxNoProg.toFixed(1) }; });
    marks.push(s);
    if (!s.on) { console.log('  pilot went off at t=' + s.t); break; }
    if (sec % 300 === 290) console.log(`  t=${s.t} act=${s.act} earned=${s.earned - start0.earned} coins=${s.coins} stuck=${s.stuck} maxNoProg=${s.maxNoProg}s wall=${((Date.now() - t0) / 1000) | 0}s`);
  }
  const res = await page.evaluate(() => { const gs = window.__FV.scene, P = gs.v42.pilot; return { st: P.state(), starts: window.__pw.starts, spends: window.__pw.spends, maxNoProg: window.__pw.maxNoProg, earned: gs.economy.earned, coins: gs.economy.coins }; });
  pilotEarned = res.earned - start0.earned;
  ok(marks.every((m) => m.on), '관망 stays on for the whole soak (no input)');
  ok(log.errors.length === 0, '0 page errors', log.errors.slice(0, 5));
  ok(res.maxNoProg <= 20, 'never > 20 s on a route without progress (' + res.maxNoProg.toFixed(1) + ' s)');
  ok(res.spends.length === 0, '0 payments while piloted', res.spends.slice(0, 5));
  const spent = start0.coins + pilotEarned - res.coins;
  ok(spent <= 0, '0 coins spent (coins ' + start0.coins + ' + earned ' + pilotEarned + ' − now ' + res.coins + ' = ' + spent + ')');
  const windows = [];
  for (let a = 0; a < MIN * 60; a += 600) windows.push(res.starts.filter(([t]) => t >= a && t < a + 600).length);
  const kinds = [...new Set(res.starts.map(([, a]) => a))];
  console.log('  starts per 10 min: ' + windows.join(', ') + ' · kinds: ' + kinds.join(', ') + ' · acts ' + JSON.stringify(res.st.stats.acts) + ' · cuts ' + res.st.cuts);
  ok(windows.every((n) => n >= 6), '≥ 6 activities in every 10 minutes', windows);
  ok(kinds.length >= 4, '≥ 4 different activities (' + kinds.length + ')');
  // hand-back: a human key in one frame
  const hb = await page.evaluate(() => {
    const I = window.__Input, gs = window.__FV.scene, P = gs.v42.pilot, p = gs.player;
    if (!P.on) P.start('test');
    const x0 = p.x;
    I.keys.right.isDown = true;
    window.__sim.run(1 / 60);
    const r = { on: P.on, vx: I.vec.x, moved: p.x - x0 };
    I.keys.right.isDown = false;
    window.__sim.run(0.2);
    return r;
  });
  ok(!hb.on && hb.vx > 0.9, 'a human key hands control back in the same frame (vec.x ' + hb.vx + ', moved ' + hb.moved.toFixed(1) + ' px)', hb);
  console.log(`  pilot income: ${pilotEarned} in ${MIN} min`);
  await page.close();
  if (OUT) fs.writeFileSync(path.join(OUT, 'pilot_soak.json'), JSON.stringify({ marks, res, start0 }, null, 0));

  // ── reference: the arrow-only bot on the same save and minutes ──
  if (!args.includes('--no-ref')) {
    console.log(`arrow-only bot: ${REF_MIN} game minutes from the same save`);
    const { page: rp } = await boot();
    await rp.addScriptTag({ path: path.join(HERE, 'review_gameplay_bot.js') });
    await rp.evaluate(() => Object.assign(window.__bot.opts, { policy: 'arrowonly', upg: 'none', minBatch: 3, think: 0, mag: 1 }));
    const e0 = await rp.evaluate(() => window.__FV.scene.economy.earned);
    for (let sec = 0; sec < REF_MIN * 60; sec += 10) await rp.evaluate(() => window.__sim.run(10, window.__bot.tick));
    refEarned = (await rp.evaluate(() => window.__FV.scene.economy.earned)) - e0;
    console.log(`  arrow-only income: ${refEarned} in ${REF_MIN} min`);
    // (the same window: the first REF_MIN minutes of both runs — the save's full tills are picked up early by both)
    const mk = marks.find((m) => m.t >= REF_MIN * 60) || marks[marks.length - 1];
    const pilotSame = mk ? mk.earned - start0.earned : pilotEarned;
    const k = (pilotSame / Math.max(1, Math.min(REF_MIN, MIN))) / Math.max(1, refEarned / Math.max(1, REF_MIN));
    console.log(`  관망 income in the same ${REF_MIN} minutes: ${pilotSame}`);
    ok(k >= 0.8, '관망 income ≥ 80 % of the arrow-only bot (' + Math.round(k * 100) + ' %)');
    await rp.close();
  }
} catch (e) { fail++; console.log('FATAL', (e && e.stack) || e); }
console.log(`\n${pass} passed, ${fail} failed  (wall ${((Date.now() - t0) / 1000) | 0}s)`);
await browser.close();
await srv.close();
process.exit(fail ? 1 : 0);
