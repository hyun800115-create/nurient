// Node environment for the beach tests: the real manifests (read, never changed), the real beachfolk compositor
// (tools/beachfolk_compose.js merged over townfolk + townfolk2) and FakePorts that record what the module asks for.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeBeachfolkManifests, Beachfolk } from '../../beachfolk_compose.js';
import { looksFrom } from '../../../src/beach/looks.js';
import { BeachHost } from '../../../src/beach/host.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const J = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', p), 'utf8'));

let cache = null;
export function manifests() {
  if (cache) return cache;
  const beach = J('beach/manifest.json'), bbld = J('beach_bld/manifest.json');
  const tf = J('townfolk/manifest.json'), tf2 = J('townfolk2/manifest.json'), bf = J('beachfolk/manifest.json');
  const merged = mergeBeachfolkManifests(tf, tf2, bf);
  const defs = Object.assign({}, beach.sprites, bbld.sprites);
  cache = { beach, bbld, merged, defs, bf: new Beachfolk(merged.townfolk), audio5: J('audio5/manifest.json'), water: J('water/manifest.json') };
  return cache;
}
export function looks() { return looksFrom(manifests().bf); }

/** a fake game: clock, coins, toasts, banners, sites, events; `T` advances with step() */
export function fakePorts(o = {}) {
  const rec = { coins: 0, coinsBy: {}, toasts: [], banners: [], sites: [], events: [], sounds: [], restock: [] };
  const P = {
    rec, T: o.T !== undefined ? o.T : 200,
    clock: { T: () => P.T },
    lang: () => o.lang || 'ko',
    emit: (ev) => rec.events.push(ev),
    coins: { add: (n, x, y, fly, tag) => { rec.coins += n; rec.coinsBy[tag || '?'] = (rec.coinsBy[tag || '?'] || 0) + n; } },
    ui: { toast: (m) => rec.toasts.push(m), banner: (a, b) => rec.banners.push([a, b]) },
    sites: { offer: (def) => rec.sites.push(def) },
    chief: { x: () => P.cx, y: () => P.cy },
    cx: 6000, cy: 3300,
  };
  if (o.stage) P.stage = o.stage;
  if (o.missions) P.missions = o.missions;
  return P;
}

export function makeHost(o = {}) {
  const P = fakePorts(o);
  const M = manifests();
  const host = new BeachHost(P, o.saved || null, { seed: o.seed || 7, looks: o.nullLooks ? undefined : looks(), defs: M.defs, callAfter: o.callAfter !== undefined ? o.callAfter : 0, fallbackFerry: o.fallbackFerry !== undefined ? o.fallbackFerry : true });
  return { host, P, M };
}

/** run the host for `secs` game seconds at a fixed step */
export function run(env, secs, dt = 1 / 30, each) {
  const n = Math.round(secs / dt);
  for (let k = 0; k < n; k++) { env.P.T += dt; env.host.update(dt); if (each) each(k); }
}

/** build every step in order (sites reported built; the walk-in by moving the chief; the clean-up by visiting bits) */
export function openAll(env, opts = {}) {
  const { host, P } = env;
  const m = host.model;
  const steps = opts.until ? opts.until : 'up3';
  for (let guard = 0; guard < 40; guard++) {
    const s = m.nextStep();
    if (!s) break;
    if (s === 'reveal') { P.cx = 8000; P.cy = 4600; host.update(0.05); const [x, y] = [8250, 4700]; P.cx = x; P.cy = y; host.update(0.05); continue; }
    if (s === 'cleanup') { for (const b of m.cleanupBits()) { P.cx = b.x; P.cy = b.y; host.update(0.05); } continue; }
    if (s === 'board') { run(env, 11); continue; }
    if (s === 'hotel' || (m.resort.shops.size < 3 && s === null)) break;
    host.built('b_step_' + s);
    if (s === steps) break;
    if (s === 'lifeguard' && opts.shops !== undefined) for (const id of m.cfg.founding.order.slice(0, opts.shops)) m.shopOpened(id, P.T);
  }
  if (opts.shops !== undefined) for (const id of m.cfg.founding.order.slice(0, opts.shops)) m.shopOpened(id, P.T);
  for (let guard = 0; guard < 20 && steps !== 'lifeguard'; guard++) {
    const s = m.nextStep();
    if (!s || ['hotel', 'pool', 'aquarium', 'up2', 'up3'].indexOf(s) < 0) break;
    host.built('b_step_' + s);
    if (s === steps) break;
  }
  host.update(0.05);
}
