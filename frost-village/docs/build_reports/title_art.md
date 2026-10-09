# title_art build report

The art for the new title screen of **행복한 눈꽃마을 이야기 / Snowbloom Village** is in `assets/title/`.
It has five parts:
- a 3D toy logo in three layouts, with a drop-in parts atlas and shine masks;
- the app icon, with Android adaptive layers;
- a parallax backdrop for day, golden dusk and night: sky gradients, stars, aurora, moon, 3D clouds, two snowy mountain strips, a pine-forest ridge and a far city skyline with its lights;
- a few title FX;
- one manifest fragment, `title`.

The title code (`src/title/TitleAssets.js`, `TitleSky.js`, `TitleLogo.js`) already reads this fragment, including `meta.logo.main.parts`, `meta.layout` and `meta.tints`.

The title loads **1.12 MB** (1,171,180 bytes of PNG) in the worst case: @2x pictures, Korean logo and parts, every backdrop layer and the FX. After the deploy build's WebP pass that is about **0.71 MB** (747,276 bytes). The limit is 1.5 MB.

Previews:
- `docs/previews/title_art_sheet.png`: every piece.
- `docs/previews/title_art_mock.png`: a 1080 × 2340 night mock.
- `docs/previews/title_art_mock_times.png`: the same mock at day, dusk and night.
- `docs/previews/title_art_icon.png`: the icon at 48, 96 and 192 px, with masks and the adaptive pair.

## One config for the name
The name lives in **one** place: `TITLE_NAME` in `src/title/config.js`, the title code's config.
- `tools/blender/ttl_config.py` reads it (`ko`, `koLines`, `koShort`, `en`, `enLines`) and derives the logo texts: top 행복한, main 눈꽃마을, sign 이야기, short 눈꽃마을, English Snowbloom / Village.
- In the English logo, an "o" in the second half of the word becomes the emblem.
- If the file cannot be read, `DEFAULT_TITLE` in `ttl_config.py` is used.

To rename the game:
1. Edit `TITLE_NAME`.
2. Run `sh tools/blender/ttl_build.sh`. Do not pass `--resume` after a rename: it keeps the old logo renders. `--resume` is only for an interrupted build.

Only the logos depend on the name. The icon and the backdrop have no text. `meta.texts` in the manifest carries the texts the logos were built from.

## Keys (all paths `assets/title/…`, manifest = `assets/title/manifest.json`)
"@2x" textures are made for a k = 2 canvas in the 720-px logical layout. Draw them with `setScale(0.5 × wanted)`. The `_1x` twins are for k = 1 phones, and `TitleAssets.queueArt` already picks one.

### Logo
| key | size | what |
|---|---|---|
| `ttl_logo_main` | 900 × 577 | 행복한 (red candy letters, gold sparkles) / **눈꽃마을** (ice-blue, berry-pink, coin-gold and mint toy letters with puffy snow caps and drips, the 눈꽃 emblem sitting on 꽃) / 이야기 on a snowy wooden sign. Navy ink outline with a white inner rim and a soft drop shadow, so it reads over any sky. |
| `ttl_logo_main_1x` | 450 × 288 | the same at half size |
| `ttl_logo_main_shine` | 900 × 577 | white + alpha mask of the glossy letters (no ink): use it as a `BitmapMask` for the shine sweep |
| `ttl_logo_parts` (atlas) | 2031 × 290 | the seven pieces at @2x: `ttl_logo_top`, `ttl_logo_main_0..3`, `ttl_logo_emblem`, `ttl_logo_sign` |
| `ttl_logo_en` / `_1x` / `_shine` | 900 × 263 | Snowbloom (the o of "bloom" is the emblem) / Village on the sign |
| `ttl_logo_short` / `_1x` / `_shine` | 640 × 711 | 눈꽃 / 마을 in a 2 × 2 block with the emblem, for splash, loading and badges (`loadAtTitle: false`) |
| `ttl_shine_band` | 192 × 512 | soft white diagonal light band (wide glow, core and thin streak), ADD |

**Drop-in.** `meta.logo.main.parts[]` = `{frame, z, dx, dy, w, h, pivot, drop}`.
- `dx`/`dy` are @2x px from the full logo's centre to the piece's centre; `z` is the draw order.
- `pivot` is the glyph's own centre in origin units (0..1), for squash and rotate.
- `drop` is the suggested order: the letters left to right, then the emblem pops on 꽃, then 행복한, then the sign swings in.

Every piece was rendered **alone**, so a letter has no hole where the sign covers it. The full logo is these pieces composited in z order, so once all have landed you can swap to `ttl_logo_main` with identical pixels. `meta.logo.main.size2x` = [900, 577].

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
| `ttl_aurora` | 1024 × 512 | aurora curtains (mint hem, cyan body, violet tops, vertical rays), ADD or SCREEN. Drift `tilePositionX` slowly and breathe the alpha. |
| `ttl_moon` | 160 × 160 | moon with a halo |
| `ttl_clouds` | 1440 × 284 | 3D puffy metaball clouds (soft white with blue undersides) |
| `ttl_mtn_far` | 1080 × 248 | far snowy peaks with lavender shadows and rocky gullies; haze baked in |
| `ttl_mtn_mid` | 1080 × 258 | nearer, rounder mountains with small pines on the lower slopes |
| `ttl_forest` | 1440 × 574 | snowy hills with the game's own pines (`prop_assets.pine`, the `tree_pine_*` sprites); the nearest strip. The bottom 30 px fade out, so the strip can sit on the sea without a ruler-straight edge. |
| `ttl_city_far` | 1080 × 260 | far city skyline silhouette (with a clock spire and a dome) for the final city stage |
| `ttl_city_lights` | 1080 × 260 | its window lights, a few red aviation lights and a warm city glow, ADD at dusk and night |

`meta.backdrop` also gives:
- `order`: back to front;
- `parallax`: per-strip factors;
- `suggestedBottomY`: fractions of the screen height.

The night tints turn the strips into moonlit blue and the dusk tints into rose; see `title_art_sheet.png`.

### FX (only what assets/fx and assets/ui2 lacked)
Reuse `fx_poof`, `fx_sparkle`, `fx_build_done` and the `fx_particles` frames (`fx_snowflake`, `fx_spark`, `fx_glow`, `fx_ring`).

New:
- **Atlas `ttl_fx`:**
  - `ttl_fx_snow_s` (16 px) and `ttl_fx_snow_m` (28 px): soft round flakes.
  - `ttl_fx_snow_bokeh` (64 px): out-of-focus foreground flake.
  - `ttl_fx_flake_s` (32 px) and `ttl_fx_flake_m` (56 px): crisp six-arm toy flakes with an ice-blue edge.
  - `ttl_fx_twinkle` (64 px): four-point star with a glow.
  - `ttl_fx_glow` (64 px): soft round glow.
  - `ttl_fx_bloom` (48 px): a mini 눈꽃 emblem, for a rare special flake.
- **Spritesheet `ttl_fx_pop`:** 8 frames of 128 px at 30 fps, anchor [0.5, 0.6]. It is the quick pop when a building appears: a white ring with a blue rim, snow balls with blue undersides, and three gold stars. It reads on white snow. Layer `fx_poof` under it for a softer puff.

`meta.fx.snowRecipe` gives counts, scales and speeds for a three-layer snowfall.

### App icon (not loaded by the game)
The scene, rendered in Blender:
- the chief (the game's own player model, `char_build`) waving, with a wooden 지게 A-frame on his back carrying a tower of goods: crate, logs, grilled salmon steaks, bread, a fish and a gold coin;
- a little red pennant with the 눈꽃 emblem on top;
- 콩이 the shiba sitting up and begging beside him (`pet2_build`, red scarf, tongue out);
- the red-roofed log cabin (`house_a`) with warm windows, and snowy pines;
- falling snow added in 2D.

| file | size | use |
|---|---|---|
| `icon/icon_1024.png` | 1024² opaque | App Store / Play listing / iOS (no rounded corners, iOS masks it) |
| `icon/icon_512.png`, `icon/icon_192.png` | | PWA / `manifest.webmanifest` |
| `icon/ic_launcher_foreground.png` + `ic_launcher_background.png` | 432² (108 dp @ xxxhdpi) | Android adaptive icon. The chief, stack and dog sit in the 66 dp safe circle. Scale down for the other densities (324 / 216 / 162 / 108 px). |
| `icon/icon_maskable_512.png` | 512² | PWA `"purpose": "maskable"` |

`meta.icon.webmanifest` holds ready-made entries for `manifest.webmanifest`. The lead should apply them; this agent does not edit that file.

## How the title code uses them
`src/title/TitleAssets.js`, `TitleSky.js` and `TitleLogo.js` already load and use this fragment; the `title_idle_city_night.png` preview shows it in the real title. The full sequence is:
1. Load `assets/title/manifest.json`.
2. Queue only what the phone needs: the logo of its language, @2x or `_1x` by render scale, everything with `loadAtTitle !== false`.
3. **Backdrop:**
   - Stretch the three sky images and cross-fade them by time of day.
   - Stars and aurora fade in at night.
   - The strips are TileSprites anchored at the bottom, tinted per `meta.tints`, with `meta.backdrop.parallax`.
4. **Logo:** drop the parts in by `drop` order using `dx` / `dy` / `pivot`, swap to the full image, then loop the shine (`*_shine` mask + `ttl_shine_band`) and `ttl_fx_twinkle` sparkles.
5. **FX:** snowfall from `ttl_fx_snow_*`, `ttl_fx_flake_*` and `ttl_fx_snow_bokeh`; `ttl_fx_pop` + `fx_poof` when a building appears.
6. **Lead to-do:**
   - Copy the `meta.icon.webmanifest` entries into `manifest.webmanifest`.
   - Set the Android adaptive icon from `icon/ic_launcher_*`.

## Font + licence
- **Jua** (BM JUA, Woowa Brothers; "The BM JUA Project Authors", SIL OFL 1.1) for all Hangul. It is rounded and chunky. Source: npm `@fontsource/jua` 5.3.0, Korean and Latin woff2 subsets merged into `tools/fonts/Jua-Regular.ttf` with fontTools. All 2,515 KS X 1001 syllables are covered.
- **Fredoka** 700 / 600 (SIL OFL 1.1) for the English logo, from npm `@fontsource/fredoka` 5.3.0.
- The licence texts sit next to the fonts: `tools/fonts/OFL-Jua.txt` and `tools/fonts/OFL-Fredoka.txt`. `tools/fonts/README.txt` records the sources. `tools/fonts/make_fonts.py` re-downloads and rebuilds the fonts.

Only rendered PNGs ship; no font file goes into the game. A credit line is a nice courtesy: "Jua © The BM JUA Project Authors, Fredoka © The Fredoka Project Authors — SIL OFL 1.1".

## Payload (what the title loads)
| group | what the title loads (worst case: k = 2, Korean) | PNG | after the WebP deploy pass |
|---|---|---|---|
| logo | `ttl_logo_main` 107 KB, `ttl_logo_main_shine` 39 KB, `ttl_logo_parts` 124 KB (+ json), `ttl_shine_band` 15 KB | 0.28 MB | same (already palette PNGs) |
| backdrop | 3 skies 4 KB, `ttl_stars` 58 KB, `ttl_aurora` 101 KB, `ttl_moon` 6 KB, `ttl_clouds` 46 KB, `ttl_mtn_far` 117 KB, `ttl_mtn_mid` 108 KB, `ttl_forest` 289 KB, `ttl_city_far` 3 KB, `ttl_city_lights` 44 KB | 0.76 MB | 0.39 MB |
| fx | `ttl_fx` 23 KB (+ json), `ttl_fx_pop` 60 KB | 0.08 MB | 0.05 MB |
| **total** | | **1.12 MB** (limit 1.5 MB) | **0.71 MB** |

The English set (`ttl_logo_en` + `_shine`, 80 KB) replaces the Korean logo, main shine and parts (270 KB). `meta.payload` and `meta.load` in the manifest hold the same numbers and each key's load flag: `true` for always, `"ko"` / `"en"` for one language only, `"k1"` for a `_1x` twin, `false` for not loaded at title time.

The icons and the short logo are not loaded at title time. The English logo replaces the Korean one, so only the larger of the two is counted. The `_1x` twins replace the @2x pictures on k = 1 phones. Big RGBA pictures are palette-quantized with imagequant (dithered), so the PNGs are already small. `tools/build/webp_assets.py` shrinks the backdrop further at deploy time.

## Tools (all re-runnable; `sh tools/blender/ttl_build.sh [cache] [--resume]`)
- **`ttl_config.py`**: the texts (read from `src/title/config.js`), fonts, palette and output sizes.
- **`ttl_lib.py`**: Blender helpers:
  - glyph outlines and extruded, rounded 3D letters;
  - metaball snow caps that skip the inside of counters, with cartoon drips;
  - beveled 2D solids, sparkles, the 눈꽃 emblem, the wooden sign and an ID label pass.
- **`ttl_logo.py`**: the logo layouts main, short and en. `--parts` / `--parts-only` render each piece alone; `--skip-existing` resumes.
- **`ttl_backdrop3d.py`**: seamless 3D strips:
  - `mtn_far`, `mtn_mid` and `forest`: periodic heightfields with three periods built and one rendered, so shadows and occlusion are right at the seams;
  - `clouds`: metaballs.
- **`ttl_icon.py`**: the icon scene, built from the game's own `char_build`, `pet2_build`, `bld_assets` (`house_a`) and `prop_assets` (items, pines). Passes: `full`, `fg`, `bg`. The `fg` pass uses a shadow catcher, so the foreground keeps its snow shadows.
- **`ttl_post.py`**: 2D finishing: round ink outline from the distance transform, rim, shadow, premultiplied resize and trim.
- **`ttl_backdrop.py`**: skies, stars, aurora, moon, the 2D fallback clouds, the city silhouette and lights, strip haze, and the tint table.
- **`ttl_fx.py`**: the FX atlas and the pop sheet.
- **`ttl_iconpack.py`**: falling snow, colour pop, vignette, sizes, adaptive layers and maskable icon.
- **`ttl_pack.py` + `ttl_manifest.py`**: everything into `assets/title` and the manifest, with load flags and the payload count. Records for partial re-packs go to `<cache>/ttl_records.json`.
- **`ttl_preview.py`**: the four preview images.

Each step was run with exactly the arguments in `ttl_build.sh`. The script itself was not run end to end in one go, because the box was shared and the steps were run as they were finished. Render time on the shared 4-core box (load 10–14): logo pieces about 6.5 min, short and English logos about 4 min, four strips about 5 min, icon about 20 min. Packing and previews take under 1 min.

## Known issues / notes
- The mock's diorama is a **placeholder** (real game sprites on a white island ellipse). The real growing diorama is the title_code agent's work.
- The night look of the strips relies on multiply tints. They read as moonlit blue, but the snow is not truly lit by the moon. If night needs more magic, the title can add `ttl_fx_glow` pools or the aurora reflected on the snow.
- `ttl_city_far` sits behind `ttl_mtn_mid` at the suggested heights, so only the tops of the towers show. That is intended (a city "far away"). For the final city stage the title can raise the city strip or drop `ttl_mtn_mid` a little.
- The English logo is wide (3.4 : 1). On the portrait title it should be 460–560 logical px wide (`meta.layout.logoEn`).
- At 48 px the icon reads as "a smiling chief + orange dog + cabin". The goods tower is the main silhouette from 96 px up.
- The logo letters keep the font's shapes. If the name changes to longer words, the main word row grows wider. `LOGO_W2X` fixes the output width, so the letters become smaller; check the preview after a rename.
