// FakePorts for the story Node tests: the stand-in town (standin.mjs) behind the ports surface (src/story/ports.js),
// a controllable clock, a Map storage, and recorders for everything the story shows (cards, banners, says, events).
// The stand-in town plays TownSim's part of patch S6: story children get a body with the pid the story asks for
// ('k:<sid>') and are kept in the roster (nb.extra in the game); people who leave are retired for good (nb.gone).
// Pass `town` to carry one town across a reload (the game's own save of its people).
import { nullPorts } from '../../../src/story/ports.js';
import { makeStandInTown, BUILDINGS, BYID, DAY, HOUR, VILLAGE_AREAS } from './standin.mjs';

export class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

/** opts: { seed, T0, storage, settings, scale, rank, garden, town, villagers: 'square' | 'village', visible, bankRate } */
export function makeFakePorts(opts = {}) {
  const town = opts.town || makeStandInTown({ seed: opts.seed || 2611, scale: opts.scale || 1, villagers: opts.villagers });
  const clock = { T: opts.T0 !== undefined ? opts.T0 : 2 * DAY + 9 * HOUR };
  const rec = { cards: [], banners: [], toasts: [], chips: [], events: [], says: [], sounds: [], left: [] };
  const settings = Object.assign({ lifeFarewell: true, missionToasts: true }, opts.settings || {});
  const garden = opts.garden !== false;
  const buildings = BUILDINGS.filter((b) => garden || b.key !== 'memorial_garden').concat(town.villageAreas || []);
  const byId = Object.assign({}, BYID);
  for (const a of town.villageAreas || []) byId[a.id] = a;
  const ports = nullPorts({
    seed: () => opts.seed || 2611, cid: () => opts.cid || 'labsave1', lang: () => opts.lang || 'ko', T: () => clock.T,
    storage: opts.storage || new MemStorage(), sideKey: 'frostVillage.save.v1.story',
    settings: { get: (k) => settings[k] },
    world: {
      buildings: () => buildings, spots: () => [],
      spot: (id) => { const b = byId[id]; return b ? { x: b.x, y: b.y + 60, dir: 'NE' } : null; },
      has: (key) => buildings.some((b) => b.key === key),
      names: (k) => ({ ko: { town_hall: '마을회관', school: '학교', memorial_garden: '기억의 정원' }[k] || k, en: k }),
    },
    people: { roster: () => town.roster, relations: () => town.relations, chronicle: () => Object.assign({}, town.chronicle, { rank: opts.rank || 2 }), prices: () => ({ item_bread: 7, item_fish_cooked: 9 }) },
    town: {
      whereabouts: (out) => town.whereabouts(clock.T, out),
      visible: (out, max) => { for (let i = 0; i < Math.min(max, opts.visible || 0); i++) out.push('t:' + i); },
      addCitizen: (spec) => { rec.events.push(['addCitizen', spec]); return town.addStoryChild(spec); },
      leave: (pid, why) => { rec.events.push(['leave', pid]); rec.left.push([pid, why]); town.retire(pid); },
    },
    say: (pid, text, emote) => { rec.says.push([pid, text, emote]); return true; },
    ui: {
      card: (c) => rec.cards.push(c), banner: (b) => rec.banners.push(b), toast: (t, sec) => rec.toasts.push([t, sec]), chip: (id, c) => rec.chips.push([id, c]),
    },
    sound: { play: (k) => rec.sounds.push(k), at: () => {}, music: () => {}, duck: () => {} },
    events: { emit: (name, payload) => rec.events.push([name, payload]) },
    bank: { rate: () => (opts.bankRate === undefined ? null : opts.bankRate) },
  });
  ports.settingsTable = settings;
  return { ports, clock, rec, town };
}

/** advance the fake clock and the host in tickEvery steps (game seconds); pump: async drain for worker mode */
export async function run(host, clock, secs, opts = {}) {
  const step = opts.step || 0.25;
  const n = Math.round(secs / step);
  for (let i = 0; i < n; i++) {
    clock.T += step;
    host.update(step);
    if (opts.onStep) opts.onStep(i);
    // a frame boundary: promise continuations (requests answered inline) run between frames, as in the browser
    await null;
    if (opts.yieldEvery && i % opts.yieldEvery === 0) await new Promise((r) => setImmediate(r));
  }
}

export { DAY, HOUR, VILLAGE_AREAS };
