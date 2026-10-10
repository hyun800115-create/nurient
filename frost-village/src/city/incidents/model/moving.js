// Moving in and out (docs/v5_v8_plan.md §6.7 "Moving"): not incidents — they run with 사건·사고 off too. Pure.
//
//   story:move { op: 'in', who, members, membersPid, home? }    -> a moving truck to the new home: unload, movers carry
//                                                                  boxes in, a welcome mat, card "○○네가 이사 왔어요!"
//   story:move { op: 'plan', household, members, home, day }    -> a for-sale sign at the home
//   story:move { op: 'out', household, members, membersPid, home } -> the truck loads, the family waves goodbye, sold sign
//   settlers   { n, house }                                       -> (game settlers in v8) the same as a move-in
//
// A job lives `dur` game seconds (the view's set piece runs inside it). One job per home at a time; later moves for a
// busy home wait in the queue. Households stay valid: every job has members, an 'in' always has a home.

export class Moves {
  constructor(cfg, saved = {}) {
    this.cfg = cfg;
    this.jobs = [];               // active { id, op, home, members, pids, T0, dur, staged }
    this.queue = [];
    this.forSale = new Set(Array.isArray(saved.sale) ? saved.sale.filter((h) => typeof h === 'string').slice(0, cfg.moving.saleSigns || 8) : []);
    this.sold = new Map();        // home -> T sold (shown for a while, not saved)
    this.mats = new Map();        // home -> T the welcome mat went down (not saved)
    this.done = 0;
    this.next = 1;
  }

  /** a story / game move event -> job (or null when it is not usable) */
  add(ev, T) {
    const op = ev.op === 'settlers' ? 'in' : ev.op;
    if (op === 'plan') { if (ev.home) { this.forSale.add(String(ev.home)); this.trimSale(); } return null; }
    if (op !== 'in' && op !== 'out') return null;
    const members = Array.isArray(ev.members) ? ev.members.slice(0, 8) : ev.who !== undefined ? [ev.who] : [];
    const pids = Array.isArray(ev.membersPid) ? ev.membersPid.slice(0, 8) : [];
    const home = ev.home || ev.house || null;
    if (!members.length && !(ev.n > 0)) return null;
    if (op === 'in' && !home) return null;
    const job = { id: 'mv' + this.next++, op, home: home ? String(home) : null, household: ev.household === undefined ? null : ev.household, members: members.length ? members : new Array(Math.min(4, ev.n | 0)).fill(-1), pids, T0: T, dur: op === 'in' ? 46 : 34, staged: false };
    if (job.home && this.jobs.some((j) => j.home === job.home)) { this.queue.push(job); return job; }
    this.jobs.push(job);
    if (op === 'out' && job.home) this.forSale.add(job.home);
    return job;
  }

  /** jobs that finished at T (and queued ones that start now) */
  update(T) {
    const ended = [], started = [];
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      const j = this.jobs[i];
      if (T - j.T0 < j.dur) continue;
      this.jobs.splice(i, 1);
      this.done++;
      if (j.home) {
        if (j.op === 'in') { this.mats.set(j.home, T); this.forSale.delete(j.home); this.sold.delete(j.home); }
        else { this.forSale.delete(j.home); this.sold.set(j.home, T); }
      }
      ended.push(j);
    }
    for (let i = 0; i < this.queue.length; i++) {
      const q = this.queue[i];
      if (this.jobs.some((j) => j.home === q.home)) continue;
      this.queue.splice(i--, 1);
      q.T0 = T;
      this.jobs.push(q);
      started.push(q);
    }
    const matS = (this.cfg.moving.welcomeDays || 1) * 600;
    for (const [h, t] of this.mats) if (T - t > matS) this.mats.delete(h);
    for (const [h, t] of this.sold) if (T - t > 600) this.sold.delete(h);
    return { ended, started };
  }

  trimSale() { const max = this.cfg.moving.saleSigns || 8; while (this.forSale.size > max) this.forSale.delete(this.forSale.values().next().value); }
  /** the yard sign a home shows: 'for_sale_sign' | 'sold_sign' | null */
  sign(home) { return this.sold.has(home) ? 'sold_sign' : this.forSale.has(home) ? 'for_sale_sign' : null; }
  serialize() { return Array.from(this.forSale).slice(0, this.cfg.moving.saleSigns || 8); }
}
