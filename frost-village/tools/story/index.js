// Frost Village story-network engine — public entry point.
//
//   import { createStory } from '../tools/story/index.js';
//   const story = createStory({ seed: 7, lang: 'ko', dayLength: 600, population: 250 });
//   story.on('talk', (t) => …);  story.tick(dt);  const save = story.serialize();
//   const again = createStory({ save });
//
// See docs/build_reports/story.md for the full API, events and the integration plan.

export { StoryEngine, createStory, DEFAULTS } from './src/engine.js';
export { CHIEF } from './src/dialogue.js';
export { josa, particle, finalKind, hasBatchim, casualName, counted, nativeCount, romanize } from './lang/josa.js';
export { Grammar } from './lang/grammar.js';
export { FACT_KINDS } from './data/facts.js';
export { PLACE_KINDS, JOBS } from './data/places.js';
export { ITEMS } from './data/items.js';
