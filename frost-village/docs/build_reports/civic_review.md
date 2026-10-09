# civic — 비평·다듬기 기록

## critiques

[
 {
  "verdict": "polish",
  "summary": "The civic set is mostly solid, but two problems should be fixed before integration, plus several art-direction issues that the designer is likely to notice on a phone.\n\n**What works:**\n- The cutaway layers rebuild the closed frame almost exactly: premultiplied max diff is 67/255 on only 86 px.\n- `revealPoly` covers 99.9% (bank) and 99.8% (police) of the shell.\n- Ruins, rubble and scorch decals sit exactly on the `site_plot_S/M/L` footprints and anchors.\n- Wanted-board `posterPoints`, the vault and cell-door anims, and the per-frame `bucketPoint` / `cargoPoint` alignment are correct.\n- `civ_check` re-run: 0 errors.\n\n**The two serious problems:**\n1. **Demolition doesn't read on screen.** In every S/M/L layout the dump truck parks on the camera side, up against the fence. It hides the excavator's body and blocks the gate. At the dig frame, the standing ruin and fence cover the bucket, because the excavator's anchor is behind the plot (y −78/−81 vs 0).\n2. **Mirroring will misplace the civic vehicles.** Their anchors are far from 0.5 (excavator `ax` 0.437, dump truck 0.534). The repo's mirroring (`setOrigin(anchor)` + `setFlipX`, as in `Train.js`) flips around the frame centre, not the anchor. Mirrored, the excavator draws 42 px off and the dump truck 24 px; the bucket-to-bed alignment breaks by about 66 px.\n\n**Art-direction issues at phone zoom:**\n- The bank looks like a sibling of the town hall and has a blank flat roof.\n- `ruin_house_town` is a near-black silhouette (mean luminance 88 vs 184 for the townhouse).\n- There is no town-style ruin for the 3×3 clapboard shops.\n- Wanted portraits are 8–13 CSS px.\n- The dark, dense cell bars hide the cosy cell.\n- The bank's waiting chairs sit in the counter queue lane.\n- `sideDoorPoint` falls inside the parked police car.\n\n**Phaser review:** I ran it at 390×844, DPR 2, logical width 720, game zoom 0.6 / 1.0 / 1.2, beside town buildings, the fire truck, the police car and the chief. No page errors.",
  "issues": [
   {
    "severity": "high",
    "area": "demolition layout / excavator + dump_truck composition",
    "problem": "The demolition scene doesn't read, in all three S/M/L layouts. (a) `dig` swings the bucket to the excavator's right, which for the SE heading is the camera side. The dump truck therefore always parks in front of the excavator and hides its tracks and lower body, so the hero vehicle is mostly hidden. (b) The truck parks about 0.3 m from the front fence side, in front of the gate piece that `fenceRings` says to leave out, so workers and the chief can't get in. (c) The excavator stands behind the plot (anchor y −78 S, −81 M/L, vs 0 for the ruin). At `digFrame` 2 the bucket is drawn behind the standing ruin and the fence, so the bite and its dust FX can't be seen.",
    "evidence": "Screenshots in /tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v8_civic_critic_art/out/:\n- phaser_C_demo_shipped_z1.0.png, phaser_C_demo_SL_z0.6.png: truck covers the excavator body; cab against the fence corner; chief squeezed at the gate.\n- demo_digframe_occlusion.png: magenta ring = `bucketPoint` at dig frame 2, hidden inside ruin_m and behind ruin_l's walls.\n- docs/previews/civ_fire_sequence.png panels 4–5: same problem.\n- Manifest: `demolitionLayout.M.excavator.at` [-198,-81]; `dump_truck.at` [-283,11].",
    "fix": "1. Re-render `dig` for the NE heading with the swing to the excavator's LEFT (−X). The build report puts a dig re-render at about 3 min.\n2. Redefine `demolitionLayout`: the excavator stands on the street side (−Y), faces NE into the plot and is drawn in front of the ruin, so the bucket bites the ruin's front face. The truck parks on the plot's −X side, behind-left, with its `cargoGround` under the new `dumpPoint` and at least 0.5 m clear of the ring.\n3. Publish explicit layouts for all four sides plus a `gateIndex` piece that no vehicle blocks.\n4. Extend `civ_check` with screen-space tests: at least 70% of the excavator's pixels not covered by the truck, and the `bucketPoint` at `digFrame` not covered by the ruin or fence pieces drawn after it."
   },
   {
    "severity": "high",
    "area": "vehicle mirroring / anchor (excavator, dump_truck)",
    "problem": "The vehicle convention is SW←SE and NW←NE with `setFlipX`, and points are mirrored by negating dx. Phaser mirrors a flipped frame around the frame-box centre, not around the origin. That is safe for the existing vehicles because their `ax` is about 0.5 (worst offset about 6 px). The civic vehicles are far off: excavator `ax` 0.43675 on a 332 px frame (42 px), dump_truck `ax` 0.53448 on 348 px (−24 px). The way this repo mirrors, `setOrigin(anchor)` + `setFlipX(true)` (`src/entities/Train.js` line 33; documented in `src/systems/Occlusion.js` around line 54), puts a mirrored excavator 42 px (0.66 m) off its anchor and footprint. The mirrored bucket would dump about 66 px beside the truck bed.",
    "evidence": "- Scratch out/phaser_C_demo_mirror_naive_z1.0.png (origin = anchor) vs out/phaser_C_demo_mirror_z1.0.png (origin = 1−ax): the excavator cab shifts about 40 device px, and the bucket and cargo dots no longer sit on the bed.\n- assets/civic/manifest.json: `characters.excavator.anchor` [0.43675, 0.74306]; `dump_truck.anchor` [0.53448, 0.80053].",
    "fix": "In civ_pack, pad every excavator and dump_truck frame symmetrically so the anchor x is exactly 0.5. The padding is trimmed in the atlas, so it costs no memory, and point offsets stay unchanged. Add a civ_check rule: abs(ax − 0.5) × frameW ≤ 2 px for every `kind: \"vehicle\"`. At minimum, add `conventions.flip`: use `setOrigin(1 − ax, ay)` when flipped."
   },
   {
    "severity": "medium",
    "area": "bank exterior identity",
    "problem": "The closed bank reads as an annex of the town hall: the same cream walls, white columned portico, and teal pediment with a gold pinecone. Its roof is a large blank white flat slab. At game zoom 0.6, the only bank cue is a 26-px gold coin on the roof. Every neighbouring town building has a coloured gable or a tower.",
    "evidence": "Scratch out/civic_vs_town_closed.png and out/civic_vs_town_closed_z0.6.png (town_hall | bank | clinic | police_station | police_box); out/phaser_A_street_z0.6.png. Bank mean luminance 204 (the brightest asset); about 30% of its silhouette is plain roof.",
    "fix": "Give the bank its own palette: warm sandstone, deep bottle-green or burgundy trim, gold. Give it a readable roof: a mansard or low dome with a big gold coin or piggy finial, or a coin-shaped clerestory. Add a frieze sign board above the door (coin pictogram or 은행) and a coin-round window. The cutaway layer split and anchors can stay the same; re-render bank_shell and the closed `bank` frame (about 14 min)."
   },
   {
    "severity": "medium",
    "area": "ruin_house_town tone + colour match",
    "problem": "This is the darkest civic asset and reads grim at phone zoom: a full-height black house silhouette, mean luminance 87.6 vs townhouse_a 184.4, with 26% near-black pixels. Its leftover siding is mustard yellow, which matches only townhouse_a. A burnt red, blue or green townhouse would leave a yellow ruin. Its chimney is centre-front, while the townhouses have theirs on the back ridge.",
    "evidence": "Scratch out/ruins_lt_1.5x.png, out/phaser_B_fire_z1.0.png (between yellow townhouse_a and pink townhouse_c), out/align_ruins.png (ghost townhouse_a overlay shows the chimney mismatch). Luminance stats: townhouse_a 184.4 / 0.2% dark; ruin_house_town 87.6 / 26.0% dark.",
    "fix": "- Knock the gable down by about 30%.\n- Use warm charcoal (around #4a3f3a) instead of near-black.\n- Add more snow caps on the broken edges.\n- Make the siding remnants neutral cream, or ship `_a/_b/_c/_d` colour variants, or a tint-mask layer.\n- Move the chimney to match the townhouses.\n- Enlarge the surviving cute prop (flower box) so it reads at 0.6."
   },
   {
    "severity": "medium",
    "area": "missing town-shop ruin",
    "problem": "Town shops (cafe, bookstore, toy_shop, flower_shop, hair_salon, clothing_store) are 3.0×3.0 m two-storey painted clapboard. Town lots are M [3.4, 3.0] and L [4.4, 3.4] (src/data/world.js lines 548–552). The only M ruin is a log cottage on a stone base, so a burnt cafe turns into a village log cabin. The designer's fires happen in the city.",
    "evidence": "Scratch out/phaser_B_fire_z1.0.png and out/phaser_B_fire_z0.6.png: ruin_m next to the cafe looks like it belongs to a different village. assets/town/manifest.json footprints; civic manifest `ruin_m.notes` ('burnt log cottage').",
    "fix": "Add `ruin_shop_town` (3×3: clapboard shell with a charred awning frame and a surviving shop sign or cup) and `ruin_l_town` (4.4×3.4 lot) sharing the town anchors. Map building family to ruin key in `fireSequence`."
   },
   {
    "severity": "medium",
    "area": "wanted_board readability",
    "problem": "Portrait windows are 24×19 px (`posterSizePx`). On a 390-px phone at logical width 720, that is about 13 CSS px at zoom 1.0 and about 8 CSS px at zoom 0.6, too small to recognise a resident's face. The posters have no wanted glyph; the red header band is blank.",
    "evidence": "Scratch out/wanted_board_points_3x.png (windows line up correctly), out/phaser_A_street_z0.6.png, out/phaser_A_police_z1.0.png.",
    "fix": "Use 2 bigger posters, or widen the board (2.6–3 m) to give windows of at least 40×34 px. Put a pictogram on the header band (magnifier, '!' or a thief-mask icon). Tell the code agents to open fx_city `ui_wanted_poster` when the board is tapped."
   },
   {
    "severity": "medium",
    "area": "police cell legibility / cosiness",
    "problem": "The bars are dark slate (#4A5563), dense and 2.05 m tall on two faces. At phone zoom the cosy cell (quilt, teddy, cocoa) reads as a black cage and the inmate looks striped. The desk officer at `staffPoints[0]` [-3,-35] also partly covers the inmate at `cellPoint` [-43,-79]: same @behind slot, about 40 px apart.",
    "evidence": "Scratch out/police_station_open_composite.png, out/police_cell_frames.png, out/prev_police_people_zoom.png; civ_assets.py lines 958–995 (`iron_m`, `zb1 = PL + 2.05`).",
    "fix": "Paint the bars powder blue or white with gold knobs, space them about 0.16 m apart, and lower them to about 1.7 m, or use a half-height barred front with a cute 'time-out' sign. Move `staffPoints[0]` about 0.3 m to +X so the officer doesn't overlap the inmate. Re-render police layers (about 13 min)."
   },
   {
    "severity": "medium",
    "area": "bank interior layout / points",
    "problem": "The waiting chairs (red sofa row) sit right in front of the teller counter, in the customer lane. `seatPoints` stack on `counterPoints` in screen space: seat[1] [35,3] vs counter[1] [43,2] is 8 px; seat[0] [14,-7] vs counter[0] [7,-16] is about 11 px. A seated customer and a served customer get drawn on top of each other.",
    "evidence": "Scratch out/bank_points.png, out/bank_people.png, out/bank_vault_frames.png (chairs directly in front of the counter); pair-distance table from my point scan.",
    "fix": "Move the waiting chairs to the right-front corner along the right stub wall, or next to the ATM, keeping every seat at least 30 px (screen) from every counter or queue point. Re-render bank_interior (the layer split stays). Until then, flag `seatPoints` as conflicting in `notes`."
   },
   {
    "severity": "medium",
    "area": "police car bay vs side door",
    "problem": "The police_car parked at `carBayPoint` [95,48] heading SW (`carBayDir`) covers `sideDoorPoint` [109,11], which falls inside the car's mirrored `footprintPoly`. One of the car's `doorPoints`, mirrored, lands at [19,27], about world x 0.8 m, which is inside the station wall (wall x about 0.9). A driver getting out would spawn in the wall.",
    "evidence": "Point-in-polygon test with assets/vehicles police_car `footprintPoly.SE` mirrored: sideDoor inside = True. Scratch out/phaser_A_police_z1.0.png (car tight against the side wall).",
    "fix": "Move `carBayPoint` about 0.45 m along +X (about [115,58]) and widen the painted bay. Alternatively, move the side door to the back corner or drop `sideDoorPoint`. Add a civ_check test against the vehicles' `footprintPoly` and `doorPoints`."
   },
   {
    "severity": "medium",
    "area": "rubble piles read as snowdrifts",
    "problem": "`rubble_pile_*` is mostly a white snow mound (mean luminance 179.6, vs 113 for ruins), and the beams render as white sticks. At zoom 0.6, the 'clearing' stage reads as a snow pile with sprinkles, not debris from a burnt house.",
    "evidence": "Scratch out/rubble_pile_l_3x.png, out/phaser_C_demo_SL_z0.6.png, out/phaser_D_plots_z0.6.png.",
    "fix": "Make the heap ash-grey or charcoal with brick red and charred timber ends, and keep snow to a light dusting on top. Keep the footprints and anchors (they're correct)."
   },
   {
    "severity": "low",
    "area": "ruin smoke overlay",
    "problem": "`ruin_*_smoke` wisps are pale blue-grey, dithered, separate beads. On snow they almost disappear, and at 4× the alpha shows palettisation speckle.",
    "evidence": "Scratch out/smoke_zoom.png (left on snow, right on dark); out/ruins_1x.png.",
    "fix": "Use a slightly darker warm-grey core with a soft light rim as one continuous wisp, and keep more alpha levels in the palette for this sheet (or pack it RGBA). Match fx_city `fx_smoke_column`'s outline style."
   },
   {
    "severity": "low",
    "area": "embers baked into base ruins",
    "problem": "Orange ember glow is baked into the base ruin frames: 30 (S), 110 (M), 68 (L) and 22 (house) px. The ruin stays 'hot' through the insurance, demolition and clearing steps, and the game can't cool it down.",
    "evidence": "Pixel scan of `ruin_s/m/l/house_town` vs `ruin_m_smoke` (0 ember px); out/ruins_sm_2x.png.",
    "fix": "Move the ember glints into the `_smoke` overlay (or a separate `_embers` overlay), so removing the overlay leaves a cold ruin."
   },
   {
    "severity": "low",
    "area": "for_sale_sign / sold_sign",
    "problem": "Both boards are blank, with `boardPx` [37,21]. Game-rendered text at that size can't be read at zoom 0.6–1.0, and sold differs from for-sale only by a thin red ribbon.",
    "evidence": "Scratch out/props_zoom_a.png, out/props_z0.6.png.",
    "fix": "Bake pictograms: house + price tag/coin for sale, and a big pink heart or stamp across the board for sold. Keep `boardPx` for optional text."
   },
   {
    "severity": "low",
    "area": "fire_alarm_post ring anim",
    "problem": "The ring loop changes only about 300 px per frame, and the lamp flashes red on a red post. It doesn't read at phone zoom.",
    "evidence": "Frame-diff scan (`fire_alarm_post` ring: 324/46/308 px changed); out/gif_civ_alarm.png.",
    "fix": "Flash the lamp bright yellow-white with a halo, swing the bell about ±15°, and pair it with fx_city `fx_alarm_flash` at `fxPoints.lamp`."
   },
   {
    "severity": "low",
    "area": "dump truck tip anim + memory",
    "problem": "In `tip_SE` the load disappears between frames 0 and 1, with no visible stream out of the tail. The atlas is 2040×1708 (13.9 MB GPU, more than the fire truck's 10 MB) because `idle_loaded` and `move_loaded` repeat the whole truck.",
    "evidence": "Scratch out/truck_tip_frames.png; atlas table (civ_dump_truck 90% fill, 36 frames).",
    "fix": "Show a rubble stream at the tail in frames 2–3 and a small `dump_pile` prop at `tipPoint`. Replace the loaded variants with a bed-cargo overlay drawn at `cargoPoint` (saves about 4.6 MB)."
   }
  ],
  "keep": [
   "Cutaway system: aligned layers that rebuild the closed frame (premultiplied max diff 67/255 on 86 px), `drawOrder` with `@behind` / `@front` slots, `pointSlots`, `fade` / `cut` metadata, and `revealPoly` covering 99.9% / 99.8% of the shell. Don't change the layer split or anchors.",
   "Ruins, rubble and scorch decals: footprints and anchors match `site_plot_S/M/L` exactly; ruin_house_town matches the townhouses at 2.6 m (scratch out/align_ruins.png, out/phaser_D_plots_z0.6.png).",
   "Vault anim (handle spins in frames 1–2, door swings out, gold bars inside) and the outward-swinging cell door with `cellDoorPoint` clear of the swing.",
   "Wanted board `posterPoints` and `gatherPoints` geometry: they line up with the portrait windows exactly. Only the size needs to grow.",
   "Excavator and dump truck modelling, materials and 1-px outline match the assets/vehicles family (edge luminance about 85–92, same as police_car and fire_truck). Baked operators, friendly toy proportions; per-frame `bucketPoints` are accurate (the frame-5 bucket lands on the truck's `cargoPoint` in the SE layout).",
   "Police station look (navy and white clapboard, star badge) that matches the town police_box; the cosy cell props (quilt, teddy, cocoa) themselves.",
   "Moving props: furniture_pile_s/l (teal sofa, pink armchair, cactus, lamp, rolled rug) and moving_boxes_stack with the teddy and lamp peeking out. Charming and readable.",
   "Demolition fence tiles, ring geometry and lamp blink; the insurance_sign pictogram (umbrella over a house) reads without text.",
   "Bank interior dressing (checker floor, brass teller rails with near-invisible glass, number display, piggy statue, ATM).",
   "Pipeline hygiene: payload 1.61 MB, palettised sheets ≤ 2048 px, `civ_check` 0 errors (re-run), packer merge guard."
  ]
 }
]

## polish

Report written to `/home/user/nurient/frost-village/docs/build_reports/civic.md`; its full text follows.

# civic build report

All 15 critic issues reproduced and are fixed. The pack passes its check with 0 errors and 0 warnings, the Phaser load test passes, and re-packing gives byte-identical files.

- **Contents:** `assets/civic/` holds 54 sprites and 2 vehicles in 10 atlases.
- **Size:** the payload is 2.02 MB (the limit is 7 MB). All atlases together use 37.4 MB of GPU memory.
- **Checks:** `civ_check.py` reports 0 errors and 0 warnings. That includes the new rules for layouts, mirroring, point clearances, embers and readability.
- **Phaser 3.90 load test:** a headless load found all 186 frames and registered 32 anims, 18 of them playing in the demo.
  - The tap-to-reveal test passed. Hovering fades the bank's shell to its `openAlpha` of 0.12 and shows `_shell_cut`, while the police station stays closed.
  - The demo now draws two M demolition plots from `demolitionLayout.M.sides`: side Y-, and side X+ with the vehicles mirrored the way the game mirrors them (`setOrigin(anchor)` + `setFlipX`).
  - It also shows the loaded dump truck (the truck anim plus the cargo-overlay anim), the town ruins smouldering, and the truck tipping onto a `dump_pile`.
- **Re-packing is byte-identical:**
  - Two packs into empty folders are identical (21 files), and their atlases match `assets/civic`.
  - Re-packing in place reproduces `assets/civic` exactly.
  - The production manifest has no stale keys left over from merging with the old one.
- **Packer guard:** with an empty cache the packer still stops with exit 1 and writes nothing.

The art follows the house style: toy-like, snowy and warm. Ruins are charred but cute, with snow-capped beams, warm soot and one surviving cute thing in each. A ruin looks cold once its smoke overlay is removed.

## What changed in the polish pass
- **Demolition now reads clearly.**
  - The excavator stands on the street side, in front of the ruin, and digs over the fence.
  - At `digFrame` 2 its bucket bites the front of the ruin, about 3.3 m ahead of the excavator. That reach clears the fence on every plot size.
  - `dig` now swings left, away from the camera, to dump. The dump truck parks on that side, behind the excavator.
  - On the front sides the truck covers 0% of the excavator, and 96% of the truck stays visible.
  - There are layouts for all four street sides (`sides.Y- / X+ / X- / Y+`). Each has a `gateIndex`: the fence piece to leave out as a gate, which no vehicle blocks.
- **Mirroring is exact.**
  - Excavator and dump-truck frames are padded so `anchor x` is exactly 0.5, so `setOrigin(anchor)` + `setFlipX(true)` mirrors a vehicle around its anchor.
  - The padding is trimmed in the atlas, so it costs no memory.
  - Before, the excavator's anchor was 42 px off centre on a 332 px frame (ax 0.43675), and the dump truck's was 24 px off on a 348 px frame.
- **The bank has its own look.**
  - Honey-sandstone block walls with cream corner stones.
  - A burgundy slate mansard roof with round gold coin dormers, topped by a big gold coin on a drum.
  - A burgundy sign board over the columns with gold coin stacks, a burgundy pediment and door, a round coin window and a piggy bracket sign.
  - Mean luminance fell from 204 to 172, and the roof is no longer a blank white slab.
  - The layer split, footprint and anchor rule are unchanged.
- **The bank interior is untangled.**
  - The waiting seats are now a red velvet bench on the front-left wall. The nearest seat is 82 px from any counter or queue point; before, it was 8 px.
  - The ATM moved to the front-right corner on the right wall, and its user faces it (SE).
  - The piggy statue is a little smaller, and the plant that blocked the lane is gone.
- **The police cell is cosy, not a cage.**
  - The bars are powder blue with gold knobs, 0.16 m apart and 1.7 m high, with a sleepy-moon "time-out" sign.
  - The desk officer moved 0.3 m to +X, so the inmate's face at `cellPoint` is clear.
- **The police car bay is fixed.**
  - The painted bay is wider, and the car parks 0.45 m further out (`carBayPoint` [115, 58]).
  - The car's near door point is 0.35 m from the wall, and `sideDoorPoint` [96, 5] is clear of the parked car.
  - The footprint grew to 7.2 × 4.6 m. New `buildingRectM` / `carBayRectM` fields give the walls and the bay in metres.
- **Town ruins.**
  - `ruin_house_town` was rebuilt:
    - Neutral cream clapboard that fits every townhouse colour, with warm charcoal soot (#4A3F3A) instead of near-black.
    - The gable is about a third lower, the broken edges carry snow caps, and the chimney is at the back like the townhouses' chimneys.
    - The flower box is big.
    - Mean luminance rose from 88 to 146, and near-black pixels fell from 26% to 2%.
  - New `ruin_shop_town` (town lot M, 3.4 × 3.0 m) and `ruin_l_town` (town lot L, 4.4 × 3.4 m).
  - New `ruinFor` maps every building to its ruin, scorch decal, rubble pile and fence ring.
- **Rubble reads as debris.**
  - Mottled ash-grey and warm charcoal with brick-red crumbs, charred timber with light wood ends, lots of bricks and only a dusting of snow.
  - Mean luminance fell from 180 to 105–135.
- **Smoke and embers.**
  - Ruin smoke is one continuous warm-grey wisp, darker at the core and lighter at the top.
  - It renders at 64 samples, is smoothed with a premultiplied blur, and is packed RGBA in a new `civ_smoke` atlas. That removes the palette speckle.
  - The embers moved out of the base ruins into the `_smoke` overlay, where they flicker. The base ruins now have 0 ember pixels; before, they had 30 / 110 / 68 / 22.
- **Readable props.**
  - `wanted_board` is 2.9 m wide with three big portrait windows: `posterSizePx` is 42 × 35, up from 24 × 19. It has a magnifier pictogram on the red header and a coin on the reward strip.
  - `for_sale_sign` carries a house with a gold price tag and a coin. `sold_sign` has a ribbon and a big pink heart.
  - The `fire_alarm_post` lamp flashes bright yellow-white with a halo, and the bell swings ±15°. About 730–880 px change per frame, up from 46–324.
- **Dump truck.**
  - The loaded look is now a cargo overlay (`cargo_{idle|move}_{dir}_{i}`) instead of two whole extra anims.
  - The atlas fell from 2040 × 1708 to 2040 × 1292, so the truck uses 10.0 MB of GPU memory instead of 13.9 MB.
  - `tip` pours a rubble stream at frames 2–3. The new `dump_pile` prop goes at `tipPoint` from `pileFrame` 3.
- **Previews.**
  - They use the cityfolk outfits: bank tellers and a banker, police officers, a little burglar in the cell, movers and a demolition worker.
  - The fire sequence shows the whole smoke column.
  - A new sheet shows every demolition layout.

## Keys
- **Bank** (`bank`, 은행 "솔방울 은행", footprint 5.4 × 4.6 m): the sandstone, burgundy and gold hall described above.
  - It is a cutaway, like the logistics centre. The layers are `bank_floor`, `bank_back`, `bank_interior`, `bank_front`, `bank_shell_cut` and `bank_shell`, plus the overlay `bank_vault`.
  - `bank_vault` is the round vault door. `anims.vault` is 8 frames that open it; `vault_close` reverses them.
  - Inside:
    - The teller counter with glass partitions and number lamps, plus a number display.
    - The red velvet waiting bench on the front-left wall.
    - The ATM in the front-right corner, the manager desk, the piggy statue and the money cart.
    - A vault room with gold bars.
- **Police station** (`police_station`, 경찰서, footprint 7.2 × 4.6 m including the car bay): a white-and-navy clapboard station with a light bar, a star badge sign and a painted car bay.
  - It is a cutaway with the same layer set, plus the overlay `police_station_cell`.
  - `police_station_cell` is the cell door. `anims.open` is 6 frames; `close` reverses it.
  - The cosy cell has powder-blue bars with gold knobs and the time-out sign. Inside are a cot with a patchwork quilt, a teddy, cocoa, a flower and a red rug.
  - The room also has a reception desk with donuts, a stove with a kettle, a filing cabinet, a visitor bench and coat hooks.
- **Incident props:**
  - `wanted_board`: three big portrait windows, a magnifier header and a coin reward strip.
  - `fire_hydrant`.
  - `fire_alarm_post`: `anims.work` / `anims.ring` are 4 frames each; the lamp flashes and the bell swings.
- **Fire aftermath:**
  - Village ruins: `ruin_s` (log cottage), `ruin_m` (log house) and `ruin_l` (brick building), for plots S / M / L (2 / 3 / 4 m).
  - Town ruins:
    - `ruin_house_town`: for the townhouses and the police box, 2.6 m.
    - `ruin_shop_town`: town lot M, 3.4 × 3.0 m. It has an awning frame with tatters, a shop bell, a basket bracket sign, and a mug and a flower pot on the sill.
    - `ruin_l_town`: town lot L, 4.4 × 3.4 m. It has a false front with a green stripe, a toppled shelf with cans and boxes, and a shopping cart.
  - Every ruin has a smoke overlay, `ruin_*_smoke`, with smoke wisps and flickering embers: `anims.smoke`, 4 frames, looping, in the `civ_smoke` atlas.
  - Ground decals: `scorch_decal_s/m/l`.
  - `rubble_pile_s/m/l`, plus `_half` stages that share the same frame and anchor.
  - `dump_pile`: a 1.4 × 1.2 m heap that the dump truck leaves at the dump.
  - `insurance_sign`: an umbrella over a house.
- **Demolition:**
  - Fence tiles `demolition_fence_x` / `_y`, plus `_lamp` variants (`anims.blink`, 2 frames) and `demolition_fence_post`.
  - `excavator`: idle, move, and `dig` (8 frames; it swings left to dump).
  - `dump_truck`: idle, move and `tip` (6 frames), plus the cargo overlay frames `cargo_idle_{SE,NE}_{0,1}` and `cargo_move_{SE,NE}_{0..3}`.
- **Moving:**
  - `moving_boxes_stack`, `furniture_pile_s` and `furniture_pile_l` (`furniture_pile` is an alias of `_l`).
  - `for_sale_sign` and `sold_sign`, both with pictograms.
  - `welcome_mat`, a ground decal.

**Atlases:** `civ_bank`, `civ_police`, `civ_ruins`, `civ_smoke`, `civ_props`, `civ_moving`, `civ_demo`, `civ_decals`, `civ_excavator`, `civ_dump_truck`.
- All are palettised except `civ_smoke`, which is RGBA because of its soft alpha.
- Every sheet is at most 2048 px on each side.

| atlas | size | frames | on disk |
|---|---|---|---|
| civ_bank | 1780×740 | 15 | 161.5 KB |
| civ_police | 1884×708 | 13 | 145.4 KB |
| civ_ruins | 1840×532 | 12 | 222.5 KB |
| civ_smoke | 1888×492 | 24 | 515.2 KB |
| civ_props | 1300×220 | 11 | 28.8 KB |
| civ_moving | 504×180 | 3 | 19.1 KB |
| civ_demo | 1040×116 | 10 | 20.7 KB |
| civ_decals | 1016×232 | 3 | 67.5 KB |
| civ_excavator | 1960×952 | 28 | 357.5 KB |
| civ_dump_truck | 2040×1292 | 36 | 428.9 KB |

## Fields
All points are pixel offsets from the anchor. `*Dir` gives the facing; SW, W and NW use mirrored frames.

**Cutaways** (`sprites.bank.cutaway`, `sprites.police_station.cutaway`), unchanged:
- `layers` and `drawOrder`. For the bank the order is floor, back, interior, vault, `@behind`, front, `@front`, shell_cut, shell. The police station has the cell overlay after front.
- `overlays`.
- `fade`: `layer` _shell, `openAlpha` 0.12, `ms` 260.
- `cut`: _shell_cut is shown only while the building is revealed.
- `revealPoly`: the silhouette polygon, used for tap and hover tests.
- `floorLiftPx`.
- On the building entry, `pointSlots` maps each point field to `behind`, `front` or `outside`.

**Bank:**
- `staffPoints`: three tellers facing SW, then the manager.
- `customerPoints`: the queue, 3 spots facing NE.
- `counterPoints`: one per teller window, facing NE.
- `seatPoints`: the waiting bench, at seat height and facing SE. The nearest is 82 px from any counter or queue point; `civ_check` requires at least 30 px.
- `atmPoint` [17, 35], facing SE into the ATM.
- `vaultPoint`, `deskPoint`, `entryPoint`, `doorPoint`.
- `fxPoints`: sign, display, vault, lamp.

**Police station:**
- `staffPoints`: the desk officer (now 0.3 m further to +X) and the filing officer.
- `customerPoints`: visitors at the desk.
- `seatPoints`: the bench.
- `cellPoint` / `cellPoints`: the inmate on the cell rug, facing SE.
- `cellSeatPoint`: the edge of the cot.
- `cellDoorPoint`: where the officer stands at the cell door.
- `carBayPoint` [115, 58] / `carBayDir` (SW): where `police_car` from assets/vehicles parks.
- `doorPoint`, `entryPoint`, `sideDoorPoint` [96, 5].
- New `buildingRectM` [−3.1, 0.9, −1.4, 1.8] and `carBayRectM` [1.38, 3.56, −2.18, 2.18]: the walls and the painted bay as [x0, x1, y0, y1] in metres from the anchor.

**Props:**
- `wanted_board`:
  - `posterPoints`: the 3 portrait windows (same geometry as before).
  - `posterSizePx` [42, 35] (was [24, 19]).
  - `gatherPoints`: where readers stand.
  - `posterNote`: on tap, open fx_city `ui_wanted_poster`.
- `fire_hydrant`: `hosePoint`.
- `fire_alarm_post`: `fxPoints` (bell, lamp).
- Signs carry `boardPx` and `fxPoints.board`, the free strip where the game may write text.
  - `boardPx` is [35, 6] for for-sale and sold, and [58, 16] for insurance.
  - The pictograms are baked in, so the text is optional.
- `moving_boxes_stack`: `dropPoint`.

**Ruins and rubble:**
- Ruins carry `workPoints` / `workDirs`: spots for the crew and the bucket.
- Ruins also carry `fxPoints`: smoke bases, chimney and ember, plus the sign on `ruin_shop_town`.
- `<ruin>_smoke` entries carry `of: <ruin>` and are drawn at that ruin's position and anchor.
- Rubble carries `stage` / `stages`.
- Anchors and footprints:
  - The village ruins match `site_plot_S/M/L` in assets/buildings.
  - `ruin_house_town` matches `townhouse_a..d`.
  - `ruin_shop_town` and `ruin_l_town` match the town lots M [3.4, 3.0] and L [4.4, 3.4].
  - A ruin replaces its building in place.
- Scorch decals: anchor at the centre, plus `radiusM`, `plotM` and `layer: ground`.
- `dump_pile`: a decor heap with `workPoints`.

**Vehicles** (`characters.excavator`, `characters.dump_truck`) follow the assets/vehicles conventions:
- SE and NE are rendered; SW and NW are mirrored. Frames are named `{anim}_{dir}_{i}`.
- `anchor[0]` is exactly 0.5. Excavator frames are 398 × 292 and dump-truck frames are 372 × 388.
- An operator is baked into each cab. There is no baked shadow; use the `shadow` ellipse.
- `excavator`:
  - `anims.dig.digFrame` 2 (the bite) and `dumpFrame` 5 (the dump, to the left).
  - `bucketPoint[anim][dir][i]` gives the bucket position per frame.
  - `digPoint` / `dumpPoint` are the ground points under the bucket.
- `dump_truck`:
  - `cargoPoint`, `cargoGround` and `bedPoint[anim][dir][i]`.
  - `tipPoint` and `anims.tip.tipFrame` 2. New: `pileFrame` 3.
  - New `cargoOverlay`: `{frameName: 'cargo_{anim}_{dir}_{i}', anims: [idle, move], frames: {idle: 2, move: 4}}`. Draw it on top of the truck frame with the same position, origin and flip.

**Top-level manifest fields:**
- `fenceRings.S/M/L`: fence pieces with px offsets from the plot centre. The rings are 2.83 / 4.24 / 5.66 m squares, so they also fit the town lots.
- `demolitionLayout.S/M/L` (version 2):
  - `.default` is `Y-`.
  - `.sides[Y- | X+ | X- | Y+]` is `{excavator: {at, dir, anim, worldM, digPointWorldM, notes}, dump_truck: {at, dir, worldM, anim, notes}, gateIndex, digVisible, checks}`.
  - `at` is in px from the plot centre.
  - `checks` holds the screen-space test results: `digVisible`, `bucketCoveredSamples`, `truckCoversExcavator`, `truckVisible`.
  - The flat `excavator` / `dump_truck` / `gateIndex` fields copy `sides.Y-`, for older readers.
- `ruinFor`: building key → `{ruin, scorch, rubble, ring}`. The `'*'` entry describes the fallback.
- `fireSequence`: the step list.
- `conventions`. New entries: `flip`, `vehicles` (the cargo overlay and `pileFrame`) and `demolition`.

## How the game uses them
1. **Load:** add `'civic'` to `LATE_FRAGMENTS` (or `FRAGMENTS`) in `src/core/Assets.js`. I did not edit src; that belongs to the code agents.
   - Sprite anims register as `spr:<key>:<anim>`, for example `spr:bank_vault:vault`, `spr:police_station_cell:open`, `spr:ruin_m_smoke:smoke`, `spr:fire_alarm_post:ring` and `spr:demolition_fence_x_lamp:blink`.
   - Vehicles load like assets/vehicles. Also register the cargo anims `cargo_idle_{dir}` and `cargo_move_{dir}` from `cargoOverlay`.
   - `civ_smoke` is only needed while something smoulders, so it can be loaded lazily.
2. **Cutaways:**
   - **Closed:** draw only the `<key>` sprite, which has all layers composited.
   - **Open:** draw every layer at the building's position and origin, in `drawOrder`, with depth = base + 0.01 × index. Put characters into `@behind` / `@front` according to `pointSlots`.
   - **Reveal:** on a tap or hover inside `revealPoly`, or when the chief walks in, fade `_shell` to `openAlpha` and fade in `_shell_cut`.
   - **Bank:** play `vault` when someone goes to `vaultPoint`, and `vault_close` afterwards.
   - **Police station:** play `open` when an officer at `cellDoorPoint` brings someone to `cellPoint`, then `close`.
3. **Bank flow:**
   - A customer goes door → `entryPoint` → queue (`customerPoints`) → `counterPoints[i]`, served by `staffPoints[i]`.
   - The manager sits at `deskPoint`.
   - ATM users stand at `atmPoint`, and waiting customers sit on the `seatPoints` in the sit pose.
4. **Police:** park `police_car` at `carBayPoint`, heading `carBayDir`. Staff use `sideDoorPoint`. The game can test positions against `buildingRectM` / `carBayRectM`.
5. **Fire → rebuild** (also listed in `fireSequence`):
   1. **Burning:** fx_city `fx_fire_bld_<s|m|l>` and `fx_smoke_column`.
   2. **Ruin:** look up `ruinFor[building]`.
      - Swap the building for `ruin` at the same anchor and put `scorch` on the ground layer.
      - Draw `<ruin>_smoke` on top while it smoulders, and put an `insurance_sign` nearby.
      - Remove the overlay when the ruin has cooled; the base ruin is cold.
   3. **Demolition:** use `demolitionLayout[ring].sides[<the plot's street side>]`, or `default` (`Y-`).
      - Put up `fenceRings[ring]` without the `gateIndex` piece.
      - Place the excavator (`dig`) and the dump truck at their `at` and `dir`. For SW / NW, use `setOrigin(anchor)` + `setFlipX(true)` and negate the dx of every point.
      - At `digFrame`, play fx_city `fx_demolish_dust` at `bucketPoint`.
      - From `dumpFrame` on, draw the truck's cargo overlay.
      - Swap the ruin for `rubble`, then `_half`, then nothing.
      - Prefer the front sides (`Y-`, `X+`), where `digVisible` is true.
   4. **Clearing:** the truck leaves with `move` plus `cargo_move`. At the dump it plays `tip`, hides the cargo overlay from tip frame 0, and places `dump_pile` at `tipPoint` from `pileFrame`.
   5. **Rebuild:** place assets/buildings `site_*` at the same anchor, remove the fence, fade out the scorch decal, then place the new building.
6. **Wanted board:** draw resident portraits centred on `posterPoints`, scaled to `posterSizePx`. Residents read it from `gatherPoints`. On a tap, open fx_city `ui_wanted_poster`.
7. **Moving:**
   - Swap `for_sale_sign` for `sold_sign` when the house sells.
   - Put `moving_boxes_stack` and `furniture_pile_*` by the door; movers carry boxes to `dropPoint`.
   - Place `welcome_mat` at the new family's `doorPoint`, on the ground layer.
   - The truck is assets/logistics `moving_truck`.
8. **Fire brigade:** firefighters connect at `fire_hydrant.hosePoint`. `fire_alarm_post` plays `ring` when a resident reports a fire; pair it with fx_city `fx_alarm_flash` at `fxPoints.lamp`.

## Scripts and how to rebuild
All of these are new files owned by this set:
- `tools/blender/civ_lib.py`: layer tagging, overlays and materials.
  - The polish pass added `rubble_mat`, `SoftSmoke2` and `smoke_wisps2`, siding planks in `scorched`, and light wood ends on `charred_beam`.
- `tools/blender/civ_assets.py`: all the builders.
  - The polish pass added the new bank shell and interior, the police cell and bay, `ruin_smoke`, the town ruins, the rubble, `dump_pile`, the wanted board, the alarm and the signs.
- `tools/blender/civ_veh.py`: the excavator (left-swing `dig`) and the dump truck (tip stream and cargo overlay renders).
- `tools/blender/civ_render.py`: smoke overlays render at 64 samples or more.
- `tools/blender/civ_decals.py`: procedural scorch decals.
- `tools/blender/civ_pack.py`:
  - Anchor centring for vehicles.
  - The `civ_smoke` RGBA atlas with premultiplied smoothing.
  - `demolitionLayout` version 2: a search that measures clearances between footprints in metres (separating-axis test), then checks the result on screen with the real sprites.
  - `ruinFor`, the cargo overlay and the police rects.
- `tools/blender/civ_preview.py`
- `tools/blender/civ_check.py`, with new rules for:
  - vehicle anchors within 2 px of the frame centre;
  - cargo overlay frames and `pileFrame`;
  - bank seats at least 30 px from counter and queue points;
  - the police car against the side door, the walls and its own door points;
  - `posterSizePx` of at least [40, 34];
  - every ruin having a smoke overlay, at most 6 ember pixels in a base ruin, and a warning when luminance is below 105;
  - the `demolitionLayout` sides: clearances, dig point inside the plot, bucket over the bed, `gateIndex`, bucket visible on the front sides, and the truck covering at most 30% of the excavator;
  - every `ruinFor` key existing.
- `tools/test/civic_phaser.mjs`

The scripts import these existing helpers read-only: `bl_common`, `prop_lib`, `bld_assets` / `bld_render`, `town_lib`, `veh_lib` / `veh_models` / `veh_render`, `pack_utils`, `prop_pack`, `char_pack`, `town_pack.Scene` and `cityfolk_compose`. No script or asset outside this set was edited.

```
/tmp/bvenv/bin/python tools/blender/civ_render.py -- [keys|zones|prefix*] [--force] [--samples N] [--threads N] [--list]
python3 tools/blender/civ_pack.py [--out DIR] [--prev DIR] [--no-previews] [--allow-partial]
python3 tools/blender/civ_preview.py [--out DIR] [--prev DIR]
python3 tools/blender/civ_check.py [--out DIR]
node tools/test/civic_phaser.mjs
```
- **Render cache:** `/tmp/fv_cache/civic`. Cycles uses 2 fixed threads, and rendering resumes where it stopped.
- **Polish render times on the shared CPU:**
  - bank ≈ 14.5 min
  - police station ≈ 10.5 min
  - dump truck with cargo overlays ≈ 12 min
  - excavator ≈ 8 min
  - six ruins with smoke overlays ≈ 11.5 min, plus 5.5 min to re-render 4 of them after a material fix
  - rubble ≈ 2 min
  - props ≈ 1.5 min
- **Packer:** it merges into the existing manifest and refuses to write when a current or required key is missing from the cache. Packing takes about 1.5 min without previews.

## Previews (`docs/previews/`)
- `civ_all.png`: everything, labelled.
  - Both cutaways, closed and revealed.
  - All six ruins with smoke, plus rubble, `dump_pile` and the props.
  - Vehicle frames, including the loaded and the tipping truck.
- `civ_bank_cutaway.png` / `civ_police_cutaway.png`: the exploded layers, then closed, revealing, open with cityfolk people in their slots, and the overlay's last frame.
  - Bank: tellers, the banker, customers, the ATM user and two people waiting on the bench.
  - Police: officers, a visitor, and a sheepish little prankster in the cosy cell.
- `civ_fire_sequence.png`: one S plot in 8 steps.
  1. House.
  2. Fire, with the whole smoke column.
  3. Ruin with smoke and embers.
  4. Cooled down, with the insurance sign.
  5. Fence with the gate open, the excavator biting, and the truck.
  6. Rubble and the loaded truck.
  7. Construction site.
  8. New house.
- `civ_demolition_layouts.png` (new): every plot size × street side at 1x.
  - A magenta ring marks the bucket.
  - Each cell is labelled with whether the bite is visible and how much the truck covers the excavator.
- `civ_scene.png`: a town corner at 1x.
  - The bank, revealed.
  - The wanted board on the pavement with three portraits, an officer pointing at it, and the police station with `police_car` in its bay.
  - Moving day, with the assets/logistics `moving_truck` and movers carrying boxes.
  - A cold, burnt M plot being cleared from its X+ side: the mirrored excavator with a dust puff at the bite, the loaded truck behind it, and a demolition worker.
- `civ_phaser.png` / `civ_phaser_closed.png`: the live Phaser demo, with the bank revealed by hover.
- GIFs: `civ_vault.gif`, `civ_reveal.gif`, `civ_cell.gif`, `civ_excavator.gif`, `civ_dump_truck.gif`, `civ_ruin_smoke.gif`, `civ_alarm.gif`, `civ_fence_lamp.gif`.
  - The dump-truck GIF runs loaded → tip with stream and pile → empty.
  - The ruin-smoke GIF includes the town ruins.

## Critic issues
| # | severity | issue | result |
|---|---|---|---|
| 1 | high | Demolition layout: truck hides excavator, gate blocked, bucket hidden behind ruin and fence | **fixed**. `dig` re-rendered with a left swing and a 3.3 m reach. Layout version 2 has 4 sides, each with a `gateIndex`. On the front sides the bite is visible and the truck covers 0% of the excavator. civ_check enforces this. |
| 2 | high | Vehicle mirroring: anchor x far from 0.5 | **fixed**. Frames padded to ax = 0.5 (0 px off), and `conventions.flip` documents it. civ_check enforces ≤ 2 px, and the Phaser demo mirrors side X+ with setFlipX. |
| 3 | medium | Bank exterior reads as a town-hall annex | **fixed**. Sandstone, burgundy and gold palette; mansard roof with coin dormers and a gold coin on top; sign board over the columns; coin window. Layers and anchor unchanged. |
| 4 | medium | ruin_house_town too dark, mustard siding, chimney in the wrong place | **fixed**. Cream siding, warm charcoal soot, gable about a third lower, snow caps, chimney at the back, big flower box. Luminance 88 → 146; near-black pixels 26% → 2.3%. |
| 5 | medium | No town-shop ruin | **fixed**. `ruin_shop_town` (lot M) and `ruin_l_town` (lot L), plus a `ruinFor` map for every building family. |
| 6 | medium | Wanted board portraits too small, header blank | **fixed**. 2.9 m board, `posterSizePx` 24×19 → 42×35, magnifier pictogram, coin reward strip, and a `posterNote` pointing at fx_city `ui_wanted_poster`. |
| 7 | medium | Police cell reads as a black cage; desk officer overlaps the inmate | **fixed**. Powder-blue bars 1.7 m high and 0.16 m apart, with gold knobs; time-out sign; desk officer moved 0.3 m to +X. |
| 8 | medium | Bank seats stacked on the counter points | **fixed**. Bench on the front-left wall, at least 82 px from every counter and queue point (was 8 px). ATM moved to the front-right corner. civ_check enforces ≥ 30 px. |
| 9 | medium | Parked police car covers the side door; a car door point is inside the wall | **fixed**. Wider bay, `carBayPoint` [115, 58], side door clear, near car door 0.35 m from the wall. civ_check tests against the police car's `footprintPoly` and `doorPoints` and against `buildingRectM`. |
| 10 | medium | Rubble reads as a snowdrift | **fixed**. Mottled ash-grey and charcoal heap with brick-red crumbs, charred timber with wood ends and a light dusting of snow. Luminance 180 → 105–135. Footprints and anchors unchanged. |
| 11 | low | Smoke pale, beaded and speckled | **fixed**. One continuous warm-grey wisp at 64 samples, smoothed, packed RGBA (`civ_smoke`). |
| 12 | low | Embers baked into the base ruins | **fixed**. 0 ember pixels in every base ruin (was 30 / 110 / 68 / 22). Embers flicker in the `_smoke` overlay, and civ_check enforces this. |
| 13 | low | for_sale / sold signs blank | **fixed**. House with a gold price tag and a coin; the sold sign has a ribbon and a big pink heart. `boardPx` kept for optional text. |
| 14 | low | Alarm ring anim too subtle | **fixed**. Yellow-white lamp flash with a halo, bell swinging ±15°. 730–880 px change per frame (was 46–324). Pairing with fx_city `fx_alarm_flash` is documented. |
| 15 | low | Dump truck tip has no stream; loaded anims double the memory | **fixed**. Rubble stream at tip frames 2–3, `dump_pile` at `tipPoint` from `pileFrame` 3, and a cargo overlay instead of the loaded anims. Atlas 2040×1708 → 2040×1292 (13.9 → 10.0 MB GPU). The stream is not fully visible in SE; see Known issues. |

Every issue was reproduced before it was fixed:
- **Measured on the old manifest and frames:** the layout coordinates, anchors at ax 0.43675 / 0.53448, seat-to-counter distances of 8–27 px, the side door inside the car polygon, `posterSizePx` [24, 19], ember pixels in the base ruins, and luminance 88 for ruin_house_town.
- **Seen in the old previews:** the bank, the cell, the rubble, the smoke, the signs, the alarm and the tip.

Kept, as the critic asked:
- The cutaway layer split, the `drawOrder` slots, the fade and cut metadata, and `revealPoly`.
- Ruin and rubble footprints and anchors.
- The vault and cell-door anims.
- The wanted board's point geometry.
- Vehicle modelling and outlines.
- The police station's look.
- The moving props, the fence tiles and rings, and the insurance sign.
- The bank interior dressing.
- The packer's guard.

## Known issues
- **Back-side demolition:** on the `X-` / `Y+` layouts (street behind the plot) the excavator stands behind the ruin, so the ruin hides the bite (`digVisible: false`). This is inherent to the view. Use a front side when the plot allows it, or fade the ruin a little while digging.
- **Tip stream partly hidden:** in `tip_SE` the stream falls behind the truck body, and in `tip_NE` the raised tailgate hides part of it. The `dump_pile` at `tipPoint` from `pileFrame` 3 makes the drop read anyway.
- **Two town buildings are slightly deeper than their ruins:** `fire_station` (4.2 × 3.6 m) and `post_office` (3.4 × 3.2 m) are 0.2 m deeper than the lots of `ruin_l_town` / `ruin_shop_town`. Centre the ruin on the building's anchor; the scorch decal covers the gap.
- **Wider police lot:** the footprint grew from 6.4 to 7.2 m, 0.4 m on each side of the same anchor. The building did not move relative to the anchor, but it now reserves a lot 0.8 m wider. Nothing in src places it yet.
- **RGBA smoke atlas:** `civ_smoke` is 515 KB on disk and 3.5 MB of GPU memory. Load it only while something smoulders.
- **Small bank interior:** with more than about 8 people inside, heads start to overlap. Suggested cap: 3 tellers, the manager and about 4 customers.
- **Seat-height points:** the bank `seatPoints` and the police `cellSeatPoint` are at seat height, for the cityfolk `sit` pose. A standing sprite placed there needs about +25 px of y.
- **Phaser demo uses pegs:** the demo draws coloured pegs in the character slots. The previews use real cityfolk outfits.
