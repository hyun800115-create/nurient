# v4.3 step B 「마을 새 단장 둘째 걸음」: scope map against v4.3.0-a3.1

- **Tree read:** `scratchpad/hud_wt/frost-village`, branch `local/v43-hud`, HEAD `12d598f`, `VERSION` `v4.3.0-a3.1`, `SAVE_VERSION` 8.
  Read only. Nothing in the tree was changed and no browser or game was started.
- **Sources:**
  - `docs/roadmap_mayor/engineering_roadmap.md` §3 (F0, F0s, R43, TX, P1) and §4.1.
  - `docs/redesign_v43/engineering_plan.md` §3 Step B and §4.2–4.7, §4.11, §6, §7, §8, §10.
  - `docs/기획서_마을새단장.md` §11–§12.
  - `docs/기획서_시장취임_로드맵.md` (Q1–Q24 decided ★).
  - `docs/기획서_돈과복지.md` Q25, with `roadmap_mayor/econ_welfare_addendum.md` and `econ_welfare_roadmap_patch.md` E9.
  - `docs/기획서_광장과축제.md` 광장 1.
  - The a3 work notes in `scratchpad/v43/bakery/{spec,code_report}.md` and the a3 suite logs in `scratchpad/v43/a3/`.
- **How coordinates were checked:** with `node -e "import('./src/data/world.js')"`, using the footprint diamonds S 180×90, M 272×136, L 362×181
  and XL 525×262 px. A screen point is converted to plaza metres with `Z()` in reverse. These are arithmetic checks only.
  Every placement below still has to be confirmed with `tools/test/v43_layout.mjs --probe` and `padvis.mjs`.
- **Line numbers** refer to the a3.1 tree.

---

## 0. Summary

**What step B is.**
- The roadmap (§4.1) defines step B as the plan's §3 table:
  - fixed workshop plots;
  - office ≈ 16 min as a side goal;
  - hall at village complete;
  - 눈꽃 큰길;
  - shop stage 4;
  - ceremony at the hall;
  - station cash by train;
  - meat-can re-tune;
  - the complete migration with a failure path.
- The roadmap adds these items to it:
  - F0 (slice container `x` + keep-rules + save-size gate);
  - F0s (`lv` 43 + newer-save refusal);
  - R43 (structure-keyed remap);
  - TX (texture task);
  - P1 (opt-in play log; cut line → v4.4);
  - office staff after 읍 (D3);
  - the labour plot hidden until v4.4;
  - one `v43` save block;
  - gates G1–G8 including G3 and G7.
- Two plot-table requests come on top:
  - **Q25:** school plot XL, clinic plot L, the old hall plot kept as a hidden `w_civic`.
  - **광장 1:** reserve the 한마당 site.

**What a3.1 already has toward step B.** About 15 % of it, and nearly all of that came as side effects of step A, the v4-C hall and the a3 requests:
- The hut stands on the moved office plot, with replace mode.
- The `hut.office` price key exists (400 + 8) but nothing uses it yet.
- The 4단 land reserve exists (`market.reserve4`) and is kept clear of pads.
- The ceremony pad and ceremony already move to the hall when a hall stands.
- The `'hall'` keys for decor removal exist, but nothing calls them.
- `v43_layout.mjs` (with `--probe` and walk rows) and the M0 baseline are committed.
- One a2 preview-village fixture exists (`v43a2_bread.json`).
- **Everything else is missing:**
  - plot table, `types` allowlist, 큰길, side office;
  - hall move, reorder and price; staff gating;
  - stage 4; train cash; meat-can retune;
  - the whole save track: `v43`, `remap43`, `keepPre43`, `check43`, failure card, F0, F0s;
  - TX, P1, the 「마을 새 단장」 letter and tour.

**What the a3 additions change (details in §4).**
1. **Bread left the central shop.** The plan's stage 4 ("자재 · 생선 · 빵 · 고기, 3 customer lines") no longer fits.
   - Stage 3 is now 자재 · 생선 · 고기.
   - It is bought only after village complete and the first meat sale. That is D4 alternative B, made in a3.
   - Stage 4 needs a new counter plan (N1).
2. **The planned plot table collides with a3 and step-A placements:**
   - `d_labour` sits on the moved first house `h43_2` (1110, 1600) and the picnic table.
   - `d_store` covers the shop's clerk / 눈꽃 시장 / 고기 점원 pad spot (1525, 900) and the dog house.
   - `d_cannery` covers the snow fort.
   - `d_wh` covers the campfire and its three log seats. `d_tool` covers the igloo.
   - The new hall plot (180, 760) covers the trash pad that step A moved to (150, 700).
   - The hall would also hide the beach campfire, the bard stage and the fisher hut, all of which step A moved behind it.
3. **The 광장 1 ★ site sketch (south of the yard, between the first houses) is gone.**
   - The a3 bakery cottage, stall and queue now stand there.
   - What is left between the forest and the bakery is ≈ 7 × 4 m. The doc asks for 16–20 × 12–14 m.
   - The only central open land of that size is the village green below the forest and the field (≈ 12 × 13 m in plaza metres).
     That is exactly where the plan put its "work strip" (`d_wh`, `d_labour`) and where a3 put `h43_2` (N2).
4. **The a3 build went to the Play closed test (AAB 4313) as well as the preview app (4305).**
   - R43 therefore has three village shapes to handle:
     - v7 4.2.0.x;
     - v8 a1/a2;
     - v8 **a3**, which has bakery, flag, `bakery` slice and new markers.
   - There is no a3 fixture yet.
5. **The goal window, the residents window and the vehicle layout read layout facts that step B moves.**
   - Goal window: `V42_BUILDS` lists the office as an after-읍 main goal.
   - Residents window: the bard and herbalist "live" at the green campfire.
   - Vehicle layout: `p:hall` = the old hall front; `p:mail_east` = `east_link`.
6. **The station-cash idea has a save hole.** The plan says it needs "no new save data", but the hall's tax box is clamped to `taxCap` (1500) on load in two places. Train cash pushed into it would be lost on reload (N5).

**New choices with no ★ yet.** §5 gives a recommended default for each; nothing is decided:
- N1: stage-4 counters.
- N2: where the 한마당 goes and where the work strip goes.
- N3: a new spot for `d_store`.
- N4: the hall site's step-A leftovers.
- N5: where the train cash lives in the save.
- N6: the old plan's grill move, tied to G1.
- N7: the name 큰길.
- N8: the `x` budget against festival keys.
- N9: an a3 fixture.
- N10: the vehicle anchors.
- N11: what the pre-읍 office does for the player.

**Effort.** The roadmap says 19–22 builder-days (planned 17.75). Q25 adds ≈ 0.25 day and 광장 1 ≈ 0.5 day; neither is in the 19–22.
The a3 interactions add an estimated **+2–3 days**, broken down in §9: plot-table re-solve, stage-4 re-plan, a3 fixture and remap shape, goal and residents window updates, vehicle anchors. The new range is ≈ **21–25**.

---

## 1. Decisions applied (★ adopted per the "don't ask, just build" rule) and recorded

| Source | Question | Adopted answer | Effect on step B |
|---|---|---|---|
| 마을새단장 §11 D2 | Hall timing | ★A at village complete (`hire_hunter`) | B5 |
| D3 | Chief's buildings | ★A hut (0) → office on the same plot (≈ 16, side) → hall next door (≈ 20); staff after 읍 | B3, B4 |
| D4 | Stage 3 timing | ★A (first bread sale) is **superseded**. a3 shipped alternative B one step later: after `hire_hunter` + first meat sale (`Progression.js:71`, bakery spec B4). Recorded as an a3 fact, not reopened | B6 |
| D5, D6, D7, D11, D12, D14 | Shop shape / one plot per workshop / zones stay / clothing / chief fishing / M1 | ★A. D5, D11, D12 and D14 were done in step A or 4.2.0.2. D6 is step B. D7 means no zone moves | B1 |
| D8, D9, D17, D18 | Toggles / ledger door / drained porters / 알바 marker | ★A, but they belong to step C, which moved to v4.4 (roadmap Q2 ★). The labour office opens after 읍 (Q3 ★) | Not step B (labour plot only) |
| D10 | Station cash | ★A: the train carries it to the hall tax box | B8 |
| D13 | Release shape | ★A, amended by Q2 ★: step C goes to v4.4 | — |
| D15 | Customers per stage | ★A `spawnMul` [1, 1, 1.1, 1.2]. a3 has the first three | B6 |
| D16 | First houses + office | ★A side goals (houses done in step A; office in B3), office price 400 + 8 | B3 |
| D19 | Old saves' workshops | ★A: move toolsmith / warehouse / cannery / store to the district plots, keeping their state | B12 |
| D20 | Depot | ★A: it stays put (its move goes with L1a in v4.6) | B10 |
| D21 | Hall / office finished at the old price | ★A: kept, no refund, thank-you letter | B12, B17 |
| 시장취임 Q2, Q3 | Step C → v4.4; labour office at 읍 | ★ yes | `d_labour` after `f:rankEup`, hidden |
| Q14 | Opt-in play log | ★ yes, from v4.3, off in the public build | B16 |
| Q15, Q21 | Staff as the 읍 gift (v4.4); no refund | ★ yes | B4: v4.3 only hides the pads before 읍 |
| 돈과복지 Q25 | School / clinic plots | ★ yes: `d_school` XL, `d_clinic` L, old `w_hall` footprint kept as hidden `w_civic`, `types` allowlist data-driven (`br`, `care_*` later) | B1 |
| 광장과축제 광장 1 | Reserve the 한마당 site now | ★ yes: no tree, decor or house plot is placed there | B1 (the site needs N2) |
| Roadmap E3 / 시장취임 "검토 때" | G1 (first sale over by 0.35–0.45 s) | No ★ exists → N6 | — |

---

## 2. The step-B items at a glance

Each row is one item from roadmap §4.1 or plan §3 Step B and its §4 subsections. The full write-up for each is in §3.

| ID | Item (source) | a3.1 already has | Missing | Main files |
|---|---|---|---|---|
| B1 | Fixed plots and plot table (§4.5.1, D6/D19, Q25, 광장 1, labour plot) | Hut on `v42_office` (600, 640); `h43_1`/`h43_2`; `reserve4` | All `d_*` rows, `types`, `w_civic`, 한마당 reserve, hidden `d_labour`; Civic reservation rules | `world.js`, `Civic.js`, `Save.js`, `Tutorial.js`, `Progression.js` |
| B2 | Roads and decor: 눈꽃 큰길, nodes, cuts and moves, conflict list (§4.5.2) | `'hall'` decor keys (`world.js:973-980`), uncalled | `spine43` street + nodes, `w_office` removal, conflict fixes (new ones from a3), grill decision | `world.js`, `RoadPaint.js`, `RoadNet.js`, `Roads.js`, `Territory.js`, `VillageLife.js`, `vehicles/layout.js` |
| B3 | Hut → office as a side goal at ≈ 16 (§4.3, D16) | Replace mode, `hut.office` key (unused), office plot after `b:town_hall` | Side card after `zone_mine`, price hook, goal and residents window, bank guard | `world.js`, `Site.js`, `Tutorial.js`, `GoalBook.js`, `Progression.js` |
| B4 | Office staff after 읍 (D3, roadmap §4.1) | Only 총총이 waits for 읍 (`Office.js:137`) | Gate all four roles; 직원 tab text; G2 읍 ±5 % | `Office.js`, `OfficePanel.js`, `strings.js` |
| B5 | Hall at village complete (§4.3, D2) | Hall entity, tax box, ceremony venue, flag pole on it | Plot move, unlock, `GOALS` order, price, `'hall'` decor call, concert spot, vehicle anchor, trash pad and beach items | `world.js`, `Progression.js`, `balance.js`, `Civic.js`, `TownHall.js`, `VillageLife.js` |
| B6 | Shop stage 4 (§4.2) | Stages 1–3, `reserve4`, `market43` arrays of 3 | Art, counters (N1), second merchant spot, `mkt_s4`, half price for old 읍 villages | `Seller.js`, `balance.js`, `Progression.js`, `world.js`, assets |
| B7 | Ceremony at the hall + stage-4 offer (§4.3) | Pad and ceremony use the hall when it stands (`Game.js:1522-1525`, `Rank.js:74-77`) | Offer card at the ceremony; re-shoot the venue at the new hall | `Rank.js`, `Game.js`, `UI.js` |
| B8 | Station cash by train (§4.3, D10) | Station till; it empties itself only from 읍 on; Rail emits `arrive ours` | The move itself, a news line, **somewhere to save it** (N5) | `Growth.js` or `TownHall.js`, `Save.js`, `VillageNews.js` |
| B9 | Meat-can re-tune (§4.7) | Unchanged `meatcan` block; `pads.mcan` only on `w_m2` | `d_cannery` pads, re-measure on the final distances | `world.js`, `balance.js` |
| B10 | Depot stays (D20) | a2.2 depot crew / forklift save keys | Nothing (R43 must leave `v42_depot` alone) | — |
| B11 | Save shape: `v43` block, `BUILDINGS`/`UNIQ`, `types` (§6.3, roadmap "one home") | Markers in `progress.flags` (`shop43`, `bakery43`); top-level `flag`, `bakery` | `v43 = { lay, toggles, seen, refunds43 }` keep-rules; `labour_office` in `BUILDINGS`/`UNIQ` | `Save.js` |
| B12 | R43 remap, `keepPre43`, `check43`, failure card, Transfer (§6, roadmap R43, G8) | Flag-keyed post-load converters only; `migrateSave` drops a failed save to a fresh village | Everything; plus an a3 fixture and 4.2.0.2 fixtures | `Save.js`, `Game.js`, `UI.js`, `Transfer.js`, `MovePanel.js`, `save_v43.mjs` |
| B13 | F0: `x` + keep-rules + save-size gate | — | All; budget note (N8) | `Save.js`, new `tools/test` cases |
| B14 | F0s: `lv` + `newerSave` + S1 guard | `dryRun` refuses only `raw.v > 8` | All | `Save.js`, `Transfer.js`, `UI.js` |
| B15 | TX: area eviction of `props_buildings`/`bld_*` + one v3 atlas split, full-v4 exit ≤ 445 MiB GL | Area eviction for `bld_buildings`/town pages; a3 peak GL 451.8 | All | `Residency.js`, `Assets.js`, `tools/build` art packing |
| B16 | P1 opt-in play log (cut line → v4.4) | — | All | new module, `MovePanel.js`-style export, build flag |
| B17 | Letter + 3-tap tour + strings (§4.11, §12) | Bakery banner, flag card for old villages | 「마을 새 단장」 letter, tour, refund / thank-you letters, stage-4 and 큰길 strings | `VillageNews.js`, `strings.js`, `OnboardOverlay.js` |
| B18 | Walk targets and balance (§4.6, §7.1–7.2) | `v43_layout.mjs`, M0 baseline | New keys; re-measure on a3 (coin round now has a bakery stop) | `balance.js`, `balanceCheck.js` |
| B19 | Gates G1–G8 + roadmap extras | a3 suites green; G1 / G2 still over | Updated suite list (§8) | `tools/test/*` |

---

## 3. Item details

### B1 — Fixed plots, plot table v2 (plan §4.5.1; D6/D19 ★A; Q25 ★; 광장 1 ★; labour plot per roadmap)

**What a3.1 has.**
- `v42_office` sits at HUT (600, 640) with `after: 'b:town_hall'`, `replace: 'chief_hut'` (`world.js:993`).
- `h43_1` is at (600, 1040). `h43_2` is at **(1110, 1600)** (`world.js:594-597`). Review PT-1 moved it there from the plan's (1340, 1050) because its roof covered the shop's cash pad.
- `w_hall` is still at (−780, 1880), XL, region west, `after: 'tower_east'` (`world.js:618`).
- None of `d_tool`, `d_wh`, `d_labour`, `d_cannery`, `d_store`, `d_school`, `d_clinic` or `w_civic` exists.
- There is no `types` field anywhere.
- `sanitizeSave` drops a site whose plot `only` differs (`Save.js:215`).
- `Civic` keeps big generic plots free for the four big workshops (`BIG_UNIQUES` / `PRE_STORE`, `Civic.js:66-68`, `:149-173`). That rule assumes workshops are built on generic plots.

**Coordinate check of the plan's table in the a3.1 world** ("inside" = within the footprint diamond):

| Plan plot | Inside its footprint now | Just outside (≤ 1.45 × footprint) |
|---|---|---|
| `w_hall` (180, 760) XL | **trash pad (150, 700)** (moved there by step-A review CD-3); `snow_pile_b` (318, 700) | lamp_post (393, 800); signpost (−40, 720); office hire pad (490, 745); `beach_w` area / campfire (140, 590) and bard stage (52, 506); fisher hut (300, 470) under the hall's roof |
| `d_tool` (380, 1560) M | igloo (330, 1565); `green_w` area | — |
| `d_wh` (740, 1560) M | **campfire (740, 1575)** + log seats (740, 1521), (645, 1546), (835, 1546); `green_fire` area | — |
| `d_labour` (1220, 1610) L | **`h43_2` plot (1110, 1600)**; picnic table (1235, 1555); `green_e` area | ice rink (1215, 1700); swing (1440, 1610) |
| `d_cannery` (1560, 580) M | `bush_snow` (1620, 545); **snow fort (1530, 612)** | `playground` area / snowball pile (1440, 556) |
| `d_store` (1480, 940) M | **pads `hire_clerk_market` / `mkt_s3` / `hire_clerk_s3` (1525, 900)**; **dog house (1490, 1000)**; `snow_pile_b` (1393, 934) | `east_link` node (1600, 930); shop stage-2/3 cash pad (1302, 934) |
| `d_school` (−930, 640) → XL (Q25) | cuttable west pine (−1010, 640); crate (−930, 546) | — |
| `d_clinic` (−1160, 870) → L (Q25) | two west pines (−1110, 840), (−1180, 920); two stumps; west edge 59 px inside `WORLD.left` | — |

Notes on that table:
- The plan's own conflict list (§4.5.2) knew only the campfire, the bushes, the lamp and `east_link`.
- The trash pad, the snow fort and the `d_store` pad spot are not plan-era issues:
  - The trash pad and the shop pad spot came from step A.
  - `mkt_s3` / `hire_clerk_s3` came from step A; a3 kept them on that spot.
  - The snow fort was there before. The `d_store` spot was already the 4.2.0.1 clerk spot, but only now carries three stage pads.

**Missing.**
- The `d_*` rows, each with `pads` offsets (`line`, `p2`, `mcan` for the cannery).
- A `types` allowlist on the generic M/L plots (houses, decor; later `br` and `care_*`). The plan's §4.5.1 rule is "`types`, not `only`".
- Sanitize must accept a house on a `types` plot and refuse a workshop there.
- The `MENU` / `plotFor` / `freePlotFor` logic must read `types`:
  - `Tutorial.js:414`;
  - `Progression.freePlotFor` uses `only` or size (`Progression.js:272`).
- `w_hall` becomes `only: 'town_hall'`. Otherwise `w_rest` keeps offering the hall too: XL `MENU` offers both, `Civic.js` `MENU.XL`.
- The hidden `w_civic` (old hall footprint, no menu), the hidden 한마당 reserve (N2) and the hidden `d_labour` (`after: 'f:rankEup'`, no pad until v4.4 code exists).
- The big-plot reservation in `Civic` must count the district plots. With fixed plots it should simply stop reserving generic plots for workshops.

**a3 impact.** Covered in the table above, plus N2 and N3.

**Files.**
- `world.js`, `Civic.js` (`MENU` / `types`, reservation), `Save.js` (sanitize sites, `BUILDINGS` / `UNIQ`).
- `Tutorial.js` (`plotFor`), `Progression.js` (`freePlotFor`), `GoalBook.js` (`why: 'noplot'`).
- Tests: `v43_layout.mjs` (probe all rows), `plots.mjs`, `padvis.mjs`, `walls42.test.mjs`.

### B2 — Roads and decor: 눈꽃 큰길, nodes, the conflict list (plan §4.5.2)

**What a3.1 has.**
- No `spine43` street. No `hut_door`, `hall_front` or `deck_head` nodes.
- `w_office` (−120, 880) and its three edges are still in `WORLD.v42.roads` (`world.js:968-971`).
- `removeDecor` / `moveDecor` were re-keyed to `'hall'` for the three old office-site trees and the signpost (`world.js:973-980`).
  But only `Office.clearDecor('office' | 'bank')` is ever called (`Office.js:84`, `:93`, `:432`). Nothing calls `'hall'`, so today those trees simply stay.

**The plan's nine conflicts, re-checked on a3.1:**

| # | Plan conflict | Now |
|---|---|---|
| 1 | Hut covers the trash pad and campfire | Done in step A. The trash is now (150, 700) with its fire at (140, 574): **inside the new `w_hall`** (N4) |
| 2 | Grill at (1000, 520) sits on `beach_n` | The grill has **not** moved: `Z('plaza', -4.5, 4.8)` = (1004, 590). The plan's (1000, 520) predates the step-A deck crate (1000, 440) and the shore landing (1100, 380). The sled waits on this move: `world.js:179` comment, `Seller.sledAway` `:1378`. Decide with G1 → N6 |
| 3 | Hall covers the office-site trees and signpost | Keys ready (`'hall'`); the call is missing |
| 4 | 창고 on the concert campfire | Still true, plus three log seats. The concert moves to the hall's front square; the residents data's `homeAt` and the `green_fire` area must follow |
| 5 | Store on `east_link` | Still true, plus the pad spot and the dog house (N3) |
| 6 | Labour office on bush and lamp | Plus `h43_2` and the picnic table (N2) |
| 7 | Cannery on a bush | Plus the snow fort |
| 8 | `h43_1` touches `plaza_sw → forest_link` | Done in step A (600, 1040) |
| 9 | `tutorialView` / onboarding views | Done in step A (`world.js` `tutorialView` [985, 600]) |

**New a3 conflicts.**
- **The 큰길's east half.** The plan runs it "south of the shop → east tower", which is the existing `plaza_s` (990, 1095) → `plaza_se` (1262, 968) → `plaza_e` (1335, 905) → `east_link` route. That route now runs through the busiest 120 px of the plaza:
  - the stage-3 meat lane's queue bend (`queueTurn` 6, `queueTurn2` at 8);
  - the shop's cash pad (1302, 934);
  - the bakery roof outline (`plaza_se` is 38 px above it, bakery spec §3.6).
  - The plan's other option, "passes south of `d_store`", runs into the bakery's back yard: its LINE pad (1560, 1056, label below it; a3.2 moved it there from (1497, 1117) and dropped P2: 짐꾼 2 and 빵집 2단 take the LINE spot one at a time), the dog house.
  - Recommendation: the east half is paint only on the existing node route, and `d_store` moves (N3) so that the street can follow `plaza_e → east_link → east_gate`.
- **Naming.** The bakery spec and the Korean a3 summary already call the north–south customer road at x = 990 "큰길" (main road): "가판대는 큰길 쪽을 보고" (N7).
- **Vehicle anchors.** `vehicles/layout.js:123` `'p:hall'` = node `w_front` (−880, 2110), the old hall. `:118` `'p:mail_east'` = node `east_link`. The plan's guardrail says `vehicles/**` is read-only, but the bakery split already edited `:119` and `:125`. Step B must move `p:hall` to `hall_front` (N10).

**Files.**
- `world.js` (`roads`, `v42.roads`, `removeDecor` / `moveDecor` / `treeGaps`, life areas, decor).
- `RoadPaint.js`, `RoadNet.js`, `Roads.js`, `Territory.js`, `VillageLife.js` (concert spot), `residents/data.js` (`homeAt` `green_fire`), `vehicles/layout.js`.
- Tests: `roadnet.test.mjs`, `stuck.mjs`, `nav.mjs`, `goals.mjs` (tap-to-walk routes), `carry.mjs` (row 2 place names and distances).

### B3 — Hut → office as a side goal at ≈ 16 min (plan §4.3; D3/D16 ★A)

**What a3.1 has.**
- Replace mode (`Site.js:65-68`, `keepsOld` `:114`). The hut is drawn while the plot is a plot or a foundation (`Office.syncHut`, `Office.js:66-71`).
- The plot still says `after: 'b:town_hall'` (`world.js:993`). `buildCost('chief_office')` returns `v42.office.site` 1800 + 20 + 6 (`Site.js:34`, `balance.js:667`).
- `hut.office` 400 + 8 exists and is range-checked (`balance.js:713`, `balanceCheck.js:207`). Its comment says it is used "from 4.3 B".

**Missing.**
- **Unlock.** Change `after` to `zone_mine` and make it a side card. Reuse the first-house side-card logic: Tutorial "pays without holding up the next pad" (`Tutorial.js:430`); goal window side rows (`GoalBook.js:225`).
- **Price.** `buildCost` uses `hut.office` when the plot holds a `chief_hut` (or always for `v42_office`). REPRICE in R43 covers an office under construction at the old price (D21 ★A: a finished office keeps its old price; thank-you letter).
- **Goal window.** Take `['v42_office', 'chief_office']` out of `V42_BUILDS` (`GoalBook.js:24`): it is no longer an after-읍 main row. Add a side row "오두막 → 촌장 사무실". `goals.test.mjs:55` checks that the three v4.2 buildings have names.
- **Tutorial.v42Goal** (`Tutorial.js:339`): drop `plot('v42_office')` as the first after-읍 goal.
- **Bank guard.** `v42_bank` needs `b:chief_office` (`world.js:994`). If the plot is still a hut at `f:rankEup`, a `chief_office` goal appears before the bank. That can be a conditional `GOALS` row, or the first branch of `v42Goal`.
- **Not done in step A** (plan §4.3 hut bullet). The hut desk as the 관망 pilot's `office` spot: `ChiefPilot` treats `office` as `O.built` only (`ChiefPilot.js:166`). Optional for B; the desk's ledger door is v4.4.
- **What the office does before 읍** (N11). `OfficePanel` tabs appear with their staff (`OfficePanel.js:2`, `:24`): 재고 needs 셈이, 소식/편지 need 소복이, 통장 needs the bank. With D3 a 16-minute office shows only 직원 (`staffLocked` rows) until 읍. The side card's copy has to say what it is for.

**a3 impact.**
- Goal window (above).
- The carry pill and navigator name places by pad. The office drop pad keeps the plot's `drop` (HUT − 55, + 150), so nothing new is needed there.

### B4 — Office staff after 읍 (D3; roadmap §4.1; Q15/Q21 ★)

**What a3.1 has.**
- `Office.nextRole()` gates only `chong` on rank ≥ 2 (`Office.js:132-141`). 셈이 500, 딸랑이 900 and 소복이 700 appear as soon as the office stands (`balance.js:668`).
- 딸랑이's rounds include the a3 bakery till (`V42.js:26`). The station till leaves the round from 읍 on, because it then empties itself (`Office.js:343-347`, `Growth.js:658-667`).

**Missing.**
- Gate all four roles on rank ≥ 2. That one condition also hides the hire pad, so `GoalBook` side rows and 관망 `observeSpend: 'hire'` need no change.
- 직원 tab text: "읍이 되면 와요" instead of a price.
- `Tutorial.v42Goal`'s hire branch only after 읍.
- Already-hired staff stay; in v4.4 a thank-you letter (Q21 ★A).
- **G2 check: 읍 ±5 %.**
  - M0 읍 = 50.88, 44.30 and 44.21 min (`docs/build_reports/v43_baseline/pacing.csv`).
  - Three changes move 읍 in different directions:
    - The hall comes ≈ 22 min earlier: +8 happiness, +6 beds and the tax box. Faster.
    - No courier before 읍. The chief or 관망 collects the shop, bakery, store, restaurant, tax and station tills by hand. Slower.
    - About 2,100 coins of staff not spent before 읍. Faster.
  - Measure with 3 pacing seeds; knobs: hall tax per person and office price.

**a3 impact.**
- The bakery till is a new pre-읍 stop on every coin round. §4.6's walk table must add it: bakery till (1185, 1259).

### B5 — Hall at village complete (plan §4.3; D2 ★A)

**What a3.1 has.**
- Plot at (−780, 1880), XL, region west, `after: 'tower_east'` (`world.js:618`).
- `BUILD_UNLOCK.town_hall = 'tower_east'` (`Progression.js:190`).
- `GOALS` puts `town_hall` after `shops:5` (`:179`).
- Price 2,400 + 30 + 10 (`balance.js:272`).
- Effects: `civic.hall` tax 1.2 per person per minute, cap 1,500, +6 beds, +8 happiness.
- Art: page `town_civic@hall` of the `town` fragment, through `Civic.needArt` (`Civic.js:26`, `:102`). The village area keeps it resident once a hall stands (`Residency.js:36-44`).
- **The a3 village flag waves on the hall's `flagR` pole** (`VillageFlags.js` hall pole). It reads the hall picture's pixels for its patch.

**Missing.**
- Move the plot to (180, 760): XL, region start, `after: 'hire_hunter'`, `only: 'town_hall'`, new `drop` and `clear` (front square).
- `BUILD_UNLOCK` → `'hire_hunter'`; `GOALS`: `town_hall` first after complete, before `east`.
- Price 1,200 + 16 + 4.
- `Civic` hall build → `Office.clearDecor('hall')`, or a civic equivalent.
- Concert → the hall front square: `WORLD.life.areas.green_fire` and the `VillageLife` concert code.
- `vehicles/layout.js` `p:hall`.
- The hall's `SPOT` (`TownHall.js:26`): tax (160, 928), board (−88, 824), venue (30, 956), rank pad (−6, 968). These need `padvis` at the new site. The office hire pad (490, 745) is 48 px from the hall's east corner.

**a3 impact.**
- Trash pad, beach campfire, bard stage and fisher hut (N4).
- `SETTLER_JOBS` `hall_clerk` unlocks at `b:town_hall` (`residents/data.js:203`). Hall clerks and the +6 beds now come ≈ 22 min earlier, so the residents list grows sooner.
- The flag on the hall shows from ≈ 22 min: a nice moment for the 읍 ceremony venue. Nothing to change in `VillageFlags`.
- Texture: the 15.4 MiB hall page stays resident in the village from ≈ 22 min instead of ≈ 45. The full-v4 peak already includes it; the mid-game peaks rise. That is why TX goes first.

### B6 — Shop stage 4 (plan §4.2; D15 ★A)

**What a3.1 has.**
- `SHOP_STAGE_MAX = 3`, `SHOP_COUNTERS` `{1: food, 2: mat·food, 3: mat·fish·meat}` (`Seller.js:901-902`).
- `market43` arrays of three (`balance.js:219-226`).
- Stage art s1–s3 only (`assets/market/`). The 10 × 5 m `reserve4` is kept free of pads (`world.js:200`).
- `mkt_s3` (400 + 8) after `hire_hunter` + `firstMeatSale`, side; `hire_clerk_s3` 150 = 고기 점원 (`Progression.js:71-72`).

**Missing.**
- Stage-4 art: `market_s4` back and front, open roof 3.6 m.
- Counters (N1); the second merchant spot (opens only while two people stand at mat registers); `shelfMax` 80 and `spawnMul` 1.2.
- `mkt_s4` (2,000 + 20 + 8) after `f:rankEup`, offered at the ceremony (B7). `stage4Old` 0.5 for villages already at 읍 (R43 writes `seen.mkt_s4 = 'half'`; `v43.seen` holds it).
- Raising `SHOP_STAGE_MAX` also re-sizes both rack stacks (`Seller.js:1017`, `:1148` use `shopShelfMax(SHOP_STAGE_MAX)`).

**a3 impact.**
- The plan's stage-4 row — "mat · fish · **bread** · meat; 2 merchant spots + 3 customer lines" — is void: bread sells only at the bakery stall.
- Stage 3's spawn bonus now starts at ≈ 21+ min instead of ≈ 12, so stage 3 and stage 4 are closer together in time.

**Tests.**
- `market43.mjs`, `padvis.mjs` per stage, `clerk_view.mjs`, G6 shots, G7 draw calls. The bakery stall and queue are now in the same plaza frame.

### B7 — Ceremony at the hall + stage-4 offer (plan §4.3)

**What a3.1 has.** The 승격식 pad uses `hall.rankPadPos()` when a hall stands and falls back to the station square otherwise (`Game.js:1522-1525`). `Rank.js:74-77` holds the ceremony at `hall.venue('rank')`, `atHall`.

**Missing.**
- Nothing for the pad itself. With B5 the hall exists before `rank:2` in a new game; old villages keep the fallback.
- Add the stage-4 offer card after the ceremony.
- Re-shoot the ceremony framing at (180, 760): the `atHall` camera branch, 360×640.

### B8 — Station cash by train (plan §4.3 and §4.6; D10 ★A)

**What a3.1 has.**
- The station till `Growth.till`; rent capped at 2,000 (`balance.js:467`); it empties itself only from 읍 on (`Growth.js:658-667`).
- Rail emits `arrive` with `'ours'` (`Rail.js:142`, `:324`). `villageTills` includes `station` (`V42.js:31`).

**Missing.**
- On `arrive ours`, with the hall built and rank < 2: move `till.value` into the hall and write a 서리 소식 line.
- The feature is live only from the hall (≈ 22 min) or the first train (M0 station ≈ 22.4–22.7 min, first train a few minutes later) until 읍 (≈ 44–51). v4.4's F12a 세금 날 replaces the capped tax box. Keep it small.
- **Save hole (N5).** The tax box value is clamped to `taxCap` 1,500 on load in `sanitizeC1` (`Save.js:439`) and in `TownHall.restore` (`TownHall.js:219`). Station coins moved into the tax box past 1,500 would be lost on reload. The plan's "no new save data (both boxes are saved today)" therefore does not hold.

**Files.** `Growth.js` (or a Rail listener in `TownHall.js`), `TownHall.js` (a second pile and label), `Save.js`, `VillageNews.js`, `strings.js`.

### B9 — Meat-can re-tune (plan §4.7)

**What a3.1 has.**
- The `meatcan` block is unchanged (`balance.js:569-590`).
- The machine pad comes from the plot's `pads.mcan` (`MeatCan.js:70-73` → `Game.plotPad` `Game.js:1445`). Only `w_m2` has `mcan`.

**Missing.**
- `d_cannery.pads = { line, p2, mcan }`.
- Re-measure `padMax`, `farPx`, `farAt`, `loadMin` and `jamExport` once N3 fixes the store spot. At ≈ 13 m cannery → store, `farPx` 1500 never fires: keep the rule.
- Tests: `meatcan.mjs`, `cans.test.mjs`, `lgx_l0.mjs`.

### B10 — Depot stays (D20 ★A)

Nothing to build. a2.2 added `v42.depot.hires`, `fork` and `hp` (`Save.js:311-314`). R43 must leave `v42_depot` and these keys alone, and F0 fuzz must pass them through unchanged.

### B11 — Save shape: `v43` block, `BUILDINGS`/`UNIQ`, `types` (plan §6.3; roadmap "one home for v4.3 state")

**What a3.1 has.**
- `BUILDINGS` lacks `labour_office` (`Save.js:48-51`; `UNIQ` `:208`). The hut is **not a site**: it is drawn while `v42_office` is a plot or a foundation. So `chief_hut` only needs adding if a remap ever writes it as a site; recommendation: don't.
- a3's one-time conversions are markers in `progress.flags` (`shop43`, `bakery43`), sanitized as booleans.
- a3 added top-level `flag` (`Save.js:157`) and `bakery` (`Save.js:182`).
- The 자재 창구 still saves under `trade` (`Save.js:180`; runtime `gs.trade = market.mat`, `Game.js:991-995`).

**Missing.**
- `v43 = { lay: 2, toggles: { counters: {}, stations: {} }, seen: {}, refunds43 }` with keep-rules.
- `v43.toggles` booleans accepted from day one, although nothing writes them until v4.4.
- `labour_office` in `BUILDINGS` / `UNIQ`; `types` plots in sanitize.
- Optional: rename `trade` to `market.mat` in the save. Recommendation: keep `trade` (runtime facade) and do not add the plan's `market.back` (the storeroom is deferred).

### B12 — R43 remap, `keepPre43`, `check43`, failure card, Transfer (plan §6; roadmap R43, G8)

**What a3.1 has.**
- `MIGRATE[7]` is a pass-through (`Save.js:136`).
- `migrateSave` breaks on an exception and returns null. `Save.load` then keeps a copy, and the game **starts a fresh village that autosaves over the slot** (`Save.js:549-576`).
- `restoreV3` silently skips sites whose plot id is missing (`Game.js:1058-1070`).
- a3's old-save logic runs *after* sanitize and restore and is keyed on flags: `Progression.shop43()` `:329`, `bakery43()` `:352`, and the bread move in `Game.restore` (banner `Game.js:281`). That is a good marker precedent, but too late for plot remaps.
- `Transfer.js` excludes the backup, bad and move-backup keys (`:16-42`). `dryRun` refuses only `raw.v > SAVE_VERSION` (`:199`).

**Missing (all of it).**
- `remap43(raw)` runs whenever `raw.v43?.lay !== 2`, for v7 and v8 alike, before sanitize. It is idempotent. Its steps:
  - **Workshops (D19).** `MOVE_TYPE_PLOT` = toolsmith / warehouse / cannery / store → their `d_*` plots.
  - **XL plots.** Swap guard: a `big_restaurant` on `w_hall` goes to `w_civic` (or `w_rest` if free); a `town_hall` on `w_rest` goes to `w_hall`. Every fixture has the hall on `w_hall` and the restaurant on `w_rest`, but players were free to swap them; with `only: 'town_hall'`, sanitize would *drop* a restaurant left on `w_hall`.
  - **REPRICE.** A hall or office still under construction at the old price is capped at the new need, and the extra is refunded.
  - **Stage 4.** `seen.mkt_s4 = 'half'` for villages already at 읍.
  - **Marker.** Write `v43.lay = 2` and `refunds43`.
  - **Leave alone.** Moved first houses keep their state (the id carries it); the depot is not touched.
- `keepPre43`: once, never overwritten, excluded from village codes.
- `check43(pre, post)`:
  - Coins: wallet, every till, tax box, bank.
  - Items per kind; buildings per kind; refunds logged.
  - **Runs on JSON, before** a3's runtime converters. The bread move and `shop43` are counted afterwards by the existing bakery checks, not by `check43`.
- Failure card in `UI.js`: copy code / try again / new village. Set `window.__FV_NO_SAVE`; do not start onboarding.
- Settings › 마을 옮기기 offers 「새 단장 전 마을」. `Transfer` reports the same failure.

**Fixtures.**

| Have | Need |
|---|---|
| `v35_*` ×4 | `v35_*` ×4 |
| `v41_*` ×5 | `v41_*` ×5 |
| `v42_save_office_ttal` | `v42_save_office_ttal` |
| `v42_village_late` | `v42_village_late` |
| `v43a2_bread` (= the roadmap's "a2 preview village, no marker") | `v43a2_bread` |
| — | **4.2.0.2 ×3** (fresh after the tutorial with `onb`; ≈ 25 min; ≈ 46 min with `adminUses` / `adminInf`) |
| — | **a3 village (N9)**: v8 + `flags.shop43` / `bakery43` + `flag` + `bakery` slice + built `h43_*` + hut |
| — | 4.2.1 meat-can save |
| — | Designer's village code (plan §13 Q4) |

**Files.** `Save.js`, `Game.js`, `UI.js`, `Transfer.js`, `MovePanel.js`, new `tools/test/save_v43.mjs`, `transfer.mjs`.

### B13 — F0: slice container `x` + keep-rules + save-size gate (roadmap §3)

**What a3.1 has.** Nothing. `sanitizeSave` builds a fresh object from known keys only.

**Missing.**
- `x` with per-key caps: mgmt 256 B, needs 1 KB, daily 512, rewards 512, book 1 KB, mail 512, log 512.
- Trimmed oldest first; never throws.
- Pass-through keep-rules for top-level `missions`, `geumbang`, `haul`, `demand`.
- The size gate: warn at 16 KB, fail at 24 KB.

**Budget note (N8).**
- The econ addendum asks v4.3 F0 to accept `x.money` (896 B) and `x.wk` (1,024 B) (addendum table at `:386`). It puts the whole save at caps at ≈ 22–23 KB by v4.6.
- The 광장 doc §6 wants `fest.*` + `plaza` (≈ 3 KB) "in v4.3's 빈 서랍". That is not budgeted and would cross the 24 KB fail line.
- The a3 top-level `flag` and `bakery` keys count toward the gate too. The largest fixture today is 12.2 KB (`v42_village_late`); a 46-min save is ≈ 6–7 KB.

### B14 — F0s: content level `lv` + newer-save refusal (roadmap §3)

**What a3.1 has.** No `lv` anywhere. `dryRun` refuses only by version number.

**Missing.**
- Write `lv: 43` on every save.
- `dryRun` → `newerSave` when `lv > 43`.
- S1 write guard: compare `max(v, lv)`; keep the stored bytes; no autosave; an "update first" card.
- a3 and older villages carry no `lv`: treat a missing `lv` as ≤ 43.

### B15 — TX texture task (roadmap §3, §4.1 texture)

**What a3.1 has.**
- Area eviction for `bld_buildings`, `bld_buildings_2` and the town pages (`Residency.js:27-44`). Not for `props_buildings`. No v3 atlas split.
- The bakery repack of `props_buildings` saved ≈ 1.3–2.2 MiB (bakery spec B9).
- **Latest a3 measurement** (`scratchpad/v43/a3/s1/texbudget_.log`, 2026-11-11, a3 suite run):
  - full-v4 "any view" must: textures 413.8 MiB (ok);
  - **GL peak 451.8 MiB** (town square +10 s) against the 455 hard gate.
  - Earlier 관망-pan fix runs (`scratchpad/v43/watch/fix/suites4-11`, 2026-11-07) peaked at GL 455.2–461.6 transiently while seated in 관망 at the station.

**Missing.**
- `props_buildings` / `bld_*` area eviction (it must respect 관망 free pan: `Residency` `LOOK_TTL`).
- A split of one 8–11 MiB v3 atlas. Exit: full-v4 GL ≤ 445.
- Order: TX lands before the stage-4 art and before the hall page is resident from ≈ 22 min.
- The graphics presets (a3) do not count: the gate is measured on the default preset.

### B16 — P1 opt-in play log (roadmap §3; Q14 ★; cut line → v4.4)

None of it exists: no module and no production build flag (`version.js` has only `VERSION` / `BUILD_DATE`).

To build:
- Off and hidden in production.
- An export code like 마을 옮기기.
- Tests: APK boot still makes no outbound request; release check that P1 is off.
- Plan-review items: what it records, and the survey notice (the 대표 makes the survey).

### B17 — Letter, 3-tap tour, strings (plan §4.11, §12 item 11, D21)

**What a3.1 has.**
- No `tour43`, `letter43` or `refunds43` code.
- a3 shows a one-off bakery banner for old villages (`Game.js:281` `bakeryUp` / `bakeryMoved`) and the flag maker's one-time card.

**To build.**
- One 「마을 새 단장」 letter with a 「새 지도 보기」 3-tap tour.
- Refund and thank-you lines (D21).
- Stage-4 names and signs; 큰길 names; 「읍이 되면 와요」.
- Recommendation: fold the bakery note into the same letter, so an old village does not get three pop-ups.
- Order on load: letter → flag card → nothing else.

### B18 — Walk targets and balance (plan §4.6, §7.1–7.2)

**What a3.1 has.**
- `v43_layout.mjs` (layout, walks, firstsale and merchant; `--probe`). The M0 baseline in `docs/build_reports/v43_baseline/`:
  - village complete 19.99, 20.0 and 20.66 min;
  - hall built 50.0, 43.1 and 41.9;
  - office built 51.0, 52.3 and 51.6;
  - G1 onboarding 15.0 s and smart 20.78 s.
- a3 numbers:
  - smart seed 1 village complete **21.5 min** (bakery `code_report.md` §4, G2 still ≈ +0.3–0.5 over);
  - onboarding first sale **16.1–16.2 s** (bakery `g1/firstsale.csv`; limit 15.75);
  - smart first sale 21.53 s (limit 21.82, ok).

**Missing.**
- New balance keys: `market43.stage4`, `stage4Old`, `shelfMax[3]`, `spawnMul[3]`; `buildings.town_hall` → 1,200 + 16 + 4. `hut.office` is already there.
- The re-tune list from §7.2.
- **Add the bakery till to the coin round row.**
- Re-measure every walk on a3.1 before tuning.

### B19 — Gates and tests

See §8.

---

## 4. How the a3 additions change the plan

### 4.1 Bakery split (밀밭 · 빵집)

**Shop.**
- Bread is sold only at the bakery stall: `SHOP_FOODS` = fish + meat, stage-3 counters mat · fish · meat.
- The stage-3 trigger is now `hire_hunter` + `firstMeatSale` (D4 → alternative B, already shipped).
- The stage-4 counter plan must be redone (N1).
- The `firstBreadSale` flag no longer gates anything in the shop. R43's "bread chain sold → stage 3 for free" rule became a3's `shop43()` / `bakery43()`. R43 must not repeat it: it is idempotent through those flags.

**Steps and pacing.**
- Two new main steps, `bld_bakery` (150 + 4 planks) and `hire_clerk_bakery` (80), make `MAIN_STEPS` = 17 (`GoalBook.js:22`).
- G2's starting point is a3's 21.5 min, not M0's 20.0.

**Places.** All of these are in the 광장 1 sketch site:
- the cottage (1316, 1144), roof outline up to y ≈ 950;
- the stall (1176, 1169), the queue (1103, 1164 → 1324), the till (1185, 1259);
- LINE (1560, 1056), its label below the pad (a3.2: moved from (1497, 1117); no P2 — 짐꾼 2 and 빵집 2단 take the LINE spot one at a time);
- the field's fenced west side.

They also crowd the 큰길's east half and `d_store`'s south side (N2, N3).

**Roads.**
- `farm_link` is gone; new nodes `bakery_q` and `field_gate`. Plaza ↔ field walks are ≈ 5 m longer.
- The bakery spec calls the x = 990 customer road "큰길" (N7).

**Tills and save.**
- A new till (`bakery`) is on every coin round and on 딸랑이's rounds after 읍.
- A new top-level save key `bakery` counts toward the size gate.

**Vehicles.** `p:bakery` and `p:mail_farm` were re-anchored. Step B must do the same for `p:hall` and `p:mail_east`.

**Tests to keep green.** `bakery.mjs` (layout tolerances: ≥ 75 px from x = 990, every pad ≥ 1.4 m apart, cottage ≥ 1.3 m from the fence, no pad under a roof). Any step-B plot near the bakery re-runs its `--only layout` check.

### 4.2 Village flag + flag poles

- The hall's `flagR` pole carries the village flag (`VillageFlags.js`). Moving the hall changes nothing in the flag code. The flag on the hall becomes visible at ≈ 22 min instead of ≈ 45, a good 읍-venue picture.
- The four decor `flag_pole`s are at (1250, 530), (1345, 2285), (2480, 760) and (−1000, 1520). None sits inside a planned plot.
- The (−1000, 1520) pole stands near the old hall site, which becomes `w_civic`.
- The 한마당's two poles are v4.7.
- The flag maker's one-time card for old villages must not stack with the new 「새 단장」 letter (B17).

### 4.3 Goal status window (목표 창) + tap-to-walk + navigator line

- `GoalBook` reads `STEPS`, `GOALS`, `V42_BUILDS` and side pads, so step B changes the window through data:
  - `town_hall` moves to the first goal after complete, because of the `GOALS` order;
  - the office upgrade becomes a side row (B3; remove it from `V42_BUILDS`);
  - the stage-4 offer appears as a side pad;
  - hidden staff pads disappear from the side rows by themselves (B4).
- Tap-to-walk places become the new plot drop pads. `goals.mjs` and `goals.test.mjs` assertions follow (`goals.test.mjs:46` keeps the 17 main steps; `:55` the v4.2 buildings).
- The navigator line ends at the new pads. Re-run `nav.mjs` and `goals.mjs` after the road changes.

### 4.4 Residents window (마을 주민)

- It reads named villagers, settlers and areas live (`roster.js`). Step B affects:
  - The `green_fire` concert area: the bard's and herbalist's `homeAt` and the 따라가기 target (`residents/data.js:54`, `:69`; `AREA` `:133`).
  - The `hall_clerk` settler job (unlocked at `b:town_hall`): now ≈ 22 min earlier.
  - The +6 beds at the hall: more settlers sooner.
  - The flavour home lines ("대장간 뒤 작은 집" for 준 in `h43_2`, "분수 옆 … 집"): re-read them after the plot table, because the toolsmith moves.
- No save change: identities come from the save id.

### 4.5 HUD relayout, 짐 이름표 (carry pill), 정기 납품 / 업무 / 진도 column

- The 업무 chip already waits for 총총이 (after 읍): unchanged.
- The carry pill's row 2 names the navigator's place and distance. New places need names (stage-4 counters, hall tax box with train cash). Re-run `carry.mjs`.
- 360×640 G6 shots now also cover the right column. Make sure the 「새 단장」 letter and stage-4 card do not overlap it.

### 4.6 관망 free pan + graphics presets

- Free pan lets the camera sit anywhere. TX's area eviction must honour `LOOK_TTL` (`Residency.js:57`).
- The 관망 pan fix runs already touched 455–462 MiB GL transiently. Re-run `watchpan.mjs` with the texture tour after TX.
- Presets: the gate is the default preset; the low preset is a phone fallback, not the TX answer.

### 4.7 Grilled-fish icon, a2.2 depot crew

No effect on step B beyond F0 pass-through of `v42.depot.hires`, `fork` and `hp`.

### 4.8 a3 is on the Play closed test (AAB 4313)

- Testers' Play villages are now partly v8 a3 villages, not only v7 4.2.0.2.
- R43 must be marker-keyed (it is) and fixture-tested on an a3 village (N9).
- An a3 build has no `lv` guard, so a v4.3 village code pasted into an a3 build loads. If it carries train cash in the tax box, the box is clamped (N5).
- F0s protects only from v4.3 onward. Tell testers to update before using codes.

---

## 5. New choices found (no ★ yet) — recommended defaults

| # | Choice | Recommended default | Why / alternative |
|---|---|---|---|
| N1 | Stage-4 counters after bread left the shop | **(A) Three counters: mat (now with the second merchant spot), fish and meat. `shelfMax` 80, `spawnMul` 1.2, open roof. No fourth counter.** | Bread's capacity upgrade already exists as 빵집 2단 (LineUpgrades). Less art and no fourth clerk. Alternative (B): a second fish lane (fish is the busiest food), +1 clerk pad and more art. Tell the designer in the step-B mid preview that 4단 is "자재 · 생선 · 고기" |
| N2 | Where the 한마당 reserve goes (광장 1 ★ kept) and where the work strip goes | **Reserve the village green as the 한마당 site** (a hidden, no-build region): plaza metres ≈ mx 13–24, my −22…−11, ≈ 11 × 11 m, south of the bakery queue and the forest's east corner, north of the zone-gate pads `zone_mine` (760, 1760), `zone_hunt` (1160, 1800) and `hire2_miner` (835, 1800). Keep its props: campfire, seats, picnic table, swing, rink, the future festival furniture. **Move `h43_2` out of it** (the id carries a built house; one letter line). **Move the work strip off it:** `d_wh` and `d_labour` go west (candidate: `d_wh` at the plan's `d_tool` spot (380, 1560), `d_tool` one plot further west near x 30–120 in the start rect, `d_labour` decided at the v4.4 plan with only its land reserved) | The doc's own site (south of the yard, between the first houses) now holds the bakery: ≈ 7 × 4 m is left against 16–20 × 12–14 m asked (the doc also says "2–3 × XL", ≈ 70–100 m²; the green gives ≈ 120–150 m²). The doc's "평소의 한마당" (concert, snowball fights, elders' seats) already happens on the green. Cost: 창고 walks +4–7 m (measure). Alternative: keep the work strip and accept a ≈ 5 × 5 m 한마당, which contradicts ★'s purpose |
| N3 | `d_store` spot | **Move it.** Candidate ≈ (1700, 1030): east of the bakery's LINE pad (1560, 1056; a3.2, no P2), south of the east road, clear of the dog house and the farm's top corner. (L2 final: (1990, 1070) in the east land, its line straight north-west above the LINE pad: at ≈ (1700–1740, 1030) the store's counter sits beside the LINE pad and its line has no room; `e_m1` moved to (2600, 830) to free the store's front pads) Region start up to x 1800; the store opens after `b:cannery` (≈ 38 min), when the east land has long been open | At (1480, 940) it covers the shop's clerk / 눈꽃 시장 / 고기 점원 pad spot (1525, 900) and the dog house (1490, 1000), and pushes the 큰길 into the bakery's yard. Cannery → store stays ≈ 7–10 m. Alternative: keep (1480, 940) and move the shop's east pad spot and the dog house |
| N4 | Hall site (180, 760): the step-A leftovers | **Keep the hall site** (next to the office is the D3 story). Re-place the trash pad + fire (third move), the `beach_w` campfire / bard stage (52, 506) and the fisher hut (300, 470) out of the hall's footprint and from behind its picture. `padvis` the office hire pad (490, 745) against the hall's east wall | All four were moved there by step A after the plan was written |
| N5 | Where the train-carried station cash lives | **An additive `c1.hall.stn` count** (its own pile and label in front of the hall, cap = `v4.rent.cap`). Kept by `sanitizeC1`, no version bump | Raising the `taxCap` clamp also works, but mixes two numbers that v4.4's 세금 날 will want apart. The plan's "no new save data" was wrong: both clamps would lose coins |
| N6 | The plan's grill move (1000, 520) and G1 | **Do not move the grill in step B. Waive G1 for the onboarding bot** (+0.35–0.45 s, 2–3 %, caused by the designer-requested shore landing) and keep the smart-bot G1 (21.53 < 21.82). Record the waiver | (1000, 520) predates the deck crate (1000, 440) and the landing. A move risks the deck lane, `beach_n` and the tutorial views. If a G1 fix is wanted, try the "서서 굽기" pad first (step A measured −0.1 s; not enough alone) |
| N7 | The name 눈꽃 큰길 vs the bakery's "큰길" (the x = 990 customer road) | **Make the x = 990 road part of 눈꽃 큰길** (the street's south branch) | One name for one road network. The designer's sketch already has the street skirting the 한마당's north edge, which is that road's crossing |
| N8 | `x` budget vs `fest` / `plaza` (≈ 3 KB) | **v4.3 F0: data-driven caps plus pass-through of unknown `x` keys within the total. Record that `fest` / `plaza` are not budgeted.** The v4.7 plan puts them in a side key or raises the gate | v4.6 is already at ≈ 22–23 KB against the 24 KB fail line |
| N9 | An a3 fixture | **Add `v43a3_village.json`**: an a3.1 export at ≈ 30 min with the bakery built, flag set, `h43_*` built and the hut | a3 is on Play and in the preview app |
| N10 | Vehicle anchors | **Edit `vehicles/layout.js` `p:hall` → `hall_front`, and `p:mail_east` if `east_link` moves** | The bakery split already set the precedent; the guardrail line in plan §5 gets an exception note |
| N11 | What the office does before 읍 | **Keep ★ (side goal at ≈ 16).** The card copy says "촌장님 사무실 (직원은 읍이 되면 와요)". The hut desk becomes the 관망 office spot; letters / news wait for 소복이 | The ledger is v4.4 and staff come after 읍, so without a clear card the 400 coins buy looks only |

---

## 6. Plot table v2 (proposal; confirm every row with `v43_layout.mjs --probe` and `padvis` before code)

| Plot | Plan v1 | Proposal v2 | Notes |
|---|---|---|---|
| `v42_office` | (600, 640) M, `chief_hut` → `chief_office`, after — | Same spot, **`after: 'zone_mine'`**, side card, price `hut.office` | Today `after: 'b:town_hall'` |
| `w_hall` | (180, 760) XL, `after: 'hire_hunter'` | Same, `only: 'town_hall'`, region start, `drop` + `clear` front square | N4 clean-up first |
| `w_civic` (new, Q25) | — | (−780, 1880) XL, **hidden**, no menu | Old `w_hall` footprint; R43 may park a swapped restaurant here |
| `w_rest` | Unchanged | Unchanged (`big_restaurant` only in practice) | Block the hall here once `w_hall` has `only` |
| `d_tool` | (380, 1560) M, after `r:east` | ≈ (60–120, 1580) M, or keep (380, 1560) if N2 leaves it outside the reserve | The igloo moves |
| `d_wh` | (740, 1560) M, after `hire_hunter` | **(380, 1560) M** (N2) | Off the campfire and seats |
| `d_labour` | (1220, 1610) L, after `b:warehouse` → roadmap `f:rankEup`, hidden | **Land only reserved; position fixed at the v4.4 plan** (west strip near `w_m1` / `w_s2`, or south of `d_wh`) | Today's spot is `h43_2` + picnic table + the 한마당 |
| `d_cannery` | (1560, 580) M, after `boat_rowboat` | Nudge ≈ +40 px east or move the snow fort; `pads: { line, p2, mcan }` | Playground area at the edge |
| `d_store` | (1480, 940) M, after `b:cannery` | **≈ (1700, 1030) M** (N3). L2 final: **(1990, 1070) M**, region `east`, its line straight north-west above the bakery's LINE pad (1560, 1056) | Off the shop's pad spot and the dog house; L1's (1740, 1030) put line places 1–2 on the LINE pad (a3.2) |
| `d_school` | (−930, 640) M | **XL** (Q25), hidden sign | One cuttable pine + a crate inside |
| `d_clinic` | (−1160, 870) M | **L** (Q25), hidden sign | Two pines + two stumps inside; west edge 59 px from `WORLD.left` |
| `h43_1` | (640, 1040) S | (600, 1040): already | — |
| `h43_2` | (1340, 1050) S | **Out of the 한마당 reserve.** Candidates: by its own tents in the south camp (1260, 2370), or the reserve's south-east corner if the reserve shape allows | a3 put it at (1110, 1600); a built house moves with the id |
| `p47_plaza` (new, 광장 1) | — | **Hidden reserve region** ≈ plaza m X 13–24, Y −22…−11 (N2); no trees, decor, plots or pads may be added inside (`v43_layout` check) | Existing green props stay |
| `e_m1`, `e_m2`, `s_m1`, `s_m2`, `w_m1`, `w_m2`, … | Unchanged, `types` allowlist | Unchanged; `types: ['house_*', 'deco_*']` (+ `br`, `care_*` later). **L2: `e_m1` moves (2040, 1190) → (2600, 830)** (id, size, region and `types` kept): the store at `d_store` (1990, 1070) has its register pad (2078, 1210) and clerk pad inside the old `e_m1`. `e_m1.pads` (line = p2 at −310, +40) keep an old village's toolsmith pads off `e_m2`'s line pad until R43 moves it to `d_tool`. Its build pad sits at `drop` (2750, 880), right of the plot: the default spot in front, (2602, 917), lies behind a building on `e_m2` (20 of 29 pad points covered by a house, 25 by a cannery) | The `MENU` reads `types`. A house an old village built on `e_m1` moves with the id |
| `v42_depot` | Unchanged (D20) | Unchanged | — |

---

## 7. Files touched (step B on top of a3.1)

| File | What |
|---|---|
| `src/data/world.js` | plot table v2, `types`, reserve, `v42_office` after / side, `w_hall` move, `spine43` street + nodes, `w_office` removal, decor cuts and moves (`'hall'`), trash / beach / fisher-hut re-placement, concert area, `d_cannery` pads |
| `src/data/balance.js`, `balanceCheck.js` | `town_hall` price, `market43` stage-4 keys, (N5) `hall.stn` cap |
| `src/data/strings.js` (+ goals / residents strings) | stage-4 names, 큰길, office side card, 「읍이 되면 와요」, letter / tour, refund / thank-you, failure card, update-first card |
| `src/systems/Progression.js` | `GOALS` order, `BUILD_UNLOCK`, `mkt_s4` step, bank guard, `freePlotFor` with `types` |
| `src/systems/Civic.js` | `MENU` / `types`, big-plot reservation, hall-build decor call |
| `src/systems/office/Office.js`, `src/scenes/OfficePanel.js` | staff after 읍, 직원 tab text |
| `src/entities/Site.js` | `buildCost` for the office upgrade |
| `src/entities/Seller.js` | stage 4 counters, second merchant spot, `SHOP_STAGE_MAX` |
| `src/entities/TownHall.js`, `src/systems/Growth.js` (or a Rail listener), `src/systems/VillageNews.js` | station cash by train, stn pile |
| `src/systems/Rank.js`, `src/scenes/Game.js` | stage-4 offer at the ceremony, `restoreV3` order with remap, failure-card boot path |
| `src/systems/Tutorial.js`, `src/systems/goals/GoalBook.js` | side card for the office, `V42_BUILDS`, `plotFor` with `types` |
| `src/systems/VillageLife.js`, `src/systems/residents/data.js` | concert spot, `homeAt` |
| `src/systems/RoadPaint.js`, `RoadNet.js`, `Roads.js`, `Territory.js` | the street |
| `src/vehicles/layout.js` | `p:hall`, `p:mail_east` (exception to the guardrail, N10) |
| `src/core/Save.js` | `v43` block, `BUILDINGS` / `UNIQ`, `types`, `remap43`, `keepPre43`, `check43`, F0 `x` + keep-rules, `lv`, `sanitizeC1` (N5) |
| `src/core/Transfer.js`, `src/scenes/MovePanel.js`, `src/scenes/UI.js` | `newerSave` by `lv`, pre43 exclusion and offer, failure card, update-first card |
| `src/core/Residency.js`, `src/core/Assets.js`, art packing | TX |
| new P1 module + build flag | P1 |
| assets: `market_s4_*` | stage-4 art (N1: three counters) |

**Not touched:** `DepotSystem.js` / `DepotBuilding.js` (D20); `Bakery43.js` (only re-checked); the story, missions, bank, harbour, beach and city modules.

---

## 8. Gates and tests for step B (updated for a3)

- **G1** — Onboarding bot ≤ 15.75 s is waived (N6, recorded); smart bot ≤ 21.82 s (a3: 21.53).
- **G2** — Village complete ≤ baseline + 1.0. Today a3 is at 21.5 against ≈ 21.0–21.2: fix that first (E4). Also 읍 ±5 % with D3 + the hall earlier + the office earlier. Office ≈ 16 and hall ≈ 20.5 are reported.
- **G3** — `fresh25` + pacing bots; per-step income bands. Includes the hall ≈ 22 min earlier and 1,200 cheaper, staff after 읍, train cash, and the bakery's own customer stream.
- **G4** — `lgx_l0.mjs` + merchant ceiling. Stage-4 second merchant spot measured separately.
- **G5** — Suites:
  - plan list: `padvis` per stage (1–4), `onboarding`, `save_v43`, `stuck`, `nav`, `smoke`, `v42`, `plots`, `restaurant`, `transfer`, `meatcan`, `cans.test`, `ledger.test`, depot tests, `ghostsweep`, `texbudget`;
  - **plus the a3 suites:** `bakery.mjs`, `goals.mjs` / `goals.test.mjs`, `residents.mjs` / `residents.test.mjs`, `flag.mjs` / `flag.test.mjs`, `carry.mjs`, `watchpan.mjs`, `perf_presets.mjs`, `pilot.mjs` / `pilot.test.mjs`, `market43.mjs`, `deck.mjs`;
  - **plus** `v43_layout.mjs --only layout` with the v2 probes and the 한마당 reserve check.
- **G6** — 360×640 and 412×915 plaza shots, day and night, ko and en, stages 1–4. The bakery stall, queue and right HUD column are in frame. Clerk ≥ 75 % visible with the front customer present.
- **G7** — Plaza draw calls and display objects: three shop lines + merchants + the bakery queue + flag poles; 10-min soak.
- **G8** — Forced throw and failed `check43` on every fixture, including **a3** and **4.2.0.2** (N9): `SAVE_KEY` byte-identical for 60 s, card shown, Transfer rejects.
- **Roadmap extras:**
  - newer-save refusal (`lv` 46 shape);
  - F0 fuzz + same-level pass-through;
  - size gate (warn 16 / fail 24 KB, with `flag` + `bakery` counted);
  - a2 fixture remap once and then a no-op;
  - P1 round trip, no outbound request, off in production;
  - TX exit: full-v4 GL ≤ 445, texture tour at 0, 12, 20.5, 26 and 45 min plus the 관망 pan tour.

---

## 9. Effort and order (rough, one builder; art in parallel)

| Work | Roadmap plan (d) | a3 delta (estimate) |
|---|---|---|
| Plot table v2 + layout probes + roads / 큰길 + decor + conflicts | in "step B 9" | **+0.75–1** (bakery / green / h43_2 / store re-solve, N2–N4) |
| Office side + staff gate + hall move / reorder / price + ceremony offer + train cash | in step B | +0.25 (N5 save key, goal / residents window follow-ups) |
| Stage 4 | in step B (1 + art 0.75) | ±0 (three counters: less art, re-plan) |
| Migration track: `v43`, R43, `keepPre43`, `check43`, card, Transfer, fixtures | 0.75 (R43) + 3 (plan B) + 0.5 (4.2.0.2 fixtures) | **+0.5** (a3 fixture and shape, XL swap guard) |
| F0 / F0s | 1.75 / 0.75 | ±0 |
| TX | 1.25 | ±0 (must land first) |
| P1 (cut line) | 1.75 | ±0 |
| Q25 + 광장 1 | 0.25 + 0.5 (outside 19–22) | — |
| Vehicles anchors, residents data, goal-window rows, carry place names | — | **+0.5** |
| Gates incl. G3 / G7 | 2 | +0.25 (more suites) |
| **Total** | 19–22 (+0.75 for Q25 / 광장 1) | **≈ 21–25** |

**Suggested order.**
1. Re-measure G1 / G2 on a3.1 and fix the village-complete regression.
2. TX.
3. F0 → F0s → `v43` block + R43 skeleton + a3 / 4.2.0.2 fixtures.
4. Plot table v2 with probes (N2–N4), then roads and the street.
5. Hall move / reorder / price, office side card, staff gate.
6. Train cash (N5).
7. Stage 4 (art in parallel since step 2) + ceremony offer.
8. Meat-can re-measure.
9. Letter, tour and strings.
10. P1 (or cut to v4.4).
11. Gates.

---

## 10. Not verified

- All placement findings are coordinate arithmetic on `world.js` point anchors and plot diamonds, not `v43_layout.mjs`. Building art extents, roof outlines and pad label boxes were not measured; only the bakery's comes from its spec.
- The proposed spots in §5–§6 (`d_store` ≈ (1700, 1030), the 한마당 reserve rectangle, `d_wh` (380, 1560), the `h43_2` candidates) are untested candidates.
- Pacing and G1 numbers come from the bakery branch reports (seed 1–2) and the M0 baseline, not a fresh a3.1 run.
- Texture numbers come from the a3 suite log of 2026-11-11 and the watchpan runs of 2026-11-07. No a3.1 run exists.
- Whether Play testers actually installed AAB 4313 (a3) was not checked. The roadmap says the closed test started with that build.
- The effort deltas are estimates (±30 % as in the roadmap).
