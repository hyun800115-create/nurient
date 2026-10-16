// (v4.2, docs/v42_plan.md §6.4–6.5) the office's staff: 셈이 (장부), 소복이 (소식·편지), 총총이 (수행비서), 딸랑이 (수금원),
// and the bank's tellers + 은행장. Townsfolk paper dolls dressed by the code presets of src/data/staffLooks.js (a
// village look when the townsfolk art is not there). CODE-1 plays the anims every townsperson has (idle / walk / talk
// / wave / happy) with code props; CODE-2 swaps in the officefolk anims (desk_write, carry_sack, hand_over …) by name.
//   Staff        a clerk at a desk spot: every so often walks to a spot and back (the board, the mailbox), says a line
//   Aide         총총이: follows the chief 1.6–2.4 m behind and to the side, waits at home when he is far
//   Courier      딸랑이: rounds of the village tills (CashPad.takeAll) by nearest neighbour, deposits at the bank
//                counter (or the office safe before the bank): coins -> the HUD counter + a passbook row

import { Character } from '../Character.js';
import { Assets } from '../../core/Assets.js';
import { Audio } from '../../core/Audio.js';
import { TF } from '../../core/Townfolk.js';
import { BALANCE } from '../../data/balance.js';
import { t } from '../../data/strings.js';
import { gdist } from '../../core/Iso.js';
import { STAFF_PRESET } from '../../data/staffLooks.js';

/** a deterministic look for (role, seed) */
export function staffLook(role, seed) {
  let s = (seed >>> 0) || 1;
  const rng = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; };
  if (TF.ok && TF.readyFor(Assets, 'adult')) {
    const pre = STAFF_PRESET[role] || 'office_a';
    try { const p = TF.person(rng, pre); if (p) return { key: 'tf:' + p.base, person: p }; } catch (e) { /* village look */ }
  }
  const k = role === 'ttal' ? 'npc_porter_a' : role === 'chong' ? 'npc_clerk_b' : 'npc_clerk_a';
  return { key: Assets.m.characters[k] && (Assets.charReady(k) || Assets.charPending(k)) ? k : 'villager_b' };
}

export class Staff extends Character {
  constructor(gs, office, role, seed, x, y, home) {
    const look = staffLook(role, seed);
    super(gs, look.key, x, y, look.person ? { person: look.person, radius: 12 } : { radius: 12 });
    this.office = office;
    this.role = role;
    this.seed = seed;
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
    gs.agents.push(this);
  }

  /** walk along the roads to (x, y), then cb() */
  walkTo(x, y, cb) {
    const gs = this.gs;
    if (gdist(this.x, this.y, x, y) < 220) { this.route.length = 0; this.route.push({ x, y }); }
    else gs.roads.route(this.x, this.y, x, y, this.route);
    this.ri = 0; this.target = { x, y }; this.cb = cb || null;
  }

  say(text, sec) { const B = this.gs.life && this.gs.life.bubbles; if (B && this.gs.isOnScreen(this.x, this.y, 200)) B.chat(this, text, null, sec || 2.6); }

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

  /** the routine of a desk clerk (셈이 / 소복이 / tellers): the desk, now and then an errand */
  update(dt) {
    if (!this.alive) return;
    if (this.target) this.step(dt);
    else {
      this.vx = this.vy = 0;
      if (this.animName === 'walk') this.locomotion(false);
      this.taskT -= dt;
      if (this.taskT <= 0 && this.errand) { this.taskT = 30 + (this.seed % 11); this.errand(); }
    }
    this.sayT -= dt;
    this.sync(dt);
  }

  /** back to the desk, facing the street */
  goHome(cb) { this.doing = 'desk'; this.walkTo(this.home.x, this.home.y, () => { this.faceTo(this.home.x - 40, this.home.y + 30); if (cb) cb(); }); }

  serialize() { return this.seed >>> 0; }
}

/** 총총이: follows the chief a little behind and to the side, never in his way */
export class Aide extends Staff {
  constructor(gs, office, seed, x, y, home) { super(gs, office, 'chong', seed, x, y, home); this.speed = 150; this.side = (seed & 1) ? 1 : -1; this.doing = 'follow'; }
  update(dt) {
    if (!this.alive) return;
    const gs = this.gs, p = gs.player, O = this.office;
    const far = gdist(p.x, p.y, O.x, O.y) > 2000;
    if (far || (O.pilotOffice && O.pilotOffice())) {
      // stays home (sits at her desk) when the chief is far from the office
      if (this.doing !== 'home') { this.doing = 'home'; this.goHome(() => { this.doing = 'home'; }); }
      if (this.target) this.step(dt);
    } else {
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
      } else { this.target = null; this.vx = this.vy = 0; if (this.animName === 'walk') this.locomotion(false); this.faceTo(p.x, p.y); }
    }
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
    this.sack = Assets.image(gs, x, y - 120, 'item_coin').setOrigin(0.5).setDepth(y + 1);
    this.sack.setVisible(false);
    this.sackN = gs.add.text(x, y - 150, '', { fontFamily: gs.font, fontSize: '18px', fontStyle: '900', color: '#ffd84a', stroke: '#5a3a10', strokeThickness: 5, resolution: 2 }).setOrigin(0.5).setDepth(y + 2);
    this.rounds = 0;
    this.deposited = 0;
    if (this.state === 'toBank') this.toBank();
  }

  get C() { return (BALANCE.v42 && BALANCE.v42.courier) || { every: 60, rushAt: 1000, minPad: 100 }; }

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
    this.walkTo(q.till.x + 30, q.till.y + 26, () => { this.state = 'scoop'; this.scoopT = 1.0; this.faceTo(q.till.x, q.till.y); });
  }

  toBank() {
    const O = this.office;
    const at = O.depositPoint();
    this.state = 'toBank';
    this.cur = null;
    this.walkTo(at.x, at.y, () => { this.state = 'deposit'; this.depT = 1.4; this.faceTo(at.fx || at.x - 30, at.fy || at.y - 20); });
  }

  update(dt) {
    if (!this.alive) return;
    const gs = this.gs, O = this.office;
    switch (this.state) {
      case 'desk': {
        this.vx = this.vy = 0;
        if (this.animName === 'walk') this.locomotion(false);
        this.waitT -= dt;
        if (this.due()) { this.plan = this.planRound(); this.rounds++; this.waitT = Number(this.C.every) || 60; if (this.plan.length) this.nextStop(); }
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
          this.nextStop();
        }
        break;
      }
      case 'toBank': this.step(dt); break;
      case 'deposit': {
        this.vx = this.vy = 0;
        this.depT -= dt;
        if (this.depT <= 0) {
          const n = this.bag;
          this.bag = 0;
          if (n > 0) { O.deposit(n, this); this.deposited += n; }
          this.state = 'home';
          this.goHome(() => { this.state = 'desk'; });
        }
        break;
      }
      case 'home': this.step(dt); break;
      default: this.state = 'desk';
    }
    // the sack over the shoulder grows with its value (CODE-2: item_coin_sack_s / m / l, carry_sack)
    const show = this.bag > 0 && this.sprite.visible !== false;
    this.sack.setVisible(show); this.sackN.setVisible(show);
    if (show) {
      const k = this.bag >= 3000 ? 1.25 : this.bag >= 1000 ? 1.0 : 0.8;
      this.sack.setScale(0.55 * k).setPosition(this.x + 14, this.y - 112).setDepth(this.y + 1);
      const s = this.bag >= 10000 ? Math.round(this.bag / 1000) + 'k' : String(this.bag);
      if (this.sackN.text !== s) this.sackN.setText(s);
      this.sackN.setPosition(this.x + 14, this.y - 142).setDepth(this.y + 2);
    }
    this.sync(dt);
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
