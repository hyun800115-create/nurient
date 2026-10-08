// Same seed -> the same town, the same conversations, the same save; another seed -> another story.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStory } from '../index.js';

function run(seed, days, lang = 'ko') {
  const s = createStory({ seed, population: 120, lang, textMode: 'all' });
  const lines = [];
  s.on('talk', (t) => { if (t.lines) for (const l of t.lines) lines.push(l.who + ':' + l.text); });
  s.runDays(days);
  return { s, lines };
}

test('the same seed gives identical talk and an identical save', () => {
  const a = run(42, 3), b = run(42, 3);
  assert.ok(a.lines.length > 500);
  assert.deepEqual(a.lines, b.lines);
  assert.equal(a.s.serialize(), b.s.serialize());
});

test('a different seed tells a different story', () => {
  const a = run(1, 2), b = run(2, 2);
  assert.notDeepEqual(a.lines.slice(0, 50), b.lines.slice(0, 50));
});

// the simulated state, without the configuration (language, text mode) and the dialogue counters
function stateOf(s) { s.cfg.textMode = 'none'; s.cfg.lang = 'ko'; return s.serialize(); }

test('text mode does not change the simulation (text is only rendering)', () => {
  const a = createStory({ seed: 9, population: 120, textMode: 'all' });
  const b = createStory({ seed: 9, population: 120, textMode: 'none' });
  a.runDays(2); b.runDays(2);
  assert.equal(stateOf(a), stateOf(b));
});

test('English and Korean runs simulate the same town', () => {
  const ko = createStory({ seed: 5, population: 100, lang: 'ko', textMode: 'all' });
  const en = createStory({ seed: 5, population: 100, lang: 'en', textMode: 'all' });
  ko.runDays(2); en.runDays(2);
  assert.equal(stateOf(ko), stateOf(en));
});
