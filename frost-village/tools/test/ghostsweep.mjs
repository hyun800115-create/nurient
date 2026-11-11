// (v4.2.0.1) ghost sweep: "a picture of goods or coins exists exactly while the goods exist — when they are consumed, sold
// or moved the picture goes (and appears where they moved to)". The designer's reports on Play 4.2.0:
//   "물고기와 고기가 있는것으로 보이는데 다 소비했어 ... 동전도 먹었는데 안사라져" (ghosts that stay) and
//   "물고기를 구우면 고기가 쌓이지 않고 사라져 그러다가 마지막고기 구울때 보여" (real items that are not drawn),
//   "모든 이동하고 사냥하고 수집하고 만든 물건들도 오류가 없는지 봐" (every item, on every path).
//   node tools/test/ghostsweep.mjs [--canvas] [--dpr 1] [--only art,fresh,v35,late,office,ctx,replay,inv] [--quick]
//        [--root <frost-village dir>] [--out <dir>] [--full-replay]
// Sections (each on its own page; real rendering through the fixed-step clock — the bake only runs on drawn frames):
//   art     the goods painted into building art are gone (grill grate, smokehouse rack, sawmill bench, stall counter
//           (and the v4.2.0.2 stage-1 stall: its back shelf holds folded cloths, an empty basket, paper bags and a spoon
//           crock, its counter an empty tray; (v4.3) the stage-2 / stage-3 shop rows and the old merchant sled: cloths,
//           baskets, bags, crocks, a rope coil, a ledger, a scale — no fish, bread, meat, planks or ingots),
//           fish net, cannery, store counter, fishing boat hatch / net, rowboat fish box): luma signatures of their
//           frames == the goods-free renders (ghostsweep_art.json)
//   fresh   (fresh game) the chief's empty carry stays on him (first items fly to him); a stack changed while the
//           camera was far is right in the very first frame after a camera cut; an idle station stops a work loop a
//           page's return replayed
//   v35     (v35_save_38min) the miners' food box: laid out, drawn, label = count, deliveries land on it, its towers
//           stay inside its slot; the 창고 pile rebuilt by a porter's take in a frame whose bake runs keeps its places;
//           the boathouse stops a replayed work loop; the hunters' meat rack draws no meat (or log) of its own (RACK-1)
//   late    (v42_village_late) the tax box earns off screen -> coins on its pile; empty carry stacks of workers and
//           porters stay on them; a walker removed with goods releases them; a dock crate the train took while it
//           flew does not land; the box car's doors stay shut while it carries nothing; the chief's take run off a full
//           station output never shows the taken item twice (FLICK-1); the checker's owner-model alarm needs a
//           mismatch over continuous samples (INV-1)
//   office  (v42_save_office_ttal) the 물류 금고 earns off screen -> coins on its pile; a town shop's item sold while
//           its picture flew does not land as an extra picture; depot rack pictures are re-skinned when lgx_items
//           comes back; a pooled item picture parked while lgx_items was out and handed to another item keeps that
//           item's picture when the page returns (LAZY-1)
//   ctx     (WebGL only, v35_save_0_5min) baked piles are drawn again after a lost + restored GL context
//   replay  the designer's screenshot replay (ghostsweep_replay.mjs: fresh game, the first loop, the grill output
//           growing fish by fish, sell-out, coins taken, a camera trip) — every stack's baked slot == its items
//   inv     two generic invariants (ghostsweep_inv.js, checked on drawn frames) after long play on a fresh game AND on
//           the late fixture, driving every chain — gather (net, tree, rock, wheat), hunt (animal), make (every station,
//           workshop), move (chief, workers, porters, customers, boats, train, sleigh), sell (every shelf / till):
//           (i) every baked stack's slot == a fresh drawing of its items (empty iff the stack is empty; the right
//           number of items at the right places while it grows, shrinks and stands still), (ii) no visible item / coin
//           picture that no stack, flight or holder owns (and none hidden / released while its item is held).
//           Coverage (place x item x path) is written to <out>/inv_*.json for the coverage matrix.
// Exit code 1 when any check fails. --quick: shorter invariant runs (fresh only) and the replay without its long
// cooking rounds. On Play 4.2.0 / the 4.2.0.1 base (--root) the regression checks fail. --inv <file>: another copy of the
// checker (the review round's INV-1 check against the checker it replaced).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor, loadPlaywright } from './pw.mjs';
import { installStepper } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const CANVAS = argv.includes('--canvas');
const DPR = +arg('dpr', 1) || 1;
const QUICK = argv.includes('--quick');
const ROOT = path.resolve(arg('root', path.join(HERE, '..', '..')));
const TAG = (CANVAS ? 'canvas' : 'webgl') + '_dpr' + DPR;
const OUT = path.resolve(arg('out', path.join(os.tmpdir(), 'fv_ghostsweep_' + TAG)));
const ALL = ['art', 'fresh', 'v35', 'late', 'office', 'ctx', 'replay', 'inv'];
const ONLY = new Set((arg('only', '') || ALL.join(',')).split(',').filter(Boolean));
const INV_JS = path.resolve(arg('inv', path.join(HERE, 'ghostsweep_inv.js')));
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const fails = [];
const ok = (c, msg, extra) => {
  if (c) { pass++; console.log('  ok   ' + msg); }
  else { fail++; fails.push(msg); console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 700) : '')); }
};
const t0 = Date.now();
const lap = () => Math.round((Date.now() - t0) / 1000) + ' s';

const srv = await start(0, { prefix: '/fv/', root: ROOT });
const newBrowser = () => (CANVAS
  ? loadPlaywright().chromium.launch({ headless: true, args: ['--disable-webgl', '--disable-3d-apis', '--no-sandbox'] })
  : launch());
let browser = null;

/** a page with the game running: a fresh game or a fixture save; the fixed-step clock and the checker installed */
async function boot(fixture) {
  if (!browser) browser = await newBrowser();
  const { page, ctx, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 412, height: 915 }, dpr: DPR });
  let keys = null;
  if (fixture) {
    const raw = fs.readFileSync(path.join(HERE, 'fixtures', fixture), 'utf8');
    const j = JSON.parse(raw);
    keys = j.keys ? j.keys : { 'frostVillage.save.v1': raw };
  }
  await page.evaluate((ks) => { try { localStorage.clear(); if (ks) for (const k in ks) localStorage.setItem(k, ks[k]); } catch (e) { /* */ } }, keys);
  await page.reload({ waitUntil: 'load' });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 120000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 120000);
  await sleep(1500);
  await installStepper(page);
  await page.evaluate(() => { try { const gs = window.__FV.scene; if (gs.v42 && gs.v42.whatsNewSeen) gs.v42.whatsNewSeen(); const ui = gs.scene.get('UI'); if (ui && ui.hud42 && ui.hud42.closeCard) ui.hud42.closeCard(true); } catch (e) { /* */ } });
  await page.addScriptTag({ path: INV_JS });
  await page.evaluate(() => window.__inv.install({}));
  // helpers: play `sec` of game time drawing every `draw`-th step (the bake runs on drawn frames only)
  await page.evaluate(() => {
    const S = window.__step;
    window.__gs = {
      play(sec, draw = 3, until) { const n = Math.max(1, Math.round(sec * 60)); for (let i = 0; i < n; i++) { if (i % draw === draw - 1) S.frame(); else S.run(1 / 60); if (until && until()) return i + 1; } return n; },
      frames(n) { for (let i = 0; i < n; i++) S.frame(); },
      dist(a, b) { return Math.round(Math.hypot(a.x - b.x, a.y - b.y)); },
    };
  });
  const renderer = await page.evaluate(() => (window.__FV.game.renderer.type === 2 ? 'WebGL' : 'Canvas'));
  return { page, ctx, log, renderer };
}

async function section(name, fixture, fn) {
  if (!ONLY.has(name)) return;
  console.log(`\n== ${name}${fixture ? ' (' + fixture + ')' : ' (fresh game)'}  [${lap()}]`);
  let s = null;
  try {
    s = await boot(fixture);
    console.log('  renderer ' + s.renderer + ', dpr ' + DPR);
    await fn(s.page, s);
    const errs = s.log.errors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND/.test(e));
    ok(errs.length === 0, name + ': no page errors', errs.slice(0, 3));
  } catch (e) {
    ok(false, name + ': ran to the end', String(e && e.stack || e).slice(0, 600));
  } finally {
    if (s) { try { await s.ctx.close(); } catch (e) { /* */ } }
  }
}
const E = (page, fn, a) => page.evaluate(fn, a);

// =====================================================================================================================
// art — goods painted into building art (CONFIRM-1 / GOODS-1 grill, GOODS-2 counter, GOODS-3 net, GOODS-6 smokehouse
// and cannery, GOODS-7 boats, GOODS-8 sawmill / store cans). The frames were re-rendered without the goods
// (tools/blender/prop_assets.py, bld_assets.py, bld_boats.py); a 16 x 16 grid of alpha-weighted luma of each frame (at
// its source size) must match those renders (boats: a 4 x 4 grid over the box where the fish lay). The Play 4.2.0
// frames differ by 14-95 in the cells where the fish / steaks / hams / log / bread / cans were painted.
await section('art', null, async (page) => {
  const want = JSON.parse(fs.readFileSync(path.join(HERE, 'ghostsweep_art.json'), 'utf8'));
  // the cannery, the store and the boats are on the lazy buildings pages (bld_buildings, boat_*), which a fresh game
  // fetches only from the farmer on: open that gate and fetch them through the game's own lazy loader
  await E(page, () => { const A = window.__FV.assets(), g = window.__FV.scene; A.gate = () => true; g.checkLazyGates(99); });
  for (let k = 0; k < 180; k++) {
    const ready = await E(page, () => { window.__step.frame(); const A = window.__FV.assets(), T = window.__FV.scene.textures; return !A.pending('station_cannery') && !A.pending('shop_general') && T.exists('boat_fishing') && T.exists('boat_rowboat') && !A.pending('market_s2_back') && !A.pending('market_s3_back'); });
    if (ready) break;
    await sleep(500);
  }
  // an entry is either a whole-frame 16 x 16 grid (props / buildings by frame name) or { tex | sprite, frame, box, g,
  // sig }: a g x g grid over a box of the frame (the boats / the store: the box around the goods that were painted)
  const got = await E(page, (want) => {
    const g = window.__FV.scene, A = window.__FV.assets(), out = {};
    for (const n of Object.keys(want)) {
      const wv = want[n], reg = !Array.isArray(wv), fn = reg ? wv.frame : n;
      const r = reg ? (wv.sprite ? A.sprite(wv.sprite) : null) : A.sprite(n.replace(/_work_\d+$/, ''));
      const T = reg && !wv.sprite ? (g.textures.exists(wv.tex) && g.textures.get(wv.tex)) : (r && !r.pending && g.textures.get(r.tex));
      const f = T && T.get(fn);
      if (!f || f.name !== fn) { out[n] = null; continue; }
      const W = f.realWidth, H = f.realHeight, c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d');
      x.drawImage(f.source.image, f.cutX, f.cutY, f.cutWidth, f.cutHeight, f.x, f.y, f.cutWidth, f.cutHeight);
      const d = x.getImageData(0, 0, W, H).data, G = reg ? wv.g : 16, s = [];
      const [bx0, by0, bx1, by1] = reg ? wv.box : [0, 0, W, H], BW = bx1 - bx0, BH = by1 - by0;
      for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) {
        const y0 = by0 + Math.floor(gy * BH / G), y1 = by0 + Math.floor((gy + 1) * BH / G), x0 = bx0 + Math.floor(gx * BW / G), x1 = bx0 + Math.floor((gx + 1) * BW / G);
        let sum = 0, n2 = 0;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * W + xx) * 4; sum += (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) * d[i + 3] / 255; n2++; }
        s.push(n2 ? sum / n2 : 0);
      }
      out[n] = s;
    }
    const S = g.stations.grill;
    out.__grill = { frame: String(S.img.frame.name), tex: S.img.texture.key, working: S.working, inN: S.inStack.count, outN: S.outStack.count };
    return out;
  }, want);
  const label = { station_grill: 'grill (서서 굽기), idle', station_grill_work_0: 'grill, cooking 0', station_grill_work_2: 'grill, cooking 2', station_smokehouse: 'smokehouse rack, idle', station_smokehouse_work_1: 'smokehouse rack, working', station_sawmill: 'sawmill bench, idle', station_sawmill_work_1: 'sawmill bench, working', market_s1_back: '눈꽃 노점 stall (v4.2.0.2), back layer', market_s1_front: '눈꽃 노점 stall, counter (front layer)', bakery43_back: '눈꽃 빵집 cottage, back layer (v4.3)', bakery43_front: '눈꽃 빵집 cottage, front sill', bakery43_stall_back: '빵집 가판대, back layer', bakery43_stall_front: '빵집 가판대, counter + empty bread case', station_cannery: 'cannery crate / belt / tray, idle', station_cannery_work_1: 'cannery crate / tray, working', 'boat_fishing:idle_SE_0': 'fishing boat hatch, moored', 'boat_fishing:sail_E_1': 'fishing boat hatch, sailing', 'boat_rowboat:idle_SE_0': 'rowboat fish box, moored', 'boat_rowboat:row_E_3': 'rowboat fish box, rowing', 'shop_general:cans': 'general store counter + crate (cans)' };
  for (const n of Object.keys(want)) {
    const a = got[n], b = Array.isArray(want[n]) ? want[n] : want[n].sig;
    if (!a) { ok(false, `art: frame ${n} exists`); continue; }
    let worst = 0, bad = 0;
    for (let i = 0; i < b.length; i++) { const d = Math.abs(a[i] - b[i]); worst = Math.max(worst, d); if (d > 6) bad++; }
    ok(bad === 0, `art: ${label[n] || n} shows no painted goods (frame == the goods-free render: worst cell ${worst.toFixed(1)}, ${bad} cells off)`);
  }
  ok(got.__grill.frame === 'station_grill' && !got.__grill.working && got.__grill.inN === 0 && got.__grill.outN === 0, 'art: a fresh game\'s idle, empty grill shows that frame', got.__grill);
});

// =====================================================================================================================
// fresh game
await section('fresh', null, async (page) => {
  // ---- FLIGHT-5: the chief's empty carry stays on him (the first item picked up flies to him, not to where he last
  //      carried something)
  const f5 = await E(page, () => {
    const g = window.__FV.scene, p = g.player, S = g.stations.grill, H = window.__gs;
    window.__FV.clearStack(); window.__FV.carry('item_fish_raw', 2);
    window.__FV.teleport(S.inPad.x, S.inPad.y);
    H.play(4, 3, () => p.stack.count === 0 && S.inStack.incoming === 0);
    const dropped = p.stack.count;
    window.__FV.teleport(S.x + 520, S.y + 360);
    H.play(0.3, 3);
    const np = p.stack.nextPos('item_fish_raw'), head = { x: p.x, y: p.y + p.headTop };
    return { dropped, base: [Math.round(p.stack.bx), Math.round(p.stack.by)], chief: [Math.round(p.x), Math.round(p.y)], d: H.dist(np, head) };
  });
  ok(f5.dropped === 0 && f5.d < 80, `FLIGHT-5 the chief's empty carry stack stays on him: the next item flies to him (${f5.d} px from his head; base ${f5.base}, chief ${f5.chief})`, f5);

  // ---- CONFIRM-3: a stack that changed while the camera was far is right in the first frame after a camera cut
  const c3 = await E(page, () => {
    const g = window.__FV.scene, S = g.stations.grill, st = S.outStack, H = window.__gs, I = window.__inv, cam = g.cameras.main;
    window.__FV.teleport(S.outPad.x + 120, S.outPad.y + 160);
    for (let i = 0; i < 6; i++) st.push('item_fish_cooked', null, g.effects);
    window.__FV.camera(S.outPad.x, S.outPad.y - 40);
    H.play(1, 2);
    const home = { x: cam.midPoint.x, y: cam.midPoint.y }, z0 = g.zoomCur;
    const p0 = I.picture(st);
    // far: 2600 px away (the camera box lifted, as a bigger village allows)
    window.__FV.camera(home.x + 2600, home.y, 0.69); window.__FV.camera(home.x + 2600, home.y, z0);
    H.frames(3);
    const far = !g.isOnScreen(st.bx, st.by, 720);
    // two fish taken while far (the picture waits: a stack far away is re-baked when it comes near)
    for (let i = 0; i < 2; i++) { const it = st.pop(); if (it && it.spr) g.effects.releaseItem(it.spr); }
    H.frames(4);
    const waiting = st.bakeDirty;
    // the cut back (as the rank ceremony's cut from the hall): ONE drawn frame
    window.__FV.camera(home.x, home.y);
    H.frames(1);
    const p1 = I.picture(st), n1 = st.count;
    H.frames(4);
    const p2 = I.picture(st);
    g._freeCam = false; g.resetBounds(); window.__FV.camera();
    H.play(0.3, 2);
    return { far, waiting, before: p0, first: p1, n1, settled: p2 };
  });
  ok(c3.far && c3.waiting, 'CONFIRM-3 set-up: the grill output is > 700 px off screen and waits to be re-baked', c3);
  ok(c3.first && c3.first.diff <= Math.max(12, c3.first.truth * 0.01), `CONFIRM-3 camera cut back: grill.out (${c3.n1} held) shows exactly its items in the FIRST drawn frame (${c3.first && c3.first.real} px drawn / ${c3.first && c3.first.truth} px held, ${c3.first && c3.first.diff} px differ)`, c3);
  ok(c3.settled && c3.settled.diff <= Math.max(12, c3.settled.truth * 0.01), 'CONFIRM-3 ...and after it settles', c3.settled);

  // ---- LIFE-3 (station): an idle station whose work loop was replayed (a page's return) stops it
  const l3 = await E(page, () => {
    const g = window.__FV.scene, S = g.stations.grill, H = window.__gs;
    window.__FV.teleport(S.x + 300, S.y + 300);
    H.play(0.6, 3);
    const idle0 = !S.working;
    if (S.workAnim) S.img.play(S.workAnim);          // what Residency's re-skin does when the page comes back
    H.play(0.8, 3);
    return { idle0, playing: !!(S.img.anims && S.img.anims.isPlaying), frame: String(S.img.frame.name), anim: !!S.workAnim };
  });
  ok(l3.anim && l3.idle0 && !l3.playing && l3.frame === 'station_grill', `LIFE-3 an idle grill whose work loop was replayed stops it (playing ${l3.playing}, frame ${l3.frame})`, l3);
});

// =====================================================================================================================
// v35_save_38min: the food box, the 창고, the boathouse
await section('v35', 'v35_save_38min.json', async (page) => {
  // ---- BAKE-1 / FLIGHT-3 / CHAIN-1: the miners' food box
  const fb0 = await E(page, () => {
    const g = window.__FV.scene, fb = g.foodBox, H = window.__gs, I = window.__inv;
    if (!fb || !fb.active) return { none: true };
    window.__FV.teleport(fb.x + 260, fb.y + 220); window.__FV.camera(fb.x, fb.y - 40, 1);
    H.play(1.5, 2);
    const st = fb.stock, pic = I.picture(st);
    return { count: st.count, base: [Math.round(st.bx), Math.round(st.by)], box: [fb.x, fb.y], label: fb.labelText.text, img: !!st.bakeImg, sprites: st.items.filter((i) => i.spr).length, pic };
  });
  if (fb0.none) ok(false, 'BAKE-1 the fixture has an active food box');
  else {
    ok(Math.abs(fb0.base[0] - fb0.box[0]) < 3 && Math.abs(fb0.base[1] - (fb0.box[1] + 6)) < 3, `BAKE-1 the food box's stock is laid out at the box (base ${fb0.base}, box ${fb0.box})`, fb0);
    ok(fb0.label.endsWith(fb0.count + '/20') || fb0.label.endsWith(fb0.count + '/' + fb0.label.split('/')[1]), `BAKE-1 its label tells the count (${fb0.label}, holds ${fb0.count})`);
    ok((fb0.img && fb0.pic && fb0.pic.diff <= Math.max(12, fb0.pic.truth * 0.01) && fb0.pic.real > 0) || (!fb0.img && fb0.sprites === fb0.count && fb0.count > 0), `BAKE-1 its food is drawn: ${fb0.count} portions (${fb0.img ? 'baked ' + (fb0.pic && fb0.pic.real) + ' px / ' + (fb0.pic && fb0.pic.truth) + ' px, ' + (fb0.pic && fb0.pic.diff) + ' differ' : fb0.sprites + ' sprites'})`, fb0.pic);
    const fb1 = await E(page, () => {
      const g = window.__FV.scene, fb = g.foodBox, H = window.__gs, I = window.__inv, p = g.player, st = fb.stock;
      // two miners eat (portions fly from the box), the label follows
      const from = [];
      for (let i = 0; i < 2; i++) { const n0 = st.count; fb.eat({ x: fb.x + 120, y: fb.y + 60 }); if (st.count < n0) from.push(1); }
      H.play(1, 2);
      const afterEat = { count: st.count, label: fb.labelText.text };
      // the chief brings bread: it must fly to the box (base at the box), land there and be drawn
      const np = st.nextPos('item_bread');
      window.__FV.clearStack(); window.__FV.carry('item_bread', 2);
      // (the miners keep eating meanwhile: the bread that LANDS is counted)
      let landed = 0;
      st.push = function (ty, spr, fx) { if (spr) landed++; return Object.getPrototypeOf(st).push.call(this, ty, spr, fx); };
      window.__FV.teleport(fb.pad.x, fb.pad.y);
      H.play(3, 2, () => landed >= 2 && st.incoming === 0);
      delete st.push;
      const landedLabel = fb.labelText.text;
      window.__FV.teleport(fb.x + 260, fb.y + 220);
      H.play(1, 2);
      const afterFeed = { landed, landedLabel, count: st.count, label: fb.labelText.text, pic: I.picture(st) };
      // filled with one food (one type may fill the box): the towers stay inside the box's slot
      while (st.count < fb.max) st.push('item_bread', null, g.effects);
      H.play(1, 2);
      const full = { count: st.count, pic: I.picture(st), types: st.items.filter((i) => i.type === 'item_bread').length };
      return { ate: from.length, afterEat, target: [Math.round(np.x), Math.round(np.y)], box: [fb.x, fb.y], afterFeed, full };
    });
    ok(fb1.ate === 2 && fb1.afterEat.label.indexOf(fb1.afterEat.count + '/') >= 0, `BAKE-1 miners ate 2: the label follows (${fb1.afterEat.label}, holds ${fb1.afterEat.count})`, fb1.afterEat);
    ok(Math.hypot(fb1.target[0] - fb1.box[0], fb1.target[1] - fb1.box[1]) < 160, `FLIGHT-3 a delivery flies to the box (target ${fb1.target}, box ${fb1.box})`, fb1);
    const af = fb1.afterFeed;
    ok(af.landed === 2 && af.label.indexOf(af.count + '/') >= 0 && (!af.pic || af.pic.diff <= Math.max(12, af.pic.truth * 0.01)), `FLIGHT-3 2 delivered bread land on the box (${af.landedLabel}) and are drawn (now ${af.label}, ${af.pic ? af.pic.real + '/' + af.pic.truth + ' px' : 'sprites'})`, af);
    ok(fb1.full.count === 20 && (!fb1.full.pic || (fb1.full.pic.clip === 0 && fb1.full.pic.diff <= Math.max(12, fb1.full.pic.truth * 0.01))), `BAKE-1 a box full of one food (${fb1.full.types} bread) stays inside its slot (${fb1.full.pic ? fb1.full.pic.clip + ' items outside' : 'unbaked'})`, fb1.full);
  }

  // ---- BAKE-3 / CHAIN-2: the 창고 pile rebuilt by a porter's take in a frame whose bake runs
  const wh = await E(page, () => {
    const g = window.__FV.scene, W = g.warehouse, H = window.__gs, I = window.__inv, p = g.player, B = g.__stackBaker;
    if (!W || !W.enabled || W.total < 30) return { none: true, total: W && W.total };
    window.__FV.teleport(W.outPad.x + 220, W.outPad.y + 200); window.__FV.camera(W.outPad.x, W.outPad.y - 40, 1);
    window.__FV.clearStack();
    H.play(1, 2);
    const st = W.pile;
    // the take comes from a porter's update, which runs AFTER the 창고 laid its pile out in the same frame: the take
    // that changes the pile's make-up rebuilds it (clear + push: every item on the base point) and this frame's flush
    // draws it (the 15 Hz cap is lifted here so the flush surely falls in that frame — in play it almost always does)
    let rebuilt = false, took = 0;
    const upd = W.update;
    W.update = function (dt) {
      upd.call(this, dt); delete W.update;
      const k0 = W.pileKey;
      for (let i = 0; i < 12 && W.pileKey === k0; i++) { const ty = W.types().sort((a, b) => W.counts[a] - W.counts[b])[0]; if (ty && W.giveTo(p, ty)) took++; }
      rebuilt = W.pileKey !== k0;
      B.lastFlush = -1e9;
    };
    H.frames(1);
    const tp = I.truthPos(st);
    let misplaced = 0;
    const pos = new Set();
    for (let i = 0; i < st.items.length; i++) { const it = st.items[i]; pos.add(Math.round(it.x) + ',' + Math.round(it.y)); if (Math.abs(it.x - tp.xs[i]) > 1 || Math.abs(it.y - tp.ys[i]) > 1) misplaced++; }
    const flushed = !st.bakeDirty;
    const pic1 = I.picture(st);
    H.frames(20);
    const pic2 = st.bakeDirty ? null : I.picture(st);
    return { rebuilt, took, n: st.items.length, distinct: pos.size, misplaced, flushed, pic1, pic2, label: W.labelText && W.labelText.text };
  });
  if (wh.none) ok(false, 'BAKE-3 the fixture has a stocked 창고', wh);
  else {
    ok(wh.rebuilt && wh.flushed, `BAKE-3 set-up: a take rebuilt the 창고 pile in a frame whose bake ran (${wh.took} taken, ${wh.n} pictured)`, wh);
    ok(wh.misplaced === 0 && wh.distinct > 1, `BAKE-3 the rebuilt pile keeps its places (${wh.distinct} places, ${wh.misplaced} items off their place)`, wh);
    ok(wh.pic1 && wh.pic1.diff <= Math.max(12, wh.pic1.truth * 0.01), `BAKE-3 its picture is the whole pile in that frame (${wh.pic1 && wh.pic1.real} px drawn / ${wh.pic1 && wh.pic1.truth} px held)`, wh.pic1);
    ok(!wh.pic2 || wh.pic2.diff <= Math.max(12, wh.pic2.truth * 0.01), `BAKE-3 ...and 20 frames later (${wh.label})`, wh.pic2);
  }

  // ---- LIFE-3 (boathouse): idle, a replayed work loop stops
  const bh = await E(page, () => {
    const g = window.__FV.scene, b = g.boathouse, H = window.__gs, A = window.__FV.assets();
    if (!b || !b.enabled) return { none: true };
    window.__FV.camera(b.x, b.y - 60, 1);
    b.busyT = 0; H.play(0.5, 3);
    const a = A.spriteAnim('boathouse', 'work');
    if (!a) return { noAnim: true };
    const idle0 = !b.working;
    b.img.play(a);                                    // what Residency's re-skin does when the page comes back
    H.play(1, 3);
    return { idle0, playing: !!b.img.anims.isPlaying, frame: String(b.img.frame.name) };
  });
  if (bh.none || bh.noAnim) console.log('  (no boathouse / work anim in this village: LIFE-3 boathouse not checked here)', JSON.stringify(bh));
  else ok(bh.idle0 && !bh.playing, `LIFE-3 an idle boathouse whose unloading loop was replayed stops it (playing ${bh.playing}, frame ${bh.frame})`, bh);

  // ---- RACK-1 (review): the hunters' meat rack hung 3 item_meat_raw pictures on an item_log beam ON TOP of the pile's
  //      own picture (1 meat held -> 2 drawn, 7 -> 10). Held at 0 / 1 / 4 / 7 meat: no item picture among the rack's
  //      props, and the pile's picture is exactly what it holds
  const rk = await E(page, () => {
    const g = window.__FV.scene, P = g.piles && g.piles.meat, I = window.__inv, H = window.__gs;
    if (!P || !P.shown || !P.enabled) return { none: true };
    window.__FV.teleport(P.x + 260, P.y + 220); window.__FV.camera(P.x - 40, P.y - 60, 1.4);
    H.play(0.5, 2);
    const rows = [];
    for (const n of [0, 1, 4, 7]) {
      P.stack.clear(g.effects);
      for (let i = 0; i < n; i++) P.stack.push('item_meat_raw', null, g.effects);
      H.frames(3);
      const items = P.props.filter((o) => o.visible && o.frame && /^item_/.test(String(o.frame.name)));
      const pic = I.picture(P.stack);
      rows.push({ n, held: P.stack.count, itemProps: items.length, props: items.map((o) => String(o.frame.name)), real: pic ? pic.real : null, truth: pic ? pic.truth : null, diff: pic ? pic.diff : null });
    }
    P.stack.clear(g.effects); for (let i = 0; i < 4; i++) P.stack.push('item_meat_raw', null, g.effects);
    H.frames(3);
    return { rows };
  });
  if (rk.none) ok(false, 'RACK-1 the fixture has the hunters\' meat pile');
  else {
    await page.screenshot({ path: path.join(OUT, 'rack1_' + TAG + '.png') });
    for (const r of rk.rows) ok(r.itemProps === 0 && (r.held === 0 ? !r.real : r.real > 0 && r.diff <= Math.max(12, r.truth * 0.01)), `RACK-1 meat rack with ${r.held} meat held: ${r.itemProps} item pictures of its own (${r.props.join(', ') || 'none'}), the pile draws ${r.real} px / ${r.truth} px held`, r);
  }
});

// =====================================================================================================================
// v42_village_late
await section('late', 'v42_village_late.json', async (page) => {
  // ---- GOODS-4 / CHAIN-4: the tax box earns while the camera is away
  const tx = await E(page, () => {
    const g = window.__FV.scene, H = window.__gs, I = window.__inv, hall = g.civic && g.civic.hall;
    if (!hall) return { none: true };
    const t = hall.tax, m = g.market;
    t.takeAll(null); H.play(0.5, 3);
    window.__FV.teleport(m.x + 200, m.y + 200); window.__FV.camera(m.x, m.y, 1); H.frames(2);
    const away = !g.isOnScreen(t.x, t.y, 200);
    hall.taxAcc = 24; hall.taxT = 0;                 // the next tax tick pays 24 coins
    H.play(0.3, 3);
    const v = t.value, n = t.pile.count;
    window.__FV.camera(t.x, t.y - 40, 1); H.play(1, 2);
    const pic = I.picture(t.pile);
    return { away, value: v, pile: n, pic, restore: Math.ceil(v / 3) };
  });
  if (tx.none) ok(false, 'GOODS-4 the fixture has a town hall');
  else {
    ok(tx.away && tx.value >= 24 && tx.pile > 0, `GOODS-4 tax paid while the camera is away: value ${tx.value}, coins on the pile ${tx.pile} (before: value only)`, tx);
    ok(tx.pic && tx.pic.real > 0 && tx.pic.diff <= Math.max(12, tx.pic.truth * 0.01), `GOODS-4 ...and drawn when the camera comes (${tx.pic && tx.pic.real} px)`, tx.pic);
  }

  // ---- FLIGHT-5: workers and porters with empty hands carry their (empty) stack on them
  const f5 = await E(page, () => {
    const g = window.__FV.scene, H = window.__gs;
    H.play(1, 4);
    const chars = [].concat(g.workers || [], g.porters || [], g.rawPorters || []).filter((c) => c && c.alive !== false && c.stack && c.stack.count === 0 && c.stack.incoming === 0);
    const far = chars.filter((c) => Math.hypot(c.stack.bx - c.x, c.stack.by - c.y) > 160).map((c) => ({ who: c.constructor.name + ':' + (c.type || c.key || ''), at: [Math.round(c.x), Math.round(c.y)], base: [Math.round(c.stack.bx), Math.round(c.stack.by)] }));
    return { n: chars.length, far };
  });
  ok(f5.n > 0 && f5.far.length === 0, `FLIGHT-5 ${f5.n} empty-handed workers / porters: the first item they pick up flies to them (${f5.far.length} with their stack elsewhere)`, f5.far.slice(0, 4));

  // ---- FLIGHT-4 / CHAIN-3: a walker removed while carrying goods (the 물류창고 buyer's parcel) releases them
  const f4 = await E(page, () => {
    const g = window.__FV.scene, p = g.player, H = window.__gs;
    let C = Object.getPrototypeOf(p);
    while (C && C.constructor && C.constructor.name !== 'Character') C = Object.getPrototypeOf(C);
    if (!C) return { none: true };
    const Ch = C.constructor, ty = window.__FV.assets().has('cardboard_box_s') ? 'cardboard_box_s' : 'item_bread';
    const ch = new Ch(g, p.key, p.x + 80, p.y + 20, {});
    ch.stack.push(ty, null, g.effects); ch.sync(0);
    const spr = ch.stack.items[0].spr;
    ch.alive = false; ch.destroy();
    return { ty, pooled: !!spr.__pooled, visible: spr.visible && !!spr.displayList };
  });
  ok(!f4.none && (f4.pooled || !f4.visible), `FLIGHT-4 a walker removed with a ${f4.ty} in hand leaves no picture behind (released ${f4.pooled}, visible ${f4.visible})`, f4);

  // ---- FLIGHT-1: a dock crate still flying when the train boards it (the card room opened mid-dwell) does not land
  const f1 = await E(page, () => {
    const g = window.__FV.scene, G = g.v4 && g.v4.growth, H = window.__gs, p = g.player;
    if (!G || !G.active || !G.dock) return { none: true };
    window.__FV.camera(G.dock.x, G.dock.y - 40, 1);
    G.crates.clear(g.effects); G.cargo = 0; G.cargoTypes = [];
    window.__FV.clearStack(); window.__FV.carry('item_bread', 1);
    window.__FV.teleport(G.dock.x + 60, G.dock.y + 40);
    G.trainIn = () => false; G.addCrate('item_bread', p); delete G.trainIn;
    const flying = G.crates.incoming;
    // the train stands at our station with room: the game's own load loop boards the counted crate (its picture is
    // still in the air)
    G.trainIn = () => true; G.carRoom = () => 1; G.loadT = 0;
    H.frames(1);
    delete G.trainIn; delete G.carRoom;
    const boarded = G.cargo === 0;
    H.play(1, 2);
    return { flying, boarded, cargo: G.cargo, crates: G.crates.count, incoming: G.crates.incoming };
  });
  if (f1.none) ok(false, 'FLIGHT-1 the fixture has the station dock');
  else ok(f1.flying === 1 && f1.boarded && f1.crates <= Math.min(12, f1.cargo), `FLIGHT-1 a crate boarded while it flew to the dock does not land there (cargo ${f1.cargo}, crates drawn ${f1.crates})`, f1);

  // ---- FLICK-1 (review): the chief takes goods off a full baked station output, every frame drawn (the phone's 60 fps).
  //      A take pops the top item and its flying picture appears at its place; the pile was redrawn only at the next
  //      flush (queued by the owner's NEXT layout, then held by the 15 Hz cap): the item showed twice for 1-4 frames.
  //      A "double" frame: the slot holds more than half an item of ink beyond what the pile holds while a picture
  //      that flew out of it is on screen
  const fk = await E(page, () => {
    const g = window.__FV.scene, I = window.__inv, B = g.__stackBaker;
    const c = g.stationList.filter((s) => s.enabled && s.outStack.bakeOn && s.outStack.count >= 10).sort((a, b) => b.outStack.count - a.outStack.count)[0];
    if (!c) return { none: true };
    const st = c.outStack;
    window.__FV.clearStack();
    window.__FV.teleport(c.outPad.x + 300, c.outPad.y + 200);
    window.__FV.camera(c.outPad.x, c.outPad.y - 60, 1.3);
    for (let i = 0; i < 8; i++) window.__step.frame();
    window.__FV.teleport(c.outPad.x, c.outPad.y);
    const f0 = B.flushes, strip = [];
    let prev = st.count, takes = 0, doubles = 0, checked = 0;
    for (let f = 0; f < 48; f++) {
      window.__step.frame();
      const p = I.picture(st);
      const fly = g.children.list.filter((o) => o.__type !== undefined && o.visible && !o.__pooled && o.__iFrom === st && Math.hypot(o.x - st.bx, o.y - st.by) < 260).length;
      const per = st.count > 0 && p ? p.truth / st.count : 0;
      const dbl = fly > 0 && per > 0 && p.real - p.truth > per * 0.5;
      if (fly > 0 && per > 0) checked++;
      if (st.count < prev) takes += prev - st.count;
      prev = st.count;
      if (dbl) doubles++;
      strip.push(st.count + (dbl ? 'D' : ''));
    }
    window.__FV.teleport(c.outPad.x + 300, c.outPad.y + 200); window.__FV.clearStack();
    return { id: c.id, takes, checked, doubles, flushes: B.flushes - f0, strip: strip.join(' ') };
  });
  if (fk.none) ok(false, 'FLICK-1 the fixture has a full baked station output');
  else {
    console.log(`    ${fk.id}: ${fk.strip}  (flushes in 48 drawn frames: ${fk.flushes})`);
    ok(fk.takes >= 5 && fk.checked >= 10 && fk.doubles === 0, `FLICK-1 the chief takes ${fk.takes} items off the ${fk.id} output in 48 drawn frames: the taken item is never drawn on the pile and in flight at once (${fk.doubles} double frames of ${fk.checked} with a flight out)`, fk);
  }

  // ---- INV-1 (review, the checker): an owner-model alarm ('the till shows coins while it holds no value for >= 3 s')
  //      needs the mismatch over CONTINUOUS samples. Two short mismatches joined over an out-of-view spell or an
  //      unsampled gap raised a false alarm in a play run. The station till is held mismatched (the game's own drain and
  //      the rent are paused for this): out of view between two 1.2 s spells -> no alarm; 2.5 s without a check between
  //      two 1.1 s spells -> no alarm; 3.5 s sampled all along -> exactly one alarm (it still catches a real one)
  const iv = await E(page, () => {
    const g = window.__FV.scene, G = g.v4 && g.v4.growth, I = window.__inv, S = window.__step;
    if (!G || !G.till || !I.models) return { none: true };
    const till = G.till;
    till.update = function (dt) { this.pile.layout(this.x, this.y + 4, this.y, 0, dt); };
    till.add = function () { /* (no rent lands meanwhile) */ };
    G.autoT = 0;
    window.__FV.teleport(till.x + 520, till.y + 420);
    const bad = () => { till.value = 0; while (till.pile.count < 3) till.pile.push('item_coin', null, g.effects); };
    const good = () => { till.value = 9; if (!till.pile.count) till.pile.push('item_coin', null, g.effects); };
    const home = () => window.__FV.camera(till.x, till.y - 40, 1);
    const away = () => window.__FV.camera(till.x + 2600, till.y + 200, 1);
    const hits = [];
    // one sample = 8 steps (the inv runs check every 2nd drawn frame of every 4th step), then the owner models
    const sample = (n, tag) => { for (let i = 0; i < n; i++) { S.run(7 / 60); S.frame(); const out = []; I.models(out); for (const v of out) if (v.owner === 'till:station') hits.push(tag); } };
    home(); good(); sample(2, 'good'); bad(); sample(9, 'A'); away(); sample(15, 'B-away'); home(); bad(); sample(10, 'C');
    const outOfView = hits.length;
    good(); sample(2, 'good'); bad(); sample(8, 'D1'); S.run(2.5); bad(); sample(8, 'D2');
    const gap = hits.length - outOfView;
    good(); sample(2, 'good'); bad(); sample(26, 'E');
    const control = hits.filter((h) => h === 'E').length;
    delete till.update; delete till.add;
    till.value = 0; till.pile.clear(g.effects);
    window.__step.frame();
    return { outOfView, gap, control, hits };
  });
  if (iv.none) ok(false, 'INV-1 the fixture has the station till and the checker has owner models');
  else {
    ok(iv.outOfView === 0, `INV-1 two 1.2 s till mismatches with the till out of view between them: no alarm (${iv.outOfView})`, iv.hits);
    ok(iv.gap === 0, `INV-1 two 1.1 s till mismatches with 2.5 s unchecked between them: no alarm (${iv.gap})`, iv.hits);
    ok(iv.control === 1, `INV-1 control: a 3.5 s mismatch sampled all along raises exactly one alarm (${iv.control})`, iv.hits);
  }

  // ---- GOODS-5: the box car's doors (the open-door picture shows crates inside) stay shut while it carries nothing
  // (the train2 cars arrive with a late fragment: real time, the fixed-step clock does not move meanwhile)
  for (let k = 0; k < 90; k++) { if (await E(page, () => !!((window.__FV.assets().m.characters || {}).train_boxcar))) break; await sleep(500); }
  await E(page, () => window.__gs.play(2, 6));
  const bx0 = await E(page, () => {
    const g = window.__FV.scene, nb = g.v4, rail = nb && nb.rail, tr = nb && nb.train, G = nb && nb.growth, F = g.v42 && g.v42.freight;
    if (!tr || !rail || !rail.running || !tr.cars.some((c) => c.key === 'train_boxcar')) return { none: true };
    // (nothing to load and nothing aboard: the dock, the order crates and the cars are kept empty)
    window.__clearLoad = () => { if (G) { G.cargo = 0; G.cargoTypes = []; G.crates.clear(g.effects); } if (F) { F.dock = {}; F.cardAboard = 0; F.unpaid = {}; if (F.refill) F.refill(); if (F.refreshLabel) F.refreshLabel(); } tr.cargo = 0; };
    let k = 0;
    window.__clearLoad();
    for (; k < 1200 && rail.phase === 'atOurs'; k++) { window.__step.run(0.25); window.__clearLoad(); }
    for (k = 0; k < 4800 && rail.phase !== 'atOurs'; k++) { window.__step.run(0.25); window.__clearLoad(); }
    return rail.phase === 'atOurs' ? { at: +rail.t.toFixed(2) } : { never: true, phase: rail.phase };
  });
  // the train2 car pictures load when the train is in view (real time; the fixed-step clock does not move meanwhile)
  // (until the cars stand there, their sprites wait off the map: the camera looks at the station dock meanwhile)
  for (let k = 0; k < 90 && !bx0.none && !bx0.never; k++) {
    const r = await E(page, () => { const g = window.__FV.scene, tr = g.v4.train, car = tr.cars.find((c) => c.key === 'train_boxcar'), G = g.v4.growth; window.__clearLoad(); if (car.spr.x < -9000 && G && G.dock) window.__FV.camera(G.dock.x, G.dock.y - 60, 1); else window.__FV.camera(car.spr.x, car.spr.y - 60, 1.4); window.__step.frame(); return !!(tr.ready && car.look.real && car.spr.visible); });
    if (r) break;
    await sleep(700);
  }
  const bx = bx0.none || bx0.never ? bx0 : await E(page, () => {
    const g = window.__FV.scene, nb = g.v4, rail = nb.rail, tr = nb.train;
    const CAR = () => tr.cars.find((c) => c.key === 'train_boxcar');
    let car = CAR(), opened = 0, frames = 0, cargo = 0, mid = 0, real = 0;
    for (let k = 0; k < 600 && rail.phase === 'atOurs'; k++) {
      window.__clearLoad(); if (car.spr.x > -9000) window.__FV.camera(car.spr.x, car.spr.y - 60, 1.4); window.__step.frame(); frames++;
      car = CAR(); cargo = Math.max(cargo, tr.cargo || 0);
      if (car.look.real && car.spr.visible) real++;
      if (rail.t > 0.6 && rail.t < rail.dur(rail.phase) - 1.2 && car.look.real && car.spr.visible) mid++;
      if (car.door === 1 && !(tr.cargo > 0)) opened++;
    }
    window.__FV.camera();
    return { frames, real, mid, opened, maxCargo: cargo };
  });
  if (bx.none || bx.never) console.log('  (no real box car at our station in this run: GOODS-5 not checked)', JSON.stringify(bx));
  // (a crate boarding during a frame makes the cargo 1 for that frame: only frames on an EMPTY car count)
  else ok(bx.mid > 30 && bx.opened === 0, `GOODS-5 the box car stood ${bx.mid} drawn frames mid-stop at our station carrying nothing: doors shut (${bx.opened} frames open on an empty car)`, bx);
});

// =====================================================================================================================
// v42_save_office_ttal
await section('office', 'v42_save_office_ttal.json', async (page) => {
  // ---- GOODS-4: the 물류 금고 earns while the camera is away (딸랑이 hired: it does not empty itself)
  const dp = await E(page, () => {
    const g = window.__FV.scene, H = window.__gs, D = g.v42 && g.v42.depot, O = g.v42 && g.v42.office;
    if (!D || !D.building) return { none: true };
    const till = D.building.till, m = g.market;
    till.takeAll(null); H.play(0.3, 3);
    window.__FV.teleport(m.x + 200, m.y + 200); window.__FV.camera(m.x, m.y, 1); H.frames(2);
    const away = !g.isOnScreen(till.x, till.y, 300), ttal = !!(O && O.hired && O.hired('ttal'));
    const sell = D.model.sell;
    D.model.sell = function () { D.model.sell = sell; return sell.apply(this, arguments).concat([{ ty: 'item_bread', n: 0, coins: 60 }]); };
    H.play(0.2, 3);
    return { away, ttal, value: till.value, pile: till.pile.count };
  });
  if (dp.none) ok(false, 'GOODS-4 the fixture has the 물류창고');
  else ok(dp.away && dp.value >= 60 && dp.pile > 0, `GOODS-4 a depot sale while the camera is away: 물류 금고 value ${dp.value}, coins on its pile ${dp.pile} (딸랑이 hired ${dp.ttal})`, dp);

  // ---- FLIGHT-2: an item sold while its picture flies to a town shop's shelf does not land as an extra picture
  const f2 = await E(page, () => {
    const g = window.__FV.scene, G = g.v4 && g.v4.growth, H = window.__gs, p = g.player;
    const sh = G && Object.values(G.shops || {}).find((s) => s.st === 'open' && s.sells && s.sells.length && s.inPt && s.shelf);
    if (!sh) return { none: true };
    const ty = sh.sells[0];
    window.__FV.camera(sh.inPt.x, sh.inPt.y - 40, 1);
    sh.stock[ty] = 0;
    while (sh.shelf.countOf(ty)) { const it = sh.shelf.pop(ty); if (it && it.spr) g.effects.releaseItem(it.spr); }
    window.__FV.clearStack(); window.__FV.carry(ty, 1);
    window.__FV.teleport(sh.inPt.x + 300, sh.inPt.y + 300);
    sh.take(p, ty);
    const flying = sh.shelf.incoming;
    sh.takeOut(ty);                                  // a visitor / the town's customer buys it while it flies
    H.play(1.2, 2);
    return { shop: sh.shop, ty, flying, stock: sh.stock[ty], shelf: sh.shelf.countOf(ty) };
  });
  if (f2.none) ok(false, 'FLIGHT-2 the fixture has an open town shop');
  else ok(f2.flying === 1 && f2.shelf <= Math.min(5, f2.stock), `FLIGHT-2 ${f2.shop}: the ${f2.ty} sold while it flew does not land (stock ${f2.stock}, pictures ${f2.shelf})`, f2);

  // ---- LIFE-2: depot rack pictures parked on the stand-in while lgx_items was paged out get their art back when it
  //      returns (the rack cache trusted the key it had set, and the parked image was re-skinned with its old key)
  // racks stocked with crates of two kinds (as the verify stage did), the depot tapped open (x-ray: racks drawn); the
  // depot's lgx_items page loads on demand (real time)
  const prep = await E(page, () => {
    const g = window.__FV.scene, D = g.v42 && g.v42.depot;
    if (!D || !D.building || !D.building.ready) return { none: true };
    const Bd = D.building, st = D.model.stock;
    window.__FV.teleport(Bd.door.x + 60, Bd.door.y + 120); window.__FV.camera(Bd.door.x, Bd.door.y - 60, 1);
    for (const k of Object.keys(st.items)) if (st.items[k] > 0) st.take(k, st.items[k]);
    st.add('item_bread', 30); st.add('item_can', 30);
    Bd.tapOpen = true;
    return { ok: true };
  });
  for (let k = 0; k < 40 && !prep.none; k++) {
    const n = await E(page, () => { window.__gs.play(0.5, 3); const Bd = window.__FV.scene.v42.depot.building; return Bd.rackImgs.filter((im) => im.__on && im.visible && im.__k && im.texture.key !== 'fv_blank').length; });
    if (n > 0) break;
    await sleep(400);
  }
  const l2 = prep.none ? prep : await E(page, async () => {
    const g = window.__FV.scene, H = window.__gs, D = g.v42.depot, A = window.__FV.assets(), Bd = D.building;
    H.play(0.6, 3);
    const on = Bd.rackImgs.filter((im) => im.__on && im.visible && im.__k && im.texture.key !== 'fv_blank');
    if (!on.length) return { noRacks: true, alpha: Bd.alpha };
    // the page was out: the pictures show the stand-in (Residency parks them on fv_blank) while the cache keeps the key
    const want = on.map((im) => im.__k);
    for (const im of on) im.setTexture('fv_blank');
    // ...and the page comes back (every arrival callback runs, as Assets does)
    for (const fn of A.arrivals.slice()) { try { fn('lgx_items'); } catch (e) { /* */ } }
    H.play(1.5, 3);
    const blank = on.filter((im) => im.texture.key === 'fv_blank').length;
    const wrong = on.filter((im, i) => { const r = A.sprite(want[i]); return im.texture.key !== 'fv_blank' && (im.texture.key !== r.tex || String(im.frame.name) !== String(r.frame)); }).length;
    Bd.tapOpen = false;
    return { racks: on.length, blank, wrong };
  });
  if (l2.none || l2.noRacks) ok(false, 'LIFE-2 the fixture has a depot with rack pictures', l2);
  else ok(l2.blank === 0 && l2.wrong === 0, `LIFE-2 ${l2.racks} depot rack pictures show their crates again after the page returns (${l2.blank} blank, ${l2.wrong} wrong)`, l2);

  // ---- LAZY-1 (review): Residency.evictArea parks every picture of a page that goes on the stand-in and queues a
  //      re-skin with its OLD key. A pooled item picture (a depot buyer's parcel) released to the pool and handed to
  //      another item (the chief's cooked fish) before lgx_items came back was re-skinned as the parcel. Also: a picture
  //      its owner re-skinned meanwhile keeps what it shows, and a parcel picture taken while the page is out (the
  //      stand-in) gets its art when the page comes back
  const lz0 = prep.none ? prep : await E(page, async () => {
    const g = window.__FV.scene, fx = g.effects, A = window.__FV.assets(), P = g.player.stack, p = g.player;
    if (!g.textures.exists('lgx_items') || A.pending('cardboard_box_s')) return { notLoaded: true };
    const { Residency } = await import(new URL('src/core/Residency.js', location.href).href);
    window.__FV.clearStack();
    const parcel = fx.takeItem('cardboard_box_s'); parcel.setPosition(p.x + 40, p.y - 60).setDepth(p.y + 1);
    const sign = A.image(g, p.x - 40, p.y - 60, 'cardboard_box_s').setDepth(p.y + 1);
    Residency.evictArea(['lgx_items']);              // the depot's item page goes (TTL / makeRoom / a camera cut)
    const parked = { parcel: parcel.texture.key, queued: g.lazyImgs.some((q) => q.img === parcel), evicted: !g.textures.exists('lgx_items') };
    fx.releaseItem(parcel);                          // the buyer walks off: his parcel goes back to the pool
    let got = null;                                  // the chief picks up cooked fish: the same picture
    for (let k = 0; k < 6 && !got; k++) { P.push('item_fish_cooked', null, fx); got = P.items.find((q) => q.spr === parcel) || null; }
    A.apply(sign, 'item_bread');                     // its owner shows something else meanwhile
    const late = fx.takeItem('cardboard_box_s');     // a parcel taken while the page is out
    late.setPosition(p.x, p.y - 120).setDepth(p.y + 1);
    window.__lz = { parcel, sign, late };
    return { parked, reused: !!got, chiefCarries: P.count, lateStandIn: late.texture.key };
  });
  let lzBack = false;
  for (let k = 0; k < 80 && !lz0.none && !lz0.notLoaded; k++) {
    lzBack = await E(page, () => { window.__gs.play(0.5, 3); const g = window.__FV.scene; return g.textures.exists('lgx_items') && !window.__FV.assets().pending('cardboard_box_s'); });
    if (lzBack) break;
    await sleep(300);
  }
  const lz = lz0.none || lz0.notLoaded || !lzBack ? Object.assign({ back: lzBack }, lz0) : await E(page, () => {
    const g = window.__FV.scene, { parcel, sign, late } = window.__lz, P = g.player.stack, fx = g.effects;
    window.__gs.play(1, 2);
    const it = P.items.find((q) => q.spr === parcel);
    const r = {
      fish: it ? { type: it.type, shows: String(parcel.frame.name), tex: parcel.texture.key } : null,
      sign: { shows: String(sign.frame.name), tex: sign.texture.key },
      late: { shows: String(late.frame.name), tex: late.texture.key, visible: late.visible },
    };
    fx.releaseItem(late); sign.destroy(); window.__FV.clearStack();
    return r;
  });
  if (lz0.none || lz0.notLoaded || !lzBack) ok(false, 'LAZY-1 set-up: lgx_items loaded at the depot, paged out and back', lz);
  else {
    ok(lz0.parked.evicted && lz0.parked.queued && lz0.reused, `LAZY-1 set-up: the parcel picture was parked (${lz0.parked.parcel}) and queued, then reused for the chief's cooked fish`, lz0);
    ok(lz.fish && lz.fish.shows === 'item_fish_cooked', `LAZY-1 after lgx_items came back the chief's cooked fish shows ${lz.fish && lz.fish.shows} (${lz.fish && lz.fish.tex})`, lz);
    ok(lz.sign.shows === 'item_bread', `LAZY-1 a parked picture its owner re-skinned meanwhile keeps it (${lz.sign.shows})`, lz.sign);
    ok(lz.late.shows === 'cardboard_box_s' && lz.late.tex !== 'fv_blank', `LAZY-1 a parcel picture taken while the page was out (${lz0.lateStandIn}) shows the parcel when it comes back (${lz.late.shows} on ${lz.late.tex})`, lz.late);
  }
});

// =====================================================================================================================
// ctx — WebGL context lost + restored (Android WebView in the background)
if (!CANVAS) await section('ctx', 'v35_save_0_5min.json', async (page) => {
  const before = await E(page, () => {
    const g = window.__FV.scene, H = window.__gs, I = window.__inv, m = g.market, S = g.stations.grill;
    window.__FV.teleport(m.x + 200, m.y + 160); window.__FV.camera(m.x - 80, m.y - 40, 0.8);
    if (!S.outStack.count) for (let i = 0; i < 4; i++) S.outStack.push('item_fish_cooked', null, g.effects);
    if (!m.cash.pile.count) m.cash.add(12, m.cash.x, m.cash.y - 60);
    H.play(2, 2);
    const list = [['grill.out', S.outStack], ['market.till', m.cash.pile], ['market.shelf', m.stock], ['grill.in', S.inStack]].filter(([, st]) => st.count > 0 && st.bakeImg);
    window.__ctxList = list;
    return list.map(([n, st]) => ({ n, items: st.count, real: I.picture(st).real }));
  });
  ok(before.length > 0 && before.every((b) => b.real > 0), 'ctx set-up: baked piles holding items are drawn ' + JSON.stringify(before), before);
  const lost = await E(page, () => new Promise((res) => {
    const r = window.__FV.game.renderer, gl = r.gl, ext = gl && gl.getExtension('WEBGL_lose_context');
    if (!ext) { res({ err: 'no WEBGL_lose_context' }); return; }
    // (late file arrivals re-bake every stack and would hide the bug: none in this window)
    const A = window.__FV.assets(); window.__arrSaved = A.arrivals.splice(0);
    r.once('losewebgl', () => res({ lost: true }));
    window.__ext = ext; ext.loseContext();
  }));
  if (lost.err) { console.log('  (' + lost.err + ': context loss not testable here)'); return; }
  await E(page, () => { for (let i = 0; i < 5; i++) window.__step.frame(); });
  const restored = await E(page, () => new Promise((res) => {
    const r = window.__FV.game.renderer, to = setTimeout(() => res({ timeout: true }), 8000);
    r.once('restorewebgl', () => { clearTimeout(to); res({ restored: true }); });
    window.__ext.restoreContext();
  }));
  await sleep(300);
  const after = await E(page, () => {
    const I = window.__inv;
    for (let i = 0; i < 30; i++) window.__step.frame();
    const out = window.__ctxList.map(([n, st]) => { const p = I.picture(st); return { n, items: st.count, real: p.real, truth: p.truth, diff: p.diff }; });
    const A = window.__FV.assets(); A.arrivals.push(...window.__arrSaved);
    return out;
  });
  ok(restored.restored, 'ctx: the GL context came back', restored);
  for (const a of after) ok(a.items === 0 || (a.real > 0 && a.diff <= Math.max(12, a.truth * 0.01)), `BAKE-2 / LIFE-1 after the context restore: ${a.n} (${a.items} held) is drawn again within 30 frames (${a.real} px / ${a.truth} px)`, a);
});

// =====================================================================================================================
// replay — the designer's screenshot (ghostsweep_replay.mjs, a child process: its own browser after ours is closed)
if (ONLY.has('replay')) {
  if (browser) { await browser.close(); browser = null; }
  console.log(`\n== replay (the designer's screenshot, fresh game)  [${lap()}]`);
  const args = [path.join(HERE, 'ghostsweep_replay.mjs'), '--root', ROOT, '--no-art', '--dpr', String(DPR), '--out', path.join(OUT, 'replay')];
  if (CANVAS) args.push('--canvas');
  if (!argv.includes('--full-replay') && QUICK) args.push('--quick');
  const res = await new Promise((resolve) => {
    const ch = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let txt = '';
    ch.stdout.on('data', (d) => { txt += d; process.stdout.write(String(d).replace(/^/gm, '    | ')); });
    ch.stderr.on('data', (d) => { txt += d; });
    ch.on('close', (code) => resolve({ code, txt }));
  });
  const m = /(\d+) passed, (\d+) failed/.exec(res.txt);
  ok(res.code === 0 && m && +m[2] === 0, `replay: every stack in the designer's screenshot shows exactly what it holds, at every step (${m ? m[1] + ' passed, ' + m[2] + ' failed' : 'no summary'})`);
}

// =====================================================================================================================
// inv — the generic invariants after long play, every chain driven (gather, hunt, make, move, sell)
async function invRun(page, name, drive) {
  await drive();
  const r = await E(page, () => ({ summary: window.__inv.summary(), violations: window.__inv.violations.slice(0, 60), cov: window.__inv.coverage() }));
  fs.writeFileSync(path.join(OUT, 'inv_' + name + '.json'), JSON.stringify(r, null, 1));
  const vc = r.summary.vcount, kinds = Object.keys(vc);
  const pics = (vc.pic || 0) + (vc.stale || 0) + (vc.nopic || 0) + (vc.clip || 0) + (vc.img || 0) + (vc.model || 0);
  const sprites = (vc.orphan || 0) + (vc.pooled || 0) + (vc.ghost || 0) + (vc.deadRef || 0) + (vc.hidden || 0) + (vc.shared || 0) + (vc.type || 0) + (vc.frozen || 0) + (vc.offList || 0);
  const first = (re) => r.violations.filter((v) => re.test(v.kind)).slice(0, 3);
  console.log(`  ${name}: ${r.summary.checks} checks, ${r.summary.picChecks} slot pixel checks, ${r.summary.stacks} stacks, owner models ${JSON.stringify(r.summary.modelChecks)}`);
  ok(pics === 0, `inv ${name} (i): every baked stack showed exactly its items at every check (${r.summary.picChecks} slot checks; ${pics} wrong: ${JSON.stringify(vc)})`, first(/^(pic|stale|nopic|clip|img|model)$/));
  ok(sprites === 0, `inv ${name} (ii): no orphan / ghost / released item or coin picture (${sprites} found)`, first(/^(orphan|pooled|ghost|deadRef|hidden|shared|type|frozen|offList)$/));
  const paths = new Set(r.cov.map((c) => c.type + '|' + c.path)), types = new Set(r.cov.map((c) => c.type));
  console.log(`  ${name}: coverage ${r.cov.length} (place, item, path) cells, ${types.size} item types: ${[...types].map((t) => t.replace('item_', '')).sort().join(' ')}`);
  void kinds; void paths;
}
const playChecked = (page, sec, draw = 4, check = 2) => E(page, ([s, d, k]) => { const I = window.__inv, n = Math.max(1, Math.round(s * 60)); let f = 0; for (let i = 0; i < n; i++) { if (i % d === d - 1) { window.__step.frame(); f++; if (f % k === 0) I.check(); } else window.__step.run(1 / 60); } return f; }, [sec, draw, check]);
async function stand(page, name, sec, until, draw = 4) {
  const p = typeof name === 'string' ? await E(page, (k) => window.__FV.where(k), name) : name;
  if (!p) { console.log('    (no place ' + name + ')'); return false; }
  await E(page, (q) => { window.__FV.teleport(q.x, q.y); window.__FV.setInput(0, 0); }, p);
  for (let t = 0; t < sec; t += 1) {
    await playChecked(page, Math.min(1, sec - t), draw);
    if (until && await E(page, until)) return true;
  }
  return false;
}

await section('inv', null, async (page) => {
  // fresh game: the designer's chain (net -> chief -> grill in -> the grill output GROWS fish by fish -> shelf ->
  // customers -> till -> coins collected), the next tutorial pads (workers hired) and the workers left to run
  await invRun(page, 'fresh', async () => {
    await playChecked(page, 2);
    await stand(page, 'net', 25, () => window.__FV.state().player.stack.length >= 6);
    await stand(page, 'grillIn', 10, () => window.__FV.state().player.stack.length === 0);
    await stand(page, 'op:grill', 40, () => { const s = window.__FV.state().stations.grill; return s.in === 0 && !s.working; }, 2);
    await stand(page, 'grillOut', 10, () => window.__FV.state().stations.grill.out === 0);
    await stand(page, 'shelf', 10, () => window.__FV.state().player.stack.length === 0);
    await stand(page, 'register', 40, () => window.__FV.state().market.stock === 0 && window.__FV.state().market.waitingPay === 0);
    await stand(page, 'cash', 10, () => window.__FV.state().market.cash === 0 && window.__FV.scene.market.cash.pile.count === 0);
    await E(page, () => window.__FV.give(5000));
    for (let k = 0; k < (QUICK ? 1 : 3); k++) {
      const pads = await E(page, () => Object.keys(window.__FV.scene.progress.pads));
      for (const id of pads) { const p = await E(page, (q) => window.__FV.where(q), id); if (p) await stand(page, p, 3); }
    }
    for (const pl of ['net', 'grillOut', 'shelf', 'pile:fish']) {
      const p = await E(page, (q) => window.__FV.where(q), pl);
      if (!p) continue;
      await E(page, (q) => window.__FV.teleport(q.x + 120, q.y + 80), p);
      await playChecked(page, QUICK ? 4 : 8);
    }
    console.log(`    fresh driven  [${lap()}]`);
  });
});
if (!QUICK) await section('inv', 'v42_village_late.json', async (page) => {
  // late village: the chief gathers / hunts every raw item and drops it on its station, takes every output and drops
  // the goods on every consumer, collects every till; then the camera visits every place a stack stands while the
  // workers, porters, staff, customers, boats, the train and the sleigh move goods by themselves
  await invRun(page, 'late', async () => {
    await E(page, () => window.__FV.camera());
    const clear = () => E(page, () => window.__FV.clearStack());
    for (const [src, dst] of [['net', 'grillIn'], ['tree', 'sawmillIn'], ['rock', 'smelterIn'], ['wheat', 'bakeryIn'], ['animal', 'smokehouseIn']]) {
      await clear(); await stand(page, src, 5); await stand(page, dst, 3);
    }
    const goods = [
      ['grillOut', ['shelf', 'restPantry']], ['sawmillOut', ['tradeShelf', 'warehouseIn']], ['smelterOut', ['tradeShelf', 'canneryIn']],
      ['bakeryOut', ['foodBox', 'restPantry']], ['smokehouseOut', ['restPantry', 'foodBox', 'shelf']], ['dockOut', ['canneryIn', 'grillIn']],
      ['canneryOut', ['storeShelf']], ['toolsmithOut', ['storeShelf']],
    ];
    for (const [src, dsts] of goods) { await clear(); await stand(page, src, 3); for (const d of dsts) await stand(page, d, 2.5); }
    for (const c of ['cash', 'tradeCash', 'storeCash', 'restCash', 'hallTax']) await stand(page, c, 2);
    await clear();
    console.log(`    late: chief route done  [${lap()}]`);
    // the tour: every place a stack stands (clustered), watched while the village works
    await E(page, () => { window.__FV.teleport(window.__FV.scene.market.x + 200, window.__FV.scene.market.y + 200); window.__inv.relabel(); });
    const spots = await E(page, () => {
      const out = [];
      for (const s of window.__inv.inventory()) {
        if (/^carry:/.test(s.label)) continue;
        const [x, y] = s.base;
        if (!x && !y) continue;
        let c = out.find((q) => Math.hypot(q.x - x, (q.y - y) * 1.4) < 420);
        if (!c) { c = { x, y, n: 0 }; out.push(c); }
        c.n++;
      }
      return out;
    });
    for (const sp of spots) { await E(page, (q) => window.__FV.camera(q.x, q.y - 50, 0.75), sp); await playChecked(page, 2.5, 5); }
    await E(page, () => window.__FV.camera());
    console.log(`    late: tour of ${spots.length} places done  [${lap()}]`);
  });
});

if (browser) await browser.close();
await srv.close();
console.log(`\n[ghostsweep ${TAG}] ${pass} passed, ${fail} failed (${lap()})`);
if (fails.length) console.log('failed:\n  - ' + fails.join('\n  - '));
process.exit(fail ? 1 : 0);
