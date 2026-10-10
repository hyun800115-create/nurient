// StoryLife (docs/v5_v8_plan.md §6.1 view/StoryLife.js): what the player sees of the story network.
//  - talks -> speech bubbles (ports.say: Bubbles -> VillageVoice 눈꽃말), speakers face each other, line anims,
//    only when both bodies are near (≤ 220 px) and on screen, within the town caps (2 bubbles, 3 emotes: else an emote);
//  - rumour ears (ui_icon_rumor) over a listener who just heard gossip;
//  - life set pieces (scenes/*) on the StageDirector's decision, with leased bodies;
//  - the story card, the morning paper (edge icon + NewsPanel), the naming sheet, the person card;
//  - the memorial garden's stones (kept between farewells), the designer's preview menu entries.
// Phaser only through ctx.scene (world), ctx.ui (screen scene) and ctx.art.

import { Stagehand, dirOf } from './stagehand.js';
import { playWedding } from './scenes/Wedding.js';
import { playFarewell } from './scenes/Farewell.js';
import { playProposal } from './scenes/Proposal.js';
import { playGoodNews, playBirth, playStroller, playFirstSteps } from './scenes/Baby.js';
import { playSchoolDay, playOutdoorClass } from './scenes/School.js';
import { playElderWish, playLastDay } from './scenes/Elder.js';
import { playHearts, playDate, playGathering, playBirthday, playHousewarming, playFirstJob } from './scenes/Small.js';
import { playHappening } from './happenings/Happenings.js';
import { StoryCard } from './ui/StoryCard.js';
import { NewsPanel } from './ui/NewsPanel.js';
import { NamingSheet } from './ui/NamingSheet.js';
import { PersonCard } from './ui/PersonCard.js';
import { icon } from './ui/widgets.js';

/** the longest a set piece may run (game seconds; the wedding is 60–90 s, the farewell ~60 s) */
const SCENE_MAX = { wedding: 180, farewell: 150, birth: 150, proposal: 60, goodnews: 40, school: 60, lastday: 200, stroller: 90, wish: 90, outdoor: 60, firststeps: 40, birthday: 60, housewarming: 40, firstjob: 40, happening: 60 };

const LINE_ANIM = { talk: 'talk', wave: 'wave', laugh: 'happy', happy: 'happy', clap: 'clap', sad: 'sad', think: 'idle', shocked: 'idle', nod: 'talk' };

export class StoryLife {
  /** ctx: { scene (world), ui (screen scene), art, ports, lang, screen: () => ({ w, h }), cardLayout, chief (pid, lab / previews only) } */
  constructor(ctx) {
    this.ctx = Object.assign({ lang: 'ko' }, ctx);
    this.talks = [];
    this.ears = [];
    this.active = new Map();       // kind -> { sh, beat }
    this.ambient = [];
    this.stones = [];              // kept memorial stones
    this.cardView = null;
    this.news = null;
    this.paperData = null;
    this.chip = null;
    this.stats = { talks: 0, shown: 0, lines: 0, capped: 0, ears: 0, beats: 0 };
    this.T = Object.assign({ maxDist: 220, chatCap: 2, emoteCap: 3 }, ctx.talk || {});
    this.ctx.holders = new Map();   // pid -> the Stagehand steering it (one scene per body)
  }

  bind(host) { this.host = host; this.ctx.registry = host.registry; this.ctx.host = host; }
  get ports() { return this.ctx.ports; }
  lang() { return this.ports.lang ? this.ports.lang() : this.ctx.lang; }
  pid(sid) { return this.host ? this.host.registry.pidOf(sid) : null; }
  body(pid) { return pid && this.ports.town && this.ports.town.bodyOf ? this.ports.town.bodyOf(pid) : null; }

  // ---------------------------------------------------------------- talks
  talk(t) {
    if (!t.lines || !t.lines.length) return;
    // a set piece owns the stage: no everyday chatter over the vows (ambient hearts / dates do not count)
    if (this.active.size) return;
    const pa = this.pid(t.a), pb = t.b >= 0 ? this.pid(t.b) : null;
    const A = this.body(pa), B = pb ? this.body(pb) : null;
    const V = this.ports.view;
    // the bubble (≤ 300 px wide, above the head) must fit on screen: the speaker stands well inside the view
    if (!A || (V && V.onScreen && !V.onScreen(A.x, A.y - 60, -130))) return;
    if (t.b >= 0 && (!B || Math.hypot(A.x - B.x, (A.y - B.y) * 2) > this.T.maxDist * 2)) return;
    const reg = this.host && this.host.registry;
    if (reg && (reg.owner(pa) === 'gameplay' || (pb && reg.owner(pb) === 'gameplay'))) return;
    this.stats.talks++;
    if (B) { const T = this.ports.town; if (T && T.face) { T.face(pa, dirOf(B.x - A.x, B.y - A.y)); T.face(pb, dirOf(A.x - B.x, A.y - B.y)); } }
    let at = 0;
    const lines = [];
    for (const l of t.lines) { lines.push({ at, l }); at += l.dur || 2.4; }
    this.talks.push({ t, pa, pb, lines, i: 0, clock: 0, rumor: (t.topics || []).some((x) => /^rumor/.test(x)) });
  }

  updateTalks(dt) {
    if (this.active.size && this.talks.length) this.talks.length = 0;     // a set piece started: the chatter stops
    for (let k = this.talks.length - 1; k >= 0; k--) {
      const T = this.talks[k];
      T.clock += dt;
      while (T.i < T.lines.length && T.lines[T.i].at <= T.clock) {
        const { l } = T.lines[T.i++];
        const who = l.who === T.t.a ? T.pa : T.pb;
        if (!who || !this.body(who)) continue;
        const ok = this.ports.say ? this.ports.say(who, l.text, l.emote || null, Math.max(1.6, (l.dur || 2.4) - 0.2), { talk: T.t.id }) : false;
        this.stats.lines++;
        if (!ok) { this.stats.capped++; if (l.emote && this.ports.emote) this.ports.emote(who, l.emote, 1.6); }
        const an = LINE_ANIM[l.anim] || 'talk';
        if (this.ports.town && this.ports.town.anim) this.ports.town.anim(who, an, { once: true });
        // a rumour travels: a little ear over the listener
        if (T.rumor && /^rumor/.test(l.rule || l.topic || '')) this.ear(who === T.pa ? T.pb : T.pa);
      }
      if (T.i >= T.lines.length && T.clock > (T.lines.length ? T.lines[T.lines.length - 1].at + 2.6 : 0)) this.talks.splice(k, 1);
    }
  }

  ear(pid) {
    const b = this.body(pid);
    if (!b || this.ears.length >= 3) return;
    const img = icon(this.ctx.scene, this.ctx.art, b.x + 26, b.y - 96, 'ui_icon_rumor', 34);
    if (!img) return;
    img.setDepth(1e6);
    this.stats.ears++;
    this.ears.push({ img, pid, t: 0 });
  }
  updateEars(dt) {
    for (let i = this.ears.length - 1; i >= 0; i--) {
      const e = this.ears[i];
      e.t += dt;
      const b = this.body(e.pid);
      if (!b || e.t > 1.8) { e.img.destroy(); this.ears.splice(i, 1); continue; }
      e.img.setPosition(b.x + 26, b.y - 100 - Math.sin(e.t * 6) * 2).setAlpha(e.t < 0.2 ? e.t / 0.2 : e.t > 1.5 ? (1.8 - e.t) / 0.3 : 1);
    }
  }

  // ---------------------------------------------------------------- set pieces
  /** beat from the director (sids) with the StageDirector's decision; onEnd() frees the slot */
  play(beat, decision, onEnd) {
    this.stats.beats++;
    const kind = beat.kind;
    const pids = (beat.sids || []).map((s) => this.pid(s));
    const data = Object.assign({}, beat.data || {});
    const done = () => { if (onEnd) onEnd(); };
    if (kind === 'hearts') { this.runAmbient('hearts', { kind, sids: beat.sids, pids }); return; }
    if (kind === 'date' || kind === 'outing') {
      const spot = this.venue(beat.venue);
      if (!spot || !pids[0] || !this.body(pids[0])) return;
      if (kind === 'date' && pids[1]) this.runAmbient('date', { kind, data: { a: pids[0], b: pids[1], spot, seat: this.seatPair(beat.venue) } });
      return;
    }
    if (kind === 'wedding') {
      const run = async (sh) => {
        const guests = await this.host.query('guests', { a: beat.sids[0], b: beat.sids[1] });
        const gp = (guests || []).map((s) => this.pid(s)).filter((p) => p && this.body(p));
        const kids = gp.filter((p) => { const c = this.host.nameCache.get(this.host.registry.sidOf(p)); return c && c[3] >= 0 && c[3] < 13; });
        await playWedding(sh, { data: Object.assign({ a: pids[0], b: pids[1], guests: gp, kids, hall: beat.venue || 'town_hall', chief: this.ctx.chief }, data), camera: decision.camera }, this.sceneCtx());
      };
      return this.runScene(kind, beat, run, done);
    }
    if (kind === 'farewell') {
      const run = async (sh) => {
        const fam = await this.host.query('family', { sid: beat.sids[0] });
        const family = fam ? fam.kids.concat(fam.spouse >= 0 ? [fam.spouse] : []).map((s) => this.pid(s)).filter((p) => p && this.body(p)) : [];
        await playFarewell(sh, { data: Object.assign({ family, friends: this.nearbyPids(this.venue(beat.venue), 6, family), chief: this.ctx.chief, dog: this.ctx.dog, garden: beat.venue || 'memorial_garden' }, data) }, this.sceneCtx());
      };
      return this.runScene(kind, beat, run, done);
    }
    const fn = {
      proposal: (sh) => {
        // the scripted first proposal: on the open snow in front of our hall's steps, where the 읍 crowd stands
        let at = beat.venue ? this.venue(beat.venue) : null;
        if (at && data.scripted) at = { x: at.x + 60, y: at.y + 120 };
        return playProposal(sh, { data: Object.assign({ a: pids[0], b: pids[1], at, crowd: this.nearbyPids(at || this.body(pids[1]), 8, pids) }, data), camera: decision.camera }, this.sceneCtx()); },
      goodnews: (sh) => playGoodNews(sh, { data: Object.assign({ a: pids[0], b: pids[1], home: this.venue(beat.venue) || null }, data) }, this.sceneCtx()),
      birth: (sh) => playBirth(sh, { data: Object.assign({ a: pids[0], b: pids[1], clinic: this.venue(beat.venue || 'clinic', 'doorPoint') }, data) }, this.sceneCtx()),
      firststeps: (sh) => playFirstSteps(sh, { data: Object.assign({ child: pids[0] }, data) }, this.sceneCtx()),
      school: (sh) => playSchoolDay(sh, { data: Object.assign({ child: pids[0], school: beat.venue || 'school' }, data) }, this.sceneCtx()),
      lastday: (sh) => { const seat = this.seatPair(beat.venue); return playLastDay(sh, { data: Object.assign({ elder: pids[0], chief: this.ctx.chief, bench: seat ? seat[0] : null }, data) }, this.sceneCtx()); },
      birthday: (sh) => playBirthday(sh, { data: Object.assign({ who: pids[0], friends: this.nearbyPids(this.body(pids[0]), 4, pids), spot: this.body(pids[0]) }, data) }, this.sceneCtx()),
      housewarming: (sh) => playHousewarming(sh, { data: Object.assign({ who: pids[0], friends: this.nearbyPids(this.body(pids[0]), 4, pids), door: this.venue(beat.venue) }, data) }, this.sceneCtx()),
      firstjob: (sh) => playFirstJob(sh, { data: Object.assign({ teen: pids[0], at: this.body(pids[0]) }, data) }, this.sceneCtx()),
    }[kind];
    if (!fn) { done(); return; }
    this.runScene(kind, beat, fn, done);
  }

  runScene(kind, beat, fn, done) {
    const prev = this.active.get(kind);
    if (prev) prev.sh.cancel();
    const sh = new Stagehand(this.ctx, kind);
    // a watchdog: no set piece holds its slot (or its people) forever, whatever happens to its bodies
    sh.deadline = SCENE_MAX[String(kind).replace(/^preview:/, '')] || 120;
    this.active.set(kind, { sh, beat });
    Promise.resolve().then(() => fn(sh)).catch((e) => { if (this.ctx.onError) this.ctx.onError(e); }).then(() => {
      if (this.active.get(kind) && this.active.get(kind).sh === sh) this.active.delete(kind);
      sh.end();
      done();
    });
    return sh;
  }

  runAmbient(kind, beat) {
    if (this.ambient.length >= 3) return;
    const sh = new Stagehand(this.ctx, kind);
    const fn = kind === 'hearts' ? playHearts : kind === 'date' ? playDate : playGathering;
    this.ambient.push(sh);
    Promise.resolve().then(() => fn(sh, beat, this.sceneCtx())).catch(() => {}).then(() => { sh.end(); this.ambient.splice(this.ambient.indexOf(sh), 1); });
  }

  /** the director routed an engine event to a running scene (wedding guests, memorial mourners) */
  route(kind, ev) { /* the scenes ask for their cast when they start; the engine's later lists are informational */ }
  arrive(ev) { /* story walks are driven by the scenes' own walks */ }

  sceneCtx() {
    const self = this;
    return {
      lang: this.lang(),
      flash: (zoom) => this.flash(zoom),
      bow: (pid) => this.bow(pid),
      hide: (pid, on) => { const T = this.ports.town; if (T && T.hide) T.hide(pid, on); },
      nameplate: (x, y, name, depth) => this.nameplate(x, y, name, depth),
      keepStone: (img, slot) => { self.stones[slot] = img; },
    };
  }

  /** a soft photo flash (and a short zoom when the camera may be grabbed) */
  flash(zoom) {
    const ui = this.ctx.ui || this.ctx.scene, scr = this.ctx.screen ? this.ctx.screen() : { w: 720, h: 1400 };
    const r = ui.add.rectangle(scr.w / 2, scr.h / 2, scr.w, scr.h, 0xffffff, 0).setDepth(9000);
    ui.tweens.add({ targets: r, alpha: 0.85, duration: 70, yoyo: true, hold: 60, onComplete: () => r.destroy() });
    if (zoom > 1 && this.ports.view && this.ports.view.zoomPulse) this.ports.view.zoomPulse(zoom, 2000);
  }
  bow(pid) { const b = this.body(pid); if (b && b.bow) b.bow(); }
  nameplate(x, y, name, depth) {
    const sc = this.ctx.scene;
    const t = sc.add.text(x, y, name || '', { fontFamily: "Pretendard, 'Apple SD Gothic Neo', sans-serif", fontSize: '11px', fontStyle: '800', color: '#7a6a52', resolution: 3 }).setOrigin(0.5, 0.5).setDepth(depth || y + 1).setAlpha(0.9);
    return t;
  }

  /** world point of a venue (story place id = building id); kind = a point name of its sprite */
  venue(id, point) {
    if (!id) return null;
    if (typeof id === 'object') return id;
    const W = this.ports.world;
    if (!W) return null;
    const b = W.buildings ? W.buildings().find((x) => x.id === id || x.key === id) : null;
    if (b && point) { const d = this.ctx.art.def(b.key); const v = d && d[point]; if (v) return { x: b.x + v[0], y: b.y + v[1] }; }
    const s = W.spot ? W.spot(String(id).split('#')[0], 'gather') : null;
    return s || (b ? { x: b.x, y: b.y + 60 } : null);
  }
  seatPair(id) {
    const W = this.ports.world;
    const b = W && W.buildings ? W.buildings().find((x) => x.id === id) : null;
    if (!b) return null;
    const d = this.ctx.art.def(b.key);
    if (!d || !d.seatPoints || d.seatPoints.length < 2) return null;
    return [0, 1].map((i) => ({ x: b.x + d.seatPoints[i][0], y: b.y + d.seatPoints[i][1], dir: (d.seatDirs || [])[i] || 'S' }));
  }
  /** pids of bodies near a point (the crowd of a proposal, friends at a party) */
  nearbyPids(at, n, not = []) {
    const T = this.ports.town;
    if (!at || !T || !T.nearby) return [];
    return T.nearby(at.x, at.y, 420, n + not.length).filter((p) => not.indexOf(p) < 0).slice(0, n);
  }

  // ---------------------------------------------------------------- UI: cards, the paper, the naming sheet, the person card
  card(c, lang) {
    if (!this.ctx.ui) return;
    if (this.cardView) this.cardView.close();
    const scr = this.ctx.screen ? this.ctx.screen() : { w: 720, h: 1400 };
    const L = Object.assign({ x: 16, y: scr.h - 120 - 170, w: 520, h: 120 }, this.ctx.cardLayout || {});
    this.cardView = new StoryCard(this.ctx.ui, this.ctx.art, c, L, { lang: lang || this.lang(), onName: (card) => this.openNaming(card), onWatch: (card) => this.ctx.onWatch && this.ctx.onWatch(card) });
    this.cardView.card = c;
    const hold = c.kind === 'farewell' ? 14 : 8;
    const me = this.cardView;
    this.ctx.ui.time.delayedCall(hold * 1000, () => { if (this.cardView === me) { me.close(); this.cardView = null; } });
  }

  paper(a) {
    this.paperData = a.paper || null;
    if (!this.ctx.ui) return;
    if (!this.chip) {
      const scr = this.ctx.screen ? this.ctx.screen() : { w: 720, h: 1400 };
      const L = this.ctx.chipLayout || { x: scr.w - 58, y: 330 };
      this.chip = icon(this.ctx.ui, this.ctx.art, L.x, L.y, 'ui_icon_newspaper', 76);
      if (this.chip) { this.chip.setDepth(4000).setInteractive({ useHandCursor: true }); this.chip.on('pointerdown', () => this.openNews()); }
    }
    if (this.chip) {
      // a pulse from the icon's own size (a new paper while it still pulses must not grow it)
      if (this.chipScale === undefined) this.chipScale = this.chip.scaleX;
      const s0 = this.chipScale;
      this.ctx.ui.tweens.killTweensOf(this.chip);
      this.chip.setScale(s0);
      this.ctx.ui.tweens.add({ targets: this.chip, scale: s0 * 1.18, duration: 380, yoyo: true, repeat: 5, ease: 'Sine.InOut' });
    }
  }
  openNews(paper) {
    const p = paper || (this.paperData ? (this.lang() === 'en' ? this.paperData.en : this.paperData.ko) : null);
    if (!p || !this.ctx.ui) return null;
    if (this.news) this.news.close();
    const scr = this.ctx.screen ? this.ctx.screen() : { w: 720, h: 1400 };
    this.news = new NewsPanel(this.ctx.ui, this.ctx.art, p, scr, { lang: this.lang() });
    if (this.host) this.host.out('story:read', { day: p.day });
    return this.news;
  }
  async openNaming(card) {
    if (!this.ctx.ui || !this.host || !card) return null;
    const sid = card.sids[0];
    const names = await this.host.query('namePool', { sid, n: 3 });
    const nm = (s) => { const n = this.host.nameCache.get(s); return n ? n[this.lang() === 'en' ? 1 : 0] : ''; };
    const parents = [card.sids[1], card.sids[2]].filter((s) => s >= 0).map(nm).filter(Boolean).join(this.lang() === 'en' ? ' & ' : ' · ');
    const scr = this.ctx.screen ? this.ctx.screen() : { w: 720, h: 1400 };
    if (this.cardView) { this.cardView.close(); this.cardView = null; }
    return new NamingSheet(this.ctx.ui, this.ctx.art, names || [], parents, scr, { lang: this.lang(), onPick: (n) => { if (n) this.host.nameBaby(sid, n); } });
  }
  openPerson(pid, at) {
    if (!this.ctx.ui || !this.host) return null;
    const c = this.host.api.card(pid);
    if (!c) return null;
    const scr = this.ctx.screen ? this.ctx.screen() : { w: 720, h: 1400 };
    if (this.person) this.person.close();
    this.person = new PersonCard(this.ctx.ui, this.ctx.art, c, at || { x: scr.w / 2, y: scr.h / 2 }, scr, { lang: this.lang(), onTalk: () => this.host.api.talkTo(pid) });
    return this.person;
  }

  /** a cute happening (the host checked the slot); done() frees it */
  happening(h, done) {
    if (!this.ctx.happen) { if (this.ports.ui && this.ports.ui.toast) this.ports.ui.toast(this.lang() === 'en' ? h.toastEn : h.toastKo, 2.5); done(); return; }
    const sh = new Stagehand(this.ctx, 'happening');
    sh.deadline = SCENE_MAX.happening;
    this.active.set('happening', { sh, beat: { kind: 'happening' } });
    Promise.resolve().then(() => playHappening(h, sh, Object.assign({ lang: this.lang() }, this.ctx.happen()))).catch(() => {}).then(() => { this.active.delete('happening'); sh.end(); done(); });
  }

  /** the designer's preview menu (§5.8): plays a beat with whoever is around; never saves */
  preview(kind, data) {
    const beat = { kind, data: Object.assign({ fast: false }, data || {}), sids: [] };
    const run = {
      proposal: (sh) => playProposal(sh, beat, this.sceneCtx()), wedding: (sh) => playWedding(sh, beat, this.sceneCtx()), farewell: (sh) => playFarewell(sh, beat, this.sceneCtx()),
      goodnews: (sh) => playGoodNews(sh, beat, this.sceneCtx()), birth: (sh) => playBirth(sh, beat, this.sceneCtx()), stroller: (sh) => playStroller(sh, beat, this.sceneCtx()),
      firststeps: (sh) => playFirstSteps(sh, beat, this.sceneCtx()), school: (sh) => playSchoolDay(sh, beat, this.sceneCtx()), outdoor: (sh) => playOutdoorClass(sh, beat, this.sceneCtx()),
      wish: (sh) => playElderWish(sh, beat, this.sceneCtx()), lastday: (sh) => playLastDay(sh, beat, this.sceneCtx()), birthday: (sh) => playBirthday(sh, beat, this.sceneCtx()),
      date: (sh) => playDate(sh, beat, this.sceneCtx()), gathering: (sh) => playGathering(sh, beat, this.sceneCtx()),
    }[kind];
    if (!run) return Promise.resolve(false);
    return new Promise((resolve) => this.runScene('preview:' + kind, beat, run, () => resolve(true)));
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    this.updateTalks(dt);
    this.updateEars(dt);
    for (const [kind, a] of this.active) { a.sh.update(dt); if (a.sh.t > a.sh.deadline && !a.sh.cancelled) { this.stats.timeouts = (this.stats.timeouts || 0) + 1; a.sh.cancel(); } }
    for (const sh of this.ambient) { sh.update(dt); if (sh.t > 60 && !sh.cancelled) sh.cancel(); }
  }

  destroy() {
    for (const { sh } of this.active.values()) sh.cancel();
    for (const sh of this.ambient) sh.cancel();
    this.active.clear();
    for (const e of this.ears) e.img.destroy();
    this.ears = [];
    if (this.cardView) this.cardView.close();
    if (this.news) this.news.close();
  }
}
