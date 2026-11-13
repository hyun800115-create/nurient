// (v4.2.0.2) 관리자 모드 · admin mode (src/systems/Admin.js, src/scenes/AdminPanel.js), fixed-step clock, one browser:
//   node tools/test/admin.mjs [--node] [--shots <dir>]        (--node: the Node part only)
// Never needs the real PIN: the automated browser (navigator.webdriver === true) sets window.__FV_ADMIN_TEST_DIGEST to
// the digest of this test's own PIN (TEST_PIN below). The SHA-256 itself: tools/test/sha256.test.mjs.
// Node
//   - every adm_ string in Korean and English, the same {placeholders}
//   - the 7 taps: the 7th tap within 4 s opens (6 do not, 7 spread over 4.2 s do not, the count starts over after)
//   - the PIN: the test digest works only with navigator.webdriver === true (false / a malformed digest -> the real one);
//     5 wrong in a row lock it for 60 s (even the right PIN is refused then), then it opens; a new game asks again
//   - the save: adminUses / adminInf kept when valid, dropped when not; every fixture (v3.5, v4.1, v4.2) migrates exactly
//     as before (no admin keys; adding them changes nothing else); Economy.spend with 코인 무제한 never lowers the coins
// Browser (real taps on the canvas, nothing opened by script)
//   A 412x915 ko, the v4.1 25-min save (a site being built, the day clock, bag level 2, pads on offer):
//     nothing admin reachable before the taps; settings (a real tap) -> 6 taps / slow taps do nothing -> 7 taps -> keypad;
//     wrong PIN -> shake + 「비밀번호가 달라요」, dots only; 5 wrong -> locked 60 s (the test PIN refused while locked) ->
//     unlocked; the test PIN -> the backup is written first (Save.js BACKUP_KEY + the 관리자 사본 code in its own slot, both
//     hold the village of that moment, adminUses counted after; the 불러오기 spare slot untouched) -> the panel; every
//     button by a real tap, each with its effect (가까운 발판 하나: the nearest pad ON SCREEN, named in the status);
//     every button inside the panel and the screen, no overlaps, labels fit; 코인 무제한 on -> a pad is paid and the
//     coins never drop; ×4 -> 4 village steps a frame (walk clock, day clock, the chief walks 4x as far, no NaN), reset to
//     ×1; closing resumes the game and leaves nothing behind; 7 taps again (same session) -> the panel, no PIN, the
//     관리자 사본 KEPT (still the village from before admin); reload -> 코인 무제한 still on, ×1, the HUD note, and 7 taps
//     need the PIN again (the copy kept again); 코인 무제한 off keeps the coins, spending lowers
//   B 360x640 en, a new game: no day/night row, empty results say so; resize to 412x915 -> the panel redrawn inside
//   C 360x640 ko, the late v4.2 village, then English (412x915): keypad + panel layout, screenshots; 가까운 발판 하나
//     never buys the off-screen town promotion
//   E 412x915 ko, ADMIN-C1/P1: a tester's village imported over the own one (the 불러오기 spare = the own village): admin
//     open #1 -> the 관리자 사본 = the tester village, the spare still the own village; +100,000, open #2 -> both kept;
//     마을 옮기기 › 불러오기 shows both rows (the dates follow the codes: P2); 「관리자 사본으로 되돌리기」 -> the village
//     from before admin is back, the admin'd one takes the 관리자 사본 slot, the own village is still the spare
//   D navigator.webdriver false (a phone): the test digest is ignored, the test PIN is refused
//   no page errors anywhere. Screenshots: --shots <dir> (default docs/previews/screens/admin).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const argv = process.argv.slice(2);
const NODE_ONLY = argv.includes('--node');
const SHOTS = argv.includes('--shots') ? path.resolve(argv[argv.indexOf('--shots') + 1]) : path.join(ROOT, 'docs', 'previews', 'screens', 'admin');
const TEST_PIN = '24680';          // this test's own PIN (its digest is handed to the automated browser); not the game's
const WRONG_PIN = '1357';
const SALT = 'snowbloom-admin-v1:';
const TEST_DIGEST = crypto.createHash('sha256').update(SALT + TEST_PIN).digest('hex');
let pass = 0, fail = 0;
const failed = [];
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; failed.push(msg); console.log('  FAIL ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const t0 = Date.now();

// ================================================================ Node
console.log('— Node');
globalThis.window = globalThis.window || {};
const STR = await import('../../src/data/strings.js');
{
  const ko = Object.keys(STR.STRINGS.ko).filter((k) => k.startsWith('adm_')), en = Object.keys(STR.STRINGS.en).filter((k) => k.startsWith('adm_'));
  const ph = (s) => (String(s).match(/\{[a-z]+\}/g) || []).sort().join(',');
  const bad = ko.filter((k) => !en.includes(k) || !STR.STRINGS.ko[k] || !STR.STRINGS.en[k] || ph(STR.STRINGS.ko[k]) !== ph(STR.STRINGS.en[k]));
  ok(ko.length >= 30 && ko.length === en.length && !bad.length, ko.length + ' adm_ strings in Korean and English, the same placeholders', bad);
  ok(STR.STRINGS.ko.adm_pinWrong === '비밀번호가 달라요' && STR.STRINGS.ko.adm_inf === '코인 무제한' && STR.STRINGS.ko.adm_close === '관리자 모드 닫기', 'the words the brief names (비밀번호가 달라요, 코인 무제한, 관리자 모드 닫기, …)');
  const E = STR.STRINGS.en, en1 = [E.adm_bought, E.adm_finished, E.adm_boughtOne].map((x) => x.replace('{n}', '1').replace('{name}', 'Town promotion'));
  ok(en1.every((x) => !/\b1 (pads|buildings)\b/.test(x)) && /on screen/.test(E.adm_noPads), 'English results read right for one (' + en1.join(' / ') + '; ' + E.adm_noPads + ')', en1);
}
const A = await import('../../src/systems/Admin.js');
const S = A.AdminSession;
const resetS = () => { S.taps = []; S.wrong = 0; S.lockUntil = 0; S.unlocked = false; };
{
  resetS();
  const r7 = []; for (let i = 0; i < 7; i++) r7.push(A.versionTap(10000 + i * 300));
  ok(same(r7, [false, false, false, false, false, false, true]), '7 taps within 2 s: the 7th opens', r7);
  ok(A.versionTap(20000) === false && S.taps.length === 1, 'after opening the count starts over');
  resetS();
  const r6 = []; for (let i = 0; i < 6; i++) r6.push(A.versionTap(30000 + i * 100));
  ok(r6.every((x) => !x), '6 taps: nothing');
  resetS();
  const rs = []; for (let i = 0; i < 7; i++) rs.push(A.versionTap(40000 + i * 700));
  ok(rs.every((x) => !x), '7 taps spread over 4.2 s: nothing (only taps within 4 s count)', rs);
  resetS();
}
{
  const nav = (wd) => { try { Object.defineProperty(globalThis, 'navigator', { value: { webdriver: wd }, configurable: true, writable: true }); } catch (e) { globalThis.navigator = { webdriver: wd }; } };
  nav(true);
  window.__FV_ADMIN_TEST_DIGEST = TEST_DIGEST;
  resetS();
  ok(A.adminDigest() === TEST_DIGEST && A.tryPin(TEST_PIN, 1000) === 'ok' && S.unlocked, 'automated (webdriver true) + a test digest: the test PIN opens');
  A.adminSceneStart();
  ok(!S.unlocked, 'a new game (Game.create): locked again');
  resetS();
  const bad = ['', 'abc', '12a4', '1'.repeat(13), ' 24680'].map((d) => { S.wrong = 0; return A.tryPin(d, 1000); });
  ok(bad.every((r) => r === 'wrong'), 'empty / letters / 13 digits / a space: refused', bad);
  resetS();
  const seq = []; for (let i = 0; i < 5; i++) seq.push(A.tryPin(WRONG_PIN, 2000 + i));
  ok(same(seq, ['wrong', 'wrong', 'wrong', 'wrong', 'locked']) && A.lockLeft(2004) === 60000, '5 wrong in a row: locked for 60 s', { seq, left: A.lockLeft(2004) });
  ok(A.tryPin(TEST_PIN, 2004 + 59000) === 'locked' && !S.unlocked, 'while locked even the right PIN is refused');
  ok(A.tryPin(TEST_PIN, 2004 + 60001) === 'ok' && S.unlocked, 'after 60 s the right PIN opens');
  resetS();
  ok(A.tryPin(WRONG_PIN, 5000) === 'wrong' && A.tryPin(TEST_PIN, 5001) === 'ok' && S.wrong === 0 && A.tryPin(WRONG_PIN, 5002) === 'wrong' && S.wrong === 1, 'the right PIN resets the wrong count ("in a row")');
  resetS();
  window.__FV_ADMIN_TEST_DIGEST = 'xyz';
  ok(A.adminDigest() === A.ADMIN_DIGEST, 'a malformed test digest: the real one is used');
  window.__FV_ADMIN_TEST_DIGEST = TEST_DIGEST;
  nav(false);
  ok(A.adminDigest() === A.ADMIN_DIGEST && A.tryPin(TEST_PIN, 9000) === 'wrong', 'navigator.webdriver false (a phone): the test digest is ignored, the test PIN refused');
  nav(undefined);
  ok(A.adminDigest() === A.ADMIN_DIGEST, 'navigator.webdriver missing: the real digest');
  resetS();
  delete window.__FV_ADMIN_TEST_DIGEST;
}
{
  const SV = await import('../../src/core/Save.js');
  const FIX = path.join(HERE, 'fixtures');
  // ((v4.3 step B, S5) not the fixtures made to be refused: a newer build's village (v43_newer_*) and the hand-made one R43
  //  cannot move (_expect 'fail', save_v43.mjs checks them); a fixture exported after its admin panel was used
  //  (v4202_46min_admin) is compared without its own admin keys)
  const files = fs.readdirSync(FIX).filter((f) => f.endsWith('.json') && !/^v43_newer_/.test(f) && JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'))._expect !== 'fail').sort();
  const issues = [];
  for (const f of files) {
    const d = JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
    const raw = d.keys ? JSON.parse(d.keys[SV.SAVE_KEY]) : d;
    delete raw.adminUses; delete raw.adminInf;
    const base = SV.migrateSave(JSON.parse(JSON.stringify(raw)));
    if (!base) { issues.push(f + ': not readable'); continue; }
    if ('adminUses' in base || 'adminInf' in base) issues.push(f + ': admin keys appeared');
    const withA = SV.migrateSave(Object.assign(JSON.parse(JSON.stringify(raw)), { adminUses: 3, adminInf: 1 }));
    const back = Object.assign({}, withA); delete back.adminUses; delete back.adminInf;
    if (withA.adminUses !== 3 || withA.adminInf !== 1 || !same(back, base)) issues.push(f + ': with admin keys differs');
  }
  ok(files.length >= 10 && !issues.length, files.length + ' fixtures (v3.5 / v4.1 / v4.2) load exactly as before; the admin keys add nothing else', issues);
  const sz = (v) => SV.sanitizeSave({ v: 7, coins: 1, adminUses: v }).adminUses;
  const inf = (v) => SV.sanitizeSave({ v: 7, coins: 1, adminInf: v }).adminInf;
  ok(sz(4) === 4 && sz('7') === 7 && sz(2.9) === 2 && sz(5e9) === 1e6 && sz(-3) === undefined && sz('x') === undefined && sz(0) === undefined && sz(null) === undefined, 'adminUses: a whole number 1 .. 1,000,000, else dropped');
  ok(inf(1) === 1 && inf(true) === 1 && inf(2) === undefined && inf('1') === undefined && inf(0) === undefined, 'adminInf: 1 / true -> 1, anything else dropped');
  ok(SV.SAVE_VERSION === 8, 'SAVE_VERSION is 8 (main line; the 4.2.0.2 line stays 7)');
}
{
  const { Economy } = await import('../../src/systems/Economy.js');
  const shown = [];
  const E = new Economy({ ui: { setCoins: (v) => shown.push(v) } }, 500);
  E.unlimited = true;
  const a = E.spend(200), b = E.spend(900);
  ok(a === 200 && b === 500 && E.coins === 500, '코인 무제한: spend pays (200; at most what there is) and the coins stay 500', { a, b, coins: E.coins });
  E.unlimited = false;
  ok(E.spend(200) === 200 && E.coins === 300, 'off: spending lowers the coins again, from where they are');
}

if (NODE_ONLY) {
  console.log(`\nadmin (node): ${pass} ok, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

// ================================================================ the real game
const { start } = await import('./serve.mjs');
const { launch, openPage, tapStart, sleep, waitFor } = await import('./pw.mjs');
const { installStepper, advance, render } = await import('./fv_step.mjs');
fs.mkdirSync(SHOTS, { recursive: true });
const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
const FIXD = path.join(HERE, 'fixtures');
// ((v4.3 step B, S6 — the B0 suite audit, BP-21: asStepB for the browser part) the admin keypad, panel and spare slots on the
//  saved villages: they carry the step-B marker, so the R43 remap (the chief back at the hut door, moved workshops) is no
//  part of these rows. The Node part above runs every fixture through migrateSave with R43 and stays equal
const { asStepB } = await import('./v43_helpers.mjs');
const PURE25 = asStepB(fs.readFileSync(path.join(FIXD, 'v41_save_pure_25min.json'), 'utf8'));
const LATE = asStepB(JSON.parse(fs.readFileSync(path.join(FIXD, 'v42_village_late.json'), 'utf8')).keys);
const SAVE_KEY = 'frostVillage.save.v1', SETTINGS_KEY = 'frostVillage.settings.v1', BACKUP_KEY = 'frostVillage.save.backup', MOVE_KEY = 'frostVillage.move.backup';
const allErrors = [];

async function newPage(keys, opts = {}) {
  // ((v4.3) a phone (webdriver false) gets the new-game 「우리 마을 깃발」 first; these checks are about the admin keypad,
  //  so the maker is switched off for them (flagUiAllowed: __FV_FLAGMAKER = false))
  const init = (opts.webdriverFalse ? "Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });\nwindow.__FV_FLAGMAKER = false;\n" : '') + `window.__FV_ADMIN_TEST_DIGEST = '${TEST_DIGEST}';`;
  const o = await openPage(browser, srv.url + 'index.html', { viewport: opts.viewport || { width: 412, height: 915 }, dpr: opts.dpr || 2, locale: opts.locale || 'ko-KR', init });
  await o.page.evaluate((k) => { localStorage.clear(); for (const n in k) localStorage.setItem(n, k[n]); }, keys || {});
  await o.page.reload({ waitUntil: 'load' });
  await boot(o.page);
  return o;
}
async function boot(page) {
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player && window.__FV.adminState, 180000);
  await installStepper(page);
  await page.evaluate(() => { if (window.__FV.v42 && window.__FV.v42.v && window.__FV.v42.v.seen) window.__FV.v42.v.seen.whatsNew = 1; });
  await advance(page, 0.5);
}
const st = (page) => page.evaluate(() => window.__FV.adminState());
const canvasBox = async (page) => { const bb = await (await page.$('canvas')).boundingBox(); return { bb, s: bb.width / 720 }; };
/** a real touch at logical (x, y), then one frame */
async function tapL(page, x, y) { const { bb, s } = await canvasBox(page); await page.touchscreen.tap(bb.x + x * s, bb.y + y * s); await render(page, 1); }
async function tapBtn(page, id) {
  const b = (await st(page)).buttons.find((q) => q.id === id);
  if (!b) throw new Error('no admin button ' + id);
  await tapL(page, b.x, b.y);
  await render(page, 1);
}
async function typePin(page, pin) { for (const d of pin) await tapBtn(page, d); await tapBtn(page, 'ok'); }
/** settings by a real tap on the ⚙ button */
async function openSettings(page) {
  const p = await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); return ui.panelOpen ? null : { x: ui.setBtn.x, y: ui.setBtn.y }; });
  if (p) await tapL(page, p.x, p.y);
  await render(page, 2);
  return page.evaluate(() => window.__FV.game.scene.getScene('UI').panelOpen);
}
async function versionTaps(page, n) {
  const v = await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); const o = ui.panelItems && ui.panelItems.find((q) => q.adminTap); return o ? { x: o.x, y: o.y } : null; });
  if (!v) throw new Error('no version text');
  for (let i = 0; i < n; i++) await tapL(page, v.x, v.y);
}
/** settings -> 7 taps -> (keypad -> test PIN) -> the panel */
async function openAdmin(page, expectKeypad) {
  await openSettings(page);
  await versionTaps(page, 7);
  await render(page, 8);
  const a = await st(page);
  if (a.keypad) await typePin(page, TEST_PIN);
  await waitFor(page, () => window.__FV.adminState().panel && !window.__FV.adminState().busy, 30000);
  await render(page, 6);
  return { keypadShown: a.keypad, panelAtOnce: a.panel || (!a.keypad && !expectKeypad) };
}
/** a screenshot for the designer (not a check: on a loaded machine one can take long — a longer wait, one retry, then a note) */
const shotNotes = [];
const shot = async (page, n) => {
  await render(page, 3);
  for (const timeout of [90000, 120000]) {
    try { await page.screenshot({ path: path.join(SHOTS, n + '.png'), timeout }); return; } catch (e) { /* once more */ }
  }
  shotNotes.push(n); console.log('  note: screenshot ' + n + ' timed out twice (not a check)');
};
const paused = (page) => page.evaluate(() => window.__FV.game.scene.isPaused('Game'));
/** buttons inside the panel box and the screen, labels fit, no overlaps */
async function layoutCheck(page, tag) {
  const a = await st(page);
  const H = await page.evaluate(() => window.__FV.game.scene.getScene('UI').H);
  const box = a.panel ? a.panelBox : a.keypadBox;
  const list = a.buttons.filter((b) => b.kind === (a.panel ? 'panel' : 'key'));
  const out = [];
  if (box.top < 0 || box.top + box.h > H) out.push('box off screen ' + JSON.stringify(box) + ' H ' + H);
  for (const b of list) {
    const l = b.x - b.w / 2, r = b.x + b.w / 2, tp = b.y - b.h / 2, bt = b.y + b.h / 2;
    if (l < 360 - box.w / 2 - 1 || r > 360 + box.w / 2 + 1 || tp < box.top - 1 || bt > box.top + box.h + 1) out.push(b.id + ' outside the panel');
    if (l < 0 || r > 720 || tp < 0 || bt > H) out.push(b.id + ' off screen');
    if (b.text && b.textW > b.w - 10) out.push(b.id + ' label wider than the button (' + b.textW + ' > ' + (b.w - 10) + ')');
  }
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const p = list[i], q = list[j];
    if (Math.abs(p.x - q.x) < (p.w + q.w) / 2 - 1 && Math.abs(p.y - q.y) < (p.h + q.h) / 2 - 1) out.push(p.id + ' overlaps ' + q.id);
  }
  ok(!out.length, tag + ': ' + list.length + ' buttons inside the ' + (a.panel ? 'panel' : 'keypad') + ' and the screen, labels fit, no overlaps', out);
  return a;
}
const coins = (page) => page.evaluate(() => window.__FV.scene.economy.coins);
/** the save inside a spare slot: 'admin' (the 관리자 사본) or 'move' (the 불러오기 spare); null when empty */
const slotSave = (page, which) => page.evaluate(async (w) => {
  const T = await import(new URL('src/core/Transfer.js', location.href).href);
  const c = T.backupCode(null, w === 'admin' ? T.ADMIN_BACKUP_KEY : T.MOVE_BACKUP_KEY);
  if (!c) return null;
  const d = await T.decodeVillage(c);
  return d.ok ? Object.assign(JSON.parse(d.keys['frostVillage.save.v1']), { _keys: Object.keys(d.keys) }) : { error: d.error };
}, which);
/** the nearest offered pad on screen (what 「가까운 발판 하나」 must buy), or null */
const nearestOnScreen = (page) => page.evaluate(async () => {
  const A = await import(new URL('src/systems/Admin.js', location.href).href);
  const gs = window.__FV.scene, p0 = gs.player;
  const l = A.offeredPads(gs, true);
  l.sort((a, b) => Math.hypot(a.x - p0.x, (a.y - p0.y) * 2) - Math.hypot(b.x - p0.x, (b.y - p0.y) * 2));
  return l[0] ? { id: l[0].id, name: l[0].labelText.text.replace(/\s+/g, ' ').trim() } : null;
});
/** 설정 › 마을 옮기기 › 불러오기 (the DOM sheet): the two spare rows as shown */
async function openMoveIn(page) {
  await page.evaluate(() => { window.__FV.lastMoveCode = null; const ui = window.__FV.game.scene.getScene('UI'); if (!ui.panelOpen) ui.openSettings(true); });
  await render(page, 2);
  const b = await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); const m = ui.panelItems.find((o) => o.moveBtn); return m ? { x: m.x, y: m.y } : null; });
  await tapL(page, b.x, b.y);
  await waitFor(page, () => window.__FV.moveOpen === true, 10000);
  await waitFor(page, () => !!window.__FV.lastMoveCode, 30000);
  await page.click('#fm-tab-in');
  await waitFor(page, () => ['fm-undo', 'fm-undo-admin'].every((id) => { const e = document.getElementById(id); return e.hidden || !/…/.test(e.textContent); }), 30000);
  return page.evaluate(() => Object.fromEntries(['fm-undo', 'fm-undo-admin'].map((id) => { const e = document.getElementById(id); return [id, e.hidden ? null : e.firstChild.textContent]; })));
}
async function closeMove(page) {
  await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); ui.movePanel.close(); if (ui.panelOpen) ui.closeSettings(true, true); });
  await render(page, 4);
}

try {
  // ============================================================ A
  console.log('— A: 412x915 ko, the v4.1 25-min village');
  const { page: P, log: LA } = await newPage({ [SAVE_KEY]: PURE25, [SETTINGS_KEY]: JSON.stringify({ lang: 'ko', observeAfter: 0 }) });
  let a = await st(P);
  const exposed = await P.evaluate(() => Object.keys(window.__FV).filter((k) => /admin/i.test(k)));
  ok(!a.keypad && !a.panel && !a.unlocked && same(exposed, ['adminState']), 'before the taps: no keypad, no panel, locked; the only admin hook is the read-only adminState', exposed);
  ok(a.speed === 1 && !a.unlimited && a.uses === 0 && !a.chip, 'a village that never used it: ×1, 코인 무제한 off, 0 uses, no HUD note', a);
  const ver = await P.evaluate(() => { const gs = window.__FV.scene; return { sites: Object.keys(gs.sites).filter((k) => ['foundation', 'scaffold'].includes(gs.sites[k].state)), cap: gs.progress.capacity(), clock: gs.v4 && gs.v4.clock && gs.v4.clock.on }; });
  ok(ver.sites.length >= 1 && ver.cap < 26 && ver.clock, 'the village: a site being built (' + ver.sites.join(',') + '), bag ' + ver.cap + ', the day clock on', ver);
  ok(await openSettings(P), 'settings open with a real tap on ⚙');
  await versionTaps(P, 6);
  a = await st(P);
  ok(!a.keypad && a.taps === 6, '6 taps on the version: nothing yet', { keypad: a.keypad, taps: a.taps });
  await advance(P, 4.5);
  await versionTaps(P, 1);
  a = await st(P);
  ok(!a.keypad && a.taps === 1, '…a 7th tap 4.5 s later: still nothing (the window moved on)', { keypad: a.keypad, taps: a.taps });
  await versionTaps(P, 7);
  await render(P, 8);
  a = await st(P);
  ok(a.keypad && !a.panel && await paused(P), '7 taps within 4 s: the PIN keypad (the game paused)', a);
  await shot(P, 'keypad_412_ko');
  await layoutCheck(P, 'keypad 412x915 ko');
  for (const d of '135') await tapBtn(P, d);
  a = await st(P);
  ok(a.digits === 3 && a.dots === '● ● ●' && !/[0-9]/.test(a.dots), 'typed digits show as dots only', a.dots);
  await tapBtn(P, 'clear');
  a = await st(P);
  ok(a.digits === 2 && a.dots === '● ●', '지우기 takes the last digit away');
  await tapBtn(P, 'clear'); await tapBtn(P, 'clear');
  await typePin(P, WRONG_PIN);
  await render(P, 3);
  a = await st(P);
  ok(!a.panel && a.keypad && a.err === '비밀번호가 달라요' && a.shakes >= 1 && a.wrong === 1 && a.digits === 0, 'a wrong PIN: shake + 「비밀번호가 달라요」, the panel stays shut', a);
  await shot(P, 'keypad_wrong_412_ko');
  for (let i = 0; i < 4; i++) await typePin(P, WRONG_PIN);
  await render(P, 2);
  a = await st(P);
  ok(a.lockLeft > 58000 && /60초/.test(a.lockText) && !a.panel, '5 wrong in a row: locked for 60 s (「잠깐 쉬었다 해요 · 60초」)', { left: a.lockLeft, lock: a.lockText });
  await shot(P, 'keypad_locked_412_ko');
  await typePin(P, TEST_PIN);
  await render(P, 2);
  a = await st(P);
  ok(!a.panel && !a.unlocked && a.digits === 0, 'while locked the right (test) PIN does nothing');
  await advance(P, 30);
  a = await st(P);
  ok(/(29|30)초/.test(a.lockText), 'the lock counts down (' + a.lockText + ')');
  await advance(P, 31);
  a = await st(P);
  ok(a.lockLeft === 0 && a.lockText === '', 'after 60 s the keypad takes digits again');
  // the village of this moment (what the backup must hold)
  const before = await P.evaluate(() => { const gs = window.__FV.scene; return { coins: gs.economy.coins, cid: gs.cid, done: Object.keys(gs.progress.done).filter((k) => gs.progress.done[k]).length }; });
  await typePin(P, TEST_PIN);
  await waitFor(P, () => window.__FV.adminState().panel && !window.__FV.adminState().busy, 30000);
  await render(P, 6);
  a = await st(P);
  ok(a.panel && !a.keypad && a.unlocked && await paused(P), 'the test PIN: the admin panel (the game stays paused)');
  ok(await P.evaluate(() => !window.__FV.game.scene.getScene('UI').panelOpen), 'the settings panel closed under it');
  const store = await P.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
  const saved = JSON.parse(store[SAVE_KEY]), bk = store[BACKUP_KEY] ? JSON.parse(store[BACKUP_KEY]) : null;
  ok(a.backup && a.backup.copy && a.backup.save && /^관리자 사본을 남겨 뒀어요 · 1번째$/.test(a.sub), 'the backup was written first: 「' + a.sub + '」', { backup: a.backup, sub: a.sub });
  ok(bk && bk.coins === before.coins && bk.cid === before.cid && !('adminUses' in bk) && saved.adminUses === 1 && a.uses === 1, 'Save.js BACKUP_KEY holds the village as it was (coins ' + before.coins + ', before the use was counted); the save counts adminUses 1', { bk: bk && bk.coins, uses: saved.adminUses });
  const spare = await slotSave(P, 'admin');
  ok(spare && spare.coins === before.coins && spare.cid === before.cid && !('adminUses' in spare), 'the 관리자 사본 (its own slot, 마을 옮기기 › 관리자 사본으로 되돌리기) holds the same village as a code', spare && (spare.error || spare._keys));
  ok(await slotSave(P, 'move') === null, 'the 불러오기 spare slot is not written by admin (empty before, empty now)');
  await shot(P, 'panel_412_ko');
  await layoutCheck(P, 'panel 412x915 ko');
  const ids = (await st(P)).buttons.filter((b) => b.kind === 'panel').map((b) => b.id);
  ok(['coins1000', 'coins10000', 'coins100000', 'inf', 'finish', 'padNear', 'padAll', 'bag', 'speed1', 'speed2', 'speed4', 'daynight', 'tutorial', 'closeBtn', 'close'].every((k) => ids.includes(k)), 'every button is there (coins ×3, 무제한, 건물, 발판 ×2, 가방, 시간 ×3, 낮/밤, 튜토리얼, 닫기)', ids);
  // ---- coins
  const earned0 = await P.evaluate(() => window.__FV.scene.economy.earned);
  for (const n of [1000, 10000, 100000]) {
    const c0 = await coins(P);
    await tapBtn(P, 'coins' + n);
    const c1 = await coins(P);
    a = await st(P);
    ok(c1 - c0 === n && a.lastAct === 'coins' + n && /코인을 넣었어요/.test(a.status), '+' + n + ' by a real tap: coins ' + c0 + ' -> ' + c1, a.status);
  }
  ok(await P.evaluate(() => window.__FV.scene.economy.earned) === earned0, 'the coins given are not counted as the village\'s earnings (newspaper / income stay true)');
  // ---- 코인 무제한
  await tapBtn(P, 'inf');
  a = await st(P);
  ok(a.unlimited && a.buttons.find((b) => b.id === 'inf').text === '켜짐 ∞' && a.status === '코인 무제한을 켰어요', '코인 무제한: on, the button says 「켜짐 ∞」', a.status);
  // ---- 짓는 건물 바로 완성
  await tapBtn(P, 'finish');
  a = await st(P);
  const sitesAfter = await P.evaluate((ids) => ids.map((k) => window.__FV.scene.sites[k].state), ver.sites);
  ok(sitesAfter.every((s) => s === 'done') && /다 지었어요/.test(a.status), '짓는 건물 바로 완성: ' + ver.sites.join(',') + ' done (' + a.status + ')', sitesAfter);
  await tapBtn(P, 'finish');
  a = await st(P);
  ok(a.statusErr && a.status === '짓고 있는 건물이 없어요', 'again: 「짓고 있는 건물이 없어요」');
  // ---- 가방 최대
  await tapBtn(P, 'bag');
  a = await st(P);
  const cap = await P.evaluate(() => window.__FV.scene.progress.capacity());
  ok(cap === 26 && /26칸/.test(a.status) && a.buttons.find((b) => b.id === 'bag').text === '가방이 이미 최대예요', '가방 최대: the bag holds 26 (' + a.status + ')', cap);
  // ---- 낮/밤 바꾸기
  const ph0 = await P.evaluate(() => window.__FV.scene.v4.clock.phase());
  await tapBtn(P, 'daynight');
  const ph1 = await P.evaluate(() => ({ ph: window.__FV.scene.v4.clock.phase(), a: window.__FV.scene.v4.clock.cur.a }));
  await tapBtn(P, 'daynight');
  const ph2 = await P.evaluate(() => window.__FV.scene.v4.clock.phase());
  ok(ph1.ph !== ph0 && ['day', 'night'].includes(ph1.ph) && ph2 !== ph1.ph, '낮/밤 바꾸기: ' + ph0 + ' -> ' + ph1.ph + ' -> ' + ph2, ph1);
  // ---- 시간 빠르게
  await tapBtn(P, 'speed4');
  a = await st(P);
  const sc = await P.evaluate(() => { const gs = window.__FV.scene; return { k: gs.simSpeed, tw: gs.tweens.timeScale, tm: gs.time.timeScale }; });
  ok(a.speed === 4 && sc.k === 4 && sc.tw === 4 && sc.tm === 4 && a.buttons.find((b) => b.id === 'speed4').text === '×4', '×4: the village steps 4 times a frame, tweens and timers ×4 (' + a.status + ')', sc);
  await shot(P, 'panel_after_412_ko');
  // ---- close: the game runs again, nothing left behind
  await tapBtn(P, 'closeBtn');
  await render(P, 12);
  a = await st(P);
  const left = await P.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); return { adminOpen: ui.adminOpen, depth85: ui.children.list.filter((o) => o.depth >= 85 && o.depth <= 90 && o.active).length }; });
  ok(!a.panel && !left.adminOpen && left.depth85 === 0 && !(await paused(P)), '관리자 모드 닫기: the panel is gone, the game runs', left);
  ok(a.chip && /관리자 · ×4 · ∞/.test(a.chip.text), 'the HUD note says what is on: 「' + (a.chip && a.chip.text) + '」');
  // ---- ×4 in play: 4 village steps a frame, the chief walks 4x as far, physics intact
  const sp4 = await P.evaluate(() => {
    const gs = window.__FV.scene, H = window.__FV;
    const w0 = gs.walkClock, T0 = gs.v4.clock.T;
    window.__step.run(2);
    const p0 = { x: gs.player.x, y: gs.player.y };
    H.setInput(1, 0); window.__step.run(0.5); H.setInput(0, 0); window.__step.run(1 / 60);
    const d4 = Math.hypot(gs.player.x - p0.x, gs.player.y - p0.y);
    return { walk: +(gs.walkClock - w0).toFixed(2), clock: +(gs.v4.clock.T - T0).toFixed(2), d4, ok: Number.isFinite(gs.player.x) && Number.isFinite(gs.player.y) };
  });
  // ---- the same walk at ×1 (setSpeed through the module the panel uses)
  const sp1 = await P.evaluate(async () => {
    const A = await import(new URL('src/systems/Admin.js', location.href).href);
    const gs = window.__FV.scene, H = window.__FV;
    A.setSpeed(gs, 1);
    const w0 = gs.walkClock;
    window.__step.run(2);
    const p0 = { x: gs.player.x, y: gs.player.y };
    H.setInput(-1, 0); window.__step.run(0.5); H.setInput(0, 0); window.__step.run(1 / 60);
    return { walk: +(gs.walkClock - w0).toFixed(2), d1: Math.hypot(gs.player.x - p0.x, gs.player.y - p0.y), tw: gs.tweens.timeScale };
  });
  const played = 2 + 0.5 + 1 / 60;
  ok(Math.abs(sp4.walk - 4 * played) < 0.15 && Math.abs(sp4.clock - 4 * played) < 0.15 && Math.abs(sp1.walk - played) < 0.05, '×4: ' + played.toFixed(2) + ' s of play = ' + sp4.walk + ' s of village time (walk clock; day clock ' + sp4.clock + '); ×1: ' + sp1.walk + ' s', { sp4, sp1 });
  ok(sp4.ok && sp1.d1 > 20 && sp4.d4 / sp1.d1 > 2.6 && sp4.d4 / sp1.d1 < 4.6 && sp1.tw === 1, 'the chief walks ' + (sp4.d4 / Math.max(1, sp1.d1)).toFixed(2) + 'x as far at ×4 (same steps, no tunnelling: ' + Math.round(sp4.d4) + ' vs ' + Math.round(sp1.d1) + ' px)', { sp4, sp1 });
  // ---- 코인 무제한 in play: a pad is paid, the coins never drop
  const padRun = await P.evaluate(() => {
    const gs = window.__FV.scene, H = window.__FV, pr = gs.progress, tries = [];
    const bench = (p) => pr.upPads && (pr.upPads.capacity === p || pr.upPads.speed === p);
    const list = gs.paidPads().filter((p) => p && p.active && !p.done && !p.maxed && p.label && p.label.visible && !p.items && p.remaining > 0);
    list.sort((a, b) => (bench(a) ? 1 : 0) - (bench(b) ? 1 : 0) || a.remaining - b.remaining);
    for (const p of list.slice(0, 3)) {
      const c0 = gs.economy.coins, paid0 = p.paid;
      let low = c0;
      H.teleport(p.x, p.y);
      for (let i = 0; i < 40 && !p.done; i++) { window.__step.run(0.1); low = Math.min(low, gs.economy.coins); }
      const r = { id: p.id, cost: p.cost, paid0, paid: p.paid, done: p.done, c0, low, on: p.pad.contains(gs.player.x, gs.player.y), standT: +(p.standT || 0).toFixed(2), needsLeave: p.needsLeave, active: p.active };
      tries.push(r);
      H.teleport(p.x + 300, p.y + 150);
      window.__step.run(0.3);
      if (r.done || r.paid > r.paid0) break;
    }
    return { n: list.length, tries };
  });
  const paidTry = padRun.tries.find((r) => r.done || r.paid > r.paid0);
  ok(!!paidTry && padRun.tries.every((r) => r.low >= r.c0), '코인 무제한: standing on a pad pays it (' + (paidTry ? paidTry.id + ' ' + paidTry.paid0 + ' -> ' + (paidTry.done ? 'done' : paidTry.paid) + ' of ' + paidTry.cost : 'none') + ') and the coins never drop', padRun);
  // (a pad on screen for 가까운 발판 하나: the chief stands a little way off a pad on offer, not on it)
  const placed = await P.evaluate(async () => {
    const A = await import(new URL('src/systems/Admin.js', location.href).href);
    const gs = window.__FV.scene, H = window.__FV;
    const p = A.offeredPads(gs, false).filter((q) => !q.items)[0];
    if (!p) return null;
    H.teleport(p.x + 160, p.y + 120); window.__step.run(0.3);
    return { id: p.id, on: p.pad.contains(gs.player.x, gs.player.y), screen: gs.isOnScreen(p.x, p.y, 0) };
  });
  // ---- 7 taps again, same session: the panel at once (no PIN); one more use, the 관리자 사본 KEPT (ADMIN-C1/P1)
  const o2 = await openAdmin(P, false);
  a = await st(P);
  ok(!o2.keypadShown && a.panel && a.uses === 2, 'same session, 7 taps again: the panel opens without the PIN (use 2)', { o2, uses: a.uses });
  const kept2 = await slotSave(P, 'admin'), bk2 = await P.evaluate(() => JSON.parse(localStorage.getItem('frostVillage.save.backup')));
  ok(a.backup && a.backup.kept && !a.backup.copy && /^관리자 사본: \d+월 \d+일 \d\d:\d\d 마을 · 2번째$/.test(a.sub) && kept2 && kept2.coins === before.coins && bk2.coins === before.coins,
    'the 관리자 사본 is kept, not written over: still the village from before admin (' + before.coins + ' coins, now ' + (await coins(P)) + '); 「' + a.sub + '」', { backup: a.backup, kept: kept2 && kept2.coins, bk: bk2 && bk2.coins });
  // ---- pads: 가까운 발판 하나 = the nearest pad ON SCREEN, named in the status (ADMIN-P3)
  const padsBefore = a.pads, near = await nearestOnScreen(P);
  await tapBtn(P, 'padNear');
  a = await st(P);
  const nearDone = near ? await P.evaluate((id) => { const p = window.__FV.scene.paidPads().find((q) => q.id === id); return !!(p && (p.done || p.maxed)); }, near.id) : false;
  ok(near ? (nearDone && a.status === '「' + near.name + '」 발판을 샀어요') : (!(placed && placed.screen) && a.statusErr && a.status === '보이는 발판이 없어요' && a.pads.offered === padsBefore.offered),
    '가까운 발판 하나: ' + (near ? near.id + ' bought, 「' + a.status + '」' : 'none on screen, nothing bought (' + a.status + ')'), { placed, near, padsBefore, after: a.pads, status: a.status });
  const c0 = await coins(P);
  await tapBtn(P, 'padAll');
  a = await st(P);
  ok(a.pads.onScreen === 0 && (a.statusErr ? a.status === '보이는 발판이 없어요' : /개를 샀어요/.test(a.status)), '보이는 발판 모두: none left on screen (' + a.status + ')', a.pads);
  ok(await coins(P) >= c0, 'buying pads here costs no coins');
  // ---- speed buttons are toggles
  await tapBtn(P, 'speed2');
  a = await st(P);
  ok(a.speed === 2 && a.status === '시간이 2배로 흘러요', '×2 (' + a.status + ')');
  await tapBtn(P, 'speed4');
  // ---- 튜토리얼 다시 보기: closes the panel, the replay tour runs
  await tapBtn(P, 'tutorial');
  await render(P, 4);
  a = await st(P);
  const onb = await P.evaluate(() => ({ mode: window.__FV.scene.onboard && window.__FV.scene.onboard.mode, paused: window.__FV.game.scene.isPaused('Game') }));
  ok(!a.panel && onb.mode === 'tour' && !onb.paused, '튜토리얼 다시 보기: the panel closes and the replay tour plays', onb);
  await P.evaluate(() => window.__FV.onboardSkip());
  await advance(P, 1);
  // ---- reload: 무제한 stays, ×1, the PIN again
  await P.evaluate(() => window.__FV.save());
  const cBeforeReload = await coins(P);
  await P.reload({ waitUntil: 'load' });
  await boot(P);
  a = await st(P);
  const sv2 = await P.evaluate(() => JSON.parse(localStorage.getItem('frostVillage.save.v1')));
  ok(a.unlimited && sv2.adminInf === 1 && sv2.adminUses === 2 && a.speed === 1 && a.chip && /∞/.test(a.chip.text) && !/×/.test(a.chip.text), 'after a reload: 코인 무제한 still on (saved), ×1, uses 2, the HUD note 「' + (a.chip && a.chip.text) + '」', { a: { unlimited: a.unlimited, speed: a.speed }, adminInf: sv2.adminInf, uses: sv2.adminUses });
  ok(!a.unlocked, 'after a reload: locked again');
  await openSettings(P);
  await versionTaps(P, 7);
  await render(P, 8);
  a = await st(P);
  ok(a.keypad && !a.panel, 'after a reload 7 taps ask for the PIN again');
  await typePin(P, TEST_PIN);
  await waitFor(P, () => window.__FV.adminState().panel && !window.__FV.adminState().busy, 30000);
  await render(P, 4);
  a = await st(P);
  const kept3 = await slotSave(P, 'admin');
  ok(a.backup && a.backup.kept && a.uses === 3 && kept3 && kept3.coins === before.coins, 'after the reload, PIN: the 관리자 사본 is still the village from before admin (' + (kept3 && kept3.coins) + ' coins; 「' + a.sub + '」)', { backup: a.backup });
  const cOn = await coins(P);
  await tapBtn(P, 'inf');
  a = await st(P);
  ok(!a.unlimited && (await coins(P)) === cOn && a.status === '코인 무제한을 껐어요', '코인 무제한 off: the coins stay ' + cOn + ' (were ' + cBeforeReload + ' before the reload)');
  await tapBtn(P, 'closeBtn');
  await render(P, 6);
  const pad2 = await P.evaluate(() => {
    const gs = window.__FV.scene, H = window.__FV;
    const list = gs.paidPads().filter((p) => p && p.active && !p.done && !p.maxed && p.label && p.label.visible && !p.items && p.remaining > 0 && p.remaining <= gs.economy.coins);
    list.sort((a, b) => a.remaining - b.remaining);
    const p = list[0];
    if (!p) return null;
    const c0 = gs.economy.coins;
    H.teleport(p.x, p.y);
    window.__step.run(3);
    H.teleport(p.x + 300, p.y + 150);
    window.__step.run(0.2);
    return { id: p.id, c0, c1: gs.economy.coins };
  });
  ok(pad2 && pad2.c1 < pad2.c0, '코인 무제한 off: paying a pad lowers the coins again (' + (pad2 && pad2.id) + ': ' + (pad2 && pad2.c0) + ' -> ' + (pad2 && pad2.c1) + ')', pad2);
  ok(LA.errors.length === 0, 'A: 0 page errors', LA.errors.slice(0, 5));
  allErrors.push(...LA.errors);
  await P.context().close();

  // ============================================================ B
  console.log('— B: 360x640 en, a new game');
  const { page: B, log: LB } = await newPage({}, { viewport: { width: 360, height: 640 }, locale: 'en-US' });
  const ob = await openAdmin(B, true);
  a = await st(B);
  ok(ob.keypadShown && a.panel, 'B: settings -> 7 taps -> keypad -> PIN -> the panel');
  ok(!a.buttons.some((b) => b.id === 'daynight'), 'B: no day clock yet: no 「Day / night」 row');
  await layoutCheck(B, 'panel 360x640 en');
  await shot(B, 'panel_360_en');
  await tapBtn(B, 'finish');
  a = await st(B);
  ok(a.statusErr && a.status === 'Nothing is being built', 'B: nothing being built: 「Nothing is being built」');
  await tapBtn(B, 'tutorial');
  a = await st(B);
  ok(a.panel && a.statusErr && /can't replay/.test(a.status), 'B: during the first loop the replay is not offered (as in settings): 「' + a.status + '」');
  await B.setViewportSize({ width: 412, height: 915 });
  await sleep(400);
  await render(B, 8);
  a = await st(B);
  ok(a.panel, 'B: rotated / resized to 412x915: the panel is still up');
  await layoutCheck(B, 'panel 412x915 en (after a resize)');
  await shot(B, 'panel_412_en');
  await tapBtn(B, 'close');
  await render(B, 8);
  ok(!(await st(B)).panel && !(await paused(B)), 'B: the ✕ closes it too, the game runs');
  ok(LB.errors.length === 0, 'B: 0 page errors', LB.errors.slice(0, 5));
  allErrors.push(...LB.errors);
  await B.context().close();

  // ============================================================ C
  console.log('— C: 360x640 ko, the late v4.2 village; then English');
  const keysC = Object.assign({}, LATE);
  try { const s0 = JSON.parse(keysC[SETTINGS_KEY] || '{}'); s0.lang = 'ko'; s0.observeAfter = 0; keysC[SETTINGS_KEY] = JSON.stringify(s0); } catch (e) { /* */ }
  const { page: C, log: LC } = await newPage(keysC, { viewport: { width: 360, height: 640 } });
  await openSettings(C);
  await versionTaps(C, 7);
  await render(C, 6);
  await layoutCheck(C, 'keypad 360x640 ko');
  await shot(C, 'keypad_360_ko');
  await typePin(C, TEST_PIN);
  await waitFor(C, () => window.__FV.adminState().panel && !window.__FV.adminState().busy, 30000);
  await render(C, 6);
  a = await st(C);
  ok(a.buttons.some((b) => b.id === 'daynight'), 'C: the late village has the day clock: 「낮/밤 바꾸기」 is there');
  // ADMIN-P3: at the spawn point the only pad on offer is the town promotion, far off the screen: 가까운 발판 하나 leaves it
  const offIds = (pg) => pg.evaluate(async () => { const A = await import(new URL('src/systems/Admin.js', location.href).href); return A.offeredPads(window.__FV.scene, false).map((p) => p.id).sort(); });
  const off0 = await offIds(C), nearC = await nearestOnScreen(C);
  await tapBtn(C, 'padNear');
  a = await st(C);
  const off1 = await offIds(C);
  ok(nearC ? /발판을 샀어요/.test(a.status) : (off0.length >= 1 && a.pads.onScreen === 0 && a.statusErr && a.status === '보이는 발판이 없어요' && same(off0, off1)),
    'C: 가까운 발판 하나 with ' + off0.length + ' pad(s) on offer (' + off0.join(',') + '), ' + a.pads.onScreen + ' on screen: ' + (nearC ? nearC.id + ' bought' : 'nothing bought') + ' (' + a.status + ')', { nearC, off0, off1, pads: a.pads });
  await C.evaluate(() => { const ad = window.__FV.game.scene.getScene('UI').admin; ad.status = ''; ad.statusErr = false; ad.buildContent(); });
  await layoutCheck(C, 'panel 360x640 ko');
  await shot(C, 'panel_360_ko');
  await C.evaluate(async () => { const s = await import(new URL('src/data/strings.js', location.href).href); s.setLang('en'); window.__FV.game.scene.getScene('UI').admin.layout(); });
  await C.setViewportSize({ width: 412, height: 915 });
  await sleep(400);
  await render(C, 8);
  a = await st(C);
  ok(a.panel && a.buttons.find((b) => b.id === 'closeBtn').text === 'Close admin mode', 'C: English at 412x915');
  await layoutCheck(C, 'panel 412x915 en (late village)');
  await shot(C, 'panel_412_en_late');
  ok(LC.errors.length === 0, 'C: 0 page errors', LC.errors.slice(0, 5));
  allErrors.push(...LC.errors);
  await C.context().close();

  // ============================================================ E
  console.log('— E: 412x915 ko, a tester village imported over the own one, then admin (ADMIN-C1/P1, P2)');
  const TR = await import('../../src/core/Transfer.js');
  const ownCode = (await TR.encodeVillage(LATE)).code, ownCoins = JSON.parse(LATE[SAVE_KEY]).coins;
  const { page: E, log: LE } = await newPage({ [SAVE_KEY]: PURE25, [SETTINGS_KEY]: JSON.stringify({ lang: 'ko', observeAfter: 0 }), [MOVE_KEY]: ownCode });
  ok((await slotSave(E, 'move')).coins === ownCoins && await slotSave(E, 'admin') === null, 'E: the 불러오기 spare holds the own village (' + ownCoins + ' coins), no 관리자 사본 yet');
  await openAdmin(E, true);
  a = await st(E);
  const cE = await coins(E), cidE = await E.evaluate(() => window.__FV.scene.cid);
  let adm = await slotSave(E, 'admin'), mv = await slotSave(E, 'move');
  ok(a.backup.copy && adm && adm.coins === cE && adm.cid === cidE && mv && mv.coins === ownCoins, 'E: open #1 -> the 관리자 사본 = this (imported) village (' + cE + '), the 불러오기 spare still the own village (' + (mv && mv.coins) + ')', { backup: a.backup, adm: adm && adm.coins, mv: mv && mv.coins });
  await tapBtn(E, 'coins100000');
  await tapBtn(E, 'closeBtn');
  await render(E, 8);
  await openAdmin(E, false);
  a = await st(E);
  adm = await slotSave(E, 'admin'); mv = await slotSave(E, 'move');
  // ((v4.2.0.2 fix) the village keeps selling in the frames the game runs between the two openings (customers pay on
  //  their own timing; the unchanged e5b27fa failed here in 2 of 3 runs, 12 / 48 coins earned): the +100,000 is in, plus
  //  whatever was earned meanwhile — never less, and not more than a few sales)
  const earned = (n) => n >= cE + 100000 && n < cE + 100000 + 2000;
  const cNow = await coins(E);
  ok(a.backup.kept && adm.coins === cE && mv.coins === ownCoins && earned(cNow), 'E: +100,000, open #2 -> both kept (관리자 사본 ' + adm.coins + ', spare ' + mv.coins + '; coins now ' + cNow + '); 「' + a.sub + '」', { backup: a.backup, cE, cNow });
  await shot(E, 'panel_kept_412_ko');
  await tapBtn(E, 'closeBtn');
  await render(E, 8);
  const rows1 = await openMoveIn(E);
  ok(/^예비 사본: .+까지 하던 마을$/.test(rows1['fm-undo'] || '') && /^관리자 사본: .+까지 하던 마을$/.test(rows1['fm-undo-admin'] || ''), 'E: 마을 옮기기 › 불러오기 shows both: 「' + rows1['fm-undo'] + '」 and 「' + rows1['fm-undo-admin'] + '」', rows1);
  await shot(E, 'move_rows_412_ko');
  // P2: a slot written again while the page lives -> its row shows the new village's date, not the first one it read
  const admCode0 = await E.evaluate(() => localStorage.getItem('frostVillage.move.admin'));
  await closeMove(E);
  await E.evaluate(async () => {
    const T = await import(new URL('src/core/Transfer.js', location.href).href);
    const d = await T.decodeVillage(localStorage.getItem(T.ADMIN_BACKUP_KEY));
    const sv = JSON.parse(d.keys['frostVillage.save.v1']); sv.t -= 3 * 86400000; d.keys['frostVillage.save.v1'] = JSON.stringify(sv);
    localStorage.setItem(T.ADMIN_BACKUP_KEY, (await T.encodeVillage(d.keys)).code);
  });
  const rows2 = await openMoveIn(E);
  await closeMove(E);
  await E.evaluate((c) => localStorage.setItem('frostVillage.move.admin', c), admCode0);
  const rows3 = await openMoveIn(E);
  ok(rows2['fm-undo-admin'] !== rows1['fm-undo-admin'] && rows3['fm-undo-admin'] === rows1['fm-undo-admin'] && rows2['fm-undo'] === rows1['fm-undo'], 'E: the row\'s date follows the code in the slot (P2): 「' + rows2['fm-undo-admin'] + '」 -> back to 「' + rows3['fm-undo-admin'] + '」', { rows1, rows2, rows3 });
  // 「관리자 사본으로 되돌리기」: the village from before admin comes back; the two swap; the own village stays the spare
  await E.evaluate(() => { window.__FV.lastMoveCheck = null; });
  await E.click('#fm-undo-admin-btn');
  await waitFor(E, () => window.__FV.lastMoveCheck && !document.getElementById('fm-confirm').hidden, 30000);
  const cardE = await E.evaluate(() => document.getElementById('fm-confirm').innerText);
  ok(/관리자 사본 마을로 되돌릴까요/.test(cardE) && cardE.includes(cE.toLocaleString('en-US') + ' 코인'), 'E: the card asks 「관리자 사본 마을로 되돌릴까요?」 and shows that village (' + cE + ' coins)', cardE);
  await Promise.all([E.waitForNavigation({ waitUntil: 'load', timeout: 60000 }), E.click('#fm-yes')]);
  await boot(E);
  const back = await E.evaluate(() => { const gs = window.__FV.scene; return { coins: gs.saved.coins, uses: gs.saved.adminUses, inf: gs.economy.unlimited, cid: gs.cid }; });
  adm = await slotSave(E, 'admin'); mv = await slotSave(E, 'move');
  ok(back.coins === cE && back.uses === undefined && !back.inf && back.cid === cidE, 'E: after 되돌리기 the village from before admin is back (' + back.coins + ' coins, never used admin)', back);
  ok(adm && earned(adm.coins) && adm.cid === cidE && adm.adminUses === 2 && mv && mv.coins === ownCoins, 'E: the admin\'d village (' + (adm && adm.coins) + ') now sits in the 관리자 사본 slot; the own village (' + (mv && mv.coins) + ') is still the 불러오기 spare', { adm: adm && [adm.coins, adm.adminUses], mv: mv && mv.coins });
  ok(LE.errors.length === 0, 'E: 0 page errors', LE.errors.slice(0, 5));
  allErrors.push(...LE.errors);
  await E.context().close();

  // ============================================================ D
  console.log('— D: navigator.webdriver false (a phone)');
  const { page: D, log: LD } = await newPage({}, { viewport: { width: 360, height: 640 }, webdriverFalse: true });
  ok(await D.evaluate(() => navigator.webdriver === false && typeof window.__FV_ADMIN_TEST_DIGEST === 'string'), 'D: webdriver false, the test digest set on the page');
  await openSettings(D);
  await versionTaps(D, 7);
  await render(D, 8);
  a = await st(D);
  ok(a.keypad, 'D: 7 taps still open the keypad');
  await typePin(D, TEST_PIN);
  await render(D, 4);
  a = await st(D);
  ok(!a.panel && !a.unlocked && a.err === '비밀번호가 달라요', 'D: the test digest is ignored: the test PIN is refused', a);
  ok(LD.errors.length === 0, 'D: 0 page errors', LD.errors.slice(0, 5));
  allErrors.push(...LD.errors);
  await D.context().close();
} catch (e) { fail++; failed.push('FATAL'); console.log('FATAL', (e && e.stack) || e); }
await browser.close();
await srv.close();
console.log(`\nadmin: ${pass} ok, ${fail} failed  (wall ${((Date.now() - t0) / 1000) | 0}s)` + (failed.length ? '\n  failed: ' + failed.join(' | ') : '') + (shotNotes.length ? '\n  screenshots skipped: ' + shotNotes.join(', ') : ''));
process.exit(fail ? 1 : 0);
