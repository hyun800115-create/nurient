# review:robust

# v4.2 CODE-1 independent review: robustness, saves, performance, visuals

**Verdict: the code is safe to continue to CODE-2, but not to publish yet.**
- Saves are robust. Six real old saves and 46 fuzzed saves loaded with 0 crashes, 0 page errors, and no save ever moved aside. The 6→7 migration loses nothing compared with the v4.1 build, apart from the designed dock-cargo cap. The new coin and goods flows (courier, sleigh, exports) keep their totals across reloads.
- Three High problems must be fixed before publishing: the version file limit, depth order inside the cutaways, and texture memory. Two cheap save-loss bugs and some lower items follow.
- How I measured: v4.1 is rebuilt from commit `65c39f3` in my scratch folder. Every comparison ran in the same browser at the same time as v4.2, on the fixed-step clock. The machine load average was 16–27 throughout, so timings are indicative only; texture, draw-call and object counts do not depend on load.
- Scratch folder: `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v42code_review_robust/`. All evidence files named below are in it. No repo files were changed.

## High

**H1. The v4.2 publish will go over the 511-files-per-version limit.**
- The designer's v4.1 link must be updated in place to keep her saves.
- On an update, files left out are kept.
- **Numbers:**
  - v4.1 published 491 supporting files (rebuilt from `65c39f3` with the same `build_artifact.mjs --webp`).
  - v4.2 has 387.
  - Together they make 512 distinct paths plus the page, so already 513 with CODE-1.
  - CODE-2 adds about 30 more art files, giving about 545.
- **125 v4.1 files are now stale:**
  - audio one-shots: 69 (`audio` 36, `audio2` 24, `audio3` 9)
  - portraits: 53 (`villagers*`, `workers`, `characters`)
  - train `.ne` pages: 3
- Neither `build_artifact.mjs` nor `artifact_files.json` lists them for removal with `null`, and the publish note does not mention it.
- **Fix:** emit the list of stale paths (previous published list minus the current one) and send them as `null` in the first batch.
- **Evidence:** `v41/frost-village/dist/artifact_files.json` compared with `/home/user/nurient/frost-village/dist/artifact_files.json`.

**H2. Depth order in the cutaways is wrong for everyone except the staff.** The chief vanishes inside, the courier appears pasted on the closed facade, and the tellers are hidden.
- `Cutaway` gives every layer the depth "anchor y + 0.01 × layer index". The tellers use `slotDepth('@behind')`. The chief, the courier and the depot buyers keep depth = their own y.
- `floorLiftPx` (18) is read in `Cutaway.js:25` but never used, and the manifest's `pointSlots` rules (counter = `@front`) are ignored.
- **Repro** (`cutaway.mjs`, 46-min save, office + bank + depot built):
  - Chief at (−380, 525), the back half of the bank: depth 525, below `bank_floor` (570). He is completely invisible; only his star pin floats above the roof (`crop_cut_bank_back_half.png`).
  - Chief at (3184, 2981) inside the depot: depth 2981, below the floor layer (3101.03). He is invisible (`cut_depot_inside_back.png`).
  - Courier at the counter with the bank closed: depth 578.06, above the shell layer (570.08). He is drawn on the facade with his "6190" label (`courier_closed_bank.png`).
  - Tellers at depth 570.036–570.038 sit under `bank_front` (570.05). Only their red hats show behind the counter, and they look like stools. Lifting them to the top depth shows they exist (`teller_strip.png`).
- This is the designer's request #4 ("안이 보이게, 일하는 모습도"). CODE-2's office cutaway will be built on the same `Cutaway`, so fix the class:
  - slot every character whose foot is inside `revealPoly` (`@front`, or `@behind` for staff points);
  - apply `floorLiftPx`;
  - hide anyone inside while the building is closed.

**H3. The bank, depot and sleigh textures are never released, and the late village goes over 455 MiB.**
- `Residency.js` has no `office`, `bank` or `depot` areas, and none for the inside pages (plan §13.2).
- `tex_probe.mjs`: after one visit to the depot and 90 s back at the plaza, these stay loaded, 35.5 MiB in total:

| Page | MiB |
|---|---|
| `civ_bank` | 5.02 |
| `lgx_center_a`–`d` | 23.40 |
| `veh_cargo_sleigh` | 6.74 |
| `lgx_items` | 0.34 |

- Residency is over its hard budget and refused 46 on-demand resident pages in about 2 minutes, so residents fall back to plainer animations.
- `perf_cmp.mjs`, same save and same tour, v4.1 at 읍 compared with the late v4.2 village (Residency source-sum):

| View | v4.1 | v4.2 | Change |
|---|---|---|---|
| Plaza | 383.8 | 424.1 | +40 |
| Plaza after the tour | 373.4 | 424.0 | +51 |

- In the late village the GL textures are 427 MiB, plus 33.7 MiB of render targets (v4.1: 30.0).
- 관망 soak (`soak_v42_pilot.json`): GL textures alone peak at 462.8 MiB, over the 455 must, still with placeholder art.
- The new plain migrated save is already +11 MiB at the plaza, of which 4 MiB is the `fv_stackbake` render target.
- CODE-2 art adds more, so the eviction areas are needed before then.

## Medium

**M1. A partial payment on a staff hire pad is lost on reload.**
- `Office.js:45` reads `s.hirePaid`, but `serializeInto` (`Office.js:298`) never writes it and `sanitizeV42` would drop it anyway.
- **Repro** (`reload42.mjs`, scenario E): 168 of 900 paid toward 총총이, then a reload. The pad shows 0 paid and the coins are not returned, so 168 coins are lost. Up to 899 can be lost per reload.

**M2. Goods in porters' hands are lost on reload. One cause is new in v4.2; the other is an old one that v4.2 makes worse.**
- **Raw goods (new):** the CODE-1 raw-surplus flows put raw goods in the hands of ordinary porters:
  - the 창고 porters carry raw from full piles (`Worker.js:713`);
  - the station porters carry raw surplus to the dock (`Worker.js:886`).
- `Game.serialize` saves such a load into the warehouse (`Game.js:1899`). `Warehouse.restore` skips anything it doesn't accept (`Warehouse.js:164`), and log, wheat, ore and raw meat are not accepted, so the load disappears.
  - Seen: 12 ore lost (`reload42.log`, dwell round); 10 wheat lost (`mkt_probe_v42.json`, round 4).
  - The same porters can also stand at the 창고 unable to unload until a station input frees up.
- **Food (amplified):** food heading to the restaurant pantry, the order-card dock, or a shelf with little room (F3 sends a full load when the shelf wants just 1) is all counted as market stock (`Game.js:1895`). The shelf then clamps to 40 on load. With F1 keeping shelves full, the clamp hits much more often. Same save, 6 reloads each:

| Build | Food lost | Other |
|---|---|---|
| v4.1 | 35 | — |
| v4.2 | 75 | plus 10 wheat |

- **Fix:** save each load to its real destination (pantry, `v4.cargo`, `v42.freight.dock`, pile), or back to its source.

**M3. After any reload, all office and bank staff are the same fallback villager sprites.**
- `staffLook()` (`Staff.js:23`) runs when the staff are created on restore, before the townsfolk manifest has been merged, and the look is never refreshed.
- `looks_probe.mjs`, save with 4 staff + bank:

| Group | Looks right after boot and still 45 s later |
|---|---|
| Office staff | `npc_clerk_a` ×2, `npc_porter_a`, `npc_clerk_b` |
| Bank | `npc_clerk_a` ×3 |

- The saved seeds are unused. CODE-2's officefolk swap will never appear after the designer reopens the game unless the staff re-skin when the manifest arrives.

**M4. More draw calls than v4.1; the plan claimed 0 extra.** `perf_cmp.json`, per drawn frame:

| View | v4.1 | v4.2 |
|---|---|---|
| Plaza (plain save) | 15.8 | 18.6 |
| Late village, zoom 0.6 | 21 | 25.8 |
| Station | 13 | 15.6 |

- Texture binds rise by 30–64 per frame.
- Likely cause: each generated `fv_*` canvas is its own texture. The CODE-2 `v42_core` page should help; re-measure then.
- Display objects improved: plaza 1,193 against 1,681; late village 1,648 against 2,030. At zoom 0.6 the late village is 1,838, just over the 1,700 gate.

**M5. Logic time is probably over budget, but the measurement was noisy.**

| Measure | v4.2 late | v4.1 at 읍 |
|---|---|---|
| Median ms per tick, 4 interleaved batches | 2.0–2.3 | 1.4–1.7 |
| `V42.update` alone (self-reported) | 0.16 | — |

- That is about +0.6 ms against the +0.25 budget. Most of the extra is outside `V42.update` (porter rules and scoring are likely).
- Re-measure on a quiet machine in CODE-2.

## Low
- **L1.** The nav edge badge is clamped to y ≥ 200 logical (`UIv42.js:206`), so it sits on the left HUD chips ("32/32", order chip) at both 390×844 and 360×640 (`screens_v42/05_loop_curve`, `17_depot_revealed`, `hud_en_sheet.png`).
- **L2.** The office stand-in reads as broken. It is a log house; the "촌장 사무실" sign floats about 70 px above the chimney and crosses the HUD chips at 360×640. The desks are crates in the snow and the staff are clones. CODE-2 replaces it.
- **L3.** Several counters reset on every reload:
  - the depot's daily sales (`v42.depot.sales` is saved but never restored: `salesSaved`);
  - the office income bars;
  - `VillageNews.bankDay`, so the banker letter needs 3 game days without a reload;
  - the letter trigger timers.
- **L4.** Canvas mode (WebGL disabled, `canvas.json`): 0 errors, renderer type CANVAS, pile baking works (485 bakes). Without tint support, the office panel's active and locked tab tints, the nav chip's "nowhere" tint, and the coach's sky tint are lost; the stand-in coach then looks like a red continuation of the engine.
- **L5.** `V42.update` (`V42.js:123`) has no per-system try/catch, so an exception in any v4.2 system stops `Game.update` and shows the crash card. `afterRestore` does catch.
- **L6.** English: all 816 keys are present, with no Hangul (apart from the deliberate Korean title subtitle) and no placeholder mismatches. One wording issue: the letter button "I'll keep watching" (`lt_baker_b2`) reads as 관망 / watch mode.

## What passed
- **Real-save migration** (`mig_real.mjs`, each save loaded in both builds): five v4.1 saves (smart 25/46, pure 25/45 min) and the v3.5 38-min save.
  - No v4.2-caused loss; the dock cargo is capped to 112 as designed.
  - "새로워진 것" shows; no placeholder warnings; reload round-trip clean.
  - The 35-min save was not run in this harness; the existing `save_v42 --node` suite covers it.
- **Reload in each new state** (`reload42.mjs`):

| State | Result |
|---|---|
| Courier carrying coins | Wallet + tills + sack 15,494 before = 15,494 after; deposits afterwards |
| Train dwelling with surplus aboard | Exports paid once (6 ore → +3 coins) |
| Train mid-loop | Restarts dwelling at the town station (same as v4.1) |
| 관망 on | Off after reload, chief not moving |
| Sleigh loaded | Load returns to the dock, 206 = 206 items |

  Save size is 7.8–8.4 KB, under the 10 KB gate.
- **Browser fuzz** (`fuzz42.json`): 16 inconsistent save shapes plus 30 random mutations ran. No page errors, no broken or moved-aside save, bank and logistics slices stable.
- **10-minute soaks, tour mode, v4.1 and v4.2:** 0 errors; textures, listeners, animations, tweens and timers bounded; heap growth similar in both builds.
- **8-minute 관망 soak:** 0 errors, bounded apart from the texture peaks in H3.
- **WebGL context loss and restore:** baked piles intact. The first run's screenshot timed out under load; the rerun passed.
- **관망:** a zoom-button tap keeps it on; a tap on the village hands control back. The game pauses while the resident chat is open, so 관망 cannot auto-start mid-chat.

## Not caused by v4.2 (also seen in the v4.1 build)
- The food box loses 3–7 items to its 20-item clamp on reload.
- Town visit counts ("regulars") gain 1 on reload in both builds.
- "Texture key already in use" console errors appear on Game-scene restarts.