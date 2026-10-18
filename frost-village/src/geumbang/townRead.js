// What the 금방 adapter reads from the v4 TownSim, as pure functions (Node-testable; ports_v4.js uses them). Kept apart
// so a renamed TownSim field fails a test instead of silently emptying every home (critique H1: the adapter read
// `c.place`, which TownSim never sets — the place a citizen is at lives in `c.placeObj`, id '<building>:in' when inside).
//   homeSets(entries, getCitizen) -> Map(aid -> Set(hid))   households with someone at home now
//   townSignature(citizens, extra) -> string               changes when homes / households change (AddressBook rebuild)
//   villageGraphOf(R, st, open) -> the sled's road graph from WORLD.roads
//   keepRight(edges, p, back) -> { i, j }                  the cargo sleigh's offset into its right-hand lane (G-P2c)

/** is citizen c inside its own home building `aid` now? (TownSim: state 'in', placeObj.id '<aid>:in' / '<aid>:…') */
export function insideOf(c, aid) {
  if (!c || c.state !== 'in') return false;
  const id = c.placeObj && typeof c.placeObj.id === 'string' ? c.placeObj.id : (typeof c.place === 'string' ? c.place : null);
  return !!id && id.indexOf(aid + ':') === 0;
}

/**
 * entries: the AddressBook entries ({ aid, kind, households: [{ hid, people: [{ cid }] }] }); getCitizen(cid) -> the
 * TownSim citizen. Village houses (kind 'village') are left out: someone always answers there.
 */
export function homeSets(entries, getCitizen) {
  const out = new Map();
  for (const e of entries || []) {
    if (!e || e.kind === 'village') continue;
    const s = new Set();
    for (const h of e.households || []) {
      for (const p of h.people || []) {
        const c = Number.isFinite(p.cid) ? getCitizen(p.cid) : null;
        if (insideOf(c, e.aid)) { s.add(h.hid); break; }
      }
    }
    out.set(e.aid, s);
  }
  return out;
}

/**
 * a cheap signature of who lives where (critique H3: the AddressBook must rebuild when a district home is founded, a
 * newcomer moves in or a village house is finished): citizens with a home, by home, plus extra counts.
 */
export function townSignature(citizens, extra = '') {
  let n = 0, h = 2166136261;
  for (const c of citizens || []) {
    if (!c || !c.home) continue;
    n++;
    const s = String(c.home) + '#' + c.id;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  }
  return n + ':' + (h >>> 0).toString(36) + ':' + extra;
}

/**
 * The sled's road graph (G1b) from WORLD.roads in the model's format { nodes: { id: [x, y] }, edges: [[a, b]], stand }:
 * the drawn old-village roads (open zones / regions only, `via` corners kept), cut into ≤ 150 px steps, plus the 역앞
 * 금방 정류장 at px `st` joined to the nearest node. open(zone, region) -> bool (all open when omitted).
 */
export function villageGraphOf(R, st, open) {
  if (!R || !R.nodes) return null;
  const isOpen = open || (() => true);
  const nodes = {}, edges = [];
  let n = 0;
  for (const e of R.edges || []) {
    const o = e[2] || {};
    if (o.draw === false || !isOpen(o.zone, o.region)) continue;
    const a = R.nodes[e[0]], b = R.nodes[e[1]];
    if (!a || !b) continue;
    const pts = [a].concat(o.via || [], [b]);
    nodes[e[0]] = [a[0], a[1]]; nodes[e[1]] = [b[0], b[1]];
    let prev = e[0];
    for (let k = 1; k < pts.length; k++) {
      const p = pts[k - 1], q = pts[k], steps = Math.max(1, Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 150));
      for (let s = 1; s <= steps; s++) {
        const last = k === pts.length - 1 && s === steps;
        const id = last ? e[1] : 'r' + (n++);
        if (!last) nodes[id] = [Math.round(p[0] + ((q[0] - p[0]) * s) / steps), Math.round(p[1] + ((q[1] - p[1]) * s) / steps)];
        edges.push([prev, id]);
        prev = id;
      }
    }
  }
  if (!edges.length || !st) return null;
  let best = null, bd = Infinity;
  for (const id in nodes) { const p = nodes[id], d = Math.hypot(p[0] - st.x, (p[1] - st.y) * 2); if (d < bd) { bd = d; best = id; } }
  nodes.st = [Math.round(st.x), Math.round(st.y)];
  if (best) edges.push(['st', best]);
  return { nodes, edges, stand: 'st' };
}

/**
 * (critique M4, G-P2c) the cargo sleigh's route (WORLD.v42.sleighRoute) runs on 역앞 거리's centre line and on 중앙로's
 * −j lane both ways: on a RoadNet drive edge (`edges` = RoadNet.driveEdges) along its direction of travel it belongs
 * in that edge's right-hand lane (RoadNet.laneLattice: +i at J − off, −i at J + off, +j at I + off, −j at I − off).
 * p = CargoSleigh.at(s) ({ i, j, di, dj } along the route), back = driving the route backwards. Returns the lattice
 * offset { i, j } from the route point to the lane (0 off the streets: the depot apron, the spur; ≤ 2.2 cells).
 */
export function keepRight(edges, p, back) {
  let ti = 0, tj = 0;
  if (!edges || !p) return { i: 0, j: 0 };
  const di = (p.di || 0) * (back ? -1 : 1), dj = (p.dj || 0) * (back ? -1 : 1);
  for (const e of edges) {
    if (e.axis === 'x' && di !== 0 && dj === 0 && Math.abs(p.j - e.fix) <= e.off + 0.6 && p.i >= e.t0 - 0.5 && p.i <= e.t1 + 0.5) { tj = e.fix - e.off * Math.sign(di) - p.j; break; }
    if (e.axis === 'y' && dj !== 0 && di === 0 && Math.abs(p.i - e.fix) <= e.off + 0.6 && p.j >= e.t0 - 0.5 && p.j <= e.t1 + 0.5) { ti = e.fix + e.off * Math.sign(dj) - p.i; break; }
  }
  return { i: Math.abs(ti) > 2.2 ? 0 : ti, j: Math.abs(tj) > 2.2 ? 0 : tj };
}
