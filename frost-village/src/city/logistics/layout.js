// 솔방울 물류센터 지도 자료 (logistics_runtime, docs/v5_v8_plan.md §4.5 / §6.6). Pure data + small helpers.
//   - the centre at c_logistics on the v4 lattice L(i, j) = (3120 + 64 (i + j), 1315 + 32 (i - j))
//   - the new-town streets the centre needs (ave_c, lgx_st, the dock lane lgx_dock) in WORLD.v4.streets format (P19)
//   - the stage around the centre: vehicle routes to / from the two dock bays, the owners' walk to the front door,
//     the walk-in owners' sidewalk, the 물류 금고 pad; all in px RELATIVE to the centre's anchor (the view adds it)
//   - makeGeo(): the model's geometry, read from the logistics manifest (forkliftPath, rackSlots, customerPoints,
//     staffPoints, dockVehiclePoints ...) — the manifest is read, never changed.
//
// (v8 map change vs the plan, checked with the plan's layout checker — see the build report "Map")
//   The art puts both dock bays on the centre's EAST face: docked vans / trucks stand 0.2 … 4.1 cells east of it.
//   At the plan's c_logistics (west wall i 46.2, east face 53.98) that apron and any lane to it lie in the v6 south
//   sea (i > 55, j < -12; the harbour's trawler backs out along i 56.75 to its lane j -30). So two placements:
//     PLACES.A (default) — the centre 5.6 cells west (west wall i 40.6, on ave_c), the dock lane lgx_dock on the land
//        between the bays and the quay wall (i 52.53 … 54.53), the police station moved behind the centre with its
//        front on the dock lane's end (incidents layout patch in the report). Checker: "no problems".
//     PLACES.plan — the plan's spot with a dock lane at i 58.6 … 60.6: renders, but the checker says the apron and
//        the lane are in the south sea (only for comparison / a sea-less lab).
//   Both: lgx_st 물류길 is 1.9 cells south of the plan's (j -38.6 … -35.9, was -36 … -34) — the front door, its
//   doormat and the outside queue (customerPoints 4–6, art data) stand at j -34.2 … -35.7, i.e. in the plan's traffic
//   lane; ave_c runs down to the moved street (j -35.9).

export const ORIGIN = [3120, 1315];
/** lattice -> px */
export const L = (i, j) => [ORIGIN[0] + 64 * (i + j), ORIGIN[1] + 32 * (i - j)];
/** px -> lattice */
export const px2L = (x, y) => { const a = (x - ORIGIN[0]) / 64, b = (y - ORIGIN[1]) / 32; return [(a + b) / 2, (a - b) / 2]; };

// ---------------------------------------------------------------------------------------------------- placements
//  place: west wall i + front (−Y face) j of the 11 x 8 m footprint; dock: the dock lane, cells east of the east face
export const PLACES = {
  A: { i: 40.6, j: -33.8, dock: { near: 4.15, far: 6.15 }, name: 'A: west on ave_c, dock lane on the quay land' },
  plan: { i: 46.2, j: -33.8, dock: { near: 4.62, far: 6.62 }, name: 'plan c_logistics (apron in the south sea)' },
};
export const DEFAULT_PLACE = 'A';
/** fixed parts of the new town (plan §4.5): ave_c runs from bank_st (j -24.2) down to lgx_st; lgx_st starts at i 37.5 */
const AVE_C = { i: [36.0, 40.0], northJ: -24.2 }, ST_WEST_I = 37.5;
const FOOT = { w: 11 / Math.SQRT2, d: 8 / Math.SQRT2 };   // 7.78 x 5.66 cells

/**
 * Everything the module needs about the map for one placement (pure): the centre, its anchor, the streets (P19
 * format), the lanes, the stage, the till, the walks, the vehicle routes and the model's geometry (makeGeo).
 * All lattice numbers below are offsets from the west wall W, the front line F and the east face E.
 */
export function layoutFor(placeKey = DEFAULT_PLACE) {
  const P = typeof placeKey === 'object' ? placeKey : (PLACES[placeKey] || PLACES[DEFAULT_PLACE]);
  const W = P.i, F = P.j, E = W + FOOT.w, D = P.dock;
  const CENTRE = { id: 'c_logistics', key: 'logistics_center', i: W + FOOT.w / 2, j: F + FOOT.d / 2, region: 'newtown', place: typeof placeKey === 'string' ? placeKey : 'custom' };
  const ANCHOR = L(CENTRE.i, CENTRE.j);
  /** a lattice point as px relative to the centre's anchor */
  const R = (i, j) => { const p = L(i, j); return [p[0] - ANCHOR[0], p[1] - ANCHOR[1]]; };
  const stJ = [F - 4.8, F - 2.1], dockI = [E + D.near, E + D.far];
  const STREETS = [
    { id: 'ave_c', axis: 'y', i: AVE_C.i.slice(), j: [stJ[1], AVE_C.northJ], cls: 'dirt', paint: AVE_C.i.slice(), paintSpan: [stJ[1], AVE_C.northJ], walk: AVE_C.i[0] + 0.3, walkSpan: [stJ[1], AVE_C.northJ], region: 'newtown', name: 'st_ave_c' },
    { id: 'lgx_st', axis: 'x', i: [ST_WEST_I, dockI[1]], j: stJ.slice(), cls: 'dirt', paint: [stJ[0], F - 2.5], walk: F - 2.3, walkSpan: [ST_WEST_I, dockI[1]], region: 'newtown', name: 'st_lgx' },
    { id: 'lgx_dock', axis: 'y', i: dockI.slice(), j: [F - 2.5, F + 4.9], cls: 'dirt', paint: dockI.slice(), paintSpan: [F - 2.5, F + 4.9], region: 'newtown', name: 'st_lgx_dock' },
  ];
  const STREETS_EUP = {
    ave_c: { road: AVE_C.i.slice(), cls: 'asphalt' },
    lgx_st: { road: [stJ[0], F - 2.5], walk: [[F - 2.5, stJ[1]]], cls: 'asphalt' },
    lgx_dock: { road: dockI.slice(), cls: 'asphalt' },
  };
  /** lane centre lines (right-hand traffic, RoadNet.buildLanes: off 0.5 on a 2-lane carriageway < 3.5 cells wide) */
  const LANES = { st_east: F - 4.15, st_west: F - 3.15, dock_north: dockI[1] - 0.5, dock_south: dockI[0] + 0.5 };
  //  where vehicles come on / go off (they fade in / out while moving): lgx_st in front of the centre's west half
  const STAGE = { inI: W + 2.8, outI: W + 2.8 };
  //  the 물류 금고 (settlement till) pad on the forecourt, left of the receiving pad
  const TILL = R(W + 4.75, F - 1.15);
  //  the walk-in owners: from the west sidewalk to the queue, and back out with their parcel
  const WALKIN = { from: R(Math.max(ST_WEST_I + 0.2, W - 5.0), F - 2.3), stand: R(W + 1.0, F - 2.3) };
  //  the forecourt line the van owners walk along (in front of the outdoor props, 1 m south of them)
  const FORECOURT_J = F - 1.15;
  const CURB = { dropI: W + 4.4, pickI: W + 4.2, dwell: 1.3 };
  /** where a kerb stop on the van's way in may be (east lane of lgx_st, after the stage edge, before the dock lane) */
  const CURB_RANGE = { i0: STAGE.inI + 0.6, i1: LANES.dock_north - 1.4, maxPx: 420 };
  const lay = { place: P, W, F, E, CENTRE, ANCHOR, R, STREETS, STREETS_EUP, LANES, STAGE, TILL, WALKIN, FORECOURT_J, CURB, CURB_RANGE };
  lay.vehicleRoutes = (C, family, bay, owner) => vehicleRoutes(lay, C, family, bay, owner);
  lay.ownerWalks = (C, ch) => ownerWalks(lay, C, ch);
  lay.makeGeo = (man) => makeGeoFor(lay, man);
  lay.worldV8 = () => ({ centre: CENTRE, anchor: ANCHOR, streets: STREETS, eup: STREETS_EUP, place: CENTRE.place });
  return lay;
}

/** the bay's lattice i / j (from a dock vehicle point, px rel) */
const ijOfRel = (lay, p) => px2L(p[0] + lay.ANCHOR[0], p[1] + lay.ANCHOR[1]);

/**
 * vehicle routes (px rel, driveLegs specs) for a family at a bay (1 or 2):
 *   in:  stage west -> east lane -> the dock lane (north lane) -> stop beside the bay -> back in (facing SE)
 *   out: forward out of the bay -> the dock lane (south lane) -> the west lane -> stage west
 *   owner: a shop owner's van stops at the kerb by the front door on the way in (the owner hops out: tag 'drop') and
 *          picks the owner up at the kerb by the door on the way out (tag 'pick') — the owner settles while the
 *          forklift loads, and the bay is free again as soon as the pallet is in.
 */
export function vehicleRoutes(lay, C, family, bay, owner = false) {
  const { R, LANES, CURB, STAGE } = lay;
  const vp = ((C.dockVehiclePoints || {})[family] || (C.dockVehiclePoints || {}).delivery_van)[bay - 1];
  const [bi, jb] = ijOfRel(lay, vp);
  const into = [{ p: R(STAGE.inI, LANES.st_east) }];
  if (owner) into.push({ p: R(CURB.dropI, LANES.st_east), dwell: CURB.dwell, tag: 'drop' });
  into.push({ p: R(LANES.dock_north, LANES.st_east) }, { p: R(LANES.dock_north, jb), dwell: 0.35 }, { p: vp.slice(), rev: true });
  const out = [{ p: vp.slice() }, { p: R(LANES.dock_south, jb) }, { p: R(LANES.dock_south, LANES.st_west) }];
  if (owner) out.push({ p: R(CURB.pickI, LANES.st_west), dwell: CURB.dwell, tag: 'pick' });
  out.push({ p: R(STAGE.outI - (owner ? 0.01 : 0), LANES.st_west) });
  return { in: into, out, bayJ: jb, bayI: bi };
}

/**
 * the owner's walks: from the van at the drop kerb (its far-side door, toward the building) to the forecourt by the
 * door; and from the door landing to the pick-up kerb, where the owner waits for the loaded van
 */
export function ownerWalks(lay, C, ch) {
  const { R, LANES, CURB, FORECOURT_J, F } = lay;
  const vp = R(CURB.dropI, LANES.st_east);
  const dp = (ch && ch.doorPoints && ch.doorPoints.SE && ch.doorPoints.SE[1]) || [115, -3];
  const out = [vp[0] + dp[0] * 0.6, vp[1] + dp[1] - 6];
  const [di] = ijOfRel(lay, C.doorPoint);
  return {
    drop: [out, R(CURB.dropI - 0.2, F - 1.95), R(di + 0.7, FORECOURT_J)],
    pick: [R(di + 0.35, F - 1.45), R(CURB.pickI + 0.1, F - 2.32)],
    wait: R(CURB.pickI + 0.1, F - 2.32),
  };
}

// the default placement's constants (what the game uses unless the lead picks another placement: host opts.place)
const DEF = layoutFor(DEFAULT_PLACE);
export const { CENTRE, ANCHOR, R, STREETS, STREETS_EUP, LANES, STAGE, TILL, WALKIN, FORECOURT_J, CURB, CURB_RANGE } = DEF;
export const CHIP = [-120, -560];

/**
 * The two producers are village work buildings on M plots (Civic catalog, P27), so in the game they stand far from
 * the centre and the pickup van's trip is off the stage (host.stageCurb returns null; the van comes back with the
 * pile after roadS). Lab stand-ins: the v4 M plot se_m1 (x 2700, y 2640) and a second spot beside it. A producer
 * built next to lgx_st between the stage edge and the dock lane would get a kerb stop on the van's way in instead.
 */
export const PRODUCER_SPOTS = {
  furniture: { x: 2700, y: 2640, plot: 'se_m1' },
  appliance: { x: 2985, y: 2785, plot: 'lab' },
};

/**
 * The model's geometry from the manifest entry of logistics_center (+ the item / vehicle entries it needs).
 * man: the logistics manifest (sprites, characters). Pure: no Phaser.
 */
export function makeGeo(man, lay = DEF) { return lay.makeGeo(man); }
function makeGeoFor(lay, man) {
  const { R, LANES, TILL, WALKIN, FORECOURT_J } = lay;
  const sp = man.sprites, C = sp.logistics_center, ch = man.characters || {};
  const items = {};
  for (const k of Object.keys(sp)) if (sp[k] && sp[k].kind === 'item') items[k] = { sizeClass: sp[k].sizeClass || 'small', stackStep: sp[k].stackStep || 20, topPx: sp[k].topPx || 40 };
  const staff = C.staffPoints.map((p, k) => ({ role: C.staffRoles[k], p: p.slice(), dir: C.staffDirs[k], band: C.staffBands[k] }));
  const queue = C.customerPoints.map((p, k) => ({ p: p.slice(), dir: C.customerDirs[k], band: C.customerBands[k] }));
  const routes = {};
  for (const fam of ['delivery_van', 'truck_cargo']) for (const bay of [1, 2]) routes[fam + ':' + bay] = vehicleRoutes(lay, C, fam, bay);
  for (const bay of [1, 2]) routes['owner:' + bay] = vehicleRoutes(lay, C, 'delivery_van', bay, true);
  const walks = ownerWalks(lay, C, ch.delivery_van_red);
  return {
    path: C.forkliftPath.map((n) => ({ p: n.point.slice(), dir: n.dir, legDir: n.legDir, legBand: n.legBand, action: n.action || null, reverse: !!n.reverse })),
    slots: C.rackSlots, cats: C.rackCategories, items, stockScale: C.stockScale,
    staff, queue, door: C.doorPoint.slice(), inside: C.insidePoint.slice(), inPoint: C.inPoint.slice(),
    docks: C.dockPoints.map((p) => p.slice()), dockVehiclePoints: C.dockVehiclePoints,
    routes, walks, till: TILL.slice(), walkIn: { from: WALKIN.from.slice(), stand: WALKIN.stand.slice() },
    // the dock lane is one vehicle's at a time: from the turn at the east-lane corner until docked, and from leaving
    // a bay until the turn onto the west lane
    zone: { enter: R(LANES.dock_north, LANES.st_east), leave: R(LANES.dock_south, LANES.st_west) },
    forecourtJ: FORECOURT_J,
  };
}

/** P19 data: what the game adds to WORLD for the centre (world.js `v8` block) */
export function worldV8Logistics(placeKey = DEFAULT_PLACE) {
  return layoutFor(placeKey).worldV8();
}
