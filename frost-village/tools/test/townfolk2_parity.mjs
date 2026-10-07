// Python <-> JS parity for the townfolk v5 compositor (tools/townfolk2_compose.py vs .js).
//   python3 tools/blender/tf2_check.py --dump /tmp/fv_review/townfolk2_cases.json
//   node tools/test/townfolk2_parity.mjs /tmp/fv_review/townfolk2_cases.json
// Merges assets/townfolk + assets/townfolk2 with mergeTownfolkManifests(), recomputes every dumped draw list
// (person, anim, dir, frame, face override) with Townfolk2.layers() and compares frame names, order, z and
// tints with the python reference.  Also runs the JS generator for every preset (2000 people) and checks that
// every drawn frame name is listed in frameAtlas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeTownfolkManifests, Townfolk2 } from '../townfolk2_compose.js';
import { mulberry32, forEachTfFrame } from '../townfolk_compose.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const casesPath = process.argv[2] || '/tmp/fv_review/townfolk2_cases.json';
const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/townfolk/manifest.json'), 'utf8'));
const man2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/townfolk2/manifest.json'), 'utf8'));
const M = mergeTownfolkManifests(man, man2);
const tf = new Townfolk2(M.townfolk);
const data = JSON.parse(fs.readFileSync(casesPath, 'utf8'));
let bad = 0, n = 0;
const hex = (t) => (t == null ? null : '#' + t.toString(16).padStart(6, '0').toUpperCase());
for (const c of data.cases) {
  const p = data.persons[c.p];
  const js = tf.layers(p, c.anim, c.dir, c.i, { face: c.face });
  const a = js.map((l) => [l.z, l.frame, hex(l.tint)]);
  const b = c.layers;
  n++;
  let ok = a.length === b.length;
  for (let k = 0; ok && k < a.length; k++) {
    if (a[k][0] !== b[k][0] || a[k][1] !== b[k][1]) ok = false;
    else if ((a[k][2] == null) !== (b[k][2] == null)) ok = false;
    else if (a[k][2]) {
      const x = parseInt(a[k][2].slice(1), 16), y = parseInt(b[k][2].slice(1), 16);
      for (let s = 0; s < 24; s += 8) if (Math.abs(((x >> s) & 255) - ((y >> s) & 255)) > 1) ok = false;
    }
  }
  if (!ok) {
    bad++;
    if (bad <= 5) console.log('MISMATCH', JSON.stringify(c).slice(0, 300), '\n js', JSON.stringify(a).slice(0, 600));
  }
}
// JS generator: every preset + random people; every drawn frame must be in frameAtlas
const T = M.townfolk;
// every frame of every atlas must resolve through the JS lookup to the atlas that holds it
let wrong = 0, total = 0;
for (const at of M.atlases) {
  const js = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', at.json), 'utf8'));
  forEachTfFrame(js, (name) => {
    total++;
    const [layer, fr] = name.split('/');
    let key;
    if (layer.includes('@')) { const anim = fr.split('_').slice(0, -2).join('_'); key = ((T.frameAtlasAnim || {})[anim] || {})[layer] || T.frameAtlas[layer]; }
    else { const hp = fr.split('_')[0]; key = ((T.frameAtlasPose || {})[hp] || {})[layer] || T.frameAtlas[layer]; }
    if (key !== at.key) { wrong++; if (wrong < 5) console.log('lookup', name, key, '!=', at.key); }
  });
}
console.log(`atlas lookup: ${total - wrong}/${total} frames resolve to their atlas`);
const presets = Object.keys(T.generator.presets);
const rng = mulberry32(99);
let people = 0, missingAtlas = 0;
const newPresets = ['bride', 'groom', 'wedding_guest', 'flower_girl', 'mourner', 'mourner_family'];
for (let k = 0; k < 2000; k++) {
  const pr = k % 3 === 0 ? null : (k % 3 === 1 ? newPresets[k % newPresets.length] : presets[k % presets.length]);
  const p = pr ? tf.preset(pr, rng) : tf.randomPerson(rng);
  people++;
  for (const [a, d, i] of [['sad', 'SW', 1], ['clap', 'E', 4], ['sit', 'S', 2], ['push', 'NW', 6], ['walk', 'SE', 3]]) {
    for (const l of tf.layers(p, a, d, i)) {
      if (!l.atlas) { missingAtlas++; if (missingAtlas < 5) console.log('no atlas for', l.frame); }
    }
  }
}
console.log(`parity: ${n - bad}/${n} draw lists identical; JS generator ${people} people, ${missingAtlas} layers without atlas`);
process.exit(bad || missingAtlas || wrong ? 1 : 0);
