// (v4.3 밀밭 · 빵집, docs: scratchpad spec §3–§7) the bakery as its own building, out of the wheat field:
//   - BakeryStation: the cottage (assets/bakery43 bakery43_back + its front layer) IS the oven station 'bakery' (same id, so the
//     raw / goods porters, 2단 upgrades, saves and missions keep working). Wheat comes in at the in-pad I beside the field's
//     wheat gate; loaves are baked one per station.time as before, but leave the oven in batches (bakery43.batch) and fly
//     straight onto the stall's bread case; when the case is full they go to the bread rack O (the out pad: the bread
//     porter's pickup). A full case and a full rack stop the oven.
//   - BakeryStall: the 가판대 in front of the cottage, a Market of its own (the general store's pattern: customers come along
//     the roads, their own line, register, clerk and till). Bread is drawn on the case (stock overlays bread_1 / bread_2),
//     not as towers.
//   - BakerOperator: 제빵사 (빵집 아주머니, npc_aunt) loops knead → oven in → wait → oven out; the batch leaves the oven at her
//     oven_out impact frame (a timer releases it when the anim is missing).
//   - Bakery43: the controller (built by the step bld_bakery: hidden until then), the field's look, saves.
// Places: world.js WORLD.bakery43 / stations 'bakery' / labour.ops.bakery; numbers: balance.js bakery43 / stations.bakery.
// Before the clerk / the baker are hired the chief does those jobs hands-on (the stall's register R, the doorway pad W).

import { Assets } from '../core/Assets.js';
import { Audio } from '../core/Audio.js';
import { BALANCE } from '../data/balance.js';
import { WORLD } from '../data/world.js';
import { BAKERY_GOODS, priceOf } from '../data/items.js';
import { t } from '../data/strings.js';
import { gdist } from '../core/Iso.js';
import { Station } from './Station.js';
import { ItemStack } from './ItemStack.js';
import { Market, signTexture } from './Seller.js';
import { Operator } from '../systems/Labour.js';

const B43 = () => BALANCE.bakery43 || {};
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const SIGN_S = 3;
const DIR = { E: 0, SE: 1, S: 2, SW: 3, W: 4, NW: 5, N: 6, NE: 7 };

/** add a picture that fades with the x-ray of the occluder `occ` (Market.linkFade's way) */
function linkFade(gs, img, occ) {
  if (!img || !occ || !gs.occluders) return;
  gs.occluders.push({ img, x: img.x, y: -1e9, hw: 0, top: 0, a: 1, link: occ });
}

// ===================================================================== the oven station (the cottage)
export class BakeryStation extends Station {
  constructor(gs, cfg) {
    // (the oven's glow is ours: small, inside the cottage under the baker — not the grill's big fire)
    const c2 = Object.assign({}, cfg);
    delete c2.fire;
    super(gs, c2);
    this.cfg = cfg;
    const W = this.W = WORLD.bakery43 || {};
    const d = this.def = Assets.def(cfg.sprite);
    if (gs.lazyImage) gs.lazyImage(this.img, cfg.sprite);
    // the x-ray box (the stand-in has no size yet: Game.onAssetArrived sizes it when the page comes)
    if (!this.occ) {
      const before = gs.occluders ? gs.occluders.length : 0;
      if (!gs.occluders || !gs.occluders.some((o) => o.img === this.img)) gs.addOccluder(this.img, this);
      this.occ = gs.occluders && gs.occluders.length > before ? gs.occluders[gs.occluders.length - 1] : (gs.occluders || []).find((o) => o.img === this.img) || null;
    }
    // the front layer (the low sill, the corner post's foot, the right ledge): over the baker
    const fk = d.overlay || W.front;
    this.front = fk && Assets.m.sprites[fk] ? Assets.image(gs, this.x, this.y, fk).setDepth(this.y + 1) : null;
    if (this.front && gs.lazyImage) gs.lazyImage(this.front, fk);
    linkFade(gs, this.front, this.occ);
    // no round collider (the doorway stays open): the walls are circles round the cottage
    this.obstacle.active = false;
    const walls = Array.isArray(d.walls) && d.walls.length ? d.walls : (W.walls || []);
    this.walls = walls.filter((w) => Array.isArray(w) && w.length >= 3).map((w) => gs.collision.add(this.x + w[0], this.y + w[1], w[2], 'bakery'));
    // the sign 「눈꽃 빵집」 on the front gable's blank board
    this.sign = null;
    this.makeSign();
    // the oven's glow at its mouth (the art's fxPoints.ovenMouth), between the cottage's back layer and the baker
    const fx = d.fxPoints || {};
    this.mouth = Array.isArray(fx.ovenMouth) ? fx.ovenMouth : (W.ovenMouth || cfg.fire || [-37, -23]);
    this.glow = gs.effects.loop('fx_fire', this.x + this.mouth[0], this.y + this.mouth[1] + 4, 26, this.y + 0.3);
    if (this.glow) this.glow.setVisible(false);
    if (Array.isArray(fx.chimney)) this.cfg = Object.assign({}, this.cfg, { smoke: fx.chimney });
    this.oven = 0;              // loaves baked and still in the oven (released in batches)
    this.stall = null;          // BakeryStall (set by Bakery43)
    this.lastRelease = 0;
    this.idleOven = 0;
    this.toStall = 0;           // loaves flying to the stall now
    this.operatorClass = BakerOperator;
    // (the chief's 서서 빵 굽기 pad is drawn over the cottage's floor: Game.buildLabour reads labour.ops.bakery.padDepth)
  }

  get batch() { return Math.max(1, Math.floor(num(B43().batch, 3))); }

  /** a sound at a place in the village (Game.sfxAt: softer toward the view's edges, panned), else plain */
  sfx(key, x, y, opts) { const gs = this.gs; if (gs.sfxAt) gs.sfxAt(key, x, y, opts); else Audio.play(key, opts); }

  makeSign() {
    const gs = this.gs, d = this.def, q = d && d.signQuad;
    if (!Array.isArray(q) || q.length < 4) return null;
    const txt = t(d.signText || this.W.signText || 'sign_bakery43') || '';
    const key = 'fv_sign_bakery43_' + txt;
    const m = signTexture(gs, key, txt, q, d.signColor || '#5A3418');
    if (this.sign) {
      const old = this.sign.texture && this.sign.texture.key;
      this.sign.setTexture(key);
      if (old && old !== key && /^fv_sign_/.test(old) && gs.textures.exists(old)) gs.textures.remove(old);
    } else {
      this.sign = gs.add.image(this.x + q[0][0], this.y + q[0][1] - (m.sh < 0 ? -m.sh * m.w : 0), key).setOrigin(0, 0).setScale(1 / SIGN_S).setDepth(this.y + 0.2);
      linkFade(gs, this.sign, this.occ);
    }
    this.sign.setVisible(this.enabled);
    return this.sign;
  }
  refreshSign() { if (this.sign) this.makeSign(); }

  setEnabled(v) {
    super.setEnabled(v);
    this.obstacle.active = false;
    if (this.front) this.front.setVisible(v);
    if (this.sign) this.sign.setVisible(v);
    for (const w of this.walls || []) w.active = v;
    if (this.glow && !v) this.glow.setVisible(false);
  }

  revealObjects() { const o = super.revealObjects(); if (this.front) o.push(this.front); if (this.sign) o.push(this.sign); return o; }

  /** room for loaves: the stall's case (incl. what flies there) and the rack */
  stallRoom() { const s = this.stall; return s && s.enabled ? Math.max(0, s.maxPerType - s.stock.countWithIncoming('item_bread')) : 0; }
  rackRoom() { return Math.max(0, this.outStack.max - this.outStack.count - this.outStack.incoming); }
  /** somewhere for a loaf now (the case or the rack) */
  hasRoom() { return this.stallRoom() + this.rackRoom() > 0; }

  /** wheat there, the oven not over-full, and somewhere to put the loaves */
  canWork() { return this.operated() && this.inStack.count > 0 && this.oven < this.batch * 2 && this.stallRoom() + this.rackRoom() > this.oven; }
  hasWork() { return this.inStack.count > 0 && this.stallRoom() + this.rackRoom() > this.oven; }

  setWorking(w) {
    super.setWorking(w);
    if (this.glow) this.glow.setVisible(!!w && this.enabled);
  }

  update(dt) {
    super.update(dt);
    if (!this.enabled) return;
    // the oven keeps a few loaves while it bakes: the baker takes them out (BakerOperator), the chief's batch comes out as it
    // is full — and whatever is left comes out once nobody bakes on (he stepped off the doorway pad / the wheat ran out)
    const op = this.op && this.op.operator;
    // (a full case and a full rack: the loaves wait in the oven until a place frees up — no empty release every frame)
    const room = this.hasRoom();
    if (this.oven > 0 && !this.working) {
      this.idleOven += dt;
      if (room && !op && this.idleOven > 0.6) this.releaseBatch();
      // (a baker who cannot reach her motion — an old asset build, a stand-in look: the loaves never wait for long)
      if (room && op && this.idleOven > 4) this.releaseBatch();
    } else this.idleOven = 0;
    if (room && op && this.oven >= this.batch * 2 && this.gs.time.now - this.lastRelease > 5000) this.releaseBatch();
  }

  /** one loaf baked: a wheat hops into the oven mouth; it stays in the oven until its batch comes out */
  process() {
    const gs = this.gs;
    const it = this.inStack.pop(this.input);
    if (!it) return;
    if (gs.noteMade) gs.noteMade(1);
    const mx = this.x + this.mouth[0], my = this.y + this.mouth[1];
    gs.effects.fly(it.spr, it.spr.x, it.spr.y, { x: mx, y: my }, { dur: 260, height: 50, scaleTo: 0.35, onDone: (spr) => gs.effects.releaseItem(spr) });
    this.oven++;
    this.baked = (this.baked || 0) + 1;
    // ((v4.3 a2.2 place-based sound) at the cottage, like every station (Game.sfxAt)
    if (gs.isNear(this.x, this.y, 520)) this.sfx(this.cfg.sfx, this.x, this.y, { volume: this.op && this.op.operator ? 0.18 : 0.35, throttle: 600 });
    // the chief's batch: out as soon as it is full (his give motion keeps the beat)
    if (!(this.op && this.op.operator) && this.oven >= this.batch) gs.time.delayedCall(280, () => { if (this.oven >= this.batch && !(this.op && this.op.operator)) this.releaseBatch(); });
  }

  /** the batch leaves the oven: loaves fly from its mouth to the stall's case while it has room, else onto the rack */
  releaseBatch() {
    const gs = this.gs, n = this.oven;
    if (n <= 0) return 0;
    this.oven = 0;
    this.lastRelease = gs.time.now;
    const mx = this.x + this.mouth[0], my = this.y + this.mouth[1] - 6;
    const S = this.stall;
    let sent = 0;
    for (let k = 0; k < n; k++) {
      const toStall = this.stallRoom() > 0;
      const dst = toStall ? S.stock : this.outStack;
      if (!toStall && this.rackRoom() <= 0) { this.oven += n - k; break; }     // (canWork keeps this from happening)
      dst.reserve(this.output);
      if (toStall) this.toStall++;
      const delay = k * 90;
      gs.time.delayedCall(delay, () => {
        const spr = gs.effects.takeItem(this.output);
        spr.setScale(0.55);
        gs.effects.fly(spr, mx, my, () => (toStall ? S.casePoint() : this.outStack.nextPos()), {
          dur: toStall ? 520 : 320, height: toStall ? 95 : 60, scaleTo: toStall ? 0.8 : 1,
          onDone: (s) => {
            dst.arrive(this.output);
            if (toStall) { this.toStall = Math.max(0, this.toStall - 1); S.stock.push(this.output, s, gs.effects); S.caseChanged(); }
            else this.outStack.push(this.output, s);
            if (gs.isOnScreen(mx, my, 80)) this.sfx('sfx_drop', mx, my, { volume: 0.3, rate: 1.1 + Math.random() * 0.2, throttle: 70 });
          },
        });
      });
      sent++;
    }
    if (sent) { (this.batches || (this.batches = [])).push(sent); if (this.batches.length > 40) this.batches.shift(); }
    if (sent && gs.isOnScreen(this.x, this.y, 120)) {
      gs.effects.burst('flour', mx, my, 3);
      gs.effects.pop(this.img, 0.03, 90);
      if (gs.isNear(this.x, this.y, 520)) this.sfx(this.cfg.sfx, this.x, this.y, { volume: 0.3, throttle: 400 });
    }
    return sent;
  }

  /** the baker's oven_in: the glow flares */
  flare() {
    const gs = this.gs;
    if (!gs.isOnScreen(this.x, this.y, 100)) return;
    const mx = this.x + this.mouth[0], my = this.y + this.mouth[1];
    gs.effects.burst('flame', mx, my - 4, 2);
    if (this.glow) { this.glow.setScale(this.glow.scaleX * 1.25); gs.time.delayedCall(220, () => { if (this.glow) this.glow.setScale(this.glow.scaleX / 1.25); }); }
  }

  /** loaves still in the oven are saved on the rack (nothing is lost on a reload) */
  serialize() { return { i: this.inStack.count + this.inStack.incoming, o: this.outStack.count + this.outStack.incoming + this.oven }; }
}

// ===================================================================== the stall's bread case
/** the stall's stock: bread as data (drawn by the case's overlays, not as towers); a loaf that leaves gets a picture at
 *  the case for its flight */
class CaseStock extends ItemStack {
  constructor(gs, max, at) {
    super(gs, { scale: 0.8, max, cols: [[0, 0]] });
    this.bakeOn = false;
    this.at = at;
    this.bx = at.x; this.by = at.y; this.depth = at.y;
  }
  push(type, spr, fx) {
    const f = fx || this.scene.effects;
    if (spr && f) f.releaseItem(spr);
    this.items.push({ type, spr: null, x: this.at.x, y: this.at.y, hop: 0 });
    return null;
  }
  pop(types) {
    const it = super.pop(types);
    if (it && it.spr) it.spr.setPosition(this.at.x + (Math.random() - 0.5) * 24, this.at.y - 4).setDepth(this.at.y + 2).setVisible(true).setScale(0.8);
    return it;
  }
  nextPos() { this._top.x = this.at.x + (Math.random() - 0.5) * 20; this._top.y = this.at.y - 2; return this._top; }
  layout() {}
  setVisible() {}
}

// ===================================================================== the stall (가판대)
export class BakeryStall extends Market {
  constructor(gs, station) {
    const W = WORLD.bakery43, S = W.stall, B = B43();
    const x = W.x + S.at[0], y = W.y + S.at[1];
    const sd = Assets.def(S.sprite), fx = (sd && sd.fxPoints) || {};
    const caseAt = Array.isArray(fx.case) ? fx.case : [-14, -39];
    const max = Math.max(1, Math.floor(num(B.stallMax, 24)));
    const cfg = {
      id: 'bakery', sprite: S.sprite, x, y, goods: BAKERY_GOODS,
      shelf: S.shelf, cash: S.cash, register: S.register, staff: S.staff, clerk: S.clerk,
      queueStart: S.queueStart, queueStep: S.queueStep, queueTurn: S.queueTurn || 99,
      faceTo: S.faceTo || [24, -24], collider: [0, -4, 0.4],
      maxQueue: Math.max(1, Math.floor(num(B.maxQueue, 5))), wantMax: Math.max(1, Math.floor(num(B.wantMax, 3))),
      spawnEvery: Math.max(0.3, num(B.spawnEvery, 3.2)), shelfMax: max,
      // (the late village: the customers come every spawnEveryLate s)
      spawnK: () => (gs.progress && gs.progress.complete ? Math.max(0.1, num(B43().spawnEveryLate, 2.6) / Math.max(0.3, num(B43().spawnEvery, 3.2))) : 1),
      // an empty, idle bakery draws no line: bread on the case / the rack / in the oven, or wheat at the oven
      available: () => (this.hasBread() ? BAKERY_GOODS.slice() : []),
      makeStock: () => new CaseStock(gs, max, { x: x + caseAt[0], y: y + caseAt[1] }),
    };
    super(gs, cfg);
    this.station = station;
    this.front = [-60, 30];
    this.caseAt = { x: x + caseAt[0], y: y + caseAt[1] };
    if (gs.lazyImage) gs.lazyImage(this.img, S.sprite);
    // the case's bread (none / a few / full) over the counter
    const ov = Array.isArray(sd.stockOverlays) ? sd.stockOverlays : ['bakery43_bread_1', 'bakery43_bread_2'];
    this.fullAt = Math.max(1, Math.floor(num(sd.stockFullAt, num(B.fullAt, 12))));
    this.breadImgs = ov.map((k) => {
      if (!Assets.m.sprites[k]) return null;
      const im = Assets.image(gs, x, y, k).setDepth(y + 1.1).setVisible(false);
      if (gs.lazyImage) gs.lazyImage(im, k);
      this.linkFade(im);
      return im;
    });
    this.caseShown = -1;
    this.linkFade(this.register.overlay);
    this.caseChanged();
  }

  /** where a loaf lands on the case */
  casePoint() { return { x: this.caseAt.x + (Math.random() - 0.5) * 22, y: this.caseAt.y - 2 }; }
  /** bread somewhere at the bakery (or wheat to bake) */
  hasBread() {
    const st = this.station;
    if (this.stock.count > 0 || this.stock.incoming > 0) return true;
    return !!(st && st.enabled && (st.outStack.count > 0 || st.oven > 0 || st.inStack.count > 0));
  }
  /** 0 = empty, 1 = a few, 2 = full (the overlay frame that should show) */
  caseLevel() { const n = this.stock.count; return n <= 0 ? 0 : n < this.fullAt ? 1 : 2; }
  caseChanged() {
    const lv = this.enabled ? this.caseLevel() : 0;
    if (lv === this.caseShown) return;
    this.caseShown = lv;
    this.breadImgs.forEach((im, i) => { if (im) im.setVisible(this.enabled && lv === i + 1); });
  }

  setEnabled(v) {
    super.setEnabled(v);
    this.caseShown = -1;
    this.caseChanged();
  }
  revealObjects() { const o = super.revealObjects(); for (const im of this.breadImgs) if (im && im.visible) o.push(im); return o; }

  update(dt) {
    super.update(dt);
    this.caseChanged();
  }

  complete(c) {
    super.complete(c);
    // the first bread sold here: the field's lesson is over, and the stall's sale counts as the first bread sale
    const pr = this.gs.progress;
    if (pr) {
      pr.hints.farm = true;
      if (!pr.flags.firstBreadSale) pr.setFlag('firstBreadSale');
    }
    this.sold = (this.sold || 0) + 1;
  }
}

// ===================================================================== the baker (제빵사)
const BAKE_DEF = { knead: 0.8, oven_in: 0.6, oven_out: 0.6, wait: 0.3 };

export class BakerOperator extends Operator {
  constructor(gs, spot, key, x, y) {
    super(gs, spot, key, x, y);
    this.phase = null;
    this.phaseT = 0;
    this.released = true;
    this.door = null;
    this.atDoor = false;
    this.cycles = 0;
  }

  /** the anim's length at 1x (s): frames / fps of what plays for `name` */
  animLen(name) {
    const res = Assets.resolveAnim(this.key, name);
    const ad = this.def.anims && this.def.anims[res];
    if (res !== name || !ad) return BAKE_DEF[name] || 0.6;
    return Math.max(0.2, (ad.frames || 6) / Math.max(1, ad.fps || 10));
  }
  /** one knead → oven in → wait → oven out loop lasts batch × station time (the art and the loaves keep the same beat) */
  cycleScale() {
    const st = this.spot.station;
    const v42 = this.gs.v42, cheer = v42 && v42.aura ? v42.aura.cheerK(st) : 1;
    const per = Math.max(0.2, (Number(st.bal && st.bal.time) || 1.1) * (st.timeMult ? st.timeMult() : 1) / cheer) * st.batch;
    const loop = this.animLen('knead') + this.animLen('oven_in') + BAKE_DEF.wait + this.animLen('oven_out');
    return Math.max(0.5, Math.min(2, loop / per));
  }

  /** the anim's impact frame: knead = a flour puff on the dough, oven_in = the glow flares, oven_out = the batch comes out */
  impact() {
    if (this.state !== 'post') return;
    const st = this.spot.station, ip = this.impactPoint();
    if (this.animRes === 'knead') { if (this.gs.isOnScreen(ip.x, ip.y, 80)) this.gs.effects.burst('flour', ip.x, ip.y, 4); }
    else if (this.animRes === 'oven_in') st.flare();
    else if (this.animRes === 'oven_out' && !this.released) { this.released = true; st.releaseBatch(); this.cycles++; }
  }
  /** (Operator's operate-beat cues are not hers: only the impact frame) */
  _onFrame(anim, frame) {
    if (!this.onImpact) return;
    const ad = this.def.anims[this.animRes];
    if (!ad || ad.impactFrame === undefined || anim.key.indexOf(':' + this.animRes + ':') < 0) return;
    if (frame.index - 1 === (this.def._placeholder ? 1 : ad.impactFrame)) this.onImpact(this);
  }

  startPhase(p) {
    const ts = this.cycleScale();
    this.phase = p;
    if (p === 'knead') { this.dir = DIR[this.spot.cfg.dir] !== undefined ? DIR[this.spot.cfg.dir] : DIR.SE; this.play('knead', true); this.phaseT = this.animLen('knead') / ts; }
    else {
      this.dir = DIR[this.spot.cfg.ovenDir] !== undefined ? DIR[this.spot.cfg.ovenDir] : DIR.W;
      if (p === 'in') { this.play('oven_in', true); this.phaseT = this.animLen('oven_in') / ts; }
      else if (p === 'wait') { this.play('idle', true); this.phaseT = BAKE_DEF.wait / ts; }
      else if (p === 'out') { this.released = false; this.play('oven_out', true); this.phaseT = this.animLen('oven_out') / ts; }
    }
    if (this.sprite.anims) this.sprite.anims.timeScale = p === 'wait' ? 1 : ts;
  }

  /** the baking loop while there is wheat or loaves in the oven */
  bake(dt) {
    const st = this.spot.station;
    if (!this.phase) this.startPhase(st.working ? 'knead' : 'wait');
    this.phaseT -= dt;
    if (this.phaseT > 0) return;
    if (this.phase === 'knead') this.startPhase('in');
    else if (this.phase === 'in') this.startPhase('wait');
    else if (this.phase === 'wait') this.startPhase('out');
    else {
      // (no impact frame came — a stand-in look, a page still on its way: the batch comes out at the motion's end)
      if (!this.released) { this.released = true; st.releaseBatch(); this.cycles++; }
      if (st.working) this.startPhase('knead');
      else if (st.oven > 0 && st.hasRoom()) this.startPhase('wait');
      else { this.phase = null; if (this.sprite.anims) this.sprite.anims.timeScale = 1; this.dir = DIR.SE; this.play('idle', true); this.idleT = 0.01; }
    }
  }

  /** the doorway point outside the cottage she walks to first (the last steps go straight in through the door) */
  doorPoint() {
    if (this.door) return this.door;
    const st = this.spot.station, W = WORLD.bakery43 || {};
    const d = Array.isArray(W.doorOut) ? W.doorOut : [-43, 51];
    this.door = { x: st.x + d[0], y: st.y + d[1] };
    return this.door;
  }

  /** the real art arrived after the title: swap the stand-in look (Operator's way) */
  reskinCheck(dt) {
    if (!this.wantKey) return;
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 1;
    const gs = this.gs;
    if (Assets.charReady(this.wantKey)) { gs.keysInUse.delete(this.key); this.reskin(this.wantKey); gs.keysInUse.add(this.wantKey); this.wantKey = null; if (this.phase) { const p = this.phase; this.phase = null; this.startPhase(p); } }
  }

  update(dt) {
    const gs = this.gs, st = this.spot.station;
    if (this.state === 'go') {
      this.reskinCheck(dt);
      const s = this.spot.post, dp = this.doorPoint();
      if (!this.atDoor) {
        const d = gdist(this.x, this.y, dp.x, dp.y);
        if (d > 14) { gs.moveAgent(this, dp.x, dp.y, BALANCE.workers.speed, dt, 10); this.sync(dt); return; }
        this.atDoor = true;
      }
      // in through the doorway: straight, no collision push-out
      const dx = s.x - this.x, dy = s.y - this.y, L = Math.hypot(dx, dy);
      const step = Math.min(L, BALANCE.workers.speed * 0.8 * dt);
      if (L > 0.5) { this.vx = (dx / L) * 100; this.vy = (dy / L) * 100; this.x += (dx / L) * step; this.y += (dy / L) * step; this.face(dx, dy); this.locomotion(true); }
      if (L - step < 2) { this.arrive(); this.dir = DIR.SE; this.play('wave', true); this.idleT = -1.2; }
      this.sync(dt);
      return;
    }
    this.reskinCheck(dt);
    this.vx = this.vy = 0;
    // (loaves in the oven with the case and the rack full: she waits by her table — no empty oven_out over and over)
    const busy = st.enabled && (st.working || (st.oven > 0 && st.hasRoom()) || (this.phase && this.phase !== 'knead'));
    if (busy || (this.phase && st.working)) {
      this.idleT = 0;
      this.bake(dt);
    } else {
      if (this.phase) { this.phase = null; if (this.sprite.anims) this.sprite.anims.timeScale = 1; }
      if (this.sprite.anims && this.sprite.anims.timeScale !== 1) this.sprite.anims.timeScale = 1;
      this.idleT += dt;
      if (this.idleT >= 0 && this.animName !== 'idle' && this.animName !== 'wave' && this.animName !== 'happy') { this.dir = DIR.SE; this.play('idle', true); }
      if (this.idleT > 0 && (this.animName === 'wave' || this.animName === 'happy') && this.idleT > 1.4) { this.dir = DIR.SE; this.play('idle', true); }
      this.emoteT -= dt;
      this.waveCd -= dt;
      const p = gs.player, onScreen = gs.isOnScreen(this.x, this.y, 60);
      if (onScreen && this.waveCd <= 0 && gdist(p.x, p.y, this.x, this.y) < 150 && (p.vx || p.vy)) {
        this.waveCd = 18 + Math.random() * 10;
        this.faceTo(p.x, p.y);
        this.play('wave', true);
        this.idleT = 0.01;
      } else if (onScreen && this.emoteT <= 0 && gs.life) {
        this.emoteT = 7 + Math.random() * 6;
        gs.life.bubbles.emote(this, Assets.pick(this.idleT > 25 ? 'emote_zzz' : 'emote_bread', 'emote_dots'), 1.8);
      }
    }
    this.sync(dt);
  }

  /** inside the cottage: drawn between its back layer and its front sill */
  sync(dt) {
    super.sync(dt);
    if (this.state === 'post' && this.spot && this.spot.station) {
      const d = this.spot.station.y + 0.5;
      if (this.sprite.depth !== d) this.sprite.setDepth(d);
      if (this.shadow.depth !== d - 0.05) this.shadow.setDepth(d - 0.05);
    }
  }
}

// ===================================================================== the controller
export class Bakery43 {
  constructor(gs) {
    this.gs = gs;
    this.cfg = WORLD.bakery43;
    this.station = gs.stations && gs.stations.bakery;
    this.built = false;
    this.stall = new BakeryStall(gs, this.station);
    if (this.station) this.station.stall = this.stall;
    // hidden until 빵집 짓기 (bld_bakery)
    this.setShown(false);
  }

  setShown(v) {
    const st = this.station;
    if (st) st.setEnabled(v);
    this.stall.setEnabled(v);
  }

  /** 빵집 짓기: the cottage and its stall pop up (instant = a reload) */
  build(instant) {
    if (this.built) return;
    this.built = true;
    this.setShown(true);
    const gs = this.gs, st = this.station;
    if (gs.roads) gs.roads.invalidate();
    if (gs.padSpots) {
      const S = this.stall;
      for (const p of [S.shelf, S.cash.pad, S.register]) gs.padSpots.push({ x: p.x, y: p.y, r: 70 });
      if (st) { gs.padSpots.push({ x: st.inPad.x, y: st.inPad.y, r: 70 }, { x: st.outPad.x, y: st.outPad.y, r: 70 }); if (st.op) gs.padSpots.push({ x: st.op.x, y: st.op.y, r: 64 }, { x: st.op.post.x, y: st.op.post.y, r: 40 }); }
    }
    if (instant || !st) return;
    // a puff of snow, everything pops in, a look at it (not during the first-run tutorial)
    gs.effects.sheet('fx_poof', st.x, st.y - 60, { size: 260 });
    gs.effects.burst('snowhit', st.x, st.y - 20, 10);
    const objs = st.revealObjects().concat(this.stall.revealObjects());
    objs.forEach((o, i) => {
      if (!o || !o.setScale) return;
      const sx = o.scaleX, sy = o.scaleY;
      o.setScale(0.01);
      gs.tweens.add({ targets: o, scaleX: sx, scaleY: sy, duration: 420, delay: 120 + i * 30, ease: 'Back.easeOut' });
    });
    Audio.play('sfx_build');
    if (gs.focusCamera && !(gs.onboard && gs.onboard.active)) gs.focusCamera(st.x - 40, st.y - 30, 2200);
  }

  update(dt) {
    if (this.built) this.stall.update(dt);
    this.hutSmoke(dt);
  }

  /** the field's 농막: a thin curl of smoke from its stovepipe (the art's fxPoints.smoke) while the field is open and in view */
  hutSmoke(dt) {
    const gs = this.gs, z = gs.zones && gs.zones.farm, hut = gs.decorById && gs.decorById.farm43_hut;
    if (!z || !z.unlocked || !hut || !hut.visible) return;
    this.smokeT = (this.smokeT || 0) - dt;
    if (this.smokeT > 0) return;
    this.smokeT = 1.4 + Math.random() * 0.9;
    const d = Assets.def('farm43_hut'), sm = d && d.fxPoints && d.fxPoints.smoke;
    if (!sm || Assets.pending('farm43_hut') || !gs.isOnScreen(hut.x, hut.y - 120, 120)) return;
    gs.effects.sheet('fx_smoke_puff', hut.x + sm[0], hut.y + sm[1], { size: 64, depth: hut.y + 2 });
  }

  /** bread on the case + the bakery till (Game.serialize adds what flies / waits unpaid) */
  restore(sv) {
    if (!sv) return { stall: 0, over: 0 };
    const fx = this.gs.effects, S = this.stall;
    const n = Math.max(0, Math.floor(Number(sv.stock && sv.stock.item_bread) || 0));
    const k = this.built ? Math.min(n, S.maxPerType) : 0;
    for (let i = 0; i < k; i++) S.stock.push('item_bread', null, fx);
    const c = Math.max(0, Math.floor(Number(sv.cash) || 0));
    if (c > 0) S.cash.restore(c);
    S.caseShown = -1; S.caseChanged();
    return { stall: k, over: n - k };
  }

  /** (tests) the bakery as it is now */
  state() {
    const st = this.station, S = this.stall, op = st && st.op && st.op.operator;
    return {
      built: this.built, stall: S.stock.count, stallIncoming: S.stock.incoming, case: S.caseShown, rack: st ? st.outStack.count : 0, oven: st ? st.oven : 0,
      wheat: st ? st.inStack.count : 0, working: !!(st && st.working), till: S.cash.value, queue: S.queue.length, clerk: !!S.register.clerk,
      clerkReady: !!(S.register.clerk && S.register.clerk.ready), staffed: S.register.staffed, waitingPay: S.waitingPay, sold: S.sold || 0,
      baker: op ? { ready: op.ready, anim: op.animRes, phase: op.phase, cycles: op.cycles, x: Math.round(op.x), y: Math.round(op.y), dir: op.dir } : null,
      chiefOven: !!(st && st.op && st.op.chief), price: priceOf('item_bread'), baked: st ? st.baked || 0 : 0, batches: st && st.batches ? st.batches.slice(-12) : [],
    };
  }
}
