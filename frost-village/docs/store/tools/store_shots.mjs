// Google Play phone screenshots of 행복한 눈꽃마을 이야기, taken from the real game (no mock-ups).
//
//   node docs/store/tools/store_shots.mjs --repo <checkout of the published commit> --out <dir> [--only a,b] [--lang ko]
//
// Run it against a git worktree of the commit that is on the store (v4.2 = aa169bd), not the working tree:
//   git worktree add --detach /tmp/fv_store aa169bd
//   nice node frost-village/docs/store/tools/store_shots.mjs --repo /tmp/fv_store/frost-village --out /tmp/fv_store_shots
// Each picture is 360 x 720 CSS px at device pixel ratio 3 = 1080 x 2160 PNG (9:18, inside Play's 2:1 limit), with the
// HUD as a player sees it (coins, the hint pill, the buttons). Nothing is drawn on top; the scene is only staged with the
// game's own test hooks (window.__FV: camera, clock, teleport, the train timetable), on the fixed-step clock the
// repository's screenshot scripts use (tools/test/shots_v42*.mjs). Transient toasts and offer banners are hidden.
// Sound is off. One browser, one page per save.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const REPO = path.resolve(opt('--repo', '.'));
const OUT = path.resolve(opt('--out', 'store_shots'));
const ONLY = opt('--only', '') ? opt('--only', '').split(',') : null;
const LANG = opt('--lang', 'ko');
const [VW, VH] = opt('--size', '360x720').split('x').map(Number);
const DPR = Number(opt('--dpr', '3'));
fs.mkdirSync(OUT, { recursive: true });

const { start } = await import(path.join(REPO, 'tools/test/serve.mjs'));
const { launch, openPage, tapStart, sleep, waitFor } = await import(path.join(REPO, 'tools/test/pw.mjs'));
const FIX = (n) => fs.readFileSync(path.join(REPO, 'tools/test/fixtures', n), 'utf8');

// ------------------------------------------------------------------ scenes
// setup / then run in the page and may return a camera { x, y, z }; secs / secs2 = game seconds on the fixed clock;
// warm = real seconds with the game loop awake (on-demand art arriving); until = keep the loop awake until true.
const LATE = 'v41_save_smart_46min.json';
const SCENES = [
  // 1 the first village: the chief with a tall stack by the shops, residents about, morning light
  { name: '01_village', save: 'v35_save_12min.json', secs: 3, warm: 3, setup: () => {
    const F = window.__FV, gs = F.scene, m = gs.market, p = gs.player;
    F.clearStack(); for (let i = 0; i < 6; i++) p.stack.push('item_fish_cooked', null, gs.effects);
    F.teleport(m.x + 90, m.y + 210);
    return { x: m.x + 50, y: m.y + 140, z: 1.1 };
  } },
  // 2 the train in at our station with the town coach (daytime)
  { name: '02_train', save: LATE, secs: 2, warm: 4, coins: 12840, setup: () => {
    const nb = window.__FV.scene.v4; window.__day(10); window.__FV.clearStack();
    window.__FV.teleport(nb.ours.x + 140, nb.ours.y + 220);
    return null;
  }, then: () => { const nb = window.__FV.scene.v4; nb.rail.set('atOurs', 1); return { x: nb.ours.x + 10, y: nb.ours.y + 60, z: 0.95 }; }, secs2: 1.5 },
  // 3 the big restaurant at lunch: tables full, the staff serving, coins on the tables
  { name: '03_restaurant', save: LATE, coins: 12840, secs: 100, feed: true, setup: () => {
    const R = window.__busy(2.2); window.__day(12); R.setTables(2, true); R.hire('server2', true);
    return { x: R.x - 250, y: R.y - 190, z: 1.25 };
  }, then: () => window.__full({ x: -250, y: -190, z: 1.25 }) },
  // 5 the chief's office, cut away: the staff at their desks
  { name: '05_office', save: LATE, coins: 12840, secs: 8, warm: 6, until: () => { const O = window.__FV.scene.v42.office; return Object.values(O.staff).every((c) => !c.seat || (c.animName === c.want && /^(desk_|sit_)/.test(c.animName))); }, setup: () => {
    const F = window.__FV; window.__day(10); F.v42.office({ build: true, hire: ['sem', 'ttal', 'bok', 'chong'] });
    const O = F.scene.v42.office, e = O.building.spots.entry || O.building.spots.door; F.teleport(e.x, e.y); return null;
  }, then: () => { const O = window.__FV.scene.v42.office; return { x: O.x, y: O.y - 20, z: 1.2 }; }, secs2: 2 },
  // 6 night: the station square and the street lamps, the chief in the crowd
  { name: '06_night', save: LATE, secs: 25, warm: 2, coins: 12840, setup: () => {
    const gs = window.__FV.scene, nb = gs.v4; window.__day(22); nb.rail.set('atOurs', 2); window.__FV.clearStack();
    const q = nb.ours; window.__FV.teleport(q.x - 60, q.y + 200);
    return { x: q.x - 60, y: q.y + 150, z: 0.75 };
  }, after: () => window.__day(10) },
  // 7 the living sea: the fishing boats on the water by the dock
  { name: '07_sea', save: LATE, secs: 6, warm: 3, setup: () => {
    const gs = window.__FV.scene, H = gs.boathouse, b = H && H.boat; window.__day(15); window.__FV.clearStack();
    if (b && H.route && H.route.length) { const w = H.route[H.route.length - 1]; b.x = w.x; b.y = w.y; b.state = 'fish'; b.fishT = 40; if (b.pickSpot) b.pickSpot(); }
    window.__FV.teleport(H.x - 60, H.y + 140);
    return null;
  }, then: () => { const gs = window.__FV.scene, H = gs.boathouse, b = H.boat || H; return { x: b.x - 80, y: b.y + 320, z: 0.85 }; }, secs2: 1, coins: 12840 },
  // 8 관망: the chief works on his own, the camera follows, the caption says what he does
  { name: '08_observe', save: LATE, coins: 12840, secs: 12, setup: () => { window.__day(10); window.__FV.v42.pilot(true); return null; },
    then: () => { const p = window.__FV.scene.player; return { x: p.x, y: p.y, z: 0.9 }; }, after: () => { window.__FV.v42.pilot(false); } },
  // 4 (shot last in its page: it replays the rank-up on a save that already has it) the rank ceremony in front of 마을회관: bells, confetti, the village gathered round
  { name: '04_ceremony', save: LATE, secs: 0, setup: () => {
    const gs = window.__FV.scene, rk = gs.v4.rank; window.__day(11);
    const hall = gs.civic && gs.civic.hall;
    if (hall) { const v = hall.venue('rank'); window.__FV.teleport(v.x, v.y + 30); }
    rk.level = 1; rk.applied = false; rk.ceremony(false);
    return null;
  }, then: () => { const rk = window.__FV.scene.v4.rank; return { x: rk.cx + 60, y: rk.cy - 60, z: 1.12 }; }, secs2: 2.4, keepBanner: true, coins: 12840 },
];

const BUSY = (every) => { const gs = window.__FV.scene, R = gs.civic.restaurant; R.R.spawnEvery = every; window.__FV.restFood({ item_fish_cooked: 30, item_bread: 30, item_meat_cooked: 30 }); window.__FV.clearStack(); window.__FV.teleport(R.x - 260, R.y + 300); return R; };

const srv = await start(0, { prefix: '/fv/', root: REPO });
const browser = await launch();
const made = [], errors = [];
const groups = [];
for (const sc of SCENES) { if (ONLY && !ONLY.includes(sc.name)) continue; let g = groups.find((q) => q.save === sc.save); if (!g) groups.push(g = { save: sc.save, scenes: [] }); g.scenes.push(sc); }

for (const g of groups) {
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: VW, height: VH }, dpr: DPR, locale: LANG === 'en' ? 'en-US' : 'ko-KR' });
  await page.evaluate(([sv, lang]) => { try { localStorage.clear(); localStorage.setItem('frostVillage.save.v1', sv); localStorage.setItem('frostVillage.settings.v1', JSON.stringify({ sound: false, music: false, lang, daynight: true, gfx: 'high' })); } catch (e) { /* */ } }, [FIX(g.save), LANG]);
  await page.reload({ waitUntil: 'load', timeout: 300000 });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 300000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 300000);
  await sleep(1500);
  await page.evaluate((BUSYsrc) => {
    const game = window.__FV.game; game.loop.sleep();
    let T = game.loop.time || performance.now(); let D = Date.now(); Date.now = () => D; const DT = 1000 / 60;
    window.__run = (sec) => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { T += DT; D += DT; game.headlessStep(T, DT); } };
    window.__draw = () => { T += DT; D += DT; game.step(T, DT); };
    window.__busy = eval('(' + BUSYsrc + ')');
    window.__day = (h = 10) => { const nb = window.__FV.scene.v4; if (nb && nb.clock) { if (!nb.clock.on && nb.clock.start) nb.clock.start(); nb.clock.set(h); } };
    // the restaurant scene: wait (≤ 40 s more) until ≥ 9 seats are taken and ≥ 3 guests eat
    window.__full = (c) => {
      const R = window.__FV.scene.civic.restaurant;
      for (let i = 0; i < 40; i++) { window.__run(1); const g = R.guests, eat = g.filter((q) => q.state === 'eat').length, sit = eat + g.filter((q) => q.state === 'seated').length; if (eat >= 3 && sit >= 9) break; }
      return { x: R.x + c.x, y: R.y + c.y, z: c.z };
    };
  }, BUSY.toString());
  const run = async (sec) => { for (let s = 0; s < sec; s += 5) await page.evaluate((d) => window.__run(d), Math.min(5, sec - s)); };
  const warm = async (sec) => { if (!(sec > 0)) return; await page.evaluate(() => window.__FV.game.loop.wake()); await sleep(sec * 1000); await page.evaluate(() => window.__FV.game.loop.sleep()); };
  await warm(4);
  for (const sc of g.scenes) {
    try {
      // the "새로워진 것" card and any open panel stay out of the store pictures
      await page.evaluate(() => {
        const F = window.__FV, ui = F.game.scene.getScene('UI'), v = F.v42 && F.v42.v;
        if (v && !v.seen.whatsNew) { v.seen.whatsNew = 1; if (ui.hud42 && ui.hud42.card && ui.hud42.closeCard) ui.hud42.closeCard(); }
        const O = F.scene.v42 && F.scene.v42.office;
        try { if (O && O.uiScene && O.uiScene().officePanel && O.uiScene().officePanel.c) O.uiScene().officePanel.close(); } catch (e) { /* */ }
        try { if (ui.hud42 && ui.hud42.closeTrainCard) ui.hud42.closeTrainCard(); } catch (e) { /* */ }
        try { if (ui.panelOpen && ui.closeSettings) ui.closeSettings(true); } catch (e) { /* */ }
      });
      let cam = await page.evaluate(sc.setup);
      await run(sc.secs || 0);
      await warm(sc.warm || 0);
      if (sc.until) {
        await page.evaluate(() => window.__FV.game.loop.wake());
        const t0 = Date.now();
        while (Date.now() - t0 < 30000) { if (await page.evaluate(sc.until)) break; await sleep(400); }
        await page.evaluate(() => window.__FV.game.loop.sleep());
      }
      if (sc.then) { cam = await page.evaluate(sc.then); await run(sc.secs2 || 0); }
      // a tidy coin count in the HUD (the late save's own number moves with what each staged scene spends)
      if (sc.coins) await page.evaluate((n) => { const e = window.__FV.scene.economy; window.__FV.give(n - e.coins); }, sc.coins);
      if (cam) await page.evaluate((c) => window.__FV.camera(c.x, c.y, c.z), cam);
      // the ground under the final view at full detail (chunks that just came into view are baked over a few
      // frames otherwise and show as lighter rectangles)
      await page.evaluate(() => { for (let i = 0; i < 6; i++) window.__draw(); const gs = window.__FV.scene, c = gs.cameras.main, z = Math.max(0.05, c.zoom || 1), w = c.width / z, h = c.height / z, x = c.midPoint.x, y = c.midPoint.y; try { if (gs.ground && gs.ground.ensure) gs.ground.ensure({ x: x - w / 2 - 200, y: y - h / 2 - 200, right: x + w / 2 + 200, bottom: y + h / 2 + 200 }, Infinity, 400); } catch (e) { /* */ } for (let i = 0; i < 60; i++) window.__draw(); });
      await page.evaluate((keep) => {
        const ui = window.__FV.game.scene.getScene('UI');
        if (!keep && ui && ui.bannerBox && ui.bannerBox.visible) { ui.tweens.killTweensOf(ui.bannerBox); ui.bannerBox.setVisible(false); }
        if (ui && ui.toastBox && ui.toastBox.visible) { ui.tweens.killTweensOf(ui.toastBox); ui.toastBox.setVisible(false); }
      }, !!sc.keepBanner);
      await page.evaluate(() => { for (let i = 0; i < 20; i++) window.__draw(); });
      if (process.env.STORE_DIAG) console.log('DIAG', sc.name, JSON.stringify(await page.evaluate(() => {
        const out = []; const ui = window.__FV.game.scene.getScene('UI');
        const walk = (list, path) => { for (const o of list) { if (!o.visible) continue; let b = null; try { b = o.getBounds(); } catch (e) { /* */ } if (b && b.top < 20 && b.bottom > 0 && b.width < 700) out.push([path + '/' + (o.name || o.type), Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height), o.text || (o.list ? o.list.map((q) => q.text).filter(Boolean).join('|') : '')]); if (o.list && o.type === 'Container') walk(o.list, path + '/' + (o.name || 'C')); } };
        walk(ui.children.list, 'UI'); return out.slice(0, 15);
      })));
      const file = `${sc.name}_${LANG}.png`;
      await page.screenshot({ path: path.join(OUT, file), type: 'png', timeout: 180000 });
      made.push(file);
      console.log('shot', file);
      if (sc.after) await page.evaluate(sc.after);
      await run(0.3);
    } catch (e) { errors.push(sc.name + ': ' + String(e.message || e).split('\n')[0]); console.log('ERR', sc.name, String(e.message || e).split('\n')[0]); }
  }
  for (const e of log.errors) errors.push(g.save + ' page: ' + e);
  await page.close();
}
console.log(made.length + ' screenshots -> ' + OUT);
if (errors.length) { console.log('errors:'); for (const e of errors.slice(0, 20)) console.log('  ' + e); }
await browser.close();
await srv.close();
process.exit(errors.length ? 1 : 0);
