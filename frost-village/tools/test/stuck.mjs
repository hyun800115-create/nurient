// (v4.2.0.1) 시민 막힘 · 갇힘 — the designer: "시민들이 물건이나 건물이나 사물에 가려서 이동을 못하거나 갇히는 경우도 있는 거 같아".
// Walkers wedged by goods, buildings and props, or trapped inside walls. Fixed-step clock, one browser, 390x844.
//   node tools/test/stuck.mjs                  the census (A) on a fresh game + the late fixtures, then the checks (B)
//   node tools/test/stuck.mjs --all            the census on every fixture in tools/test/fixtures (--fixtures fresh,v42_village_late:
//                                              those; --secs N game seconds each, default 75)
//   node tools/test/stuck.mjs --only B         (or A) one part; --root <dir> another build (the base, to see it fail);
//                                              --pick V1,V13 only those checks of B
// A  census: every walker (moveAgent / followRoute / the 관망 chief) sampled every 0.25 s for `CENSUS_S` game s:
//      wedge   wants to move for 8 s, stays inside a 30 px circle, more than 40 px from where it heads
//      trap    on the floor of a walled building (office, bank, depot) for 15 s while heading for a place outside it
//      far     a carrier's walk (porters, workers, the courier) 'arrived' more than 150 px short of its end
//    passes with 0 of each (a fresh game gets unlockAll, the late saves 관망).
// B  one check per confirmed finding (stuck/verify): V1 courier out of the office door / into the bank door, V2 관망 chief
//    out of the office after a desk act, V3 hunt pile -> dock, V4 the fog's edge (rail open, 'se' closed), V5 out of the
//    office / bank / depot, V6 worker homes, V7 the dog and the office wall, V8 ore pile vs rock, V9 lot shops' unload
//    points, V10 terrace step-out points, V11 rod spots, V12 drop spots, V13 a resident across a fence, V14 animals.
//    (v4.2.0.1 final, the review round) F1 a walker held off its spot walks on once the blocker goes, F2 smokehouse-yard
//    legs to the dock leave by the yard's gate, F3 step-out points after 테이블 늘리기, F4 rocks never grow back over
//    someone / stand points never on a mined-out neighbour, F5 a second walk to the same spot after a pause is walked
//    to the end (soak R5).
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { start } from './serve.mjs';
import { launch, openPage, tapStart, sleep, waitFor } from './pw.mjs';
import { installStepper, advance, render } from './fv_step.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const ONLY = (arg('--only') || 'AB').toUpperCase();
const BUILD = arg('--root');
const ALL = argv.includes('--all');
const PICK = arg('--pick') ? arg('--pick').toUpperCase().split(',') : null;      // --pick V1,V13: only those checks
const want = (id) => !PICK || PICK.includes(id);
const CENSUS_S = Number(arg('--secs')) || 75;
const FX = path.join(ROOT, 'tools/test/fixtures');
const LATE = ['v35_save_38min.json', 'v41_save_pure_45min.json', 'v41_save_smart_35min.json', 'v41_save_smart_46min.json', 'v42_save_office_ttal.json', 'v42_village_late.json'];
const CENSUS = arg('--fixtures') ? arg('--fixtures').split(',').map((f) => (f === 'fresh' ? null : f.endsWith('.json') ? f : f + '.json')) : [null].concat(ALL ? fs.readdirSync(FX).filter((f) => f.endsWith('.json')).sort() : LATE);

const results = [];
const step = (name, ok, info = '') => { results.push({ name, ok: !!ok }); console.log((ok ? '  ok  ' : ' FAIL ') + name + (info !== '' ? '  — ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); };
const keysOf = (f) => { const o = JSON.parse(fs.readFileSync(path.join(FX, f), 'utf8')); return o.keys ? o.keys : { 'frostVillage.save.v1': JSON.stringify(o) }; };

const srv = await start(0, { prefix: '/fv/', root: BUILD || undefined });
const browser = await launch();
const { page, log } = await openPage(browser, srv.url + 'index.html', { viewport: { width: 390, height: 844 }, dpr: 1 });
const ev = (fn, a) => page.evaluate(fn, a);
const run = (s) => ev((x) => window.__step.run(x, (dt) => { if (window.__hook) window.__hook(dt); }), s);

async function boot(fixture) {
  await ev((K) => { const gs = window.__FV && window.__FV.scene; if (gs) gs.save = () => {}; localStorage.clear(); if (K) for (const k in K) localStorage.setItem(k, K[k]); }, fixture ? keysOf(fixture) : null);
  await page.reload({ waitUntil: 'load', timeout: 240000 });
  await waitFor(page, () => window.__FV && window.__FV.game && window.__FV.game.scene.isActive('Title'), 240000);
  await sleep(300);
  await tapStart(page);
  await waitFor(page, () => window.__FV.scene && window.__FV.game.scene.isActive('UI') && window.__FV.scene.player, 240000);
  await sleep(1000);
  await installStepper(page);
  await ev(() => {
    const gs = window.__FV.scene;
    try { window.__FV.v42.v.seen.whatsNew = 1; } catch (e) { /* */ }
    gs.save = () => {};
    if (gs.v4 && gs.v4.clock && gs.v4.clock.set) gs.v4.clock.set(10);
    const C = gs.collision;
    window.__R = (p) => (p ? [Math.round(p.x), Math.round(p.y)] : null);
    window.__gd = (ax, ay, bx, by) => Math.hypot(ax - bx, (ay - by) * 2);
    // which obstacle covers (x, y) at radius rad ('fog' off the revealed land)
    window.__why = (x, y, rad) => {
      if (C.walk && !C.inWalk(x, y)) return 'fog';
      const res = [];
      for (const o of C.all) {
        if (!o.active || res.indexOf(o) >= 0) continue;
        if (o.seg) { const q = C.segNear(o, x, y, rad); if (q.d2 < q.R * q.R) res.push(o); continue; }
        const dx = x - o.x, dy = (y - o.y) * 2, R = o.r + rad;
        if (dx * dx + dy * dy < R * R) res.push(o);
      }
      return res.length ? res.map((o) => (o.tag || '?') + '@' + Math.round(o.x) + ',' + Math.round(o.y)).join(' ') : (C.blocked(x, y, rad) ? 'bounds' : null);
    };
    // the walled buildings' floors (the build's own walls: office / bank / depot footprints)
    const O = gs.v42 && gs.v42.office;
    const polys = [];
    const ph = (P, x, y) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / ((b.y - a.y) || 1e-9) + a.x) c = !c; } return c; };
    window.__floors = () => {
      polys.length = 0;
      if (O && O.building && O.building.cw) polys.push({ id: 'office', P: O.building.cw.floor });
      if (O && O.bank && O.bank.cw) polys.push({ id: 'bank', P: O.bank.cw.floor });
      const D = gs.v42 && gs.v42.depot && gs.v42.depot.building;
      if (D && D.fp) polys.push({ id: 'depot', P: D.fp });
      return polys.map((q) => q.id);
    };
    window.__floorAt = (x, y) => { for (const q of polys) if (ph(q.P, x, y)) return q.id; return null; };
    window.__floors();
  });
}

// ---------------------------------------------------------------- A: the census (observe only)
async function census(label, secs) {
  await ev(() => {
    const gs = window.__FV.scene, gd = window.__gd;
    const S = window.__S = { t: 0, ws: new Map(), cases: [], n: 0, kinds: {} };
    const reg = (a) => { let w = S.ws.get(a); if (!w) { w = { a, cls: (a.constructor && a.constructor.name) || '?', smp: [], want: -1, tx: 0, ty: 0, floorT: 0, last: {} }; S.ws.set(a, w); } return w; };
    const flag = (kind, w, info) => {
      if (w.last[kind] !== undefined && S.t - w.last[kind] < 30) return;
      w.last[kind] = S.t; S.kinds[kind] = (S.kinds[kind] || 0) + 1;
      if (S.cases.length < 40) S.cases.push(Object.assign({ kind, t: +S.t.toFixed(1), cls: w.cls, role: w.a.role || w.a.type || w.a.state || '', at: window.__R(w.a) }, info));
    };
    const om = gs.moveAgent;
    gs.moveAgent = function (a, tx, ty, sp, dt, arr = 8) { const r = om.call(this, a, tx, ty, sp, dt, arr); const w = reg(a); if (!r) { w.want = S.t; w.tx = tx; w.ty = ty; } return r; };
    const of = gs.followRoute;
    const CARRY = /Porter|Hauler|Worker|Courier/;
    gs.followRoute = function (a, sp, dt, tol = 10) {
      const r = a.route, end = r && r.length ? r[r.length - 1] : null;
      const res = of.call(this, a, sp, dt, tol);
      if (res && end) { const w = reg(a), d = gd(a.x, a.y, end.x, end.y); if (d > 150 && CARRY.test(w.cls)) flag('far', w, { d: Math.round(d), end: window.__R(end), why: window.__why(end.x, end.y, 12) }); }
      return res;
    };
    const P = gs.v42 && gs.v42.pilot;
    if (P && gs.v4 && gs.v4.rank) { try { P.start('test'); } catch (e) { /* */ } }
    window.__hook = (dt) => {
      S.t += dt;
      if ((S.n = (S.n + 1) % 15) !== 0) return;
      // the 관망 chief: a walker too
      if (P && P.on && P.route && P.route.length && P.ri < P.route.length && !P.arrived) { const w = reg(gs.player); const q = P.route[P.route.length - 1]; w.want = S.t; w.tx = q.x; w.ty = q.y; }
      for (const w of S.ws.values()) {
        const a = w.a;
        if (a.alive === false || (a.sprite && a.sprite.active === false)) { S.ws.delete(a); continue; }
        const wanting = S.t - w.want < 0.3;
        w.smp.push([S.t, a.x, a.y, wanting]);
        while (w.smp.length && w.smp[0][0] < S.t - 8) w.smp.shift();
        if (wanting && w.smp.length >= 30 && w.smp[0][0] <= S.t - 7.9 && w.smp.every((s) => s[3])) {
          let cx = 0, cy = 0; for (const s of w.smp) { cx += s[1]; cy += s[2]; } cx /= w.smp.length; cy /= w.smp.length;
          let r = 0; for (const s of w.smp) r = Math.max(r, gd(s[1], s[2], cx, cy));
          const td = gd(a.x, a.y, w.tx, w.ty);
          if (r < 30 && td > 40) flag('wedge', w, { r: Math.round(r), to: [Math.round(w.tx), Math.round(w.ty)], td: Math.round(td), why: window.__why(a.x + (w.tx - a.x) * 20 / Math.max(20, td), a.y + (w.ty - a.y) * 20 / Math.max(20, td), 14) });
        }
        const f = window.__floorAt(a.x, a.y);
        if (f && wanting && window.__floorAt(w.tx, w.ty) !== f) { if ((w.floorT += 0.25) >= 15) { flag('trap', w, { floor: f, to: [Math.round(w.tx), Math.round(w.ty)] }); w.floorT = 0; } }
        else w.floorT = 0;
      }
    };
  });
  for (let s = 0; s < secs; s += 5) { await run(5); if (s % 30 === 0) await render(page, 1); }
  const S = await ev(() => { window.__hook = null; const S = window.__S; const P = window.__FV.scene.v42 && window.__FV.scene.v42.pilot; if (P && P.on) try { P.stop('test'); } catch (e) { /* */ } return { walkers: S.ws.size, kinds: S.kinds, cases: S.cases }; });
  const k = S.kinds;
  step('A ' + label + ': no walker wedged 8 s, trapped behind walls or arriving far off (' + S.walkers + ' walkers, ' + secs + ' s)', !(k.wedge || k.trap || k.far), { kinds: k, cases: S.cases.slice(0, 6) });
}

// ---------------------------------------------------------------- B: one check per finding
async function checksLate() {
  // V6 / V11 / V12 / V8 / V10: spots on free ground (static)
  const st = !['V6', 'V8', 'V10', 'V11', 'V12'].some(want) ? null : await ev(() => {
    const gs = window.__FV.scene, C = gs.collision, why = window.__why, R = window.__R, o = {};
    o.homes = [];
    for (const ty of ['fisherman', 'lumberjack', 'farmer', 'miner', 'hunter']) for (let i = 0; i < 5; i++) { const h = gs.workerHome(ty, i); const w = why(h[0], h[1], 14); if (w) o.homes.push(ty + i + ' ' + w); }
    // ((v4.3) the fishermen sit on the fishing deck's stools (on the water, reached by the deck's own lane): each one on his
    //  own stool, seated there — the shore rod spots are gone)
    o.rods = gs.workers.filter((w) => w.type === 'fisherman').map((w) => { const q = gs.deck.stool(w.index); return { i: w.index, at: R(w), seated: !!(w.dk && w.dk.st === 'sit'), d: Math.round(Math.hypot(w.x - q.x, w.y - q.y)) }; }).filter((q) => !q.seated || q.d > 2);
    o.drops = gs.workers.filter((w) => w.pile && w.pile.pad && w.type !== 'fisherman').map((w) => { w._ds = null; const q = w.dropSpot(w.pile.pad); return { k: w.type + w.index, at: R(q), why: why(q.x, q.y, 14) }; }).filter((q) => q.why);
    const ore = gs.piles && gs.piles.ore;
    if (ore && ore.pad) {
      // (the pad, the porters' take spot (+24, +20) and miner #1's drop spot (+10, +38))
      const pts = [[0, 0], [24, 20], [10, 38]].map((d) => ({ x: ore.pad.x + d[0], y: ore.pad.y + d[1] }));
      o.oreClear = Math.round(Math.min(...gs.rocks.map((r) => Math.min(...pts.map((p) => window.__gd(p.x, p.y, r.x, r.y) - (r.r || 31))))));
    }
    const Rr = gs.civic && gs.civic.restaurant;
    o.seatSides = Rr && Rr.seats ? Rr.seats.map((s) => { const q = Rr.seatSide(s); return { at: R(q), why: why(q.x, q.y, 12) }; }).filter((q) => q.why) : [];
    o.seats = Rr && Rr.seats ? Rr.seats.length : 0;
    void C;
    return o;
  });
  if (st) {
  step('V6 every worker home (5 a profession) on free ground', st.homes.length === 0, st.homes.slice(0, 6));
  step('V11 every fisherman sits on his own stool on the fishing deck (v4.3: no shore rod spots)', st.rods.length === 0, st.rods);
  step('V12 every gatherer\'s drop spot on free ground', st.drops.length === 0, st.drops);
  step('V8 the ore pile, its take spot and miner #1\'s drop spot clear every rock by 30 px', st.oreClear >= 30, { clear: st.oreClear });
  step('V10 the terrace seats\' step-out points on free ground (' + st.seats + ' seats)', st.seats > 0 && st.seatSides.length === 0, st.seatSides);
  }

  // V6 dynamic: idle miners stand still at home
  const E = want('V6') && await ev(() => {
    const gs = window.__FV.scene, ms = gs.workers.filter((w) => w.type === 'miner');
    for (const r of gs.rocks) r.reservedBy = { probe: true };
    for (const m of ms) { if (m.release) m.release(); m.node = null; m.state = 'seek'; while (m.stack.items.length) { const s = m.stack.items.pop(); try { gs.effects.releaseItem(s.sprite || s); } catch (e) { /* */ } } m.stack.incoming = 0; m.hungry = false; }
    const rec = window.__E = { t: 0, walk: ms.map(() => 0) };
    window.__hook = (dt) => { rec.t += dt; if (rec.t > 8) ms.forEach((m, k) => { if (m.animName === 'walk') rec.walk[k] += dt; }); };
    return ms.length;
  });
  if (E) { await run(18); const w = await ev(() => { window.__hook = null; for (const r of window.__FV.scene.rocks) if (r.reservedBy && r.reservedBy.probe) r.reservedBy = null; return window.__E.walk.map((x) => +x.toFixed(1)); }); step('V6 idle miners stand at home (walking in place ≤ 2 s of the last 10)', w.every((x) => x <= 2), w); }

  // V3: stand-ins on the game's own route / followRoute: the hunt pile -> the dock and back
  const G = want('V3') && await ev(() => {
    const gs = window.__FV.scene, legs = { hunt2dock: [1515, 2052, 3205, 1552], meat2dock: [1700, 1990, 3205, 1552], dock2hunt: [3205, 1552, 1515, 2052] };
    window.__G = [];
    for (const k in legs) { const [ax, ay, bx, by] = legs[k]; window.__G.push({ k, x: ax, y: ay, radius: 14, alive: true, vx: 0, vy: 0, route: gs.roads.route(ax, ay, bx, by, []), ri: 0, face() {}, locomotion() {}, done: null, end: [bx, by], noSeparate: true }); }
    let t = 0;
    window.__hook = (dt) => { t += dt; for (const a of window.__G) if (!a.done && gs.followRoute(a, 150, dt, 12)) a.done = { t: +t.toFixed(1), d: Math.round(Math.hypot(a.x - a.end[0], a.y - a.end[1])) }; };
    return window.__G.length;
  });
  if (G) { await run(45); const g = await ev(() => { window.__hook = null; return window.__G.map((a) => ({ k: a.k, done: a.done, at: window.__R(a) })); }); step('V3 porters\' long legs (hunt pile <-> dock) arrive at the end, not at the pen\'s fence', g.every((a) => a.done && a.done.d <= 40), g); }

  // V1: the courier from his desk to the trade till and to the bank
  const A = !want('V1') ? false : await ev(() => {
    const gs = window.__FV.scene, O = gs.v42 && gs.v42.office, c = O && O.staff && O.staff.ttal;
    if (!c || !O.building || !O.building.cw || !O.bank) return null;
    window.__FV.teleport(O.building.spots.door.x + 260, O.building.spots.door.y + 160); gs.player.vx = gs.player.vy = 0;
    c.route.length = 0; c.target = null; c.cb = null; c.bag = 0; c.state = 'desk';
    if (!c.seat && c.home.seat) c.sitDown(c.home.seat);
    for (const q of O.tills()) q.till.value = 0;
    const tr = O.tills().find((q) => q.name === 'trade') || O.tills().find((q) => q.till.x > 400);
    tr.till.value = 400; c.waitT = 0; c.dueT = 0;
    const rec = window.__A = { t: 0, inT: 0, scoop: null, dep: null, prev: c.state, bank0: c.deposited };
    window.__hook = (dt) => {
      rec.t += dt;
      if (window.__floorAt(c.x, c.y) === 'office' && c.state !== 'desk' && c.state !== 'home') rec.inT += dt;
      if (c.state !== rec.prev) {
        if (c.state === 'scoop' && c.cur && !rec.scoop) rec.scoop = { t: +rec.t.toFixed(1), d: Math.round(Math.hypot(c.x - c.cur.till.x, c.y - c.cur.till.y)), floor: window.__floorAt(c.x, c.y) };
        if (c.state === 'deposit' && !rec.dep) { const p = O.depositPoint(); rec.dep = { t: +rec.t.toFixed(1), d: Math.round(Math.hypot(c.x - p.x, c.y - p.y)), floor: window.__floorAt(c.x, c.y) }; }
        rec.prev = c.state;
      }
    };
    return true;
  });
  if (A) {
    for (let i = 0; i < 25; i++) { await run(2); if (await ev(() => !!window.__A.dep && window.__A.t > window.__A.dep.t + 2)) break; }
    const a = await ev(() => { window.__hook = null; const a = window.__A; return { inT: +a.inT.toFixed(1), scoop: a.scoop, dep: a.dep, banked: window.__FV.scene.v42.office.staff.ttal.deposited - a.bank0 }; });
    step('V1 the courier leaves the office by its door (on its floor ≤ 4 s on his way out)', a.inT <= 4, a);
    step('V1 he scoops the till standing at it (≤ 80 px), not through a wall', a.scoop && a.scoop.d <= 80 && !a.scoop.floor, a.scoop);
    step('V1 he banks the sack at the counter inside the bank (≤ 60 px), in by its door', a.dep && a.dep.d <= 60 && a.dep.floor === 'bank' && a.banked > 0, a.dep);
  } else if (A === null) step('V1 courier + bank present in the late save', false);

  // V2: 관망 — after a desk act the chief walks out of the office
  const C2 = !want('V2') ? false : await ev(() => {
    const gs = window.__FV.scene, P = gs.v42 && gs.v42.pilot, B = gs.v42 && gs.v42.office && gs.v42.office.building;
    if (!P || !B || !B.cw) return null;
    P.start('test'); P.begin('office');
    window.__FV.teleport(B.spots.deskPad.x, B.spots.deskPad.y);
    P.ri = P.route.length; P.arrived = true; P.pose(P.act);
    return true;
  });
  if (C2) {
    await advance(page, 0.5);
    await ev(() => {
      const gs = window.__FV.scene, P = gs.v42.pilot;
      P.begin('rest');
      const rec = window.__C = { t: 0, inT: 0, out: null, drop0: P.stats.stuck, start: window.__floorAt(gs.player.x, gs.player.y) };
      window.__hook = (dt) => { rec.t += dt; const f = window.__floorAt(gs.player.x, gs.player.y); if (f === 'office') rec.inT += dt; else if (rec.out === null) rec.out = +rec.t.toFixed(1); };
    });
    await run(20);
    const c = await ev(() => { window.__hook = null; const c = window.__C, P = window.__FV.scene.v42.pilot; const r = { start: c.start, inT: +c.inT.toFixed(1), out: c.out, drops: P.stats.stuck - c.drop0 }; P.stop('test'); return r; });
    step('V2 관망: from his desk the chief is out of the office within 6 s (no wall-pressing, no dropped act)', c.out !== null && c.out <= 6 && c.drops === 0, c);
  } else if (C2 === null) step('V2 the office present in the late save', false);

  // V5: a resident and a route walker set inside each walled building get out
  const R5 = want('V5') && await ev(() => {
    const gs = window.__FV.scene, L = gs.life, ids = window.__floors();
    if (!L || !ids.length) return null;
    const polys = [];
    const O = gs.v42 && gs.v42.office;
    if (O && O.building && O.building.cw) polys.push(['office', O.building.cw.floor]);
    if (O && O.bank && O.bank.cw) polys.push(['bank', O.bank.cw.floor]);
    const D = gs.v42 && gs.v42.depot && gs.v42.depot.building; if (D && D.fp) polys.push(['depot', D.fp]);
    const res = L.residents.filter((r) => !r.isPet && r.sprite && !r.event);
    window.__RR = [];
    polys.forEach(([id, P], i) => {
      const r = res[i]; if (!r) return;
      let cx = 0, cy = 0; for (const q of P) { cx += q.x; cy += q.y; } cx /= P.length; cy /= P.length;
      // a free spot near the middle of the floor
      let sx = cx, sy = cy;
      for (let k = 0; k < 40 && gs.collision.blocked(sx, sy, 12); k++) { const a = k * 2.4, d = 10 + k * 4; sx = cx + Math.cos(a) * d; sy = cy + Math.sin(a) * d / 2; }
      if (r.seat) r.unsit(); r.job = { kind: 'probe', t: -1e9 }; if (L.setArea) L.setArea(r, null);
      r.x = sx; r.y = sy;
      let bx = cx, by = cy + 420;
      for (let k = 0; k < 30 && (gs.collision.blocked(bx, by, 14) || window.__floorAt(bx, by)); k++) { bx += 40; by += 10; }
      r.goTo(bx, by);
      const g = { x: sx, y: sy, radius: 14, alive: true, vx: 0, vy: 0, route: gs.roads.route(sx, sy, bx, by, []), ri: 0, face() {}, locomotion() {}, noSeparate: true };
      window.__RR.push({ id, r, g, rOut: null, gOut: null, t: 0 });
    });
    window.__hook = (dt) => { for (const q of window.__RR) { q.t += dt;  if (q.rOut === null && window.__floorAt(q.r.x, q.r.y) !== q.id) q.rOut = +q.t.toFixed(1); gs.followRoute(q.g, 120, dt, 12); if (q.gOut === null && window.__floorAt(q.g.x, q.g.y) !== q.id) q.gOut = +q.t.toFixed(1); } };
    return polys.length;
  });
  if (R5) { await run(15); const r = await ev(() => { window.__hook = null; return window.__RR.map((q) => ({ id: q.id, resident: q.rOut, walker: q.gOut })); }); step('V5 a resident and a route walker set inside the office / bank / depot are out within 10 s', r.length > 0 && r.every((q) => q.resident !== null && q.resident <= 10 && q.walker !== null && q.walker <= 10), r); }

  // V7: the dog outside the office's north wall, the chief at his desk pad: never pulled through the wall
  const D7 = want('V7') && await ev(() => {
    const gs = window.__FV.scene, D = gs.dog, B = gs.v42 && gs.v42.office && gs.v42.office.building;
    if (!D || !D.r || !B || !B.cw) return null;
    window.__FV.teleport(B.spots.deskPad.x, B.spots.deskPad.y); gs.player.vx = gs.player.vy = 0;
    const r = D.r; if (D.take) D.take(r); D.mode = 'near'; r.x = 180; r.y = 711; r.state = 'idle';
    for (const k in D.cd || {}) D.cd[k] = 0;
    return true;
  });
  if (D7) {
    await render(page, 2); await advance(page, 0.2); await render(page, 1);
    await ev(() => {
      const gs = window.__FV.scene, D = gs.dog, r = D.r;
      const rec = window.__D = { started: D.start('pet'), jump: 0, last: [r.x, r.y], lod: r.lod, t: 0, at: null };
      window.__hook = (dt) => { rec.t += dt; const j = Math.hypot(r.x - rec.last[0], r.y - rec.last[1]); if (!r.lod && j > rec.jump) { rec.jump = j; rec.at = [+rec.t.toFixed(2), window.__R(r), D.scene && D.scene.phase]; } rec.last = [r.x, r.y]; };
    });
    await run(8);
    const d = await ev(() => { window.__hook = null; const d = window.__D; return { started: d.started, lod: d.lod, jump: Math.round(d.jump), at: d.at }; });
    step('V7 누리 is never snapped through the office wall onto the floor beside the chief (largest step ≤ 30 px)', d.started && !d.lod && d.jump <= 30, d);
  }

  // V13: a resident across a fence row (the line from A to B crosses 2+ fence pieces; B can be reached round it): round
  //  it, not pressing the fence for 20 s
  const F = !want('V13') ? false : await ev(() => {
    const gs = window.__FV.scene, C = gs.collision, L = gs.life, gd = window.__gd;
    if (!L) return null;
    const fences = C.all.filter((o) => o.active && !o.seg && o.tag && /^fence/.test(o.tag));
    const hits = (ax, ay, bx, by) => { const s = new Set(); const n = Math.ceil(gd(ax, ay, bx, by) / 6); for (let i = 1; i < n; i++) { const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n; for (const o of fences) { const dx = x - o.x, dy = (y - o.y) * 2; if (dx * dx + dy * dy < (o.r + 12) * (o.r + 12)) s.add(o); } } return s.size; };
    // the way round it: a breadth-first search on a 16 px grid in a 900 px window (the game's own blocked()); its
    //  length in ground px, or 0 when there is none
    const way = (A, B) => {
      const cs = 16, x0 = Math.min(A.x, B.x) - 450, y0 = Math.min(A.y, B.y) * 2 - 450, W = Math.ceil((Math.abs(A.x - B.x) + 900) / cs), H = Math.ceil((Math.abs(A.y - B.y) * 2 + 900) / cs);
      const dist = new Int32Array(W * H).fill(-1), q = [];
      const cell = (x, y) => { const i = Math.floor((x - x0) / cs), j = Math.floor((y * 2 - y0) / cs); return i < 0 || j < 0 || i >= W || j >= H ? -1 : j * W + i; };
      const s = cell(A.x, A.y), g = cell(B.x, B.y);
      if (s < 0 || g < 0) return 0;
      dist[s] = 0; q.push(s);
      for (let h = 0; h < q.length; h++) { const k = q[h]; if (k === g) return dist[k] * cs; const i = k % W, j = (k - i) / W; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue; const n = nj * W + ni; if (dist[n] >= 0) continue; dist[n] = -2; if (C.blocked(x0 + (ni + 0.5) * cs, (y0 + (nj + 0.5) * cs) / 2, 14)) continue; dist[n] = dist[k] + 1; q.push(n); } }
      return 0;
    };
    // (the pair whose way round is the longest against the straight line: a fence row, not a lone post)
    let best = null;
    for (const o of fences) {
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4, ux = Math.cos(a), uy = Math.sin(a) / 2;
        const A = { x: o.x + ux * 70, y: o.y + uy * 70 }, B = { x: o.x - ux * 70, y: o.y - uy * 70 };
        if (C.blocked(A.x, A.y, 16) || C.blocked(B.x, B.y, 16) || hits(A.x, A.y, B.x, B.y) < 2) continue;
        const w = way(A, B), ratio = w / gd(A.x, A.y, B.x, B.y);
        if (w > 0 && ratio <= 6 && (!best || ratio > best.ratio)) best = { o, A, B, ratio };
      }
    }
    if (best && best.ratio >= 2) {
      const { o, A, B } = best;
      const r = L.residents.find((q) => !q.isPet && q.sprite && !q.event);
      if (!r) return null;
      if (r.seat) r.unsit(); r.job = { kind: 'probe', t: -1e9 }; if (L.setArea) L.setArea(r, null);
      r.x = A.x; r.y = A.y;
      window.__FV.teleport(o.x + 40, o.y + 100); gs.player.vx = gs.player.vy = 0;
      window.__F = { fence: o.tag + '@' + Math.round(o.x) + ',' + Math.round(o.y), A: window.__R(A), B: window.__R(B), ratio: +best.ratio.toFixed(1), arrived: null, t: 0, r, B0: B };
      return true;
    }
    return null;
  });
  if (F) {
    await render(page, 2);
    await ev(() => { const f = window.__F, r = f.r, B = f.B0; r.goTo(B.x, B.y); window.__hook = (dt) => { f.t += dt; if (f.arrived === null && Math.hypot(r.x - B.x, r.y - B.y) < 24) f.arrived = +f.t.toFixed(1); }; });
    await run(20);
    const f = await ev(() => { window.__hook = null; const f = window.__F; return { fence: f.fence, A: f.A, B: f.B, ratio: f.ratio, arrived: f.arrived, now: window.__R(f.r) }; });
    step('V13 a resident sent across a fence row walks round it (there within 15 s)', f.arrived !== null && f.arrived <= 15, f);
  } else if (F === null) step('V13 a fence row with a way round found', false);

  // V14: hunt animals never come back inside a building, a pile or a bush
  if (want('V14')) {
  const A14 = await ev(() => {
    const gs = window.__FV.scene, C = gs.collision, an = gs.animals || [];
    let n = 0, inside = 0;
    for (let k = 0; k < 6; k++) for (const a of an) { if (!a.zone) continue; a.respawn(); n++; if (C.blocked(a.x, a.y, a.radius || 18)) inside++; }
    return { n, inside };
  });
  step('V14 animals respawn on open ground (' + A14.n + ' respawns)', A14.n > 0 && A14.inside === 0, A14);
  }

  // F1 (review #1): held off its spot by a prop, a walker stands there (settled); once the prop goes it walks onto it
  const F1 = want('F1') && await ev(() => {
    const gs = window.__FV.scene, p = gs.player;
    const x0 = p.x + 260, y0 = p.y + 140, a = { x: x0, y: y0, radius: 13, alive: true, vx: 0, vy: 0, face() {}, locomotion() {}, noSeparate: true };
    const f = window.__F1 = { a, tx: x0 + 160, ty: y0, ob: gs.collision.add(x0 + 160, y0, 22, 'probe'), t: 0, settledAt: null, arrivedAt: null, freed: false };
    window.__hook = (dt) => {
      f.t += dt;
      const ok = gs.moveAgent(a, f.tx, f.ty, 120, dt, 8);
      if (!f.freed && a._mv && a._mv.settled && f.settledAt === null) f.settledAt = +f.t.toFixed(1);
      if (f.freed && ok && Math.hypot(a.x - f.tx, a.y - f.ty) <= 8 && f.arrivedAt === null) f.arrivedAt = +f.t.toFixed(1);
    };
    return true;
  });
  if (F1) {
    await run(8);
    await ev(() => { const f = window.__F1; f.ob.active = false; f.freed = true; f.t = 0; });
    await run(8);
    const f = await ev(() => { window.__hook = null; const f = window.__F1; return { settledAt: f.settledAt, arrivedAt: f.arrivedAt, d: Math.round(Math.hypot(f.a.x - f.tx, f.a.y - f.ty)) }; });
    step('F1 a walker held off its spot stands there, and walks onto it within 5 s once the prop is gone', f.settledAt !== null && f.arrivedAt !== null && f.arrivedAt <= 5, f);
  }

  // F2 (soak R1): from the smokehouse yard to the dock on the game's own route: out by the yard's gate, no push at the fence
  const F2 = want('F2') && await ev(() => {
    const gs = window.__FV.scene, starts = { yardRack: [1717, 1983], yardMid: [1600, 2000], huntPile: [1515, 2052] }, dock = [3205, 1552];
    window.__G = [];
    for (const k in starts) {
      const [ax, ay] = starts[k];
      window.__G.push({ k, x: ax, y: ay, radius: 14, alive: true, vx: 0, vy: 0, route: gs.roads.route(ax, ay, dock[0], dock[1], []), ri: 0, face() {}, locomotion() {}, done: null, end: dock, noSeparate: true, last: [ax, ay], smp: 0, run: 0, maxStall: 0 });
    }
    let t = 0;
    window.__hook = (dt) => {
      t += dt;
      for (const a of window.__G) {
        if (a.done) continue;
        if (gs.followRoute(a, 150, dt, 12)) { a.done = { t: +t.toFixed(1), d: Math.round(Math.hypot(a.x - a.end[0], a.y - a.end[1])) }; continue; }
        if ((a.smp += dt) >= 0.25) { if (Math.hypot(a.x - a.last[0], a.y - a.last[1]) < 1) { a.run += a.smp; a.maxStall = Math.max(a.maxStall, a.run); } else a.run = 0; a.last = [a.x, a.y]; a.smp = 0; }
      }
    };
    return true;
  });
  if (F2) {
    await run(40);
    const g = await ev(() => { window.__hook = null; return window.__G.map((a) => ({ k: a.k, done: a.done, stall: +a.maxStall.toFixed(1), pts: a.route.length })); });
    step('F2 smokehouse-yard legs to the dock: no stall over 1.5 s, at the dock within 30 s', g.every((a) => a.done && a.done.d <= 40 && a.done.t <= 30 && a.stall <= 1.5), g);
  }

  // F4 (soak R3): a mined-out rock grows back only once nobody stands on its rubble; a stand point by another rock is
  //  never on that rubble (it grows back to full size)
  const F4 = want('F4') && await ev(() => {
    const gs = window.__FV.scene, rk = gs.rocks.filter((r) => r.enabled && r.ready()), r = rk[0];
    if (!r) return null;
    r.hp = 0; r.deplete();
    let onRubble = 0;
    for (const n of gs.rocks) {
      if (n === r || !n.ready()) continue;
      for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2, q = n.standPoint(n.x + Math.cos(a) * 300, n.y + Math.sin(a) * 150, {}); if (Math.hypot(q.x - r.x, (q.y - r.y) * 2) < r.fullR + 14) onRubble++; }
    }
    window.__FV.teleport(r.x + r.fullR * 0.8, r.y); gs.player.vx = gs.player.vy = 0;
    r.timer = 0.2;
    window.__F4 = { r, onRubble };
    return true;
  });
  if (F4) {
    await run(2);
    const a = await ev(() => { const f = window.__F4, gs = window.__FV.scene; f.held = f.r.hp <= 0; window.__FV.teleport(f.r.x + 260, f.r.y + 120); gs.player.vx = gs.player.vy = 0; return f.held; });
    await run(2);
    const f = await ev(() => { const f = window.__F4; return { onRubble: f.onRubble, heldWhileOn: f.held, grewAfter: f.r.hp > 0 }; });
    step('F4 a mined-out rock waits for the walker on its rubble, then grows back; no stand point on it', a && f.heldWhileOn && f.grewAfter && f.onRubble === 0, f);
  } else if (F4 === null) step('F4 a ready rock in the late save', false);

  // F5 (soak R5): a second walk to the same spot after a pause (a hunter's next catch to the rack) is walked to the end:
  //  the first walk's 'no closer' bookkeeping cut it short 3 s in (the meat thrown 40–250 px), or sent it on a detour
  const F5 = want('F5') && await ev(() => {
    const gs = window.__FV.scene, p = gs.player, C = gs.collision;
    let A = null, S = null;
    const clr = (ax, ay, bx, by) => { const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 12); for (let i = 0; i <= n; i++) if (C.blocked(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, 20)) return false; return true; };
    for (let k = 0; k < 48 && !A; k++) {
      const ang = (k / 48) * Math.PI * 2, R0 = 100 + (k % 3) * 120;
      const sx = p.x + Math.cos(ang) * R0, sy = p.y + Math.sin(ang) * R0 * 0.5, ax = sx + Math.cos(ang) * 520, ay = sy + Math.sin(ang) * 260;
      if (!C.blocked(sx, sy, 24) && !C.blocked(sx + 40, sy, 24) && !C.blocked(ax, ay, 24) && clr(sx, sy, ax, ay) && clr(sx, sy, sx + 40, sy)) { A = { x: ax, y: ay }; S = { x: sx, y: sy }; }
    }
    if (!A) return null;
    const a = { x: S.x + 40, y: S.y, radius: 14, alive: true, vx: 0, vy: 0, route: [{ x: S.x, y: S.y }], ri: 0, face() {}, locomotion() {}, noSeparate: true };
    const f = window.__F5 = { a, S, A, phase: 1, t: 0, trips: [], detours: 0 };
    const det = gs.roads.detour;
    gs.roads.detour = function (...q) { if (f.phase === 3 && Math.abs(q[0] - a.x) < 1 && Math.abs(q[1] - a.y) < 1) f.detours++; return det.apply(this, q); };
    f.restore = () => { gs.roads.detour = det; };
    window.__hook = (dt) => {
      f.t += dt;
      if (f.phase === 1 || f.phase === 3) {
        if (gs.followRoute(a, 120, dt, 10)) { f.trips.push({ t: +f.t.toFixed(1), d: Math.round(Math.hypot(a.x - S.x, a.y - S.y)) }); f.phase++; f.t = 0; }
      } else if (f.phase === 2 && f.t > 1.5) { a.x = A.x; a.y = A.y; a.route = [{ x: S.x, y: S.y }]; a.ri = 0; f.phase = 3; f.t = 0; }
    };
    return true;
  });
  if (F5) {
    await run(10);
    const f = await ev(() => { window.__hook = null; const f = window.__F5; f.restore(); return { from: window.__R(f.A), to: window.__R(f.S), trips: f.trips, detours: f.detours }; });
    const t2 = f.trips[1];
    step('F5 a second walk to the same spot after a pause reaches it (no give-up at 3 s, no detour)', t2 && t2.d <= 12 && f.detours === 0, f);
  } else if (F5 === null) step('F5 a clear straight line near the chief', false);

  // F3 (soak R2): after 테이블 늘리기 (two more levels) every seat's step-out point is on free ground (last: it adds tables)
  if (want('F3')) {
    const t3 = await ev(() => {
      const gs = window.__FV.scene, Rr = gs.civic && gs.civic.restaurant;
      if (!Rr || !Rr.seats) return null;
      for (const s of Rr.seats) Rr.seatSide(s);          // (the points kept before the new tables come)
      Rr.setTables(2, true);
      return { seats: Rr.seats.length, bad: Rr.seats.map((s) => { const q = Rr.seatSide(s); return { at: window.__R(q), why: window.__why(q.x, q.y, 13) }; }).filter((q) => q.why) };
    });
    step('F3 after 테이블 늘리기 every seat\'s step-out point is on free ground', t3 && t3.seats > 8 && t3.bad.length === 0, t3);
  }
}

async function checksFog() {
  // V4: rail open, 'se' closed: the station's porters' legs and the 관망 rest spots stay on the revealed land
  const g = await ev(async (base) => {
    const gs = window.__FV.scene, C = gs.collision;
    const out = { se: gs.territory ? gs.territory.isOpen('se') : null };
    // (from the station square to where a station porter takes from: the meat pile, the smokehouse's output; the
    //  porters' own take spots, on free ground)
    const fr = (x, y) => (gs.freeSpot ? gs.freeSpot(x, y, 14, 70) : { x, y });
    const mp = gs.piles && gs.piles.meat && gs.piles.meat.pad, sm = gs.sourceById && gs.sourceById('smokehouse');
    const legs = {};
    if (mp) { const q = fr(mp.x + 22, mp.y + 20); legs.station2meat = [3410, 1330, q.x, q.y]; }
    if (sm && sm.outPad) { const q = fr(sm.outPad.x + 22, sm.outPad.y + 20); legs.station2smoke = [3410, 1330, q.x, q.y]; }
    window.__G = [];
    for (const k in legs) { const [ax, ay, bx, by] = legs[k]; window.__G.push({ k, x: ax, y: ay, radius: 14, alive: true, vx: 0, vy: 0, route: gs.roads.route(ax, ay, bx, by, []), ri: 0, face() {}, locomotion() {}, done: null, end: [bx, by], noSeparate: true }); }
    let t = 0;
    window.__hook = (dt) => { t += dt; for (const a of window.__G) if (!a.done && gs.followRoute(a, 150, dt, 12)) a.done = { t: +t.toFixed(1), d: Math.round(Math.hypot(a.x - a.end[0], a.y - a.end[1])) }; };
    try {
      const W = await import(base + 'src/systems/pilot/work.js');
      let fog = 0, n = 0;
      for (let i = 0; i < 200; i++) { const q = W.restSpot(gs, Math.random); if (!q) continue; n++; if (C.walk && !C.inWalk(q.x, q.y)) fog++; }
      out.rest = { n, fog };
    } catch (e) { out.rest = { err: String(e) }; }
    return out;
  }, srv.url);
  step('V4 the fixture has the rail district without the \'se\' land', g.se === false, g);
  step('V4 관망 rest spots never in the fog', g.rest && g.rest.n > 0 && g.rest.fog === 0, g.rest);
  await run(40);
  const legs = await ev(() => { window.__hook = null; return window.__G.map((a) => ({ k: a.k, done: a.done, at: window.__R(a) })); });
  step('V4 station porters\' legs to the meat pile / smokehouse reach them (not the fog\'s edge)', legs.length === 2 && legs.every((a) => a.done && a.done.d <= 40), legs);
  // V9: every place's unload point on free ground (the lot shops' lay inside their own restaurant / workshop)
  const u = await ev(() => {
    const gs = window.__FV.scene, L = gs.logistics, bad = [];
    let n = 0;
    for (const s of (L ? L.sinks : [])) { if (s.enabled === false || s.ux === undefined) continue; n++; const w = window.__why(s.ux, s.uy, 14); if (w) bad.push({ u: [Math.round(s.ux), Math.round(s.uy)], why: w }); }
    return { n, bad };
  });
  step('V9 every sink\'s unload point on free ground (' + u.n + ' sinks)', u.n > 0 && u.bad.length === 0, u.bad);
}

let fatal = null;
try {
  if (ONLY.includes('A')) {
    for (const f of CENSUS) {
      await boot(f);
      if (!f) await ev(() => { window.__FV.unlockAll(); window.__FV.give(5000); });
      await advance(page, 2);
      await census(f || 'fresh game (unlockAll)', CENSUS_S);
    }
  }
  if (ONLY.includes('B')) {
    if (['V1', 'V2', 'V3', 'V5', 'V6', 'V7', 'V8', 'V10', 'V11', 'V12', 'V13', 'V14', 'F1', 'F2', 'F3', 'F4', 'F5'].some(want)) {
      await boot('v42_village_late.json');
      await advance(page, 2);
      await checksLate();
    }
    if (want('V4') || want('V9')) {
      await boot('v41_save_smart_35min.json');
      await advance(page, 2);
      await checksFog();
    }
  }
} catch (e) { fatal = e; console.log('ERROR', e && e.stack ? e.stack : e); }
const errs = (log.errors || []).filter((e) => !/favicon/.test(e));
step('no page errors', errs.length === 0, errs.slice(0, 3));
await browser.close();
await srv.close();
const failed = results.filter((r) => !r.ok);
console.log('\nstuck: ' + (results.length - failed.length) + ' passed, ' + failed.length + ' failed' + (BUILD ? ' (build ' + BUILD + ')' : ''));
process.exit(failed.length || fatal ? 1 : 0);
