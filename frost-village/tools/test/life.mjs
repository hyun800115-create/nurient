// Village-life test (v2): makes every life event happen through __FV.lifeEvent(name) and saves a
// screenshot of each to docs/previews/screens_v2/. Uses the fixed-step clock (fv_step.mjs), so it
// works the same however slow headless rendering is.
//   node tools/test/life.mjs [--out dir] [--vp 390x844]
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render } from './fv_step.mjs';
// (until() in fv_step.mjs is handy for new checks)

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = opt('--out', path.join(ROOT, 'docs', 'previews', 'screens_v2'));
fs.mkdirSync(OUT, { recursive: true });
const vp = opt('--vp', '390x844').split('x').map(Number);

const results = [];
const step = (name, ok, info = '') => { results.push({ name, ok, info }); console.log((ok ? '  ok  ' : ' FAIL ') + name + (info ? '  — ' + info : '')); };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: vp[0], height: vp[1] } });
const ev = (fn, a) => page.evaluate(fn, a);
const shot = async (n) => { await render(page, 3); await page.screenshot({ path: path.join(OUT, n + '.jpg'), type: 'jpeg', quality: 84 }); };
const cam = (x, y, z = 1.25) => ev(([x, y, z]) => window.__FV.camera(x, y, z), [x, y, z]);
const life = () => ev(() => window.__FV.life());
const near = async (x, y) => { await ev(([x, y]) => window.__FV.teleport(x, y), [x, y]); };

let fatal = null;
try {
  await ev(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 90000);
  await sleep(800);
  await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI') && window.__FV.scene.life, 60000);
  // the villager atlases load after the title: wait until they are all in (real time)
  await waitFor(page, () => { const A = window.__FV.scene.life && window.__FV.scene.life.residents.length; return A >= 5; }, 120000).catch(() => {});
  await installStepper(page);
  await advance(page, 4);
  let L = await life();
  step('start residents (4 + dog)', L.residents.length >= 5, L.residents.map((r) => r.key).join(','));
  await cam(1150, 720, 1.05);
  await advance(page, 6);
  await shot('v2_01_start_village');

  // everything unlocked: the whole population
  await ev(() => { window.__FV.give(5000); window.__FV.unlockAll(); });
  // wait for the late atlases (the loader runs on game steps), then let everyone settle
  for (let i = 0; i < 90; i++) { await advance(page, 0.5); await sleep(300); if ((await life()).queued === 0) break; }
  await advance(page, 25);
  L = await life();
  step('population after all unlocks', L.residents.length >= 15, L.residents.length + ' residents, ' + L.moved.length + ' moved in');

  // --- chat
  await cam(520, 860, 1.4); await near(700, 880);
  await advance(page, 8);
  let ok = await ev(() => window.__FV.lifeEvent('chat'));
  if (ok && ok.x) await cam(ok.x, ok.y - 20, 1.4);
  await advance(page, 4.2);
  step('chat (pair / trio, talk + bubble)', !!ok, JSON.stringify((await life()).events));
  await shot('v2_02_chat');

  // --- snowball fight at the playground
  await cam(1440, 560, 1.4); await near(1330, 640);
  await advance(page, 8);
  ok = await ev(() => window.__FV.lifeEvent('snowball'));
  if (ok && ok.x) await cam(ok.x, ok.y - 20, 1.4);
  await advance(page, 0.55);
  await shot('v2_03_snowball_throw');
  await advance(page, 0.5);
  await shot('v2_04_snowball_hit');
  await advance(page, 1.6);
  await shot('v2_05_snowball_reaction');
  step('snowball fight (throw -> splat -> hit -> reaction)', !!ok);

  // --- tag (kids + dog)
  ok = await ev(() => window.__FV.lifeEvent('tag'));
  if (ok && ok.x) await cam(ok.x, ok.y - 20, 1.2);
  await advance(page, 2.2);
  await shot('v2_06_tag');
  step('tag among kids (+ dog)', !!ok);

  // --- snowman: build stage by stage
  await ev(() => { const l = window.__FV.scene.life; for (const e of l.events) e.end(); l.events.length = 0; });
  ok = await ev(() => window.__FV.lifeEvent('snowman'));
  // kids walk over (up to ~20 s), then pack the snow stage by stage
  for (let i = 0; i < 30; i++) { if ((await life()).snowman >= 1) break; await advance(page, 1); }
  { const p = await ev(() => { const s = window.__FV.scene.life.props.snowman; return s ? { x: s.x, y: s.y } : null; }); if (p) await cam(p.x, p.y - 40, 1.45); }
  await advance(page, 2);
  await shot('v2_07_snowman_building');
  for (let i = 0; i < 40; i++) { if ((await life()).snowman >= 3) break; await advance(page, 1); }
  await advance(page, 0.6);
  const sm = (await life()).snowman;
  await shot('v2_08_snowman_done');
  step('kids build the snowman (stages 1-3)', !!ok && sm >= 3, 'stage ' + sm);

  // --- concert at the nearest campfire
  await cam(740, 1610, 1.25); await near(900, 1700);
  await advance(page, 3);
  ok = await ev(() => window.__FV.lifeEvent('concert'));
  if (ok && ok.x) await cam(ok.x - 40, ok.y + 10, 1.3);
  // the bard walks over first (from wherever he was)
  for (let i = 0; i < 60; i++) { if (await ev(() => window.__FV.scene.life.events.some((e) => e.kind === 'concert' && e.playing))) break; await advance(page, 1); }
  await advance(page, 8);
  await shot('v2_09_concert');
  const cst = await ev(() => { const l = window.__FV.scene.life, e = l.events.find((q) => q.kind === 'concert'), b = l.byKey.npc_bard; return { playing: !!(e && e.playing), members: e ? e.members.length : 0, bard: b ? [Math.round(b.x), Math.round(b.y), b.animName] : null }; });
  step('campfire concert (perform + dancers)', !!ok && cst.playing && cst.members >= 3, JSON.stringify(cst));

  // --- elders sitting
  await cam(540, 600, 1.45); await near(700, 700);
  await advance(page, 2);
  ok = await ev(() => window.__FV.lifeEvent('sit'));
  await advance(page, 8);
  await shot('v2_10_elders_sit');
  step('elders sit on seats (zzz)', !!ok);

  // --- shiver, wave at the chief
  await cam(990, 1250, 1.4); await near(990, 1300);
  await advance(page, 2);
  ok = await ev(() => window.__FV.lifeEvent('shiver'));
  if (ok && ok.x) await cam(ok.x, ok.y - 20, 1.5);
  await advance(page, 0.8);
  await shot('v2_11_shiver');
  step('shivering + cold emote', !!ok);
  await ev(() => window.__FV.lifeEvent('wave'));
  await ev(() => window.__FV.setInput(0.6, 0.2));
  await advance(page, 1.2);
  await ev(() => window.__FV.setInput(0, 0));
  await advance(page, 0.6);
  await shot('v2_12_wave_at_chief');

  // --- tap a resident / a pet
  ok = await ev(() => window.__FV.lifeEvent('tap'));
  await advance(page, 0.8);
  await shot('v2_13_tap_resident');
  step('tap a resident (reaction + name)', !!ok);
  ok = await ev(() => { const l = window.__FV.scene.life; const p = l.residents.find((r) => r.isPet && !r.lod) || l.residents.find((r) => r.isPet); if (p) window.__FV.camera(p.x, p.y, 1.6); return !!p; });
  await advance(page, 0.6);
  ok = ok && await ev(() => window.__FV.lifeEvent('tapPet'));
  await advance(page, 0.7);
  await shot('v2_14_tap_pet');
  step('tap a pet (happy + heart)', !!ok);

  // --- unlock cheer, move-in, party
  await cam(990, 1200, 1.2); await near(990, 1240);
  await advance(page, 3);
  await ev(() => window.__FV.lifeEvent('cheer'));
  await advance(page, 0.9);
  await shot('v2_15_cheer');
  ok = await ev(() => window.__FV.lifeEvent('moveIn'));
  await advance(page, 12);
  await shot('v2_16_move_in');
  step('new resident walks in from the gate', true, String(ok));
  await ev(() => window.__FV.lifeEvent('party'));
  await advance(page, 14);
  await shot('v2_17_party');
  step('village-complete party', JSON.stringify((await life()).events).includes('party'));

  // --- zoom + overview
  await ev(() => window.__FV.camera());
  await ev(() => window.__FV.zoom('overview'));
  await advance(page, 2);
  await shot('v2_18_overview');
  const z = await ev(() => window.__FV.zoom('overview'));
  step('overview toggles', z.overview === false);
} catch (e) {
  fatal = e;
  console.log('FATAL', e && e.stack || e);
  await page.screenshot({ path: path.join(OUT, 'v2_99_failure.jpg') }).catch(() => {});
}
await browser.close();
await srv.close();
const failed = results.filter((r) => !r.ok);
console.log('page/console errors:', log.errors.length);
for (const e of log.errors.slice(0, 10)) console.log('  ' + e);
const ok = !fatal && !log.errors.length && !failed.length;
console.log(`\n${ok ? 'PASS' : 'FAIL'}: ${results.length - failed.length}/${results.length} life steps ok. Screens in ${path.relative(process.cwd(), OUT)}`);
process.exit(ok ? 0 : 1);
