The `assets/ui2/` set is finished and builds deterministically. `check_ui2.py` reports 0 errors and 0 warnings, and the payload is 786.5 KB, under the 1.5 MB limit. All existing assets folders and existing `tools/fx` files are byte-identical to before (checked by sha1). Two full builds produced identical bytes, assets and previews included. The new watchtower and boats don't exist yet, so `fx_fire_big` and `fx_wake` have not been tried against them.

**One code change needed to load it:** `src/core/Assets.js` has a fixed list `FRAGMENTS = ['characters','props','fx','ui','ground','audio']`. Add `'ui2'`. The manifest uses the standard CONTRACT §2 format; paths are `ui2/...`.

**Atlas `ui2_icons`** (`ui2/ui2_icons.png` + `.json`, trimmed, unquantized RGBA like `ui_icons`). Frame name = key, anchor [0.5, 0.5].
- **Pads** (192×96, `kind: ui`, `footprint: [170,85]`, extra field `colour`). Engraved white symbols built with the same functions as the existing pads:
  - `ui_pad_clerk`: pink #E2659A, cash register + "+"
  - `ui_pad_porter`: lime #8FB23A, walking porter with crates on a back frame + "+"
  - `ui_pad_build`: coral #E0534A, claw hammer + "+"
  - `ui_pad_tower`: violet #B05CC8, watchtower with beacon flame
  - `ui_pad_boat`: deep-sea indigo #4A58C0, sailboat on waves
  - `ui_pad_register`: teal #22AE98, two footprints + coin (stand here)
- **Icons** (96×96, `kind: icon`): `ui_icon_zoom_in`, `ui_icon_zoom_out`, `ui_icon_map`, `ui_icon_hammer`, `ui_icon_house`, `ui_icon_people`, `ui_icon_clerk`, `ui_icon_porter`, `ui_icon_tools`, `ui_icon_food`, `ui_icon_happy`, `ui_icon_lock_open` (matches the existing `ui/ui_icon_lock`).

**Cards (9-slice, plain images):** `ui_card` and `ui_card_selected`, both 112×128.
- Margins in `nineSlice`: left 30, right 30, top 30, bottom 36.
- Extra fields: `minSize [64,70]` and `contentInset [16,14,16,22]` (left, top, right, bottom).
- Both cards share size and margins, so you can swap one for the other in place.

**Ground (images):**
- **`ground_road`:** 512×512, seamless in x and y (`kind: tile`, `tile: xy`, extra field `avgColour`). Rounded cobbles laid in world space, packed snow in the joints.
- **`road_edge`:** 512×64, seamless in x (`kind: decal`, `tile: x`, extra fields `edgeLine: 32`, `roadSide: "top"`). Put y=32 on the road boundary with the top half over the road. Along a world axis, rotate ±26.565° and flipY for the opposite side.

**Fog (images, `kind: fog`, `tile: x`, anchor [0.5, 0] = top centre):**

| key | size | `parallax` (order / yOffset / speed px/s) |
|---|---|---|
| `fog_bank` | 512×256 | 0 / 0 / 6 |
| `fog_bank_mid` | 512×192 | 1 / 56 / 13 |
| `fog_bank_front` | 512×128 | 2 / 216 / 30 |

- `fog_bank` is the wall and works alone. Its top 194 rows are fully opaque (`opaqueRows: 194`), its billows end around y=209 (`bodyBottom: 209`), and the area beyond should be filled with `fillColor: #E6EEF6`.
- Scroll each layer with `TileSprite.tilePositionX`.
- **`fog_puff`:** 128×128 particle, colours baked (`tintable: false`). For the clearing moment: emit 10–20, scale 0.6→1.6, alpha 1→0 over about 1 s.

**Spritesheets** (all NORMAL blend; frames wrap into rows at 2048 px, which Phaser reads in order):

| key | frame | frames | fps | repeat | anchor |
|---|---|---|---|---|---|
| `fx_build_dust` | 160×128 | 12 | 24 | 0 | [0.5, 0.72] ground point |
| `fx_build_done` | 192×192 | 18 | 20 | 0 | [0.5, 0.76] footprint centre; scale ×1.3–1.6 for 3×3 m |
| `fx_wake` | 256×128 | 12 | 12 | -1 | [0.5, 0.5] hull centre, draw under the boat; clear centre ~92×40 px |
| `fx_wake_ring` | 192×96 | 14 | 16 | 0 | [0.5, 0.5] |
| `fx_fire_big` | 128×192 | 12 | 14 | -1 | [0.5, 0.9] base of the flames (basket rim) |

**Deviations from the contract:**
- Three extra keys: `fog_bank_mid` and `fog_bank_front` (the parallax layers) and `fx_wake_ring`. Spawn `fx_wake_ring` at the stern of a moving boat every ~0.25 s and the rings form a V-shaped wake.
- `fx_fire_big` has no smoke; use the existing `fx_smoke_puff` above it.
- The clerk and porter pads carry a "+" like the existing hire pad.
- The porter pad shows a person carrying the crates, not just a crate on a frame, because it read better.

**Known issues:**
- Fog strips are drawn horizontally; diagonal borders need rotated or stepped strips.
- There is no road end-cap art; tuck road ends under pads, the plaza or the fog, as the preview does.
- `fog_bank_front` is deliberately subtle on snow.
- The fog parallax GIF is sped up so it loops in 2 s.

**To rebuild:** `python3 tools/fx/gen_ui2.py` (about 2–3 min; `--only key1,key2` writes scratch previews to `tools/fx/_cache/ui2/`, `--no-gif` skips GIFs), then `python3 tools/fx/check_ui2.py`.

Files are in `/home/user/nurient/frost-village/`:
- `tools/fx/gen_ui2.py`
- `tools/fx/ui2_art.py`
- `tools/fx/ui2_ground.py`
- `tools/fx/ui2_fx.py`
- `tools/fx/check_ui2.py`
- `assets/ui2/` (manifest.json, ui2_icons.png/.json, ui_card*.png, ground_road.png, road_edge.png, fog_bank*.png, fog_puff.png, fx_*.png)
- `docs/previews/ui2_sheet.png`
- `docs/previews/ui2_road_fog.png`
- `docs/previews/ui2_fog_parallax.gif`
- `docs/previews/fx_build_dust.gif`, `fx_build_done.gif`, `fx_wake.gif`, `fx_wake_ring.gif`, `fx_fire_big.gif`