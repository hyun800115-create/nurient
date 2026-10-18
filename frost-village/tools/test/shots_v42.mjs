// (v4.2, docs/v42_plan.md §15) the designer's screenshots of every v4.2 feature -> docs/previews/screens_v42/
//   node tools/test/shots_v42.mjs [--only name,name] [--sizes 390x844,360x640] [--langs ko,en]
// From the v4.1 46-min save: the "새로워진 것" card, the halo, 길 안내, the 놀이 settings tab, the balloon loop with the
// train on its curve, the consist at both platforms (the 읍 coach too), freight loading, the 촌장 사무실 and its
// panel tabs, 서리 은행 (cutaway + vault), 서리 물류창고 (cutaway + racks) and the cargo sleigh, 관망 with its caption,
// the train card. Phone 390×844 gets every scene in Korean; 360×640 and English a subset. CODE-1 shows placeholder
// art where CODE_V42's art is not in yet (same keys).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const OUT = path.join(ROOT, 'docs', 'previews', 'screens_v42');
fs.mkdirSync(OUT, { recursive: true });
const SAVE = fs.readFileSync(path.join(HERE, 'fixtures', 'v41_save_smart_46min.json'), 'utf8');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ONLY = opt('--only', '') ? opt('--only', '').split(',') : null;
const SIZES = opt('--sizes', '390x844,360x640').split(',');
const LANGS = opt('--langs', 'ko,en').split(',');

// scenes: setup (in the page, may return a camera {x, y, z}), secs of game time, warm (real s with the loop awake)
const SCENES = [
  { name: '01_whats_new', keepCard: true, secs: 4, setup: () => null, sub: true },
  { name: '02_halo_plaza', secs: 2, setup: () => { const gs = window.__FV.scene, m = gs.market; window.__FV.teleport(m.x + 160, m.y + 230); return { x: m.x + 160, y: m.y + 200, z: 1.1 }; }, sub: true },
  { name: '02b_halo_night_z06', secs: 3, setup: () => {
    // 21:00 at the station square, zoom 0.6, the train in and its riders about: the chief in a crowd at night
    const gs = window.__FV.scene, nb = gs.v4;
    // (the 46-min save is before the day clock starts: start it for this shot, `after` puts it back to 10:00)
    if (nb && nb.clock) { if (!nb.clock.on && nb.clock.start) nb.clock.start(); nb.clock.set(21); }
    if (nb && nb.rail) nb.rail.set('atOurs', 2);
    const q = nb && nb.ours ? nb.ours : gs.market;
    window.__FV.teleport(q.x - 60, q.y + 200);
    return { x: q.x - 60, y: q.y + 140, z: 0.6 };
  }, after: () => { const nb = window.__FV.scene.v4; if (nb && nb.clock && nb.clock.on) nb.clock.set(10); }, sub: true },
  { name: '03_nav_carrying', secs: 2, setup: () => { const gs = window.__FV.scene, tr = gs.trade, p = gs.player; window.__FV.clearStack(); window.__FV.teleport(tr.x - 520, tr.y + 330); for (let i = 0; i < 6; i++) p.stack.push('item_plank', null, gs.effects); return { x: tr.x - 260, y: tr.y + 170, z: 0.8 }; } },
  { name: '04_settings_play', secs: 0.5, setup: () => { const ui = window.__FV.game.scene.getScene('UI'); window.__FV.clearStack(); ui.openSettings(true); ui.settingsTab = 'play'; ui.buildPanelContent(false); return null; }, after: () => { const ui = window.__FV.game.scene.getScene('UI'); if (ui.closePanel) ui.closePanel(true); else if (ui.closeSettings) ui.closeSettings(true); }, sub: true, en: true },
  { name: '05_loop_curve', secs: 0.2, warm: 4, setup: () => {
    // just after the dwell at ours: the train pulls forward round our loop by the sea (toTown), mid-curve at the far end
    const r = window.__FV.scene.v4.rail, T = r.legOf('toTown').T;
    let best = 0, bd = Infinity;
    for (let t = 0; t < T; t += 0.25) { r.set('toTown', t); const q = r.point(r.m - r.length / 2); const d = Math.hypot(q.x - 2736, q.y - 1011); if (d < bd) { bd = d; best = t; } }
    r.set('toTown', best);
    window.__loopT = best;
    return null;
  }, secs2: 0.1, then: () => { const r = window.__FV.scene.v4.rail; r.set('toTown', window.__loopT); return { x: 2880, y: 1090, z: 0.8 }; } },
  { name: '05b_loop_town', secs: 0.2, warm: 4, setup: () => {
    // the town end: after the dwell at 솔방울역 the train pulls round the town loop (toOurs), mid-curve at its far end
    const r = window.__FV.scene.v4.rail, T = r.legOf('toOurs').T;
    let best = 0, bd = Infinity;
    for (let t = 0; t < T; t += 0.25) { r.set('toOurs', t); const q = r.point(r.m - r.length / 2); const d = Math.hypot(q.x - 6032, q.y - 2659); if (d < bd) { bd = d; best = t; } }
    r.set('toOurs', best);
    window.__loopT2 = best;
    return null;
  }, secs2: 0.1, then: () => {
    // (CODE-2) the camera as a player sees it: bounded at WORLD.width (6144), so the loop tip meets the screen edge
    const gs = window.__FV.scene, r = gs.v4.rail; r.set('toOurs', window.__loopT2);
    const z = 0.8, half = gs.cameras.main.width / 2 / z;
    return { x: Math.min(5880, 6144 - half), y: 2600, z };
  } },
  { name: '06_consist_ours', secs: 2, warm: 3, setup: () => { const nb = window.__FV.scene.v4; nb.rail.set('atOurs', 1); const F = window.__FV.scene.v42.freight; if (F) F.labels = 0; if (nb.train.showLabels) nb.train.showLabels(8, 20); return { x: nb.ours.x - 40, y: nb.ours.y + 30, z: 1.0 }; }, sub: true },
  { name: '07_freight_loading', secs: 5, setup: () => { const gs = window.__FV.scene, nb = gs.v4, G = nb.growth, F = gs.v42.freight; G.cargo = 6; F.addSurplus('item_plank', 24); F.addSurplus('item_ingot', 12); nb.rail.set('atOurs', 0.5); return { x: G.dock.x + 40, y: G.dock.y - 20, z: 1.1 }; } },
  { name: '08_consist_town_coach2', secs: 2, warm: 4, setup: () => { const nb = window.__FV.scene.v4; if (nb.rail.stage < 2) nb.addCoach(); nb.rail.set('atTown', 1); const ts = nb.townStation || null; const p = nb.rail.point(nb.rail.m - 6); return ts ? { x: ts.x, y: ts.y, z: 0.9 } : { x: p.x, y: p.y, z: 0.9 }; } },
  // ((v4.2 verify) on a loaded machine the first pass after a boot opened the card before the train2 cars and the ui5
  //  icons were in: no train at the platform, the cars as colour chips. The card opens once both are here)
  { name: '09_train_card', secs: 0.5, until: () => { const F = window.__FV, ui = F.game.scene.getScene('UI'), nb = F.scene.v4; return !!(nb.train && nb.train.ready && ui.hud42 && ui.hud42.artOn); }, untilS: 40, setup: () => { const F = window.__FV, nb = F.scene.v4; nb.rail.set('atOurs', 2); F.camera(nb.ours.x - 40, nb.ours.y - 60, 0.9); return null; }, then: () => { const ui = window.__FV.game.scene.getScene('UI'), nb = window.__FV.scene.v4; nb.rail.set('atOurs', 2); if (ui.hud42 && ui.hud42.openTrainCard) ui.hud42.openTrainCard(); return { x: nb.ours.x - 40, y: nb.ours.y - 60, z: 0.9 }; }, secs2: 0.3, after: () => { const ui = window.__FV.game.scene.getScene('UI'); if (ui.hud42 && ui.hud42.closeTrainCard) ui.hud42.closeTrainCard(); }, en: true },
  { name: '10_office', secs: 3, warm: 3, setup: () => { const F = window.__FV; F.v42.office({ build: true, hire: ['sem', 'ttal', 'bok', 'chong'] }); const O = F.scene.v42.office, d = O.building.spots.door; F.teleport(d.x + 60, d.y + 120); return { x: O.x, y: O.y + 40, z: 0.95 }; }, sub: true },
  // (CODE-2) the cutaway revealed with the officefolk staff at work, and the chief at his own desk (chief2 sit_write)
  { name: '10b_office_inside', secs: 8, warm: 6, until: () => { const O = window.__FV.scene.v42.office; return Object.values(O.staff).every((c) => !c.seat || (c.animName === c.want && /^(desk_|sit_)/.test(c.animName))); }, setup: () => { const F = window.__FV; F.v42.office({ build: true, hire: ['sem', 'ttal', 'bok', 'chong'] }); const O = F.scene.v42.office, e = O.building.spots.entry || O.building.spots.door; F.teleport(e.x, e.y); return null; }, then: () => { const O = window.__FV.scene.v42.office; return { x: O.x, y: O.y - 20, z: 1.2 }; }, secs2: 2, sub: true },
  { name: '10c_chief_desk', secs: 1, warm: 4, until: () => { const gs = window.__FV.scene, p = gs.player, O = gs.v42.office; if (!p.seat && O.building.cw) { const d = O.building.spots.deskPad; gs.v42.pilot.pose({ act: 'office', target: { x: d.x, y: d.y, kind: 'desk' } }); } const k = p.sprite.anims.currentAnim ? p.sprite.anims.currentAnim.key : ''; return !!p.seat && /sit_|doze/.test(k) && Object.values(O.staff).every((c) => !c.seat || (c.animName === c.want && /^(desk_|sit_)/.test(c.animName))); }, setup: () => { const F = window.__FV, gs = F.scene; F.clearStack(); F.v42.office({ build: true, hire: ['sem', 'ttal', 'bok', 'chong'] }); const O = gs.v42.office, d = O.building.spots.deskPad; F.teleport(d.x, d.y); gs.v42.pilot.pose({ act: 'office', target: { x: d.x, y: d.y, kind: 'desk' } }); return null; }, then: () => { const s = window.__FV.scene.v42.office.building.spots.chiefSeat; return { x: s.x, y: s.y - 60, z: 1.6 }; }, secs2: 3, after: () => { const p = window.__FV.scene.player; if (p.standUp) p.standUp(); } },
  { name: '11_panel_stock', secs: 0.5, until: () => { const P = window.__FV.scene.v42.office.uiScene().officePanel; return !!(P && P.c && P.panelArt); }, setup: () => { window.__FV.v42.office({ panel: 'stock' }); return null; }, sub: true },
  { name: '12_panel_news', secs: 0.5, until: () => { const P = window.__FV.scene.v42.office.uiScene().officePanel; return !!(P && P.c && P.panelArt); }, setup: () => { const F = window.__FV; F.v42.office({ build: true, hire: ['sem', 'ttal', 'bok', 'chong'] }); F.v42.news({ print: 1 }); F.scene.v42.office.uiScene().officePanel.show('news'); return null; }, en: true },
  { name: '13_panel_letters', secs: 0.5, until: () => { const P = window.__FV.scene.v42.office.uiScene().officePanel; return !!(P && P.c && P.panelArt); }, setup: () => { const F = window.__FV; F.v42.news({ letter: 'grandma' }); F.v42.news({ letter: 'miner' }); F.scene.v42.office.uiScene().officePanel.show('letters'); return null; } },
  { name: '14_panel_staff', secs: 0.5, until: () => { const P = window.__FV.scene.v42.office.uiScene().officePanel; return !!(P && P.c && P.panelArt); }, setup: () => { window.__FV.scene.v42.office.uiScene().officePanel.show('staff'); return null; } },
  { name: '15_panel_bank', secs: 0.5, warm: 4, setup: () => { const F = window.__FV; F.v42.office({ build: 'all' }); return null; }, then: () => { const O = window.__FV.scene.v42.office; O.deposit(1240, null); O.deposit(860, null); O.uiScene().officePanel.show('bank'); return null; }, secs2: 0.5, after: () => { window.__FV.scene.v42.office.uiScene().officePanel.close(); } },
  { name: '16_bank_vault', secs: 1, warm: 5, setup: () => { const F = window.__FV; F.v42.office({ build: 'all' }); return null; }, then: () => { const F = window.__FV, O = F.scene.v42.office, B = O.bank; if (!B || !B.ready) return { x: -340, y: 570, z: 1 }; F.teleport(B.door.x + 30, B.door.y + 60); B.deposit(6000); return { x: B.x, y: B.y - 20, z: 1.15 }; }, secs2: 1.2 },
  { name: '17_depot_revealed', secs: 1, warm: 5, setup: () => { const F = window.__FV; F.v42.depot({ build: true }); F.v42.depot({ stock: { item_plank: 60, item_ingot: 40, item_fish_cooked: 70, item_bread: 50, item_axe: 12, item_log: 40 } }); return null; }, then: () => { const D = window.__FV.scene.v42.depot.building; window.__FV.teleport(D.door.x + 120, D.door.y - 40); return { x: D.x - 40, y: D.y - 10, z: 0.85 }; }, secs2: 2 },
  { name: '18_cargo_sleigh', secs: 26, warm: 4, setup: () => { const gs = window.__FV.scene, D = gs.v42.depot; gs.v42.freight.addSurplus('item_plank', 80); gs.v42.freight.addSurplus('item_bread', 40); window.__FV.teleport(gs.market.x, gs.market.y + 200); const s = D.sleighs[0]; s.state = 'wait'; s.t = 10; return null; }, then: () => { const s = window.__FV.scene.v42.depot.sleighs[0]; return { x: s.x || 3400, y: (s.y || 2400) - 20, z: 1.1 }; }, secs2: 0.3 },
  // ((v4.2 CODE-2 review fixes) the chief behind the box car at 서리역 (silhouette + star pin); the chief at night, close
  //  (his light lies at his feet: no white wash over him)
  // ((v4.2 verify) the cars are laid out only near the camera: reading the box car's sprite right after rail.set()
  //  gave its last drawn place (the town loop, from the scenes before) — the chief went there and the shot had no
  //  train. The camera goes to 서리역 first, the train art is waited for, then the box car is read)
  { name: '20_chief_behind_train', secs: 1, warm: 2, until: () => { const nb = window.__FV.scene.v4; return !!(nb.train && nb.train.ready); }, untilS: 40, setup: () => {
    const F = window.__FV, gs = F.scene, nb = gs.v4; F.clearStack(); nb.rail.set('atOurs', 3);
    F.camera(nb.ours.x, nb.ours.y - 40, 1.0);
    return null;
  }, then: () => {
    const F = window.__FV, nb = F.scene.v4; nb.rail.set('atOurs', 3); window.__run(0.2);
    const c = nb.train.cars.find((q) => q.key === 'train_boxcar') || nb.train.cars[1];
    F.teleport(c.spr.x, c.spr.y - 14);
    return { x: c.spr.x, y: c.spr.y - 70, z: 1.0 };
  }, secs2: 1, sub: true },
  { name: '21_night_chief_close', secs: 8, warm: 2, setup: () => {
    const gs = window.__FV.scene, nb = gs.v4, m = gs.market; window.__FV.clearStack();
    if (nb && nb.clock) { if (!nb.clock.on && nb.clock.start) nb.clock.start(); nb.clock.set(22); }
    window.__FV.teleport(m.x + 160, m.y + 230);
    return { x: m.x + 160, y: m.y + 190, z: 1.4 };
  }, after: () => { const nb = window.__FV.scene.v4; if (nb && nb.clock && nb.clock.on) nb.clock.set(10); } },
  { name: '19_observe', secs: 12, setup: () => { const F = window.__FV; F.v42.pilot(true); return null; }, then: () => { const p = window.__FV.scene.player; return { x: p.x, y: p.y, z: 0.9 }; }, after: () => { window.__FV.v42.pilot(false); }, sub: true, en: true },
];

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const made = [];
const tex = [];
const errors = [];
for (const size of SIZES) for (const lang of LANGS) {
  const [W, H] = size.split('x').map(Number);
  const full = size === SIZES[0] && lang === LANGS[0];
  const scenes = SCENES.filter((s) => (!ONLY || ONLY.includes(s.name)) && (full || (lang === 'en' ? s.en : s.sub)));
  if (!scenes.length) continue;
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: W, height: H }, dpr: 1, locale: lang === 'en' ? 'en-US' : 'ko-KR' });
  await page.evaluate((sv) => { try { localStorage.clear(); localStorage.setItem('frostVillage.save.v1', sv); } catch (e) { /* */ } }, SAVE);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 120000);
  await sleep(1500);
  await page.evaluate(() => {
    const game = window.__FV.game; game.loop.sleep();
    let T = game.loop.time || performance.now(); const DT = 1000 / 60;
    window.__run = (sec) => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { T += DT; game.headlessStep(T, DT); } };
    window.__draw = () => { T += DT; game.step(T, DT); };
    window.__T = () => T;
  });
  const run = async (sec) => { for (let s = 0; s < sec; s += 5) await page.evaluate((d) => window.__run(d), Math.min(5, sec - s)); };
  const warm = async (sec) => { if (!(sec > 0)) return; await page.evaluate(() => window.__FV.game.loop.wake()); await sleep(sec * 1000); await page.evaluate(() => window.__FV.game.loop.sleep()); };
  await warm(4);
  for (const sc of scenes) {
    try {
      if (!sc.keepCard) await page.evaluate(() => { const v = window.__FV.v42 && window.__FV.v42.v; if (v && !v.seen.whatsNew) { v.seen.whatsNew = 1; const ui = window.__FV.game.scene.getScene('UI'); if (ui.hud42 && ui.hud42.card && ui.hud42.closeCard) ui.hud42.closeCard(); } });
      // (a panel a scene opened — or the chief standing on the bank's 창구 pad — must not leak into the next shot)
      await page.evaluate(() => {
        const F = window.__FV, ui = F.game.scene.getScene('UI'), O = F.scene.v42 && F.scene.v42.office;
        try { if (O && O.uiScene && O.uiScene().officePanel && O.uiScene().officePanel.c) O.uiScene().officePanel.close(); } catch (e) { /* */ }
        try { if (ui.hud42 && ui.hud42.closeTrainCard) ui.hud42.closeTrainCard(); } catch (e) { /* */ }
        try { if (ui.panelOpen && ui.closeSettings) ui.closeSettings(true); } catch (e) { /* */ }
      });
      if (process.env.SHOTS_DIAG) page.__diag = async (tag) => console.log('DIAG', sc.name, tag, JSON.stringify(await page.evaluate(() => { const out = []; const tm = window.__FV.game.textures; const walk = (list, sn) => { for (const o of list) { if (o.list && (o.type === 'Container' || o.type === 'Layer')) walk(o.list, sn); const f = o.frame; if (f && f.source && (!f.source.glTexture || !tm.exists(f.texture.key))) out.push([sn, o.type, f.texture.key, f.name, o.visible]); } }; for (const s of window.__FV.game.scene.scenes) if (s.children) walk(s.children.list, s.sys.settings.key); return out.slice(0, 20); })));
      let cam = await page.evaluate(sc.setup);
      await run(sc.secs || 0);
      await warm(sc.warm || 0);
      // (a scene that waits for on-demand art — the staff's desk pages, the chief's chief2 anims — keeps the loop awake
      //  until its `until` holds, at most untilS real seconds)
      if (sc.until) {
        await page.evaluate(() => window.__FV.game.loop.wake());
        const t0 = Date.now();
        while (Date.now() - t0 < (sc.untilS || 25) * 1000) { if (await page.evaluate(sc.until)) break; await sleep(400); }
        await page.evaluate(() => window.__FV.game.loop.sleep());
      }
      if (sc.then) { cam = await page.evaluate(sc.then); await run(sc.secs2 || 0); }
      if (cam) await page.evaluate((c) => window.__FV.camera(c.x, c.y, c.z), cam);
      // (an offer banner that popped up during the scene is not what the shot is about)
      if (!sc.keepBanner) await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); if (ui && ui.bannerBox && ui.bannerBox.visible) { ui.tweens.killTweensOf(ui.bannerBox); ui.bannerBox.setVisible(false); } });
      if (page.__diag) await page.__diag('before-draw');
      await page.evaluate(() => { for (let i = 0; i < 20; i++) window.__draw(); });
      const file = `${sc.name}_${W}x${H}_${lang}.jpg`;
      await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 82, timeout: 120000 });
      made.push(file);
      // the texture source-sum in this view (Residency, the v4 probe) and the display objects
      const tx = await page.evaluate(() => { const s = window.__FV.texStats(); return { mib: s.totalMiB, peak: s.peakMiB, objs: window.__FV.scene.children.length }; });
      tex.push([file, tx.mib, tx.peak, tx.objs]);
      if (sc.after) await page.evaluate(sc.after);
      await run(0.3);
    } catch (e) { errors.push(sc.name + ' ' + size + ' ' + lang + ': ' + String(e.message || e).split('\n')[0]); }
  }
  for (const e of log.errors) errors.push(size + ' ' + lang + ' page: ' + e);
  await page.close();
}
console.log(made.length + ' screenshots -> ' + path.relative(process.cwd(), OUT));
for (const [f, mib, peak, objs] of tex) console.log('  ' + f.padEnd(44) + ' tex ' + String(mib).padStart(6) + ' MiB (peak ' + peak + ')  objects ' + objs);
fs.writeFileSync(path.join(OUT, 'textures.json'), JSON.stringify(tex.map(([f, mib, peak, objs]) => ({ f, mib, peak, objs })), null, 1));
if (errors.length) { console.log('errors:'); for (const e of errors.slice(0, 20)) console.log('  ' + e); }
await browser.close();
await srv.close();
process.exit(errors.length ? 1 : 0);
