// Gameplay-review simulation: a bot plays from a fresh save using only __FV.setInput (joystick),
// at a fixed 60 fps simulated clock (headlessStep + fake Date.now), much faster than real time.
//   node tools/test/review_gameplay_sim.mjs --name smart --policy smart --upg greedy --minutes 40 [--bal '{"prices":{"item_fish_cooked":5}}'] [--shots]
//   (v4 review) --policy arrowonly (only goes where the arrow points, stands still otherwise), --load <save.json>,
//   --saveAt 20,30 (save snapshots), --v4 (play on until 읍)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes(k);
const NAME = opt('--name', 'run');
const OUT = opt('--out', '/tmp/fv_review/gameplay');
fs.mkdirSync(OUT, { recursive: true });
const MINUTES = Number(opt('--minutes', '40'));
const AFTER = Number(opt('--after', '0'));            // keep playing N minutes after village complete
const V3 = has('--v3');                                // (v3) play on until the frontier is complete (all v3 goals)
const V4 = has('--v4');                                // (v4) play on until the village is a 읍 (rank 2)
const BAL = opt('--bal', '');
const WORLDO = opt('--world', '');
const SHOTS = has('--shots');
const SAVEAT = opt('--saveAt', '').split(',').filter(Boolean).map(Number).sort((a, b) => a - b);
const HERE = path.dirname(fileURLToPath(import.meta.url));

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 360, height: 720 }, dpr: 1 });
const t0 = Date.now();
try {
  const LOAD = opt('--load', '');
  const saveTxt = LOAD ? fs.readFileSync(LOAD, 'utf8') : null;
  await page.evaluate((sv) => { try { localStorage.clear(); if (sv) localStorage.setItem('frostVillage.save.v1', sv); } catch (e) { /* */ } }, saveTxt);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await page.evaluate(async (bal) => {
    const m = await import(new URL('src/data/balance.js', location.href).href);
    window.__BAL = m.BALANCE;
    const merge = (a, b) => { for (const k in b) { if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) merge(a[k] = a[k] || {}, b[k]); else a[k] = b[k]; } };
    if (bal) merge(window.__BAL, JSON.parse(bal[0] || 'null') || {});
    const w = await import(new URL('src/data/world.js', location.href).href);
    window.__WORLD = w.WORLD;
    if (bal[1]) merge(window.__WORLD, JSON.parse(bal[1]));
  }, [BAL, WORLDO]);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 120000);
  await sleep(500);
  if (saveTxt) {
    const sv = JSON.parse(saveTxt);
    await page.waitForFunction(() => window.__FV.scene && window.__FV.scene.v4 !== undefined, null, { timeout: 5000 }).catch(() => {});
    const st = await page.evaluate(() => { const gs = window.__FV.scene; return { v: window.__FV.state().v, coins: gs.economy.coins, done: Object.keys(gs.progress.done).length, built: Object.assign({}, gs.built), regions: Object.keys(gs.territory.regions).filter((r) => gs.territory.regions[r].open), v4: !!gs.v4, sites: Object.fromEntries(Object.entries(gs.sites).map(([k, q]) => [k, q.state + (q.building ? ':' + q.building : '')])), pop: gs.life ? gs.life.people() : null, workers: gs.workers.length, porters: gs.porters.length }; });
    console.log('LOADED', JSON.stringify({ saveV: sv.v, saveCoins: sv.coins, saveDone: Object.keys((sv.progress || {}).done || {}).length, saveRegions: Object.keys(sv.territory || {}).filter((k) => sv.territory[k] === true || (sv.territory[k] && sv.territory[k].open)), saveSites: sv.sites ? Object.keys(sv.sites).length : null, savePop: sv.life && sv.life.moved ? sv.life.moved.length : null }));
    console.log('STATE', JSON.stringify(st));
  }
  // fixed-step driver
  await page.evaluate(() => {
    const game = window.__FV.game;
    game.loop.sleep();
    const realNow = Date.now.bind(Date);
    let D = realNow();
    let T = game.loop.time || performance.now();
    Date.now = () => D;
    const DT = 1000 / 60;
    window.__sim = {
      simT: 0,
      run(sec, botTick) {
        const n = Math.round(sec * 60);
        for (let i = 0; i < n; i++) {
          if (botTick) botTick(DT / 1000);
          T += DT; D += DT; this.simT += DT / 1000;
          game.headlessStep(T, DT);
        }
      },
      render() { T += DT; D += DT; this.simT += DT / 1000; game.step(T, DT); },
    };
  });
  if (has('--fixmarket')) await page.evaluate(() => {
    // in-memory patch for measurement only: a partly served customer switches to another food when theirs runs out
    const m = window.__FV.scene.market, orig = m.update.bind(m);
    const FOODS = ['item_fish_cooked', 'item_bread', 'item_meat_cooked'];
    m.update = (dt) => { const f = m.queue[0]; if (f && f.state === 'wait' && f.arrived && f.need > 0 && m.stock.countOf(f.want.type) === 0) { for (const x of FOODS) if (m.stock.countOf(x) > 0) { f.setWant(x); break; } } return orig(dt); };
  });
  await page.addScriptTag({ path: opt('--botjs', path.join(HERE, 'review_gameplay_bot.js')) });
  await page.evaluate((o) => Object.assign(window.__bot.opts, o), Object.assign({ policy: opt('--policy', 'smart'), upg: opt('--upg', 'greedy'), minBatch: Number(opt('--minbatch', '3')), think: Number(opt('--think', '0')), mag: Number(opt('--mag', '1')) }, JSON.parse(opt('--botopts', '{}'))));

  let completeAt = -1, lastEvents = 0, v3At = -1, eupAt = -1;
  const samples = [];
  const v4samples = [];
  const shot = async (n) => {
    if (!SHOTS) return;
    await page.evaluate(() => { for (let i = 0; i < 3; i++) window.__sim.render(); });
    await sleep(120);
    await page.screenshot({ path: path.join(OUT, `${NAME}_${n}.jpg`), type: 'jpeg', quality: 70 });
  };
  await shot('000_start');
  for (let sec = 0; sec < MINUTES * 60; sec += 10) {
    const r = await page.evaluate(() => {
      window.__sim.run(10, window.__bot.tick);
      const s = window.__bot.sample();
      return { s, events: window.__bot.events.length, done: window.__FV.state().done, v3: window.__FV.scene.progress.celebrated3, eup: !!window.__FV.scene.progress.flags.rankEup };
    });
    samples.push(r.s);
    if (SAVEAT.length && SAVEAT[0] * 60 <= r.s.t) { const m = SAVEAT.shift(); const sv = await page.evaluate(() => { window.__FV.save(); return localStorage.getItem('frostVillage.save.v1'); }); fs.writeFileSync(path.join(OUT, `${NAME}_save_${m}min.json`), sv || ''); console.log(`[${NAME}] saved snapshot ${m}min (${(sv || '').length} B)`); }
    if (sec % 30 === 20) { const v = await page.evaluate(() => { try { const S = window.__FV.v4 ? window.__FV.v4.state() : null; if (!S) return null; const g = S.growth || {}; return { t: window.__bot.t, coins: window.__FV.scene.economy.coins, earned: window.__FV.scene.economy.earned, clock: S.clock, train: { phase: S.train.phase, riders: S.train.riders, cars: S.train.cars }, arrivals: S.arrivals, vis: S.visitors.length, visSt: S.visitors.reduce((o, v) => { o[v.stage] = (o[v.stage] || 0) + 1; return o; }, {}), cards: (g.cards || []).map((c) => [c.shop || 'std', JSON.stringify(c.got), JSON.stringify(c.need), c.idle]), till: g.till, shops: g.shops, houses: g.houses, happy: g.happy, happyN: g.happyN, rent: g.rent, porters: g.porters, gearned: g.earned, rank: S.rank, district: S.district, people: S.town && S.town.people, census: S.town && S.town.census, mk: window.__FV.state().market, pop: window.__FV.scene.life ? window.__FV.scene.life.people() : null, civic: window.__FV.civic ? window.__FV.civic() : null, cap: window.__FV.scene.popCap ? window.__FV.scene.popCap() : null, waiting: window.__FV.scene.life ? window.__FV.scene.life.waiting.length : null, built: Object.assign({}, window.__FV.scene.built), goal: window.__FV.scene.progress.nextGoal() ? window.__FV.scene.progress.nextGoal().id : null, obj: window.__FV.scene.tutorial.textKey, arrow: !!window.__FV.scene.tutorial.target, task: window.__bot.task ? window.__bot.task.kind + ':' + (window.__bot.task.label || '') : null }; } catch (e) { return { err: String(e) }; } }); if (v) { v4samples.push(v); } }
    if (r.events > lastEvents) {
      const evs = await page.evaluate((k) => window.__bot.events.slice(k), lastEvents);
      for (const e of evs) { console.log(`[${NAME}] t=${e.t.toFixed(1)}s (${(e.t / 60).toFixed(2)} min) ${e.ev} coins=${e.coins ?? ''}`); await shot(String(Math.round(e.t)).padStart(4, '0') + '_' + e.ev); }
      lastEvents = r.events;
    }
    if (sec % 60 === 50) console.log(`[${NAME}] ${r.s.t}s coins=${r.s.coins} earned=${r.s.earned} cap=${r.s.cap} task=${r.s.task} st=${JSON.stringify(r.s.st)} mk=${JSON.stringify(r.s.mk)} w=${r.s.w} obj=${r.s.obj} shelf=${JSON.stringify(r.s.shelf)} front=${JSON.stringify(r.s.front)} leaving=${r.s.leaving} stall=${r.s.stall}  (wall ${((Date.now() - t0) / 1000).toFixed(0)}s)`);
    if (completeAt < 0 && r.done.includes('hire_hunter')) completeAt = r.s.t;
    if (V4) {
      if (v3At < 0 && r.v3) v3At = r.s.t;
      // (stop AFTER min once the village is a 읍 and v3 is complete too)
      if (r.eup && eupAt < 0) eupAt = r.s.t;
      if (eupAt >= 0 && v3At >= 0 && r.s.t >= Math.max(eupAt, v3At) + AFTER * 60) break;
    } else if (V3) {
      if (v3At < 0 && r.v3) v3At = r.s.t;
      if (v3At >= 0 && r.s.t >= v3At + AFTER * 60) break;
    } else if (completeAt >= 0 && r.s.t >= completeAt + AFTER * 60) break;
  }
  const fin = await page.evaluate(() => {
    const b = window.__bot;
    return { longWaits: b.longWaits || [], maxWaitRun: b.maxWaitRun || 0, maxWaitAt: b.maxWaitAt || 0, maxWaitText: b.maxWaitText || null, waitT: b.waitT2 || 0, stuckList: b.stuckList || [], hungryT: +b.hungryT.toFixed(1), events: b.events, taskTime: b.taskTime, noGuideRuns: b.noGuideRuns, stuck: b.stuckEvents, blockedT: b.blockedT, idleT: b.idleT, huntCatches: b.huntCatches, accidental: b.accidental || 0, accList: (b.accList || []).slice(0, 60), huntChaseTime: b.huntChaseTime, log: b.log.slice(-400), state: window.__FV.state(), simT: window.__sim.simT };
  });
  await shot('999_end');
  fs.writeFileSync(path.join(OUT, NAME + '.json'), JSON.stringify({ args, fin, samples, v4samples, errors: log.errors, warnings: log.warnings.slice(0, 200) }, null, 1));
  // (v3) beats: the longest stretch without a new event (unlock, building, land, ...)
  const evT = fin.events.map((e) => e.t).sort((a, b) => a - b);
  let gap = 0, gapAt = 0;
  for (let i = 1; i < evT.length; i++) if (evT[i] - evT[i - 1] > gap) { gap = evT[i] - evT[i - 1]; gapAt = evT[i - 1]; }
  let gap3 = 0, gap3At = 0;
  const ev3 = evT.filter((t) => completeAt >= 0 && t >= completeAt);
  for (let i = 1; i < ev3.length; i++) if (ev3[i] - ev3[i - 1] > gap3) { gap3 = ev3[i] - ev3[i - 1]; gap3At = ev3[i - 1]; }
  console.log(`[${NAME}] BEATS longestGap=${(gap / 60).toFixed(2)}min at ${(gapAt / 60).toFixed(1)}min, v3 longestGap=${(gap3 / 60).toFixed(2)}min at ${(gap3At / 60).toFixed(1)}min, villageComplete=${(completeAt / 60).toFixed(1)}min v3Complete=${v3At >= 0 ? (v3At / 60).toFixed(1) : '-'}min (v3 took ${v3At >= 0 && completeAt >= 0 ? ((v3At - completeAt) / 60).toFixed(1) : '-'}min) hungry=${fin.hungryT}s`);
  console.log(`[${NAME}] DONE sim=${fin.simT.toFixed(0)}s completeAt=${completeAt} v3At=${v3At} stuck=${fin.stuck} accidentalPay=${fin.accidental} blocked=${fin.blockedT.toFixed(1)} idle=${fin.idleT.toFixed(1)} tasks=${JSON.stringify(Object.fromEntries(Object.entries(fin.taskTime).map(([k, v]) => [k, Math.round(v)])))} errors=${log.errors.length} wall=${((Date.now() - t0) / 1000).toFixed(0)}s`);
  for (const e of log.errors.slice(0, 5)) console.log('  ERR', e.slice(0, 300));
  // (v4) the neighbours' milestones
  if (V4) {
    const at = (ev) => { const e = fin.events.find((q) => q.ev === ev || q.ev.startsWith(ev)); return e ? +(e.t / 60).toFixed(2) : null; };
    const shops = fin.events.filter((e) => e.ev.startsWith('shop_open:'));
    const ev4 = evT.filter((t) => t >= (fin.events.find((e) => e.ev === 'tower_east') || { t: 0 }).t);
    let gap4 = 0, gap4At = 0;
    for (let i = 1; i < ev4.length; i++) if (ev4[i] - ev4[i - 1] > gap4) { gap4 = ev4[i] - ev4[i - 1]; gap4At = ev4[i - 1]; }
    console.log(`[${NAME}] V4 towerEast=${at('tower_east')} stationBuilt=${at('built:station')} firstTrain=${at('flag:firstTrain')} firstShop=${shops.length ? (shops[0].t / 60).toFixed(2) : '-'} townVisit=${at('flag:townVisit')} v3Complete=${v3At >= 0 ? (v3At / 60).toFixed(1) : '-'} shops5=${shops.length >= 5 ? (shops[4].t / 60).toFixed(2) : '-'} rankReady=${at('flag:rankReady')} rank=${eupAt >= 0 ? (eupAt / 60).toFixed(2) : '-'} longestGapAfterTowerEast=${(gap4 / 60).toFixed(2)}min at ${(gap4At / 60).toFixed(1)}min stuck=${fin.stuck} shops=${shops.map((e) => e.ev.slice(10) + '@' + (e.t / 60).toFixed(1)).join(',')}`);
  }
  // (v3.5) the hires of every production line (operator / gatherer / raw porter / goods porter / clerk) in time order
  const hires = fin.events.filter((e) => /^(op_|raw_|hire|porter_|zone_)/.test(e.ev));
  console.log(`[${NAME}] HIRES ` + hires.map((e) => `${e.ev}@${(e.t / 60).toFixed(2)}`).join(' '));
  let maxGap = 0, maxAt = '';
  for (let i = 1; i < hires.length; i++) { const g = hires[i].t - hires[i - 1].t; if (g > maxGap) { maxGap = g; maxAt = hires[i].ev; } }
  console.log(`[${NAME}] HIRE-GAP longest=${(maxGap / 60).toFixed(2)}min before ${maxAt}; first hire at ${hires.length ? (hires[0].t / 60).toFixed(2) : '-'}min; stuck list ${JSON.stringify(fin.stuckList)}`);
} catch (e) {
  console.log('FATAL', e && e.stack || e);
  for (const e2 of log.errors.slice(0, 5)) console.log('  ERR', e2.slice(0, 300));
}
await browser.close();
await srv.close();
