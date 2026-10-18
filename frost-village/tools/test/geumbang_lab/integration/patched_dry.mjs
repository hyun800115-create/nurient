// The 금방 Integration patches, proven: the game served from the SCRATCH copy that apply_patches.mjs made (every patch
// applied), the v4.1 46-min save, the depot built (the v4.2 test hook), then nothing added by hand — G-P1 makes the
// system. Checks each patch's effect, saves, reloads and checks the slice came back (G-P5).
//   node tools/test/geumbang_lab/integration/apply_patches.mjs . <scratchRoot>
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers nice -n 15 node tools/test/geumbang_lab/integration/patched_dry.mjs . <scratchRoot> docs/previews
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [REPO, ROOT, OUT] = process.argv.slice(2).map((p) => path.resolve(p));
const { start } = await import(pathToFileURL(path.join(REPO, 'tools/test/serve.mjs')).href);
const { launch, openPage, tapStart, sleep, waitFor } = await import(pathToFileURL(path.join(REPO, 'tools/test/pw.mjs')).href);
const SAVE = fs.readFileSync(path.join(REPO, 'tools/test/fixtures/v41_save_smart_46min.json'), 'utf8');
fs.mkdirSync(OUT, { recursive: true });

const srv = await start(0, { root: ROOT });
const browser = await launch();
const res = { checks: {}, errors: [], shots: [] };
const ok = (k, v, info) => { res.checks[k] = info === undefined ? !!v : { ok: !!v, info }; console.log((v ? '  ok   ' : '  FAIL ') + k + (info !== undefined ? '  ' + JSON.stringify(info) : '')); };
try {
  const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: 2 });
  const boot = async (fresh) => {
    if (fresh) await page.evaluate((sv) => { localStorage.clear(); localStorage.setItem('frostVillage.save.v1', sv); }, SAVE);
    await page.reload({ waitUntil: 'load' });
    await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
    await sleep(300);
    await tapStart(page);
    await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 180000);
    await sleep(1500);
    await page.evaluate(() => {
      const game = window.__FV.game; game.loop.sleep();
      let T = game.loop.time || performance.now(); const DT = 1000 / 60;
      window.__run = (sec) => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { T += DT; game.headlessStep(T, DT); } };
      window.__draw = () => { T += DT; game.step(T, DT); };
    });
  };
  const run = async (sec) => { for (let s = 0; s < sec; s += 5) await page.evaluate((d) => window.__run(d), Math.min(5, sec - s)); };
  const warm = async (sec) => { await page.evaluate(() => window.__FV.game.loop.wake()); await sleep(sec * 1000); await page.evaluate(() => window.__FV.game.loop.sleep()); };
  const until = async (fn, maxS, chunk = 1) => { for (let t = 0; t < maxS; t += chunk) { if (await page.evaluate(fn)) return true; await run(chunk); } return false; };
  const texts = () => page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'), out = []; const walk = (l) => { for (const o of l) { if (o.type === 'Text' && o.visible) out.push(o.text); if (o.list) walk(o.list); } }; walk(ui.children.list); return out; });
  const shot = async (name, cam) => {
    if (cam) await page.evaluate((c) => window.__FV.camera(c.x, c.y, c.z), cam);
    await page.evaluate(() => { for (let i = 0; i < 12; i++) window.__draw(); });
    const file = 'geumbang_lab_patched_' + name + '.jpg';
    await page.screenshot({ path: path.join(OUT, file), type: 'jpeg', quality: 84, timeout: 120000 });
    res.shots.push(path.join(OUT, file));
  };

  await boot(true);
  await warm(3);
  await page.evaluate(() => {
    const F = window.__FV, gs = F.scene, v = gs.v42;
    if (v && !v.seen.whatsNew) { v.seen.whatsNew = 1; const ui = F.game.scene.getScene('UI'); if (ui.hud42 && ui.hud42.closeCard) ui.hud42.closeCard(); }
    F.v42.depot({ build: true });
    F.v42.depot({ stock: { item_plank: 60, item_ingot: 40, item_fish_cooked: 40, item_bread: 50, item_axe: 8, item_log: 40, item_can: 20, item_meat_cooked: 20, item_fish_raw: 20, item_wheat: 16 } });
    const nb = gs.v4; if (nb && nb.clock) { if (!nb.clock.on && nb.clock.start) nb.clock.start(); nb.clock.set(10); }
    gs.economy.add(12000);
  });
  await warm(6);
  await until(() => { const d = window.__FV.scene.v42.depot; return !!(d && d.building && d.building.ready); }, 30);
  // G-P1: the system is there without a hand-made add
  ok('G-P1 gs.v42.gb is a system', await page.evaluate(() => { const v = window.__FV.scene.v42; return !!(v.gb && v.systems.some((q) => q.name === 'gb')) && v.systems.map((q) => q.name).join(','); }));
  ok('G-P1 hooks: __FV.v42.gb()', await page.evaluate(() => typeof window.__FV.v42.gb === 'function'));
  await run(1);
  ok('G-P1 host started at the gate', await page.evaluate(() => !!window.__FV.scene.v42.gb.host));
  await page.evaluate(() => { window.__FV.scene.v42.gb.host.model.gateT = 1e9; });
  await run(1);
  await warm(8);
  // G-P11: the letter in the inbox
  const inbox = await page.evaluate(() => { const N = window.__FV.scene.v42.news; return N ? N.inbox.map((r) => r.tpl) : null; });
  ok('G-P11 letter geumbang delivered', inbox && inbox.includes('geumbang'), inbox);
  const btn = await page.evaluate(() => { const N = window.__FV.scene.v42.news; const L = N.letters().find((l) => l.tpl === 'geumbang'); return L ? { from: L.from, b: L.buttons.map((x) => x.k + ':' + x.act) } : null; });
  ok('G-P11 letter text + buttons', btn && /정 할머니/.test(btn.from) && btn.b[0] === 'lt_geumbang_b1:gb:open', btn);
  // G-P6 / G-P7 / G-P9 / G-P13 settings / G-P12 listener / G-P2b port
  const st = await page.evaluate(async () => {
    const { TF } = await import(new URL('src/core/Townfolk.js', location.href).href);
    const { Assets } = await import(new URL('src/core/Assets.js', location.href).href);
    const { Settings } = await import(new URL('src/core/Save.js', location.href).href);
    const gs = window.__FV.scene;
    return { tfGb: !!TF.gb, ofAtlas: TF.ofAtlas || null, sled: !!Assets.texOf('veh_dog_sled'), painted: !!(gs.v4 && gs.v4.paint && gs.v4.paint.gbPainted), ownHook: !!gs.v42.gb.paintHook,
      gbAlerts: Settings.data.gbAlerts, gbScenes: Settings.data.gbScenes, gbListeners: gs.events.listenerCount('gb'), spurPort: typeof gs.v42.depot.gbSpurBusy };
  });
  ok('G-P7 TF.gb (crew anims merged)', st.tfGb, st.ofAtlas);
  ok('G-P6 veh_dog_sled loaded', st.sled);
  ok('G-P9 RoadPaint paints the apron + jog (module hook off)', st.painted && !st.ownHook, { painted: st.painted, ownHook: st.ownHook });
  ok('G-P13 Settings gbAlerts / gbScenes', st.gbAlerts === 'on' && st.gbScenes === true, { a: st.gbAlerts, s: st.gbScenes });
  ok('G-P12 CameraDirector listens to gb', st.gbListeners >= 1, st.gbListeners);
  // the pad, the ceremony, the first order
  const pad = await page.evaluate(() => { const s = window.__FV.scene.v42.gb; return s.pad ? { x: s.pad.x, y: s.pad.y } : null; });
  ok('pad shown', !!pad, pad);
  // G-P11 letter button hops to the pad
  await page.evaluate(() => { const v = window.__FV.scene.v42; v.office.letterAction('gb:open'); });
  await run(0.5);
  const cam = await page.evaluate(() => { const gs = window.__FV.scene; return gs.camFocus ? { x: Math.round(gs.camFocus.x), y: Math.round(gs.camFocus.y) } : null; });
  ok('G-P11 gb:open hops the camera to the pad', cam && pad && Math.hypot(cam.x - pad.x, cam.y - pad.y) < 5, cam);
  await page.evaluate(() => { window.__FV.scene.camFocus = null; });
  await page.evaluate((p) => window.__FV.teleport(p.x, p.y), pad);
  await until(() => window.__FV.scene.v42.gb.host.model.st >= 1, 300, 2);   // (coins from the chief, 판자 · 주괴 by the porters)
  await until(() => { const m = window.__FV.scene.v42.gb.host.model; return m.st === 2 && m.orders.list.some((o) => o.first); }, 30, 0.5);
  await run(4);
  // G-P3: the v4.2 workers hidden while revealed; the racks show through setShown
  await page.evaluate(() => window.__FV.scene.v42.gb.host.api.reveal(true));
  await run(1.2);
  const g3 = await page.evaluate(() => { const b = window.__FV.scene.v42.depot.building; return { off: !!b.gbStaffOff, shown: !!b.shownFn, workersVisible: b.workers.filter((w) => w.sprite && w.sprite.visible).length, alpha: +b.alpha.toFixed(2) }; });
  ok('G-P3 depot workers hidden, racks from setShown', g3.off && g3.shown && g3.workersVisible === 0, g3);
  const D = await page.evaluate(() => { const b = window.__FV.scene.v42.depot.building; return { x: b.x, y: b.y }; });
  await shot('hub', { x: D.x - 20, y: D.y - 40, z: 0.85 });
  await page.evaluate(() => window.__FV.scene.v42.gb.host.api.reveal(false));
  // the first delivery
  const del = await until(() => window.__FV.scene.v42.gb.host.model.settle.today.delivered >= 1, 150, 1);
  ok('first order delivered', del);
  // G-P2b: a sleigh in 'go' holds at the module's hold point (depot.gbHoldS, M8) while a van holds the spur token
  const g2 = await page.evaluate(() => {
    const gs = window.__FV.scene, d = gs.v42.depot, m = gs.v42.gb.host.model;
    const sl = d.sleighs[0]; if (!sl) return { none: true };
    const keep = { st: sl.state, s: sl.s, load: sl.load.slice(), tok: m.disp.token }, va = d.gbVanAhead;
    const hold = d.gbHoldS();
    d.gbVanAhead = () => false;               // (only the spur rule here)
    sl.state = 'go'; sl.s = hold - 5; sl.load = sl.load.length ? sl.load : [{ ty: 'item_log', n: 1 }];
    m.disp.token = 'van_test';
    const busy0 = d.gbSpurBusy();
    window.__run(8);                           // 8 s at ≈ 1.77 cells/s would pass the hold point without the hold
    const held = +sl.s.toFixed(2);
    m.disp.token = null;
    window.__run(2);
    const after = +sl.s.toFixed(2);
    sl.state = keep.st; sl.s = keep.s; sl.load = keep.load; m.disp.token = keep.tok; d.gbVanAhead = va;
    return { hold: +hold.toFixed(2), busy0, held, after };
  });
  ok('G-P2b sleigh holds at gbHoldS while the spur is busy, then goes on', !g2.none && g2.busy0 && g2.held <= g2.hold + 0.01 && g2.held > g2.hold - 0.6 && g2.after > g2.hold + 0.5, g2);
  // G-P2c: it waits behind a 금방 van in its lane (gbVanAhead) and drives in its right-hand lane on 역앞 거리 / 중앙로
  const g2c = await page.evaluate(() => {
    const gs = window.__FV.scene, d = gs.v42.depot;
    const sl = d.sleighs[0]; if (!sl) return { none: true };
    const keep = { st: sl.state, s: sl.s, load: sl.load.slice() }, va = d.gbVanAhead;
    d.gbVanAhead = () => true;
    sl.state = 'go'; sl.s = 12; window.__run(2); const waitGo = +sl.s.toFixed(2);
    sl.state = 'back'; sl.s = 30; window.__run(2); const waitBack = +sl.s.toFixed(2);
    d.gbVanAhead = () => false;
    sl.state = 'go'; sl.s = 12; sl.gbOff = null; window.__run(1.5);
    const p1 = sl.at(sl.s), offGo = { i: +sl.gbOff.i.toFixed(2), j: +sl.gbOff.j.toFixed(2), at: [+p1.i.toFixed(1), +p1.j.toFixed(1)] };
    sl.state = 'back'; sl.s = 33; sl.gbOff = null; window.__run(1.5);
    const p2 = sl.at(sl.s), offBack = { i: +sl.gbOff.i.toFixed(2), j: +sl.gbOff.j.toFixed(2), at: [+p2.i.toFixed(1), +p2.j.toFixed(1)] };
    sl.state = keep.st; sl.s = keep.s; sl.load = keep.load; d.gbVanAhead = va;
    return { waitGo, waitBack, offGo, offBack };
  });
  ok('G-P2c sleigh waits behind a 금방 van (go and back)', !g2c.none && g2c.waitGo === 12 && g2c.waitBack === 30, g2c);
  // (역앞 거리 is a one-lane-each-way track in this save: off 0.5 — the eastbound lane is half a cell south of the route)
  ok('G-P2c sleigh keeps right (역앞 거리 going, 중앙로 back)', !g2c.none && g2c.offGo.j <= -0.45 && g2c.offBack.i > 1, { go: g2c.offGo, back: g2c.offBack });
  // G-P16: its own 통장 bar, the 물류창고 tab row, the paper's lines, the ad; the depot till is not counted twice
  const g16 = await page.evaluate(() => {
    const gs = window.__FV.scene, v = gs.v42, O = v.office, N = v.news, GB = gs.v43.gb;
    const inc = Object.assign({}, O.income);
    const row = GB.officeRow();
    // yesterday as the paper prints it: 금방's lines are in (the model's yesterday faked for the check)
    const m = v.gb.host.model, keepDays = m.settle.days.slice(), keepFills = v.gb.host.fills.slice();
    m.settle.days.unshift([5, 4, 200]); v.gb.host.fills = [0.5, 0.7];
    const lines = GB.news();
    let printed = null;
    if (N) { const keepList = N.list.slice(), keepToday = N.today, keepMark = N.mark, keepDay = N.day; N.print(N.day + 1); printed = N.papers().slice(-1)[0].lines; N.list = keepList; N.today = keepToday; N.mark = keepMark; N.day = keepDay; }
    m.settle.days = keepDays; v.gb.host.fills = keepFills;
    // the till rule: a 금방 payment into the 물류 금고, then the courier's take
    const till = v.depot.till, before = O.income.depot || 0, gb0 = O.income.gb || 0;
    window.__FV.scene.v42.gb.ports.coins.till(30);
    const q = O.tills().find((x) => x.name === 'depot');
    const taken = q ? O.takeTill(q, null) : -1;
    return { inc, row, lines, printed, gbAfter: (O.income.gb || 0) - gb0, depotAfter: (O.income.depot || 0) - before, taken, tillLeft: till ? till.value : null };
  });
  ok('G-P16 금방 income in its own 통장 bar', g16.inc.gb > 0, g16.inc);
  ok('G-P16 the 물류창고 tab row', /^금방 마켓 · 오늘 주문 \d+ · 배달 \d+ · 선반 −\d+$/.test(g16.row), g16.row);
  ok('G-P16 the paper prints 금방 lines', !!(g16.printed && g16.printed.some((x) => /금방, 어제 4집에 배달/.test(x)) && g16.printed.some((x) => /선반이 어제보다 29%/.test(x))), g16.printed);
  ok('G-P16 the till is not counted twice', g16.gbAfter === 30 && g16.depotAfter === 0 && g16.taken >= 30, { gb: g16.gbAfter, depot: g16.depotAfter, taken: g16.taken });
  // the office panel: 물류창고 tab shows the row, 통장 the 금방 bar, 소식 the ad on odd days
  await page.evaluate(() => { const v = window.__FV.scene.v42.depot.building; window.__FV.camera(v.x, v.y, 0.9); });
  await page.evaluate(() => { const v = window.__FV.scene.v42; v.office.openPanel('test', 'depot'); });
  // (the panel waits up to 1.2 s for its plates, then fades in: stepped frames until it is opaque)
  await page.evaluate(() => { for (let i = 0; i < 150; i++) { const P = window.__FV.game.scene.getScene('UI').officePanel; if (i >= 2 && P.c && P.c.alpha >= 0.99 && !P.waitArt) break; window.__draw(); } });
  const panelState = await page.evaluate(() => { const P = window.__FV.game.scene.getScene('UI').officePanel, V = window.__FV.scene.v42.gb.host.view; return { open: !!P.c, alpha: P.c ? +P.c.alpha.toFixed(2) : null, waitArt: P.waitArt, tab: P.tab, chip: !!(V && V.chip && V.chip.c.visible) }; });
  ok('the 금방 chip steps aside while the office panel is open', panelState.open && !panelState.chip, panelState);
  console.log('  office panel', JSON.stringify(panelState));
  const panelTexts = await texts();
  if (panelState.open && panelState.alpha >= 0.99 && panelTexts.some((x) => /금방 마켓/.test(x))) await shot('office_depot', null);
  ok('G-P16 the 물류창고 tab shows the 금방 row', panelTexts.some((x) => /^금방 마켓 · 오늘 주문/.test(x)), panelTexts.filter((x) => /금방|물류/.test(x)).slice(0, 6));
  const bankLock = await page.evaluate(() => { const P = window.__FV.game.scene.getScene('UI').officePanel; const why = P.locked('bank'); if (!why) P.show('bank'); return why; });
  await run(0.4);
  const bankTexts = await texts();
  if (!bankLock && bankTexts.includes('금방')) await shot('office_bank', null);
  ok('G-P16 the 통장 tab has a 금방 bar (n/a before the bank)', !!bankLock || bankTexts.includes('금방'), bankLock || bankTexts.filter((x) => /금방|물류창고|수출/.test(x)));
  await page.evaluate(() => { const P = window.__FV.game.scene.getScene('UI').officePanel; if (P && P.close) P.close(); });
  // G-P17: 관망 knows 금방 구경 (the context, the caption, the agenda)
  const g17 = await page.evaluate(async () => {
    const gs = window.__FV.scene, P = gs.v42.pilot;
    const A = await import(new URL('src/systems/pilot/agenda.js', location.href).href);
    const ctx = P && P.context ? P.context() : null;
    return { acts: A.ACTS.includes('gb'), ctxHas: !!ctx && 'gb' in ctx && 'gbToday' in ctx, score: A.score('gb', { gb: true, gbToday: false, bagCount: 0, work: false }) };
  });
  ok('G-P17 관망 activity 금방 구경 wired', g17.acts && g17.ctxHas && g17.score === 42, g17);
  // the sled at its stand (G-P6 art)
  const stand = await page.evaluate(() => { const s = window.__FV.scene.v42.gb.host.model.sled; return s ? { x: s.x, y: s.y } : null; });
  if (stand) await shot('sled', { x: stand.x, y: stand.y - 40, z: 1.0 });
  // 금방 집하 (critique C1): an idle dog sled loads at a full village pile (drawn with G-P6)
  const col = await until(() => { const m = window.__FV.scene.v42.gb.host.model; return (m.sleds || []).some((q) => q.st === 'cload'); }, 240, 1);
  const cs = await page.evaluate(() => { const m = window.__FV.scene.v42.gb.host.model, q = (m.sleds || []).find((x) => x.st === 'cload'); return q ? { x: Math.round(q.x), y: Math.round(q.y), pile: q.state().pile, load: q.state().cn } : null; });
  if (cs) { await run(1.5); await shot('sled_collect', { x: cs.x, y: cs.y - 40, z: 1.1 }); }
  ok('C1 금방 집하: a dog sled loads at a full pile', col && !!cs, cs);
  // G-P5 / G-P1b: save, reload, the slice is back
  const before = await page.evaluate(() => { const gs = window.__FV.scene; gs.save(true); const raw = JSON.parse(localStorage.getItem('frostVillage.save.v1')); return { has: !!raw.geumbang, st: raw.geumbang && raw.geumbang.st, tot: raw.geumbang && raw.geumbang.tot }; });
  ok('save has the geumbang slice', before.has && before.st === 2, before);
  await boot(false);
  const after = await page.evaluate(() => { const s = window.__FV.scene.v42.gb; return { saved: s.saved ? { st: s.saved.st, tot: s.saved.tot } : null }; });
  ok('G-P5 the slice survives the load (sanitizeSave keeps it)', after.saved && after.saved.st === 2, after);
  await warm(4);                                // (the town's late pages arrive: the gate needs gs.v4.town)
  await until(() => !!window.__FV.scene.v42.gb.host, 60, 1);
  await run(2);
  const back = await page.evaluate(() => { const s = window.__FV.scene.v42.gb; return s.host ? { st: s.host.model.st, delivered: s.host.model.settle.tot[1] } : { host: false, gate: s.gateOpen() }; });
  ok('reloaded 금방 is open (st 2), totals kept', back.st === 2 && back.delivered >= 1, back);
  const re = await page.evaluate(() => { const gs = window.__FV.scene; const raw = gs.v42.serialize(); return !!raw.geumbang; });
  ok('G-P1 serialize after reload carries the slice', re);
  // G-P13: the 놀이 tab shows the 금방 알림 row once 금방 is open; a tap cycles on -> quiet
  await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); ui.settingsTab = 'play'; ui.openSettings(true); });
  await run(0.5);
  await shot('settings', null);
  const t1 = await texts();
  ok('G-P13 settings row 금방 알림 (켬)', t1.includes('금방 알림') && t1.includes('켬'), t1.filter((x) => /금방|켬|조용히/.test(x)));
  await page.evaluate(async () => { const { Settings } = await import(new URL('src/core/Save.js', location.href).href); Settings.data.gbAlerts = 'quiet'; const ui = window.__FV.game.scene.getScene('UI'); ui.buildPanelContent(false); });
  await run(0.3);
  const t2 = await texts();
  ok('G-P13 quiet shows 조용히', t2.includes('조용히'), t2.filter((x) => /금방|켬|조용히/.test(x)));
  await page.evaluate(async () => { const { Settings } = await import(new URL('src/core/Save.js', location.href).href); Settings.data.gbAlerts = 'on'; const ui = window.__FV.game.scene.getScene('UI'); if (ui.closeSettings) ui.closeSettings(); });
  res.errors = log.errors.slice(0, 30);
  ok('no page errors', !log.errors.length, log.errors.slice(0, 5));
  await page.close();
} catch (e) {
  res.errors.push('runner: ' + String(e && e.stack ? e.stack : e).split('\n').slice(0, 4).join(' | '));
  console.log(res.errors[res.errors.length - 1]);
}
fs.writeFileSync(path.join(OUT, 'geumbang_lab_patched.json'), JSON.stringify(res, null, 1));
const fails = Object.entries(res.checks).filter(([, v]) => !(v === true || (v && v.ok)));
console.log(JSON.stringify({ checks: Object.keys(res.checks).length, fails: fails.map(([k]) => k), errors: res.errors.length }));
await browser.close();
await srv.close();
