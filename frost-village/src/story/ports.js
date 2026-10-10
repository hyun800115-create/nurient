// The part of the kit's Ports facade (docs/v5_v8_plan.md §5.3) the story uses, written down so the game adapter
// (src/story/adapters/gamePorts.js), the lab (tools/test/story_lab/labPorts.js) and the Node tests
// (tools/test/story_lab/fakePorts.mjs) implement the same surface. At integration src/kit/Ports.js provides it;
// every member is optional — the story checks before it calls.
//
// ports = {
//   seed(), cid(), lang(), T()                              game seed, save id (side-record tie), 'ko' | 'en', DayClock.T
//   storage: { getItem, setItem, removeItem }               localStorage (the side record SAVE_KEY + '.story')
//   sideKey                                                 'frostVillage.save.v1.story'
//   settings: { get(k) }                                    lifeFarewell, incidents, missionToasts
//   world: { buildings() -> [{ id, key, role, x, y, ours?, locked?, name? }], spots() -> [{ id, kind, x, y }],
//            spot(placeId, kind) -> { x, y, dir } | null, has(key) -> bool, names(key) -> { ko, en } }
//   people: { roster() -> roster rows (model/adopt.js), relations() -> chat RELATIONS, chronicle() -> { flags, rank, built, shops },
//             prices() -> { item_bread: 7, … } }
//   town: { whereabouts(out) -> rows [pid, buildingId | null, act, state, busy]   (every person with a body owner 'town' / 'gameplay')
//           visible(out, max) -> pids on screen with a body (≤ max)
//           bodyOf(pid) -> body | null · pidOfBody(body) -> pid | null
//           hold(pid, owner) -> bool · release(pid) · walk(pid, x, y, opts, cb) · face(pid, dirOrPoint) · anim(pid, name, opts)
//           dress(pid, preset | null) · place(pid, x, y, dir) · addCitizen(spec) -> pid · leave(pid) · attach(pid, kind, opts) -> handle }
//   say(pid, text, emote, dur, opts) -> bool · emote(pid, key, dur) -> bool         (Bubbles -> VillageVoice; town caps 2 / 3)
//   ui: { card(spec), banner(spec), toast(text, hold), openPanel(Panel, data), chip(id, spec) }
//   sound: { play(key, opts), at(key, x, y, opts), music(key | null), duck(level, hold) }
//   view: { rect() -> { x, y, w, h }, onScreen(x, y, m), focus(x, y, ms) }
//   events: { emit(name, payload) }                        module events out (story:life, story:news, story:wish …)
// }

/** a ports object that does nothing (the story still runs its model; used when the game gives none) */
export function nullPorts(over = {}) {
  const noop = () => {};
  const base = {
    seed: () => 1, cid: () => 'story', lang: () => 'ko', T: () => 200, storage: null, sideKey: 'frostVillage.save.v1.story',
    settings: { get: () => undefined },
    world: { buildings: () => [], spots: () => [], spot: () => null, has: () => false, names: (k) => ({ ko: k, en: k }) },
    people: { roster: () => [], relations: () => [], chronicle: () => ({}), prices: () => null },
    town: { whereabouts: noop, visible: noop, bodyOf: () => null, pidOfBody: () => null, hold: () => false, release: noop, walk: noop, face: noop,
      anim: noop, dress: noop, place: noop, addCitizen: () => null, leave: noop, attach: () => null },
    say: () => false, emote: () => false,
    ui: { card: noop, banner: noop, toast: noop, openPanel: noop, chip: noop },
    sound: { play: noop, at: noop, music: noop, duck: noop },
    view: { rect: () => ({ x: 0, y: 0, w: 0, h: 0 }), onScreen: () => false, focus: noop },
    events: { emit: noop },
  };
  for (const k in over) base[k] = typeof over[k] === 'object' && over[k] && !Array.isArray(over[k]) && typeof base[k] === 'object' ? Object.assign({}, base[k], over[k]) : over[k];
  return base;
}
