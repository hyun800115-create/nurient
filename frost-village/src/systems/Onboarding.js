// (v4.2.0.1) 첫 실행 튜토리얼 — the first-run tutorial (design: onboard/design/script.md).
//
// A new game shows a pointing mitten (OnboardOverlay, UI scene) that demonstrates what to do — drag to walk, let go to
// stand, tap a button — through the first fish loop, then helps a little until the fisherman is hired, then introduces
// the HUD buttons one at a time. It never pauses the game, never disables Input and never changes the economy: it only
// reads the world and says / shows what the existing Tutorial would ask, one readable step at a time.
//
//   Act 1  (owns the pointer)  S0 반가워요 → S1 걷기 → S2 가만히 서 있기 → S3 화덕으로 → S4 서서 굽기 → S5 가져가기 →
//          S6 판매대 → S7 계산대 → S8 코인 → S9 점원 고용 발판 → S10 일꾼이 하는 일. The step is worked out from the world
//          every 0.2 s (like Tutorial.firstLoop), so a player who does things in another order is never sent back
//   Act 2  the existing Tutorial draws arrow + objective again; the finger helps after 5 s idle; plain words for the
//          cook / fisher pads; the closing card when the fisherman is hired
//   Act 3  one-time tips for the HUD buttons (whistle, 길 안내, zoom, map, settings, 관망), one at a time, 45 s apart
//
// Saved as one integer `onb` (bit flags ONB) — only by villages that began with it: an old save never sees it.
// 「건너뛰기」 ends everything at once; 설정 › 놀이 › 「튜토리얼 다시 보기」 replays it (replay never writes `onb`).
// Automated browsers (navigator.webdriver: the test suites, the bots) never get it unless they ask: ?onboard=1 or
// window.__FV_ONBOARD = true (and ?onboard=0 switches it off everywhere).

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { Input } from '../core/Input.js';
import { gdist } from '../core/Iso.js';
import { BALANCE } from '../data/balance.js';
import { WORLD } from '../data/world.js';
import { t } from '../data/strings.js';
import { DEPTH } from './DepthSort.js';

export const ONB = { NEW: 1, ACT1: 2, ACT2: 4, SKIP: 8, T1: 16, T2: 32, T3: 64, T4: 128, T5: 256, T6: 512 };
const KN = () => BALANCE.onboard || {};
const kn = (k, d) => { const v = Number(KN()[k]); return Number.isFinite(v) ? v : d; };

/** is the first-run tutorial allowed here? (?onboard=0/1, window.__FV_ONBOARD, never for automated browsers) */
export function onboardAllowed() {
  try {
    const w = typeof window !== 'undefined' ? window : null;
    if (w && w.__FV_ONBOARD === true) return true;
    if (w && w.__FV_ONBOARD === false) return false;
    const q = w && w.location ? /[?&]onboard=([01])/.exec(w.location.search || '') : null;
    if (q) return q[1] === '1';
    if (typeof navigator !== 'undefined' && navigator.webdriver) return false;
  } catch (e) { return false; }
  return true;
}

// the first loop's places ((v4.3) the fish come from the fishing deck: its reel spot is where the chief stands — the old
//  net's gather point was the same idea; `net` stays as another name for it. ((v4.3 「바다 가까이」) the spot is his landing
//  at the water's edge, right of the gangway's head by the deck's front corner)
const AT = {
  reel: (gs) => (gs.deck || gs.net) && (gs.deck || gs.net).gather,
  net: (gs) => (gs.deck || gs.net) && (gs.deck || gs.net).gather,
  op: (gs) => gs.stations.grill && gs.stations.grill.op,
  out: (gs) => gs.stations.grill && gs.stations.grill.outPad,
  inp: (gs) => gs.stations.grill && gs.stations.grill.inPad,
  shelf: (gs) => gs.market.shelf,
  reg: (gs) => gs.market.register,
  cash: (gs) => gs.market.cash.pad,
  pad: (gs) => { const q = gs.progress.pads.hire_clerk_market; return q && q.active && !q.done ? q : null; },
};
// Act 1 steps. at: the place (ring + arrow), h: the arrow's height over it, l: the card's key (l + '_1' / '_2'),
// walk: a "go there" step (the finger shows the drag when the chief stands idle), stand: a "stay here" step (soft
// spotlight on the place and the chief, no arrow), view: WORLD.onboard.views key (the camera frames it), beat: the
// success line when the step is done (first lap)
const STEP = {
  hi: { l: 'onb_hi' },
  // ((v4.3 sea review ARROW-AIM) the chief's spot lies on his landing just under the deck's front corner: a low arrow, its
  //  tip on the landing's pad (h 30 put the tip on the deck's corner posts)
  move: { at: 'reel', h: 4, l: 'onb_move', walk: true },
  still: { at: 'reel', h: 4, l: 'onb_still', stand: true, beat: 'onb_fishok' },
  toop: { at: 'op', h: 50, l: 'onb_toop', walk: true },
  cook: { at: 'op', l: 'onb_cook', stand: true, beat: 'onb_nice' },
  cookaway: { at: 'op', h: 50, l: 'onb_cookaway', walk: true },
  take: { at: 'out', h: 80, l: 'onb_take', walk: true, beat: 'onb_nice' },
  shelf: { at: 'shelf', h: 60, l: 'onb_shelf', walk: true, beat: 'onb_nice' },
  coming: { l: 'onb_coming', one: true, top: true },
  reg: { at: 'reg', h: 46, l: 'onb_reg', walk: true, view: 'register' },
  regwait: { at: 'reg', l: 'onb_regwait', stand: true, view: 'register', beat: 'onb_nice' },
  cash: { at: 'cash', h: 40, l: 'onb_cash', walk: true, view: 'register', beat: 'onb_cashok' },
  short: { l: 'onb_short', view: 'register' },
  pad: { at: 'pad', h: 112, l: 'onb_pad', walk: true, view: 'pad' },
  onpad: { at: 'pad', l: 'onb_onpad', stand: true, view: 'pad' },
  stepoff: { at: 'pad', l: 'onb_stepoff', view: 'pad' },
  helpers: { l: 'onb_helpers' },
};
const ORDER = ['hi', 'move', 'still', 'toop', 'cook', 'cookaway', 'take', 'shelf', 'coming', 'reg', 'regwait', 'cash', 'short', 'pad', 'onpad', 'stepoff', 'helpers'];
const IDX = Object.fromEntries(ORDER.map((k, i) => [k, i]));
// the replay tour (after the tutorial): the places of the first loop in order, each with its card
const TOUR = [
  { at: 'reel', l1: 'onb_tour_net', l2: 'onb_still_1' },
  { at: 'op', l1: 'onb_toop_1', l2: 'onb_toop_2' },
  { at: 'out', l1: 'onb_tour_take', l2: 'onb_take_2' },
  { at: 'shelf', l1: 'onb_shelf_1', l2: 'onb_shelf_2' },
  { at: 'reg', l1: 'onb_reg_1', l2: 'onb_reg_2' },
  { at: 'cash', l1: 'onb_cash_1', l2: 'onb_cash_2' },
  { at: 'tourPad', l1: 'onb_tour_pad', l2: 'onb_onpad_2' },
];
// Act 3: the HUD tips (btn = OnboardOverlay.btnPos name)
const TIPS = [
  { id: 'T1', bit: ONB.T1, l: 'tip_whistle', btn: 'whistle', g: 'tap', max: 7 },
  { id: 'T2', bit: ONB.T2, l: 'tip_nav', btn: 'nav', g: 'tap', max: 7 },
  { id: 'T3', bit: ONB.T3, l: 'tip_zoom', btn: 'zoomOut', g: 'pinch', max: 7 },
  { id: 'T4', bit: ONB.T4, l: 'tip_map', btn: 'map', g: 'tap', max: 7 },
  { id: 'T5', bit: ONB.T5, l: 'tip_set', btn: 'settings', g: 'tap', max: 7 },
  { id: 'T6', bit: ONB.T6, l: 'tip_obs', btn: 'obs', g: 'tap', max: 8 },
];

export class Onboarding {
  /**
   * bits: the save's `onb` (or undefined); isNew: a brand-new village (no save, not a quarantine restart)
   */
  constructor(gs, bits, isNew) {
    this.gs = gs;
    this.bits = Number.isFinite(bits) ? Math.max(0, Math.floor(bits)) & 1023 : 0;
    this.allowed = onboardAllowed();
    if (isNew && this.allowed) this.bits = ONB.NEW;
    this.isNew = !!isNew;
    this.mode = 'off';           // 'off' | 'act1' | 'act2' | 'act3' | 'tour'
    this.started = false;
    this.t = 0;                  // game seconds since this village loaded (this session)
    this.n = 0;                  // change counter (the overlay re-lays out a card / restarts a gesture on change)
    this.card = null;            // { id, l1, l2, check, top, mini, next, key }
    this.hand = null;            // { id, g: 'drag'|'lift'|'stepoff', to: world point, loop, until }
    this.spot = null;            // { pts: [objects with x, y] } or { ui: 'coins' }
    this.ringAt = null;          // world point under the pulse ring
    this.target = null;          // Act 1: { x, y, h } the yellow arrow's place (Tutorial draws it)
    this.view = null;            // Act 1: [x, y] the camera's framing (Game.update)
    this.tip = null;             // Act 3 / tour: { id, l1, l2, btn, g, t, max, phase }
    this.showSkip = false;
    this.ring = null;            // the flat pulse ring under a target (Game scene)
    this._tg = { x: 0, y: 0, h: 0 };
    this.held = [];              // banners held back during Act 1 (UI.banner)
  }

  // ------------------------------------------------------------------ public
  get active() { return this.mode !== 'off'; }
  /** Act 1 (and a live replay of it): the onboarding draws the arrow, the objective panel stays hidden */
  owns() { return this.mode === 'act1'; }
  /** Act 1: banners that are not a hire / unlock wait (UI.banner) */
  get holdsBanners() { return this.mode === 'act1'; }
  /** the replay tour: 관망 is stopped and cannot start */
  get blocksPilot() { return this.mode === 'tour'; }
  /** this village gets the onboarding's button tips (and not the old whistle toast) */
  get hasTips() { return !!(this.bits & ONB.NEW) && !(this.bits & ONB.SKIP); }
  /** the save's `onb` (only for villages that began with the onboarding) */
  serialize() { return this.bits > 0 ? this.bits : undefined; }

  /** 「건너뛰기」: everything ends at once (no tips follow); the existing Tutorial takes over in the same frame */
  skip() {
    const gs = this.gs;
    if (this.mode === 'tour') { this.endTour(); return; }
    if (this.mode === 'off') return;
    this.bits |= ONB.SKIP | ONB.ACT1 | ONB.ACT2;
    if (!(this.bits & ONB.NEW)) this.bits = 0;          // (a live replay of an old village writes nothing)
    this.clearAll();
    this.mode = 'off';
    this.liveReplay = false;
    this.releaseBanners();
    if (gs.ui) gs.ui.toast(t('onb_skipped'));
  }

  /** 설정 › 놀이 › 「다시 보기」: a live Act 1 before the first clerk, else the tour of the first loop */
  replay() {
    const gs = this.gs, P = gs.v42 && gs.v42.pilot;
    if (this.mode === 'tour' || this.mode === 'act1') return false;
    this.clearAll();
    if (P && P.on) { try { P.stop('onboard'); } catch (e) { /* */ } }
    this.replayFrom = this.mode;
    if (!gs.progress.isDone('hire_clerk_market')) { this.startAct1(false); this.liveReplay = true; return true; }
    this.mode = 'tour';
    this.tourI = -1; this.tourT = 0; this.tourHold = false;
    this.tourNext();
    return true;
  }

  /** 「다음 ›」 (the tour) */
  next() { if (this.mode === 'tour') this.tourNext(); }

  // ------------------------------------------------------------------ frame (Game.update)
  update(dt) {
    this.t += dt;
    if (!this.started) this.start();
    if (this.mode === 'act1') this.updateAct1(dt);
    else if (this.mode === 'act2') this.updateAct2(dt);
    else if (this.mode === 'tour') this.updateTour(dt);
    this.updateRing(dt);
    if (this.hand && this.hand.until && this.t >= this.hand.until) this.hand = null;
    // (banners held during Act 1 that could not be handed over yet — the UI scene was not ready — go as soon as it is)
    if (this.held.length && !this.holdsBanners) this.releaseBanners();
  }

  start() {
    this.started = true;
    const prog = this.gs.progress;
    if (!(this.bits & ONB.NEW) || !this.allowed) return;
    if (!(this.bits & ONB.ACT1)) {
      // (a reload in the middle: S0 / S1 are over — he has walked already; the step is worked out from the world)
      if (prog.isDone('hire_clerk_market')) { this.bits |= ONB.ACT1; this.startAct2(); return; }
      this.startAct1(this.isNew);
      return;
    }
    if (!(this.bits & ONB.ACT2)) {
      if (prog.isDone('hire_fisherman')) { this.bits |= ONB.ACT2; this.startAct3(); return; }
      this.startAct2();
      return;
    }
    this.startAct3();
  }

  clearAll() {
    this.card = null; this.hand = null; this.spot = null; this.ringAt = null; this.target = null; this.view = null;
    this.tip = null; this.showSkip = false; this.beat = null;
    const gs = this.gs;
    if (gs.camFocus && this.camHeld) gs.camFocus = null;
    this.camHeld = false;
  }

  // ------------------------------------------------------------------ helpers
  /** the steps shown, in order (the test hook's history) */
  note(step) { const h = this.hist || (this.hist = []); if (h[h.length - 1] !== step) { h.push(step); if (h.length > 60) h.shift(); } }
  idle() { return (this.gs.time.now - Math.max(Input.lastActivity || 0, Input.lastTouch || 0, this.stepAt || 0)) / 1000; }
  touched(since) { return Input.joy.active || Input.vec.mag > 0.05 || (Input.lastTouch || 0) > since; }
  ui() { const s = this.gs.scene.get('UI'); return s && s.ready ? s : null; }
  bannerUp() { const u = this.ui(); return !!(u && u.bannerBox && u.bannerBox.visible); }
  panelUp() { const u = this.ui(); return !!(u && (u.panelOpen || u.buildOpen || u.v4PanelOpen || u.v42PanelOpen)); }
  /** the card / tip in the current language again (설정 › 언어: Act 2 / tour cards and tips are set once, by string key) */
  relang() {
    const c = this.card, tp = this.tip;
    if (c && c.tk) { c.l1 = t(c.tk[0]); c.l2 = c.tk[1] ? t(c.tk[1]) : null; }
    if (tp && tp.tk) { tp.l1 = t(tp.tk[0]); tp.l2 = tp.tk[1] ? t(tp.tk[1]) : null; tp.n = ++this.n; }
  }
  setCard(key, l1, l2, opts) {
    const c = this.card;
    if (c && c.key === key) { c.l1 = l1; c.l2 = l2 || null; if (opts) Object.assign(c, opts); return c; }
    this.card = Object.assign({ id: ++this.n, key, l1, l2: l2 || null, check: false, top: false, mini: false, next: false }, opts || {});
    return this.card;
  }
  dragTo(pt, loop, ms) {
    if (!pt) return;
    this.hand = { id: ++this.n, g: 'drag', to: { x: pt.x, y: pt.y }, loop: !!loop, until: loop ? 0 : this.t + (ms || 2.4) };
  }
  soft() { try { Audio.play('sfx_pickup', { volume: 0.4, rate: 1.25, throttle: 200 }); } catch (e) { /* */ } }

  // ------------------------------------------------------------------ Act 1
  startAct1(fresh) {
    this.mode = 'act1';
    this.a1T = 0;
    this.cur = null;
    this.moved = !fresh;              // a resumed game: S0 / S1 are over
    this.moveT = 0;
    this.hiDone = !fresh;
    this.lap = 1;
    this.shownT = 99;
    this.sameT = 0;
    this.collapsed = false;
    this.beat = null;
    this.cycleAt = -99;
    this.helpersT = -1;
    this.shortT = 0;
    this.touch0 = Input.lastTouch || 0;
    this.showSkip = true;
    this.stepAt = this.gs.time.now;
    this.movedAt = undefined;
    this.pushStuck = 0; this.stuckAt = -99;
    // (a reload in the middle / a replay: the line and the shelf take a moment to settle after the village loads — the
    //  first step is worked out after it, never "walk to the net" for 2 s while he stands at the register)
    this.settle = fresh ? 0 : kn('resumeSettle', 1.5);
  }

  /** the step the world asks for now (Tutorial.firstLoop's branches, plus "standing on it" variants) */
  derive() {
    const gs = this.gs, p = gs.player, prog = gs.progress, eco = gs.economy, m = gs.market, grill = gs.stations.grill;
    const op = grill.op, net = gs.deck || gs.net, g = net.gather;
    const raw = p.stack.countOf('item_fish_raw'), cooked = p.stack.countOf('item_fish_cooked');
    const k = Math.min(4, p.capacity);
    if (prog.isDone('hire_clerk_market')) return 'helpers';
    const hp = prog.pads.hire_clerk_market;
    if (hp && hp.active && !hp.done && hp.remaining > 0) {
      const on = hp.pad.contains(p.x, p.y);
      if (on && hp.needsLeave && hp.remaining <= eco.coins) return 'stepoff';
      if (on && !hp.needsLeave && eco.coins > 0) return 'onpad';
      if (hp.remaining <= eco.coins) return 'pad';
    }
    const front = m.queue[0];
    const paysSoon = !!(front && front.arrived && front.got > 0 && front.need > 0 && m.stock.count >= front.need);
    const onReg = m.register.pad.contains(p.x, p.y);
    // (playtest #1) the coins on the cash pad already pay for the clerk: he goes for them (and the clerk takes the
    //  payments after) — the step no longer swings between the coins and the register while the line pays
    const hq = prog.pads.hire_clerk_market;
    const enough = !!(hq && hq.active && !hq.done && m.cash.value > 0 && eco.coins + m.cash.value >= hq.remaining);
    if (!m.register.clerk && cooked === 0 && !enough && (m.waitingPay || paysSoon)) return onReg ? 'regwait' : 'reg';
    // (playtest #1) he stands at the register and the next customer in line can still be served from the shelf (or the
    //  fish are flying to them): 「모두 낼 때까지 서 있어요」 holds — before, the step went to the coins after the first
    //  payment and back to the register when the next one paid, which read as 「코인이 조금 모자라요」
    if (!m.register.clerk && cooked === 0 && !enough && onReg && (this.cur === 'reg' || this.cur === 'regwait') && front
      && ((front.flying && front.flying.length > 0) || (front.need > 0 && m.stock.count >= front.need) || (front.got > 0 && front.need <= 0))) return 'regwait';
    const next = prog.nextPad();
    if (m.cash.value > 0 && cooked === 0 && (eco.coins + m.cash.value >= (next ? next.remaining : 0) || (raw === 0 && grill.outStack.count === 0))) return 'cash';
    if (cooked > 0) return grill.outPad.contains(p.x, p.y) && grill.outStack.count > 0 && p.room > 0 ? 'take' : 'shelf';
    if (op && !op.operator) {
      const onOp = op.pad.contains(p.x, p.y);
      const far = gdist(p.x, p.y, g.x, g.y) > 120;
      if (raw > 0 && (p.room <= 0 || !net.ready() || raw >= k || far)) return onOp ? 'cook' : 'toop';
      if (grill.inStack.count > 0 && raw === 0) {
        if (onOp) return 'cook';
        if (grill.outStack.count < 6 || p.room <= 0) return this.cur === 'cook' || this.cur === 'cookaway' ? 'cookaway' : 'toop';
      }
    }
    if ((grill.outStack.count > 0 || grill.inStack.count > 0) && raw === 0) return 'take';
    // the shelf is stocked and the front customer is being served (the fish fly over): "a customer is on the way"
    if (cooked === 0 && raw === 0 && front && !m.register.clerk && (this.cur === 'shelf' || !this.cur || (this.cur === 'coming' && this.sameT < 8))
      && ((front.flying && front.flying.length > 0) || (m.stock.count > 0 && front.need > 0 && m.stock.count >= front.need) || (!front.arrived && m.stock.count > 0))) return 'coming';
    if (!this.moved) return 'move';
    if (raw > 0 || gdist(p.x, p.y, g.x, g.y) < 55) return 'still';
    return 'move';
  }

  updateAct1(dt) {
    const gs = this.gs, p = gs.player;
    this.a1T += dt;
    this.shownT += dt;
    this.sameT += dt;
    if (this.a1T > kn('act1Max', 360)) { this.endAct1(); return; }
    // the first movement (S1): the joystick (or the keys, or a test's steering) moved him for 0.2 s
    if (!this.moved) { if (Input.vec.mag > 0.05) { this.moveT += dt; if (this.moveT >= 0.2) { this.moved = true; this.movedAt = this.t; this.stepAt = gs.time.now; } } }
    // (a resumed / replayed Act 1: nothing for a moment while the village settles)
    if (this.a1T < (this.settle || 0)) return;
    // S0: 0.6 s after the village appears, 2 s (or the first touch / key). (playtest: nothing marked which one is the chief —
    //  the pulse ring goes round his feet and a soft spotlight on him while the welcome shows)
    if (!this.hiDone) {
      if (this.a1T < 0.6) return;
      if (!this.card) { this.setCard('hi', t('onb_hi_1'), t('onb_hi_2'), { tk: ['onb_hi_1', 'onb_hi_2'] }); this.cur = 'hi'; this.shownT = 0; this.touch0 = Input.lastTouch || 0; this.note('hi'); }
      if (this.shownT >= 2 || (this.shownT > 0.2 && this.touched(this.touch0)) || this.moved) { this.hiDone = true; this.shownT = 99; this.ringAt = null; this.spot = null; }
      else { this.ringAt = { x: p.x, y: p.y, w: 110 }; this.spot = { pts: [p] }; return; }
    }
    // S10 (the clerk was hired): wait for the banner, then "helpers work for you"
    if (this.helpersT >= 0) { this.updateHelpers(dt); return; }
    // the success beat (✓ 잘했어요!)
    if (this.beat) { this.beat.t -= dt; if (this.beat.t <= 0) this.beat = null; }
    this.evalT = (this.evalT || 0) - dt;
    if (this.evalT <= 0) {
      this.evalT = 0.2;
      let want = this.derive();
      if (want === 'helpers') { this.helpersT = 0; this.cur = 'helpers'; this.note('helpers'); this.card = null; this.target = null; this.ringAt = null; this.hand = null; this.spot = null; return; }
      // after the coins: not enough for the clerk yet -> "sell some more fish", then another (lighter) lap. Only when the
      // loop goes back to the fish (not to the register: more customers paying) and when the coins in hand AND still on
      // the cash pad do not reach the clerk's price (playtest #1: 「코인이 조금 모자라요」 while 12 coins lay on the pad)
      if (this.cur === 'cash' && IDX[want] <= IDX.coming && this.shownT >= kn('dwell', 1.5)) {
        const hp = AT.pad(gs);
        if (hp && hp.remaining > gs.economy.coins + gs.market.cash.value) { want = 'short'; this.shortT = 2.5; }
      }
      if (this.cur === 'short') { this.shortT -= 0.2; if (this.shortT > 0) want = 'short'; }
      // a step back (the world went back: he walked away, the line paused between two customers) must hold 1.2 s:
      // the short gaps between a payment and its coins landing never flash "go to the net"
      const back = this.cur && IDX[want] < IDX[this.cur] && this.cur !== 'short' && this.cur !== 'hi';
      if (back) { this.backT = this.backWant === want ? (this.backT || 0) + 0.2 : 0; this.backWant = want; } else { this.backT = 0; this.backWant = null; }
      // ((playtest) 「손님이 오고 있어요」 came after a ✓ and was up 0.7 s: it stays long enough to read)
      const dwell = this.cur === 'coming' ? kn('dwellComing', 2.8) : kn('dwell', 1.5);
      if (want !== this.cur && (this.shownT >= dwell || this.cur === 'hi' || !this.cur) && (!back || this.backT >= 1.2)) this.enter(want);
    }
    this.act1Frame(dt);
  }

  /** a new Act 1 step is shown */
  enter(step) {
    const prev = this.cur, gs = this.gs;
    const back = prev && IDX[step] < IDX[prev];
    // a lap ends when the coins did not reach the clerk's price: the loop starts again, lighter
    if (back && (prev === 'cash' || prev === 'short') && IDX[step] <= IDX.take) this.lap++;
    // first lap: ✓ + 잘했어요 for the step just done, a thumbs-up over the chief, one soft sound
    const S = prev && STEP[prev];
    if (S && S.beat && !back && step !== 'short' && this.lap === 1 && !(prev === 'regwait' && step === 'reg')) {
      this.beat = { text: t(S.beat), t: kn('beat', 0.7) };
      try { if (gs.life && gs.life.bubbles) gs.life.bubbles.emote(gs.player, Assets.pick('emote_thumbs', 'emote_heart'), 1.0); } catch (e) { /* */ }
      this.soft();
    }
    this.cur = step;
    this.note(step);
    this.shownT = 0;
    this.sameT = 0;
    this.collapsed = false;
    this.stepAt = gs.time.now;
    this.cycleAt = -99;
    this.hand = null;
    if (step === 'still' && this.lap === 1) this.hand = { id: ++this.n, g: 'lift', until: this.t + 1.3 };
    this.spotT = 0;
  }

  get light() { return this.lap > 1; }
  /** ((v4.3 review SUITES-2) the first lap's fish batch: the card asks for min(4, bag) fish, the chief takes no more
   *  (the deck's quick first reel brought the 4th fish a moment sooner than the net did, and a 5th while the card still
   *  showed: one more fish to grill = the first sale ~0.8 s later). Infinity outside the first lap of Act 1 */
  fishCap() { return this.mode === 'act1' && this.lap === 1 && this.gs.player ? Math.min(4, this.gs.player.capacity) : Infinity; }

  /** ((v4.3 verify LOOK-2) the chief stands at his fishing spot with his line out (fishing, or holding it for a bite) */
  atReel(p) { const D = this.gs.deck; return !!(D && p && D.chiefHere && D.chiefHere(p) && (p.node === D || (D.holdsChief && D.holdsChief(p)))); }

  /** the card, ring, arrow, view, spotlight and finger of the current step, every frame */
  act1Frame(dt) {
    const gs = this.gs, p = gs.player, step = this.cur;
    const S = STEP[step];
    if (!S) return;
    this.spotT = (this.spotT || 0) + dt;
    const place = S.at ? AT[S.at](gs) : null;
    // the view (S7–S9 frame the register / the hire pad)
    const V = (WORLD.onboard && WORLD.onboard.views) || {};
    this.view = S.view && V[S.view] ? V[S.view] : null;
    // ring + arrow
    // (the reel spot's ring is the reach where the fish come to him, gdist 55 = 110 px wide; a pad's ring frames its art)
    this.ringAt = place ? { x: place.x, y: place.y, w: S.at === 'reel' ? 110 : 150 } : null;
    if (place && step === 'stepoff') { const tg = this._tg; tg.x = place.x; tg.y = place.y + 118; tg.h = 34; this.target = tg; }
    // ((v4.3 verify LOOK-2) S1 while he already stands at his spot and fishes (he got there before the card's 1.5 s): no
    //  arrow — its 1.3x body covered him from feet to head through the cast and the first leaps (Tutorial's obj_fish rule)
    else if (place && !S.stand && !(step === 'move' && this.atReel(p))) { const tg = this._tg; tg.x = place.x; tg.y = step === 'move' || step === 'still' ? place.y - 10 : place.y; tg.h = S.h || 40; this.target = tg; }
    else this.target = null;
    // pushing into a wall: the joystick held, he does not get anywhere for 1.2 s (a pocket behind a crate). The card then
    // says to go round it and the finger (which follows the way round, via()) comes back 0.6 s after he lets go
    if (S.walk) {
      const lp = this._lp || (this._lp = { x: p.x, y: p.y });
      const v = Math.hypot(p.x - lp.x, p.y - lp.y) / Math.max(dt, 1e-3);
      lp.x = p.x; lp.y = p.y;
      const pushing = Input.joy.active || Input.vec.mag > 0.05;
      this.pushStuck = pushing && v < 25 ? this.pushStuck + dt : Math.max(0, this.pushStuck - dt * 2);
      if (this.pushStuck > kn('stuckPush', 1.2)) { if (this.t - this.stuckAt > 6) this.cycleAt = -99; this.stuckAt = this.t; }
    } else this.pushStuck = 0;
    const stuck = this.t - this.stuckAt < 6;
    // the card
    const k = Math.min(4, p.capacity), raw = p.stack.countOf('item_fish_raw');
    let l1 = t(S.l + (S.one ? '' : '_1')), l2 = S.one ? null : t(S.l + '_2');
    // (after the first steps: 「잘했어요!」 only for those 3 s — later, on a second lap or after a reload, plainly where to go)
    if (step === 'move' && this.moved) { const praise = this.lap === 1 && this.movedAt !== undefined && this.t - this.movedAt < kn('praiseSec', 3); l1 = t(praise ? 'onb_moved_1' : 'onb_net_1'); l2 = t('onb_moved_2'); }
    else if (step === 'move' && !hasTouch()) l2 = t('pcHint');
    if (step === 'still') l2 = t('onb_still_2', { n: Math.min(raw, k), k });
    if (step === 'pad') { const hp = AT.pad(gs); l2 = t('onb_pad_2', { n: hp ? hp.remaining : 0 }); }
    // (a lighter lap: the loop's cards say one line; the clerk's pad and the closing stay as they are)
    if (this.light && IDX[step] <= IDX.short) l2 = null;
    if (stuck && S.walk) l2 = t('onb_around');
    // ((the watchdog) 45 s without progress while he keeps walking about: the card folds to one line at the top and the
    //  finger stops; 5 s standing still brings it back)
    const idle = this.idle();
    if (!this.collapsed && !stuck && this.sameT > kn('stuckSec', 45) && idle < 1) this.collapsed = true;
    if (this.collapsed && idle >= 5) { this.collapsed = false; this.sameT = 0; }
    const key = 'a1:' + step + (step === 'move' && this.moved ? ':m' : '') + (this.light ? ':l' : '');
    if (this.beat) this.setCard('beat:' + this.cur, this.beat.text, null, { check: true, top: false, mini: false });
    else this.setCard(key, l1, this.collapsed ? null : l2, { check: false, top: !!S.top || this.collapsed, mini: this.collapsed });
    // the soft spotlight (first lap; "stay here" steps: the place and the chief; the shelf: its customer for 2 s;
    // the coins: the coin counter while they fly in)
    this.spot = null;
    if (!this.light && !this.collapsed) {
      const m = gs.market;
      if (step === 'still') this.spot = { pts: [(gs.deck || gs.net).gather, p] };
      else if (step === 'cook') this.spot = { pts: [gs.stations.grill, p] };
      else if (step === 'shelf' && this.spotT < 2 && m.queue[0]) this.spot = { pts: [m.shelf, m.queue[0]] };
      else if (step === 'reg' && m.queue[0]) this.spot = { pts: [m.register, m.queue[0]] };
      else if (step === 'regwait') this.spot = { pts: [m.register, p, m.cash.pad] };
      else if (step === 'cash' && m.cash.pad.contains(p.x, p.y)) this.spot = { ui: 'coins' };
      else if (step === 'onpad' && place) this.spot = { pts: [place, p] };
    }
    // the finger
    if (this.collapsed) { if (this.hand && this.hand.g !== 'lift') this.hand = null; return; }
    if (step === 'move') {
      // S1: the drag demo loops until he first walks (it steps aside while a finger is on the glass); after that it
      // comes back when he stands 4 s
      const show = !this.moved ? !(Input.joy.active || Input.vec.mag > 0.05) : idle >= 4;
      if (show && !(this.hand && this.hand.loop)) this.dragTo(place, true);
      else if (!show && this.hand && this.hand.loop) this.hand = null;
      return;
    }
    if (step === 'stepoff') { if (!this.hand || this.hand.g !== 'stepoff') this.hand = { id: ++this.n, g: 'stepoff', to: place ? { x: place.x, y: place.y } : null, loop: true }; return; }
    if (this.hand && this.hand.g === 'stepoff') this.hand = null;
    if (S.walk && place) {
      const thr = stuck ? 0.6 : this.light ? kn('idleDragLight', 5) : kn('idleDrag', 3);
      if (idle >= thr && this.t - this.cycleAt >= kn('dragRepeat', 12) && !this.bannerUp()) { this.cycleAt = this.t; this.dragTo(place, false, 2.4); }
      if (idle < 0.3 && this.hand && this.hand.g === 'drag') this.hand = null;
    }
  }

  updateHelpers(dt) {
    const gs = this.gs, m = gs.market;
    this.target = null; this.ringAt = null; this.hand = null; this.view = null;
    if (this.helpersT === 0) {
      // (the game's own banner 「점원 합류!」 + 「이제 점원이 손님 돈을 받아요」 plays first)
      this.card = null;
      this.helpersWait = (this.helpersWait || 0) + dt;
      if (this.bannerUp() && this.helpersWait < 8) return;
      if (this.helpersWait < 0.6) return;
      this.helpersT = 0.0001;
      this.touch0 = Input.lastTouch || 0;
      gs.focusCamera(m.register.x, m.register.y - 40, 2200);
      this.setCard('a1:helpers', t('onb_helpers_1'), t('onb_helpers_2'), { tk: ['onb_helpers_1', 'onb_helpers_2'] });
      this.soft();
      return;
    }
    this.helpersT += dt;
    const clerk = m.register.clerk;
    this.spot = this.light || this.helpersT > 3 ? null : { pts: clerk ? [m.register, clerk] : [m.register] };
    if (this.helpersT >= 3.5 || (this.helpersT >= 1.5 && this.touched(this.touch0))) this.endAct1();
  }

  endAct1() {
    if (this.bits & ONB.NEW) this.bits |= ONB.ACT1;
    this.clearAll();
    this.releaseBanners();
    if (this.liveReplay) { this.liveReplay = false; this.mode = this.replayFrom === 'act3' ? 'act3' : 'off'; if (this.gs.progress.isDone('hire_fisherman')) return; }
    if (this.bits & ONB.NEW && !(this.bits & ONB.SKIP)) this.startAct2();
    else this.mode = 'off';
  }

  /** the banners held back during Act 1 play now, 4 s apart (UI.banner) */
  releaseBanners() {
    const u = this.ui();
    if (!u || !u.bannerLater) return;          // (kept until the UI scene can take them: update() tries again)
    for (const b of this.held.splice(0)) u.bannerLater(b.msg, b.sub, 4000);
  }

  // ------------------------------------------------------------------ Act 2
  startAct2() {
    this.mode = 'act2';
    this.note('act2');
    this.showSkip = true;
    this.a2 = { seen: {}, assist: {}, assistAt: -99, cardT: 0, cardKey: null, byeT: -1, byeWait: 0 };
  }

  updateAct2(dt) {
    const gs = this.gs, p = gs.player, prog = gs.progress, tu = gs.tutorial, A = this.a2;
    this.spot = null; this.target = null; this.view = null;
    // the closing card after 「어부 합류!」
    if (prog.isDone('hire_fisherman')) {
      this.hand = null; this.ringAt = null;
      // (L2: the 「건너뛰기」 chip goes with the fisherman — the 길 안내 chip may come up under it in the next seconds)
      this.showSkip = false;
      if (A.byeT < 0) {
        this.card = null;
        A.byeWait += dt;
        if (this.bannerUp() && A.byeWait < 10) { A.byeGone = 0; return; }
        A.byeGone = (A.byeGone || 0) + dt;
        if (A.byeGone < 1.5) return;
        A.byeT = 0; this.touch0 = Input.lastTouch || 0;
        // (playtest #5: it said 「노란 화살표…」 while the goal had no arrow, and covered a lock label down there) — the card
        //  sits right under the goal panel and points at it; the arrow line only when there is an arrow and no panel
        const u = this.ui(), panel = !!(u && u.objPanel && u.objPanel.visible), arrow = !!(tu.arrow && tu.arrow.visible);
        const k2 = panel ? 'onb_bye_2' : arrow ? 'onb_bye_arrow' : null;
        this.setCard('a2:bye', t('onb_bye_1'), k2 ? t(k2) : null, { top: true, full: true, tk: ['onb_bye_1', k2] });
        this.soft();
        return;
      }
      A.byeT += dt;
      if (A.byeT >= 4 || (A.byeT >= 1.5 && this.touched(this.touch0))) {
        this.bits |= ONB.ACT2;
        this.clearAll();
        this.startAct3();
      }
      return;
    }
    // plain words for the two helper pads (one card each, 5 s), S9's "stand still" card once on each, the cook's
    // "drop the fish on the grill pad" once
    A.cardT = Math.max(0, A.cardT - dt);
    // (the objective as it is SHOWN — debounced in Tutorial.shown — so the card and the panel never disagree)
    const key = (tu._sh && tu._sh.key) || tu.textKey;
    const coins = gs.economy.coins;
    let onPad = null;
    for (const id of ['op_grill', 'hire_fisherman']) { const q = prog.pads[id]; if (q && q.active && !q.done && q.pad.contains(p.x, p.y) && coins > 0 && !q.needsLeave) onPad = id; }
    if (onPad && !A.seen['on:' + onPad]) { A.seen['on:' + onPad] = 1; A.cardKey = 'on:' + onPad; A.cardT = 4; this.setCard('a2:on:' + onPad, t('onb_onpad_1'), t('onb_onpad_2'), { tk: ['onb_onpad_1', 'onb_onpad_2'] }); }
    // (L3: the goal panel says 「요리사를 고용해 봐요」 already — the card adds only why)
    else if ((key === 'obj_cook' || key === 'obj_fisher') && !A.seen[key] && !this.bannerUp()) { A.seen[key] = 1; A.cardKey = key; A.cardT = 5; this.setCard('a2:' + key, t(key + '_2'), null, { tk: [key + '_2', null] }); }
    else if (key === 'obj_grill' && prog.isDone('op_grill') && !A.seen.drop && !this.bannerUp()) { A.seen.drop = 1; A.cardKey = 'drop'; A.cardT = 8; this.setCard('a2:drop', t('onb_cookdrop_1'), t('onb_cookdrop_2'), { tk: ['onb_cookdrop_1', 'onb_cookdrop_2'] }); }
    if (A.cardKey === 'drop') {
      const inp = AT.inp(gs);
      this.ringAt = inp ? { x: inp.x, y: inp.y } : null;
      if (p.stack.countOf('item_fish_raw') === 0 && inp && inp.contains(p.x, p.y)) A.cardT = Math.min(A.cardT, 0.6);
    } else this.ringAt = null;
    if (A.cardKey && A.cardKey.startsWith('on:') && !onPad && A.cardT < 3) A.cardT = 0;
    // a card about the cook / fisher pad or the grill pad steps aside as soon as the objective moved on (after 1.5 s)
    if ((A.cardKey === 'obj_cook' || A.cardKey === 'obj_fisher') && key !== A.cardKey && A.cardT < 3.5) A.cardT = 0;
    if (A.cardKey === 'drop' && key !== 'obj_grill' && A.cardT < 6.5) A.cardT = 0;
    if (A.cardT <= 0) { this.card = null; A.cardKey = null; this.ringAt = null; }
    // finger assist: the arrow has a place and he stood 5 s -> one drag toward it (≤ 3 per objective, ≥ 20 s apart).
    // (L4: toward where the arrow is DRAWN — the debounced objective — never a place the arrow does not show yet)
    const tg = tu.shownTarget ? tu.shownTarget() : tu.target;
    const idle = (gs.time.now - Math.max(Input.lastActivity || 0, Input.lastTouch || 0)) / 1000;
    if (this.hand && idle < 0.3) this.hand = null;
    if (tg && idle >= kn('assistIdle', 5) && this.t - A.assistAt >= kn('assistGap', 20) && !this.bannerUp() && !this.panelUp() && !gs.overview) {
      const ak = key || ('@' + Math.round(tg.x) + ',' + Math.round(tg.y));
      if ((A.assist[ak] || 0) < kn('assistMax', 3)) { A.assist[ak] = (A.assist[ak] || 0) + 1; A.assistAt = this.t; this.dragTo(tg, false, 2.4); }
    }
  }

  // ------------------------------------------------------------------ Act 3 (tips; run from the UI scene: the settings
  // panel pauses the village and the settings tip goes on inside it)
  startAct3() {
    this.mode = (this.bits & ONB.NEW) && !(this.bits & ONB.SKIP) && this.allowed ? 'act3' : 'off';
    if (this.mode === 'act3') this.note('act3');
    this.showSkip = false;
    this.a3 = { at: this.t, lastEnd: this.t - kn('tipGap', 45) + 20, lastBanner: -99, edgeT: 0, t2End: -1, zoomBase: null, s5: this.t };
    // (a later session: the settings tip may come after half a minute)
    if (!this.isNew) this.a3.lastEnd = this.t - kn('tipGap', 45) + 30;
  }

  /** a calm moment for a tip: no banner (and none in the last 4 s), no toast, no panel, no map, no 관망, not paying */
  calm(ui, id) {
    const gs = this.gs, A = this.a3;
    if (ui.bannerBox && ui.bannerBox.visible) { A.lastBanner = this.t; return false; }
    if (this.t - A.lastBanner < 4) return false;
    if (ui.toastBox && ui.toastBox.visible) return false;
    if (ui.panelOpen || ui.buildOpen || ui.v4PanelOpen || ui.v42PanelOpen) return false;
    if (gs.overview) return false;
    const P = gs.v42 && gs.v42.pilot;
    if (P && P.on && id !== 'T6') return false;
    if (P && P.countdown > 0) return false;
    // (paying on a pad: one he may pay at now — a pad that waits for him to step off once takes nothing)
    const prog = gs.progress, p = gs.player;
    for (const k in prog.pads) { const q = prog.pads[k]; if (q.active && !q.done && !q.needsLeave && q.remaining > 0 && gs.economy.coins > 0 && q.pad.contains(p.x, p.y)) return false; }
    return true;
  }

  /** UI.tick -> OnboardOverlay.update -> here: the Act 3 tip scheduler and the tour's HUD tips */
  uiUpdate(dt, ui, ov) {
    if (this.mode === 'act3') this.tipsUpdate(dt, ui, ov);
    else if (this.mode === 'tour' && this.tip) this.tourTip(dt, ui, ov);
  }

  tipsUpdate(dt, ui, ov) {
    const gs = this.gs, A = this.a3;
    if (!A) return;
    // a tip is on screen
    const tp = this.tip;
    if (tp) {
      tp.t += dt;
      if (this.tipDone(tp, ui, ov)) this.endTip(tp);
      return;
    }
    // follow-ups: the dog bar the first time it opens after the whistle tip
    if (A.dogFollow && ui.dogBarOn && !A.dogShown) {
      A.dogShown = true;
      this.tip = { id: 'dogbar', l1: t('tip_dogbar_1'), l2: t('tip_dogbar_2'), tk: ['tip_dogbar_1', 'tip_dogbar_2'], btn: 'dogbar', g: null, t: 0, max: 4, n: ++this.n };
      return;
    }
    if (ui.bannerBox && ui.bannerBox.visible) A.lastBanner = this.t;
    // the edge arrow showing (the arrow's place off screen) for 4 s
    A.edgeT = ui.edge && ui.edge.visible ? A.edgeT + dt : 0;
    if (this.t - A.lastEnd < kn('tipGap', 45)) return;
    if (A.zoomBase === null) A.zoomBase = gs.zoomTarget;
    for (const T of TIPS) {
      if (this.bits & T.bit) continue;
      if (!this.tipWants(T, ui, ov)) continue;
      if (!this.calm(ui, T.id)) return;
      this.tip = { id: T.id, l1: t(T.l + '_1'), l2: t(T.l + '_2'), tk: [T.l + '_1', T.l + '_2'], btn: T.btn, g: T.g, t: 0, max: T.max, n: ++this.n, z0: gs.zoomTarget, phase: 0 };
      this.tapped = null;
      return;
    }
  }

  tipWants(T, ui, ov) {
    const gs = this.gs, A = this.a3, prog = gs.progress;
    switch (T.id) {
      case 'T1': return this.t - A.at >= 20 && ov.btnVisible('whistle');
      case 'T2': return ov.btnVisible('nav');
      case 'T3': return A.edgeT >= 4 || (A.t2End >= 0 && this.t - A.t2End >= 90);
      case 'T4': return prog.isDone('zone_forest') && !(ui.bannerBox && ui.bannerBox.visible) && this.t - A.lastBanner >= 3;
      case 'T5': return this.isNew ? this.t >= kn('settingsTipAfter', 480) : this.t - A.s5 >= 30;
      case 'T6': return ov.btnVisible('obs');
      default: return false;
    }
  }

  /** has the player used the thing (or did the tip's time run out)? also runs the follow-ups */
  tipDone(tp, ui, ov) {
    const gs = this.gs;
    const used = this.tapped === tp.btn;
    switch (tp.id) {
      case 'T1': if (gs.progress.seen.whistle || used) { this.a3.dogFollow = true; return true; } break;
      case 'T2': if (used) return true; break;
      case 'T3': if (Math.abs(gs.zoomTarget - tp.z0) > 0.01 || gs.overview) return true; break;
      case 'T4':
        // the map is open: tap it once more to come back (line 2 only), until he does (8 s at most)
        if (gs.overview && tp.phase === 0) { tp.phase = 1; tp.t = 0; tp.max = 8; tp.l1 = t('tip_map_2'); tp.l2 = null; tp.tk = ['tip_map_2', null]; tp.n = ++this.n; return false; }
        if (tp.phase === 1 && !gs.overview) return true;
        break;
      case 'T5':
        // settings opened: point at 마을 옮기기 (4 s), then the 놀이 tab (4 s); any tap in the panel ends it
        if (ui.panelOpen && tp.phase === 0) { tp.phase = 1; tp.t = 0; tp.max = 4; tp.btn = 'move'; tp.l1 = t('tip_move_1'); tp.l2 = t('tip_move_2'); tp.tk = ['tip_move_1', 'tip_move_2']; tp.n = ++this.n; this.tapped = null; this.tapAt = (this.ov && this.ov.ut) || 0; return false; }
        if (tp.phase >= 1) {
          if (!ui.panelOpen || (this.tapAt2 || 0) > (this.tapAt || 0)) return true;
          if (tp.phase === 1 && tp.t >= 4) { tp.phase = 2; tp.t = 0; tp.max = 4; tp.btn = 'playTab'; tp.l1 = t('tip_replay_1'); tp.l2 = t('tip_replay_2'); tp.tk = ['tip_replay_1', 'tip_replay_2']; tp.n = ++this.n; return false; }
        } else if (ui.panelOpen) return true;
        break;
      case 'T6': { const P = gs.v42 && gs.v42.pilot; if ((P && P.on) || used) return true; break; }
      default: break;
    }
    if (tp.id === 'T2' && !ov.btnVisible('nav') && tp.t > 1) return true;
    return tp.t >= tp.max;
  }

  endTip(tp) {
    const T = TIPS.find((q) => q.id === tp.id);
    if (T) this.bits |= T.bit;
    if (tp.id === 'T2') this.a3.t2End = this.t;
    if (T) this.a3.lastEnd = this.t;
    this.tip = null;
  }

  /** a tap the overlay saw on a HUD button (btnPos name) or anywhere in an open panel */
  noteTap(name, ut) { this.tapped = name; if (name === 'panel') this.tapAt2 = ut || 0; }

  // ------------------------------------------------------------------ the replay tour
  tourPlace(at) {
    const gs = this.gs;
    if (at !== 'tourPad') return AT[at](gs);
    // the nearest active unlock / hire pad (else where the clerk's pad was)
    const p = gs.player, prog = gs.progress;
    let best = null, bd = 1e12;
    for (const id in prog.pads) { const q = prog.pads[id]; if (!q.active || q.done) continue; const d = gdist(p.x, p.y, q.x, q.y); if (d < bd) { bd = d; best = q; } }
    if (best) return best;
    const w = WORLD.pads && WORLD.pads.hire_clerk_market;
    return w ? { x: w.x, y: w.y } : gs.market.register;
  }

  tourNext() {
    const gs = this.gs;
    this.tourI++;
    this.tourT = 0;
    this.tourHold = false;
    this.hand = null; this.spot = null; this.ringAt = null; this.tip = null;
    this.touch0 = Input.lastTouch || 0;
    this.moveT = 0;
    // (M3: a drag already under the finger when a step starts is not "the player took over" — only a new one is)
    this.dragFree = !(Input.joy.active || Input.vec.mag > 0.05);
    const i = this.tourI;
    if (i === 0) { this.setCard('tour:0', t('onb_tour'), null, { next: true, tk: ['onb_tour', null] }); return; }
    if (i === 1) { const k2 = hasTouch() ? 'onb_move_2' : 'pcHint'; this.setCard('tour:1', t('onb_move_1'), t(k2), { next: true, tk: ['onb_move_1', k2] }); this.dragTo((gs.deck || gs.net).gather, true); return; }
    const k = i - 2;
    if (k < TOUR.length) {
      const R = TOUR[k], pl = this.tourPlace(R.at);
      if (!pl) { this.tourNext(); return; }
      this.setCard('tour:' + i, t(R.l1), t(R.l2), { next: true, tk: [R.l1, R.l2] });
      this.ringAt = { x: pl.x, y: pl.y, w: R.at === 'reel' ? 110 : 150 };
      gs.focusCamera(pl.x, pl.y - 40, 1e9); this.camHeld = true;
      this.dragTo(pl, false, 2.4);
      return;
    }
    // R9: the buttons on screen now
    if (this.camHeld) { gs.camFocus = null; this.camHeld = false; }
    const hud = this.tourHud || (this.tourHud = this.hudList());
    const j = k - TOUR.length;
    if (j < hud.length) {
      const T = hud[j];
      this.card = null;
      this.tip = { id: 'tour:' + T.id, l1: t(T.l + '_1'), l2: t(T.l + '_2'), tk: [T.l + '_1', T.l + '_2'], btn: T.btn, g: T.g, t: 0, max: 3.5, n: ++this.n, tour: true };
      return;
    }
    this.endTour();
  }

  hudList() {
    const ov = this.ov;
    const out = [];
    const has = (b) => !ov || ov.btnVisible(b);
    if (has('whistle')) out.push(TIPS[0]);
    if (has('nav')) out.push(TIPS[1]);
    out.push(TIPS[2], TIPS[3], TIPS[4]);
    const P = this.gs.v42 && this.gs.v42.pilot;
    if (P && this.gs.v42.complete && !(this.gs.tutorial && this.gs.tutorial.inTutorial)) out.push(TIPS[5]);
    return out;
  }

  updateTour(dt) {
    const gs = this.gs;
    this.tourT += dt;
    // a NEW drag by the player hands the camera back and stops the auto-advance (「다음 ›」 goes on). (M3: R1's own drag
    //  — still under the finger when R2 starts — no longer counts: R1 moves on only when the finger lifts)
    const drag = Input.joy.active || (Input.vec.mag > 0.05 && !Input.override);
    if (!drag) this.dragFree = true;
    if (drag && this.dragFree && this.tourI !== 1) {
      if (this.camHeld) { gs.camFocus = null; this.camHeld = false; }
      this.tourHold = true;
    }
    // (L7: the map button frames the village: the tour lets go of the camera while the map is open)
    if (gs.overview && this.camHeld) { gs.camFocus = null; this.camHeld = false; this.tourHold = true; }
    if (this.tourI === 1) {
      if (Input.vec.mag > 0.05) this.moveT += dt;
      if (this.moveT >= 0.3 && !drag) { this.tourNext(); return; }
      if (this.touched(this.touch0) && this.hand && this.hand.loop) this.hand = null;
    }
    if (this.tip) return;                       // R9 tips run from the UI side (tourTip)
    if (!this.tourHold && this.tourT >= (this.tourI === 0 ? 2.5 : 5)) this.tourNext();
  }

  tourTip(dt, ui, ov) {
    const tp = this.tip;
    tp.t += dt;
    if (tp.t >= tp.max) this.tourNext();
  }

  endTour() {
    const gs = this.gs;
    this.clearAll();
    if (gs.camFocus && this.tourI >= 0) gs.camFocus = null;
    this.tourHud = null;
    this.mode = this.replayFrom === 'act3' && this.hasTips ? 'act3' : 'off';
    if (this.mode === 'act3' && !this.a3) this.startAct3();
  }

  // ------------------------------------------------------------------ the way there (the finger's drag direction)
  /**
   * (playtest #3) where the finger's drag should point to reach `to`: `to` itself when the straight line is free, else the
   * farthest point of a short walk path (a small A* on the collision map round the chief and the place) that he can walk
   * to in a straight line — so from the pocket behind a crate the finger shows the way out, not into the crate.
   * Cached for 0.5 s; null-safe (no collision map: `to`)
   */
  via(to) {
    const gs = this.gs, p = gs.player, C = gs.collision;
    if (!to || !p || !C || typeof C.blocked !== 'function') return to;
    const c = this._via;
    if (c && c.tx === to.x && c.ty === to.y && Math.abs(c.px - p.x) < 8 && Math.abs(c.py - p.y) < 8 && this.t - c.t < 0.5) return c.pt;
    const R = p.radius || 16;
    const free = (x, y) => !C.blocked(x, y, R, null, true);     // ((v4.3 sea) the chief's own landing is ground for him
    // (a straight walk: sampled every 10 iso px, the last 30 px round the place itself never count — a pad by a counter)
    const line = (ax, ay, bx, by) => {
      const L = Math.hypot(bx - ax, (by - ay) * 2), n = Math.ceil(L / 10);
      for (let k = 1; k <= n; k++) { const f = k / n; if (L * (1 - f) < 30) break; if (!free(ax + (bx - ax) * f, ay + (by - ay) * f)) return false; }
      return true;
    };
    let pt = to;
    if (!line(p.x, p.y, to.x, to.y)) {
      const path = this.walkPath(p, to, free);
      if (path && path.length) {
        pt = path[0];
        for (let i = path.length - 1; i >= 0; i--) { if (line(p.x, p.y, path[i].x, path[i].y)) { pt = i === path.length - 1 ? to : path[i]; break; } }
      }
    }
    this._via = { tx: to.x, ty: to.y, px: p.x, py: p.y, t: this.t, pt };
    return pt;
  }

  /** a grid A* (24 x 12 world px cells: square on the iso ground) from the chief to `to`; null when there is none */
  walkPath(p, to, free) {
    const CW = 24, CH = 12;
    const x0 = Math.min(p.x, to.x) - 260, y0 = Math.min(p.y, to.y) - 150;
    const cols = Math.ceil((Math.max(p.x, to.x) + 260 - x0) / CW), rows = Math.ceil((Math.max(p.y, to.y) + 150 - y0) / CH);
    if (cols * rows > 9000) return null;
    const N = cols * rows, g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), st = new Int8Array(N);   // st: 0 ?, 1 free, 2 blocked
    const cx = (i) => x0 + (i % cols) * CW + CW / 2, cy = (i) => y0 + Math.floor(i / cols) * CH + CH / 2;
    const ok = (i) => { if (!st[i]) st[i] = free(cx(i), cy(i)) ? 1 : 2; return st[i] === 1; };
    const idx = (x, y) => Math.max(0, Math.min(rows - 1, Math.floor((y - y0) / CH))) * cols + Math.max(0, Math.min(cols - 1, Math.floor((x - x0) / CW)));
    const s0 = idx(p.x, p.y), goal = idx(to.x, to.y);
    const h = (i) => Math.hypot(cx(i) - to.x, (cy(i) - to.y) * 2);
    // a small binary heap of [f, i]
    const heap = [];
    const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const q = (k - 1) >> 1; if (heap[q][0] <= heap[k][0]) break; [heap[q], heap[k]] = [heap[k], heap[q]]; k = q; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < heap.length && heap[a][0] < heap[m][0]) m = a; if (b < heap.length && heap[b][0] < heap[m][0]) m = b; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
    g[s0] = 0; st[s0] = 1; push(h(s0), s0);
    let end = -1, n = 0;
    while (heap.length && n++ < 6000) {
      const [, i] = pop();
      if (i === goal || h(i) < 30) { end = i; break; }
      const ix = i % cols, iy = Math.floor(i / cols);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const jx = ix + dx, jy = iy + dy;
          if (jx < 0 || jy < 0 || jx >= cols || jy >= rows) continue;
          const j = jy * cols + jx;
          if (!ok(j) && j !== goal) continue;
          if (dx && dy && (!ok(iy * cols + jx) || !ok(jy * cols + ix))) continue;     // (no corner cutting)
          const gj = g[i] + (dx && dy ? 1.414 : 1) * CW;
          if (gj < g[j]) { g[j] = gj; from[j] = i; push(gj + h(j), j); }
        }
      }
    }
    if (end < 0) return null;
    const out = [];
    for (let i = end; i >= 0 && i !== s0; i = from[i]) out.push({ x: cx(i), y: cy(i) });
    return out.reverse();
  }

  // ------------------------------------------------------------------ the world ring
  updateRing(dt) {
    const gs = this.gs, at = this.mode === 'off' ? null : this.ringAt;
    if (!at) { if (this.ring && this.ring.visible) this.ring.setVisible(false); return; }
    if (!this.ring) {
      const key = Assets.has('ui_tap_ripple') ? 'ui_tap_ripple' : 'ui_ring_fill';
      this.ring = Assets.image(gs, 0, 0, key).setOrigin(0.5).setDepth(DEPTH.PAD + 50).setTint(0xffe27a);
      this.ringBase = 1 / Math.max(1, this.ring.frame.realWidth);
    }
    const k = (at.w || 150) * (1.025 + Math.sin(this.t * (Math.PI * 2 / 0.9)) * 0.125);
    this.ring.setVisible(true).setPosition(at.x, at.y).setScale(this.ringBase * k, this.ringBase * k * 0.5).setAlpha(0.85);
  }

  /** the test hook's view (window.__FV.onboard()) */
  state() {
    const c = this.card, h = this.hand, tp = this.tip;
    return {
      mode: this.mode, act: { act1: 1, act2: 2, act3: 3, tour: 'tour' }[this.mode] || 0, step: this.mode === 'act1' ? this.cur : this.mode === 'tour' ? 'R' + this.tourI : null,
      bits: this.bits, lap: this.lap || 0, moved: !!this.moved, collapsed: !!this.collapsed, skipVisible: !!this.showSkip,
      card: c ? { key: c.key, l1: c.l1, l2: c.l2, check: !!c.check, top: !!c.top, mini: !!c.mini, next: !!c.next } : null,
      hand: h ? { g: h.g, loop: !!h.loop } : null,
      target: this.target ? { x: Math.round(this.target.x), y: Math.round(this.target.y), h: this.target.h } : null,
      ring: this.ringAt ? { x: Math.round(this.ringAt.x), y: Math.round(this.ringAt.y) } : null,
      view: this.view, spot: this.spot ? (this.spot.ui ? 'ui:' + this.spot.ui : this.spot.pts.length) : null,
      tip: tp ? { id: tp.id, btn: tp.btn, l1: tp.l1, l2: tp.l2, phase: tp.phase || 0 } : null,
      held: this.held.length, hist: (this.hist || []).slice(),
    };
  }

  destroy() { if (this.ring) { this.ring.destroy(); this.ring = null; } }
}

/** a touch screen (the S1 card says "drag"; without one it names the keys, like the title's pcHint) */
export function hasTouch() {
  try { return (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) || (typeof window !== 'undefined' && 'ontouchstart' in window); } catch (e) { return true; }
}
