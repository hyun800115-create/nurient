# 금방 module (GB-CODE) — build report

Repository: `/home/user/nurient/frost-village` (all paths below are relative to it). Plan: `docs/geumbang_plan.md` §12.
Built 2026-10-17; **polished 2026-10-18 after `docs/build_reports/geumbang_module_critique.md`** (verdict then: NOT
READY — 1 critical, 6 high, 9 medium, 9 low). No git commit was made. No v4.2 file, prepared v5–v8 module or art file was
edited: every change is under `src/geumbang/**`, `tools/test/geumbang_lab/**`, `docs/previews/geumbang_lab_*` and this
report; what the shared files need is written as exact patches in §8 (checked against the current v4.2 code).

## Summary

The 금방 online market and delivery module for 행복한 눈꽃마을 이야기 (Phaser 3.90, 2:1 iso, PPU 64) is a standalone module
that runs inside the real v4.2 game without any v4.2 file edited (pure seeded model, Phaser views, an adapter
`ports_v4.js` with `GeumbangSystem`, a V42 system).

What the polish changed, in one paragraph per theme (finding by finding in §0):

- **The economy (C1).** In the real v4.2 depot the walk-in 솔방울 상인 empty the racks by day, so 금방 had nothing to sell
  until night. Now 금방 keeps **its own share** of what arrives on the racks (`share`: per item ≤ 4 × its catalogue weight,
  ≤ 24 in all, saved in the slice), and between village deliveries the dog sled does **금방 집하**: it loads the village
  collection piles that are ≥ 85 % full (keeping 40 %) and brings the crates to the station 짐 싣는 곳, where the cargo
  sleigh and the train take them on. Census with the real `Depot.js` rules (§5.3): the time some pile is ≥ 90 % full
  drops from 99 % (v4.2 alone) to 86 % (금방 Lv1), 64 % (+ 개썰매 2) and 59 % (all upgrades); fish 60 → 24 %, ore 68 → 31 %,
  meat 79 → 57 %; 금방 takes 9 orders a day by day; units leaving the depot +10 %, coins +24 %.
- **The broken promises (H1–H6).** Households are found at home (TownSim `placeObj`); 정 할머니's first order can no
  longer be skipped; the customer list follows the town; a part-paid 개업 pad keeps its coins and items over a reload;
  개썰매 2, 광장 보관함 and 아파트 보관함 now do what they cost; the 따라가기 caption goes away.
- **Robustness and feel (M1–M9, L1–L9).** Road changes and saves keep every parcel and crate; vans brake for the cargo
  sleigh and (with patch G-P2c) the sleigh keeps right and waits behind them — 0 overlap frames in the probe; the waiting
  book is capped at one crew round, so one van is "금방" sooner; the jokes land (two bubbles, 조금방, the slogan); the office,
  통장, 서리 소식 and 관망 parts of the plan are delivered as patches G-P16 / G-P17; HUD chip and badge no longer overlap.
- **Not met, written up**: the plan's latency targets (median ≤ 75 s at Lv1, ≤ 45 s with 3 vans) — measured 119 s
  (Lv1, real stock) and 88 s (all upgrades); with full racks one van is over capacity (§5.4). The view CPU budget
  (0.06 ms near) — 0.11–0.29 ms measured (§5.1).

Tests: **47 Node tests (46 pass, 1 skipped until G-P5 lands)**. Lab: 55 captures refreshed and looked at. In the real
game: the unpatched probe without injected stock (§4.2, 10 of 10) and every patch applied in the browser (§4.3, 33 of
33, 0 page errors); the 47 patch anchors re-checked against today's v4.2 files (§8.0).

Key files (absolute):
- `/home/user/nurient/frost-village/src/geumbang/` (module) · `/home/user/nurient/frost-village/src/geumbang/ports_v4.js` (adapter)
- `/home/user/nurient/frost-village/src/geumbang/townRead.js` (new: TownSim reads, village graph, keep-right rule)
- `/home/user/nurient/frost-village/tools/test/geumbang_lab/polish.test.mjs` (new: one test per finding)
- `/home/user/nurient/frost-village/tools/test/geumbang_lab/gb_drain.mjs` (new: the §8.2 drain census, real Depot.js)
- `/home/user/nurient/frost-village/tools/test/geumbang_lab/ingame_polish.mjs` (new: the critique's in-game checks)
- `/home/user/nurient/frost-village/tools/test/geumbang_lab/integration/apply_patches.mjs` + `patched_dry.mjs`
- `/home/user/nurient/frost-village/docs/previews/geumbang_lab_*` (captures, numbers JSON)

---

## 0. The critique, finding by finding

| ID | Result | What changed (module unless a patch is named) | Proof |
|---|---|---|---|
| C1 | **fixed** | 금방 몫 (`share`, `GbModel.topUp`, slice `res`); 금방 집하 (`Sled` states `cgo/cload/cback/cdrop`, `collect` tuning, ports `piles/takePile/dockRoom/dockDrop`); 개썰매 2 also offered when full piles wait (`collectS`) | polish C1 ×2; census §5.3; in game §4.2 |
| H1 | **fixed** | `townRead.insideOf` reads TownSim `state 'in'` + `placeObj.id '<home>:…'` (was `c.place`, never set) | polish H1 (also asserts TownSim still sets those fields); in game §4.2 |
| H2 | **fixed** | at the opening her 장작 · 빵 are set aside from the racks, the dock surplus or the log pile; the order is retried each second, other orders wait up to `firstWaitS` 60 s | polish H2; in game §4.2 |
| H3 | **fixed** | town signature checked every 2 s + the `'built'` event → `host.touch()` → AddressBook rebuild | polish H3 |
| H4 | **fixed** | pad paid coins / items in the slice (`pp`, `pi`, st 0 only); the pad is `UnlockPad` with items | polish H4 |
| H5 | **fixed** | 개썰매 2 = a second team on a shared stand queue; 광장 보관함 takes village parcels; 아파트 보관함 empties (resident passes home, 07:00, or `locker.pickS` 50 s) | polish H5 |
| H6 | **fixed** | `Follow.update` returns after `stop()`; caption hidden for good | polish H6; lab `_first_done.png`; in game §4.2 |
| M1 | **fixed** | `setRoads` releases the old vans' parcels to the pile (`ready`) and their backhaul to the dock | polish M1 |
| M2 | **fixed** | slice `dock`: sled 집하 load + van backhaul → dock surplus on load | polish M2 |
| M3 | **partly fixed** | a van alone leaves after `idleWaitS` 12 s; `maxOpen` counts waiting orders only; the waiting book is capped at one crew round (`queueRounds` 1 = vans × 8 + sleds × 4); the last tours of the day are short. Targets not met (§5.4) | polish M3; §5.4 |
| M4 | **fixed with G-P2c** (module side: improved) | vans brake for the sleigh's three body points; curbs keep off its lane while G-P2c is missing; new patch G-P2c: the sleigh waits behind a 금방 van in its lane and keeps to its right-hand lane (`townRead.keepRight`) | polish M4 ×2; probe: overlap frames 403 → 277 (module) → 0 (G-P2c) |
| M5 | **fixed** | village orders only while a sled and its stand exist; waiting ones restocked | polish M5 |
| M6 | **fixed as patches** | api `officeRow / news / watchSpot`; adapter writes `income.gb` once G-P16's strings exist; patches G-P16 (물류창고 row, 통장 bar, 소식 lines + ad, the 물류 금고 counted once) and G-P17 (관망 금방 구경) | polish M6; Node check of the patched VillageNews / agenda; `patched_dry` §4.3 |
| M7 | **fixed** | kids ask, the parent answers (two bubbles), only at households with children; 조금방 on late parcels; 촌장님 line when he stands by; 옆집, 보관함, sled lines; app header `tagline · slogan` | polish M7; lab captures |
| M8 | **fixed** | `depot.gbHoldS()` (= join − 3.2 cells) read by G-P2b; the busy window starts 0.1 after it | `patched_dry` G-P2b |
| M9 | **partly fixed** | ADD blends removed (NORMAL); the hub redraws 4 × a second while off screen; vans / sleds were already culled. Budget not met (§5.1) | lab numbers |
| L1 | **fixed** | pad = `UnlockPad` coins + 판자 20 · 주괴 10 brought by porters or the chief | polish H4 |
| L2 | **fixed** | upgrade items come from the racks, then the dock surplus; the rest is paid in coins (2 × price); the card says so | in game §4.2 |
| L3 | **fixed** | slice `nx` (next arrival) | polish L3/L4 |
| L4 | **fixed** | rows beyond 24 fold into `back` | polish L3/L4 |
| L5 | **not reproduced** | `gt()` already turns `{name}을(를)` into the right particle (josa) | — |
| L6 | **fixed** | the app's 기사님 tab has 금방 알림 (켬 / 조용히 / 끔) and 금방 문 앞 장면 rows (ports `setAlerts` / `setScenes`); G-P13's 놀이 row stays | in game §4.2 |
| L7 | **fixed** (module) | the chip slides right of the 길 안내 badge while it overlaps; G-P13's badge clamp still recommended | in game §4.2 |
| L8 | **fixed** | walkers: the chief, TownSim bodies, `gs.agents` (porters), visitors, 콩이, the sleigh | polish M4 |
| L9 | **fixed** | host `destroyed` flag guards the `RoadNet.onChange` listener | code |

Also found and fixed on the way: the 통장 counted the 물류 금고 twice once 딸랑이 is hired (DepotSystem counts its sales
when made, `Office.takeTill` again when he empties the till) — a v4.2 bug that would have doubled 금방's bar too; the fix
is one line in G-P16. The 금방 HUD chip (drawn above the HUD depth) sat on top of the 촌장 사무실 panel's first row; it now
steps aside while any game panel is open (`ui.panelOpen / buildOpen / v4PanelOpen / v42PanelOpen`, `patched_dry` check).
And the census tool `gb_drain.mjs` (plan §8.2) now exists.

## 1. Files

| Path | Files / lines | What |
|---|---|---|
| `src/geumbang/model/` | 10 / 2,420 | `GbModel`, `addresses`, `orders`, `guard`, `fulfil`, `dispatch` (Dispatcher + Sled with 금방 집하), `path`, `settle` (+ lockers), `upgrades`, `rng` |
| `src/geumbang/view/` | 12 / 2,450 | `GbView`, `GbHub`, `Van`, `VanDriver`, `Courier`, `Doorstep`, `OrderBubbles`, `Sled`, `Follow`, `GbChip`, `GbApp`, `art` |
| `src/geumbang/` | 8 / 1,596 | `host.js`, `ports_v4.js`, `townRead.js` (new), `save.js`, `tuning.js`, `strings.js`, `layout.js`, `index.js` |
| `tools/test/geumbang_lab/` | 15 / 2,832 | `geumbang.test.mjs`, `polish.test.mjs` (new), `purity.test.mjs`, `fake_env.mjs`, `gb_drain.mjs` (new), lab page + `run_lab.mjs`, `ingame_dry.mjs`, `ingame_polish.mjs` (new) |
| `tools/test/geumbang_lab/integration/` | 2 / 448 | `apply_patches.mjs` (47 anchors), `patched_dry.mjs` |

The model stays pure (no Phaser, no `window`: `purity.test.mjs`). Prepared modules are reused by import only.

## 2. How it fits

```
v4.2 objects ──ports_v4.js (adapter)──> GeumbangHost ──> GbModel (pure, seeded, events out)
                                              │                └─ serialize() -> slice `geumbang`
                                              └─> GbView (Phaser: hub, vans, couriers, doorstep, sleds, follow, chip, app)
GeumbangSystem (a V42 system): gate -> start host, the 금방 개업 pad, update, slices(), state(), hooks(H.gb), destroy()
```

- **Gate (plan §3.1)**: the v4.2 depot with its cutaway ready, the town and its street net. Then the letter (one game day,
  or racks ≥ 60 % for 120 s). The pad (`UnlockPad`): 4,000 coins + 판자 20 + 주괴 10.
- **Stock**: orders draw from 금방's share first, then the racks above `keepFloor`. The share fills from rack arrivals
  each second (first pick before the walk-in buyers). At the opening 정 할머니's 장작 4 · 빵 2 are set aside.
- **금방 집하**: an idle sled (no stand queue, day shift) picks up to two full piles reachable from its road graph
  (`villageGraphOf(WORLD.roads)`, ≤ 10 m from a road node), loads ≤ 24 crates (0.35 s each, the crates hop onto the
  basket on screen), drives to the stand and drops them on the dock (≤ 60 waiting). Parcels for the village always come
  first; a load in progress is finished.
- **Ports added** (all existing v4.2 API): `Freight.takeSurplus/addSurplus/surplusRoom/dockCount/dock`, `gs.piles[*].stack`
  (`pop`), `gs.agents`, visitors, `gs.dog.r`, the sleighs (`at`, `s`, `state`, `x/y`), `UnlockPad` items, `Settings.save`,
  `RoadNet.driveEdges`, `t()` (to see whether G-P16's strings exist), `UIScene.hud42.edge` (the 길 안내 badge).
- **Public API** `gs.v43.gb`: `open, isOpen, letterDue, stats, orders, vans, address, upgrade, deal, sell, follow, reveal,
  state, touch, offer, spurBusy, following, officeRow, news, watchSpot`.
- **Shared lane with the cargo sleigh**: vans take a spur token and wait while the sleigh is on the shared stretch; vans
  brake for the sleigh anywhere (its points are walkers). With G-P2b/G-P2c the sleigh holds before the spur while a van has
  it, waits behind a 금방 van in its lane and keeps right; once the adapter sees G-P2c in use it drops the module-only
  curb rule (curbs keep off the sleigh's lane) and the AddressBook rebuilds.
- **Save**: slice `geumbang` v1 (≤ 1,400 B), new fields `res`, `dock`, `lk`, `pp`, `pi`, `nx`, `cl`, sanitised in
  `save.js`; no `SAVE_VERSION` bump.

## 3. Lab and captures

Runner (one Chromium, fixed step, `nice -n 15`):
```
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers nice -n 15 node tools/test/geumbang_lab/run_lab.mjs --only=smoke
… --only=first | hub,van | apt,door | sled,night | app | english,desktop     [--no-gif]
```
All 55 lab files in `docs/previews/` were refreshed on 2026-10-18 (0 page errors in every group) and looked at:
`geumbang_lab_smoke.png`; the opening `_first_ceremony … _first_done` (.png) + `_first_order.gif`; `_hub_cutaway`,
`_hub_pile`, `_hub.gif`; `_van_load`, `_van_street`, `_van_drive.gif`, `_van_spur.gif`; `_apt_ring`, `_apt_courier.gif`,
`_door_fresh`, `_door_snowy`, `_door_drop.gif`; `_sled`, `_sled.gif`; `_night_hub`, `_night_street`, `_night_van.gif`;
`_app_today / orders / goods / crew / reviews`, `_chip_toast`; `_desktop`, `_english_app`, `_english_hub`.
What the polish shows there: `_first_joy` keeps the 따라가기 caption while it runs and `_first_done` has none afterwards
(H6); the app header reads "방금 시키면 금방 와요 · 금방 왔지?" (M7); the 기사님 tab lists both sled teams and the 금방
settings rows (H5, L6); no ADD-blend glow on the van roof or the hub (M9).

## 4. In the real game

### 4.1 Unpatched dry run with stock (`ingame_dry.mjs`)
As before the polish (the depot force-built and stocked through the v4.2 test hook, the module added at runtime the way
G-P1 adds it): pad (coins from the chief standing on it, 판자 · 주괴 brought by the porters: paid after 48 s), ceremony,
정 할머니 followed to the door and delivered ("아이고, 방금 시켰는데 벌써 왔네! 진짜 금방이구먼." +20), hub, bay, app. Re-run
2026-10-18: 9 captures `geumbang_lab_ingame_*.jpg` (looked at), `geumbang_lab_ingame.json`: 0 page errors, 0 404s; host +
view 0.329 ms, model 0.034 ms per frame (busy shared CPU), 133 module objects, scene 1,554, game textures 418.2 MiB
(module 10.88 MiB without G-P7), slice 703 B. Without G-P7 the courier is a plain townsfolk doll (`_ingame_first_joy`).

### 4.2 The critique's in-game checks, unpatched, **no stock injected** (`ingame_polish.mjs`)
The real game (`index.html`, the v4.1 46-minute save, one Chromium at DPR 2, `nice -n 15`), the depot built through the
v4.2 test hook but **not stocked**, the module added at runtime, the letter forced, the pad paid by standing on it, then
one game day (20 samples, 30 s apart). Results `docs/previews/geumbang_lab_ingame_polish.json`: **10 of 10 checks pass, 0
page errors**.

| Check | Before (critique `p7_ingame`) | Now |
|---|---|---|
| H2 정 할머니's order with the racks as v4.2 leaves them (0 items at 11:41) | never placed | placed (her 장작 · 빵 from the dock / the log pile), delivered |
| H6 10 s after her delivery | caption still on screen | follow inactive, caption hidden |
| H1 households at home (TownSim) | 0 of 21 home sets non-empty | 17 of 21 non-empty (53 citizens inside) |
| C1 one game day from the opening (racks 0 by day: the buyers sold 62 by 11:54) | 8 orders, 1 delivered | 20 orders, 9 delivered (77 coins, 28 units); 금방's share 0–12 units through the day |
| C1 금방 집하 | — | the sled went to the full piles (3–5 of 5 piles ≥ 85 % all day) and dropped 12 crates at the dock on the first evening; a round trip to the far piles takes ≈ 2–4 game hours |
| M6 unpatched (no G-P16) | income folded into 물류 | 214 coins in the 물류창고 bar, none lost |
| L2 an upgrade needing ingots the racks lack (0 there) | unbuyable | priced 1,000 + 6 × 2 × 10 = 1,120 coins, paid exactly |
| L6 the app's 기사님 tab | no 문 앞 장면 row anywhere | 금방 알림 · 켬 and 금방 문 앞 장면 · 켬 rows; setting them changes `Settings.data` |
| L7 the 길 안내 badge at the chip's height on the left | chip under the badge | chip slides from x 28 to 170 (hit area too) and back when the badge goes |

Not shown unpatched: the dog sled itself (without G-P6 its picture is not loaded) — §4.3 captures it at a pile.

### 4.3 Every patch applied (`integration/`)
`apply_patches.mjs` copies today's `src/` + `index.html` to a scratch directory and applies every patch of §8 as an
exact old → new replacement: **47 of 47 anchors matched, the 20 patched files pass `node --check`** (re-run at the end,
§8.0). `patched_dry.mjs` serves that copy (one Chromium, 390 × 844 at DPR 2, `nice -n 15`), loads the v4.1 46-minute
save, builds and stocks the depot through the v4.2 test hook and adds nothing else — G-P1 makes the system. Result
`docs/previews/geumbang_lab_patched.json`: **33 of 33 checks pass, 0 page errors**.

| Patch | Seen in the patched game |
|---|---|
| G-P1 | `gs.v42.gb` is a V42 system, `__FV.v42.gb()` answers, the host starts at the depot gate; serialize after a reload carries the slice |
| G-P11 | the letter arrives from "솔방울 아파트 2동 정 할머니" with its two buttons; `gb:open` hops the camera to the pad (2723, 3177) |
| G-P7 · G-P6 · G-P9 | `TF.gb` has the crew anims (`gbf_road_0`, `gbf_hub_0`); `veh_dog_sled` loaded; RoadPaint paints the apron and jog (the module's own hook off) |
| G-P13 · G-P12 | `Settings` keeps `gbAlerts` / `gbScenes`; the 놀이 tab has the 금방 알림 row (켬 → 조용히); CameraDirector listens to 금방 |
| G-P3 | the depot's own workers hidden (0 visible) while 금방 picks; racks drawn from `setShown` |
| G-P2b | the cargo sleigh holds at `gbHoldS` 35.8 while the spur is busy, then goes on (39.34) |
| G-P2c | the sleigh waits behind a 금방 van going (12 frames) and back (30), and keeps right: −0.5 cell on 역앞 거리 (a one-lane street in this save), +1.98 on 중앙로 |
| G-P16 | 통장 bars `depot` 805 · `gb` 20; 물류창고 row "금방 마켓 · 오늘 주문 5 · 배달 1 · 선반 −6" shown in the panel; the paper prints "금방, 어제 4집에 배달했어요" and "물류창고 선반이 어제보다 29% 가벼워졌어요"; a 30-coin 금방 payment adds 30 to `gb`, 0 to `depot`, and the courier's take (69) does not count it again; the 통장 tab reads "서리 은행을 지으면 열려요" before the bank |
| G-P17 | `agenda.ACTS` has `gb`, the pilot context has `gb` / `gbToday`, 금방 구경 scores 42 |
| C1 | 금방 집하: an idle dog sled loads at the full ore pile (광석 더미, drawn with G-P6) |
| G-P5 | the save has the slice (st 2, totals [12, 4, 45, 14]), `sanitizeSave` keeps it, the reload opens 금방 at st 2 with its 4 deliveries |
| (module) | the 금방 chip steps aside while the 촌장 사무실 panel is open |

Captures, looked at: `geumbang_lab_patched_hub.jpg` (the first order being picked, 고르는 중), `_patched_office_depot.jpg` (the
물류창고 tab with the 금방 row), `_patched_sled.jpg` (the dog sled with G-P6 art at its stand), `_patched_sled_collect.jpg`
(the sled at the ore pile), `_patched_settings.jpg` (the 놀이 tab's 금방 알림 row).

## 5. Numbers

### 5.1 CPU per frame, draw calls, objects, textures (lab, `geumbang_lab_numbers.json`)
Measured in headless Chromium under `nice -n 15` while the v4.2 suites ran next to it (load average 6–7 on 4 cores):
noisy, read as upper bounds. Refreshed 2026-10-18.

| View | host + view ms (avg / p95) | model ms | draw calls | module objects | scene objects |
|---|---|---|---|---|---|
| phone, 11:48, street (smoke) | 0.094 / 0.3 (was 0.143) | 0.011 | 4 | 63 | 252 |
| phone, 18:41, hub cutaway busy | 0.276 / 0.7 (was 0.175) | 0.026 | 6 | 162 | 370 |
| phone, night 00:24, 새벽배송 | 0.164 / 0.4 (was 0.215) | 0.020 | 5 | 88 | 315 |
| desktop 1280 × 800, 14:54 | 0.293 / 0.6 (was 0.331) | 0.027 | 5 | 128 | 322 |

Split of the smoke frame (ms): vans 0.020, doll compositor 0.022, hub 0.017, chip 0.006. In the hub view the hub
0.092 and the doll compositor 0.090 (the lab's stand-in compositor; in the game this is v4's `DollSprite`). Against plan
§11: model ≤ 0.02 ms — met on the street, 0.026 in the busy hub; view ≤ 0.06 near — **not met** (0.09–0.29). What the
polish did for M9: no ADD blend left (one batch), the hub redraws 4 × a second while the depot is off screen, vans and
sleds outside the view only update their position. Textures unchanged: module pages 16.03 MiB with all pages in; game
total in §4.

### 5.2 Save
Slice ≤ 1,400 B (fuzzed 300 slices, never throws); the new fields are clamped (`res` / `dock` lines ≤ 12, counts ≤ 9,999,
lockers 0–12, `pp` ≤ 100,000, `nx` 0–600). A save while a sled carries 집하 crates or a van carries backhaul puts them on
the dock at load (polish M2); a save while parcels are on a van returns them as ready (unchanged).

### 5.3 The drain census (plan §8.2, `gb_drain.mjs`, 2 game days, numbers per day)
The real v4.2 depot rules (`src/systems/depot/Depot.js`: racks, raw share, the walk-in buyers 07–20 h), the five village
piles (max 40) filled by gatherers calibrated to v4.2 CODE-2's measured pile-full shares, the stations' take, the
surplus porters (30 a minute), the station dock with the cargo sleigh (≤ 60 per 75 s into the racks) and the train
(≤ 14 per 90 s, exported). The 금방 model runs on the real v4 roads and the real old-village roads to the real piles.

| Setup | any pile ≥ 90 % | fish / log / wheat / ore / meat full % | out of the piles (porters + 집하) | sleigh → racks | exported | buyers' sales | 금방 orders (by day) | delivered | units | left the depot | coins | median / p90 s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| v4.2 alone | 99 % | 60 / 7 / 28 / 68 / 79 | 155 (155 + 0) | 87 | 64 | 65 | — | — | — | 65 | 208 | — |
| 금방 Lv1, 집하 off | 99 % | 60 / 2 / 29 / 66 / 80 | 153 (153 + 0) | 86 | 64 | 25 | 16 (8.5) | 10 | 35 | 60 | 251 | 106 / 329 |
| **금방 Lv1 (default)** | **86 %** | 24 / 2 / 27 / 31 / 57 | 154 (96 + 59) | 98 | 54 | 41 | 15 (9) | 10 | 31 | 72 | 257 | 119 / 333 |
| + 개썰매 2 | 64 % | 24 / 0 / 4 / 30 / 45 | 168 (71 + 97) | 115 | 51 | 54 | 17 (9) | 9 | 29 | 83 | 260 | 106 / 333 |
| all upgrades | 59 % | 24 / 0 / 4 / 18 / 45 | 171 (65 + 107) | 121 | 48 | 54 | 17 (9) | 10 | 32 | 86 | 266 | 88 / 132 |

Reading it: without 집하, 금방 only re-sells what the buyers would have bought (their sales fall 65 → 25) and the piles do
not change — that was C1. With 집하 the piles are emptier because the sleds take from them at 85 % (the porters wait for
90 % for 10 s); what leaves the piles is capped by the dock, sleigh and train (154–171 a day), so 집하 mostly moves the
same surplus sooner and more of it reaches the racks (87 → 98–121) instead of the train (64 → 48–54). 금방's own volume
is small (≈ 10 deliveries, 30 units a day) because it lives on its share of the racks; the coins of the depot as a whole
rise 24–28 %. It is a flow model, not the game: the piles are calibrated, the routes and households are the lab's.

### 5.4 Latency and throughput (plan §8.2 targets: median ≤ 75 s at Lv1, ≤ 45 s with 3 vans)
Fake environment with **full racks** (85 %, 30 items a minute in, no buyers: the demand case), 5 seeds × 3 game days,
orders placed 07:00–19:30, before (the code the critique reviewed) and after:

| Setup | delivered / day | median order → door (5 seeds, s) |
|---|---|---|
| before, 1 van | 17.7–21 | 444–532 |
| after, 1 van (module only) | 14–16.3 | 302–486 |
| after, 1 van (G-P2c in: no curb rule) | 14.7–16.3 | 343–407 |
| before, 3 vans + 포장 2 | 40–46 | 128–190 |
| after, 3 vans + 포장 2 (module only) | 36.3–39.3 | 175–251 |
| after, 3 vans + 포장 2 (G-P2c in) | 38.7–43 | 142–173 |

With **the real v4.2 stock** (census, §5.3): Lv1 median 119 s / p90 333 s, all upgrades 88 s / 132 s.

So one van is quicker (the waiting book is capped at one round, a van alone leaves after 12 s) but delivers fewer
parcels a day (fewer orders are taken, and the last tours end by 22:30 instead of 03:00). With three vans and no G-P2c the
module-only curb rule (curbs off the sleigh's lane, +8 m of walk) costs 25–45 % — it moves half the curbs of 역앞 거리 and
중앙로 to the far lane; with G-P2c the rule is off and three vans are back to the old speed or better. **The plan's
targets are not met.** The designer's levers, all in `BALANCE.v43.gb`: `orders.queueRounds` / `maxOpen` (shorter book),
`van.idleWaitS` / `waitS`, `hub.pickers` / `pickLineS`, `van.maxStops`, `van.avoidWalkM`, `share` (more stock by day).

## 6. Tests

```
node --test tools/test/geumbang_lab/geumbang.test.mjs tools/test/geumbang_lab/polish.test.mjs tools/test/geumbang_lab/purity.test.mjs   # 47: 46 pass, 1 skipped
nice -n 15 node tools/test/geumbang_lab/gb_drain.mjs --days=2 [--json=<file>]
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers nice -n 15 node tools/test/geumbang_lab/ingame_polish.mjs
node tools/test/geumbang_lab/integration/apply_patches.mjs . <dir outside the repo>
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers nice -n 15 node tools/test/geumbang_lab/integration/patched_dry.mjs . <that dir> docs/previews
```
`polish.test.mjs` (17 tests) has one test per finding: C1 ×2 (share with the real buyers; 집하 on the real roads), H1–H6,
M1, M2, M3, M4 ×2 (vans brake / curbs; the keep-right rule on the real lane graph), M5, M6, M7, L3/L4. The older suite now
checks the whole item balance including the share, the dock and the piles (`fake_env.balance()`), and the G-P5 parity
(skipped until `keepGeumbang` exists in `src/core/Save.js`).

## 7. Open items

1. Latency / volume below the plan's §8.2 targets (§5.4) — a designer call on the levers listed there.
2. View CPU above the plan's 0.06 ms near (§5.1); display objects 63–162 against +120 in the busiest views.
3. 금방 집하 is measured in a flow model and seen in the patched game; the 60-minute census bot in the integrated build
   (plan §8.2: raw piles, depot fill, shop empty-rates, income) is still to run.
4. Not captured: phone 360 × 640, Canvas mode, the 30-minute 관망 soak (no long soaks here).
5. Seen in v4.2 while doing this (not 금방's): the 통장 double count fixed in G-P16; the cargo sleigh's route runs on
   역앞 거리's westbound lane in both directions (G-P2c keeps it right).

---

## 8. Integration
(CURRENT v4.2 code, re-read 2026-10-18 at the end of the polish — see §8.0)

All patches are additive. Line numbers are those of today's files. Every replacement below is in
`tools/test/geumbang_lab/integration/apply_patches.mjs` byte for byte (that script is the reference when copying: it
applies each one as an exact old → new replacement that must match once). **Ship together**: G-P1 + G-P5 (without G-P5
every reload restarts 금방 at its letter), G-P6 (artifact + sled art), G-P8 + G-P9. The rest can land one at a time; the
module runs without each of them and the cost of a missing one is written with it.

### 8.0 What changed since the first report, and the re-check
- **G-P2b** now reads the hold point from the module (`depot.gbHoldS()`, critique M8) instead of a copied constant.
- **G-P2c is new** (critique M4): the cargo sleigh waits behind a 금방 van in its lane and drives in the right-hand lane.
- **G-P4** stays "none": critique H1 was the adapter's own read of TownSim, fixed in the module (`townRead.js`).
- **G-P5**'s copied range grew: `src/geumbang/save.js` lines 21–135 (the new slice fields).
- **G-P10**'s block grew: `src/geumbang/tuning.js` lines 6–67 (`share`, `collect`, `locker`, the new `van` / `orders` keys).
- **G-P11**'s string block carries the G-P16 / G-P17 strings too.
- **G-P16 is new** (critique M6): the 물류창고 tab's 금방 row, the 통장 bar, 서리 소식 lines and the ad, and one line that
  stops the 통장 counting the 물류 금고 twice.
- **G-P17 is new and optional** (critique M6): 관망's activity 금방 구경.
- **G-P13** is no longer needed for the chip / badge clash (the module moves its chip, critique L7) nor for the second
  setting (the app has both rows, critique L6); it is still the place for the 놀이 row and for saving the two settings.

Re-check (2026-10-18, after the last code change, on a fresh copy of today's `src/`): **47 of 47 anchors matched, the 20
patched files pass `node --check`, every line number quoted below is where the anchor sits today**; the patched `VillageNews` prints 금방's lines and the patched `agenda` scores
금방 구경 42 (22 after the day's first) in Node; `patched_dry.mjs` on that copy: 33 of 33 (§4.3). Owned by the v4.2 workflow and
changed since the snapshot commit: `src/core/Residency.js` and `tools/test/v42.mjs` (none of the anchors).

### G-P1 — the system, and the serialize fallback (required)
`src/systems/v42/index.js` after line 15 (`import { DepotSystem } from '../depot/DepotSystem.js';`) add:
```js
import { GeumbangSystem } from '../../geumbang/ports_v4.js';   // (금방, docs/geumbang_plan.md §12)
```
after line 29 (`  ['depot', (gs, v, s) => new DepotSystem(gs, v, s)],`) add:
```js
  ['gb', (gs, v, s, sv) => new GeumbangSystem(gs, v, s, sv)],   // (금방) after the depot it serves, before 관망
```
`src/scenes/Game.js` line 2000, in the fallback object used when `this.v42` is missing, replace
`{ v42: this.saved && this.saved.v42, bank: this.saved && this.saved.bank, logistics: this.saved && this.saved.logistics }`
with
```js
{ v42: this.saved && this.saved.v42, bank: this.saved && this.saved.bank, logistics: this.saved && this.saved.logistics, geumbang: this.saved && this.saved.geumbang }
```

### G-P2b / G-P2c — the cargo sleigh shares the street with the vans (recommended)
`src/entities/CargoSleigh.js` line 80, replace
`      case 'go': { this.s += v * dt; if (this.s >= this.len) { this.s = this.len; this.state = 'unload'; this.t = 0; } break; }`
with
```js
      case 'go': {
        // (금방 G-P2b) one lane with the 금방 van spur: hold at the module's hold point (depot.gbHoldS) while a van has it
        // (금방 G-P2c) and wait behind a 금방 van stopped or driving ahead in the same lane
        const S = this.sys, hold = S.gbHoldS ? S.gbHoldS() : 38.4;
        if (S.gbVanAhead && S.gbVanAhead(this)) break;
        const ns = this.s + v * dt;
        this.s = S.gbSpurBusy && S.gbSpurBusy() && this.s <= hold ? Math.min(hold, ns) : ns;
        if (this.s >= this.len) { this.s = this.len; this.state = 'unload'; this.t = 0; }
        break;
      }
```
lines 90–91, replace
```js
      case 'back': {
        this.s -= v * dt;
```
with
```js
      case 'back': {
        if (!(this.sys.gbVanAhead && this.sys.gbVanAhead(this))) this.s -= v * dt;   // (금방 G-P2c) behind a 금방 van in its lane
```
line 105, replace `    const [x, y] = L4(p.i - (queued ? 1.4 : 0), p.j);` with
```js
    // (금방 G-P2c) keep right: on a street the sleigh drives in its right-hand lane (src/geumbang/townRead.js keepRight)
    const ko = this.sys.gbLaneOffset ? this.sys.gbLaneOffset(this, p, gs.game.loop.delta / 1000) : null;
    const [x, y] = L4(p.i - (queued ? 1.4 : 0) + (ko ? ko.i : 0), p.j + (ko ? ko.j : 0));
```
`this.sys` is the DepotSystem; `GeumbangSystem.start()` sets `depot.gbSpurBusy` (a van holds the spur token),
`depot.gbHoldS` (3.2 cells before the van spur's join, the same rule `sleighBusy` counts from), `depot.gbVanAhead(sl)` (a
금방 van 0.3–5.5 m ahead within 1.1 m of the sleigh's line, never one waiting at the apron gate for the sleigh — no
deadlock) and `depot.gbLaneOffset(sl, p, dt)` (the right-hand lane of the RoadNet drive edge it is on, eased over ≈ 1 s:
on 역앞 거리 going east it moves to the eastbound lane — half a cell on today's one-lane track, 2 cells once the street
is a two-lane road — and on 중앙로 going back 2 cells to the +j lane; off the streets 0). With
G-P2c in, the module drops its own curb rule (§5.4). Probe (real lane graph, sleigh always busy, 3 vans, one game day):
frames with the two bodies overlapping 403 (no rule) → 277 (module only) → **0** (with G-P2c); the sleigh waits ≈ 64–99 s
a day behind vans. Without it: vans still wait for the sleigh, but the sleigh drives through a van stopped in its lane.

### G-P3 — the depot's own workers step aside; racks show 금방's unpicked lines (recommended)
`src/entities/DepotBuilding.js` line 140, replace
`    if (this.alpha > 0.05 && this.rackT <= 0) { this.rackT = 0.5; if (this.sys.model.stock.ver !== this.rackVer) this.drawRacks(); }`
with
```js
    if (this.alpha > 0.05 && this.rackT <= 0) { this.rackT = 0.5; const S = this.shownFn ? this.shownFn() : null; if ((S || this.sys.model.stock).ver !== this.rackVer) this.drawRacks(S); }
```
line 142, replace `    const vis = this.alpha > 0.3;` with
```js
    const vis = this.alpha > 0.3 && !this.gbStaffOff;     // (금방 G-P3) the 금방 crew works here instead
```
lines 179–181, replace
```js
  drawRacks() {
    const gs = this.gs, def = this.def, M = this.sys.model;
    this.rackVer = M.stock.ver;
```
with
```js
  /** (금방 G-P3) what the racks show (count / of / ver like rack.js Stock): 금방's ordered lines stay on the rack until a picker lifts them */
  setShown(fn) { this.shownFn = typeof fn === 'function' ? fn : null; this.rackVer = -1; }

  drawRacks(S) {
    const gs = this.gs, def = this.def, M = this.sys.model, stock = S || M.stock;
    this.rackVer = stock.ver;
```
line 183, replace `    const fill = rackFill(geo, M.stock);` with `    const fill = rackFill(geo, stock);`

### G-P4 — none
The adapter reads TownSim and `WORLD.v4.town` as they are (`state`, `placeObj.id`, `home`; `src/geumbang/townRead.js`).

### G-P5 — the slice survives a load (required with G-P1)
`src/core/Save.js` lines 236–237, after
```js
  const lgx = keepLogistics(raw.logistics);
  if (lgx) s.logistics = lgx;
```
add
```js
  // (금방) the geumbang slice: a local copy of the module's keep-rules (keepGeumbang below)
  const gb = keepGeumbang(raw.geumbang);
  if (gb) s.geumbang = gb;
```
and before line 400 (`/** (v4-C) the civic block: counts clamped …`) add a LOCAL copy of `src/geumbang/save.js` lines
21–135 (from `export const GEUMBANG_SLICE` through the end of `mergeGot`, every leading `export ` removed, indented),
closed over so its helpers stay private:
```js
/**
 * (금방) a LOCAL copy of src/geumbang/save.js keep-rules (slice `geumbang` v1, cap 1,400 B): lines from GEUMBANG_SLICE
 * through mergeGot, `export` dropped, closed over so its helpers (int, bit, ID …) stay private.
 * tools/test/geumbang_lab/geumbang.test.mjs 'G-P5 parity' checks it keeps exactly what sanitizeGeumbang keeps.
 */
export const keepGeumbang = (() => {
  const GEUMBANG_SLICE = { key: 'geumbang', version: 1, cap: 1400 };
  …   // src/geumbang/save.js lines 22–135, unchanged
  return sanitizeGeumbang;
})();
```
The parity test switches on by itself once `keepGeumbang` is exported. No `SAVE_VERSION` bump.

### G-P6 — late fragments and the dog sled picture (required for the artifact)
`src/core/Assets.js` line 32 (`USED_ONLY`), replace `"vehicles": ["veh_cargo_sleigh"]` with
`"vehicles": ["veh_cargo_sleigh", "veh_dog_sled"]`; line 45 (`LATE_FRAGMENTS`), replace the ending
`'officefolk', 'chief2', 'audio7'];` with `'officefolk', 'chief2', 'audio7', 'geumbang', 'geumbangfolk', 'ui6', 'audio8'];`
(keep both on one line: `tools/build/build_artifact.mjs` parses them). Without it the dog sleds — deliveries and 금방 집하
— run but are not drawn.

### G-P7 — the 금방 crew anims in the doll runtime (recommended)
Copy `tools/geumbangfolk_compose.js` byte for byte to `src/core/folk/geumbangfolk_compose.js`. `src/core/Townfolk.js`
after line 246 (`import { mergeOfficefolk, installOfficefolkRuntime } from './folk/officefolk_compose.js';`) add:
```js
import { mergeGeumbangfolk, installGeumbangfolkRuntime } from './folk/geumbangfolk_compose.js';   // (금방 G-P7)
```
lines 296–299, replace
```js
      this.ofResident = (this.T.ofPages && this.T.ofPages.resident) || 'sack';
      return true;
    } catch (e) { console.error('[TF] officefolk merge', e); return false; }
  },
```
with the same four lines plus `      if (this.gb) installGeumbangfolkRuntime(this);     // (금방 G-P7) the crew rules again over the new block`
before `return true;`, and after the closing `},` the method `mergeGeumbangfolk(gm)` exactly as in `apply_patches.mjs`
(merge, new `Townfolk`, clear `_defs` / `_frames` / the `tf:` char cache, `installGeumbangfolkRuntime`). Without it the
crew and couriers wear plain townsfolk looks.

### G-P8 — the 금방 places in WORLD
`src/data/world.js` after lines 739–740 (`  treeGaps: [[6000, 2450, 6150, 2850], [3300, 3300, 3700, 3460]],` and `};`)
add:
```js

// ── (금방, docs/geumbang_plan.md §4) 금방 자리: src/geumbang/layout.js GB_LAYOUT 위에 덮어써요 (gbLayout). paint = 1번 문 앞마당
//    (lgx_dock 을 j −27.6 → −29.6 로 넓혀요) + 밴 샛길이 중앙로로 들어가는 S자 (RoadPaint.addV42Streets 가 흙길로 칠해요)
WORLD.v43 = { gb: { paint: [{ i: [32.3, 36.3], j: [-29.6, -27.6] }, { i: [30.0, 34.0], j: [-19.8, -18.0] }], openPad: [26.0, -32.2] } };
```

### G-P9 — RoadPaint paints them
`src/systems/RoadPaint.js` line 112, before `    const walk = (S.find((q) => q.axis === 'path') || {}).pts || [];` add:
```js
    // (금방 G-P9) the bay-1 apron and the van spur's S-jog onto 중앙로 (WORLD.v43.gb.paint): the module's own bake hook steps aside
    const GBP = (WORLD.v43 && WORLD.v43.gb && WORLD.v43.gb.paint) || [];
    for (const r of GBP) rects.push({ i: r.i, j: r.j, key: 'road_dirt' });
    if (GBP.length) this.gbPainted = true;
```

### G-P10 — the balance block (optional: the module carries the same defaults)
`src/data/balance.js` lines 554–556 (`    train: { … labels: 3 },`, `  },`, `};`): keep the first two lines, then add
```js
  // ── (금방, docs/geumbang_plan.md §8.1) 온라인 마켓 · 배달. src/geumbang/tuning.js GB_TUNING 과 같은 값 (gbTuning 이 기본값 위에
  //    덮어써요: 빠진 값은 기본값, 타입이 다른 값은 무시)
  v43: {
    gb: { …the object literal of src/geumbang/tuning.js lines 6–67 (GB_TUNING), with its Korean comments… },
  },
};
```
The designer's levers of §5.3 / §5.4 live here (`share`, `collect`, `orders.queueRounds`, `van.idleWaitS`, `van.avoidWalkM` …).

### G-P11 — the letter and its button (+ the strings of G-P16 / G-P17)
`src/systems/VillageNews.js` after line 126 (`      case 'banker': return [{ k: 'lt_banker_b1', act: 'reply' }];`) add:
```js
      case 'geumbang': return [{ k: 'lt_geumbang_b1', act: 'gb:open' }, { k: 'lt_geumbang_b2', act: 'later' }];   // (금방 G-P11)
```
before line 150 (`  /** a new letter (from the mailbox) */`) add:
```js
  /** (금방 G-P11) a module's own letter, once (src/geumbang/ports_v4.js letters.offer('geumbang')) */
  offerLetter(tpl) { if (this.once.has(tpl)) return true; return !!this.deliver(tpl); }

```
`src/systems/office/Office.js` after line 369 (`    else if (act === 'depot') { … }`) add:
```js
    else if (act === 'gb:open') { const p = v.gb && v.gb.pad, D = v.depot && v.depot.building; if (p) hop(p.x, p.y); else if (D) hop(D.x, D.y); }   // (금방 G-P11) the 금방 개업 pad
```
`src/data/strings.js` after line 380 (`    lt_cafe_b1: '물류창고 터 보기', lt_cafe_b2: '고마워요',`) add:
```js
    // (금방 G-P11 / G-P13)
    lt_geumbang_from: '솔방울 아파트 2동 정 할머니', lt_geumbang_body: '촌장님, 요즘 역까지 장 보러 가기가 힘들어요. 물류창고에 물건이 그렇게 많다던데, 집 앞까지 갖다 주면 안 될까요? — 셈이: 이름은 \'금방\' 어때요? 방금 시키면 금방 가니까요.',
    lt_geumbang_b1: '금방 개업 자리 보기', lt_geumbang_b2: '조금 더 생각해 볼게요',
    set_gbAlerts: '금방 알림', gbAlerts_on: '켬', gbAlerts_quiet: '조용히', gbAlerts_off: '끔',
    // (금방 G-P16 / G-P17)
    inc_gb: '금방', news_gb_day: '금방, 어제 {a}집에 배달했어요', news_gb_racks: '물류창고 선반이 어제보다 {a}% 가벼워졌어요',
    ad_gb: '광고 · 금방 마켓 · 금방 뭐가 왔지? 금방이 왔지!', pact_gb: '금방 구경하는 중',
```
and after line 755 (`    lt_cafe_b1: 'See the depot site', lt_cafe_b2: 'Thank you',`) add:
```js
    // (Geumbang G-P11 / G-P13)
    lt_geumbang_from: 'Grandma Jeong, Pinecone Apartments 2', lt_geumbang_body: 'Chief, the walk to the station shops is getting hard for me. They say the depot is full of goods. Could they bring things to my door? — Sem: How about calling it "Geumbang"? Order now, here in a moment.',
    lt_geumbang_b1: 'See the Geumbang pad', lt_geumbang_b2: 'Let me think about it',
    set_gbAlerts: 'Geumbang alerts', gbAlerts_on: 'On', gbAlerts_quiet: 'Quiet', gbAlerts_off: 'Off',
    // (Geumbang G-P16 / G-P17)
    inc_gb: 'Geumbang', news_gb_day: 'Geumbang delivered to {a} homes yesterday', news_gb_racks: 'The depot racks are {a}% lighter than the day before',
    ad_gb: 'Ad · Geumbang Market · What came just now? Geumbang did!', pact_gb: 'watching Geumbang',
```
Without G-P11: a banner stands in for the letter; the pad appears either way.

### G-P12 — 관망 cuts
`src/systems/pilot/CameraDirector.js` after line 26 (`    this.onBuilt = …`) add
```js
    this.onGb = (e) => { if (e && e.t === 'gb:arrive' && Number.isFinite(e.x)) push('cut_gb', e.x, e.y - 40); };   // (금방 G-P12)
```
after line 30 (`    gs.events.on('built', this.onBuilt);`) add `    gs.events.on('gb', this.onGb);`; after line 80
(`    gs.events.off('built', this.onBuilt);`) add `    gs.events.off('gb', this.onGb);`; after line 63
(`    if (ui && (ui.panelOpen || ui.buildOpen || ui.v4PanelOpen || ui.v42PanelOpen)) return;`) add
```js
    const GB = gs.v43 && gs.v43.gb; if (GB && GB.following && GB.following()) return;   // (금방 G-P12) 따라가기 has the camera
```

### G-P13 — the 놀이 row and the saved settings (recommended)
`src/scenes/UIv42.js` line 247, replace
`ey = Phaser.Math.Clamp(p.y, ex < ui.W * 0.45 ? 480 : 220, ui.H - 240 - View.safeBottom);` with
```js
gbOn = !!(ui.gs && ui.gs.v43 && ui.gs.v43.gb && ui.gs.v43.gb.isOpen()), ey = Phaser.Math.Clamp(p.y, ex < ui.W * 0.45 ? (gbOn ? 550 + (View.safeTop || 0) : 480) : 220, ui.H - 240 - View.safeBottom);   // (금방 G-P13: below the 금방 chip)
```
`src/core/Save.js` line 578, replace
`    pickup: 'auto', nav: true, halo: true, observeAfter: 60, observeEvents: true, observeSpend: 'none' },` with
```js
    pickup: 'auto', nav: true, halo: true, observeAfter: 60, observeEvents: true, observeSpend: 'none',
    // (금방 G-P13) 금방 알림 'on' | 'quiet' | 'off' · 금방 문 앞 장면 (첫 주문 따라가기 / 띵동 장면)
    gbAlerts: 'on', gbScenes: true },
```
after line 597 (`      this.data.observeSpend = s.observeSpend === 'hire' ? 'hire' : 'none';`) add:
```js
      this.data.gbAlerts = s.gbAlerts === 'quiet' || s.gbAlerts === 'off' ? s.gbAlerts : 'on';     // (금방 G-P13)
      this.data.gbScenes = s.gbScenes !== false;
```
`src/scenes/UI.js` line 1050 (the `set_playHint` text of the 놀이 tab): the 금방 알림 row once 금방 is open, else the
hint (exact text in `apply_patches.mjs`). Without G-P13: the app's two setting rows work for the session (the settings
file keeps them but `Settings.load` drops unknown keys), and the module's chip steps aside for the badge.

### G-P14 — build (for the v4.2 build owner)
Unchanged: with G-P6, `build_artifact.mjs` packages the four fragments through `LATE_FRAGMENTS` and keeps the rest of
`vehicles` out through `USED_ONLY` (17 source files: geumbang 5, geumbangfolk 5, ui6 3, audio8 2, `veh_dog_sled` 2).

### G-P15 — layout tests (for the v4.2 test owner)
Unchanged: the bay-1 apron corner inside the tree gap, the pad clear of the depot door pad, the sign / sled stand /
lockers on free cells, the spur points on painted cells.

### G-P16 — the office, the 통장 and 서리 소식 (recommended; critique M6)
`src/scenes/OfficePanel.js` line 258, replace
`    const inc = O.income, keys = ['market', 'trade', 'store', 'rest', 'tax', 'station', 'export', 'depot'];` with
```js
    const GBo = this.gs.v43 && this.gs.v43.gb;   // (금방 G-P16) its own bar once it is open
    const inc = O.income, keys = ['market', 'trade', 'store', 'rest', 'tax', 'station', 'export', 'depot'].concat(inc.gb || (GBo && GBo.isOpen()) ? ['gb'] : []);
```
after line 294 (`    Dp.sleighs.forEach((sl, i) => this.text(… '🛷 ' + t(sl.stateText()) + ' · ' + sl.count(), 20, '#5b6676'));`) add:
```js
    // (금방 G-P16) 금방 마켓 · 오늘 주문 · 배달 · 선반 −
    const GBd = this.gs.v43 && this.gs.v43.gb;
    if (GBd && GBd.isOpen()) this.text(B.x0 + 40, y0 + 190 + Dp.sleighs.length * 40 + 12, GBd.officeRow(), 20, '#8a5a2a');
```
line 147, replace
`      case 'depot': { const Dp = v.depot; return Dp && Dp.built ? Dp.model.stock.ver + ':' + Dp.sleighs.map((x) => x.state + x.count()).join(',') : 'none'; }`
with
```js
      case 'depot': { const Dp = v.depot, GBk = this.gs.v43 && this.gs.v43.gb; return Dp && Dp.built ? Dp.model.stock.ver + ':' + Dp.sleighs.map((x) => x.state + x.count()).join(',') + ':' + (GBk && GBk.isOpen() ? GBk.officeRow() : '') : 'none'; }
```
line 200, replace `    this.text(B.x0 + 44, B.top + 300 + p.lines.length * 70 + 10, t('ad_' + (p.day % 4)), 18, '#8a5a2a');` with
```js
    const GBn = this.gs.v43 && this.gs.v43.gb, gbAd = !!(GBn && GBn.isOpen() && p.day % 2 === 1);   // (금방 G-P16) every other paper
    this.text(B.x0 + 44, B.top + 300 + p.lines.length * 70 + 10, t(gbAd ? 'ad_gb' : 'ad_' + (p.day % 4)), 18, '#8a5a2a');
```
`src/systems/office/Office.js` line 316, replace `    if (n > 0) this.income[q.name] = (this.income[q.name] || 0) + n;` with
```js
    // (금방 G-P16) the 물류 금고's coins are counted when they come in (DepotSystem's sales, 금방's orders): not again here
    if (n > 0 && q.name !== 'depot') this.income[q.name] = (this.income[q.name] || 0) + n;
```
(today `DepotSystem.update` adds every sale to `income.depot` and `takeTill` adds the same coins again when 딸랑이 empties
the 물류 금고 — the 물류창고 bar doubles; with 금방 its coins would count in two bars.)
`src/systems/VillageNews.js` after line 79 (`    if (T.visitors > 0) H.push(['news_visitors', T.visitors, 0]);`) add:
```js
    // (금방 G-P16) yesterday's 금방: the homes it delivered to, the racks it lightened (src/geumbang/host.js newsLines)
    const GB = this.gs.v43 && this.gs.v43.gb;
    if (GB && GB.news) for (const h of GB.news()) H.push(h);
```
The module side: `gs.v43.gb.officeRow()` ("금방 마켓 · 오늘 주문 6 · 배달 4 · 선반 −15"), `news()` (`['news_gb_day', n, 0]` after a
day with deliveries, `['news_gb_racks', p, 0]` when the racks are ≥ 5 % lighter than at the day before's start), and the
adapter writes order money to `income.gb` as soon as the `inc_gb` string exists (G-P11's block), else to `income.depot`.
Without G-P16: 금방's coins show inside the 물류창고 bar; no paper lines, no ad, no office row.

### G-P17 — 관망 "금방 구경" (optional; critique M6)
`src/systems/pilot/agenda.js` line 15, append `'gb'` to `ACTS` (`…, 'rest', 'dog', 'gb'];   // (금방 G-P17: gb last)` —
last, so the other acts draw the same random numbers as today); line 17 `rest: [20, 40], dog: [15, 15] };` →
`rest: [20, 40], dog: [15, 15], gb: [12, 25] };`; line 20 `rest: 60, dog: 90 };` → `rest: 60, dog: 90, gb: 240 };`; line
28 append `'gb'` to `HANDS_FREE`; after line 49 (`    case 'dog': return c.dog ? … : null;`) add:
```js
    // (금방 G-P17) 금방 구경: a 금방 van at a door / loading nearby — the day's first one before the afternoon chores
    case 'gb': return c.gb ? 22 + (c.gbToday ? 0 : 20) : null;
```
`src/systems/pilot/ChiefPilot.js` after line 148 (`      dog: !!(gs.dog && gs.dog.r && …),`) add:
```js
      // (금방 G-P17) something 금방 to watch near him (src/geumbang/host.js watchSpot); the running watch keeps its target
      gb: doing === 'gb' ? !!(this.act && this.act.target) : !!(gs.v43 && gs.v43.gb && gs.v43.gb.watchSpot && gs.v43.gb.watchSpot(p.x, p.y, 1500)),
      gbToday: this.gbDay === today && doing !== 'gb',
```
after line 192 (`      case 'dog': { … this.lastDog = this.t; break; }`) add:
```js
      case 'gb': {   // (금방 G-P17)
        const w = gs.v43 && gs.v43.gb && gs.v43.gb.watchSpot ? gs.v43.gb.watchSpot(p.x, p.y, 1500) : null;
        if (w) st.target = { x: w.x, y: w.y, fx: w.fx, fy: w.fy };
        const ck = gs.v4 && gs.v4.clock;
        this.gbDay = ck && ck.on ? ck.day() : -1;
        break;
      }
```
after line 309 (`      case 'dog': return t('act_dog');`) add `      case 'gb': return t('pact_gb');   // (금방 G-P17)`; before
line 241 (`    if (a.act === 'train') {`) add
```js
    if (a.act === 'gb' && a.target && Number.isFinite(a.target.fx)) { p.doAction('wave', 6, a.target.fx, a.target.fy); return; }   // (금방 G-P17) waves to the 금방 crew
```
`watchSpot(x, y, r)` returns the nearest of: a van at a curb (the courier at a door), a van loading in bay 1, a sled
loading at a pile, within r px. Score 42 the day's first time (above 업무 40, below the day's train watch 55), 22 after;
kept 12–25 s, not again for 240 s. Checked in Node on the patched copy (score 42 / 22 / null; 200 seeded choices with
업무 also possible: 금방 구경 41, 업무 159).
