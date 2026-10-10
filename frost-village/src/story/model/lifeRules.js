// LifeDirector (docs/v5_v8_plan.md §6.1 "Life arc", "Gentleness rules", "Beat rates and caps", "Known people").
// Turns the story engine's life events into staged beats, story cards, banners and mission offers — gently, at
// the planned times, within the caps. Pure and deterministic: no Phaser, no clock of its own (T = DayClock.T,
// game seconds; 600 s a day, 25 s an hour).
//
//   const D = new LifeDirector(tuning.life, slice.life, hooks)
//   D.onEvent(ev) -> actions      (ev = a core event: { e: 'life'|'goTo'|'news'|'move'|'day', … })
//   D.update(T)   -> actions      (timed beats: wedding prep 10:30, the paper 07:00, the farewell card 09:00 …)
//   action: { a: 'beat', kind, at, sids, venue, data } | { a: 'card', card } | { a: 'banner', … } | { a: 'emit', name, data }
//           | { a: 'arrange', op, data } | { a: 'config', config } | { a: 'paper', day } | { a: 'body', … }
// hooks: { pidOf(sid), known(pid), farewellOn(), gardenReady(), v5T(), nameOf(sid, lang), hall(), clinic(), garden(), school() }

export const HOUR = 25;          // game seconds per clock hour (600 s day)

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

export class LifeDirector {
  constructor(tuning = {}, state = null, hooks = {}) {
    this.L = Object.assign({
      weddingHour: 11, weddingPrepHour: 10.5, firstWeddingInDays: 1, birthdaysPerDay: 1, schoolAge: 7, walkAge: 4, firstJobAge: 16,
      wishAge: 82, wishes: 3, stones: 6, paperHour: 7, farewellCardHour: 9, farewellHour: 10, birthDuskHour: 18, birthDawnHour: 6.5,
    }, tuning);
    this.h = hooks;
    this.s = sanitizeLifeState(state);
    this.timers = [];         // [{ at, action }] (not saved: rebuilt from the engine's events after a load)
    this.dayBirthday = -1;    // birthday parties staged today
    this.events = 0;
  }

  // ---------------------------------------------------------------- helpers
  pid(sid) { return this.h.pidOf ? this.h.pidOf(sid) : null; }
  known(sid) { const p = this.pid(sid); return !!(p && this.h.known && this.h.known(p)); }
  name(sid, lang) { return this.h.nameOf ? this.h.nameOf(sid, lang) : '#' + sid; }
  at(day, hour) { return day * 24 * HOUR + hour * HOUR; }
  later(at, action) {
    let i = this.timers.length;
    while (i > 0 && this.timers[i - 1].at > at) i--;
    this.timers.splice(i, 0, { at, action });
  }
  card(kind, sids, ko, en, extra) { return { a: 'card', card: Object.assign({ kind, sids, pids: sids.map((s) => this.pid(s)), ko, en }, extra || {}) }; }

  /** '순자 할머니' / 'Grandma Sunja' */
  elderName(sid, male, lang) {
    const n = this.name(sid, lang);
    const t = ELDER_TITLE(male);
    if (lang === 'en') return /^(Grandma|Grandpa) /.test(n) ? n : t[1] + ' ' + n.split(' ').pop();
    if (/할머니|할아버지/.test(n)) return n;
    const given = n.length >= 3 ? n.slice(1) : n;
    return given + ' ' + t[0];
  }

  // ---------------------------------------------------------------- events
  onEvent(ev) {
    this.events++;
    const out = [];
    if (ev.e === 'life') this.life(ev, out);
    else if (ev.e === 'goTo') this.walk(ev, out);
    else if (ev.e === 'news') this.news(ev, out);
    else if (ev.e === 'move') this.move(ev, out);
    else if (ev.e === 'day') this.dayStart(ev, out);
    return out;
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
        const first = !s.seen.wedding && !s.seen.engaged;
        s.seen.engaged = true;
        out.push({ a: 'emit', name: 'story:life', data: { op: 'engaged', a: ev.a, b: ev.b, day, hour, venue: this.h.hall ? this.h.hall() : null } });
        if (ev.scripted) {
          out.push({ a: 'banner', kind: 'wedding', ko: '첫 결혼식이 열려요!', en: 'The first wedding is coming!', subKo: `${day > (this.h.today ? this.h.today() : day) ? '내일' : '오늘'} ${hour}시 · 마을회관`, subEn: `${hour}:00 · the town hall` });
        } else {
          out.push({ a: 'beat', kind: 'proposal', at: null, sids: [ev.a, ev.b], venue: ev.place || null, data: { scripted: false } });
          if (this.known(ev.a) || this.known(ev.b) || first) out.push(this.card('engaged', [ev.a, ev.b], `${this.name(ev.a, 'ko')} 씨가 ${this.name(ev.b, 'ko')} 씨에게 청혼했어요! 결혼식은 ${hour}시 · 마을회관`, `${this.name(ev.a, 'en')} proposed to ${this.name(ev.b, 'en')}! The wedding is at ${hour}:00 at the town hall`, { icon: 'ui_icon_story', mission: 'C1' }));
        }
        // the guests start getting ready at 10:30 (prep props appear as the C1 items land)
        this.later(this.at(day, L.weddingPrepHour), { a: 'beat', kind: 'wedding', at: this.at(day, L.weddingPrepHour), sids: [ev.a, ev.b], venue: this.h.hall ? this.h.hall() : null, data: { hour, first: !s.seen.wedding } });
        break;
      }
      case 'wedding':
        out.push({ a: 'emit', name: 'story:life', data: { op: 'wedding', a: ev.a, b: ev.b, venue: ev.place, guests: ev.guests || [] } });
        out.push({ a: 'route', kind: 'wedding', ev });
        if (!s.seen.wedding) { s.seen.wedding = true; s.firstCouple = [ev.a, ev.b]; s.paperFrom = (this.h.today ? this.h.today() : 0) + 1; }
        break;
      case 'goodnews':
        out.push({ a: 'emit', name: 'story:life', data: { op: 'goodnews', a: ev.a, b: ev.b, home: ev.home } });
        out.push({ a: 'beat', kind: 'goodnews', at: null, sids: [ev.a, ev.b], venue: ev.home, data: { days: ev.inDays } });
        if (this.known(ev.a) || this.known(ev.b) || !s.seen.baby) out.push(this.card('goodnews', [ev.a, ev.b], `${this.name(ev.a, 'ko')} 씨네 집에 기쁜 소식!`, `Happy news at ${this.name(ev.a, 'en')}’s house!`, { icon: 'ui_icon_story' }));
        break;
      case 'baby': {
        const first = !s.seen.baby;
        s.seen.baby = true;
        out.push({ a: 'emit', name: 'story:life', data: { op: 'baby', a: ev.a, b: ev.b, baby: ev.baby, venue: ev.place } });
        out.push({ a: 'beat', kind: 'birth', at: null, sids: [ev.a, ev.b, ev.baby], venue: ev.place || (this.h.clinic ? this.h.clinic() : null), data: { first } });
        out.push({ a: 'banner', kind: 'baby', ko: '아기 탄생!', en: 'A baby is born!', subKo: `${this.name(ev.a, 'ko')} 씨네 아기`, subEn: `${this.name(ev.a, 'en')}’s baby` });
        if (first || this.known(ev.a) || this.known(ev.b)) out.push(this.card('naming', [ev.baby, ev.a, ev.b], '아기 이름을 지어 주세요!', 'Name the baby!', { icon: 'ui_icon_story', mission: 'C3', sheet: 'naming' }));
        break;
      }
      case 'birthday': this.birthday(ev, out); break;
      case 'grow':
        if (ev.group === 'adult') out.push({ a: 'emit', name: 'story:life', data: { op: 'grownup', who: ev.who } });
        break;
      case 'lastday':
        if (!(this.h.farewellOn && this.h.farewellOn())) break;
        out.push({ a: 'beat', kind: 'lastday', at: null, sids: [ev.who], venue: this.h.garden ? this.h.garden() : null, data: { day: ev.day } });
        break;
      case 'farewell': this.farewell(ev, out); break;
      case 'memorial': out.push({ a: 'route', kind: 'farewell', ev }); break;
      case 'housewarming':
        if (this.known(ev.who)) out.push(this.card('housewarming', [ev.who], `${this.name(ev.who, 'ko')} 씨네 집들이에 이웃들이 모였어요`, `Neighbours gather at ${this.name(ev.who, 'en')}’s housewarming`, { icon: 'ui_icon_move_in' }));
        out.push({ a: 'beat', kind: 'housewarming', at: null, sids: [ev.who], venue: ev.place, data: {} });
        break;
      default: break;
    }
  }

  birthday(ev, out) {
    const L = this.L, age = ev.age, sid = ev.who;
    out.push({ a: 'emit', name: 'story:life', data: { op: 'birthday', who: sid, age } });
    if (age === L.walkAge) {
      out.push({ a: 'body', op: 'child', sid, age });                        // a small child doll joins the town
      out.push({ a: 'beat', kind: 'firststeps', at: null, sids: [sid], venue: null, data: {} });
      if (this.known(sid)) out.push(this.card('firststeps', [sid], `${this.name(sid, 'ko')}가 아장아장 걷기 시작했어요!`, `${this.name(sid, 'en')} took their first steps!`, { icon: 'ui_icon_story' }));
      return;
    }
    if (age === L.schoolAge) {
      const today = this.h.today ? this.h.today() : 0;
      const at = this.at(today + 1, 7);
      this.later(at, { a: 'beat', kind: 'school', at, sids: [sid], venue: this.h.school ? this.h.school() : null, data: { first: !this.s.seen.school } });
      if (this.known(sid) || !this.s.seen.school) out.push(this.card('school', [sid], `${this.name(sid, 'ko')}가 내일 처음 학교에 가요!`, `${this.name(sid, 'en')} starts school tomorrow!`, { icon: 'ui_icon_story', mission: 'C4' }));
      return;
    }
    if (age === L.firstJobAge) { if (this.known(sid)) out.push(this.card('firstjob', [sid], `${this.name(sid, 'ko')}의 첫 아르바이트!`, `${this.name(sid, 'en')}’s first part-time job!`, { icon: 'ui_icon_story' })); out.push({ a: 'beat', kind: 'firstjob', at: null, sids: [sid], venue: null, data: {} }); return; }
    if (age === L.wishAge) { out.push({ a: 'emit', name: 'story:wisher', data: { who: sid } }); }
    // a birthday party for people the chief knows (≤ 1 a game day)
    const today = this.h.today ? this.h.today() : 0;
    if (this.known(sid) && this.dayBirthday !== today && age > L.walkAge) {
      this.dayBirthday = today;
      out.push({ a: 'beat', kind: 'birthday', at: null, sids: [sid], venue: null, data: { age } });
      out.push(this.card('birthday', [sid], `오늘은 ${this.name(sid, 'ko')}의 ${age}번째 생일이에요!`, `It’s ${this.name(sid, 'en')}’s ${age}th birthday!`, { icon: 'ui_icon_story' }));
    }
  }

  farewell(ev, out) {
    const L = this.L, s = this.s;
    if (!(this.h.farewellOn && this.h.farewellOn())) return;
    s.seen.farewell = true;
    const today = this.h.today ? this.h.today() : 0;
    const male = !!ev.male;
    const nameKo = this.elderName(ev.who, male, 'ko'), nameEn = this.elderName(ev.who, male, 'en');
    // a stone in the garden (six slots; the seventh name goes to the garden's "기억하는 사람들" list)
    const g = s.garden;
    if (g.length >= L.stones) { const old = g.shift(); s.gardenOld.push(old.ko); if (s.gardenOld.length > 24) s.gardenOld.shift(); }
    g.push({ ko: nameKo, en: nameEn, day: today });
    const slot = g.length - 1;
    const cardAt = this.at(today, L.farewellCardHour), beatAt = this.at(today, L.farewellHour);
    this.later(cardAt, this.card('farewell', [ev.who], `${nameKo}가 하늘나라로 여행을 떠났어요.`, `${nameEn} has gone on a journey to the sky.`,
      { icon: 'ui_icon_memory', flower: true, subKo: `가족과 이웃들이 기억의 정원에서 배웅해요 · ${L.farewellHour}시`, subEn: `Family and neighbours say goodbye in the memorial garden · ${L.farewellHour}:00`, mission: 'C8', at: cardAt }));
    this.later(beatAt, { a: 'beat', kind: 'farewell', at: beatAt, sids: [ev.who], venue: this.h.garden ? this.h.garden() : null, data: { slot, nameKo, nameEn, male, age: ev.age } });
    out.push({ a: 'emit', name: 'story:life', data: { op: 'farewell', who: ev.who } });
  }

  walk(ev, out) {
    if (ev.reason === 'date' || ev.reason === 'outing') out.push({ a: 'beat', kind: ev.reason, at: null, sids: ev.with >= 0 ? [ev.who, ev.with] : [ev.who], venue: ev.place, data: { eta: ev.eta } });
    else if (ev.reason === 'wedding' || ev.reason === 'memorial' || ev.reason === 'housewarming') out.push({ a: 'route', kind: ev.reason, ev });
  }

  news(ev, out) {
    // the first edition comes out the morning after the first wedding; then every morning at 07:00
    const s = this.s;
    if (!s.seen.wedding || ev.day < s.paperFrom) return;
    const at = this.at(ev.day, this.L.paperHour);
    this.later(at, { a: 'paper', day: ev.day, paper: ev.paper, first: !s.seen.paper });
    s.seen.paper = true;
  }

  move(ev, out) {
    if (ev.op === 'out') out.push({ a: 'banner', kind: 'move', ko: '이웃 한 가족이 이사를 떠났어요', en: 'A family has moved away', subKo: '새로운 모험을 찾아서', subEn: 'off on a new adventure', sids: ev.members, leave: true });
    else if (ev.op === 'within' && ev.why === 'wedding') out.push({ a: 'emit', name: 'story:move', data: { op: 'within', household: ev.household, members: ev.members, home: ev.home } });
  }

  dayStart(ev, out) {
    out.push({ a: 'emit', name: 'story:day', data: { day: ev.day, weather: ev.weather } });
    out.push({ a: 'wishcheck' });
  }

  /** an elder's wish (≤ 1 elder at a time): pick the first wisher whose likes fit a wish that is open in this version */
  pickWish(wishers, opts = {}) {
    if (this.s.wishActive >= 0) return null;
    for (const w of wishers || []) {
      if ((this.s.wishes[w.id] || 0) >= this.L.wishes) continue;
      for (const W of WISHES) {
        if (W.need && !(opts.open && opts.open[W.need])) continue;
        if (W.needGrandkid && !w.grandkidAtSchool) continue;
        if (W.likes.length && !W.likes.some((l) => w.likes.indexOf(l) >= 0)) continue;
        if ((this.s.wishDone[w.id] || []).indexOf(W.id) >= 0) continue;
        this.s.wishActive = w.id;
        return { sid: w.id, wish: W, ko: `${this.elderName(w.id, !!w.male, 'ko')}의 소원: ${W.ko}`, en: `${this.elderName(w.id, !!w.male, 'en')}’s wish: ${W.en}` };
      }
    }
    return null;
  }
  wishGranted(sid, wishId) {
    const s = this.s;
    s.wishes[sid] = (s.wishes[sid] || 0) + 1;
    (s.wishDone[sid] || (s.wishDone[sid] = [])).push(wishId);
    if (s.wishActive === sid) s.wishActive = -1;
    s.seen.wish = true;
    const keys = Object.keys(s.wishes);
    if (keys.length > 8) { delete s.wishes[keys[0]]; delete s.wishDone[keys[0]]; }
  }

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
    this.s.seen.proposal = true;
    return { op: 'propose', data: { a: c.a, b: c.b, inDays: this.L.firstWeddingInDays, hour: this.L.weddingHour } };
  }

  state() { return this.s; }
}

/** the life part of the main-save slice (≤ 1 KB with the rest, see save.js) */
export function sanitizeLifeState(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const seen = o.seen && typeof o.seen === 'object' ? o.seen : {};
  const S = { seen: {}, firstCouple: [], names: [], garden: [], gardenOld: [], wishes: {}, wishDone: {}, wishActive: -1, paperFrom: 0 };
  for (const k of ['proposal', 'engaged', 'wedding', 'baby', 'school', 'wish', 'farewell', 'paper']) if (seen[k] === true) S.seen[k] = true;
  if (Array.isArray(o.firstCouple)) S.firstCouple = o.firstCouple.filter((x) => Number.isInteger(x) && x >= 0).slice(0, 2);
  if (Array.isArray(o.names)) for (const n of o.names) if (Array.isArray(n) && typeof n[0] === 'string' && typeof n[1] === 'string' && n[1].length <= 8) S.names.push([n[0].slice(0, 24), n[1], typeof n[2] === 'string' ? n[2].slice(0, 16) : '']);
  S.names = S.names.slice(-40);
  if (Array.isArray(o.garden)) for (const g of o.garden) if (g && typeof g.ko === 'string') S.garden.push({ ko: g.ko.slice(0, 16), en: String(g.en || '').slice(0, 24), day: Number.isFinite(g.day) ? Math.floor(g.day) : 0 });
  S.garden = S.garden.slice(-6);
  if (Array.isArray(o.gardenOld)) S.gardenOld = o.gardenOld.filter((x) => typeof x === 'string').map((x) => x.slice(0, 16)).slice(-24);
  if (o.wishes && typeof o.wishes === 'object') for (const k of Object.keys(o.wishes).slice(-8)) if (/^\d+$/.test(k) && Number.isFinite(o.wishes[k])) S.wishes[k] = Math.max(0, Math.min(3, o.wishes[k] | 0));
  if (o.wishDone && typeof o.wishDone === 'object') for (const k of Object.keys(o.wishDone)) if (S.wishes[k] !== undefined && Array.isArray(o.wishDone[k])) S.wishDone[k] = o.wishDone[k].filter((x) => typeof x === 'string').slice(0, 3);
  if (Number.isInteger(o.wishActive)) S.wishActive = o.wishActive;
  if (Number.isFinite(o.paperFrom)) S.paperFrom = Math.max(0, Math.floor(o.paperFrom));
  return S;
}
