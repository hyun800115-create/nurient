// Cash register (v2): the spot at a seller where someone has to stand so customers (market) or the
// merchant (trade post) pay and leave. The chief can stand on the register pad himself; a hired
// clerk takes over for good (stands at the counter's staff point and plays `serve`).

import { Assets } from '../core/Assets.js';
import { BALANCE } from '../data/balance.js';
import { t } from '../data/strings.js';
import { gdist, dirFromVec, DIRS8 } from '../core/Iso.js';
import { Pad } from './Pad.js';
import { Character } from './Character.js';
import { panel } from '../core/Panel.js';

export class Register {
  /**
   * seller: Market | TradePost, cfg: its world.js entry (register, staff, clerk keys),
   * art: the seller's sprite key (staff points come from `<art>_staff` in the buildings manifest)
   */
  constructor(gs, seller, cfg, art) {
    this.gs = gs; this.seller = seller;
    const off = cfg.register || [-90, -40];
    this.x = seller.x + off[0]; this.y = seller.y + off[1];
    const tex = Assets.pick('ui_pad_register', 'ui_pad_unlock');
    const real = tex === 'ui_pad_register';
    this.pad = new Pad(gs, this.x, this.y, 'register', 1.3, {
      tex, tint: real ? undefined : 0xbfe0ff,
      icon: real ? null : Assets.pick('ui_icon_clerk', 'ui_icon_coin'), iconSize: 38,
    });
    if (this.pad.icon) this.pad.icon.setAlpha(0.8);
    // small floating label "계산대"
    const lab = gs.add.container(this.x, this.y - 46).setDepth(this.y + 1990);
    this.labelText = gs.add.text(0, 0, '', { fontFamily: gs.font, fontSize: '19px', fontStyle: '800', color: '#2b2f3a', resolution: 2 }).setOrigin(0.5, 0.5);
    this.labelBg = panel(gs, 0, 0, 'ui_panel', 100, 40).setOrigin(0.5, 0.5).setAlpha(0.92);
    lab.add([this.labelBg, this.labelText]);
    this.label = lab;
    this.labelBaseY = this.y - 46;
    // ((v4.3 step B, M) a register may carry its own label word (the 자재 counter's second window: 「계산대 2」)
    this.labelKey = cfg.labelKey || 'register';
    this.refresh();
    // where a clerk stands: the art's staff point (buildings manifest: `<art>_staff` for the v1 stalls,
    // the building's own staffPoints for the v3 shops) or our own offset
    const sd0 = Assets.def(art + '_staff'), ad = Assets.def(art);
    const sd = sd0 && Array.isArray(sd0.staffPoints) ? sd0 : ad;
    const sp = sd && Array.isArray(sd.staffPoints) && sd.staffPoints.find((q) => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1]) && (!cfg.avoid || gdist(seller.x + q[0], seller.y + q[1], seller.x + cfg.avoid[0], seller.y + cfg.avoid[1]) > 40));
    // ((v4.3) a counter of the staged shop gives its own staff point (staffAt: the art's staffPoints[k] of its counter))
    const so = cfg.staffAt || sp || cfg.staff || off;
    this.staff = { x: seller.x + so[0], y: seller.y + so[1] };
    this.staffDir = sd && Array.isArray(sd.staffDirs) ? sd.staffDirs[0] : null;
    // (v3) a clerk standing INSIDE a shop (staffDepth "front"): shop at depth d, clerk d + 0.5, then the
    // shop's front overlay (its counter) at d + 1 so the counter hides the clerk's legs
    this.frontDepth = sd && sd.staffDepth === 'front' ? seller.y + 0.5 : null;
    // ((v4.2.0.2) the stage-1 stall: the clerk stands on a 12 cm plank step behind the 0.6 m counter (the art's
    //  stepLiftPx): drawn that much higher while at the post, so the counter hides only her legs, not her apron)
    this.stepLift = sd && Number.isFinite(sd.stepLiftPx) ? Math.max(0, Math.min(20, sd.stepLiftPx)) : 0;
    // ((v4.2.0.2 fix STALL-C1) on the stall's step the clerk keeps her art's staff direction (SW: 3/4 to the camera,
    //  face, apron and name tag in view) for anyone within one 45° step of it: the front customer stands front-left,
    //  which reads as W (side-on, face under the cap). Only someone further off makes her turn fully)
    this.holdDir = this.stepLift && this.staffDir ? DIRS8.indexOf(this.staffDir) : -1;
    this.overlay = null;
    // ((v4.3) the staged shop draws its front layer itself, once for all its counters: cfg.noOverlay)
    if (ad && ad.overlay && Assets.m.sprites[ad.overlay] && !cfg.noOverlay) {
      this.overlay = Assets.image(gs, seller.x, seller.y, ad.overlay).setDepth(seller.y + 1);
      if (gs.lazyImage) gs.lazyImage(this.overlay, ad.overlay);
    }
    this.clerkKeys = cfg.clerk || ['npc_aunt'];
    this.clerk = null;
    this.chief = false;
    this.enabled = true;
    this.onT = 0;
  }

  /**
   * ((v4.3) the shop grew a stage: the register pad, its label and the clerk's post move with its counter.
   * x, y = the pad; staff = { x, y } the clerk's post; art = the stage's sprite key (step lift, held direction);
   * depthY = the shop's depth (the clerk is drawn between its back and front layers); instant = no walk (a reload)
   */
  place(x, y, staff, art, depthY, instant) {
    this.x = x; this.y = y;
    this.pad.x = x; this.pad.y = y;
    this.pad.img.setPosition(x, y);
    if (this.pad.icon) this.pad.icon.setPosition(x, y);
    this.labelBaseY = y - 46;
    this.label.setPosition(x, this.labelBaseY).setDepth(y + 1990);
    this.staff = { x: staff.x, y: staff.y };
    const ad = Assets.def(art), sd0 = Assets.def(art + '_staff');
    const sd = sd0 && Array.isArray(sd0.staffPoints) ? sd0 : ad;
    this.staffDir = sd && Array.isArray(sd.staffDirs) ? sd.staffDirs[0] : null;
    this.frontDepth = sd && sd.staffDepth === 'front' ? depthY + 0.5 : null;
    this.stepLift = sd && Number.isFinite(sd.stepLiftPx) ? Math.max(0, Math.min(20, sd.stepLiftPx)) : 0;
    this.holdDir = this.stepLift && this.staffDir ? DIRS8.indexOf(this.staffDir) : -1;
    // (the clerk steps to the new post at once: the shop rebuilds around her in a puff of snow; a clerk still on her way
    //  in keeps walking, to the new post)
    const c = this.clerk;
    if (c && (instant || c.state === 'post')) c.arrive();
  }

  refresh() {
    this.labelText.setText(t(this.labelKey || 'register'));
    this.labelBg.setSize(Math.max(84, this.labelText.width + 34), 40);
  }

  /** someone is taking payments right now */
  get staffed() { return this.enabled && (this.chief || !!(this.clerk && this.clerk.ready)); }

  setEnabled(v) {
    this.enabled = v;
    const show = v && !this.clerk;
    this.pad.setVisible(show); this.label.setVisible(show);
    if (this.overlay) this.overlay.setVisible(v);
    if (this.clerk) { this.clerk.sprite.setVisible(v); this.clerk.shadow.setVisible(v); }
  }

  revealObjects() { const o = this.clerk ? [this.pad.img] : [this.pad.img, this.label]; if (this.overlay) o.push(this.overlay); return o; }

  /** returns true while the chief stands on the pad */
  update(dt) {
    const gs = this.gs, p = gs.player;
    if (this.clerk) this.clerk.update(dt);
    if (!this.enabled || this.clerk) { this.chief = false; return false; }
    const on = this.pad.contains(p.x, p.y);
    this.chief = on;
    this.label.y = this.labelBaseY + Math.sin(gs.time.now / 430 + 2.1) * 3;
    // ((v4.3 verify LOOK-8) the chief on the pad: the name goes (at 0.3 it was still drawn across his body)
    const la = on ? 0 : 1;
    if (this.label.alpha !== la) this.label.setAlpha(Math.abs(la - this.label.alpha) < 0.01 ? la : this.label.alpha + (la - this.label.alpha) * Math.min(1, dt * 10));
    if (on) {
      this.onT += dt;
      // the chief turns to the customer he is serving
      const tg = this.seller.payTarget && this.seller.payTarget();
      if (tg && p.vx === 0 && p.vy === 0 && !p.node) p.faceTo(tg.x, tg.y);
    } else this.onT = 0;
    return on;
  }

  /** a payment happened (customer / merchant `who` paid) */
  onPay(who) {
    const gs = this.gs;
    if (this.clerk && this.clerk.ready) this.clerk.serve(who);
    else {
      this.pad.pulse();
      gs.sfxAt(Assets.audioDef('sfx_register') ? 'sfx_register' : 'sfx_cash', this.x, this.y, { volume: 0.55, throttle: 200 });
    }
  }

  /** hire a clerk: walks from (x, y) to the staff point (instant: stands there already) */
  hireClerk(instant, x, y) {
    if (this.clerk) return this.clerk;
    const gs = this.gs;
    const want = this.clerkKeys.find((k) => Assets.charReady(k) || Assets.charPending(k)) || this.clerkKeys[this.clerkKeys.length - 1];
    let key = want;
    if (!Assets.charReady(want)) key = this.clerkKeys.find((k) => Assets.charReady(k)) || 'villager_a';
    const sx = instant || x === undefined ? this.staff.x : x, sy = instant || y === undefined ? this.staff.y : y;
    const c = new Clerk(gs, this, key, sx, sy);
    c.wantKey = want !== key ? want : null;
    if (instant) c.arrive();
    else {
      gs.effects.sheet('fx_poof', c.x, c.y - 30, { size: 170 });
      c.sprite.setScale(0.1);
      gs.tweens.add({ targets: c.sprite, scale: 1, duration: 420, ease: 'Back.easeOut' });
    }
    this.clerk = c;
    gs.keysInUse.add(key);
    if (c.wantKey) gs.keysInUse.add(c.wantKey);     // reserved: the resident with that look stays away
    if (gs.life) { gs.life.release(key); if (c.wantKey) gs.life.release(c.wantKey); }
    this.pad.setVisible(false); this.label.setVisible(false);
    return c;
  }
}

// ------------------------------------------------------------------ clerk
export class Clerk extends Character {
  constructor(gs, register, key, x, y) {
    super(gs, key, x, y, { radius: 13, dir: 1 });
    this.register = register;
    this.onImpact = () => { if (this.pendingRing) this.ring(); };
    this.state = 'go';
    this.serveT = 0;
    this.idleT = 2 + Math.random() * 4;
    this.checkT = 0;
    this.noXray = true;       // standing behind the counter is the intended look
  }

  get ready() { return this.state === 'post'; }

  arrive() {
    const s = this.register.staff;
    this.x = s.x; this.y = s.y;
    this.state = 'post';
    this.vx = this.vy = 0;
    this.faceFront();
    this.play('idle', true);
    this.sync(0);
  }

  faceFront() {
    const tg = this.register.seller.payTarget && this.register.seller.payTarget();
    if (tg) this.faceServe(tg.x, tg.y);
    else { const f = this.register.seller.front; this.faceServe(this.x + (f ? f[0] : -40), this.y + (f ? f[1] : 20)); }
  }

  /** ((v4.2.0.2 fix STALL-C1) turn toward (x, y); at a post with a held direction (the stall, Register.holdDir) she
   *  keeps that direction for anything within one 45° step of it */
  faceServe(x, y) {
    const h = this.register ? this.register.holdDir : -1, dx = x - this.x, dy = y - this.y;
    if (h >= 0 && Math.abs(dx) + Math.abs(dy) >= 0.001) {
      const k = (dirFromVec(dx, dy) - h + 8) % 8;
      if (Math.min(k, 8 - k) <= 1) {
        if (this.dir !== h) { this.dir = h; this.play(this.animName, false, true); }
        return;
      }
    }
    this.faceTo(x, y);
  }

  /** a customer paid: hand the goods over (serve anim); the register rings at the hand-over frame */
  serve(who) {
    const gs = this.gs;
    if (who) this.faceServe(who.x, who.y);
    this.play('serve', true);
    this.serveT = Math.max(0.5, Assets.animDuration(this.key, 'serve'));
    const ad = this.def.anims[this.animRes];
    if (this.animRes === 'serve' && ad && ad.impactFrame !== undefined) this.pendingRing = true;
    else this.ring();
  }

  /** cha-ching (serve's impactFrame = the moment the bag is handed over) */
  ring() {
    const gs = this.gs;
    this.pendingRing = false;
    gs.sfxAt(Assets.audioDef('sfx_register') ? 'sfx_register' : 'sfx_cash', this.x, this.y, { volume: 0.5, throttle: 200 });
    if (gs.isOnScreen(this.x, this.y, 60)) { const ip = this.impactPoint(); gs.effects.burst('coin', ip.x, ip.y - 4, 2); }
  }

  /** depth: inside a shop the clerk sits between the shop and its counter overlay; on a stall's step she stands
   *  stepLift px higher (stepping up over her last 24 px to the post) */
  sync(dt) {
    super.sync(dt);
    const R = this.register, L = R ? R.stepLift : 0;
    if (L) {
      const s = R.staff, d = Math.hypot(this.x - s.x, (this.y - s.y) * 2);
      const ly = this.state === 'post' ? L : d < 24 ? L * (1 - d / 24) : 0;
      if (ly) { this.sprite.y -= ly; this.shadow.y -= ly; }
      this.stepY = ly;
    }
    const fd = this.register ? this.register.frontDepth : null;
    if (fd !== null && fd !== undefined && this.state === 'post' && this.sprite.depth !== fd) this.sprite.setDepth(fd);
  }

  update(dt) {
    const gs = this.gs;
    // the real clerk art arrived (loaded after the title): swap it in
    if (this.wantKey) {
      this.checkT -= dt;
      if (this.checkT <= 0) {
        this.checkT = 1;
        if (Assets.charReady(this.wantKey)) { gs.keysInUse.delete(this.key); this.reskin(this.wantKey); gs.keysInUse.add(this.wantKey); this.wantKey = null; this.faceFront(); }
      }
    }
    if (this.state === 'go') {
      const s = this.register.staff;
      const d = gdist(this.x, this.y, s.x, s.y);
      if (d > 120) gs.moveAgent(this, s.x, s.y, BALANCE.workers.speed, dt, 10);
      else {
        // last steps behind the counter: no collision push-out
        const dx = s.x - this.x, dy = s.y - this.y, L = Math.hypot(dx, dy);
        const step = Math.min(L, BALANCE.workers.speed * 0.8 * dt);
        if (L > 0.5) { this.vx = (dx / L) * 100; this.vy = (dy / L) * 100; this.x += (dx / L) * step; this.y += (dy / L) * step; this.face(dx, dy); this.locomotion(true); }
        if (L - step < 2) { this.arrive(); this.play('wave', true); this.serveT = 1.2; }
      }
    } else {
      this.vx = this.vy = 0;
      if (this.serveT > 0) { this.serveT -= dt; if (this.serveT <= 0) { if (this.pendingRing) this.ring(); this.faceFront(); this.play('idle'); } }
      else {
        this.idleT -= dt;
        if (this.idleT <= 0) {
          this.idleT = 5 + Math.random() * 7;
          // little signs of life while waiting: greet the next customer / look around
          const r = Math.random();
          this.faceFront();
          if (r < 0.35) { this.play('wave', true); this.serveT = 1.1; }
          else if (r < 0.55 && Assets.hasAnim(this.key, 'bow')) { this.play('bow', true); this.serveT = Assets.animDuration(this.key, 'bow'); }
        }
      }
    }
    this.sync(dt);
  }
}
