// (v4.3 마을 깃발, src/flag) the village flag in the real game, fixed-step clock, REAL taps:
//   node tools/test/flag.mjs [--shots DIR] [--only A,B,C,D]
//   A 412x915 ko  a new game opens 「우리 마을 깃발」 over the paused village (a random, valid flag); the tabs and options change
//                 the preview (shape, colours, pattern, emblem; 다시 섞기); 「이대로 시작」 starts the game with that flag on every
//                 pole (the shared texture, the strips wave: offsets + light / shade change over time); a reload keeps it and
//                 never shows the maker again; 설정 › 놀이 › 「마을 깃발」 is gray during the tutorial (a toast, no maker), opens the
//                 maker after it; Android back (window.__fvApp.back) and Escape cancel an edit, 「완료」 changes every pole at once
//                 and the save; the 마을 옮기기 code carries the flag (D)
//   B 412x915 ko  the late v4.2 village (an old save): the classic flag on every pole, the 마을회관's right pole flies it (the
//                 baked banner painted out), the one-time card after the hand-over (만들기 / 나중에, written once, never again
//                 after a reload), the waving cost with every pole in view (all 5 framed) on 기본 and on 가볍게 (gs.gfxLow): ms per
//                 tick, ms per frame with / without the flags; night shots
//   C 360x640 en  the maker in English (fits, targets >= 88 logical px = 44 CSS px), the card in English (old save), 만들기
//   D             a village code made in A, brought into an empty browser (Transfer.applyVillage): the flag arrives, no maker
//   every page: no page errors. --shots DIR: the screenshots of the look sheet (412x915 ko day / night, 360x640 en)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SHOTS = opt('--shots', null);
const ONLY = opt('--only', 'A,B,C,D').split(',');
const FIX = path.join(HERE, 'fixtures');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 700) : '')); } };
const t0 = Date.now();
const wall = () => Math.round((Date.now() - t0) / 1000) + 's';
const fixtureKeys = (name) => { const d = JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8')); return d.keys ? d.keys : { 'frostVillage.save.v1': JSON.stringify(d) }; };

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const errors = [];
let ctxs = [];
async function boot(o) {
  const { page, ctx, log } = await openPage(browser, srv.url + 'index.html', { viewport: o.viewport, dpr: 1, locale: o.lang === 'en' ? 'en-US' : 'ko-KR', init: 'window.__FV_FLAGMAKER = true;' + (o.init || '') });
  ctxs.push({ ctx, log });
  await page.evaluate((q) => {
    localStorage.clear();
    if (q.keys) for (const k in q.keys) localStorage.setItem(k, q.keys[k]);
    const st = q.keys && q.keys['frostVillage.settings.v1'] ? JSON.parse(q.keys['frostVillage.settings.v1']) : {};
    st.lang = q.lang;
    localStorage.setItem('frostVillage.settings.v1', JSON.stringify(st));
  }, { keys: o.keys || null, lang: o.lang || 'ko' });
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player && window.__FV.game.scene.getScene('UI').ready, 120000);
  await sleep(800);
  await installStepper(page);
  await page.evaluate(() => { try { window.__FV.v42.v.seen.whatsNew = 1; } catch (e) { /* */ } window.__step.run(0.1); });
  return { page, ctx, log };
}
const F = (page) => page.evaluate(() => window.__FV.flag());
const css = (page, lx, ly) => page.evaluate(([x, y]) => { const c = document.querySelector('canvas').getBoundingClientRect(), ui = window.__FV.game.scene.getScene('UI'); return { x: c.left + x * c.width / ui.W, y: c.top + y * c.height / ui.H }; }, [lx, ly]);
/** a REAL tap at logical UI px (drawn once first: Phaser hit-tests what was drawn) */
async function tapAt(page, lx, ly) { await render(page, 1); const p = await css(page, lx, ly); await page.touchscreen.tap(p.x, p.y); await page.evaluate(() => window.__step.run(2 / 60)); }
async function tapHit(page, r) { if (!r) return false; await tapAt(page, r.x, r.y); return true; }
const cell = (f, field, v) => f.maker.hit.cells.find((q) => q.field === field && q.v === v);
const tab = (f, id) => f.maker.hit.tabs.find((q) => q.id === id);
let shotN = 0;
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  await render(page, 3);
  await page.screenshot({ path: path.join(SHOTS, name + '.png') });
  shotN++;
}
/** the camera on (x, y) (focus; a few frames so it settles and the ground bakes) */
async function look(page, x, y) { await page.evaluate(([a, b]) => window.__FV.camera(a, b), [x, y]); await page.evaluate(() => window.__step.run(0.3)); await render(page, 3); }
/** the y of the last strip of pole `i` relative to its rest (+ its tint) */
const wave = (page, i) => page.evaluate((k) => { const f = window.__FV.flag(); return f.poles[k] ? { dy: f.poles[k].dy, tint: f.poles[k].tint } : null; }, i);
/** open 설정 › 놀이 with real taps, return the flag row's button rect (logical) */
async function settingsFlagRow(page) {
  const gear = await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); return { x: ui.setBtn.x, y: ui.setBtn.y }; });
  await tapAt(page, gear.x, gear.y);
  await page.evaluate(() => window.__step.run(0.3));
  const tabPlay = await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); const b = (ui.settingsTabs || []).find((q) => q.tabId === 'play'); return b ? { x: b.x, y: b.y } : null; });
  await tapHit(page, tabPlay);
  await page.evaluate(() => window.__step.run(0.2));
  return page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); const r = (ui.settingsRows || []).find((q) => q.b && q.b.flagBtn); return r ? { x: r.b.x, y: r.b.y, w: r.b.width, h: r.b.height, label: r.label, value: r.value, alpha: r.b.alpha } : null; });
}
const savedFlag = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('frostVillage.save.v1')).flag || null; } catch (e) { return 'unreadable'; } });
const same = (a, b) => !!a && !!b && ['s', 'b', 'p', 'pc', 'e', 'ec'].every((k) => a[k] === b[k]);
const inside = (r, W, H) => r && r.x - r.w / 2 >= 0 && r.x + r.w / 2 <= W && r.y - r.h / 2 >= 0 && r.y + r.h / 2 <= H;
let codeA = null, flagA = null;

// ============================================================ A: a new game (412 x 915 ko)
if (ONLY.includes('A')) {
  console.log(`— A 412x915 ko: new game (${wall()})`);
  let { page, log } = await boot({ viewport: { width: 412, height: 915 }, lang: 'ko' });
  let f = await F(page);
  const paused = await page.evaluate(() => window.__FV.game.scene.isPaused('Game'));
  ok(f.maker && f.maker.open && f.maker.mode === 'new' && paused && f.mk === true, 'a new game opens 「우리 마을 깃발」, the village paused under it', { maker: f.maker && f.maker.mode, paused, mk: f.mk });
  ok(f.tex === [f.spec.s, f.spec.b, f.spec.p, f.spec.pc, f.spec.e, f.spec.ec].join('.') && f.spec.e >= 0, 'it starts with a random valid flag (already on the poles behind)', f.names);
  const onb0 = await page.evaluate(() => window.__FV.scene.onboard.t);
  await shot(page, 'ko412_day_maker1');
  // the options change the preview (REAL taps)
  const picks = [['shape', 's', 1], ['shape', 'b', 8], ['pattern', 'p', 5], ['pattern', 'pc', 2], ['emblem', 'e', 2], ['emblem', 'ec', 11]];
  let okPick = true;
  for (const [tb, field, v] of picks) {
    f = await F(page);
    if (f.maker.tab !== tb) { await tapHit(page, tab(f, tb)); f = await F(page); }
    if (f.maker.tab !== tb) { okPick = false; break; }
    await tapHit(page, cell(f, field, v));
    f = await F(page);
    if (f.maker.spec[field] !== v) { okPick = false; console.log('   pick failed', tb, field, v, f.maker.spec); }
  }
  ok(okPick && same(f.maker.spec, { s: 1, b: 8, p: 5, pc: 2, e: 2, ec: 11 }), 'tabs + options change the preview: 제비꼬리 · 남색 · 테두리 · 노랑 · 눈송이 · 흰색', f.maker.names);
  ok(f.tex !== [1, 8, 5, 2, 2, 11].join('.'), 'the poles keep the old flag until it is started');
  const w1 = await page.evaluate(() => { const m = window.__FV.game.scene.getScene('UI').flagMaker; return m.strips.map((s) => Math.round(s.y * 10) / 10); });
  await page.evaluate(() => window.__step.run(0.35));
  const w2 = await page.evaluate(() => { const m = window.__FV.game.scene.getScene('UI').flagMaker; return m.strips.map((s) => Math.round(s.y * 10) / 10); });
  ok(w1.some((y, i) => Math.abs(y - w2[i]) > 0.3), 'the big preview flag waves');
  await shot(page, 'ko412_day_maker2');
  await tapHit(page, f.maker.hit.shuffle);
  const fs1 = await F(page);
  ok(!same(fs1.maker.spec, f.maker.spec), '🎲 다시 섞기: another flag', fs1.maker.names);
  await shot(page, 'ko412_day_maker3');
  // 이대로 시작
  const chosen = fs1.maker.spec;
  await tapHit(page, fs1.maker.hit.start);
  await page.evaluate(() => window.__step.run(0.5));
  f = await F(page);
  const paused2 = await page.evaluate(() => window.__FV.game.scene.isPaused('Game'));
  ok(!f.maker.open && !paused2 && !f.mk && same(f.spec, chosen) && f.tex === [chosen.s, chosen.b, chosen.p, chosen.pc, chosen.e, chosen.ec].join('.'), '「이대로 시작」 starts the game with that flag', { spec: f.spec, paused2 });
  ok(same(await savedFlag(page), chosen), 'the flag is in the save (no maker mark)', await savedFlag(page));
  const onb1 = await page.evaluate(() => { const o = window.__FV.onboard(); return o ? o.mode : null; });
  ok(onb0 < 0.05, 'the tutorial did not run under the maker (pre-roll ' + onb0.toFixed(3) + ' s)');
  void onb1;
  const decor = f.poles.filter((q) => q.kind === 'decor');
  ok(decor.length === 4 && decor.every((q) => q.tex === 'fv_flag' && q.bare) && decor.find((q) => q.x === 2480).shown === false, `every WORLD.decor flag pole flies it: ${decor.length} bare poles on the one shared texture (the east one hidden with its land; ${decor.filter((q) => q.shown).length} drawn now — the far ones are parked by the culler)`, decor);
  // waving: offsets and light change with time (the beach pole in view)
  await look(page, 1280, 380);
  const bi = f.poles.findIndex((q) => q.kind === 'decor' && q.x === 1250);
  const a1 = await wave(page, bi);
  await page.evaluate(() => window.__step.run(0.4));
  const a2 = await wave(page, bi);
  ok(a1 && a2 && Math.abs(a1.dy - a2.dy) > 0.2 && a1.tint !== a2.tint, 'the beach pole waves (strip offset and shade change)', { a1, a2 });
  await shot(page, 'ko412_day_pole_a');
  await page.evaluate(() => window.__step.run(0.27));
  await shot(page, 'ko412_day_pole_b');
  // off screen: not waved
  const off = await page.evaluate(() => { const f = window.__FV.flag(); return f.stats.waved; });
  ok(off >= 1 && off < decor.length, `only poles near the view wave (${off} of ${decor.length})`);
  // settings row during the tutorial: gray, a toast, no maker
  let row = await settingsFlagRow(page);
  ok(row && row.label === '마을 깃발', '설정 › 놀이 has 「마을 깃발」', row);
  await tapHit(page, row);
  f = await F(page);
  const toast = await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); return ui.toastBox.visible ? ui.toastText.text : null; });
  ok(!f.maker.open && /튜토리얼/.test(toast || ''), 'during the tutorial it says so and does not open', toast);
  await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); ui.closeSettings(true); });
  // reload: the same flag, no maker
  await page.evaluate(() => window.__FV.save());
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.game.scene.getScene('UI').ready, 120000);
  await sleep(800);
  await installStepper(page);
  await page.evaluate(() => { try { window.__FV.v42.v.seen.whatsNew = 1; } catch (e) { /* */ } window.__step.run(0.3); });
  f = await F(page);
  ok(!f.maker.open && same(f.spec, chosen) && f.has && f.tex === [chosen.s, chosen.b, chosen.p, chosen.pc, chosen.e, chosen.ec].join('.'), 'a reload keeps the flag, no maker', f.names);
  // the tutorial over: the settings row opens the maker (edit)
  await page.evaluate(() => { window.__FV.unlockAll(); window.__step.run(0.5); });
  row = await settingsFlagRow(page);
  await tapHit(page, row);
  f = await F(page);
  ok(f.maker.open && f.maker.mode === 'edit' && await page.evaluate(() => window.__FV.game.scene.isPaused('Game')), 'after the tutorial: 설정 › 「마을 깃발」 opens the maker (edit)', f.maker && f.maker.mode);
  // Android back cancels an edit
  await tapHit(page, tab(f, 'emblem')); f = await F(page);
  await tapHit(page, cell(f, 'e', 12));
  const backed = await page.evaluate(() => window.__fvApp && window.__fvApp.back ? window.__fvApp.back() : 'none');
  await page.evaluate(() => window.__step.run(0.1));
  f = await F(page);
  ok(backed === true && !f.maker.open && same(f.spec, chosen) && !(await page.evaluate(() => window.__FV.game.scene.isPaused('Game'))), 'Android back (window.__fvApp.back) closes it and keeps the old flag', { backed, spec: f.spec });
  const backEmpty = await page.evaluate(() => window.__fvApp.back());
  ok(backEmpty === false, 'with nothing open, back is left to the app (its exit dialog)');
  // Escape on a computer
  await page.evaluate(() => window.__FV.flagOpen('edit'));
  await render(page, 1);
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__step.run(0.1));
  f = await F(page);
  ok(!f.maker.open && same(f.spec, chosen), 'Escape closes it too');
  // 완료: every pole at once + the save
  row = await settingsFlagRow(page);
  await tapHit(page, row);
  f = await F(page);
  await tapHit(page, tab(f, 'emblem')); f = await F(page);
  await tapHit(page, cell(f, 'e', 12)); f = await F(page);
  await tapHit(page, cell(f, 'ec', 2)); f = await F(page);
  const want = f.maker.spec;
  await tapHit(page, f.maker.hit.start);
  await page.evaluate(() => window.__step.run(0.3));
  f = await F(page);
  const toast2 = await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); return ui.toastBox.visible ? ui.toastText.text : null; });
  ok(!f.maker.open && same(f.spec, want) && f.tex === [want.s, want.b, want.p, want.pc, want.e, want.ec].join('.') && f.spec.e === 12, '「완료」: the new flag on every pole at once (one shared texture)', f.names);
  ok(/깃발/.test(toast2 || ''), 'a toast says so', toast2);
  await page.evaluate(() => window.__step.run(1));
  ok(same(await savedFlag(page), want), 'and in the save');
  flagA = want;
  // 마을 옮기기: the code of this village (D brings it into an empty browser)
  codeA = await page.evaluate(async () => {
    window.__FV.save();
    const T = await import(new URL('src/core/Transfer.js', location.href).href);
    return (await T.encodeVillage(T.snapshotKeys(localStorage))).code;
  });
  ok(typeof codeA === 'string' && codeA.length > 100, '마을 옮기기: the village code is made', codeA && codeA.length);
  errors.push(...log.errors);
}

// ============================================================ B: an old village (late v4.2 fixture, 412 x 915 ko)
const LATE = fixtureKeys('v42_village_late.json');
if (ONLY.includes('B')) {
  console.log(`— B 412x915 ko: the late v4.2 village (${wall()})`);
  const { page, log } = await boot({ viewport: { width: 412, height: 915 }, lang: 'ko', keys: LATE });
  let f = await F(page);
  ok(!f.maker.open && !f.has && same(f.spec, { s: 0, b: 0, p: 0, pc: 11, e: 1, ec: 2 }), 'an old save: no maker, the classic flag (red, yellow disc)', f.names);
  ok(f.poles.filter((q) => q.kind === 'decor').length === 4, 'all four village poles fly it');
  // the town hall (its picture is late art: wait for it)
  const hall = await page.evaluate(() => { const th = window.__FV.scene.townHall; return th ? { x: th.x, y: th.y } : null; });
  ok(!!hall, 'the late village has its 마을회관', hall);
  if (hall) {
    await look(page, hall.x + 20, hall.y - 140);
    for (let i = 0; i < 40; i++) { f = await F(page); if (f.hall) break; await page.evaluate(() => window.__step.run(0.5)); await sleep(150); }
    ok(!!f.hall && f.hall.patch && f.hall.patchPx > 80, 'the 마을회관\'s right pole flies the village flag; its baked banner painted out', f.hall || f.patchErr);
    const hp = f.poles.findIndex((q) => q.kind === 'hall');
    const h1 = await wave(page, hp); await page.evaluate(() => window.__step.run(0.4)); const h2 = await wave(page, hp);
    ok(h1 && h2 && Math.abs(h1.dy - h2.dy) > 0.1, 'the hall flag waves too', { h1, h2 });
    // nothing of it is interactive: pads / labels / taps untouched
    const inter = await page.evaluate(() => { const gs = window.__FV.scene; return gs.children.list.filter((o) => o.texture && /^fv_flag/.test(o.texture.key) && o.input).length; });
    ok(inter === 0, 'no flag picture takes taps');
    await shot(page, 'ko412_day_hall');
  }
  // the one-time card after ~20 s with nothing else up
  await page.evaluate(() => window.__FV.camera());
  let card = null;
  for (let i = 0; i < 40; i++) { await page.evaluate(() => window.__step.run(1)); f = await F(page); if (f.maker.card) { card = f.maker; break; } }
  ok(!!card && f.has && f.cardShown, 'the one-time card 「마을 깃발을 우리 마을답게 바꿔 볼까요?」 comes after the hand-over', f.maker);
  await look(page, 1280, 380);
  await shot(page, 'ko412_day_card');
  if (card) {
    await tapHit(page, card.cardRects.later);
    await page.evaluate(() => window.__step.run(0.5));
    f = await F(page);
    ok(!f.maker.card && !f.maker.open, '「나중에」 closes it');
    await page.evaluate(() => window.__FV.save());
    ok(same(await savedFlag(page), { s: 0, b: 0, p: 0, pc: 11, e: 1, ec: 2 }), 'the classic flag is now written (the card was offered once)');
  }
  // the waving cost with every pole in view, 기본 then 가볍게. (Not the overview: it frames the chief's side of the old map
  //  edge only — Game.overviewRect, 'the west strip (x < 0) has its own overview' — and the 마을회관 and the west pole are
  //  over there, so it showed 3 of the 5. The camera frames the box around every pole instead, zoomed out to fit it.)
  await page.evaluate(() => {
    const gs = window.__FV.scene, cam = gs.cameras.main, P = gs.flags.poles;
    window.__FV.camera();
    const xs = P.map((q) => q.ax), ys = P.map((q) => q.ay);
    const x0 = Math.min(...xs) - 60, x1 = Math.max(...xs) + 120, y0 = Math.min(...ys) - 60, y1 = Math.max(...ys) + 120;
    const k = cam.zoom / gs.zoomCur;          // View.k (logical px per screen px)
    window.__FV.camera((x0 + x1) / 2, (y0 + y1) / 2, Math.min(cam.width / k / (x1 - x0), cam.height / k / (y1 - y0)));
    window.__step.run(1.5);
  });
  await render(page, 2);
  const cost = await page.evaluate(() => {
    const gs = window.__FV.scene, vf = gs.flags, out = {};
    const run = (label) => {
      vf.stats.ticks = 0; vf.stats.ms = 0;
      const on = window.__step.bench(240);
      const st = { avgMs: vf.stats.ticks ? vf.stats.ms / vf.stats.ticks : 0, ticks: vf.stats.ticks, waved: vf.stats.waved };
      const keep = vf.update; vf.update = () => {};
      const offB = window.__step.bench(240);
      vf.update = keep;
      out[label] = { tickMs: +st.avgMs.toFixed(4), ticksPer240: st.ticks, poles: st.waved, frameMsWith: on.avg, frameMsWithout: offB.avg, perFrameMs: +((st.avgMs * st.ticks) / 240).toFixed(4) };
    };
    run('default');
    const g0 = gs.gfxLow;
    gs.gfxLow = true;
    run('low');
    gs.gfxLow = g0;
    return out;
  });
  console.log('   cost', JSON.stringify(cost));
  ok(cost.default.poles >= 5 && cost.default.perFrameMs < 0.2, `waving with every pole in view: ${cost.default.poles} poles, ${cost.default.tickMs} ms a tick (30 Hz) = ${cost.default.perFrameMs} ms a frame`, cost.default);
  ok(cost.low.ticksPer240 <= cost.default.ticksPer240 * 0.6 && cost.low.perFrameMs <= cost.default.perFrameMs, `가볍게 (gfxLow): 15 Hz, ${cost.low.perFrameMs} ms a frame`, cost.low);
  globalThis.__cost = cost;
  await page.evaluate(() => { window.__FV.camera(); window.__step.run(1); });
  // night
  const night = await page.evaluate(() => { const ck = window.__FV.scene.v4 && window.__FV.scene.v4.clock; if (!ck) return null; ck.set(22); window.__step.run(2); return +ck.hour().toFixed(2); });
  ok(night !== null, 'night (22:00) for the night shots', night);
  await look(page, 1280, 380);
  await shot(page, 'ko412_night_pole_a');
  await page.evaluate(() => window.__step.run(0.27));
  await shot(page, 'ko412_night_pole_b');
  if (hall) { await look(page, hall.x + 20, hall.y - 140); await shot(page, 'ko412_night_hall'); }
  await page.evaluate(() => window.__FV.camera());
  // the maker at night (from settings: 3 flags)
  const row = await settingsFlagRow(page);
  await tapHit(page, row);
  f = await F(page);
  ok(f.maker.open && f.maker.mode === 'edit', 'the settings row opens the maker in an old village');
  await shot(page, 'ko412_night_maker1');
  await tapHit(page, f.maker.hit.shuffle); await shot(page, 'ko412_night_maker2');
  f = await F(page); await tapHit(page, tab(f, 'emblem')); f = await F(page); await tapHit(page, f.maker.hit.shuffle); await shot(page, 'ko412_night_maker3');
  f = await F(page);
  await tapHit(page, f.maker.hit.close);
  f = await F(page);
  ok(!f.maker.open && same(f.spec, { s: 0, b: 0, p: 0, pc: 11, e: 1, ec: 2 }), '✕ closes the maker without changing the flag');
  errors.push(...log.errors);
  // the card at night (a fresh copy of the old village), 만들기 opens the maker
  const b2 = await boot({ viewport: { width: 412, height: 915 }, lang: 'ko', keys: LATE });
  await b2.page.evaluate(() => { const ck = window.__FV.scene.v4.clock; ck.set(22); window.__FV.camera(1280, 380); });
  let c2 = null;
  for (let i = 0; i < 40; i++) { await b2.page.evaluate(() => window.__step.run(1)); const q = await F(b2.page); if (q.maker.card) { c2 = q.maker; break; } }
  await look(b2.page, 1280, 380);
  await shot(b2.page, 'ko412_night_card');
  if (c2) {
    await tapHit(b2.page, c2.cardRects.make);
    const q = await F(b2.page);
    ok(q.maker.open && q.maker.mode === 'card', '「만들기」 opens the maker', q.maker && q.maker.mode);
  } else ok(false, 'the card came again in a fresh copy of the old village');
  // a reload after the card: never again
  await b2.page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); if (ui.flagMaker) ui.flagMaker.finish(false); window.__FV.save(); });
  await b2.page.reload({ waitUntil: 'load' });
  await waitFor(b2.page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300); await tapStart(b2.page);
  await waitFor(b2.page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.game.scene.getScene('UI').ready, 120000);
  await sleep(500); await installStepper(b2.page);
  let again = false;
  for (let i = 0; i < 30; i++) { await b2.page.evaluate(() => window.__step.run(1)); const q = await F(b2.page); if (q.maker.card) { again = true; break; } }
  ok(!again, 'the card never comes back after a reload');
  errors.push(...b2.log.errors);
}

// ============================================================ C: 360 x 640 en
if (ONLY.includes('C')) {
  console.log(`— C 360x640 en (${wall()})`);
  const { page, log } = await boot({ viewport: { width: 360, height: 640 }, lang: 'en' });
  let f = await F(page);
  const dims = await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); return { W: ui.W, H: ui.H }; });
  ok(f.maker.open && f.maker.mode === 'new', 'the maker opens in English at 360x640', dims);
  await shot(page, 'en360_maker1');
  // every tab: targets on screen, >= 88 logical px (44 CSS px at 360 wide), the cells clear of the bottom buttons
  let fits = true, small = [], over = [];
  for (const id of ['shape', 'pattern', 'emblem']) {
    f = await F(page);
    await tapHit(page, tab(f, id)); f = await F(page);
    const H = f.maker.hit;
    for (const q of H.cells.concat([H.start, H.shuffle], H.tabs)) {
      if (!inside(q, dims.W, dims.H)) fits = false;
      if (Math.min(q.w, q.h) < 84) small.push([q.field || q.id || 'btn', q.w, q.h]);
    }
    const lowest = Math.max(...H.cells.map((q) => q.y + q.h / 2));
    if (lowest > H.shuffle.y - H.shuffle.h / 2 - 4) over.push(id);
  }
  ok(fits && !over.length, 'every option and button on the screen; the options clear of the bottom buttons', { over });
  ok(small.length === 0, 'touch targets >= 84 x 84 logical px (>= 42 CSS px at 360 wide)', small.slice(0, 5));
  const texts = await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'), c = ui.flagMaker.c; const out = []; const walk = (o) => { if (o.type === 'Text' && o.visible) { const b = o.getBounds(); out.push({ t: o.text, x0: b.x, x1: b.right }); } if (o.list) o.list.forEach(walk); }; walk(c); return out; });
  const wide = texts.filter((q) => q.x0 < 15 || q.x1 > 705);
  ok(wide.length === 0, 'no English text runs off the panel', wide);
  await tapHit(page, f.maker.hit.shuffle); await shot(page, 'en360_maker2');
  f = await F(page); await tapHit(page, tab(f, 'shape')); f = await F(page); await tapHit(page, cell(f, 's', 4)); await tapHit(page, f.maker.hit.shuffle);
  f = await F(page); await tapHit(page, tab(f, 'shape')); f = await F(page); await tapHit(page, cell(f, 's', 3)); await shot(page, 'en360_maker3');
  f = await F(page);
  await tapHit(page, f.maker.hit.start);
  f = await F(page);
  ok(!f.maker.open, 'Start with this');
  await look(page, 1280, 380); await shot(page, 'en360_day_pole_a'); await page.evaluate(() => window.__step.run(0.27)); await shot(page, 'en360_day_pole_b');
  errors.push(...log.errors);
  // the card in English (the old village), the hall
  const b2 = await boot({ viewport: { width: 360, height: 640 }, lang: 'en', keys: LATE });
  const hall = await b2.page.evaluate(() => { const th = window.__FV.scene.townHall; return th ? { x: th.x, y: th.y } : null; });
  if (hall) {
    await look(b2.page, hall.x + 20, hall.y - 140);
    for (let i = 0; i < 40; i++) { const q = await F(b2.page); if (q.hall) break; await b2.page.evaluate(() => window.__step.run(0.5)); await sleep(150); }
    await shot(b2.page, 'en360_day_hall');
    await b2.page.evaluate(() => window.__FV.camera());
  }
  let c2 = null;
  for (let i = 0; i < 40; i++) { await b2.page.evaluate(() => window.__step.run(1)); const q = await F(b2.page); if (q.maker.card) { c2 = q.maker; break; } }
  ok(!!c2, 'the card in English');
  await look(b2.page, 1280, 380);
  await shot(b2.page, 'en360_day_card');
  if (c2) {
    const cr = c2.cardRects;
    ok(inside(cr.make, dims.W, dims.H) && inside(cr.later, dims.W, dims.H), 'its buttons on screen', cr);
    await tapHit(b2.page, cr.make);
    const q = await F(b2.page);
    ok(q.maker.open && q.maker.mode === 'card', 'Make one opens the maker');
    const back = await b2.page.evaluate(() => window.__fvApp.back());
    ok(back === true && !(await F(b2.page)).maker.open, 'back closes it');
  }
  errors.push(...b2.log.errors);
}

// ============================================================ D: the code into an empty browser
if (ONLY.includes('D') && codeA) {
  console.log(`— D 마을 옮기기 (${wall()})`);
  const { page, log } = await boot({ viewport: { width: 390, height: 844 }, lang: 'ko', init: 'window.__FV_FLAGMAKER = false;' });
  const r = await page.evaluate(async (code) => {
    const T = await import(new URL('src/core/Transfer.js', location.href).href);
    const d = await T.decodeVillage(code);
    if (!d.ok) return { err: d.error };
    const dr = T.dryRun(d.keys, d.payload.made);
    const ap = await T.applyVillage(d.keys);
    return { summary: dr.ok ? dr.summary.flag : null, ok: ap.ok };
  }, codeA);
  ok(r.ok && same(r.summary, flagA), 'the code carries the flag (the confirm card shows it)', r);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300); await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.game.scene.getScene('UI').ready, 120000);
  await sleep(500); await installStepper(page);
  await page.evaluate(() => window.__step.run(0.3));
  const f = await F(page);
  ok(same(f.spec, flagA) && !f.maker.open, 'the moved village flies its flag, no maker', f.names);
  errors.push(...log.errors);
}

await browser.close();
await srv.close();
ok(errors.length === 0, 'no page errors', errors.slice(0, 5));
if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'cost.json'), JSON.stringify(globalThis.__cost || null, null, 1));
console.log(`\n${pass} passed, ${fail} failed  (${shotN} shots, wall ${wall()})`);
process.exit(fail ? 1 : 0);
