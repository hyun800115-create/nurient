// The dialogue grammars compile, every Korean rule has an English counterpart (or a fallback), and
// lines never leak markup. A long run produces many distinct lines and no unrealised beats.
import test from 'node:test';
import assert from 'node:assert/strict';
import KO from '../../../../src/story/engine/lang/ko/index.js';
import EN from '../../../../src/story/engine/lang/en/index.js';
import { Grammar } from '../../../../src/story/engine/lang/grammar.js';
import { createStory } from '../../../../src/story/engine/index.js';

test('both grammars compile and are large', () => {
  const ko = new Grammar(KO, 'ko'), en = new Grammar(EN, 'en');
  assert.ok(ko.stats().alternatives > 2000, 'ko templates ' + ko.stats().alternatives);
  assert.ok(en.stats().alternatives > 1500, 'en templates ' + en.stats().alternatives);
});

test('every Korean rule resolves in English', () => {
  const s = createStory({ seed: 1, population: 40, textMode: 'all' });
  const g = s.dialogue.grammar('en');
  const KO_ONLY = new Set(['rpt', 'dae', 'eo', 'ne', 'ji', 'jana', 'geodeun', 'gun', 'deora', 'ya']);   // Korean verb endings
  const missing = Object.keys(KO).filter((k) => !KO_ONLY.has(k) && !s.dialogue.resolveRule(g, k));
  assert.deepEqual(missing, [], 'no English for: ' + missing.join(', '));
});

for (const lang of ['ko', 'en']) {
  test(`${lang}: a week of talk has no misses and no leaked markup`, () => {
    const s = createStory({ seed: 19, population: 200, lang, textMode: 'all' });
    const uniq = new Set();
    let n = 0;
    s.on('talk', (t) => {
      for (const l of t.lines || []) {
        n++; uniq.add(l.text);
        assert.ok(l.text && l.text !== '…', `empty line for rule ${l.rule}`);
        assert.ok(!/[#{}\[\]<>|]|undefined|NaN|null/.test(l.text), `markup leaked: ${l.text} (${l.rule})`);
        if (lang === 'ko') assert.ok(!/(를을|을를|는은|은는|가이)(?![가-힣])/.test(l.text), 'double particle: ' + l.text);
      }
    });
    s.runDays(7);
    assert.equal(s.dialogue.stats.misses, 0, JSON.stringify(s.dialogue.stats.missRules));
    assert.ok(n > 20000 && uniq.size > 6000, `${uniq.size} distinct of ${n}`);
    const paper = s.newspaper(lang);
    assert.ok(paper && paper.headline && paper.sidebar.length >= 2);
    const d = s.diary(s.alive[3].id, s.clock.day - 1, lang);
    assert.ok(d.length >= 2);
  });
}
