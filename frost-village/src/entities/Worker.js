// Hired workers: go to a resource -> play the job's work anim -> carry a stack -> walk to the
// station's input pad -> drop items one by one -> repeat. The hunter shoots arrows.
// Porters (v2, one per production line) pick up the station's products at its output pad and carry
// them along the roads to the counter / trade post (stack on the back for A-frame porters).

import { Character } from './Character.js';
import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { BALANCE } from '../data/balance.js';
import { gdist } from '../core/Iso.js';
import { DEPTH } from '../systems/DepthSort.js';
import { shoreY } from '../systems/Collision.js';

const STATION_OF = { fisherman: 'grill', lumberjack: 'sawmill', farmer: 'bakery', miner: 'smelter', hunter: 'smokehouse' };
const FOOD_OUT = ['item_fish_cooked', 'item_bread', 'item_meat_cooked'];

export class Worker extends Character {
  /** where a worker waits when there is nothing to do */
  static homeFor(gs, type, index) {
    return gs.workerHome(type, index);
  }

  constructor(gs, type, x, y, index = 0, role = 'worker') {
    super(gs, type, x, y, { radius: 14, capacity: BALANCE.workers.capacity, carryScale: BALANCE.player.carryScale });
    this.type = type;
    this.role = role;
    this.index = index;
    this.station = gs.stations[STATION_OF[type]];
    this.state = 'seek';
    this.node = null;
    this.cycles = 0;
    this.waitT = 0;
    this.dropT = 0;
    this.speed = BALANCE.workers.speed * (0.95 + Math.random() * 0.1);
    this.stand = { x: 0, y: 0 };
    this.onImpact = () => this.impact();
    this.home = Worker.homeFor(gs, type, index);
    gs.agents.push(this);
  }

  get room() { return this.stack.max - this.stack.count - this.stack.incoming; }

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
      const d = gdist(this.x, this.y, n.x, n.y) + (this.type === 'hunter' ? 0 : gdist(n.x, n.y, this.station.inPad.x, this.station.inPad.y) * 0.35);
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
    if (this.state === 'goto') {
      this.gotoT = (this.gotoT || 0) + dt;
      if (this.gotoT > 7 && this.node && this.type !== 'fisherman') {
        // could not reach it: try something else for a while
        this.avoid = this.node; this.avoidT = 15;
        this.release(); this.state = 'seek';
      }
    } else this.gotoT = 0;
    switch (this.state) {
      case 'seek': {
        if (this.room <= 0) { this.state = 'deliver'; break; }
        this.node = this.pickNode();
        if (this.node) { this.state = 'goto'; }
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
        if (gs.moveAgent(this, this.stand.x, this.stand.y, this.speed, dt, 8)) {
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
        if (!n || !this.nodeOk(n) || this.room <= 0) {
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
        const pad = this.station.inPad;
        if (this.stack.count + this.stack.incoming === 0) { this.state = 'seek'; break; }
        if (gs.moveAgent(this, pad.x + (this.index - 0.5) * 18, pad.y + 4, this.speed, dt, 10)) {
          this.vx = this.vy = 0;
          this.state = 'drop'; this.dropT = 0.15;
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
          if (!this.station.feedFrom(this)) {
            // station input full: wait patiently
            this.dropT = 0.6;
          }
        }
        this.locomotion(false);
        break;
      }
    }
    this.sync(dt);
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
    const item = n.hit(this);
    if (item && this.room > 0) gs.spawnItemTo(item, ip.x, ip.y, this, false);
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

// ------------------------------------------------------------------ porter (v2)
const PORTER_KEYS = ['npc_porter_a', 'npc_porter_b'];
// stand-ins while the porter art is missing: ordinary villagers carrying in front
const PORTER_FALLBACK = ['npc_yellow', 'npc_red', 'npc_blue', 'npc_young_man', 'villager_a', 'villager_b', 'villager_c'];

export class Porter extends Character {
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
    const o = station.cfg.porterHome || [30, 30];     // world.js stations[].porterHome: waiting spot next to the output pad
    const p = { x: pad.x + o[0], y: pad.y + o[1] };
    gs.collision.resolve(p, 14);
    return [p.x, p.y];
  }

  constructor(gs, station, x, y, index = 0) {
    const pk = Porter.pickKey(gs, index);
    const def = Assets.charDef(pk.key);
    super(gs, pk.key, x, y, { radius: 14, capacity: BALANCE.workers.porterCapacity, carryScale: BALANCE.player.carryScale, carryMode: def.carryStyle === 'back' ? 'back' : 'front' });
    this.wantKey = pk.later;
    this.checkT = 1;
    this.type = 'porter';
    this.role = 'porter';
    this.index = index;
    this.station = station;
    this.seller = FOOD_OUT.indexOf(station.output) >= 0 ? gs.market : gs.trade;
    this.state = 'seek';
    this.home = Porter.homeFor(gs, station);
    this.route = [];
    this.ri = 0;
    this.dropT = 0;
    this.waitT = 0;
    this.tripT = 0;
    this.speed = BALANCE.workers.speed * (0.95 + Math.random() * 0.1);
    gs.keysInUse.add(pk.key);
    if (pk.later) gs.keysInUse.add(pk.later);
    gs.agents.push(this);
  }

  get room() { return this.stack.max - this.stack.count - this.stack.incoming; }

  /** walk along the roads to (x, y) */
  go(x, y) { this.gs.roads.route(this.x, this.y, x, y, this.route); this.ri = 0; this.tripT = 0; }

  shelfSpot() { const sh = this.seller.shelf; return { x: sh.x + 30 + (this.index % 2) * 20, y: sh.y + 22 }; }

  update(dt) {
    const gs = this.gs, out = this.station.outStack;
    if (this.wantKey) {
      this.checkT -= dt;
      if (this.checkT <= 0) {
        this.checkT = 1;
        if (Assets.charReady(this.wantKey)) {
          if (PORTER_KEYS.indexOf(this.key) < 0) gs.keysInUse.delete(this.key);
          this.reskin(this.wantKey);
          this.carryMode = this.def.carryStyle === 'back' ? 'back' : 'front';
          gs.keysInUse.add(this.key);
          this.wantKey = null;
        }
      }
    }
    switch (this.state) {
      case 'seek':
      default: {
        if (this.stack.count > 0 && this.room <= 0) { this.state = 'haul'; const s = this.shelfSpot(); this.go(s.x, s.y); break; }
        if (!this.route.length || this.routeTo !== 'home') { this.go(this.home[0], this.home[1]); this.routeTo = 'home'; }
        if (gs.followRoute(this, this.speed, dt, 10)) {
          this.vx = this.vy = 0;
          this.state = 'load'; this.dropT = 0; this.waitT = 0; this.routeTo = null;
          if (this.dir !== 2) { this.dir = 2; this.play(this.animName, true); }
          this.locomotion(false);
        }
        break;
      }
      case 'load': {
        this.vx = this.vy = 0;
        this.dropT -= dt;
        if (this.room <= 0) { this.startHaul(); break; }
        if (out.count > 0) {
          this.waitT = 0;
          if (this.dropT <= 0 && gs.moveItem(out, this.stack, null, { dur: 230, height: 55 })) this.dropT = 0.14;
        } else {
          this.waitT += dt;
          // carry what we have once the output runs dry for a moment (or right away with a decent load)
          if (this.stack.count > 0 && this.stack.incoming === 0 && (this.stack.count >= 4 || this.waitT > 3)) this.startHaul();
        }
        this.locomotion(false);
        break;
      }
      case 'haul': {
        if (this.stack.count + this.stack.incoming === 0) { this.state = 'seek'; this.route.length = 0; break; }
        if (this.seller.enabled === false) { this.vx = this.vy = 0; this.locomotion(false); break; }     // the market has no enabled flag (always open)
        this.tripT += dt;
        if (gs.followRoute(this, this.speed, dt, 12) || this.tripT > 90) {
          if (this.tripT > 90) { const s = this.shelfSpot(); this.x = s.x; this.y = s.y; }
          this.vx = this.vy = 0;
          this.state = 'unload'; this.dropT = 0.1; this.waitT = 0;
          this.faceTo(this.seller.shelf.x, this.seller.shelf.y);
          this.locomotion(false);
        }
        break;
      }
      case 'unload': {
        this.vx = this.vy = 0;
        this.dropT -= dt;
        if (this.dropT <= 0) {
          this.dropT = 0.14;
          if (this.stack.count === 0) { if (this.stack.incoming === 0) { this.state = 'seek'; this.route.length = 0; } }
          else if (!this.seller.feedFrom(this)) this.dropT = 0.6;     // shelf full: wait for buyers
        }
        this.locomotion(false);
        break;
      }
    }
    this.sync(dt);
  }

  startHaul() {
    this.state = 'haul';
    const s = this.shelfSpot();
    this.go(s.x, s.y);
  }
}
