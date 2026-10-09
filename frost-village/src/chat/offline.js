// OfflineBrain: replies with no network at all. Detects what the chief said (intent.js), then answers
// in the resident's own voice (personas.js lines, lines.js generic lines) with correct particles and
// speech level, bringing up memories ("저번에 …했잖아요!"), the rumours this resident heard from
// others ("서아가 그러던데, …래요!") and the lines it learned in earlier AI chats.
//
// It also writes "village material" from offline chats (a short memory summary, facts the chief
// answered, a little templated gossip), so even offline play keeps growing the village story.

import { render, levelize, levelPronouns, toHearsay, toReminder, similarity, CASUAL, isPlainForm, hangulRatio } from './ko.js';
import { GENERIC, SUMMARY, OFFLINE_GOSSIP } from './lines.js';
import { refName } from './personas.js';
import { slotify, renderSlots, isClean, MOOD_EMOTE } from './sanitize.js';
import { isSensitive } from './safety.js';

const pickFrom = (list, rng) => list[Math.floor(rng() * list.length) % list.length];
const shuffle = (list, rng) => { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export class OfflineBrain {
  constructor() { this.id = 'offline'; }
  available() { return true; }

  /** a resident's ctx for rendering: { p, mem, level, slots, rng, say(list, extra) } */
  ctx(village, key, rng, session) {
    const p = village.personas[key];
    const mem = village.mem(key);
    const level = village.level(key);
    const likes = p.likes || [];
    const slots = {
      chief: village.chiefName, like: likes[0] || '눈', like2: likes[1] || '', dislike: (p.dislikes || [])[0] || '추위',
      job: p.job, weather: village.world.weatherKo || '눈',
      food: likes.find((l) => /빵|국밥|코코아|우유|차$|밥|귤|사탕|수프|생선|고기|과자|케이크|쿠키|도토리/.test(l)) || '따뜻한 코코아',
    };
    const recent = (session && session.recentTpl) || [];
    const say = (list, extra) => {
      if (!list || !list.length) return '';
      const all = Object.assign({}, slots, extra || {});
      // fresh templates first (in random order), and never one with an empty slot when another fits
      const fresh = list.filter((t) => !recent.includes(t));
      const order = shuffle(fresh, rng).concat(shuffle(list.filter((t) => recent.includes(t)), rng));
      let tpl = order[0], txt = '';
      for (const t of order) {
        const out = {};
        const r = render(t, all, level, out);
        if (!out.missing) { tpl = t; txt = r; break; }
      }
      if (!txt) txt = render(tpl, all, level);
      recent.push(tpl); if (recent.length > 12) recent.shift();
      if (p.level !== level) txt = levelize(txt, level);          // a polite resident who became a close friend
      return levelPronouns(txt, level);
    };
    return { p, mem, level, slots, rng, say };
  }

  /**
   * pick the variant list for this resident: kid (kids, toddler) · teen · old (gruff casual
   * grown-ups: p.old, or an elder speaking 반말) · gran (an elder speaking 해요체) · def
   */
  variant(obj, p, level) {
    if (!obj) return null;
    if (Array.isArray(obj)) return obj;
    if ((p.group === 'kid' || p.group === 'toddler') && obj.kid) return obj.kid;
    if (p.group === 'teen' && obj.teen) return obj.teen;
    if ((p.old || (p.group === 'elder' && level === CASUAL)) && obj.old) return obj.old;
    if (p.group === 'elder' && level !== CASUAL && obj.gran) return obj.gran;
    return obj.def || obj.kid || [];
  }

  /**
   * req: { village, key, intent, session, rng }
   * returns a result in the same shape as a validated AI reply (sanitize.js) plus { used, question,
   * private, memKind, care }. private: nothing from this exchange is shared or brought up first.
   */
  reply(req) {
    const { village, key, intent } = req;
    const rng = req.rng || Math.random;
    const session = req.session || {};
    const c = this.ctx(village, key, rng, session);
    const { p, mem, level, say } = c;
    const day = village.day;
    const res = { reply: '', emote: null, mood: null, affinity: 0, importance: 1, memory: '', facts: [], topics: intent.topics.slice(), gossip: [], lines: [], favor: null, used: [], question: null, private: false, memKind: null };
    const parts = [];
    const L = p.lines || {};
    const V = (o) => this.variant(o, p, level);
    const sum = (tpl, extra) => render(tpl, Object.assign({}, c.slots, extra || {}), CASUAL);
    const greeted = !!session.greeted || (session.count || 0) > 0;
    const hello = () => say(greeted ? V(GENERIC.greetBack) : mem.last === day && mem.talks > 0 ? V(GENERIC.again) : L.hi && L.hi.length ? L.hi : V(GENERIC.greeting));
    const careful = ['distress', 'sad', 'romance', 'rude', 'unkind', 'vent'].includes(intent.intent);

    if (p.group === 'toddler') {
      const sad = intent.intent === 'distress' || intent.intent === 'sad';
      res.reply = say(sad ? GENERIC.toddlerSad : careful ? GENERIC.toddlerHuh : GENERIC.toddler);
      res.emote = sad ? 'heart' : pickFrom(['laugh', 'heart', 'sparkle'], rng);
      res.affinity = intent.intent === 'rude' ? -1 : careful ? 0 : 1;
      res.private = careful;
      res.memory = careful ? '' : intent.intent === 'gift' ? SUMMARY.gift : '촌장님이랑 놀았다';
      return res;
    }

    switch (intent.intent) {
      case 'distress': {
        parts.push(say(intent.danger ? GENERIC.danger : GENERIC.distress));
        res.emote = 'heart'; res.mood = 'worried'; res.importance = 3; res.memory = SUMMARY.distress;
        res.affinity = 0; res.private = true; res.memKind = 'care'; res.care = true;
        break;
      }
      case 'sad': {
        const sub = intent.sub === 'grief' ? GENERIC.grief : intent.sub === 'hurt' ? GENERIC.hurt : intent.sub === 'worry' ? GENERIC.worry : GENERIC.sad;
        parts.push(say(V(sub)));
        res.emote = 'heart'; res.mood = 'worried'; res.importance = 3; res.memory = SUMMARY.sad;
        res.affinity = 0; res.private = true; res.memKind = 'care';
        break;
      }
      case 'romance': {
        parts.push(say(V(GENERIC.romance)));
        res.emote = p.group === 'kid' || p.group === 'teen' ? 'sweat' : 'laugh'; res.affinity = 0; res.private = true;
        break;
      }
      case 'unkind': {
        parts.push(say(V(GENERIC.unkind)));
        res.emote = 'sweat'; res.affinity = 0; res.private = true;
        break;
      }
      case 'vent': {
        parts.push(say(V(GENERIC.vent)));
        res.emote = 'heart'; res.affinity = 0; res.private = true;
        break;
      }
      case 'rude': {
        if (intent.sub === 'swear') { parts.push(say(V(GENERIC.swear))); res.emote = 'sweat'; res.affinity = -1; res.private = true; break; }
        parts.push(say(V(GENERIC.rude)));
        res.emote = p.mood === 'grumpy' ? 'anger' : 'tear'; res.mood = p.mood === 'grumpy' ? 'grumpy' : 'sad';
        res.affinity = -2; res.importance = 2; res.memory = SUMMARY.rude; res.private = true;
        break;
      }
      case 'answer': {
        const q = session.expect;
        if (q && q.expect === 'yesno') {
          const own = intent.yes ? q.yesR : q.noR;
          parts.push(own ? say([own]) : say(intent.yes ? GENERIC.answerYes : GENERIC.answerNo));
          const f = intent.yes ? q.yes : q.no;
          if (f) { res.facts.push(f); res.memory = f; }
          res.emote = 'heart'; res.affinity = 1; res.importance = 3;
        } else if (q && intent.answer && intent.known && !isSensitive(intent.answer) && hangulRatio(intent.answer) >= 0.8) {
          // an answer the question expected (a food, an animal, a colour, an item): remembered and told
          parts.push(say(GENERIC.answerNoun, { a: intent.answer }));
          if (q.fact) {
            const f = render(q.fact, { a: intent.answer }, CASUAL);
            res.facts.push(f);
            res.memory = sum(SUMMARY.answerNoun, { a: intent.answer });
            const h = toHearsay(f);
            if (h) res.gossip.push(slotify(h, village.personas, village.chiefName));
          }
          res.emote = 'heart'; res.affinity = 1; res.importance = 3;
        } else if (intent.answer && hangulRatio(intent.answer) >= 0.8) {
          // anything else is only acknowledged: never stored, never retold ("총", a real name …)
          const odd = !isClean(intent.answer) || isSensitive(intent.answer) || /^(총|칼|무기|폭탄|똥|방귀|돈)$/.test(intent.answer);
          parts.push(say(odd ? GENERIC.answerOdd : GENERIC.answerOther, { a: intent.answer }));
          res.emote = odd ? 'sweat' : 'heart';
        } else { parts.push(say(GENERIC.answerNo)); res.emote = 'heart'; }
        break;
      }
      case 'gift': {
        const item = intent.items[0] && intent.items[0].name;
        const gaveToday = mem.day.d === day && mem.day.gift > 0;
        const fav = item ? mem.favors.find((f) => !f.done && f.item && (item.includes(f.item) || f.item.includes(item))) : null;
        const G = GENERIC.gift;
        if (fav) {
          fav.done = 1;
          parts.push(say(V(G.favor), { item }));
          res.gossip.push(OFFLINE_GOSSIP.favorDone);
          res.affinity = 3; res.importance = 4; res.memory = sum('촌장님이 부탁한 {item:을} 가져다줬다', { item });
        } else if (gaveToday) {
          parts.push(say(V(G.again))); res.affinity = 0; res.memory = '';
        } else if (item) {
          const liked = (p.likes || []).some((l) => l.includes(item) || item.includes(l.split(' ').pop()));
          parts.push(say(V(liked ? G.liked : G.normal), { item }));
          res.affinity = liked ? 3 : 2; res.importance = 3; res.memory = sum(SUMMARY.giftItem, { item });
          res.gossip.push(render(OFFLINE_GOSSIP.giftItem, { item }, CASUAL));
        } else {
          parts.push(say(V(G.none))); res.affinity = 2; res.importance = 3; res.memory = SUMMARY.gift;
          res.gossip.push(OFFLINE_GOSSIP.gift);
        }
        res.emote = 'love'; res.mood = p.group === 'kid' ? 'excited' : 'happy'; res.topics = ['선물'];
        break;
      }
      case 'favor': {
        const open = mem.openFavors();
        const accept = /줄게|할게|도와줄|해 ?줄|맡겨|좋아|그래|알겠|오케이/.test(intent.text) && !/[?？]/.test(intent.text);
        if (open.length && accept) {
          parts.push(say(V(GENERIC.favorThanks)));
          res.affinity = 2; res.importance = 3; res.memory = SUMMARY.favor; res.gossip.push(OFFLINE_GOSSIP.favor);
          res.emote = 'heart';
        } else if (open.length) {
          parts.push(say(GENERIC.favorOpen, { favor: open[0].s })); res.emote = 'question'; res.affinity = 1;
        } else if (L.favor && L.favor.length) {
          const f = pickFrom(L.favor, rng);
          parts.push(say([f.ask]));
          res.favor = { ask: render(f.ask, c.slots, level), item: f.item || null };
          res.emote = 'idea'; res.affinity = 1; res.importance = 3; res.memory = '촌장님께 작은 부탁을 했다';
        } else { parts.push(say(GENERIC.favorNone)); res.emote = 'heart'; res.affinity = 1; }
        res.topics = res.topics.length ? res.topics : ['부탁'];
        break;
      }
      case 'memory': {
        const r = mem.reminder({ day, topics: intent.topics });
        if (r) {
          parts.push(say(V(GENERIC.memoryHas), { memo: r.text }));
          const fact = mem.facts[mem.facts.length - 1];
          if (fact && r.mem.kind !== 'fact' && similarity(fact.s, r.mem.s) < 0.7 && !isSensitive(fact.s, { aboutChief: true })) { const fr = toReminder(fact.s); if (fr) parts.push(say(GENERIC.memoryFact, { fact: fr })); }
        } else parts.push(say(GENERIC.memoryNone));
        res.emote = 'idea'; res.affinity = 1;
        break;
      }
      case 'gossip': {
        const g = village.corpus.pickGossip(key, { day, topics: intent.topics, names: intent.names.map((n) => n.key), said: mem.said, rng });
        if (g) {
          parts.push(village.corpus.sayGossip(g.entry, g.kn, key, village.personas, level, village.chiefName, rng));
          res.used.push(g.entry.i); res.emote = 'exclaim';
        } else {
          const said = session.rumors || (session.rumors = []);
          const left = GENERIC.rumorStatic.filter((r) => !said.includes(r));
          if (left.length && rng() < 0.85) {
            const r = pickFrom(left, rng); said.push(r);
            parts.push(levelize(say(V(GENERIC.rumorIntro)) + ' ' + r, level) + '!');
            res.emote = 'exclaim';
          } else { parts.push(say(V(GENERIC.gossipNone))); res.emote = 'question'; }
        }
        res.affinity = 1; res.memory = SUMMARY.gossip; res.topics = res.topics.length ? res.topics : ['소문'];
        break;
      }
      case 'person': {
        const target = intent.names[0] && intent.names[0].key;
        const tp = target && village.personas[target];
        if (!tp) { parts.push(say(V(GENERIC.unknown))); break; }
        if (target === key) { parts.push(say(GENERIC.person.self)); res.emote = 'heart'; res.affinity = 1; res.memory = SUMMARY.about; break; }
        const name = refName(village.personas, key, target, village.chiefName);
        const rel = village.relation(key, target);
        const label = rel ? rel.label || '이웃' : '이웃';
        const extra = { person: name, plike: (tp.likes || [])[0] || '눈', rel: label };
        const bucket = !rel ? 'none' : rel.aff >= 60 ? 'high' : rel.aff >= 35 ? 'mid' : /앙숙|라이벌/.test(label) ? 'rival' : 'low';
        parts.push(say(V(GENERIC.person[bucket]), extra));
        const g = village.corpus.pickGossip(key, { day, names: [target], said: mem.said, rng });
        if (g && g.entry.sb && g.entry.sb.includes(target)) { parts.push('그러고 보니 ' + village.corpus.sayGossip(g.entry, g.kn, key, village.personas, level, village.chiefName, rng)); res.used.push(g.entry.i); }
        res.emote = bucket === 'rival' ? 'sweat' : 'heart';
        res.memory = sum(SUMMARY.person, { person: tp.short || tp.name });
        break;
      }
      case 'compliment': {
        const again = mem.day.d === day && (mem.day.k.compliment || 0) >= 1;
        parts.push(say(V(again ? GENERIC.complimentAgain : GENERIC.compliment)));
        res.emote = again ? 'sweat' : 'love'; res.mood = again ? 'shy' : 'happy'; res.affinity = 2; res.importance = 2;
        if (!again) { res.memory = SUMMARY.compliment; res.gossip.push(OFFLINE_GOSSIP.compliment); }
        break;
      }
      case 'thanks': parts.push(say(V(GENERIC.thanks))); res.emote = 'heart'; res.affinity = 1; res.memory = SUMMARY.thanks; break;
      case 'joke': {
        const laughing = /ㅋㅋ|ㅎㅎ|하하|웃겨|웃기다/.test(intent.text) && !/(해 ?줘|해 ?봐|들려|알려)/.test(intent.text);
        if (laughing) parts.push(say(V(GENERIC.joke.react)));
        else parts.push(say(L.joke && L.joke.length ? L.joke : GENERIC.joke.def));
        res.emote = 'laugh'; res.mood = 'happy'; res.affinity = 1; res.memory = SUMMARY.joke; res.topics = res.topics.length ? res.topics : ['농담'];
        break;
      }
      case 'farewell': {
        parts.push(say(L.bye && L.bye.length ? L.bye : V(GENERIC.farewell)));
        res.emote = 'wave';
        if ((session.count || 0) >= 2) { res.memory = SUMMARY.farewell; res.importance = 1; }
        break;
      }
      case 'about': parts.push(say(GENERIC.about)); res.emote = 'heart'; res.affinity = 1; res.memory = SUMMARY.about; break;
      case 'mood': {
        parts.push(say(GENERIC.mood[intent.sub] || GENERIC.mood.bored));
        res.emote = intent.sub === 'sleepy' ? 'zzz' : 'heart'; res.affinity = 1; res.memory = '';
        break;
      }
      case 'weather': {
        const W = GENERIC.weather;
        const list = (p.old || (p.group === 'elder' && level === CASUAL)) ? W.old : p.group === 'elder' && W.gran && rng() < 0.6 ? W.gran : W[village.world.weather] || W.snow;
        parts.push(say(list));
        res.emote = village.world.weather === 'clear' ? 'sparkle' : 'cold'; res.memory = SUMMARY.weather; res.topics = ['날씨'];
        break;
      }
      case 'work': parts.push(say(L.work && L.work.length ? L.work : V(GENERIC.work))); res.emote = pickFrom(p.emotes, rng); res.affinity = 1; res.memory = SUMMARY.work; res.topics = res.topics.length ? res.topics : ['일']; break;
      case 'how': {
        if (intent.greet) parts.push(hello());
        parts.push(say(L.how && L.how.length ? L.how : V(GENERIC.how)));
        res.emote = pickFrom(p.emotes, rng); res.affinity = 1; res.memory = SUMMARY.how;
        this.maybeExtra(village, key, c, res, parts, session, intent, 0.45);
        break;
      }
      case 'greeting': {
        const back = greeted;
        parts.push(hello());
        res.emote = 'wave'; res.affinity = 1; res.memory = back || (mem.last === day && mem.talks > 0) ? '' : SUMMARY.greeting;
        if (intent.topics.length) { const tp = intent.topics[0]; parts.push(say(this.likes(p, tp) ? GENERIC.topicLike : GENERIC.topicGeneric, { topic: tp })); res.memory = render(SUMMARY.topic, { topic: tp }, CASUAL); }
        else this.maybeExtra(village, key, c, res, parts, session, intent, back ? 0.8 : 0.6);
        break;
      }
      case 'news':
      case 'tell': {
        const d = intent.deed;
        // the listener may be in the news ("내가 하린이랑 …" told to 하린): they say 나랑 / 저랑
        const mine = (t, lv) => renderSlots(slotify(t, village.personas, village.chiefName), key, village.personas, lv, village.chiefName);
        if (intent.greet && !greeted) parts.push(hello());
        if (!d.share) {
          // something the resident keeps to themself: no echo, no memory, no rumour
          parts.push(say(V(intent.sub === 'health' ? GENERIC.tellHealth : GENERIC.tellQuiet)));
          res.emote = 'heart'; res.private = true;
          break;
        }
        parts.push(say(V(intent.intent === 'news' ? (d.cheer ? GENERIC.news : GENERIC.newsNice) : GENERIC.tell), { deed: mine(d.echo, level) }));
        res.emote = intent.intent === 'news' ? (p.group === 'kid' ? 'sparkle' : 'exclaim') : 'heart';
        res.mood = intent.intent === 'news' && p.group === 'kid' ? 'excited' : null;
        res.affinity = 1; res.importance = intent.intent === 'news' ? 3 : 2; res.memory = mine(d.plain, CASUAL);
        const h = toHearsay(d.plain);
        if (h) res.gossip.push(slotify(h, village.personas, village.chiefName));
        break;
      }
      case 'invite': {
        const tp = intent.topics[0] || (intent.text.match(/([가-힣]{1,5})(?:하자|놀자|가자|먹자|할래)/) || [])[1] || '';
        const yes = !tp || this.likes(p, tp) || p.group === 'kid' || rng() < 0.5;
        // the chief's own proposal, echoed back ("같이 썰매 타자!" -> "썰매 타자")
        let act = intent.text.replace(/[!~.?？…ㅋㅎ\s]+$/, '').replace(/^((우리|나랑|저랑|같이|함께|내일|오늘|이따|나중에|지금|다음에|이번에)\s*)+/, '').replace(/(하|가|타|보|놀|먹)(?:ㄹ래|할래|갈래|탈래|볼래|놀래|먹을래)$/, '');
        act = act.replace(/([가-힣])을래$/, '$1자').replace(/할래$/, '하자').replace(/갈래$/, '가자').replace(/탈래$/, '타자').replace(/볼래$/, '보자').replace(/놀래$/, '놀자').replace(/먹을래$/, '먹자').replace(/마실래$/, '마시자').replace(/할까$/, '하자').replace(/갈까$/, '가자');
        if (!/자$/.test(act) || act.length > 12 || /[^가-힣 ]/.test(act)) act = '';
        const game = /눈싸움|팔씨름|시합|내기|게임|한판/.test(intent.text) && (p.old || (p.group === 'elder' && level === CASUAL));
        parts.push(say(yes ? (game ? GENERIC.inviteGame : V(GENERIC.inviteYes)) : V(GENERIC.inviteMaybe), { topic: tp, act }));
        res.emote = yes ? (p.group === 'kid' ? 'sparkle' : 'thumbs') : 'sweat'; res.mood = yes ? (p.group === 'kid' ? 'excited' : 'happy') : null;
        res.affinity = yes ? 2 : 1; res.importance = 2;
        res.memory = act ? '촌장님이 같이 ' + act + '고 했다' : '촌장님이 같이 놀자고 했다';
        res.topics = res.topics.length ? res.topics : tp ? [tp] : ['놀이'];
        break;
      }
      case 'topic': {
        // "고양이 좋아해?" / "썰매 타 봤어?": does this resident like it?
        const noun = intent.noun || intent.topics[0];
        const line = village.corpus.pickLine(key, { day, topics: intent.topics, said: mem.said, mood: mem.mood, rng, needTopic: true });
        if (line) { parts.push(village.corpus.sayLine(line, key, village.personas, level, village.chiefName)); res.used.push(line.i); }
        else if (noun === '가족') parts.push(say(GENERIC.topicAsk.family));
        else {
          const liked = this.likes(p, noun) || intent.topics.some((t) => this.likes(p, t));
          const A = GENERIC.topicAsk;
          parts.push(say(V(intent.ask === 'exp' ? (liked ? A.expLiked : A.expMeh) : liked ? A.liked : A.meh), { noun }));
        }
        res.emote = 'heart'; res.affinity = 1;
        if (intent.topics[0]) res.memory = render(SUMMARY.topic, { topic: intent.topics[0] }, CASUAL);
        break;
      }
      default: {
        // unknown: outside-the-village talk gets a puzzled in-world answer; otherwise talk about the
        // topic if there is one, else listen kindly and keep the chat going
        const tp = intent.topics[0];
        if (intent.sub === 'whoami') { parts.push(say(GENERIC.whoami)); res.emote = 'question'; break; }
        if (intent.sub === 'reward') { parts.push(say(V(GENERIC.reward))); res.emote = 'sweat'; break; }
        if (intent.sub === 'odd') { parts.push(say(V(GENERIC.odd))); res.emote = 'question'; break; }
        if (intent.sub === 'blank') { parts.push(say(V(GENERIC.huh))); res.emote = 'question'; break; }
        if (intent.sub === 'what') { parts.push(say(V(GENERIC.what))); res.emote = 'sweat'; break; }
        if (intent.sub === 'iamchief') { parts.push(say(V(GENERIC.iamchief))); res.emote = 'heart'; res.affinity = 1; break; }
        if (intent.sub === 'story') { parts.push(say(V(GENERIC.story))); res.emote = 'heart'; res.affinity = 1; res.memory = '촌장님이 하루 이야기를 들려줬다'; break; }
        if (intent.sub === 'ack') { parts.push(say(V(GENERIC.ack))); this.maybeExtra(village, key, c, res, parts, session, intent, 0.85); res.emote = res.emote || pickFrom(p.emotes, rng); break; }
        const line = village.corpus.pickLine(key, { day, topics: intent.topics, said: mem.said, mood: mem.mood, rng, needTopic: true });
        if (line) { parts.push(village.corpus.sayLine(line, key, village.personas, level, village.chiefName)); res.used.push(line.i); }
        else if (tp) {
          const liked = this.likes(p, tp);
          parts.push(say(liked ? GENERIC.topicLike : GENERIC.topicGeneric, { topic: tp }));
          const g = village.corpus.pickGossip(key, { day, topics: [tp], said: mem.said, rng });
          if (g && g.entry.tp.includes(tp)) { parts.push(village.corpus.sayGossip(g.entry, g.kn, key, village.personas, level, village.chiefName, rng)); res.used.push(g.entry.i); }
          res.memory = render(SUMMARY.topic, { topic: tp }, CASUAL);
        } else {
          parts.push(say(V(GENERIC.unknown)));
          this.maybeExtra(village, key, c, res, parts, session, intent, 0.35);
        }
        res.emote = res.emote || pickFrom(p.emotes, rng);
      }
    }
    // a little personality: an interjection now and then, only on light-hearted replies; "있잖아"
    // only in front of news, a rumour or a memory
    const light = ['greeting', 'how', 'gossip', 'news', 'joke', 'compliment', 'gift', 'invite', 'weather', 'work', 'about', 'topic', 'thanks', 'memory'].includes(intent.intent);
    const joined = parts.join(' ');
    if (light && p.interj && p.interj.length && parts.length && rng() < 0.22 && !p.interj.some((i) => joined.includes(i.replace(/[~…!]$/, ''))) && !/^(오|어|음|우와|와아?|헐|어머나?|아이고|헤헤|히히|흥|허허|껄껄|에잉|흠흠|어험|정말|진짜|야호|좋아|대박)[,~!…?\s]/.test(parts[0])) {
      // "있잖아" only in front of news, a rumour or a memory; laughter only on happy replies
      const happy = ['compliment', 'joke', 'gift', 'invite', 'news', 'greeting', 'thanks'].includes(intent.intent) && !['sweat', 'tear', 'anger', 'question'].includes(res.emote);
      const ok = p.interj.filter((i) => (!/^있잖아/.test(i) || ['gossip', 'news', 'memory'].includes(intent.intent)) && (!/^(껄껄|호호|헤헤|히히|하하|헤헷|까르륵)/.test(i) || happy));
      if (ok.length) {
        const ij = pickFrom(ok, rng);
        if (!/[~…!?.♪]$/.test(ij)) parts[0] = ij + ', ' + parts[0]; else parts[0] = ij + ' ' + parts[0];
      }
    }
    res.reply = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (!res.emote) res.emote = MOOD_EMOTE[mem.mood] || 'heart';
    if (res.memory && !isPlainForm(res.memory)) res.memory = '';
    if (res.private) { res.gossip = []; res.lines = []; res.facts = []; }
    return res;
  }

  /** does this resident like the topic? (likes, traits, own work lines) */
  likes(p, tp) {
    if (!tp) return false;
    const hay = [...(p.likes || []), ...(p.traits || []), ...((p.lines && p.lines.work) || []), p.job || ''];
    return hay.some((l) => l.includes(tp) || (tp.length >= 2 && tp.includes(l.split(' ').pop())));
  }

  /** after small talk: maybe a learned line, a rumour, a memory, or a question back */
  maybeExtra(village, key, c, res, parts, session, intent, chance) {
    const { mem, rng, level, p } = c;
    const day = village.day;
    if (rng() > chance) return;
    const roll = rng();
    if (roll < 0.3) {
      const line = village.corpus.pickLine(key, { day, topics: intent.topics, said: mem.said, mood: mem.mood, rng });
      if (line) { parts.push(village.corpus.sayLine(line, key, village.personas, level, village.chiefName)); res.used.push(line.i); return; }
    }
    if (roll < 0.55) {
      const g = village.corpus.pickGossip(key, { day, topics: intent.topics, said: mem.said, rng, minFresh: 0.2 });
      if (g) { parts.push(village.corpus.sayGossip(g.entry, g.kn, key, village.personas, level, village.chiefName, rng)); res.used.push(g.entry.i); return; }
    }
    if (roll < 0.75 && mem.ep.length) {
      const r = mem.reminder({ day, topics: intent.topics });
      if (r && r.mem.d < day) { parts.push(c.say(GENERIC.openMemo, { memo: r.text })); return; }
    }
    this.askBack(c, res, parts, session);
  }

  askBack(c, res, parts, session) {
    const { p, mem, rng } = c;
    if (session.expect || (session.asked || 0) >= 1) return;
    const asks = (p.lines && p.lines.ask) || [];
    const idx = asks.map((a, i) => i).filter((i) => !mem.asked.includes(i));
    if (!idx.length) return;
    const i = idx[Math.floor(rng() * idx.length)];
    const q = asks[i];
    parts.push(c.say([q.q]));
    res.question = { expect: q.expect, fact: q.fact || null, yes: q.yes || null, no: q.no || null, yesR: q.yesR || null, noR: q.noR || null, i };
    res.emote = 'question';
  }

  /**
   * the resident speaks first when the chat opens (no AI call): a greeting plus maybe a rumour,
   * a line learned in an earlier chat, a memory or an open favour. Returns [{ text, emote, used }].
   */
  opener(village, key, rng = Math.random, session = {}) {
    const c = this.ctx(village, key, rng, session);
    const { p, mem, level, say } = c;
    const L = p.lines || {};
    const day = village.day;
    session.greeted = true;
    if (p.group === 'toddler') return [{ text: say(GENERIC.toddler), emote: 'laugh', used: [] }];
    const out = [];
    const again = mem.last === day && mem.talks > 0;
    out.push({ text: say(again ? this.variant(GENERIC.again, p, level) : L.hi && L.hi.length ? L.hi : this.variant(GENERIC.greeting, p, level)), emote: 'wave', used: [] });
    // the day after the chief seemed sad: one quiet check-in, nothing else
    const care = mem.careDue(day);
    if (care) {
      mem.cared(day);
      out.push({ text: say(this.variant(GENERIC.checkin, p, level)), emote: 'heart', used: [] });
      return out;
    }
    const open = mem.openFavors();
    const g = village.corpus.pickGossip(key, { day, said: mem.said, rng, minFresh: 0.1 });
    const line = village.corpus.pickLine(key, { day, said: mem.said, mood: mem.mood, rng });
    const r = mem.ep.length ? mem.reminder({ day }) : null;
    const opts = [];
    if (g) opts.push(['g', 3 + village.corpus.fresh(g.entry, day) * 3]);
    if (line) opts.push(['l', 3]);
    if (r && r.mem.d < day) opts.push(['m', 2]);
    if (open.length) opts.push(['f', 1.5]);
    if (!opts.length || rng() < 0.15) return out;
    let tot = opts.reduce((a, o) => a + o[1], 0), x = rng() * tot, pick = opts[0][0];
    for (const o of opts) { x -= o[1]; if (x <= 0) { pick = o[0]; break; } }
    if (pick === 'g') out.push({ text: village.corpus.sayGossip(g.entry, g.kn, key, village.personas, level, village.chiefName, rng), emote: 'exclaim', used: [g.entry.i] });
    else if (pick === 'l') out.push({ text: village.corpus.sayLine(line, key, village.personas, level, village.chiefName), emote: pickFrom(p.emotes, rng), used: [line.i] });
    else if (pick === 'm') out.push({ text: say(GENERIC.openMemo, { memo: r.text }), emote: 'idea', used: [] });
    else out.push({ text: say(GENERIC.favorOpen, { favor: open[0].s }), emote: 'question', used: [] });
    return out;
  }

  /** an in-character line when AI could not answer (refused, empty, broken JSON) */
  confused(village, key, rng = Math.random) {
    const c = this.ctx(village, key, rng, {});
    return { reply: c.say(GENERIC.confused), emote: 'sweat' };
  }

  /** the kind line for a hurting chief, when the AI could not answer (no confusion, no jokes) */
  comfort(village, key, intent, rng = Math.random) {
    const c = this.ctx(village, key, rng, {});
    const V = (o) => this.variant(o, c.p, c.level);
    const list = intent.intent === 'distress' ? (intent.danger ? GENERIC.danger : GENERIC.distress)
      : intent.sub === 'grief' ? V(GENERIC.grief) : intent.sub === 'hurt' ? V(GENERIC.hurt) : intent.sub === 'worry' ? V(GENERIC.worry) : V(GENERIC.sad);
    return { reply: c.say(list), emote: 'heart' };
  }

  /** "I need to get back to work" (AI budget used up) */
  busy(village, key, rng = Math.random) {
    const c = this.ctx(village, key, rng, {});
    const L = c.p.lines || {};
    return { reply: c.say(L.busy && L.busy.length ? L.busy : GENERIC.busy), emote: 'sweat' };
  }
}
