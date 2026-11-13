// (v4.3 step B 「마을 새 단장 둘째 걸음」, S4 — WP-S owns this file) R43: an old village (every save without the step-B
// marker v43.lay ≥ 2: 4.2.0.x v7, 4.2.1 v8, the a1 … a3.1 previews and the a2.x / a3 / a3.1 Play villages) is moved onto
// plot table v2 ONCE, as plain JSON, before sanitizeSave and before anything is built (docs/redesign_v43/stepB/map_save.md
// §4.3-4.4, build_plan.md §3.5 S4). Pure: it never mutates its input, never reads the live game, never throws into a load
// (Save.migrateSaveEx catches and turns any failure into the failure card — the stored village stays byte-identical).
//
//   remap43(src, { from })  -> { save, r }   (src: a v8 save after the MIGRATE chain; from: { v, lv } of the stored save)
//     1  movers, two-phase: every toolsmith / warehouse / cannery / store goes to its fixed plot (d_tool / d_wh /
//        d_cannery / d_store, D6 / D19), the town hall to w_hall and the big restaurant to w_rest (V-N2). All movers are
//        lifted first, then placed (finished ones first): an XL swap (hall on w_rest + restaurant on w_hall) falls out of
//        it. A home that is still taken keeps the mover where it was (V-N3, r.kept). One already home is not touched
//     2  reprice (D21): an UNFINISHED hall or office site was paid at the pre-B price (OLD43, constant in every pre-B
//        build): the coin difference comes back, and the planks / ingots it took above the new need come back too — to
//        the 창고 when a finished one has room (it takes planks and ingots), else as coins at priceOf (V-N4). A
//        foundation's are the delivered `got` above the new need (got is cut to the need); a scaffold already took the
//        whole old need into its frame (Site.beginScaffold empties its stock, so the game saves its got as 0): its extra
//        is OLD − NEW, and its got is left as it is. t is clamped to the new build time. A finished hall / office stays
//        as it is (no refund: the letter thanks the player)
//     3  wallet and 창고 (v3.warehouse) take the refund
//     4  progress.flags.s4half = true for a village that is already 읍 (V-N13: stage 4 at market43.stage4Old × the price)
//     5  the chief restarts at WORLD.v43.oldStart (the hut door), or WORLD.v43.shopFront while v42_office holds an
//        unfinished site (V-N9); what he carries stays
//     6  the marker: v43 = { …, lay: 2, refunds43: { coins, items, wh, moved, kept }, src: { v, lv } } (BP-23); v43.seen
//        is left as it was (empty for a pre-B village): the 「마을 새 단장」 letter and the tour are due
//   check43(pre, post, r)          -> { ok } | { ok: false, reason }   (a–g below: nothing appeared, vanished or moved
//                                     that the table did not say; the refunds add up; a second run changes nothing)
//   check43b(post, out, rules)     -> { ok } | { ok: false, reason }   (every building the remap kept survives sanitizeSave
//                                     and has a place to stand: a plot that is not hidden, or a tower)
// Not done here (they run after restore, keyed on their own flags): the 자재 창구 till, shop43 / bakery43, the deck,
// COMES_WITH, the step-pad price drops (Progression.syncPads refunds those itself).

import { WORLD } from '../data/world.js';
import { MATERIALS, ITEMS, priceOf } from '../data/items.js';
import { BALANCE } from '../data/balance.js';
import { LAY, PLOT43, WORKSHOP_PLOT43 } from '../data/ids43.js';

export { LAY };

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const num = (v, d) => {
  const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
  return Number.isFinite(n) ? n : d;
};
/** what sanitizeSave makes of a count (Save.js count(v, 1e7)) */
const cnt = (v) => Math.max(0, Math.min(1e7, Math.floor(num(v, 0))));
const clone = (o) => JSON.parse(JSON.stringify(o));
/** deep equality of JSON values; object key order does not matter */
export function sameJSON(a, b) {
  if (a === b) return true;
  if (Array.isArray(a)) { if (!Array.isArray(b) || a.length !== b.length) return false; for (let i = 0; i < a.length; i++) if (!sameJSON(a[i], b[i])) return false; return true; }
  if (isObj(a)) {
    if (!isObj(b)) return false;
    const ka = Object.keys(a).filter((k) => a[k] !== undefined), kb = Object.keys(b).filter((k) => b[k] !== undefined);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!hasOwn(b, k) || !sameJSON(a[k], b[k])) return false;
    return true;
  }
  return typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b);
}

/** where each kind lives on plot table v2 (D19: the four workshops; V-N2: the two XL buildings). labour_office (v4.4)
 *  has its own hidden plot but no pre-B save can hold one, so it is not a mover */
export const MOVE43 = Object.freeze({
  toolsmith: WORKSHOP_PLOT43.toolsmith, warehouse: WORKSHOP_PLOT43.warehouse, cannery: WORKSHOP_PLOT43.cannery, store: WORKSHOP_PLOT43.store,
  town_hall: PLOT43.hall, big_restaurant: PLOT43.rest,
});
/** the price every pre-B build charged (map_save §2.2: identical at 38c233c, 977f02e, 21e3ef4, b418595 and a3.1). Frozen
 *  here on purpose: after step B, BALANCE holds the new prices (G-12) */
export const OLD43 = Object.freeze({
  town_hall: Object.freeze({ coins: 2400, item_plank: 30, item_ingot: 10, time: 14 }),
  chief_office: Object.freeze({ coins: 1800, item_plank: 20, item_ingot: 6, time: 10 }),
});
/** the step-B price (decisions D2: the hall 1,200 + 16 + 4; D3 / D16: the office 400 + 8, balance.js hut.office) — what a
 *  lay-2 village was repriced to. Frozen like OLD43: a later price change is a new layout step (lay 3, BP-14), never a
 *  silent change of what lay 2 meant.
 *  [P-GATE] P sets these in the live game (BALANCE.buildings.town_hall, Site.buildCost('chief_office') -> hut.office):
 *  tools/test/save_v43.mjs §12 checks NEW43(b) === Site.buildCost(b) for both and must stay green from P's merge on */
export const NEW43_PRICE = Object.freeze({
  town_hall: Object.freeze({ coins: 1200, item_plank: 16, item_ingot: 4, time: 14 }),
  chief_office: Object.freeze({ coins: 400, item_plank: 8, item_ingot: 0, time: 8 }),
});
export const NEW43 = (b) => (hasOwn(NEW43_PRICE, b) ? NEW43_PRICE[b] : null);
const STATES_UNFINISHED = ['foundation', 'scaffold'];

/** does this save still need R43? (no marker, or one below LAY) */
export const needsRemap = (s) => !(isObj(s) && isObj(s.v43) && Math.floor(num(s.v43.lay, 0)) >= LAY);

/** the 창고's room for one more item (Warehouse.js: cap BALANCE.warehouse.capacity, raw goods refused) */
const RAW = ['item_log', 'item_wheat', 'item_ore', 'item_meat_raw'];
const whCap = () => Math.max(10, Math.floor(num(BALANCE.warehouse && BALANCE.warehouse.capacity, 300)) || 300);
function whTotal(wh) {
  let n = 0;
  if (isObj(wh)) for (const k of Object.keys(wh)) if (ITEMS.indexOf(k) >= 0 && RAW.indexOf(k) < 0) n += cnt(wh[k]);
  return n;
}
const hasDoneWarehouse = (sites) => Object.keys(sites).some((id) => isObj(sites[id]) && sites[id].b === 'warehouse' && sites[id].st === 'done');
const startOf = (sites) => {
  const V = WORLD.v43 || {};
  const of = sites[PLOT43.office];
  const p = isObj(of) && of.b === 'chief_office' && STATES_UNFINISHED.indexOf(of.st) >= 0 ? V.shopFront : V.oldStart;
  return Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]) ? p : [WORLD.player.x, WORLD.player.y];
};
const isEup = (s) => (isObj(s.progress) && isObj(s.progress.flags) && s.progress.flags.rankEup === true) || (isObj(s.v4) && s.v4.rank === 2);

function emptyR() { return { coins: 0, extra: {}, fromGot: {}, fromFrame: {}, toWh: {}, asCoins: {}, moved: [], kept: [], repriced: [], s4half: false, start: null, from: null, noop: true }; }

/**
 * a pre-B save (v8 JSON) -> { save: a new object on plot table v2, r: what was done }. A save that already carries the
 * marker comes back as an equal copy with r.noop (a remapped village is never remapped again, so a refund is never paid
 * twice). Throws only on a value JSON cannot copy (the caller turns that into the failure card)
 */
export function remap43(src, opts) {
  const s = clone(src);
  const R = emptyR();
  if (!needsRemap(s)) return { save: s, r: R };
  R.noop = false;
  const from = (opts && opts.from) || { v: num(src.v, 0), lv: num(src.lv, 0) };
  R.from = { v: Math.max(0, Math.floor(num(from.v, 0))), lv: Math.max(0, Math.floor(num(from.lv, 0))) };
  if (!isObj(s.sites)) s.sites = {};
  const sites = s.sites;

  // ---- 1 movers (two-phase)
  const movers = [];
  for (const id of Object.keys(sites)) {
    const d = sites[id];
    if (!isObj(d) || typeof d.b !== 'string' || !hasOwn(MOVE43, d.b) || id === MOVE43[d.b]) continue;
    movers.push({ id, d });
  }
  movers.sort((a, b) => (b.d.st === 'done' ? 1 : 0) - (a.d.st === 'done' ? 1 : 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const m of movers) delete sites[m.id];
  // who stays: a mover whose home holds a building that does not move (or one already home), or whose home another mover
  // of its kind took first (a second hall: sanitize keeps one), or whose home is the old spot of a mover that stays —
  // repeated until nothing changes (a mover that stays goes back to its own id, which nobody may take then)
  const stays = new Set();
  for (let changed = true; changed;) {
    changed = false;
    const claimed = new Set();
    for (const m of movers) {
      if (stays.has(m)) continue;
      const home = MOVE43[m.d.b];
      if (hasOwn(sites, home) || claimed.has(home) || movers.some((k) => stays.has(k) && k.id === home)) { stays.add(m); changed = true; break; }
      claimed.add(home);
    }
  }
  for (const m of movers) {
    const home = MOVE43[m.d.b];
    if (stays.has(m)) { sites[m.id] = m.d; R.kept.push([m.id, home, m.d.b]); }
    else { sites[home] = m.d; R.moved.push([m.id, home, m.d.b]); }
  }

  // ---- 2 reprice the unfinished hall / office
  for (const id of Object.keys(sites)) {
    const d = sites[id];
    if (!isObj(d) || !hasOwn(OLD43, d.b) || STATES_UNFINISHED.indexOf(d.st) < 0) continue;
    const O = OLD43[d.b], N = NEW43(d.b);
    const frame = d.st === 'scaffold';
    const row = { id, b: d.b, st: d.st, coins: Math.max(0, O.coins - N.coins), extra: {}, t: null };
    R.coins += row.coins;
    for (const m of MATERIALS) {
      let extra = 0;
      if (frame) extra = Math.max(0, O[m] - N[m]);
      else if (isObj(d.got) && hasOwn(d.got, m)) {
        const have = cnt(d.got[m]);
        extra = Math.max(0, have - N[m]);
        if (extra) d.got[m] = have - extra;
      }
      if (!extra) continue;
      row.extra[m] = extra;
      R.extra[m] = (R.extra[m] || 0) + extra;
      const src = frame ? R.fromFrame : R.fromGot;
      src[m] = (src[m] || 0) + extra;
    }
    if (d.t !== undefined && num(d.t, 0) > N.time) { row.t = [d.t, N.time]; d.t = N.time; }
    R.repriced.push(row);
  }
  // the extra materials: the 창고 first (a finished one, while it has room), the rest as coins
  if (Object.keys(R.extra).length) {
    let room = 0;
    if (hasDoneWarehouse(sites)) {
      if (!isObj(s.v3)) s.v3 = {};
      room = Math.max(0, whCap() - whTotal(s.v3.warehouse));
    }
    for (const m of MATERIALS) {
      const n = R.extra[m] || 0;
      if (!n) continue;
      const w = Math.min(n, room);
      if (w > 0) { R.toWh[m] = w; room -= w; }
      const c = n - w;
      if (c > 0) { R.asCoins[m] = c; R.coins += c * priceOf(m); }
    }
  }

  // ---- 3 wallet and 창고
  if (R.coins > 0) s.coins = Math.min(1e12, Math.max(0, Math.floor(num(s.coins, 0)))) + R.coins;
  if (Object.keys(R.toWh).length) {
    const wh = isObj(s.v3.warehouse) ? s.v3.warehouse : (s.v3.warehouse = {});
    for (const m of Object.keys(R.toWh)) wh[m] = cnt(wh[m]) + R.toWh[m];
  }

  // ---- 4 stage 4 at half price for a village already 읍
  if (isEup(s)) {
    if (!isObj(s.progress)) s.progress = {};
    if (!isObj(s.progress.flags)) s.progress.flags = {};
    if (s.progress.flags.s4half !== true) { s.progress.flags.s4half = true; R.s4half = true; }
  }

  // ---- 5 the chief
  const p = startOf(sites);
  if (!isObj(s.player)) s.player = {};
  s.player.x = p[0];
  s.player.y = p[1];
  R.start = [p[0], p[1]];

  // ---- 6 the marker
  const items = {}, wh = {};
  for (const m of Object.keys(R.extra)) if (R.extra[m] > 0) items[m] = R.extra[m];
  for (const m of Object.keys(R.toWh)) if (R.toWh[m] > 0) wh[m] = R.toWh[m];
  const v43 = isObj(s.v43) ? s.v43 : {};
  s.v43 = Object.assign({}, v43, { lay: LAY, refunds43: { coins: R.coins, items, wh, moved: R.moved.length, kept: R.kept.length }, src: R.from });
  return { save: s, r: R };
}

/** the census of the sites: "b:st" -> how many (non-object entries by their JSON) */
function siteBag(sites) {
  const bag = {};
  if (isObj(sites)) for (const id of Object.keys(sites)) { const d = sites[id]; const k = isObj(d) ? d.b + ':' + d.st : 'raw:' + JSON.stringify(d); bag[k] = (bag[k] || 0) + 1; }
  return bag;
}
const without = (o, keys) => { const r = {}; if (isObj(o)) for (const k of Object.keys(o)) if (keys.indexOf(k) < 0) r[k] = o[k]; return r; };
const TOP_FREE = ['sites', 'coins', 'v3', 'player', 'v43', 'progress'];

/**
 * (map_save §4.4) is the remap provably lossless? pre = the save handed to remap43, post = its output, R = its r.
 *   a  every other top-level key is unchanged; v3 differs only in its warehouse, progress only in flags.s4half
 *   b  the same buildings (b:st) before and after: none appears, none vanishes
 *   c  every mover stands on its home unless r.kept says why not; nothing else changed its id
 *   d  each repriced site: got = min(before, the new need); what came off is r.extra = 창고 + coins, per material
 *   e  coins after − coins before = r.coins = Σ (old − new price) + Σ items sold at priceOf
 *   f  창고 after − before = r.toWh, only with a finished 창고, never above its capacity
 *   g  the marker is set (lay ≥ 2, refunds43, src) and a second remap43 is a no-op
 * Never throws: any surprise is a failed check.
 */
export function check43(pre, post, R) {
  try {
    if (!isObj(pre) || !isObj(post) || !isObj(R)) return { ok: false, reason: 'shape' };
    // (the remap works on a JSON copy: compare with the save as JSON keeps it — NaN / Infinity read as null there; a stored
    //  save never holds them, an object built in memory (a test, the admin backup) may)
    pre = clone(pre);
    // a
    for (const k of new Set(Object.keys(pre).concat(Object.keys(post)))) {
      if (TOP_FREE.indexOf(k) >= 0) continue;
      if (!sameJSON(pre[k], post[k])) return { ok: false, reason: 'a: ' + k + ' changed' };
    }
    // (a value that is not an object counts as {}: sanitizeSave reads it so)
    if (!sameJSON(without(pre.v3, ['warehouse']), without(post.v3, ['warehouse']))) return { ok: false, reason: 'a: v3 changed beyond the 창고' };
    const pfl = isObj(pre.progress) ? pre.progress : {}, qfl = isObj(post.progress) ? post.progress : {};
    if (!sameJSON(without(pfl, ['flags']), without(qfl, ['flags']))) return { ok: false, reason: 'a: progress changed' };
    if (!sameJSON(without(pfl.flags, ['s4half']), without(qfl.flags, ['s4half']))) return { ok: false, reason: 'a: progress.flags changed' };
    if (isObj(qfl.flags) && qfl.flags.s4half === true && !(isObj(pfl.flags) && pfl.flags.s4half === true) && !isEup(pre)) return { ok: false, reason: 'a: s4half without 읍' };
    if (isEup(pre) && !(isObj(qfl.flags) && qfl.flags.s4half === true)) return { ok: false, reason: 'a: 읍 without s4half' };
    // the chief: only his spot
    if (!sameJSON(without(pre.player, ['x', 'y']), without(post.player, ['x', 'y']))) return { ok: false, reason: 'a: the chief\'s things changed' };
    // b
    const A = isObj(pre.sites) ? pre.sites : {}, B = isObj(post.sites) ? post.sites : {};
    if (!sameJSON(siteBag(A), siteBag(B))) return { ok: false, reason: 'b: the buildings differ' };
    // c
    const kept = new Set(R.kept.map((k) => k[0]));
    const movedTo = new Map(R.moved.map((m) => [m[1], m]));
    for (const id of Object.keys(B)) {
      const d = B[id];
      if (isObj(d) && typeof d.b === 'string' && hasOwn(MOVE43, d.b) && id !== MOVE43[d.b] && !kept.has(id)) return { ok: false, reason: 'c: ' + d.b + ' left on ' + id };
    }
    for (const [fromId, to, b] of R.moved) {
      if (!isObj(B[to]) || B[to].b !== b || MOVE43[b] !== to) return { ok: false, reason: 'c: ' + b + ' not on ' + to };
      if (!isObj(A[fromId]) || A[fromId].b !== b) return { ok: false, reason: 'c: ' + b + ' was not on ' + fromId };
    }
    // every site that did not move kept its id (and, unless repriced, its whole entry)
    const rep = new Map(R.repriced.map((x) => [x.id, x]));
    const origin = (id) => { const m = movedTo.get(id); return m ? m[0] : id; };
    for (const id of Object.keys(B)) {
      const o = origin(id);
      if (!hasOwn(A, o)) return { ok: false, reason: 'c: ' + id + ' came from nowhere' };
      if (rep.has(id) && rep.get(id).st === 'scaffold') {
        if (!sameJSON(without(A[o], ['t']), without(B[id], ['t']))) return { ok: false, reason: 'c: ' + id + ' changed beyond its time' };
      } else if (rep.has(id)) {
        if (!sameJSON(without(A[o], ['got', 't']), without(B[id], ['got', 't']))) return { ok: false, reason: 'c: ' + id + ' changed beyond its price' };
        if (!sameJSON(without(A[o].got, MATERIALS), without(B[id].got, MATERIALS))) return { ok: false, reason: 'd: ' + id + ' got other items' };
      } else if (!sameJSON(A[o], B[id])) return { ok: false, reason: 'c: ' + id + ' changed' };
    }
    // d
    const extra = {};
    for (const x of R.repriced) {
      const a = A[origin(x.id)], b = B[x.id], N = NEW43(x.b), O = OLD43[x.b];
      if (!N || !isObj(b) || b.b !== x.b || STATES_UNFINISHED.indexOf(b.st) < 0) return { ok: false, reason: 'd: ' + x.id };
      for (const m of MATERIALS) {
        if (b.st === 'scaffold') {
          // (the frame holds the whole old need: what it took above the new one comes back; its got is not touched)
          const e = Math.max(0, O[m] - N[m]);
          if ((x.extra[m] || 0) !== e) return { ok: false, reason: 'd: ' + x.id + ' ' + m + ' frame' };
          extra[m] = (extra[m] || 0) + e;
          continue;
        }
        const before = isObj(a.got) && hasOwn(a.got, m) ? cnt(a.got[m]) : 0;
        const after = isObj(b.got) && hasOwn(b.got, m) ? cnt(b.got[m]) : 0;
        if (after !== Math.min(before, N[m]) || before - after !== (x.extra[m] || 0)) return { ok: false, reason: 'd: ' + x.id + ' ' + m };
        extra[m] = (extra[m] || 0) + (before - after);
      }
      if (b.t !== undefined && num(b.t, 0) > N.time) return { ok: false, reason: 'd: ' + x.id + ' t' };
    }
    // every unfinished hall / office was repriced, nothing else was
    for (const id of Object.keys(B)) { const d = B[id]; if (isObj(d) && hasOwn(OLD43, d.b) && STATES_UNFINISHED.indexOf(d.st) >= 0 && !rep.has(id)) return { ok: false, reason: 'd: ' + id + ' not repriced' }; }
    for (const m of MATERIALS) if ((extra[m] || 0) !== (R.extra[m] || 0) || (R.extra[m] || 0) !== (R.toWh[m] || 0) + (R.asCoins[m] || 0)) return { ok: false, reason: 'd: ' + m + ' does not add up' };
    // e
    let want = 0;
    for (const x of R.repriced) want += OLD43[x.b].coins - NEW43(x.b).coins;
    for (const m of MATERIALS) want += (R.asCoins[m] || 0) * priceOf(m);
    const c0 = Math.min(1e12, Math.max(0, Math.floor(num(pre.coins, 0)))), c1 = Math.floor(num(post.coins, 0));
    if (want !== R.coins || (R.coins > 0 ? c1 - c0 !== R.coins : !sameJSON(pre.coins, post.coins))) return { ok: false, reason: 'e: coins ' + c0 + ' -> ' + c1 + ' vs ' + R.coins };
    // f
    const w0 = isObj(pre.v3) && isObj(pre.v3.warehouse) ? pre.v3.warehouse : {}, w1 = isObj(post.v3) && isObj(post.v3.warehouse) ? post.v3.warehouse : {};
    const toWhN = Object.keys(R.toWh).reduce((n, m) => n + R.toWh[m], 0);
    if (toWhN > 0) {
      if (!hasDoneWarehouse(B)) return { ok: false, reason: 'f: 창고 refund without a 창고' };
      if (whTotal(w1) > Math.max(whCap(), whTotal(w0))) return { ok: false, reason: 'f: 창고 over its capacity' };
      for (const k of new Set(Object.keys(w0).concat(Object.keys(w1)))) {
        const d = (R.toWh[k] || 0);
        if (d ? cnt(w1[k]) - cnt(w0[k]) !== d : !sameJSON(w0[k], w1[k])) return { ok: false, reason: 'f: 창고 ' + k };
      }
    } else if (!sameJSON(isObj(pre.v3) ? pre.v3.warehouse : undefined, isObj(post.v3) ? post.v3.warehouse : undefined)) return { ok: false, reason: 'f: 창고 changed' };
    // g
    const v = post.v43;
    if (!isObj(v) || Math.floor(num(v.lay, 0)) < LAY || !isObj(v.refunds43) || !isObj(v.src)) return { ok: false, reason: 'g: no marker' };
    if (v.refunds43.coins !== R.coins || v.refunds43.moved !== R.moved.length || v.refunds43.kept !== R.kept.length) return { ok: false, reason: 'g: refunds43' };
    const again = remap43(post);
    if (!again.r.noop || !sameJSON(again.save, post)) return { ok: false, reason: 'g: not a no-op the second time' };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'threw: ' + String((e && e.message) || e).slice(0, 80) };
  }
}

/**
 * (map_save §4.4 h) after sanitizeSave: every building the remap kept is still there and has a place to stand. post = the
 * remap output, out = sanitizeSave(post), rules = Save.js SITE_RULES { BUILDINGS, STATES, UNIQ } (the entries sanitize
 * would drop whatever the layout — a broken id, an unknown building — are not the remap's: they are left out). Catches a
 * wrong `only`, size or hidden flag in the plot table: the building would vanish at the first autosave
 */
export function check43b(post, out, rules) {
  try {
    const P = isObj(post) && isObj(post.sites) ? post.sites : {}, O = isObj(out) && isObj(out.sites) ? out.sites : {};
    const RB = (rules && rules.BUILDINGS) || [], RS = (rules && rules.STATES) || [], RU = (rules && rules.UNIQ) || [];
    const plots = WORLD.plots || {}, towers = WORLD.towers || {};
    for (const id of Object.keys(P)) {
      const d = P[id];
      if (!/^[a-z0-9_]{1,40}$/.test(id) || !isObj(d) || RB.indexOf(d.b) < 0 || RS.indexOf(d.st) < 0) continue;
      const o = O[id];
      if (!(isObj(o) && o.b === d.b && o.st === d.st)) {
        if (RU.indexOf(d.b) >= 0 && Object.keys(O).some((k) => isObj(O[k]) && O[k].b === d.b)) continue;     // a second one of a unique kind
        return { ok: false, reason: d.b + ' on ' + id + ' would be dropped' };
      }
    }
    for (const id of Object.keys(O)) {
      const p = plots[id];
      if (!(p && p.hidden !== true) && !hasOwn(towers, id)) return { ok: false, reason: O[id].b + ' on ' + id + ' has no place' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'threw: ' + String((e && e.message) || e).slice(0, 80) };
  }
}
