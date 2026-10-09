// (v4-C) 큰 식당 end to end on the fixed-step clock (docs/기획서_v4_추가요청.md §4).
//   node tools/test/restaurant.mjs        (run under nohup; screenshots -> docs/previews/screens_v4/c1_rest_*.jpg)
// 1 the XL plots of the west strip offer the hall and the restaurant once the east watchtower stands; building it
// pays its coins and the porters' materials; 2 an empty pantry brings no guests, the chief and the goods porters
// fill it; 3 guests queue and wait while nobody stands at the register (the v2 rule), the arrow says so; 4 the chief
// at the register takes the order, the guest sits at a terrace table; 5 the kitchen: nothing is cooked until the chief
// stands on the kitchen pad, the plate flies to the table, the guest eats, pays (coins on the cash pad) and leaves;
// 6 a guest who waits too long at the table leaves without paying and the uncooked food goes back to the pantry;
// 7 the staff (계산 점원, 요리사, 서빙 직원) run it with the chief away, 정식 combos are ordered; 8 train visitors
// plan a meal here; 9 save + reload keeps the pantry (incl. ordered food) and the cash; 0 page errors / placeholders.
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
const shot = async (n) => { await render(page, 3); await page.screenshot({ path: path.join(OUT, 'c1_rest_' + n + '.jpg'), type: 'jpeg', quality: 82 }); };
const nudge = (fn, ms = 90000) => waitFor(page, `(() => { const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); return (${fn})(); })()`, ms).then(() => true).catch(() => false);
const until = async (fn, max, chunk = 0.5, arg) => {
  for (let t = 0; t <= max; t += chunk) {
    if (await ev(fn, arg)) return t;
    await ev(() => { const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); });
    await adv(chunk);
  }
  return -1;
};
const R = () => ev(() => window.__FV.civic().rest);
const W = (k) => ev((k) => window.__FV.where(k), k);
const goTo = async (k, dy = 0) => { const p = await W(k); if (p) await ev(([p, dy]) => { window.__FV.teleport(p.x, p.y + dy); window.__FV.setInput(0, 0); }, [p, dy]); return p; };
/** the chief somewhere quiet (not on a pad of the restaurant) */
const away = () => ev(() => { const gs = window.__FV.scene; window.__FV.teleport(-700, 1500); gs.player.sync(0); });
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
  // ---- 1. the XL plots
  const pre = await ev(() => { const gs = window.__FV.scene; return { shown: !!(gs.sites.w_rest && gs.sites.w_rest.shown), west: gs.territory.isOpen('west') }; });
  step('1 the west strip is open from the start, its XL plots wait for the east watchtower', pre.west && !pre.shown, pre);
  await ev(() => { window.__FV.unlockV3(); window.__FV.give(30000); });
  await adv(2);
  const ch = await ev(() => window.__FV.choices('w_rest'));
  step('1 an XL plot offers the 마을회관 and the 큰 식당', ch && ch.length === 2 && ch.every((c) => !c.locked) && ch.some((c) => c.key === 'big_restaurant') && ch.some((c) => c.key === 'town_hall'), ch);
  const coins0 = await ev(() => window.__FV.state().coins);
  const ok = await ev(() => window.__FV.build('w_rest', 'big_restaurant'));
  const site = await ev(() => { const st = window.__FV.scene.sites.w_rest; return { state: st.state, need: st.need, coins: window.__FV.state().coins, sink: window.__FV.scene.logistics.sinks.indexOf(st) >= 0 }; });
  step('1 building it pays its coins and asks the porters for planks + ingots', ok && site.state === 'foundation' && coins0 - site.coins === 1500 && site.need.item_plank > 0 && site.sink, site);
  await ev(() => window.__FV.supply('w_rest'));
  await until(() => window.__FV.scene.sites.w_rest.state !== 'foundation', 5, 0.5);
  await ev(() => window.__FV.finishSite('w_rest'));
  await adv(1);
  const art = await nudge(() => window.__FV.civic().rest && window.__FV.civic().rest.art, 120000);
  const r1 = await R();
  step('1 the big restaurant stands (town art arrived)', !!r1 && art, r1 && { art: r1.art });
  // the staff pads: the cashier first
  await adv(2);
  const pads1 = await ev(() => window.__FV.state().pads.filter((p) => /^rest_/.test(p)));
  step('1 the 계산 점원 pad appears with the restaurant (staff hired one after another)', pads1.includes('rest_cashier') && !pads1.includes('rest_cook'), pads1);

  // ---- 2. no food, no guests; the chief and the porters fill the pantry
  await away();
  await ev(() => { const P = window.__FV.scene.civic.restaurant.pantry; P.clear(window.__FV.scene.effects); });
  await adv(12);
  const r2 = await R();
  step('2 an empty pantry brings no guests', r2.queue === 0 && r2.guests === 0, r2);
  await ev(() => { window.__FV.clearStack(); window.__FV.carry('item_bread', 6); });
  await goTo('restPantry');
  await adv(3);
  const r2b = await R();
  step('2 the chief puts cooked food into the pantry', r2b.pantry.item_bread >= 6, r2b.pantry);
  // goods porters deliver (the grill / bakery / smokehouse porters of unlockV3): food arrives with the chief away
  await away();
  await ev(() => { const gs = window.__FV.scene; for (const s of gs.stationList) if (s.outStack) { const ty = s.output; if (['item_fish_cooked', 'item_meat_cooked'].includes(ty)) for (let i = 0; i < 10; i++) s.outStack.push(ty, null, gs.effects); } });
  const tPort = await until(() => { const r = window.__FV.civic().rest; return r.pantry.item_fish_cooked + r.pantry.item_meat_cooked > 0; }, 150, 2);
  step('2 goods porters bring grilled fish / smoked meat to the pantry', tPort >= 0, { t: tPort, pantry: (await R()).pantry });
  await ev(() => window.__FV.restFood({ item_fish_cooked: 12, item_bread: 12, item_meat_cooked: 12 }));

  // ---- 3. guests queue; nobody at the register: nobody orders
  const tQ = await until(() => { const r = window.__FV.scene.civic.restaurant; return r.queue.length > 0 && r.queue[0].at; }, 60, 0.5);
  await adv(6);
  const r3 = await ev(() => { const r = window.__FV.scene.civic.restaurant; return { q: r.queue.length, tickets: r.tickets.length, wait: +(r.queue[0] ? r.queue[0].waitPay || 0 : 0).toFixed(1), obj: window.__FV.state().objective }; });
  step('3 guests come and queue at the counter', tQ >= 0 && r3.q > 0, { t: tQ, ...r3 });
  step('3 nobody at the register: no order is taken (v2 rule)', r3.tickets === 0 && r3.wait > 3, r3);
  step('3 the arrow points at the restaurant register', r3.obj === 'obj_rest_register', r3.obj);
  await ev(() => window.__FV.camera(-700, 980, 1.0));
  await shot('01_queue');
  await ev(() => window.__FV.camera());

  // ---- 4. the chief takes the order, the guest sits at a table
  await goTo('restRegister');
  const tO = await until(() => window.__FV.scene.civic.restaurant.tickets.length > 0, 10, 0.25);
  step('4 the chief at the register takes the order', tO >= 0, tO);
  const tS = await until(() => window.__FV.civic().rest.seated > 0, 20, 0.5);
  const seat = await ev(() => { const r = window.__FV.scene.civic.restaurant; const g = r.guests.find((q) => q.state === 'seated' || q.state === 'eat'); return g ? { d: Math.round(Math.hypot(g.ch.x - g.seat.x, g.ch.y - g.seat.y - (g.sits ? 0 : 14))), sits: g.sits, depthOk: g.ch.sprite.depth < g.seat.table.y } : null; });
  step('4 the guest walks to a terrace seat and sits', tS >= 0 && seat && seat.d <= 2, seat);
  step('4 seated behind the table (drawn under it)', seat && seat.depthOk, seat);

  // ---- 5. the kitchen: nothing cooks until the chief stands there
  await away();
  await adv(5);
  const r5 = await ev(() => ({ t: window.__FV.scene.civic.restaurant.tickets.map((q) => q.state), obj: window.__FV.state().objective }));
  step('5 nobody in the kitchen: the order waits', r5.t.length > 0 && r5.t.every((s) => s === 'cook'), r5);
  step('5 the arrow points at the kitchen pad', r5.obj === 'obj_rest_kitchen', r5.obj);
  const cash0 = (await R()).cash;
  await goTo('restKitchen');
  const tE = await until(() => window.__FV.civic().rest.eating > 0, 20, 0.25);
  step('5 the chief cooks and the plate flies to the table: the guest eats', tE >= 0, tE);
  await ev(() => window.__FV.camera(-700, 940, 1.15));
  await shot('02_seated_diners');
  await ev(() => window.__FV.camera());
  const tP = await until(() => window.__FV.civic().rest.served > 0, 30, 0.5);
  const r5b = await R();
  step('5 after the meal the guest pays onto the cash pad and leaves', tP >= 0 && r5b.cash > cash0, { served: r5b.served, cash: r5b.cash });

  // ---- 6. a guest left waiting at the table gives up (no pay), the food goes back
  await away();
  await goTo('restRegister');
  const tO2 = await until(() => window.__FV.scene.civic.restaurant.tickets.some((q) => q.state === 'cook'), 30, 0.5);
  await away();
  const before6 = await ev(() => { const r = window.__FV.scene.civic.restaurant; const tk = r.tickets.find((q) => q.state === 'cook'); const P = {}; for (const f of ['item_fish_cooked', 'item_bread', 'item_meat_cooked']) P[f] = r.pantry.countWithIncoming(f); return { lost: r.lost, items: tk ? tk.items.slice() : [], P }; });
  const tG = await until((n) => window.__FV.scene.civic.restaurant.lost > n, 100, 1, before6.lost);
  const after6 = await ev(() => { const r = window.__FV.scene.civic.restaurant; const P = {}; for (const f of ['item_fish_cooked', 'item_bread', 'item_meat_cooked']) P[f] = r.pantry.countWithIncoming(f); return { lost: r.lost, P }; });
  const back = before6.items.every((ty) => after6.P[ty] >= before6.P[ty] + 1 - 1e-9 || after6.P[ty] >= 30);
  step('6 too long at the table: the guest leaves without paying', tO2 >= 0 && tG >= 0, { t: tG, lost: after6.lost });
  step('6 ... and the uncooked food goes back to the pantry', back, { items: before6.items, before: before6.P, after: after6.P });

  // ---- 7. the staff run it with the chief away; 정식
  await ev(() => { window.__restMeals = []; window.__FV.scene.events.on('restMeal', (p, c) => window.__restMeals.push([p, c])); });
  await ev(() => { window.__FV.doneStep('rest_cashier'); });
  await adv(2);
  const pads7 = await ev(() => window.__FV.state().pads.filter((p) => /^rest_/.test(p)));
  await ev(() => { window.__FV.doneStep('rest_cook'); window.__FV.doneStep('rest_server'); });
  await ev(() => window.__FV.restFood({ item_fish_cooked: 30, item_bread: 30, item_meat_cooked: 30 }));
  const served7 = (await R()).served;
  await away();
  await adv(4);
  const st7 = await R();
  step('7 hiring opens the next staff pad (cashier -> cook)', pads7.includes('rest_cook'), pads7);
  step('7 the staff are here: register staffed, cook, server', st7.staffed && st7.cashier && st7.cook && st7.server, st7);
  const t7 = await until((n) => window.__FV.civic().rest.served >= n + 4, 180, 2, served7);
  const meals = await ev(() => window.__restMeals);
  step('7 with the chief away the staff serve meal after meal', t7 >= 0, { t: t7, served: (await R()).served - served7 });
  // a 정식 (three dishes) is ordered sometimes (comboChance 0.4 when all three are there)
  let combos = meals.filter((m) => m[1]).length;
  if (!combos) { await until(() => (window.__restMeals || []).some((m) => m[1]), 120, 2); combos = (await ev(() => window.__restMeals)).filter((m) => m[1]).length; }
  const prices = await ev(() => { const r = window.__FV.scene.civic.restaurant; return { combo: r.comboPrice(), fish: r.dishPrice('item_fish_cooked', 1),  }; });
  step('7 정식 combos are ordered and cost more than a dish', combos > 0 && prices.combo > prices.fish * 2, { combos, ...prices });
  await ev(() => window.__FV.camera(-700, 960, 1.05));
  await adv(6);
  await shot('03_staff');
  await ev(() => window.__FV.camera());
  const served7b = (await R()).served;

  // ---- 8. train visitors plan a meal here
  const plan = await ev(() => {
    const nb = window.__FV.scene.v4, rs = window.__FV.scene.civic.restaurant;
    if (!nb || !nb.planFor) return null;
    let n = 0;
    for (let i = 0; i < 300; i++) { const p = nb.planFor({}); if (p && p.targets.includes(rs)) n++; }
    return n;
  });
  step('8 train visitors plan a meal at the big restaurant (about visitorChance)', plan === null || (plan > 30 && plan < 180), plan);
  const sv = await ev(() => { const r = window.__FV.scene.civic.restaurant; return { has: typeof r.serve === 'function', pts: r.customerPoints.length }; });
  step('8 the restaurant takes visitors (serve contract)', sv.has && sv.pts === 1, sv);

  // ---- 9. save + reload
  const before = await ev(() => { window.__FV.save(); const r = window.__FV.scene.civic.restaurant.serialize(); return { pantry: r.pantry, cash: r.cash, served: r.served }; });
  titleFrom = log.warnings.length;     // (the title screen's own pictures are not this test's business)
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 180000);
  titleTo = log.warnings.length;
  await sleep(1500);
  const after = await ev(() => { const c = window.__FV.civic(); return c && c.rest ? { pantry: c.rest.pantry, cash: c.rest.cash, served: c.rest.served, staffed: c.rest.staffed, cook: c.rest.cook, server: c.rest.server } : null; });
  const same = after && ['item_fish_cooked', 'item_bread', 'item_meat_cooked'].every((f) => after.pantry[f] === before.pantry[f]) && after.cash === before.cash && after.served === before.served;
  step('9 reload: pantry (with ordered food), cash and meals served kept', same, { before, after });
  step('9 reload: the staff are back', after && after.staffed && after.cook && after.server, after);
  void served7b;
} catch (e) { fatal = e; console.log('FATAL', e.stack || e.message); }
const errs = log.errors.filter((e) => !/AudioContext|play\(\) request/i.test(e));
step('0 no page errors', !errs.length && !fatal, errs.slice(0, 5));
const ph = log.warnings.filter((w, i) => /missing asset|placeholder/i.test(w) && !(i >= titleFrom && i < titleTo));
step('0 no placeholder pictures', !ph.length, ph.slice(0, 5));
const nOk = results.filter((r) => r.ok).length;
console.log(`\n${nOk}/${results.length} passed`);
await browser.close();
await srv.close();
process.exit(nOk === results.length ? 0 : 1);
