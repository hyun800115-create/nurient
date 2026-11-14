// (v4.3 step B, WP-N) 「마을 새 단장」: the standalone letter an old village reads once after R43 moved it onto plot table
// v2, then the 「새 지도 보기」 3-tap tour (build_plan.md §3.10, BP-5, BP-16; postdepot_addendum.md §4.3 row N; designer doc
// 기획서_마을새단장.md §12 item 11). A standalone card, not a VillageNews letter: most pre-읍 villages have no 소복이, so a
// mailbox letter would never be read (BP-5).
//
//   Renewal43.afterLoad(gs, info)   registered first on the after-load seam (src/systems/v43/index.js). When the letter is
//                                   due (below) it makes gs.renewal43 (one RenewalRun per Game.build) and folds the a3
//                                   bakery note into the letter: progress.bakeryMovedNow is cleared here, so the banner at
//                                   Game.build (after runAfterLoad) does not fire. A new game: nothing (its v43 holder
//                                   already has letter43 + tour43, and it has no refunds43)
//   Renewal43.due(gs)               a village R43 moved (v43.refunds43 is there: remap43 always writes it) whose letter is
//                                   unread (no v43.seen.letter43), with no save hold (Save.held / pending43 / the failure
//                                   card). So the letter opens on the remapped load, and once more on a later load if the
//                                   app was closed before the letter was (the marker is written on close, never on open)
//   Renewal43.allowed()             players always; automated browsers (test suites, bots) only when asked:
//                                   window.__FV_LETTER43 = true or ?letter43=1 (as the flag card and the first-run tutorial
//                                   do) — a suite that loads an old village through the real remap plays as before N
//   Renewal43.rows(gs, bakery)      the letter's rows for this village (pure reading of the game as it stands)
//   Renewal43Card                   the card in the UI scene, mounted by UI.create (BP-26) as ui.renewal43
//
// Order on load (§3.10 item 3): letter → (its tour) → the flag maker's one-time card (VillageFlags.busy() says 'letter'
// while ui.renewal43.isOpen) → nothing else. G's 「물류창고 다음 목표」 banner and T's taste wait for ui.renewal43.isOpen
// too (BP-48). isOpen is true from the moment the letter is due until the letter and its tour are over.
//
// The letter (built from refunds43 and the village as R43 left it):
//   - the workshops now on their fixed plots (d_tool / d_wh / d_cannery / d_store: a pre-B village had none of those
//     plots, so every workshop on one was moved there), 「단계 · 쌓인 물건 · 일꾼 모두 그대로」;
//   - refunds43.kept: buildings that stayed where they were (their new spot was taken);
//   - the hall: moved next to the office (finished), or 「이어 지어요」 (unfinished, repriced);
//   - D21: a hall / office finished at the old price stays, no refund, a thank-you;
//   - refunds43: coins back (refunds43.coins, the materials the 창고 could not take included) and the materials put in
//     the 창고 (refunds43.wh) — the very numbers R43 paid;
//   - h43_2 (a built second first house moved with its id to the reserve's east edge);
//   - the bakery note (a pre-bakery village whose bakery came at this load, Progression.bakery43);
//   - s4half villages (already 읍 when remapped): 「4단 「눈꽃마을 시장」은 반값에 지어요 · 차례가 오면 목표 창에 나와요」
//     (postdepot_addendum.md §4.3: stage 4 is GOALS43 row 9 now, no early pad), only while this build has the mkt_s4 step.
//   Buttons 「새 지도 보기」 (the tour) and 「닫기」. The card is modal: a dim over the village, the joystick and the HUD take
//   no touch, ui.v42PanelOpen is held (관망, the goal window, the 새로워진 것 card wait), and it keeps clear of the right-hand
//   HUD column (정기 납품 · 업무 · 마을 진도, ui.rightBoxes) and of the objective panel (G6).
// The tour (Tour43, drawn by src/scenes/OnboardOverlay.js like the first-run tutorial's replay tour): three stops —
//   1 마을회관 · 촌장님 사무실, 2 공방 거리 (대장간 · 창고), 3 마을 마당 (한마당 터) then the first shop. The camera glides
//   to each stop (zoomed out to at most 1.0 while it runs, the player's zoom back after), a pulse ring marks the place,
//   the coach card says what is there, and the finger taps 「다음 ›」: three taps (다음, 다음, 다 봤어요) and it is done.
//   「건너뛰기」 ends it at once; an idle stop moves on by itself after STOP_S. The village holds as for the letter.
// Saves: v43.seen.letter43 when the letter closes (both buttons), v43.seen.tour43 when the tour ends or is skipped, or
// with the letter when 「닫기」 declined it; each written at once (gs.save(true)). Nothing else is changed.
// The v43 bus: letter { state: 'open' | 'close', tour }, tour { state: 'start' | 'step' | 'done' | 'skip', n } (P1 only
// listens). Test hooks: window.__FV43.renewal = { state, rows, open, close, tour, next, skip }.

import { Assets } from '../../core/Assets.js';
import { Audio } from '../../core/Audio.js';
import { Input } from '../../core/Input.js';
import { View } from '../../core/View.js';
import { panel } from '../../core/Panel.js';
import { Save } from '../../core/Save.js';
import { WORLD } from '../../data/world.js';
import { FONT, t, fmt } from '../../data/strings.js';
import { SEEN43, EV43, FLAG43, PLOT43, WORKSHOP_PLOT43, STEP43 } from '../../data/ids43.js';
import { STEPS } from '../Progression.js';
import { DEPTH } from '../DepthSort.js';
import { emit } from './hooks.js';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const cnt = (v) => Math.max(0, Math.floor(Number(v) || 0));
const OPEN_AFTER = 1.2;          // s of game time after the load before the letter opens (the village shows first)
const STOP_S = 10;               // an idle tour stop moves on by itself after this (s); the third waits STOP_S + PAN_AT
const PAN_AT = 3.5;              // the third stop: the village green first, the shop after this (s)
const TOUR_ZOOM = 1.0;           // the tour shows a little more: the zoom is at most this while it runs
const TOUR_AT = 0.42;            // a stop's place stands this far down the screen (the coach card has the bottom part)
const CARD_LIFT = 80;            // the coach card sits this much higher than the tutorial's bottom slot (clear of toasts)
const MATS = ['item_plank', 'item_ingot'];
const KINDS = ['toolsmith', 'warehouse', 'cannery', 'store'];

/** may the letter show here? (players always; automated browsers only when asked: __FV_LETTER43 / ?letter43=1) */
function allowed() {
  try {
    const w = typeof window !== 'undefined' ? window : null;
    if (w && w.__FV_LETTER43 === true) return true;
    if (w && w.__FV_LETTER43 === false) return false;
    const q = w && w.location ? /[?&]letter43=([01])/.exec(w.location.search || '') : null;
    if (q) return q[1] === '1';
    if (typeof navigator !== 'undefined' && navigator.webdriver) return false;
  } catch (e) { return false; }
  return true;
}

/** the save's seen block (never cached across ticks: S's remap may replace gs.v43 at load); made when there is none */
function seenW(gs) {
  if (!isObj(gs.v43)) gs.v43 = { lay: 0 };
  if (!isObj(gs.v43.seen)) gs.v43.seen = {};
  return gs.v43.seen;
}
const seenR = (gs) => (gs && isObj(gs.v43) && isObj(gs.v43.seen) ? gs.v43.seen : null);
const builtOn = (gs, plot, kind) => { const s = gs.sites && gs.sites[plot]; return s && s.building === kind && s.state !== 'plot' ? s : null; };
const uiOf = (gs) => { try { const u = gs && gs.scene && gs.scene.get ? gs.scene.get('UI') : null; return u && u.ready ? u : null; } catch (e) { return null; } };

export const Renewal43 = {
  allowed,

  /** after-load hook (src/systems/v43/hooks.js runAfterLoad): one run per Game.build, only when the letter is due */
  afterLoad(gs, info) {
    if (!gs || !gs.events) return;
    if (gs.renewal43 && gs.renewal43.destroy) { try { gs.renewal43.destroy(); } catch (e) { /* */ } }
    gs.renewal43 = null;
    const inf = info || {};
    if (inf.fresh || !allowed() || !Renewal43.due(gs)) return;
    gs.renewal43 = new RenewalRun(gs, inf);
  },

  /** is the letter due (a remapped village, its letter unread, no save hold)? */
  due(gs) {
    const v = gs && gs.v43;
    if (!isObj(v) || !isObj(v.refunds43)) return false;
    if (isObj(v.seen) && v.seen[SEEN43.letter]) return false;
    if (Save.held || Save.pending43 || gs.saveHold) return false;
    return true;
  },

  /** the letter's rows: [{ key, icon: [art keys], text, sub }] */
  rows(gs, bakery) {
    const out = [];
    const v = isObj(gs.v43) ? gs.v43 : {}, R = isObj(v.refunds43) ? v.refunds43 : {};
    const P = gs.progress;
    // the workshops on their own plots (every one there was moved: a pre-B village had none of these plots)
    const moved = KINDS.filter((k) => builtOn(gs, WORKSHOP_PLOT43[k], k)).map((k) => t('b_' + k));
    if (moved.length) out.push({ key: 'moved', icon: ['ui_icon_tools', 'ui_icon_hammer'], text: t('r43_moved', { names: moved.join(' · ') }), sub: t('r43_movedSub') });
    if (cnt(R.kept) > 0) out.push({ key: 'kept', icon: ['ui_icon_house', 'ui_icon_map'], text: t('r43_kept', { n: cnt(R.kept) }), sub: null });
    // the hall (w_hall moved next to the office) and the office
    const hall = builtOn(gs, PLOT43.hall, 'town_hall'), office = builtOn(gs, PLOT43.office, 'chief_office');
    if (hall) out.push({ key: 'hall', icon: ['ui_icon_people', 'ui_icon_house'], text: t(hall.state === 'done' ? 'r43_hallMoved' : 'r43_hallGo'), sub: null });
    if (office && office.state !== 'done') out.push({ key: 'office', icon: ['ui_icon_office', 'ui_icon_house'], text: t('r43_officeGo'), sub: null });
    // D21: finished at the old price -> kept, no refund, thank you
    const thanks = [];
    if (hall && hall.state === 'done') thanks.push(t('b_town_hall'));
    if (office && office.state === 'done') thanks.push(t('b_chief_office'));
    if (thanks.length) out.push({ key: 'thanks', icon: ['ui_icon_heart_pair', 'ui_icon_happy'], text: t('r43_thanks', { names: thanks.join(' · ') }), sub: null });
    // refunds43: the coins (incl. materials the 창고 could not take) and what went into the 창고
    const coins = cnt(R.coins), items = isObj(R.items) ? R.items : {}, wh = isObj(R.wh) ? R.wh : {};
    const whList = MATS.filter((m) => cnt(wh[m]) > 0).map((m) => t('r43_count', { item: t(m), n: fmt(cnt(wh[m])) }));
    const sold = MATS.some((m) => cnt(items[m]) > cnt(wh[m]));
    if (coins > 0 || whList.length) {
      const whLine = whList.length ? t('r43_wh', { list: whList.join(' · ') }) : null;
      if (coins > 0) out.push({ key: 'refund', icon: ['ui_icon_coin'], text: t('r43_coins', { n: fmt(coins) }), sub: [sold ? t('r43_coinsMat') : null, whLine].filter(Boolean).join(' · ') || null });
      else out.push({ key: 'refund', icon: ['ui_icon_inventory', 'ui_icon_coin'], text: whLine.charAt(0).toUpperCase() + whLine.slice(1), sub: null });
    }
    // the second first house (a built one moved with its id)
    if (gs.sites && gs.sites[PLOT43.house2] && gs.sites[PLOT43.house2].building && gs.sites[PLOT43.house2].state !== 'plot') out.push({ key: 'house2', icon: ['ui_icon_house'], text: t('r43_house2'), sub: null });
    // the bakery note folded in (a3's banner for a village whose bakery came at this load)
    if (bakery) out.push({ key: 'bakery', icon: ['ui_icon_food', 'ui_icon_new'], text: t('bakeryMoved'), sub: null });
    // already 읍 when remapped: stage 4 at half price, in turn (GOALS43 row 9) — only while this build has the step
    if (P && P.flags && P.flags[FLAG43.s4half] && STEPS.some((s) => s.id === STEP43.shop4) && !(P.isDone && P.isDone(STEP43.shop4))) {
      out.push({ key: 's4half', icon: ['ui_icon_new', 'ui_icon_hammer'], text: t('r43_s4half'), sub: null });
    }
    if (!out.length) out.push({ key: 'map', icon: ['ui_icon_map'], text: t('r43_map'), sub: null });
    return out;
  },
};

// ====================================================================== the run (Game scene, one per build)
class RenewalRun {
  constructor(gs, info) {
    this.gs = gs;
    this.info = info || {};
    this.t = 0;
    this.phase = 'wait';          // 'wait' (due, not open yet) -> 'letter' -> 'tour' -> 'done'
    this.dead = false;
    this.flagHeld = false;        // we hold ui.v42PanelOpen (the letter / tour are a modal moment)
    this.zoom0 = null;            // the player's zoom while the tour shows more
    this.tour = null;
    this.stats = { opens: 0, closes: 0, tours: 0, steps: 0, done: 0, skips: 0 };
    // the bakery note goes into the letter: the banner at Game.build (after the hooks) does not fire
    const P = gs.progress;
    this.bakery = !!(P && P.bakeryMovedNow);
    if (this.bakery) P.bakeryMovedNow = false;
    this.data = { rows: Renewal43.rows(gs, this.bakery) };
    this.offs = [];
    const ev = gs.events;
    const up = (time, delta) => this.update((Number(delta) || 0) / 1000);
    ev.on('update', up);
    this.offs.push(() => ev.off('update', up));
    const bye = () => this.destroy();
    ev.once('shutdown', bye);
    this.offs.push(() => ev.off('shutdown', bye));
  }

  /** the letter or its tour holds the screen (or is about to) */
  get busy() { return !this.dead && (this.phase === 'wait' || this.phase === 'letter' || this.phase === 'tour'); }

  update(dt) {
    if (this.dead) return;
    this.t += dt;
    if (this.phase === 'wait') {
      // (a test, or another path, read it meanwhile: nothing to show)
      const sn = seenR(this.gs);
      if (sn && sn[SEEN43.letter]) { this.phase = 'done'; return; }
      if (this.t >= OPEN_AFTER && this.canOpen()) this.openLetter();
      return;
    }
    if (this.phase === 'letter') { const ui = uiOf(this.gs); if (ui && this.flagHeld && !ui.v42PanelOpen) ui.v42PanelOpen = true; return; }
    if (this.phase === 'tour' && this.tour) {
      const ui = uiOf(this.gs);
      if (ui && this.flagHeld && !ui.v42PanelOpen) ui.v42PanelOpen = true;
      this.tour.update(dt);
    }
  }

  /** nothing else holds the screen: the UI is up, no panel / card / hold, no 승격식, no map, no tutorial act */
  canOpen() {
    const gs = this.gs, ui = uiOf(gs);
    if (!ui || !ui.renewal43 || !gs.player) return false;
    if (ui.panelOpen || ui.buildOpen || ui.v4PanelOpen || ui.v42PanelOpen || ui.adminOpen || ui.moveOpen) return false;
    if (ui.saveHold && ui.saveHold.isOpen) return false;
    if (Save.held || gs.saveHold) return false;
    if (gs.overview) return false;
    if (gs.v4 && gs.v4.rank && gs.v4.rank.ceremonyOn) return false;
    const ob = gs.onboard;
    if (ob && (ob.mode === 'act1' || ob.mode === 'act2' || ob.mode === 'tour')) return false;
    const fm = ui.flagMaker;
    if ((fm && (fm.c || fm.cardC)) || (gs.flags && gs.flags.mk)) return false;
    return true;
  }

  holdFlag(on) {
    const ui = uiOf(this.gs);
    if (on) { if (ui) { ui.v42PanelOpen = true; this.flagHeld = true; } return; }
    if (this.flagHeld && ui) ui.v42PanelOpen = false;
    this.flagHeld = false;
  }

  openLetter() {
    const gs = this.gs, ui = uiOf(gs);
    if (!ui || !ui.renewal43) return false;
    // 관망 off (its camera and its seat), the joystick let go
    const P = gs.v42 && gs.v42.pilot;
    if (P && P.on) { try { P.stop('letter'); } catch (e) { /* */ } }
    try { Input.release(); } catch (e) { /* */ }
    if (!ui.renewal43.show(this.data)) return false;
    this.phase = 'letter';
    this.holdFlag(true);
    this.stats.opens++;
    emit(EV43.letter, { state: 'open' });
    return true;
  }

  /** the letter's buttons: 「새 지도 보기」 (withTour) or 「닫기」 */
  closeLetter(withTour) {
    if (this.dead || (this.phase !== 'letter' && this.phase !== 'wait')) return;
    const gs = this.gs, ui = uiOf(gs);
    if (ui && ui.renewal43) ui.renewal43.hide();
    const seen = seenW(gs);
    seen[SEEN43.letter] = 1;
    if (!withTour) seen[SEEN43.tour] = 1;
    this.stats.closes++;
    emit(EV43.letter, { state: 'close', tour: !!withTour });
    if (!withTour) { this.stats.skips++; emit(EV43.tour, { state: 'skip', n: 0 }); }
    try { gs.save(true); } catch (e) { /* */ }
    if (withTour && ui) this.startTour();
    else this.finish();
  }

  startTour() {
    const gs = this.gs;
    this.phase = 'tour';
    this.holdFlag(true);
    this.zoom0 = Number.isFinite(gs.zoomTarget) ? gs.zoomTarget : null;
    if (this.zoom0 !== null && this.zoom0 > TOUR_ZOOM) gs.zoomTarget = TOUR_ZOOM;
    this.tour = new Tour43(this);
    this.stats.tours++;
    emit(EV43.tour, { state: 'start', n: 1 });
    this.tour.go(0);
  }

  /** the tour is over: 'done' (the third tap or its own time) or 'skip' (건너뛰기) */
  endTour(how) {
    if (this.dead || this.phase !== 'tour') return;
    const gs = this.gs, n = this.tour ? this.tour.i + 1 : 0;
    seenW(gs)[SEEN43.tour] = 1;
    if (how === 'skip') this.stats.skips++; else this.stats.done++;
    emit(EV43.tour, { state: how === 'skip' ? 'skip' : 'done', n });
    try { gs.save(true); } catch (e) { /* */ }
    this.finish();
  }

  finish() {
    const gs = this.gs;
    if (this.tour) { this.tour.destroy(); this.tour = null; }
    if (this.zoom0 !== null && gs && !gs.overview) gs.zoomTarget = this.zoom0;
    this.zoom0 = null;
    this.holdFlag(false);
    this.phase = 'done';
  }

  /** from outside (the card's close(), a test): the letter read and its tour declined, or the tour skipped */
  cancel() {
    if (this.phase === 'letter' || this.phase === 'wait') this.closeLetter(false);
    else if (this.phase === 'tour') this.endTour('skip');
  }

  destroy() {
    if (this.dead) return;
    // (the scene goes: nothing is written — a letter not closed is due again next time)
    if (this.tour) { try { this.tour.destroy(); } catch (e) { /* */ } this.tour = null; }
    if (this.flagHeld) { const ui = uiOf(this.gs); if (ui) ui.v42PanelOpen = false; this.flagHeld = false; }
    const ui = uiOf(this.gs);
    if (ui && ui.renewal43 && ui.renewal43.cardOn) ui.renewal43.hide(true);
    this.dead = true;
    for (const f of this.offs.splice(0)) { try { f(); } catch (e) { /* */ } }
    if (this.gs.renewal43 === this) this.gs.renewal43 = null;
  }

  state() {
    const sn = seenR(this.gs) || {};
    return { phase: this.phase, t: +this.t.toFixed(2), bakery: this.bakery, rows: this.data.rows.map((r) => ({ key: r.key, text: r.text, sub: r.sub })), seen: { letter43: !!sn[SEEN43.letter], tour43: !!sn[SEEN43.tour] }, flagHeld: this.flagHeld, tour: this.tour ? this.tour.state() : null, stats: Object.assign({}, this.stats) };
  }
}

// ====================================================================== the tour (driven like Onboarding's replay tour)
/** the three stops: where the camera looks, where the ring is, the card's words */
function stopsOf(gs) {
  const P = WORLD.plots || {};
  const H = P[PLOT43.hall] || { x: 180, y: 760 }, O = P[PLOT43.office] || { x: 600, y: 640 };
  const T = P[PLOT43.tool] || { x: 60, y: 1530 }, Wh = P[PLOT43.wh] || { x: 475, y: 1525 };
  const front = Array.isArray(H.clear) && H.clear[1] ? { x: H.x + H.clear[1][0], y: H.y + H.clear[1][1] } : { x: H.x - 20, y: H.y + 200 };
  const hall = builtOn(gs, PLOT43.hall, 'town_hall');
  // (no hall yet: its plot is open once the village is complete (hire_hunter) — then it can be built there now)
  const hs = gs.sites && gs.sites[PLOT43.hall], hallL2 = hall ? (hall.state === 'done' ? 'r43_t1Built' : 'r43_t1Go') : hs && hs.shown ? 'r43_t1Open' : 'r43_t1Site';
  // the village green: the 한마당 reserve's middle (its screen polygon, world.js reserves)
  const R = WORLD.reserves && WORLD.reserves.p47_plaza, poly = R && Array.isArray(R.poly) ? R.poly : null;
  const green = poly && poly.length ? { x: poly.reduce((s, q) => s + q[0], 0) / poly.length, y: poly.reduce((s, q) => s + q[1], 0) / poly.length } : { x: 1053, y: 1578 };
  const M = gs.market, cash = M && M.cash && M.cash.pad ? M.cash.pad : null;
  const shop = cash ? { x: cash.x, y: cash.y } : { x: (WORLD.market && WORLD.market.x) || 1207, y: ((WORLD.market && WORLD.market.y) || 782) + 118 };
  return [
    { id: 'hall', l1: 'r43_t1', l2: hallL2, look: { x: (H.x + O.x) / 2, y: (H.y + O.y) / 2 + 120 }, ring: front },
    { id: 'work', l1: 'r43_t2', l2: 'r43_t2b', look: { x: (T.x + Wh.x) / 2, y: (T.y + Wh.y) / 2 + 40 }, ring: { x: (T.x + Wh.x) / 2, y: Math.max(T.y, Wh.y) + 125 } },
    { id: 'green', l1: 'r43_t3', l2: 'r43_t3b', look: { x: green.x, y: green.y }, ring: green, then: { look: { x: shop.x, y: shop.y - 20 }, ring: shop } },
  ];
}

class Tour43 {
  constructor(run) {
    this.run = run;
    this.gs = run.gs;
    this.mode = 'tour43';         // OnboardOverlay draws a driver in this mode like the replay tour
    this.i = -1;
    this.t = 0;
    this.n = 0;
    this.card = null;             // { id, key, l1, l2, next, nextLabel, tk }
    this.hand = null;             // { id, g: 'tap', btn: 'next', loop }
    this.tip = null; this.spot = null; this.target = null; this.showSkip = false;
    this.ringAt = null;           // { x, y, w } the pulse ring (also the overlay's "keep the card off it" box)
    this.ring = null;
    this.panned = false;
    this.stops = stopsOf(this.gs);
    this.held = [];
  }

  // ---- what OnboardOverlay calls on its driver
  next() { if (this.run.phase === 'tour') this.go(this.i + 1); }      // (the button itself clicks)
  skip() { if (this.run.phase === 'tour') this.run.endTour('skip'); }
  uiUpdate() { /* the coach card, the finger and the buttons are the overlay's */ }
  noteTap() { /* */ }
  relang() { const c = this.card; if (c && c.tk) { c.l1 = t(c.tk[0]); c.l2 = t(c.tk[1]); c.nextLabel = t(this.i >= this.stops.length - 1 ? 'r43_done' : 'onb_next'); } }

  go(i) {
    const gs = this.gs;
    if (i >= this.stops.length) { this.run.endTour('done'); return; }
    this.i = i;
    this.t = 0;
    this.panned = false;
    const S = this.stops[i], last = i === this.stops.length - 1;
    this.card = { id: ++this.n, key: 'r43:' + S.id, l1: t(S.l1), l2: t(S.l2), check: false, top: false, mini: false, bottom: true, lift: CARD_LIFT, next: true, nextLabel: t(last ? 'r43_done' : 'onb_next'), tk: [S.l1, S.l2] };
    this.hand = { id: ++this.n, g: 'tap', btn: 'next', loop: true };
    this.look(S.look, S.ring);
    if (i > 0) { this.run.stats.steps++; emit(EV43.tour, { state: 'step', n: i + 1 }); }
  }

  /** the camera to `at` (the place stands at TOUR_AT of the screen's height, above the coach card), the ring at `ring` */
  look(at, ring) {
    const gs = this.gs, ui = uiOf(gs);
    this.ringAt = ring ? { x: ring.x, y: ring.y, w: 190 } : null;
    const H = ui ? ui.H : 1280, z = Math.max(0.3, Number(gs.zoomTarget) || 1);
    this.lookAt = at ? { x: at.x, y: at.y + ((0.5 - TOUR_AT) * H) / z } : null;
    if (this.lookAt && gs.focusCamera) gs.focusCamera(this.lookAt.x, this.lookAt.y, 1e9);
  }

  update(dt) {
    this.t += dt;
    const S = this.stops[this.i];
    if (S && S.then && !this.panned && this.t >= PAN_AT) { this.panned = true; this.look(S.then.look, S.then.ring); }
    if (this.t >= STOP_S + (S && S.then ? PAN_AT : 0)) { this.go(this.i + 1); return; }
    // (something else took the camera for a moment — a site that finishes pans to it for 1.6 s: the stop's place comes back)
    const gs = this.gs;
    if (this.lookAt && !gs.camFocus && gs.focusCamera) gs.focusCamera(this.lookAt.x, this.lookAt.y, 1e9);
    this.updateRing();
  }

  /** the flat pulse ring under the place (Onboarding.updateRing's look) */
  updateRing() {
    const gs = this.gs, at = this.ringAt;
    if (!at) { if (this.ring && this.ring.visible) this.ring.setVisible(false); return; }
    if (!this.ring) {
      const key = Assets.has('ui_tap_ripple') ? 'ui_tap_ripple' : 'ui_ring_fill';
      this.ring = Assets.image(gs, 0, 0, key).setOrigin(0.5).setDepth(DEPTH.PAD + 50).setTint(0xffe27a);
      this.ringBase = 1 / Math.max(1, this.ring.frame.realWidth);
    }
    const k = (at.w || 150) * (1.025 + Math.sin(this.run.t * (Math.PI * 2 / 0.9)) * 0.125);
    this.ring.setVisible(true).setPosition(at.x, at.y).setScale(this.ringBase * k, this.ringBase * k * 0.5).setAlpha(0.85);
  }

  destroy() {
    if (this.ring) { try { this.ring.destroy(); } catch (e) { /* */ } this.ring = null; }
    this.gs.camFocus = null;          // (the camera glides back to the chief)
    this.card = null; this.hand = null; this.ringAt = null;
  }

  state() {
    const S = this.stops[this.i], c = this.card;
    return { mode: this.mode, i: this.i, stop: S ? S.id : null, t: +this.t.toFixed(2), panned: this.panned, card: c ? { key: c.key, l1: c.l1, l2: c.l2, nextLabel: c.nextLabel } : null, hand: this.hand ? this.hand.g : null, ring: this.ringAt ? { x: Math.round(this.ringAt.x), y: Math.round(this.ringAt.y) } : null, look: this.lookAt ? { x: Math.round(this.lookAt.x), y: Math.round(this.lookAt.y) } : null };
  }
}

// ====================================================================== the card (UI scene)
const TXT = (size, color, weight = '900') => ({ fontFamily: FONT, fontSize: Math.round(size) + 'px', fontStyle: weight, color, resolution: 2 });
const DEPTH_CARD = 84;           // over the HUD, the toasts (50), the banners (60) and the tutorial overlay (≤ 75)
const PAD = 28;                  // inside margin
const MIN_SIDE = 470;            // narrower than this beside the HUD column: the card goes below the column instead

/** an icon image (the first key that has art), `size` px on its longer side */
function iconImg(ui, keys, size) {
  const k = Assets.pick(...keys);
  const im = Assets.image(ui, 0, 0, k).setOrigin(0.5);
  im.__keys = keys; im.__key = Assets.has(k) ? k : null;
  im.__sz = size;
  im.setScale(size / Math.max(1, im.frame.realWidth, im.frame.realHeight));
  return im;
}

/** the letter card in the UI scene (mounted by UI.create as ui.renewal43, BP-26). Built when it opens, destroyed when it
 *  closes. `isOpen`: the letter or its tour holds the screen, or is about to (G, T and the flag card wait for it) */
export class Renewal43Card {
  constructor(ui) {
    this.ui = ui;
    this.cardOn = false;
    this.c = null;
    this.box = null;              // [l, t, r, b] on screen (logical px) while shown
    this.btns = null;             // { tour: [l, t, r, b], close: [...] }
    this.scale = 1;
    this.dead = false;
    this.lk = '';                 // what the last layout was made for (screen, right-hand HUD column)
    this.onResize = () => { this.lk = ''; if (this.cardOn) this.layout(); };
    // (the HUD column changes under the card — a chip hides while a panel holds the screen: laid out again)
    this.onTick = () => {
      if (!this.cardOn) return;
      // (an icon whose atlas arrives late — ui3 / ui5 come after the boot — takes its own art then)
      this.artT = (this.artT || 0) + 1;
      if (this.artT % 20 === 0 && this.upgradeIcons()) this.lk = '';
      if (this.layoutKey() !== this.lk) this.layout();
    };
    this.onShutdown = () => this.destroy();
    try { ui.scale.on('resize', this.onResize); ui.events.on('update', this.onTick); ui.events.once('shutdown', this.onShutdown); } catch (e) { /* */ }
    installHooks();
  }

  get gs() { return this.ui && this.ui.gs; }
  get run() { const gs = this.gs, r = gs && gs.renewal43; return r && !r.dead ? r : null; }
  get isOpen() { const r = this.run; return this.cardOn || !!(r && r.busy); }

  /** B0's entry: open the letter for this village now (the run decides when; a test may call it) */
  open() { const r = this.run; return r && r.phase === 'wait' ? r.openLetter() : this.cardOn; }
  /** close it as 「닫기」 does (the letter read, its tour declined), or end a running tour */
  close() { const r = this.run; if (r) r.cancel(); else this.hide(); }

  /** draw the card for `data` ({ rows }); the run calls this */
  show(data) {
    if (this.dead || !this.ui || !this.ui.ready) return false;
    this.hide(true);
    this.data = data;
    this.build();
    this.cardOn = true;
    this.layout();
    const ui = this.ui;
    this.body.setScale(0.86);
    this.c.setAlpha(0);
    ui.tweens.add({ targets: this.c, alpha: 1, duration: 180 });
    ui.tweens.add({ targets: this.body, scale: 1, duration: 240, ease: 'Back.easeOut' });
    try { Audio.play('sfx_unlock', { volume: 0.5 }); } catch (e) { /* */ }
    return true;
  }

  hide(instant) {
    const c = this.c;
    this.cardOn = false;
    this.box = null; this.btns = null;
    if (!c) return;
    this.c = null;
    const ui = this.ui;
    try { ui.tweens.killTweensOf(c); if (this.body) ui.tweens.killTweensOf(this.body); } catch (e) { /* */ }
    if (instant || !ui.sys || !ui.sys.isActive()) { try { c.destroy(); } catch (e) { /* */ } return; }
    ui.tweens.add({ targets: c, alpha: 0, duration: 150, onComplete: () => { try { c.destroy(); } catch (e) { /* */ } } });
  }

  press(which) {
    const r = this.run;
    if (!r || !this.cardOn) return;
    r.closeLetter(which === 'tour');
  }

  // ------------------------------------------------------------------ build and layout
  build() {
    const ui = this.ui, W = ui.W, H = ui.H;
    const c = this.c = ui.add.container(0, 0).setDepth(DEPTH_CARD);
    this.dim = ui.add.rectangle(W / 2, H / 2, W * 3, H * 3, 0x1b2638, 0.42).setInteractive();
    this.dim.on('pointerdown', () => {});
    const b = this.body = ui.add.container(W / 2, H / 2);
    this.bg = panel(ui, 0, 0, 'ui_panel', 600, 400).setOrigin(0.5);
    this.icon = iconImg(ui, ['ui_letter', 'ui_icon_letter', 'ui_icon_map'], 58);
    this.title = ui.add.text(0, 0, t('r43_title'), TXT(38, '#2b2f3a')).setOrigin(0, 0.5);
    this.hello = ui.add.text(0, 0, t('r43_hello'), TXT(23, '#4c5a6e', '800')).setOrigin(0.5, 0);
    b.add([this.bg, this.icon, this.title, this.hello]);
    this.rows = (this.data.rows || []).map((r) => {
      const o = { r, plate: ui.add.graphics(), ic: iconImg(ui, r.icon, 44) };
      o.tx = ui.add.text(0, 0, r.text || '', TXT(22, '#2b2f3a', '800')).setOrigin(0, 0);
      o.sub = r.sub ? ui.add.text(0, 0, r.sub, TXT(18, '#6b7686', '800')).setOrigin(0, 0) : null;
      b.add([o.plate, o.ic, o.tx].concat(o.sub ? [o.sub] : []));
      return o;
    });
    this.bTour = ui.makeButton(0, 0, 260, 78, 'green', t('r43_tour'), () => this.press('tour'), 28);
    this.bClose = ui.makeButton(0, 0, 200, 78, 'gray', t('r43_close'), () => this.press('close'), 28);
    b.add([this.bClose, this.bTour]);
    c.add([this.dim, b]);
  }

  /** icons drawn with a stand-in key get the first art of their list that has arrived since; -> whether one changed */
  upgradeIcons() {
    let n = 0;
    for (const im of [this.icon].concat((this.rows || []).map((o) => o.ic))) {
      if (!im || !im.__keys) continue;
      const k = im.__keys.find((q) => Assets.has(q));
      if (k && k !== im.__key) { try { Assets.apply(im, k); im.setOrigin(0.5); im.__key = k; n++; } catch (e) { /* */ } }
    }
    return n > 0;
  }

  /** a text at font size `s` wrapped to `w` (Korean wraps at its spaces); its height */
  wrap(tx, s, w) {
    tx.setScale(1).setFontSize(Math.round(s)).setWordWrapWidth(Math.max(40, w), true);
    return tx.height;
  }

  /** place everything for a card `cw` wide at text scale `k` (body-local, centred on 0, 0); returns its height */
  measure(cw, k) {
    const inner = cw - PAD * 2;
    const IC = Math.round(58 * Math.max(0.8, k)), RI = Math.round(44 * Math.max(0.8, k));
    // header: the letter icon + the title (shrinks to fit), then the hello line
    this.icon.setScale(IC / Math.max(1, this.icon.frame.realWidth, this.icon.frame.realHeight));
    this.title.setScale(1).setWordWrapWidth(null).setFontSize(Math.round(38 * k));
    const tMax = inner - IC - 14;
    if (this.title.width > tMax) this.title.setScale(tMax / this.title.width);
    const hHead = Math.max(IC, this.title.displayHeight);
    const hHello = this.wrap(this.hello, 23 * k, inner);
    this.hello.setAlign('center');
    const rows = this.rows.map((o) => {
      const tw = inner - 20 - RI - 14;
      const h1 = this.wrap(o.tx, 22 * k, tw);
      const h2 = o.sub ? this.wrap(o.sub, 18 * k, tw) : 0;
      return { o, h1, h2, h: Math.max(RI + 16, 12 + h1 + (h2 ? 4 + h2 : 0) + 12) };
    });
    const BTN = 78, G = Math.round(10 * k);
    const ch = 24 + hHead + G + hHello + 14 + rows.reduce((s, q) => s + q.h + 8, 0) + 8 + BTN + 24;
    let y = -ch / 2 + 24;
    const L = -cw / 2 + PAD;
    // the header centred as a group
    const gw = IC + 14 + this.title.displayWidth;
    this.icon.setPosition(-gw / 2 + IC / 2, y + hHead / 2);
    this.title.setPosition(-gw / 2 + IC + 14, y + hHead / 2);
    y += hHead + G;
    this.hello.setPosition(0, y);
    y += hHello + 14;
    for (const q of rows) {
      const { o } = q;
      o.plate.clear();
      o.plate.fillStyle(0xf1ece0, 1); o.plate.fillRoundedRect(L - 6, y, inner + 12, q.h, 16);
      o.ic.setScale(RI / Math.max(1, o.ic.frame.realWidth, o.ic.frame.realHeight)).setPosition(L + 10 + RI / 2, y + q.h / 2);
      const tx = L + 10 + RI + 14;
      const ty = y + (q.h - (q.h1 + (q.h2 ? 4 + q.h2 : 0))) / 2;
      o.tx.setPosition(tx, ty);
      if (o.sub) o.sub.setPosition(tx, ty + q.h1 + 4);
      y += q.h + 8;
    }
    y += 8;
    // the buttons: 「닫기」 left, 「새 지도 보기」 right (the one to press), side by side
    const gap = 16, wTour = Math.min(300, Math.round((inner - gap) * 0.58)), wClose = Math.min(220, inner - gap - wTour);
    const by = y + BTN / 2;
    const xL = -(wTour + gap + wClose) / 2;
    this.setBtn(this.bClose, xL + wClose / 2, by, wClose, BTN);
    this.setBtn(this.bTour, xL + wClose + gap + wTour / 2, by, wTour, BTN);
    this.bg.setSize(cw, ch);
    return ch;
  }

  setBtn(btn, x, y, w, h) {
    btn.setPosition(Math.round(x), Math.round(y));
    if (btn.__w !== w) {
      btn.__w = w;
      const kk = btn.bg && btn.bg.scaleX ? 1 / btn.bg.scaleX : 1;
      if (btn.bg && btn.bg.setSize) btn.bg.setSize(w * kk, h * kk);
      btn.setSize(w, h);
      if (btn.input && btn.input.hitArea) btn.input.hitArea.setTo(0, 0, w, h);
      if (btn.text && btn.text.width > w - 24) btn.text.setScale((w - 24) / btn.text.width);
    }
  }

  /** the card's frame for the screen as it is now: under the objective panel, clear of the right-hand HUD column
   *  (beside it when there is room, else below it), above the bottom HUD; the text scale shrinks to fit */
  layoutKey() {
    const ui = this.ui, bx = ui.rightBoxes || [], n = ui.rightN || 0;
    let k = ui.W + 'x' + ui.H + '|' + View.safeTop + '|' + View.safeBottom + '|';
    for (let i = 0; i < n; i++) if (bx[i]) k += Math.round(bx[i].l) + ',' + Math.round(bx[i].t) + ',' + Math.round(bx[i].b) + ';';
    return k;
  }

  layout() {
    if (!this.c || !this.cardOn) return;
    this.lk = this.layoutKey();
    const ui = this.ui, W = ui.W, H = ui.H, top = 62 + View.safeTop;
    this.dim.setPosition(W / 2, H / 2);
    const objB = top + 88 + 31;                       // the objective panel's lower edge (UI.layout)
    const bottom = H - 140 - View.safeBottom;          // the bottom HUD (whistle, map, zoom) stays clear
    const bx = ui.rightBoxes || [], n = ui.rightN || 0;
    const col = [];
    for (let i = 0; i < n; i++) { const o = bx[i]; if (o && o.b > o.t) col.push(o); }
    const cw0 = Math.min(W - 48, 620);
    let best = null;
    for (const k of [1, 0.92, 0.85, 0.78, 0.72]) {
      // A: full width under the objective panel, if the column is not in the way
      let y0 = objB + 14, cw = cw0, cx = W / 2;
      let ch = this.measure(cw, k);
      const hits = (yy, hh, l, r) => col.filter((o) => r > o.l - 12 && yy < o.b + 10 && yy + hh > o.t - 10);
      if (hits(y0, ch, cx - cw / 2, cx + cw / 2).length) {
        // B: left of the column, narrower
        const L = Math.min(...col.map((o) => o.l));
        const room = L - 12 - 24;
        let done = false;
        if (room >= MIN_SIDE) {
          const ch2 = this.measure(room, k);
          if (y0 + ch2 <= bottom) { cw = room; cx = 24 + room / 2; ch = ch2; done = true; }
        }
        // C: below the column, full width
        if (!done) { ch = this.measure(cw0, k); cw = cw0; cx = W / 2; y0 = Math.max(...col.map((o) => o.b)) + 14; }
      }
      const fits = y0 + ch <= bottom;
      best = { k, cw, cx, y0, ch, fits };          // (none fits: the smallest text scale)
      if (fits) break;
    }
    if (!best.fits) best.y0 = Math.max(objB + 14, Math.min(best.y0, bottom - best.ch));
    const ch = this.measure(best.cw, best.k);
    this.scale = best.k;
    this.body.setPosition(Math.round(best.cx), Math.round(best.y0 + ch / 2));
    this.box = [Math.round(best.cx - best.cw / 2), Math.round(best.y0), Math.round(best.cx + best.cw / 2), Math.round(best.y0 + ch)];
    const bb = (btn) => [Math.round(this.body.x + btn.x - btn.__w / 2), Math.round(this.body.y + btn.y - 39), Math.round(this.body.x + btn.x + btn.__w / 2), Math.round(this.body.y + btn.y + 39)];
    this.btns = { tour: bb(this.bTour), close: bb(this.bClose) };
  }

  /** test hooks: what is shown and where (screen, logical px) */
  state() {
    const texts = [];
    if (this.c && this.cardOn) {
      for (const o of this.body.list) {
        if (o.type === 'Text' && o.visible && o.text) { const b = o.getBounds(); texts.push({ s: o.text, l: Math.round(b.x), t: Math.round(b.y), r: Math.round(b.right), b: Math.round(b.bottom) }); }
        if (o.type === 'Container' && o.text && o.text.text) { const b = o.text.getBounds(); texts.push({ s: o.text.text, btn: true, l: Math.round(b.x), t: Math.round(b.y), r: Math.round(b.right), b: Math.round(b.bottom) }); }
      }
    }
    const r = this.run;
    return { open: this.isOpen, shown: !!(this.cardOn && this.c && this.c.alpha > 0.5), box: this.box ? this.box.slice() : null, btns: this.btns ? { tour: this.btns.tour.slice(), close: this.btns.close.slice() } : null, scale: this.scale, texts, screen: [this.ui.W, this.ui.H], run: r ? r.state() : null };
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.hide(true);
    const ui = this.ui;
    try { ui.scale.off('resize', this.onResize); } catch (e) { /* */ }
    try { ui.events.off('update', this.onTick); ui.events.off('shutdown', this.onShutdown); } catch (e) { /* */ }
  }
}

/** window.__FV43.renewal (tests; texbudget's view hook for the tour): the live run / card of the current scenes */
function installHooks() {
  try {
    if (typeof window === 'undefined' || !window.__FV43) return;
    const gsOf = () => { const F = window.__FV; return F && F.scene ? F.scene : null; };
    const cardOf = () => { const gs = gsOf(), ui = uiOf(gs); return ui && ui.renewal43 ? ui.renewal43 : null; };
    window.__FV43.renewal = {
      state() { const gs = gsOf(), c = cardOf(), r = gs && gs.renewal43; return { due: gs ? Renewal43.due(gs) : false, allowed: allowed(), run: r && !r.dead ? r.state() : null, card: c ? c.state() : null }; },
      rows() { const gs = gsOf(); return gs ? Renewal43.rows(gs, false) : []; },
      open() { const c = cardOf(); return c ? c.open() : false; },
      close() { const c = cardOf(); if (c) c.close(); return true; },
      tour() { const c = cardOf(); if (c && c.cardOn) { c.press('tour'); return true; } return false; },
      next() { const gs = gsOf(), r = gs && gs.renewal43; if (r && r.tour) { r.tour.next(); return true; } return false; },
      skip() { const gs = gsOf(), r = gs && gs.renewal43; if (r && r.tour) { r.tour.skip(); return true; } return false; },
    };
  } catch (e) { /* */ }
}
