// (v4.2, docs/v42_plan.md §6.4–6.5) the office's staff: 셈이 (장부), 소복이 (소식·편지), 총총이 (수행비서), 딸랑이 (수금원),
// and the bank's tellers + 은행장, the depot's workers. Townsfolk paper dolls dressed by their presets (the officefolk
// manifest's own once it is merged, else the code presets of src/data/staffLooks.js; a village look when the
// townsfolk art is not there).
// (CODE-2) Their acts are the officefolk anims (CONTRACT_V42 AJ), chosen through TF.pick(): a page or a body part the
// anim needs is missing -> its contract fallback (desk_write -> sit_idle -> idle, carry_sack -> walk, scoop -> happy …):
//   at the desk   seated ON the manifest's seat point (inside the office: the desk front is drawn over the lap; band
//                 behind / front per desk), their shadow on the floor below the seat
//                 셈이 desk_write / desk_type (typewriter a) · 소복이 desk_type (typewriter b) / desk_read / desk_phone
//                 (the phone rings first) · 총총이 sit_idle / note · 딸랑이 desk_count
//   errands       셈이 to the 재고판: point_board · 소복이 to the mailbox, then file at the pigeonholes
//   tellers       stamp_stand / hand_over at the counter, drawn counter.places.bank.liftPx higher (their hands over the
//                 counter top) · 은행장 desk_write / desk_read in his seat
//   the courier   carry_sack while the sack holds coins (its walk played at speed / groundSpeed), scoop at each till,
//                 hand_over at the bank counter (the sack flies to the teller), desk_count between rounds
//   the aide      note while the chief chats, sits at her desk when he is in the office
//   Staff        a clerk at a desk spot: every so often walks to a spot and back (the board, the mailbox), says a line
//   Aide         총총이: follows the chief 1.6–2.4 m behind and to the side, waits at home when he is far
//   Courier      딸랑이: rounds of the village tills (CashPad.takeAll) by nearest neighbour, deposits at the bank
//                counter (or the office safe before the bank): coins -> the HUD counter + a passbook row

import { Character } from '../Character.js';
import { Assets } from '../../core/Assets.js';
import { Audio } from '../../core/Audio.js';
import { Residency } from '../../core/Residency.js';
import { TF } from '../../core/Townfolk.js';
import { BALANCE } from '../../data/balance.js';
import { t } from '../../data/strings.js';
import { gdist, DIRS8 } from '../../core/Iso.js';
import { STAFF_PRESET } from '../../data/staffLooks.js';

/** a deterministic look for (role, seed) */
export function staffLook(role, seed) {
  let s = (seed >>> 0) || 1;
  const rng = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; };
  if (TF.ok && TF.readyFor(Assets, 'adult')) {
    const pre = STAFF_PRESET[role] || 'office_a';
    try { const p = TF.person(rng, pre); if (p) return { key: 'tf:' + p.base, person: p, of: !!TF.of }; } catch (e) { /* village look */ }
  }
  const k = role === 'ttal' ? 'npc_porter_a' : role === 'chong' ? 'npc_clerk_b' : 'npc_clerk_a';
  return { key: Assets.m.characters[k] && (Assets.charReady(k) || Assets.charPending(k)) ? k : 'villager_b' };
}

// the anim a desk keeps playing, and the second one it changes to now and then (CODE-1 fallbacks when officefolk is
// not merged: idle)
const DESK = { sem: ['desk_write', 'desk_type'], bok: ['desk_type', 'desk_read'], chong: ['sit_idle', 'note'], ttal: ['desk_count', 'desk_count'], manager: ['desk_write', 'desk_read'], teller0: ['idle', 'stamp_stand'], teller1: ['idle', 'note'], depot: ['idle', 'note'] };
const SEATED = new Set(['sit_idle', 'desk_type', 'desk_write', 'desk_phone', 'desk_read', 'desk_count']);
const OLD_FALLBACK = { desk_write: 'idle', desk_type: 'idle', desk_read: 'idle', desk_phone: 'talk', desk_count: 'idle', sit_idle: 'idle', file: 'idle', point_board: 'talk', stamp_stand: 'talk', bow: 'wave', note: 'idle', hand_over: 'talk', scoop: 'happy', carry_sack: 'walk' };

export class Staff extends Character {
  constructor(gs, office, role, seed, x, y, home) {
    const look = staffLook(role, seed);
    super(gs, look.key, x, y, look.person ? { person: look.person, radius: 12 } : { radius: 12 });
    this.office = office;
    this.role = role;
    this.seed = seed;
    this.dressed = !!look.person;     // false: the village stand-in (the townsfolk art was not merged yet)
    this.dressedOf = !!look.of;       // dressed with officefolk merged (its presets and anims)
    this.noXray = true;
    this.home = home || { x, y };
    this.route = [];
    this.ri = 0;
    this.target = null;
    this.cb = null;
    this.speed = 105;
    this.doing = 'desk';
    this.taskT = 12 + (seed % 9);
    this.sayT = 0;
    this.want = null;                 // the act asked for (TF.pick may play its fallback for now)
    this.pickT = 0;
    this.deskT = 6 + (seed % 7);
    this.liftPx = 0;                  // tellers: drawn this much higher behind the counter
    this.seat = null;                 // { x, y, dir, band } while seated
    gs.agents.push(this);
  }

  /** walk along the roads to (x, y), then cb() */
  walkTo(x, y, cb) {
    const gs = this.gs;
    if (this.seat) this.standUp();
    if (gdist(this.x, this.y, x, y) < 220) { this.route.length = 0; this.route.push({ x, y }); }
    else gs.roads.route(this.x, this.y, x, y, this.route);
    this.ri = 0; this.target = { x, y }; this.cb = cb || null;
    this.want = null;
  }

  /** walk to a point inside the office (ground coordinates): through its door when coming from outside */
  walkIn(x, y, cb) {
    const B = this.office && this.office.building;
    if (!B || !B.cw || B.cw.onFloor(this.x, this.y) || gdist(this.x, this.y, x, y) < 90) { this.walkTo(x, y, cb); return; }
    const d = B.spots.door, e = B.spots.entry;
    this.walkTo(d.x, d.y, () => { this.route.length = 0; this.route.push({ x: e.x, y: e.y }, { x, y }); this.ri = 0; this.target = { x, y }; this.cb = cb || null; });
  }

  say(text, sec) { const B = this.gs.life && this.gs.life.bubbles; if (B && this.gs.isOnScreen(this.x, this.y, 200)) B.chat(this, text, null, sec || 2.6); }

  // ------------------------------------------------------------------ acts (officefolk)
  /** play officefolk act `anim` (or its fallback while a page / part is missing); asks Residency for the page */
  act(anim, force) {
    this.want = anim;
    const p = this.sprite && this.sprite.person;
    let a = anim;
    if (p && TF.of && this.dressedOf) {
      const vis = this.sprite.visible !== false && this.gs.isOnScreen(this.x, this.y, 260);
      a = TF.pick(p, anim, (g) => { if (vis && TF.ofAtlas && TF.ofAtlas[g]) Residency.want(TF.ofAtlas[g]); }).anim;
    } else a = OLD_FALLBACK[anim] || anim;
    this.pickT = 0.5;
    // on a seat but the seated anim cannot play yet (a page on its way, an old look): stand on the floor below it
    // (the seat point is 0.45 m up) instead of floating at seat height
    if (this.seat) { const sd = this.seat.shadowDy !== undefined ? this.seat.shadowDy : 25; const sat = SEATED.has(a); this.seatDrop = sat ? 0 : sd; this.shadowDy = sat ? sd : 0; }
    this.play(a, force);
    return a;
  }

  /** the act asked for came in (its page arrived) or went (evicted): play what can be played now */
  refreshAct(dt) {
    if (!this.want) return;
    if ((this.pickT -= dt) > 0) return;
    const before = this.animName;
    const a = this.act(this.want);
    if (a !== before) this.animKey = '';
  }

  // ------------------------------------------------------------------ seats
  /** sit down on `seat` ({ x, y, dir, band }: a seat point inside, already on the raised floor) */
  sitDown(seat, anim) {
    this.seat = seat;
    this.route.length = 0; this.target = null; this.cb = null;
    this.vx = this.vy = 0;
    this.x = seat.x; this.y = seat.y;
    this.inside = true;
    this.slot = seat.band === 'front' ? '@front' : '@behind';
    // the soft shadow on the floor under the chair (officefolk deskSeat.groundOffsetPx)
    this.shadowDy = seat.shadowDy !== undefined ? seat.shadowDy : 25;
    if (seat.dir !== undefined) { const di = typeof seat.dir === 'number' ? seat.dir : DIRS8.indexOf(seat.dir); if (di >= 0) this.dir = di; }
    this.act(anim || 'sit_idle', true);
  }
  standUp() {
    const s = this.seat;
    if (!s) return;
    this.seat = null;
    this.shadowDy = 0;
    this.seatDrop = 0;
    this.slot = null;
    this.inside = false;
    // down onto the ground in front of the chair (the floor is lifted: the walk below it is the ground)
    const B = this.office && this.office.building;
    this.y = s.y + (B && B.lift ? B.lift : 17) + 6;
  }

  /** move along the route; true on arrival */
  step(dt) {
    if (!this.target) return true;
    if (this.gs.followRoute(this, this.speed, dt, 10)) {
      this.target = null; this.vx = this.vy = 0; this.locomotion(false);
      const cb = this.cb; this.cb = null; if (cb) cb(this);
      return true;
    }
    return false;
  }

  /** the routine of a desk clerk (셈이 / 소복이 / tellers / the manager): the desk, now and then an errand */
  update(dt) {
    if (!this.alive) return;
    if (this.target) this.step(dt);
    else {
      this.vx = this.vy = 0;
      if (this.animName === 'walk' && !this.want) this.locomotion(false);
      this.taskT -= dt;
      if (this.taskT <= 0 && this.errand) { this.taskT = 30 + (this.seed % 11); this.errand(); }
      if (this.seat || this.atPost) this.deskRoutine(dt);
    }
    this.refreshAct(dt);
    this.sayT -= dt;
    this.sync(dt);
  }

  /** at the desk / the counter: the role's two acts, changing every 12–24 s (the sounds of the typewriters) */
  deskRoutine(dt) {
    const D = DESK[this.role] || DESK.sem;
    this.deskT -= dt;
    if (this.deskT <= 0 || !this.want) {
      this.deskT = 12 + ((this.seed + (this.deskN = (this.deskN || 0) + 1) * 7) % 13);
      const a = (this.deskN % 3 === 0) ? D[1] : D[0];
      if (!this.seat && SEATED.has(a)) this.act('idle'); else this.act(a);
    }
    // the typewriter clacks while a clerk types and the office is open on screen
    if (this.animName === 'desk_type' && this.seat) {
      const B = this.office && this.office.building;
      if (B && B.cw && B.cw.alpha > 0.5 && this.gs.isOnScreen(this.x, this.y, 120)) {
        this.typeT = (this.typeT || 0) - dt;
        if (this.typeT <= 0) { this.typeT = 0.55 + ((this.seed % 5) * 0.06); Audio.play(Audio.exists('sfx_typewriter') ? 'sfx_typewriter' : 'sfx_click', { volume: 0.35, throttle: 300 }); }
      }
    }
  }

  /** back to the desk (seated), facing its dir */
  goHome(cb) {
    this.doing = 'desk';
    const h = this.home, B = this.office && this.office.building;
    if (h.seat && B) {
      // walk to the ground below the seat (inside: through the door), then sit on it
      this.walkIn(h.x, h.y + (B.lift || 17) + 6, () => { this.sitDown(h.seat, (DESK[this.role] || DESK.sem)[0]); if (cb) cb(); });
      return;
    }
    this.walkTo(h.x, h.y, () => { this.faceTo(h.x - 40, h.y + 30); this.atPost = true; if (cb) cb(); });
  }

  serialize() { return this.seed >>> 0; }

  /** ((robust review M3) made before the townsfolk manifest arrived (or before officefolk merged): dress now */
  wantsDress() {
    if (!TF.ok || !TF.readyFor(Assets, 'adult')) return false;
    if (this.dressed && (this.dressedOf || !TF.of)) return false;
    // (only when the doll look really can be made now: no churn while a preset is still missing)
    const now = this.gs.time.now;
    if (this.dressTryT && now - this.dressTryT < 10000) return false;
    this.dressTryT = now;
    return !!staffLook(this.role, this.seed).person;
  }
  /** standing still at home (a re-dress then goes unnoticed) */
  settled() { return !this.target && (this.doing === 'desk' || this.doing === 'home' || this.inside); }

  /** the courier / teller sprite lift and the seated shadow (Character.sync) */
  sync(dt) {
    super.sync(dt);
    if (this.liftPx || this.seatDrop) { this.sprite.setPosition(this.x, this.y - (this.liftY || 0) - (this.liftPx || 0) + (this.seatDrop || 0)); }
  }

  destroy() {
    const A = this.gs.agents, i = A ? A.indexOf(this) : -1;
    if (i >= 0) A.splice(i, 1);
    super.destroy();
  }
}

/** ((robust review M3) swap a stand-in staff member for a paper doll of the same role and seed, in place; make(seed, x, y)
 *  builds the new one (the caller keeps its own bookkeeping) */
export function redress(ch, make) {
  const n = make(ch.seed, ch.x, ch.y);
  if (!n) return ch;
  n.dir = ch.dir;
  n.inside = ch.inside; n.slot = ch.slot; n.errand = ch.errand;
  if (ch.sprite && ch.sprite.visible === false) { n.sprite.setVisible(false); if (n.shadow) n.shadow.setVisible(false); }
  ch.destroy();
  return n;
}

/** 총총이: follows the chief a little behind and to the side, never in his way */
export class Aide extends Staff {
  constructor(gs, office, seed, x, y, home) { super(gs, office, 'chong', seed, x, y, home); this.speed = 150; this.side = (seed & 1) ? 1 : -1; this.doing = 'follow'; }
  update(dt) {
    if (!this.alive) return;
    const gs = this.gs, p = gs.player, O = this.office;
    const far = gdist(p.x, p.y, O.x, O.y) > 2000;
    const B = O.building;
    const chiefIn = !!(B && B.cw && B.cw.onFloor(p.x, p.y));
    if (far || chiefIn || (O.pilotOffice && O.pilotOffice())) {
      // stays home (sits at her desk) when the chief is far from the office, or in it
      if (this.doing !== 'home') { this.doing = 'home'; this.goHome(() => { this.doing = 'home'; }); }
      if (this.target) this.step(dt);
      else if (this.seat) this.deskRoutine(dt);
    } else {
      if (this.seat) this.standUp();
      this.doing = 'follow';
      // a point 1.6–2.4 m behind him (64 px per m), to the side
      const vx = p.vx || 0, vy = p.vy || 0, sp = Math.hypot(vx, vy);
      const hx = sp > 10 ? vx / sp : (this.lastHx || 0), hy = sp > 10 ? vy / sp : (this.lastHy || 1);
      this.lastHx = hx; this.lastHy = hy;
      const back = 120, side = 60 * this.side;
      const tx = p.x - hx * back - hy * side, ty = p.y - hy * back * 0.5 + hx * side * 0.5;
      const d = gdist(this.x, this.y, tx, ty);
      // far and off screen: she appears at his last door (teleport), never runs a marathon across the map
      if (d > 900 && !gs.isOnScreen(this.x, this.y, 100) && !gs.isOnScreen(tx, ty, 0)) { this.x = tx; this.y = ty; this.route.length = 0; this.target = null; }
      else if (d > 40) {
        if (!this.target || gdist(this.target.x, this.target.y, tx, ty) > 80 || this.replT <= 0) { this.walkTo(tx, ty); this.replT = 0.6; }
        this.replT = (this.replT || 0) - dt;
        this.speed = d > 260 ? 230 : d > 120 ? 170 : 120;
        this.step(dt);
      } else {
        this.target = null; this.vx = this.vy = 0;
        this.faceTo(p.x, p.y);
        // (CODE-2) she takes notes while he chats or stands still (note; her note frames live on the resident page)
        const pilot = gs.v42 && gs.v42.pilot, chatting = !!(pilot && pilot.on && pilot.act && pilot.act.act === 'chat' && pilot.arrived);
        if (chatting || Math.hypot(p.vx || 0, p.vy || 0) < 5) { if (this.want !== 'note') this.act('note'); }
        else if (this.animName !== 'idle') { this.want = null; this.play('idle'); }
      }
    }
    this.refreshAct(dt);
    this.sync(dt);
  }
}

/** 딸랑이: the coin rounds */
export class Courier extends Staff {
  constructor(gs, office, seed, x, y, home, bag) {
    super(gs, office, 'ttal', seed, x, y, home);
    this.speed = Number(BALANCE.v42 && BALANCE.v42.courier && BALANCE.v42.courier.speed) || 150;
    this.bag = Math.max(0, Math.floor(bag || 0));
    this.state = this.bag > 0 ? 'toBank' : 'desk';
    this.waitT = 4 + (seed % 5);
    this.plan = [];
    // the sack: (CODE-2) officefolk carry_sack draws it over his shoulder; while that anim is not there a coin sack
    // (item_coin_sack_s / m / l by value) rides on his head as in CODE-1
    this.sack = Assets.image(gs, x, y - 120, Assets.pick('item_coin_sack_s', 'item_coin')).setOrigin(0.5).setDepth(y + 1);
    this.sack.setVisible(false);
    this.sackN = gs.add.text(x, y - 150, '', { fontFamily: gs.font, fontSize: '18px', fontStyle: '900', color: '#ffd84a', stroke: '#5a3a10', strokeThickness: 5, resolution: 2 }).setOrigin(0.5).setDepth(y + 2);
    this.rounds = 0;
    this.deposited = 0;
    if (this.state === 'toBank') this.toBank();
  }

  get C() { return (BALANCE.v42 && BALANCE.v42.courier) || { every: 60, rushAt: 1000, minPad: 100 }; }

  /** (CODE-2) walking with coins: the shoulder sack walk at a rate that keeps his boots planted */
  locomotion(moving) {
    if (moving && this.bag > 0) {
      const a = this.act('carry_sack');
      if (a === 'carry_sack' && TF.of && this.sprite.person) {
        const gsp = TF.of.groundSpeed ? TF.of.groundSpeed(this.sprite.person, 'carry_sack', DIRS8[this.dir] || 'SE') : 0;
        this.sprite.anims.timeScale = gsp > 1 ? Math.max(0.8, Math.min(1.8, this.speed / gsp)) : 1;
      }
      return;
    }
    if (this.sprite.anims) this.sprite.anims.timeScale = 1;
    this.want = null;
    super.locomotion(moving);
  }

  /** the tills worth a visit, nearest neighbour from (x, y) */
  planRound() {
    const O = this.office, C = this.C;
    const left = O.tills().filter((q) => q.till.value >= (Number(C.minPad) || 100));
    const out = [];
    let x = this.x, y = this.y;
    while (left.length) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < left.length; i++) { const d = gdist(x, y, left[i].till.x, left[i].till.y); if (d < bd) { bd = d; bi = i; } }
      const q = left.splice(bi, 1)[0];
      out.push(q); x = q.till.x; y = q.till.y;
    }
    return out;
  }

  /** is a round due? every C.every s, or at once when one till holds C.rushAt */
  due() {
    const O = this.office, C = this.C;
    const T = O.tills();
    if (T.some((q) => q.till.value >= (Number(C.rushAt) || 1000))) return true;
    return this.waitT <= 0 && T.some((q) => q.till.value >= (Number(C.minPad) || 100));
  }

  nextStop() {
    const q = this.plan.shift();
    if (!q) { this.toBank(); return; }
    this.cur = q;
    this.state = 'walk';
    this.walkTo(q.till.x + 30, q.till.y + 26, () => { this.state = 'scoop'; this.scoopT = 1.2; this.faceTo(q.till.x, q.till.y); this.act('scoop'); });
  }

  toBank() {
    const O = this.office;
    const at = O.depositPoint();
    this.state = 'toBank';
    this.cur = null;
    const arrive = () => { this.state = 'deposit'; this.depT = 1.4; this.faceTo(at.fx || at.x - 30, at.fy || at.y - 20); this.act('hand_over'); this.handed = false; };
    if (!O.bank && O.building && O.building.cw) this.walkIn(at.x, at.y, arrive);
    else this.walkTo(at.x, at.y, arrive);
  }

  update(dt) {
    if (!this.alive) return;
    const O = this.office;
    switch (this.state) {
      case 'desk': {
        this.vx = this.vy = 0;
        if (!this.target && !this.seat && this.home.seat && O.building && O.building.cw) { this.state = 'home'; this.goHome(() => { this.state = 'desk'; }); break; }
        if (this.seat) this.deskRoutine(dt); else if (this.animName === 'walk') this.locomotion(false);
        this.waitT -= dt;
        if (this.due()) { this.plan = this.planRound(); this.rounds++; this.waitT = Number(this.C.every) || 60; if (this.plan.length) { this.want = null; this.nextStop(); } }
        break;
      }
      case 'walk': this.step(dt); break;
      case 'scoop': {
        this.vx = this.vy = 0;
        this.scoopT -= dt;
        if (this.scoopT <= 0) {
          const q = this.cur;
          const n = q && q.till.value > 0 ? O.takeTill(q, this) : 0;
          if (n > 0) { this.bag += n; this.sacked(n); }
          this.want = null;
          this.nextStop();
        }
        break;
      }
      case 'toBank': this.step(dt); break;
      case 'deposit': {
        this.vx = this.vy = 0;
        this.depT -= dt;
        // (CODE-2) half-way through hand_over the sack flies from his mittens to the counter / the safe
        if (!this.handed && this.depT < 0.8 && this.bag > 0) { this.handed = true; this.flySack(); }
        if (this.depT <= 0) {
          const n = this.bag;
          this.bag = 0;
          if (n > 0) { O.deposit(n, this); this.deposited += n; }
          this.want = null;
          this.state = 'home';
          this.goHome(() => { this.state = 'desk'; });
        }
        break;
      }
      case 'home': this.step(dt); break;
      default: this.state = 'desk';
    }
    // the sack on his head only while the shoulder sack (carry_sack) cannot be drawn
    const shoulder = this.animName === 'carry_sack' || this.animName === 'scoop' || this.animName === 'hand_over';
    const show = this.bag > 0 && this.sprite.visible !== false && !shoulder;
    this.sack.setVisible(show);
    this.sackN.setVisible(this.bag > 0 && this.sprite.visible !== false);
    const d = this.inDepth !== undefined ? this.inDepth : this.y, ins = d !== this.y, ly = this.liftY || 0;
    if (show) {
      const key = this.bag >= 3000 ? 'item_coin_sack_l' : this.bag >= 1000 ? 'item_coin_sack_m' : 'item_coin_sack_s';
      if (this.sackKey !== key && Assets.has(key)) { this.sackKey = key; Assets.apply(this.sack, key); this.sack.setOrigin(0.5); }
      const k = this.sackKey ? 0.75 : (this.bag >= 3000 ? 1.25 : this.bag >= 1000 ? 1.0 : 0.8) * 0.55;
      // ((robust review H2) inside the bank the sack and its number sit in his slot: a closed shell covers them too)
      this.sack.setScale(k).setPosition(this.x + 14, this.y - 112 - ly).setDepth(ins ? d + 3e-6 : this.y + 1);
    }
    if (this.bag > 0 && this.sprite.visible !== false) {
      const s = this.bag >= 10000 ? Math.round(this.bag / 1000) + 'k' : String(this.bag);
      if (this.sackN.text !== s) this.sackN.setText(s);
      this.sackN.setPosition(this.x + 14, this.y - (shoulder ? 128 : 142) - ly).setDepth(ins ? d + 4e-6 : this.y + 2);
    }
    this.refreshAct(dt);
    this.sync(dt);
  }

  /** the coin sack (s / m / l by value) flies from his hands to the teller / the safe */
  flySack() {
    const gs = this.gs, O = this.office;
    if (!gs.isOnScreen(this.x, this.y, 160)) return;
    const key = this.bag >= 3000 ? 'item_coin_sack_l' : this.bag >= 1000 ? 'item_coin_sack_m' : 'item_coin_sack_s';
    if (!Assets.has(key)) return;
    let hx = this.x + (this.sprite.flipX ? -18 : 18), hy = this.y - 52;
    if (TF.of && this.sprite.person && this.animName === 'hand_over') {
      const hp = TF.of.handPoint(this.sprite.person, DIRS8[this.dir] || 'SE', 3);
      if (hp) { hx = this.x + hp[0]; hy = this.y + hp[1] - (this.liftY || 0); }
    }
    const to = O.bank ? O.bank.counter : (O.building ? O.building.spots.safe : { x: this.x, y: this.y - 40 });
    const img = Assets.image(gs, hx, hy, key).setDepth(this.sprite.depth + 1e-5).setScale(0.7);
    gs.tweens.add({ targets: img, x: to.x, y: to.y - 30, scale: 0.45, duration: 420, ease: 'Quad.easeIn', onComplete: () => img.destroy() });
    if (!O.bank && O.building && O.building.cw) { O.building.cw.state('chief_office_safe', 'open'); gs.time.delayedCall(1400, () => { if (O.building && O.building.cw) O.building.cw.state('chief_office_safe', 'shut'); }); }
  }

  sacked(n) {
    const gs = this.gs;
    if (gs.isOnScreen(this.x, this.y, 150)) {
      Audio.play(Audio.exists('sfx_coin_sack') ? 'sfx_coin_sack' : 'sfx_coins_many', { volume: 0.6, throttle: 200 });
      gs.effects.floatText(this.x, this.y - 150, '+' + n, '#ffd84a', 24);
    }
  }

  doingText() {
    const O = this.office;
    const place = this.cur ? O.tillName(this.cur.name) : this.state === 'toBank' || this.state === 'deposit' ? O.depositName() : '';
    if (this.state === 'scoop') return t('ttal_collect', { place, n: this.bag });
    if (this.state === 'walk') return t('ttal_walk', { place, n: this.bag });
    if (this.state === 'toBank' || this.state === 'deposit') return t('ttal_deposit', { place, n: this.bag });
    return t('ttal_count');
  }

  destroy() { if (this.sack) this.sack.destroy(); if (this.sackN) this.sackN.destroy(); super.destroy(); }
}
