// Cityfolk (CONTRACT_V8 AD) tests.
//   node tools/test/cityfolk_phaser.mjs                       headless Chromium + Phaser 3.90 (WebGL / SwiftShader)
//   node tools/test/cityfolk_phaser.mjs --parity cases.json   Python <-> JS compositor parity (no browser)
//   node tools/test/cityfolk_phaser.mjs --jsgen                JS generator: presets keep their promises (no browser)
//   node tools/test/cityfolk_phaser.mjs --incident fire        Phaser scene with ONLY that incident's cityfolk pages
//                                                              loaded (cfPages.incidents.fire): residency check
//
// Phaser mode: loads assets/townfolk + assets/townfolk2 (+ assets/beachfolk when present) + assets/cityfolk,
// merges them with mergeTownfolkFragments() (tools/cityfolk_compose.js), installs the tfatlas frames and stages a
// small 'living city' incident with CityfolkSprite: firefighters spraying, a shocked / pointing / phoning crowd,
// residents fleeing, police running after a fleeing burglar, an arrest, movers with boxes, sweepers, reporters,
// a scuffle, bank staff, everybody else idling / walking.  Audits every frame of every anim each staged person
// can play (core head / face / brow frames must exist, every layer must resolve to a loaded texture), counts draw
// calls and texture units, page errors; writes docs/previews/cityfolk_phaser.png + /tmp/fv_cache/cityfolk/review/cityfolk_phaser.json.
// Parity mode: recomputes every Python draw list dumped by cf_check.py --dump (person, anim -> pickAnim, dir,
// frame, face, noItems) with Cityfolk.layers / pickAnim / canPlay / points and compares them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ASSETS = process.env.CF_ASSETS || path.join(ROOT, 'assets');
const FRAGS = ['townfolk2', 'beachfolk', 'cityfolk'].filter((f) => fs.existsSync(path.join(ASSETS, f, 'manifest.json')));

async function parity(casesPath) {
  const { mergeTownfolkFragments, Cityfolk } = await import('../cityfolk_compose.js');
  const { mergeTownfolkManifests } = await import('../townfolk2_compose.js');
  const rd = (f) => JSON.parse(fs.readFileSync(path.join(ASSETS, f, 'manifest.json'), 'utf8'));
  const man = rd('townfolk');
  const M = mergeTownfolkFragments(man, ...FRAGS.map(rd));
  // generic merge == townfolk2's own merge for v4 + v5
  const a = mergeTownfolkFragments(man, rd('townfolk2')).townfolk; delete a.fragments; delete a.animFragment;
  const b = mergeTownfolkManifests(man, rd('townfolk2')).townfolk;
  const sortKeys = (o) => (Array.isArray(o) ? o.map(sortKeys) : (o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])])) : o));
  const same = JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
  const tf = new Cityfolk(M.townfolk);
  const data = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
  const hex = (t) => (t == null ? null : '#' + t.toString(16).padStart(6, '0').toUpperCase());
  let bad = 0, n = 0, badPick = 0, badPts = 0;
  for (const c of data.cases) {
    const p = data.persons[c.p];
    n++;
    const pick = tf.pickAnim(p, c.anim);
    if (pick.anim !== c.pick || (pick.face || null) !== (c.face || null)) { badPick++; if (badPick < 4) console.log('PICK', c.anim, pick, c.pick, c.face); }
    for (const [x, v] of Object.entries(c.canPlay)) if (tf.canPlay(p, x) !== v) { badPick++; if (badPick < 4) console.log('CANPLAY', x, v); }
    const js = tf.layers(p, c.pick, c.dir, c.i, { face: c.face, noItems: c.noItems });
    const A = js.map((l) => [l.z, l.frame, hex(l.tint)]);
    const B = c.layers;
    let ok = A.length === B.length;
    for (let k = 0; ok && k < A.length; k++) {
      if (A[k][0] !== B[k][0] || A[k][1] !== B[k][1]) ok = false;
      else if ((A[k][2] == null) !== (B[k][2] == null)) ok = false;
      else if (A[k][2]) {
        const x = parseInt(A[k][2].slice(1), 16), y = parseInt(B[k][2].slice(1), 16);
        for (let s = 0; s < 24; s += 8) if (Math.abs(((x >> s) & 255) - ((y >> s) & 255)) > 1) ok = false;
      }
    }
    if (!ok) { bad++; if (bad <= 4) console.log('MISMATCH', JSON.stringify(c).slice(0, 300), '\n js', JSON.stringify(A).slice(0, 500)); }
    const pts = { nozzle: c.pick === 'spray_hose' ? tf.nozzlePoint(p, c.dir, c.i) : null,
      box: c.pick === 'carry_box' ? tf.boxPoint(p, c.dir, c.i) : null, sweep: c.pick === 'sweep' ? tf.sweepPoint(p, c.dir, c.i) : null };
    if (JSON.stringify(pts) !== JSON.stringify(c.points)) { badPts++; if (badPts < 4) console.log('POINTS', JSON.stringify(pts), JSON.stringify(c.points)); }
  }
  console.log(`fragments: townfolk + ${FRAGS.join(' + ')}; generic merge(v4,v5) == mergeTownfolk: ${same}`);
  console.log(`parity: ${n - bad}/${n} draw lists identical, pickAnim/canPlay mismatches ${badPick}, point mismatches ${badPts}`);
  process.exit(bad || badPick || badPts || !same ? 1 : 0);
}

async function jsgen() {
  // JS generator check: people made by Cityfolk.preset() in JS play their promised anims (cf_check PROMISE) and
  // every core head / face / brow frame of every frame they can play resolves; pickAnim() of random townsfolk is
  // always playable.  ('missingOther' = empty layer frames hidden by the body, skipped at runtime.)
  const rd = (f) => JSON.parse(fs.readFileSync(path.join(ASSETS, f, 'manifest.json'), 'utf8'));
  const { mergeTownfolkFragments, Cityfolk } = await import('../cityfolk_compose.js');
  const { mulberry32 } = await import('../townfolk_compose.js');
  const frags = FRAGS;
  const M = mergeTownfolkFragments(rd('townfolk'), ...frags.map(rd));
  // frame index per atlas
  const have = {};
  for (const a of M.atlases) {
    const js = JSON.parse(fs.readFileSync(path.join(ASSETS, a.json), 'utf8'));
    const set = have[a.key] = new Set();
    if (js.tfatlas) {
      for (const [pre, g] of Object.entries(js.frames)) for (const [grp, v] of Object.entries(g)) {
        if (v.some((x) => Array.isArray(x))) v.forEach((r, i) => { if (r) set.add(`${pre}/${grp}_${i}`); });
        else set.add(`${pre}/${grp}`);
      }
    } else for (const k of Object.keys(js.frames)) set.add(k);
  }
  const PROMISE = { firefighter: ['spray_hose', 'run', 'point', 'idle', 'walk', 'talk', 'happy', 'wave'],
    police_officer: ['run', 'point', 'phone', 'think', 'walk', 'talk'], detective: ['think', 'point', 'phone', 'walk', 'talk', 'run'],
    burglar: ['flee', 'run', 'arrested_walk', 'walk', 'idle', 'fight', 'argue', 'sad', 'sit'],
    banker: ['walk', 'talk', 'think', 'shocked', 'phone', 'sit'], bank_teller: ['walk', 'talk', 'phone', 'shocked', 'idle'],
    warehouse_worker: ['carry_box', 'walk', 'sweep', 'idle', 'talk', 'point'], forklift_driver: ['carry_box', 'walk', 'talk', 'idle'],
    delivery_driver: ['carry_box', 'run', 'walk', 'phone'], mover: ['carry_box', 'walk', 'idle', 'talk'],
    construction_worker: ['sweep', 'carry_box', 'point', 'walk'], demolition_worker: ['sweep', 'carry_box', 'point', 'walk'],
    reporter: ['run', 'phone', 'point', 'talk', 'walk', 'think', 'shocked'] };
  const tf = new Cityfolk(M.townfolk);
  const rng = mulberry32(2026);
  let people = 0, fails = 0, frames = 0, missCore = 0, missOther = 0; const ex = [];
  for (let k = 0; k < 130; k++) for (const [pr, anims] of Object.entries(PROMISE)) {
    const p = tf.preset(pr, rng); people++;
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
  // random townsfolk: every anim pickAnim() returns must be playable, never carry_walk (the v4 runtime drops it),
  // flee never falls back to a calm walk; coverage = share of residents who play the anim itself
  let rp = 0, badPick = 0, carryWalk = 0, fleeWalk = 0; const cov = {}, fb = {};
  const has = (a) => a !== 'carry_walk';
  for (let k = 0; k < 3000; k++) { const p = tf.randomPerson(rng); rp++;
    for (const a of tf.T.cityfolkAnims) {
      const r = tf.pickAnim(p, a, { has });
      if (!tf.canPlay(p, r.anim)) badPick++;
      if (r.anim === 'carry_walk') carryWalk++;
      if (a === 'flee' && r.anim === 'walk') fleeWalk++;
      if (r.anim === a) cov[a] = (cov[a] || 0) + 1; else { const key = a + '->' + r.anim; fb[key] = (fb[key] || 0) + 1; }
    } }
  const coverage = Object.fromEntries(tf.T.cityfolkAnims.map((a) => [a, +(100 * (cov[a] || 0) / rp).toFixed(1)]));
  const fallbacks = Object.fromEntries(Object.entries(fb).map(([k, v]) => [k, +(100 * v / rp).toFixed(1)]));
  const res = ({ fragments: frags, presetPeople: people, promiseFails: fails, layerFramesChecked: frames,
    missingCore: missCore, missingOther: missOther, randomPeople: rp, unplayablePicks: badPick, carryWalkPicks: carryWalk,
    fleeToWalk: fleeWalk, coveragePct: coverage, fallbackPct: fallbacks, ex });
    console.log(JSON.stringify(res));
    process.exit(fails || missCore || badPick || carryWalk || fleeWalk ? 1 : 0);
  
}

const HTML = (frags, inc = null) => `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#eef3f9}</style>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
import { townfolkPreload, townfolkInstall, mulberry32 } from './tools/townfolk_compose.js';
import { mergeTownfolkFragments, Cityfolk, CityfolkSprite } from './tools/cityfolk_compose.js';
const GL = window.__GLC = { draw: 0, binds: 0 };
for (const P of [WebGLRenderingContext.prototype, window.WebGL2RenderingContext && WebGL2RenderingContext.prototype]) {
  if (!P) continue;
  for (const m of ['drawElements', 'drawArrays']) { const o = P[m]; P[m] = function (...a) { GL.draw++; return o.apply(this, a); }; }
  const ob = P.bindTexture; P.bindTexture = function (...a) { GL.binds++; return ob.apply(this, a); };
}
const rd = async (f) => (await fetch('assets/' + f + '/manifest.json')).json();
const man = mergeTownfolkFragments(await rd('townfolk'), ...(await Promise.all(${JSON.stringify(frags)}.map(rd))));
// incident mode: only the cityfolk pages that incident needs are loaded (cfPages.incidents[INC].pages); sprites skip
// (pickAnim {has}) anims whose page is not resident
const INC = ${JSON.stringify(inc)};
const PAGES = man.townfolk.cfPages || { groups: {}, incidents: {} };
const resident = new Set(INC ? PAGES.incidents[INC].pages : Object.keys(PAGES.groups));
if (INC) {
  const keep = new Set([...resident].flatMap((g) => PAGES.groups[g].atlases));
  man.atlases = man.atlases.filter((a) => !a.key.startsWith('cf_') || keep.has(a.key));
}
window.__CF = { ready: false, missing: [], checked: 0, emptyLayers: new Set(), fallbacks: [], inc: INC };
class S extends Phaser.Scene {
  preload() { townfolkPreload(this, man, 'assets/'); }
  create() {
    townfolkInstall(this, man);
    const tf = this.tf = new Cityfolk(man.townfolk);
    this.add.rectangle(360, 640, 720, 1280, 0xeef3f9).setDepth(-1e6);
    const g = this.add.graphics().setDepth(-1e5);
    g.fillStyle(0xdfe7ef, 1).fillPoints([{ x: 360, y: 120 }, { x: 710, y: 300 }, { x: 360, y: 480 }, { x: 10, y: 300 }], true);
    g.fillStyle(0xd9a593, 0.45).fillPoints([{ x: 360, y: 150 }, { x: 470, y: 205 }, { x: 360, y: 260 }, { x: 250, y: 205 }], true);
    g.fillStyle(0xe6ece4, 1).fillPoints([{ x: 360, y: 560 }, { x: 710, y: 740 }, { x: 360, y: 920 }, { x: 10, y: 740 }], true);
    g.fillStyle(0xe9e3da, 1).fillPoints([{ x: 360, y: 960 }, { x: 710, y: 1110 }, { x: 360, y: 1260 }, { x: 10, y: 1110 }], true);
    const rng = mulberry32(808);
    this.npcs = [];
    const has = (a, p) => { const g = p ? tf.pageNeeded(p, a) : tf.pageOf(a); return !g || resident.has(g); };
    this.has = has;
    const add = (p, anim, dir, x, y, face) => {
      const s = new CityfolkSprite(this, tf, p, x, y);
      s.has = has;
      s.play(anim, dir); if (face) s.setFace(face);
      if (s.anim !== anim) window.__CF.fallbacks.push(anim + '->' + s.anim);
      s.frame = Math.floor(rng() * tf.T.anims[s.anim].frames); s.refresh(true);
      this.npcs.push(s); return s;
    };
    // the fire (top): firefighters spraying at the scorch mark, residents fleeing, crowd shocked / pointing / phoning
    for (let k = 0; k < 4; k++) add(tf.preset('firefighter', rng), 'spray_hose', ['NE', 'NE', 'NW', 'E'][k], 300 + k * 60, 330 + (k % 2) * 40);
    add(tf.preset('firefighter', rng), 'run', 'NE', 520, 380);
    for (let k = 0; k < 5; k++) add(tf.randomPerson(rng), 'flee', ['SW', 'S', 'SE', 'W', 'S'][k], 120 + k * 60, 250 + (k % 2) * 30);
    const crowd = ['shocked', 'point', 'phone', 'think', 'shocked', 'point', 'shocked', 'phone'];
    for (let k = 0; k < 8; k++) add(tf.randomPerson(rng), crowd[k], ['E', 'W', 'SE', 'SW', 'E', 'W', 'SE', 'SW'][k], 90 + k * 75, 450 + (k % 2) * 30);
    add(tf.preset('reporter', rng), 'phone', 'SE', 620, 260);
    add(tf.preset('firefighter', rng), 'talk', 'SW', 600, 400);    // talk: social page, not resident in a fire
    if (!INC) {
    // the chase (middle): police running after a burglar, an arrest, a scuffle
    add(tf.preset('burglar', rng), 'flee', 'W', 220, 680);
    add(tf.preset('police_officer', rng), 'run', 'W', 330, 690);
    add(tf.preset('police_officer', rng), 'point', 'SW', 420, 650);
    add(tf.preset('burglar', rng), 'arrested_walk', 'SE', 520, 760);
    add(tf.preset('police_officer', rng), 'walk', 'SE', 575, 780);
    add(tf.randomPerson(rng), 'fight', 'E', 160, 820); add(tf.randomPerson(rng), 'fight', 'W', 200, 822);
    add(tf.randomPerson(rng), 'argue', 'SE', 300, 840); add(tf.randomPerson(rng), 'argue', 'W', 350, 860);
    add(tf.preset('detective', rng), 'think', 'S', 640, 700);
    // moving day + clean-up (bottom): movers, warehouse staff, a delivery, sweepers, bank staff
    for (let k = 0; k < 4; k++) add(tf.preset(['mover', 'mover', 'warehouse_worker', 'delivery_driver'][k], rng), 'carry_box', ['NE', 'SW', 'E', 'SE'][k], 120 + k * 70, 1050 + (k % 2) * 40);
    add(tf.preset('construction_worker', rng), 'sweep', 'SE', 430, 1060);
    add(tf.preset('demolition_worker', rng), 'sweep', 'W', 500, 1100);
    add(tf.randomPerson(rng), 'sweep', 'S', 580, 1150);
    add(tf.preset('banker', rng), 'talk', 'SE', 420, 1180); add(tf.preset('bank_teller', rng), 'idle', 'W', 480, 1190);
    add(tf.preset('forklift_driver', rng), 'walk', 'NE', 640, 1060);
    for (let k = 0; k < 6; k++) add(tf.randomPerson(rng), k % 2 ? 'walk' : 'run', ['SW', 'SE', 'NE', 'W', 'S', 'E'][k], 80 + k * 110, 960 + (k % 3) * 25);
    }
    // audit every frame of every anim these people can play (and the runtime can show: resident pages)
    const tex = this.textures;
    let checked = 0;
    for (const s of this.npcs) {
      for (const [a, info] of Object.entries(tf.T.anims)) {
        if (!tf.canPlay(s.person, a) || !has(a, s.person)) continue;
        for (const d of info.dirs) for (let i = 0; i < info.frames; i++) {
          for (const l of tf.layers(s.person, a, d, i)) {
            checked++;
            const core = /^(head\\.|face\\.|brow\\.)/.test(l.layer);
            if (!l.atlas) { if (core) window.__CF.missing.push('no atlas ' + l.frame); else window.__CF.emptyLayers.add(l.layer); }
            else if (!tex.exists(l.atlas)) window.__CF.missing.push('no texture ' + l.atlas);
            else if (core && !tex.get(l.atlas).has(l.frame)) window.__CF.missing.push('missing core frame ' + l.frame);
          }
        }
      }
    }
    window.__CF.checked = checked;
    window.__CF.textures = man.atlases.length;
    let cfB = 0; for (const a of man.atlases) if (a.key.startsWith('cf_')) { const src = tex.get(a.key).source[0]; cfB += src.width * src.height * 4; }
    window.__CF.cfMiB = +(cfB / 1048576).toFixed(1);
    window.__CF.scene = this; window.__CF.ready = true;
  }
  update(t, dt) { for (const s of this.npcs) { s.update(dt); s.place(); } }
}
window.__CF.game = new Phaser.Game({ type: Phaser.WEBGL, width: 720, height: 1280, backgroundColor: '#eef3f9',
  render: { antialias: true }, scene: S, banner: false });
</script></body></html>`;

async function phaser(inc = null) {
  const { start } = await import('./serve.mjs');
  const { launch, sleep } = await import('./pw.mjs');
  const srv = await start(0, { prefix: '/fv/' });
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('**/fv/__cityfolk.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML(FRAGS, inc) }));
  await page.goto(srv.url + '__cityfolk.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__CF && window.__CF.ready, null, { timeout: 300000 });
  await sleep(1500);
  const res = await page.evaluate(async () => {
    const g = window.__CF.game, C = window.__GLC, sc = window.__CF.scene;
    const d0 = C.draw, b0 = C.binds, f0 = g.loop.frame;
    while (g.loop.frame - f0 < 30) await new Promise((r) => setTimeout(r, 10));
    const n = g.loop.frame - f0;
    const sprites = sc.children.list.filter((o) => o.visible && o.type === 'Image').length;
    const units = g.renderer.maxTextures || (g.renderer.gl && g.renderer.gl.getParameter(g.renderer.gl.MAX_TEXTURE_IMAGE_UNITS));
    return { npcs: sc.npcs.length, sprites, textures: window.__CF.textures, textureUnits: units,
      drawPerFrame: +((C.draw - d0) / n).toFixed(1), bindsPerFrame: +((C.binds - b0) / n).toFixed(1),
      layersChecked: window.__CF.checked, missing: window.__CF.missing.length, missingSample: window.__CF.missing.slice(0, 5),
      fallbacks: window.__CF.fallbacks, neverPackedLayers: [...window.__CF.emptyLayers].slice(0, 10),
      incident: window.__CF.inc, cityfolkTextureMiB: window.__CF.cfMiB };
  });
  fs.mkdirSync(path.join(ROOT, 'docs', 'previews'), { recursive: true });
  if (!inc) await page.screenshot({ path: path.join(ROOT, 'docs', 'previews', 'cityfolk_phaser.png') });
  console.log(JSON.stringify(res));
  if (errors.length) console.log('ERRORS', errors.slice(0, 10));
  fs.mkdirSync('/tmp/fv_cache/cityfolk/review', { recursive: true });
  fs.writeFileSync(`/tmp/fv_cache/cityfolk/review/cityfolk_phaser${inc ? '_' + inc : ''}.json`, JSON.stringify({ res, errors }, null, 1));
  await browser.close();
  await srv.close();
  process.exit(errors.length || res.missing ? 1 : 0);
}

const i = process.argv.indexOf('--parity');
if (i >= 0) await parity(process.argv[i + 1] || '/tmp/fv_cache/cityfolk/review/cityfolk_cases.json');
else if (process.argv.includes('--jsgen')) await jsgen();
else if (process.argv.includes('--incident')) await phaser(process.argv[process.argv.indexOf('--incident') + 1] || 'fire');
else await phaser();
