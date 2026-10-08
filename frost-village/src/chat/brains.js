// AI brains for resident chat.
//
// ChatBrain interface (OfflineBrain in offline.js has the same idea, synchronous):
//   brain.id           'sample' | 'server' | 'offline'
//   brain.available()  can it be asked right now?
//   brain.reply(prompt, { signal, onPartial(text) }) -> Promise<{ data, partial, truncated }>
//       prompt  = buildPrompt(...) result ({ turns })
//       data    = the parsed JSON object the model wrote (validated later by sanitizeResult)
//       partial = the reply text that was shown while streaming
//   On failure it rejects with a ChatError { code, action, partial, raw }.
//
// SampleBrain — the claude.ai artifact "sample" capability (the viewer's own Claude usage):
//   * one JSON object per reply via sample.json (the platform parses tolerantly and rejects
//     invalid_json with the raw text), "reply" written FIRST so it can be shown while it streams:
//     onText gives the raw JSON so far and extractPartialReply() pulls out the reply string;
//   * modelTier "quick" (snappy small talk), cache:false (every chat turn must be a new answer);
//   * one new AbortController per call (the caller owns it) and a Stop button;
//   * called only from a viewer action (Send / chip), never from a loop or timer — ChatEngine
//     enforces one call in flight, a cooldown and a per-session budget.
// ServerBrain — stub for a store release: POSTs the same turns to a developer-run proxy that holds
//   the Claude API key (never in the client) and returns the same JSON object.

import { extractPartialReply, parseJsonLoose, isSpeech, cleanSpoken, capLine } from './sanitize.js';

/** what the page does about each sample error code (sample.d.ts SampleErrorCode) */
export const ACTION = {
  cancelled: 'cancel',
  not_granted: 'offline', sampling_disabled: 'offline', not_declared: 'offline', capability_disabled: 'offline', capability_removed: 'offline',
  images_unavailable: 'offline', tools_unavailable: 'offline',
  rate_limited: 'wait',
  session_expired: 'relogin',
  image_rejected: 'fallback', refused: 'fallback', empty_completion: 'fallback', invalid_json: 'fallback',
  upstream_error: 'retry',
  invalid_request: 'bug', transform_error: 'bug', queue_overflow: 'bug', prompt_too_large: 'shrink',
};

export class ChatError {
  constructor(code, partial, raw, message) {
    this.code = ACTION[code] ? code : 'upstream_error';
    this.action = ACTION[this.code];
    this.partial = partial || '';
    this.raw = raw || '';
    this.message = message || '';
  }
}

/** turn whatever a sample call rejected with into a ChatError (unknown codes = upstream_error) */
export function classify(e, shown) {
  if (e instanceof ChatError) return e;
  const code = e && typeof e === 'object' && typeof e.code === 'string' ? e.code : 'upstream_error';
  const text = e && typeof e.text === 'string' ? e.text : '';
  // e.text is the raw JSON so far: keep only the reply part we may show
  const partial = code === 'refused' ? '' : extractPartialReply(text) || (code === 'invalid_json' ? '' : shown || '');
  return new ChatError(code, partial, text, e && e.message);
}

/**
 * the reply from a broken / non-JSON answer, when it can be trusted: a complete "reply" string, or
 * a short plain Korean line (the model ignored the format). '' otherwise.
 */
export function salvageReply(raw) {
  const s = String(raw || '');
  const m = s.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (m) { try { const t = JSON.parse('"' + m[1] + '"'); if (isSpeech(t, { max: 160 })) return capLine(cleanSpoken(t), 140); } catch (e) { /* no */ } }
  if (!/[{}[\]"]/.test(s)) { const t = capLine(cleanSpoken(s), 140); if (isSpeech(t, { max: 160 })) return t; }
  return '';
}

export class SampleBrain {
  /** sample: the function resolved by `await claude.use("sample")` */
  constructor(sample, { tier = 'quick' } = {}) {
    this.id = 'sample';
    this.sample = sample;
    this.tier = tier;
    this.useJson = !!(sample && typeof sample.json === 'function');
  }

  available() { return typeof this.sample === 'function'; }

  async reply(prompt, { signal, onPartial } = {}) {
    let shown = '';
    let raw = '';
    const onText = ({ text }) => {
      raw = text;
      const r = extractPartialReply(text);
      if (r && r !== shown) { shown = r; if (onPartial) onPartial(r); }
    };
    const opts = { modelTier: this.tier, cache: false, onText };
    if (signal) opts.signal = signal;
    try {
      if (this.useJson) {
        try {
          const data = await this.sample.json(prompt.turns, opts);
          return { data, partial: shown, truncated: false };
        } catch (e) {
          // an older viewer without sample.json: nothing was sent, so ask once with plain sample()
          if (e && e.code === 'capability_removed') { this.useJson = false; shown = ''; }
          else throw e;
        }
      }
      const r = await this.sample(prompt.turns, opts);
      const data = parseJsonLoose(r && r.text);
      if (data === undefined || data === null || typeof data !== 'object') throw { code: 'invalid_json', text: r ? r.text : '' };
      return { data, partial: shown, truncated: !!(r && r.truncated) };
    } catch (e) {
      throw classify(e, shown || extractPartialReply(raw));
    }
  }
}

/**
 * ServerBrain (future store release, not used by the lab): a developer-run proxy holds the API key
 * and calls Claude; the client only sends the prompt turns. Expected proxy contract:
 *   POST endpoint  { v, resident, turns: [{role, content}], tier: 'quick' }
 *   200 -> the JSON object (same shape as the sample reply) · 429 -> { code: 'rate_limited' }
 *   4xx/5xx -> { code } with a sample-style code; the proxy also does moderation and per-player quotas.
 */
export class ServerBrain {
  constructor({ endpoint = '', headers = {}, fetchImpl = typeof fetch === 'function' ? fetch : null, promptVersion = 3 } = {}) {
    this.id = 'server';
    this.endpoint = endpoint;
    this.headers = headers;
    this.fetch = fetchImpl;
    this.v = promptVersion;
  }

  available() { return !!(this.endpoint && this.fetch); }

  async reply(prompt, { signal, resident } = {}) {
    if (!this.available()) throw new ChatError('capability_disabled');
    let res;
    try {
      res = await this.fetch(this.endpoint, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, this.headers), body: JSON.stringify({ v: this.v, resident, turns: prompt.turns, tier: 'quick' }), signal });
    } catch (e) {
      throw new ChatError(e && e.name === 'AbortError' ? 'cancelled' : 'upstream_error');
    }
    let body = null;
    try { body = await res.json(); } catch (e) { /* none */ }
    if (!res.ok) throw new ChatError(res.status === 429 ? 'rate_limited' : (body && body.code) || 'upstream_error');
    if (!body || typeof body !== 'object') throw new ChatError('invalid_json');
    return { data: body, partial: '', truncated: false };
  }
}
