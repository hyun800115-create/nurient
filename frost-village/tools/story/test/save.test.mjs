// Compact save: serialize -> deserialize -> serialize is identical, and a restored town goes on to
// live exactly the same life as the original.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createStory } from '../index.js';

test('round trip is lossless and the restored town continues identically', () => {
  const a = createStory({ seed: 77, population: 150, textMode: 'all' });
  a.runDays(4.4);                         // mid-day, mid-conversation, with incidents and plans in flight
  const s1 = a.serialize();
  const b = createStory({ save: s1, textMode: 'all' });
  assert.equal(b.serialize(), s1);
  // the same conversations (who, where, about what) — wording may differ (phrasing memory is not saved)
  const ta = [], tb = [];
  a.on('talk', (t) => ta.push(t.a + '>' + t.b + '@' + t.place + ':' + t.topics.join(',')));
  b.on('talk', (t) => tb.push(t.a + '>' + t.b + '@' + t.place + ':' + t.topics.join(',')));
  a.runDays(1.5); b.runDays(1.5);
  assert.ok(ta.length > 200);
  assert.deepEqual(tb, ta);
  assert.equal(b.serialize(), a.serialize());
});

test('a save is compact', () => {
  const a = createStory({ seed: 3, population: 250, textMode: 'none' });
  a.runDays(5);
  const s = a.serialize();
  assert.equal(typeof s, 'string');
  assert.ok(s.length < 900_000, 'save size ' + s.length);
});
