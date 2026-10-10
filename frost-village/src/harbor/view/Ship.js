// Ships on the living water (harbor_runtime view, docs/v5_v8_plan.md §6.4): the timetable's poses -> layered ship
// sprites (assets/ships "layered": base_<dir> -> cargo slots / deck people -> foam -> anim; tug / sail / yacht are
// complete frames), mirrored for SW / NW, crossfaded through a turn, faded in / out at the horizon, bobbing on
// water.heightAt (one heightAt per ship per frame), hull contacts (addHull / moveHull), V-wakes (WaterSheets.wake),
// rings at the stern, funnel smoke, the trawler's haul, night lamps. At most `budget.ships` (6) materialised,
// nearest to the view first; the rest stay analytic (the model's timetable).

import { WaterSheets } from '../../systems/Water.js';
import { W, shipCells, PX_PER_CELL, BREAKWATER_RECT } from '../layout.js';
import { hullRect } from '../model/ships.js';
import { MIRROR, cdef, tex, Assets, DEPTH } from './art.js';

const FADE = 2.5;                 // s: fade in at the horizon, out at the end of a trip
const SMOKE_EVERY = 0.42;
const RING_EVERY = 0.3;
const DECK_MAX = 5;               // passengers drawn on the ferry's deck
const WAKE_DEPTH = DEPTH.GROUND + 6;   // on the water: over the ground tiles and the shore foam, under everything standing
const BW_SORT = Object.assign({}, BREAKWATER_RECT, { i1: BREAKWATER_RECT.i1 + 0.8 });   // + the round head

const pt = (p, dir, flip) => { const q = p && p[dir]; return q ? [flip ? -q[0] : q[0], q[1]] : null; };

export class ShipSprite {
  constructor(view, key) {
    this.v = view;
    this.key = key;
    const sc = this.sc = view.scene;
    const d = this.def = cdef(key);
    if (!Assets.built[key]) Assets.buildCharacter(sc.game, key);
    this.layered = !!d.layered;
    const a = d.anchor;
    const mk = () => sc.add.image(0, 0, '__WHITE').setOrigin(a[0], a[1]).setVisible(false);
    this.base = this.layered ? mk() : null;
    this.ghost = mk();
    this.slots = [];
    if (d.cargoSlots) for (let k = 0; k < d.cargoSlots.count; k++) this.slots.push(mk());
    this.foam = this.layered ? sc.add.sprite(0, 0, '__WHITE').setOrigin(a[0], a[1]).setVisible(false) : null;
    this.anim = sc.add.sprite(0, 0, '__WHITE').setOrigin(a[0], a[1]).setVisible(false);
    this.wake = null; this.wakeKey = '';
    this.deck = [];
    this.hull = null;
    this.id = null;
    this.dir = ''; this.flip = false; this.animKey = ''; this.foamKey = '';
    this.smokeT = Math.random() * SMOKE_EVERY; this.ringT = 0;
    this.x = 0; this.y = 0; this.bob = 0;
    this.on = false;
  }

  /** frame of the static base / slot / idle picture for a dir */
  setStatic(img, frame) {
    const tk = tex(this.def.atlas, frame);
    if (!tk) { img.setVisible(false); return false; }
    if (img.texture.key !== tk || img.frame.name !== frame) img.setTexture(tk, frame);
    return true;
  }
  play(spr, anim, dir, keep) {
    const k = this.key + ':' + anim + ':' + dir;
    if (!this.sc.anims.exists(k)) return false;
    if (keep !== k) spr.play({ key: k, startFrame: 0 });
    return k;
  }

  /** bind to a mission (a different ship of the same art) */
  bind(id) { if (this.id !== id) { this.id = id; this.dir = ''; this.animKey = ''; this.foamKey = ''; } }

  /**
   * draw at pose p (lattice i, j, heading h, turn h2 / f, speed v, tag) with alpha `al`.
   * o: { loaded (cargo slots shown), deck (passenger looks), wave (deck people wave), haul }
   */
  draw(p, al, o, depth) {
    const v = this.v, d = this.def;
    const [x, y] = W(p.i, p.j);
    this.x = x; this.y = y; this.depth = depth;
    const wv = v.water, live = wv && wv.isShader;
    // bob: the live surface (or the manifest's gentle bob without the shader)
    const bob = live ? wv.heightAt(x, y) : (d.bob ? d.bob.px * Math.sin(v.t * 2 * Math.PI / d.bob.periodS + x * 0.003) : 0);
    this.bob = bob;
    const yy = y - bob;
    const h = p.h, dir = MIRROR[h] || h, flip = !!MIRROR[h];
    const moving = Math.abs(p.v) > 2;
    const turning = p.kind === 'turn' && p.h2;
    const tf = turning ? Math.abs(p.f - 0.5) : 0.5;          // 0.5 = settled, 0 = mid-turn
    const main = turning ? 0.5 + tf : 1;
    const sx = turning ? 1 - 0.07 * Math.sin(Math.PI * p.f) : 1;
    // main layers
    const setL = (img, a, dd) => { img.setPosition(x, yy).setFlipX(flip).setAlpha(a).setDepth(dd).setScale(sx, 1).setVisible(a > 0.01); };
    if (this.layered) {
      this.setStatic(this.base, 'base_' + dir);
      setL(this.base, al * main, depth);
      // cargo slots (far -> near) after the base
      if (this.slots.length) {
        const ord = d.cargoSlots.order[dir] || [];
        const n = o.loaded === undefined ? this.slots.length : o.loaded;
        for (let k = 0; k < this.slots.length; k++) this.slots[k].setVisible(false);
        for (let q = 0; q < ord.length; q++) {
          const k = ord[q], img = this.slots[k];
          if (q >= n) continue;
          if (this.setStatic(img, 'slot' + k + '_' + dir)) setL(img, al * main, depth + 0.001 * (q + 1));
        }
      }
      // foam while moving
      if (moving && al > 0.05) {
        const fk = this.key + ':foam:' + dir;
        if (fk !== this.foamKey && this.sc.anims.exists(fk)) { this.foam.play(fk); this.foamKey = fk; }
        setL(this.foam, al * main * Math.min(1, Math.abs(p.v) / 30), depth + 0.02);
      } else { this.foam.setVisible(false); this.foamKey = ''; }
    }
    // the anim layer (layered: moving parts only; small boats: the whole boat)
    let an = moving ? 'move' : 'idle';
    let adir = dir;
    if (o.haul && d.anims.haul) { an = 'haul'; adir = (d.anims.haul.dirs || ['NE'])[0]; }
    const ak = this.key + ':' + an + ':' + adir;
    if (ak !== this.animKey && this.sc.anims.exists(ak)) { this.anim.play({ key: ak, startFrame: 0 }); this.animKey = ak; }
    setL(this.anim, al * main, depth + 0.03);
    // the turn's other heading, fading
    if (turning) {
      const h2 = p.h2, d2 = MIRROR[h2] || h2;
      const ok = this.layered ? this.setStatic(this.ghost, 'base_' + d2) : this.setStatic(this.ghost, 'idle_' + d2 + '_0');
      if (ok) { this.ghost.setPosition(x, yy).setFlipX(!!MIRROR[h2]).setAlpha(al * (1 - main)).setDepth(depth + 0.035).setScale(sx, 1).setVisible(true); }
    } else this.ghost.setVisible(false);
    this.dir = dir; this.flip = flip;
    this.on = true;
    // hull contact on the water (collar + shadow)
    if (live) {
      if (!this.hull) this.hull = wv.addHull(x, y, d, h, { foam: 0.8, shadow: 0.24 });
      else wv.moveHull(this.hull, x, y, d, h);
    }
    this.wakeAndSmoke(p, al, moving, x, yy, depth, live);
    this.deckPeople(o, al, x, yy, depth);
    this.lights(x, yy, al);
  }

  wakeAndSmoke(p, al, moving, x, yy, depth, live) {
    const v = this.v, d = this.def, dt = v.dt;
    const fwd = moving && p.kind === 'move';
    if (fwd && al > 0.2) {
      const wk = WaterSheets.wake(p.h);
      if (this.sc.anims.exists(wk.key)) {
        if (!this.wake || this.wakeKey !== wk.key) { if (this.wake) this.wake.destroy(); this.wake = v.loop(wk.key, x, yy, Math.min(1500, 92 * (d.lengthM || 6)), WAKE_DEPTH); this.wakeKey = wk.key; }
        if (this.wake) this.wake.setPosition(x, yy).setFlipX(wk.flip).setAlpha(al * Math.min(1, Math.abs(p.v) / 60)).setDepth(WAKE_DEPTH + (depth % 1000) * 1e-4).setVisible(true);
      }
      this.ringT -= dt;
      if (this.ringT <= 0 && live) {
        this.ringT = RING_EVERY;
        const wp = pt(d.wakePoint, this.dir, this.flip);
        if (wp) v.water.ripple(x + wp[0], this.y + wp[1], Math.min(1.4, 0.5 + (d.lengthM || 5) / 16));
      }
    } else if (this.wake) this.wake.setVisible(false);
    // funnel smoke (moving; now and then while berthed)
    const sp = pt(d.smokePoint, this.dir, this.flip);
    if (sp && al > 0.3) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = moving ? SMOKE_EVERY : SMOKE_EVERY * 4;
        if (v.near(x, yy, 120)) v.fx('fx_smoke_puff', x + sp[0], yy + sp[1] - 6, (d.lengthM || 6) > 10 ? 72 : 48, depth + 0.05);
      }
    }
  }

  /** the ferry's passengers on the open decks (deckPoints, far -> near), waving while it comes in / leaves */
  deckPeople(o, al, x, yy, depth) {
    const v = this.v, pts = this.def.deckPoints && this.def.deckPoints[this.dir];
    const want = pts && o.deck && v.dollsOn() && al > 0.15 ? Math.min(DECK_MAX, o.deck.length, pts.length) : 0;
    while (this.deck.length > want) v.dropRig(this.deck.pop());
    for (let k = 0; k < want; k++) {
      if (!this.deck[k]) { const r = v.takeRig(o.deck[k]); if (!r) break; this.deck.push(r); }
      const r = this.deck[k];
      // pick spread-out points: every 2nd point from the front of the list
      const q = pts[Math.min(pts.length - 1, (k * 2 + 1) % pts.length)];
      const px = x + (this.flip ? -q[0] : q[0]), py = yy + q[1];
      const face = o.wave ? (k % 2 ? 'SE' : 'SW') : (k % 3 === 0 ? 'SW' : 'S');
      r.play(o.wave && (k + Math.floor(v.t / 2.2)) % 3 !== 2 ? 'wave' : 'idle', face);
      r.place(px, py, depth + 0.01 + q[1] * 1e-5, al);
    }
  }

  lights(x, yy, al) {
    const v = this.v, L = this.def.lightPoints && this.def.lightPoints[this.dir];
    if (!L || v.dark < 0.08 || al < 0.3) return;
    for (const n in L) { const q = L[n]; v.glow(x + (this.flip ? -q[0] : q[0]), yy + q[1], n === 'mast' ? 0.55 : 0.9, al); }
  }

  hide() {
    if (!this.on) return;
    this.on = false;
    for (const im of [this.base, this.ghost, this.foam, this.anim]) if (im) im.setVisible(false);
    for (const s of this.slots) s.setVisible(false);
    if (this.wake) { this.wake.destroy(); this.wake = null; this.wakeKey = ''; }
    while (this.deck.length) this.v.dropRig(this.deck.pop());
    const wv = this.v.water;
    if (this.hull && wv) { for (const c of this.hull) wv.removeContact(c); this.hull = null; }
    this.id = null;
  }

  destroy() { this.hide(); for (const im of [this.base, this.ghost, this.foam, this.anim]) if (im) im.destroy(); for (const s of this.slots) s.destroy(); }
}

/** could two hull rects overlap on screen? (x ∝ i + j; tall ships reach ~5 cells up the screen) */
function near(A, B) {
  const a = A.r, b = B.r;
  return a.i0 + a.j0 < b.i1 + b.j1 + 1 && b.i0 + b.j0 < a.i1 + a.j1 + 1 && (a.i0 - a.j1) < (b.i1 - b.j0) + 9 && (b.i0 - b.j1) < (a.i1 - a.j0) + 9;
}

/** which of two hull rects is nearer the camera: > 0 = a, < 0 = b (the axis with the larger gap decides) */
export function frontOf(a, b) {
  const gi = Math.max(a.i0 - b.i1, b.i0 - a.i1), gj = Math.max(a.j0 - b.j1, b.j0 - a.j1);
  if (gi <= 0 && gj <= 0) return ((a.i0 + a.i1) - (a.j0 + a.j1)) - ((b.i0 + b.i1) - (b.j0 + b.j1));
  if (gj > gi) return a.j1 <= b.j0 ? 1 : -1;
  return a.i0 >= b.i1 ? 1 : -1;
}

/** the fleet in view: which missions get a sprite, and what each one shows */
export class Fleet {
  constructor(view) {
    this.v = view;
    this.pool = {};          // key -> [ShipSprite] free
    this.live = new Map();   // mission id -> ShipSprite
    this.stats = { drawn: 0, atSea: 0 };
  }

  artReady(key) { const d = Assets.m.characters[key]; return !!(d && d.atlas && tex(d.atlas, (d.layered ? 'base_SE' : 'idle_SE_0'))); }

  update() {
    const v = this.v, m = v.model, T = v.T;
    const list = m.ships(T);
    const r = v.rect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const max = (v.cfg.budget && v.cfg.budget.ships) || 6;
    const want = [];
    for (const s of list) {
      const [x, y] = W(s.p.i, s.p.j);
      const half = shipCells(s.m.key).len * PX_PER_CELL * 0.6 + 260;
      if (x < r.x - half || x > r.x + r.width + half || y < r.y - half || y > r.y + r.height + half) continue;
      if (!this.artReady(s.m.key)) { v.wantArt(s.m.key); continue; }
      want.push({ s, d: Math.hypot(x - cx, (y - cy) * 2) });
    }
    want.sort((a, b) => a.d - b.d);
    const keep = new Set();
    for (let k = 0; k < Math.min(max, want.length); k++) keep.add(want[k].s.m.id);
    for (const [id, sp] of this.live) if (!keep.has(id)) { sp.hide(); this.live.delete(id); (this.pool[sp.key] = this.pool[sp.key] || []).push(sp); }
    this.stats.atSea = list.length; this.stats.drawn = 0;
    // depth: the anchor's y, then pairwise fixes for long hulls (a 21 m ship's centre says little about which end is
    // nearer): the pair is ordered on the axis that separates their hull rectangles most (lower j / higher i in front)
    const items = [];
    for (let k = 0; k < Math.min(max, want.length); k++) {
      const s = want[k].s, y = W(s.p.i, s.p.j)[1];
      items.push({ s, depth: y, r: hullRect(s.m.key, s.p) });
    }
    // the breakwater takes part (its tiles are sprites at one depth): ships on the inner lane pass behind it
    const bw = { depth: v.statics.bwDepth, r: BW_SORT, bw: true };
    items.push(bw);
    for (let pass = 0; pass < 3 && items.length > 1; pass++) {
      for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
        const A = items[a], B = items[b];
        if (!near(A, B)) continue;
        const f = frontOf(A.r, B.r), F = f > 0 ? A : B, K = f > 0 ? B : A;
        if (F.depth <= K.depth) { if (F.bw) K.depth = F.depth - 0.25; else F.depth = K.depth + 0.25; }
      }
    }
    v.statics.setBreakwaterDepth(bw.depth);
    for (const it of items) {
      if (it.bw) continue;
      const M = it.s.m, p = it.s.p;
      let sp = this.live.get(M.id);
      if (!sp) { sp = (this.pool[M.key] && this.pool[M.key].pop()) || new ShipSprite(v, M.key); this.live.set(M.id, sp); }
      sp.bind(M.id);
      const al = Math.max(0, Math.min(1, (T - M.T0) / FADE, (M.T1 - T) / FADE));
      sp.draw(p, al, this.opts(M, p, T), it.depth);
      this.stats.drawn++;
    }
  }

  /** what a ship shows: cargo slots, deck passengers, waving, the haul */
  opts(M, p, T) {
    const m = this.v.model, o = {};
    if (M.kind === 'cargo') {
      const C = m.crane;
      if (C.ship === M.id) o.loaded = C.loaded;
      else { const arr = (M.ev.find((e) => e.op === 'arrive') || {}).t; o.loaded = arr !== undefined && T > arr ? 6 : 6; }
    }
    if (M.kind === 'ferry') {
      const arr = (M.ev.find((e) => e.op === 'arrive') || {}).t, dep = (M.ev.find((e) => e.op === 'depart') || {}).t;
      // passengers on deck while it sails in and while it leaves (they come down the gangway at the berth)
      const atBerth = arr !== undefined && dep !== undefined && T >= arr + 2 && T < dep - 3;
      if (!atBerth) {
        o.deck = this.looks(M.id);
        o.wave = (arr !== undefined && T > arr - 28 && T < arr + 2) || (dep !== undefined && T > dep - 3 && T < dep + 16);
      }
    }
    if (M.kind === 'trawler' && p.tag === 'haul') o.haul = true;
    return o;
  }

  looks(id) {
    this._looks = this._looks || new Map();
    let l = this._looks.get(id);
    if (!l) {
      let h = 0; for (let k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) >>> 0;
      l = []; for (let k = 0; k < DECK_MAX; k++) l.push({ who: id + ':' + k, look: { preset: k === 0 ? 'sailor' : 'tourist', seed: (h + k * 7919) >>> 0 } });
      this._looks.set(id, l);
      if (this._looks.size > 24) this._looks.delete(this._looks.keys().next().value);
    }
    return l;
  }

  /** the sprite of a mission now drawn (crane depth, gull perches) */
  sprite(id) { return this.live.get(id) || null; }

  destroy() { for (const sp of this.live.values()) sp.destroy(); for (const k in this.pool) for (const sp of this.pool[k]) sp.destroy(); this.live.clear(); this.pool = {}; }
}
