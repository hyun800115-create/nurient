// (v4.3 「마을 새 단장」 M0, docs/redesign_v43/engineering_plan.md §1.1 / §4.5.2 / §4.6) layout + walk measures that run
// unchanged on the old layout (4.2.1) and on the new one, so the two can be compared number for number. One browser,
// fixed-step clock. Writes CSV (+ one JSON with everything) to --out and prints a short summary.
//
//   node tools/test/v43_layout.mjs [--out DIR] [--only layout,walks,firstsale,merchant] [--seeds 5] [--fresh-min 47]
//        [--probe 'id:x,y,size;...'] [--root <a frost-village dir>] [-v]
//   --out        where the CSV / JSON go (default: <os tmp>/v43_layout); exit code 1 on page errors
//   --probe      proposed footprints (S / M / L / XL diamonds) checked like the real ones, e.g. the plan's new plots
//   wall time (one browser, loaded 4-CPU box): layout,walks ≈ 1 min; firstsale ≈ 1 min a seed; merchant ≈ 9 min
//   (+ ≈ 0.4 min a game minute of --fresh-min; 0 skips the fresh game). M0 numbers: docs/build_reports/v43_baseline/
//
// layout   (footprints.csv, footprint_summary.csv) every building footprint — every plot / tower (its size diamond, the
//          building on it named), the five stations, the stall, the trade post, the bench, the net / deck, the v4
//          station-town lots and buildings — against: other footprints, decor (the scene's static images, trees,
//          rocks, wheat, ground decals, the props that collide), the walk graph (nodes inside, edges through), pads
//          (every live paid pad, every pad still to come at the place the game gives it, and the work pads: in / out,
//          shelves, registers, cash, piles, trash, build drops), the sea (shoreY) and the fog (corners in land that
//          opens at another time than the building's own). level = overlap (inside) | touch (within the margin).
//          Scenes: `fresh` (a new game) and `late` (fixtures/v42_village_late.json: everything built, every land open).
// walks    (walks.csv) walks measured with the game's own path finder (gs.roads.route: roads, off-road legs round what
//          stands there, walled buildings through their doors), metres = ground px / 64. The rows are the plan's §4.6
//          list: the chief's first walk (start → the net's gather point / the deck's reel spot), food register ↔ trade
//          (자재) register, oven → shop shelf, meat rack → cannery, cannery → store, the coin round (office → shop coins
//          → store → station cash → hall tax box → restaurant → bank → office; and without the station cash), plus the
//          first-loop legs. A place is looked up by name (window.__FV.where) with the new layout's names first, so the
//          same rows measure the new layout once its names exist (a missing place is reported as such, never guessed).
//          `alt` rows put a workshop on another plot by moving the place with its plot (the bots' cannery w_m1 → store
//          w_m2). Three lengths a row: route (gs.roads.route with the walker's own "straight when near": chief pilot /
//          courier 220, porters 360), direct (a joystick walk: the straight line when nothing stands on it at the
//          chief's radius 16, else the shortest way round on a ground grid — Paths.gridPath — roads ignored) and
//          straight; m = the one that walker really walks (chief rows: direct; porters and the courier: route).
// firstsale (firstsale.csv) time to the first sale in a new game, seeds 1..--seeds (Math.random seeded):
//          `onboarding` = the first-run tutorial on, a bot that walks only where the tutorial points (Act 1 its target,
//          Act 2 the shown yellow arrow) — the onboarding.mjs bot without its layout checks; `smart` = the census /
//          pacing bot (review_gameplay_bot.js, policy smart). Game seconds from the moment the bot takes the joystick:
//          first sale (a customer pays: the 'sold' event), first coins in the chief's pocket, the clerk hired, the
//          tutorial's hand-over (Act 3).
// merchant (merchant.csv, merchant_fresh.csv) the trade post (later the 자재 창구): items the merchant buys a minute.
//          `ceiling_clerk`: the shelf kept full (planks + ingots topped up every second), the chief parked away so the
//          clerk serves: the service ceiling (trade.buyInterval × register.clerkTradeSlow, in whole frames);
//          `ceiling_chief`: the same with the clerk stood aside and the chief on the register (trade.buyInterval).
//          `bot`: the 25- and 46-min fixtures played by the smart bot (warm 60 s + 6 min): items / min, coins / min,
//          staffed and shelf-empty shares, mean stock; the stall's shelf per food. `fresh`: a new game (seed 1) played by
//          the smart bot for --fresh-min minutes, sampled every second: items bought per minute, the stall's shelf per
//          food, coins.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('--root', path.resolve(HERE, '..', '..')));
const OUT = path.resolve(opt('--out', path.join(os.tmpdir(), 'v43_layout')));
const ONLY = opt('--only', 'layout,walks').split(',');
const SEEDS = Number(opt('--seeds', '5'));
// ((v4.3 마을 깃발) the onboarding bot's new game opens the flag maker first (the Game paused under it): the bot presses
//  「이대로 시작」 with one real tap and its clock starts after it. --no-flag: without the maker (window.__FV_FLAGMAKER = false)
const NOFLAG = args.includes('--no-flag');
const FRESH_MIN = Number(opt('--fresh-min', '47'));
const VERB = args.includes('-v');
// --probe 'hut:600,640,M;hall:180,760,XL': footprints that do not exist in the game yet, checked like the real ones
//   (a proposed plot before it is coded). Sizes S / M / L / XL = the Site footprints 181×91 / 272×136 / 362×181 / 525×262
// --from DIR: no browser; the layout section re-runs on the raw dumps (layout_raw_fresh / _late.json) an earlier run wrote to DIR
const FROM = opt('--from', null) ? path.resolve(opt('--from')) : null;
const PROBES = (opt('--probe', '') || '').split(';').filter(Boolean).map((q) => { const [id, rest] = q.split(':'); const [x, y, size] = rest.split(','); return { id, x: Number(x), y: Number(y), size: size || 'M' }; });
const FIX = path.join(ROOT, 'tools/test/fixtures');
fs.mkdirSync(OUT, { recursive: true });
const t0 = Date.now();
const wall = () => ((Date.now() - t0) / 1000).toFixed(0) + 's';
const seedJs = (s) => `(() => { let a = ${s >>> 0}; Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();`;
const csvCell = (v) => { if (v === null || v === undefined) return ''; const s = typeof v === 'number' ? String(+v.toFixed(3)) : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const writeCsv = (name, rows, cols) => {
  const C = cols || [...new Set(rows.flatMap((r) => Object.keys(r)))];
  fs.writeFileSync(path.join(OUT, name), [C.join(',')].concat(rows.map((r) => C.map((c) => csvCell(r[c])).join(','))).join('\n') + '\n');
  console.log(`  wrote ${path.join(OUT, name)} (${rows.length} rows)`);
};
const ALL = { args, root: ROOT, at: new Date().toISOString() };

// ------------------------------------------------------------------------------------------------ browser
// (the browser starts on the first boot: `--from` runs the layout check on saved dumps without one)
let srv = null, browser = null;
let page = null, log = null, ctx = null;
const errors = [];
const ev = (fn, a) => page.evaluate(fn, a);
/** a fresh page (own context: the init script differs per run), the save keys set, the title tapped, the stepper on */
async function boot({ keys = null, init = '', stepper = true, viewport = { width: 390, height: 844 } } = {}) {
  if (ctx) { errors.push(...log.errors); await ctx.close(); }
  if (!browser) { srv = await start(0, { prefix: '/fv/', root: ROOT }); browser = await launch(); }
  ({ page, log, ctx } = await openPage(browser, srv.url + 'index.html', { viewport, dpr: 1, init: init || undefined }));
  await ev((k) => { try { localStorage.clear(); if (k) for (const n in k) localStorage.setItem(n, k[n]); } catch (e) { /* */ } }, keys);
  await page.reload({ waitUntil: 'load', timeout: 180000 });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player && window.__FV.scene.v42, 180000);
  if (stepper) {
    await installStepper(page);
    await ev(() => { try { window.__FV.v42.v.seen.whatsNew = 1; } catch (e) { /* */ } window.__FV.setInput(0, 0); });
  }
}
/** (v4.3 마을 깃발) the new-game flag maker: one real tap on 「이대로 시작」 (true when it was up) */
async function passFlagMaker() {
  const at = await ev(() => { const f = window.__FV.flag && window.__FV.flag(); return f && f.maker && f.maker.open ? f.maker.hit.start : null; });
  if (!at) return false;
  await ev(() => window.__step.frame());
  const c = await page.$('canvas'), b = await c.boundingBox(), k = b.width / 720;
  await page.touchscreen.tap(b.x + at.x * k, b.y + at.y * k);
  await ev(() => window.__step.run(2 / 60));
  return !(await ev(() => window.__FV.game.scene.isPaused('Game')));
}
/** the census / pacing bot (review_gameplay_bot.js, smart policy, the census's options) */
async function addBot() {
  await ev(async () => { const m = await import(new URL('src/data/balance.js', location.href).href); window.__BAL = m.BALANCE; });
  await page.addScriptTag({ path: path.join(ROOT, 'tools/test/review_gameplay_bot.js') });
  await ev(() => Object.assign(window.__bot.opts, { policy: 'smart', upg: 'greedy', minBatch: 3, think: 0, mag: 1 }));
}
const fixtureKeys = (name) => {
  const d = JSON.parse(fs.readFileSync(path.join(FIX, name), 'utf8'));
  return d.keys ? d.keys : { 'frostVillage.save.v1': JSON.stringify(d) };
};

// ------------------------------------------------------------------------------------------------ page side: geometry
/** everything the layout check needs, read from the running scene (the game's own objects, no copy of world.js) */
const DUMP = async () => {
  const gs = window.__FV.scene, F = window.__FV, A = F.assets();
  const W = await import(new URL('src/data/world.js', location.href).href);
  const { WORLD, L4 } = W;
  const r1 = (v) => Math.round(v);
  const diamond = (x, y, w, h) => [[x - w / 2, y], [x, y - h / 2], [x + w / 2, y], [x, y + h / 2]];
  const isoRect = (x, y, a, b) => { const P = (mx, my) => [x + 45.25 * (mx + my), y + 22.63 * (mx - my)]; return [P(-a / 2, -b / 2), P(-a / 2, b / 2), P(a / 2, b / 2), P(a / 2, -b / 2)]; };
  /** the ground polygon of a sprite key standing at (x, y): footprintM [a, b] m, else footprint [w, h] px, else null */
  const fpOf = (key, x, y) => {
    const d = (key && A.def(key)) || {};
    if (Array.isArray(d.footprintM) && d.footprintM.length === 2) return isoRect(x, y, d.footprintM[0], d.footprintM[1]);
    if (Array.isArray(d.footprint) && d.footprint.length === 2) return diamond(x, y, d.footprint[0], d.footprint[1]);
    return null;
  };
  const regionOf = (x, y) => { try { return gs.territory.regionAt(x, y) || 'start'; } catch (e) { return 'start'; } };
  const bld = [];
  const addB = (id, kind, x, y, poly, o) => { if (poly && Number.isFinite(x) && Number.isFinite(y)) bld.push(Object.assign({ id, kind, x: r1(x), y: r1(y), poly: poly.map(([a, b]) => [r1(a), r1(b)]), region: regionOf(x, y) }, o || {})); };
  // plots and towers (Site: its size diamond; the building on it named)
  for (const id in gs.sites) {
    const st = gs.sites[id];
    const fp = (st.def && st.def.footprint) || [272, 136];
    addB((st.kind === 'tower' ? 'tower:' : 'plot:') + id, st.kind === 'tower' ? 'tower' : 'plot', st.x, st.y, diamond(st.x, st.y, fp[0], fp[1]),
      { size: st.size, state: st.state, building: st.building || '', only: st.only || '', region: st.kind === 'tower' ? regionOf(st.x, st.y) : (st.cfg && st.cfg.region) || regionOf(st.x, st.y), opens: st.kind === 'tower' ? (st.cfg && st.cfg.region) || '' : '', after: (st.cfg && st.cfg.after) || '', also: st.cfg && st.cfg.also ? [].concat(st.cfg.also) : [], shown: !!st.shown,
        water: st.cfg && (Number.isFinite(st.cfg.shore) || st.only === 'boathouse') ? 1 : 0 });
  }
  // the fixed buildings of the first village
  for (const s of gs.stationList || []) addB('station:' + s.id, 'station', s.x, s.y, fpOf(s.cfg.sprite, s.x, s.y) || diamond(s.x, s.y, 272, 136), { building: s.cfg.sprite, zone: s.cfg.zone || '' });
  if (gs.market) addB('market', 'seller', gs.market.x, gs.market.y, fpOf(gs.market.sprite || (WORLD.market && WORLD.market.sprite), gs.market.x, gs.market.y) || diamond(gs.market.x, gs.market.y, 272, 136), { building: gs.market.sprite || '' });
  // ((review PT-4) the v4.3 gs.trade is the shop's 자재 창구 (its picture is the shop's): no trade post of its own
  if (gs.trade && gs.trade.shop !== gs.market) addB('trade', 'seller', gs.trade.x, gs.trade.y, fpOf((WORLD.trade && WORLD.trade.sprite) || 'trade_post', gs.trade.x, gs.trade.y) || diamond(gs.trade.x, gs.trade.y, 272, 136), { building: 'trade_post', enabled: !!gs.trade.enabled });
  // ((v4.3 밀밭 · 빵집) the bakery's stall: a seller of its own (the cottage is station:bakery)
  if (gs.bakery && gs.bakery.stall) { const S = gs.bakery.stall; addB('bakery_stall', 'seller', S.x, S.y, fpOf(S.cfg.sprite, S.x, S.y) || diamond(S.x, S.y, 104, 52), { building: S.cfg.sprite, enabled: !!gs.bakery.built }); }
  if (WORLD.bench) addB('bench', 'workshop', WORLD.bench.x, WORLD.bench.y, fpOf(WORLD.bench.sprite, WORLD.bench.x, WORLD.bench.y) || diamond(WORLD.bench.x, WORLD.bench.y, 181, 91), { building: WORLD.bench.sprite });
  // the net (a 92-px collider) — or, on the new layout, the fishing deck (WORLD.deck: its gangway polygon when given)
  if (WORLD.deck) {
    // ((review PT-4) WORLD.deck.gangway is a width [x0, x1] m, not a polygon: the deck = its current tier's rectangle,
    //  the gangway = its strip from the land (-4.7 m) to the deck edge, both in deck metres (FishingDeck.P)
    const D = WORLD.deck, isPoly = (a) => Array.isArray(a) && a.length >= 3 && Array.isArray(a[0]);
    const DP = (mx, my) => [D.x + 45.25 * (mx + my), D.y + 22.63 * (mx - my)];
    const tier = (gs.deck && gs.deck.tier) || 1, TR = D.tiers && (D.tiers[tier] || D.tiers[1]);
    const poly = isPoly(D.poly) ? D.poly : TR ? [DP(TR[0], TR[2]), DP(TR[0], TR[3]), DP(TR[1], TR[3]), DP(TR[1], TR[2])] : null;
    addB('deck', 'deck', D.x, D.y, poly || fpOf(D.sprite || D.key, D.x, D.y) || diamond(D.x, D.y, 272, 136), { building: D.sprite || D.key || 'deck', water: 1, tier });
    if (Array.isArray(D.gangway) && D.gangway.length === 2 && TR) { const g = D.gangway, c = DP((g[0] + g[1]) / 2, -3); addB('deck_gangway', 'deck', c[0], c[1], [DP(g[0], -4.7), DP(g[0], TR[2]), DP(g[1], TR[2]), DP(g[1], -4.7)], { building: 'gangway', water: 1 }); }
    // ((v4.3 「바다 가까이」) the chief's landing at the surf line (in the sea on purpose)
    const LDg = D.landing;
    if (LDg && Array.isArray(LDg.at)) addB('deck:landing', 'deck', LDg.at[0], LDg.at[1], fpOf('deck43_landing', LDg.at[0], LDg.at[1]) || isoRect(LDg.at[0], LDg.at[1], LDg.size[0], LDg.size[1]), { building: 'deck43_landing', water: 1 });
  } else if (gs.net) {
    const n = gs.net, R = 92, poly = []; for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; poly.push([n.x + Math.cos(a) * R, n.y - 6 + (Math.sin(a) * R) / 2]); }
    addB('net', 'net', n.x, n.y, poly, { building: 'net', water: 1 });
  }
  // the v4 station town (lattice lots and buildings; the plan does not move them, listed for completeness)
  const V4 = WORLD.v4;
  if (V4) {
    const S2 = Math.SQRT2;
    const lat = (i, j, X, Y) => { const hx = X / 2 / S2, hy = Y / 2 / S2; return [L4(i - hx, j - hy), L4(i + hx, j - hy), L4(i + hx, j + hy), L4(i - hx, j + hy)]; };
    const fpm = (k) => { const v = (A.def(k) || {}).footprintM; return Array.isArray(v) ? v : v && v.radius ? [v.radius * 2, v.radius * 2] : [0.6, 0.6]; };
    for (const id in V4.lots || {}) { const l = V4.lots[id], [x, y] = L4(l.i, l.j); addB('v4lot:' + id, 'v4lot', x, y, lat(l.i, l.j, l.m[0], l.m[1])); }
    for (const b of (V4.town && V4.town.buildings) || []) { const [x, y] = L4(b.i, b.j), m = fpm(b.key); addB('v4:' + b.id, 'v4building', x, y, lat(b.i, b.j, m[0], m[1]), { building: b.key }); }
  }
  // ---- decor: the static images (decor, fences, border pines), trees, rocks, wheat, decals, colliding props
  const dec = [];
  const keyOf = (img) => (img && img.frame && img.frame.name && img.frame.name !== '__BASE' ? img.frame.name : img && img.texture ? img.texture.key : '?');
  for (const img of gs.statics || []) { if (!img || !img.active) continue; dec.push({ key: keyOf(img), x: r1(img.x), y: r1(img.y), r: img.__ob ? r1(img.__ob.r) : 0, region: regionOf(img.x, img.y), src: 'static' }); }
  for (const tr of gs.trees || []) dec.push({ key: 'tree:' + (tr.key || keyOf(tr.img)), x: r1(tr.x), y: r1(tr.y), r: 24, region: regionOf(tr.x, tr.y), src: 'tree' });
  for (const rk of gs.rocks || []) dec.push({ key: 'rock:' + (rk.key || keyOf(rk.img)), x: r1(rk.x), y: r1(rk.y), r: r1(rk.fullR || 40), region: regionOf(rk.x, rk.y), src: 'rock' });
  for (const w of gs.wheat || []) dec.push({ key: 'wheat', x: r1(w.x), y: r1(w.y), r: 20, region: regionOf(w.x, w.y), src: 'wheat' });
  for (const d of WORLD.decals || []) if (Array.isArray(d) && Number.isFinite(d[1])) dec.push({ key: 'decal:' + d[0], x: r1(d[1]), y: r1(d[2]), r: 0, region: regionOf(d[1], d[2]), src: 'decal', soft: 1 });
  const near = (x, y) => dec.some((q) => Math.abs(q.x - x) < 6 && Math.abs(q.y - y) < 6);
  const BUILD_TAGS = /^(site|station|trade|market|boathouse|warehouse|tower|house|office|bank|depot|restaurant|net|pile|mailbox|board|table|lamp)$/;
  for (const o of (gs.collision && gs.collision.all) || []) {
    if (!o || !o.active || o.seg) continue;
    const tag = String(o.tag || '');
    if (BUILD_TAGS.test(tag) || !/^(deco|life_)/.test(tag)) continue;
    if (near(o.x, o.y)) continue;
    dec.push({ key: 'prop:' + tag, x: r1(o.x), y: r1(o.y), r: r1(o.r), region: regionOf(o.x, o.y), src: 'collider' });
  }
  // ---- the walk graph (every node and edge, usable now or later) + the painted streets (v4 / v4.2 lattice corridors)
  const R = gs.roads;
  const nodes = R.nodes.map((n) => ({ id: n.id, x: r1(n.x), y: r1(n.y) }));
  const edges = R.edges.map((e) => ({ a: R.nodes[e.a].id, b: R.nodes[e.b].id, pts: [[R.nodes[e.a].x, R.nodes[e.a].y]].concat(e.via || [], [[R.nodes[e.b].x, R.nodes[e.b].y]]).map(([x, y]) => [r1(x), r1(y)]), zone: e.zone || '', region: e.region || '', walk: e.walk !== false, usable: R.usable(e) }));
  const streets = [];
  for (const [grp, list] of [['v4', (V4 && V4.streets) || []], ['v42', (WORLD.v42 && WORLD.v42.streets) || []]]) {
    for (const s of list) {
      if (!s || s.axis === 'path' || !Array.isArray(s.i) || !Array.isArray(s.j)) continue;
      streets.push({ id: grp + ':' + s.id, poly: [L4(s.i[0], s.j[0]), L4(s.i[1], s.j[0]), L4(s.i[1], s.j[1]), L4(s.i[0], s.j[1])].map(([x, y]) => [r1(x), r1(y)]) });
    }
  }
  // ---- pads: live paid pads, the pads still to come (at the game's own spot), the work pads
  const pads = [];
  const addP = (id, kind, p, hw) => { if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) pads.push({ id, kind, x: r1(p.x), y: r1(p.y), hw: r1(hw || 68) }); };
  for (const p of (gs.paidPads ? gs.paidPads() : []).filter((q) => q && q.active)) addP(p.id, 'paid', p, p.pad && p.pad.w ? p.pad.w / 2 : 86);
  try {
    const PR = await import(new URL('src/systems/Progression.js', location.href).href);
    const pr = gs.progress, auto = new Set([].concat(...Object.values(PR.COMES_WITH || {})));
    for (const s of PR.STEPS) {
      if (pr.done[s.id] || auto.has(s.id) || pads.some((q) => q.id === s.id)) continue;
      let p = null; try { p = pr.spotOf ? pr.spotOf(s) : null; } catch (e) { p = null; }
      addP(s.id, 'paid-later', p, 45.25 * (s.type === 'rank' ? 2.1 : 1.9));
    }
  } catch (e) { /* */ }
  const wk = (id, p) => addP(id, 'work', p, 68);
  for (const s of gs.stationList || []) { wk(s.id + ':in', s.inPad); wk(s.id + ':out', s.outPad); if (s.op && Number.isFinite(s.op.x)) wk(s.id + ':work', s.op); }
  for (const w of gs.workshops || []) { wk(w.kind + ':in', w.inPad); wk(w.kind + ':out', w.outPad); }
  // ((review PT-4) the v4.3 gs.trade is the shop's 자재 창구: its pads are the shop's (market:mat*), its till the shop's one
  const tradeIn = gs.trade && gs.trade.shop === gs.market;
  for (const [n, sl] of [['market', gs.market], ['trade', tradeIn ? null : gs.trade], ['store', gs.store]]) if (sl) { wk(n + ':shelf', sl.shelf); wk(n + ':register', sl.register); wk(n + ':cash', sl.cash && (sl.cash.pad || sl.cash)); }
  if (tradeIn && gs.trade.enabled) { wk('market:matShelf', gs.trade.shelf); wk('market:matRegister', gs.trade.register); }
  // (v4.3) the stall's counters, each with its own shelf / register / cash (when the build has them)
  for (const c of (gs.market && Array.isArray(gs.market.counters) ? gs.market.counters : [])) { const id = 'market:' + (c.id || '?'); wk(id + ':shelf', c.shelfPad || c.shelf); wk(id + ':register', c.register); wk(id + ':cash', c.cash && (c.cash.pad || c.cash)); }
  // (v4.3) the fishing deck's reel spot and crate (WORLD.deck: [x, y] points)
  const DK = WORLD.deck;
  if (DK) for (const k of ['reel', 'crate']) { const q = DK[k]; if (Array.isArray(q)) wk('deck:' + k, { x: q[0], y: q[1] }); else if (q && Number.isFinite(q.x)) wk('deck:' + k, q); }
  for (const k in gs.piles || {}) wk('pile:' + k, gs.piles[k]);
  if (gs.trash) wk('trash', gs.trash);
  if (gs.foodBox) wk('foodBox', gs.foodBox);
  for (const id in gs.sites) { const st = gs.sites[id]; if (st.state !== 'done' && Number.isFinite(st.dropX)) wk('drop:' + id, { x: st.dropX, y: st.dropY }); }
  // ---- water and fog
  const regions = Object.fromEntries(Object.keys(gs.territory.regions).map((k) => { const r = gs.territory.regions[k]; return [k, { open: !!r.open, rect: r.rect || (r.cfg && r.cfg.rect) || null, cfg: { open: r.cfg && r.cfg.open === true, openWith: (r.cfg && r.cfg.openWith) || '', openFlag: (r.cfg && r.cfg.openFlag) || '', tower: (r.cfg && r.cfg.tower) || '' } }]; }));
  const shore = []; for (let x = Math.floor((WORLD.left || 0) / 8) * 8; x <= WORLD.width; x += 8) shore.push([x, r1(W.shoreY(x))]);
  // ---- (v4.3 step B, L1 — BP-19) hidden plots (world.js `hidden: true`: no Site) from WORLD.plots, checked like the others; the
  //      plot rows themselves, the reserves, the build unlocks and the build-menu kinds (the step-B rules: checkStepB)
  const FPS = { S: [181, 91], M: [272, 136], L: [362, 181], XL: [525, 262] };
  for (const id in WORLD.plots) {
    const p = WORLD.plots[id];
    if (p.hidden !== true) continue;
    const f = FPS[p.size] || FPS.M;
    addB('hidden:' + id, 'hidden', p.x, p.y, diamond(p.x, p.y, f[0], f[1]), { size: p.size, building: '', only: p.only || '', region: p.region || regionOf(p.x, p.y), after: p.after || '', also: p.also ? [].concat(p.also) : [], site: !!gs.sites[id] });
  }
  const plotRows = Object.fromEntries(Object.entries(WORLD.plots).map(([id, p]) => [id, { x: p.x, y: p.y, size: p.size, region: p.region || '', after: p.after || '', also: p.also ? [].concat(p.also) : [], only: p.only || '', types: Array.isArray(p.types) ? p.types.slice() : null, hidden: p.hidden === true, pads: p.pads || null, clear: p.clear || null, drop: p.drop || null, site: !!gs.sites[id], shown: !!(gs.sites[id] && gs.sites[id].shown), state: gs.sites[id] ? gs.sites[id].state : null }]));
  const reserves = Object.fromEntries(Object.entries(WORLD.reserves || {}).map(([id, R]) => [id, { m: R.m, zone: R.zone, poly: (R.poly || []).map(([x, y]) => [r1(x), r1(y)]) }]));
  let unlock = {}, kinds = [];
  try { const PR2 = await import(new URL('src/systems/Progression.js', location.href).href); unlock = Object.assign({}, PR2.BUILD_UNLOCK || {}); } catch (e) { /* */ }
  try { const C = await import(new URL('src/systems/Civic.js', location.href).href); kinds = Object.keys(C.CATALOG || {}); } catch (e) { /* */ }
  // (WORLD.v43: where an old village's chief restarts after the remap (S): the hut door, the shop front — walkable here?)
  const V43 = WORLD.v43 || {}, C0 = gs.collision;
  const starts = Object.fromEntries(['oldStart', 'shopFront'].filter((k) => Array.isArray(V43[k])).map((k) => { const [x, y] = V43[k]; return [k, { x, y, blocked: !!C0.blocked(x, y, 16), walk: C0.inWalk ? !!C0.inWalk(x, y) : true }]; }));
  return { bld, dec, nodes, edges, streets, pads, regions, shore, plotRows, reserves, unlock, kinds, starts, world: { left: WORLD.left || 0, width: WORLD.width, height: WORLD.height, player: WORLD.player } };
};

// ------------------------------------------------------------------------------------------------ node side: geometry
const G = ([x, y]) => [x, y * 2];                       // ground space (y doubled: 2:1 ellipses are circles)
const inPoly = (P, x, y) => { let c = false; for (let a = 0, b = P.length - 1; a < P.length; b = a++) { const [xa, ya] = P[a], [xb, yb] = P[b]; if ((ya > y) !== (yb > y) && x < ((xb - xa) * (y - ya)) / ((yb - ya) || 1e-9) + xa) c = !c; } return c; };
const segDist = (px, py, ax, ay, bx, by) => { const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1; const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / l2)); return Math.hypot(px - ax - vx * t, py - ay - vy * t); };
/** signed ground distance from (x, y) to polygon P (screen px): < 0 inside (depth), > 0 outside */
const polyDist = (P, x, y) => { const Q = P.map(G), [gx, gy] = G([x, y]); let d = Infinity; for (let a = 0, b = Q.length - 1; a < Q.length; b = a++) d = Math.min(d, segDist(gx, gy, Q[b][0], Q[b][1], Q[a][0], Q[a][1])); return inPoly(Q, gx, gy) ? -d : d; };
const area = (P) => { let s = 0; for (let a = 0, b = P.length - 1; a < P.length; b = a++) s += (P[b][0] + P[a][0]) * (P[b][1] - P[a][1]); return Math.abs(s) / 2; };
const ccw = (P) => { let s = 0; for (let a = 0, b = P.length - 1; a < P.length; b = a++) s += (P[a][0] - P[b][0]) * (P[a][1] + P[b][1]); return s < 0 ? P : P.slice().reverse(); };
/** area of the intersection of two convex polygons (Sutherland–Hodgman), in ground px² */
const clipArea = (P0, Q0) => {
  let out = ccw(P0.map(G));
  const Q = ccw(Q0.map(G));
  for (let i = 0; i < Q.length && out.length; i++) {
    const [ax, ay] = Q[i], [bx, by] = Q[(i + 1) % Q.length];
    const side = ([x, y]) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    const inp = out; out = [];
    for (let k = 0; k < inp.length; k++) {
      const p = inp[k], q = inp[(k + 1) % inp.length], sp = side(p), sq = side(q);
      if (sp >= 0) out.push(p);
      if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
    }
  }
  return out.length > 2 ? area(out) : 0;
};
/** ground length of a polyline's part inside P (sampled every 8 ground px) and its closest approach */
const segThrough = (P, pts) => {
  let inside = 0, minD = Infinity;
  for (let k = 1; k < pts.length; k++) {
    const [ax, ay] = pts[k - 1], [bx, by] = pts[k], L = Math.hypot(bx - ax, (by - ay) * 2), n = Math.max(1, Math.ceil(L / 8));
    for (let s = 0; s <= n; s++) { const x = ax + ((bx - ax) * s) / n, y = ay + ((by - ay) * s) / n, d = polyDist(P, x, y); minD = Math.min(minD, d); if (d < 0 && s > 0) inside += L / n; }
  }
  return { inside, minD };
};
const shoreAt = (shore, x) => { const i = Math.max(0, Math.min(shore.length - 2, Math.floor((x - shore[0][0]) / 8))); const [x0, y0] = shore[i], [x1, y1] = shore[i + 1]; return y0 + ((y1 - y0) * (x - x0)) / ((x1 - x0) || 1); };
const regionAt = (regions, x, y) => { for (const k in regions) { const r = regions[k].rect; if (r && x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]) return k; } return null; };
/** when a region opens, as a key two regions can share: open from the start, with another region, on a flag, by its tower */
const opensWhen = (regions, k) => { const c = regions[k] && regions[k].cfg; if (!c) return 'never'; if (k === 'start' || c.open) return 'start'; if (c.openWith) return opensWhen(regions, c.openWith); if (c.openFlag) return 'flag:' + c.openFlag; return 'region:' + k; };

const MARGIN = { decor: 0, node: 40, edge: 30, pad: 0, water: 46 };
function checkLayout(scene, D) {
  const rows = [];
  const add = (b, type, level, other, ox, oy, measure, note) => rows.push({ scene, area: b.x >= 3000 ? 'neighbours' : 'village', building: b.id, kind: b.kind, on: b.building || '', bx: b.x, by: b.y, region: b.region, type, level, other, ox, oy, measure: Math.round(measure), note: note || '' });
  const B = D.bld;
  // footprint vs footprint (a plot and the building standing on it are one entry; v4 lots hold v4 buildings by design)
  for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) {
    const a = B[i], b = B[j];
    if (Math.abs(a.x - b.x) > 900 || Math.abs(a.y - b.y) > 600) continue;
    if ((a.kind === 'v4lot' && b.kind === 'v4building') || (b.kind === 'v4lot' && a.kind === 'v4building')) continue;
    const ov = clipArea(a.poly, b.poly);
    if (ov > 1) add(a, 'building', 'overlap', b.id, b.x, b.y, ov, 'ground px² shared');
  }
  for (const b of B) {
    // decor inside the footprint (a prop's own collider radius counts as touch)
    for (const d of D.dec) {
      if (Math.abs(d.x - b.x) > 700 || Math.abs(d.y - b.y) > 400) continue;
      if (b.building && d.key === b.building && Math.abs(d.x - b.x) < 12 && Math.abs(d.y - b.y) < 12) continue;   // (its own picture)
      const dd = polyDist(b.poly, d.x, d.y);
      if (dd < -MARGIN.decor) add(b, 'decor', 'overlap', d.key, d.x, d.y, -dd, (d.soft ? 'ground decal; ' : '') + 'inside by px' + (d.region !== b.region ? '; decor region ' + d.region : ''));
      else if (d.r > 0 && dd < d.r) add(b, 'decor', 'touch', d.key, d.x, d.y, d.r - dd, 'collider reaches in by px');
    }
    // the walk graph
    for (const n of D.nodes) {
      if (Math.abs(n.x - b.x) > 700 || Math.abs(n.y - b.y) > 400) continue;
      const dd = polyDist(b.poly, n.x, n.y);
      if (dd < 0) add(b, 'road_node', 'overlap', n.id, n.x, n.y, -dd, 'node inside by px');
      else if (dd < MARGIN.node) add(b, 'road_node', 'touch', n.id, n.x, n.y, dd, 'node this close (px)');
    }
    for (const e of D.edges) {
      const xs = e.pts.map((p) => p[0]), ys = e.pts.map((p) => p[1]);
      if (Math.min(...xs) > b.x + 700 || Math.max(...xs) < b.x - 700 || Math.min(...ys) > b.y + 400 || Math.max(...ys) < b.y - 400) continue;
      const s = segThrough(b.poly, e.pts);
      const mid = e.pts[Math.floor(e.pts.length / 2)];
      if (s.inside > 20) add(b, 'road_edge', 'overlap', e.a + '→' + e.b, mid[0], mid[1], s.inside, 'ground px of the edge inside' + (e.usable ? '' : ' (edge not usable yet)'));
      else if (s.minD < MARGIN.edge) add(b, 'road_edge', 'touch', e.a + '→' + e.b, mid[0], mid[1], Math.max(0, s.minD), 'edge this close (px)');
    }
    for (const s of D.streets) {
      if (b.kind === 'v4lot' || b.kind === 'v4building') continue;
      const ov = clipArea(b.poly, s.poly);
      if (ov > 1) add(b, 'street', 'overlap', s.id, s.poly[0][0], s.poly[0][1], ov, 'ground px² on the painted street');
    }
    // pads (centre inside = overlap; its floor diamond reaching in = touch)
    for (const p of D.pads) {
      if (Math.abs(p.x - b.x) > 700 || Math.abs(p.y - b.y) > 400) continue;
      if (b.kind === 'plot' && p.id === 'drop:' + b.id.slice(5)) continue;
      const dd = polyDist(b.poly, p.x, p.y);
      if (dd < 0) add(b, 'pad', 'overlap', p.id + ' (' + p.kind + ')', p.x, p.y, -dd, 'pad centre inside by px');
      else { const pd = clipArea(b.poly, [[p.x - p.hw, p.y], [p.x, p.y - p.hw / 2], [p.x + p.hw, p.y], [p.x, p.y + p.hw / 2]]); if (pd > 0.25 * 2 * p.hw * p.hw) add(b, 'pad', 'touch', p.id + ' (' + p.kind + ')', p.x, p.y, pd, 'ground px² of the pad floor under the footprint'); }
    }
    // the sea (the net / deck stand in it on purpose: reported, level 'by design')
    let worst = Infinity, wx = 0;
    for (const [x, y] of b.poly) { const m = y - shoreAt(D.shore, x); if (m < worst) { worst = m; wx = x; } }
    for (let k = 0; k < b.poly.length; k++) { const [ax, ay] = b.poly[k], [bx, by] = b.poly[(k + 1) % b.poly.length]; const x = (ax + bx) / 2, y = (ay + by) / 2, m = y - shoreAt(D.shore, x); if (m < worst) { worst = m; wx = x; } }
    b.shoreMargin = Math.round(worst);
    if (worst < MARGIN.water) add(b, 'water', b.water ? 'by design' : worst < 0 ? 'overlap' : 'touch', 'sea', Math.round(wx), Math.round(shoreAt(D.shore, wx)), worst, worst < 0 ? 'px into the sea' : 'px from the shore (walkers keep 46)');
    // the fog: a corner (or edge middle) in land that opens at another time than the building's own
    //  ((v4.3 step B, L1) …and that may still be closed while it shows: land open from the start never is, nor land its plot's
    //   `after` / `also` waits for ('r:east': d_store's east corner, the store needs the open east coast))
    const own = opensWhen(D.regions, b.region);
    const sure = new Set([own, 'start']);
    for (const c of [b.after].concat(b.also || [])) if (typeof c === 'string' && /^r:/.test(c)) sure.add(opensWhen(D.regions, c.slice(2)));
    const pts = b.poly.concat(b.poly.map((p, k) => { const q = b.poly[(k + 1) % b.poly.length]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; }));
    const bad = new Set();
    for (const [x, y] of pts) {
      const r = regionAt(D.regions, x, y);
      if (!r) { if (x < D.world.left || x > D.world.width || y > D.world.height) bad.add('outside the map'); continue; }
      if (r !== b.region && !sure.has(opensWhen(D.regions, r))) bad.add(r + ' (' + opensWhen(D.regions, r) + ')');
    }
    for (const r of bad) add(b, 'fog', 'overlap', r, b.x, b.y, 0, 'part of the footprint lies in land that opens ' + (r === 'outside the map' ? 'never' : 'at another time') + '; own: ' + b.region + ' (' + own + ')');
  }
  return rows;
}

// ------------------------------------------------------------------------------------------------ step B (L1): plot table v2
// (v4.3 step B 「마을 새 단장 둘째 걸음」 — build_plan.md §2, §3.4 L1, BP-19 / BP-31, decisions §4 광장 1, Q25, Q29 / Q37)
// The rules of plot table v2, checked on each scene's dump (every row a pass / FAIL line; a FAIL sets the exit code):
//   ids     every step-B plot id is a WORLD.plots row; exactly w_civic / d_labour / d_school / d_clinic are hidden and have no
//           Site; a hidden plot's `only` is not a building of this version (d_labour: labour_office, v4.4); the fixed workshop
//           plots take only their workshop and open with it (BUILD_UNLOCK); w_hall takes only the hall (start, hire_hunter);
//           w_rest offers the restaurant only (`types`); generic M / L plots carry `types` and offer no workshop; every plot
//           site that holds a building is shown (BP-17: the late fixture's hall, office, workshops)
//   starts  WORLD.v43.oldStart (the hut door) and shopFront, where S restarts an old village's chief: walkable, off every pad
//   overlap no step-B plot (new, moved or hidden) shares ground with another plot — or with the 한마당 reserve
//   reserve nothing inside p47_plaza but what stood there at L1 (RESERVE_KEEP): no new tree, decor, plot, pad or road node
//   branch  the branch-shop candidates (s_m1 / s_l1, se_m1 / se_l1, w_civic) stay free: no `only`, no step-B plot on them
//   hall    the hall's front square (w_hall `clear`) holds no decor and no pad but the hall's own (BP-31)
//   inside  no decor and no pad inside a step-B plot's footprint (a hidden plot's land stays empty snow), apart from what L2
//           moves off the hall site (L2_PENDING: the trash pad and its fire, X-4)
const STEPB_PLOTS = ['w_hall', 'w_civic', 'd_tool', 'd_wh', 'd_cannery', 'd_store', 'd_labour', 'd_school', 'd_clinic', 'h43_2', 'v42_office'];
const STEPB_NEW = ['w_hall', 'w_civic', 'd_tool', 'd_wh', 'd_cannery', 'd_store', 'd_labour', 'd_school', 'd_clinic', 'h43_2'];
const HIDDEN = ['w_civic', 'd_labour', 'd_school', 'd_clinic'];
const WORKSHOP_PLOT = { toolsmith: 'd_tool', warehouse: 'd_wh', cannery: 'd_cannery', store: 'd_store' };
const BRANCH = ['s_m1', 's_l1', 'se_m1', 'se_l1', 'w_civic'];
const V43_BUILDINGS = ['toolsmith', 'warehouse', 'boathouse', 'cannery', 'store', 'house_a', 'house_b', 'house_c', 'watchtower', 'station', 'town_hall', 'big_restaurant', 'chief_office', 'bank42', 'depot42'];
// what stood inside the reserve when L1 drew it (decisions §4: the green's props, the x = 990 road and its crossing, the
// roadside lamp / signpost / bush / snow pile / ice, four ground decals): [x, y] ± 26 px. Anything else inside is new.
const RESERVE_KEEP = [[1040, 1500], [940, 1520], [1052, 1660], [900, 1720], [1060, 1760], [740, 1575], [740, 1521], [835, 1546],
  [1235, 1555], [1440, 1610], [1215, 1700], [760, 1580], [1220, 1590], [1120, 1520], [1010, 1720]];
const RESERVE_NODES = ['cross_n', 'green'];
// L2 clears the hall site (X-4, BP-18): until then these stand on w_hall's footprint [what, x, y]
const L2_PENDING = { w_hall: [['trash', 150, 700]] };
function checkStepB(scene, D, rows) {
  const out = [];
  const T = (c, msg, extra) => out.push({ scene, ok: !!c, msg, extra: c ? undefined : extra });
  const P = D.plotRows || {};
  const isW = (k) => V43_BUILDINGS.indexOf(k) >= 0 || (D.kinds || []).indexOf(k) >= 0;
  // ---- ids and rows
  const missing = STEPB_PLOTS.filter((id) => !P[id]);
  T(!missing.length, 'ids: every step-B plot id is a WORLD.plots row', missing);
  const hidden = Object.keys(P).filter((id) => P[id].hidden);
  T(hidden.slice().sort().join() === HIDDEN.slice().sort().join(), 'ids: exactly w_civic / d_labour / d_school / d_clinic are hidden', hidden);
  T(hidden.every((id) => !P[id].site), 'ids: a hidden plot has no Site (no sprite, pad, sign, menu)', hidden.filter((id) => P[id].site));
  T(hidden.every((id) => P[id].only && (id === 'd_labour' ? P[id].only === 'labour_office' : !isW(P[id].only))), 'ids: a hidden plot\'s `only` is no building of this version (d_labour: labour_office)', hidden.map((id) => id + ':' + P[id].only));
  const ws = Object.entries(WORKSHOP_PLOT).filter(([k, id]) => !P[id] || P[id].only !== k || P[id].size !== 'M' || P[id].after !== (D.unlock[k] || P[id].after));
  T(!ws.length, 'ids: d_tool / d_wh / d_cannery / d_store take only their workshop (M) and open with it (BUILD_UNLOCK)', ws.map(([k, id]) => id + ':' + (P[id] && P[id].only) + '/' + (P[id] && P[id].after) + ' vs ' + D.unlock[k]));
  const H = P.w_hall || {};
  T(H.only === 'town_hall' && H.size === 'XL' && H.region === 'start' && H.after === 'hire_hunter', 'ids: w_hall = the hall only, XL, start, after hire_hunter', H);
  const R0 = P.w_rest || {};
  T(!R0.only && Array.isArray(R0.types) && R0.types.join() === 'big_restaurant', 'ids: w_rest offers the big restaurant only (types)', R0);
  const generic = Object.keys(P).filter((id) => !P[id].only && !P[id].hidden && (P[id].size === 'M' || P[id].size === 'L'));
  const gbad = generic.filter((id) => !Array.isArray(P[id].types) || P[id].types.some((t) => /^(toolsmith|warehouse|cannery|store)$/.test(t)));
  T(generic.length >= 6 && !gbad.length, 'ids: every generic M / L plot (' + generic.length + ') carries `types` and offers no workshop', gbad);
  T(P.v42_office && P.v42_office.after === 'zone_mine', 'ids: v42_office opens at zone_mine (the office as a side goal)', P.v42_office && P.v42_office.after);
  // (BP-17) a plot site that holds a building (foundation, scaffold or finished: the late fixture's hall on w_hall, its office)
  //  is shown, whatever its plot's after / also say now
  const heldHidden = Object.keys(P).filter((id) => P[id].site && P[id].state && P[id].state !== 'plot' && !P[id].shown);
  T(!heldHidden.length, 'ids: every plot site that holds a building is shown (BP-17; ' + Object.keys(P).filter((id) => P[id].site && P[id].state && P[id].state !== 'plot').length + ' held)', heldHidden);
  // (WORLD.v43, B0 values / L1 final) the old-village restart spots: on the map, walkable, off every pad (S restarts the chief there)
  const ST = D.starts || {};
  const stBad = ['oldStart', 'shopFront'].filter((k) => !ST[k] || ST[k].blocked || !ST[k].walk || D.pads.some((p) => Math.abs(p.x - ST[k].x) + 2 * Math.abs(p.y - ST[k].y) < p.hw + 10)).map((k) => k + ':' + JSON.stringify(ST[k] || null) + (ST[k] ? ' pads ' + D.pads.filter((p) => Math.abs(p.x - ST[k].x) + 2 * Math.abs(p.y - ST[k].y) < p.hw + 10).map((p) => p.id).join(',') : ''));
  T(!stBad.length, 'starts: WORLD.v43.oldStart (' + (ST.oldStart ? ST.oldStart.x + ', ' + ST.oldStart.y : '?') + ') and shopFront (' + (ST.shopFront ? ST.shopFront.x + ', ' + ST.shopFront.y : '?') + ') are walkable and off every pad', stBad);
  T(['d_tool', 'd_cannery'].every((id) => P[id] && P[id].pads && Array.isArray(P[id].pads.line) && Array.isArray(P[id].pads.p2)) && P.d_cannery && P.d_cannery.pads && Array.isArray(P.d_cannery.pads.mcan), 'ids: the workshop plots name their hire pads (d_tool line / p2, d_cannery line / p2 / mcan: BP-20)');
  // ---- overlaps (ground shared with another plot or the reserve)
  const B = D.bld.filter((b) => b.kind === 'plot' || b.kind === 'hidden');
  const idOf = (b) => b.id.replace(/^(plot|hidden):/, '');
  const ov = [];
  for (const a of B) for (const b of B) if (a !== b && idOf(a) < idOf(b) && (STEPB_NEW.indexOf(idOf(a)) >= 0 || STEPB_NEW.indexOf(idOf(b)) >= 0)) { const s2 = clipArea(a.poly, b.poly); if (s2 > 1) ov.push(idOf(a) + '~' + idOf(b) + ' ' + Math.round(s2)); }
  T(!ov.length, 'overlap: no step-B plot shares ground with another plot (BP-19; hidden plots read from WORLD.plots)', ov);
  const res = D.reserves || {};
  for (const rid in res) {
    const RP = res[rid].poly;
    if (!RP || RP.length < 3) { T(false, 'reserve ' + rid + ': has a polygon'); continue; }
    const ovr = B.filter((b) => clipArea(b.poly, RP) > 1).map((b) => idOf(b));
    T(!ovr.length, 'reserve ' + rid + ': no plot (shown or hidden) reaches into it', ovr);
    const inside = (x, y) => polyDist(RP, x, y) < 0;
    const keep = (x, y) => RESERVE_KEEP.some(([kx, ky]) => Math.hypot(kx - x, (ky - y) * 2) < 52);
    const newDec = D.dec.filter((d) => inside(d.x, d.y) && !keep(d.x, d.y)).map((d) => d.key + '@' + d.x + ',' + d.y);
    T(!newDec.length, 'reserve ' + rid + ': no new tree / decor / prop inside (' + D.dec.filter((d) => inside(d.x, d.y)).length + ' kept from L1)', newDec);
    const padIn = D.pads.filter((p) => inside(p.x, p.y) || polyDist(RP, p.x, p.y) < p.hw / 2).map((p) => p.id + '@' + p.x + ',' + p.y);
    T(!padIn.length, 'reserve ' + rid + ': no pad (paid, to come or work) stands in it', padIn);
    const nodeIn = D.nodes.filter((n) => inside(n.x, n.y) && RESERVE_NODES.indexOf(n.id) < 0).map((n) => n.id);
    T(!nodeIn.length, 'reserve ' + rid + ': no road node inside but the x = 990 road\'s (cross_n, green)', nodeIn);
  }
  // ---- branch-shop candidates stay free
  const br = BRANCH.filter((id) => !P[id] || (id === 'w_civic' ? !P[id].hidden || isW(P[id].only) : !!P[id].only || P[id].hidden || !Array.isArray(P[id].types)));
  T(!br.length, 'branch: s_m1 / s_l1 / se_m1 / se_l1 stay generic (types, no only) and w_civic hidden (Q29 / Q37)', br);
  // ---- the hall's front square
  const hb = D.bld.find((b) => b.id === 'plot:w_hall');
  if (hb && Array.isArray(H.clear)) {
    const C2 = H.clear.map(([dx, dy, r]) => [hb.x + dx, hb.y + dy, r]);
    const inC = (x, y) => C2.some(([cx, cy, r]) => Math.hypot(cx - x, (cy - y) * 2) < r);
    const own = /^(drop:w_hall|rank_eup|place:rank_eup|hall|w_hall)/;
    const dIn = D.dec.filter((d) => inC(d.x, d.y) && !d.soft).map((d) => d.key + '@' + d.x + ',' + d.y);
    const pIn = D.pads.filter((p) => inC(p.x, p.y) && !own.test(p.id)).map((p) => p.id + '@' + p.x + ',' + p.y);
    T(!dIn.length && !pIn.length, 'hall: the front square (w_hall clear) holds no decor and no pad but the hall\'s own (BP-31)', { decor: dIn, pads: pIn });
  } else T(false, 'hall: w_hall has its front square (clear)');
  // ---- nothing inside a step-B plot's footprint (decor, pads) but L2's list
  const inBad = [];
  for (const r of rows) {
    const id = r.building.replace(/^(plot|hidden):/, '');
    if (r.building === id || STEPB_NEW.indexOf(id) < 0 || r.level !== 'overlap' || (r.type !== 'decor' && r.type !== 'pad' && r.type !== 'road_node')) continue;
    if (r.type === 'decor' && /^decal:/.test(r.other)) continue;            // (ground decals: painted snow, nothing stands there)
    const pend = (L2_PENDING[id] || []).some(([w, x, y]) => (r.other.indexOf(w) === 0) && Math.hypot(r.ox - x, (r.oy - y) * 2) < 30);
    if (!pend) inBad.push(id + ': ' + r.type + ' ' + r.other + ' @' + r.ox + ',' + r.oy);
  }
  T(!inBad.length, 'inside: no decor, pad or road node on a step-B plot (L2_PENDING: the trash pad on w_hall, X-4)', inBad);
  return out;
}

// ------------------------------------------------------------------------------------------------ page side: walks
/**
 * the walk rows. Each place: a list of __FV.where names (new layout first) or a resolver. near: the walker's
 * "straight when near" (ChiefPilot / Staff 220, Hauler 360). alt: { place: plot to move it from, to: plot }.
 */
const WALKS = [
  { id: 'chief_first_walk', who: 'chief', primary: 'direct', near: 220, from: ['@start'], to: ['reel', 'deckReel', 'net'], note: 'new game: where the chief stands → the net gather point (new: the deck reel spot)' },
  { id: 'food_reg_to_trade_reg', who: 'chief', primary: 'direct', near: 220, from: ['register', 'foodRegister'], to: ['matRegister', 'tradeRegister'], note: 'chief: the food register ↔ the trade / 자재 register (one way; the round trip is twice)' },
  // ((v4.3 밀밭 · 빵집) the bakery's own legs: the oven fills its stall (loaves fly ≈ 3 m), the chief alternates the doorway and the
  //  stall's register, the wheat porter goes pile → gate → oven door, the bread porter rack → the miners' food box, the stall's
  //  customers walk up from the end of their line (bakery_q)
  { id: 'oven_to_stall', who: 'chief', primary: 'direct', near: 220, from: ['bakeryDoor'], to: ['bakeryShelf'], note: 'the oven doorway (W) → the stall\'s shelf pad (the loaves fly this far)' },
  { id: 'bakery_door_to_register', who: 'chief', primary: 'direct', near: 220, from: ['bakeryDoor'], to: ['bakeryRegister'], note: 'chief: the oven doorway W ↔ the stall\'s register R (one way)' },
  { id: 'wheat_pile_to_bakery_in', who: 'porter', primary: 'route', near: 360, from: ['pile:wheat'], to: ['bakeryIn'], note: '밀 짐꾼: wheat pile → the field\'s wheat gate → the oven door I' },
  { id: 'bakery_rack_to_foodbox', who: 'porter', primary: 'route', near: 360, from: ['bakeryRack'], to: ['foodBox'], note: '빵 짐꾼: the bread rack O → the miners\' food box' },
  { id: 'customer_bakery_q_to_stall', who: 'porter', primary: 'route', near: 360, from: ['bakeryQ'], to: ['bakeryShelf'], note: 'bakery customers: the end of their line (bakery_q) → the stall' },
  { id: 'meat_rack_to_cannery', who: 'porter', primary: 'route', near: 360, from: ['pile:meat'], to: ['canneryIn'], note: '고기 짐꾼: meat rack → cannery input' },
  { id: 'cannery_to_store', who: 'porter', primary: 'route', near: 360, from: ['canneryOut'], to: ['storeShelf'], note: 'can porter: cannery output → store shelf' },
  { id: 'cannery_to_store', alt: 'bots w_m1 → w_m2', who: 'porter', primary: 'route', near: 360, from: ['canneryOut'], to: ['storeShelf'], move: { canneryOut: 'w_m1', storeShelf: 'w_m2' }, note: 'the smart bots put the cannery on w_m1 and the store on w_m2' },
  { id: 'meat_rack_to_cannery', alt: 'bots w_m1', who: 'porter', primary: 'route', near: 360, from: ['pile:meat'], to: ['canneryIn'], move: { canneryIn: 'w_m1' }, note: 'cannery on w_m1' },
  { id: 'coin_round', who: 'courier', primary: 'route', near: 220, loop: [['@officeDesk'], ['cash'], ['storeCash'], ['@stationCash'], ['hallTax'], ['restCash'], ['@bankDeposit'], ['@officeDesk']], note: 'office → shop coins → store → station cash → hall → restaurant → bank → office (§4.6)' },
  { id: 'coin_round', alt: 'no station cash', who: 'courier', primary: 'route', near: 220, loop: [['@officeDesk'], ['cash'], ['storeCash'], ['hallTax'], ['restCash'], ['@bankDeposit'], ['@officeDesk']], note: 'the same without the station cash (D10: the train carries it once the hall stands)' },
  // the first loop's legs (the onboarding's Act 1 places)
  { id: 'first_loop:net_to_grill_work', who: 'chief', primary: 'direct', near: 220, from: ['reel', 'deckReel', 'net'], to: ['op:grill'], note: 'net / reel → the grill work spot' },
  { id: 'first_loop:grill_out_to_shelf', who: 'chief', primary: 'direct', near: 220, from: ['grillOut'], to: ['fishShelf', 'shelf'], note: 'grill output → stall shelf' },
  { id: 'first_loop:shelf_to_register', who: 'chief', primary: 'direct', near: 220, from: ['fishShelf', 'shelf'], to: ['fishRegister', 'register'], note: 'stall shelf → register' },
  { id: 'first_loop:register_to_cash', who: 'chief', primary: 'direct', near: 220, from: ['fishRegister', 'register'], to: ['fishCash', 'cash'], note: 'register → cash pad' },
  { id: 'fish_pile_to_grill', who: 'porter', primary: 'route', near: 360, from: ['crate', 'pile:fish'], to: ['grillIn'], note: 'raw porter: fish pile (new: deck crate) → grill input' },
  { id: 'plank_porter_to_trade', who: 'porter', primary: 'route', near: 360, from: ['sawmillOut'], to: ['matShelf', 'tradeShelf'], note: 'plank porter: sawmill output → trade / 자재 shelf' },
  { id: 'ingot_porter_to_trade', who: 'porter', primary: 'route', near: 360, from: ['smelterOut'], to: ['matShelf', 'tradeShelf'], note: 'ingot porter: smelter output → trade / 자재 shelf' },
];

const WALK_PAGE = async (list) => {
  const gs = window.__FV.scene, F = window.__FV;
  const W = await import(new URL('src/data/world.js', location.href).href);
  const { gridPath, segClear } = await import(new URL('src/systems/Paths.js', location.href).href);
  const { WORLD, L4 } = W;
  const gd = (ax, ay, bx, by) => Math.hypot(ax - bx, (ay - by) * 2);
  const C = gs.collision;
  // ((v4.3 「바다 가까이」) the chief's rows: his own ground counts (his landing at the water's edge: Collision.addLand,
  //  `chief` true; an older build ignores the flag)
  const blk = (chief, r) => (x, y) => C.blocked(x, y, r, null, chief) || C.offLand(x, y, chief);
  const bl = blk(false, 16), wide = blk(false, 26), blC = blk(true, 16), wideC = blk(true, 26);
  /** a joystick walk: the straight line when nothing stands on it (chief radius 16, the sea / fog edge), else the
   *  shortest way round on a ground grid (Paths.gridPath, the same A* the walkers' off-road legs use), roads ignored */
  const direct = (a, b, chief) => {
    const B1 = chief ? blC : bl;
    if (segClear(B1, a.x, a.y, b.x, b.y, 8, 0)) return { len: gd(a.x, a.y, b.x, b.y), clear: true, pts: 1 };
    const L = gd(a.x, a.y, b.x, b.y);
    const g = gridPath(B1, a.x, a.y, b.x, b.y, { cell: 20, wide: chief ? wideC : wide, margin: Math.max(520, L * 0.5), maxCells: 90000, maxExpand: 400000 });
    if (!g) return { len: null, clear: false, pts: 0 };
    let len = 0, x = a.x, y = a.y; for (const q of g) { len += gd(x, y, q.x, q.y); x = q.x; y = q.y; }
    return { len, clear: false, pts: g.length };
  };
  const special = {
    '@start': () => ({ x: WORLD.player.x, y: WORLD.player.y }),
    '@officeDesk': () => { const O = gs.v42 && gs.v42.office, B = O && O.building; if (B && B.spots && B.spots.deskPad) return B.spots.deskPad; const d = WORLD.v42 && WORLD.v42.office && WORLD.v42.office.desk; return B && d ? { x: d[0], y: d[1] } : null; },
    '@bankDeposit': () => { const O = gs.v42 && gs.v42.office; return O && O.bank && O.bank.depositPoint ? O.bank.depositPoint() : null; },
    '@stationCash': () => { const G = gs.v4 && gs.v4.growth; const t = G && G.till; if (!t) return null; if (Number.isFinite(t.x)) return t; if (t.pad) return t.pad; const c = WORLD.v4 && WORLD.v4.square && WORLD.v4.square.cash; if (c) { const [x, y] = L4(c.i, c.j); return { x, y }; } return null; },
  };
  const look = (names, move) => {
    for (const n of names) {
      let p = special[n] ? special[n]() : F.where(n);
      if (p && Number.isFinite(p.x)) {
        p = { x: p.x, y: p.y };
        const plot = move && move[n];
        if (plot) {
          // the same place moved with its building to another plot (offset from the plot it stands on)
          const here = Object.values(gs.sites).find((s) => s.state === 'done' && Math.abs(s.x - p.x) < 260 && Math.abs(s.y - p.y) < 200 && s.kind === 'plot'), to = gs.sites[plot];
          if (!here || !to) return { name: n + '@' + plot, miss: 'no plot to move from / to' };
          p = { x: p.x - here.x + to.x, y: p.y - here.y + to.y };
          return { name: n + '@' + plot, x: p.x, y: p.y, from: here.id };
        }
        return { name: n, x: p.x, y: p.y };
      }
    }
    return { name: names.join('|'), miss: 'not here' };
  };
  const route = (a, b, near) => {
    gs.roads.newFrame(0);
    const pts = gs.roads.route(a.x, a.y, b.x, b.y, [], near);
    let len = 0, x = a.x, y = a.y, off = 0;
    for (const q of pts) { const d = gd(x, y, q.x, q.y); len += d; x = q.x; y = q.y; }
    // the part of the way on no road (farther than 60 px from every usable edge)
    return { len, pts: pts.map((q) => [Math.round(q.x), Math.round(q.y)]), legs: pts.length, off };
  };
  const out = [];
  for (const w of list) {
    const legs = w.loop ? w.loop.slice(1).map((to, k) => [w.loop[k], to]) : [[w.from, w.to]];
    let tot = 0, straight = 0, miss = null, n = 0, dir = 0, dirOk = true, clear = true;
    const parts = [];
    for (const [fa, ta] of legs) {
      const a = look(fa, w.move), b = look(ta, w.move);
      if (a.miss || b.miss) { miss = (a.miss ? a.name + ': ' + a.miss : '') + (b.miss ? (a.miss ? '; ' : '') + b.name + ': ' + b.miss : ''); break; }
      const r = route(a, b, w.near), d = direct(a, b, w.who === 'chief');
      tot += r.len; straight += gd(a.x, a.y, b.x, b.y); n += r.legs;
      if (d.len === null) dirOk = false; else dir += d.len;
      if (!d.clear) clear = false;
      parts.push({ from: a.name, to: b.name, ax: Math.round(a.x), ay: Math.round(a.y), bx: Math.round(b.x), by: Math.round(b.y), m: +(r.len / 64).toFixed(2), directM: d.len === null ? null : +(d.len / 64).toFixed(2), straightM: +(gd(a.x, a.y, b.x, b.y) / 64).toFixed(2), clear: d.clear, pts: r.pts });
    }
    const routeM = miss ? null : +(tot / 64).toFixed(2), directM = miss || !dirOk ? null : +(dir / 64).toFixed(2);
    out.push({ id: w.id, alt: w.alt || '', who: w.who, near: w.near, note: w.note, miss, m: w.primary === 'direct' ? directM : routeM, primary: w.primary || 'route', routeM, directM, clear: miss ? null : clear, straightM: miss ? null : +(straight / 64).toFixed(2), waypoints: n, parts });
  }
  return out;
};

// ------------------------------------------------------------------------------------------------ sections
const summary = {};
let stepBFail = false;
if (ONLY.includes('layout') || ONLY.includes('walks')) {
  const lrows = [], wrows = [], dumps = {}, stepB = [];
  for (const [scene, keys] of [['fresh', null], ['late', fixtureKeys('v42_village_late.json')]]) {
    console.log(`— ${scene} (${wall()})`);
    // (--from DIR: the layout check on the dumps a run saved there (layout_raw_<scene>.json), no browser: probes iterate fast)
    const rawF = FROM && path.join(FROM, 'layout_raw_' + scene + '.json');
    if (!FROM) {
      await boot({ keys });
      await ev(() => { window.__FV.teleport(window.__FV.scene.player.x, window.__FV.scene.player.y); window.__step.run(1); });
    }
    if (ONLY.includes('layout')) {
      const D = FROM ? JSON.parse(fs.readFileSync(rawF, 'utf8')) : await ev(DUMP);
      if (!FROM) fs.writeFileSync(path.join(OUT, 'layout_raw_' + scene + '.json'), JSON.stringify(D));
      const FP = { S: [181, 91], M: [272, 136], L: [362, 181], XL: [525, 262] };
      for (const q of PROBES) { const [w, h] = FP[q.size] || FP.M; D.bld.push({ id: 'probe:' + q.id, kind: 'probe', x: q.x, y: q.y, size: q.size, poly: [[q.x - w / 2, q.y], [q.x, q.y - h / 2], [q.x + w / 2, q.y], [q.x, q.y + h / 2]], region: regionAt(D.regions, q.x, q.y) || 'start' }); }
      dumps[scene] = { counts: { buildings: D.bld.length, decor: D.dec.length, nodes: D.nodes.length, edges: D.edges.length, streets: D.streets.length, pads: D.pads.length }, regions: D.regions, buildings: D.bld };
      const rows = checkLayout(scene, D);
      lrows.push(...rows);
      for (const r of checkStepB(scene, D, rows)) { stepB.push(r); console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} [${scene}] ${r.msg}${r.ok ? '' : ' ' + JSON.stringify(r.extra === undefined ? '' : r.extra).slice(0, 700)}`); }
      console.log(`  ${D.bld.length} footprints, ${D.dec.length} decor, ${D.nodes.length} road nodes / ${D.edges.length} edges, ${D.pads.length} pads -> ${rows.filter((r) => r.level === 'overlap').length} overlaps, ${rows.filter((r) => r.level === 'touch').length} touches`);
    }
    if (ONLY.includes('walks') && !FROM) {
      const W = await ev(WALK_PAGE, WALKS);
      for (const w of W) {
        wrows.push({ scene, walk: w.id, alt: w.alt, who: w.who, m: w.m, measure: w.primary, route_m: w.routeM, direct_m: w.directM, straight_m: w.straightM, straight_clear: w.clear, ratio: w.m && w.straightM ? +(w.m / w.straightM).toFixed(2) : null, near: w.near, waypoints: w.waypoints, places: w.parts.map((p) => `${p.from}(${p.ax},${p.ay})→${p.to}(${p.bx},${p.by}) route ${p.m} / direct ${p.directM} m`).join(' | '), missing: w.miss || '', note: w.note });
        if (VERB) console.log(`   ${w.id}${w.alt ? ' [' + w.alt + ']' : ''}: ${w.miss ? 'MISSING ' + w.miss : w.m + ' m (' + w.primary + '; route ' + w.routeM + ', direct ' + w.directM + ', straight ' + w.straightM + (w.clear ? ', clear' : '') + ')'}`);
      }
      (ALL.walks = ALL.walks || {})[scene] = W;
    }
  }
  if (ONLY.includes('layout')) {
    writeCsv('footprints.csv', lrows, ['scene', 'area', 'building', 'kind', 'on', 'bx', 'by', 'region', 'type', 'level', 'other', 'ox', 'oy', 'measure', 'note']);
    // per building: counts by type and level
    const per = new Map();
    for (const sc of Object.keys(dumps)) for (const b of dumps[sc].buildings) per.set(sc + '|' + b.id, { scene: sc, building: b.id, kind: b.kind, on: b.building || '', x: b.x, y: b.y, region: b.region, size: b.size || '', state: b.state || '', shore_margin: b.shoreMargin });
    for (const r of lrows) { const k = r.scene + '|' + r.building, o = per.get(k); if (!o) continue; const c = r.type + '_' + r.level.replace(/ /g, '_'); o[c] = (o[c] || 0) + 1; }
    const cols = ['scene', 'building', 'kind', 'on', 'x', 'y', 'region', 'size', 'state', 'shore_margin'].concat([...new Set(lrows.map((r) => r.type + '_' + r.level.replace(/ /g, '_')))].sort());
    writeCsv('footprint_summary.csv', [...per.values()], cols);
    ALL.layout = { dumps, rows: lrows.length };
    summary.layout = Object.fromEntries(Object.keys(dumps).map((sc) => [sc, Object.fromEntries(['building', 'decor', 'road_node', 'road_edge', 'street', 'pad', 'water', 'fog'].map((t) => [t, lrows.filter((r) => r.scene === sc && r.area === 'village' && r.type === t && r.level === 'overlap').length]))]));
    summary.layoutNote = 'overlaps in the first village (x < 3000) per type; footprints.csv has every row, the station town too';
    summary.stepB = { checks: stepB.length, failed: stepB.filter((r) => !r.ok).map((r) => r.scene + ': ' + r.msg) };
    ALL.stepB = stepB;
    if (stepB.some((r) => !r.ok)) stepBFail = true;
  }
  if (ONLY.includes('walks')) {
    writeCsv('walks.csv', wrows, ['scene', 'walk', 'alt', 'who', 'm', 'measure', 'route_m', 'direct_m', 'straight_m', 'straight_clear', 'ratio', 'near', 'waypoints', 'places', 'missing', 'note']);
    summary.walks = wrows.filter((r) => r.m !== null && (r.scene === 'late' || r.walk.startsWith('chief_first') || r.walk.startsWith('first_loop'))).map((r) => `${r.scene}:${r.walk}${r.alt ? '[' + r.alt + ']' : ''}=${r.m}m`);
  }
}

// ------------------------------------------------------------------------------------------------ first sale
/** the onboarding.mjs bot (walking part only): Act 1 → its arrow target, Act 2 → the shown yellow arrow */
const ONB_BOT = ([secs, rec]) => {
  const F = window.__FV, gs = F.scene, ob = gs.onboard, R = window.__rec = window.__rec || rec;
  let lastPos = window.__lastPos || null, still = window.__still || 0, last = window.__lastKey || null;
  for (let i = 0; i < secs * 10; i++) {
    const o = ob.state(), p = gs.player;
    let tg = null;
    if (o.mode === 'act1' && o.step !== 'hi') tg = o.target;
    else if (o.mode === 'act2' && !(o.card && o.card.key === 'a2:bye')) tg = gs.tutorial.shownTarget ? gs.tutorial.shownTarget() : gs.tutorial.target;
    let vx = 0, vy = 0;
    if (tg) {
      const dx = tg.x - p.x, dy = tg.y - p.y, d = Math.hypot(dx, dy * 2);
      if (d > 16) { const n = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 60); vx = dx / n * k; vy = dy / n * k; }
      if (lastPos && Math.hypot(p.x - lastPos.x, p.y - lastPos.y) < 0.5 && (vx || vy)) { still++; if (still > 10) { const s = Math.floor(still / 10) % 2 ? 1 : -1; const nx = -vy * s, ny = vx * s; vx = vx * 0.3 + nx; vy = vy * 0.3 + ny; R.nudges++; } } else still = 0;
      R.walked += lastPos ? Math.hypot(p.x - lastPos.x, (p.y - lastPos.y) * 2) : 0;
    }
    lastPos = { x: p.x, y: p.y };
    F.setInput(vx, vy);
    window.__step.run(0.1);
    R.t += 0.1;
    const s2 = ob.state(), key = s2.mode + ':' + (s2.step || '');
    if (key !== last) { last = key; R.seq.push([+R.t.toFixed(1), key]); }
    if (R.firstCoins === null && gs.economy.earned > 0) R.firstCoins = +R.t.toFixed(1);
    if (R.clerk === null && gs.progress.done.hire_clerk_market) R.clerk = +R.t.toFixed(1);
    if (R.fisher === null && gs.progress.done.hire_fisherman) R.fisher = +R.t.toFixed(1);
    if (R.act2 === null && s2.mode === 'act2') R.act2 = +R.t.toFixed(1);
    if (R.act3 === null && (s2.mode === 'act3' || s2.mode === 'off') && R.act2 !== null) { R.act3 = +R.t.toFixed(1); break; }
  }
  window.__lastPos = lastPos; window.__still = still; window.__lastKey = last;
  F.setInput(0, 0);
  return R;
};

if (ONLY.includes('firstsale')) {
  const frows = [];
  for (let s = 1; s <= SEEDS; s++) {
    // ---- onboarding bot
    await boot({ init: 'window.__FV_ONBOARD = true;' + (NOFLAG ? 'window.__FV_FLAGMAKER = false;' : '') + seedJs(s), viewport: { width: 412, height: 915 } });
    const flagTap = await passFlagMaker();
    const pre = await ev(() => ({ obT: +window.__FV.scene.onboard.t.toFixed(2), mode: window.__FV.scene.onboard.mode, sceneS: +(window.__FV.scene.time.now / 1000).toFixed(2) }));
    await ev(() => { const gs = window.__FV.scene; window.__sold = null; gs.events.once('sold', () => { window.__sold = window.__rec ? +window.__rec.t.toFixed(1) : 0; }); });
    let R = { t: 0, seq: [], firstCoins: null, clerk: null, fisher: null, act2: null, act3: null, nudges: 0, walked: 0 };
    for (let k = 0; k < 30 && R.act3 === null; k++) R = await ev(ONB_BOT, [20, R]);
    const sold = await ev(() => window.__sold);
    const stepAt = (k) => { const q = R.seq.find((e) => e[1] === k); return q ? q[0] : null; };
    frows.push({ bot: 'onboarding', seed: s, first_sale_s: sold, first_coins_s: R.firstCoins, clerk_hired_s: R.clerk, fisher_hired_s: R.fisher, act2_s: R.act2, handover_s: R.act3, still_at_net_s: stepAt('act1:still'), at_register_s: stepAt('act1:reg'), cash_step_s: stepAt('act1:cash'), preroll_s: pre.obT, walked_m: +(R.walked / 64).toFixed(1), nudges: R.nudges, steps: R.seq.map((e) => e[1].replace('act1:', '') + '@' + e[0]).join(' ') });
    console.log(`  onboarding seed ${s}: first sale ${sold} s, coins ${R.firstCoins} s, clerk ${R.clerk} s, hand-over ${R.act3} s (pre-roll ${pre.obT} s${flagTap ? ', flag maker: 1 tap' : NOFLAG ? ', no flag maker' : ''}) (${wall()})`);
    // ---- smart bot (no tutorial: an automated browser never gets it)
    await boot({ init: seedJs(s), stepper: false, viewport: { width: 360, height: 720 } });
    await ev(() => {
      const game = window.__FV.game; game.loop.sleep();
      let D = Date.now(), T = game.loop.time || performance.now(); Date.now = () => D; const DT = 1000 / 60;
      try { window.__FV.v42.v.seen.whatsNew = 1; } catch (e) { /* */ }
      window.__sim = { simT: 0, run(sec, tick) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { if (tick) tick(DT / 1000); T += DT; D += DT; this.simT += DT / 1000; game.headlessStep(T, DT); } } };
      const gs = window.__FV.scene; window.__fs = { sold: null, coins: null, clerk: null };
      gs.events.once('sold', () => { window.__fs.sold = +window.__sim.simT.toFixed(2); });
    });
    await addBot();
    let S = null;
    for (let k = 0; k < 60; k++) {
      S = await ev(() => { const gs = window.__FV.scene, f = window.__fs; window.__sim.run(2, (dt) => { window.__bot.tick(dt); if (f.coins === null && gs.economy.earned > 0) f.coins = +window.__sim.simT.toFixed(2); if (f.clerk === null && gs.progress.done.hire_clerk_market) f.clerk = +window.__sim.simT.toFixed(2); }); return Object.assign({ t: window.__sim.simT }, f); });
      if (S.sold !== null && S.coins !== null && S.clerk !== null) break;
    }
    frows.push({ bot: 'smart', seed: s, first_sale_s: S.sold, first_coins_s: S.coins, clerk_hired_s: S.clerk });
    console.log(`  smart seed ${s}: first sale ${S.sold} s, coins ${S.coins} s, clerk ${S.clerk} s (${wall()})`);
  }
  writeCsv('firstsale.csv', frows, ['bot', 'seed', 'first_sale_s', 'first_coins_s', 'clerk_hired_s', 'fisher_hired_s', 'act2_s', 'handover_s', 'still_at_net_s', 'at_register_s', 'cash_step_s', 'preroll_s', 'walked_m', 'nudges', 'steps']);
  const med = (a) => { const b = a.filter((x) => Number.isFinite(x)).sort((x, y) => x - y); return b.length ? (b.length % 2 ? b[b.length >> 1] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : null; };
  summary.firstsale = Object.fromEntries(['onboarding', 'smart'].map((b) => { const r = frows.filter((q) => q.bot === b); return [b, { n: r.length, saleMedian: med(r.map((q) => q.first_sale_s)), saleMin: Math.min(...r.map((q) => q.first_sale_s ?? Infinity)), saleMax: Math.max(...r.map((q) => q.first_sale_s ?? -Infinity)), coinsMedian: med(r.map((q) => q.first_coins_s)), clerkMedian: med(r.map((q) => q.clerk_hired_s)) }]; }));
  ALL.firstsale = frows;
}

// ------------------------------------------------------------------------------------------------ merchant
/** 1 Hz sampler of the trade post (or the 자재 창구 through gs.trade) and the stall's food shelf; 'traded' counted */
const MERCH_INSTALL = () => {
  const gs = window.__FV.scene, M = window.__M = { on: false, traded: 0, coins: 0, n: 0, staffed: 0, clerk: 0, chief: 0, empty: 0, stockSum: 0, selling: 0, waiting: 0, mk: {}, mkEmpty: {}, perMin: [], cur: 0, curCoins: 0, curStaffed: 0, curN: 0 };
  gs.events.on('traded', (v) => { if (!M.on) return; M.traded++; M.coins += Number(v) || 0; M.cur++; M.curCoins += Number(v) || 0; });
  const FOOD = ['item_fish_cooked', 'item_bread', 'item_meat_cooked'];
  M.sample = () => {
    if (!M.on) return;
    const T = gs.trade, mk = gs.market;
    M.n++; M.curN++;
    if (T && T.enabled) {
      const st = !!T.register.staffed; if (st) { M.staffed++; M.curStaffed++; }
      if (T.register.clerk) M.clerk++;
      if (st && !T.register.clerk) M.chief++;
      const c = T.stock.count; M.stockSum += c; if (c === 0) M.empty++;
      const keep = T.kept ? T.kept() : 0; if (c > keep) { M.selling++; if (!st) M.waiting++; }
    }
    if (mk && mk.stock) for (const f of FOOD) { const c = mk.stock.countOf(f); M.mk[f] = (M.mk[f] || 0) + c; if (c === 0) M.mkEmpty[f] = (M.mkEmpty[f] || 0) + 1; }
  };
  M.minute = (t) => { M.perMin.push({ t: Math.round(t), items: M.cur, tradeCoins: M.curCoins, staffed: M.curN ? +(M.curStaffed / M.curN).toFixed(2) : null, earned: gs.economy.earned }); M.cur = 0; M.curCoins = 0; M.curStaffed = 0; M.curN = 0; };
  M.read = () => ({ traded: M.traded, coins: M.coins, n: M.n, staffedPct: M.n ? Math.round((100 * M.staffed) / M.n) : null, clerkPct: M.n ? Math.round((100 * M.clerk) / M.n) : null, chiefPct: M.n ? Math.round((100 * M.chief) / M.n) : null, emptyPct: M.n ? Math.round((100 * M.empty) / M.n) : null, stockAvg: M.n ? +(M.stockSum / M.n).toFixed(1) : null, waitingPct: M.n ? Math.round((100 * M.waiting) / M.n) : null,
    mkAvg: Object.fromEntries(FOOD.map((f) => [f, M.n ? +((M.mk[f] || 0) / M.n).toFixed(1) : null])), mkEmptyPct: Object.fromEntries(FOOD.map((f) => [f, M.n ? Math.round((100 * (M.mkEmpty[f] || 0)) / M.n) : null])) });
};
const simInstall = () => {
  const game = window.__FV.game; game.loop.sleep();
  let D = Date.now(), T = game.loop.time || performance.now(); Date.now = () => D; const DT = 1000 / 60;
  try { window.__FV.v42.v.seen.whatsNew = 1; } catch (e) { /* */ }
  window.__sim = { simT: 0, run(sec, tick, each) { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) { if (tick) tick(DT / 1000); T += DT; D += DT; this.simT += DT / 1000; game.headlessStep(T, DT); if (each) each(DT / 1000); } } };
};
const runSampled = (sec) => ev((s) => { let acc = 0; window.__sim.run(s, window.__bot ? window.__bot.tick : null, (dt) => { acc += dt; if (acc >= 1) { acc -= 1; window.__M.sample(); } }); return window.__sim.simT; }, sec);

if (ONLY.includes('merchant')) {
  const mrows = [];
  for (const fx of ['v41_save_smart_25min.json', 'v41_save_smart_46min.json']) {
    // ---- bot: the smart bot plays the save
    await boot({ keys: fixtureKeys(fx), init: seedJs(7), stepper: false, viewport: { width: 360, height: 720 } });
    await ev(simInstall);
    await addBot();
    await ev(MERCH_INSTALL);
    for (let s = 0; s < 60; s += 10) await ev(() => window.__sim.run(10, window.__bot.tick));
    await ev(() => { window.__M.on = true; });
    for (let s = 0; s < 360; s += 10) await runSampled(10);
    const b = await ev(() => Object.assign(window.__M.read(), { clerkHired: !!(window.__FV.scene.trade.register.clerk) }));
    mrows.push(Object.assign({ case: 'bot', save: fx, minutes: 6, items_per_min: +(b.traded / 6).toFixed(1), coins_per_min: Math.round(b.coins / 6) }, flat(b)));
    console.log(`  merchant bot ${fx}: ${(b.traded / 6).toFixed(1)} items/min, staffed ${b.staffedPct} %, shelf empty ${b.emptyPct} % (${wall()})`);
    // ---- ceiling: the shelf kept full (topped up every second), 5 s to settle, then 60 s counted. `clerk`: the chief
    //      parked away, the clerk serves (trade.buyInterval × register.clerkTradeSlow); `chief`: the clerk stood aside
    //      for the minute and the chief on the register pad (trade.buyInterval) — the clerk comes back after it
    for (const who of ['clerk', 'chief']) {
      const c = await ev(async (w) => {
        const gs = window.__FV.scene, T = gs.trade, M = window.__M, F = window.__FV, reg = T.register;
        const { BALANCE } = await import(new URL('src/data/balance.js', location.href).href);
        window.__bot = null;
        M.on = false;
        Object.assign(M, { traded: 0, coins: 0, n: 0, staffed: 0, clerk: 0, chief: 0, empty: 0, stockSum: 0, selling: 0, waiting: 0, mk: {}, mkEmpty: {} });
        const stash = w === 'chief' ? reg.clerk : null;
        if (stash) { reg.clerk = null; stash.sprite.setVisible(false); stash.shadow.setVisible(false); }
        const rp = { x: reg.x, y: reg.y };
        const place = () => { if (w === 'chief') F.teleport(rp.x, rp.y); else F.teleport(T.x - 900, T.y + 500); F.setInput(0, 0); };
        const top = () => { for (const ty of ['item_plank', 'item_ingot']) { let k = 0; while (T.stock.countWithIncoming(ty) < T.maxPerType && k++ < 60) T.stock.push(ty, null, gs.effects); } };
        place(); top();
        let acc = 0;
        window.__sim.run(5, null, (dt) => { acc += dt; if (acc >= 1) { acc -= 1; top(); place(); } });
        M.on = true; acc = 0;
        window.__sim.run(60, null, (dt) => { acc += dt; if (acc >= 1) { acc -= 1; top(); place(); M.sample(); } });
        M.on = false;
        const out = Object.assign(M.read(), { who: w, clerkServing: !!reg.clerk, interval: BALANCE.trade.buyInterval, slow: BALANCE.register.clerkTradeSlow, keep: T.kept ? T.kept() : 0 });
        if (stash) { reg.clerk = stash; stash.sprite.setVisible(true); stash.shadow.setVisible(true); }
        return out;
      }, who);
      // (the period is whole frames: buyT counts down by 1/60 s until ≤ 0 — 0.35 s takes 22 frames in floating point)
      const sec = c.interval * (who === 'clerk' ? c.slow : 1);
      let frames = 0; for (let b = sec; b > 0; frames++) b -= 1 / 60;        // (the game's own count-down, float for float)
      mrows.push(Object.assign({ case: 'ceiling_' + who, save: fx, minutes: 1, items_per_min: c.traded, coins_per_min: c.coins, theoretical_per_min: +(60 / sec).toFixed(1), frame_period_per_min: +(3600 / frames).toFixed(1) }, flat(c)));
      console.log(`  merchant ceiling (${who}) ${fx}: ${c.traded} items/min (trade.buyInterval ${c.interval}${who === 'clerk' ? ' × ' + c.slow : ''} = ${sec.toFixed(3)} s -> ${(60 / sec).toFixed(1)} a min; ${frames} whole frames -> ${(3600 / frames).toFixed(1)}) (${wall()})`);
    }
  }
  writeCsv('merchant.csv', mrows);
  ALL.merchant = mrows;
  // ---- fresh: a new game, seed 1, smart bot, sampled every second
  if (FRESH_MIN > 0) {
    await boot({ init: seedJs(1), stepper: false, viewport: { width: 360, height: 720 } });
    await ev(simInstall);
    await addBot();
    await ev(MERCH_INSTALL);
    await ev(() => { window.__M.on = true; const gs = window.__FV.scene; window.__ev = []; gs.events.once('sold', () => window.__ev.push(['first_sale', window.__sim.simT])); });
    const minutes = [];
    for (let m = 1; m <= FRESH_MIN; m++) {
      await ev(() => { window.__M.mk0 = Object.assign({}, window.__M.mk); window.__M.mkE0 = Object.assign({}, window.__M.mkEmpty); window.__M.n0 = window.__M.n; });
      for (let s = 0; s < 60; s += 10) await runSampled(10);
      const r = await ev((mm) => {
        const M = window.__M, gs = window.__FV.scene, dn = M.n - M.n0 || 1;
        const FOOD = ['item_fish_cooked', 'item_bread', 'item_meat_cooked'];
        const fill = Object.fromEntries(FOOD.map((f) => [f, +(((M.mk[f] || 0) - (M.mk0[f] || 0)) / dn).toFixed(1)]));
        const emp = Object.fromEntries(FOOD.map((f) => [f, Math.round((100 * ((M.mkEmpty[f] || 0) - (M.mkE0[f] || 0))) / dn)]));
        M.minute(mm * 60);
        const row = M.perMin[M.perMin.length - 1];
        return Object.assign({}, row, { minute: mm, tradeOn: !!gs.trade.enabled, clerk: !!gs.trade.register.clerk, fishFill: fill.item_fish_cooked, breadFill: fill.item_bread, meatFill: fill.item_meat_cooked, fishEmptyPct: emp.item_fish_cooked, breadEmptyPct: emp.item_bread, meatEmptyPct: emp.item_meat_cooked, complete: !!gs.progress.done.hire_hunter, done: Object.keys(gs.progress.done).length, wallet: gs.economy.coins });
      }, m);
      minutes.push(r);
      if (m % 5 === 0) console.log(`  merchant fresh minute ${m}: ${r.items} items, earned ${r.earned} (${wall()})`);
    }
    writeCsv('merchant_fresh.csv', minutes, ['minute', 'items', 'tradeCoins', 'staffed', 'tradeOn', 'clerk', 'earned', 'wallet', 'fishFill', 'breadFill', 'meatFill', 'fishEmptyPct', 'breadEmptyPct', 'meatEmptyPct', 'complete', 'done']);
    const win = (a, b) => { const r = minutes.filter((q) => q.minute > a && q.minute <= b); return r.length ? +(r.reduce((s, q) => s + q.items, 0) / r.length).toFixed(1) : null; };
    summary.merchantFresh = { '20-30': win(20, 30), '40-50': win(40, Math.min(50, FRESH_MIN)), at25: (minutes.find((q) => q.minute === 25) || {}).items, at45: (minutes.find((q) => q.minute === 45) || {}).items, earned20: (minutes.find((q) => q.minute === 20) || {}).earned };
    ALL.merchantFresh = { minutes, events: await ev(() => window.__ev) };
  }
  summary.merchant = mrows.map((r) => `${r.case} ${r.save}: ${r.items_per_min}/min`);
}
function flat(o) { const out = {}; for (const k in o) { if (o[k] && typeof o[k] === 'object') for (const j in o[k]) out[k + '.' + j.replace('item_', '')] = o[k][j]; else out[k] = o[k]; } return out; }

// ------------------------------------------------------------------------------------------------ end
if (ctx) errors.push(...log.errors);
ALL.summary = summary; ALL.errors = errors.slice(0, 20); ALL.wall = wall();
fs.writeFileSync(path.join(OUT, 'v43_layout.json'), JSON.stringify(ALL, null, 1));
console.log('SUMMARY ' + JSON.stringify(summary));
console.log(`page errors ${errors.length}${errors.length ? ': ' + errors.slice(0, 3).join(' | ').slice(0, 400) : ''}  (wall ${wall()})`);
if (browser) await browser.close();
if (srv) await srv.close();
console.log(`step B plot table v2: ${summary.stepB ? summary.stepB.checks - summary.stepB.failed.length + '/' + summary.stepB.checks + ' passed' : 'not run'}`);
process.exit(errors.length || stepBFail ? 1 : 0);
