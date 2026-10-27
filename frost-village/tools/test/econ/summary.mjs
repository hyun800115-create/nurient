// The logistics gates (docs/logistics_plan.md §2.2, §15.3) from one probe output (econ/probe.mjs).
//   import { summarize } from './summary.mjs'      summarize(probeOutput) -> { ... }
//   node tools/test/econ/summary.mjs out.json [more.json ...]       (prints one JSON line per file)
// Shares are of the 1 Hz samples (%), flows per game minute.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const LINES = [
  { id: 'grill', pile: 'fish', raw: 'item_fish_raw', prod: 'item_fish_cooked', g: 'fisherman' },
  { id: 'sawmill', pile: 'log', raw: 'item_log', prod: 'item_plank', g: 'lumberjack' },
  { id: 'bakery', pile: 'wheat', raw: 'item_wheat', prod: 'item_bread', g: 'farmer' },
  { id: 'smelter', pile: 'ore', raw: 'item_ore', prod: 'item_ingot', g: 'miner' },
  { id: 'smokehouse', pile: 'meat', raw: 'item_meat_raw', prod: 'item_meat_cooked', g: 'hunter' },
];
const RAW = LINES.map((l) => l.raw).concat(['item_fish_big']);

export function summarize(d) {
  const r = d.res;
  const mins = Math.max(1e-6, (r.end.t - r.s0.t) / 60);
  const pm = (n) => +(n / mins).toFixed(1);
  const pct = (o, keys) => { if (!o) return null; const t = Object.values(o).reduce((s, x) => s + x, 0); if (!t) return null; const ks = [].concat(keys); return Math.round((100 * ks.reduce((s, k) => s + (o[k] || 0), 0)) / t); };
  const F = (a, b, ty) => {
    let n = 0;
    for (const k in r.flow) {
      const i = k.indexOf('>'), x = k.slice(0, i), y = k.slice(i + 1);
      const okA = a === null || (a instanceof RegExp ? a.test(x) : x === a), okB = b === null || (b instanceof RegExp ? b.test(y) : y === b);
      if (!okA || !okB) continue;
      for (const t in r.flow[k]) if (ty === null || (Array.isArray(ty) ? ty.includes(t) : t === ty)) n += r.flow[k][t];
    }
    return n;
  };
  const o = { minutes: +mins.toFixed(2), samples: r.samples, late: !!d.late, load: d.load, errors: (d.errors || []).length };
  // ---- G6: raw porters' time away from their line (dock / 창고 runs), local jobs, idle
  const raw = {};
  for (const L of LINES) { const s = r.st['raw:' + L.id]; if (s) raw[L.id] = { away: pct(s, 'away'), local: pct(s, 'local'), idleFull: pct(s, 'idle_station_full'), idleEmpty: pct(s, 'idle_pile_empty') }; }
  o.rawPorters = { awayPct: pct(r.st['raw:all'], 'away'), localPct: pct(r.st['raw:all'], 'local'), byLine: raw };
  // ---- stations: processed a minute, busy / starved / blocked
  o.stations = {};
  for (const L of LINES) {
    const s = r.st['stn:' + L.id];
    o.stations[L.id] = { processed: pm(F('in:' + L.id, 'use', L.raw)), made: pm(F('make', 'out:' + L.id, L.prod)), busy: pct(s, 'busy'), starved: pct(s, 'starved'), blocked: pct(s, 'blocked') };
  }
  for (const w of ['cannery', 'toolsmith']) {
    const s = r.st['stn:' + w];
    if (!s) continue;
    const q = { busy: pct(s, 'busy'), starved: pct(s, 'starved'), blocked: pct(s, 'blocked'), noOrder: pct(s, 'no_order') };
    if (w === 'cannery') {
      q.made = pm(F('make', 'out:cannery', 'item_can'));
      q.fishIn = pm(F(null, 'in:cannery', ['item_fish_raw', 'item_fish_big']));
      q.fishInByCrew = pm(F('ch:wh', 'in:cannery', ['item_fish_raw', 'item_fish_big']));
      q.fishInByRawPorter = pm(F(/^ch:raw:/, 'in:cannery', ['item_fish_raw', 'item_fish_big']));
      q.ingotIn = pm(F(null, 'in:cannery', 'item_ingot'));
      const st = r.stn && r.stn.cannery; if (st) q.inAvg = +(st.inSum / st.n).toFixed(1);
    }
    o.stations[w] = q;
  }
  // ---- G1 / G2: piles ≥ 90 %
  o.pile90 = {};
  for (const k in r.piles) { const p = r.piles[k]; o.pile90[k] = Math.round((100 * p.full) / Math.max(1, p.n)); }
  o.pileAvg = {};
  for (const k in r.piles) { const p = r.piles[k]; o.pileAvg[k] = +(p.sum / Math.max(1, p.n)).toFixed(1); }
  o.anyPile90 = r.anyFull !== undefined ? Math.round((100 * r.anyFull) / Math.max(1, r.samples)) : null;
  // ---- G3: 판매대 shelf empty
  const mk = r.misc && r.misc.mk;
  if (mk) o.marketEmpty = { fish: Math.round((100 * (mk.item_fish_cooked_empty || 0)) / r.samples), bread: Math.round((100 * (mk.item_bread_empty || 0)) / r.samples), meat: Math.round((100 * (mk.item_meat_cooked_empty || 0)) / r.samples) };
  // ---- raw that leaves: walked to the dock, by whom
  o.rawToDock = { all: pm(F(null, 'sink:dock_surplus', RAW)), byRawPorters: pm(F(/^ch:raw:/, 'sink:dock_surplus', RAW)), byCrew: pm(F('ch:wh', 'sink:dock_surplus', RAW)), byStationPorters: pm(F('ch:stn', 'sink:dock_surplus', RAW)) };
  o.rawToWarehouse = pm(F(null, 'sink:warehouse', RAW));
  // ---- the 창고 crew (LD4): size, busy, use-busy (jobs to a place that uses the thing, prio ≥ 40), job mix
  const C = r.crew;
  if (C && C.samples) {
    const n = C.n || [];
    o.crew = { first: n.length ? n[0] : null, last: n.length ? n[n.length - 1] : null, max: n.length ? Math.max(...n) : null, busyPct: Math.round((100 * C.busy) / C.samples), useBusyPct: Math.round((100 * C.use) / C.samples), jobs: r.st['wh:job'] || {} };
    if (r.agents && r.agents.crew) o.crew.system = r.agents.crew;
  }
  // ---- gatherers idle at a full pile
  o.gatherersIdle = { all: pct(r.st['g:all'], 'blocked_pile_full') };
  for (const L of LINES) { const s = r.st['g:' + L.g]; if (s) o.gatherersIdle[L.g] = pct(s, 'blocked_pile_full'); }
  // ---- coins created a minute (shop prices; wholesale at 0.7; the restaurant, exports and the 물류창고 as counted)
  const P = r.prices || {};
  let shop = 0;
  for (const k in r.flow) {
    const i = k.indexOf('>'), a = k.slice(0, i), b = k.slice(i + 1);
    for (const ty in r.flow[k]) {
      const n = r.flow[k][ty], p = P[ty] || 0;
      if (b === 'use' && /^shelf:/.test(a)) shop += n * p;
      else if (a === 'wholesale' && b === 'paid') shop += n * p * 0.7;
    }
  }
  const rest = r.end.restEarned - r.s0.restEarned, exp = r.end.exCoins - r.s0.exCoins, dep = r.end.depCoins - r.s0.depCoins;
  o.coins = { createdPerMin: Math.round((shop + rest + exp + dep) / mins), shopsPerMin: Math.round(shop / mins), restaurantPerMin: Math.round(rest / mins), exportPerMin: Math.round(exp / mins), depotPerMin: Math.round(dep / mins), collectedPerMin: Math.round((r.end.earned - r.s0.earned) / mins) };
  o.madePerMin = Math.round((r.end.made - r.s0.made) / mins);
  // ---- (v4.2.1 고기 통조림, docs/build_reports/v421_l0.md §10: gates MG1–MG10)
  const sc = r.misc && r.misc.store, smk = r.misc && r.misc.smokeIn;
  const mc = {
    rack90: o.pile90.meat !== undefined ? o.pile90.meat : null,
    rawMeatLeaving: pm(F(null, /^sink:(dock_surplus|warehouse)$/, 'item_meat_raw')),
    huntersBlocked: o.gatherersIdle.hunter !== undefined ? o.gatherersIdle.hunter : null,
    huntersCaught: pm(F('make', 'pile:meat', 'item_meat_raw') + F('ch:g:hunter', 'pile:meat', 'item_meat_raw')),
    meatCansMade: pm(F('make', 'out:cannery', 'item_can_meat')),
    fishCansMade: pm(F('make', 'out:cannery', 'item_can')),
    ingotIntoCannery: pm(F(null, 'in:cannery', 'item_ingot')),
    meatIntoCannery: pm(F(null, 'in:cannery', 'item_meat_raw')),
    meatIntoCanneryBy: { meatPorter: pm(F('ch:raw:cannery', 'in:cannery', 'item_meat_raw')), crew: pm(F('ch:wh', 'in:cannery', 'item_meat_raw')), rawPorters: pm(F(/^ch:raw:(?!cannery)/, 'in:cannery', 'item_meat_raw')) },
    tradeIngots: pm(F(null, 'shelf:trade', 'item_ingot')),
    smokehouseProcessed: o.stations.smokehouse ? o.stations.smokehouse.processed : null,
    smokehouseInEmpty: smk && smk.n ? Math.round((100 * smk.empty) / smk.n) : null,
    smokehouseInUnderHalf: smk && smk.n ? Math.round((100 * smk.half) / smk.n) : null,
    canneryBlocked: o.stations.cannery ? o.stations.cannery.blocked : null,
    canneryStarved: o.stations.cannery ? o.stations.cannery.starved : null,
    meatCansSold: pm(F('shelf:store', 'use', 'item_can_meat')),
    meatCansExported: pm(F(null, 'sink:dock_surplus', 'item_can_meat')),
    meatCansToCards: pm(F(null, 'sink:cargo', 'item_can_meat')),
    meatCansToWarehouse: pm(F(null, 'sink:warehouse', 'item_can_meat')),
    meatCansWarehouseEnd: r.misc && r.misc.whMeatEnd !== undefined ? r.misc.whMeatEnd : null,
    storeSold: pm(F('shelf:store', 'use', null)),
    storeBothCansEmpty: sc && sc.n ? Math.round((100 * sc.bothEmpty) / sc.n) : null,
    storeCansEmpty: sc && sc.n ? Math.round((100 * sc.canEmpty) / sc.n) : null,
    storeMeatEmpty: sc && sc.n ? Math.round((100 * sc.meatEmpty) / sc.n) : null,
    storeQueueAvg: sc && sc.n && sc.q !== undefined ? +(sc.q / sc.n).toFixed(1) : null,
    storeQueueFull: sc && sc.n && sc.qFull !== undefined ? Math.round((100 * sc.qFull) / sc.n) : null,
    meatPorter: r.st['raw:cannery'] || null,
    meatPorterTrips: r.trips['raw:cannery'] || null,
    meatCanPorterTrips: r.trips['mc:cannery'] || null,
    meatCansByStationPorters: pm(F('out:cannery', 'ch:stn', 'item_can_meat')),
    meatCansByCrew: pm(F('out:cannery', 'ch:wh', 'item_can_meat')),
    meatCansByCanneryPorters: pm(F('out:cannery', /^ch:p[12]:cannery$/, 'item_can_meat')),
  };
  const co = r.misc && r.misc.cannOut;
  if (co && co.n) mc.canneryOut = { fullPct: Math.round((100 * co.full) / co.n), meatAvg: +(co.meatAvg / co.n).toFixed(1), fishAvg: +(co.fishAvg / co.n).toFixed(1), meatAtFull: co.full ? +(co.meatAtFull / co.full).toFixed(1) : null, fishAtFull: co.full ? +(co.fishAtFull / co.full).toFixed(1) : null };
  const made = mc.meatCansMade;
  mc.soldOrExportedShare = made > 0 ? Math.round((100 * (mc.meatCansSold + mc.meatCansExported + mc.meatCansToCards)) / made) : null;
  o.meatcan = mc;
  o.whAvg = r.misc && r.misc.whSum !== undefined ? Math.round(r.misc.whSum / r.samples) : null;
  return o;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  for (const f of process.argv.slice(2)) {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    console.log(path.basename(f), JSON.stringify(d.res ? summarize(d) : { error: 'no result' }));
  }
}
