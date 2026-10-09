// Frost Village smoke test (Playwright + Chromium, mobile viewport 390x844).
//   node tools/test/smoke.mjs            (screenshots -> docs/previews/screens/)
// Drives the first loop with __FV.setInput like a joystick (fish -> the chief cooks at the grill's work
// spot -> counter -> register -> coins -> the clerk, the cook, the fisherman; v3.5), the fish barrel, the
// fish porter and the counter porter, then
// __FV.give + unlockAll to visit every zone. Fails on any page error or console error. 404s for
// missing optional manifest fragments are reported, not fatal.
// v2: once the game runs, time is the fixed-step clock (fv_step.mjs): the waits below are GAME
// seconds, so the test gives the same result however slow headless rendering / the machine is.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep as realSleep, waitFor as realWaitFor } from './pw.mjs';
import { installStepper, advance, render, walkStep, waitStep } from './fv_step.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews', 'screens');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const step = (name, ok, info = '') => { results.push({ name, ok, info }); console.log((ok ? '  ok  ' : ' FAIL ') + name + (info ? '  — ' + info : '')); };

const srv = await start(0, { prefix: '/game/frost-village/' });   // sub-path on purpose
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 } });
// game-time versions of sleep / waitFor / walkTo once the stepper is installed (real time before)
let stepping = false;
// (one drawn frame at the end: Phaser sorts input hits by the cameras' render lists, so new UI
//  must have been drawn once before a tap can land on it)
const sleep = async (ms) => { if (!stepping) return realSleep(ms); await advance(page, ms / 1000); await render(page, 1); await realSleep(30); };
const waitFor = (pg, fn, ms, arg) => (stepping ? waitStep(pg, fn, ms, arg) : realWaitFor(pg, fn, ms, arg));
const walkTo = (pg, target, opts) => walkStep(pg, target, opts);
const startStepping = async () => { await installStepper(page); stepping = true; };
const shot = async (n) => { if (stepping) await render(page, 2); await page.screenshot({ path: path.join(OUT, n + '.jpg'), type: 'jpeg', quality: 82 }); };
const st = () => page.evaluate(() => window.__FV.state());
const where = (n) => page.evaluate((k) => window.__FV.where(k), n);
const count = (s, type) => s.player.stack.filter((x) => x === type).length;
// (v3.5) a pad that appears under the chief (the next hire of a line shares the spot) waits until he
// steps off once, so walk off first when he is already standing there
const walkPad = async (id, opts = { tol: 14 }) => {
  const p = await where(id);
  if (!p) return false;
  const me = (await st()).player;
  if (Math.hypot(me.x - p.x, (me.y - p.y) * 2) < 110) { await walkTo(page, { x: p.x + 70, y: p.y + 90 }, { tol: 20 }); await sleep(300); }
  return walkTo(page, p, opts);
};

let fatal = null;
try {
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(900);
  await shot('01_title');
  step('title screen', true);

  await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 180000);
  await sleep(1200);
  const fps = await page.evaluate(async () => { await new Promise((r) => setTimeout(r, 1500)); return window.__FV.state().fps; });
  await startStepping();
  await shot('02_start');
  let s = await st();
  step('game started', s.coins === 0 && s.market.queue > 0, `coins=${s.coins} queue=${s.market.queue}`);

  // ---------------- first loop (v3.5: the chief cooks at the grill himself) until the first hire
  const oneLoop = async (loops, first, register) => {
    // fish at the net
    await walkTo(page, await where('net'), { tol: 18 });
    await waitFor(page, () => { const s = window.__FV.state(); return s.player.stack.length >= Math.min(5, s.player.capacity); }, 60000).catch(() => {});
    s = await st();
    if (first) { await shot('03_fishing'); step('fishing at the net', count(s, 'item_fish_raw') >= 3, `raw=${count(s, 'item_fish_raw')} anim=${s.player.anim}`); }
    if (first) {
      // nobody works the grill yet: fish dropped on its input stay raw
      await walkTo(page, await where('grillIn'), { tol: 18 });
      await waitFor(page, () => window.__FV.state().player.stack.filter((x) => x === 'item_fish_raw').length === 0, 10000).catch(() => {});
      await walkTo(page, { x: 960, y: 760 }, { tol: 20 });
      const g0 = (await st()).stations.grill;
      await sleep(3000);
      const g1 = (await st()).stations.grill;
      await shot('04_grill_input');
      step('(v3.5) fish on the grill stay raw while nobody works it', g0.in > 0 && g1.in === g0.in && !g1.working, `${JSON.stringify(g0)} -> ${JSON.stringify(g1)}`);
      s = await st();
      step('(v3.5) the tutorial points at the work spot', s.objective === 'obj_op_grill', `objective=${s.objective}`);
    }
    // stand at the grill (the fish in the bag hop in from there) until it is all cooked
    await walkTo(page, await where('op:grill'), { tol: 12 });
    await sleep(500);
    if (first) {
      s = await st();
      await shot('04b_chief_cooks');
      step('(v3.5) the chief cooks at the grill (work motion, grill on)', s.ops.grill.chief && s.ops.grill.working && s.player.anim === 'give' && s.objective === 'obj_operating_grill', `${JSON.stringify(s.ops.grill)} anim=${s.player.anim} obj=${s.objective}`);
    }
    await waitFor(page, () => { const s = window.__FV.state(); return s.stations.grill.in === 0 && !s.player.stack.includes('item_fish_raw'); }, 20000).catch(() => {});
    await sleep(700);
    await walkTo(page, await where('grillOut'), { tol: 18 });
    await waitFor(page, () => { const s = window.__FV.state(); return s.stations.grill.out === 0 || s.player.stack.length >= s.player.capacity; }, 10000).catch(() => {});
    if (first) { await sleep(300); await shot('05_carry_tower'); s = await st(); step('picked up grilled fish', count(s, 'item_fish_cooked') > 0, `cooked=${count(s, 'item_fish_cooked')}`); }
    // put on the counter
    await walkTo(page, await where('shelf'), { tol: 18 });
    await waitFor(page, () => window.__FV.state().player.stack.length === 0, 10000).catch(() => {});
    if (first) { await sleep(500); await shot('06_counter'); }
    if (register) {
      // (v2) the customer takes the food and waits at the register: nobody pays until the chief stands there
      await waitFor(page, () => window.__FV.state().market.waitingPay, 30000).catch(() => {});
      if (first) {
        await sleep(600);
        s = await st();
        step('customer waits at the empty register', s.market.waitingPay && s.market.cash === 0, `waitingPay=${s.market.waitingPay} cash=${s.market.cash}`);
        step('tutorial points at the register', s.objective === 'obj_register', `objective=${s.objective}`);
        await shot('06b_register_wait');
      }
      await walkTo(page, await where('register'), { tol: 14 });
      // customers pay while the chief stands at the register -> coins on the cash pad
      await waitFor(page, () => { const s = window.__FV.state(); return s.market.cash > 0 && s.market.stock === 0 && !s.market.waitingPay; }, 40000).catch(() => {});
      if (first) { await sleep(400); await shot('07_customers_pay'); s = await st(); step('customers paid at the register', s.market.cash > 0, `cash=${s.market.cash}`); }
    } else await waitFor(page, () => { const s = window.__FV.state(); return s.market.cash > 0 && s.market.stock === 0; }, 40000).catch(() => {});
    await walkTo(page, await where('cash'), { tol: 18 });
    await sleep(900);
    s = await st();
    if (first) { await shot('08_collect_coins'); step('collected coins', s.coins > 0, `coins=${s.coins}`); }
  };
  const padCost = (id) => page.evaluate((k) => { const p = window.__FV.scene.progress.pads[k]; return p ? p.remaining : 0; }, id);
  let loops = 0;
  while (loops < 4) {
    const s0 = await st();
    if (s0.pads.includes('hire_clerk_market') && s0.coins >= (await padCost('hire_clerk_market'))) break;
    loops++; await oneLoop(loops, loops === 1, true);
  }
  s = await st();
  const clerkCost = await padCost('hire_clerk_market');
  step('the clerk pad appears after the first sale', s.pads.includes('hire_clerk_market') && s.flags.firstSale, `pads=${s.pads}`);
  step('earned the clerk by playing (the chief cooked at the grill)', s.coins >= clerkCost && clerkCost > 0, `coins=${s.coins} cost=${clerkCost} after ${loops} loops`);
  if (s.coins < clerkCost) await page.evaluate((n) => window.__FV.give(n), clerkCost - s.coins);

  // ---------------- (v2) the clerk takes payments at the register
  await walkPad('hire_clerk_market', { tol: 14 });
  await sleep(500);
  await shot('09_paying_unlock');
  await waitFor(page, () => window.__FV.state().market.clerk, 10000).catch(() => {});
  step('hired the clerk', (await st()).market.clerk);
  // ---------------- (v3.5) the cook: earn it by playing (the clerk takes payments now)
  await waitFor(page, () => window.__FV.state().pads.includes('op_grill'), 10000).catch(() => {});
  let loops2 = 0;
  while (loops2 < 4 && (await st()).coins < (await padCost('op_grill'))) { loops2++; await oneLoop(loops2, false, false); }
  s = await st();
  const cookCost = await padCost('op_grill');
  step('(v3.5) earned the cook by playing', s.coins >= cookCost && cookCost > 0, `coins=${s.coins} cost=${cookCost} after ${loops2} more loops`);
  if (s.coins < cookCost) await page.evaluate((n) => window.__FV.give(n), cookCost - s.coins);
  await walkPad('op_grill', { tol: 14 });
  await waitFor(page, () => window.__FV.state().ops.grill.hired, 8000).catch(() => {});
  await walkTo(page, { x: 1000, y: 860 }, { tol: 20 });
  await waitFor(page, () => window.__FV.state().ops.grill.ready, 20000).catch(() => {});
  await page.evaluate(() => { const gs = window.__FV.scene; for (let i = 0; i < 6; i++) gs.stations.grill.inStack.push('item_fish_raw', null, gs.effects); });
  await sleep(1600);
  s = await st();
  await shot('09b_cook_hired');
  step('(v3.5) the cook (요리사 쿡) grills while the chief is away', s.ops.grill.ready && s.ops.grill.working && !s.ops.grill.chief && s.ops.grill.anim === 'operate', JSON.stringify(s.ops.grill));

  // ---------------- the fisherman (catch -> the fish barrel)
  await waitFor(page, () => window.__FV.state().pads.includes('hire_fisherman'), 10000).catch(() => {});
  { const c = await padCost('hire_fisherman'); s = await st(); if (s.coins < c) await page.evaluate((n) => window.__FV.give(n), c - s.coins); }
  await walkPad('hire_fisherman', { tol: 14 });
  await waitFor(page, () => window.__FV.state().done.includes('hire_fisherman'), 8000).catch(() => {});
  await sleep(900);
  await shot('10_fisherman_hired');
  s = await st();
  step('hired the fisherman', s.done.includes('hire_fisherman') && s.workers.length === 1, `done=${s.done} workers=${JSON.stringify(s.workers)}`);
  await sleep(5000);
  s = await st();
  step('fisherman works', s.workers[0] && ['work', 'deliver', 'drop', 'goto'].includes(s.workers[0].state), JSON.stringify(s.workers[0]));
  await shot('11_fisherman_working');
  await waitFor(page, () => window.__FV.state().piles.fish.n > 0, 60000).catch(() => {});
  s = await st();
  step('(v3.5) the fisherman\'s catch goes to the fish barrel', s.piles.fish.shown && s.piles.fish.n > 0, JSON.stringify(s.piles.fish));

  // ---------------- (v3.5) fish porter (barrel -> grill), (v2) goods porter (grill -> counter)
  await waitFor(page, () => window.__FV.state().pads.includes('raw_grill'), 10000).catch(() => {});
  { const c = await padCost('raw_grill'); await page.evaluate((n) => window.__FV.give(n), c); }
  await walkPad('raw_grill', { tol: 14 });
  await waitFor(page, () => window.__FV.state().rawPorters.length > 0, 10000).catch(() => {});
  await walkTo(page, { x: 1100, y: 860 }, { tol: 20 });
  await page.evaluate(() => { const gs = window.__FV.scene; for (let i = 0; i < 8; i++) gs.piles.fish.stack.push('item_fish_raw', null, gs.effects); gs.stations.grill.inStack.clear(gs.effects); });
  await waitFor(page, () => window.__FV.state().rawPorters.some((r) => r.dest === 'grill_in' && r.carry > 0), 40000).catch(() => {});
  s = await st();
  step('(v3.5) the fish porter carries the barrel to the grill', s.rawPorters.some((r) => r.dest === 'grill_in' && r.carry > 0), JSON.stringify(s.rawPorters));
  await shot('11a_fish_porter');
  await waitFor(page, () => window.__FV.state().pads.includes('porter_grill'), 10000).catch(() => {});
  await page.evaluate(() => { const p = window.__FV.scene.progress.pads.porter_grill; window.__FV.give(p ? p.remaining : 0); });
  await walkPad('porter_grill', { tol: 14 });
  await waitFor(page, () => window.__FV.state().done.includes('porter_grill'), 10000).catch(() => {});
  await page.evaluate(() => { const gs = window.__FV.scene; for (let i = 0; i < 6; i++) gs.stations.grill.outStack.push('item_fish_cooked', null, gs.effects); });
  await waitFor(page, () => window.__FV.state().porters.some((p) => p.state === 'haul' || p.state === 'unload'), 40000).catch(() => {});
  s = await st();
  step('porter carries grilled fish to the counter', s.porters.length === 1 && ['haul', 'unload'].includes(s.porters[0].state), JSON.stringify(s.porters));
  await shot('11b_porter');
  await walkTo(page, await where('net'), { tol: 20 });
  const cash0 = (await st()).market.cash;
  await page.evaluate(() => { const gs = window.__FV.scene; for (let i = 0; i < 8; i++) gs.market.stock.push('item_fish_cooked', null, gs.effects); });
  await waitFor(page, (c) => window.__FV.state().market.cash > c, 40000, cash0).catch(() => {});
  s = await st();
  step('clerk takes payments (chief away)', s.market.clerk && s.market.cash > cash0, `clerk=${s.market.clerk} cash ${cash0} -> ${s.market.cash}`);
  await shot('11c_clerk');

  // ---------------- second unlock by paying (forest), then everything
  await page.evaluate(() => { const p = window.__FV.scene.progress.pads.zone_forest; window.__FV.give(p ? p.remaining : 0); });
  await walkPad('zone_forest', { tol: 14 });
  await waitFor(page, () => window.__FV.state().done.includes('zone_forest'), 8000).catch(() => {});
  await sleep(1300);
  await shot('12_forest_reveal');
  s = await st();
  step('forest unlocked by pad', s.zones.forest === true && s.trade.enabled, `zones=${JSON.stringify(s.zones)}`);
  await sleep(2500);

  await page.evaluate(() => { window.__FV.give(5000); return window.__FV.unlockAll(); });
  await sleep(800);
  s = await st();
  step('unlockAll', Object.values(s.zones).every(Boolean) && s.workers.length >= 5, `workers=${s.workers.length}`);
  {
    // test setup: some finished goods on every output pad; the porters must pick them up
    await page.evaluate(() => { const gs = window.__FV.scene; for (const st of gs.stationList) for (let i = 0; i < 8; i++) st.outStack.push(st.output, null, gs.effects); });
    await waitFor(page, () => window.__FV.scene.porters.filter((w) => w.station.id !== 'grill').some((w) => w.stack.count > 0), 40000).catch(() => {});
    const porters = await page.evaluate(() => window.__FV.scene.porters.map((w) => w.station.id + ':' + w.state + ':' + (w.stack.count + w.stack.incoming)));
    step('porters pick up finished goods (all 5 lines)', porters.length === 5 && porters.some((c) => !/^grill/.test(c) && /:[1-9]\d*$/.test(c)), porters.join(' '));
    const s2 = await st();
    step('both registers have clerks, residents moved in', s2.market.clerk && s2.trade.clerk && s2.residents >= 10, `residents=${s2.residents}`);
  }

  // chop a tree
  await page.evaluate(() => window.__FV.clearStack());
  await waitFor(page, () => window.__FV.where('tree'), 15000).catch(() => {});
  await walkTo(page, (await where('tree')) || (await where('zone:forest')), { tol: 10, teleport: true });
  await waitFor(page, () => window.__FV.state().player.stack.includes('item_log'), 8000).catch(() => {});
  s = await st();
  step('chopping gives logs', s.player.stack.includes('item_log'), `anim=${s.player.anim} stack=${s.player.stack.length}`);
  await shot('13_forest_chop');
  // sawmill + trade post
  await walkTo(page, await where('sawmillIn'), { tol: 16 });
  await sleep(1500);
  await walkTo(page, await where('zone:farm'), { tol: 30 });
  await page.evaluate(() => window.__FV.clearStack());
  await waitFor(page, () => window.__FV.where('wheat'), 15000).catch(() => {});
  await walkTo(page, (await where('wheat')) || (await where('zone:farm')), { tol: 10 });
  await waitFor(page, () => window.__FV.state().player.stack.includes('item_wheat'), 8000).catch(() => {});
  s = await st();
  step('harvesting gives wheat', s.player.stack.includes('item_wheat'), `anim=${s.player.anim}`);
  await shot('14_farm');
  await page.evaluate(() => window.__FV.clearStack());
  await waitFor(page, () => window.__FV.where('rock'), 15000).catch(() => {});
  await walkTo(page, (await where('rock')) || (await where('zone:mine')), { tol: 10 });
  // (the chief does not mine while the smelter is full both ways, nor with something else in his hands
  //  picked up on the way — e.g. ingots from the smelter's output pad: make room, empty his hands)
  await page.evaluate(() => { const gs = window.__FV.scene, st = gs.stations.smelter; st.inStack.clear(gs.effects); st.outStack.clear(gs.effects); window.__FV.clearStack(); });
  await waitFor(page, () => window.__FV.state().player.stack.includes('item_ore'), 8000).catch(() => {});
  s = await st();
  step('mining gives ore', s.player.stack.includes('item_ore'), `anim=${s.player.anim}`);
  await shot('15_mine');
  {
    let caught = false;
    await page.evaluate(() => window.__FV.clearStack());
    // (the chief does not hunt while the smokehouse is full both ways: make room first)
    // (and the hunter worker may have caught them all: bring them back)
    await page.evaluate(() => { const gs = window.__FV.scene, st = gs.stations.smokehouse; st.inStack.clear(gs.effects); st.outStack.clear(gs.effects); for (const a of gs.animals) if (a.dead) a.respawn(); });
    // chase the nearest animal with the joystick (they shy away), stop next to it so the chief swings
    { const a = await page.evaluate(() => window.__FV.where('animal')); if (a) await page.evaluate(([x, y]) => window.__FV.teleport(x - 110, y + 40), [a.x, a.y]); }
    for (let k = 0; k < 700 && !caught; k++) {
      caught = await page.evaluate(() => {
        if (window.__FV.state().player.stack.includes('item_meat_raw')) return true;
        const a = window.__FV.where('animal'), p = window.__FV.scene.player;
        // (a straight-line chase can end at the hunting ground's fence: after ~2.5 s without moving, hop next to the animal)
        const c = window.__chase || (window.__chase = { x: p.x, y: p.y, n: 0 });
        if (Math.hypot(p.x - c.x, p.y - c.y) < 3) c.n++; else { c.n = 0; c.x = p.x; c.y = p.y; }
        if (c.n > 25 && a) { window.__FV.teleport(a.x - 70, a.y + 30); c.n = 0; }
        if (!a) window.__FV.setInput(0, 0);
        else {
          const dx = a.x - p.x, dy = a.y - p.y, d = Math.hypot(dx, dy * 2), l = Math.hypot(dx, dy) || 1;
          if (d < 46) window.__FV.setInput(0, 0); else window.__FV.setInput(dx / l, dy / l);
        }
        window.__step.run(0.1);
        return false;
      });
    }
    await page.evaluate(() => window.__FV.setInput(0, 0));
    step('catching an animal gives meat', caught);
  }
  await shot('16_hunt');
  await page.evaluate(() => { window.__FV.teleport(990, 2200); });
  await sleep(1200);
  await shot('17_village');
  // upgrades
  await page.evaluate(() => window.__FV.teleport(990, 1000));
  const cap0 = (await st()).player.capacity;
  await walkPad('up_capacity', { tol: 10 });
  await waitFor(page, (c) => window.__FV.state().player.capacity > c, 16000, cap0).catch(() => {});
  s = await st();
  step('backpack upgrade', s.player.capacity > cap0, `${cap0} -> ${s.player.capacity}`);
  await shot('18_upgrade');
  // trade post selling
  await page.evaluate(() => window.__FV.teleport(1000, 900));
  await sleep(500);
  await walkTo(page, await where('tradeShelf'), { tol: 14 });
  await sleep(1500);
  await shot('19_trade_post');

  // ================================================================ (v3) production chains & new land
  // Everything below runs on the real systems: pads take coins, porters carry the materials,
  // the toolsmith forges, the miners eat, the boat rows out. Only coins (give) and the raw goods
  // on the output pads are handed in to keep the test short.
  const gsEval = (fn, arg) => page.evaluate(fn, arg);
  const pushOut = (id, type, n) => gsEval(([id, type, n]) => { const gs = window.__FV.scene; const st = gs.stations[id]; for (let i = 0; i < n; i++) st.outStack.push(type, null, gs.effects); }, [id, type, n]);
  // the chief stands aside with empty hands: whatever reaches a site was carried by porters
  const standAside = async () => { await page.evaluate(() => { window.__FV.clearStack(); window.__FV.teleport(1000, 1160); }); await sleep(200); };
  {
    // ---- first watchtower: pay the pad, porters bring the planks, the tower is lit, the fog clears
    await page.evaluate(() => window.__FV.give(3000));
    await waitFor(page, () => window.__FV.state().pads.includes('tower_east'), 10000).catch(() => {});
    s = await st();
    step('(v3) first watchtower pad after the village core', s.pads.includes('tower_east') && !s.territory.east, `pads=${s.pads.filter((p) => /tower|hire2/.test(p))}`);
    await walkPad('tower_east', { tol: 14 });
    await waitFor(page, () => window.__FV.state().done.includes('tower_east'), 10000).catch(() => {});
    await standAside();
    await pushOut('sawmill', 'item_plank', 12);
    await waitFor(page, () => window.__FV.state().porters.some((p) => p.dest === 'tower_east' && p.carry > 0), 60000).catch(() => {});
    await page.evaluate(() => window.__FV.camera(1700, 900, 0.8));
    await shot('19b_v3_porter_planks_tower');
    s = await st();
    const porterToTower = s.porters.some((p) => p.dest === 'tower_east' && p.carry > 0);
    await waitFor(page, () => window.__FV.state().territory.east, 150000).catch(() => {});
    await sleep(1500);
    await shot('19c_v3_fog_cleared');
    s = await st();
    step('(v3) watchtower built from porter deliveries, fog clears', porterToTower && s.territory.east && s.sites.tower_east && s.sites.tower_east.state === 'done', `porter=${porterToTower} east=${s.territory.east} site=${JSON.stringify(s.sites.tower_east)}`);
    await page.evaluate(() => window.__FV.camera());

    // ---- plot -> build menu -> foundation; porters deliver planks + ingots; builders finish it
    await walkTo(page, await where('plot:e_m1'), { tol: 12, teleport: true });
    await waitFor(page, () => window.__FV.buildMenuOpen, 8000).catch(() => {});
    await shot('19d_v3_build_menu');
    const menu = await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); const r = { open: !!window.__FV.buildMenuOpen, cards: (ui.buildCards || []).map((c) => c.ch.key + (c.ch.locked ? '(locked)' : '')) }; ui.selectCard('toolsmith'); r.ok = !!(ui.buildBtn && ui.buildBtn.ok); if (r.ok) ui.confirmBuild(); else ui.closeBuildMenu(true); return r; });
    step('(v3) build menu on a plot (cards, picks the toolsmith)', menu.open && menu.ok && menu.cards.includes('toolsmith'), JSON.stringify(menu));
    await standAside();
    await pushOut('sawmill', 'item_plank', 10); await pushOut('smelter', 'item_ingot', 6);
    await waitFor(page, () => { const s = window.__FV.state().sites.e_m1; return s && s.state !== 'foundation'; }, 120000).catch(() => {});
    s = await st();
    step('(v3) foundation filled by porters (chief empty-handed)', s.sites.e_m1 && s.sites.e_m1.state !== 'foundation' && s.sites.e_m1.state !== 'plot', JSON.stringify(s.sites.e_m1));
    await page.evaluate(() => window.__FV.camera(2040, 1150, 0.9));
    await sleep(1500);
    await shot('19e_v3_scaffold_builders');
    await waitFor(page, () => window.__FV.state().built.toolsmith, 60000).catch(() => {});
    await sleep(1200);
    s = await st();
    step('(v3) builders finish the toolsmith', !!s.built.toolsmith, JSON.stringify(s.built));
    await shot('19f_v3_toolsmith_done');
    await page.evaluate(() => window.__FV.camera());

    // ---- tool-gated hire: the 2nd lumberjack pad wants coins AND an axe from the toolsmith
    await waitFor(page, () => window.__FV.state().pads.includes('hire2_lumberjack'), 10000).catch(() => {});
    await walkPad('hire2_lumberjack', { tol: 14 });
    await sleep(2500);
    s = await st();
    const paidNoTool = !s.done.includes('hire2_lumberjack');
    await pushOut('sawmill', 'item_plank', 2); await pushOut('smelter', 'item_ingot', 2);
    await waitFor(page, () => { const w = window.__FV.state().workshops.toolsmith; return w && w.in >= 2; }, 90000).catch(() => {});
    // (v3.5) nobody works the forge yet: the chief stands at its work spot
    await walkTo(page, await where('op:toolsmith'), { tol: 12, teleport: true });
    await waitFor(page, () => { const w = window.__FV.state().workshops.toolsmith; return w && w.outs && w.outs.item_axe > 0; }, 90000).catch(() => {});
    s = await st();
    step('(v3) toolsmith forges the axe the pad waits for (v3.5: the chief at the forge)', s.workshops.toolsmith && s.workshops.toolsmith.outs.item_axe > 0, JSON.stringify(s.workshops.toolsmith));
    await page.evaluate(() => window.__FV.clearStack());
    await walkTo(page, await where('toolsmithOut'), { tol: 14 });
    await waitFor(page, () => window.__FV.state().player.stack.includes('item_axe'), 8000).catch(() => {});
    await shot('19g_v3_toolsmith_axe');
    await walkPad('hire2_lumberjack', { tol: 14 });
    await waitFor(page, () => window.__FV.state().done.includes('hire2_lumberjack'), 10000).catch(() => {});
    s = await st();
    step('(v3) 2nd lumberjack only after the axe arrives', paidNoTool && s.done.includes('hire2_lumberjack') && s.workers.filter((w) => w.type === 'lumberjack').length === 2, `paidNoTool=${paidNoTool} lumberjacks=${s.workers.filter((w) => w.type === 'lumberjack').length}`);

    // ---- mine food: miners eat one bread per few ores; an empty box makes them hungry
    await waitFor(page, () => { const f = window.__FV.state().food; return f && f.active; }, 15000).catch(() => {});
    await page.evaluate(() => { const gs = window.__FV.scene; while (gs.foodBox.stock.count) gs.effects.releaseItem(gs.foodBox.stock.pop().spr); gs.foodBox.refresh(); for (const w of gs.workers) if (w.type === 'miner') w.oreLeft = 1; for (const k of ['bakery', 'smokehouse']) { gs.stations[k].inStack.clear(gs.effects); gs.stations[k].outStack.clear(gs.effects); } for (const p of gs.porters) p.stack.clear(gs.effects); gs.foodBox.enabled = false; /* (test: the bread porters are busy elsewhere) */ });
    await waitFor(page, () => window.__FV.state().hungry > 0, 60000).catch(() => {});
    s = await st();
    const hungry = s.hungry;
    await page.evaluate(() => window.__FV.camera(700, 1800, 0.9));
    await shot('19h_v3_hungry_miner');
    await page.evaluate(() => window.__FV.camera());
    await page.evaluate(() => window.__FV.clearStack());
    await pushOut('bakery', 'item_bread', 6);
    await walkTo(page, await where('bakeryOut'), { tol: 14, teleport: true });
    await waitFor(page, () => window.__FV.state().player.stack.includes('item_bread'), 8000).catch(() => {});
    await walkTo(page, await where('foodBox'), { tol: 14 });
    await waitFor(page, () => window.__FV.state().hungry === 0, 30000).catch(() => {});
    await page.evaluate(() => { window.__FV.scene.foodBox.enabled = true; });
    await shot('19i_v3_food_box');
    s = await st();
    step('(v3) mine food box: hungry miners eat the bread the chief brings', hungry > 0 && s.hungry === 0 && s.food.eaten > 0, `hungry ${hungry}->${s.hungry} food=${JSON.stringify(s.food)}`);

    // ---- the rest of the buildings (instant), then a boat trip, the cannery and the store
    await page.evaluate(() => { window.__FV.give(20000); window.__FV.unlockV3(); window.__FV.teleport(2200, 900); });
    await sleep(1500);
    await waitFor(page, () => window.__FV.state().pads.includes('boat_rowboat'), 10000).catch(() => {});
    await walkPad('boat_rowboat', { tol: 14 });
    await waitFor(page, () => window.__FV.state().done.includes('boat_rowboat'), 10000).catch(() => {});
    await waitFor(page, () => { const b = window.__FV.state().boat; return b && b.state === 'out'; }, 30000).catch(() => {});
    await page.evaluate(() => { const b = window.__FV.where('boat'); window.__FV.camera(b.x, b.y, 0.9); });
    await sleep(1500);
    await shot('19j_v3_boat_rowing');
    await waitFor(page, () => { const b = window.__FV.state().boat; return b && b.catch > 0; }, 120000).catch(() => {});
    s = await st();
    step('(v3) rowboat trip: out, fish, home, catch on the dock', s.boat && s.boat.catch > 0, JSON.stringify(s.boat));
    await page.evaluate(() => window.__FV.camera());
    // cannery: fish x3 + ingot -> cans x3; the chief carries them to the general store; a customer pays
    await page.evaluate(() => { window.__FV.clearStack(); const gs = window.__FV.scene; const c = gs.workshops.find((w) => w.kind === 'cannery'); for (let i = 0; i < 3; i++) c.inStack.push('item_fish_raw', null, gs.effects); c.inStack.push('item_ingot', null, gs.effects); });
    await waitFor(page, () => { const w = window.__FV.state().workshops.cannery; return w && w.outs.item_can >= 3; }, 40000).catch(() => {});
    s = await st();
    step('(v3) cannery: 3 fish + 1 ingot -> 3 cans', s.workshops.cannery && s.workshops.cannery.outs.item_can >= 3, JSON.stringify(s.workshops.cannery));
    await walkTo(page, await where('canneryOut'), { tol: 14, teleport: true });
    await waitFor(page, () => window.__FV.state().player.stack.includes('item_can'), 8000).catch(() => {});
    await shot('19k_v3_cannery');
    await walkTo(page, await where('storeShelf'), { tol: 14 });
    await waitFor(page, () => !window.__FV.state().player.stack.includes('item_can'), 10000).catch(() => {});
    const scash0 = (await st()).store.cash;
    await walkTo(page, await where('storeRegister'), { tol: 14 });
    await waitFor(page, (c) => window.__FV.state().store.cash > c, 90000, scash0).catch(() => {});
    await shot('19l_v3_store_sale');
    s = await st();
    step('(v3) general store sells cans at the register', s.store && s.store.cash > scash0, JSON.stringify(s.store));
    step('(v3) every building of the plan stands', ['toolsmith', 'boathouse', 'warehouse', 'cannery', 'store', 'house_a', 'house_b'].every((k) => s.built[k]), JSON.stringify(s.built));
    await page.evaluate(() => window.__FV.camera());
  }

  // overview (the on-screen button), zoom buttons
  {
    const c0 = await page.$('canvas'); const b0 = await c0.boundingBox();
    const k0 = b0.width / 720, H0 = b0.height / k0;
    const z0 = await page.evaluate(() => window.__FV.zoom().target);
    await page.touchscreen.tap(b0.x + (720 - 56) * k0, b0.y + (H0 - 168 - 160) * k0);      // +
    await sleep(500);
    const z1 = await page.evaluate(() => window.__FV.zoom().target);
    step('zoom + button', z1 > z0, `${z0} -> ${z1}`);
    await page.touchscreen.tap(b0.x + (720 - 56) * k0, b0.y + (H0 - 168 - 84) * k0);       // -
    await page.touchscreen.tap(b0.x + (720 - 56) * k0, b0.y + (H0 - 168 - 84) * k0);
    await sleep(500);
    const z2 = await page.evaluate(() => window.__FV.zoom().target);
    step('zoom - button', z2 < z1, `${z1} -> ${z2}`);
    await page.touchscreen.tap(b0.x + (720 - 56) * k0, b0.y + (H0 - 168) * k0);            // overview
    await sleep(2500);
    const zo = await page.evaluate(() => window.__FV.zoom());
    step('overview button shows the whole village', zo.overview && zo.target < 0.6, JSON.stringify(zo));
    await shot('20_overview');
    await page.touchscreen.tap(b0.x + (720 - 56) * k0, b0.y + (H0 - 168) * k0);            // back
    await sleep(1500);
    step('overview toggles back', !(await page.evaluate(() => window.__FV.zoom().overview)));
  }

  // settings panel (tap the gear)
  const c = await page.$('canvas'); const b = await c.boundingBox();
  const sx = b.width / 720;
  await page.touchscreen.tap(b.x + (720 - 62) * sx, b.y + 62 * sx);
  await sleep(600);
  await shot('21_settings');
  const paused = await page.evaluate(() => window.__FV.game.scene.isPaused('Game'));
  step('settings panel opens (game paused)', paused);
  await page.touchscreen.tap(b.x + (360 - 130) * sx, b.y + (b.height / sx / 2 + 330) * sx); // reset (left of Reload) -> confirm view ((v4-C2) seven rows above: +330)
  await sleep(500);
  await shot('22_reset_confirm');
  await page.touchscreen.tap(b.x + 360 * sx, b.y + (b.height / sx / 2 + 160) * sx);      // "no"
  await sleep(400);
  await page.touchscreen.tap(b.x + 360 * sx, b.y + (b.height / sx / 2 + 428) * sx);      // close ((v4-C2) +428)
  await sleep(500);
  step('settings closed', !(await page.evaluate(() => window.__FV.game.scene.isPaused('Game'))));

  // celebration
  await page.evaluate(() => window.__FV.scene.celebrate());
  await sleep(1300);
  await shot('23_village_complete');

  // save + reload
  await page.evaluate(() => window.__FV.save());
  const before = await st();
  stepping = false;
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(500);
  await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 180000);
  await startStepping();
  await sleep(1500);
  s = await st();
  step('save / load', s.done.length === before.done.length && Math.abs(s.coins - before.coins) < 5 && s.workers.length === before.workers.length, `done ${before.done.length}->${s.done.length} coins ${before.coins}->${s.coins}`);
  { const canon = (o) => JSON.stringify(Object.keys(o).sort().map((k) => [k, o[k]])); step('(v3) save / load keeps buildings and land', canon(s.built) === canon(before.built) && canon(s.territory) === canon(before.territory), `built ${canon(s.built)} vs ${canon(before.built)} land ${JSON.stringify(s.territory)}`); }
  await shot('24_reloaded');
  // reset progress through the in-game confirm (settings -> reset -> yes)
  {
    const c2 = await page.$('canvas'); const b2 = await c2.boundingBox();
    const k = b2.width / 720, Hh = b2.height / k;
    await page.touchscreen.tap(b2.x + (720 - 62) * k, b2.y + 62 * k); await sleep(600);
    await page.touchscreen.tap(b2.x + (360 - 130) * k, b2.y + (Hh / 2 + 330) * k); await sleep(500);
    await page.touchscreen.tap(b2.x + 360 * k, b2.y + (Hh / 2 + 60) * k); await sleep(2500);
    await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 15000).catch(() => {});
    s = await st();
    step('reset progress (in-game confirm)', s.coins === 0 && s.done.length === 0 && s.workers.length === 0 && s.porters.length === 0, `coins=${s.coins} done=${s.done.length}`);
    await shot('25_after_reset');
  }
  step('fps sample at the start (headless software GL, real time, informational)', true, String(fps));
} catch (e) {
  fatal = e;
  console.log('FATAL', e && e.stack || e);
  await shot('99_failure').catch(() => {});
}

const warnings = await page.evaluate(() => (window.__FV && window.__FV.warnings ? window.__FV.warnings() : [])).catch(() => []);
await browser.close();
await srv.close();

const manifest404 = [...new Set(log.missing404.filter((m) => /manifest\.json/.test(m)).map((m) => m.replace(/^.*(assets\/[a-z]+\/manifest\.json).*$/, '$1')))];
const other404 = log.missing404.filter((m) => !/manifest\.json/.test(m) && /^404 /.test(m));
console.log('\nmissing manifest fragments (placeholders used):', manifest404.join(', ') || 'none');
console.log('placeholder keys:', warnings.length, warnings.join(', '));
if (other404.length) console.log('other 404s:', other404.join('\n'));
console.log('page/console errors:', log.errors.length);
for (const e of log.errors) console.log('  ' + e);
const failed = results.filter((r) => !r.ok);
const ok = !fatal && log.errors.length === 0 && other404.length === 0 && failed.length === 0;
console.log(`\n${ok ? 'PASS' : 'FAIL'}: ${results.length - failed.length}/${results.length} steps ok, ${log.errors.length} errors. Screens in docs/previews/screens/`);
process.exit(ok ? 0 : 1);
