// A headless village for the host-level tests (Node): the real MissionsHost + BankHost (views off) over FakeWorld,
// with people and places at fixed spots, a chief who walks at 250 px/s, item sources the chief can fill his stack
// at, a stand-in vehicles API (a drive takes `par` seconds and reports veh:driveDone), and a feed of everyday village
// life. The "honest bot" (play()) only does what a player can: walk to the hint target, stand still, carry items,
// tap 받기 / 출발 / 후원, talk to residents — it never calls model.step directly (critique C-2 f).

// a minimal Phaser stand-in so the hosts' view imports load (views are off: nothing is drawn)
const make = () => new Proxy(function () {}, { get: (t, k) => (k === 'prototype' ? {} : make()), construct: () => ({}), apply: () => make() });
class Base {}
if (!globalThis.Phaser) {
  globalThis.Phaser = new Proxy({}, { get: (t, k) => {
    if (k === 'GameObjects') return new Proxy({}, { get: () => Base });
    if (k === 'Math') return { Clamp: (v, a, b) => Math.max(a, Math.min(b, v)), Linear: (a, b, t) => a + (b - a) * t, Distance: { Between: (a, b, c, d) => Math.hypot(c - a, d - b) } };
    return make();
  } });
}
globalThis.window = globalThis.window || { addEventListener() {}, devicePixelRatio: 1, innerWidth: 390, innerHeight: 844 };
globalThis.document = globalThis.document || { createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {} };

const { MissionsHost } = await import('../../../src/missions/host.js');
const { BankHost } = await import('../../../src/bank/host.js');
const { FakeWorld } = await import('./fake_world.mjs');
const { unitsOf } = await import('../../../src/missions/model/units.js');

export const PLACES = {
  'p:snowman': [900, 900], 'p:feast': [1000, 800], 'p:officiant': [1040, 760], 'p:school_gate': [1600, 600], 'p:towers': [300, 300],
  'p:tower1': [260, 280], 'p:tower2': [420, 240], 'p:tower3': [340, 420], 'p:reporter': [950, 950], 'p:statue': [980, 990],
  'p:statue1': [940, 1010], 'p:statue2': [1020, 1040], 'p:statue3': [1060, 980], 'p:festival': [1000, 1000], 'p:carpenter': [400, 900],
  'p:picnic': [1100, 1100], 'p:plaza': [1000, 1000], 'p:board': [1010, 640], 'p:farm': [300, 1300], 'p:yard': [1800, 1200],
  'p:rink': [640, 1240], 'p:depot': [1900, 700], 'p:school': [1650, 650], 'p:clinic': [1500, 400], 'p:memorial': [700, 300], 'p:bank': [2140, 860],
  'p:bakery': [800, 830], 'p:gift': [1270, 1150], 'p:old_sign': [100, 1000], 'p:t_fountain': [1300, 500],
};
/** where the chief can fill his stack with an item (a shop / station in the game) */
const SOURCE = [600, 700];
const BEDS = [{ id: 'flowerbed1', x: 1030, y: 1160 }];

export function makeHeadless(opts = {}) {
  const fw = new FakeWorld(Object.assign({ rank: 2, income: 1800 }, opts.world || {}));
  const pids = Object.keys(fw.roster);
  const pos = {};
  pids.forEach((p, k) => { pos[p] = { x: 500 + (k % 6) * 170, y: 450 + Math.floor(k / 6) * 230 }; });
  Object.assign(pos, opts.pos || {});
  const places = Object.assign({}, PLACES, opts.places || {});
  const chief = { x: 1000, y: 1000, moving: false, stack: {}, tgt: null };
  let coins = opts.coins === undefined ? 5000 : opts.coins, earned = 0;
  const emitted = [], following = new Set();
  const drives = [];
  const vehicles = opts.vehicles === false ? null : {
    drive(spec) {
      return new Promise((resolve) => { drives.push({ spec, at: fw.T + (opts.drivePar || 25), resolve }); });
    },
    chiefDriving: () => drives.length > 0,
  };
  const later = (id) => (id === 'missions' ? H.m && H.m.api : id === 'bank' ? H.b && H.b.api : id === 'vehicles' ? vehicles : (opts.later && opts.later[id]) || null);
  const ports = {
    world: { scene: null }, ui: { scene: null, toast: (s) => H.toasts.push(s), banner() {}, overview: () => false, panelOpened: (on) => { H.panels += on ? 1 : -1; } },
    coins: { value: () => coins, add: (n, x, y, fly, tag) => { n = Math.floor(n); if (n > 0) { coins += n; if (!tag) earned += n; } }, spend: (n) => { n = Math.min(coins, Math.floor(n)); coins -= n; return n; } },
    income: { perMin: () => fw.I, takeEarned: () => { const e = earned; earned = 0; return e; } },
    clock: { T: () => fw.T, hour: () => fw.hour(), day: () => fw.day(), wall: () => fw.env.wall(), uptime: () => fw.env.uptime(), localDate: () => fw.env.localDate() },
    lang: () => 'ko', rank: () => fw.rankN,
    facts: { has: (c) => fw.facts.has(c), count: (k) => fw.counts[k] || 0 },
    people: {
      pick: (r, c) => fw.env.people.pick(r, c), has: (p) => !!fw.roster[p], onScreen: (p) => fw.screen.has(p), name: (p, l) => fw.env.people.name(p, l),
      pos: (p) => (fw.roster[p] && pos[p] ? Object.assign({ headTop: -80 }, pos[p]) : null),
      react() {}, nearby: (x, y, n) => pids.filter((p) => !p.startsWith('pet:') && fw.roster[p]).sort((a, b) => Math.hypot(pos[a].x - x, pos[a].y - y) - Math.hypot(pos[b].x - x, pos[b].y - y)).slice(0, n),
      follow: (p, on) => { if (on) following.add(p); else following.delete(p); },
    },
    places: {
      pos: (id) => (places[id] ? { x: places[id][0], y: places[id][1] } : null), name: () => '',
      findSpot: (what, near, id) => ({ x: (near ? near.x : 1000) + 180, y: (near ? near.y : 700) + 90 }),
      list: (kind) => (kind === 'flowerbed' ? BEDS : []),
      sourceOf: () => ({ x: SOURCE[0], y: SOURCE[1] }),
    },
    chief: {
      x: () => chief.x, y: () => chief.y, moving: () => chief.moving, count: (it) => chief.stack[it] || 0,
      take: (it, n) => { const k = Math.min(n, chief.stack[it] || 0); chief.stack[it] = (chief.stack[it] || 0) - k; return k; },
      onPad: () => !!chief.onPad,
    },
    say: (pid, text) => H.said.push([pid, text]), sound: { play() {}, at() {} }, view: { k: () => 1, toScreen: (x, y) => ({ x, y }), onScreen: () => true },
    settings: { get: () => true }, rewards: { decor: (k) => H.log.push('decor ' + k), voucher() {}, effect() {} },
    later, sites: { offer: (d) => emitted.push({ t: 'site', d }) }, progress: { setFlag() {} }, story: { passbook: () => null },
    emit: (e) => { emitted.push(e); if (emitted.length > 4000) emitted.splice(0, 2000); },
  };
  const H = { fw, ports, chief, pos, places, emitted, following, drives, toasts: [], said: [], log: [], panels: 0,
    get coins() { return coins; }, set coins(v) { coins = v; } };
  H.m = new MissionsHost(ports, opts.saved || null, { seed: opts.seed || 7, views: false });
  if (opts.bank) H.b = new BankHost(ports, opts.bankSaved || null, { views: false });
  /** one frame: world clock, the stand-in vehicles, the chief's walk, the hosts */
  H.step = (dt = 0.1) => {
    fw.advance(dt);
    for (let k = drives.length - 1; k >= 0; k--) {
      const d = drives[k];
      if (fw.T < d.at) continue;
      drives.splice(k, 1);
      const ev = { t: 'veh:driveDone', tpl: d.spec.tpl, mid: d.spec.mid, stars: 3, s: 20, par: 25 };
      H.m.onFeed(ev);
      d.resolve({ stars: 3, timeS: 20, par: 25 });
    }
    if (chief.tgt) {
      const dx = chief.tgt.x - chief.x, dy = chief.tgt.y - chief.y, d = Math.hypot(dx, dy), sp = 250 * dt;
      if (d <= sp) { chief.x = chief.tgt.x; chief.y = chief.tgt.y; chief.tgt = null; chief.moving = false; }
      else { chief.x += (dx / d) * sp; chief.y += (dy / d) * sp; chief.moving = true; }
    } else chief.moving = false;
    if (H.b) H.b.update(dt);
    H.m.update(dt);
  };
  H.run = (secs, dt = 0.1) => { for (let t = 0; t < secs - 1e-9; t += dt) H.step(dt); };
  H.walkTo = (x, y) => { chief.tgt = { x, y }; };
  H.teleport = (x, y) => { chief.x = x; chief.y = y; chief.tgt = null; chief.moving = false; };
  H.feed = (ev) => { H.m.onFeed(ev); if (H.b) H.b.onFeed(ev); };
  return H;
}

/** everyday village life (sales, production, trains …) for one game second at step s */
export function village(H, rng, s) {
  const f = (ev) => H.feed(ev);
  if (rng.chance(0.12)) f({ t: 'sold', item: rng.pick(['item_bread', 'item_fish_cooked', 'item_meat_cooked']), n: 1, value: 7 });
  if (rng.chance(0.08)) f({ t: 'produced', item: rng.pick(['item_plank', 'item_ingot', 'item_meat_cooked', 'item_bread']), n: 1 });
  if (rng.chance(0.03)) f({ t: 'crafted', item: 'item_can', n: 3 });
  if (rng.chance(0.04)) f({ t: 'traded', item: 'item_plank', n: 1 });
  if (rng.chance(0.02)) f({ t: 'visitorDone' });
  if (s % 70 === 0) f({ t: 'train', ev: 'arrive', n: 6 });
  if (H.fw.facts.has('b:depot') && s % 50 === 0) f({ t: 'veh:arrive', line: 1, riders: 5 });
  if (H.fw.facts.has('b:big_restaurant') && rng.chance(0.05)) f({ t: 'restMeal', price: 20, combo: rng.chance(0.5) });
  if (H.fw.facts.has('b:boat_fishing') && s % 90 === 0) f({ t: 'boatHome', catch: { item_fish_raw: 6, item_fish_big: 1 } });
  if (s % 40 === 0) f({ t: 'wholesale', n: 6 });
  if (s % 600 === 0 && s) f({ t: 'day', day: H.fw.day() });
}

/**
 * the honest bot, one decision per call: work on the focus mission (or the oldest one with a target), accept a
 * bubble when it can, and do what the hint says. Returns a short tag of what it did (for debugging).
 */
export function play(H, rng) {
  const M = H.m, m = M.model, P = H.ports, ch = H.chief;
  // take a request now and then (a tap on 받기)
  for (const i of m.bubbles()) if (m.acceptedRequests() < 3 && rng.chance(0.3)) M.accept(i.id);
  const work = m.list.filter((i) => i.s === 'a' || i.s === 'b');
  const order = work.sort((a, b) => (a.d || 1e12) - (b.d || 1e12) || a.t0 - b.t0);
  for (const i of order) {
    const c = M.current(i);
    if (!c) continue;
    const u = c.u;
    if (u.t === 'deliver') {
      const items = u.item ? [u.item] : u.any;
      const it = items[0], left = u.need - i.g[c.j];
      if (it in m.bag) {
        if ((m.bag[it] || 0) <= 0) {
          // the craft pads (views in the game): the bot "uses" them at their places
          const at = it === 'item_bouquet' ? BEDS[0] : it === 'item_cake' ? { x: PLACES['p:bakery'][0], y: PLACES['p:bakery'][1] } : { x: PLACES['p:gift'][0], y: PLACES['p:gift'][1] };
          if (Math.hypot(at.x - ch.x, at.y - ch.y) > 40) { H.walkTo(at.x, at.y); return 'to-pad'; }
          if (it === 'item_bouquet') m.pick(1); else m.craft(it, 1);
          return 'craft';
        }
      } else if ((ch.stack[it] || 0) < Math.min(left, 5)) {
        if (Math.hypot(SOURCE[0] - ch.x, SOURCE[1] - ch.y) > 40) { H.walkTo(SOURCE[0], SOURCE[1]); return 'to-source'; }
        ch.stack[it] = (ch.stack[it] || 0) + Math.min(20, left);
        return 'fill';
      }
      const t = M.targetOf(i);
      if (t) { if (Math.hypot(t.x - ch.x, t.y - ch.y) > 30) H.walkTo(t.x, t.y); return 'deliver'; }
      continue;
    }
    if (u.t === 'count') {
      // the player does the counted thing at a fair pace (sells, rides, plays with 콩이, picks flowers …)
      const sig = u.sig;
      if (sig === 'flower') { const b = BEDS[0]; if (Math.hypot(b.x - ch.x, b.y - ch.y) > 40) { H.walkTo(b.x, b.y); return 'to-bed'; } m.pick(1); return 'pick'; }
      if (sig === 'chat') { const p = P.people.nearby(ch.x, ch.y, 6)[rng.int(6)]; if (p) H.feed({ t: 'tap', pid: p, talk: true }); return 'chat'; }
      continue;    // (everyday village life moves the rest)
    }
    if (u.t === 'step') {
      if (u.how === 'drive') {
        const t = M.targetOf(i);
        if (H.drives.length) return 'driving';
        if (t && Math.hypot(t.x - ch.x, t.y - ch.y) > 40) { H.walkTo(t.x, t.y); return 'to-yard'; }
        if (M.startDrive(i.id)) return 'drive';
        continue;
      }
      if (u.how === 'pay') { if (M.fund(i.id)) return 'fund'; continue; }
      if (u.how === 'ask') { const ps = P.people.nearby(ch.x, ch.y, 8); const p = ps[rng.int(ps.length)]; if (p) { H.walkTo(H.pos[p].x, H.pos[p].y); H.feed({ t: 'tap', pid: p, talk: true }); } return 'ask'; }
      const t = M.targetOf(i);
      if (t) { if (Math.hypot(t.x - ch.x, t.y - ch.y) > 30) H.walkTo(t.x + 1, t.y + 1); return 'step:' + u.how; }
      continue;
    }
    if (u.t === 'build') { H.feed({ t: 'built', key: u.key }); return 'build'; }
  }
  return 'idle';
}

export { unitsOf };
