// (v4.3 step B, WP-G) 물류창고 다음 목표: the post-depot chain GOALS43 on the main road, after the v4.2 buildings
// (docs/redesign_v43/stepB/postdepot_addendum.md §3, BP-35 … BP-56). Nothing here runs before every V42_BUILDS building
// stands (G1 / G2 unchanged); it only reads the other systems' state and listens to gs.events (§3.8: no edit to the depot,
// the line offers, Growth, Freight, Rail, Progression or Save).
//
//   Goals43.attach(gs, info)     registered on the after-load seam by src/systems/v43/index.js (after N's letter, before
//                                P1): makes gs.goals43 (a new one at every Game.build: a scene restart keeps the scene
//                                object), ticks at 1 Hz from the scene's 'update' event, listens to gs.events 'v4:train' /
//                                'v4:cardDone', and removes every listener on the scene's 'shutdown' (BP-56)
//   gs.goals43.rows(active, book)   the rows after the v4.2 buildings in the GoalBook shape
//                                { id, kind: 'g43', name, icon, coins, items, have, need, state, place, why };
//                                active = the v4.2 rows are all done (GoalBook.mainRows section 4). States: done / now /
//                                wait (passive, or soft with no path) / next; why: 'passive' | 'noplot' | 'wait'
//   gs.goals43.sideRows(cur, coins) side rows G adds (the depot pads that no not-done G row uses as its place)
//   gs.goals43.refs()            a Set of the places (Pad / Site objects, as in row.place.ref) of the G rows not done:
//                                GoalBook.sideRows never lists them as side rows (BP-52)
//   gs.goals43.sub(r)            the line under a 'g43' row, or null for GoalBook's generic line
//   gs.goals43.objective(T, mode)   Tutorial.v42Goal: 'place' -> { x, y, h, key, text, cost, pay, pad, hold } for a
//                                current row with a place, 'text' -> { key, text } for one without; else null (BP-55)
//   gs.goals43.current()         the current row (BAL-b's chain bot follows it), or null
//   gs.goals43.tasteReady()      (T's gate, BP-43) the 읍장 취임 맛보기 pad may stand now: rows 1–9 settled (done, passive,
//                                or soft with no path; row 9 only when mkt_s4 is bought or mkt_s3 is out of reach), or
//                                v43.seen.g43ready already set (sticky), while the chain runs and the taste is not seen.
//                                Row 10's 가기 target is T's pad: gs.eupTaste.pad (a Pad or UnlockPad with x / y) when T
//                                has one, else the hall's rankPadPos()
//   gs.goals43.state()           (tests) the chain as plain data
//
// Saves (§5.5): v43.seen g43open / the row markers g43_* (rows 1–8; replaced by g43all once all eight are marked,
// BP-54) / g43ready; progress.flags.g43s4 (row 9 became current, or 읍 with goals43.s4Early); x.g43 { d, t, k, u } =
// standing deliveries, train runs (both counted from the opening), the decor and 2단 baselines taken at the opening
// (removed once rows 3, 4, 6 and 7 are marked). A row pays its coins only when this session saw its rule false and then
// true (BP-39): a rule already true at the first look after a load is marked quietly, so a lost marker never pays twice.

import { G43, SEEN43, FLAG43, X43KEY, EV43 } from '../../data/ids43.js';
import { BALANCE } from '../../data/balance.js';
import { WORLD } from '../../data/world.js';
import { STEPS, GOALS, BUILD_UNLOCK, stepCost } from '../Progression.js';
import { Assets } from '../../core/Assets.js';
import { t, fmt } from '../../data/strings.js';
import { buildCost } from '../../entities/Site.js';
import { gt } from './strings.js';
import { GoalBook, V42_BUILDS } from './GoalBook.js';
import { EupTaste } from '../v43/EupTaste.js';
import { emit } from '../v43/hooks.js';

/** the rows in order (§3.1). `k` names the row's BALANCE.goals43.need / reward entries. Row 9 (`step`) is present only
 *  when STEPS has the mkt_s4 step, row 10 (`taste`) only when EupTaste.enabled (BP-53) */
export const GOALS43 = Object.freeze([
  Object.freeze({ id: G43.staff, k: 'staff', icon: ['ui_icon_staff', 'ui_icon_worker'] }),
  Object.freeze({ id: G43.fork, k: 'fork', icon: ['ui_icon_forklift', 'ui_icon_delivery'] }),
  Object.freeze({ id: G43.st2, k: 'st2', icon: ['ui_icon_speed', 'ui_icon_tools'], soft: true }),
  Object.freeze({ id: G43.deco, k: 'deco', icon: ['ui_icon_flower', 'ui_icon_house'], soft: true }),
  Object.freeze({ id: G43.house, k: 'house', icon: ['ui_icon_move_in', 'ui_icon_house'], soft: true }),
  Object.freeze({ id: G43.dlv, k: 'dlv', icon: ['ui_icon_mission', 'ui_icon_request'] }),
  Object.freeze({ id: G43.train, k: 'train', icon: ['ui_icon_boxcar', 'ui_icon_delivery'], passive: true }),
  Object.freeze({ id: G43.shop, k: 'shop', icon: ['ui_icon_stock', 'ui_icon_hammer'], soft: true }),
  Object.freeze({ id: G43.s4, k: 's4', icon: ['ui_icon_hammer'], step: true }),
  Object.freeze({ id: G43.taste, k: 'taste', icon: ['ui_badge_rank_2', 'ui_icon_title'], taste: true }),
]);
/** rows 1–8: the marked rows (their ids are their v43.seen keys) */
const ROWS8 = GOALS43.slice(0, 8);
/** rows 3, 4, 6, 7: the ones that read x.g43 (the key goes once all four are marked) */
const X_ROWS = [G43.st2, G43.deco, G43.dlv, G43.train];
// the five lines that can have a 가공소 2단 (LineUpgrades WORKER) and the hire that makes each one due (its 3rd gatherer;
// the miners: their 2nd)
const WORKER = { grill: 'fisherman', sawmill: 'lumberjack', bakery: 'farmer', smelter: 'miner', smokehouse: 'hunter' };
const LINES5 = Object.keys(WORKER);
const gateOf = (line) => (line === 'smelter' ? 'hire2_miner' : 'hire3_' + WORKER[line]);
const DECOR = ['deco_bench', 'deco_lamp', 'deco_snowman', 'deco_flowers', 'deco_rink', 'deco_playground', 'deco_fountain'];
const NEED0 = { staff: 2, st2: 1, deco: 2, dlv: 3, train: 3 };
const TICK = 1;

const CFG = () => BALANCE.goals43 || {};
const need = (k) => Math.max(1, Math.floor(Number((CFG().need || {})[k])) || NEED0[k] || 1);
const reward = (k) => Math.max(0, Math.floor(Number((CFG().reward || {})[k])) || 0);
const pick = (...keys) => { for (const k of keys) { try { if (k && Assets.has(k)) return k; } catch (e) { /* */ } } return keys[keys.length - 1]; };
const live = (u) => !!(u && u.active !== false && !u.done && !u.maxed);
const itemsLeft = (u) => { if (!u || !u.items) return null; const o = {}; for (const k in u.items) { const left = u.items[k] - ((u.got && u.got[k]) || 0); if (left > 0) o[k] = left; } return Object.keys(o).length ? o : null; };
const costItems = (c) => { const o = {}; for (const k of ['item_plank', 'item_ingot']) if (c && c[k] > 0) o[k] = c[k]; return Object.keys(o).length ? o : null; };
/** the first-house plots (world.js plots with side43), in table order */
const houseIds = () => Object.keys((WORLD && WORLD.plots) || {}).filter((id) => WORLD.plots[id] && WORLD.plots[id].side43);

export class Goals43 {
  /** after-load hook (src/systems/v43/hooks.js runAfterLoad): a new chain reader for this build of the scene */
  static attach(gs, info) {
    if (!gs || !gs.events || typeof gs.events.on !== 'function') return null;
    if (gs.goals43 && gs.goals43.destroy) gs.goals43.destroy();
    const g = new Goals43(gs, info);
    gs.goals43 = g;
    g.listen();
    return g;
  }

  constructor(gs, info) {
    this.gs = gs;
    this.info = info || {};
    this.t = 0;
    this.saw = {};           // row id -> this session saw its rule false while the chain ran (BP-39: only then it pays)
    this.lastCur = null;     // the current row's id at the last tick (a done row that was current gets the banner)
    this.openDue = false;    // the 「물류창고 다음 목표가 생겼어요」 banner waits for the letter / flag card / panels (BP-48)
    this.ver = 0;            // bumped on every change G makes (markers, counters): the per-frame memo is redone
    this.memo = null;
    this.x = null;           // x.g43 in memory { d, t, k, u } (null: not read yet / not needed)
    this.xRead = false;
    this.offs = [];
    this.dead = false;
    this.log = [];           // coins paid this session: [{ id, n }] (tests: rewards once)
    this.shown = { open: 0, ready: 0 };
    this.errs = 0;
  }

  // ------------------------------------------------------------------ wiring (BP-56)
  listen() {
    const ev = this.gs.events;
    const on = (name, fn) => { ev.on(name, fn); this.offs.push(() => ev.off(name, fn)); };
    on('update', (time, delta) => this.update((Number(delta) || 0) / 1000));
    on('v4:train', (e, stop) => this.onTrain(e, stop));
    on('v4:cardDone', (c) => this.onCard(c));
    const bye = () => this.destroy();
    ev.once('shutdown', bye);
    this.offs.push(() => ev.off('shutdown', bye));
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    for (const f of this.offs.splice(0)) { try { f(); } catch (e) { /* */ } }
    if (this.gs.goals43 === this) this.gs.goals43 = null;
  }

  update(dt) {
    if (this.dead) return;
    this.t += Math.min(0.5, Math.max(0, dt));
    if (this.t < TICK) return;
    this.t = 0;
    try { this.tick(); } catch (e) { if (this.errs++ < 3) console.error('[goals43] tick', e); }
  }

  // ------------------------------------------------------------------ the save bits (never cached across ticks, §3.8)
  seenGet(k) { const v = this.gs.v43; return !!(v && v.seen && v.seen[k]); }
  seenW() {
    const gs = this.gs;
    if (!gs.v43 || typeof gs.v43 !== 'object') gs.v43 = { lay: 0 };
    if (!gs.v43.seen || typeof gs.v43.seen !== 'object' || Array.isArray(gs.v43.seen)) gs.v43.seen = {};
    return gs.v43.seen;
  }
  /** a row 1–8 marked done (its own key, or g43all once the eight were compacted) */
  marked(id) { return this.seenGet(SEEN43.g43all) || this.seenGet(id); }
  opened() { return this.seenGet(SEEN43.g43open); }
  save() { try { if (this.gs.save) this.gs.save(true); } catch (e) { /* */ } }

  /** x.g43 (read once after the opening; a missing / broken key restarts the counters and re-takes the baselines for
   *  the rows not marked yet, §3.3) */
  ensureX() {
    if (this.xRead || !this.opened()) return;
    this.xRead = true;
    const X = this.gs.x43, raw = X && X.get ? X.get(X43KEY.goals) : undefined;
    const want = X_ROWS.some((id) => !this.marked(id));
    const n = (v, hi) => Math.max(0, Math.min(hi, Math.floor(Number(v)) || 0));
    const fin = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      this.x = { d: n(raw.d, 99), t: n(raw.t, 99), k: fin(raw.k) ? n(raw.k, 1e6) : this.decorBuilt(), u: fin(raw.u) ? n(raw.u, LINES5.length) : this.upCount() };
      if (!fin(raw.k) || !fin(raw.u)) this.writeX();
    } else if (want) { this.x = { d: 0, t: 0, k: this.decorBuilt(), u: this.upCount() }; this.writeX(); }
    else this.x = null;
  }
  writeX() {
    const X = this.gs.x43;
    if (!X || !X.set) return;
    if (this.x) X.set(X43KEY.goals, { d: this.x.d, t: this.x.t, k: this.x.k, u: this.x.u });
    else X.set(X43KEY.goals, undefined);
  }

  // ------------------------------------------------------------------ what the village has
  /** the chain may run: v4.2 running, village complete, every v4 GOALS row done (읍 included) and every V42_BUILDS
   *  building built (BP-38: the depot alone is not enough — it can stand before the bank). Since step B's P that is the
   *  bank and the depot (the designer: 「은행과 물류창고를 둘 다 지으면」); the 촌장 사무실 is a side goal and is not asked
   *  for by itself (the bank's plot needs b:chief_office anyway). A GOALS row that regressed (people below 45) pauses
   *  it: no markers, rewards, banners, g43s4 or taste pad; the counters still count */
  running() {
    const gs = this.gs, pr = gs.progress;
    if (!gs.v42 || !pr || !pr.complete) return false;
    for (const g of GOALS) if (!pr.goalDone(g)) return false;
    for (const [, b] of V42_BUILDS) if (!(gs.isBuilt && gs.isBuilt(b))) return false;
    return true;
  }
  depot() { const v = this.gs.v42; return v && v.depot ? v.depot : null; }
  lines() { const v = this.gs.v42; return v && v.lines ? v.lines : null; }
  upCount() { const L = this.lines(); let n = 0; if (L && L.up) for (const k of LINES5) if (L.up[k]) n++; return n; }
  decorBuilt() { const b = this.gs.built || {}; let n = 0; for (const k in b) if (/^deco_/.test(k)) n += Math.max(0, Math.floor(Number(b[k])) || 0); return n; }
  housesDone() { const S = this.gs.sites || {}; return houseIds().every((id) => !S[id] || S[id].state === 'done'); }
  hasS4() { return STEPS.some((s) => s.id === G43.s4); }
  /** the rows present in this build (BP-53: row 9 needs the mkt_s4 step, row 10 EupTaste.enabled) */
  defs() { return GOALS43.filter((d) => (d.step ? this.hasS4() : d.taste ? !!EupTaste.enabled : true)); }

  /** a row's rule (rows 1–8): true = what the row asks for is there */
  rule(d) {
    const gs = this.gs, pr = gs.progress, D = this.depot(), x = this.x;
    switch (d.k) {
      case 'staff': return !!D && (Number(D.hires) || 0) >= need('staff');
      case 'fork': return !!D && !!D.fork;
      case 'st2': return !!x && this.upCount() >= Math.min(LINES5.length, x.u + need('st2'));
      case 'deco': return !!x && this.decorBuilt() - x.k >= need('deco');
      case 'house': return this.housesDone();
      case 'dlv': return !!x && x.d >= need('dlv');
      case 'train': return !!x && x.t >= need('train');
      case 'shop': return !!pr && pr.isDone('mkt_s3') && pr.isDone('hire_clerk_s3');
      default: return false;
    }
  }
  /** done as the window shows it: marked, the rule true now (it is marked at the next tick), row 9 bought, row 10 seen */
  doneRow(d) {
    if (d.step) return !!(this.gs.progress && this.gs.progress.isDone(G43.s4));
    if (d.taste) return this.seenGet(SEEN43.taste);
    return this.marked(d.id) || this.rule(d);
  }
  nameOf(d) {
    switch (d.k) {
      case 'staff': return gt('g43_staff', { n: need('staff') });
      case 'st2': return need('st2') === 1 ? gt('g43_st2') : gt('g43_st2n', { n: need('st2') });
      case 'deco': return gt('g43_deco', { n: need('deco') });
      case 'dlv': return gt('g43_dlv', { n: need('dlv') });
      case 'train': return gt('g43_train', { n: need('train') });
      case 's4': return gt('g43_s4');
      default: return gt(d.id);
    }
  }
  book() { return this._book || (this._book = new GoalBook(this.gs)); }

  // ------------------------------------------------------------------ the rows
  /** a row's place, line and objective (only while the chain runs and the row is not done). Sets r.g43.skip for a row
   *  that never holds the ones after it: passive (the trains, a site building by itself) or soft with no path (BP-40) */
  path(d, r, ctx) {
    const gs = this.gs, pr = gs.progress, G = r.g43;
    const id = d.id;
    const objKey = (a, b) => 'obj_g43:' + id + ':' + a + ':' + b;
    const at = (o, x, y, h, cost, pad, hold, ref) => {
      r.place = { x, y, pad, ref: ref || null };
      G.obj = { key: o.key, text: o.text, place: { x, y, h, key: o.key, text: o.text, cost: Math.max(0, Math.floor(cost || 0)), pay: true, pad: pad || null, hold: hold !== false } };
    };
    const atPad = (u, o) => at(o, u.x, u.y, 112, u.remaining, u.pad, !u.needsLeave, u);
    const atPlot = (st, o, cost) => at(o, st.dropX, st.dropY, 70, cost, st.pad, !st.leaveNeeded, st);
    const waitText = (why) => ({ key: 'obj_g43:' + id + ':wait', text: t('obj_g43_wait', { name: r.name, why }) });
    const siteBuilding = (st) => { let got = 0, nd = 0; for (const m in st.need || {}) { nd += st.need[m]; got += Math.min(st.need[m], st.stock ? st.stock.countOf(m) : 0); } return { got, need: nd }; };
    switch (d.k) {
      case 'staff': case 'fork': {
        const D = this.depot(), u = D && D.pads ? D.pads[d.k] : null, N = d.k === 'staff' ? need('staff') : 1;
        if (d.k === 'staff') { r.have = Math.min(N, D ? Number(D.hires) || 0 : 0); r.need = N; }
        if (live(u)) {
          r.coins = u.remaining;
          atPad(u, { key: objKey(r.have || 0, u.remaining), text: d.k === 'staff' ? t('obj_g43_staff', { have: r.have, n: N, cost: fmt(u.remaining) }) : t('obj_g43_fork', { cost: fmt(u.remaining) }) });
        } else { r.why = 'wait'; G.obj = { key: objKey(0, 0), text: r.name }; }
        break;
      }
      case 'st2': {
        const L = this.lines(), x = this.x, N = need('st2');
        r.have = Math.max(0, Math.min(N, this.upCount() - (x ? x.u : this.upCount()))); r.need = N;
        let best = null, gate = null;
        if (L && L.pads) for (const line of LINES5) { if (L.up && L.up[line]) continue; const u = L.pads['st2_' + line]; if (live(u) && (!best || u.remaining < best.u.remaining)) best = { u, line }; }
        if (best) {
          r.coins = best.u.remaining;
          atPad(best.u, { key: objKey(best.line, best.u.remaining), text: t('obj_g43_st2', { st: t('line_' + best.line), cost: fmt(best.u.remaining) }) });
          break;
        }
        if (L && pr) for (const line of LINES5) {
          if ((L.up && L.up[line]) || (L.gatherers3 && L.gatherers3(line))) continue;
          const u = pr.pads[gateOf(line)];
          if (live(u) && (!gate || u.remaining < gate.u.remaining)) gate = { u, line };
        }
        if (gate) {
          const name = t('w_' + WORKER[gate.line]) + ' ' + (gate.line === 'smelter' ? 2 : 3);
          r.coins = gate.u.remaining; r.items = itemsLeft(gate.u); G.gate = name;
          atPad(gate.u, { key: objKey('gate_' + gate.line, gate.u.remaining), text: t('obj_g43_st2gate', { name, cost: fmt(gate.u.remaining) }) });
          break;
        }
        // (soft: no 2단 pad and no gate pad. An offer that is due but hidden behind the 3 offers at a time (MAX_OFFERS),
        //  or waiting for its spot, says so; else a third worker is missing)
        let due = false;
        try { due = !!(L && L.offers && L.offers().some((o) => o.kind === 'st2' && !(L.pads && L.pads[o.id]))); } catch (e) { due = false; }
        r.why = 'wait'; G.skip = true; G.wait = due ? 'g43_st2Slot' : 'g43_st2Wait';
        G.obj = waitText(gt(G.wait));
        break;
      }
      case 'deco': {
        const x = this.x, N = need('deco'), have = x ? Math.max(0, this.decorBuilt() - x.k) : 0;
        r.have = Math.min(N, have); r.need = N;
        // a decor site under way: its drop pad while it waits for materials; one building by itself counts as coming
        let fnd = null, going = 0;
        for (const sid in gs.sites || {}) { const st = gs.sites[sid]; if (!st || !/^deco_/.test(st.building || '') || st.state === 'done' || st.state === 'plot') continue; going++; if (st.state === 'foundation' && !fnd) fnd = st; }
        if (fnd) {
          const b = siteBuilding(fnd);
          r.building = b; r.coins = 0;
          at({ key: objKey('site', b.got), text: t('obj_g43_build', { name: t('b_' + fnd.building), got: b.got, need: b.need }) }, fnd.dropX, fnd.dropY, 70, 0, fnd.dropPad || fnd.pad, true, fnd);
          break;
        }
        if (have + going >= N) { r.why = 'passive'; G.skip = true; G.obj = waitText(gt('g_waiting')); break; }
        const T = gs.tutorial;
        let pl = null, key = null;
        for (const k of this.decorByCost()) {
          if (BUILD_UNLOCK[k] && pr && !pr.met(BUILD_UNLOCK[k])) continue;
          const q = T && T.plotFor ? T.plotFor(k) : null;
          if (q) { pl = q; key = k; break; }
        }
        if (pl) {
          const c = buildCost(key);
          r.coins = c.coins || 0; r.items = costItems(c);
          atPlot(pl, { key: objKey(r.have, key), text: t('obj_g43_deco', { have: r.have, n: N }) }, c.coins || 0);
        } else { r.why = 'noplot'; G.skip = true; G.obj = waitText(gt('g_noPlot')); }
        break;
      }
      case 'house': {
        const S = gs.sites || {};
        let wait = null;
        for (const hid of houseIds()) {
          const st = S[hid];
          if (!st || st.state === 'done') continue;
          if (st.state === 'foundation') {
            const b = siteBuilding(st);
            r.building = b; r.coins = 0;
            at({ key: objKey(hid, b.got), text: t('obj_g43_build', { name: t('b_' + st.building), got: b.got, need: b.need }) }, st.dropX, st.dropY, 70, 0, st.dropPad || st.pad, true, st);
            return;
          }
          if (st.state === 'plot' && st.shown) {
            const c = gs.buildChoices ? gs.buildChoices(st).find((q) => q.key === st.only) : null;
            if (c && !c.locked) {
              const cost = (c.cost && c.cost.coins) || 0;
              r.coins = cost; r.items = costItems(c.cost);
              atPlot(st, { key: objKey(hid, cost), text: t('obj_g43_house', { cost: fmt(cost) }) }, cost);
              return;
            }
            if (!wait) wait = c && c.reason === 'lockVacant' ? 'g43_houseWait' : 'wait';
          } else if (st.state !== 'plot') { if (!wait) wait = 'passive'; }
          else if (!wait) wait = 'wait';
        }
        G.skip = true;
        r.why = wait === 'passive' ? 'passive' : 'wait';
        if (wait === 'g43_houseWait') G.wait = wait;
        G.obj = waitText(gt(wait === 'g43_houseWait' ? wait : 'g_waiting'));
        break;
      }
      case 'dlv': {
        const x = this.x, N = need('dlv'), g = gs.v4 && gs.v4.growth;
        r.have = Math.min(N, x ? x.d : 0); r.need = N;
        if (!g || !g.active || !g.dockPad) { r.why = 'wait'; G.obj = { key: objKey(r.have, 'none'), text: t('obj_g43_dlvWait', { have: r.have, n: N }) }; break; }
        const open = (g.cards || []).filter((c) => !c.shop && !(g.cardDone && g.cardDone(c)));
        const p = gs.player, bag = p && p.stack && p.stack.items ? p.stack.items : [];
        const D = g.dockPad;
        let ty = null, card = null;
        // carrying an item a standing card needs: the dock (BP-55)
        for (let i = bag.length - 1; i >= 0 && !ty; i--) { const k = bag[i].type; const c = open.find((q) => q.need[k] && (q.got[k] || 0) < q.need[k]); if (c) { ty = k; card = c; } }
        if (ty) {
          G.item = { item: t(ty), got: card.got[ty] || 0, all: card.need[ty] };
          at({ key: objKey(r.have, 'dock:' + ty + ':' + G.item.got), text: t('obj_g43_dlv', { have: r.have, n: N, item: t(ty), got: G.item.got, need: G.item.all }) }, D.x, D.y, 60, 0, D, true, D);
          break;
        }
        const c = open[0] || null;
        const k = c ? Object.keys(c.need).find((q) => (c.got[q] || 0) < c.need[q]) : null;
        if (c && k) {
          G.item = { item: t(k), got: c.got[k] || 0, all: c.need[k] };
          const T = gs.tutorial, src = T && T.sourceOf ? T.sourceOf(k) : null, o = src && src.outPad;
          if (o) { at({ key: objKey(r.have, 'take:' + k + ':' + G.item.got), text: t('obj_g43_dlvTake', { item: t(k), got: G.item.got, need: G.item.all }) }, o.x, o.y, 80, 0, o, true, o); break; }
          at({ key: objKey(r.have, 'dock:' + k + ':' + G.item.got), text: t('obj_g43_dlv', { have: r.have, n: N, item: t(k), got: G.item.got, need: G.item.all }) }, D.x, D.y, 60, 0, D, true, D);
          break;
        }
        at({ key: objKey(r.have, 'none'), text: t('obj_g43_dlvWait', { have: r.have, n: N }) }, D.x, D.y, 60, 0, D, true, D);
        break;
      }
      case 'train': {
        const x = this.x, N = need('train');
        r.have = Math.min(N, x ? x.t : 0); r.need = N;
        r.why = 'passive'; G.skip = true;
        G.obj = { key: objKey(r.have, N), text: t('obj_g43_train', { have: r.have, n: N }) };
        break;
      }
      case 'shop': {
        const u = pr && !pr.isDone('mkt_s3') ? pr.pads.mkt_s3 : pr ? pr.pads.hire_clerk_s3 : null;
        if (live(u)) {
          r.coins = u.remaining; r.items = itemsLeft(u);
          atPad(u, { key: objKey(u.id, u.remaining), text: t('obj_g43_shop', { name: t(u.id), cost: fmt(u.remaining) }) });
        } else {
          r.why = 'wait'; G.skip = true;
          if (pr && !pr.isDone('mkt_s3') && !pr.flags.firstMeatSale) G.wait = 'g43_shopWait';
          G.obj = waitText(gt(G.wait || 'g_waiting'));
        }
        break;
      }
      case 's4': {
        const s = STEPS.find((q) => q.id === G43.s4), b = s ? this.book().stepRow(s, 'now') : null;
        if (b) { r.coins = b.coins; r.items = b.items; }
        const u = pr && pr.pads[G43.s4];
        if (live(u)) atPad(u, { key: objKey('pad', u.remaining), text: t('obj_g43_s4', { cost: fmt(u.remaining) }) });
        else if (pr && !pr.isDone('mkt_s3') && ctx.shopSkip) { r.why = 'wait'; G.skip = true; G.obj = waitText(gt(ctx.shopWait || 'g_waiting')); }
        else { r.why = 'wait'; G.obj = { key: objKey('wait', r.coins || 0), text: t('obj_g43_s4', { cost: fmt(r.coins || (s ? stepCost(s) : 0) || 0) }) }; }
        break;
      }
      case 'taste': {
        const P = this.tastePlace();
        // (hold: as the v4.2 pads' !needsLeave — the pad appeared under him: he must step off once, so the arrow stays)
        const E = this.gs.eupTaste;
        if (P) at({ key: objKey(0, 0), text: t('obj_g43_taste') }, P.x, P.y, 96, 0, P.pad, !(E && E.leave), P.ref);
        else { r.why = 'wait'; G.obj = { key: objKey(0, 0), text: t('obj_g43_taste') }; }
        break;
      }
      default: break;
    }
  }

  /** decor cards from the cheapest (balance.js buildings) */
  decorByCost() {
    if (!this._decor) this._decor = DECOR.slice().sort((a, b) => ((buildCost(a).coins || 0) - (buildCost(b).coins || 0)));
    return this._decor;
  }

  /** where row 10 walks to: T's pad (gs.eupTaste.pad), else the hall's 승격식 spot (rankPadPos), else the station square's */
  tastePlace() {
    const gs = this.gs, E = gs.eupTaste, P = E && E.pad;
    if (P && Number.isFinite(P.x) && Number.isFinite(P.y)) return { x: P.x, y: P.y, pad: P.pad && P.pad.contains ? P.pad : P.contains ? P : null, ref: P };
    const h = gs.civic && gs.civic.hall;
    const q = h && h.rankPadPos ? h.rankPadPos() : (WORLD.v4 && WORLD.v4.square && WORLD.v4.square.rank) || null;
    return q ? { x: q.x, y: q.y, pad: null, ref: null } : null;
  }

  /** every row in order with its state: { rows, cur, fb (the first waiting row: the current one when none is), gate }.
   *  act = the chain runs (opened, v4.2 rows done, GOALS done). gate = rows 1–9 settled (T's pad may show) */
  build(act) {
    const rows = [];
    let cur = null, fb = null, gate = false;
    const ctx = { shopSkip: false, shopWait: null };
    for (const d of this.defs()) {
      const r = { id: d.id, kind: 'g43', k: d.k, name: this.nameOf(d), icon: pick(...d.icon), coins: 0, items: null, state: 'next', place: null, why: null, g43: { skip: false, wait: null, gate: null, item: null, obj: null } };
      if (d.taste) gate = act && !cur;
      if (this.doneRow(d)) { r.state = 'done'; rows.push(r); continue; }
      if (!act) { rows.push(r); continue; }
      this.path(d, r, ctx);
      const G = r.g43;
      // row 10: its pad only from the gate on (sticky once v43.seen.g43ready is set)
      if (d.taste && !gate && !this.seenGet(SEEN43.g43ready)) { r.place = null; G.obj = { key: 'obj_g43:' + d.id + ':0:0', text: t('obj_g43_taste') }; }
      if (d.k === 'shop') { ctx.shopSkip = G.skip; ctx.shopWait = G.wait; }
      const skip = !!d.passive || G.skip;
      if (!cur && !skip) { r.state = 'now'; cur = r; }
      else if (skip && (!cur || d.passive)) { r.state = 'wait'; if (!cur && !fb) fb = r; }
      else r.state = 'next';
      rows.push(r);
    }
    // (no row 10 in this build: the gate is rows 1–9 / 1–8 settled all the same)
    if (!this.defs().some((d) => d.taste)) gate = act && !cur;
    return { rows, cur, fb, gate };
  }

  /** the rows read once per frame (objective / refs / sideRows / current share it); rows() is always fresh */
  evaluate(act, fresh) {
    const gs = this.gs, now = gs.time && Number.isFinite(gs.time.now) ? gs.time.now : null, m = this.memo;
    if (!fresh && m && now !== null && m.at === now && m.act === act && m.ver === this.ver) return m.ev;
    if (act) this.ensureX();
    const ev = this.build(act);
    this.memo = { at: now, act, ver: this.ver, ev };
    return ev;
  }
  /** the chain as it runs now (opened and running) */
  liveEv() { return this.evaluate(this.opened() && this.running(), false); }

  // ------------------------------------------------------------------ the seams (GoalBook, Tutorial, T)
  rows(active, book) {
    if (book instanceof GoalBook) this._book = book;
    const act = !!active && this.opened() && this.running();
    return this.evaluate(act, true).rows;
  }

  refs() {
    const out = new Set();
    if (!this.opened()) return out;
    for (const r of this.liveEv().rows) if (r.state !== 'done' && r.place && r.place.ref) out.add(r.place.ref);
    return out;
  }

  sideRows(cur, coins) {
    if (!this.opened()) return [];
    const D = this.depot();
    if (!D || !D.pads) return [];
    const refs = this.refs(), curRef = cur && cur.place ? cur.place.ref : null, out = [];
    for (const k of ['staff', 'fork']) {
      const u = D.pads[k];
      if (!live(u) || u === curRef || refs.has(u)) continue;
      const nm = (u.labelText && u.labelText.text) || (k === 'staff' ? t('depotStaff_pad', { n: 3 + (Number(D.hires) || 0) + 1 }) : t('depotFork_pad'));
      out.push({ id: u.id, kind: 'pad', name: String(nm).replace(/\s+/g, ' ').trim(), icon: k === 'staff' ? pick('ui_icon_worker', 'ui_icon_porter', 'ui_icon_goal') : pick('ui_icon_delivery', 'ui_icon_upgrade', 'ui_icon_goal'), coins: u.remaining, items: null, state: 'side', place: { x: u.x, y: u.y, pad: u.pad, ref: u }, why: null, afford: (coins || 0) >= u.remaining });
    }
    return out;
  }

  sub(r) {
    if (!r || r.kind !== 'g43' || r.state === 'done') return null;
    const G = r.g43 || {};
    if (r.state === 'next' && !r.place) return null;          // 「앞의 목표를 먼저 해요」 (GoalBook's generic line)
    if (r.building) return null;                                // 「짓는 중 · 재료 …」
    if (G.wait) return gt(G.wait);
    if (G.gate) return gt('g43_st2Gate', { name: G.gate, coins: fmt(r.coins || 0) });
    const have = gt('g_have', { have: r.have || 0, need: r.need || 0 });
    if (r.k === 'train') return gt('g_waiting') + ' · ' + have;
    if (r.k === 'dlv') return G.item ? gt('g43_dlvItem', { have: r.have || 0, need: r.need || 0, item: G.item.item, got: G.item.got, all: G.item.all }) : have;
    if ((r.k === 'staff' || r.k === 'st2' || r.k === 'deco') && r.place) { const c = this.book().costText(r); return have + (c ? ' · ' + c : ''); }
    if (r.k === 's4' && this.gs.progress && this.gs.progress.flags[FLAG43.s4half]) { const c = this.book().costText(r); return (c ? c + ' · ' : '') + gt('g43_half'); }
    if (r.k === 'taste' && r.place) return gt('g43_readySub');
    return null;
  }

  objective(T, mode) {
    if (!this.opened() || !this.running()) return null;
    const ev = this.liveEv(), r = ev.cur || ev.fb;
    const o = r && r.g43 ? r.g43.obj : null;
    if (!o) return null;
    if (mode === 'place') return r.place && o.place ? Object.assign({}, o.place) : null;
    return r.place && o.place ? null : { key: o.key, text: o.text };
  }

  current() {
    if (!this.opened() || !this.running()) return null;
    const ev = this.liveEv();
    return ev.cur || ev.fb || null;
  }

  tasteReady() {
    if (this.dead || !this.opened() || !this.running() || this.seenGet(SEEN43.taste)) return false;
    return this.seenGet(SEEN43.g43ready) || this.liveEv().gate;
  }

  // ------------------------------------------------------------------ the counters (§3.3)
  onCard(c) {
    if (this.dead || !c || c.shop || !this.opened() || this.marked(G43.dlv)) return;
    this.ensureX();
    if (!this.x || this.x.d >= need('dlv')) return;
    // (the count was below its need a moment ago: this session saw the rule false (BP-39), also in the first second
    //  after a load, before the first tick looked)
    this.saw[G43.dlv] = true;
    this.x.d++;
    this.ver++;
    this.writeX();
    this.reached(this.x.d >= need('dlv'));
  }
  onTrain(e, stop) {
    if (this.dead || e !== 'depart' || stop !== 'ours' || !this.opened() || this.marked(G43.train)) return;
    const F = this.gs.v42 && this.gs.v42.freight;
    // (Freight's own listener ran first (made at the v4.2 build, before this hook): payExports has moved the surplus
    //  aboard into cardAboard; card crates aboard count too)
    if (!F || !(F.cardAboard > 0)) return;
    this.ensureX();
    if (!this.x || this.x.t >= need('train')) return;
    this.saw[G43.train] = true;
    this.x.t++;
    this.ver++;
    this.writeX();
    this.reached(this.x.t >= need('train'));
  }
  /** a counter reached its need: the marker and the coins now, not at the next tick (Growth saves right after a card,
   *  so a reload a moment later never finds the count without its marker) */
  reached(full) {
    if (!full) return;
    try { this.tick(); } catch (e) { if (this.errs++ < 3) console.error('[goals43] tick', e); }
    this.t = 0;
  }

  // ------------------------------------------------------------------ the 1-Hz tick
  tick() {
    const gs = this.gs, pr = gs.progress;
    if (!pr || !gs.v42) return;
    // (s4Early: the old plan's stage-4 pad at 읍)
    if (CFG().s4Early === true && !pr.flags[FLAG43.g43s4] && gs.v4 && gs.v4.rank && gs.v4.rank.level >= 2) pr.setFlag(FLAG43.g43s4);
    const act = this.running();
    if (!this.opened()) { if (act) this.open(); return; }
    this.ensureX();
    if (!act) return;
    // 1. the markers of rows 1–8: a rule seen false this session and true now pays (BP-39)
    const lastCur = this.lastCur, fresh = [];
    let wrote = false;
    for (const d of ROWS8) {
      if (this.marked(d.id)) continue;
      if (!this.rule(d)) { this.saw[d.id] = true; continue; }
      const pay = !!this.saw[d.id];
      this.seenW()[d.id] = 1;                 // the marker first, then the coins (a second look never pays again)
      wrote = true;
      const n = pay ? reward(d.k) : 0;
      if (n > 0 && gs.economy) { const p = gs.player; gs.economy.add(n, p ? p.x : undefined, p ? p.y - 60 : undefined, true); this.log.push({ id: d.id, n }); }
      emit(EV43.goal43, { id: d.id, state: pay ? 'done' : 'pre' });
      if (pay) fresh.push({ d, n, wasCur: lastCur === d.id });
    }
    if (wrote) { this.ver++; this.compact(); this.save(); }
    // 2. the rows now
    const ev = this.evaluate(true, true);
    const cur = ev.cur || ev.fb;
    for (const f of fresh) {
      const name = this.nameOf(f.d);
      if (f.wasCur) {
        const nx = cur && cur.id !== f.d.id ? cur : null;
        if (gs.v42.queueBanner) gs.v42.queueBanner('g43:' + f.d.id, gt('g43_doneBanner', { name }), nx ? gt('g43_doneSub', { n: f.n, next: nx.name }) : gt('g43_doneSubEnd', { n: f.n }));
      } else this.toast(gt('g43_doneToast', { name, n: f.n }), 2200);
    }
    // row 9 became current: its pad may show (BP-41; a saved flag, once)
    if (ev.cur && ev.cur.id === G43.s4 && !pr.flags[FLAG43.g43s4]) pr.setFlag(FLAG43.g43s4);
    // rows 1–9 settled: the taste's pad (T) and its banner, once; the pad stays from then on (BP-43)
    if (EupTaste.enabled && ev.gate && !this.seenGet(SEEN43.taste) && !this.seenGet(SEEN43.g43ready)) {
      this.seenW()[SEEN43.g43ready] = 1;
      this.ver++;
      if (gs.v42.queueBanner) gs.v42.queueBanner('g43:ready', gt('g43_readyBanner'), gt('g43_readySub'), { onShow: () => { this.shown.ready++; } });
      this.save();
    }
    const id = cur ? cur.id : null;
    if (id !== this.lastCur) { this.lastCur = id; if (id) emit(EV43.goal43, { id, state: 'now' }); }
    // 3. the opening banner, once the letter, the flag card and any panel are out of the way (BP-48)
    if (this.openDue && this.screenFree()) {
      this.openDue = false;
      if (gs.v42.queueBanner) gs.v42.queueBanner('g43:open', gt('g43_openBanner'), gt('g43_openSub'), { onShow: () => { this.shown.open++; } });
    }
  }

  /** BP-38: the first tick with every v4.2 building: the baselines, rows already true marked with no coins and no banner */
  open() {
    const seen = this.seenW();
    seen[SEEN43.g43open] = 1;
    this.xRead = true;
    this.x = { d: 0, t: 0, k: this.decorBuilt(), u: this.upCount() };
    this.writeX();
    this.ver++;
    emit(EV43.goal43, { id: SEEN43.g43open, state: 'open' });
    let left = 0;
    for (const d of ROWS8) {
      if (this.marked(d.id)) continue;
      if (this.rule(d)) { seen[d.id] = 1; emit(EV43.goal43, { id: d.id, state: 'pre' }); }
      else { this.saw[d.id] = true; left++; }
    }
    const pr = this.gs.progress;
    if (this.hasS4() && !pr.isDone(G43.s4)) left++;
    if (EupTaste.enabled && !this.seenGet(SEEN43.taste)) left++;
    if (left) this.openDue = true;
    this.compact();
    this.save();
  }

  /** BP-54: rows 1–8 all marked -> g43all instead of the eight keys; rows 3, 4, 6, 7 marked -> x.g43 goes */
  compact() {
    if (!this.seenGet(SEEN43.g43all) && ROWS8.every((d) => this.marked(d.id))) {
      const seen = this.seenW();
      seen[SEEN43.g43all] = 1;
      for (const d of ROWS8) delete seen[d.id];
    }
    if (X_ROWS.every((id) => this.marked(id))) {
      const X = this.gs.x43;
      if (this.x || (X && X.get && X.get(X43KEY.goals) !== undefined)) { this.x = null; this.writeX(); }
    }
  }

  /** nothing holds the screen: N's letter, the flag maker / its card, a panel, the 승격식 (or a hold), the tutorial */
  screenFree() {
    const gs = this.gs, ui = gs.scene && gs.scene.get ? gs.scene.get('UI') : null;
    if (!ui || !ui.ready) return false;
    if (ui.panelOpen || ui.buildOpen || ui.v4PanelOpen || ui.v42PanelOpen || ui.adminOpen) return false;
    if (ui.renewal43 && ui.renewal43.isOpen) return false;
    if (this.info && this.info.remapped && !this.seenGet(SEEN43.letter)) return false;
    const fm = ui.flagMaker;
    if (fm && (fm.c || fm.cardC)) return false;
    if (gs.flags && gs.flags.mk) return false;
    if (gs.v4 && gs.v4.rank && gs.v4.rank.ceremonyOn) return false;
    if (gs.tutorial && gs.tutorial.inTutorial) return false;
    const ob = gs.onboard;
    if (ob && (ob.mode === 'act1' || ob.mode === 'act2' || ob.mode === 'tour')) return false;
    const v = gs.v42;
    if (v && v.fromOld && !(v.seen && v.seen.whatsNew)) return false;
    return true;
  }

  /** a toast with its hold (the UI scene itself: gs.ui is a UIProxy whose toast drops the hold) */
  toast(msg, hold) {
    const gs = this.gs, ui = gs.scene && gs.scene.get ? gs.scene.get('UI') : null;
    if (ui && ui.ready && ui.toast) ui.toast(msg, hold);
    else if (gs.ui && gs.ui.toast) gs.ui.toast(msg);
  }

  /** (tests) the chain as plain data */
  state() {
    const ev = this.liveEv(), cur = ev.cur || ev.fb;
    const row = (r) => ({ id: r.id, state: r.state, why: r.why, have: r.have, need: r.need, coins: r.coins, place: r.place ? { x: Math.round(r.place.x), y: Math.round(r.place.y) } : null, wait: r.g43.wait, sub: this.sub(r) });
    const v = this.gs.v43, seen = {};
    if (v && v.seen) for (const k in v.seen) if (/^g43|^eup_taste$/.test(k)) seen[k] = v.seen[k];
    const X = this.gs.x43;
    return { opened: this.opened(), running: this.running(), cur: cur ? cur.id : null, gate: ev.gate, tasteReady: this.tasteReady(), rows: ev.rows.map(row), x: X && X.get ? X.get(X43KEY.goals) || null : null, seen, log: this.log.slice(), shown: Object.assign({}, this.shown), openDue: this.openDue, flagS4: !!(this.gs.progress && this.gs.progress.flags[FLAG43.g43s4]), dead: this.dead };
  }
}
