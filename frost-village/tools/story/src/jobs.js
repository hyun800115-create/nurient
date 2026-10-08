// Jobs: places offer job slots (data/places.js STAFF), adults without a job fill openings (by word of
// mouth too: a friend who works there tells them), teens who grow up get a first job, retirees leave.

import { JOBS, STAFF } from '../data/places.js';
import { G_ADULT, G_ELDER, F_OWNER, groupOf } from './people.js';
import { B_OK } from './world.js';
import { SRC_DID } from './memory.js';

export class Jobs {
  constructor(e) { this.e = e; this.stats = { hired: 0, firstJobs: 0, retired: 0, byLead: 0 }; }

  /** job slots of place p: [[jobId, n], …] */
  slotsOf(p) {
    if (p.jobs && p.jobs.length) return p.jobs;
    return STAFF[p.kind] || (p.cat === 'shop' ? [['shopkeeper', 1]] : []);
  }

  staffCount(p, job) {
    let n = 0;
    for (const r of this.e.alive) if (r.work === p.idx && (!job || r.job === job)) n++;
    return n;
  }

  hasOpening(p) {
    if (!p || p.state !== B_OK) return false;
    for (const [job, n] of this.slotsOf(p)) if (this.staffCount(p, job) < n) return true;
    return false;
  }

  /** hire r at place p if it has a free slot */
  hireAt(r, p, lead = true) {
    if (!p || p.state !== B_OK) return false;
    for (const [job, n] of this.slotsOf(p)) {
      if (this.staffCount(p, job) < n) {
        this.assign(r, job, p);
        if (lead) this.stats.byLead++;
        const f = this.e.fact('new_job', { a: r.id, p: p.idx, s: job });
        this.e.learn(r, f, SRC_DID);
        return true;
      }
    }
    return false;
  }

  assign(r, job, p) {
    r.job = job; r.work = p ? p.idx : -1; r.jobless = 0;
    this.stats.hired++;
  }

  /** give every jobless adult a job if there are openings (used at start and after shops open) */
  fillOpenings(onlyNew) {
    const e = this.e;
    const open = [];
    for (const p of e.world.places) {
      if (p.state !== B_OK || p.cat === 'home') continue;
      for (const [job, n] of this.slotsOf(p)) {
        if (JOBS[job] && JOBS[job].place && JOBS[job].place !== p.kind && JOBS[job].place !== 'shop') continue;
        const have = this.staffCount(p, job);
        for (let k = have; k < n; k++) open.push([job, p]);
      }
    }
    if (!open.length) return 0;
    e.rng.shuffle(open);
    let hired = 0;
    for (const r of e.alive) {
      if (!open.length) break;
      if (groupOf(e, r) !== G_ADULT || (r.job !== 'none' && r.job !== 'student') || (r.flags & F_OWNER)) continue;
      if (e.rng.chance(0.08) && !onlyNew) continue;    // a few people are happily between jobs
      const [job, p] = open.pop();
      this.assign(r, job, p);
      hired++;
    }
    return hired;
  }

  /** a young adult's first job: any opening in town (or a new helper slot at a shop) */
  firstJob(r) {
    const e = this.e;
    const opts = [];
    for (const p of e.world.places) if (p.cat !== 'home' && this.hasOpening(p)) opts.push(p);
    if (opts.length) return this.hireAt(r, opts[e.rng.int(opts.length)], false);
    const shops = e.world.places.filter((p) => p.cat === 'shop' && p.state === B_OK);
    if (!shops.length) return false;
    const p = shops[e.rng.int(shops.length)];
    this.assign(r, 'shopkeeper', p);
    return true;
  }

  retire(r) {
    r.job = 'retired'; r.work = -1;
    this.stats.retired++;
  }
}
