// MissionsHost — the missions module in the game: the pure model + its views + the hand-offs in the world, all
// through the Ports facade (docs/v5_v8_plan.md §5.3; the lab's FakePorts implements the same surface).
//   - accepting: tap a bubble, or stand still within 90 px of its giver for 0.5 s → the 받기 / 나중에 card
//   - delivering: walk to the recipient (or place) carrying what they want → the items fly over, they cheer
//   - standing steps (help with the snowman, the reporter, the festival statues …): stand at the spot
//   - finding (the lost mitten, the puppy …): a sparkle appears nearby; walk to it, then back to the giver
//   - mission items: 꽃밭 picking, the bakery's cake and the gift-wrap pad put them in the bag (craft pads)
// The host applies the model's events: coins (as module payouts, so the income meter ignores them), toasts, sounds,
// the chip / panel / bubbles / title banner, and the rewards (decor placed by the game through ports.rewards).

import { MissionModel } from './model/missions.js';
import { missionsTuning } from './tuning.js';
import { fitCap } from './save.js';
import { mt, titleOf, fmtN } from './strings.js';
import { unitsOf } from './model/units.js';
import { MissionChip, FameChip } from './view/Chips.js';
import { MissionPanel } from './view/MissionPanel.js';
import { RequestBubbles } from './view/RequestBubbles.js';
import { AcceptCard, DoneStamp, TitleBanner, EdgeMarker, fill } from './view/Overlays.js';
import { CraftPads } from './view/CraftPads.js';

const NEAR = 82, NEAR_PLACE = 110;

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
      has: (c) => P.facts.has(c), count: (k) => P.facts.count(k), income: () => P.income.perMin(),
      wall: () => (P.clock.wall ? P.clock.wall() : Date.now()), uptime: () => (P.clock.uptime ? P.clock.uptime() : 0),
      localDate: () => P.clock.localDate(),
      people: { pick: (r, c) => P.people.pick(r, c), has: (p) => P.people.has(p), onScreen: (p) => P.people.onScreen(p) },
    };
    this.model = new MissionModel(this.cfg, this.env, saved, { seed: opts.seed });
    this.near = { id: 0, t: 0 };
    this.declinedAt = new Map();     // bubble id → T it was put off (the card does not pop again for a while)
    this.handT = new Map();          // mission id → next hand-off time
    this.stand = { id: 0, t: 0 };
    this.finds = new Map();          // mission id → { x, y, found }
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
    }
    this.api = this.makeApi();
  }

  lang() { return this.ports.lang ? this.ports.lang() : 'ko'; }
  chipsVisible() { return !(this.ports.ui && this.ports.ui.overview && this.ports.ui.overview()); }
  panelOpen() { return !!(this.panel && this.panel.isOpen()); }
  toastsOn() { const s = this.ports.settings && this.ports.settings.get('missionToasts'); return s !== false; }
  open(tab) { if (this.panel) this.panel.open(tab); }
  fameTarget() { return this.fameChip ? this.fameChip.target() : null; }
  onBadgeLanded() { if (this.fameChip) this.fameChip.bump(); }

  /** display names for {name} / {to} / {from} */
  namesOf(i) {
    const lang = this.lang(), ppl = this.ports.people;
    const nm = (pid) => (pid && !pid.startsWith('p:') ? ppl.name(pid, lang) : pid ? (this.ports.places.name ? this.ports.places.name(pid, lang) : '') : '');
    return { name: nm(i.nm || i.w), to: nm(i.w), from: nm(i.gv) };
  }

  /** where a mission sends the chief now: { x, y, label, icon } or null */
  targetOf(i) {
    if (!i) return null;
    const m = this.model, t = m.template(i), U = unitsOf(t);
    const j = U.findIndex((u, k) => i.g[k] < u.need);
    if (j < 0) return null;
    const u = U[j];
    const pos = (id) => (!id ? null : id.startsWith('p:') ? this.ports.places.pos(id) : this.ports.people.pos(id));
    let p = null, ic = t.icon;
    if (u.t === 'deliver') {
      const items = u.item ? [u.item] : u.any;
      const hasAny = items.some((k) => (k in m.bag ? m.bag[k] > 0 : this.ports.chief.count(k) > 0));
      ic = items[0];
      if (hasAny) p = pos(u.to === 'giver' ? i.gv : (u.to && u.to.startsWith('p:') ? u.to : i.w));
      else p = this.pads ? this.pads.sourceOf(items[0]) : null;
      if (!p && !hasAny && this.ports.places.sourceOf) p = this.ports.places.sourceOf(items[0]);
    } else if (u.t === 'step') {
      if (u.how === 'find') { const f = this.finds.get(i.id); p = f ? { x: f.x, y: f.y } : null; }
      else if (u.how === 'return' || u.how === 'lead') p = pos(i.gv);
      else if (u.at) p = pos(u.at);
    }
    return p ? { x: p.x, y: p.y, icon: ic, id: i.id } : null;
  }
  focusTarget() { return this.targetOf(this.model.focus()); }

  accept(id) {
    const r = this.model.accept(id);
    if (!r.ok && r.why === 'full') this.ports.ui.toast(mt(this.lang(), 'm_full'), 1800);
    return r.ok;
  }
  declined(id) { this.declinedAt.set(id, this.ports.clock.T()); }

  /** a tap in the world (ModuleHost routes it here before VillageLife / Neighbours): a bubble opens its card */
  tap(wx, wy) {
    if (!this.bubbles || !this.card || this.panelOpen()) return false;
    const id = this.bubbles.hit(wx, wy);
    if (!id) return false;
    this.card.show(id, 'tap');
    return true;
  }

  // ------------------------------------------------------------------------------------------------ every frame
  update(dt) {
    const m = this.model;
    m.tick();
    this.world(dt);
    for (const e of m.drain()) this.apply(e);
    if (this.views) {
      this.bubbles.update(dt); this.chip.update(dt); this.fameChip.update(dt); this.panel.update(dt);
      this.card.update(dt); this.edge.update(dt); this.pads.update(dt);
    }
  }

  /** the chief in the world: accept by standing near, hand-offs, standing steps, finding */
  world(dt) {
    const P = this.ports, m = this.model, ch = P.chief, T = P.clock.T();
    const cx = ch.x(), cy = ch.y(), still = !ch.moving();
    // standing near a bubble's giver opens its card
    if (this.card && !this.card.isOpen() && !this.panelOpen()) {
      let near = null, nd = this.cfg.acceptRange;
      for (const i of m.bubbles()) {
        const p = i.gv && P.people.pos(i.gv);
        if (!p) continue;
        const d = Math.hypot(p.x - cx, p.y - cy);
        const dec = this.declinedAt.get(i.id);
        if (d < nd && !(dec && T - dec < 20)) { nd = d; near = i; }
      }
      if (near && still) {
        if (this.near.id !== near.id) this.near = { id: near.id, t: 0 };
        this.near.t += dt;
        if (this.near.t >= this.cfg.acceptStill) this.card.show(near.id, 'near');
      } else this.near = { id: 0, t: 0 };
    }
    // hand-offs and steps of everything the chief is working on
    for (const i of m.list) {
      if (i.s !== 'a' && i.s !== 'b') continue;
      const t = m.template(i), U = unitsOf(t);
      const j = U.findIndex((u, k) => i.g[k] < u.need);
      if (j < 0) continue;
      const u = U[j];
      if (U.some((x, k) => x.t === 'deliver' && i.g[k] < x.need)) this.handOff(i, t, U, cx, cy, T);
      if (u.t !== 'step') continue;
      if (u.how === 'stand' || u.how === 'speech') {
        const p = u.at ? P.places.pos(u.at) : null;
        if (!p) continue;
        if (Math.hypot(p.x - cx, p.y - cy) < NEAR_PLACE && still) {
          if (this.stand.id !== i.id) this.stand = { id: i.id, t: 0, x: p.x, y: p.y, need: Math.max(0.5, u.secs || 1) };
          this.stand.t += dt;
          if (this.stand.t >= this.stand.need) { this.stand = { id: 0, t: 0 }; m.step(i.id, u.how, 1); P.sound.play('sfx_pop', { volume: 0.6 }); }
        } else if (this.stand.id === i.id) this.stand = { id: 0, t: 0 };
      } else if (u.how === 'find') {
        let f = this.finds.get(i.id);
        if (!f) {
          const p = P.places.findSpot ? P.places.findSpot(u.what, i.gv ? P.people.pos(i.gv) : { x: cx, y: cy }, i.id) : null;
          if (!p) continue;
          f = { x: p.x, y: p.y };
          this.finds.set(i.id, f);
          if (this.pads) this.pads.sparkle(i.id, f.x, f.y, u.what);
        }
        if (Math.hypot(f.x - cx, f.y - cy) < 60) { this.finds.delete(i.id); if (this.pads) this.pads.unsparkle(i.id, true); m.step(i.id, 'find', 1); P.sound.play('sfx_unlock', { volume: 0.6 }); }
      } else if (u.how === 'return' || u.how === 'lead') {
        const p = i.gv && P.people.pos(i.gv);
        if (p && Math.hypot(p.x - cx, p.y - cy) < NEAR) m.step(i.id, u.how, 1);
      }
    }
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
    const toast = (s, hold) => { if (this.toastsOn()) P.ui.toast(s, hold); };
    const pay = (coins, at) => { if (coins > 0) P.coins.add(coins, at ? at.x : P.chief.x(), at ? at.y - 60 : P.chief.y() - 60, true, 'mission'); };
    const posOf = (pid) => (pid ? (pid.startsWith('p:') ? P.places.pos(pid) : P.people.pos(pid)) : null);
    switch (e.t) {
      case 'mission:offer': {
        const t = m.template({ c: e.code });
        if (e.s === 'a') { toast(mt(lang, 'm_new_event') + ' ' + titleOf(t, lang, this.namesOf(m.get(e.id) || {})), 2200); P.sound.play('sfx_pop', { volume: 0.5 }); }
        if (this.chip) this.chip.nudge();
        break;
      }
      case 'mission:accept': {
        const i = m.get(e.id), t = m.template({ c: e.code });
        if (i && i.gv && t.say && t.say.offer) P.say(i.gv, fill(t.say.offer[lang] || t.say.offer.ko, this.namesOf(i)), t.emote || 'emote_heart', 3.2);
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
        break;
      }
      case 'mission:stage': pay(e.coins, posOf(e.gv)); if (this.stamp) this.stamp.push({ icon: 'ui_icon_heart_pair', title: titleOf(m.template({ c: e.code }), lang, this.namesOf(e)), coins: e.coins, fame: e.fame }); break;
      case 'mission:expire': {
        if (e.why === 'pop') break;
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
      case 'bag': toast(mt(lang, 'i_' + e.item) + ' ' + e.n, 1200); break;
      default: break;
    }
    if (P.emit) P.emit(e);
  }

  // ------------------------------------------------------------------------------------------------ module surface
  onFeed(ev) { this.model.onFeed(ev); }
  serialize() { return fitCap(this.model.serialize()); }
  state() { return { board: this.model.board().length, active: this.model.active().length, bubbles: this.model.bubbles().length, fame: this.model.fameInfo(), today: this.model.today(), week: this.model.week() }; }

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
      bag: () => Object.assign({}, m.bag),
      // another module reports a step it owns (story escort / choose, vehicles drive, incidents identify / carry):
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
  objects() { return this.bubbles ? this.bubbles.count() : 0; }

  destroy() {
    if (!this.views) return;
    for (const v of [this.chip, this.fameChip, this.panel, this.bubbles, this.card, this.stamp, this.banner, this.edge, this.pads]) if (v) v.destroy();
  }
}
