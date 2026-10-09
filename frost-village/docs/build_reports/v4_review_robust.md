# v4 review:robust

## v4 review (robustness, performance, save and deploy): critical bug found, do not ship yet

The save system and the soak are solid. But one critical bug shows on every reopen once the station is repaired, so v4 is not ready to show the designer. That bug needs a small fix in `Neighbours.js` and a test that reloads the page. Several perf and memory targets are also missed, plus some deploy headroom issues.

Scratch folder used below: `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v4_review_robust/` (scripts are in `scripts/`). All game runs used the fixed-step clock on SwiftShader.

### Critical

**C1. Reopening any save with the repaired station shows brown placeholder boxes for the rail strip and the whole town, for the whole session.**
- **What breaks:** our station 서리역, the town station, all 33 town buildings and props, and the 5 founded shops.
- **Data also missing:** anything that comes from the town manifest. 22 buildings have no door point, the road network has no door spurs, collision uses default sizes, and loop animations don't start.
- **Repro:**
  1. Seed `frostVillage.save.v1` with `seed_v35_station.json` (the real v3.5 38-minute fixture plus `sites.r_station = {b:'station', st:'done'}`).
  2. Load the page in a fresh browser and tap start.
  3. Result: `nb.ours.img.texture.key === 'ph__train_station'`, 33 of 33 buildings use `ph__*` textures, 23 placeholder warnings.
  4. With the full v4.1 save (`fuzz_c1_golden.json`) there are 29 warnings, including cafe, restaurant, carpenter_workshop, hardware_store and supermarket.
  5. Same result on the artifact build (`dist/artifact`). Nothing re-skins after 60 s or after walking into the town. Logic keeps running: no errors, autosave works.
- **Evidence:** `v4load_station_dev.jpg`, `v4load_town.jpg`, `v4load_town_dist.log`. Scripts: `scripts/v4load_check.mjs`, `scripts/v4load_town.mjs`.
- **Root cause (stack captured in `scripts/ph_debug.mjs`):**
  - `Game.restoreV3 → Site.finish → Game.makeBuilding → Neighbours.stationBuilt()` runs `if (!this.ours) this.onTownManifest();`. This happens during `Game.create`, before the late `town` manifest has been fetched.
  - `onTownManifest` sets `ready = true`, so the real manifest callback that arrives later returns at once.
  - `Assets.sprite` caches a `ph__` placeholder for keys it doesn't know yet. `TownBuilding` and `RailStation` only queue a lazy re-skin for keys that are pending, so these are never re-skinned.
- **Fix direction:** in `stationBuilt`, defer when `Assets.fragments.town` is not loaded yet. Let `onTownManifest` open the station when the manifest arrives, and have the returned object look up `this.ours` lazily.
- **Why tests missed it:**
  - `save_v4.mjs --browser` passes, but its page reloads never check `__FV.warnings()`.
  - In-session tests and screenshots never reload the page.
  - BUILD-B noticed the roughly 30 warnings but blamed them on `src/title`. They come from the Game scene.
- **Suggested test:** add `warnings().length === 0` after `boot(saved)` in `save_v4.mjs`.

### Medium

**M1. Leaving and returning to an area re-downloads and re-uploads a lot of art.**
- One village ↔ town round trip (about 80 game seconds) fetches about 80 files and 16–17 MB on the artifact build (WebP). On the dev build (PNG) it is about 125 files and 54–55 MB.
- In the 20-minute soak, Residency loaded about 39 pages per game minute (774 in total). Most come from residents' social pages being evicted and reloaded, plus area eviction.
- Data use depends entirely on the host's HTTP caching, which I could not check. Even with caching, each reload means a decode and a GPU upload.
- Evidence: `misc_robust_rt.json`, `misc_robust.json`, `soak_c.json` (`tex.loads`).

**M2. One failed download of an evicted page breaks that page for the whole session.**
- Repro (`scripts/misc_robust.mjs`, part B):
  1. Full v4 village. Go to the town, back to the plaza, then to the town again while `/town_civic\.rest\./` is aborted.
  2. Remove the block and stay in the town for 60 s, then do a full village/town cycle.
- Result: `Assets.failed` still contains `town_civic@rest`, the texture never exists again, and the big square building is a giant placeholder box (`misc_town_after_failed_fetch.jpg`).
- Cause: `fileDone()` treats failed keys as done, so `queueAssets` never queues them again. Combined with M1's fetch volume, a single network glitch on a phone is enough.

**M3. The "no upload over 8 MiB" gate is broken in more places than reported.**
- BUILD-B said town pages are at most 5 MiB. In fact `town_civic@rest` is 1792×1728 = 11.8 MiB and is uploaded again on every town approach.
- Others uploaded again during play: `bld_buildings` 10.7, `bld_buildings_2` 8.9, `tf_head_0.soc` 8.0, `town_shops@a` 8.0 MiB.
- Also over 8 MiB: `props_buildings` 11.0 at boot, and the title bakes `ttl_3_0` and `ttl_4_0` at 8.9 each.
- Seen by the GL probe in `soak_c.json` (the `gl.big` field).

**M4. Texture memory: the targets are missed, the hard limit holds.**

| Measurement | Result | Limit |
|---|---|---|
| Full v4.1 village, in session (source-sum) | 322–370 MiB | target 300 missed |
| Same, GL including screen buffers and water | 358–407 MiB | must 455 holds |
| Fresh load of a full v4 save, 8 s into the village | 343.8 MiB | target 300 missed |
| Title, first visit | 106–117 MiB (GL 162–166) | must 90 |
| Title, stage-2 save | 151.2 MiB | must 90 |
| Title, 읍 save | 124–134 MiB | must 90 |

- Residency stays above its hard budget the whole time (`budgetEvents` = 1).
- The title figures fail the plan's "must" column, though the title is not the game's overall memory peak.
- Evidence: `soak_c.json`, `title_mem.json`.

**M5. Display objects and logic time are over their gates, now at the plaza too.**
- Display objects: 2,635–3,251 in every view of a full v4.1 village, including 2,710 at the plaza (gate 1,700; BUILD-B measured 1,572 at the plaza).
- There are 30–50 townsfolk visitors in our village at once, and the doll pool grows to 120–142 rigs (plan: up to 32 full + 40 lite).
- Logic per step, median: plaza 1.7 ms (gate 1.6), town at noon 1.6–1.8 ms (gate 2.1). This was on a loaded machine.
- Per-system cost per step: v4 update 0.42–0.82 ms, civic 0.12–0.16 ms. Water and voices are negligible.
- Evidence: `perf_c.json`.

**M6. The artifact package has almost no headroom.**
- 501 of 511 files per version; BUILD-C2 added 30.
- Two publishes: 250 files plus the page (45 MB), then 250 files (17 MB). Each is within 255 files and 64 MB.
- The build's own size check applies 64 MiB to the whole package, and it is at 59.5 MiB.
- Any new fragment (for example v5 vehicles) will fail the build.

**M7. The documented `--inline` fallback no longer works.**
- `dist/artifact_inline` dates from Oct 7, with a 178 KB `game.js` (pre-v3).
- A v4 inline build would be about 80 MB of base64. That fails the 64 MiB check, and the page would have to download everything before it boots.
- `tools/build/README.md` still recommends it for "grey boxes / stuck loading".

### Low

- **L1. `test_deploy`: standalone FAIL, sameorigin PASS.**
  - The only failing check is "MISSING textures ttl_logo_*". The weak-GPU resolution drop in `main.js` (which now also watches the Title scene) restarts the title about 6 s after boot (`TitleScene` resize handler).
  - The restart releases and re-fetches all title textures and forces `intro = false`, so on weak phones the first-visit intro is cut short.
  - The probe (`scripts/logo_probe.mjs`) shows the logo textures at 0 at title + 3 s and back at + 8 s.
  - Everything else passes in both modes: water, voice manifest, `chat.js`, reload persistence, no failed requests.
- **L2. A few items are lost on every reload of a busy village** (`reload_ledger.json`: 14 random reloads plus one mid-ceremony).
  - Labour piles are capped at max + 8 = 48 on load (logs 59 → 48).
  - Toolsmith plank input 12 → 8, big fish in the dock 18 → 15, market cooked fish 42 → 40.
  - The miners' food box drops by 5 right after loading.
  - `v4.rentAcc` is saved but never restored (`Growth` resets `rentFrac` to 0), losing up to about 14 coins per reload.
  - The mid-ceremony reload is correct: 14000 paid once, rank 2 kept, rewards applied.
- **L3. Corrupted or inconsistent saves:** 31 v4.1 variants plus the 20 v4 shapes in `save_v4`. None crashes, none moves the save aside, autosave keeps working (`fuzz_c1.json`). Gaps:
  - No per-plot check: two town halls, a hall on a small plot, or a station on `w_hall` are all accepted.
  - Unknown home ids in `v4.town.extra` cause one `TownSim.takeSpot` TypeError, then play continues.
  - A shop saved on the wrong lot, or the designer editing `founding.lots`, blocks that shop's founding.
  - A truncated save is copied to the backup slot, but nothing in the game can restore it (same as v3.5).
- **L4. Publish order:** `index.html` (with the new fragment list), `chat.js` and `title_bake.json` go out in the first batch, before `game.js`. Between the two publishes, an open page mixes new and old files.
- **L5.** Publish v4 as an update to the designer's existing artifact link. A new link has a different origin, so her saved progress would not be there.

### What passed

| Area | Result |
|---|---|
| Migrations v1 → v6 | Node tests pass; `save_v4 --browser` PASS |
| Reload mid-train / mid-founding / mid-ceremony | Correct |
| 20-game-minute soak, full v4.1 village (rank 읍) | 0 errors; heap after GC 36.2 → 39.7 MB (+0.6 MB over the last 10 min) |
| Soak stability | Tweens 4–18, timers 0–7, sounds 4–7, animation listeners flat at about 2,500–2,860 |
| WebGL context lost and restored | Water rebuilds, 0 errors |
| Full v4.1 save size | 5.5 KB |
| First visit, artifact, emulated 4G, cold cache | 10.46 MB / 261 requests before the title, title at 14.1 s (v3.5: 12.2 MB / 174 requests); 23.2 MB / 493 requests after 20 s in the village; 185.8 MiB of textures |

### Files changed

I edited `tools/build/test_deploy.mjs` only, adding an `FV_DEPLOY_SHOTS` environment override for the screenshot folder.

Files are in `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v4_review_robust/`:
- Results: `soak_c.json`, `perf_c.json`, `reload_ledger.json`, `fuzz_c1.json`, `misc_robust.json`, `title_mem.json`, `firstload_art_4g.json`
- Deploy test output: `deploy/test_deploy.log`
- Screenshots: `v4load_station_dev.jpg`, `v4load_town.jpg`, `misc_town_after_failed_fetch.jpg`
- Repro seeds: `seed_v35_station.json`, `fuzz_c1_golden.json`