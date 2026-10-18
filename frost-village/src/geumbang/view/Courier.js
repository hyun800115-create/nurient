// Courier (view, plan §5.6): the doorstep scene, drawn from the model's timeline (the same beats run off screen:
// coins, reviews and doorstep boxes happen either way; this only draws them). The 금방 driver (geumbangfolk
// gb_driver / gb_night) steps out at doorPoints[0], takes the parcel at the rear doors (unload patch, sfx_gb_scan),
// carry_parcel along the walk route (extra boxes stacked on the held one), ring_doorbell (fx_gb_bell by its placement
// rule + sfx_gb_doorbell on impact frame 2), the resident steps out (fade) and faces the courier, hand_parcel (the box
// flies from handPoint), wave + the resident's happy + hearts + the coins; nobody home / quiet hours: the box goes on
// the step ("문 앞에 두고 갈게요~", sfx_gb_thump) and a photo is taken; apartments: in through the entrance (fade).

import { DEPTH } from '../../systems/DepthSort.js';
import { Assets } from '../../core/Assets.js';
import { frameOf, dollDir, parcelKey, textStyle, spriteOf } from './art.js';
import { gt } from '../strings.js';

const LEN = (pts) => { let m = 0; for (let k = 1; k < pts.length; k++) m += Math.hypot(pts[k].x - pts[k - 1].x, (pts[k].y - pts[k - 1].y) * 2); return m; };
/** a point u (0..1) along a px polyline (ground metric), with the local heading */
function along(pts, u) {
  const L = LEN(pts), want = Math.max(0, Math.min(1, u)) * L;
  let acc = 0;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], d = Math.hypot(b.x - a.x, (b.y - a.y) * 2);
    if (acc + d >= want || k === pts.length - 1) { const f = d > 0 ? Math.max(0, Math.min(1, (want - acc) / d)) : 0; return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, dx: b.x - a.x, dy: b.y - a.y }; }
    acc += d;
  }
  const p = pts[pts.length - 1];
  return { x: p.x, y: p.y, dx: 1, dy: 0 };
}

export class Courier {
  /** view: GbView; who: 'van:1' | 'sled' (pooled per carrier) */
  constructor(view, who, look) {
    this.view = view; this.scene = view.scene; this.who = who;
    this.rig = view.dolls.make(look);
    this.rig.visible(false);
    this.res = null; this.resAid = null; this.resHid = null;
    this.boxes = [];             // extra stacked boxes (over the held one)
    this.fly = null;             // the handed parcel
    this.bell = null;
    this.bubble = null;
    this.stage = -1;
    this.lastBeat = -1;
  }

  /** the resident of an address (a household member doll), made once per stop */
  resident(aid, hid) {
    if (this.resAid === aid && this.resHid === hid && this.res) return this.res;
    if (this.res) this.res.destroy();
    this.res = this.view.dolls.resident(aid, hid);
    this.resAid = aid; this.resHid = hid;
    if (this.res) this.res.visible(false);
    return this.res;
  }

  hideAll() {
    this.rig.visible(false);
    if (this.res) this.res.visible(false);
    for (const b of this.boxes) b.setVisible(false);
    if (this.fly) this.fly.setVisible(false);
    if (this.bubble) this.bubble.hide();
  }

  /**
   * draw the courier at time t of a timeline. ctx: { tl, t, van: { x, y, dk }, vanArt: Van (points), dt, night, lang,
   * sled: bool, addr(aid) -> address, line(aid, hid, o) -> string, joy(x, y, coins), quiet }
   * Returns the van patch to show: { anim, f } | null and whether the driver is in his seat.
   */
  draw(ctx) {
    const tl = ctx.tl, t = ctx.t;
    if (!tl) { this.hideAll(); return { patch: null, driverIn: true }; }
    let bi = tl.beats.findIndex((b) => t >= b.t0 && t < b.t1);
    if (bi < 0) bi = t >= tl.T ? tl.beats.length - 1 : 0;
    const b = tl.beats[bi];
    const u = Math.max(0, Math.min(1, (t - b.t0) / Math.max(0.001, b.t1 - b.t0)));
    const vanDoor = ctx.vanArt ? ctx.vanArt.point(ctx.van, 'doorPoints', 0) : { x: ctx.van.x + 30, y: ctx.van.y + 30 };
    const rear = ctx.vanArt ? ctx.vanArt.point(ctx.van, 'rearDoorPoint') : { x: ctx.van.x - 60, y: ctx.van.y };
    const R = this.rig;
    let patch = null, driverIn = false, show = true, x = vanDoor.x, y = vanDoor.y, dir = 'S', anim = 'idle', alpha = 1, carry = b.carry || 0;
    const prevWalk = (k) => { for (let q = k - 1; q >= 0; q--) if (tl.beats[q].k === 'walk') return tl.beats[q]; return null; };
    const standAt = (wb, back = 0.75) => { if (!wb) return { x, y, dx: 1, dy: -0.5 }; const pts = this.fixWalk(wb, rear); const L = LEN(pts) / 64; return along(pts, Math.max(0, 1 - back / Math.max(0.5, L))); };
    const doorOf = (aid) => { const a = ctx.addr(aid); return a ? a.door : { x, y }; };
    switch (b.k) {
      case 'park':
        patch = ctx.sled ? null : { anim: 'door', f: Math.min(2, Math.floor(u * 3.2)) };
        show = u > 0.55; alpha = Math.min(1, (u - 0.55) / 0.3); dir = dollDir(vanDoor.x - ctx.van.x, vanDoor.y - ctx.van.y);
        break;
      case 'take': {
        patch = ctx.sled ? null : { anim: 'unload', f: Math.min(3, Math.floor(u * 4.5)) };
        const p = { x: vanDoor.x + (rear.x - vanDoor.x) * Math.min(1, u * 1.6), y: vanDoor.y + (rear.y - vanDoor.y) * Math.min(1, u * 1.6) };
        x = p.x; y = p.y; dir = dollDir(rear.x - vanDoor.x, rear.y - vanDoor.y); anim = u < 0.62 ? 'walk' : 'idle';
        if (u >= 0.62) { anim = 'carry_parcel'; dir = 'S'; }
        carry = u >= 0.62 ? b.carry : 0;
        if (this.lastBeat !== bi && u > 0.6) this.cue(bi, 'scan', () => this.view.sound('sfx_gb_scan', x, y));
        break;
      }
      case 'walk': case 'back': {
        patch = ctx.sled ? null : { anim: 'unload', f: 3 };
        const pts = this.fixWalk(b, b.k === 'walk' ? (prevWalk(bi) ? null : rear) : null, b.k === 'back' ? vanDoor : null);
        const q = along(pts, u);
        x = q.x; y = q.y; dir = dollDir(q.dx, q.dy);
        anim = b.k === 'walk' ? 'carry_parcel' : 'walk';
        if (b.k === 'back') carry = 0;
        break;
      }
      case 'ring': case 'open': case 'hand': case 'joy': case 'drop': case 'photo': case 'inside': case 'fill': {
        patch = ctx.sled ? null : { anim: 'unload', f: 3 };
        const wb = prevWalk(bi);
        const door = doorOf(b.aid);
        const st = b.k === 'inside' ? standAt(wb, Math.max(0, 0.75 - u * 0.9)) : standAt(wb);
        x = st.x; y = st.y;
        dir = dollDir(door.x - x, door.y - y);
        if (b.k === 'ring') { anim = 'ring_doorbell'; if (u > 0.2) this.cue(bi, 'bell', () => this.ring(x, y, dir)); if (this.lastBeat !== bi) this.say(this.rig, ctx.quiet ? null : gt('gb_ring', null, ctx.lang), x, y, 1.6, bi); }
        else if (b.k === 'open') { anim = 'idle'; }
        else if (b.k === 'hand') { anim = 'hand_parcel'; }
        else if (b.k === 'joy') { anim = 'wave'; carry = b.carry || 0; }
        else if (b.k === 'drop') {
          anim = 'idle';
          // (the 16 doorstep boxes are taken: "옆집에 맡겼어요" — the parcel went to a neighbour)
          const nb = b.ids && this.view.hows && b.ids.some((id) => this.view.hows.get(id) === 'neighbour');
          if (this.lastBeat !== bi) this.say(this.rig, gt(nb ? 'gb_neighbour' : 'gb_doorstep', null, ctx.lang), x, y, 1.6, bi);
          if (u > 0.4) this.cue(bi, 'thump', () => this.view.sound('sfx_gb_thump', door.x, door.y));
        }
        else if (b.k === 'photo') { anim = 'idle'; if (u > 0.3) this.cue(bi, 'flash', () => this.view.flash(door.x, door.y - 20, b.aid)); }
        else if (b.k === 'inside') { anim = 'carry_parcel'; alpha = u < 0.3 ? 1 - u / 0.3 : u > 0.75 ? (u - 0.75) / 0.25 : 0; if (u > 0.75) { anim = 'walk'; carry = Math.max(0, (b.carry || 0) - (b.ids ? b.ids.length : 0)); } }
        else if (b.k === 'fill') { anim = 'idle'; if (u > 0.3) this.cue(bi, 'click', () => this.view.sound('sfx_gb_locker', door.x, door.y)); }
        // the resident at the door
        const meet = (b.k === 'open' || b.k === 'hand' || b.k === 'joy');
        const res = meet ? this.resident(b.aid, ctx.hidOf(b.aid)) : null;
        if (res) {
          const ra = b.k === 'open' ? Math.min(1, u * 1.6) : b.k === 'joy' && u > 0.82 ? Math.max(0, 1 - (u - 0.82) / 0.18) : 1;
          res.visible(true);
          res.play(b.k === 'joy' ? 'happy' : 'idle', dollDir(x - door.x, y - door.y));
          res.place(door.x, door.y - 2, door.y - 2, ra);
          if (b.k === 'joy') this.cue(bi, 'joy', () => {
            this.view.hearts(door.x, door.y - 95); ctx.joy(door.x, door.y, b);
            const ln = ctx.line(b.aid, ctx.hidOf(b.aid), b);
            if (Array.isArray(ln)) {
              // two bubbles: the child asks at the door, the parent (or the driver) answers a moment later
              this.say(res, ln[0], door.x, door.y, 1.6, bi + 0.5);
              const ax = ln[2] === 'driver' ? x : door.x + 34, ay = ln[2] === 'driver' ? y : door.y + 8;
              this.later(1.15, () => this.say2(ln[1], ax, ay, 2.0));
            } else this.say(res, ln, door.x, door.y, 2.4, bi + 0.5);
          });
        } else if (this.res) this.res.visible(false);
        // the handed parcel flies from the courier's hands to the resident
        if (b.k === 'hand') {
          if (!this.fly) { const s = spriteOf(parcelKey('m')); if (s) this.fly = this.scene.add.image(0, 0, s.tex, s.frame).setOrigin(0.5, 0.75); }
          if (this.fly) {
            const hp = (R.handPoint && R.handPoint()) || [10, -40];
            const fx = x + hp[0], fy = y + hp[1] + 14, tx = door.x, ty = door.y - 34, f = Math.min(1, Math.max(0, (u - 0.35) / 0.55));
            const ps = spriteOf(parcelKey(b.size || 'm'));
            this.fly.setTexture(ps.tex, ps.frame).setVisible(true).setScale(0.6).setPosition(fx + (tx - fx) * f, fy + (ty - fy) * f - Math.sin(f * Math.PI) * 18).setDepth(Math.max(y, door.y) + 0.006);
          }
          carry = u < 0.35 ? (b.carry || 0) : Math.max(0, (b.carry || 0) - (b.ids ? b.ids.length : 0));
        } else if (b.k === 'joy' && this.fly) { this.fly.setVisible(true).setPosition(door.x, door.y - 34).setDepth(door.y + 0.006).setAlpha(this.res ? this.res.alpha || 1 : 1); }
        else if (this.fly) this.fly.setVisible(false);
        break;
      }
      case 'fetch': show = false; patch = ctx.sled ? null : { anim: 'unload', f: 3 }; break;
      case 'in':
        patch = ctx.sled ? null : u < 0.5 ? { anim: 'unload', f: Math.max(0, 3 - Math.floor(u * 8)) } : { anim: 'door', f: Math.max(0, 2 - Math.floor((u - 0.5) * 6)) };
        show = u < 0.45; alpha = 1 - u / 0.45; dir = dollDir(ctx.van.x - vanDoor.x, ctx.van.y - vanDoor.y);
        driverIn = u > 0.8;
        break;
      default: break;
    }
    if (b.k !== 'hand' && b.k !== 'joy' && this.fly) this.fly.setVisible(false);
    if (!(b.k === 'open' || b.k === 'hand' || b.k === 'joy') && this.res) this.res.visible(false);
    // the courier
    if (show) {
      R.visible(true);
      R.play(anim, dir, { noItems: carry <= 0 });
      R.place(x, y, y, alpha);
      this.px = x; this.py = y;                 // (Follow frames the courier and the door)
    } else R.visible(false);
    this.stack(show ? carry : 0, x, y, b.size, alpha);
    this.lastBeat = bi;
    if (this.bubble) this.bubble.tick(ctx.dt || 0);
    return { patch, driverIn };
  }

  /** the walk polyline with its ends moved onto the art (the rear doors / the driver's door) */
  fixWalk(b, start, end) {
    const pts = b.pts.slice();
    if (start) pts[0] = start;
    if (end) pts[pts.length - 1] = end;
    return pts;
  }

  /** boxes beyond the one the doll holds, stacked on it (carry_parcel / ring_doorbell boxPoint) */
  stack(n, x, y, size, alpha) {
    const extra = Math.max(0, Math.min(2, n - 1));
    const R = this.rig;
    const bp = extra > 0 && R.parcelPoint ? R.parcelPoint() : null;
    while (this.boxes.length < extra) { const s = spriteOf(parcelKey('s')); if (!s) break; this.boxes.push(this.scene.add.image(0, 0, s.tex, s.frame).setOrigin(0.5, 0.75)); }
    for (let k = 0; k < this.boxes.length; k++) {
      const im = this.boxes[k];
      if (k >= extra || !bp) { im.setVisible(false); continue; }
      const step = 12;
      const dep = R.parcelDepth ? R.parcelDepth() : 0.0045;
      im.setVisible(true).setScale(0.5).setPosition(x + bp[0], y + bp[1] - 10 - step * (k + 1)).setDepth(y + (dep !== null && dep < 0 ? -0.0001 : 0.0046)).setAlpha(alpha);
    }
    void size;
  }

  /** once per beat (re-entering a beat after a pause never repeats it) */
  cue(bi, what, fn) { const k = bi + ':' + what; if (this.cued === undefined) this.cued = new Set(); if (this.cued.has(k)) return; this.cued.add(k); if (this.cued.size > 64) this.cued = new Set([k]); fn(); }
  reset() { this.cued = new Set(); this.lastBeat = -1; this.saidKey = null; }
  /** a line said away from the doorstep (the van leaving) fades on its own clock */
  tickBubble(dt) { if (this.bubble) this.bubble.tick(dt); }

  /** 띵동: fx_gb_bell by its placement rule (size ≤ 24 CSS and ≤ 0.7 × the courier; above the head, toward the door) */
  ring(x, y, dir) {
    this.view.sound('sfx_gb_doorbell', x, y);
    const def = Assets.def('fx_gb_bell');
    if (!def || !def.atlas) return;
    const P = def.placement || { cssMax: 24, worldMax: 56, headTopY: -86, gap: 4, xFromBell: 10 };
    const cpw = this.view.cssPerWorld();
    const S = Math.min(P.cssMax / Math.max(0.01, cpw), P.worldMax);
    const bp = (this.rig.bellPoint && this.rig.bellPoint()) || [12, -40];
    const sign = Math.sign(bp[0]) || 1;
    const away = dir === 'NE' || dir === 'N' || dir === 'NW';
    const bx = x + bp[0] + (P.xFromBell || 10) * sign, bottom = y + (P.headTopY || -86) - (P.gap || 4), by = bottom - 0.4 * S;
    if (!this.bell) { const f = frameOf(def.atlas, def.frameNames[0]); if (!f) return; this.bell = this.scene.add.image(0, 0, f.tex, f.frame); }
    const frames = def.frameNames;
    this.bell.setVisible(true).setAlpha(1).setScale(S / 64).setPosition(bx, by).setDepth(away ? y - 0.0001 : DEPTH.BUBBLE - 5);
    let t = 0;
    const tick = (dt) => {
      t += dt;
      const fps = 12, dong = (P.dong && P.dong.atS) || 0.33;
      let i;
      if (t < dong) i = Math.min(3, Math.floor(t * fps));
      else { const r = [1, 2, 3]; const k = Math.floor((t - dong) * fps); i = k < r.length ? r[k] : 3; }
      const f = frameOf(def.atlas, frames[i]); if (f) this.bell.setTexture(f.tex, f.frame);
      const fade = (P.dong && P.dong.fadeS) || 0.32, tot = (P.dong && P.dong.totalS) || 0.9;
      if (t > tot - fade) this.bell.setAlpha(Math.max(0, (tot - t) / fade));
      if (t >= tot) { this.bell.setVisible(false); return true; }
      return false;
    };
    this.view.addTicker(tick);
  }

  /** a speech bubble over a doll (one at a time per courier) */
  say(rig, text, x, y, secs, key) {
    if (!text || this.saidKey === key) return;
    this.saidKey = key;
    if (!this.bubble) this.bubble = new SpeechBubble(this.view);
    this.bubble.show(text, x, y - 96, secs);
  }

  /** fn after s seconds (view time) */
  later(s, fn) { let t = 0; this.view.addTicker((dt) => { t += dt; if (t >= s) { fn(); return true; } return false; }); }
  /** the answer bubble (a second speaker at the same door) */
  say2(text, x, y, secs) {
    if (!text) return;
    if (!this.bubble2) this.bubble2 = new SpeechBubble(this.view);
    this.bubble2.show(text, x, y - 96, secs);
    const b = this.bubble2;
    this.view.addTicker((dt) => { b.tick(dt); return b.left <= 0; });
  }

  objects() { return this.boxes.length + (this.fly ? 1 : 0) + (this.bell ? 1 : 0) + (this.bubble ? 2 : 0) + (this.bubble2 ? 2 : 0); }

  destroy() {
    this.rig.destroy(); if (this.res) this.res.destroy();
    for (const b of this.boxes) b.destroy();
    if (this.fly) this.fly.destroy(); if (this.bell) this.bell.destroy(); if (this.bubble) this.bubble.destroy(); if (this.bubble2) this.bubble2.destroy();
  }
}

/** a soft cream speech bubble with a tail, constant on-screen size (1 graphics + 1 text) */
export class SpeechBubble {
  constructor(view) {
    this.view = view; const sc = view.scene;
    this.g = sc.add.graphics().setDepth(DEPTH.BUBBLE).setVisible(false);
    // the text is set at 2x and drawn at half scale (crisp on a DPR 3 phone)
    this.t = sc.add.text(0, 0, '', textStyle(44, '#3b3f52', '#ffffff', 0, '800')).setOrigin(0.5, 0.5).setDepth(DEPTH.BUBBLE + 1).setVisible(false);
    this.left = 0;
  }
  show(text, x, y, secs) {
    this.t.setText(text).setWordWrapWidth(700, true).setAlign('center');
    this.x = x; this.y = y; this.left = secs; this.age = 0;
    this.draw();
  }
  draw() {
    const z = this.view.zoomWorld();
    const s = 1 / Math.max(0.3, z);
    const w = this.t.width * 0.5 + 28, h = this.t.height * 0.5 + 18;
    const pop = Math.min(1, this.age / 0.14);
    const k = s * (0.85 + 0.15 * pop);
    this.g.clear().setVisible(true).setPosition(this.x, this.y).setScale(k);
    this.g.fillStyle(0x1d2b44, 0.16).fillRoundedRect(-w / 2 + 2, -h + 4, w, h, 16);
    this.g.fillStyle(0xfffbf3, 0.97).fillRoundedRect(-w / 2, -h, w, h, 16).lineStyle(3, 0xd9962a, 1).strokeRoundedRect(-w / 2, -h, w, h, 16);
    this.g.fillStyle(0xfffbf3, 1).fillTriangle(-9, -2, 9, -2, 0, 12).lineStyle(3, 0xd9962a, 1).lineBetween(-9, -1, 0, 12).lineBetween(9, -1, 0, 12);
    this.t.setVisible(true).setPosition(this.x, this.y - (h / 2) * k).setScale(k * 0.5).setAlpha(1);
  }
  tick(dt) {
    if (this.left <= 0) { this.hide(); return; }
    this.left -= dt; this.age += dt;
    this.draw();
    if (this.left < 0.25) { const a = Math.max(0, this.left / 0.25); this.g.setAlpha(a); this.t.setAlpha(a); } else { this.g.setAlpha(1); }
  }
  hide() { this.g.setVisible(false); this.t.setVisible(false); this.left = 0; }
  destroy() { this.g.destroy(); this.t.destroy(); }
}
