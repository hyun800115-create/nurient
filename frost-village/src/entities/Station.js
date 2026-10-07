// Processing station: raw items on the input pad are converted one by one (timer) into
// products that pile up as towers on the output pad. Plays its `work` loop while busy.
// (v3.5) it only works while OPERATED: the chief stands on its work spot, or a hired operator
// (systems/Labour.js OperatorSpot) does it for good. Its input is a logistics sink (raw porters,
// the boat's fish porter and the warehouse bring raw items).

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { BALANCE } from '../data/balance.js';
import { Pad } from './Pad.js';
import { ItemStack } from './ItemStack.js';
import { PRIO } from '../systems/Logistics.js';

export class Station {
  constructor(gs, cfg) {
    this.gs = gs; this.cfg = cfg; this.id = cfg.id;
    this.x = cfg.x; this.y = cfg.y;
    this.input = cfg.input; this.output = cfg.output;
    this.bal = cfg.bal || BALANCE.stations[cfg.id];
    this.enabled = true;
    const r = Assets.sprite(cfg.sprite);
    this.img = gs.add.sprite(this.x, this.y, r.tex, r.frame).setOrigin(r.anchor[0], r.anchor[1]).setDepth(this.y);
    // tall stations (oven, smelter, smokehouse) fade when the chief walks behind them; low ones never hide him
    if (this.img.displayHeight * this.img.originY > 190) gs.addOccluder(this.img);
    this.workAnim = Assets.spriteAnim(cfg.sprite, 'work');
    const fp = (r.def && r.def.footprint) || [190, 95];
    this.obstacle = gs.collision.add(this.x, this.y, fp[0] * 0.42, 'station');
    this.inPad = new Pad(gs, this.x + cfg.in[0], this.y + cfg.in[1], 'input', 1.45, { icon: cfg.input, iconSize: 44 });
    this.outPad = new Pad(gs, this.x + cfg.out[0], this.y + cfg.out[1], 'output', 1.45, { icon: cfg.output, iconSize: 44 });
    this.inStack = new ItemStack(gs, { scale: 0.92, cols: [[-13, -4], [13, 5]], alternate: true, max: this.bal.inputMax });
    this.outStack = new ItemStack(gs, { scale: 1, cols: [[-15, -4], [15, 5]], alternate: true, max: this.bal.outputMax });
    this.timer = 0;
    this.working = false;
    this.idleT = 0;
    this.pending = 0;
    this.fxT = 0;
    this.fire = null;
    if (cfg.fire) this.fire = gs.effects.loop('fx_fire', this.x + cfg.fire[0], this.y + cfg.fire[1], 46, this.y + 1);
    if (this.fire) this.fire.setVisible(false);
    this.op = null;           // (v3.5) OperatorSpot (set by the Game)
    // (v3.5) the input as a logistics sink: raw porters / boat fish / the warehouse bring raw items
    if (!cfg.noSink) {
      this.inSink = {
        id: this.id + '_in', isWarehouse: false, enabled: true, station: this,
        x: this.inPad.x + 24, y: this.inPad.y + 18,
        accepts: (ty) => ty === this.input,
        room: () => Math.max(0, this.inStack.max - this.inStack.count - this.inStack.incoming - (this.id === 'grill' ? 6 : 0)),
        prio: () => PRIO.GRILL,
        feed: (ch) => this.feedFrom(ch),
      };
      if (gs.logistics) gs.logistics.add(this.inSink);
    }
  }

  /** (v3.5) someone works the station (the chief on its work spot, or its operator) */
  operated() { return !this.op || this.op.active; }
  /** (v3.5) something to do (the "come and work here" cue) */
  hasWork() { return this.inStack.count > 0 && this.outStack.count + this.outStack.incoming < this.outStack.max; }
  /** (v3.5) the chief on the work spot carries something for the input */
  acceptsFromChief(p) { return p.stack.countOf(this.input) > 0 && this.inStack.room > 0; }

  setEnabled(v) {
    this.enabled = v;
    this.img.setVisible(v);
    this.inPad.setVisible(v); this.outPad.setVisible(v);
    this.obstacle.active = v;
    this.inStack.setVisible(v); this.outStack.setVisible(v);
    if (this.inSink) this.inSink.enabled = v;
    if (this.op) this.op.setEnabled(v);
  }

  revealObjects() { return [this.img, this.inPad.img, this.outPad.img].concat(this.op ? this.op.revealObjects() : []); }

  setWorking(w) {
    if (w === this.working) return;
    this.working = w;
    if (w) {
      if (this.workAnim) this.img.play(this.workAnim);
      if (this.fire) this.fire.setVisible(true);
    } else {
      this.img.stop();
      const r = Assets.sprite(this.cfg.sprite);
      this.img.setTexture(r.tex, r.frame);
      if (this.fire) this.fire.setVisible(false);
    }
  }

  update(dt) {
    this.inStack.layout(this.inPad.x, this.inPad.y + 6, this.inPad.y, 0, dt);
    this.outStack.layout(this.outPad.x, this.outPad.y + 6, this.outPad.y, 0, dt);
    if (!this.enabled) return;
    const can = this.canWork();
    if (can) {
      this.idleT = 0;
      this.setWorking(true);
      // (v3.5) the chief works a little faster than an operator (balance.js labour.chiefSpeed)
      const k = this.op && this.op.chief && !this.op.operator ? Math.max(0.2, Number(BALANCE.labour && BALANCE.labour.chiefSpeed) || 1) : 1;
      this.timer += dt * k;
      if (this.timer >= this.bal.time) { this.timer = 0; this.process(); }
    } else {
      this.idleT += dt;
      if (this.idleT > 0.35) this.setWorking(false);
    }
    if (this.working) {
      this.fxT -= dt;
      if (this.fxT <= 0) {
        this.fxT = 0.5 + Math.random() * 0.4;
        if (this.gs.isOnScreen(this.x, this.y, 150)) {
          const sm = this.cfg.smoke;
          if (sm) this.gs.effects.sheet('fx_smoke_puff', this.x + sm[0], this.y + sm[1], { size: 120, depth: this.y + 2 });
          if (this.id === 'grill') { this.gs.effects.burst('smoke', this.x + (Math.random() - 0.5) * 60, this.y - 40, 1); this.gs.effects.burst('flame', this.x + (Math.random() - 0.5) * 70, this.y - 28, 2); }
          if (this.id === 'sawmill') this.gs.effects.burst('wood', this.x + 10, this.y - 50, 3);
          if (this.id === 'smelter') this.gs.effects.burst('spark', this.x + 40, this.y - 60, 2);
          if (this.workFx) this.workFx();
        }
      }
    }
  }

  /** inputs there and room for the product? */
  canWork() { return this.operated() && this.inStack.count > 0 && this.outStack.count + this.outStack.incoming < this.outStack.max; }

  process() {
    const gs = this.gs;
    const it = this.inStack.pop(this.input);
    if (!it) return;
    // raw item hops into the machine
    gs.effects.fly(it.spr, it.spr.x, it.spr.y, { x: this.x, y: this.y - 40 }, {
      dur: 240, height: 50, scaleTo: 0.4,
      onDone: (spr) => gs.effects.releaseItem(spr),
    });
    this.outStack.reserve(this.output);
    gs.time.delayedCall(260, () => {
      const spr = gs.effects.takeItem(this.output);
      spr.setScale(0.5);
      gs.effects.fly(spr, this.x, this.y - 50, () => this.outStack.nextPos(), {
        dur: 300, height: 60, scaleTo: 1,
        onDone: (s) => {
          this.outStack.arrive(this.output);
          this.outStack.push(this.output, s);
          if (gs.isOnScreen(this.outPad.x, this.outPad.y, 60)) Audio.play('sfx_drop', { volume: 0.35, rate: 1.1 + Math.random() * 0.2, throttle: 60 });
        },
      });
      // (v3.5) an operator's own work sounds carry the station; without one the station sounds as before
      if (gs.isNear(this.x, this.y, 520)) Audio.play(this.cfg.sfx, { volume: this.op && this.op.operator ? 0.22 : 0.45, throttle: 400 });
      gs.effects.pop(this.img, 0.06, 90);
    });
  }

  /** accept items from a character standing on the input pad; returns true if something moved */
  feedFrom(ch) {
    if (this.inStack.room <= 0) return false;
    return this.gs.moveItem(ch.stack, this.inStack, this.input, { dur: 240, height: 60, sfx: 'drop' });
  }

  /** give products to a character standing on the output pad */
  takeTo(ch, capacity) {
    if (this.outStack.count === 0) return false;
    if (ch.stack.count + ch.stack.incoming >= capacity) return false;
    return this.gs.moveItem(this.outStack, ch.stack, null, { dur: 230, height: 55, sfx: 'pickup' });
  }

  serialize() { return { i: this.inStack.count + this.inStack.incoming, o: this.outStack.count + this.outStack.incoming }; }
  restore(s) {
    if (!s) return;
    const fx = this.gs.effects;
    for (let k = 0; k < Math.min(s.i || 0, this.inStack.max); k++) this.inStack.push(this.input, null, fx);
    for (let k = 0; k < Math.min(s.o || 0, this.outStack.max); k++) this.outStack.push(this.output, null, fx);
  }
}
