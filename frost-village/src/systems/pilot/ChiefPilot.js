// (v4.2, docs/v42_plan.md §7) 관망 모드 — gs.v42.pilot: the chief lives his day while the player watches.
//   in       the 관망 button (after village complete), or automatically after Settings.data.observeAfter s with no touch
//            (끔 / 30 / 60 / 120), not during a panel, a ceremony, the tutorial or the first loop; a 3 s countdown chip
//            (any touch cancels)
//   input    Input.pilot = this.vector (src/core/Input.js): a test override > a human joystick / key (that hands control
//            back in the same frame, toast 다시 조종해요) > the pilot. Buttons do not end 관망; a tap on the village does.
//   chooser  every pilot.decideEvery s: agenda.choose() over the activities (pure, seeded: mulberry32(hash(seed, day,
//            index))), the current one locked for its minimum time, 20 % hysteresis
//   moving   Roads.route legs, then the player's own collision steering; stuck 3 s -> a side-step, 8 s -> the task is
//            dropped and its target marked unreachable for 60 s
//   safety   while the pilot drives, pay / hire / upgrade pads, plots and the trash pad ignore the chief (UnlockPad,
//            Site, TrashPad ask pilot.blocksPay()); setting 관망 중 돈 쓰기 '고용만' lets him hire what he can afford
//   pickups  'auto' while piloted (PickupPolicy asks pilot.on)
// Not saved: always off after a reload.

import { BALANCE } from '../../data/balance.js';
import { Settings } from '../../core/Save.js';
import { Input } from '../../core/Input.js';
import { t } from '../../data/strings.js';
import { gdist } from '../../core/Iso.js';
import { choose, DUR, AGAIN, CHORES, rng32, hash3 } from './agenda.js';
import { urgentTarget, workTarget, cashTarget, restSpot, chatMate, isPayTarget } from './work.js';
import { CameraDirector } from './CameraDirector.js';

const PB = () => (BALANCE.v42 && BALANCE.v42.pilot) || {};

export class ChiefPilot {
  constructor(gs, v42, sv) {
    this.gs = gs;
    this.v42 = v42;
    this.on = false;
    this.t = 0;
    this.decT = 0;
    this.index = 0;
    this.seed = (sv && Number.isFinite(sv.cid) ? sv.cid : 0x5eed) >>> 0;
    if (sv && typeof sv.cid === 'string') { let h = 0; for (const ch of sv.cid) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0; this.seed = h || 0x5eed; }
    this.r = rng32(this.seed ^ 0x9e3779b9);
    this.act = null;          // { act, t, min, max, target, sub }
    this.countdown = 0;
    this.route = [];
    this.ri = 0;
    this.vec = { x: 0, y: 0 };
    this.locked = {};
    this.chatted = {};
    this.lastChat = 0;
    this.stuckT = 0;
    this.sideT = 0;
    this.choreT = 0;          // seconds of chores (급한 일 / 업무) since the last break
    this.lastPos = null;
    this.stats = { acts: {}, started: 0, yields: 0, spent: 0, stuck: 0, coins0: 0 };
    this.cam = new CameraDirector(gs, this);
    Input.pilot = () => (this.on ? this.vec : null);
    Input.onHuman = () => { if (this.on) this.yieldBack(); else this.countdown = 0; };
    this.reason = null;
  }

  rand() { return this.r(); }
  get available() { const gs = this.gs; return !!(this.v42.complete && !(gs.tutorial && gs.tutorial.inTutorial)); }
  blocksPay(kind) { if (!this.on) return false; if (kind === 'hire' && Settings.data.observeSpend === 'hire') return false; return true; }

  toggle() { if (this.on) this.stop('button'); else this.start('button'); }

  start(reason) {
    if (this.on || !this.available) return false;
    const gs = this.gs;
    this.on = true;
    this.reason = reason || 'button';
    this.countdown = 0;
    this.act = null;
    this.decT = 0;
    this.stats.started++;
    this.stats.coins0 = gs.economy.coins;
    this.cam.start();
    if (gs.ui && gs.ui.banner && reason === 'auto') gs.ui.toast(t('obs_caption', { act: t('act_walk') }));
    return true;
  }

  stop(reason) {
    if (!this.on) return;
    this.on = false;
    this.act = null;
    this.vec.x = this.vec.y = 0;
    this.route.length = 0;
    this.cam.stop();
    void reason;
  }

  /** a human touched the controls: hand back in this frame */
  yieldBack() {
    if (!this.on) return;
    this.stats.yields++;
    this.stop('human');
    if (this.gs.ui) this.gs.ui.toast(t('obs_back'));
  }

  /** the snapshot the chooser decides on */
  context() {
    const gs = this.gs, p = gs.player, v = this.v42, nb = gs.v4;
    const clock = nb && nb.clock && nb.clock.on ? nb.clock : null;
    const hour = clock ? clock.hour() : ((this.t / 60) % 24 + 9) % 24;
    const O = v.office, N = v.news;
    const R = gs.civic && gs.civic.restaurant;
    const rail = nb && nb.rail;
    const cashes = (gs.tills || []).filter((c) => c && c.enabled !== false);
    const mate = chatMate(gs, p.x, p.y, this.chatted, this.t);
    return {
      now: this.t, hour,
      urgent: !!urgentTarget(gs),
      lunchOpen: !!(R && R.enabled),
      bagCount: p.stack.count, bagRoom: p.room,
      work: !!workTarget(gs),
      noCourier: !(O && O.hired('ttal')),
      cashMax: cashes.reduce((m, c) => Math.max(m, c.value || 0), 0),
      trainSoon: !!(rail && rail.running && rail.phase === 'toOurs' && rail.untilArrival() < 20),
      trainNear: !!(nb && nb.ours && gdist(p.x, p.y, nb.ours.x, nb.ours.y) < 1500),
      chatMate: !!mate || !!(this.act && this.act.act === 'chat' && this.act.sub), chatIdle: this.t - this.lastChat,
      office: !!(O && O.built), paperNew: !!(N && N.list.length && N.day >= (clock ? clock.day() : 0)), unread: N ? N.unread() : 0,
      dog: !!(gs.dog && gs.dog.r && gdist(p.x, p.y, gs.dog.r.x, gs.dog.r.y) < 800),
      locked: this.locked,
    };
  }

  /** begin activity `a`: its target and timers */
  begin(a) {
    const gs = this.gs, p = gs.player, O = this.v42.office;
    const [mn, mx] = DUR[a] || [20, 40];
    const st = { act: a, t: 0, min: mn, max: mn + this.rand() * Math.max(0, mx - mn), target: null, sub: null };
    switch (a) {
      case 'urgent': st.target = urgentTarget(gs); break;
      case 'work': st.target = workTarget(gs); break;
      case 'collect': { const c = cashTarget(gs, 200); st.target = c; break; }
      case 'lunch': { const R = gs.civic && gs.civic.restaurant; if (R) st.target = { x: R.x + 160, y: R.y + 120 }; break; }
      case 'evening': case 'office': { if (O && O.building) { const d = O.building.spots.deskPad; st.target = { x: d.x + 46, y: d.y + 30 }; } else st.target = restSpot(gs, this.r); break; }
      case 'train': { const nb = gs.v4; if (nb && nb.ours && nb.ours.wait && nb.ours.wait.length) { const w = nb.ours.wait[0]; st.target = { x: w.x + 40, y: w.y + 30 }; } break; }
      case 'chat': { const m = chatMate(gs, p.x, p.y, this.chatted, this.t); if (m) { st.sub = m; st.target = { x: m.ch.x + 54, y: m.ch.y + 26 }; } break; }
      case 'rest': st.target = restSpot(gs, this.r); break;
      case 'dog': { const d = gs.dog && gs.dog.r; if (d) st.target = { x: d.x + 50, y: d.y + 20 }; break; }
      default: break;
    }
    if (st.target && isPayTarget(gs, st.target.x, st.target.y)) st.target = null;
    if (st.target) this.planTo(st.target.x, st.target.y);
    else this.route.length = 0;
    this.act = st;
    this.stats.acts[a] = (this.stats.acts[a] || 0) + 1;
    this.stuckT = 0;
    this.arrived = false;
  }

  planTo(x, y) {
    const gs = this.gs, p = gs.player;
    if (gdist(p.x, p.y, x, y) < 220) { this.route.length = 0; this.route.push({ x, y }); }
    else gs.roads.route(p.x, p.y, x, y, this.route);
    this.ri = 0;
  }

  /** the joystick vector toward the next waypoint (0 when arrived) */
  steer(dt) {
    const gs = this.gs, p = gs.player;
    const v = this.vec;
    v.x = v.y = 0;
    if (!this.route.length || this.ri >= this.route.length) return true;
    let w = this.route[this.ri];
    while (w && gdist(p.x, p.y, w.x, w.y) < (this.ri === this.route.length - 1 ? 16 : 30)) { this.ri++; w = this.route[this.ri]; }
    if (!w) return true;
    let dx = w.x - p.x, dy = w.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    // stuck: no progress for stuckSide s -> a side-step; stuckDrop s -> drop the task (unreachable 60 s)
    const lp = this.lastPos;
    if (lp && Math.hypot(p.x - lp.x, p.y - lp.y) < 18 * dt * 60 / 60) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    this.lastPos = { x: p.x, y: p.y };
    if (this.stuckT > (Number(PB().stuckDrop) || 8)) {
      this.stats.stuck++;
      if (this.act) this.locked[this.act.act] = this.t + 60;
      this.act = null; this.route.length = 0; this.stuckT = 0;
      return true;
    }
    if (this.stuckT > (Number(PB().stuckSide) || 3) || this.sideT > 0) {
      if (this.sideT <= 0) this.sideT = 0.7;
      this.sideT -= dt;
      const s = (this.index & 1) ? 1 : -1;
      [dx, dy] = [-dy * s, dx * s];
    }
    const slow = this.ri === this.route.length - 1 && d < 60 ? 0.5 : 1;
    v.x = dx * slow; v.y = dy * slow;
    return false;
  }

  /** what the caption says he is doing */
  caption() {
    const a = this.act, gs = this.gs;
    if (!a) return t('act_walk');
    switch (a.act) {
      case 'urgent': return t('act_urgent', { what: '' }).trim();
      case 'work': {
        const tg = a.target;
        if (tg && tg.kind === 'carry') return t('actw_carry', { item: t(tg.item), place: tg.place ? t(tg.place) : t('place_market') });
        if (tg && tg.kind === 'take') return t('actw_take', { item: t(tg.item), place: tg.st ? t('line_' + tg.st.id) : t('pile_' + ((tg.pile && tg.pile.id) || 'fish')) });
        return t('pact_work', { what: t('act_walk') });
      }
      case 'lunch': return t('pact_lunch');
      case 'evening': return gs.v4 && gs.v4.clock && gs.v4.clock.hour() >= 22 ? t('pact_doze') : t('act_evening');
      case 'collect': return t('act_collect');
      case 'train': return t('pact_train');
      case 'chat': { const m = a.sub; return t('act_chat', { name: m && m.ch && m.ch.name ? m.ch.name : t('stn_town') }); }
      case 'office': return t('act_office', { what: t(a.t > 20 ? 'acto_paper' : 'acto_sit') });
      case 'rest': return t('act_rest', { what: t(a.target && a.target.kind === 'fire' ? 'actr_fire' : a.target && a.target.kind === 'bench' ? 'actr_bench' : 'actr_sea') });
      case 'dog': return t('act_dog');
      default: return t('act_walk');
    }
  }

  update(dt) {
    const gs = this.gs;
    this.t += dt;
    // the automatic start: after observeAfter s with no touch, a 3 s countdown chip
    if (!this.on) {
      const after = Number(Settings.data.observeAfter);
      const ui = gs.ui;
      // (automated browsers — the test suites and bots — never auto-start 관망 unless a test asks: window.__FV_PILOT_AUTO)
      const robot = typeof navigator !== 'undefined' && navigator.webdriver && !(typeof window !== 'undefined' && window.__FV_PILOT_AUTO);
      const busy = robot || !this.available || !after || (ui && (ui.panelOpen || ui.buildOpen || ui.v4PanelOpen || ui.v42PanelOpen)) || (gs.v4 && gs.v4.rank && gs.v4.rank.ceremonyOn) || Input.override;
      const idle = (gs.time.now - Math.max(Input.lastActivity || 0, Input.lastTouch || 0)) / 1000;
      if (busy || idle < after) this.countdown = 0;
      else if (!this.countdown) this.countdown = 3;
      else { this.countdown -= dt; if (this.countdown <= 0) { this.countdown = 0; this.start('auto'); } }
      return;
    }
    if (!this.available) { this.stop('gone'); return; }
    // decide
    this.decT -= dt;
    if (this.act) { this.act.t += dt; if (CHORES.indexOf(this.act.act) >= 0) this.choreT += dt; }
    if (this.decT <= 0) {
      this.decT = Number(PB().decideEvery) || 0.5;
      const nb = gs.v4, day = nb && nb.clock && nb.clock.on ? nb.clock.day() : 0;
      const cur = this.act;
      const over = cur && cur.t >= cur.max;
      // a break: after pilot.breakAfter s of chores they wait pilot.breakFor s (a chat, the office, a rest, the dog)
      if (cur && CHORES.indexOf(cur.act) >= 0 && this.choreT >= (Number(PB().breakAfter) || 90)) {
        const until = this.t + (Number(PB().breakFor) || 25);
        for (const a of CHORES) this.locked[a] = until;
        this.choreT = 0;
      }
      if (over) this.locked[cur.act] = Math.max(this.locked[cur.act] || 0, this.t + (AGAIN[cur.act] || 0));
      const ctx = this.context();
      const pick = choose(ctx, this.seed, day, this.index++, cur);
      if (!cur || over || (pick.act !== cur.act && !pick.kept)) {
        if (cur && pick.act !== cur.act && !over) this.locked[cur.act] = Math.max(this.locked[cur.act] || 0, this.t + (AGAIN[cur.act] || 0));
        this.begin(pick.act);
      }
      else if (cur && cur.act === 'work' && this.arrived && cur.t > 2) {
        // a work step done (bag delivered / load taken): the next one
        const nt = workTarget(gs);
        if (nt && (!cur.target || nt.x !== cur.target.x || nt.y !== cur.target.y)) { cur.target = nt; this.planTo(nt.x, nt.y); this.arrived = false; }
      }
    }
    // move
    const a = this.act;
    if (a && a.target) {
      const done = this.steer(dt);
      if (done && !this.arrived) {
        this.arrived = true;
        const p = gs.player;
        if (a.act === 'chat' && a.sub && a.sub.ch) this.chat(a.sub);
        if (a.act === 'train' && p.play) p.play('wave', true);
        if (a.act === 'dog' && gs.dog && gs.dog.command) gs.dog.command('pet');
      }
    } else this.vec.x = this.vec.y = 0;
    this.cam.update(dt);
  }

  /** both face each other, a few bubbles from the residents' own lines (no AI calls) */
  chat(m) {
    const gs = this.gs, p = gs.player, ch = m.ch;
    this.chatted[m.key] = this.t;
    this.lastChat = this.t;
    if (ch.faceTo) ch.faceTo(p.x, p.y);
    if (p.faceTo) p.faceTo(ch.x, ch.y);
    const B = gs.life && gs.life.bubbles;
    if (!B) return;
    const lines = ['💬', '♪', '❤'];
    const n = 2 + Math.floor(this.rand() * 3);
    for (let i = 0; i < n; i++) gs.time.delayedCall(600 + i * 1800, () => { if (!this.on) return; const who = i % 2 ? p : ch; if (B.emote) B.emote(who, i === n - 1 ? 'emote_heart' : 'emote_dots', 1.6); else B.chat(who, lines[i % 3], null, 1.6); });
    const aide = this.v42.office && this.v42.office.staff && this.v42.office.staff.chong;
    if (aide && aide.alive && aide.play) { aide.play('idle', true); }
  }

  state() { return { on: this.on, act: this.act ? this.act.act : null, t: this.act ? +this.act.t.toFixed(1) : 0, countdown: +this.countdown.toFixed(2), caption: this.on ? this.caption() : null, stats: JSON.parse(JSON.stringify(this.stats)), cuts: this.cam.cuts, route: this.route.length, vec: [+this.vec.x.toFixed(2), +this.vec.y.toFixed(2)] }; }

  hooks(H) {
    H.pilot = (on) => { if (on === true) this.start('test'); else if (on === false) this.stop('test'); return this.state(); };
  }

  destroy() { this.stop('end'); this.cam.destroy(); if (Input.pilot) Input.pilot = null; Input.onHuman = null; }
}
