// Frost Village v4 screenshots for the designer (docs/v4_plan.md §16.4 must-look set) -> docs/previews/screens_v4/
//   node tools/test/shots_v4.mjs [--size 390x844] [--lang ko|en] [--only 07] [--set all|hud]
// Fixed-step clock (game time). The default run takes the 19 must-look shots at 390×844 in Korean; `--set hud`
// takes the HUD / panel shots (order panel, 역 금고, rank chip + panel, ceremony) for another size / language.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render } from './fv_step.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews', 'screens_v4');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const [VW, VH] = opt('--size', '390x844').split('x').map(Number);
const LANG = opt('--lang', 'ko');
const SET = opt('--set', 'all');
const ONLY = opt('--only', null);
const SUFFIX = (VW === 390 && VH === 844 ? '' : '_' + VW + 'x' + VH) + (LANG === 'ko' ? '' : '_' + LANG);

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: VW, height: VH }, locale: LANG === 'en' ? 'en-US' : 'ko-KR' });
const ev = (fn, a) => page.evaluate(fn, a);
const adv = (s) => advance(page, s);
const nudge = (fn, ms = 120000) => waitFor(page, `(() => { const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); return (${fn})(); })()`, ms).then(() => true).catch(() => false);
const until = async (fn, max, chunk = 0.5, arg) => { for (let t = 0; t <= max; t += chunk) { if (await ev(fn, arg)) return t; await ev(() => { const L = window.__FV.scene.load; if (L && L.isLoading()) L.update(); }); await adv(chunk); } return -1; };
const made = [];
const want = (n) => (!ONLY || n.startsWith(ONLY)) && (SET === 'all' || /orders|till|rank|ceremony|chips/.test(n));
const shot = async (n) => {
  if (!want(n)) return;
  await render(page, 3);
  const f = path.join(OUT, n + SUFFIX + '.jpg');
  await page.screenshot({ path: f, type: 'jpeg', quality: 84 });
  made.push(path.basename(f)); console.log('shot', path.basename(f));
};
const cam = (x, y, z) => ev(([x, y, z]) => window.__FV.camera(x, y, z), [x, y, z]);
let fatal = null;
try {
  await ev((lang) => { try { localStorage.clear(); localStorage.setItem('frostVillage.settings.v1', JSON.stringify({ sound: false, music: false, lang, daynight: true, gfx: 'auto' })); } catch (e) { /* */ } }, LANG);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(400);
  await tapStart(page);
  await waitFor(page, () => window.__FV.state && window.__FV.game.scene.isActive('UI'), 180000);
  await sleep(1500);
  await installStepper(page);
  await adv(1);
  await ev(() => { window.__FV.unlockV3(); window.__FV.give(50000); });
  await adv(2);
  await nudge(() => window.__FV.scene.v4 && window.__FV.scene.v4.ready && window.__FV.hasTex('town_civic'));
  await adv(3);
  // 01 the ruin by the old track
  await cam(3420, 1400, 1.0); await adv(2);
  await shot('01_ruin');
  // 02 the station site (scaffold)
  await ev(() => { window.__FV.build('r_station', 'station'); window.__FV.supply('r_station'); });
  await adv(3);
  await shot('02_station_site');
  // 03 the first train arriving
  await ev(() => window.__FV.finishSite('r_station'));
  await nudge(() => window.__FV.hasTex('train_engine') && window.__FV.scene.v4.town && window.__FV.state().v4.tf && window.__FV.state().v4.tf.adult, 150000);
  await cam(3300, 1450, 1.0);
  await until(() => { const t = window.__FV.v4.state().train; return t && /arriv|atOurs/.test(t.phase || ''); }, 20, 0.25);
  await adv(0.5);
  await shot('03_first_train');
  // 04 the neighbours on 역 가는 길
  await adv(6);
  const vp = await ev(() => { const v = window.__FV.v4.state().visitors; if (!v.length) return null; const x = v.reduce((s, q) => s + q.x, 0) / v.length, y = v.reduce((s, q) => s + q.y, 0) / v.length; return { x, y }; });
  if (vp) await cam(vp.x, vp.y - 40, 1.1);
  await adv(1);
  await shot('04_neighbours_walk');
  // 05 doll customers at the plaza
  await until(() => window.__FV.v4.state().visitors.some((v) => /queue|wait|buy|browse/.test(v.stage + v.state)), 40, 1);
  const m = await ev(() => { const k = window.__FV.scene.market; return { x: k.x, y: k.y }; });
  await cam(m.x + 40, m.y + 80, 1.15);
  await adv(2);
  await shot('05_plaza_customers');
  await ev(() => window.__FV.camera());
  // 06 the order panel
  await ev(() => window.__FV.scene.ui.openOrders());
  await adv(0.6);
  await shot('06_orders_panel');
  await ev(() => window.__FV.scene.ui.s.hud4.closePanel(true));
  // 07 cargo loading into the wagon (crates on the dock while the train stands at our station)
  await ev(() => { const g = window.__FV.scene.v4.growth; window.__FV.carry('item_bread', 12); window.__FV.teleport(g.dock.x, g.dock.y); });
  await adv(4);
  await until(() => { const t = window.__FV.v4.state().train; return t && /atOurs/.test(t.phase || ''); }, 90, 1);
  await cam(3330, 1460, 1.1);
  await adv(3);
  await shot('07_cargo_wagon');
  // 08 the founder walking, 09 builders
  await ev(() => window.__FV.v4.fill(window.__FV.v4.growth().cards.findIndex((c) => c.shop === 'cafe')));
  await ev(() => window.__FV.teleport(3300, 1700));
  await until(() => { const s = Object.values(window.__FV.v4.growth().shops)[0]; const nb = window.__FV.scene.v4; return s && (s.st === 'build' || (nb.growth.founderActor && nb.growth.founderActor.x)); }, 120, 1);
  const lot = await ev(() => { const s = Object.values(window.__FV.scene.v4.growth.shops)[0]; return { x: s.x, y: s.y }; });
  await cam(lot.x - 120, lot.y + 40, 1.1);
  await adv(1);
  await shot('08_founder');
  await until(() => Object.values(window.__FV.v4.growth().shops)[0].st === 'build', 60, 1);
  await cam(lot.x, lot.y - 30, 1.15);
  await adv(9);
  await shot('09_builders');
  // 10 the ribbon
  await until(() => Object.values(window.__FV.v4.growth().shops)[0].st === 'ribbon', 40, 1);
  await adv(1);
  await shot('10_ribbon');
  await ev(() => { const s = Object.values(window.__FV.scene.v4.growth.shops)[0]; window.__FV.teleport(s.ribbonPad.x, s.ribbonPad.y); });
  await adv(3);
  // 11 역 금고 with +N/분
  const q = await ev(() => { const g = window.__FV.scene.v4.growth; return { x: g.till.x, y: g.till.y }; });
  await cam(q.x, q.y - 60, 1.2);
  await adv(4);
  await shot('11_till');
  // 12 the town welcome
  await ev(() => { window.__FV.v4.invite(); window.__FV.v4.openTown(); });
  await nudge(() => window.__FV.hasTex('town_homes') && window.__FV.state().v4.tf.child, 150000);
  await ev(() => { window.__FV.camera(); window.__FV.teleport(4700, 2520); });
  await until(() => !!window.__FV.state().flags.townVisit, 15, 0.5);
  await adv(0.8);
  await shot('12_town_welcome');
  // 13 the school bell, 14 dusk lamps, 15 night town
  const school = await ev(() => { const b = window.__FV.scene.v4.buildings.find((q) => q.key === 'school'); return b ? { x: b.x, y: b.y } : { x: 5000, y: 2300 }; });
  await ev(() => window.__FV.v4.clock(14.9));
  await cam(school.x, school.y + 80, 1.0);
  await adv(12);
  await shot('13_school_out');
  await ev(() => window.__FV.v4.clock(18.6));
  await cam(4900, 2450, 1.0);
  await adv(6);
  await shot('14_dusk_lamps');
  await ev(() => window.__FV.v4.clock(22.4));
  await adv(6);
  await shot('15_night_town');
  await ev(() => window.__FV.v4.clock(10));
  // 16 the rank ceremony + HUD chips, 17 the cobble street
  await ev(() => { window.__FV.camera(); window.__FV.v4.foundAll(); });
  for (let k = 0; k < 3; k++) { const id = await ev(() => window.__FV.v4.house()); if (id) await until((h) => { const x = window.__FV.v4.growth().houses[h]; return x && x.st === 'done'; }, 45, 1, id); }
  await ev(() => window.__FV.v4.happy(Array(40).fill(1)));
  await until(() => !!window.__FV.scene.progress.pads.rank_eup, 8, 0.5);
  await ev(() => window.__FV.scene.ui.openRank());
  await adv(0.6);
  await shot('16a_rank_panel');
  await ev(() => window.__FV.scene.ui.s.hud4.closePanel(true));
  const pp = await ev(() => { const p = window.__FV.scene.progress.pads.rank_eup; return p ? { x: p.x, y: p.y } : null; });
  if (pp) await ev((p) => window.__FV.teleport(p.x, p.y), pp);
  await until(() => window.__FV.v4.rank().ceremony, 15, 0.5);
  await adv(4.5);
  await shot('16_ceremony_chips');
  await adv(10);
  await cam(3480, 1470, 1.1);
  await adv(3);
  await shot('17_cobble_street');
  await ev(() => window.__FV.camera());
  // 18 zoom 0.6 lite rigs, 19 the overview
  await ev(() => { window.__FV.teleport(4900, 2500); });
  await cam(4900, 2450, 0.6);
  await adv(4);
  await shot('18_zoom06_lite');
  await ev(() => { window.__FV.camera(); window.__FV.zoom('overview'); });
  await adv(4);
  await shot('19_overview');
} catch (e) { fatal = e; console.log('FATAL', e && e.stack || e); }
console.log('shots', made.length, made.join(' '));
console.log('errors', log.errors.slice(0, 5));
console.log('placeholders', log.warnings.filter((w) => /missing asset|placeholder/i.test(w)).slice(0, 5));
await browser.close();
await srv.close();
process.exit(fatal || log.errors.length ? 1 : 0);
