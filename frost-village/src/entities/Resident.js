// A villager or pet living in the village (v2). Movement + a few primitives (go to, play an anim
// for a while, say a line, show an emote). What a resident does is decided by systems/VillageLife.
// Off-screen residents are hidden, do not animate and update at a low rate (LOD).

import { Character } from './Character.js';
import { Assets } from '../core/Assets.js';
import { BALANCE } from '../data/balance.js';
import { getLang } from '../data/strings.js';
import { gdist } from '../core/Iso.js';

// which line category (strings.js LINES) a resident speaks with
const PERSONA = {
  npc_kid_boy: 'kid', npc_kid_girl: 'kid', npc_kid_prankster: 'prankster', npc_teen_girl: 'teen', npc_young_man: 'showoff',
  npc_aunt: 'kind', npc_uncle: 'grumpy', npc_grandma: 'gentle', npc_grandpa: 'easy', npc_merchant: 'sly', npc_herbalist: 'shy',
  npc_bard: 'bard', npc_blacksmith: 'hearty', npc_fashion: 'vain', npc_yellow: 'plain', npc_red: 'plain', npc_blue: 'plain',
  npc_captain: 'captain', npc_chef: 'chef', npc_postman: 'postman', npc_doctor: 'doctor', npc_painter: 'painter',
  npc_guard: 'guard', npc_skater: 'skater', npc_toddler: 'toddler',
};

const LOD_STEP = 0.25;     // s between updates of an off-screen resident

export class Resident extends Character {
  constructor(gs, life, key, x, y) {
    super(gs, key, x, y, { radius: 12, dir: 2 });
    const def = this.def;
    this.life = life;
    this.isPet = def.kind === 'pet';
    this.role = this.isPet ? 'pet' : (def.role || 'adult');
    this.traits = Array.isArray(def.traits) ? def.traits : [];
    this.persona = PERSONA[key] || (this.role === 'kid' ? 'kid' : this.role === 'elder' ? 'gentle' : 'plain');
    this.name = Assets.charName(key, getLang()) || key;
    const L = BALANCE.life;
    const k = this.role === 'elder' ? 0.72 : this.role === 'kid' ? 1.12 : this.isPet ? 1.15 : 1;
    this.walkSpeed = L.walkSpeed * k * (0.92 + Math.random() * 0.16);
    this.runSpeed = L.runSpeed * (this.role === 'elder' ? 0.6 : 1) * (0.94 + Math.random() * 0.12);
    this.state = 'idle';      // idle | move | act
    this.moveAnim = 'walk';
    this.idleAnim = 'idle';
    this.route = [];
    this.ri = 0;
    this.tol = 10;
    this.speed = this.walkSpeed;
    this.actT = 0;
    this.job = null;          // solo activity (VillageLife)
    this.event = null;        // group event this resident takes part in
    this.area = null;
    this.waveCd = 6 + Math.random() * 10;
    this.shiverCd = 10 + Math.random() * 30;
    this.seat = null;
    this.sitDy = 0;
    this.lod = false;
    this.lodT = Math.random() * LOD_STEP;
    this.stuckT = 0;
    this.moveT = 0;
    this.extraFx = null;      // looping fx attached (music notes, zzz)
  }

  get busy() { return !!(this.event || this.job); }
  get canSit() { return Assets.hasAnim(this.key, 'sit') || Assets.hasAnim(this.key, 'loaf'); }
  can(anim) { return Assets.hasAnim(this.key, anim); }

  // ---------------------------------------------------------------- primitives
  /** walk (or run) to (x, y); along the roads when it is far */
  goTo(x, y, opts = {}) {
    this.unsit();
    if (opts.direct || gdist(this.x, this.y, x, y) < 320) { this.route.length = 0; this.route.push({ x, y }); }
    else this.gs.roads.route(this.x, this.y, x, y, this.route);
    this.ri = 0;
    this.tol = opts.tol || 10;
    this.moveAnim = opts.run ? (this.can('skate') && opts.skate ? 'skate' : 'run') : 'walk';
    this.speed = opts.run ? this.runSpeed : this.walkSpeed;
    if (opts.speed) this.speed = opts.speed;
    this.state = 'move';
    this.moveT = 0;
    this.stuckT = 0;
    this.locomotion(true);
  }

  get arrived() { return this.state !== 'move'; }

  /** play `anim` for `dur` seconds (dur < 0: until something else happens) */
  act(anim, dur = -1) {
    this.state = 'act';
    this.vx = this.vy = 0;
    this.actT = dur;
    this.play(anim, true);
  }

  stand() {
    this.state = 'idle';
    this.vx = this.vy = 0;
    this.play(this.idleAnim);
  }

  locomotion(moving) { this.play(moving ? this.moveAnim : this.idleAnim); }

  /** say a line (strings.js LINES category or plain text) with an optional emote */
  say(catOrText, emote, dur, isText) {
    const life = this.life;
    const txt = isText ? catOrText : life.line(this, catOrText);
    if (!txt) return false;
    life.bubbles.chat(this, txt, emote, dur || BALANCE.life.bubbleTime);
    life.chatter(this);
    return true;
  }

  emote(key, dur) { this.life.bubbles.emote(this, key, dur || 1.6); }

  /** sit on a seat {x, y, dir, depthBase} (snaps to the seat point) */
  sitOn(seat, anim = 'sit') {
    this.seat = seat;
    seat.by = this;
    this.x = seat.x; this.y = seat.y;
    this.dir = seat.dir;
    this.state = 'act';
    this.actT = -1;
    this.vx = this.vy = 0;
    this.play(anim, true);
    this.sync(0);
  }

  unsit() {
    if (!this.seat) return;
    if (this.seat.by === this) this.seat.by = null;
    const s = this.seat;
    this.seat = null;
    // step off the seat (in front of it)
    this.x = s.standX; this.y = s.standY;
    this.stopFx();
  }

  attachFx(spr) { this.stopFx(); this.extraFx = spr; }
  stopFx() { if (this.extraFx) { this.extraFx.destroy(); this.extraFx = null; } }

  // ---------------------------------------------------------------- update
  update(dt, view) {
    const gs = this.gs;
    // level of detail: off-screen residents are hidden and think 4x a second
    const m = 160;
    const on = this.x > view.x - m && this.x < view.right + m && this.y > view.y - m && this.y < view.bottom + m + 60;
    if (on === this.lod) {
      this.lod = !on;
      this.sprite.setVisible(on); this.shadow.setVisible(on);
      if (on) { this.sprite.anims.resume(); this.animKey = ''; this.play(this.animName || 'idle', true); } else this.sprite.anims.pause();
      if (this.extraFx) this.extraFx.setVisible(on);
    }
    if (this.lod) {
      this.lodT += dt;
      if (this.lodT < LOD_STEP) return;
      dt = this.lodT; this.lodT = 0;
    }
    this.waveCd -= dt; this.shiverCd -= dt;
    if (this.state === 'move') this.stepMove(dt);
    else if (this.state === 'act' && this.actT >= 0) {
      this.actT -= dt;
      if (this.actT <= 0) this.stand();
    }
    if (!this.lod) this.sync(dt);
    else { this.sprite.x = this.x; this.sprite.y = this.y; }
    if (this.extraFx && !this.lod) { this.extraFx.setPosition(this.x + (this.fxDx || 0), this.y + this.headTop + (this.fxDy || 0)); }
  }

  stepMove(dt) {
    const gs = this.gs;
    const r = this.route;
    while (this.ri < r.length - 1 && gdist(this.x, this.y, r[this.ri].x, r[this.ri].y) < 30) this.ri++;
    const w = r[this.ri];
    if (!w) { this.state = 'idle'; this.stand(); return; }
    const last = this.ri >= r.length - 1;
    this.moveT += dt;
    if (this.lod) {
      // off-screen: straight line, no collision, no anims
      const dx = w.x - this.x, dy = w.y - this.y, d = Math.hypot(dx, dy);
      const step = this.speed * dt;
      if (d <= Math.max(step, last ? this.tol : 24)) { this.x = w.x; this.y = w.y; if (last) { this.state = 'idle'; this.vx = this.vy = 0; } else this.ri++; }
      else { this.x += (dx / d) * step; this.y += (dy / d) * step; this.vx = dx / d * this.speed; this.vy = dy / d * this.speed; this.dir = this.dirFrom(dx, dy); }
      return;
    }
    const px = this.x, py = this.y;
    if (gs.moveAgent(this, w.x, w.y, this.speed, dt, last ? this.tol : 26)) {
      if (last) { this.state = 'idle'; this.vx = this.vy = 0; this.play(this.idleAnim); }
      else this.ri++;
    }
    // stuck for long (crowd, obstacle): give up the walk
    if (Math.hypot(this.x - px, this.y - py) < this.speed * dt * 0.2) { this.stuckT += dt; if (this.stuckT > 2.5) { this.state = 'idle'; this.stand(); this.stuckT = 0; } }
    else this.stuckT = 0;
    if (this.moveT > 60) { this.state = 'idle'; this.stand(); }
  }

  dirFrom(dx, dy) {
    const a = Math.atan2(dy * 2, dx);
    return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  }

  sync(dt) {
    super.sync(dt);
    // a sitter is drawn just above its seat (seatDepth 'front')
    if (this.seat && this.seat.depth !== undefined) { const d = this.seat.depth; if (this.sprite.depth !== d) this.sprite.setDepth(d); }
  }

  destroy() {
    this.stopFx();
    if (this.seat && this.seat.by === this) this.seat.by = null;
    super.destroy();
  }
}
