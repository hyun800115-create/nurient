// Frost Village v3.5 dog play checks (기획서_v4 §5: 강아지 콩이와 놀기).
//   node tools/test/dog.mjs            (screenshots -> docs/previews/screens_v35/test_dog_*.jpg)
// Runs on the fixed-step clock (fv_step.mjs): every wait is GAME time. Buttons are tapped like a finger.
//   the dog roams (no longer follows the chief), the HUD whistle calls it (it runs in, barks), the 3-button
//   bar above it, treat (give -> eat -> hearts), fetch (throw -> run -> bring back; the 2nd throw is caught
//   in the air), petting (pet + roll), cooldowns, the affection gauge (saved), tapping the dog opens the
//   bar, a loving dog does tricks and brings a gift of coins.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep as realSleep, waitFor as realWaitFor } from './pw.mjs';
import { installStepper, advance, render, walkStep } from './fv_step.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews', 'screens_v35');
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const step = (name, ok, info = '') => { results.push({ name, ok, info }); console.log((ok ? '  ok  ' : ' FAIL ') + name + (info ? '  — ' + info : '')); };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 } });
const ev = (fn, arg) => page.evaluate(fn, arg);
const adv = (s) => advance(page, s);
const wait = async (fn, sec, arg, stepS = 0.25) => { for (let t = 0; t < sec; t += stepS) { if (await ev(fn, arg)) return true; await adv(stepS); } return !!(await ev(fn, arg)); };
const st = () => ev(() => window.__FV.state());
const shot = async (n) => { await render(page, 3); await page.screenshot({ path: path.join(OUT, 'test_dog_' + n + '.jpg'), type: 'jpeg', quality: 80 }); };
const boot = async (clear) => {
  if (clear) await ev(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.reload({ waitUntil: 'load' });
  await realWaitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await realSleep(400);
  await tapStart(page);
  await realWaitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 180000);
  await installStepper(page);
  await adv(1);
};
/** tap a UI-scene object like a finger (its centre, logical UI coordinates -> page) */
const tapUI = async (getXY) => {
  const xy = await ev(getXY);
  const c = await page.$('canvas'); const b = await c.boundingBox();
  const k = b.width / 720;
  await page.touchscreen.tap(b.x + xy.x * k, b.y + xy.y * k);
  await render(page, 1);
};
const dogState = () => ev(() => window.__FV.state().dog);
const love = async () => (await dogState()).love;

let fatal = null;
try {
  await boot(true);
  await ev(() => { window.__FV.give(2000); window.__FV.unlockAll(); window.__FV.zoom(1.2); });
  await realWaitFor(page, () => !!(window.__FV.scene.dog && window.__FV.scene.dog.r), 90000).catch(() => {});
  await adv(2);
  let d = await dogState();
  step('Kongi lives in the village (pets2 art)', !!d.dog && d.mode === 'roam', JSON.stringify(d));
  // 1. it no longer follows the chief: walk around for a while, it stays where it plays
  {
    const path0 = [{ x: 1000, y: 1500 }, { x: 760, y: 1650 }, { x: 1250, y: 1650 }, { x: 990, y: 1250 }];
    let near = 0, n = 0;
    for (const t of path0) {
      await walkStep(page, t, { tol: 20, teleport: true });
      const s = await st();
      const dd = s.dog.dog ? Math.hypot(s.dog.dog.x - s.player.x, (s.dog.dog.y - s.player.y) * 2) : 9999;
      n++; if (dd < 200) near++;
    }
    step('the dog roams on its own (does not trail the chief)', near <= 1, `near the chief at ${near}/${n} stops`);
  }
  // 2. the whistle button in the HUD
  const whistleVisible = await ev(() => window.__FV.game.scene.getScene('UI').whistleBtn.visible);
  step('whistle button in the HUD', whistleVisible);
  await ev(() => window.__FV.teleport(1180, 1640));
  await adv(0.5);
  await ev(() => { const ui = window.__FV.game.scene.getScene('UI'); window.__hits = []; ui.input.on('gameobjectdown', (p, o) => window.__hits.push(o.type + ':' + (o.texture && o.texture.key) + ':' + Math.round(o.x) + ',' + Math.round(o.y))); });
  await tapUI(() => { const ui = window.__FV.game.scene.getScene('UI'); return { x: ui.whistleBtn.x, y: ui.whistleBtn.y }; });
  await adv(0.3);
  // (a synthetic tap is very rarely lost by headless touch emulation: tap once more like a person would)
  if (!(await ev(() => window.__hits.length))) { console.log('  (whistle tap not received, tapping again)'); await tapUI(() => { const ui = window.__FV.game.scene.getScene('UI'); return { x: ui.whistleBtn.x, y: ui.whistleBtn.y }; }); await adv(0.3); }
  console.log('  (whistle tap hits: ' + JSON.stringify(await ev(() => window.__hits)) + ')');
  d = await dogState();
  step('tapping the whistle calls the dog (it runs to the chief)', d.mode === 'come' || d.mode === 'near', JSON.stringify(d));
  await wait(() => { const s = window.__FV.state(); return s.dog.dog && Math.hypot(s.dog.dog.x - s.player.x, (s.dog.dog.y - s.player.y) * 2) < 520; }, 40, undefined, 0.5);
  await shot('01_running_in');
  const arrived = await wait(() => window.__FV.state().dog.mode === 'near', 40, undefined, 0.5);
  await adv(0.4);
  d = await dogState();
  step('it arrives and the 3-button bar shows above it', arrived && d.bar, JSON.stringify(d));
  await shot('02_bar');
  // 3. treat: give -> eat -> hearts
  const l0 = await love();
  await tapUI(() => { const ui = window.__FV.game.scene.getScene('UI'); const q = ui.dogBtns[0]; return { x: ui.dogBar.x + q.b.x, y: ui.dogBar.y + q.b.y }; });
  await wait(() => /treat:give/.test(window.__FV.state().dog.scene || ''), 3, undefined, 0.1);
  await adv(0.3);
  const giveAnim = (await st()).player.anim;
  await shot('03_treat_give');
  await wait(() => /treat:eat/.test(window.__FV.state().dog.scene || ''), 3, undefined, 0.1);
  await adv(0.4);
  const eatAnim = (await dogState()).dog.anim;
  await shot('04_treat_eat');
  await wait(() => window.__FV.state().dog.mode !== 'scene', 5, undefined, 0.1);
  await adv(0.1);
  await shot('05_treat_hearts');
  const l1 = await love();
  step('treat: the chief gives a bone biscuit, the dog eats it, affection goes up', giveAnim === 'give' && eatAnim === 'eat' && l1 > l0, `give=${giveAnim} eat=${eatAnim} love ${l0} -> ${l1}`);
  await tapUI(() => { const ui = window.__FV.game.scene.getScene('UI'); const q = ui.dogBtns[0]; return { x: ui.dogBar.x + q.b.x, y: ui.dogBar.y + q.b.y }; });
  await adv(0.3);
  d = await dogState();
  step('treat has a cooldown (no spamming)', d.mode !== 'scene' && d.cd.treat > 0 && (await love()) === l1, JSON.stringify(d.cd));
  // 4. petting
  await adv(1.4);
  await tapUI(() => { const ui = window.__FV.game.scene.getScene('UI'); const q = ui.dogBtns[2]; return { x: ui.dogBar.x + q.b.x, y: ui.dogBar.y + q.b.y }; });
  await wait(() => /pet:pet/.test(window.__FV.state().dog.scene || ''), 3, undefined, 0.1);
  await adv(1.0);
  const pet = { chief: (await st()).player.anim, dog: (await dogState()).dog.anim };
  await shot('06_pet_roll');
  await wait(() => window.__FV.state().dog.mode !== 'scene', 6, undefined, 0.2);
  const l2 = await love();
  step('petting: the chief crouches and pets, the dog rolls over, hearts', pet.chief === 'pet' && pet.dog === 'roll' && l2 > l1, `${JSON.stringify(pet)} love ${l1} -> ${l2}`);
  // 5. fetch, then the catch
  await adv(1.4);
  await tapUI(() => { const ui = window.__FV.game.scene.getScene('UI'); const q = ui.dogBtns[1]; return { x: ui.dogBar.x + q.b.x, y: ui.dogBar.y + q.b.y }; });
  await wait(() => /play:flight/.test(window.__FV.state().dog.scene || ''), 3, undefined, 0.05);
  const thr = (await st()).player.anim;
  await adv(0.15);
  await shot('07_throw');
  const ranOut = await wait(() => /play:fetch|play:back/.test(window.__FV.state().dog.scene || ''), 4, undefined, 0.1);
  await shot('08_fetch');
  await wait(() => /play:back/.test(window.__FV.state().dog.scene || ''), 6, undefined, 0.1);
  await adv(0.25);
  const back = (await dogState()).dog.anim;
  await shot('09_bring_back');
  await wait(() => window.__FV.state().dog.mode !== 'scene', 8, undefined, 0.2);
  const l3 = await love();
  step('fetch: throw -> the dog runs for the ball and brings it back (ball in its mouth)', thr === 'throw' && ranOut && back === 'run_ball' && l3 > l2, `throw=${thr} ran=${ranOut} back=${back} love ${l2} -> ${l3}`);
  // (the fetch button has its cooldown: balance.js dog.playCooldown)
  await wait(() => window.__FV.state().dog.cd.play <= 0, 14, undefined, 0.25);
  await adv(0.4);
  await tapUI(() => { const ui = window.__FV.game.scene.getScene('UI'); const q = ui.dogBtns[1]; return { x: ui.dogBar.x + q.b.x, y: ui.dogBar.y + q.b.y }; });
  const caught = await wait(() => { const s = window.__FV.state().dog; return s.dog && s.dog.anim === 'catch'; }, 4, undefined, 0.05);
  await adv(0.12);
  await shot('10_catch');
  await wait(() => window.__FV.state().dog.mode !== 'scene', 8, undefined, 0.2);
  const l4 = await love();
  step('the second throw is caught in the air (catch anim)', caught && l4 > l3, `caught=${caught} love ${l3} -> ${l4}`);
  // 6. tapping the dog opens the bar; it goes back to playing when left alone
  await ev(() => { const d = window.__FV.scene.dog; d.roam(d.r); });
  await adv(0.5);
  const tapped = await ev(() => { const r = window.__FV.scene.dog.r; return window.__FV.tapWorld(r.x, r.y - 20); });
  await wait(() => window.__FV.state().dog.mode === 'near', 20, undefined, 0.5);
  d = await dogState();
  step('tapping the dog calls it and opens the bar', tapped === 'pet_dog' && d.mode === 'near' && d.bar, JSON.stringify(d));
  await adv(14);
  d = await dogState();
  step('left alone it goes back to playing in the village', d.mode === 'roam' && !d.bar, JSON.stringify(d));
  // 7. affection is saved; a loving dog does tricks and brings gifts
  await ev(() => window.__FV.save());
  const lsaved = await love();
  await boot(false);
  await realWaitFor(page, () => !!(window.__FV.scene.dog && window.__FV.scene.dog.r), 90000).catch(() => {});
  const lload = await love();
  step('affection (hearts) is saved', Math.abs(lload - lsaved) < 0.2 && lload > 0, `${lsaved} -> ${lload}`);
  await ev(() => { const d = window.__FV.scene.dog; d.love = 92; window.__FV.teleport(1180, 1640); });
  await adv(1);
  await ev(() => window.__FV.dog('whistle'));
  await wait(() => window.__FV.state().dog.mode === 'near', 40, undefined, 0.5);
  await ev(() => { window.__FV.scene.dog.trickT = 0.2; });
  const trick = await wait(() => { const s = window.__FV.state().dog; return s.dog && s.dog.anim === 'trick'; }, 6, undefined, 0.1);
  await adv(0.4);
  await shot('11_trick');
  step('a loving dog does a trick on its own', trick, JSON.stringify(await dogState()));
  const c0 = (await st()).coins;
  await ev(() => { const d = window.__FV.scene.dog; d.roam(d.r); d.giftT = 0.05; });
  const gifted = await wait(() => window.__FV.state().dog.gifts > 0, 30, undefined, 0.5);
  await adv(0.3);
  await shot('12_gift');
  const c1 = (await st()).coins;
  step('...and sometimes brings a gift of coins', gifted && c1 > c0, `coins ${c0} -> ${c1}`);
} catch (e) {
  fatal = e;
  console.log('FATAL', e && e.stack || e);
}
const warnings = await ev(() => (window.__FV && window.__FV.warnings ? window.__FV.warnings() : [])).catch(() => []);
await browser.close();
await srv.close();
console.log('placeholder keys:', warnings.length, warnings.join(', '));
console.log('page/console errors:', log.errors.length);
for (const e of log.errors) console.log('  ' + e.slice(0, 400));
const failed = results.filter((r) => !r.ok);
const ok = !fatal && log.errors.length === 0 && failed.length === 0;
console.log(`\n${ok ? 'PASS' : 'FAIL'}: ${results.length - failed.length}/${results.length} dog checks ok, ${log.errors.length} errors.`);
process.exit(ok ? 0 : 1);
