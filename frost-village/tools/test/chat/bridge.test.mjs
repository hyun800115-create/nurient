// StoryBridge against the real story-network engine (tools/story), when it is present: world news and
// weather flow into chat, diary lines become low-importance chat memories, and a rumour the chief
// started in chat replaces a line in a resident-to-resident talk (so it travels through the town).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ChatVillage } from '../../../src/chat/village.js';
import { StoryBridge, STORY_WEATHER } from '../../../src/chat/storyBridge.js';
import { LAB_RESIDENTS } from '../../../src/chat/personas.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const storyIndex = path.resolve(here, '../../story/index.js');

async function setup() {
  const { createStory } = await import(pathToFileURL(storyIndex).href);
  const story = createStory({ seed: 7, lang: 'ko', population: 40, textMode: 'all' });
  story.runDays(2);
  const ids = story.alive.slice(0, LAB_RESIDENTS.length).map((r) => r.id);
  const idOf = Object.fromEntries(LAB_RESIDENTS.map((k, i) => [k, ids[i]]));
  const keyOf = Object.fromEntries(LAB_RESIDENTS.map((k, i) => [ids[i], k]));
  const village = new ChatVillage({ roster: LAB_RESIDENTS, seed: 1 });
  const bridge = new StoryBridge(story, village, { idOf: (k) => idOf[k], keyOf: (id) => keyOf[id] });
  return { story, village, bridge, idOf };
}

test('story engine -> chat: news, weather, diary memories (and a broken engine never throws)', async (t) => {
  if (!fs.existsSync(storyIndex)) { t.skip('story engine not present'); return; }
  const { story, village, bridge } = await setup();
  const w = bridge.syncWorld();
  assert.equal(village.day, story.clock.day);
  if (w.news) for (const n of w.news) assert.ok(n.length <= 81, n);
  assert.ok(STORY_WEATHER[story.weather.today.kind], 'every story weather has a chat name');
  assert.equal(village.world.weatherKo, STORY_WEATHER[story.weather.today.kind][1]);
  let added = 0;
  for (const k of LAB_RESIDENTS) added += bridge.syncMemories(k);
  assert.ok(added > 0, 'diary lines became memories');
  for (const k of LAB_RESIDENTS) for (const e of village.mem(k).ep) { assert.equal(e.src, 's'); assert.equal(e.m, 1); }
  assert.equal(bridge.syncMemories(LAB_RESIDENTS[0]), 0, 'once per game day');
  const broken = new StoryBridge({ newspaper() { throw new Error('x'); }, clock: null }, village);
  assert.doesNotThrow(() => { broken.syncWorld(); broken.syncMemories('npc_aunt'); });
});

test('chat -> story engine: a learned rumour rides along in a resident talk', async (t) => {
  if (!fs.existsSync(storyIndex)) { t.skip('story engine not present'); return; }
  const { village, bridge, idOf } = await setup();
  const g = village.corpus.add('g', '{@chief:이} 생선을 열 마리 잡았대', { o: 'npc_aunt', d: village.day, src: 'a' }).entry;
  const talk = { a: idOf.npc_aunt, b: idOf.npc_grandma, lines: [{ who: idOf.npc_aunt, text: '오늘 눈이 많이 왔네요.', rule: 'small.snow' }, { who: idOf.npc_grandma, text: '그러게요.', rule: 'react.ok' }] };
  assert.equal(bridge.decorateTalk(talk, { chance: 1, rng: () => 0.5 }), true);
  assert.match(talk.lines[0].text, /촌장님이 생선을 열 마리 잡았대/);
  assert.equal(talk.lines[0].rule, 'chat.corpus');
  assert.ok(village.corpus.knower(g, 'npc_grandma'), 'the listener learned it');
  // the same talk again changes nothing (she already knows), and the chief's own talks are left alone
  const again = { a: idOf.npc_aunt, b: idOf.npc_grandma, lines: [{ who: idOf.npc_aunt, text: '안녕하세요.', rule: 'greet' }] };
  assert.equal(bridge.decorateTalk(again, { chance: 1, rng: () => 0.5 }), false);
  assert.equal(bridge.decorateTalk({ a: idOf.npc_aunt, b: -1, chief: true, lines: [{ who: idOf.npc_aunt, text: 'x' }] }, { chance: 1 }), false);
  // between residents the speech level follows age and closeness
  const line = bridge.lineFor('npc_kid_girl', 'npc_grandma');
  assert.equal(typeof line, 'string');
});
