// LabTown: the body layer of the story lab (the game's TownSim + DollPool stand-in). Every person of the stand-in town
// (tools/test/story_lab/standin.mjs) has a body that follows the TownSim-like day: walks to the building of its
// schedule segment, goes inside ('in') or stands / sits around it ('out'). Townsfolk are the real paper dolls
// (tools/townfolk2_compose.js: assets/townfolk + assets/townfolk2), the named villagers / the chief / 콩이 / 나비 are
// their character atlases. Rigs exist only near the view (like v4's DollPool). Implements ports.town (ports.js).

import { Townfolk2, TownfolkSprite2 } from '../../../townfolk2_compose.js';
import { mulberry32, MIRROR } from '../../../townfolk_compose.js';
import { segmentOf, HOUR } from '../standin.mjs';
import { dirOf } from '../../../../src/story/view/stagehand.js';

const SPEED = 70;                 // px / s (TownSim: 60 .. 90)
const RIG_MARGIN = 260;           // px around the view where rigs exist
const MAX_RIGS = 90;
const DOLL_ANIMS = new Set(['idle', 'walk', 'talk', 'wave', 'happy', 'sad', 'clap', 'sit', 'push']);
const DOLL_MAP = { run: 'walk', laugh: 'happy', surprised: 'idle', bow: 'talk', dance: 'happy', shiver: 'idle', loaf: 'idle', serve: 'talk' };
const CHAR_MAP = { clap: 'happy', push: 'walk', laugh: 'laugh', sit: 'sit', bow: 'talk', dance: 'happy', loaf: 'loaf' };
const IDENT_FAMILIES = new Set(['hair', 'facial_hair', 'glasses']);

function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ------------------------------------------------------------------ bodies
class Body {
  constructor(town, pid, x, y) {
    this.town = town; this.pid = pid; this.x = x; this.y = y;
    this.dir = 'S'; this.anim = 'idle'; this.rest = 'idle';
    this.alive = true; this.held = false; this.hidden = false; this.inside = false;
    this.path = null; this.onceT = 0; this.sitDepth = null; this.dy = 0; this.face = null;
    this.attached = null; this.sitDy = 0;
  }
  get sprite() { return { visible: !this.hidden && !this.inside, scaleY: 1 }; }
  walkTo(x, y, speed, cb) {
    // a new walk ends the old one: its waiter is told (walk callbacks always fire)
    if (this.path && this.path.cb) { const old = this.path.cb; this.path = null; old(); }
    this.path = { x, y, speed: SPEED * (speed || 1) * (this.slow || 1), cb };
    this.sitDepth = null; this.sitDy = 0; this.rest = 'idle';
    if (this.inside) { this.inside = false; }
  }
  stop() { const p = this.path; this.path = null; if (p && p.cb) p.cb(); }
  /** end the current walk; its waiter is always told */
  endPath() { this.stop(); }
  step(dt) {
    if (this.onceT > 0) { this.onceT -= dt; if (this.onceT <= 0) this.setAnim(this.rest); }
    const p = this.path;
    if (!p) return;
    const dx = p.x - this.x, dy = p.y - this.y, d = Math.hypot(dx, dy);
    const v = p.speed * dt;
    if (d <= v || d < 0.5) {
      this.x = p.x; this.y = p.y; this.path = null;
      this.setAnim(this.attached ? 'push' : this.rest, this.dir, { still: !!this.attached });
      if (this.pending) { const a = this.pending; this.pending = null; if (!this.attached) this.setAnim(a, this.dir); }
      if (p.cb) p.cb();
      return;
    }
    this.x += (dx / d) * v; this.y += (dy / d) * v;
    const nd = dirOf(dx, dy);
    if (nd !== this.dir || this.anim !== (this.attached ? 'push' : 'walk')) this.setAnim(this.attached ? 'push' : 'walk', nd);
  }
  bow() { if (!this.town.scene) return; this.town.scene.tweens.add({ targets: this, dy: 5, duration: 220, yoyo: true, hold: 260, ease: 'Sine.InOut' }); }
}

class DollBody extends Body {
  constructor(town, pid, x, y, person, age) {
    super(town, pid, x, y);
    this.kind = 'doll'; this.person = person; this.look0 = person; this.age = age;
    this.headTop = age === 'child' ? -78 : age === 'elder' ? -96 : -102;
    this.slow = age === 'elder' ? 0.8 : 1;
    this.rig = null; this.still = false;
  }
  setAnim(anim, dir, opts = {}) {
    let a = DOLL_MAP[anim] || anim;
    if (!DOLL_ANIMS.has(a)) a = 'idle';
    if (dir) this.dir = dir;
    this.anim = a; this.still = !!opts.still;
    if (opts.face !== undefined) this.face = opts.face;
    if (this.rig) { this.rig.play(a, this.dir); if (this.rig.face !== (this.face || null)) this.rig.setFace(this.face); }
  }
  materialize(on) {
    if (on && !this.rig) {
      const t = this.town;
      this.rig = new TownfolkSprite2(t.scene, t.tf, this.person, this.x, this.y);
      this.rig.play(this.anim, this.dir);
      if (this.face) this.rig.setFace(this.face);
      t.rigs++;
    } else if (!on && this.rig) { this.rig.destroy(); this.rig = null; this.town.rigs--; }
  }
  restyle(person) { this.person = person; if (this.rig) { this.rig.person = person; this.rig._key = ''; this.rig.refresh(true); } }
  draw(dtMs) {
    const r = this.rig;
    if (!r) return;
    const vis = !this.hidden && !this.inside;
    if (!vis) { if (r.visibleCount) { for (const s of r.sprites) s.setVisible(false); r.visibleCount = 0; r._key = ''; } return; }
    if (!r.visibleCount) r.refresh(true);
    if (!this.still) r.update(this.anim === 'walk' || this.anim === 'push' ? dtMs * (this.path ? this.path.speed / SPEED : 1) : dtMs);
    r.x = this.x; r.y = this.y + this.dy;
    r.depthBase = this.sitDepth !== null ? this.sitDepth : this.y;
    r.place();
  }
  destroy() { this.endPath(); this.materialize(false); this.alive = false; }
}

class CharBody extends Body {
  constructor(town, pid, x, y, key, opts = {}) {
    super(town, pid, x, y);
    this.kind = 'char'; this.key = key; this.isPet = !!opts.pet; this.role = opts.pet ? 'pet' : undefined;
    const d = town.art.def(key);
    this.def = d;
    this.headTop = (d && d.headTop) || -80;
    this.spr = null;
  }
  setAnim(anim, dir, opts = {}) {
    if (dir) this.dir = dir;
    const d = this.def;
    let a = CHAR_MAP[anim] || anim;
    if (!d || !d._dirs || !d._dirs[a] || !d._dirs[a].length) a = anim === 'run' && d && d._dirs && d._dirs.walk ? 'walk' : 'idle';
    this.anim = a; this.still = !!opts.still;
    this.apply();
  }
  apply() {
    const s = this.spr, d = this.def;
    if (!s || !d) return;
    const rd = MIRROR[this.dir] || this.dir;
    let dirs = d._dirs[this.anim] || [];
    let use = dirs.indexOf(rd) >= 0 ? rd : dirs[0] || 'S';
    if (dirs.indexOf(rd) < 0 && dirs.length) use = rd === 'NE' || rd === 'N' ? (dirs.indexOf('E') >= 0 ? 'E' : dirs[0]) : dirs[0];
    s.setFlipX(this.dir in MIRROR);
    const key = this.key + ':' + this.anim + ':' + use;
    if (!s.anims.currentAnim || s.anims.currentAnim.key !== key) s.play(key);
  }
  materialize(on) {
    if (on && !this.spr) {
      const t = this.town, d = this.def;
      if (!d || !t.scene.textures.exists(d.atlas)) return;
      this.spr = t.scene.add.sprite(this.x, this.y, d.atlas).setOrigin(d.anchor[0], d.anchor[1]);
      this.apply();
      t.rigs++;
    } else if (!on && this.spr) { this.spr.destroy(); this.spr = null; this.town.rigs--; }
  }
  draw() {
    const s = this.spr;
    if (!s) return;
    const vis = !this.hidden && !this.inside;
    s.setVisible(vis);
    if (!vis) return;
    s.setPosition(this.x, this.y + this.dy).setDepth(this.sitDepth !== null ? this.sitDepth : this.y);
    if (this.path) s.anims.timeScale = this.path.speed / SPEED; else s.anims.timeScale = 1;
  }
  restyle() {}
  destroy() { this.endPath(); this.materialize(false); this.alive = false; }
}

// ------------------------------------------------------------------ the town
export class LabTown {
  /** town: makeStandInTown(); world: { buildings (lab positions), spots }; art: LabArt; tfMan: merged townfolk manifest */
  constructor(scene, art, town, world, tfMan, opts = {}) {
    this.scene = scene; this.art = art; this.town = town; this.world = world;
    this.tf = new Townfolk2(tfMan.townfolk);
    this.bodies = new Map();
    this.citizen = new Map();         // pid -> stand-in citizen
    this.slots = new Map();           // building -> next slot index
    this.rigs = 0;
    this.T = opts.T || (() => 0);
    this.view = opts.view || (() => null);
    this.extraN = 0;
    this.stats = { holds: 0, walks: 0, dress: 0 };
    this.byId = Object.fromEntries(world.buildings.map((b) => [b.id, b]));
    this.villagerKeys = new Set(opts.villagerChars || []);
    this.build();
  }

  build() {
    const r = mulberry32(77);
    for (const c of this.town.citizens) {
      const pid = 't:' + c.id;
      const age = c.age < 13 ? 'child' : c.age >= 62 ? 'elder' : 'adult';
      const person = this.makeLook(pid, age, c);
      const b = new DollBody(this, pid, 0, 0, person, age);
      b.c = { id: c.id, kind: c.kind === 'student' ? 'student' : c.kind === 'elder' ? 'elder' : c.kind === 'teen' ? 'teen' : 'adult' };
      this.bodies.set(pid, b);
      this.citizen.set(pid, c);
      b.jit = r();
    }
    for (const row of this.town.roster) {
      if (row.kind !== 'villager') continue;
      const key = row.key;
      let b;
      if (this.villagerKeys.has(key) && this.art.def(key)) b = new CharBody(this, row.pid, 0, 0, key);
      else {
        // a named villager without a loaded atlas: a townsperson doll of the right age (lab only)
        const age = /kid/.test(key) ? 'child' : /grand/.test(key) ? 'elder' : 'adult';
        b = new DollBody(this, row.pid, 0, 0, this.makeLook(row.pid, age, null), age);
      }
      b.villager = key;
      this.bodies.set(row.pid, b);
    }
  }

  /** a deterministic everyday look for a person (the v4 generator, base by age, job presets for civic roles) */
  makeLook(pid, age, c) {
    const rng = mulberry32(hashStr(pid) ^ 0x5bd1e995);
    const G = this.tf.T.generator;
    const job = c && c.role ? { teacher: 'teacher', police: 'police', postal: 'postal', doctor: 'doctor', nurse: 'nurse', station: 'station' }[c.role] : null;
    const bases = Object.keys(this.tf.T.bases).filter((b) => this.tf.T.bases[b].age === age);
    const base = bases[Math.floor(rng() * bases.length)];
    const name = '__lab_' + base + '_' + (job || 'any');
    if (!G.presets[name]) G.presets[name] = Object.assign({}, job ? G.presets[job] : {}, { bases: { [base]: 1 } });
    if (age === 'child' && !job) G.presets[name].bases = { [base]: 1 };
    return this.tf.generate(rng, name);
  }

  /** the person dressed in a preset (bride, groom, wedding_guest, flower_girl, mourner, mourner_family), identity kept */
  dressLook(b, preset, opts = {}) {
    const tf = this.tf, T = tf.T, G = T.generator;
    const id = b.look0;
    let look = id;
    if (preset) {
      const P = G.presets[preset];
      if (!P) return id;
      const name = '__dress_' + preset + '_' + id.base;
      if (!G.presets[name]) G.presets[name] = Object.assign({}, P, { bases: { [id.base]: 1 } });
      const p = tf.generate(mulberry32(hashStr(b.pid + preset)), name);
      const keep = id.parts.filter((pn) => T.parts[pn] && IDENT_FAMILIES.has(T.parts[pn].family));
      const outfit = p.parts.filter((pn) => T.parts[pn] && !IDENT_FAMILIES.has(T.parts[pn].family) && T.parts[pn].family !== 'job');
      const parts = keep.slice();
      for (const pn of outfit) if (!parts.some((q) => tf.conflicts(pn, q))) parts.push(pn);
      const colors = Object.assign({}, p.colors, { skin: id.colors.skin, hair: id.colors.hair, glasses: id.colors.glasses });
      if (p.colors.hands === p.colors.skin) colors.hands = id.colors.skin;
      look = Object.assign({}, id, { parts, colors, preset });
    } else if (b.person && b.person !== id && (opts.add || opts.remove)) look = b.person;
    if (opts.add || opts.remove) {
      const parts = look.parts.filter((pn) => !(opts.remove || []).includes(pn));
      const age = T.bases[id.base].age;
      for (const pn of opts.add || []) {
        const P = T.parts[pn];
        if (!P || parts.includes(pn) || (P.ages && !P.ages.includes(age))) continue;
        if (P.space === 'head' || T.bases[id.base].parts.includes(pn)) { for (let i = parts.length - 1; i >= 0; i--) if (T.parts[parts[i]] && T.parts[parts[i]].family === P.family && P.family !== 'hand') parts.splice(i, 1); parts.push(pn); }
      }
      look = Object.assign({}, look, { parts });
      if ((opts.add || []).includes('held_bouquet') && !look.colors.flower) look.colors = Object.assign({}, look.colors, { flower: '#F59AB8', flower2: '#FAF6F2', wrap: '#F7F3EC' });
    }
    return look;
  }

  // ---------------------------------------------------------------- the day (ambient)
  /** the schedule segment of a person at T: [act, building | null, state] */
  segOf(pid, T) {
    const b = this.bodies.get(pid);
    const h = ((T / HOUR) % 24 + 24) % 24;
    const c = this.citizen.get(pid);
    if (c) return segmentOf(c, h);
    // the named villagers (standin whereabouts): around the square in the daytime
    const key = b.villager || '';
    const day = h >= 8 && h < 20;
    return [day ? 'bench' : 'sleep', day ? (key.length % 3 === 0 ? 't_fountain' : key.length % 3 === 1 ? 't_cafe' : 'v_hall') : 'v_hall', day ? 'out' : 'in'];
  }

  /** the outdoor slots of a building: seats, play points, gather points, then rings / a fan in front of the door */
  slotsOf(id) {
    this.slotCache = this.slotCache || new Map();
    if (this.slotCache.has(id)) return this.slotCache.get(id);
    const B = this.byId[id], d = this.art.def(B.key) || {};
    const out = [];
    const P = (arr, dirs, kind, dy = 0) => { for (let i = 0; i < (arr || []).length; i++) out.push({ x: B.x + arr[i][0], y: B.y + arr[i][1] + dy, dir: (dirs || [])[i] || 'S', kind }); };
    P(d.seatPoints, d.seatDirs, 'seat');
    P(d.playPoints, d.playDirs, 'play');
    P(d.gatherPoints, d.gatherDirs, 'gather', 14);
    let cx, cy;
    // the benches of the lab's square count as seats of the nearest place (elders love a bench)
    for (const bn of this.world.benches || []) {
      const bd = this.art.def(bn.key);
      if (!bd || !bd.seatPoints || Math.hypot(bn.x - B.x, bn.y - B.y) > 420) continue;
      bd.seatPoints.forEach((v, i) => out.push({ x: bn.x + v[0], y: bn.y + v[1], dir: (bd.seatDirs || [])[i] || 'SW', kind: 'seat', depth: Math.max(bn.y, bn.y + v[1]) + 2 }));
    }
    if (B.key === 'park_fountain') {
      cx = B.x; cy = B.y;
      for (const [r, n] of [[150, 11], [215, 15], [285, 19]]) for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + r; out.push({ x: cx + Math.cos(a) * r * 1.3, y: cy + Math.sin(a) * r * 0.66, kind: 'ring' }); }
    } else {
      const door = d.doorPoint ? { x: B.x + d.doorPoint[0], y: B.y + d.doorPoint[1] } : { x: B.x, y: B.y + 40 };
      cx = door.x + 40; cy = door.y + 130;
      for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) out.push({ x: cx - 170 + col * 68 + (row % 2) * 30, y: cy - 60 + row * 46, kind: 'fan' });
    }
    for (const s of out) if (s.kind === 'ring' || s.kind === 'fan') s.dir = dirOf(cx - s.x, cy - s.y);
    const r = { list: out, cx, cy };
    this.slotCache.set(id, r);
    return r;
  }

  /** a free slot for pid at building id (the same one while it stays) */
  takeSlot(pid, id, act) {
    this.occ = this.occ || new Map();
    let m = this.occ.get(id);
    if (!m) this.occ.set(id, (m = new Map()));
    const S = this.slotsOf(id).list;
    const want = (s) => s.kind === 'seat' ? act === 'bench' || act === 'cafe' : s.kind === 'play' ? act === 'play' || act === 'recess' : true;
    const h = hashStr(pid + id);
    // seats / play points first when the act fits, then the rest from a hashed start
    const order = [];
    for (let i = 0; i < S.length; i++) if (S[i].kind === 'seat' || S[i].kind === 'play') order.push(i);
    const rest = [];
    for (let i = 0; i < S.length; i++) if (S[i].kind !== 'seat' && S[i].kind !== 'play') rest.push(i);
    const off = h % Math.max(1, rest.length);
    for (let k = 0; k < rest.length; k++) order.push(rest[(off + k) % rest.length]);
    for (const i of order) if (want(S[i]) && !m.has(i) && !this.inReserved(S[i])) { m.set(i, pid); return { id, i, s: S[i] }; }
    const i = rest.find((r) => !this.inReserved(S[r])) ?? rest[off] ?? 0;
    return { id, i: -1, s: { x: S[i].x + ((h >> 5) % 40) - 20, y: S[i].y + 30 + ((h >> 9) % 20), dir: S[i].dir } };
  }
  inReserved(p) { if (!this.reserved) return false; for (const r of this.reserved.values()) if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return true; return false; }
  /** keep a stage rect clear: everyday bodies standing (or heading) there pick another slot */
  reserve(id, rect) {
    this.reserved = this.reserved || new Map();
    if (!rect) { this.reserved.delete(id); return; }
    this.reserved.set(id, rect);
    for (const b of this.bodies.values()) {
      if (b.held || b.extra || !b.alive || b.inside) continue;
      if ((b.slot && this.inReserved(b.slot.s)) || this.inReserved(b)) { this.freeSlot(b); b.goal = null; }
    }
  }
  freeSlot(b) { if (b.slot && b.slot.i >= 0 && this.occ) { const m = this.occ.get(b.slot.id); if (m && m.get(b.slot.i) === b.pid) m.delete(b.slot.i); } b.slot = null; }

  /** where the schedule wants a body now: { x, y, inside, dir, sit, key } (null while walking between places) */
  targetOf(pid, T) {
    const b = this.bodies.get(pid);
    const [act, bld, state] = this.segOf(pid, T);
    if (!bld || !this.byId[bld]) return null;
    const B = this.byId[bld], d = this.art.def(B.key) || {};
    if (state === 'in' || state === 'away') {
      const door = d.doorPoint ? { x: B.x + d.doorPoint[0], y: B.y + d.doorPoint[1] } : { x: B.x, y: B.y + 40 };
      return { key: bld + ':in', x: door.x, y: door.y, inside: true, dir: d.doorDir || 'NE' };
    }
    const key = bld + ':' + act;
    if (!(b.goal === key && b.slot)) { this.freeSlot(b); b.slot = this.takeSlot(pid, bld, act); }
    const sl = b.slot.s;
    return { key, x: sl.x, y: sl.y, dir: sl.dir, sit: sl.kind === 'seat', depth: sl.depth };
  }

  /** put everyone where the schedule says, at once (start, a clock jump) */
  settle(T) {
    for (const [pid, b] of this.bodies) {
      if (b.held || !b.alive || b.extra || b.ambientOff) continue;
      b.goal = null;
      let t = this.targetOf(pid, T);
      if (!t) { const [, bld0] = this.segOf(pid, T - HOUR); t = bld0 ? this.targetOf(pid, T - HOUR) : null; }
      if (!t) continue;
      b.endPath();
      b.x = t.x; b.y = t.y; b.inside = !!t.inside;
      this.arrive(b, t);
      b.goal = t.key;
    }
  }
  arrive(b, t) {
    b.sitDepth = null;
    if (t.inside) { b.inside = true; return; }
    if (t.sit) { b.sitDepth = t.depth || t.y + 1; b.rest = 'sit'; b.setAnim('sit', t.dir); }
    else { b.rest = 'idle'; b.setAnim('idle', t.dir || b.dir); }
  }

  ambient() {
    const T = this.T();
    for (const [pid, b] of this.bodies) {
      if (b.held || !b.alive || b.extra || b.ambientOff) continue;
      const [act, bld, state] = this.segOf(pid, T);
      if (!bld) continue;
      const key = state === 'in' || state === 'away' ? bld + ':in' : bld + ':' + act;
      if (key === b.goal) continue;
      if (state === 'in' || state === 'away') this.freeSlot(b);
      b.goal = null;
      const t = this.targetOf(pid, T);
      if (!t) continue;
      b.goal = t.key;
      b.inside = false;
      b.walkTo(t.x, t.y, 1, () => this.arrive(b, t));
    }
  }

  update(dtSec) {
    this.ambient();
    const v = this.view();
    const ms = dtSec * 1000;
    for (const b of this.bodies.values()) {
      if (!b.alive) continue;
      b.step(dtSec);
      // fast-forward (headless capture steps): logic only, the pictures catch up on the rendered frame
      if (this.fast) continue;
      if (v) {
        const near = b.x > v.x - RIG_MARGIN && b.x < v.x + v.width + RIG_MARGIN && b.y > v.y - RIG_MARGIN && b.y < v.y + v.height + RIG_MARGIN + 120;
        const want = near && !b.inside && !b.hidden;
        const has = !!(b.rig || b.spr);
        if (want && !has && this.rigs < MAX_RIGS) b.materialize(true);
        else if (!want && has && !b.held && (!near || b.inside)) b.materialize(false);
      }
      b.draw(ms);
      if (b.attached) this.placeStroller(b);
    }
  }

  // ---------------------------------------------------------------- ports.town
  ports() {
    const self = this;
    return {
      whereabouts: (out) => this.town.whereabouts(this.T(), out),
      visible: (out, max) => {
        const v = this.view();
        if (!v) return out;
        for (const [pid, b] of this.bodies) {
          if (out.length >= max) break;
          if (!b.alive || b.inside || b.hidden || b.isPet || b.extra) continue;
          if (b.x >= v.x && b.x <= v.x + v.width && b.y >= v.y && b.y <= v.y + v.height) out.push(pid);
        }
        return out;
      },
      bodyOf: (pid) => { const b = this.bodies.get(pid); return b && b.alive && !b.inside ? b : null; },
      pidOfBody: (body) => (body && body.pid) || null,
      hold: (pid) => { const b = this.bodies.get(pid); if (!b || !b.alive) return false; if (b.inside) { b.inside = false; } b.held = true; b.endPath(); b.goal = null; this.stats.holds++; if (!b.rig && !b.spr) b.materialize(true); return true; },
      release: (pid) => { const b = this.bodies.get(pid); if (!b) return; b.held = false; b.goal = null; b.face = null; b.sitDepth = null; b.rest = 'idle'; b.hidden = false; if (b.rig) b.rig.setFace(null); b.setAnim('idle'); },
      walk: (pid, x, y, opts, cb) => { const b = this.bodies.get(pid); if (!b || !b.alive) { if (cb) cb(); return; } this.stats.walks++; b.walkTo(x, y, (opts && opts.speed) || 1, cb); },
      face: (pid, d) => { const b = this.bodies.get(pid); if (!b) return; if (typeof d === 'object' && d) d = dirOf(d.x - b.x, d.y - b.y); b.setAnim(b.path ? b.anim : b.anim === 'walk' ? b.rest : b.anim, d); },
      anim: (pid, name, opts = {}) => {
        const b = this.bodies.get(pid);
        if (!b) return;
        if (b.path && name !== 'walk') { b.pending = name; return; }
        if (opts.face !== undefined) b.face = opts.face;
        if (name === 'sit') { b.rest = 'sit'; b.sitDepth = opts.depth !== undefined ? opts.depth : b.y + 1; }
        else if (!opts.once && name !== 'walk') { b.rest = name === 'idle' ? 'idle' : b.rest === 'sit' ? 'sit' : name; if (name !== 'sit' && b.rest !== 'sit') b.sitDepth = null; }
        b.setAnim(name, opts.dir || b.dir, { face: opts.face });
        if (opts.once) { const a = this.tf.T.anims[DOLL_MAP[name] || name]; b.onceT = a ? a.frames / a.fps * 1.5 : 1.2; }
      },
      dress: (pid, preset, opts = {}) => { const b = this.bodies.get(pid); if (!b || b.kind !== 'doll') return; this.stats.dress++; b.restyle(this.dressLook(b, preset, opts)); },
      place: (pid, x, y, dir) => { const b = this.bodies.get(pid); if (!b) return; b.endPath(); b.inside = false; b.x = x; b.y = y; b.sitDepth = null; if (b.rest === 'sit') b.rest = 'idle'; b.setAnim(b.anim === 'walk' ? 'idle' : b.anim, dir || b.dir); },
      hide: (pid, on) => { const b = this.bodies.get(pid); if (b) b.hidden = !!on; },
      attach: (pid, kind, opts = {}) => this.attachStroller(pid, opts),
      nearby: (x, y, r, n) => {
        const out = [];
        for (const [pid, b] of this.bodies) {
          if (!b.alive || b.inside || b.hidden || b.held || b.isPet || b.extra || b.villager === 'player') continue;
          const d = Math.hypot(b.x - x, (b.y - y) * 1.6);
          if (d <= r) out.push([d, pid]);
        }
        out.sort((a, b) => a[0] - b[0]);
        return out.slice(0, n).map((e) => e[1]);
      },
      spawn: (spec = {}) => {
        const pid = 'x:' + (++this.extraN);
        const age = spec.age || 'adult';
        const b = spec.key ? new CharBody(this, pid, spec.x || 0, spec.y || 0, spec.key, { pet: spec.pet }) : new DollBody(this, pid, spec.x || 0, spec.y || 0, this.makeLook(pid + (spec.seed || ''), age, null), age);
        b.extra = true; b.held = !!spec.held;
        if (spec.voice) b.voice = spec.voice;
        this.bodies.set(pid, b);
        b.materialize(true);
        return pid;
      },
      reserve: (id, rect) => this.reserve(id, rect),
      despawn: (pid) => { const b = this.bodies.get(pid); if (b) { b.destroy(); this.bodies.delete(pid); } },
      addCitizen: (spec = {}) => {
        // a story child (born in the story) gets a body next to a parent
        const near = spec.parents && spec.parents[0] ? this.bodies.get(spec.parents[0]) : null;
        const pid = 'k:' + spec.sid;
        const age = spec.age < 13 ? 'child' : spec.age >= 62 ? 'elder' : 'adult';
        const b = new DollBody(this, pid, near ? near.x + 30 : 1000, near ? near.y + 10 : 1400, this.makeLook(pid, age, null), age);
        b.extra = true; b.c = { id: 9000 + (spec.sid | 0), kind: 'child' };
        this.bodies.set(pid, b);
        return pid;
      },
      leave: (pid) => { const b = this.bodies.get(pid); if (b) { b.destroy(); this.bodies.delete(pid); } },
    };
  }

  // ---------------------------------------------------------------- the stroller (life2 baby_stroller + townfolk2 push)
  attachStroller(pid, opts) {
    const b = this.bodies.get(pid);
    const key = opts.pink ? 'baby_stroller_pink' : 'baby_stroller';
    const d = this.art.def(key);
    if (!b || !d || !this.scene.textures.exists(d.atlas)) return null;
    const s = this.scene.add.sprite(b.x, b.y, d.atlas).setOrigin(d.anchor[0], d.anchor[1]);
    const h = { s, key, def: d, destroy: () => { s.destroy(); if (b.attached === h) { b.attached = null; b.setAnim(b.rest); } } };
    b.attached = h;
    b.setAnim('push', b.dir, { still: true });
    this.placeStroller(b);
    return h;
  }
  placeStroller(b) {
    const h = b.attached;
    if (!h || !h.s.scene) return;
    const dir = b.dir, rd = MIRROR[dir] || dir, flip = dir in MIRROR;
    const d = h.def;
    const pp = b.kind === 'doll' ? this.tf.pushPoint(b.person, dir) : [flip ? -d.pushOffset[rd][0] : d.pushOffset[rd][0], -30, rd === 'N' || rd === 'NE'];
    const hp = d.handlePoint[rd] || [0, -52];
    const x = b.x + pp[0] - (flip ? -hp[0] : hp[0]), y = b.y + b.dy + pp[1] - hp[1];
    const anim = h.key + ':' + (b.path ? 'move' : 'idle') + ':' + rd;
    h.s.setPosition(x, y).setFlipX(flip).setDepth(b.y + (pp[2] ? -0.6 : 0.6)).setVisible(!b.hidden && !b.inside);
    if (this.scene.anims.exists(anim) && (!h.s.anims.currentAnim || h.s.anims.currentAnim.key !== anim)) h.s.play(anim);
    if (b.kind === 'doll' && b.rig) { if (!b.path) b.still = true; }
  }
}
