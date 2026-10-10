// MissionsHost — the missions module in the game: the pure model + its views + the hand-offs in the world, all
// through the Ports facade (docs/v5_v8_plan.md §5.3; the lab's FakePorts implements the same surface).
//   - accepting: tap a bubble, or walk up to its giver and stand still for 0.5 s → the 받기 / 나중에 card
//   - delivering: walk to the recipient (or place) carrying what they want → the items fly over, they cheer
//   - standing steps (help with the snowman, the reporter, the festival statues …): stand at the spot(s)
//   - finding (the lost mitten, the puppy …): a sparkle appears nearby; walk to it, then back to the giver, or lead
//     the found animal home (it trots behind the chief)
//   - escorting (first school day, an elder's wish): walk up to the person, then to the place together
//   - carrying (moving boxes, the rare fish): pick up at one place, put down at the other
//   - driving (B1–B12): the chief sets off from the 출발 pad at the yard (or the card's 출발 button); the vehicles
//     module runs the drive and reports `veh:driveDone { mid, stars }` (this host owns the start, critique C-2)
//   - asking (E13): talk to residents; funding (C12): the card's 후원 button
//   - mission items: 꽃밭 picking, the bakery's cake, the gift-wrap pad, the 꽃집 put them in the bag (craft pads)
// The host applies the model's events: coins (as module payouts, so the income meter ignores them), toasts, sounds,
// the chip / panel / bubbles / title banner, and the rewards (decor placed by the game through ports.rewards).

import { MissionModel } from './model/missions.js';
import { missionsTuning } from './tuning.js';
import { fitCap } from './save.js';
import { mt, titleOf, elderName } from './strings.js';
import { unitsOf } from './model/units.js';
import { HOST_STEPS } from './data/caps.js';
import { MissionChip, FameChip } from './view/Chips.js';
import { MissionPanel } from './view/MissionPanel.js';
import { RequestBubbles } from './view/RequestBubbles.js';
import { AcceptCard, DoneStamp, TitleBanner, EdgeMarker, fill } from './view/Overlays.js';
import { CraftPads } from './view/CraftPads.js';
import { Followers } from './view/Followers.js';

const NEAR = 82, NEAR_PLACE = 110;
const round10 = (x) => Math.round(x / 10) * 10;

export class MissionsHost {
  /**
   * @param ports  the Ports facade
   * @param saved  the `missions` slice (or null)
   * @param opts   { tuning (BALANCE.v5.missions), seed, views: false (headless) }
   */
  constructor(ports, saved, opts = {}) {
    this.ports = ports;
    this.cfg = missionsTuning(opts.tuning);
    const P = ports;
    this.env = {
      T: () => P.clock.T(), hour: () => P.clock.hour(), day: () => P.clock.day(), rank: () => P.rank(),
      // step:<how> = "the module that performs this step runs": answered here, never by the game's facts
      has: (c) => (c.charCodeAt(0) === 115 && c.startsWith('step:') ? this.wired(c.slice(5)) : P.facts.has(c)),
      count: (k) => P.facts.count(k), income: () => P.income.perMin(),
      wall: () => (P.clock.wall ? P.clock.wall() : Date.now()), uptime: () => (P.clock.uptime ? P.clock.uptime() : 0),
      localDate: () => P.clock.localDate(),
      people: { pick: (r, c) => P.people.pick(r, c), has: (p) => P.people.has(p), onScreen: (p) => P.people.onScreen(p) },
    };
    this.model = new MissionModel(this.cfg, this.env, saved, { seed: opts.seed });
    this.near = { id: 0, t: 0, ok: false };
    this.putOff = new Set();         // bubbles put off with 나중에: no proximity card for them until they pop
    this.lastMoveT = -1e9;           // when the chief last walked (proximity cards need a walk-up)
    this.handT = new Map();          // mission id → next hand-off time
    this.stand = { id: 0, t: 0 };
    this.finds = new Map();          // mission id → { x, y }
    this.esc = new Map();            // mission id → { met, t }        (escort)
    this.carrying = new Map();       // mission id → { has, t }        (carry)
    this.leads = new Map();          // mission id → follower kind     (lead: the found animal trots behind)
    this.wishText = new Map();       // 's' + engine id → { ko, en }   (the elder's current wish, from story:wish)
    this.driving = 0;                // the mission id of the drive under way
    this.views = opts.views !== false && !!(P.ui && P.ui.scene);
    if (this.views) {
      const top = 62 + (P.ui.safeTop || 0), W = P.ui.scene.W || 720;
      this.chip = new MissionChip(this, 28, top + 212);
      this.fameChip = new FameChip(this, W - 24, top + 162);
      this.panel = new MissionPanel(this);
      this.bubbles = new RequestBubbles(this);
      this.card = new AcceptCard(this);
      this.stamp = new DoneStamp(this);
      this.banner = new TitleBanner(this);
      this.edge = new EdgeMarker(this);
      this.pads = new CraftPads(this);
      this.followers = new Followers(this);
    }
    this.api = this.makeApi();
  }

  lang() { return this.ports.lang ? this.ports.lang() : 'ko'; }
  later(id) { return this.ports.later ? this.ports.later(id) : null; }
  chipsVisible() { return !(this.ports.ui && this.ports.ui.overview && this.ports.ui.overview()); }
  panelOpen() { return !!(this.panel && this.panel.isOpen()); }
  toastsOn() { const s = this.ports.settings && this.ports.settings.get('missionToasts'); return s !== false; }
  toast(s, hold) { if (this.toastsOn() && this.ports.ui && this.ports.ui.toast) this.ports.ui.toast(s, hold); }
  open(tab) { if (this.panel) this.panel.open(tab); }
  fameTarget() { return this.fameChip ? this.fameChip.target() : null; }
  onBadgeLanded() { if (this.fameChip) this.fameChip.bump(); }

  /** a step kind is performed by a module that runs now (or by this host itself) */
  wired(how) {
    if (how === 'drive') { const v = this.later('vehicles'); return !!(v && typeof v.drive === 'function'); }
    if (how === 'contract') return !!this.later('harbor');
    if (how === 'choose' || how === 'tap') return !!this.later('beach');
    return HOST_STEPS.indexOf(how) >= 0;
  }

  /** display names for {name} / {to} / {from} / {elder} */
  namesOf(i) {
    const lang = this.lang(), ppl = this.ports.people;
    const nm = (pid) => (pid && !pid.startsWith('p:') ? ppl.name(pid, lang) : pid ? (this.ports.places.name ? this.ports.places.name(pid, lang) : '') : '');
    const name = nm(i.nm || i.w);
    return { name, to: nm(i.w), from: nm(i.gv), elder: elderName(nm(i.nm || i.gv), lang) };
  }

  /** the unit a mission is on now (soft units — C3's naming — never hold the chief back): { u, j } or null */
  current(i) {
    const U = unitsOf(this.model.template(i));
    let j = U.findIndex((u, k) => i.g[k] < u.need && !(u.o && u.o.soft));
    if (j < 0) j = U.findIndex((u, k) => i.g[k] < u.need);
    return j < 0 ? null : { u: U[j], j, U };
  }

  posOf(id) { return !id ? null : id.startsWith('p:') ? this.ports.places.pos(id) : this.ports.people.pos(id); }

  /** a standing step's spot: the next of `each` (three towers, three statues) when the game knows it, else `at` */
  standSpot(i, c) {
    const o = c.u.o || {}, P = this.ports.places;
    if (Array.isArray(o.each) && o.each.length) { const p = P.pos(o.each[(i.g[c.j] | 0) % o.each.length]); if (p) return p; }
    return c.u.at ? P.pos(c.u.at) : null;
  }
  /** where a lead / carry / escort goes */
  leadDest(i, c) { return c.u.to ? this.ports.places.pos(c.u.to) : (i.gv ? this.ports.people.pos(i.gv) : null); }
  escortDest(i, c) { return c.u.at ? this.ports.places.pos(c.u.at) : (i.pl ? this.ports.places.pos(i.pl) : null); }
  carryDest(i) {
    const p = i.pl ? this.ports.places.pos(i.pl) : null;
    if (p) return p;
    const g = i.gv ? this.ports.people.pos(i.gv) : null;       // (no house position: the doorstep beside the giver)
    return g ? { x: g.x + 150, y: g.y + 70 } : null;
  }
  driveFrom(c) { return this.ports.places.pos((c.u.o && c.u.o.from) || 'p:yard'); }

  /** where a mission sends the chief now: { x, y, icon, id } or null */
  targetOf(i) {
    if (!i) return null;
    const m = this.model, t = m.template(i), c = this.current(i);
    if (!c) return null;
    const u = c.u, ch = this.ports.chief;
    let p = null, ic = t.icon;
    if (u.t === 'deliver') {
      const items = u.item ? [u.item] : u.any;
      const hasAny = items.some((k) => (k in m.bag ? m.bag[k] > 0 : ch.count(k) > 0));
      ic = items[0];
      if (hasAny) p = this.posOf(u.to === 'giver' ? i.gv : (u.to && u.to.startsWith('p:') ? u.to : i.w));
      else p = this.pads ? this.pads.sourceOf(items[0]) : null;
      if (!p && !hasAny && this.ports.places.sourceOf) p = this.ports.places.sourceOf(items[0]);
    } else if (u.t === 'step') {
      if (u.how === 'find') { const f = this.finds.get(i.id); p = f ? { x: f.x, y: f.y } : null; }
      else if (u.how === 'return') p = this.posOf(i.gv);
      else if (u.how === 'lead') p = this.leadDest(i, c);
      else if (u.how === 'escort') { const e = this.esc.get(i.id); p = e && e.met ? (this.escortDest(i, c) || this.posOf(i.nm || i.gv)) : this.posOf(i.nm || i.gv || i.w); }
      else if (u.how === 'carry') { const k = this.carrying.get(i.id); p = k && k.has ? this.carryDest(i) : this.posOf(i.gv); }
      else if (u.how === 'drive') { p = this.driving ? null : this.driveFrom(c); ic = 'ui_icon_steer'; }
      else if (u.how === 'identify') p = this.ports.places.pos('p:wanted');
      else if (u.how === 'ask') { const n = this.ports.people.nearby ? this.ports.people.nearby(ch.x(), ch.y(), 1) : []; p = n.length ? this.ports.people.pos(n[0]) : null; ic = 'ui_icon_rumor'; }
      else if (u.how === 'stand' || u.how === 'speech') p = this.standSpot(i, c);
      else if (u.at) p = this.ports.places.pos(u.at);
    }
    return p ? { x: p.x, y: p.y, icon: ic, id: i.id } : null;
  }

  /** the hint arrow's target: the focus mission's, or (nothing to do there) the nearest request bubble */
  focusTarget() {
    const t = this.targetOf(this.model.focus());
    if (t) return t;
    const ch = this.ports.chief, cx = ch.x(), cy = ch.y();
    let best = null, bd = 1e12;
    for (const i of this.model.bubbles()) {
      const p = i.gv && this.ports.people.pos(i.gv);
      if (!p) continue;
      const d = Math.hypot(p.x - cx, p.y - cy);
      if (d < bd) { bd = d; best = { x: p.x, y: p.y, icon: 'ui_icon_request', id: i.id }; }
    }
    return best;
  }

  accept(id) {
    const r = this.model.accept(id);
    if (!r.ok && r.why === 'full') this.ports.ui.toast(mt(this.lang(), 'm_full'), 1800);
    return r.ok;
  }
  declined(id) { this.putOff.add(id); }

  /** a tap in the world (ModuleHost routes it here before VillageLife / Neighbours): a bubble opens its card */
  tap(wx, wy) {
    if (!this.bubbles || !this.card || this.panelOpen()) return false;
    const id = this.bubbles.hit(wx, wy);
    if (!id) return false;
    this.card.show(id, 'tap');
    return true;
  }

  // ------------------------------------------------------------------------------------------------ chief actions
  /** set off on a drive mission (the yard pad or the card's 출발 button): true when the vehicles module took it */
  startDrive(id) {
    const m = this.model, i = m.get(id), lang = this.lang();
    if (!i || (i.s !== 'a' && i.s !== 'b')) return false;
    const c = this.current(i);
    if (!c || c.u.how !== 'drive') return false;
    const v = this.later('vehicles');
    if (!v || typeof v.drive !== 'function') { this.toast(mt(lang, 'm_drive_cant'), 1600); return false; }
    if (this.driving || (v.chiefDriving && v.chiefDriving())) { this.toast(mt(lang, 'm_drive_busy'), 1400); return false; }
    const o = c.u.o || {}, T = this.ports.clock.T();
    const spec = { tpl: i.c, mid: i.id, vehicle: o.vehicle, route: o.route, cargo: o.cargo || null, capSpeed: o.capSpeed || 1, deadline: i.d ? Math.max(0, Math.round(i.d - T)) : 0 };
    let p;
    try { p = v.drive(spec); } catch (e) { p = null; }
    if (!p || typeof p.then !== 'function') { this.toast(mt(lang, 'm_drive_cant'), 1600); return false; }
    this.driving = i.id;
    this.ports.sound.play('sfx_unlock', { volume: 0.5 });
    p.then((r) => {
      if (this.driving === i.id) this.driving = 0;
      // (the feed's veh:driveDone usually came first; a second step is a no-op)
      if (r && r.stars > 0 && m.get(i.id)) m.step(i.id, 'drive', 1, { stars: r.stars });
      else if (r && r.reason) this.toast(mt(this.lang(), 'm_drive_cant'), 1600);
    }, () => { if (this.driving === i.id) this.driving = 0; });
    return true;
  }

  /** C12: the chief funds the fireworks (minutes × current income, at least the floor) */
  fund(id) {
    const m = this.model, i = m.get(id), lang = this.lang();
    if (!i) return false;
    const c = this.current(i);
    if (!c || c.u.how !== 'pay') return false;
    const cost = this.fundCost(i);
    const P = this.ports;
    if (P.coins.value() < cost) { P.ui.toast(mt(lang, 'm_pay_short', { n: cost }), 1600); P.sound.play('sfx_error', { volume: 0.4 }); return false; }
    P.coins.spend(cost);
    P.sound.play('sfx_coin_count', { volume: 0.5 });
    this.toast(mt(lang, 'm_paid'), 1600);
    m.step(id, 'pay', 1);
    return true;
  }
  fundCost(i) {
    const c = this.current(i), mins = (c && c.u.o && c.u.o.minutes) || 2;
    return Math.max(this.cfg.payFloor * this.model.era(), round10(mins * Math.max(0, Number(this.ports.income.perMin()) || 0)));
  }

  // ------------------------------------------------------------------------------------------------ every frame
  update(dt) {
    const m = this.model;
    m.tick();
    this.world(dt);
    for (const e of m.drain()) this.apply(e);
    if (this.views) {
      this.bubbles.update(dt); this.chip.update(dt); this.fameChip.update(dt); this.panel.update(dt);
      this.card.update(dt); this.edge.update(dt); this.pads.update(dt); this.followers.update(dt);
    }
  }

  /** the chief in the world: accept by walking up, hand-offs, standing / finding / leading / escorting / carrying */
  world(dt) {
    const P = this.ports, m = this.model, ch = P.chief, T = P.clock.T();
    const cx = ch.x(), cy = ch.y(), moving = !!ch.moving(), still = !moving;
    if (moving) this.lastMoveT = T;
    // walking up to a bubble's giver and stopping opens its card — not while the chief works on a v4 pad, not for a
    // bubble he put off (나중에), and not when the giver walks past a chief who stands still (critique M-4)
    if (this.card && !this.card.isOpen() && !this.panelOpen()) {
      let near = null, nd = this.cfg.acceptRange;
      for (const i of m.bubbles()) {
        if (this.putOff.has(i.id)) continue;
        const p = i.gv && P.people.pos(i.gv);
        if (!p) continue;
        const d = Math.hypot(p.x - cx, p.y - cy);
        if (d < nd) { nd = d; near = i; }
      }
      const onPad = !!(ch.onPad && ch.onPad());
      if (near && still && !onPad) {
        if (this.near.id !== near.id) this.near = { id: near.id, t: 0, ok: T - this.lastMoveT < 1.2 };
        this.near.t += dt;
        if (this.near.ok && this.near.t >= this.cfg.acceptStill) { this.card.show(near.id, 'near'); this.near.ok = false; }
      } else this.near = { id: 0, t: 0, ok: false };
    }
    for (const id of this.putOff) if (!m.get(id)) this.putOff.delete(id);
    // hand-offs and steps of everything the chief is working on
    for (const i of m.list.slice()) {
      if (i.s !== 'a' && i.s !== 'b') continue;
      if (!m.get(i.id)) continue;
      const t = m.template(i), c = this.current(i);
      if (!c) continue;
      const u = c.u;
      if (c.U.some((x, k) => x.t === 'deliver' && i.g[k] < x.need)) this.handOff(i, t, c.U, cx, cy, T);
      if (u.t !== 'step') continue;
      switch (u.how) {
        case 'stand': case 'speech': {
          const p = this.standSpot(i, c);
          if (!p) break;
          if (Math.hypot(p.x - cx, p.y - cy) < NEAR_PLACE && still) {
            if (this.stand.id !== i.id || this.stand.x !== p.x) this.stand = { id: i.id, t: 0, x: p.x, y: p.y, need: Math.max(0.5, u.secs || 1) };
            this.stand.t += dt;
            if (this.stand.t >= this.stand.need) {
              this.stand = { id: 0, t: 0 };
              if (m.step(i.id, u.how, 1) > 0) {
                P.sound.play('sfx_pickup', { volume: 0.6 });
                if (u.o && u.o.carry) { if (ch.flyIn) ch.flyIn(u.o.carry, p.x, p.y - 40); this.toast(mt(this.lang(), 'm_fish_got'), 1800); }
              }
            }
          } else if (this.stand.id === i.id) this.stand = { id: 0, t: 0 };
          break;
        }
        case 'find': {
          let f = this.finds.get(i.id);
          if (!f) {
            const p = P.places.findSpot ? P.places.findSpot(u.what, i.gv ? P.people.pos(i.gv) : { x: cx, y: cy }, i.id) : null;
            if (!p) break;
            f = { x: p.x, y: p.y };
            this.finds.set(i.id, f);
            if (this.pads) this.pads.sparkle(i.id, f.x, f.y, u.what);
          }
          if (Math.hypot(f.x - cx, f.y - cy) < 60) {
            this.finds.delete(i.id);
            if (this.pads) this.pads.unsparkle(i.id, true);
            if (m.step(i.id, 'find', 1) > 0) {
              P.sound.play('sfx_unlock', { volume: 0.6 });
              const next = this.current(i);
              // a found animal trots behind the chief until it is home
              if (next && next.u.how === 'lead' && (u.what === 'puppy' || u.what === 'penguin')) {
                this.leads.set(i.id, u.what);
                if (this.followers) this.followers.add(i.id, u.what, f.x, f.y, u.what === 'penguin' ? 'pet:pet_penguin' : null);
                this.toast(mt(this.lang(), u.what === 'puppy' ? 'm_found_puppy' : 'm_found_penguin'), 2200);
              } else this.toast(mt(this.lang(), 'm_found'), 1200);
            }
          }
          break;
        }
        case 'return': {
          const p = i.gv && P.people.pos(i.gv);
          if (p && Math.hypot(p.x - cx, p.y - cy) < NEAR) m.step(i.id, 'return', 1);
          break;
        }
        case 'lead': {
          const p = this.leadDest(i, c);
          if (this.followers && !this.followers.has(i.id) && this.leads.has(i.id)) this.followers.add(i.id, this.leads.get(i.id), cx, cy);
          if (this.followers && !this.followers.has(i.id) && !this.leads.has(i.id)) {
            // (a reload after the find: the animal is with the chief again)
            const kind = (c.U.find((x) => x.how === 'find') || {}).what || 'puppy';
            this.leads.set(i.id, kind); this.followers.add(i.id, kind, cx, cy, kind === 'penguin' ? 'pet:pet_penguin' : null);
          }
          if (p && Math.hypot(p.x - cx, p.y - cy) < (u.to ? NEAR_PLACE : NEAR) && m.step(i.id, 'lead', 1) > 0) {
            const kind = this.leads.get(i.id);
            this.leads.delete(i.id);
            if (this.followers) this.followers.home(i.id, p.x, p.y);
            P.sound.play('sfx_cheer', { volume: 0.5 });
            this.toast(mt(this.lang(), kind === 'penguin' ? 'm_home_penguin' : 'm_home_puppy'), 1800);
          }
          break;
        }
        case 'escort': this.escort(i, c, cx, cy, dt); break;
        case 'carry': this.carry(i, c, cx, cy, still, dt); break;
        case 'identify': {
          const p = i.nm && P.people.pos(i.nm);
          if (p && still && Math.hypot(p.x - cx, p.y - cy) < NEAR) {
            const e = this.esc.get(i.id) || { met: false, t: 0 };
            e.t += dt; this.esc.set(i.id, e);
            if (e.t >= 1 && m.identify(i.nm)) { this.esc.delete(i.id); this.toast(mt(this.lang(), 'm_identify'), 1800); P.sound.play('sfx_unlock', { volume: 0.6 }); }
          }
          break;
        }
        default: break;     // drive (pads / button), pay (button), ask (talking), contract / choose / tap (other modules)
      }
    }
    // an escort / lead / carry that ended (done, expired, swapped away) lets go of its people and props
    for (const id of Array.from(this.esc.keys())) if (!m.get(id)) this.endEscort(id);
    for (const id of Array.from(this.carrying.keys())) if (!m.get(id)) this.carrying.delete(id);
    for (const id of Array.from(this.finds.keys())) { const i = m.get(id); if (!i || i.s === 'p') { this.finds.delete(id); if (this.pads) this.pads.unsparkle(id, false); } }
    for (const id of Array.from(this.handT.keys())) if (!m.get(id)) this.handT.delete(id);
    for (const id of Array.from(this.leads.keys())) { const i = m.get(id); if (!i || i.s === 'p') { this.leads.delete(id); if (this.followers) this.followers.remove(id); } }
  }

  /** escort: meet the person (they follow the chief), then reach the place together; without a known place, walk
   *  together for a little while (the person's wish is shown on the chip) */
  escort(i, c, cx, cy, dt) {
    const P = this.ports, m = this.model;
    // an elder's wishes (C7) come one at a time from the story: between two wishes there is nothing to do
    if (m.template(i).stages && !i.wi) return;
    const who = i.nm || i.gv || i.w;
    const pp = who && P.people.pos(who);
    let e = this.esc.get(i.id);
    if (!e) { e = { met: false, t: 0, who }; this.esc.set(i.id, e); }
    if (!e.met) {
      if (pp && Math.hypot(pp.x - cx, pp.y - cy) < this.cfg.escort.near) {
        e.met = true;
        if (P.people.follow) P.people.follow(who, true);
        if (P.say) P.say(who, mt(this.lang(), 'm_esc_hello'), 'emote_heart', 2.4);
        P.sound.play('sfx_customer_happy', { volume: 0.5 });
      }
      return;
    }
    const dest = this.escortDest(i, c);
    if (dest) {
      if (Math.hypot(dest.x - cx, dest.y - cy) < NEAR_PLACE && m.step(i.id, 'escort', 1) > 0) this.afterEscort(i);
    } else {
      // no place to go to: walking together with the person close by counts
      if (pp && Math.hypot(pp.x - cx, pp.y - cy) < 260) e.t += dt;
      if (e.t >= this.cfg.escort.along && m.step(i.id, 'escort', 1) > 0) this.afterEscort(i);
    }
  }
  afterEscort(i) {
    this.endEscort(i.id);
    this.ports.sound.play('sfx_cheer', { volume: 0.5 });
    // C7: the next wish waits for the story; the elder goes back to their day
  }
  endEscort(id) {
    const e = this.esc.get(id);
    this.esc.delete(id);
    if (e && e.met && e.who && this.ports.people.follow) this.ports.people.follow(e.who, false);
  }

  /** carry: pick up at the giver (a box on the chief's head), put down at the new home (or the doorstep) */
  carry(i, c, cx, cy, still, dt) {
    const P = this.ports, m = this.model;
    let k = this.carrying.get(i.id);
    if (!k) { k = { has: false, t: 0 }; this.carrying.set(i.id, k); }
    const at = k.has ? this.carryDest(i) : (i.gv ? P.people.pos(i.gv) : null);
    if (!at || !still || Math.hypot(at.x - cx, at.y - cy) > (k.has ? NEAR_PLACE : NEAR)) { k.t = 0; return; }
    k.t += dt;
    if (k.t < 0.6) return;
    k.t = 0;
    if (!k.has) { k.has = true; if (P.chief.flyIn) P.chief.flyIn('ui_icon_box', at.x, at.y - 40); this.toast(mt(this.lang(), 'm_carry_pick'), 1000); P.sound.play('sfx_pickup', { volume: 0.5 }); }
    else { k.has = false; if (P.chief.flyBag) P.chief.flyBag('ui_icon_box', 1, at.x, at.y - 30); m.step(i.id, 'carry', 1); P.sound.play('sfx_drop', { volume: 0.5 }); }
  }

  /** the chief near the recipient with what they want: the items go over (a few at a time) */
  handOff(i, t, U, cx, cy, T) {
    const P = this.ports, m = this.model;
    if ((this.handT.get(i.id) || 0) > T) return;
    for (let j = 0; j < U.length; j++) {
      const u = U[j];
      if (u.t !== 'deliver' || i.g[j] >= u.need) continue;
      const to = u.to === 'giver' ? i.gv : (u.to && u.to.startsWith('p:') ? u.to : i.w);
      const p = to ? (to.startsWith('p:') ? P.places.pos(to) : P.people.pos(to)) : null;
      if (!p) continue;
      if (Math.hypot(p.x - cx, p.y - cy) > (to.startsWith('p:') ? NEAR_PLACE : NEAR)) continue;
      const items = u.item ? [u.item] : u.any;
      for (const it of items) {
        const left = u.need - i.g[j];
        if (left <= 0) break;
        let k = 0;
        if (it in m.bag) { k = Math.min(left, m.bag[it]); if (k > 0) { if (P.chief.flyBag) P.chief.flyBag(it, k, p.x, p.y - 50); m.delivered(i.id, it, k); } }
        else {
          const have = P.chief.count(it);
          k = Math.min(left, have, 5);
          if (k > 0) { const took = P.chief.take(it, k, p.x, p.y - 50); if (took > 0) m.delivered(i.id, it, took); }
        }
        if (k > 0) { this.handT.set(i.id, T + 0.35); return; }
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ model events
  apply(e) {
    const P = this.ports, m = this.model, lang = this.lang();
    const toast = (s, hold) => this.toast(s, hold);
    const pay = (coins, at) => { if (coins > 0) P.coins.add(coins, at ? at.x : P.chief.x(), at ? at.y - 60 : P.chief.y() - 60, true, 'mission'); };
    const posOf = (pid) => (pid ? (pid.startsWith('p:') ? P.places.pos(pid) : P.people.pos(pid)) : null);
    const target = (ev) => { const who = ev.w && !ev.w.startsWith('p:') ? ev.w : ev.nm || ev.gv; return who ? { ko: P.people.name(who, 'ko'), en: P.people.name(who, 'en') } : null; };
    let out = e;
    switch (e.t) {
      case 'mission:offer': {
        const t = m.template({ c: e.code });
        if (e.s === 'a') { toast(mt(lang, 'm_new_event') + ' ' + titleOf(t, lang, this.namesOf(m.get(e.id) || {})), 2200); P.sound.play('sfx_whoosh', { volume: 0.4 }); }
        if (this.chip) this.chip.nudge();
        // the fire drill card is live at once (board cards are not accepted): incidents stages its drill scene
        if (e.code === 'C14' && P.emit) P.emit({ t: 'mission:accept', id: e.id, code: 'C14', at: P.places.pos('p:hydrant') || null });
        break;
      }
      case 'mission:accept': {
        const i = m.get(e.id), t = m.template({ c: e.code });
        if (i && i.gv && t.say && t.say.offer) {
          const line = i.gv === i.nm && t.say.offerSelf ? t.say.offerSelf : t.say.offer;
          P.say(i.gv, fill(line[lang] || line.ko, this.namesOf(i)), t.emote || 'emote_heart', 3.2);
        }
        P.sound.play('sfx_unlock', { volume: 0.5 });
        if (this.chip) this.chip.nudge();
        break;
      }
      case 'mission:progress': if (this.chip) this.chip.nudge(); break;
      case 'mission:done': {
        const t = m.template({ c: e.code });
        const who = e.w && !e.w.startsWith('p:') ? e.w : e.gv;
        const at = posOf(e.w) || posOf(e.gv);
        pay(e.coins, at);
        if (who) {
          const names = this.namesOf({ gv: e.gv, w: e.w, nm: e.nm });
          if (t.say && t.say.thanks) P.say(who, fill(t.say.thanks[lang] || t.say.thanks.ko, names), t.emote || 'emote_heart', 3);
          P.people.react && P.people.react(who, 'happy', t.emote || 'emote_heart');
        }
        if (this.stamp) this.stamp.push({ icon: t.icon && !/^item_/.test(t.icon) ? t.icon : 'ui_icon_mission', head: t.kind === 'request' ? mt(lang, 'm_req_done') : mt(lang, 'm_done'), title: titleOf(t, lang, this.namesOf({ gv: e.gv, w: e.w, nm: e.nm })), coins: e.coins, fame: e.fame, stars: t.kind === 'drive' ? e.stars : 0 });
        out = Object.assign({}, e, { target: target(e) });          // (story: "the chief helped …")
        break;
      }
      case 'mission:stage': {
        pay(e.coins, posOf(e.gv) || posOf(e.nm));
        if (this.stamp) this.stamp.push({ icon: 'ui_icon_heart_pair', title: titleOf(m.template({ c: e.code }), lang, this.namesOf(e)), coins: e.coins, fame: e.fame });
        if (e.nm) P.people.react && P.people.react(e.nm, 'happy', 'emote_heart');
        // C7: each wish closes the story's wish card (story_runtime listens to mission:done { wish, who: engine id })
        const sid = typeof e.key === 'string' && /^s\d+$/.test(e.key) ? Number(e.key.slice(1)) : null;
        if (e.wi && P.emit) P.emit({ t: 'mission:done', id: e.id, code: e.code, stage: e.stage, wish: e.wi, who: sid, key: e.key, target: target(e) });
        break;
      }
      case 'mission:expire': {
        if (e.why === 'pop' || e.why === 'stale') break;
        const t = m.template({ c: e.code });
        if (t && !t.optional) toast(mt(lang, e.why === 'late' ? 'm_expired' : 'm_gone', { title: titleOf(t, lang, this.namesOf(e)) }), 2200);
        break;
      }
      case 'mission:flag': if (P.progress && P.progress.setFlag) P.progress.setFlag(e.flag); break;
      case 'daily:done': pay(e.coins); if (this.stamp) this.stamp.push({ icon: 'ui_icon_calendar', head: mt(lang, 'm_daily_done'), title: titleOf(m.template({ c: e.code }), lang, {}), coins: e.coins, fame: e.fame }); break;
      case 'daily:all': pay(e.coins); if (this.stamp) this.stamp.push({ icon: 'ui_icon_calendar', head: mt(lang, 'm_daily_all_done'), title: '', coins: e.coins, fame: e.fame, sound: 'sfx_fame_up' }); break;
      case 'streak:day': if (e.coins) pay(e.coins); if (e.n > 1) toast(mt(lang, 'm_streak', { n: e.n }), 1800); break;
      case 'weekly:stage': pay(e.coins); if (this.stamp) this.stamp.push({ icon: 'ui_icon_calendar', head: mt(lang, e.stage >= 3 ? 'm_week_done' : 'm_week_stage', { s: e.stage }), title: titleOf(m.template({ c: e.c }), lang, {}), coins: e.coins, fame: e.fame }); break;
      case 'combo': if (e.start) toast(mt(lang, 'm_combo'), 1800); break;
      case 'fame:pts': if (this.fameChip) this.fameChip.bump(); break;
      case 'fame:title': {
        const sub = e.level > 1 ? mt(lang, 'tr_' + e.level) : '';
        if (this.banner) this.banner.show(e.level, sub);
        break;
      }
      case 'reward':
        if (e.kind === 'decor' && P.rewards) P.rewards.decor(e.key, e.why);
        else if (e.kind === 'voucher' && P.rewards) P.rewards.voucher(e.key, e.why);
        else if (e.kind === 'effect' && P.rewards) P.rewards.effect(e.key, e.why);
        else if (e.kind === 'flair') toast(mt(lang, e.key === 'crown' ? 'm_crown' : 'm_driver'), 2000);
        break;
      case 'bag': if (e.add > 0) toast(mt(lang, 'i_' + e.item) + ' ' + e.n, 1200); break;
      default: break;
    }
    if (P.emit) P.emit(out);
  }

  // ------------------------------------------------------------------------------------------------ module surface
  onFeed(ev) {
    if (ev && ev.t === 'story:wish' && Number.isInteger(ev.who)) {
      this.wishText.set('s' + ev.who, { ko: ev.ko || '', en: ev.en || '' });
      if (this.wishText.size > 8) this.wishText.delete(this.wishText.keys().next().value);
    }
    if (ev && (ev.t === 'veh:driveDone' || (ev.t === 'veh:drive' && ev.op === 'abort')) && ev.mid === this.driving) this.driving = 0;
    this.model.onFeed(ev);
  }
  /** an elder's wish text for the chip / panel ('' when the story has not told it in this session) */
  wishOf(i) { const w = i && i.k ? this.wishText.get(i.k) : null; return w ? (this.lang() === 'en' ? w.en : w.ko) : ''; }

  serialize() {
    if (this.pads) this.pads.saveState();
    return fitCap(this.model.serialize());
  }
  state() { return { board: this.model.board().length, active: this.model.active().length, bubbles: this.model.bubbles().length, fame: this.model.fameInfo(), today: this.model.today(), week: this.model.week(), driving: this.driving }; }

  makeApi() {
    const m = this.model;
    return {
      boardLines: () => this.boardLines(),
      active: () => m.active().concat(m.board()).map((i) => ({ id: i.id, code: i.c, f: m.fraction(i), due: i.d })),
      focus: () => { const i = m.focus(); return i ? { id: i.id, code: i.c, f: m.fraction(i) } : null; },
      focusTarget: () => this.focusTarget(),
      offer: (spec) => { const i = m.spawnEvent(spec && spec.code, spec || {}); return i ? i.id : 0; },
      fame: () => { const f = m.fameInfo(); return { pts: f.pts, title: f.title, next: f.next }; },
      open: (tab) => this.open(tab),
      /** the label of the hall board's button (P13) */
      hallButton: () => mt(this.lang(), 'm_hall_btn'),
      chipShown: () => !!(this.chip && this.chip.c.visible),
      bag: () => Object.assign({}, m.bag),
      startDrive: (id) => this.startDrive(id),
      // another module reports a step it owns (beach choose / tap / stand, harbour contract, story speech …):
      // { how, code?, who?, n?, stars? } → true when an active mission took it
      report: (spec) => {
        if (!spec || !spec.how) return false;
        const hit = m.list.find((i) => (i.s === 'a' || i.s === 'b') && (!spec.code || i.c === spec.code) && (!spec.who || i.nm === spec.who || i.gv === spec.who || i.w === spec.who)
          && unitsOf(m.template(i)).some((u, k) => u.t === 'step' && u.how === spec.how && i.g[k] < u.need));
        return hit ? m.step(hit.id, spec.how, spec.n || 1, spec) > 0 : false;
      },
    };
  }

  /** the town hall board (P13): [{ icon, text }] lines of the missions in progress */
  boardLines() {
    const m = this.model, lang = this.lang(), out = [];
    for (const i of m.active().concat(m.board())) {
      const t = m.template(i);
      out.push({ icon: t.icon, text: titleOf(t, lang, this.namesOf(i)) + '  ' + Math.round(m.fraction(i) * 100) + '%' });
    }
    return out;
  }

  /** display objects (budget) */
  objects() { return (this.bubbles ? this.bubbles.count() : 0) + (this.followers ? this.followers.count() : 0); }

  destroy() {
    for (const id of Array.from(this.esc.keys())) this.endEscort(id);
    if (!this.views) return;
    for (const v of [this.chip, this.fameChip, this.panel, this.bubbles, this.card, this.stamp, this.banner, this.edge, this.pads, this.followers]) if (v) v.destroy();
  }
}
