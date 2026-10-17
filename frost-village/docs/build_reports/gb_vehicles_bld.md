# gb_vehicles_bld build report (금방 van, hub layers, props, items)

Job `gb_vehicles_bld` of docs/CONTRACT_GEUMBANG.md section AO is finished. `assets/geumbang/` holds the 금방 delivery
van (8 headings: 2 rendered + mirrors, 4 corner frames, door and unload patches), the 금방 roof signs, the logistics-centre
layers (금방 and 서리 nameplates, a swaying 금방 banner), 4 props, 6 items and the sled pennant, in **2 atlases**:

| Page | Size | Decoded | Budget |
|---|---|---|---|
| `gb_van_0` | 2032 x 916 | 7.10 MiB | ≤ 2048 x 1024, ≤ 8 MiB |
| `gb_bld_0` | 980 x 660 | 2.47 MiB | ≤ 1024 x 1024, ≤ 2.5 MiB |
| total | | **9.57 MiB** | ≤ 10.5 MiB |

The files are 5 sources and 3 shipped, matching the AS budget of 5 / 3:
- the 5 sources are 2 palette-quantized PNG pages, 2 atlas JSON files and `manifest.json`, **357,546 bytes
  (0.34 MiB)** in all;
- the 3 shipped files are the 2 pages and the manifest, because the atlas JSON is embedded at build time.

`gb_check.py` reports **0 errors and 0 warnings**.

`tools/test/geumbang_phaser.mjs` loads the set in headless Phaser 3.90 next to `assets/logistics` and
`assets/vehicles`, on a 390 x 844 phone at DPR 3 and a 360 x 640 phone at DPR 2. It reports `geumbang_phaser: OK`:
- all 104 frames found and 20 anims registered;
- no page errors and no 404s;
- the loop van showed all 8 headings;
- at zoom 0.6, the van mark measures 14.7 CSS px (needs ≥ 12) and the roof sign 31.2 CSS px (needs ≥ 30).

The brand is original. The mark is a little parcel with a face and a sparkle (금방이), and it is its own mirror image
(0 % px difference), so a flipped van is still on-brand. No sprite has its two largest colour areas within ΔE2000 15
of a real courier's colour pair (UPS, DHL, Coupang, Baemin, Kurly, Korea Post, Yamato, IKEA-like). The closest is
ΔE 21.2. There is no rocket, no "fast" lettering and no red/blue scheme.

The house style matches `assets/logistics` and `assets/vehicles`:
- the `bl_common` camera and light, PPU 64, 2:1 iso;
- toy materials with snow on the roof;
- the 1 px ink outline on vehicles.

The van is built by `lgx_vehicles.py`'s own `b_van` with a livery override. The logistics centre is
`lgx_center.build()` imported unchanged. Props and items go through `bld_render.render_build()` unchanged. None of
those files was modified.

## Brand

| Token | Hex | Used for |
|---|---|---|
| gold | `#F2B33D` | van body, the mark disc, roof-sign rim, banner, flag, locker cabinet, parcel tape |
| goldDark | `#D9962A` | trims, rods, shadows of gold |
| cream | `#F4EDE0` | roof band, sign faces, the mark's border / parcel / sparkle |
| charcoal | `#3B3F52` | tyres, bumpers, hardware |
| navy | `#2B4F7E` | belt line, letters, mark face (≤ 15 % of any sprite; max 12.9 %) |

The **mark**, 금방이, is built by `gb_lib.mark`. It follows variant A of the 2D study in
`docs/previews/gb_mark_thumbs.png`, the contract default. It is a gold disc with a goldDark rim and a cream sticker
border. Inside is a face-on cream parcel with navy dot eyes, pink cheeks and an "o" mouth, with a cream four-point
sparkle above it.

**Letters** appear only on these keys:
- `gb_roofsign_*`;
- `gb_nameplate_*` and `seori_nameplate_*`;
- `gb_banner_ko`.

`gb_banner_en` carries a column of sparkles instead. No mirrored sprite (`gb_van`, `gb_van_turn`, `gb_pennant`) has
any letters.

## Keys

### `gb_van` (character, kind `vehicle`, family `delivery_van`, variant `gb`, rig `delivery_van_red`)
- **The red van's rig, exactly.** Every field and point equals the red van's (0 px delta, re-measured on the gold
  render):
  - frame 284 x 252, anchor [0.50352, 0.75];
  - dirs SE / NE, with SW ← SE and NW ← NE by flipX;
  - `seats`, `seatsStand`, `seatDrawOrder`, `doorPoints`, `rearDoorPoint`, `cargoPoint`, `lightPoints`, `tailPoints`,
    `exhaustPoint`, `footprintPoly`, `shadow`, `wheels`, `topPx`.

  Any code that can drive `delivery_van_red` can drive `gb_van` by swapping the key.
- **Look.** A honey-gold body with a navy belt line, a cream roof band under snow, and the 금방이 mark (R 0.5 m) on
  both flanks. There are no letters on the body: the word 금방 rides on the roof sign.
- **Anims.** Frame names are `{anim}_{dir}_{i}`; overlays are `over_{anim}_{dir}_{i}`. As with the red van, there is
  no baked shadow: draw `shadow[dir]`.

  | Anim | Frames | fps | Repeat | Notes |
  |---|---|---|---|---|
  | `idle` | 2 | 6 | loop | |
  | `move` | 4 | 10 | loop | the red van's `bobPx` |
  | `door` | 3 | 10 | once | **patch** over `idle_<dir>_0` |
  | `unload` | 4 | 8 | once | **patch** over `idle_<dir>_0` |

  - **`door`:** the driver door swings open. Hide the seated driver while it plays; he steps out at `doorPoints[0]`.
    Play it backward to close.
  - **`unload`:** the rear doors open. The last frame shows 3 parcels at `parcelPoints`.
- **New points (per dir, px from the anchor; negate dx when mirrored):**
  - `roofSignPoint` SE [16, -123], NE [16, -139];
  - `parcelPoints[3]`: the parcels on the cargo floor by the rear doors;
  - `parcelGround[3]`: the ground under each of those parcels, where the courier's hand-off lands.
- **Turn frames, `gb_van_turn`** (S / E / N, W ← E):
  - frame 296 x 256, anchor [0.50676, 0.75], own `shadow`;
  - the same seat, light, tail, door, cargo, exhaust and roof-sign points as the red van's turn frames, plus
    `headingDeg`.

  Use them for about 0.3 s at each road corner, as in `assets/logistics`.

### Roof signs: `gb_roofsign_{ko|en}_{0|1}` (in `gb_van_0`)
- A 96 x 56 camera-facing A-board on a charcoal roof bar, anchor [0.5, 1]: a cream face with a gold rim, the mark,
  and navy "금방" or "GEUMBANG".
- `_1` is the lit night face (emissive).
- Draw it at `roofSignPoint[dir]` + the current `bobPx`, at depth van + 0.02. **Never flip it**; only negate the x
  offset in SW / NW.
- Use it for both `gb_van` and `gb_van_turn` (whose `roofSignPoint` is per turn dir).

### Hub layers (in `gb_bld_0`)
All hub layers share `logistics_center`'s frameSize [1152, 864] and anchor [0.41493, 0.58912], so they land on the
building pixel-exactly.

| Key | Kind | depthOffset | What |
|---|---|---|---|
| `gb_nameplate_ko` | layer, replaces `nameplate_ko` | 0.0005 | mark + big **금방** + small **물류센터**, raised navy letters (Jua), the mark in relief |
| `gb_nameplate_en` | layer, replaces `nameplate_en` | 0.0005 | mark + **GEUMBANG** over **CENTRE** (Fredoka Bold) |
| `seori_nameplate_ko` | layer, replaces `nameplate_ko` | 0.0005 | **서리 물류창고**, the depot's name before 금방 opens (same fit rule as the shipped 솔방울 plate) |
| `seori_nameplate_en` | layer, replaces `nameplate_en` | 0.0005 | **Frost Depot** |
| `gb_banner_ko` / `_en` | patch, anim `sway` (4 f, 5 fps, loop) | 0.0012 | a 0.7 x 1.8 m printed cloth on a gold rod |

- **Nameplates.** Draw one of them **instead of** `logistics_center_nameplate_<lang>`, with alpha = shell alpha. They
  are rendered with the shell as holdout, so the letters are lit like the shell. Every letter pixel sits inside the
  name board (0 px outside).
- **Banner.** It hangs on the front wall left of dock 1 (x 3.9–4.6 m, z 2.1–3.9 m), with its own soft shadow on the
  wall. It overlaps 0 opaque px of dock 1, the dock lamps, the loading sign and the name board. The ko banner reads
  금방 vertically under the mark; the en banner has sparkles instead of letters.

### Props (in `gb_bld_0`; baked village shadow, cropped to the contract maxima)

| Key | Frame | States / anims | Points |
|---|---|---|---|
| `gb_sign` | 128 x 287 | `day` `gb_sign_0`, `lit` `gb_sign_1` (**litPatch**) | footprint r 0.3 m, 3.2 m tall |
| `gb_flag` | 128 x 224 | `wave` 6 f, 8 fps, loop | footprint r 0.3 m, 2.4 m tall |
| `gb_locker_a` (faces SW) | 208 x 224 | `day` / `lit` (litPatch); `open` 4 f, 12 fps, once, patch over `_0` | `slotPoints` 12, `openSlot` 7, `openPoint`, `standPoint` / `standDir`, `fillPoint` / `fillDir` |
| `gb_locker_b` (faces SE) | 208 x 224 | as `gb_locker_a` | as `gb_locker_a` |

- **`gb_sign`** is a 1 m 금방이 disc on a charcoal pole with a snowy foot, facing the camera. It shows the mark only,
  with no letters, so it is language-neutral. At night (`_1`) the disc face glows.
- **`gb_flag`** is a 1.0 x 0.65 m gold flag printed with the mark and two cream sparkles, on a 2.4 m pole with a gold
  ball finial.
- **The lockers (금방 보관함)** are a 1.8 x 0.6 x 2 m gold cabinet on a charcoal plinth:
  - 12 navy doors (4 rows x 3) on a gold grid, with cream knobs;
  - a cream header with the glowing 금방이 screen and gold dots;
  - a snow cap.

  `_1` lights the screen and dots. `slotPoints` are the door centres (index = row x 3 + col, row 0 at the top).
  `standPoint` is where a resident opens a door; `fillPoint` is where the courier fills it. Play `open` backward to
  close.

**litPatch** means the lit frame is a patch: at night, draw it over the day frame at the same position.

### Items (72 x 72, anchor (36, 54), with `stackStep` / `carryScale` / `topPx` / `sizeClass` / `boxOf` from `cardboard_box_*`)
- **`gb_parcel_s` / `_m` / `_l`:** kraft boxes with a gold tape cross and the 금방이 sticker.
- **`gb_parcel_doorstep`:** a parcel waiting on a doormat, with states `fresh` (just delivered) and `snowy` (after 4
  game hours outside: a snow cap on the box and the mat edge).
- **`gb_parcel_open`:** flaps folded out, empty inside.
- **`gb_parcel_cat`** (optional): 나비 (`pet_cat`) peeking out of an opened 금방 parcel ("고양이는 상자가 더 좋대요").
  Anim `blink`, 2 f, `repeatDelay` 1600.

All items work as icons too.

### `gb_pennant` (overlay on `dog_sled`)
- **Frames:** 48 x 56, anchor = the stick foot; SE / NE (SW / NW by flipX); `flutter` 4 f at 10 fps.
- **Placement:** `geumbang.sledPennant[dir][anim][frame]` gives the px offset for every `dog_sled` idle and move frame,
  including its bob.
- **Look:** a gold triangle with a goldDark hem and the mark at the hoist; no letters. Draw it right after the sled
  and its overlay.

## How the game uses it (summary)
1. **Loading.** Load `assets/geumbang/manifest.json` (fragment `geumbang`) and its two atlases. The conventions block
   in the manifest restates each rule below.
2. **Driving.** Drive `gb_van` exactly like `delivery_van_red`:
   - SE / NE frames, flipX for SW / NW;
   - the `over_*` overlay above seated riders;
   - `shadow[dir]`;
   - `gb_van_turn` at corners.
3. **Roof sign.** Add the roof sign as a child sprite at `roofSignPoint` (+ `bobPx`). Swap `_0` → `_1` at night and add
   the usual ADD glow there.
4. **Patches.** For `door` / `unload`:
   - stop the body on `idle_<dir>_0`;
   - draw `door_<dir>_i` / `unload_<dir>_i` on top at the same x / y, with `anims.<anim>.anchor` and `frameSize`;
   - play backward to close.
5. **Hub.** Pick one nameplate key (금방 or 서리, per language) in place of the baked one. Optionally add `gb_banner_<lang>`
   as a patch.
6. **Night.** Night is the game's MULTIPLY tint plus ADD glows at:
   - `lightPoints`;
   - `roofSignPoint`;
   - the sign disc and the locker screens.

   Lit frames are drawn under the tint.

## Pipeline and rebuild
All tools are new, under the job's own paths. Run each under `nice -n 10`, one Blender at a time.
```
cd frost-village
/tmp/bvenv/bin/python tools/blender/gb_render.py -- all      # or van|turn|roofsign|hub|builds|pennant; --force --only k,k --cache DIR (GB_CACHE)
python3 tools/blender/gb_pack.py [--cache DIR]               # -> assets/geumbang/{gb_van_0,gb_bld_0}.{png,json}, manifest.json
python3 tools/blender/gb_check.py [--json OUT]               # contract + brand check, exit 1 on any error
python3 tools/blender/gb_preview.py                          # docs/previews/gb_*.png / .gif
python3 tools/blender/gb_mark_thumbs.py                      # docs/previews/gb_mark_thumbs.png (2D mark study)
node tools/test/geumbang_phaser.mjs                          # GB_OUT=<dir> for shots + geumbang_phaser.json
```

| File | Role |
|---|---|
| `gb_lib.py` | brand palette; the 3D mark; text meshes (Jua / Fredoka); the parcel builder (closed / open / doorstep snow); cloth grids with printed textures |
| `gb_van.py` | livery override of `lgx_vehicles.b_van`: band / emblem monkeypatched during the call; exact boolean split of the baked shell for the hinged door leaves; cargo parcels; extra points |
| `gb_render.py` | dispatcher and van renders on a canvas grown by 56 px. idle, move and the patches share one sampling grid, so a patch lands on `idle_0` without seams. Turn frames on their own frame. Seat masks. |
| `gb_signs.py` | roof signs and pennant |
| `gb_tex.py` | banner / flag / pennant textures |
| `gb_hub.py` | nameplates and banner on the centre's own frame, via `lgx_render` passes and border renders; a small wall shadow catcher |
| `gb_assets.py` | props / items registry for `bld_render` |
| `gb_pack.py` | crop back to the red van frame; `patch_pixels` keeps only changed pixels plus a 1 px opaque collar; lit frames become patches; ink outline; prop shadow post; quantize; manifest |
| `gb_check.py` | contract and brand checks |
| `gb_preview.py` | previews |

Packing is deterministic.

## Check results (`gb_check.py`: 0 errors, 0 warnings)
- **Frames and anims:** every frame named by a key, anim, dir, overlay or patch exists.
- **Rig delta:** 0.0 px on every point field of every dir.
- **Van patches:**
  - pixels changed outside the patch ≤ 0.012 % (limit 0.5 %);
  - 0 px the patch would have to erase;
  - no patch touches the canvas edge.
- **Mark:** the mirror difference is 0 % at 96 px and at 24 px.
- **Phone readability at zoom 0.6, 390 CSS:** van mark 14.7 CSS px (≥ 12); roof sign 31.2 CSS px (≥ 30).
- **Navy share:** at most 12.9 % of opaque px (limit 15 %). Baked shadows and charcoal hardware are not counted as
  navy.
- **Brand distance:** the minimum ΔE2000 to any real-brand pair is 21.2 (limit 15).
- **Letters:** none outside the listed keys, none on mirrored sprites.
- **Hub:** nameplate px outside the board: 0; banner overlap with dock 1 / lamps / load sign / name board: 0 px.
- **Keys:** no key collides with another fragment.

## Previews (`docs/previews/`)

| File | What |
|---|---|
| `gb_mark_thumbs.png` | 2D mark study: variants A (default) / B (tape strip) / C (rosy cheeks) at 96 and 24 px on light, snow and dark grounds |
| `gb_all.png` | the whole set on snow |
| `gb_van_8dirs.png` | 8 headings + S / E / N / W corner frames, each with its roof sign |
| `gb_van_compare.png` | the red reference van next to the gold van on a 390-CSS phone width: zoom 1.0 (SE) and zoom 0.6 (SE / NE / SW mirror with the en sign), with the measured mark and sign sizes |
| `gb_van_move.gif` | move SE / NE / SW / NW |
| `gb_van_door.gif` | the door patch over `idle_<dir>_0`, SE / NE / SW / NW, opening and closing |
| `gb_van_unload.gif` | the unload patch, SE / NE / SW / NW, with `parcelPoints` circled on the last frame |
| `gb_hub.png` | the centre four ways: 금방 ko (nameplate, banner, a van at dock 1, sign / flag / locker); 금방 en (mark-only banner); 서리 물류창고 (before 금방 opens); Frost Depot |
| `gb_banner.gif` | banner sway |
| `gb_props.png` / `gb_props.gif` | sign, flag wave (6 f), lockers a (SW) / b (SE) with the open patches, the sign lit patch |
| `gb_items.png` | every `gb_parcel_*` at 2x, with `cardboard_box_s/m/l` at 1x for scale |
| `gb_sled.png` / `gb_sled.gif` | the dog sled with the pennant at `sledPennant` |
| `gb_night.png` | the night tint with lit roof sign, sign and lockers |
| `gb_phaser_390_day_night.png` | Phaser phone shots, 390 x 844 DPR 3: zoom 0.6 / 1.0 / 1.2 / 1.6, day and night. The contact sheet is at 0.4x; the full-resolution shots go to `$GB_OUT`. |
| `gb_phaser_360.png` | Phaser phone shot, 360 x 640 DPR 2, zoom 1.0 |

## Phaser test (`tools/test/geumbang_phaser.mjs`)
The test builds one scene the documented way, with no game code:
- **The centre:**
  - `gb_nameplate_ko` in place of the baked plate;
  - `gb_banner_ko` swaying;
  - dock 1 rolling up;
  - a `gb_van` backed into bay 1 and looping the unload patch.
- **The street:**
  - the red van and a town car for scale;
  - a `gb_van` at a kerb looping the door patch (NE);
  - a mirrored SW van on cobble.
- **The loop van:** it drives through SE / NE / NW / SW legs with the S / E / N / W corner frames, and the roof sign
  rides `roofSignPoint` + `bobPx`.
- **Props and items:** sign, flag, both lockers (open patch cycling), every item.
- **The dog sled:** it carries the pennant at `sledPennant` and crosses dirt and then snow.
- **Ground:** the scene covers snow, cobble and dirt.
- **Night:** the DayClock MULTIPLY tint (0x5a6aa8 @ 0.45), ADD glows, lit roof signs and the lit patches.

Shots are taken at 390 x 844 DPR 3 (zoom 0.6 / 1.0 / 1.2 / 1.6, day and night) and at 360 x 640 DPR 2 (zoom 1.0).

## Self-critique / known issues
- **Lit frames are lit in daylight.** The roof sign `_1` and the lit patches of the sign and lockers are rendered in
  daylight with emissive faces, then tinted by the game's night MULTIPLY. They read as glowing at night, especially
  with the ADD glow, but they are not true night renders.
- **The locker `open` patch is lit only in daylight.** At night the open door has no interior glow of its own.
- **The en roof sign is small.** "GEUMBANG" is 8 letters on a 96 px board. It reads from zoom 1.0 up; at 0.6 the
  gold board and the mark carry it. The ko sign (2 big syllables) reads at 0.6.
- **The pennant is small (48 x 56).** At zoom 0.6 it is a gold flicker on the sled; the mark reads from 1.0 up.
- **The NE unload patch is large.** The rear doors swing wide, so the patch is up to 302 x 144 px. It costs atlas area
  but keeps the doors honest.
- **`gb_bld_0` has little headroom.** It sits at 2.47 MiB of 2.5. Making the lit frames into patches is what got it
  under. Adding more hub art needs a third page.
- **The turn frames are single frames.** The wheels do not spin during the 0.3 s corner, the same as the red van's
  turn frames.
- **Paths differ from AS.** AS names `tools/<job>/<job>_check.py` and `tools/test/gb_<job>_phaser.mjs`. Under this job's
  path assignment they are `tools/blender/gb_check.py` and `tools/test/geumbang_phaser.mjs`.
- **No critique yet.** The critique AS asks for is a separate job and has not run.
