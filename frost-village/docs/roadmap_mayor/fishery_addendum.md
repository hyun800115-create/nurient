# Fishery chain: engineering addendum (for plan review, 2026-11-07)

Companion to `기획서_수산업.md` (same folder): same version names, numbers and question numbers (수산 1–14). Proposed final homes: `docs/기획서_수산업.md` and `docs/roadmap_mayor/fishery_addendum.md`. The roadmap edits are in `roadmap_patch.md` (same folder).

- **Status:** final draft for the plan review. Nothing under the repo was changed. No bots, browsers or texture runs were made: every price, catch count, MiB and day count is an estimate.
- **Base:** HEAD `96bbe89`. The only change since `b14f0a4` is `tools/apk/build_aab.py`, so anchors hold at both.
- **Inputs:** `scout_now.md`, `scout_plan.md`, the draft pair (`*_draft.md`) and the two critiques of it (fun/scope and feasibility); `../econ_welfare/engineering_addendum_draft.md` and `기획서_돈과복지_draft.md`; the roadmap pair; `src/harbor/**`, `src/story/engine`, `src/vehicles`, `src/city/logistics`, `src/missions/data/catalog.js`, `docs/build_reports/harbor_runtime.md`.
- **Effort** is builder-days for one builder, art in parallel: planned sum × 1.08–1.26, ±40 % from v5.1 on (roadmap convention).

## 0. Summary

| Slot | Slice | What | Planned d | Shown | Roadmap change |
|---|---|---|---|---|---|
| v4.3 a3 | (in flight, task #31) | `item_fish_cooked` repainted as a whole grilled fish (`fish_model(cooked=True)`) | — | outside 19–22 | add to the a3 list |
| v4.6 | **S1 바다 친구들** | After 읍: deck catch flights and boathouse unloads show 고등어 / 명태 / 눈꽃무늬 물고기 looks (items stay `item_fish_raw`); 도감 page | 1.5 | +1–2 | 33–38 → **34–40** |
| v5.1 | **S2 jobs** | `captain` / `sailor` rows; village story places for the boathouse and deck; explicit-jobs rule in `fillOpenings` | 0.75 | inside 20–28 | none |
| v5.2 | ~~S3 village reefer~~ | dropped (both critiques) | — | — | none |
| v6 | **F fishery core** | species lots, coastal (V1/V2) + trawler tiers, harbour-local reefer, lot auction with the half cap and crew share, one-star daily show, 횟집 + cannery as village buyers, crews and jobs, 「오늘의 바다」 card, wish unlocks | 16.5 | +18–21 | 25–35 → **43–56** |
| v6.1 | **G 바다 식구들** (new sub-version) | squid boat (lamps), slip-yard builds, 바다 장터, 4-dish menu, 항구 쉬는 날, 대게 주간, ride-along, sea missions | 8.0 | 9–10 | **new row** |
| v7 | **H shellfish** | clam digging → `scallop` / `clam` lots; `seafood_bbq` as a buyer | 2.0 | +2–3 | 20–28 → **22–31** |
| v8 | ~~I cold chain~~ | dropped (cold storage, 금방 「오늘의 생선」: not requested) | — | — | none |

- **Fishery total: 31–36 builder-days** (28.75 planned × 1.08–1.26). Version ranges are recomputed from planned sums where the roadmap has one (v4.6: 31.75 → 34–40), so span deltas round to +30…+36. Launch (v4.3–v4.5) unchanged.
- **Save:** no `SAVE_VERSION` change; no `ITEMS` append. `harbor` slice ≈ +170 B (worst ≈ 1.39 of 2 KB); `x.book.sea` ≈ 10 B; nothing in `vehicles`.
- **Texture:** village views ≈ +0.1 MiB (icons). Station district 0 (the reefer is harbour-local). Harbour view 100.3 (after P24) → ≈ 114–117 of the 120 MiB district cap, with `boat_rowboat` dropped from the harbour. P24 is a prerequisite.
- **Calendar:** step A ran ≈ 11 builder-days in 2–3 calendar days, so the fishery build is ≈ 1.5–2.5 calendar weeks; review stops and tester windows set the real calendar. A separate v6.1 tester build adds 1–2 weeks.

**Totals** (version names, because the econ plan renumbers 탈것/안심):

| Span | Roadmap now | + econ_welfare | + fishery | both |
|---|---|---|---|---|
| launch (v4.3–v4.5) | 95–111 | 103–120 | 95–111 | 103–120 |
| 읍장 stage (v4.4–v4.6) | 109–127 | 117–137 | 110–129 | 119–139 |
| to 시장 취임 (incl. prototype) | 172–202 | 187–220 | 173–204 | 189–222 |
| to 안심 마을 | 224–272 | 270–326 | 225–274 | 272–328 |
| v6–v8 (incl. v6.1) | 75–103 | 75–103 | 104–137 | 104–137 |
| whole roadmap | 299–375 | 345–429 | 329–411 | 376–465 |

## 1. What changed from the draft (critique disposition)

**Accepted as proposed**

| Critique | Change |
|---|---|
| Fun 1, Feas 15 | Show = one star lot, 3–4 digit calls, 「낙찰!」, 2-s summary; reveal (scale, kg, weekly record, captain credit, named buyers, visible result on the 횟집 board); [다시 보기] on the news line; chip only while the camera is in the harbour, never a cross-district hop; one 「첫 경매」 at step 2, daily show from step 6 |
| Fun 3, Feas 1 | Crew share from the lot's **base** value whoever buys it; only filled seats; only while the story module runs; ingot-free cannery recipe; the 「낙찰!」 float is the village's amount with a small 선원 몫 line; payback targets stated net of the share (§4) |
| Fun 4 | 7 species + 1 rare; 큰 참치 is a badge on the tuna, not a species; 3 harbour boat kinds; one mixed stall (v6.1) |
| Fun 5 | Distinct outlines; group crates below ≈ 32 px; single species only ≥ 40 px; grayscale contact sheet at 24 px; 고등어 reuses the existing `item_fish_raw` picture; same style as task #31 |
| Fun 6 | S1 shows fish only (no 꽃게/오징어 turning into 구운 생선); first cut if v4.6 runs late |
| Fun 7, Feas 8 | S3 village reefer dropped (−3); truck built once in v6; B8 keeps the chief's truck (village yard → harbour auction) with a `send` variant |
| Fun 9 | Moored hulls always drawn (still frame); caps apply only to hulls under way; [따라가기] forces the followed person into the 24-person budget; one berth → hall truck trip with the reveal at the hall back door; small bells silent, floats only on screen |
| Fun 10 | Contradictions fixed: 7 bells (6 small + 1 big); the day example is v6-only with v6.1 beats labelled; ride-along is v6.1; 「대게 주간」 (not 철); one pay model |
| Fun 11, 12 | 품평회 look, "no tail cutting, no knives"; no 「새우잡이 배」; crews home every evening, families wave at 15:50; no text pointing at the tank crab; 눈꽃무늬 물고기 instead of 개복치; 「바다 장터」; group names 「게·새우」 / 「오징어·문어」 in game; plainer words |
| Fun 13 | Before/candidate pictures in the Korean doc; 6 real questions, the rest 「추천대로」 |
| Feas 3 | No logistics shipment (it is inbound and arrives in v8); ingot-free recipe; cans go to export rows only |
| Feas 4 | One place per hull of kind `boat` with explicit jobs; harbour fishers retired when crews exist; explicit-jobs rule (S2) so non-matching slots fill |
| Feas 5 | Truck road: west yard → new connector → boulevard (j −8…−4) → hall back door; crews carry through the open hall; hall → 횟집 delivery point; harbour-local truck role (new code, not `vehicles` Fleet loops); F4 2.75 |
| Feas 6 | No fishing pier: coastal boats use the decoration berths V1 (61.0, −13.45) and V2 (66.8, −13.3); 2 small boats in v6 |
| Feas 7 | FE1 answered no (V1/V2 pages are outside the 122.3 MiB figure); reefer 5–6.5 MiB; `boat_rowboat` dropped from the harbour; P24 prerequisite; the village saving is 3.95 MiB guaranteed (11.7 only away from the east shore) |
| Feas 9 | `replan()` goes through the per-tick planner; gates for the worst tick, draw calls, pages in view, additive switches |
| Feas 10 | Row estimates raised (F3, F4, F7, strings); replaced-work credit −1.0, not −2.0 |
| Feas 12, 14, 16, 17 | Re-skin the flying sprite to `item_fish_raw` on landing; seeded rarity; overlays with per-frame anchors (no tint); one owner for the truck (harbour slice); explicit save arrays; squid back 04:30; ★2 `item_fish_big` row maps to tuna; file count budgeted |

**Taken in a different form (and why)**

| Critique | Proposed | Done instead | Why |
|---|---|---|---|
| Fun 2 | Turn 경매 방침 into 「횟집 먼저 / 공장 먼저」 | Setting removed from v6; one weekly 「항구 쉬는 날」 in v6.1 | Internal buyers are capped (§3.4), so any priority setting is still near-cosmetic; one real trade-off (catch vs. happiness) is better than two weak ones |
| Fun 2 | Unlocks via resident wishes | Done, but the same builds stay on the map | Principle 5: a wish is a friendly door, never a gate |
| Feas 1 | Shops pay 1.0 × price | 횟집 and cannery are **village** buyers: they take lots at 0 coins, capped at half the day's crewed value; the 횟집's value comes through the existing tourist `boost` hook and the food need | A village shop paying the village is circular; the half cap makes the day's coins always cover the share; a bot gate checks the 횟집 never lowers harbour coins |
| Feas 2, 11 | Cannery wages as F18 fund upkeep | Harbour village businesses (경매장, 횟집, cannery) pay staff the ordinary story wage, as the econ plan's 동네 장터 판매원; only crews take a share | F18 upkeep covers public/welfare facilities; putting fish businesses there would make the fund show 「아껴 쓰는 중」 because of fish. If the econ review decides otherwise, the seats move to the F18 table unchanged |
| Fun 8 | v6 core ≈ +8–10 | Scope trimmed as proposed (no slip yard, squid, setting, stalls, 4-dish menu, export rows, v8), plus the 「오늘의 바다」 card and wishes; estimate **+18–21** | The feasibility pass showed the per-row estimates were low (F3, F4, F7, strings, credit). A +8–10 core would have to drop the truck or the crews, which are the 대표's picture. 수산 5 (B) is offered for a v6 that barely moves |

**Not taken**

| Critique | Why not |
|---|---|
| Fun 9 "berth placed farther away" | Berth W is fixed by the basin layout and the road route already makes the run ≈ 15–20 cells; the show frame (hall doors, lectern, 횟집 front) is the one-screen check (FE2) |
| Feas 2 "answer §12 from their plan: rent goes to the fund" | No harbour rent exists (village-run businesses). If a resident-run harbour shop is ever added, its rent follows their F18 |

## 2. Decisions assumed (★ in the Korean doc)

| # | Decision | Effect on the build |
|---|---|---|
| 수산 1 | Species live in a harbour `SPECIES` table, not in `ITEMS` | No change to the 21 files that know `item_fish_big`. The pad still accepts `item_fish_raw` (→ `mix`) and `item_fish_big` (→ `tuna`). (B) would add ≈ 21 touch points per species and grow the append-only `ITEMS` (`src/data/items.js:18-19`) |
| 수산 2 | Auction runs by itself; one ≤ 10-s show a day from step 6; 함께하기 rings the bell | The show is a pure function of the allocation; coins never depend on the view or input |
| 수산 3 | No policy setting; wishes + 「오늘의 바다」 card; 항구 쉬는 날 in v6.1 | No `pol` bit; three wish rows in the missions catalogue |
| 수산 4 | Crew share 25 % of base value of crewed lots; other harbour jobs on story wages | `place.payout` hook in `econ.nightly`; MoneyBook expense category `share` |
| 수산 5 | Core in v6, more in v6.1 | §7 slices |
| 수산 6 | S1 in v4.6, fish only, first to cut | §7 S1 |
| 수산 7–14 | grilled icon; truck legs; cannery in the harbour warehouse; 횟집 = seafood restaurant (2 plates in v6); separate hulls; pot boat folded, squid in v6.1; shellfish v7, rare not sold; names | as written below |

**수산 5 (B), for reference:** v6 gets F1, F2, a show-only F6 and part of F9 (≈ 3.75 planned → +4–5, v6 29–40); F3–F5, F7, F8 and the rest move into v6.1 with G (≈ 20.75 planned → 22–26). The roadmap total is the same within rounding; the 「냉동차 → 경매장」 scene arrives one version later.

## 3. Data model

All new model code is pure under `src/harbor/model/` (the purity test already guards Phaser imports: `tools/test/harbor_lab/purity.test.mjs`). Numbers move to `BALANCE.v6.harbor.fishery` at integration, like the rest of `tuning.js` (`harborTuning`, `tuning.js:50-60`).

### 3.1 Species (`model/species.js`, shared with S1)

Append-only: lots, the 도감 bitmask and the save store the index.

```js
// i  id          grp     base  1× icon                        from   notes
// 0  mix         fish     3    item_fish_raw                  v6     the chief's 생선 on the pad (was 4 × 1.5 = 6; M9: raw must not beat 구운 생선 4)
// 1  mackerel    fish     4    item_fish_raw (same picture)   v4.6   look only before v6
// 2  pollock     fish     5    sp_pollock (new outline)       v4.6   look only before v6
// 3  snowflake   rare     0    sp_snowflake (new)             v4.6   sell: false → 도감 + aquarium (E10, v7)
// 4  tuna        fish    45    item_fish_big                  v6     = village 참치; a `big` lot is ×3 with a ribbon badge
// 5  snowcrab    crust   18    sp_snowcrab                    v6
// 6  shrimp      crust    2    sp_shrimp                      v6
// 7  squid       ceph     5    sp_squid                       v6
// 8  octopus     ceph    14    sp_octopus                     v6
// v7 appends 9 scallop, 10 clam (grp 'shell')
export const SPECIES = [ /* { id, grp, base, icon, ko, en, sell } */ ];
export const GROUPS = ['fish', 'crust', 'ceph', 'shell', 'rare'];   // UI: 생선 / 게·새우 / 오징어·문어 / 조개 / 희귀
```

- Price on a day: `price(sp, d, big) = round(base × (big ? 3 : 1) × pop(sp, d) × (sp === special(d) ? 1.3 : 1))`. `pop` is seeded 0.9–1.15 per (species, day) from `rng.js`; `special(d)` (오늘의 생선) is picked among the species landed that day. `auction.premium` and `auction.base` (`tuning.js:12-17`) retire.
- Icons: group crates (fish / crab / squid) for anything under ≈ 32 px (pad chip, HUD, card counts); single species only at ≥ 40 px (도감, show card, menu board, 「오늘의 바다」 best sale).

### 3.2 Boat tiers (`model/boats.js`, replaces the trawler-only `Fleet`, `model/fleet.js:5-22`)

```js
export const BOATS = [   // array index = save index of fleet.t (append-only)
  { id: 'coastal', ver: 6, berths: ['V1', 'V2'], art: 'boat_fishing', gift: 1, via: 'sea',            // #1 free at step 2; #2 sails in after purchase
    buy: { coins: 2500, item_plank: 20 }, max: 2, crew: [1, 1], out: 5, back: 11,
    catch: { mackerel: [40, 60], pollock: [15, 25], shrimp: [30, 50], snowcrab: [4, 8], squid: [6, 12], octopus: [2, 4] } },
  { id: 'trawler', ver: 6, berths: ['W'], art: 'ship_trawler_big', via: 'shed', build: 60,            // today's route and timetable (schedule.js:45-53)
    buy: { coins: 15000, item_plank: 60, item_ingot: 30 }, max: 3, crew: [1, 2],
    catch: { tuna: [60, 70] }, big: [1, 2], rare: 0.08, reefer: true },
  { id: 'squid', ver: 61, berths: ['V3'], art: 'boat_fishing', over: 'ov_lamps', via: 'slip', build: 40,  // v6.1; V3 needs a layout check (FE2)
    buy: { coins: 3500, item_plank: 30, item_ingot: 10 }, max: 1, crew: [1, 2], out: 19, back: 4.5,
    catch: { squid: [100, 140] }, night: true },
];
```

- Catch counts are seeded per (day, hull): `R.between(lo, hi)`; the rare roll stays today's (`harbor:rare`).
- `gift: 1`: V1 wakes as coastal #1 when `auction` is built. Coastal #2 is bought at the hall's 창구 (wish 「배 한 척 더」) and arrives by sea on the coastal route; it takes V2. `boat_rowboat` is no longer drawn in the harbour.
- One shed order at a time (today's `canOrder`, `fleet.js:14`). `ver: 61` rows are inert in v6.

### 3.3 Timetable, berths, drawing (`model/schedule.js`, view)

- Coastal hulls get a `smallBoat` route kind: V1/V2 → basin → mouth (`mouthI` 80) → off-screen at sea (analytic) and back. They book the rectangles they sweep like every hull today, so the 53-reload collision drive covers them.
- Trawlers keep their route, the haul at (72, −30) and berth W. Squid (v6.1) leaves 19:00 and returns **04:30** (04:00 is the harbour day boundary).
- **Replan:** `replan()` (`HarborModel.js:78-86`) plans the whole day in one call on every build, star and launch (desktop worst tick 1.06 ms, a full day ≈ 2.2 ms). It becomes a `planDayGen` job stepped per tick like `stepJob()` (`:72-76`), with `finishJob()` only on save/load.
- **Drawing:** big ships ≤ 6 (`budget.ships`); small hulls under way ≤ 2 (low preset 1); **moored hulls are always drawn** as an idle still frame (1 sprite each), so a bought boat never vanishes. People ≤ 24 (`budget.people`), with one slot reserved for the followed person.

### 3.4 Auction (`model/auction.js`, rewritten around lots)

State: `pad: Int32Array(SPECIES.length)`, `crew: Int32Array(SPECIES.length)` (crewed part of the pad), `big`, `day`, `coins`, `share`, `best: [sp, price, buyer, kg]`, `wk: [weekStartDay, maxKg]`, `used` (internal value taken today), plus conserved counters for tests.

- `hours()` and `bells(T0, T1)` stay (`auction.js:28-36`): small bells every 50 s from 08 to 18 (6), big bell at `bigAt` 16:45. **7 bells a day.**
- `drop(item, n)` (chief's pad, `HarborModel.js:118`): `item_fish_raw` → `pad[mix]`, `item_fish_big` → `pad[tuna]` (not crewed).
- `landLot(sp, n, hull)` replaces `landBox` (`HarborModel.js:208`); crewed lots also add to `crew[sp]`.
- **Sell at a bell** (pure, deterministic, conserved), lots in descending value:
  1. `sell: false` (snowflake) → 도감 + aquarium queue; 0 coins.
  2. **Half cap:** `budget = floor(0.5 × crewedValueToday) − used`. Internal buyers never exceed it.
  3. **횟집** (if open): per group `min(n, wantLeft[grp])` within the budget; the day's first big tuna goes to the 횟집 when open (its board line). 0 coins.
  4. **Cannery** (if open): tuna up to `min(capLeft, ceil(canDemandLeft / 3))` within the budget. 0 coins.
  5. **Export:** open contract rows reserve `min(n, need)`; the ★2 row `{ item_fish_big: 20 }` (`tuning.js:39-41`) is read as tuna. Paid on the ship's departure at `exportMult` 2.0 (existing path).
  6. **Wholesale:** the rest at price; never anything unsold.
- **Crew share:** for every crewed lot allocated (any buyer) `round(0.25 × base(sp, big) × n)`, scaled per hull by filled seats / seats, and 0 when the story module is off. It accrues per bell and **settles once a day** (story nightly), from the day's auction + export coins. Because wholesale + export ≥ 50 % of crewed value ≥ the 25 % share, the day's net is never negative.
- `next(T)`, `waiting()` keep their meaning (pad chip, `view/Pads.js:21-53`).
- **Show ladder** `showLadder(day)` (view-only data, no coin path): star = the day's first big tuna lot (none → no show); 3–4 calls from `round(0.8 × price)` to the price; bidders = 쿡 if the 횟집 is open, 공장장 if the cannery is open, the wholesaler always; winner = the allocation's buyer; `kg` seeded 150–220; `record = kg > wk.maxKg`. Same seed and day → the same ladder, so [다시 보기] recomputes it.

### 3.5 Buyers (`model/buyers.js`)

```js
export const BUYERS = {
  sashimi:   { step: 'terminal', wish: 'w_cook_sashimi', open: { coins: 2000 }, at: 'h2_seafood_restaurant', owner: 'village',
               want: { fish: 20, crust: 8, ceph: 6, big: 1 }, boost: 1.25, boostBig: 1.4, plates: ['모둠회', '생선구이'] },   // 4 dishes in v6.1
  cannery:   { step: 'shipyard', at: 'h_harbor_warehouse', owner: 'village', cap: 40, recipe: { in: { tuna: 1 }, out: { item_can: 3 } }, time: 2.6 },
  export:    { step: 'crane', map: { item_fish_big: 'tuna' } },
  wholesale: { step: 'auction' },
  // v6.1: stall (kind fishmonger, one mixed stall at h2_harbor_market)
};
```

- **횟집:** wants reset at the harbour dawn (05:00); stock drains by meals per game hour. Stocked → tourists who shop at `'restaurant'` spend × `boost` through the existing `ctx.boost[t.shop]` hook (`model/tourists.js:140`), × `boostBig` on a big-tuna day (combined with the spice import, capped × 1.6). The menu board shows 「오늘의 참치회 있어요!」 or 「오늘은 다 팔렸어요」. Harbour residents' food errands target the `sashimi` place. Plates are drawn on the terrace; no cutting.
- **Cannery:** a canning line inside the existing `h_harbor_warehouse` (`layout.js:79`, step 5 building) with a 「참치캔」 sign and steam puffs; no new building, no new footprint. No ingots. `canDemandLeft` = open export rows wanting `item_can`; output goes straight into those rows' `got`. The village cannery (`Workshop.js:22-30`) is untouched.
- **Ownership:** both are village businesses: no rent, takings as today (tourist coins already go to the village, `tourists.js:120-142`).

### 3.6 Reefer (harbour-local)

- Gift with trawler #1. One truck (`reefer: 0 | 1` in the harbour slice; nothing in `vehicles`).
- **Leg 1 (≈ 15:50):** trawler at W → crews load at the west yard (`fishQuay` 54.75, −13.4 → yard 54.75, −8.4, `layout.js:134, 213`) → new connector north → boulevard (road j −8…−4) → hall back door. Doors open, code steam puff, the big tuna on a cart; crews carry the boxes through the open hall to `catchPile` (`People.js:182-208` walk, shortened).
- **Leg 2 (≈ 17:00):** hall back → 횟집 delivery point (seafood restaurant art) → cannery door → export pile by the crane.
- Driven as a harbour role on the harbour's own analytic clock, not by the `vehicles` `Fleet` loops (`vehicles/model/fleet.js:67-92`), which only know yard → pad → shop loops. Needs the harbour vehicle places of the base-v6 H6 fix.
- Coastal boxes go by hand cart (the hall is in front of V1/V2).
- **Mission B8** (`catalog.js:113-114`): stays the chief's truck, village yard → harbour auction pad, unlocked after trawler #1; gains a `send` variant (a driver goes; same coins; badges for driving).

### 3.7 Jobs and places (`src/story/engine/data/places.js`)

```js
// JOBS (after `dock`, :95)
captain:    { ko: '선장', en: 'captain', place: 'boat', h: [4, 17], wage: 44, share: 1, tag: 'j_nature', title: '선장', kid: '선장님' },
sailor:     { ko: '선원', en: 'sailor', place: 'boat', h: [4, 17], wage: 32, share: 1, tag: 'j_nature', kid: '뱃사람' },
auctioneer: { ko: '경매사', en: 'auctioneer', place: 'auction', h: [7, 18], wage: 40, tag: 'j_shop', kid: '경매' },
reefer:     { ko: '냉동차 기사', en: 'reefer driver', place: 'auction', h: [7, 18], wage: 36, tag: 'j_logi', title: '기사', kid: '냉동차' },
canner:     { ko: '공장 직원', en: 'cannery worker', place: 'cannery', h: [8, 17], wage: 34, tag: 'j_builder', kid: '공장' },
sashimi:    { ko: '횟집 요리사', en: 'sashimi cook', place: 'sashimi', h: [10, 21], wage: 36, tag: 'j_food', kid: '횟집' },
// PLACE_KINDS (after `harbor`, :15): boat (work, [4, 20]), auction (work, [6, 19], 'fish_auction'),
//   cannery (work, [7, 18], 'harbor_warehouse'), sashimi (work, [10, 22], 'seafood_restaurant')
// one `boat` place per hull with explicit jobs: coastal [['captain', 1], ['sailor', 1]], trawler [['captain', 1], ['sailor', 2]]
// STAFF.auction [['auctioneer', 1], ['reefer', 1]], STAFF.cannery [['canner', 2]], STAFF.sashimi [['sashimi', 2]]
// STAFF.harbor (:116): fisher 6 → 0 once any crewed hull exists; dock 4 stays
```

- **Why these kinds:** `fillOpenings` skips any slot whose job `place` differs from the place kind (`src/story/engine/src/jobs.js:58`), even when the place lists its own `jobs` (`slotsOf`, `:14`). With the draft's `auction [dock 2]` and `boat_*` keys the seats would never fill. S2 adds the rule "an explicit `p.jobs` list bypasses the kind check" (one line + test) for the village places; the harbour rows above match kinds anyway.
- **Count:** v6 full harbour 23 jobs (crews 4 + 9, auction 2, cannery 2, 횟집 2, dock 4); v6.1 27 (squid 3, stall 1). Homes: lodge 12 + office 4 (`layout.js:86-87`); settler cap stays 20 (`tuning.js` `ferry.settlersMax`); the rest are commuters by coast train (FE5).
- **Pay:** `econ.nightly` (`econ.js:163-175`) reads `job.wage`; add `if (job.share && place.payout) w = place.payout[r.id] || 0`. The host posts `payout` per hull from the day's share, split captain 1.5 : sailor 1. Village boathouse/deck places (S2) post no payout, so they fall back to `job.wage`.
- Personas: `npc_captain` (선장 바다, `src/chat/personas.js:204-205`) is pinned as trawler 1's captain; the 「생선 거래처」 tie with 쿡 (`:258`) seeds the story beat. 쿡 is the 횟집's paddle at the show (buyer face), not a 횟집 employee.
- **Follow:** following a crew member ends at the basin mouth with the card 「바다로 나갔어요. 15:50에 돌아와요」 (the route leaves the map at sea edge i 98, y ≈ 5,400 vs world height 4,864). v6.1's ride-along goes basin → haul (72, −30) → fade back.
- **15:50 families:** up to 3 people walk to the quay (inside the 24 budget; skipped on the low preset).

### 3.8 Events and ledger hand-off

| Event | Payload | Consumer |
|---|---|---|
| `harbor:auction` (extended) | `{ coins, byBuyer: { sashimi, cannery, export, wholesale }, catch: { fish, crust, ceph }, best: { sp, price, buyer, kg }, big }` | news, weekly report, missions F9 |
| `harbor:catch` | `{ hull, kind, lots: { sp: n } }` | 도감, missions D7, weekly 「잡은 것」 |
| `harbor:show` | the ladder | view only |
| `harbor:share` | `{ n, byHull }` (nightly) | MoneyBook expense `share` |
| `harbor:jobs` | `{ open, filled }` | weekly 「새 일자리」, 「오늘의 바다」 |
| coins | `P.coins.add(n, …, 'harbor:auction' \| 'harbor:export' \| 'harbor:tourist')` (`host.js:127-129` already tags `'harbor:' + from`) | money flow |

### 3.9 「오늘의 바다」 card and wishes

- Card (opened from the hall tap or the harbour pad chip): hulls out / home, today's catch as 3 group crates with counts, best sale, countdown to the big bell, harbour residents · jobs filled/open · share of harbour residents whose food need is met. Fits 360×640 and 412×915.
- Wishes (v4.5 request system, `missions` module): `w_boat2` (선장 바다, after step 2), `w_cook_sashimi` (쿡, after step 4), `w_trawler` (선장 바다, after step 6). [들어주기] opens the F4 buy card. The same builds are always on the map ([여기서 짓기]); a wish never gates.

## 4. Balance targets (bots set the final numbers)

| Target | Value | Example tuning that meets it |
|---|---|---|
| Coastal #2 payback, net of share | ≤ 60 bot min | catch ≈ 575/day gross, ≈ 430 net; cost 2,500 → ≈ 58 min |
| Trawler payback, net of share | ≤ 60 bot min | tuna 45 (was 30), trawler 15,000 + 60 planks + 30 ingots (was 30,000 + 80 + 40): ≈ 3,130 gross, ≈ 2,350 net → ≈ 64 min raw; ≈ 45 min while the cannery fills export rows (+≈ 1,080/day) |
| Raw vs cooked | pad `mix` ≤ 구운 생선 4 | `mix` base 3 (M9 inversion) |
| Harbour net positive | within 60 bot min of the shipyard (M9) | measured on the bot run |
| Harbour share of income | ≤ 35 % at bot 200 | the cap that stops over-tuning the two rows above |
| 횟집 | stocked never lowers harbour coins vs unstocked | boost 1.25 / 1.4 vs the ≈ 20-fish want |
| Day net | auction + export coins ≥ share every day | guaranteed by the half cap; asserted in tests |
| send vs together | payday difference ≤ 3 % | roadmap rule |

Today (scout M9): the harbour earns ≈ 860 coins/min against ≈ 149,000 spent by minute 240; a trawler ≈ 199/min (≈ 150 min payback).

## 5. Save plan

| Slice | Where | Shape | Bytes | Notes |
|---|---|---|---|---|
| S1 (v4.6) | `x.book.sea` | int bitmask over `SPECIES` seen | ≈ 10 | inside `x.book` (1 KB cap) |
| F (v6) | `harbor` (`save.js:11`, v1, cap 2,048) | `auction: { d, c, s, p: [n…9], k: [n…9], g, b: [sp, price, buyer, kg], w: [d0, kg], u }` (replaces `raw/big/boxes`, `:55`); `fleet: { t: [coastal, trawler], o: [kind, s] \| 0, r: kind \| -1 }` (replaces `trawlers/building/ready`; explicit arrays, never object key order); `buyers: { sash: [fish, crust, ceph, big], can: [tunaIn, cansOut], d }`; `reefer: 0 \| 1` | ≈ +170 net | trailing zeros trimmed |
| G (v6.1) | `harbor` | `fleet.t[2]` squid, `rest: [weekday]` | ≈ +15 | |
| jobs | story side key | people + jobs | 0 in the main save | `story/save.js:7-9` |

- **No live save holds a `harbor` slice** (the module is unwired), so it stays `v: 1` and is redefined before v6 ships. `sanitizeHarbor` still maps the lab shapes (`raw` → `p[mix]`, `big` → `p[tuna]`, `boxes × 10` → `p[tuna]`, `trawlers` → `fleet.t[1]`).
- No `sp_*` export keys, so the `ITEM` regex (`save.js:15`) is unchanged.
- Worst case: today's 1,215 B + ≈ 170 ≈ **1.39 KB** of 2,048.
- Ships at sea, the truck in motion, people and lots in transit are not saved; the day replans from the clock as today.

## 6. Code anchors

| Area | Anchor | Use |
|---|---|---|
| Harbour model | `src/harbor/model/HarborModel.js:34` (Auction), `:72-86` stepJob/replan, `:118` `dropFish`, `:120` `orderTrawler`, `:145-146` bells, `:158-162` fleet build/launch, `:205-212` trawler ops (`landBox`), `:232-235` `ringBell`, `:292`/`:302` serialize/HUD | `landLot`, `orderBoat(kind)`, replan via the generator, extended bell event |
| Auction | `model/auction.js:10` `FISH_ITEMS`, `:28-36` hours, `unit`/`boxValue`, `sell`, `bells`, `serialize` | keep hours/bells/next; rewrite pad/sell/serialize (§3.4) |
| Fleet / schedule | `model/fleet.js:5-22`, `:14` `canOrder`; `model/schedule.js:45-53` trawler + launch routes | tier table; `smallBoat` route |
| Tourists | `model/tourists.js:120-142` (`ctx.boost[t.shop]` at `:140`) | 횟집 boost |
| Tuning | `tuning.js:12-17` auction, `:34-36` trawler, `:39-41` exports, `:46` budget | fishery block |
| Layout | `layout.js:77` hall, `:79` warehouse (cannery), `:83` restaurant (횟집), `:86-87` homes, `:133-134` `catchPile`/`fishQuay`, `:172-173` V1/V2, `:179-181` lanes and haul, `:195-200` people, `:213` yard path | connector road, truck stops, show frame |
| View | `view/Statics.js:56-67` V1/V2 floaters; `view/People.js:146-176` auctioneer/buyers/bubble/float, `:182-208` crew carry; `view/Pads.js:21-53` chip; `view/HarborView.js:87, 109-116` people budget, glow pool | moored still frames, show, paddles, menu board, follow slot |
| Host / save / entry | `host.js:64` order def, `:127-129` coins tag; `save.js:11-15, :55`; `index.js:11-16` fragments | order pads per tier; `fishery` frames in a repacked `harbor_props` |
| Story | `src/story/engine/data/places.js:8-50` kinds, `:64-106` JOBS, `:108-117` STAFF; `src/jobs.js:13-16, :52-60`; `src/econ.js:163-175` | rows §3.7; explicit-jobs rule; payout hook |
| Missions | `src/missions/data/catalog.js:113-114` B8, `:146-147` C10, `:175-176` D7, `:211-212` E10; `docs/v5_v8_plan.md:1336` F9 | B8 `send`; F9 = watch or ring once; D7 counts tuna lots; E10 carries the snowflake fish; three wish rows |
| Village (S1, S2) | `src/entities/FishingDeck.js:76-88` rods/pads, `:374-380` `flyFish`; `Boathouse.js:33-37, :118`; `src/core/Residency.js:35` boat pages | looks on the flying sprite, re-skin on landing; village story places |
| Items (untouched) | `src/data/items.js:16-19`; `src/core/Save.js:217` cannery `ins` | listed so nobody appends species there |
| Blender | `tools/blender/prop_assets.py:214` `fish_model`, `:1926-1929` steak; `bld_assets.py:1821` `tuna_model`; `harbor_bld.py:54` octopus; `harbor_lib.py:201-228` `fish_crate`; `beach_boats.py:475` crab; `bld_boats.py`; `veh_lib.py` | icons, crates, scale, plates, reefer, lamps |

## 7. Slices

### S1 v4.6 「바다 친구들」 (1.5 planned → +1–2)
- After `f:rankEup` and once the 도감 exists: `flyFish` (`FishingDeck.js:374-380`) shows a species look picked by a seeded counter (고등어 70 %, 명태 28 %, 눈꽃무늬 물고기 2 %). The flying sprite is pushed into the crate stack, so it is **re-skinned to `item_fish_raw` when it lands**. The boathouse unload (`Boathouse.js:35`) shows the same looks on 2 of its fish. Stacks, piles and prices stay `item_fish_raw`.
- First catch of a species: a 도감 card 「바다 친구들 n/3」 (n/8 from v6) and a small fame step; never coins. Hired fishers' catches count.
- Work: `species.js` stub 0.25, look picker + re-skin 0.5, 도감 page with 2× cards 0.5, strings + tests 0.25.
- Gates: pre-읍 `onboarding.mjs`, G1 and 읍 ±5 % unchanged (looks only after 읍); econ bots byte-identical income with looks on/off; 도감 page at 360×640; contact sheet of the icons at 24 px in grayscale.
- **First item on v4.6's cut line** (−1.5 to −2).

### S2 v5.1 jobs (0.75 planned, inside the range)
- `captain` / `sailor` rows; village story places: boathouse (kind `boat`, explicit jobs captain 1 + sailor 1 while a boat is owned) and deck (kind `deck`, explicit `fisher` × hired seats). The explicit-jobs rule in `fillOpenings` (`jobs.js:58`) + a test that an explicit list fills. 선장 바다 is the boathouse captain (he moves to trawler 1 in v6). The a3 resident window (task #26) shows them with no new UI.

### F v6 fishery core (16.5 planned → +18–21)

| # | Work | Planned d |
|---|---|---|
| F1 | `species.js` (from S1) + lots + catch tables + conservation | 1.0 |
| F2 | auction rewrite: half-cap allocation, prices + 오늘의 생선, share from base (filled seats, story on, nightly settle), show ladder with kg/record, save + sanitize | 1.75 |
| F3 | tier fleet: coastal on V1/V2 (`smallBoat` route, collision drive), trawler at W, moored still frames, coastal #2 purchase + sail-in, shed order, replan through `planDayGen` | 2.75 |
| F4 | reefer: harbour vehicle places (H6), connector road, harbour-local truck role, leg 1 with the steam/cart reveal, leg 2 stops, B8 `send` | 2.75 |
| F5 | buyers: 횟집 (re-dress, stock, menu board text, 2 plates, boost, food errands); cannery line in the warehouse (sign, recipe, demand-limited intake, steam) | 1.75 |
| F6 | show view: 첫 경매 ceremony, daily show, star lot on scale with ribbon, kg/record, captain credit, named paddles and reactions, digit calls, float + share line, 2-s summary, news line + [다시 보기], harbour-only chip, skip, 함께하기 bell | 2.0 |
| F7 | jobs: rows, `boat` places per hull, retire harbour fishers, payout hook, harbour preset merge + 5 parts, follow slot + mouth stop, 15:50 families | 2.0 |
| F8 | 「오늘의 바다」 card, harbour measures, 3 wish rows, ledger tags + weekly events | 1.0 |
| F9 | balance (§4), tests, lab scenes, perf soak + replan gate, ko/en strings, 도감 page to 8 | 2.5 |
| — | replaced: the trawler-only fleet hookup inside base v6's 25–35 | −1.0 |

- **Prerequisites (base v6):** P24 ship-page split, C2 (ship atlases requested), H1 (doll double tick), H6 (harbour vehicle places).
- **Mid previews:** ≈ day 20 (F1–F3 + F6: boats, lots, show); ≈ day 38 (F4, F5, F7: truck, buyers, crews).
- **Cut line → v6.1:** wish rows (builds stay on the map), weekly record, [다시 보기], 15:50 families (−1.5 to −2).

### G v6.1 「바다 식구들」 (8.0 planned → 9–10)
Squid boat: tier row, timetable 19:00 → 04:30, berth V3 (layout check), `ov_lamps` overlay per `boat_fishing` heading with per-frame anchors (no tint: the crew is baked into the hull), code glow ≤ 8 additive (off on the low preset), lighthouse tie-in 2.5; slip-yard builds on the shipyard slip (launch route reused) 0.75; 바다 장터 one mixed stall (kind `fishmonger`) 0.75; 4-dish 횟집 menu (+대게찜, 해물탕) 0.5; weekly 「항구 쉬는 날」 (hulls rest, crews join the 저녁 잔치, happiness bonus) 0.5; 「대게 주간」 (대게 special + 대게찜) 0.5; ride-along basin → haul → fade 0.75; 4–6 sea missions with `send` variants 0.75; tests/balance 1.0.

### H v7 (2.0 planned → +2–3)
Beach clam digging → `scallop` / `clam` lots (append 9, 10); `seafood_bbq` (v7 art) as a buyer.

## 8. Art and texture

Cost rule: `w × h × 4`, no mipmaps (`tools/test/texbudget.mjs:42-45`).

| Item | Source | Size / MiB | Page | Residency | Ver |
|---|---|---|---|---|---|
| Grilled-fish icon | `fish_model(cooked=True)` | same frame slot | `props_items` | always | a3 |
| 2 species icons (명태, 눈꽃무늬) 1× | `fish_model` with new outlines | ≈ 56×36 each, +0.02 | `props_items` | always | v4.6 |
| 3 도감 cards 2× | same | ≈ 0.05 | 도감 page | while the 도감 is open | v4.6 |
| 5 icons 1× (대게, 새우, 오징어, 문어; tuna reuses `item_fish_big`) + ribbon badge | crab/shrimp/squid minis, `harbor_bld.octopus` | +0.04 | `props_items` | always | v6 |
| Fishery frames: 3 group crates, tuna on ice + ribbon + scale, paddles, 2 plates, 「참치캔」 sign, menu board, 2× species for the show/card | Blender + flats | +0.35–0.65 | repacked `harbor_props` (no new file) | harbour | v6 |
| `boat_fishing` in the harbour (V1 + V2) | exists 2028×1004 | 7.77 | own | harbour `ship` class | v6 |
| `boat_rowboat` in the harbour | exists | −3.95 vs. today's drawing | — | dropped from the harbour | v6 |
| `veh_truck_reefer` | `veh_lib` box body, white/ice blue, snowflake decal, no lettering; idle, move, rear-door unload (steam in code) | 5–6.5 (ref. `lgx_delivery_van_*` 4.82 idle/move, `gb_van_0` 6.42 with doors) | own (2 files) | harbour only | v6 |
| Folk parts `hat_sailor`, `top_breton`, `det_lifevest`, `hat_captain`, `apron_rubber` | townfolk generator | 0.5–2 (measure) | townfolk part pages | with the harbour folk | v6 |
| `ov_lamps` per heading | Blender on the `bld_boats` hull | +0.2–0.35 | repacked `harbor_props` | harbour | v6.1 |
| Lamp glow, steam, price/menu text | code (`Lighthouse.js` pattern, Graphics/text) | 0 | — | — | v6–v6.1 |
| Cannery / 횟집 / hall | `harbor_warehouse`, `seafood_restaurant`, `fish_auction` | 0 | `harbor_buildings` | harbour | v6 |

**Harbour totals:** module 122.3 MiB = harbour pages 45.5 + ship pages 65.7 + water ≈ 11 (`harbor_runtime.md:365-373`); it does **not** include the V1/V2 boats that `Statics.js:56-67` draws. After P24 (−≈ 22): 100.3. Fishery v6: + `boat_fishing` 7.77 + reefer 5–6.5 + frames 0.35–0.65 + parts 0.5–2 = **≈ 113.9–117.2 of 120**, 2.8–6.1 left; v6.1 lamps +0.2–0.35. The draft's 8 MiB fallback (separate pot/squid atlas) does not fit: the fallback is code-drawn lamp strings only. Global gate: harbour view GL ≤ 455 incl. transients during the show (the show loads no new page).

**Village saving (recommended for v4.4 F3 area eviction, ≈ 0.25 d):** the village region pins `boat_rowboat` + `boat_fishing` (11.7 MiB, `Residency.js:35`), but the boathouse shows only the owned tier (`Boathouse.js:118`). Pin only the owned tier, and only near the east shore: **3.95 MiB guaranteed** at the gate save (the unowned tier), up to 11.7 MiB when the camera is away.

**Files:** +2 (reefer png + json); fishery frames go into a repacked `harbor_props`; folk parts on existing part pages (≤ +2 if not). Under the ≤ 495 gate (≈ 485 after v8, `v5_v8_plan.md:1448`).

## 9. Performance (low-end phones)

| Budget | Today (harbour lab) | With the fishery | Rule |
|---|---|---|---|
| Model per tick | mean 0.008–0.028 ms; worst 1.06 ms (replan) | mean ≤ 0.03 ms; **worst ≤ 0.5 ms desktop** | replan through `planDayGen`; auction work only at 7 bells: O(species × buyers) ≈ 9 × 4 |
| Draw calls (harbour view) | 5–11 | ≤ 14 | truck + repacked props add ≤ 2 pages in view |
| Big ships drawn | ≤ 6 | ≤ 6 | unchanged |
| Small hulls | — | moored always (still frame); under way ≤ 2 (low 1) | wakes off on the low preset |
| People drawn | ≤ 24 | ≤ 24, 1 reserved for the followed person | show uses auctioneer + ≤ 3 buyers + 2 helpers |
| Display objects (module) | 64–91 (budget 400) | ≤ 150 | crates ≤ 9, tuna row ≤ 3, plates ≤ 2 |
| Show | — | ≤ 12 tweened objects, ≤ 10 s, skippable, no new pages | |
| Lamp glow (v6.1) | — | ≤ 8 additive, low preset off; ≤ 2 blend switches per frame | |
| Story | ≤ 0.1 ms main thread | +4 job kinds, +≈ 23 jobs | jobs fill nightly in the worker |

## 10. Tests and gates

**harbor_lab (Node, pure):**
- species snapshot: indices never change (append-only); `sell: false` never pays.
- lot conservation per day: landed = wholesale + export reserved + 횟집 stock + cannery input + rare queue + pad; coins = Σ wholesale × price (+ export on departure).
- half cap: internal value ≤ 50 % of crewed value every day; **day net (auction + export − share) ≥ 0** on 60 seeded days.
- share: 0 with the story module off; scales with filled seats; cannery-bound tuna still pays the share.
- nothing unsold after the last bell; determinism (seed + day → catches, prices, special, allocation, ladder).
- cannery takes tuna only for open can rows; never more than `cap`.
- fleet: one shed order at a time; coastal max 2; `ver: 61` rows hidden in v6.
- schedule: the 53-reload collision drive with coastal ×2 + trawler ×3 (v6), + squid (v6.1): 0 overlaps.
- replan: worst single tick ≤ 0.5 ms desktop over a build/launch storm.
- save: worst-case slice ≤ 2,048 B with every species pending; sanitize fuzz never throws; lab shapes map; explicit arrays round-trip.
- purity: the model imports no Phaser.

**Phaser / suites (`harbor_phaser.mjs` extended):** show ≤ 10 s and identical when skipped, unseen or replayed; chip never appears outside the harbour view; moored hulls drawn on the low preset; the followed person is drawn with 24 others in view; tap targets (chip, card, order pads) at 360×640 and 412×915; menu board text fits.

**Economy (bots):** §4 targets; harbour net positive within 60 bot min of the shipyard; harbour ≤ 35 % of income at bot 200; stocked 횟집 never lowers harbour coins; send-only vs together-only payday ≤ 3 %.

**Texture:** harbour district pages ≤ 120 after P24; harbour view GL ≤ 300 soft; global ≤ 455 incl. transients during the show.

**Perf:** 10-min soak in the harbour view across a full day (7 bells, the show, the truck, 15:50 families; v6.1 adds the night squid boat) on the low preset: model ≤ 0.10 ms, display objects ≤ 400, draw calls ≤ 14, no long tasks.

**Tone review:** strings list checked for: 회 only on plates; no cutting, knife or blood words; no 「새우잡이 배」; no text about the tank crab; 「낙찰!」 calls friendly; 갑각류/두족류 not shown in game.

## 11. Effort

| Slice | Planned | × 1.08–1.26 | Shown |
|---|---|---|---|
| S1 v4.6 | 1.5 | 1.6–1.9 | +1–2 (v4.6 planned 30.25 → 31.75 → 34–40) |
| S2 v5.1 | 0.75 | 0.8–0.95 | inside v5.1 |
| F v6 | 16.5 | 17.8–20.8 | +18–21 |
| G v6.1 | 8.0 | 8.6–10.1 | 9–10 |
| H v7 | 2.0 | 2.2–2.5 | +2–3 |
| **Total** | **28.75** | | **31–36** |

Art in parallel (not in builder-days): 7 icons + 2× cards, reefer page, fishery frames, lamp overlays × 5 headings, 5 folk parts.

## 12. Coordination with econ_welfare

- That plan owns the money-flow window, the weekly report, rent/tax, welfare upkeep and the shop list; this plan defines none of them.
- **Answers to the draft's four questions, from their addendum:**
  - (a) rent: none here (harbour businesses are village-run). A future resident-run harbour shop would follow their F18 (rent → 마을 금고 after rank 3).
  - (b) the crew share is a MoneyBook expense category `share`, debited nightly (their invariant `Δcoins + ΔΣtills = Σcreated + Σtagged − Σspent` holds).
  - (c) the week is 7 game days (their AD3).
  - (d) the town fish shop is their 동네 장터 (`br_food`); the harbour stall (v6.1) is 「바다 장터」, harbour-only, so their R10/AD8 buyer rule is untouched.
- **Ledger lines handed over:** income 경매 (village share, `harbor:auction`), 통조림 수출 (`harbor:export`), 관광 (`harbor:tourist`, existing); expense 선원 몫 (`share`), one-off 배 / 횟집 열기 (`build`); weekly: catch by group, best sale, new jobs, rare of the week, cans exported.
- **Wages:** harbour village businesses use the ordinary story wage (like their 동네 장터 판매원), not F18 upkeep. If their review moves shop staff into F18, the four harbour seat rows join that table as they are.
- **Numbering:** their AD10 inserts v5.2 「돌봄 마을」 and moves 탈것 → v5.3, 안심 → v5.4. This plan touches neither, refers to versions by name, and `roadmap_patch.md` gives Part B strings for the rows both plans edit (v4.6 days, totals lines).

## 13. Open engineering questions

- **FE1 (answered: no).** The 122.3 MiB lab figure excludes the V1/V2 boat pages that `Statics.js:56-67` draws. Budgeted in §8.
- **FE2.** Layout: the connector road from the west yard (54.75, −8.4) to the boulevard; the truck stops at the hall back door, the 횟집 delivery point and the warehouse door; the show frame (hall doors, lectern, 횟집 front) on one 360×640 screen at the show zoom; a V3 berth for the v6.1 squid boat. Run the layout checker (`v5_v8_plan.md` §4.6).
- **FE3.** Story engine: the `place.payout` hook; the explicit-jobs rule; hours that wrap midnight for the v6.1 squid crew ([18, 5]).
- **FE4.** `ov_lamps` per-frame anchors on `boat_fishing`'s headings at phone zoom; if they do not read, the squid boat keeps code-drawn lamp strings only.
- **FE5.** 23–27 harbour jobs vs 16 homes and the settler cap 20: commuters by coast train (story commute) or more lodge homes.
- **FE6.** Reefer body: a new 5–6.5 MiB page, or sharing 금방's `gb_van_0` body if its colourway can be white without a second page.
- **FE7.** Replan generator: worst tick on a low-end phone during a build/launch storm (target ≤ 2 ms).
- **FE8.** Wages for harbour village businesses: story wage (this plan) vs F18 upkeep (the econ review decides).

## 14. Not verified

- No bots, browsers or texture runs. Prices, catches and paybacks are arithmetic on `tuning.js` numbers and the scout's M9 figures.
- Reefer and folk-part MiB are estimates from comparable pages; the harbour total assumes P24's −22 MiB.
- Layout room for the connector road, the truck stops and V3 is unchecked (FE2).
- The econ plan is a draft; its numbering, F18 scope and totals may change before both reach the 대표.
- Effort ranges are bottom-up at ±40 %.
