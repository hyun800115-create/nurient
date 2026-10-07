// Playing with Kongi the dog (v3.5, docs/기획서_v4_이웃마을.md §5).
// The dog no longer follows the chief: it roams the village (VillageLife: the dog house, the kids, the
// campfires). The whistle button calls it — it runs to the chief and a small bar of three buttons shows
// above it: a treat (the chief `give`s a bone biscuit, the dog `eat`s it), fetch (the chief `throw`s a
// red ball, the dog runs, picks it up and brings it back — on the second throw it jumps and `catch`es
// it in the air) and petting (the chief crouches and `pet`s, the dog `roll`s over). Each makes the
// affection gauge (hearts, saved) grow; a dog that loves you does a `trick` on its own now and then and
// sometimes brings a small gift of coins. Cooldowns keep it from being spammed. Tapping the dog opens
// the bar too. Numbers: balance.js `dog`.

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { BALANCE } from '../data/balance.js';
import { t } from '../data/strings.js';
import { gdist, DIR_BASE, DIR_FLIP } from '../core/Iso.js';
import { DEPTH } from './DepthSort.js';

const B = () => BALANCE.dog || {};
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const SIDE = { E: 0, W: 4 };

export class DogPlay {
  constructor(gs, saved) {
    this.gs = gs;
    saved = saved || {};
    this.love = Math.max(0, Math.min(100, num(saved.love, 0)));
    this.gifts = Math.max(0, Math.floor(num(saved.gifts, 0)));
    this.tricks = Math.max(0, Math.floor(num(saved.tricks, 0)));
    this.mode = 'roam';        // roam | come | near | scene
    this.scene = null;         // the running little scene { kind, phase, t, ... }
    this.cd = { treat: 0, play: 0, pet: 0 };
    this.idleT = 0;
    this.reT = 0;
    this.throws = 0;           // balls thrown this visit (the second one is caught in the air)
    this.giftT = num(B().giftEvery, 150) * (0.6 + Math.random() * 0.5);
    this.trickT = 18 + Math.random() * 10;
    this.ball = null;
    this.carry = null;         // a sprite the dog holds in its mouth (ball, gift coin)
    this.treats = 0;           // treats in a row (it gets full)
  }

  /** the dog resident (null until it lives here and its art is ready) */
  get r() { const life = this.gs.life; const d = life && life.byKey && life.byKey.pet_dog; return d && d.alive ? d : null; }
  /** VillageLife leaves the dog alone while it plays with the chief */
  get busy() { return this.mode !== 'roam'; }
  get hearts() { return this.love / 20; }

  /** the 3-button bar is shown (UI asks every frame) */
  barVisible() {
    const r = this.r, p = this.gs.player;
    return !!(r && this.mode === 'near' && !r.lod && gdist(r.x, r.y, p.x, p.y) < num(B().callRange, 140) * 1.5);
  }

  cooldown(kind) { return Math.max(0, this.cd[kind] || 0); }
  cooldownMax(kind) { return Math.max(0.1, num(B()[kind + 'Cooldown'], 5)); }

  // ------------------------------------------------------------------ commands (UI / tap / test hook)
  command(cmd) {
    if (cmd === 'whistle') return this.whistle();
    if (cmd === 'tap') { const r = this.r; return r ? this.onTap(r) : false; }
    if (cmd === 'treat' || cmd === 'play' || cmd === 'pet') return this.start(cmd);
    return false;
  }

  whistle() {
    const gs = this.gs, r = this.r, p = gs.player;
    if (!r) { gs.ui.toast(t('dogFar')); return false; }
    gs.sfxAt(Assets.audioDef('sfx_whoosh') ? 'sfx_whoosh' : 'sfx_click', p.x, p.y, { volume: 0.5, rate: 1.9 }, true);
    if (this.mode === 'scene') return true;
    this.take(r);
    if (gdist(r.x, r.y, p.x, p.y) < num(B().callRange, 140)) { this.arrive(r); return true; }
    this.mode = 'come';
    this.reT = 0;
    this.comeT = 0;
    r.emote(Assets.pick('emote_exclaim', 'emote_heart'), 1.2);
    gs.time.delayedCall(250, () => this.bark(r, 0.6));
    this.goNear(r, true);
    if (gs.isOnScreen(r.x, r.y, 0) === false) gs.ui.toast(t('dogComing'));
    return true;
  }

  onTap(r) {
    const p = this.gs.player;
    if (this.mode === 'scene') return r;
    this.take(r);
    if (gdist(r.x, r.y, p.x, p.y) < num(B().callRange, 140) * 1.4) this.arrive(r);
    else { this.mode = 'come'; this.comeT = 0; this.goNear(r, true); }
    this.bark(r, 0.5);
    this.gs.effects.sheet('fx_hearts', r.x, r.y + r.headTop, { size: 80 });
    return r;
  }

  bark(r, vol) { if (r) this.gs.sfxAt(Assets.audioDef('sfx_dog_bark') ? 'sfx_dog_bark' : 'sfx_click', r.x, r.y, { volume: vol || 0.5, throttle: 300 }); }

  /** the dog leaves whatever it was doing (seat, job, group event) */
  take(r) {
    if (r.event) r.event.drop(r);
    if (r.seat) r.unsit();
    if (r.job) r.job = null;
    if (this.gs.life) this.gs.life.setArea(r, null);
    r.stopFx();
  }

  /** a spot next to the chief, on his left or right (side-on, so both are seen in profile) */
  sideSpot(r, side) {
    const gs = this.gs, p = gs.player;
    const pp = (Assets.charDef('player').petPoint || {}).E || [29, 4];
    const s = side !== undefined ? side : (r.x >= p.x ? 1 : -1);
    const tryS = [s, -s];
    for (const k of tryS) {
      const q = { x: p.x + pp[0] * k, y: p.y + pp[1] };
      if (!gs.collision.blocked(q.x, q.y, 10)) return { x: q.x, y: q.y, side: k };
    }
    return { x: p.x + pp[0] * s, y: p.y + pp[1], side: s };
  }

  goNear(r, run) {
    const p = this.gs.player;
    const sd = r.x >= p.x ? 1 : -1;
    this.target = { x: p.x + sd * 70, y: p.y + 24 };
    r.goTo(this.target.x, this.target.y, { run, tol: 24, speed: run ? 230 : undefined });
  }

  arrive(r) {
    const p = this.gs.player;
    this.mode = 'near';
    this.idleT = 0;
    this.throws = 0;
    r.state = 'idle';
    r.faceTo(p.x, p.y);
    r.act(Assets.hasAnim('pet_dog', 'beg') ? 'beg' : 'sit', -1);
    this.bark(r, 0.45);
  }

  roam(r) {
    this.mode = 'roam';
    this.scene = null;
    this.dropCarry();
    if (r) { r.stand(); r.job = null; }
  }

  // ------------------------------------------------------------------ the three scenes
  start(kind) {
    const gs = this.gs, r = this.r, p = gs.player;
    if (!r) { gs.ui.toast(t('dogFar')); return false; }
    if (this.mode === 'scene') return false;
    if (this.cooldown(kind) > 0) { gs.ui.toast(t('dogWait')); Audio.play('sfx_error', { volume: 0.3 }); return false; }
    if (kind === 'treat' && this.treats >= 3) { r.emote(Assets.pick('emote_dots', 'emote_heart'), 1.2); gs.ui.toast(t('dogFull')); return false; }
    if (this.mode !== 'near') {
      if (gdist(r.x, r.y, p.x, p.y) > num(B().callRange, 140) * 1.5) { this.whistle(); return false; }
      this.take(r);
    }
    Audio.play('sfx_click', { volume: 0.6 });
    this.mode = 'scene';
    this.idleT = 0;
    const sp = this.sideSpot(r);
    this.scene = { kind, phase: 'place', t: 0, spot: sp };
    p.vx = p.vy = 0;
    // the dog trots to the chief's side first
    r.goTo(sp.x, sp.y, { direct: true, tol: 6, speed: 200 });
    this.cd[kind] = this.cooldownMax(kind);
    return true;
  }

  /** both turned to each other; the chief's motion with an impact callback */
  faceUp(r, sc) {
    const p = this.gs.player;
    p.dir = sc.spot.side > 0 ? SIDE.E : SIDE.W;
    r.dir = sc.spot.side > 0 ? SIDE.W : SIDE.E;
    r.x = sc.spot.x; r.y = sc.spot.y; r.vx = r.vy = 0; r.state = 'act';
  }

  addLove(n, x, y) {
    const before = Math.floor(this.hearts);
    this.love = Math.max(0, Math.min(100, this.love + n));
    const gs = this.gs;
    if (gs.isOnScreen(x, y, 40)) { gs.effects.sheet('fx_hearts', x, y, { size: 96 }); gs.effects.burst('heart', x, y, 4); }
    if (Math.floor(this.hearts) > before) { gs.effects.floatText(x, y - 40, '♥ ' + Math.floor(this.hearts), '#ff6f91', 30); Audio.play('sfx_levelup', { volume: 0.5, rate: 1.3 }); }
    gs.events.emit('dogLove', this.love);
  }

  sceneUpdate(dt, r) {
    const gs = this.gs, p = gs.player, sc = this.scene;
    if (sc.tick) {
      // the gift: the dog keeps trotting to the chief even while he walks
      if ((sc.reT = (sc.reT || 0) - dt) <= 0) { sc.reT = 0.6; const sp = this.sideSpot(r); if (gdist(sp.x, sp.y, sc.spot.x, sc.spot.y) > 60) { sc.spot = sp; r.goTo(sp.x, sp.y, { run: true, tol: 10, speed: 200 }); } }
      sc.tick(dt);
      return;
    }
    sc.t += dt;
    // the chief walks away: the scene stops (a ball in the air still lands)
    if ((p.vx || p.vy) && sc.phase !== 'fetch' && sc.phase !== 'back' && sc.phase !== 'flight') { this.endScene(r, false); return; }
    if (sc.phase === 'place') {
      if (r.arrived || sc.t > 1.4) {
        this.faceUp(r, sc);
        sc.phase = 'go'; sc.t = 0;
        if (sc.kind === 'treat') this.beginTreat(r, sc);
        else if (sc.kind === 'pet') this.beginPet(r, sc);
        else this.beginThrow(r, sc);
      }
      return;
    }
    if (sc.kind === 'treat') this.treatUpdate(dt, r, sc);
    else if (sc.kind === 'pet') this.petUpdate(dt, r, sc);
    else this.playUpdate(dt, r, sc);
  }

  endScene(r, happy) {
    const p = this.gs.player;
    this.scene = null;
    if (p.action) p.action = null;
    this.dropCarry();
    this.mode = 'near';
    this.idleT = 0;
    if (r) {
      r.faceTo(p.x, p.y);
      if (happy) { r.act('happy', 1.1); this.afterHappy = 1.1; }
      else r.act(Assets.hasAnim('pet_dog', 'beg') ? 'beg' : 'sit', -1);
    }
  }

  // ---- treat: give (impact: the biscuit flies to the dog's mouth) -> eat -> hearts
  beginTreat(r, sc) {
    const gs = this.gs, p = gs.player;
    r.act(Assets.hasAnim('pet_dog', 'beg') ? 'beg' : 'sit', -1);
    sc.phase = 'give';
    p.doAction('give', 1.1, r.x, r.y, (ch) => {
      const ip = ch.impactPoint();
      const tp = this.dogPoint(r, 'treatPoint', [26, -24]);
      const spr = gs.effects.takeItem('item_treat');
      spr.setScale(0.55).setDepth(DEPTH.FLY);
      gs.effects.fly(spr, ip.x, ip.y, { x: tp.x, y: tp.y }, { dur: 260, height: 26, scaleTo: 0.5, onDone: (s) => { gs.effects.releaseItem(s); } });
      Audio.play('sfx_pickup', { volume: 0.6, rate: 1.3 });
      gs.time.delayedCall(240, () => { if (this.scene === sc) { sc.phase = 'eat'; sc.t = 0; r.act('eat', -1); } });
    });
    p.action.onCancel = () => { if (this.scene === sc) this.endScene(r, false); };
  }

  treatUpdate(dt, r, sc) {
    const gs = this.gs;
    if (sc.phase === 'give' && sc.t > 1.6) { sc.phase = 'eat'; sc.t = 0; r.act('eat', -1); }
    if (sc.phase === 'eat') {
      if (Math.random() < dt * 3 && gs.isOnScreen(r.x, r.y, 20)) { const tp = this.dogPoint(r, 'treatPoint', [26, -24]); gs.effects.burst('wood', tp.x, tp.y, 1); }
      if (sc.t > 1.6) {
        this.treats++;
        this.addLove(num(B().treatLove, 12), r.x, r.y + r.headTop - 6);
        this.bark(r, 0.5);
        this.endScene(r, true);
      }
    }
  }

  // ---- petting: the chief crouches, the dog rolls over (belly up)
  beginPet(r, sc) {
    const gs = this.gs, p = gs.player;
    sc.phase = 'pet';
    r.act(Assets.hasAnim('pet_dog', 'roll') ? 'roll' : 'happy', -1);
    p.doAction('pet', 2.6, r.x, r.y);
    p.action.onCancel = () => { if (this.scene === sc) this.endScene(r, false); };
    sc.heartT = 0.5;
    void gs;
  }

  petUpdate(dt, r, sc) {
    const gs = this.gs;
    sc.heartT -= dt;
    if (sc.heartT <= 0) { sc.heartT = 0.7; if (gs.isOnScreen(r.x, r.y, 20)) { const bp = this.dogPoint(r, 'bellyPoint', [-2, -16]); gs.effects.burst('heart', bp.x, bp.y - 6, 1); } }
    if (sc.t > 2.6) {
      this.addLove(num(B().petLove, 5), r.x, r.y + r.headTop);
      this.bark(r, 0.4);
      this.endScene(r, true);
    }
  }

  // ---- fetch: throw (impact: the ball flies) -> the dog runs, picks it up, brings it back.
  //      The second throw of a visit is caught in the air (catch, impactFrame = the snap)
  beginThrow(r, sc) {
    const gs = this.gs, p = gs.player;
    const catchIt = this.throws >= 1 && Assets.hasAnim('pet_dog', 'catch');
    this.throws++;
    sc.catchIt = catchIt;
    // where the ball lands: in front of the chief, away from the dog, on open ground
    const side = -sc.spot.side;
    const dist = catchIt ? 190 : 270;
    let land = null;
    for (const a of [0, 0.35, -0.35, 0.7, -0.7, Math.PI]) {
      const ang = (side > 0 ? 0 : Math.PI) + a * (side > 0 ? 1 : -1);
      const q = { x: p.x + Math.cos(ang) * dist, y: p.y + Math.sin(ang) * dist * 0.5 };
      if (!gs.collision.blocked(q.x, q.y, 16)) { land = q; break; }
    }
    if (!land) land = { x: p.x + side * dist * 0.6, y: p.y + 20 };
    gs.collision.resolve(land, 14);
    sc.land = land;
    p.dir = side > 0 ? SIDE.E : SIDE.W;
    p.doAction('throw', 0.75, land.x, land.y, (ch) => this.releaseBall(r, sc, ch));
    sc.phase = 'windup';
    r.act(Assets.hasAnim('pet_dog', 'beg') ? 'beg' : 'sit', -1);
    // the catch: the dog dashes off as soon as the chief winds up
    if (catchIt) gs.time.delayedCall(120, () => { if (this.scene === sc) { r.goTo(land.x, land.y + 4, { direct: true, run: true, tol: 8, speed: 260 }); } });
  }

  releaseBall(r, sc, ch) {
    const gs = this.gs;
    const ip = ch.impactPoint();
    const ball = gs.effects.takeItem('item_ball');
    ball.setScale(0.5).setDepth(DEPTH.FLY);
    this.ball = ball;
    sc.phase = 'flight'; sc.t = 0;
    Audio.play(Assets.audioDef('sfx_whoosh') ? 'sfx_whoosh' : 'sfx_click', { volume: 0.45, rate: 1.4 });
    const land = sc.land;
    if (sc.catchIt) {
      // aimed at the dog's mouth in the air (catch impactPoint) when it gets there
      const dur = 900;
      const cp = (Assets.charDef('pet_dog').anims.catch || {}).impactPoint || {};
      const dirB = 'E';
      const off = cp[dirB] || [20, -58];
      const fl = land.x >= gs.player.x ? 1 : -1;
      sc.catchAt = { x: land.x + off[0] * -fl * 0.4, y: land.y + off[1] };
      gs.effects.fly(ball, ip.x, ip.y, sc.catchAt, { dur, height: 150, scaleTo: 0.5, spin: 2, onDone: () => this.ballCaught(r, sc) });
      gs.time.delayedCall(dur - 260, () => { if (this.scene === sc && sc.phase === 'flight') { r.vx = r.vy = 0; r.state = 'act'; r.faceTo(gs.player.x, gs.player.y); r.act('catch', 0.6); sc.jumped = true; } });
    } else {
      gs.effects.fly(ball, ip.x, ip.y, { x: land.x, y: land.y - 6 }, { dur: 620, height: 120, scaleTo: 0.5, spin: 2, onDone: () => this.ballLanded(r, sc) });
      gs.time.delayedCall(260, () => { if (this.scene === sc) { r.goTo(land.x + (r.x < land.x ? -14 : 14), land.y + 4, { direct: true, run: true, tol: 10, speed: 240 }); this.bark(r, 0.4); } });
    }
  }

  ballLanded(r, sc) {
    const gs = this.gs, b = this.ball;
    if (!b || this.scene !== sc) { if (b) { gs.effects.releaseItem(b); this.ball = null; } return; }
    sc.phase = 'fetch'; sc.t = 0;
    gs.effects.burst('snowhit', b.x, b.y + 4, 4);
    // a little bounce
    gs.tweens.add({ targets: b, y: b.y - 16, duration: 140, yoyo: true, ease: 'Sine.easeOut' });
  }

  ballCaught(r, sc) {
    const gs = this.gs;
    if (this.scene !== sc) return;
    if (!sc.jumped || gdist(r.x, r.y, sc.land.x, sc.land.y) > 60) { this.ballLanded(r, sc); return; }
    // snap! the dog has it (the ball rides in its mouth now)
    gs.effects.burst('star', sc.catchAt.x, sc.catchAt.y, 8);
    this.bark(r, 0.5);
    this.holdBall(r);
    sc.phase = 'caught'; sc.t = 0;
    this.addLove(Math.round(num(B().playLove, 6) * 0.5), r.x, r.y + r.headTop);
  }

  holdBall(r) {
    if (!this.ball) return;
    this.carry = this.ball; this.ball = null;
    if (!Assets.hasAnim('pet_dog', 'run_ball')) return;
    // the art shows the ball in its mouth: hide our sprite
    this.carry.setVisible(false);
  }

  playUpdate(dt, r, sc) {
    const gs = this.gs, p = gs.player;
    if (sc.phase === 'windup' && sc.t > 1.6) { this.endScene(r, false); return; }
    if (sc.phase === 'fetch') {
      const b = this.ball;
      if (!b) { this.endScene(r, false); return; }
      if (r.arrived || gdist(r.x, r.y, b.x, b.y + 6) < 30) {
        this.holdBall(r);
        sc.phase = 'back'; sc.t = 0;
        r.moveAnim = 'run_ball';
        const sp = this.sideSpot(r, sc.spot.side);
        sc.spot = sp;
        r.goTo(sp.x, sp.y, { direct: true, run: true, tol: 8, speed: 220 });
        r.moveAnim = Assets.hasAnim('pet_dog', 'run_ball') ? 'run_ball' : 'run';
        r.locomotion(true);
      } else if (r.arrived && sc.t > 2) r.goTo(b.x, b.y + 6, { direct: true, run: true, tol: 10, speed: 240 });
      if (sc.t > 6) { this.endScene(r, false); }
      return;
    }
    if (sc.phase === 'caught' && sc.t > 0.55) {
      sc.phase = 'back'; sc.t = 0;
      const sp = this.sideSpot(r, sc.spot.side);
      sc.spot = sp;
      r.goTo(sp.x, sp.y, { direct: true, run: true, tol: 8, speed: 220 });
      r.moveAnim = Assets.hasAnim('pet_dog', 'run_ball') ? 'run_ball' : 'run';
      r.locomotion(true);
      return;
    }
    if (sc.phase === 'back') {
      if (r.state === 'move') { r.moveAnim = Assets.hasAnim('pet_dog', 'run_ball') ? 'run_ball' : 'run'; if (r.animName !== r.moveAnim) r.locomotion(true); }
      if (r.arrived || sc.t > 5) {
        // drop the ball at the chief's feet; it hops back into his hands
        this.faceUp(r, sc);
        const mp = this.dogPoint(r, 'mouthPoint', [30, -25]);
        const b = this.carry; this.carry = null;
        if (b) {
          b.setVisible(true).setPosition(mp.x, mp.y);
          gs.effects.fly(b, mp.x, mp.y, () => ({ x: p.x, y: p.y - 40 }), { dur: 360, height: 50, scaleTo: 0.3, onDone: (s) => gs.effects.releaseItem(s) });
        }
        this.addLove(num(B().playLove, 6), r.x, r.y + r.headTop);
        this.bark(r, 0.45);
        this.endScene(r, true);
      }
    }
    if (sc.phase === 'flight' && sc.t > 3) this.endScene(r, false);
  }

  /** a point of the dog's art (mouth / treat / belly) in the world for its current direction */
  dogPoint(r, field, def) {
    const d = Assets.charDef('pet_dog')[field] || {};
    const base = DIR_BASE[r.dir], flip = DIR_FLIP[r.dir];
    const pt = d[base] || d.E || def;
    return { x: r.x + (flip ? -pt[0] : pt[0]), y: r.y + pt[1] };
  }

  dropCarry() {
    const gs = this.gs;
    if (this.carry) { gs.effects.releaseItem(this.carry); this.carry = null; }
    if (this.ball) { gs.tweens.killTweensOf(this.ball); gs.effects.releaseItem(this.ball); this.ball = null; }
    if (this.gift) { this.gift.destroy(); this.gift = null; }
  }

  // ------------------------------------------------------------------ frame
  update(dt) {
    const gs = this.gs, r = this.r, p = gs.player;
    for (const k in this.cd) if (this.cd[k] > 0) this.cd[k] -= dt;
    if (this.treats > 0) { this.treatDecay = (this.treatDecay || 0) + dt; if (this.treatDecay > 60) { this.treatDecay = 0; this.treats--; } }
    if (!r) { if (this.mode !== 'roam') { this.mode = 'roam'; this.scene = null; this.dropCarry(); } return; }
    if (this.afterHappy > 0) { this.afterHappy -= dt; if (this.afterHappy <= 0 && this.mode === 'near' && r.state !== 'move') r.act(Assets.hasAnim('pet_dog', 'beg') ? 'beg' : 'sit', -1); }
    const range = num(B().callRange, 140);
    if (this.mode === 'come') {
      this.comeT += dt;
      this.reT -= dt;
      const d = gdist(r.x, r.y, p.x, p.y);
      if (d < range && (!(p.vx || p.vy) || d < range * 0.7)) { this.arrive(r); return; }
      if (this.reT <= 0) { this.reT = 0.6; if (!this.target || gdist(this.target.x, this.target.y, p.x, p.y) > 90 || r.arrived) this.goNear(r, true); }
      if (this.comeT > 40) this.roam(r);
      return;
    }
    if (this.mode === 'near') {
      this.idleT += dt;
      const d = gdist(r.x, r.y, p.x, p.y);
      // the chief walks off: trot after him for a while, then go back to playing in the village
      if (d > range * 1.3) {
        if (r.state !== 'move' || (this.target && gdist(this.target.x, this.target.y, p.x, p.y) > 90)) this.goNear(r, d > 260);
      } else if (r.state === 'move' && d < range * 0.8) { r.state = 'idle'; r.faceTo(p.x, p.y); r.act(Assets.hasAnim('pet_dog', 'beg') ? 'beg' : 'sit', -1); }
      if (this.idleT > num(B().stayTime, 12)) { this.roam(r); return; }
      // a loving dog shows off now and then
      if (this.love >= num(B().trickAt, 50) && this.idleT > 3 && r.state !== 'move') {
        this.trickT -= dt;
        if (this.trickT <= 0) this.doTrick(r);
      }
      return;
    }
    if (this.mode === 'scene') { this.sceneUpdate(dt, r); return; }
    // roaming: a loving dog sometimes brings a gift, or does a trick when the chief stands nearby
    if (this.love >= num(B().giftAt, 75)) {
      this.giftT -= dt;
      if (this.giftT <= 0 && !r.lod && gdist(r.x, r.y, p.x, p.y) < 800) this.bringGift(r);
      else if (this.giftT <= 0) this.giftT = 10;
    }
    if (this.love >= num(B().trickAt, 50) && !r.lod && !r.event && !r.seat && gdist(r.x, r.y, p.x, p.y) < 220 && !(p.vx || p.vy)) {
      this.trickT -= dt;
      if (this.trickT <= 0) { this.take(r); this.doTrick(r); }
    }
  }

  doTrick(r) {
    const gs = this.gs, p = gs.player;
    this.trickT = 30 + Math.random() * 20;
    this.tricks++;
    r.faceTo(p.x, p.y);
    const dur = Assets.animDuration('pet_dog', 'trick') + 0.3;
    r.act(Assets.hasAnim('pet_dog', 'trick') ? 'trick' : 'happy', dur);
    gs.time.delayedCall(dur * 700, () => { if (r.alive && gs.isOnScreen(r.x, r.y, 20)) { gs.effects.burst('star', r.x, r.y + r.headTop, 8); gs.effects.floatText(r.x, r.y + r.headTop - 20, t('dogTrick'), '#ffffff', 24); } });
    this.bark(r, 0.5);
    if (this.mode === 'near') { this.afterHappy = dur; this.idleT = Math.max(0, this.idleT - 4); }
  }

  /** a small gift of coins: the dog trots to the chief with a coin in its mouth */
  bringGift(r) {
    const gs = this.gs;
    this.giftT = num(B().giftEvery, 150) * (0.7 + Math.random() * 0.6);
    this.take(r);
    this.mode = 'scene';
    const coin = gs.effects.takeItem('item_coin');
    coin.setScale(0.45).setDepth(r.y + 1);
    this.gift = null;
    this.carry = coin;
    const sc = { kind: 'gift', phase: 'bring', t: 0, spot: this.sideSpot(r) };
    this.scene = sc;
    r.goTo(sc.spot.x, sc.spot.y, { run: true, tol: 10, speed: 200 });
    this.bark(r, 0.45);
    // its own little update
    const tick = (dt) => {
      if (this.scene !== sc) return true;
      sc.t += dt;
      const mp = this.dogPoint(r, 'mouthPoint', [30, -25]);
      if (this.carry) this.carry.setPosition(mp.x, mp.y + 4).setDepth(r.y + 1);
      if (r.arrived || sc.t > 25) {
        const p = gs.player;
        r.faceTo(p.x, p.y);
        const base = Math.max(1, Math.floor(num(B().giftCoins, 6)));
        const n = Math.max(1, Math.round(base * (0.5 + Math.random())));
        if (this.carry) { gs.effects.releaseItem(this.carry); this.carry = null; }
        gs.economy.add(n, r.x, r.y - 30, true);
        gs.effects.burst('coin', r.x, r.y - 20, 6);
        gs.effects.floatText(r.x, r.y + r.headTop - 20, '+' + n, '#ffd84a', 30);
        gs.ui.toast(t('dogGift', { n }));
        Audio.play('sfx_coins_many', { volume: 0.6 });
        this.gifts++;
        this.endScene(r, true);
        return true;
      }
      return false;
    };
    sc.tick = tick;
  }

  serialize() { return { love: Math.round(this.love * 10) / 10, gifts: this.gifts, tricks: this.tricks }; }

  state() {
    const r = this.r;
    return {
      mode: this.mode, scene: this.scene ? this.scene.kind + ':' + this.scene.phase : null, love: Math.round(this.love * 10) / 10, hearts: Math.floor(this.hearts),
      bar: this.barVisible(), cd: { treat: +this.cooldown('treat').toFixed(1), play: +this.cooldown('play').toFixed(1), pet: +this.cooldown('pet').toFixed(1) },
      dog: r ? { x: Math.round(r.x), y: Math.round(r.y), anim: r.animRes, state: r.state, lod: r.lod } : null, gifts: this.gifts, tricks: this.tricks,
    };
  }
}
