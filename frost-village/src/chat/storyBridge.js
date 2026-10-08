// StoryBridge: connects resident chat to the story-network engine (tools/story) without either
// depending on the other's internals. Everything is duck-typed and wrapped in try/catch, because
// the story engine's API is still moving.
//
//   const bridge = new StoryBridge(story, village, { idOf: (chatKey) => storyId, keyOf: (storyId) => chatKey });
//   bridge.syncWorld();                 // today's newspaper headline + weather -> chat world context
//   bridge.syncMemories('npc_aunt');    // the resident's diary lines (plain form) -> chat memories
//   story.on('talk', (t) => bridge.decorateTalk(t));   // learned gossip travels in resident talks
//   bridge.lineFor(speakerKey, listenerKey)             // what the story dialogue generator can ask for
//
// Story engine calls used (all optional): story.newspaper(), story.diary(id, day), story.clock.day,
// story.weather.kind, story.relationship(a, b), story.on('talk', fn).

import { levelize, CASUAL, POLITE, isPlainForm } from './ko.js';

export class StoryBridge {
  constructor(story, village, { idOf = null, keyOf = null } = {}) {
    this.story = story;
    this.village = village;
    this.idOf = idOf || ((k) => k);
    this.keyOf = keyOf || ((id) => id);
    this.synced = Object.create(null);
  }

  call(fn) { try { return fn(); } catch (e) { return undefined; } }

  /** the newspaper headline and weather from the story engine -> chat world context */
  syncWorld() {
    const s = this.story;
    const paper = this.call(() => s.newspaper());
    const w = {};
    if (paper && typeof paper === 'object') {
      const news = [paper.headline, paper.lead].filter((x) => typeof x === 'string' && x).map((x) => x.slice(0, 80));
      if (news.length) w.news = news.slice(0, 2);
    }
    const day = this.call(() => s.clock.day);
    if (Number.isFinite(day)) w.day = day;
    const wk = this.call(() => s.weather.kind);
    if (typeof wk === 'string') w.weather = wk;
    this.village.setWorld(w);
    return w;
  }

  /**
   * the resident's diary lines for the last day become low-importance chat memories ("본 일 / 한 일"),
   * once per game day. Returns how many were added.
   */
  syncMemories(key, day) {
    const id = this.idOf(key);
    if (id == null) return 0;
    const d = Number.isFinite(day) ? day : this.call(() => this.story.clock.day);
    if (!Number.isFinite(d) || this.synced[key] === d) return 0;
    this.synced[key] = d;
    const lines = this.call(() => this.story.diary(id, d - 1)) || [];
    const mem = this.village.mem(key);
    let n = 0;
    for (const raw of lines.slice(0, 3)) {
      const s = String(raw || '').replace(/[.!]+$/, '');
      if (!isPlainForm(s) || s.length > 60) continue;
      if (/오늘도 무사히|별일 없/.test(s)) continue;
      if (mem.add({ d: Math.max(0, d - 1), k: 'saw', s, tp: [], f: 0, m: 1, src: 's' })) n++;
    }
    return n;
  }

  /**
   * a talk between two residents (story 'talk' event): if the speaker knows a fresh learned rumour
   * the listener has not heard, one line is swapped for it and the listener learns it — this is how
   * the chief's chats travel through the village in the game. Returns true when a line changed.
   */
  decorateTalk(talk, { chance = 0.35, rng = Math.random } = {}) {
    if (!talk || !Array.isArray(talk.lines) || !talk.lines.length || talk.chief) return false;
    if (rng() > chance) return false;
    const v = this.village;
    const a = this.keyOf(talk.a), b = this.keyOf(talk.b);
    if (!a || !b || !v.personas[a] || !v.personas[b]) return false;
    const g = v.corpus.pickGossip(a, { day: v.day, said: v.mem(a).said, rng, minFresh: 0.15 });
    if (!g || v.corpus.knower(g.entry, b)) return false;
    const line = this.lineFor(a, b, g);
    if (!line) return false;
    const idx = talk.lines.findIndex((l) => l.who === talk.a && /^(rumor|small|chat|greet)/.test(String(l.rule || l.topic || '')));
    const at = idx >= 0 ? idx : talk.lines.findIndex((l) => l.who === talk.a);
    if (at < 0) return false;
    talk.lines[at] = Object.assign({}, talk.lines[at], { text: line, emote: 'emote_exclaim', rule: 'chat.corpus', corpus: g.entry.i });
    v.corpus.learn(g.entry.i, b, a, v.day);
    v.corpus.use(g.entry);
    v.bond(a, b, 1);
    return true;
  }

  /** a learned rumour `speaker` could tell `listener` (resident to resident), or '' */
  lineFor(speaker, listener, picked) {
    const v = this.village;
    const g = picked || v.corpus.pickGossip(speaker, { day: v.day, said: v.mem(speaker).said });
    if (!g) return '';
    const rel = this.call(() => this.story.relationship(this.idOf(speaker), this.idOf(listener)));
    const sp = v.personas[speaker], ls = v.personas[listener];
    // between residents: casual among kids / friends, polite from younger to older
    const young = (p) => (p.group === 'kid' || p.group === 'toddler' ? 0 : p.group === 'teen' ? 1 : p.group === 'elder' ? 3 : 2);
    const close = (rel && (rel.stage === 'friend' || rel.stage === 'best friend' || rel.family)) || (v.relation(speaker, listener) || { aff: 0 }).aff >= 55;
    const level = close || young(sp) >= young(ls) ? CASUAL : POLITE;
    return levelize(v.corpus.sayGossip(g.entry, g.kn, speaker, v.personas, level, v.chiefName), level);
  }
}
