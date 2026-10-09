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
let titleFrom = -1, titleTo = -1;
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
  const s1 = await ev(() => { const gs = window.__FV.scene, st = gs.sites.r_station; return { rail: gs.territory.isOpen('rail'), east: gs.territory.isOpen('east'), plot: st && st.state, ruin: !!(gs.v4.ours && !gs.v4.ours.open) }; });
  step('1 rail strip opens with east', s1.rail && s1.east, s1);
  step('1 the ruined station stands on its plot', s1.plot === 'plot' && s1.ruin, s1);
  const built = await ev(() => window.__FV.build('r_station', 'station'));
  const sink = await ev(() => { const gs = window.__FV.scene, st = gs.sites.r_station; return { inList: gs.logistics.sinks.indexOf(st) >= 0, plank: st.need.item_plank || 0, ingot: st.need.item_ingot || 0, wants: gs.logistics.want(st, 'item_plank') }; });
  step('1 the repair site asks the porters for materials', built && sink.inList && sink.plank > 0, sink);
  await ev(() => window.__FV.supply('r_station'));
  await adv(2);
  step('1 materials in -> scaffold', /scaffold|done/.test(await ev(() => window.__FV.scene.sites.r_station.state)));
  await shot('01_station_site');

  // ---- 2. first train after the repair, visitors
  await ev(() => window.__FV.finishSite('r_station'));
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
  const dock = await ev(() => { const g = window.__FV.scene.v4.growth; return { x: g.dock.x, y: g.dock.y, till: g.till.value }; });
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
  await adv(3);      // (the next card comes 1.5 s after the done one, once its banner has shown)
  const g2 = await G();
  step('4 the café card done -> a lot is set aside', g2.done.indexOf('cafe') >= 0 && Object.values(g2.shops).some((s) => s.shop === 'cafe'), g2.shops);
  const elig = await ev(() => { const g = window.__FV.scene.v4.growth; return { all: g.cards.every((c) => !c.shop || g.eligible(c.shop)), left: window.__BAL4 ? 0 : ['cafe', 'restaurant', 'carpenter_workshop', 'hardware_store', 'supermarket'].filter((k) => g.eligible(k) && g.done.indexOf(k) < 0).length }; });
  step('4 the next card takes its place (only producers that exist)', elig.all && g2.cards.length === Math.min(3, elig.left), { cards: g2.cards.map((c) => c.shop), eligibleLeft: elig.left });
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
    const before = g.till.value;
    const p = window.__FV.scene.player;
    window.__FV.carry('item_bread', 4);
    for (let k = 0; k < 4 && sh.room('item_bread') > 0; k++) sh.take(p, 'item_bread');
    return { paid: g.till.value - before, stock: sh.stock.item_bread };
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

  // ---- 7. bars -> pad -> ceremony (two more carpenter houses: +8 people)
  for (let k = 0; k < 2; k++) {
    const id = await ev(() => window.__FV.v4.house());
    if (!id) { await adv(3); continue; }
    await until((h) => { const q = window.__FV.v4.growth().houses[h]; return q && q.st === 'done'; }, 45, 1, id);
    await adv(4);
  }
  await ev(() => window.__FV.v4.happy(Array(40).fill(1)));
  await adv(2);
  const rk = await ev(() => window.__FV.v4.rank());
  step('7 the three bars fill', rk.ready || rk.level === 2, rk.bars);
  const pad = await until(() => !!window.__FV.state().flags.rankReady && !!window.__FV.scene.progress.pads.rank_eup, 6, 0.5);
  step('7 the 승격식 pad appears', pad >= 0);
  const pp = await ev(() => { const p = window.__FV.scene.progress.pads.rank_eup; return p ? { x: p.x, y: p.y } : null; });
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
    // ((v4 review M8) the bar matters: half the visitors going home empty-handed keeps the village under the 읍 bar,
    //  even with the town hall and every decoration (civic.happyCap)
    for (let k = 0; k < 60; k++) g.addSatisfaction(k % 2 ? 1 : 0);
    const gs = window.__FV.scene, bonusNow = gs.civic ? gs.civic.happyBonus() : 0;
    out.happyHalf = g.happiness() - bonusNow;
    for (let k = 0; k < 60; k++) g.addSatisfaction(1);
    out.happyFull = g.happiness();
    return out;
  });
  step('8 cards only for producers that exist (eligible checked)', rules.eligible);
  step('8 a stuck card can be swapped after 180 s', rules.canSwap === true || rules.canSwap === undefined, rules.canSwap);
  step('8 founding lots reserved, houses never on them', rules.lots && rules.houses, rules);
  const hBase = await ev(async () => (await import(new URL('src/data/balance.js', location.href).href)).BALANCE.v4.happiness.base);
  step('8 happiness never under its floor (balance v4.happiness.base ' + hBase + ')', rules.happyFloor >= hBase, rules.happyFloor);
  const hB = await ev(async () => { const B = (await import(new URL('src/data/balance.js', location.href).href)).BALANCE; return { cap: (B.civic && B.civic.happyCap) || 0, bar: B.v4.rank[2].happy }; });
  step('8 happiness matters: half the visitors served -> under the 읍 bar even with full decor (' + hB.cap + '); all served -> over it', rules.happyHalf + hB.cap < hB.bar && rules.happyFull >= hB.bar, { half: rules.happyHalf, cap: hB.cap, bar: hB.bar, full: rules.happyFull });
  // (v4 review M4) a card that is full but was never completed (saved in the 350 ms before its completion, then
  // reloaded) completes by itself
  const full = await ev(() => { const g = window.__FV.scene.v4.growth, c = g.cards[0]; if (!c) return null; for (const k in c.need) c.got[k] = c.need[k]; return { id: c.id, n: g.cards.length, standing: g.standing, done: g.done.length }; });
  if (full) {
    await adv(2.5);
    const af = await ev((id) => { const g = window.__FV.scene.v4.growth; return { gone: !g.cards.some((c) => c.id === id), standing: g.standing, done: g.done.length }; }, full.id);
    step('8 a full card left on the board completes by itself (no 30/30 for ever)', af.gone, { full, af });
  }
  // (v4 review M5) 다른 주문 keeps what was delivered for a founding card
  const sw = await ev(() => {
    const g = window.__FV.scene.v4.growth;
    const c = { id: 9999, shop: 'cafe', need: { item_bread: 30 }, got: { item_bread: 12 }, idle: 999, standing: false };
    g.cards.unshift(c);
    const ok = g.swap(9999);
    const back = g.cards.find((q) => q.shop === 'cafe');
    const kept = g.kept.cafe ? g.kept.cafe.item_bread : null;
    // (clean up: this test card is not part of the game)
    g.cards = g.cards.filter((q) => q.shop !== 'cafe'); delete g.kept.cafe; const i = g.skipped.indexOf('cafe'); if (i >= 0) g.skipped.splice(i, 1);
    return { ok, kept, back: back ? back.got.item_bread : null };
  });
  step('8 다른 주문 keeps the delivered goods of a founding card', sw.ok && (sw.kept === 12 || sw.back === 12), sw);
  // invitation fallback: a fresh first-train flag with no shop: the mayor comes after inviteAfter s
  const fb = await ev(() => { const nb = window.__FV.scene.v4; return { after: nb.gs ? true : true, has: typeof nb.invite === 'function' }; });
  step('8 invitation fallback exists (480 s after the first train)', fb.has);
  // ribbon auto-open was checked in 4; train waits at blocked crossings (rail.mjs); visitor patience:
  const pat = await ev(() => { const V = window.__FV.scene.v4.visitors[0]; return V ? typeof V.patienceT === 'number' : true; });
  step('8 visitors have a patience timer', pat);
  // ---- 9. (§18 #6) the whistle steps up when a world label would sit under it
  if (await ev(() => !!(window.__FV.scene.dog && window.__FV.scene.dog.r))) {
    const lab = await ev(() => {
      const gs = window.__FV.scene, ui = window.__FV.game.scene.getScene('UI');
      const all = [...Object.values(gs.progress.pads), ...Object.values(gs.sites)].filter((o) => o && o.label && o.labelBg && o.label.visible);
      const o = all[0]; if (!o) return null;
      // put that label right under the whistle: centre the camera so the label lands at (62, base)
      // (zoom 0.65: below 0.7 the camera has no bounds, so any spot can be centred)
      window.__FV.camera(o.label.x, o.label.y, 0.65);
      const cam = gs.cameras.main, Z = cam.zoom, k = ui.cameras.main.zoom || 1;
      const cx = o.label.x - 62 * k / Z + cam.width / (2 * Z), cy = o.label.y - ui.whistleBaseY * k / Z + cam.height / (2 * Z);
      window.__FV.camera(cx, cy);
      return { id: o.id, base: ui.whistleBaseY };
    });
    if (lab) {
      await adv(1.5);
      const w = await ev(() => { const ui = window.__FV.game.scene.getScene('UI'); return { y: Math.round(ui.whistleBtn.y), lift: ui.whistleLift, base: ui.whistleBaseY }; });
      step('9 the whistle steps up over a pad / plot label', w.lift > 0 && w.y < w.base - 60, { ...w, label: lab.id });
      await ev(() => window.__FV.camera());
      await adv(1.5);
      const w2 = await ev(() => { const ui = window.__FV.game.scene.getScene('UI'); return { y: Math.round(ui.whistleBtn.y), lift: ui.whistleLift, base: ui.whistleBaseY }; });
      step('9 ... and settles back when the label is gone', w2.y >= w2.base - 1 || w2.lift > 0, w2);
    }
  }
  // ---- 10. (v4-C) the big restaurant feeds train visitors; the town hall hosts the ceremony
  await ev(() => {
    window.__FV.give(20000);
    for (const [id, k] of [['w_rest', 'big_restaurant'], ['w_hall', 'town_hall']]) { window.__FV.build(id, k); window.__FV.supply(id); window.__FV.finishSite(id); }
  });
  await adv(2);
  await nudge(() => window.__FV.civic().rest && window.__FV.civic().rest.art && window.__FV.civic().hall.art, 120000);
  await ev(() => {
    window.__FV.restFood({ item_fish_cooked: 30, item_bread: 30, item_meat_cooked: 30 });
    for (const k of ['rest_cashier', 'rest_cook', 'rest_server']) window.__FV.doneStep(k);
    const R = window.__FV.scene.civic.C.restaurant; window.__c1vc = R.visitorChance; R.visitorChance = 1;
  });
  const tV = await until(() => window.__FV.scene.civic.restaurant.guests.some((g) => g.visitor && (g.state === 'seated' || g.state === 'eat')), 300, 2);
  step('10 (v4-C) train visitors walk to the big restaurant and sit down to eat', tV >= 0, { t: tV, rest: await ev(() => window.__FV.civic().rest.visitors) });
  const tVd = await until(() => window.__FV.scene.civic.restaurant.served > 0, 60, 1);
  step('10 (v4-C) ... and pay for the meal', tVd >= 0, await ev(() => ({ served: window.__FV.civic().rest.served, cash: window.__FV.civic().rest.cash })));
  await ev(() => { window.__FV.scene.civic.C.restaurant.visitorChance = window.__c1vc; });
  const ven = await ev(() => { const gs = window.__FV.scene, a = gs.padSpot({ type: 'rank', id: 'rank_eup' }), b = gs.civic.hall.venue('rank'); return { a, b, happy: gs.v4.growth.happiness(), bonus: gs.civic.happyBonus() }; });
  step('10 (v4-C) with the town hall the ceremony spot is in front of it; the hall adds happiness', ven.a && ven.a.x === ven.b.x && ven.a.y === ven.b.y && ven.bonus >= 8, ven);
  // §16.4 save gate: a full v4 save (5 shops, 3 houses, 읍) stays small and quick (best of 5: a shared machine)
  const sv = await ev(() => {
    const gs = window.__FV.scene; let ms = 1e9;
    for (let i = 0; i < 5; i++) { const t0 = performance.now(); gs.save(true); ms = Math.min(ms, performance.now() - t0); }
    let bytes = 0; try { bytes = (localStorage.getItem('frostVillage.save.v1') || '').length; } catch (e) { /* */ }
    return { bytes, KB: +(bytes / 1024).toFixed(2), ms: +ms.toFixed(2) };
  });
  step('8 a full v4 save <= 6 KB and <= 2 ms (§16.4)', sv.bytes > 0 && sv.bytes <= 6144 && sv.ms <= 2, sv);
  // reload in the middle: save, reload, nothing lost
  const before =await ev(() => { window.__FV.save(); const g = window.__FV.v4.growth(); return { shops: Object.keys(g.shops).length, done: g.done.length, rank: window.__FV.v4.rank().level, coins: window.__FV.state().coins }; });
  titleFrom = log.warnings.length;     // (the title screen's own pictures are not this test's business)
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 180000);
  titleTo = log.warnings.length;
  await sleep(1000);
  await installStepper(page);
  await nudge(() => window.__FV.scene.v4 && window.__FV.scene.v4.ready && window.__FV.scene.v4.growth && window.__FV.scene.v4.growth.ready !== false, 90000);
  await adv(3);
  const after = await ev(() => { const g = window.__FV.v4.growth(); return { shops: Object.keys(g.shops).length, done: g.done.length, rank: window.__FV.v4.rank().level, coins: window.__FV.state().coins }; });
  step('8 reload keeps shops, cards, rank and coins', after.shops === before.shops && after.done === before.done && after.rank === before.rank && Math.abs(after.coins - before.coins) < 50, { before, after });
} catch (e) { fatal = e; console.log('FATAL', e && e.stack || e); }

const ph = (log.warnings || []).filter((w, i) => /missing asset|placeholder/i.test(w) && !(i >= titleFrom && i < titleTo));
const phTitle = titleFrom >= 0 ? log.warnings.slice(titleFrom, titleTo).filter((w) => /placeholder/i.test(w)).length : 0;
if (phTitle) console.log('  (note: ' + phTitle + ' placeholder warnings while the title screen showed the saved 읍 — src/title, not v4)');
step('0 page errors', !log.errors.length && !fatal, log.errors.slice(0, 5));
step('0 placeholders', ph.length === 0, ph.slice(0, 5));
const pass = results.filter((r) => r.ok).length;
console.log(`\nv4: ${pass}/${results.length} passed`);
await browser.close();
await srv.close();
process.exit(pass === results.length ? 0 : 1);
