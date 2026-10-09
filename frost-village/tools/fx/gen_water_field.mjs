// gen_water_field.mjs - bake the shoreline field of static coasts offline (CONTRACT_V7 §V, water polish).
//
// The village sea covers the whole world width (6144 x 2708 px = 520 k fine cells); building its field in the
// page blocks the main thread for 0.4-2.8 s at Game creation. The coast is static data (WORLD.shore), so its
// field is baked here into assets/water/field_village.png (opaque RGB, 3 bands stacked vertically, see
// Water._useBaked) + a manifest entry fields.village = { key, version, sig, fnx, fny, s, autoDir, region }.
// Water uses the baked field only when the signature (region, mask samples, shore types, field version) of
// the region it is asked to build matches; otherwise it builds the field itself (and warns).
//
//   node tools/fx/gen_water_field.mjs           -> writes the PNG + manifest entry
//   node tools/fx/gen_water_field.mjs --check   -> exit 1 when the baked field is missing or stale
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Water, WaterPresets } from '../../src/systems/Water.js';
import { shoreY, WORLD } from '../../src/data/world.js';
// (v4-C2) the game's village sea = WaterPresets.village widened to the west strip (WORLD.left < 0)
import { villageSeaPreset } from '../../src/systems/VillageSea.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'assets', 'water');
const MAN = path.join(OUT, 'manifest.json');
const CHECK = process.argv.includes('--check');

const FIELDS = {
  village: () => villageSeaPreset(),
};

const man = JSON.parse(fs.readFileSync(MAN, 'utf8'));
man.fields = man.fields || {};
const report = {};
let stale = 0;
for (const [name, cfg] of Object.entries(FIELDS)) {
  const t0 = performance.now();
  const w = new Water(null, cfg());
  const ms = performance.now() - t0;
  const bk = w.bakeData();
  const key = 'water_field_' + name, file = 'field_' + name + '.png';
  // hash of the field bytes: a change of the field maths makes the bake stale even when the inputs did not change
  let hsh = 0x811c9dc5;
  for (let i = 0; i < bk.rgb.length; i++) { hsh ^= bk.rgb[i]; hsh = Math.imul(hsh, 0x01000193) >>> 0; }
  bk.meta.dataHash = ('0000000' + hsh.toString(16)).slice(-8);
  const have = man.fields[name];
  const fresh = have && have.sig === bk.meta.sig && have.version === bk.meta.version && have.dataHash === bk.meta.dataHash && fs.existsSync(path.join(OUT, file));
  report[name] = { sig: bk.meta.sig, dataHash: bk.meta.dataHash, field: [bk.meta.fnx, bk.meta.fny], fieldScale: bk.meta.s, buildMs: +ms.toFixed(0), baked: !!fresh };
  if (CHECK) { if (!fresh) stale++; continue; }
  // RGB bytes -> PNG through PIL (no node image dependency)
  const raw = path.join(OUT, '.field_' + name + '.rgb');
  fs.writeFileSync(raw, bk.rgb);
  execFileSync('python3', ['-c', `import sys; from PIL import Image
w, h = int(sys.argv[2]), int(sys.argv[3])
Image.frombytes('RGB', (w, h), open(sys.argv[1], 'rb').read()).save(sys.argv[4], optimize=True)`, raw, String(bk.meta.fnx), String(bk.meta.fny * 3), path.join(OUT, file)]);
  fs.unlinkSync(raw);
  man.fields[name] = Object.assign({ key, png: 'water/' + file }, bk.meta);
  // the image is loaded with the fragment (eager: Ground needs it at Game creation)
  man.images = (man.images || []).filter((im) => im.key !== key);
  man.images.push({ key, png: 'water/' + file, frameSize: [bk.meta.fnx, bk.meta.fny * 3], kind: 'data',
    channels: 'rows [0, fny): d, wave distance, run-up | [fny, 2 fny): depth, edge kind, snow | [2 fny, 3 fny): coast dir x, y',
    notes: 'baked shoreline field of the ' + name + ' sea (tools/fx/gen_water_field.mjs); Water uses it when fields.' + name + '.sig matches' });
  report[name].bytes = fs.statSync(path.join(OUT, file)).size;
  report[name].baked = true;
}
if (!CHECK) fs.writeFileSync(MAN, JSON.stringify(man, null, 1));
console.log(JSON.stringify(report, null, 1));
process.exit(CHECK && stale ? 1 : 0);
