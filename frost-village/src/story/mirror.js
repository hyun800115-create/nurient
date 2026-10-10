// StoryMirror — the synchronous face of the story for code that cannot wait for the worker: the chat bridge
// (src/chat/storyBridge.js duck-types exactly this: newspaper(), diary(id, day), relationship(a, b),
// clock.day, weather.today.kind, on('talk', fn)), the person card and the HUD. Filled by the core's 'mirror'
// messages; ids are story ids (sid). Plain data, no Phaser.

const STAGES = ['stranger', 'acquaintance', 'friend', 'best friend', 'sweetheart', 'engaged', 'spouse'];

export class StoryMirror {
  constructor() {
    this.clock = { day: 0, minute: 0, dow: 0 };
    this.weather = { today: { kind: 'snow', temp: -5 } };
    this.now = 0;
    this.stats = {};
    this.rel = new Map();          // 'a:b' -> [stage, affinity, family]
    this.diaries = Object.create(null);
    this.cards = Object.create(null);
    this.cardAt = Object.create(null);
    this.paper = null;             // { day, ko, en }
    this.names = Object.create(null);
    this.lang = 'ko';
    this.listeners = Object.create(null);
  }

  /** apply a core 'mirror' message */
  apply(m) {
    if (m.clock) this.clock = m.clock;
    if (m.weather) this.weather = { today: m.weather };
    if (Number.isFinite(m.now)) this.now = m.now;
    if (m.stats) this.stats = m.stats;
    if (m.rel) { this.rel.clear(); for (const [a, b, st, aff, fam] of m.rel) this.rel.set(a < b ? a + ':' + b : b + ':' + a, [st, aff, fam]); }
    if (m.diaries) Object.assign(this.diaries, m.diaries);
    if (m.cards) for (const id in m.cards) { this.cards[id] = m.cards[id]; this.cardAt[id] = this.now; if (m.cards[id] && m.cards[id].name) this.names[id + ':' + this.lang] = m.cards[id].name; }
    if (m.paper) this.paper = m.paper;
  }

  // ---------------------------------------------------------------- the StoryBridge surface
  newspaper(lang = this.lang) { const p = this.paper; return p ? (lang === 'en' ? p.en : p.ko) : null; }
  diary(id, day, lang = this.lang) { const d = this.diaries[id]; if (!d || (day !== undefined && d.day !== day)) return []; return (lang === 'en' ? d.en : d.ko) || []; }
  relationship(a, b) {
    const r = this.rel.get(a < b ? a + ':' + b : b + ':' + a);
    if (!r) return { stage: 'stranger', familiarity: 0, affinity: 0, romance: 0 };
    return { stage: STAGES[r[0]] || 'stranger', affinity: r[1], family: !!r[2] };
  }
  name(id, lang = this.lang) { const c = this.cards[id]; return (c && c.name) || this.names[id + ':' + lang] || ''; }
  card(id) { return this.cards[id] || null; }

  // ---------------------------------------------------------------- talk listeners (the chat bridge decorates talks first)
  on(name, fn) { (this.listeners[name] || (this.listeners[name] = [])).push(fn); return this; }
  off(name, fn) { const l = this.listeners[name]; if (l) { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); } return this; }
  emit(name, ev) { const l = this.listeners[name]; if (l) for (const fn of l) { try { fn(ev); } catch (e) { /* a listener never breaks the story */ } } }
}
