// Road markings for the 도시 (asphalt) streets — the roads manifest's markingRule as data (patch P18 bakes them in
// RoadPaint.paintStreets after the curbs; the lab bakes them the same way). Pure.
//   lane_x / lane_y: yellow centre dashes every 2 cells on two-lane carriageways (not inside junction squares,
//   stopping a cell short of a crosswalk); crosswalk_x / crosswalk_y: one zebra module per carriageway cell on every
//   approach of a junction; stall_lines: one per parking bay.
//   -> [{ key, x, y, flipX?, flipY? }] (x, y = the piece anchor in world px; draw at round(anchor) - anchorPx)

const L = (G, i, j) => [G[0] + 64 * (i + j), G[1] + 32 * (i - j)];

/**
 * rn: RoadNet (cells, v4.streets, clsOf, paved, driveNodes); opts.bays: [{ x, y, dir }]; opts.cls: minimum class (2)
 */
export function markings(rn, opts = {}) {
  const out = [];
  if (!rn || !rn.v4) return out;
  const G = rn.G || rn.v4.G, minCls = opts.cls !== undefined ? opts.cls : 2;
  const cell = (i, j) => rn.cell(i, j);
  const streets = (rn.v4.streets || []).filter((s) => s.cls === 'dirt' && s.paint && rn.clsOf(s.id) >= minCls);
  const bands = new Map();          // street id -> { axis, lo, hi (carriageway across), a, b (along), centre }
  for (const s of streets) {
    const pv = rn.paved(s);
    if (!pv) continue;
    const across = s.axis === 'x' ? pv.j : pv.i, along = s.axis === 'x' ? pv.i : pv.j;
    bands.set(s.id, { s, axis: s.axis, lo: Math.min(across[0], across[1]), hi: Math.max(across[0], across[1]), a: Math.min(along[0], along[1]), b: Math.max(along[0], along[1]) });
  }
  // junctions: where an X band and a Y band overlap
  const boxes = [];
  for (const X of bands.values()) for (const Y of bands.values()) {
    if (X.axis !== 'x' || Y.axis !== 'y') continue;
    if (Y.hi <= X.a || Y.lo >= X.b || X.hi <= Y.a || X.lo >= Y.b) continue;
    boxes.push({ X, Y, i0: Y.lo, i1: Y.hi, j0: X.lo, j1: X.hi });
  }
  const inBox = (i, j) => boxes.some((b) => i >= b.i0 - 1e-6 && i < b.i1 - 1e-6 && j >= b.j0 - 1e-6 && j < b.j1 - 1e-6);
  const xw = new Set();
  // crosswalks on each approach that is paved (one cell outside the box)
  for (const b of boxes) {
    const { X, Y } = b;
    for (const ci of [Math.round(b.i0) - 1, Math.round(b.i1)]) {          // X street cells just outside the box
      if (ci < X.a || ci + 1 > X.b) continue;
      for (let cj = Math.ceil(X.lo); cj + 1 <= X.hi + 1e-6; cj++) { const c = cell(ci, cj); if (!c || c.t !== 1) continue; const [x, y] = L(G, ci, cj); out.push({ key: 'crosswalk_x', x: x + 64, y }); xw.add('x' + ci + ',' + cj); }
    }
    for (const cj of [Math.round(b.j0) - 1, Math.round(b.j1)]) {          // Y street cells just outside the box
      if (cj < Y.a || cj + 1 > Y.b) continue;
      for (let ci = Math.ceil(Y.lo); ci + 1 <= Y.hi + 1e-6; ci++) { const c = cell(ci, cj); if (!c || c.t !== 1) continue; const [x, y] = L(G, ci, cj); out.push({ key: 'crosswalk_y', x: x + 64, y }); xw.add('y' + ci + ',' + cj); }
    }
  }
  // centre dashes on two-lane carriageways (width 4 cells): 2-cell spans on the centre line
  for (const B of bands.values()) {
    if (B.hi - B.lo < 3.5) continue;
    const C = (B.lo + B.hi) / 2;
    for (let t = Math.ceil(B.a); t + 2 <= B.b + 1e-6; t += 2) {
      // the span's cells beside the centre line must be plain road, not a junction or a crosswalk
      let ok = true;
      for (let k = -1; k <= 2 && ok; k++) {
        const tt = t + k;
        if (B.axis === 'x') { if (inBox(tt + 0.5, C - 0.5) || inBox(tt + 0.5, C + 0.5) || xw.has('x' + tt + ',' + Math.floor(C - 0.5)) || xw.has('x' + tt + ',' + Math.floor(C))) ok = false; }
        else if (inBox(C - 0.5, tt + 0.5) || inBox(C + 0.5, tt + 0.5) || xw.has('y' + Math.floor(C - 0.5) + ',' + tt) || xw.has('y' + Math.floor(C) + ',' + tt)) ok = false;
      }
      if (!ok) continue;
      if (B.axis === 'x') { const [x, y] = L(G, t, C); out.push({ key: 'lane_x', x: x + 64, y: y + 32 }); }
      else { const [x, y] = L(G, C, t); out.push({ key: 'lane_y', x: x + 64, y: y - 32 }); }
    }
  }
  // parking bays: stall lines (closed end at +X; the other way flips both)
  for (const b of opts.bays || []) out.push({ key: 'stall_lines', x: b.x, y: b.y, flipX: b.dir === 'NW', flipY: b.dir === 'NW' });
  return out;
}
