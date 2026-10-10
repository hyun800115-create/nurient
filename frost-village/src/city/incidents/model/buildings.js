// Building visual states after fires (docs/v5_v8_plan.md §6.7 model/buildings.js). Pure.
//
//   ok → smoking (smoke phase) → burning (truck on its way, hose) → scorched (minor: soot, repaired after 0.3 day)
//                                                                → ruin (smouldering, then cold) → demolition (fence ring,
//   excavator, dump truck, rubble) → site (stakes → foundation → scaffold) → rebuilt (+1 level, ribbon) → ok (level kept)
//
// Records are keyed by the game building id (a story home 't_apt1#3' burns its building 't_apt1'). The art for each
// state comes from the civic manifest's `ruinFor` (ruin, scorch decal, rubble, fence ring) — that is the view's job.

export const ST = { ok: 0, smoking: 1, burning: 2, scorched: 3, ruin: 4, demolition: 5, site: 6, rebuilt: 7 };
export const ST_NAME = ['ok', 'smoking', 'burning', 'scorched', 'ruin', 'demolition', 'site', 'rebuilt'];
const ORDER = { ok: 0, smoking: 1, burning: 2, scorched: 3, ruin: 4, demolition: 5, site: 6, rebuilt: 7 };

/** the game building a story place stands in ('t_apt1#3' -> 't_apt1') */
export const bldOf = (place) => (place ? String(place).split('#')[0] : null);

export class BuildingStates {
  constructor(cfg, saved) {
    this.cfg = cfg || {};
    this.map = new Map();         // id -> { id, st, t, lv, inc }
    for (const r of (saved && Array.isArray(saved) ? saved : [])) {
      if (!Array.isArray(r) || typeof r[0] !== 'string') continue;
      const st = Number(r[1]) | 0;
      if (st < 0 || st > 7) continue;
      this.map.set(r[0], { id: r[0], st, t: Number(r[2]) || 0, lv: Math.max(0, Number(r[3]) | 0), inc: 0 });
    }
  }

  get(id) { return this.map.get(bldOf(id)) || null; }
  state(id) { const r = this.get(id); return r ? ST_NAME[r.st] : 'ok'; }
  level(id) { const r = this.get(id); return r ? r.lv : 0; }

  /** move a building to state `name` at T (returns the record when it changed) */
  set(place, name, T, extra = {}) {
    const id = bldOf(place);
    if (!id || !(name in ORDER)) return null;
    let r = this.map.get(id);
    if (!r) { r = { id, st: 0, t: T, lv: 0, inc: 0 }; this.map.set(id, r); }
    const st = ORDER[name];
    if (r.st === st && !extra.force) return null;
    r.st = st; r.t = T;
    if (extra.inc) r.inc = extra.inc;
    if (extra.levelUp) r.lv = Math.min(9, r.lv + 1);
    return r;
  }

  /** the time-driven steps no event moves on: a rebuilt building becomes ok (its level stays) */
  update(T) {
    const out = [];
    for (const r of this.map.values()) {
      if (r.st === ST.rebuilt && T - r.t >= (this.cfg.rebuiltShowS || 60)) { r.st = ST.ok; r.t = T; out.push(r); }
    }
    return out;
  }

  /** a ruin still smoulders (the view draws <ruin>_smoke) */
  smouldering(r, T) { return r && r.st === ST.ruin && T - r.t < (this.cfg.ruinCoolS || 120); }

  /** everything that is not plain ok, plus ok buildings that went up a level */
  list() { return Array.from(this.map.values()).filter((r) => r.st !== ST.ok || r.lv > 0); }

  /** [[id, st, t, lv]] ≤ max: busy states first, then levelled buildings (newest first) */
  serialize(max = 16) {
    const all = this.list().slice().sort((a, b) => (b.st !== 0) - (a.st !== 0) || b.t - a.t);
    return all.slice(0, max).map((r) => (r.lv ? [r.id, r.st, Math.round(r.t), r.lv] : [r.id, r.st, Math.round(r.t)]));
  }
}
