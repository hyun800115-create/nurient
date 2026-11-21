// Exports the Phaser game's pure-data modules to JSON for the Unity port (00_architecture.md A9, WP-1).
// Usage (Node 22):  node export_data.mjs <path to nurient/frost-village> <output folder>
//   e.g. node Tools/export/export_data.mjs D:/Work/Snowbloom/nurient/frost-village Assets/_Snowbloom/Data
// Only data is written; functions in the modules are skipped (priceOf is evaluated into a table).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [gameDir, outDir] = process.argv.slice(2);
if (!gameDir || !outDir) { console.error('usage: node export_data.mjs <frost-village dir> <out dir>'); process.exit(2); }
const mod = (rel) => import(pathToFileURL(path.resolve(gameDir, 'src/data', rel)).href);
const dataOnly = (m) => Object.fromEntries(Object.entries(m).filter(([, v]) => typeof v !== 'function'));
const write = (name, obj) => {
  fs.mkdirSync(outDir, { recursive: true });
  const text = JSON.stringify(obj, null, 1) + '\n';
  fs.writeFileSync(path.join(outDir, name), text);
  console.log(name.padEnd(18), String(text.length).padStart(8), 'bytes');
};

const world = await mod('world.js');
const balance = await mod('balance.js');
const strings = await mod('strings.js');
const items = await mod('items.js');
const looks = await mod('staffLooks.js');
const ids = await mod('ids43.js');
const version = await mod('version.js');

write('world.json', world.WORLD);
write('balance.json', balance.BALANCE);
write('strings.json', { STRINGS: strings.STRINGS, LINES: strings.LINES, TOWN_NAMES: strings.TOWN_NAMES });
const prices = {};
for (const k of items.ITEMS || []) prices[k] = items.priceOf(k);
write('items.json', Object.assign(dataOnly(items), { PRICES: prices }));
write('staff_looks.json', dataOnly(looks));
write('ids43.json', dataOnly(ids));
write('version.json', dataOnly(version));
