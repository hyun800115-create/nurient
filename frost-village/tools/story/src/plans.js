// Daily plans: each resident gets tomorrow's plan when going to bed (spread over the evening, no
// spikes): wake up at home, work / school (with a lunch break), errands driven by needs (food, bank,
// furniture), leisure by likes and age (plaza, park, café, rink, beach campfire, a friend's house),
// promised outings, then home and sleep. The executor walks residents from step to step: leave ->
// travel (a few game seconds) -> arrive, emitting goTo / arrive for the game.

import { JOBS } from '../data/places.js';
import { G_TODDLER, G_KID, G_TEEN, G_ADULT, G_ELDER, S_IDLE, S_TRAVEL, S_SLEEP, S_JAIL, S_AWAY, F_OWNER, F_JAILED, groupOf } from './people.js';
import { B_OK } from './world.js';
import { ST_FRIEND } from './relations.js';

export const A_HOME = 0, A_WORK = 1, A_SCHOOL = 2, A_SHOP = 3, A_SOCIAL = 4, A_BANK = 5, A_EAT = 6, A_PICKUP = 7, A_VISIT = 8,
  A_SLEEP = 9, A_PLAY = 10, A_OUTING = 11, A_CLINIC = 12, A_EVENT = 13, A_JAIL = 14, A_BIGBUY = 15;
export const ACT_NAMES = ['home', 'work', 'school', 'shop', 'social', 'bank', 'eat', 'pickup', 'visit', 'sleep', 'play', 'outing', 'clinic', 'event', 'jail', 'bigbuy'];

const LEISURE = {
  // place kind weights by age group
  [G_KID]: { playground: 5, ice_rink: 3, plaza: 2, park: 2, stall: 1.5, toy_shop: 1, beach_fire: 0.5, library: 0.6 },
  [G_TEEN]: { plaza: 3, cafe: 3, ice_rink: 2.5, park: 2, stall: 2, salon: 0.8, clothing: 1, bookstore: 1, station: 0.8, library: 0.8 },
  [G_ADULT]: { plaza: 2.5, cafe: 3, park: 2, restaurant: 1.2, beach_fire: 1.2, salon: 1, ice_rink: 0.8, bookstore: 0.8, florist: 0.5, station: 0.5, library: 0.5 },
  [G_ELDER]: { park: 3, beach_fire: 3.5, plaza: 2, cafe: 1.2, clinic: 0.8, library: 0.8, station: 0.6, salon: 0.8 },
};
// likes -> place kinds they pull towards
const LIKE_PLACE = { skating: 'ice_rink', sledding: 'park', snowman: 'playground', snowball: 'playground', fishing: 'harbor', music: 'plaza', singing: 'plaza',
  dancing: 'plaza', books: 'bookstore', painting: 'park', coffee: 'cafe', cocoa: 'cafe', sweetpotato: 'stall', bungeoppang: 'stall', dogs: 'plaza',
  cats: 'park', penguins: 'beach_fire', sea: 'beach_fire', stars: 'beach_fire', aurora: 'beach_fire', trains: 'station', flowers: 'florist', walks: 'park',
  photos: 'plaza', shopping: 'clothing', baduk: 'park', yut: 'plaza', cooking: 'grocer', baking: 'bakery' };

const FOOD_SHOPS = ['grocer', 'bakery', 'fishmonger', 'stall', 'general'];
const EAT_PLACES = ['restaurant', 'cafe', 'stall', 'bakery'];

export class Plans {
  constructor(e) { this.e = e; this.tmpW = []; this.tmpP = []; }

  /** does this job work on day-of-week dow (0..6)? */
  worksOn(job, dow) {
    if (!job || !job.place) return false;
    // shops, food, police, fire, station, logistics work 6 days; offices 5
    const six = /food|shop|police|fire|logi|nature/.test(job.tag || '') || job.place === 'station' || job.place === 'harbor';
    return six ? dow !== 6 : dow < 5;
  }

  /** build the plan of day `day` for resident r, starting at minute `from` */
  build(r, day, from = 0) {
    const e = this.e, rng = e.rng, W = e.world;
    const P = r.plan;
    let n = 0;
    const push = (min, place, act) => {
      if (place < 0 || n >= P.length - 3) return;
      if (min < from) min = from;
      if (n && P[n - 3] >= min) min = P[n - 3] + 4;
      if (min > 1435) return;
      P[n++] = min; P[n++] = place; P[n++] = act;
    };
    const home = this.homeOf(r);
    const grp = groupOf(e, r);
    const dow = ((day % 7) + 7) % 7;
    const weekend = dow >= 5;
    r.planDay = day; r.planI = 0;
    if (r.flags & F_JAILED) { const st = W.first('police'); push(from, st ? st.idx : home, A_JAIL); r.planN = n; return; }
    if (grp === G_TODDLER) {
      push(0, home, A_SLEEP); push(450, home, A_HOME);
      // a toddler goes out with a parent (sits in the stroller): to the park sometimes
      const par = r.parents.length ? e.people[r.parents[0]] : null;
      if (par && par.alive && rng.chance(0.5)) { const pk = this.pickKind(['park', 'plaza', 'playground']); if (pk) { push(600 + rng.int(240), pk.idx, A_PLAY); push(720 + rng.int(200), home, A_HOME); } }
      push(1170, home, A_SLEEP);
      r.planN = n; return;
    }
    const sleepy = r.tr[4] < 30;
    const wake = grp === G_ELDER ? 330 + rng.int(60) : grp <= G_TEEN ? 410 + rng.int(30) : 370 + rng.int(60) + (sleepy ? 40 : 0);
    const bed = grp === G_ELDER ? 1260 + rng.int(40) : grp === G_KID ? 1250 + rng.int(20) : grp === G_TEEN ? 1310 + rng.int(40) : 1310 + rng.int(80);
    push(0, home, A_SLEEP);
    push(wake, home, A_HOME);
    let t = wake + 30 + rng.int(30);
    const job = JOBS[r.job];
    const works = job && job.place && r.work >= 0 && this.worksOn(job, dow);
    const isStudent = r.job === 'student' && !weekend && r.work >= 0;
    // promised outings today
    const ag = [];
    for (const a of r.agenda) if (a[0] === day) ag.push(a);
    if (works || isStudent) {
      const h0 = job.h[0] * 60, h1 = job.h[1] * 60;
      const place = r.work;
      // elders go for a morning walk first; shop owners low on stock pick up goods at the logistics centre
      if (r.flags & F_OWNER) {
        const shop = W.places[place];
        const lc = W.first('logistics');
        if (lc && lc.state === B_OK && shop.stock < shop.stockMax * 0.5 && h0 - 60 > wake) push(h0 - 55, lc.idx, A_PICKUP);
      }
      push(Math.max(t, h0 - 10 - rng.int(20)), place, isStudent ? A_SCHOOL : A_WORK);
      if (h0 < 690 && h1 > 800 && !isStudent) {
        // lunch out (sometimes)
        if (rng.chance(0.45)) { const ep = this.pickKind(EAT_PLACES, place); if (ep && ep.idx !== place) { push(715 + rng.int(25), ep.idx, A_EAT); push(770 + rng.int(20), place, A_WORK); } }
      }
      t = h1 + rng.int(15);
    }
    // leisure / errands until bed time
    const end = bed - 50 - rng.int(40);
    let guard = 0;
    while (t < end - 40 && guard++ < 6) {
      // outings promised to a friend
      let used = false;
      for (let k = 0; k < ag.length; k++) {
        const a = ag[k];
        if (a[1] >= t - 30 && a[1] <= t + 150) { push(a[1], a[2], A_OUTING); t = a[1] + 70 + rng.int(40); ag.splice(k, 1); used = true; break; }
      }
      if (used) continue;
      const pick = this.pickActivity(r, grp, t, weekend);
      if (!pick) break;
      push(t, pick[0], pick[1]);
      t += pick[2] + rng.int(30);
      // pop home in between sometimes
      if (rng.chance(0.25) && t < end - 120) { push(t, home, A_HOME); t += 40 + rng.int(60); }
    }
    for (const a of ag) if (a[1] < bed - 30) push(a[1], a[2], A_OUTING);
    push(Math.max(t, end), home, A_HOME);
    push(bed, home, A_SLEEP);
    r.planN = n;
  }

  homeOf(r) {
    if (r.stayWith >= 0) return r.stayWith;
    if (r.home >= 0 && this.e.world.places[r.home].state === B_OK) return r.home;
    // no home (moved in without a house, or burnt): the town hall shelter
    const th = this.e.world.first('town_hall');
    return th ? th.idx : 0;
  }

  pickKind(kinds, avoid = -1) {
    const e = this.e, rng = e.rng, out = this.tmpP;
    out.length = 0;
    for (const k of kinds) for (const p of e.world.all(k)) if (p.state === B_OK && p.idx !== avoid) out.push(p);
    return out.length ? out[rng.int(out.length)] : null;
  }

  /** [placeIdx, act, minutes] */
  pickActivity(r, grp, t, weekend) {
    const e = this.e, rng = e.rng, W = e.world;
    const hour = t / 60;
    // needs first
    if (r.hunger > 55 && hour < 20.5) {
      const kinds = rng.chance(0.55) ? FOOD_SHOPS : EAT_PLACES;
      const p = this.openOf(kinds, hour);
      if (p) return [p.idx, kinds === FOOD_SHOPS ? A_SHOP : A_EAT, 50];
    }
    if (grp >= G_ADULT && e.bank.wantsVisit(r) && hour >= 9 && hour < 16.3) {
      const b = W.first('bank');
      if (b && b.state === B_OK) return [b.idx, A_BANK, 40];
    }
    if (grp >= G_ADULT && r.bigBuy && hour >= 10 && hour < 18.5) {
      const p = this.openOf([r.bigBuy], hour);
      if (p) return [p.idx, A_BIGBUY, 45];
    }
    if (grp === G_ELDER && rng.chance(0.07) && hour < 17) {
      const c = W.first('clinic');
      if (c && c.state === B_OK) return [c.idx, A_CLINIC, 40];
    }
    // visit a friend at home (evenings, weekends)
    if (grp >= G_KID && rng.chance(weekend ? 0.16 : 0.08) && hour >= 15 && hour < 20) {
      let best = null;
      for (const rel of r.adj) {
        if (rel.stage < ST_FRIEND) continue;
        const o = e.people[rel.other(r.id)];
        if (!o.alive || o.home < 0 || o.home === r.home) continue;
        if (!best || rng.chance(0.35)) best = o;
      }
      if (best) return [best.home, A_VISIT, 60];
    }
    // leisure by age and likes
    const base = LEISURE[grp] || LEISURE[G_ADULT];
    const ws = this.tmpW, ps = this.tmpP;
    ws.length = 0; ps.length = 0;
    for (const kind in base) {
      let w = base[kind];
      for (const li of r.likes) if (LIKE_PLACE[e.likes[li].id] === kind) w += 2.5;
      for (const p of W.all(kind)) if (W.isOpen(p, hour)) { ws.push(w); ps.push(p); }
    }
    // shy people stay home more
    if (r.tr[0] < 30) { ws.push(3); ps.push(W.places[this.homeOf(r)]); }
    const i = rng.weighted(ws, ws.length);
    if (i < 0) return null;
    const p = ps[i];
    const act = p.cat === 'home' ? A_HOME : grp <= G_KID && (p.kind === 'playground' || p.kind === 'ice_rink' || p.kind === 'park' || p.kind === 'plaza') ? A_PLAY : p.cat === 'shop' && p.sells.length && rng.chance(0.5) ? A_SHOP : A_SOCIAL;
    return [p.idx, act, 45 + rng.int(60)];
  }

  /** a place where one can enjoy like `li` (an invitation's destination) */
  placeForLike(li) {
    const e = this.e;
    const kind = LIKE_PLACE[e.likes[li].id] || 'plaza';
    const list = e.world.all(kind).filter((p) => p.state === B_OK);
    if (list.length) return list[e.rng.int(list.length)];
    const pl = e.world.all('plaza');
    return pl.length ? pl[0] : null;
  }

  openOf(kinds, hour) {
    const e = this.e, out = this.tmpP;
    out.length = 0;
    for (const k of kinds) for (const p of e.world.all(k)) if (e.world.isOpen(p, hour)) out.push(p);
    return out.length ? out[e.rng.int(out.length)] : null;
  }

  // ---------------------------------------------------------------- executor
  update() {
    const e = this.e, now = e.now, minute = e.clock.minute, day = e.clock.day;
    const list = e.alive;
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.state === S_TRAVEL) { if (now >= r.arriveAt) this.arrive(r); continue; }
      if (r.state === S_AWAY) continue;
      if (r.busyUntil > now) continue;
      if (r.planDay !== day) {
        if (r.planDay < day) this.build(r, day, minute);
        continue;
      }
      if (r.planI >= r.planN) continue;
      const P = r.plan;
      // skip steps that are long past (e.g. after a long conversation / incident)
      while (r.planI + 3 < r.planN && P[r.planI + 3] <= minute) r.planI += 3;
      if (P[r.planI] > minute) continue;
      const place = P[r.planI + 1], act = P[r.planI + 2];
      r.planI += 3;
      this.goTo(r, place, act);
    }
  }

  goTo(r, placeIdx, act, opts) {
    const e = this.e, W = e.world;
    let p = W.places[placeIdx];
    if (!p) return;
    // the place burnt down / is closed: go home instead (or to the shelter)
    if (p.state !== B_OK && p.cat !== 'home' && act !== A_EVENT && act !== A_JAIL) { p = W.places[this.homeOf(r)]; act = A_HOME; }
    if (r.loc === p.idx) { r.destAct = act; this.onArrive(r, p, act, true); return; }
    const from = r.loc >= 0 ? W.places[r.loc] : null;
    W.leave(r);
    r.dest = p.idx; r.destAct = act;
    r.state = S_TRAVEL;
    const d = from ? Math.abs(from.x - p.x) + Math.abs(from.y - p.y) : 30;
    const run = !!(opts && opts.run);
    r.arriveAt = e.now + Math.max(2, Math.round((3 + d * 0.22) * (run ? 0.5 : 1)));
    if (e.bus.has('goTo')) e.bus.emit('goTo', { who: r.id, place: p.id, act: ACT_NAMES[act], run, eta: r.arriveAt - e.now, reason: opts && opts.reason || null });
  }

  arrive(r) {
    const e = this.e, p = e.world.places[r.dest];
    r.state = S_IDLE;
    e.world.enter(p, r);
    this.onArrive(r, p, r.destAct, false);
  }

  onArrive(r, p, act, already) {
    const e = this.e;
    if (act === A_SLEEP) { r.state = S_SLEEP; if (e.clock.minute > 720 && r.planDay === e.clock.day) this.build(r, e.clock.day + 1, 0); }
    else if (act === A_JAIL) r.state = S_JAIL;
    else if (r.state === S_SLEEP) r.state = S_IDLE;
    if (!already && e.bus.has('arrive')) e.bus.emit('arrive', { who: r.id, place: p.id, act: ACT_NAMES[act] });
    e.econ.onArrive(r, p, act);
  }
}
