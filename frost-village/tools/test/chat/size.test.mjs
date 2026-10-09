// The save stays small: 1,000 simulated conversations where the AI invents new material every time.
// (tools/test/chat_size.mjs prints the whole curve.)

import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from './sim.mjs';
import { PERSONAS } from '../../../src/chat/personas.js';
import { ChatVillage } from '../../../src/chat/village.js';

const BUDGET = 300 * 1024;

test('1,000 conversations with the 8 lab residents stay under 300 KB and level off', async () => {
  const r = await simulate({ total: 1000, marks: [100, 500, 1000] });
  const [c100, c500, c1000] = r.curve;
  assert.ok(c1000.bytes <= BUDGET, (c1000.bytes / 1024).toFixed(1) + ' KB');
  assert.ok(c1000.bytes <= c500.bytes * 1.1, 'no steady growth after the caps: ' + c500.bytes + ' -> ' + c1000.bytes);
  assert.ok(c100.gossip > 0 && c1000.lines > 0);
  // and the save still loads
  const back = ChatVillage.deserialize(JSON.stringify(r.village.serialize()), { roster: r.village.roster });
  assert.equal(back.corpus.size, r.village.corpus.size);
});

test('1,000 conversations with all 32 residents stay under 300 KB', async () => {
  const r = await simulate({ total: 1000, marks: [1000], roster: Object.keys(PERSONAS) });
  assert.ok(r.curve[0].bytes <= BUDGET, (r.curve[0].bytes / 1024).toFixed(1) + ' KB');
});
