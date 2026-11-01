// (v4.2.0.2) 관리자 모드 · admin mode — the designer's hidden tools inside the normal store build.
//   Opens: 설정 → the version text (「v… · date」) tapped 7 times within 4 s → the in-game PIN keypad (src/scenes/AdminPanel.js;
//   never window.prompt: it does nothing in the Android WebView) → the admin panel.
//   The PIN: SHA-256("snowbloom-admin-v1:" + the typed digits) must equal ADMIN_DIGEST. Only the salt and the digest are in
//   the code (src/core/sha256.js computes it, synchronously: crypto.subtle is missing outside secure contexts).
//   5 wrong tries in a row lock the keypad for 60 s. Unlocked for this page only: a reload (the app restarting) or a new
//   game asks for the 7 taps + PIN again.
//   Tests (tools/test/admin.mjs) never need the real PIN: an automated browser (navigator.webdriver === true) may set
//   window.__FV_ADMIN_TEST_DIGEST to the digest of its own test PIN. A phone never has navigator.webdriver set.
// This module is the logic (PIN, lock, the actions on the Game scene, the backup); the keypad and the panel are drawn by
// src/scenes/AdminPanel.js. Saved: `adminUses` (how many times the panel opened — bug reports can tell) and `adminInf`
// (코인 무제한 on) — both optional, an old save loads unchanged (Save.js sanitizeSave); the speed is never saved. Both stay
// on this phone: a village moved in with 마을 옮기기 › 불러오기 arrives without them (Transfer.js markImported).

import { sha256Hex } from '../core/sha256.js';
import { SAVE_KEY, BACKUP_KEY, migrateSave } from '../core/Save.js';
import { encodeVillage, decodeVillage, dryRun, snapshotKeys, getStore, backupCode, ADMIN_BACKUP_KEY } from '../core/Transfer.js';
import { BALANCE } from '../data/balance.js';
import { t } from '../data/strings.js';
import { F } from './TownSim.js';

export const ADMIN_SALT = 'snowbloom-admin-v1:';
export const ADMIN_DIGEST = 'd9f3df00a1f0341803ff8b72628fcc25bf81a2be7eb60806408e4c71ff71d1e7';
export const ADMIN_TAPS = 7;            // taps on the version text …
export const ADMIN_TAP_MS = 4000;       // … within this many ms
export const ADMIN_MAX_TRIES = 5;       // wrong PINs in a row before the lock
export const ADMIN_LOCK_MS = 60000;
export const ADMIN_PIN_MAX = 12;        // digits the keypad takes
export const SPEEDS = [1, 2, 4];

// ---- this page's admin state (module scope: a reload clears it; Game.create clears `unlocked` for a new game)
const S = { unlocked: false, wrong: 0, lockUntil: 0, taps: [] };
export const AdminSession = S;

/** a new Game scene (the app started, 처음부터 하기): the 7 taps + PIN are needed again (a running lock stays) */
export function adminSceneStart() { S.unlocked = false; S.taps = []; }

/** the digest the PIN is checked against: the real one — or, ONLY in an automated browser, a test's own */
export function adminDigest() {
  try {
    if (typeof navigator !== 'undefined' && navigator.webdriver === true && typeof window !== 'undefined') {
      const d = window.__FV_ADMIN_TEST_DIGEST;
      if (typeof d === 'string' && /^[0-9a-f]{64}$/.test(d)) return d;
    }
  } catch (e) { /* the real one */ }
  return ADMIN_DIGEST;
}

/** a tap on the version text at time `now` (ms): true on the 7th tap within 4 s (the count starts over then) */
export function versionTap(now = Date.now()) {
  S.taps = S.taps.filter((x) => now >= x && now - x <= ADMIN_TAP_MS);
  S.taps.push(now);
  if (S.taps.length >= ADMIN_TAPS) { S.taps = []; return true; }
  return false;
}

/** ms left on the lock (0 = not locked) */
export function lockLeft(now = Date.now()) { return Math.max(0, S.lockUntil - now); }

/** check typed digits: 'ok' (unlocked for this page) | 'wrong' | 'locked' (the 5th wrong in a row, or still locked) */
export function tryPin(digits, now = Date.now()) {
  if (lockLeft(now) > 0) return 'locked';
  const good = typeof digits === 'string' && digits.length >= 1 && digits.length <= ADMIN_PIN_MAX && /^[0-9]+$/.test(digits)
    && sha256Hex(ADMIN_SALT + digits) === adminDigest();
  if (good) { S.unlocked = true; S.wrong = 0; return 'ok'; }
  S.wrong++;
  if (S.wrong >= ADMIN_MAX_TRIES) { S.wrong = 0; S.lockUntil = now + ADMIN_LOCK_MS; return 'locked'; }
  return 'wrong';
}

// ===================================================================== safety: the backup before the panel opens
/**
 * Saves the game, then — the first time the panel opens on this village — keeps the village as it is now, before any
 * admin button can change it:
 *  - the 관리자 사본 (Transfer.js ADMIN_BACKUP_KEY: a village code of every game key — save, chat memory, settings), which
 *    「마을 옮기기 › 불러오기 › 관리자 사본으로 되돌리기」 brings back. A slot of its own: the 불러오기 spare
 *    (MOVE_BACKUP_KEY) is never written here — after 불러오기 it holds the player's own village, maybe its only copy;
 *  - Save.js's backup slot BACKUP_KEY (the raw save) — unless that slot holds a copy of a save the game could NOT read
 *    (Save.keepCopy keeps those for bug reports: never written over).
 * "First time" = the save has never counted a use (adminUses 0: countUse runs after this). A later opening — the same
 * session without the PIN, or after a reload — keeps the copy as it is, so it still holds the village from before
 * admin changed anything; it is made again only when there is no readable copy, or for a village that never used admin
 * (a new game, another village imported, or the copy itself brought back — then the two swap places).
 * Returns { copy (written now), kept (an earlier one kept), save, chars, when (ms: when the kept village was saved) }.
 */
export async function adminBackup(gs) {
  const out = { copy: false, kept: false, save: false, chars: 0, when: 0 };
  const fresh = !(Math.floor(gs && gs.adminUses) > 0);
  try { if (gs && gs.save) gs.save(true); } catch (e) { /* keep going */ }
  const st = getStore();
  if (!st || (typeof window !== 'undefined' && window.__FV_NO_SAVE)) return out;
  let raw = null;
  try { raw = st.getItem(SAVE_KEY); } catch (e) { raw = null; }
  if (!raw) return out;
  // the copy already there: kept unless this village never used admin (or it cannot be read back)
  const prev = backupCode(st, ADMIN_BACKUP_KEY);
  if (prev && !fresh) {
    let when = 0;
    try {
      const d = await decodeVillage(prev);
      if (d.ok) { const dr = dryRun(d.keys, d.payload.made); when = (dr.ok && dr.summary.savedAt) || d.payload.made || 1; }
    } catch (e) { when = 0; }
    if (when) { out.kept = true; out.when = when; return out; }
  }
  let bk = null;
  try { bk = st.getItem(BACKUP_KEY); } catch (e) { bk = null; }
  let free = !bk || bk === raw;
  if (!free) { try { free = !!migrateSave(JSON.parse(bk)); } catch (e) { free = false; } }
  if (free) { try { st.setItem(BACKUP_KEY, raw); out.save = true; } catch (e) { /* full */ } }
  try {
    const enc = await encodeVillage(snapshotKeys(st));
    st.setItem(ADMIN_BACKUP_KEY, enc.code);
    out.copy = true; out.chars = enc.chars; out.when = Date.now();
  } catch (e) { /* full / no compression: the raw copy above still holds */ }
  return out;
}

/** the panel opened: one more use in the save (bug reports can tell) */
export function countUse(gs) {
  gs.adminUses = Math.min(1e6, (Math.floor(gs.adminUses) || 0) + 1);
  try { gs.save(true); } catch (e) { /* */ }
  return gs.adminUses;
}

// ===================================================================== the buttons
/** +n coins, straight into the purse — not counted as the village's earnings (Economy.add would: the newspaper's
 *  "coins earned" and the income stats stay true to play) */
export function giveCoins(gs, n) {
  const E = gs.economy, k = Math.max(0, Math.floor(n) || 0);
  E.coins += k;
  if (gs.ui && gs.ui.setCoins) gs.ui.setCoins(E.coins, 0);
  gs.save(true);
  return E.coins;
}

/** 코인 무제한: while on, Economy.spend pays without lowering the coins; off keeps whatever the coins are now. Saved. */
export function setUnlimited(gs, on) {
  gs.economy.unlimited = !!on;
  if (gs.ui && gs.ui.setCoins) gs.ui.setCoins(gs.economy.coins, 0);
  gs.save(true);
  return gs.economy.unlimited;
}

/** 짓는 건물 바로 완성: every started site (foundation / scaffold) gets its materials and finishes now — the same steps as
 *  the test hooks supply(id) + finishSite(id) (Game.installHooks). Returns how many. */
export function finishSites(gs) {
  let n = 0;
  for (const id in gs.sites) {
    const st = gs.sites[id];
    if (!st || (st.state !== 'foundation' && st.state !== 'scaffold')) continue;
    if (st.state === 'foundation') for (const m in st.need) while (st.stock.countWithIncoming(m) < st.need[m]) st.stock.push(m, null, gs.effects);
    st.finish(false);
    n++;
  }
  if (n) gs.save(true);
  return n;
}

/** the paid pads offered now: standing, shown, not done / maxed (onScreen: inside the camera's view too) */
export function offeredPads(gs, onScreen) {
  const out = [];
  for (const p of gs.paidPads()) {
    if (!p || !p.active || p.done || p.maxed || !p.pad || !p.pad.img || !p.pad.img.visible || !p.label || !p.label.visible) continue;
    if (onScreen && !gs.isOnScreen(p.x, p.y, 0)) continue;
    out.push(p);
  }
  return out;
}

/** a pad completes as if fully paid (and its item, if it asks for one, delivered) — free */
function buyPad(p) {
  if (p.items) for (const k in p.items) p.got[k] = p.items[k];
  p.paid = p.cost;
  p.refresh();
  p.complete();
}

/** a pad's name as its floating label shows it (the status line says which pad was bought) */
function padName(p) {
  const tx = p && p.labelText && typeof p.labelText.text === 'string' ? p.labelText.text : '';
  const s = tx.replace(/\s+/g, ' ').trim();
  return s.length > 24 ? s.slice(0, 23) + '…' : s;
}

/** 「가까운 발판 하나」 (which = 'near': the offered pad on screen nearest the chief) / 「보이는 발판 모두」 ('all': every
 *  offered pad on screen). Both only buy what the designer can see (a pad far off the screen — the town promotion, say —
 *  is never bought by surprise). Returns { n (how many were bought), name (the one pad's label, for 'near') }. */
export function buyPads(gs, which) {
  const p0 = gs.player;
  let list = offeredPads(gs, true);
  if (which !== 'all') {
    list.sort((a, b) => Math.hypot(a.x - p0.x, (a.y - p0.y) * 2) - Math.hypot(b.x - p0.x, (b.y - p0.y) * 2));
    list = list.slice(0, 1);
  }
  let n = 0, name = '';
  for (const p of list) {
    if (p.done || !p.active) continue;
    const nm = padName(p);
    try { buyPad(p); n++; name = nm; } catch (e) { console.warn('[FrostVillage] admin pad', p && p.id, e); }
  }
  if (n) gs.save(true);
  return { n, name: n === 1 ? name : '' };
}

/** 가방 최대: the bag upgrade at its top level (the bench pad shows MAX). Returns the new size, or 0 when it already was. */
export function maxBag(gs) {
  const pr = gs.progress, U = BALANCE.upgrades.capacity, top = U.values.length - 1;
  if (!pr || pr.up.capacity >= top) return 0;
  const before = pr.capacity();
  pr.up.capacity = top;
  if (pr.paid) delete pr.paid.up_capacity;
  const pad = pr.upPads && pr.upPads.capacity;
  if (pad) {
    pad.paid = 0; pad.acc = 0; pad.maxed = true; pad.done = true;
    if (pad.sparkle && pad.sparkle !== 'none') pad.sparkle.setVisible(false);
    if (pad.pad && pad.pad.img) pad.pad.img.setScale(pad.pad.bsx, pad.pad.bsy);
    if (pad.ring) { pad.ring.setVisible(false); pad.ringBg.setVisible(false); }
    pad.refresh();
  }
  if (gs.ui && gs.ui.banner) gs.ui.banner(t('capacityUp', { n: U.values[top] - before }));
  gs.save(true);
  return U.values[top];
}

/** 시간 빠르게 ×1 / ×2 / ×4: Game.update runs the village step n times a frame (each with the normal step, so nothing
 *  moves further in one step than at ×1); the scene's tweens, timers and the animations follow. Never saved. */
export function setSpeed(gs, n) {
  const k = SPEEDS.indexOf(n) >= 0 ? n : 1;
  gs.simSpeed = k;
  try { gs.tweens.timeScale = k; } catch (e) { /* */ }
  try { gs.time.timeScale = k; } catch (e) { /* */ }
  // (the animation manager is the whole game's: the UI scene's sprites would follow too — it plays none (its finger and
  //  HUD move by its own tweens / clock, left at ×1); Game.create puts it back to ×1)
  try { gs.anims.globalTimeScale = k; } catch (e) { /* */ }
  return k;
}

/** the village has the day clock (it starts with the first train) */
export function hasClock(gs) { const nb = gs && gs.v4; return !!(nb && nb.clock && nb.clock.on); }

/** 낮/밤 바꾸기: day -> 22:00, night -> 10:00 (the same day; the town's people re-plan their hour like the v4 test hook
 *  clock(hour)); the tint changes at once. Returns 'night' | 'day' | null (no clock). */
export function toggleDayNight(gs) {
  if (!hasClock(gs)) return null;
  const nb = gs.v4, C = nb.clock, ph = C.phase();
  const toNight = ph === 'day' || ph === 'dawn';
  C.set(toNight ? 22 : 10);
  try {
    const T = nb.town;
    if (T && T.started !== false && Array.isArray(T.citizens)) {
      T.T = C.simT();
      for (const c of T.citizens) if (!(c.flags & (F.ON_TRAIN | F.IN_VILLAGE))) { c.plan = null; c.day = -1; T.settle(c, T.T); }
      T.lastHour = -1;
    }
  } catch (e) { console.warn('[FrostVillage] admin clock', e); }
  // the tint glides over a few seconds otherwise
  const tg = C.target(C.hour());
  C.cur.a = tg.a; C.cur.r = (tg.color >> 16) & 255; C.cur.g = (tg.color >> 8) & 255; C.cur.b = tg.color & 255;
  try { C.drawOverlay(); } catch (e) { /* drawn on the next step */ }
  gs.save(true);
  return toNight ? 'night' : 'day';
}

/** can 「튜토리얼 다시 보기」 run now? (the same rule as 설정 › 놀이's 다시 보기 row) */
export function canReplay(gs) {
  const tu = gs.tutorial, onb = gs.onboard;
  const running = !!(onb && (onb.mode === 'act1' || onb.mode === 'act2' || onb.mode === 'tour'));
  return !!(onb && tu && !running && (!tu.inTutorial || (onb.bits & 1)));
}

/** 튜토리얼 다시 보기 (Onboarding.replay, as the settings row does) */
export function replayTutorial(gs) { return canReplay(gs) ? !!gs.onboard.replay() : false; }
