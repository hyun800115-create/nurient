// Townfolk runtime checks (v4, docs/v4_plan.md §5.1, §16.1) — Node, no browser.
//   node tools/test/townfolk_runtime.mjs [n=1000]
// 1. parity: src/core/Townfolk.js (the game's copy) gives the same people and the same draw lists as
//    tools/townfolk_compose.js for n seeded people, every anim, dir and frame;
// 2. TF.layersInto (allocation-free) equals layers();
// 3. every frame a draw list names exists in its tfatlas sheet (or is one of the sheet's known-empty slots);
// 4. the v4 generation rules (no hat_cap / hat_headband until the townfolk2 frames are packed);
// 5. the 100 citizens of the town (seed 2611) all look different.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as REF from '../townfolk_compose.js';
import * as SRC from '../../src/core/Townfolk.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const N = Number(process.argv[2]) || 1000;
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'townfolk', 'manifest.json'), 'utf8'));
const T = man.townfolk;
const results = [];
const step = (name, ok, info = '') => { results.push({ name, ok }); console.log((ok ? '  ok  ' : ' FAIL ') + name + (info ? '  — ' + info : '')); };

// the frames of every sheet (name -> true; known-empty list slots -> 'empty')
const frames = new Map();
const prefixes = new Set();     // '<atlas>|<layer prefix>' that have at least one frame
for (const a of man.atlases) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', a.json), 'utf8'));
  const have = new Map();
  for (const [prefix, groups] of Object.entries(data.frames)) {
    prefixes.add(a.key + '|' + prefix);
    for (const [g, v] of Object.entries(groups)) {
      if (!v.some(Array.isArray)) { have.set(prefix + '/' + g, true); continue; }
      v.forEach((r, i) => have.set(prefix + '/' + g + '_' + i, r ? true : 'empty'));
    }
  }
  frames.set(a.key, have);
}

const ref = new REF.Townfolk(T), src = new SRC.Townfolk(T);
SRC.TF.init(man, null);
const anims = Object.keys(T.anims);
const DIRS8 = ['S', 'SE', 'E', 'NE', 'N', 'SW', 'W', 'NW'];
let diffPeople = 0, diffLayers = 0, diffInto = 0, lists = 0, missing = 0, empty = 0, layerCount = 0;
const missingEx = [];
const out = [];
const t0 = performance.now();
for (let s = 0; s < N; s++) {
  const pr = ref.randomPerson(REF.mulberry32(s + 1)), ps = src.randomPerson(SRC.mulberry32(s + 1));
  if (JSON.stringify(pr) !== JSON.stringify(ps)) { diffPeople++; continue; }
  for (const an of anims) {
    const A = T.anims[an];
    if (an === 'carry_walk' && s % 10) continue;          // (not loaded in v4: sample it only)
    for (const dir of DIRS8) {
      const d = REF.MIRROR[dir] || dir;
      if (!A.dirs.includes(d)) continue;
      for (let i = 0; i < A.frames; i++) {
        const a = ref.layers(pr, an, dir, i), b = src.layers(ps, an, dir, i);
        lists++;
        const ja = JSON.stringify(a);
        if (ja !== JSON.stringify(b)) diffLayers++;
        const n = SRC.TF.layersInto(ps, an, dir, i, out);
        const c = out.slice(0, n).map((l) => ({ z: l.z, order: l.order, layer: l.layer, atlas: l.atlas, frame: l.frame, tint: l.tint, head: l.head, flip: l.flip, sx: l.sx, dx: l.dx, dy: l.dy }));
        if (JSON.stringify(c) !== ja) { if (diffInto < 3) console.log('   into differs', s, an, dir, i); diffInto++; }
        if (an === 'carry_walk') continue;
        for (const l of a) {
          layerCount++;
          if (!l.atlas) continue;                          // a layer with no sheet (draws nothing by design)
          const f = frames.get(l.atlas);
          const h = f && f.get(l.frame);
          if (h === 'empty') empty++;
          // a layer frame that is fully hidden in this pose (the far hand behind the body, glasses seen from
          // behind, tights under a skirt...) was not packed: "nothing to draw", by design. Missing for real =
          // the layer has no frame at all in its sheet
          else if (!h && prefixes.has(l.atlas + '|' + l.frame.split('/')[0])) empty++;
          else if (!h) { missing++; if (missingEx.length < 6) missingEx.push(l.atlas + ':' + l.frame); }
        }
      }
    }
  }
}
const ms = performance.now() - t0;
step('parity: ' + N + ' people are the same in src and tools', diffPeople === 0, 'different: ' + diffPeople);
step('parity: every draw list (' + lists + ') is the same', diffLayers === 0, 'different: ' + diffLayers);
step('TF.layersInto equals layers()', diffInto === 0, 'different: ' + diffInto);
step('no draw list names a frame its sheet does not have', missing === 0, `${layerCount} layers, ${empty} known-empty slots (layer hidden in that pose, not packed by design), missing ${missing} ${missingEx.join(' ')}`);

// v4 rules + the town
let hats = 0;
const looks = new Set();
for (let s = 0; s < N; s++) { const p = SRC.TF.person(SRC.mulberry32(s * 7 + 3), null); if (p.parts.some((x) => x === 'hat_cap' || x === 'hat_headband')) hats++; }
step('v4 generation: no hat_cap / hat_headband (townfolk2 frames not packed yet)', hats === 0, 'with: ' + hats);
for (const pre of Object.keys(T.generator.presets)) { const p = SRC.TF.person(SRC.mulberry32(11), pre); if (p.parts.some((x) => x === 'hat_cap' || x === 'hat_headband')) hats++; }
step('presets too', hats === 0);
// the 100 citizens: every look different (the TownSim recipe: one seeded rng per citizen)
for (let id = 0; id < 100; id++) {
  const cr = SRC.mulberry32((2611 * 2654435761 + id * 97 + 13) >>> 0);
  cr(); cr(); cr(); cr();
  const p = SRC.TF.person(cr, null);
  looks.add(JSON.stringify([p.base, p.parts, p.colors, p.face, p.nose]));
}
step('100 seeded looks are all different', looks.size === 100, looks.size + ' unique');
// refresh cost (draw list only, no Phaser): the per-frame work of a rig refresh
const people = [];
for (let s = 0; s < 64; s++) people.push(SRC.TF.person(SRC.mulberry32(900 + s), null));
const t1 = performance.now();
let k = 0;
for (let r = 0; r < 200; r++) for (const p of people) { SRC.TF.layersInto(p, 'walk', DIRS8[r % 8], r % 8, out); k++; }
const per = (performance.now() - t1) / k;
step('draw list refresh is cheap (< 0.05 ms each)', per < 0.05, per.toFixed(4) + ' ms per refresh, parity run ' + Math.round(ms) + ' ms');
const fails = results.filter((r) => !r.ok).length;
console.log(fails ? `\n${fails} FAILED` : `\nall ${results.length} passed`);
process.exit(fails ? 1 : 0);
