// v4 town checks (docs/v4_plan.md §5, §6, §16.1): one game day (600 s) of 솔방울 마을 on the fixed-step clock.
//   node tools/test/town.mjs            (screenshots -> docs/previews/screens_v4/town_*.jpg)
// Every citizen gets somewhere (nobody stuck > 20 s), set pieces at their hours, ≥ 80 % at home 22–05,
// ≥ 90 % of the kids in school during lessons, live rigs within the caps, 100 different looks, people
// conserved (town + train + village = total) all day, the town sim's cost per frame, day / night tint.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render } from './fv_step.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews', 'screens_v4');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const step = (name, ok, info = '') => { results.push({ name, ok }); console.log((ok ? '  ok  ' : ' FAIL ') + name + (info ? '  — ' + info : '')); };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 } });
const ev = (fn, arg) => page.evaluate(fn, arg);
const adv = (s) => advance(page, s);
const shot = async (n) => { await render(page, 3); await page.screenshot({ path: path.join(OUT, 'town_' + n + '.jpg'), type: 'jpeg', quality: 80 }); };
const nudge = (fn, ms = 90000) => waitFor(page, `(() => { const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); return (${fn})(); })()`, ms).then(() => true).catch(() => false);
let fatal = null;
try {
  await ev(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(400);
  await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 180000);
  await sleep(1500);
  await installStepper(page);
  await adv(1);
  await ev(() => { window.__FV.unlockV3(); window.__FV.give(50000); });
  await adv(1);
  await nudge(() => window.__FV.scene.v4 && window.__FV.scene.v4.ready && window.__FV.hasTex('town_civic'));
  await ev(() => window.__FV.v4.repair());
  await nudge(() => window.__FV.hasTex('train_engine') && window.__FV.scene.v4.town && window.__FV.state().v4.tf && window.__FV.state().v4.tf.adult, 150000);
  await adv(8);
  await ev(() => window.__FV.v4.openTown());
  await nudge(() => ['town_shops', 'town_homes', 'town_park', 'town_street'].every((k) => window.__FV.hasTex(k)) && window.__FV.state().v4.tf.child, 150000);
  // the camera in the middle of the town (bodies for the people in view)
  await ev(() => window.__FV.camera(4900, 2450, 1.0));
  await adv(2);
  const looks = await ev(() => { const t = window.__FV.v4.town(); return new Set(t.citizens.map((c) => JSON.stringify([c.person.base, c.person.parts, c.person.colors, c.person.face]))).size; });
  step('100 citizens, all different looks', looks === 100, looks + ' unique');
  // start of a day: 05:00, then run a whole day sampling every 2.5 s
  await ev(() => window.__FV.v4.clock(5));
  await adv(0.5);
  const S = { cons: true, stuck: 0, stuckEx: [], kids: [], home: [], rigs: { full: 0, lite: 0 }, ms: [], arrived: new Set(), tint: {}, live: 0 };
  const total = 600;
  const shots = { 8.6: 'morning', 12.2: 'noon', 15.1: 'school_out', 18.6: 'dusk', 22.5: 'night' };
  const taken = new Set();
  for (let t = 0; t < total; t += 2.5) {
    await adv(2.5);
    const r = await ev(() => {
      const nb = window.__FV.scene.v4, T = nb.town, h = nb.clock.hour();
      const c0 = T.census();
      const out = { h, cons: c0.town + c0.train + c0.village === c0.total && c0.total === T.citizens.length, stuck: [], kids: null, home: null, full: 0, lite: 0, ms: T.stats.ms, live: T.stats.live, arr: [], tint: nb.clock.cur.a };
      for (const c of T.citizens) {
        if (c.state === 'walk' && c.route && (T.T - c.t0) * c.spd > c.route.len + c.spd * 20) out.stuck.push(c.id);
        if (c.state === 'in' || c.state === 'out') out.arr.push(c.id);
      }
      const lesson = (h >= 8.3 && h < 10.4) || (h >= 10.95 && h < 11.9) || (h >= 12.8 && h < 14.9);
      // at school = in the building, in its yard or at its gate (also walking between them, within the school grounds)
      const sch = nb.buildings.find((b) => b.id === 't_school');
      const atSchool = (c) => c.placeObj && c.placeObj.bld === 't_school' && (c.state !== 'walk' || (() => { const p = T.pos(c); return Math.hypot(p.x - sch.x, (p.y - sch.y) * 2) < 520; })());
      if (lesson) { const kids = T.citizens.filter((c) => c.kind === 'student' && !(c.flags & 3)); out.kids = kids.filter(atSchool).length / Math.max(1, kids.length); }
      if (h >= 22.3 || h < 5) { const ppl = T.citizens.filter((c) => !(c.flags & 3)); out.home = ppl.filter((c) => c.state === 'in' && c.placeObj && c.placeObj.id === (c.home + ':in')).length / Math.max(1, ppl.length); }
      const st = window.__FV.scene.dollPool ? window.__FV.scene.dollPool.stats : { full: 0, lite: 0 };
      out.full = st.full; out.lite = st.lite;
      return out;
    });
    if (!r.cons) S.cons = false;
    S.stuck += r.stuck.length; if (r.stuck.length && S.stuckEx.length < 5) S.stuckEx.push(r.h.toFixed(2) + ':' + r.stuck.slice(0, 3).join(','));
    if (r.kids !== null) { S.kids.push(r.kids); if (r.kids < (S.kidsMin ? S.kidsMin[0] : 2)) S.kidsMin = [r.kids, r.h.toFixed(2)]; }
    if (r.home !== null) S.home.push(r.home);
    S.rigs.full = Math.max(S.rigs.full, r.full); S.rigs.lite = Math.max(S.rigs.lite, r.lite);
    S.ms.push(r.ms); S.live = Math.max(S.live, r.live);
    for (const id of r.arr) S.arrived.add(id);
    const ph = r.h < 6 || r.h >= 20 ? 'night' : r.h < 8 ? 'dawn' : r.h < 17 ? 'day' : 'dusk';
    S.tint[ph] = Math.max(S.tint[ph] || 0, r.tint);
    for (const k in shots) if (!taken.has(k) && r.h >= Number(k) && r.h < Number(k) + 0.5) { taken.add(k); await shot(shots[k]); }
  }
  const lg = await ev(() => window.__FV.v4.town().log.map((e) => e.ev + '@' + (e.h || 0)));
  const has = (n, h0, h1) => lg.some((e) => { const [a, b] = e.split('@'); return a === n && Number(b) >= h0 && Number(b) <= h1; });
  step('set pieces at their hours: school bell 8, recess 10:30, hall bell 12, school out 15, shops close 17:30, night 21',
    has('school_bell', 7.9, 8.6) && has('recess', 10.4, 10.9) && has('hall_bell', 11.9, 12.5) && has('school_out', 14.9, 15.5) && has('shops_close', 17.4, 18) && has('night', 20.9, 21.5), lg.filter((e) => !/^trip/.test(e)).slice(0, 12).join(' '));
  step('people conserved all day (town + train + village = total)', S.cons);
  step('nobody stuck on a walk (> 20 s past the end)', S.stuck === 0, S.stuck + ' ' + S.stuckEx.join(' '));
  const minKids = S.kids.length ? Math.min(...S.kids) : 0;
  step('≥ 90 % of the kids are in school during lessons', S.kids.length > 10 && minKids >= 0.9, 'min ' + (minKids * 100).toFixed(0) + '% (at ' + (S.kidsMin && S.kidsMin[1]) + ' h) over ' + S.kids.length + ' samples');
  const minHome = S.home.length ? Math.min(...S.home) : 0;
  step('≥ 80 % at home 22:20–05', S.home.length > 5 && minHome >= 0.8, 'min ' + (minHome * 100).toFixed(0) + '% over ' + S.home.length + ' samples');
  step('every citizen got somewhere during the day', S.arrived.size >= 95, S.arrived.size + ' of 100');
  const P = await ev(() => window.__FV.scene.registry ? (window.__FV.state().v4, { maxRigs: 32, maxLite: 40 }) : null);
  step('live rigs within the caps (≤ 32 full, ≤ 40 lite at zoom 1)', S.rigs.full <= P.maxRigs && S.rigs.lite <= P.maxLite && S.live > 0, JSON.stringify(S.rigs) + ' max live ' + S.live);
  const avgMs = S.ms.reduce((a, b) => a + b, 0) / Math.max(1, S.ms.length), maxMs = Math.max(...S.ms);
  step('town sim cost logged (≤ 0.35 ms per frame on average)', avgMs <= 0.35, 'avg ' + avgMs.toFixed(3) + ' ms, max(smoothed) ' + maxMs.toFixed(3) + ' ms');
  step('day / night: no tint by day, night darker than dusk, dawn in between', (S.tint.day || 0) < 0.06 && S.tint.night > 0.3 && S.tint.dusk > 0.1 && S.tint.night >= S.tint.dusk, JSON.stringify(S.tint));
  // ---- B's API (docs/v4_plan.md §17.3): founders' households and houses in the station district, newcomers (읍), gather
  const api = await ev(() => {
    const nb = window.__FV.scene.v4, T = nb.town;
    const before = T.population();
    const founder = T.citizens.find((c) => c.kind === 'adult' && !(c.flags & 3));
    const fam = T.addDistrictHome('lotA1', 2, { kind: 'keeper', citizen: founder });
    const house = T.addDistrictHome('lotH1', 4);
    const nc = T.growTo(110);
    return { before, fam: fam.map((c) => c.kind), founderIn: fam[0] === founder, house: house.length, district: T.districtPeople(), town: T.townPeople(), newcomers: nc.length, queued: nb.newcomers.length, extra: nb.extra.length, total: T.population() };
  });
  step('district homes: a founder moves in above lot A1 with family, a house of 4 on H1', api.founderIn && api.fam.join() === 'keeper,resident' && api.house === 4 && api.district === 6 && api.town === 110 && api.total === api.before + 5 + api.newcomers && api.queued === api.newcomers, JSON.stringify(api));
  // newcomers ride the next train into the town; the train keeps running
  await ev(() => window.__FV.v4.train('toTown', 1));
  let arrived = false;
  for (let k = 0; k < 40 && !arrived; k++) { await adv(1); arrived = await ev(() => window.__FV.scene.v4.newcomers.length === 0); }
  const cz = await ev(() => { const T = window.__FV.v4.town(); const c = T.census(); return Object.assign(c, { townPeople: T.townPeople() }); });
  step('newcomers (읍): off the train at the town station; people conserved', arrived && cz.town + cz.train + cz.village === cz.total && cz.total === 116 && cz.townPeople === 110, JSON.stringify(cz));
  // the district's people live in the rail strip: bodies there when the camera looks
  await ev(() => window.__FV.v4.clock(10));
  await ev(() => window.__FV.camera(3700, 1760, 1.0));
  await adv(8);
  const dist = await ev(() => { const T = window.__FV.v4.town(); const D = T.citizens.filter((c) => c.flags & 8); return { n: D.length, out: D.filter((c) => c.state !== 'in').length, bodies: D.filter((c) => c.body).length, acts: D.map((c) => c.act + '@' + (c.placeObj ? c.placeObj.id : '-')).slice(0, 6) }; });
  step('the keeper works at his shop, the district has life by day', dist.n === 6 && dist.out >= 1, JSON.stringify(dist));
  await shot('district');
  // a save keeps them: rebuild the town from the saved block (same people, same homes, the founder still the keeper)
  const re = await ev(() => {
    const nb = window.__FV.scene.v4, T = nb.town, sv = nb.serialize();
    const T2 = new T.constructor(nb, { seed: sv.town.seed, extra: sv.town.extra });
    const sig = (L) => L.map((c) => c.id + ':' + c.kind + ':' + c.home + ':' + (c.flags & 8)).join('|');
    const out = { same: sig(T.citizens) === sig(T2.citizens), n: T2.citizens.length, district: T2.districtPeople(), extra: sv.town.extra.length };
    T2.destroy();
    return out;
  });
  step('saved and rebuilt: the same 116 people, homes and kinds', re.same && re.n === 116 && re.district === 6, JSON.stringify(re));
  // the ceremony: people near the station square gather in a ring
  await ev(() => window.__FV.v4.clock(12.2));
  await adv(2);
  const g = await ev(() => window.__FV.v4.town().gather(4886, 2320, 900, 24, 12));
  await ev(() => window.__FV.camera(4886, 2320, 1.0));
  await adv(9);
  const ring = await ev(() => { const T = window.__FV.v4.town(); const L = T.citizens.filter((c) => c.over); return { n: L.length, there: L.filter((c) => c.state === 'out').length }; });
  await shot('gather');
  await adv(40);
  const after = await ev(() => window.__FV.v4.town().citizens.filter((c) => c.over).length);
  step('gather: townsfolk come and stand in a ring, then go back to their day', g >= 5 && ring.there >= Math.min(g, 5) && after === 0, 'called ' + g + ' ' + JSON.stringify(ring) + ' after ' + after);
  // logic cost with 100 townsfolk: plaza view and town view (fixed-step bench, update only)
  await ev(() => window.__FV.v4.clock(12));
  await ev(() => window.__FV.camera(4900, 2450, 1.0)); await adv(2); await render(page, 2);
  const bT = await ev(() => window.__step.bench(240));
  await ev(() => window.__FV.camera(1050, 900, 1.0)); await adv(2); await render(page, 2);
  const bP = await ev(() => window.__step.bench(240));
  console.log('   bench town view ' + JSON.stringify(bT) + '\n   bench plaza view ' + JSON.stringify(bP));
  step('logic per tick logged (town view, plaza view)', bT.avg > 0 && bP.avg > 0, 'town ' + bT.avg + ' ms, plaza ' + bP.avg + ' ms (SwiftShader, shared CPU)');
} catch (e) { fatal = e; console.log('FATAL', e && e.stack || e); }
const errs = log.errors.filter((e) => !/favicon/.test(e));
step('no page errors', errs.length === 0 && !fatal, errs.slice(0, 3).join(' | '));
await browser.close();
await srv.close();
const fails = results.filter((r) => !r.ok).length;
console.log(fails ? `\n${fails} FAILED of ${results.length}` : `\nall ${results.length} passed`);
process.exit(fails ? 1 : 0);
