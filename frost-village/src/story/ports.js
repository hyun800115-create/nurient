// The part of the kit's Ports facade (docs/v5_v8_plan.md §5.3) the story uses, written down so the game adapter
// (src/kit/Ports.js at integration: docs/build_reports/story_runtime.md "Integration"), the lab
// (tools/test/story_lab/lab/lab.js + lab/bodies.js, the reference implementation) and the Node tests
// (tools/test/story_lab/fakePorts.mjs) implement the same surface. Every member is optional — the story checks
// before it calls.
//
// ports = {
//   seed(), cid(), lang(), T()                              game seed, save id (side-record tie), 'ko' | 'en', DayClock.T (25 s an hour)
//   storage: { getItem, setItem, removeItem }               localStorage (the side record SAVE_KEY + '.story')
//   sideKey                                                 'frostVillage.save.v1.story'
//   settings: { get(k) }                                    lifeFarewell (설정 '생애 이벤트'), lifeEvents (advanced), missionToasts
//   world: { buildings() -> [{ id, key, role, x, y, ours?, locked?, name?, kind? }], spots() -> [{ id, kind, x, y }],
//            spot(placeId, kind) -> { x, y, dir } | null, has(key) -> bool, names(key) -> { ko, en },
//            stage(buildingId, on, by) — our 마을회관 clears its notice board / pads for a wedding (M4) }
//   people: { roster() -> roster rows (model/adopt.js; rows may carry visits, sid, body), relations() -> chat RELATIONS,
//             chronicle() -> { flags, rank, built, shops }, prices() -> { item_bread: 7, … } }
//   town: { whereabouts(out) -> rows [pid, buildingId | null, act, state, busy]   (every body: TownSim 't:' / 'k:' and
//             VillageLife 'v:' rows — named villagers too, at their village areas 'va:<area>', critique H9)
//           visible(out, max) -> pids on screen with a body (≤ max)
//           bodyOf(pid) -> body | null · pidOfBody(body) -> pid | null · ageGroup(pid) -> 'child' | 'adult' | 'elder' | null
//           hold(pid, owner) -> bool · release(pid) · walk(pid, x, y, opts, cb) (opts.speed: a multiplier) ·
//           face(pid, dirOrPoint) · anim(pid, name, opts) · dress(pid, preset | null, { add, remove }) · place(pid, x, y, dir)
//           addCitizen({ pid: 'k:<sid>', kind: 'child', townKind: 'toddler' | 'student', age, parents, home: { like }, sid })
//             -> pid (the body is kept by the game across reloads, critique H7)
//           leave(pid, why) — the body is gone for good ('moved' | 'farewell'; never the train), kept gone after a reload
//           attach(pid, kind, opts) -> handle · reserve(id, rect | null) — keep everyday walkers out of a stage rect
//           (view only:) hide(pid, on) · nearby(x, y, r, n) -> pids · spawn(spec) -> pid · despawn(pid)   extras for scenes }
//   say(pid, text, emote, dur, opts) -> bool · emote(pid, key, dur) -> bool         (Bubbles -> VillageVoice; false when the
//     town's bubbles are at their cap: the story never evicts a village bubble, critique M6)
//   ui: { card(spec), banner({ ko, en, subKo, subEn }), toast(text, holdSec), openPanel(Panel, data), chip(id, spec) }
//   sound: { play(key, opts), at(key, x, y, opts), music(key | null), duck(level, hold) }
//   view: { rect() -> { x, y, w, h }, onScreen(x, y, m), focus(x, y, ms), zoomPulse(factor, ms) }
//   dressAges(kind) -> ['adult', …] | null   the age groups whose townfolk2 pages the kit could page in for a set piece
//     (index.js beatPlan within the texture headroom); others play in their everyday look (critique H8). null = all.
//   chat: { offer(pid) -> bool }             수다 떨기 on a named villager's person card opens the resident chat
//   bank: { rate() -> daily interest (0.01 = 1 %) | null }   the paper's bank line (null: no bank yet, no line)
//   open() -> { bus, wagon, … }                              what the town has (happenings that need a vehicle)
//   happenSpots() -> { market: { x, y }, … } | null           where happenings may play (null: anywhere)
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
    bank: { rate: () => null },
    events: { emit: noop },
  };
  const plain = (o) => !!o && typeof o === 'object' && Object.getPrototypeOf(o) === Object.prototype;
  for (const k in over) base[k] = plain(over[k]) && plain(base[k]) ? Object.assign({}, base[k], over[k]) : over[k];
  return base;
}
