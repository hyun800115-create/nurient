// The Ports facade (docs/v5_v8_plan.md §5.3) played by the lab: everything the missions and bank hosts ask of the
// game, answered from the lab's stand-in world (World scene), its HUD stand-in (UI scene) and a FakeWorld (clock,
// facts, people). The surface is the one the lead's src/kit/Ports.js gives the real game (see the build report's
// "Ports used" table): world / ui / coins / income / clock / lang / rank / facts / people / places / chief / say /
// sound / view / settings / rewards / later / sites / progress / story / emit.

import { Assets } from '../../../src/core/Assets.js';
import { View } from '../../../src/core/View.js';
import { figure } from './lab.js';

const TELLERS = ['npc_clerk_a', 'npc_clerk_b', 'npc_merchant'];

export function makePorts(world) {
  const LAB = window.__LAB;
  const fw = world.fw, ui = world.ui;
  let earned = 0;                       // v4 income since the bank last asked (module payouts excluded)
  const sounds = LAB.sounds = [];
  // a stand-in for vehicles_runtime's API: a drive "takes" a few seconds and reports veh:driveDone (★★★)
  LAB.drives = [];
  const vehicles = {
    drive: (spec) => new Promise((resolve) => {
      LAB.drives.push(spec);
      world.time.delayedCall((LAB.driveSecs || 4) * 1000, () => { world.missions.onFeed({ t: 'veh:driveDone', mid: spec.mid, tpl: spec.tpl, stars: 3 }); resolve({ stars: 3, timeS: 60, par: 70 }); LAB.drives.splice(LAB.drives.indexOf(spec), 1); });
    }),
    chiefDriving: () => LAB.drives.length > 0,
  };
  const ports = {
    world: { scene: world },
    ui: {
      scene: ui, safeTop: 0, safeBottom: 0,
      toast: (m, h) => ui.toast(m, h),
      banner: (m, s) => ui.banner(m, s),
      coinFly: (x, y, n) => ui.coinFly(x, y, n),
      overview: () => false,
      panelOpened: (on) => { ui.panels = Math.max(0, ui.panels + (on ? 1 : -1)); },
      orderChip: () => !!LAB.orderChip,
    },
    coins: {
      value: () => ui.coins,
      add: (n, x, y, fly, tag) => { n = Math.floor(n); if (n <= 0) return; ui.coins += n; if (!tag) earned += n; if (fly && x !== undefined) ui.coinFly(x, y, Math.min(10, Math.max(3, Math.round(n / 150)))); },
      spend: (n) => { n = Math.min(ui.coins, Math.floor(n)); ui.coins -= n; return n; },
    },
    income: { perMin: () => fw.I, takeEarned: () => { const e = earned; earned = 0; return e; } },
    clock: { T: () => fw.T, hour: () => fw.hour(), day: () => fw.day(), wall: () => fw.env.wall(), uptime: () => fw.env.uptime(), localDate: () => fw.env.localDate() },
    lang: () => LAB.lang,
    rank: () => fw.rankN,
    facts: { has: (c) => fw.facts.has(c), count: (k) => fw.counts[k] || 0 },
    people: {
      pick: (role, ctx) => {
        // only people who are standing in the lab can be asked
        const r = fw.env.people.pick(role, Object.assign({}, ctx, { exclude: new Set([...((ctx && ctx.exclude) || []), ...Object.keys(fw.roster).filter((p) => !world.people.has(p))]) }));
        return r;
      },
      has: (pid) => world.people.has(pid) || !!fw.roster[pid],
      onScreen: (pid) => { const f = world.people.get(pid); return !!f && ports.view.onScreen(f.obj.x, f.obj.y, 0); },
      name: (pid, lang) => fw.env.people.name(pid, lang),
      pos: (pid) => { const f = world.people.get(pid); return f ? { x: f.obj.x, y: f.obj.y + (f.pose === 'sit' ? 22 : 0), headTop: f.headTop - (f.pose === 'sit' ? 22 : 0) } : null; },
      portrait: (pid) => { const f = world.people.get(pid); return f ? 'portrait_' + f.key : null; },
      react: (pid, anim, emote) => {
        const f = world.people.get(pid);
        if (!f) return;
        const prev = f.pose, dir = f.dir;
        f.setPose(anim, dir === 'N' || dir === 'NE' || dir === 'NW' ? 'S' : dir);
        world.time.delayedCall(1400, () => f.setPose(prev === 'walk' ? 'idle' : prev, dir));
        if (emote && Assets.has(emote)) {
          const e = Assets.image(world, f.obj.x, f.obj.y + f.headTop - 30, emote).setDepth(40001);
          e.setScale(0.1);
          world.tweens.add({ targets: e, scale: 0.75, y: e.y - 30, duration: 300, ease: 'Back.easeOut' });
          world.tweens.add({ targets: e, alpha: 0, delay: 1300, duration: 300, onComplete: () => e.destroy() });
        }
      },
      figure: (who, idx) => {
        let key;
        if (who === 'job:bank_teller') key = TELLERS[idx % TELLERS.length];
        else if (who === 'job:bank_manager') key = 'npc_uncle';
        else key = (LAB.figureOf && LAB.figureOf(who)) || 'npc_young_man';
        const f = figure(world, key, 0, 0);
        f.shadow.setVisible(false);          // the bank moves obj only (its floor art has the shading)
        return f;
      },
      nearby: (x, y, n) => Array.from(world.people.values()).filter((f) => !f.pid.startsWith('pet:')).sort((a, b) => Math.hypot(a.obj.x - x, a.obj.y - y) - Math.hypot(b.obj.x - x, b.obj.y - y)).slice(0, n).map((f) => f.pid),
      // the game leases a resident to walk behind the chief (escort, a found pet): here the figure just follows
      follow: (pid, on) => { const f = world.people.get(pid); if (f) { f.follow = !!on; if (!on) { f.setPose('happy', 'S'); world.time.delayedCall(1200, () => f.setPose('idle', f.dir)); } } },
    },
    places: {
      pos: (id) => { const p = world.places.get(id); return p ? { x: p.x, y: p.y } : null; },
      list: (kind) => Array.from(world.places.entries()).filter(([, p]) => p.kind === kind).map(([id, p]) => ({ id, x: p.x, y: p.y })),
      name: (id, lang) => ({ 'p:rink': lang === 'en' ? 'the rink' : '스케이트장', 'p:school': lang === 'en' ? 'the school' : '학교', 'p:snowman': lang === 'en' ? 'the snowman' : '눈사람' })[id] || '',
      findSpot: (what, near, id) => (LAB.findAt ? LAB.findAt : (() => { const a = (id * 2.4) % (Math.PI * 2); return { x: (near ? near.x : 1000) + Math.cos(a) * 260, y: (near ? near.y : 700) + Math.sin(a) * 130 }; })()),
    },
    chief: {
      x: () => world.chiefFig.obj.x, y: () => world.chiefFig.obj.y,
      moving: () => !!world.chiefMove,
      onPad: () => !!LAB.onPad,
      count: (item) => world.count(item),
      take: (item, n, tx, ty) => world.take(item, n, tx, ty),
      flyIn: (item, x, y) => world.fly(item, x, y, world.chiefFig.obj.x, world.chiefFig.obj.y - 100),
      flyBag: (item, n, tx, ty) => { for (let i = 0; i < Math.min(n, 6); i++) world.fly(item, world.chiefFig.obj.x, world.chiefFig.obj.y - 100, tx, ty, i * 90); },
    },
    say: (pid, text, emote, dur) => { const f = world.people.get(pid); if (f) ui.say(f, text, emote, dur); },
    sound: { play: (k, o) => sounds.push(k), at: (k) => sounds.push(k) },
    view: {
      k: () => View.k,
      toScreen: (x, y) => ui.toScreen(x, y),
      onScreen: (x, y, m = 0) => { const p = ui.toScreen(x, y); return p.x > -m && p.x < ui.W + m && p.y > -m && p.y < ui.H + m; },
    },
    settings: { get: (k) => (k === 'missionToasts' ? true : undefined) },
    rewards: {
      decor: (key) => { LAB.log.push('decor ' + key); world.placeDecor(key); },
      voucher: (key) => LAB.log.push('voucher ' + key),
      effect: (key) => LAB.log.push('effect ' + key),
    },
    later: (id) => (id === 'missions' ? world.missions && world.missions.api : id === 'bank' ? world.bank && world.bank.api : id === 'vehicles' ? vehicles : null),
    // the station's standing order (v4 Growth.focusCard), read only
    orders: { focus: () => LAB.order || null },
    // the chief's buildings for fire insurance (v8): the game lists founded shops, houses and civic buildings
    buildings: { list: () => [
      { id: 'shop:bakery#1', name: { ko: '빵집', en: 'Bakery' }, cost: 12000 },
      { id: 'house:row_d_12', name: { ko: '김씨네 집', en: 'The Kims\' house' }, cost: 8000 },
      { id: 'town_hall', name: { ko: '마을회관', en: 'Town hall' }, cost: 30000 },
      { id: 'shop:carpenter#2', name: { ko: '목공소', en: 'Carpenter' }, cost: 15000 },
    ] },
    assets: { fragment: () => null },
    sites: { offer: (def) => LAB.log.push('site ' + def.id) },
    progress: { setFlag: (f) => LAB.log.push('flag ' + f) },
    story: { passbook: (pid) => (LAB.books && LAB.books[pid]) || null },
    emit: (e) => { LAB.events.push(e); if (LAB.events.length > 600) LAB.events.splice(0, 300); },
  };
  return ports;
}
