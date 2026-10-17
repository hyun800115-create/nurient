// Geumbangfolk (CONTRACT_GEUMBANG AP: the 금방 crew) tests.
//   nice -n 10 node tools/test/geumbangfolk_phaser.mjs                      headless Chromium + Phaser 3.90 (WebGL), phone 390 x 844 @ DPR 3
//   nice -n 10 node tools/test/geumbangfolk_phaser.mjs --parity [cases]     Python <-> JS compositor parity + game runtime parity (no browser)
//   nice -n 10 node tools/test/geumbangfolk_phaser.mjs --jsgen               JS generator: presets keep their promises (no browser)
//
// Phaser mode (720 logical px wide like src/main.js, k = 1.65 on a 390 px DPR 3 phone), every run next to the existing
// sets (townfolk + officefolk = the v4.3 merge, the logistics centre art, the 금방 van / parcels / nameplate from
// assets/geumbang, a townfolk house):
//   z06 / z10 / z12   by day, camera zoom 0.6 / 1.0 / 1.2 (x k): the logistics centre revealed ('cut' state) with the hub
//                     crew on its staffPoints (clerk scan behind the counter + the documented hub lift, packers tape_box on
//                     a game-drawn gb_parcel_m at tapePoint, pickers sort_parcel at the racks, the dockhand carry_parcel),
//                     the 금방 van at dock 1, a driver walking van <-> house with carry_parcel {noItems} + the game's own
//                     gb_parcel_m at boxPoint (depth rule), a driver ring_doorbell NE at house_a's doorPoint (bell flash at
//                     bellPoint on impactFrame), a driver hand_parcel to a resident, the 7 presets in a labelled row,
//                     officefolk's depot_worker + random v4 townsfolk next to them.
//   night             z 1.0 with the game's MULTIPLY night tint + ADD glows (van lights, the centre lamp).
//   road              only the 'road' page resident (gbPages.scenes.road): the hub anims fall back (idle) per pageNeeded,
//                     while carry_parcel / ring_doorbell / hand_parcel, the cap and the jacket / vest in the v4 anims draw.
//   all               every fragment present (townfolk2 + beachfolk + cityfolk + officefolk) + geumbangfolk.
// Audits every frame of every anim each staged person can play (and the runtime can show): core head / face / brow
// frames must exist, every layer atlas must be a loaded texture; counts draw calls, texture binds, page errors, 404s.
// Writes docs/previews/gbf_phone_{z06,z10,z12,night,road,all}.png + /tmp/fv_cache/geumbangfolk/review/gbf_phaser.json.
//
// Parity mode: recomputes every Python draw list dumped by `gbf_check.py --dump` (500 seeded people x 4 anims ->
// pickAnim, dir incl. mirrors, frame, face, noItems) with Geumbangfolk.layers / pickAnim / canPlay / points / pageNeeded
// (frame names, order, z, tints, atlas of every layer).  Then the GAME runtime src/core/Townfolk.js TF on the same merged
// block: (a) as shipped (v4 anims only), (b) patched with installGeumbangfolkRuntime(TF): every case, crew anims
// included, must give the identical draw list (z, order, frame, tint, atlas, flip, sx, dx, dy, head) incl. face override
// / noItems; plus TF.person(rng, preset) == Geumbangfolk.preset(preset, rng) for 500 seeded crew.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSETS = process.env.GBF_ASSETS || path.join(ROOT, 'assets');
const OUT = '/tmp/fv_cache/geumbangfolk/review';
const ALL = ['townfolk2', 'beachfolk', 'cityfolk', 'officefolk'].filter((f) => fs.existsSync(path.join(ASSETS, f, 'manifest.json')));
const V43 = ['officefolk'].filter((f) => fs.existsSync(path.join(ASSETS, f, 'manifest.json')));
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ASSETS, f, 'manifest.json'), 'utf8'));
const CREW = ['carry_parcel', 'ring_doorbell', 'hand_parcel', 'scan', 'sort_parcel', 'tape_box'];
const V4 = ['idle', 'walk', 'talk', 'wave', 'happy'];
const PRESETS = ['gb_driver', 'gb_picker', 'gb_packer', 'gb_sorter', 'gb_dispatcher', 'gb_rider', 'gb_night'];
const MUST = { gb_driver: ['top_gb_jacket', 'hat_gb_cap', 'bot_pants', 'shoe_boots'], gb_picker: ['top_parka', 'det_gb_vest', 'hat_beanie'],
  gb_packer: ['top_sweater', 'det_gb_vest', 'hat_beanie'], gb_sorter: ['top_parka', 'det_gb_vest', 'hat_gb_cap'],
  gb_dispatcher: ['top_gb_jacket', 'acc_glasses'], gb_rider: ['top_gb_jacket', 'acc_scarf', 'hat_beanie'],
  gb_night: ['top_gb_jacket', 'hat_gb_cap', 'bot_pants', 'shoe_boots'] };

async function parity(casesPath) {
  const { mergeGeumbangfolk, Geumbangfolk, installGeumbangfolkRuntime } = await import('../geumbangfolk_compose.js');
  const { mulberry32 } = await import('../townfolk_compose.js');
  const data = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  const frags = data.fragments.filter((f) => f !== 'townfolk');
  const M = mergeGeumbangfolk(rd('townfolk'), ...frags.map(rd));
  const gb = new Geumbangfolk(M.townfolk);
  const fragOf = M.townfolk.animFragment || {};
  const { TF } = await import('../../src/core/Townfolk.js');
  TF.T = null; TF.init(M, null);
  const hex = (t) => (t == null ? null : '#' + t.toString(16).padStart(6, '0').toUpperCase());
  const close = (a, b) => {
    if ((a == null) !== (b == null)) return false;
    if (a == null) return true;
    const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    for (let s = 0; s < 24; s += 8) if (Math.abs(((x >> s) & 255) - ((y >> s) & 255)) > 1) return false;
    return true;
  };
  let bad = 0, n = 0, badPick = 0, badPts = 0, badPage = 0, game = 0, gameBad = 0, gameAtlas = 0, crewCases = 0, noItemCases = 0;
  for (const c of data.cases) {
    const p = data.persons[c.p];
    n++;
    if (CREW.includes(c.pick)) crewCases++;
    if (c.noItems) noItemCases++;
    const pick = gb.pickAnim(p, c.anim);
    if (pick.anim !== c.pick || (pick.face || null) !== (c.face || null)) { badPick++; if (badPick < 4) console.log('PICK', c.anim, pick, c.pick, c.face); }
    for (const [x, v] of Object.entries(c.canPlay)) if (gb.canPlay(p, x) !== v) { badPick++; if (badPick < 4) console.log('CANPLAY', x, v, p.parts); }
    const js = gb.layers(p, c.pick, c.dir, c.i, { face: c.face, noItems: c.noItems });
    const A = js.map((l) => [l.z, l.frame, hex(l.tint), l.atlas || null]);
    const B = c.layers;
    let ok = A.length === B.length;
    for (let k = 0; ok && k < A.length; k++) {
      if (A[k][0] !== B[k][0] || A[k][1] !== B[k][1] || A[k][3] !== B[k][3] || !close(A[k][2], B[k][2])) ok = false;
    }
    if (!ok) { bad++; if (bad <= 4) console.log('MISMATCH', JSON.stringify(c).slice(0, 300), '\n js', JSON.stringify(A).slice(0, 500)); }
    const pts = { box: ['carry_parcel', 'ring_doorbell'].includes(c.pick) ? gb.parcelPoint(p, c.pick, c.dir, c.i) : null,
      hand: ['hand_parcel', 'sort_parcel'].includes(c.pick) ? gb.handPointOf(p, c.pick, c.dir, c.i) : null,
      bell: c.pick === 'ring_doorbell' ? gb.bellPoint(p, c.dir, c.i) : null,
      beam: c.pick === 'scan' ? gb.beamPoint(p, c.dir, c.i) : null,
      tape: c.pick === 'tape_box' ? gb.tapePoint(p, c.dir, c.i) : null,
      speed: c.pick === 'carry_parcel' ? gb.groundSpeed(p, c.pick, c.dir) : null };
    if (JSON.stringify(pts) !== JSON.stringify(c.points)) { badPts++; if (badPts < 4) console.log('POINTS', JSON.stringify(pts), JSON.stringify(c.points)); }
    if ((gb.pageNeeded(p, c.pick) ?? null) !== (c.page ?? null) || (gb.pageOf(c.pick) ?? null) !== (c.pageOf ?? null)) {
      badPage++; if (badPage < 4) console.log('PAGE', c.pick, gb.pageNeeded(p, c.pick), c.page, gb.pageOf(c.pick), c.pageOf);
    }
    // (a) the game runtime as shipped, on the game's own (v4 townfolk) anims
    if ((fragOf[c.pick] || 'townfolk') === 'townfolk') {
      game++;
      const buf = [];
      const cnt = TF.layersInto(JSON.parse(JSON.stringify(p)), c.pick, c.dir, c.i, buf);
      const G = buf.slice(0, cnt).map((l) => [l.z, l.frame, hex(l.tint), l.atlas || null]);
      const J = gb.layers(p, c.pick, c.dir, c.i).map((l) => [l.z, l.frame, hex(l.tint), l.atlas || null]);
      let g = G.length === J.length;
      for (let k = 0; g && k < G.length; k++) if (G[k][0] !== J[k][0] || G[k][1] !== J[k][1] || !close(G[k][2], J[k][2])) g = false;
      if (!g) { gameBad++; if (gameBad < 4) console.log('GAME', c.pick, p.parts.join(','), '\n game', JSON.stringify(G).slice(0, 400), '\n js', JSON.stringify(J).slice(0, 400)); }
      for (let k = 0; g && k < G.length; k++) if (G[k][3] !== J[k][3]) { gameAtlas++; break; }
    }
  }
  // (b) the game runtime patched with installGeumbangfolkRuntime: every case, crew anims included, atlases included
  const personV4 = TF.person;
  const gbRT = installGeumbangfolkRuntime(TF);
  let pCases = 0, pBad = 0, pCrew = 0;
  const buf = [];
  const key = (l) => [l.z, l.order, l.frame, l.tint == null ? null : l.tint, l.atlas || null, !!l.flip, l.sx, l.dx, l.dy, !!l.head].join('|');
  for (const c of data.cases) {
    const p = data.persons[c.p];
    const opts = { face: c.face, noItems: c.noItems };
    const cnt = TF.layersInto(JSON.parse(JSON.stringify(p)), c.pick, c.dir, c.i, buf, opts);
    const G = buf.slice(0, cnt).map(key), J = gb.layers(p, c.pick, c.dir, c.i, opts).map(key);
    pCases++; if (CREW.includes(c.pick)) pCrew++;
    if (G.length !== J.length || G.some((x, k) => x !== J[k])) { pBad++; if (pBad < 4) console.log('PATCHED', c.pick, c.dir, c.i, '\n game', G.slice(0, 6), '\n js', J.slice(0, 6)); }
  }
  // TF.person (patched) == Geumbangfolk.preset for the 7 crew presets; TF.gb / TF.of wiring
  let gen = 0, genBad = 0;
  for (let k = 0; k < 500; k++) {
    const pr = PRESETS[k % PRESETS.length];
    const a = TF.person(mulberry32(3000 + k), pr), b = gb.preset(pr, mulberry32(3000 + k));
    gen++;
    if (JSON.stringify(a) !== JSON.stringify(b)) { genBad++; if (genBad < 3) console.log('PERSON', pr, JSON.stringify(a.parts), JSON.stringify(b.parts)); }
  }
  const unpatched = personV4.call(TF, mulberry32(7), 'gb_driver');
  const wired = TF.gb === gbRT && (!TF.of || TF.of === gbRT) && installGeumbangfolkRuntime(TF) === gbRT;
  const res = { fragments: data.fragments, cases: n, crewAnimCases: crewCases, noItemsCases: noItemCases, identical: n - bad,
    pickCanPlayMismatches: badPick, pointMismatches: badPts, pageMismatches: badPage,
    gameUnpatched: { oldAnimLists: game, listMismatches: gameBad, atlasDiffers: gameAtlas },
    gamePatched: { cases: pCases, crewAnimCases: pCrew, identical: pCases - pBad, mismatches: pBad,
      personParity: `${gen - genBad}/${gen}`, runtimeWired: wired, unpatchedDriverWearsJacket: unpatched.parts.includes('top_gb_jacket') } };
  console.log(JSON.stringify(res));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `gbf_parity_${frags.length > 1 ? 'all' : (frags.length ? 'v43' : 'bare')}.json`), JSON.stringify(res, null, 1));
  process.exit(bad || badPick || badPts || badPage || gameBad || pBad || genBad || !wired ? 1 : 0);
}

async function jsgen() {
  // JS generator: people made by Geumbangfolk.preset() in JS keep PROMISE (6 crew anims + idle / walk / talk / wave /
  // happy) and wear their uniform; every core head / face / brow frame of every frame they can play resolves; pickAnim
  // of random townsfolk is always playable and merged; bare (townfolk + geumbangfolk), v4.3 and all.
  const { mergeGeumbangfolk, Geumbangfolk } = await import('../geumbangfolk_compose.js');
  const { mulberry32 } = await import('../townfolk_compose.js');
  const results = [];
  let fail = 0;
  for (const frags of [['geumbangfolk'], [...V43, 'geumbangfolk'], [...ALL, 'geumbangfolk']]) {
    const M = mergeGeumbangfolk(rd('townfolk'), ...frags.map(rd));
    const have = {};
    for (const a of M.atlases) {
      const js = JSON.parse(fs.readFileSync(path.join(ASSETS, a.json), 'utf8'));
      const set = have[a.key] = new Set();
      for (const [pre, g] of Object.entries(js.frames)) for (const [grp, v] of Object.entries(g)) {
        if (v.some((x) => Array.isArray(x))) v.forEach((r, i) => { if (r) set.add(`${pre}/${grp}_${i}`); });
        else set.add(`${pre}/${grp}`);
      }
    }
    const gb = new Geumbangfolk(M.townfolk);
    const rng = mulberry32(2043);
    let people = 0, fails = 0, frames = 0, missCore = 0, missOther = 0, wear = 0; const ex = [];
    for (let k = 0; k < 80; k++) for (const pr of PRESETS) {
      const p = gb.preset(pr, rng); people++;
      for (const m of MUST[pr]) if (!p.parts.includes(m)) { wear++; if (ex.length < 5) ex.push(['wear', pr, m]); }
      for (const a of [...CREW, ...V4]) {
        if (!gb.canPlay(p, a)) { fails++; if (ex.length < 5) ex.push([pr, a, p.base, p.parts.join(',')]); continue; }
        const info = gb.T.anims[a];
        for (const d of info.dirs) for (let i = 0; i < info.frames; i++) for (const l of gb.layers(p, a, d, i)) {
          frames++;
          const ok = l.atlas && have[l.atlas] && have[l.atlas].has(l.frame);
          if (!ok) { if (/^(head\.|face\.|brow\.)/.test(l.layer)) missCore++; else missOther++; }
        }
      }
    }
    let rp = 0, badPick = 0; const cov = {};
    for (let k = 0; k < 3000; k++) {
      const p = gb.randomPerson(rng); rp++;
      for (const a of CREW) {
        const r = gb.pickAnim(p, a, { has: (x) => x !== 'carry_walk' });
        if (!gb.T.anims[r.anim] || !gb.canPlay(p, r.anim) || r.anim === 'carry_walk') badPick++;
        if (r.anim === a) cov[a] = (cov[a] || 0) + 1;
      }
    }
    const res = { fragments: ['townfolk', ...frags], presetPeople: people, promiseFails: fails, wearFails: wear, layerFramesChecked: frames,
      missingCore: missCore, missingOther: missOther, randomPeople: rp, unplayablePicks: badPick,
      randomCoveragePct: Object.fromEntries(CREW.map((a) => [a, +(100 * (cov[a] || 0) / rp).toFixed(1)])), ex };
    results.push(res);
    console.log(JSON.stringify(res));
    fail += fails + missCore + badPick + wear;     // missingOther: layers with no pixels on that frame (a far-side
                                                    // mitten / cuff behind the body: never packed, gbf_check verifies)
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'gbf_jsgen.json'), JSON.stringify(results, null, 1));
  process.exit(fail ? 1 : 0);
}

const HTML = (frags, zoom, mode, night) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:#dbe6f2;height:100%;overflow:hidden}#game{width:100%;height:100%}</style>
<script src="lib/phaser.min.js"></script></head><body><div id="game"></div><script type="module">
import { townfolkPreload, townfolkInstall, mulberry32 } from './tools/townfolk_compose.js';
import { mergeGeumbangfolk, Geumbangfolk, GeumbangfolkSprite } from './tools/geumbangfolk_compose.js';
const GL = window.__GLC = { draw: 0, binds: 0 };
for (const P of [WebGLRenderingContext.prototype, window.WebGL2RenderingContext && WebGL2RenderingContext.prototype]) {
  if (!P) continue;
  for (const m of ['drawElements', 'drawArrays']) { const o = P[m]; P[m] = function (...a) { GL.draw++; return o.apply(this, a); }; }
  const ob = P.bindTexture; P.bindTexture = function (...a) { GL.binds++; return ob.apply(this, a); };
}
const rd = async (f) => (await fetch('assets/' + f + '/manifest.json')).json();
const MODE = ${JSON.stringify(mode)}, ZOOM = ${zoom}, NIGHT = ${!!night};
const man = mergeGeumbangfolk(await rd('townfolk'), ...(await Promise.all(${JSON.stringify(frags)}.map(rd))));
const lgx = await rd('logistics'), gbm = await rd('geumbang'), bld = await rd('buildings');
const T = man.townfolk, GBP = T.gbPages, OFP = T.ofPages || { groups: {} };
const groups = Object.assign({}, OFP.groups, GBP.groups);
const resident = new Set(MODE === 'road' ? [...GBP.scenes.road, ...Object.keys(OFP.groups)] : Object.keys(groups));
if (MODE === 'road') { const keep = new Set([...resident].flatMap((g) => groups[g].atlases)); man.atlases = man.atlases.filter((a) => !a.key.startsWith('gbf_') || keep.has(a.key)); }
const W = 720, H = Math.round(720 * innerHeight / innerWidth);
const k = Math.round(Math.max(1, Math.min(2, innerWidth * devicePixelRatio / 720)) * 20) / 20;
window.__R = { ready: false, k, missing: [], emptyLayers: new Set(), checked: 0, fallbacks: [], staged: [], parcels: 0, flashes: 0 };
const LGX_ATLASES = ['lgx_center_a', 'lgx_center_b', 'lgx_center_c', 'lgx_center_d'];
class S extends Phaser.Scene {
  preload() {
    townfolkPreload(this, man, 'assets/');
    for (const a of lgx.atlases) if (LGX_ATLASES.includes(a.key)) this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const a of gbm.atlases) this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    for (const a of bld.atlases) if (a.key === 'bld_buildings_2') this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
  }
  create() {
    townfolkInstall(this, man);
    const R = window.__R, cam = this.cameras.main;
    const gb = this.gb = new Geumbangfolk(T);
    cam.setBackgroundColor('#eef3f9');
    const g = this.add.graphics().setDepth(-1e5);
    g.fillStyle(0xf4f7fb, 1); g.fillRect(-1600, -900, 3200, 3600);
    // a snowy road strip (the delivery route) between the centre and the houses
    g.fillStyle(0xd6cbbd, 1); g.fillPoints([{ x: -1300, y: 1010 }, { x: 900, y: -90 }, { x: 1010, y: -35 }, { x: -1190, y: 1065 }], true);
    // ---- the logistics centre, revealed ('cut' state), layers at depth Y0 + depthOffset, the 금방 nameplate replacing
    // the centre's (it fades with the shell: hidden in 'cut'), patches on their first frame
    const sp = lgx.sprites, C = sp.logistics_center, X0 = 0, Y0 = 0;
    const st = C.reveal.states.cut;
    const put = (s, x, y, d, fr) => this.add.image(x, y, s.atlas, fr || s.frame).setOrigin(s.anchor[0], s.anchor[1]).setDepth(d);
    for (const [n, key] of Object.entries(C.layers)) {
      if (n.startsWith('nameplate')) continue;
      const im = put(sp[key], X0, Y0, Y0 + sp[key].depthOffset);
      if (n in st) im.setAlpha(st[n]);
    }
    for (const [n, key] of Object.entries(C.patches)) { const im = put(sp[key], X0, Y0, Y0 + sp[key].depthOffset); if (n.startsWith('dock')) im.setAlpha(st.shell); }
    const np = gbm.sprites.gb_nameplate_ko; put(np, X0, Y0, Y0 + np.depthOffset).setAlpha(st.shell);
    for (const op of C.outdoorProps) { const s = sp[op.sprite]; if (s && this.textures.get(s.atlas).has(s.frame)) put(s, X0 + op.point[0], Y0 + op.point[1], Y0 + op.point[1]); }
    const flag = gbm.sprites.gb_flag; this.flag = put(flag, X0 - 330, Y0 + 210, Y0 + 210, flag.anims.wave.frames[0]); this.flag._fr = flag.anims.wave.frames;
    const sign = gbm.sprites.gb_sign; put(sign, X0 + 470, Y0 + 300, Y0 + 300, sign.states.day);
    if (NIGHT) put(sign, X0 + 470, Y0 + 300, Y0 + 300.001, sign.states.lit);
    // the 금방 van at dock 1 (SE idle) + its tail / head lights at night
    const van = gbm.characters.gb_van, vp = C.dockVehiclePoints.delivery_van[0];
    this.van = put({ atlas: van.atlas, anchor: van.anchor, frame: 'idle_SE_0' }, X0 + vp[0], Y0 + vp[1], Y0 + vp[1]);
    // a townfolk log cabin (house_a) down the road: doorPoint = in front of its door (front = screen down-left)
    const hs = bld.sprites.house_a, HX = -210, HY = 690;
    put(hs, HX, HY, HY);
    const rng = mulberry32(4343);
    this.npcs = []; this.parcels = []; this.flashes = [];
    const has = (a, p) => { const pg = p ? gb.pageNeeded(p, a) : gb.pageOf(a); return !pg || !groups[pg] || resident.has(pg); };
    const add = (p, anim, dir, x, y, opts = {}) => {
      const s = new GeumbangfolkSprite(this, gb, p, x, y);
      s.has = has;
      if (opts.noItems) s.noItems = true;
      s.play(anim, dir);
      if (s.anim !== anim) R.fallbacks.push((p.preset || 'random') + ' ' + anim + '->' + s.anim);
      if (opts.depthBase != null) s.depthBase = opts.depthBase;
      if (opts.frame != null) s.frame = opts.frame; else if (!opts.sync) s.frame = Math.floor(rng() * T.anims[s.anim].frames);
      s.refresh(true);
      s.label = opts.label && s.anim !== anim ? opts.label + ' -> ' + s.anim : opts.label;
      if (opts.label) s.text = this.add.text(x, y + 14, s.label, { fontFamily: 'sans-serif', fontSize: '11px', color: '#2b3a4e', align: 'center',
        backgroundColor: 'rgba(255,255,255,0.72)', padding: { x: 3, y: 1 }, resolution: 3 }).setOrigin(0.5, 0).setDepth(1e5);
      this.npcs.push(s); R.staged.push([p.preset || 'random', anim, s.anim, s.dir]);
      return s;
    };
    const parcelOf = (s, key = 'gb_parcel_m') => {
      const it = gbm.sprites[key];
      const im = this.add.image(0, 0, it.atlas, it.frame).setOrigin(it.anchor[0], it.anchor[1]).setScale(it.carryScale);
      s.parcel = { im, it }; this.parcels.push(s); return im;
    };
    // ---- the hub crew on the staffPoints (band 'mid' = between _interior_racks and _interior_front)
    const HB = T.hub || {}, places = HB.places || {};
    const mid = (y) => Y0 + C.bandDepth.mid + (y + 400) * 1e-6;
    const lift = (n, p) => (places['staff' + n] ? places['staff' + n].liftPx : 0);
    const role = { clerk: ['gb_dispatcher', 'scan'], packer: ['gb_packer', 'tape_box'], picker: ['gb_picker', 'sort_parcel'], dockhand: ['gb_sorter', 'carry_parcel'] };
    C.staffPoints.forEach((q, n) => {
      let [pr, a] = role[C.staffRoles[n]];
      if (places['staff' + n] && places['staff' + n].anim) a = places['staff' + n].anim;    // hub.places: what to play there
      const p = gb.preset(pr, rng), d = C.staffDirs[n];
      if (C.staffBands[n] === 'outside') {
        const s = add(p, a, d, X0 + q[0], Y0 + q[1], { noItems: true });
        parcelOf(s); return;
      }
      const s = add(p, a, d, X0 + q[0], Y0 + q[1] - lift(n, p), { depthBase: mid(q[1]) });
      if (a === 'tape_box' || a === 'scan') {
        // the game's parcel under the hub anim (bases.boxPoint.tape_box / .scan = [cx, cy, bx, by]): the 0.20 m box on
        // the packing table (gb_parcel_m) / the parcel on the counter (gb_parcel_s, 0.14 m); depth = worker + 0.005
        // (over the body, under the head / arms / tape gun / scanner), still under _interior_front (band mid)
        const it = gbm.sprites[a === 'scan' ? 'gb_parcel_s' : 'gb_parcel_m'], sc = (a === 'scan' ? 0.14 : 0.20) * 55.43 / it.topPx;
        s.box = this.add.image(0, 0, it.atlas, it.frame).setOrigin(it.anchor[0], it.anchor[1]).setScale(sc);
        s.boxed = true;
      }
      if (a === 'scan') s.beam = this.add.graphics().setDepth(1e5 - 2);
    });
    // ---- the road: a driver walking van -> house -> van with carry_parcel {noItems} + the game's gb_parcel_m at
    // boxPoint (depth +0.0045 S / SE / E, -0.0001 NE / N), groundSpeed px/s
    const door = [HX + hs.doorPoint[0], HY + hs.doorPoint[1]];
    const rear = [X0 + vp[0] + van.rearDoorPoint.SE[0] - 10, Y0 + vp[1] + van.rearDoorPoint.SE[1] + 40];
    const w = this.walker = add(gb.preset('gb_driver', rng), 'carry_parcel', 'SW', rear[0], rear[1], { noItems: true, label: 'gb_driver\\ncarry_parcel' });
    parcelOf(w); w.path = [rear, [door[0] + 70, door[1] + 30]]; w.leg = 0;
    // at the door: ring_doorbell NE (the bell flashes at bellPoint on impactFrame 2 / 3)
    const rb = add(gb.preset('gb_rider', rng), 'ring_doorbell', 'NE', door[0], door[1], { sync: true, label: 'gb_rider\\nring_doorbell' });
    rb.bell = true;
    // hand_parcel to a resident (the real gb_parcel_s between the palms on frames 0-2, on the doorstep afterwards)
    const hp = add(gb.preset('gb_night', rng), 'hand_parcel', 'E', HX + 60, HY + 120, { sync: true, label: 'gb_night\\nhand_parcel' });
    hp.give = true;
    add(gb.randomPerson(rng), 'talk', 'W', HX + 150, HY + 120);
    const ds = gbm.sprites.gb_parcel_doorstep; put(ds, door[0] - 24, door[1] - 6, door[1] - 6).setScale(0.6);
    // ---- the 7 presets in a labelled row (signature anims) + officefolk's depot_worker + random v4 townsfolk
    const row = [['gb_driver', 'carry_parcel', 'S'], ['gb_picker', 'sort_parcel', 'SE'], ['gb_packer', 'tape_box', 'SE'], ['gb_sorter', 'scan', 'SE'],
      ['gb_dispatcher', 'hand_parcel', 'SE'], ['gb_rider', 'wave', 'S'], ['gb_night', 'idle', 'SE']];
    row.forEach(([pr, a, d], i) => add(gb.preset(pr, rng), a, d, -270 + (i % 4) * 180 + (i >= 4 ? 90 : 0), 930 + (i >= 4 ? 150 : 0) + (i % 4) * 8, { label: pr + '\\n' + a, sync: true }));
    if (T.generator.presets.depot_worker) add(gb.preset('depot_worker', rng), 'idle', 'SE', 340, 1080, { label: 'depot_worker\\n(officefolk)' });
    for (let i = 0; i < 5; i++) add(gb.randomPerson(rng), i % 2 ? 'walk' : 'idle', ['SW', 'SE', 'S', 'E', 'W'][i], -300 + i * 150, 1250 + (i % 2) * 30);
    // ---- night: the game's MULTIPLY tint + ADD glows (van lights, the sign disc, the centre lamp)
    if (NIGHT) {
      const gt = this.textures.createCanvas('gb_glow', 64, 64), cx = gt.getContext();
      const gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,236,190,1)'); gr.addColorStop(1, 'rgba(255,236,190,0)');
      cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64); gt.refresh();
      const a = 0.45, C0 = 0x5a6aa8, mix = (ch) => Math.round(255 * (1 - a) + ch * a);
      this.add.image(-4000, -4000, '__WHITE').setOrigin(0, 0).setDisplaySize(9000, 9000).setDepth(1e6).setBlendMode(Phaser.BlendModes.MULTIPLY)
        .setTint((mix((C0 >> 16) & 255) << 16) | (mix((C0 >> 8) & 255) << 8) | mix(C0 & 255));
      for (const q of van.lightPoints.SE) this.add.image(X0 + vp[0] + q[0], Y0 + vp[1] + q[1], 'gb_glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(1e6 + 1).setScale(1.1).setAlpha(0.7);
      this.add.image(X0 + 470, Y0 + 300 - sign.topPx + 30, 'gb_glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(1e6 + 1).setScale(1.6).setAlpha(0.55);
      this.add.image(door[0] + 10, door[1] - 70, 'gb_glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(1e6 + 1).setScale(1.4).setAlpha(0.5);
    }
    // audit every frame of every anim these people can play (and the runtime can show)
    const tex = this.textures;
    let checked = 0;
    for (const s of this.npcs) {
      for (const [a, info] of Object.entries(T.anims)) {
        if (a === 'carry_walk' || !gb.canPlay(s.person, a) || !has(a, s.person)) continue;
        for (const d of info.dirs) for (let i = 0; i < info.frames; i++) {
          for (const l of gb.layers(s.person, a, d, i)) {
            checked++;
            const core = l.layer.startsWith('head.') || l.layer.startsWith('face.') || l.layer.startsWith('brow.');
            if (!l.atlas) { if (core) R.missing.push('no atlas ' + l.frame); else R.emptyLayers.add(l.layer); }
            else if (!tex.exists(l.atlas)) R.missing.push('no texture ' + l.atlas + ' for ' + l.frame);
            else if (!tex.get(l.atlas).has(l.frame)) { if (core) R.missing.push('missing core frame ' + l.frame); else R.emptyLayers.add(l.layer); }
          }
        }
      }
    }
    R.checked = checked;
    R.textures = man.atlases.length;
    let gbB = 0; for (const a of man.atlases) if (a.key.startsWith('gbf_') && tex.exists(a.key)) { const src = tex.get(a.key).source[0]; gbB += src.width * src.height * 4; }
    R.gbfMiB = +(gbB / 1048576).toFixed(2);
    const cy = MODE === 'road' ? 820 : NIGHT ? 600 : ZOOM < 0.9 ? 480 : ZOOM < 1.1 ? 330 : 10;
    cam.setZoom(ZOOM * k); cam.centerOn(ZOOM >= 1.1 && !NIGHT && MODE !== 'road' ? -60 : 0, cy);
    R.scene = this; R.ready = true;
  }
  update(t, dt) {
    const gb = this.gb, R = window.__R;
    this.ft = (this.ft || 0) + dt; if (this.ft > 125) { this.ft = 0; const f = this.flag; f._i = ((f._i || 0) + 1) % f._fr.length; f.setFrame(f._fr[f._i]); }
    const w = this.walker;
    if (w) {
      const a = w.path[w.leg], b = w.path[(w.leg + 1) % w.path.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      const dir = dx >= 0 ? (dy >= 0 ? 'SE' : 'NE') : (dy >= 0 ? 'SW' : 'NW');
      if (w.dir !== dir) w.play('carry_parcel', dir);
      const v = (gb.groundSpeed(w.person, w.anim, w.dir) || 40) * dt / 1000;
      w.s = (w.s || 0) + v;
      if (w.s >= L) { w.s -= L; w.leg = (w.leg + 1) % w.path.length; }
      const f = Math.min(1, w.s / L);
      w.setPosition(a[0] + dx * f, a[1] + dy * f);
      if (w.text) w.text.setPosition(w.x, w.y + 14);
    }
    for (const s of this.npcs) {
      s.update(dt);
      if (s.done) { s.wait = (s.wait || 0) + dt; if (s.wait > 900) { s.wait = 0; s.replay(); } }
      s.place();
      if (s.parcel) {
        const q = s.anim === 'carry_parcel' || s.anim === 'ring_doorbell' ? gb.parcelPoint(s.person, s.anim, s.dir, s.frame) : null;
        s.parcel.im.setVisible(!!q);
        if (q) {
          const d = s.dir.replace('W', 'E');
          s.parcel.im.setPosition(s.x + q[2], s.y + q[3]).setDepth(s.depthBase + (d === 'NE' || d === 'N' || d === 'NW' ? -0.0001 : 0.0045));
          R.parcels++;
        }
      }
      if (s.boxed) {
        const q = (s.anim === 'tape_box' || s.anim === 'scan') ? gb.parcelPoint(s.person, s.anim, s.dir, s.frame) : null;
        s.box.setVisible(!!q);
        if (q) { s.box.setPosition(s.x + q[2], s.y + q[3]).setDepth(s.depthBase + 0.005); R.parcels++; }
      }
      if (s.beam) {
        s.beam.clear();
        const q = s.anim === 'scan' ? gb.beamPoint(s.person, s.dir, s.frame) : null;
        if (q && s.frame === (gb.T.anims.scan.impactFrame ?? 2)) {
          s.beam.lineStyle(1.5, 0xff5a4a, 0.85); s.beam.lineBetween(s.x + q[0], s.y + q[1], s.x + q[2], s.y + q[3]);
          s.beam.fillStyle(0xff5a4a, 0.9); s.beam.fillCircle(s.x + q[2], s.y + q[3], 1.6); R.flashes++;
        }
      }
      if (s.bell && s.anim === 'ring_doorbell') {
        const imp = gb.T.anims.ring_doorbell.impactFrame ?? 2;
        if (!s.fx) s.fx = this.add.graphics().setDepth(1e5 - 1);
        s.fx.clear();
        const q = gb.bellPoint(s.person, s.dir, s.frame);
        if (q && (s.frame === imp || s.frame === imp + 1)) { s.fx.fillStyle(0xfff1a8, 0.9); s.fx.fillCircle(s.x + q[0], s.y + q[1], 4); s.fx.lineStyle(1, 0xf2b33d, 1); s.fx.strokeCircle(s.x + q[0], s.y + q[1], 7); R.flashes++; }
      }
      if (s.give && s.anim === 'hand_parcel') {
        if (!s.gp) { const it = gbm.sprites.gb_parcel_s; s.gp = this.add.image(0, 0, it.atlas, it.frame).setOrigin(0.5, 0.5).setScale(0.55); }
        const q = gb.handPointOf(s.person, 'hand_parcel', s.dir, s.frame);
        s.gp.setVisible(!!q && s.frame <= 2);
        if (q) s.gp.setPosition(s.x + q[0], s.y + q[1]).setDepth(s.depthBase + 0.0045);
      }
    }
  }
}
window.__R.game = new Phaser.Game({ type: Phaser.WEBGL, parent: 'game', width: Math.round(W * k), height: Math.round(H * k), backgroundColor: '#dbe6f2',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, render: { antialias: true, roundPixels: false }, scene: S, banner: false });
</script></body></html>`;

async function phaser() {
  const { start } = await import('./serve.mjs');
  const { launch, sleep } = await import('./pw.mjs');
  const srv = await start(0, { prefix: '/fv/' });
  const browser = await launch();
  const errors = [], notFound = [];
  const v43 = [...V43, 'geumbangfolk'];
  const runs = [['z06', v43, 0.6, 'hub', false], ['z10', v43, 1.0, 'hub', false], ['z12', v43, 1.2, 'hub', false],
    ['night', v43, 1.0, 'hub', true], ['road', v43, 1.0, 'road', false], ['all', [...ALL, 'geumbangfolk'], 1.0, 'hub', false]];
  const only = process.env.GBF_RUNS ? process.env.GBF_RUNS.split(',') : null;
  const results = [];
  const PREV = path.join(ROOT, 'docs', 'previews');
  fs.mkdirSync(PREV, { recursive: true });
  for (const [name, frags, zoom, mode, night] of runs) {
    if (only && !only.includes(name)) continue;
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const err0 = errors.length;
    page.on('pageerror', (e) => errors.push(name + ': ' + String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ': ' + m.text()); });
    page.on('response', (r) => { if (r.status() >= 400) notFound.push(r.url()); });
    await page.route(`**/fv/__gbf_${name}.html`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML(frags, zoom, mode, night) }));
    await page.goto(srv.url + `__gbf_${name}.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__R && (window.__R.ready || window.__R.failed), null, { timeout: 300000 });
    await sleep(1800);
    const res = await page.evaluate(async () => {
      const R = window.__R, g = R.game, C = window.__GLC, sc = R.scene;
      const d0 = C.draw, b0 = C.binds, f0 = g.loop.frame, t0 = performance.now();
      while (g.loop.frame - f0 < 30) await new Promise((r) => setTimeout(r, 10));
      const n = g.loop.frame - f0;
      const sprites = sc.children.list.filter((o) => o.visible && o.type === 'Image').length;
      return { npcs: sc.npcs.length, sprites, textures: R.textures, drawPerFrame: +((C.draw - d0) / n).toFixed(1),
        bindsPerFrame: +((C.binds - b0) / n).toFixed(1), msPerFrame: +((performance.now() - t0) / n).toFixed(1),
        layersChecked: R.checked, missing: R.missing.length, missingSample: R.missing.slice(0, 5), fallbacks: R.fallbacks,
        emptyLayers: [...R.emptyLayers].slice(0, 8), gbfTextureMiB: R.gbfMiB, k: R.k, zoom: sc.cameras.main.zoom,
        cssPerWorldPx: +(sc.cameras.main.zoom * 390 / (720 * R.k)).toFixed(3), parcelDraws: R.parcels, fxFlashes: R.flashes, staged: R.staged };
    });
    await page.evaluate(() => window.__R.game.loop.sleep());
    const file = path.join(PREV, `gbf_phone_${name}.png`);
    await page.screenshot({ path: file, timeout: 180000 });
    res.name = name; res.fragments = ['townfolk', ...frags]; res.night = night; res.file = path.relative(ROOT, file); res.errors = errors.length - err0;
    results.push(res);
    console.log(JSON.stringify({ ...res, staged: res.staged.length }));
    await ctx.close();
  }
  if (errors.length) console.log('ERRORS', errors.slice(0, 10));
  if (notFound.length) console.log('404', notFound.slice(0, 10));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'gbf_phaser.json'), JSON.stringify({ results, errors, notFound }, null, 1));
  await browser.close();
  await srv.close();
  process.exit(errors.length || notFound.length || results.some((r) => r.missing) ? 1 : 0);
}

const i = process.argv.indexOf('--parity');
if (i >= 0) await parity(process.argv[i + 1] || path.join(OUT, 'gbf_cases.json'));
else if (process.argv.includes('--jsgen')) await jsgen();
else await phaser();
