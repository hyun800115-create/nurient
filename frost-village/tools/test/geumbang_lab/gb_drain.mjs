// gb_drain.mjs — the plan's §8.2 drain census at model level (critique C1: "rerun the census with the buyers on").
//   nice -n 15 node tools/test/geumbang_lab/gb_drain.mjs [--days=2] [--json=<file>]
// The 금방 model on the real v4 roads (fake_env) against:
//   - the REAL v4.2 depot rules: src/systems/depot/Depot.js (racks, raw share, the walk-in 솔방울 상인 07–20 h);
//   - the village's five collection piles (max BALANCE.labour.pileMax): gatherers fill them (rates calibrated below
//     to v4.2 CODE-2's measured pile-full shares), the stations take 75 · 39 · 48 · 45 · 46 a minute, and the surplus
//     porters carry 30 a minute (the full piles take turns) from piles ≥ 90 % for 10 s down to 8,
//     to the station dock (v4.2 CODE-2 §3.1 "flow_dep": raw 13.6 + 창고 12.3 + station ≈ 3);
//   - the station dock: the cargo sleigh takes ≤ 60 every 75 s into the racks (what the racks accept), the train
//     exports ≤ 14 every 90 s at 0.5 × the raw price.
// Scenarios: v4.2 alone · 금방 Lv1 without 금방 집하 · 금방 Lv1 (집하 on, the default) · + 개썰매 2 · all upgrades.
// Numbers per game day (600 s). Not the real game: the routes and the households are the lab's stand-ins (the real
// v4 street graph and town doors, 24 households), the piles are a flow model.

import fs from 'node:fs';
import { makeEnv, hourOf } from './fake_env.mjs';
import { Depot } from '../../../src/systems/depot/Depot.js';
import { GB_TUNING } from '../../../src/geumbang/tuning.js';
import { BALANCE } from '../../../src/data/balance.js';
import { WORLD } from '../../../src/data/world.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=?(.*)$/.exec(a); return m ? [m[1], m[2] || '1'] : [a, '1']; }));
const DAYS = Number(args.days) || 2;
const PILE_MAX = (BALANCE.labour && BALANCE.labour.pileMax) || 40;
// effective gather rates calibrated so that v4.2 alone reproduces CODE-2's measured pile-full shares (fish 60 · log 7 ·
// wheat 27 · ore 66 · meat 79 %, porters 30 a minute): the gatherers idle at a full pile, so the steady-state surplus is
// smaller than the drained-pile rates (99 · 37 · 47 · 92 · 80)
const PILES = [
  { id: 'fish', item: 'item_fish_raw', gather: 78.2, station: 75 },
  { id: 'log', item: 'item_log', gather: 39.3, station: 39 },
  { id: 'wheat', item: 'item_wheat', gather: 49.4, station: 48 },
  { id: 'ore', item: 'item_ore', gather: 48.6, station: 45 },
  { id: 'meat', item: 'item_meat_raw', gather: 53, station: 46 },
];
const PORTERS = 30, RAW_PRICE = { item_fish_raw: 1, item_log: 1, item_wheat: 1, item_ore: 2, item_meat_raw: 3 };

function realDepot() {
  const M = new Depot(null);
  const D = {
    model: M, stock: M.stock, picked: 0, restocked: 0, refused: 0, inflow: 0, initial: 0, sold: 0, soldCoins: 0,
    count: (k) => M.stock.count(k), level: (c) => M.stock.level(c),
    pick(items) { const got = {}; for (const k in items) { const q = M.stock.take(k, items[k]); if (q > 0) { got[k] = q; D.picked += q; } } return got; },
    restock(items) { const ref = {}; for (const k in items) { const q = Math.min(M.room(k), items[k]); if (q > 0) M.stock.add(k, q); D.restocked += q; if (items[k] - q > 0) { ref[k] = items[k] - q; D.refused += items[k] - q; } } return ref; },
    bring() {},
    fill: () => M.total() / M.capTotal(),
  };
  return D;
}

function run(label, opts) {
  const depot = realDepot();
  const piles = PILES.map((p, k) => { const q = WORLD.labour.piles[p.id]; return { id: p.id, item: p.item, x: q.x, y: q.y, n: PILE_MAX * 0.9, max: PILE_MAX, rate: 0, gather: p.gather, station: p.station, fullT: 0, k }; });
  const tune = JSON.parse(JSON.stringify(GB_TUNING));
  if (opts.collect === false) tune.collect.on = false;
  if (args.share) { const [per, max] = args.share.split(',').map(Number); tune.share = { per, max }; }
  if (args.cap) tune.collect.cap = Number(args.cap);
  if (args.keep) tune.collect.keep = Number(args.keep);
  if (args.idle) tune.van.idleWaitS = Number(args.idle);
  const T0 = 600 * 3 + 25 * 7;           // 07:00
  const E = makeEnv({ seed: 23, depot, inflowPerMin: 0, T: T0, piles, tune, buyers: true, village: 'real', lots: opts.lots });
  const m = E.model, env = m.env;
  E.out.piles = piles;                    // (the census moves the same pile objects the sleds take from)
  // the station dock (a flow model) behind the env's dock ports
  const dock = {};
  const dockN = () => Object.values(dock).reduce((a, b) => a + b, 0);
  let toDockPorters = 0, toDockCollect = 0, sleighed = 0, exported = 0, exportCoins = 0, sleighT = 0, trainT = 0;
  env.dockRoom = () => Math.max(0, Math.min(56 + 200, (tune.collect.dockMax || 60) - dockN()));
  env.dockDrop = (items) => { for (const k in items) { dock[k] = (dock[k] || 0) + items[k]; toDockCollect += items[k]; } };
  env.dockSurplus = () => dockN();
  if (opts.gb) {
    m.open({ ceremonyS: 1 });
    for (const k of opts.up || []) m.upgrade(k);
  }
  const fullS = {}, anyFull = { t: 0 }; let samples = 0, fillSum = 0, porterAcc = 0, rr = 0;
  const dt = 1 / 20;
  E.run(600 * DAYS, dt, (E) => {
    // piles: gatherers (stop at full), stations, the surplus porters (≥ 90 % for 10 s, down to 8, 30 a minute shared)
    let full = 0;
    for (const p of piles) {
      if (p.n < p.max) p.n = Math.min(p.max, p.n + (p.gather / 60) * dt);
      p.n = Math.max(0, p.n - (p.station / 60) * dt);
      p.fullT = p.n >= 0.9 * p.max ? p.fullT + dt : 0;
      if (p.n >= 0.9 * p.max) { full++; fullS[p.id] = (fullS[p.id] || 0) + dt; }
    }
    if (full) anyFull.t += dt;
    porterAcc += (PORTERS / 60) * dt;
    while (porterAcc >= 1) {
      porterAcc -= 1;
      // (the full piles take turns: each line has its own raw porter and the 창고 porters go round)
      const full = piles.filter((p) => p.fullT >= 10 && p.n > 8);
      if (!full.length) { porterAcc = 0; break; }
      const src = full[(rr++) % full.length];
      src.n -= 1; dock[src.item] = (dock[src.item] || 0) + 1; toDockPorters++;
    }
    // the cargo sleigh (≤ 60 every 75 s, what the racks accept) and the train (≤ 14 every 90 s, exported)
    sleighT += dt; trainT += dt;
    if (sleighT >= 75) {
      sleighT = 0;
      let n = 60;
      for (const ty of Object.keys(dock)) { if (n <= 0) break; const k = Math.min(n, dock[ty], depot.model.room(ty)); if (k > 0) { depot.model.take([{ ty, n: k }]); dock[ty] -= k; n -= k; sleighed += k; } }
    }
    if (trainT >= 90) {
      trainT = 0;
      let n = 14;
      for (const ty of Object.keys(dock)) { if (n <= 0) break; const k = Math.min(n, dock[ty]); if (k > 0) { dock[ty] -= k; n -= k; exported += k; exportCoins += k * (RAW_PRICE[ty] || 2) * 0.5; } }
    }
    samples++; fillSum += depot.fill();
    if (process.env.GBDBG && samples % 1200 === 0) console.log(label, hourOf(E.T).toFixed(1), "racks", depot.model.total(), JSON.stringify(depot.model.stock.snapshot()), "res", JSON.stringify(m.res), "orders", E.events.filter((e) => e.t === "gb:order").length, "dock", dockN());
  });
  const ev = E.events;
  const orders = ev.filter((e) => e.t === 'gb:order'), del = ev.filter((e) => e.t === 'gb:delivered');
  const byId = new Map(orders.map((e) => [e.id, e]));
  const lat = [];
  for (const d of del) { const o = byId.get(d.id); if (o && hourOf(o.T) >= 7 && hourOf(o.T) < 19.5 && !o.first) lat.push(d.T - o.T); }
  lat.sort((a, b) => a - b);
  const dayOrders = orders.filter((e) => hourOf(e.T) >= 7 && hourOf(e.T) < 20).length;
  const per = (x) => Math.round((x / DAYS) * 10) / 10;
  const S = (k) => +(((fullS[k] || 0) / (600 * DAYS)) * 100).toFixed(0);
  const gbCoins = del.reduce((a, e) => a + e.coins, 0), gbUnits = del.reduce((a, e) => a + e.n, 0);
  const pileOut = toDockPorters + toDockCollect;
  return {
    label,
    anyPileFull: +((anyFull.t / (600 * DAYS)) * 100).toFixed(0), piles: { fish: S('fish'), log: S('log'), wheat: S('wheat'), ore: S('ore'), meat: S('meat') },
    pilesOut: per(pileOut), porters: per(toDockPorters), collected: per(toDockCollect), sleighToRacks: per(sleighed), exported: per(exported),
    buyersSold: per(depot.sold || 0), gbOrders: per(orders.length), gbOrdersByDay: per(dayOrders), gbDelivered: per(del.length), gbUnits: per(gbUnits),
    leftDepot: per((depot.sold || 0) + gbUnits), coins: per((depot.soldCoins || 0) + gbCoins + exportCoins), gbCoins: per(gbCoins),
    medianS: lat.length ? Math.round(lat[Math.floor(lat.length / 2)]) : null, p90S: lat.length ? Math.round(lat[Math.floor(lat.length * 0.9)]) : null,
    rackFill: +((fillSum / samples) * 100).toFixed(1), share: Object.values(m.res).reduce((a, b) => a + b, 0), firstOrder: orders.some((e) => e.first),
  };
}

const rows = [
  run('v4.2 alone (no 금방)', { gb: false }),
  run('금방 Lv1, 집하 off', { gb: true, collect: false }),
  run('금방 Lv1 (집하 on)', { gb: true }),
  run('금방 + 개썰매 2', { gb: true, up: ['sled2'] }),
  run('금방 all upgrades', { gb: true, up: ['pack', 'van2', 'van3', 'sled2'] }),
];
for (const r of rows) console.log(JSON.stringify(r));
if (args.json) fs.writeFileSync(args.json, JSON.stringify({ days: DAYS, pileMax: PILE_MAX, rows }, null, 1));
