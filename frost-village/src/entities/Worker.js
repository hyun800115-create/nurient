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
    const D = [[10, 38], [-48, 20], [-40, 58]];
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
    gs.keysInUse.add(pk.key);
    if (pk.later) gs.keysInUse.add(pk.later);
  }

  /** the best (type, sink) for what lies on the output pad right now */
  pickPlan() {
    const L = this.gs.logistics, out = this.station.outStack;
    if (!L) return null;
    let best = null;
    const seen = {};
    for (const it of out.items) {
      if (seen[it.type]) continue;
      seen[it.type] = true;
      const b = L.best(it.type, this.x, this.y);
      if (b && (!best || b.prio > best.prio || (b.prio === best.prio && out.countOf(it.type) > out.countOf(best.type)))) best = { sink: b.sink, type: it.type, n: b.n, prio: b.prio };
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
        const want = pl ? Math.min(this.stack.max, Math.max(1, pl.n)) : 0;
        if (this.room <= 0 || (pl && this.stack.count + this.stack.incoming >= want)) { this.finishLoad(); break; }
        if (pl && out.countOf(pl.type) > 0) {
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
    const sink = (this.plan && this.plan.sink && this.gs.logistics.want(this.plan.sink, this.carriedType()) > 0) ? this.plan.sink : this.planDest();
    this.plan = null;
    if (sink) this.startHaul(sink);
    else this.waitT = 0;      // nowhere wants it yet: keep it and wait by the pad
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

  /** only its station's input (when it is full the porter waits there with the load) */
  planDest() { const s = this.sink, ty = this.carriedType(); return s && ty && this.gs.logistics.want(s, ty) > 0 ? s : null; }

  afterUnload() { this.state = 'seek'; }

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
        const sink = this.sink;
        const want = sink ? Math.min(this.stack.max, L.want(sink, pile.item)) : 0;
        const have = this.stack.count + this.stack.incoming;
        if (want > 0 && have < want && pile.count > 0) {
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
 * (v3) warehouse porter: brings overflow from nearly full outputs into the warehouse and takes
 * stored things out to whoever needs them (sites, hire pads, the food box, workshops, nearly empty shelves).
 */
export class WarehousePorter extends Hauler {
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
    const tries = [[40 + k * 34, 48], [-40 - k * 34, 52], [k * 30, 78], [60 + k * 30, -30]];
    let h = null;
    for (const [dx, dy] of tries) { const q = { x: op.x + dx, y: op.y + dy }; if (!gs.collision.blocked(q.x, q.y, 16)) { h = q; break; } }
    if (!h) { h = { x: op.x + 40, y: op.y + 48 }; gs.collision.resolve(h, 16); }
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
    // 2. an output pad filling up (no porter of its own keeping up)
    if (W.room > 5) {
      let best = null, bf = BALANCE.warehouse.overflowAt || 0.6;
      for (const s of gs.sources()) {
        if (!s.enabled || !s.outStack || s.outStack.max <= 0) continue;
        const f = s.outStack.count / s.outStack.max;
        if (f < bf) continue;
        if (gs.porters.some((p) => p !== this && p.job && p.job.kind === 'in' && p.job.src === s)) continue;
        bf = f; best = s;
      }
      if (best) return { kind: 'in', src: best };
    }
    return null;
  }

  update(dt) {
    const gs = this.gs, W = this.wh;
    this.checkSkin(dt);
    switch (this.state) {
      case 'idle': {
        this.thinkT -= dt;
        if (this.thinkT <= 0) {
          this.thinkT = 0.6;
          const j = this.think();
          if (j) {
            this.job = j;
            if (j.kind === 'out') { this.state = 'toWh'; this.go(W.outPad.x + 20, W.outPad.y + 22); L_reserve(gs, j.sink, j.type, j.n); this.jobResv = j.n; }
            else { this.state = 'toSrc'; this.go(j.src.outPad.x + 24, j.src.outPad.y + 20); }
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
        if (!src.enabled) { this.job = null; this.state = 'idle'; break; }
        if (gs.followRoute(this, this.speed, dt, 12)) { this.vx = this.vy = 0; this.state = 'grab'; this.dropT = 0.1; this.waitT = 0; this.locomotion(false); }
        break;
      }
      case 'grab': {
        this.vx = this.vy = 0;
        this.dropT -= dt;
        const out = this.job.src.outStack;
        if (this.dropT <= 0) {
          this.dropT = 0.14;
          const ty = this.carriedType() || (out.items.length ? out.items[out.items.length - 1].type : null);
          if (this.room > 0 && ty && out.countOf(ty) > 0) gs.moveItem(out, this.stack, ty, { dur: 230, height: 55 });
          else if (this.stack.incoming === 0) {
            if (this.stack.count > 0) { const n = this.planDest(); this.startHaul(n || W.sink); }
            else { this.job = null; this.state = 'idle'; }
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
    if (!this.job || this.job.kind !== 'in' || !L || !ty) return super.planDest(exclude);
    const b = L.best(ty, this.x, this.y, { exclude, minPrio: PRIO.SHELF_LOW, noStore: true });
    if (b && b.n >= Math.min(this.stack.count, 4)) return b.sink;
    if (W.sink !== exclude && L.want(W.sink, ty) > 0) return W.sink;
    return super.planDest(exclude);
  }

  afterUnload() { this.job = null; this.state = 'idle'; this.thinkT = 0.2; }
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
    const consider = (src, ty, have, ox, oy) => {
      if (have <= 0) return;
      const b = L.best(ty, ox, oy, { onlyRemote: true });
      if (!b || b.n <= 0) return;
      if (others.some((p) => p.job.sink === b.sink && p.job.type === ty)) return;
      const n = Math.min(this.stack.max, b.n, have);
      if (!best || b.prio > best.prio || (b.prio === best.prio && n > best.n)) best = { src, type: ty, sink: b.sink, n, prio: b.prio };
    };
    const W = gs.warehouse;
    if (W && W.enabled) for (const ty of W.types()) consider(W, ty, W.count(ty), W.outPad.x, W.outPad.y);
    const over = (BALANCE.warehouse && BALANCE.warehouse.overflowAt) || 0.6;
    for (const s of gs.sources()) {
      if (!s.enabled || !s.outStack || s.outStack.max <= 0 || s.outStack.count / s.outStack.max < over) continue;
      const seen = {};
      for (const it of s.outStack.items) { if (seen[it.type]) continue; seen[it.type] = true; consider(s, it.type, s.outStack.countOf(it.type), s.outPad.x, s.outPad.y); }
    }
    return best;
  }

  /** only the remote sinks */
  planDest(exclude) {
    const L = this.gs.logistics, ty = this.carriedType();
    if (!L || !ty) return null;
    const b = L.best(ty, this.x, this.y, { exclude, onlyRemote: true });
    return b ? b.sink : null;
  }

  afterUnload() { this.job = null; this.state = 'idle'; this.thinkT = 0.3; }

  update(dt) {
    const gs = this.gs;
    this.checkSkin(dt);
    switch (this.state) {
      case 'idle': {
        if (this.stack.count > 0 && this.stack.incoming === 0) { const n = this.planDest(); if (n) { this.startHaul(n); break; } }
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
          if (have < j.n && this.room > 0) {
            if (W && j.src === W) took = W.count(j.type) > 0 && W.giveTo(this, j.type);
            else if (j.src.outStack && j.src.outStack.countOf(j.type) > 0) took = gs.moveItem(j.src.outStack, this.stack, j.type, { dur: 230, height: 55 });
          }
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
