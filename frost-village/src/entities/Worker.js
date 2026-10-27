// Hired workers: go to a resource -> play the job's work anim -> carry a stack -> walk to the
// line's collection pile (v3.5; before: the station's input pad) -> drop items one by one -> repeat.
// The hunter shoots arrows. The 2nd / 3rd worker of a profession has another look (workers manifest
// professions{}: fisherman_b, fisherman_c, ...).
// Raw porters (v3.5) carry a collection pile to its station's input along the roads.
// Porters (v2, one per production line) pick up the station's products at its output pad and carry
// them along the roads to the counter / trade post (stack on the back for A-frame porters).

import { Character } from './Character.js';
import { Assets } from '../core/Assets.js';
import { BALANCE } from '../data/balance.js';
import { gdist } from '../core/Iso.js';
import { DEPTH } from '../systems/DepthSort.js';
import { shoreY } from '../systems/Collision.js';
import { PRIO } from '../systems/Logistics.js';

const STATION_OF = { fisherman: 'grill', lumberjack: 'sawmill', farmer: 'bakery', miner: 'smelter', hunter: 'smokehouse' };
const PILE_OF_WORKER = { fisherman: 'fish', lumberjack: 'log', farmer: 'wheat', miner: 'ore', hunter: 'meat' };

export class Worker extends Character {
  /** where a worker waits when there is nothing to do */
  static homeFor(gs, type, index) {
    return gs.workerHome(type, index);
  }

  constructor(gs, type, x, y, index = 0, role = 'worker') {
    // (v3.5) the look: base worker first, then the profession's variants (art may still be loading)
    const want = gs.workerKey ? gs.workerKey(type, index) : type;
    const key = want !== type && !Assets.charReady(want) ? type : want;
    super(gs, key, x, y, { radius: 14, capacity: BALANCE.workers.capacity, carryScale: BALANCE.player.carryScale });
    this.wantKey = key !== want ? want : null;
    this.checkT = 1;
    if (want !== type) gs.keysInUse.add(want);
    this.type = type;
    this.role = role;
    this.index = index;
    this.station = gs.stations[STATION_OF[type]];
    // (v3.5) what is caught goes to the line's collection pile (the chief / a raw porter takes it on)
    this.pile = gs.piles ? gs.piles[PILE_OF_WORKER[type]] || null : null;
    this.state = 'seek';
    this.node = null;
    this.cycles = 0;
    this.waitT = 0;
    this.dropT = 0;
    this.speed = BALANCE.workers.speed * (0.95 + Math.random() * 0.1);
    this.stand = { x: 0, y: 0 };
    this.onImpact = () => this.impact();
    this.home = Worker.homeFor(gs, type, index);
    // (v3) miners eat: one bread / smoked meat from the food box every few ores
    this.oreLeft = Math.max(1, Math.floor(BALANCE.food.orePerFood) || 5);
    this.hungry = false;
    this.emoteT = 0;
    gs.agents.push(this);
  }

  /** (v3) a miner who ran out of food waits by the mine until the food box has something */
  updateHungry(dt) {
    const gs = this.gs, box = gs.foodBox;
    if (!box || !box.active) { this.hungry = false; this.state = 'seek'; return; }
    const spot = { x: box.x + 70 + this.index * 40, y: box.y + 34 + this.index * 14 };
    if (gs.moveAgent(this, spot.x, spot.y, this.speed * 0.8, dt, 12)) {
      this.vx = this.vy = 0;
      this.faceTo(box.x, box.y);
      this.locomotion(false);
    }
    this.emoteT -= dt;
    if (this.emoteT <= 0) {
      this.emoteT = 3.2;
      if (gs.life && gs.isOnScreen(this.x, this.y, 80)) gs.life.bubbles.emote(this, Assets.pick('emote_bread', 'emote_sweat'), 2);
    }
    if (box.count > 0 && box.eat(this)) {
      this.hungry = false;
      this.oreLeft = Math.max(1, Math.floor(BALANCE.food.orePerFood) || 5);
      this.state = 'seek';
      if (gs.life && gs.isOnScreen(this.x, this.y, 80)) gs.life.bubbles.emote(this, 'emote_heart', 1.4);
    }
  }

  get room() { return this.stack.max - this.stack.count - this.stack.incoming; }

  /** (v3.5) walk to (x, y): straight when near, along the roads when far (no getting stuck at a fence) */
  walkTo(x, y, dt, tol) {
    if (this._rtx !== x || this._rty !== y) {
      this._rtx = x; this._rty = y;
      this.route = this.route || [];
      if (gdist(this.x, this.y, x, y) > 360) this.gs.roads.route(this.x, this.y, x, y, this.route);
      else { this.route.length = 0; this.route.push({ x, y }); }
      this.ri = 0;
    }
    return this.gs.followRoute(this, this.speed, dt, tol);
  }

  /** the fisherman fishes the open sea with a rod, so the net's stock does not matter to him */
  nodeOk(n) { return this.type === 'fisherman' ? n.enabled : n.ready(); }

  release() {
    if (this.node) {
      if (this.node.reservedBy === this) this.node.reservedBy = null;
      if (this.node.targetedBy === this) this.node.targetedBy = null;
    }
    this.node = null;
  }

  pickNode() {
    const gs = this.gs;
    if (this.type === 'fisherman') {
      const n = gs.net;
      const off = this.index * 78;
      this.stand.x = n.fisherSpot.x - off; this.stand.y = n.fisherSpot.y + off * 0.12;
      return n;
    }
    let list;
    if (this.type === 'lumberjack') list = gs.trees;
    else if (this.type === 'farmer') list = gs.wheat;
    else if (this.type === 'miner') list = gs.rocks;
    else list = gs.animals;
    let best = null, bd = 1e12;
    for (const n of list) {
      if (!n.ready() || (n === this.avoid && this.avoidT > 0)) continue;
      if (this.type === 'hunter' ? (n.targetedBy && n.targetedBy !== this) : (n.reservedBy && n.reservedBy !== this)) continue;
      const dp = this.pile || this.station.inPad;
      const d = gdist(this.x, this.y, n.x, n.y) + (this.type === 'hunter' ? 0 : gdist(n.x, n.y, dp.x, dp.y) * 0.35);
      if (d < bd) { bd = d; best = n; }
    }
    if (!best) return null;
    if (this.type === 'hunter') best.targetedBy = this; else best.reservedBy = this;
    best.standPoint(this.x, this.y, this.stand);
    return best;
  }

  update(dt) {
    const gs = this.gs;
    if (this.avoidT > 0) this.avoidT -= dt;
    // (v3.5) the variant's art arrived after the title: swap the base look for it
    if (this.wantKey && (this.checkT -= dt) <= 0) {
      this.checkT = 1;
      if (Assets.charReady(this.wantKey)) { this.reskin(this.wantKey); this.wantKey = null; }
    }
    if (this.state === 'goto') {
      this.gotoT = (this.gotoT || 0) + dt;
      if (this.gotoT > (this.tripMax || 7) && this.node && this.type !== 'fisherman') {
        // could not reach it: try something else for a while
        this.avoid = this.node; this.avoidT = 15;
        this.release(); this.state = 'seek';
      }
    } else this.gotoT = 0;
    if (this.state === 'hungry') { this.updateHungry(dt); this.sync(dt); return; }
    switch (this.state) {
      case 'seek': {
        if (this.room <= 0) { this.state = 'deliver'; break; }
        if (this.hungry) {
          if (this.stack.count > 0) { this.state = 'deliver'; break; }
          this.release(); this.state = 'hungry'; this.emoteT = 0; break;
        }
        this.node = this.pickNode();
        // (v3.5) a far node (the forest is cut bare: trees of the new land) is reached along the roads
        if (this.node) { this.state = 'goto'; this.gotoT = 0; this.tripMax = 7 + gdist(this.x, this.y, this.stand.x, this.stand.y) / this.speed * 1.8; this._rtx = undefined; }
        else if (this.stack.count > 0) this.state = 'deliver';
        else {
          // nothing to do: wait at home
          this.waitT -= dt;
          if (gs.moveAgent(this, this.home[0], this.home[1], this.speed * 0.7, dt, 10)) {
            this.vx = this.vy = 0;
            if (this.dir !== 2) { this.dir = 2; this.play(this.animName, true); }
            this.locomotion(false);
          }
          if (this.waitT <= 0) this.waitT = 0.5;
        }
        break;
      }
      case 'goto': {
        const n = this.node;
        if (!n || !this.nodeOk(n)) { this.release(); this.state = 'seek'; break; }
        if (this.type === 'hunter') {
          // get within shooting range
          const d = gdist(this.x, this.y, n.x, n.y);
          if (d < BALANCE.workers.hunterRange) { this.vx = this.vy = 0; this.state = 'work'; this.cycles = 0; this.faceTo(n.x, n.y); this.play('work', true); break; }
          gs.moveAgent(this, n.x, n.y, this.speed, dt, 10);
          break;
        }
        if (this.walkTo(this.stand.x, this.stand.y, dt, 8)) {
          this.vx = this.vy = 0;
          this.state = 'work'; this.cycles = 0;
          if (this.type === 'fisherman') this.dir = 5;   // cast up-left into the sea (side-on reads better than from behind)
          else this.faceTo(n.x, n.y);
          this.play('work', true);
        }
        break;
      }
      case 'work': {
        const n = this.node;
        this.vx = this.vy = 0;
        if (!n || !this.nodeOk(n) || this.room <= 0 || this.hungry) {
          this.release();
          this.state = this.room <= 0 ? 'deliver' : 'seek';
          this.locomotion(false);
          break;
        }
        if (this.type === 'hunter') {
          if (gdist(this.x, this.y, n.x, n.y) > BALANCE.workers.hunterRange + 60) { this.state = 'goto'; break; }
          this.faceTo(n.x, n.y);
        }
        this.play('work');
        break;
      }
      case 'deliver': {
        const pad = this.pile ? this.pile.pad : this.station.inPad;
        if (this.stack.count + this.stack.incoming === 0) { this.state = 'seek'; break; }
        // (v3.5) safety: something stands in the way for long — hand the catch over from here
        this.deliverT = (this.deliverT || 0) + dt;
        if (this.deliverT > 14) { this.deliverT = 0; this.vx = this.vy = 0; this.state = 'drop'; this.dropT = 0.15; this.locomotion(false); break; }
        const ds = this.dropSpot(pad);
        if (this.walkTo(ds.x, ds.y, dt, 10)) {
          this.vx = this.vy = 0;
          this.state = 'drop'; this.dropT = 0.15; this.deliverT = 0;
          this.locomotion(false);
        }
        break;
      }
      case 'drop': {
        this.vx = this.vy = 0;
        this.dropT -= dt;
        if (this.dropT <= 0) {
          this.dropT = 0.14;
          if (this.stack.count === 0) {
            if (this.stack.incoming === 0) { this.state = 'seek'; this.locomotion(false); }
            break;
          }
          if (!(this.pile ? this.pile.feedFrom(this) : this.station.feedFrom(this))) {
            // pile (station input) full: wait patiently
            this.dropT = 0.6;
            this.fullT = (this.fullT || 0) + 0.6;
            // (v3.5 review) sweat only while the chief could help (nobody carries the pile on yet)
            if (this.fullT > 6 && gs.life && gs.isOnScreen(this.x, this.y, 60)) { this.fullT = 0; if (!this.pile || this.pile.needsHand()) gs.life.bubbles.emote(this, Assets.pick('emote_sweat', 'emote_dots'), 1.6); }
          } else this.fullT = 0;
        }
        this.locomotion(false);
        break;
      }
    }
    this.sync(dt);
  }

  /** (v3.5 review) where this worker stands to unload: the 1st / 2nd / 3rd of a profession each have their own spot */
  dropSpot(pad) {
    if (this._dsPad === pad && this._ds) return this._ds;
    // (v4-B, v3.5 known issue) the meat rack stands left of its pad: the hunters unload on the open right side,
    // each at his own spot (the rack's collision used to push the 2nd / 3rd onto the 1st one's spot)
    const rack = this.pile && this.pile.cfg && this.pile.cfg.prop === 'rack';
    const D = rack ? [[18, 40], [62, 18], [58, 64]] : [[10, 38], [-48, 20], [-40, 58]];
    const o = D[this.index % 3] || D[0];
    const q = { x: pad.x + o[0], y: pad.y + o[1] };
    if (this.gs.collision.blocked(q.x, q.y, 14)) this.gs.collision.resolve(q, 14);
    this._dsPad = pad; this._ds = q;
    return q;
  }

  impact() {
    if (this.state !== 'work' || !this.node) return;
    const gs = this.gs, n = this.node;
    let ip = this.impactPoint();
    if (this.type === 'fisherman') {
      // the line lands in the water, never on the snow in front of him
      ip = { x: ip.x - 10, y: Math.min(ip.y, shoreY(ip.x - 10) - 16) };
      if (gs.isOnScreen(ip.x, ip.y, 40)) gs.effects.sheet('fx_splash', ip.x, ip.y, { size: 70 });
      if (gs.ground && gs.ground.water) gs.ground.water.ripple(ip.x, ip.y, 0.8);     // (v4-C2) the line's plop rings out
      gs.effects.burst('splash', ip.x, ip.y, 3);
      gs.sfxAt('sfx_splash', this.x, this.y, { volume: 0.35, throttle: 200 });
    }
    if (this.type === 'hunter') { this.shoot(n, ip); return; }
    this.cycles++;
    if (this.cycles < (BALANCE.workers.cyclesPerItem[this.type] || 1)) return;
    this.cycles = 0;
    if (this.type === 'fisherman') {
      // a fish jumps out of the sea onto the stack (does not deplete the player's net)
      if (this.room > 0) { gs.spawnItemTo('item_fish_raw', ip.x, ip.y, this, false); gs.sfxAt('sfx_reel', this.x, this.y, { volume: 0.3, throttle: 300 }); }
      return;
    }
    if (this.hungry) return;
    const item = n.hit(this);
    if (item && this.room > 0) gs.spawnItemTo(item, ip.x, ip.y, this, false);
    if (item && this.type === 'miner' && gs.foodBox && gs.foodBox.active) {
      this.oreLeft--;
      if (this.oreLeft <= 0) {
        if (gs.foodBox.eat(this)) this.oreLeft = Math.max(1, Math.floor(BALANCE.food.orePerFood) || 5);
        else { this.hungry = true; gs.events.emit('minersHungry'); }
      }
    }
  }

  shoot(animal, ip) {
    const gs = this.gs;
    gs.sfxAt('sfx_bow', this.x, this.y, { volume: 0.6, throttle: 150 });
    const arrow = Assets.image(gs, ip.x, ip.y, 'projectile_arrow').setDepth(DEPTH.FLY);
    const sx = ip.x, sy = ip.y;
    const tgt = { x: animal.x, y: animal.y - 24 };
    const dist = Math.hypot(tgt.x - sx, tgt.y - sy);
    const dur = Math.max(160, dist * 1.4);
    let px = sx, py = sy;
    gs.tweens.addCounter({
      from: 0, to: 1, duration: dur,
      onUpdate: (tw) => {
        const p = tw.getValue();
        if (animal.ready()) { tgt.x = animal.x; tgt.y = animal.y - 24; }
        const x = sx + (tgt.x - sx) * p, y = sy + (tgt.y - sy) * p - Math.sin(p * Math.PI) * dist * 0.12;
        arrow.setPosition(x, y);
        arrow.setRotation(Math.atan2(y - py, x - px));
        px = x; py = y;
      },
      onComplete: () => {
        arrow.destroy();
        if (!animal.ready()) return;
        const item = animal.hit(this);
        if (item) {
          const cnt = animal.lastYield || 1;
          animal.lastYield = 0;
          for (let i = 0; i < cnt; i++) {
            if (this.room <= 0) break;
            gs.spawnItemTo(item, animal.x, animal.y - 20, this, false, i * 120);
          }
          this.release();
        }
      },
    });
  }
}

// ------------------------------------------------------------------ porters (v2, v3)
const PORTER_KEYS = ['npc_porter_a', 'npc_porter_b'];
// stand-ins while the porter art is missing: ordinary villagers carrying in front
const PORTER_FALLBACK = ['npc_yellow', 'npc_red', 'npc_blue', 'npc_young_man', 'villager_a', 'villager_b', 'villager_c'];

/**
 * Something that carries stacks between places along the roads (v3 base of both porters):
 * haul -> unload into a logistics sink (site, food box, workshop, shelf, warehouse), re-planning
 * when a place fills up before the stack is empty.
 */
export class Hauler extends Character {
  constructor(gs, key, x, y, cap) {
    const def = Assets.charDef(key);
    super(gs, key, x, y, { radius: 14, capacity: cap, carryScale: BALANCE.player.carryScale, carryMode: def.carryStyle === 'back' ? 'back' : 'front' });
    this.route = [];
    this.ri = 0;
    this.dropT = 0;
    this.waitT = 0;
    this.tripT = 0;
    this.dest = null;          // the sink the stack is going to
    this.resv = 0;             // items reserved there
    this.resvType = null;
    this.speed = BALANCE.workers.speed * (0.95 + Math.random() * 0.1);
    gs.agents.push(this);
  }

  get room() { return this.stack.max - this.stack.count - this.stack.incoming; }

  /** walk along the roads to (x, y) */
  go(x, y) { this.gs.roads.route(this.x, this.y, x, y, this.route); this.ri = 0; this.tripT = 0; }

  /** the art arrived after the title: swap the stand-in look for the real porter */
  checkSkin(dt) {
    if (!this.wantKey) return;
    this.checkT = (this.checkT || 1) - dt;
    if (this.checkT > 0) return;
    this.checkT = 1;
    if (Assets.charReady(this.wantKey)) {
      const gs = this.gs;
      if (PORTER_KEYS.indexOf(this.key) < 0) gs.keysInUse.delete(this.key);
      this.reskin(this.wantKey);
      this.carryMode = this.def.carryStyle === 'back' ? 'back' : 'front';
      gs.keysInUse.add(this.key);
      this.wantKey = null;
    }
  }

  setDest(sink, type) {
    const L = this.gs.logistics;
    this.clearDest();
    this.dest = sink;
    this.resvType = type;
    this.resv = this.stack.count + this.stack.incoming;
    if (L && sink) L.reserve(sink, type, this.resv);
  }

  clearDest() {
    const L = this.gs.logistics;
    if (L && this.dest && this.resv > 0) L.release(this.dest, this.resvType, this.resv);
    this.dest = null; this.resv = 0; this.resvType = null;
  }

  /** the carried type (porters carry one kind of thing per trip) */
  carriedType() { const it = this.stack.items[this.stack.items.length - 1]; return it ? it.type : (this.stack.inTypes[0] || null); }

  /** where the stack should go now (null = nowhere wants it yet) */
  planDest(exclude) {
    const L = this.gs.logistics, ty = this.carriedType();
    if (!L || !ty) return null;
    const b = L.best(ty, this.x, this.y, { exclude });
    return b ? b.sink : null;
  }

  /** where to stand to unload into `sink` (sinks may name a spot apart from their position) */
  static unloadAt(sink) { return sink.ux !== undefined ? { x: sink.ux, y: sink.uy } : { x: sink.x, y: sink.y }; }

  startHaul(sink) {
    const ty = this.carriedType();
    this.setDest(sink, ty);
    this.state = 'haul';
    const u = Hauler.unloadAt(sink);
    this.go(u.x + (this.index % 2) * 18, u.y + 4);
  }

  haul(dt) {
    const gs = this.gs;
    if (this.stack.count + this.stack.incoming === 0) { this.clearDest(); this.state = 'seek'; this.route.length = 0; return; }
    const d = this.dest;
    if (!d || !d.enabled) { this.clearDest(); const n = this.planDest(); if (n) this.startHaul(n); else { this.vx = this.vy = 0; this.locomotion(false); } return; }
    this.tripT += dt;
    if (gs.followRoute(this, this.speed, dt, 12) || this.tripT > 90) {
      const u = Hauler.unloadAt(d);
      if (this.tripT > 90) { this.x = u.x; this.y = u.y; }
      this.vx = this.vy = 0;
      this.state = 'unload'; this.dropT = 0.1; this.waitT = 0;
      this.faceTo(u.x - 20, u.y - 20);
      this.locomotion(false);
    }
  }

  unload(dt) {
    this.vx = this.vy = 0;
    this.dropT -= dt;
    if (this.dropT <= 0) {
      this.dropT = 0.14;
      if (this.stack.count === 0) {
        if (this.stack.incoming === 0) { this.clearDest(); this.state = 'seek'; this.route.length = 0; this.afterUnload(); }
      } else if (this.dest && this.dest.enabled && this.dest.feed(this)) {
        if (this.resv > 0) { this.resv--; this.gs.logistics.release(this.dest, this.resvType, 1); }
      } else {
        // this place is full: somewhere else that wants it? (otherwise wait for room)
        this.waitT += 0.6;
        const n = this.waitT > 1.1 ? this.planDest(this.dest) : null;
        if (n && n !== this.dest) this.startHaul(n);
        else this.dropT = 0.6;
      }
    }
    this.locomotion(false);
  }

  afterUnload() {}
}

export class Porter extends Hauler {
  /** which look porter number `index` gets (and the art it waits for when that is still loading) */
  static pickKey(gs, index) {
    const want = PORTER_KEYS[index % PORTER_KEYS.length];
    if (Assets.charReady(want)) return { key: want, later: null };
    const later = Assets.charPending(want) ? want : (Assets.charPending(PORTER_KEYS[(index + 1) % 2]) ? PORTER_KEYS[(index + 1) % 2] : null);
    const fb = PORTER_FALLBACK.find((k) => (Assets.charReady(k) || !Assets.m.characters[k]) && !gs.keysInUse.has(k) && gs.game.anims.exists(k + ':walk:S')) || 'villager_a';
    return { key: fb, later };
  }

  static homeFor(gs, station) {
    const pad = station.outPad;
    const o = (station.cfg && station.cfg.porterHome) || [30, 30];     // world.js stations[].porterHome: waiting spot next to the output pad
    const p = { x: pad.x + o[0], y: pad.y + o[1] };
    gs.collision.resolve(p, 14);
    return [p.x, p.y];
  }

  /** station: anything with an outPad + outStack (v1 stations, v3 workshops, the boathouse catch pad) */
  constructor(gs, station, x, y, index = 0) {
    const pk = Porter.pickKey(gs, index);
    super(gs, pk.key, x, y, BALANCE.workers.porterCapacity);
    this.wantKey = pk.later;
    this.checkT = 1;
    this.type = 'porter';
    this.role = 'porter';
    this.index = index;
    this.station = station;
    this.state = 'seek';
    this.home = Porter.homeFor(gs, station);
    this.plan = null;
    this.only = null;          // ((v4.2.1) a porter bound to one product: the 고기 통조림 짐꾼 (systems/MeatCan.js)
    gs.keysInUse.add(pk.key);
    if (pk.later) gs.keysInUse.add(pk.later);
  }

  /**
   * ((v4.2.1 고기 통조림) types this porter leaves on its pad: a porter bound to one product (`only`) looks at nothing
   * else; while the meat-can porter works, the cannery's own porters leave the meat cans to him unless meatcan.shareAt
   * or more wait there (then they help)
   */
  skips(ty) {
    if (this.only) return ty !== this.only;
    if (ty !== 'item_can_meat' || !this.station || this.station.kind !== 'cannery') return false;
    const M = this.gs.v42 && this.gs.v42.meatcan;
    if (!M || !M.goodsPorter) return false;
    return this.station.outStack.countOf(ty) < Math.max(1, Number(BALANCE.meatcan && BALANCE.meatcan.shareAt) || 12);
  }
  /** the topmost item of the pad this porter may take (null: none) */
  topType() { const out = this.station.outStack; for (let i = out.items.length - 1; i >= 0; i--) if (!this.skips(out.items[i].type)) return out.items[i].type; return null; }

  /** the best (type, sink) for what lies on the output pad right now */
  /**
   * (v4-B) items a goods porter leaves on its output for the station porters: while a founding order card (a new
   * shop) still needs `type` and a station porter is hired, up to `stationPorterFoundingMin` + 2 stay unless the
   * local shelf is nearly empty (the bots saw a 슈퍼마켓 card wait 20+ min: the can porter took every can)
   */
  keepFor(type, prio) {
    const G = this.gs.v4 && this.gs.v4.growth;
    if (!G || !G.porters || !G.porters.length || !G.foundingNeedOf || G.foundingNeedOf(type) <= 0) return 0;
    if (prio !== undefined && prio >= PRIO.SHELF_LOW) return 0;
    return Math.max(1, Math.floor(Number(BALANCE.v4 && BALANCE.v4.stationPorterFoundingMin) || 4)) + 2;
  }

  pickPlan() {
    const L = this.gs.logistics, out = this.station.outStack;
    if (!L) return null;
    let best = null;
    const seen = {};
    for (const it of out.items) {
      if (seen[it.type]) continue;
      seen[it.type] = true;
      if (this.skips(it.type)) continue;
      const b = L.best(it.type, this.x, this.y);
      if (b && out.countOf(it.type) <= this.keepFor(it.type, b.prio)) continue;
      if (b && (!best || b.prio > best.prio || (b.prio === best.prio && out.countOf(it.type) > out.countOf(best.type)))) best = { sink: b.sink, type: it.type, n: b.n, prio: b.prio };
    }
    // ((v4.2, gameplay review M5) after village complete: an output backing up (≥ surplus.outAt) that nothing in the
    //  village wants — or only the 창고, and it is past surplus.whAt — goes to the export dock (the 짐 싣는 곳: the
    //  train, then the 물류창고) with its own porter: idle porters by a full output were the late village's overflow)
    const gs = this.gs, v42 = gs.v42, SP = v42 && v42.frules && BALANCE.v42 ? BALANCE.v42.surplus : null;
    if (SP && out.count >= out.max * (Number(SP.outAt) || 0.7)) {
      const W = gs.warehouse, whFull = !W || W.total + (W.incoming || 0) >= W.cap * (Number(SP.whAt) || 0.7);
      if (!best || (best.sink.isWarehouse && whFull)) {
        const FS = v42.freight && v42.freight.sink, top = this.topType();
        const n = FS && top ? L.want(FS, top) : 0;
        if (n >= Math.min(this.stack.max, 6)) best = { sink: FS, type: top, n: Math.min(this.stack.max, n), prio: PRIO.SURPLUS };
      }
    }
    // ((v4.2.1 고기 통조림, meatcan.jamExport) the meat-can porter: with the cannery's output ≥ meatcan.farAt full and the
    //  nearest place in the village that wants meat cans farther than meatcan.farPx, this load is exported (the 짐 싣는 곳)
    const MC = BALANCE.meatcan || {};
    if (this.only && MC.jamExport !== false && v42 && v42.frules && out.count >= out.max * (Number(MC.farAt) || 0.8) && out.countOf(this.only) > 0) {
      const FS = v42.freight && v42.freight.sink, pad = this.station.outPad;
      if (FS && (!best || best.sink === FS || Math.hypot(best.sink.x - pad.x, best.sink.y - pad.y) > (Number(MC.farPx) || 1500))) {
        const n = L.want(FS, this.only);
        if (n >= Math.min(this.stack.max, 6)) best = { sink: FS, type: this.only, n: Math.min(this.stack.max, n), prio: PRIO.SURPLUS, jam: true };
      }
    }
    return best;
  }

  update(dt) {
    const gs = this.gs, out = this.station.outStack;
    this.checkSkin(dt);
    switch (this.state) {
      case 'seek':
      default: {
        if (this.stack.count > 0 && this.stack.incoming === 0) { const n = this.planDest(); if (n) { this.startHaul(n); break; } }
        if (!this.route.length || this.routeTo !== 'home') { this.go(this.home[0], this.home[1]); this.routeTo = 'home'; }
        if (gs.followRoute(this, this.speed, dt, 10)) {
          this.vx = this.vy = 0;
          this.state = 'load'; this.dropT = 0; this.waitT = 0; this.routeTo = null; this.plan = null;
          if (this.dir !== 2) { this.dir = 2; this.play(this.animName, true); }
          this.locomotion(false);
        }
        break;
      }
      case 'load': {
        this.vx = this.vy = 0;
        this.dropT -= dt;
        if (!this.station.enabled) { this.locomotion(false); break; }
        this.planT = (this.planT || 0) - dt;
        if (!this.plan && this.stack.count === 0 && this.stack.incoming === 0 && this.planT <= 0) {
          this.plan = this.pickPlan();
          this.planT = 0.5;
        }
        const pl = this.plan;
        let want = pl ? Math.min(this.stack.max, Math.max(1, pl.n)) : 0;
        // ((v4.2, gameplay review M5) after village complete a backing-up output (≥ porters.fullLoadAt) goes out as one
        //  bigger load: what ALL the village's places want of it now (shelf, pantry, food box, workshops — not the 창고),
        //  dropped place after place (Hauler.unload) — a load sized for the first place's few free spots kept the
        //  smokehouse / grill outputs full and their stations stopped)
        const FL = this.gs.v42 && this.gs.v42.frules ? Number(BALANCE.v42.porters && BALANCE.v42.porters.fullLoadAt) || 0 : 0;
        if (pl && FL > 0 && FL <= 1 && out.count >= out.max * FL && want < this.stack.max) {
          if (this.wantT === undefined || this.gs.time.now - this.wantT > 400) { this.wantT = this.gs.time.now; this.wantAll = gs.logistics.totalWant(pl.type, 40); }
          want = Math.min(this.stack.max, Math.max(want, this.wantAll || 0));
        }
        if (this.room <= 0 || (pl && this.stack.count + this.stack.incoming >= want)) { this.finishLoad(); break; }
        if (pl && out.countOf(pl.type) > (pl.keep !== undefined ? pl.keep : (pl.keep = this.keepFor(pl.type, pl.prio)))) {
          this.waitT = 0;
          if (this.dropT <= 0 && gs.moveItem(out, this.stack, pl.type, { dur: 230, height: 55 })) this.dropT = 0.14;
        } else {
          this.waitT += dt;
          // the planned item ran out: plan again (another product may be waiting)
          if (pl && this.stack.count === 0 && this.stack.incoming === 0 && this.waitT > 0.5) this.plan = null;
          // carry what we have once the output runs dry for a moment (or right away with a decent load)
          if (this.stack.count > 0 && this.stack.incoming === 0 && (this.stack.count >= 4 || this.waitT > 3)) this.finishLoad();
        }
        this.locomotion(false);
        break;
      }
      case 'haul': this.haul(dt); break;
      case 'unload': this.unload(dt); break;
    }
    this.sync(dt);
  }

  finishLoad() {
    if (this.stack.incoming > 0) return;
    const L = this.gs.logistics, ty = this.carriedType();
    const sink = (this.plan && this.plan.sink && L.want(this.plan.sink, ty) > 0) ? this.plan.sink : this.planDest();
    this.plan = null;
    if (sink) {
      // (a full load bigger than the place wants: reserve only what it wants, the rest is free for the next place)
      const w = L.want(sink, ty);
      this.startHaul(sink);
      const over = this.resv - Math.max(1, w);
      if (over > 0) { L.release(sink, ty, over); this.resv -= over; }
    } else this.waitT = 0;      // nowhere wants it yet: keep it and wait by the pad
  }
}

/**
 * (v3.5) raw porter of a production line: waits by the line's collection pile, loads what the
 * station's input can take and carries it along the roads to the input pad (생선 짐꾼: 생선 통 -> 화덕).
 */
export class RawPorter extends Hauler {
  static homeFor(gs, pile) {
    const o = (pile.cfg && pile.cfg.porterHome) || [46, 34];
    const p = { x: pile.x + o[0], y: pile.y + o[1] };
    gs.collision.resolve(p, 14);
    return [p.x, p.y];
  }

  constructor(gs, pile, station, x, y, index = 0) {
    const pk = Porter.pickKey(gs, index + 1);
    super(gs, pk.key, x, y, Math.max(1, Math.floor(Number(BALANCE.labour && BALANCE.labour.rawCapacity)) || 8));
    this.wantKey = pk.later;
    this.checkT = 1;
    this.type = 'porter';
    this.role = 'raw';
    this.index = index;
    this.pile = pile;
    this.target = station;
    this.station = null;       // (not a goods porter: nothing reads its station's output)
    this.state = 'seek';
    this.home = RawPorter.homeFor(gs, pile);
    gs.keysInUse.add(pk.key);
    if (pk.later) gs.keysInUse.add(pk.later);
  }

  get sink() { return this.target.inSink; }

  /** ((v4.2.1) how many to have in the bag before setting off (the hook MeatCanPorter overrides): what the input takes */
  loadWant(L) { const s = this.sink; return s ? Math.min(this.stack.max, L.want(s, this.pile.item)) : 0; }

  /** only its station's input (when it is full the porter waits there with the load); on a local job (v4.2.1) that
   *  place while it still wants the load */
  planDest(exclude) {
    const L = this.gs.logistics, s = this.sink, ty = this.carriedType();
    if (!L || !ty) return null;
    if (s && s !== exclude && L.want(s, ty) > 0) return s;
    const loc = this.localTo;
    return loc && loc !== exclude && loc.enabled && L.want(loc, ty) > 0 ? loc : null;
  }

  afterUnload() { this.state = 'seek'; this.localTo = null; }

  /** ((v4.2.1, docs/logistics_plan.md LD2) seconds of work its station's input holds (items × time an item) */
  workSeconds() {
    const st = this.target;
    if (!st || !st.inStack) return 0;
    const per = Math.max(0.1, Number(st.bal && st.bal.time) || 1) * (st.timeMult ? st.timeMult() : 1);
    return st.inStack.count * per;
  }

  /**
   * ((v4.2.1, LD2) a local job for a raw porter whose station is full: the nearest place within logistics.raw.localPx
   * (straight) that uses this raw — a workshop input such as the cannery's fish (later the 포장마차 / 자재창고) — never
   * the 창고, the dock or a far shop. null when there is none
   */
  localSink() {
    const gs = this.gs, L = gs.logistics, pile = this.pile, LR = (BALANCE.logistics && BALANCE.logistics.raw) || {};
    if (!L || !pile) return null;
    const far = Number(LR.localPx) || 900, ty = pile.item;
    let best = null, bp = -1, bd = Infinity;
    for (const s of L.sinks) {
      if (s === this.sink || s.isWarehouse || s.remote || s.surplus || !s.enabled) continue;
      if (L.want(s, ty) <= 0) continue;
      const pr = s.prio(ty);
      if (!(pr >= 40)) continue;
      const d = Math.hypot(s.x - pile.x, s.y - pile.y);
      if (d > far) continue;
      if (pr > bp || (pr === bp && d < bd)) { best = s; bp = pr; bd = d; }
    }
    return best;
  }

  update(dt) {
    const gs = this.gs, pile = this.pile, L = gs.logistics;
    this.checkSkin(dt);
    switch (this.state) {
      case 'seek':
      default: {
        if (this.stack.count > 0 && this.stack.incoming === 0) { const n = this.planDest(); if (n) { this.startHaul(n); break; } }
        if (!this.route.length || this.routeTo !== 'home') { this.go(this.home[0], this.home[1]); this.routeTo = 'home'; }
        if (gs.followRoute(this, this.speed, dt, 10)) {
          this.vx = this.vy = 0;
          this.state = 'load'; this.dropT = 0; this.waitT = 0; this.routeTo = null;
          this.faceTo(pile.x, pile.y);
          this.locomotion(false);
        }
        break;
      }
      case 'load': {
        this.vx = this.vy = 0;
        this.dropT -= dt;
        if (!pile.enabled || !this.target.enabled) { this.locomotion(false); break; }
        const want = this.loadWant(L);
        const have = this.stack.count + this.stack.incoming;
        const W = gs.warehouse, v42 = gs.v42, SP = (BALANCE.v42 && BALANCE.v42.surplus) || {}, LR = (BALANCE.logistics && BALANCE.logistics.raw) || {};
        let spill = null, cap = this.stack.max;
        if (!this.noSpill && !this.toWh && want <= 0 && v42 && v42.frules && pile.stack && pile.stack.max > 0) {
          const full = pile.count / pile.stack.max;
          if (LR.stayOnLine !== false) {
            // ((v4.2.1, docs/logistics_plan.md LD2) a raw porter never leaves its line for export: with its station full
            //  he waits by the pile. After logistics.raw.waitS s, with the pile ≥ raw.pileAt and the input holding
            //  ≥ raw.workS s of work (the station does not starve while he is away), he may take one local job ≤
            //  raw.localPx: a place that uses this raw (a workshop input such as the cannery's fish). The pile's surplus
            //  for export is the 창고 crew's (its raw runs come last) and the station porters' job)
            if (this.waitT > (Number(LR.waitS) || 4) && full >= (Number(LR.pileAt) || 0.85) && this.workSeconds() >= (Number(LR.workS) || 15)) {
              const loc = this.localSink();
              if (loc) { spill = loc; cap = Math.max(1, Math.min(this.stack.max, L.want(loc, pile.item))); }
            }
          } else if (this.waitT > 4 && full >= (Number(SP.pileToWh) || 0.85)) {
            // ((v4.2) the old rule, logistics.raw.stayOnLine false: this load goes to the 창고 (raw fish, while it is under
            //  surplus.whAt), else the export dock (the 짐 싣는 곳: train, then the 물류창고)
            const FS = v42.freight && v42.freight.sink;
            if (W && W.enabled && W.sink && W.accepts(pile.item) && W.room >= this.stack.max && W.total + (W.incoming || 0) < W.cap * (Number(SP.whAt) || 0.7)) spill = W.sink;
            else if (FS && L.want(FS, pile.item) >= this.stack.max) spill = FS;
          }
        }
        if (spill || this.toWh) {
          if (!this.toWh) { this.toWh = spill; this.toWhN = cap; if (!spill.isWarehouse && !spill.remote && !spill.surplus) this.localTo = spill; }
          if (have < (this.toWhN || this.stack.max) && pile.count > 0 && this.waitT < 9) { if (this.dropT <= 0 && pile.takeTo(this, this.toWhN || this.stack.max)) this.dropT = 0.14; this.waitT += dt; }
          else if (have > 0 && this.stack.incoming === 0) { const to = this.toWh; this.toWh = false; this.waitT = 0; this.startHaul(to); }
          else if (have === 0) { this.toWh = false; this.localTo = null; this.waitT = 0; }
        } else if (want > 0 && have < want && pile.count > 0) {
          this.waitT = 0;
          if (this.dropT <= 0 && pile.takeTo(this, this.stack.max)) this.dropT = 0.14;
        } else {
          this.waitT += dt;
          // a decent load, or the pile ran dry for a moment: carry what we have
          if (have > 0 && this.stack.incoming === 0 && (have >= want || have >= 4 || this.waitT > 2.5)) { const n = this.planDest(); if (n) this.startHaul(n); }
        }
        this.locomotion(false);
        break;
      }
      case 'haul': this.haul(dt); break;
      case 'unload': this.unload(dt); break;
    }
    this.sync(dt);
  }
}

/**
 * ((v4.2.1 고기 통조림, systems/MeatCan.js) 고기 짐꾼 (통조림): carries ONLY the meat rack's surplus to the cannery's meat
 * input. A load starts with the rack ≥ meatcan.pileFrom and, once started, goes on down to meatcan.pileKeep (the
 * 훈제장's share stays); never while the 훈제장's input holds less than meatcan.smokeHas of its max (the 훈제장 always
 * comes first); a bag of meatcan.porterBag; never to the dock or the 창고 (noSpill). Waits beside the rack otherwise.
 * Lives in gs.rawPorters like the line's raw porters (a reload puts his load back on the rack).
 */
export class MeatCanPorter extends RawPorter {
  /** his spot beside the meat rack (apart from the 훈제장's raw porter) */
  static homeFor(gs, pile) {
    const p = { x: pile.x - 52, y: pile.y + 40 };
    gs.collision.resolve(p, 14);
    return [p.x, p.y];
  }

  constructor(gs, pile, cannery, x, y, index = 0) {
    super(gs, pile, cannery, x, y, index);
    this.mcan = true;
    this.noSpill = true;
    this.stack.max = Math.max(1, Math.floor(Number(BALANCE.meatcan && BALANCE.meatcan.porterBag) || 12));
    this.home = MeatCanPorter.homeFor(gs, pile);
  }

  /** the cannery's input (a workshop's sink) */
  get sink() { return this.target.sink; }

  loadWant(L) {
    const gs = this.gs, C = this.target, pile = this.pile, M = BALANCE.meatcan || {};
    if (!C || !C.meatOn || !C.meatOn() || !pile.stack || pile.stack.max <= 0) return 0;
    const have = this.stack.count + this.stack.incoming, max = pile.stack.max;
    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    // the 훈제장 first: only while its input holds meatcan.smokeHas of its max (what is in the bag goes on)
    const S = gs.stations && gs.stations.smokehouse;
    const smokeOk = !S || !S.enabled || S.inStack.count + S.inStack.incoming >= S.inStack.max * num(M.smokeHas, 0.5);
    if (!smokeOk) return have;
    const w = L.want(C.sink, pile.item);
    // a new load: the rack ≥ pileFrom, and the cannery takes at least half a bag (no trips with a handful)
    if (have === 0 && (pile.count < max * num(M.pileFrom, 0.5) || w < Math.ceil(this.stack.max / 2))) return 0;
    return Math.max(have, Math.min(this.stack.max, w, have + Math.max(0, pile.count - Math.ceil(max * num(M.pileKeep, 0.3)))));
  }
}

/**
 * (v3) warehouse porter: brings overflow from nearly full outputs into the warehouse and takes
 * stored things out to whoever needs them (sites, hire pads, the food box, workshops, nearly empty shelves).
 */
export class WarehousePorter extends Hauler {
  /** ((v4.2 touch) the waiting spot of the k-th 창고 직원: two rows beside the 창고 door, on open ground) */
  static homeFor(gs, warehouse, k) {
    const op = warehouse.outPad;
    const row = [[40, 48], [-40, 52], [74, 48], [-74, 54], [40, 82], [-40, 86], [74, 82], [-74, 88], [108, 50], [-108, 56], [108, 84], [-108, 90]];
    const tries = row.slice(Math.min(k, row.length - 1)).concat(row, [[60 + k * 30, -30]]);
    // ((v4.2 final, robust review #5) not a spot another 창고 직원 already waits on: the 2nd's v3 spot (+74, +48) is
    //  row[2], so the 3rd stood inside him)
    const taken = (gs.porters || []).filter((p) => p.wh === warehouse && p.homePt).map((p) => p.homePt);
    const free = (q) => !taken.some((h) => Math.hypot(h.x - q.x, h.y - q.y) < 20);
    for (const [dx, dy] of tries) { const q = { x: op.x + dx, y: op.y + dy }; if (!gs.collision.blocked(q.x, q.y, 16) && free(q)) return q; }
    const h = { x: op.x + 40, y: op.y + 48 }; gs.collision.resolve(h, 16);
    return h;
  }

  constructor(gs, warehouse, x, y, index = 0) {
    const pk = Porter.pickKey(gs, index);
    super(gs, pk.key, x, y, Math.max(1, Math.floor(BALANCE.build.porterCapacity) || 10));
    this.wantKey = pk.later;
    this.checkT = 1;
    this.type = 'porter';
    this.role = 'porter';
    this.index = index;
    this.wh = warehouse;
    this.station = null;
    this.state = 'idle';
    this.thinkT = 0.5 + index * 0.4;
    this.job = null;
    // waiting spot by the warehouse door: beside the output pad, on open ground (a plot near the edge
    // of the land or a tree must not leave the porter standing where nobody can walk)
    const op = warehouse.outPad, k = gs.porters.filter((p) => p.wh === warehouse).length;
    let h = null;
    if (k < 2) {
      // (the two who come with the 창고: the v3 spots, unchanged)
      const tries = [[40 + k * 34, 48], [-40 - k * 34, 52], [k * 30, 78], [60 + k * 30, -30]];
      for (const [dx, dy] of tries) { const q = { x: op.x + dx, y: op.y + dy }; if (!gs.collision.blocked(q.x, q.y, 16)) { h = q; break; } }
      if (!h) { h = { x: op.x + 40, y: op.y + 48 }; gs.collision.resolve(h, 16); }
    } else h = WarehousePorter.homeFor(gs, warehouse, k);
    this.homePt = h;
    gs.keysInUse.add(pk.key);
  }

  /** what to do next: a delivery out of the warehouse, or overflow into it */
  think() {
    const gs = this.gs, L = gs.logistics, W = this.wh;
    if (!L || !W.enabled) return null;
    // 1. someone needs something the warehouse has (shelves only when nearly empty)
    const types = W.types();
    if (types.length) {
      const b = L.bestAny(types, W.outPad.x, W.outPad.y, { minPrio: 45, noStore: true });
      if (b) {
        const others = gs.porters.filter((p) => p !== this && p.job && p.job.kind === 'out' && p.job.sink === b.sink && p.job.type === b.type).length;
        if (!others) return { kind: 'out', sink: b.sink, type: b.type, n: Math.min(this.stack.max, b.n, W.count(b.type)) };
      }
    }
    // ((v4.2.1, docs/logistics_plan.md §5.4 r2 [10]) the order: 1 out (prio ≥ 45) → 2 overflow / direct → 3 the fish
    //  pile → cannery link → 4 raw runs to the dock, only when 1–3 found nothing. (v4.2 CODE-2 put a raw run of a pile
    //  full for twice surplus.pileForS before the overflow runs; logistics.raw.stayOnLine false brings that back)
    //  The link counts as step 1 while the cannery's fish input is urgent (its sink asks at prio ≥ 45, like an 'out' job):
    //  the probe saw it never run behind the overflow runs of a busy village (cannery starved 74 %)
    const urgentLink = this.linkJob(true);
    if (urgentLink) return urgentLink;
    const oldOrder = !!(BALANCE.logistics && BALANCE.logistics.raw && BALANCE.logistics.raw.stayOnLine === false);
    const raw0 = oldOrder ? this.rawJob() : null;
    if (raw0 && raw0.long) return raw0;
    // 2. an output pad filling up (no porter of its own keeping up)
    // ((v4.2, gameplay review M5) after village complete the 창고 is a buffer up to surplus.whAt (70 %): above it an
    //  output is only taken when a place wants it straight away (F3 direct); the rest waits at the station door and
    //  goes out as export (the 역 짐꾼 carry the 창고's own surplus to the dock) — it used to fill to 293 / 300)
    const v42w = gs.v42, S42 = v42w && v42w.frules && BALANCE.v42 ? BALANCE.v42.surplus : null;
    const whFull = !!S42 && W.total + (W.incoming || 0) >= W.cap * (Number(S42.whAt) || 0.7);
    if (W.room > 5) {
      const at = BALANCE.warehouse.overflowAt || 0.6;
      let best = null, bf = at;
      for (const s of gs.sources()) {
        if (!s.enabled || !s.outStack || s.outStack.max <= 0) continue;
        const f = s.outStack.count / s.outStack.max;
        if (f < at) continue;
        if (this.leaveToOwnPorter(s)) continue;
        if (whFull) { const top = s.outStack.items[s.outStack.items.length - 1]; if (!top || !L.best(top.type, s.outPad.x, s.outPad.y, { minPrio: Number(BALANCE.v42.warehouse && BALANCE.v42.warehouse.directMinPrio) || 40, noStore: true })) continue; }
        if (gs.porters.some((p) => p !== this && p.job && p.job.kind === 'in' && p.job.src === s)) continue;
        // (the fullest output first, as in the touch: a station kept running takes raw off its pile. A rule taking
        //  outputs with a direct use first was tried for v4.2.1 and left the grill blocked 54 % with its pile full)
        if (f > bf || !best) { bf = f; best = s; }
      }
      if (best) return { kind: 'in', src: best, use: this.directUse(best) };
      // ((v4.2) after village complete the 창고 is the village's buffer: a collection pile ≥ surplus.pileToWh 90 % full
      //  is carried in too (raw the station cannot take yet); above 70 % the 창고's own surplus goes to the dock)
      const v42 = gs.v42, S = v42 && v42.surplus;
      if (!best && S && v42.frules && W.room > this.stack.max && !whFull) {
        const at = Number(BALANCE.v42.surplus && BALANCE.v42.surplus.pileToWh) || 0.9;
        for (const k in gs.piles || {}) {
          const p = gs.piles[k];
          if (!p || !p.shown || !p.stack || p.stack.max <= 0) continue;
          const f = p.stack.count / p.stack.max;
          if (f < Math.max(at, bf)) continue;
          const sh = S.pileSource(p);
          // ((robust review M2) the 창고 does not store log / wheat / ore / raw meat: such a pile is only carried when
          //  its station's input wants about a load now — a porter must never stand at the 창고 with goods it refuses)
          if (!W.accepts(p.item)) { const stn = gs.stations[p.station]; const w = stn && stn.inSink && stn.enabled ? L.want(stn.inSink, p.item) : 0; if (w < Math.ceil(this.stack.max / 2)) continue; }
          if (gs.porters.some((q) => q !== this && q.job && q.job.kind === 'in' && q.job.src === sh)) continue;
          bf = f; best = sh;
        }
      }
      if (best) return { kind: 'in', src: best, use: this.directUse(best) };
    }
    // 3. ((v4.2.1, LD5) the fish pile → the cannery's input, when the cannery runs low and the pile has plenty
    const link = this.linkJob();
    if (link) return link;
    // 4. raw runs to the dock, last
    return oldOrder ? raw0 : this.rawJob();
  }

  /** ((v4.2.1, LD4) will an overflow run from `src` go straight to a place that uses it (prio ≥ warehouse.crew.useFrom)? */
  directUse(src) {
    const L = this.gs.logistics, out = src && src.outStack;
    const top = out && out.items[out.items.length - 1];
    if (!L || !top) return false;
    const v42 = this.gs.v42, WD = BALANCE.v42 && BALANCE.v42.warehouse;
    if (!(v42 && v42.frules && WD && WD.direct)) return false;
    const from = Number(BALANCE.warehouse.crew && BALANCE.warehouse.crew.useFrom) || 40;
    return !!L.best(top.type, src.outPad.x, src.outPad.y, { minPrio: Math.max(from, Number(WD.directMinPrio) || 40), noStore: true });
  }

  /**
   * ((v4.2.1, docs/logistics_plan.md LD5) the fish pile → the cannery link: when the cannery's fish input is under
   * logistics.link.canneryBelow full and the fish pile is over link.fishPileAt, a 창고 직원 carries a load of fish from
   * the pile to the cannery's input (one of them at a time). Nobody else linked the two: the cannery starved beside a
   * full pile. { kind: 'link', src: the pile shim, type, sink: the cannery's input, n } or null
   */
  linkJob(urgentOnly) {
    const gs = this.gs, L = gs.logistics, LK = (BALANCE.logistics && BALANCE.logistics.link) || {};
    const v42 = gs.v42, S = v42 && v42.surplus;
    if (!L || !S || !v42.frules || LK.fishToCannery === false) return null;
    const pile = gs.piles && gs.piles.fish;
    if (!pile || !pile.shown || !pile.stack || pile.stack.max <= 0) return null;
    if (pile.count < pile.stack.max * (Number(LK.fishPileAt) || 0.6)) return null;
    const C = (gs.workshops || []).find((w) => w.kind === 'cannery' && w.enabled && w.sink);
    if (!C) return null;
    const max = Math.max(1, Number(C.bal && C.bal.inputMax) || 18);
    if (C.fishUnits(true) >= max * (Number(LK.canneryBelow) || 0.5)) return null;
    // (not while its cans have nowhere to go: fish carried to a cannery standing full of cans only waits there)
    if (C.outStack && C.outStack.max > 0 && C.outStack.count >= C.outStack.max) return null;
    const ty = pile.item, pr = C.sink.prio(ty), urgent = pr >= PRIO.SHELF_LOW;
    if (urgentOnly && !urgent) return null;
    // (one of them at a time; two while the cannery is about to stop)
    const on = gs.porters.filter((p) => p !== this && p.job && p.job.kind === 'link').length;
    if (on >= (urgent ? 2 : 1)) return null;
    const keep = Math.ceil(pile.stack.max * 0.25);
    const n = Math.min(this.stack.max, L.want(C.sink, ty), pile.count - keep);
    if (n < Math.min(4, this.stack.max)) return null;
    return { kind: 'link', src: S.pileSource(pile), type: ty, sink: C.sink, n, use: true };
  }

  /**
   * ((v4.2 integration: the 잡화점 fix's forge runs × the touch's growing 창고 crew) the forge's pad is left to its own
   * 도구 짐꾼 while the next tool still fits. For the 잡화점 the forge makes runs of one kind (Workshop.pickTool) so that
   * its porter — one kind a trip — leaves with a full load; a 창고 직원 taking part of the run at overflowAt (60 %) halved
   * those loads (46-min save, 8 game min: 9.0 → 4.8 tools a trip, the shop 557 → 463 coins a minute; with this rule
   * 9.1 a trip, 593 a minute). A forge about to stop for room, or one without a porter of its own, is taken as before.
   */
  leaveToOwnPorter(s) {
    const R = s.recipe;
    if (!R || R.out !== 'tool') return false;
    if (s.outStack.count + (s.outStack.incoming || 0) + (R.outN || 1) > s.outStack.max) return false;
    return (this.gs.porters || []).some((p) => p.station === s && p.role === 'porter');
  }

  /** ((v4.2 CODE-2) a raw export run: { kind: 'raw', src: pile shim, type, sink: the dock, n, long } or null */
  rawJob() {
    const gs = this.gs, L = gs.logistics, v42 = gs.v42, S = v42 && v42.surplus, SP = BALANCE.v42 && BALANCE.v42.surplus;
    const FS = v42 && v42.freight && v42.freight.sink;
    if (!L || !S || !S.on || !FS || !SP || SP.whRaw === false) return null;
    const minLoad = Math.max(1, Math.min(this.stack.max, Math.floor(Number(SP.rawMinLoad) || 6)));
    const forS = Number(SP.pileForS) || 20;
    let best = null;
    for (const q of S.list()) {
      if (!q.src.pile || q.n < minLoad) continue;
      if (gs.porters.some((p) => p !== this && p.job && p.job.src === q.src)) continue;
      const room = L.want(FS, q.type);
      if (room < minLoad) continue;
      const n = Math.min(this.stack.max, q.n, room);
      const over = S.overT.get(q.src.pile) || 0;
      if (!best || over > best.over) best = { kind: 'raw', src: q.src, type: q.type, sink: FS, n, over, long: over >= forS * 2 };
    }
    return best;
  }

  update(dt) {
    const gs = this.gs, W = this.wh;
    this.checkSkin(dt);
    switch (this.state) {
      case 'arrive': {
        // ((v4.2 touch) a new 창고 직원 walks in along the roads from the edge of the village)
        this.arriveT = (this.arriveT || 0) + dt;
        const there = gs.followRoute(this, this.speed, dt, 14);
        // (lost on the way for 3 minutes: he turns up at the 창고 — never a walk straight across the map)
        if (!there && this.arriveT > 180 && Math.hypot(this.x - this.homePt.x, this.y - this.homePt.y) > 400) { this.x = this.homePt.x; this.y = this.homePt.y; }
        if (there || this.arriveT > 180) { this.state = 'idle'; this.thinkT = 0.3; this.vx = this.vy = 0; }
        break;
      }
      case 'idle': {
        this.thinkT -= dt;
        // ((v4.2.1) how long he has stood without a job: WarehouseCrew's need gate counts a member free only after a moment)
        this.idleT = this.job ? 0 : (this.idleT || 0) + dt;
        if (this.thinkT <= 0) {
          this.thinkT = 0.6;
          const j = this.think();
          if (j) {
            this.job = j; this.idleT = 0;
            if (j.kind === 'out') { this.state = 'toWh'; this.go(W.outPad.x + 20, W.outPad.y + 22); L_reserve(gs, j.sink, j.type, j.n); this.jobResv = j.n; }
            else { if (j.kind === 'raw' || j.kind === 'link') { L_reserve(gs, j.sink, j.type, j.n); this.jobResv = j.n; } this.state = 'toSrc'; this.go(j.src.outPad.x + 24, j.src.outPad.y + 20); }
            break;
          }
        }
        if (gs.moveAgent(this, this.homePt.x, this.homePt.y, this.speed * 0.6, dt, 10)) { this.vx = this.vy = 0; this.locomotion(false); }
        break;
      }
      case 'toWh': {
        if (gs.followRoute(this, this.speed, dt, 12)) { this.vx = this.vy = 0; this.state = 'take'; this.dropT = 0.1; this.locomotion(false); }
        break;
      }
      case 'take': {
        this.vx = this.vy = 0;
        this.dropT -= dt;
        const j = this.job;
        if (this.dropT <= 0) {
          this.dropT = 0.14;
          const got = this.stack.count + this.stack.incoming;
          if (got < j.n && W.count(j.type) > 0 && this.room > 0) W.giveTo(this, j.type);
          else if (this.stack.incoming === 0) {
            L_release(gs, j.sink, j.type, this.jobResv); this.jobResv = 0;
            if (this.stack.count > 0) { const ok = gs.logistics.want(j.sink, j.type) > 0 ? j.sink : this.planDest(); if (ok) this.startHaul(ok); else this.startHaul(W.sink); }
            else { this.job = null; this.state = 'idle'; }
          }
        }
        this.locomotion(false);
        break;
      }
      case 'toSrc': {
        const src = this.job.src;
        if (!src.enabled) { this.dropRaw(); this.job = null; this.state = 'idle'; break; }
        if (gs.followRoute(this, this.speed, dt, 12)) { this.vx = this.vy = 0; this.state = 'grab'; this.dropT = 0.1; this.waitT = 0; this.locomotion(false); }
        break;
      }
      case 'grab': {
        this.vx = this.vy = 0;
        this.dropT -= dt;
        const j = this.job, out = j && j.src && j.src.outStack;
        // ((v4.2 touch) a job whose source has no output stack (seen once in a 60-min census with the bigger crew):
        //  drop it instead of throwing — a throw here skipped the rest of that frame's village update)
        if (!out) { this.dropRaw(); if (this.stack.count > 0) this.startHaul(this.planDest() || W.sink); else { this.job = null; this.state = 'idle'; } break; }
        if (this.dropT <= 0) {
          this.dropT = 0.14;
          const ty = this.carriedType() || (j.type || (out.items.length ? out.items[out.items.length - 1].type : null));
          // ((v4.2 CODE-2) a raw run takes only what the Surplus rules let go (the pile keeps surplus.pileKeep))
          let lim = this.stack.max;
          if (j.kind === 'raw') { const S = gs.v42 && gs.v42.surplus, have = this.stack.count + this.stack.incoming; lim = Math.min(lim, have + (S ? S.amount(j.src, ty) : 0)); }
          // ((v4.2.1) the link takes what the cannery asked for, and leaves a quarter of the pile for its own line)
          else if (j.kind === 'link') { const keep = Math.ceil(out.max * 0.25); lim = Math.min(lim, j.n, this.stack.count + this.stack.incoming + Math.max(0, out.count - keep)); }
          if (this.room > 0 && ty && out.countOf(ty) > 0 && this.stack.count + this.stack.incoming < lim) gs.moveItem(out, this.stack, ty, { dur: 230, height: 55 });
          else if (this.stack.incoming === 0 && (j.kind === 'raw' || j.kind === 'link')) {
            this.dropRaw();
            if (this.stack.count > 0) { const n = gs.logistics.want(j.sink, this.carriedType()) > 0 ? j.sink : this.planDest(); this.startHaul(n || j.sink); }
            else { this.job = null; this.state = 'idle'; }
          } else if (this.stack.incoming === 0) {
            if (this.stack.count > 0) {
              // (raw the 창고 refuses goes to its station's input and waits there for room)
              const n = this.planDest(), ty2 = this.carriedType(), stn = !n && !W.accepts(ty2) ? gs.stationByInput[ty2] : null;
              this.startHaul(n || (stn && stn.inSink) || W.sink);
            } else { this.job = null; this.state = 'idle'; }
          }
        }
        this.locomotion(false);
        break;
      }
      case 'haul': this.haul(dt); break;
      case 'unload': this.unload(dt); break;
      default: this.state = 'idle';
    }
    this.sync(dt);
  }

  /** overflow (an 'in' job) goes into the warehouse, unless somewhere needs most of the load now (a site,
   *  a workshop, the food box, a nearly empty shelf); the warehouse hands it out again when shelves run low */
  planDest(exclude) {
    const L = this.gs.logistics, W = this.wh, ty = this.carriedType();
    // ((v4.2.1) the fish link: the cannery while it wants fish, else any place that uses it, else the 창고)
    if (this.job && this.job.kind === 'link' && L && ty) {
      const C = this.job.sink;
      if (C && C !== exclude && C.enabled && L.want(C, ty) > 0) return C;
      const b = L.best(ty, this.x, this.y, { exclude, minPrio: 40, noStore: true });
      if (b) return b.sink;
      if (W.sink !== exclude && L.want(W.sink, ty) > 0) return W.sink;
      return super.planDest(exclude);
    }
    // ((v4.2 CODE-2) a raw run: the dock; while it is full, any local place that wants it, else the line's station input)
    if (this.job && this.job.kind === 'raw' && L && ty) {
      const FS = this.job.sink;
      if (FS && FS !== exclude && L.want(FS, ty) > 0) return FS;
      const loc = super.planDest(exclude);
      if (loc) return loc;
      const stn = this.gs.stationByInput && this.gs.stationByInput[ty];
      return stn && stn.inSink && stn.inSink !== exclude ? stn.inSink : null;
    }
    if (!this.job || this.job.kind !== 'in' || !L || !ty) return super.planDest(exclude);
    // ((v4.2 F3) after village complete: straight to any shelf that wants it (prio ≥ warehouse.directMinPrio 40);
    //  the 창고 keeps only what nobody wants)
    const v42 = this.gs.v42, WD = BALANCE.v42 && BALANCE.v42.warehouse;
    const direct = !!(v42 && v42.frules && WD && WD.direct);
    const b = L.best(ty, this.x, this.y, { exclude, minPrio: direct ? (Number(WD.directMinPrio) || 40) : PRIO.SHELF_LOW, noStore: true });
    if (b && b.n >= Math.min(this.stack.count, direct ? 1 : 4)) return b.sink;
    if (W.sink !== exclude && L.want(W.sink, ty) > 0) return W.sink;
    return super.planDest(exclude);
  }

  afterUnload() { this.job = null; this.state = 'idle'; this.thinkT = 0.2; }

  /** a raw run's reservation at the dock ends when the load leaves the pile (startHaul reserves what it carries) */
  dropRaw() { if (this.job && (this.job.kind === 'raw' || this.job.kind === 'link') && this.jobResv) { L_release(this.gs, this.job.sink, this.job.type, this.jobResv); this.jobResv = 0; } }

  /** ((v4.2.1, LD4) is this crew member on a real-use job now (the place it carries to has prio ≥ warehouse.crew.useFrom)? */
  onUseJob() {
    const j = this.job;
    if (!j || this.state === 'arrive') return false;
    if (j.kind === 'raw') return false;
    if (j.kind === 'out' || j.kind === 'link') return true;
    const d = this.dest, ty = this.carriedType();
    if (d && ty && d.prio) return d.prio(ty) >= (Number(BALANCE.warehouse.crew && BALANCE.warehouse.crew.useFrom) || 40);
    return !!j.use;
  }
}

function L_reserve(gs, sink, type, n) { if (gs.logistics) gs.logistics.reserve(sink, type, n); }
function L_release(gs, sink, type, n) { if (gs.logistics && n > 0) gs.logistics.release(sink, type, n); }

/**
 * (v4-B, docs/v4_plan.md §8.5) 역 짐꾼, a station porter: waits on the station square and carries surplus to the
 * station district's remote sinks (the loading dock, the founded shops' shelves, the carpenter's house sites).
 * Sources: what the warehouse holds, and any station / workshop output that is at least `warehouse.overflowAt`
 * full — so it only ever takes surplus and never starves the plaza. Regular porters never walk there.
 */
export class StationPorter extends Hauler {
  constructor(gs, growth, x, y, index = 0, home = null) {
    const pk = Porter.pickKey(gs, index);
    super(gs, pk.key, x, y, Math.max(1, Math.floor(BALANCE.v4 && BALANCE.v4.stationPorterCapacity) || 12));
    this.wantKey = pk.later;
    this.checkT = 1;
    this.type = 'porter';
    this.role = 'stationPorter';
    this.index = index;
    this.growth = growth;
    this.station = null;
    this.wh = null;
    this.state = 'idle';
    this.thinkT = 0.6 + (index % 3) * 0.3;
    this.job = null;
    this.homePt = home || { x, y };
    gs.keysInUse.add(pk.key);
    if (pk.later) gs.keysInUse.add(pk.later);
  }

  /** the next surplus run: { src (a source or the warehouse), type, sink, n } or null */
  think() {
    const gs = this.gs, L = gs.logistics;
    if (!L) return null;
    let best = null;
    const others = gs.porters.filter((p) => p !== this && p.role === 'stationPorter' && p.job);
    const S = gs.v42 && gs.v42.surplus;
    const consider = (src, ty, have, ox, oy) => {
      if (have <= 0) return;
      const b = L.best(ty, ox, oy, { onlyRemote: true });
      if (!b || b.n <= 0) return;
      // ((v4.2) the dock's surplus sink takes only what the Surplus rules say the village cannot use)
      if (b.sink.surplus) { have = Math.min(have, S ? S.amount(src, ty) : 0); if (have <= 0) return; }
      if (others.some((p) => p.job.sink === b.sink && p.job.type === ty)) return;
      const n = Math.min(this.stack.max, b.n, have);
      // ((v4.2) a full collection pile's raw ranks at surplus.pilePrio (CODE-2: 33 — over the 정기 납품 wholesale run 30, under
      //  the shops 35 and the founding cards 38)
      //  — and so does the raw the 창고 buffered from the piles once the 창고 is past surplus.whAt
      const rawWh = src === gs.warehouse && /^item_(fish_raw|fish_big|log|wheat|ore|meat_raw)$/.test(ty);
      const pr = (src.pile || rawWh) && b.sink.surplus ? Math.max(b.prio, Number(BALANCE.v42.surplus && BALANCE.v42.surplus.pilePrio) || 30) : b.prio;
      if (!best || pr > best.prio || (pr === best.prio && n > best.n)) best = { src, type: ty, sink: b.sink, n, prio: pr };
    };
    const W = gs.warehouse;
    if (W && W.enabled) for (const ty of W.types()) consider(W, ty, W.count(ty), W.outPad.x, W.outPad.y);
    const over = (BALANCE.warehouse && BALANCE.warehouse.overflowAt) || 0.6;
    // (v4-B bots: a 슈퍼마켓 card waited 10+ min for cans the general store's porter always took first) what a
    // founding card still needs is taken from a station / workshop output once a few are there, not only the
    // overflow; the 정기 납품 cards keep to the surplus
    const G = this.growth, early = Math.max(1, Math.floor(Number(BALANCE.v4 && BALANCE.v4.stationPorterFoundingMin) || 4));
    for (const s of gs.sources()) {
      if (!s.enabled || !s.outStack || s.outStack.max <= 0) continue;
      const surplus = s.outStack.count / s.outStack.max >= over;
      const seen = {};
      for (const it of s.outStack.items) {
        if (seen[it.type]) continue; seen[it.type] = true;
        const have = s.outStack.countOf(it.type);
        // ((v4 review) a card that needs fewer than `early` (the 철물점's one axe / one pickaxe) is taken at once)
        const fn = G && G.foundingNeedOf ? G.foundingNeedOf(it.type) : 0;
        if (surplus || (fn > 0 && have >= Math.min(early, fn))) consider(s, it.type, have, s.outPad.x, s.outPad.y);
      }
    }
    // ((v4.2) a collection pile full for a long while: its surplus raw goes to the dock too)
    if (S) for (const q of S.list()) if (q.src.pile) consider(q.src, q.type, q.n, q.x, q.y);
    return best;
  }

  /** only the remote sinks */
  planDest(exclude) {
    const L = this.gs.logistics, ty = this.carriedType();
    if (!L || !ty) return null;
    const b = L.best(ty, this.x, this.y, { exclude, onlyRemote: true });
    return b ? b.sink : null;
  }

  afterUnload() { this.job = null; this.state = 'idle'; this.thinkT = 0.3; this.strandT = 0; }

  /**
   * (v4 review M6) goods nobody at the station wants any more (the chief finished the card himself): after a few
   * seconds they go wherever the village takes them (the warehouse, a shelf, a workshop); with no place at all
   * they ride the next train at the wholesale price — the porter never stands frozen with a full load
   */
  stranded(dt) {
    this.strandT = (this.strandT || 0) + dt;
    if (this.strandT < 4 || this.stack.count <= 0 || this.stack.incoming > 0) return false;
    const L = this.gs.logistics, ty = this.carriedType();
    const b = L && ty ? L.best(ty, this.x, this.y, { remote: true, exclude: this.state === 'unload' ? this.dest : null }) : null;
    if (b && b.sink !== this.dest) { this.strandT = 0; this.startHaul(b.sink); return true; }
    if (this.strandT < 20) return false;
    const G = this.growth, gs = this.gs;
    while (this.stack.count > 0) {
      const it = this.stack.pop();
      if (!it) break;
      if (G && G.payWholesale) G.payWholesale(it.type, 1, this.x, this.y - 60);
      gs.effects.releaseItem(it.spr);
    }
    this.clearDest();
    this.afterUnload();
    return true;
  }

  unload(dt) {
    super.unload(dt);
    if (this.state !== 'unload') { this.strandT = 0; return; }
    const ty = this.carriedType(), d = this.dest;
    if (d && d.enabled && this.stack.count > 0 && d.accepts(ty) && (d.fullRoom ? d.fullRoom(ty) : d.room(ty)) > 0) { this.strandT = 0; return; }
    this.stranded(dt);
  }

  update(dt) {
    const gs = this.gs;
    this.checkSkin(dt);
    switch (this.state) {
      case 'idle': {
        if (this.stack.count > 0 && this.stack.incoming === 0) { const n = this.planDest(); if (n) { this.startHaul(n); break; } if (this.stranded(dt)) break; } else this.strandT = 0;
        this.thinkT -= dt;
        if (this.thinkT <= 0) {
          this.thinkT = 0.8;
          const j = this.think();
          if (j) {
            this.job = j;
            gs.logistics.reserve(j.sink, j.type, j.n); this.jobResv = j.n;
            const op = j.src.outPad;
            this.state = 'toSrc';
            this.go(op.x + 22, op.y + 20);
            break;
          }
        }
        if (gs.moveAgent(this, this.homePt.x, this.homePt.y, this.speed * 0.6, dt, 10)) { this.vx = this.vy = 0; this.locomotion(false); }
        break;
      }
      case 'toSrc': {
        const src = this.job.src;
        this.tripT += dt;
        if (!src.enabled || this.tripT > 120) { this.dropJob(); break; }
        if (gs.followRoute(this, this.speed, dt, 12)) { this.vx = this.vy = 0; this.state = 'grab'; this.dropT = 0.1; this.waitT = 0; this.locomotion(false); }
        break;
      }
      case 'grab': {
        this.vx = this.vy = 0;
        this.dropT -= dt;
        const j = this.job;
        if (this.dropT <= 0) {
          this.dropT = 0.14;
          const have = this.stack.count + this.stack.incoming;
          const W = gs.warehouse;
          let took = false;
          // ((v4 review) what came out since the job was planned is taken too, up to what the sink still wants)
          let lim = Math.min(this.stack.max, j.n + Math.max(0, gs.logistics.want(j.sink, j.type)));
          // ((v4.2) surplus: never more than the Surplus rules let go (a pile keeps 20, an output 30 %))
          if (j.sink.surplus) { const S = gs.v42 && gs.v42.surplus; lim = Math.min(lim, have + (S ? S.amount(j.src, j.type) : 0)); }
          if (have < lim && this.room > 0) {
            if (W && j.src === W) took = W.count(j.type) > 0 && W.giveTo(this, j.type);
            else if (j.src.outStack && j.src.outStack.countOf(j.type) > 0) took = gs.moveItem(j.src.outStack, this.stack, j.type, { dur: 230, height: 55 });
          }
          // ((v4 review) a founding card's goods trickle out of a workshop the shelves' porters also empty: wait a
          //  few seconds at the door for the next one instead of walking back with nothing)
          if (!took && this.stack.incoming === 0 && have < lim && this.waitT < 8 && j.src !== W && this.growth && this.growth.foundingNeedOf(j.type) > 0 && j.src.enabled) { this.waitT += 0.14; this.locomotion(false); break; }
          if (!took && this.stack.incoming === 0) {
            gs.logistics.release(j.sink, j.type, this.jobResv || 0); this.jobResv = 0;
            if (this.stack.count > 0) { const ok = gs.logistics.want(j.sink, j.type) > 0 ? j.sink : this.planDest(); if (ok) this.startHaul(ok); else { this.state = 'idle'; } }
            else this.dropJob();
          }
        }
        this.locomotion(false);
        break;
      }
      case 'haul': this.haul(dt); break;
      case 'unload': this.unload(dt); break;
      default: this.state = 'idle';
    }
    this.sync(dt);
  }

  dropJob() {
    if (this.job && this.jobResv) this.gs.logistics.release(this.job.sink, this.job.type, this.jobResv);
    this.jobResv = 0;
    this.job = null;
    this.state = 'idle';
    this.thinkT = 1;
  }
}
