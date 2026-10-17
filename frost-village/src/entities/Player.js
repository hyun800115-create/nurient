// The chief: joystick movement, auto-gather when standing still near a resource,
// carried item tower, footsteps.

import { Character } from './Character.js';
import { Audio } from '../core/Audio.js';
import { BALANCE } from '../data/balance.js';
import { t } from '../data/strings.js';

export class Player extends Character {
  constructor(gs, x, y) {
    super(gs, 'player', x, y, { radius: 16, carryScale: BALANCE.player.carryScale });
    this.stillT = 0;
    this.node = null;
    this.stepT = 0;
    this.fullWarnT = 0;
    this.onImpact = () => this.impact();
    this._p = { x: 0, y: 0 };
    this.operating = null;    // (v3.5) the OperatorSpot he stands on (set by the spot every frame)
    this.opSpot = null;
    this.action = null;       // (v3.5) a little scene with the dog: { anim, until, onImpact, face }
  }

  /**
   * (v4.2 CODE-2) sit down on a seat (assets/chief2 seated anims: sit_idle / sit_write / sit_read / sit_eat / doze) —
   * seat = { x, y (the seat point, where the sprite's anchor goes), lift (px the ground lies below it in the drawn
   * floor: an office's raised floor), slot ('@behind': a desk front is drawn over his lap), deskOverlay (the
   * `{frame}_desk` mittens / paper drawn just over the desk), shadowDy, dir }. Any move stands him up.
   */
  sitDown(seat, anim) {
    this.seat = seat;
    this.node = null; this.action = null; this.opSpot = null;
    this.x = seat.x; this.y = seat.y + (seat.lift || 0);
    this.slot = seat.slot || null;
    this.shadowDy = seat.shadowDy !== undefined ? seat.shadowDy : 25;
    if (seat.dir !== undefined) { this.dir = seat.dir; }
    this.seatAnim = anim || 'sit_idle';
    this.play(this.seatAnim, true);
  }
  /** (CODE-2) a seated anim to play (doze / sit_read / sit_write) */
  seatPlay(anim) { if (this.seat && anim) { this.seatAnim = anim; this.play(anim); } }
  standUp() {
    const s = this.seat;
    if (!s) return;
    this.seat = null;
    this.slot = null;
    this.shadowDy = 0;
    this.seatAnim = null;
    // a step off the chair, toward the room (the floor in front of the seat)
    this.y += s.standDy !== undefined ? s.standDy : 18;
    if (this.deskOv) this.deskOv.setVisible(false);
  }

  /** (v3.5) play `anim` for `dur` s facing (fx, fy) (dog play: give / throw / pet); moving cancels it */
  doAction(anim, dur, fx, fy, onImpact) {
    this.action = { anim, until: this.gs.time.now + dur * 1000, onImpact: onImpact || null, fx, fy };
    this.node = null;
    if (fx !== undefined) this.faceTo(fx, fy);
    this.play(anim, true);
  }

  get capacity() { return this.gs.progress.capacity(); }
  get speed() { return BALANCE.player.speed * this.gs.progress.speedMult(); }
  get room() { return this.capacity - this.stack.count - this.stack.incoming; }

  update(dt, inp) {
    const gs = this.gs;
    this.fullWarnT -= dt;
    // (v4.2 CODE-2) seated: any move stands him up; else the seated anim (the desk overlay follows its frames)
    if (this.seat) {
      if (inp.mag > 0.05) this.standUp();
      else {
        this.vx = this.vy = 0;
        this.sprite.anims.timeScale = 1;
        if (this.animName !== this.seatAnim) this.play(this.seatAnim);
        this.sync(dt);
        this.syncDesk();
        return;
      }
    }
    if (inp.mag > 0.05) {
      const sp = this.speed;
      // quick acceleration toward the joystick velocity (snappy but not robotic)
      const k = Math.min(1, dt * 16);
      this.vx += (inp.x * sp - this.vx) * k;
      this.vy += (inp.y * sp * BALANCE.player.verticalFactor - this.vy) * k;
      const v = Math.hypot(this.vx, this.vy);
      this.sprite.anims.timeScale = Math.max(0.6, Math.min(1.35, v / 210));
      const p = this._p;
      p.x = this.x + this.vx * dt; p.y = this.y + this.vy * dt;
      gs.collision.resolve(p, this.radius);
      this.x = p.x; this.y = p.y;
      this.stillT = 0;
      this.node = null;
      if (this.action) { const a = this.action; this.action = null; if (a.onCancel) a.onCancel(); }
      this.operating = null; this.opSpot = null;
      this.face(this.vx, this.vy);
      this.locomotion(true);
      // footsteps
      this.stepT -= dt * (0.6 + inp.mag * 0.6);
      if (this.stepT <= 0) {
        this.stepT = 0.27;
        gs.effects.burst('dust', this.x + (Math.random() - 0.5) * 10, this.y - 2, 1);
        Audio.play('sfx_step_snow', { volume: 0.32, rate: 0.9 + Math.random() * 0.2, throttle: 120 });
      }
    } else {
      this.vx = this.vy = 0;
      this.sprite.anims.timeScale = 1;
      this.stillT += dt;
      if (this.node && this.node.kind !== 'tree' && this.node.kind !== 'rock' && this.node.kind !== 'wheat' && this.node.kind !== 'net') {
        // moving targets (animals) must stay within reach
        const dx = this.node.x - this.x, dy = (this.node.y - this.y) * 2;
        if (dx * dx + dy * dy > Math.pow(BALANCE.player.gatherRange * 1.5, 2)) this.node = null;
      }
      if (this.node && (!this.node.ready() || this.room <= 0)) {
        if (this.room <= 0) this.warnFull();
        this.node = null;
      }
      // ((v4.2) 자동 줍기: gathering asks the PickupPolicy — 'still' waits a little longer, 'off' only with 줍기)
      const PP = gs.v42 && gs.v42.pickup;
      if (this.node && PP && !PP.keepGathering(this)) this.node = null;
      if (!this.node && this.stillT > BALANCE.player.stillDelay && !gs.playerOnPad) {
        const n = gs.findGatherable(this.x, this.y, BALANCE.player.gatherRange);
        if (n && (!PP || PP.mayGather(n, this))) {
          if (this.room <= 0) this.warnFull();
          else if (gs.stationBlocked(n.item)) gs.fullToast();   // its station is full both ways: don't fill the bag
          else this.node = n;
        }
      }
      // (v3.5) a moment with the dog, or working a station from its work spot
      const op = this.operating;
      this.operating = null;
      if (this.action && gs.time.now < this.action.until) {
        this.node = null;
        this.play(this.action.anim);
      } else if (this.action) {
        const a = this.action; this.action = null;
        if (a.onEnd) a.onEnd();
        this.locomotion(false);
      } else if (op) {
        this.node = null;
        this.opSpot = op;
        op.faceFor(this);
        const wa = op.station.working ? op.chiefAnim() : (this.stack.count ? 'carry_idle' : 'idle');
        this.play(wa);
        // (v3.5 review) a one-shot motion (give) loops while he works
        if (op.station.working && !this.sprite.anims.isPlaying) this.play(wa, true);
      } else if (this.node) {
        this.opSpot = null;
        this.faceTo(this.node.x, this.node.y);
        this.play(this.node.playerAnim);
      } else { this.opSpot = null; this.locomotion(false); }
    }
    this.sync(dt);
  }

  /** (CODE-2) the desk-top overlay of a seated anim ({frame}_desk: forearms, mittens, quill, paper over the desk) */
  syncDesk() {
    const s = this.seat;
    if (!s || !s.deskOverlay) { if (this.deskOv && this.deskOv.visible) this.deskOv.setVisible(false); return; }
    const spr = this.sprite, fr = spr.frame, name = fr && fr.name ? fr.name + '_desk' : null;
    const tex = spr.texture;
    const ok = name && tex && tex.has && tex.has(name);
    if (!ok) { if (this.deskOv && this.deskOv.visible) this.deskOv.setVisible(false); return; }
    if (!this.deskOv) this.deskOv = this.gs.add.image(0, 0, tex.key, name);
    const o = this.deskOv;
    if (o.texture !== tex || o.frame.name !== name) o.setTexture(tex.key, name);
    o.setOrigin(spr.originX, spr.originY).setFlipX(spr.flipX).setPosition(spr.x, spr.y).setDepth(s.deskDepth !== undefined ? s.deskDepth : spr.depth + 0.001).setVisible(spr.visible);
  }

  warnFull() {
    if (this.fullWarnT > 0) return;
    this.fullWarnT = 2.5;
    this.gs.ui.toast(t('bagFull'));
    Audio.play('sfx_error', { volume: 0.4 });
  }

  impact() {
    // (v3.5) the dog scene's hand-over / throw frame, a station worked by hand
    if (this.action) { if (this.action.onImpact) { const f = this.action.onImpact; this.action.onImpact = null; f(this); } return; }
    if (this.opSpot && !this.node) { this.opSpot.chiefImpact(this); return; }
    const n = this.node;
    if (!n || this.room <= 0) return;
    const item = n.hit(this);
    if (!item) return;
    const count = n.lastYield || 1;
    n.lastYield = 0;
    const from = n.kind === 'net' ? n.fishPos() : this.impactPoint();
    for (let i = 0; i < count && this.room > 0; i++) {
      this.gs.time.delayedCall(i * 90, () => this.gs.spawnItemTo(item, from.x, from.y, this, true));
    }
    this.gs.effects.vibrate(8);
  }
}
