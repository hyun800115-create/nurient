// Territory (v3): the land beyond the first village is hidden under a drifting snow-fog wall.
// Each region (data/world.js `territory`) opens when its watchtower is built and lit: the fog
// clears (sfx_fog_clear + fog_puff particles + camera pan) and the region's resources, roads,
// decor and build plots pop in. Also owns what depends on the revealed land: where people can
// walk (Collision.setWalkable), the camera bounds and the whole-village (overview) frame.

import { Assets } from '../core/Assets.js';
import { WORLD } from '../data/world.js';
import { BALANCE } from '../data/balance.js';
import { t } from '../data/strings.js';
import { DEPTH } from './DepthSort.js';
import { gdist2 } from '../core/Iso.js';

export const FOG_DEPTH = DEPTH.FLY - 1000;   // above every world object, below flying items / bubbles / arrows
const EDGE_IN = 46;        // the walkable land stops this far before the fog (px)
const CAM_PEEK = 260;      // how far the camera may look into the fog (px)
const FILL = 0xe6eef6;
/** (v4-C) the world's left edge (the west strip lies at negative x) */
const worldLeft = () => Math.min(0, Number(WORLD.left) || 0);

export class Territory {
  constructor(gs, saved) {
    this.gs = gs;
    this.regions = {};
    const T = WORLD.territory || { start: { rect: [worldLeft(), 0, WORLD.width, WORLD.height] } };
    for (const id in T) {
      const r = T[id];
      if (!r || !Array.isArray(r.rect)) continue;
      // (v4-C) `open: true` in world.js: open from the very start (the west strip beside the first village)
      this.regions[id] = { id, cfg: r, rect: r.rect, open: id === 'start' || r.open === true || !!(saved && saved[id]), objs: [], fog: null };
    }
    // (v4-A) a region that opens together with another one (rail with east): a save with that one open has it open too
    for (const id in this.regions) { const r = this.regions[id]; if (!r.open && r.cfg.openWith && this.regions[r.cfg.openWith] && this.regions[r.cfg.openWith].open) r.open = true; }
    this.t = 0;
    this.puffs = null;
    this.apply();
  }

  isOpen(id) { const r = this.regions[id || 'start']; return !r || r.open; }

  /** the region a world point lies in */
  regionAt(x, y) {
    for (const id in this.regions) { const r = this.regions[id].rect; if (x >= r[0] && x < r[2] && y >= r[1] && y < r[3]) return id; }
    return 'start';
  }

  /** an object that belongs to a region: hidden until the region opens.
   *  (v4-A) `until`: and hidden again for good once that other region opens (border pines that make room) */
  add(region, obj, until) {
    if (until && this.regions[until]) {
      obj.__until = until;
      (this.untilObjs || (this.untilObjs = [])).push(obj);
      if (this.regions[until].open) this.setObjEnabled(obj, false);
    }
    const r = this.regions[region];
    if (!r || region === 'start') return obj;
    r.objs.push(obj);
    if (!r.open) this.setObjEnabled(obj, false);
    return obj;
  }

  /** (v4-A) the big area a point lies in: 'village' (start, east, south, se) or 'neighbours' (rail, town) */
  areaOf(x) { return x >= ((WORLD.territory.rail && WORLD.territory.rail.rect[0]) || 1e9) ? 'neighbours' : 'village'; }

  /** (v4-A) bounding box of the open land of an area (the overview frames the area the chief is in) */
  areaRect(area) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id in this.regions) {
      const r = this.regions[id];
      if (!r.open || this.areaOf((r.rect[0] + r.rect[2]) / 2) !== area) continue;
      x0 = Math.min(x0, r.rect[0]); y0 = Math.min(y0, r.rect[1]); x1 = Math.max(x1, r.rect[2]); y1 = Math.max(y1, r.rect[3]);
    }
    if (!Number.isFinite(x0)) return this.camRect;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  setObjEnabled(o, v) {
    if (v && o.__until && this.isOpen(o.__until)) v = false;
    if (o.setEnabled) o.setEnabled(v);
    else { if (o.setVisible) o.setVisible(v); if (o.__ob) o.__ob.active = v; }
  }

  // ------------------------------------------------------------------ walkable land / camera
  /** walkable rects: every open region inset from the fog / map edge, plus bridges where two open regions touch */
  walkRects() {
    const open = Object.values(this.regions).filter((r) => r.open);
    const W = WORLD.width, H = WORLD.height, X0 = worldLeft();
    const out = [];
    for (const r of open) {
      const [x0, y0, x1, y1] = r.rect;
      out.push([Math.max(X0 + 40, x0 + EDGE_IN), Math.max(0, y0 + (y0 > 0 ? EDGE_IN : 0)), Math.min(W - 40, x1 - EDGE_IN), Math.min(H - 40, y1 - EDGE_IN)]);
    }
    for (let i = 0; i < open.length; i++) {
      for (let j = 0; j < open.length; j++) {
        if (i === j) continue;
        const a = open[i].rect, b = open[j].rect;
        // a's right edge on b's left edge
        if (a[2] === b[0]) { const ya = Math.max(a[1], b[1]), yb = Math.min(a[3], b[3]); if (yb - ya > 2 * EDGE_IN) out.push([a[2] - EDGE_IN - 2, ya + (ya > 0 ? EDGE_IN : 0), a[2] + EDGE_IN + 2, yb - EDGE_IN]); }
        // a's bottom edge on b's top edge
        if (a[3] === b[1]) { const xa = Math.max(a[0], b[0]), xb = Math.min(a[2], b[2]); if (xb - xa > 2 * EDGE_IN) out.push([Math.max(X0 + 40, xa + EDGE_IN), a[3] - EDGE_IN - 2, Math.min(W - 40, xb - EDGE_IN), a[3] + EDGE_IN + 2]); }
      }
    }
    return out;
  }

  applyWalk() {
    const gs = this.gs;
    if (!gs.collision) return;
    const open = Object.values(this.regions).filter((r) => r.open).map((r) => r.rect);
    gs.collision.setWalkable(open, this.walkRects(), EDGE_IN);
  }

  /** bounding box of the open land (+ a peek into the fog where there is fog) */
  bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id in this.regions) {
      const r = this.regions[id];
      if (!r.open) continue;
      x0 = Math.min(x0, r.rect[0]); y0 = Math.min(y0, r.rect[1]); x1 = Math.max(x1, r.rect[2]); y1 = Math.max(y1, r.rect[3]);
    }
    const hidden = Object.values(this.regions).filter((r) => !r.open);
    const touches = (side) => hidden.some((r) => {
      const q = r.rect;
      if (side === 'r') return q[0] >= x1 - 1 && q[1] < y1 && q[3] > y0;
      if (side === 'b') return q[1] >= y1 - 1 && q[0] < x1 && q[2] > x0;
      if (side === 'l') return q[2] <= x0 + 1 && q[1] < y1 && q[3] > y0;
      return false;
    });
    if (touches('r')) x1 += CAM_PEEK;
    if (touches('b')) y1 += CAM_PEEK;
    if (touches('l')) x0 -= CAM_PEEK;
    const X0 = worldLeft();
    return { x: Math.max(X0, x0), y: Math.max(0, y0), w: Math.min(WORLD.width, x1) - Math.max(X0, x0), h: Math.min(WORLD.height, y1) - Math.max(0, y0) };
  }

  /** walkable land + camera bounds + fog walls follow the open regions */
  apply() {
    const gs = this.gs;
    this.applyWalk();
    const b = this.bounds();
    this.camRect = b;
    if (gs.cameras && gs.cameras.main && !gs.overview && !gs._freeCam) gs.cameras.main.setBounds(b.x, b.y, b.w, b.h);
    this.buildFog();
  }

  // ------------------------------------------------------------------ fog
  /** does region `r`'s side face open land? side: t / b / l / r -> list of [from, to] spans along it */
  exposedSpans(r, side) {
    const [x0, y0, x1, y1] = r.rect;
    const spans = [];
    for (const id in this.regions) {
      const o = this.regions[id];
      if (!o.open) continue;
      const q = o.rect;
      if (side === 't' && q[3] === y0) { const a = Math.max(x0, q[0]), b = Math.min(x1, q[2]); if (b > a) spans.push([a, b]); }
      if (side === 'b' && q[1] === y1) { const a = Math.max(x0, q[0]), b = Math.min(x1, q[2]); if (b > a) spans.push([a, b]); }
      if (side === 'l' && q[2] === x0) { const a = Math.max(y0, q[1]), b = Math.min(y1, q[3]); if (b > a) spans.push([a, b]); }
      if (side === 'r' && q[0] === x1) { const a = Math.max(y0, q[1]), b = Math.min(y1, q[3]); if (b > a) spans.push([a, b]); }
    }
    return spans;
  }

  buildFog() {
    for (const id in this.regions) {
      const r = this.regions[id];
      if (r.fog) { this.destroyFog(r.fog, r.open ? null : 0); r.fog = null; }
      if (!r.open) r.fog = this.makeFog(r);
    }
  }

  destroyFog(f) { for (const o of f.parts) o.destroy(); }

  makeFog(r) {
    const gs = this.gs;
    const [x0, y0, x1, y1] = r.rect;
    const parts = [], scrollers = [], puffs = [];
    const lt = this.exposedSpans(r, 'l'), tp = this.exposedSpans(r, 't');
    // (v4-A) fog on all four sides: the right / bottom edge can face open land too (se beside the rail strip)
    const rt = this.exposedSpans(r, 'r'), bt = this.exposedSpans(r, 'b');
    // solid fog body (starts a little inside the exposed edges, where the billows take over)
    const fx0 = lt.length ? x0 + 150 : x0, fy0 = tp.length ? y0 + 150 : y0;
    const fx1 = rt.length ? x1 - 150 : x1, fy1 = bt.length ? y1 - 150 : y1;
    const fill = gs.add.rectangle(fx0, fy0, fx1 - fx0, fy1 - fy0, FILL, 1).setOrigin(0, 0).setDepth(FOG_DEPTH);
    parts.push(fill);
    const hasBank = Assets.has('fog_bank');
    // top edge facing open land (the land is north of the fog): the fog bank wall, flipped so its billows face the village
    for (const [a, b] of tp) {
      if (hasBank) {
        const bank = gs.add.tileSprite(a, y0 - 70, b - a, 256, Assets.sprite('fog_bank').tex).setOrigin(0, 0).setFlipY(true).setDepth(FOG_DEPTH + 1);
        bank.__speed = 6; parts.push(bank); scrollers.push(bank);
        if (Assets.has('fog_bank_mid')) {
          const mid = gs.add.tileSprite(a, y0 - 110, b - a, 192, Assets.sprite('fog_bank_mid').tex).setOrigin(0, 0).setFlipY(true).setDepth(FOG_DEPTH + 2).setAlpha(0.9);
          mid.__speed = -13; parts.push(mid); scrollers.push(mid);
        }
        if (Assets.has('fog_bank_front')) {
          const fr = gs.add.tileSprite(a, y0 - 150, b - a, 128, Assets.sprite('fog_bank_front').tex).setOrigin(0, 0).setFlipY(true).setDepth(FOG_DEPTH + 3).setAlpha(0.85);
          fr.__speed = 30; parts.push(fr); scrollers.push(fr);
        }
      } else {
        const g = gs.add.rectangle(a, y0 - 20, b - a, 190, FILL, 0.92).setOrigin(0, 0).setDepth(FOG_DEPTH + 1);
        parts.push(g);
      }
      // billows along the edge so the wall line is never straight
      for (let x = a + 40; x < b; x += 150) puffs.push(this.puff(x + (Math.random() - 0.5) * 60, y0 + 40 + Math.random() * 30, 1.6 + Math.random() * 0.8, parts));
    }
    // left edge facing open land (the land is west of the fog): the fog bank turned on its side (its
    // billows face the village and drift slowly), with a few big loose billows in front
    for (const [a, b] of lt) {
      if (hasBank) {
        const wall = gs.add.tileSprite(x0 + 200, a - 60, b - a + 120, 256, Assets.sprite('fog_bank').tex).setOrigin(0, 0).setAngle(90).setDepth(FOG_DEPTH + 1);
        wall.__speed = 5; parts.push(wall); scrollers.push(wall);
        if (Assets.has('fog_bank_mid')) {
          const mid = gs.add.tileSprite(x0 + 120, a - 60, b - a + 120, 192, Assets.sprite('fog_bank_mid').tex).setOrigin(0, 0).setAngle(90).setDepth(FOG_DEPTH + 2).setAlpha(0.85);
          mid.__speed = -11; parts.push(mid); scrollers.push(mid);
        }
      }
      for (let y = a; y < b; y += 160 + Math.random() * 120) puffs.push(this.puff(x0 + 10 + Math.random() * 50, y, 1.5 + Math.random() * 1.1, parts));
    }
    // (v4-A) right edge facing open land (the land is east of the fog): the left wall, mirrored
    for (const [a, b] of rt) {
      if (hasBank) {
        const wall = gs.add.tileSprite(x1 - 200, b + 60, b - a + 120, 256, Assets.sprite('fog_bank').tex).setOrigin(0, 0).setAngle(-90).setDepth(FOG_DEPTH + 1);
        wall.__speed = 5; parts.push(wall); scrollers.push(wall);
        if (Assets.has('fog_bank_mid')) {
          const mid = gs.add.tileSprite(x1 - 120, b + 60, b - a + 120, 192, Assets.sprite('fog_bank_mid').tex).setOrigin(0, 0).setAngle(-90).setDepth(FOG_DEPTH + 2).setAlpha(0.85);
          mid.__speed = -11; parts.push(mid); scrollers.push(mid);
        }
      } else parts.push(gs.add.rectangle(x1 - 170, a, 190, b - a, FILL, 0.92).setOrigin(0, 0).setDepth(FOG_DEPTH + 1));
      for (let y = a; y < b; y += 160 + Math.random() * 120) puffs.push(this.puff(x1 - 10 - Math.random() * 50, y, 1.5 + Math.random() * 1.1, parts));
    }
    // (v4-A) bottom edge facing open land (the land is south of the fog): the bank with its billows facing down
    for (const [a, b] of bt) {
      if (hasBank) {
        const bank = gs.add.tileSprite(a, y1 + 70 - 256, b - a, 256, Assets.sprite('fog_bank').tex).setOrigin(0, 0).setDepth(FOG_DEPTH + 1);
        bank.__speed = 6; parts.push(bank); scrollers.push(bank);
      } else parts.push(gs.add.rectangle(a, y1 - 170, b - a, 190, FILL, 0.92).setOrigin(0, 0).setDepth(FOG_DEPTH + 1));
      for (let x = a + 40; x < b; x += 150) puffs.push(this.puff(x + (Math.random() - 0.5) * 60, y1 - 40 - Math.random() * 30, 1.6 + Math.random() * 0.8, parts));
    }
    return { parts, scrollers, puffs, fill, rect: r.rect };
  }

  puff(x, y, sc, parts) {
    const gs = this.gs;
    const key = Assets.has('fog_puff') ? 'fog_puff' : null;
    let p;
    if (key) p = Assets.image(gs, x, y, key).setScale(sc);
    else p = gs.add.ellipse(x, y, 128 * sc, 96 * sc, FILL, 1);
    p.setDepth(FOG_DEPTH + 1 + (y % 97) * 0.001);
    p.__x = x; p.__y = y; p.__s = sc; p.__ph = Math.random() * 6.28;
    parts.push(p);
    return p;
  }

  update(dt) {
    this.t += dt;
    const v = this.gs.cameras.main.worldView;
    for (const id in this.regions) {
      const f = this.regions[id].fog;
      if (!f || f.fading) continue;
      const [x0, y0, x1, y1] = f.rect;
      if (x1 < v.x - 300 || x0 > v.right + 300 || y1 < v.y - 300 || y0 > v.bottom + 300) continue;
      for (const s of f.scrollers) s.tilePositionX += s.__speed * dt;
      for (const p of f.puffs) {
        if (p.__x < v.x - 300 || p.__x > v.right + 300 || p.__y < v.y - 300 || p.__y > v.bottom + 300) continue;
        const k = this.t * 0.35 + p.__ph;
        p.x = p.__x + Math.sin(k) * 14;
        p.y = p.__y + Math.cos(k * 0.8) * 6;
      }
    }
  }

  // ------------------------------------------------------------------ reveal
  /** region `id` opens (instant = restoring a save). (v4-A) quiet: no camera pan / banner of its own
   *  (a region opening together with another one); regions with `openWith: id` open in the same frame */
  reveal(id, instant, quiet) {
    const gs = this.gs;
    const r = this.regions[id];
    if (!r || r.open) return false;
    r.open = true;
    const oldFog = r.fog;
    r.fog = null;
    for (const o of r.objs) this.setObjEnabled(o, true);
    // (v4-A) border pines that make room for this land
    for (const o of this.untilObjs || []) if (o.__until === id) this.setObjEnabled(o, false);
    // (v4-A) land that opens together with this one (the rail strip with the east coast)
    for (const k in this.regions) {
      const q = this.regions[k];
      if (!q.open && q.cfg.openWith === id) {
        q.open = true;
        if (q.fog) { const f = q.fog; q.fog = null; if (instant) this.destroyFog(f); else { f.fading = true; for (const p of f.parts) gs.tweens.add({ targets: p, alpha: 0, duration: 1600, delay: 300 }); gs.time.delayedCall(2100, () => this.destroyFog(f)); } }
        for (const o of q.objs) this.setObjEnabled(o, true);
        for (const o of this.untilObjs || []) if (o.__until === k) this.setObjEnabled(o, false);
        if (gs.regionRoads && gs.regionRoads[k]) { const ov = gs.regionRoads[k]; if (instant) ov.setAlpha(1); else gs.tweens.add({ targets: ov, alpha: 1, duration: 900, delay: 700 }); }
        if (instant) gs.events.emit('region', k, true); else gs.time.delayedCall(950, () => gs.events.emit('region', k, false));
      }
    }
    if (gs.roads) gs.roads.invalidate();
    if (gs.regionRoads && gs.regionRoads[id]) {
      const ov = gs.regionRoads[id];
      if (instant) ov.setAlpha(1); else gs.tweens.add({ targets: ov, alpha: 1, duration: 900, delay: 700 });
    }
    // fog of the other hidden regions is rebuilt for the new open edges (fades in)
    for (const k in this.regions) {
      const o = this.regions[k];
      if (k === id || o.open) continue;
      if (o.fog) this.destroyFog(o.fog);
      o.fog = this.makeFog(o);
      if (!instant) for (const p of o.fog.parts) { const a = p.alpha; p.setAlpha(0); gs.tweens.add({ targets: p, alpha: a, duration: 900 }); }
    }
    const b = this.bounds();
    this.camRect = b;
    this.applyWalk();
    if (instant) {
      if (oldFog) this.destroyFog(oldFog);
      if (!gs.overview && !gs._freeCam) gs.cameras.main.setBounds(b.x, b.y, b.w, b.h);
      gs.events.emit('region', id, true);
      return true;
    }
    // the clearing: whoosh, billows rolling away, the land and its things popping in
    const [cx, cy] = r.cfg.center || [(r.rect[0] + r.rect[2]) / 2, (r.rect[1] + r.rect[3]) / 2];
    if (!gs.overview && !gs._freeCam) gs.cameras.main.setBounds(b.x, b.y, b.w, b.h);
    if (!quiet) gs.focusCamera(cx, cy, BALANCE.camera.revealPanMs + 2600);
    gs.sfxAt('sfx_fog_clear', cx, cy, { volume: 0.9 }, true);
    if (oldFog) {
      oldFog.fading = true;
      for (const p of oldFog.parts) {
        const dx = p.__x !== undefined ? (p.__x < cx ? -1 : 1) * 90 : 0;
        gs.tweens.add({ targets: p, alpha: 0, x: p.x + dx, scaleX: p.scaleX * (p.__s ? 1.5 : 1), scaleY: p.scaleY * (p.__s ? 1.5 : 1), duration: 1500 + Math.random() * 500, delay: 250 + Math.random() * 250, ease: 'Sine.easeIn' });
      }
      gs.time.delayedCall(2400, () => this.destroyFog(oldFog));
    }
    this.burstPuffs(r);
    const objs = [];
    for (const o of r.objs) {
      if (o.revealObjects) objs.push(...o.revealObjects());
      else if (o.img) objs.push(o.img);
      else if (o.sprite) objs.push(o.sprite);
      else objs.push(o);
    }
    const near = objs.filter((o) => o && o.setScale && gs.isOnScreen(o.x, o.y, 500));
    near.sort((a, c) => gdist2(a.x, a.y, cx, cy) - gdist2(c.x, c.y, cx, cy));
    near.forEach((o, i) => {
      const sx = o.scaleX, sy = o.scaleY;
      o.setScale(0.01);
      gs.tweens.add({ targets: o, scaleX: sx, scaleY: sy, duration: 420, delay: 900 + i * 18, ease: 'Back.easeOut' });
    });
    if (!quiet) gs.time.delayedCall(1000, () => { gs.ui.banner(t('newLand'), t(r.cfg.name || 'r_east')); if (gs.life) gs.life.cheer(); });
    gs.time.delayedCall(900, () => gs.events.emit('region', id, false));
    return true;
  }

  /** fog billows roll away from the opened region's edges */
  burstPuffs(r) {
    const gs = this.gs;
    if (!Assets.has('fog_puff')) return;
    if (!this.puffs) {
      this.puffs = gs.add.particles(0, 0, Assets.sprite('fog_puff').tex, {
        lifespan: { min: 900, max: 1500 }, speed: { min: 40, max: 140 }, angle: { min: 0, max: 360 },
        scale: { start: 0.6, end: 1.6 }, alpha: { start: 1, end: 0 }, emitting: false,
      }).setDepth(FOG_DEPTH + 5);
    }
    const [x0, y0, x1, y1] = r.rect;
    const v = gs.cameras.main.worldView;
    // along the edges that faced the land, and scattered over the part on screen
    const pts = [];
    for (const [a, b] of this.exposedSpans(r, 't')) for (let x = a; x < b; x += 90) pts.push([x, y0 + 40]);
    for (const [a, b] of this.exposedSpans(r, 'l')) for (let y = a; y < b; y += 90) pts.push([x0 + 60, y]);
    for (const [a, b] of this.exposedSpans(r, 'r')) for (let y = a; y < b; y += 90) pts.push([x1 - 60, y]);
    for (let i = 0; i < 26; i++) pts.push([Math.max(x0, v.x) + Math.random() * (Math.min(x1, v.right) - Math.max(x0, v.x)), Math.max(y0, v.y) + Math.random() * (Math.min(y1, v.bottom) - Math.max(y0, v.y))]);
    let n = 0;
    for (const [x, y] of pts) {
      if (!gs.isOnScreen(x, y, 400) || n > 70) continue;
      n++;
      gs.time.delayedCall(Math.random() * 600, () => this.puffs.explode(1, x, y));
    }
  }

  serialize() {
    const o = {};
    // ((v4-C) land open from the start — the west strip — is not saved: it is open in every game)
    for (const id in this.regions) if (id !== 'start' && this.regions[id].open && this.regions[id].cfg.open !== true) o[id] = true;
    return o;
  }
}
