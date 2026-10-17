// 금방 places on the v4 street lattice (docs/geumbang_plan.md §4). Integration patch G-P8 moves this block into
// src/data/world.js as WORLD.v43.gb (same field names); gbLayout(WORLD) reads it from there when it exists and
// falls back to these defaults. Pure data + the lattice formula: L(i, j) = (3120 + 64(i + j), 1315 + 32(i − j)).

export const G4 = [3120, 1315];
/** lattice (i, j) -> world px { x, y } */
export function L(i, j) { return { x: G4[0] + 64 * (i + j), y: G4[1] + 32 * (i - j) }; }
/** world px -> lattice { i, j } */
export function P(x, y) { const a = (x - G4[0]) / 64, b = (y - G4[1]) / 32; return { i: (a + b) / 2, j: (a - b) / 2 }; }

export const GB_LAYOUT = {
  hub: { i: 28.4, j: -27.4 },                       // the v4.2 depot (logistics_center anchor)
  bay: 1,                                            // dock 1 = the 금방 van bay
  bayPt: [34.1, -28.9],                              // dockVehiclePoints.delivery_van[0] (the van's anchor, facing SE)
  bay2Pt: [34.1, -26.2],                             // the cargo sleigh's bay (v4.2)
  lgxDockTo: -29.6,                                  // lgx_dock paint grows j −27.6 → −29.6 (bay 1 apron)
  // the spur (data): bay 1 → out along the dock lane → bank_st → ave_s → an S-jog onto 중앙로 (ave) +j; back the same
  // way and reverse-park into bay 1 facing SE. The jog joins / leaves ave's lane ends (i 33 / 31 at j −17).
  spur: {
    out: [[34.1, -28.9], [35.55, -28.9], [35.55, -23.3], [30.75, -23.3], [30.75, -19.4]],
    jogOut: { c1: [30.75, -18.2], c2: [33.0, -18.3] },      // cubic control points to the ave +j lane start
    jogIn: { c1: [31.0, -18.2], c2: [30.75, -18.4] },       // from the ave −j lane end down to ave_s
    in: [[30.75, -19.4], [30.75, -23.3], [35.55, -23.3], [35.55, -28.9]],
    pivot: [35.55, -28.9],                                   // the van stops here, then reverses into the bay
    corner: [35.55, -23.3],                                  // waits here (idle + puffs) while the sleigh has the apron
    joinStreet: 'ave', joinJ: -18,
  },
  pile: [154, 172],                                  // logistics_center dockPoints[0]: the outbound parcel pile
  sign: [23.0, -24.8],                               // gb_sign beside the 은행길 end of lgx_walk
  flag: [33.4, -30.4],                               // gb_flag on the apron edge by bay 1 (clear of the van)
  sledStand: [6.0, -6.5],                            // 역앞 금방 정류장 (G1b): gb_flag + a parked dog sled
  standCurb: { street: 'main', dir: -1, i: 9.4 },     // the van stops at main's west end (−i lane) for the hand-over
  lockers: { apt: [40.6, -18.75], plaza: [7.2, -7.7] },
  openPad: [26.0, -32.2],                             // the 금방 개업 pad: south of the lgx_walk end, west of the door pad
  // the 20 m around bay 1 a reversing van keeps clear of walkers (they wait)
  apronRect: [32.3, 36.3, -29.6, -25.0],
};

/** the layout with WORLD.v43.gb over the defaults (patch G-P8) */
export function gbLayout(WORLD) {
  const w = WORLD && WORLD.v43 && WORLD.v43.gb;
  if (!w) return GB_LAYOUT;
  const out = Object.assign({}, GB_LAYOUT, w);
  out.spur = Object.assign({}, GB_LAYOUT.spur, w.spur || {});
  return out;
}
