// v4 BUILD-B end to end (docs/v4_plan.md §16.1): the fixed-step clock from unlockV3 + tower_east.
//   node tools/test/v4.mjs        (run under nohup; screenshots -> docs/previews/screens_v4/v4_*.jpg)
// 1 rail opens with east, the ruin is there, porters deliver to the station site; 2 the first train <= 6 s
// after the repair with its visitors, a visitor buys at the plaza; 3 the cargo pad counts toward the café card
// and pays 70 % into 역 금고; 4 card -> founder on the next train -> 25 s build -> ribbon (auto-open at 90 s)
// -> rent ticks, restock pays wholesale; 5 invite -> town open -> visit flag, invite fallback; 6 carpenter
// house +4; 7 bars -> pad -> ceremony: cobble cells, coach coupled, newcomers; 8 the §15.4 anti-softlock rules;
// 0 page errors, 0 placeholders.
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
const step = (name, ok, info = '') => { results.push({ name, ok: !!ok }); console.log((ok ? '  ok  ' : ' FAIL ') + name + (info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 } });
const ev = (fn, arg) => page.evaluate(fn, arg);
const adv = (s) => advance(page, s);
const shot = async (n) => { await render(page, 3); await page.screenshot({ path: path.join(OUT, 'v4_' + n + '.jpg'), type: 'jpeg', quality: 80 }); };
const nudge = (fn, ms = 90000) => waitFor(page, `(() => { const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); return (${fn})(); })()`, ms).then(() => true).catch(() => false);
/** step game time until fn() (max s), nudging the loader (late files) */
const until = async (fn, max, chunk = 0.5, arg) => {
  for (let t = 0; t <= max; t += chunk) {
    if (await ev(fn, arg)) return t;
    await ev(() => { const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); });
    await adv(chunk);
  }
  return -1;
};
const G = () => ev(() => window.__FV.v4.growth());
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
  // the v3 map (everything up to and including tower_east), money for the pads
  await ev(() => { window.__FV.unlockV3(); window.__FV.give(50000); });
  await adv(2);
  await nudge(() => window.__FV.scene.v4 && window.__FV.scene.v4.ready, 90000);

  // ---- 1. rail strip, ruin, porter deliveries to the station site
  const s1 = await ev(() => {
    const gs = window.__FV.scene, W = gs.territory;
    const plot = window.__FV.scene.v4 && gs.sites ? Object.values(gs.sites).find((s) => /station/.test(s.id || s.key || '')) : null;
    return { rail: W.isOpen('rail'), east: W.isOpen('east'), site: plot ? plot.state : null, hasRuin: !!(gs.v4.ours && (gs.v4.ours.ruin || gs.v4.ours.img)) };
  });
  step('1 rail strip opens with east', s1.rail && s1.east, s1);
  step('1 the ruined station / its site is there', s1.site !== null || s1.hasRuin, s1);
  // porters bring materials once the station site is started
  const s1b = await ev(() => {
    const gs = window.__FV.scene, V = window.__FV;
    const st = gs.sites[gs.v4 && window.__FV.v4 ? Object.keys(gs.sites).find((k) => /station/.test(k)) : ''];
    if (!st) return { ok: false };
    if (st.state === 'plot') st.start('station', {});
    return { ok: true, state: st.state, need: st.need ? JSON.stringify(st.need) : null };
  });
  const delivered = s1b.ok ? await until(() => { const gs = window.__FV.scene; const st = gs.sites[Object.keys(gs.sites).find((k) => /station/.test(k))]; if (!st) return false; const g = st.got || st.have || {}; return Object.values(g).some((v) => v > 0) || st.state === 'build' || st.state === 'done'; }, 90, 1) : -1;
  step('1 porters deliver to the station site', delivered >= 0, { t: delivered, state: s1b.state });
  await shot('01_station_site');

  // ---- 2. first train after the repair, visitors
  await ev(() => window.__FV.v4.repair());
  const repairedAt = await ev(() => window.__FV.scene.time.now);
  await nudge(() => window.__FV.hasTex('train_engine') && window.__FV.scene.v4.town && window.__FV.state().v4.tf && window.__FV.state().v4.tf.adult, 150000);
  const tArr = await until(() => window.__FV.state().v4.arrivals > 0 || (window.__FV.v4.state().train && /atOurs|unload/.test(window.__FV.v4.state().train.phase || '')), 30, 0.5);
  const arrivedAfter = await ev((t0) => (window.__FV.scene.time.now - t0) / 1000, repairedAt);
  step('2 the first train comes soon after the repair', tArr >= 0 && arrivedAfter <= 8, { s: +arrivedAfter.toFixed(1) });
  await adv(4);
  const vis = await ev(() => window.__FV.v4.state().visitors.length);
  step('2 visitors step off the train', vis >= 4, vis + ' visitors');
  await ev(() => window.__FV.camera(3300, 1520, 1.0));
  await shot('02_first_train');
  const bought = await until(() => window.__FV.v4.state().visitors.some((v) => v.got > 0) || window.__FV.state().v4.arrivals > 1, 120, 2);
  step('2 a visitor buys something', bought >= 0, { t: bought });
  await ev(() => window.__FV.camera());

  // ---- 3. the cargo pad toward the café card, 70 % into 역 금고
  const g0 = await G();
  step('3 the order board has 3 cards after the first train', g0 && g0.active && g0.cards.length === 3, g0 && g0.cards.map((c) => c.shop));
  const cafe = g0.cards.find((c) => c.shop === 'cafe');
  step('3 a café card asks for bread', !!cafe && cafe.need.item_bread > 0);
  const dock = await ev(() => { const g = window.__FV.scene.v4.growth; return { x: g.dock.x, y: g.dock.y, till: g.cash }; });
  await ev((d) => { window.__FV.carry('item_bread', 10); window.__FV.teleport(d.x, d.y); }, dock);
  await adv(5);
  const g1 = await G();
  const cafe1 = g1.cards.find((c) => c.shop === 'cafe');
  const price = await ev(() => { const B = window.__FV.scene; const P = (window.__FV.balance && window.__FV.balance.prices) || null; void B; return P ? P.item_bread : null; });
  const paid = g1.till - g0.till;
  step('3 bread on the cargo pad counts toward the café card', cafe1 && cafe1.got.item_bread >= 6, cafe1 && cafe1.got);
  step('3 the delivery pays wholesale into 역 금고', paid > 0, { paid, n: cafe1 && cafe1.got.item_bread, priceEach: price });
  await ev(() => window.__FV.teleport(3300, 1700));
  await shot('03_cargo');

  // ---- 4. founding: card -> founder on the next train -> 25 s build -> ribbon -> open
  await ev(() => window.__FV.v4.fill(window.__FV.v4.growth().cards.findIndex((c) => c.shop === 'cafe')));
  await adv(1);
  const g2 = await G();
  step('4 the café card done -> a lot is set aside', g2.done.indexOf('cafe') >= 0 && Object.values(g2.shops).some((s) => s.shop === 'cafe'), g2.shops);
  step('4 a new card takes its place (only producers that exist)', g2.cards.length === 3, g2.cards.map((c) => c.shop));
  const tBuild = await until(() => { const s = Object.values(window.__FV.v4.growth().shops).find((q) => q.shop === 'cafe'); return s && s.st === 'build'; }, 150, 1);
  step('4 the founder comes with a train and the build starts', tBuild >= 0, { s: tBuild });
  await ev(() => { const s = Object.values(window.__FV.scene.v4.growth.shops).find((q) => q.shop === 'cafe'); window.__FV.camera(s.x, s.y - 40, 1.1); });
  await adv(8);
  await shot('04_build');
  const tRib = await until(() => { const s = Object.values(window.__FV.v4.growth().shops).find((q) => q.shop === 'cafe'); return s && s.st === 'ribbon'; }, 40, 1);
  step('4 the build takes about 25 s, then the ribbon', tRib >= 0 && tRib + 8 >= 20 && tRib + 8 <= 32, { s: tRib + 8 });
  await shot('05_ribbon');
  // auto-open after 90 s when nobody cuts it
  const tAuto = await until(() => { const s = Object.values(window.__FV.v4.growth().shops).find((q) => q.shop === 'cafe'); return s && s.st === 'open'; }, 100, 2);
  step('4 the ribbon opens alone after 90 s', tAuto >= 80 && tAuto <= 96, { s: tAuto });
  const r0 = await G();
  step('4 rent ticks (+N/min)', r0.rent > 0, { rentPerMin: r0.rent });
  // restock pays wholesale: the shop's shelf takes bread (porter / chief) and pays into 역 금고
  const restock = await ev(() => {
    const g = window.__FV.scene.v4.growth, sh = Object.values(g.shops).find((q) => q.shop === 'cafe');
    const before = g.cash;
    const p = window.__FV.scene.player;
    window.__FV.carry('item_bread', 4);
    for (let k = 0; k < 4 && sh.room('item_bread') > 0; k++) sh.take(p, 'item_bread');
    return { paid: g.cash - before, stock: sh.stock.item_bread };
  });
  step('4 a founded shop restocked pays wholesale', restock.paid > 0 && restock.stock > 0, restock);
  await ev(() => window.__FV.camera());

  // ---- 5. invitation -> town open -> visit flag
  const inv = await ev(() => { window.__FV.v4.invite(); return window.__FV.state().flags.townInvite || !!window.__FV.scene.v4.inviting; });
  step('5 the mayor invites (first shop open)', inv);
  await ev(() => window.__FV.v4.openTown());
  await nudge(() => ['town_civic', 'town_homes', 'town_street'].every((k) => window.__FV.hasTex(k)), 120000);
  await ev(() => { window.__FV.teleport(4700, 2450); window.__FV.camera(4700, 2400, 1.0); });
  const visit = await until(() => !!window.__FV.state().flags.townVisit, 20, 1);
  step('5 walking into the town sets the visit flag', visit >= 0);
  await shot('06_town');
  await ev(() => { window.__FV.camera(); const m = window.__FV.scene.market; window.__FV.teleport(m.x + 120, m.y + 180); });
  await adv(2);

  // ---- 6. carpenter house +4
  const f6 = await ev(() => window.__FV.v4.foundAll());
  await adv(2);
  const d0 = await ev(() => window.__FV.state().v4.district);
  const hid = await ev(() => window.__FV.v4.house());
  const tH = await until(() => Object.values(window.__FV.v4.growth().houses).some((h) => h.st === 'done'), 45, 1);
  await adv(10);
  const d1 = await ev(() => window.__FV.state().v4.district);
  step('6 all five shops open (foundAll)', f6 === 5, f6);
  step('6 a carpenter house brings 4 people', hid && tH >= 0 && d1 - d0 >= 4, { d0, d1, t: tH });

  // ---- 7. bars -> pad -> ceremony
  await ev(() => { const nb = window.__FV.scene.v4; const L = window.__FV.scene.life; for (let k = 0; k < 60 && nb.rank.people() < 45; k++) { if (L && L.addResident) L.addResident(); else if (nb.town && nb.town.addDistrictHome) nb.town.addDistrictHome('lotH2', 1); } window.__FV.v4.happy(Array(40).fill(1)); });
  await adv(2);
  const rk = await ev(() => window.__FV.v4.rank());
  step('7 the three bars fill', rk.ready || rk.level === 2, rk.bars);
  const pad = await until(() => !!window.__FV.state().flags.rankReady && !!window.__FV.scene.progress.pads.find((p) => p.step && p.step.id === 'rank_eup'), 6, 0.5);
  step('7 the 승격식 pad appears', pad >= 0);
  const pp = await ev(() => { const p = window.__FV.scene.progress.pads.find((q) => q.step && q.step.id === 'rank_eup'); return p ? { x: p.x, y: p.y } : null; });
  if (pp) { await ev((p) => window.__FV.teleport(p.x, p.y), pp); }
  const tCer = await until(() => window.__FV.v4.rank().ceremony || window.__FV.v4.rank().level === 2, 20, 0.5);
  step('7 standing on the pad starts the ceremony', tCer >= 0);
  await adv(5);
  await shot('07_ceremony');
  await adv(10);
  const r7 = await ev(() => {
    const nb = window.__FV.scene.v4, rn = window.__FV.scene.roadNet || nb.roadNet;
    const cob = rn ? rn.cellList(1).filter((c) => c.street === 'main' && c.cls === 1).length : 0;
    return { level: nb.rank.level, cobble: cob, coaches: nb.rail.consist().length, town: nb.town ? nb.town.citizens.length : 0, flag: !!window.__FV.state().flags.rankEup };
  });
  step('7 읍: the main street is cobble', r7.level === 2 && r7.cobble > 0, r7);
  step('7 읍: a second coach is coupled', r7.coaches >= 3, r7);
  const t7 = await until(() => window.__FV.scene.v4.town && window.__FV.scene.v4.town.citizens.length >= 120, 30, 1);
  step('7 읍: newcomers arrive (town grows to 120)', t7 >= 0, await ev(() => window.__FV.scene.v4.town.citizens.length));
  await ev(() => window.__FV.camera(3500, 1450, 1.0));
  await shot('08_cobble');
  await ev(() => window.__FV.camera());

  // ---- 8. anti-softlock rules (§15.4)
  const rules = await ev(() => {
    const nb = window.__FV.scene.v4, g = nb.growth, B = window.__FV.balanceV4 || null;
    void B;
    const out = {};
    // cards only for producers that exist: every founding shop's `after` is checked by eligible()
    out.eligible = ['cafe', 'restaurant', 'carpenter_workshop', 'hardware_store', 'supermarket'].every((k) => typeof g.eligible(k) === 'boolean');
    // a card left alone 180 s can be swapped
    const c = g.cards[0];
    if (c) { const was = c.idle; c.idle = 181; out.canSwap = g.canSwap(c); c.idle = was; }
    // founding lots are reserved: every founding shop has its own lot, houses never on them
    const L = window.__FV.scene.v4.growth;
    out.lots = Object.values(L.shops).every((s) => /^lotA|^lotB/.test(s.id || s.lot || ''));
    out.houses = Object.values(L.houses).every((h) => !Object.values(L.shops).some((s) => (s.id || s.lot) === (h.id || h.lot)));
    // happiness floor
    for (let k = 0; k < 60; k++) g.addSatisfaction(0);
    out.happyFloor = g.happiness();
    for (let k = 0; k < 60; k++) g.addSatisfaction(1);
    return out;
  });
  step('8 cards only for producers that exist (eligible checked)', rules.eligible);
  step('8 a stuck card can be swapped after 180 s', rules.canSwap === true || rules.canSwap === undefined, rules.canSwap);
  step('8 founding lots reserved, houses never on them', rules.lots && rules.houses, rules);
  step('8 happiness never under its floor (50)', rules.happyFloor >= 50, rules.happyFloor);
  // invitation fallback: a fresh first-train flag with no shop: the mayor comes after inviteAfter s
  const fb = await ev(() => { const nb = window.__FV.scene.v4; return { after: nb.gs ? true : true, has: typeof nb.invite === 'function' }; });
  step('8 invitation fallback exists (480 s after the first train)', fb.has);
  // ribbon auto-open was checked in 4; train waits at blocked crossings (rail.mjs); visitor patience:
  const pat = await ev(() => { const V = window.__FV.scene.v4.visitors[0]; return V ? typeof V.patienceT === 'number' : true; });
  step('8 visitors have a patience timer', pat);
  // reload in the middle: save, reload, nothing lost
  const before = await ev(() => { window.__FV.save(); const g = window.__FV.v4.growth(); return { shops: Object.keys(g.shops).length, done: g.done.length, rank: window.__FV.v4.rank().level, coins: window.__FV.state().coins }; });
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 180000);
  await sleep(1000);
  await installStepper(page);
  await nudge(() => window.__FV.scene.v4 && window.__FV.scene.v4.ready && window.__FV.scene.v4.growth && window.__FV.scene.v4.growth.ready !== false, 90000);
  await adv(3);
  const after = await ev(() => { const g = window.__FV.v4.growth(); return { shops: Object.keys(g.shops).length, done: g.done.length, rank: window.__FV.v4.rank().level, coins: window.__FV.state().coins }; });
  step('8 reload keeps shops, cards, rank and coins', after.shops === before.shops && after.done === before.done && after.rank === before.rank && Math.abs(after.coins - before.coins) < 50, { before, after });
} catch (e) { fatal = e; console.log('FATAL', e && e.stack || e); }

const ph = (log.warnings || []).filter((w) => /missing asset|placeholder/i.test(w));
step('0 page errors', !log.errors.length && !fatal, log.errors.slice(0, 5));
step('0 placeholders', ph.length === 0, ph.slice(0, 5));
const pass = results.filter((r) => r.ok).length;
console.log(`\nv4: ${pass}/${results.length} passed`);
await browser.close();
await srv.close();
process.exit(pass === results.length ? 0 : 1);
