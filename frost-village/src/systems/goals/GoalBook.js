// (v4.3) 목표 창 — what is left to do, read from the game's own progression (nothing here is saved or changes play).
//   main   the main road in order: the first loop's and the four zones' steps (Progression STEPS without side / v3 / v4 /
//          c1 rows and the ones that come with another), then the v4 GOALS after village complete (passive ones come by
//          themselves), then the three v4.2 buildings (사무실 · 은행 · 물류창고). One is "now" (Progression.nextGoal() /
//          the first one not done), the others "next" (locked: the one before comes first) or "wait" (passive, in progress);
//          (v4.3 step B) then the post-depot chain GOALS43 from gs.goals43 (src/systems/goals/Goals43.js, package G)
//   side   the optional purchases standing in the village now (every paid pad that is not the main one: clerks, porters,
//          2nd / 3rd workers, bench upgrades, line offers, the office hire, the restaurant staff) + the first houses'
//          plots; what the coins pay for first, then the cheapest
//   place  where a tap walks the chief: the pad / plot drop pad / site drop pad / food box / town gate ({ x, y, pad })
// Rows: { id, kind, name, icon, coins, items, have, need, state, afford, place, why, sub }

import { STEPS, GOALS, COMES_WITH, stepCost, workerLook } from '../Progression.js';
import { WORLD } from '../../data/world.js';
import { BALANCE } from '../../data/balance.js';
import { Assets } from '../../core/Assets.js';
import { t, fmt } from '../../data/strings.js';
import { buildCost } from '../../entities/Site.js';
import { gt } from './strings.js';

const WITH = new Set([].concat(...Object.values(COMES_WITH)));
/** the main road before village complete (17 steps: the bakery split added 빵집 짓기 and 빵집 판매원) */
export const MAIN_STEPS = STEPS.filter((s) => !s.side && !s.v3 && !s.v4 && !s.c1 && !WITH.has(s.id));
/** (v4.2) the three buildings after 읍 (Tutorial.v42Goal's plots) */
export const V42_BUILDS = [['v42_office', 'chief_office'], ['v42_bank', 'bank42'], ['v42_depot', 'depot42']];
const ITEM_SHORT = (k) => t(k);
const pick = (...keys) => { for (const k of keys) { try { if (k && Assets.has(k)) return k; } catch (e) { /* */ } } return keys[keys.length - 1]; };

export class GoalBook {
  constructor(gs) { this.gs = gs; }

  /** the icon of a STEPS row (the face of who comes, like Progression.syncPads) */
  stepIcon(s) {
    const gs = this.gs, pad = gs.progress.pads[s.id];
    if (pad && pad.opts && pad.opts.icon) return pad.opts.icon;
    if (s.type === 'hire' || s.type === 'hire2' || s.type === 'hire3') return pick('portrait_' + workerLook(gs, s), 'portrait_' + s.worker, 'ui_icon_worker');
    if (s.type === 'operator') { const w = WORLD.labour && WORLD.labour.ops[s.station]; return pick(w && w.who ? 'portrait_' + w.who : null, 'ui_icon_worker'); }
    // ((bakefix) the 자재 점원 and the 빵집 판매원 are npc_clerk_b (their pads show her face: Progression.syncPads)
    if (s.type === 'clerk') return pick(s.seller === 'trade' || s.seller === 'bakery' ? 'portrait_npc_clerk_b' : 'portrait_npc_clerk_a', 'ui_icon_clerk', 'ui_icon_worker');
    if (s.type === 'shop' || s.type === 'bakery') return pick('ui_icon_hammer', 'ui_icon_lock_open', 'ui_icon_lock');
    if (s.type === 'zone' || s.type === 'tower') return pick('ui_icon_lock_open', 'ui_icon_lock');
    if (s.type === 'boat') return s.level >= 2 ? 'item_fish_big' : 'item_fish_raw';
    if (s.type === 'rank') return pick('ui_badge_rank_2', 'ui_icon_fame', 'ui_icon_lock');
    return pick('ui_icon_goal', 'ui_icon_lock');
  }

  /** a step's display name (its pad's own words) */
  stepName(s) {
    if (s.type === 'zone') return gt('g_zone', { name: t(s.id) });
    if (s.type === 'tower') return gt('g_tower', { name: t(s.id) });
    return t(s.id);
  }

  /** a row for a STEPS entry (main road) */
  stepRow(s, state) {
    const gs = this.gs, pr = gs.progress, pad = pr.pads[s.id];
    const done = pr.isDone(s.id);
    const r = { id: s.id, kind: 'step', name: this.stepName(s), icon: this.stepIcon(s), coins: pad ? pad.remaining : stepCost(s) || 0, items: null, state: done ? 'done' : state, place: null, why: null };
    if (pad && pad.items) { r.items = {}; for (const k in pad.items) { const left = pad.items[k] - (pad.got[k] || 0); if (left > 0) r.items[k] = left; } }
    // ((bakefix) 빵집 짓기 before its pad stands: its planks too (balance.js bakery43.build, every key but coins), not coins alone
    else if (!pad && !done && s.type === 'bakery') { const B = (BALANCE.bakery43 && BALANCE.bakery43.build) || {}; const it = {}; for (const k in B) if (k !== 'coins' && Number(B[k]) > 0) it[k] = Math.floor(Number(B[k])); r.items = Object.keys(it).length ? it : null; }
    if (!done && pad && pad.active && !pad.done) r.place = { x: pad.x, y: pad.y, pad: pad.pad, ref: pad };
    else if (!done && state === 'now') r.why = 'wait';
    return r;
  }

  /** a row for a v4 GOALS entry */
  goalRow(g, state) {
    const gs = this.gs, pr = gs.progress, T = gs.tutorial;
    const done = pr.goalDone(g);
    const r = { id: g.id, kind: g.kind, name: g.id, icon: 'ui_icon_goal', coins: 0, items: null, state: done ? 'done' : state, place: null, why: null };
    const sitePlace = (st) => ({ x: st.dropX, y: st.dropY, pad: st.dropPad || st.pad, ref: st });
    const siteSub = (st) => { let got = 0, need = 0; for (const m in st.need) { need += st.need[m]; got += Math.min(st.need[m], st.stock.countOf(m)); } return { got, need }; };
    if (g.kind === 'region') {
      const s = STEPS.find((q) => q.id === g.step);
      r.name = gt('g_tower', { name: t(g.step) });
      r.icon = pick('ui_icon_lock_open', 'ui_icon_lock');
      const pad = pr.pads[g.step], st = gs.sites && gs.sites[g.step];
      r.coins = pad ? pad.remaining : (s ? stepCost(s) : 0) || 0;
      if (!done && pad && pad.active) r.place = { x: pad.x, y: pad.y, pad: pad.pad, ref: pad };
      else if (!done && st && st.state === 'foundation') { r.place = sitePlace(st); const q = siteSub(st); r.building = q; }
      else if (!done && st && st.state === 'scaffold') r.why = 'passive';
    } else if (g.kind === 'build') {
      r.name = gt('g_build', { name: t('b_' + g.id) });
      r.icon = pick('ui_icon_hammer', 'ui_icon_house', 'ui_icon_lock');
      const c = buildCost(g.id);
      r.coins = c.coins || 0;
      const it = {};
      for (const k of ['item_plank', 'item_ingot']) if (c[k] > 0) it[k] = c[k];
      r.items = Object.keys(it).length ? it : null;
      if (!done) {
        const st = this.siteOf(g.id);
        if (st && st.state === 'foundation') { r.place = sitePlace(st); r.building = siteSub(st); r.coins = 0; r.items = null; }
        else if (st) { r.why = 'passive'; r.coins = 0; r.items = null; }
        else {
          const pl = T && T.plotFor ? T.plotFor(g.id) : null;
          // (a later goal: only a plot whose build menu already offers it — not a locked card at the end of the walk)
          const open = pl && (state !== 'next' || !gs.buildChoices || (gs.buildChoices(pl).find((q) => q.key === g.id) || { locked: true }).locked === false);
          if (pl && open) r.place = { x: pl.dropX, y: pl.dropY, pad: pl.pad, ref: pl };
          else r.why = pl ? null : 'noplot';
        }
      }
    } else if (g.kind === 'step') {
      const s = STEPS.find((q) => q.id === g.id);
      if (s) return Object.assign(this.stepRow(s, state), { kind: 'step' });
    } else if (g.kind === 'flag') {
      if (g.id === 'fedMiners') {
        r.name = gt('g_fedMiners'); r.icon = pick('item_bread', 'ui_icon_food');
        r.note = 'g_fedSub';             // ((review L7) what it asks for, under the name)
        const fb = gs.foodBox;
        if (!done && fb && fb.active && fb.pad) r.place = { x: fb.x, y: fb.y, pad: fb.pad, ref: fb };
      } else if (g.id === 'firstTrain') { r.name = gt('g_firstTrain'); r.icon = pick('ui_icon_delivery', 'ui_icon_porter', 'ui_icon_goal'); r.why = 'passive'; }
      else if (g.id === 'townVisit') {
        r.name = gt('g_townVisit'); r.icon = pick('ui_icon_people', 'ui_icon_goal');
        const nb = gs.v4, gate = nb && (nb.buildings || []).find((b) => b.id === 't_gate');
        if (!done && pr.flags.townInvite && gate && gs.territory && gs.territory.isOpen('town')) r.place = { x: gate.x, y: gate.y + 40, pad: null, ref: gate };
        else if (!done) r.why = 'passive';
      } else { r.name = t(g.id); r.why = 'passive'; }
    } else if (g.kind === 'shops' || g.kind === 'people') {
      const n = pr.goalNeed(g);
      r.name = gt(g.kind === 'shops' ? 'g_shops' : 'g_people', { n });
      r.icon = g.kind === 'shops' ? pick('ui_icon_shop', 'ui_icon_house', 'ui_icon_goal') : pick('ui_icon_people', 'ui_icon_worker');
      r.have = Math.min(n, pr.goalValue(g) || 0); r.need = n;
      r.why = 'passive';
    } else if (g.kind === 'rank') {
      r.name = gt('g_rank'); r.icon = pick('ui_badge_rank_2', 'ui_icon_fame', 'ui_icon_goal');
      const pad = pr.pads.rank_eup;
      if (pad) { r.coins = pad.remaining; if (!done && pad.active) r.place = { x: pad.x, y: pad.y, pad: pad.pad, ref: pad }; }
      else {
        const rk = gs.v4 && gs.v4.rank, bars = rk && rk.bars ? rk.bars() : [];
        const b = bars.find((x) => !x.full);
        if (b) { r.have = b.v; r.need = b.need; }
        r.why = 'passive';
      }
    }
    return r;
  }

  /** a row for one of the v4.2 buildings */
  v42Row(id, bkey, state) {
    const gs = this.gs;
    const done = gs.isBuilt && gs.isBuilt(bkey);
    const c = buildCost(bkey);
    const r = { id: 'v42:' + bkey, kind: 'build', name: gt('g_build', { name: t('b_' + bkey) }), icon: pick(bkey === 'chief_office' ? 'ui_icon_office' : bkey === 'bank42' ? 'ui_icon_bank' : 'ui_icon_hammer', 'ui_icon_hammer', 'ui_icon_house'), coins: c.coins || 0, items: null, state: done ? 'done' : state, place: null, why: null };
    const it = {};
    for (const k of ['item_plank', 'item_ingot']) if (c[k] > 0) it[k] = c[k];
    r.items = Object.keys(it).length ? it : null;
    if (done) return r;
    const st = gs.sites && gs.sites[id];
    // (a later one: only when its plot's build menu already offers it — not a locked card at the end of the walk)
    const open = st && (state !== 'next' || !gs.buildChoices || (gs.buildChoices(st).find((q) => q.key === bkey) || { locked: true }).locked === false);
    if (st && st.state === 'plot' && st.shown && open) r.place = { x: st.dropX, y: st.dropY, pad: st.pad, ref: st };
    else if (st && st.state === 'plot') { if (state === 'now') r.why = 'wait'; }
    else if (st && st.state === 'foundation') { r.place = { x: st.dropX, y: st.dropY, pad: st.dropPad, ref: st }; let got = 0, need = 0; for (const m in st.need) { need += st.need[m]; got += Math.min(st.need[m], st.stock.countOf(m)); } r.building = { got, need }; r.coins = 0; r.items = null; }
    else if (st && st.state !== 'plot') r.why = 'passive';
    else if (state === 'now') r.why = 'wait';
    return r;
  }

  /** the site (not done) that is building `bkey`, or null */
  siteOf(bkey) {
    const S = this.gs.sites || {};
    for (const id in S) { const s = S[id]; if (s.building === bkey && s.state !== 'done' && s.state !== 'plot') return s; }
    return null;
  }

  /** the whole main road as rows (done, now, wait, next) */
  mainRows() {
    const gs = this.gs, pr = gs.progress;
    const rows = [];
    let cur = null;
    // 1. the first loop and the zones
    for (const s of MAIN_STEPS) {
      const st = !cur && !pr.isDone(s.id) ? 'now' : 'next';
      const r = this.stepRow(s, st);
      if (r.state === 'now') cur = r;
      rows.push(r);
    }
    // 2. the v4 goals (after village complete; before it they are all "next"). Progression.nextGoal() is the one the chief
    //  can work on; a passive one in progress before it (a train, shops opening, a plot to wait for) "waits"
    const ng = pr.complete ? pr.nextGoal() : null;
    for (const g of GOALS) {
      let st = 'next';
      if (pr.complete && !cur) {
        const passive = g.passive || (g.when && !pr.met(g.when)) || (g.waitPlot && !gs.isBuilding(g.id) && pr.freePlotFor && !pr.freePlotFor(g.id));
        st = passive ? 'wait' : g === ng ? 'now' : 'next';
      }
      const r = this.goalRow(g, st);
      if (r.state === 'now') cur = r;
      rows.push(r);
    }
    // 3. the v4.2 buildings (after 읍: every v4 goal done)
    const after = pr.complete && GOALS.every((g) => pr.goalDone(g));
    for (const [id, bkey] of V42_BUILDS) {
      const st = after && !cur && gs.v42 ? 'now' : 'next';
      const r = this.v42Row(id, bkey, st);
      if (r.state === 'now') cur = r;
      rows.push(r);
    }
    // 4. (v4.3 step B, G/T — BP-49) after the 물류창고: GOALS43 (src/systems/goals/Goals43.js; none until G lands)
    const G43 = gs.goals43;
    if (G43) for (const r of G43.rows(after && !cur, this) || []) { if (r.state === 'now' && !cur) cur = r; rows.push(r); }
    return { rows, cur };
  }

  /** the side goals standing now: every paid pad that is not the current main one, + the first houses' plots */
  sideRows(cur) {
    const gs = this.gs, coins = gs.economy ? gs.economy.coins : 0, out = [];
    const curRef = cur && cur.place ? cur.place.ref : null;
    // ((v4.3 step B, BP-52) the places of the post-depot rows not done yet — the forklift pad, a 2단 pad, a first-house
    //  plot, the mkt_s4 pad — are main rows (in 「다음」), never side rows too)
    const G43 = gs.goals43, g43refs = G43 ? G43.refs() : null;
    for (const pad of gs.paidPads ? gs.paidPads() : []) {
      if (!pad || !pad.active || pad.done || pad.maxed || pad === curRef || !(pad.remaining > 0 || pad.items)) continue;
      if (g43refs && g43refs.has(pad)) continue;
      const s = STEPS.find((q) => q.id === pad.id);
      // (a main-road pad that is not the current one yet — e.g. the next zone already showing — is not a side goal)
      if (s && !s.side && MAIN_STEPS.indexOf(s) >= 0) continue;
      if (s && (s.v3 || s.v4) && !s.side && (s.type === 'rank' || GOALS.some((g) => g.id === s.id || g.step === s.id))) continue;
      const name = (pad.labelText && pad.labelText.text) || t(pad.id);
      // ((review L7) a pad's padlock art on a row the chief can walk to read as "locked": an upgrade's tools instead)
      let icon = (pad.opts && pad.opts.icon) || 'ui_icon_goal';
      if (/^ui_icon_lock/.test(icon)) icon = pick('ui_icon_tools', 'ui_icon_hammer', 'ui_icon_goal');
      const r = { id: pad.id, kind: 'pad', name: name.replace(/\s+/g, ' ').trim(), icon, coins: pad.remaining, items: null, state: 'side', place: { x: pad.x, y: pad.y, pad: pad.pad, ref: pad }, why: null };
      if (pad.items) { const it = {}; for (const k in pad.items) { const left = pad.items[k] - (pad.got[k] || 0); if (left > 0) it[k] = left; } r.items = Object.keys(it).length ? it : null; }
      r.afford = coins >= r.coins && !r.items;
      out.push(r);
    }
    // (v4.3) the first houses: their own plots (a side goal), numbered in plot order
    let hn = 0;
    for (const id in gs.sites || {}) {
      const st = gs.sites[id];
      if (!st.cfg || !st.cfg.side43) continue;
      hn++;
      if (st.state !== 'plot' || !st.shown || (g43refs && g43refs.has(st))) continue;
      const c = buildCost(st.only, id);
      const r = { id: 'plot:' + id, kind: 'plot', name: gt('g_house43', { n: hn }), icon: pick('ui_icon_house', 'ui_icon_hammer'), coins: c.coins || 0, items: null, state: 'side', place: { x: st.dropX, y: st.dropY, pad: st.pad, ref: st }, why: null };
      const it = {};
      for (const k of ['item_plank', 'item_ingot']) if (c[k] > 0) it[k] = c[k];
      r.items = Object.keys(it).length ? it : null;
      r.afford = coins >= r.coins;
      out.push(r);
    }
    // ((v4.3 step B, BP-52) G's own side rows: the depot pads (not in paidPads) that no not-done G row uses as its place)
    if (G43) for (const r of G43.sideRows(cur, coins) || []) out.push(r);
    out.sort((a, b) => (b.afford ? 1 : 0) - (a.afford ? 1 : 0) || a.coins - b.coins);
    return out;
  }

  /** everything the window shows: { cur, next: [rows], side: [rows], sideMore, done, all } */
  read(nNext = 3, nSide = 4) {
    const gs = this.gs, coins = gs.economy ? gs.economy.coins : 0;
    const m = this.mainRows(), rows = m.rows;
    // (nothing the chief can work on: the first goal that waits is shown as "now" — it says it comes by itself)
    const cur = m.cur || rows.find((r) => r.state === 'wait') || null;
    if (cur) cur.afford = !cur.why && cur.coins > 0 && coins >= cur.coins && !cur.items;
    const ci = cur ? rows.indexOf(cur) : -1;
    const next = rows.filter((r, i) => r.state !== 'done' && r !== cur && (ci < 0 || i > ci || r.state === 'wait')).slice(0, nNext);
    const side = this.sideRows(cur);
    return { cur, next, side: side.slice(0, nSide), sideMore: Math.max(0, side.length - nSide), done: rows.filter((r) => r.state === 'done').length, all: rows.length };
  }

  /** the line under a row's name */
  sub(r) {
    // ((v4.3 step B, BP-52) a post-depot row's own line first (Goals43.sub); null = the generic lines below)
    if (r.kind === 'g43' && this.gs.goals43) { const s = this.gs.goals43.sub(r); if (s != null) return s; }
    if (r.state === 'done') return '';
    if (r.building) return gt('g_building', r.building);
    // ((review M1) no free plot first: the 창고 "waits" for a plot, it does not come by itself)
    if (r.why === 'noplot') return gt('g_noPlot');
    if (r.why === 'passive' || r.state === 'wait') return r.need ? gt('g_waiting') + ' · ' + gt('g_have', { have: r.have || 0, need: r.need }) : gt('g_waiting');
    // ((review L7) a later goal with no place yet says it is locked)
    if (r.state === 'next' && !r.place) return r.coins || r.items ? gt('g_lockedTag', { text: this.costText(r) }) : gt('g_lockedSub');
    if (r.note && !r.coins && !r.items) return gt(r.note);
    return this.costText(r);
  }
  costText(r) {
    const items = r.items ? Object.keys(r.items).map((k) => ITEM_SHORT(k) + ' ' + r.items[k]).join(' · ') : '';
    if (!r.coins && items) return items;
    if (!r.coins) return '';
    return items ? gt('g_costItems', { coins: fmt(r.coins), items }) : gt('g_cost', { coins: fmt(r.coins) });
  }
}
