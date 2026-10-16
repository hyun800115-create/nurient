// Officefolk (CONTRACT_V42 AJ) tests.
//   node tools/test/officefolk_phaser.mjs                      headless Chromium + Phaser 3.90 (WebGL), phone 390 x 844 @ DPR 3
//   node tools/test/officefolk_phaser.mjs --parity [cases]     Python <-> JS compositor parity + game runtime parity (no browser)
//   node tools/test/officefolk_phaser.mjs --jsgen               JS generator: presets keep their promises (no browser)
//
// Phaser mode (5 page loads, 720 logical px wide like src/main.js, k = 1.65 on a 390 px DPR 3 phone):
//   z06 / z10 / z12   v4.2 merge (assets/townfolk + assets/officefolk via mergeOfficefolk(), every page loaded) next to
//                     the real office building (assets/office, revealed 'cut' state): the four clerks seated at
//                     deskPoints doing desk anims (band 'behind', under _interior_front), the board / cabinet / safe /
//                     door staff, outside a row of the 8 presets doing their signature anims (labelled), the courier
//                     walking a loop with carry_sack at groundSpeed, random v4 townsfolk walking / idling.  Camera zoom
//                     0.6 / 1.0 / 1.2 (x k).
//   plaza             v4.2 merge with ONLY the 'sack' page resident (ofPages.scenes.plaza): sprites get a {has}
//                     predicate (pageNeeded resident), so desk / errand anims fall back while carry_sack and the
//                     courier's / aide's idle / walk / talk (bell pin, bow, cuff sleeves) still draw.
//   all               every fragment present (townfolk2 + beachfolk + cityfolk) + officefolk: the same scene must load,
//                     resolve and draw (officefolk merges after them).
// Audits every frame of every anim each staged person can play (and the runtime can show): core head / face / brow
// frames must exist, every layer atlas must be a loaded texture; counts draw calls, texture binds, page errors, 404s.
// Writes docs/previews/officefolk_phone_{z06,z10,z12,plaza,all}.png + /tmp/fv_cache/officefolk/review/officefolk_phaser.json.
//
// Parity mode: recomputes every Python draw list dumped by `of_check.py --dump` (500 seeded people x 4 anims ->
// pickAnim, dir incl. mirrors, frame, face, noItems) with Officefolk.layers / pickAnim / canPlay / points / pageNeeded
// (frame names, order, z, tints, atlas of every layer).  Then the GAME runtime: src/core/Townfolk.js TF on the same
// merged block, (a) as shipped (v4 anims only: lists; atlases counted - TF reads frameAtlas only) and (b) patched with
// installOfficefolkRuntime(TF) (polish H1): every case, office anims included, must give the identical draw list
// (z, order, frame, tint, atlas, flip, sx, dx, dy) incl. face override / noItems; plus TF.person(rng, preset) ==
// Officefolk.preset(preset, rng) for 500 seeded staff (the 은행장's forced blazer).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSETS = process.env.OF_ASSETS || path.join(ROOT, 'assets');
const OUT = '/tmp/fv_cache/officefolk/review';
const ALL = ['townfolk2', 'beachfolk', 'cityfolk'].filter((f) => fs.existsSync(path.join(ASSETS, f, 'manifest.json')));
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ASSETS, f, 'manifest.json'), 'utf8'));
const PROMISE_ACTING = ['sit_idle', 'desk_type', 'desk_write', 'desk_phone', 'desk_read', 'desk_count', 'file', 'point_board',
  'stamp_stand', 'bow', 'note', 'hand_over', 'scoop'];
const V4 = ['idle', 'walk', 'talk', 'wave', 'happy'];      // (polish M1) every preset keeps wave / happy
const PROMISE = { office_a: [...PROMISE_ACTING, ...V4], office_b: [...PROMISE_ACTING, ...V4],
  secretary: [...PROMISE_ACTING, ...V4], courier: [...PROMISE_ACTING, 'carry_sack', ...V4],
  teller_a: [...PROMISE_ACTING, ...V4], teller_b: [...PROMISE_ACTING, ...V4],
  bank_manager: [...PROMISE_ACTING, ...V4], depot_worker: [...PROMISE_ACTING, ...V4] };

async function parity(casesPath) {
  const { mergeOfficefolk, Officefolk } = await import('../officefolk_compose.js');
  const data = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  const frags = data.fragments.filter((f) => f !== 'townfolk');
  const M = mergeOfficefolk(rd('townfolk'), ...frags.map(rd));
  const tf = new Officefolk(M.townfolk);
  const fragOf = M.townfolk.animFragment || {};
  // the game runtime (src/core/Townfolk.js): the shared TF on the same merged block
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
  let bad = 0, n = 0, badPick = 0, badPts = 0, badPage = 0, game = 0, gameBad = 0, gameAtlas = 0;
  const out = [];
  for (const c of data.cases) {
    const p = data.persons[c.p];
    n++;
    const pick = tf.pickAnim(p, c.anim);
    if (pick.anim !== c.pick || (pick.face || null) !== (c.face || null)) { badPick++; if (badPick < 4) console.log('PICK', c.anim, pick, c.pick, c.face); }
    for (const [x, v] of Object.entries(c.canPlay)) if (tf.canPlay(p, x) !== v) { badPick++; if (badPick < 4) console.log('CANPLAY', x, v, p.parts); }
    const js = tf.layers(p, c.pick, c.dir, c.i, { face: c.face, noItems: c.noItems });
    const A = js.map((l) => [l.z, l.frame, hex(l.tint), l.atlas || null]);
    const B = c.layers;
    let ok = A.length === B.length;
    for (let k = 0; ok && k < A.length; k++) {
      if (A[k][0] !== B[k][0] || A[k][1] !== B[k][1] || A[k][3] !== B[k][3] || !close(A[k][2], B[k][2])) ok = false;
    }
    if (!ok) { bad++; if (bad <= 4) console.log('MISMATCH', JSON.stringify(c).slice(0, 300), '\n js', JSON.stringify(A).slice(0, 500)); }
    const pts = { hand: c.pick === 'hand_over' ? tf.handPoint(p, c.dir, c.i) : null,
      impact: ['desk_write', 'stamp_stand'].includes(c.pick) ? tf.impactPoint(p, c.pick, c.dir) : null,
      sack: ['scoop', 'carry_sack'].includes(c.pick) ? tf.sackPoint(p, c.pick, c.dir, c.i) : null,
      tip: c.pick === 'point_board' ? tf.tipPoint(p, c.dir, c.i) : null,
      speed: c.pick === 'carry_sack' ? tf.groundSpeed(p, c.pick, c.dir) : null };
    if (JSON.stringify(pts) !== JSON.stringify(c.points)) { badPts++; if (badPts < 4) console.log('POINTS', JSON.stringify(pts), JSON.stringify(c.points)); }
    if ((tf.pageNeeded(p, c.pick) ?? null) !== (c.page ?? null) || (tf.pageOf(c.pick) ?? null) !== (c.pageOf ?? null)) {
      badPage++; if (badPage < 4) console.log('PAGE', c.pick, tf.pageNeeded(p, c.pick), c.page, tf.pageOf(c.pick), c.pageOf);
    }
    // game runtime parity on the game's own (v4 townfolk) anims: the officefolk anims need the fragment rules (anim
    // items, onlyAnims, anims lists), like the cityfolk / beachfolk ones
    if ((fragOf[c.pick] || 'townfolk') === 'townfolk') {
      game++;
      const buf = [];
      const cnt = TF.layersInto(JSON.parse(JSON.stringify(p)), c.pick, c.dir, c.i, buf);
      const G = buf.slice(0, cnt).map((l) => [l.z, l.frame, hex(l.tint), l.atlas || null]);
      const J = tf.layers(p, c.pick, c.dir, c.i).map((l) => [l.z, l.frame, hex(l.tint), l.atlas || null]);
      let g = G.length === J.length;
      for (let k = 0; g && k < G.length; k++) if (G[k][0] !== J[k][0] || G[k][1] !== J[k][1] || !close(G[k][2], J[k][2])) g = false;
      if (!g) { gameBad++; if (gameBad < 4) console.log('GAME', c.pick, p.parts.join(','), '\n game', JSON.stringify(G).slice(0, 400), '\n js', JSON.stringify(J).slice(0, 400)); }
      for (let k = 0; g && k < G.length; k++) if (G[k][3] !== J[k][3]) { gameAtlas++; out.push(`${J[k][1]} game ${G[k][3]} fragment ${J[k][3]}`); break; }
    }
  }
  // (b) the game runtime patched with installOfficefolkRuntime: every case, office anims included, atlases included
  const { installOfficefolkRuntime, applyForce } = await import('../officefolk_compose.js');
  const { mulberry32 } = await import('../townfolk_compose.js');
  const personV4 = TF.person;
  installOfficefolkRuntime(TF);
  let pCases = 0, pBad = 0, pOffice = 0;
  const buf = [];
  const key = (l) => [l.z, l.order, l.frame, l.tint == null ? null : l.tint, l.atlas || null, !!l.flip, l.sx, l.dx, l.dy, !!l.head].join('|');
  for (const c of data.cases) {
    const p = data.persons[c.p];
    const opts = { face: c.face, noItems: c.noItems };
    const cnt = TF.layersInto(JSON.parse(JSON.stringify(p)), c.pick, c.dir, c.i, buf, opts);
    const G = buf.slice(0, cnt).map(key), J = tf.layers(p, c.pick, c.dir, c.i, opts).map(key);
    pCases++; if ((M.townfolk.officefolkAnims || []).includes(c.pick)) pOffice++;
    if (G.length !== J.length || G.some((x, k) => x !== J[k])) { pBad++; if (pBad < 4) console.log('PATCHED', c.pick, c.dir, c.i, '\n game', G.slice(0, 6), '\n js', J.slice(0, 6)); }
  }
  // TF.person (patched) == Officefolk.preset for the 8 staff presets (force applied: the manager's blazer)
  let gen = 0, genBad = 0, forced = 0, managers = 0;
  const staff = ['office_a', 'office_b', 'secretary', 'courier', 'teller_a', 'teller_b', 'bank_manager', 'depot_worker'];
  for (let k = 0; k < 500; k++) {
    const pr = staff[k % staff.length];
    const a = TF.person(mulberry32(1000 + k), pr), b = tf.preset(pr, mulberry32(1000 + k));
    gen++;
    if (JSON.stringify(a) !== JSON.stringify(b)) { genBad++; if (genBad < 3) console.log('PERSON', pr, JSON.stringify(a.parts), JSON.stringify(b.parts)); }
    if (pr === 'bank_manager') { managers++; if (a.parts.includes('top_blazer')) forced++; }
  }
  const unforced = personV4.call(TF, mulberry32(7), 'bank_manager');
  const res = { fragments: data.fragments, cases: n, identical: n - bad, pickCanPlayMismatches: badPick, pointMismatches: badPts,
    pageMismatches: badPage,
    gameUnpatched: { oldAnimLists: game, listMismatches: gameBad, atlasDiffers: gameAtlas, atlasSample: out.slice(0, 3) },
    gamePatched: { cases: pCases, officeAnimCases: pOffice, identical: pCases - pBad, mismatches: pBad,
      personParity: `${gen - genBad}/${gen}`, managerBlazer: `${forced}/${managers}`,
      unpatchedManagerHasBlazer: unforced.parts.includes('top_blazer') } };
  console.log(JSON.stringify(res));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `officefolk_parity_${frags.length > 1 ? 'all' : 'v42'}.json`), JSON.stringify(res, null, 1));
  process.exit(bad || badPick || badPts || badPage || gameBad || pBad || genBad ? 1 : 0);
}

async function jsgen() {
  // JS generator: people made by Officefolk.preset() in JS keep PROMISE (of_presets) and every core head / face / brow
  // frame of every frame they can play resolves; pickAnim of random townsfolk is always playable and merged; both merges.
  const { mergeOfficefolk, Officefolk } = await import('../officefolk_compose.js');
  const { mulberry32 } = await import('../townfolk_compose.js');
  const results = [];
  let fail = 0;
  for (const frags of [['officefolk'], [...ALL, 'officefolk']]) {
    const M = mergeOfficefolk(rd('townfolk'), ...frags.map(rd));
    const have = {};
    for (const a of M.atlases) {
      const js = JSON.parse(fs.readFileSync(path.join(ASSETS, a.json), 'utf8'));
      const set = have[a.key] = new Set();
      for (const [pre, g] of Object.entries(js.frames)) for (const [grp, v] of Object.entries(g)) {
        if (v.some((x) => Array.isArray(x))) v.forEach((r, i) => { if (r) set.add(`${pre}/${grp}_${i}`); });
        else set.add(`${pre}/${grp}`);
      }
    }
    const tf = new Officefolk(M.townfolk);
    const rng = mulberry32(2042);
    let people = 0, fails = 0, frames = 0, missCore = 0, missOther = 0, wear = 0; const ex = [];
    const must = { courier: ['acc_bell_pin', 'top_duffle', 'acc_satchel'], bank_manager: ['top_blazer', 'det_tie'], secretary: ['det_bow', 'top_blazer'],
      office_a: ['acc_sleeves', 'top_cardigan'], teller_a: ['acc_bowtie', 'top_vest'], teller_b: ['acc_bowtie', 'top_vest'] };
    for (let k = 0; k < 80; k++) for (const [pr, anims] of Object.entries(PROMISE)) {
      const p = tf.preset(pr, rng); people++;
      for (const m of must[pr] || []) if (!p.parts.includes(m)) { wear++; if (ex.length < 5) ex.push(['wear', pr, m]); }
      for (const a of anims) {
        if (!tf.canPlay(p, a)) { fails++; if (ex.length < 5) ex.push([pr, a, p.base, p.parts.join(',')]); continue; }
        const info = tf.T.anims[a];
        for (const d of info.dirs) for (let i = 0; i < info.frames; i++) for (const l of tf.layers(p, a, d, i)) {
          frames++;
          const ok = l.atlas && have[l.atlas] && have[l.atlas].has(l.frame);
          if (!ok) { if (/^(head\.|face\.|brow\.)/.test(l.layer)) missCore++; else missOther++; }
        }
      }
    }
    let rp = 0, badPick = 0; const cov = {};
    for (let k = 0; k < 3000; k++) {
      const p = tf.randomPerson(rng); rp++;
      for (const a of tf.T.officefolkAnims) {
        const r = tf.pickAnim(p, a, { has: (x) => x !== 'carry_walk' });
        if (!tf.T.anims[r.anim] || !tf.canPlay(p, r.anim) || r.anim === 'carry_walk') badPick++;
        if (r.anim === a) cov[a] = (cov[a] || 0) + 1;
      }
    }
    const res = { fragments: ['townfolk', ...frags], presetPeople: people, promiseFails: fails, wearFails: wear, layerFramesChecked: frames,
      missingCore: missCore, missingOther: missOther, randomPeople: rp, unplayablePicks: badPick,
      coveragePct: Object.fromEntries(tf.T.officefolkAnims.map((a) => [a, +(100 * (cov[a] || 0) / rp).toFixed(1)])), ex };
    results.push(res);
    console.log(JSON.stringify(res));
    fail += fails + missCore + badPick + wear;
  }
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'officefolk_jsgen.json'), JSON.stringify(results, null, 1));
  process.exit(fail ? 1 : 0);
}

const HTML = (frags, zoom, mode) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:#dbe6f2;height:100%;overflow:hidden}#game{width:100%;height:100%}</style>
<script src="lib/phaser.min.js"></script></head><body><div id="game"></div><script type="module">
import { townfolkPreload, townfolkInstall, mulberry32 } from './tools/townfolk_compose.js';
import { mergeOfficefolk, Officefolk, OfficefolkSprite } from './tools/officefolk_compose.js';
const GL = window.__GLC = { draw: 0, binds: 0 };
for (const P of [WebGLRenderingContext.prototype, window.WebGL2RenderingContext && WebGL2RenderingContext.prototype]) {
  if (!P) continue;
  for (const m of ['drawElements', 'drawArrays']) { const o = P[m]; P[m] = function (...a) { GL.draw++; return o.apply(this, a); }; }
  const ob = P.bindTexture; P.bindTexture = function (...a) { GL.binds++; return ob.apply(this, a); };
}
const rd = async (f) => (await fetch('assets/' + f + '/manifest.json')).json();
const MODE = ${JSON.stringify(mode)}, ZOOM = ${zoom};
const man = mergeOfficefolk(await rd('townfolk'), ...(await Promise.all(${JSON.stringify(frags)}.map(rd))));
const office = await rd('office');
const civic = MODE === 'bank' ? await rd('civic') : null;
const OFP = man.townfolk.ofPages;
const resident = new Set(MODE === 'plaza' ? OFP.scenes.plaza : Object.keys(OFP.groups));
if (MODE === 'plaza') { const keep = new Set([...resident].flatMap((g) => OFP.groups[g].atlases)); man.atlases = man.atlases.filter((a) => !a.key.startsWith('of_') || keep.has(a.key)); }
const W = 720, H = Math.round(720 * innerHeight / innerWidth);
const k = Math.round(Math.max(1, Math.min(2, innerWidth * devicePixelRatio / 720)) * 20) / 20;
window.__R = { ready: false, k, missing: [], emptyLayers: new Set(), checked: 0, fallbacks: [], staged: [] };
class S extends Phaser.Scene {
  preload() {
    townfolkPreload(this, man, 'assets/');
    for (const a of office.atlases) this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
    if (civic) for (const a of civic.atlases) if (a.key === 'civ_bank') this.load.atlas(a.key, 'assets/' + a.png, 'assets/' + a.json);
  }
  create() {
    townfolkInstall(this, man);
    const R = window.__R, cam = this.cameras.main;
    const tf = this.tf = new Officefolk(man.townfolk);
    cam.setBackgroundColor('#f4f7fb');
    const g = this.add.graphics().setDepth(-1e5);
    g.fillStyle(0xc9d1db, 1); g.fillPoints([{ x: -1400, y: 760 }, { x: 900, y: -390 }, { x: 1150, y: -265 }, { x: -1150, y: 885 }], true);
    g.fillStyle(0xe2e8ef, 1); g.fillPoints([{ x: -700, y: 470 }, { x: -100, y: 170 }, { x: 640, y: 540 }, { x: 40, y: 840 }], true);
    // ---- the office (revealed: cut state), layers + overlays at the building anchor, depth = Y + depthOffsets
    const B = office.sprites.chief_office, X = 0, Y = 160;
    this.overlays = [];
    if (MODE !== 'plaza' && MODE !== 'bank') {
      for (const key of B.drawOrder) {
        if (key[0] === '@') continue;
        const sp = office.sprites[key];
        if (!sp || key === 'chief_office_glow') continue;
        const fr = sp.frames ? sp.frames[0] : sp.frame;
        const im = this.add.image(X, Y, sp.atlas, fr).setOrigin(sp.anchor[0], sp.anchor[1]).setDepth(Y + B.depthOffsets[key]);
        if (key === 'chief_office_shell') im.setAlpha(B.fade.openAlpha);
        if (sp.frames) this.overlays.push({ im, frames: sp.frames, t: 0, i: 0 });
      }
    }
    const rng = mulberry32(4242);
    this.npcs = [];
    const has = (a, p) => { const pg = p ? tf.pageNeeded(p, a) : tf.pageOf(a); return !pg || !OFP.groups[pg] || resident.has(pg); };
    const add = (p, anim, dir, x, y, opts = {}) => {
      const s = new OfficefolkSprite(this, tf, p, x, y);
      s.has = has;
      s.play(anim, dir);
      if (s.anim !== anim) R.fallbacks.push(anim + '->' + s.anim);
      if (opts.band) { s.depthBase = Y + B.bandDepth[opts.band] + (y - Y) * 1e-6; }
      if (!opts.sync) { s.frame = Math.floor(rng() * tf.T.anims[s.anim].frames); }
      s.refresh(true);
      s.label = opts.label && s.anim !== anim ? opts.label + ' -> ' + s.anim : opts.label;
      if (opts.label) s.text = this.add.text(x, y + 14, s.label, { fontFamily: 'sans-serif', fontSize: '11px', color: '#2b3a4e', align: 'center',
        backgroundColor: 'rgba(255,255,255,0.72)', padding: { x: 3, y: 1 }, resolution: 3 }).setOrigin(0.5, 0).setDepth(1e5);
      this.npcs.push(s); R.staged.push([p.preset || 'random', anim, s.anim, s.dir]);
      return s;
    };
    const pt = (name) => B[name];
    if (MODE === 'bank') {
      // (polish H3 / M3) the civic bank cutaway (revealed) at (BX, BY): tellers on staffPoints[0..2] lifted onto the
      // counter step (counter.places.bank.liftPx), the 은행장 seated at staffPoints[3] (anchor lifted by
      // deskSeat.groundOffsetPx), the courier handing over the sack at counterPoints[0], a customer at [1]
      const bk = civic.sprites.bank, cw = bk.cutaway, BX = -40, BY = 330;
      cw.drawOrder.forEach((name, k) => {
        if (name[0] === '@') return;
        const sp = civic.sprites[name]; if (!sp) return;
        const im = this.add.image(BX, BY, sp.atlas, sp.frames ? sp.frames[0] : sp.frame).setOrigin(sp.anchor[0], sp.anchor[1]).setDepth(BY + 0.01 * k);
        if (name === cw.fade.layer) im.setAlpha(cw.fade.openAlpha);
      });
      const behind = BY + 0.01 * cw.drawOrder.indexOf('@behind'), front = BY + 0.01 * cw.drawOrder.indexOf('@front');
      const CB = man.townfolk.counter.places.bank, SP = bk.staffPoints, SD = bk.staffDirs;
      const staff = [['teller_a', 'stamp_stand'], ['teller_b', 'hand_over'], ['teller_a', 'stamp_stand']];
      staff.forEach(([pr, a], k) => {
        const p = tf.preset(pr, rng), lift = CB.liftPx[p.base].SE;
        const s = add(p, a, SD[k], BX + SP[k][0], BY + SP[k][1] - lift, { sync: true });
        s.depthBase = behind + SP[k][1] * 1e-6; s.frame = k === 1 ? 3 : 3; s.refresh(true);
      });
      const mg = tf.preset('bank_manager', rng);
      const ms = add(mg, 'desk_write', SD[3], BX + SP[3][0], BY + SP[3][1] - man.townfolk.bases[mg.base].deskSeat.groundOffsetPx);
      ms.depthBase = behind + SP[3][1] * 1e-6; ms.refresh(true);
      const CP = bk.counterPoints, CD = bk.counterDirs;
      const cs = add(tf.preset('courier', rng), 'hand_over', CD[0], BX + CP[0][0], BY + CP[0][1], { sync: true });
      cs.depthBase = front + CP[0][1] * 1e-6; cs.frame = 3; cs.refresh(true);
      const cu = add(tf.randomPerson(rng), 'idle', CD[1], BX + CP[1][0], BY + CP[1][1]);
      cu.depthBase = front + CP[1][1] * 1e-6; cu.refresh(true);
      const lab = this.add.text(BX - 150, BY + 120, 'tellers lifted ' + CB.liftPx.adult_slim.SE + ' px (counter top ' + CB.counterTopPx + ' px); manager seated at staffPoints[3]', { fontFamily: 'sans-serif', fontSize: '11px', color: '#2b3a4e', backgroundColor: 'rgba(255,255,255,0.8)', padding: { x: 3, y: 1 }, resolution: 3 }).setDepth(1e5);
    }
    if (MODE !== 'plaza' && MODE !== 'bank') {
      // inside: four clerks at the desks (band behind = under _interior_front: the desk hides their laps)
      const desk = [['office_a', 'desk_write'], ['office_b', 'desk_type'], ['secretary', 'desk_phone'], ['courier', 'desk_count']];
      B.deskPoints.forEach((q, i) => add(tf.preset(desk[i][0], rng), desk[i][1], B.deskDirs[i], X + q[0], Y + q[1], { band: 'behind' }));
      add(tf.preset('teller_b', rng), 'point_board', B.boardDir, X + B.boardPoint[0], Y + B.boardPoint[1], { band: 'behind' });
      add(tf.preset('office_b', rng), 'file', B.cabinetDir, X + B.cabinetPoint[0], Y + B.cabinetPoint[1], { band: 'behind' });
      add(tf.preset('courier', rng), 'scoop', B.safeDir, X + B.safePoint[0], Y + B.safePoint[1], { band: 'front' });
      add(tf.preset('secretary', rng), 'hand_over', B.entryDir, X + B.entryPoint[0], Y + B.entryPoint[1], { band: 'front' });
    }
    // outside: the 8 presets doing a signature anim, labelled
    if (MODE !== 'bank') {
    const row = [['office_a', 'desk_count', 'S'], ['office_b', 'note', 'SE'], ['secretary', 'bow', 'S'], ['courier', 'carry_sack', 'S'],
      ['teller_a', 'stamp_stand', 'SE'], ['teller_b', 'hand_over', 'E'], ['bank_manager', 'bow', 'SE'], ['depot_worker', 'note', 'S']];
    row.forEach(([pr, a, d], i) => add(tf.preset(pr, rng), a, d, -300 + (i % 4) * 200 + (i >= 4 ? 100 : 0), 520 + (i >= 4 ? 150 : 0) + (i % 4) * 10, { label: pr + '\\n' + a, sync: true }));
    // the courier walking a loop with his sack (groundSpeed px/s), + one with the sack in the plaza
    const loop = [[-420, 360], [-60, 540], [300, 360], [-60, 180]];
    this.walker = add(tf.preset('courier', rng), 'carry_sack', 'SE', loop[0][0], loop[0][1], { label: 'courier\\ncarry_sack' });
    this.walker.path = loop; this.walker.leg = 0;
    // random v4 townsfolk next to them
    for (let i = 0; i < 6; i++) add(tf.randomPerson(rng), i % 2 ? 'walk' : 'idle', ['SW', 'SE', 'S', 'E', 'W', 'S'][i], -330 + i * 130, 860 + (i % 2) * 40);
    }
    if (MODE === 'plaza') {
      // the plaza: only 'sack' resident -> office anims fall back, the courier / aide extras still draw;
      // (polish) the aide takes notes here (her note frames are on sack), the courier's scoop -> happy (bell pin
      // frames), the manager idles without his blazer (desk page not resident) instead of walking in place
      add(tf.preset('secretary', rng), 'note', 'SE', -240, 300, { label: 'secretary note' });
      add(tf.preset('secretary', rng), 'hand_over', 'SE', -80, 300, { label: 'secretary hand_over' });
      add(tf.preset('courier', rng), 'scoop', 'SW', 80, 330, { label: 'courier scoop' });
      add(tf.preset('bank_manager', rng), 'idle', 'SE', 240, 330, { label: 'manager idle' });
      add(tf.preset('office_a', rng), 'walk', 'SE', -160, 420, { label: 'office_a walk' });
      add(tf.preset('teller_b', rng), 'wave', 'S', 160, 420, { label: 'teller_b wave' });
    }
    // audit every frame of every anim these people can play (and the runtime can show)
    const tex = this.textures;
    let checked = 0;
    for (const s of this.npcs) {
      for (const [a, info] of Object.entries(tf.T.anims)) {
        if (a === 'carry_walk' || !tf.canPlay(s.person, a) || !has(a, s.person)) continue;
        for (const d of info.dirs) for (let i = 0; i < info.frames; i++) {
          for (const l of tf.layers(s.person, a, d, i)) {
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
    let ofB = 0; for (const a of man.atlases) if (a.key.startsWith('of_')) { const src = tex.get(a.key).source[0]; ofB += src.width * src.height * 4; }
    R.ofMiB = +(ofB / 1048576).toFixed(2);
    cam.setZoom(ZOOM * k); cam.centerOn(MODE === 'bank' ? 0 : 0, MODE === 'plaza' ? 470 : MODE === 'bank' ? 270 : (ZOOM < 0.9 ? 380 : (ZOOM < 1.1 ? 420 : 110)));
    R.scene = this; R.ready = true;
  }
  update(t, dt) {
    for (const o of this.overlays) { o.t += dt; if (o.t > 160) { o.t = 0; o.i = (o.i + 1) % o.frames.length; o.im.setFrame(o.frames[o.i]); } }
    const w = this.walker;
    if (w) {
      const a = w.path[w.leg], b = w.path[(w.leg + 1) % w.path.length];
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      const dir = dx >= 0 ? (dy >= 0 ? 'SE' : 'NE') : (dy >= 0 ? 'SW' : 'NW');
      if (w.dir !== dir) w.play('carry_sack', dir);
      const v = (this.tf.groundSpeed(w.person, w.anim, w.dir) || 40) * dt / 1000;
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
  const runs = [['z06', ['officefolk'], 0.6, 'office'], ['z10', ['officefolk'], 1.0, 'office'], ['z12', ['officefolk'], 1.2, 'office'],
    ['plaza', ['officefolk'], 1.0, 'plaza'], ['bank', ['officefolk'], 1.2, 'bank'], ['all', [...ALL, 'officefolk'], 1.0, 'office']];
  const results = [];
  const PREV = path.join(ROOT, 'docs', 'previews');
  fs.mkdirSync(PREV, { recursive: true });
  for (const [name, frags, zoom, mode] of runs) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    const err0 = errors.length;
    page.on('pageerror', (e) => errors.push(name + ': ' + String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ': ' + m.text()); });
    page.on('response', (r) => { if (r.status() >= 400) notFound.push(r.url()); });
    await page.route(`**/fv/__of_${name}.html`, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML(frags, zoom, mode) }));
    await page.goto(srv.url + `__of_${name}.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__R && (window.__R.ready || window.__R.failed), null, { timeout: 300000 });
    await sleep(1500);
    const res = await page.evaluate(async () => {
      const R = window.__R, g = R.game, C = window.__GLC, sc = R.scene;
      const d0 = C.draw, b0 = C.binds, f0 = g.loop.frame, t0 = performance.now();
      while (g.loop.frame - f0 < 30) await new Promise((r) => setTimeout(r, 10));
      const n = g.loop.frame - f0;
      const sprites = sc.children.list.filter((o) => o.visible && o.type === 'Image').length;
      return { npcs: sc.npcs.length, sprites, textures: R.textures, drawPerFrame: +((C.draw - d0) / n).toFixed(1),
        bindsPerFrame: +((C.binds - b0) / n).toFixed(1), msPerFrame: +((performance.now() - t0) / n).toFixed(1),
        layersChecked: R.checked, missing: R.missing.length, missingSample: R.missing.slice(0, 5), fallbacks: R.fallbacks,
        emptyLayers: [...R.emptyLayers].slice(0, 8), officefolkTextureMiB: R.ofMiB, k: R.k, zoom: sc.cameras.main.zoom,
        cssPerWorldPx: +(sc.cameras.main.zoom * 390 / (720 * R.k)).toFixed(3), staged: R.staged };
    });
    await page.evaluate(() => window.__R.game.loop.sleep());
    const file = path.join(PREV, `officefolk_phone_${name}.png`);
    await page.screenshot({ path: file, timeout: 180000 });
    res.name = name; res.fragments = ['townfolk', ...frags]; res.file = path.relative(ROOT, file); res.errors = errors.length - err0;
    results.push(res);
    console.log(JSON.stringify({ ...res, staged: res.staged.length }));
    await ctx.close();
  }
  if (errors.length) console.log('ERRORS', errors.slice(0, 10));
  if (notFound.length) console.log('404', notFound.slice(0, 10));
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'officefolk_phaser.json'), JSON.stringify({ results, errors, notFound }, null, 1));
  await browser.close();
  await srv.close();
  process.exit(errors.length || notFound.length || results.some((r) => r.missing) ? 1 : 0);
}

const i = process.argv.indexOf('--parity');
if (i >= 0) await parity(process.argv[i + 1] || path.join(OUT, 'officefolk_cases.json'));
else if (process.argv.includes('--jsgen')) await jsgen();
else await phaser();
