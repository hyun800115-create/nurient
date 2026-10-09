// Residency (v4-B, docs/v4_plan.md §11.3b): the texture budget. Measures what is resident (Phaser source-sum
// w·h·4, the v3.5 reviewers' probe), loads on-demand pages (a resident's social anims, the townsfolk's social
// frames) when a character asks for them, and evicts them again: unused for `socialTtl` s, the least recently
// used first when more than `socialPages` resident pages are wanted, or anything unused when the total is over
// the soft budget (target − softGap). Over the hard budget no new on-demand page is loaded (the character plays
// the fallback anim). A page is never removed while something on screen shows it.

import { Assets } from './Assets.js';
import { TF } from './Townfolk.js';
import { BALANCE } from '../data/balance.js';
import { WORLD } from '../data/world.js';

const TF_SOC_ANIMS = new Set(['talk', 'wave', 'happy']);

/** take an animation out for good: Phaser's anims.remove() only unlists it — the Animation keeps its
 *  'pauseall' / 'resumeall' listeners on the manager and its frames (a leak on every evict / reload) */
function dropAnim(g, key) {
  const a = g.anims.get(key);
  if (!a) return;
  if (typeof a.destroy === 'function') a.destroy(); else g.anims.remove(key);
}
// (v4-B) building pictures that belong to one area: out of memory while the camera is far from it (§11.3b
// `regionBld`), back when it comes near. Rects in world px [x0, y0, x1, y1].
// (the district by our station uses the street props and the townhouses too: those belong to rail strip + town)
const REGIONS = [
  { id: 'town', rect: [4150, 0, 6144, 3450], pages: ['town_civic@rest', 'town_civic@hall', 'town_shops@a', 'town_park'] },
  { id: 'east', rect: [3000, 0, 6144, 3450], pages: ['town_homes', 'town_street'] },
  // ((v4-C) from the west strip's edge, WORLD.left. The town art the village uses too stays while the camera is near
  //  the village — but only once the village has it: the hall's page when the town hall stands, the park page when a
  //  playground / fountain park does (else a tour of the town would leave those pages in memory back home))
  { id: 'village', rect: [Math.min(0, Number(WORLD.left) || 0), 0, 3000, 3450], pages: ['bld_buildings', 'bld_buildings_2', 'boat_rowboat', 'boat_fishing'],
    extra: (gs) => {
      const cv = gs.civic, out = [];
      if (!cv) return out;
      if (cv.hall) out.push('town_civic@hall');
      if (cv.amenities.some((a) => a.key === 'deco_playground' || a.key === 'deco_fountain')) out.push('town_park');
      return out;
    } },
];
const ACQUIRE = 800, RELEASE = 1200;      // px between the view and the area

export const Residency = {
  gs: null,
  checkT: 0,
  total: 0,         // MiB resident (source-sum)
  peak: 0,
  byCls: {},
  loads: 0,
  evictions: 0,
  refused: 0,
  overHardT: 0,     // s the total has been over the hard budget (a `budget` event after 2 s)
  budgetEvents: 0,
  use: {},          // page key -> last use (scene ms)
  tfAge: {},        // townsfolk age group -> last social use (ms)

  attach(gs) {
    this.gs = gs;
    this.checkT = 0;
    this.use = {};
    this.tfAge = {};
    Assets.tfSocial = (age, anim) => !TF_SOC_ANIMS.has(anim) || !Assets.packed || this.wantTf(age);
    const onArrive = (key) => this.arrived(key);
    Assets.arrivals.push(onArrive);
    gs.events.once('shutdown', () => { const i = Assets.arrivals.indexOf(onArrive); if (i >= 0) Assets.arrivals.splice(i, 1); if (this.gs === gs) this.gs = null; });
    this.measure();
  },

  cfg() { return (BALANCE.v4 && BALANCE.v4.tex) || { targetMiB: 300, softGap: 24, lowMiB: 200, socialPages: 5, socialTtl: 30 }; },
  low() { return !!(this.gs && this.gs.gfxLow); },
  budget() {
    const T = this.cfg();
    const hard = this.low() ? T.lowMiB : T.targetMiB;
    return { soft: hard - (T.softGap || 24), hard, must: T.mustMiB || 455 };
  },
  now() { return this.gs ? this.gs.time.now : 0; },

  /** source-sum of every texture (MiB), by class */
  measure() {
    const g = this.gs && this.gs.game;
    if (!g) return this.total;
    const list = g.textures.list;
    let tot = 0;
    const by = this.byCls = {};
    for (const k in list) {
      if (k === '__DEFAULT' || k === '__MISSING' || k === '__NORMAL' || k === '__WHITE') continue;
      const t = list[k];
      let b = 0;
      for (const s of t.source) b += s.width * s.height * 4;
      tot += b;
      const a = Assets.m.atlases[k];
      const cls = a && a.cls ? (a.onDemand ? 'social' : 'page') : /^fv_(gslot|layer)/.test(k) ? 'ground' : t.source[0] && t.source[0].isCanvas ? 'canvas' : 'atlas';
      by[cls] = (by[cls] || 0) + b / 1048576;
    }
    this.total = tot / 1048576;
    if (this.total > this.peak) this.peak = this.total;
    return this.total;
  },

  /** on-demand character pages resident or on their way (`loadedOnly`: resident only) */
  residentSocial(loadedOnly) {
    const tex = this.gs.game.textures, out = [];
    for (const k of Assets.demanded) { const a = Assets.m.atlases[k]; if (a && a.onDemand && a.format !== 'tfatlas' && (!loadedOnly || tex.exists(k))) out.push(k); }
    return out;
  },

  /**
   * a character wants an anim of on-demand page `page`: true when it is resident (touched); otherwise it is
   * fetched when the budget allows (the character plays its fallback anim meanwhile)
   */
  want(page) {
    const gs = this.gs;
    if (!gs || !page) return false;
    this.use[page] = this.now();
    if (gs.game.textures.exists(page)) return true;
    if (Assets.demanded.has(page)) return false;          // on its way
    const B = this.budget(), T = this.cfg();
    // (the soft / hard budgets make unused pages go sooner; a new one is refused only near the must)
    const a = Assets.m.atlases[page];
    if (this.total + (a && a.bytes ? a.bytes / 1048576 : 4) > B.must - 30) { this.refused++; return false; }
    // at most `socialPages` resident or loading (the least recently used one makes room)
    const res = this.residentSocial();
    const cap = this.low() ? Math.min(2, T.socialPages) : T.socialPages;
    if (res.length >= cap && !this.evictLRU(res.filter((k) => this.gs.game.textures.exists(k)), 2000)) { this.refused++; return false; }
    return this.demand([page]);
  },

  demand(keys) {
    const gs = this.gs;
    let n = 0;
    for (const k of keys) { if (Assets.demanded.has(k) || gs.game.textures.exists(k)) continue; Assets.demanded.add(k); Assets.queued.delete(k); n++; }
    if (n) { this.loads += n; if (gs.queueLateFiles) gs.queueLateFiles(); }
    return false;
  },

  // ---------------------------------------------------------------- townsfolk social frames
  isTfSoc(anim) { return TF_SOC_ANIMS.has(anim); },
  /** the social pages an age group needs (heads + its bodies) */
  tfSocPages(age) {
    const out = [];
    for (const k of TF.sheetsFor(age, true)) { const P = Assets.pages[k]; if (P) for (const p of P) if (Assets.m.atlases[p].onDemand) out.push(p); }
    return out;
  },
  tfSocReady(age) { const P = this.tfSocPages(age); return P.length > 0 && P.every((p) => Assets.tfReady.has(p)); },
  /** a doll wants a social anim: allowed in the town area at zoom >= 0.9 (plan §11.3b), within the budget */
  wantTf(age) {
    const gs = this.gs;
    if (!gs || this.low()) return false;
    const P = this.tfSocPages(age);
    if (!P.length) return false;
    this.tfAge[age] = this.now();
    for (const p of P) this.use[p] = this.now();
    if (P.every((p) => Assets.tfReady.has(p))) return true;
    if ((gs.zoomCur || 1) < 0.9) return false;
    const T = gs.territory, px = gs.player ? gs.player.x : 0;
    if (T && T.areaOf && T.areaOf(px) !== 'town' && !(gs.v4 && gs.v4.inTown && gs.v4.inTown())) return false;
    const need = P.reduce((n, p) => n + ((Assets.m.atlases[p] && Assets.m.atlases[p].bytes) || 0), 0) / 1048576;
    if (this.total + need > this.budget().must - 30) { this.refused++; return false; }
    return this.demand(P);
  },

  /** a page arrived: characters waiting in a social act play it now */
  arrived(key) {
    const a = Assets.m.atlases[key];
    if (!a || !a.onDemand || a.format === 'tfatlas' || !this.gs) return;
    const own = Assets.pageOwner[key];
    for (const o of this.gs.children.list) {
      const ch = o.__ch;
      if (!ch || !ch.alive || !ch.def || ch.def.atlas !== own || !ch.animName) continue;
      if (Assets.socialPage(own, ch.animName) === key) { ch.animKey = ''; ch.play(ch.animName, true); }
    }
  },

  // ---------------------------------------------------------------- eviction
  /** is something visible on screen showing page `key`? */
  displayed(key) {
    for (const o of this.gs.children.list) if (o.visible && o.texture && o.texture.key === key) return true;
    return false;
  },

  /** evict the least recently used page of `list` not on screen and unused for `minAge` ms; true if one went */
  evictLRU(list, minAge) {
    const now = this.now();
    const c = list.slice().sort((a, b) => (this.use[a] || 0) - (this.use[b] || 0));
    for (const k of c) {
      if (now - (this.use[k] || 0) < minAge) continue;
      if (this.evict(k)) return true;
    }
    return false;
  },

  /** remove an on-demand page (its anims and frames first); false while it is on screen */
  evict(key) {
    const gs = this.gs, g = gs.game;
    const a = Assets.m.atlases[key];
    if (!a || !a.onDemand || !g.textures.exists(key)) return false;
    if (this.displayed(key)) { this.use[key] = this.now(); return false; }
    const own = Assets.pageOwner[key];
    if (a.format === 'tfatlas') {
      // dolls in a social anim go back to idle (their rig images then point at loco frames)
      const pool = gs.dollPool;
      if (pool) for (const d of pool.dolls) if (TF_SOC_ANIMS.has(d.anim)) d.setAnim('idle', d.baseDir, 0);
      TF.clearFrames(key);
      Assets.tfReady.delete(key);
    } else {
      // the character anims made from this page go; characters that play one turn to their fallback
      const anims = new Set();
      for (const an in Assets.animPage) if (Assets.animPage[an] === key) anims.add(an.slice(own.length + 1));
      for (const c in Assets.m.characters) {
        const d = Assets.m.characters[c];
        if (!d || d.atlas !== own) continue;
        const def = Assets.charDef(c);
        for (const an of anims) {
          for (const dir of ['S', 'SE', 'E', 'NE', 'N']) dropAnim(g, c + ':' + an + ':' + dir);
          if (def._dirs) def._dirs[an] = [];
        }
      }
      for (const o of gs.children.list) {
        const ch = o.__ch;
        if (ch && ch.alive && ch.def && ch.def.atlas === own && anims.has(ch.animRes)) { ch.animKey = ''; ch.play(ch.animName || 'idle', true); }
      }
    }
    // hidden pictures still pointing at it (a spare rig image, a sprite out of view)
    for (const o of gs.children.list) {
      if (o.texture && o.texture.key === key) {
        if (o.anims && o.anims.isPlaying) o.anims.stop();
        if (o.setTexture) o.setTexture('__WHITE');
        o.setVisible(false);
      }
    }
    g.textures.remove(key);
    Assets.demanded.delete(key);
    Assets.queued.delete(key);
    delete this.use[key];
    this.evictions++;
    return true;
  },

  // ---------------------------------------------------------------- areas (regionBld)
  /** the sprite key that shows frame `fr` of texture `tex` (reverse manifest lookup, cached) */
  spriteOf(tex, fr) {
    if (!this._rev) {
      this._rev = new Map();
      for (const sk in Assets.m.sprites) { const d = Assets.m.sprites[sk]; if (d && d.atlas) this._rev.set(d.atlas + '|' + d.frame, sk); else if (d && d.image) this._rev.set(d.image + '|__BASE', sk); }
    }
    const own = Assets.pageOwner[tex] || tex;
    return this._rev.get(own + '|' + fr) || this._rev.get(own + '|__BASE') || (Assets.m.images[own] ? own : null);
  },

  /** px between the view and an area rect */
  areaGap(view, R) {
    const dx = Math.max(0, R[0] - view.right, view.x - R[2]);
    const dy = Math.max(0, R[1] - view.bottom, view.y - R[3]);
    return Math.max(dx, dy);
  },

  regionTick() {
    const gs = this.gs, tex = gs.game.textures;
    // where the camera is going (its follow target): the world view is only refreshed when a frame is drawn
    const cam = gs.cameras.main, z = Math.max(0.05, cam.zoom || 1), ct = gs.camTarget;
    const w = cam.width / z, h = cam.height / z;
    const view = ct ? { x: ct.x - w / 2, right: ct.x + w / 2, y: ct.y - h / 2, bottom: ct.y + h / 2 } : cam.worldView;
    const T = this.cfg();
    const ttl = (T.townTtl || 10);
    this.areas = this.areas || {};
    // (v4-C) a page may belong to more than one area (the village's town hall and park props are town art too):
    // it goes only once every area that lists it has been far for `ttl` s, and comes back when any is near
    const far = new Map(), near = new Map();
    for (const R of REGIONS) {
      const st = this.areas[R.id] || (this.areas[R.id] = { farT: 0, out: false });
      const gap = st.gap = this.areaGap(view, R.rect);
      if (gap > RELEASE) st.farT += 0.5; else st.farT = 0;
      for (const k of R.extra ? R.pages.concat(R.extra(gs)) : R.pages) {
        if (!(Assets.m.atlases[k] || Assets.m.images[k])) continue;
        far.set(k, (far.has(k) ? far.get(k) : true) && st.farT >= ttl);
        near.set(k, (near.get(k) || false) || gap < ACQUIRE);
      }
    }
    if (!gs.camFocus) {
      const go = [];
      for (const [k, f] of far) if (f && tex.exists(k)) go.push(k);
      if (go.length) this.evictArea(go);
    }
    const back = [];
    for (const [k, n] of near) if (n && Assets.held.has(k)) back.push(k);
    if (back.length) {
      for (const k of back) { Assets.held.delete(k); Assets.queued.delete(k); }
      this.loads += back.length;
      if (gs.queueLateFiles) gs.queueLateFiles();
      if (gs.checkLazyGates) { gs.lazyGateT = 0; }
    }
    for (const R of REGIONS) { const st = this.areas[R.id]; st.out = R.pages.every((k) => !tex.exists(k)); }
  },

  /** take an area's building pictures out of memory: what shows them gets a stand-in and is re-skinned on arrival */
  evictArea(pages) {
    const gs = this.gs, g = gs.game, tex = g.textures;
    const set = new Set(pages.filter((k) => tex.exists(k)));
    if (!set.size) return false;
    if (!tex.exists('fv_blank')) { const c = tex.createCanvas('fv_blank', 2, 2); if (c) c.refresh(); }
    // loop anims made from these pictures go (Assets.onLazyFile makes them again)
    const drop = [];
    g.anims.anims.each((key, a) => { if (a.frames.some((f) => set.has(f.textureKey))) drop.push(key); });
    for (const o of gs.children.list.slice()) {
      if (!o.texture || !set.has(o.texture.key)) continue;
      const loop = o.anims && o.anims.isPlaying && o.anims.currentAnim ? o.anims.currentAnim.key : null;
      if (o.anims) o.anims.stop();
      const sk = this.spriteOf(o.texture.key, o.frame ? o.frame.name : '__BASE');
      o.setTexture('fv_blank');
      if (sk && gs.lazyImgs) gs.lazyImgs.push({ img: o, key: sk, after: loop ? (img) => { if (img.anims && g.anims.exists(loop)) img.anims.play(loop); } : null });
    }
    for (const k of drop) dropAnim(g, k);
    for (const k of set) { tex.remove(k); Assets.held.add(k); Assets.queued.delete(k); }
    Assets.cache.clear();
    this.evictions += set.size;
    return true;
  },

  /** every 0.5 s: measure, evict what is old / over budget */
  tick(dt) {
    const gs = this.gs;
    if (!gs) return;
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 0.5;
    if (Assets.packed) this.regionTick();
    this.measure();
    const B = this.budget(), T = this.cfg(), now = this.now();
    const ttl = (T.socialTtl || 30) * 1000;
    const tex = gs.game.textures;
    const pages = [];
    for (const k of Assets.demanded) if (tex.exists(k)) pages.push(k);
    // keep townsfolk social pages of an age group as long as any doll of it used one
    for (const k of pages) {
      if (now - (this.use[k] || 0) > ttl) this.evict(k);
    }
    // near the must: whatever is not on screen and unused for a second goes, oldest first (the cap and the TTL
    // keep the on-demand pages small otherwise: evicting them sooner only makes them load again)
    if (this.total > B.must - 30) {
      const left = pages.filter((k) => tex.exists(k));
      let guard = left.length;
      while (this.total > B.must - 30 && guard-- > 0 && this.evictLRU(left.filter((k) => tex.exists(k)), 1000)) this.measure();
    }
    if (this.total > B.hard) {
      this.overHardT += 0.5;
      if (this.overHardT >= 2 && this.overHardT < 2.5) { this.budgetEvents++; if (gs.events) gs.events.emit('budget', this.total); }
    } else this.overHardT = 0;
  },

  stats() {
    const B = this.budget();
    this.measure();
    const byCls = {};
    for (const k in this.byCls) byCls[k] = +this.byCls[k].toFixed(1);
    return {
      totalMiB: +this.total.toFixed(1), peakMiB: +this.peak.toFixed(1), byCls, soft: B.soft, hard: B.hard,
      overSoft: this.total > B.soft, overHard: this.total > B.hard,
      social: this.residentSocial().length, demanded: Assets.demanded.size, held: Assets.held.size,
      areas: this.areas ? Object.fromEntries(Object.entries(this.areas).map(([k, v]) => [k, (v.out ? 'out' : 'in') + ' gap ' + Math.round(v.gap || 0) + ' far ' + (v.farT || 0)])) : null,
      loads: this.loads, evictions: this.evictions, refused: this.refused, budgetEvents: this.budgetEvents,
      ground: this.gs && this.gs.ground ? { slots: this.gs.ground.slots.length, level: this.gs.ground.level, baked: this.gs.ground.baked, evictions: this.gs.ground.evictions } : null,
    };
  },
};
