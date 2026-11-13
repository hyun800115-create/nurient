// (v4.3 step B 「마을 새 단장 둘째 걸음」, S5 — WP-S) the hand-made step-B save fixtures (map_save §5.2, build_plan §3.5 S5)
//   node tools/test/fixtures/make_v43.mjs [--check]     (--check: build them in memory and compare with the files; no writes)
// Deterministic: the same files every run (fixed times, no randomness but a seeded one). Every fixture carries a `_note`.
//
//   v43a1_village.json         v8   an a1-era village (v4.3.0-a1, 21e3ef4): shop43 with stage 2 + 3, the 빵·고기 clerk, meat
//                                   cans bought (flags.meatCan, seen.mcanOffer, v42.seen.up.mcan, meat cans in the store), the
//                                   two first houses (h43_1 / h43_2); made from v42_village_late (office, bank, depot, staff)
//   v43_xl_swap_both.json      v7   hall on w_rest AND restaurant on w_hall (both done) -> R43 swaps them (V-N2)
//   v43_xl_swap_hall.json      v7   hall on w_rest, w_hall empty -> the hall moves to w_hall
//   v43_xl_swap_rest.json      v7   restaurant (foundation, 4 planks in) on w_hall, w_rest empty -> it moves to w_rest
//   v43_xl_swap_kept.json      v7   hall on w_rest while w_hall holds a house (hand-made: no pre-B menu offered a house on an
//                                   XL plot) -> the hall stays (V-N3, refunds43.kept 1) and check43b refuses the move (the house
//                                   would be dropped from w_hall): the failure card, the stored village untouched. _expect 'fail'
//   v43_reprice_room.json      v7   hall foundation 25 / 8 + office scaffold 20 / 6 (t 9.5), the 창고 with 20 places left ->
//                                   planks into the 창고 (20), the rest (1 plank, 10 ingots) as coins
//   v43_reprice_full.json      v7   hall scaffold 30 / 10, a full 창고 (300) -> every extra as coins
//   v43_reprice_nowh.json      v7   hall foundation 25 / 8 + office foundation 12 / 2, no 창고 -> coins
//   v43_newer_lv46.json        keys a v4.6 village (v 8, lv 46): x at every cap, missions / geumbang / haul / demand at their caps,
//                                   sites labour_office / material / stall, v43.toggles -> refused (held / 'newerSave')
//   v43_newer_v9lv50.json      keys the same at v 9, lv 50 (v5.0)
//   v43_newer_v9.json          keys the same at v 9 without lv
//   v43_samelv_x.json          v8 lv 43 lay 2   a step-B village of this level: random x keys (an unknown key, integer-like
//                                   nested keys) and every slice exactly at its cap -> loaded as it is, written back byte for byte
// A PRE-B fixture (everything above but the newer / same-level ones, and every fixture exported from an old build:
// export_old43.mjs) must not carry `v43` or `lv` (BP-22): assertPreB refuses it — a save exported from a step-B tree carries
// lay 2 and would never be remapped.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAVE_KEY = 'frostVillage.save.v1';
const T0 = 1789000000000;          // a fixed save time (2026-09-09): the files never change between runs

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const clone = (o) => JSON.parse(JSON.stringify(o));
const read = (f) => JSON.parse(fs.readFileSync(path.join(HERE, f), 'utf8'));

/** a pre-B fixture's save (object, text, or a { keys } / keys map) must carry neither `v43` nor `lv` (BP-22). Throws */
export function assertPreB(name, fx) {
  let s = fx;
  if (isObj(s) && isObj(s.keys)) s = s.keys;
  if (isObj(s) && typeof s[SAVE_KEY] === 'string') s = s[SAVE_KEY];
  if (typeof s === 'string') s = JSON.parse(s);
  if (!isObj(s)) throw new Error(name + ': no save in this fixture');
  if ('v43' in s || 'lv' in s) throw new Error(name + ': a pre-B fixture carries ' + ('v43' in s ? 'v43' : 'lv') + ' — exported from a step-B build? (BP-22)');
  if (!(typeof s.v === 'number' && s.v >= 1 && s.v <= 8)) throw new Error(name + ': v ' + s.v + ' is not a pre-B save version');
  return true;
}

/** put `_note` (and `_expect`) first, then the save (the order the other fixtures use) */
const withNote = (note, save, extra) => Object.assign({ _note: note }, extra || {}, save);

export function build() {
  const out = {};
  const S46 = read('v41_save_smart_46min.json');
  const LATE = read('v42_village_late.json');

  // ---- a1
  {
    const s = JSON.parse(LATE.keys[SAVE_KEY]);
    s.v = 8;
    s.t = T0;
    const pr = s.progress;
    pr.flags.shop43 = true;
    pr.flags.firstBreadSale = true;
    pr.done.mkt_s2 = true;
    pr.done.mkt_s3 = true;
    if (pr.done.hire_clerk_market) pr.done.hire_clerk_s3 = true;
    delete pr.paid.mkt_s3; delete pr.paid.hire_clerk_s3;
    if (isObj(pr.got)) delete pr.got.mkt_s3;
    pr.flags.meatCan = true;
    pr.seen.mcanOffer = true;
    s.v42 = s.v42 || {};
    s.v42.seen = Object.assign({}, s.v42.seen, { up: Object.assign({}, (s.v42.seen || {}).up, { mcan: 1 }) });
    s.v3.store.stock.item_can_meat = 14;
    s.v3.workshops.cannery.ins.item_meat_raw = 6;
    s.sites.h43_1 = { b: 'house_c', st: 'done' };
    s.sites.h43_2 = { b: 'house_a', st: 'done' };
    out['v43a1_village.json'] = withNote('(v4.3 step B, S5 — make_v43.mjs) an a1-era village (v4.3.0-a1, 21e3ef4, v8): shop43 with stage 2 + 3 and the 빵·고기 clerk, meat cans bought (flags.meatCan, seen.mcanOffer, v42.seen.up.mcan, 14 meat cans in the store, raw meat in the cannery), both first houses done (h43_1, h43_2); workshops on e_m1 / e_m2 / w_m1 / w_m2, hall w_hall, restaurant w_rest, office / bank / depot done. Made from v42_village_late. R43 moves the four workshops to d_*', s);
  }

  // ---- XL swaps (v7, from the 46-min v4.1 village: hall w_hall, restaurant w_rest, both done)
  const v7 = () => { const s = clone(S46); s.v = 7; s.t = T0; return s; };
  {
    const s = v7();
    s.sites.w_rest = { b: 'town_hall', st: 'done' };
    s.sites.w_hall = { b: 'big_restaurant', st: 'done' };
    out['v43_xl_swap_both.json'] = withNote('(v4.3 step B, S5 — make_v43.mjs) XL swap: the town hall on w_rest and the big restaurant on w_hall (both done; both XL plots offered both before step B). R43 swaps them: hall -> w_hall, restaurant -> w_rest (V-N2). v7, from v41_save_smart_46min', s);
  }
  {
    const s = v7();
    delete s.sites.w_hall;
    s.sites.w_rest = { b: 'town_hall', st: 'done' };
    out['v43_xl_swap_hall.json'] = withNote('(v4.3 step B, S5 — make_v43.mjs) XL swap: the town hall on w_rest, w_hall empty, no restaurant. R43 moves the hall to w_hall. v7, from v41_save_smart_46min', s);
  }
  {
    const s = v7();
    delete s.sites.w_rest;
    s.sites.w_hall = { b: 'big_restaurant', st: 'foundation', got: { item_plank: 4 }, t: 0 };
    delete s.c1;
    out['v43_xl_swap_rest.json'] = withNote('(v4.3 step B, S5 — make_v43.mjs) XL swap: a big restaurant foundation (4 planks in) on w_hall, w_rest empty, no hall. R43 moves it to w_rest with its planks. v7, from v41_save_smart_46min', s);
  }
  {
    const s = v7();
    s.sites.w_hall = { b: 'house_b', st: 'done' };
    s.sites.w_rest = { b: 'town_hall', st: 'done' };
    out['v43_xl_swap_kept.json'] = withNote('(v4.3 step B, S5 — make_v43.mjs) hand-made: the town hall on w_rest while w_hall holds a house (no pre-B menu offered a house on an XL plot). R43 leaves the hall where it is (V-N3, refunds43.kept 1); check43b then refuses the move because the house would be dropped from w_hall (only: town_hall): the failure card, the stored village byte-identical. v7', s, { _expect: 'fail' });
  }

  // ---- reprice (v7)
  {
    const s = v7();
    s.sites.w_hall = { b: 'town_hall', st: 'foundation', got: { item_plank: 25, item_ingot: 8 }, t: 0 };
    s.sites.v42_office = { b: 'chief_office', st: 'scaffold', got: { item_plank: 20, item_ingot: 6 }, t: 9.5 };
    s.v3.warehouse = { item_fish_cooked: 120, item_bread: 100, item_can: 60 };        // 280 of 300: 20 places left
    out['v43_reprice_room.json'] = withNote('(v4.3 step B, S5 — make_v43.mjs) reprice: an unfinished hall (foundation, 25 planks + 8 ingots in) and office (scaffold 20 + 6, t 9.5) paid at the old prices (2,400 / 1,800). R43: +1,200 and +1,400 coins; extras 21 planks + 10 ingots: 20 planks into the 창고 (280 / 300 full), 1 plank + 10 ingots as coins; the office t clamped to 8; the chief at the shop front (the office is unfinished). v7', s);
  }
  {
    const s = v7();
    s.sites.w_hall = { b: 'town_hall', st: 'scaffold', got: { item_plank: 30, item_ingot: 10 }, t: 3 };
    s.v3.warehouse = { item_fish_cooked: 150, item_bread: 100, item_can: 50 };        // full
    out['v43_reprice_full.json'] = withNote('(v4.3 step B, S5 — make_v43.mjs) reprice: the hall scaffold (30 planks + 10 ingots in) with a full 창고 (300 / 300). R43: +1,200 coins, 14 planks + 6 ingots as coins at priceOf. v7', s);
  }
  {
    const s = v7();
    s.sites.w_hall = { b: 'town_hall', st: 'foundation', got: { item_plank: 25, item_ingot: 8 }, t: 0 };
    s.sites.v42_office = { b: 'chief_office', st: 'foundation', got: { item_plank: 12, item_ingot: 2 }, t: 0 };
    delete s.sites.w_m1;                                                              // no 창고
    delete s.v3.warehouse;
    out['v43_reprice_nowh.json'] = withNote('(v4.3 step B, S5 — make_v43.mjs) reprice without a 창고: hall foundation 25 + 8, office foundation 12 + 2. R43: +1,200 +1,400 coins; extras 13 planks + 6 ingots as coins. v7', s);
  }

  // ---- newer villages (codes: every game key)
  const exact = (n, tag) => { const o = { v: 1, tag, d: '' }; o.d = 'x'.repeat(n - JSON.stringify(o).length); return o; };
  const capsX = () => {
    const x = {};
    for (const [k, cap] of Object.entries({ log: 512, mgmt: 256, needs: 1024, daily: 512, rewards: 512, money: 896, book: 1024, mail: 512, wk: 1024 })) {
      const a = [];
      while (JSON.stringify(a).length + 8 < cap - 2) a.push(1234567);
      x[k] = a;
    }
    return x;
  };
  const newer = (v, lv) => {
    const s = JSON.parse(LATE.keys[SAVE_KEY]);
    const head = { v };
    if (lv !== undefined) head.lv = lv;
    const o = Object.assign(head, { t: T0 }, s, { v });
    if (lv !== undefined) o.lv = lv;
    o.v43 = { lay: 2, toggles: { counters: { fish: false }, stations: { grill: false } }, seen: { letter43: 1, tour43: 1, s4offer: 1 } };
    o.x = capsX();
    o.missions = exact(3072, 'missions'); o.geumbang = exact(1400, 'geumbang'); o.haul = exact(768, 'haul'); o.demand = exact(1024, 'demand');
    o.sites = Object.assign({}, o.sites, { d_labour: { b: 'labour_office', st: 'done' }, s_m1: { b: 'material', st: 'done' }, se_m1: { b: 'stall', st: 'foundation', got: {} } });
    return Object.assign({}, LATE.keys, { [SAVE_KEY]: JSON.stringify(o) });
  };
  out['v43_newer_lv46.json'] = { _note: '(v4.3 step B, S5 — make_v43.mjs) a village from a newer build (v4.6: v 8, lv 46) as every game key (a 마을 옮기기 code\'s keys): x at every cap, the missions / geumbang / haul / demand slices at their caps, sites labour_office / material / stall, v43.toggles. This build refuses it: Save.load holds it (newer card), Transfer.dryRun gives newerSave; the stored text stays byte-identical', keys: newer(8, 46) };
  out['v43_newer_v9lv50.json'] = { _note: '(v4.3 step B, S5 — make_v43.mjs) the same village from v5.0 (v 9, lv 50): refused like lv 46', keys: newer(9, 50) };
  out['v43_newer_v9.json'] = { _note: '(v4.3 step B, S5 — make_v43.mjs) the same village at v 9 without lv: refused (v > 8, V-N8)', keys: newer(9, undefined) };

  // ---- a same-level step-B village (lv 43, lay 2): x keys and slices pass through
  {
    let seed = 4343;
    const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
    const s = JSON.parse(LATE.keys[SAVE_KEY]);
    const o = Object.assign({ v: 8, lv: 43, t: T0 }, s, { v: 8, lv: 43, t: T0 });
    o.v43 = { lay: 2, seen: { letter43: 1, tour43: 1 }, refunds43: { coins: 1200, items: { item_plank: 9 }, wh: { item_plank: 9 }, moved: 4, kept: 0 }, src: { v: 7, lv: 0 } };
    const arr = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 1000));
    o.x = {
      log: [[2, 1, 1200, 4, 0], [5, 'a', 3]],
      money: { w: arr(20), 7: { '12': arr(4), '3': 'z' }, d: [[1, 2], [3, 4]] },
      book: { sea: ['fish1', 'fish2'], '10': 1, '2': 2 },
      fest: { last: 20261224, got: [2025, 2026], '0': true },            // an unknown key (the plaza, v4.7): ≤ 512, kept
      mail: [['hi', 1], ['yo', 2]],
    };
    o.missions = exact(3072, 'missions'); o.geumbang = exact(1400, 'geumbang'); o.haul = exact(768, 'haul'); o.demand = exact(1024, 'demand');
    out['v43_samelv_x.json'] = withNote('(v4.3 step B, S5 — make_v43.mjs) a step-B village of this level (v 8, lv 43, v43.lay 2: never remapped) with x keys (an unknown one, integer-like nested keys) and every module slice exactly at its cap: Save.load keeps them and the game writes them back byte for byte', o);
  }

  // the guard: every pre-B fixture
  for (const [n, fx] of Object.entries(out)) if (!/^v43_(newer|samelv)/.test(n)) assertPreB(n, fx);
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const check = process.argv.includes('--check');
  const files = build();
  let bad = 0;
  for (const [n, fx] of Object.entries(files)) {
    const txt = JSON.stringify(fx, null, 1) + '\n';
    const p = path.join(HERE, n);
    if (check) {
      const same = fs.existsSync(p) && fs.readFileSync(p, 'utf8') === txt;
      if (!same) bad++;
      console.log((same ? '  same  ' : ' DIFFER ') + n);
    } else {
      fs.writeFileSync(p, txt);
      console.log('  wrote ' + n + ' (' + txt.length + ' B)');
    }
  }
  if (check) { console.log(bad ? bad + ' differ' : 'all same'); process.exit(bad ? 1 : 0); }
}
