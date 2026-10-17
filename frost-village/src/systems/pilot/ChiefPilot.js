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
import { urgentTarget, workTarget, cashTarget, restSpot, chatMate, isPayTarget, hireTarget, isHirePad } from './work.js';
import { CameraDirector } from './CameraDirector.js';
import { Residency } from '../../core/Residency.js';
import { Assets } from '../../core/Assets.js';

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
  /** chief2's sheet: the atlas of the character that extends the chief (char_player_b) */
  sheetKey() {
    if (this._sheet !== undefined) return this._sheet;
    let k = null;
    for (const a in Assets.extAtlas || {}) if (Assets.extAtlas[a] === 'player') { k = a; break; }
    if (k) this._sheet = k;
    return k;
  }
  /** how far he looks for someone to chat with: further during a chore break (the break is his to spend) */
  chatRange() { return (this.locked.urgent || 0) > this.t ? 1500 : 600; }
  get available() { const gs = this.gs; return !!(this.v42.complete && !(gs.tutorial && gs.tutorial.inTutorial)); }
  /** may the piloted chief pay at this pad? never — except 관망 중 돈 쓰기 '고용만' on a staff / porter hire pad */
  blocksPay(kind, pad) { if (!this.on) return false; if (kind === 'hire' && Settings.data.observeSpend === 'hire' && (!pad || isHirePad(pad))) return false; return true; }

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
    // ((gameplay review M3) the halo's 관망 look: the star pin always, a softer ring, slower motes)
    if (this.v42.aura) this.v42.aura.observing = true;
    if (gs.ui && gs.ui.banner && reason === 'auto') gs.ui.toast(t('obs_caption', { act: t('act_walk') }));
    return true;
  }

  stop(reason) {
    if (!this.on) return;
    this.on = false;
    this.act = null;
    this.freeSeat();
    const p = this.gs.player;
    if (p && p.seat && p.standUp) p.standUp();
    this.vec.x = this.vec.y = 0;
    this.route.length = 0;
    this.cam.stop();
    if (this.v42.aura) this.v42.aura.observing = false;
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
    const mate = chatMate(gs, p.x, p.y, this.chatted, this.t, this.chatRange());
    return {
      now: this.t, hour,
      urgent: !!(hireTarget(gs) || urgentTarget(gs)),
      lunchOpen: !!(R && R.enabled),
      bagCount: p.stack.count, bagRoom: p.room,
      work: !!workTarget(gs),
      noCourier: !(O && O.hired('ttal')),
      cashMax: cashes.reduce((m, c) => Math.max(m, c.value || 0), 0),
      trainSoon: !!(rail && rail.running && rail.phase === 'toOurs' && rail.untilArrival() < 20),
      // (the day's one train watch: from further away)
      trainNear: !!(nb && nb.ours && gdist(p.x, p.y, nb.ours.x, nb.ours.y) < (this.trainDay === (clock ? clock.day() : -1) ? 1500 : 2600)),
      trainToday: this.trainDay === (clock ? clock.day() : -1),
      dogIdle: this.t - (this.lastDog === undefined ? -600 : this.lastDog),
      chatMate: !!mate || !!(this.act && this.act.act === 'chat' && this.act.sub), chatIdle: this.t - this.lastChat,
      office: !!(O && O.built), paperNew: !!(N && N.list.length && N.day >= (clock ? clock.day() : 0)), unread: N ? N.unread() : 0,
      dog: !!(gs.dog && gs.dog.r && gdist(p.x, p.y, gs.dog.r.x, gs.dog.r.y) < ((this.t - (this.lastDog === undefined ? -600 : this.lastDog)) >= 600 ? 1400 : 800)),
      locked: this.locked,
    };
  }

  /** (CODE-2) the terrace seat he ate at is free again */
  freeSeat() { if (this.lunchSeat && this.lunchSeat.by === 'chief') this.lunchSeat.by = null; this.lunchSeat = null; }

  /** begin activity `a`: its target and timers */
  begin(a) {
    const gs = this.gs, p = gs.player, O = this.v42.office;
    this.freeSeat();
    if (p.seat && p.standUp) p.standUp();
    if (p.action && /^(talk|wave|warm_hands|cheer)$/.test(p.action.anim)) p.action = null;
    const [mn, mx] = DUR[a] || [20, 40];
    const st = { act: a, t: 0, min: mn, max: mn + this.rand() * Math.max(0, mx - mn), target: null, sub: null };
    switch (a) {
      case 'urgent': st.target = hireTarget(gs) || urgentTarget(gs); break;
      case 'work': st.target = workTarget(gs); break;
      case 'collect': { const c = cashTarget(gs, 200); st.target = c; break; }
      case 'lunch': {
        // (CODE-2) a free terrace seat: he sits and eats (chief2 sit_eat); else in front of the restaurant
        const R = gs.civic && gs.civic.restaurant;
        if (!R) break;
        const seat = (R.seats || []).find((q) => !q.by);
        if (seat && R.seatSide) { const sd = R.seatSide(seat); st.target = { x: sd.x, y: sd.y, seat }; }
        else st.target = { x: R.x + 160, y: R.y + 120 };
        break;
      }
      case 'evening': case 'office': {
        // (CODE-2) into the office (through its door) to the 책상 pad; he then sits at his desk
        if (O && O.building && O.building.cw) { const d = O.building.spots.deskPad; st.target = { x: d.x, y: d.y, kind: 'desk' }; }
        else if (O && O.building) { const d = O.building.spots.deskPad; st.target = { x: d.x + 46, y: d.y + 30 }; }
        else st.target = restSpot(gs, this.r);
        break;
      }
      case 'train': {
        const nb = gs.v4;
        if (nb && nb.ours && nb.ours.wait && nb.ours.wait.length) { const w = nb.ours.wait[0]; st.target = { x: w.x + 40, y: w.y + 30 }; }
        this.trainDay = nb && nb.clock && nb.clock.on ? nb.clock.day() : -1;
        break;
      }
      case 'chat': { const m = chatMate(gs, p.x, p.y, this.chatted, this.t, this.chatRange()); if (m) { st.sub = m; st.target = { x: m.ch.x + 54, y: m.ch.y + 26 }; } break; }
      case 'rest': st.target = restSpot(gs, this.r); break;
      case 'dog': { const d = gs.dog && gs.dog.r; if (d) st.target = { x: d.x + 50, y: d.y + 20 }; this.lastDog = this.t; break; }
      default: break;
    }
    if (st.target && st.target.kind !== 'hire' && isPayTarget(gs, st.target.x, st.target.y)) st.target = null;
    if (st.target) this.planTo(st.target.x, st.target.y);
    else this.route.length = 0;
    this.act = st;
    this.stats.acts[a] = (this.stats.acts[a] || 0) + 1;
    this.stuckT = 0;
    this.arrived = false;
  }

  planTo(x, y) {
    const gs = this.gs, p = gs.player;
    if (p.seat && p.standUp) p.standUp();
    if (gdist(p.x, p.y, x, y) < 220) { this.route.length = 0; this.route.push({ x, y }); }
    else gs.roads.route(p.x, p.y, x, y, this.route);
    // (CODE-2) a place inside the office: through its door (the walls have one gap)
    const B = this.v42.office && this.v42.office.building;
    if (B && B.cw && B.cw.onFloor(x, y - B.lift) && !B.cw.onFloor(p.x, p.y - B.lift)) {
      const d = B.spots.door, e = B.spots.entry;
      while (this.route.length && B.cw.onFloor(this.route[this.route.length - 1].x, this.route[this.route.length - 1].y - B.lift)) this.route.pop();
      this.route.push({ x: d.x, y: d.y + 6 }, { x: e.x, y: e.y }, { x, y });
    }
    this.ri = 0;
  }

  /** (CODE-2) arrived: the activity's pose (chief2: sit at his desk, eat at a terrace table, talk, wave, warm hands) */
  pose(a) {
    const gs = this.gs, p = gs.player, O = this.v42.office;
    // (a stand-in chief — the Node test's — has no seated / social poses)
    if (!p || typeof p.sitDown !== 'function' || typeof p.doAction !== 'function') return;
    const nb = gs.v4, hour = nb && nb.clock && nb.clock.on ? nb.clock.hour() : 12;
    if ((a.act === 'office' || a.act === 'evening') && a.target && a.target.kind === 'desk' && O && O.building && O.building.cw) {
      const B = O.building, cw = B.cw, s = B.spots.chiefSeat;
      const ord = cw.order, fi = Math.max(0, ord.indexOf('chief_office_interior_front'));
      p.sitDown({ x: s.x, y: s.y, lift: B.lift, slot: '@behind', deskOverlay: true, deskDepth: cw.base + 0.01 * fi + 0.002, dir: 3, shadowDy: 25, standDy: 34 }, this.deskAnim(hour));
      B.holdOpen(2);
      a.deskT = 0;
      return;
    }
    if (a.act === 'lunch' && a.target && a.target.seat && !a.target.seat.by) {
      const seat = a.target.seat;
      seat.by = 'chief';
      this.lunchSeat = seat;
      p.sitDown({ x: seat.x, y: seat.y, lift: 0, slot: null, deskOverlay: true, deskDepth: seat.table.y + 0.01, dir: 2, shadowDy: 20, standDy: 40 }, 'sit_eat');
      return;
    }
    if (a.act === 'chat' && a.sub && a.sub.ch) { p.doAction('talk', 26, a.sub.ch.x, a.sub.ch.y); return; }
    if (a.act === 'train') { const nb2 = gs.v4; const tx = nb2 && nb2.ours ? nb2.ours.x : p.x, ty = nb2 && nb2.ours ? nb2.ours.y + 60 : p.y + 60; p.doAction('wave', 7, tx, ty); return; }
    if ((a.act === 'rest' || a.act === 'evening') && a.target && a.target.kind === 'fire') {
      const f = (gs.campfires || []).reduce((b, c) => (!b || gdist(p.x, p.y, c.x, c.y) < gdist(p.x, p.y, b.x, b.y) ? c : b), null);
      p.doAction('warm_hands', 40, f ? f.x : p.x - 40, f ? f.y : p.y - 20);
    }
  }

  /** what he does at his desk: dozes after 22:00, reads the morning paper, else writes and stamps */
  deskAnim(hour) {
    if (hour >= 22 || hour < 6) return 'doze';
    const N = this.v42.news;
    if (hour >= 8 && hour < 10 && N && N.list && N.list.length) return 'sit_read_loop';
    return (this.index & 1) ? 'sit_write' : 'sit_read_loop';
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
      case 'urgent': return this.urgentCaption(a.target);
      case 'work': {
        const tg = a.target;
        // ((gameplay review L1) a place name with a {st} slot gets its station)
        if (tg && tg.kind === 'carry') return t('actw_carry', { item: t(tg.item), place: tg.place ? t(tg.place, tg.lp || undefined) : t('place_market') });
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

  /** ((gameplay review L6) what the urgent job is: the tutorial objective it follows, in a few words */
  urgentCaption(tg) {
    const k = (tg && tg.key) || '';
    let what = null;
    if (tg && tg.kind === 'hire') what = 'urg_hire';
    else if (/^obj_(register|store_register|rest_register)/.test(k)) what = 'urg_register';
    else if (/ribbon/.test(k)) what = 'urg_ribbon';
    else if (/^obj_op|^obj_operating|^obj_grill|^obj_rest_kitchen/.test(k)) what = 'urg_station';
    else if (/^obj_site|^obj_feed_carpenter/.test(k)) what = 'urg_site';
    else if (/^obj_food|^obj_take_bread|^obj_rest_pantry/.test(k)) what = 'urg_food';
    else if (/^obj_cargo|^obj_order/.test(k)) what = 'urg_cargo';
    else if (/^obj_pile|^obj_take|^obj_fish/.test(k)) what = 'urg_fetch';
    else if (/^obj_(sell|cash|hall_tax)/.test(k)) what = 'urg_deliver';
    return what ? t(what) : t('act_urgent', { what: '' }).trim();
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
      // ((v4.2 fix, gameplay L4) the overview map open counts as busy: 관망 started under it with the chief a dot)
      const busy = robot || !this.available || !after || gs.overview || (ui && (ui.panelOpen || ui.buildOpen || ui.v4PanelOpen || ui.v42PanelOpen)) || (gs.v4 && gs.v4.rank && gs.v4.rank.ceremonyOn) || Input.override;
      const idle = (gs.time.now - Math.max(Input.lastActivity || 0, Input.lastTouch || 0)) / 1000;
      if (busy || idle < after) this.countdown = 0;
      else if (!this.countdown) this.countdown = 3;
      else { this.countdown -= dt; if (this.countdown <= 0) { this.countdown = 0; this.start('auto'); } }
      return;
    }
    if (!this.available) { this.stop('gone'); return; }
    // ((v4.2 fix, visual H3) the chief's seated / social anims (chief2's on-demand sheet) stay in memory while 관망 is
    //  on: asked for at once and pinned, so a desk, a lunch table or a chat never shows him standing in the furniture)
    if ((this.sheetT = (this.sheetT || 0) - dt) <= 0) {
      this.sheetT = 2;
      const k = this.sheetKey();
      if (k) { Residency.pin(k, 6); Residency.want(k); }
    }
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
      // ((v4.2 fix) an urgent chore that ran out twice on the same target cannot be done by him (a full shelf the
      //  tutorial still points at): it rests 60 s — he walked to it and back for a game hour and a half)
      if (over && cur.act === 'urgent') {
        const tg = cur.target, k = tg ? Math.round(tg.x) + ',' + Math.round(tg.y) + ',' + (tg.key || '') : '';
        if (k && k === this.lastUrgent) { this.locked.urgent = Math.max(this.locked.urgent || 0, this.t + 60); this.lastUrgent = null; }
        else this.lastUrgent = k;
      }
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
        if (a.act === 'chat' && a.sub && a.sub.ch) this.chat(a.sub);
        if (a.act === 'dog' && gs.dog && gs.dog.command) gs.dog.command('pet');
        this.pose(a);
      }
      // (CODE-2) at his desk: write, read, doze — a change every 12 s
      const p = gs.player;
      if (this.arrived && p.seat && (a.act === 'office' || a.act === 'evening') && (a.deskT = (a.deskT || 0) + dt) > 12) {
        a.deskT = 0;
        const nb = gs.v4, hour = nb && nb.clock && nb.clock.on ? nb.clock.hour() : 12;
        this.index++;
        if (p.seatPlay) p.seatPlay(this.deskAnim(hour));
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
    // (the resident stays for the chat: their stay job waits)
    const j = ch.job;
    if (j && j.kind === 'stay') { j.next = Math.max(Number(j.next) || 0, 12); j.left = Math.max(Number(j.left) || 0, 14); }
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
