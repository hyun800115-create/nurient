// VillageLife (v2, docs/주민기획.md §4): the residents and pets of the village and everything they do
// on their own — wandering between favourite spots, chatting in pairs / trios, snowball fights, tag,
// the bard's campfire concert, elders dozing on seats, kids building (and knocking down) the snowman,
// pets, shivering, waving at the chief, cheering on unlocks and the village-complete party.
// Also: who has moved in (saved), new residents walking in from the gate, tap reactions.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { Settings } from '../core/Save.js';
import { BALANCE } from '../data/balance.js';
import { WORLD } from '../data/world.js';
import { t, line, getLang } from '../data/strings.js';
import { gdist, gdist2 } from '../core/Iso.js';
import { Resident } from '../entities/Resident.js';
import { DEPTH } from './DepthSort.js';
import { Bubbles } from './Bubbles.js';

const DIR_IDX = { E: 0, SE: 1, S: 2, SW: 3, W: 4, NW: 5, N: 6, NE: 7 };
const DIR_VEC = [[1, 0], [0.7, 0.35], [0, 0.5], [-0.7, 0.35], [-1, 0], [-0.7, -0.35], [0, -0.5], [0.7, -0.35]];
const PLAIN = /^npc_(yellow|red|blue)$/;
// job characters (clerks, porters) are never residents
const NOT_RESIDENT = /^npc_(clerk|porter)_/;
// how much each kind of resident likes each area (VillageLife picks where to go with these weights)
const LIKES = {
  elder: { beach_w: 4, notice: 1, plaza_s: 0.5, green_fire: 3, south: 2, doghouse: 0.5, green_e: 0.8, east_dock: 2, south_fields: 0.8, se_hill: 1.2 },
  kid: { playground: 5, doghouse: 1.2, plaza_s: 0.8, green_e: 3, green_w: 2, notice: 0.4, south: 0.6, east_dock: 0.6, south_fields: 2, se_hill: 2 },
  teen: { notice: 2, plaza_s: 1.5, playground: 1.5, green_e: 2, green_fire: 1.5, beach_w: 0.8, doghouse: 1, south: 0.8, green_w: 1, east_dock: 1.2, south_fields: 1.5, se_hill: 1.2 },
  adult: { notice: 2, plaza_s: 1.6, beach_w: 1.2, doghouse: 1, green_e: 1.6, green_fire: 1.6, south: 1.2, playground: 0.6, green_w: 1, east_dock: 1.4, south_fields: 1.4, se_hill: 1.2 },
};
const CHAT_EMOTES = {
  kid: ['emote_star', 'emote_heart', 'emote_snowball', 'emote_laugh'], prankster: ['emote_snowball', 'emote_laugh', 'emote_idea'],
  teen: ['emote_heart', 'emote_music', 'emote_sparkle', 'emote_love'], showoff: ['emote_thumbs', 'emote_star', 'emote_sparkle'],
  kind: ['emote_heart', 'emote_bread', 'emote_love'], grumpy: ['emote_anger', 'emote_sweat', 'emote_cold'], gentle: ['emote_heart', 'emote_love'],
  easy: ['emote_zzz', 'emote_laugh'], sly: ['emote_idea', 'emote_sparkle', 'emote_thumbs'], shy: ['emote_sweat', 'emote_exclaim'],
  bard: ['emote_music', 'emote_love'], hearty: ['emote_thumbs', 'emote_laugh'], vain: ['emote_sparkle', 'emote_star', 'emote_love'],
  plain: ['emote_fish', 'emote_bread', 'emote_heart', 'emote_dots'],
};

export class VillageLife {
  constructor(gs, saved) {
    this.gs = gs;
    saved = saved || {};
    this.bubbles = new Bubbles(gs);
    this.residents = [];
    this.byKey = {};
    this.queue = [];               // { key, walkIn, at }
    this.props = {};
    this.propList = [];
    this.seats = [];
    this.areas = {};
    this.events = [];
    this.proj = [];
    this.projPool = [];
    this.t = 0;
    this.thinkT = 0.3;
    const L = BALANCE.life;
    this.timers = { chat: 3, snowball: L.snowballEvery * 0.5, tag: L.tagEvery * 0.6, concert: L.concertEvery * 0.4, snowman: 4, wave: 0, pet: 0.5 };
    this.bannerQ = [];
    this.moved = Array.isArray(saved.moved) ? saved.moved.filter((k) => typeof k === 'string' && Assets.m.characters[k] && !NOT_RESIDENT.test(k)) : null;
    // (v3) people who want to move in but there is no room yet (they come when a house is built)
    this.waiting = Array.isArray(saved.waiting) ? saved.waiting.filter((k) => typeof k === 'string' && Assets.m.characters[k] && !NOT_RESIDENT.test(k) && (!this.moved || this.moved.indexOf(k) < 0)) : [];
    this.snowStage = Number.isFinite(saved.snowman) ? Math.max(0, Math.min(3, Math.floor(saved.snowman))) : 0;
    this.snowKeepT = this.snowStage === 3 ? BALANCE.life.snowmanKeep * 0.5 : 0;
    this.snowWork = 0;
    this.lute = null;
    this.camX = gs.player ? gs.player.x : 990; this.camY = gs.player ? gs.player.y : 800;
    this.buildAreas();
    this.buildProps();
    this.buildSeats();
    if (!this.moved) {
      this.moved = [];
      this.queueMoveIn('start', true);
      if (gs.progress.flags.firstSale) this.queueMoveIn('first_sale', true);
      for (const id in gs.progress.done) if (gs.progress.done[id]) this.queueMoveIn(id, true);
    } else for (const k of this.moved) this.queue.push({ key: k, walkIn: false, at: 0 });
    gs.events.on('step', this.onStep, this);
    gs.events.on('flag', this.onFlag, this);
    gs.events.on('region', this.onRegion, this);
    gs.events.once('shutdown', () => { gs.events.off('step', this.onStep, this); gs.events.off('flag', this.onFlag, this); gs.events.off('region', this.onRegion, this); this.stopLute(); });
  }

  // ================================================================ world setup
  buildAreas() {
    const A = (WORLD.life && WORLD.life.areas) || {};
    for (const id in A) {
      const a = A[id];
      if (!a || !Array.isArray(a.at)) continue;
      this.areas[id] = { id, x: a.at[0], y: a.at[1], r: a.r || 120, acts: a.acts || ['wander'], fire: a.fire ? { x: a.fire[0], y: a.fire[1] } : null, stage: a.stage ? { x: a.stage[0], y: a.stage[1] } : null, after: a.after || null, n: 0 };
    }
  }

  // (v3) 'r:<land>' / 'b:<building>' conditions too (Progression.met)
  areaOpen(a) { return !a.after || this.gs.progress.met(a.after); }

  buildProps() {
    const gs = this.gs;
    for (const p of (WORLD.life && WORLD.life.props) || []) {
      const [key, x, y, o] = p;
      const opts = o || {};
      const def = Assets.def(key);
      const isDecal = def.kind === 'decal';
      const fp = def.footprint || [60, 30];
      const r = isDecal || /lantern_string/.test(key) ? 0 : Math.max(10, Math.min(70, fp[0] * 0.36));
      let img;
      if (isDecal) { img = Assets.image(gs, x, y, key).setDepth(DEPTH.GROUND_DECAL + 2); img.__ob = null; gs.statics.push(img); }
      else {
        const r2 = Assets.sprite(key);
        img = gs.add.sprite(x, y, r2.tex, r2.frame).setOrigin(r2.anchor[0], r2.anchor[1]).setDepth(y);
        if (opts.flip) img.setFlipX(true);
        if (opts.scale) { img.setScale(opts.scale); img.__bs = opts.scale; }
        img.__ob = r ? gs.collision.add(x, y, r * (opts.scale || 1), 'life_' + key) : null;
        gs.statics.push(img);
        if ((def.topPx || 0) > 70) gs.addOccluder(img);
        const tw = Assets.spriteAnim(key, 'twinkle');
        if (tw) img.play(tw);
      }
      const rec = { id: opts.id || key + '_' + x, key, x, y, img, def, after: opts.after || null, shown: true };
      if (rec.after && !gs.progress.met(rec.after)) this.setPropShown(rec, false);
      this.props[rec.id] = rec;
      this.propList.push(rec);
    }
    const sm = this.props.snowman;
    if (sm) Assets.apply(sm.img, 'snowman_' + this.snowStage);
  }

  setPropShown(rec, v, pop) {
    rec.shown = v;
    rec.img.setVisible(v);
    if (rec.img.__ob) rec.img.__ob.active = v;
    if (v && pop) {
      const gs = this.gs, o = rec.img, sx = o.scaleX, sy = o.scaleY;
      o.setScale(0.01);
      gs.tweens.add({ targets: o, scaleX: sx, scaleY: sy, duration: 420, ease: 'Back.easeOut' });
      gs.effects.sheet('fx_poof', rec.x, rec.y - 20, { size: 160 });
    }
  }

  buildSeats() {
    const add = (rec, pts, dirs, depthMode, kind) => this.seatsFor(rec, pts, dirs, depthMode, kind);
    for (const rec of this.propList) {
      const d = rec.def;
      if (d.seatPoints && !/kids_swing/.test(rec.key)) add(rec, d.seatPoints, d.seatDirs, d.seatDepth);
    }
    // the village benches (props manifest) get their seats from the `bench_seats` override
    const bs = Assets.def('bench_seats');
    for (const img of this.gs.statics) {
      if (!img.visible || img.frame.name !== 'bench' || img === this.gs.bench) continue;
      const rec = { x: img.x, y: img.y, img, key: 'bench' };
      add(rec, bs.seatPoints || [[-33, -36], [10, -14]], bs.seatDirs || ['SW', 'SW'], bs.seatDepth || 'front');
      add(rec, bs.petPoints || [[0, -30]], ['SW'], 'front', 'pet');
    }
    for (const s of this.seats) s.area = this.nearestArea(s.x, s.y, 260);
  }

  /** seats of a prop (rec: { x, y, img, key }) at its seat points; returns the new seats */
  seatsFor(rec, pts, dirs, depthMode, kind) {
    const out = [];
    if (!Array.isArray(pts)) return out;
    const sc = rec.scale || 1;
    pts.forEach((q, i) => {
      if (!Array.isArray(q)) return;
      const dir = DIR_IDX[(dirs && dirs[i]) || 'S'] !== undefined ? DIR_IDX[(dirs && dirs[i]) || 'S'] : 2;
      const flip = !!(rec.img && rec.img.flipX);
      const sx = rec.x + q[0] * sc * (flip ? -1 : 1), sy = rec.y + q[1] * sc;
      const v = DIR_VEC[dir];
      const seat = {
        prop: rec, x: sx, y: sy, dir: flip ? (dir === 1 ? 3 : dir === 3 ? 1 : dir) : dir, kind: kind || 'seat', by: null,
        standX: sx + v[0] * 40, standY: sy + Math.max(18, v[1] * 40 + 22),
        depth: depthMode === 'behind' ? undefined : rec.y + 1 + q[1] * 0.001,
      };
      this.gs.collision.resolve(seat.standXY = { x: seat.standX, y: seat.standY }, 12);
      seat.standX = seat.standXY.x; seat.standY = seat.standXY.y;
      this.seats.push(seat);
      out.push(seat);
    });
    return out;
  }

  /** (v4-C) a place built later (decor, the town hall): residents go there too. cfg: { at, r, acts, fire } */
  addArea(id, cfg) {
    if (!cfg || !Array.isArray(cfg.at)) return null;
    const a = this.areas[id] = { id, x: cfg.at[0], y: cfg.at[1], r: cfg.r || 120, acts: cfg.acts || ['wander'], fire: cfg.fire ? { x: cfg.fire[0], y: cfg.fire[1] } : null, stage: null, after: null, n: 0 };
    return a;
  }

  /** (v4-C) seats of a prop built later, belonging to area `a` */
  addSeats(rec, pts, dirs, depthMode, a) {
    const ss = this.seatsFor(rec, pts, dirs, depthMode);
    for (const s of ss) s.area = a || this.nearestArea(s.x, s.y, 260);
    return ss;
  }

  nearestArea(x, y, maxD) {
    let best = null, bd = maxD || 1e9;
    for (const id in this.areas) { const a = this.areas[id]; const d = gdist(x, y, a.x, a.y); if (d < bd) { bd = d; best = a; } }
    return best;
  }

  /** someone already stands (or is heading) near (x, y)? */
  crowded(x, y, me, d = 40) {
    const d2 = d * d;
    for (const r of this.residents) {
      if (r === me) continue;
      if (gdist2(x, y, r.x, r.y) < d2) return true;
      const e = r.state === 'move' && r.route[r.route.length - 1];
      if (e && gdist2(x, y, e.x, e.y) < d2) return true;
    }
    for (const pad of this.gs.padSpots || []) if (gdist2(x, y, pad.x, pad.y) < pad.r * pad.r) return true;
    return false;
  }

  /** a free spot inside area `a` (not blocked, not on a pad, not on top of someone) */
  pointIn(a, out, me) {
    out = out || {};
    const col = this.gs.collision;
    for (let i = 0; i < 14; i++) {
      const ang = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * a.r;
      const x = a.x + Math.cos(ang) * rr, y = a.y + Math.sin(ang) * rr * 0.5;
      if (!col.blocked(x, y, 14) && (i > 10 || !this.crowded(x, y, me))) { out.x = x; out.y = y; return out; }
    }
    out.x = a.x; out.y = a.y;
    col.resolve(out, 14);
    return out;
  }

  // ================================================================ population
  /** queue the residents that move in after step `id` (instant = restoring a save) */
  queueMoveIn(id, instant) {
    const list = (WORLD.life && WORLD.life.moveIns && WORLD.life.moveIns[id]) || [];
    const gs = this.gs;
    let i = 0;
    const names = [];
    let waited = 0;
    for (const k of list) {
      if (this.moved.indexOf(k) >= 0 || this.waiting.indexOf(k) >= 0 || !Assets.m.characters[k] || NOT_RESIDENT.test(k)) continue;    // no art for this one (yet): skip
      // (v3) people need room in the village (pets always come along)
      if (!this.isPetKey(k) && this.people() >= gs.popCap()) { this.waiting.push(k); waited++; continue; }
      this.moved.push(k);
      const at = instant ? 0 : this.t + BALANCE.population.moveInDelay + i * BALANCE.population.moveInGap;
      this.queue.push({ key: k, walkIn: !instant, at });
      if (!instant) names.push(k);
      i++;
    }
    if (names.length) this.bannerQ.push({ at: this.t + BALANCE.population.moveInDelay, keys: names });
    if (waited && !instant) {
      gs.time.delayedCall(BALANCE.population.moveInDelay * 1000 + 600, () => gs.ui.toast(t('needHouses', { n: this.waiting.length })));
      gs.events.emit('waitingHouse', this.waiting.length);
    }
    gs.updatePopulation && gs.updatePopulation();
  }

  isPetKey(k) { const d = Assets.m.characters[k]; return !!(d && d.kind === 'pet'); }
  /** residents who live here (pets not counted); (v4-C) + the settlers who moved into empty houses */
  people() { let n = 0; for (const k of this.moved) if (!this.isPetKey(k)) n++; const c = this.gs.civic; return n + (c ? c.settlers : 0); }

  /** people of every step done so far (and of the steps to come) who have no home yet */
  futurePeople() {
    const mi = (WORLD.life && WORLD.life.moveIns) || {};
    let n = 0;
    for (const id in mi) for (const k of mi[id]) if (Assets.m.characters[k] && !NOT_RESIDENT.test(k) && !this.isPetKey(k) && this.moved.indexOf(k) < 0 && this.waiting.indexOf(k) < 0) n++;
    return n;
  }

  /** (v3) is another house useful? (someone waits now, or will come and find no room) */
  wantsHouse() {
    const gs = this.gs;
    let building = 0;
    for (const id in gs.sites) { const st = gs.sites[id]; if (st.state !== 'plot' && st.state !== 'done' && /^house_/.test(st.building)) building += Math.max(0, Math.floor(Number((BALANCE.buildings[st.building] || {}).people) || 0)); }
    const room = gs.popCap() + building - this.people();
    return this.waiting.length + this.futurePeople() > room;
  }

  /** (v3) a house was built: people waiting for a home move in (they walk to their new house) */
  capChanged(house, instant) {
    const gs = this.gs;
    const names = [];
    let i = 0;
    while (this.waiting.length && this.people() < gs.popCap()) {
      const k = this.waiting.shift();
      this.moved.push(k);
      this.queue.push({ key: k, walkIn: !instant, at: instant ? 0 : this.t + 1.5 + i * BALANCE.population.moveInGap, house: instant ? null : house });
      if (!instant) names.push(k);
      i++;
    }
    if (names.length) this.bannerQ.push({ at: this.t + 1.5, keys: names });
    gs.updatePopulation && gs.updatePopulation();
  }

  /** step finished without fanfare (test hook unlockAll): residents + props appear right away */
  stepInstant(id) {
    this.queueMoveIn(id, true);
    for (const r of this.propsAfter(id)) this.setPropShown(r, true);
  }

  onStep(id) { this.queueMoveIn(id, false); const d = this.propsAfter(id); if (d.length) this.gs.time.delayedCall(1600, () => { for (const r of d) this.setPropShown(r, true, true); }); this.buildSeatsFor(d); }
  onFlag(f) { if (f === 'firstSale') this.queueMoveIn('first_sale', false); }
  /** (v3) new land: its props (seats, toys) appear */
  onRegion(id, instant) {
    const d = this.propList.filter((r) => r.after === 'r:' + id && !r.shown);
    if (instant) for (const r of d) this.setPropShown(r, true);
    else if (d.length) this.gs.time.delayedCall(1800, () => { for (const r of d) this.setPropShown(r, true, true); });
  }

  propsAfter(id) { return this.propList.filter((r) => r.after === id && !r.shown); }
  buildSeatsFor() { /* seats exist from the start; hidden props' seats are skipped while hidden */ }

  activeCount() { return this.residents.length; }

  spawn(q) {
    const gs = this.gs;
    if (this.byKey[q.key]) return true;
    if (this.residents.length >= BALANCE.population.maxActive) {
      // make room: an ordinary parka villager steps aside for a named one
      const plain = this.residents.find((r) => PLAIN.test(r.key) && !r.event);
      if (!plain || PLAIN.test(q.key)) return true;
      this.despawn(plain);
    }
    let x, y;
    const def = Assets.charDef(q.key);
    const role = def.kind === 'pet' ? 'pet' : def.role || 'adult';
    if (q.walkIn) {
      // walk in from the village gate, appearing just off-screen on the road toward the chief
      const p = q.house ? { x: q.house.door.x, y: q.house.door.y - 60 } : gs.player;
      const gate = gs.roads.byId[(WORLD.life && WORLD.life.gate) || 'gate'] || { x: 990, y: 2560 };
      const path = gs.roads.route(gate.x, gate.y, p.x, p.y + 60, []);
      const pts = [{ x: gate.x, y: gate.y }].concat(path);
      let sx = gate.x, sy = gate.y;
      for (let i = pts.length - 1; i > 0; i--) {
        const a = pts[i - 1], b = pts[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        let found = false;
        for (let d = 0; d <= len; d += 20) {
          const x2 = b.x + ((a.x - b.x) * d) / len, y2 = b.y + ((a.y - b.y) * d) / len;
          if (!gs.isOnScreen(x2, y2, 90)) { sx = x2; sy = y2; found = true; break; }
        }
        if (found) break;
      }
      x = sx; y = sy;
    } else {
      const a = this.pickArea({ role, isPet: role === 'pet', key: q.key }, true) || Object.values(this.areas)[0];
      const pt = a ? this.pointIn(a) : { x: 990, y: 900 };
      x = pt.x; y = pt.y;
    }
    const r = new Resident(gs, this, q.key, x, y);
    this.residents.push(r);
    this.byKey[q.key] = r;
    gs.agents.push(r);     // walkers keep a little distance from each other
    if (q.walkIn && q.house) {
      // (v3) a new family walks to its new house, then says hello
      r.job = { kind: 'arrive', t: 0, house: q.house };
      r.goTo(q.house.door.x + (Math.random() - 0.5) * 30, q.house.door.y + 10, { tol: 20 });
    } else if (q.walkIn) {
      r.job = { kind: 'arrive', t: 0 };
      const p = gs.player;
      r.goTo(p.x + (Math.random() - 0.5) * 80, p.y + 60, { tol: 30 });
    } else if (!gs.isOnScreen(x, y, 60)) { /* appears quietly */ }
    else { r.sprite.setAlpha(0); r.shadow.setAlpha(0); gs.tweens.add({ targets: [r.sprite, r.shadow], alpha: 1, duration: 500 }); }
    return true;
  }

  despawn(r) {
    const i = this.residents.indexOf(r);
    if (i >= 0) this.residents.splice(i, 1);
    if (this.byKey[r.key] === r) delete this.byKey[r.key];
    if (r.event) r.event.drop(r);
    this.bubbles.clear(r);
    const ai = this.gs.agents.indexOf(r);
    if (ai >= 0) this.gs.agents.splice(ai, 1);
    r.destroy();
  }

  /** a key started being used by a clerk / porter: that resident leaves (she took the job) */
  release(key) {
    const r = this.byKey[key];
    if (!r) return;
    this.gs.effects.sheet('fx_poof', r.x, r.y - 30, { size: 140 });
    this.despawn(r);
  }

  showMoveInBanner(keys) {
    const lang = getLang();
    const names = keys.map((k) => Assets.charName(k, lang) || k);
    if (!names.length) return;
    const msg = names.length <= 2 ? t('moveIn', { name: names.join(lang === 'ko' ? ', ' : ' & ') }) : t('moveInMany', { name: names[0], n: names.length - 1 });
    this.gs.ui.toastBig ? this.gs.ui.toastBig(msg) : this.gs.ui.banner(msg);
  }

  // ================================================================ lines & sounds
  line(r, cat) {
    if (cat === 'persona') {
      // ---- (v4-A) after the mine opens, a rumour now and then: a railway beyond the eastern fog
      const gs = this.gs;
      if (gs.progress && gs.progress.isDone('zone_mine') && gs.territory && !gs.territory.isOpen('rail') && Math.random() < 0.12) return line('rumor') || line(r.persona) || line('plain');
      cat = r.persona;
    }
    return line(cat) || line('plain');
  }

  chatter(r) {
    const high = r.role === 'kid' || r.role === 'teen';
    const k = Assets.audioGroup(high ? 'sfx_chatter_hi' : 'sfx_chatter_lo') ? (high ? 'sfx_chatter_hi' : 'sfx_chatter_lo') : Assets.audioGroup('sfx_chatter') ? 'sfx_chatter' : null;
    if (!k) return;
    const rate = r.role === 'kid' ? 1.12 : r.role === 'elder' ? 0.88 : 1;
    this.gs.sfxAt(k, r.x, r.y, { volume: 0.4, rate: rate * (0.95 + Math.random() * 0.1), throttle: 250 });
  }

  sfx(key, x, y, vol = 0.5, fb) {
    const k = Assets.audioDef(key) || Assets.audioGroup(key) ? key : fb;
    if (k) this.gs.sfxAt(k, x, y, { volume: vol, throttle: 120 });
  }

  // ================================================================ update
  update(dt) {
    const gs = this.gs;
    this.t += dt;
    // spawns (art may still be loading)
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      if (q.at > this.t) continue;
      if (!Assets.charReady(q.key)) { if (!Assets.charPending(q.key)) this.queue.splice(i, 1); continue; }
      if (gs.keysInUse.has(q.key)) { this.queue.splice(i, 1); continue; }
      this.queue.splice(i, 1);
      this.spawn(q);
    }
    for (let i = this.bannerQ.length - 1; i >= 0; i--) {
      const b = this.bannerQ[i];
      if (b.at > this.t) continue;
      this.bannerQ.splice(i, 1);
      const ready = b.keys.filter((k) => Assets.charReady(k) || Assets.charPending(k));
      this.showMoveInBanner(ready);
    }
    const view = gs.cameras.main.worldView;
    this.camX = view.centerX; this.camY = view.centerY;
    for (let i = 0; i < this.residents.length; i++) {
      const r = this.residents[i];
      r.update(dt, view);
      if (r.job) this.jobUpdate(r, dt);
    }
    for (let i = this.events.length - 1; i >= 0; i--) {
      const ev = this.events[i];
      if (ev.update(dt) === false) { ev.end(); this.events.splice(i, 1); }
    }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.5; this.think(0.5); }
    this.updateProjectiles(dt);
    this.bubbles.update(dt);
    this.updateSnowman(dt);
  }

  think(dt) {
    const gs = this.gs, T = this.timers, L = BALANCE.life;
    for (const k in T) T[k] -= dt;
    for (const r of this.residents) if (!r.job && !r.event) this.assignJob(r);
    this.greetChief();
    // the swing moves while a kid plays next to it
    const sw = this.props.swing;
    if (sw && sw.shown && sw.img.anims) {
      const kid = this.residents.some((r) => r.role === 'kid' && !r.lod && gdist(r.x, r.y, sw.x, sw.y) < 150);
      const k = Assets.spriteAnim('kids_swing', 'swing');
      if (k && kid && !sw.img.anims.isPlaying) sw.img.play(k);
      else if (!kid && sw.img.anims.isPlaying) { sw.img.stop(); Assets.apply(sw.img, 'kids_swing'); }
    }
    if (T.chat <= 0) { T.chat = L.chatEvery * (0.6 + Math.random() * 0.8); this.tryChat(); }
    if (T.snowball <= 0) { T.snowball = L.snowballEvery * (0.6 + Math.random() * 0.8); this.trySnowball(); }
    if (T.tag <= 0) { T.tag = L.tagEvery * (0.7 + Math.random() * 0.6); this.tryTag(); }
    if (T.concert <= 0) { T.concert = L.concertEvery * (0.8 + Math.random() * 0.4); this.tryConcert(); }
    if (T.snowman <= 0) { T.snowman = 3; this.trySnowman(); }
    this.updateLute();
  }

  // ================================================================ solo jobs
  /** weighted pick of where to go next (most life happens near the camera) */
  pickArea(r, any) {
    const likes = LIKES[r.role] || LIKES.adult;
    let tot = 0;
    const cand = [];
    for (const id in this.areas) {
      const a = this.areas[id];
      if (!this.areaOpen(a)) continue;
      let w = likes[id] !== undefined ? likes[id] : 0.5;
      if (r.key === 'npc_bard' && id === 'green_fire') w += 2;
      if (/skater/.test(r.key) && id === 'green_e') w += 3;
      if (!any) {
        const d = gdist(a.x, a.y, this.camX, this.camY);
        w *= d < 650 ? 3 : d < 1100 ? 1.2 : 0.5;
        w /= 1 + a.n * 0.35;            // crowded places are less attractive
        if (r.area === a) w *= 0.5;      // try somewhere else
      }
      if (w <= 0) continue;
      cand.push([a, w]); tot += w;
    }
    let x = Math.random() * tot;
    for (const [a, w] of cand) { x -= w; if (x <= 0) return a; }
    return cand.length ? cand[cand.length - 1][0] : null;
  }

  setArea(r, a) { if (r.area) r.area.n--; r.area = a; if (a) a.n++; }

  assignJob(r) {
    if (r.isPet) { r.job = { kind: 'pet', t: 0, phase: 'think' }; return; }
    const L = BALANCE.life;
    const a = this.pickArea(r);
    if (!a) { r.job = { kind: 'idle', t: 3 }; return; }
    this.setArea(r, a);
    r.job = { kind: 'stay', phase: 'travel', left: L.stayMin + Math.random() * (L.stayMax - L.stayMin), t: 0 };
    const pt = this.pointIn(a, null, r);
    r.goTo(pt.x, pt.y, { tol: 14 });
  }

  endJob(r) { if (r.seat) { r.unsit(); r.stand(); } r.job = null; }

  jobUpdate(r, dt) {
    const j = r.job;
    j.t += dt;
    switch (j.kind) {
      case 'idle': if (j.t > 3) this.endJob(r); break;
      case 'arrive': this.jobArrive(r, j); break;
      case 'stay': this.jobStay(r, j, dt); break;
      case 'pet': this.jobPet(r, j, dt); break;
      default: if (j.t > 10) this.endJob(r);
    }
  }

  jobArrive(r, j) {
    const p = this.gs.player;
    if (j.phase === 'hello') {
      if (j.t > 2.4) this.endJob(r);
      return;
    }
    const near = !j.house && gdist(r.x, r.y, p.x, p.y) < 150;
    if (r.arrived || near || j.t > 30) {
      if (j.house && !j.atDoor) { j.atDoor = true; this.gs.effects.burst('heart', r.x, r.y + r.headTop, 4); }
      r.state = 'idle';
      r.faceTo(p.x, p.y);
      r.act('wave', 2.2);
      r.emote(Assets.pick('emote_wave', 'emote_heart'), 1.8);
      r.say('moveIn', null, 2.4);
      j.phase = 'hello'; j.t = 0;
    } else if (!j.house && j.t > 3 && Math.floor(j.t) % 4 === 0 && r.arrived === false && j.re !== Math.floor(j.t)) {
      // the chief moves around: follow him
      j.re = Math.floor(j.t);
      if (gdist(r.route[r.route.length - 1].x, r.route[r.route.length - 1].y, p.x, p.y) > 200) r.goTo(p.x, p.y + 60, { tol: 30 });
    }
  }

  jobStay(r, j, dt) {
    const a = r.area;
    if (!a) { this.endJob(r); return; }
    if (j.phase === 'travel') {
      if (!r.arrived) return;
      j.phase = 'here'; j.next = 0;
    }
    j.left -= dt;
    if (j.left <= 0 && !r.seat) { this.endJob(r); return; }
    if (j.phase === 'sitting') {
      if (j.left <= 0 || j.sitLeft <= 0) { this.stopSitting(r); this.endJob(r); return; }
      j.sitLeft -= dt;
      return;
    }
    if (j.phase === 'walk') { if (r.arrived) { j.phase = 'here'; j.next = 1 + Math.random() * 2; } return; }
    if (r.state === 'act' && r.actT > 0) return;
    j.next -= dt;
    if (j.next > 0) return;
    j.next = 2.5 + Math.random() * 4;
    // a little something to do here
    const acts = a.acts;
    const roll = Math.random();
    if (acts.indexOf('sit') >= 0 && r.canSit && (r.role === 'elder' ? roll < 0.85 : roll < 0.25)) {
      const s = this.freeSeat(r, a);
      if (s) { this.goSit(r, j, s); return; }
    }
    if (a.fire && acts.indexOf('warm') >= 0 && Math.random() < 0.35) {
      // a spot beside the fire (left / right, in front of the seats), not on anything
      for (let k = 0; k < 6; k++) {
        const side = Math.random() < 0.5 ? -1 : 1;
        const x = a.fire.x + side * (62 + Math.random() * 26), y = a.fire.y + 6 + Math.random() * 26;
        if (this.gs.collision.blocked(x, y, 12) || this.crowded(x, y, r, 34)) continue;
        r.goTo(x, y, { tol: 10, direct: true });
        j.phase = 'walk'; j.warm = a.fire;
        return;
      }
    }
    if (j.warm) { r.faceTo(j.warm.x, j.warm.y); r.act(Math.random() < 0.5 ? 'happy' : 'idle', 1.6); if (Math.random() < 0.3) r.say('warm', 'emote_heart'); j.warm = null; return; }
    if (acts.indexOf('read') >= 0 && Math.random() < 0.4) {
      const nb = this.props.notice;
      if (nb && nb.shown) {
        const gp = (nb.def.gatherPoints || [[0, 28]])[Math.floor(Math.random() * (nb.def.gatherPoints || [1]).length)];
        r.goTo(nb.x + gp[0], nb.y + gp[1], { tol: 8, direct: true });
        j.phase = 'walk'; j.read = nb;
        return;
      }
    }
    if (j.read) { r.faceTo(j.read.x, j.read.y - 40); r.stand(); if (Math.random() < 0.35) r.say('read', 'emote_question'); j.read = null; j.next = 3 + Math.random() * 3; return; }
    if (r.shiverCd <= 0 && Math.random() < BALANCE.life.shiverChance * 3) {
      r.shiverCd = 25 + Math.random() * 30;
      r.act('shiver', 1.8);
      r.emote(Assets.pick('emote_cold', 'emote_sweat'), 1.8);
      if (Math.random() < 0.35) r.say('cold', null, 2);
      return;
    }
    // skaters glide around the ice rink
    const rink = this.props.rink;
    if (r.can('skate') && rink && rink.shown && gdist(r.x, r.y, rink.x, rink.y) < 420 && Math.random() < 0.8) {
      const ang = Math.random() * Math.PI * 2;
      r.goTo(rink.x + Math.cos(ang) * 85, rink.y + Math.sin(ang) * 26, { run: true, skate: true, tol: 10, direct: true, speed: r.runSpeed * 0.8 });
      j.phase = 'walk';
      return;
    }
    if (Math.random() < 0.55) {
      const pt = this.pointIn(a, null, r);
      r.goTo(pt.x, pt.y, { tol: 12, direct: true });
      j.phase = 'walk';
      return;
    }
    // look around / small mood
    r.dir = [1, 2, 3, 0, 4][Math.floor(Math.random() * 5)];
    const m = Math.random();
    r.act(m < 0.12 && r.can('laugh') ? 'laugh' : m < 0.22 ? 'happy' : 'idle', 1.5);
  }

  freeSeat(r, a) {
    let best = null, bd = 1e12;
    for (const s of this.seats) {
      if (s.by || s.kind !== 'seat' || (s.area !== a) || (s.prop.shown === false) || (s.prop.img && !s.prop.img.visible)) continue;
      const d = gdist2(r.x, r.y, s.x, s.y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  goSit(r, j, s) {
    s.by = r;
    j.phase = 'toSeat'; j.seat = s;
    r.goTo(s.standX, s.standY, { tol: 10, direct: true });
    j.toSeatCheck = true;
    j.sitLeft = r.role === 'elder' ? 30 + Math.random() * 40 : 12 + Math.random() * 14;
    // handled in pollSit
    const poll = () => {
      if (r.job !== j || !r.alive) { if (s.by === r && !r.seat) s.by = null; return; }
      if (!r.arrived) { this.gs.time.delayedCall(200, poll); return; }
      r.sitOn(s, r.can('sit') ? 'sit' : 'loaf');
      j.phase = 'sitting';
      j.left = Math.max(j.left, j.sitLeft);
      // grandpa nods off
      if (r.key === 'npc_grandpa' || (r.role === 'elder' && Math.random() < 0.4)) this.zzz(r);
    };
    this.gs.time.delayedCall(200, poll);
  }

  stopSitting(r) {
    if (r.seat) r.unsit();
    r.stopFx();
    r.stand();
  }

  zzz(r) {
    const gs = this.gs;
    const fx = gs.effects.loop('fx_zzz', r.x, r.y + r.headTop, 70, DEPTH.BUBBLE);
    if (fx) { if (r.sprite.flipX) fx.setFlipX(true); r.fxDx = r.sprite.flipX ? -8 : 8; r.fxDy = 4; r.attachFx(fx); }
    else r.emote('emote_zzz', 3);
  }

  // ---------------------------------------------------------------- pets
  jobPet(r, j, dt) {
    const gs = this.gs, p = gs.player;
    j.cd = (j.cd || 0) - dt;
    if (r.key === 'pet_dog') {
      // (v3.5) the dog plays with the chief (whistle / bar): DogPlay moves it
      if (this.gs.dog && this.gs.dog.busy) return;
      // (v3.5) it no longer follows the chief: it roams — plays with the kids, naps at the dog house,
      // warms up by a campfire, sniffs around; a happy hello when the chief stops close by
      const dp = gdist(r.x, r.y, p.x, p.y);
      const chiefMoving = p.vx * p.vx + p.vy * p.vy > 400;
      if (dp < 110 && !chiefMoving && r.arrived && !r.seat && j.cd <= 0) {
        j.cd = 14 + Math.random() * 8;
        r.faceTo(p.x, p.y);
        r.act('happy', 1.4);
        r.emote('emote_heart', 1.4);
        this.sfx('sfx_dog_bark', r.x, r.y, 0.45);
        return;
      }
      if (r.arrived && j.t > (j.wait || 4)) {
        j.t = 0;
        j.wait = 5 + Math.random() * 8;
        const roll = Math.random();
        const kid = this.residents.find((k) => k.role === 'kid' && !k.isPet && !k.lod && gdist(k.x, k.y, r.x, r.y) < 600);
        const fires = Object.values(this.areas).filter((a) => a.fire && this.areaOpen(a));
        if (kid && roll < 0.38) { r.goTo(kid.x + 40, kid.y + 20, { run: true, tol: 30, direct: gdist(kid.x, kid.y, r.x, r.y) < 320 }); j.after = 'happy'; }
        else if (roll < 0.62 && this.props.doghouse) { const dh = this.props.doghouse; const dp2 = dh.def.doorPoint || [0, 26]; r.goTo(dh.x + dp2[0], dh.y + dp2[1] + 6, { tol: 8 }); j.after = 'nap'; }
        else if (roll < 0.82 && fires.length) {
          const a = fires.sort((u, v) => gdist(u.fire.x, u.fire.y, r.x, r.y) - gdist(v.fire.x, v.fire.y, r.x, r.y))[Math.floor(Math.random() * Math.min(2, fires.length))];
          const ang = Math.random() * Math.PI * 2;
          const pt = { x: a.fire.x + Math.cos(ang) * 70, y: a.fire.y + 16 + Math.sin(ang) * 30 };
          this.gs.collision.resolve(pt, 12);
          r.goTo(pt.x, pt.y, { tol: 12 }); j.after = 'warm'; j.fire = a.fire;
        } else { const a = this.pickArea(r); if (a) { const pt = this.pointIn(a); r.goTo(pt.x, pt.y, { tol: 14 }); } j.after = null; }
      } else if (r.arrived && j.after) {
        const what = j.after; j.after = null;
        if (what === 'nap') { r.dir = 2; r.act('sit', 5 + Math.random() * 5); if (Math.random() < 0.5) r.emote('emote_zzz', 2); j.wait = 8 + Math.random() * 6; }
        else if (what === 'warm') { if (j.fire) r.faceTo(j.fire.x, j.fire.y); r.act('sit', 4 + Math.random() * 4); j.wait = 7 + Math.random() * 5; }
        else if (what === 'happy') { r.act('happy', 1.4); if (Math.random() < 0.5) r.emote('emote_heart', 1.2); }
      }
      return;
    }
    if (r.key === 'pet_cat') {
      // loafs on the bench / by the notice board / at the lodge; wanders off now and then
      if (j.phase === 'loaf') { if (j.t > j.dur) { if (r.seat) r.unsit(); j.phase = 'think'; j.t = 0; r.stand(); } else if (gdist(r.x, r.y, p.x, p.y) < 90 && j.cd <= 0) { j.cd = 12; r.emote('emote_heart', 1.2); this.sfx('sfx_cat_meow', r.x, r.y, 0.45); } return; }
      if (j.phase === 'go') {
        if (!r.arrived) return;
        if (j.seat && !j.seat.by) r.sitOn(j.seat, r.can('loaf') ? 'loaf' : 'sit');
        else { r.dir = 2; r.act(r.can('loaf') ? 'loaf' : 'sit', -1); }
        j.phase = 'loaf'; j.t = 0; j.dur = 25 + Math.random() * 35;
        return;
      }
      const petSeats = this.seats.filter((s) => s.kind === 'pet' && !s.by && (!s.prop.img || s.prop.img.visible));
      const s = petSeats.length && Math.random() < 0.6 ? petSeats[Math.floor(Math.random() * petSeats.length)] : null;
      if (s) { j.seat = s; s.by = r; r.goTo(s.standX, s.standY, { tol: 8 }); }
      else { j.seat = null; const a = this.pickArea(r); const pt = a ? this.pointIn(a) : { x: r.x, y: r.y }; r.goTo(pt.x, pt.y, { tol: 10 }); }
      j.phase = 'go'; j.t = 0;
      return;
    }
    // penguin (and any other pet): waddle around, flap happily now and then
    if (r.arrived && j.t > 2 + Math.random() * 3) {
      j.t = 0;
      if (Math.random() < 0.3) { r.act('happy', 1.2); return; }
      const a = r.area && Math.random() < 0.7 ? r.area : this.pickArea(r);
      if (a) { this.setArea(r, a); const pt = this.pointIn(a); r.goTo(pt.x, pt.y, { tol: 12, speed: r.walkSpeed * 0.6 }); }
    }
  }

  // ================================================================ chief
  greetChief() {
    const gs = this.gs, p = gs.player, L = BALANCE.life;
    if (this.timers.wave > 0) return;
    if (p.vx * p.vx + p.vy * p.vy < 900) return;
    let best = null, bd = L.waveRange;
    for (const r of this.residents) {
      if (r.isPet || r.event || r.lod || r.waveCd > 0 || r.state === 'move') continue;
      const d = gdist(r.x, r.y, p.x, p.y);
      if (d < bd) { bd = d; best = r; }
    }
    if (!best) return;
    this.timers.wave = 3 + Math.random() * 3;
    best.waveCd = L.waveCooldown * (0.8 + Math.random() * 0.4);
    if (best.seat) { best.emote(Assets.pick('emote_wave', 'emote_heart'), 1.5); return; }
    best.faceTo(p.x, p.y);
    best.act('wave', 1.4);
    best.emote(Math.random() < 0.5 ? Assets.pick('emote_wave', 'emote_heart') : 'emote_heart', 1.5);
    if (Math.random() < 0.35) best.say('greet', null, 2);
    if (best.job && best.job.kind === 'stay') best.job.next = 1.6;
  }

  /** tap / click at world point: a resident or pet reacts */
  tap(wx, wy) {
    let best = null, bd = 1e12;
    for (const r of this.residents) {
      if (r.lod || !r.sprite.visible) continue;
      const top = r.y + r.headTop - 14, bot = r.y + 10;
      if (wy < top || wy > bot || Math.abs(wx - r.x) > 34) continue;
      const d = Math.abs(wx - r.x) + Math.abs(wy - (r.y + r.headTop / 2));
      if (d < bd) { bd = d; best = r; }
    }
    // ---- (v4-A) a townsperson (in the town, a train visitor, a customer from the town): name card
    if (!best) return this.gs.v4 && this.gs.v4.tap ? this.gs.v4.tap(wx, wy) : false;
    return this.react(best);
  }

  /** a tapped resident / pet reacts (wave + name + line; pets: happy + heart) */
  react(r) {
    const p = this.gs.player;
    // (v3.5) tapping the dog calls it / opens its play bar
    if (r.key === 'pet_dog' && this.gs.dog) return this.gs.dog.onTap(r);
    if (r.isPet) {
      r.faceTo(p.x, p.y);
      if (!r.seat) r.act('happy', 1.6);
      r.emote('emote_heart', 1.5);
      this.gs.effects.sheet('fx_hearts', r.x, r.y + r.headTop, { size: 90 });
      this.sfx(r.key === 'pet_dog' ? 'sfx_dog_bark' : r.key === 'pet_cat' ? 'sfx_cat_meow' : 'sfx_penguin', r.x, r.y, 0.55);
      return r;
    }
    if (!r.event && !r.seat) { r.faceTo(p.x, p.y); r.act(Math.random() < 0.5 && r.can('surprised') ? 'surprised' : 'wave', 1.3); if (r.job && r.job.kind === 'stay') r.job.next = 1.6; }
    r.say(r.name + '\n' + (Math.random() < 0.5 ? line('tap') : this.line(r, 'persona')), Math.random() < 0.5 ? 'emote_exclaim' : 'emote_heart', 2.8, true);
    return r;
  }

  /** a zone opened: everyone nearby cheers */
  cheer() {
    const gs = this.gs;
    let said = 0;
    for (const r of this.residents) {
      if (r.lod || r.event) continue;
      if (r.key === 'pet_dog' && this.gs.dog && this.gs.dog.busy) continue;
      if (r.seat) { r.emote('emote_star', 2); continue; }
      r.state = 'idle';
      r.dir = 2;
      r.act('happy', 2.4);
      gs.time.delayedCall(Math.random() * 400, () => { if (r.alive && !r.lod) gs.effects.sheet('fx_hearts', r.x, r.y + r.headTop, { size: 96 }); });
      r.emote(Math.random() < 0.5 ? 'emote_star' : 'emote_heart', 2);
      if (said < 2 && Math.random() < 0.6) { said++; gs.time.delayedCall(500 + said * 500, () => r.alive && r.say(r.isPet ? 'plain' : 'cheer', null, 2.2)); }
      if (r.job && r.job.kind === 'stay') r.job.next = 2.6;
    }
    this.sfx('sfx_cheer', this.camX, this.camY, 0.55);
  }

  // ================================================================ events
  candidates(filter, onScreenFirst = true) {
    const out = [];
    const force = this.force;     // test hook: also people who are walking / sitting / chatting / off-screen
    for (const r of this.residents) {
      if (r.isPet || (r.job && r.job.kind === 'arrive')) continue;
      if (r.event && !(force && r.event.kind !== 'party')) continue;
      if (!force && (r.seat || r.state === 'move')) continue;
      if (filter && !filter(r)) continue;
      out.push(r);
    }
    if (force) for (const r of out) if (r.event) r.event.drop(r);
    if (onScreenFirst) out.sort((a, b) => (a.lod - b.lod) || (gdist2(a.x, a.y, this.camX, this.camY) - gdist2(b.x, b.y, this.camX, this.camY)));
    return out;
  }

  start(ev) { this.events.push(ev); return ev; }

  tryChat() {
    const c = this.candidates((r) => this.force || !r.lod);
    for (let i = 0; i < c.length; i++) {
      const a = c[i];
      const near = c.filter((b) => b !== a && gdist(a.x, a.y, b.x, b.y) < 260);
      if (!near.length) continue;
      const group = [a, near[0]];
      if (near[1] && gdist(near[1].x, near[1].y, a.x, a.y) < 220 && Math.random() < 0.5) group.push(near[1]);
      this.start(new ChatEvent(this, group));
      return { key: a.key, x: Math.round(a.x), y: Math.round(a.y) };
    }
    return false;
  }

  trySnowball() {
    const throwers = this.candidates((r) => r.can('throw') && (this.force || !r.lod));
    const far = this.force ? 700 : 330;
    for (const th of throwers) {
      const targets = this.candidates((r) => r !== th && (this.force || !r.lod)).filter((r) => { const d = gdist(th.x, th.y, r.x, r.y); return d > (this.force ? 60 : 110) && d < far; });
      if (!targets.length) continue;
      this.start(new SnowballEvent(this, th, targets[Math.floor(Math.random() * targets.length)]));
      return { key: th.key, x: Math.round(th.x), y: Math.round(th.y) };
    }
    return false;
  }

  tryTag() {
    const kids = this.candidates((r) => (r.role === 'kid' || /skater|toddler/.test(r.key)) && r.can('run') && (this.force || !r.lod));
    if (kids.length < 2) return false;
    // (v4-B) any kid can start it: the first one alone used to fail whenever it had wandered off from the others
    const R = this.force ? 900 : 420;
    let a = null, group = [];
    for (const k0 of kids) {
      const g = kids.filter((k) => gdist(k.x, k.y, k0.x, k0.y) < R);
      if (g.length >= 2) { a = k0; group = [k0].concat(g.filter((k) => k !== k0)).slice(0, 4); break; }
    }
    if (!a) return false;
    const dog = this.byKey.pet_dog;
    if (dog && !dog.event && !(this.gs.dog && this.gs.dog.busy) && gdist(dog.x, dog.y, a.x, a.y) < 500) group.push(dog);
    const pen = this.byKey.pet_penguin;
    const area = this.nearestArea(a.x, a.y, 400) || { x: a.x, y: a.y, r: 150 };
    this.start(new TagEvent(this, group, area, pen && !pen.event && Math.random() < 0.35 && gdist(pen.x, pen.y, a.x, a.y) < 500 ? pen : null));
    return { key: a.key, x: Math.round(a.x), y: Math.round(a.y) };
  }

  tryConcert() {
    const bard = this.byKey.npc_bard;
    if (!bard || bard.event || (bard.job && bard.job.kind === 'arrive')) return false;
    // the open campfire nearest the camera
    let best = null, bd = 1e12;
    for (const id in this.areas) {
      const a = this.areas[id];
      if (!a.fire || !this.areaOpen(a)) continue;
      const d = gdist(a.x, a.y, this.camX, this.camY);
      if (d < bd) { bd = d; best = a; }
    }
    if (!best || bd > 1400) return false;
    this.start(new ConcertEvent(this, bard, best));
    return { key: bard.key, x: Math.round(best.x), y: Math.round(best.y) };
  }

  // ---------------------------------------------------------------- snowman
  trySnowman() {
    const sm = this.props.snowman;
    if (!sm || !sm.shown || this.events.some((e) => e instanceof SnowmanEvent)) return;
    if (this.snowStage >= 3) {
      if (this.snowKeepT > 0) return;
      const kid = this.candidates((r) => (r.key === 'npc_kid_prankster' || r.role === 'kid') && r.can('throw') && gdist(r.x, r.y, sm.x, sm.y) < 700)[0];
      if (kid) this.start(new SnowmanEvent(this, [kid], sm, true));
      return;
    }
    const kids = this.candidates((r) => r.role === 'kid' && gdist(r.x, r.y, sm.x, sm.y) < 700).slice(0, 2);
    if (kids.length) this.start(new SnowmanEvent(this, kids, sm, false));
  }

  updateSnowman(dt) { if (this.snowStage >= 3 && this.snowKeepT > 0) this.snowKeepT -= dt; }

  setSnowStage(s, pop) {
    const sm = this.props.snowman;
    this.snowStage = s;
    if (!sm) return;
    Assets.apply(sm.img, 'snowman_' + s);
    if (pop) {
      this.gs.effects.pop(sm.img, 0.15, 100);
      this.gs.effects.burst('snowhit', sm.x, sm.y - 30, 8);
    }
  }

  // ---------------------------------------------------------------- village complete party
  party() {
    if (this.events.some((e) => e instanceof PartyEvent)) return;
    const p = this.gs.player;
    this.start(new PartyEvent(this, p.x, p.y));
  }

  // ---------------------------------------------------------------- snowball projectiles
  throwBall(from, to, onHit) {
    const gs = this.gs;
    let b = this.projPool.pop();
    if (!b) {
      b = { img: Assets.image(gs, 0, 0, Assets.pick('fx_snowball', 'fx_glow')), sh: gs.add.image(0, 0, 'fv_shadow').setAlpha(0.6) };
      b.img.setScale(Assets.has('fx_snowball') ? 1 : 0.5);
    }
    const ip = from.impactPoint ? from.impactPoint() : { x: from.x, y: from.y - 40 };
    b.sx = ip.x; b.sy = ip.y; b.to = to; b.t = 0;
    b.dur = Math.max(0.32, Math.min(0.6, gdist(ip.x, ip.y, to.x, to.y) / 600));
    b.gy0 = from.y; b.cb = onHit;
    b.img.setVisible(true).setDepth(DEPTH.FLY);
    b.sh.setVisible(true).setDisplaySize(18, 8).setDepth(DEPTH.SHADOW);
    this.proj.push(b);
    this.sfx('sfx_snowball_throw', from.x, from.y, 0.45, 'sfx_whoosh');
  }

  updateProjectiles(dt) {
    for (let i = this.proj.length - 1; i >= 0; i--) {
      const b = this.proj[i];
      b.t += dt;
      const p = Math.min(1, b.t / b.dur);
      const tx = b.to.x, ty = b.to.y - 40;
      const x = b.sx + (tx - b.sx) * p, y = b.sy + (ty - b.sy) * p - Math.sin(p * Math.PI) * 70;
      b.img.setPosition(x, y);
      b.sh.setPosition(x, b.gy0 + (b.to.y - b.gy0) * p);
      if (p >= 1) {
        b.img.setVisible(false); b.sh.setVisible(false);
        this.proj.splice(i, 1);
        this.projPool.push(b);
        this.gs.effects.sheet(Assets.sheet('fx_snow_splat') ? 'fx_snow_splat' : 'fx_poof', tx, ty, { size: 90 });
        this.gs.effects.burst('snowhit', tx, ty, 5);
        this.sfx('sfx_snowball_hit', tx, ty, 0.5, 'sfx_drop');
        if (b.cb) b.cb();
      }
    }
  }

  // ---------------------------------------------------------------- bard's lute loop
  updateLute() {
    const conc = this.events.find((e) => e instanceof ConcertEvent && e.playing);
    const want = !!conc && Audio.started && Settings.data.sound && !!Audio.exists && Audio.exists('sfx_lute');
    if (!want) { this.stopLute(); return; }
    const d = gdist(conc.bard.x, conc.bard.y, this.camX, this.camY);
    const vol = Math.max(0, 1 - d / 900) * Audio.baseVolume('sfx_lute') * 0.9;
    try {
      if (!this.lute) { this.lute = this.gs.sound.add('sfx_lute', { loop: true, volume: 0 }); this.lute.play(); }
      this.lute.setVolume(this.lute.volume + (vol - this.lute.volume) * 0.5);
    } catch (e) { this.lute = null; }
  }

  stopLute() { if (this.lute) { try { this.lute.stop(); this.lute.destroy(); } catch (e) { /* */ } this.lute = null; } }

  // ---------------------------------------------------------------- save / hooks
  serialize() { return { moved: this.moved.slice(), snowman: this.snowStage, waiting: this.waiting.slice() }; }

  /** test hook: make a life event happen now near the camera; returns what happened */
  trigger(name) {
    this.force = true;
    try { return this.trigger0(name); } finally { this.force = false; }
  }

  trigger0(name) {
    const T = this.timers;
    switch (name) {
      case 'chat': return this.tryChat();
      case 'snowball': return this.trySnowball();
      case 'tag': return this.tryTag();
      case 'concert': {
        T.concert = 999;
        const on = this.events.find((e) => e instanceof ConcertEvent);
        if (on) return { key: on.bard.key, x: Math.round(on.spot.x), y: Math.round(on.spot.y) };
        const bard = this.byKey.npc_bard;
        if (bard && bard.event) bard.event.drop(bard);
        return this.tryConcert();
      }
      case 'snowman': {
        // build one from scratch now (whatever was going on at the snowman site)
        const sm = this.props.snowman;
        if (!sm || !sm.shown) return false;
        for (let i = this.events.length - 1; i >= 0; i--) if (this.events[i] instanceof SnowmanEvent) { this.events[i].end(); this.events.splice(i, 1); }
        if (this.snowStage > 0) this.setSnowStage(0, true);
        const kids = this.candidates((r) => r.role === 'kid').slice(0, 2);
        if (!kids.length) return false;
        this.start(new SnowmanEvent(this, kids, sm, false));
        return { key: kids[0].key, x: Math.round(sm.x), y: Math.round(sm.y) };
      }
      case 'cheer': this.cheer(); return true;
      case 'party': this.party(); return true;
      case 'wave': this.timers.wave = 0; for (const r of this.residents) r.waveCd = 0; return true;
      case 'shiver': { const r = this.candidates((x) => !x.lod)[0] || this.candidates()[0]; if (!r) return false; r.job = null; r.state = 'idle'; r.dir = 2; r.act('shiver', 2); r.emote(Assets.pick('emote_cold', 'emote_sweat'), 2); r.say('cold'); return { key: r.key, x: Math.round(r.x), y: Math.round(r.y) }; }
      case 'sit': {
        // the free seat nearest the camera, and the nearest resident who can sit (elders first)
        let seat = null, sd = 1e12;
        for (const s of this.seats) { if (s.by || s.kind !== 'seat' || !s.prop.img.visible) continue; const d = gdist2(s.x, s.y, this.camX, this.camY); if (d < sd) { sd = d; seat = s; } }
        if (!seat) return false;
        const who = this.residents.filter((r) => r.canSit && !r.isPet && !r.seat && !r.event).sort((a, b) => ((b.role === 'elder') - (a.role === 'elder')) || (gdist2(a.x, a.y, seat.x, seat.y) - gdist2(b.x, b.y, seat.x, seat.y)))[0];
        if (!who) return false;
        if (gdist(who.x, who.y, seat.x, seat.y) > 500) { who.x = seat.standX + 60; who.y = seat.standY + 20; }
        who.job = { kind: 'stay', phase: 'here', left: 60, t: 0, next: 99 };
        if (seat.area) this.setArea(who, seat.area);
        this.goSit(who, who.job, seat);
        return who.key;
      }
      case 'tap': case 'tapPet': {
        // the (pet / person) nearest the middle of the screen
        const pet = name === 'tapPet';
        let r = null, bd = 1e12;
        for (const x of this.residents) {
          if (!!x.isPet !== pet || (x.job && x.job.kind === 'arrive')) continue;
          const d = gdist2(x.x, x.y, this.camX, this.camY) + (x.lod ? 1e9 : 0);
          if (d < bd) { bd = d; r = x; }
        }
        if (!r) return false;
        const hit = !r.lod && this.tap(r.x, r.y + r.headTop * 0.4);
        if (!hit) this.react(r);
        return { key: r.key, x: Math.round(r.x), y: Math.round(r.y) };
      }
      case 'moveIn': {
        let k = Assets.charKeys('villager').find((x) => this.moved.indexOf(x) < 0 && !NOT_RESIDENT.test(x) && Assets.charReady(x) && !this.gs.keysInUse.has(x));
        if (!k) {
          // everyone lives here already: replay the arrival of the newest resident
          const r = this.residents.filter((x) => !x.isPet && !x.event).pop();
          if (!r) return false;
          k = r.key; this.despawn(r);
          this.queue.push({ key: k, walkIn: true, at: this.t }); this.bannerQ.push({ at: this.t, keys: [k] });
          return k;
        } this.moved.push(k); this.queue.push({ key: k, walkIn: true, at: this.t }); this.bannerQ.push({ at: this.t, keys: [k] }); return k; }
      default: return false;
    }
  }

  state() {
    return {
      residents: this.residents.map((r) => ({ key: r.key, x: Math.round(r.x), y: Math.round(r.y), anim: r.animRes, job: r.job ? r.job.kind + ':' + (r.job.phase || '') : null, ev: r.event ? r.event.kind : null, lod: r.lod })),
      moved: this.moved.slice(), queued: this.queue.length, events: this.events.map((e) => e.kind), snowman: this.snowStage, bubbles: this.bubbles.active.length,
    };
  }
}

// =================================================================== events
class LifeEvent {
  constructor(life, kind, members) {
    this.life = life; this.gs = life.gs; this.kind = kind; this.t = 0;
    this.members = members.slice();
    for (const r of this.members) this.take(r);
  }
  take(r) {
    if (r.seat) { r.unsit(); r.stand(); }
    if (r.job) { if (r.job.seat && r.job.seat.by === r) r.job.seat.by = null; r.job = null; }
    this.life.setArea(r, null);
    r.stopFx();
    r.event = this;
  }
  drop(r) { const i = this.members.indexOf(r); if (i >= 0) this.members.splice(i, 1); if (r.event === this) r.event = null; }
  alive(r) { return r && r.alive && r.event === this; }
  /** members still taking part (one reused array: no allocation per frame) */
  live() {
    const out = this._live || (this._live = []);
    out.length = 0;
    for (const r of this.members) if (this.alive(r)) out.push(r);
    return out;
  }
  end() { for (const r of this.members) { if (r.event === this) { r.event = null; if (r.alive && r.state === 'move') r.stand(); } } this.members.length = 0; }
}

// nearest centre (spiral search) where every chat spot is off the pads and walkable
const _cc = { x: 0, y: 0 };
function chatCentre(life, cx, cy, spots) {
  const pads = life.gs.padSpots || [], col = life.gs.collision;
  const clear = (x, y) => {
    for (const sp of spots) {
      const px = x + sp[0], py = y + sp[1];
      if (col.blocked(px, py, 12)) return false;
      for (const q of pads) if (gdist2(px, py, q.x, q.y) < (q.r + 14) * (q.r + 14)) return false;
    }
    return true;
  };
  if (clear(cx, cy)) { _cc.x = cx; _cc.y = cy; return _cc; }
  for (let ring = 1; ring <= 6; ring++) {
    const rad = ring * 45;
    for (let a = 0; a < 10; a++) {
      const ang = (a / 10) * Math.PI * 2 + ring * 0.4;
      const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad * 0.5;
      if (clear(x, y)) { _cc.x = x; _cc.y = y; return _cc; }
    }
  }
  _cc.x = cx; _cc.y = cy; return _cc;
}

class ChatEvent extends LifeEvent {
  constructor(life, group) {
    super(life, 'chat', group);
    const cx = group.reduce((s, r) => s + r.x, 0) / group.length, cy = group.reduce((s, r) => s + r.y, 0) / group.length;
    const spots = group.length === 2 ? [[-36, 0], [36, 0]] : [[-44, -8], [44, -8], [0, 26]];
    // the one on the left stays left (no crossing)
    const order = group.slice().sort((a, b) => a.x - b.x);
    if (group.length === 3) { const front = order.reduce((m, r) => (r.y > m.y ? r : m), order[0]); order.splice(order.indexOf(front), 1); order.push(front); }
    // not on a pad (shelf, cash, register...) or in a wall: look for the nearest clear circle
    const C = chatCentre(life, cx, cy, spots);
    this.cx = C.x; this.cy = C.y;
    order.forEach((r, i) => {
      const p = { x: C.x + spots[i][0], y: C.y + spots[i][1] };
      life.gs.collision.resolve(p, 12);
      r.goTo(p.x, p.y, { tol: 6, direct: true });
    });
    this.phase = 'gather';
    this.turn = 0;
    this.rounds = 2 + Math.floor(Math.random() * 3);
    this.lineT = 0;
    this.speaker = -1;
  }
  update(dt) {
    this.t += dt;
    const m = this.live();
    if (m.length < 2 || this.t > 30) return false;
    if (this.phase === 'gather') {
      if (m.every((r) => r.arrived) || this.t > 6) {
        this.phase = 'talk';
        for (const r of m) { r.faceTo(this.cx, this.cy); r.stand(); }
        if (Math.random() < 0.5) m[0].emote('emote_dots', 1.2);
        this.lineT = 0.2;
      }
      return true;
    }
    this.lineT -= dt;
    if (this.lineT > 0) return true;
    if (this.turn >= this.rounds) {
      if (this.phase !== 'bye') { this.phase = 'bye'; for (const r of m) { r.act(Math.random() < 0.5 ? 'wave' : 'happy', 1.2); } this.lineT = 1.2; return true; }
      return false;
    }
    // next speaker (not the same twice)
    let s = Math.floor(Math.random() * m.length);
    if (s === this.speaker) s = (s + 1) % m.length;
    this.speaker = s;
    const sp = m[s];
    sp.faceTo(this.cx, this.cy);
    sp.act('talk', 2.2);
    const em = CHAT_EMOTES[sp.persona] || CHAT_EMOTES.plain;
    sp.say('persona', Math.random() < 0.7 ? em[Math.floor(Math.random() * em.length)] : null, 2.3);
    // listeners react a moment later
    for (const r of m) {
      if (r === sp) continue;
      r.faceTo(sp.x, sp.y);
      const roll = Math.random();
      this.gs.time.delayedCall(900 + Math.random() * 500, () => {
        if (!this.alive(r)) return;
        if (roll < 0.3 && r.can('laugh')) { r.act('laugh', 1.2); if (Math.random() < 0.4) r.emote('emote_laugh', 1.2); }
        else if (roll < 0.5) r.act('happy', 1.0);
        else if (roll < 0.6 && r.persona === 'grumpy') { r.act('angry', 1.0); r.emote('emote_sweat', 1.2); }
        else r.stand();
      });
    }
    this.turn++;
    this.lineT = 2.5 + Math.random() * 0.6;
    return true;
  }
}

class SnowballEvent extends LifeEvent {
  constructor(life, thrower, target, isReturn) {
    super(life, 'snowball', [thrower, target]);
    this.th = thrower; this.tg = target;
    this.phase = 'aim';
    thrower.faceTo(target.x, target.y);
    thrower.act('throw', 1.2);
    if (!isReturn && Math.random() < 0.5) thrower.say('throw', 'emote_snowball', 1.6);
    target.stand();
    this.launched = false;
    const ad = thrower.def.anims && thrower.def.anims.throw;
    this.launchAt = ad && ad.impactFrame !== undefined ? (ad.impactFrame + 0.5) / Math.max(1, ad.fps || 14) : 0.45;
    thrower.onImpact = () => this.launch();
  }
  launch() {
    if (this.launched) return;
    this.launched = true;
    this.th.onImpact = null;
    if (!this.alive(this.tg)) return;
    this.life.throwBall(this.th, this.tg, () => this.hit());
  }
  hit() {
    const tg = this.tg, th = this.th;
    if (!this.alive(tg)) return;
    this.phase = 'hit';
    this.hitT = 0;
    tg.faceTo(th.x, th.y);
    tg.act('hit', 0.6);
    // reaction
    const r = Math.random();
    const grumpy = tg.role === 'elder' || tg.persona === 'grumpy' || tg.persona === 'shy';
    this.react = grumpy ? (r < 0.75 ? 'angry' : 'laugh') : (r < 0.38 ? 'chase' : r < 0.68 ? 'laugh' : (tg.can('throw') ? 'back' : 'laugh'));
  }
  update(dt) {
    this.t += dt;
    const th = this.th, tg = this.tg;
    if (!this.alive(th) || !this.alive(tg) || this.t > 14) return false;
    if (this.phase === 'aim') {
      if (!this.launched && this.t >= this.launchAt) this.launch();
      if (this.t > 2.5) return false;
      return true;
    }
    if (this.phase === 'hit') {
      this.hitT += dt;
      if (this.hitT < 0.65) return true;
      const gs = this.gs;
      if (this.react === 'angry') {
        tg.act('angry', 1.6); tg.emote('emote_anger', 1.6);
        gs.effects.sheet(Assets.sheet('fx_anger_puff') ? 'fx_anger_puff' : 'fx_hit', tg.x, tg.y + tg.headTop, { size: 110 });
        tg.say('hitAngry', null, 1.8);
        th.act('laugh', 1.6); th.emote('emote_laugh', 1.4);
        this.sfxLaugh(th);
        this.phase = 'done'; this.doneT = 1.8;
      } else if (this.react === 'laugh') {
        tg.act('laugh', 1.6); th.act('laugh', 1.6);
        tg.emote('emote_laugh', 1.4);
        tg.say('hitLaugh', null, 1.8);
        this.sfxLaugh(tg);
        this.phase = 'done'; this.doneT = 1.8;
      } else if (this.react === 'chase') {
        tg.act('angry', 0.7); tg.emote('emote_anger', 1.2);
        gs.effects.sheet(Assets.sheet('fx_anger_puff') ? 'fx_anger_puff' : 'fx_hit', tg.x, tg.y + tg.headTop, { size: 100 });
        this.phase = 'chase'; this.chaseT = 0; this.stepT = 0.7;
        if (Math.random() < 0.6) tg.say('hitAngry', null, 1.4);
      } else {
        // throw one back
        this.phase = 'back';
        this.backT = 0.5;
      }
      return true;
    }
    if (this.phase === 'chase') {
      this.chaseT += dt; this.stepT -= dt;
      if (this.stepT <= 0) {
        this.stepT = 0.5;
        // the thrower runs away from the target, the target runs after him
        const dx = th.x - tg.x, dy = th.y - tg.y, d = Math.hypot(dx, dy) || 1;
        const fx = th.x + (dx / d) * 120, fy = th.y + (dy / d) * 60;
        const p = { x: fx, y: fy };
        this.gs.collision.resolve(p, 14);
        th.goTo(p.x, p.y, { run: true, tol: 10, direct: true });
        tg.goTo(th.x, th.y, { run: true, tol: 26, direct: true });
      }
      if (this.chaseT > 3.2 || (this.chaseT > 0.8 && gdist(th.x, th.y, tg.x, tg.y) < 30)) {
        th.stand(); tg.stand();
        th.faceTo(tg.x, tg.y); tg.faceTo(th.x, th.y);
        th.act('laugh', 1.6); tg.act('laugh', 1.6);
        th.emote('emote_laugh', 1.4);
        this.sfxLaugh(th);
        this.phase = 'done'; this.doneT = 1.8;
      }
      return true;
    }
    if (this.phase === 'back') {
      this.backT -= dt;
      if (this.backT <= 0 && !this.backStarted) {
        this.backStarted = true;
        tg.faceTo(th.x, th.y);
        tg.act('throw', 1.2);
        th.stand();
        const ad = tg.def.anims && tg.def.anims.throw;
        const at = ad && ad.impactFrame !== undefined ? (ad.impactFrame + 0.5) / Math.max(1, ad.fps || 14) : 0.45;
        let done = false;
        const go = () => { if (done) return; done = true; tg.onImpact = null; if (this.alive(th)) this.life.throwBall(tg, th, () => { if (!this.alive(th)) return; th.act('hit', 0.6); this.gs.time.delayedCall(650, () => { if (this.alive(th)) { th.act('laugh', 1.5); tg.act('laugh', 1.5); th.emote('emote_laugh', 1.3); this.sfxLaugh(th); } }); }); };
        tg.onImpact = go;
        this.gs.time.delayedCall(at * 1000, go);
        this.phase = 'done'; this.doneT = 3.2;
      }
      return true;
    }
    if (this.phase === 'done') { this.doneT -= dt; return this.doneT > 0; }
    return false;
  }
  sfxLaugh(r) { this.life.sfx('sfx_laugh', r.x, r.y, 0.45); }
  end() { if (this.th) this.th.onImpact = null; if (this.tg) this.tg.onImpact = null; super.end(); }
}

class TagEvent extends LifeEvent {
  constructor(life, group, area, penguin) {
    super(life, 'tag', penguin ? group.concat([penguin]) : group);
    this.area = area;
    this.penguin = penguin;
    this.it = group[Math.floor(Math.random() * group.length)];
    if (this.it.isPet) this.it = group.find((r) => !r.isPet) || this.it;
    this.stepT = 0;
    this.len = BALANCE.life.tagLength;
    this.it.say('tag', 'emote_exclaim', 1.6);
    this.catchCd = 1;
  }
  update(dt) {
    this.t += dt;
    const m = this.live();
    if (m.length < 2 || !this.alive(this.it) || this.t > this.len) {
      for (const r of m) { r.stand(); if (!r.isPet && Math.random() < 0.5) r.act('laugh', 1.4); }
      return false;
    }
    this.catchCd -= dt;
    this.stepT -= dt;
    const a = this.area;
    const prey = this.penguin && this.alive(this.penguin) && this.t < this.len * 0.5 ? this.penguin : null;
    if (this.stepT <= 0) {
      this.stepT = 0.45;
      for (const r of m) {
        if (r === this.it) {
          // chase the nearest
          let best = null, bd = 1e12;
          for (const o of m) { if (o === r) continue; const d = gdist2(r.x, r.y, o.x, o.y); if (d < bd) { bd = d; best = o; } }
          const tgt = prey && r !== prey ? prey : best;
          if (tgt) r.goTo(tgt.x, tgt.y, { run: true, tol: 18, direct: true });
        } else {
          // run away from "it", staying around the area
          const dx = r.x - this.it.x, dy = r.y - this.it.y, d = Math.hypot(dx, dy) || 1;
          let fx = r.x + (dx / d) * 110 + (Math.random() - 0.5) * 60, fy = r.y + (dy / d) * 55 + (Math.random() - 0.5) * 30;
          const ox = fx - a.x, oy = (fy - a.y) * 2, od = Math.hypot(ox, oy);
          const R = (a.r || 150) * 1.3;
          if (od > R) { fx = a.x + (ox / od) * R * 0.7 - (dx / d) * 40; fy = a.y + (oy / od) * R * 0.35; }
          const p = { x: fx, y: fy };
          this.gs.collision.resolve(p, 14);
          if (d < 260 || r.arrived) r.goTo(p.x, p.y, { run: true, tol: 14, direct: true, speed: r.runSpeed * (r === prey ? 0.8 : 0.92) });
        }
      }
    }
    // tagged?
    if (this.catchCd <= 0) {
      for (const o of m) {
        if (o === this.it || o.isPet) continue;
        if (gdist(o.x, o.y, this.it.x, this.it.y) < 34) {
          this.catchCd = 1.2;
          const old = this.it;
          old.act('laugh', 0.5);
          this.it = o;
          o.act('surprised', 0.5);
          if (Math.random() < 0.6) o.say('tag', 'emote_exclaim', 1.4);
          this.life.sfx('sfx_laugh', o.x, o.y, 0.4);
          break;
        }
      }
    }
    return true;
  }
}

class ConcertEvent extends LifeEvent {
  constructor(life, bard, area) {
    super(life, 'concert', [bard]);
    this.bard = bard; this.area = area;
    // where the bard stands: the music stand's perform point at this fire, else in front of the fire
    const st = life.props.stand;
    if (st && st.shown && gdist(st.x, st.y, area.fire.x, area.fire.y) < 200) {
      const pp = st.def.performPoint || [0, -12];
      this.spot = { x: st.x + pp[0], y: st.y + pp[1] };
    } else if (area.stage) this.spot = { x: area.stage.x, y: area.stage.y };
    else this.spot = { x: area.fire.x - 90, y: area.fire.y + 40 };
    life.gs.collision.resolve(this.spot, 6);
    bard.goTo(this.spot.x, this.spot.y, { tol: 8 });
    this.phase = 'go';
    this.playing = false;
    this.len = BALANCE.life.concertLength;
    this.inviteT = 0;
  }
  update(dt) {
    this.t += dt;
    const b = this.bard;
    if (!this.alive(b)) return false;
    if (this.phase === 'go') {
      // stuck on the way (crowd, logs): try again; far away and off-screen: just be there
      if (b.arrived && gdist(b.x, b.y, this.spot.x, this.spot.y) > 40 && this.t < 25) {
        if (b.lod || !this.gs.isOnScreen(this.spot.x, this.spot.y, 100)) { b.x = this.spot.x; b.y = this.spot.y; }
        else { this.retry = (this.retry || 0) + 1; if (this.retry > 6) { b.x = this.spot.x; b.y = this.spot.y; } else b.goTo(this.spot.x, this.spot.y, { tol: 8 }); }
        return true;
      }
      if (b.arrived || this.t > 25) {
        if (gdist(b.x, b.y, this.spot.x, this.spot.y) > 40) { b.x = this.spot.x; b.y = this.spot.y; b.state = 'idle'; }
        this.phase = 'play'; this.t = 0; this.playing = true;
        b.dir = 2;
        b.act('perform', -1);
        const fx = this.gs.effects.loop('fx_music_notes', b.x, b.y + b.headTop, 96, DEPTH.BUBBLE - 5);
        if (fx) { b.fxDx = 14; b.fxDy = 6; b.attachFx(fx); }
        b.say('concert', 'emote_music', 2.2);
        this.invite();
      }
      return true;
    }
    if (this.phase === 'play') {
      this.inviteT -= dt;
      if (this.inviteT <= 0) { this.inviteT = 4; this.invite(); }
      // dancers keep dancing (refresh), some cheer
      for (const r of this.members) {
        if (r === b || !this.alive(r)) continue;
        if (r.arrived && r.state !== 'act') {
          r.faceTo(b.x, b.y);
          if (r.role === 'elder' && !r.seat) { r.act(Math.random() < 0.5 ? 'happy' : 'idle', 2); }
          else r.act(r.can('dance') ? 'dance' : (Math.random() < 0.5 ? 'happy' : 'wave'), 2.4 + Math.random() * 1.5);
          if (Math.random() < 0.12) r.say('concert', 'emote_music', 1.8);
        }
      }
      if (this.t > this.len) {
        this.phase = 'bow'; this.t = 0;
        b.stopFx();
        b.act(b.can('bow') ? 'bow' : 'happy', 1.6);
        for (const r of this.members) if (r !== b && this.alive(r)) { r.act('happy', 1.8); if (Math.random() < 0.4) this.gs.effects.sheet('fx_hearts', r.x, r.y + r.headTop, { size: 80 }); }
        const fan = this.members.find((r) => r !== b && this.alive(r));
        if (fan) fan.say('concert', 'emote_star', 1.8);
        this.playing = false;
      }
      return true;
    }
    return this.t < 2;
  }
  /** nearby residents come and dance (elders take a seat by the fire) */
  invite() {
    const life = this.life, a = this.area;
    let n = this.members.length - 1;
    for (const r of life.residents) {
      if (n >= 7) break;
      if (r === this.bard || r.event || r.isPet || (r.job && r.job.kind === 'arrive')) continue;
      if (gdist(r.x, r.y, a.x, a.y) > 650) continue;
      this.members.push(r); this.take(r); n++;
      if (r.role === 'elder' && r.canSit) {
        const s = life.freeSeat(r, a);
        if (s) { s.by = r; r.goTo(s.standX, s.standY, { tol: 8, direct: true }); const poll = () => { if (!this.alive(r)) { if (s.by === r && !r.seat) s.by = null; return; } if (!r.arrived) { this.gs.time.delayedCall(200, poll); return; } r.sitOn(s, 'sit'); }; this.gs.time.delayedCall(200, poll); continue; }
      }
      // a spot in a loose ring in front of the fire
      // (not in front of the bard, not on another dancer's spot)
      const taken = this.spots || (this.spots = []);
      let p = null;
      for (let k = 0; k < 14; k++) {
        const ang = Math.PI * (0.1 + Math.random() * 0.8);
        const q = { x: a.fire.x + Math.cos(ang) * (100 + Math.random() * 70), y: a.fire.y + 30 + Math.sin(ang) * 70 };
        this.gs.collision.resolve(q, 12);
        const free = gdist(q.x, q.y, this.spot.x, this.spot.y) > 85 && !taken.some((t) => gdist(q.x, q.y, t.x, t.y) < 46) && !life.crowded(q.x, q.y, r, 38);
        if (free || k === 13) { p = q; break; }
      }
      taken.push(p);
      r.goTo(p.x, p.y, { tol: 10, direct: gdist(r.x, r.y, p.x, p.y) < 320 });
    }
  }
  end() {
    this.playing = false;
    if (this.bard && this.bard.alive) this.bard.stopFx();
    for (const r of this.members) if (r.alive && r.seat) { r.unsit(); r.stand(); }
    super.end();
  }
}

class SnowmanEvent extends LifeEvent {
  constructor(life, kids, sm, knockDown) {
    super(life, knockDown ? 'snowmanBreak' : 'snowman', kids);
    this.sm = sm; this.knock = knockDown;
    const wp = sm.def.workPoints || [[-46, 9], [47, 10]];
    kids.forEach((k, i) => {
      const w = knockDown ? [-150, 40] : wp[i % wp.length];
      const p = { x: sm.x + w[0], y: sm.y + w[1] };
      life.gs.collision.resolve(p, 10);
      k.goTo(p.x, p.y, { tol: 8 });
    });
    this.phase = 'go';
    this.workT = 0;
  }
  update(dt) {
    this.t += dt;
    const m = this.live();
    if (!m.length || this.t > 60) return false;
    const life = this.life, sm = this.sm;
    if (this.phase === 'go') {
      if (m.every((r) => r.arrived) || this.t > 20) { this.phase = this.knock ? 'knock' : 'work'; this.t = 0; for (const r of m) r.faceTo(sm.x, sm.y - 20); }
      return true;
    }
    if (this.phase === 'knock') {
      const k = m[0];
      if (this.t < 0.1) { k.act('throw', 1.2); k.say('snowmanBreak', 'emote_snowball', 1.8); }
      if (this.t > 0.45 && !this.thrown) {
        this.thrown = true;
        life.throwBall(k, { x: sm.x, y: sm.y + 10, alive: true }, () => {
          life.gs.effects.sheet('fx_poof', sm.x, sm.y - 40, { size: 180 });
          life.gs.effects.burst('snowhit', sm.x, sm.y - 50, 14);
          life.setSnowStage(0, true);
          k.act('laugh', 1.6);
          life.sfx('sfx_laugh', k.x, k.y, 0.45);
        });
      }
      return this.t < 3;
    }
    if (this.phase === 'work') {
      // pat the snow (packing motion), bits of snow fly
      this.workT += dt * Math.min(2, m.length) / 1.6;
      for (const r of m) if (r.state !== 'act') r.act(Math.random() < 0.6 && r.can('throw') ? 'throw' : 'happy', 0.9 + Math.random() * 0.4);
      if (Math.random() < dt * 3) life.gs.effects.burst('snowhit', sm.x + (Math.random() - 0.5) * 40, sm.y - 20, 2);
      if (this.workT >= BALANCE.life.snowmanStageTime) {
        this.workT = 0;
        life.setSnowStage(Math.min(3, life.snowStage + 1), true);
        if (life.snowStage >= 3) {
          this.phase = 'done'; this.t = 0;
          life.snowKeepT = BALANCE.life.snowmanKeep;
          for (const r of m) { r.act('happy', 2); life.gs.effects.sheet('fx_hearts', r.x, r.y + r.headTop, { size: 90 }); }
          m[0].say('snowman', 'emote_star', 2.2);
          life.gs.effects.burst('star', sm.x, sm.y - 80, 10);
          return true;
        }
        if (Math.random() < 0.4) m[Math.floor(Math.random() * m.length)].say('kid', 'emote_snowball', 1.8);
      }
      return true;
    }
    return this.t < 2.2;
  }
}

class PartyEvent extends LifeEvent {
  constructor(life, x, y) {
    const all = life.residents.filter((r) => !(r.job && r.job.kind === 'arrive') && !(r.key === 'pet_dog' && life.gs.dog && life.gs.dog.busy));
    for (const r of all) if (r.event && r.event !== null) r.event.drop(r);
    super(life, 'party', all);
    this.x = x; this.y = y;
    // everyone gathers in a ring around the chief
    const n = all.length;
    all.forEach((r, i) => {
      const ang = (i / Math.max(1, n)) * Math.PI * 2;
      const rad = 120 + (i % 3) * 45;
      const p = { x: x + Math.cos(ang) * rad, y: y + Math.sin(ang) * rad * 0.5 };
      life.gs.collision.resolve(p, 12);
      r.goTo(p.x, p.y, { tol: 14, run: gdist(r.x, r.y, p.x, p.y) > 500 });
    });
    this.len = BALANCE.life.partyLength;
    this.fxT = 0;
  }
  update(dt) {
    this.t += dt;
    const gs = this.gs;
    if (this.t > this.len + 15) return false;
    this.fxT -= dt;
    if (this.fxT <= 0 && this.t < this.len + 4) {
      this.fxT = 0.8;
      gs.effects.burst('confetti', this.x + (Math.random() - 0.5) * 400, this.y - 200 - Math.random() * 120, 14);
    }
    for (const r of this.members) {
      if (!this.alive(r)) continue;
      if (r.arrived && r.state !== 'act') {
        r.faceTo(this.x, this.y);
        if (r.key === 'npc_bard') { r.act('perform', 3); if (!r.extraFx) { const fx = gs.effects.loop('fx_music_notes', r.x, r.y + r.headTop, 96, DEPTH.BUBBLE - 5); if (fx) { r.fxDx = 14; r.attachFx(fx); } } }
        else r.act(r.can('dance') ? 'dance' : 'happy', 2 + Math.random() * 2);
        if (Math.random() < 0.08) r.say(r.isPet ? 'plain' : 'party', Math.random() < 0.5 ? 'emote_star' : 'emote_heart', 2);
      }
    }
    return this.t < this.len;
  }
  end() { for (const r of this.members) if (r.alive) r.stopFx(); super.end(); }
}

export { ChatEvent, SnowballEvent, TagEvent, ConcertEvent, SnowmanEvent, PartyEvent };
