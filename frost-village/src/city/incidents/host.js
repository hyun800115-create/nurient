// IncidentsHost (incidents_runtime, docs/v5_v8_plan.md §5.2 / §6.7): ports -> the pure model -> the Phaser view.
// Runs headless when no view class is given (Node tests): everything the game sees goes through `api` and events.
//
//   host = new IncidentsHost(ports, savedSlice, { View, tuning, seed, fallback })
//   host.update(dt) · host.onFeed(ev) · host.serialize() · host.api (gs.later.incidents) · host.destroy()
//
// Where incidents come from:
//   - the story engine (v8 integration): story:incident / story:build / story:wanted / story:move feed events; acks and
//     rates go back through ports.story.ack(id) / setRates(rates) / toggles({ incidents })
//   - a ScriptedSource (model/source.js) when the story does not run (opts.fallback: true) and for the designer previews
//     (도둑 추격, 불 끄기 …), which play on a throwaway copy: nothing they do is saved or reaches the game feed.

import { BALANCE } from '../../data/balance.js';
import { incidentsTuning, INCIDENTS_TUNING } from './tuning.js';
import { IncidentsModel } from './model/IncidentsModel.js';
import { ScriptedSource } from './model/source.js';
import { sanitizeIncidents, fitIncidents, INCIDENTS_SLICE } from './save.js';
import { it, itemName } from './strings.js';
import { POLICE, FIRE_STATION, FIRE_PAD, HYDRANT_SPOTS, WANTED_BOARD } from './layout.js';
import { bldOf } from './model/buildings.js';
import { dayOf } from './model/time.js';

const PREVIEW_ID = 90000;

export class IncidentsHost {
  constructor(ports, saved, opts = {}) {
    this.ports = ports || {};
    this.opts = opts;
    this.cfg = opts.tuning ? incidentsTuning({ v8: { incidents: opts.tuning } }) : incidentsTuning(opts.balance || BALANCE) || INCIDENTS_TUNING;
    const clean = sanitizeIncidents(saved);
    this.seed = opts.seed || 20261010;
    const on = this.ports.settings && this.ports.settings.get ? this.ports.settings.get('incidents') : undefined;
    this.model = new IncidentsModel({ tuning: this.cfg, saved: clean, seed: this.seed, T: this.T() });
    if (on === false && this.model.safety.on) this.model.toggle(false, this.T());
    this.source = opts.fallback ? new ScriptedSource({ seed: this.seed, roster: opts.roster || this.roster(), places: opts.places || this.places() }) : null;
    this.preview = null;            // { src, snap, ids } while a designer preview runs
    this.stageHeld = false;
    this.stats = { ms: 0, n: 0, msModel: 0 };
    this.lastDay = dayOf(this.T());
    this.env = this.makeEnv();
    this.view = opts.View && this.ports.world && this.ports.world.scene ? new opts.View(this, this.ports) : null;
    this.api = this.makeApi();
    this.offerSites();
    this.flush();
  }

  T() { return this.ports.clock && this.ports.clock.T ? this.ports.clock.T() : 0; }
  lang() { return this.ports.lang ? this.ports.lang() : 'ko'; }

  // ------------------------------------------------------------------------------------------ world lookups
  /** a story place / game building -> { x, y, key?, id } (null when the game does not know it) */
  pos(id) {
    if (!id) return null;
    const W = this.ports.world || {};
    const b = W.building ? W.building(bldOf(id)) : null;
    if (b) return b;
    const p = W.place ? W.place(id) : null;
    return p || null;
  }
  /** where an incident happens on screen (a fire: its building; the rest: the place) */
  venuePos(v) {
    if (!v) return null;
    if (v.kind === 'fire' || v.kind === 'window') return this.pos(v.building) || this.pos(v.place);
    if (v.kind === 'theft' && (v.phase === 'station' || v.phase === 'release')) return { x: POLICE.x, y: POLICE.y };
    return this.pos(v.place) || this.pos(v.building);
  }
  distToView(p) {
    const V = this.ports.view;
    const r = V && V.rect ? V.rect() : null;
    if (!p || !r) return Infinity;
    const dx = Math.max(0, r.x - p.x, p.x - (r.x + r.width)), dy = Math.max(0, r.y - p.y, p.y - (r.y + r.height));
    return Math.hypot(dx, dy);
  }

  makeEnv() {
    const host = this;
    return {
      inRange(v) { if (host.preview) return true; return host.distToView(host.venuePos(v)) <= host.cfg.stageRange; },
      far(v) { if (host.preview) return false; return host.distToView(host.venuePos(v)) > host.cfg.unstageRange; },
      slotFree() { const S = host.ports.stage; if (host.stageHeld) return false; if (!S) return true; if (S.free) return !!S.free('incident'); const c = S.ceremony ? S.ceremony() : null; if (c && (c.kind === 'wedding' || c.kind === 'farewell')) return false; if (S.busy) return !S.busy('incident'); return true; },   // (story StageDirector: busy(slot); never during a wedding / farewell)
      person(ref) { const P = host.ports.people; return P && P.person ? P.person(ref) : null; },
    };
  }

  // ------------------------------------------------------------------------------------------ sites (P29)
  offerSites() {
    const S = this.ports.sites, m = this.model;
    if (!S || !S.offer || this.offered) return;
    this.offered = true;
    const P = this.cfg.police;
    if (!m.police) S.offer({ id: POLICE.site, x: POLICE.x, y: POLICE.y, key: POLICE.key, cost: { coins: P.coins, item_plank: P.item_plank, item_ingot: P.item_ingot }, time: P.time, name: it(this.lang(), 'police') });
    const lv = m.safety.fireLevel;
    if (lv < 3) { const F = this.cfg.fireStation[lv + 1]; S.offer({ id: 'inc_fire' + (lv + 1), x: FIRE_PAD.x, y: FIRE_PAD.y, key: FIRE_STATION.key, cost: { coins: F.coins, item_plank: F.item_plank, item_ingot: F.item_ingot }, time: F.time, name: it(this.lang(), 'fireLevel', { n: lv + 1 }) }); }
    const have = new Set(m.safety.hydrants.map((h) => h[0] + ',' + h[1]));
    for (const h of HYDRANT_SPOTS) if (!have.has(h.x + ',' + h.y)) S.offer({ id: h.id, x: h.x, y: h.y, key: 'fire_hydrant', cost: { coins: this.cfg.hydrant.coins }, time: 2, name: it(this.lang(), 'hydrant'), small: true });
  }

  // ------------------------------------------------------------------------------------------ feed + frame
  onFeed(ev) {
    if (!ev || !ev.t) return;
    const T = this.T();
    if (ev.t === 'built' && /^inc_hydrant_/.test(String(ev.siteId || ev.key || ''))) {
      const spot = HYDRANT_SPOTS.find((h) => h.id === (ev.siteId || ev.key));
      if (spot && ev.x === undefined) ev = Object.assign({}, ev, { x: spot.x, y: spot.y });
    }
    // story_runtime's story:move names the people, not the house (lifeRules 'out' / the host's settlers 'in'): the
    // game knows where they live
    if (ev.t === 'story:move' && !ev.home && (ev.op === 'in' || ev.op === 'out')) {
      const p = this.env.person(typeof ev.whoPid === 'string' ? ev.whoPid : Array.isArray(ev.membersPid) && ev.membersPid[0] ? ev.membersPid[0] : ev.who);
      if (p && p.home) ev = Object.assign({}, ev, { home: p.home });
    }
    if (ev.t === 'veh:dispatch' && this.view) this.view.vehicleEvent(ev);
    if (ev.t === 'tap' && this.view && Number.isFinite(ev.x) && this.view.tap(ev.x, ev.y)) return;
    this.model.feed(ev, T, this.env);
    if (ev.t === 'built' && /^inc_fire[23]$/.test(String(ev.siteId || ev.key || '')) && this.ports.sites && this.ports.sites.offer && this.model.safety.fireLevel < 3) {
      const lv = this.model.safety.fireLevel + 1, F = this.cfg.fireStation[lv];
      this.ports.sites.offer({ id: 'inc_fire' + lv, x: FIRE_PAD.x, y: FIRE_PAD.y, key: FIRE_STATION.key, cost: { coins: F.coins, item_plank: F.item_plank, item_ingot: F.item_ingot }, time: F.time, name: it(this.lang(), 'fireLevel', { n: lv }) });
    }
    this.flush();
  }

  update(dt) {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const T = this.T();
    const src = this.preview ? this.preview.src : this.source;
    if (this.source && !this.preview && this.opts.plan !== false) {
      const d = dayOf(T);
      if (d !== this.lastDay) { this.lastDay = d; this.source.planDay(d, this.model.safety.rates(T), this.model.safety.happy); }
    }
    if (src) { src.update(T); for (const ev of src.drain()) this.model.feed(ev, T, this.env); }
    this.model.update(dt, T, this.env);
    this.flush();
    const t1 = typeof performance !== 'undefined' ? performance.now() : 0;
    if (this.view) this.view.update(dt);
    if (this.preview && !this.model.director.active().some((I) => I.id >= PREVIEW_ID) && !this.model.director.scene && T > this.preview.T0 + 1) this.endPreview();
    if (t0) { this.stats.msModel += t1 - t0; this.stats.ms += performance.now() - t0; this.stats.n++; }
  }

  /** model events -> the game feed + UI; commands -> story / source / view / residency */
  flush() {
    const { events, cmds } = this.model.drain();
    const P = this.ports;
    for (const c of cmds) this.command(c);
    for (const ev of events) {
      if (this.view) this.view.onModel(ev);
      this.ui(ev);
      if (ev.t === 'stage:open') this.holdStage(true, ev);
      else if (ev.t === 'stage:close') this.holdStage(false, ev);
      if (!this.preview && P.emit) P.emit(ev);
    }
  }

  holdStage(on, ev) {
    const S = this.ports.stage;
    this.stageHeld = on;
    if (S && S.request && on) S.request('incident', { venue: this.venuePos(this.model.director.get(ev.id) ? this.model.director.venue(this.model.director.get(ev.id)) : null) });
    if (S && S.end && !on) S.end('incident');
  }

  command(c) {
    const P = this.ports;
    const src = this.preview ? this.preview.src : this.source;
    switch (c.t) {
      case 'ack':
        if (src && (c.id >= PREVIEW_ID || !P.story || !P.story.ack)) src.ack(c.id);
        else if (P.story && P.story.ack) P.story.ack(c.id);
        return;
      case 'rates':
        if (this.preview) return;
        if (P.story && P.story.setRates) P.story.setRates({ incidentRate: c.rates.incidentRate, fireRate: c.rates.fireRate });
        if (P.story && P.story.toggles) P.story.toggles({ incidents: c.rates.incidents });
        this.rates = c.rates;
        return;
      case 'scene': if (this.view) this.view.sceneCmd(c); return;
      case 'tip': if (!this.preview && P.story && P.story.arrange) P.story.arrange('tip', { incident: c.id }); return;
      case 'art':
        // the view refcounts art groups (its persistent ruins / sites want them too); headless: straight to Residency
        if (this.view) this.view.art(c.op, c.art);
        else if (P.residency) { if (c.op === 'want' && P.residency.want) P.residency.want('incident:' + c.art); if (c.op === 'drop' && P.residency.drop) P.residency.drop('incident:' + c.art); }
        return;
      default: return;
    }
  }

  /** a few events become words on screen (toasts / cards / banners) */
  ui(ev) {
    const P = this.ports, lang = this.lang();
    const toast = (m) => { if (P.ui && P.ui.toast) P.ui.toast(m, 2600); };
    const card = (spec) => { if (P.ui && P.ui.card) P.ui.card(spec); else if (P.ui && P.ui.banner && spec.big) P.ui.banner(spec.text, spec.sub || ''); else toast(spec.text); };
    const placeName = (id) => (P.world && P.world.name ? P.world.name(bldOf(id), lang) : null) || (lang === 'en' ? 'house' : '집');
    const nameOf = (pid) => (pid && P.people && P.people.name ? P.people.name(pid, lang) : null);
    switch (ev.t) {
      case 'inc:stage':
        if (ev.kind === 'fire') toast(it(lang, 'fireToast', { place: placeName(ev.building) }));
        else if (ev.kind === 'theft') toast(it(lang, 'theftToast', { shop: placeName(ev.place) }));
        else if (ev.kind === 'scuffle') toast(it(lang, 'scuffleToast'));
        else if (ev.kind === 'queue') toast(it(lang, 'queueToast'));
        else if (ev.kind === 'window') toast(it(lang, 'windowToast'));
        return;
      case 'inc:fire':
        if (ev.op === 'ruin') card({ kind: 'fire', icon: 'ui_icon_insurance', text: it(lang, 'fireRuin', { place: placeName(ev.building) }) });
        else if (ev.op === 'scorched' && this.model.director.scene) toast(it(lang, 'fireOut'));
        else if (ev.op === 'rebuilt') card({ kind: 'rebuilt', icon: 'ui_icon_story', big: true, text: it(lang, ev.level > 0 ? 'rebuilt' : 'rebuiltSame', { place: placeName(ev.building) }) });
        return;
      case 'inc:wanted':
        if (ev.op === 'post') card({ kind: 'wanted', icon: 'ui_icon_wanted', text: it(lang, 'escaped'), pid: ev.pid, at: { x: WANTED_BOARD.x, y: WANTED_BOARD.y } });
        else if (ev.op === 'tip') toast(it(lang, 'tipped'));
        return;
      case 'inc:move': {
        if (ev.op !== 'in' && ev.op !== 'out') return;
        const nm = nameOf(ev.whoPid);
        const fam = nm ? it(lang, 'familyOf', { name: nm }) : it(lang, 'newFamily');
        if (ev.op === 'in') card({ kind: 'move', icon: 'ui_icon_move_in', text: it(lang, 'moveIn', { fam }), sub: it(lang, 'moveInSub'), pids: ev.membersPid });
        else card({ kind: 'move', icon: 'ui_icon_move_out', text: it(lang, 'moveOut', { fam }), sub: it(lang, 'moveOutSub'), pids: ev.membersPid });
        return;
      }
      case 'inc:police': card({ kind: 'police', icon: 'ui_icon_badge', big: true, text: it(lang, 'policeOpen') }); return;
      case 'inc:fireLevel': toast(it(lang, 'fireLevel', { n: ev.level })); return;
      case 'inc:hydrant': toast(it(lang, 'hydrantDone', { n: ev.n })); return;
      case 'inc:drill': toast(it(lang, 'drillDone')); return;
      default: return;
    }
  }

  // ------------------------------------------------------------------------------------------ previews (§5.8)
  /**
   * play one incident on a throwaway copy: { kind: 'theft'|'fire'|'queue'|'window'|'scuffle', outcome?, place?, building? }.
   * The model is restored from a snapshot afterwards; nothing reaches the game feed or the save.
   */
  startPreview(spec = {}) {
    if (this.preview) return 0;
    const T = this.T();
    const snap = this.model.serialize();
    const src = new ScriptedSource({ seed: this.seed + 17, roster: spec.roster || this.roster(), places: spec.places || this.places(), firstId: PREVIEW_ID });
    this.preview = { src, snap, T0: T, kind: spec.kind };
    this.model.director.clearStage(T);
    const id = src.start(spec.kind || 'fire', Object.assign({ T }, spec));
    this.preview.id = id;
    if (!id) { this.endPreview(); return 0; }
    for (const ev of src.drain()) this.model.feed(ev, T, this.env);
    this.flush();
    return id;
  }

  endPreview() {
    const p = this.preview;
    if (!p) return;
    this.model.director.clearStage(this.T());
    this.flush();
    this.preview = null;
    this.model = new IncidentsModel({ tuning: this.cfg, saved: sanitizeIncidents(p.snap), seed: this.seed, T: this.T() });
    this.model.drain();
    if (this.view) this.view.reset();
  }

  /** the people previews and the fallback cast from (ports.people.roster when the game has one) */
  roster() {
    const P = this.ports.people;
    if (P && P.roster) { const r = P.roster(); if (r && r.length) return r; }
    const out = [];
    const ages = [34, 31, 16, 9, 42, 38, 27, 24, 12, 8, 70, 66, 29, 45, 19, 11];
    ages.forEach((age, i) => out.push({ pid: 'x:' + (i + 1), sid: i + 1, age, hh: 'h' + (i >> 2), home: 'home_' + (i >> 2) }));
    return out;
  }
  places() { const P = this.ports.world; return (P && P.storyPlaces && P.storyPlaces()) || { shops: [], outdoor: [], homes: [], queues: [] }; }

  // ------------------------------------------------------------------------------------------ API
  makeApi() {
    const host = this;
    return {
      active() { return host.model.director.active().map((I) => ({ id: I.id, kind: I.kind, phase: I.phase, staged: I.staged, place: I.place, building: I.building })); },
      wanted() { return host.model.wanted.list(); },
      buildingState(id) { const r = host.model.buildings.get(id); return r ? { state: host.model.buildings.state(id), level: r.lv, since: r.t } : { state: 'ok', level: 0, since: 0 }; },
      safety() { return host.model.safety.percent(host.T()); },
      toggle(on) { const ch = host.model.toggle(!!on, host.T()); host.flush(); if (host.view) host.view.toggled(!!on); return ch; },
      on() { return host.model.safety.on; },
      rates() { return host.model.safety.rates(host.T()); },
      preview(kind, opts) { return host.startPreview(Object.assign({ kind }, opts || {})); },
      state() { return host.model.state(host.T()); },
      perf() { return { ms: host.stats.n ? host.stats.ms / host.stats.n : 0, msModel: host.stats.n ? host.stats.msModel / host.stats.n : 0, n: host.stats.n, view: host.view ? host.view.info() : null }; },
      stats() { return Object.assign({}, host.model.director.stats, host.model.stats); },
      itemName(item) { return itemName(item, host.lang()); },
    };
  }

  serialize() {
    const s = this.preview ? sanitizeIncidents(this.preview.snap) : this.model.serialize();
    return fitIncidents(s, INCIDENTS_SLICE.cap);
  }
  state() { return this.model.state(this.T()); }

  destroy() {
    if (this.stageHeld && this.ports.stage && this.ports.stage.end) this.ports.stage.end('incident');
    if (this.view) this.view.destroy();
    this.view = null;
  }
}
