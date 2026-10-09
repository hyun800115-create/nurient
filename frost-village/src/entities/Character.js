// Base for every animated character: sprite + soft shadow + 8-direction anims (5 rendered,
// 3 mirrored) + carried ItemStack + impact-frame callback.
// v2: anims that exist only in some dirs (villager social anims: S/SE/E) turn the character to the
// nearest dir that has them; carry style head / front / back (porters' A-frame); reskin() swaps the
// art in place when a character's atlas arrives later.

import { Assets } from '../core/Assets.js';
import { DIR_BASE, DIR_FLIP, dirFromVec } from '../core/Iso.js';
import { DEPTH } from '../systems/DepthSort.js';
import { ItemStack } from './ItemStack.js';
import { BALANCE } from '../data/balance.js';
import { DollSprite } from './DollSprite.js';
import { Residency } from '../core/Residency.js';

// anims that are always resident (no on-demand page lookup for them: they are played every frame)
const LOCO = new Set(['idle', 'walk', 'run', 'sit', 'work', 'operate']);

// small sideways shift of a head-carried tower per rendered direction (the head leans a little)
const HEAD_DX = { S: 0, SE: 3, E: 5, NE: 3, N: 0 };

export class Character {
  constructor(gs, key, x, y, opts = {}) {
    this.gs = gs;
    this.scene = gs;
    this.key = key;
    this.def = Assets.charDef(key);
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.dir = opts.dir !== undefined ? opts.dir : 2;
    this.animName = '';
    this.animKey = '';
    this.radius = opts.radius || 15;
    this.walkT = Math.random() * 10;
    this.alive = true;

    const sh = this.def.shadow || [46, 18];
    this.shadow = gs.add.image(x, y, 'fv_shadow').setDepth(DEPTH.SHADOW);
    this.shadow.setDisplaySize(sh[0] * 1.15, sh[1] * 1.3);
    // (v4-A) opts.person: a townsperson paper doll ('tf:<base>') instead of a single-atlas sprite
    this.sprite = opts.person ? new DollSprite(gs, key, opts.person, x, y) : gs.add.sprite(x, y, '__WHITE');
    if (!opts.person) this.sprite.__ch = this;     // (v4-B) Residency finds the characters showing a page
    if (opts.person) this.sprite.shadow = this.shadow;
    this.sprite.setOrigin(this.def.anchor[0], this.def.anchor[1]);
    this.sprite.on(Phaser.Animations.Events.ANIMATION_UPDATE, this._onFrame, this);
    this.stack = new ItemStack(gs, { scale: opts.carryScale || BALANCE.player.carryScale, sway: true, max: opts.capacity || 99 });
    this.carryMode = opts.carryMode || null;   // null = balance.js default (head), 'front', 'back'
    this.animRes = '';
    this.onImpact = null;
    this.play('idle', true);
    this.sync(0);
  }

  get carrying() { return this.stack.count > 0; }
  get headTop() { return this.def.headTop || -84; }

  face(dx, dy) {
    if (Math.abs(dx) + Math.abs(dy) < 0.001) return;
    const d = dirFromVec(dx, dy);
    if (d !== this.dir) { this.dir = d; this.play(this.animName, false, true); }
  }
  faceTo(x, y) { this.face(x - this.x, y - this.y); }

  /** play anim `name` in the current direction; keepFrame keeps the cycle phase on turns */
  play(name, force, keepFrame) {
    // (v4-B) a social anim lives on an on-demand page: ask for it (Residency; the fallback plays meanwhile)
    if (!LOCO.has(name) && Assets.packed && !this.sprite.isDoll && this.def && this.def.atlas) {
      const sp = Assets.socialPage(this.def.atlas, name);
      if (sp) Residency.want(sp);
    }
    const res = Assets.resolveAnim(this.key, name);
    const dirs = Assets.animDirs(this.key, res);
    if (dirs.length && dirs.indexOf(DIR_BASE[this.dir]) < 0) this.dir = nearestDir(this.dir, dirs, this.sprite.flipX);
    const base = DIR_BASE[this.dir];
    const key = dirs.length ? this.key + ':' + res + ':' + base : this.key + ':idle:S';
    this.sprite.setFlipX(DIR_FLIP[this.dir]);
    if (!force && key === this.animKey && name === this.animName) return;
    const prevName = this.animName;
    this.animName = name;
    this.animRes = res;
    this.animKey = key;
    const doll = this.sprite.isDoll;
    if (!doll && !this.scene.anims.exists(key)) return;
    const a = this.sprite.anims;
    if (keepFrame && prevName === name && a.currentAnim) {
      const idx = a.currentFrame ? a.currentFrame.index - 1 : 0;
      const n = doll ? this.sprite.frameCount(key) : this.scene.anims.get(key).frames.length;
      a.play({ key, startFrame: Math.min(idx, n - 1) });
    } else {
      a.play(key);
    }
  }

  _onFrame(anim, frame) {
    if (!this.onImpact) return;
    const ad = this.def.anims[this.animRes];
    if (!ad || ad.impactFrame === undefined || anim.key.indexOf(':' + this.animRes + ':') < 0) return;
    // placeholder art (atlas failed to load) has 2 frames: hit on the second so the game stays playable
    const hitFrame = this.def._placeholder ? 1 : ad.impactFrame;
    if (frame.index - 1 === hitFrame) this.onImpact(this);
  }

  /** impactPoint in world coordinates for the current anim & dir */
  impactPoint() {
    const ad = this.def.anims[this.animRes];
    const base = DIR_BASE[this.dir], flip = DIR_FLIP[this.dir];
    let p = ad && ad.impactPoint && ad.impactPoint[base];
    if (!p) p = [14, -30];
    return { x: this.x + (flip ? -p[0] : p[0]), y: this.y + p[1] };
  }

  carryOffset() {
    const base = DIR_BASE[this.dir], flip = DIR_FLIP[this.dir];
    const mode = this.carryMode || (BALANCE.player.carryOnHead !== false ? 'head' : 'front');
    if (mode === 'head' && this.def.kind !== 'animal' && this.def.kind !== 'pet') {
      // the tower balances on the head: the face stays visible in every direction
      const hx = HEAD_DX[base] || 0;
      return { dx: flip ? -hx : hx, dy: this.headTop + 4, behind: false };
    }
    const cp = (this.def.carryPoint && this.def.carryPoint[base]) || [0, -34, false];
    return { dx: flip ? -cp[0] : cp[0], dy: cp[1], behind: !!cp[2] };
  }

  /** choose idle/walk (carry variants when holding items) */
  locomotion(moving) {
    const carry = this.stack.count > 0;
    this.play(moving ? (carry ? 'carry_walk' : 'walk') : (carry ? 'carry_idle' : 'idle'));
  }

  isWorkAnim() {
    const n = this.animName;
    return n === 'chop' || n === 'mine' || n === 'harvest' || n === 'work' || n === 'happy';
  }

  sync(dt) {
    const s = this.sprite;
    s.setPosition(this.x, this.y);
    if (s.depth !== this.y) s.setDepth(this.y);
    this.shadow.setPosition(this.x, this.y + 1);
    if (this.stack.count) {
      const moving = this.vx * this.vx + this.vy * this.vy > 100;
      if (moving) this.walkT += dt * 12;
      const bob = moving ? Math.abs(Math.sin(this.walkT)) * -2 : Math.sin(this.scene.time.now / 400) * 0.6;
      const o = this.carryOffset();
      let dx = o.dx, dy = o.dy, behind = o.behind;
      if (this.isWorkAnim() && !this.carryMode && BALANCE.player.carryOnHead === false) {
        // hands are busy: the stack rides on the back like a backpack
        dx = -o.dx * 0.6; dy = o.dy - 6; behind = !behind;
      }
      // glide to the new spot when turning instead of jumping
      if (this._cdx === undefined || dt <= 0) { this._cdx = dx; this._cdy = dy; }
      else { const k = Math.min(1, dt * 16); this._cdx += (dx - this._cdx) * k; this._cdy += (dy - this._cdy) * k; }
      this.stack.layout(this.x + this._cdx, this.y + this._cdy + bob, this.y + (behind ? -0.5 : 0.5), this.vx, dt, this.walkT);
    }
  }

  /** swap to another character's art in place (e.g. its atlas finished loading) */
  reskin(key) {
    if (!key || key === this.key || this.sprite.isDoll) return;
    this.key = key;
    this.def = Assets.charDef(key);
    this.sprite.setOrigin(this.def.anchor[0], this.def.anchor[1]);
    const sh = this.def.shadow || [46, 18];
    this.shadow.setDisplaySize(sh[0] * 1.15, sh[1] * 1.3);
    if (this.def.carryStyle === 'back' && this.carryMode) this.carryMode = 'back';
    this.animKey = '';
    this.play(this.animName || 'idle', true);
  }

  destroy() {
    this.alive = false;
    this.sprite.destroy();
    this.shadow.destroy();
  }
}

/** nearest of the 8 directions (from `d`) whose render dir is in `dirs`; ties keep the current side */
export function nearestDir(d, dirs, flipped) {
  for (let off = 1; off <= 4; off++) {
    const a = (d + off) % 8, b = (d - off + 8) % 8;
    const okA = dirs.indexOf(DIR_BASE[a]) >= 0, okB = dirs.indexOf(DIR_BASE[b]) >= 0;
    if (okA && okB) return DIR_FLIP[a] === !!flipped ? a : b;
    if (okA) return a;
    if (okB) return b;
  }
  return d;
}
