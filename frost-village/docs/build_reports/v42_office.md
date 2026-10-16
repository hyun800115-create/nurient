# v42_office build report — 촌장 사무실 (CONTRACT_V42 §AI)

The chief's office set: `assets/office/`, 5 files (the §AI file budget), 241,073 bytes on disk.
- `chief_office`: a cutaway building in the civic / logistics layer contract. It has 8 layers and 7 animated overlays, and it carries every point, polygon and draw field from §AI.1.
- `office_mailbox`: the outdoor mailbox, with `flag` and `pop` anims.
- Six items: `item_coin_sack_s/m/l`, `item_letter_bundle`, `item_newspaper_bundle` and `item_ledger`.

**This version is the polish pass** on `docs/build_reports/v42_office_critique.md` (verdict "polish": 2 high, 6 medium, 9 low). The section [Polish](#polish-v42_office_critiquemd) lists every finding with what changed and the measured result; `docs/previews/off_polish_before_after.png` shows the critic's cases before and after.

Status:
- `off_check.py` reports **0 errors, 0 warnings** (it gained a rule for every finding it can measure, listed under Checks).
- The headless Phaser 3.90 test now draws the office with the game's own renderer, `src/entities/Cutaway.js` (imported unchanged), and the real staff (officefolk + chief2). It found all 66 frames (0 missing), registered 8 anims with 8 playing, and placed 10 people. The reveal toggle passed (closed → open → closed, a tap outside does nothing). The closed look drawn by Cutaway.js differs from `_shell` + `_props` in **0 px** (before the polish: 25,400 px, with the night glow on by day).
- Phone captures were taken at zoom 0.6, 1.0 and 1.2, by day and at night, and looked at.
- The packer refuses to run (exit 1, nothing written) when the render cache is empty.

The look: a cosy cottage-office in the 마을회관 family, not a bank.
- Outside: cream plaster between honey-brown timber posts on a pale stone plinth, and a snowy teal gable roof with a pinecone finial and a brick chimney. Tall white windows have little red curtains and teal flower boxes. There is a teal double door under a fan light, a blank cream sign board (the game writes 촌장 사무실 on it), and a lantern post with a teal pennant.
- Inside it is warm and busy:
  - striped wallpaper over a timber wainscot;
  - the green chalkboard 재고판, the pinned village map, the cork notice board, the pigeonhole mail shelf, a clock and the key board;
  - a pot-belly stove with a red kettle and a brass-rimmed fire door;
  - the chief's walnut desk on a round red-and-gold rug, with a high red wing chair, a desk lamp, a little globe and a stamp;
  - two clerk desks with typewriters, a phone, lamps, an abacus and ledgers;
  - the secretary's desk with a flower vase and a desk bell;
  - the courier corner: a hollow green iron safe on an oak plinth (coin stacks, gold bars and a coin bag show when its door opens), coin sacks, and a counting table with coin stacks;
  - a visitor bench with yellow and teal cushions on a round rug, two plants, and a coat rack with a scarf and an umbrella.

## Polish (v42_office_critique.md)

| Finding | Result | What changed | Measured after |
|---|---|---|---|
| **H1** cutaway block vs `src/entities/Cutaway.js`: night glow by day, doubled shadow, inside layers on while closed | fixed | `cutaway` block rewritten for Cutaway.js: `_glow` left out of `drawOrder` and moved to `cutaway.night` + `nightRule` (draw only while closed and `dayClock.lightsOn`); `layers.front` = `_interior_front` (Cutaway.js hides `interior` / `back` / `front` while closed); `inside` list; `insideShadowDepthOffset`. `_floor` keeps only what lies under the fully opaque closed shell: its plinth fringe and the open-building ground shadow moved to `_shell_cut`, which Cutaway.js shows only while revealed | Cutaway.js closed look vs `_shell` + `_props`: **0 px** in the Phaser pixel test, 0 px in `off_check` (on 3 backgrounds; also 0 px for the v5 BankBuilding rule "draw every layer"); `_floor` outside the opaque shell: 0 px |
| **H2** door frame in `_shell_cut` slices 소복이's face | fixed | the door frame in `_shell_cut` is two short jamb posts at stub height (no 2.2 m posts, no lintel); clerk desk 2 is 0.28 m shorter at its +Y end (which also opens a gap in front of the filing cabinet). Probing every seat with real people found two more heads under desks: 총총이 behind desk 1 and 딸랑이 behind the chief's desk on screen. The secretary desk and the counting table now render in `_shell_cut` (render group `cutdesk`) and their sitters sit in band `front` (`deskBands`) | head boxes (top 30 px seated / 40 px standing, 40 px wide) covered by `_shell_cut` (+ desks for band `behind`): **0 %** for all 13 seats, work spots and the pad (rule ≤ 10 %) |
| **M1** bench crowded, plant in the leg space, seats 0.5 m apart, bench hides the chief's desk | fixed | bench moved 0.5 m into the front-right corner, 1.36 m long with a lower back; the plant in front of it is gone (one fern now stands between the secretary desk and the bench) | seats **0.71 m** apart (≥ 0.7); nothing taller than 0.3 m in either leg space (checked against `furnitureM`) |
| **M2** `chiefDeskPad` right behind the bench backrest | fixed | the pad moved to the desk front's left half, (0.07, 0.20) m; the bench moved away (M1) | pad ≥ 0.35 m from every `_interior` footprint taller than 0.3 m (`off_check`) |
| **M3** `safePoint` inside a wall circle | fixed | `wallCircles` rebuilt: **11 circles** from a greedy cover that keeps every standing spot and the door path clear by the agent radius (16 px, the player) and every seat floor point by 8 px, and closes every wall sample except the doorway | `safePoint` clearance 25 px (≥ 16); every staff spot, pad, stove spot and the door path ≥ 16 px; 0 open wall samples |
| **M4** mailbox flag does not read | fixed | `down` = the flag lies along the box side, below the snow cap; `up` = the arm stands vertical on a longer arm (0.5 m) | the raised flag rises **13 px** above the down silhouette (≥ 10) |
| **M5** safe half hidden in the cut view, `open` shows no inside | fixed | the safe is hollow (dark lined cavity, a shelf of four coin stacks, two gold bars and a tied coin bag, with a faint warm glint) and stands on a 0.32 m oak plinth; the right wall's cut sill over it is gone | the stub covers **18 %** of the door (≤ 25; before 70 %); 229 gold px show where the shut door was |
| **M6** one atlas page: the closed office keeps the inside resident | won't fix at source (needs the lead) | §AI names one `office_bld` page and an `office_items` atlas, and other jobs' tools load `office_bld` as one page. The manifest now carries `pageSplit`: the measured split and the exact recipe for `tools/build/pack_pages.py` (`TOWN_SPLIT['office_bld']`, the same mechanism as `town_civic`) | closed share **2.20 MiB**, inside **2.55 MiB** (one page 4.61 MiB). Without the split, plan §13.2 must book the full page |
| **L1** crowded work spots | fixed | shelf spot and stove spot apart; cabinet spot in the gap between the clerk desks; board spot at the board's right half; counting table 0.33 m nearer the front; the safe spot 0.3 m in front of the door | busy pairs: shelf–stove 0.93, board–딸랑이 1.26, board–safe 0.75, board–chief 1.13, safe–딸랑이 0.78 m (all ≥ 0.75) |
| **L2** animated parts very small | partly fixed | `typewriter_a` and `lamp_a` re-spaced on desk 1 (the typewriter 0.19 m toward −Y), so less of 셈이's typewriter hides behind the lamp shade | `typewriter_a` frame 0 shows 342 opaque px (was 275). The stove fire window (14 × 13 px) and the key-hop / phone motions stay small (won't fix: re-scaling props would break the room's scale); the kettle steam and chimney smoke (`fxPoints`) carry the "alive" read, as the critic suggests |
| **L3** coin sacks too alike | fixed | S / M / L spread ~+37 % per step; L spills a few coins at its foot | widths **26 / 34 / 48 px** (≥ +30 % per step) |
| **L4** `reveal.states` naming | fixed | states are now `closed` / `open` (the contract look: shell 0.12 + stubs, the default) / `bare` (no walls, no stubs; close-ups only); `aliases: {cut: "open"}` | `off_check`: open = 0.12 + stubs, no `half`, default `open` |
| **L5** outside-prop depth rule ambiguous | fixed | `conventions.outsideActors`: an outside actor / prop in front of the building gets depth `max(world y, building depth + top)` (+ y × 1e-6); the harness uses it for the mailbox | — |
| **L6** sign tiny; ghost text in the cut view | fixed | the sign board is 2.5 × 0.64 m; `signRect` 104 × 28 (was 83 × 25) px; `hideBelowShellAlpha` 0.5 (the harness hides the text while revealed) | — |
| **L7** previews use stand-ins | fixed | every preview, GIF and Phaser capture uses officefolk (셈이 `desk_write`, 소복이 `desk_type`, 총총이 `desk_phone`, 딸랑이 `desk_count`, standing work anims, townfolk2 `sit` visitors) and chief2 (`sit_write` + its `_desk` forearm overlay, `warm_hands`) | — |
| **L8** inside staff have no contact shadow | fixed on the art side | `cutaway.insideShadowDepthOffset` −0.449 (just above `_floor`) + `conventions.insideShadows`; previews and harness draw inside shadows there. Character.js still draws shadows at `DEPTH.SHADOW`: CODE-2's change | — |
| **L9** `half` state muddy | fixed | `half` dropped | — |

What the before / after sheet shows (`docs/previews/off_polish_before_after.png`): H1 the closed office drawn by Cutaway.js (glow off by day, one shadow); H2 소복이 at desk 2 with no door post across her face; M1 / M2 the bench in the corner with room for the chief at his pad; M5 the open safe with its treasure above the stub; M4 the flag down / up; L3 the three sacks.

## Files and keys

| File | What | Size |
|---|---|---|
| `office/manifest.json` | sprites, conventions, atlases (§2 format: `version`, `generator`, `conventions`) | 37.8 KB (was 30.5) |
| `office/office_bld.png` + `.json` | the 8 layers, 7 overlays (19 frames) and 4 mailbox frames; trimmed, `sourceSize` kept, MaxRects-packed, palettised (libimagequant) | **1120 × 1080, 4.61 MiB RGBA source-sum** (budget 5.5; was 968 × 1352, 4.99 MiB), 185 KiB on disk |
| `office/office_items.png` + `.json` | the 6 items | 104 × 112, 0.04 MiB, 6 KiB |

Sprites (23):
- `chief_office` — the closed look; its frame is `chief_office_shell`.
- Layers (`kind: layer`, `of: chief_office`):

  | Layer | depthOffset | Holds |
  |---|---|---|
  | `chief_office_floor` | −0.45 | floorboards, rugs, the chief's dais (only under the opaque closed shell) |
  | `chief_office_back` | −0.40 | back and left walls with everything on them |
  | `chief_office_interior` | −0.30 | furniture behind people |
  | `chief_office_interior_front` | −0.10 | the chief's desk and the two clerk desks |
  | `chief_office_shell_cut` | −0.02 | wall stubs at 1.2 m, sills, short door jambs, the secretary desk + counting table, the plinth fringe and the open ground shadow |
  | `chief_office_shell` | 0 | the closed building, outdoor props and the closed ground shadow |
  | `chief_office_glow` | +0.005 (NORMAL blend) | night windows + lantern; in `cutaway.night`, not in `drawOrder` |
  | `chief_office_props` | +0.01 | steps, lantern post |

- Overlays (`kind: overlay`):

  | Overlay | Frames | Anims / states |
  |---|---|---|
  | `chief_office_typewriter_a`, `_typewriter_b` | 4 | `type` 10 fps loop; frame 0 = still |
  | `chief_office_phone` | 2 | `ring` 8 fps loop |
  | `chief_office_stove` | 4 | `fire` 6 fps loop |
  | `chief_office_lamp_a`, `_lamp_b` | 2 | `states.warm` / `states.alert` (red shade) |
  | `chief_office_safe` | 2 | `states.shut` / `.open` (the cavity with coins and gold shows), `anims.open` / `.close` 6 fps |

- `office_mailbox` — kind `prop`.
  - `anims.flag`: 2 frames, down → up.
  - `anims.pop`: 3 frames at 12 fps. The flag springs past vertical, wobbles back and settles up.
  - `states.down` / `.up`, plus `slotPoint` and `flagPoint`.
- `item_coin_sack_s`, `_m`, `_l`, `item_letter_bundle`, `item_newspaper_bundle`, `item_ledger`.
  - Each is 72 × 72 with anchor **[0.5, 0.86]**, as the contract says.
  - Each has `stackStep`, `carryScale` 0.65, `icon: true`, `topPx` and `sizeClass`.

## chief_office numbers

| Field | Value | Contract |
|---|---|---|
| frameSize / anchor | **[634, 512]** / [0.42902, 0.62305] (anchor px 272, 319) | ≤ [640, 576] / ≈ [0.42, 0.63] |
| footprintM / footprintPoly | [5.6, 4.4] / [[−226, −14], [27, 113], [226, 14], [−27, −113]] | ≈ [[−227, −13], [27, 113], [227, 13], [−27, −113]] |
| topPx / floorLiftPx | 316 / 17 | ≈ 300 / 14–18 |
| doorPoint / entryPoint | [−214, 34] NE (outside) / [−148, −15] NE (front) | |
| chiefDeskPoint / chiefDeskPad | [80, −66] SW (behind, seat height) / [12, −20] NE (front) | |
| deskPoints (sem, bok, chong, ttal) | [−79, −97] SE, [−145, −64] SE, [−48, −18] SW, [97, −12] SE (seat height); `deskBands` behind, behind, **front, front** | SE, SE, SW, SE |
| board / cabinet / mailShelf / safe | [140, −21] NE behind / [−93, −58] NW behind / [−45, −91] NW behind / [143, 3] NE front | |
| boardRect / signRect | point [125, −123], 85 × 43 px, shearY 0.5 / point [−177, −140], 104 × 28 px, shearY 0.5, hideBelowShellAlpha 0.5 | |
| stovePoint / seatPoints | [11, −81] / [11, 24], [43, 40] SW (front, seat height) | |
| mailboxPoint / outdoorProps | [−181, 69] NE (outside) / `office_mailbox` at [−143, 56] | |
| staffPoints | 5: board, cabinet, shelf (behind), safe, door (front) | ≥ 5 |
| wallCircles | **11** `[dx, dy, r]`, r 29–61 px in the Collision metric, centred on or just outside the wall lines; open only across the doorway (X −2.14…−1.06 m) | ≈ 10 |
| furnitureM | 17 inside furniture footprints (building metres, top height, layer) | (extra) |
| walkPoly / revealPoly | 8 vertices (lifted floor, with a notch out through the doorway) / 12-vertex hull of the closed building | |

Layers, overlays and patches all share the frame and the anchor; `off_check` compares their opaque bounds. Every inside point includes the 17 px floor lift, and the seat points also include the 0.45 m seat height (25 px).

## How the game uses it

- **Renderer.** `src/entities/Cutaway.js` draws the office from `chief_office.cutaway` unchanged: `layers.interior` / `.back` / `.front` are hidden while closed, `fade.layer` (`_shell`) tweens to 0.12, `cut.layer` (`_shell_cut`) is visible with alpha = reveal, and every other `drawOrder` entry is drawn always at `base + 0.01 × index`. With this block that gives exactly `_shell` + `_props` by day (`off_check` simulates it; the Phaser test measures it).
  - People: `cw.slotDepth('@behind' | '@front', y)`. Desk sitters use `deskBands` (셈이, 소복이: behind; 총총이, 딸랑이: front); everyone else uses `pointSlots` / `staffBands`.
  - Inside contact shadows at building depth + `insideShadowDepthOffset` (−0.449), never at `DEPTH.SHADOW` (under `_floor`).
  - chief2's `_desk` forearm frames right after `_interior_front` (the harness does it).
  - Outside actors / props (the mailbox, the postman, the chief on the steps): `max(world y, building depth + top)` when the `frontTest` says they are in front, else plain y.
- **Reveal** (plan §6.3): chief within 260 px of the door (60 px hysteresis), an open panel, the 관망 camera, or a tap inside `revealPoly`.

  | State | `_shell` | `_shell_cut` | Inside | Use |
  |---|---|---|---|---|
  | `closed` | 1 | 0 | off | + `_props`, + `_glow` at night |
  | `open` (default; alias `cut`) | 0.12 | 1 | on | the contract's open look |
  | `bare` | 0 | 0 | on | close-ups / screenshots (no ground shadow) |

  `fade` = { openAlpha 0.12, 260 ms }. The inside layers and the inside staff exist only while revealed.
- **Night.** `_glow` is in `cutaway.night`, not in `drawOrder`: draw it at building depth + 0.005 (NORMAL) only while closed and `dayClock.lightsOn`. Feed `night.lightPoints` (5 windows + the lantern) to `dayClock.addLight`, `night.lightPointsOpen` (3 desk lamps, the stove fire, the lantern) while revealed.
- **Staff.** The officefolk anims sit on `deskPoints` (seat front-centre at 0.45 m): sem and bok face SE, chong SW, the courier SE at the counting table. The chief (chief2 `sit_*`) sits at `chiefDeskPoint` facing SW and stands at `chiefDeskPad` (NE) to open the panel. Standing work spots are `staffPoints` (+ dirs, roles, bands); visitors sit on `seatPoints` (SW); the postman stands at `mailboxPoint`. `furnitureM` gives the furniture footprints for walking around the desks.
- **Overlays.**

  | Overlay | When |
  |---|---|
  | `typewriter_a/_b` `type` | while a clerk types (`desk_type`) |
  | `phone` `ring` | on an incoming call (`desk_phone`) |
  | `stove` `fire` | always, while revealed |
  | `lamp_a` | state `alert` = 셈이's shortage warning (a shelf empty > 30 s), else `warm` |
  | `lamp_b` | spare alert, e.g. an unread letter |
  | `safe` `open` / `close` | the courier's deposit before the bank stands (coins fly to `safePoint`) |

- **Text the game writes.** `signRect` holds 촌장 사무실 / Chief's Office in #2E6F6B, sheared y += 0.5 x, alpha = the shell alpha, hidden below `hideBelowShellAlpha` 0.5. `boardRect` holds the 5 coloured stock bars at 1 Hz while revealed. Nothing is baked into the art.
- **FX.** Chimney smoke at `fxPoints.chimney`, kettle steam at `.kettle`, the lamps glow at `.lamps`, the door lantern at `.lampDoor`.
- **Collision.** `wallCircles` are at ground level in the Collision metric `dx² + (2dy)²`; an inside actor (drawn 17 px higher) tests its point + [0, floorLiftPx]. `walkPoly` is the lifted inside floor, with a notch through the door.
- **Mailbox.** Draw it at `outdoorProps[0].point` (outside-actor depth rule). Play `pop` when a letter arrives, hold `states.up` while mail is unread, `flag` back down when it is read. Letters fly into `slotPoint`.
- **Items.** The courier head-carries `item_coin_sack_s/m/l` (size by value, `carryScale` 0.65) and the sacks fly into the safe or to the teller. The postman carries `item_letter_bundle`, the paper boy `item_newspaper_bundle`; 셈이 walks in with `item_ledger`.
- **Memory (M6).** One page, 4.61 MiB. To keep the inside off the plaza budget, split it at build time with `pageSplit` (closed 2.20 MiB always resident, inside 2.55 MiB in Residency region `officeInside`, +2 shipped files).

## Placeholders this replaces (plan §16.1 CODE-1 fallbacks)

| Code fallback | Replaced by |
|---|---|
| the town `post_office` frame (closed look, tinted cream) at the office anchor | `chief_office` + its layers |
| staff "desk spots" in front of it | `deskPoints` / `staffPoints` / `chiefDeskPoint` / `seatPoints` |
| no visible interior / props | the cutaway inside layers and the 7 overlays |
| code props (generic coin / letter / book) | `item_coin_sack_s/m/l`, `item_letter_bundle`, `item_newspaper_bundle`, `item_ledger` |
| a code-drawn or absent mailbox | `office_mailbox` (+ `slotPoint`, `mailboxPoint`) |

## Deviations from the contract (and why)

1. **Desk-top overlays use depthOffset −0.08, not −0.25.** The typewriters, phone and lamps are PATCHES (the object plus the desk top under its motion) drawn right after `_interior_front`, as logistics' conveyor does at −0.09. At −0.25 a seated clerk would be drawn over their own typewriter. `_interior_front` has a hole where each frame-0 object is, so a renderer that keeps every overlay at −0.25 still shows frame 0 correctly. The stove and the safe use −0.25.
2. **Two desks render in `_shell_cut` and their sitters sit in band `front`** (`deskBands`, polish). One `_interior_front` layer cannot be both in front of 총총이 (her own desk) and behind her (desk 1 is behind her head on screen); the same holds for 딸랑이 and the chief's desk. `_shell_cut` is the next layer up, so those two desks draw over band `front`.
3. **`_shell_cut` carries the open-building ground shadow and the plinth fringe** (polish, H1), so a renderer that draws `_floor` always shows nothing outside the closed shell.
4. **frameSize [634, 512]** (the contract expects ≈ 560 × 512): the long soft ground shadow falls to screen down-right; the frame is clamped to 640 wide and the shadow fades out over the last 28 px.
5. **Layout nudges inside "≈":** the stove at X −2.02 / Y +1.74 (fire window clear of desk 1); clerk desk 1 0.8 m long; the map on the back wall at X −1.92…−0.52; the bench in the front-right corner; the counting table 0.33 m nearer the front; the safe on a plinth.
6. **`office_mailbox` frame** is wider and shorter than guessed (baked soft shadow); the mailbox is 1.1 m tall as specified.
7. **11 wallCircles** (≈ 10).
8. **Extras for the code:** `night.lightPointsOpen`, `groundPoint` on every overlay, `signRect` (+ `hideBelowShellAlpha`), `frontTest`, `chiefDeskPadDir`, `deskBands`, `furnitureM`, `pageSplit`, `cutaway.night` / `nightRule` / `inside` / `insideShadowDepthOffset`, `reveal.aliases`.

## Pipeline and how to rebuild

```
nice -n 10 /tmp/bvenv/bin/python tools/blender/off_render.py -- all [--force] [--passes a,b]   # ~18 min for all, 2 Cycles threads
python3 tools/blender/off_pack.py        # assets/office + docs/previews/off_* (calls off_preview.py)
python3 tools/blender/off_check.py       # 0 errors
python3 tools/blender/off_compare.py --before <copy of the pre-polish assets/office>   # off_polish_before_after.png
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/test/office_phaser.mjs   # OFFICE_DIR=<dir> tests a candidate pack
```

The polish re-rendered only what changed (`--passes`, cache `/tmp/fv_cache/office`): the inside passes, `_shell_cut`, the open shadow and the safe overlay several times, the closed shell / glow / props once, the mailbox and the items.

### `off_assets.py` — the scene builder

- It reuses `bl_common` (the shared camera and light), `prop_lib`, `bld_assets`, `town_lib`, `civ_lib`, `civ_assets` and `life_assets` read-only.
- Every object is tagged with its layer group; the polish added the `cutdesk` group (secretary desk + counting table).

### `off_render.py` — one scene, 44 passes

The scene is built once, with one camera, one frame and one anchor. Each pass sets every group to VISIBLE, HOLDOUT, GHOST (casts shadows, invisible to the camera) or HIDDEN, so the layers composite back in the game's draw order.

| Pass | Contents |
|---|---|
| floor | furniture ghosts give contact shadows |
| `gshadow_open` / `gshadow_closed` | ground shadow on a ring catcher outside the plinth |
| back | the far walls cast no shadow inside (bright dollhouse light) |
| interior, interior_front | furniture (`cutdesk` ghosted) |
| shell_cut, shell, props | the cut stubs + `cutdesk`, the closed building, the outdoor parts |
| glowmask | white emission of the lit glass |
| overlays | border-rendered: only the overlay's screen box is rendered, so every frame stays aligned |

- Desk-top overlays render a solo silhouette plus a full patch; the pack keeps the patch inside the union of the solo silhouettes.
- The render also writes `furniture` (footprints of the inside furniture in building metres, touching pieces merged, plants kept apart) for `furnitureM` and the layout checks.
- The mailbox and the items use `bld_render.render_build` unchanged.

### `off_pack.py` — the packer

- The closed ground shadow is merged under `_shell`; `_floor` keeps only pixels under the fully opaque closed shell, and its fringe plus the open ground shadow go under `_shell_cut`.
- After palettising (libimagequant), every source pixel that was fully opaque is moved to the nearest fully opaque palette entry (`keep_opaque`), so the closed shell never lets the always-drawn `_floor` through by 2–5 %.
- `_glow` is built from the glow mask; patches are cut to their silhouettes; faint render haze is removed.
- Atlases are MaxRects-packed at the width that gives the smallest page; the manifest carries `pageSplit` (closed / inside MiB measured with the same packer).
- **Guard:** it refuses to pack when a render is missing (exit 1, nothing written).

### `off_preview.py` / `off_compare.py` — previews

Previews use only the packed files and the real staff (officefolk via `tools/officefolk_compose.py`, chief2). `off_compare.py` draws the critic's cases before (a copy of the pre-polish set) and after.

## Checks (`tools/blender/off_check.py`) — 0 errors, 0 warnings

- **Files, keys, building fields, layers, overlays, alignment, points, mailbox, items, collisions** as before (exactly 5 files, sizes, ≤ 2048, ≤ 5.5 MiB, no overlapping frames, contract depthOffsets, monotonic `drawOrder`, frame counts / fps / states, overlay boxes inside the inside layers, patch-vs-seated-person depth test, inside ground points in the footprint, `revealPoly` ≥ 97 % of the shell, items 72 × 72 at [0.5, 0.86], no key collides with another `assets/*` fragment).
- **New for the polish:**
  - H1: the closed look as Cutaway.js draws it (and as the v5 BankBuilding draws it) = `_shell` + `_props` within 12 px on 3 backgrounds; `_glow` not in `cutaway.drawOrder`; `cutaway.night`; `layers.front`; `_floor` ≤ 12 px outside the opaque shell.
  - H2: head boxes ≤ 10 % covered by `_shell_cut` (+ desks / desk patches for band `behind`), per `deskBands`.
  - M1: seats ≥ 0.7 m apart, leg space free of furniture; M2: pad ≥ 0.35 m from `_interior` furniture; standing spots ≥ 0.12 m from any furniture.
  - M3: agent radius 16 px: standing spots and the door path clear, seat floor points ≥ 8 px, walls closed except the doorway.
  - M4: flag rise ≥ 10 px. M5: ≥ 25 gold px in the open safe, stub ≤ 25 % of the door. L1: busy pairs ≥ 0.75 m. L3: sack widths ≥ +30 % per step. L4 / L9: states closed / open / bare, default open, no `half`.
- **Notes printed:** office_bld 1120 × 1080, 4.61 MiB, 185 KiB on disk; office_items 104 × 112, 0.04 MiB; flag rise 13 px; sack widths 26 / 34 / 48 px; closed look 0 px off (Cutaway.js rule and BankBuilding rule); head boxes 0 % for all 13 people / spots; seats 0.71 m apart; busy pairs 0.93 / 1.26 / 0.75 / 1.13 / 0.78 m; open safe 229 gold px, stub over the door 18 %.

## Phaser test (`tools/test/office_phaser.mjs`)

- **Renderer:** the real `src/entities/Cutaway.js`, imported unchanged (an import map swaps its `../core/Assets.js` for a 20-line shim that reads the office manifest). People: officefolk (townfolk + townfolk2 + officefolk compositor) and chief2 with its desk overlay, in the game's depth bands, with inside shadows above `_floor`.
- **Desktop page (1500 × 1000):** every sprite / layer / overlay / anim / state frame resolves (66 frames, 0 missing, 8 anims); the reveal toggle works both ways and a tap outside does nothing; the sign hides while revealed.
- **H1 pixel test:** the same office twice side by side, Cutaway.js closed vs `_shell` + `_props`: 0 px differ (> 6 levels).
- **Phone pages** (390 × 844 CSS px, DPR 3, 720 logical px, k = 1.65): the office at its plan spot next to the civic bank, staff at work, zoom 0.6 / 1.0 / 1.2 (0.325 / 0.542 / 0.650 CSS px per world px), plus night closed (glow + DayClock lights) and night open (`lightPointsOpen`).
- **Reading:** at zoom 0.6 the office is ~206 CSS px wide and reads at a glance as a busy little office with a teal roof next to the burgundy bank; the sign is 104 × 28 px (34 × 9 CSS px at 0.6, legible from 1.0) and hidden while revealed. At 1.0 and 1.2 every desk object, the chalkboard bars, the stove fire, the treasure in the open safe and every face read; no wall post crosses a face, and the bench sits in its corner with the chief's pad clear of it. At night the closed office shows its lit panes and lantern halo; revealed, the three desk lamps and the stove light the room.

## Previews (`docs/previews/`)

| File | Shows |
|---|---|
| `off_polish_before_after.png` | the critic's cases, before / after (H1, H2, M1 / M2, M5, M4, L3) |
| `off_office_states.png` | closed / open / bare with the real staff, night closed and night open, a busy open office |
| `off_office_layers.png` | every layer alone at half size with the anchor cross, and every overlay frame at 3× |
| `off_office_points.png` | every manifest point (with agent-radius ellipses), polygon, wall circle and rect at 2× |
| `off_items.png` | the items and mailbox frames by day and night at 3× and 1×, next to existing items |
| `off_scene.png` | 1× next to the town hall, the post office and the bank |
| `off_reveal.gif` | closed → open → closed with the staff |
| `off_anims.gif` | typewriters, ringing phone, stove fire, alert lamps and the safe, as a 2× crop |
| `off_mailbox.gif` | the flag pop with the postman and his letter bundle |
| `off_night.gif` | evening falls on the closed office |
| `off_phaser.png` / `off_phaser_closed.png` | the Phaser desktop page (Cutaway.js) |
| `off_phone_z06.png` / `_z10` / `_z12` / `_night` / `_night_open` | the Phaser phone captures |

## Known issues

- **M6** is open until the lead decides: either `pageSplit` is applied at build time (`TOWN_SPLIT`), or plan §13.2 books the whole 4.61 MiB page while the office is on screen.
- The typewriter key-hop and the phone rattle are small motions on ~35 px objects: clear at zoom ≥ 1.0, subtle at 0.6. The kettle steam and chimney smoke carry the "alive" read.
- `_glow` is NORMAL blend under the DayClock MULTIPLY, per the contract. Bright night windows depend on the code also feeding `night.lightPoints` to `dayClock.addLight`.
- During the 260 ms reveal fade, the closed shadow (in `_shell`) and the open shadow (in `_shell_cut`) cross-fade, as on the civic bank.
- Inside shadows and the `deskBands` rule are art-side facts the code must follow; Character.js today draws every shadow at `DEPTH.SHADOW` (under `_floor`).
- `stackStep` stacks of coin sacks look like little snowmen. Sacks are carried one at a time; the field is there only because every item has one.
