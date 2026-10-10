// The resident chat's memory bridge (docs/v5_v8_plan.md §6.1, patch P21). Builds the chat's own StoryBridge
// (src/chat/storyBridge.js, unchanged) on the story mirror, with ids mapped through the person registry:
// chat keys are the named villagers' character keys ('npc_aunt'), story ids are the engine's sids.
//
//   const bridge = createChatBridge(StoryBridge, host, village)
//   bridge.syncWorld()            on 'day'          (today's headline + weather -> chat world)
//   bridge.syncMemories(key)      on chat open      (the resident's diary of yesterday -> chat memories)
//   host.facade.on('talk', (t) => bridge.decorateTalk(t))    ahead of StoryLife: learned gossip travels in talks
//
// The StoryBridge class is passed in (the host never imports src/chat itself: the game owns that import).

export function createChatBridge(StoryBridge, host, village, opts = {}) {
  const reg = host.registry;
  const idOf = (key) => { const sid = reg.sidOf('v:' + key); return sid >= 0 ? sid : null; };
  const keyOf = (sid) => { const pid = reg.pidOf(sid); return pid && pid.startsWith('v:') ? pid.slice(2) : null; };
  const bridge = new StoryBridge(host.facade, village, { idOf, keyOf });
  if (opts.decorate !== false) host.facade.on('talk', (t) => bridge.decorateTalk(t));
  return bridge;
}
