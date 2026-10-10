// StoryLife (docs/v5_v8_plan.md §6.1 view/StoryLife.js): what the player sees of the story network.
//  - talks -> speech bubbles (ports.say: Bubbles -> VillageVoice 눈꽃말), speakers face each other, line anims,
//    only when both bodies are near (≤ 220 px) and on screen, within the caps (≤ 2 story chats and ≤ 3 story emotes on
//    screen at once, counted here; the kit's say also refuses when the town's own bubbles are at the cap);
//  - rumour ears (ui_icon_rumor) over a listener who just heard gossip;
//  - life set pieces (scenes/*) on the StageDirector's decision, with leased bodies; people whose townfolk2 pages the
//    kit could not page in play in their everyday look (Stagehand.canDress);
//  - the story card (보러 가기 → host.watch), the morning paper (edge icon + NewsPanel), the naming sheet, the person
//    card (수다 떨기: the chat for villagers, a little talk with the chief for townsfolk);
//  - the memorial garden's stones, drawn from the slice (they survive reloads), the designer's preview menu.
// Phaser only through ctx.scene (world), ctx.ui (screen scene) and ctx.art.

import { Stagehand, dirOf } from './stagehand.js';
import { playWedding } from './scenes/Wedding.js';
import { playFarewell, stoneDepth, engraved } from './scenes/Farewell.js';
import { playProposal } from './scenes/Proposal.js';
import { playGoodNews, playBirth, playBirthDawn, playStroller, playFirstSteps } from './scenes/Baby.js';
import { playSchoolDay, playOutdoorClass } from './scenes/School.js';
import { playElderWish, playLastDay } from './scenes/Elder.js';
import { playHearts, playDate, playGathering, playBirthday, playHousewarming, playFirstJob } from './scenes/Small.js';
import { playHappening } from './happenings/Happenings.js';
import { StoryCard } from './ui/StoryCard.js';
import { NewsPanel } from './ui/NewsPanel.js';
import { NamingSheet } from './ui/NamingSheet.js';
import { PersonCard } from './ui/PersonCard.js';
import { icon } from './ui/widgets.js';
import { s as str } from '../strings.js';

/** the longest a set piece may run (game seconds; the wedding is 60–90 s, the farewell ~60 s) */
const SCENE_MAX = { wedding: 180, farewell: 150, birth: 90, birthdawn: 90, proposal: 60, goodnews: 40, school: 60, lastday: 200, stroller: 90, wish: 90, outdoor: 60, firststeps: 40, birthday: 60, housewarming: 40, firstjob: 40, happening: 60 };

const LINE_ANIM = { talk: 'talk', wave: 'wave', laugh: 'happy', happy: 'happy', clap: 'clap', sad: 'sad', think: 'idle', shocked: 'idle', nod: 'talk' };
const FONT = "Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif";

export class StoryLife {
  /** ctx: { scene (world), ui (screen scene), art, ports, lang, screen: () => ({ w, h }), cardLayout, chief (pid, lab / previews only) } */
  constructor(ctx) {
    this.ctx = Object.assign({ lang: 'ko' }, ctx);
    this.talks = [];
    this.ears = [];
    this.active = new Map();       // kind -> { sh, beat }
    this.ambient = [];
    this.garden = [];              // the memorial garden's drawn stones and names
    this.cardView = null;
    this.news = null;
    this.paperData = null;
    this.chip = null;
    this.clock = 0;
    this.live = { chats: [], emotes: [] };    // expiry times (view clock) of the story's own bubbles on screen
    this.stats = { talks: 0, shown: 0, lines: 0, capped: 0, ears: 0, beats: 0, previews: 0 };
    this.T = Object.assign({ maxDist: 220, chatCap: 2, emoteCap: 3 }, ctx.talk || {});
    this.ctx.holders = new Map();   // pid -> the Stagehand steering it (one scene per body)
    this.ctx.ageGroup = (pid) => this.ageGroup(pid);
  }

  bind(host) {
    this.host = host;
    this.ctx.registry = host.registry;
    this.ctx.host = host;
    if (host.T && host.T.talk) Object.assign(this.T, host.T.talk);
    this.drawGarden();
  }
  get ports() { return this.ctx.ports; }
  lang() { return this.ports.lang ? this.ports.lang() : this.ctx.lang; }
  pid(sid) { return this.host && sid >= 0 ? this.host.registry.pidOf(sid) : null; }
  body(pid) { return pid && this.ports.town && this.ports.town.bodyOf ? this.ports.town.bodyOf(pid) : null; }
  /** 'child' | 'adult' | 'elder' of a body (the kit knows the doll's base; else the story's own age) */
  ageGroup(pid) {
    const T = this.ports.town;
    if (T && T.ageGroup) { const g = T.ageGroup(pid); if (g) return g; }
    const b = this.body(pid);
    if (b && typeof b.age === 'string') return b.age;
    const sid = this.host ? this.host.registry.sidOf(pid) : -1;
    const n = sid >= 0 ? this.host.nameCache.get(sid) : null;
    const c = sid >= 0 ? this.host.mirror.card(sid) : null;
    const age = n && n[3] > 0 ? n[3] : c ? c.age : -1;
    return age < 0 ? null : age < 13 ? 'child' : age < 65 ? 'adult' : 'elder';
  }
  isHeld(pid) { return this.ctx.holders.has(pid); }
  /** a body leaves the town (moved away, departed): the scene that holds it lets go first */
  releaseBody(pid) { const sh = this.ctx.holders.get(pid); if (sh) sh.release(pid); }

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

  /** room for one more story bubble of this kind on screen? (critique M6: the cap is counted here, not trusted to the port) */
  room(kind) {
    const L = this.live[kind], now = this.clock;
    for (let i = L.length - 1; i >= 0; i--) if (L[i] <= now) L.splice(i, 1);
    return L.length < (kind === 'chats' ? this.T.chatCap : this.T.emoteCap);
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
        const dur = Math.max(1.6, (l.dur || 2.4) - 0.2);
        let ok = false;
        if (this.room('chats')) { ok = this.ports.say ? !!this.ports.say(who, l.text, l.emote || null, dur, { talk: T.t.id }) : false; if (ok) this.live.chats.push(this.clock + dur); }
        this.stats.lines++;
        if (!ok) {
          this.stats.capped++;
          if (l.emote && this.ports.emote && this.room('emotes') && this.ports.emote(who, l.emote, 1.6)) this.live.emotes.push(this.clock + 1.6);
        }
        const an = LINE_ANIM[l.anim] || 'talk';
        if (this.ports.town && this.ports.town.anim) this.ports.town.anim(who, an === 'clap' || an === 'sad' ? 'talk' : an, { once: true });
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
        const kids = gp.filter((p) => this.ageGroup(p) === 'child');
        await playWedding(sh, { data: Object.assign({ a: pids[0], b: pids[1], guests: gp, kids, hall: beat.venue || 'town_hall', chief: this.ctx.chief }, data), camera: decision.camera }, this.sceneCtx());
      };
      return this.runScene(kind, beat, run, done);
    }
    if (kind === 'farewell') {
      const run = async (sh) => {
        let family = (data.family || []).filter((p) => p && this.body(p));
        if (!family.length && beat.sids[0] >= 0) {
          const fam = await this.host.query('family', { sid: beat.sids[0] });
          family = fam ? fam.kids.concat(fam.spouse >= 0 ? [fam.spouse] : []).map((s) => this.pid(s)).filter((p) => p && this.body(p)) : [];
        }
        const g = this.venue(beat.venue);
        await playFarewell(sh, { data: Object.assign({}, data, { family, friends: this.nearbyPids(g, 6, family), chief: this.ctx.chief, dog: this.ctx.dog, garden: beat.venue || 'memorial_garden' }) }, this.sceneCtx());
      };
      return this.runScene(kind, beat, run, done);
    }
    const pink = () => { const c = this.host && beat.sids[2] >= 0 ? this.host.nameCache.get(beat.sids[2]) : null; return !!(c && !c[2]); };
    const fn = {
      proposal: (sh) => {
        // the scripted first proposal: on the open snow in front of our hall's steps, where the 읍 crowd stands
        let at = beat.venue ? this.venue(beat.venue) : null;
        if (at && data.scripted) at = { x: at.x + 60, y: at.y + 120 };
        return playProposal(sh, { data: Object.assign({ a: pids[0], b: pids[1], at, crowd: this.nearbyPids(at || this.body(pids[1]), 8, pids) }, data), camera: decision.camera }, this.sceneCtx()); },
      goodnews: (sh) => playGoodNews(sh, { data: Object.assign({ a: pids[0], b: pids[1], home: this.venue(beat.venue) || null }, data) }, this.sceneCtx()),
      birth: (sh) => playBirth(sh, { data: Object.assign({ a: pids[0], b: pids[1], clinic: this.venue(beat.venue || 'clinic', 'doorPoint') }, data) }, this.sceneCtx()),
      birthdawn: (sh) => playBirthDawn(sh, { data: Object.assign({ a: pids[0], b: pids[1], clinic: this.venue(beat.venue || 'clinic', 'doorPoint'), pink: pink() }, data) }, this.sceneCtx()),
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
    const base = String(kind).replace(/^preview:/, '');
    // a watchdog: no set piece holds its slot (or its people) forever, whatever happens to its bodies
    sh.deadline = SCENE_MAX[base] || 120;
    // the age groups whose townfolk2 pages the kit could page in for this set piece (null: all, the lab)
    sh.dressAges = this.ports.dressAges ? this.ports.dressAges(base) : null;
    this.active.set(kind, { sh, beat });
    Promise.resolve().then(() => fn(sh)).catch((e) => { if (this.ctx.onError) this.ctx.onError(e); }).then(() => {
      if (this.active.get(kind) && this.active.get(kind).sh === sh) this.active.delete(kind);
      sh.end();
      done();
    });
    return sh;
  }

  /** a wedding or a farewell cuts a small ceremony beat short (host.playBeat, critique H6) */
  cancel(kind) { const a = this.active.get(kind); if (a && !a.sh.cancelled) a.sh.cancel(); }

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
    return {
      lang: this.lang(),
      flash: (zoom) => this.flash(zoom),
      bow: (pid) => this.bow(pid),
      hide: (pid, on) => { const T = this.ports.town; if (T && T.hide) T.hide(pid, on); },
      nameplate: (x, y, name, depth, o) => this.nameplate(x, y, name, depth, o),
      nameLabel: (x, y, name, depth) => this.nameLabel(x, y, name, depth),
      gardenDone: (day) => this.drawGarden(day),
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
  /** a name engraved on a memorial stone's plaque (o.engraved) or a plain little label */
  nameplate(x, y, name, depth, o = {}) {
    const sc = this.ctx.scene;
    const en = o.lang === 'en';
    const t = sc.add.text(x, y, name || '', { fontFamily: FONT, fontSize: (o.engraved ? (en ? 12 : 15) : 13) + 'px', fontStyle: '800', color: o.engraved ? '#5b5148' : '#7a6a52', resolution: 3 })
      .setOrigin(0.5, 0.5).setDepth(depth || y + 1);
    if (o.engraved) t.setShadow(0, 1, 'rgba(255,255,255,0.55)', 0, false, true).setAlpha(0.92);
    return t;
  }
  /** the full name, readable, floating above a stone during the ceremony (18 px on a soft cream label) */
  nameLabel(x, y, name, depth) {
    const sc = this.ctx.scene;
    if (!name) return null;
    const c = sc.add.container(x, y).setDepth(depth || y + 1);
    const t = sc.add.text(0, 0, name, { fontFamily: FONT, fontSize: '18px', fontStyle: '800', color: '#5b4a3c', resolution: 3 }).setOrigin(0.5, 0.5);
    const w = t.width + 26, h = 32;
    const g = sc.add.graphics();
    g.fillStyle(0xfff6e6, 0.88).fillRoundedRect(-w / 2, -h / 2, w, h, 14);
    g.lineStyle(2, 0xe9cfa8, 0.9).strokeRoundedRect(-w / 2, -h / 2, w, h, 14);
    c.add([g, t]);
    c.setAlpha(0);
    if (sc.tweens) sc.tweens.add({ targets: c, alpha: 1, y: y - 6, duration: 1400, ease: 'Sine.Out' });
    return c;
  }

  // ---------------------------------------------------------------- the memorial garden (stones from the slice, M2)
  /** draw the garden's stones (slot, engraved given name) and, for names that left the stones, a small flower bed.
   *  A stone whose ceremony is still to come waits for it (extraDay: the ceremony that just ended shows its stone). */
  drawGarden(extraDay) {
    for (const o of this.garden) if (o && o.scene) o.destroy();
    this.garden = [];
    const sc = this.ctx.scene, art = this.ctx.art;
    if (!this.host || !sc || !sc.add || !art) return;
    const W = this.ports.world;
    const g = W && W.buildings ? (W.buildings().find((b) => b.key === 'memorial_garden' && b.ours) || W.buildings().find((b) => b.key === 'memorial_garden')) : null;
    if (!g) return;
    const S = this.host.director.s, lang = this.lang();
    const waiting = new Set(S.booked.filter((x) => x[0] === 'f').map((x) => x[1]));
    const def = art.def('memorial_garden') || {}, sdef = art.def('memorial_stone') || {};
    const gdepth = g.depth !== undefined ? g.depth : g.y;
    for (const e of S.garden) {
      if (waiting.has(e.day) && e.day !== extraDay) continue;
      const p = def.stonePoints && def.stonePoints[e.s];
      if (!p) continue;
      const x = g.x + p[0], y = g.y + p[1], sd = stoneDepth(gdepth, g.y, y);
      const img = art.image(sc, x, y, 'memorial_stone');
      if (!img) continue;
      img.setDepth(sd);
      this.garden.push(img);
      const pp = sdef.plaquePoint || [0, -14];
      this.garden.push(this.nameplate(x + pp[0], y + pp[1], engraved(lang === 'en' ? e.en : e.ko, lang), sd + 0.0005, { engraved: true, lang }));
    }
    // the names that left the stones: a little bed of flowers by the gate (never an empty gap)
    const n = Math.min(3, S.gardenOld.length);
    const gate = def.doorPoint || [0, 62];
    for (let i = 0; i < n; i++) { const fl = art.image(sc, g.x + gate[0] - 58 + i * 16, g.y + gate[1] - 10 + (i % 2) * 6, 'item_bouquet'); if (fl) { fl.setDepth(gdepth + 0.9).setScale(0.8); this.garden.push(fl); } }
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
    const b = W && W.buildings ? W.buildings().find((x) => x.id === id || (x.key === id && x.ours)) : null;
    if (!b) return null;
    const d = this.ctx.art.def(b.key);
    if (!d || !d.seatPoints || d.seatPoints.length < 2) return null;
    return [0, 1].map((i) => ({ x: b.x + d.seatPoints[i][0], y: b.y + d.seatPoints[i][1], dir: (d.seatDirs || [])[i] || 'S' }));
  }
  /** pids of free bodies near a point (the crowd of a proposal, friends at a party); never a departed or held one */
  nearbyPids(at, n, not = [], age) {
    const T = this.ports.town;
    if (!at || !T || !T.nearby) return [];
    const reg = this.host && this.host.registry;
    return T.nearby(at.x, at.y, 420, n + not.length + 8).filter((p) => not.indexOf(p) < 0 && !this.ctx.holders.has(p) && (!reg || !/^[tvk]:/.test(p) || reg.has(p)) && (!age || this.ageGroup(p) === age)).slice(0, n);
  }

  // ---------------------------------------------------------------- UI: cards, the paper, the naming sheet, the person card
  card(c, lang) {
    if (!this.ctx.ui) return;
    if (this.cardView) this.cardView.close();
    const scr = this.ctx.screen ? this.ctx.screen() : { w: 720, h: 1400 };
    const L = Object.assign({ x: 16, y: scr.h - 120 - 170, w: 520, h: 120 }, this.ctx.cardLayout || {});
    const me = this.cardView = new StoryCard(this.ctx.ui, this.ctx.art, c, L, { lang: lang || this.lang(), onName: (card) => this.openNaming(card),
      // 보러 가기: the beat it announces is staged wherever it is and the camera goes there (critique M9)
      onWatch: (card) => { if (this.ctx.onWatch) this.ctx.onWatch(card); else if (this.host) this.host.watch(card); if (this.cardView === me) { me.close(); this.cardView = null; } } });
    me.card = c;
    const hold = c.kind === 'farewell' ? 14 : 8;
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
  /** the screen point (UI logical px) above a body: the person card's anchor (S11 passes only the pid, critique M10) */
  screenOf(pid) {
    const b = this.body(pid), cam = this.ctx.scene && this.ctx.scene.cameras ? this.ctx.scene.cameras.main : null;
    if (!b || !cam) return null;
    const k = this.ctx.ui && this.ctx.ui.cameras ? this.ctx.ui.cameras.main.zoom || 1 : 1;
    return { x: (b.x - cam.worldView.x) * cam.zoom / k, y: (b.y - cam.worldView.y) * cam.zoom / k };
  }
  openPerson(pid, at) {
    if (!this.ctx.ui || !this.host) return null;
    const c = this.host.api.card(pid);
    if (!c) return null;
    const scr = this.ctx.screen ? this.ctx.screen() : { w: 720, h: 1400 };
    if (this.person) this.person.close();
    const anchor = at || this.screenOf(pid) || { x: scr.w / 2, y: scr.h / 2 };
    const card = this.person = new PersonCard(this.ctx.ui, this.ctx.art, c, anchor, scr, { lang: this.lang(), onTalk: () => { this.talkWith(pid); if (this.person === card) { card.close(); this.person = null; } } });
    return card;
  }
  /** 수다 떨기: a named villager opens the resident chat (ports.chat.offer → ResidentChat.offer); a townsperson has a
   *  little talk with the chief, voiced through the bubbles */
  async talkWith(pid) {
    const C = this.ports.chat;
    if (/^v:/.test(pid) && C && C.offer && C.offer(pid)) return true;
    const t = await this.host.api.talkTo(pid);
    if (!t || !t.lines || !t.lines.length) return false;
    const sid = this.host.registry.sidOf(pid);
    let at = 0;
    for (const l of t.lines) {
      const who = l.who === sid ? pid : (this.ctx.chief || 'chief');
      const d = l.dur || 2.4;
      if (this.ctx.ui && this.ctx.ui.time) this.ctx.ui.time.delayedCall(at * 1000, () => { if (this.ports.say) this.ports.say(who, l.text, l.emote || null, Math.max(1.6, d - 0.2), { story: true, talk: t.id }); });
      at += d;
    }
    return true;
  }

  /** a cute happening (the host checked the slot); done() frees it */
  happening(h, done) {
    const toast = () => { if (this.ports.ui && this.ports.ui.toast) this.ports.ui.toast(this.lang() === 'en' ? h.toastEn : h.toastKo, 3); };
    if (!this.ctx.happen) { toast(); done(); return; }
    const sh = new Stagehand(this.ctx, 'happening');
    sh.deadline = SCENE_MAX.happening;
    this.active.set('happening', { sh, beat: { kind: 'happening' } });
    const hc = this.ctx.happen();
    if (hc && hc.keeper && this.host) { const s = this.host.registry.sidOf(hc.keeper); const n = s >= 0 ? this.host.nameCache.get(s) : null; const c = s >= 0 ? this.host.mirror.card(s) : null; hc.keeperMale = n ? !!n[2] : !!(c && c.male); }
    Promise.resolve().then(() => playHappening(h, sh, Object.assign({ lang: this.lang() }, hc)))
      .then((r) => { if (r && r.toast) toast(); })            // the ones without their props yet: a small toast (L3)
      .catch(() => {}).then(() => { this.active.delete('happening'); sh.end(); done(); });
  }

  // ---------------------------------------------------------------- the designer's preview menu (§5.8, critique H10)
  /**
   * plays a set piece for the designer with people found near the camera (or `data`'s own cast), on the ceremony
   * slot (never over a real beat), in preview mode: no stone or name stays, no cards, no module events, no saves.
   * Resolves true when it played, false when it could not (nobody around, the stage busy).
   */
  preview(kind, data) {
    if (!this.host) return Promise.resolve(false);
    const run = {
      proposal: (sh, beat) => playProposal(sh, beat, this.sceneCtx()), wedding: (sh, beat) => playWedding(sh, beat, this.sceneCtx()), farewell: (sh, beat) => playFarewell(sh, beat, this.sceneCtx()),
      goodnews: (sh, beat) => playGoodNews(sh, beat, this.sceneCtx()),
      birth: async (sh, beat) => { await playBirth(sh, beat, this.sceneCtx()); if (!sh.cancelled) await playBirthDawn(sh, beat, this.sceneCtx()); },
      stroller: (sh, beat) => playStroller(sh, beat, this.sceneCtx()),
      firststeps: (sh, beat) => playFirstSteps(sh, beat, this.sceneCtx()), school: (sh, beat) => playSchoolDay(sh, beat, this.sceneCtx()), outdoor: (sh, beat) => playOutdoorClass(sh, beat, this.sceneCtx()),
      wish: (sh, beat) => playElderWish(sh, beat, this.sceneCtx()), lastday: (sh, beat) => playLastDay(sh, beat, this.sceneCtx()), birthday: (sh, beat) => playBirthday(sh, beat, this.sceneCtx()),
      date: (sh, beat) => playDate(sh, beat, this.sceneCtx()), gathering: (sh, beat) => playGathering(sh, beat, this.sceneCtx()),
    }[kind];
    if (!run) return Promise.resolve(false);
    const say = (k) => { if (this.ports.ui && this.ports.ui.toast) this.ports.ui.toast(str(this.lang(), k), 3); };
    const slot = 'preview:' + kind;
    const st = this.host.stage;
    const d = st.request({ kind: slot, watch: true }, null);
    if (!d.ok) { say('previewBusy'); return Promise.resolve(false); }
    const cast = data ? Object.assign({}, data) : this.previewCast(kind);
    if (!cast) { st.end(slot); say('previewNone'); return Promise.resolve(false); }
    this.stats.previews++;
    const beat = { kind, data: Object.assign({ fast: false }, cast, { preview: true }), sids: [] };
    if (cast.focus && this.ports.view && this.ports.view.focus) this.ports.view.focus(cast.focus.x, cast.focus.y, 900);
    return new Promise((resolve) => this.runScene(slot, beat, (sh) => run(sh, beat), () => { st.end(slot); resolve(true); }));
  }

  /** a cast for a preview from the people near the camera (free bodies, by age group); null when nobody fits */
  previewCast(kind) {
    const V = this.ports.view, W = this.ports.world;
    const r = V && V.rect ? V.rect() : null;
    const c = r ? { x: r.x + r.w / 2, y: r.y + r.h / 2 } : { x: 0, y: 0 };
    const bld = (key) => (W && W.buildings ? (W.buildings().find((b) => b.key === key && b.ours) || W.buildings().find((b) => b.key === key)) : null);
    const near = (at, n, age, not = []) => this.nearbyPidsWide(at, n, age, not);
    const chief = this.ctx.chief;
    switch (kind) {
      case 'proposal': {
        const [a, b] = near(c, 2, 'adult');
        if (!a || !b) return null;
        const at = { x: c.x, y: c.y + 60 };
        return { a, b, at, crowd: near(at, 8, null, [a, b]), focus: at };
      }
      case 'wedding': {
        const hall = bld('town_hall');
        if (!hall) return null;
        const at = { x: hall.x - 220, y: hall.y + 120 };
        const [a, b] = near(at, 2, 'adult');
        if (!a || !b) return null;
        const guests = near(at, 12, null, [a, b]);
        return { a, b, guests, kids: guests.filter((p) => this.ageGroup(p) === 'child'), hall: hall.id, chief, focus: at };
      }
      case 'birth': case 'goodnews': {
        const cl = bld('clinic') || bld('village_clinic');
        const door = cl ? this.venue(cl.id, 'doorPoint') : null;
        const [a, b] = near(door || c, 2, 'adult');
        if (!a || !b || (!door && kind === 'birth')) return null;
        return kind === 'birth' ? { a, b, clinic: door, pink: true, fast: true, focus: door } : { a, b, home: { x: c.x, y: c.y }, focus: c };
      }
      case 'school': {
        const sc = bld('school') || bld('village_school');
        if (!sc) return null;
        const child = near({ x: sc.x, y: sc.y + 120 }, 1, 'child')[0], parent = near({ x: sc.x, y: sc.y + 120 }, 1, 'adult')[0];
        if (!child) return null;
        return { child, parent, school: sc.id, focus: { x: sc.x - 60, y: sc.y + 100 } };
      }
      case 'wish': case 'lastday': {
        const g = bld('memorial_garden') || bld('park_fountain');
        const elder = near(g ? { x: g.x, y: g.y } : c, 1, 'elder')[0];
        if (!elder) return null;
        const seat = g ? this.seatPair(g.id) : null;
        const to = seat ? seat[0] : { x: c.x + 60, y: c.y, dir: 'S' };
        return kind === 'wish' ? { elder, chief, to, focus: to } : { elder, chief, bench: to, focus: to };
      }
      case 'farewell': {
        const g = bld('memorial_garden');
        if (!g) return null;
        const at = { x: g.x, y: g.y + 40 };
        const family = near(at, 2, 'adult'), friends = near(at, 4, null, family);
        // a free stone slot (the kept stones stay as they are); the name is a gentle stand-in, never a resident's
        const used = new Set((this.host.director.s.garden || []).map((e) => e.s));
        let slot = 0; while (used.has(slot) && slot < 5) slot++;
        return { slot, nameKo: str('ko', 'previewStone'), nameEn: str('en', 'previewStone'), male: false, family, friends, chief, dog: this.ctx.dog, garden: g.id, focus: at };
      }
      case 'stroller': {
        const a = near(c, 1, 'adult')[0];
        if (!a) return null;
        return { a, pink: true, chief, path: [{ x: c.x - 90, y: c.y + 40 }, { x: c.x + 30, y: c.y + 70, pause: 2 }, { x: c.x + 240, y: c.y }], focus: c };
      }
      default: return null;
    }
  }
  /** nearbyPids over a wide radius (the preview may borrow people from the next street) */
  nearbyPidsWide(at, n, age, not = []) {
    const T = this.ports.town;
    if (!at || !T || !T.nearby) return [];
    const reg = this.host && this.host.registry;
    return T.nearby(at.x, at.y, 1400, n * 4 + not.length + 12)
      .filter((p) => not.indexOf(p) < 0 && !this.ctx.holders.has(p) && (!reg || !reg.has(p) || reg.owner(p) === 'town') && (!age || this.ageGroup(p) === age)).slice(0, n);
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    this.clock += dt;
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
    for (const o of this.garden) if (o && o.scene) o.destroy();
    this.garden = [];
    if (this.cardView) this.cardView.close();
    if (this.news) this.news.close();
  }
}
