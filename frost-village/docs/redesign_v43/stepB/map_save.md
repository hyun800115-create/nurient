# v4.3 step B: save and migration map

- **Tree read:** `scratchpad/hud_wt/frost-village`, branch `local/v43-hud`, HEAD `12d598f` (v4.3.0-a3.1). It was read only; nothing was edited. One read-only `node -e` import of `src/core/Save.js` was run to confirm G-4 below.
- **Paths:** repo-relative (`src/core/Save.js:41`). Doc paths are relative to `docs/`.
- **Decision rule:** every open question takes its ★ answer, and the answer is recorded in §3. Choices that no document covers are marked **N1 to N13**. Each one takes the most lossless option.

---

## 0. Summary

1. **Today:** `SAVE_VERSION` is 8 (`src/core/Save.js:41`) and the migration chain ends at `MIGRATE[7]` (`Save.js:136`, which only changes the number). None of the roadmap's save foundation exists yet: there is no `lv`, no `v43` block, no `x` container, no keep-rules for `missions`, `geumbang`, `haul` or `demand`, no `remap43`, `check43` or `keepPre43`, and no newer-save guard. A grep for `remap43|check43|pre43|refunds43|lv` in `src/core` finds nothing.
2. **The step-A one-time migrations are flag-keyed and run after restore, not in `Save.js`:**
   - `Progression.shop43()` (`src/systems/Progression.js:329-343`, `progress.flags.shop43`)
   - `Progression.bakery43()` (`:352-367`, `progress.flags.bakery43`)
   - the `COMES_WITH` grants (`:304-313`)
   - `Game.restore`, which moves trade-post cash into the shop till and shop-rack bread to the bakery (`src/scenes/Game.js:2559-2590`)
   - `settleShopOver` (`:2597-2619`)

   They stay as they are. Step B's layout remap is a separate, pure JSON pass that runs **before** `sanitizeSave` and before `restoreV3`.
3. **Who will open a step-B build:**
   - 4.2.0.1/4.2.0.2 Play villages (v7)
   - 4.2.1 internal villages (v8)
   - a1, a2, a2.1, a2.2, a3 and a3.1 preview villages (v8, separate package)
   - **a3 Play closed-test villages** (v8, the same commit `ed04b7d` was also built as AAB 4313, `roadmap_mayor/engineering_roadmap.md:130`)

   None of them carries a marker, so `remap43` must run whenever `v43.lay` is missing, whatever the version number (R43, `engineering_roadmap.md:64, 106`).
4. **The old prices are the same in every pre-B build.** Checked at `38c233c` (4.2.0.2), `977f02e`, `21e3ef4` (a1), `b418595` (a2) and HEAD:
   - hall 2400 + 30 planks + 10 ingots (`src/data/balance.js:272`)
   - office 1800 + 20 planks + 6 ingots (`:667`)

   So the reprice table can be fixed constants, independent of version.
5. **The remap is small and data-driven.** It:
   - moves four workshops to their district plots (D19 ★A);
   - puts the town hall on `w_hall` and the restaurant on `w_rest` (N2; an old village may have them swapped, see §2.3);
   - reprices unfinished hall and office sites, refunding coins and extra materials;
   - resets the chief's position;
   - sets `progress.flags.s4half` for villages already 읍;
   - writes the marker `v43.lay = 2` and a `refunds43` summary.

   `check43` then proves that nothing vanished.
6. **Failure path:**
   - Today a migration exception gives null, then a fresh village that autosaves over `SAVE_KEY` (`Save.js:552, 571-576`).
   - A restore exception quarantines the save (`Game.js:133-142`).

   Step B holds the stored save byte-identical instead: a `pre43` copy, a hold on every writer, a card, and `migrateFail` from `Transfer.dryRun`.
7. **F0s (newer saves):**
   - Every build writes `lv` (43) right after `v`.
   - Load refuses `v > 8 || lv > 43` and holds every writer.
   - Before each write, `Save.write` reads the head of the stored value and refuses if it is newer. This is the S1 two-tab guard (`v44_plan.md:164-168`).
   - `Transfer.dryRun` returns `newerSave` for `lv > 43` (`src/core/Transfer.js:199` today checks `v` only).
8. **F0 (`x` and slices):** an `x` container with the per-key caps of the ★-accepted money/welfare patch (total ≈ 6.3 KB). Verbatim keep-rules for `missions` (3072), `geumbang` (1400), `haul` (768) and `demand` (1024). Every slice at its cap gives a save of ≈ 23 KB: under the 24 KB fail line and over the 16 KB warning.
9. **Defects in today's tree that step B must fix (§1.6):**
   - **G-4:** `progress.got` keeps tool items only (`Save.js:175`). Planks delivered to the `mkt_s3` pad (8) and the `bld_bakery` pad (4) are lost on every reload. Verified: `sanitizeSave({progress:{got:{mkt_s3:{item_plank:5}}}})` returns `{mkt_s3:{}}`. Step B's `mkt_s4` pad (20 planks + 8 ingots) would make it worse.
   - **G-5:** `v42.seen.boost` is not kept.
   - **G-6:** the hall tax box is clamped to its cap, which matters for D10.
   - **G-7:** a `'half'` value in `progress.seen` would be dropped.
   - **G-8:** the planned `pre43` key name would travel in codes and be deleted by `applyVillage`.
   - **G-9:** a3 builds would truncate a B village imported as a code.
10. **Fixtures:** 12 exist (v35 ×4, v41 ×5, v42 ×2, `v43a2_bread`). Step B needs 4.2.0.2 ×3, an a3 village, an a1 village, XL-swap and reprice cases, a newer `lv` 46 code, a same-level `x`/slices save, forced failures, and the designer's own Play village code (still not received). See §5.

---

## 1. The save today (HEAD `12d598f`)

### 1.1 Constants, migration chain, load and write

| What | Where | Notes |
|---|---|---|
| `SAVE_KEY` `frostVillage.save.v1`, `SETTINGS_KEY` | `src/core/Save.js:11-12` | |
| `SAVE_VERSION = 8` | `Save.js:41` | v8 since `977f02e`. 4.2.0.1/4.2.0.2 (`e5b27fa`/`38c233c`) write 7. |
| `BACKUP_KEY` `frostVillage.save.backup`, `BAD_KEY` `….v1.bad` | `Save.js:42-43` | |
| `MIGRATE[1..7]` | `Save.js:68-137` | `[3]` gives operators and porters to v3 machines (`:88-107`). `[6]` caps the dock backlog at 2 train loads (`:119-132`). `[7]` changes only the number (`:136`). |
| `OLD_STEP_IDS` | `Save.js:67`, duplicated at `Progression.js:197` | v1 step renames |
| `migrateSave(s)` | `Save.js:549-555` | Runs the chain (`:552`). A throw becomes `break` and then null. Then `sanitizeSave`. Used by `Save.load`, `Transfer.dryRun:201` and `Admin.adminBackup` (`src/systems/Admin.js:108`). |
| `Save.load()` | `Save.js:559-578` | Unreadable gives `keepCopy` and `lastUnreadable` (`:564-569`). Migrate (`:570`). Unknown or future version gives `keepCopy`, `lastUnreadable` and null (`:571-576`). **The caller then starts a fresh village that autosaves.** |
| `keepCopy(st, raw)` | `Save.js:539-544` | Writes `BACKUP_KEY`, or `.2` (overwritten) when the backup holds a different save |
| `Save.write(state)` | `Save.js:579-586` | Refused under `window.__FV_NO_SAVE` (`:582`). Writes `Object.assign({ v, t }, state)` (`:583`). No newer check. |
| `Save.clear()` / `quarantine()` | `Save.js:588, 590-593` | `clear` also clears the chat record. `quarantine` moves the save to `.bad`. |
| `ChatSave` | `Save.js:605-625` | `blocked` when a newer chat record exists (`:614`). Writes are refused under `__FV_NO_SAVE` (`:619`). |
| `Settings.save` | `Save.js:676` | Refused under `__FV_NO_SAVE` |
| Autosave | `Game.js:2216` (every `BALANCE.autosaveEvery` = 5 s, `balance.js:248`). On `visibilitychange` and `pagehide`: `Game.js:371-375`. | |

### 1.2 `sanitizeSave` keep-rules by top-level key (`Save.js:146-262`)

| Key | Rule (line) | Writer (`Game.serialize`, `Game.js:2380-2542`) |
|---|---|---|
| `v` | always `SAVE_VERSION` (`:149`) | `Save.write` (`Save.js:583`) |
| `coins` | count ≤ 1e12 (`:150`) | `:2511` |
| `cid` | `/^[a-z0-9]{4,16}$/` (`:152`) | `:2527` |
| `onb` | 1..1023 (`:154`) | `:2529`. 4.2.0.1+ new games only. |
| `flag` | `sanitizeFlag` (`:157`, `src/flag/design.js:32-43`) | `:2531` (`VillageFlags.serialize`, `src/flag/VillageFlags.js:308`) |
| `adminUses` / `adminInf` | (`:160-161`) | `:2533-2534`. Removed on import (`Transfer.markImported`, `Transfer.js:289-302`). |
| `progress` | `done` and `flags` keep only `=== true` (`:62, :165, :171`); `paid` all ids (`:166`); `seen` keeps only `=== true` (`:170`); **`got` keeps tool items only (`:175`)** | `Progression.serialize` (`Progression.js:682-684`) |
| `stations` | `{ i, o }` ≤ 1000 (`:176-177`) | `:2382`. The bakery's oven loaves are saved on its rack (`src/entities/Bakery43.js:216`). |
| `market`, `trade` | FOODS / GOODS counts plus cash (`:178-180`) | `:2514-2516`. **Step A writes `trade.cash: 0`;** an old trade cash is added to the shop till on load (`Game.js:2565-2566`). |
| `bakery` | `{ stock: { item_bread }, cash }`, optional (`:181-182`) | `:2518` (a3) |
| `player` | x, y and a stack of `ITEMS` ≤ 200 (`:183-189`) | `:2519` |
| `life` | `moved`, `waiting`, `snowman` (`:190-198`) | `:2520` |
| `territory` | the `REGIONS` list (`:53, :200-203`); east implies rail; south implies west_s (`:246`) | `:2508` |
| `sites` | id regex, `BUILDINGS` (`:48-51`), `SITE_STATES`; **drops a site whose plot has `only` set to another building, a station not on an `only` plot, or an XL building on a plot that is not XL** (`:215`); one of each in `UNIQ` (`:208, :216`); `{ b, st, got, t }` (`:217`) | `:2493` (`Site.serialize`, `src/entities/Site.js:411-420`; a finished site is saved as `{ b, st }` only) |
| `v3` | warehouse, food, dock, workshops (toolsmith and cannery ins incl. `item_meat_raw`), store (`:220-231`); dock catch ≤ 30 (`:257-260`) | `:2500-2504` |
| `labour.piles` | the five pile ids ≤ 500 (`:233-235`) | `:2521` |
| `dog` | (`:236-238`) | `:2522` |
| `v4` | `sanitizeV4` (`:240-241, :462-535`). `v4.cash` is the station till (`src/systems/Growth.js:59, :709`). | `:2524` (passes through until v4 runs) |
| `c1` | `sanitizeC1` (`:243-244, :434-456`); **`hall.tax` clamped to `taxCap` 1500** (`:439`, `balance.js:493`) | `:2526` |
| `v42` | `sanitizeV42` (`:250-251, :275-338`); depot crew `hires`, `fork`, `hp` (a2.2, `:311-314`); `seen` keeps `whatsNew`, `pickupTip`, `trainNew`, `halo`, `cheer`, `p2`, `up`, `big`, `p34`, `sl2`, `tb` (`:318-322`) | `:2536` (`V42.serialize`, `src/systems/V42.js:176-186`) |
| `bank`, `logistics` | `keepBank` and `keepLogistics`: local copies of the module keep-rules (`:252-255, :345-431`) | `:2536` (pass-through pattern) |
| *anything else* | **dropped** (a fresh object is built from known keys only) | |

### 1.3 What step A and the a2 to a3.1 requests put in the save

| Feature | Saved as | Where | Step-B impact |
|---|---|---|---|
| Hut on `v42_office` | **nothing**: the hut is drawn by `ChiefHut` on the `replace: 'chief_hut'` plot (`src/data/world.js:951, :993`) and is not a site | `world.js:947-952, 990-995` | `chief_hut` does **not** need adding to `BUILDINGS`. The plan's `§6.3` entry (`redesign_v43/engineering_plan.md:566`) is out of date. |
| `v42_office` moved to (600, 640) | same plot id, so old sites follow it | `world.js:76, 993` | no data change |
| Shop stages | `progress.done.mkt_s2`/`mkt_s3`/`hire_clerk_s3`, `flags.shop43` | `Progression.js:52, 71-72, 329-343` | unchanged; runs after restore |
| Trade post becomes the 자재 창구 | `trade.stock` kept, `trade.cash` written as 0 | `Game.js:2516, 2564-2566` | done in A |
| Net becomes the deck | pile id `fish` reused for the crate | `Save.js:140` `PILE_IDS` | done in A |
| First houses | plots `h43_1` (600, 1040) and `h43_2` (1110, 1600), `only` house_c / house_a, `price` index | `world.js:594, 597`; `Site.js:38-41` | ids are stable. **h43_2 moved between a1 and a2** ((1340, 1050) to (1110, 1600)); there is no save effect. |
| Bakery split (a3) | `bakery` slice, `stations.bakery`, `flags.bakery43`, `flags.firstMeatSale`, pad `bld_bakery`/`hire_clerk_bakery` | `Save.js:181-182`; `Game.js:2518, 2559-2590`; `Bakery43.js:545-555`; `Progression.js:61-67, 352-367` | unchanged; `bakery43()` grants and refunds through `economy.add` at `progress.init` |
| Village flag (a3) | `flag` `{ s, b, p, pc, e, ec, mk? }` | `Save.js:155-157`; `VillageFlags.js:101-109, 308` | unchanged. The new-game maker opens only when `Save.lastUnreadable` is false (`Game.js:251`), so a hold or failure state also keeps it shut. |
| Residents window (a3) | `progress.seen.resWin` only | `src/scenes/ResidentsPanel.js:699` | kept by `Save.js:170`. Person data comes from the story people and `PersonRegistry`; nothing is written. `src/systems/residents/roster.js:606` only reads `ChatSave`. |
| Goal window, tap-to-walk, navigator line | nothing (`Settings.data.nav` is a device setting) | `src/systems/Navigator.js:138, 377` | none |
| Carry pill, HUD relayout, grilled-fish icon | nothing | — | none |
| Graphics presets, 관망 pan | `Settings`: `gfx`, `gfxAuto`, `gfxDev`, `gfxWhy`, `perfInfo`, `obsPanHint`, `vol` | `Save.js:630-677` | not the save (but `SETTINGS_KEY` travels in codes) |
| Depot crew and forklift (a2.2) | `v42.depot.hires`, `fork`, `hp` | `Save.js:311-314`; `src/systems/depot/DepotSystem.js:205-207` | kept |
| Meat cans (4.2.1, in every a-build) | `progress.flags.meatCan`, `progress.seen.mcanOffer`, `v42.seen.up.mcan`, `v42.offerPaid.mcan`; `item_can_meat` | `src/systems/MeatCan.js:13`; `src/data/items.js:22-23` | kept |

### 1.4 Restore order (`Game.build`, `Game.js:145-281`)

```
153  this.saved = fresh ? null : Save.load()       ← a step-B remap must already be done here (pure JSON)
196  cid · 198 Civic(sv.c1) · 202 Territory(sv.territory) · 203-226 zones, decor, stations, sellers, buildV3 (one Site per WORLD.plots id)
228-235 player position (okPos) + Economy(sv.coins) · 238-239 admin
243  new Progression(sv.progress)
248  Onboarding(sv.onb, isNew)    isNew = saved===null && !brokenRestart && !(!fresh && Save.lastUnreadable)
251  VillageFlags(sv, isNew)      same rule
253  buildV42(this, sv) · 258 Neighbours.attach(sv.v4)
260  restoreV3(sv)        → Game.js:1058-1071: `if (!site) continue;` (1065) silently skips a site whose id is not a plot or tower
261  progress.init()      → shop43() / bakery43() (Progression.js:301-302), COMES_WITH (:304-313), applyStep(instant)
262  restore(sv)          → stations, market/trade/bakery stock, till, player stack (Game.js:2551-2593)
263  restoreV3Stock(sv)   → 창고, food box, dock, workshops, store, hall tax, restaurant (Game.js:1074-1089)
264  settleShopOver()     → overflow to the 창고, else coins (Game.js:2597-2619)
265  restoreLabour(sv) · 266 v42.afterRestore(sv)
269  if (okPos) unstickChief()
     ← [new] v43 post-load step goes here (letter due, restore-skip check, release the save hold)
```

On failure: `Game.create` catches a `build()` exception, calls `Save.quarantine()` and restarts fresh with `broken: true` (`Game.js:131-143`). The crash card's 「처음부터 하기」 moves `SAVE_KEY` to `.bad` and removes `.chat` (`index.html:79-86`).

### 1.5 Transfer and other readers

| Item | Where |
|---|---|
| `isGameKey`: excludes `BACKUP_KEY` and `BACKUP_KEY + '.*'`, `*.bad`, `frostVillage.move.*` | `src/core/Transfer.js:40-46` |
| Payload `{ app, fmt: 1, made, saveV, build, keys }` | `Transfer.js:113`; `CODE_FMT = 1` at `:24` |
| Format check: tag `SNOWBLOOMn` with n > fmt gives `newer` | `Transfer.js:154-155, 177-178` |
| `dryRun`: **refuses only `raw.v > SAVE_VERSION`** (`newerSave`), then `migrateSave` (null gives `badSave`) | `Transfer.js:195-204` |
| `summarize` (`fromV`, `flag`, …) | `Transfer.js:207-228` |
| `applyVillage`: sets `__FV_NO_SAVE`, spare, write and read back, then **removes every old game key the new village lacks** | `Transfer.js:238-276` (`:274`) |
| MovePanel strings `newerSave` | `src/scenes/MovePanel.js:54, 91` |
| MovePanel `saveNow` fallback stamps `{ v, t }` itself | `MovePanel.js:555-563` (`:560`) |
| MovePanel dry runs (export header, import, undo) | `MovePanel.js:385, 469, 538` |
| Raw save readers (title stage, title flag) | `src/title/progress.js:55`, `src/flag/title.js:15`: read-only and they do not depend on plot ids, so no change |
| Admin backup | `Admin.js:86-116` (`migrateSave` at `:108`) |

### 1.6 Gaps and defects

| # | Finding | Evidence | Fix in step B |
|---|---|---|---|
| G-1 | No content level. A newer village in an older build is either truncated (same `v`) or replaced by a fresh village that autosaves. | `Save.js:571-576`, `Game.js:153, 2216`; only `v` is compared (`Transfer.js:199`) | F0s (§4.7) |
| G-2 | A migration throw gives a fresh village that autosaves over `SAVE_KEY`; a restore throw quarantines the save. | `Save.js:552, 571-576`; `Game.js:133-142` | Failure path (§4.6) |
| G-3 | Nothing remaps the layout. `restoreV3` skips missing ids silently; sanitize drops `only` mismatches; `Site.start` caps `got` at the **new** need without refunding. | `Game.js:1065`; `Save.js:215`; `Site.js:230` | `remap43` + `check43` (§4.3-4.4) |
| **G-4** | `progress.got` keeps **tool items only**. Step A's material pads lose their delivered items on reload: `mkt_s3` (8 planks, `Progression.js:71`, `:440`) and `bld_bakery` (4 planks, `:62`, `:442`, `balance.js:231`). Step B's `mkt_s4` (20 planks + 8 ingots) would join them. | `Save.js:175`; verified with `node -e` | Keep `TOOLS ∪ MATERIALS` (better: every key in `ITEMS`) at `Save.js:175`. Old a2/a3 losses cannot be recovered. |
| G-5 | `v42.seen.boost` (a 0–3 count) is dropped, so the ×1.25 tip shows 3× per session instead of 3× ever | `src/entities/ChiefAura.js:127-130` vs `Save.js:320-321` | Add `o.seen.boost = count(sn.boost, 3)` |
| G-6 | Hall tax is clamped to 1500 on load. D10 (the train carries station cash into the hall box) would destroy coins above the cap. | `Save.js:439`; `src/entities/TownHall.js:216-219` | The train moves only `taxCap − tax`; the rest stays in `v4.cash`. No new field. |
| G-7 | The plan's `seen.mkt_s4 = 'half'` would be dropped (`seen` keeps only `=== true`) | `redesign_v43/engineering_plan.md:549`; `Save.js:62, :170` | Use `progress.flags.s4half = true` (§4.3 step 5) |
| G-8 | The plan's key `frostVillage.save.pre43` is a game key: it would travel in codes, and `applyVillage` would delete it on import | `engineering_plan.md:573-574`; `Transfer.js:40-46, :274` | Name it `frostVillage.save.backup.pre43` (N1), which the existing rule at `Transfer.js:42` covers |
| G-9 | a1–a3.1 builds have no `lv` guard. A B code imported into an a3 preview loads, `restoreV3` there skips `d_*` sites, and the next autosave drops those buildings. | `Transfer.js:154`; `Game.js:1065` | Raise `CODE_FMT` to 2 (N7), so older builds answer 'newer' |
| G-10 | `MovePanel.saveNow` builds its own `{ v, t }` stamp | `MovePanel.js:560` | Use the shared `stamp()` (§4.7) |
| G-11 | 「처음부터」 calls `Save.clear()` and would wipe a held (newer or failed) save | `Game.js:2621-2623`; `Save.js:588` | `clear()` while held: `keepCopy` first; the card makes it explicit |
| G-12 | `MIGRATE[6]` and `[3]` read live `BALANCE` and `LINE_STATION` at migration time. That is fine, but `remap43` must **not** read old prices from `BALANCE`, because after B it holds the new ones. | `Save.js:122`; `engineering_plan.md:529` ("from BALANCE at migration time") | Freeze `OLD43` as constants (§4.3) |

---

## 2. Save populations a step-B build opens

### 2.1 Who has which save

| Population | Build (commit) | `v` | Carries | Pre-B layout | Step-B handling |
|---|---|---|---|---|---|
| Play production / closed testers (≈ 63) and the **designer's Play village** | 4.2.0.1 `e5b27fa`, 4.2.0.2 `38c233c` | 7 | `onb` (new games since 4.2.0.1), `adminUses`/`adminInf` (4.2.0.2 admin), v42 office/bank/depot, no meat cans | office at the old (110, 810) spot, workshops on generic plots, hall usually on `w_hall` | `MIGRATE[7]` (number only), then `remap43`. Step A's runtime passes (`shop43`, `bakery43`, trade cash to till, bread to bakery) run at `progress.init`. |
| Internal 4.2.1 line (meat cans) | from `977f02e` | 8 | as above plus `progress.flags.meatCan`, `seen.mcanOffer`, `v42.seen.up.mcan`, `v42.offerPaid.mcan` | same | `remap43` |
| Preview a1 | `21e3ef4` (separate package `com.snowbloom.village.preview`) | 8 | step A: hut, deck, `flags.shop43`, `h43_*` | same, plus h43 | `remap43` |
| Preview a2, a2.1, a2.2 | `b418595`, `97d8a73`, `920ddf1` | 8 | plus stage-3 bread·meat in the shop; a2.2 adds `v42.depot.hires`/`fork`/`hp` | same | `remap43`; `bakery43()` at init |
| Preview a3 **and Play closed-test AAB 4313** | `ed04b7d` | 8 | plus `bakery` slice, `flags.bakery43`, `flag`, `progress.seen.resWin` | same | `remap43` |
| a3.1 (this HEAD) | `12d598f` | 8 | same as a3 | same | `remap43` |
| Step-B builds | — | 8, `lv` 43 | plus `v43` `{ lay: 2, seen, refunds43, toggles? }`, `x`, slices pass through | B layout | no remap (marker present) |
| v4.4–v4.6 / v5.0+ builds | future | 8 with `lv` 44–46; 9 with `lv` 50+ | `x.*`, `missions`, `geumbang`, `haul`, `demand`, `labour_office`, `material`, `stall`, … | — | **refused** (F0s): load hold and card, `dryRun` returns `newerSave` |

Feature presence by build was checked with `git show <c>:…` for `shop43()`, `bakery43()`, `sanitizeFlag`, `raw.bakery`, `dp.hires` and `resWin`: a1, a2, a2.1 and a2.2 have only `shop43`; a2.2 adds the depot crew; a3 and a3.1 have everything.

### 2.2 Pre-B prices (verified constant)

| Kind | coins | planks | ingots | Source (identical at `38c233c`, `977f02e`, `21e3ef4`, `b418595`, HEAD) |
|---|---|---|---|---|
| `town_hall` | 2400 | 30 | 10 | `balance.js:272` (`:246` / `:258` in the older builds) |
| `chief_office` | 1800 | 20 | 6 | `balance.js:667` `v42.office.site`, read by `Site.buildCost` (`Site.js:34`) |

New prices after B:
- hall 1200 + 16 + 4 (`engineering_plan.md:617`)
- office 400 + 8 + 0 (`balance.js:713` `hut.office`, already in the tree with the comment "4.3 B 부터 이 값")

`Site.buildCost` must switch `chief_office` to `hut.office` in B (`Site.js:34`).

### 2.3 Layout cases in old saves that the remap must handle

| Case | Possible because | Remap |
|---|---|---|
| toolsmith, warehouse, cannery or store on any generic M/L plot (`e_m1`, `e_m2`, `w_m1`, `w_m2`, `s_m*`, `se_*`, …), done or in progress | the build menu allowed them on M/L (`src/systems/Civic.js:38-41`) | move to `d_tool` / `d_wh` / `d_cannery` / `d_store` with `{ b, st, got, t }` (D19 ★A). State is keyed by kind (`v3.workshops.*`, `v3.store`, `v3.warehouse`), so nothing else moves. |
| `town_hall` on `w_rest` and/or `big_restaurant` on `w_hall` | both XL plots offer both buildings (`Civic.js:63`); `w_rest` and `w_hall` have no `only` (`world.js:617-619`) | hall to `w_hall`, restaurant to `w_rest` (a swap if needed, N2). Otherwise step B's `w_hall only: 'town_hall'` makes `Save.js:215` drop the restaurant. |
| Unfinished hall or office site (foundation or scaffold) | paid at the old price | reprice: coin difference to the wallet; materials above the new need go to the 창고 if there is room, else become coins at `priceOf`; `t` clamped to the new build time |
| Finished hall or office | — | kept, no refund (D21 ★A); the letter thanks the player |
| Office pad partial payment (`v42.office.hirePaid`) before 읍 | step B hides the staff pads before 읍 (D3) | none: kept and shown again at 읍 (`Save.js:286`) |
| Depot (`v42_depot`) | — | none (D20 ★A) |
| `h43_*`, `v_house*`, `w_s*`, decor | ids unchanged | none. **Layout rule:** a new reserve or district footprint must not overlap any plot that can already hold a building. The plan's `d_labour` (1220, 1610) L overlaps today's `h43_2` (1110, 1600) S. |

---

## 3. Decisions adopted (★) and new choices

### 3.1 ★ answers adopted (source)

| Q | Answer | Save consequence | Source |
|---|---|---|---|
| D19 | ★A move toolsmith, warehouse, cannery and store to district plots, keeping state | `MOVE43` table | `기획서_마을새단장.md:403`; `engineering_plan.md:101, 528-538` |
| D20 | ★A depot stays | no depot remap | `기획서_마을새단장.md:404` |
| D21 | ★A no refund for a hall or office finished at the old price; a thank-you letter | reprice only unfinished sites | `기획서_마을새단장.md:405` |
| D2, D3, D16 | ★A hall at village complete; hut, then office (≈ 16, side goal, 400 + 8), then hall; staff after 읍 | office reprice; staff `hirePaid` stays parked | `기획서_마을새단장.md:396-399` |
| D10 | ★A train carries station cash to the hall tax box | G-6 cap rule; no new field | `기획서_마을새단장.md:417` |
| R43 | remap keyed on the `v43.lay` marker, v7 and v8 alike; failure card | §4.3-4.6 | `engineering_roadmap.md:64, 106` |
| F0, F0s, E1 | `x` (per-key caps) plus top-level slices with keep-rules plus `lv` refusal | §4.7-4.9 | `engineering_roadmap.md:62-63, 107-108, 387` |
| E2 | the preview is a separate package and needs the remap | a2/a3 fixtures | `engineering_roadmap.md:388` |
| Roadmap Q14 | opt-in play log; data safety 「수집 안 함」 | P1 writes `x.log` (the migration result) | `engineering_roadmap.md:384` |
| Roadmap Q21 | ★A no refund for staff bought before v4.4 | none in v4.3 | `engineering_roadmap.md:381, 384` |
| Money/welfare Q25 | ★ `d_school` XL, `d_clinic` L, hidden `w_civic` at the old `w_hall` XL footprint; M/L `types` stay data-driven | new plot ids only; nothing saved on them in v4.3 | `기획서_돈과복지.md:17-20`; `roadmap_mayor/econ_welfare_roadmap_patch.md:529` |
| Money/welfare Q26 ff. | ★ (money counting v4.5, weekly report v4.6) | `x` caps add `money` 896 B and `wk` 1024 B; total ≈ 6.3 KB | `econ_welfare_roadmap_patch.md:486-489`; `econ_welfare_addendum.md:386-395` |
| 광장 1 | ★ reserve the plaza ground south of the yard between the first two houses; no trees, decor or plots there | a reserve area in `world.js`, **no plot id in v4.3** (nothing to save) | `기획서_광장과축제.md:41-46` |
| Step C | moves to v4.4 | `v43.toggles` accepted but not written; `labour_office` added to `BUILDINGS`/`UNIQ` | `engineering_roadmap.md:98, 100-101` |

### 3.2 New choices made here (N1 to N13)

| # | Choice | Why |
|---|---|---|
| N1 | `pre43` key = **`frostVillage.save.backup.pre43`**, written once if absent; a second, different village goes to `….pre43.2` if absent | Already excluded by `isGameKey` (`Transfer.js:42`), so it never travels in a code and `applyVillage` never removes it (`:274`). Fixes G-8. |
| N2 | Canonical XL homes: `town_hall` on `w_hall`, `big_restaurant` on `w_rest`. The old `w_hall` footprint becomes the hidden `w_civic` (Q25), which never holds a building in v4.3. | Makes `w_hall only: 'town_hall'` safe; no building ends on the reserve |
| N3 | If a mover's home is occupied by another kind, it **stays where it is** (grandfathered; logged in `refunds43.kept`). It is not refunded. | Lossless. It can only happen in a hand-made save, because `UNIQ` holds. |
| N4 | Extra materials from a reprice go to the 창고 if it is done, accepts the item and has room (cap `balance.js:353` 300, `Warehouse.js:40, :165`); else they become wallet coins at `priceOf` | Follows `engineering_plan.md:540`; computable in pure JSON |
| N5 | The `types` allowlist on generic plots is enforced **only by the build menu**, never by `sanitizeSave` | A misconfigured `types` can then never delete a building |
| N6 | `migrateSave` keeps its null contract. A new `migrateSaveEx` returns `{ save, fail, remapped, r }`; `Save.load` exposes `Save.failed`, `Save.newer`, `Save.remapped`, `Save.held`. | `Admin.js:108`, `Transfer.js:201` and the tests keep working |
| N7 | `CODE_FMT` 1 → **2** for codes written by `lv` ≥ 43 builds; decode accepts 1 and 2 | Older builds (4.2.0.x, a1–a3.1) answer 'newer' instead of truncating a B village (G-9). Not in the roadmap; cheap. |
| N8 | Newer test: `v > SAVE_VERSION ‖ lv > LV` (equivalent to `max(v, lv)` and also safe for a `v` 9 save with no `lv`) | `engineering_roadmap.md:63` |
| N9 | Old villages restart at a fixed `WORLD.v43.oldStart` point: the hut door, or the shop front while `v42_office` holds an unfinished site. `player.stack` is kept. The okPos path stays, so `unstickChief` (`Game.js:269`) still runs. | `기획서_마을새단장.md:446` |
| N10 | Over-cap module slice: dropped with a warning (the roadmap's "copied verbatim when within its cap"). Over-cap `x` key: trimmed oldest first; dropped only if it still does not fit. | `engineering_roadmap.md:62, 113` |
| N11 | Saves are held while a remapped village is restoring (`Save.pending43`) and released only after `Game.js:269` with no restore skips. A skip or a restore throw turns into the failure card, never a quarantine. | `restoreV3` skips are otherwise permanent at the next autosave |
| N12 | Test-only failure switch `globalThis.__FV_TEST_FAIL43 = 'throw' \| 'check'` (also `opts.fail` in Node) | G8 needs a deterministic forced failure; the switch does nothing in normal play |
| N13 | Stage-4 half-price offer for villages already 읍 is stored as `progress.flags.s4half = true` | Fixes G-7 |

---

## 4. Step-B design

### 4.1 Constants and API (`src/core/Save.js`, near `:41`)

```js
export const SAVE_VERSION = 8;                 // unchanged; MIGRATE[7] stays the v7 → v8 number step (Save.js:136)
export const LV = 43;                          // content level: 44/45/46 in v4.4–v4.6, 50 in v5.0 (engineering_roadmap.md:262-272)
export const PRE43_KEY = BACKUP_KEY + '.pre43';  // N1
export function isNewerSave(o) { return isObj(o) && (num(o.v, 0) > SAVE_VERSION || num(o.lv, 0) > LV); }   // N8
export function stamp(state) { return Object.assign({ v: SAVE_VERSION, lv: LV, t: Date.now() }, state); }  // key order v, lv, t
```

New pure module `src/core/Remap43.js`. It imports only `WORLD`, `BALANCE` and items (as `Save.js` does at `:4-7`) and exports `LAY`, `MOVE43`, `OLD43`, `needsRemap`, `remap43`, `check43`. Keeping it out of `Save.js` keeps that file's keep-rules readable.

### 4.2 Load pipeline (insertion points)

```
Save.load (Save.js:559)
  st = getStore(); rawStr = st.getItem(SAVE_KEY); s = readJSON(SAVE_KEY)                 (:563)
  not an object                → as today (:564-569)
  [F0s]  isNewerSave(s)        → this.newer = { v: s.v, lv: s.lv }; lastUnreadable = true; hold('newer'); return null
                                  (SAVE_KEY untouched: no keepCopy, no autosave)
  [R43]  needsRemap(s) after the chain (v ≤ 8)  → keepPre43(st, rawStr)                  (raw string, byte-identical, once)
  r = migrateSaveEx(s, { fail: globalThis.__FV_TEST_FAIL43 })
        chain MIGRATE[v..7] (:552) → if needsRemap: pre = s; { save, r } = remap43(s); check43(pre, save, r) → sanitizeSave(save)
        → check43b(save, sanitized)   (every building kind of the remap output survives sanitize, except duplicates of a UNIQ kind)
  r.fail                       → this.failed = r.fail; lastUnreadable = true; hold('failed43'); return null
  !r.save                      → as today (:571-576: keepCopy + lastUnreadable)
  this.remapped = r.remapped; if (r.remapped) this.pending43 = true    (N11: writes refused until Game confirms)
  return r.save

migrateSave(s) = migrateSaveEx(s).save || null          (unchanged contract for Admin.js:108, Transfer, tests)

Game.build (Game.js:153)  this.saved = Save.load(); if (Save.held) this.saveHold = { why: Save.held, info: Save.failed || Save.newer }
  … 260 restoreV3 collects this.restoreSkipped[] (Game.js:1065) …
  after 269:  if (Save.pending43) { if (this.restoreSkipped.length) Save.failWith('skip', ids) else Save.confirm43() }
              v43 post-load: the 「마을 새 단장」 letter and 3-tap tour are due when !v43.seen.letter43; P1 logs the result in x.log
Game.create catch (Game.js:133-142): if (Save.remapped && !this.fresh) → Save.failWith('restore', e) and
              restart({ fresh: true, broken: true }) WITHOUT Save.quarantine() (N11)
```

### 4.3 `remap43` (pure: v8 JSON in, new object out; never mutates its input)

Tables:

```js
export const LAY = 2;                                         // v43.lay: absent/0/1 = pre-B layout; 2 = step-B plot table
export const MOVE43 = { toolsmith: 'd_tool', warehouse: 'd_wh', cannery: 'd_cannery', store: 'd_store',   // D19 ★A
                        town_hall: 'w_hall', big_restaurant: 'w_rest' };                                     // N2
export const OLD43 = { town_hall:    { coins: 2400, item_plank: 30, item_ingot: 10 },     // every pre-B build (§2.2)
                       chief_office: { coins: 1800, item_plank: 20, item_ingot: 6 } };
const NEW43 = (b) => (b === 'town_hall' ? BALANCE.buildings.town_hall : BALANCE.hut.office);   // = Site.buildCost after B
export const needsRemap = (s) => !(isObj(s.v43) && Math.floor(num(s.v43.lay, 0)) >= LAY);
```

Steps, in order:

1. **Clone** (`JSON.parse(JSON.stringify(src))`). Treat a `sites` value that is not an object as `{}`. Keep unknown site ids (pass through).
2. **Movers.**
   - Collect every site whose `b` has a `MOVE43` home and whose id ≠ home.
   - Sort finished sites first.
   - Remove all movers, then place each one: an empty home takes it (`R.moved.push([from, to, b])`); an occupied home leaves it at its old id (N3, `R.kept`).
   - The XL swap falls out of this two-phase placement.
   - Already on its home: untouched. This makes the step idempotent.
3. **Reprice** every site with `b ∈ OLD43` and `st !== 'done'`:
   - `R.coins += OLD.coins − NEW.coins`.
   - For each material: `extra = max(0, got[m] − NEW[m])`; `got[m] −= extra`; then `extra` goes to the 창고 room (N4: `R.toWh[m]`) and the rest to coins (`R.coins += rest × priceOf(m)`). Record per site in `R.repriced[]`.
   - `t = min(t, NEW.time)`.
   - Finished sites are untouched (D21).
4. **Wallet and 창고:**
   - `coins = count(coins) + R.coins`.
   - `v3.warehouse[m] += R.toWh[m]`, only if a finished `warehouse` site exists. Room = `capacity − Σ v3.warehouse` (`balance.js:353`; mirrors `Warehouse.restore`, `Warehouse.js:165`).
   - The 창고 refuses raw goods (`Warehouse.js:18`); planks and ingots are accepted.
5. **Progress:** if `progress.flags.rankEup === true`, set `progress.flags.s4half = true` (N13; stage 4 offered at `market43.stage4Old` 0.5, `engineering_plan.md:603`).
6. **Chief:** `player.x/y = WORLD.v43.oldStart` (N9); the stack is kept.
7. **Marker:**

   ```js
   v43 = { ...v43, lay: 2, refunds43: { coins: R.coins, items: R.items, wh: R.toWh, moved: R.moved.length, kept: R.kept.length } }
   ```

   `seen` is left empty, which makes the letter and tour due.

8. **Returns** `{ save, r: R }`. `remap43(save).save` deep-equals `save` (idempotent), and a save that already has the marker never enters the remap.

Not done in the remap (already handled elsewhere):
- trade post to 자재 창구 (`Game.js:2564-2566`)
- shop stages (`shop43`)
- bakery (`bakery43`, `Game.js:2559-2590`)
- net to deck (pile id reuse)
- `COMES_WITH`
- step-pad price drops, which `syncPads` refunds automatically (`Progression.js:430-436`)

### 4.4 `check43(pre, post, R)` (pure; any failure returns `{ ok: false, reason }`)

| # | Invariant |
|---|---|
| a | Every top-level key except `sites`, `coins`, `v3`, `player`, `v43`, `progress` deep-equals `pre`. `v3` differs only in `warehouse`. `progress` differs only in `flags.s4half`. |
| b | The multiset of `b:st` over `pre.sites` equals the one over `post.sites` (no building appears or vanishes) |
| c | Every mover is on its home unless it is listed in `R.kept` |
| d | For each repriced site and material: `pre.got[m] = post.got[m] + toWh + asCoins` |
| e | `post.coins − pre.coins = R.coins = Σ(OLD.coins − NEW.coins) + Σ asCoins × priceOf(m)` |
| f | `post.v3.warehouse − pre.v3.warehouse = R.toWh`, with the 창고 total ≤ capacity |
| g | `remap43(post).save` deep-equals `post` |
| h (`check43b`, after `sanitizeSave`) | every building kind in `post.sites` survives sanitize, except a second copy of a `UNIQ` kind (today's rule, `Save.js:216`). This catches a wrong `only`, size or XL setting in the new plot table. |

The tests use a separate census (`save_v43.mjs`, §6) that counts coins and items over **every** place:

- **Coins:**
  - `coins`
  - `market.cash`, `trade.cash`, `bakery.cash`
  - `v3.store.cash`
  - `c1.hall.tax`, `c1.rest.cash`
  - `v4.cash`, `v4.rentAcc`
  - `v42.office.bag`, `safe`, `hirePaid`
  - `v42.offerPaid.*`, `v42.depot.hp.*`
  - `logistics.cash`
  - `bank.sv` (and `bank.ln` as debt)
  - `progress.paid.*`
- **Items:**
  - `stations.*.i/o` (by station input/output)
  - `market`, `trade` and `bakery` stock
  - `player.stack`, `labour.piles`
  - `v3.warehouse`, `v3.food.food`, `v3.dock.catch`, `v3.workshops.*.ins/outs`, `v3.store.stock`
  - `c1.rest.pantry`
  - `v4.cargo`, `v4.shops.*.stock`, `v4.orders.cards[].got`, `v4.orders.kept`, `v4.houses.*.got`
  - `v42.freight.dock/cars`, `v42.depot.load`
  - `logistics.stock` (ids without the `item_` prefix)
  - `sites.*.got`
  - `progress.got.*`

### 4.5 `keepPre43(st, rawStr)`

- Runs only on the load path (never in `dryRun`), before `migrateSaveEx`, and only when the parsed save needs the remap and is not newer.
- If `PRE43_KEY` is absent, it writes `rawStr` byte for byte. If present with a different string, it writes `PRE43_KEY + '.2'` if that is absent. It never overwrites and never throws.
- Size is ≤ 10 KB; there is no quota concern.
- 「마을 옮기기 › 새 단장 전 마을」 (`기획서_마을새단장.md:429`) exports it as a code: the current game keys with `SAVE_KEY` replaced by the `pre43` string (same `cid`, so the chat record matches).
- Not touched by the crash card (`index.html:79-86`), by `applyVillage`, or by `Save.clear`.

### 4.6 Failure path (G8; `engineering_plan.md:512-524, 648`)

| Trigger | State | What the player sees | What is written |
|---|---|---|---|
| `remap43` throws, `check43`/`check43b` fails, or the test switch is set | `Save.failed = { kind: 'v43', reason }`, `lastUnreadable`, `hold('failed43')` | Card 「마을을 옮기지 못했어요」 with three buttons: 「코드 복사」 (the `pre43` code), 「다시 해 보기」 (reload), 「새 마을로 시작」 (explicit: `keepCopy` of the stored raw, then lift the hold) | nothing. `SAVE_KEY` is byte-identical and `pre43` is present. No onboarding and no flag maker: `Game.js:248, 251` already skip them when `lastUnreadable`. |
| `restoreV3` skipped a site on a remapped load, or `build()` threw on a remapped load (N11) | `Save.failWith('skip' \| 'restore')` | the same card | nothing (no quarantine) |
| `Transfer.dryRun` on a code | `fail('migrateFail', { reason })` | MovePanel: new string next to `newerSave` (`MovePanel.js:54, 91`) | nothing |

The hold works as follows:

- `Save.held = why`, `window.__FV_NO_SAVE = true` (which blocks `Save.write`, `ChatSave.write`, `Settings.save`, the admin backup and the `applyVillage` races), and `ChatSave.blocked = true`.
- `Save.clear()` while held calls `keepCopy` first (G-11).
- `Game.save` (`Game.js:2544-2549`) needs no change, because `Save.write` refuses.

### 4.7 F0s: content level and newer-save refusal

| Piece | Change | Line |
|---|---|---|
| Write `lv` | `Save.write` uses `stamp(state)`, giving `{"v":8,"lv":43,"t":…` | `Save.js:583` |
| MovePanel fallback | `stamp(gs.serialize())` | `MovePanel.js:560` (G-10) |
| Load refusal | §4.2 `[F0s]`; card 「더 새 버전에서 저장된 마을이에요」 with: update (Play link), 「코드 만들기」 (export the stored keys; `MovePanel.saveNow` falls back to the stored raw because the write is refused), 「새 마을로 시작」 (explicit; the newer village goes to the spare `MOVE_BACKUP_KEY` as a code first) | `Save.js:559-578`; UI |
| **Write guard (S1)** | Before writing, `Save.write` reads `st.getItem(SAVE_KEY)` and matches `^\{"v":(\d{1,4})(?:,"lv":(\d{1,4}))?` (falls back to `JSON.parse` when the head does not match). If the stored save is newer, it calls `hold('stale')`, fires the `onStale` banner once 「새 버전에서 저장된 마을이에요 · 새로 고침해 주세요」 (`v44_plan.md:164-168, 1790`) and returns false. This covers a second, newer tab in the web build. | `Save.js:579-586` |
| `dryRun` | `if (isNewerSave(raw)) return fail('newerSave')`, replacing the `v`-only test | `Transfer.js:199` |
| Code payload | `lv: LV` next to `saveV`; `CODE_FMT = 2` (N7); decode accepts 1..2 | `Transfer.js:24, 113, 154-155, 177-178` |
| `summarize` | adds `fromLv: raw.lv \|\| 0` and `remap43: { coins, moved, kept }` for the confirm card | `Transfer.js:207-228` |

### 4.8 F0: the `x` container

Keep-rule `keepX(raw.x)`, called in `sanitizeSave` after `:255`:

- `x` must be a plain object.
- At most 24 keys, each matching `/^[a-z][a-z0-9_]{0,15}$/`. That excludes `__proto__` and `constructor` (iterate with `Object.keys`).
- Values are deep-copied through `JSON.parse(JSON.stringify(v))`; keys whose value is `undefined` or a function are skipped.
- **Insertion order is kept** for byte identity. JSON written by `JSON.stringify` round-trips byte-identically. Integer-like keys are already in engine order in such JSON, so the fuzz must generate payloads through `JSON.stringify`.
- A key over its cap is trimmed oldest first:
  - an array: `shift()`;
  - an object: shift its longest array member;
  - repeat until it fits, else drop the key.

  Each trim or drop pushes a warning to `Save.warnings` (tests and P1 read it). The save is never dropped and the function never throws (try/catch per key).
- **Total:** `JSON.stringify(x).length ≤ X_TOTAL`, else trim keys in reverse table order (unknown keys first).

| key | cap (B) | written from | owner |
|---|---|---|---|
| `log` | 512 | v4.3 (P1; cut line v4.4) | play log; holds the migration result `m43: [lay, ok, coins, moved, kept]` |
| `mgmt` | 256 | v4.4 | hand-over and A/B group (F5, AB) |
| `needs` | 1024 | v4.5 | F9 |
| `daily` | 512 | v4.5 | daily loop |
| `rewards` | 512 | v4.5 | |
| `money` | 896 | v4.5 | F15 MoneyBook (money/welfare ★) |
| `book` | 1024 | v4.6 | 도감 (incl. `book.sea`, fishery) |
| `mail` | 512 | v4.6 | mailbox |
| `wk` | 1024 | v4.6 | weekly report (money/welfare ★) |
| *(unknown key)* | 512 | a later build at the same `lv` | pass-through |
| **`X_TOTAL`** | **6400** | | ≈ 6.3 KB (`econ_welfare_roadmap_patch.md:489`) |

Not known to v4.3 (their saves are refused by `lv`):
- `fund` 96 (v5.0)
- `care` 256 (v5.2)
- the plaza's `fest.*` and `plaza`, "≈ 3 KB, in v4.3's 빈 서랍" (`기획서_광장과축제.md:451-458`). **This does not fit next to the other keys under 6.4 KB.** The plaza plan review must give `fest` its own cap, or make it a top-level slice, and re-run the size gate (open item O3).

Game side: a small holder (`this.x43`) with `get(k)` and `set(k, v)` (fit-on-set) and `serialize()`. `Game.serialize` writes `x: this.x43.serialize()`, which is `this.saved.x` until something writes. In v4.3 only P1 writes.

### 4.9 Top-level module slices (pass-through keep-rules)

```js
const SLICES43 = { missions: 3072, geumbang: 1400, haul: 768, demand: 1024 };
for (const k in SLICES43) { const v = keepSlice(raw[k], SLICES43[k]); if (v) s[k] = v; }   // after Save.js:255
keepSlice = (v, cap) => isObj(v) && JSON.stringify(v).length <= cap ? JSON.parse(JSON.stringify(v)) : (v !== undefined && warn(k), null)  // N10
```

The caps come from the modules:
- `src/missions/save.js:10` (`MISSIONS_SLICE.cap` 3072)
- `src/geumbang/save.js:21` (1400)
- `logistics_plan.md:132` LD21 (`haul` ≤ 768 B, `demand` ≤ 1 KB)

`Game.serialize` (next to `Game.js:2536`) adds `missions`, `geumbang`, `haul` and `demand: (this.saved && this.saved[k]) || undefined`. This is the same pass-through pattern as `bank` and `logistics`. Later modules (`story`, `vehicles`, `bank` v2, `harbor`, `beach`, `incidents`, `shops`) come with `lv` ≥ 50 and are refused by F0s; v4.3 needs no rules for them.

### 4.10 The `v43` block (`sanitizeV43`, in `sanitizeSave` after `:255`)

```js
{ lay:       int 0..9 (kept exactly: it is the marker),
  toggles:   { counters: { <id>: false }, stations: { <id>: false } }   // only "off" entries; ids /^[a-z0-9_]{1,16}$/, ≤ 12 / 16
                                                                         // accepted from day one, nothing writes them until v4.4 (roadmap :101)
  seen:      { <key>: 1 }        // ≤ 32 keys /^[a-z0-9_]{1,24}$/ (letter43, tour43, firstHouses43, s4offer …)
  refunds43: { coins ≤ 1e9, items: ITEMS counts, wh: ITEMS counts, moved ≤ 16, kept ≤ 16 } }
```

- `sanitizeV43(sanitizeV43(x))` equals `sanitizeV43(x)`, and it never throws.
- Game holds `this.v43 = sanitizeV43(sv.v43) || { lay: 2, seen: { letter43: 1, tour43: 1 } }`: a new village gets no letter.
- `serialize` writes `v43: this.v43`.
- The letter text reads `refunds43`.

### 4.11 `BUILDINGS`, `UNIQ`, plots and regions

- `BUILDINGS` (`Save.js:48-51`) and `UNIQ` (`:208`) gain `'labour_office'` (roadmap `:100`). No `chief_hut` (§1.3). No `material` or `stall` (v4.6; refused by `lv`).
- New plot ids, fixed now because sites are keyed by id and an id must never be re-used:

  | id | size | holds |
  |---|---|---|
  | `d_tool`, `d_wh`, `d_cannery`, `d_store` | M | only their kind; `d_cannery` must define `pads: { line, p2, mcan }` as `w_m2` does (`world.js:622`) |
  | `d_labour` | L | hidden until v4.4 |
  | `d_school` | XL | hidden |
  | `d_clinic` | L | hidden |
  | `w_civic` | XL | hidden, at the old `w_hall` footprint (-780, 1880) |

  `w_hall` moves to (180, 760), region `start`, `only: 'town_hall'`, `after: 'hire_hunter'`. The plaza reserve is a `world.js` area, not a plot.
  Reserved plots use an `only` value that is not a building, so `Save.js:215` drops anything saved there.
- `REGIONS` (`Save.js:53`): no new region (every new plot is in `start`).
- The `Save.js:215` rule stays; `types` is not enforced in sanitize (N5).

### 4.12 Size budget

Measured from `v42_village_late` (save string 7149 B):
- `v4` 2056
- `progress` 1459
- `v42` 880
- `sites` 665

| Part | Bytes |
|---|---|
| main save (late v4.2 village) | 7149 |
| `bank` / `logistics` up to their caps (1024 / 2048; today 38 / 139) | +2895 |
| `missions` + `geumbang` + `haul` + `demand` at caps | +6264 |
| `x` at `X_TOTAL` | +6400 |
| `v43` (lay, seen, refunds43), `lv`, `flag`, `bakery`, `onb` | ≈ +450 |
| **total** | **≈ 23.2 KB**: passes the 24 KB fail line, triggers the 16 KB warning (`engineering_roadmap.md:113, 274`; `econ_welfare_roadmap_patch.md:812`) |

Headroom is ≈ 0.8 KB, so a bigger `progress` or `v4` at bot 100 may cross the line. Measure on the oldest fixture at caps (O4).

### 4.13 Fixes riding along

- **G-4:** `Save.js:175` becomes `counts(pr.got[id], ITEMS)`.
- **G-5:** keep `v42.seen.boost`.
- **G-6:** cap rule for the train cash.
- **G-10**, **G-11** (above).
- `Site.buildCost`: `chief_office` reads `BALANCE.hut.office` (`Site.js:34`).

---

## 5. Fixtures

### 5.1 Present (`tools/test/fixtures`)

| File | `v` | What | Used by (examples) |
|---|---|---|---|
| `v35_save_{0_5,12,21,38}min.json` | 4 | v3.5 bot saves (`trade` stock and cash) | `save_v35`, `save_v42`, `market43`, `transfer` |
| `v41_save_{pure_25,pure_45,smart_25,smart_35,smart_46}min.json` | 6 | v4.1 bot saves (`v4`, `c1`; workshops on `e_m1`/`e_m2`/`w_m1`/`w_m2`; hall on `w_hall`, restaurant on `w_rest`) | `save_v42`, `ghostcoins_matrix`, many browser suites |
| `v42_save_office_ttal.json` | 7 | the 46-min village plus office, bank, depot, four staff | `ghostcoins_matrix`, `porters42` |
| `v42_village_late.json` | 7 (as `{ note, keys }`: save + `.chat` + settings + title) | late v4.2 village, 135,000 coins | `transfer` |
| `v43a2_bread.json` | 8 | hand-made a2 village (from `v41_save_smart_35`): `flags.shop43`, `mkt_s2`/`mkt_s3`, `hire_clerk_s3`, 30 bread on the shop rack; toolsmith `e_m1`, cannery `e_m2`, 창고 `w_m1`, restaurant `w_rest`; **no hall, no store, no `bakery43`** | `bakery` |

Coverage gaps: no 4.2.0.x villages (`onb`, `adminUses`/`adminInf`); no a3 village (`bakery`, `flag`, `bakery43`, depot crew); no XL swap; no unfinished hall or office; no newer, same-level, or failure cases (`engineering_roadmap.md:110`).

### 5.2 Needed for step B (`save_v43.mjs` and G8)

| New fixture | `v` / `lv` | Content | How to make it |
|---|---|---|---|
| `v4202_fresh_tut.json` | 7 | new game just after the tutorial (`onb` bits, about 3 min) | worktree at `38c233c`, `tools/test/onboarding.mjs` route, export all game keys (`v42_village_late` format) |
| `v4202_25min.json` | 7 | ≈ 25 min smart-bot village with `onb` | `38c233c` with `econ/probe.mjs` smart bot |
| `v4202_46min_admin.json` | 7 | ≈ 46 min with office, bank and depot; admin used (`adminUses` ≥ 1, `adminInf` 1); keys incl. `move.admin` | `38c233c` with smart bot plus `admin.mjs` hooks |
| `v43a1_village.json` | 8 | a1-era: `flags.shop43`, meat-can fields, `h43_2` with a house built (from when it sat at the old spot) | HEAD-independent: hand-made from `v41_save_smart_46` with a1 fields (as `v43a2_bread` was), or a run at `21e3ef4` |
| `v43a3_late.json` | 8 | a3.1 village: `v42_village_late` played 2 min on HEAD, so `flags.shop43`/`bakery43`, `bakery` slice, `flag`, `resWin`, depot `hires`/`fork`; all four workshops on generic plots; hall `w_hall`; office and bank done; with chat | HEAD (a3.1) browser run, export keys. **This is the "a2/a3 preview village" gate fixture.** |
| `v43a3_fresh25.json` | 8 | a3.1 new game at ≈ 25 min (`onb`, `flag` with `mk` 0, bakery, toolsmith on a generic plot) | HEAD smart bot |
| `v43_xl_swap.json` (×4 variants) | 7 | hall on `w_rest` and restaurant on `w_hall`; hall on `w_rest` only; restaurant on `w_hall` only; hall on `w_rest` with `w_hall` holding a house (N3, hand-made) | node script from `v41_save_smart_46` |
| `v43_reprice.json` (×3) | 7 | hall foundation on `w_hall` with `got` 25/8; hall scaffold with 30/10; office scaffold 20/6; each with 창고 room, a full 창고, and no 창고 | node script |
| `v43_newer_lv46.json` | 8 / 46 (code) | `x` (all keys at caps), `missions`, `geumbang`, `haul`, `demand` at caps, sites `labour_office`/`material`/`stall`, `v43.toggles`; also a `v` 9 `lv` 50 variant and a `v` 9 variant with no `lv` | node script |
| `v43_samelv_x.json` | 8 / 43, `lay` 2 | random `x` keys (incl. an unknown key and integer-like nested keys) and slices exactly at caps | node script (also used by the fuzz) |
| `v43_fail_*` | 7 and 8 | the `v43a3_late` and `v4202_46min_admin` saves run with `__FV_TEST_FAIL43 = 'throw' \| 'check'` (N12) | test switch, no file needed |
| **Designer's Play village code** | 7 | real 4.2.0.2 village | **still to request** (`engineering_plan.md:582, 788`; `기획서_시장취임_로드맵.md:409` item 3) |

Generate the node-made fixtures with a committed script (`tools/test/fixtures/make_v43.mjs`), and give every fixture a `_note`, as `v43a2_bread` has.

---

## 6. Tests

### 6.1 `tools/test/save_v43.mjs` (new; Node part and browser part, like `transfer.mjs`)

**Node (`--node`):**

1. `SAVE_VERSION` is 8, `LV` is 43, `MIGRATE[7]` only changes the number (as in `save_v42.mjs:30-33`), and `stamp()` key order is `v`, `lv`, `t`.
2. Every fixture in §5 goes through `migrateSaveEx`:
   - `ok`, `lay` 2, `check43` and `check43b` pass;
   - census (§4.4) equals the pre-load census adjusted by `refunds43`;
   - every workshop is on its `d_*` home; the hall is on `w_hall` and the restaurant on `w_rest`;
   - no site on `w_civic`, `d_school`, `d_clinic` or `d_labour`;
   - idempotent (`migrateSaveEx(stamp(out))` deep-equals `out` and does not remap);
   - building kinds survive sanitize;
   - `onb`, `admin*`, `flag`, `bakery`, `progress.flags.*` and `seen.resWin` are unchanged.
3. XL-swap and reprice tables:
   - exact coins (+1200 per unfinished hall, +1400 per unfinished office) and the 창고-or-coins split;
   - `t` clamped;
   - finished sites unchanged (D21);
   - N3 case kept and logged.
4. Failure: `opts.fail` 'throw' / 'check' makes `migrateSave` return null with `failed.reason`; `Transfer.dryRun` on the same code gives `migrateFail`.
5. F0s:
   - `isNewerSave` matrix (`v` 9; `lv` 44 and 46; `lv` 43; no `lv`; garbage `lv`);
   - `dryRun` gives `newerSave` for the `lv` 46 / `v` 9 codes;
   - S1 with a Map-backed localStorage: a stored `{"v":8,"lv":46…}` or `{"v":9…}` is **never overwritten** (byte-identical) and `onStale` fires once; a stored v7, v8 without `lv`, or `lv` 43 save is written normally.
6. `x`:
   - 300 random payloads within caps give byte-identical JSON;
   - over-cap keys are trimmed oldest first with a warning;
   - the total cap holds;
   - hostile input (deep nesting, 1 MB strings, `__proto__`, arrays as `x`) never throws.
7. Slices:
   - each at cap is verbatim; cap + 1 is dropped with a warning;
   - the real module sanitizers' outputs at cap (`sanitizeMissions` + `fitCap`; `sanitizeGeumbang` + `fitGeumbang`) pass byte-identically;
   - same-level pass-through: `v43_samelv_x` survives load → save byte-identical per slice and for `x`.
8. The `v43` block: fuzz; the output passes itself; `toggles` booleans are accepted.
9. G-4: `progress.got.mkt_s3 = { item_plank: 5 }` survives.
10. Size: the at-caps save is printed; it must be < 24,576 B and warns > 16,384 B.
11. `pre43`:
    - written once with byte-identical raw; never overwritten; `.2` for a second village;
    - `isGameKey` is false for it;
    - `applyVillage` leaves it in place.

**Browser (Playwright, one browser, `nice -n 10`):**

- B1 Each pre-B fixture is stored and booted:
  - in-game coin and item census = Node pre-census adjusted by refunds;
  - `restoreSkipped` is empty;
  - no onboarding and no flag maker;
  - the letter shows once (a second reload does not show it again);
  - buildings stand on the `d_*` plots; padvis subset passes.
- B2 Forced failure (`addInitScript` sets `__FV_TEST_FAIL43`):
  - the card shows;
  - `SAVE_KEY` is byte-identical after 60 s including `visibilitychange` and `pagehide`;
  - no `.chat` or settings write;
  - `pre43` is present;
  - 「코드 복사」 gives a code that `dryRun` reads back to the pre-B village.
- B3 Restore throw on a remapped save (test hook): no quarantine, `.bad` untouched, card shown.
- B4 Stored `lv` 46: update card; `SAVE_KEY` byte-identical after 60 s. Second tab: during play, write a newer save into storage; the next autosave is refused and the banner shows once.
- B5 MovePanel import:
  - v7 code (4.2.0.2) and a3 code migrate;
  - `lv` 46 code is refused with the `newerSave` text;
  - a `migrateFail` code is refused with its text;
  - `SNOWBLOOM2` codes are read; a `SNOWBLOOM3` code gives 'newer'.

### 6.2 Existing suites to update

| Suite | Why | Change |
|---|---|---|
| `save_v42.mjs` | its `migrate()` helper calls `sanitizeSave` directly (`:24`) | stays valid; add one line: `migrateSave` of each v4.1 fixture now carries `v43.lay` 2 |
| `transfer.mjs` | `newer` test uses `SNOWBLOOM2` (`:142-147`); future-save test only sets `v` (`:150-152`); dry-run equality (`:483`) | `SNOWBLOOM3` for 'newer'; add `lv` 46; `pre43` never travels; payload has `lv`; `migrateFail` |
| `store42.mjs` | stores on `w_m2`/`e_m1` (`:53-233`) | the store only goes on `d_store` now; rewrite as "an old store on `w_m2` moves to `d_store` with 6 places and its stock" |
| `plots.mjs` | builds decor on `w_m1`, the hall on `w_hall`, the `w_rest` menu (`:158-227`) | `w_hall` is a start-region hall plot; the `w_rest` menu offers the restaurant only; generic M plots offer no workshops |
| `restaurant.mjs` | `w_rest` (`:64-76`) | still valid; the hall is no longer offered there |
| `v4.mjs` | builds both XL buildings (`:276`) | hall on the new `w_hall` |
| `smoke.mjs` | builds on `e_m1` (`:363-372`) | use a house or a `d_*` plot |
| `labour.mjs` | injects a toolsmith on `e_m1` without a marker (`:251`) | it becomes `d_tool`; query by kind, or stamp `v43.lay` |
| Every suite that injects a hand-built save | it is now remapped unless it has the marker | shared helper `asStepB(save)` that adds `v43: { lay: 2 }` where a test wants post-B semantics |
| `review_robust_save(_fast).mjs` | future-version cases (`:129` / `:15`) | add `lv` cases and assert that the stored value is unchanged |
| `admin.mjs` | `adminBackup` uses `migrateSave` (`Admin.js:108`) | unchanged; re-run |
| `bakery.mjs` | uses `v43a2_bread` | re-run after the remap (its 창고 moves to `d_wh`) |

---

## 7. Order of work, effort and gates

1. **Constants and stamp** (`LV`, `isNewerSave`, `stamp`, `PRE43_KEY`); `MovePanel.js:560`; `Transfer.js:24/113/199` (`CODE_FMT` 2, `lv`); G-4 and G-5 fixes. Node tests 1, 5, 9. *≈ 0.5 d*
2. **Keep-rules:** `sanitizeV43`, `keepX`, `SLICES43`; `Game.serialize` pass-through and holders. Node tests 6–8, 10. *≈ 1.25 d* (F0 total 1.75 with step 7.)
3. **F0s hold, S1 write guard, cards and banner strings** (ko/en); `Save.clear` guard. Browser B4. *≈ 0.75 d* (= F0s)
4. **`Remap43.js`** (`remap43`, `check43`, `check43b`), `keepPre43`, `migrateSaveEx`, `Save.load` wiring, `Game.js` post-load and catch, `restoreSkipped`, failure card, `migrateFail`, 「새 단장 전 마을」 export. **Needs the final plot ids from the layout map** (§4.11; positions can still move). *≈ 1.5 d* (R43 0.75 plus part of plan §12's "migration + failure path + fixtures + transfer 3")
5. **Fixtures:**
   - 4.2.0.2 ×3 from a worktree at `38c233c`: *0.5 d*
   - a3 ×2 from HEAD: *0.25 d*
   - node-made fixtures plus `make_v43.mjs`: *0.25 d*
6. **`save_v43.mjs`** (Node and browser) plus the §6.2 suite updates. *≈ 1 d*
7. **G8 run** (failure path on every fixture), the size gate, and the full suites. Ask the designer for the Play village code before release.

Total save work ≈ 5–5.5 builder-days. This is inside v4.3's 19–22 (`engineering_roadmap.md:119`): F0 1.75, F0s 0.75, R43 + a2 fixture 0.75, 4.2.0.2 fixtures 0.5, and the rest from step B's migration line.

Gates touched:
- **G5:** save fixtures, `transfer`, `padvis` per stage.
- **G8:** forced throw or failed `check43` keeps `SAVE_KEY` byte-identical, the card shows, Transfer rejects with the reason.
- Roadmap §4.1 extra gates:
  - 4.2.0.2 fixtures
  - a2 fixture: the remap runs once and a second load is a no-op
  - newer-save refusal
  - F0 fuzz plus size
  - same-level pass-through
  - (`engineering_roadmap.md:110-114`)

---

## 8. Risks and open items

| # | Item | Mitigation / owner |
|---|---|---|
| O1 | A remap bug damages tester villages: 63 Play testers, a3 AAB testers and preview villages | `pre43`, `check43`/`check43b`, N11 hold, G8 on every fixture, the designer's village code, P1 logs `x.log.m43` |
| O2 | The plot table changes after B ships | ids are fixed now (§4.11); never re-purpose an id; only `w_hall` changes meaning (N2) |
| O3 | The plaza's `fest`/`plaza` (≈ 3 KB, "in the 빈 서랍") does not fit `X_TOTAL` 6.4 KB next to the other keys | decide at the plaza plan review (v4.6/4.7, `lv` ≥ 46, refused by v4.3 anyway): its own cap and the size gate re-run |
| O4 | Size headroom ≈ 0.8 KB at caps | measure with the oldest bot-100 fixture; first lever is trimming `x.log` and `x.mail` |
| O5 | A3 preview and Play-AAB builds cannot be patched | `CODE_FMT` 2 (N7) makes them refuse B codes; a release note says not to import v4.3 codes into older previews |
| O6 | Test churn: every suite that injects a markerless save is remapped | `asStepB()` helper; §6.2 list |
| O7 | Layout: the planned `d_labour` (1220, 1610) overlaps today's `h43_2` (1110, 1600); the plaza reserve and Q25 plots must avoid every plot that can already hold a building | layout map / `v43_layout.mjs` |
| O8 | G-4 losses already happened in a2/a3 villages (planks on 3단 and 빵집 pads) | cannot be recovered; fixed from B on |
| O9 | `MIGRATE[8]` in v5.0 must chain after `remap43`; v5.0 adds `lay` 3 | keep the remap as a layout-step table (`REMAP_BY_LAY`) next to `MIGRATE` |
