# Contract addendum v4.2 — the chief's halo and navigation, chief office anims, 촌장 사무실 (cutaway), officefolk, the new train cars and loop rails, ui5, office audio

Extends `CONTRACT.md` … `CONTRACT_V8.md` (PPU 64, `bl_common` camera/light, 2:1 iso, manifest §2 format, paths relative
to `frost-village/assets/`). Design (binding): `docs/v42_plan.md`. Designer summary: `docs/기획서_v4_2_촌장.md`.
Same palette, light, outline and soft-toy materials as `assets/town` (train, station), `assets/civic` (bank cutaway),
`assets/logistics` (cutaway layer contract), `assets/townfolk` / `assets/cityfolk` (paper dolls), `assets/ui3` /
`fx_city` `ui4_icons` (icons). **New folders only** — never edit an existing asset folder. No text is baked anywhere
(the game renders every label; name plates are blank).

Section letters continue after V8 (AA–AF). Code fallbacks for every key exist (plan §16.1), so each job can land on its own.

| § | Folder | Pipeline | Keys |
|---|---|---|---|
| AG | `assets/chief_fx/` | procedural 2D (fx/ui house style) | `chief_halo`, `chief_halo_gold`, `chief_halo_rank2`, `chief_glow_back`, `chief_sparkle`, `chief_marker`, `nav_chevron`, `nav_dot`, `nav_ring`, `nav_badge`, `nav_edge` |
| AH | `assets/chief2/` | Blender, the player rig (as pet / give / throw) | character `player_b` (extends `player`): `sit_idle`, `sit_write`, `sit_read`, `sit_eat`, `doze`, `talk`, `wave`, `warm_hands`, `cheer` |
| AI | `assets/office/` | Blender, civic framework `civ_*` | `chief_office` (+ layers `_floor`, `_back`, `_interior`, `_interior_front`, `_shell_cut`, `_shell`, `_props`, `_glow`; overlays `_typewriter_a`, `_typewriter_b`, `_phone`, `_stove`, `_lamp_a`, `_lamp_b`, `_safe`), `office_mailbox`, items `item_coin_sack_s/m/l`, `item_letter_bundle`, `item_newspaper_bundle`, `item_ledger` |
| AJ | `assets/officefolk/` | townfolk paper-doll pipeline `tf_*` / `tf2_*` / `cf_*` | fragment `officefolk`: anims `sit_idle`, `desk_type`, `desk_write`, `desk_phone`, `desk_read`, `desk_count`, `file`, `point_board`, `stamp_stand`, `bow`, `note`, `hand_over`, `scoop`, `carry_sack`; parts `acc_sleeves`, `acc_bell_pin`, `held_receiver`, `held_pen`, `held_letter`, `held_notebook`, `held_pointer`, `held_stamp`, `held_sack_open`, `held_sack_shoulder`, `held_coins`; 8 presets |
| AK | `assets/train2/` | Blender, town framework `town_*` | characters `train_coach`, `train_boxcar`, `train_flatcar`; decals `rail_loop_ours`, `rail_loop_town`, `rail_fence_x`, `rail_fence_x_end`; props `rail_switch_stand`, optional `rail_water_tower` |
| AL | `assets/ui5/` | procedural (`gen_ui5.py`, ui house style) | 18 icons + 6 panel frames (below) |
| AM | `assets/audio7/` | procedural (audio1–6 rules) | `sfx_typewriter`, `sfx_switch_clack`, `sfx_wheel_squeal`, `sfx_mailbox_flag`, `sfx_coin_sack`, `amb_office` |

General delivery rules (every job): `manifest.json` (§2 format, `version`, `generator`, `conventions`), packed atlases
(trimmed, `sourceSize` kept, ≤ 2048 px a side, RGBA), contact sheet + GIF previews in `docs/previews/<job>/`, a check
script (`tools/<job>/<job>_check.py`: frame counts, dirs, anchors, every point inside its frame, layer alignment), a
Phaser test page (`tools/test/<job>_phaser.mjs`, like `civic_phaser.mjs`) with phone captures at zoom 0.6 / 1.0 / 1.6,
a texture-memory line per atlas (RGBA source-sum MiB), a report `docs/build_reports/<job>.md` and a review pass.
**File budget**: at most **35 source files** across AG–AM (atlas png + json count 2; manifests 1): AG 3, AH 3, AI 5,
AJ 9, AK 9, AL 3, AM 3. The build packs `chief_fx` + `ui5_icons` into one page `v42_core`, so **33 files ship**.

---

## AG. Chief FX and navigation — `assets/chief_fx/` (procedural 2D)

One atlas `chief_fx` (≤ 1024 × 1024, one page, ≈ 2 MiB), NORMAL blend artwork that reads on **white snow, grey
cobbles, brown dirt and the night overlay** (darker cool rim on every bright shape, as `fx_city` sheets). Frames are
named `{key}_{i}`; spritesheet metadata in the manifest (`frames`, `fps`, `repeat`, `anchor`). Drawn by code at a
scale that keeps a constant screen size (plan §3.1), so edges must stay clean from 0.5× to 2× (draw at 2× and
downsample).

| Key | Frame (px) | Frames · fps · loop | Anchor | Look |
|---|---|---|---|---|
| `chief_halo` | 192 × 96 | 12 · 10 · loop | [0.5, 0.5] = ground point under the feet | hollow 2:1 iso ellipse ring, outer 184 × 92, ring 7 px; aurora gradient mint `#43E0C6` → sky `#7FB2FF` → lilac `#B79CFF` travelling once round the ring per loop; 1 px warm gold inner line `#FFD36A` (60 %); 1 px darker teal outer rim `#1F8F86` (50 %) so it reads on snow; soft 8 px outer glow (25 %); **centre fully transparent** (pads, shadows and the snow read through); 6 tiny 4-point stars sit on the ring and twinkle |
| `chief_halo_gold` | 192 × 96 | 8 · 12 · loop | same | same ellipse in warm gold `#FFC84A` → `#FFE9A0`, brighter glow (40 %), 12 short sun-ray ticks pointing outward that pulse (frames 0–3 grow, 4–7 settle): the "working ×1.25" state |
| `chief_halo_rank2` | 216 × 108 | 1 | same | thin double gold band (2 px + 1 px, 4 px apart), outer 208 × 104, drawn under the ring at 읍 |
| `chief_glow_back` | 160 × 200 | 8 · 8 · loop | [0.5, 0.82] = the chief's feet | soft vertical oval radiance behind the body (≈ 1.4 × the chief's 128 px frame height when drawn 1:1): pale gold core `#FFE7A3` (55 %) fading to mint / lilac edges (0 %); slow shimmer; no hard edge anywhere |
| `chief_sparkle` | 32 × 32 | 6 · 12 · once | [0.5, 0.5] | 4-point star twinkle, white core + gold rim, appears and fades |
| `chief_marker` | 72 × 88 | 4 · 6 · loop (light sweep, no bob) | [0.5, 1.0] = tip of the pointer | round teal badge (Ø 60 px, `#2CB7A8`, white 3 px rim, navy drop shadow) with a gold 5-point star inside and a tiny white pinecone crown on the badge's top edge; a short pointer tail at the bottom pointing down at the chief; must read at 22 CSS px (≈ 0.3 scale): star ≥ 30 px across in the frame |
| `nav_chevron` | 64 × 40 | 16 named `nav_chevron_00` … `_15` | [0.5, 0.5] | a flat ground chevron (double "›" arrow) lying on the 2:1 ground plane, teal `#2CB7A8` with a white rim and a soft gold inner highlight; frame k points along **screen angle k × 22.5°** (0 = screen right, clockwise), pre-projected onto the ground (foreshortened like a decal) |
| `nav_dot` | 28 × 14 | 2 (`_0` normal, `_1` highlight for the travelling wave) | [0.5, 0.5] | soft round ground dot (iso ellipse), teal with a white centre; highlight = brighter + gold rim |
| `nav_ring` | 160 × 80 | 8 · 10 · loop | [0.5, 0.5] = ground centre | dashed ground ring (12 dashes) teal + gold that pulses outward and fades (frame 0 small/bright → 7 large/faint) |
| `nav_badge` | 88 × 100 | 1 | [0.5, 1.0] = pointer tip | rounded teal speech badge (80 × 80 body, white 3 px rim, navy drop shadow) with a pointer at the bottom; empty inner disc 56 px (`iconRect` in the manifest) — the game draws the item icon there |
| `nav_edge` | 80 × 80 | 1 | [0.5, 0.5] | screen-edge badge: teal circle (Ø 64) with a white rim and an arrow notch on its **right** side (the game rotates it toward the target); empty inner disc 44 px (`iconRect`) for the item icon |

Manifest fields: `conventions.screenSize` (`chief_halo` is drawn 45 CSS px wide on a 390 px phone; `chief_marker` 22
CSS px), `blend: "NORMAL"`, per key `frames`, `fps`, `repeat`, `anchor`, `iconRect` (badge / edge). Preview: the halo
under the chief on snow, cobbles and dirt, day and night, at zoom 0.6 and 1.2, in a crowd of 20 townsfolk.

---

## AH. Chief anims — `assets/chief2/` (Blender, the player rig)

Character `player_b` in a new atlas `char_player_b`, rendered with **exactly** the player's rig, outfit (white fur
parka, brown belt, boots), camera, light and outline (`assets/characters` `player`: frameSize [128, 128], anchor
[0.5, 0.8125], frame names `{anim}_{dir}_{i}`, dirs S, SE, E rendered, mirrors SW ← SE, W ← E). Manifest entry
`characters.player_b = { extends: "player", atlas: "char_player_b", anims: {…} }`; the game merges the anims into the
`player` definition. Existing `char_player` frames are not touched.

Seated anims: the anchor is the **seat point** (top of a 0.45 m chair seat, as `seatPoints` everywhere); no chair is
drawn (the scene's chair / bench / table provides it); feet rest on the floor 0.45 m below; the desk / table top is at
0.72 m in front, so hands that write or eat stay at that height. Nothing is carried on the head (the game only seats
him with an empty bag).

| Anim | Frames · fps · repeat | Dirs | Notes |
|---|---|---|---|
| `sit_idle` | 4 · 4 · loop | S, SE, E | seated, hands on the desk edge, breathing, a blink |
| `sit_write` | 6 · 8 · loop | S, SE, E | writes with a quill (frames 0–3), stamps on frame 4 (`impactFrame` 4, `impactPoint` per dir = stamp contact, for a puff), lifts on 5 |
| `sit_read` | 6 · 6 · loop from 2 | S, SE, E | unfolds a newspaper (0–1), reads with small page wobbles (2–5); the paper is part of the frame (cream with grey column lines, no text) |
| `sit_eat` | 6 · 8 · loop | S, SE, E | spoon from a bowl at table height to the mouth, happy squint on frame 3 |
| `doze` | 4 · 3 · loop | S, SE, E | seated, head nodding forward; the game adds `emote_zzz` |
| `talk` | 8 · 10 · loop | S, SE, E | standing chat, one mitten gesturing (matches townfolk `talk` timing) |
| `wave` | 6 · 10 · loop | S, SE, E | standing wave toward the camera side |
| `warm_hands` | 4 · 5 · loop | S, SE, E | both mittens forward at waist height toward a fire, shoulders shrugging with cosy cold |
| `cheer` | 6 · 10 · loop | S, SE, E | raises one mitten overhead with a small hop on frame 2 (the 촌장 응원 and ribbon pose) |

Fields: `headTop` (standing −81 as `player`), `headTopSit` (≈ −62, bubbles while seated), `impactPoint` for
`sit_write`. Budget ≤ 3.5 MiB (≈ 150 trimmed frames). Preview: each anim × dir as GIF next to the existing `idle`.

---

## AI. 촌장 사무실 — `assets/office/` (Blender, civic cutaway framework)

### AI.1 The building `chief_office`

| Field | Value |
|---|---|
| kind | `building`, cutaway (bank / logistics layer contract) |
| footprintM | **[5.6, 4.4]** (X × Y), front `-Y` (faces screen down-left), door on the front face at X ≈ −1.6 m |
| frameSize | from the render, **≤ [640, 576]** (expected ≈ [560, 512]); every layer shares this frame + anchor (trimmed in the atlas) |
| anchor | footprint centre on the ground (≈ [0.42, 0.63]) |
| footprintPoly | the 4 ground corners in px (≈ [[−227, −13], [27, 113], [227, 13], [−27, −113]]) |
| topPx | ≈ 300 (ridge + chimney) |
| floorLiftPx | 14–18 (raised floor; every inside point includes it) |
| atlas | `office_bld` (one page, ≤ 2048 × 2048, budget **≤ 5.5 MiB** source-sum) |

**Exterior (the `_shell`)**: one storey, warm cream plaster walls with a pale stone plinth, **teal roof** (the same
family as the 마을회관) with a snow cap, a pinecone finial and a brick chimney; tall white-framed windows with little
curtains; a teal double door with a brass knob and a fan light; a blank sign board above the door (the game writes
`촌장 사무실`); a lantern by the door; snow on sills. Same toy materials as the civic bank, but humbler and cosier (it
must not read as a bank).

**Interior** (the two far walls are the back wall +Y (screen upper right) and the left wall −X (screen upper left); the
front −Y and right +X walls are cut). Building-local metres, origin at the footprint centre:
| Thing | Where (X, Y m) | Layer | Notes |
|---|---|---|---|
| **chalkboard 재고판** | back wall, X −0.2…+1.8, 1.0–1.9 m high | `_back` | dark green slate in a wooden frame, **blank** (the game draws 5 coloured bars on `boardRect`), a chalk tray with chalk |
| village map with pins | back wall, X −2.2…−0.6 | `_back` | cartoon map of the village (plaza, rails, sea) with red/blue pins, no text |
| cork notice board | left wall near the door, Y −0.8…−0.1 | `_back` | pinned notes, a photo, a ribbon (the game may pin a letter icon on it) |
| window + clock | back wall right / left wall | `_back` | warm window light at night (`_glow`) |
| pigeonhole mail shelf (3 × 4) | left wall, Y +0.4…+1.6 | `_back` | a few letters in the cubbies |
| filing cabinet (4 drawers) | left wall, Y −0.4 | `_interior` | |
| coat rack with a scarf | left wall near the door, Y −1.6 | `_interior` | |
| stove with a kettle | back-left corner (X −2.4, Y +1.8) | `_interior` | stovepipe through the roof; fire window = overlay `_stove` |
| **chief's desk** on a raised round rug | back centre (X +0.4, Y +0.9), desk front faces −Y | chair `_interior`, desk `_interior_front` | big wooden desk: nameplate (blank), stamp + ink pad, a stack of letters, a little globe, a desk lamp |
| **clerk desk 1 (셈이)** | X −1.7, Y +0.5, faces +X | chair `_interior`, desk `_interior_front` | abacus, ledgers, desk lamp (overlay `_lamp_a`: normal / red), typewriter (overlay `_typewriter_a`) |
| **clerk desk 2 (소복이)** | X −1.7, Y −0.7, faces +X | same | typewriter (overlay `_typewriter_b`), telephone (overlay `_phone`), letter tray, lamp `_lamp_b` |
| **secretary desk (총총이)** | X +0.0, Y −1.5, faces −Y (toward the door side) | same | appointment book, desk bell, a vase of flowers |
| **courier corner (딸랑이)** | X +2.1, Y +1.3 | safe `_interior`, counting table `_interior_front` | a small iron safe with a dial (overlay `_safe`: door shut / open), three coin sacks, a key board on the back wall, a little counting table with coin stacks |
| visitor bench | X +1.6, Y −0.6, seats face SW (toward the cut-away front, so seated faces show) | `_interior` | two seats (`seatPoints`) |
| plants | 2–3 potted plants in corners | `_interior` | |
| rug + floorboards + door mat | floor | `_floor` | cutaway ground shadow baked in `_floor` |

**Layers** (all aligned: same frame + anchor; each is its own `sprites` entry `{ kind: "layer", of: "chief_office",
layer, depthOffset }` exactly like `assets/logistics` `logistics_center_*`; depth = building anchor y + `depthOffset`;
character slots marked `@` get the `bandDepth` value; draw in this order):
| Layer | depthOffset | Content | Shown |
|---|---|---|---|
| `chief_office_floor` | −0.45 | floorboards, rugs, the desk dais, door mat + steps, the cutaway ground shadow | while revealed |
| `chief_office_back` | −0.40 | the two far walls from inside (wallpaper, wainscot, chalkboard, map, notice board, shelf, windows, clock) | while revealed |
| `chief_office_interior` | −0.30 | furniture behind people (chairs, stove, cabinet, safe, plants, coat rack, bench) | while revealed |
| overlays (below) | −0.25 | animated parts | while revealed |
| `@behind` (`bandDepth.behind`) | −0.20 | seated staff and the chief at his desk; a clerk at the board / cabinet / shelf | while revealed |
| `chief_office_interior_front` | −0.10 | the four desk fronts + the counting table (hide the legs of seated people) | while revealed |
| `@front` (`bandDepth.front`) | −0.05 | standing visitors, the postman inside, the courier at the safe | while revealed |
| `chief_office_shell_cut` | −0.02 | dollhouse wall stubs at 1.2 m + sills + door frame | while revealed |
| `chief_office_shell` | 0.00 | front and right walls, roof, chimney, sign, door, outer windows | closed (fades to `openAlpha` 0.12 in 260 ms) |
| `chief_office_glow` | +0.005 | warm window light + door-lantern halo for night, NORMAL blend, drawn over the shell | night, closed |
| `chief_office_props` | +0.01 | wall-mounted outdoor parts: steps, door lantern, sign bracket (free-standing outdoor props are their own y-sorted sprites in `outdoorProps`, e.g. `office_mailbox`) | always |
| `chief_office` | — | the closed building in one frame (= shell over everything) | closed look |
Manifest also lists `layers`, `layerOrder`, `alwaysDrawn` (`props`, `glow`), `insideLayers`, `reveal.states`
(`closed`, `open`), `outdoorProps` (`office_mailbox` with its point), as `logistics_center` does.

**Overlays** (aligned to the building frame, trimmed; `anims` with frames):
| Key | Frames · fps | What |
|---|---|---|
| `chief_office_typewriter_a`, `_typewriter_b` | 4 · 10 · loop | keys hop, carriage nudges; frame 0 = still |
| `chief_office_phone` | 2 · 8 · loop | receiver rattles on its cradle (ringing) |
| `chief_office_stove` | 4 · 6 · loop | fire flicker in the stove window |
| `chief_office_lamp_a`, `_lamp_b` | 2 | frame 0 warm lamp, frame 1 red-shade alert lamp (셈이's shortage warning) |
| `chief_office_safe` | 2 | door shut / open |

**Points** (px from the anchor, inside points include `floorLiftPx`; dirs SW / W / NW = flipped SE / E / NE):
| Field | Count | Dir | Slot | Meaning |
|---|---|---|---|---|
| `doorPoint`, `doorDir` | 1 | NE | outside | foot of the steps |
| `entryPoint`, `entryDir` | 1 | NE | front | just inside the door |
| `chiefDeskPoint`, `chiefDeskDir` | 1 | SW | behind | seat anchor of the chief's chair (anims `sit_*`) |
| `chiefDeskPad` | 1 | NE | front | where the chief stands in front of his desk to open the panel (0.4 s) |
| `deskPoints`, `deskDirs`, `deskRoles` | 4 | SE, SE, SW, SE | behind | seat anchors: `sem`, `bok`, `chong`, `ttal` (courier at the counting table) |
| `boardPoint`, `boardDir` | 1 | NE | behind | standing spot to point at the chalkboard |
| `boardRect` | 1 | — | — | `{ point, widthPx, heightPx, shearY: 0.5 }` of the writable chalkboard area (like logistics `nameBoard`) |
| `cabinetPoint`, `cabinetDir` | 1 | NW | behind | standing at the filing cabinet |
| `mailShelfPoint`, `mailShelfDir` | 1 | NW | behind | standing at the pigeonholes |
| `safePoint`, `safeDir` | 1 | NE | front | standing in front of the safe (coins fly into it) |
| `stovePoint` | 1 | — | — | ground point in front of the stove (the chief dozes nearby) |
| `seatPoints`, `seatDirs` | 2 | S/SE/SW | front | visitor bench |
| `mailboxPoint`, `mailboxDir` | 1 | NE | outside | where the postman stands at the mailbox |
| `staffPoints`, `staffDirs`, `staffRoles`, `staffBands` | ≥ 5 | — | — | all of the above standing work spots in one list (roles `board`, `cabinet`, `shelf`, `safe`, `door`) |
| `fxPoints` | — | — | — | `chimney` (smoke), `kettle` (steam), `lampDoor`, `lamps` [chief, a, b], `windows` [≥ 3 for night glow] |
| `walkPoly` | 1 | — | — | interior floor polygon (px) the chief and staff may walk on |
| `wallCircles` | ≈ 10 | — | — | `[dx, dy, r]` collision circles along back, left and right walls with a gap at the door |
| `revealPoly` | 1 | — | — | building silhouette polygon for tap / hover tests |
| `pointSlots` | — | — | — | map of every point field to `behind` / `front` / `outside` (as the civic bank) |
| `drawOrder`, `fade`, `cut`, `bandDepth` | — | — | — | exactly the civic bank / logistics fields |

### AI.2 Outdoor prop `office_mailbox` (same atlas)
Red post mailbox with a pinecone emblem and a little flag on the side, snow on top; 1.1 m tall, footprint 0.4 m,
frame ≈ 64 × 112, anchor = ground under the post. Anims: `flag` 2 frames (0 down, 1 up) and `pop` 3 frames · 12 fps
(flag springs up, wobbles). Point `slotPoint` (where letters fly in).

### AI.3 Office items (atlas `office_items`, item conventions: 72 × 72, anchor [0.5, 0.86], `stackStep`, `carryScale`, `icon`)
| Key | Look | Used for |
|---|---|---|
| `item_coin_sack_s`, `_m`, `_l` | burlap sack tied with red string, gold coin emblem, coins peeking out; three fill sizes | flies from the courier into the safe / to the teller at a deposit; head-carried by the courier in CODE-1 until officefolk `carry_sack` lands |
| `item_letter_bundle` | 4–5 envelopes tied with string, one with a heart seal | the postman's head-carry; flies into the mailbox |
| `item_newspaper_bundle` | folded papers tied with twine | the morning paper delivery |
| `item_ledger` | thick green ledger with a gold corner | 셈이's walk-in prop |

---

## AJ. Officefolk — `assets/officefolk/` (paper dolls; townfolk / cityfolk pipeline and compact `tfatlas` format)

A partial townfolk block `officefolk` (like `cityfolk`): `{ version: 1, fragment: "officefolk", extends: "townfolk",
requires: ["townfolk"], mergeAfter: ["townfolk2", "beachfolk", "cityfolk"] }`. It must merge whether or not townfolk2 /
cityfolk are loaded (v4.2 does not load cityfolk). Merge rules = `cityfolk.merge` (new keys only; `frameAtlasExt` for
layers of earlier fragments; `animItems`, `animFallback`, `cover` as cityfolk's `cfCover`). Frame size [128, 128],
anchor [0.5, 0.8125], head frames and head poses unchanged (no new head art).

**Bases**: `adult_slim`, `adult_round`, `elder_slim`, `elder_round` (no children).

**Anims** (seated anims: anchor = seat point at 0.45 m; desk top at 0.72 m in front; the desk itself is the building's
`_interior_front` layer, so legs may be hidden but must still be drawn correctly):
| Anim | Frames · fps · repeat | Dirs (+ mirrors) | Head pose | Item (animItems) | Group / page |
|---|---|---|---|---|---|
| `sit_idle` | 4 · 4 · loop | S, SE, E | soc | — | desk |
| `desk_type` | 6 · 10 · loop | S, SE, E | down | — (typewriter is the building overlay) | desk |
| `desk_write` | 6 · 8 · loop, `impactFrame` 4 (stamp) | S, SE, E | down | `held_pen` (frames 0–3), `held_stamp` (4–5) | desk |
| `desk_phone` | 4 · 5 · loop | S, SE, E | soc | `held_receiver` | desk |
| `desk_read` | 4 · 4 · loop | S, SE, E | down | `held_letter` | desk |
| `desk_count` | 6 · 8 · loop | S, SE, E | down | `held_coins` | desk |
| `file` | 6 · 8 · loop | NE, N | loco | `held_letter` | work |
| `point_board` | 6 · 8 · loop | NE, N, E | soc | `held_pointer` | work |
| `stamp_stand` | 6 · 8 · loop, `impactFrame` 3 | S, SE, E | down | `held_stamp` | work |
| `bow` | 6 · 8 · once | S, SE, E | down | — | errand |
| `note` | 4 · 5 · loop | S, SE, E | down | `held_notebook` | errand |
| `hand_over` | 6 · 9 · once, `handPoint[dir][i]` | NE, E, SE | soc | — (the game flies the real item from `handPoint`) | errand |
| `scoop` | 6 · 9 · loop | S, SE, E | down | `held_sack_open` | errand |
| `carry_sack` | 8 · 12 · loop (walk cycle) | S, SE, E, NE, N | loco | `held_sack_shoulder` (coin sack over the shoulder) | sack (own small page: the courier walks everywhere) |

**Cover** (body layers rendered for every new anim and base; presets may only wear these): tops `top_cardigan`,
`top_sweater`, `top_blazer`, `top_vest`, `top_duffle`, `top_coat`, `top_parka`, `top_uniform`; bottoms `bot_pants`,
`bot_longskirt`, `bot_skirt`, `bot_tights`; shoes `shoe_shoes`, `shoe_boots`, `shoe_furboots`; neck `acc_scarf`; bags
`acc_satchel`, `acc_mailbag`; details `det_tie`, `det_bow`, `det_lanyard`, `det_hivis`; new parts below. `canPlay` =
cityfolk rule; `animFallback`: `sit_idle` → [`sit`, `idle`]; `desk_*` → [`sit_idle`, `sit`, `idle`]; `file` → [`idle`];
`point_board` → [`point`, `talk`, `idle`]; `stamp_stand` → [`talk`, `idle`]; `bow` → [`wave`, `idle`]; `note` → [`idle`];
`hand_over` → [`talk`, `idle`]; `scoop` → [`happy`, `idle`]; `carry_sack` → [`walk`] (the game then head-carries `item_coin_sack_*`).
`carry_sack` is the only locomotion anim: its cover is just the courier preset's wardrobe (`top_duffle`, `bot_pants`,
`shoe_furboots`, `acc_satchel`, `acc_bell_pin`) on `adult_round` and `adult_slim`.

**New parts** (`parts` format of townfolk: `family`, `space`, `subs` with `tint` and `z` / `follow`, `ages`, `anims`):
| Part | Family | Notes |
|---|---|---|
| `acc_sleeves` | detail (body, follows both arms) | clerk's cuff sleeves, tint slot `acc` |
| `acc_bell_pin` | detail (body) | small gold bell on the chest (딸랑이), no tint |
| `held_receiver` | held | black candlestick-phone receiver (no cord) |
| `held_pen` | held | quill pen |
| `held_stamp` | held | wooden stamp with a red base |
| `held_letter` | held | cream envelope / opened letter |
| `held_notebook` | held | small spiral notebook (distinct from cityfolk `held_notepad`) |
| `held_pointer` | held | thin wooden pointer stick |
| `held_sack_open` | held | burlap coin sack held open in both mittens |
| `held_coins` | held | a small stack of gold coins in one mitten |
| `held_sack_shoulder` | held | burlap coin sack with a gold coin emblem slung over the right shoulder, bouncing with the walk |

**Presets** (`generator.presets`, same format as townfolk; the game also ships them as code presets until this lands):
| Preset | Label | Bases | Wardrobe |
|---|---|---|---|
| `office_a` | 장부 담당 (셈이) | adult_round | `top_cardigan` (mustard / sage) + `bot_longskirt` + `shoe_shoes` + `acc_glasses_sq` + `det_lanyard` + `acc_sleeves`; hair bob |
| `office_b` | 소식·편지 담당 (소복이) | adult_slim | `top_sweater` (rose / sky) + `bot_pants` + `shoe_boots` + `acc_scarf`; hair ponytail |
| `secretary` | 수행비서 (총총이) | adult_slim | `top_blazer` (navy / plum) + `det_bow` + `bot_skirt` + `bot_tights` + `shoe_shoes`; hair bun |
| `courier` | 수금원 (딸랑이) | adult_round | `top_duffle` (red / green) + `bot_pants` + `shoe_furboots` + `hat_beanie` + `acc_satchel` + `acc_bell_pin` |
| `teller_a`, `teller_b` | 은행 창구 | adult_slim / adult_round | `top_vest` (bottle green / burgundy) + `det_bow` + `bot_pants` / `bot_skirt` + `shoe_shoes` |
| `bank_manager` | 은행장 | elder_round | `top_blazer` (charcoal) + `det_tie` + `bot_pants` + `shoe_shoes` + `acc_glasses` |
| `depot_worker` | 물류창고 직원 | adult_slim / adult_round | `top_parka` (slate / olive) + `det_hivis` + `bot_pants` + `shoe_boots` + `hat_beanie` |

**Pages and budgets** (RGBA source-sum at runtime): `desk` ≤ 6 MiB, `work` ≤ 4 MiB, `errand` ≤ 4 MiB, `sack` ≤ 1.5 MiB
(it is resident wherever the courier walks, the plaza included); 4 atlases (`of_desk_0`, `of_work_0`, `of_errand_0`,
`of_sack_0`) + manifest. Previews: each anim on the 8 presets (contact sheet + GIF);
a seated row behind a desk mock (legs hidden) to check the seat anchor. Parity: `tools/officefolk_compose.js` gives the
same draw lists as the game's `Townfolk.js` merge for 500 seeded people (as `townfolk2_parity.mjs`).

---

## AK. Train cars and loop rails — `assets/train2/` (Blender, town framework)

Same conventions as `assets/town` `characters` kind `train`: rendered dirs **S, SE, E, NE, N** + `flipX` mirrors
(SW ← SE, W ← E, NW ← NE); frame names `{anim}_{dir}_{i}`; anchor = ground point under the car centre on the track
centre line; `shadowFrames` for all **8** headings (not mirrored: the light does not flip); `couplerM` = coupler faces
(cars touch at the couplers; the visible dark gap between bodies is the two coupler stubs, **≥ 0.3 m**); `move` = one
wheel turn in 8 frames at 45°/frame (the game sets fps from speed); a gentle sway. Same toy scale, palette and outline as
`train_engine`; side by side with the engine at zoom 0.6 every car must read as **its own unit** (silhouette test:
engine, coach, box car and flat car distinguishable as flat colour blobs at 0.3 scale).

The game draws the cars on straight track (headings NW = NE mirrored, SE) and on **R 1.75-cell curves** of the loops
(headings N, NE, E, SE, S, SW): the in-between dirs S, E, N need the same 8 `move` frames (the packer keeps 4).
`door_open` exists only for the stopped headings SE and NE.

### AK.1 Cars
| Key | lengthM (over couplers) / body | width · height | couplerM | Expected frameSize (≤) | Look |
|---|---|---|---|---|---|
| `train_coach` (객차 "솔방울호") | 3.0 / 2.7 | 1.25 · 1.85 m | front −1.5, back 1.5 | [240, 216] | sky-blue lower body `#5DA9DD`, cream window band with thin gold lines, **slate-teal roof `#3E6E78` with a snow cap (never red: it must not continue the engine's red cab)**, a gold pinecone emblem and a blank gold name plate mid-side; **4 big warm lit windows per side, each with 2–3 seated toy passengers (round heads, bobble hats, scarves in varied colours; some wave)**; open end platforms with railings, steps and a lantern at each end; dark bogies with red disc wheels |
| `train_boxcar` (화물칸) | 2.6 / 2.3 | 1.3 · 1.9 m | ±1.3 | [216, 216] | warm chestnut planks `#8A5A3A`, a cream X-brace on each door half, dark green roof with a snow cap and a roof walkway, a pinecone crate pictogram (no text), red-brown underframe; **sliding door on both sides**: closed in `idle`/`move`, opening in `door_open` with crates visible inside |
| `train_flatcar` (무개화차) | 2.4 / 2.1 | 1.3 · 0.75 m (deck 0.55 m) | ±1.2 | [208, 152] | dark oiled-wood deck, red-brown stake pockets with 6 low stakes per side, iron corners, a rolled green tarp + rope coil at one end (baked), a small red tail lamp at each end; **the middle of the deck is empty**: the game stacks crate icons on `cargoSlots` |

| Anim | Frames · fps · repeat | Dirs |
|---|---|---|
| `idle` | 1 | S, SE, E, NE, N |
| `move` | 8 · 12 · loop | S, SE, E, NE, N |
| `door_open` (box car only) | 4 · 10 · once (the game plays it reversed to close) | SE, NE |

**Points per rendered dir** (px from the anchor; mirrored dirs negate x and swap L ↔ R). Car-local side **L** = left of
the car's facing in that frame, **R** = right:
| Field | Cars | Meaning |
|---|---|---|
| `doorPoints[dir] = { L: [front, rear], R: [front, rear] }` | coach, box car | ground point beside each door (where passengers step on / off, where crates fly in) |
| `windowPoints[dir]` | coach | centres of the visible lit windows (night glow) |
| `lampPoints[dir]` | coach (end lanterns), flat car (tail lamps) | night glow |
| `cargoPoint[dir] = [dx, dy, behind]` | box car | inside the open door: where crates fly in |
| `cargoSlots[dir] = [[dx, dy, behind] × 6]` | flat car | bottom-centre of each crate stack on the deck (2 rows × 3), plus `stackStep` (px per crate icon, ≈ 14) |
| `headTop` | all | top of the roof (labels, bubbles) |

Budgets (packed pages, RGBA source-sum): coach ≤ 5 MiB, box car ≤ 5.5 MiB, flat car ≤ 3.5 MiB (with curve dirs at 4
frames). Previews: each car in all 8 headings; the full 읍 consist (engine + 2 coaches + box car + flat car) on a
straight and going round an R 1.75-cell curve (GIF at zoom 0.6 and 1.0); night with window glows.

### AK.2 Loop rails (ground decals, same ballast / sleeper / rail / snow / shadow material and partition-of-unity rule as `rail_x`)

Geometry (lattice `L(i, j) = (3120 + 64(i + j), 1315 + 32(i − j))`, one cell = √2 m, track = j 0, +j = sea side):
| Key | Anchor = lattice point | Contains | Frame (≈) |
|---|---|---|---|
| `rail_loop_ours` | **T1 = L(−1, 0)** (`anchorPx` exact in the manifest) | the turnout at T1 (switch blades, closure rails, frog, guard rails; the straight route through the turnout may be repainted), the curved route **D (−2.75, 1.75) → T1** (quarter, centre (−1, 1.75), R 1.75), **C (−4.5, 3.5) → D** (quarter, centre (−4.5, 1.75)), the straight **B (−6, 3.5) → C** (1.5 cells), the semicircle **A (−6, 0) → B** (centre (−6, 1.75)) joining the straight main line exactly at A. NOT the straight main line on j = 0 (rail_x tiles k −6…−2 lie under it) | ≈ [576, 416] |
| `rail_loop_town` | **T2 = L(37, 0)** | the world mirror in i: turnout at T2, curves D′ (38.75, 1.75) → T2, C′ (40.5, 3.5) → D′, straight B′ (42, 3.5) → C′, semicircle A′ (42, 0) → B′ (centre (42, 1.75)). Rendered separately (iso is not screen-mirror symmetric here) | ≈ [576, 416] |
| `rail_fence_x` | tile, step (64, 32) px | low snow fence along world X (0.6 m, two rails + posts, snow on top), owns the post at its −X end | 160 × 112 |
| `rail_fence_x_end` | tile | closing post | 48 × 96 |
| `rail_switch_stand` | prop, ground under the post | switch lever + lamp on a post, 0.9 m; frames `idle_0` (lamp green), `idle_1` (lamp yellow) | 64 × 96 |
| `rail_water_tower` (optional) | prop, footprint 1.6 m | small wooden water tower with a spout for the loop infield; anim `pour` 6 f | ≤ 256 × 320 |

The decals are drawn on the ground layer **after** the straight `rail_x` tiles (they may overlap them inside the
turnout); their ballast must meet the straight ballast at A and T1 with no visible seam. Previews: both loops baked on a
snow ground tile with the straight track, plus the same with the procedural fallback for comparison.

---

## AL. UI v5 — `assets/ui5/` (procedural, `tools/fx/gen_ui5.py`, house style of ui / ui2 / ui3 / ui4)

One atlas `ui5_icons` (≤ 1024 × 1024). Icons 96 × 96, anchor [0.5, 0.5], soft-toy style (dark tinted outline, bevel lit
from the upper left, gloss, one navy drop shadow), readable at 32 px on cream and on dark; no text.
| Icon | Meaning | Look |
|---|---|---|
| `ui_icon_binoculars` | 관망 모드 | chunky teal binoculars with a sparkle in one lens |
| `ui_icon_hand` | 줍기 button / 자동 줍기 | open white mitten (the chief's) with a small gold sparkle above the palm |
| `ui_icon_route` | 길 안내 | dotted footprints curving to a teal map pin |
| `ui_icon_office` | 촌장 사무실 / 업무 chip | little cream building with a teal roof and a lit desk-lamp window |
| `ui_icon_letter` | 편지 | cream envelope with a red heart seal |
| `ui_icon_inventory` | 재고 tab / 재고판 | clipboard with four coloured stock bars (red, orange, blue, green) |
| `ui_icon_news` | 소식 tab (서리 소식) | folded village paper with a **snowflake** emblem (ui4's `ui_icon_newspaper` is the town's pinecone paper) |
| `ui_icon_bank` | 서리 은행 | small civic building with a gold coin dome |
| `ui_icon_staff` | 직원 | two friendly heads, one with a tie, one with a bow |
| `ui_icon_halo` | 촌장 후광 setting | small chief silhouette standing on an aurora ring |
| `ui_icon_cheer` | 촌장 응원 | raised white mitten with two music notes |
| `ui_icon_depot` | 물류창고 | blue warehouse with an orange crate in its door |
| `ui_icon_sleigh` | 화물 썰매 | pony head + crate sleigh |
| `ui_icon_coach` | 열차 카드: 객차 | sky-blue coach with teal roof and lit windows |
| `ui_icon_boxcar` | 열차 카드: 화물칸 | chestnut box car with an X-brace door |
| `ui_icon_flatcar` | 열차 카드: 무개화차 | flat car with three crates |
| `ui_icon_play` | settings tab 놀이 | snowflake over a small joystick knob |
| `ui_icon_new` | "새로워진 것" card | gift box with a sparkle |

Panel frames in the same atlas (9-slice metadata in the manifest `nineSlice`, `contentInset` = [left, top, right, bottom]):
| Frame | Size | 9-slice / insets | Look |
|---|---|---|---|
| `ui_letter` | 320 × 400 | 36 / 64 / 36 / 40 | cream letter paper with faint blue ruled lines, a stamp in the top-right corner (pinecone), envelope-flap shadow at the top |
| `ui_chalk_panel` | 320 × 240 | 28 / 28 / 28 / 36 | dark green chalkboard in a wooden frame with a chalk tray (재고 tab background) |
| `ui_office_tab`, `ui_office_tab_on` | 160 × 72 | 24 / 20 / 24 / 12 | cream tab with a teal rim; `_on` raised and brighter |
| `ui_chip` | 200 × 64 | 32 / 16 / 32 / 16 | rounded pill, cream with a teal rim, for the nav / 업무 / 관망 chips |
| `ui_status` | 4 frames 32 × 32 | — | glossy status dots: red 부족, orange 길 막힘, blue 남음, green 적당 |

Budget ≤ 1.5 MiB. Preview: every icon at 96 / 48 / 32 px on cream and on the night overlay; the panels stretched to
720 × 1100 logical with sample content (game font).

---

## AM. Audio v4.2 — `assets/audio7/` (procedural; audio1–6 loudness rules and loop fitting)

All one-shots go into **one audio sprite** (`audio7_sprite.mp3` + `.json` with `[start, duration]` per key, 50 ms gaps);
the loop is its own file. Total 3 files.
| Key | Length | Character |
|---|---|---|
| `sfx_typewriter` | 0.6 s (3 variants in the sprite) | 4 soft key clacks + a tiny bell on variant 3 |
| `sfx_switch_clack` | 0.4 s | the spring turnout lever: metallic "철컥" with a soft spring |
| `sfx_wheel_squeal` | 1.2 s, loopable | gentle flange squeal on the loop curves, very quiet, no harsh highs |
| `sfx_mailbox_flag` | 0.3 s | tin clack + a tiny bell |
| `sfx_coin_sack` | 0.5 s | coin-sack jingle "딸랑딸랑" (3 variants) |
| `amb_office` | 24 s loop | soft typing, page turns, kettle simmer, a clock tick; −26 LUFS |

Reuse (no new art): `sfx_coin_count`, `sfx_stamp`, `sfx_newspaper`, `amb_bank`, forklift beeps (audio6), sleigh bells
(audio3), `sfx_steam_whistle`, `sfx_brakes` (town).

---

## AN. Readability, checks and acceptance (all jobs)

1. **Zoom 0.6 on a 390 px phone** (CSS px per world px = 0.325): the halo ring ≈ 45 CSS px wide, the star pin 22 CSS px,
   each train car ≥ 45 CSS px long with a visible coupler gap, the office readable as "a cosy office, not a bank".
2. **Snow test**: every bright FX / icon is checked on white snow, grey cobbles and at night (the v4 MULTIPLY overlay at
   darkness 0.45).
3. **Alignment**: cutaway layers and overlays share frame + anchor exactly (check script compares opaque bounds).
4. **Anchors and points** lie inside their frames; seat points include the seat height; inside points include
   `floorLiftPx`.
5. **Budgets**: per-atlas MiB lines in each report; v4.2's total new art ≤ 35 source files (33 shipped) and ≤ 45 MiB
   source-sum.
6. **Placeholders**: each report lists which code fallback the key replaces (plan §16.1), so CODE-2 can swap by key.
