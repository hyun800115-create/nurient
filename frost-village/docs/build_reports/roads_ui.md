# roads_ui build report

I've built both kits: the road kit in `assets/roads/` and the mission & fame UI in `assets/ui3/`. Both check scripts report 0 errors and 0 warnings. Roads come to 1.18 MB (limit 2.5 MB) and ui3 to 334 KB (limit 1 MB). I didn't edit any existing script or asset, and ran no state-changing git commands. One code change is needed before the game can load them: add `'roads'` and `'ui3'` to `FRAGMENTS` in `src/core/Assets.js`.

## Roads (`assets/roads/`, generator `tools/fx/gen_roads.py`, check `tools/fx/check_roads.py`)

**The grid.** Roads sit on a grid of cells √2 m wide, because one cell is an exact pixel step: (64, 32) px along X and (64, −32) px along Y, so a 1×1-cell square is the classic 128×64 diamond. The game picks one integer grid origin G. Lattice point (i, j) is G + i·(64,32) + j·(64,−32).

**Widths:**
- A lane is 2 cells (2.83 m) and a two-lane carriageway is 4 cells (5.66 m).
- A one-lane village track is 2 cells.
- A sidewalk is 1 cell (1.41 m), so a full city street is 1 + 4 + 1 = 6 cells (8.49 m).
- Carriageway edges and the centre line between lanes go on even grid lines. This keeps the dirt-road wheel ruts inside their lanes.

**Textures** (512×512, tile in x and y):
- `road_dirt` has ruts along X; `road_dirt_y` has ruts along Y; `road_dirt_cross` has both, for junction squares.
- `road_cobble_wide`, `road_asphalt` (light snow dusting) and `sidewalk` work in either direction.
- Draw them at **scale 1** as repeating patterns anchored at G. The current `Ground.js` draws `ground_road` at 0.5 scale; don't copy that here.

**Layer order:**
1. `ground_snow`
2. Textures, filled cell by cell
3. Snow banks
4. Curbs
5. Markings (lanes, crosswalks, stall lines)
6. Depth-sorted sprites (vehicles, people, buildings)

**Pieces** (atlas `roads_decals`). Frames are untrimmed and each has an integer `anchorPx`; draw a piece at its anchor minus `anchorPx`.
- **Straight edges:** `curb_x/_x_near/_y/_y_near` and `snow_edge_*` in the same four sides, three variants each. Each piece is 1 cell long. Chained pieces never overlap and are pixel-identical to a continuous strip.
- **Corners:** `curb_corner_*`, `curb_inner_*`, `snow_corner_*` and `snow_inner_*`, each in n/e/s/w. They cover junctions, bends and dead ends.
- **Markings:** `lane_x/_y` (yellow dashed centre line every 2 cells), `crosswalk_x/_y` (one module per carriageway cell), `stall_lines` and `stall_lines_y`.
- **`intersection`** is the four curb corners of a standard 4-way city junction in one frame.

**How the game places them.** Mark every cell as snow, carriageway or sidewalk. Then:
- Put a curb on every edge between carriageway and sidewalk.
- Put a snow bank on every edge between paved ground and snow.
- Look at the four cells around each lattice point to pick the corner piece.

The manifest's `roadKit` section spells this out with exact formulas, including worked examples for a city street along X, a street along Y, a 4-way junction and a dirt road, plus right-hand-traffic lane centres. `compose()` in `gen_roads.py` implements the same algorithm in Python and is what drew the preview.

## Mission & fame UI (`assets/ui3/`, generator `tools/fx/gen_ui3.py`, check `tools/fx/check_ui3.py`)

- **Icons (96 px, atlas `ui3_icons`):** all 17 contract icons, in the same soft-toy style as `assets/ui`. They read at 32 px on cream and dark backgrounds.
- **Rank badges:** `ui_badge_rank_1` to `_5` (128 px). They run wood with a sprout, bronze, silver with laurel, gold with gems, then purple and gold with crown and wings. The banners are blank for the game's text.
- **Mission cards (9-slice):** `ui_mission_card` and `ui_mission_card_done`, both 176×112 with margins left 46, right 38, top 32, bottom 36. They share size and margins so you can swap one for the other. Lay content out using `contentInset` [34, 14, 16, 22].
- **Extras I added:** `ui_mission_board` (wooden board with a snowy top rail), plus `ui_progress_bg` and `ui_progress_fill`. The fill is white so the game can tint it.

## Known issues
- No blend piece between road classes; dirt meeting asphalt is a hard texture edge.
- A 1-cell curb run between two corners, or two corner cells diagonal to each other, isn't supported. The placement rules say so.
- Rounded sidewalk corners paint their own paving slabs, so slab colours change at the cell joint (the joints still line up).
- I invented the names for ranks 2 and 4 ("믿음직한" / "명예로운"); only the other three come from the design doc. They're in the manifest notes and easy to change.
- The scene preview is a static mock-up with no vehicles, since the vehicles kit isn't out yet. Only the UI build has been confirmed to reproduce identical bytes; the roads build uses fixed seeds but I didn't byte-compare two runs.

## Files
In `/home/user/nurient/frost-village/`:
- `tools/fx/gen_roads.py`
- `tools/fx/check_roads.py`
- `tools/fx/gen_ui3.py`
- `tools/fx/check_ui3.py`
- `assets/roads/` (manifest, 6 textures, `roads_decals.png` and `.json`)
- `assets/ui3/` (manifest, `ui3_icons.png` and `.json`, 5 nine-slice images)
- `docs/previews/roads_scene.png` (village, town and city grids with buildings and people for scale)
- `docs/previews/roads_sheet.png`
- `docs/previews/ui3_sheet.png`
