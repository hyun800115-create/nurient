// vehicles_lab world stub: the v4 RoadNet with the v5 streets added the way the game will add them (patch P19 /
// ports.roads.addStreet): the street joins WORLD.v4.streets (+ its eup entry) and RoadNet.upgrade() rebuilds the
// cells and lanes. Used by the Node tests (on a copy of WORLD.v4) and by the lab page (on the page's own in-memory
// WORLD.v4, so the real RoadPaint sees the same streets). Nothing here changes a file.

import { WORLD } from '../../../src/data/world.js';
import { RoadNet } from '../../../src/systems/RoadNet.js';
import { V5_EUP, streetsFor, sledTracks } from '../../../src/vehicles/layout.js';

const V4_ROADS = ['main', 'back', 'ave'];

/**
 * roads for a built state: { rn, V, add(built), setClass(cls), tracks() }. inPlace = mutate WORLD.v4 (the lab).
 * rank 2 (읍) paves main / back / ave as cobble like Rank.js does at the 읍 ceremony.
 */
export function makeRoads(opts = {}) {
  const V = opts.inPlace ? WORLD.v4 : Object.assign({}, WORLD.v4, { streets: WORLD.v4.streets.slice(), eup: Object.assign({}, WORLD.v4.eup) });
  if (opts.inPlace) V.eup = Object.assign(V.eup || {}, {});
  const rn = new RoadNet(V, opts.doors ? { doors: opts.doors } : {});
  let cls = opts.cls || 'cobble';
  for (const id of V4_ROADS) rn.upgrade(id, cls);
  const api = {
    rn, V,
    /** add the streets the built flags open (returns the ids added) */
    add(built) {
      const out = [];
      for (const s of streetsFor(built)) {
        if (V.streets.some((q) => q.id === s.id)) continue;
        V.streets.push(Object.assign({}, s));
        V.eup[s.id] = V5_EUP[s.id];
        rn.upgrade(s.id, cls);
        out.push(s.id);
      }
      return out;
    },
    /** repave every street (the 도시 ceremony: 'asphalt') */
    setClass(c, ids) {
      cls = c;
      for (const s of V.streets) if ((s.cls === 'dirt' && s.paint) && (!ids || ids.indexOf(s.id) >= 0)) rn.upgrade(s.id, c);
    },
    tracks(open) { return sledTracks(WORLD.roads, open || (() => true)); },
    cls: () => cls,
  };
  if (opts.built) api.add(opts.built);
  return api;
}

export { WORLD };
