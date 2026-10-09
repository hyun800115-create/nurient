# title_art build report

The art for the new title screen of **행복한 눈꽃마을 이야기 / Snowbloom Village** is in `assets/title/`.
It has five parts:
- a 3D toy logo in three layouts, with a drop-in parts atlas and shine masks;
- the app icon, with Android adaptive layers;
- a parallax backdrop for day, golden dusk and night: sky gradients, stars, aurora, moon, 3D clouds, far snowy peaks, nearer pine-dotted hills, a pine-forest ridge, and a far city built from the game's own buildings, with its window lights;
- a few title FX;
- one manifest fragment, `title`.

The title code (`src/title/TitleAssets.js`, `TitleSky.js`, `TitleLogo.js`) already reads this fragment: `meta.logo.main.parts`, `meta.layout`, `meta.tints` and `meta.backdrop`. All keys and file names are the same as before the polish pass, so the title code needs no change.

The title loads **1.22 MB** (1,279,532 bytes of PNG) in the worst case: @2x pictures, Korean logo and parts, every backdrop layer and the FX. After the deploy build's WebP pass that is about **0.82 MB** (858,548 bytes). The limit is 1.5 MB.

`tools/blender/ttl_build.sh` was run **end to end** in one go on a fresh cache after the polish pass, and its own acceptance checks (`ttl_check.py`) pass. See "Checks" below.

Previews:
- `docs/previews/title_art_sheet.png`: every piece.
- `docs/previews/title_art_mock.png`: a 1080 × 2340 night mock. The backdrop is laid out exactly as `TitleSky.js` lays it out; the diorama is a placeholder.
- `docs/previews/title_art_mock_times.png`: the same mock at day, dusk and night.
- `docs/previews/title_art_band.png` (new): the backdrop exactly as `TitleSky.js` lays it out, day / dusk / night, before and at the city stage.
- `docs/previews/title_art_logo_phone.png` (new): the logos at real phone size (215 px wide on a 360-px phone) over every sky, 1:1 and 3× enlarged, next to the plain Jua glyphs.
- `docs/previews/title_art_icon.png`: the icon at 48, 96 and 192 px on light and dark home screens, the 1024 picture and the adaptive pair with its safe circle.

## What changed in the polish pass
- **Logo letters keep every jamo apart.** The letters are no longer grown outward (the bevel now rounds the edge *inside* the font's outline), the camera looks down less, and the letters are a little thinner in depth. Snow sits only on *exposed* tops: an edge with another stroke of the same letter less than 0.12 em above it gets no snow, a snow lump that would reach into the gap between two strokes is shrunk or dropped, and a drip must hang on its own stroke. The light inner rim now runs only round the outer silhouette, so the gaps between strokes and the counters (o, ㅇ) are solid navy. At 215 px wide, 꽃 shows two ㄱ, 을 shows ㅇ, ㅡ and the three bars of ㄹ, and 눈 shows ㄴ ㅜ ㄴ. `ttl_check.py` measures this.
- **The 눈꽃 emblem no longer covers a stroke.** It blooms on the snow just above 꽃's top-right corner, between 꽃 and 마; 행복한 moved up to make room. It overlaps 꽃 by 2.7 % and 마 by 0.5 % (limit 3 %). The short logo uses the same rule.
- **English logo:** the big word is now Fredoka 600 (its o, b and e counters are 42 % of the letter instead of 31 % in 700); after the 3D render and the ink they measure 35–38 %. A letter whose inward bevel throws a spike out of a sharp notch (Fredoka's n and m) is rebuilt automatically with a gentler bevel.
- **App icon recomposed:** a close, bold portrait. The chief's face fills about half the width, with a wide open smile (the game's small "o" mouth is swapped for a D-shaped smile with a tongue). A tall tower of raw salmon steaks leans up to the top-right corner, each steak tipped so its orange-and-white cut face shows, with the red 눈꽃 pennant on top. 콩이 (^^ eyes, tongue out) sits bottom-left, fully inside the iOS squircle. Behind them: a saturated ice-blue sky, only the red roof corner and log ends of the cabin, two snowy pines, a few big soft flakes. A thin navy rim like the logo's outlines the chief, the stack and the dog. The adaptive foreground is framed closer and has no grey shadow blob.
- **Backdrop:**
  - The forest and the mid hills tile without a seam (every tree is chosen once and copied one period left and right).
  - New mountains: tall, asymmetric far peaks with double summits, lit warm from a low sun on the upper left, blue in shadow, a blue-grey rock band under a ragged snowline with snow tongues down the gullies, and more haze than the nearer layer. The nearer layer is now low, round snowy hills dotted with pines.
  - The far city is rendered in Blender from the game's own buildings (town hall clock tower, brick apartments, resort hotel, school, fire station, townhouses, harbour crane, lighthouse), in two rows, with snowy roofs and aerial haze. Its window lights come from the same render's emission pass, plus a soft glow and four red aviation lights on the tallest tops. The strip carries a transparent foot so that, where `TitleSky.js` already draws it, about half the skyline clears the hills and the tree line at the city stage.
  - New aurora: three curtains side by side, each with one soft hem (no double line), rays that reach the hem, cyan to violet tops; 1024 × 416 (the empty rows are gone).
  - Dusk tints are warmer and lighter (golden hour instead of mauve), night clouds are lighter, so they read as clouds.
- **FX:** the bokeh flake is now a faint cool disc with a brighter soft rim (ADD, alpha 0.3–0.5), not a grey second moon.
- **Renaming:** the logo rows now come from `TITLE_NAME.logo.ko / .en` (`top`, `main`, `sign`), the same split the title code uses. Names of any length are handled, and a name check runs before any Blender time. Jua has no full 11,172-syllable version, so a syllable Jua cannot draw falls back to Pretendard ExtraBold, and the check names those characters.

## One config for the name
The name lives in **one** place: `TITLE_NAME` in `src/title/config.js`, the title code's config.
- `tools/blender/ttl_config.py` reads it. The logo rows come from, in this order:
  1. `TITLE_NAME.logo.ko` / `.en` = `{ top, main, sign }`. This is the split the title code's built-in text logo uses too, so the two can't disagree.
  2. `koLines` / `enLines`, if present.
  3. Otherwise the name is split on spaces: the last word goes on the sign, the word before it is the big word, and the rest goes on top. So `눈꽃마을` gives the big word only, `눈꽃마을 이야기` gives big word + sign, `아주 행복한 눈꽃마을 이야기` gives top `아주 행복한` + `눈꽃마을` + sign `이야기`, and `Happy Snowbloom Village` gives `Happy` / `Snowbloom` / `Village`.
- An empty top or sign row is simply left out (no ribbon, no sign). A space inside a top row is fine.
- `tools/blender/ttl_check_name.py` (step 0 of the build) prints the rows and the font for every character, and stops with a clear message if the big word is empty or has a space, or if a character can't be drawn by any logo font. It warns when `logo.ko` no longer spells `TITLE_NAME.ko` (a rename that forgot the split).
- In the English logo, an "o" in the second half of the big word becomes the emblem.
- If `config.js` can't be read, `DEFAULT_TITLE` in `ttl_config.py` is used.

To rename the game:
1. Edit `TITLE_NAME` (including its `logo` split).
2. Run `sh tools/blender/ttl_build.sh`. Don't pass `--resume` after a rename: it keeps the old logo renders. `--resume` is only for an interrupted build.

Only the logos depend on the name. The icon and the backdrop have no text. `meta.texts` in the manifest holds the texts the logos were built from, and `meta.textsSource` says where they came from.

## Keys (all paths `assets/title/…`, manifest = `assets/title/manifest.json`)
"@2x" textures are made for a k = 2 canvas in the 720-px logical layout. Draw them with `setScale(0.5 × wanted)`. The `_1x` twins are for k = 1 phones, and `TitleAssets.queueArt` already picks one.

### Logo
| key | size | what |
|---|---|---|
| `ttl_logo_main` | 900 × 619 | 행복한 (ribbon-red candy letters, gold sparkles) / **눈꽃마을** (ice-blue, berry-pink, coin-gold and mint toy letters, puffy snow caps with drips on the exposed tops) with the 눈꽃 emblem blooming above 꽃 / 이야기 on a snowy wooden sign. Navy ink outline (solid in the gaps between strokes) with a white outer rim and a soft drop shadow, so it reads over any sky. |
| `ttl_logo_main_1x` | 450 × 310 | the same at half size |
| `ttl_logo_main_shine` | 900 × 619 | white + alpha mask of the glossy letters (no ink): a `BitmapMask` for the shine sweep |
| `ttl_logo_parts` (atlas) | 2013 × 285 | the seven pieces at @2x: `ttl_logo_top`, `ttl_logo_main_0..3`, `ttl_logo_emblem`, `ttl_logo_sign` |
| `ttl_logo_en` / `_1x` / `_shine` | 900 × 263 | Snowbloom (Fredoka 600; the o of "bloom" is the emblem) / Village on the sign |
| `ttl_logo_short` / `_1x` / `_shine` | 640 × 733 | 눈꽃 / 마을 in a 2 × 2 block with the emblem above 꽃, for splash, loading and badges (`loadAtTitle: false`) |
| `ttl_shine_band` | 192 × 512 | soft white diagonal light band (wide glow, core and thin streak), ADD |

**Drop-in.** `meta.logo.main.parts[]` = `{frame, z, dx, dy, w, h, pivot, drop}`.
- `dx`/`dy` are @2x px from the full logo's centre to the piece's centre; `z` is the draw order.
- `pivot` is the glyph's own centre in origin units (0..1), for squash and rotate.
- `drop` is the suggested order: the letters left to right, then the emblem pops above 꽃, then 행복한, then the sign swings in. A longer or shorter big word just has more or fewer `ttl_logo_main_<i>` pieces.

Every piece was rendered **alone**, so a letter has no hole where the sign covers it. The full logo is these pieces composited in z order, so once all have landed you can swap to `ttl_logo_main` with identical pixels. `meta.logo.main.size2x` = [900, 619].

**Shine.** Mask `ttl_shine_band` with `ttl_logo_main_shine`:
- Tween the band's x from the logo's left edge to its right edge in about 0.7 s, every 4–6 s.
- Scale y to the logo height.
- Use ADD.

**Size.** `meta.layout.logoMain` suggests 430–520 logical px wide, centred about 17 % down the screen.

### Backdrop
Every strip tiles seamlessly in x (use a `TileSprite`), is anchored at its bottom edge and is painted in **day** colours. `meta.tints[day|dusk|night][key]` gives the multiply tint.

| key | size | what |
|---|---|---|
| `ttl_sky_day` / `_dusk` / `_night` | 64 × 1024 | vertical gradients (deep blue → pale; periwinkle → lavender → pink → gold; navy → blue). Stretch them to the screen. The horizon glow is at 70 % of the height (`meta.backdrop.horizon`). |
| `ttl_stars` | 720 × 900 | star field, denser at the top, with a few four-point stars |
| `ttl_aurora` | 1024 × 416 | three aurora curtains side by side, each with one soft mint hem, rays up to cyan and violet tops; ADD or SCREEN. It is periodic in x, and its brightness dips at the wrap, so an untiled image never shows a hard cut at its ends. |
| `ttl_moon` | 160 × 160 | moon with a halo |
| `ttl_clouds` | 1440 × 284 | 3D puffy metaball clouds (soft white with blue undersides) |
| `ttl_mtn_far` | 1080 × 322 | far snowy peaks: asymmetric, some with double summits, lit warm from the upper left with blue shadow flanks, a blue-grey rock band under a ragged snowline, snow down the gullies; haze baked in |
| `ttl_mtn_mid` | 1080 × 256 | nearer, low, round snowy hills dotted with the game's pines |
| `ttl_forest` | 1440 × 576 | snowy hills with the game's own pines (`prop_assets.pine`, the `tree_pine_*` sprites); the nearest strip. The bottom 30 px fade out, so the strip can sit on the sea without a ruler-straight edge. |
| `ttl_city_far` | 1080 × 408 | the far city across the bay (final city stage), rendered from the game's own buildings: town hall with its clock tower, brick apartments, resort hotel, school, fire station, townhouses, harbour crane and lighthouse, two rows deep, snowy roofs, aerial haze. The bottom 120 px are a transparent foot (`meta.backdrop.cityFootPx`) that lifts the skyline over the hills where `TitleSky.js` draws it. |
| `ttl_city_lights` | 1080 × 408 | the same render's lit windows (emission pass) with a soft glow, a faint warm glow over the roofs and four red aviation lights; ADD at dusk and night |

`meta.backdrop` also gives:
- `order`: back to front;
- `parallax`: per-strip factors;
- `suggestedBottomY`: fractions of the screen height;
- `cityFootPx` / `cityNote`: how far the city's foot is lifted, for code that wants to place the city itself.

The night tints turn the strips into moonlit blue and the dusk tints into a warm golden-hour peach; see `title_art_band.png`.

### FX (only what assets/fx and assets/ui2 lacked)
Reuse `fx_poof`, `fx_sparkle`, `fx_build_done` and the `fx_particles` frames (`fx_snowflake`, `fx_spark`, `fx_glow`, `fx_ring`).

New:
- **Atlas `ttl_fx`:**
  - `ttl_fx_snow_s` (16 px) and `ttl_fx_snow_m` (28 px): soft round flakes.
  - `ttl_fx_snow_bokeh` (64 px): out-of-focus foreground flake, a faint cool disc with a brighter soft rim. Use ADD at alpha 0.3–0.5.
  - `ttl_fx_flake_s` (32 px) and `ttl_fx_flake_m` (56 px): crisp six-arm toy flakes with an ice-blue edge.
  - `ttl_fx_twinkle` (64 px): four-point star with a glow.
  - `ttl_fx_glow` (64 px): soft round glow.
  - `ttl_fx_bloom` (48 px): a mini 눈꽃 emblem, for a rare special flake.
- **Spritesheet `ttl_fx_pop`:** 8 frames of 128 px at 30 fps, anchor [0.5, 0.6]. It is the quick pop when a building appears: a white ring with a blue rim, snow balls with blue undersides, and three gold stars. It reads on white snow. Layer `fx_poof` under it for a softer puff.

`meta.fx.snowRecipe` gives counts, scales, blend modes and speeds for a three-layer snowfall.

### App icon (not loaded by the game)
The scene, rendered in Blender from the game's own models:
- the chief (`char_build` player) close up, smiling widely, hand on his carrier strap, with a wooden 지게 on his back;
- a tall, gently leaning tower of nine raw salmon steaks (`prop_assets.steak_model`), each tipped toward the viewer so the orange cut face with its white lines shows, and the red 눈꽃 pennant on top;
- 콩이 the shiba (`pet2_build`, red scarf, ^^ eyes, tongue out) bottom-left, in front;
- behind them: a saturated ice-blue sky, the red roof corner and log ends of the cabin (`house_a`), two snowy pines, a snow bank;
- in 2D: a thin navy rim round the chief, stack and dog, two or three big soft flakes, a few crisp flakes and a light sprinkle of small ones (kept off the face).

| file | size | use |
|---|---|---|
| `icon/icon_1024.png` | 1024² opaque | App Store / Play listing / iOS (no rounded corners, iOS masks it) |
| `icon/icon_512.png`, `icon/icon_192.png` | | PWA / `manifest.webmanifest` |
| `icon/ic_launcher_foreground.png` + `ic_launcher_background.png` | 432² (108 dp @ xxxhdpi) | Android adaptive icon. The chief's face sits in the 66 dp safe circle; the top of the stack and the pennant may be cropped by a round mask. Scale down for the other densities (324 / 216 / 162 / 108 px). |
| `icon/icon_maskable_512.png` | 512² | PWA `"purpose": "maskable"` |

`meta.icon.webmanifest` holds ready-made entries for `manifest.webmanifest`. The lead should apply them; this agent does not edit that file.

At 48 px the smiling face, the orange salmon tower and 콩이's orange face all read, on a light and on a dark home screen (`title_art_icon.png`).

## How the title code uses them
`src/title/TitleAssets.js`, `TitleSky.js` and `TitleLogo.js` already load and use this fragment. The full sequence is:
1. Load `assets/title/manifest.json`.
2. Queue only what the phone needs: the logo of its language, @2x or `_1x` by render scale, everything with `loadAtTitle !== false`.
3. **Backdrop:**
   - Stretch the three sky images and cross-fade them by time of day.
   - Stars and aurora fade in at night.
   - The strips are TileSprites anchored at the bottom, tinted per `meta.tints`, with `meta.backdrop.parallax`.
   - The city strip and its lights fade in at the city stage; their transparent foot already lifts them over the hills.
4. **Logo:** drop the parts in by `drop` order using `dx` / `dy` / `pivot`, swap to the full image, then loop the shine (`*_shine` mask + `ttl_shine_band`) and `ttl_fx_twinkle` sparkles.
5. **FX:** snowfall from `ttl_fx_snow_*`, `ttl_fx_flake_*` and `ttl_fx_snow_bokeh` (ADD); `ttl_fx_pop` + `fx_poof` when a building appears.
6. **Lead to-do:**
   - Copy the `meta.icon.webmanifest` entries into `manifest.webmanifest`.
   - Set the Android adaptive icon from `icon/ic_launcher_*`.

## Font + licence
- **Jua** (BM JUA, Woowa Brothers; "The BM JUA Project Authors", SIL OFL 1.1) for all Hangul. It is rounded and chunky. Source: npm `@fontsource/jua` 5.3.0, Korean and Latin woff2 subsets merged into `tools/fonts/Jua-Regular.ttf` with fontTools.
  - Coverage: 2,367 Hangul syllables (all 2,350 of KS X 1001, plus 17).
  - There is no full 11,172-syllable Jua. I checked: all 86 numbered Google Fonts slices merged give the same 2,367, and the 2014 BM JUA TTF on npm (`@kfonts/bm-jua`) maps all 11,172 but 8,805 of those glyphs are empty.
- **Pretendard ExtraBold** (Kil Hyung-jin, SIL OFL 1.1, all 11,172 syllables), as a **fallback only**: a syllable Jua can't draw (e.g. 똠, 햏, 쌰, 큥) is built from this font, so a rename never silently loses a letter. Source: npm `pretendard` 1.3.9, copied unmodified.
- **Fredoka** 600 (the big English word) and 700 (the sign), SIL OFL 1.1, from npm `@fontsource/fredoka` 5.3.0.
- The licence texts sit next to the fonts: `tools/fonts/OFL-Jua.txt`, `OFL-Pretendard.txt` and `OFL-Fredoka.txt`. `tools/fonts/README.txt` records the sources. `tools/fonts/make_fonts.py` re-downloads and rebuilds the fonts.

Only rendered PNGs ship; no font file goes into the game. A credit line is a nice courtesy: "Jua © The BM JUA Project Authors, Fredoka © The Fredoka Project Authors — SIL OFL 1.1". Add Pretendard only if a fallback syllable ends up in the logo.

## Payload (what the title loads)
| group | what the title loads (worst case: k = 2, Korean) | PNG | after the WebP deploy pass |
|---|---|---|---|
| logo | `ttl_logo_main` 116 KB, `ttl_logo_main_shine` 55 KB, `ttl_logo_parts` 124 KB (+ json), `ttl_shine_band` 15 KB | 310 KB | same (already palette PNGs) |
| backdrop | 3 skies 4 KB, `ttl_stars` 60 KB, `ttl_aurora` 97 KB, `ttl_moon` 6 KB, `ttl_clouds` 47 KB, `ttl_mtn_far` 134 KB, `ttl_mtn_mid` 100 KB, `ttl_forest` 293 KB, `ttl_city_far` 92 KB, `ttl_city_lights` 49 KB | 882 KB | 498 KB |
| fx | `ttl_fx` 21 KB (+ json), `ttl_fx_pop` 62 KB | 85 KB | 48 KB |
| **total** | | **1.22 MB** (1,279,532 bytes; limit 1.5 MB) | **0.82 MB** (858,548 bytes) |

The English set (`ttl_logo_en` + `_shine`, 83 KB) replaces the Korean logo, main shine and parts (295 KB). `meta.payload` and `meta.load` in the manifest hold the same numbers and each key's load flag: `true` for always, `"ko"` / `"en"` for one language only, `"k1"` for a `_1x` twin, `false` for not loaded at title time.

The icons and the short logo are not loaded at title time. The English logo replaces the Korean one, so only the larger of the two is counted. The `_1x` twins replace the @2x pictures on k = 1 phones. Big RGBA pictures are palette-quantized with imagequant (dithered), so the PNGs are already small. `tools/build/webp_assets.py` shrinks the backdrop further at deploy time.

## Checks (`tools/blender/ttl_check.py`, step 5 of the build; exit 1 on a failure)
| check | what it measures | result |
|---|---|---|
| name | the logo rows parse; every character has a glyph | OK, no fallback characters |
| jamo | the main logo shrunk to 215 px wide; for each big letter, the most body runs along vertical / horizontal scan lines must be at least the plain Jua glyph's | OK: 눈 4 / 4 (font 3 / 2), 꽃 7 / 5 (font 4 / 3), 마 4 / 5 (font 2 / 3), 을 6 / 3 (font 6 / 2) |
| emblem | the emblem's render alpha over each letter piece | OK: 꽃 2.66 %, 마 0.47 %, 눈 0 %, 을 0 % (limit 3 %) |
| counters | each enclosed counter of the big English word vs its letter's width, on `ttl_logo_en_1x` | OK: o 0.38, b 0.35, o 0.38 (limit 0.30) |
| seams | for every tiled strip, the wrap column's step vs the steps inside the picture | OK: forest 4.4 (was 22.8), mtn_mid 1.4 (was 14.4), mtn_far 1.9, city 4.5, city lights 0.7, clouds 0.4, aurora 1.5 |
| payload | `meta.payload.titleLoadPngBytes` ≤ 1.5 MB | OK: 1,279,532 bytes |

The full report of a run is written to `<cache>/ttl_check.json`.

## Tools (all re-runnable; `sh tools/blender/ttl_build.sh [cache] [--resume]`)
Set `PY3` to a python with scipy and imagequant (recommended: exact round outlines and gap maps, palette PNGs). Set `BLENDER_PY` to Blender's python (bpy 5.x).
- **`ttl_check_name.py`**: step 0, the name check (rows, glyph coverage, fallback characters).
- **`ttl_config.py`**: the texts (read from `src/title/config.js`), fonts with the per-character fallback (`has_glyph`, `font_for`, `validate_title`), palette and output sizes.
- **`ttl_lib.py`**: Blender helpers:
  - glyph outlines and extruded, rounded 3D letters;
  - `GlyphMask`, the glyph rasterised with a map of the narrow gaps between its strokes;
  - metaball snow caps only on exposed tops, kept out of the gaps, with drips that hang on their own stroke;
  - beveled 2D solids, sparkles, the 눈꽃 emblem, the wooden sign and an ID label pass.
- **`ttl_logo.py`**: the logo layouts main, short and en (optional top row in every layout). `--parts` / `--parts-only` render each piece alone; `--skip-existing` resumes. A letter whose bevel throws a spike out of a sharp notch is rebuilt with a gentler bevel.
- **`ttl_backdrop3d.py`**: seamless 3D strips:
  - `mtn_far`, `mtn_mid` and `forest`: periodic heightfields with three periods built and one rendered, and every tree planted once and copied one period left and right;
  - `clouds`: metaballs;
  - `city`: the game's own buildings (`town_assets`, `harbor_assets`, `bbld_assets`) in two rows, each copied one period left and right; a colour pass and an emission-only pass.
- **`ttl_icon.py`**: the icon scene, built from the game's own `char_build`, `pet2_build`, `bld_assets` (`house_a`) and `prop_assets` (salmon steaks, pines). Passes: `full`, `mask` (subjects' alpha for the rim), `fg`, `bg`.
- **`ttl_post.py`**: 2D finishing: round ink outline from the distance transform; light rim only on the outer silhouette (gap and counter map); shadow; premultiplied resize; trim.
- **`ttl_backdrop.py`**: skies, stars, aurora, moon, the 2D fallback clouds and city, the 3D city's haze, glow and aviation lights, strip haze, and the tint table.
- **`ttl_fx.py`**: the FX atlas and the pop sheet.
- **`ttl_iconpack.py`**: navy rim, snow, colour pop, vignette, sizes, adaptive layers and the maskable icon.
- **`ttl_pack.py` + `ttl_manifest.py`**: everything into `assets/title` and the manifest, with load flags and the payload count. Records for partial re-packs go to `<cache>/ttl_records.json`.
- **`ttl_preview.py`**: the six preview images.
- **`ttl_check.py`**: the acceptance checks above.

The end-to-end run (`sh tools/blender/ttl_build.sh <fresh cache>`) took 64 minutes on the shared 4-core box at a load average of 25–30 (other agents rendering): logo pieces 10 min, short and English logos 10 min, five strips 20 min, icon 23 min, packing + previews + checks 1 min. On a quiet box it is about 25 minutes.

## Known issues / notes
- The mock's diorama is a **placeholder** (real game sprites on a white island ellipse). The real growing diorama is the title_code agent's work. The backdrop in the mock and in `title_art_band.png` follows `TitleSky.js` exactly.
- The night look of the strips relies on multiply tints. They read as moonlit blue, but the snow isn't truly lit by the moon. The city's lit windows are real (its own emission pass).
- The far mountains' snow folds radiate from the summits; up close they look a little like draped cloth. At title size they read as snowy peaks with a rock band.
- The far city's buildings light their windows by day too (as the game's sprites do). It only shows at the city stage.
- In the adaptive icon, a round launcher mask may crop the top of the salmon tower and the pennant; the face and 콩이 stay inside.
- A longer name makes the logo letters smaller, because the logo width is fixed; the name check warns from 7 letters up. Check `title_art_logo_phone.png` after a rename.
- Jua has no full Hangul set. Rare syllables fall back to Pretendard ExtraBold, which is heavier and less round than Jua; the name check lists them.

## Critic review: what happened to each issue
| # | issue (severity) | outcome | how / why |
|---|---|---|---|
| 1 | Letter strokes fuse; counters close; 꽃 / 을 read as striped blobs at 360 px (high) | **fixed** | Reproduced (the critic's crops, and the font vs piece comparison). Now: the bevel stays inside the font outline (`offset = -bevel`), camera tilt 8° → 5°, letters thinner in depth, snow only on exposed tops (`GlyphMask`: no snow under another stroke within 0.12 em, blobs shrunk or dropped near a gap, drips must hang on their own stroke), and the white rim is kept out of gaps and counters so they stay solid navy. `ttl_check.py` jamo check passes at 215 px; see `title_art_logo_phone.png`. English: Fredoka 600 for the big word, counters 35–38 % of the letter. |
| 2 | Emblem covers the right ㄱ of ㄲ, in the main and the short logo (high) | **fixed** | Reproduced. The emblem now blooms on the snow just above 꽃's top-right corner (centre 0.6 R over the glyph top, 0.1 R in from its right edge), and 행복한 moves up to make room. The same rule applies in the short logo. It covers 꽃 by 2.66 % and 마 by 0.47 %; `ttl_check.py` fails above 3 %. |
| 3 | App icon is a busy postcard: white chief on white snow, a hamburger stack, an "o" mouth, unreadable at 48 px (high) | **fixed** | Reproduced. Recomposed: close portrait, face about half the width against a saturated blue sky, a wide D-shaped smile, a tall leaning tower of raw salmon steaks with their orange cut faces tipped to the viewer and the 눈꽃 pennant on top, 콩이 bottom-left fully inside the squircle, only the cabin's roof corner, a few big soft flakes, a navy rim round the subjects. The adaptive foreground is framed closer and has no catcher shadow. At 48 px the face, the orange tower and 콩이 read on light and dark home screens. |
| 4 | Forest strip doesn't tile (cut pine at the wrap); `mtn_mid` seam too (medium) | **fixed** | Reproduced (wrap step 22.8 vs 2.5–3.5 inside; `mtn_mid` 14.4). Cause: each of a tree's three copies drew its own random height. Every tree is now chosen once. Now forest 4.4 and `mtn_mid` 1.4 against a limit of about 2× the median step. `ttl_check.py` checks every tiled strip. |
| 5 | Mountains look like sugar piles (medium) | **fixed** | Reproduced. New far range: asymmetric peaks, double summits, spurs radiating from the summits, a low warm key light from the upper left with blue shadow flanks, a blue-grey rock band under a ragged snowline with snow down the gullies, more haze than the near layer. The near layer is now low, round snowy hills dotted with pines. Remaining softness is listed under known issues. |
| 6 | Far city is a flat vector skyline; only two dark boxes show at the city stage (medium) | **fixed** | Reproduced. Rendered in Blender from the game's own buildings (town hall clock tower, brick apartments, resort hotel, school, fire station, townhouses, harbour crane, lighthouse) in two rows, with snowy roofs and haze. The lights are the render's emission pass plus glow and aviation lights. A 120-px transparent foot lifts the skyline so about half of it clears the hills where `TitleSky.js` already draws the strip (`title_art_band.png`); `meta.backdrop.cityFootPx` documents it. |
| 7 | Aurora's lower edge is a double line like a glowing tube; night clouds are dark slate; 96 empty rows (medium) | **fixed** | Reproduced. Three side-by-side curtains, each with one soft hem (a smooth rise over about 20 px, no second line), rays reaching the hem, cyan to violet tops, and a brightness dip at the wrap so an untiled image never shows a cut. Cropped to 1024 × 416. Night cloud tint #45527F → #7F8FC2. |
| 8 | Rename isn't really one config: `logo.ko/en` ignored, 2- and 4-word names break, no glyph check (medium) | **fixed** | Reproduced. The rows now come from `TITLE_NAME.logo.ko/.en`, then `koLines/enLines`, then a space split (last word = sign, previous = big word, rest = top). Tested with 1, 2, 3 and 4 words and an English top row. `ttl_check_name.py` (build step 0) stops on an empty or spaced big word or an undrawable character, and warns when `logo.ko` doesn't spell the name. Layouts handle missing rows. **Full 11,172-syllable Jua: not possible**, because no such font exists (checked: Google Fonts Jua has 2,367; the 2014 BM JUA TTF maps 11,172 but 8,805 glyphs are empty). Instead, any syllable Jua lacks falls back per character to Pretendard ExtraBold (OFL, 11,172), and the check names it. |
| 9 | Dusk tints turn snow mauve and pines muddy purple (low) | **fixed** | Reproduced. Warmer, lighter tints: `mtn_far` #FFD9C8, `mtn_mid` #F6C9C2, forest #DDB7AE, city #E8B8B4. The optional rim-light strip was not added: the new mountains already carry their own warm lit side. |
| 10 | Bokeh flake is a near-white disc, a "dirty second moon" at night (low) | **fixed** | Reproduced. Now a faint cool disc (#DDEBFF): fill alpha 58 of 255, a brighter soft rim up to 90; the manifest says ADD at alpha 0.3–0.5. |
| — | Rest of the critic's list (the text I received was cut off after issue 10) | not seen | Nothing after the bokeh item reached this agent. |
