// 주민과 수다 떨기 (resident chat) — public entry point. Standalone ES modules: no Phaser, no game
// imports; the DOM is only touched by ChatPanel. See docs/build_reports/chat.md.
//
//   import { ChatVillage, ChatEngine, ChatPanel, LAB_RESIDENTS } from './src/chat/index.js';
//   const village = ChatVillage.deserialize(save.chat, { roster: residentKeys });
//   const engine = new ChatEngine({ village });
//   window.claude?.use?.('sample').then((s) => engine.setSample(s)).catch(() => engine.setSample(null));
//   const panel = new ChatPanel({ engine, assets });
//   panel.open('npc_aunt');
//   save.chat = village.serialize();

export { ChatVillage, SAVE_VERSION, MIGRATIONS, migrate, byteLength, WEATHERS, PARTS } from './village.js';
export { ChatEngine, DEFAULTS } from './engine.js';
export { ChatPanel, PANEL_CSS, CHIPS, GIFT_ITEMS } from './ChatPanel.js';
export { OfflineBrain } from './offline.js';
export { SampleBrain, ServerBrain, ChatError, ACTION, classify, salvageReply } from './brains.js';
export { buildPrompt, RULES, FORMAT, BUDGET, PROMPT_VERSION } from './prompt.js';
export { VillageCorpus, exaggerate } from './corpus.js';
export { ResidentMemory } from './memory.js';
export { PERSONAS, RELATIONS, LAB_RESIDENTS, STAGES, stageOf, levelToChief, refName } from './personas.js';
export { detectIntent, INTENTS } from './intent.js';
export { sanitizeResult, slotify, renderSlots, extractPartialReply, cleanPlayerText, MOOD_KO } from './sanitize.js';
export { StoryBridge } from './storyBridge.js';
export * as ko from './ko.js';
