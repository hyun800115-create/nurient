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
import { Perf } from './Perf.js';

const TF_SOC_ANIMS = new Set(['talk', 'wave', 'happy']);

/** take an animation out for good: Phaser's anims.remove() only unlists it — the Animation keeps its
 *  'pauseall' / 'resumeall' listeners on the manager and its frames (a leak on every evict / reload) */
function dropAnim(g, key) {
  const a = g.anims.get(key);
  if (!a) return;
  if (typeof a.destroy === 'function') a.destroy(); else g.anims.remove(key);
}
/** ((v4.2 CODE-2) every display object of the scene, also those inside containers (cutaway layers, rigs, labels) */
function eachObj(list, fn) {
  for (const o of list) { fn(o); if (o.list && o.type === 'Container') eachObj(o.list, fn); }
}
// (v4-B) building pictures that belong to one area: out of memory while the camera is far from it (§11.3b
// `regionBld`), back when it comes near. Rects in world px [x0, y0, x1, y1].
// (the district by our station uses the street props and the townhouses too: those belong to rail strip + town)
// ((v4.3 step B, TX-a — docs/redesign_v43/stepB/map_tx.md T-3) `live`: the rect is the box around what shows the area's
//  pictures now (+ LIVE_PAD; what waits for one of them as a stand-in counts too), the static rect only while nothing
//  does — so a workshop an old village still has on an old plot keeps its pictures there. `k`: the area's near / far are
//  the preset's × k (the core district: a walk from the station or the east dock into it is >= 500 px, ~2 s))
const HUT = (WORLD.v42 && WORLD.v42.office) || { x: 600, y: 640 };
const CORE_K = 0.65;
const REGIONS = [
  { id: 'town', rect: [4150, 0, 6144, 3450], pages: ['town_civic@rest', 'town_civic@hall', 'town_shops@a', 'town_park'] },
  { id: 'east', rect: [3000, 0, 6144, 3450], pages: ['town_homes', 'town_street'] },
  // ((v4-C) from the west strip's edge, WORLD.left. The town art the village uses too stays while the camera is near
  //  the village — but only once the village has it: the park page when a playground / fountain park does (else a tour
  //  of the town would leave that page in memory back home). ((v4.3 step B) the hall's page moved to `core`, the
  //  workshops' page (bld_buildings) was split into `work` / `eastside`)
  { id: 'village', rect: [Math.min(0, Number(WORLD.left) || 0), 0, 3000, 3450], pages: ['bld_buildings_2', 'boat_rowboat', 'boat_fishing'],
    extra: (gs) => {
      const cv = gs.civic, out = [];
      if (!cv) return out;
      if (cv.amenities.some((a) => a.key === 'deco_playground' || a.key === 'deco_fountain')) out.push('town_park');
      return out;
    } },
  // ((v4.2, robust review H3, docs/v42_plan.md §13.2) the v4.2 buildings' pictures: the civic bank next to the office,
  //  the logistics centre in the se corner, the cargo sleigh along its lanes (station stop -> 역앞 거리 -> 중앙로 ->
  //  은행길 -> the depot). Only listed once their fragment is merged (late), so a village without them costs nothing.
  //  CODE-2 adds `office` (+ `officeInside`) for the office cutaway art)
  { id: 'bank42', rect: [-620, 240, -60, 760], pages: ['civ_bank'] },
  // ((v4.2 CODE-2) the office's closed look (its inside page and the staff's desk / work / errand pages load on demand
  //  while the chief is near it: Office / OfficeBuilding ask Residency.want for them). ((v4.3 step B, T-3g) on the hut's
  //  plot (v42_office, HUT): the old rect [-140, 480, 360, 960] was the pre-step-A office spot)
  { id: 'office', rect: [HUT.x - 300, HUT.y - 300, HUT.x + 300, HUT.y + 240], pages: ['office_bld@closed'], live: true },
  { id: 'depot', rect: [2700, 2850, 3700, 3420], pages: ['lgx_center_a', 'lgx_center_b', 'lgx_center_c', 'lgx_center_d', 'lgx_items'] },
  { id: 'sleigh', rect: [2950, 1500, 4900, 3420], pages: ['veh_cargo_sleigh'] },
  // ((v4.3 step B, TX-a T-3c) the core district (hut / office, the stations, the deck, the shop, the bakery, the hall at
  //  w_hall, the 한마당 reserve): its boot and lazy pages go while the camera is at the station, the track, the town or
  //  the depot. props_buildings keeps only core pictures since T-3b (the mine entrance, small boats and campfires that
  //  stand elsewhere too moved to props_decor). The shop's page is the current stage's only (T-4 drops the earlier ones);
  //  the hall's page once the hall stands (it is town art too: the `town` area keeps it while the town is near).
  //  deck43_ch stays unmanaged (TXD-2: the chief's reel and the seated fishers are `extends` anims)
  { id: 'core', rect: [-150, 150, 1900, 2600], pages: ['props_buildings', 'deck43', 'bakery43'], live: true, k: CORE_K,
    extra: (gs) => {
      const out = [];
      const st = gs.market && gs.market.stage;
      if (st >= 1) out.push('market_s' + st);
      if (gs.civic && gs.civic.hall) out.push('town_civic@hall');
      return out;
    } },
  // ((v4.3 step B, TX-a T-3a) the workshops by district (plot table v2): warehouse + toolsmith on the work strip (d_wh,
  //  d_tool), cannery + store by the east shore (d_cannery, d_store). Static rects = those plots' pictures
  { id: 'work', rect: [-220, 1200, 820, 1760], pages: ['bld_work'], live: true, k: CORE_K },
  { id: 'eastside', rect: [1520, 110, 2260, 1260], pages: ['bld_east'], live: true, k: CORE_K },
];
const LIVE_PAD = 64;                      // ((v4.3 step B) px around what shows a live area's pictures
const LIVE_EVERY = 2;                     // ((v4.3 step B) s between two looks at what shows them
const ACQUIRE = 800, RELEASE = 1200;      // px between the view and the area
const VIEW_FAR = 400;                     // ((v4.3) px outside the view beyond which a picture is not 'displayed' (offView)
const LOOK_TTL = 3;                       // ((v4.3) s a far area's pictures stay while the player looks around in 관망
// ((v4.3 step B, TX-a T-1) the line Residency keeps the source-sum under, from the GL must: the GL total is the source-sum
//  + the GL-only text canvases (5.4 MiB measured at the full-v4 peaks, texbudget 2026-11-12) + the renderer's render
//  targets (screen-sized: 33.8 MiB at the texbudget viewport, ~66 on a full-HD phone at k 1.5).
//  line = must − render targets − GL_EXTRA − LINE_MARGIN: at the line the GL total is ≈ 437 MiB. (LINE_MARGIN 18, not the
//  map's 10: with 10 the line sat at ≈ 444.5 GL and a busy far view full of residents' social pages stood there — 439 /
//  442.7 / 447.3 GL in the first full run; with 15 (≈ 440 GL) a view that sits at the line can still stand a page or two
//  over it — what is in use is never let go: 관망 seated at the office desk, the office staff's pages (12.2 MiB), their
//  doll heads' social pages (12.2) and five residents' pages, stood 2.4 MiB over (441.7 GL) in one of two final runs.
//  18 keeps TX-a's "worst view ≤ 440" with that overshoot, and the 445 exit's margin for stage 4 and the early hall)
const GL_EXTRA = 6, LINE_MARGIN = 18;
// (the render targets: Phaser's pipelines hold only 17.1 MiB of them at the texbudget viewport — the GL probe counts 33.8:
//  the stack bake, the water, the night overlay and the bakes allocate targets of their own. So the line takes the larger
//  of the pipelines' sum and RT_FIXED + RT_BUFFERS canvas-sized RGBA buffers, fitted on the two GL measurements: 33.8 MiB
//  at the texbudget canvas (720 x 1558) and 67 MiB at 1080 x 2400 (perf audit B))
const RT_FIXED = 8.5, RT_BUFFERS = 5.9;
const GROUND_MS = 12000, MOVE_PX = 256;    // ((v4.3 step B) the ground pool's room counts this long after the view moved this far
const COMING_MS = 15000;                  // ((v4.3 step B) ms an area page queued again counts as on its way (inflight)
const SWAP_GAP = 15;                      // ((v4.3 step B, T-2) MiB under the line from which an area coming back swaps the far ones out first

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
  pins: {},         // ((v4.2 fix) page key -> scene ms it is kept until (no TTL / LRU eviction meanwhile))
  roomMade: 0,      // ((v4.2 fix) times a wanted page made room for itself instead of being refused)
  swaps: 0,         // ((v4.3 step B, T-2) times an area coming back made the far areas go at once
  stageDrops: 0,    // ((v4.3 step B, T-4) earlier shop-stage pages let go
  areaLoads: 0,     // ((v4.3 step B) area pages queued again / let go (the soak's churn count; loads / evictions also
  areaEvicts: 0,    //  count the residents' on-demand pages)
  rt: 0,            // ((v4.3 step B, T-1) MiB of the renderer's render targets (refreshed every 2 s)
  rtT: 0,
  coming: new Map(),// ((v4.3 step B, TX-a) area page -> scene ms it was queued again (on its way: inflight)
  movedAt: -1e9,    // ((v4.3 step B, TX-a) scene ms the view last moved MOVE_PX from viewAt (groundRoom)
  viewAt: null,
  live: null,       // ((v4.3 step B, T-3d) area id -> the box around what shows its pictures (+ LIVE_PAD)
  liveT: 0,

  attach(gs) {
    this.gs = gs;
    this.checkT = 0;
    this.use = {};
    this.tfAge = {};
    this.pins = {};
    this.areas = null;
    this.live = null;
    this.liveT = 0;
    this.coming = new Map();
    this.movedAt = -1e9;
    this.viewAt = null;
    // ((v4.3 step B, T-3f) the pages the areas manage count as after-title pictures from now on (Assets.isLazy)
    for (const R of REGIONS) for (const k of this.expand(R.pages)) Assets.areaPages.add(k);
    // ((v4.3 step B, TX-a) every shop stage page too, stage 1 included: T-4 lets an earlier stage's page go for good, and
    //  「처음부터」 (Game.resetProgress restarts the scene, no page reload) builds a stage-1 shop again — its stall then waits on
    //  the stand-in for market_s1 and is dressed when it comes (Game.lazyAllowed lets stage 1 load at stage 1), not a
    //  placeholder box)
    for (const k in Assets.m.atlases) if (/^market_s\d$/.test(k)) Assets.areaPages.add(k);
    // ((v4.3 step B, TX-a) the village built again while an area's pages are out of memory (「처음부터」 tapped while the
    //  camera was at the station: the core's boot pages are held): what the build makes with Assets.image on one of them
    //  waits on the stand-in and is dressed on arrival (Game.lazyImgs), until the first tick — the stations are dressed in
    //  arrived(). A normal boot holds nothing here: no change)
    let held = false;
    for (const k of Assets.held) if (Assets.areaPages.has(k)) { held = true; break; }
    Assets.standIn = held ? (img, key) => this.standIn(gs, img, key) : null;
    Assets.tfSocial = (age, anim) => !TF_SOC_ANIMS.has(anim) || !Assets.packed || this.wantTf(age);
    const onArrive = (key) => this.arrived(key);
    Assets.arrivals.push(onArrive);
    gs.events.once('shutdown', () => { const i = Assets.arrivals.indexOf(onArrive); if (i >= 0) Assets.arrivals.splice(i, 1); if (this.gs === gs) this.gs = null; });
    this.rt = this.renderTargets();
    this.rtT = 2;
    this.measure();
  },

  // ((v4.3 perf) the graphics preset's overrides (중사양 / 저사양: fewer social pages, a shorter TTL, a lower target)
  cfg() { return Perf.texCfg((BALANCE.v4 && BALANCE.v4.tex) || { targetMiB: 300, softGap: 24, lowMiB: 200, socialPages: 5, socialTtl: 30 }); },
  low() { return !!(this.gs && this.gs.gfxLow); },
  budget() {
    const T = this.cfg();
    const hard = this.low() ? T.lowMiB : T.targetMiB;
    return { soft: hard - (T.softGap || 24), hard, must: T.mustMiB || 455 };
  },
  now() { return this.gs ? this.gs.time.now : 0; },

  /** ((v4.3 step B, TX-a T-1) MiB of the renderer's render targets: its pipelines' screen-sized buffers, or RT_FIXED +
   *  RT_BUFFERS canvas-sized buffers when that is more (the systems' own targets: see RT_BUFFERS). They grow with the canvas: k 1.5
   *  on a full-HD phone doubles them. A WebGL renderer without pipelines (none: Canvas) gives 0 */
  renderTargets() {
    const g = this.gs && this.gs.game, r = g && g.renderer, M = r && r.pipelines;
    if (!M) return 0;
    const cv = g.canvas, est = cv && cv.width > 0 ? RT_FIXED + RT_BUFFERS * cv.width * cv.height * 4 / 1048576 : 0;
    const seen = new Set();
    let b = 0;
    const add = (L) => { if (L && L.length) for (const t of L) if (t && !seen.has(t)) { seen.add(t); b += (t.width || 0) * (t.height || 0) * 4; } };
    try {
      add(M.renderTargets);
      const P = M.pipelines;
      if (P && typeof P.each === 'function') P.each((k, p) => { add(p && p.renderTargets); });
      else if (P && typeof P.values === 'function') for (const p of P.values()) add(p && p.renderTargets);
      if (M.postPipelineInstances) for (const p of M.postPipelineInstances) add(p && p.renderTargets);
    } catch (e) { /* a renderer without pipelines: 0 */ }
    return Math.max(b / 1048576, est);
  },
  /** ((v4.3 step B, TX-a T-1) the source-sum line (MiB) that keeps the GL total under the must on THIS screen:
   *  must − render targets − GL_EXTRA − LINE_MARGIN (≈ 397 at the texbudget viewport, ≈ 364 at full HD, ≈ 319 at
   *  QHD). Above it far areas go at once, then unused on-demand pages; a new on-demand page is refused (was must − 30 =
   *  425 source-sum on every screen: ≈ 463 GL at the texbudget viewport, so it never fired before the GL must did) */
  line() { return this.budget().must - (this.rt || 0) - GL_EXTRA - LINE_MARGIN; },
  /** ((v4.3 step B, TX-a) MiB of on-demand pages asked for and still on their way: a want() between two measures counts
   *  them, so a burst of wants cannot overshoot the line (the soak's track view stood 2.9 MiB over it) */
  inflight() {
    const tex = this.gs && this.gs.game.textures;
    if (!tex) return 0;
    let b = 0;
    // ((TX-a verify) not a page that failed for good (Assets.onLoadError after its retries): it stays in `demanded`, and
    //  counting it would hold the line down by its size for the rest of the session)
    for (const k of Assets.demanded) if (!tex.exists(k) && !Assets.failed.has(k)) { const a = Assets.m.atlases[k]; b += (this.sizes && this.sizes[k]) || (a && a.bytes) || 0; }
    // ((v4.3 step B, TX-a) + the area pages an area coming near queued again and still on their way (at most COMING_MS:
    //  a load the loader dropped must not hold the line down for good)
    const now = this.now();
    for (const [k, t] of this.coming) {
      if (tex.exists(k) || Assets.failed.has(k) || now - t > COMING_MS) { this.coming.delete(k); continue; }
      const a = Assets.m.atlases[k] || Assets.m.images[k];
      b += (this.sizes && this.sizes[k]) || (a && a.bytes) || 0;
    }
    return b / 1048576;
  },
  /** ((v4.3 step B, TX-a) MiB the ground pool may still grow by while the view travels: its slots (1 MiB canvases) fill
   *  as the view comes somewhere new and nothing checks them against the line — the soak's station stood 8 MiB over it
   *  (447.7 GL) when the view's tiles came in after the residents' social pages there had been let in. Counted from a
   *  move of the view (≥ MOVE_PX) for GROUND_MS; a view standing still has the tiles it needs (0: no phantom room) */
  groundRoom() {
    const G = this.gs && this.gs.ground;
    if (!G || !Array.isArray(G.slots) || !(G.pool > 0)) return 0;
    if (!(this.now() - this.movedAt < GROUND_MS)) return 0;
    const n = G.slots.length, s = n && G.slots[0] && G.slots[0].ct;
    const per = s && s.width ? s.width * s.height * 4 / 1048576 : 1;
    return Math.max(0, G.pool - n) * per;
  },
  /** ((v4.3 step B, TX-a) what may still come on top of the total: pages on their way + the ground pool's room. An
   *  on-demand page is let in only while total + ahead + its size stays under the line */
  ahead() { return this.inflight() + this.groundRoom(); },

  /** source-sum of every texture (MiB), by class */
  measure() {
    const g = this.gs && this.gs.game;
    if (!g) return this.total;
    const list = g.textures.list;
    let tot = 0;
    const by = this.byCls = {};
    const sizes = this.sizes || (this.sizes = {});      // ((v4.2 fix) last known bytes of every page, for one coming back)
    for (const k in list) {
      if (k === '__DEFAULT' || k === '__MISSING' || k === '__NORMAL' || k === '__WHITE') continue;
      const t = list[k];
      let b = 0;
      for (const s of t.source) b += s.width * s.height * 4 * (s.memScale || 1);     // ((v4.3 perf) 저사양's smaller uploads
      tot += b;
      const a = Assets.m.atlases[k];
      if (a || Assets.m.images[k]) sizes[k] = b;
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
    // ((v4.2 CODE-2) building / HUD pages that load on demand (the office inside, the ui5 panels, chief2's sheet: noCap)
    //  are not residents' social pages: they do not count against the cap)
    for (const k of Assets.demanded) { const a = Assets.m.atlases[k]; if (a && a.onDemand && !a.noCap && a.format !== 'tfatlas' && (!loadedOnly || tex.exists(k))) out.push(k); }
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
    const T = this.cfg();
    // (the soft / hard budgets make unused pages go sooner; a new one is refused only near the must: ((v4.3 step B) the line)
    // ((v4.2 fix, robust H1 / visual H3) near the must a page someone on screen wants first makes room: the far areas'
    //  pictures and the least recently used on-demand pages go (makeRoom). Before, it was refused while a far
    //  district's pages waited out their 10 s: the office clerks sat without heads, the 관망 chief stood on his seat)
    const a = Assets.m.atlases[page];
    const need = a && a.bytes ? a.bytes / 1048576 : 4;
    const fly = this.ahead();
    if (this.total + fly + need > this.line() && !this.makeRoom(need + fly, [page])) { this.refused++; return false; }
    // at most `socialPages` resident or loading (the least recently used one makes room)
    const res = this.residentSocial();
    const cap = this.low() ? Math.min(2, T.socialPages) : T.socialPages;
    if (!(a && a.noCap) && res.length >= cap && !this.evictLRU(res.filter((k) => this.gs.game.textures.exists(k)), 2000)) { this.refused++; return false; }
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
    // ((v4.3) where the view is: the chief, or the camera while the player looks around in 관망)
    const T = gs.territory, px = gs.camPan ? gs.camPan.x : gs.player ? gs.player.x : 0;
    if (T && T.areaOf && T.areaOf(px) !== 'town' && !(gs.v4 && gs.v4.inTown && gs.v4.inTown())) return false;
    const need = P.reduce((n, p) => n + ((Assets.m.atlases[p] && Assets.m.atlases[p].bytes) || 0), 0) / 1048576;
    const fly = this.ahead();
    if (this.total + fly + need > this.line() && !this.makeRoom(need + fly, P)) { this.refused++; return false; }
    return this.demand(P);
  },

  // ---------------------------------------------------------------- (v4.2 fix) room for a wanted page
  /** keep page `key` in memory for `sec` s more (no TTL / LRU eviction): 관망's chief2 sheet, a view's must-have */
  pin(key, sec) { if (!key) return; const t = this.now() + (sec || 5) * 1000; if (!(this.pins[key] > t)) this.pins[key] = t; this.use[key] = this.now(); },
  pinned(key) { return this.pins[key] > this.now(); },
  /** ((v4.3) the pin goes now: 관망's chief2 sheet while the player looks around far from him) */
  unpin(key) { delete this.pins[key]; },

  /**
   * ((v4.2 fix, robust H1) make `need` MiB of room under the line ((v4.3 step B, T-1) line(); was must − 30) for `keep`
   * (the pages asked for):
   * 1. the pictures of the areas the view is far from (beyond their far: they would go after their TTL anyway), the
   *    farthest area first — never a page a near area also lists, never while a camera cut is on its way back;
   * 2. on-demand pages not on screen and unused for a second, least recently used first (never a pinned one).
   * true when the room is there.
   */
  makeRoom(need, keep) {
    const gs = this.gs;
    if (!gs) return false;
    const lim = this.line(), tex = gs.game.textures;
    const fits = () => this.total + need <= lim;
    this.measure();
    if (fits()) return true;
    const K = new Set(keep || []);
    if (this.areas && Assets.packed && !gs.camFocus) {
      for (const f of this.farAreas()) {
        const go = f.pages.filter((k) => !f.near.has(k) && !K.has(k) && tex.exists(k));
        if (go.length && this.evictArea(go)) { this.measure(); if (fits()) { this.roomMade++; return true; } }
      }
    }
    const left = () => [...Assets.demanded].filter((k) => tex.exists(k) && !K.has(k) && !this.pinned(k));
    let guard = left().length;
    while (!fits() && guard-- > 0 && this.evictLRU(left(), 1000)) this.measure();
    if (fits()) { this.roomMade++; return true; }
    return false;
  },

  /** ((v4.3 step B) the areas the view is beyond the far of, farthest first: [{ gap, pages, near }] (`near`: every page a
   *  near area lists — those stay) */
  farAreas() {
    const near = new Set(), far = [];
    for (const R of REGIONS) {
      const st = this.areas && this.areas[R.id];
      if (!st) continue;
      const pages = this.pagesOf(R);
      if (!(st.gap > this.farPx(R))) { for (const k of pages) near.add(k); continue; }
      far.push({ gap: st.gap, pages, near, id: R.id });
    }
    far.sort((x, y) => y.gap - x.gap);
    return far;
  },

  /**
   * ((v4.3 step B, TX-a T-2) swap, don't stack: an area coming back while the total is near the line first takes the
   * room of every area the view is beyond the far of (farthest first, now, not after their TTL), and RoadPaint's
   * bake-only set goes when the view is beyond its NEAR of the streets and rails. A page a near area lists, a page
   * coming back (`keep`), and anything while a camera cut is on its way back stay. Returns the pages let go.
   */
  swapFar(keep) {
    const gs = this.gs;
    if (!gs || gs.camFocus || !this.areas) return 0;
    const K = new Set(keep || []), tex = gs.game.textures;
    let n = 0;
    if (Assets.packed) {
      for (const f of this.farAreas()) {
        const go = f.pages.filter((k) => !f.near.has(k) && !K.has(k) && tex.exists(k));
        if (go.length && this.evictArea(go)) n += go.length;
      }
    }
    const P = gs.v4 && gs.v4.paint;
    if (P && typeof P.releaseIfFar === 'function' && P.releaseIfFar(this.view())) n++;
    if (n) { this.swaps++; this.measure(); }
    return n;
  },

  /** ((v4.3 step B, TX-a) a picture the rebuild made on the stand-in for an area page that is out of memory: dressed when the
   *  page comes (once: a caller that queues it itself — Game.lazyImage, with its own after-step — comes later and goes first) */
  standIn(gs, img, key) {
    if (this.gs !== gs || !gs.lazyImgs || !Assets.areaPages.has(this.pageOfSprite(key))) return;
    if (!gs.lazyImgs.some((q) => q.img === img)) gs.lazyImgs.push({ img, key });
  },

  /** ((v4.3 step B, TX-a) an area page arrived: a station built while it was out of memory (the village built again at the
   *  station view) stands on the stand-in and is not one of Game's lazy pictures — its art, its work loop and, if it works
   *  now, the loop playing. One the area let go is in Game.lazyImgs (evictArea) and is dressed there */
  dressStations(key) {
    const gs = this.gs, L = gs && gs.stationList;
    if (!L || !L.length) return 0;
    let n = 0;
    for (const s of L) {
      const img = s && s.img, sk = s && s.cfg && s.cfg.sprite;
      if (!img || !img.active || !sk || !img.texture || img.texture.key !== 'fv_blank') continue;
      if (this.pageOfSprite(sk) !== key || Assets.pending(sk)) continue;
      if (gs.lazyImgs && gs.lazyImgs.some((q) => q.img === img)) continue;
      Assets.apply(img, sk);
      s.workAnim = s.workAnim || Assets.spriteAnim(sk, 'work');
      if (s.working && s.workAnim && img.play) img.play(s.workAnim);
      n++;
    }
    return n;
  },

  /** a page arrived: characters waiting in a social act play it now */
  arrived(key) {
    const a = Assets.m.atlases[key];
    if (a && this.gs && Assets.areaPages.has(key)) this.dressStations(key);
    if (!a || !a.onDemand || a.format === 'tfatlas' || !this.gs) return;
    const own = Assets.pageOwner[key];
    for (const o of this.gs.children.list) {
      const ch = o.__ch;
      if (!ch || !ch.alive || !ch.def || !ch.animName) continue;
      // ((v4.2 CODE-2) an unpacked on-demand atlas: whoever asked for one of its anims (the chief's chief2 anims))
      if (!own) { const ad = ch.def.anims && ch.def.anims[ch.animName]; if (ad && ad.atlas === key) { ch.animKey = ''; ch.play(ch.animName, true); } continue; }
      if (ch.def.atlas !== own) continue;
      if (Assets.socialPage(own, ch.animName) === key) { ch.animKey = ''; ch.play(ch.animName, true); }
    }
  },

  // ---------------------------------------------------------------- eviction
  /** is something visible on screen showing page `key`? ((v4.3 review F3) `offView`: a picture of the village that
   *  scrolls with it and stands far outside the view (VIEW_FAR px) does not count — the chief seated at his desk
   *  3,000 px from where the player looks around in 관망 is not on screen, though his sprite is `visible`) */
  displayed(key, offView) {
    let on = false;
    const gs = this.gs, far = offView && gs.isNearView ? (o) => !o.parentContainer && o.scrollFactorX === 1 && o.scrollFactorY === 1 && !gs.isNearView(o.x, o.y, VIEW_FAR) : null;
    for (const L of this.lists()) eachObj(L, (o) => { if (!on && o.visible && o.texture && o.texture.key === key && !(far && L === gs.children.list && far(o))) on = true; });
    return on;
  },

  /** ((CODE-2) the display lists of every running scene: the village and the UI on top of it (the office panel's
   *  plates live on an on-demand page too) — a page shown only by the UI must not count as off screen) */
  lists() {
    const out = [this.gs.children.list];
    const sm = this.gs.game && this.gs.game.scene;
    if (sm && sm.getScenes) for (const sc of sm.getScenes(true)) if (sc !== this.gs && sc.children) out.push(sc.children.list);
    return out;
  },

  /** evict the least recently used page of `list` not on screen and unused for `minAge` ms; true if one went */
  evictLRU(list, minAge) {
    const now = this.now();
    const c = list.slice().sort((a, b) => (this.use[a] || 0) - (this.use[b] || 0));
    for (const k of c) {
      if (now - (this.use[k] || 0) < minAge || this.pinned(k)) continue;
      if (this.evict(k)) return true;
    }
    return false;
  },

  /** remove an on-demand page (its anims and frames first); false while it is on screen ((v4.3) `offView`: see
   *  displayed — what shows it far outside the view plays its fallback. A townsfolk page (tfatlas) let go this way: the
   *  dolls in a social anim go back to idle first (as below), and a doll's rig re-reads its frames at every build and
   *  skips the ones that went — no rig blocks it) */
  evict(key, offView) {
    const gs = this.gs, g = gs.game;
    const a = Assets.m.atlases[key];
    if (!a || !a.onDemand || !g.textures.exists(key)) return false;
    if (offView && a.format === 'tfatlas') {
      const pool = gs.dollPool;
      if (pool) for (const d of pool.dolls) if (TF_SOC_ANIMS.has(d.anim)) d.setAnim('idle', d.baseDir, 0);
    } else if (this.displayed(key, offView)) { this.use[key] = this.now(); return false; }
    const own = Assets.pageOwner[key];
    // ((v4.2 CODE-2) every anim made from this page goes (character anims below, and the sprite anims: the office's
    //  inside props, a late page's loops); whatever plays one stops first — a sprite starting one after the page went
    //  read a destroyed frame (census crash at 15 min). Assets.onLazyFile makes them again when the page is back
    const dead = new Set();
    g.anims.anims.each((k, an) => { if (an.frames.some((f) => f.textureKey === key)) dead.add(k); });
    if (dead.size) eachObj(gs.children.list, (o) => { const cur = o.anims && o.anims.currentAnim ? o.anims.currentAnim.key : null; if (cur && dead.has(cur)) o.anims.stop(); });
    if (a.format === 'tfatlas') {
      // dolls in a social anim go back to idle (their rig images then point at loco frames)
      const pool = gs.dollPool;
      if (pool) for (const d of pool.dolls) if (TF_SOC_ANIMS.has(d.anim)) d.setAnim('idle', d.baseDir, 0);
      TF.clearFrames(key);
      Assets.tfReady.delete(key);
    } else {
      // the character anims made from this page go; characters that play one turn to their fallback
      // ((v4.2 CODE-2) an unpacked on-demand atlas (chief2's char_player_b): the anims of any character that name it)
      const anims = new Set(), byChar = {};
      const ownK = own || key;
      for (const an in Assets.animPage) if (Assets.animPage[an] === key) anims.add(an.slice(ownK.length + 1));
      for (const c in Assets.m.characters) {
        const d = Assets.m.characters[c];
        if (!d || d.extends) continue;
        const mine = new Set();
        if (d.atlas === ownK) for (const an of anims) mine.add(an);
        for (const an in d.anims || {}) if (d.anims[an] && d.anims[an].atlas === key) mine.add(an);
        if (!mine.size) continue;
        byChar[c] = mine;
        const def = Assets.charDef(c);
        for (const an of mine) {
          for (const dir of ['S', 'SE', 'E', 'NE', 'N']) dropAnim(g, c + ':' + an + ':' + dir);
          if (def._dirs) def._dirs[an] = [];
        }
      }
      for (const o of gs.children.list) {
        const ch = o.__ch;
        const mine = ch && ch.alive && ch.def ? byChar[ch.key] : null;
        if (mine && mine.has(ch.animRes)) { ch.animKey = ''; ch.play(ch.animName || 'idle', true); }
      }
    }
    // hidden pictures still pointing at it (a spare rig image, a sprite out of view), and anything still on a dead anim
    // ((CODE-2) in every running scene: a closing UI panel too)
    for (const L of this.lists()) eachObj(L, (o) => {
      const cur = o.anims && o.anims.currentAnim ? o.anims.currentAnim.key : null;
      if (cur && dead.has(cur)) { o.anims.stop(); o.anims.currentAnim = null; }
      if (o.texture && o.texture.key === key) {
        if (o.anims && o.anims.isPlaying) o.anims.stop();
        if (o.setTexture) o.setTexture('__WHITE');
        o.setVisible(false);
      }
    });
    for (const k of dead) if (g.anims.exists(k)) dropAnim(g, k);
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

  /** ((v4.3 step B) the part of the world the camera shows or is about to: around its follow target (the world view is
   *  only refreshed when a frame is drawn). The areas and RoadPaint's bake-only set both go by it */
  view(gs) {
    gs = gs || this.gs;
    const cam = gs.cameras.main, z = Math.max(0.05, cam.zoom || 1), ct = gs.camTarget;
    const w = cam.width / z, h = cam.height / z;
    return ct ? { x: ct.x - w / 2, right: ct.x + w / 2, y: ct.y - h / 2, bottom: ct.y + h / 2 } : cam.worldView;
  },
  /** ((v4.3 step B, T-3e) an area's near / far (px): the preset's, × its `k` (the core district's tight hysteresis) */
  nearPx(R) { return (Perf.p.near || ACQUIRE) * (R.k || 1); },
  farPx(R) { return (Perf.p.far || RELEASE) * (R.k || 1); },
  /** an area's page keys now (its pages + extra, split pages expanded); each one counts as an area page from then on */
  pagesOf(R) {
    const P = this.expand(R.extra && this.gs ? R.pages.concat(R.extra(this.gs)) : R.pages);
    for (const k of P) Assets.areaPages.add(k);
    return P;
  },
  /** ((T-3f) does an area manage page `k`? */
  areaPage(k) { return Assets.areaPages.has(k); },
  /** ((v4.3 step B, T-3d) the rect an area is measured from: around what shows its pictures (live areas), else its own */
  rectOf(R) { return (R.live && this.live && this.live[R.id]) || R.rect; },
  /** the page sprite `key` is drawn from (null: no page) */
  pageOfSprite(key) {
    const d = Assets.m.sprites[key];
    if (!d) return Assets.m.atlases[key] || Assets.m.images[key] ? key : null;
    if (d.atlas) return Assets.pageOfFrame(d.atlas, d.frame);
    return d.image || null;
  },

  /** ((v4.3 step B, TX-a T-3d) the box around what shows each live area's pictures: the village's world objects on one
   *  of its pages, and the stand-ins waiting for one (Game.lazyImgs: a picture made while the page was out, or one
   *  evictArea blanked) at their place — so a workshop an old village still has on an old plot brings its page back when
   *  the camera comes there. + LIVE_PAD; null while nothing shows them (the static rect then) */
  updateLive() {
    const gs = this.gs, own = new Map(), cover = new Map();
    for (const R of REGIONS) if (R.live) for (const k of this.pagesOf(R)) { const a = own.get(k); if (a) a.push(R.id); else own.set(k, [R.id]); }
    // (a page another area lists too — the hall's page is town art — counts a user inside that area's rect for that area
    //  only: the town's own hall must not stretch the core district to the town)
    for (const R of REGIONS) if (!R.live) for (const k of this.pagesOf(R)) if (own.has(k)) { const a = cover.get(k); if (a) a.push(R.rect); else cover.set(k, [R.rect]); }
    const covered = (k, x, y) => { const C = cover.get(k); return !!C && C.some((r) => x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]); };
    const box = {};
    const grow = (ids, x0, y0, x1, y1) => {
      for (const id of ids) {
        const b = box[id];
        if (!b) box[id] = [x0, y0, x1, y1];
        else { if (x0 < b[0]) b[0] = x0; if (y0 < b[1]) b[1] = y0; if (x1 > b[2]) b[2] = x1; if (y1 > b[3]) b[3] = y1; }
      }
    };
    const at = (o) => { let x = o.x, y = o.y; for (let q = o.parentContainer; q; q = q.parentContainer) { x += q.x; y += q.y; } return [x, y]; };
    const users = (fn) => { eachObj(gs.children.list, fn); for (const o of this.parked()) fn(o); };
    users((o) => {
      const ids = o.texture && own.get(o.texture.key);
      if (!ids || o.scrollFactorX !== 1) return;
      const [x, y] = at(o), w = Math.abs(o.displayWidth) || 0, h = Math.abs(o.displayHeight) || 0;
      if (covered(o.texture.key, x, y)) return;
      grow(ids, x - w * o.originX, y - h * o.originY, x + w * (1 - o.originX), y + h * (1 - o.originY));
    });
    for (const q of gs.lazyImgs || []) {
      const o = q.img;
      if (!o || !o.active || o.scene !== gs || o.scrollFactorX !== 1) continue;
      const pk = this.pageOfSprite(q.key), ids = own.get(pk);
      if (!ids) continue;
      const d = Assets.m.sprites[q.key], fs = (d && d.frameSize) || [0, 0], an = (d && d.anchor) || [0.5, 0.5];
      const [x, y] = at(o), w = fs[0] * Math.abs(o.scaleX || 1), h = fs[1] * Math.abs(o.scaleY || 1);
      if (covered(pk, x, y)) continue;
      grow(ids, x - w * an[0], y - h * an[1], x + w * (1 - an[0]), y + h * (1 - an[1]));
    }
    const live = {};
    for (const id in box) { const b = box[id]; live[id] = [b[0] - LIVE_PAD, b[1] - LIVE_PAD, b[2] + LIVE_PAD, b[3] + LIVE_PAD]; }
    this.live = live;
  },

  regionTick() {
    const gs = this.gs, tex = gs.game.textures;
    // where the camera is going (its follow target): the world view is only refreshed when a frame is drawn
    const view = this.view();
    // ((v4.3 step B, TX-a) the view travelling (groundRoom): its centre MOVE_PX from where it last was counted
    { const cx = (view.x + view.right) / 2, cy = (view.y + view.bottom) / 2, a = this.viewAt;
      if (!a || Math.abs(cx - a.x) + Math.abs(cy - a.y) >= MOVE_PX) { this.viewAt = { x: cx, y: cy }; this.movedAt = this.now(); } }
    const T = this.cfg();
    // ((v4 review M1) under the soft budget a far area's pictures stay a while longer (6x): a short trip away and back
    //  no longer fetches and uploads the whole area again; over it they go after `townTtl` as before)
    // ((v4.3) 관망 둘러보기: the free camera crosses the map in a second or two — the area it left goes after LOOK_TTL s
    //  (the seated chief's office closed at the station still held its 2.4 MiB over the GL must for 10 s)
    const ttl = gs.camPan ? Math.min(LOOK_TTL, T.townTtl || 10) : (T.townTtl || 10) * (this.total < this.budget().soft ? 6 : 1);
    this.areas = this.areas || {};
    if ((this.liveT -= 0.5) <= 0 || !this.live) { this.liveT = LIVE_EVERY; this.updateLive(); }
    // (v4-C) a page may belong to more than one area (the village's town hall and park props are town art too):
    // it goes only once every area that lists it has been far for `ttl` s, and comes back when any is near
    const far = new Map(), near = new Map();
    for (const R of REGIONS) {
      const st = this.areas[R.id] || (this.areas[R.id] = { farT: 0, out: false });
      const gap = st.gap = this.areaGap(view, this.rectOf(R));
      if (gap > this.farPx(R)) st.farT += 0.5; else st.farT = 0;     // ((v4.3 perf) per preset; (v4.3 step B) × the area's k
      for (const k of this.pagesOf(R)) {
        if (!(Assets.m.atlases[k] || Assets.m.images[k])) continue;
        far.set(k, (far.has(k) ? far.get(k) : true) && st.farT >= ttl);
        near.set(k, (near.get(k) || false) || gap < this.nearPx(R));
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
      // ((v4.2 fix) an area coming back over the refusal line first takes the room of the areas the view left (their
      //  TTL would take them a few seconds later): bank → depot in one jump peaked at 456 MiB, over the 455 must)
      // ((v4.3 step B, TX-a T-2) swap, don't stack: from SWAP_GAP under the line every far area goes first (no TTL wait),
      //  RoadPaint's bake-only set too — the arrival peaks (town square, back at the plaza) were the area just left still
      //  waiting out its TTL while the new one loaded); then, still over the line, the unused on-demand pages
      const sz = this.sizes || {};
      const need = back.reduce((n, k) => n + (sz[k] || (Assets.m.atlases[k] && Assets.m.atlases[k].bytes) || 0), 0) / 1048576;
      const L = this.line();
      if (this.total + need > L - SWAP_GAP) this.swapFar(back);
      if (this.total + need > L) this.makeRoom(need, back);
      for (const k of back) { Assets.held.delete(k); Assets.queued.delete(k); this.coming.set(k, this.now()); }
      this.loads += back.length;
      this.areaLoads += back.length;
      if (gs.queueLateFiles) gs.queueLateFiles();
      if (gs.checkLazyGates) { gs.lazyGateT = 0; }
    }
    for (const R of REGIONS) { const st = this.areas[R.id]; st.out = this.expand(R.pages).every((k) => !tex.exists(k)); }
  },

  /** ((v4.3 step B, TX-a) the pictures the view culling took off the display list (src/systems/Culler.js) */
  parked() {
    const P = this.gs && this.gs.culler && this.gs.culler.parked;
    return P && P.length ? P.filter((o) => o && o.scene) : [];
  },

  /** ((v4.3 step B, TX-a T-4) the shop's earlier stages: their pages go once nothing shows them (Game.lazyAllowed never
   *  fetches an earlier stage again; the boot page market_s1 too once the shop is past it) */
  dropOldStages() {
    const gs = this.gs, M = gs.market, tex = gs.game.textures;
    const st = M && M.stage;
    if (!(st > 1)) return 0;
    let n = 0;
    for (let i = 1; i < st; i++) {
      const k = 'market_s' + i;
      if (!tex.exists(k) || this.displayed(k)) continue;
      this.dropPage(k);
      n++;
    }
    this.stageDrops += n;
    return n;
  },

  /** a page out of memory for good (not held: nothing brings it back): its anims, hidden pictures still on it, the texture */
  dropPage(key) {
    const g = this.gs.game, tex = g.textures;
    const dead = new Set();
    g.anims.anims.each((k, an) => { if (an.frames.some((f) => f.textureKey === key)) dead.add(k); });
    const each = (o) => {
      const cur = o.anims && o.anims.currentAnim ? o.anims.currentAnim.key : null;
      if (cur && dead.has(cur)) { o.anims.stop(); o.anims.currentAnim = null; }
      if (o.texture && o.texture.key === key) { if (o.anims && o.anims.isPlaying) o.anims.stop(); if (o.setTexture) o.setTexture('__WHITE'); o.setVisible(false); }
    };
    for (const L of this.lists()) eachObj(L, each);
    for (const o of this.parked()) each(o);
    for (const k of dead) if (g.anims.exists(k)) dropAnim(g, k);
    tex.remove(key);
    Assets.queued.delete(key);
    Assets.held.delete(key);
    Assets.cache.clear();
    this.evictions++;
  },

  /** (v4 review M3) a page key of an area also stands for the pages it was split into to stay under 8 MiB
   *  (town_civic@rest -> town_civic@rest, town_civic@rest2, ...) */
  expand(keys) {
    const out = [];
    for (const k of keys) {
      out.push(k);
      if (k.indexOf('@') < 0) continue;
      for (let n = 2; n < 9 && Assets.m.atlases[k + n]; n++) out.push(k + n);
    }
    return out;
  },

  /** take an area's building pictures out of memory: what shows them gets a stand-in and is re-skinned on arrival */
  evictArea(pages) {
    const gs = this.gs, g = gs.game, tex = g.textures;
    const set = new Set(pages.filter((k) => tex.exists(k)));
    // ((v4.3 step B, TX-a) a page a UI panel shows (a build card's or goal's picture of a workshop, a stall) stays: the
    //  area's pictures in the village are far, the panel's are on screen
    if (set.size) { const ui = this.lists().slice(1); for (const k of [...set]) if (ui.some((L) => { let on = false; eachObj(L, (o) => { if (!on && o.visible && o.texture && o.texture.key === k) on = true; }); return on; })) set.delete(k); }
    if (!set.size) return false;
    if (!tex.exists('fv_blank')) { const c = tex.createCanvas('fv_blank', 2, 2); if (c) c.refresh(); }
    // loop anims made from these pictures go (Assets.onLazyFile makes them again)
    const drop = [];
    g.anims.anims.each((key, a) => { if (a.frames.some((f) => set.has(f.textureKey))) drop.push(key); });
    const objs = [];
    eachObj(gs.children.list, (o) => objs.push(o));
    // ((v4.3 step B, TX-a) + the pictures the view culling parked off the display list (Culler.parked: plain Images of a
    //  `props*` page far from the view). props_buildings is an area page now: a parked worker hut / station kept the
    //  destroyed frame, and when the page had come back and the culler put it on the list again it drew a dead frame
    //  ("Cannot read properties of null (reading 'glTexture')")
    for (const o of this.parked()) objs.push(o);
    for (const o of objs) {
      // ((v4.2 CODE-2) a sprite on another page playing one of the dropped anims stops too)
      if (o.anims && o.anims.currentAnim && drop.indexOf(o.anims.currentAnim.key) >= 0 && !(o.texture && set.has(o.texture.key))) { o.anims.stop(); o.anims.currentAnim = null; }
      if (!o.texture || !set.has(o.texture.key)) continue;
      const loop = o.anims && o.anims.isPlaying && o.anims.currentAnim ? o.anims.currentAnim.key : null;
      // ((boat fix) a sprite on a frame of its anim ('watchtower_work_1': no sprite of the manifest names that frame) is
      //  the sprite its anim belongs to ('spr:watchtower:work'): else it was never re-skinned and stayed blank when the
      //  area came back — the watchtowers, the town's fountain and salon)
      const cur = o.anims && o.anims.currentAnim ? o.anims.currentAnim.key : null;
      // ((v4.3 step B, TX-a) and forgets it: the anim is destroyed below, and a later play() of its key while the page is out
      //  (a station going back to work at the station view: Station.setWorking) fell back to the stopped, destroyed anim and
      //  read its dead frame — "Cannot read properties of undefined (reading 'texture')" in setCurrentFrame)
      if (o.anims) { o.anims.stop(); o.anims.currentAnim = null; }
      let sk = this.spriteOf(o.texture.key, o.frame ? o.frame.name : '__BASE');
      if (!sk && cur && cur.startsWith('spr:')) { const k = cur.slice(4, cur.lastIndexOf(':')); if (Assets.m.sprites[k]) sk = k; }
      o.setTexture('fv_blank');
      // ((v4.2.0.1, LAZY-1) a pooled item picture carries its life (__gen): released to the pool and handed to another item
      //  before the page came back, it was re-skinned with the OLD item — a cooked fish in the chief's arms drawn as a parcel)
      if (sk && gs.lazyImgs) gs.lazyImgs.push({ img: o, key: sk, gen: o.__gen, after: loop ? (img) => { if (img.anims && g.anims.exists(loop)) img.anims.play(loop); } : null });
    }
    for (const k of drop) dropAnim(g, k);
    for (const k of set) { tex.remove(k); Assets.held.add(k); Assets.queued.delete(k); }
    Assets.cache.clear();
    this.evictions += set.size;
    this.areaEvicts += set.size;
    return true;
  },

  /** every 0.5 s: measure, evict what is old / over budget */
  tick(dt) {
    const gs = this.gs;
    if (!gs) return;
    this.checkT -= dt;
    if (this.checkT > 0) return;
    this.checkT = 0.5;
    Assets.standIn = null;      // ((v4.3 step B, TX-a) the rebuild is over (attach)
    if ((this.rtT -= 0.5) <= 0) { this.rtT = 2; this.rt = this.renderTargets(); }
    if (Assets.packed) this.regionTick();
    this.dropOldStages();
    this.measure();
    const B = this.budget(), T = this.cfg(), now = this.now(), L = this.line();
    const ttl = (T.socialTtl || 30) * 1000;
    const tex = gs.game.textures;
    const pages = [];
    for (const k of Assets.demanded) if (tex.exists(k)) pages.push(k);
    // keep townsfolk social pages of an age group as long as any doll of it used one
    for (const k of pages) {
      if (now - (this.use[k] || 0) > ttl && !this.pinned(k)) this.evict(k);
    }
    // near the must: whatever is not on screen and unused for a second goes, oldest first (the cap and the TTL
    // keep the on-demand pages small otherwise: evicting them sooner only makes them load again)
    if (this.total > L) {
      // ((v4.2 fix) over the refusal line the pictures of the areas the view left go now, not after their TTL: a jump
      //  across the map (the overview, a camera cut ending, a reload far away) piled two districts up to the must)
      this.makeRoom(0);
      const left = pages.filter((k) => tex.exists(k) && !this.pinned(k));
      let guard = left.length;
      while (this.total > L && guard-- > 0 && this.evictLRU(left.filter((k) => tex.exists(k)), 1000)) this.measure();
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
      loads: this.loads, evictions: this.evictions, refused: this.refused, roomMade: this.roomMade, budgetEvents: this.budgetEvents,
      // ((v4.3 step B, TX-a) the T-1 line and the render targets it is made from, T-2 swaps, T-4 stage drops, the live rects
      line: +this.line().toFixed(1), rtMiB: +(this.rt || 0).toFixed(1), ahead: +this.ahead().toFixed(1), swaps: this.swaps, stageDrops: this.stageDrops,
      areaLoads: this.areaLoads, areaEvicts: this.areaEvicts,
      live: this.live ? Object.fromEntries(Object.entries(this.live).map(([k, b]) => [k, b.map(Math.round)])) : null,
      ground: this.gs && this.gs.ground ? { slots: this.gs.ground.slots.length, level: this.gs.ground.level, baked: this.gs.ground.baked, evictions: this.gs.ground.evictions, fastChecks: this.gs.ground.fastChecks, fastBaked: this.gs.ground.fastBaked } : null,
    };
  },
};
