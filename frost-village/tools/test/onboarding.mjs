// (v4.2.0.1) the first-run tutorial (src/systems/Onboarding.js + src/scenes/OnboardOverlay.js), fixed-step clock, one browser:
//   node tools/test/onboarding.mjs [--shots dir]
//   node     the strings (ko + en for every key), the save field (sanitize), the import mark (Transfer.markImported)
//   A 412x915 ko   a new game: S0 card, the S1 drag demo, one REAL touch drag (CDP) — the demo steps aside and the real
//                  joystick shows — then a bot that follows ONLY what the tutorial points at (Act 1: its arrow target;
//                  Act 2: the yellow arrow) goes through every step in order to the hand-over (bits NEW|ACT1|ACT2); the
//                  card / finger / ghost joystick never cover the place they talk about; the game is never paused and
//                  Input never disabled; nothing is left on screen after it; the whistle tip (T1) completes with a real
//                  tap; the settings tip (T5) follows into the panel; 설정 › 놀이 › 다시 보기 plays the tour (R0–R9) without
//                  touching coins or progress
//   B 360x640 en   the same bot run at the smallest phone in English (layout checks per step)
//   C 360x640 ko   a reload mid-Act 1 resumes at the right step (no S0 / S1, bits kept); one REAL tap on 「건너뛰기」 ends it
//                  at once (the old arrow + objective back, bits & SKIP) and no tip ever comes
//   D fixtures     the late v4.2 village, the v4.1 46-min and v3.5 saves: no onboarding, no `onb` written; 관망 running ->
//                  the replay tour stops it, hides the button, the tour ends with 건너뛰기; an automated browser without the
//                  flag never gets it; a cut-off save and a save from a newer build (an existing player) get no tutorial
//   (final round) the review fixes: no 「코인이 조금 모자라요」 / ✓ while the coins suffice (playtest #1), the replay row right
//                  after a skip and its live Act 1 (M1), the toast never on the coin counter (M2), a REAL drag in the tour's
//                  R1 keeps R2's camera and auto-advance (M3), the skip chip gone with the fisherman (L2), the closing card
//                  under the goal panel (playtest #5), a bot that does only what the finger shows gets out of the pocket
//                  behind the crate (playtest #3), the bubble in the settings panel takes the tap (L6), 되돌리기 is not an
//                  import (L7)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const FIX = path.join(HERE, 'fixtures');
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const t0 = Date.now();

// ------------------------------------------------------------------ node
console.log('— node');
{
  globalThis.window = globalThis.window || {};
  const S = await import('../../src/data/strings.js');
  const keys = Object.keys(S.STRINGS.ko).filter((k) => /^(onb_|tip_)/.test(k) || ['clerkSub', 'obj_cook', 'obj_cook_2', 'obj_fisher', 'obj_fisher_2', 'set_tutorial', 'set_replay'].includes(k));
  const missEn = keys.filter((k) => typeof S.STRINGS.en[k] !== 'string' || !S.STRINGS.en[k].trim());
  ok(keys.length >= 70 && missEn.length === 0, `${keys.length} tutorial strings, each in ko and en`, missEn);
  const enOnly = Object.keys(S.STRINGS.en).filter((k) => /^(onb_|tip_)/.test(k) && !(k in S.STRINGS.ko));
  ok(enOnly.length === 0, 'no English-only tutorial key', enOnly);
  const SV = await import('../../src/core/Save.js');
  const base = JSON.parse(fs.readFileSync(path.join(FIX, 'v41_save_smart_46min.json'), 'utf8'));
  const a = SV.migrateSave(Object.assign({}, base, { onb: 7 })), b = SV.migrateSave(base), c = SV.migrateSave(Object.assign({}, base, { onb: 'x' })), d = SV.migrateSave(Object.assign({}, base, { onb: 4096 }));
  ok(a && a.onb === 7 && b && b.onb === undefined && c && c.onb === undefined && d && d.onb === undefined, 'save: `onb` kept when 1..1023, dropped otherwise; a save without it stays without it', { a: a && a.onb, b: b && b.onb, c: c && c.onb, d: d && d.onb });
  const T = await import('../../src/core/Transfer.js');
  const k1 = { [SV.SAVE_KEY]: JSON.stringify(Object.assign({}, base, { onb: 3 })) }, k2 = { [SV.SAVE_KEY]: JSON.stringify(base) };
  const s2 = k2[SV.SAVE_KEY];
  T.markImported(k1); T.markImported(k2);
  ok(JSON.parse(k1[SV.SAVE_KEY]).onb === 15 && k2[SV.SAVE_KEY] === s2, 'import (마을 옮기기): onb |= ACT1|ACT2|SKIP; a save without it is left byte for byte', JSON.parse(k1[SV.SAVE_KEY]).onb);
  // (L7) 「예비 사본으로 되돌리기」 brings the player's own village back: its tutorial bits are left as they were
  const mem = () => { const m = new Map(); return { get length() { return m.size; }, key: (i) => Array.from(m.keys())[i], getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
  const stU = mem(), stI = mem();
  const rU = await T.applyVillage({ [SV.SAVE_KEY]: JSON.stringify(Object.assign({}, base, { onb: 3 })) }, { storage: stU, undo: true });
  const rI = await T.applyVillage({ [SV.SAVE_KEY]: JSON.stringify(Object.assign({}, base, { onb: 3 })) }, { storage: stI });
  ok(rU.ok && rI.ok && JSON.parse(stU.getItem(SV.SAVE_KEY)).onb === 3 && JSON.parse(stI.getItem(SV.SAVE_KEY)).onb === 15, '되돌리기 (undo) keeps the village\'s own bits; an import marks them done', { undo: JSON.parse(stU.getItem(SV.SAVE_KEY) || '{}').onb, imp: JSON.parse(stI.getItem(SV.SAVE_KEY) || '{}').onb });
  delete globalThis.window.__FV_NO_SAVE;
}

// ------------------------------------------------------------------ browser helpers
const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const pages = [];
async function boot(opts) {
  const { page, ctx, log } = await openPage(browser, srv.url + 'index.html', { viewport: opts.viewport, dpr: opts.dpr || 1, locale: opts.locale || 'ko-KR', init: (opts.flag === false ? '' : 'window.__FV_ONBOARD = true;') + (opts.init2 ? "window.__FV_FRAGMENTS = ['characters', 'props', 'fx', 'ui', 'ground', 'audio', 'villagers', 'life_props', 'emotes', 'villagers2', 'villagers3', 'buildings', 'ui2', 'audio2', 'workers', 'pets2', 'water', 'audio5'];" : '') });
  pages.push(ctx);
  await page.evaluate((o) => {
    try {
      localStorage.clear();
      if (o.keys) for (const k in o.keys) localStorage.setItem(k, o.keys[k]);
      else if (o.save) localStorage.setItem('frostVillage.save.v1', o.save);
      if (o.lang) localStorage.setItem('frostVillage.settings.v1', JSON.stringify({ lang: o.lang }));
    } catch (e) { /* */ }
  }, { keys: opts.keys || null, save: opts.save || null, lang: opts.lang || null });
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player && window.__FV.game.scene.getScene('UI').ready, 120000);
  await sleep(1200);
  await installStepper(page);
  // ((v4.3 마을 깃발) a new game opens 「우리 마을 깃발」 first (the Game paused under it): one REAL tap on 「이대로 시작」 and
  //  the village starts as before — the tutorial runs from there)
  await passFlagMaker(page);
  return { page, ctx, log };
}
/** (v4.3) the new-game flag maker: tap 「이대로 시작」 when it is up (true when it was) */
async function passFlagMaker(page) {
  const at = await page.evaluate(() => { const f = window.__FV.flag && window.__FV.flag(); return f && f.maker && f.maker.open ? f.maker.hit.start : null; });
  if (!at) return false;
  await render(page, 1);
  const p = await css(page, at.x, at.y);
  await page.touchscreen.tap(p.x, p.y);
  await page.evaluate(() => window.__step.run(2 / 60));
  return true;
}
/** logical UI px -> page CSS px */
const css = (page, lx, ly) => page.evaluate(([x, y]) => { const c = document.querySelector('canvas').getBoundingClientRect(), ui = window.__FV.game.scene.getScene('UI'); return { x: c.left + x * c.width / ui.W, y: c.top + y * c.height / ui.H }; }, [lx, ly]);
const tapAt = async (page, lx, ly) => { const p = await css(page, lx, ly); await page.touchscreen.tap(p.x, p.y); await page.evaluate(() => window.__step.run(2 / 60)); };
const st = (page) => page.evaluate(() => window.__FV.onboard());
let shotN = 0;
const shot = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await render(page); await page.screenshot({ path: path.join(SHOTS, String(++shotN).padStart(2, '0') + '_' + name + '.jpg'), type: 'jpeg', quality: 80 }); };

/**
 * the bot (in the page): Act 1 walks to the tutorial's own arrow target (and stands still when it has none), Act 2 to
 * the yellow arrow; every 0.5 s it checks the layout rules. Stops at `stopAt` (a mode or an Act 1 step) or after `secs`
 */
const BOT = ([secs, stopAt]) => {
  const F = window.__FV, gs = F.scene, ui = F.game.scene.getScene('UI'), ov = ui.onboardOv, ob = gs.onboard;
  const out = { seq: [], modes: [], viol: {}, samples: 0, paused: 0, disabled: 0, stuck: 0, cards: {}, t: 0, flags: [], bye: null };
  const price = () => { const q = gs.progress.pads.hire_clerk_market; return q && q.active && !q.done ? q.remaining : 0; };
  const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  const grow = (b, k) => [b[0] - k, b[1] - k, b[2] + k, b[3] + k];
  const ctr = (b) => ({ x: (b[0] + b[2]) / 2, y: (b[1] + b[3]) / 2 });
  const inC = (c, p) => Math.hypot(p.x - c.x, p.y - c.y) < c.r;
  const prev = {};
  let last = null, lastPos = null, still = 0;
  for (let i = 0; i < secs * 10; i++) {
    const o = ob.state(), p = gs.player;
    let tg = null;
    if (o.mode === 'act1' && o.step !== 'hi') tg = o.target;
    // ((v4.2.0.1 fix stage) Act 2 walks to where the yellow arrow is DRAWN (the debounced objective), as a player does:
    //  the raw target let the bot reach the cook / fisher pad before its card could say why)
    else if (o.mode === 'act2' && !(o.card && o.card.key === 'a2:bye')) tg = gs.tutorial.shownTarget ? gs.tutorial.shownTarget() : gs.tutorial.target;
    let vx = 0, vy = 0;
    if (tg) {
      const dx = tg.x - p.x, dy = tg.y - p.y, d = Math.hypot(dx, dy * 2);
      if (d > 16) { const n = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 60); vx = dx / n * k; vy = dy / n * k; }
      // a nudge round a corner when he does not get anywhere
      if (lastPos && Math.hypot(p.x - lastPos.x, p.y - lastPos.y) < 0.5 && (vx || vy)) { still++; if (still > 10) { const s = Math.floor(still / 10) % 2 ? 1 : -1; const nx = -vy * s, ny = vx * s; vx = vx * 0.3 + nx; vy = vy * 0.3 + ny; out.stuck++; } } else still = 0;
    }
    lastPos = { x: p.x, y: p.y };
    F.setInput(vx, vy);
    window.__step.run(0.1);
    out.t += 0.1;
    // ((v4.3, gate G1) time to the first sale / the first coins / the clerk, in game seconds since the village loaded)
    if (out.saleT === undefined && gs.progress.flags.firstSale) out.saleT = +ob.t.toFixed(1);
    if (out.coinT === undefined && gs.economy.earned > 0) out.coinT = +ob.t.toFixed(1);
    if (out.clerkT === undefined && gs.progress.isDone('hire_clerk_market')) out.clerkT = +ob.t.toFixed(1);
    const s2 = ob.state();
    const key = s2.mode + ':' + (s2.step || '');
    if (key !== last) {
      last = key; out.seq.push({ t: +out.t.toFixed(1), mode: s2.mode, step: s2.step, l1: s2.card && s2.card.l1, l2: s2.card && s2.card.l2 });
      // (playtest #1) 「코인이 조금 모자라요」 only when the coins in hand + on the cash pad do not pay for the clerk
      if (s2.step === 'short' && gs.economy.coins + gs.market.cash.value >= price()) out.flags.push({ short_with_coins: [gs.economy.coins, gs.market.cash.value, price()] });
    }
    if (s2.card && s2.card.key === 'beat:short') out.flags.push({ beat_on_short: s2.card.l1 });
    if (s2.card && s2.card.key === 'a2:bye' && !out.bye && ob.card && ov.cid === ob.card.id && ov.cardC.alpha > 0.9) {
      const r0 = ov.rects(), op = ui.objPanel, ow = (ui.objBg && ui.objBg.width) || 0;
      if (r0 && r0.card) out.bye = { slot: ov.slot, l2: s2.card.l2, card: r0.card, obj: op.visible ? [op.x - ow / 2, op.y - 31, op.x + ow / 2, op.y + 31] : null };
    }
    if (s2.card && s2.card.l1) out.cards[s2.card.key] = [s2.card.l1, s2.card.l2];
    if (i % 5 === 0) {
      out.samples++;
      if (F.game.scene.isPaused('Game')) out.paused++;
      if (window.__FV.scene && !gs.sys.isActive()) out.paused++;
      const r = ov.rects();
      const now = {};
      if (r) {
        const scr = [0, 0, r.screen[0], r.screen[1]];
        if (r.card && r.target && hit(r.card, grow(r.target, 20))) now.card_target = s2.step;
        if (r.finger && r.target && hit(r.finger, r.target)) now.finger_target = s2.step;
        if (r.ghost && (inC(r.ghost, ctr(r.chief)) || (r.target && inC(r.ghost, ctr(r.target))))) now.ghost = s2.step;
        for (const k of ['card', 'finger', 'tip', 'skip']) if (r[k] && (r[k][0] < scr[0] - 1 || r[k][1] < scr[1] - 1 || r[k][2] > scr[2] + 1 || r[k][3] > scr[3] + 1)) now[k + '_offscreen'] = s2.step;
        if (r.card && r.textW > r.cardW - 40 + 0.5) now.text_overflow = s2.step;
        // (L2) the skip chip goes with the fisherman (the 길 안내 chip may come up under it)
        if (s2.mode === 'act2' && gs.progress.isDone('hire_fisherman') && s2.skipVisible) now.skip_after_fisher = 1;
      }
      // ((v4.3) the 목표 창 stays out of the tutorial's way: no button, no window, the goal panel not a button, no walk)
      const gp = ui.goals, gw = gs.v42 && gs.v42.goalwalk;
      if ((s2.mode === 'act1' || s2.mode === 'act2') && gp && (gp.btn.visible || gp.isOpen() || (ui.objPanel.input && ui.objPanel.input.enabled) || (gw && gw.on))) now.goals_early = s2.step || s2.mode;
      // (a rule counts as broken when it is broken in two samples in a row: the camera's pan and the 0.5 s slot rule)
      for (const k in now) if (prev[k]) out.viol[k] = (out.viol[k] || []).concat([now[k]]).slice(-6);
      for (const k in prev) delete prev[k];
      Object.assign(prev, now);
    }
    if (!(typeof window.__inputOk === 'boolean')) window.__inputOk = true;
    if (s2.mode === stopAt || s2.step === stopAt) break;
  }
  F.setInput(0, 0);
  out.bits = ob.bits; out.mode = ob.mode; out.step = ob.cur;
  return out;
};
const order = (seq, want) => { let i = 0; for (const s of seq) if (i < want.length && (s.step === want[i] || s.mode === want[i] || (want[i] === 'reg' && s.step === 'regwait'))) i++; return i === want.length; };
const ACT1 = ['hi', 'move', 'still', 'toop', 'cook', 'take', 'shelf', 'reg', 'cash', 'pad', 'onpad', 'helpers'];

try {
  // ================================================================== A: 412x915 ko
  console.log('— A: a new game, 412x915, ko');
  {
    const { page, ctx, log } = await boot({ viewport: { width: 412, height: 915 } });
    await advance(page, 0.8);
    let s = await st(page);
    // (the village ran in real time for a moment before the fixed clock took over: S0 may be over already — its card is
    //  checked through the step history and the string)
    ok(s && s.mode === 'act1' && s.hist[0] === 'hi' && s.bits === 1 && (s.step !== 'hi' || (s.card && s.card.l1 === '어서 오세요, 촌장님!')), 'S0: the welcome card first, bits NEW', s && { mode: s.mode, step: s.step, hist: s.hist, card: s.card });
    ok(s.skipVisible, 'the 「건너뛰기」 chip shows from the start');
    await shot(page, 'S0_hi');
    await advance(page, 2.2);
    s = await st(page);
    ok(s.step === 'move' && s.hand && s.hand.g === 'drag' && s.hand.loop && s.rects && s.rects.finger && s.card.l1 === '손가락으로 화면을 끌어 봐요', 'S1: the drag demo loops with its card', { step: s.step, hand: s.hand, finger: s.rects && s.rects.finger });
    await advance(page, 0.6);
    s = await st(page);
    // ((v4.3 sea fixer) the demo loops every 2.4 s and the joystick shows for 0.25–2.1 s of each loop: the village ran in
    //  real time for a moment before the fixed clock (preroll 0.3–0.5 s), so a fixed sample time sometimes fell in the
    //  loop's last 0.3 s (finger and joystick both faded out) — look again over one loop before judging)
    for (let i = 0; i < 24 && !(s.rects && s.rects.ghost); i++) { await advance(page, 0.1); s = await st(page); }
    ok(!!(s.rects && s.rects.ghost), 'S1: the see-through joystick moves with the finger', s.rects);
    const objOff = await page.evaluate(() => !window.__FV.game.scene.getScene('UI').objPanel.visible && window.__FV.scene.tutorial.arrow.visible);
    ok(objOff, 'Act 1: the old objective panel is hidden, the (bigger) yellow arrow points the way');
    // ((v4.3) the fishing deck: the chief starts a few steps from his spot ((v4.3 「바다 가까이」) his landing at the
    //  water's edge), S1 / S2 point at it, the first view frames the deck, the spot, the grill and the stall (and the hut's
    //  roof at its edge))
    const W43 = (await page.evaluate(async () => { const m = await import(new URL('src/data/world.js', location.href).href); return { player: m.WORLD.player, reel: m.WORLD.deck.reel }; }));
    const v43 = await page.evaluate(() => {
      const gs = window.__FV.scene, D = gs.deck, cam = gs.cameras.main, wv = cam.worldView, o = window.__FV.onboard();
      const inV = (x, y, m = 0) => x >= wv.x - m && x <= wv.right + m && y >= wv.y - m && y <= wv.bottom + m;
      const O = gs.v42 && gs.v42.office, H = O && O.hut;
      return { start: [Math.round(gs.player.x), Math.round(gs.player.y)], reel: [D.gather.x, D.gather.y], ring: o.ring || null, target: o.target ? [Math.round(o.target.x), Math.round(o.target.y)] : null,
        deck: inV(D.x, D.y), reelV: inV(D.gather.x, D.gather.y), grill: inV(gs.stations.grill.x, gs.stations.grill.y), stall: inV(gs.market.x - 60, gs.market.y),
        hut: !!(H && inV(H.x + 150, H.y - 60)), wv: [Math.round(wv.x), Math.round(wv.y), Math.round(wv.width), Math.round(wv.height)] };
    });
    ok(v43.start[0] === W43.player.x && v43.start[1] === W43.player.y && Math.hypot(v43.start[0] - v43.reel[0], (v43.start[1] - v43.reel[1]) * 2) < 120, '(v4.3) a new game starts a few steps from the chief\'s spot', { start: v43.start, reel: v43.reel });
    ok(v43.target && v43.reel[0] === W43.reel[0] && v43.reel[1] === W43.reel[1] && Math.abs(v43.target[0] - v43.reel[0]) < 2 && Math.abs(v43.target[1] - (v43.reel[1] - 10)) < 2, '(v4.3 sea) S1 points at the chief\'s spot on his landing at the water\'s edge (not the old net, not the old spot on land)', v43);
    ok(v43.deck && v43.reelV && v43.grill && v43.stall && v43.hut, '(v4.3) the first view frames the deck, the reel spot, the grill, the stall and the hut\'s roof', v43);
    await shot(page, 'S1_drag_demo');
    // one REAL touch drag (up-left; (v4.3 sea) the spot is straight up from the start: the bot then walks there)
    const cdp = await ctx.newCDPSession(page);
    const p0 = await css(page, 430, 760), p1 = await css(page, 360, 720);
    const pos0 = await page.evaluate(() => ({ x: window.__FV.scene.player.x, y: window.__FV.scene.player.y }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p0.x, y: p0.y, id: 1 }] });
    await page.evaluate(() => window.__step.run(2 / 60));
    for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p0.x + (p1.x - p0.x) * i / 6, y: p0.y + (p1.y - p0.y) * i / 6, id: 1 }] }); await page.evaluate(() => window.__step.run(1 / 60)); }
    const during = await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'), o = window.__FV.onboard(); return { joy: ui.joyBase.visible, finger: !!(o.rects && o.rects.finger), ghost: !!(o.rects && o.rects.ghost) }; });
    await shot(page, 'S1_real_drag');
    await page.evaluate(() => window.__step.run(0.35));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.evaluate(() => window.__step.run(0.3));
    const pos1 = await page.evaluate(() => ({ x: window.__FV.scene.player.x, y: window.__FV.scene.player.y }));
    s = await st(page);
    ok(during.joy && !during.finger && !during.ghost, 'a real touch: the real joystick under the finger, the demo hand and ghost step aside in the same frame', during);
    ok(Math.hypot(pos1.x - pos0.x, pos1.y - pos0.y) > 15 && s.moved, 'the real drag walked the chief (S1 counts it)', { pos0, pos1, moved: s.moved });
    // the bot, through Act 1 and Act 2
    const r = await page.evaluate(BOT, [300, 'act3']);
    const steps = r.seq.map((q) => (q.mode === 'act1' ? q.step : q.mode));
    console.log('       steps: ' + steps.join(' → ') + `  (${r.t.toFixed(0)} s game time)`);
    console.log(`       G1: first sale ${r.saleT} s, first coins ${r.coinT} s, clerk hired ${r.clerkT} s (game time since the village loaded)`);
    ok(order(r.seq, ACT1.slice(2).concat(['act2', 'act3'])), 'every Act 1 step in order (still → toop → cook → take → shelf → register → cash → pad → on the pad → helpers), then Act 2, then Act 3', steps);
    ok(r.bits === 7 && r.mode === 'act3', 'the hand-over: bits NEW|ACT1|ACT2 = 7, Act 3 (tips)', { bits: r.bits, mode: r.mode });
    ok(Object.keys(r.viol).length === 0, 'layout at 412x915: the card never covers its place, the finger / ghost joystick never cover the chief or the place, nothing off screen, no text overflow', r.viol);
    ok(r.paused === 0, 'the game is never paused by the tutorial', r.paused);
    const cards = Object.values(r.cards).map((c) => c[0]);
    // ((v4.2.0.1 fix stage) the beats come on the first lap only: a first lap short of the clerk's price (the customers
    //  want 1–3 fish at random) has 「코인이 조금 모자라요」 instead of 「코인이 모였어요!」)
    const short1 = r.seq.some((q) => q.step === 'short');
    ok(['물고기를 모았어요!', '잘했어요!', short1 ? '코인이 조금 모자라요' : '코인이 모였어요!', '생선을 대신 구워 줘요', '물고기를 대신 잡아 줘요', '이제 마을을 키워 봐요!'].every((x) => cards.includes(x)), 'the success beats and the Act 2 cards were shown (the cook / fisher cards say why, the goal panel says what)', cards);
    ok(r.flags.length === 0, 'no 「코인이 조금 모자라요」 and no ✓ while the coins (in hand + on the cash pad) pay for the clerk', r.flags);
    ok(r.bye && r.bye.slot === 'top' && r.bye.l2 === '다음 할 일은 위에 나와요' && r.bye.card && (!r.bye.obj || (r.bye.card[1] >= r.bye.obj[3] - 1)), 'the closing card sits right under the goal panel and points at it (no "yellow arrow" without one)', r.bye);
    // nothing left on screen ((v4.2.0.1 fix stage) two frames on: Phaser steps the UI scene before the Game scene, so the
    //  overlay hides the card one frame after the hand-over)
    const left = await page.evaluate(() => {
      window.__step.run(2 / 60);
      const ui = window.__FV.game.scene.getScene('UI'), ov = ui.onboardOv, gs = window.__FV.scene, o = gs.onboard;
      return { card: ov.cardC.visible, skip: ov.skipC.visible, finger: ov.fingers.some((f) => f.visible), ghost: ov.gBase.visible, spot: ov.spotC.visible, ring: !!(o.ring && o.ring.visible), tip: ov.tipC.visible, held: o.held.length, enabled: true };
    });
    ok(!left.card && !left.skip && !left.finger && !left.ghost && !left.spot && !left.ring && !left.tip && left.held === 0, 'after the hand-over nothing is left on screen (no card, chip, finger, ghost, spotlight, ring) and no banner is held', left);
    // ((v4.3) the 목표 창 comes with the hand-over (hidden through Act 1 and Act 2: the bot's layout samples say so)
    const gq = await page.evaluate(() => { window.__step.run(1.2); const G = window.__FV.v42.goals; return G ? G.panel() : null; });
    ok(gq && gq.button && !gq.open, '(v4.3) after the hand-over the 목표 button shows (it was hidden all through Act 1 / 2)', gq);
    const inp = await page.evaluate(() => { const gs = window.__FV.scene; return { enabled: gs.scene.systems.game ? true : true, inputEnabled: (window.__FV.game.scene.getScene('UI').input.enabled), override: null }; });
    ok(inp.inputEnabled, 'input stays enabled');
    // perf: the onboarding's own update + overlay
    const perf = await page.evaluate(() => {
      const gs = window.__FV.scene, ui = window.__FV.game.scene.getScene('UI');
      const a = performance.now();
      for (let i = 0; i < 600; i++) { gs.onboard.update(0); ui.onboardOv.update(0); }
      return (performance.now() - a) / 600;
    });
    ok(perf < 0.1, `the tutorial's update + overlay cost ${perf.toFixed(4)} ms a frame (< 0.1)`, perf);
    // T1: the whistle tip, then a real tap on the whistle completes it
    const tw = await page.evaluate(() => { const gs = window.__FV.scene; for (let i = 0; i < 600; i++) { window.__step.run(0.1); if (gs.onboard.tip) break; } window.__step.run(0.6); return window.__FV.onboard(); });
    ok(tw.tip && tw.tip.id === 'T1' && tw.tip.btn === 'whistle' && tw.rects && tw.rects.tip && tw.rects.finger, 'Act 3: the whistle tip (bubble + tapping finger) comes at a calm moment', tw.tip);
    await page.evaluate(() => window.__step.run(0.6));
    await shot(page, 'T1_whistle_tip');
    await page.evaluate(() => window.__step.run(0.8));
    const wb = await page.evaluate(() => { const b = window.__FV.game.scene.getScene('UI').whistleBtn; return { x: b.x, y: b.y }; });
    await tapAt(page, wb.x, wb.y);
    await page.evaluate(() => window.__step.run(0.5));
    s = await st(page);
    ok((!s.tip || s.tip.id === 'dogbar') && (s.bits & 16) && (await page.evaluate(() => !!window.__FV.scene.progress.seen.whistle)), 'a real tap on the whistle: Nuri comes, the tip ends, bit T1', { tip: s.tip, bits: s.bits });
    // the follow-up: the first time the dog bar opens, a bubble over it (no finger), 4 s
    const db = await page.evaluate(() => { const o = window.__FV.scene.onboard; for (let i = 0; i < 60 && !(o.tip && o.tip.id === 'dogbar'); i++) window.__step.run(0.1); window.__step.run(0.4); return window.__FV.onboard(); });
    ok(db.tip && db.tip.id === 'dogbar' && db.rects.tip && !db.rects.finger, 'the dog bar opens: 「간식·공놀이·쓰다듬기」 over it, no finger', db.tip);
    await shot(page, 'T1_dogbar');
    await page.evaluate(() => window.__step.run(4.2));
    // T5: the settings tip follows into the panel (마을 옮기기, then the 놀이 tab); a tap in the panel ends it
    await page.evaluate(() => { const o = window.__FV.scene.onboard; o.t += 600; o.a3.lastEnd = -1e9; o.a3.lastBanner = -1e9; o.bits |= 32 | 64 | 128 | 512; });
    const t5 = await page.evaluate(() => { const gs = window.__FV.scene; for (let i = 0; i < 300; i++) { window.__step.run(0.1); if (gs.onboard.tip && gs.onboard.tip.id === 'T5') break; } window.__step.run(0.6); return gs.onboard.state(); });
    ok(t5.tip && t5.tip.id === 'T5' && t5.tip.btn === 'settings', 'the settings tip points at ⚙', t5.tip);
    const sb = await page.evaluate(() => { const b = window.__FV.game.scene.getScene('UI').setBtn; return { x: b.x, y: b.y }; });
    await tapAt(page, sb.x, sb.y);
    await page.evaluate(() => window.__step.run(0.3));
    s = await st(page);
    ok(s.tip && s.tip.btn === 'move' && s.tip.phase === 1 && s.rects.tip, 'settings opened inside the tip: the finger and bubble point at 마을 옮기기 (above the panel)', s.tip);
    await shot(page, 'T5_move_village');
    await page.evaluate(() => window.__step.run(4.2));
    s = await st(page);
    ok(s.tip && s.tip.btn === 'playTab', '…then at the 놀이 tab: the tutorial can be replayed there', s.tip);
    const pk0 = await page.evaluate(() => JSON.stringify(window.__FV.settings ? window.__FV.settings() : JSON.parse(localStorage.getItem('frostVillage.settings.v1') || '{}')));
    const tab0 = await page.evaluate(() => window.__FV.game.scene.getScene('UI').settingsTab || null);
    const tb = s.rects && s.rects.tip;
    if (tb) await tapAt(page, (tb[0] + tb[2]) / 2 - 40, (tb[1] + tb[3]) / 2);
    await page.evaluate(() => window.__step.run(0.3));
    s = await st(page);
    const pk1 = await page.evaluate(() => JSON.stringify(window.__FV.settings ? window.__FV.settings() : JSON.parse(localStorage.getItem('frostVillage.settings.v1') || '{}')));
    const still = await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); return { open: !!ui.panelOpen, tab: ui.settingsTab || null }; });
    ok(!!tb && !s.tip && (s.bits & 256) && pk0 === pk1 && still.open && still.tab === tab0, 'a tap on the bubble in the panel ends the follow-up (bit T5) and presses nothing under it', { tip: s.tip, bits: s.bits, same: pk0 === pk1, still });
    // 설정 › 놀이 › 다시 보기: the tour
    const before = await page.evaluate(() => { const gs = window.__FV.scene; return JSON.stringify({ c: gs.economy.coins, d: gs.progress.done, p: gs.progress.paid }); });
    const row = await page.evaluate(() => {
      const ui = window.__FV.game.scene.getScene('UI');
      ui.settingsTab = 'play'; ui.buildPanelContent(false);
      const r = (ui.settingsRows || []).find((q) => q.b && q.b.replayBtn);
      window.__step.run(0.1);      // (a new button joins the input list on the scene's next update)
      return r ? { x: r.b.x, y: r.b.y, label: r.label, value: r.value } : null;
    });
    ok(row && row.label === '튜토리얼' && row.value === '다시 보기', '설정 › 놀이: the row 「튜토리얼 · 다시 보기」', row);
    // ((v4.2.0.1 fix stage) one drawn frame first: Phaser picks the topmost of the touched objects by the camera's last
    //  render list, and the rebuilt row was never drawn (the panel's dim took the tap). A phone draws every frame)
    await render(page, 1);
    await shot(page, 'settings_replay_row');
    if (row) await tapAt(page, row.x, row.y);
    await page.evaluate(() => window.__step.run(0.4));
    s = await st(page);
    ok(s.mode === 'tour' && !(await page.evaluate(() => window.__FV.game.scene.getScene('UI').panelOpen)) && s.card && s.card.l1 === '다시 한 번 둘러볼까요?' && s.card.next, 'the tour starts (settings closed): 「다시 한 번 둘러볼까요?」 with 「다음 ›」', s);
    const tour = await page.evaluate(() => {
      const gs = window.__FV.scene, o = gs.onboard, seen = [];
      for (let i = 0; i < 1200 && o.mode === 'tour'; i++) { window.__step.run(0.1); const k = 'R' + o.tourI + (o.tip ? ':' + o.tip.btn : ''); if (seen[seen.length - 1] !== k) seen.push(k); if (o.tourI === 1 && o.tourT > 2) o.next(); }
      return { seen, mode: o.mode };
    });
    console.log('       tour: ' + tour.seen.join(' '));
    ok(tour.seen.includes('R1') && tour.seen.includes('R8') && tour.seen.some((x) => /^R\d+:whistle/.test(x)) && tour.seen.some((x) => /:settings/.test(x)) && tour.mode === 'act3', 'the tour visits the drag demo, the 7 places of the first loop and the buttons, then ends by itself', tour);
    const after = await page.evaluate(() => { const gs = window.__FV.scene; return JSON.stringify({ c: gs.economy.coins, d: gs.progress.done, p: gs.progress.paid }); });
    ok(before === after, 'the tour changes no coins and no progress');
    s = await st(page);
    ok(s.bits === (7 | 16 | 32 | 64 | 128 | 256 | 512), 'the tour never writes the bits', s.bits);
    ok(log.errors.length === 0, 'A: 0 page errors', log.errors.slice(0, 5));
    await ctx.close();
  }

  // ================================================================== B: 360x640 en
  console.log('— B: a new game, 360x640, en');
  {
    const { page, ctx, log } = await boot({ viewport: { width: 360, height: 640 }, lang: 'en', locale: 'en-US' });
    await advance(page, 3.2);
    let s = await st(page);
    ok(s.step === 'move' && s.card.l1 === 'Drag on the screen' && s.card.l2 === 'The chief walks that way', 'English: S1 "Drag on the screen / The chief walks that way"', s.card);
    const r = await page.evaluate(BOT, [240, 'act2']);
    console.log(`       G1 (360x640 en): first sale ${r.saleT} s, first coins ${r.coinT} s, clerk hired ${r.clerkT} s`);
    console.log('       steps: ' + r.seq.map((q) => (q.mode === 'act1' ? q.step : q.mode)).join(' → '));
    ok(order(r.seq, ACT1.slice(1).concat(['act2'])), 'every Act 1 step in order at 360x640', r.seq.map((q) => q.step || q.mode));
    ok(Object.keys(r.viol).length === 0, 'layout at 360x640 (en): no card / finger / ghost over its place, nothing off screen, no text overflow', r.viol);
    const en = Object.values(r.cards).map((c) => c[0]);
    ok(['Got the fish!', 'Go to the \'Stand: grill\' pad', 'Stand at the register', 'Go pick up the coins', 'Helpers work for you'].every((x) => en.includes(x)), 'the cards are in English', en);
    ok(r.flags.length === 0, 'no "Not quite enough coins" / ✓ while the coins pay for the clerk (360x640)', r.flags);
    // (M2) a toast while the coach card is in the TOP slot stays where toasts go (never over the coin counter / ⚙); while
    //  it is in the bottom slot the toast goes above it
    const tq = await page.evaluate(() => {
      const F = window.__FV, gs = F.scene, ui = F.game.scene.getScene('UI'), ov = ui.onboardOv, ob = gs.onboard;
      const hit = (a, c) => a.x < c.right && a.right > c.x && a.y < c.bottom && a.bottom > c.y;
      const keep = { slot: ov.slot, cb: ov.cardBox, card: ob.card };
      const one = (slot, box) => {
        ov.slot = slot; ov.cardBox = box; ob.card = ob.card || { id: -7, key: 'test' };
        ui.toast('Picked up on the way · change it in Settings › Play › Auto pick-up', 3000);
        const y = ui.toastBox.y;
        ov.slot = keep.slot; ov.cardBox = keep.cb; ob.card = keep.card;
        return y;
      };
      const yTop = one('top', [60, 130, 660, 230]), yBot = one('bottom', [100, ui.H - 330, 620, ui.H - 230]);
      window.__step.run(0.3);
      const b = ui.toastBox.getBounds(), cbar = ui.coinBar.getBounds(), set = ui.setBtn.getBounds();
      ui.toastBox.y = yTop;
      const bt = ui.toastBox.getBounds();
      return { yTop, yBot, H: ui.H, overCoin: hit(bt, cbar), overSet: hit(bt, set), botAbove: yBot < ui.H - 330, b: [b.x, b.y, b.right, b.bottom].map(Math.round) };
    });
    ok(!tq.overCoin && !tq.overSet && tq.yTop > tq.H / 2 && tq.botAbove, 'a toast with the card in the top slot stays low (not on the coin counter / ⚙); with the card at the bottom it goes above the card', tq);
    ok(log.errors.length === 0, 'B: 0 page errors', log.errors.slice(0, 5));
    await ctx.close();
  }

  // ================================================================== C: resume + skip
  console.log('— C: reload in the middle, then 「건너뛰기」 (360x640, ko)');
  {
    let { page, ctx, log } = await boot({ viewport: { width: 360, height: 640 } });
    await advance(page, 3);
    const r = await page.evaluate(BOT, [120, 'take']);
    let s = await st(page);
    ok(s.step === 'take', 'the bot is at S5 (take the grilled fish)', s.step);
    const saved = await page.evaluate(() => { window.__FV.save(); return localStorage.getItem('frostVillage.save.v1'); });
    ok(JSON.parse(saved).onb === 1, 'the autosave carries onb = NEW', JSON.parse(saved).onb);
    await ctx.close();
    ({ page, ctx, log } = await boot({ viewport: { width: 360, height: 640 }, save: saved }));
    await advance(page, 2.2);
    s = await st(page);
    ok(s.mode === 'act1' && s.step !== 'hi' && s.step !== 'move' && s.moved && s.bits === 1 && !(s.card && /잘했어요/.test(s.card.l1 || '')), 'after a reload it resumes from the world (no S0 / S1, no 「잘했어요」), bits kept', { step: s.step, bits: s.bits, card: s.card });
    // (playtest #3) the pocket between the fence and the crate right of the register: a bot that does ONLY what the
    //  finger's drag shows (its direction, re-read every 0.25 s) gets out and reaches the grill's 서서 굽기 pad
    const pocket = await page.evaluate(() => {
      const F = window.__FV, gs = F.scene, ov = F.game.scene.getScene('UI').onboardOv, o = gs.onboard;
      const to = { x: gs.stations.grill.op.x, y: gs.stations.grill.op.y };
      F.teleport(1555, 817); window.__step.run(0.1);
      const via0 = o.via(to), straight = via0 === to;
      let t = 0, best = 1e9;
      for (; t < 30; t += 0.25) {
        const p = gs.player, d = Math.hypot(p.x - to.x, (p.y - to.y) * 2);
        best = Math.min(best, d);
        if (d < 60) break;
        const v = ov.dirTo(to);
        F.setInput(v.x, v.y);
        window.__step.run(0.25);
      }
      F.setInput(0, 0); window.__step.run(0.1);
      return { reached: best < 60, secs: t, best: Math.round(best), detour: !straight, via0: via0 && [Math.round(via0.x), Math.round(via0.y)] };
    });
    ok(pocket.reached && pocket.detour, 'from the pocket behind the crate, doing only what the finger shows reaches the grill pad (it shows the way round)', pocket);
    await advance(page, 1);
    s = await st(page);
    // one REAL tap on 「건너뛰기 ›」
    const skip = s.rects && s.rects.skip;
    ok(!!skip, 'the skip chip is on screen', s.rects);
    await shot(page, 'skip_before');
    // a DRAG that starts on the chip walks the chief and skips nothing (the chip sits where a thumb walks)
    if (skip) {
      const cdp = await ctx.newCDPSession(page);
      const a = await css(page, (skip[0] + skip[2]) / 2, (skip[1] + skip[3]) / 2), b = await css(page, (skip[0] + skip[2]) / 2 - 90, (skip[1] + skip[3]) / 2 - 60);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.x, y: a.y, id: 3 }] });
      await page.evaluate(() => window.__step.run(2 / 60));
      for (let i = 1; i <= 5; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x + (b.x - a.x) * i / 5, y: a.y + (b.y - a.y) * i / 5, id: 3 }] }); await page.evaluate(() => window.__step.run(1 / 60)); }
      const mid = await page.evaluate(() => ({ joy: window.__FV.game.scene.getScene('UI').joyBase.visible, mag: window.__FV.scene.player ? 1 : 0 }));
      await page.evaluate(() => window.__step.run(0.3));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.evaluate(() => window.__step.run(0.2));
      const s2 = await st(page);
      ok(mid.joy && s2.mode === 'act1', 'a drag that starts on the 「건너뛰기」 chip moves the chief (joystick) and does not skip', { joy: mid.joy, mode: s2.mode });
    }
    if (skip) await tapAt(page, (skip[0] + skip[2]) / 2, (skip[1] + skip[3]) / 2);
    await page.evaluate(() => window.__step.run(0.2));
    const after = await page.evaluate(() => {
      const ui = window.__FV.game.scene.getScene('UI'), ov = ui.onboardOv, gs = window.__FV.scene, o = gs.onboard, tu = gs.tutorial;
      return { mode: o.mode, bits: o.bits, card: ov.cardC.visible, skip: ov.skipC.visible, finger: ov.fingers.some((f) => f.visible), ghost: ov.gBase.visible, spot: ov.spotC.visible, ring: !!(o.ring && o.ring.visible),
        arrow: tu.arrow.visible, arrowAt: tu.target ? [Math.round(tu.target.x), Math.round(tu.target.y)] : null, obj: ui.objPanel.visible, objKey: ui.objKey, toast: ui.toastBox.visible ? ui.toastText.text : null, paused: window.__FV.game.scene.isPaused('Game') };
    });
    ok(after.mode === 'off' && (after.bits & 8) && (after.bits & 6) === 6, 'one tap: skipped (bits SKIP|ACT1|ACT2)', after);
    ok(!after.card && !after.skip && !after.finger && !after.ghost && !after.spot && !after.ring, 'within 0.2 s every overlay is gone', after);
    ok(after.arrow && after.arrowAt && after.obj && after.objKey, 'the old tutorial takes over at once: its arrow and objective are back', after);
    ok(after.toast === '설정 › 놀이에서 다시 볼 수 있어요' && !after.paused, 'a toast says where to replay it; the game never paused', after.toast);
    const tpos = await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); const b = ui.toastBox.getBounds(), c = ui.coinBar.getBounds(), g = ui.setBtn.getBounds(); const hit = (a, q) => a.x < q.right && a.right > q.x && a.y < q.bottom && a.bottom > q.y; return { over: hit(b, c) || hit(b, g), y: Math.round(b.y), H: ui.H }; });
    ok(!tpos.over && tpos.y > tpos.H / 2, 'the skip toast is not on the coin counter / ⚙ (M2)', tpos);
    await shot(page, 'skip_after');
    const later = await page.evaluate(() => { const gs = window.__FV.scene; let tip = 0; for (let i = 0; i < 240; i++) { window.__step.run(0.5); if (gs.onboard.tip || gs.onboard.mode !== 'off') tip++; } return { tip, bits: gs.onboard.bits }; });
    ok(later.tip === 0, 'no tip and no tutorial for 2 game minutes after a skip', later);
    // (M1) the toast's promise: 설정 › 놀이 has 「튜토리얼 · 다시 보기」 right away (the first loop not learnt yet); it plays the
    //  live Act 1 again (writes nothing new), and 「건너뛰기」 ends it again
    const rr = await page.evaluate(() => {
      const ui = window.__FV.game.scene.getScene('UI'), gs = window.__FV.scene;
      ui.openSettings(true); ui.settingsTab = 'play'; ui.buildPanelContent(false);
      const r0 = (ui.settingsRows || []).find((q) => q.b && q.b.replayBtn);
      window.__step.run(0.1);
      return r0 ? { x: r0.b.x, y: r0.b.y, inTutorial: gs.tutorial.inTutorial } : { none: true, inTutorial: gs.tutorial.inTutorial };
    });
    ok(rr && !rr.none && rr.inTutorial, 'right after 「건너뛰기」 (still in the first loop) 설정 › 놀이 has the replay row', rr);
    await shot(page, 'settings_replay_after_skip');
    await render(page);
    if (rr && !rr.none) await tapAt(page, rr.x, rr.y);
    await page.evaluate(() => window.__step.run(2.5));
    s = await st(page);
    ok(s.mode === 'act1' && !(await page.evaluate(() => window.__FV.game.scene.getScene('UI').panelOpen)) && s.card && s.skipVisible && (s.bits & 8), 'the replay plays Act 1 live (its card, its skip chip; the village stays marked skipped)', { mode: s.mode, step: s.step, card: s.card, bits: s.bits });
    await shot(page, 'live_replay');
    const sk2 = s.rects && s.rects.skip;
    if (sk2) await tapAt(page, (sk2[0] + sk2[2]) / 2, (sk2[1] + sk2[3]) / 2);
    await page.evaluate(() => window.__step.run(0.3));
    s = await st(page);
    ok(s.mode === 'off' && !(await page.evaluate(() => window.__FV.scene.onboard.liveReplay)), '「건너뛰기」 ends the replay too', { mode: s.mode });
    void r;
    ok(log.errors.length === 0, 'C: 0 page errors', log.errors.slice(0, 5));
    await ctx.close();
  }

  // ================================================================== D: fixtures, 관망, robots
  console.log('— D: old villages, 관망 and the replay tour, an automated browser');
  {
    const late = JSON.parse(fs.readFileSync(path.join(FIX, 'v42_village_late.json'), 'utf8')).keys;
    const { page, ctx, log } = await boot({ viewport: { width: 412, height: 915 }, keys: late });
    await advance(page, 2);
    let s = await st(page);
    const sv = await page.evaluate(() => { window.__FV.save(); return JSON.parse(localStorage.getItem('frostVillage.save.v1')); });
    const vis = await page.evaluate(() => { const ov = window.__FV.game.scene.getScene('UI').onboardOv; return ov.cardC.visible || ov.skipC.visible || ov.fingers.some((f) => f.visible) || ov.spotC.visible; });
    ok(s.mode === 'off' && s.bits === 0 && !vis && sv.onb === undefined, 'the late v4.2 village (4.2.0 tester): no tutorial, nothing drawn, no `onb` written', { mode: s.mode, bits: s.bits, onb: sv.onb });
    // 관망 on -> replay: stopped, the button hidden, no auto-start while the tour runs
    await page.evaluate(() => { window.__FV.v42.pilot(true); window.__step.run(1); });
    const pil = await page.evaluate(() => { const P = window.__FV.scene.v42.pilot; return P.on; });
    ok(pil, '관망 is running');
    const before = await page.evaluate(() => { const gs = window.__FV.scene; return JSON.stringify({ c: gs.economy.coins, d: gs.progress.done }); });
    const row = await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); ui.openSettings(true); ui.settingsTab = 'play'; ui.buildPanelContent(false); const r = (ui.settingsRows || []).find((q) => q.b && q.b.replayBtn); window.__step.run(0.1); return r ? { x: r.b.x, y: r.b.y } : null; });
    ok(!!row, 'the late village has the replay row too');
    await render(page);          // (one drawn frame: the new panel's buttons take touches, as on a phone)
    if (row) await tapAt(page, row.x, row.y);
    await page.evaluate(() => window.__step.run(1.5));
    const tr = await page.evaluate(() => { const gs = window.__FV.scene, ui = window.__FV.game.scene.getScene('UI'); window.__FV_PILOT_AUTO = true; return { mode: gs.onboard.mode, pilot: gs.v42.pilot.on, avail: gs.v42.pilot.available, obs: ui.hud42.obsBtn.visible }; });
    ok(tr.mode === 'tour' && !tr.pilot && !tr.avail && !tr.obs, 'replay: 관망 stops, cannot start, its button is hidden', tr);
    // (M3) R1 「손가락으로 화면을 끌어 봐요」 with a REAL drag: R1 waits for the finger to lift, then R2 frames its place and
    //  moves on by itself (before, the drag still under the finger let go of the camera and stopped the auto-advance)
    await page.evaluate(() => { const o = window.__FV.scene.onboard; o.next(); window.__step.run(0.3); });
    {
      const cdp = await ctx.newCDPSession(page);
      const H = await page.evaluate(() => window.__FV.game.scene.getScene('UI').H);
      const p0 = await css(page, 430, H - 700), p1 = await css(page, 360, H - 740);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p0.x, y: p0.y, id: 5 }] });
      await page.evaluate(() => window.__step.run(2 / 60));
      for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p0.x + (p1.x - p0.x) * i / 6, y: p0.y + (p1.y - p0.y) * i / 6, id: 5 }] }); await page.evaluate(() => window.__step.run(1 / 60)); }
      const held = await page.evaluate(() => { window.__step.run(0.8); const o = window.__FV.scene.onboard; return { tourI: o.tourI, joy: window.__FV.game.scene.getScene('UI').joyBase.visible }; });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      const r2 = await page.evaluate(() => { window.__step.run(0.4); const o = window.__FV.scene.onboard, ui = window.__FV.game.scene.getScene('UI'); return { tourI: o.tourI, cam: !!(o.camHeld && window.__FV.scene.camFocus), hold: o.tourHold, edge: ui.edge.visible }; });
      const r3 = await page.evaluate(() => { window.__step.run(5.6); return window.__FV.scene.onboard.tourI; });
      ok(held.joy && held.tourI === 1 && r2.tourI === 2 && r2.cam && !r2.hold && r3 === 3, 'tour R1 with a real drag: R1 waits for the lift, R2 holds the camera on its place and moves on by itself', { held, r2, r3 });
      ok(!r2.edge, 'no edge arrow toward the live goal during the tour', r2);
    }
    await page.evaluate(() => window.__step.run(1.2));
    await shot(page, 'tour_place');
    const auto = await page.evaluate(() => { const gs = window.__FV.scene; let on = 0; for (let i = 0; i < 40; i++) { window.__step.run(0.5); if (gs.v42.pilot.on || gs.v42.pilot.countdown > 0) on++; } return on; });
    ok(auto === 0, 'no 관망 auto-start during the tour', auto);
    const sk = await page.evaluate(() => { const ov = window.__FV.game.scene.getScene('UI').onboardOv; return ov.tourSkip.visible ? { x: ov.tourSkip.x, y: ov.tourSkip.y } : null; });
    ok(!!sk, "the tour's 「건너뛰기」 button is on screen");
    if (sk) await tapAt(page, sk.x, sk.y);
    await page.evaluate(() => { window.__FV_PILOT_AUTO = false; window.__step.run(0.3); });
    const end = await page.evaluate(() => { const gs = window.__FV.scene, ui = window.__FV.game.scene.getScene('UI'), ov = ui.onboardOv; return { mode: gs.onboard.mode, cam: !!gs.camFocus, any: ov.cardC.visible || ov.fingers.some((f) => f.visible) || ov.tipC.visible || ov.nextBtn.visible || !!(gs.onboard.ring && gs.onboard.ring.visible), avail: gs.v42.pilot.available, json: JSON.stringify({ c: gs.economy.coins, d: gs.progress.done }) }; });
    ok(end.mode === 'off' && !end.any && !end.cam && end.avail, '「건너뛰기」 ends the tour: nothing left, the camera free, 관망 available again', end);
    const bj = JSON.parse(before), ej = JSON.parse(end.json);
    ok(JSON.stringify(ej.d) === JSON.stringify(bj.d) && ej.c >= bj.c, 'the tour bought nothing and changed no progress (the late village keeps earning meanwhile)', { before: bj.c, after: ej.c });
    ok(log.errors.length === 0, 'D late: 0 page errors', log.errors.slice(0, 5));
    await ctx.close();
  }
  for (const f of ['v41_save_smart_46min.json', 'v35_save_0_5min.json']) {
    const { page, ctx, log } = await boot({ viewport: { width: 390, height: 844 }, save: fs.readFileSync(path.join(FIX, f), 'utf8') });
    await advance(page, 2);
    const s = await st(page);
    const sv = await page.evaluate(() => { window.__FV.save(); return JSON.parse(localStorage.getItem('frostVillage.save.v1')); });
    ok(s.mode === 'off' && s.bits === 0 && sv.onb === undefined && log.errors.length === 0, f + ': no tutorial, no `onb`, 0 errors', { mode: s.mode, onb: sv.onb, errors: log.errors.slice(0, 3) });
    await ctx.close();
  }
  // (L1) an existing player whose save is there but cannot be used (cut off / from a newer build) is not a new player
  for (const [name, save] of [['a cut-off save', '{"v":7,"t":1,"coins":120,"progress":{"done":["hire_clerk_mark'], ['a save from a newer build', JSON.stringify({ v: 99, t: 1, coins: 5000 })]]) {
    const { page, ctx, log } = await boot({ viewport: { width: 390, height: 844 }, save });
    await advance(page, 2);
    const s = await st(page);
    ok(s.mode === 'off' && s.bits === 0 && log.errors.length === 0, name + ': no first-run tutorial (an existing player), 0 errors', { mode: s.mode, bits: s.bits, errors: log.errors.slice(0, 3) });
    await ctx.close();
  }
  // ================================================================== E: no ui7 atlas (a failed fetch, an old cache)
  console.log('— E: without the ui7 atlas (the drawn stand-in finger)');
  {
    const { page, ctx, log } = await boot({ viewport: { width: 360, height: 640 }, init2: true });
    await advance(page, 4);
    const s = await st(page);
    const f = await page.evaluate(() => { const ov = window.__FV.game.scene.getScene('UI').onboardOv; return { real: ov.realFinger, key: ov.fingers[0].texture.key, vis: ov.fingers[0].visible, has: window.__FV.assets().has('ui_finger') }; });
    ok(!f.has && !f.real && f.key === 'fv_finger' && s.step === 'move' && s.rects && s.rects.finger, 'without ui7 the S1 demo still shows a (drawn) finger', f);
    await shot(page, 'fallback_finger');
    ok(log.errors.length === 0, 'E: 0 page errors', log.errors.slice(0, 5));
    await ctx.close();
  }
  {
    const { page, ctx, log } = await boot({ viewport: { width: 390, height: 844 }, flag: false });
    await advance(page, 3);
    const s = await st(page);
    const sv = await page.evaluate(() => { window.__FV.save(); return JSON.parse(localStorage.getItem('frostVillage.save.v1')); });
    ok(s.mode === 'off' && s.bits === 0 && sv.onb === undefined && log.errors.length === 0, 'an automated browser without the flag (every other suite): a new game has no tutorial', { mode: s.mode, bits: s.bits });
    await ctx.close();
  }
} catch (e) { fail++; console.log('FATAL', (e && e.stack) || e); }
console.log(`\n${pass} passed, ${fail} failed  (wall ${((Date.now() - t0) / 1000) | 0}s)`);
await browser.close();
await srv.close();
process.exit(fail ? 1 : 0);
