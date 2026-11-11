// (v4.3) 마을 주민 창 — the roster: exactly the people the population chip counts (VillageLife.people(): the named
// villagers who moved in, pets left out, + Civic.settlers), and everything the window says about each of them, read
// from the live game (spec §1–§5, §7):
//   list()        the people, named villagers in move-in order then settlers 1…n (rebuilt only when a count changes)
//   resolve(p)    the body that shows the person now: their Resident, else a job body wearing their look (a station
//                 operator, a register clerk, a worker); settlers and capped / loading villagers have none
//   action(p, o)  지금 하는 일 from the body's real state (VillageLife jobs and events, Labour operators, clerks) or, for
//                 settlers, from the day clock and their job; o.place = where to look for them (따라가기)
//   happiness(p)  0–100 from real state (home, food on the counters, decor, the chief, the neighbours, mood)
//   home / family / wage / values / profile words
// Nothing is saved: identities are fixed by the save id (identity.js), the rest is read live.

import { Assets } from '../../core/Assets.js';
import { ChatSave } from '../../core/Save.js';
import { BALANCE } from '../../data/balance.js';
import { WORLD } from '../../data/world.js';
import { getLang, t } from '../../data/strings.js';
import { gdist } from '../../core/Iso.js';
import { CAST } from '../../voice/cast.js';
import { NAMED, FAMILY, FRIENDS, AREA, AREA_ANY, STATION, JOB, VALUES, VALUE_BY_ID, JOB_WORD, LIKE_BUILT } from './data.js';
import { settlerIdentity, partnerOf, fnv, traitLabel, likeLabel } from './identity.js';
import { rt } from './strings.js';

const EMPTY = [];
// the step after which each named villager moves in (이사 온 때)
const STEP_OF = {};
for (const id in (WORLD.life && WORLD.life.moveIns) || {}) for (const k of WORLD.life.moveIns[id]) if (!STEP_OF[k]) STEP_OF[k] = id;
const STAGES = [[85, 'family'], [60, 'close'], [35, 'friend'], [15, 'acquaintance'], [0, 'stranger']];
const FEMALE_VOICE = /^(adult_f|elder_f|kid_girl|sweet)$/;
export const DOT = { work: 0x3fae5a, rest: 0x4a8fe0, play: 0xf09a30, away: 0x9aa3b0 };

const lang = () => (getLang() === 'en' ? 'en' : 'ko');
/** an operator spot's station id (a Workshop has a kind, not an id) */
const spotId = (s) => (s && (s.id || (s.station && (s.station.id || s.station.kind)))) || 'grill';

export class Roster {
  constructor(gs) {
    this.gs = gs;
    this.sig = '';
    this.people = [];
    this.byPid = Object.create(null);
    this.regs = [];
    this.regsT = -1;
    this.chatRec = null;
    this.chatCid = null;
    this._pt = { x: 0, y: 0 };
    this._terms = [];
  }

  // ================================================================ who
  /** the listed people (cached; rebuilt when the moved list, the settlers, the houses or the save change) */
  list() {
    const gs = this.gs, life = gs.life;
    if (!life) return EMPTY;
    const c = gs.civic;
    const sig = life.moved.length + '|' + (c ? c.settlers : 0) + '|' + gs.houses.length + '|' + gs.cid + '|' + (c && c.hall ? 1 : 0);
    if (sig !== this.sig) { this.sig = sig; this.rebuild(); }
    return this.people;
  }

  get(pid) { this.list(); return this.byPid[pid] || null; }

  rebuild() {
    const gs = this.gs, life = gs.life, out = [];
    const keep = this.byPid;
    this.byPid = Object.create(null);
    for (const k of life.moved) {
      if (life.isPetKey(k)) continue;
      const pid = 'v:' + k;
      const p = keep[pid] || this.makeNamed(k);
      out.push(p); this.byPid[pid] = p;
    }
    const n = gs.civic ? gs.civic.settlers : 0;
    for (let i = 1; i <= n; i++) {
      const pid = 's:' + i;
      let p = keep[pid];
      if (!p || p.cid !== gs.cid) p = this.makeSettler(i);
      out.push(p); this.byPid[pid] = p;
    }
    this.people = out;
    this.assignHomes(out, n);
  }

  makeNamed(k) {
    const d = NAMED[k] || null;
    const def = Assets.charDef(k) || {};
    const role = def.role || 'adult';
    const age = d ? d.age : ({ kid: 9, teen: 16, elder: 74 }[role] || 36);
    const sex = d ? d.sex : (FEMALE_VOICE.test(CAST[k] || '') ? 'f' : 'm');
    const group = d ? d.group : role;
    return { pid: 'v:' + k, kind: 'v', key: k, look: k, d, age, sex, group, jobId: d ? d.jobId : (age < 19 ? 'student' : group === 'elder' ? 'retired' : 'none'),
      step: STEP_OF[k] || 'start', bodyRef: null, bodyKind: null, bodyHost: null, home: null };
  }

  makeSettler(i) {
    const gs = this.gs, id = settlerIdentity(gs.cid, i);
    return { pid: 's:' + i, kind: 's', i, id, cid: gs.cid, look: id.look, age: id.age, sex: id.sex, group: 'adult', jobId: id.job, bodyRef: null, bodyKind: null, bodyHost: null, home: null };
  }

  // ================================================================ homes (사는 곳, spec §1.5)
  assignHomes(out, settlers) {
    const gs = this.gs;
    const houses = gs.houses.slice().sort((a, b) => ((a.site && a.site.id) || '') < ((b.site && b.site.id) || '') ? -1 : 1);
    const rank = {};
    const H = houses.map((h) => {
      const sid = (h.site && h.site.id) || '';
      const first = /^h43_/.test(sid);
      const n = first ? 0 : (rank[h.key] = (rank[h.key] || 0) + 1);
      return { kind: 'house', house: h, sid, key: h.key, n, first, cap: h.people, free: h.people, mates: [] };
    });
    const bySite = {};
    for (const r of H) bySite[r.sid] = r;
    const hallRooms = gs.civic && gs.civic.hall ? gs.civic.popBonus() : 0;
    const hall = { kind: 'hall', free: hallRooms, mates: [] };
    const tents = {};
    const homeOfKey = {};
    // named villagers: the tent families (their house once it stands, else their tent), spouses together, the rest at
    // their persona home
    const later = [];
    for (const p of out) {
      if (p.kind !== 'v') continue;
      const d = p.d, hs = d && d.house;
      if (hs && hs.indexOf('with:') === 0) { later.push(p); continue; }
      if (hs) {
        const r = bySite[hs];
        if (r) { p.home = r; r.free--; r.mates.push(p); }
        else { const tk = tents[hs] || (tents[hs] = { kind: 'tent', site: hs, mates: [] }); p.home = tk; tk.mates.push(p); }
      } else p.home = { kind: 'persona', mates: [p] };
      homeOfKey[p.key] = p.home;
    }
    for (const p of later) {
      const h = homeOfKey[p.d.house.slice(5)];
      if (h) { p.home = h; if (h.free !== undefined) h.free--; h.mates.push(p); } else p.home = { kind: 'persona', mates: [p] };
      homeOfKey[p.key] = p.home;
    }
    // settlers: one household per couple (2k-1, 2k; an odd last one alone), first fit in the houses by plot id (a
    // couple needs two beds; with no house that has two, the first with one: the one who came first never has to move
    // when the partner arrives), then the hall's rooms
    const sp = {};
    for (const p of out) if (p.kind === 's') sp[p.i] = p;
    for (let i = 1; i <= settlers; i += 2) {
      const need = sp[i + 1] ? 2 : 1;
      let home = null;
      for (const r of H) if (r.free >= need) { home = r; break; }
      if (!home) for (const r of H) if (r.free >= 1) { home = r; break; }
      if (!home) home = hall;
      for (const j of [i, i + 1]) {
        const p = sp[j];
        if (!p) continue;
        home.free--;
        p.home = home; home.mates.push(p);
      }
    }
  }

  /** where a person's home is (a reused point) */
  homePoint(p) {
    const gs = this.gs, o = this._pt, h = p.home;
    if (h && h.kind === 'house' && h.house) { o.x = h.house.door.x; o.y = h.house.door.y - 10; return o; }
    if (h && h.kind === 'hall' && gs.civic && gs.civic.hall) { o.x = gs.civic.hall.x; o.y = gs.civic.hall.y; return o; }
    if (h && h.kind === 'tent') {
      const pl = WORLD.plots && WORLD.plots[h.site], id = pl && pl.tents && pl.tents[0];
      const img = id && gs.decorById && gs.decorById[id];
      if (img) { o.x = img.x; o.y = img.y + 20; return o; }
    }
    const d = p.d, life = gs.life;
    for (const a of (d && d.homeAt) || EMPTY) {
      if (a.indexOf('st:') === 0) { const s = gs.stations && gs.stations[a.slice(3)]; if (s && s.enabled !== false) { o.x = s.x; o.y = s.y + 40; return o; } continue; }
      const ar = life && life.areas[a];
      if (ar && life.areaOpen(ar)) { o.x = ar.x; o.y = ar.y; return o; }
    }
    const ar = life && (life.areas.plaza_s || life.areas.notice);
    if (ar) { o.x = ar.x; o.y = ar.y; return o; }
    o.x = gs.player.x; o.y = gs.player.y; return o;
  }

  /** 사는 곳 in words */
  homeText(p) {
    const h = p.home, L = lang();
    let s;
    if (!h) s = AREA_ANY[L];
    else if (h.kind === 'house') s = h.first ? rt('r_home_first', { house: t('b_' + h.key) }) : rt('r_home_house', { house: t('b_' + h.key), n: h.n });
    else if (h.kind === 'hall') s = rt('r_home_hall');
    else if (h.kind === 'tent') s = rt('r_home_tent');
    else s = p.d ? p.d[L].home : AREA_ANY[L];
    return s;
  }

  /** the others who live in the same home */
  housemates(p) { const h = p.home; return h && h.mates ? h.mates.filter((q) => q !== p) : EMPTY; }

  // ================================================================ names and words
  /** the name the list shows (a given name, else the full title) */
  shortName(p) {
    const L = lang();
    if (p.kind === 's') return L === 'en' ? p.id.nameEn : p.id.name;
    const d = p.d;
    if (d && d.given) return d.given[L];
    return Assets.charName(p.key, L) || (d ? d.ko.name : p.key);
  }
  /** the name the profile shows */
  fullName(p) {
    const L = lang();
    if (p.kind === 's') return L === 'en' ? p.id.nameEn : p.id.name;
    return Assets.charName(p.key, L) || (p.d ? p.d.ko.name : p.key);
  }
  /** a short name for any character key (a chat partner may be anyone living here) */
  nameOfKey(k) {
    const p = this.byPid['v:' + k];
    if (p) return this.shortName(p);
    return Assets.charName(k, lang()) || '';
  }

  traits(p) { const L = lang(); if (p.kind === 's') return p.id.traits.map((x) => traitLabel(x, L)); return p.d ? p.d[L].traits : EMPTY; }
  likes(p) { const L = lang(); if (p.kind === 's') return p.id.likes.map((x) => likeLabel(x, L)); return p.d ? p.d[L].likes : EMPTY; }

  /** 가치 추구: two VALUES ids (named: hand-assigned; settlers: scored over their trait words, likes and job) */
  values(p) {
    if (p.kind === 'v') return p.d ? p.d.values : ['friendship', 'nature'];
    if (p.values) return p.values;
    const id = p.id;
    const words = id.traits.map((x) => traitLabel(x, 'ko')).concat(id.likes.map((x) => likeLabel(x, 'ko')), [JOB_WORD[id.job] || '']);
    p.values = scoreValues(p.pid, words);
    return p.values;
  }

  // ================================================================ jobs and money
  gateMet(g) {
    if (!g) return true;
    const gs = this.gs;
    try {
      if (g === '?station') return !!(gs.v4 && gs.v4.ours && gs.v4.ours.open);
      if (g === '?bank') return !!(gs.v42 && gs.v42.office && gs.v42.office.bank);
      if (g === '?depot') return !!(gs.v42 && gs.v42.depot && gs.v42.depot.built);
      return !!gs.progress.met(g);
    } catch (e) { return false; }
  }

  /** the job the person really does now (a settler whose workplace is not built: 'none') */
  jobNow(p) {
    if (p.kind === 's') return p.id.job !== 'none' && this.gateMet(p.id.gate) ? p.id.job : 'none';
    return p.jobId;
  }

  /** 직장 · 하는 일 in words (the list's second line) */
  jobText(p) {
    const L = lang();
    if (p.kind === 'v') {
      if (p.bodyKind === 'op' && p.bodyHost) { const S = STATION[spotId(p.bodyHost)] || STATION.grill; return rt('r_job_at', { place: S[L], job: S.role[L] }); }
      if (p.bodyKind === 'clerk') return rt('r_job_at', { place: rt('wp_market'), job: L === 'en' ? 'clerk' : '점원' });
      if (p.jobId === 'none') return rt('r_job_seek');
      if (p.jobId === 'retired') return p.d ? rt('r_job_retired') + ' · ' + p.d[L].job : rt('r_job_retired');
      return p.d ? p.d[L].job : (JOB[p.jobId] || JOB.none)[L];
    }
    const j = this.jobNow(p);
    if (j === 'none') return p.id.job === 'none' ? rt('r_job_seek') : rt('r_job_seek');
    const J = JOB[j];
    return rt('r_job_at', { place: rt('wp_' + J.at), job: J[L] });
  }

  /** wage: { day, month, pay: 'salary' | 'pension' | 'pocket' | 'none' | 'toddler' } (a reused object) */
  wage(p, o) {
    o = o || {};
    const J = JOB[this.jobNow(p)] || JOB.none;
    o.pay = J.pay; o.day = J.day; o.month = J.day * 30;
    if (o.pay === 'salary' && !o.day) o.pay = 'none';
    return o;
  }

  /** coins of tax a day once the hall stands (TownHall: taxPerPerson a minute) */
  taxPerDay() {
    const gs = this.gs, c = gs.civic;
    if (!c || !c.hall) return 0;
    const per = Number((BALANCE.civic && BALANCE.civic.hall && BALANCE.civic.hall.taxPerPerson) || 0);
    const C = gs.v4 && gs.v4.clock;
    const len = C && C.dayLen ? C.dayLen() : 600;
    return Math.round(per * len / 60 * 10) / 10;
  }

  /** { work, kid, elder } for the filter chips (one reused object) */
  category(p) {
    const w = this.wage(p, this._w || (this._w = {}));
    const o = this._cat || (this._cat = { work: false, kid: false, elder: false });
    o.work = w.pay === 'salary'; o.kid = p.age < 19; o.elder = p.age >= 65 || p.group === 'elder';
    return o;
  }

  // ================================================================ bodies
  /** registers that may have a clerk (re-collected every 2 s) */
  registers() {
    const gs = this.gs, now = gs.time ? gs.time.now : 0;
    if (now - this.regsT < 2000 && this.regsT >= 0) return this.regs;
    this.regsT = now;
    const R = this.regs;
    R.length = 0;
    const add = (r) => { if (r && r.clerkKeys && R.indexOf(r) < 0) R.push(r); };
    const scan = (o) => {
      if (!o) return;
      add(o.register);
      if (o.seats) for (const k in o.seats) add(o.seats[k]);
      if (o.lanes) for (const k in o.lanes) add(o.lanes[k] && o.lanes[k].register);
    };
    scan(gs.market); scan(gs.trade); scan(gs.store); scan(gs.civic && gs.civic.restaurant);
    return R;
  }

  /** find the body that shows person p now (sets p.bodyRef / bodyKind / bodyHost) */
  resolve(p) {
    p.bodyRef = null; p.bodyKind = null; p.bodyHost = null;
    if (p.kind !== 'v') return null;
    const gs = this.gs, life = gs.life, k = p.key;
    const r = life && life.byKey[k];
    if (r && r.alive) { p.bodyRef = r; p.bodyKind = 'res'; return r; }
    if (!gs.keysInUse || !gs.keysInUse.has(k)) return null;
    const ops = (s) => {
      const o = s && s.op && s.op.operator;
      if (o && o.alive !== false && (o.key === k || o.wantKey === k)) { p.bodyRef = o; p.bodyKind = 'op'; p.bodyHost = s.op; return true; }
      return false;
    };
    for (const s of gs.stationList || EMPTY) if (ops(s)) return p.bodyRef;
    for (const s of gs.workshops || EMPTY) if (ops(s)) return p.bodyRef;
    for (const R of this.registers()) {
      const c = R.clerk;
      if (c && c.alive !== false && (c.key === k || c.wantKey === k)) { p.bodyRef = c; p.bodyKind = 'clerk'; p.bodyHost = R; return c; }
    }
    for (const L of [gs.workers, gs.porters, gs.rawPorters]) for (const w of L || EMPTY) if (w && w.key === k && w.alive !== false) { p.bodyRef = w; p.bodyKind = 'worker'; return w; }
    return null;
  }

  // ================================================================ 지금 하는 일 (spec §4)
  clock() {
    const C = this.gs.v4 && this.gs.v4.clock;
    if (C && C.on) return C;
    return null;
  }
  hour() { const C = this.clock(); return C ? C.hour() : 11; }
  day() { const C = this.clock(); return C ? C.day() : 0; }

  /** o: { key, text, dot, x, y, where, body } — where = the follow chip's second line ('' when a body shows them) */
  action(p, o) {
    o.key = 'act_break'; o.params = null; o.dot = DOT.away; o.where = ''; o.body = null;
    if (p.kind === 's') this.actSettler(p, o);
    else {
      const b = this.resolve(p);
      if (b && p.bodyKind === 'res') this.actResident(b, o);
      else if (b && p.bodyKind === 'op') this.actOperator(p.bodyHost, b, o);
      else if (b && p.bodyKind === 'clerk') this.actClerk(p.bodyHost, b, o);
      else if (b) { o.key = b.stack && b.stack.count ? 'act_carry' : 'act_op_work'; o.dot = DOT.work; }
      if (b) { o.body = b; o.x = b.x; o.y = b.y; }
      else this.actHome(p, o);
    }
    o.text = rt(o.key, o.params);
    return o;
  }

  actResident(r, o) {
    const ev = r.event, j = r.job;
    let k = null;
    if (ev) {
      o.dot = DOT.play;
      switch (ev.kind) {
        case 'party': k = 'act_party'; break;
        case 'concert':
          if (ev.bard === r) k = ev.phase === 'go' ? 'act_bard_go' : ev.phase === 'play' ? 'act_bard_play' : 'act_bard_bow';
          else if (r.seat) k = 'act_concert_seat';
          else if (r.state === 'move') k = 'act_concert_go';
          else if (r.animName === 'dance') k = 'act_concert_dance';
          else k = 'act_concert';
          break;
        case 'chat': {
          let other = null;
          for (const m of ev.members) if (m !== r && m.alive && m.event === ev) { other = m; break; }
          const nm = other ? this.nameOfKey(other.key) : '';
          if (nm) { k = 'act_chat'; o.params = { name: nm }; } else k = 'act_chat0';
          break;
        }
        case 'snowball':
          if (ev.phase === 'chase' && ev.th === r) k = 'act_snow_run';
          else if (ev.phase === 'chase' && ev.tg === r && ev.th) { k = 'act_snow_chase'; o.params = { name: this.nameOfKey(ev.th.key) || '…' }; }
          else k = 'act_snowball';
          break;
        case 'tag': k = ev.it === r ? 'act_tag_it' : 'act_tag'; break;
        case 'snowman': k = 'act_snowman'; break;
        case 'snowmanBreak': k = 'act_snowman_break'; break;
        default: k = 'act_break'; o.dot = DOT.rest;
      }
      o.key = k;
      return;
    }
    const area = r.area ? (AREA[r.area.id] || AREA_ANY)[lang()] : AREA_ANY[lang()];
    if (j && j.kind === 'arrive') {
      o.dot = DOT.away;
      o.key = j.phase === 'hello' ? 'act_hello' : j.house && r.state === 'move' ? 'act_arrive_house' : 'act_arrive';
      return;
    }
    if (j && j.kind === 'stay') {
      if (r.seat && r.extraFx) k = 'act_doze';
      else if (r.seat) k = 'act_sit';
      else if (j.phase === 'toSeat') k = 'act_to_seat';
      else if (j.warm && r.state === 'move') k = 'act_warm_go';
      else if (j.read) k = 'act_read';
      if (k) { o.key = k; o.dot = DOT.rest; if (k === 'act_doze' || k === 'act_sit') o.params = { area }; return; }
    }
    const an = r.animName;
    if (an === 'skate') { o.key = 'act_skate'; o.dot = DOT.play; return; }
    if (an === 'shiver') { o.key = 'act_shiver'; o.dot = DOT.rest; return; }
    if (an === 'wave') { o.key = 'act_wave'; o.dot = DOT.play; return; }
    if (j && j.kind === 'stay') {
      const a = r.area;
      if (a && a.fire && r.state !== 'move' && gdist(r.x, r.y, a.fire.x, a.fire.y) <= 140) { o.key = 'act_warm'; o.dot = DOT.rest; return; }
      o.params = { area };
      if (j.phase === 'travel') { o.key = 'act_go'; o.dot = DOT.away; return; }
      if (r.state === 'move') { o.key = 'act_stroll'; o.dot = DOT.rest; return; }
      o.key = 'act_relax'; o.dot = DOT.rest; return;
    }
    o.key = 'act_break'; o.dot = DOT.rest;
  }

  actOperator(spot, b, o) {
    const st = spot && spot.station;
    o.dot = DOT.work;
    if (b.state === 'go') { o.key = 'act_op_go'; return; }
    if (st && st.working) { const k = 'act_op_' + spotId(spot); o.key = rt(k) !== k ? k : 'act_op_work'; return; }
    if (st && st.inStack && st.outStack && st.inStack.full && st.outStack.full) { o.key = 'act_op_full'; o.dot = DOT.rest; return; }
    o.key = 'act_op_wait'; o.dot = DOT.rest;
  }

  actClerk(R, c, o) {
    o.dot = DOT.work;
    if (c.state === 'go') { o.key = 'act_clerk_go'; return; }
    const tg = R && R.seller && R.seller.payTarget && R.seller.payTarget();
    o.key = tg ? 'act_clerk_serve' : 'act_clerk_wait';
  }

  /** a named villager with no body: still loading, or at home (the cap on walking residents) */
  actHome(p, o) {
    const life = this.gs.life, h = this.hour();
    const pt = this.homePoint(p);
    o.x = pt.x; o.y = pt.y; o.dot = DOT.rest;
    let soon = false;
    for (const q of (life && life.queue) || EMPTY) if (q.key === p.key) { soon = true; break; }
    if (soon) { o.key = 'act_soon'; o.dot = DOT.away; o.where = rt('f_home'); return; }
    if (h >= 22 || h < 6) { o.key = 'act_sleep'; o.where = rt('f_sleep'); return; }
    o.key = 'act_home'; o.where = rt('f_home');
  }

  /** a settler's day (spec §4.3): asleep, at work (lunch at noon), looking for work, an evening plan, at home */
  actSettler(p, o) {
    const gs = this.gs, id = p.id, h = this.hour();
    const job = this.jobNow(p), J = JOB[job], hrs = J && J.h;
    const working = job !== 'none' && !!hrs;
    const inWork = working && h >= hrs[0] && h < hrs[1];
    const home = () => { const pt = this.homePoint(p); o.x = pt.x; o.y = pt.y; };
    const at = (pt, where) => { if (pt) { o.x = pt.x; o.y = pt.y; } else home(); o.where = where; };
    if (h >= 22 || h < 6) { o.key = 'act_sleep'; o.dot = DOT.rest; home(); o.where = rt('f_sleep'); return; }
    if (inWork && h >= 12 && h < 13) {
      const R = gs.civic && gs.civic.restaurant;
      o.dot = DOT.rest;
      if (R) { o.key = 'act_lunch_rest'; at(R, rt('f_away', { place: rt('wp_restaurant') })); return; }
      o.key = 'act_lunch_box'; at(this.workplace(J.at), rt('f_inside', { place: rt('wp_' + J.at) })); return;
    }
    if (inWork) { o.key = 'act_w_' + job; o.dot = DOT.work; at(this.workplace(J.at), rt('f_inside', { place: rt('wp_' + J.at) })); return; }
    if (!working && h >= 9 && h < 17) {
      o.key = 'act_seek'; o.dot = DOT.away;
      const hall = gs.civic && gs.civic.hall;
      at(hall || (gs.life && gs.life.areas.plaza_s), rt('f_away', { place: hall ? rt('wp_hall') : AREA.plaza_s[lang()] }));
      return;
    }
    const end = working ? hrs[1] : 17;
    if (h >= end) {
      let plan = fnv(gs.cid + '|eve|' + id.i + '|' + this.day()) % 4;
      const R = gs.civic && gs.civic.restaurant;
      if (plan === 1 && !R) plan = 3;
      o.dot = DOT.rest;
      if (plan === 0 && gs.market) { o.key = 'act_eve_market'; at(gs.market, rt('f_away', { place: rt('wp_market') })); return; }
      if (plan === 1) { o.key = 'act_eve_dinner'; at(R, rt('f_away', { place: rt('wp_restaurant') })); return; }
      if (plan === 2) {
        const a = this.fireNear(this.homePoint(p));
        if (a) { o.key = 'act_eve_fire'; at({ x: a.fire.x, y: a.fire.y + 30 }, rt('f_away', { place: (AREA[a.id] || AREA_ANY)[lang()] })); return; }
      }
      o.key = 'act_home'; home(); o.where = rt('f_home'); return;
    }
    o.dot = DOT.rest; home(); o.where = rt('f_home');
    o.key = h >= 6 && h < 8 ? 'act_breakfast' : 'act_home';
  }

  /** the nearest open campfire area to (x, y) */
  fireNear(pt) {
    const life = this.gs.life;
    if (!life) return null;
    const x = pt.x, y = pt.y;
    let best = null, bd = Infinity;
    for (const id in life.areas) { const a = life.areas[id]; if (!a.fire || !life.areaOpen(a)) continue; const d = gdist(x, y, a.x, a.y); if (d < bd) { bd = d; best = a; } }
    return best;
  }

  /** the workplace point of a job (JOB.at) */
  workplace(at) {
    const gs = this.gs, S = gs.stations || {}, P = gs.piles || {};
    switch (at) {
      case 'deck': return gs.deck || (gs.net && gs.net.gather) || null;
      case 'build': {
        let best = null;
        for (const id in gs.sites || {}) { const s = gs.sites[id]; if (s.state && s.state !== 'plot' && s.state !== 'done') { best = s; break; } }
        return best || (gs.life && gs.life.areas.plaza_s) || null;
      }
      case 'sawmill': return S.sawmill || P.log || null;
      case 'field': return P.wheat || S.bakery || null;
      case 'mine': return P.ore || S.smelter || null;
      case 'hunt': return P.meat || S.smokehouse || null;
      case 'market': return gs.market || null;
      case 'restaurant': return (gs.civic && gs.civic.restaurant) || null;
      case 'hall': return (gs.civic && gs.civic.hall) || null;
      case 'warehouse': return gs.warehouse || null;
      case 'station': return (gs.v4 && gs.v4.ours) || null;
      case 'bank': return (gs.v42 && gs.v42.office && gs.v42.office.bank) || null;
      case 'depot': return (gs.v42 && gs.v42.depot && gs.v42.depot.building) || null;
      case 'bakery': return S.bakery || null;
      default: return null;
    }
  }

  // ================================================================ 행복도 (spec §5)
  /** o: { score, face (1..4), reasons: [keys] } — from real state, no randomness */
  happiness(p, o) {
    const gs = this.gs, T = this._terms;
    T.length = 0;
    const h = p.home;
    if (h && h.kind === 'house') T.push(['h_house', 10]);
    else if (h && h.kind === 'tent') T.push(['h_tent', -8]);
    else if (h && h.kind === 'hall') T.push(['h_hall', 2]);
    else T.push(['h_home', 6]);
    const mk = gs.market && gs.market.stock, R = gs.civic && gs.civic.restaurant;
    const food = (mk && mk.count > 0) || (R && R.pantry && R.pantry.count > 0);
    T.push(food ? ['h_food', 8] : ['h_hungry', -10]);
    const hb = gs.civic ? Math.min(12, gs.civic.happyBonus()) : 0;
    if (hb > 0) T.push(['h_pretty', hb]);
    const lb = this.likeBuilt(p);
    if (lb) T.push([lb, 4]);
    if (p.kind === 'v') {
      const aff = this.affinity(p).a, v = Math.round(aff / 10);
      if (v) T.push([aff >= 60 ? 'h_chief_close' : aff >= 35 ? 'h_chief_friend' : 'h_chief_new', v]);
    } else if (gs.civic && gs.civic.hall) T.push(['h_chief_hall', 3]);
    const G = gs.v4 && gs.v4.growth;
    if (G && G.happiness) {
      let g = 80;
      try { g = Number(G.happiness()) || 80; } catch (e) { g = 80; }
      const v = Math.max(-5, Math.min(5, Math.round((g - 80) / 4)));
      if (v) T.push([v > 0 ? 'h_town_up' : 'h_town_down', v]);
    }
    const m = this.moodOf(p);
    if (m) T.push([m > 0 ? 'h_mood_up' : 'h_mood_down', m]);
    let s = 55;
    for (const q of T) s += q[1];
    o.score = Math.max(5, Math.min(99, Math.round(s)));
    o.face = o.score >= 80 ? 4 : o.score >= 60 ? 3 : o.score >= 40 ? 2 : 1;
    const rs = o.reasons || (o.reasons = []);
    rs.length = 0;
    const sorted = T.slice().sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    for (let i = 0; i < sorted.length && rs.length < 3; i++) rs.push(sorted[i][0]);
    return o;
  }

  /** the like of theirs the village has built (decor / props), as a reason key text */
  likeBuilt(p) {
    const gs = this.gs, life = gs.life;
    const words = p.kind === 's' ? p.id.likes.map((x) => likeLabel(x, 'ko') + ' ' + x).join(' ') : p.d ? p.d.ko.likes.concat(p.d.ko.traits).join(' ') : '';
    if (!words) return null;
    const amen = (gs.civic && gs.civic.amenities) || EMPTY;
    for (const L of LIKE_BUILT) {
      if (!L.words.some((w) => words.indexOf(w) >= 0)) continue;
      let built = false;
      for (const a of amen) if (L.amen.indexOf(a.key) >= 0) { built = true; break; }
      if (!built && L.prop && life && life.props[L.prop] && life.props[L.prop].shown) built = true;
      if (built) return 'like:' + LIKE_BUILT.indexOf(L);
    }
    return null;
  }

  /** a reason key in words */
  reasonText(k) {
    if (k && k.indexOf('like:') === 0) { const L = LIKE_BUILT[+k.slice(5)]; return L ? L[lang()] : ''; }
    return rt(k);
  }

  moodOf(p) {
    if (p.kind === 's') {
      const tr = p.id.traits;
      if (tr.indexOf('grumpy') >= 0 || tr.indexOf('shy') >= 0) return -3;
      if (tr.indexOf('kind') >= 0 || tr.indexOf('funny') >= 0) return 3;
      return 0;
    }
    const def = Assets.charDef(p.key) || {};
    const tr = Array.isArray(def.traits) ? def.traits : EMPTY;
    if (tr.indexOf('grumpy') >= 0 || tr.indexOf('shy') >= 0) return -3;
    if (tr.indexOf('cheerful') >= 0 || tr.indexOf('jolly') >= 0 || tr.indexOf('kind') >= 0) return 3;
    return 0;
  }

  // ================================================================ the chief (the chat record, read once per open)
  readChat() {
    const gs = this.gs;
    let rec = null;
    try { rec = ChatSave.load(gs.cid); } catch (e) { rec = null; }
    this.chatRec = rec && rec.m && typeof rec.m === 'object' ? rec.m : null;
    this.chatCid = gs.cid;
  }

  /** { a: affinity 0–100, t: talks, rec: has a record } */
  affinity(p) {
    const o = this._aff || (this._aff = { a: 0, t: 0, rec: false });
    const m = this.chatRec && this.chatRec[p.key];
    if (m && Number.isFinite(m.a)) { o.a = Math.max(0, Math.min(100, m.a)); o.t = Math.max(0, Math.floor(Number(m.t) || 0)); o.rec = true; }
    else { o.a = p.group === 'elder' ? 18 : 12; o.t = 0; o.rec = false; }
    return o;
  }

  chiefText(p) {
    if (p.kind === 's') return rt('r_chief_settler');
    const a = this.affinity(p);
    let st = 'stranger';
    for (const [min, id] of STAGES) if (a.a >= min) { st = id; break; }
    const stage = rt('r_stage_' + st);
    return a.rec && a.t > 0 ? rt('r_chief_rec', { stage, n: a.t }) : rt('r_chief_none', { stage });
  }

  movedText(p) {
    if (p.kind === 's') return rt('r_moved_settler', { i: p.i });
    if (p.step === 'start') return rt('r_moved_start');
    const k = 'mv_' + p.step, s = rt(k);
    return rt('r_moved_step', { step: s !== k ? s : p.step });
  }

  scheduleText(p) {
    if (p.kind === 's') {
      const job = this.jobNow(p), J = JOB[job];
      if (job !== 'none' && J && J.h) return rt('r_sched_work', { a: J.h[0], b: J.h[1], place: rt('wp_' + J.at) });
      return rt('r_sched_seek');
    }
    if (p.bodyKind === 'op' && p.bodyHost) return rt('r_sched_op', { place: (STATION[spotId(p.bodyHost)] || STATION.grill)[lang()] });
    if (p.age < 19) return rt('r_sched_kid');
    if (p.jobId === 'retired') return rt('r_sched_rest');
    return rt('r_sched_free');
  }

  // ================================================================ family
  /** [{ p, rel }] — family first (FAMILY / the settler couple) */
  family(p) {
    const out = [], L = lang();
    if (p.kind === 's') {
      const j = partnerOf(p.i, this.gs.civic ? this.gs.civic.settlers : 0);
      const q = j ? this.byPid['s:' + j] : null;
      if (q) out.push({ p: q, rel: rt('r_spouse') });
      return out;
    }
    for (const [a, b, ab, ba] of FAMILY) {
      if (a === p.key && this.byPid['v:' + b]) out.push({ p: this.byPid['v:' + b], rel: ab[L] });
      else if (b === p.key && this.byPid['v:' + a]) out.push({ p: this.byPid['v:' + a], rel: ba[L] });
    }
    return out;
  }
  friends(p) {
    const out = [], L = lang();
    if (p.kind !== 'v') return out;
    for (const [a, b, ab, ba] of FRIENDS) {
      if (out.length >= 3) break;
      if (a === p.key && this.byPid['v:' + b]) out.push({ p: this.byPid['v:' + b], rel: ab[L] });
      else if (b === p.key && this.byPid['v:' + a]) out.push({ p: this.byPid['v:' + a], rel: ba[L] });
    }
    return out;
  }
}

/** top two VALUES ids by keyword hits; ties broken by the value order rotated by the person id (stable) */
export function scoreValues(pid, words) {
  const text = words.join(' ');
  const rot = fnv(pid) % VALUES.length;
  const sc = VALUES.map((v, i) => ({ v: v.id, n: v.kw.reduce((a, k) => a + (text.indexOf(k) >= 0 ? 1 : 0), 0), o: (i - rot + VALUES.length) % VALUES.length }));
  sc.sort((a, b) => b.n - a.n || a.o - b.o);
  return [sc[0].v, sc[1].v];
}

export { VALUE_BY_ID };
