// LifeDirector (docs/v5_v8_plan.md §6.1 "Life arc", "Gentleness rules", "Beat rates and caps", "Known people").
// Turns the story engine's life events into staged beats, story cards, banners and mission offers — gently, at
// the planned times, within the caps. Pure and deterministic: no Phaser, no clock of its own (T = DayClock.T,
// game seconds; 600 s a day, 25 s an hour).
//
//   const D = new LifeDirector(tuning.life, slice.life, hooks)
//   D.onEvent(ev) -> actions      (ev = a core event: { e: 'life'|'goTo'|'news'|'move'|'day', … })
//   D.update(T)   -> actions      (timed beats: wedding prep 10:30, the paper 07:00, the farewell card 09:00 …)
//   D.restore(T)  -> wedding bookings (after a load: the beats the player was promised get their timers back)
//   action: { a: 'beat', kind, at, sids, venue, data, book } | { a: 'card', card } | { a: 'banner', … } | { a: 'emit', name, data }
//           | { a: 'arrange', op, data } | { a: 'config', config } | { a: 'paper', day } | { a: 'body', … } | { a: 'leave', sids }
// hooks: { pidOf(sid), sidOf(pid), known(pid), farewellOn(), nameOf(sid, lang), today(), hall(), clinic(), garden(), school(), ours(placeId) }
//
// Promised beats (critique H1 / H11): every beat the player was told about in advance — a wedding day, a first school
// day, an elder's last day, the farewell card and the memorial-garden ceremony — is written into the slice
// (`booked`, by pid) and re-armed from there after a reload, until it has played or its window has passed. Director
// timers themselves are not saved.
// Quiet catch-up (critique H1): while the restored engine replays time the player already saw (`quietUntil`), life
// events only update the state; nothing is shown, emitted or booked in the past.

import { josa, casualName } from '../engine/lang/josa.js';

export const HOUR = 25;          // game seconds per clock hour (600 s day)
const DAY = 24 * HOUR;

/** elders' wishes (v5 set; v6/v7 add the lighthouse beam, cake with harbour sugar, feet in the warm sea) */
export const WISHES = [
  { id: 'bus_fountain', likes: ['walks', 'trains', 'sledding'], place: 't_fountain', ko: '썰매버스를 타고 분수 구경 가기', en: 'ride the sleigh bus to the fountain', need: 'bus' },
  { id: 'sea_dock', likes: ['sea', 'fishing', 'stars', 'penguins'], place: 'v_dock', ko: '부두에서 바다 바라보기', en: 'watch the sea from the dock' },
  { id: 'cafe_cake', likes: ['coffee', 'cocoa', 'baking', 'bungeoppang'], place: 't_cafe', ko: '카페에서 케이크 한 조각 먹기', en: 'a slice of cake at the café', need: 'sugar' },
  { id: 'school_grandkid', likes: [], place: 't_school', ko: '손주 학교 구경하기', en: 'visit the grandchild’s school', needGrandkid: true },
  { id: 'park_bench', likes: ['flowers', 'walks', 'naps', 'baduk', 'yut', 'gardening', 'knitting', 'saunas'], place: 't_fountain', ko: '공원 벤치에서 햇볕 쬐기', en: 'sit in the sun on a park bench' },
  { id: 'lighthouse', likes: ['sea', 'stars', 'aurora'], place: 'h_lighthouse', ko: '등대 불빛 보기', en: 'see the lighthouse beam', need: 'harbor' },
  { id: 'warm_sea', likes: ['sea', 'walks'], place: 'b_beach', ko: '따뜻한 바다에 발 담그기', en: 'dip their feet in the warm sea', need: 'beach' },
];

const ELDER_TITLE = (male) => (male ? ['할아버지', 'Grandpa'] : ['할머니', 'Grandma']);
/** booking kinds in the slice: w wedding · s first school day · l last day · f farewell card + memorial ceremony */
const BOOK_KINDS = ['w', 's', 'l', 'f'];
const isPid = (p) => typeof p === 'string' && p.length > 0 && p.length <= 24;

export class LifeDirector {
  constructor(tuning = {}, state = null, hooks = {}) {
    this.L = Object.assign({
      weddingHour: 11, weddingPrepHour: 10.5, weddingUntilHour: 12, firstWeddingInDays: 1, birthdaysPerDay: 1, schoolAge: 7, schoolHour: 7, walkAge: 4, firstJobAge: 16,
      wishAge: 82, wishes: 3, wishTimeoutDays: 3, stones: 6, paperHour: 7, farewellCardHour: 9, farewellHour: 10, farewellUntilHour: 12, lastDayHour: 15, lastDayUntilHour: 18,
      birthDuskHour: 18, birthDawnHour: 6.5,
    }, tuning);
    this.h = hooks;
    this.s = sanitizeLifeState(state);
    this.timers = [];         // [{ at, action }] (not saved: the promised ones are re-armed from s.booked)
    this.dayBirthday = -1;    // birthday parties staged today
    this.events = 0;
    this.quietUntil = null;   // T: events up to here are a replay the player already saw (state only)
    this.quiet = false;       // the event being handled is part of that replay
  }

  // ---------------------------------------------------------------- helpers
  pid(sid) { return this.h.pidOf ? this.h.pidOf(sid) : null; }
  sid(pid) { const s = pid && this.h.sidOf ? this.h.sidOf(pid) : -1; return Number.isInteger(s) ? s : -1; }
  known(sid) { const p = this.pid(sid); return !!(p && this.h.known && this.h.known(p)); }
  name(sid, lang) { return this.h.nameOf ? this.h.nameOf(sid, lang) : '#' + sid; }
  today() { return this.h.today ? this.h.today() : 0; }
  at(day, hour) { return day * DAY + hour * HOUR; }
  later(at, action) {
    if (this.quiet && this.quietUntil !== null && at <= this.quietUntil) return;     // the replay never books the past
    if (action && action.key && this.timers.some((t) => t.action.key === action.key)) return;
    let i = this.timers.length;
    while (i > 0 && this.timers[i - 1].at > at) i--;
    this.timers.splice(i, 0, { at, action });
  }
  /** a child as the village says it: '보검이가' (given name, casual 이, then the particle) */
  kid(sid, form) {
    const n = this.name(sid, 'ko');
    const given = /^[가-힣]{3}$/.test(n) ? n.slice(1) : n;
    const c = casualName(given);
    return form ? josa(c, form) : c;
  }
  card(kind, sids, ko, en, extra) { return { a: 'card', card: Object.assign({ kind, sids, pids: sids.map((s) => this.pid(s)), ko, en }, extra || {}) }; }
  /** '내일' / '모레' / '3일 뒤' (the wedding is usually two days after the proposal) */
  whenKo(day) { const n = day - this.today(); return n <= 0 ? '오늘' : n === 1 ? '내일' : n === 2 ? '모레' : n + '일 뒤'; }
  whenEn(day) { const n = day - this.today(); return n <= 0 ? 'today' : n === 1 ? 'tomorrow' : 'in ' + n + ' days'; }

  /** '순자 할머니' / 'Grandma Sunja' */
  elderName(sid, male, lang) {
    const n = this.name(sid, lang);
    const t = ELDER_TITLE(male);
    if (lang === 'en') return /^(Grandma|Grandpa) /.test(n) ? n : t[1] + ' ' + n.split(' ').pop();
    if (/할머니|할아버지/.test(n)) return n;
    const given = n.length >= 3 ? n.slice(1) : n;
    return given + ' ' + t[0];
  }

  // ---------------------------------------------------------------- promised beats (slice: booked)
  book(kind, day, a, b, extra) {
    const B = this.s.booked;
    if (B.some((x) => x[0] === kind && x[1] === day && x[2] === a)) return;
    B.push([kind, day, a, b || '', extra === undefined ? 0 : extra]);
    while (B.length > 8) B.shift();
  }
  unbook(ref) {
    if (!ref) return;
    const B = this.s.booked;
    for (let i = B.length - 1; i >= 0; i--) if (B[i][0] === ref[0] && B[i][1] === ref[1] && B[i][2] === ref[2]) B.splice(i, 1);
  }
  /** the game T after which a booked beat can no longer play */
  bookEnd(x) {
    const L = this.L, d = x[1];
    if (x[0] === 'w') return this.at(d, L.weddingUntilHour);
    if (x[0] === 's') return this.at(d, L.schoolHour + 2);
    if (x[0] === 'l') return this.at(d, L.lastDayUntilHour);
    return this.at(d, L.farewellUntilHour);
  }
  /** after a load: re-arm the promised beats whose window is still open; returns the wedding bookings (engine sync) */
  restore(T) {
    const L = this.L, out = [];
    this.s.booked = this.s.booked.filter((x) => T < this.bookEnd(x));
    for (const x of this.s.booked) {
      const [k, day, a, b, extra] = x;
      const ref = [k, day, a];
      if (k === 'w') {
        const at = this.at(day, L.weddingPrepHour);
        this.later(Math.max(at, T), { a: 'beat', kind: 'wedding', key: 'w:' + day + ':' + a, at, until: this.bookEnd(x), sids: [this.sid(a), this.sid(b)], venue: this.h.hall ? this.h.hall() : null,
          data: { hour: L.weddingHour, first: !this.s.seen.wedding, late: T > at }, book: ref, restored: true });
        out.push({ day, a, b });
      } else if (k === 's') {
        const at = this.at(day, L.schoolHour);
        this.later(Math.max(at, T), { a: 'beat', kind: 'school', key: 's:' + day + ':' + a, at, until: this.bookEnd(x), sids: [this.sid(a)], venue: this.h.school ? this.h.school() : null, data: { first: !this.s.seen.school }, book: ref, restored: true });
      } else if (k === 'l') {
        const at = this.at(day, L.lastDayHour);
        this.later(Math.max(at, T), { a: 'beat', kind: 'lastday', key: 'l:' + day + ':' + a, at, until: this.bookEnd(x), sids: [this.sid(a)], venue: this.h.garden ? this.h.garden() : null, data: { day: day + 1 }, book: ref, restored: true });
      } else if (k === 'f') {
        const g = this.s.garden.find((s) => s.day === day);
        if (!g) continue;
        const cardAt = this.at(day, L.farewellCardHour), beatAt = this.at(day, L.farewellHour);
        const fam = String(b || '').split(',').filter(isPid);
        if (T < beatAt) this.later(Math.max(cardAt, T), this.farewellCard(g.ko, g.en, cardAt, a === '-' ? null : a));
        this.later(Math.max(beatAt, T), { a: 'beat', kind: 'farewell', key: 'f:' + day, at: beatAt, until: this.bookEnd(x), sids: [-1], venue: this.h.garden ? this.h.garden() : null,
          data: { slot: Math.max(0, this.s.garden.indexOf(g)), nameKo: g.ko, nameEn: g.en, family: fam }, book: ref, restored: true });
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- events
  /** ev.T (the engine time of the event) ≤ quietUntil: a replay after a stale side record (state only) */
  onEvent(ev) {
    this.events++;
    this.quiet = (this.quietUntil !== null && Number.isFinite(ev.T) && ev.T <= this.quietUntil) || !!ev.silent;
    const out = [];
    if (ev.e === 'life') this.life(ev, out);
    else if (ev.e === 'goTo') this.walk(ev, out);
    else if (ev.e === 'news') this.news(ev, out);
    else if (ev.e === 'move') this.move(ev, out);
    else if (ev.e === 'day') this.dayStart(ev, out);
    const q = this.quiet;
    this.quiet = false;
    // the replay keeps what changes the world (a child's body, a family that left, an elder who departed), nothing else
    return q ? out.filter((a) => a.a === 'body' || a.a === 'leave' || a.a === 'config') : out;
  }

  life(ev, out) {
    const L = this.L, s = this.s;
    switch (ev.op) {
      case 'sweetheart':
        out.push({ a: 'emit', name: 'story:life', data: { op: 'sweetheart', a: ev.a, b: ev.b } });
        out.push({ a: 'beat', kind: 'hearts', at: null, sids: [ev.a, ev.b], venue: null, data: { emote: 'emote_love' } });
        if (this.known(ev.a) || this.known(ev.b)) out.push(this.card('sweetheart', [ev.a, ev.b], `${this.name(ev.a, 'ko')} 씨와 ${this.name(ev.b, 'ko')} 씨가 사귀기 시작했대요!`, `${this.name(ev.a, 'en')} and ${this.name(ev.b, 'en')} are sweethearts now!`, { icon: 'ui_icon_friend_new' }));
        break;
      case 'engaged': {
        const day = ev.day, hour = ev.hour === undefined ? L.weddingHour : ev.hour;
        const pa = this.pid(ev.a), pb = this.pid(ev.b);
        const first = !s.seen.wedding && !s.seen.engaged;
        s.seen.engaged = true;
        const venue = this.h.hall ? this.h.hall() : null;
        const book = pa && pb ? ['w', day, pa] : null;
        if (book) this.book('w', day, pa, pb);
        out.push({ a: 'emit', name: 'story:life', data: { op: 'engaged', a: ev.a, b: ev.b, day, hour, at: this.at(day, hour), prepAt: this.at(day, L.weddingPrepHour), venue, ours: this.ours(venue) } });
        if (ev.scripted) {
          out.push({ a: 'banner', kind: 'wedding', ko: '첫 결혼식이 열려요!', en: 'The first wedding is coming!', subKo: `${this.whenKo(day)} ${hour}시 · 마을회관`, subEn: `${this.whenEn(day)} at ${hour}:00 · the town hall` });
        } else {
          out.push({ a: 'beat', kind: 'proposal', at: null, sids: [ev.a, ev.b], venue: ev.place || null, data: { scripted: false } });
          if (this.known(ev.a) || this.known(ev.b) || first) out.push(this.card('engaged', [ev.a, ev.b], `${this.name(ev.a, 'ko')} 씨가 ${this.name(ev.b, 'ko')} 씨에게 청혼했어요! 결혼식은 ${this.whenKo(day)} ${hour}시 · 마을회관`, `${this.name(ev.a, 'en')} proposed to ${this.name(ev.b, 'en')}! The wedding is ${this.whenEn(day)} at ${hour}:00 at the town hall`, { icon: 'ui_icon_story', mission: 'C1', watch: first }));
        }
        // the guests start getting ready at 10:30 (prep props appear as the C1 items land)
        const at = this.at(day, L.weddingPrepHour);
        this.later(at, { a: 'beat', kind: 'wedding', key: 'w:' + day + ':' + pa, at, until: this.at(day, L.weddingUntilHour), sids: [ev.a, ev.b], venue, data: { hour, first: !s.seen.wedding }, book, watch: first });
        break;
      }
      case 'wedding': {
        const venue = ev.place || null;
        out.push({ a: 'emit', name: 'story:life', data: { op: 'wedding', a: ev.a, b: ev.b, venue, guests: ev.guests || [], ours: this.ours(venue) } });
        out.push({ a: 'route', kind: 'wedding', ev });
        if (!s.seen.wedding) {
          s.seen.wedding = true;
          const pa = this.pid(ev.a), pb = this.pid(ev.b);
          if (pa && pb) s.firstCouple = [pa, pb];
          s.paperFrom = this.today() + 1;
        }
        break;
      }
      case 'goodnews':
        out.push({ a: 'emit', name: 'story:life', data: { op: 'goodnews', a: ev.a, b: ev.b, home: ev.home } });
        out.push({ a: 'beat', kind: 'goodnews', at: null, sids: [ev.a, ev.b], venue: ev.home, data: { days: ev.inDays } });
        if (this.known(ev.a) || this.known(ev.b) || !s.seen.baby) out.push(this.card('goodnews', [ev.a, ev.b], `${this.name(ev.a, 'ko')} 씨네 집에 기쁜 소식!`, `Happy news at ${this.name(ev.a, 'en')}’s house!`, { icon: 'ui_icon_story' }));
        break;
      case 'baby': {
        const first = !s.seen.baby;
        s.seen.baby = true;
        const venue = ev.place || (this.h.clinic ? this.h.clinic() : null);
        out.push({ a: 'emit', name: 'story:life', data: { op: 'baby', a: ev.a, b: ev.b, baby: ev.baby, venue, ours: this.ours(venue) } });
        out.push({ a: 'beat', kind: 'birth', at: null, sids: [ev.a, ev.b, ev.baby], venue, data: { first } });
        out.push({ a: 'banner', kind: 'baby', ko: '아기 탄생!', en: 'A baby is born!', subKo: `${this.name(ev.a, 'ko')} 씨네 아기`, subEn: `${this.name(ev.a, 'en')}’s baby` });
        if (first || this.known(ev.a) || this.known(ev.b)) out.push(this.card('naming', [ev.baby, ev.a, ev.b], '아기 이름을 지어 주세요!', 'Name the baby!', { icon: 'ui_icon_story', mission: 'C3', sheet: 'naming' }));
        break;
      }
      case 'birthday': this.birthday(ev, out); break;
      case 'grow':
        if (ev.group === 'adult') out.push({ a: 'emit', name: 'story:life', data: { op: 'grownup', who: ev.who } });
        break;
      case 'lastday': {
        if (!(this.h.farewellOn && this.h.farewellOn())) break;
        out.push({ a: 'emit', name: 'story:life', data: { op: 'lastday', who: ev.who, day: ev.day } });
        // the whole last day is gentle; the staged part is the afternoon: a thank-you to the chief, then the garden bench
        const pid = this.pid(ev.who), d0 = ev.day - 1;
        const at = this.at(d0, L.lastDayHour || 15);
        if (pid) this.book('l', d0, pid);
        this.later(at, { a: 'beat', kind: 'lastday', key: 'l:' + d0 + ':' + pid, at, until: this.at(d0, L.lastDayUntilHour), sids: [ev.who], venue: this.h.garden ? this.h.garden() : null, data: { day: ev.day }, book: pid ? ['l', d0, pid] : null });
        break;
      }
      case 'farewell': this.farewell(ev, out); break;
      case 'memorial': out.push({ a: 'route', kind: 'farewell', ev }); break;
      case 'housewarming':
        if (this.known(ev.who)) out.push(this.card('housewarming', [ev.who], `${this.name(ev.who, 'ko')} 씨네 집들이에 이웃들이 모였어요`, `Neighbours gather at ${this.name(ev.who, 'en')}’s housewarming`, { icon: 'ui_icon_move_in' }));
        out.push({ a: 'beat', kind: 'housewarming', at: null, sids: [ev.who], venue: ev.place, data: {} });
        break;
      default: break;
    }
  }

  ours(placeId) { return !!(placeId && this.h.ours && this.h.ours(placeId)); }

  birthday(ev, out) {
    const L = this.L, age = ev.age, sid = ev.who;
    // a parent of a child (missions A12: the party's host is a parent, not the birthday child)
    const fam = Array.isArray(ev.par) ? ev.par.map((p) => this.pid(p)).filter(Boolean) : [];
    out.push({ a: 'emit', name: 'story:life', data: Object.assign({ op: 'birthday', who: sid, age }, fam.length ? { family: fam[0] } : {}) });
    if (age === L.walkAge) {
      out.push({ a: 'body', op: 'child', sid, age });                        // a small child doll joins the town
      out.push({ a: 'beat', kind: 'firststeps', at: null, sids: [sid], venue: null, data: {} });
      if (this.known(sid)) out.push(this.card('firststeps', [sid], `${this.kid(sid, '이')} 이제 유모차 대신 혼자 걸어요!`, `${this.name(sid, 'en')} walks on their own now, no more stroller!`, { icon: 'ui_icon_story' }));
      return;
    }
    if (age === L.schoolAge) {
      const day = this.today() + 1, pid = this.pid(sid);
      const at = this.at(day, L.schoolHour);
      if (pid) this.book('s', day, pid);
      this.later(at, { a: 'beat', kind: 'school', key: 's:' + day + ':' + pid, at, until: this.at(day, L.schoolHour + 2), sids: [sid], venue: this.h.school ? this.h.school() : null, data: { first: !this.s.seen.school }, book: pid ? ['s', day, pid] : null });
      out.push({ a: 'emit', name: 'story:life', data: Object.assign({ op: 'school', who: sid, day, at, venue: this.h.school ? this.h.school() : null }, fam.length ? { family: fam[0] } : {}) });
      if (this.known(sid) || !this.s.seen.school) out.push(this.card('school', [sid], `${this.kid(sid, '이')} 내일 처음 학교에 가요!`, `${this.name(sid, 'en')} starts school tomorrow!`, { icon: 'ui_icon_story', mission: 'C4' }));
      return;
    }
    if (age === L.firstJobAge) { if (this.known(sid)) out.push(this.card('firstjob', [sid], `${this.kid(sid)}의 첫 아르바이트!`, `${this.name(sid, 'en')}’s first part-time job!`, { icon: 'ui_icon_story' })); out.push({ a: 'beat', kind: 'firstjob', at: null, sids: [sid], venue: null, data: {} }); return; }
    if (age === L.wishAge) { out.push({ a: 'emit', name: 'story:wisher', data: { who: sid } }); }
    // a birthday party for people the chief knows (≤ 1 a game day)
    const today = this.today();
    if (this.known(sid) && this.dayBirthday !== today && age > L.walkAge) {
      this.dayBirthday = today;
      out.push({ a: 'beat', kind: 'birthday', at: null, sids: [sid], venue: null, data: { age } });
      out.push(this.card('birthday', [sid], `오늘은 ${this.name(sid, 'ko')}의 ${age}번째 생일이에요!`, `It’s ${this.name(sid, 'en')}’s ${age}th birthday!`, { icon: 'ui_icon_story' }));
    }
  }

  farewellCard(nameKo, nameEn, cardAt, pid) {
    const L = this.L;
    const c = this.card('farewell', [], `${josa(nameKo, '이')} 하늘나라로 여행을 떠났어요.`, `${nameEn} has gone on a journey to the sky.`,
      { icon: 'ui_icon_memory', flower: true, subKo: `가족과 이웃들이 기억의 정원에서 배웅해요 · ${L.farewellHour}시`, subEn: `Family and neighbours say goodbye in the memorial garden · ${L.farewellHour}:00`, mission: 'C8', at: cardAt, watch: true });
    c.card.pids = pid ? [pid] : [];
    c.key = 'fc:' + Math.floor(cardAt / DAY);
    return c;
  }

  farewell(ev, out) {
    const L = this.L, s = this.s;
    const pid = this.pid(ev.who);
    // the departed leaves the town at once (asleep at home at 00:03): never seen again, never cast again (critique H4).
    // The 'leave' goes last: the story:life emit before it still names the elder by pid (missions C8).
    const leave = { a: 'leave', sids: [ev.who], why: 'farewell' };
    if (s.wishActive && s.wishActive === pid) { s.wishActive = null; s.wishAt = -1; }
    if (!(this.h.farewellOn && this.h.farewellOn())) { out.push(leave); return; }
    s.seen.farewell = true;
    const today = this.today();
    const male = !!ev.male;
    const nameKo = this.elderName(ev.who, male, 'ko'), nameEn = this.elderName(ev.who, male, 'en');
    // a stone in the garden (six slots; the seventh name goes to the garden's "기억하는 사람들" list); a replay of the
    // same farewell after a reload does not add a second stone
    const g = s.garden;
    if (!g.some((x) => x.day === today && x.ko === nameKo)) {
      if (g.length >= L.stones) { const old = g.shift(); s.gardenOld.push(old.ko); if (s.gardenOld.length > 24) s.gardenOld.shift(); }
      g.push({ ko: nameKo, en: nameEn, day: today });
    }
    const slot = Math.max(0, g.findIndex((x) => x.day === today && x.ko === nameKo));
    const fam = (Array.isArray(ev.fam) ? ev.fam : []).map((x) => this.pid(x)).filter(Boolean).slice(0, 2);
    const cardAt = this.at(today, L.farewellCardHour), beatAt = this.at(today, L.farewellHour);
    this.book('f', today, pid || '-', fam.join(','));
    this.later(cardAt, this.farewellCard(nameKo, nameEn, cardAt, pid));
    this.later(beatAt, { a: 'beat', kind: 'farewell', key: 'f:' + today, at: beatAt, until: this.at(today, L.farewellUntilHour), sids: [ev.who], venue: this.h.garden ? this.h.garden() : null,
      data: { slot, nameKo, nameEn, male, age: ev.age, family: fam }, book: ['f', today, pid || '-'] });
    out.push({ a: 'emit', name: 'story:life', data: { op: 'farewell', who: ev.who, day: today, at: beatAt, venue: this.h.garden ? this.h.garden() : null } });
    out.push(leave);
  }

  walk(ev, out) {
    if (ev.reason === 'date' || ev.reason === 'outing') out.push({ a: 'beat', kind: ev.reason, at: null, sids: ev.with >= 0 ? [ev.who, ev.with] : [ev.who], venue: ev.place, data: { eta: ev.eta } });
    else if (ev.reason === 'wedding' || ev.reason === 'memorial' || ev.reason === 'housewarming') out.push({ a: 'route', kind: ev.reason, ev });
  }

  news(ev, out) {
    // the first edition comes out the morning after the first wedding; then every morning at 07:00
    const s = this.s;
    if (!s.seen.wedding || ev.day < s.paperFrom || ev.day <= s.paperDay) return;
    const at = this.at(ev.day, this.L.paperHour);
    this.later(at, { a: 'paper', key: 'p:' + ev.day, day: ev.day, paper: ev.paper });
  }
  /** the paper reached the chief: the issue number counts from the first edition (창간호) */
  paperOut(day) {
    const s = this.s;
    if (day <= s.paperDay) return 0;
    s.paperDay = day;
    s.paperNo = (s.paperNo | 0) + 1;
    s.seen.paper = true;
    return s.paperNo;
  }

  move(ev, out) {
    // the event goes out first (pids still resolve), then the family leaves, then the banner (held during a set piece)
    if (ev.op === 'out') {
      out.push({ a: 'emit', name: 'story:move', data: { op: 'out', who: (ev.members || [])[0], members: ev.members || [] } });
      out.push({ a: 'leave', sids: ev.members || [], why: 'moved' });
      const wp = this.s.wishActive;
      if (wp && (ev.members || []).some((m) => this.pid(m) === wp)) { this.s.wishActive = null; this.s.wishAt = -1; }
      out.push({ a: 'banner', kind: 'move', ko: '이웃 한 가족이 이사를 떠났어요', en: 'A family has moved away', subKo: '새로운 모험을 찾아서', subEn: 'off on a new adventure' });
    } else if (ev.op === 'within' && ev.why === 'wedding') out.push({ a: 'emit', name: 'story:move', data: { op: 'within', household: ev.household, members: ev.members, home: ev.home } });
  }

  dayStart(ev, out) {
    out.push({ a: 'emit', name: 'story:day', data: { day: ev.day, weather: ev.weather } });
    // a wish nobody granted for wishTimeoutDays is let go (the elder may wish again another day)
    const s = this.s;
    if (s.wishActive && s.wishAt >= 0 && ev.day - s.wishAt >= this.L.wishTimeoutDays) { out.push({ a: 'emit', name: 'story:life', data: { op: 'wishEnd', whoPid: s.wishActive, why: 'late' } }); s.wishActive = null; s.wishAt = -1; }
    out.push({ a: 'wishcheck' });
  }

  /** an elder's wish (≤ 1 elder at a time): pick the first wisher whose likes fit a wish that is open in this version */
  pickWish(wishers, opts = {}) {
    if (this.s.wishActive) return null;
    for (const w of wishers || []) {
      const pid = this.pid(w.id);
      if (!pid || (this.s.wishes[pid] || 0) >= this.L.wishes) continue;
      for (const W of WISHES) {
        if (W.need && !(opts.open && opts.open[W.need])) continue;
        if (W.needGrandkid && !w.grandkidAtSchool) continue;
        if (W.likes.length && !W.likes.some((l) => w.likes.indexOf(l) >= 0)) continue;
        if ((this.s.wishDone[pid] || []).indexOf(W.id) >= 0) continue;
        this.s.wishActive = pid;
        this.s.wishAt = this.today();
        return { sid: w.id, pid, wish: W, ko: `${this.elderName(w.id, !!w.male, 'ko')}의 소원: ${W.ko}`, en: `${this.elderName(w.id, !!w.male, 'en')}’s wish: ${W.en}` };
      }
    }
    return null;
  }
  /** the chief granted a wish (missions C7 stage / done): counts it, frees the wish slot */
  wishGranted(pid, wishId) {
    const s = this.s;
    if (!isPid(pid)) return;
    s.wishes[pid] = Math.min(3, (s.wishes[pid] || 0) + 1);
    if (wishId) { const d = s.wishDone[pid] || (s.wishDone[pid] = []); if (d.indexOf(wishId) < 0) d.push(String(wishId).slice(0, 16)); if (d.length > 3) d.shift(); }
    if (s.wishActive === pid) { s.wishActive = null; s.wishAt = -1; }
    s.seen.wish = true;
    const keys = Object.keys(s.wishes);
    if (keys.length > 8) { delete s.wishes[keys[0]]; delete s.wishDone[keys[0]]; }
  }
  /** a wish ended without being granted (the mission expired, the wisher left) */
  wishEnded(pid) { const s = this.s; if (!pid || s.wishActive === pid) { s.wishActive = null; s.wishAt = -1; } }

  /** timed beats due at T */
  update(T) {
    const out = [];
    while (this.timers.length && this.timers[0].at <= T) out.push(this.timers.shift().action);
    return out;
  }

  /** the first proposal (scripted once): a young regular and their sweetheart; returns the arrange request or null */
  firstProposal(candidates) {
    if (this.s.seen.proposal) return null;
    const c = (candidates || [])[0];
    if (!c) return null;
    return { op: 'propose', data: { a: c.a, b: c.b, inDays: this.L.firstWeddingInDays, hour: this.L.weddingHour } };
  }

  state() { return this.s; }
}

/** the life part of the main-save slice (≤ 1 KB with the rest, see save.js). People are pids (strings). */
export function sanitizeLifeState(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const seen = o.seen && typeof o.seen === 'object' ? o.seen : {};
  const S = { seen: {}, firstCouple: [], names: [], garden: [], gardenOld: [], wishes: {}, wishDone: {}, wishActive: null, wishAt: -1, paperFrom: 0, paperDay: -1, paperNo: 0, booked: [] };
  for (const k of ['proposal', 'engaged', 'wedding', 'expect', 'baby', 'school', 'wish', 'farewell', 'farewellBeat', 'paper']) if (seen[k] === true || seen[k] === 1) S.seen[k] = true;
  if (Array.isArray(o.firstCouple) && o.firstCouple.length === 2 && o.firstCouple.every(isPid) && o.firstCouple[0] !== o.firstCouple[1]) S.firstCouple = o.firstCouple.slice();
  if (Array.isArray(o.names)) for (const n of o.names) if (Array.isArray(n) && typeof n[0] === 'string' && typeof n[1] === 'string' && n[1].length <= 8) S.names.push([n[0].slice(0, 24), n[1], typeof n[2] === 'string' ? n[2].slice(0, 16) : '']);
  S.names = S.names.slice(-40);
  if (Array.isArray(o.garden)) for (const g of o.garden) if (g && typeof g.ko === 'string') S.garden.push({ ko: g.ko.slice(0, 16), en: String(g.en || '').slice(0, 24), day: Number.isFinite(g.day) ? Math.floor(g.day) : 0 });
  S.garden = S.garden.slice(-6);
  if (Array.isArray(o.gardenOld)) S.gardenOld = o.gardenOld.filter((x) => typeof x === 'string').map((x) => x.slice(0, 16)).slice(-24);
  if (o.wishes && typeof o.wishes === 'object' && !Array.isArray(o.wishes)) for (const k of Object.keys(o.wishes).slice(-8)) if (isPid(k) && Number.isFinite(o.wishes[k])) S.wishes[k] = Math.max(0, Math.min(3, o.wishes[k] | 0));
  if (o.wishDone && typeof o.wishDone === 'object' && !Array.isArray(o.wishDone)) for (const k of Object.keys(o.wishDone).slice(-8)) if (isPid(k) && Array.isArray(o.wishDone[k])) S.wishDone[k] = o.wishDone[k].filter((x) => typeof x === 'string').map((x) => x.slice(0, 16)).slice(0, 3);
  if (isPid(o.wishActive)) { S.wishActive = o.wishActive; S.wishAt = Number.isFinite(o.wishAt) ? Math.floor(o.wishAt) : -1; }
  if (Number.isFinite(o.paperFrom)) S.paperFrom = Math.max(0, Math.floor(o.paperFrom));
  if (Number.isFinite(o.paperDay)) S.paperDay = Math.max(-1, Math.floor(o.paperDay));
  if (Number.isFinite(o.paperNo)) S.paperNo = Math.max(0, Math.min(1e6, Math.floor(o.paperNo)));
  if (Array.isArray(o.booked)) {
    for (const x of o.booked) {
      if (!Array.isArray(x) || BOOK_KINDS.indexOf(x[0]) < 0 || !Number.isFinite(x[1]) || !isPid(x[2])) continue;
      S.booked.push([x[0], Math.floor(x[1]), x[2], typeof x[3] === 'string' ? x[3].slice(0, 60) : '', Number.isFinite(x[4]) ? x[4] | 0 : 0]);
    }
    S.booked = S.booked.slice(-8);
  }
  return S;
}
