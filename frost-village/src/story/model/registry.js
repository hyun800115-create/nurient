// PersonRegistry (docs/v5_v8_plan.md §5.6): one record per person. Maps the game's person ids (pid) to story ids
// (sid), remembers who the chief knows (단골 ★: served or tapped ≥ knownServed times; district and village people;
// families of people in an active mission), and who drives each body right now (lease owner: 'town' routine,
// 'gameplay', 'story'). Exactly one owner per body at any time (asserted in the tests). Pure.
//
// pid prefixes: v:<villager key> (named villagers) · t:<citizen id> (TownSim) · s:<n> (settlers) · d:<…> (district,
// when the game uses them) · h: / b: / c: (harbour, beach, newtown staff, v6–v8)

export const OWNERS = ['town', 'gameplay', 'story'];

export class PersonRegistry {
  constructor(opts = {}) {
    this.knownServed = opts.knownServed || 3;
    this.bySid = new Map();       // sid -> pid
    this.byPid = new Map();       // pid -> sid
    this.meta = new Map();        // pid -> { served, tapped, owner, role, kept, mission }
  }

  bind(pid, sid, info = {}) {
    pid = String(pid);
    const old = this.byPid.get(pid);
    if (old !== undefined && old !== sid) this.bySid.delete(old);
    this.byPid.set(pid, sid);
    this.bySid.set(sid, pid);
    const m = this.meta.get(pid) || { served: 0, tapped: 0, owner: 'town', role: null, kept: false, mission: false };
    if (info.role) m.role = info.role;
    if (info.kept !== undefined) m.kept = !!info.kept;
    if (info.owner) m.owner = info.owner;
    this.meta.set(pid, m);
    return m;
  }

  unbind(pid) {
    pid = String(pid);
    const sid = this.byPid.get(pid);
    if (sid !== undefined) this.bySid.delete(sid);
    this.byPid.delete(pid);
    this.meta.delete(pid);
    return sid;
  }

  sidOf(pid) { const s = this.byPid.get(String(pid)); return s === undefined ? -1 : s; }
  pidOf(sid) { return this.bySid.get(sid) || null; }
  has(pid) { return this.byPid.has(String(pid)); }
  get size() { return this.byPid.size; }
  pids() { return Array.from(this.byPid.keys()); }

  /** the chief served / sold to this person (a visitor at the market) */
  served(pid) { const m = this.meta.get(String(pid)); if (m) m.served++; return m ? m.served : 0; }
  /** the chief tapped this person (name card / chat) */
  tapped(pid) { const m = this.meta.get(String(pid)); if (m) m.tapped++; return m ? m.tapped : 0; }
  setMission(pid, on) { const m = this.meta.get(String(pid)); if (m) m.mission = !!on; }
  /** the game already counted this person's visits (TownSim c.visits: v4 regulars) — the story starts from there */
  seedServed(pid, n) { const m = this.meta.get(String(pid)); if (m && Number.isFinite(n) && n > m.served) m.served = Math.min(999, n | 0); }

  /** a person the chief knows: their life beats get story cards (plan §6.1 "Known people") */
  known(pid) {
    pid = String(pid);
    const m = this.meta.get(pid);
    if (!m) return false;
    if (m.kept || m.mission) return true;
    // (settlers are adopted only once they have a body the player can see: then their role makes them known)
    if (/^[vd]:/.test(pid) || m.role === 'district' || m.role === 'keeper' || m.role === 'resident' || m.role === 'settler') return true;
    return m.served + m.tapped >= this.knownServed;
  }
  regular(pid) { const m = this.meta.get(String(pid)); return !!m && m.served >= this.knownServed; }

  // ---------------------------------------------------------------- body leases
  owner(pid) { const m = this.meta.get(String(pid)); return m ? m.owner : null; }
  /** take the body for `owner`; false when someone else (not 'town') holds it */
  lease(pid, owner) {
    const m = this.meta.get(String(pid));
    if (!m) return false;
    if (m.owner !== 'town' && m.owner !== owner) return false;
    m.owner = owner;
    return true;
  }
  release(pid, owner) {
    const m = this.meta.get(String(pid));
    if (!m || (owner && m.owner !== owner)) return false;
    m.owner = 'town';
    return true;
  }

  // ---------------------------------------------------------------- save (side record: reg)
  toJSON() {
    const out = [];
    for (const [pid, sid] of this.byPid) {
      const m = this.meta.get(pid);
      out.push([pid, sid, m ? m.served : 0, m ? m.tapped : 0, m && m.kept ? 1 : 0, m && m.role ? m.role : null]);
    }
    return out;
  }
  static fromJSON(list, opts) {
    const R = new PersonRegistry(opts);
    for (const row of Array.isArray(list) ? list : []) {
      if (!Array.isArray(row) || typeof row[0] !== 'string' || !Number.isInteger(row[1]) || row[1] < 0) continue;
      const m = R.bind(row[0], row[1], { kept: !!row[4], role: typeof row[5] === 'string' ? row[5] : null });
      m.served = Math.max(0, row[2] | 0); m.tapped = Math.max(0, row[3] | 0);
    }
    return R;
  }
}
