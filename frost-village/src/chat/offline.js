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
import { slotify, isClean, MOOD_EMOTE } from './sanitize.js';

const pickFrom = (list, rng) => list[Math.floor(rng() * list.length) % list.length];

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
      chief: village.chiefName, like: likes[0] || '눈', like2: likes[1] || likes[0] || '빵', dislike: (p.dislikes || [])[0] || '추위',
      job: p.job, weather: village.world.weatherKo || '눈',
    };
    const recent = (session && session.recentTpl) || [];
    const say = (list, extra) => {
      if (!list || !list.length) return '';
      const fresh = list.filter((t) => !recent.includes(t));
      const tpl = pickFrom(fresh.length ? fresh : list, rng);
      recent.push(tpl); if (recent.length > 12) recent.shift();
      const out = {};
      let txt = render(tpl, Object.assign({}, slots, extra || {}), level, out);
      if (out.missing) txt = render(pickFrom(list, rng), Object.assign({}, slots, extra || {}), level);
      if (p.level !== level) txt = levelize(txt, level);          // a polite resident who became a close friend
      return levelPronouns(txt, level);
    };
    return { p, mem, level, slots, rng, say };
  }

  variant(obj, p, level) {
    if (!obj) return null;
    if (Array.isArray(obj)) return obj;
    if ((p.group === 'kid' || p.group === 'toddler') && obj.kid) return obj.kid;
    if (level === CASUAL && p.group !== 'kid' && p.group !== 'teen' && obj.old) return obj.old;
    return obj.def;
  }

  /**
   * req: { village, key, intent, session, rng }
   * returns a result in the same shape as a validated AI reply (sanitize.js) plus { used, question }.
   */
  reply(req) {
    const { village, key, intent } = req;
    const rng = req.rng || Math.random;
    const session = req.session || {};
    const c = this.ctx(village, key, rng, session);
    const { p, mem, level, say } = c;
    const day = village.day;
    const res = { reply: '', emote: null, mood: null, affinity: 0, importance: 1, memory: '', facts: [], topics: intent.topics.slice(), gossip: [], lines: [], favor: null, used: [], question: null };
    const parts = [];
    const L = p.lines || {};
    const V = (o) => this.variant(o, p, level);
    const sum = (tpl, extra) => render(tpl, Object.assign({}, c.slots, extra || {}), CASUAL);

    if (p.group === 'toddler') {
      res.reply = say(GENERIC.toddler);
      res.emote = pickFrom(['laugh', 'heart', 'sparkle'], rng);
      res.affinity = intent.intent === 'rude' ? -1 : 1;
      res.memory = intent.intent === 'gift' ? SUMMARY.gift : '촌장님이랑 놀았다';
      return res;
    }

    switch (intent.intent) {
      case 'distress': {
        parts.push(say(GENERIC.distress));
        res.emote = 'heart'; res.mood = 'worried'; res.importance = 3; res.memory = SUMMARY.distress;
        res.affinity = 0;
        res.private = true;
        break;
      }
      case 'rude': {
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
        } else if (q && intent.answer && isClean(intent.answer) && hangulRatio(intent.answer) >= 0.8) {
          parts.push(say(GENERIC.answerNoun, { a: intent.answer }));
          if (q.fact) {
            const f = render(q.fact, { a: intent.answer }, CASUAL);
            res.facts.push(f);
            res.memory = sum(SUMMARY.answerNoun, { a: intent.answer });
            const h = toHearsay(f);
            if (h) res.gossip.push(slotify(h, village.personas, village.chiefName));
          }
        } else parts.push(say(GENERIC.answerNo));
        res.emote = 'heart'; res.affinity = 1; res.importance = 3;
        break;
      }
      case 'gift': {
        const item = intent.items[0] && intent.items[0].name;
        const gaveToday = mem.day.d === day && mem.day.gift > 0;
        const fav = item ? mem.favors.find((f) => !f.done && f.item && (item.includes(f.item) || f.item.includes(item))) : null;
        if (fav) {
          fav.done = 1;
          parts.push(say(GENERIC.gift.favor, { item }));
          res.gossip.push(OFFLINE_GOSSIP.favorDone);
          res.affinity = 3; res.importance = 4; res.memory = sum('촌장님이 부탁한 {item:을} 가져다줬다', { item });
        } else if (gaveToday) {
          parts.push(say(GENERIC.gift.again)); res.affinity = 0; res.memory = '';
        } else if (item) {
          const liked = (p.likes || []).some((l) => l.includes(item) || item.includes(l.split(' ').pop()));
          parts.push(say(liked ? GENERIC.gift.liked : GENERIC.gift.normal, { item }));
          res.affinity = liked ? 3 : 2; res.importance = 3; res.memory = sum(SUMMARY.giftItem, { item });
          res.gossip.push(render(OFFLINE_GOSSIP.giftItem, { item }, CASUAL));
        } else {
          parts.push(say(GENERIC.gift.none)); res.affinity = 2; res.importance = 3; res.memory = SUMMARY.gift;
          res.gossip.push(OFFLINE_GOSSIP.gift);
        }
        res.emote = 'love'; res.mood = p.group === 'kid' ? 'excited' : 'happy'; res.topics = ['선물'];
        break;
      }
      case 'favor': {
        const open = mem.openFavors();
        const accept = /줄게|할게|도와줄|해 ?줄|맡겨|좋아|그래|알겠|오케이/.test(intent.text) && !/[?？]/.test(intent.text);
        if (open.length && accept) {
          parts.push(say(GENERIC.favorThanks));
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
          parts.push(say(GENERIC.memoryHas, { memo: r.text }));
          const fact = mem.facts[mem.facts.length - 1];
          if (fact && r.mem.kind !== 'fact' && similarity(fact.s, r.mem.s) < 0.7) { const fr = toReminder(fact.s); if (fr) parts.push(say(GENERIC.memoryFact, { fact: fr })); }
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
        if (!tp) { parts.push(say(GENERIC.unknown)); break; }
        const name = refName(village.personas, key, target, village.chiefName);
        const rel = village.relation(key, target);
        const extra = { person: name, plike: (tp.likes || [])[0] || '눈', rel: rel ? rel.label || '이웃' : '이웃' };
        const bucket = !rel ? 'none' : rel.aff >= 60 ? 'high' : rel.aff >= 35 ? 'mid' : 'low';
        parts.push(say(GENERIC.person[bucket], extra));
        const g = village.corpus.pickGossip(key, { day, names: [target], said: mem.said, rng });
        if (g && g.entry.sb && g.entry.sb.includes(target)) { parts.push('그러고 보니 ' + village.corpus.sayGossip(g.entry, g.kn, key, village.personas, level, village.chiefName, rng)); res.used.push(g.entry.i); }
        res.emote = bucket === 'low' ? 'sweat' : 'heart';
        res.memory = sum(SUMMARY.person, { person: tp.short || tp.name });
        break;
      }
      case 'compliment': {
        const again = mem.day.d === day && (mem.day.k.compliment || 0) >= 1;
        parts.push(say(again ? GENERIC.compliment.again : V(GENERIC.compliment)));
        res.emote = again ? 'sweat' : 'love'; res.mood = again ? 'shy' : 'happy'; res.affinity = 2; res.importance = 2;
        if (!again) { res.memory = SUMMARY.compliment; res.gossip.push(OFFLINE_GOSSIP.compliment); }
        break;
      }
      case 'thanks': parts.push(say(V(GENERIC.thanks))); res.emote = 'heart'; res.affinity = 1; res.memory = SUMMARY.thanks; break;
      case 'joke': {
        const laughing = /ㅋㅋ|ㅎㅎ|하하|웃겨|웃기다/.test(intent.text) && !/(해 ?줘|해 ?봐|들려|알려)/.test(intent.text);
        if (laughing) parts.push(say(GENERIC.joke.react));
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
      case 'weather': {
        const W = GENERIC.weather;
        const list = level === CASUAL && p.group === 'elder' ? W.old : W[village.world.weather] || W.snow;
        parts.push(say(list));
        res.emote = village.world.weather === 'clear' ? 'sparkle' : 'cold'; res.memory = SUMMARY.weather; res.topics = ['날씨'];
        break;
      }
      case 'work': parts.push(say(L.work && L.work.length ? L.work : V(GENERIC.work))); res.emote = pickFrom(p.emotes, rng); res.affinity = 1; res.memory = SUMMARY.work; res.topics = res.topics.length ? res.topics : ['일']; break;
      case 'how': {
        if (intent.greet) parts.push(say(L.hi && L.hi.length ? L.hi : V(GENERIC.greeting)));
        parts.push(say(L.how && L.how.length ? L.how : V(GENERIC.how)));
        res.emote = pickFrom(p.emotes, rng); res.affinity = 1; res.memory = SUMMARY.how;
        this.maybeExtra(village, key, c, res, parts, session, intent, 0.45);
        break;
      }
      case 'greeting': {
        const again = mem.last === day && (session.count || 0) > 0;
        parts.push(say(again ? V(GENERIC.again) : L.hi && L.hi.length ? L.hi : V(GENERIC.greeting)));
        res.emote = 'wave'; res.affinity = 1; res.memory = again ? '' : SUMMARY.greeting;
        this.maybeExtra(village, key, c, res, parts, session, intent, 0.6);
        break;
      }
      default: {
        // unknown: talk about the topic if there is one, else keep the chat going
        const tp = intent.topics[0];
        const line = village.corpus.pickLine(key, { day, topics: intent.topics, said: mem.said, rng, needTopic: true });
        if (line) { parts.push(village.corpus.sayLine(line, key, village.personas, level, village.chiefName)); res.used.push(line.i); }
        else if (tp) {
          const liked = (p.likes || []).some((l) => l.includes(tp)) || (p.lines.work || []).some((l) => l.includes(tp));
          parts.push(say(liked ? GENERIC.topicLike : GENERIC.topicGeneric, { topic: tp }));
          const g = village.corpus.pickGossip(key, { day, topics: [tp], said: mem.said, rng });
          if (g && g.entry.tp.includes(tp)) { parts.push(village.corpus.sayGossip(g.entry, g.kn, key, village.personas, level, village.chiefName, rng)); res.used.push(g.entry.i); }
          res.memory = render(SUMMARY.topic, { topic: tp }, CASUAL);
        } else {
          parts.push(say(GENERIC.unknown));
          this.maybeExtra(village, key, c, res, parts, session, intent, 0.5);
        }
        res.emote = res.emote || pickFrom(p.emotes, rng);
      }
    }
    // a little personality: an interjection now and then
    if (p.interj && p.interj.length && parts.length && rng() < 0.22 && !p.interj.some((i) => parts[0].startsWith(i.replace(/~$/, '')))) {
      const ij = pickFrom(p.interj, rng);
      if (!/[~…]$/.test(ij)) parts[0] = ij + ', ' + parts[0]; else parts[0] = ij + ' ' + parts[0];
    }
    res.reply = parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
    if (!res.emote) res.emote = MOOD_EMOTE[mem.mood] || 'heart';
    if (res.memory && !isPlainForm(res.memory)) res.memory = '';
    return res;
  }

  /** after small talk: maybe a learned line, a rumour, a memory, or a question back */
  maybeExtra(village, key, c, res, parts, session, intent, chance) {
    const { mem, rng, level, p } = c;
    const day = village.day;
    if (rng() > chance) return;
    const roll = rng();
    if (roll < 0.3) {
      const line = village.corpus.pickLine(key, { day, topics: intent.topics, said: mem.said, rng });
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
    if (p.group === 'toddler') return [{ text: say(GENERIC.toddler), emote: 'laugh', used: [] }];
    const out = [];
    const again = mem.last === day && mem.talks > 0;
    out.push({ text: say(again ? this.variant(GENERIC.again, p, level) : L.hi && L.hi.length ? L.hi : this.variant(GENERIC.greeting, p, level)), emote: 'wave', used: [] });
    const open = mem.openFavors();
    const g = village.corpus.pickGossip(key, { day, said: mem.said, rng, minFresh: 0.1 });
    const line = village.corpus.pickLine(key, { day, said: mem.said, rng });
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

  /** "I need to get back to work" (AI budget used up) */
  busy(village, key, rng = Math.random) {
    const c = this.ctx(village, key, rng, {});
    const L = c.p.lines || {};
    return { reply: c.say(L.busy && L.busy.length ? L.busy : GENERIC.busy), emote: 'sweat' };
  }
}
