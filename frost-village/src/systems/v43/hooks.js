// (v4.3 step B, B0 — build_plan.md §2 Seams, BP-25) the step-B seams in Game.build and the v43 event bus.
//
//   onAfterLoad(fn)          fn(gs, info) runs once per Game.build, after everything stands and the chief is out of
//                            the walls (Game.build calls runAfterLoad right after unstickChief). info =
//                            { fresh, remapped, refunds43 }: fresh = a new village (no save), remapped / refunds43 = the
//                            save went through R43 at this load (S fills them; B0 passes false / null)
//   runAfterLoad(gs, info)   Game.build only. A hook that throws is logged and skipped: it never reaches Game.create's
//                            catch (that would quarantine a good save)
//   emit(name, data) / on(name, fn) / off(name, fn)
//                            the bus: P, H, M, N and S say what the player saw (EV43 in src/data/ids43.js); P1 listens.
//                            Synchronous; a listener that throws is logged and skipped. on() returns its own off():
//                            a listener tied to a scene calls it on the scene's 'shutdown'
//   recent()                 the last 64 events [{ name, data, t }] (tests read window.__FV43.recent())
//   v43Holder(saved, isNew)  the Game's gs.v43 at build: the saved block (Save.js keeps it), else a new village's
//                            { lay: 2, seen: { letter43: 1, tour43: 1 } } (no letter, no tour), else { lay: 0 } for a
//                            loaded save without one (a village made before S lands still remaps later)

import { LAY, SEEN43 } from '../../data/ids43.js';

const afterLoad = [];
const listeners = new Map();          // name -> [fn]
const RECENT_MAX = 64;
const recentEv = [];

const report = (what, e) => { try { console.error('[v43] ' + what + ':', e); } catch (x) { /* */ } };

export function onAfterLoad(fn) {
  if (typeof fn === 'function' && afterLoad.indexOf(fn) < 0) afterLoad.push(fn);
  return () => { const i = afterLoad.indexOf(fn); if (i >= 0) afterLoad.splice(i, 1); };
}

export function runAfterLoad(gs, info) {
  const inf = Object.assign({ fresh: false, remapped: false, refunds43: null }, info || {});
  for (const fn of afterLoad.slice()) {
    try { fn(gs, inf); } catch (e) { report('after-load hook failed', e); }
  }
  return inf;
}

export function on(name, fn) {
  if (typeof name !== 'string' || typeof fn !== 'function') return () => {};
  const a = listeners.get(name) || [];
  if (a.indexOf(fn) < 0) a.push(fn);
  listeners.set(name, a);
  return () => off(name, fn);
}

export function off(name, fn) {
  const a = listeners.get(name);
  if (!a) return;
  const i = a.indexOf(fn);
  if (i >= 0) a.splice(i, 1);
  if (!a.length) listeners.delete(name);
}

export function emit(name, data) {
  if (typeof name !== 'string' || !name) return;
  let t = 0;
  try { t = Date.now(); } catch (e) { /* */ }
  recentEv.push({ name, data: data === undefined ? null : data, t });
  if (recentEv.length > RECENT_MAX) recentEv.splice(0, recentEv.length - RECENT_MAX);
  const a = listeners.get(name);
  if (!a) return;
  for (const fn of a.slice()) {
    try { fn(data, name); } catch (e) { report('listener of "' + name + '" failed', e); }
  }
}

export function recent() { return recentEv.slice(); }

/** gs.v43 at build time (see the header). `saved` is the block Save.load kept (sanitized), or undefined */
export function v43Holder(saved, isNew) {
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    const o = Object.assign({}, saved);
    if (o.seen && typeof o.seen === 'object') o.seen = Object.assign({}, o.seen);
    return o;
  }
  if (isNew) return { lay: LAY, seen: { [SEEN43.letter]: 1, [SEEN43.tour]: 1 } };
  return { lay: 0 };
}

// the browser tests read the bus here (read-only use: recent / on)
try { if (typeof window !== 'undefined') window.__FV43 = { recent, on, off }; } catch (e) { /* */ }
