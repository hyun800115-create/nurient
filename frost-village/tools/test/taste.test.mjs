// (v4.3 step B, WP-T) 읍장 취임 맛보기, Node only (a Phaser stub, a mock 읍 village with the real Rank):
//   node tools/test/taste.test.mjs
// postdepot_addendum.md §5, §6.4. The browser half is tools/test/taste.mjs.
// 1 the module: EupTaste.enabled (row 10 exists, BP-53), the B0b stub flags gone, the T strings in ko and en (same keys,
//   no version number, BP-45), the seen key is save-safe (sanitizeV43 keeps eup_taste)
// 2 the gate: rank 1 never; with G in the build G decides (its tasteReady(), else its current() being row 10), seen.g43ready
//   opens it (sticky), without G seen.g43all does; seen.eup_taste or enabled false close it; EupTaste.place without a pad
//   is null
// 3 attach: one run per build ('update' + 'shutdown' listeners); a second attach (a restart) lets the first go
// 4 the scene on its own clock: hold 'taste' (Rank's cerOn / state().ceremony false, Rank.update never ticks it), the
//   hall framing (Rank.hallFrame), the beats (bells, party, banner with opts.step, confetti, badge at venue.y − 60,
//   cheer, the teaser at 8 s), cardAuto ends it; it writes only v43.seen.eup_taste (a holder without seen gets one),
//   saves, never touches coins / flags / x; the bus says start, title, teaser, end
// 5 skip: a drag before skipAfter does nothing; one held from the start does not skip until let go and dragged again;
//   the skip's end state; goals43.taste from balance.js sets the clock (len, cardAuto)
// 6 a scene 'shutdown' mid-scene: no hold, nothing written, every listener removed
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.Phaser = { GameObjects: { Graphics: class {}, Container: class {}, Sprite: class {}, Image: class {} }, BlendModes: {}, Math: {}, Geom: {}, Scene: class {} };
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const imp = (p) => import(path.join(ROOT, p));
const v43 = await imp('src/systems/v43/index.js');
const { EupTaste } = v43;
const { EupTasteCard } = await imp('src/scenes/EupTasteCard.js');
const { Rank } = await imp('src/systems/Rank.js');
const { Input } = await imp('src/core/Input.js');
const { BALANCE } = await imp('src/data/balance.js');
const { STRINGS } = await imp('src/data/strings.js');
const ids = await imp('src/data/ids43.js');
const { sanitizeV43 } = await imp('src/core/Save.js');

let pass = 0, fail = 0;
const ok = (c, msg, extra) => { if (c) { pass++; console.log('  ok   ' + msg); } else { fail++; console.log('  FAIL ' + msg + (extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

class Emitter {
  constructor() { this.m = new Map(); }
  on(n, f) { const a = this.m.get(n) || []; a.push({ f, once: false }); this.m.set(n, a); return this; }
  once(n, f) { const a = this.m.get(n) || []; a.push({ f, once: true }); this.m.set(n, a); return this; }
  off(n, f) { const a = this.m.get(n); if (a) this.m.set(n, a.filter((q) => q.f !== f)); return this; }
  emit(n, ...args) { const a = (this.m.get(n) || []).slice(); this.m.set(n, (this.m.get(n) || []).filter((q) => !q.once)); for (const q of a) q.f(...args); return a.length > 0; }
  count(n) { return (this.m.get(n) || []).length; }
}

/** a mock 읍 village: the real Rank (level 2), a hall, the calls the scene makes */
function village(o = {}) {
  const calls = { cam: [], party: 0, cheer: 0, banner: [], badge: [], burst: 0, save: 0, gather: 0, coins: 0 };
  const venue = { x: 1000, y: 800 };
  const gs = {
    events: new Emitter(), player: { x: 964, y: 1008, vx: 0, vy: 0 }, simSpeed: 1,
    v43: o.v43 !== undefined ? o.v43 : { lay: 0, seen: { g43all: 1 } },
    progress: { flags: (o.rank || 2) >= 2 ? { rankEup: true, rankReady: true } : { rankReady: true }, setFlag(k) { this.flags[k] = true; } },
    civic: { hall: { venue: () => ({ x: venue.x, y: venue.y }), rankPadPos: () => ({ x: venue.x - 36, y: venue.y + 12 }) } },
    focusCamera: (x, y, ms) => calls.cam.push([x, y, ms]),
    life: { party: () => calls.party++, cheer: () => calls.cheer++, people: () => 40 },
    ui: { banner: (m, s, op) => calls.banner.push([m, s, op]), rankBadgeFly: (x, y) => calls.badge.push([x, y]), toast: () => {} },
    effects: { burst: () => calls.burst++, sheet: () => {} },
    economy: { coins: 5000, add: () => { calls.coins++; }, spend: () => { calls.coins++; } },
    scene: { get: () => null }, time: { now: 0 }, tweens: { killTweensOf: () => {} },
    save: () => calls.save++, x43: { get: () => undefined },
  };
  gs.v4 = { gs, ready: false, gatherVisitors: () => calls.gather++ };
  gs.v4.rank = new Rank(gs.v4, { rank: o.rank || 2 });
  gs.v4.rank.duck = () => {};
  if (o.G !== undefined) gs.goals43 = o.G;
  return { gs, calls, venue };
}
const Gcur = (id) => ({ rows: () => [], sideRows: () => [], refs: () => new Set(), sub: () => null, objective: () => null, current: () => (id ? { id, kind: 'g43' } : null) });
/** step the scene's own 'update' listener (as Phaser does every frame) */
const step = (gs, sec, dt = 1 / 60) => { const n = Math.round(sec / dt); for (let i = 0; i < n; i++) { gs.time.now += dt * 1000; gs.events.emit('update', gs.time.now, dt * 1000); } };
const busTaste = (from) => v43.recent().slice(from).filter((e) => e.name === 'taste').map((e) => e.data.state);

// ================================================================== 1
console.log('1 the module, words and seen key');
{
  ok(EupTaste.enabled === true && !('stub' in EupTaste) && !('stub' in EupTasteCard), 'EupTaste.enabled (row 10 exists); the B0b stub flags are gone');
  ok(typeof EupTaste.gate === 'function' && typeof EupTaste.place === 'function' && typeof EupTaste.attach === 'function', 'EupTaste.attach / gate / place');
  const K = ['taste_pad', 'taste_banner', 'taste_bannerSub', 'taste_cheer', 'taste_next', 'taste_l1', 'taste_l2', 'taste_tag', 'taste_foot', 'taste_ok', 'taste_end'];
  const miss = K.filter((k) => typeof STRINGS.ko[k] !== 'string' || typeof STRINGS.en[k] !== 'string' || !STRINGS.ko[k] || !STRINGS.en[k]);
  ok(!miss.length, 'the 11 taste_* words are there in ko and en', miss);
  const tk = (L) => Object.keys(STRINGS[L]).filter((k) => /^taste_/.test(k)).sort();
  ok(same(tk('ko'), tk('en')) && tk('ko').length === K.length, 'ko and en carry the same taste_* keys', { ko: tk('ko'), en: tk('en') });
  const all = K.map((k) => STRINGS.ko[k] + ' ' + STRINGS.en[k]).join(' ');
  ok(!/\d+\.\d+/.test(all) && !/\bv\s?\d/i.test(all) && !/버전|version/i.test(all), 'no version number in any of them (BP-45)');
  ok(STRINGS.ko.taste_pad === '읍장 취임 맛보기' && STRINGS.ko.taste_next === '다음 업데이트에서 열려요' && STRINGS.ko.taste_tag === '곧 열려요' && STRINGS.ko.rank_title_2 === '읍장', 'the addendum\'s words (§5.3) and 「읍장」 = rank_title_2');
  // the source: anchors only (the T pair), the seen key spelled lower case
  const kept = sanitizeV43({ lay: 0, seen: { [ids.SEEN43.taste]: 1 } });
  ok(ids.SEEN43.taste === 'eup_taste' && kept && kept.seen && kept.seen.eup_taste === 1, 'seen.eup_taste survives the save\'s keep-rule (BP-46)', kept);
}

// ================================================================== 2
console.log('2 the gate');
{
  const T = ids.G43.taste;
  ok(!EupTaste.gate(village({ rank: 1 }).gs), 'rank 1 (마을), chain done: closed');
  ok(EupTaste.gate(village().gs), '읍, no G in the build, seen.g43all: open');
  ok(!EupTaste.gate(village({ v43: { lay: 0 } }).gs) && !EupTaste.gate(village({ v43: { lay: 0, seen: {} } }).gs), '읍, no G, no g43all (a holder without seen too): closed');
  ok(!EupTaste.gate(village({ G: Gcur('g43_shop') }).gs), 'G in the build, its current row 8, seen.g43all: closed (G\'s rule wins)');
  ok(EupTaste.gate(village({ G: Gcur(T), v43: { lay: 0 } }).gs), 'G\'s current row is row 10 (g43_taste): open');
  ok(EupTaste.gate(village({ G: Gcur('g43_deco'), v43: { lay: 0, seen: { g43ready: 1 } } }).gs), 'seen.g43ready (G showed it once): open even when a soft row is current again');
  ok(!EupTaste.gate(village({ G: { current() { throw new Error('x'); } }, v43: { lay: 0 } }).gs), 'a G that throws: closed (never an exception)');
  // G's own gate first (tasteReady), its current row only for a G without it
  ok(EupTaste.gate(village({ G: Object.assign(Gcur('g43_shop'), { tasteReady: () => true }), v43: { lay: 0 } }).gs), 'G.tasteReady() true: open (it is G\'s gate, whatever current() says)');
  ok(!EupTaste.gate(village({ G: Object.assign(Gcur(T), { tasteReady: () => false }), v43: { lay: 0, seen: { g43all: 1 } } }).gs), 'G.tasteReady() false: closed (also with g43all and current() = row 10)');
  ok(EupTaste.gate(village({ G: Object.assign(Gcur('g43_deco'), { tasteReady: () => false }), v43: { lay: 0, seen: { g43ready: 1 } } }).gs), 'seen.g43ready keeps it open whatever G says now (sticky, BP-43)');
  ok(!EupTaste.gate(village({ v43: { lay: 0, seen: { g43all: 1, g43ready: 1, eup_taste: 1 } } }).gs), 'seen.eup_taste: closed for good');
  EupTaste.enabled = false;
  ok(!EupTaste.gate(village().gs), 'EupTaste.enabled false (v4.4 retires it): closed');
  EupTaste.enabled = true;
  const v = village();
  ok(EupTaste.place(v.gs) === null, 'EupTaste.place: null while no pad stands');
  v.gs.eupTaste = { pad: { x: 10.4, y: 20.6 } };
  const pl = EupTaste.place(v.gs);
  ok(pl && pl.x === 10 && pl.y === 21 && pl.ref === v.gs.eupTaste.pad && pl.pad === pl.ref, 'EupTaste.place: { x, y, pad, ref } for G\'s row 10', pl);
}

// ================================================================== 3
console.log('3 attach');
{
  const { gs } = village();
  EupTaste.attach(gs, { fresh: false });
  const a = gs.eupTaste;
  ok(a && gs.events.count('update') === 1 && gs.events.count('shutdown') === 1, 'one run: an update and a shutdown listener on the scene');
  EupTaste.attach(gs, { fresh: false });
  ok(gs.eupTaste !== a && a.dead && gs.events.count('update') === 1 && gs.events.count('shutdown') === 1, 'a second attach (a restart) lets the first go: still one of each');
  EupTaste.enabled = false;
  const b = village().gs;
  EupTaste.attach(b, {});
  ok(!b.eupTaste && b.events.count('update') === 0, 'enabled false: attach does nothing');
  EupTaste.enabled = true;
  gs.events.emit('shutdown');
}

// ================================================================== 4
console.log('4 the scene');
{
  const { gs, calls, venue } = village({ v43: { lay: 0 } });
  EupTaste.attach(gs, {});
  const R = gs.v4.rank, T = gs.eupTaste;
  const flags0 = JSON.stringify(gs.progress.flags);
  const at0 = v43.recent().length;
  R.cT = 7; R.steps = [];
  ok(T.start() === true, 'start()');
  ok(R.hold === 'taste' && R.ceremonyOn === true && R.cerOn === false && R.state().ceremony === false && R.state().hold === 'taste', 'hold = taste: ceremonyOn reads true; cerOn and state().ceremony stay false', R.state());
  const hf = Rank.hallFrame(venue);
  ok(calls.cam.length >= 1 && calls.cam[0][0] === hf.x && calls.cam[0][1] === hf.y && calls.cam[0][2] === BALANCE.goals43.taste.len * 1000, 'framed at Rank.hallFrame(venue) for the whole length', calls.cam[0]);
  let ticks = 0;
  const tc = R.tickCeremony; R.tickCeremony = () => { ticks++; };
  const beat = (s) => { while (T.t < s) { step(gs, 0.05); R.update(0.05); } };
  beat(0.6);
  ok(calls.party === 1 && calls.gather === 1, '0.5 s: the residents gather (party) and our visitors from town');
  beat(1.3);
  ok(calls.banner.length === 1 && calls.banner[0][0] === STRINGS.ko.taste_banner && calls.banner[0][2] && calls.banner[0][2].step === true, '1.2 s: the banner 「읍장 취임 맛보기」 (opts.step: onboarding never holds it)', calls.banner);
  beat(3.1);
  ok(calls.burst >= 4 && calls.badge.length === 1 && calls.badge[0][0] === venue.x && calls.badge[0][1] === venue.y - 60, '2–3 s: confetti; 3.0 s: the badge flies from the venue (venue.y − 60)', { burst: calls.burst, badge: calls.badge });
  beat(4.1);
  ok(calls.cheer === 1, '4.0 s: the residents cheer');
  beat(8.1);
  ok(T.teaserShown && T.on, '8.0 s: the teaser (the scene waits)');
  ok(ticks === 0 && R.cT === 7 && R.cerOn === false, 'Rank.update never ticked its ceremony meanwhile', { ticks, cT: R.cT });
  R.tickCeremony = tc;
  beat(19.9);
  ok(T.on, 'still waiting for [좋아요] at 19.9 s');
  step(gs, 0.2);
  ok(!T.on && T.stats.ends === 1 && T.stats.skips === 0, 'cardAuto (' + BALANCE.goals43.taste.cardAuto + ' s) ends it', T.state && { on: T.on, t: T.t });
  ok(R.hold === null && R.ceremonyOn === false, 'hold cleared');
  ok(same(gs.v43, { lay: 0, seen: { eup_taste: 1 } }) && calls.save >= 1, 'it wrote only v43.seen.eup_taste (a holder without seen got one) and saved', gs.v43);
  ok(calls.coins === 0 && JSON.stringify(gs.progress.flags) === flags0 && gs.economy.coins === 5000 && R.level === 2, 'no coins added or spent, progress.flags and the rank unchanged');
  ok(same(busTaste(at0), ['start', 'title', 'teaser', 'end']), 'the bus: start, title, teaser, end', busTaste(at0));
  ok(gs.camFocus === null, 'the camera goes back to the chief (camFocus null)');
  step(gs, 1.0);
  ok(!T.on && T.stats.starts === 1, 'it does not start again by itself');
  gs.events.emit('shutdown');
}

// ================================================================== 5
console.log('5 skip and the balance clock');
{
  const ov = Input.override;
  {
    const { gs } = village();
    EupTaste.attach(gs, {});
    const T = gs.eupTaste, at0 = v43.recent().length;
    T.start();
    step(gs, 1.0);
    Input.override = { x: 1, y: 0 }; step(gs, 0.3); Input.override = null; step(gs, 0.1);
    ok(T.on, 'a drag at 1 s (before skipAfter): no skip');
    step(gs, 3.0);
    Input.override = { x: 0, y: 1 }; step(gs, 0.1); Input.override = null;
    ok(!T.on && T.stats.skips === 1 && gs.v43.seen.eup_taste === 1 && gs.v4.rank.hold === null && busTaste(at0).slice(-1)[0] === 'skip', 'a drag after 3 s skips: the same end state (seen, no hold), bus skip', { t: T.t, seen: gs.v43.seen });
    gs.events.emit('shutdown');
  }
  {
    const { gs } = village();
    EupTaste.attach(gs, {});
    const T = gs.eupTaste;
    Input.override = { x: 0.6, y: 0 };
    T.start();
    step(gs, 4.5);
    ok(T.on && T.t > 4, 'a drag held from the start does not skip (4.5 s)');
    Input.override = null; step(gs, 0.2);
    ok(T.on, 'nor letting it go');
    Input.override = { x: 0.6, y: 0 }; step(gs, 0.1); Input.override = null;
    ok(!T.on && T.stats.skips === 1, 'a fresh drag then skips');
    gs.events.emit('shutdown');
  }
  Input.override = ov;
  {
    const B = BALANCE.goals43.taste, keep = Object.assign({}, B);
    Object.assign(B, { len: 12, cardAuto: 10, skipAfter: 2 });
    const { gs } = village();
    EupTaste.attach(gs, {});
    const T = gs.eupTaste;
    T.start();
    step(gs, 9.9);
    const on = T.on;
    step(gs, 0.2);
    ok(on && !T.on && T.t >= 10 && T.t < 10.3, 'goals43.taste sets the clock (cardAuto 10 s ends it)', { t: T.t });
    Object.assign(B, keep);
    gs.events.emit('shutdown');
  }
}

// ================================================================== 6
console.log('6 a scene shutdown mid-scene');
{
  const { gs, calls } = village({ v43: { lay: 0, seen: { g43all: 1 } } });
  EupTaste.attach(gs, {});
  const T = gs.eupTaste, R = gs.v4.rank;
  T.start();
  step(gs, 4.0);
  const mid = R.hold;
  gs.events.emit('shutdown');
  ok(mid === 'taste' && R.hold === null && !T.on && T.dead, 'the hold is gone with the scene', { mid, hold: R.hold });
  ok(same(gs.v43.seen, { g43all: 1 }) && calls.save === 0, 'nothing written, nothing saved: the pad is back next time', gs.v43);
  ok(gs.events.count('update') === 0 && gs.events.count('shutdown') === 0 && !gs.eupTaste, 'every listener removed; gs.eupTaste let go');
  step(gs, 1.0);
  ok(!T.on && R.hold === null, 'a stray update after it does nothing');
}

// ================================================================== 7
console.log('7 robustness: a failing card never keeps the village held; the music comes back to the player\'s slider');
{
  // a card in the UI scene whose layout (tick) and close throw: the scene still ends on its clock, the hold is cleared and
  // the marker written
  const { gs } = village({ v43: { lay: 0, seen: { g43all: 1 } } });
  const bad = { dead: false, onOk: null, opened: [], open(p) { this.opened.push(p); return true; }, tick() { throw new Error('layout'); }, close() { throw new Error('close'); }, state: () => null };
  const U = { ready: true, add: {}, eupTaste: bad };
  gs.scene = { get: (k) => (k === 'UI' ? U : null) };
  const err = console.error; console.error = () => {};
  EupTaste.attach(gs, {});
  const T = gs.eupTaste, R = gs.v4.rank;
  T.start();
  step(gs, 21.5);
  console.error = err;
  ok(bad.opened.join() === 'title,teaser' && !T.on && R.hold === null && gs.v43.seen.eup_taste === 1, 'a card whose tick and close throw: the scene ends at cardAuto, no hold left, the marker written', { on: T.on, hold: R.hold, seen: gs.v43.seen, opened: bad.opened });
  gs.events.emit('shutdown');
}
{
  // the music: ducked to a quarter of the player's own slider volume, back to it at the end, and at once (no tween) when
  // the scene goes down mid-taste (a restart keeps the same track playing)
  const { Audio } = await imp('src/core/Audio.js');
  const { Settings } = await imp('src/core/Save.js');
  const keep = { music: Audio.music, key: Audio.musicKey, vol: Settings.data.vol && Settings.data.vol.music };
  const m = { v: null, setVolume(x) { this.v = x; return this; } };
  Audio.music = m; Audio.musicKey = 'bgm_village';
  Settings.data.vol = Object.assign({}, Settings.data.vol || {}, { music: 0.4 });
  const full = Audio.baseVolume('bgm_village') * 0.4;
  const { gs } = village({ v43: { lay: 0, seen: { g43all: 1 } } });
  EupTaste.attach(gs, {});
  const T = gs.eupTaste;
  T.duck(true, true);
  const ducked = m.v;
  T.start();
  step(gs, 4.0);
  m.v = 'ducked';
  gs.events.emit('shutdown');
  ok(Math.abs(ducked - full * 0.25) < 1e-9 && Math.abs(m.v - full) < 1e-9, 'the duck honours the music slider (a quarter of base × slider), and a shutdown mid-scene puts the music back at once', { ducked, after: m.v, full });
  Audio.music = keep.music; Audio.musicKey = keep.key;
  if (keep.vol !== undefined) Settings.data.vol.music = keep.vol;
}

console.log(fail === 0 ? 'taste.test: ' + pass + ' passed, 0 failed' : 'taste.test: ' + pass + ' passed, ' + fail + ' FAILED');
process.exit(fail ? 1 : 0);
