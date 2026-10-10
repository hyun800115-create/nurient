// harbor_lab Node helpers: the Ports facade (docs/v5_v8_plan.md §5.3) played by a tiny fake game — a clock, coins,
// a chief with a bag that walks onto pads, site offers that finish when asked, a log of everything emitted.
// Deterministic. Nothing here touches a game file.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HarborHost } from '../../../src/harbor/host.js';
import { HARBOR_TUNING } from '../../../src/harbor/tuning.js';
import { LR, PADS } from '../../../src/harbor/layout.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
export const STEPS_ALL = ['railExt', 'station', 'auction', 'lighthouse', 'terminal', 'crane', 'shipyard'];

/** a fake game: { ports, clock, coins, emitted, sites, bag, chief } */
export function fakeGame(o = {}) {
  const g = {
    T: o.T !== undefined ? o.T : 600 * 2 + 25 * 4,     // day 2, 04:00
    coins: o.coins !== undefined ? o.coins : 1e6,
    earned: 0, emitted: [], sites: [], toasts: [], banners: [], sounds: [],
    bag: Object.assign({}, o.bag || {}),
    chief: { x: 0, y: 0 },
    rank: o.rank !== undefined ? o.rank : 3,
    opened: new Set(),
  };
  g.ports = {
    clock: { T: () => g.T, hour: () => ((g.T / 25) % 24), day: () => Math.floor(g.T / 600) },
    lang: () => o.lang || 'ko',
    rank: () => g.rank,
    coins: { add: (n, x, y, fly, tag) => { g.coins += n; g.earned += n; }, spend: (n) => { const q = Math.min(g.coins, n); g.coins -= q; return q; }, value: () => g.coins },
    ui: { toast: (m) => g.toasts.push(m), banner: (m, s) => g.banners.push(m + ' / ' + s) },
    sound: { play: (k) => g.sounds.push(k), at: (k) => g.sounds.push(k) },
    sites: { offer: (def) => g.sites.push(def) },
    world: { open: (id) => g.opened.add(id) },
    chief: {
      x: () => g.chief.x, y: () => g.chief.y,
      count: (item) => g.bag[item] || 0,
      take: (item, n) => { const q = Math.min(n, g.bag[item] || 0); g.bag[item] = (g.bag[item] || 0) - q; return q; },
    },
    emit: (e) => g.emitted.push(e),
  };
  return g;
}

/** a host with `steps` built (by finishing their sites in order) and `trawlers` launched */
export function makeHost(o = {}) {
  const g = fakeGame(o);
  const host = new HarborHost(g.ports, o.saved || null, { tuning: o.tuning || HARBOR_TUNING, seed: o.seed || 7 });
  for (const s of o.steps || []) { host.update(0.016); host.built('h_step_' + s); }
  for (let k = 0; k < (o.trawlers || 0); k++) { host.model.fleet.n++; }
  if (o.trawlers || o.star) { if (o.star) { host.model.stars.n = o.star; } host.model.replan(g.T); }
  return { host, g, m: host.model };
}

/** run the host for `secs` game seconds at `hz` */
export function run(host, g, secs, hz = 10) {
  const dt = 1 / hz, n = Math.round(secs * hz);
  for (let i = 0; i < n; i++) { g.T += dt; host.update(dt); }
}

/** stand the chief on a pad */
export function onPad(g, which) { const [x, y] = LR(PADS[which].i, PADS[which].j); g.chief.x = x; g.chief.y = y; }
export function offPad(g) { g.chief.x = -9999; g.chief.y = -9999; }
