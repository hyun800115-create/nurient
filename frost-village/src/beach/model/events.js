// Beach events and cute happenings (docs/v5_v8_plan.md §6.5 model/events.js, §7 C11–C13, §6.1.6 P9–P12). Pure and
// seeded. Every set piece asks the shared stage for a slot first: the events take the 'ceremony' slot (never two set
// pieces at once, never over a wedding or a farewell), the happenings the 'happening' slot (never during a ceremony
// or a drive). A refused request waits and retries (≤ 90 s), then gives up quietly.
//
//   contest   모래성 대회 (C11): six kids build at the three sandcastle_build spots (a stage every 20 s), the chief
//             picks the winner (missions step 'choose' at p:sandcastles; standalone: the tallest castle wins)
//   fireworks 여름 불꽃놀이 (C12): 21:00 bursts over the warm sea, the crowd along the boardwalk
//   polar     북극곰 수영 대회 (C13): at OUR snowy village coast — swimsuits, a run into the winter sea, shivers, cheers
//   week      햇살 해변 축제 주간: 7 game days after ★3, crowd ×1.5 and fireworks every night

import { stream } from './rng.js';
import { dayOf, hourOf, nextAt } from './time.js';

/** v7 happenings in the story's HappeningClock format (the story registers them; standalone the beach runs them) */
export const BEACH_HAPPENINGS = [
  { id: 'P9', key: 'crab_toe', ko: '꽃게에 물린 발가락', en: 'A crab pinches a toe', where: 'beach', need: 'open',
    toastKo: '꽃게가 일광욕하던 손님 발가락을 콕!', toastEn: 'A crab pinched a sunbather’s toe!', chief: 'watch', fame: 2, secs: 14 },
  { id: 'P10', key: 'wave_castle', ko: '파도에 무너진 모래성', en: 'A wave takes the sandcastle', where: 'sandcastles', need: 'castle',
    toastKo: '파도가 모래성을 쓸어 갔어요…', toastEn: 'A wave washed the sandcastle away…', chief: 'watch', fame: 2, secs: 14 },
  { id: 'P11', key: 'ball_away', ko: '날아간 비치볼', en: 'The runaway beach ball', where: 'beach', need: 'lifeguard',
    toastKo: '비치볼이 바다로 날아갔어요! 구조요원 출동!', toastEn: 'A beach ball blew out to sea! Lifeguard to the rescue!', chief: 'watch', fame: 2, secs: 22 },
  { id: 'P12', key: 'parasol_fly', ko: '바람에 날아간 파라솔', en: 'The flying parasol', where: 'beach', need: 'open',
    toastKo: '바람에 파라솔이 날아가요! 길을 막아 주세요!', toastEn: 'The wind took a parasol! Stand in its way!', chief: 'stand', fame: 2, secs: 12 },
];

export class BeachEvents {
  constructor(m, saved = {}) {
    this.m = m;
    this.last = Object.assign({}, saved.last || {});          // kind -> game day it last ran
    this.week = saved.week && Number.isFinite(saved.week[0]) ? [saved.week[0] | 0, saved.week[1] | 0] : null;
    this.active = null;            // { kind, t0, until, phase, data }
    this.waiting = [];             // [{ kind, since, at }] requests waiting for the stage / their hour
    this.happening = null;         // { h, t0, until, data }
    this.happenNext = null;
    this.happenLast = Number.isFinite(saved.happen) ? saved.happen : -1e9;
  }
  get cfg() { return this.m.cfg; }
  weekOn(T) { const d = dayOf(T); return !!(this.week && d >= this.week[0] && d < this.week[1]); }

  /** ask for an event; returns { ok, why, at } (at = when it will start) */
  request(kind, T, opts = {}) {
    if (['contest', 'fireworks', 'polar', 'week'].indexOf(kind) < 0) return { ok: false, why: 'kind' };
    if (!this.m.isOpen()) return { ok: false, why: 'closed' };
    if (kind === 'polar' && !this.m.ok('shop:swimwear_shop')) return { ok: false, why: 'swimwear' };
    if (kind === 'fireworks' && this.m.stars < 2 && !opts.force) return { ok: false, why: 'star2' };
    if (kind === 'contest' && !this.m.slots.of('dig').some((s) => s.castle && /^castle_\d$/.test(s.castle))) return { ok: false, why: 'castles' };
    if (this.waiting.some((w) => w.kind === kind) || (this.active && this.active.kind === kind)) return { ok: false, why: 'already' };
    if (kind === 'week') { const d = dayOf(T); this.week = [d, d + this.cfg.events.week.days]; this.last.week = d; this.m.emit({ t: 'beach:event', kind, op: 'start', days: this.cfg.events.week.days }); return { ok: true, at: T }; }
    const at = kind === 'fireworks' ? nextAt(T, this.cfg.events.fireworks.hour) : T;
    this.waiting.push({ kind, since: T, at, src: opts.src || 'api' });
    return { ok: true, at };
  }

  step(T) {
    // waiting requests: their hour has come and the stage is free
    for (let k = 0; k < this.waiting.length; k++) {
      const w = this.waiting[k];
      if (T < w.at) continue;
      if (this.active) { if (T - w.at > 90) { this.waiting.splice(k--, 1); this.m.emit({ t: 'beach:event', kind: w.kind, op: 'cancel', why: 'busy' }); } continue; }
      const r = this.m.stage.request({ kind: w.kind, venue: this.m.venue(w.kind), T });
      if (!r || !r.ok) { if (T - w.at > 90) { this.waiting.splice(k--, 1); this.m.emit({ t: 'beach:event', kind: w.kind, op: 'cancel', why: r ? r.why : 'stage' }); } continue; }
      this.waiting.splice(k--, 1);
      this.begin(w.kind, T);
    }
    // the festival week: fireworks every night
    if (this.weekOn(T) && hourOf(T) >= 20.5 && hourOf(T) < 21 && this.last.fireworks !== dayOf(T) && !this.waiting.some((w) => w.kind === 'fireworks')) this.request('fireworks', T, { force: true, src: 'week' });
    const a = this.active;
    if (a) {
      this.phase(a, T);
      if (T >= a.until) this.finish(T);
    }
    this.stepHappening(T);
  }

  begin(kind, T) {
    const E = this.cfg.events, R = stream(this.m.seed, kind + ':' + dayOf(T));
    const a = { kind, t0: T, until: T + (E[kind] && E[kind].secs ? E[kind].secs : 40), phase: 'start', data: {} };
    this.active = a;
    this.last[kind] = dayOf(T);
    if (kind === 'contest') {
      a.data.castles = ['castle_1', 'castle_2', 'castle_3'];
      for (const c of a.data.castles) this.m.castleReset(c);
      a.data.kids = this.m.contestKids(T, E.contest.kids);
      a.data.judgeAt = T + 3 * this.cfg.sandcastle.stageEvery + 6;
      a.until = Math.max(a.until, a.data.judgeAt + 14);
    } else if (kind === 'fireworks') {
      const n = E.fireworks.bursts;
      a.data.bursts = [];
      for (let k = 0; k < n; k++) a.data.bursts.push({ t: T + 1.5 + (k / n) * (E.fireworks.secs - 6) + R.range(-0.4, 0.4), i: R.range(93, 112), j: R.range(-27, -23.5), h: R.range(150, 260), kind: R.pick(['star', 'ring', 'spark']), col: R.pick([0xff4f7b, 0xffb12e, 0x3fc8ff, 0x6dff6d, 0xc56bff, 0xff7a2e, 0xfff06a]), big: R.chance(0.25) });
      a.data.finale = T + E.fireworks.secs - 5;
      this.m.watchers(T, a.until);
    } else if (kind === 'polar') {
      const s = E.polar.secs;
      a.data.timeline = { gather: T, countdown: T + 6, run: T + 9, swim: T + 13, out: T + 13 + s * 0.3, shiver: T + 17 + s * 0.3, end: T + s };
      a.until = T + s;
      a.data.swimmers = E.polar.swimmers;
    }
    this.m.emit({ t: 'beach:event', kind, op: 'start', at: T, until: a.until });
  }

  phase(a, T) {
    if (a.kind === 'contest' && a.phase === 'start' && T >= a.data.judgeAt) {
      a.phase = 'judge';
      this.m.emit({ t: 'beach:event', kind: 'contest', op: 'judge', castles: a.data.castles.slice() });
    }
    if (a.kind === 'contest' && a.phase === 'judge' && !a.data.winner && T >= a.data.judgeAt + 12) this.pick(this.m.tallestCastle(a.data.castles), T, 'auto');
  }

  /** the chief (or the clock) picks the winning castle */
  pick(castle, T, by = 'chief') {
    const a = this.active;
    if (!a || a.kind !== 'contest' || a.data.winner) return false;
    a.data.winner = castle || a.data.castles[0];
    a.until = Math.min(a.until, T + 8);
    this.m.emit({ t: 'beach:event', kind: 'contest', op: 'winner', castle: a.data.winner, by });
    return true;
  }

  finish(T) {
    const a = this.active;
    this.active = null;
    this.m.stage.end(a.kind);
    this.m.emit({ t: 'beach:event', kind: a.kind, op: 'end', winner: a.data.winner || null });
  }

  /** a ceremony elsewhere (a wedding) needs the stage: the beach event ends at once (its end state) */
  abort(T) { if (this.active) { this.active.until = T; this.finish(T); } }

  // ------------------------------------------------------------------------------------------ happenings (standalone clock)
  stepHappening(T) {
    const H = this.cfg.happenings;
    const hp = this.happening;
    if (hp) { if (T >= hp.until) { this.happening = null; this.m.stage.end('happening'); this.m.emit({ t: 'beach:happening', id: hp.h.id, op: 'end', fame: hp.fame || 0 }); } return; }
    if (!this.m.ownHappenings || !this.m.isOpen()) return;
    if (this.happenNext === null) { const R = stream(this.m.seed, 'hn:' + Math.floor(T / 60)); this.happenNext = Math.max(this.happenLast + H.gapMin, T + H.every * (0.6 + R.next() * 0.8)); }
    if (T < this.happenNext) return;
    this.happenNext = null;
    const h = hourOf(T);
    if (h < 9.5 || h > 17.5) return;
    const pool = BEACH_HAPPENINGS.filter((x) => this.m.happeningReady(x.id));
    if (!pool.length) return;
    const R = stream(this.m.seed, 'hp:' + Math.floor(T));
    this.startHappening(pool[R.int(pool.length)].id, T);
  }

  /** run happening id now (the story's clock, the preview menu or the own clock); false when it cannot */
  startHappening(id, T) {
    const h = BEACH_HAPPENINGS.find((x) => x.id === id);
    if (!h || this.happening || !this.m.happeningReady(id)) return false;
    const r = this.m.stage.request({ kind: 'happening', venue: this.m.venue('beach'), T });
    if (!r || !r.ok) return false;
    const data = this.m.happeningData(id, T);
    if (!data) { this.m.stage.end('happening'); return false; }
    this.happening = { h, t0: T, until: T + h.secs, data, fame: 0 };
    this.happenLast = T;
    this.m.emit({ t: 'beach:happening', id, op: 'start', data, until: T + h.secs });
    return true;
  }

  state() {
    const out = { last: this.last };
    if (this.week) out.week = this.week;
    if (this.happenLast > 0) out.happen = Math.round(this.happenLast);
    return out;
  }
}
