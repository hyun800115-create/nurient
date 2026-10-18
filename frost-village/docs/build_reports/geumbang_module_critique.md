# 금방 module (GB-CODE) — adversarial critique

Repository `/home/user/nurient/frost-village` (paths below are relative to it). Date 2026-10-17. Read-only review of
`src/geumbang/**`, `tools/test/geumbang_lab/**` and `docs/build_reports/geumbang_module.md` against
`docs/geumbang_plan.md` (binding), `docs/기획서_금방마켓.md`, `docs/CONTRACT_GEUMBANG.md` and the CURRENT v4.2 code. No
module, v4.2 or prepared-module file was edited; no git commit. Every probe lives in the scratch folder
`/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/geumbang_module_critique/`
(`p1_*.mjs` … `p11_*.mjs`, `p7_ingame.json`, `lab_out/`, `patched/` = the Integration patches applied to a copy).

## Verdict

**Not ready to integrate as is — fix first (1 critical, 6 high).** The engineering is careful: the model is pure and
seeded, the 30 Node tests pass (29 + 1 skipped), item and coin conservation hold in the fake environment, the save
slice is robust (fuzz, cap, fold-to-`back`), the brand is original (no real name, gold + cream, no letters on
mirrored sprites), files / textures / save size are inside the budgets, and all 31 Integration anchors still match
today's v4.2 code. But the two things the designer asked for do not happen in the real v4.2 game:

1. **재고가 빨리 줄어요 — no.** The v4.2 walk-in 솔방울 상인 already empty the depot racks every day; 금방 only re-sells
   the same crates at a higher price and adds ≈ 0 drain (C1). The village piles the designer sees overflowing are
   upstream of the depot and are not touched at all.
2. **The charming doorstep — almost never.** The adapter reads a TownSim field that does not exist, so nobody is ever
   home: no door opens, no hand-over, no hearts, no joke line, for every customer but 정 할머니 (H1). And 정 할머니's
   own 첫 주문 따라가기 silently never happens when the racks are near-empty at the opening — the normal daytime state
   (H2). When it does happen, its caption "띵동! · 화면을 누르면 끝나요" stays stuck in the middle of the screen
   afterwards (H6).

All four were reproduced in the real game (§In-game probe). Most fixes are small and module-side (H1 and H6 are one
line each); C1 needs a design decision on where 금방's stock comes from, then the census the plan asked for.

The builder's tests could not see any of this: the fake depot has no walk-in buyers and starts 85 % full, the fake
town's `home()` is a schedule, and both in-game dry runs hand-inject 314 items into the racks before opening.

| Severity | Count | IDs |
|---|---|---|
| Critical | 1 | C1 |
| High | 6 | H1 – H6 |
| Medium | 9 | M1 – M9 |
| Low | 9 | L1 – L9 |

## What was run

| Run | Result |
|---|---|
| `nice -n 15 node --test tools/test/geumbang_lab/geumbang.test.mjs tools/test/geumbang_lab/purity.test.mjs` | 30 tests: 29 pass, 1 skipped (G-P5 parity), 2.96 s |
| lab smoke (a scratch copy of `run_lab.mjs` writing to the scratch folder, not to `docs/previews`) | 0 errors, host 0.093 ms, 63 objects, 4 draw calls (§Lab) |
| `apply_patches.mjs . <scratch>/patched` on today's v4.2 code, twice (start and end of the review) | 31 / 31 anchors matched, every patched file passes `node --check`; `p11_gp5.mjs`: the patched `Save.js` `keepGeumbang` equals `sanitizeGeumbang` on 300 random slices |
| `p1`–`p10` (Node, the module's own `fake_env` / real `Depot.js`) | findings C1, H1, H2, H5, M1, M2, M4, M5; `p10` (save with the sled out) passes |
| `p7_ingame.mjs` (the real game, unpatched, module added at runtime like `ingame_dry.mjs`, one Chromium, `nice -n 15`) | C1, H1, H2, H6 reproduced in the game, 0 page errors |
| the builder's captures + the in-game / patched JPGs looked at | H6, M6, L7, readability notes |

---

## Critical

### C1 — 금방 does not drain the surplus: in the real v4.2 depot the walk-in buyers already empty the racks

**Designer intent broken:** "재고를 빨리 소진하기 위해 온라인 마켓도 만들까?" The plan's premise (D1: "v4.2's depot
throughput is the limit") is contradicted by v4.2's own measurements.

**Evidence.**
- v4.2 CODE-2 census `flow_dep.json` (scratch `v42code2_census/`, the run behind `docs/build_reports/v42_code2.md`
  §3.1): the depot rack total over 700 s rises to 137 while the buyers are closed, then sits at **0–2 items from t 490 to
  670 s** once they open (2, 0, 0, 0, 0, 1, 0; 47 at t 700). `BALANCE.v42.depot.sell` lets the buyers take up to 76 goods + 40 raw a minute 07–20 h, more than the sleigh
  (≤ 60 a trip) brings. `d60.census.json`: the buyers sell up to 280 items / game day.
- v4.2 CODE-2 §3.1: the overflowing **village piles** (fish 60 %, ore 66 %, meat 79 % of the time ≥ 90 %) are limited by
  the porter routes (~30 / min) upstream of the dock and the depot; "a drained pile is full again in 2–3 minutes".
  금방 sells nothing from those piles, and does not sell ore at all.
- `p2_buyers.mjs`: the module's own fake env, but the source is the **real `src/systems/depot/Depot.js`** with its
  walk-in `sell()` running 07–20 h and a sleigh-like inflow (60-item batches, raw-heavy mix), 3 game days from 20:00:

  | inflow / min | setup | buyers sold / day | 금방 units / day | 금방 orders / day | **removed from racks / day** | coins / day (all) | mean rack fill |
  |---|---|---|---|---|---|---|---|
  | 28 | buyers only | 260 | — | — | **260** | 650 | 7.8 % |
  | 28 | + 금방 Lv1 | 228 | 32 | 9 | **260** | 700 | 6.5 % |
  | 28 | + 금방 all upgrades | 228 | 32 | 9 | **260** | 700 | 6.5 % |
  | 48 | buyers only | 429 | — | — | **429** | 1,116 | 19.6 % |
  | 48 | + 금방 Lv1 | 367 | 57 | 21 | **444 (+3.5 %)** | 1,180 | 15.2 % |
  | 48 | + 금방 all upgrades | 369 | 71 | 21 | **442** | 1,247 | 15.3 % |

  금방 takes exactly what the buyers would have taken (buyers' sales drop by the same amount), at 0.8 × price instead of
  0.6 × and 2 × the raw price. Drain gain: 0 % (28 / min) to 3.5 % (48 / min, only by refusing fewer sleigh crates).
  Upgrades change nothing (stock-limited). Orders per day are 9–21, not the builder's 28–53 (fake env) nor the plan's
  40–80. The 상품 tab will show 품절 for most items by day.
- Income: + 50 to + 130 coins / game day against v4.2's ≈ 24,600 / game day — harmless, but it means the 0.8 price
  rate is not the lever the plan thinks it is.
- **The real game agrees** (`p7_ingame.json` phase A: the v4.1 46-min save, depot built through the v4.2 hook, *no
  hand-injected stock*, 금방 opened at 10:12, one game day sampled every 30 s): racks **0 items from 10:12 to 19:24**,
  24–51 items overnight while the buyers are closed (20–07 h), back to **0 at 08:36** once the buyers open (54 sales by
  09:48). 금방 got **8 orders in the whole day**, all placed overnight from that small night stock, and had delivered
  **1** by 11:00 the next morning.

  For comparison the builder's dry runs put 314 items on the racks by hand before opening (`ingame_dry.mjs:56`,
  `patched_dry.mjs:54`), which is why they looked busy.

**Fix (design decision first, then code).**
1. Source 금방 where the surplus actually is: the station dock surplus (`Freight.takeSurplus`) as a normal source — the
   G1b backhaul made default and free — and/or a **금방 집하** pick-up at the full village piles (the plan lists 금방
   집하 in G1b; the sled already drives the village). That turns "재고가 빨리 줄어요" into something the player sees.
2. Or make 금방 *be* the depot's retail channel once it opens: the walk-in `sell()` hands its quota to 금방 orders
   (same items, delivered, visible) instead of competing for them.
3. Rerun the census with buyers on (the plan's §8.2 `gb_drain.mjs`, never run) before tuning anything. Add a
   `fake_env` option that runs `Depot.sell()` so the Node tests stop measuring an empty-buyer world.

---

## High

### H1 — Nobody is ever home: `homeNow()` reads `c.place`, which TownSim never sets

**Where:** `src/geumbang/ports_v4.js` `refreshHomes()` line 462:
`if (c && c.state === 'in' && c.place && c.place.indexOf(e.aid + ':') === 0)`.
TownSim creates every citizen with `place: null` (`src/systems/TownSim.js:144`) and never assigns it — the place
lives in `c.placeObj` (`takeSpot`, line 546: `c.placeObj = pl`, `pl.id` = `'t_apt2:in'`). So every town address gets an
empty set, and `homeNow(aid, hid)` returns `false` for all of them; only the hard-coded `'t_apt2:jeong'` is home.

**Consequences in the real game:** no doorbell answer, no `open` / `hand` / `joy` beats, no resident doll, no hearts,
no thank-you line (§7.1 lines incl. the kids' joke) for any customer except 정 할머니; every house / shop / lot parcel
becomes a doorstep box, apartments always go `inside`; `passer()` is also built on `homeNow` → boxes are only taken in
at 07:00 or after a whole game day, the 16-box cap fills and parcels become `neighbour` (no box, no line).

**Repro / evidence.** `p8_nobody_home.mjs` (same seed, 2 game days): fake schedule → `hand 18, inside 7, doorstep 14`,
17 hand beats; `home() = false` (what the adapter returns) → `hand 0, inside 13, doorstep 24, neighbour 2`, 0 hand beats.
**In the real game** (`p7_ingame.json` phase B): 117 citizens, 88 of them `state 'in'` at their own home
(`c.placeObj.id === c.home + ':in'`), **0 with a `place` field**, **0 of 21 home sets non-empty**; `homeNow()` false for
every sampled household; deliveries over the next 240 s of play (≈ 10 game hours): `first:hand 1` (정 할머니), `inside 1`, `doorstep 6`, no other
hand-over.

**Fix (module only, one line):** `const id = c.placeObj && c.placeObj.id; if (c.state === 'in' && id && id.indexOf(e.aid + ':') === 0)`.
Add an adapter test that builds the real `TownSim` (or a recorded citizen snapshot) so a renamed field fails a test.

### H2 — 정 할머니's first order (첫 주문 따라가기) is silently skipped when the racks cannot fill it

**Where:** `GbModel.tick` clears `firstAt` *before* calling `firstOrder()`; `firstOrder()` returns `null` when no
catalogue item has more than `keepFloor` (4) on the racks, and nothing retries. Ordinary orders then start.
`seen.first` stays 0, so after a **reload** 정 할머니 suddenly orders (`constructor: firstAt = T + 1`) with a camera
follow out of context.

**Repro.** `p1_first_empty.mjs`: open with empty racks → after 30 s `first orders 0, seen.first false, firstAt
undefined`; 20 more minutes with inflow → 61 ordinary orders, **0 first orders, 0 firstDone** (so the "첫 배달 완료! …
금방 앱" tip never shows either). Same with 9 items on the racks. In the real game the opening is paid by day, when C1
shows the racks at 0–2 items. **Reproduced in the real game** (`p7_ingame.json` phase A, depot not hand-stocked):
racks `total 0` at the opening (10:12), 20 s later `st 2, seenFirst false, firstAt null, follow null`, and over the
following game day `firstEver 0` — no 정 할머니, no camera follow, no "첫 배달 완료" tip; the first thing the player
sees after paying 4,000 coins is the banner and then nothing.

**Fix.** Keep `firstAt` until the order is placed (retry each second), and do not make the signature scene depend on
surplus: reserve 장작 4 · 빵 2 when the letter arrives (pick them then, or let 소복이 bring them as the "opening
stock"), or fall back to the dock surplus. Also take the pad's 판자 20 · 주괴 10 only if present (L1).

### H3 — The customer list is frozen when 금방 opens (the AddressBook is never rebuilt in the game)

**Where:** `host.touch()` (the only rebuild trigger besides `RoadNet.onChange`) has no caller anywhere: not in
`ports_v4.js`, not in the Integration section. Plan §5.1 requires rebuilds on `built`, `houseDone` and new homes.
`townEntries()` only lists buildings / lots / village houses that have citizens *at that moment*.

**Evidence:** static (grep: no caller of `touch` / `api.touch`; no `'built'` listener in `src/geumbang`).
**Consequences:** district homes founded after the opening (`TownSim.addDistrictHome`, `growTo` newcomers), new
village houses (`Site` emits `'built'`) never order and never get parcels until the next reload; households that
change composition keep their old hids. A reload silently "fixes" it, so the player sees 금방 change after a reload.

**Fix (module only).** In `GeumbangSystem.update`, every 2 s compare a cheap signature —
`T.citizens.length + ':' + nb.extra.length + ':' + (gs.houses || []).length` — and call `this.host.touch()` when it
changes; also `gs.events.on('built', () => this.host && this.host.touch())`. Add a test: add a district home after the
opening, the AddressBook grows within 2 s.

### H4 — A partially paid 금방 개업 pad loses its coins on reload

**Where:** `ports_v4.js updatePad()`: `UnlockPad` drains coins progressively (`UnlockPad.update`: `eco.spend(amt);
this.paid += amt`). The paid amount is kept only in memory (`this.padPaid`, and only when the pad vanishes); neither
the slice nor anything else saves it. v4.2 saves every partial payment (`progress.paid`, `Office.hirePaid`,
`LineUpgrades.offerPaid`).

**Repro (from the code; not run in the browser).** Stand on the pad with 2,000 coins (it takes all 2,000), walk off, save (autosave), reload → the pad shows 0
of 4,000. 2,000 coins gone — against the cosy rule "nothing spends coins without the player".

**Fix.** Save `pp: Math.floor(pad.paid)` in the slice while `st === 0` (sanitize to 0…open.coins), restore it as
`padPaid`.

### H5 — Three paid upgrades do nothing (or stop working after 12 parcels)

| Upgrade | Cost | What happens | Evidence |
|---|---|---|---|
| 개썰매 2 (`sled2`) | 1,500 | `lv.sled = 2`, but the model only ever makes one `Sled` (`GbModel.setWorld`: `!this.sled`) | `p5_upgrades_noop.mjs`: 1 sled after buying |
| 광장 보관함 (`lockP`) | 1,800 + 주괴 6 | nothing in the model reads `lv.lockP` (only the view draws `gb_locker_b`) | `p5`: deliveries identical to `van2` alone |
| 아파트 보관함 (`lockA`) | 1,500 + 주괴 6 | `lockerA` gets a row per parcel and is **never emptied** (no pickup, not saved): after 12–15 parcels `lockerFor()` returns null for the rest of the session; after a reload it works again for 12 | `p5`: day 1 `locker 15`, days 2–3 `locker 0`; `lockerA` length 15 > cap 12 |

All three are offered by "measured need" with a toast and an app card. **Fix:** hide G1b offers that are not
implemented (the plan allows G1b to slip), implement locker pickup (residents passing / 07:00, "딸깍! 금방 왔네." —
the string exists, unused) and save `lockerA`; make `sled2` add a second `Sled`.

### H6 — Every 따라가기 leaves its caption on screen for good ("띵동! · 화면을 누르면 끝나요")

**Where:** `src/geumbang/view/Follow.js` `update()`, lines 106–113 (the banner-wait block added at 21:46, after the lab
captures of 21:17 were taken):
```js
if (this.doneT >= 0) { this.doneT += dt; if (this.doneT > HOLD) this.stop(); }   // stop(): active = false, c.setVisible(false)
if (this.t > 240) this.stop();
if (this.c) {
  …
  const U = view.P.ui, under = !!(U && U.bannerOn && U.bannerOn());
  if (this.c.visible === under) this.c.setVisible(!under);                         // ← runs in the same frame: visible again
}
```
After `stop()` hid the caption, the same call falls through to the banner check (`visible false === under false`) and
shows it again; from the next frame `update()` returns early (`!this.active`), so nothing ever hides it. The tap
handler is gone too, so tapping does not help. Any later 따라가기 from the app ends the same way.

**Evidence.** The builder's own in-game captures `docs/previews/geumbang_lab_ingame_hub.jpg` and `…_ingame_bay.jpg`
(21:55, taken ≥ 60 s of play after 정 할머니's delivery) show the ribbon in the middle of the screen over the depot.
`p7_ingame.json` phase B, 10 s after the delivery: `{ active: false, doneT: 3.22, captionVisible: true, cap: 6 }`.
The lab's `geumbang_lab_first_done.png` (21:18) predates the edit, which is why the lab did not catch it.

**Fix:** `return` right after each `stop()` in `update()` (or guard the block with `this.active`); re-run the lab
`first` group and assert the caption is hidden after `HOLD`.

---

## Medium

### M1 — A road change mid-tour orphans the parcels on the vans
`host.roads()` (on `RoadNet.onChange`) → `GbModel.setRoads()` → **a new `Dispatcher`**: the old vans and their `load`
are dropped; their orders stay `gone` with `van = 1` forever — never delivered, never restocked — and keep a `maxOpen`
slot and their household blocked (`pickHousehold` skips households with an open order). `p3_roads_orphan.mjs`: the
first order `g1` is still `gone` two game days later. Latent in v4.3 (`RoadNet.upgrade` runs at the 읍 repave, before
the depot), certain once v5 upgrades streets (plan G2). **Fix:** on `setRoads`, carry the vans' `load` back
(`gone → ready`, `van = null`) or keep the old vans and re-snap them; add the probe as a test.

### M2 — Backhaul crates on a van are lost on save / reload
`Van.backload` (≤ 16 crates per van, taken from the station dock by `takeSurplus`) is not serialized. `p4_backhaul_save.mjs`:
a van carries `{ log 8, fish_raw 8 }`, the slice has no trace of them; up to 48 items with 3 vans. **Fix:** fold
`backload` into the slice's `back` field (restocked at load) or return it to the dock surplus in `serialize()`.

### M3 — "금방" is slow: the defaults deliver in 7.5 minutes, and upgrades rarely trigger
Builder's own §5.3 (fake env, the favourable case): median order → door **449 s** with 1 van (plan ≤ 75 s), 128 s with
3 vans (≤ 45 s); the promise is 150 s, so most parcels are "late". With C1's real stock, upgrades are never needed
(nothing queues). The van waits up to `waitS` 50 s to fill 8 slots, and `maxOpen` 24 counts the parcels already on a
van, so the book saturates. **Fix (designer levers):** a van leaves with ≥ 1 parcel when it is idle in the bay
(`waitS` 15–20 only to batch while another van is out), `maxOpen` counts pick / pack / ready only, then retune with the
census of C1.

### M4 — Vans do not see the cargo sleigh outside the spur
The sleigh's route (`WORLD.v42.sleighRoute`) runs on 역앞 거리's centreline (j −5) and on 중앙로's −j lane (i 31) — the
same lane the vans use going home and park on — and the sleigh drives *back* along that lane against the traffic.
`sleighBusy()` only covers s ≥ 38.5 (the spur stretch); `walkers()` lists the chief and TownSim bodies, not the
sleigh. `p6_sleigh_overlap.mjs` (real lane graph, sleigh simulated as `CargoSleigh.js`, G-P2b applied, worst case
always busy, 3 vans): 88 frames / game day with a van < 2.2 m from the sleigh centre (63 on 중앙로, 25 on 역앞 거리),
e.g. the sleigh going `back` through van 1 parked at a curb at 1.17 m. **Fix:** pass the sleigh(s) to the vans as
an obstacle (`walkers` port + `d.sleighs` positions) and keep curbs off the sleigh's lane, or let the sleigh hold
behind a parked van (a second G-P2b check).

### M5 — Village orders are accepted even when the sled stand cannot be placed, then wait forever
`OrderBook.pickHousehold` only checks `zone !== 'none'`; village houses are zone `sled` whenever a village road node is
≤ 6 m away, independent of the stand. If the stand's curb is not found, `Dispatcher.plan` `continue`s past every sled
order. `p9_stand_missing.mjs`: 4 village orders `ready` for 900–1,125 s, never restocked. Today's map resolves the
stand, so this is robustness (a map / road change breaks it silently). **Fix:** `zoneOk` = `zone === 'van' ||
(zone === 'sled' && book.get('stand'))`; restock sled orders when the stand disappears.

### M6 — The plan's office / news / 관망 integration is not delivered (and the designer's joke lives there)
Plan §12.4 G-P11 / G-P12 / G-P13: 재고 tab row `금방 마켓 · 오늘 주문 · 배달 · 선반 −`, 통장 bar **금방**, 서리 소식
lines and the ad **"금방 마켓 · 금방 뭐가 왔지? 금방이 왔지!"**, the 관망 activity 금방 구경, the second settings row
`금방 문 앞 장면`. The Integration section drops them ("No OfficePanel.js change", "agenda optional", "gbScenes gets no
row"); the strings exist (`gb_row_office`, `gb_inc`, `gb_news_day`, `gb_news_racks`, `gb_news_ad`, `gb_watch`,
`gb_set_scenes`) and are unused. Income is folded into 물류, so the player cannot see what 금방 earns. **Fix:** add the
OfficePanel row / ledger source / news templates as patches, or tell the designer they moved to v4.4.

### M7 — The Korean jokes land half
- The designer's own joke **"금방 뭐가 왔지?" → "금방이 왔지!"**: `gb_kid_q` ("엄마, 금방 뭐가 왔어?") is one of four
  random thank-you lines for *any* household (`VanDriver.THANKS`), shown alone; the answer `gb_kid_a` is never shown.
  A question without its punchline, often from a household with no child.
- Main slogan **"금방 왔지?"** (`gb_slogan`) and `gb_qa` never appear anywhere (banner, app splash, ad).
- 조금방 (`gb_late_kid` / `gb_late_driver`) never used although `onTime` is computed and most parcels are late (M3).
- `gb_neighbour`, `gb_locker_open`, `gb_sled_line` unused; `gb_thanks_chief` ("촌장님 덕분에…") is random, not "chief
  nearby".
- (All door lines are moot until H1 is fixed.)

**Fix:** kid households only, two bubbles (child asks, parent answers "금방이 왔지~!"); `gb_late_kid` on late
hand-overs at kid households, `gb_late_driver` from the courier; the slogan on the app header / opening banner.

### M8 — The sleigh hold point of G-P2b is a hard-coded copy of the adapter's rule
`CargoSleigh` gets `GB_HOLD = 38.4` as a constant while `ports_v4.sleighBusy()` computes the busy window from
`WORLD.v42.sleighRoute` (j −18 → s 39, busy from 38.5). The v4.2 route is still being fixed; if it moves so that the
computed start falls below 38.4, a held sleigh counts as busy, a van holding the token waits at the `apron` gate for the
sleigh while the sleigh waits for the token — until the 180 s watchdog teleports the van into the bay. **Fix:** expose
the hold point from the module (`depot.gbHoldS = () => sleighJoin() - 0.6`) and have G-P2b read it.

### M9 — View CPU and object budgets missed; one ADD blend
Builder-reported (and 0.093 ms in this review's lab smoke): host + view 0.14–0.33 ms / frame vs plan 0.06 near (vans
0.115–0.179 with several in view, doll compositor up to 0.097), objects 133–157 vs +120, AddressBook 3.97 ms vs 2 ms. `GbView.flash()` and the van roof glow use
`BlendModes.ADD` (plan §11: NORMAL only, batch breaks). Not a player-visible problem on its own at 2 % of a frame, but
the plan's budget is binding. **Fix:** skip `VanDriver.sync` work for vans outside the view except a position update,
pool the flash with a NORMAL-blend white sprite, cache the doll layer lists per (anim, dir, frame).

---

## Low

| ID | Finding | Fix |
|---|---|---|
| L1 | The 개업 pad takes 판자 20 / 주괴 10 from the racks without checking (`s.take` returns less → free); the pad does not show the item cost (plan §3.1 says pad = coins + items). | Use `UnlockPad`'s `items` (it supports them) or check before completing. |
| L2 | Locker upgrades cost 주괴 6 **from the depot racks** only (`coins.spend`); ingots rarely sit there in v4.2 (they go to 교역소), so an offered locker can be unbuyable. | Take ingots from the 교역소 / warehouse too, or coins only. |
| L3 | Determinism holds only for the same `dt` and no reload: order streams restart at the day's start and `nextT` is not saved, so a reload replays a different day. | Save `nextT` and the day-stream position, or document. |
| L4 | `serialize()` stops at `maxOpen` rows *silently* (no fold into `back`); reachable when `firstOrder` is placed into a full book after a reload → those items vanish. | Fold extra rows into `back` like `fitGeumbang`. |
| L5 | `gb_up_done: '{name}을(를) 들였어요!'` — literal particle (unused today); `josa()` exists. | `{name}` + josa. |
| L6 | G-P13 replaces the 놀이 tab's `set_playHint` text instead of adding a row; `gbScenes` has no UI. | Add a 7th row or a sub-toggle. |
| L7 | Without G-P13 the 금방 chip sits on the 길 안내 badge (`ingame_bay.jpg`, `ingame_hub.jpg`: "주문 8" over "64m"). G-P13 is marked optional but this is visible on the first screen. | Make G-P13 required, or move the chip in the module. |
| L8 | `walkers()` has the chief + TownSim bodies only; plan §5.5 also lists agents (porters), visitors, pets — vans drive through porters on 중앙로. | Add `gs.agents` / visitors / `gs.pets` within r. |
| L9 | The host's `RoadNet.onChange` listener is never removed on `destroy()` (RoadNet has no `off`). | Guard with a `destroyed` flag. |

Also seen, not counted: a van blocked by a walker while going *home* / on the spur / reversing never skips (skip only on
`out` / `leg`); after 60 s the watchdog teleports it into bay 1, in view if the walker is the chief standing on the
spur. Acceptable as a last resort; a 20 s "reverse a little and retry" would read better.

---

## Integration section against today's v4.2 code

Re-read at the end of this review (§Final re-check). `apply_patches.mjs` applied all 31 anchors to a fresh copy, every
patched file passes `node --check`; the v4.2 owners have not moved any anchor yet. G-P5's generated local copy keeps
exactly what the module's sanitizer keeps (`p11_gp5.mjs`, 300 random slices, 0 mismatches).

| Patch | Verdict |
|---|---|
| G-P1 system + Game fallback | Works (`buildV42` passes `(gs, v, v.saved, sv)`; V42 catches `update` errors). The module's update cost now counts in `v42.ms`. |
| G-P2b sleigh hold | Works today; fragile constant → M8. Not enough for M4 (outside the spur). |
| G-P3 depot workers / racks | Works. |
| G-P4 none | Correct only after H1's one-line fix in the adapter; otherwise the adapter's TownSim read is wrong. |
| G-P5 keep rule | Works (generated from `save.js` lines; parity test switches on). Must ship with G-P1, as stated. |
| G-P6 fragments | Works; +17 files → ≈ 429 of the 480 gate (artifact today 412 + page). |
| G-P7 crew anims | Works; strongly recommended — without it couriers are plain villagers (`ingame_first_joy.jpg`: nobody can tell the 금방 기사님 from a resident at zoom 1.5). |
| G-P8 / G-P9 paint | Work. |
| G-P10 balance | Works (merged by type). |
| G-P11 letter | Works; the office / 통장 / news parts of the plan are missing → M6. |
| G-P12 관망 | Works; 금방 구경 activity missing (M6). |
| G-P13 HUD / settings | Works; one row only (L6); should be required (L7). |
| missing | No patch is needed for H1 / H3 (module-side fixes), but H3's trigger must exist somewhere; none of the patches carries it. |

## Budgets

| Budget | Status |
|---|---|
| Files | +17 (geumbang 5, geumbangfolk 5, ui6 3, audio8 2, `veh_dog_sled` 2) → ≈ 429 / 480 ✓ |
| Bytes | ≈ 1.7 MB of new pages + sound ✓ |
| Textures | game 418.2–418.5 MiB < 455 ✓; module pages 10.9 MiB unpatched, 16.0 with G-P7 ✓ |
| Save | slice 539–589 B in game, fuzzed ≤ 1,400 ✓ (but H4, M2, L4 lose things) |
| Model CPU | 0.003 ms / tick Node, 0.023–0.041 in game ✓ |
| View CPU / objects / AddressBook | ✗ (M9) |
| §8.2 gates (raw piles, depot fill, shop empty-rates, income, latency, deliveries / day) | not measured by the builder; C1 + M3 show they would fail on drain and latency |

## Brand

No real company or service word in code, strings, tests or lab (grep of the forbidden list from plan §7.4: only false
positives such as "groups"). Gold + cream, the 금방이 mark, letters only on the camera-facing roof sign / nameplate /
UI. Nothing to fix.

## In-game probe (`p7_ingame.mjs`)

The real game (`index.html`, the v4.1 46-minute save, one Chromium at DPR 2, `nice -n 15`), the module added at
runtime exactly like `ingame_dry.mjs` (unpatched v4.2), the letter forced, the pad paid by standing on it. Results in
`p7_ingame.json`; 0 page errors in both phases.

| Phase | What | Result |
|---|---|---|
| A — depot as v4.2 leaves it (no injected stock) | racks at the opening (10:12) | **0 items** |
| A | 20 s after the ceremony | `st 2`, `seenFirst false`, `firstAt null`, no follow, 0 orders → **H2** |
| A | one game day, sampled every 30 s `[hour, racks, buyers' sales, 금방 orders, delivered, sleigh]` | racks 0 through 19:24, 31 at 20:36, 24–51 overnight; 0 again at 08:36 (buyers sold 54 by 09:48); 금방 **8 orders, 1 delivered** in the day; first order never → **C1** |
| B — 314 items injected (the builder's setup) | 정 할머니 delivered | yes (`first:hand`) |
| B | 10 s after that delivery | Follow `active false`, `doneT 3.22`, **caption still visible** → **H6** |
| B | TownSim | 117 citizens, 88 at home by `placeObj`, 0 with `place`, 0 / 21 home sets non-empty → **H1** |
| B | 240 s of play after the first delivery (≈ 10 game hours) | `first:hand 1`, `inside 1`, `doorstep 6`; 5 ring beats, no other door ever opened → **H1** |

## Lab

A scratch copy of `tools/test/geumbang_lab/run_lab.mjs` (only `ROOT` / `OUT` / import paths changed, output to the
scratch `lab_out/`, so the builder's `docs/previews` files stay as they are), `--only=smoke --no-gif`: 0 errors, 0
placeholders, host + view 0.093 ms (p95 0.2), model 0.0087 ms, 63 module objects, 4 draw calls, module pages 16.03 MiB.
The capture matches the builder's `geumbang_lab_smoke.png` (nameplate, banner, van at bay 1 with a readable roof sign,
chip `주문 1`). The lab cannot show C1, H1, H2 or H6: its ports have their own home schedule, its depot is a full
stand-in and its captures predate the Follow edit.

Captures looked at (builder's): the first-order set, hub, van, door, apartment, sled, night, app tabs, chip/toast,
English, desktop, the 9 unpatched and 3 patched in-game JPGs. Readability notes not counted above: at zoom ≈ 1 the van,
the roof sign and the gold courier read well; the roof sign is depth-sorted with the van and disappears behind a
building in front (`geumbang_lab_van_street.png`); doorstep boxes and their snow caps are ≈ 10 CSS px at zoom 1 and
will not read at 0.6 (`geumbang_lab_door_snowy.png`) — a small "택배" badge or a brief bounce when the box lands would
carry the story at phone zoom.

## Other probes (all in the scratch folder)

| Probe | Shows |
|---|---|
| `p1_first_empty.mjs` | H2 (model) |
| `p2_buyers.mjs` | C1 (real `Depot.js` buyers) |
| `p3_roads_orphan.mjs` | M1 |
| `p4_backhaul_save.mjs` | M2 |
| `p5_upgrades_noop.mjs` | H5 |
| `p6_sleigh_overlap.mjs` | M4 |
| `p8_nobody_home.mjs` | H1 (model consequence) |
| `p9_stand_missing.mjs` | M5 |
| `p10_save_sled.mjs` | **passes**: save while the dog sled carries 2 parcels and 4 are on vans → racks + orders conserved (368 + 30 before and after), slice 675 B |
| `patched/` | the Integration patches applied to today's v4.2 code (31 / 31 anchors) |

## Final re-check of the Integration anchors

22:45 UTC, after every probe: `apply_patches.mjs` again on a fresh copy of today's `src/` — **31 / 31 anchors matched,
0 `node --check` failures**; `git status` shows no v4.2 file under `src/`, `index.html` or `tools/build/` changed
against the snapshot commit during this review. The Integration section therefore still applies as written; the
v4.2 owners should re-run `apply_patches.mjs` once their fix lands, since every anchor is an exact-text match.

## Fix order (suggested)

1. H6, H1 (one line each), H4 (save `padPaid`), H2 (retry + reserved first-order stock) — module only.
2. H3 (rebuild signature in `GeumbangSystem.update`), H5 (hide `sled2` / `lockP`, finish `lockA` pickup), M2, M1, M5.
3. C1 with the designer: choose the stock source (dock surplus / 금방 집하 / take over the buyers' quota), then run
   the plan's census `gb_drain.mjs` with the buyers on, then M3's latency levers.
4. M4 / M8 with the v4.2 owners (sleigh as an obstacle, a shared hold point); M6 / M7 copy and office / news patches.
