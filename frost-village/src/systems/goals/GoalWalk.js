// (v4.3) 자동 이동 — gs.v42.goalwalk: a goal tapped in the 목표 창 (the designer: "미션을 체크하면 그 미션장소로 자동
// 이동하게"). The chief walks there by himself — never a teleport — and the player has him back the moment they touch the
// controls.
//   route    Roads.route legs like the 관망 pilot (ChiefPilot.planTo: his landing through its door, both ways), then the
//            player's own movement and collision (Player.update reads Input.vec). Stuck: Roads.detour after 2.5 s (twice),
//            a side-step, given up after 7 s without progress ('길이 막혔어요', the 길 안내 line stays)
//   input    the vector goes through Input.pilot (the 관망 pilot's slot, wrapped here: ours while walking, else the
//            pilot's), so a human always wins there: a joystick drag / the keys (their vector replaces ours that frame),
//            a finger held on the village ≥ 0.12 s or a test's setInput cancel the walk at once (toast)
//   arrival  within ARRIVE px of the exact spot (the pad's centre / the plot's drop pad): the walk ends there and the
//            controls are the player's — while walking no pad / plot / trash pad takes anything (ChiefPilot.blocksPay
//            is wrapped: a pad on the way never drains coins), on arrival standing on a pay pad works as if he walked
//   관망     on: switched off first (one toast says so); the walk stops if 관망 starts meanwhile
//   guide    the 길 안내 is pinned on the place (quiet: the walk says 'arrived'): its line is this walk's route; a
//            cancelled / blocked walk leaves the pin, so the line still shows the way. A notice-board pin it replaced
//            comes back when the walk's pin ends (Navigator.unpin). While walking somewhere else than the yellow
//            arrow's place, the arrow and its edge arrow step aside (one guide on screen, not two pointing two ways)
//   pauses   (v4.3 review) while the 읍 ceremony runs or a panel / the build menu is open he stands still (no stuck
//            clock); a target finished or taken away meanwhile ends the walk with a line saying so
// Not saved (a reload stands him where he was).

import { Input } from '../../core/Input.js';
import { gdist } from '../../core/Iso.js';
import { BALANCE } from '../../data/balance.js';
import { GoalBook } from './GoalBook.js';
import { gt } from './strings.js';

const ARRIVE = 8;          // ground px from the exact spot
const HOLD_S = 0.12;       // a finger held on the village this long takes control back
const DETOUR_S = 2.5;      // s without progress -> another way (Roads.detour)
const SIDE_S = 1.6;        // s without progress -> a side-step
const DROP_S = 7;          // s without progress -> given up

export class GoalWalk {
  constructor(gs, v42) {
    this.gs = gs;
    this.v42 = v42;
    this.book = new GoalBook(gs);
    this.on = false;
    this.target = null;       // { x, y, name, icon, id, ref }
    this.route = [];
    this.ri = 0;
    this.planN = 0;           // +1 per plan (the 길 안내 follows)
    this.vec = { x: 0, y: 0 };
    this.tick = 0;
    this.servedTick = -1;
    this.holdT = 0;
    this.stuckT = 0;
    this.sideT = 0;
    this.detours = 0;
    this.last = null;         // how the last walk ended: 'arrived' | 'human' | 'stuck' | 'pilot' | 'gone'
    this.stats = { started: 0, arrived: 0, cancelled: 0, stuck: 0 };
    // the vector: ours while walking, else whatever drove before (the 관망 pilot)
    this.base = Input.pilot;
    this.wrap = () => { if (this.on) { this.servedTick = this.tick; return this.vec; } return this.base ? this.base() : null; };
    Input.pilot = this.wrap;
    // nothing is paid on the way (the pads ask the pilot)
    const P = v42 && v42.pilot;
    if (P && typeof P.blocksPay === 'function') {
      const bp = P.blocksPay;
      P.blocksPay = (kind, pad) => (this.on ? true : bp.call(P, kind, pad));
    }
    // (review L9) the yellow arrow steps aside while he walks somewhere else (wrapped once the tutorial is there)
    this.tutWrapped = false;
    this.wrapTutorial();
  }

  /** the tutorial's update, then: walking elsewhere than its arrow's place -> its arrow and edge arrow hidden */
  wrapTutorial() {
    const T = this.gs.tutorial;
    if (this.tutWrapped || !T || typeof T.update !== 'function') return;
    this.tutWrapped = true;
    const tu = T.update;
    T.update = (dt) => {
      tu.call(T, dt);
      if (!this.on || !this.target || !T.arrow || !T.arrow.visible) return;
      const tg = T.shownTarget ? T.shownTarget() : T.target;
      if (tg && Math.abs(tg.x - this.target.x) < 40 && Math.abs(tg.y - this.target.y) < 60) return;
      T.arrow.setVisible(false);
      const ui = this.gs.ui;
      if (ui) ui.objTarget = null;
    };
  }

  /** a panel, the build menu or the 읍 ceremony holds the village: he waits where he is */
  held() {
    const gs = this.gs, ui = gs.ui, rk = gs.v4 && gs.v4.rank;
    if (rk && rk.ceremonyOn) return true;
    return !!(ui && (ui.panelOpen || ui.adminOpen || ui.buildOpen || ui.v4PanelOpen || ui.v42PanelOpen));
  }

  /** may a walk start now? (not during the first-run tutorial: it owns the chief's first two minutes) */
  get available() {
    const gs = this.gs, ob = gs.onboard;
    if (!gs.player || (gs.tutorial && gs.tutorial.inTutorial)) return false;
    if (ob && (ob.mode === 'act1' || ob.mode === 'act2' || ob.mode === 'tour')) return false;
    return true;
  }

  /** the route still to walk (the 길 안내 draws it) */
  routeLeft() { return this.route.slice(this.ri); }

  /**
   * walk to a goal row of the GoalBook (or { place: { x, y }, name, icon }). Returns { ok, why } — why: 'tutorial' |
   * 'locked' | 'passive' | 'noplot' | 'wait' | 'noway' | 'here' | 'busy'; a toast says it either way
   */
  go(row, cur) {
    const gs = this.gs, p = gs.player, ui = gs.ui;
    const say = (k, o) => { if (ui && ui.toast) ui.toast(gt(k, o), 2600); };
    if (!this.available) { say('g_tutorial'); return { ok: false, why: 'tutorial' }; }
    const pl = row && row.place;
    if (!pl) {
      // ((review M1) 'no free plot' first: the 창고 waits for a plot (state 'wait') — it does not come by itself)
      const why = row && row.why ? row.why : row && row.state === 'next' ? 'locked' : 'wait';
      if (why === 'noplot') { say('g_noPlot'); return { ok: false, why }; }
      if (why === 'passive' || (row && row.state === 'wait')) say('g_passive');
      else if (why === 'locked' || (row && row.state === 'next')) say('g_locked', { cur: cur && cur.name ? cur.name : '' });
      else say('g_noWay');
      return { ok: false, why: row && row.state === 'wait' ? 'passive' : why };
    }
    // (a later goal whose place is already there — its pad standing, its plot open — may be walked to as well)
    const C = gs.collision;
    if (!Number.isFinite(pl.x) || !Number.isFinite(pl.y) || (C && C.offLand && C.offLand(pl.x, pl.y, true))) { say('g_noWay'); return { ok: false, why: 'noway' }; }
    if (gs.overview || (gs.v4 && gs.v4.rank && gs.v4.rank.ceremonyOn)) { say('g_busy'); return { ok: false, why: 'busy' }; }
    if (gdist(p.x, p.y, pl.x, pl.y) <= ARRIVE * 2) { say('g_already', { place: row.name }); return { ok: false, why: 'here' }; }
    // 관망 on: off first (one toast says both)
    const P = this.v42 && this.v42.pilot;
    let obs = false;
    if (P && P.on) { try { P.stop('goal'); } catch (e) { /* */ } obs = true; }
    if (P) P.countdown = 0;
    this.target = { x: pl.x, y: pl.y, name: row.name, icon: row.icon, id: row.id, ref: pl.ref || null, pad: pl.pad && pl.pad.contains ? pl.pad : null };
    this.plan();
    this.on = true;
    this.last = null;
    this.holdT = 0; this.stuckT = 0; this.sideT = 0; this.detours = 0;
    this.stats.started++;
    Input.release();
    if (p.seat && p.standUp) p.standUp();
    // the 길 안내: pinned on the place (its line = this route); it ends with the request (the pad bought / gone); a
    //  notice-board pin it replaces comes back after it
    const N = this.v42 && this.v42.nav, ref = this.target.ref;
    const prev = N && N.pinned ? (N.pinned.goal ? N.pinned.restore : N.pinned) : null;
    if (N && N.pin) N.pin({ x: pl.x, y: pl.y, name: row.name, icon: row.icon, quiet: true, goal: true, restore: prev, valid: () => !ref || !(ref.done || ref.active === false || (ref.state && ref.state === 'done')) });
    this.wrapTutorial();
    say(obs ? 'g_walkObs' : 'g_walk', { place: row.name });
    return { ok: true, why: null };
  }

  plan() {
    const gs = this.gs, p = gs.player, T = this.target;
    this.route.length = 0;
    if (gs.roads) gs.roads.route(p.x, p.y, T.x, T.y, this.route, 220);
    if (!this.route.length) this.route.push({ x: T.x, y: T.y });
    // ((v4.3 sea) the chief's own ground beyond the shore line (his landing) is unknown to the roads: through its door,
    //  onto it and off it (ChiefPilot.planTo does the first)
    const C = gs.collision, Lt = C && C.inLand ? C.inLand(T.x, T.y) : null, Lp = C && C.inLand ? C.inLand(p.x, p.y) : null;
    if (Lt && Lt.door && Lt !== Lp && this.route.length) this.route.splice(this.route.length - 1, 0, { x: Lt.door.x, y: Lt.door.y });
    if (Lp && Lp.door && Lp !== Lt) this.route.unshift({ x: Lp.door.x, y: Lp.door.y });
    const last = this.route[this.route.length - 1];
    if (last.x !== T.x || last.y !== T.y) this.route.push({ x: T.x, y: T.y });
    this.ri = 0;
    this.wpRef = null;
    this.planN++;
  }

  /** the walk ends: 'arrived' | 'human' | 'stuck' | 'pilot' | 'gone' (quiet: no toast) */
  stop(why, quiet) {
    if (!this.on) return;
    this.on = false;
    this.vec.x = this.vec.y = 0;
    this.last = why;
    const ui = this.gs.ui, T = this.target;
    const N = this.v42 && this.v42.nav;
    if (why === 'arrived') {
      this.stats.arrived++;
      if (N && N.pinned && T && N.pinned.pad.x === T.x && N.pinned.pad.y === T.y) N.unpin();
      if (ui && !quiet) ui.toast(gt('g_arrived', { place: T ? T.name : '' }), 2200);
    } else if (why === 'stuck') {
      this.stats.stuck++;
      if (ui && !quiet) ui.toast(gt('g_stuck'), 3200);
    } else {
      this.stats.cancelled++;
      if (why === 'human' && ui && !quiet) ui.toast(gt('g_cancel'), 2200);
      // ((review L5) the target was finished / taken away meanwhile: a line says so)
      if (why === 'gone' && ui && !quiet) ui.toast(gt('g_gone', { place: T ? T.name : '' }), 2400);
      if (why === 'gone' && N && N.pinned && T && N.pinned.pad.x === T.x && N.pinned.pad.y === T.y) N.unpin();
    }
  }

  /** a human is steering this frame (the joystick / keys moved him instead of us, a held finger, a test's input) */
  human(dt) {
    const I = Input;
    if (I.override && Math.abs(I.override.x || 0) + Math.abs(I.override.y || 0) > 0.05) return true;
    if (I.vec && I.vec.mag > 0.05 && this.servedTick !== this.tick) return true;
    if (I.joy && I.joy.active) { this.holdT += dt; if (this.holdT >= HOLD_S) return true; } else this.holdT = 0;
    return false;
  }

  update(dt) {
    const gs = this.gs;
    if (this.on) {
      const P = this.v42 && this.v42.pilot;
      const ref = this.target && this.target.ref;
      if (this.human(dt)) this.stop('human');
      else if (P && P.on) this.stop('pilot', true);
      else if (!this.available || !gs.player) this.stop('gone', true);
      else if (ref && (ref.done || ref.active === false || ref.state === 'done')) this.stop('gone');
      else if (this.held()) { this.vec.x = this.vec.y = 0; this.holdT = 0; Input.lastActivity = gs.time.now; }
      else {
        this.steer(dt);
        // (walking counts as activity: no idle hints, no 관망 countdown meanwhile)
        Input.lastActivity = gs.time.now;
      }
    }
    this.tick++;
  }

  /** the vector toward the next waypoint; the last one exactly, slowing down on the last metres */
  steer(dt) {
    const gs = this.gs, p = gs.player, T = this.target, v = this.vec;
    v.x = v.y = 0;
    if (gdist(p.x, p.y, T.x, T.y) <= ARRIVE) { this.stop('arrived'); return; }
    const R = this.route;
    let w = R[this.ri];
    while (w && this.ri < R.length - 1 && gdist(p.x, p.y, w.x, w.y) < 30) { this.ri++; w = R[this.ri]; }
    if (!w) { R.length = 0; R.push({ x: T.x, y: T.y }); this.ri = 0; w = R[0]; this.planN++; }
    const lastW = this.ri === R.length - 1;
    let dx = w.x - p.x, dy = w.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    // progress = getting closer to this waypoint (like the pilot): stuck -> another way, a side-step, given up
    const gw = gdist(p.x, p.y, w.x, w.y);
    if (this.wpRef !== w) { this.wpRef = w; this.wpBest = gw; this.stuckT = Math.min(this.stuckT, 1); }
    else if (gw < this.wpBest - 4) { this.wpBest = gw; this.stuckT = 0; }
    else this.stuckT += dt;
    if (this.stuckT > DETOUR_S && this.detours < 2 && gs.roads && gs.roads.detour) {
      this.detours++;
      const way = gs.roads.detour(p.x, p.y, T.x, T.y, [], p.radius);
      if (way && way.length) {
        R.length = 0;
        for (const q of way) R.push({ x: q.x, y: q.y });
        const e = R[R.length - 1];
        if (e.x !== T.x || e.y !== T.y) R.push({ x: T.x, y: T.y });
        this.ri = 0; this.wpRef = null; this.stuckT = 0; this.planN++;
        return;
      }
    }
    // (on the place's pad and its centre will not come closer — something stands on its edge: he is there)
    if (lastW && this.stuckT > 0.6 && T.pad && T.pad.contains(p.x, p.y)) { this.stop('arrived'); return; }
    if (this.stuckT > DROP_S) { this.stop('stuck'); return; }
    dx /= d; dy /= d;
    if (this.stuckT > SIDE_S || this.sideT > 0) {
      if (this.sideT <= 0) this.sideT = 0.6;
      this.sideT -= dt;
      const s = (this.detours & 1) ? 1 : -1;
      [dx, dy] = [-dy * s, dx * s];
    }
    // the screen direction -> the joystick (he moves verticalFactor slower up / down: aim so he goes straight at it)
    const vf = Number(BALANCE.player && BALANCE.player.verticalFactor) || 1;
    let ix = dx, iy = dy / vf;
    const m = Math.hypot(ix, iy) || 1;
    ix /= m; iy /= m;
    const k = lastW ? Math.max(0.22, Math.min(1, d / 110)) : 1;
    v.x = ix * k; v.y = iy * k;
  }

  /** what the window shows (GoalBook.read) */
  read(nNext, nSide) { return this.book.read(nNext, nSide); }

  state() {
    const T = this.target;
    return { on: this.on, last: this.last, target: T ? { x: Math.round(T.x), y: Math.round(T.y), name: T.name, id: T.id } : null, route: this.route.length, ri: this.ri, stuckT: +this.stuckT.toFixed(2), detours: this.detours, vec: [+this.vec.x.toFixed(2), +this.vec.y.toFixed(2)], stats: Object.assign({}, this.stats) };
  }

  hooks(H) {
    const self = this;
    H.goals = {
      /** the window's content (rows without object refs) */
      book: (nNext, nSide) => {
        const b = self.book.read(nNext || 3, nSide || 6);
        const row = (r) => (r ? { id: r.id, kind: r.kind, name: r.name, icon: r.icon, coins: r.coins, items: r.items, state: r.state, why: r.why, afford: !!r.afford, have: r.have, need: r.need, building: r.building || null, sub: self.book.sub(r), place: r.place ? { x: Math.round(r.place.x), y: Math.round(r.place.y) } : null } : null);
        return { cur: row(b.cur), next: b.next.map(row), side: b.side.map(row), sideMore: b.sideMore, done: b.done, all: b.all };
      },
      /** walk to the current goal ('cur'), a next one (index) or a side goal (id) */
      go: (which) => {
        const b = self.book.read(6, 20);
        let r = null;
        if (which === 'cur' || which === undefined) r = b.cur;
        else if (typeof which === 'number') r = b.next[which] || null;
        else r = b.side.find((q) => q.id === which) || b.next.find((q) => q.id === which) || (b.cur && b.cur.id === which ? b.cur : null);
        if (!r) return { ok: false, why: 'none' };
        const res = self.go(r, b.cur);
        return Object.assign({ target: r.place ? { x: Math.round(r.place.x), y: Math.round(r.place.y) } : null, name: r.name }, res);
      },
      /** walk to any point (tests: unreachable / far targets) */
      goTo: (x, y, name) => self.go({ id: 'test', name: name || 'test', icon: 'ui_icon_goal', state: 'side', place: { x, y } }, null),
      stop: () => { self.stop('human', true); return self.state(); },
      state: () => self.state(),
      // the window (UI scene): its state, open / close, a finger on a row
      panel: () => { const u = self.gs.scene.get('UI'); return u && u.goals ? u.goals.state() : null; },
      open: () => { const u = self.gs.scene.get('UI'); if (u && u.goals) u.goals.open('test'); return u && u.goals ? u.goals.state() : null; },
      close: () => { const u = self.gs.scene.get('UI'); if (u && u.goals) u.goals.close(true); return true; },
      tapRow: (id) => { const u = self.gs.scene.get('UI'); return !!(u && u.goals && u.goals.tapRow(id)); },
      // (a finger down and up on the objective panel; drag: a touch that began elsewhere (the joystick) and ends on it)
      tapObjective: (drag) => {
        const u = self.gs.scene.get('UI'), op = u && u.objPanel;
        if (!op || !op.input || !op.input.enabled || !op.visible) return false;
        const ptr = { id: 1, downTime: self.gs.time.now + Math.random(), x: 10, y: 10, downX: 10, downY: drag ? 330 : 10 };
        if (!drag) op.emit('pointerdown', ptr);
        op.emit('pointerup', ptr);
        return true;
      },
    };
  }

  destroy() {
    this.on = false;
    if (Input.pilot === this.wrap) Input.pilot = null;
  }
}
