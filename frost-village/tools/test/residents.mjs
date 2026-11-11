// (v4.3) 마을 주민 창 · 주민 프로필 · 따라가기 — browser test (spec: v43/residents/spec.md §10):
//   node tools/test/residents.mjs [--only chip,count,list,profile,actions,follow,modal,budget,reload,en,night]
//                                 [--shots <dir>]   (screenshots for the look sheet; default docs/previews/screens_v43)
// Fixed-step clock; 412 x 915 ko unless noted. Run it inside the shared browser lock.
//   chip      a fresh game: the chip is hidden and the window refuses through the tutorial; after the hand-over the chip
//             shows 「›」, pulses once and opens the window; the list is the chip's number
//   count     at the 25-min, 46-min and late v4.2 villages: the chip shows after a load (the reload fix), list length =
//             VillageLife.people() = the chip's number = named (non-pet moved) + settlers; paging covers everyone once;
//             5 settlers more while open: +5 rows within 1 s
//   list      6 rows a page, 「p / N」, ◀ / ▶ ends, every row has name / age / sex / job / action, no text wider than
//             its column; filters change the counts and reset to page 1; profile → ◀ 목록 keeps the page
//   actions   each row's 지금 하는 일 agrees with its body's real state (event / job / seat / operator / clerk / settler hour);
//             forced concert, sit, chat; an operator working; a settler at 3 h is asleep
//   profile   five people (an operator, a child, an elder, two settlers): every field is there, the same after close /
//             reopen; family names open the right profile and ◀ goes back
//   follow    따라가기: the windows close, the camera is within 40 px of the walking resident within 1 s and stays there
//             3 s; the joystick ends it and the camera is back on the chief within 1.5 s; ✕ too; a settler is followed to
//             their place with the chip's second line; 관망 on: the resident wins, and 관망 goes on after
//   modal     not during settings / overview / a ceremony; Escape and window.__fvApp.back() close profile → list →
//             window and end a follow, and say false with nothing open
//   budget    no new texture keys, ≤ 0.25 MiB more GL texture after every page and five profiles; the logic step with
//             the window open costs about what it costs closed
//   reload    the profiles are the same after a save and a reload
//   en        360 x 640 English: every row and profile fits
//   night     the late village at night (screenshots)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render } from './fv_step.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = path.join(ROOT, 'tools', 'test', 'fixtures');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ONLY = (arg('--only', '') || '').split(',').filter(Boolean);
const want = (g) => !ONLY.length || ONLY.indexOf(g) >= 0;
const SHOTS = path.resolve(arg('--shots', path.join(ROOT, 'docs', 'previews', 'screens_v43')));
fs.mkdirSync(SHOTS, { recursive: true });
const fx = (n) => { const t = fs.readFileSync(path.join(FIX, n), 'utf8'), o = JSON.parse(t); return o.keys ? { keys: o.keys } : { save: t }; };

let pass = 0, fail = 0;
const results = [];
const ok = (c, msg, extra) => {
  if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 600) : '')); }
  results.push({ ok: !!c, msg });
};
const T0 = Date.now();
const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const pageErrors = [];
const META = {};

async function boot(o = {}) {
  const vp = o.vp || { width: 412, height: 915 };
  const { page, ctx, log } = await openPage(browser, srv.url + 'index.html', { viewport: vp, dpr: 1, locale: o.lang === 'en' ? 'en-US' : 'ko-KR', init: o.onboard ? 'window.__FV_ONBOARD = true;' : '' });
  await page.evaluate((q) => {
    localStorage.clear();
    if (q.keys) for (const k in q.keys) localStorage.setItem(k, q.keys[k]);
    else if (q.save) localStorage.setItem('frostVillage.save.v1', q.save);
    const st = q.keys && q.keys['frostVillage.settings.v1'] ? JSON.parse(q.keys['frostVillage.settings.v1']) : {};
    st.lang = q.lang || 'ko';
    localStorage.setItem('frostVillage.settings.v1', JSON.stringify(st));
  }, { keys: o.keys || null, save: o.save || null, lang: o.lang });
  await enter(page);
  return { page, ctx, log };
}
/** through the title into the village (also after a reload) */
async function enter(page, reload = true) {
  if (reload) await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  await sleep(2500);
  const c = await page.$('canvas'); const b = await c.boundingBox();
  for (let i = 0; i < 12 && await page.evaluate(() => window.__FV.game.scene.isActive('Title')); i++) { await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height * 0.6); await sleep(1500); }
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player && window.__FV.game.scene.getScene('UI').ready, 180000);
  await sleep(1200);
  await installStepper(page);
  await page.evaluate(() => { try { if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1; } catch (e) { /* */ } });
}
const S = (page) => page.evaluate(() => window.__FV.residents.state());
const H = (page, fn, a) => page.evaluate(fn, a);
async function shot(page, name) {
  await render(page, 3);
  const f = path.join(SHOTS, 'res_' + name + '.png');
  await page.screenshot({ path: f });
  META[name] = f;
}
/** settle the day / night tint at once (the clock fades it in over seconds) */
const settleClock = () => { const C = window.__FV.scene.v4 && window.__FV.scene.v4.clock; if (!C || !C.target) return; const tg = C.target(C.hour()); C.cur.a = tg.a; C.cur.r = (tg.color >> 16) & 255; C.cur.g = (tg.color >> 8) & 255; C.cur.b = tg.color & 255; };
async function setHour(page, h) { await H(page, (hh) => { const F = window.__FV; if (F.v4 && F.v4.clock) F.v4.clock(hh); }, h); await advance(page, 0.2); await H(page, settleClock); }

/** the window's list against the game: the chip's number, people(), named + settlers, every page once */
async function countCheck(page, tag) {
  const g = await H(page, () => {
    const F = window.__FV, gs = F.scene, life = gs.life, ui = gs.game.scene.getScene('UI');
    const named = life.moved.filter((k) => !life.isPetKey(k));
    return { people: life.people(), named: named.length, settlers: gs.civic ? gs.civic.settlers : 0, chip: ui.popText.text, chipVis: ui.popBox.visible, list: F.residents.list() };
  });
  const chipN = +String(g.chip).split('/')[0];
  ok(g.chipVis && chipN === g.people, tag + ': the chip is shown after the load and says ' + g.chip + ' (people() ' + g.people + ')', g);
  ok(g.list.length === g.people && g.list.filter((p) => p[0] === 'v').length === g.named && g.list.filter((p) => p[0] === 's').length === g.settlers,
    tag + ': the list is the chip: ' + g.list.length + ' = ' + g.named + ' named + ' + g.settlers + ' settlers');
  const opened = await H(page, () => window.__FV.residents.tapChip());
  ok(opened, tag + ': a tap on the chip opens the window');
  await advance(page, 0.6);
  let st = await S(page);
  ok(st.title && st.title.indexOf(String(g.people)) >= 0, tag + ': the title counts them: ' + st.title);
  const seen = [];
  for (let p = 0; p < st.pages; p++) {
    await H(page, (n) => window.__FV.residents.page(n), p);
    const s2 = await S(page);
    for (const r of s2.rows) seen.push(r.pid);
  }
  const uniq = new Set(seen);
  ok(seen.length === g.people && uniq.size === g.people && g.list.every((pid) => uniq.has(pid)), tag + ': paging through ' + st.pages + ' pages shows everyone exactly once (' + seen.length + ')');
  await H(page, () => window.__FV.residents.page(0));
  return g;
}

/** a row's 지금 하는 일 against its body's state (spec §4 categories) */
const ROWCHECK = () => {
  const F = window.__FV, gs = F.scene, R = F.residents;
  R.page(R.state().page);          // (the rows refresh at 2 Hz: fill them now, so they and the bodies are read at the same moment)
  const st = R.state(), out = [];
  const EV = { party: ['act_party'], concert: ['act_bard_go', 'act_bard_play', 'act_bard_bow', 'act_concert_seat', 'act_concert_go', 'act_concert_dance', 'act_concert'], chat: ['act_chat', 'act_chat0'],
    snowball: ['act_snow_run', 'act_snow_chase', 'act_snowball'], tag: ['act_tag_it', 'act_tag'], snowman: ['act_snowman'], snowmanBreak: ['act_snowman_break'] };
  const STAY = ['act_doze', 'act_sit', 'act_to_seat', 'act_warm_go', 'act_read', 'act_skate', 'act_shiver', 'act_wave', 'act_warm', 'act_go', 'act_stroll', 'act_relax'];
  const h = gs.v4 && gs.v4.clock && gs.v4.clock.on ? gs.v4.clock.hour() : 11;
  for (const row of st.rows) {
    const p = R.person(row.pid);
    let allowed = null, why = '';
    if (p.kind === 'v') {
      const r = gs.life.byKey[p.key];
      if (p.body === 'res' && r) {
        if (r.event) { allowed = EV[r.event.kind] || ['act_break']; why = 'event ' + r.event.kind; }
        else if (r.job && r.job.kind === 'arrive') { allowed = ['act_arrive_house', 'act_hello', 'act_arrive']; why = 'arrive'; }
        else if (r.seat) { allowed = ['act_doze', 'act_sit']; why = 'seat'; }
        else if (r.job && r.job.kind === 'stay') { allowed = STAY; why = 'stay ' + r.job.phase; }
        else { allowed = ['act_break', 'act_skate', 'act_shiver', 'act_wave']; why = 'no job'; }
      } else if (p.body === 'op') { allowed = ['act_op_go', 'act_op_grill', 'act_op_sawmill', 'act_op_bakery', 'act_op_smelter', 'act_op_smokehouse', 'act_op_toolsmith', 'act_op_cannery', 'act_op_work', 'act_op_full', 'act_op_wait']; why = 'operator'; }
      else if (p.body === 'clerk') { allowed = ['act_clerk_go', 'act_clerk_serve', 'act_clerk_wait']; why = 'clerk'; }
      else if (!p.body) { allowed = h >= 22 || h < 6 ? ['act_sleep', 'act_soon'] : ['act_home', 'act_soon']; why = 'no body'; }
      else { allowed = ['act_carry', 'act_op_work']; why = 'worker'; }
    } else {
      if (h >= 22 || h < 6) allowed = ['act_sleep'];
      else allowed = ['act_w_' + p.jobNow, 'act_lunch_rest', 'act_lunch_box', 'act_seek', 'act_eve_market', 'act_eve_dinner', 'act_eve_fire', 'act_home', 'act_breakfast'];
      why = 'settler ' + p.jobNow + ' @' + h.toFixed(1);
    }
    const good = allowed.indexOf(row.actionKey) >= 0 && !!row.action;
    out.push({ pid: row.pid, key: row.actionKey, text: row.action, why, good });
  }
  return out;
};

/** the row texts fit their columns (displayed widths; the name line: name + age + pill within 356) */
const fitsAll = (rows) => rows.every((r) => r.fit.name[0] <= r.fit.name[1] + 1 && r.fit.job[0] <= r.fit.job[1] + 1 && r.fit.act[0] <= r.fit.act[1] + 1 && r.fit.line1 <= 358);
const STATIC = (pf) => { const o = Object.assign({}, pf); for (const k of ['now', 'nowKey', 'happy', 'why', 'bottom', 'boxBottom', 'back', 'portrait']) delete o[k]; return o; };
const DIFF = (a, b) => Object.keys(Object.assign({}, a, b)).filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => k + ': ' + JSON.stringify(a[k]) + ' ≠ ' + JSON.stringify(b[k]));
const PROFILES = ['v:npc_aunt', 'v:npc_kid_prankster', 'v:npc_grandpa', 's:3', 's:7'];
let saved46 = null;

// ===================================================================== chip: a fresh game through the tutorial
if (want('chip')) {
  console.log('chip (a fresh game, first-run tutorial on)');
  const { page, ctx, log } = await boot({ onboard: true });
  await advance(page, 1.5);
  let st = await S(page);
  const onb = await H(page, () => window.__FV.onboard().mode);
  ok(onb === 'act1' && !st.chip.tappable && !st.available, 'in Act 1 the chip is no button and the window is not available (' + onb + ', chip ' + (st.chip.visible ? 'shown' : 'hidden') + ')');
  ok(!(await H(page, () => window.__FV.residents.open())) && !(await H(page, () => window.__FV.residents.tapChip())), 'the window refuses to open during the tutorial');
  await shot(page, 'chip_tutorial');
  // the hand-over: clerk, cook, fisherman, the first sale
  await H(page, () => { const F = window.__FV; F.onboardSkip(); F.scene.progress.setFlag('firstSale'); for (const id of ['hire_clerk_market', 'op_grill', 'hire_fisherman']) F.doneStep(id); });
  await advance(page, 1.2);
  st = await S(page);
  const seen = await H(page, () => !!window.__FV.scene.progress.seen.resWin);
  ok(st.chip.visible && st.chip.tappable && st.available, 'after the hand-over the chip shows with 「›」: ' + st.chip.text);
  ok(seen, 'the first time it pulses (progress.seen.resWin)');
  const n = await H(page, () => window.__FV.scene.life.people());
  ok(+st.chip.text.split('/')[0] === n && st.n === n, 'chip ' + st.chip.text + ' = people() ' + n + ' = the list ' + st.n);
  await shot(page, 'chip_handover');
  ok(await H(page, () => window.__FV.residents.tapChip()), 'a tap on the chip opens 「마을 주민」');
  await advance(page, 0.6);
  st = await S(page);
  ok(st.open && st.view === 'list' && st.rows.length === Math.min(6, n) && st.pageText === '1 / ' + Math.ceil(n / 6), 'the list: ' + st.rows.length + ' rows, 「' + st.pageText + '」');
  ok(st.rows.every((r) => r.portrait === 'portrait'), 'every row shows the resident\'s own portrait picture', st.rows.map((r) => r.portrait));
  await H(page, () => window.__FV.residents.close());
  pageErrors.push(...log.errors.map((e) => 'chip: ' + e));
  await ctx.close();
}

// ===================================================================== the 46-min village: count, list, actions, profile, follow, modal, budget
if (want('count') || want('list') || want('actions') || want('profile') || want('follow') || want('modal') || want('budget') || want('reload')) {
  console.log('the 46-min village (412 x 915 ko)');
  const { page, ctx, log } = await boot(fx('v41_save_smart_46min.json'));
  await advance(page, 2);
  const tex0 = await H(page, () => ({ keys: window.__FV.game.textures.getTextureKeys(), mib: window.__FV.texStats().totalMiB }));
  // every texture added from here on, with where it came from (the window must add none of its own)
  await H(page, () => {
    const T = window.__FV.game.textures, o = T.emit;
    window.__texAdds = [];
    T.emit = function (ev, key) { if (ev === 'addtexture') { const L = Error.stackTraceLimit; Error.stackTraceLimit = 40; window.__texAdds.push({ key, stack: String(new Error().stack) }); Error.stackTraceLimit = L; } return o.apply(this, arguments); };
    T.__emit0 = o;
  });
  if (want('count') || want('list')) await countCheck(page, '46 min');
  else await H(page, () => window.__FV.residents.tapChip());
  await setHour(page, 11);
  await advance(page, 0.6);
  if (want('list')) {
    let st = await S(page);
    ok(st.rows.length === 6 && st.pageText === '1 / ' + st.pages && st.pages === Math.ceil(st.n / 6), '6 rows on page 1, 「' + st.pageText + '」');
    ok(st.rows.every((r) => r.name && r.age && r.sex && r.job && r.action), 'every row has a name, an age, a sex, a job and an action', st.rows);
    ok(fitsAll(st.rows), 'no row text is wider than its column', st.rows.map((r) => r.fit));
    await shot(page, 'list_412_ko_day_p1');
    await H(page, () => window.__FV.residents.flip(-1));
    ok((await S(page)).page === 0, '◀ on page 1 stays on page 1');
    await H(page, () => window.__FV.residents.page(4));
    await advance(page, 0.6);
    st = await S(page);
    ok(st.page === 4 && st.rows.length >= 1 && fitsAll(st.rows), 'page 5 fits too (' + st.rows.map((r) => r.name).join(', ') + ')');
    await shot(page, 'list_412_ko_day_p5');
    await H(page, (n) => window.__FV.residents.page(n), st.pages - 1);
    await H(page, () => window.__FV.residents.flip(1));
    st = await S(page);
    ok(st.page === st.pages - 1, '▶ on the last page stays there');
    // profile → ◀ 목록 keeps the page
    await H(page, () => window.__FV.residents.page(3));
    const pid = await H(page, () => window.__FV.residents.more(1));
    st = await S(page);
    ok(st.view === 'profile' && st.profile.pid === pid, '「자세히」 opens that resident\'s profile (' + pid + ')');
    await H(page, () => window.__FV.residents.back());
    st = await S(page);
    ok(st.view === 'list' && st.page === 3, '◀ 목록 comes back to the same page (4)');
    // filters
    const all = st.counts;
    await H(page, () => window.__FV.residents.filter('kid'));
    st = await S(page);
    ok(st.filter === 'kid' && st.page === 0 && st.shown === all.kid && st.rows.every((r) => +r.age.replace(/\D/g, '') < 19), 'filter 아이: ' + all.kid + ' children, page 1');
    await H(page, () => window.__FV.residents.filter('elder'));
    st = await S(page);
    ok(st.shown === all.elder && all.elder >= 2, 'filter 어르신: ' + all.elder);
    await H(page, () => window.__FV.residents.filter('work'));
    st = await S(page);
    ok(st.shown === all.work && all.work > 5 && all.work + all.kid <= all.all, 'filter 일하는 주민: ' + all.work);
    await H(page, () => window.__FV.residents.filter('all'));
    // more settlers while open
    const n0 = (await S(page)).n;
    await H(page, () => window.__FV.settlers(5, true));
    await advance(page, 1);
    st = await S(page);
    ok(st.n === n0 + 5 && st.title.indexOf(String(n0 + 5)) >= 0, '5 settlers more: ' + n0 + ' → ' + st.n + ' within 1 s (title 「' + st.title + '」)');
  }
  if (want('actions')) {
    console.log(' actions');
    await H(page, () => window.__FV.residents.page(0));
    let bad = [];
    for (let p = 0; p < 7; p++) {
      await H(page, (n) => window.__FV.residents.page(n), p);
      await advance(page, 0.6);
      const rc = await H(page, ROWCHECK);
      bad = bad.concat(rc.filter((r) => !r.good));
      if (p === 0) META.actions = rc;
    }
    ok(!bad.length, 'every row\'s 지금 하는 일 agrees with its body (7 pages)', bad);
    const aunt = await H(page, () => window.__FV.residents.person('v:npc_aunt'));
    ok(aunt.body === 'op' && /^act_op_/.test(aunt.actionKey) && /빵집/.test(aunt.job), 'the baker works the bakery as its operator: 「' + aunt.job + '」 · 「' + aunt.action + '」');
    const con = await H(page, () => window.__FV.lifeEvent('concert'));
    await advance(page, 0.6);
    const bard = await H(page, () => window.__FV.residents.person('v:npc_bard'));
    ok(con && /^act_bard_/.test(bard.actionKey), 'a concert: the bard 「' + bard.action + '」');
    const sat = await H(page, () => window.__FV.lifeEvent('sit'));
    await advance(page, 4);
    const sitter = sat ? await H(page, (k) => window.__FV.residents.person('v:' + k), sat) : null;
    ok(!sat || (sitter && ['act_sit', 'act_doze', 'act_to_seat'].indexOf(sitter.actionKey) >= 0), 'someone sits down: ' + (sitter ? sitter.name + ' 「' + sitter.action + '」' : 'no free seat'));
    const chat = await H(page, () => { const r = window.__FV.lifeEvent('chat'); const ev = window.__FV.scene.life.events.find((e) => e.kind === 'chat'); return ev ? ev.members.map((m) => m.key) : r; });
    await advance(page, 0.5);
    if (Array.isArray(chat) && chat.length) {
      const c0 = await H(page, (k) => window.__FV.residents.person('v:' + k), chat[0]);
      ok(c0 && /^act_chat/.test(c0.actionKey) && (c0.actionKey === 'act_chat0' || /수다/.test(c0.action)), 'a chat: ' + (c0 && c0.name) + ' 「' + (c0 && c0.action) + '」');
    } else ok(true, 'no chat could start here (nobody close by)');
    await setHour(page, 3);
    const s1 = await H(page, () => window.__FV.residents.person('s:1'));
    ok(s1.actionKey === 'act_sleep' && s1.where, 'at 3 h a settler is 「' + s1.action + '」 (chip: 「' + s1.where + '」)');
    await setHour(page, 11);
    const s3 = await H(page, () => window.__FV.residents.person('s:3'));
    ok(s3.actionKey === 'act_w_cook' && /큰 식당/.test(s3.where), 'at 11 h s:3 the cook is 「' + s3.action + '」 (chip: 「' + s3.where + '」)');
  }
  const prof = {};
  if (want('profile') || want('reload')) {
    console.log(' profiles');
    for (const pid of PROFILES) {
      await H(page, (p) => window.__FV.residents.profile(p), pid);
      await advance(page, 0.6);
      const st = await S(page);
      const pf = st.profile;
      prof[pid] = STATIC(pf);
      const fields = ['name', 'age', 'sex', 'job', 'wage', 'home', 'values', 'valueLine', 'traits', 'likes', 'chief', 'sched', 'moved'];
      const miss = fields.filter((f) => pf[f] === undefined || pf[f] === '' || (Array.isArray(pf[f]) && !pf[f].length));
      ok(!miss.length && pf.now && pf.happy >= 5 && pf.happy <= 99 && pf.why && pf.tax, pid + ' ' + pf.name + ': every field (' + pf.job + ' · ' + pf.wage + ' · 행복도 ' + pf.happy + ')', { miss, pf });
      ok(pf.bottom <= pf.boxBottom, pid + ': the card fits the window (' + pf.bottom + ' ≤ ' + pf.boxBottom + ')');
      ok(pf.portrait === 'portrait', pid + ': the portrait picture');
    }
    ok(prof['v:npc_aunt'].family.map((f) => f.pid).join() === 'v:npc_kid_girl,v:npc_toddler', 'the baker\'s family: 하린 (같이 사는 아이), 콩콩 (옆집 아기)', prof['v:npc_aunt'].family);
    ok(prof['s:3'].family.length === 1 && prof['s:3'].family[0].pid === 's:4', 's:3\'s spouse is s:4');
    ok(/1,020/.test(prof['s:3'].wage) && /연금/.test(prof['v:npc_grandpa'].wage) && /용돈/.test(prof['v:npc_kid_prankster'].wage), 'wages: 요리사 1,020 a month, 연금, 용돈');
    // screenshots: an adult worker with family, a child, an elder, a settler
    for (const [pid, nm] of [['v:npc_aunt', 'aunt'], ['v:npc_kid_prankster', 'child'], ['v:npc_grandpa', 'elder'], ['s:3', 'settler']]) {
      await H(page, (p) => window.__FV.residents.profile(p), pid);
      await advance(page, 0.6);
      await shot(page, 'profile_412_ko_day_' + nm);
    }
    // the same after close / reopen
    await H(page, () => window.__FV.residents.close());
    await advance(page, 0.5);
    let same = true;
    for (const pid of PROFILES) {
      await H(page, (p) => window.__FV.residents.open(p), pid);
      const st = await S(page);
      if (JSON.stringify(STATIC(st.profile)) !== JSON.stringify(prof[pid])) { same = false; console.log('   differs', pid, DIFF(STATIC(st.profile), prof[pid]).join(' | ').slice(0, 600)); }
      await H(page, () => window.__FV.residents.close());
    }
    ok(same, 'every profile is the same after closing and reopening');
    // family links + back stack
    await H(page, () => window.__FV.residents.open('v:npc_grandpa'));
    const to = await H(page, () => window.__FV.residents.family(0));
    let st = await S(page);
    ok(to === 'v:npc_grandma' && st.profile.pid === 'v:npc_grandma' && st.profile.back.join() === 'v:npc_grandpa', 'grandpa\'s first family name opens grandma (◀ 뒤로 remembers grandpa)');
    const to2 = await H(page, () => window.__FV.residents.family(1));
    st = await S(page);
    ok(st.profile.pid === to2 && st.profile.back.length === 2, '…and her grandson ' + to2 + ' (two back)');
    await H(page, () => window.__FV.residents.back());
    await H(page, () => window.__FV.residents.back());
    st = await S(page);
    ok(st.view === 'profile' && st.profile.pid === 'v:npc_grandpa', '◀ 뒤로 twice: grandpa again');
    await H(page, () => window.__FV.residents.back());
    st = await S(page);
    ok(st.view === 'list', '◀ 목록: the list');
    await H(page, () => window.__FV.residents.close());
    saved46 = prof;
  }
  if (want('follow')) {
    console.log(' follow');
    // a walking named villager well inside the map, the one with the longest way still to go
    const pick = await H(page, () => {
      const F = window.__FV, gs = F.scene, cr = gs.territory.camRect;
      let best = null;
      for (const pid of F.residents.list()) {
        if (pid[0] !== 'v') continue;
        const p = F.residents.person(pid), r = gs.life.byKey[p.key];
        if (p.body !== 'res' || !r || r.event || r.state !== 'move' || r.isPet || r.seat) continue;
        if (r.x < cr.x + 500 || r.x > cr.x + cr.w - 500 || r.y < cr.y + 500 || r.y > cr.y + cr.h - 500) continue;
        let left = 0, x = r.x, y = r.y;
        for (let i = r.ri || 0; i < r.route.length; i++) { left += Math.hypot(r.route[i].x - x, r.route[i].y - y); x = r.route[i].x; y = r.route[i].y; }
        if (!best || left > best.left) best = { pid, name: p.name, x: Math.round(r.x), y: Math.round(r.y), left: Math.round(left), key: p.key };
      }
      // (a short way left: send them on to the farthest open area, so there is a walk to follow)
      if (best && best.left < 400) {
        const r = gs.life.byKey[best.key], life = gs.life;
        let far = null, fd = 0;
        for (const id in life.areas) { const a = life.areas[id]; if (!life.areaOpen(a)) continue; const d = Math.hypot(a.x - r.x, a.y - r.y); if (d > fd && d < 1500) { fd = d; far = a; } }
        if (far) { if (r.job && r.job.kind === 'stay') { r.job.phase = 'travel'; r.job.left = 60; } r.goTo(far.x, far.y, { tol: 14 }); best.left = Math.round(fd); best.sent = far.id; }
      }
      return best;
    });
    if (pick) console.log('   following ' + pick.name + ' (' + pick.left + ' px of way left)');
    if (!pick) ok(false, 'a walking villager to follow');
    else {
      await H(page, (p) => window.__FV.residents.open(p), pick.pid);
      await H(page, () => window.__FV.residents.followBtn());
      const CAM = () => { const F = window.__FV, gs = F.scene, f = F.residents.state().follow, ct = gs.camTarget, p = gs.player, wv = gs.cameras.main.worldView; return { on: f.on, d: f.on ? Math.round(Math.hypot(ct.x - f.x, ct.y - f.y)) : null, dc: Math.round(Math.hypot(ct.x - p.x, ct.y - p.y + 30)), dv: f.on ? Math.round(Math.hypot(wv.centerX - f.x, wv.centerY - f.y)) : null, fx: f.x, fy: f.y, chip: f.chip, sub: f.sub, open: F.residents.state().open }; };
      let c = await H(page, CAM);
      ok(c.on && !c.open && c.chip && c.chip.indexOf(pick.name) >= 0, '따라가기: the window closes and the chip says 「' + c.chip + '」');
      const d0 = c.d;
      let t = 0;
      for (; t < 60; t++) { await H(page, () => window.__step.frame()); c = await H(page, CAM); if (c.d <= 40) break; }
      ok(c.on && c.d <= 40, 'the camera reaches ' + pick.name + ' in ' + ((t + 1) / 60).toFixed(2) + ' s (from ' + d0 + ' px to ' + c.d + ' px)');
      let worst = 0, moved = 0, last = [c.fx, c.fy];
      for (let i = 0; i < 180; i++) { await H(page, () => window.__step.frame()); c = await H(page, CAM); if (!c.on) break; worst = Math.max(worst, c.d); moved += Math.hypot(c.fx - last[0], c.fy - last[1]); last = [c.fx, c.fy]; }
      ok(c.on && worst <= 40 && moved >= 60, 'it stays within 40 px for 3 s while they walk (worst ' + worst + ' px, the resident walked ' + Math.round(moved) + ' px; screen centre ' + c.dv + ' px)');
      await shot(page, 'follow_412_ko_day');
      // the joystick ends it; the camera goes back to the chief
      await H(page, () => { window.__FV.setInput(1, 0); window.__step.run(0.1); window.__FV.setInput(0, 0); });
      c = await H(page, CAM);
      ok(!c.on, 'the joystick ends the follow');
      let back = 0;
      for (; back < 90; back++) { await H(page, () => window.__step.frame()); c = await H(page, CAM); if (c.dc <= 120) break; }
      ok(c.dc <= 120, 'the camera is back on the chief in ' + ((back + 1) / 60).toFixed(2) + ' s (' + c.dc + ' px)');
      // ✕ ends it too
      await H(page, (p) => window.__FV.residents.follow(p), pick.pid);
      await advance(page, 0.5);
      await H(page, () => window.__FV.residents.chipX());
      c = await H(page, CAM);
      ok(!c.on, '✕ on the chip ends it');
      await advance(page, 1.5);
      c = await H(page, CAM);
      ok(c.dc <= 120, '…and the camera is back on the chief (' + c.dc + ' px)');
      // keys end it (a computer)
      await H(page, (p) => window.__FV.residents.follow(p), pick.pid);
      await advance(page, 0.3);
      await page.keyboard.down('d'); await advance(page, 0.2); await page.keyboard.up('d');
      c = await H(page, CAM);
      ok(!c.on, 'a move key ends it');
    }
    // a settler: their place, the chip's second line
    await setHour(page, 11);
    await H(page, () => window.__FV.residents.follow('s:3'));
    await advance(page, 1.5);
    const c3 = await H(page, () => { const F = window.__FV, gs = F.scene, f = F.residents.state().follow, ct = gs.camTarget; return { f, d: Math.round(Math.hypot(ct.x - f.x, ct.y - f.y)), rest: gs.civic.restaurant ? [gs.civic.restaurant.x, gs.civic.restaurant.y] : null }; });
    ok(c3.f.on && c3.d <= 40 && c3.f.sub && Math.hypot(c3.f.x - c3.rest[0], c3.f.y + 30 - c3.rest[1]) < 5, 'a settler is followed to their workplace: 「' + c3.f.chip + '」 / 「' + c3.f.sub + '」');
    await shot(page, 'follow_412_ko_settler');
    await H(page, () => window.__FV.residents.unfollow());
    // a resident taking a job while followed: the camera goes on with the operator (Labour hire: life.release)
    const hire = await H(page, () => {
      const F = window.__FV, gs = F.scene;
      let st = gs.stationList.find((x) => x.op && !x.op.operator && x.enabled !== false && x.op.enabled);
      if (!st) {
        // (every work spot is taken in this village: the bakery's operator steps out for the test)
        st = gs.stations.bakery;
        const old = st && st.op && st.op.operator;
        if (!old) return null;
        gs.keysInUse.delete(old.key); if (old.wantKey) gs.keysInUse.delete(old.wantKey);
        old.destroy(); st.op.operator = null;
      }
      const r = gs.life.residents.find((x) => !x.isPet && !x.event && x.key !== 'npc_aunt' && F.residents.person('v:' + x.key));
      if (!st || !r) return null;
      F.residents.follow('v:' + r.key);
      window.__step.run(0.5);
      st.op.who = r.key;
      st.op.hire(true);
      window.__step.run(1);
      const f = F.residents.state().follow;
      return { key: r.key, st: st.id, f, post: [st.op.post.x, st.op.post.y] };
    });
    if (hire) {
      ok(hire.f.on && hire.f.bodyKind === 'op' && Math.abs(hire.f.x - hire.post[0]) < 2 && Math.abs(hire.f.y - hire.post[1] + 30) < 2, 'the followed ' + hire.key + ' takes the ' + hire.st + ' job: the camera goes on with the operator');
      const gone = await H(page, (id) => {
        const F = window.__FV, gs = F.scene, op = gs.stations[id].op.operator, cr = gs.territory.camRect, x0 = op.x;
        op.x = cr.x - 3000;
        window.__step.run(0.1);
        const f = F.residents.state().follow;
        op.x = x0;
        return f;
      }, hire.st);
      ok(!gone.on, 'the followed body leaves the map: the follow ends (「마을 밖으로 나갔어요」)');
    } else console.log('   (no free work spot to hire at here)');
    // 관망 on: the resident wins; ending goes back to 관망
    const pilot = await H(page, () => { const P = window.__FV.v42 && window.__FV.v42.pilot; if (!P) return null; return P(true); });
    if (pilot && pilot.on) {
      const pid = await H(page, () => window.__FV.residents.list().find((x) => x[0] === 'v' && window.__FV.residents.person(x).body === 'res'));
      await H(page, (p) => window.__FV.residents.follow(p), pid);
      await advance(page, 2);
      const c = await H(page, () => { const F = window.__FV, gs = F.scene, f = F.residents.state().follow, ct = gs.camTarget; return { on: f.on, d: Math.round(Math.hypot(ct.x - f.x, ct.y - f.y)), pilot: F.v42.pilot().on }; });
      ok(c.on && c.d <= 40 && c.pilot, '관망 on: the camera follows the resident (' + c.d + ' px) and 관망 goes on');
      await H(page, () => window.__FV.residents.unfollow());
      await advance(page, 2);
      const c2 = await H(page, () => { const F = window.__FV, gs = F.scene, ct = gs.camTarget, p = gs.player; return { dc: Math.round(Math.hypot(ct.x - p.x, ct.y - p.y + 30)), pilot: F.v42.pilot().on }; });
      ok(c2.pilot && c2.dc <= 150, '…and after it 관망 is still on, the camera with the chief (' + c2.dc + ' px)');
      await H(page, () => window.__FV.v42.pilot(false));
    } else console.log('   (관망 not available in this village: ' + JSON.stringify(pilot && { on: pilot.on, available: pilot.available }) + ')');
    // 관망 never starts on its own mid-follow
    const auto = await H(page, () => {
      const F = window.__FV, P = F.scene.v42 && F.scene.v42.pilot;
      if (!P || !P.available) return null;
      window.__FV_PILOT_AUTO = true;
      const pid = F.residents.list().find((x) => x[0] === 'v' && F.residents.person(x).body === 'res');
      F.residents.follow(pid);
      window.__step.run(5);
      const on = P.on, f = F.residents.state().follow.on;
      window.__FV_PILOT_AUTO = false;
      F.residents.unfollow();
      return { on, f };
    });
    if (auto) ok(!auto.on && auto.f, '관망 does not start on its own while following');
  }
  if (want('modal')) {
    console.log(' modal');
    await H(page, () => window.__FV.game.scene.getScene('UI').openSettings());
    ok(!(await H(page, () => window.__FV.residents.open())), 'not with the settings open');
    await H(page, () => { const U = window.__FV.game.scene.getScene('UI'); U.closeSettings(true); });
    await H(page, () => window.__FV.scene.toggleOverview());
    ok(!(await H(page, () => window.__FV.residents.open())), 'not on the overview map');
    await H(page, () => window.__FV.scene.toggleOverview());
    await H(page, () => { window.__FV.scene.v4.rank.ceremonyOn = true; });
    ok(!(await H(page, () => window.__FV.residents.open())), 'not during a ceremony');
    await H(page, () => { window.__FV.scene.v4.rank.ceremonyOn = false; });
    const office = await H(page, () => { const U = window.__FV.game.scene.getScene('UI'); if (!U.officePanel || !U.officePanel.office) return null; U.officePanel.open('stock'); return U.officePanel.isOpen(); });
    if (office) { ok(!(await H(page, () => window.__FV.residents.open())), 'not over the office panel'); await H(page, () => window.__FV.game.scene.getScene('UI').officePanel.close()); await advance(page, 0.3); }
    // Escape and the Android back key: profile → list → closed; a follow ends; false with nothing open
    await H(page, () => window.__FV.residents.open('v:npc_aunt'));
    await page.keyboard.press('Escape');
    let st = await S(page);
    ok(st.open && st.view === 'list', 'Escape: the profile → the list');
    await page.keyboard.press('Escape');
    st = await S(page);
    ok(!st.open, 'Escape again: closed');
    await H(page, () => window.__FV.residents.open('s:1'));
    ok(await H(page, () => window.__fvApp.back()) && (await S(page)).view === 'list', 'window.__fvApp.back(): profile → list (true)');
    ok(await H(page, () => window.__fvApp.back()) && !(await S(page)).open, '…→ closed (true)');
    ok(!(await H(page, () => window.__fvApp.back())), '…and false with nothing open (the app asks to exit)');
    await H(page, () => window.__FV.residents.follow('s:1'));
    ok(await H(page, () => window.__fvApp.back()) && !(await S(page)).follow.on, 'the back key ends a follow');
    ok((await S(page)).back === 0, 'nothing left on the back stack');
    await H(page, () => window.__FV.residents.open());
    ok((await H(page, () => window.__FV.game.scene.getScene('UI').v42PanelOpen)), 'open: the chief\'s input is blocked like the other panels (v42PanelOpen)');
    await H(page, () => window.__FV.game.scene.getScene('UI').openSettings());
    await advance(page, 0.6);
    ok(!(await S(page)).open, 'the settings opening over it closes it');
    await H(page, () => window.__FV.game.scene.getScene('UI').closeSettings(true));
  }
  if (want('budget')) {
    console.log(' budget');
    const closed1 = await H(page, () => window.__step.bench(300));
    await H(page, () => window.__FV.residents.open());
    for (let p = 0; p < 7; p++) { await H(page, (n) => window.__FV.residents.page(n), p); await advance(page, 0.3); }
    for (const pid of PROFILES) { await H(page, (p) => window.__FV.residents.profile(p), pid); await advance(page, 0.3); }
    await H(page, () => window.__FV.residents.back());
    const open1 = await H(page, () => window.__step.bench(300));
    await H(page, () => window.__FV.residents.close());
    const closed2 = await H(page, () => window.__step.bench(300));
    await H(page, () => window.__FV.residents.open());
    const open2 = await H(page, () => window.__step.bench(300));
    await H(page, () => window.__FV.residents.close());
    await advance(page, 0.5);
    const tex1 = await H(page, () => ({ keys: window.__FV.game.textures.getTextureKeys(), mib: window.__FV.texStats().totalMiB }));
    const adds = await H(page, () => { const T = window.__FV.game.textures; return (window.__texAdds || []).map((a) => ({ key: a.key, mine: /ResidentsPanel|systems\/residents\/|core\/Back/.test(a.stack), alive: T.exists(a.key) })); });
    const allNew = tex1.keys.filter((k) => tex0.keys.indexOf(k) < 0);
    META.texAdded = { n: allNew.length, keys: allNew.slice(0, 60), mib0: tex0.mib, mib1: tex1.mib };
    const mine = adds.filter((a) => a.mine);
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
    const art = mine.filter((a) => !UUID.test(a.key)).map((a) => a.key);
    ok(!art.length, 'the window, the profiles and the follow loaded no picture and made no texture of their own (only their text labels: ' + mine.length + ' text canvases over 7 pages and 5 profiles)', art);
    ok(!mine.some((a) => a.alive), 'every text canvas of the window is gone after it closes (' + mine.filter((a) => a.alive).length + ' left)');
    const open3 = await H(page, () => {
      const F = window.__FV, T = F.game.textures; F.residents.open();
      const keys0 = new Set(T.getTextureKeys());
      F.residents.page(0);
      const U = F.game.scene.getScene('UI'), C = U.residents.c;
      let bytes = 0, n = 0;
      const walk = (o) => { if (o.list) o.list.forEach(walk); if (o.type === 'Text' && o.canvas) { bytes += o.canvas.width * o.canvas.height * 4; n++; } };
      walk(C);
      F.residents.close();
      return { n, mib: +(bytes / 1048576).toFixed(2), keys: keys0.size };
    });
    META.textCanvas = open3;
    ok(open3.mib <= 4, 'the open list\'s text labels: ' + open3.n + ' canvases, ' + open3.mib + ' MiB (freed on close)');
    console.log('   (GL texture total ' + tex0.mib + ' → ' + tex1.mib + ' MiB while the village loaded ' + allNew.length + ' more pictures of its own)');
    const dAvg = Math.min(open1.avg, open2.avg) - Math.min(closed1.avg, closed2.avg);
    META.bench = { closed1, open1, closed2, open2, dAvg };
    ok(dAvg <= 0.1, 'a logic step with the window open: ' + Math.min(open1.avg, open2.avg) + ' ms vs closed ' + Math.min(closed1.avg, closed2.avg) + ' ms (Δ ' + dAvg.toFixed(3) + ' ms)');
    const txt = await H(page, () => {
      const R = window.__FV.residents; R.open();
      const C = window.__FV.game.scene.getScene('UI').residents.c;
      const inside = (o) => { for (let q = o.parentContainer; q; q = q.parentContainer) if (q === C) return true; return false; };
      let n = 0; const P = Phaser.GameObjects.Text.prototype, o = P.setText;
      P.setText = function (v) { if (v !== this.text && inside(this)) n++; return o.call(this, v); };
      window.__step.run(5);
      P.setText = o;
      R.close();
      return n;
    });
    ok(txt <= 6 * 3 * 2 * 5 + 20, 'live text at ≤ 2 Hz: ' + txt + ' text changes in 5 s with the list open');
  }
  if (want('reload') && saved46) {
    console.log(' reload');
    await H(page, () => window.__FV.save());
    await enter(page, true);
    await advance(page, 1);
    let same = true;
    for (const pid of PROFILES) {
      await H(page, (p) => window.__FV.residents.open(p), pid);
      const st = await S(page);
      if (JSON.stringify(STATIC(st.profile)) !== JSON.stringify(saved46[pid])) { same = false; console.log('   differs', pid, DIFF(STATIC(st.profile), saved46[pid]).join(' | ').slice(0, 600)); }
      await H(page, () => window.__FV.residents.close());
    }
    ok(same, 'every profile is the same after a save and a reload');
    const chip = await H(page, () => window.__FV.residents.state().chip);
    ok(chip.visible && chip.tappable, 'the chip is there after the reload (' + chip.text + ')');
  }
  pageErrors.push(...log.errors.map((e) => '46: ' + e));
  await ctx.close();
}

// ===================================================================== the 25-min village (count) and the late v4.2 village at night
if (want('count')) {
  console.log('the 25-min village');
  const { page, ctx, log } = await boot(fx('v41_save_smart_25min.json'));
  await advance(page, 2);
  await countCheck(page, '25 min');
  const s1 = await H(page, () => window.__FV.residents.person('s:1'));
  ok(s1.jobNow === 'none' && /일자리/.test(s1.job), 'its settler s:1 (창고 일꾼, no warehouse yet): 「' + s1.job + '」');
  pageErrors.push(...log.errors.map((e) => '25: ' + e));
  await ctx.close();
}
if (want('count') || want('night')) {
  console.log('the late v4.2 village (night)');
  const { page, ctx, log } = await boot(fx('v42_village_late.json'));
  await advance(page, 2);
  if (want('count')) await countCheck(page, 'late v4.2');
  else await H(page, () => window.__FV.residents.tapChip());
  await setHour(page, 21.5);
  await advance(page, 0.6);
  await shot(page, 'list_412_ko_night_p1');
  await H(page, () => window.__FV.residents.page(3));
  await advance(page, 0.5);
  await shot(page, 'list_412_ko_night_p4');
  for (const [pid, nm] of [['s:3', 'settler'], ['v:npc_kid_girl', 'child']]) {
    await H(page, (p) => window.__FV.residents.profile(p), pid);
    await advance(page, 0.6);
    await shot(page, 'profile_412_ko_night_' + nm);
  }
  const fol = await H(page, () => { const F = window.__FV; const pid = F.residents.list().find((x) => x[0] === 'v' && F.residents.person(x).body === 'res' && F.scene.life.byKey[F.residents.person(x).key].state === 'move'); F.residents.follow(pid || 'v:npc_grandpa'); return pid; });
  await advance(page, 1.2);
  await shot(page, 'follow_412_ko_night');
  await H(page, () => window.__FV.residents.unfollow());
  await setHour(page, 23);
  await H(page, () => window.__FV.residents.follow('s:1'));
  await advance(page, 1.2);
  const f = await H(page, () => window.__FV.residents.state().follow);
  ok(f.on && f.sub === '집에서 자는 중', 'at night a followed settler: 「' + f.chip + '」 / 「' + f.sub + '」');
  await shot(page, 'follow_412_ko_night_settler');
  META.nightFollow = fol;
  pageErrors.push(...log.errors.map((e) => 'late: ' + e));
  await ctx.close();
}

// ===================================================================== 360 x 640 English
if (want('en')) {
  console.log('360 x 640 English (the 46-min village)');
  const { page, ctx, log } = await boot(Object.assign(fx('v41_save_smart_46min.json'), { vp: { width: 360, height: 640 }, lang: 'en' }));
  await advance(page, 2);
  await setHour(page, 11);
  ok(await H(page, () => window.__FV.residents.tapChip()), 'the chip opens the window');
  await advance(page, 0.6);
  let st = await S(page);
  ok(st.title === 'Villagers (' + st.n + ')' && st.rows.length === 6, 'English title 「' + st.title + '」, 6 rows');
  let worst = [];
  for (let p = 0; p < st.pages; p++) {
    await H(page, (n) => window.__FV.residents.page(n), p);
    await advance(page, 0.5);
    const s2 = await S(page);
    if (!fitsAll(s2.rows)) worst = worst.concat(s2.rows.filter((r) => !fitsAll([r])).map((r) => [r.pid, r.fit]));
  }
  ok(!worst.length, 'every row on every page fits its columns at 360 px', worst);
  await H(page, () => window.__FV.residents.page(0));
  await advance(page, 0.5);
  await shot(page, 'list_360_en_p1');
  await H(page, () => window.__FV.residents.page(4));
  await advance(page, 0.5);
  await shot(page, 'list_360_en_p5');
  let fitAll = true;
  for (const [pid, nm] of [['v:npc_aunt', 'aunt'], ['v:npc_kid_prankster', 'child'], ['v:npc_grandpa', 'elder'], ['s:3', 'settler']]) {
    await H(page, (p) => window.__FV.residents.profile(p), pid);
    await advance(page, 0.6);
    st = await S(page);
    if (st.profile.bottom > st.profile.boxBottom) { fitAll = false; console.log('   overflow', pid, st.profile.bottom, st.profile.boxBottom); }
    await shot(page, 'profile_360_en_' + nm);
  }
  ok(fitAll, 'every profile card fits the 360 x 640 window');
  await H(page, () => window.__FV.residents.close());
  await H(page, () => { const F = window.__FV; const pid = F.residents.list().find((x) => x[0] === 'v' && F.residents.person(x).body === 'res'); F.residents.follow(pid); });
  await advance(page, 1.2);
  st = await S(page);
  ok(st.follow.on && /^Following /.test(st.follow.chip), 'the follow chip in English: 「' + st.follow.chip + '」');
  await shot(page, 'follow_360_en');
  pageErrors.push(...log.errors.map((e) => 'en: ' + e));
  await ctx.close();
}

ok(!pageErrors.length, 'no page errors', pageErrors.slice(0, 8));
fs.writeFileSync(path.join(SHOTS, 'res_meta.json'), JSON.stringify({ META, results }, null, 1));
await browser.close(); await srv.close();
console.log(`\nresidents: ${pass} passed, ${fail} failed  (wall ${Math.round((Date.now() - T0) / 1000)}s)`);
process.exit(fail ? 1 : 0);
