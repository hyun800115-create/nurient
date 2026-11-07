// (v4.3 「마을 새 단장」 step A, docs/redesign_v43/engineering_plan.md §4.1 / §8) the fishing deck that replaces the net,
// the chief's hut and the first houses' plots. Fixed-step clock, one browser.
//   node tools/test/deck.mjs [--shots DIR] [--only new,old,office,houses]
// 1 a new game: the deck (1단 art, rods, the reel spot's pad) and the hut are there; the fish crate is ON LAND (walkable),
//   the deck and its float points on the water. ((v4.3 「바다 가까이」) the chief's spot is his landing at the water's edge:
//   within 0.6 m of the water, on HIS ground only (Collision.addLand: walkable for the chief, off land for everyone
//   else), the landing's art shown; the chief starts a few steps behind it; (review) the fish crate's box and name keep
//   off the landing, its door (the pilot's way on) is a clear straight walk onto the spot)
// 2 the chief on the reel spot: he fishes (`fish`, looping: the reel's motion) facing the sea, the first fish within
//   0.45 s of standing still, the pool (6) emptied at today's pickup beat (≤ 4.2 s), the rods show the pool (hooked /
//   bite / idle). (v4.3 sea) his line and float: cast from the rod tip, the float lands on the WATER with a splash ring,
//   the line runs from his rod tip (above him) to the float, each fish starts at the float (leaps out of the water to
//   him); he walks away -> the line is reeled in and gone
// 3 the fishers: hired at once (non-instant: they walk the lane from the gangway foot to their stools), the deck grows
//   1단 → 2단 → 3단 with them; each fisher ≈ 34 fish a minute (29..39: two fish a reel, the 4.2 rod fisherman's rate),
//   three ≈ 101 (88..115); their fish fly to the
//   crate (the `fish` pile) on land; the crate keeps them when it is full (no fish lost, the fishers wait)
// 4 nobody else on the deck: a 3-minute soak with three fishers, the fish porters (raw + goods), the cook, customers,
//   residents and the chief walking between the reel spot and the grill — only fishers are ever inside the deck /
//   gangway (beyond the snow) or on the water (the chief only on his landing); nobody but the chief ever on the landing or
//   the snow behind it; nobody is stuck at the gangway foot (the crowd there: the chief, the raw porter at the crate, a
//   fisher walking in)
// 5 old saves (v3.5 / v4.1 / v4.2 fixtures): the fishermen sit on the stools (deck tier = their number), the fish pile
//   keeps its count (now the crate on land), coins / goods / workers kept; the hut stands on the office plot unless the
//   village has an office (then the office stands there); no building overlaps another
// 6 the office plot's replace mode: the hut stays until the scaffold, a reload mid-site keeps the hut + the foundation,
//   the office finished on the plot
// 7 the first houses (h43_1 / h43_2): their own prices (80 + 4 / 160 + 6), open with the forest (not the miner), a side
//   goal (not in GOALS); building one folds its two tents and the tent family walks to its door
// 0 page errors
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render } from './fv_step.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
// --only new,old,office,houses: run just those sections
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const want = (k) => !ONLY || ONLY.includes(k);
// a fixture's save text (the late village keeps every game key: { note, keys })
const fx = (n) => { const t = fs.readFileSync(path.join(HERE, 'fixtures', n), 'utf8'), o = JSON.parse(t); return o.keys ? o.keys['frostVillage.save.v1'] : t; };
let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg + (extra !== undefined ? '  — ' + JSON.stringify(extra).slice(0, 260) : '')); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const t0 = Date.now();

const srv = await start(0, { prefix: '/fv/' });
const browser = await launch();
async function boot(saveTxt, vp) {
  const INIT = `try { if (!sessionStorage.getItem('__dkInit')) { sessionStorage.setItem('__dkInit', '1'); localStorage.clear(); const sv = ${JSON.stringify(saveTxt || null)}; if (sv) localStorage.setItem('frostVillage.save.v1', sv); } } catch (e) {}`;
  const { page, ctx, log } = await openPage(browser, srv.url + 'index.html', { viewport: vp || { width: 412, height: 915 }, dpr: 1, init: INIT });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 180000);
  // (old saves) what each pile holds the moment it is restored (the village then runs a moment in real time before the
  // fixed clock: porters pick fish up, the save puts carried fish back on the pile — so the counts are read here)
  await page.evaluate(async () => {
    const m = await import(new URL('src/systems/Labour.js', location.href).href);
    const P = m.Pile.prototype, r0 = P.restore;
    window.__pileAt = {};
    P.restore = function (n) { r0.call(this, n); window.__pileAt[this.id] = { n, count: this.stack.count + this.stack.incoming }; };
  });
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 180000);
  await sleep(1200);
  await installStepper(page);
  await page.evaluate(() => { try { if (window.__FV.v42) window.__FV.v42.v.seen.whatsNew = 1; } catch (e) { /* */ } });
  return { page, ctx, log };
}
let shotN = 0;
const shot = async (page, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await render(page, 2); await page.screenshot({ path: path.join(SHOTS, String(++shotN).padStart(2, '0') + '_' + name + '.png') }); };

// in the page: the deck polygon tests (deck-local metres from world.js WORLD.deck)
const GEO = async () => {
  const gs = window.__FV.scene, D = gs.deck, C = D.cfg;
  const m = await import(new URL('src/systems/Progression.js', location.href).href);
  window.__FV.STEPS = m.STEPS; window.__FV.GOALS = m.GOALS;
  window.__W = (await import(new URL('src/data/world.js', location.href).href)).WORLD;
  const loc = (x, y) => { const s = (x - D.x) / 45.25, d = (y - D.y) / 22.63; return { mx: (s + d) / 2, my: (s - d) / 2 }; };
  const T = C.tiers[3];
  window.__onDeck = (x, y) => { const q = loc(x, y); return q.mx > T[0] - 0.05 && q.mx < T[1] + 0.05 && q.my > T[2] - 0.05 && q.my < T[3] + 0.05; };
  // the gangway beyond the snow: inside its strip and not on walkable ground
  window.__onGang = (x, y) => { const q = loc(x, y); return q.mx > C.gangway[0] - 0.05 && q.mx < C.gangway[1] + 0.05 && q.my > -4.75 && q.my < -1.3 && gs.collision.offLand(x, y); };
  window.__onWater = (x, y) => y < gs.collision.shore(x) + 2;
  return true;
};
const errors = [];
try {
  // ================================================================== 1–4: a new game
  console.log('— a new game, 412x915');
  if (want('new')) {
    const { page, log } = await boot(null);
    await page.evaluate(GEO);
    await advance(page, 1);
    const s0 = await page.evaluate(() => {
      const gs = window.__FV.scene, D = gs.deck, O = gs.v42 && gs.v42.office, p = gs.player, C = gs.collision;
      const bob = [0, 1, 2].map((i) => D.bobber(i));
      // ((v4.3 sea) how far the chief's spot is from the water (ground px: y doubled; 64 = 1 m)
      let toWater = Infinity;
      for (let x = D.gather.x - 120; x <= D.gather.x + 120; x += 2) { const sy = C.shore(x); toWater = Math.min(toWater, D.gather.y < sy ? 0 : Math.hypot(x - D.gather.x, (sy - D.gather.y) * 2)); }
      return { st: D.state(), hut: !!(O && O.hut), hutXY: O && O.hut ? [O.hut.x, O.hut.y] : null, plot: gs.sites.v42_office && gs.sites.v42_office.state,
        start: [Math.round(p.x), Math.round(p.y)], startW: [window.__W.player.x, window.__W.player.y], reelLand: !C.offLand(D.gather.x, D.gather.y, true) && !C.blocked(D.gather.x, D.gather.y, 16, null, true), reelOthers: C.offLand(D.gather.x, D.gather.y),
        toWaterM: +(toWater / 64).toFixed(2), crateLand: !C.offLand(gs.piles.fish.x, gs.piles.fish.y),
        deckWater: window.__onWater(D.x, D.y), rodsWater: D.rods.every((r) => window.__onWater(r.bob.x, r.bob.y)), bobWater: bob.every((b) => window.__onWater(b.x, b.y)),
        startToReel: Math.round(Math.hypot(p.x - D.gather.x, (p.y - D.gather.y) * 2)), net: gs.net === gs.deck, kind: gs.net.kind,
        reelAnim: !!(window.__FV.game.anims.exists('player:reel:NE')) && !!(window.__FV.game.anims.exists('player:fish:NE')) && !!((p.def.anims.fish || {}).tipPoints),
        // (the variants' own atlases are on the lazy workers page: their seated anims are in the manifest now and built
        //  when that page comes — checked again after the soak)
        fsit: ['fisherman', 'fisherman_b', 'fisherman_c'].map((k) => { const d = window.__FV.assets().m.characters[k]; return ['fsit_cast', 'fsit_wait', 'fsit_bite', 'fsit_reel'].every((a) => d && d.anims && d.anims[a] && d.anims[a].atlas === 'deck43_ch'); }),
        fsitBase: ['fsit_cast', 'fsit_wait', 'fsit_bite', 'fsit_reel'].every((a) => window.__FV.game.anims.exists('fisherman:' + a + ':NE')) };
    });
    ok(s0.st.tier === 1 && s0.st.art && s0.st.stock === 6, 'the fishing deck: 1단 with its art, the pool full (6)', s0.st);
    ok(s0.hut && s0.plot === 'plot' && s0.hutXY[0] === 600 && s0.hutXY[1] === 640, 'the chief\'s hut stands on the office plot (600, 640) from the start', { hut: s0.hut, xy: s0.hutXY, plot: s0.plot });
    ok(s0.start[0] === s0.startW[0] && s0.start[1] === s0.startW[1] && s0.startToReel < 120, 'the chief starts a few steps from his spot (world.js player)', { start: s0.start, d: s0.startToReel });
    ok(s0.reelLand && s0.crateLand, 'the reel spot (for the chief) and the fish crate are walkable', s0);
    ok(s0.toWaterM <= 0.6, `(v4.3 sea) the chief's spot is at the water's edge: ${s0.toWaterM} m from the water (≤ 0.6)`, { reel: s0.st.reel, toWaterM: s0.toWaterM });
    ok(s0.reelOthers, '(v4.3 sea) the landing is the chief\'s ground only: off land for every other walker', s0.reelOthers);
    ok(s0.st.landing && s0.st.landing.art && s0.st.landing.shown, '(v4.3 sea) the landing\'s art (deck43_landing) stands at the surf line', s0.st.landing);
    // (review CRATE-CROWD / CRATE-LABEL / PILOT-WEDGE) the fish crate's box and its name keep off the landing; the landing's
    // door (where the 관망 pilot steps on) is ordinary snow with a clear straight walk onto the spot
    const s1 = await page.evaluate(() => {
      const gs = window.__FV.scene, D = gs.deck, C = gs.collision, P = gs.piles.fish, box = P.props[0];
      const plankLeft = Math.min(...D.plankPoly.map((q) => q.x)), gd = (ax, ay, bx, by) => Math.hypot(ax - bx, (ay - by) * 2);
      const door = D.landDoor;
      let clear = !!door;
      for (let i = 0; door && i <= 20; i++) { const x = door.x + (D.gather.x - door.x) * i / 20, y = door.y + (D.gather.y - door.y) * i / 20; if (C.blocked(x, y, 16, null, true)) clear = false; }
      return { box: box ? [Math.round(box.x), Math.round(box.y)] : null, boxToLanding: box ? Math.round(gd(box.x, box.y, D.landAt.x, D.landAt.y)) : null,
        boxToSpot: box ? Math.round(gd(box.x, box.y, D.gather.x, D.gather.y)) : null, labelRight: Math.round(P.label.x + P.labelBg.width / 2), plankLeft,
        door, doorLand: !!door && !C.offLand(door.x, door.y), doorClear: clear };
    });
    ok(s1.box && s1.boxToLanding >= 150 && s1.boxToSpot >= 140 && s1.labelRight + 30 < s1.plankLeft, '(v4.3 sea) the fish crate\'s box and name stand clear of the chief\'s landing', s1);
    ok(s1.doorLand && s1.doorClear, '(v4.3 sea) the landing\'s door is everyone\'s snow, a clear straight walk from it onto his spot (the pilot\'s last leg)', s1);
    ok(s0.deckWater && s0.rodsWater && s0.bobWater, 'the deck, the rods\' floats and the fishers\' floats are on the water', s0);
    ok(s0.net && s0.kind === 'net', 'gs.net is the deck (the old Net surface for every caller)');
    ok(s0.reelAnim && s0.fsit.every(Boolean) && s0.fsitBase, 'the art: the chief\'s `reel` and `fish` (with its rod tips) and the seated loop of the three fisher looks (NE)', { reel: s0.reelAnim, fsit: s0.fsit, base: s0.fsitBase });
    await shot(page, 'open');
    // ---------------- 2. the chief on the reel spot
    const r2 = await page.evaluate(() => {
      const gs = window.__FV.scene, D = gs.deck, p = gs.player;
      p.stack.clear && p.stack.clear(gs.effects);
      D.stock = D.max;
      window.__FV.teleport(D.gather.x, D.gather.y);
      window.__FV.setInput(0, 0);
      const out = { anims: [], first: null, got: [], lines: [], fromFloat: 0, fromElse: 0, dirs: [] };
      // (review ARROW-AIM) the objective arrow over his spot while he is away: low, its tip on the landing's pad
      const T0 = gs.tutorial;
      out.arrowAway = T0 && T0.target ? { key: T0.textKey, x: Math.round(T0.target.x), tip: Math.round(T0.target.y - T0.target.h), h: T0.target.h } : { key: T0 && T0.textKey };
      // (v4.3 sea) where each fish starts its flight to him (the chief's: his float)
      const sp = gs.spawnItemTo.bind(gs);
      gs.spawnItemTo = (type, x, y, ch, isP, d, fo) => { if (ch === p) { const k = D.cast; if (k && Math.hypot(x - k.bob.x, (y - k.bob.y) * 2) < 12 && fo) out.fromFloat++; else out.fromElse++; } return sp(type, x, y, ch, isP, d, fo); };
      const onW = (q) => q && q.y < gs.collision.shore(q.x) - 2;
      let t = 0;
      for (let i = 0; i < 300; i++) {
        window.__step.run(1 / 60); t += 1 / 60;
        const a = p.animName; if (out.anims[out.anims.length - 1] !== a) out.anims.push(a);
        const n = p.stack.countOf('item_fish_raw') + p.stack.incoming;
        if (out.first === null && n > 0) out.first = +t.toFixed(2);
        if (out.fullAt === undefined && p.room <= 0) out.fullAt = +t.toFixed(2);
        if (i % 30 === 29) { out.got.push(n); const L = D.state().landing; out.lines.push({ t: +t.toFixed(1), st: L.line, float: L.float, tip: L.tip, drawn: L.drawn, rings: L.rings, onWater: onW(L.float), tipUp: !!(L.tip && L.tip.y < p.y - 40 && Math.abs(L.tip.x - p.x) < 70), dir: p.dir, full: p.room <= 0, anim: p.animName, pad: +D.pad.img.alpha.toFixed(2) }); }
        if (i === 30) { out.rodsAt05 = D.rods.map((r) => r.frame); out.arrowHere = { key: gs.tutorial.textKey, target: !!gs.tutorial.target }; }
        if (D.cast && D.cast.rings.length) out.ringSeen = true;
      }
      gs.spawnItemTo = sp;
      out.n = p.stack.countOf('item_fish_raw');
      out.stock = D.stock;
      out.onPlanks = D.onPlanks(p.x, p.y); out.lift = Math.round(p.liftY || 0);
      return out;
    });
    // (his line while the bag has room; (v4.3 verify LOOK-5) a full bag reels it in)
    const lin = r2.lines.filter((q) => q.t >= 0.5 && !q.full);
    const afterFull = r2.lines.filter((q) => r2.fullAt !== undefined && q.t >= r2.fullAt + 0.5);
    ok(r2.anims.includes('fish') && !r2.anims.includes('harvest') && r2.lines.every((q) => q.dir === 7), '(v4.3 sea) the chief fishes from his landing: `fish` (the reel\'s motion, looping at the pickup beat), facing the sea (NE)', { anims: r2.anims, dirs: r2.lines.map((q) => q.dir) });
    ok(r2.onPlanks && r2.lift >= 6, `(v4.3 sea) he stands on the landing's planks, lifted onto them (${r2.lift} px)`, { on: r2.onPlanks, lift: r2.lift });
    ok(r2.first !== null && r2.first <= 0.45, `the first fish comes ${r2.first} s after he stands there (≤ 0.45 s: the reel's beat takes it)`, r2.first);
    ok(r2.n >= 6, `the pool is his within 5 s (${r2.n} fish)`, r2.got);
    ok(r2.rodsAt05 && r2.rodsAt05.every((f) => f === 'hooked'), 'while he reels the three rods come up hooked', r2.rodsAt05);
    ok(r2.arrowAway && r2.arrowAway.key === 'obj_fish' && Math.abs(r2.arrowAway.x - s0.st.reel.x) < 2 && r2.arrowAway.tip >= s0.st.reel.y - 24 && r2.arrowAway.tip <= s0.st.reel.y,
      '(v4.3 sea) the arrow to his spot is low: its tip on the landing\'s pad, not on the deck\'s corner', { away: r2.arrowAway, reel: s0.st.reel });
    ok(r2.arrowHere && r2.arrowHere.key === 'obj_fish' && !r2.arrowHere.target, '(v4.3 sea) standing at his spot: the objective text stays, no arrow over him', r2.arrowHere);
    // ((v4.3 verify LOOK-5) the bag (6) is full at ~3.3 s now and his line comes in then: ≥ 5 samples of 0.5 s before that)
    ok(lin.length >= 5 && lin.every((q) => q.st === 'in' && q.drawn && q.onWater && q.tipUp), '(v4.3 sea) while he reels: his line runs from the rod tip (above him) to his float, the float on the water', lin.slice(0, 4));
    ok(lin.length && lin.every((q) => q.pad <= 0.3), '(v4.3 verify LOOK-1) while his line is out the stand-here mat fades: the landing\'s planks show under him', lin.map((q) => q.pad));
    ok(r2.fullAt !== undefined && afterFull.length >= 1 && afterFull.every((q) => q.st === 'off' && !q.drawn && q.anim !== 'fish' && q.pad >= 0.8),
      `(v4.3 verify LOOK-5) his bag full (${r2.fullAt} s): he reels in and stands with his catch (no line, no \`fish\`), the mat back`, afterFull.slice(0, 3));
    ok(r2.ringSeen && r2.fromFloat >= 6 && r2.fromElse === 0, `(v4.3 sea) the float lands with a splash ring; every fish leaps from the float to him (${r2.fromFloat} from the float, ${r2.fromElse} elsewhere)`, { ring: r2.ringSeen, float: r2.fromFloat, other: r2.fromElse });
    await page.evaluate(() => { window.__FV.teleport(1000, 620); });
    await advance(page, 4);
    const gone = await page.evaluate(() => { const L = window.__FV.scene.deck.state().landing; return { st: L.line, drawn: L.drawn }; });
    ok(gone.st === 'off' && !gone.drawn, '(v4.3 sea) he walks away: the line is reeled in and gone', gone);
    const pool = await page.evaluate(() => { const D = window.__FV.scene.deck; return { stock: D.stock, shown: D.fish.filter((f) => f.visible).length, rods: D.rods.map((r) => r.frame) }; });
    ok(pool.stock === pool.shown && pool.stock >= 3, 'the rods show the pool: one fish picture per fish held', pool);
    // ---------------- 3. the fishers: hired on the spot, walking the lane, the deck grows
    const hired = await page.evaluate(() => {
      const gs = window.__FV.scene, D = gs.deck;
      gs.progress.flags.firstSale = true;
      window.__FV.deck({ hire: 1, x: 925, y: 745 });
      const seen = { lane: false, gang: false, tier: [D.tier] };
      for (let i = 0; i < 25 * 10; i++) {
        window.__step.run(0.1);
        const w = gs.workers.find((q) => q.type === 'fisherman');
        if (w && w.dk && w.dk.st === 'lane') seen.lane = true;
        if (w && w.onGangway) seen.gang = true;
        if (w && w.dk && w.dk.st === 'sit') { seen.sitAt = +(i / 10).toFixed(1); break; }
      }
      return Object.assign(seen, { st: D.state() });
    });
    ok(hired.lane && hired.gang && hired.sitAt !== undefined && hired.sitAt < 20, `the fisherman walks from the hire pad to the gangway, along the lane, and sits on his stool (${hired.sitAt} s)`, hired);
    ok(hired.st.tier === 1 && hired.st.fishers[0].onDeck && hired.st.fishers[0].lift === 17, 'the 1단 deck, the fisher on the planks (lifted 17 px)', hired.st.fishers);
    await shot(page, 'fisher1');
    // one fisher's rate (the crate emptied every second: it never fills), the crate on land gets the fish
    const rate1 = await page.evaluate(() => {
      const gs = window.__FV.scene, D = gs.deck, pl = gs.piles.fish;
      let n = 0; const orig = D.flyFish.bind(D);
      D.flyFish = (x, y, pile) => { const r = orig(x, y, pile); if (r) n++; return r; };
      const before = pl.count;
      for (let s = 0; s < 120; s++) { window.__step.run(1); while (pl.stack.count > 10) { const it = pl.stack.pop(); if (it) gs.effects.releaseItem(it.spr); } }
      D.flyFish = orig;
      return { n, perMin: +(n / 2).toFixed(1), crate: pl.count, before, loops: gs.workers.filter((w) => w.type === 'fisherman').map((w) => w.dk && w.dk.f) };
    });
    ok(rate1.perMin >= 29 && rate1.perMin <= 39, `one fisher ≈ 34 fish a minute (the 4.2 fisherman's rate): ${rate1.perMin}`, rate1);
    // fishers 2 and 3: the deck grows (2단, 3단 with the roof)
    const tiers = await page.evaluate(() => {
      const gs = window.__FV.scene, D = gs.deck, out = [D.tier];
      window.__FV.deck({ hire: 2, x: 925, y: 745 });
      out.push(D.tier);
      for (let i = 0; i < 200; i++) window.__step.run(0.1);
      window.__FV.deck({ hire: 3, x: 925, y: 745 });
      out.push(D.tier);
      let sat = 0;
      for (let i = 0; i < 300; i++) { window.__step.run(0.1); sat = gs.workers.filter((w) => w.type === 'fisherman' && w.dk && w.dk.st === 'sit').length; if (sat === 3) break; }
      return { tiers: out, sat, keys: gs.workers.filter((w) => w.type === 'fisherman').map((w) => w.wantKey || w.key), art: [1, 2, 3].map((n) => !!window.__FV.scene.textures && Assets_has(n)) };
      function Assets_has(n) { const S = window.__FV.assets ? window.__FV.assets() : null; return S ? S.has('deck43_t' + n + '_back') && S.has('deck43_t' + n + '_front') : false; }
    });
    ok(tiers.tiers.join() === '1,2,3' && tiers.sat === 3, 'hire2 → 2단, hire3 → 3단 (small roof); all three fishers on their stools', tiers);
    ok(tiers.art.every(Boolean), 'the art of the three tiers (back + front layers)', tiers.art);
    ok(new Set(tiers.keys).size === 3, 'the three fisher looks (worn as soon as their page is here)', tiers.keys);
    await shot(page, 'fisher3');
    const rate3 = await page.evaluate(() => {
      const gs = window.__FV.scene, D = gs.deck, pl = gs.piles.fish;
      let n = 0; const orig = D.flyFish.bind(D);
      D.flyFish = (x, y, pile) => { const r = orig(x, y, pile); if (r) n++; return r; };
      for (let s = 0; s < 120; s++) { window.__step.run(1); while (pl.stack.count > 10) { const it = pl.stack.pop(); if (it) gs.effects.releaseItem(it.spr); } }
      D.flyFish = orig;
      return { n, perMin: +(n / 2).toFixed(1) };
    });
    ok(rate3.perMin >= 88 && rate3.perMin <= 115, `three fishers ≈ 101 fish a minute: ${rate3.perMin}`, rate3);
    // the crate full: nothing is lost, the fishers wait
    const full = await page.evaluate(() => {
      const gs = window.__FV.scene, pl = gs.piles.fish;
      for (let s = 0; s < 90; s++) window.__step.run(1);
      const a = pl.count + pl.stack.incoming;
      for (let s = 0; s < 20; s++) window.__step.run(1);
      return { a, b: pl.count + pl.stack.incoming, max: pl.stack.max, waiting: gs.workers.filter((w) => w.type === 'fisherman' && w.dk && w.dk.f === 'wait').length };
    });
    ok(full.a === full.b && full.b <= full.max + 1, 'a full crate: the fishers wait on their stools, nothing flies away', full);
    // (review SEA-OFFMODE) Settings 줍기 'off': he fishes while the button is held; let go -> he reels in and stands
    const offm = await page.evaluate(async () => {
      const gs = window.__FV.scene, p = gs.player, D = gs.deck, PP = gs.v42 && gs.v42.pickup;
      if (!PP) return null;
      // (the pickup setting is in force once the first loop is over: hire_fisherman done, as here)
      const S = (await import(new URL('src/core/Save.js', location.href).href)).Settings;
      const m0 = S.data.pickup; S.data.pickup = 'off';
      const mode = PP.mode;
      window.__FV.clearStack(); D.stock = D.max;
      window.__FV.teleport(D.gather.x, D.gather.y); window.__FV.setInput(0, 0); window.__step.run(0.5);
      PP.press(); window.__step.run(1.2);
      const held = { n: p.stack.count + p.stack.incoming, line: D.cast.st, anim: p.animName };
      PP.release(); window.__step.run(1.5);
      const after = { n: p.stack.count + p.stack.incoming, line: D.cast.st, anim: p.animName, node: !!p.node };
      S.data.pickup = m0;
      window.__FV.clearStack(); window.__FV.teleport(1000, 620); window.__step.run(1);
      return { mode, held, after };
    });
    ok(!!offm && offm.mode === 'off' && (offm.held.line === 'in' && offm.held.n >= 1 && offm.after.line !== 'in' && offm.after.anim !== 'fish' && !offm.after.node), '(v4.3 sea) 줍기 off: he fishes while it is held; let go -> he reels in and stands (no endless fishing loop)', offm);
    // ---------------- 4. the soak: nobody else on the deck, nobody stuck at the gangway foot
    const soak = await page.evaluate(() => {
      const gs = window.__FV.scene, D = gs.deck, pr = gs.progress, p = gs.player;
      // the fish porters (raw: crate -> grill, goods: grill -> shelf) and the cook
      for (const id of ['op_grill', 'raw_grill', 'porter_grill']) { if (pr.done[id]) continue; pr.done[id] = true; const pad = pr.pads[id]; if (pad) { pad.destroy(); delete pr.pads[id]; } const st = (window.__FV.STEPS || []).find((q) => q.id === id); if (st) pr.applyStep(st, true); }
      const bad = {}, stuck = {}, last = new Map(), onLanding = {};
      const reel = D.gather, grill = gs.stations.grill.op;
      let leg = 0;
      for (let s = 0; s < 180 * 5; s++) {
        // the chief walks between the reel spot and the grill's work spot (through the crowd at the gangway foot)
        const tg = leg % 2 ? reel : grill;
        const dx = tg.x - p.x, dy = tg.y - p.y, d = Math.hypot(dx, dy * 2);
        if (d < 20) { leg++; window.__FV.setInput(0, 0); } else window.__FV.setInput(dx / Math.hypot(dx, dy), dy / Math.hypot(dx, dy));
        window.__step.run(0.2);
        const all = [p].concat(gs.agents || []);
        for (const a of all) {
          if (!a || a.alive === false) continue;
          const isFisher = a.type === 'fisherman';
          // ((v4.3 sea) the chief on his own landing (it reaches over the surf) is where he should be; nobody else ever there
          const mine = a === p && gs.collision.inLand(a.x, a.y);
          if (!isFisher && !mine && (window.__onDeck(a.x, a.y) || window.__onGang(a.x, a.y) || window.__onWater(a.x, a.y))) { const k = (a.key || a.constructor.name) + ':' + (a.role || a.type || ''); bad[k] = (bad[k] || 0) + 1; }
          // ((review SEA-BAND) the land polygon's land side overlaps everyone's ground by a 14 px band (a seamless step on
          //  for him): only the part beyond the shore's walk line is his alone
          if (a !== p && gs.collision.inLand(a.x, a.y) && gs.collision.offLand(a.x, a.y)) { const k = (a.key || a.constructor.name) + ':' + (a.role || a.type || ''); onLanding[k] = (onLanding[k] || 0) + 1; }
          if (isFisher && !(a.dk && a.dk.st === 'sit')) { const k = 'fisher' + a.index; stuck[k] = (stuck[k] || 0) + 1; }
          // a porter standing in the same place long: counted per 0.2 s step
          if (a.role === 'porter' || a.role === 'raw') { const q = last.get(a) || { x: a.x, y: a.y, n: 0 }; if (Math.hypot(a.x - q.x, a.y - q.y) < 1 && Math.hypot(a.x - D.foot.x, (a.y - D.foot.y) * 2) < 160) q.n++; else { q.n = 0; q.x = a.x; q.y = a.y; } last.set(a, q); }
        }
      }
      window.__FV.setInput(0, 0);
      let maxStill = 0; for (const q of last.values()) maxStill = Math.max(maxStill, q.n);
      return { bad, stuck, onLanding, maxStillNearFoot: +(maxStill * 0.2).toFixed(1), raw: gs.rawPorters.length, legs: leg, crate: gs.piles.fish.count, grillIn: gs.stations.grill.inStack.count };
    });
    ok(Object.keys(soak.bad).length === 0, 'a 3-minute soak: nobody but the fishers is ever on the deck, the gangway or the water (the chief only on his landing)', soak.bad);
    ok(Object.keys(soak.onLanding).length === 0, '(v4.3 sea) nobody but the chief ever on his landing or the snow between it and the walk line', soak.onLanding);
    ok(Object.keys(soak.stuck).length === 0, 'the fishers stay on their stools', soak.stuck);
    // the three looks on the deck, seated (the workers page has come by now)
    for (let k = 0; k < 30; k++) { const done = await page.evaluate(() => { window.__step.frame(); const A = window.__FV.assets(); return ['fisherman_b', 'fisherman_c'].every((q) => A.charReady(q)); }); if (done) break; await sleep(500); }
    await advance(page, 2);
    const looks = await page.evaluate(() => { const gs = window.__FV.scene; return gs.workers.filter((w) => w.type === 'fisherman').map((w) => ({ key: w.key, anim: w.animName, res: w.animRes, has: window.__FV.game.anims.exists(w.key + ':' + w.animRes + ':NE') })); });
    ok(new Set(looks.map((q) => q.key)).size === 3 && looks.every((q) => /^fsit_/.test(q.res) && q.has), 'the three looks sit and fish with their own seated anims', looks);
    ok(soak.raw >= 1 && soak.maxStillNearFoot < 20 && soak.legs >= 8, `the crowd at the gangway foot moves (the chief ${soak.legs} legs, a porter stood still at most ${soak.maxStillNearFoot} s near the foot)`, soak);
    await shot(page, 'soak');
    errors.push(...log.errors);
    ok(log.errors.length === 0, 'new game: 0 page errors', log.errors.slice(0, 3));
  }
  // ================================================================== 5. old saves
  console.log('— old saves');
  for (const f of !want('old') ? [] : ['v35_save_21min.json', 'v41_save_smart_25min.json', 'v41_save_smart_46min.json', 'v42_village_late.json', 'v42_save_office_ttal.json']) {
    const txt = fx(f);
    const sv = JSON.parse(txt);
    const { page, ctx, log } = await boot(txt, { width: 390, height: 844 });
    await page.evaluate(GEO);
    // (what the crate held the moment it was restored; 0 when the save had no fish pile)
    const crate0 = await page.evaluate(() => (window.__pileAt.fish ? window.__pileAt.fish.count : 0));
    await advance(page, 2);
    const s = await page.evaluate(() => {
      const gs = window.__FV.scene, D = gs.deck, O = gs.v42 && gs.v42.office, so = gs.sites.v42_office;
      const ws = gs.workers.filter((w) => w.type === 'fisherman');
      // buildings: footprint circles of every finished building / hut must not overlap (same metric as the plots)
      const blds = [];
      for (const id in gs.sites) { const st = gs.sites[id]; if (st.state !== 'plot') blds.push({ id, x: st.x, y: st.y, r: ((st.def.footprint || [272])[0]) * 0.3 }); }
      if (O && O.hut) blds.push({ id: 'hut', x: O.hut.x, y: O.hut.y, r: 371 * 0.3 });
      const over = [];
      for (let i = 0; i < blds.length; i++) for (let j = i + 1; j < blds.length; j++) { const a = blds[i], b = blds[j]; if (Math.hypot(a.x - b.x, (a.y - b.y) * 2) < a.r + b.r) over.push(a.id + '/' + b.id); }
      return { coins: gs.economy.coins, fishers: ws.length, seated: ws.filter((w) => w.dk && w.dk.st === 'sit' && window.__onDeck(w.x, w.y)).length, tier: D.tier,
        crate: gs.piles.fish.count, crateShown: gs.piles.fish.shown, hut: !!(O && O.hut), office: !!(O && O.building), officeSite: so ? so.state : null,
        officeXY: O && O.building ? [O.building.x, O.building.y] : null, over, workers: gs.workers.length, porters: gs.porters.length, raw: gs.rawPorters.length };
    });
    const hired = ['hire_fisherman', 'hire2_fisherman', 'hire3_fisherman'].filter((k) => sv.progress && sv.progress.done && sv.progress.done[k]).length;
    const savedPile = (sv.labour && sv.labour.piles && sv.labour.piles.fish) || 0;
    const hasOffice = !!(sv.sites && sv.sites.v42_office);
    ok(s.coins === sv.coins, `${f}: coins kept (${s.coins})`, { saved: sv.coins, now: s.coins });
    ok(s.fishers === hired && s.seated === hired && s.tier === Math.max(1, hired), `${f}: ${hired} fishermen sit on the stools, the deck is ${Math.max(1, hired)}단`, s);
    ok(crate0 === Math.min(savedPile, 80) && (savedPile === 0 || s.crateShown), `${f}: the fish pile (${savedPile}) is now the crate on land`, { saved: savedPile, crate: crate0 });
    ok(hasOffice ? (!s.hut && (s.office || s.officeSite !== 'plot') && (!s.office || (s.officeXY[0] === 600 && s.officeXY[1] === 640))) : (s.hut && s.officeSite === 'plot'),
      `${f}: ${hasOffice ? 'its office (' + sv.sites.v42_office.st + ') stands on the moved plot (600, 640)' : 'the village gets the hut'}`, s);
    ok(s.over.length === 0, `${f}: no building overlaps another`, s.over);
    // a save / reload round: the deck comes back the same
    // (the save puts the fish in the fish porters' hands back on the crate: crate ≤ saved ≤ crate + carried)
    const back = await page.evaluate(() => {
      const gs = window.__FV.scene, pl = gs.piles.fish; const n = pl.count + pl.stack.incoming;
      let carried = 0; for (const r of gs.rawPorters) if (r.pile === pl) carried += r.stack.countOf('item_fish_raw') + r.stack.incoming;
      window.__FV.save(); return { sv: JSON.parse(localStorage.getItem('frostVillage.save.v1')), n, carried };
    });
    const bf = (back.sv.labour && back.sv.labour.piles && back.sv.labour.piles.fish) || 0;
    ok(back.sv.v === 8 && bf >= back.n && bf <= back.n + back.carried, `${f}: saved again as v8, the crate's fish saved (${bf})`, { v: back.sv.v, fish: bf, crate: back.n, carried: back.carried });
    if (f === 'v42_village_late.json') await shot(page, 'late');
    errors.push(...log.errors);
    ok(log.errors.length === 0, `${f}: 0 page errors`, log.errors.slice(0, 3));
    await ctx.close();
  }
  // ((review CD-1) a 4.2 chief saved where the hut stands now (the 관망 rest spot by the old beach fire, 580, 630): he
  //  comes out to the yard and walks, never stuck in the hut's walls
  if (want('old')) {
    const sv = JSON.parse(fx('v41_save_smart_46min.json'));
    sv.player = Object.assign({}, sv.player || {}, { x: 580, y: 630, stack: [] });
    const { page, ctx, log } = await boot(JSON.stringify(sv), { width: 390, height: 844 });
    const r = await page.evaluate(() => {
      const gs = window.__FV.scene, p = gs.player, C = gs.collision, O = gs.v42.office;
      const s0 = { x: Math.round(p.x), y: Math.round(p.y), blocked: C.blocked(p.x, p.y, 16), hut: !!(O && O.hut) };
      const moved = [];
      for (const [ix, iy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x0 = p.x, y0 = p.y;
        window.__FV.setInput(ix, iy); window.__step.run(1.0); window.__FV.setInput(0, 0); window.__step.run(0.1);
        moved.push(Math.round(Math.hypot(p.x - x0, p.y - y0)));
      }
      return { s0, moved };
    });
    ok(r.s0.hut && !r.s0.blocked && Math.hypot(r.s0.x - 580, (r.s0.y - 630) * 2) > 150 && r.moved.filter((m) => m > 40).length >= 3,
      'an old chief saved inside the hut\'s walls (580, 630) comes out to the yard and walks', r);
    errors.push(...log.errors);
    await ctx.close();
  }
  // ((v4.3 verify CM-1) a chief saved on his landing (autosave / app pause while he fishes) reloads on it: CD-1's unstick
  //  check knows his own ground (it moved him 36 px off the planks, beyond his reach, before)
  if (want('old')) {
    const sv = JSON.parse(fx('v41_save_smart_46min.json'));
    const W = (await import(new URL('../../src/data/world.js', import.meta.url).href)).WORLD;
    const reel = W.deck.reel;
    for (const pos of [reel, [W.deck.landing.at[0], W.deck.landing.at[1] + 10]]) {
      sv.player = Object.assign({}, sv.player || {}, { x: pos[0], y: pos[1], stack: [] });
      const { page, ctx, log } = await boot(JSON.stringify(sv), { width: 390, height: 844 });
      const r = await page.evaluate(() => { const gs = window.__FV.scene, p = gs.player, D = gs.deck; return { at: [Math.round(p.x), Math.round(p.y)], onPlanks: D.onPlanks(p.x, p.y), reach: Math.round(Math.hypot(p.x - D.gather.x, (p.y - D.gather.y) * 2)) }; });
      ok(r.onPlanks && Math.abs(r.at[0] - pos[0]) <= 2 && Math.abs(r.at[1] - pos[1]) <= 2 && r.reach < 55, `(v4.3 verify CM-1) a chief saved on his landing (${pos}) reloads there, on the planks within his reach`, r);
      errors.push(...log.errors);
      await ctx.close();
    }
  }
  // ================================================================== 6. the office replaces the hut (replace mode)
  console.log('— the office plot: hut → office');
  if (want('office')) {
    const { page, ctx, log } = await boot(fx('v41_save_smart_46min.json'));
    const a = await page.evaluate(() => {
      const gs = window.__FV.scene, so = gs.sites.v42_office, O = gs.v42.office;
      so.setShown(true);
      const coins = gs.economy.coins;
      gs.economy.add(5000);
      const okB = gs.tryBuild(so, 'chief_office');
      window.__step.run(0.5);
      return { okB, state: so.state, hut: !!O.hut, imgVis: !!(so.img && so.img.visible), drop: [so.dropX, so.dropY], coins };
    });
    ok(a.okB && a.state === 'foundation' && a.hut && !a.imgVis, 'the office is chosen: a foundation on the plot, the hut still stands (no foundation picture over it)', a);
    const sv1 = await page.evaluate(() => { window.__FV.save(); return localStorage.getItem('frostVillage.save.v1'); });
    await ctx.close();
    const { page: p2, ctx: c2, log: l2 } = await boot(sv1);
    const b = await p2.evaluate(() => { const gs = window.__FV.scene, so = gs.sites.v42_office, O = gs.v42.office; return { state: so.state, hut: !!O.hut, imgVis: !!(so.img && so.img.visible) }; });
    ok(b.state === 'foundation' && b.hut && !b.imgVis, 'a reload mid-site: the foundation and the hut come back', b);
    const c = await p2.evaluate(() => {
      const gs = window.__FV.scene, so = gs.sites.v42_office, O = gs.v42.office;
      for (const m in so.need) for (let i = so.stock.countOf(m); i < so.need[m]; i++) so.stock.push(m, null, gs.effects);
      window.__step.run(0.5);
      const mid = { state: so.state, hut: !!O.hut };
      for (let i = 0; i < 40 && so.state !== 'done'; i++) { so.buildT = so.buildTime; window.__step.run(0.5); }
      window.__step.run(2);
      return { mid, state: so.state, hut: !!O.hut, office: !!O.building, xy: O.building ? [O.building.x, O.building.y] : null };
    });
    ok(c.mid.state === 'scaffold' && !c.mid.hut, 'the scaffold goes up: the hut is taken down', c.mid);
    ok(c.state === 'done' && c.office && c.xy[0] === 600 && c.xy[1] === 640 && !c.hut, 'the office finished on the hut\'s plot', c);
    await shot(p2, 'office');
    errors.push(...log.errors, ...l2.errors);
    ok(log.errors.length + l2.errors.length === 0, 'office: 0 page errors', l2.errors.slice(0, 3));
    await c2.close();
  }
  // ================================================================== 7. the first houses
  console.log('— the first houses');
  if (want('houses')) {
    const { page, ctx, log } = await boot(null);
    await page.evaluate(GEO);
    const h = await page.evaluate(() => {
      const gs = window.__FV.scene, pr = gs.progress;
      const shownBefore = gs.sites.h43_1.shown;
      for (const id of ['hire_clerk_market', 'op_grill', 'hire_fisherman', 'zone_forest']) { pr.done[id] = true; const pad = pr.pads[id]; if (pad) { pad.destroy(); delete pr.pads[id]; } const st = (window.__FV.STEPS || []).find((q) => q.id === id); if (st) pr.applyStep(st, true); }
      pr.flags.firstSale = true;
      gs.refreshSites();
      window.__step.run(1.5);
      const ch = (id) => gs.buildChoices(gs.sites[id]).map((q) => ({ key: q.key, locked: q.locked, coins: q.cost.coins, plank: q.cost.item_plank }));
      const goals = (window.__FV.GOALS || []).map((g) => g.id);
      return { shownBefore, shown: [gs.sites.h43_1.shown, gs.sites.h43_2.shown], c1: ch('h43_1'), c2: ch('h43_2'), miner: pr.isDone('hire_miner') };
    });
    ok(!h.shownBefore && h.shown.every(Boolean), 'the first houses\' plots open with the forest', h);
    ok(h.c1.length === 1 && h.c1[0].key === 'house_c' && !h.c1[0].locked && h.c1[0].coins === 80 && h.c1[0].plank === 4, 'h43_1: 뾰족집 for 80 + 4 planks, open before the miner', h.c1);
    ok(h.c2.length === 1 && h.c2[0].key === 'house_a' && !h.c2[0].locked && h.c2[0].coins === 160 && h.c2[0].plank === 6, 'h43_2: 통나무집 for 160 + 6 planks', h.c2);
    const b = await page.evaluate(() => {
      const gs = window.__FV.scene, st = gs.sites.h43_1;
      gs.economy.add(200);
      const tents = ['tent43_1', 'tent43_3'].map((k) => gs.decorById[k]);
      const before = tents.map((im) => im.visible);
      const okB = gs.tryBuild(st, 'house_c');
      for (let i = 0; i < 4; i++) st.stock.push('item_plank', null, gs.effects);
      window.__step.run(0.5);
      for (let i = 0; i < 40 && st.state !== 'done'; i++) { st.buildT = st.buildTime; window.__step.run(0.5); }
      window.__step.run(3);
      const fam = ['npc_aunt', 'npc_kid_girl'].map((k) => { const r = gs.life.byKey[k]; return r ? { k, job: r.job && r.job.kind, house: !!(r.job && r.job.house) } : null; });
      return { okB, state: st.state, before, after: tents.map((im) => im.visible), fam, popCap: gs.popCap() };
    });
    ok(b.okB && b.state === 'done', 'h43_1 built', b);
    ok(b.before.every(Boolean) && b.after.every((v) => !v), 'its two tents are folded away', b);
    ok(b.fam.filter((q) => q && q.job === 'arrive' && q.house).length >= 1, 'the tent family walks to the new house', b.fam);
    const goal = await page.evaluate(async () => { const m = await import(new URL('src/systems/Progression.js', location.href).href); return m.GOALS.some((g) => /^h43_|^house_/.test(g.id)) || m.STEPS.some((s) => /^h43_|^house_/.test(s.id)); });
    ok(!goal, 'the first houses are a side goal (never in GOALS / STEPS)');
    errors.push(...log.errors);
    ok(log.errors.length === 0, 'houses: 0 page errors', log.errors.slice(0, 3));
    await ctx.close();
  }
} catch (e) {
  fail++;
  console.log('  FAIL exception', e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e);
}
console.log(`\n${pass} passed, ${fail} failed  (wall ${((Date.now() - t0) / 1000) | 0}s)`);
await browser.close();
await srv.close();
process.exit(fail ? 1 : 0);
