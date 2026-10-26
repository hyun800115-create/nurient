// (v4.2 touch) the designer's screenshots of the 큰 식당 테이블 늘리기 / 서빙 fix and the porters -> docs/previews/screens_v42/
//   node tools/test/shots_v42_touch.mjs [--only 31,32] [--repo DIR] [--size 390x844] [--dpr 3] [--lang ko] [--suffix _x]
//   (31–33 change the tables / crew for the rest of the run: shoot 34–36 in a run of their own: --only 34,35,36)
// From the v4.1 46-min save (all three restaurant staff hired), fixed-step clock. --repo runs another checkout (the
// "before" shot 30 on the v4.2 base copy). 31–33 stage a lunch rush (guests every 2.2–2.6 s) so the back yard fills
// (32–33 with the 서빙 직원 2) — the numbers are measured elsewhere (docs/build_reports/v42_touch.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const REPO = path.resolve(opt('--repo', path.resolve(HERE, '..', '..')));
const OUT = path.resolve(opt('--out', path.join(HERE, '..', '..', 'docs', 'previews', 'screens_v42')));
fs.mkdirSync(OUT, { recursive: true });
const ONLY = opt('--only', '') ? opt('--only', '').split(',') : null;
const [W, H] = opt('--size', '390x844').split('x').map(Number);
const DPR = Number(opt('--dpr', '3'));
const LANG = opt('--lang', 'ko');
const SUFFIX = opt('--suffix', '');
const SAVE = fs.readFileSync(path.join(HERE, 'fixtures', 'v41_save_smart_46min.json'), 'utf8');
const { start } = await import(path.join(REPO, 'tools/test/serve.mjs'));
const { launch, openPage, tapStart, sleep, waitFor } = await import(path.join(HERE, 'pw.mjs'));

// in the page: the restaurant busy (pantry full, the chief away), guests every `every` s
const BUSY = (every) => { const gs = window.__FV.scene, R = gs.civic.restaurant; R.R.spawnEvery = every; window.__FV.restFood({ item_fish_cooked: 30, item_bread: 30, item_meat_cooked: 30 }); window.__FV.clearStack(); window.__FV.teleport(R.x - 260, R.y + 300); return R; };
const SCENES = [
  // (base copy) the designer's phone: all three staff, the chief away: the terrace full of guests waiting for food
  { name: '30_restaurant_busy_before', secs: 150, feed: true, setup: () => { const R = window.__busy(5); return { x: R.x - 230, y: R.y - 120, z: 1.0 }; } },
  // a staged lunch rush (guests every 2.2–2.6 s, about twice what the staff can serve) fills the back yard. 31: one
  // server, then the normal pace for 14 s (since the touch finish he keeps up: no 서빙 직원 2 pad at this pace); 32–33:
  // with the 서빙 직원 2, the picture is taken when ≥ 9 seats are taken and ≥ 3 guests eat (`full`, ≤ 40 s more)
  // ((touch finish) 31–32 by day: the 46-min save loads in the evening, so without this 31–33 were all night shots)
  { name: '31_restaurant_tables_lv1', secs: 90, feed: true, setup: () => { const R = window.__busy(2.6); window.__day(); R.setTables(1, true); return { x: R.x - 190, y: R.y - 150, z: 1.25 }; },
    then: () => { const R = window.__FV.scene.civic.restaurant; R.R.spawnEvery = 5; return { x: R.x - 190, y: R.y - 150, z: 1.25 }; }, secs2: 14 },
  { name: '32_restaurant_tables_lv2', secs: 100, feed: true, setup: () => { const R = window.__busy(2.2); window.__day(); R.setTables(2, true); R.hire('server2', true); return { x: R.x - 250, y: R.y - 190, z: 1.3 }; },
    then: () => window.__full({ x: -250, y: -190, z: 1.3 }) },
  { name: '33_restaurant_tables_night', secs: 100, feed: true, setup: () => {
    const gs = window.__FV.scene, nb = gs.v4, R = window.__busy(2.2); R.setTables(2, true); R.hire('server2', true);
    if (nb && nb.clock) { if (!nb.clock.on && nb.clock.start) nb.clock.start(); nb.clock.set(22); }
    return { x: R.x - 250, y: R.y - 190, z: 1.3 };
  }, then: () => window.__full({ x: -250, y: -190, z: 1.3 }),
    after: () => { const nb = window.__FV.scene.v4; if (nb && nb.clock && nb.clock.on) nb.clock.set(10); } },
  // the 테이블 늘리기 pad in the back yard after the line waited for a seat (its banner kept; the other upgrade pads that
  // are due in this save are marked seen so their banners do not cover it)
  { name: '34_tables_pad', secs: 2, keepBanner: true, setup: () => {
    window.__flushBanners(); const R = window.__busy(5); window.__quiet();
    // ((touch finish) the 46-min save has served 150+ meals, so its pad (and banner) came at the load: put it up again)
    const L = window.__FV.scene.v42.lines; if (L.pads.tables1) { L.pads.tables1.vanish(); delete L.pads.tables1; } window.__FV.v42.v.seen.tb = {};
    R.busyT = 61; const p = R.tablesPadPos(); return { x: p.x + 110, y: p.y + 70, z: 1.0 }; // (y + 70: at 360 × 640 the banner's second line covered the pad label at + 120)
  } },
  // 짐꾼 2 for the 통조림 공장 (its pad by the cannery door, the banner)
  { name: '35_porter2_cannery_pad', secs: 2, keepBanner: true, setup: () => { window.__flushBanners(); const gs = window.__FV.scene, L = gs.v42.lines, w = gs.sourceById('cannery'); window.__FV.v42.v.seen.p2 = {}; window.__FV.clearStack(); L.fullT.cannery = 50; L.waitT.cannery = 0; window.__FV.teleport(w.outPad.x + 160, w.outPad.y + 170); return { x: w.outPad.x + 40, y: w.outPad.y + 10, z: 1.0 }; } },
  // a new 창고 직원 walks in from the nearest way into the village (the west gate, off screen while the chief is away)
  // to the 창고: the banner, the camera on the gate road and the 창고 (he is held mid-walk while the view settles)
  { name: '36_warehouse_crew_arrives', secs: 0.2, keepBanner: true, warm: 6, setup: () => { window.__quiet(); window.__flushBanners(); window.__FV.clearStack(); window.__FV.teleport(-200, 700); window.__FV.v42.crew({ rate: 450, now: true }); return null; },
    then: () => { const W = window.__FV.scene.warehouse, wp = W.porters[W.porters.length - 1]; window.__run(0.5); wp._spd = wp.speed; wp.speed = 0; return { x: (wp.x + W.outPad.x) / 2, y: (wp.y + W.outPad.y) / 2 - 40, z: 1.05 }; }, secs2: 0,
    after: () => { const W = window.__FV.scene.warehouse, wp = W.porters[W.porters.length - 1]; if (wp._spd) wp.speed = wp._spd; } },
];

const srv = await start(0, { prefix: '/fv/', root: REPO });
const browser = await launch();
const made = [], errors = [];
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: W, height: H }, dpr: DPR, locale: LANG === 'en' ? 'en-US' : 'ko-KR' });
await page.evaluate((sv) => { try { localStorage.clear(); localStorage.setItem('frostVillage.save.v1', sv); } catch (e) { /* */ } }, SAVE);
await page.reload({ waitUntil: 'load', timeout: 300000 });
await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 300000);
await sleep(300);
await tapStart(page);
await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player && window.__FV.scene.civic.restaurant, 300000);
await sleep(1500);
await page.evaluate((BUSYsrc) => {
  const game = window.__FV.game; game.loop.sleep();
  let T = game.loop.time || performance.now(); let D = Date.now(); Date.now = () => D; const DT = 1000 / 60;
  window.__run = (sec) => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { T += DT; D += DT; game.headlessStep(T, DT); } };
  window.__draw = () => { T += DT; D += DT; game.step(T, DT); };
  window.__busy = eval('(' + BUSYsrc + ')');
  // the day clock to 10:00 (and on, as the game runs it); the tint follows over `day.fade` s
  window.__day = (h = 10) => { const nb = window.__FV.scene.v4; if (nb && nb.clock) { if (!nb.clock.on && nb.clock.start) nb.clock.start(); nb.clock.set(h); } };
  // (the upgrade pads already due in this save are marked seen, so their banners do not cover the one in the picture)
  window.__quiet = () => { const S = window.__FV.v42.v.seen; for (const k of ['up', 'p2', 'p34', 'big']) S[k] = new Proxy(Object.assign({}, S[k] || {}), { get: (o, q) => (typeof q === 'string' ? 1 : o[q]) }); };
  // (the rush goes on until the picture shows a busy house being served: ≥ 9 of 16 seats taken and ≥ 3 guests
  //  eating — at most 40 s more; with two servers the 계산대 (about 14 orders a minute) is the limit, so 16 full seats are rare)
  window.__full = (c) => {
    const R = window.__FV.scene.civic.restaurant;
    for (let i = 0; i < 40; i++) { window.__run(1); const g = R.guests, eat = g.filter((q) => q.state === 'eat').length, sit = eat + g.filter((q) => q.state === 'seated').length; if (eat >= 3 && sit >= 9) break; }
    return { x: R.x + c.x, y: R.y + c.y, z: c.z };
  };
  // ((v4.2 final) offer banners now show one at a time after a gap (V42.queueBanner): a picture that keeps its banner
  //  starts with the queue and the banner on screen cleared, so its own banner shows at once)
  window.__flushBanners = () => { const v = window.__FV.v42 && window.__FV.v42.v; if (v) { v.bannerQ = []; v.bannerGapT = 0; } const ui = window.__FV.game.scene.getScene('UI'); if (ui && ui.bannerBox && ui.bannerBox.visible) { ui.tweens.killTweensOf(ui.bannerBox); ui.bannerBox.setVisible(false); } };
  try { window.__FV.v42.v.seen.whatsNew = 1; } catch (e) { /* */ }
}, BUSY.toString());
const run = async (sec, feed) => { for (let s = 0; s < sec; s += 5) { if (feed) await page.evaluate(() => window.__FV.restFood({ item_fish_cooked: 30, item_bread: 30, item_meat_cooked: 30 })); await page.evaluate((d) => window.__run(d), Math.min(5, sec - s)); } };
const warm = async (sec) => { await page.evaluate(() => window.__FV.game.loop.wake()); await sleep(sec * 1000); await page.evaluate(() => window.__FV.game.loop.sleep()); };
await warm(4);
for (const sc of SCENES.filter((s) => !ONLY || ONLY.some((o) => s.name.startsWith(o)))) {
  try {
    let cam = await page.evaluate(sc.setup);
    if (cam) await page.evaluate((c) => window.__FV.camera(c.x, c.y, c.z), cam);
    await run(sc.secs || 0, sc.feed);
    if (sc.then) { cam = await page.evaluate(sc.then); await run(sc.secs2 || 0); }
    if (cam) await page.evaluate((c) => window.__FV.camera(c.x, c.y, c.z), cam);
    await warm(sc.warm || 3);            // (late pictures: the loop awake a moment)
    if (!sc.keepBanner) await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); if (ui && ui.bannerBox && ui.bannerBox.visible) { ui.tweens.killTweensOf(ui.bannerBox); ui.bannerBox.setVisible(false); } });
    if (cam) await page.evaluate((c) => window.__FV.camera(c.x, c.y, c.z), cam);
    await page.evaluate(() => { for (let i = 0; i < 12; i++) window.__draw(); });
    const file = sc.name + SUFFIX + '.jpg';
    await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 84, timeout: 120000 });
    const st = await page.evaluate(() => { const r = window.__FV.civic().rest, c = window.__FV.v42.crew ? window.__FV.v42.crew() : null; return { rest: r && { tables: r.tables, seats: r.seats, seated: r.seated, eating: r.eating, queue: r.queue, served: r.served, lost: r.lost }, crew: c && c.crew }; });
    made.push([file, st]);
    if (sc.after) await page.evaluate(sc.after);
  } catch (e) { errors.push(sc.name + ': ' + String(e.message || e).split('\n')[0]); }
}
for (const e of log.errors) errors.push('page: ' + e);
for (const [f, st] of made) console.log('  ' + f + '  ' + JSON.stringify(st));
if (errors.length) { console.log('errors:'); for (const e of errors.slice(0, 20)) console.log('  ' + e); }
await browser.close();
await srv.close();
process.exit(errors.length ? 1 : 0);
