// (v4.2.0.1, designer: "시민들이 물건이나 건물이나 사물에 가려서 이동을 못하거나 갇히는 경우도 있는 거 같아")
// Walking round what stands in the way. Pure JS (no Phaser), used by Roads:
//   segClear   a straight line sampled against blocked(x, y) (the scene's collision test, the walker's radius
//              included): fences, piles, rocks, walls, the fog
//   gridPath   a small A* on a ground grid around one blocked leg, its cells string-pulled back into a few corners
//   rooms      the walled buildings (office, bank, depot: a ring of walls with ONE door gap): out of / into them only
//              through the door
// All distances are ground px (y doubled), like Roads and Iso.gdist.

const gd = (ax, ay, bx, by) => { const dx = ax - bx, dy = (ay - by) * 2; return Math.sqrt(dx * dx + dy * dy); };

/** point in polygon P ([{ x, y }], screen px) */
export function polyIn(P, x, y) {
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i], b = P[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / ((b.y - a.y) || 1e-9) + a.x) inside = !inside;
  }
  return inside;
}

/** nothing blocks the straight line a -> b (sampled every `step` ground px; the first `skip` px are not looked at: the
 *  walker may stand pressed against something it is walking away from). The end point counts. */
export function segClear(blocked, ax, ay, bx, by, step = 10, skip = 12) {
  if (!blocked) return true;
  const L = gd(ax, ay, bx, by);
  if (L < 1) return true;
  const n = Math.max(1, Math.ceil(L / step));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    if (t * L < skip) continue;
    if (blocked(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}

/**
 * A way from a to b round what blocks the straight line: A* over a grid of `cell` ground px in a window around the two
 * points (grown cells keep it under `maxCells`), 8 neighbours without cutting corners. A start or end inside something
 * moves to the nearest free cell. Returns the corners ([{ x, y }], the last one is b itself) or null (no way inside the
 * window, or nothing to go round). opt.wide(x, y): the same test with room to spare — cells that fail it cost more
 * (the way keeps to the middle of a gap, off the walls), and the corners are pulled straight only where it holds.
 * opt.maxExpand: cells looked at before it gives up; opt.stats: { exp } gets the count added (Roads' frame budget).
 * ((v4.2.0.1 final, review #2) the grid's arrays are kept between calls (no ~400 KB of garbage per search))
 */
let CAP = 0, ST = null, WST = null, GG = null, FF = null, FROM = null, CLOSED = null;
const HEAP = [];
function scratch(N) {
  if (N > CAP) {
    CAP = Math.max(N, 4096);
    ST = new Uint8Array(CAP); WST = new Uint8Array(CAP); GG = new Float32Array(CAP); FF = new Float32Array(CAP);
    FROM = new Int32Array(CAP); CLOSED = new Uint8Array(CAP);
  }
  ST.fill(0, 0, N); WST.fill(0, 0, N); GG.fill(Infinity, 0, N); FROM.fill(-1, 0, N); CLOSED.fill(0, 0, N);
  HEAP.length = 0;
}

export function gridPath(blocked, ax, ay, bx, by, opt) {
  const o = opt || {};
  const L = gd(ax, ay, bx, by);
  let cs = o.cell || 24;
  const M = o.margin || Math.max(200, Math.min(520, L * 0.45));
  const gx0 = Math.min(ax, bx) - M, gy0 = Math.min(ay, by) * 2 - M;
  const gx1 = Math.max(ax, bx) + M, gy1 = Math.max(ay, by) * 2 + M;
  let W = Math.ceil((gx1 - gx0) / cs), H = Math.ceil((gy1 - gy0) / cs);
  const MAXC = o.maxCells || 26000;
  while (W * H > MAXC) { cs *= 1.25; W = Math.ceil((gx1 - gx0) / cs); H = Math.ceil((gy1 - gy0) / cs); }
  const N = W * H;
  scratch(N);
  const st = ST;                           // 0 not looked at, 1 free, 2 blocked
  const cx = (k) => gx0 + ((k % W) + 0.5) * cs, cy = (k) => (gy0 + (Math.floor(k / W) + 0.5) * cs) / 2;
  const free = (k) => { let s = st[k]; if (!s) s = st[k] = blocked(cx(k), cy(k)) ? 2 : 1; return s === 1; };
  const W2 = o.wide, wst = WST;
  const tight = (k) => { if (!W2) return false; let s = wst[k]; if (!s) s = wst[k] = W2(cx(k), cy(k)) ? 2 : 1; return s === 2; };
  const pull = W2 || blocked;
  const cellOf = (x, y) => { const i = Math.floor((x - gx0) / cs), j = Math.floor((y * 2 - gy0) / cs); return i < 0 || j < 0 || i >= W || j >= H ? -1 : j * W + i; };
  const nearFree = (k, x, y, R) => {
    if (k < 0) return -1;
    if (free(k)) return k;
    const i0 = k % W, j0 = Math.floor(k / W);
    for (let r = 1; r <= R; r++) {
      let best = -1, bd = Infinity;
      for (let j = j0 - r; j <= j0 + r; j++) {
        for (let i = i0 - r; i <= i0 + r; i++) {
          if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r || i < 0 || j < 0 || i >= W || j >= H) continue;
          const q = j * W + i;
          if (!free(q)) continue;
          const d = gd(x, y, cx(q), cy(q));
          if (d < bd) { bd = d; best = q; }
        }
      }
      if (best >= 0) return best;
    }
    return -1;
  };
  const s = nearFree(cellOf(ax, ay), ax, ay, 3), g = nearFree(cellOf(bx, by), bx, by, o.goalR || 6);
  if (s < 0 || g < 0) return null;
  // A* (binary heap of cell indices, lazy deletion)
  const G = GG, F = FF, from = FROM, closed = CLOSED;
  const heap = HEAP;
  const push = (k) => { heap.push(k); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (F[heap[p]] <= F[heap[i]]) break; const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && F[heap[l]] < F[heap[m]]) m = l; if (r < heap.length && F[heap[r]] < F[heap[m]]) m = r; if (m === i) break; const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m; } } return top; };
  const gi = g % W, gj = Math.floor(g / W);
  const hEst = (k) => { const di = Math.abs((k % W) - gi), dj = Math.abs(Math.floor(k / W) - gj); return Math.max(di, dj) + 0.4142 * Math.min(di, dj); };
  G[s] = 0; F[s] = hEst(s); push(s);
  let found = false, guard = 0;
  const maxExp = o.maxExpand || 20000;
  while (heap.length) {
    const k = pop();
    if (k === g) { found = true; break; }
    if (closed[k]) continue;
    closed[k] = 1;
    if (++guard > maxExp) break;
    const i = k % W, j = (k - i) / W;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const q = nj * W + ni;
        if (closed[q] || !free(q)) continue;
        // no cutting a corner past a blocked cell
        if (di && dj && (!free(j * W + ni) || !free(nj * W + i))) continue;
        const ng = G[k] + (di && dj ? 1.4142 : 1) * (tight(q) ? 2.5 : 1);
        if (ng < G[q]) { G[q] = ng; F[q] = ng + hEst(q); from[q] = k; push(q); }
      }
    }
  }
  if (o.stats) o.stats.exp = (o.stats.exp || 0) + guard;
  if (!found) return null;
  const cells = [];
  for (let k = g; k !== s && k >= 0; k = from[k]) cells.push(k);
  cells.reverse();
  const pts = cells.map((k) => ({ x: cx(k), y: cy(k) }));
  // string-pull: from where the walker is, as far along the cells as a straight line stays clear
  const out = [];
  let px = ax, py = ay, i = 0, first = true;
  while (i < pts.length) {
    let j = i;
    while (j + 1 < pts.length && segClear(pull, px, py, pts[j + 1].x, pts[j + 1].y, 8, first ? 12 : 0)) j++;
    if (j + 1 >= pts.length && segClear(pull, px, py, bx, by, 8, first ? 12 : 0)) break;
    out.push(pts[j]);
    px = pts[j].x; py = pts[j].y; i = j + 1; first = false;
  }
  out.push({ x: bx, y: by });
  return out;
}

/**
 * A walled building as Roads sees it: { poly, door, entry, out }. `entry` (inside, a step behind the door) is given by
 * the building's manifest, else the door moved `inset` px toward the inside along its wall's normal; `out` is the door
 * moved `step` px outward (the Aide's way out: Staff.js).
 */
export function makeRoom(poly, door, entry, id, step = 48, inset = 50) {
  const P = poly.map((q) => ({ x: q.x, y: q.y }));
  let cx = 0, cy = 0;
  for (const q of P) { cx += q.x; cy += q.y; }
  cx /= P.length; cy /= P.length;
  let ux, uy;
  if (entry) { ux = door.x - entry.x; uy = door.y - entry.y; }
  else {
    // the wall the door is on: its normal (ground space), the side away from the middle
    let bi = 0, bd = Infinity;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      const vx = b.x - a.x, vy = (b.y - a.y) * 2, l2 = vx * vx + vy * vy || 1;
      const t = Math.max(0, Math.min(1, ((door.x - a.x) * vx + (door.y - a.y) * 2 * vy) / l2));
      const d = gd(door.x, door.y, a.x + vx * t, a.y + (vy * t) / 2);
      if (d < bd) { bd = d; bi = i; }
    }
    const a = P[bi], b = P[(bi + 1) % P.length];
    let nx = -(b.y - a.y) * 2, ny = (b.x - a.x) / 2;
    if (nx * (door.x - cx) + ny * (door.y - cy) < 0) { nx = -nx; ny = -ny; }
    ux = nx; uy = ny;
  }
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul; uy /= ul;
  const en = entry ? { x: entry.x, y: entry.y } : { x: door.x - ux * inset, y: door.y - uy * inset };
  const xs = P.map((q) => q.x), ys = P.map((q) => q.y);
  return {
    id: id || null, poly: P, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    door: { x: door.x, y: door.y }, entry: en, out: { x: door.x + ux * step, y: door.y + uy * step },
  };
}

export function inRoom(r, x, y) {
  const b = r.box;
  return x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3] && polyIn(r.poly, x, y);
}

/** the legs out of room r from (x, y): the entry point first when deeper inside than it, the door, a step outside */
export function exitLegs(r, x, y, out) {
  if (gd(x, y, r.door.x, r.door.y) > gd(r.entry.x, r.entry.y, r.door.x, r.door.y) + 8) out.push({ x: r.entry.x, y: r.entry.y });
  out.push({ x: r.door.x, y: r.door.y }, { x: r.out.x, y: r.out.y });
  return out;
}

/** the legs into room r to (x, y) from its outside step: the door, the entry point when (x, y) is deeper, (x, y) */
export function entryLegs(r, x, y, out) {
  out.push({ x: r.door.x, y: r.door.y });
  if (gd(x, y, r.door.x, r.door.y) > gd(r.entry.x, r.entry.y, r.door.x, r.door.y) + 8) out.push({ x: r.entry.x, y: r.entry.y });
  out.push({ x, y });
  return out;
}
