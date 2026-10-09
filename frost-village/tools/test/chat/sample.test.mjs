// SampleBrain + ChatEngine against a fake of the claude.ai `sample` capability (fake_sample.mjs):
// successful JSON replies, streaming, every error code, refusals, slow replies and aborts, and the
// politeness rules (quick tier, cache:false, one call in flight, cooldown, budgets, never on open).
//
//   node --test tools/test/chat/*.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { ChatVillage } from '../../../src/chat/village.js';
import { ChatEngine } from '../../../src/chat/engine.js';
import { SampleBrain, ServerBrain, ACTION, classify, salvageReply } from '../../../src/chat/brains.js';
import { LAB_RESIDENTS } from '../../../src/chat/personas.js';
import { makeFakeSample, fakeReply } from './fake_sample.mjs';

const KEY = 'npc_aunt';
function setup(script, opts = {}) {
  const village = new ChatVillage({ roster: LAB_RESIDENTS, seed: 4 });
  const sample = makeFakeSample({ script });
  let t = 1e6;
  const engine = new ChatEngine({ village, sample, opts: Object.assign({ cooldownMs: 0 }, opts), now: () => t });
  return { village, sample, engine, tick: (ms) => { t += ms; } };
}

test('a good JSON reply is shown, remembered and becomes village material', async () => {
  const { village, sample, engine } = setup([{ reply: fakeReply(), chunks: 40 }]);
  const partials = [];
  const out = await engine.send(KEY, '나 오늘 생선 열 마리 잡았어!', { onPartial: (p) => partials.push(p) });
  assert.equal(out.ok, true);
  assert.equal(out.source, 'ai');
  assert.match(out.reply, /열 마리/);
  // streamed: the reply grew while the JSON was still arriving, never showing JSON syntax
  assert.ok(partials.length >= 2, 'several partial updates');
  for (const p of partials) assert.doesNotMatch(p, /[{}"]/);
  assert.ok(out.reply.startsWith(partials[0]));
  // the call followed the contract
  assert.equal(sample.calls.length, 1);
  const c = sample.calls[0];
  assert.equal(c.json, true, 'sample.json used');
  assert.equal(c.options.modelTier, 'quick');
  assert.equal(c.options.cache, false);
  assert.equal(c.input[0].role, 'user');
  assert.equal(c.input[c.input.length - 1].role, 'user');
  assert.match(c.input[c.input.length - 1].content, /<촌장님_말>나 오늘 생선 열 마리 잡았어!<\/촌장님_말>/);
  // memory, facts, affinity, corpus
  const mem = village.mem(KEY);
  assert.ok(mem.ep.some((e) => /생선/.test(e.s) && e.ai === 1));
  assert.ok(mem.facts.some((f) => /생선구이/.test(f.s)));
  assert.equal(out.affinity.delta, 1);
  assert.equal(out.gossip.length, 1);
  assert.match(out.gossip[0].text, /촌장님이 오늘 생선을 열 마리나 잡았대/);
  assert.ok(village.corpus.e.some((x) => x.k === 'l' && x.o === KEY), 'a reusable line was learned');
  assert.equal(mem.ai, 1);
});

test('open() never calls the AI; offline mode never calls it either', async () => {
  const { sample, engine } = setup([{ reply: fakeReply() }]);
  engine.open(KEY);
  assert.equal(sample.calls.length, 0);
  engine.setForcedOffline(true);
  const out = await engine.send(KEY, '안녕하세요!');
  assert.equal(out.source, 'offline');
  assert.equal(sample.calls.length, 0);
});

test('without sample.json (older viewer) the plain call is parsed tolerantly', async () => {
  const village = new ChatVillage({ roster: LAB_RESIDENTS, seed: 4 });
  const fake = makeFakeSample({ script: [{ text: '여기 있어요:\n```json\n' + JSON.stringify(fakeReply({ reply: '안녕하세요, 촌장님!' })) + '\n```' }] });
  const plain = (i, o) => fake(i, o);              // a namespace without .json
  const engine = new ChatEngine({ village, sample: plain, opts: { cooldownMs: 0 } });
  const out = await engine.send(KEY, '안녕!');
  assert.equal(out.source, 'ai');
  assert.equal(out.reply, '안녕하세요, 촌장님!');
});

test('capability_removed on json falls back to one plain call', async () => {
  let n = 0;
  const fake = makeFakeSample({ script: [{ reply: fakeReply({ reply: '네, 촌장님!' }) }] });
  const s = (i, o) => fake(i, o);
  s.json = async () => { n++; throw { code: 'capability_removed', message: 'old viewer' }; };
  const engine = new ChatEngine({ village: new ChatVillage({ roster: LAB_RESIDENTS }), sample: s, opts: { cooldownMs: 0 } });
  const out = await engine.send(KEY, '안녕!');
  assert.equal(n, 1);
  assert.equal(out.source, 'ai');
  assert.equal(out.reply, '네, 촌장님!');
});

test('every error code maps to a page action (unknown -> upstream_error)', () => {
  const codes = ['invalid_request', 'prompt_too_large', 'images_unavailable', 'tools_unavailable', 'image_rejected', 'cancelled', 'not_granted', 'session_expired', 'sampling_disabled', 'not_declared', 'rate_limited', 'refused', 'empty_completion', 'invalid_json', 'upstream_error', 'capability_disabled', 'capability_removed', 'transform_error', 'queue_overflow'];
  for (const c of codes) assert.ok(ACTION[c], c);
  assert.equal(classify({ code: 'brand_new_code' }).code, 'upstream_error');
  assert.equal(classify('a string').code, 'upstream_error');
  assert.equal(classify({ code: 'refused', text: '{"reply":"반쯤' }).partial, '', 'refused withdraws the partial');
  assert.equal(classify({ code: 'upstream_error', text: '{"reply":"반쯤 쓴 말' }).partial, '반쯤 쓴 말');
});

const ERR = (code, extra = {}) => ({ reply: fakeReply(), chunks: 4, error: Object.assign({ code }, extra) });

for (const code of ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled']) {
  test(code + ': answer offline now and stay offline for the view (no nagging)', async () => {
    const { sample, engine } = setup([ERR(code)]);
    const out = await engine.send(KEY, '안녕하세요!');
    assert.equal(out.ok, true);
    assert.equal(out.source, 'offline');
    assert.equal(out.note, 'offline-switch');
    assert.equal(engine.mode, 'offline');
    await engine.send(KEY, '요즘 어때?');
    assert.equal(sample.calls.length, 1, 'never asked again');
  });
}

test('capability_removed on both json and plain: offline for the view', async () => {
  const s = async () => { throw { code: 'capability_removed', message: 'gone' }; };
  s.json = async () => { throw { code: 'capability_removed', message: 'gone' }; };
  const engine = new ChatEngine({ village: new ChatVillage({ roster: LAB_RESIDENTS }), sample: s, opts: { cooldownMs: 0 } });
  const out = await engine.send(KEY, '안녕!');
  assert.equal(out.note, 'offline-switch');
  assert.equal(engine.mode, 'offline');
});

test('rate_limited: tell the viewer to wait, keep the control, refund the budget', async () => {
  const { sample, engine, village } = setup([ERR('rate_limited'), { reply: fakeReply({ reply: '이제 됐어요!' }) }]);
  const out = await engine.send(KEY, '안녕!');
  assert.equal(out.ok, false);
  assert.equal(out.note, 'wait');
  assert.equal(out.retry, true);
  assert.equal(engine.aiCalls, 0);
  assert.equal(engine.mode, 'ai');
  const logLen = village.mem(KEY).log.length;
  const again = await engine.retry(KEY);
  assert.equal(again.ok, true);
  assert.equal(again.reply, '이제 됐어요!');
  assert.equal(sample.calls.length, 2);
  assert.equal(sample.calls[1].input.at(-1).content.includes('안녕!'), true, 'the same message was resent');
  assert.equal(village.mem(KEY).log.length, logLen + 1, 'the chief line is not logged twice');
});

test('session_expired: ask to sign in again, keep the control', async () => {
  const { engine } = setup([ERR('session_expired')]);
  const out = await engine.send(KEY, '안녕!');
  assert.equal(out.note, 'relogin');
  assert.equal(out.retry, true);
});

test('refused / empty_completion: an in-character line, nothing partial kept, no village material', async () => {
  for (const code of ['refused', 'empty_completion']) {
    const { engine, village } = setup([code === 'refused' ? ERR('refused', { afterChunks: 2 }) : { text: '   ' }]);
    const before = village.corpus.size;
    const out = await engine.send(KEY, '이상한 말');
    assert.equal(out.ok, true, code);
    assert.equal(out.source, 'offline');
    assert.equal(out.note, 'fallback');
    assert.equal(out.error.code, code);
    assert.match(out.reply, /[가-힣]/);
    assert.doesNotMatch(out.reply, /\{|\}|reply/);
    assert.equal(village.corpus.size, before);
  }
});

test('invalid_json: salvage a complete reply string, else fall back', async () => {
  const broken = '{"reply":"헤헤, 촌장님 최고예요!","emote":"heart","mood":';
  const { engine } = setup([{ text: broken }]);
  const out = await engine.send(KEY, '안녕!');
  assert.equal(out.ok, true);
  assert.equal(out.note, 'salvaged');
  assert.equal(out.reply, '헤헤, 촌장님 최고예요!');
  const { engine: e2 } = setup([{ text: 'Sure! Here is a JSON object for you.' }]);
  const o2 = await e2.send(KEY, '안녕!');
  assert.equal(o2.note, 'fallback');
  assert.equal(salvageReply('그냥 한국어 한 줄이에요~'), '그냥 한국어 한 줄이에요~');
  assert.equal(salvageReply('{"oops": 1'), '');
});

test('upstream_error after text streamed: keep the partial, mark it interrupted, offer a manual retry', async () => {
  const { engine, village } = setup([ERR('upstream_error', { afterChunks: 2 }), { reply: fakeReply({ reply: '다시 말할게요!' }) }]);
  const out = await engine.send(KEY, '안녕!');
  assert.equal(out.ok, false);
  assert.equal(out.note, 'retry');
  assert.equal(out.interrupted, true);
  assert.ok(out.partial.length > 0 && !/[{}"]/.test(out.partial));
  assert.ok(village.mem(KEY).log.at(-1)[1].endsWith('…'));
  const again = await engine.retry(KEY);
  assert.equal(again.reply, '다시 말할게요!');
});

test('prompt_too_large: halve the history budget and answer in character', async () => {
  const { engine } = setup([ERR('prompt_too_large')]);
  const before = engine.historyBudget;
  const out = await engine.send(KEY, '안녕!');
  assert.equal(out.ok, true);
  assert.equal(engine.historyBudget, Math.floor(before / 2));
});

test('a slow reply can be stopped: cancelled, partial kept, budget refunded', async () => {
  const { engine } = setup([{ reply: fakeReply(), chunks: 10, delayMs: 40, firstDelayMs: 10 }]);
  const ctl = new AbortController();
  let shown = '';
  const p = engine.send(KEY, '안녕!', { signal: ctl.signal, onPartial: (t) => { shown = t; if (t.length > 6) ctl.abort(); } });
  const out = await p;
  assert.equal(out.ok, false);
  assert.equal(out.note, 'cancelled');
  assert.ok(out.partial.length > 0);
  assert.equal(shown.startsWith(out.partial.slice(0, 3)), true);
  assert.equal(engine.aiCalls, 0);
  assert.equal(engine.busy, false);
});

test('aborted before the request leaves: nothing streamed, cancelled', async () => {
  const { engine } = setup([{ reply: fakeReply(), firstDelayMs: 50 }]);
  const ctl = new AbortController();
  const p = engine.send(KEY, '안녕!', { signal: ctl.signal });
  ctl.abort();
  const out = await p;
  assert.equal(out.note, 'cancelled');
  assert.equal(out.partial, '');
});

test('one call in flight, a cooldown, a session budget and a per-resident streak limit', async () => {
  const { engine, sample, tick } = setup((input, n) => ({ reply: fakeReply({ reply: '네~ ' + n + '번째 대답이에요.', gossip: [], lines: [] }), firstDelayMs: 5 }), { cooldownMs: 1500, sessionBudget: 3, streakBudget: 2 });
  const first = engine.send(KEY, '하나');
  const second = await engine.send(KEY, '둘');
  assert.equal(second.note, 'busy');
  await first;
  const cool = await engine.send(KEY, '셋');
  assert.equal(cool.note, 'cooldown');
  assert.ok(cool.waitMs > 0);
  tick(2000);
  const b = await engine.send(KEY, '넷');
  assert.equal(b.source, 'ai');
  tick(2000);
  // the streak limit for this resident: a "back to work" line, then offline for them
  const tired = await engine.send(KEY, '다섯');
  assert.equal(tired.note, 'tired');
  assert.equal(engine.modeFor(KEY), 'offline');
  tick(2000);
  const other = await engine.send('npc_kid_girl', '안녕!');
  assert.equal(other.source, 'ai');
  tick(2000);
  const over = await engine.send('npc_kid_girl', '또 안녕!');
  assert.equal(over.note, 'budget');
  assert.equal(engine.mode, 'offline');
  assert.equal(sample.calls.length, 3);
});

test('a reply with forbidden or out-of-world content falls back; bad material is dropped', async () => {
  const { engine, village } = setup([
    { reply: fakeReply({ reply: 'As an AI language model, I cannot.' }) },
    { reply: fakeReply({ reply: '좋아요!', gossip: ['촌장님이 1000 코인을 준대', '촌장님이 http://evil.example 에 갔대', '촌장님이 눈사람을 만들었대'], lines: ['저는 AI라서 잘 몰라요'] }) },
  ]);
  const a = await engine.send(KEY, '안녕!');
  assert.equal(a.note, 'fallback');
  const b = await engine.send(KEY, '안녕!');
  assert.equal(b.source, 'ai');
  const texts = village.corpus.e.map((x) => x.t).join(' | ');
  assert.doesNotMatch(texts, /코인|http|AI/);
  assert.match(texts, /눈사람/);
});

test('distress: kind reply, nothing spreads as gossip', async () => {
  const { engine, village } = setup([{ reply: fakeReply({ reply: '촌장님, 많이 힘드셨겠어요. 믿을 수 있는 어른께 꼭 이야기해 보세요.', gossip: ['촌장님이 너무 힘들대'], lines: ['힘내요'] }) }]);
  const out = await engine.send(KEY, '요즘 너무 힘들어 죽겠어');
  assert.equal(out.intent, 'distress');
  assert.equal(out.gossip.length, 0);
  assert.equal(village.corpus.e.filter((x) => x.src === 'a').length, 0);
});

test('ServerBrain stub: same contract through a developer proxy', async () => {
  const village = new ChatVillage({ roster: LAB_RESIDENTS });
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    assert.equal(body.tier, 'quick');
    assert.ok(Array.isArray(body.turns));
    if (body.turns.at(-1).content.includes('많이')) return { ok: false, status: 429, json: async () => ({ code: 'rate_limited' }) };
    return { ok: true, status: 200, json: async () => fakeReply({ reply: '서버에서 왔어요!' }) };
  };
  const server = new ServerBrain({ endpoint: 'https://proxy.example/chat', fetchImpl });
  const engine = new ChatEngine({ village, server, opts: { cooldownMs: 0 } });
  assert.equal(engine.mode, 'ai');
  const out = await engine.send(KEY, '안녕!');
  assert.equal(out.reply, '서버에서 왔어요!');
  const limited = await engine.send(KEY, '많이 보내기');
  assert.equal(limited.note, 'wait');
  assert.equal(new ServerBrain().available(), false);
});

test('SampleBrain passes the caller signal through and never reuses a controller', async () => {
  const fake = makeFakeSample({ script: [{ reply: fakeReply() }, { reply: fakeReply() }] });
  const brain = new SampleBrain(fake);
  const prompt = { turns: [{ role: 'user', content: 'x' }] };
  const c1 = new AbortController(), c2 = new AbortController();
  await brain.reply(prompt, { signal: c1.signal });
  await brain.reply(prompt, { signal: c2.signal });
  assert.equal(fake.calls[0].options.signal, c1.signal);
  assert.equal(fake.calls[1].options.signal, c2.signal);
  assert.notEqual(fake.calls[0].options.signal, fake.calls[1].options.signal);
});
