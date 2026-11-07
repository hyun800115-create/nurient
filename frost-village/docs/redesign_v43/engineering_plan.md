# v4.3 「마을 새 단장」 — engineering plan

Status: **plan only.** No game code, worktree, branch or git state was changed to write it. The designer-facing companion is
`기획서_마을새단장.md` (same folder; pictures in `img/`). Inputs:

- the judge verdict and recommended plan (`redesign/judge/`, story base + street/plaza grafts),
- the concept pictures (`redesign/mockups/`, copied to `img/`),
- **4.2.0.1** code at `hotfix_wt/frost-village` (HEAD `1add9f8`); line numbers below refer to this tree unless marked 4.2.1,
- **4.2.1** code (meat cans + L0 logistics) at `audio_wt/frost-village` (WIP snapshots `aea1178` meat cans, `c535db0` L0 probe),
- `docs/logistics_plan.md` (L0 / L1a / L1b), `docs/logistics_flow_map.md`, `docs/v44_plan.md`.

Times are bot minutes (smart bot, fresh game); real players take about 1.3–1.5×. Prices for new things are first guesses
to be tuned with bots. "D-n" refers to the designer choices in §2 (the Korean doc's §11 uses the same numbers).

---

## 0. Summary
- **v4.3 = 4.2.0.1 + 4.2.1 (meat cans, L0) + 「마을 새 단장」.** One release, `SAVE_VERSION` 7 → 8 (`Save.js:39`).
- Built in three steps on one branch, plus an optional early art fix:
  - **M1 (optional early ship, D14)**: stage-1 stall art without awning + signboard + lower counter + adult clerk. No save
    or balance change. Can go out as a small 4.2.2 on the 4.2.0.1 line, or be the first commit of v4.3.
  - **Step A — the first 20 minutes**: hut, fishing deck + rods (crate on land: **no walkable water**), shop stages 1–3 with
    queues by kind (only served counters take customers; small stage-3 spawn bonus, D15), trade post merged into the
    자재 창구, 옷·신발 공방, first houses at 5–6 min (side goal, D16), onboarding/tutorial/title retargeted. Exit also
    produces a **designer preview build** (web page on its own origin, new games only, so the designer's Play-app village
    is never touched).
  - **Step B — districts**: fixed workshop plots, office at ~16 min (side goal, 400 + 8), hall at village complete,
    눈꽃 큰길, shop stage 4 (no back storeroom / manager), ceremony at the hall, the complete v7→v8 migration **with a
    no-overwrite failure path**, meat-can re-tune. **The depot stays where it is** (D20; its move belongs to L1a).
  - **Step C — management**: 마을 장부 (= first tab of the office panel; doors: desk + an always-visible popBox), labour
    office + 알바, open/close + pause toggles **unlocked with the labour office** (D8).
  - **Cut line**: C can slip to v4.3.1 (it only adds the `v43.toggles` save keys). A and B ship together.
- Rough effort: **≈ 28–34 builder days + ≈ 11–12 art days in parallel** (§12).
- Hard gates (§7.3): time to first sale ≤ baseline +5 %; village complete ≤ baseline + 1.0 min and 읍 within ±5 %; L0
  throughput gates and the merchant ceiling ≥ baseline; clerk ≥ 75 % visible **with a customer at the front**; padvis (one
  paid pad per spot), onboarding, save fixtures incl. a forced migration failure, texture budget.
- §14 lists what the Nov 1 critique changed, with the evidence.

## 1. Baseline, versions, roadmap

### 1.1 M0 — baseline before any redesign code

The 4.2.0.1 + 4.2.1 merge must be green first (it is being done now). On the merged head, record and commit under
`docs/build_reports/v43_baseline/`:

| Measure | Tool | Why |
|---|---|---|
| time to first sale (fresh; onboarding bot and smart bot) | `tools/test/onboarding.mjs`, `econ/probe.mjs` | gate G1 |
| village complete, 읍, office, hall minutes | pacing bot (`pace/`), `fresh25` census | gate G2 |
| L0 throughput gates | `tools/test/lgx_l0.mjs` (4.2.1) | gate G4 |
| merchant ceiling: items/min sold at the trade post at 25 and 45 min | census `g60` | gate G4 (`trade.buyInterval` 0.28 s, `balance.js:211`) |
| shelf fill per kind (`customers.shelfMax` 40, `balance.js:172`) | census | stage 1 must not shrink it |
| padvis list (one paid pad per spot, 4.2.0.1 rule) | `tools/test/padvis.mjs` | regression baseline |
| texture budget per page | `tools/test/texbudget.mjs` | new art + earlier hall page |
| walks (measured, not straight-line) | new `tools/test/v43_layout.mjs` run on the old **and** the new layout with the same path finder | the judge's table compares measured old walks with estimated new ones (measured ≈ 1.15 × estimate, §4.6) |

### 1.2 Version naming (needs the roadmap owner)

`logistics_plan.md` §4.1 already uses v4.3 = 금방, v4.3.1 = 시험 도구, v4.3.2 = L1a/L1b. Proposed renumbering:

| Content | Was | Proposed |
|---|---|---|
| 마을 새 단장 + meat cans + L0 | — / v4.2.1 | **v4.3** |
| 금방 (GB-CODE-1/2) | v4.3 | v4.3.1 |
| 시험 도구 | v4.3.1 | v4.3.2 |
| L1a (board, 자재창고, 이직, hub) | v4.3.2 | v4.3.3 — smaller: the hub's 현황 tab, the doors, `Jobs` slots and the 알바 dispatcher already exist from step C; it also takes the depot move (D20) |
| L1b (D1, D3–D5) | v4.3.2 | v4.3.4 |
| v4.4 촌장 성장 | v4.4 | v4.4 (unchanged) |

Docs to edit when this lands: `logistics_plan.md` §2.3 guardrail 1 ("nothing new before village complete" — the ledger door
opens at the forest and the opening changes on purpose), §4.1 order, §8.4 doors (adds the desk door), §11.2 (Jobs.js
starts in v4.3).

---

## 2. Decisions (defaults = the judge's recommendation; D14 write stage; D15–D21 + new D8 default from the critique)
The Korean doc §11 uses the same numbers and splits them into "꼭 골라 주셨으면 하는 것" (D2, D3, D8, D15–D21) and
"추천대로 두셔도 되는 것" (the rest).

| # | Decision | Default | Code impact of the alternative |
|---|---|---|---|
| D1 | Trade post | merged into the 자재 창구; exports only at the station; old sled = decor | (B) adds a sled stop + merchant walk path on the forest road; (C) keeps `TradePost` |
| D2 | Hall timing | at village complete (`hire_hunter`) | (B) after first houses: pushes mine/hunt ~1 min; (C) `tower_east` as today |
| D3 | Chief's buildings | hut (0) → office same plot (~16, side goal) → hall next door (~20); staff after 읍 | (B) hut→hall in place, office ~45: different plot table |
| D4 | Shop stage 3 | first bread sold (~12 min) | (B) with `zone_hunt` (~19) |
| D5 | Shop shape | one straight counter row, lines side by side | (B) horseshoe: three queue directions, more art |
| D6 | Workshop plots | one fixed plot each | (B) two plots per type: `only` → `types` allowlist + chooser |
| D7 | Resource zones | unchanged | (B) move mine/forest: terrain, fences, Act 1/2 tutorial rework (v4.4 option) |
| D8 | Toggles start | **with the labour office** (`b:labour_office`, which needs `b:warehouse`, ≈ 26 min) | (B) village complete: needs the "idle beside the station" fallback and "closed counter → keep in station output" until a 창고 exists; (C) `zone_farm` with grill + fish counter locked |
| D9 | Ledger doors | hut/office desk + popBox made always visible from `zone_forest`; ledger = first tab of `OfficePanel` | (B) new HUD button (breaks `logistics_plan.md` §2.3.2) |
| D10 | Station cash | train carries station cash to the hall tax box once the hall stands | (B) chief keeps walking (coin round ≈ 170 m) |
| D11 | Clothing | bench → 옷·신발 공방; empty 털옷 plot reserved | (B) 털옷 공방 now: new chain, item, art |
| D12 | Chief's fishing | rods catch by themselves; chief reels once (0.6 s) | (B) chief catches each fish (~1.1 s each): first sale slower |
| D13 | Release | one v4.3 in three steps, C is the cut line; designer preview after A | (B) 4.3a / 4.3b: two migrations (v8, v9) |
| D14 | Early clerk fix | M1 as a small 4.2.2 to the test tracks | (B) ship with v4.3 |
| D15 | Customers per stage | `market43.spawnMul` = [1, 1, 1.1, 1.2] (bot-tuned) | (B) all 1: stages 3–4 are capacity/looks only (a dull 400-coin buy) |
| D16 | First houses + office upgrade | side goals (not in `GOALS`), office 400 + 8 planks | (B) main-path goals: ≈ +1,040 coins before village complete ≈ +1.5–2 bot min (breaks G2) |
| D17 | Where drained porters go | direct to the highest need if any, else the labour office yard | (B) always via the yard first (≈ +30–70 m walk per lend) |
| D18 | 알바 marker | yellow vest overlay + 3 s floating "알바" tag | (B) armband (≈ 3–4 css px at 412 px width: unreadable) |
| D19 | Old saves' workshops | move toolsmith/warehouse/cannery/store to the district plots (state kept) | (B) grandfather them on their generic plots + a free-move offer in the letter |
| D20 | Depot | stays at today's spot; its move goes to L1a (depot rework + 금방) | (B) move beside the export dock now (§4.5.3 "if moved") |
| D21 | Hall/office finished at the old price | kept, no refund (letter thanks the player) | (B) refund old − new (coins to wallet, materials to 창고 or coins) |

## 3. Milestones

### M1 — stage-1 stall + clerk fix (optional early ship)

- **Art**: `market_s1` in two layers (`_back`: posts, shelf, blank signboard; `_front`: counter at 0.6 m), staff point on a
  10–15 cm step, rack spots for 3 kinds × 40. Adult apron + cap look for `npc_clerk_a` (re-render the clerk set; keep frame
  names).
- **Code**: `Seller.js` `Market` draws back + front sprites around the clerk depth (the general store's front overlay in
  `Shop.js` is the pattern); `world.js` `market.staff` / sprite key; signboard text drawn by the game (`strings.js`
  `sign_market_1` = 눈꽃 노점). The awning is part of today's `market_counter` art, so nothing else references it.
- **Pads**: `hire_clerk_market` stays at (1525, 900) (4.2.0.1 spot); padvis must still pass.
- **Tests**: `clerk_view.mjs`, `padvis.mjs`, `smoke.mjs`, `ghostsweep.mjs` (art list `ghostsweep_art.json`), 412×915 and
  360×640 shots of the plaza day/night; measure visible clerk share (target ≥ 75 %, concept measured 79 %).
- **Effort**: 1.5–2 days (art 1, code 0.5, QA 0.5). No save change.

### Step A — the first 20 minutes (exit = gates G1, G5 subset, G6)
| Feature | Main files |
|---|---|
| Fishing deck replaces the net (§4.1) | new `entities/FishingDeck.js`; `ResourceNode.js` (`Net`, :218), `Game.js` (:721 `new Net`), `Worker.js` (fisherman: seated loop + fixed lane), `Labour.js` (fish pile → crate on land), `world.js` (`net` → `deck`), `balance.js`. **No change to `Paths.js` / `Navigator.js`** (nobody but the fishers' scripted lane is on the water) |
| Shop stages 1–3, queues by kind, 자재 창구 (§4.2) | `Seller.js` (`Market` :142, `TradePost` :610, `Customer` :440), `Register.js`, `Progression.js`, `StockLedger.js` :14/:16, `Tutorial.js` :23–28, `Surplus.js`, `V42.js`, `Neighbours.js`, `Occlusion.js`, `OfficePanel.js`, `Game.js` (serialize BIN `trade`) |
| Hut on the office plot (§4.3) | `world.js` (`v42_office` plot :790, `v42.office` :752), `Site.js` (replace-in-place), `OfficeBuilding.js`, `systems/office/Office.js`, `Save.js` `BUILDINGS` |
| 옷·신발 공방 + first houses (side) (§4.4) | `world.js` (`bench`, new house plots), `Progression.js` (side steps), `VillageLife.js` (tent move-ins), `balance.js` |
| Onboarding / tutorial / title (§4.9) | `Onboarding.js` (:48, 63, 64, 84, 267, 396, 436, 715, 721), `OnboardOverlay.js`, `Tutorial.js`, `strings.js`, `src/title/layout.js`, `src/title/bake/title_bake.json`, `tools/title/title_pack.py` |
| v7 → v8 migration skeleton (all remaps, data-driven) (§6) | `Save.js`, `Transfer.js` |
| Designer preview build | the existing artifact/web build, published on its own origin (separate storage), new game only; never offered a v7 save |

### Step B — districts (exit = G2, G4, G5, G6; first internal-track build)
| Feature | Main files |
|---|---|
| Fixed plots + layout + roads + decor cuts (§4.5) | `world.js` (plots, roads, decor, `v42.removeDecor/moveDecor/treeGaps`), `RoadNet.js`, `RoadPaint.js`, `Roads.js`, `Territory.js`, new `tools/test/v43_layout.mjs` |
| Office at ~16 (side), hall at village complete (§4.3) | `Progression.js` (`GOALS`, `BUILD_UNLOCK` :171, side steps, bank guard), `balance.js` (:246, :579), `Civic.js` (hall art page :26), `TownHall.js`, `Assets.js` residency |
| Shop stage 4 (no storeroom, no manager) (§4.2) | `Seller.js`, `balance.js` |
| Ceremony at the hall; station cash by train (§4.6) | `Rank.js`, `Growth.js`, `Rail.js` / `Train.js`, `TownHall.js` |
| Meat cans re-tune (§4.7) | `balance.js` `meatcan` (4.2.1), `MeatCan.js` read-only check |
| Migration complete + failure path + fixtures (§6) | `Save.js` (`migrateSave` :532, `load`), `Game.js` (`restoreV3` order :973, boot card), `UI.js` (card), `Transfer.js`, `tools/test/save_v43.mjs` |
| ~~Depot beside the export dock~~ | deferred to L1a (D20); `DepotSystem.js` / `DepotBuilding.js` untouched in v4.3 |

### Step C — management (exit = G3, G5, G7; cut line → v4.3.1)
| Feature | Main files |
|---|---|
| 마을 장부 (§4.10) | new `scenes/LedgerPanel.js` mounted as the first tab of `scenes/OfficePanel.js` (replaces `stock`, :24); `StockLedger.js`; `UI.js` (`setPopulation` :708 — always visible from `zone_forest`, hit area, glyph); `OfficeBuilding.js` desk tap; `OnboardOverlay.js` (one-time finger) |
| Toggles (§4.8) | new `systems/Toggles.js`; `Seller.js`, `Labour.js` (`OperatorSpot`), `Worker.js` (`Porter`, `RawPorter`), `Game.js` serialize place-chain; goal / site / order cards + hall board (pause-aware hint) |
| Labour office + 알바 (§4.9) | new `entities/LabourOffice.js`, new `systems/Jobs.js` (L1a slice); `WarehouseCrew.js` (idle spot = yard, hire at the counter), `Progression.js` (`stn_porter*` pads), `Paths.js` `makeRoom` (interior only) |

### Internal-track policy
Only one v8 migration ships, so **no build with a partial migration reaches testers**. A and B are developed together;
the first internal-track build is the end of B. M1 is the only earlier Play build. The **designer preview** after A is a
web page on its own origin (new games only, its own storage), so it cannot read or overwrite the designer's v7 village.

## 4. Feature designs

### 4.1 Fishing deck (replaces the net)
- `WORLD.deck` = { x 960, y 300 (on water), reel: [930, 372] (shore end, on land), crate: ≈ [990, 395] (on land, beside
  the gangway foot), gangway polygon (art + the fishers' lane only), stools: tier 1–3 points, lane: gangway foot → stool k
  waypoints, rods: 3 holder points, tiers: { 2: art key, 3: art key + roof } }. `WORLD.net` is removed; the old net spot is
  (880, 398) with `gather` [0, 86].
- `FishingDeck` keeps the `Net` surface used today (`gather`, `ready()`, take/pickup, `max`, refill): pool max 6, one
  more every 1.1 s (`BALANCE.resources.net` :139 kept; add `deck.reelS` 0.6). Three rods show the pool (bobbing → bite →
  hooked). The chief on the reel spot plays `reel` once (0.6 s), then the existing pickup interval runs (no per-fish wait).
- Fishers: today's fisherman **already** fishes with a rod (`Worker.js` `nodeOk`/`impact`: 2 work cycles per fish, the net's
  stock ignored, carries 5 to the pile on foot). New: a seated loop `cast 0.6 → wait 1.0–2.8 (mean 1.9) → bite 0.25 →
  reel 0.6 → rest 0.15`, two fish a reel (`deck.fishPerReel` 2), each flying to the crate: cycle ≈ 3.55 s ≈ 34 fish/min,
  3 ≈ 101/min = today's measured rate. (Review fix SUITES-1: this line said "3 ≈ 59/min (today's measured rate)", but a
  4.2 rod fisherman catches ≈ 34/min — 102/min for three on `v41_save_smart_46min`; tuned to 59/min the deck put village
  complete ≈ 3.5 bot minutes later.) `deck.mjs` checks 29–39/min for one fisher and 88–115/min for three. Stools replace `fisherSpot` [-128, 30] and the `rodSpot` search (`Worker.js:135`).
  `hire2/3_fisherman` keep their ids, prices and tool rule; buying them grows the deck to 2단 / 3단.
- The **fish pile** (`labour.piles` id `fish`) becomes the crate on land: same id, so `piles.fish` in saves is untouched;
  `raw_grill` porters never step on the deck.
- **No walkable water** (critique): only fishers go onto the deck, along a fixed scripted lane (waypoints, collision off on
  the lane, depth above the water layer) when hired or after load; nobody else may path there. This drops the planned
  `Paths.gridPath` / `segClear` / `Navigator` walkable-polygon change and its stuck/nav/see-through risk. `stuck.mjs` and
  `nav.mjs` still run with three fishers + two porters + the chief crowding the gangway foot.
- Things that point at the net: `Onboarding.js` (`net` target :48, steps :63/:64/:84, ring :396/:721, drag :715), `Tutorial.js`,
  `OnboardOverlay.js`, strings with 그물 (3 in `strings.js`), title diorama (`src/title/layout.js`, `title_bake.json`,
  `tools/title/title_pack.py`), `WORLD.tutorialView` [1095, 670] and `WORLD.onboard.views`.
- **First-walk risk (gate G1)**: today the chief starts at (935, 520), 1.5 m from the net's gather point. From the hut door
  (≈ (640, 700)) the reel spot is 12.9 m (≈ +2.5 s); from the hut's shore-side yard (≈ (820, 470)) it is 3.7 m (≈ +0.5 s).
  Default: **new games start in the yard with the hut in the opening frame**; migrated saves start at the hut door (or in
  front of the shop when `v42_office` is a site). Measure in step A.

- **(v4.3 「바다 가까이」, after the designer's a1 preview: "낚시를 너무 멀리서 하는데 바다 가까이 가야지")** the chief's spot
  is no longer on land: `WORLD.deck.landing` = a 1.0 × 1.2 m jetty stub (`deck43_landing` art, planks lifted 8 px) at the
  surf line, centred at (1100, 380): right of the gangway's head, under the deck's front corner. `deck.reel` = LD(0, -0.25)
  = (1089, 386), 0.3 m from the water (deck.mjs: ≤ 0.6 m). He stands facing the sea (NE), casts his own line to a float
  0.5 m / 1.5 m out (`landing.bob`), loops `fish` (the `reel` poses without their short line; rod tip per frame =
  `tipPoints`) at today's pickup beat, and every fish leaps from his float to him (same 0.3 s flight). The three deck rods
  still bend while he reels. Leaving reels the line in; Settings 줍기 'off' with the button let go reels it in too.
- **The chief's own ground** (`Collision.addLand`): the planks' inside and the snow between them and the shore's walk line
  (shore + 46) count as land only for the chief (`offLand / blocked / resolve` with `chief` true); every path, porter,
  fisher and resident still sees the sea there. The polygon's land side overlaps ordinary land by a 14 px band (a seamless
  step on). Its `door` (the land side's middle, a step out on the snow, (1099, 442)) is the 관망 pilot's last waypoint.
- New games start at (1130, 412), 1.03 m from the spot, on the chief's own ground right-behind the landing ((v4.3 verify):
  the sea branch's 1.7 m start at (1090, 440) only kept a 5th fish off the first batch, which `Onboarding.fishCap` now
  does; straight behind at (1089, 418) the S1 arrow's tip sat on his head, beside it the arrow, ring and pad read clear at
  412×915 and 360×640). Once the first batch is in (fishCap: the 4th fish in hand or flying) he takes no more and reels
  his line in (`Player.fishCapped`, `FishingDeck.lineHeld`): before, the float kept bobbing and dipping with no catch
  while the card said 「물고기를 모았어요!」 and the arrow pointed at the grill. Old saves keep the chief where he was saved
  (at the old spot (880, 465) he simply stands on the snow).
- The fish crate's box stands left of its pile pad (`propAt` [-62, 14] → (938, 454)) and its name 44 px left
  (`labelX`): the old place (1050, 418) touched the landing's planks. The pile pad (porters' spot) stays at (1000, 440).
  ((v4.3 verify LOOK-3) its fish lie IN the box: `stackAt` [-57, -5] / `stackCols` (3 × 3 in the opening) /
  `stackScale` 0.7 — they stood as white towers on the pad beside an empty box, over the gangway's foot.)
- (v4.3 verify, the phone look check) at 1x the fishing read weakly: his float now lands in front of him on open water
  (`landing.bob` [-0.2, 1.7] → (1168, 337), 42 px off the surf, clear of the fishers' floats; was [0.5, 1.5], 21 px off
  the shore to his right), a fish's leap is 50 px high (`landing.leap`; 96 rose among the rods' hanging fish), and the
  stand-here mat fades to 0.12 while his line is out (the planks show under him). A full bag reels the line in like the
  tutorial's cap (`lineHeld`). The S1 arrow goes once he stands at his spot fishing (it covered him for the cast). A
  chief saved on his landing reloads on it (`unstickChief` uses the chief flag; it put him 36 px behind, out of reach).
  The camera may look 150 px past the sea's top edge (`Territory` SEA_PEEK; the overview frames the land alone): pinned
  at y 0 the chief at his spot and the deck sat under the rank / delivery / objective panels.
- **G1 cost**: every point at the water's edge is ≈ 215–245 px (screen, mostly vertical) above the grill's 서서 굽기 pad
  (934, 625), and the grill stands between; the spot → grill walk is 1.4–1.5 s for the onboarding bot from anywhere on
  this shore (0.85 s from the old spot on land). The onboarding bot's first sale therefore rises by ≈ 0.4 s: per seed it
  lands at 15.7–15.8 s or 16.1 s (whether the 4th fish comes before the 「가만히 있어요」 card's 1.5 s is up), medians
  15.8–16.1 s over four 5-seed runs against the 15.75 s gate; the smart bot stays inside (21.57 s against 21.82 s).
  Moving the 서서 굽기 pad 0.6 m toward the shore (labour.ops.grill.pad [-92, 14]) measured 15.8 s / 21.5 s: not enough
  alone. Open: waive G1 for the onboarding bot, or redesign the grill's pads (lead's decision).
  (v4.3 verify, merged tree, 5 seeds each) start (1090, 440): onboarding 15.8 / 15.9 / 16.1 / 15.8 / 16.1 (median 15.9),
  smart 21.57; (1089, 418): median 15.8, smart 21.47; (1130, 412) + the reel-in: 15.8 / 15.8 / 15.9 / 16.1 / 15.7 (median
  15.8), smart 21.53. The start cannot carry the onboarding bot under 15.75: the `move` and `still` cards each stay ≥ 1.5 s
  (onboard.dwell), so he leaves the landing at the same moment from any start that reaches it within ~3 s; the rest is
  the spot → grill walk and the `coming` card's 2.8 s dwell (per-seed spread 15.7–16.1 s in every run).

### 4.2 The shop: stages, queues by kind, the 자재 창구
Today: `Market` (`Seller.js:142`) = one shelf (3 foods × 40), one queue (`queueStart`, `queueStep`, turn after 6), one register;
the front customer is served one at a time, wants **one** kind × count (`makeWant` :245), and switches kind when it runs out
(:351). Customers appear at the off-screen point of the fixed `market.entry` path (`spawnPoint` :284, `world.js:117`).
`TradePost` (`Seller.js:610`) = shelf (planks, ingots × 40), cash, merchant spot, register; clerks via `Register.js`
(`hire_clerk_market` 12, `hire_clerk_trade` 50, `clerkTradeSlow` 1.25).

New model:

```
Market.stage            1..4  (derived: 1; 2 = zone_forest done; 3 = mkt_s3 done; 4 = mkt_s4 done)
Market.counters[]       { id: 'mat' | 'food' | 'fish' | 'breadmeat' | 'bread' | 'meat',
                          types, shelfPad, rack (cap per kind), register, clerk, queue, queueStart/step/turn, sign, open }
```

| Stage | Counters (west → east) | Queues | Shelf per kind | Spawn × (D15) | Sprite keys |
|---|---|---|---|---|---|
| 1 | food (fish, bread, meat) | 1 customer | 40 | 1.0 | `market_s1_back/front` |
| 2 | mat · food | 1 merchant + 1 customer | food 40, mat 40 | 1.0 | `market_s2_*` |
| 3 | mat · fish · breadmeat | merchant + 2 customer lines | 60 | 1.1 | `market_s3_*` |
| 4 | mat · fish · bread · meat | 2 merchant spots + 3 customer lines | 80 | 1.2 | `market_s4_*` (open roof 3.6 m) |

- **Customers**: spawn interval = `customers.spawnEvery` 2.0 / `spawnEveryLate` 1.3 ÷ `market43.spawnMul[stage]`. At spawn a
  customer picks its want among the types on counters that are **open and served** (a clerk on the register, or the chief
  standing on it) — same weights as today — and joins that counter's line. A counter nobody serves takes no new customers;
  the chief stepping onto its register opens it at once. (Without this, stage 3 regresses: today one clerk serves every
  food, but a stage-3 bread/meat line with no clerk would hold customers forever.) If its type is empty for `switchS` (4 s,
  like `emptyCueS`) a customer moves to a served line with stock. Six stand straight, then the line bends (`queueTurn`).
  Total cap stays `maxQueue` 10.
- **Spawn points do not change** (off-screen point of `market.entry`), so house placement does not shorten customer walks;
  the judge's "customer: house → line 44.8 → 7.4 m" row is withdrawn (§4.6).
- **Merchants** (the old TradePost loop, unchanged numbers): one at a time per merchant spot, buying one item every
  `trade.buyInterval` 0.28 s while the chief or the mat clerk stands at the mat register (`clerkTradeSlow` 1.25). Keep the
  `BALANCE.trade` keys so `balanceCheck.js` ranges stay valid. The stage-4 second merchant spot opens only while a second
  person stands at a mat register (two mat clerks, or clerk + chief) — a deliberate stage-4 boost measured in G4.
- The old trade sled is placed as decor next to the mat counter (art exists: `trade_post` sled part).
- **Facade to limit churn**: `gs.trade` becomes a thin adapter over `market.counters.mat` exposing `stock`, `shelf`, `cash`,
  `flying`, `maxPerType`, `register`, so `Surplus.js`, `V42.js`, `Neighbours.js`, `Occlusion.js`, `OfficePanel.js` keep
  working (49 references in 8 files). `HarborModel.js`'s `this.trade` is its own object (read-only module, untouched).
  Real renames can follow in L1a.
- Direct edits: `StockLedger.js:14/:16` shelf `'trade'` → `'market'` (counter `mat`); `Tutorial.js` `ZONE_CHAINS` seller
  `'trade'` → `'mat'` (:24, :26) and `SELL_KEY` strings; `Game.serialize` BIN `trade` → `mat` and `chainOf` for GOODS;
  `Progression.js` clerk icon (:364) and hire (:450).
- **Steps**: `hire_clerk_trade` keeps its id (now 자재 점원, flag `firstTrade`); new `mkt_s3` (400 + 8 planks, after flag
  `firstBreadSale`, D4), `hire_clerk_s3` (150), `mkt_s4` (2,000 + 20 planks + 8 ingots, after `f:rankEup`, offered at the
  ceremony). Stage 2 comes with the forest: `COMES_WITH.zone_forest = ['mkt_s2']`.
- **Deferred to v4.3.1** (critique): the stage-4 back storeroom (200, `WarehouseCrew` sink) and `hire_mkt_mgr` (600) — the
  manager had no defined job and 80 per kind already answers "bigger stock space".
- **Clerk visibility**: `queueStart` sits diagonally left-front of each register so the front customer does not stand
  between the camera and the clerk; G6 measures the visible clerk share **with the front customer present** (≥ 75 %).
- **Plaza crowding**: the store at `d_store` faces its line east (away from the market lines); 360×640 shots per stage.
- **Pads**: each stage must keep every paid pad in clear ground (4.2.0.1 rule, labels above crowds). The stall grows
  sideways, so pads beside stage 1 must sit outside the stage-4 footprint from the start. padvis runs per stage.

### 4.3 Hut → office → hall; the build order

- **Hut** = building type `chief_hut` (art: props `chief_lodge`, `assets/props/manifest.json:680`; today decor at
  (960, 2400), which is removed there). A new game places it `done` on plot `v42_office`, moved to **(600, 640)**
  (`after: null`, region `start`). Needs door, desk and mailbox points; the desk opens the ledger (§4.10) and is the 관망
  pilot's `office` agenda spot until the office stands.
- **Office upgrade**: new `Site` mode "replace": `start('chief_office', { replaces: 'chief_hut' })` on a plot holding a done
  `chief_hut`; the hut stays drawn until the scaffold. Price `hut.office` = **400 + 8 planks** (write stage proposed 600 + 8;
  today `civic.office.site` 1,800 + 20 + 6, `balance.js:579`). A **side** card after `zone_mine`
  (D16), not in `GOALS`. Bank guard: `v42_bank` needs `b:chief_office`, so if the office is still a hut at `f:rankEup` a
  `chief_office` goal is inserted before the bank (no dead end). Office staff steps (`sem/ttal/bok/chong`) and the courier
  get `also: 'f:rankEup'`. The hut desk (ledger door) is inactive while onboarding Act 1 runs.
- **Hall**: plot `w_hall` keeps its id, moves to **(180, 760)** XL, region `start`, `after: 'hire_hunter'`, new `drop` and
  `clear` (front square). `BUILD_UNLOCK.town_hall` `'tower_east'` → `'hire_hunter'` (`Progression.js:171`); `GOALS`
  moves `town_hall` to the first goal after village complete (before `east`). Price `buildings.town_hall` 2,400 + 30 + 10
  (`balance.js:246`) → 1,200 + 16 + 4. Effects unchanged (`civic.hall`: tax, +6 homes, +8 happiness).
- **Hall art residency**: the hall's frames live in the `town` fragment (`town_civic@hall`, `Civic.js:26`), loaded when the
  east tower starts. Load that page (only) at village complete; re-run `texbudget.mjs` and the texture tour.
- **Ceremony**: the 승격식 pad (`rank_eup`, today on the station square, `Rank.js`) moves to the hall's front steps; the
  stage-4 offer appears there after the ceremony.
- **Station cash (D10)**: once the hall stands, each village train at `stops.ours` moves the station cash box into the hall
  tax box (own cap; logged in 서리 소식). No new save data (both boxes are saved today).
- `v42_office` `after: 'b:town_hall'` (`world.js:790`) and `v42_bank` `also: 'b:chief_office'` stay valid in spirit; the
  bank moves earlier only because the office does (52 → ~45 min).

### 4.4 Clothing workshop and first houses
- 옷·신발 공방 = the bench (`WORLD.bench`, `upgrade_bench`, at ≈ (945, 986)) re-dressed as a small workshop; capacity/speed
  pads, prices and `BENCH_AFTER` unchanged. Name and art only.
- Two house plots: `h43_1` (640, 1040) S and `h43_2` (1340, 1050) S, `after: 'zone_forest'`, with a per-plot price override
  (80 + 4 planks, 160 + 6 planks; today `house_c` 80 + 6, `house_a` 160 + 10). `population3.baseCap` 19 unchanged.
  **Side goals (D16)**: offered as side cards, never in `GOALS`; the smart bot buys them only when that does not delay the
  next main goal. Houses earn nothing before the hall's tax box, so on the main path they would only delay the farm.
- Four `tent_a` decor tents at the camp; `VillageLife` move-ins send the tent families into the first two houses (the
  tents fold away).

### 4.5 Districts, plots, roads

#### 4.5.1 Plot table (keep every old id)

| Plot | Position | Size | only | after | Note |
|---|---|---|---|---|---|
| `v42_office` | (600, 640) | M | chief_hut → chief_office | — | was (110, 810), after `b:town_hall` |
| `w_hall` | (180, 760) | XL | town_hall | `hire_hunter` | was (-780, 1880), region west, after `tower_east` |
| `d_tool` (new) | (380, 1560) | M | toolsmith | `r:east` | |
| `d_wh` (new) | (740, 1560) | M | warehouse | `hire_hunter` (4.2.1) | makes 4.2.1's `waitPlot` moot |
| `d_labour` (new) | (1220, 1610) | L | labour_office | `b:warehouse` (≈ 26 min goal) | 8.8 m from `d_wh`: the crew's idle yard |
| `d_cannery` (new) | (1560, 580) | M | cannery | `boat_rowboat` | beside the boathouse road |
| `d_store` (new) | (1480, 940) | M | store | `b:cannery` | plaza east |
| `d_school`, `d_clinic` (new) | (-930, 640), (-1160, 870) | M | (none in v4.3) | — | reserved, sign only |
| `h43_1`, `h43_2` (new) | see §4.4 | S | houses | `zone_forest` | |
| `v42_depot` | **unchanged in v4.3** (D20; ≈ (3080, 1700) only if D20 = B) | L | depot42 | unchanged | |
| `e_m1`, `e_m2`, `s_m1`, `w_m1`, `w_m2` … | unchanged | M | houses/deco only | unchanged | use a `types` allowlist, **not** `only` |

`UNIQUE_BUILDINGS` already allows one of each workshop, so "a second one of the same type" cannot exist. The generic M
plots must keep accepting houses so plots never dead-end (C1 rule). `Save.js` sanitize drops a site whose plot has `only` and a
different building (`Save.js:200`), which is why the generic plots use a new `types` field.

#### 4.5.2 Roads and decor

- 눈꽃 큰길 = a `RoadPaint` street `spine43` from the hall front → south of the shop → east tower → coast road → station cash
  box, plus matching `WORLD.roads` nodes/edges for walkers. New nodes `hut_door`, `hall_front`, `deck_head`; `w_office`
  (-120, 880) and its edges go.
- **First-pass conflicts found from coordinates** (footprints S 180×90, M 272×136, L 362×181, XL 525×262 px; to be
  confirmed by `v43_layout.mjs`):
  1. Hut at (600, 640) covers the trash pad (560, 700) and its campfire (520, 590) → move both west (≈ (420, 700) / (380, 600)).
  2. Grill at (1000, 520) sits on walk node `beach_n` (1000, 500) next to `gap_n` (1078, 556) → re-route the beach edges.
  3. Hall at (180, 760) covers the office-site trees (190, 860), (260, 720), (300, 930) and the moved signpost (-40, 720)
     (`v42.removeDecor`/`moveDecor`) → turn them into `hall` cuts at village complete.
  4. 창고 at (740, 1560) sits on the bard's concert campfire (740, 1575) → move the concert to the hall's front square.
  5. Store at (1480, 940) covers walk node `east_link` (1600, 930) → bend the east link around it; the 큰길 passes south of it.
  6. Labour office at (1220, 1610) covers `bush_snow` (1052, 1660); `lamp_post` (1040, 1500) is at its edge.
  7. Cannery at (1560, 580) covers `bush_snow` (1620, 545).
  8. House `h43_1` at (640, 1040) touches the `plaza_sw` → `forest_link` edge (705, 965) → (772, 1148) → nudge west.
  9. `tutorialView` and `onboard.views` must frame deck, grill and stall in one phone view.
- Regenerate: roads, decor moves/cuts, `treeGaps`, see-through occluders, pad spots (`STATION_PADS.grill` moves with the
  grill), finger-tutorial targets; re-run padvis.
- Region/fog: all new plots except the depot are in `start`; the restaurant plot `w_rest` keeps the region that opens with
  its tower.

#### 4.5.3 Depot move
**Deferred (D20 default).** The depot keeps today's plot, `v42.streets`, `sleighRoute` and `treeGaps`; `DepotSystem.js` /
`DepotBuilding.js` are untouched in v4.3, which also removes the overlap with the 금방 patches. The move (dock → depot
66 → 8 m) is a late-game porter saving that belongs with the L1a depot rework.

If D20 = B (move now): re-author `WORLD.v42.depot` (`i/j`, `door`, `bay`, `bayPt`, `till`, `sleighStop`), `v42.streets`
(`ave_s`, `bank_st`, `lgx_dock`, `lgx_walk`), `sleighRoute` and the depot `treeGaps` for ≈ (3080, 1700); check
`depot.test.mjs`, `depot_parity.test.mjs`; coordinate with the 금방 owner; +1 builder day.

### 4.6 Ceremony and walk-length targets
The judge's walk table (`judge/data/reco_walks.csv`) compares **measured** old walks (research `routes.txt`, real paths)
with **estimated** new ones (straight iso distance × 1.05/1.15/1.2). On the old layout the measured coin round is 322 m
while the same estimate rule gives 279 m (measured ≈ 1.15 × rule), so every "today → plan" saving in that table is
overstated by ≈ 15 %. Critique re-check (`critique/scripts/walk_check.py`, same rule both sides, same closed loop):

| Walk | Old (rule) | New (rule) | Note |
|---|---|---|---|
| Coin round (office → shop coins → store → station cash → hall → restaurant → bank → office) | 293 m | 172 m | −41 % (doc said −46 %); without station cash 87 m |
| Chief: food register ↔ mat register | 13.6 m measured | 6.0 m | new |
| Cannery → store | 18.7 m measured (bots' w_m1 → w_m2) | 13 m | the 68.6 m in the judge table is the e_m2 → w_m2 alternative |
| Customer: house → line | — | — | **withdrawn**: customers appear off-screen on `market.entry` (`Seller.js:284`); houses do not change it |
| First walk to the reel | 1.5 m | 3.7 m (yard start) | hut-door start would be 12.9 m |

`v43_layout.mjs` must replace both columns with **measured** walks on both layouts (same path finder) before tuning.
Known regressions to watch: oven → shop 13.3 → 13.9 m; meat rack → cannery 45 → 54.5 m (+21 %); chief's ore/meat hand loops
only −8–10 %. Most of the large savings are porter legs (throughput), not the chief's own walking.

### 4.7 Meat cans (4.2.1) in the new layout

- `MeatCan.js` logic unchanged; the cannery's position comes from `d_cannery`; its hire pads come from the plot's `pads`
  offsets (4.2.0.1 pattern).
- Re-measure `meatcan.padMax` 12, `farPx` 1500, `farAt` 0.8, `loadMin` 10, `jamExport` on the new distances (cannery →
  store ≈ 13 m, today 18.7 m on the bots' plots; → export ≈ 47 m, today 96 m): the far-store export rule will rarely fire;
  keep it.
- The 7th store tower and the standing order "고기 통조림 30" (Growth) stay. Watch the meat rack fill (longer porter leg).

### 4.8 Toggles (open/close, pause) — step C
- `Toggles.js`: `{ counters: { mat|fish|breadmeat|bread|meat|food: open }, stations: { grill|sawmill|…|toolsmith|cannery: on } }`,
  saved as `v43.toggles` (only off entries). **Unlock: `toggles.after = 'b:labour_office'`** (D8; the labour office plot
  needs `b:warehouse`), so a closed counter always has a 창고 sink and a drained porter always has a yard. UI: tap the
  building, or the ledger row.
- **Counter closed**: spawn filter skips its types; the current line is served; porters heading there re-plan to the 창고
  (`WarehousePorter` sink); construction-site deliveries are unaffected; the serialize place-chain skips closed counters.
  All food counters closed → one toast "수입이 멈춰요" per session.
- **Station paused**: input pad refuses deliveries; the current batch finishes; the operator sits (`OperatorSpot` sit pose).
  Raw porter returns its load to the pile; goods porter empties the output to 0; then both are **lendable**.
- **Lending (D17)**: when a drained porter becomes free, if some line of the same role has `need > 0` it walks **straight
  there** (vest on); otherwise it walks to the labour office yard and the dispatcher sends it later. Need = `logistics_plan.md`
  §7.4 computation, evaluated on events (pause, arrival, 10 s tick): output ≥ 80 % with nobody coming, a shelf empty ≥ 10 s,
  a site waiting for a material **that exists somewhere** (a stock > 0 or a running producer), or a 창고 backlog. Minimum
  stay 20 s; return when the home line reopens (after the current carry). Gatherers and operators are never lent.
- **Pause-aware hints (dead-lock guard)**: any card that waits for an item — goal card, site card, Growth order card, the
  hall board — checks whether every producer of that item is paused (or its only counter closed) and then shows
  "○○ 쉬는 중 [다시 열기]" (one tap reopens). Example: smelter paused → the hall / labour office / stage-4 sites wait for
  ingots. On load, if any toggle is off, one toast "쉬는 곳 N곳 · 모두 열기". Onboarding replay/tour warns first.
- Lent state is not saved: `progress.init()` re-hires everyone at home on load.
- Interaction with 4.2.1 L0: raw porters "stay on their line" (LD2) except when lent; the lend is invisible to the L0 crew
  seat count (seats count production, `logistics_plan.md` §7.5).
- If D8 = B or C (earlier unlock): before the labour office, drained porters idle beside their station, and before a 창고
  exists a closed counter's goods stay in the station output (the station stops when full).

### 4.9 Labour office + 알바 — step C
- Building `labour_office` (L, `d_labour`, after `b:warehouse`), interior via `Paths.makeRoom` like the office; staff =
  manager + 2 clerks with officefolk looks; yard spots: 6 sit, 4 stretch, 3 tea, 4 chat bench by a fire barrel.
- **What it does (not decoration)**: (1) hire counter — 창고 crew seats and station porters (`stn_porter`, `stn_porter2`)
  are hired here once it stands (before that their pads stay where they are today); (2) **always-live yard** — idle 창고
  crew and station porters wait in the yard instead of beside the 창고 (`d_wh` ↔ `d_labour` ≈ 8.8 m); verify with
  `lgx_l0.mjs` that crew response does not drop, else only crew beyond the active seat count wait there; (3) toggles unlock
  with it; (4) drained porters with no need rest here; (5) opens the ledger's 일꾼 tab with [보기] to the yard.
- `Jobs.js` (the first slice of L1a §7.1): `JobSlot { id, role, home, origin, person, lentTo, since }`, built from
  `progress.done`, `v42.lines.p2`, the crew and `Growth.porters`. L1a later adds moves and 알아서 배치 on the same table.
- **Phone readability**: the office is ≈ 34 m from the shop, usually off-screen. The 알바 marker is a yellow vest overlay
  (torso; an armband is ≈ 3–4 css px at 412 px width) plus a 3 s floating "알바" tag on arrival (D18).
- Price 900 + 14 planks + 4 ingots, ≈ 26 min.

### 4.10 마을 장부 (ledger screen) — step C (door at the desk from step A)
- `LedgerPanel.js` = the **first tab of `OfficePanel`** (replaces the `stock`/재고 tab, `OfficePanel.js:24`), open without
  staff (today 재고 needs 셈이). 소식/편지/직원/통장 unchanged; 셈이 keeps the wall board and letters. One screen instead of
  two overlapping ones; it is also the 현황 tab of the planned hub (`logistics_plan.md` §8). The 일꾼 tab opens with the
  labour office. Sets `ui.v42PanelOpen` so joystick, chat pill, 관망 and the navigator wait.
- Doors: hut/office desk from the start (inactive while onboarding Act 1 runs); popBox (`UI.js` `setPopulation` :708) —
  **today it is shown only when `waiting > 0 || n >= cap` (:714)**, so it is made always visible from `zone_forest`, gets a
  small ledger glyph and a hit area per §8.4, and a one-time finger (OnboardOverlay) when it first becomes a door. No new
  HUD button (D9).
- Data and cost: totals, per-minute rates and the chips come from `StockLedger`'s **existing always-on 1 Hz sampling**
  (EWMA in/out, `fullS`/`emptyS`, `StockLedger.js:50–60`) — no new per-frame work. The per-place breakdown (deck crate,
  fishers' bags, boats at sea, boathouse, every `Hauler` stack, market counters, store + can shelves, 창고, station in/out,
  piles, pantry, food box, export dock, depot racks, train cars, and **in-flight items** as "옮기는 중") is walked only while
  the 물건별 tab is open, ≤ 1 Hz, and only changed rows are re-rendered.
- Invariant test: per kind, the sum of places equals the **ghostsweep item census** (an independent count), so a forgotten
  place fails the test instead of silently passing "sum = total".
- Chips: 가득 (≥ 90 % for `civic.ledger.fullS`), 비어 감 (empty ≥ `emptyS`), 멈춤 (toggle off). [보기] pans the camera.

### 4.11 Strings

All lines with 교역소 and 그물, the new stage names (눈꽃 노점 / 눈꽃 가게 / 눈꽃 시장 / 눈꽃마을 시장), counter signs,
toggles, labour office, ledger, the 「마을 새 단장」 letter and the 3-tap tour, refund letters; English keys follow.
Korean player text: warm, plain, no code words.

---

## 5. Files touched (summary)

| File | A | B | C | Nature |
|---|---|---|---|---|
| `src/data/world.js` | ● | ● | ● | deck, market stages, hut, plots, roads, decor, depot |
| `src/data/balance.js`, `balanceCheck.js` | ● | ● | ● | new keys + ranges (§7.1) |
| `src/data/strings.js` | ● | ● | ● | |
| `src/entities/Seller.js`, `Register.js` | ● | ● | ● | counters, queues, merchants, toggles |
| new `src/entities/FishingDeck.js` | ● | | | replaces `Net` |
| `src/entities/ResourceNode.js` | ● | | | remove `Net` (keep class until tests move) |
| `src/entities/Worker.js` | ● | | ● | seated fisher + scripted lane; porter destinations; lend |
| `src/entities/Site.js` | ● | | | replace-in-place |
| `src/entities/OfficeBuilding.js`, `src/systems/office/Office.js` | ● | ● | ● | hut state, desk door |
| `src/entities/TownHall.js`, `src/systems/Civic.js`, `src/systems/Rank.js` | | ● | | hall timing, art page, ceremony |
| `src/systems/Labour.js` | ● | | ● | crate pile, operator sit |
| `src/systems/Progression.js` | ● | ● | ● | steps, GOALS, BUILD_UNLOCK, COMES_WITH |
| `src/systems/Tutorial.js`, `Onboarding.js`, `src/scenes/OnboardOverlay.js` | ● | ● | | targets |
| `src/systems/StockLedger.js` | ● | | ● | shelf remap; ledger sources |
| `src/systems/Surplus.js`, `V42.js`, `Neighbours.js`, `Occlusion.js`, `src/scenes/OfficePanel.js` | ● | | | via the `gs.trade` facade (minimal edits) |
| `src/systems/Paths.js` | | | ● | labour office room only (`makeRoom`); no deck patch, `Navigator.js` untouched |
| `src/systems/RoadNet.js`, `RoadPaint.js`, `Roads.js`, `Territory.js` | | ● | | spine, new nodes |
| `src/systems/Growth.js`, `Rail.js` | | ● | | station cash by train |
| `src/systems/WarehouseCrew.js` (4.2.1) | | | ● | idle spot = labour office yard; hire at its counter |
| `src/systems/depot/DepotSystem.js`, `src/entities/DepotBuilding.js` | | | | untouched in v4.3 (D20) |
| `src/systems/VillageLife.js` | ● | ● | | tents → houses, concert spot |
| new `src/systems/Toggles.js`, `Jobs.js`; `src/entities/LabourOffice.js`; `src/scenes/LedgerPanel.js` | | | ● | |
| `src/scenes/OfficePanel.js` | ● | | ● | `gs.trade` facade (A); ledger replaces the 재고 tab (C) |
| `src/scenes/UI.js` | ● | ● | ● | migration-failure card (B); popBox always visible + door, toasts (C) |
| `src/scenes/Game.js` | ● | ● | ● | construction order, serialize chain, `restoreV3` order |
| `src/core/Save.js`, `src/core/Transfer.js` | ● | ● | ● | v8 migration, `check43`, failure marker, sanitize, pre43 key exclusion + export |
| `src/core/Assets.js` | ● | ● | ● | stage/deck/labour pages, hall page residency |
| `src/title/layout.js`, `src/title/bake/title_bake.json`, `tools/title/*` | ● | | | net → deck, rebake |
| `src/data/version.js` | ● | | | `v4.3` |
| read-only: `src/{story,missions,bank,vehicles,harbor,beach,city}/**` | | | | not edited (guardrail) |

---

## 6. Save migration v7 → v8

### 6.1 Order of operations on load
```
Save.load → readJSON → [new] keepPre43(raw)  (once: copy to 'frostVillage.save.pre43' if absent and raw.v === 7)
          → migrateSave: MIGRATE[7] (pure JSON → JSON, v8) → [new] check43(pre, post) → sanitizeSave (accepts the v8 shapes)
Game.create → buildWorld (v8 plots) → restoreV3(sv) (Game.js:973; skips sites whose plot id is missing, :980)
          → steps (progress.init) → restoreV3Stock → v43 post-load (letter, tour flag, refunds credited)
```

All remaps happen inside `MIGRATE[7]`, **before** `restoreV3` (which silently drops a site on a missing plot id) and
**before** `sanitizeSave` (which drops a building on a plot whose `only` differs, `Save.js:200`). `Transfer.js` dry-runs the
same path, so a v7 village code migrates exactly like a stored save.

**Failure path (critique — today's behaviour is unsafe for a big migration).** `migrateSave` (`Save.js:532`) catches an
exception from `MIGRATE[v]`, breaks and returns null; `Save.load` then calls `keepCopy` (BACKUP_KEY, or `.2` — which it
overwrites) and the game **starts a fresh village that autosaves over `SAVE_KEY`**; the old village survives only in the
backup slot, with no restore UI (only `move.backup` has 되돌리기). For v4.3:

1. `keepPre43` runs before any migration step (6 KB autosave: no quota concern).
2. `check43(pre, post)`: coins (wallet + every cash box + tax box + bank), items per kind and buildings per kind counted
   from the raw v7 JSON must equal the v8 result ± the logged refunds; on a mismatch or an exception `Save.load` returns
   `{ failed: 'v43', reason }` instead of null.
3. `Game` shows a "마을을 옮기지 못했어요" card (copy the pre43 village code · try again · start a new village — explicit),
   sets `window.__FV_NO_SAVE` until the player chooses, and never starts the onboarding.
4. Settings › 마을 옮기기 offers "새 단장 전 마을" (the pre43 copy as a code) for support.
5. `Transfer.js` reports the same failure for a pasted v7 code instead of accepting it.

### 6.2 MIGRATE[7] (data-driven tables)
```
const MOVE_TYPE_PLOT = { toolsmith: 'd_tool', warehouse: 'd_wh', cannery: 'd_cannery', store: 'd_store' };   // D19 = A
const REPRICE = { town_hall: {old, new}, chief_office: {old, new} };   // from BALANCE at migration time

1. sites (keyed by plot id; coordinates live in world.js, so plots that only moved need no data change:
   v42_office, w_hall keep their ids; v42_depot does not move in v4.3, D20)
   for each site { b, st, got, t }:
     if D19 = A and MOVE_TYPE_PLOT[b] and the plot id differs:
        if sites[target] is empty → sites[target] = site; delete sites[old]       (level/stock/workers are keyed by kind:
                                                                                  v3.workshops.{toolsmith,cannery}, v3.store)
        else                      → refund(site) and delete                        (cannot happen while UNIQUE holds)
     (D19 = B: leave it; sanitize grandfathers an existing workshop on a `types` plot; the letter offers a free move)
     if b in REPRICE and st !== 'done':
        cap got to the new need; refund extra materials (to 창고 if it exists, else coins at prices.*)
        refund coin difference old.coins − new.coins
     (done buildings bought at the old price: kept, no refund — D21 A; D21 B refunds old − new)
   if !sites.v42_office → sites.v42_office = { b: 'chief_hut', st: 'done' }
2. trade post → 자재 창구
   market.mat = { stock: trade.stock capped at the stage's rack; overflow → v3.warehouse if a 창고 exists,
                  else coins at prices.item_plank / item_ingot }
   market.cash += trade.cash; delete trade
3. shop stage: derived from progress.done (zone_forest → 2); if the bread chain has sold (progress.hints.farm or
   flags.firstBreadSale) → done.mkt_s3 = true (free); if flags.rankEup → seen.mkt_s4 = 'half' (offer at 50 %)
4. net → deck: no fish count is saved for the net (it refills); piles.fish keeps its id (now the crate)
5. player = hut door position (in front of the shop if v42_office is a site); player.stack kept
6. progress.paid / progress.got: ids unchanged (hire_clerk_trade, hire2/3_fisherman, rank_eup keep their ids);
   no step is removed, so no partial payment is orphaned. New steps start unpaid.
7. flags: seen.tour43 = false (letter + tour), seen.firstHouses43 = false (offer only), refunds43 = { coins, items } for the letter
8. v: 8
```

Staff: workers, porters, clerks and operators are not saved as people; `progress.init()` re-hires them at their (moved)
places on load. Office staff steps keep `done`. Lent porters do not exist in a saved game (§4.8).

Pads with partial payments: `progress.paid[id]` / `progress.got[id]` stay keyed by step id; pads move in `world.js`
only. The 4.2.0.1 `Progression.yields` rule for fisher 2/3 pads at the grill is replaced by their deck pad spots.

### 6.3 sanitizeSave / BUILDINGS

- `BUILDINGS` (`Save.js:46`) += `chief_hut`, `labour_office`; `UNIQ` (`Save.js:193`) += both.
- New plots: `types` allowlist on generic plots; sanitize accepts a house on a `types` plot and rejects workshops there.
- New block `v43 = { toggles: { counters: {}, stations: {} }, seen: {} }` (booleans only).
- `market` gains `mat: { stock, cash }` and `back: { stock }` (counts clamped to caps).

### 6.4 Backup and transfer codes

- `frostVillage.save.pre43` is written once (never overwritten) before the first v8 write; add it to `Transfer.js`'s
  excluded keys next to `BACKUP_KEY` / `save.backup.2` / `*.bad` / `move.backup` so codes never carry it.
- A v8 code pasted into a 4.2.0.1 build fails with `newerSave` (`Transfer.js:187`) — already handled.
- A v7 code (from 4.2.0.1 or a 4.2.1 internal build) pasted into v4.3 migrates through `MIGRATE[7]`.
- 4.2.1 internal builds are also save v7 (meat cans add no new save fields: `progress.flags.meatCan`, `seen.mcanOffer`,
  `v42.seen.up.mcan`, `v42.offerPaid.mcan`), so one migration covers both.

### 6.5 Migration tests (`tools/test/save_v43.mjs`)
Fixtures: `tools/test/fixtures/v35_save_{0_5,12,21,38}min.json`, `v41_save_{pure_25,pure_45,smart_25,smart_35,smart_46}min.json`,
`v42_save_office_ttal.json`, `v42_village_late.json`, a 4.2.1 meat-can save, and **the designer's own village** (exported with
마을 옮기기 — request the code before release). For each: load in 4.2.0.1 (reference) and in v4.3, then compare

- coins (wallet + every cash box + tax box + bank) = before + logged refunds,
- items of each kind across all places (the ledger's sum) = before ± logged refunds/conversions,
- buildings and levels (by kind), done steps, rank, residents count,
- no site lost (`restoreV3` skip count = 0), no pad orphaned, onboarding not started for old saves, letter shown once.

Plus fuzz: reload mid-purchase at a moved pad, reload with a porter carrying planks to the old trade shelf, reload during a
site under the old hall price, double load (migration idempotent on v8), and **forced failure**: a v7 fixture whose
`sites` entry makes `MIGRATE[7]` throw (and one that fails `check43`) → the card shows, `SAVE_KEY` stays byte-identical
for 60 s of play, no autosave, onboarding not started, Transfer rejects the same code with the reason.

## 7. Balance, census, gates

### 7.1 New and changed `balance.js` keys (Korean comments in the file's style)
```js
  // ── (v4.3) 마을 새 단장 ──────────────────────────────────────
  market43: {
    stage3: { coins: 400, item_plank: 8 },                    // 눈꽃 시장 (3단): 빵이 팔리기 시작하면
    stage4: { coins: 2000, item_plank: 20, item_ingot: 8 },   // 눈꽃마을 시장 (4단): 읍이 되면 (승격식 자리에서)
    stage4Old: 0.5,                                           // 이미 읍인 예전 마을은 4단을 이 비율 값으로
    shelfMax: [40, 40, 60, 80],                               // 단계별 종류마다 올려 두는 최대 개수 (1단 = 지금 40)
    spawnMul: [1, 1, 1.1, 1.2],                               // 단계별 손님이 오는 빠르기 (1·2단 = 지금과 같음, 봇으로 맞춰요)
    lineShow: 6,                                              // 한 줄에 똑바로 서는 손님 수 (넘으면 줄이 꺾여요)
    switchS: 4,                                               // 먹거리가 이만큼(초) 떨어져 있으면 손님이 다른 줄로
    clerk3: 150,                                              // 3단 점원 (뒤 창고·시장 관리인은 4.3.1)
  },
  deck: { reelS: 0.6, castS: 0.6, waitMin: 0.8, waitMax: 2.0, fishReelS: 0.6 },  // 낚시 좌대: 촌장 감기, 어부 던지기·기다리기·감기(초)
  hut: { office: { coins: 400, item_plank: 8, item_ingot: 0, time: 8 } },        // 오두막 → 촌장 사무실 (옆 목표)
  houses43: [{ coins: 80, item_plank: 4 }, { coins: 160, item_plank: 6 }],       // 첫 집 두 채 (숲을 열면, 옆 목표)
  labour43: { site: { coins: 900, item_plank: 14, item_ingot: 4, time: 10 },    // 인력 사무소 (창고 다음)
              minStay: 20, outFull: 0.8, shelfEmptyS: 10, tick: 10, crewYard: true },  // 알바 · 창고 일꾼이 마당에서 기다리기
  toggles: { after: 'b:labour_office' },                                         // 열고 닫기·잠깐 쉬기가 생기는 때
// changed
  buildings.town_hall: { coins: 1200, item_plank: 16, item_ingot: 4, time: 14 },   // 2400 / 30 / 10 → 마을 완성 때
```

Unchanged on purpose: `customers.shelfMax` 40 (stage 1), `trade.buyInterval` 0.28, `register.*`, `resources.net`
(max 6, refill 1.1 → the deck pool), `customers.spawnEvery/Late` (stages 1–2), `population3.baseCap`, all hire prices.

### 7.2 Re-tune list
0. **Pacing arithmetic (critique).** The main line up to `hire_hunter` costs ≈ 8,600 coins (`balance.js` costs :88–122)
   over 20.4 bot minutes (≈ 420 coins/min, rising). The new early buys — houses 240 + 10 planks, stage 3 400 + 8, office
   400 + 8 (≈ 1,040 coins + 26 planks, ≈ 12 % of that) — would push village complete ≈ 1.5–2 min if they sat on the main
   path. Hence D16 (houses + office are side goals), D15 (stage 3 pays back through +10 % customers) and gate G2 =
   "village complete ≤ baseline + 1.0 min". Knobs, in order: office price, stage-3 price, `spawnMul[2]`.
1. First 20 minutes: houses at 5–6 min take 10 planks early → check the forest line and the sawmill porter; the stage-3
   price at ~12 min; the office (side) must not be bought by the smart bot ahead of `zone_mine` / `zone_hunt`.
2. Hall at ~20.5 min (1,200 + 16 + 4) before the east tower (300 + 10 planks) and station: check the tower/station minutes.
3. Customer lines by kind with `spawnMul`: check per-kind shelf fill and income per step (`logistics_plan.md` §10.3
   per-step bands, Q9 answer); served-only lines must not starve a kind while its clerk is unhired.
4. Merchant ceiling at the mat counter ≥ baseline items/min; stage-4 second merchant spot measured separately.
5. Meat cans (§4.7) and the L0 gates on the new distances; crew response with the yard idle spot (§4.9).
6. 알바 (step C): no oscillation (min stay 20 s; one dispatch per event; never lend gatherers/operators).

### 7.3 Gates
| Gate | Pass |
|---|---|
| G1 | time to first sale ≤ baseline × 1.05 (onboarding bot and smart bot) |
| G2 | village complete ≤ baseline + 1.0 min; 읍 within ±5 % of its bot target; office ≈ 16 (when bought), hall ≈ 20.5 reported |
| G3 | `fresh25` and pacing bots green; per-step income bands hold |
| G4 | L0 throughput gates (`lgx_l0.mjs`) and merchant ceiling ≥ baseline |
| G5 | suites: padvis (per shop stage), onboarding, save fixtures (§6.5), stuck/nav, smoke, v42, plots, restaurant, transfer, meatcan, cans.test, ledger.test, depot tests, ghostsweep, texbudget |
| G6 | 360×640 and 412×915 plaza shots (day/night, ko/en): three lines, labels, signboards, pads, no overlap; **clerk ≥ 75 % visible with the front customer present** |
| G7 | perf: draw calls / display objects in the plaza with three lines + merchants (`review_robust_drawcalls.mjs`), logic time with the ledger open on 물건별, 10-min soak |
| G8 | migration failure path: forced throw / failed `check43` keeps `SAVE_KEY` byte-identical, the card shows, Transfer rejects with the reason |

## 8. Tests
New:

- `tools/test/v43_layout.mjs` — footprints vs decor/roads/pads/water/fog, walk table from real paths on **both** layouts
  (CSV), per-stage pad clearance.
- `tools/test/deck.mjs` — fisher loop rate (≈ 20/min each with the tuned wait), chief reel + pickup timing, fishers' lane
  (no one else on the deck), crate on land, crowd at the gangway foot.
- `tools/test/market43.mjs` — stage transitions, lines by kind, served-only lines (unhired counter takes nobody; chief on
  its register opens it), switching when a kind runs out, `spawnMul`, merchant rate, second merchant spot.
- `tools/test/toggles.mjs` — unlock with the labour office, counter close (line finishes, deliveries to 창고), station pause
  (batch finishes, porters drain, direct dispatch vs yard), pause-aware hints on goal/site/order cards, on-load toast,
  reopen return, save/load returns lent porters home, all-closed toast once.
- `tools/test/labour43.mjs` — dispatch by need (sites only when the material exists), min stay, vest overlay, crew yard
  idle without throughput loss, crew/station-porter hiring at the counter.
- `tools/test/ledger43.test.mjs` (node) — per kind, sum of places = ghostsweep census (incl. in-flight); chips; per-place walk
  only while 물건별 is open.
- `tools/test/save_v43.mjs` — §6.5, incl. the forced-failure cases.

Updated: `onboarding.mjs` (deck targets, views, yard start), `padvis.mjs` (stages, new plots), `transfer.mjs` (v7 → v8,
pre43 key excluded, failure reported), `save_v42.mjs` (still loads), `plots.mjs`, `restaurant.mjs`, `v42.mjs`, `v42_guide.mjs`,
`hallboard.mjs` (hall position, pause hint), `dockporter.mjs`, `clerk_view.mjs` (with a front customer), `store42.mjs` (store
position), `meatcan.mjs` / `cans.test.mjs` (4.2.1), `stuck.mjs`, `nav.mjs`, `smoke.mjs`, `ghostsweep.mjs`, `texbudget.mjs`,
`shots_v42.mjs` → `shots_v43.mjs`, title lab. Bots: the smart bot must learn stage pads, the hall goal, side goals and the
deck reel spot.

Machine etiquette (shared 4 CPUs): one browser at a time, `nice -n 10`, small viewports, low Blender samples.

## 9. Art list

| Asset | New / reuse | Pipeline | Notes |
|---|---|---|---|
| Shop stages 1–4, back + front layers, blank signboards, staff/rack/queue points | new | `tools/blender/bld_*` (market_counter lives in `bld_*` / `prop_*`) | stage 1 in the first-load page; 2–4 lazy; signboard text drawn by the game; stage 4 without the back storeroom |
| Clerk adult outfit (`npc_clerk_a`) | re-render | character pipeline (`char_*`) | same frame names |
| Fishing deck 1–3단, gangway, rod holders (idle/bite/hooked), crate | new | `harbor_lib` pier planks + `bld_*` | water-level sprite; 3단 small roof; crate on land at the gangway foot |
| Chief `reel` (0.6 s) | new anim | `ch2_anim/ch2_render/ch2_pack` | one-shot, 8 directions not needed (faces the sea) |
| Seated fisher loop: cast / wait / bite / reel / drop, stool | new anims | workers (`wkr_*` / `char_anim`) | 3 looks; the rod already exists in the fisher rig |
| Labour office building (L) + cutaway + yard props (benches, fire barrel, tea table, sled, snowman) | new | `civ_*` or the office pipeline | interior like the office cutaway |
| Labour office staff | reuse | officefolk (`of_office_*`) | manager + 2 clerks |
| Porter sit / stretch / tea / chat | new anims | workers pipeline | |
| 알바 vest (D18) + "알바" tag | new overlay | UI/fx atlas sprite drawn on the porter's torso | avoids re-rendering every porter; armband rejected (too small on a phone) |
| Hut | reuse `chief_lodge` (props) | — | add door/desk/mailbox points + collision |
| Office, hall, bank | reuse | — | hall page loads at village complete |
| Tents | reuse `tent_a` | — | |
| Old trade sled (decor) | reuse `trade_post` part | — | |
| 옷·신발 공방 small workshop | new (small) or reuse a small building + sign | `bld_*` | |
| Ledger/toggle UI | reuse `ui5`/`ui6` status icons; new toggle switch | `gen_ui*` | |
| Title diorama | rebake | `tools/title/*` | net → deck |

Blender: the art scripts run under `bpy` 5.2.2 in `/tmp/bvenv` (`/tmp/bvenv/bin/python tools/blender/<x>.py`, see
`handoff/명령어모음.md`); there is no `blender` binary on the machine, which is why the concept stage made 2D composites only.
`/tmp` can be cleared: recreate the venv from the handoff before art work. Keep samples low.

Texture budget: new pages = shop stages (4 × 2 layers), deck, labour office, new anims; the hall page moves earlier. Run the
texture tour at 0, 12, 20.5, 26, 45 min.

---

## 10. Interaction with 4.2.0.1 and 4.2.1

**4.2.0.1 (shipped)**

- **Paid pads in clear ground, one per spot, labels above crowds**: every moved building takes its `STATION_PADS` / plot
  `pads` offsets with it; the deck gets new spots for fisher 2/3; each shop stage keeps its pads outside the next stage's
  footprint. padvis is a hard gate (G5).
- **Stuck-walker fixes** (`Paths.js` `gridPath`/`segClear`/`makeRoom`): no deck patch any more (scripted fisher lane); the labour office room uses the
  same machinery; multi-line queues must not trap customers (re-run `stuck.mjs`).
- **Onboarding** (`Onboarding.js`, new games only, replay in settings): retarget from the net to the reel spot; recompute
  views; old saves never start it (they get the letter + tour instead).
- **Ghost goods**: the serialize place-chain gains the mat counter and closed counters (no back storeroom in v4.3) —
  re-run `ghostsweep.mjs` and `ghostcoins*.mjs`; the ledger's per-place invariant is checked against the same census.
- **Mine rock move**: unaffected (the mine stays).

**4.2.1 (merging now, ships inside v4.3)**

- **Meat cans**: §4.7. The cannery's fixed plot changes its distances; MeatCan's rules stay.
- **L0**: warehouse at village complete (`BUILD_UNLOCK.warehouse = 'hire_hunter'`, 4.2.1 `Progression.js:171`) fits `d_wh`
  in the start region (no `waitPlot` wait); the labour office (and the toggles) come after it. Raw porters stay on their
  line except when lent (§4.8). `WarehouseCrew` idles in the labour office yard and is hired at its counter once it stands.
- **Move village** (`Transfer.js`): §6.4.

**Plans**

- `logistics_plan.md`: the toggles + labour office + ledger are the first slice of L1a (§1.2), not a second system; the
  need rule is §7.4's, triggered by the player.
- 금방: nothing changes under it in v4.3 (depot stays, D20).

---

## 11. Risks
| Risk | Likelihood / impact | Mitigation |
|---|---|---|
| The first 20 minutes change on purpose; pacing shifts (≈ +1,040 coins of new buys) | high / high | D16 side goals, D15 stage-3 pay-back, G1–G3 on every step; prices in `balance.js`; bots re-run per change |
| First walk to the deck from the hut slows the first sale | medium / high | start in the hut's shore yard (3.7 m, §4.1); measure in A |
| Phone crowding in the plaza (3 lines, merchants, store queue, porters, chief) | medium / medium | lines side by side (D5), store line faces east, 6 then bend, 360×640 shots (G6), draw-call check (G7) |
| ~~Walkable deck: pathing, depth, see-through~~ | removed | crate on land; fishers on a scripted lane (§4.1) |
| Stage-3 regression: a line with no clerk holds customers | medium / medium | served-only lines (§4.2), `market43.mjs` |
| A paused producer blocks a goal / site / order (looks like a dead-lock) | medium / high | pause-aware hints with [다시 열기], on-load toast (§4.8) |
| Hall 22 min earlier and 1,200 cheaper; houses at 5 min; office at 16 without staff | medium / medium | per-step income bands; staff wait for 읍; bank guard if the office was skipped |
| Meat-can leg 21 % longer | low / low | 12-item bag; census check of the rack |
| Roadmap overlap with L1a | medium / medium | renumber (§1.2); agree the L1a split. Depot/금방 overlap removed (D20) |
| Players lose free plot choice for four workshops | low / low | D6 / D19 alternatives; letter explains |
| Migration throws or loses something → fresh village overwrites the slot (today's `Save.js:532` behaviour) | low / very high | pre43 copy, `check43`, failure card + no autosave (§6.1), §6.5 invariants and forced failures on all fixtures + the designer's village |
| Walk savings overstated (measured vs estimated) | certain / low | numbers re-based (§4.6); `v43_layout.mjs` measures both layouts |
| Fog/regions: hall plot moves from `west` to `start`; restaurant plot must keep its region | low / medium | `v43_layout.mjs` fog check |
| Texture budget (stages, deck, labour office, earlier hall page) | medium / medium | lazy pages, texture tour at 5 times |
| Art pipeline not ready (`/tmp/bvenv` cleared) | medium / medium | recreate from the handoff before the art steps |

## 12. Rough effort (one builder; art in parallel)
| Work | Builder days | Art days |
|---|---|---|
| M0 baseline | 1 | |
| M1 stall + clerk | 0.5–1 | 1 |
| A: deck + rods + seated fisher (no walkable water) | 2 | 2.5 (deck, rods, chief reel, seated loop) |
| A: shop stages 1–3 + served lines + 자재 창구 (facade) | 3.5 | 2 (stages 2–3) |
| A: hut + office replace-in-place | 1 | 0.5 (points) |
| A: 옷·신발 공방 + first houses (side) + tents | 0.5 | 0.5 |
| A: onboarding / tutorial / title / strings | 1.5 | 0.5 (title rebake) |
| A: designer preview build | 0.5 | |
| B: plots, layout tool (both layouts), roads, decor, conflicts | 3 | |
| B: progression reorder, side goals, bank guard, prices, ceremony, train cash, hall page | 1.5 | |
| B: stage 4 (no storeroom / manager) | 1 | 0.75 |
| B: ~~depot move~~ (D20) | 0 | |
| B: migration + failure path + fixtures + transfer | 3 | |
| B: meat-can + L0 re-measure | 0.5 | |
| C: ledger (office-panel tab, popBox door) | 2.5 | 0.5 (toggle sprite, glyph) |
| C: toggles + drain + direct lend + pause-aware hints | 2.5 | |
| C: labour office + Jobs slice + 알바 + crew yard | 3 | 2.5 (building, yard, porter poses, vest) |
| Gates, bots, shots, docs (across) | 3 | |
| **Total** | **≈ 28–34** (30.5 point estimate) | **≈ 11–12** |

The critique's cuts (walkable deck, depot move, storeroom/manager ≈ −2 days) are roughly paid back by its additions
(failure path, pause-aware hints, served lines, preview build ≈ +2 days).

## 13. Open questions
1. The designer's answers to D1–D21 (the Korean doc's §11, "must choose" = D2, D3, D8, D15–D21); defaults are used if they
   say "추천대로".
2. The roadmap owner's agreement on the renumbering and on starting L1a's `Jobs`/hub inside v4.3 (§1.2).
3. 금방 owner: nothing changes under the depot in v4.3 if D20 = A.
4. The designer's village code (마을 옮기기) for §6.5, before release.
5. Whether M1 goes out as 4.2.2 (Play internal + closed tracks) or rides with v4.3 (D14).
6. Names: 눈꽃 노점 / 눈꽃 가게 / 눈꽃 시장 / 눈꽃마을 시장, 자재 창구, 인력 사무소, 마을 장부, 옷·신발 공방 — confirm.
7. Where the designer preview is hosted (web artifact link) and whether it may use the Play build's art pages.

## 14. Critique changes (Nov 1)

| # | Finding | Evidence | Change |
|---|---|---|---|
| 1 | Walk savings compared measured old walks with estimated new ones | research coin round measured 322 m vs 279 m by the judge's rule; `critique/scripts/walk_check.py` | §4.6 re-based: coin round 293 → 172 m (−41 %); all old values flagged ≈ 15 % long |
| 2 | "Customer walk 45 → 7 m" is impossible | customers spawn at the off-screen point of `market.entry` (`Seller.js:284`, `world.js:117`) | row withdrawn; spawn unchanged |
| 3 | "Cannery → store 68.6 → 13 m" used a different cannery spot | research: bots' w_m1 → w_m2 = 18.7 m; 68.6 m is e_m2 → w_m2 | 18.7 → 13 m |
| 4 | New early buys (≈ 1,040 coins) contradict "village complete unchanged" | main line ≈ 8,600 coins by 20.4 min | D16 side goals, office 600 → 400, D15 `spawnMul`, G2 ≤ +1.0 min |
| 5 | Stage-3 lines with no clerk would hold customers | single-front serving, one want kind per customer (`Seller.js:245–380`) | served-only lines |
| 6 | Toggles at 20.5 min had no 창고 for closed counters (warehouse ≈ 25 min) and no yard | 4.2.1 `BUILD_UNLOCK.warehouse = 'hire_hunter'` | D8 → unlock with the labour office (needs the warehouse) |
| 7 | A paused producer can silently block goals/sites/orders | hall/labour office/stage 4 need ingots | pause-aware hints, on-load toast, need ignores missing materials |
| 8 | Labour office yard empty unless the player pauses | lending only from paused lines | crew + station porters idle in the yard; hire counter; D17 direct dispatch |
| 9 | Armband unreadable on a phone | ≈ 3–4 css px at 412 px width | D18 vest + 3 s tag |
| 10 | popBox is not always on screen; ledger duplicated the office 재고 tab | `UI.js:714`; `OfficePanel.js:24` | popBox always visible from the forest + glyph + finger; ledger = first office tab |
| 11 | Walkable water patch was the riskiest new walking rule | `Paths`/`Navigator` stuck history (4.2.0.1) | crate on land, scripted fisher lane |
| 12 | Fisher rate: 1–3 s wait gives ≈ 17/min, not 20 | cycle 0.6 + 2.0 + 0.6 + drop | wait 0.8–2.0 s; fishers already use rods today (`Worker.js:97, 306`) |
| 13 | A throwing migration starts a fresh village over the save | `Save.js:532` catch → null → fresh game autosaves | `check43`, failure card, no autosave, G8 |
| 14 | Scope: depot move (금방 overlap), storeroom + manager (no job) | — | deferred (D20, v4.3.1) |
| 15 | Smallest visible step | — | M1 stays; designer preview after A (own origin, no risk to the real village) |

Pictures re-drawn with corrected text: `img/01`, `02`, `03`, `06`, `09`, `sheet` (originals in `redesign/critique/orig/img/`).
