// 오늘의 미션 (3 a day) · 이번 주 목표 (one a week, 3 stages) · 연속 달성 (streak + 눈사람 방패). Pure.
// The day is the device's local date with a 05:00 reset (tuning.daily.clock 'real', the default; 'game' uses the game
// day instead). Rules:
//   - a clock moved backward never re-opens or double-counts a day (keys only move forward);
//   - with the real clock, at most one rollover per launch (a long session gets another after 20 h of uptime), so
//     moving the phone's clock forward and back cannot farm fresh dailies;
//   - the dailies of a date are drawn from a seed of (save seed, date), so a reload shows the same three;
//   - the streak counts days whose three dailies were all done; once per week a shield forgives one missed day.

import { Rng, hashStr } from '../lib/rng.js';
import { dayKey, weekKey } from '../lib/calendarKeys.js';
import { unitsOf, isDone } from './units.js';

const UPTIME_REROLL = 20 * 3600 * 1000;

export class Calendar {
  /**
   * @param cfg   the whole missions tuning (daily / weekly / streak used)
   * @param saved { dy, wk, st } from the slice (or nothing)
   * @param seed  the save's seed (dailies of a date are drawn from it)
   */
  constructor(cfg, saved, seed) {
    this.cfg = cfg;
    this.seed = seed >>> 0;
    const s = saved && typeof saved === 'object' ? saved : {};
    this.dy = s.dy && typeof s.dy === 'object' ? { d: s.dy.d | 0, ids: (s.dy.ids || []).slice(0, 3), g: (s.dy.g || []).map((a) => (Array.isArray(a) ? a.slice(0, 4) : [])), k: (s.dy.k || []).slice(0, 3), a: s.dy.a ? 1 : 0 } : null;
    this.wk = s.wk && typeof s.wk === 'object' ? { w: s.wk.w | 0, c: s.wk.c || null, g: Math.max(0, s.wk.g | 0), s: Math.max(0, Math.min(3, s.wk.s | 0)) } : null;
    this.st = s.st && typeof s.st === 'object' ? { n: Math.max(0, s.st.n | 0), last: s.st.last | 0, sw: s.st.sw | 0 } : { n: 0, last: 0, sw: 0 };
    this.rolled = false;        // a rollover happened in this launch (real clock)
    this.rollUp = 0;
  }

  /** today's day key (real or game clock) */
  keyOf(env) {
    if (this.cfg.daily.clock === 'game') return 1000000 + Math.max(0, env.day() | 0);   // (never collides with real keys)
    return dayKey(env.localDate(), this.cfg.daily.resetHour);
  }

  /**
   * roll the day / week when they changed. `catalog` = { daily: [tpl], weekly: [tpl] }, eligible(tpl) → bool,
   * pay(minutes) → coins. Returns events.
   */
  check(env, catalog, eligible) {
    const out = [];
    const key = this.keyOf(env);
    if (!key) return out;
    const real = this.cfg.daily.clock !== 'game';
    if (!this.dy || key > this.dy.d) {
      const up = env.uptime ? env.uptime() : 0;
      if (this.dy && real && this.rolled && up - this.rollUp < UPTIME_REROLL) {
        // a second date change in one launch (a clock pushed forward again): ignored until the next launch
      } else {
        const fresh = !this.dy;
        this.draw(key, catalog.daily, eligible);
        if (real && !fresh) { this.rolled = true; this.rollUp = up; }
        out.push({ t: 'daily:new', d: key, ids: this.dy.ids.slice() });
      }
    }
    // the week (a week key is the day key of its reset day)
    const wkey = weekKey(this.dy ? Math.max(this.dy.d, key) : key, this.cfg.weekly.resetDay);
    if (!this.wk || wkey > this.wk.w) {
      const list = catalog.weekly.filter((t) => eligible(t));
      if (list.length) {
        const i = Math.floor(wkey / 7) % list.length;
        this.wk = { w: wkey, c: list[(i + list.length) % list.length].code, g: 0, s: 0 };
        out.push({ t: 'weekly:new', w: wkey, c: this.wk.c });
      }
    }
    return out;
  }

  draw(key, pool, eligible) {
    const rng = new Rng(hashStr(this.seed + ':' + key));
    const list = pool.filter((t) => eligible(t));
    const ids = [];
    const g = [];
    while (ids.length < this.cfg.daily.count && list.length) { const t = list.splice(rng.int(list.length), 1)[0]; ids.push(t.code); g.push(unitsOf(t).map(() => 0)); }
    this.dy = { d: key, ids, g, k: ids.map(() => 0), a: 0 };
  }

  /**
   * a counter signal: progress today's dailies and the week's goal. tplOf(code) → template, pay(p) → coins.
   * Returns events (daily:done, daily:all, streak:day, weekly:stage, reward …) and the fame to add as [n, why].
   */
  signal(sig, n, tplOf, pay) {
    const out = [];
    const dy = this.dy;
    if (dy) {
      for (let i = 0; i < dy.ids.length; i++) {
        if (dy.k[i]) continue;
        const t = tplOf(dy.ids[i]);
        const u = unitsOf(t);
        const gi = dy.g[i] || (dy.g[i] = []);
        while (gi.length < u.length) gi.push(0);
        let hit = false;
        for (let j = 0; j < u.length; j++) {
          if (u[j].sig !== sig) continue;
          const g = dy.g[i][j] || 0;
          if (g >= u[j].need) continue;
          dy.g[i][j] = Math.min(u[j].need, g + n);
          hit = true;
        }
        if (!hit) continue;
        out.push({ t: 'daily:progress', i, code: dy.ids[i] });
        if (isDone(t, dy.g[i])) {
          dy.k[i] = 1;
          out.push({ t: 'daily:done', i, code: dy.ids[i], coins: pay(this.cfg.daily.pay), fame: this.cfg.daily.fame, why: dy.ids[i] });
          if (!dy.a && dy.k.length && dy.k.every((k) => k)) {
            dy.a = 1;
            out.push({ t: 'daily:all', coins: pay(this.cfg.daily.allPay), fame: this.cfg.daily.allFame, why: 'daily' });
            for (const e of this.streakDay(dy.d, pay)) out.push(e);
          }
        }
      }
    }
    const wk = this.wk;
    if (wk && wk.c && wk.s < 3) {
      const t = tplOf(wk.c);
      if (t && t.sig === sig) {
        wk.g = Math.min(1e7, wk.g + n);
        out.push({ t: 'weekly:progress', c: wk.c, g: wk.g });
        while (wk.s < 3 && wk.g >= t.stages[wk.s]) {
          const st = wk.s;
          wk.s++;
          out.push({ t: 'weekly:stage', c: wk.c, stage: wk.s, coins: pay(this.cfg.weekly.pay[st]), fame: this.cfg.weekly.fame[st], why: wk.c });
          if (wk.s === 3) {
            const dec = this.cfg.weekly.decor;
            out.push({ t: 'reward', kind: 'decor', key: dec[Math.floor(wk.w / 7) % dec.length], why: 'week' });
          }
        }
      }
    }
    return out;
  }

  /** day D's three dailies are all done: the streak goes on (or restarts) and pays its rewards */
  streakDay(D, pay) {
    const st = this.st, out = [];
    const wkD = weekKey(D, this.cfg.weekly.resetDay);
    if (st.last === D) return out;
    if (st.last === D - 1) st.n++;
    else if (st.last === D - 2 && st.sw !== wkD && this.cfg.streak.shieldPerWeek > 0) { st.n++; st.sw = wkD; out.push({ t: 'streak:shield', d: D }); }
    else st.n = 1;
    st.last = D;
    const day = ((st.n - 1) % 7) + 1;
    const r = this.cfg.streak.rewards[day];
    const ev = { t: 'streak:day', n: st.n, day };
    if (r) {
      if (r.fame) { ev.fame = r.fame; ev.why = 'streak'; }
      if (r.pay) ev.coins = pay(r.pay);
      if (r.decor) out.push({ t: 'reward', kind: 'voucher', key: r.decor, why: 'streak' });
      if (r.flair) out.push({ t: 'reward', kind: 'flair', key: r.flair, why: 'streak' });
    }
    out.unshift(ev);
    return out;
  }

  /** the shield is still free this week (for the 오늘 tab) */
  shieldFree(env) {
    const key = this.dy ? this.dy.d : this.keyOf(env);
    return this.st.sw !== weekKey(key, this.cfg.weekly.resetDay);
  }

  serialize() {
    const o = {};
    if (this.dy) o.dy = { d: this.dy.d, ids: this.dy.ids, g: this.dy.g.map((a) => Array.from(a || [], (v) => v | 0)), k: this.dy.k.map((v) => (v ? 1 : 0)), a: this.dy.a };
    if (this.wk) o.wk = { w: this.wk.w, c: this.wk.c, g: this.wk.g, s: this.wk.s };
    if (this.st.n || this.st.last || this.st.sw) o.st = { n: this.st.n, last: this.st.last, sw: this.st.sw };
    return o;
  }
}
