// (v4.3 「마을 새 단장」, docs/redesign_v43/engineering_plan.md §4.1) 낚시 좌대 — the fishing deck that replaces the net.
//
// A wooden deck on the water at the end of a plank gangway (world.js WORLD.deck). It keeps the surface every caller of the
// old Net used (Game.findGatherable, Player, Tutorial, Onboarding, the bots, ghostsweep): kind 'net', item, max, stock,
// fish[] (one item picture per fish it holds), gather (= the chief's reel spot: (v4.3 sea) on his landing at the water's edge), ready(),
// hit(), fishPos(), update(), img.
//   pool     max 6, one more every 1.1 s (balance.js resources.net, unchanged) — shown on the three rod holders: a rod
//            holds up to two fish (0 = the float bobs, 1 = a bite: the float dips and a fish splashes at it, 2 = hooked:
//            the rod bends and both fish dangle from the line)
//   chief    on the reel spot he plays `reel` once (balance.js deck.reelS 0.6 s: its impact frame takes the first fish, so
//            the first sale is not slower), then today's pickup interval runs (the harvest loop, one fish a beat)
//   fishers  sit on the deck's stools (one per tier: hire_fisherman / hire2 / hire3 grow the deck to 2단 / 3단, 3단 has a
//            small roof) and catch on their own (Worker.updateDeck): their fish fly to the fish crate on land (the `fish`
//            collection pile: its id and save field are unchanged; the raw porters never step on the deck)
//   lane     only the fishers walk on the deck, along a scripted lane (foot -> gangway -> stool) with their collision
//            off; nobody else paths onto the water (Paths / Navigator know nothing of it)
//   landing  ((v4.3 「바다 가까이」, the designer: "낚시를 너무 멀리서 하는데 바다 가까이 가야지") the chief's spot is a
//            little wooden landing at the surf line right of the gangway's head, by the deck's front corner (world.js
//            deck.landing, art deck43_landing; the east side: from the gangway foot's west side the first sale was slower):
//            he stands on it facing the sea, casts his own line to a float on the water (a splash ring where it lands),
//            keeps reeling (`fish`: one fish a 0.6 s, today's beat) and each fish leaps from his float to him. The
//            planks and the snow between them and the shore's walk line are the CHIEF's ground only (Collision.addLand:
//            beyond the walk line nobody else walks there; the polygon's land side overlaps ordinary land by a 14 px
//            band so he steps on and off without a seam)
//   depth    an interior (gs.interiors): whoever is on the deck (ch.onDeck) is drawn between the deck's back layer and
//            its front layer (railings, roof) and lifted to the planks (lift px)
// Art (assets/deck43, tools/blender/deck43_*.py): deck43_t{1,2,3}_back / _front, deck43_rod (idle / bite / hooked). While
// a picture is missing the deck is drawn with plain shapes (never a placeholder box in the sea).

import { Assets } from '../core/Assets.js';
import { BALANCE } from '../data/balance.js';
import { t } from '../data/strings.js';
import { DEPTH } from '../systems/DepthSort.js';
import { Pad } from './Pad.js';

const DB = () => BALANCE.deck || {};
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
// rod frames (deck43_rod_<state>): the tip of the rod per state, px from the holder's anchor (used until the manifest has tipPoints)
const ROD_TIP = { idle: [30, -62], bite: [32, -56], hooked: [16, -74] };
// ((v4.3 sea) the chief's rod tip from his feet while his `fish` frames are not here (harvest plays: his hands)
const CHIEF_TIP = [24, -66];
const gd = (ax, ay, bx, by) => Math.hypot(ax - bx, (ay - by) * 2);

export class FishingDeck {
  constructor(gs, cfg) {
    this.gs = gs; this.cfg = cfg;
    // ---- the Net surface
    this.kind = 'net'; this.item = 'item_fish_raw'; this.workerKey = 'fisherman'; this.playerAnim = 'harvest';
    this.x = cfg.x; this.y = cfg.y;
    this.enabled = true; this.reservedBy = null; this.standDist = 46;
    this.max = BALANCE.resources.net.max;
    this.stock = this.max;
    this.timer = 0;
    this.gather = { x: cfg.reel[0], y: cfg.reel[1] };
    this.fisherSpot = this.gather;                      // (old callers: the shore spot of the rod fishermen)
    // ---- the deck
    this.foot = { x: cfg.foot[0], y: cfg.foot[1] };
    this.lift = num(cfg.lift, 17);
    this.tier = 0;
    this.base = this.y - 90;                            // depth of the back layer (front = base + 0.6)
    this.reelT = 0;                                     // > 0 while the chief reels (the rods bend up together)
    this.t0 = Math.random() * 10;
    // the deck pictures (back / front), or the plain shapes while they are missing
    this.img = gs.add.image(this.x, this.y, '__WHITE').setVisible(false).setDepth(this.base);
    this.front = gs.add.image(this.x, this.y, '__WHITE').setVisible(false).setDepth(this.base + 0.6);
    this.plain = gs.add.graphics().setDepth(this.base - 0.01).setVisible(false);
    // the rods (holder pictures) + their lines and floats (drawn), the fish they hold
    this.rods = cfg.rods.map((q, k) => {
      const at = this.P(q[0], q[1]);
      const bob = this.P(q[0] + 0.64, q[1] + 0.64);
      const img = gs.add.image(at.x, at.y - this.lift, '__WHITE').setVisible(false).setDepth(this.base + 0.2 + k * 0.01);
      return { k, x: at.x, y: at.y, bob, img, state: 'idle', frame: '' };
    });
    this.lines = gs.add.graphics().setDepth(this.base + 0.25);
    this.fish = [];
    for (let i = 0; i < this.max; i++) {
      const f = gs.effects.takeItem('item_fish_raw');
      f.setScale(0.55).setDepth(this.base + 0.27);
      f.__hx = this.rods[Math.floor(i / 2) % 3].bob.x; f.__hy = this.rods[Math.floor(i / 2) % 3].bob.y;
      f.setPosition(f.__hx, f.__hy);
      this.fish.push(f);
    }
    // ((v4.3 sea) the chief's landing at the water's edge: its picture, his own ground, his line and float
    this.landCfg = cfg.landing || null;
    if (this.landCfg) this.buildLanding();
    // the chief's spot: a flat "stand here" pad (two footprints) under the reel spot ((v4.3 sea) on the landing's planks:
    //  a small mat, so the planks around it still read as his own little landing — review LANDING-READ: 0.75 covered most)
    this.pad = new Pad(gs, this.gather.x, this.gather.y, 'input', this.landCfg ? 0.62 : 1.25, { tex: Assets.pick('ui_pad_register', 'ui_pad_input'), tint: 0xcfe6ff, icon: 'item_fish_raw', iconSize: this.landCfg ? 20 : 30 });
    // (on the planks: the pad's picture lies on them, landLift px up; its reach stays at the spot)
    if (this.landCfg) { this.pad.img.y -= this.landLift; if (this.pad.icon) this.pad.icon.y -= this.landLift; }
    // the gangway's foot posts stand on the snow (nobody walks through them)
    this.obstacles = [this.P(cfg.gangway[0], -1.3 - 3.4), this.P(cfg.gangway[1], -1.3 - 3.4)].map((p) => gs.collision.add(p.x, p.y, 7, 'deck'));
    // water: foam collars at the posts (wired when the living water is there)
    this.contacts = [];
    this.setTier(1, false);
    (gs.interiors || (gs.interiors = [])).push(this);
    // the lantern at the gangway head: a night light (DayClock, Neighbours.attach)
    const fl = Assets.def('deck43_t1_back').fxPoints;
    if (fl && fl.lantern) (gs.lights43 || (gs.lights43 = [])).push({ x: this.x + fl.lantern[0], y: this.y + fl.lantern[1], k: 0.8 });
  }

  /** screen point of deck-local metres (mx along world X, my along world Y) from the tier-1 centre */
  P(mx, my) { return { x: Math.round(this.x + 45.25 * (mx + my)), y: Math.round(this.y + 22.63 * (mx - my)) }; }

  // ------------------------------------------------------------------ (v4.3 「바다 가까이」) the chief's landing
  /** landing-local metres -> screen point (the same axes as the deck: +Y = up-right, out to sea) */
  LP(mx, my) { const a = this.landAt; return { x: Math.round(a.x + 45.25 * (mx + my)), y: Math.round(a.y + 22.63 * (mx - my)) }; }

  buildLanding() {
    const gs = this.gs, c = this.landCfg, C = gs.collision;
    this.landAt = { x: c.at[0], y: c.at[1] };
    this.landLift = num(c.lift, 8);
    const pk = c.planks || [-0.5, 0.5, -0.6, 0.6], w = c.walk || [-0.3, 0.3, -0.42, 0.36];
    // the planks (his feet on them: lifted landLift px); his ground = the planks' inside + the snow behind them, fanning out
    // to the walkable land (so he walks on from the hut's side, the grill's side or straight up)
    this.plankPoly = [this.LP(pk[0], pk[2]), this.LP(pk[1], pk[2]), this.LP(pk[1], pk[3]), this.LP(pk[0], pk[3])];
    const top = this.LP(w[0], w[3]), right = this.LP(w[1], w[3]), left = this.LP(w[0], w[2]), f = num(c.fan, 20);
    const landPt = (x) => ({ x, y: Math.round((C ? C.shore(x) : top.y) + 46 + 14) });
    this.walkPoly = [top, right, landPt(right.x + f), landPt(left.x - f), left];
    // (review PILOT-WEDGE) its door: the middle of the land side, a step out on the snow (the pilot walks on from there)
    const la = this.walkPoly[2], lb = this.walkPoly[3];
    this.landDoor = { x: Math.round((la.x + lb.x) / 2), y: Math.round((la.y + lb.y) / 2 + 10) };
    this.land = C && C.addLand ? C.addLand(this.walkPoly, 'landing', this.landDoor) : null;
    // his float on the sea (bob), the picture (or plain planks while it is missing)
    this.bobAt = this.LP(c.bob ? c.bob[0] : 0, c.bob ? c.bob[1] : 1.75);
    this.landImg = gs.add.image(this.landAt.x, this.landAt.y, '__WHITE').setVisible(false).setDepth(DEPTH.GROUND_DECAL + 10);
    this.landPlain = gs.add.graphics().setDepth(DEPTH.GROUND_DECAL + 9).setVisible(false);
    // his line, float and the splash rings (drawn just behind him: the line goes away from the camera, out to sea)
    this.cline = gs.add.graphics().setDepth(this.landAt.y - 1);
    this.cast = { st: 'off', t: 0, ringT: 0, rings: [], bob: { x: this.bobAt.x, y: this.bobAt.y }, tip: null, n: 0 };
    this.applyLandArt();
  }

  /** the landing's picture (deck43_landing), again when its page arrives; plain planks meanwhile */
  applyLandArt() {
    if (!this.landCfg) return;
    const gs = this.gs, k = 'deck43_landing', art = Assets.has(k);
    if (art) { Assets.apply(this.landImg, k); this.landImg.setVisible(this.enabled); } else { this.landImg.setVisible(false); if (gs.lazyImage && Assets.pending(k)) gs.lazyImage(this.landImg, k, () => this.applyLandArt()); }
    const g = this.landPlain;
    g.clear();
    g.setVisible(!art && this.enabled);
    if (art) return;
    const L = this.landLift, P = this.plankPoly.map((q) => ({ x: q.x, y: q.y - L }));
    g.fillStyle(0x8a5e3c, 1).fillPoints(P.map((q) => ({ x: q.x, y: q.y + 5 })), true);
    g.fillStyle(0xc99a68, 1).fillPoints(P, true);
    g.lineStyle(1, 0xa77b52, 0.8);
    const pk = this.landCfg.planks || [-0.5, 0.5, -0.6, 0.6];
    for (let y = pk[2] + 0.24; y < pk[3]; y += 0.24) { const a = this.LP(pk[0], y), b = this.LP(pk[1], y); g.lineBetween(a.x, a.y - L, b.x, b.y - L); }
    g.fillStyle(0x6b4a33, 1);
    for (const x of [pk[0] + 0.05, pk[1] - 0.05]) { const q = this.LP(x, pk[3] - 0.02); g.fillRect(q.x - 3, q.y - L - 16, 6, 22); }
  }

  /** (tests / the bots) is (x, y) on the landing's planks? */
  onPlanks(x, y) {
    const P = this.plankPoly;
    if (!P) return false;
    let inside = false;
    for (let a = 0, b = P.length - 1; a < P.length; b = a++) { const p = P[a], q = P[b]; if ((p.y > y) !== (q.y > y) && x < ((q.x - p.x) * (y - p.y)) / ((q.y - p.y) || 1e-9) + p.x) inside = !inside; }
    return inside;
  }

  /** (Player) where the chief looks while he fishes: his float out on the sea */
  facePoint() { return this.landCfg ? this.bobAt : null; }
  /** (Player) the chief's anim while he gathers here: `fish` (the reel's motion without its short line, looping) */
  get chiefAnim() { return this.landCfg ? 'fish' : null; }

  /** the chief's rod tip now (his `fish` frame's tipPoint; his hands while that art is missing) */
  chiefTip(p) {
    const spr = p.sprite, a = p.animRes === 'fish' && p.def && p.def.anims && p.def.anims.fish;
    let off = CHIEF_TIP;
    const tp = a && a.tipPoints && (a.tipPoints.NE || a.tipPoints[Object.keys(a.tipPoints)[0]]);
    if (tp && tp.length) { const fr = spr.anims && spr.anims.currentFrame; off = tp[Math.max(0, Math.min(tp.length - 1, fr ? fr.index - 1 : 0))] || off; }
    return { x: spr.x + off[0] * (spr.flipX ? -1 : 1) * Math.abs(spr.scaleX || 1), y: spr.y + off[1] * Math.abs(spr.scaleY || 1) };
  }

  /** is the chief at his fishing spot now (on the landing's ground, near the spot, standing)? (with a full bag too: he
   *  keeps his line out until he walks away) */
  chiefHere(p) {
    if (!p || p.seat || p.action || (this.gs.collision && !this.gs.collision.inLand(p.x, p.y))) return false;
    return gd(p.x, p.y, this.gather.x, this.gather.y) < 55 && p.vx * p.vx + p.vy * p.vy < 25;
  }

  /** (Player via reel) the chief casts: his float flies from the rod tip out to the sea (cast s), a splash ring where it lands */
  chiefCast(p) {
    const k = this.cast;
    if (!k || k.st === 'out' || k.st === 'in') return;
    k.st = 'out'; k.t = 0; k.from = this.chiefTip(p);
    this.gs.sfxAt('sfx_reel', this.gather.x, this.gather.y, { volume: 0.4, throttle: 200 }, true);
  }

  /** (Player) the chief stands at his spot with the line out (no fish in the pool just now, or his bag is full): he keeps
   *  the rod up (no catch comes: his `fish` frames' impacts find no node). ((v4.3 sea review SEA-OFFMODE) only for those
   *  two reasons: when his gathering stopped for another (Settings 줍기 'off' and he let go of the button) he reels in
   *  and stands, as anywhere else) */
  holdsChief(p) { const k = this.cast; return !!(k && (k.st === 'in' || k.st === 'out') && p === this.gs.player && this.chiefHere(p) && this.lineHeld(p)); }

  /** his line stays out while nothing is caught (a full bag, the pool empty just now, the beat between two catches) —
   *  unless the pickup setting stopped his gathering (줍기 'off' and the button let go: PickupPolicy.keepGathering) */
  lineHeld(p) { const PP = this.gs.v42 && this.gs.v42.pickup; return !(PP && PP.keepGathering && !PP.keepGathering(p)); }

  /** a splash ring on the water at (x, y) (drawn by the chief's line graphics; the living water's ripple too) */
  ring(x, y, k = 1) {
    const c = this.cast;
    if (c) { c.rings.push({ x, y, t: 0, k }); if (c.rings.length > 6) c.rings.shift(); }
    const wv = this.gs.ground && this.gs.ground.water;
    if (wv) wv.ripple(x, y, 0.7 * k);
  }

  /** the chief's line: cast -> in the water (bobbing, a bite dips it) -> back to the rod tip when he leaves */
  updateChiefLine(dt) {
    const gs = this.gs, k = this.cast, p = gs.player, g = this.cline;
    if (!k) return;
    const here = this.enabled && p && this.chiefHere(p) && (p.node === this || ((k.st === 'in' || k.st === 'out') && this.lineHeld(p)));
    if (!here && (k.st === 'out' || k.st === 'in')) { k.st = 'back'; k.t = 0; k.from = { x: k.bob.x, y: k.bob.y }; }
    const castS = Math.max(0.05, num(this.landCfg.cast, 0.25));
    k.t += dt;
    for (const r of k.rings) r.t += dt;
    k.rings = k.rings.filter((r) => r.t < 0.7);
    if (k.st === 'off' && !k.rings.length) { if (this._clDrawn) { g.clear(); this._clDrawn = false; } return; }
    const vis = gs.isOnScreen(this.landAt.x, this.landAt.y, 320);
    const tip = p ? this.chiefTip(p) : this.gather;
    k.tip = tip;
    const B = this.bobAt, now = gs.time.now / 1000;
    let bx = B.x, by = B.y, tension = 0, showBob = true;
    if (k.st === 'out') {
      // the float flies from the rod tip in an arc and lands on the water
      const u = Math.min(1, k.t / castS);
      bx = k.from.x + (B.x - k.from.x) * u; by = k.from.y + (B.y - k.from.y) * u - Math.sin(u * Math.PI) * 26;
      tension = 1;
      if (u >= 1) { k.st = 'in'; k.t = 0; k.ringT = 0; this.ring(B.x, B.y, 1.1); if (vis) gs.effects.burst('splash', B.x, B.y, 3); }
    } else if (k.st === 'in') {
      // bobbing; a bite (his reel frames 1-2) dips it; the rod up (frame 3) pulls the line straight
      const fr = p && p.node === this && p.animRes === 'fish' && p.sprite.anims.currentFrame ? p.sprite.anims.currentFrame.index - 1 : -1;
      by += Math.sin(now * 3.1) * 1.4 + (fr === 1 || fr === 2 ? 3 + fr : 0);
      bx += Math.sin(now * 1.3) * 1.5;
      tension = fr === 3 ? 1 : fr === 2 || fr === 4 ? 0.6 : 0.25;
      if ((k.ringT += dt) > 1.3) { k.ringT = 0; this.ring(B.x, B.y, 0.5); }
    } else if (k.st === 'back') {
      // reeled in: the float flies back to the rod tip and is gone
      const u = Math.min(1, k.t / 0.2);
      bx = k.from.x + (tip.x - k.from.x) * u; by = k.from.y + (tip.y + 8 - k.from.y) * u - Math.sin(u * Math.PI) * 10;
      tension = 1;
      if (u >= 1) { k.st = 'off'; showBob = false; }
    } else showBob = false;
    k.bob.x = bx; k.bob.y = by;
    if (!vis) { if (this._clDrawn) { g.clear(); this._clDrawn = false; } return; }
    this._clDrawn = true;
    g.clear();
    if (p) g.setDepth(p.sprite.depth - 0.002);
    // the splash rings (flat ellipses, growing and fading)
    for (const r of k.rings) {
      const u = r.t / 0.7, rad = (5 + 17 * u) * r.k;
      g.lineStyle(1.6, 0xffffff, 0.75 * (1 - u)).strokeEllipse(r.x, r.y, rad * 2, rad);
    }
    if (!showBob) return;
    // the line: from the rod tip to the float, sagging when slack
    const sag = 10 * (1 - tension);
    g.lineStyle(1.3, 0xf4f7fb, 0.95);
    g.beginPath(); g.moveTo(tip.x, tip.y);
    for (let i = 1; i <= 8; i++) { const u = i / 8, x = tip.x + (bx - tip.x) * u, y = tip.y + (by - 3 - tip.y) * u + Math.sin(u * Math.PI) * sag; g.lineTo(x, y); }
    g.strokePath();
    // the float (white bottom, red top), a little shadow on the water while it floats
    if (k.st === 'in') g.fillStyle(0x0b2a44, 0.25).fillEllipse(bx, by + 1, 9, 4);
    g.fillStyle(0xffffff, 1).fillCircle(bx, by - 1, 3.4);
    g.fillStyle(0xe8433a, 1).fillCircle(bx, by - 3.4, 3.4);
  }

  // ------------------------------------------------------------------ tiers
  /** the deck grows with the fishermen: 1단 / 2단 (hire2) / 3단 (hire3, a small roof) */
  setTier(n, pop) {
    n = Math.max(1, Math.min(3, Math.floor(n) || 1));
    if (n === this.tier) return;
    this.tier = n;
    this.applyArt();
    this.wireWater();
    if (pop) {
      const gs = this.gs, c = this.P((this.cfg.tiers[n][0] + this.cfg.tiers[n][1]) / 2, 0);
      gs.effects.sheet('fx_poof', c.x, c.y - 20, { size: 260 });
      gs.effects.burst('star', c.x, c.y - 40, 12);
      gs.sfxAt('sfx_build', c.x, c.y, { volume: 0.7 }, true);
      for (const o of [this.img, this.front]) if (o.visible) { o.setScale(0.96, 0.9); gs.tweens.add({ targets: o, scaleX: 1, scaleY: 1, duration: 380, ease: 'Back.easeOut' }); }
      if (n > 1 && gs.ui && gs.ui.banner) gs.time.delayedCall(700, () => gs.ui.banner(t('deckGrow', { n }), t(n === 3 ? 'deckRoof' : 'deckGrowSub')));
    }
  }

  /** the tier's pictures (or the plain shapes), again when the deck's page arrives */
  applyArt() {
    const gs = this.gs, n = this.tier, kb = 'deck43_t' + n + '_back', kf = 'deck43_t' + n + '_front';
    const art = Assets.has(kb);
    if (art) { Assets.apply(this.img, kb); this.img.setVisible(this.enabled); }
    else { this.img.setVisible(false); if (gs.lazyImage && Assets.pending(kb)) gs.lazyImage(this.img, kb, () => this.applyArt()); }
    if (art && Assets.has(kf)) { Assets.apply(this.front, kf); this.front.setVisible(this.enabled); } else this.front.setVisible(false);
    this.drawPlain(!art);
    for (const r of this.rods) r.frame = '';
  }

  /** the plain stand-in: planks, gangway, stools (only while the deck's art is missing) */
  drawPlain(on) {
    const g = this.plain;
    g.clear();
    g.setVisible(on && this.enabled);
    if (!on) return;
    const L = this.lift, T = this.cfg.tiers[this.tier], gw = this.cfg.gangway;
    const quad = (x0, x1, y0, y1, dz0, dz1) => { const a = this.P(x0, y0), b = this.P(x0, y1), c = this.P(x1, y1), d = this.P(x1, y0); return [{ x: a.x, y: a.y - dz0 }, { x: b.x, y: b.y - dz1 }, { x: c.x, y: c.y - dz1 }, { x: d.x, y: d.y - dz0 }]; };
    // posts, then the deck's edge and top
    g.fillStyle(0x6b4a33, 1);
    for (const [px, py] of [[T[0], T[2]], [T[0], T[3]], [T[1], T[2]], [T[1], T[3]]]) { const p = this.P(px, py); g.fillRect(p.x - 3, p.y - L, 6, L + 6); }
    const top = quad(T[0], T[1], T[2], T[3], L, L);
    g.fillStyle(0x8a5e3c, 1).fillPoints(top.map((p) => ({ x: p.x, y: p.y + 6 })), true);
    g.fillStyle(0xc99a68, 1).fillPoints(top, true);
    g.lineStyle(1, 0xa77b52, 0.8);
    for (let x = T[0] + 0.3; x < T[1]; x += 0.3) { const a = this.P(x, T[2]), b = this.P(x, T[3]); g.lineBetween(a.x, a.y - L, b.x, b.y - L); }
    // the gangway: from the land (0) up to the deck's height
    const gq = quad(gw[0], gw[1], -1.3 - 3.4, T[2], 0, L);
    g.fillStyle(0xb98a5a, 1).fillPoints(gq, true);
    g.lineStyle(1, 0x97683f, 0.8);
    for (let y = -1.3 - 3.4 + 0.3; y < T[2]; y += 0.3) { const k = (y + 4.7) / 3.4, a = this.P(gw[0], y), b = this.P(gw[1], y); g.lineBetween(a.x, a.y - L * k, b.x, b.y - L * k); }
    // stools
    g.fillStyle(0x7a5234, 1);
    for (let i = 0; i < this.tier; i++) { const s = this.cfg.stools[i], p = this.P(s[0], s[1]); g.fillEllipse(p.x, p.y - L - 18, 22, 10); g.fillRect(p.x - 2, p.y - L - 18, 4, 18); }
  }

  /** foam collars round the posts (the living water) */
  wireWater() {
    const wv = this.gs.ground && this.gs.ground.water;
    if (!wv || !wv.addContact) return;
    for (const id of this.contacts) wv.removeContact(id);
    this.contacts = [];
    const T = this.cfg.tiers[this.tier];
    for (const [px, py] of [[T[0], T[2]], [T[0], T[3]], [T[1], T[3]], [T[1], T[2]], [(T[0] + T[1]) / 2, T[3]]]) {
      const p = this.P(px, py);
      if (!wv.shoreDistance || wv.shoreDistance(p.x, p.y) > 4) this.contacts.push(wv.addContact(p.x, p.y, 7, { foam: 0.8, shadow: 0.12 }));
    }
    const c = this.P((T[0] + T[1]) / 2, (T[2] + T[3]) / 2);
    this.contacts.push(wv.addContact(c.x, c.y, 60 + 25 * (this.tier - 1), { foam: 0, shadow: 0.18 }));
    // ((v4.3 sea) the landing's two posts in the water, the planks' shade
    if (this.landCfg) {
      const pk = this.landCfg.planks || [-0.5, 0.5, -0.6, 0.6];
      for (const x of [pk[0] + 0.05, pk[1] - 0.05]) { const q = this.LP(x, pk[3] - 0.02); this.contacts.push(wv.addContact(q.x, q.y, 6, { foam: 0.8, shadow: 0.12 })); }
      const m = this.LP(0, pk[3] * 0.5);
      this.contacts.push(wv.addContact(m.x, m.y, 26, { foam: 0, shadow: 0.12 }));
    }
    this._wv = wv;
  }

  // ------------------------------------------------------------------ the fishers' places
  /** the stool of fisher `i` (world point on the water plane: the planks are `lift` px higher on screen) */
  stool(i) { const s = this.cfg.stools[Math.max(0, Math.min(this.cfg.stools.length - 1, i))]; return this.P(s[0], s[1]); }
  /** where fisher `i`'s float lands (on the water, in front of him: he faces the sea, NE) */
  bobber(i) { const s = this.cfg.stools[Math.max(0, Math.min(this.cfg.stools.length - 1, i))]; return this.P(s[0], s[1] + 1.25); }
  /** the scripted lane from the gangway foot to stool `i`: [{ x, y, lift, gang }] */
  lane(i) {
    const s = this.cfg.stools[Math.max(0, Math.min(this.cfg.stools.length - 1, i))], gw = this.cfg.gangway, gx = (gw[0] + gw[1]) / 2;
    const T = this.cfg.tiers[this.tier];
    const pts = [[gx, -1.3 - 3.4, 0, true], [gx, -1.0, this.lift, true], [Math.max(T[0] + 0.3, s[0]), -0.2, this.lift, false], [s[0], s[1], this.lift, false]];
    return pts.map(([mx, my, lift, gang]) => Object.assign(this.P(mx, my), { lift, gang }));
  }

  /** (gs.interiors) depth and lift of someone on the deck (only the fishers ever are: ch.onDeck) */
  occupy(ch) {
    // ((v4.3 sea) the chief on his landing's planks: lifted onto them (his depth as everyone's)
    if (this.plankPoly && ch === this.gs.player && this.enabled && this.onPlanks(ch.x, ch.y)) return { depth: ch.y, lift: this.landLift };
    if (!ch.onDeck) return null;
    return { depth: this.base + (ch.onGangway ? 0.9 : 0.4) + ch.y * 1e-5, lift: ch.deckLift !== undefined ? ch.deckLift : this.lift };
  }

  /** a fisher's catch flies from his float to the fish crate (the `fish` pile on land) */
  flyFish(x, y, pile) {
    const gs = this.gs;
    if (!pile || pile.stack.room <= 0) return false;
    const st = pile.stack, type = this.item;
    st.reserve(type);
    const spr = gs.effects.takeItem(type);
    spr.setScale(0.5);
    gs.effects.fly(spr, x, y, () => st.nextPos(type), {
      dur: 520, height: 120, scaleTo: st.scale,
      onDone: (s) => { st.arrive(type); st.push(type, s); if (gs.isNear && gs.isNear(pile.x, pile.y, 500)) gs.sfxAt('sfx_drop', pile.x, pile.y, { volume: 0.35, throttle: 80 }); },
    });
    if (gs.noteMade) gs.noteMade(1);      // ((v4.2 touch) raw made: the 창고 직원 follow it)
    return true;
  }

  // ------------------------------------------------------------------ the Net surface
  ready() { return this.enabled && this.stock > 0; }

  /** the chief steps onto the reel spot: one quick reel (all three rods bend up together); ((v4.3 sea) and he casts his
   *  own line from the landing) */
  reel(by) {
    this.reelT = Math.max(0.1, num(DB().reelS, 0.6));
    if (by && by === this.gs.player && this.landCfg) this.chiefCast(by);
  }

  hit(by) {
    if (!this.ready()) return null;
    this.stock--;
    const gs = this.gs, f = this.fish[this.stock];
    // ((v4.3 sea) the chief's fish leaps out of the water at his float
    const mine = by === gs.player && this.cast && this.cast.st === 'in';
    const x = mine ? this.cast.bob.x : f ? f.x : this.gather.x, y = mine ? this.cast.bob.y : f ? f.y : this.gather.y;
    if (mine) this.ring(x, y, 1);
    gs.effects.sheet('fx_splash', x, y + 10, { size: 70 });
    const wv = gs.ground && gs.ground.water;
    if (wv) wv.ripple(x, y + 14, by === gs.player ? 1.1 : 0.8);
    gs.effects.burst('splash', x, y, 3);
    gs.sfxAt('sfx_reel', this.gather.x, this.gather.y, { volume: by === gs.player ? 0.55 : 0.3, throttle: 120 }, by === gs.player);
    gs.sfxAt('sfx_splash', x, y, { volume: by === gs.player ? 0.6 : 0.35, throttle: 120 }, by === gs.player);
    return this.item;
  }

  /** world position of the fish leaving the rods (the last one shown); ((v4.3 sea) the chief's: his float on the sea,
   *  leap = it jumps out of the water to him) */
  fishPos(by) {
    const k = this.cast;
    if (by && by === this.gs.player && k && (k.st === 'in' || k.st === 'out')) return { x: k.bob.x, y: k.bob.y - 2, leap: true };
    const f = this.fish[Math.max(0, this.stock)] || this.fish[0]; return { x: f.x, y: f.y };
  }

  update(dt) {
    if (this.stock < this.max) {
      this.timer += dt;
      if (this.timer >= BALANCE.resources.net.refill) {
        this.timer = 0;
        this.stock++;
        const r = this.rods[Math.floor((this.stock - 1) / 2) % 3];
        if (r && this.gs.isOnScreen(r.bob.x, r.bob.y, 200)) { this.gs.effects.burst('splash', r.bob.x, r.bob.y, 3); const wv = this.gs.ground && this.gs.ground.water; if (wv) wv.ripple(r.bob.x, r.bob.y, 0.6); }
      }
    }
    if (this.reelT > 0) this.reelT -= dt;
    // the living water came after the deck: its foam collars
    if (this.gs.ground && this.gs.ground.water && this._wv !== this.gs.ground.water) this.wireWater();
    // pad: brighter while the chief stands on it
    const p = this.gs.player;
    if (p) { const on = this.pad.contains(p.x, p.y); if (on !== this._on) { this._on = on; this.pad.img.setAlpha(on ? 1 : 0.85); } }
    this.drawRods(dt);
    if (this.cast) this.updateChiefLine(dt);
  }

  /** the three rods: state per rod from the pool, their lines / floats, the fish they hold */
  drawRods() {
    const gs = this.gs, g = this.lines;
    const vis = this.enabled && gs.isOnScreen(this.x, this.y, 260);
    for (let i = 0; i < this.fish.length; i++) { const f = this.fish[i], v = this.enabled && i < this.stock; if (f.visible !== v) f.setVisible(v); }
    if (!vis) { if (this._drawn) { g.clear(); this._drawn = false; } return; }
    this._drawn = true;
    g.clear();
    const now = gs.time.now / 1000 + this.t0, L = this.lift, reel = this.reelT > 0;
    const art = Assets.has('deck43_rod_idle');
    for (const r of this.rods) {
      const n = Math.max(0, Math.min(2, this.stock - r.k * 2));
      const st = reel && n > 0 ? 'hooked' : n === 2 ? 'hooked' : n === 1 ? 'bite' : 'idle';
      const def = art ? Assets.def('deck43_rod_' + st) : null;
      if (art) {
        if (r.frame !== st) { r.frame = st; Assets.apply(r.img, 'deck43_rod_' + st); }
        r.img.setVisible(true);
      } else r.img.setVisible(false);
      const tipOff = (def && def.tipPoint) || ROD_TIP[st];
      const tip = { x: r.x + tipOff[0], y: r.y - L + tipOff[1] };
      if (!art) {
        // a plain holder + rod
        g.lineStyle(4, 0x6b4a33, 1).lineBetween(r.x, r.y - L, r.x + 2, r.y - L - 16);
        g.lineStyle(3, 0x5b3a24, 1).lineBetween(r.x + 2, r.y - L - 14, tip.x, tip.y);
      }
      const ph = now * 2.1 + r.k * 1.9;
      // the float: bobbing / dipping; the line from the tip
      const b = r.bob;
      let bx = b.x, by = b.y + Math.sin(ph) * 1.5;
      if (st === 'bite') by += Math.max(0, Math.sin(now * 9 + r.k)) * 5;
      if (st === 'hooked') { bx = tip.x + 4; by = tip.y + 26 + Math.sin(ph * 2.3) * 2; }
      g.lineStyle(1.2, 0xf4f7fb, 0.9).lineBetween(tip.x, tip.y, bx, by - 3);
      if (st !== 'hooked') {
        g.fillStyle(0xffffff, 1).fillCircle(bx, by - 1, 3.2);
        g.fillStyle(0xe8433a, 1).fillCircle(bx, by - 3, 3.2);
      }
      // the fish of this rod
      for (let j = 0; j < 2; j++) {
        const f = this.fish[r.k * 2 + j];
        if (!f || !f.visible) continue;
        let fx, fy, ang;
        if (st === 'hooked') {
          fx = bx + (j ? 6 : -3); fy = by + 6 + j * 13 + Math.sin(ph * 3 + j) * 1.5;
          ang = 80 + Math.sin(ph * 4.2 + j * 2) * 22;
          f.setDepth(this.base + 0.27);
        } else {
          // a bite: the fish thrashes at the float, half out of the water
          const hop = Math.max(0, Math.sin(now * 5.3 + r.k));
          fx = b.x + 9 + Math.sin(now * 2.2) * 2; fy = b.y - 2 - hop * hop * 12;
          ang = Math.sin(now * 6 + r.k) * 30;
          f.setDepth(this.base + 0.05);
        }
        f.x = fx; f.y = fy; f.__hx = fx; f.__hy = fy;
        f.setAngle(ang).setFlipX(r.k % 2 === 1);
      }
    }
  }

  setEnabled(v) {
    this.enabled = v;
    this.applyArt();
    if (this.landCfg) { this.applyLandArt(); if (this.land) this.land.active = v; }
    for (const r of this.rods) r.img.setVisible(v && r.img.visible);
    this.pad.setVisible(v);
    for (const o of this.obstacles) o.active = v;
  }

  revealObjects() { return [this.img, this.front, this.pad.img, this.landImg].filter((o) => o && o.visible); }

  /** (tests) what the deck shows and who is on it */
  state() {
    const gs = this.gs, ws = (gs.workers || []).filter((w) => w.type === 'fisherman');
    return {
      tier: this.tier, stock: this.stock, max: this.max, art: Assets.has('deck43_t' + this.tier + '_back'),
      reel: { x: this.gather.x, y: this.gather.y }, foot: { x: this.foot.x, y: this.foot.y }, rods: this.rods.map((r) => r.frame || (Math.max(0, Math.min(2, this.stock - r.k * 2)) ? 'live' : 'idle')),
      fishers: ws.map((w) => ({ i: w.index, key: w.key, x: Math.round(w.x), y: Math.round(w.y), st: w.dk ? w.dk.st : null, f: w.dk ? w.dk.f : null, onDeck: !!w.onDeck, anim: w.animName, lift: Math.round(w.deckLift || 0) })),
      crate: gs.piles && gs.piles.fish ? { x: gs.piles.fish.x, y: gs.piles.fish.y, n: gs.piles.fish.count, incoming: gs.piles.fish.stack.incoming, shown: gs.piles.fish.shown } : null,
      // ((v4.3 sea) the chief's landing and his line
      landing: this.landCfg ? { x: this.landAt.x, y: this.landAt.y, art: Assets.has('deck43_landing'), shown: !!(this.landImg.visible || this.landPlain.visible), bob: { x: this.bobAt.x, y: this.bobAt.y },
        line: this.cast.st, float: { x: Math.round(this.cast.bob.x), y: Math.round(this.cast.bob.y) }, tip: this.cast.tip ? { x: Math.round(this.cast.tip.x), y: Math.round(this.cast.tip.y) } : null, rings: this.cast.rings.length, drawn: !!this._clDrawn } : null,
    };
  }

  /** a little name card for the reel spot (tests / the tutorial read it) */
  label() { return t('deck_reel'); }

  destroy() {
    const I = this.gs.interiors, i = I ? I.indexOf(this) : -1;
    if (i >= 0) I.splice(i, 1);
    const wv = this._wv;
    if (wv) for (const id of this.contacts) wv.removeContact(id);
  }
}
