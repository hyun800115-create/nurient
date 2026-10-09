// BUILD-C2 designer screenshots (docs/previews/screens_v4/c2s_*.jpg): the first-run title intro frame by frame
// (fixed-step clock for the title too), the idle title of a returning player, the living sea at two zooms (high
// quality), residents chattering, a chat sheet open in the village.
//   node tools/test/shots_c2.mjs        (run under nohup)
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render } from './fv_step.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews', 'screens_v4');
fs.mkdirSync(OUT, { recursive: true });
const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 } });
const ev = (fn, a) => page.evaluate(fn, a);
const frame = (n = 2) => ev((k) => { for (let i = 0; i < k; i++) window.__step.frame(); }, n);
const snap = async (name) => { await page.screenshot({ path: path.join(OUT, 'c2s_' + name + '.jpg'), type: 'jpeg', quality: 84 }); console.log('shot', name); };
let code = 0;
try {
  await ev(() => { try { localStorage.clear(); localStorage.setItem('frostVillage.settings.v1', JSON.stringify({ sound: true, music: true, water: 'high' })); } catch (e) { /* */ } });
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title') && window.__FV.title && window.__FV.title.screen, 180000);
  // let every intro pack arrive (real time), then run the intro on the fixed clock from its start
  await waitFor(page, () => { const s = window.__FV.title.screen.state(); return s.groups[1] === 'ready' && s.groups[2] === 'ready'; }, 60000).catch(() => {});
  await installStepper(page);
  const marks = [[0.6, '01_camp'], [3.2, '02_village'], [5.8, '03_town_train'], [8.6, '04_city'], [10.4, '05_logo'], [12.5, '06_tap_to_start']];
  let tNow = 0;
  for (const [t, name] of marks) {
    while (tNow < t) {
      await ev(() => window.__step.run(0.25));
      tNow += 0.25;
      await sleep(60);       // late packs land in real time
    }
    await frame(2);
    const st = await ev(() => window.__FV.title.screen.state());
    console.log(name, JSON.stringify({ t: st.t, stage: st.stage, mode: st.mode, hold: st.hold, groups: st.groups }));
    await snap('title_' + name);
  }
  // into the village (real taps), the stepper stays installed
  await ev(() => window.__FV.title.screen.tap());
  for (let i = 0; i < 40 && await ev(() => window.__FV.game.scene.isActive('Title')); i++) { await ev(() => window.__step.run(0.2)); await sleep(100); }
  await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 180000);
  await ev(() => window.__step.run(1));
  await sleep(1500);
  // a lived-in village: the v3 map, residents
  await ev(() => { window.__FV.unlockV3(); window.__FV.give(20000); });
  for (let i = 0; i < 8; i++) await ev(() => window.__FV.lifeEvent('moveIn'));
  for (let i = 0; i < 20; i++) { await advance(page, 0.5); await ev(() => { const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); }); await sleep(150); }
  // the sea at two zooms
  await ev(() => { window.__FV.teleport(1010, 560); window.__FV.zoom(1.0); });
  await advance(page, 3); await render(page, 4);
  await snap('sea_zoom1');
  await ev(() => { window.__FV.teleport(2400, 900); window.__FV.zoom(0.6); });
  await advance(page, 3); await render(page, 4);
  await snap('sea_zoom06');
  await ev(() => { window.__FV.teleport(-700, 560); window.__FV.zoom(0.85); });
  await advance(page, 3); await render(page, 4);
  await snap('sea_west_strip');
  // residents chattering (their voices load in real time)
  await ev(() => { window.__FV.teleport(1010, 760); window.__FV.zoom(1.1); });
  for (let i = 0; i < 16; i++) { await ev(() => { window.__FV.lifeEvent('chat'); const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); }); await advance(page, 0.5); await sleep(250); }
  await render(page, 3);
  await snap('residents_chatter');
  console.log('voice', JSON.stringify(await ev(() => window.__FV.voice())));
  // tap a resident -> 수다 떨기 -> the sheet
  const r = await ev(() => { const gs = window.__FV.scene; const x = gs.life.residents.find((q) => gs.residentChat.canChat(q) && !q.lod && !q.seat && !q.event && gs.isOnScreen(q.x, q.y, -40)); if (!x) return null; return { x: x.x, y: x.y, key: x.key }; });
  if (r) {
    await ev(([x, y]) => window.__FV.tapWorld(x, y - 30), [r.x, r.y]);
    await advance(page, 0.3); await render(page, 3);
    await snap('chat_button');
    await ev(() => window.__FV.game.scene.getScene('UI').chatPressed());
    await waitFor(page, () => window.__FV.chat() && window.__FV.chat().open, 30000);
    await sleep(2200);
    await snap('chat_open');
    await page.fill('.fc-root input', '안녕하세요! 요즘 어때요?');
    await page.keyboard.press('Enter');
    await sleep(3500);
    await snap('chat_talk');
    await page.click('.fc-root .fc-close');
    await sleep(500);
  }
  console.log('page errors:', log.errors.length, log.errors.slice(0, 3));
} catch (e) { code = 1; console.log('FATAL', e && e.stack || e); }
await browser.close();
await srv.close();
process.exit(code);
