// (v4.2.1) 마을 옮기기 · Move village — the whole village as one text code, so it can move to another app or phone
// (the sideloaded test app -> the Google Play app, whose different signing key means a fresh install and an empty
// localStorage; or the claude.ai artifact <-> the app). Nothing is ever sent over the network: the player copies or
// shares the code themselves (KakaoTalk '나와의 채팅', a memo, an e-mail) and pastes it into 불러오기.
//
//   code = SNOWBLOOM1.<c>.<n>.<data>.<crc>
//     c     'z' = the payload deflate-raw compressed (CompressionStream), 'j' = not compressed (no CompressionStream)
//     n     the length of <data> (a cut-off paste is told apart from a damaged one)
//     data  base64url of the payload bytes: UTF-8 JSON { app: 'snowbloom', fmt: 1, made, saveV, build, keys }
//     crc   CRC32 (8 hex) of everything before it: any changed, lost or extra character is caught
//   Whitespace and line breaks inside the code are ignored (chat apps wrap long text; so are soft hyphens and an e-mail
//   reply's '>' quote marks); text around it (the header line the game puts above it, a greeting) is skipped.
//
// keys = every localStorage key of the game (prefix frostVillage.): the save, the resident chat's memory (.chat), the
// story side record (.story), the settings, the title's little memory — never the save's own spare copies
// (save.backup, save.backup.2, *.bad) nor this feature's spare (move.backup). A future key with the prefix comes along
// by itself. Every reader sanitizes its record on load, and the save itself is dry-run through Save.js migrateSave
// (the same migration + sanitize path as a stored save) before anything is written.
import { SAVE_KEY, BACKUP_KEY, BAD_KEY, SAVE_VERSION, migrateSave } from './Save.js';
import { VERSION, BUILD_DATE } from '../data/version.js';

export const CODE_TAG = 'SNOWBLOOM';
export const CODE_FMT = 1;
/** the village that was here before the last 불러오기 (a code like the ones above): 되돌리기 brings it back */
export const MOVE_BACKUP_KEY = 'frostVillage.move.backup';
const KEY_RE = /^frostVillage\.[A-Za-z0-9_.-]{1,64}$/;
const MAX_TEXT = 12e6;          // a pasted text longer than this is not read
const MAX_PAYLOAD = 9e6;        // decompressed bytes (a damaged / hostile code can never blow up memory)
const MAX_KEY_CHARS = 2e6;      // one record (the chat record's own hard limit is 600 K)
const MAX_KEYS = 64;

/** a key that belongs to the village (and so travels in a code) */
export function isGameKey(k) {
  if (typeof k !== 'string' || !KEY_RE.test(k)) return false;
  if (k === BACKUP_KEY || k.startsWith(BACKUP_KEY + '.')) return false;     // the save's own spare copies
  if (k === BAD_KEY || /\.bad$/.test(k)) return false;                     // a save the game could not use
  if (k.startsWith('frostVillage.move.')) return false;                    // this feature's own spare
  return true;
}

export function getStore() { try { return (typeof window !== 'undefined' && window.localStorage) || null; } catch (e) { return null; } }

/** every game key in the storage -> { key: raw string } (sorted by key) */
export function snapshotKeys(st) {
  const out = {};
  if (!st) return out;
  const ks = [];
  try { for (let i = 0; i < st.length; i++) { const k = st.key(i); if (isGameKey(k)) ks.push(k); } } catch (e) { /* */ }
  ks.sort();
  for (const k of ks) { try { const v = st.getItem(k); if (typeof v === 'string') out[k] = v; } catch (e) { /* */ } }
  return out;
}

// ---------------------------------------------------------------- CRC32, base64url, (de)compression
let CRC_T = null;
export function crc32(str) {
  if (!CRC_T) { CRC_T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; CRC_T[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < str.length; i++) c = CRC_T[(c ^ (str.charCodeAt(i) & 0xff)) & 0xff] ^ (c >>> 8);
  return ((c ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

function toB64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

function streamOk(Ctor) { try { if (typeof Ctor !== 'function') return false; new Ctor('deflate-raw'); return true; } catch (e) { return false; } }
/** CompressionStream('deflate-raw') is there (Chrome / Android WebView 103+, Safari 16.4+, Firefox 113+) */
export function canCompress() { return typeof CompressionStream !== 'undefined' && streamOk(CompressionStream); }
export function canDecompress() { return typeof DecompressionStream !== 'undefined' && streamOk(DecompressionStream); }

async function pump(ts, bytes, limit) {
  const w = ts.writable.getWriter();
  w.write(bytes).catch(() => {});
  w.close().catch(() => {});
  const r = ts.readable.getReader();
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await r.read();
    if (done) break;
    n += value.length;
    if (limit && n > limit) { try { r.cancel(); } catch (e) { /* */ } throw new Error('too big'); }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ---------------------------------------------------------------- the code
/**
 * keys -> { code, comp, chars, payloadBytes }. opts: { made (ms), compress (default true when possible) }
 */
export async function encodeVillage(keys, opts = {}) {
  const payload = { app: 'snowbloom', fmt: CODE_FMT, made: Math.round(opts.made || Date.now()), saveV: SAVE_VERSION, build: VERSION + ' · ' + BUILD_DATE, keys };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let comp = 'j', data = bytes;
  if (opts.compress !== false && canCompress()) {
    try { data = await pump(new CompressionStream('deflate-raw'), bytes); comp = 'z'; } catch (e) { comp = 'j'; data = bytes; }
  }
  const b64 = toB64url(data);
  const head = CODE_TAG + CODE_FMT + '.' + comp + '.' + b64.length + '.' + b64;
  const code = head + '.' + crc32(head);
  return { code, comp, chars: code.length, payloadBytes: bytes.length };
}

const fail = (error, info) => ({ ok: false, error, info: info || null });

/**
 * pasted text -> { ok: true, payload, keys, dropped } or { ok: false, error, info }.
 * errors: empty · notCode · cut (info { have, want }) · damaged · newer (a code from a newer game) · foreign (not a
 * village code) · cantOpen (compressed, and this browser cannot decompress) · noVillage · tooBig
 */
export async function decodeVillage(text) {
  const s = typeof text === 'string' ? text : '';
  if (!s.trim()) return fail('empty');
  if (s.length > MAX_TEXT) return fail('tooBig');
  // (also an e-mail reply's '>' quote marks at line starts and soft hyphens: never part of a code)
  const flat = s.replace(/^[ \t\u00a0]*(?:>[ \t\u00a0]*)+/gm, '').replace(/[\s\u00a0\u00ad\u200b-\u200d\u2060\ufeff]+/g, '');
  let at = flat.indexOf(CODE_TAG);
  if (at < 0) return fail('notCode');
  // (the code pasted twice, or a cut copy followed by a whole one: the first one that reads wins)
  let first = null;
  for (let tries = 0; at >= 0 && tries < 8; tries++) {
    const r = await decodeAt(flat.slice(at));
    if (r.ok) return r;
    if (!first) first = r;
    at = flat.indexOf(CODE_TAG, at + CODE_TAG.length);
  }
  return first;
}

async function decodeAt(rest) {
  const ver = /^SNOWBLOOM(\d+)/.exec(rest);
  if (!ver) return fail('notCode');
  if (+ver[1] > CODE_FMT) return fail('newer');
  if (+ver[1] !== CODE_FMT) return fail('foreign');
  const m = /^SNOWBLOOM\d+\.([a-z])\.(\d{1,9})\.([A-Za-z0-9_-]*)(?:\.([0-9a-fA-F]{8}))?/.exec(rest);
  if (!m) return fail(/^SNOWBLOOM\d+\.?[a-z]?\.?\d*$/.test(rest) ? 'cut' : 'damaged');
  const comp = m[1], want = +m[2], data = m[3];
  if (data.length < want) return fail('cut', { have: data.length, want });
  if (data.length > want || !m[4]) return fail(data.length > want ? 'damaged' : 'cut', { have: data.length, want });
  if (crc32(CODE_TAG + CODE_FMT + '.' + comp + '.' + want + '.' + data) !== m[4].toLowerCase()) return fail('damaged');
  let bytes;
  try { bytes = fromB64url(data); } catch (e) { return fail('damaged'); }
  if (comp === 'z') {
    if (!canDecompress()) return fail('cantOpen');
    try { bytes = await pump(new DecompressionStream('deflate-raw'), bytes, MAX_PAYLOAD); } catch (e) { return fail(String(e && e.message) === 'too big' ? 'tooBig' : 'damaged'); }
  } else if (comp !== 'j') return fail('newer');
  if (bytes.length > MAX_PAYLOAD) return fail('tooBig');
  let p;
  try { p = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch (e) { return fail('damaged'); }
  if (!p || typeof p !== 'object' || Array.isArray(p) || p.app !== 'snowbloom') return fail('foreign');
  if (typeof p.fmt === 'number' && p.fmt > CODE_FMT) return fail('newer');
  if (p.fmt !== CODE_FMT || !p.keys || typeof p.keys !== 'object' || Array.isArray(p.keys)) return fail('foreign');
  const keys = {};
  const dropped = [];
  let n = 0;
  for (const k of Object.keys(p.keys).sort()) {
    const v = p.keys[k];
    if (!isGameKey(k) || typeof v !== 'string' || v.length > MAX_KEY_CHARS || n >= MAX_KEYS) { dropped.push(k); continue; }
    keys[k] = v; n++;
  }
  if (typeof keys[SAVE_KEY] !== 'string') return fail('noVillage');
  return { ok: true, payload: p, keys, dropped };
}

/**
 * the save inside `keys` through the game's own load path (Save.js migrateSave: every MIGRATE step + sanitizeSave),
 * nothing written -> { ok: true, save, summary } or { ok: false, error: 'newerSave' | 'badSave' }
 */
export function dryRun(keys, made) {
  let raw = null;
  try { raw = JSON.parse(keys[SAVE_KEY]); } catch (e) { return fail('badSave'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('badSave');
  if (typeof raw.v === 'number' && raw.v > SAVE_VERSION) return fail('newerSave');
  let s = null;
  try { s = migrateSave(raw); } catch (e) { s = null; }
  if (!s) return fail('badSave');
  return { ok: true, save: s, summary: summarize(s, keys, made, raw) };
}

/** what the confirm card shows: coins, rank, residents, the village day, when the code was made, what it carries */
export function summarize(s, keys, made, raw) {
  const life = s.life && typeof s.life === 'object' ? s.life : {};
  const moved = Array.isArray(life.moved) ? life.moved.filter((k) => typeof k === 'string' && k.startsWith('npc_')).length : 0;
  const settlers = s.c1 && Number.isFinite(s.c1.settlers) ? s.c1.settlers : 0;
  const ck = s.v4 && s.v4.clock;
  const sites = s.sites && typeof s.sites === 'object' ? Object.values(s.sites).filter((x) => x && x.st === 'done').length : 0;
  const chatKey = SAVE_KEY + '.chat';
  return {
    coins: Math.floor(s.coins || 0),
    rank: s.v4 && s.v4.rank === 2 ? 2 : 1,
    residents: moved + settlers,
    day: ck && Number.isFinite(ck.day) ? Math.max(1, Math.floor(ck.day)) : 0,
    sites,
    office: !!(s.v42 && s.v42.office && s.v42.office.st >= 1),
    chat: typeof keys[chatKey] === 'string' && keys[chatKey].length > 0,
    keys: Object.keys(keys).length,
    savedAt: raw && Number.isFinite(raw.t) ? Math.round(raw.t) : 0,
    made: Number.isFinite(made) ? made : 0,
    fromV: raw && typeof raw.v === 'number' ? raw.v : 0,
  };
}

/**
 * write a village: the current one is kept as a code in MOVE_BACKUP_KEY first (되돌리기), then the new keys are written
 * over the old ones and read back, and only then are the old keys the new village does not have removed. On any failure
 * (a full storage) every key is put back as it was (the new-only keys go first, which frees the room) and the spare is
 * restored too. window.__FV_NO_SAVE is set before anything changes: the running game must never write its own village
 * back over the new one (autosave, pagehide while the page reloads — Save.write / ChatSave.write check it). The caller
 * reloads the page.
 */
export async function applyVillage(keys, opts = {}) {
  const st = opts.storage || getStore();
  if (!st) return fail('noStorage');
  const W = typeof window !== 'undefined' ? window : {};
  const guard0 = W.__FV_NO_SAVE;
  W.__FV_NO_SAVE = true;
  const before = snapshotKeys(st);
  let spare0 = null;
  try { spare0 = st.getItem(MOVE_BACKUP_KEY); } catch (e) { spare0 = null; }
  let backup = false;
  try {
    if (typeof before[SAVE_KEY] === 'string') { st.setItem(MOVE_BACKUP_KEY, (await encodeVillage(before)).code); backup = true; }
  } catch (e) {
    try { if (spare0 == null) st.removeItem(MOVE_BACKUP_KEY); else st.setItem(MOVE_BACKUP_KEY, spare0); } catch (e2) { /* */ }
    W.__FV_NO_SAVE = guard0;
    return fail('noRoom');
  }
  const names = Object.keys(keys);
  try {
    for (const k of names) st.setItem(k, keys[k]);
    for (const k of names) if (st.getItem(k) !== keys[k]) throw new Error('read back ' + k);
  } catch (e) {
    try {
      for (const k of names) if (!(k in before)) st.removeItem(k);
      for (const k of names) if (k in before) st.setItem(k, before[k]);
      if (spare0 == null) st.removeItem(MOVE_BACKUP_KEY); else st.setItem(MOVE_BACKUP_KEY, spare0);
    } catch (e2) { /* nothing more can be done */ }
    W.__FV_NO_SAVE = guard0;
    return fail('noRoom');
  }
  for (const k of Object.keys(before)) if (!(k in keys)) { try { st.removeItem(k); } catch (e) { /* */ } }
  return { ok: true, backup };
}

/** the spare village kept by the last 불러오기 (its code), or null */
export function backupCode(st) {
  st = st || getStore();
  try { const c = st && st.getItem(MOVE_BACKUP_KEY); return typeof c === 'string' && c.indexOf(CODE_TAG) >= 0 ? c : null; } catch (e) { return null; }
}
