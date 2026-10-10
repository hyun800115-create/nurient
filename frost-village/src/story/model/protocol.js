// Story runtime message protocol (docs/v5_v8_plan.md §6.1 "Message protocol"). The host (main thread) and the
// core (a Web Worker, or the same thread in inline mode) speak only these plain, structured-cloneable messages,
// batched at ≤ 8 messages per second each way. Pure data: no Phaser, no DOM.
//
//   main -> core   init · tick · visible · ack · report · lease · adopt · add · remove · toggles · prices · lang ·
//                  arrange · talkTo · query · save · config · watch
//   core -> main   ready · events · mirror · reply · saved · error

export const PROTOCOL = 1;

/** main -> core message types */
export const M = {
  INIT: 'init', TICK: 'tick', VISIBLE: 'visible', ACK: 'ack', REPORT: 'report', LEASE: 'lease', ADOPT: 'adopt', ADD: 'add', REMOVE: 'remove',
  TOGGLES: 'toggles', PRICES: 'prices', LANG: 'lang', ARRANGE: 'arrange', TALK_TO: 'talkTo', QUERY: 'query', SAVE: 'save', CONFIG: 'config',
  WATCH: 'watch', PLACE: 'place',
};

/** core -> main message types */
export const W = { READY: 'ready', EVENTS: 'events', MIRROR: 'mirror', REPLY: 'reply', SAVED: 'saved', ERROR: 'error' };

/** the engine's act codes (src/story/engine/src/plans.js A_*) — the game reports where people are with these */
export const ACT = { home: 0, work: 1, school: 2, shop: 3, social: 4, bank: 5, eat: 6, pickup: 7, visit: 8, sleep: 9, play: 10, outing: 11, clinic: 12, event: 13, jail: 14, bigbuy: 15 };

/** TownSim activity (c.act) -> engine act code */
export const TOWN_ACT = {
  sleep: ACT.sleep, home: ACT.home, work: ACT.work, patrol: ACT.work, mail: ACT.work, class: ACT.school, school: ACT.school,
  recess: ACT.play, play: ACT.play, lunch: ACT.eat, cafe: ACT.eat, errand: ACT.shop, bench: ACT.social, walk: ACT.social,
  doze: ACT.social, cheer: ACT.social, clinic: ACT.clinic, train: ACT.social, visit: ACT.visit,
};

/** engine events the core forwards to the main thread (others stay in the worker) */
export const FORWARD = ['talk', 'goTo', 'arrive', 'life', 'move', 'shop', 'news', 'day', 'incident', 'build', 'wanted', 'bank'];

/** a talk as it crosses the boundary: no Beat / Fact objects, only what the game shows */
export function slimTalk(t) {
  return { id: t.id, a: t.a, b: t.b, place: t.place, start: t.start, dur: t.dur, topics: t.topics, lines: t.lines, shout: !!t.shout, chief: !!t.chief };
}

/** a life / move / … event as it crosses the boundary (plain fields only) */
export function slimEvent(name, ev) {
  if (name === 'talk') return slimTalk(ev);
  if (name === 'news') return { day: ev.day, text: ev.text || null };
  if (name === 'incident') {
    const o = {};
    for (const k of ['id', 'kind', 'phase', 'place', 'building', 'culprit', 'victim', 'officers', 'crew', 'witnesses', 'item', 'cause', 'outcome', 'ack']) if (ev[k] !== undefined) o[k] = ev[k];
    return o;
  }
  const o = {};
  for (const k in ev) { const v = ev[k]; if (v === null || typeof v !== 'object' || Array.isArray(v)) o[k] = v; }
  return o;
}

/** flat Int32Array of [sid, placeIdx, act] triples (the 'tick' message's at list) */
export function packAt(list) {
  const out = new Int32Array(list.length * 3);
  for (let i = 0; i < list.length; i++) { out[i * 3] = list[i][0]; out[i * 3 + 1] = list[i][1]; out[i * 3 + 2] = list[i][2]; }
  return out;
}
