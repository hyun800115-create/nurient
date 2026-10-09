// Beachfolk (CONTRACT_V7 Y) in headless Chromium (Phaser 3.90, WebGL via SwiftShader), no game code.
//   node tools/test/beachfolk_phaser.mjs [--parity /path/cases.json] [--no-browser]
//
// 1. --parity: Python <-> JS compositor parity.  The cases come from
//      python3 tools/blender/bf_check.py --dump /path/cases.json
//    (people + draw lists made by tools/beachfolk_compose.py); every draw list is recomputed with
//    Beachfolk.layers() (tools/beachfolk_compose.js) and compared (frame names, order, z, tints +-1).  Also: every
//    frame of every beachfolk atlas resolves to its atlas through the merged lookup, and 3000 JS-generated people
//    (every beach preset + beach families) only draw frames that exist and can play their preset anims (an anim
//    blocked by an optional add-on - the swim ring - must resolve through pickAnim, water stays water), never draw a
//    hat that animHideHead hides.  Cross-compositor: the same beach people through tools/cityfolk_compose.js
//    mergeTownfolkFragments (when present) must agree on canPlay; draw-list differences are reported by cause.
// 2. Browser: merges assets/townfolk + townfolk2 + beachfolk with mergeBeachfolkManifests(), installs the tfatlas
//    frames and stages a beach (sand + a strip of sea): swimmers, floaters, surfers, splashing kids at the waterline,
//    sunbathers with their lieShadow, diggers with a sandcastle marker at digPoint, ball players with the ball at
//    ballPoint, lifeguard, ice-cream vendor, hotel staff, tourists.  Audits every frame of every anim each person can
//    play (core head / face / brow frames must exist), counts draw calls, page errors; writes
//    docs/previews/beachfolk_phaser.png and <scratch>/v7_beachfolk/beachfolk_phaser.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRATCH = '/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v7_beachfolk';
const args = process.argv.slice(2);
const parityPath = args.includes('--parity') ? args[args.indexOf('--parity') + 1] : null;
const noBrowser = args.includes('--no-browser');
let failed = 0;

if (parityPath) {
  const { mergeBeachfolkManifests, Beachfolk } = await import('../beachfolk_compose.js');
  const { mulberry32, forEachTfFrame } = await import('../townfolk_compose.js');
  const A = path.join(ROOT, 'assets');
  const rd = (p) => JSON.parse(fs.readFileSync(path.join(A, p), 'utf8'));
  const M = mergeBeachfolkManifests(rd('townfolk/manifest.json'), rd('townfolk2/manifest.json'), rd('beachfolk/manifest.json'));
  const bf = new Beachfolk(M.townfolk);
  const T = M.townfolk;
  const data = JSON.parse(fs.readFileSync(parityPath, 'utf8'));
  const hex = (t) => (t == null ? null : '#' + t.toString(16).padStart(6, '0').toUpperCase());
  let bad = 0, n = 0;
  for (const c of data.cases) {
    const p = data.persons[c.p];
    const MIR = { SW: 'SE', W: 'E', NW: 'NE' };
    const js = bf.layers(p, c.anim, MIR[c.dir] || c.dir, c.i);
    const a = js.map((l) => [l.z, l.frame, hex(l.tint)]);
    const b = c.layers;
    n++;
    let ok = a.length === b.length;
    for (let k = 0; ok && k < a.length; k++) {
      if (Math.abs(a[k][0] - b[k][0]) > 1e-9 || a[k][1] !== b[k][1]) ok = false;
      else if ((a[k][2] == null) !== (b[k][2] == null)) ok = false;
      else if (a[k][2]) {
        const x = parseInt(a[k][2].slice(1), 16), y = parseInt(b[k][2].slice(1), 16);
        for (let s = 0; s < 24; s += 8) if (Math.abs(((x >> s) & 255) - ((y >> s) & 255)) > 1) ok = false;
      }
    }
    if (!ok) {
      bad++;
      if (bad <= 4) console.log('MISMATCH', JSON.stringify(c).slice(0, 300), '\n js', JSON.stringify(a).slice(0, 500));
    }
  }
  // every beachfolk frame resolves to its own atlas through the merged lookup
  let wrong = 0, total = 0;
  const frames = new Set();
  for (const at of M.atlases) {
    const js = rd(at.json);
    forEachTfFrame(js, (name) => {
      frames.add(name);
      if (!at.key.startsWith('bf_')) return;
      total++;
      const [layer, fr] = name.split('/');
      let key;
      if (layer.includes('@')) { const anim = fr.split('_').slice(0, -2).join('_'); key = ((T.frameAtlasAnim || {})[anim] || {})[layer] || T.frameAtlas[layer]; }
      else { const hp = fr.split('_')[0]; key = ((T.frameAtlasPose || {})[hp] || {})[layer] || T.frameAtlas[layer]; }
      if (key !== at.key) { wrong++; if (wrong < 5) console.log('lookup', name, key, '!=', at.key); }
    });
  }
  // JS generator: presets + families, everything they can play draws only existing core frames
  const rng = mulberry32(2026);
  const presets = ['swimmer', 'sunbather', 'family_beach', 'lifeguard', 'bellhop', 'receptionist', 'doorman', 'housekeeper',
    'icecream_vendor', 'beach_bar_staff', 'surfer', 'beach_tourist'];
  let people = 0, missingCore = 0, cannot = 0, noAtlas = 0, addonBlocked = 0, hatsInWater = 0;
  const WATER = new Set(['swim', 'float', 'splash_play', 'surf']);
  const { partPlays, headHidden } = await import('../beachfolk_compose.js');
  const check = (p, pr) => {
    people++;
    const addon = new Set(pr ? (T.generator.presets[pr].addOns || []).flatMap(([t]) => Object.keys(t)) : []);
    for (const a of (pr ? T.generator.presets[pr].anims : Object.keys(T.anims))) {
      if (!bf.canPlay(p, a)) {
        const blockers = bf.animParts(p, a).filter((pn) => !partPlays(T.parts[pn], a));
        const pk = bf.pickAnim(p, a);
        if (pr && blockers.length && blockers.every((b) => addon.has(b)) && (!WATER.has(a) || WATER.has(pk.anim))) { addonBlocked++; continue; }
        if (pr) { cannot++; if (cannot < 4) console.log('cannot play', pr, a, p.parts.join(',')); }
        continue;
      }
      const info = T.anims[a];
      const d = info.dirs[people % info.dirs.length];
      const i = people % info.frames;
      for (const l of bf.layers(p, a, d, i)) {
        if (/^(head\.|face\.|brow\.)/.test(l.layer) && !frames.has(l.frame)) { missingCore++; if (missingCore < 4) console.log('missing core', l.frame); }
        if (!l.atlas && frames.has(l.frame)) { noAtlas++; }
        if (l.head && T.parts[l.layer.split('.')[0]] && T.parts[l.layer.split('.')[0]].family === 'hat' && headHidden(T, l.layer.split('.')[0], a)) hatsInWater++;
      }
    }
  };
  for (let k = 0; k < 3000; k++) {
    if (k % 10 === 9) { for (const p of bf.beachFamily(rng)) check(p, 'family_beach'); continue; }
    const pr = presets[k % presets.length];
    check(bf.preset(pr, rng), pr);
  }
  console.log(`parity: ${n - bad}/${n} draw lists identical; lookup ${total - wrong}/${total}; JS generator ${people} people, ` +
    `${cannot} cannot play a preset anim (+${addonBlocked} add-on blocks resolved by pickAnim), ${missingCore} missing core ` +
    `frames, ${noAtlas} frames without atlas, ${hatsInWater} hidden hats drawn`);
  if (bad || wrong || cannot || missingCore || noAtlas || hatsInWater) failed = 1;
  // cross-compositor: tools/cityfolk_compose.js (v8, another fragment owner) merging the same three manifests
  if (fs.existsSync(path.join(ROOT, 'tools', 'cityfolk_compose.js'))) {
    const cf = await import('../cityfolk_compose.js');
    let C = null;
    try { C = new cf.Cityfolk(cf.mergeTownfolkFragments(rd('townfolk/manifest.json'), rd('townfolk2/manifest.json'), rd('beachfolk/manifest.json')).townfolk); }
    catch (e) { console.log('cityfolk merge of beachfolk throws:', e.message); failed = 1; }
    if (C) {
      const r2 = mulberry32(5);
      const why = {};
      let checks = 0, playMis = 0, layerMis = 0, pickMis = 0;
      const prs = ['swimmer', 'sunbather', 'family_beach', 'lifeguard', 'beach_tourist', 'surfer', 'beach_bar_staff', 'housekeeper', 'icecream_vendor', 'bellhop'];
      for (let k = 0; k < 1500; k++) {
        const pr = prs[k % prs.length];
        const p = bf.preset(pr, r2);
        for (const a of ['idle', 'walk', 'talk', 'sit', 'swim', 'float', 'sunbathe', 'dig', 'ball_throw', 'ball_catch', 'splash_play', 'surf']) {
          checks++;
          const x = bf.canPlay(p, a), y = C.canPlay(p, a);
          if (x !== y) { playMis++; if (playMis < 4) console.log('cityfolk canPlay differs', pr, a, x, y, p.parts.join(',')); }
          if (bf.pickAnim(p, a).anim !== C.pickAnim(p, a).anim) pickMis++;
          if (x && y) {
            const d = bf.T.anims[a].dirs[k % bf.T.anims[a].dirs.length];
            const l1 = bf.layers(p, a, d, 0).map((l) => l.frame + '|' + l.tint), l2 = C.layers(p, a, d, 0).map((l) => l.frame + '|' + l.tint);
            if (l1.join(';') !== l2.join(';')) {
              layerMis++;
              const extra = l2.filter((f) => !l1.includes(f)).map((f) => f.split('/')[0]);
              const cause = extra.some((f) => (T.parts[f.split('.')[0]] || {}).family === 'hat') ? 'hat not hidden (animHideHead)'
                : extra.some((f) => f.includes('~hat')) ? 'hair squashed under a hidden hat' : 'other';
              why[cause] = (why[cause] || 0) + 1;
            }
          }
        }
      }
      console.log(`cityfolk_compose: ${checks} checks, canPlay mismatch ${playMis}, pickAnim mismatch ${pickMis}, ` +
        `draw-list differences ${layerMis} ${JSON.stringify(why)} (cityfolk does not implement animHideHead yet)`);
      if (playMis || pickMis) failed = 1;
    }
  }
}

if (!noBrowser) {
  const { start } = await import('./serve.mjs');
  const { launch, sleep } = await import('./pw.mjs');
  const HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:#f3e6c8}</style>
<script src="lib/phaser.min.js"></script></head><body><script type="module">
import { townfolkPreload, townfolkInstall, mulberry32 } from './tools/townfolk_compose.js';
import { mergeBeachfolkManifests, Beachfolk, BeachfolkSprite, sunbatheDirFor, headHidden } from './tools/beachfolk_compose.js';
const GL = window.__GLC = { draw: 0 };
for (const P of [WebGLRenderingContext.prototype, window.WebGL2RenderingContext && WebGL2RenderingContext.prototype]) {
  if (!P) continue;
  for (const m of ['drawElements', 'drawArrays']) { const o = P[m]; P[m] = function (...a) { GL.draw++; return o.apply(this, a); }; }
}
const get = async (p) => (await fetch(p)).json();
const man = mergeBeachfolkManifests(await get('assets/townfolk/manifest.json'), await get('assets/townfolk2/manifest.json'),
  await get('assets/beachfolk/manifest.json'));
window.__BF = { ready: false, missing: [], checked: 0, emptyLayers: new Set(), cannot: 0 };
class S extends Phaser.Scene {
  preload() { townfolkPreload(this, man, 'assets/'); }
  create() {
    townfolkInstall(this, man);
    const bf = this.bf = new Beachfolk(man.townfolk);
    const g = this.add.graphics().setDepth(-1e5);
    g.fillStyle(0xf1dfb6, 1).fillRect(0, 0, 720, 1280);
    // sea: the lower-left half (iso shoreline along screen x+), deep -> shallow bands
    const sea = [[0x2c86a8, 0], [0x3fa6bd, 40], [0x67c3cb, 70], [0x9adbd6, 92]];
    for (const [c, o] of sea) g.fillStyle(c, 1).fillPoints([{ x: 0, y: 760 - o }, { x: 720, y: 400 - o }, { x: 720, y: 1280 }, { x: 0, y: 1280 }], true);
    g.fillStyle(0xd9c290, 1).fillPoints([{ x: 0, y: 664 }, { x: 720, y: 304 }, { x: 720, y: 312 }, { x: 0, y: 672 }], true);
    const fx = this.add.graphics().setDepth(-5e4);
    const rng = mulberry32(77);
    this.npcs = [];
    const WATER = new Set(bf.T.water.anims);
    const add = (p, anim, dir, x, y) => {
      const pk = bf.pickAnim(p, anim);
      if (pk.anim !== anim && !(WATER.has(anim) && WATER.has(pk.anim))) { window.__BF.cannot++; return null; }
      anim = pk.anim;
      const s = new BeachfolkSprite(this, bf, p, x, y);
      s.play(anim, dir);
      s.frame = Math.floor(rng() * bf.T.anims[anim].frames); s.refresh(true);
      s.setPosition(x, y);
      this.npcs.push(s);
      if (bf.T.water.anims.includes(anim)) fx.lineStyle(2, 0xffffff, 0.75).strokeEllipse(x, y, 52, 22);
      else if (anim === 'sunbathe') {
        const sh = bf.lieShadow(p, s.dir);
        fx.fillStyle(0x6b5a3a, 0.25);
        const c = Math.cos(sh.angleDeg * Math.PI / 180), sn = Math.sin(sh.angleDeg * Math.PI / 180);
        const pts = []; for (let k = 0; k < 24; k++) { const t = k / 24 * Math.PI * 2; const u = Math.cos(t) * sh.length / 2, v = Math.sin(t) * sh.width / 2;
          pts.push({ x: x + sh.center[0] + u * c - v * sn, y: y + sh.center[1] + u * sn + v * c }); }
        fx.fillPoints(pts, true);
      } else fx.fillStyle(0x6b5a3a, 0.22).fillEllipse(x, y, 34, 14);
      return s;
    };
    const pr = (name) => bf.preset(name, rng);
    // water: swimmers, floaters, surfers, splashing kids at the waterline
    for (let k = 0; k < 7; k++) add(pr(k % 2 ? 'swimmer' : 'family_beach'), 'swim', ['S', 'SE', 'E', 'NE', 'N', 'SW', 'W'][k], 70 + k * 90, 1080 - k * 40 + (k % 2) * 60);
    for (let k = 0; k < 4; k++) add(pr('family_beach'), 'float', ['S', 'SE', 'SW', 'E'][k], 120 + k * 150, 930 - k * 60);
    add(pr('surfer'), 'surf', 'SE', 560, 1080); add(pr('surfer'), 'surf', 'NW', 380, 1190); add(pr('surfer'), 'surf', 'SW', 200, 1210);
    for (let k = 0; k < 4; k++) add(pr('family_beach'), 'splash_play', ['SE', 'S', 'SW', 'E'][k], 90 + k * 160, 760 - k * 80);
    add(pr('lifeguard'), 'swim', 'SE', 640, 860);
    // sand: sunbathers, diggers, ball players, staff, tourists
    // sunbathers on the beach props' lying spots: dir from sunbatheDirFor (lyingFeetDirs, else opposite lyingDirs)
    const spots = [{ lyingDirs: ['NE'] }, { lyingDirs: ['NW'] }, { lyingFeetDirs: ['SW'], lyingDirs: ['NE'] },
      { lyingFeetDirs: ['SE'], lyingDirs: ['NW'] }, { lyingDirs: ['NE'] }];
    for (let k = 0; k < 5; k++) add(pr('sunbather'), 'sunbathe', sunbatheDirFor(spots[k], 0), 90 + k * 130, 560 - k * 50);
    for (let k = 0; k < 3; k++) {
      const s = add(pr('family_beach'), 'dig', ['S', 'SE', 'SW'][k], 80 + k * 110, 380 + k * 20);
      if (s) { const dp = bf.digPoint(s.person, s.dir); fx.fillStyle(0xd2b37a, 1).fillEllipse(s.x + dp[0], s.y + dp[1], 22, 11); }
    }
    this.balls = [];
    for (let k = 0; k < 2; k++) {
      const s = add(pr(k ? 'beach_tourist' : 'swimmer'), k ? 'ball_catch' : 'ball_throw', k ? 'SW' : 'SE', 420 + k * 120, 220 + k * 60);
      if (s) this.balls.push(s);
    }
    add(pr('lifeguard'), 'idle', 'SW', 560, 470); add(pr('lifeguard'), 'wave', 'S', 620, 520);
    add(pr('icecream_vendor'), 'push', 'SE', 360, 300);
    for (const [name, anim, dir, x, y] of [['bellhop', 'push', 'SW', 520, 120], ['receptionist', 'talk', 'S', 600, 150],
      ['doorman', 'wave', 'SE', 660, 110], ['housekeeper', 'walk', 'W', 420, 120], ['beach_bar_staff', 'idle', 'S', 250, 140],
      ['beach_tourist', 'walk', 'SE', 160, 250], ['beach_tourist', 'clap', 'SW', 300, 230], ['sunbather', 'sit', 'SE', 640, 380],
      ['surfer', 'walk', 'SW', 470, 400], ['swimmer', 'happy', 'S', 30, 300]]) add(pr(name), anim, dir, x, y);
    this.ballG = this.add.graphics();
    // audit every frame of every anim each person can play
    const tex = this.textures;
    let checked = 0;
    for (const s of this.npcs) {
      for (const [a, info] of Object.entries(bf.T.anims)) {
        if (!bf.canPlay(s.person, a)) continue;
        for (const d of info.dirs) for (let i = 0; i < info.frames; i++) {
          for (const l of bf.layers(s.person, a, d, i)) {
            checked++;
            const hp = bf.T.parts[l.layer.split('.')[0]];
            if (l.head && hp && hp.family === 'hat' && headHidden(bf.T, l.layer.split('.')[0], a)) window.__BF.missing.push('hidden hat drawn ' + l.frame);
            const core = /^(head\\.|face\\.|brow\\.)/.test(l.layer);
            if (!l.atlas) { if (core) window.__BF.missing.push('no atlas ' + l.frame); else window.__BF.emptyLayers.add(l.layer); }
            else if (!tex.exists(l.atlas)) window.__BF.missing.push('no texture ' + l.atlas);
            else if (core && !tex.get(l.atlas).has(l.frame)) window.__BF.missing.push('missing core frame ' + l.frame);
          }
        }
      }
    }
    window.__BF.checked = checked;
    window.__BF.scene = this; window.__BF.ready = true;
  }
  update(t, dt) {
    for (const s of this.npcs) { s.update(dt); s.place(); }
    this.ballG.clear();
    for (const s of this.balls) {
      const b = this.bf.ballPoint(s.person, s.anim, s.dir, s.frame);
      if (b) this.ballG.setDepth(s.depthBase + (b[2] ? 0.1 : -0.1)).fillStyle(0xffffff, 1).fillCircle(s.x + b[0], s.y + b[1], b[3])
        .fillStyle(0xe8524a, 1).slice(s.x + b[0], s.y + b[1], b[3], 0, 2.1).fillPath();
    }
  }
}
window.__BF.game = new Phaser.Game({ type: Phaser.WEBGL, width: 720, height: 1280, backgroundColor: '#f1dfb6',
  render: { antialias: true }, scene: S, banner: false });
</script></body></html>`;

  const srv = await start(0, { prefix: '/fv/' });
  const browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.route('**/fv/__beachfolk.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: HTML }));
  await page.goto(srv.url + '__beachfolk.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__BF && (window.__BF.ready || window.__BF.err), null, { timeout: 300000 });
  await sleep(1500);
  const res = await page.evaluate(async () => {
    const g = window.__BF.game, C = window.__GLC, sc = window.__BF.scene;
    const d0 = C.draw, f0 = g.loop.frame;
    while (g.loop.frame - f0 < 30) await new Promise((r) => setTimeout(r, 10));
    const n = g.loop.frame - f0;
    const sprites = sc.children.list.filter((o) => o.visible && o.type === 'Image').length;
    const tex = sc.textures.list;
    let px = 0;
    for (const k of Object.keys(tex)) if (k.startsWith('bf_')) { const s = tex[k].source[0]; px += s.width * s.height; }
    return { npcs: sc.npcs.length, sprites, spritesPerPerson: +(sprites / sc.npcs.length).toFixed(1),
      drawPerFrame: +((C.draw - d0) / n).toFixed(1), layersChecked: window.__BF.checked, cannotPlay: window.__BF.cannot,
      beachfolkTextureMiB: +(px * 4 / 2 ** 20).toFixed(1),
      missing: window.__BF.missing.length, missingSample: window.__BF.missing.slice(0, 5),
      neverPackedLayers: [...window.__BF.emptyLayers].slice(0, 12) };
  });
  fs.mkdirSync(path.join(ROOT, 'docs', 'previews'), { recursive: true });
  await page.screenshot({ path: path.join(ROOT, 'docs', 'previews', 'beachfolk_phaser.png') });
  console.log(JSON.stringify(res));
  if (errors.length) console.log('ERRORS', errors.slice(0, 10));
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, 'beachfolk_phaser.json'), JSON.stringify({ res, errors }, null, 1));
  await browser.close();
  await srv.close();
  if (errors.length || res.missing || res.cannotPlay) failed = 1;
}
process.exit(failed);
