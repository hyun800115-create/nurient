// (v4.2.1) 마을 옮기기 · Move village — the whole village as one text code (src/core/Transfer.js, src/scenes/MovePanel.js)
//   node tools/test/transfer.mjs [--node] [--shots <dir>]      (Playwright Chromium as for the other suites; --node: codec only)
//
// Node (the codec, src/core/Transfer.js):
//   - which keys travel (save, .chat, .story, settings, title prefs) and which never do (save.backup(.2), *.bad, move.*)
//   - the late v4.2 fixture (tools/test/fixtures/v42_village_late.json: 135,000 coins, office + bank + depot, four staff,
//     chats) round-trips compressed and plain; line breaks / spaces / zero-width characters / a header line / text
//     around the code are ignored; a cut code (30 cut points), an edited one (40 single-character changes + inserts),
//     a foreign text, another app's code, a newer code, a code without a village and a newer save are all refused with
//     the right reason; foreign keys inside a code are dropped
//   - the dry run IS the game's load path: for every v3.5 / v4.1 fixture (and the late v4.2 one) dryRun's save equals
//     Save.load() of the same string stored in a localStorage (a Map-backed one in Node)
//   - applyVillage: the current village goes to the spare (move.backup, a code that reads back to it), the new keys are
//     written exactly, the old ones that the new village does not have are gone; a storage that fills up half-way puts
//     the old village back byte for byte and lifts the no-save guard again
//   - without CompressionStream: a plain ('j') code, still read anywhere; a compressed code there -> 'cantOpen'
// Browser (the real game, real taps and the real DOM sheet):
//   A  late v4.2 village, 390x844: settings -> 「마을 옮기기」 (a real tap on the Phaser button) -> the code; the game
//      saved first; the code holds exactly the stored game keys; 「복사하기」 puts it on the clipboard; a tap on the sheet
//      never reaches the settings panel underneath; closing gives the input back
//   B  a fresh profile (new game): broken / cut / edited / foreign / newer codes refused with their message and nothing
//      changed; the good code -> its summary (135,000 coins) -> 「바꾸기」: the stored keys equal the code's, the spare
//      holds the fresh village, the old game's autosave / pagehide / chat save cannot write over it (window.__FV_NO_SAVE);
//      reload -> the same village (coins, buildings, residents, office staff, dog, chat memory, settings)
//   C  round trip twice: B's village exported again -> a fresh profile -> the same village; then a v4.1 save inside a
//      code -> loads exactly like the stored v4.1 save; then 「예비 사본으로 되돌리기」 brings the round-trip village back
//   D  no CompressionStream (deleted before the page runs): a plain code; a compressed code -> 'cantOpen'; the plain one
//      imports and boots
//   E  360x640 with an Android bridge stand-in (window.SnowbloomAndroid): 「공유하기」 / 「복사하기」 / 「붙여넣기」 go
//      through the bridge; no overlaps, nothing wider than the screen (Korean and English); the Phaser footer buttons
//   Screenshots: export / import confirm at 390x844 and 360x640 (--shots <dir>, default docs/previews/screens/transfer).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const argv = process.argv.slice(2);
const NODE_ONLY = argv.includes('--node');
const SHOTS = argv.includes('--shots') ? path.resolve(argv[argv.indexOf('--shots') + 1]) : path.join(ROOT, 'docs', 'previews', 'screens', 'transfer');
const fail = [];
const report = {};
const check = (name, ok, info = '') => { console.log((ok ? '  ok  ' : ' FAIL ') + name + (info !== '' && info != null ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 400) : '')); if (!ok) fail.push(name); };
const clone = (o) => JSON.parse(JSON.stringify(o));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------- a Map-backed localStorage for Node
/** a Map-backed localStorage; opts.quota = the most characters (keys + values) it holds, like a browser's quota */
function memStorage(init, opts = {}) {
  const m = new Map(Object.entries(init || {}));
  const used = () => { let n = 0; for (const [k, v] of m) n += k.length + v.length; return n; };
  return {
    get length() { return m.size; },
    key(i) { return Array.from(m.keys())[i] ?? null; },
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) {
      v = String(v);
      if (opts.quota != null && used() - (m.has(k) ? k.length + m.get(k).length : 0) + k.length + v.length > opts.quota) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      m.set(k, v);
    },
    removeItem(k) { m.delete(k); },
    clear() { m.clear(); },
    dump() { return Object.fromEntries(Array.from(m.entries()).sort()); },
  };
}
globalThis.window = globalThis.window || {};
const T = await import('../../src/core/Transfer.js');
const SV = await import('../../src/core/Save.js');
const { SAVE_KEY, CHAT_KEY, SETTINGS_KEY, BACKUP_KEY, BAD_KEY, migrateSave, Save } = SV;
const FIX = path.join(HERE, 'fixtures');
const LATE = JSON.parse(fs.readFileSync(path.join(FIX, 'v42_village_late.json'), 'utf8')).keys;
const TITLE_KEY = 'frostVillage.title.v1';

console.log('— Node: the code');
check('the late v4.2 fixture: save v7, 135,000 coins, chat record, settings, title prefs', JSON.parse(LATE[SAVE_KEY]).v === 7 && JSON.parse(LATE[SAVE_KEY]).coins === 135000 && !!LATE[CHAT_KEY] && !!LATE[SETTINGS_KEY] && !!LATE[TITLE_KEY], Object.keys(LATE));
// which keys travel
{
  const yes = [SAVE_KEY, CHAT_KEY, SAVE_KEY + '.story', SETTINGS_KEY, TITLE_KEY, 'frostVillage.future.v9'];
  const no = [BACKUP_KEY, BACKUP_KEY + '.2', BAD_KEY, 'frostVillage.something.bad', T.MOVE_BACKUP_KEY, 'other.key', 'frostVillage.', 'frostVillage.a b', '__proto__'];
  check('every game key travels (save, chat memory, story record, settings, title prefs, a future key)', yes.every(T.isGameKey), yes.filter((k) => !T.isGameKey(k)));
  check('the spare copies never travel (save.backup, .backup.2, *.bad, move.backup, other prefixes)', no.every((k) => !T.isGameKey(k)), no.filter(T.isGameKey));
  const st = memStorage(Object.assign({}, LATE, { [BACKUP_KEY]: 'x', [BACKUP_KEY + '.2']: 'y', [BAD_KEY]: 'z', [T.MOVE_BACKUP_KEY]: 'w', other: 'o' }));
  check('snapshotKeys takes exactly the game keys', same(Object.keys(T.snapshotKeys(st)), Object.keys(LATE).sort()), Object.keys(T.snapshotKeys(st)));
}
// round trip
const encZ = await T.encodeVillage(LATE);
const encJ = await T.encodeVillage(LATE, { compress: false });
report.lateCodeChars = encZ.chars; report.latePlainChars = encJ.chars; report.lateJsonBytes = encZ.payloadBytes;
check('late village -> code (deflate-raw)', encZ.comp === 'z' && /^SNOWBLOOM1\.z\.\d+\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/.test(encZ.code), encZ.code.slice(0, 40));
console.log('       code size: ' + encZ.chars + ' characters compressed, ' + encJ.chars + ' plain (JSON ' + encZ.payloadBytes + ' bytes)');
for (const [nm, e] of [['compressed', encZ], ['plain', encJ]]) {
  const d = await T.decodeVillage(e.code);
  check('the ' + nm + ' code reads back to exactly the same keys', d.ok && same(d.keys, Object.fromEntries(Object.entries(LATE).sort())), d.error);
}
{
  const wrapped = '[행복한 눈꽃마을 이야기] 마을 옮기기 코드 · 서리마을 135,000코인\n안녕! 이거 보관해 둬\n' + encZ.code.replace(/(.{61})/g, '$1\n').replace(/(.{17})/g, '$1 ').replace(/(.{29})/g, '$1\u200b') + '\n\n고마워 :)';
  const d = await T.decodeVillage(wrapped);
  check('line breaks, spaces, zero-width characters, a header line and text around the code are ignored', d.ok && d.keys[SAVE_KEY] === LATE[SAVE_KEY], d.error);
  // an e-mail reply quoting the code ('> ' at every line start) and soft hyphens some renderers put into long words
  const quoted = await T.decodeVillage('> 받은 코드\r\n' + encZ.code.replace(/(.{70})/g, '$1\r\n> ').replace(/^/, '> ').replace(/(.{43})/g, '$1\u00ad'));
  check('an e-mail reply\'s "> " quote marks and soft hyphens are ignored too', quoted.ok && quoted.keys[SAVE_KEY] === LATE[SAVE_KEY], quoted.error);
  const twice = await T.decodeVillage(encZ.code.slice(0, 900) + '\n' + encZ.code);
  check('a cut copy followed by the whole code: the whole one is read', twice.ok);
}
// cut / edited / foreign
{
  const c = encZ.code, bad = [];
  for (let i = 0; i < 30; i++) {
    const at = 11 + Math.floor((c.length - 12) * i / 29);
    const r = await T.decodeVillage(c.slice(0, at));
    if (r.ok || r.error !== 'cut') bad.push([at, r.ok, r.error]);
  }
  check('a code cut at any of 30 points is refused as cut off', !bad.length, bad.slice(0, 5));
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  const AL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const dataAt = c.indexOf('.', 13) + 1, dataEnd = c.lastIndexOf('.');
  const edits = [];
  for (let k = 0; k < 40; k++) {
    const i = dataAt + Math.floor(rnd() * (dataEnd - dataAt));
    let ch = AL[Math.floor(rnd() * AL.length)];
    if (ch === c[i]) ch = c[i] === 'A' ? 'B' : 'A';
    const r = await T.decodeVillage(c.slice(0, i) + ch + c.slice(i + 1));
    if (r.ok || r.error !== 'damaged') edits.push([i, r.ok, r.error]);
  }
  check('40 single-character changes are all refused as damaged (CRC32)', !edits.length, edits.slice(0, 5));
  const ins = await T.decodeVillage(c.slice(0, dataAt + 50) + 'Q' + c.slice(dataAt + 50));
  const del = await T.decodeVillage(c.slice(0, dataAt + 50) + c.slice(dataAt + 51));
  const crcEdit = await T.decodeVillage(c.slice(0, -1) + (c.endsWith('0') ? '1' : '0'));
  check('an inserted / a lost / a changed checksum character is refused', !ins.ok && !del.ok && crcEdit.error === 'damaged', [ins.error, del.error, crcEdit.error]);
  const foreign = await T.decodeVillage('안녕하세요! 오늘 날씨 좋네요');
  const json = await T.decodeVillage(JSON.stringify({ keys: LATE }));
  // a well-formed code of another app (right checksum, other app id), a newer format, a code without a village
  const mk = async (payload) => {
    const b64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const head = 'SNOWBLOOM1.j.' + b64.length + '.' + b64;
    return head + '.' + T.crc32(head);
  };
  const other = await T.decodeVillage(await mk({ app: 'otherGame', fmt: 1, keys: { [SAVE_KEY]: '{}' } }));
  const newerFmt = await T.decodeVillage(await mk({ app: 'snowbloom', fmt: 2, keys: {} }));
  const newerTag = await T.decodeVillage('SNOWBLOOM2.z.4.abcd.00000000');
  const noVillage = await T.decodeVillage(await mk({ app: 'snowbloom', fmt: 1, keys: { [SETTINGS_KEY]: '{}' } }));
  check('foreign text / plain JSON -> not a code; another app\'s code -> foreign; newer -> newer; no save -> noVillage',
    foreign.error === 'notCode' && json.error === 'notCode' && other.error === 'foreign' && newerFmt.error === 'newer' && newerTag.error === 'newer' && noVillage.error === 'noVillage',
    [foreign.error, json.error, other.error, newerFmt.error, newerTag.error, noVillage.error]);
  const evil = await T.decodeVillage(await mk({ app: 'snowbloom', fmt: 1, keys: { [SAVE_KEY]: LATE[SAVE_KEY], [BACKUP_KEY]: 'x', 'other.key': 'y', 'frostVillage.move.backup': 'z', [CHAT_KEY]: 5 } }));
  check('keys that are not game keys (or not text) inside a code are dropped, never written', evil.ok && same(Object.keys(evil.keys), [SAVE_KEY]) && evil.dropped.length === 4, evil.dropped);
  const future = T.dryRun({ [SAVE_KEY]: JSON.stringify(Object.assign(JSON.parse(LATE[SAVE_KEY]), { v: 99 })) });
  const junk = T.dryRun({ [SAVE_KEY]: '[1,2,3]' });
  check('a save from a newer game -> newerSave; a broken save -> badSave', future.error === 'newerSave' && junk.error === 'badSave', [future.error, junk.error]);
}
// the dry run is the game's load path
{
  const files = fs.readdirSync(FIX).filter((f) => /^v(35|41)_save_.*\.json$/.test(f)).sort();
  const bad = [];
  for (const f of files.concat(['late'])) {
    const raw = f === 'late' ? LATE[SAVE_KEY] : fs.readFileSync(path.join(FIX, f), 'utf8');
    const d = T.dryRun({ [SAVE_KEY]: raw });
    window.localStorage = memStorage({ [SAVE_KEY]: raw });
    const loaded = Save.load();
    if (!d.ok || !same(d.save, loaded) || !same(d.save, migrateSave(JSON.parse(raw)))) bad.push(f);
  }
  delete window.localStorage;
  check('dry run == Save.load() of the same stored string, for ' + (files.length + 1) + ' saves (v3.5, v4.1, late v4.2)', !bad.length, bad);
  const s41 = JSON.parse(fs.readFileSync(path.join(FIX, 'v41_save_smart_46min.json'), 'utf8'));
  const sm = T.dryRun({ [SAVE_KEY]: JSON.stringify(s41) }).summary;
  check('a v4.1 save in a code: summary from the migrated save (coins kept, from v6)', sm.coins === s41.coins && sm.fromV === 6, sm);
}
// apply
{
  const fresh = { [SAVE_KEY]: JSON.stringify({ v: 7, coins: 12, cid: 'freshcid' }), [CHAT_KEY]: '{"v":1,"cid":"freshcid","chat":{}}', [SETTINGS_KEY]: '{"sound":false}', [BACKUP_KEY]: 'old-backup' };
  const st = memStorage(fresh);
  const r = await T.applyVillage(LATE, { storage: st });
  const after = st.dump();
  const gameKeys = Object.fromEntries(Object.entries(after).filter(([k]) => T.isGameKey(k)));
  check('apply: the stored game keys are exactly the code\'s; the save\'s own backup is left alone', r.ok && same(gameKeys, Object.fromEntries(Object.entries(LATE).sort())) && after[BACKUP_KEY] === 'old-backup', Object.keys(after));
  check('apply: the running game may not save any more (window.__FV_NO_SAVE)', window.__FV_NO_SAVE === true);
  // (and not its settings either: a late zoom / water-quality save while the page reloads)
  window.localStorage = st;
  SV.Settings.save();
  delete window.localStorage;
  check('apply: a settings save of the old game is blocked too (the code\'s settings stay)', st.getItem(SETTINGS_KEY) === LATE[SETTINGS_KEY]);
  const spare = await T.decodeVillage(after[T.MOVE_BACKUP_KEY] || '');
  check('apply: the village that was there is the spare (move.backup reads back to it)', spare.ok && spare.keys[SAVE_KEY] === fresh[SAVE_KEY] && spare.keys[CHAT_KEY] === fresh[CHAT_KEY] && !spare.keys[BACKUP_KEY], spare.error);
  window.__FV_NO_SAVE = undefined;
  // a storage that fills up half-way: the new save fits, the chat record does not
  const size = (o) => Object.entries(o).reduce((n, [k, v]) => n + k.length + v.length, 0);
  const spareChars = T.MOVE_BACKUP_KEY.length + (await T.encodeVillage(T.snapshotKeys(memStorage(fresh)))).chars;
  const quota = size(fresh) + spareChars + LATE[SAVE_KEY].length + 200;
  const old0 = Object.assign({}, fresh, { [T.MOVE_BACKUP_KEY]: 'the spare of an earlier move' });
  const st2 = memStorage(old0, { quota: quota + 40 });
  const r2 = await T.applyVillage(LATE, { storage: st2 });
  const back = st2.dump();
  check('apply on a storage that fills up half-way: refused (noRoom); every key back byte for byte (the earlier spare too); saving allowed again',
    !r2.ok && r2.error === 'noRoom' && same(back, Object.fromEntries(Object.entries(old0).sort())) && !window.__FV_NO_SAVE, [r2.error, Object.keys(back)]);
  const st3 = memStorage(fresh, { quota: size(fresh) + 10 });
  const r3a = await T.applyVillage(LATE, { storage: st3 });
  check('apply with no room even for the spare: refused, nothing changed', !r3a.ok && same(st3.dump(), Object.fromEntries(Object.entries(fresh).sort())) && !window.__FV_NO_SAVE, r3a.error);
  const r3 = await T.applyVillage(LATE, { storage: null });
  check('apply with no storage at all: refused', !r3.ok, r3.error);
  window.__FV_NO_SAVE = undefined;
}
// no CompressionStream
{
  const CS = globalThis.CompressionStream, DS = globalThis.DecompressionStream;
  delete globalThis.CompressionStream; delete globalThis.DecompressionStream;
  try {
    const e = await T.encodeVillage(LATE);
    const d = await T.decodeVillage(e.code);
    const z = await T.decodeVillage(encZ.code);
    check('without CompressionStream: a plain code that reads back; a compressed code -> cantOpen', e.comp === 'j' && d.ok && same(d.keys, Object.fromEntries(Object.entries(LATE).sort())) && z.error === 'cantOpen', [e.comp, d.ok, z.error]);
  } finally { globalThis.CompressionStream = CS; globalThis.DecompressionStream = DS; }
}
delete globalThis.window;

if (!NODE_ONLY) await browserPart();
console.log('\nreport: ' + JSON.stringify(report));
console.log(fail.length ? '\ntransfer: ' + fail.length + ' FAILED' : '\ntransfer: all ok');
process.exit(fail.length ? 1 : 0);

// ================================================================ the real game
async function browserPart() {
  const { start } = await import('./serve.mjs');
  const { launch, openPage, tapStart, sleep, waitFor } = await import('./pw.mjs');
  const { installStepper, advance, render } = await import('./fv_step.mjs');
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await start(0, { prefix: '/fv/' });
  const browser = await launch();
  const origin = srv.url.replace(/\/fv\/$/, '');
  const shot = async (page, n) => { await page.screenshot({ path: path.join(SHOTS, n + '.png') }); };
  const errs = [];

  const newPage = async (keys, opts = {}) => {
    const o = await openPage(browser, srv.url + 'index.html', Object.assign({ viewport: { width: 390, height: 844 }, dpr: 2 }, opts));
    await o.ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin }).catch(() => {});
    await o.page.evaluate((k) => { localStorage.clear(); for (const n in k) localStorage.setItem(n, k[n]); }, keys || {});
    await o.page.reload({ waitUntil: 'load' });
    return o;
  };
  const boot = async (page) => {
    await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
    await sleep(400);
    await tapStart(page);
    await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player && window.__FV.v42, 180000);
    await installStepper(page);
    await advance(page, 0.3);
  };
  const stored = (page) => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
  const gameKeys = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => T.isGameKey(k)).sort());
  /** what "the same village" means here */
  const village = (page) => page.evaluate(async () => {
    const gs = window.__FV.scene;
    await gs.residentChat.ensure();
    const ch = window.__FV.chat();
    const v = window.__FV.v42.state();
    return {
      coins: gs.economy.coins,
      cid: gs.cid,
      sites: Object.keys(gs.sites).sort().map((k) => k + ':' + gs.sites[k].state + ':' + (gs.sites[k].building || '')),
      // (who lives here — the saved list; the walking residents are spawned a few at a time after the load)
      residents: gs.life ? { moved: gs.life.moved.slice().sort(), waiting: gs.life.waiting.slice().sort() } : null,
      staff: v.office ? v.office.staff : null,
      office: v.office ? { built: v.office.built, bank: v.office.bank } : null,
      dog: gs.dog ? JSON.stringify(gs.dog.serialize()) : null,
      done: window.__FV.state().done.length,
      // (the chat village's memory: talks per resident, rumours; the roster follows who is walking about)
      chat: { talks: ch.talks, gossip: ch.gossip, mems: Object.fromEntries(Object.entries(gs.residentChat.village.mems).filter(([, m]) => m.talks).map(([k, m]) => [k, m.talks]).sort()) },
      settings: JSON.stringify(window.__FV.v42.settings()),
      settlers: gs.civic ? gs.civic.state().settlers : null,
    };
  });
  const sameVillage = (a, b) => {
    const diff = [];
    for (const k of Object.keys(a)) if (k !== 'coins' && !same(a[k], b[k])) diff.push(k + ': ' + JSON.stringify(a[k]).slice(0, 160) + ' vs ' + JSON.stringify(b[k]).slice(0, 160));
    if (Math.abs(a.coins - b.coins) > Math.max(50, a.coins * 0.01)) diff.push('coins ' + a.coins + ' vs ' + b.coins);
    return diff;
  };
  /** settings -> 「마을 옮기기」 (a real tap on the Phaser button); the sheet opens on 내보내기, which saves and makes the code */
  const openMove = async (page, tab) => {
    await page.evaluate(() => { window.__FV.lastMoveCode = null; const ui = window.__FV.game.scene.getScene('UI'); if (!ui.panelOpen) ui.openSettings(true); });
    await render(page, 2);
    const b = await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); const m = ui.panelItems.find((o) => o.moveBtn); return m ? { x: m.x, y: m.y } : null; });
    const bb = await (await page.$('canvas')).boundingBox();
    const s = bb.width / 720;
    await page.touchscreen.tap(bb.x + b.x * s, bb.y + b.y * s);
    const tapped = await page.waitForFunction(() => window.__FV.moveOpen === true, null, { timeout: 5000 }).then(() => true).catch(() => false);
    if (!tapped) await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); ui.panelItems.find((o) => o.moveBtn).emit('pointerdown'); });
    await waitFor(page, () => window.__FV.moveOpen === true, 10000);
    await waitFor(page, () => !!window.__FV.lastMoveCode, 30000);
    if (tab === 'in') await page.click('#fm-tab-in');
    return tapped;
  };
  const exportCode = async (page) => {
    await waitFor(page, () => window.__FV.lastMoveCode && document.getElementById('fm-code-out').value.length > 50, 30000);
    return page.evaluate(() => document.getElementById('fm-code-out').value);
  };
  const tryCode = async (page, text) => {
    await page.fill('#fm-code-in', text);
    await page.evaluate(() => { window.__FV.lastMoveCheck = null; });
    await page.click('#fm-load');
    await waitFor(page, () => window.__FV.lastMoveCheck, 30000);
    await sleep(100);
    return page.evaluate(() => ({ check: window.__FV.lastMoveCheck, msg: document.getElementById('fm-msg-in').textContent, card: !document.getElementById('fm-confirm').hidden, cardText: document.getElementById('fm-confirm').innerText }));
  };
  /** 바꾸기, with the page's reload held back so the guard can be tested; returns the stored keys right after */
  const replace = async (page, holdReload = true) => {
    if (!holdReload) {
      // the real thing: 「바꾸기」 -> the page reloads by itself -> the title -> the new village
      await Promise.all([page.waitForNavigation({ waitUntil: 'load', timeout: 60000 }), page.click('#fm-yes')]);
      return boot(page);
    }
    await page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); ui.movePanel.host.reload = () => { window.__reloadAsked = (window.__reloadAsked || 0) + 1; }; });
    await page.click('#fm-yes');
    await waitFor(page, () => window.__FV.lastMoveApplied || /err/.test(document.getElementById('fm-msg-in').className), 30000);
    await sleep(600);
  };
  const reloadBoot = async (page) => { await page.reload({ waitUntil: 'load' }); await boot(page); };

  try {
    // ============================================================ A: export the late village
    console.log('— A: export (late v4.2 village, 390x844)');
    const A = await newPage(LATE);
    await boot(A.page);
    const vA = await village(A.page);
    check('A: the late village runs (135,000 coins, office with four staff, chat memory)', vA.coins >= 135000 && vA.staff && vA.staff.length === 4 && vA.chat.talks > 0, { coins: vA.coins, staff: vA.staff, talks: vA.chat.talks });
    const t0 = await A.page.evaluate(() => Date.now());
    const tapped = await openMove(A.page);
    check('A: the 「마을 옮기기」 button in the settings panel opens the sheet (a real tap)', tapped);
    const textA = await exportCode(A.page);
    const sA = await stored(A.page);
    const saveA = JSON.parse(sA[SAVE_KEY]);
    check('A: the game saved itself first (the stored save is from this moment)', saveA.t >= t0 && saveA.coins === vA.coins, { t: saveA.t, t0, coins: saveA.coins });
    const dA = await T.decodeVillage(textA);
    check('A: the code holds exactly the stored game keys (save, chat memory, settings, title prefs)', dA.ok && same(dA.keys, gameKeys(sA)) && !!dA.keys[CHAT_KEY] && !!dA.keys[TITLE_KEY], dA.ok ? Object.keys(dA.keys) : dA.error);
    const lm = await A.page.evaluate(() => window.__FV.lastMoveCode);
    report.lateCodeInGameChars = textA.length;
    check('A: the code and its size are shown; it pastes fine (late village: ' + textA.length + ' characters)', /코드 길이 [\d,]+자/.test(await A.page.textContent('#fm-size')) && textA.length < 60000 && lm.comp === 'z', await A.page.textContent('#fm-size'));
    const ui1 = await A.page.evaluate(() => ({ input: window.__FV.game.scene.getScene('UI').input.enabled, kb: window.__FV.game.input.keyboard.enabled, paused: window.__FV.game.scene.isPaused('Game') }));
    check('A: while the sheet is open the Phaser UI takes no input, the keyboard is the sheet\'s, the village waits', !ui1.input && !ui1.kb && ui1.paused, ui1);
    await shot(A.page, 'export_390x844');
    await A.page.click('#fm-copy');
    await sleep(300);
    const clipA = await A.page.evaluate(() => navigator.clipboard.readText().catch((e) => 'ERR ' + e));
    check('A: 「복사하기」 puts exactly the code on the clipboard', clipA === textA && /복사했어요/.test(await A.page.textContent('#fm-msg-out')), clipA.slice(0, 60));
    // a tap on the sheet right over 「처음부터 하기」 of the settings panel underneath must never press it
    const resetAt = await A.page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); const r = ui.panelItems.find((o) => o.text && o.text.text === '처음부터 하기'); return r ? { x: r.x, y: r.y } : null; });
    const cbb = await (await A.page.$('canvas')).boundingBox();
    const before = await stored(A.page);
    for (let i = 0; i < 3; i++) { await A.page.touchscreen.tap(cbb.x + resetAt.x * cbb.width / 720, cbb.y + resetAt.y * cbb.width / 720); await render(A.page, 1); }
    const conf = await A.page.evaluate(() => window.__FV.game.scene.getScene('UI').panelConfirm);
    check('A: taps on the sheet over 「처음부터 하기」 never reach the Phaser panel underneath', conf === false && same(gameKeys(await stored(A.page)), gameKeys(before)), { panelConfirm: conf });
    // 불러오기 tapped while the export (save + compress, async) is still running: answered, never silently dropped;
    // and 내보내기 opened while a code is being checked still makes its code
    await A.page.click('#fm-close');
    await A.page.evaluate((t) => {
      const p = window.__FV.game.scene.getScene('UI').movePanel;
      window.__FV.lastMoveCheck = null;
      p.open();
      window.__raceExporting = p.making;
      document.getElementById('fm-tab-in').click();
      document.getElementById('fm-code-in').value = t;
      document.getElementById('fm-load').click();
    }, textA);
    await waitFor(A.page, () => window.__FV.lastMoveCheck && !document.getElementById('fm-confirm').hidden, 30000).catch(() => {});
    const race1 = await A.page.evaluate(() => ({ exporting: window.__raceExporting, check: !!(window.__FV.lastMoveCheck && window.__FV.lastMoveCheck.ok), card: !document.getElementById('fm-confirm').hidden }));
    await A.page.click('#fm-close');
    await A.page.evaluate((t) => {
      const p = window.__FV.game.scene.getScene('UI').movePanel;
      window.__FV.lastMoveCode = null;
      p.open('in');
      document.getElementById('fm-code-in').value = t;
      document.getElementById('fm-load').click();
      document.getElementById('fm-tab-out').click();
    }, textA);
    await waitFor(A.page, () => !!window.__FV.lastMoveCode && document.getElementById('fm-code-out').value.length > 50, 30000).catch(() => {});
    const race2 = await A.page.evaluate(() => ({ code: document.getElementById('fm-code-out').value.length, copy: !document.getElementById('fm-copy').disabled }));
    check('A: 불러오기 tapped while the code is still being made is answered; 내보내기 opened during a check makes its code', race1.exporting && race1.check && race1.card && race2.code > 1000 && race2.copy, { race1, race2 });
    await A.page.click('#fm-close');
    const ui2 = await A.page.evaluate(() => ({ input: window.__FV.game.scene.getScene('UI').input.enabled, kb: window.__FV.game.input.keyboard.enabled, panel: window.__FV.game.scene.getScene('UI').panelOpen, open: window.__FV.moveOpen }));
    check('A: closing the sheet gives the input back (the settings panel is still there)', ui2.input && ui2.kb && ui2.panel && !ui2.open, ui2);
    errs.push(...A.log.errors);
    await A.ctx.close();

    // ============================================================ B: import into a fresh profile
    console.log('— B: import into a fresh profile (new game)');
    const B = await newPage({});
    await boot(B.page);
    const vFresh = await village(B.page);
    await openMove(B.page, 'in');
    const freshB = gameKeys(await stored(B.page));
    const cases = [
      ['empty', '   ', /코드를 붙여 넣어/],
      ['cut off', textA.slice(0, Math.floor(textA.length * 0.6)), /잘렸어요/],
      ['one character changed', textA.slice(0, 300) + (textA[300] === 'A' ? 'B' : 'A') + textA.slice(301), /바뀌었거나 빠졌어요/],
      ['foreign text', '오늘 저녁 뭐 먹지?', /마을 코드가 아니에요/],
      ['another app\'s code', await (async () => { const b64 = Buffer.from(JSON.stringify({ app: 'other', fmt: 1, keys: {} })).toString('base64url'); const h = 'SNOWBLOOM1.j.' + b64.length + '.' + b64; return h + '.' + T.crc32(h); })(), /이 게임의 마을 코드가 아니에요/],
      ['a newer game\'s code', 'SNOWBLOOM2.z.4.abcd.12345678', /더 새 버전/],
    ];
    for (const [nm, text, re] of cases) {
      const r = await tryCode(B.page, text);
      const now = gameKeys(await stored(B.page));
      const guard = await B.page.evaluate(() => !!window.__FV_NO_SAVE);
      check('B: ' + nm + ' -> refused with its message, nothing changed', r.check && !r.check.ok && re.test(r.msg) && !r.card && same(now, freshB) && !guard, { err: r.check && r.check.error, msg: r.msg });
    }
    await shot(B.page, 'import_error_390x844');
    const rB = await tryCode(B.page, textA);
    check('B: the good code -> what it holds (서리마을 · 135,000 코인, office, chat memory) and the question', rB.check.ok && rB.card && /135,000 코인/.test(rB.cardText) && /촌장 사무실/.test(rB.cardText) && /수다 기억/.test(rB.cardText) && /예비 사본으로 남겨 둬요/.test(rB.cardText), rB.cardText);
    await shot(B.page, 'import_confirm_390x844');
    const resetGuard0 = await B.page.evaluate(() => !!window.__FV_NO_SAVE);
    await replace(B.page);
    const sB = await stored(B.page);
    check('B: after 「바꾸기」 the stored game keys are exactly the code\'s', same(gameKeys(sB), dA.keys), Object.keys(gameKeys(sB)));
    const spareB = await T.decodeVillage(sB[T.MOVE_BACKUP_KEY] || '');
    check('B: the fresh village is kept as the spare copy (move.backup)', spareB.ok && same(spareB.keys, freshB), spareB.error);
    // the old game tries every way it has to write its village back
    await B.page.evaluate(() => {
      const gs = window.__FV.scene;
      window.__FV.save();
      window.dispatchEvent(new Event('pagehide'));
      gs.onVis && gs.onVis();
      if (gs.residentChat) { gs.residentChat.dirty = true; gs.residentChat.save(); }
    });
    await advance(B.page, 12);
    const sB2 = await stored(B.page);
    check('B: the guard: the old game\'s autosave / pagehide / chat save cannot write over the new village', !resetGuard0 && same(gameKeys(sB2), dA.keys) && (await B.page.evaluate(() => window.__FV_NO_SAVE === true)), Object.keys(gameKeys(sB2)));
    check('B: the page asks to reload', (await B.page.evaluate(() => window.__reloadAsked)) === 1);
    await reloadBoot(B.page);
    const vB = await village(B.page);
    const loadedB = await B.page.evaluate(() => window.__FV.scene.saved);
    check('B: the game booted from exactly the imported save (its loaded save == the code\'s, through Save.js)', same(loadedB, migrateSave(JSON.parse(dA.keys[SAVE_KEY]))));
    const diffB = sameVillage(vA, vB);
    check('B: the same village after the reload (coins, buildings, residents, office staff, dog, chat memory, settings)', !diffB.length && vB.cid === vA.cid && vB.cid !== vFresh.cid, { diff: diffB, coins: [vA.coins, vB.coins] });
    report.coinsBefore = vA.coins; report.coinsAfter = vB.coins;
    errs.push(...B.log.errors);

    // ============================================================ C: round trip twice, a v4.1 code, 되돌리기
    console.log('— C: round trip twice, a v4.1 save in a code, back to the spare');
    await openMove(B.page);
    const textB = await exportCode(B.page);
    const dB = await T.decodeVillage(textB);
    check('C: the imported village exports again (the chat memory and the settings unchanged)', dB.ok && dB.keys[SETTINGS_KEY] === dA.keys[SETTINGS_KEY] && dB.keys[TITLE_KEY] === dA.keys[TITLE_KEY] && JSON.parse(dB.keys[CHAT_KEY]).cid === JSON.parse(dA.keys[CHAT_KEY]).cid, dB.error);
    await B.ctx.close();
    const C = await newPage({});
    await boot(C.page);
    await openMove(C.page, 'in');
    const rC = await tryCode(C.page, textB);
    await replace(C.page, false);
    const vC = await village(C.page);
    const diffC = sameVillage(vA, vC);
    check('C: second trip (B -> a fresh profile): still the same village as the original', rC.check.ok && !diffC.length, { diff: diffC, coins: [vA.coins, vC.coins] });
    // a v4.1 save inside a code
    const raw41 = fs.readFileSync(path.join(FIX, 'v41_save_pure_45min.json'), 'utf8');
    const code41 = (await T.encodeVillage({ [SAVE_KEY]: raw41 })).code;
    await openMove(C.page, 'in');
    const r41 = await tryCode(C.page, code41);
    check('C: a v4.1 code -> summary from the migrated save', r41.check.ok && r41.check.summary.fromV === 6 && r41.check.summary.coins === JSON.parse(raw41).coins, r41.check);
    await replace(C.page, false);
    const loaded41 = await C.page.evaluate(() => window.__FV.scene.saved);
    check('C: the v4.1 village loads exactly like the stored v4.1 save (Save.load -> migrate 6 -> 7 -> sanitize)', same(loaded41, migrateSave(JSON.parse(raw41))) && loaded41.v === 7);
    // 되돌리기: the round-trip village comes back
    await openMove(C.page, 'in');
    const hasUndo = await C.page.evaluate(() => !document.getElementById('fm-undo').hidden);
    await sleep(500);
    await C.page.click('#fm-undo-btn');
    await waitFor(C.page, () => window.__FV.lastMoveCheck && !document.getElementById('fm-confirm').hidden, 30000);
    const undoQ = await C.page.textContent('#fm-confirm');
    await replace(C.page, false);
    const vU = await village(C.page);
    check('C: 「예비 사본으로 되돌리기」 brings the round-trip village back', hasUndo && /되돌릴까요/.test(undoQ) && !sameVillage(vA, vU).length, { diff: sameVillage(vA, vU) });
    errs.push(...C.log.errors);
    await C.ctx.close();

    // ============================================================ D: no CompressionStream
    console.log('— D: a browser without CompressionStream');
    const D = await newPage(LATE, { init: () => { try { delete window.CompressionStream; delete window.DecompressionStream; } catch (e) { /* */ } } });
    await boot(D.page);
    check('D: CompressionStream really absent', await D.page.evaluate(() => typeof CompressionStream === 'undefined' && typeof DecompressionStream === 'undefined'));
    await openMove(D.page);
    const textD = await exportCode(D.page);
    const dD = await T.decodeVillage(textD);
    report.latePlainInGameChars = textD.length;
    check('D: a plain code (SNOWBLOOM1.j.), same keys, ' + textD.length + ' characters', /SNOWBLOOM1\.j\./.test(textD) && dD.ok && same(Object.keys(dD.keys), Object.keys(dA.keys)), textD.length);
    await D.page.click('#fm-tab-in');
    const rz = await tryCode(D.page, textA);
    check('D: a compressed code -> cannot be opened here (update the WebView / browser)', rz.check.error === 'cantOpen' && /열 수 없어요/.test(rz.msg), rz.check);
    const rj = await tryCode(D.page, textD);
    await replace(D.page, false);
    const vD = await village(D.page);
    check('D: the plain code imports and boots into the same village', rj.check.ok && !sameVillage(vA, vD).length, sameVillage(vA, vD));
    errs.push(...D.log.errors);
    await D.ctx.close();

    // ============================================================ E: 360x640, the Android bridge, layout, English
    console.log('— E: 360x640 with the Android bridge');
    const E = await newPage(LATE, {
      viewport: { width: 360, height: 640 }, dpr: 2,
      init: () => { window.SnowbloomAndroid = { share(t) { window.__shared = t; return true; }, copy(t) { window.__copied = t; return true; }, paste() { return window.__clip || ''; } }; },
    });
    await boot(E.page);
    await E.page.evaluate(() => window.__FV.game.scene.getScene('UI').openSettings(true));
    await render(E.page, 2);
    const foot = await E.page.evaluate(() => {
      const ui = window.__FV.game.scene.getScene('UI');
      const box = (o) => { const w = o.width, h = o.height; return { x0: o.x - w / 2, x1: o.x + w / 2, y0: o.y - h / 2, y1: o.y + h / 2, t: o.text && o.text.text }; };
      const bs = ui.panelItems.filter((o) => o.text && o.bg && o.y > ui.H / 2 + 250).map(box);
      const bg = ui.panelBg;
      return { bs, panel: { y1: bg.y + bg.displayHeight / 2, x0: bg.x - bg.displayWidth / 2, x1: bg.x + bg.displayWidth / 2 }, H: ui.H };
    });
    const ov = [];
    for (let i = 0; i < foot.bs.length; i++) for (let j = i + 1; j < foot.bs.length; j++) { const a = foot.bs[i], b = foot.bs[j]; if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) ov.push(a.t + ' / ' + b.t); }
    check('E: the settings footer (처음부터 하기 · 새로고침 · 마을 옮기기 · 닫기) has no overlaps and stays in the panel', foot.bs.length === 4 && !ov.length && foot.bs.every((b) => b.y1 <= foot.panel.y1 && b.x0 >= foot.panel.x0 && b.x1 <= foot.panel.x1), { n: foot.bs.length, ov });
    await shot(E.page, 'settings_360x640');
    await openMove(E.page);
    const textE = await exportCode(E.page);
    const layout = async (ids) => E.page.evaluate((list) => {
      const vw = window.innerWidth, vh = window.innerHeight, out = { vw, vh, boxes: [], wide: [], over: [], clipped: [] };
      const sheet = document.querySelector('.fm-sheet').getBoundingClientRect();
      out.sheet = { l: sheet.left, r: sheet.right, t: sheet.top, b: sheet.bottom };
      for (const id of list) {
        const el = document.getElementById(id);
        if (!el || el.hidden || el.offsetParent === null) continue;
        const r = el.getBoundingClientRect();
        out.boxes.push({ id, el, l: r.left, r: r.right, t: r.top, b: r.bottom });
        if (r.left < sheet.left - 0.5 || r.right > sheet.right + 0.5) out.wide.push(id);
        if (el.tagName === 'BUTTON' && el.scrollWidth > el.clientWidth + 1) out.clipped.push(id);
      }
      for (let i = 0; i < out.boxes.length; i++) for (let j = i + 1; j < out.boxes.length; j++) {
        const a = out.boxes[i], b = out.boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;           // (the question card holds its buttons)
        if (a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5) out.over.push(a.id + ' / ' + b.id);
      }
      for (const b of out.boxes) delete b.el;
      out.pageWide = document.documentElement.scrollWidth > vw + 1;
      out.inScreen = sheet.left >= 0 && sheet.right <= vw && sheet.top >= 0 && sheet.bottom <= vh + 0.5;
      return out;
    }, ids);
    const OUT_IDS = ['fm-title', 'fm-close', 'fm-tab-out', 'fm-tab-in', 'fm-code-out', 'fm-size', 'fm-copy', 'fm-share', 'fm-msg-out'];
    const IN_IDS = ['fm-title', 'fm-close', 'fm-tab-out', 'fm-tab-in', 'fm-code-in', 'fm-paste', 'fm-load', 'fm-msg-in', 'fm-confirm', 'fm-no', 'fm-yes'];
    const lo1 = await layout(OUT_IDS);
    check('E: 360x640 export: the sheet fits the screen, no overlaps, nothing wider than the sheet, no clipped button', lo1.inScreen && !lo1.over.length && !lo1.wide.length && !lo1.clipped.length && !lo1.pageWide, { over: lo1.over, wide: lo1.wide, clipped: lo1.clipped, sheet: lo1.sheet });
    const shareShown = await E.page.isVisible('#fm-share');
    await E.page.click('#fm-share');
    await E.page.click('#fm-copy');
    const br = await E.page.evaluate(() => ({ shared: window.__shared, copied: window.__copied }));
    check('E: in the Android app 「공유하기」 is there and hands the code to the bridge; 「복사하기」 uses the bridge too', shareShown && br.shared === textE && br.copied === textE);
    await shot(E.page, 'export_360x640');
    await E.page.click('#fm-tab-in');
    await E.page.evaluate((t) => { window.__clip = t; }, textE);
    await E.page.click('#fm-paste');
    const pasted = await E.page.inputValue('#fm-code-in');
    check('E: 「붙여넣기」 takes the clipboard through the bridge', pasted === textE);
    await E.page.click('#fm-load');
    await waitFor(E.page, () => !document.getElementById('fm-confirm').hidden, 30000);
    const lo2 = await layout(IN_IDS);
    check('E: 360x640 import with the question: no overlaps, nothing wider than the sheet', lo2.inScreen && !lo2.over.length && !lo2.wide.length && !lo2.clipped.length, { over: lo2.over, wide: lo2.wide, clipped: lo2.clipped });
    await E.page.evaluate(() => { const c = document.getElementById('fm-confirm'); c.scrollIntoView({ block: 'end' }); });
    await shot(E.page, 'import_confirm_360x640');
    // English
    await E.page.click('#fm-close');
    await E.page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); const b = ui.panelItems.find((o) => o.text && o.text.text === '한국어'); if (b) b.emit('pointerdown'); });
    await render(E.page, 2);
    const enBtn = await E.page.evaluate(() => { const ui = window.__FV.game.scene.getScene('UI'); const m = ui.panelItems.find((o) => o.moveBtn); return m && { t: m.text.text, w: m.text.displayWidth }; });
    await shot(E.page, 'settings_360x640_en');
    await openMove(E.page);
    await exportCode(E.page);
    const lo3 = await layout(OUT_IDS);
    const enTitle = await E.page.textContent('#fm-title');
    await shot(E.page, 'export_360x640_en');
    await E.page.click('#fm-tab-in');
    await E.page.fill('#fm-code-in', textE);
    await E.page.click('#fm-load');
    await waitFor(E.page, () => !document.getElementById('fm-confirm').hidden, 30000);
    const lo4 = await layout(IN_IDS);
    await shot(E.page, 'import_confirm_360x640_en');
    check('E: English: 「Move village」 fits its button; the sheet has no overlaps or clipped buttons', enBtn && enBtn.t === 'Move village' && enBtn.w <= 210 && enTitle === 'Move village' && !lo3.over.length && !lo3.clipped.length && !lo4.over.length && !lo4.clipped.length && !lo3.wide.length && !lo4.wide.length, { enBtn, over: lo3.over.concat(lo4.over), clipped: lo3.clipped.concat(lo4.clipped) });
    errs.push(...E.log.errors);
    await E.ctx.close();
  } catch (e) {
    check('browser part ran to the end', false, String(e && e.stack || e).slice(0, 600));
  } finally {
    await browser.close();
    await srv.close();
  }
  check('no page errors in any profile', !errs.length, errs.slice(0, 3));
  console.log('screenshots: ' + SHOTS);
}
