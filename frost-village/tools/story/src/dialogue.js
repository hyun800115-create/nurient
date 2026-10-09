// Dialogue realizer: turns conversation beats (who says what kind of thing about which fact / memory
// version) into lines of Korean or English text using the data-driven grammars in lang/ko and lang/en.
// It decides the speech level (반말 / 해요체 / 존댓말 with -시-), how one resident names another
// (지훈이, 민지 씨, 박 할머니, 빵집 아줌마, 형, 엄마, 촌장님 …), fills the slots (people, places, items,
// counted numbers, money, time-ago, weather, causes …) and avoids repeating itself (per speaker:
// recently used templates; per pair: recently said lines).

import { Grammar, tidy, slotBit, ALWAYS_SLOTS } from '../lang/grammar.js';
import { COND, TAG } from '../lang/conds.js';
import { josa, particle, casualName, counted, commas, romanize, hasBatchim } from '../lang/josa.js';
import { Rng, mix32, hashStr } from './rng.js';
import { getRel, ST_ACQ, ST_FRIEND, ST_BEST, ST_SWEET, ST_ENGAGED, ST_SPOUSE, RF_FAMILY, RF_RIVAL, RF_SIBLING, RF_COWORK, RF_NEIGHBOR, RF_CLASS } from './relations.js';
import { G_TODDLER, G_KID, G_TEEN, G_ADULT, G_ELDER, F_NEWCOMER, F_OWNER, groupOf, ageOf } from './people.js';
import { SRC_SEEN, SRC_DID, SRC_TOLD, SRC_NEWS, D_PLACE, D_ITEM, D_ANON, D_COUNT } from './memory.js';
import { ITEMS } from '../data/items.js';
import { JOBS, PLACE_KINDS } from '../data/places.js';
import { LIKES, TRAIT_FLAGS, AX } from '../data/traits.js';
import { FIRE_CAUSES, PETS } from '../data/facts.js';
import KO from '../lang/ko/index.js';
import EN from '../lang/en/index.js';

export const CHIEF = -2;

const TAG_Q = 1 << TAG.q;
// a beat whose rule is one of these answers the line before it (no extra answer is needed)
const REPLY_RE = /(\.re$|\.re\.|^react\.|^ans\.|^answer\.|^thanks\.|^agree|^disagree|^invite\.(yes|no)|^flirt\.(re|oblivious)|^confess\.(yes|no)|^propose\.yes|^sorry\.re|^argue\.back|^joke\.(laugh|groan)|^qa)/;

const C = COND;
const S = (ch) => slotBit(ch);
const TRAITS = TRAIT_FLAGS.map(([flag, ax, op, v]) => [C[flag], AX[ax], op === '>', v]);

const WEATHER_KO = { clear: '맑은 하늘', sunny: '햇살', cloudy: '구름', light: '눈발', snow: '눈', heavy: '함박눈', blizzard: '눈보라', fog: '안개', mild: '포근한 날씨' };
const WEATHER_EN = { clear: 'clear skies', sunny: 'sunshine', cloudy: 'clouds', light: 'flurries', snow: 'snow', heavy: 'heavy snow', blizzard: 'the blizzard', fog: 'fog', mild: 'mild weather' };
const PET_ANTICS = [
  ['장갑 한 짝을 물고 도망갔', 'ran off with a mitten'], ['펭귄이랑 눈밭에서 뒹굴었', 'rolled in the snow with a penguin'],
  ['눈사람 당근 코를 먹어 버렸', 'ate the snowman’s carrot nose'], ['썰매를 끌고 광장을 한 바퀴 돌았', 'pulled a sled round the plaza'],
  ['할아버지 모자 위에서 낮잠을 잤', 'napped on Grandpa’s hat'], ['꼬리로 눈을 싹싹 쓸고 다녔', 'swept the snow with its tail'],
];
const HELP = [['무거운 짐을 들어 줬', 'carried the heavy bags'], ['집 앞 눈을 싹 치워 줬', 'shovelled the snow off the doorstep'], ['길을 친절하게 알려 줬', 'kindly showed the way'], ['미끄러졌을 때 일으켜 줬', 'helped them up after a slip'], ['잃어버린 장갑을 찾아 줬', 'found a lost mitten']];
const PRANKS = [['등에 눈덩이를 쏙 넣었', 'slipped a snowball down the back of'], ['모자에 눈을 가득 채웠', 'filled with snow the hat of'], ['목도리에 눈을 한 움큼 넣었', 'stuffed snow into the scarf of'], ['썰매를 몰래 타고 갔', 'secretly rode off on the sled of'], ['머리 위로 눈을 와르르 쏟았', 'dumped a pile of snow on the head of']];
const TRAIN = [['손님을 잔뜩 태우고 왔', 'arrived packed with visitors'], ['눈 때문에 조금 늦게 도착했', 'came in late because of the snow'], ['새 객차를 달고 왔', 'came with a brand-new carriage'], ['기적을 세 번이나 울렸', 'blew its whistle three times']];
const WEATHER_EV = [['첫 함박눈이 펑펑 내렸', 'the first big snowfall came down'], ['눈보라가 몰아쳤', 'a blizzard blew through'], ['밤하늘에 오로라가 떴', 'the aurora lit up the night sky']];
const MOVE_WHY = { job: ['일자리를 찾아서', 'to find work'], lonely: ['친척들 곁으로 가려고', 'to be near relatives'], family: ['가족 곁으로 가려고', 'to be with family'], adventure: ['새로운 모험을 찾아서', 'for a new adventure'], city: ['큰 도시로 가 보고 싶어서', 'to try the big city'], sea: ['바닷가 마을에서 살아 보고 싶어서', 'to live by the sea'] };
const LOAN_FOR = { shop: ['가게 차릴 돈', 'money to open a shop'], house: ['넓은 집으로 옮길 돈', 'money for a bigger house'], rebuild: ['집 다시 지을 돈', 'money to rebuild'], furniture: ['가구 살 돈', 'money for furniture'], personal: ['급한 돈', 'some money'] };
const SNOWMAN = [['커다란', 'big'], ['엄청 큰', 'huge'], ['집채만 한', 'house-sized']];
const CHIEF_DEEDS = {
  built: ['{t}{:을} 새로 지으셨', 'built {t}'], unlock: ['{t}{:을} 여셨', 'opened up {t}'], hire: ['{t}{:을} 새로 뽑으셨', 'hired {t}'],
  delivery: ['{t}까지 직접 배달을 하셨', 'delivered goods to {t} in person'], mission: ['{t} 부탁을 들어주셨', 'helped with {t}'],
  speech: ['{t} 결혼식에서 축사를 하셨', 'gave a speech at {t}’s wedding'], upgrade: ['{t}{:을} 멋지게 고치셨', 'upgraded {t}'],
  fame: ['{t} 칭호를 받으셨', 'earned the title {t}'], drive: ['트럭을 몰고 {t}까지 다녀오셨', 'drove the truck to {t}'], other: ['{t}', '{t}'],
};

// '너' (you) + particle as a pronoun (not 너무, 너머 …) and '네가' / '니가'
const YOU_RE = /(^|[^가-힣])(?:너(는|도|랑|한테|를|만|의|야|네|밖에|가|)|[네니]가())(?![가-힣])/g;
const YOU_P = { 는: '은', 를: '을', 랑: '이랑', 야: '이야', 가: '이' };
export function replaceYou(text, w) {
  return text.replace(YOU_RE, (m0, pre, p1, p2) => {
    const p = p1 !== undefined ? p1 : '가';
    const form = YOU_P[p];
    return pre + w + (form ? particle(w, form) : p);
  });
}

export class Dialogue {
  constructor(e) {
    this.e = e;
    this.grammars = Object.create(null);
    this.trng = new Rng(1);
    this.ctx = {
      f0: 0, f1: 0, f2: 0, f3: 0, f4: 0, p0: 0, p1: 0, p2: 0, p3: 0, t0: 0, t1: 0, t2: 0, t3: 0, slots: 0, level: 0, rng: this.trng, recent: null, rpos: null, track: true,
      get: (s) => this.slot(s),
    };
    this.prev0 = 0; this.prev1 = 0; this.prev2 = 0; this.prev3 = 0;      // tags of the line said just before (replies answer what was said)
    this.cur = { b: null, sp: null, ls: null, rel: null, lang: 'ko', f: null, cache: Object.create(null), ext: null };
    this.fallback = new Map();
    this.mask = [0, 0, 0, 0, 0];
    this.press = false;     // writing the paper: people are named in press style
    this.stats = { lines: 0, rerolls: 0, misses: 0, missRules: Object.create(null) };
  }

  grammar(lang) {
    let g = this.grammars[lang];
    if (!g) g = this.grammars[lang] = new Grammar(lang === 'en' ? EN : KO, lang);
    return g;
  }

  // ---------------------------------------------------------------- talks
  /** fill talk.lines (text in `lang`) */
  realize(talk, lang = this.e.cfg.lang) {
    const e = this.e;
    this.trng.setState([mix32(e.cfg.seedNum, talk.id), mix32(talk.id, 0x51ed), mix32(talk.a + 7, talk.id), mix32(talk.b + 13, 0x9e37)]);
    const lines = [];
    const beats = talk.beats;
    this.prev0 = 0; this.prev1 = 0; this.prev2 = 0; this.prev3 = 0; this.prevText = '';
    let added = 0;
    for (let i = 0; i < beats.length; i++) {
      const b = beats[i];
      this.pushLine(lines, b, lang, talk);
      // a question that the next beat does not answer (the asked person does not speak next, or the
      // talk moves on): the asked person answers it in a short line first (at most two such lines)
      let last = b;
      while ((this.prev0 & TAG_Q) && last.to >= 0 && !talk.shout && e.people[last.to] && added < 2) {
        const nb = beats[i + 1];
        if (nb && nb.w === last.to && REPLY_RE.test(nb.r)) break;
        last = this.answerBeat(last);
        this.pushLine(lines, last, lang, talk);
        added++;
      }
    }
    talk.lines = lines;
    return lines;
  }

  pushLine(lines, b, lang, talk) {
    const e = this.e;
    const sp = e.people[b.w];
    const ls = b.to === CHIEF ? null : b.to >= 0 ? e.people[b.to] : null;
    const text = this.line(b, sp, ls, lang, talk);
    const len = text.length;
    const dur = lang === 'en' ? Math.min(4.4, Math.max(2, 1.2 + len * 0.035)) : Math.min(4.4, Math.max(2, 1.3 + len * 0.075));
    lines.push({ who: b.w, to: b.to, text, emote: b.em, anim: b.an, dur: Math.round(dur * 10) / 10, rule: b.r, topic: b.topic });
  }

  /** the short answer to a question that was left hanging */
  answerBeat(q) {
    return { w: q.to, to: q.w, r: 'qa', f: q.f, x: q.x, d: q.d, alt: q.alt, src: q.src, from: q.from, o: q.o, p: q.p, i: q.i, h: q.h, n: q.n, s: q.s, fl: q.fl, em: null, an: 'talk', topic: q.topic };
  }

  resolveRule(g, name) {
    const key = g.lang + ':' + name;
    let r = this.fallback.get(key);
    if (r !== undefined) return r;
    r = null;
    const parts = name.split('.');
    const tries = [name];
    if (parts.length >= 2 && parts[parts.length - 1] === 're') tries.push(parts[0] + '.re', 'agree');
    else for (let k = parts.length - 1; k >= 1; k--) tries.push(parts.slice(0, k).join('.'));
    tries.push(parts[0] + '.generic');
    for (const t of tries) if (g.has(t)) { r = t; break; }
    this.fallback.set(key, r);
    return r;
  }

  line(b, sp, ls, lang, talk) {
    const e = this.e, g = this.grammar(lang);
    const rule = this.resolveRule(g, b.r);
    this.stats.lines++;
    if (!rule) { this.miss(b.r); return lang === 'en' ? '…' : '…'; }
    const rel = ls ? getRel(e, sp.id, ls.id) : null;
    this.setup(b, sp, ls, rel, lang, talk);
    const ctx = this.ctx;
    ctx.p0 = this.prev0; ctx.p1 = this.prev1; ctx.p2 = this.prev2; ctx.p3 = this.prev3;
    ctx.noQ = !!b.nq;
    let text = '', tries = 0;
    for (; tries < 4; tries++) {
      text = tidy(g.expand(rule, ctx), lang);
      if (!text) break;
      if (!rel) break;
      const h = hashStr(text);
      let dup = this.echoes(text);
      for (let i = 0; !dup && i < rel.ring.length; i++) if (rel.ring[i] === h) { dup = true; break; }
      if (!dup) { rel.ring[rel.rp] = h; rel.rp = (rel.rp + 1) % rel.ring.length; break; }
      this.stats.rerolls++;
    }
    if (!text) {
      const fb = this.resolveRule(g, b.r.split('.')[0] + '.generic');
      if (fb && fb !== rule) text = tidy(g.expand(fb, ctx), lang);
      if (!text) { this.miss(b.r); text = lang === 'en' ? '…' : '…'; }
    }
    this.prev0 = ctx.t0; this.prev1 = ctx.t1; this.prev2 = ctx.t2; this.prev3 = ctx.t3;
    this.prevText = text;
    if (lang === 'ko') {
      const you = ls ? this.youWord(sp, ls, rel) : null;
      if (you) text = replaceYou(text, you);
      if (/[가-힣]$/.test(text)) text += '.';
    }
    return text;
  }

  /** true when a sentence of `text` repeats a sentence of the line just said (no parroting) */
  echoes(text) {
    const p = this.prevText;
    if (!p) return false;
    const parts = text.split(/(?<=[.!?…~])\s+/);
    for (const s of parts) if (s.length >= 5 && p.indexOf(s) >= 0) return true;
    return false;
  }

  /** in 반말 one does not call a parent, grandparent, older sibling / friend or a spouse '너':
   *  the word to use instead (엄마, 할머니, 지훈 형, 자기, 당신 …), or null when '너' is fine */
  youWord(sp, ls, rel) {
    if (this.ctx.level !== 0) return null;
    const e = this.e;
    const gs = groupOf(e, sp);
    if (rel && rel.stage === ST_SPOUSE) return gs === G_ELDER ? '임자' : ageOf(e, sp) < 36 ? '자기' : '당신';
    if (gs === G_ELDER) return null;
    if (rel && (rel.isParentOf(ls.id) || rel.isGrandOf(ls.id))) return this.referKo(sp, ls).text;
    const d = ageOf(e, ls) - ageOf(e, sp);
    if (d >= (gs <= G_TEEN ? 2 : 4) && groupOf(e, ls) !== G_TODDLER) return this.referKo(sp, ls).text;
    return null;
  }

  miss(r) { this.stats.misses++; this.stats.missRules[r] = (this.stats.missRules[r] || 0) + 1; }

  // ---------------------------------------------------------------- context
  setup(b, sp, ls, rel, lang, talk) {
    const e = this.e, ctx = this.ctx, cur = this.cur;
    cur.b = b; cur.sp = sp; cur.ls = ls; cur.rel = rel; cur.lang = lang; cur.f = b.f; cur.talk = talk;
    for (const k in cur.cache) delete cur.cache[k];
    const m = this.mask; m[0] = m[1] = m[2] = m[3] = m[4] = 0;
    const set = (i) => { m[i >> 5] |= 1 << (i & 31); };
    const gs = groupOf(e, sp);
    set([C.toddler, C.kid, C.teen, C.adult, C.elder][gs]);
    if (gs === G_KID && ageOf(e, sp) < 7) set(C.little);
    set(sp.male ? C.male : C.female);
    const lv = ls ? this.levelFor(sp, ls, rel) : b.to === CHIEF ? 2 : 0;
    ctx.level = lv;
    set([C.ban, C.yo, C.hon][lv]);
    if (b.to === CHIEF) { set(C.l_chief); set(C.chief_talk); }
    else if (ls) {
      if (ls.tr[0] < 30) set(C.l_shy);
      if (ls.hh === sp.hh && sp.hh >= 0) set(C.housemate);
      const gl = groupOf(e, ls);
      set(gl <= G_KID ? C.l_kid : gl === G_TEEN ? C.l_teen : gl === G_ADULT ? C.l_adult : C.l_elder);
      set(ls.male ? C.l_male : C.l_female);
      if (ls.flags & F_NEWCOMER) set(C.l_newcomer);
      if (ls.flags & F_OWNER) set(C.l_owner);
      if (/^(police|detective)$/.test(ls.job)) set(C.l_police);
      if (ls.job === 'firefighter') set(C.l_fire);
      if (ls.mood < -20) set(C.l_worried);
      if (ls.kids.length) set(C.lkid);
      if (ls.job === sp.job && ls.job !== 'none' && ls.job !== 'retired') set(C.samejob);
    }
    if (!rel || rel.n === 0) { set(C.stranger); if (ls) set(C.first_talk); }
    else {
      const st = rel.stage;
      if (st <= ST_ACQ) set(C.acq);
      if (st >= ST_FRIEND) set(C.friend);
      if (st >= ST_BEST && st !== ST_ENGAGED) set(C.best);
      if (st === ST_SWEET || st === ST_ENGAGED) set(C.sweet);
      if (st === ST_SPOUSE) set(C.spouse);
      if (st >= ST_FRIEND || (rel.flags & RF_FAMILY)) set(C.close);
    }
    if (rel) {
      if ((rel.flags & RF_FAMILY) || rel.stage === ST_SPOUSE) set(C.family);
      if (rel.flags & RF_RIVAL) set(C.rival);
      if (rel.crushOf(sp.id)) set(C.crush);
      if (rel.isParentOf(sp.id)) set(C.parent);
      if (ls && rel.isParentOf(ls.id)) set(C.child);
      if (rel.isGrandOf(sp.id) || (ls && rel.isGrandOf(ls.id))) set(C.grand);
      if (rel.flags & RF_SIBLING) set(C.sibling);
      if (rel.flags & RF_NEIGHBOR) set(C.neighbor);
      if (rel.flags & RF_CLASS) set(C.classmate);
    }
    if (ls && sp.work >= 0 && sp.work === ls.work) set(C.cowork);
    for (const [ci, ax, gt, v] of TRAITS) if (gt ? sp.tr[ax] > v : sp.tr[ax] < v) set(ci);
    if (sp.hunger > 65 || sp.likes.some((li) => /cooking|baking|bungeoppang|sweetpotato|cocoa/.test(LIKES[li].id))) set(C.foodie);
    if (sp.mood > 40) set(C.happy); else if (sp.mood < -20) set(C.sad);
    if (sp.energy < 30) set(C.tired);
    if (sp.hunger > 65) set(C.hungry);
    if (sp.spouse >= 0) set(C.married);
    if (sp.kids.length) set(C.haskids);
    if (sp.flags & F_NEWCOMER) set(C.newcomer);
    const money = sp.wallet + sp.savings;
    if (money > 1500) set(C.rich); else if (money < 30) set(C.poor);
    if (e.bank.hasLoan(sp)) set(C.loan);
    if (sp.flags & F_OWNER) set(C.owner);
    const jt = e.jobTag(sp);
    if (jt && C[jt] !== undefined) set(C[jt]);
    // time & weather
    const h = e.clock.minute / 60;
    if (h >= 5 && h < 10.5) set(C.morning); else if (h >= 11 && h < 14) set(C.noon); else if (h >= 17 && h < 21) set(C.evening); else if (h >= 21 || h < 5) set(C.night);
    if (e.clock.dow >= 5) set(C.weekend);
    const wx = e.weather.today;
    if (wx.kind === 'light' || wx.kind === 'snow' || wx.kind === 'heavy') set(C.snow);
    if (wx.kind === 'blizzard') set(C.blizzard);
    if (wx.kind === 'sunny' || wx.kind === 'clear') set(C.sunny);
    if (wx.kind === 'cloudy') set(C.cloudy);
    if (wx.kind === 'fog') set(C.fog);
    if (wx.temp <= -12) set(C.cold);
    if (wx.temp >= -2 || wx.kind === 'mild') set(C.mild);
    // place
    const place = talk && talk.placeIdx >= 0 ? e.world.places[talk.placeIdx] : sp.loc >= 0 ? e.world.places[sp.loc] : null;
    if (place) {
      if (place.cat === 'home') set(C.athome);
      if (place.idx === sp.work) set(C.atwork);
      if (place.kind === 'school') set(C.atschool);
      if (place.cat === 'shop') set(C.atshop);
      if (place.kind === 'cafe' || place.kind === 'restaurant' || place.kind === 'stall') set(C.atcafe);
      if (place.cat === 'outdoor') set(C.outdoors);
    }
    // the fact / memory version
    let slots = ALWAYS_SLOTS | S('U');
    const f = b.f;
    if (f) {
      if (b.x >= 1) set(C.ex1);
      if (b.x >= 2) set(C.ex2);
      if (b.x >= 3) set(C.ex3);
      const anon = b.d === D_ANON || f.a < 0 || (f.k === 'wanted' && !this.knowsCulprit(sp, f));
      if (anon) set(C.anon);
      if (b.d) set(C.distort);
      if (b.d === D_PLACE && b.alt < 0) set(C.noplace);
      if (f.a === sp.id) set(C.self);
      if (f.p >= 0 && f.p === sp.home) set(C.myhome);
      if (f.b === sp.id) set(C.self2);
      if (ls && f.a === ls.id) set(C.lself);
      if (ls && f.b === ls.id) set(C.lvictim);
      if (b.src === SRC_SEEN) set(C.seen); else if (b.src === SRC_TOLD) set(C.told); else if (b.src === SRC_NEWS) set(C.news); else if (b.src === SRC_DID) set(C.did);
      if (b.src <= SRC_NEWS) set(C.known);   // the speaker knows the story in some version (not just 'asked about it')
      if (f.k === 'theft' || f.k === 'wanted' || f.k === 'arrest') {
        // what the speaker knows, not what really happened (only the paper knows everything)
        const st = f.k === 'arrest' ? 1 : this.press || !sp || !sp.mem ? f.st : this.knowsCaught(sp, f.k === 'theft' ? f.id : f.ref, f.k === 'wanted');
        if (st === 1) set(C.caught); else if (st === 2) set(C.escaped);
      }
      if (f.k === 'ruin' || ((f.k === 'fire' || f.k === 'fire_out') && (f.st === 2 || f.n === 1 && f.k === 'fire_out'))) set(C.ruin);
      if ((f.k === 'fire' && f.st === 1) || (f.k === 'fire_out' && f.n === 0)) set(C.minor);
      const age = (e.now - f.sec) / e.cfg.dayLength;
      if (age > 2) set(C.old); else if (age < 0.35) set(C.fresh);
      if (this.count(b) > 1) set(C.plural);
      if (f.v > 0) set(C.pos); else if (f.v < 0) set(C.neg);
      if (f.k === 'farewell' || f.k === 'memorial') set(C.grave);
      if (f.k === 'snowman' && f.n >= 2) set(C.big);
      if (f.k === 'apology' && f.ref > 0) {
        const rf = e.facts.get(f.ref), rk = rf ? rf.k : '';
        if (rk === 'theft') set(C.ref_theft); else if (rk === 'queue_jump') set(C.ref_queue); else if (rk === 'window') set(C.ref_window); else if (rk === 'scuffle') set(C.ref_scuffle);
      }
      if (f.a >= 0 && !anon && e.people[f.a]) {
        slots |= S('X');
        const xa = e.people[f.a], gx = groupOf(e, xa);
        set(gx === G_ELDER ? C.x_elder : gx === G_ADULT ? C.x_adult : C.x_kid);
        if (f.b >= 0 && e.people[f.b] && gx <= G_TEEN && groupOf(e, e.people[f.b]) <= G_TEEN) set(C.x_plural_kids);
        if (/^(police|detective)$/.test(xa.job)) set(C.x_police);
        if (xa.flags & F_NEWCOMER) set(C.x_newcomer);
      }
      if (f.b >= 0 && e.people[f.b]) slots |= S('Y');
      if (f.c >= 0 && e.people[f.c]) slots |= S('C');
      if (f.p >= 0 && !(b.d === D_PLACE && b.alt < 0)) slots |= S('P') | S('B');
      if (f.i >= 0 || b.i >= 0) slots |= S('I');
      if (this.count(b) > 0) slots |= S('N');
      if (this.money(b) > 0) slots |= S('M');
      if (this.detail(b, 'ko')) slots |= S('E');
      if (f.k === 'pet') slots |= S('G');
      if ((f.k === 'engaged' || f.k === 'wedding') && f.n > 0) slots |= S('D');
      if (b.src === SRC_TOLD && b.from >= 0 && e.people[b.from] && b.from !== (ls ? ls.id : -9)) slots |= S('Z');
    } else {
      if (b.i >= 0) slots |= S('I');
      if (b.n > 0) slots |= S('N') | S('M');
    }
    for (const fl of b.fl) set(fl);
    if (b.o >= 0 && e.people[b.o]) slots |= S('O') | S('J');
    else if (f && f.a >= 0 && e.people[f.a] && JOBS[e.people[f.a].job] && e.people[f.a].job !== 'none') slots |= S('J');
    if (b.p >= 0) slots |= S('P') | S('B');
    if (b.h >= 0) slots |= S('H') | S('A');
    if (b.s && this.detailOfString(b, 'ko')) slots |= S('E');
    if (b.r === 'small.bank' || b.r === 'ans.rate' || b.r === 'small.bank.re') slots |= S('R');
    if (b.r.startsWith('small.pet')) slots |= S('G');
    if (b.r.startsWith('answer.when') || b.r.startsWith('ans.when')) slots |= S('D');
    if (b.r.startsWith('answer.since')) slots |= S('D');
    if (b.r.startsWith('small.prices') || b.r.startsWith('ans.price')) slots |= S('M');
    ctx.f0 = m[0]; ctx.f1 = m[1]; ctx.f2 = m[2]; ctx.f3 = m[3]; ctx.f4 = m[4];
    ctx.slots = slots;
    ctx.recent = sp.recent; ctx.rpos = sp.rpos;
  }

  knowsCulprit(sp, f) {
    const e = this.e;
    if (f.a === sp.id) return true;
    const ref = f.ref ? e.facts.get(f.ref) : null;
    if (!ref) return false;
    for (const m of sp.mem) if (m.f === ref && m.d !== D_ANON) return true;
    return false;
  }

  /** speech level speaker -> listener: 0 반말, 1 해요체, 2 해요체 + honorifics */
  levelFor(sp, ls, rel) {
    const e = this.e;
    const gs = groupOf(e, sp), gl = groupOf(e, ls);
    const as = ageOf(e, sp), al = ageOf(e, ls);
    const close = rel && (rel.stage >= ST_FRIEND || (rel.flags & RF_FAMILY));
    if (rel && (rel.flags & RF_FAMILY)) {
      // family: kids talk casually to parents and grandparents (cute), adults politely to their elderly parents
      if (gs === G_ADULT && gl === G_ELDER && rel.isParentOf(ls.id)) return 1;
      return 0;
    }
    if (rel && rel.stage >= ST_SWEET) return 0;
    if (gl === G_ELDER && gs !== G_ELDER) return 2;
    if (gs === G_ELDER) return gl === G_ELDER ? (close ? 0 : 1) : gl === G_ADULT && !close ? 1 : 0;
    if (gs <= G_TEEN) {
      if (gl <= G_TEEN) return al - as >= 3 && !close ? 1 : 0;
      return 1;       // kids and teens to adults: polite (해요체)
    }
    // adults
    if (gl <= G_TEEN) return 0;
    if (close) return al - as >= 8 ? 1 : 0;
    return 1;
  }

  // ---------------------------------------------------------------- names
  nameEn(r) { if (!r.en) r.en = r.titleEn && !r.given ? r.titleEn : romanize(r.given); return r.en; }
  surEn(r) { return r.sur ? romanize(r.sur, true) : this.nameEn(r); }

  /** how speaker sp refers to t in the third person (lang) */
  refer(sp, t, lang) {
    if (!t) return lang === 'en' ? 'someone' : '누군가';
    if (t === CHIEF) return lang === 'en' ? 'the chief' : '촌장님';
    if (this.press) return this.pressName(t, lang);
    if (lang === 'en') return this.referEn(sp, t);
    return this.referKo(sp, t).text;
  }

  /** 1 if sp knows the thief of theft fact `tid` was caught, 2 if sp knows they got away (a wanted poster), else 0 */
  knowsCaught(sp, tid, wanted) {
    for (const m of sp.mem) if ((m.f.k === 'arrest' || m.f.k === 'apology') && m.f.ref === tid) return 1;
    if (wanted) return 2;
    for (const m of sp.mem) if (m.f.k === 'wanted' && m.f.ref === tid) return 2;
    return 0;
  }

  /** how the paper names people: full name with a neutral title (박민수 씨, 김도윤 어린이, 최순자 어르신 …) */
  pressName(t, lang) {
    const e = this.e, g = groupOf(e, t);
    if (lang === 'en') {
      const full = (t.sur ? this.surEn(t) + ' ' : '') + this.nameEn(t);
      if (t.titleEn && !t.given) return t.titleEn;
      if (/^(police|detective)$/.test(t.job)) return 'Officer ' + full;
      if (t.job === 'firefighter') return 'Firefighter ' + full;
      if (g === G_TODDLER) return 'baby ' + this.nameEn(t);
      return g <= G_KID ? 'little ' + full : full;
    }
    if (t.title && !t.given) return t.title;
    const full = (t.sur || '') + t.given;
    if (/^(police|detective)$/.test(t.job)) return full + ' ' + JOBS[t.job].title;
    if (t.job === 'firefighter') return full + ' 소방관';
    if (g === G_TODDLER) return '아기 ' + t.given;
    return full + (g <= G_KID ? ' 어린이' : g === G_TEEN ? ' 학생' : g === G_ELDER ? ' 어르신' : ' 씨');
  }

  referKo(sp, t) {
    const e = this.e;
    if (sp === t) return { text: this.ctx.level === 1 || this.ctx.level === 2 ? '저' : '나', casual: false };
    if (t.title && !t.given) return { text: t.title, casual: false, title: true };
    const rel = sp ? getRel(e, sp.id, t.id) : null;
    const gs = sp ? groupOf(e, sp) : G_ADULT, gt = groupOf(e, t);
    const as = sp ? ageOf(e, sp) : 30, at = ageOf(e, t);
    if (rel && (rel.flags & RF_FAMILY)) {
      if (rel.isParentOf(t.id)) return { text: t.male ? '아빠' : '엄마', kin: true };
      if (rel.isGrandOf(t.id)) return { text: t.male ? '할아버지' : '할머니', kin: true };
      if (rel.flags & RF_SIBLING) {
        if (at > as) return { text: sp.male ? (t.male ? '형' : '누나') : (t.male ? '오빠' : '언니'), kin: true };
        return { text: casualName(t.given), casual: true };
      }
    }
    if (rel && rel.stage === ST_SPOUSE) {
      if (gs === G_ELDER) return { text: t.male ? '우리 영감' : '우리 할멈', kin: true };
      return { text: t.male ? '우리 남편' : '우리 아내', kin: true };
    }
    if (gt === G_TODDLER) return { text: casualName(t.given), casual: true };
    const close = rel && (rel.stage >= ST_FRIEND);
    const h = (mix32(sp ? sp.id : 0, t.id) & 7);
    if (gt === G_ELDER) {
      if (gs === G_ELDER && close) return { text: casualName(t.given), casual: true };
      // elders of about the same age are '○○ 씨' to each other, not '할아버지'
      if (gs === G_ELDER && Math.abs(at - as) < 10) return { text: t.given + ' 씨', title: true };
      return { text: (t.sur ? t.sur + ' ' : '') + (t.male ? '할아버지' : '할머니'), title: true };
    }
    if (gt === G_ADULT) {
      if (gs <= G_TEEN) {
        // a young grown-up is 형/누나/오빠/언니 to children, not 아저씨/아줌마
        if (at < 30) return { text: t.given + ' ' + (sp.male ? (t.male ? '형' : '누나') : (t.male ? '오빠' : '언니')), title: true };
        const J = JOBS[t.job];
        if (J && J.kid && h < 5) return { text: J.kid + (t.male ? ' 아저씨' : ' 아줌마'), title: true };
        return { text: t.given + (t.male ? ' 삼촌' : ' 이모'), title: true };
      }
      // elders call the young adults they know well by name (and speak 반말); others '씨' with 해요체
      if (gs === G_ELDER) return close ? { text: casualName(t.given), casual: true } : { text: t.given + ' 씨', title: true };
      if (close || (rel && rel.stage === ST_SWEET)) {
        if (at - as >= 4) return { text: t.given + ' ' + (sp.male ? (t.male ? '형' : '누나') : (t.male ? '오빠' : '언니')), title: true };
        return { text: casualName(t.given), casual: true };
      }
      const J = JOBS[t.job];
      if (t.flags & F_OWNER && t.work >= 0 && h < 4) { const p = e.world.places[t.work]; return { text: p.K.ko + ' 사장님', title: true, nim: true }; }
      if (J && J.title && h < 6) return { text: (t.sur || t.given) + ' ' + J.title, title: true, addNim: J.title !== '선생님' };
      return { text: t.given + ' 씨', title: true };
    }
    // kids and teens
    if (gs <= G_TEEN) {
      if (at - as >= 2) return { text: t.given + ' ' + (sp.male ? (t.male ? '형' : '누나') : (t.male ? '오빠' : '언니')), title: true };
      return { text: casualName(t.given), casual: true };
    }
    return { text: casualName(t.given), casual: true };
  }

  vocative(sp, ls, lang) {
    const e = this.e;
    if (!ls) return lang === 'en' ? 'Chief' : '촌장님';
    const rel = getRel(e, sp.id, ls.id);
    if (lang === 'en') {
      if (rel && rel.isParentOf(ls.id)) return ls.male ? 'Dad' : 'Mom';
      if (rel && rel.isGrandOf(ls.id)) return ls.male ? 'Grandpa' : 'Grandma';
      if (rel && rel.stage === ST_SPOUSE) return groupOf(e, sp) === G_ELDER ? 'dear' : 'honey';
      return this.referEn(sp, ls);
    }
    if (rel && rel.stage === ST_SPOUSE) {
      if (groupOf(e, sp) === G_ELDER) return sp.male ? '임자' : '영감';
      return ageOf(e, sp) < 36 ? '자기야' : '여보';
    }
    if (rel && rel.isGrandOf(sp.id) && groupOf(e, ls) <= G_KID && (mix32(sp.id, ls.id) & 1)) return '우리 강아지';
    const r = this.referKo(sp, ls);
    if (r.casual) return josa(ls.given, '아');
    if (r.addNim) return r.text + '님';
    return r.text;
  }

  referEn(sp, t) {
    const e = this.e;
    if (sp === t) return 'me';
    if (t.titleEn && !t.given) return t.titleEn;
    const rel = sp ? getRel(e, sp.id, t.id) : null;
    const gs = sp ? groupOf(e, sp) : G_ADULT, gt = groupOf(e, t);
    if (rel && (rel.flags & RF_FAMILY)) {
      if (rel.isParentOf(t.id)) return t.male ? 'Dad' : 'Mom';
      if (rel.isGrandOf(t.id)) return t.male ? 'Grandpa' : 'Grandma';
    }
    if (rel && rel.stage === ST_SPOUSE) return t.male ? 'my husband' : 'my wife';
    if (gt === G_TODDLER) return 'baby ' + this.nameEn(t);
    if (gt === G_ELDER && !(gs === G_ELDER && rel && rel.stage >= ST_FRIEND)) return (t.male ? 'Grandpa ' : 'Grandma ') + this.surEn(t);
    if (gt === G_ADULT && (!rel || rel.stage < ST_FRIEND)) {
      if (/^(police|detective)$/.test(t.job)) return 'Officer ' + this.surEn(t);
      if (t.job === 'doctor') return 'Dr. ' + this.surEn(t);
      if (t.job === 'teacher' && gs <= G_TEEN) return (t.male ? 'Mr. ' : 'Ms. ') + this.surEn(t);
      if (gs <= G_TEEN) return (t.male ? 'Mr. ' : 'Ms. ') + this.nameEn(t);
    }
    return this.nameEn(t);
  }

  // ---------------------------------------------------------------- slot values
  count(b) {
    const f = b.f;
    let n = f ? f.n : b.n;
    if (!f) return n;
    if (!(f.k === 'theft' || f.k === 'burnt_food' || f.k === 'delivery' || f.k === 'move_in' || f.k === 'move_out' || f.k === 'train' || f.k === 'snowman')) return 0;
    if (f.k === 'train') n = f.i;
    if (f.k === 'snowman') return 0;
    if (b.d === D_COUNT) n *= Math.max(2, b.alt);
    if (b.x > 0 && (f.k === 'theft' || f.k === 'burnt_food' || f.k === 'delivery')) n = n * (1 + b.x) + (b.x >= 3 ? 7 : 0);
    return n;
  }
  money(b) {
    const f = b.f;
    if (!f) return b.n;
    if (f.k === 'loan' || f.k === 'deposit' || f.k === 'loan_paid' || f.k === 'big_buy' || f.k === 'wanted' || f.k === 'tip') {
      let n = f.n;
      if (b.d === D_COUNT) n *= Math.max(2, b.alt);
      if (b.x > 0) n = Math.round(n * (1 + b.x * 0.8));
      return n;
    }
    return 0;
  }

  detail(b, lang) {
    const e = this.e, f = b.f, L = lang === 'en' ? 1 : 0;
    if (!f) return b.s ? this.detailOfString(b, lang) : '';
    switch (f.k) {
      case 'fire': case 'ruin': { const c = FIRE_CAUSES[f.n]; return c ? c[L + 1] : ''; }
      case 'chief': return this.chiefDeed(f, lang);
      case 'move_plan': case 'move_out': { const w = MOVE_WHY[f.s]; return w ? w[L] : ''; }
      case 'shop_plan': case 'shop_open': { const K = PLACE_KINDS[f.s]; return K ? (L ? K.en : K.ko) : ''; }
      case 'loan': case 'loan_paid': { const w = LOAN_FOR[f.s]; return w ? w[L] : ''; }
      case 'new_job': case 'first_job': { const J = JOBS[f.s]; return J ? (L ? J.en : J.ko) : ''; }
      case 'pet': return PET_ANTICS[f.i % PET_ANTICS.length][L];
      case 'help': return HELP[f.i % HELP.length][L];
      case 'prank': return PRANKS[f.n % PRANKS.length][L];
      case 'train': return TRAIN[f.n % TRAIN.length][L];
      case 'weather': return WEATHER_EV[f.n % WEATHER_EV.length][L];
      case 'snowman': return SNOWMAN[Math.max(0, Math.min(2, f.n - 1))][L];
      case 'bigcatch': { const cm = f.n * (1 + b.x * 0.5) * (b.d === D_COUNT ? b.alt : 1); const m = Math.floor(cm / 100), c = Math.round(cm % 100); return L ? (cm >= 100 ? (cm / 100).toFixed(1) + ' m' : Math.round(cm) + ' cm') : m ? (m + '미터' + (c ? ' ' + c + '센티' : '')) : Math.round(cm) + '센티'; }
      case 'grow': return L ? 'started school' : '학교에 입학했';
      case 'deposit': return '';
    }
    return '';
  }

  detailOfString(b, lang) {
    const L = lang === 'en' ? 1 : 0;
    if (PLACE_KINDS[b.s]) return L ? PLACE_KINDS[b.s].en : PLACE_KINDS[b.s].ko;
    if (MOVE_WHY[b.s]) return MOVE_WHY[b.s][L];
    if (b.s === 'apology') return L ? 'they apologised and made it right' : '사과했';
    if (b.s === 'out') return L ? 'it was put out quickly' : '금방 꺼졌';
    if (b.s === 'demolish') return L ? 'the ruins have been cleared away' : '철거했';
    if (b.s === 'rebuilt') return L ? 'it has been rebuilt, nicer than before' : '새로 지었';
    if (b.s === 'memorial') return L ? 'there was a lovely memorial in the garden' : '추모식을 했';
    return '';
  }

  chiefDeed(f, lang) {
    const [type, ko, en] = (f.s || 'other||').split('|');
    const D = CHIEF_DEEDS[type] || CHIEF_DEEDS.other;
    if (lang === 'en') return D[1].replace('{t}', en || ko || 'something');
    const t = ko || '';
    return D[0].replace('{t}{:을}', t ? josa(t, '을') : '').replace('{t}', t);
  }

  timeAgo(f, lang) {
    const e = this.e;
    if (!f) return lang === 'en' ? 'earlier' : '아까';
    const d = e.clock.day - f.day;
    const ago = e.now - f.sec;
    if (this.press) {   // the morning paper: news from after midnight is 'early this morning'
      const L = e.cfg.dayLength, early = (f.sec - f.day * L) * 1440 / L < 330;
      if (lang === 'en') return d <= 0 ? (early ? 'early this morning' : 'today') : d === 1 ? 'yesterday' : d === 2 ? 'the day before yesterday' : 'recently';
      return d <= 0 ? (early ? '오늘 새벽' : '오늘') : d === 1 ? '어제' : d === 2 ? '그저께' : '얼마 전';
    }
    if (lang === 'en') return d <= 0 ? (ago < e.cfg.dayLength * 0.08 ? 'just now' : 'earlier today') : d === 1 ? 'yesterday' : d === 2 ? 'the day before yesterday' : d < 7 ? 'a few days ago' : d < 14 ? 'last week' : 'a while ago';
    return d <= 0 ? (ago < e.cfg.dayLength * 0.08 ? '방금' : '아까') : d === 1 ? '어제' : d === 2 ? '그저께' : d < 7 ? '며칠 전에' : d < 14 ? '지난주에' : '얼마 전에';
  }

  dayPhrase(day, lang) {
    const d = day - this.e.clock.day;
    if (lang === 'en') return d <= 0 ? 'today' : d === 1 ? 'tomorrow' : d === 2 ? 'the day after tomorrow' : 'in ' + d + ' days';
    return d <= 0 ? '오늘' : d === 1 ? '내일' : d === 2 ? '모레' : d + '일 뒤';
  }

  placeName(idx, lang) { return this.e.world.nameOf(this.e.world.places[idx], lang); }

  slot(s) {
    const cur = this.cur, cache = cur.cache;
    if (cache[s] !== undefined) return cache[s];
    const v = this.slotValue(s);
    cache[s] = v;
    return v;
  }

  slotValue(s) {
    const e = this.e, cur = this.cur, b = cur.b, f = cur.f, sp = cur.sp, ls = cur.ls, lang = cur.lang, en = lang === 'en';
    const P = (id) => (id >= 0 && e.people[id] ? e.people[id] : null);
    switch (s) {
      case 'X': {
        // congratulations / comfort / thanks: X is the partner (not speaker, not listener)
        if (f && /^(congrats|comfort|thanks)\./.test(b.r)) {
          const other = f.a === sp.id || (ls && f.a === ls.id) ? f.b : f.a;
          if (other >= 0 && other !== sp.id && (!ls || other !== ls.id)) return this.refer(sp, P(other), lang);
        }
        return f ? this.refer(sp, P(f.a), lang) : '';
      }
      case 'Y': return f ? this.refer(sp, P(f.b), lang) : '';
      case 'C': return f ? this.refer(sp, P(f.c), lang) : '';
      case 'O': return this.refer(sp, P(b.o), lang);
      case 'Z': return this.refer(sp, P(b.from), lang);
      case 'L': return ls ? this.refer(sp, ls, lang) : (en ? 'Chief' : '촌장님');
      case 'V': return this.vocative(sp, ls, lang);
      case 'S': {
        if (en) return this.nameEn(sp);
        if (sp.title && !sp.given) return sp.title;
        return this.ctx.level === 0 ? sp.given : (sp.sur || '') + sp.given;
      }
      case 'K': return en ? 'the chief' : '촌장님';
      case 'P': {
        let idx = b.p >= 0 ? b.p : f ? f.p : -1;
        if (f && b.p < 0 && b.d === D_PLACE && b.alt >= 0) idx = b.alt;
        return idx >= 0 ? this.placeName(idx, lang) : '';
      }
      case 'B': {
        let idx = b.p >= 0 ? b.p : f ? f.p : -1;
        if (f && b.p < 0 && b.d === D_PLACE && b.alt >= 0) idx = b.alt;
        const p = idx >= 0 ? e.world.places[idx] : null;
        return p ? (en ? p.K.en.replace(/^the /, '') : p.K.ko) : '';
      }
      case 'I': {
        let idx = b.i >= 0 ? b.i : f ? f.i : -1;
        if (f && b.d === D_ITEM && b.alt >= 0) idx = b.alt;
        const it = ITEMS[idx];
        return it ? (en ? it.en : it.ko) : '';
      }
      case 'N': {
        const n = this.count(b);
        let idx = b.i >= 0 ? b.i : f ? f.i : -1;
        if (f && b.d === D_ITEM && b.alt >= 0) idx = b.alt;
        const it = ITEMS[idx];
        if (f && (f.k === 'move_in' || f.k === 'move_out')) return en ? String(n) : counted(n, '명');
        if (f && f.k === 'train') return en ? String(n) : counted(n, '명');
        if (en) return String(n);
        return counted(n, it ? it.ctr : '개');
      }
      case 'M': {
        let n = this.money(b);
        if (!n && b.r.startsWith('small.prices')) n = b.n;
        if (!n && b.r.startsWith('ans.price')) n = b.n;
        return en ? commas(n) + ' coins' : commas(n) + '코인';
      }
      case 'D': {
        if (b.r.startsWith('answer.since')) return en ? b.n + ' days' : b.n + '일';
        const day = b.n > 0 && !f ? b.n : f ? f.n : b.n;
        return this.dayPhrase(day, lang);
      }
      case 'R': return (e.bank.depositBp / 100).toFixed(2) + '%';
      case 'J': {
        const who = b.o >= 0 ? P(b.o) : f ? P(f.a) : sp;
        if (who && (who.flags & F_OWNER) && who.work >= 0 && e.world.places[who.work].cat === 'shop') { const K = e.world.places[who.work].K; return en ? K.en.replace(/^the /, '') + ' owner' : K.ko + ' 사장'; }
        const J = who ? JOBS[who.job] : null;
        return J ? (en ? J.en : J.ko) : '';
      }
      case 'T': return this.timeAgo(f, lang);
      case 'W': { const k = e.weather.today.kind; return en ? WEATHER_EN[k] : WEATHER_KO[k]; }
      case 'E': return (b.s && this.detailOfString(b, lang)) || this.detail(b, lang);
      case 'G': { const i = f && f.k === 'pet' ? f.n : b.n; const p = PETS[(i >= 0 ? i : 0) % PETS.length]; return en ? p[1] : p[0]; }
      case 'H': { const l = LIKES[b.h]; return l ? (en ? l.en : l.ko) : ''; }
      case 'A': { const l = LIKES[b.h]; return l ? (en ? l.enAct : l.koAct) : ''; }
      case 'U': { const a = ageOf(e, sp); return en ? String(a) : counted(a, '살').replace(' ', ' '); }
      case 'Q': case 'F': return '';
    }
    return '';
  }

  // ---------------------------------------------------------------- newspaper and diary (written style)
  written(rule, lang, opts) {
    const g = this.grammar(lang);
    const r = this.resolveRule(g, rule);
    if (!r) { this.miss(rule); return ''; }
    const e = this.e, ctx = this.ctx, cur = this.cur;
    const b = opts.b;
    const sp = opts.sp || e.alive[0];
    cur.b = b; cur.sp = sp; cur.ls = null; cur.rel = null; cur.lang = lang; cur.f = b.f; cur.talk = null;
    for (const k in cur.cache) delete cur.cache[k];
    // reuse setup for slot availability with a neutral speaker, then switch to written level 3
    this.setup(b, sp, null, null, lang, null);
    ctx.level = 3;
    ctx.recent = opts.recent || null;
    if (opts.recent) ctx.rpos = opts.rpos;
    ctx.p0 = 0; ctx.p1 = 0; ctx.p2 = 0; ctx.p3 = 0; ctx.noQ = true;
    const text = tidy(g.expand(r, ctx), lang);
    if (!text) this.miss(rule);
    return text;
  }

  paperText(paper, lang = this.e.cfg.lang) {
    const e = this.e;
    this.trng.setState([mix32(e.cfg.seedNum, paper.day * 7919 + 1), 0x1234567, mix32(paper.day, 77), 0x7654321]);
    const reporter = paper.reporter >= 0 ? e.people[paper.reporter] : null;
    const neutral = { given: '', sur: '', title: null };
    const mk = (f) => { const b = { w: -1, to: -1, r: '', f, x: 0, d: 0, alt: -1, src: SRC_NEWS, from: -1, o: -1, p: -1, i: -1, h: -1, n: 0, s: '', fl: [] }; return b; };
    const out = { masthead: lang === 'en' ? 'The Pinecone Times' : '솔방울 신문', no: paper.no, day: paper.day, date: lang === 'en' ? 'Day ' + (paper.day + 1) : (paper.day + 1) + '일째 아침', headline: '', lead: '', articles: [], sidebar: [], byline: '' };
    const sp = reporter || e.alive[0];
    this.press = true;
    if (paper.head) {
      out.headline = this.written('news.head.' + paper.head.k, lang, { b: mk(paper.head), sp });
      out.lead = this.written('news.body.' + paper.head.k, lang, { b: mk(paper.head), sp });
      const g = this.grammar(lang);
      if (g.has('news.more.' + paper.head.k)) out.lead += ' ' + this.written('news.more.' + paper.head.k, lang, { b: mk(paper.head), sp });
    } else {
      out.headline = this.written('news.quiet', lang, { b: mk(null), sp });
    }
    for (const f of paper.items) out.articles.push({ title: this.written('news.head.' + f.k, lang, { b: mk(f), sp }), body: this.written('news.body.' + f.k, lang, { b: mk(f), sp }) });
    const wb = mk(null);
    out.sidebar.push(this.written('news.weather', lang, { b: wb, sp }));
    for (const [idx, price, d] of paper.prices) {
      const b = mk(null); b.i = idx; b.n = price; b.fl = [d > 0 ? C.pos : C.neg];
      out.sidebar.push(this.written('news.price', lang, { b, sp }));
    }
    for (const f of paper.wanted) out.sidebar.push(this.written('news.wanted', lang, { b: mk(f), sp }));
    { const b = mk(null); b.n = paper.rate; out.sidebar.push(this.written('news.rate', lang, { b, sp })); }
    if (paper.quote) out.sidebar.push((lang === 'en' ? 'Overheard: “' : '오늘의 한마디: “') + paper.quote.text + '” — ' + this.refer(null, e.people[paper.quote.who], lang));
    this.press = false;
    if (reporter) out.byline = lang === 'en' ? 'Reporter ' + this.nameEn(reporter) : (reporter.sur || '') + reporter.given + ' 기자';
    return out;
  }

  /** one resident's diary for one day (written, first person) from their life log */
  diary(r, day, lang = this.e.cfg.lang) {
    const e = this.e;
    this.trng.setState([mix32(e.cfg.seedNum, r.id * 131 + day), 0xabcdef, mix32(day, r.id), 0x13579]);
    const lines = [];
    const entries = r.log.filter((x) => x[0] === day);
    // the most notable first: life events, incidents, rumours, then everyday things
    const rank = (k) => ({ wedding: 9, baby: 9, farewell: 9, sweetheart: 8, engaged: 8, fire: 8, ruin: 8, theft: 7, arrest: 7, move_in: 7, move_out: 7, shop_open: 7, scuffle: 6, window: 6, loan: 6, loan_paid: 6, rebuilt: 6, friend: 5, bestfriend: 6, crush: 6, confess_no: 6, meet: 4, talk: 4, big_buy: 4, outing: 5, gift: 4, help: 3, slip: 4, snowman: 4, concert: 3, pet: 3, bigcatch: 4, deposit: 2, eat: 1, buy: 1, pickup: 1 }[k] || 2);
    entries.sort((a, b) => rank(b[1]) - rank(a[1]) || a[6] - b[6]);
    const neutralB = (f) => ({ w: r.id, to: -1, r: '', f, x: 0, d: 0, alt: -1, src: SRC_DID, from: -1, o: -1, p: -1, i: -1, h: -1, n: 0, s: '', fl: [] });
    // one page of a diary does not repeat itself: alternatives used earlier on the page are avoided
    const recent = this.diaryRecent || (this.diaryRecent = new Int32Array(12));
    recent.fill(0);
    const rpos = { v: 0 };
    lines.push(this.written('diary.open', lang, { b: neutralB(null), sp: r, recent, rpos }));
    const seen = new Set();
    let talks = 0;
    for (const [d, kind, other, place, extra, fid] of entries) {
      if (lines.length >= 6) break;
      // one line per person talked to, at most two chats a day (the rest of the day gets a say too)
      const key = kind === 'talk' || kind === 'meet' || kind === 'friend' || kind === 'gift' || kind === 'help' ? kind + ':' + other : kind;
      if (seen.has(key) || (seen.has(kind) && rank(kind) < 4)) continue;
      if (kind === 'talk' && (talks >= 2 || (other >= 0 && seen.has('who:' + other)))) continue;   // 'became friends with X' already says they met
      if (other >= 0) seen.add('who:' + other);
      if (kind === 'talk') talks++;
      seen.add(key); seen.add(kind);
      const f = fid ? e.facts.get(fid) || null : null;
      const b = neutralB(f);
      if (other >= 0) b.o = other;
      if (place >= 0) b.p = place;
      if (kind === 'buy' || kind === 'eat') b.i = extra;
      if (kind === 'deposit' || kind === 'loan' || kind === 'pickup') b.n = extra;
      const t = this.written('diary.' + kind, lang, { b, sp: r, recent, rpos });
      if (t) lines.push(t);
    }
    lines.push(this.written('diary.close', lang, { b: neutralB(null), sp: r, recent, rpos }));
    return lines.filter(Boolean);
  }
}
