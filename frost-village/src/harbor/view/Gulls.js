// 갈매기 (harbor_runtime view): up to `tuning.gulls` (6) seagulls from assets/ships — perched on bollards and roof
// ridges (idle, now and then a squawk), off to circle a trawler coming home with its catch or a ferry coming in,
// riding on a ship's mast tops (perchPoints) while it lies at the berth, gliding over the basin. A small soft shadow
// follows each flying gull on the water / the quay. P7: one swoops on a tourist's grilled fish.

import { BLD, LR } from '../layout.js';
import { cdef, sdef, dirOf, shadowTex, MIRROR, Assets, DEPTH } from './art.js';

const FLY_SPEED = 150;            // px / s
const SQUAWK_GAP = 4;             // s between squawks (all gulls)

/** perch spots on land: [x, y (ground), lift px] — bollards' tops and a few roof ridges */
function perches() {
  const out = [];
  const bol = sdef('bollard'), top = bol && bol.topPx ? bol.topPx - 6 : 34;
  for (const [i, j] of [[60.5, -11.72], [65.33, -11.72], [69.87, -11.72], [81.0, -11.72], [83.4, -11.72], [85.6, -11.72], [61.5, -21.6], [65.5, -21.6], [55.32, -16.6]]) { const [x, y] = LR(i, j); out.push([x, y, top]); }
  for (const [id, f] of [['h_fish_auction', 0.82], ['h_harbor_warehouse', 0.86], ['h_customs_house', 0.9]]) {
    const b = BLD[id], d = sdef(b.key);
    if (d && d.topPx) out.push([b.x + 12, b.y, Math.round(d.topPx * f)]);
  }
  return out;
}

export class Gulls {
  constructor(view) {
    this.v = view;
    this.sc = view.scene;
    this.list = [];
    this.spots = perches();
    this.taken = new Set();
    this.squawkT = 2;
    this.n = Math.max(0, Math.min(6, view.cfg.gulls || 6));
  }

  ready() { return !!(cdef('seagull') && Assets.m.characters.seagull && this.sc.anims.exists(Assets.charAnim('seagull', 'idle', 'S'))); }

  make(k) {
    const sc = this.sc, d = cdef('seagull');
    const spr = sc.add.sprite(-9999, -9999, '__WHITE').setOrigin(d.anchor[0], d.anchor[1]);
    const sh = sc.add.image(-9999, -9999, shadowTex(sc)).setDepth(DEPTH.SHADOW + 4).setDisplaySize(30, 13).setAlpha(0.5);
    const spot = this.freeSpot(k);
    const g = { k, spr, sh, state: 'perch', x: spot[0], y: spot[1], alt: spot[2], spot, tx: 0, ty: 0, talt: 0, t: Math.random() * 6, follow: null, anim: '', dir: 'S', circle: null, cb: null };
    this.taken.add(spot);
    return g;
  }
  freeSpot(k) {
    const free = this.spots.filter((s) => !this.taken.has(s));
    return free.length ? free[(k * 5) % free.length] : this.spots[k % this.spots.length];
  }

  play(g, anim, dir) {
    const mir = MIRROR[dir];
    const key = Assets.charAnim('seagull', anim, mir || dir);
    if (key !== g.anim) { g.spr.play(key); g.anim = key; }
    g.spr.setFlipX(!!mir);
  }

  /** where the gulls want to be: around a trawler's stern / a ferry coming in, or on their perches */
  targets() {
    const v = this.v, out = [];
    for (const [id, sp] of v.fleet.live) {
      if (!sp.on) continue;
      const k = sp.key;
      if (k === 'trawler_big' || k === 'ferry') out.push({ sp, n: k === 'trawler_big' ? 3 : 2, r: k === 'trawler_big' ? 150 : 210 });
    }
    return out;
  }

  update(dt) {
    const v = this.v;
    if (!v.model.open && !v.sleepy) { this.hideAll(); return; }
    if (!this.ready()) return;
    if (!v.near(BLD.h_fish_auction.x + 600, BLD.h_fish_auction.y + 200, 1600)) { this.hideAll(); return; }
    while (this.list.length < this.n) this.list.push(this.make(this.list.length));
    // assign followers
    const tg = this.targets();
    let gi = 0;
    for (const t of tg) for (let q = 0; q < t.n && gi < this.list.length; q++, gi++) {
      const g = this.list[gi];
      if (g.state === 'raid') continue;
      if (g.follow !== t.sp) { g.follow = t.sp; g.circle = { r: t.r * (0.8 + 0.25 * q), w: (q % 2 ? -1 : 1) * (0.9 + 0.15 * q), a: q * 2.1 }; this.release(g); g.state = 'fly'; }
    }
    for (let k = gi; k < this.list.length; k++) { const g = this.list[k]; if (g.follow) { g.follow = null; g.state = 'home'; } }
    this.squawkT -= dt;
    for (const g of this.list) this.step(g, dt);
  }

  release(g) { if (g.spot) { this.taken.delete(g.spot); g.spot = null; } }

  step(g, dt) {
    const v = this.v;
    g.t += dt;
    if (g.state === 'perch' || g.state === 'land') {
      if (g.state === 'land' && g.t > 0.45) g.state = 'perch';
      this.play(g, g.state === 'land' ? 'land' : 'idle', g.dir);
      g.spr.setPosition(g.x, g.y - g.alt).setDepth(g.y + 2).setVisible(true);
      g.sh.setVisible(false);
      // now and then a hop up for a little circle over the basin
      if (g.state === 'perch' && g.t > 9 + (g.k * 3.7) % 7) { g.t = 0; this.release(g); g.state = 'wander'; g.circle = { cx: g.x - 120 - g.k * 30, cy: g.y + 160, r: 140 + g.k * 12, w: g.k % 2 ? -0.8 : 0.8, a: 0 }; }
      this.squawk(g);
      return;
    }
    // flying: follow a ship (circle its stern), wander (a circle then home), raid (P7), home (back to a perch)
    let tx, ty, talt;
    if (g.state === 'fly' && g.follow && g.follow.on) {
      const sp = g.follow, c = g.circle;
      c.a += c.w * dt;
      const wp = sp.def.wakePoint && sp.def.wakePoint[sp.dir];
      const sx = sp.x + (wp ? (sp.flip ? -wp[0] : wp[0]) * 0.8 : 0), sy = sp.y + (wp ? wp[1] * 0.8 : 0);
      tx = sx + Math.cos(c.a) * c.r; ty = sy + Math.sin(c.a) * c.r * 0.5; talt = 150 + 30 * Math.sin(c.a * 1.7);
    } else if (g.state === 'wander') {
      const c = g.circle;
      c.a += c.w * dt;
      tx = c.cx + Math.cos(c.a) * c.r; ty = c.cy + Math.sin(c.a) * c.r * 0.5; talt = 130;
      if (Math.abs(c.a) > Math.PI * 2.2) g.state = 'home';
    } else if (g.state === 'raid') {
      tx = g.tx; ty = g.ty; talt = g.talt;
    } else {
      // home: the nearest free perch
      if (!g.spot) { g.spot = this.freeSpot(g.k + Math.floor(g.t)); this.taken.add(g.spot); }
      tx = g.spot[0]; ty = g.spot[1]; talt = g.spot[2];
    }
    const dx = tx - g.x, dy = ty - g.y, da = talt - g.alt;
    const L = Math.hypot(dx, dy * 2, da);
    const sp = FLY_SPEED * (g.state === 'raid' ? 1.6 : 1) * dt;
    if (L > 1) { const f = Math.min(1, sp / L); g.x += dx * f; g.y += dy * f; g.alt += da * f; }
    if (g.state === 'home' && L < 6) { g.x = tx; g.y = ty; g.alt = talt; g.state = 'land'; g.t = 0; g.dir = 'SW'; }
    if (g.state === 'raid' && L < 8 && g.cb) { const cb = g.cb; g.cb = null; cb(g); }
    if (Math.hypot(dx, dy) > 2) g.dir = dirOf(dx, dy - da * 0.3);
    this.play(g, Math.abs(da) > 40 || (Math.floor(g.t * 0.7 + g.k) % 3) ? 'fly' : 'glide', g.dir === 'N' || g.dir === 'S' ? g.dir : g.dir);
    g.spr.setPosition(g.x, g.y - g.alt).setDepth(g.alt > 60 ? DEPTH.FLY + g.y * 1e-3 : g.y + 2).setVisible(true);
    g.sh.setPosition(g.x, g.y + 2).setVisible(g.alt > 12).setAlpha(Math.max(0.15, 0.5 - g.alt / 600));
    this.squawk(g);
  }

  squawk(g) {
    const v = this.v;
    if (this.squawkT > 0 || !v.near(g.x, g.y, 0)) return;
    if (Math.random() > 0.02) return;
    this.squawkT = SQUAWK_GAP + Math.random() * 4;
    v.sound('sfx_seagull_' + (1 + (g.k % 3)), g.x, g.y, { volume: 0.45 });
  }

  /** P7: the nearest gull swoops to (x, y), grabs, and flies off over the sea; cb() at the grab */
  raid(x, y, cb) {
    const g = this.list.find((q) => !q.follow && q.state !== 'raid') || this.list[0];
    if (!g) return false;
    this.release(g);
    g.state = 'raid'; g.tx = x; g.ty = y; g.talt = 34; g.follow = null;
    g.cb = () => { cb && cb(); g.tx = x - 380; g.ty = y + 420; g.talt = 190; g.cb = () => { g.state = 'home'; }; };
    return true;
  }

  hideAll() { for (const g of this.list) { g.spr.setVisible(false); g.sh.setVisible(false); } }
  destroy() { for (const g of this.list) { g.spr.destroy(); g.sh.destroy(); } this.list = []; }
}
