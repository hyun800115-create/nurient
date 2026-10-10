// 명성 (fame) and the five chief titles (pure). Points only ever go up. Passive sources (riders, life beats in the
// village, new shops / house levels / district stars, happenings watched) let arrow-only players reach titles too.
// Flairs: the streak crown (24 h real time), the gold crown (title 5, permanent), "베스트 드라이버" (one game day).

export const TITLE_KEYS = ['newcomer', 'trusted', 'respected', 'honoured', 'legendary'];

/** what each title gives (existing art only) — the host places the decor, the model only announces it */
export const TITLE_REWARDS = {
  1: null,
  2: { decor: ['music_stand', 'bench_seats'], name: 'band', effects: ['settlers40', 'bankSite'] },        // 마을 악단
  3: { decor: ['wedding_arch', 'flower_stand', 'flower_stand'], name: 'arch', effects: [] },               // 눈꽃 아치 (도시 조건)
  4: { decor: ['lantern_string'], name: 'lanterns', effects: ['tourists20'] },                              // 랜턴 거리
  5: { decor: ['town_gate_x'], name: 'gate', effects: ['goldCrown'] },                                      // 도시 입구 문
};

export class Fame {
  /** cfg = tuning.fame; saved = slice.fm */
  constructor(cfg, saved) {
    this.cfg = cfg;
    const s = saved && typeof saved === 'object' ? saved : {};
    this.pts = Math.max(0, Math.floor(Number(s.p) || 0));
    this.title = this.levelOf(this.pts);
    this.riders = Math.max(0, Math.min(1e6, Math.floor(Number(s.r) || 0)));     // rider remainder (+1 per cfg.riders)
    const fl = s.fl && typeof s.fl === 'object' ? s.fl : {};
    this.crownUntil = Math.max(0, Number(fl.c) || 0);     // wall ms (streak crown)
    this.driverUntil = Math.max(0, Number(fl.d) || 0);    // game T
    this.log = Array.isArray(s.lg) ? s.lg.filter((r) => Array.isArray(r) && r.length === 3).slice(-12) : [];
  }

  /** title level 1..5 for points */
  levelOf(p) { const t = this.cfg.titles; let lv = 1; for (let i = 1; i < t.length; i++) if (p >= t[i]) lv = i + 1; return lv; }

  /**
   * add points (n > 0); returns the events: fame:pts, and fame:title (+ its reward) when a title is reached.
   * `why` is a short tag for the fame log ('A1', 'riders', 'wedding' …).
   */
  add(n, why, T) {
    n = Math.floor(Number(n) || 0);
    if (n <= 0) return [];
    const out = [];
    this.pts = Math.min(1e7, this.pts + n);
    out.push({ t: 'fame:pts', n, total: this.pts, why: String(why || '') });
    this.log.push([Math.round(Number(T) || 0), n, String(why || '').slice(0, 8)]);
    if (this.log.length > 12) this.log.splice(0, this.log.length - 12);
    const lv = this.levelOf(this.pts);
    while (lv > this.title) {
      this.title++;
      const r = TITLE_REWARDS[this.title];
      out.push({ t: 'fame:title', level: this.title, key: TITLE_KEYS[this.title - 1], reward: r ? r.name : null });
      if (r) for (const d of r.decor) out.push({ t: 'reward', kind: 'decor', key: d, why: 'title' + this.title });
      if (r) for (const e of r.effects) out.push({ t: 'reward', kind: 'effect', key: e, why: 'title' + this.title });
    }
    return out;
  }

  /** riders (bus + train): +1 fame per cfg.riders */
  addRiders(n, T) {
    this.riders += Math.max(0, Math.floor(n) || 0);
    const k = Math.floor(this.riders / Math.max(1, this.cfg.riders));
    if (k <= 0) return [];
    this.riders -= k * this.cfg.riders;
    return this.add(k, 'riders', T);
  }

  info() {
    const t = this.cfg.titles, lv = this.title;
    return { pts: this.pts, title: lv, key: TITLE_KEYS[lv - 1], at: t[lv - 1], next: lv < t.length ? t[lv] : null };
  }

  flairs(T, wall) {
    return { crown: this.title >= 5 ? 'gold' : (wall < this.crownUntil ? 'streak' : null), driver: T < this.driverUntil };
  }

  serialize() {
    const o = { p: this.pts };
    if (this.riders) o.r = this.riders;
    if (this.crownUntil || this.driverUntil) o.fl = { c: Math.round(this.crownUntil), d: Math.round(this.driverUntil) };
    if (this.log.length) o.lg = this.log.slice(-12);
    return o;
  }
}
