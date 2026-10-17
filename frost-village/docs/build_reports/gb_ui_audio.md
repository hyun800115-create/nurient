# Build report: gb_ui_audio (CONTRACT_GEUMBANG §AQ `assets/ui6/` + §AR `assets/audio8/`)

This job delivers the 금방 마켓 UI kit and the 금방 sounds. 금방 is an original brand: a gold-and-cream delivery service
that takes the village's surplus stock from the logistics centre to residents' front doors. It does not imitate any
real company. Both sets are done.

| Check | Result |
|---|---|
| `python3 tools/fx/gen_ui6.py --check` | **0 errors, 0 warnings** (55 frames, 916 × 710 page = 2.481 MiB) |
| `python3 tools/audio/check_audio8.py` | **RESULT: OK (0 errors, 0 warnings)**, 11 slices, Chromium decode at 44.1 and 48 kHz |
| `node tools/test/ui6_phaser.mjs` (Phaser 3.90, headless Chromium) | **OK - 0 problems**: 0 key clashes across 51 fragments, 55 frames, 4 anims, 10 NineSlices, 11 audio slices |

Nothing outside the job's own paths was changed: no other assets, no `src/**`, no `index.html`, no other jobs' tools.
Nothing was committed to git.

## 1. Delivered files

| Path | Size | What |
|---|---|---|
| `frost-village/assets/ui6/ui6_gb.png` | 366,111 B | one RGBA atlas page, 916 × 710 (2.481 MiB in memory) |
| `frost-village/assets/ui6/ui6_gb.json` | 9,439 B | Phaser JSON-hash atlas (55 frames) |
| `frost-village/assets/ui6/manifest.json` | 27,279 B | `ui6` fragment: sprites, anims, `nineSlice`, brand, `pagePlan`, `appLayout`, `codeFallback` |
| `frost-village/assets/audio8/audio8_sprite.mp3` | 82,442 B | one mono 96 kbps sprite, 6.80 s, 11 slices, 50 ms gaps |
| `frost-village/assets/audio8/manifest.json` | 6,329 B | `audio8` fragment: `audioSprite`, per-key volume/cues/standIn, `audioGroups` |

These tools built them. They are new files, and every other tool was only read:

- `frost-village/tools/fx/gen_ui6.py`
- `frost-village/tools/audio/sfx8.py`
- `frost-village/tools/audio/build_audio8.py`
- `frost-village/tools/audio/check_audio8.py`
- `frost-village/tools/test/ui6_phaser.mjs`

**Budgets (§AS):**

| Set | Files (source / shipped) | Size limit | Delivered |
|---|---|---|---|
| AQ | 3 / 2 | ≤ 2.5 MiB, atlas ≤ 1024² | 3 / 2, 2.481 MiB, 916 × 710 |
| AR | 2 / 2 | — | 2 / 2, 88.8 KB in total |

## 2. §AQ `ui6`: the 금방 UI kit (55 frames, 45 sprite keys)

**Style.** Everything is drawn procedurally with signed-distance fields in the house "soft toy" style of ui to ui5.
That means a dark tinted outline, a top-to-bottom gradient with a rounded bevel lit from the upper left, a gloss and one
soft navy drop shadow. The colours are the brand palette:

| Name | Colour |
|---|---|
| gold | #F2B33D |
| goldDark | #D9962A |
| cream | #F4EDE0 |
| charcoal | #3B3F52 |
| navy | #2B4F7E |

**The mark 금방이.** A gold disc with a goldDark rim holds a face-on cream parcel. The parcel has navy dot eyes, pink
cheeks, an "o" mouth and a cream four-point sparkle. It matches the mark on the vans and buildings in
`assets/geumbang`, and it still reads at 24 px. It has none of the banned motifs (rocket, wings, bird, arrow-smile,
lightning, cat).

**Icons** (14, each 96 × 96, no text). The thinnest icon at 32 px is still 0.30 solid. Every icon has a code fallback
in `replaces`.

| Key | Use in the game | Fallback |
|---|---|---|
| `ui_icon_gb` | the mark: HUD chip, office stock row, letters | ui5 `ui_icon_depot` |
| `ui_icon_gb_order` | order slip with a check seal | ui4 `ui_icon_box` |
| `ui_icon_gb_van` | gold van with the mark | ui3 `ui_icon_delivery` |
| `ui_icon_gb_sled` | husky sled with a parcel | ui5 `ui_icon_sleigh` |
| `ui_icon_gb_locker` | gold locker, blue doors | ui4 `ui_icon_box` |
| `ui_icon_gb_deal` | price tag with a star | `ui_icon_coin` |
| `ui_icon_gb_review` | speech bubble, star and heart | ui3 `ui_icon_fame` |
| `ui_icon_gb_today` | calendar with a sun | ui3 `ui_icon_day` |
| `ui_icon_gb_catalog` | 2 × 2 product grid | ui5 `ui_icon_inventory` |
| `ui_icon_gb_crew` | courier in a navy cap | ui5 `ui_icon_staff` |
| `ui_icon_gb_dawn` | moon and sunrise over snowy hills | ui3 `ui_icon_night` |
| `ui_icon_gb_doorstep` | blue door with a parcel | ui4 `ui_icon_box` |
| `ui_icon_gb_cart` | cart carrying a 금방 parcel | ui4 `ui_icon_box` |
| `ui_icon_gb_follow` | gold viewfinder around a parcel | ui5 `ui_icon_binoculars` |

**Tracker.**

| Keys | Size | What |
|---|---|---|
| `ui_gb_step_{order,pick,pack,go,done}_{on,off}` | 64² | slip, basket, box, van with the mark, house with a check |
| `ui_gb_dot_{off,on,now}` | 28² | step dots |
| `ui_gb_line_{off,on}` | 32 × 8, untrimmed | connecting lines |
| `ui_gb_star_{full,empty}` | 32² | rating stars |

The game writes the step words. Suggested words are 주문 / 고르기 / 포장 / 배달 중 / 도착, or in English Ordered / Picking
/ Packing / On the way / Arrived.

**Logos.** These are the only frames with baked-in text (`bakedText` is exactly these two keys):

| Key | Size | Text |
|---|---|---|
| `ui_gb_logo_ko` | 192 × 72 | mark + "금방" in Jua |
| `ui_gb_logo_en` | 250 × 72 | mark + "Geumbang" in Fredoka Bold |
| `ui_gb_mark` | 128² | the mark alone |

For both logos, the mark's centre is at (36, 36) and its radius is 30.5.

**Mascot 금방이.** A running parcel wearing a navy chin scarf. Frames are 128², anchor [0.5, 0.9]. Animations:

| Animation | Frames | Speed | Repeat |
|---|---|---|---|
| `idle` | 2 | 3 fps | loops |
| `run` | 4 | 8 fps | loops (leans 8° forward, snow puffs) |
| `bow` | 2 | 3 fps | once (face-on bow, happy eyes) |

**9-slices.** All are untrimmed and listed under `nineSlice` with margins and `contentInset`:

| Key | Size | Margins (l / t / r / b) | Notes |
|---|---|---|---|
| `ui_gb_phone` | 360 × 640 | 56 / 64 / 56 / 64 | `screenRect` [21, 30, 318, 580], `screenRadius` 30 |
| `ui_gb_header` | 320 × 128 | 40 / 36 / 40 / 28 | |
| `ui_gb_tab` / `_on` | 144 × 64 | 26 / 22 / 26 / 22 | `minHeight` 64 |
| `ui_gb_card` | 320 × 160 | 28 / 24 / 24 / 28 | gold left strip |
| `ui_gb_chip` | 200 × 64 | 32 / 16 / 32 / 16 | `minHeight` 64, `ui_chip` rules |
| `ui_gb_toast` | 300 × 64 | 32 / 22 / 22 / 26 | |
| `ui_gb_ribbon` | 160 × 48 | 24 / 14 / 24 / 14 | `minHeight` 48, blank |

**Fixed frames and FX.**

- `ui_gb_photo` is 176 × 136. Its `photoRect` [24, 16, 128, 80] is fully transparent, so a render texture placed under
  the frame shows through.
- `fx_gb_bell` is 4 frames of 64², played at 12 fps once (`spr:fx_gb_bell:play`).

**Page plan.** The HUD set is meant to stay loaded; the app set is loaded only while the app is open:

| Group | Frames | Memory | Contents |
|---|---|---|---|
| `resident` | 20 | 0.485 MiB | the 14 icons, chip, toast, 4 bell frames |
| `transientApp` | 35 | 1.89 MiB | phone, header, tabs, cards, tracker, logos, mascot, photo, ribbon |

**Brand checks.** These run in `gen_ui6.py --check` on every frame, and the results are shown in
`docs/previews/ui6_brand.png`:

- **Courier colour pairs.** Each sprite's two largest colour areas are compared with real-courier colour pairs. A
  difference under ΔE2000 15 fails. The closest sprites are:

  | Sprite | Closest courier | ΔE2000 |
  |---|---|---|
  | `ui_icon_gb_sled` | Kurly | 21.3 |
  | `ui_icon_gb_cart` | Kurly | 21.5 |
  | `ui_gb_phone` | Kurly | 23.5 |

- **Navy share** must stay ≤ 15 % of a sprite. The highest is 12.8 % (`ui_icon_gb_locker`), then 11.7 %
  (`ui_gb_logo_ko`).
- **Mirror symmetry** of the mark must differ by ≤ 6 % from its mirror image. Measured: 0.24 % (`ui_icon_gb`) and
  0.20 % (`ui_gb_mark`).
- **Text appears only in the two logo keys.**

One brand rule is kept by how the art is drawn, not measured by the check: no gold next to red, black or chocolate
brown. Gold shapes are outlined in a dark gold ink (#8A5510), never black or chocolate brown (plan §7.4).

## 3. Suggested app layout (`manifest.conventions.appLayout`)

The app panel is 720 × 1100 logical px and fills the viewport width. One CSS px is 2 logical px on a 360-wide phone
and 1.85 on a 390-wide one. Every minimum below holds on **both** widths, and `gen_ui6.py --check` enforces them.

| Element | Logical | 360 CSS phone | 390 CSS phone |
|---|---|---|---|
| tab height (64-tall 9-slice × 1.375) | 88 | 44 | 47.7 |
| close button (radius 44) | 88 | 44 | 47.7 |
| 따라가기 / Follow button (chip × 1.375) | 88 | 44 | 47.7 |
| catalog sell-toggle hit row (drawn 44 tall) | 88 | 44 | 47.7 |
| body text | 30 | 15 | 16.3 |
| secondary text | 28 | 14 | 15.2 |
| smallest text (English tab and tracker words) | 24 | 12 | 13 |

English tab words use a short set (Today / Order / Shop / Crew / Stars) so they fit a 128-wide tab at 24 px. The
header has the logo on the left and the close button on the right; the mascot runs in between when the app opens and
then idles. Content scrolls inside the phone screen, masked below the tabs. The order card is 348 tall: tracker at
y + 152, Follow button at (right − 272, y + 240, 250 wide), ETA line at y + 284.

## 4. §AR `audio8`: 금방 sounds (one sprite, 11 keys)

All sounds are synthesised. There is no voice, and no real company's jingle or chime. The "금-방!" sound logo is an
original F5 → G5 → C6 figure.

Levels follow the audio1–7 rule: volume = 10^((target − 2 dB − measured max momentary LUFS) / 20), clamped to
0.05–1.0. Every slice peaks at −1.7 to −2.0 dBFS, under the −1 dBFS limit.

| Key | Duration | Volume | Effective | Pitch / content | Phone-speaker loss |
|---|---|---|---|---|---|
| `sfx_gb_doorbell` | 0.90 s | 0.226 | −20.5 LUFS | G5 784.4 Hz → E5 659.2 Hz, cues ding 0 / dong 0.33 | 0.3 dB |
| `sfx_gb_doorbell_2` | 0.90 s | 0.275 | −20.5 | A5 880.3 → F♯5 740.0 | 0.1 dB |
| `sfx_gb_horn` | 0.50 s | 0.292 | −21.0 | soft double toy beep (C5 + E5), cues 0 / 0.19 | 1.2 dB |
| `sfx_gb_chime` | 0.45 s | 0.209 | −22.0 | C6 1047.0 → F6 1396.5 | 0.0 dB |
| `sfx_gb_thump` | 0.35 s | 1.000 | −22.0 | cardboard on snow, 28 % of energy below 250 Hz | 4.0 dB |
| `sfx_gb_thump_2` | 0.35 s | 0.989 | −22.0 | heavier box with a scrape, 38 % below 250 Hz | 4.8 dB |
| `sfx_gb_jingle` | 1.20 s | 0.331 | −19.5 | F5 698.7 / G5 784.4 / C6 1046.4, onsets 0 / 0.13 / 0.28 | 0.1 dB |
| `sfx_gb_tape` | 0.50 s | 0.275 | −22.5 | stick-slip noise 찌익 (flatness 0.36), snip at 0.37 | 0.2 dB |
| `sfx_gb_tape_2` | 0.50 s | 0.302 | −22.5 | quicker pull, snip at 0.30 | 0.2 dB |
| `sfx_gb_scan` | 0.15 s | 0.168 | −25.0 | soft 삑, A6 1760 Hz | 0.0 dB |
| `sfx_gb_locker` | 0.40 s | 0.355 | −21.5 | click and pop, then A5 → D6 | 0.2 dB |

Every measured pitch is within 2.4 cents of its intended note, and every phone-speaker loss is within the 6 dB limit.

**Groups.** `audioGroups`: `sfx_gb_doorbell`, `sfx_gb_thump` and `sfx_gb_tape` each pick a random variant and never
repeat the same one twice in a row. The group names also play as keys (variant 1). Cross-correlation between variants
is 0.02 to 0.31.

**Stand-ins until audio8 loads:**

| Stand-in | Used for |
|---|---|
| `sfx_ticket_chime` | doorbell, chime, scan, locker |
| `sfx_car_honk_1` | horn |
| `sfx_box_drop` | thump, tape |
| `sfx_coin` | jingle |

**Decode check.** Every slice cut the way `Assets.sliceSprite` does it lines up with ffmpeg within 1 ms, at both
44.1 kHz and 48 kHz.

**Demo mix.** The demo layers the sounds over the existing village bed: bed −34.5 LUFS, sound layer −24.7 LUFS, mix
−28.3 LUFS, peak −3.4 dBFS.

## 5. Phaser 3.90 load test (`tools/test/ui6_phaser.mjs`)

**What it loads.** `ui6`, `audio8`, `ui5`, `ui3`, `ui`, `props_items`, `emotes`, `town`, `geumbang` and the snow,
cobble and dirt road textures, through `src/core/Assets.js`:

- `mergeLate` for the `ui6` and `audio8` fragments
- `sprite`, `image`, `has` and `nine`
- `spriteAnims` for `ui_gb_mascot` and `fx_gb_bell`
- `sliceSprite('audio8')`, with each slice's length, peak, tail and head checked, plus group play

**What it checks statically.** No key clashes across 51 fragments. All frame sizes and sourceSizes match. 9-slices are
untrimmed. Every NineSlice renders at its requested size.

**HUD and world** (390 × 844 at DPR 3; zoom 0.6, 1.0 and 1.2 by day and night, and 1.6 by day; plus 360 × 640 at DPR 2,
zoom 1.0, night). The scene has:

- a townhouse with a 금방 parcel on the doorstep and a dirt path down to the cobble road
- `fx_gb_bell` ringing over the door
- the 금방 van idling with its roof sign, a locker and the round sign
- an order bubble (`ui_emote_bubble` + `ui_icon_gb_cart` + bread)
- the HUD chip, the toast and the mascot

Measured on every capture: bell 40 CSS px at every zoom, chip 120 × 44 CSS, toast 300 × 48 CSS.

**App** (real NineSlices built from `appLayout`, a render-texture doorstep photo under `ui_gb_photo`, masked content).
Tabs 오늘 / 주문 / 상품 in Korean by day, 주문 in English at night, and 주문 on a 360 × 640 phone:

| Capture | Tab (CSS) | Close | Button | Body | Smallest text | Toggle hit |
|---|---|---|---|---|---|---|
| 390, Korean | 69.3 × 47.7 | 47.7 | 47.7 | 16.3 | 15.2 | 47.7 |
| 390, English, night | 69.3 × 47.7 | 47.7 | 47.7 | 16.3 | 13.0 | — |
| 360 × 640 | 64 × 44 | 44 | 44 | 15 | 14 | — |

## 6. Previews (all in `frost-village/docs/previews/`)

**Generator previews:**

| File | Shows |
|---|---|
| `ui6_icons.png` | the 14 icons at 96 / 48 / 32 / 24 px on cream, gold, dark and night |
| `ui6_tracker.png` | the step badges, dots, lines and stars |
| `ui6_logos.png` | both logos and the mark |
| `ui6_mascot.png`, `ui6_mascot.gif` | idle, run and bow |
| `ui6_fx_bell.gif` | the doorbell FX |
| `ui6_panels.png` | the 9-slices and the photo frame |
| `ui6_app.png` | four app mock-ups at 720 × 1100 |
| `ui6_hud.png` | chip, toast, order bubble, bell and mascot at phone scale |
| `ui6_brand.png` | palette, mark mirror, navy share and courier ΔE table |

**Phaser captures:**

| File | Shows |
|---|---|
| `ui6_phaser_sheet.png` | every frame next to the ui / ui3 / ui5 icons |
| `ui6_phaser_phone.png` | montage of the HUD captures |
| `ui6_phaser_z06_day.png`, `ui6_phaser_z06_night.png` | HUD at zoom 0.6 |
| `ui6_phaser_z10_day.png`, `ui6_phaser_z10_night.png` | HUD at zoom 1.0 |
| `ui6_phaser_z12_day.png`, `ui6_phaser_z12_night.png` | HUD at zoom 1.2 |
| `ui6_phaser_z16_day.png` | HUD at zoom 1.6 |
| `ui6_phaser_z10_night_360.png` | HUD on the 360 × 640 phone |
| `ui6_phaser_app.png` | montage of the app captures |
| `ui6_phaser_app_today_ko.png`, `ui6_phaser_app_order_ko.png`, `ui6_phaser_app_catalog_ko.png` | the three Korean tabs by day |
| `ui6_phaser_app_order_en_night.png` | the English order tab at night |
| `ui6_phaser_app_order_ko_360.png` | the order tab on the 360 × 640 phone |

**Audio previews:**

| File | Shows |
|---|---|
| `audio8_spectrograms.png` | spectrograms of every key |
| `audio8_demo.mp3` | about 34 s of the sounds over the village bed |
| `audio8_preview.html` | a player page for every key |
| `audio8_report.txt` | the full level and pitch report |

## 7. Notes for the game code (owned by the v4.2 workflow)

- **Loading.** Load `ui6` and `audio8` as late fragments: `Assets.mergeLate(frag, manifest)`. Audio plays through
  `Audio.play(key)` once `sliceSprite('audio8')` has run. Until then, play the `standIn` keys.
- **Page plan.** Keep `pagePlan.resident` loaded with the HUD. Acquire `transientApp` only while the app is open.
- **9-slices.** Use Phaser NineSlice with the manifest margins. Tabs and the Follow button are 64-tall slices scaled
  uniformly by `appLayout.tabs.scale` / `button.scale` (1.375). Do not stretch them taller, because `minHeight` is
  64. The chip in the HUD is 64 tall scaled to 44 CSS.
- **Photo.** Render a 128 × 80 render texture at `photoRect` [24, 16] under `ui_gb_photo`.
- **Animations.** `spr:ui_gb_mascot:{idle,run,bow}` and `spr:fx_gb_bell:play` (plays once; the test repeats it with a
  700 ms delay).
- **Bell size.** Keep the bell at a constant 40 CSS px: scale = 40 / (64 × zoom × k) × DPR. In the test it sits over
  the townhouse door at doorPoint + (22, −96).
- **Labels.** The game writes all labels with Pretendard. Only the two logo keys carry baked letters.

## 8. Known limits and deviations

- **Art shrunk slightly to fit the page budget.** The contract-size 9-slices must stay untrimmed for NineSlice, and
  they alone take about 1.55 of the 2.5 MiB. To make the page fit at 2.481 MiB, some art is drawn a little inside its
  frame:
  - icons at 94 % of the frame
  - mascot at 0.78 scale inside its 128 frame
  - step badges at radius 23.5 in 64
  - logos 72 tall (the maximum is 96)
  - bell at 0.86
- **Speaker slot.** The phone's speaker slot sits in the stretchable top centre of `ui_gb_phone`, so it widens with
  the panel width. At 720 it reads as a normal slot.
- **Thump volume.** `sfx_gb_thump` is at volume 1.0 (effective −22.0 LUFS, exactly at target), so there is no headroom
  to raise it further. Its phone-speaker loss is 4.0 dB, under the 6 dB limit.
- **Audio judged by measurement only.** The sounds were checked with loudness, pitch, onset, spectrum, decode and
  phone-speaker models plus spectrograms. Nobody listened to them by ear, because no listening is possible in this
  environment.
- **Tool names differ from §AS.** §AS names the tools `tools/<job>/<job>_check.py` and `gb_<job>_phaser.mjs`. This
  job's allowed paths put the image check in `gen_ui6.py --check`, the audio check in `check_audio8.py` and the load
  test in `ui6_phaser.mjs`.
- **Layout is a suggestion.** `appLayout` and the HUD layout in the test are proposals. The real layout belongs to the
  game UI code, and the test harness's world framing is only for judging the art.

## 9. How to rebuild and check

```
cd frost-village
export FV_UI6_CACHE=<scratch>/cache          # optional render cache
nice -n 10 python3 tools/fx/gen_ui6.py       # atlas + manifest + previews + check (about 4 min cached)
nice -n 10 python3 tools/fx/gen_ui6.py --check
nice -n 10 python3 tools/audio/build_audio8.py   # render, sprite, manifest, then check_audio8
nice -n 10 python3 tools/audio/check_audio8.py
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers nice -n 10 node tools/test/ui6_phaser.mjs
```
