// A fake of the claude.ai `sample` capability (sample.d.ts) for tests: same call shape, streaming
// (onText with cumulative text + delta, never synchronous), AbortSignal handling, every error code,
// refusals that withdraw the partial text, slow replies, and sample.json's tolerant parsing.
//
//   const sample = makeFakeSample({ script: [{ reply: { reply: '안녕하세요!', emote: 'wave' } }] });
//   const sample = makeFakeSample({ script: (input, n) => ({ error: { code: 'rate_limited' } }) });
//
// A step: { reply: object (sent as JSON text) | text: raw string, chunks: 4, delayMs: 5,
//           firstDelayMs: 0, error: { code, afterChunks: 0, text }, truncated: false }

const sleep = (ms, signal) => new Promise((res, rej) => {
  if (signal && signal.aborted) { rej(new Error('aborted')); return; }
  if (!(ms > 0)) { queueMicrotask(res); return; }          // still async, just no timer
  const t = setTimeout(res, ms);
  if (signal) signal.addEventListener('abort', () => { clearTimeout(t); rej(new Error('aborted')); }, { once: true });
});

function parseLoose(text) {
  const s = String(text || '').trim();
  try { return { ok: true, v: JSON.parse(s) }; } catch (e) { /* next */ }
  const f = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (f) { try { return { ok: true, v: JSON.parse(f[1]) }; } catch (e) { /* next */ } }
  const a = Math.min(...['{', '['].map((c) => { const i = s.indexOf(c); return i < 0 ? 1e9 : i; }));
  const b = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (a < 1e9 && b > a) { try { return { ok: true, v: JSON.parse(s.slice(a, b + 1)) }; } catch (e) { /* next */ } }
  return { ok: false };
}

export function makeFakeSample({ script = [], defaultStep = null } = {}) {
  const calls = [];
  let n = 0;

  async function run(input, options, asJson) {
    const call = { input: Array.isArray(input) ? input.map((t) => Object.assign({}, t)) : input, options: Object.assign({}, options), json: asJson };
    calls.push(call);
    await Promise.resolve();                       // the request "leaves" on the next microtask
    // ---- validation (invalid_request)
    if (options !== undefined && (options === null || typeof options !== 'object' || Array.isArray(options) || Object.getPrototypeOf(options) !== Object.prototype)) throw { code: 'invalid_request', message: 'options must be a plain object' };
    const o = options || {};
    if (typeof input !== 'string') {
      if (!Array.isArray(input) || !input.length) throw { code: 'invalid_request', message: 'input must be a string or a non-empty turn list' };
      if (input[0].role !== 'user' || input[input.length - 1].role !== 'user') throw { code: 'invalid_request', message: 'turns must start and end with a user turn' };
      for (const t of input) if (!t || (t.role !== 'user' && t.role !== 'assistant') || typeof t.content !== 'string' || !t.content) throw { code: 'invalid_request', message: 'bad turn' };
    } else if (!input) throw { code: 'invalid_request', message: 'empty input' };
    if (o.signal !== undefined && !(o.signal instanceof AbortSignal)) throw { code: 'invalid_request', message: 'signal must be an AbortSignal' };
    if (o.onText !== undefined && typeof o.onText !== 'function') throw { code: 'invalid_request', message: 'onText must be a function' };
    if (o.modelTier !== undefined && !['default', 'complex', 'quick'].includes(o.modelTier)) throw { code: 'invalid_request', message: 'unknown modelTier' };
    if (o.cache !== undefined && o.cache !== true && o.cache !== false && (typeof o.cache !== 'object' || o.cache === null)) throw { code: 'invalid_request', message: 'bad cache' };
    const bytes = new TextEncoder().encode(typeof input === 'string' ? input : input.map((t) => t.content).join('')).length;
    if (bytes > 262144) throw { code: 'prompt_too_large', message: 'too large' };
    if (o.signal && o.signal.aborted) throw { code: 'cancelled', message: 'aborted before send' };

    const step = (typeof script === 'function' ? script(input, n) : script[n]) || defaultStep || { reply: { reply: '네~' } };
    n++;
    call.step = step;
    const full = step.text !== undefined ? String(step.text) : step.reply !== undefined ? JSON.stringify(step.reply) : '';
    const chunks = Math.max(1, step.chunks || 4);
    const size = Math.ceil(full.length / chunks);
    let sofar = '';
    const signal = o.signal;
    try {
      await sleep(step.firstDelayMs || 0, signal);
      const err = step.error;
      for (let i = 0; i < chunks; i++) {
        if (err && (err.afterChunks || 0) <= i) break;
        const delta = full.slice(i * size, (i + 1) * size);
        if (!delta) break;
        sofar += delta;
        if (o.onText) { try { o.onText({ text: sofar, delta }); } catch (e) { /* reported to console by the platform */ } }
        if (signal && signal.aborted) throw new Error('aborted');
        await sleep(step.delayMs || 0, signal);
      }
      if (err) {
        const e = { code: err.code, message: 'fake ' + err.code };
        if (err.code !== 'refused') { const t = err.text !== undefined ? err.text : sofar; if (t) e.text = t; }
        throw e;
      }
    } catch (e) {
      if (e instanceof Error && e.message === 'aborted') { const r = { code: 'cancelled', message: 'aborted' }; if (sofar) r.text = sofar; throw r; }
      throw e;
    }
    if (!full.trim()) throw { code: 'empty_completion', message: 'no text' };
    if (asJson) {
      const p = parseLoose(full);
      if (!p.ok || step.truncated) throw { code: 'invalid_json', message: 'no JSON value', text: full };
      return p.v;
    }
    return { text: full, truncated: !!step.truncated, modelTierApplied: o.modelTier || 'default' };
  }

  const sample = (input, options) => run(input, options, false);
  sample.json = (input, options) => run(input, options, true);
  sample.limits = async () => ({ maxPromptBytes: 262144 });
  sample.calls = calls;
  return sample;
}

/** a ready-made AI answer for a resident (what a well-behaved model would write) */
export function fakeReply(over = {}) {
  return Object.assign({
    reply: '어머나, 촌장님! 생선을 열 마리나 잡으셨다고요? 대단해요~',
    emote: 'heart', mood: 'happy', affinity: 1,
    memory: '촌장님이 생선을 열 마리 잡았다고 자랑했다',
    facts: ['촌장님은 생선구이를 좋아한다'], importance: 3, topics: ['생선'],
    gossip: ['촌장님이 오늘 생선을 열 마리나 잡았대'],
    lines: ['촌장님, 오늘도 생선 많이 잡았어요?'], favor: null,
  }, over);
}
