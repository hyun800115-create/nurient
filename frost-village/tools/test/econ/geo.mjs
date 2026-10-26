// straight distances between the economy's places (world.js), for the rate model (docs/logistics_plan.md §3.4)
//   node tools/test/econ/geo.mjs [--repo DIR]
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const i = process.argv.indexOf('--repo');
const REPO = path.resolve(i >= 0 ? process.argv[i + 1] : path.resolve(HERE, '..', '..', '..'));
const { WORLD } = await import(pathToFileURL(path.join(REPO, 'src/data/world.js')).href);
const P = {};
for (const s of WORLD.stations) P['stn:' + s.id] = [s.x, s.y];
for (const k of ['market', 'trade']) P[k] = [WORLD[k].x, WORLD[k].y];
const lp = WORLD.labour && WORLD.labour.piles; for (const k in lp || {}) P['pile:' + k] = [lp[k].x, lp[k].y];
const pl = WORLD.plots || {}; for (const k of Object.keys(pl)) { const v = pl[k]; if (v && v.x !== undefined) P['plot:' + k] = [v.x, v.y]; }
const sq = WORLD.v4 && WORLD.v4.square; if (sq) P['dock(cargo)'] = [sq.cargo.x, sq.cargo.y];
console.log(JSON.stringify(P));
const pairs = [['pile:fish', 'stn:grill'], ['pile:log', 'stn:sawmill'], ['pile:wheat', 'stn:bakery'], ['pile:ore', 'stn:smelter'], ['pile:meat', 'stn:smokehouse'], ['stn:grill', 'market'], ['stn:bakery', 'market'], ['stn:smokehouse', 'market'], ['stn:sawmill', 'trade'], ['stn:smelter', 'trade'], ['pile:ore', 'dock(cargo)'], ['pile:meat', 'dock(cargo)'], ['pile:fish', 'dock(cargo)'], ['stn:smokehouse', 'dock(cargo)'], ['market', 'dock(cargo)']];
for (const [a, b] of pairs) if (P[a] && P[b]) console.log(a, '->', b, 'straight px', Math.round(Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1])));
