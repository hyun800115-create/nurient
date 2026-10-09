// ChatEngine: one conversation step at a time. Picks the brain (AI when the viewer's Claude is
// available and the budget allows, otherwise offline), keeps the AI calls polite (one in flight, a
// short cooldown, a soft per-session budget, a per-resident streak limit), validates what comes
// back, and writes the exchange into the village: the resident's memory, affinity (rate limited),
// mood, and the shared VillageCorpus (new gossip + reusable lines).
//
//   const engine = new ChatEngine({ village });
//   engine.setSample(await claude.use('sample'));          // null -> offline only
//   const first = engine.open('npc_aunt');                 // the resident speaks first (no AI call)
//   const out = await engine.send('npc_aunt', '안녕하세요!', { signal, onPartial });
//   const spread = engine.close('npc_aunt');               // "소문이 퍼졌어요" events

import { OfflineBrain } from './offline.js';
import { SampleBrain, ChatError, salvageReply } from './brains.js';
import { buildPrompt, BUDGET } from './prompt.js';
import { sanitizeResult, cleanPlayerText, isClean } from './sanitize.js';
import { detectIntent } from './intent.js';
import { SUMMARY } from './lines.js';
import { toHearsay, render, CASUAL } from './ko.js';
import { slotify } from './sanitize.js';

export const DEFAULTS = {
  cooldownMs: 1800,        // between AI calls
  sessionBudget: 40,       // AI replies per page view
  streakBudget: 12,        // AI replies with one resident per page view
  inputMax: 80,            // characters the chief can type
  tier: 'quick',
};

const OFFLINE_CODES = ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'];

export class ChatEngine {
  constructor({ village, sample = null, server = null, opts = {}, rng = null, now = null } = {}) {
    this.village = village;
    this.opts = Object.assign({}, DEFAULTS, opts);
    this.offline = new OfflineBrain();
    this.ai = null;
    this.server = server;
    this.rng = rng || village.rng || Math.random;
    this.now = now || (() => Date.now());
    this.busy = false;
    this.lastCall = -1e12;
    this.aiCalls = 0;
    this.aiOff = null;           // why AI is off for this view: a sample error code, 'none', 'budget'
    this.forced = false;          // the viewer chose "마을 말투로만"
    this.consentShown = false;
    this.streak = Object.create(null);
    this.sessions = Object.create(null);
    this.historyBudget = BUDGET.history;
    this.created = Object.create(null);   // corpus ids created per resident this view (for spreading)
    if (sample) this.setSample(sample);
  }

  /** the resolved `claude.use("sample")` function, or null when the feature is absent */
  setSample(sample) {
    this.ai = typeof sample === 'function' ? new SampleBrain(sample, { tier: this.opts.tier }) : null;
    if (!this.ai && !this.server) this.aiOff = this.aiOff || 'none';
    else if (this.aiOff === 'none') this.aiOff = null;
  }

  setForcedOffline(v) { this.forced = !!v; }

  get brain() { return this.ai || (this.server && this.server.available() ? this.server : null); }

  /** 'ai' or 'offline' for the next message (with no resident-specific limit) */
  get mode() { return this.brain && !this.forced && !this.aiOff ? 'ai' : 'offline'; }

  status() {
    return { mode: this.mode, reason: this.forced ? 'forced' : this.aiOff || (this.brain ? null : 'none'), used: this.aiCalls, budget: this.opts.sessionBudget, consentNote: this.mode === 'ai' && this.aiCalls === 0 };
  }

  modeFor(key) {
    if (this.mode !== 'ai') return 'offline';
    if ((this.streak[key] || 0) >= this.opts.streakBudget) return 'offline';
    return 'ai';
  }

  session(key) {
    return this.sessions[key] || (this.sessions[key] = { count: 0, expect: null, asked: 0, recentTpl: [], rumors: [], tired: false, lastText: '' });
  }

  /** how long until another AI message may be sent (0 = now) */
  waitMs() { return this.mode === 'ai' ? Math.max(0, this.opts.cooldownMs - (this.now() - this.lastCall)) : 0; }

  // ---------------------------------------------------------------- opening a chat
  open(key) {
    const v = this.village;
    const s = this.session(key);
    const mem = v.mem(key);
    const lines = this.offline.opener(v, key, this.rng, s);
    for (const l of lines) {
      mem.pushLog('r', l.text, l.emote, 'o');
      for (const id of l.used || []) { mem.remember(id); const x = v.corpus.byId(id); if (x) v.corpus.use(x); }
    }
    if (mem.met < 0) mem.met = v.day;
    return lines;
  }

  // ---------------------------------------------------------------- one message
  /**
   * send the chief's message. opts: { signal, onPartial(text), retry (resend the last message
   * after an error; it is already in the log) }. Never throws; returns an outcome:
   * { ok, source, reply, emote, mood, note, error, retry, partial, affinity, stage, gossip, lines, favor, question, memory }
   */
  async send(key, text, opts = {}) {
    const v = this.village;
    const s = this.session(key);
    const mem = v.mem(key);
    const clean = cleanPlayerText(opts.retry ? s.lastText : text, this.opts.inputMax);
    if (!clean) return { ok: false, note: 'empty' };
    if (this.busy) return { ok: false, note: 'busy' };
    if (!opts.retry) { mem.pushLog('p', clean, '', ''); s.lastText = clean; }
    const intent = detectIntent(clean, { personas: v.personas, self: key, expect: s.expect && s.expect.expect });

    let mode = this.modeFor(key);
    // the per-session / per-resident budget ran out: an in-character "back to work" line, then offline
    if (mode === 'ai' && this.aiCalls >= this.opts.sessionBudget) { this.aiOff = 'budget'; return this.finishBusy(key, intent, 'budget'); }
    if (this.mode === 'ai' && (this.streak[key] || 0) >= this.opts.streakBudget && !s.tired) { s.tired = true; return this.finishBusy(key, intent, 'tired'); }
    if (mode === 'ai' && this.waitMs() > 0) {
      if (!opts.retry) { mem.log.pop(); }
      return { ok: false, note: 'cooldown', waitMs: this.waitMs() };
    }

    if (mode !== 'ai') return this.finishOffline(key, intent);

    // ---- AI
    this.busy = true;
    this.lastCall = this.now();
    this.aiCalls++;
    this.streak[key] = (this.streak[key] || 0) + 1;
    const hist = mem.log.slice(0, -1).filter((h) => h[0] === 'p' || h[0] === 'r');
    const prompt = buildPrompt({ key, mem, village: v, level: v.level(key), history: hist, playerText: clean, query: { topics: intent.topics, names: intent.names.map((n) => n.key) }, budget: { history: this.historyBudget } });
    let got;
    try {
      got = await this.brain.reply(prompt, { signal: opts.signal, onPartial: opts.onPartial, resident: key });
    } catch (err) {
      const e = err instanceof ChatError ? err : new ChatError(err && err.code, '', '', '');
      return this.onError(key, intent, e);
    } finally {
      this.busy = false;
    }
    const san = sanitizeResult(got.data, { personas: v.personas, self: key, chiefName: v.chiefName });
    if (!san.ok) {
      // a reply we cannot show: keep the conversation going in character
      return this.finishFallback(key, intent, 'empty_reply');
    }
    const result = san.result;
    // fill what the model left out from the offline reading of the message
    if (!result.memory && SUMMARY[intent.intent]) result.memory = render(SUMMARY[intent.intent], { person: intent.names[0] ? v.personas[intent.names[0].key].short : '', topic: intent.topics[0] || '' }, CASUAL);
    if (!result.topics.length) result.topics = intent.topics.slice();
    if (!result.gossip.length && intent.intent !== 'distress') {
      // the model wrote no rumour: make one from what the chief revealed (a fact, or their own news)
      const src = result.facts[0] || (intent.deed && intent.deed.plain) || '';
      const h = src && isClean(src) ? toHearsay(src) : '';
      if (h) result.gossip.push(slotify(h, v.personas, v.chiefName));
    }
    if (!result.memory && intent.deed) result.memory = intent.deed.plain;
    if (intent.intent === 'distress' || intent.intent === 'rude') { result.gossip = []; result.lines = []; }
    const out = this.apply(key, intent, result, 'a');
    out.ok = true; out.source = 'ai'; out.truncated = !!got.truncated; out.dropped = san.dropped;
    return out;
  }

  /** send the last message again after an error that offered a retry */
  retry(key, opts = {}) { return this.send(key, '', Object.assign({}, opts, { retry: true })); }

  onError(key, intent, e) {
    const mem = this.village.mem(key);
    switch (e.action) {
      case 'cancel':
        this.refund(key);
        if (e.partial) mem.pushLog('r', e.partial + '…', '', 'a');
        return { ok: false, source: 'ai', note: 'cancelled', partial: e.partial, error: { code: e.code } };
      case 'offline': {
        // the viewer declined / Claude is off for this view: never ask again, answer offline now
        this.aiOff = e.code;
        const out = this.finishOffline(key, intent);
        out.note = 'offline-switch'; out.error = { code: e.code };
        return out;
      }
      case 'wait':
        this.refund(key);
        return { ok: false, source: 'ai', note: 'wait', retry: true, error: { code: e.code }, partial: e.partial };
      case 'relogin':
        this.refund(key);
        return { ok: false, source: 'ai', note: 'relogin', retry: true, error: { code: e.code } };
      case 'retry':
        if (e.partial) mem.pushLog('r', e.partial + '…', '', 'a');
        return { ok: false, source: 'ai', note: 'retry', retry: true, partial: e.partial, interrupted: !!e.partial, error: { code: e.code } };
      case 'shrink':
        this.historyBudget = Math.max(200, Math.floor(this.historyBudget / 2));
        return this.finishFallback(key, intent, e.code);
      case 'fallback': {
        if (e.code === 'invalid_json') {
          const t = salvageReply(e.raw);
          if (t) {
            const out = this.apply(key, intent, { reply: t, emote: null, mood: null, affinity: 0, importance: 1, memory: '', facts: [], topics: intent.topics.slice(), gossip: [], lines: [], favor: null }, 'a');
            out.ok = true; out.source = 'ai'; out.note = 'salvaged';
            return out;
          }
        }
        return this.finishFallback(key, intent, e.code);
      }
      default:
        return this.finishFallback(key, intent, e.code);
    }
  }

  refund(key) { this.aiCalls = Math.max(0, this.aiCalls - 1); this.streak[key] = Math.max(0, (this.streak[key] || 1) - 1); this.lastCall = -1e12; }

  finishOffline(key, intent) {
    const s = this.session(key);
    const result = this.offline.reply({ village: this.village, key, intent, session: s, rng: this.rng });
    const out = this.apply(key, intent, result, 'o');
    out.ok = true; out.source = 'offline';
    return out;
  }

  finishFallback(key, intent, code) {
    const r = this.offline.confused(this.village, key, this.rng);
    const out = this.apply(key, intent, { reply: r.reply, emote: r.emote, mood: null, affinity: 0, importance: 1, memory: '', facts: [], topics: [], gossip: [], lines: [], favor: null, private: true }, 'o');
    out.ok = true; out.source = 'offline'; out.note = 'fallback'; out.error = { code };
    return out;
  }

  finishBusy(key, intent, why) {
    const r = this.offline.busy(this.village, key, this.rng);
    const out = this.apply(key, intent, { reply: r.reply, emote: r.emote, mood: null, affinity: 0, importance: 1, memory: '', facts: [], topics: [], gossip: [], lines: [], favor: null }, 'o');
    out.ok = true; out.source = 'offline'; out.note = why;
    return out;
  }

  // ---------------------------------------------------------------- write the exchange into the village
  apply(key, intent, r, src) {
    const v = this.village;
    const mem = v.mem(key);
    const s = this.session(key);
    const day = v.day;
    s.count++;
    mem.talks++;
    if (src === 'a') { mem.ai++; v.stats.ai++; } else v.stats.off++;
    if (mem.met < 0) mem.met = day;
    mem.last = day;
    const kind = intent.intent === 'gift' ? 'gift' : r.favor || intent.intent === 'favor' ? 'favor' : 'chat';
    let episode = null;
    if (r.memory) episode = mem.add({ d: day, k: kind, s: r.memory, tp: r.topics, f: Math.sign(r.affinity || 0) * Math.min(2, Math.abs(r.affinity || 0)), m: r.importance || 1, src: 'd', ai: src === 'a' });
    for (const f of r.facts || []) mem.addFact(f, day);
    let favor = null;
    if (r.favor) favor = mem.addFavor(r.favor.ask, r.favor.item, day);
    if (src === 'a' && intent.intent === 'gift' && intent.items[0]) mem.fulfil(intent.items[0].name);
    const before = mem.aff;
    const delta = mem.feel(r.affinity || 0, intent.intent, day);
    if (r.mood) mem.mood = r.mood;
    // village material
    const gossip = [], lines = [];
    if (!r.private) {
      for (const g of r.gossip || []) {
        const tpl = g.replace(/\{@me(?=[:}])/g, '{@' + key);
        if (!isClean(tpl)) continue;
        const a = v.corpus.add('g', tpl, { o: key, tp: r.topics, md: r.mood || mem.mood, d: day, src });
        if (a) { gossip.push({ id: a.entry.i, dup: a.dup, text: v.corpus.plain(a.entry, v.personas, v.chiefName) }); if (!a.dup) { v.stats.learned++; (this.created[key] || (this.created[key] = [])).push(a.entry.i); } }
      }
      for (const l of r.lines || []) {
        const a = v.corpus.add('l', l, { o: key, tp: r.topics, md: r.mood || mem.mood, d: day, src });
        if (a) { lines.push({ id: a.entry.i, dup: a.dup, text: v.corpus.sayLine(a.entry, key, v.personas, v.level(key), v.chiefName) }); if (!a.dup) v.stats.learned++; }
      }
    }
    for (const id of r.used || []) { mem.remember(id); const x = v.corpus.byId(id); if (x) v.corpus.use(x); }
    // the question the resident asked (offline: we know what answer to expect)
    if (r.question) { s.expect = r.question; s.asked++; if (r.question.i != null && !mem.asked.includes(r.question.i)) mem.asked.push(r.question.i); }
    else if (intent.intent === 'answer' || s.expect) s.expect = null;
    mem.pushLog('r', r.reply, r.emote || '', src);
    return {
      reply: r.reply, emote: r.emote || null, mood: mem.mood,
      affinity: { before, after: mem.aff, delta },
      stage: v.stage(key), memory: episode, facts: r.facts || [], gossip, lines, favor, question: r.question || null, intent: intent.intent,
    };
  }

  /** the chat closes: fresh rumours this resident started travel to a friend right away */
  close(key) {
    const ids = this.created[key] || [];
    this.created[key] = [];
    const s = this.sessions[key];
    if (s) s.expect = null;
    return this.village.spreadFrom(key, ids.slice(-2), 2);
  }
}
