# Build report: v42_fx_ui_audio (CONTRACT_V42 §AG chief_fx, §AL ui5, §AM audio7) — after polish

Three procedural sets for 행복한 눈꽃마을 이야기 v4.2. They ship as 9 files: 3 in chief_fx, 3 in ui5 and 3 in audio7, which
is the contract budget. All three checks report 0 errors, and the Phaser 3.90 test reports 0 problems. No existing asset,
no other job's tool, no `src/**` file and no `index.html` was changed.

The polish pass answers `docs/build_reports/v42_fx_ui_audio_critique.md` (verdict polish: 0 critical, 1 high, 6 medium,
12 low). Its results are in **Polish pass** below.

| Set | Files | Page / payload | Texture memory (RGBA) |
|---|---|---|---|
| `assets/chief_fx/` | `chief_fx.png` (713 KB), `chief_fx.json`, `manifest.json` | 1 page 728 × 880, 83 frames | **2.44 MiB** page (was 2.80); trimmed frames 2.30, source-sum 3.26 |
| `assets/ui5/` | `ui5_icons.png` (217 KB), `ui5_icons.json`, `manifest.json` | 1 page 490 × 798, 27 frames | **1.492 MiB** page (budget ≤ 1.5); frames 1.423 |
| `assets/audio7/` | `audio7_sprite.mp3` (69 KB), `amb_office.mp3` (241 KB), `manifest.json` | 316,227 bytes | — |

Tools: `tools/fx/gen_chief_fx.py`, `tools/fx/gen_ui5.py`, `tools/audio/sfx7.py`, `tools/audio/build_audio7.py`,
`tools/audio/check_audio7.py`, `tools/test/chief_fx_phaser.mjs`.

Render caches live in `/tmp/fv_cache/{chief_fx,ui5,audio7}`. Since the polish they are kept **per key**:
- chief_fx: `keys/<key>_<hash>`;
- ui5: `items/<key>_<hash>.png`;
- audio7: `--only k1,k2`.

Each hash covers the key's draw function and its shared helpers, so an edit re-renders only that key. In this pass:
- chief_fx re-rendered 5 of 12 keys;
- ui5 re-rendered 6 of 27 items;
- audio7 re-rendered 5 of 10 keys.

```
nice -n 10 python3 tools/fx/gen_chief_fx.py          # render + pack + manifest + previews + check  (--check, --look KEY,
                                                     #   --only-preview sheet,states,crowd,nav,glow,gifs)
nice -n 10 python3 tools/fx/gen_ui5.py               # same for ui5                                  (--check, --look KEY)
nice -n 10 python3 tools/audio/build_audio7.py       # render (sfx7.py) + sprite + loop + manifest + check_audio7
                                                     #   (--only key,key re-renders just those; --skip-render)
nice -n 10 python3 tools/audio/check_audio7.py       # QA + spectrograms + demo mp3 + Chromium decode
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/test/chief_fx_phaser.mjs   # Phaser 3.90 load test + phone captures
```

---

## Polish pass (critic findings → what was done)

| # | Finding | Result |
|---|---|---|
| **H1** | 광채 veils villagers behind the chief, fog at night | **Fixed.** See H1 below. |
| **M1** | CODE-2 hand-over: `add.image(0, 0, 'chief_halo')` → `__MISSING` | **Fixed** (hand-over + test). Reproduced through the real `src/core/Assets.js`. See M1 below. |
| **M2** | Ring notch + nav chevron stack into "≫≫" | **Fixed in art**, plus placement rules for CODE-2. See M2 below. |
| **M3** | Edge badge: tiny notch, lighting turns with it, label covers it | **Fixed.** See M3 below. |
| **M4** | chief_fx page 2.80 MiB; v42_core eats the plaza gate | **Fixed as far as the contract allows**, with a packing plan for the build. See M4 below. |
| **M5** | Wheel squeal is a swell, not a loop | **Fixed.** See M5 below. |
| **M6** | `amb_office` is the loudest bed in the game | **Fixed**, and the choice is documented. See M6 below. |
| L1 | Gold rays read as clock ticks | **Fixed.** The 12 outlined triangles are now soft, outline-free light streaks across the tube: a gold body, a bright core and a hot spot. They flare on frames 0–3 and settle on 4–7. |
| L2 | Aurora / gold go dull at night | **Won't fix in art.** Under a MULTIPLY overlay, NORMAL art can only get darker. The fix is code: draw a faint ADD copy of the ring above the overlay, or use the DayClock light from H1. This is noted for CODE-2. |
| L3 | `ui_chip` turns to a lemon shape below 64 px | **Fixed in data.** `nineSlice.ui_chip.minHeight = 64`, and the notes say to build it at 64 tall and scale it uniformly. The Phaser mock now does exactly that. The contract margins are unchanged. |
| L4 | Thin route / halo / play_tab / cheer; pale mitten; chess-knight pony | **Fixed.** See L4 below. |
| L5 | Aurora spins once per 1.2 s | **Fixed.** A new anim `spr:chief_halo:calm` runs at 5 fps (one turn in 2.4 s, the ring's breathing) and is recommended. The contract's `play` at 10 fps is kept. |
| L6 | Office clock masked | **Fixed.** The clock is +4 dB, the typing is ducked about 3.5 dB, and the bursts are shorter. The tick is now the loudest high event in **18 of 24 s** (was 5), and the envelope autocorrelation peaks at **1000 ms** (was 800). The check fails below 10. |
| L7 | Soft glows touch the frame edge | **Fixed or reduced.** Maximum border alpha per key (/255): gold 29 → 18, marker 32 → 8, nav_edge 18 → 9, glow 0. The halo stays at 14: that is its contract rim at the 184 × 92 apex, inside a 192 × 96 frame. The check prints the border alpha of every key. |
| L8 | Marker frames 0 and 3 identical | **Fixed.** Frame 0 is now a rest frame with a twinkle on the star's top tip; frames 1–3 are the light sweep. The check asserts all 4 frames differ. |
| L9 | Letter ruling stretches; the badge has no name plate | **Fixed in data.** `ui_letter` gets `ruling {firstLineY 86, lineGap 22, lastLineY 350}` with the stretch formula. `nav_badge` notes say to draw the name on `ui_chip` at a constant screen size. No new art. |
| L10 | Typewriter sounds like wooden knocks | **Fixed (by ear still open).** See L10 below. |
| L11 | "Me" pin and "go here" badge are the same teal | **Won't fix.** The contract fixes both colours: a teal disc and white rim for the marker, a teal badge for the nav. They differ in shape (round with a star vs rounded square with an item icon). |
| L12 | Contract housekeeping (play_tab key, pin bob) | **Not in my paths.** Flagged for the lead: amend §AL to `ui_icon_play_tab`. On the pin bob, the art has no bob (contract); ChiefAura's ±2 px code bob may stay or go, and the manifest notes say to pick one. |

### H1: the 광채 back glow

`chief_glow_back` was redrawn to **hug the chief's body**:
- It is a Gaussian-blurred silhouette, measured from the union of `char_player` idle / walk / carry over its 5 dirs.
- The pale core (`#FFE7A3`, 55 %) sits behind his head and torso.
- A soft saturated gold rim shows around his outline and dies out about 15 world px past it.
- It fades out toward his boots, so it never lifts his shadow or the ground.
- Mint and lilac remain only in the outermost fringe, below 8 % alpha.
- The shimmer comes from the light breathing and a soft crest that circles once per loop.
- The contract frame (160 × 200, anchor [0.5, 0.82], 8 f, 8 fps) is unchanged.

Measured with ChiefAura's maths (×1.15 at depth chief − 0.5, alpha 0.35 by day and 0.6 at night), in the critic's own repro:

| Scene | Lifted > 8 levels | Max lift |
|---|---|---|
| Crowd, zoom 1.0, night, before | 6,134 px | 41 |
| Crowd, zoom 1.0, night, after | **1,072 px** | 31 |

My `chief_fx_glow_behind` scene, 3 grounds × day / night:

| | Lifted > 8 levels | Max lift |
|---|---|---|
| Before | 11,894–15,960 px | 34–44 |
| After | **1,622–3,370 px** | 22–29 |

That is −80 to −86 % of the lifted area, and what remains is the rim next to him. The texture also fell from 0.53 to 0.18 MiB.

The check now fails if:
- any light lies more than 16 frame px outside his outline;
- any light lies below his feet;
- any of the 8 frames has a hard edge.

For the designer's "밤에는 등불처럼" (like a lantern at night), NORMAL art under the MULTIPLY overlay can only look warmer, never brighter. `sprites.chief_glow_back.use.nightLight` therefore tells CODE-2 to push the chief as a moving light in `DayClock.drawGlows` (`{x, y: chief.y − 40, k: 0.9}`, next to the train lamp).

### M1: the CODE-2 hand-over

The critic's finding reproduces exactly.

`tools/test/chief_fx_phaser.mjs` now imports the game's own `src/core/Assets.js` (read-only) and merges the chief_fx and ui5 fragments with `Assets.mergeLate`. It records:
- `scene.add.image(0, 0, 'chief_halo')` gives **`__MISSING`** (the CODE-1 path, kept as evidence);
- `Assets.sprite('chief_halo')` gives `{tex: 'chief_fx', frame: 'chief_halo_0', anchor: [0.5, 0.5]}`;
- `Assets.image(ui, …, 'nav_edge')` gives `chief_fx:nav_edge_0`;
- `Assets.spriteAnim('chief_halo', 'calm')` gives `spr:chief_halo:calm` and plays;
- `Assets.has()` is true for all 8 probe keys;
- `Assets.nine('ui_chip')` gives `ui5_icons / ui_chip 32/32/16/16`.

The test fails if the CODE-2 path breaks. The corrected hand-over is below and in `conventions.codeUse` in the manifest.

### M2: the ring notch and the nav chevron

- **New key `chief_halo_notch`** (beyond the contract; same atlas, no new file): 16 headings, each 40 × 24.
  - It is a small **gold arrowhead gem** lying on the ground.
  - It follows the same k rule as `nav_chevron` and is lit from the upper left in every heading.
  - Draw it at 1.3 × the ring scale, about 8 CSS px long, centred on the ring line.
  - "The ring points" is now gold and single, not a second teal chevron.
- **Placement rules in the notes:**
  - chevron `ahead = max(56, rx + 36)`, so it clears the ring at zoom 0.6 too;
  - route dots hidden within `max(90, ahead + 30)`.
  - The previews and the Phaser phone scene use these rules.

### M3: the screen-edge badge

`nav_edge` was redrawn so it can rotate safely:
- **A bold gold arrowhead**, 16.4 px long and 27 px wide (about 8 × 13 CSS px at scale 0.9). It was a 6 × 12–15 px notch.
- **Rotation-neutral light:** radial torus shading on the band, a symmetric recess on the disc, and a centred soft navy halo instead of the offset drop shadow.
- The `iconRect` disc is unchanged, and the badge stays one frame that the game rotates whole, so today's CODE-1 code works as is.
- The notes say to put the metres label on the side away from the arrow.
- The check verifies:
  - the arrow is at least 14 px long;
  - the band luminance at 9 angles away from the arrow varies by no more than 10 levels.
- Preview: `chief_fx_edge_badges.png` shows 8 headings, snow and night.

### M4: page budget

The **chief_fx page went from 2.80 to 2.44 MiB** (the new glow, tighter trims; the new notch adds 0.04). Getting closer to "≈ 2" would mean dropping contract frames or sizes:
- halo 12 frames = 0.84 MiB;
- gold 8 frames = 0.56;
- nav_ring 8 frames = 0.31.

ui5 stays under its 1.5 MiB budget (1.492) after the bolder icons. A seeded random-restart MaxRects search keeps it there.

**For the build:** `ui5/manifest.json conventions.pagePlan` lists what stays resident and what is transient:
- Resident: the icons and status dots, **0.505 MiB**.
- Transient: the 5 panel frames, **0.918 MiB**, for the office-panel page (plan §13.2 "panel page 1.6 MiB").

With that split, `v42_core` is about 2.44 + 0.51 = 2.95 MiB. The plaza sum is then 323 + 2.95 + 0.1 + 2.5 + 1.5 = **330.05 ≤ 331**. Without the split it is 331.05 (0.05 over). The split is the lead's or the build's decision.

### M5: the wheel squeal

The squeal was re-rendered as a **steady, exactly periodic loop** with a period of 1.23 s, which is the 1.2 s slice plus the 30 ms that `Assets.sliceSprite` keeps:
- every partial and FM rate makes a whole number of cycles per loop;
- the noise, filters and reverb are circular;
- the slow swells stay within ±2.5 dB;
- it starts at its quietest zero crossing.

How it sits in the sprite:
- The 30 ms continuation lies in the gap after the slice, so the sliced buffer is exactly one period. `sound.add(k, {loop: true})` is therefore seamless.
- A 12 ms pre-roll and an 8 ms post-roll, with 4 ms fades, keep a ±1 ms decoder offset seamless too.
- 4 ms of silence remain after the previous key's 30 ms read, and 8 ms before the next key.

The manifest carries `loopPeriod: 1.23`. Measured results:
- The looped envelope is never more than 12 dB under its peak (0 % of the time; it was 55 %). The 5–95 % swing is 5.5 dB.
- Seam ratio (fail ≥ 1): ffmpeg 0.023; Chromium 0.02 at 44.1 kHz and at 48 kHz.
- The Chromium cut is 54,243 / 59,040 samples.

### M6: the office bed level

The target is now **−30.5 LUFS** (volume 0.251). The delivered level is −32.4 on the critic's meter (it was −28.0), which puts it relative to the other beds at:
- +2.3 dB over `amb_bank` (−34.7);
- 0.2 dB under `amb_fire_big` (−32.2);
- +1.4 dB over `amb_town`.

CONTRACT_V42's "−26 LUFS" would make it the loudest bed in the game. If the designer prefers the contract level, only `volume` needs to change (× 1.68); no re-render is needed.

### L4: the thin icons, the mitten and the pony

Coverage at 32 px (it was 0.21–0.27; the house minimum is 0.29):

| Icon | Coverage | Change |
|---|---|---|
| route | 0.30 | bigger pin, bolder navy prints |
| play_tab | 0.32 | bigger snowflake and joystick |
| halo | 0.34 | bigger chief, fatter ring |
| cheer | 0.37 | bigger mitten and notes |

Other changes:
- **Hand:** a teal knitted cuff and a darker outline (`#2C4268`). Contrast on cream is 163.
- **Sleigh pony:** a fuller head, a forelock, and a red noseband and cheek strap with a gold ring.
- The check warns below 0.28 coverage.

### L10: the typewriter

A bright type-bar tick (3.2 / 4.2 kHz bursts, about −10 dB under the body) was added, and the desk thump lowered. The spectral centroid is 1.08–1.33 kHz (it was 0.89), and 3.6–5.8 % of the energy is above 2.5 kHz. Levels are unchanged (−23.0 delivered). It still needs a listen in game.

---

## AG. chief_fx

All artwork uses the NORMAL blend and is drawn on a 4× supersampled SDF canvas (fxlib), then downsampled.
- Every bright shape has a darker cool or amber rim, so it reads on white snow, grey cobbles, brown dirt and the plaza.
- It also reads under the night overlay (MULTIPLY `#5A6AA8` × 0.45).
- Frames are named `{key}_{i}`; the chevrons and notch are `{key}_{ii}`.
- The atlas is trimmed JSON-hash with `sourceSize` kept, so anchors refer to the full contract frame.

| Key | Frame | Frames · fps · repeat | Anchor | What it is | Replaces (plan §16.1) |
|---|---|---|---|---|---|
| `chief_halo` | 192×96 | 12 · 10 · −1 (+ `calm` 5 fps) | 0.5, 0.5 | A glassy "jelly" aurora tube (outer 184×92). The mint → sky → lilac gradient goes round once per loop. It has a gold inner line, a teal outer rim, a soft glow and 6 twinkling stars. The centre is transparent. | `fv_halo` |
| `chief_halo_gold` | 192×96 | 8 · 12 · −1 | 0.5, 0.5 | A warm gold tube with a brighter glow and 12 soft light streaks across it (long and short alternate; they flare up, then settle), plus glints. | `fv_halo_gold` |
| `chief_halo_rank2` | 216×108 | 1 | 0.5, 0.5 | A thin double gold band (2 px + 1 px, 4 px apart), outer 208×104. | `fv_halo_rank2` |
| `chief_glow_back` | 160×200 | 8 · 8 · −1 | 0.5, 0.82 | 광채 that hugs his body (H1): core `#FFE7A3` 55 % behind head and torso, a gold rim dying out about 15 world px past his outline, none on the ground. | `fv_halo_glow` |
| `chief_sparkle` | 32×32 | 6 · 12 · 0 | 0.5, 0.5 | A 4-point twinkle with a white core and an amber/gold rim. It appears, peaks, then fades. | `fv_halo_mote` / `fx_sparkle` |
| `chief_marker` | 72×88 | 4 · 6 · −1 | 0.5, 1.0 | A teal badge (Ø 60) with a white rim, a gold star (34 px) and a pinecone crown. Frame 0 is a rest frame with a star twinkle; frames 1–3 are the light sweep. No bob. | `fv_halo_pin` |
| `nav_chevron` | 64×40 | 16 `_00`…`_15` | 0.5, 0.5 | A flat double-chevron decal: teal with a white rim and a gold core. Frame k points along screen angle k × 22.5°. | `fv_nav_chevron` `c0..c15` |
| `nav_dot` | 28×14 | 2 (`_0`, `_1` highlight) | 0.5, 0.5 | An iso ground dot; the highlight has a gold rim. | `fv_nav_dot` `d0/d1` |
| `nav_ring` | 160×80 | 8 · 10 · −1 | 0.5, 0.5 | 12 teal capsule dashes with gold cores that pulse outward and fade. | `fv_nav_ring` |
| `nav_badge` | 88×100 | 1 | 0.5, 1.0 | A teal speech badge with an empty cream disc, `iconRect [16, 14, 56, 56]`. | Navigator `ui_panel` badge |
| `nav_edge` | 80×80 | 1 | 0.5, 0.5 | A teal circle with a **gold arrowhead** on the right (`pointsAtRad 0`, `arrow {baseX 60, tipX 76.4, halfWidth 13.5}`) and rotation-neutral light. Empty disc `iconRect [18, 18, 44, 44]`. | `fv_nav_edge` (`ui_arrow`) |
| `chief_halo_notch` *(addition)* | 40×24 | 16 `_00`…`_15` | 0.5, 0.5 | A gold arrowhead gem lying on the ring where the route leaves it (M2). | ChiefAura notch (`fv_nav_chevron` at sc × 1.6) |

Texture memory per key, trimmed (MiB):

| Key | MiB |
|---|---|
| halo | 0.844 |
| gold | 0.562 |
| nav_ring | 0.313 |
| glow | 0.176 |
| chevron | 0.097 |
| marker | 0.097 |
| rank2 | 0.089 |
| notch | 0.040 |
| badge | 0.034 |
| edge | 0.022 |
| sparkle | 0.013 |
| dot | 0.003 |

Manifest fields:
- `conventions`: `contract`, `blend`, `frames`, `readability`, `screenSize`, `depth`, **`codeUse`**, **`additions`**, `pageSize` and `pageMiB`.
- Per sprite: `atlas`, `frame`, `anchor`, `kind`, `blend`, `frameSize`, `frames`, `frameNames`, `fps`, `repeat`, `anims` (`play`, plus `calm` on the halo), `replaces` and `notes`.
- Some sprites also carry `iconRect`, `headings`/`headingStepDeg`, `states`, `pointsAtRad`/`arrow`, or `use` (the glow).

### How the game uses it (CODE-2 hand-over, corrected)

**Setup: sprite keys, not texture keys.**
- Add the `chief_fx` fragment. `sprites[key]` is a sprite key; its texture is the atlas `chief_fx`.
- `fxTex.art(key, fallback)` only says the art is there. **Do not pass its key to `add.image`.** `scene.add.image(0, 0, 'chief_halo')` draws Phaser's `__MISSING` box, as the Phaser test proves.
- Resolve every key with `Assets.sprite(key)`, which gives `{tex, frame, anchor}`, or with `Assets.image` / `Assets.apply`.
- Animated keys: `add.sprite(x, y, r.tex, r.frame).setOrigin(...r.anchor).play(Assets.spriteAnim(key, 'play'))`. This applies to:
  - the ring: `'calm'` is recommended; in 관망 use `calm` at timeScale 0.67;
  - the gold ring, the glow, the pin, the motes and the target ring.
- UIv42's edge badge: `Assets.image(ui, 0, 0, 'nav_edge')`.
- Navigator: map the frame names. `'c' + k` becomes `'nav_chevron_' + pad2(k)`, and `d0`/`d1` become `nav_dot_0`/`nav_dot_1`.

**Ring and band**
- Scale the ring with `setScale(ringWidth / 192)`, where `ringWidth = 70 × min(2, 1.2 / zoom)` below zoom 1.2. That is 45.5 CSS px at zoom 0.6, 1.0 and 1.2.
- Draw the rank-2 band at the same scale as the ring, at depth ring − 0.01.

**Glow and motes**
- Glow: depth chief − 0.5, ×1.15, alpha 0.35 by day and 0.6 at night, at the chief's feet (CODE-1's +4 is harmless).
- At night, also add the chief as a moving DayClock light (`use.nightLight`).
- Motes: 6 pooled `chief_sparkle` at depth chief ± 1. Restart the one-shot anim on `animationcomplete`.

**Pin**
- Depth LABEL − 30, `setScale(22 / (zoom × 390 / 720) / 72)`, which is 22 CSS px. Use either the code bob or none.

**Notch, while carrying with nav on**
- Use the frame `chief_halo_notch_` + pad2(k), with the same k rule as the chevron.
- Scale it to `ringWidth / 192 × 1.3` and place it at `(x + cos a × ringWidth × 0.46, y + sin a × ringWidth × 0.23)`, at depth PAD + 2.02.
- Optionally hide it while the navigator chevron is visible.

**Navigator**
- Chevron `ahead = max(56, rx + 36)` with `rx = ringWidth × 0.46`. Dots hidden within `max(90, ahead + 30)`.
- `nav_ring`: play the anim at scale 1 and drop the code pulse.
- `nav_badge`: draw the item icon in `iconRect` at about 44 px. Draw the name on a `ui_chip` plate at a constant screen size.
- `nav_edge`: set `rotation = atan2(dy, dx)` on the whole frame. Keep the icon upright at the centre (34–40 px). Put the metres at `−(cos a, sin a) × 50`, the side away from the arrow.

Measured on the phone (CSS px), at zoom 0.6 / 1.0 / 1.2 / 1.6:

| Piece | 0.6 | 1.0 | 1.2 | 1.6 |
|---|---|---|---|---|
| Ring | 45.5 | 45.5 | 45.5 | 60.7 |
| Chevron | 20.8 | 34.7 | 41.6 | 55.5 |
| Dot | 9.1 | 15.2 | 18.2 | 24.3 |
| Target ring | 52 | 87 | 104 | 139 |
| Badge | 28.6 | 47.7 | 57.2 | 76.3 |

At every zoom the pin is 22 CSS px and the notch about 8 CSS px.

---

## AL. ui5

There are 18 icons at 96 × 96, anchor 0.5. They follow the house soft-toy style from fxlib.toy: a dark tinted outline,
a bevel lit from the upper left, gloss and one navy drop shadow. No text is baked into any icon. At 32 px every icon is
at least 29 % solid (route 0.30 is the thinnest), and its contrast is at least 118 on cream and at least 114 on dark.

The icon keys are binoculars, hand, route, office, letter, inventory, news, bank, staff, halo, cheer, depot, sleigh,
coach, boxcar, flatcar, **play_tab** and new.

**Key change: `ui_icon_play` ships as `ui_icon_play_tab`.**
- pets2 already owns `ui_icon_play`: it is the dog's play-fetch ball.
- A second `ui_icon_play` would cause a problem either way the fragment is merged: at boot it would replace the dog
  button's art, and merged late it would be dropped.
- The manifest records it as `conventions.renamed` plus `contractKey` on the sprite. The lead should amend §AL.

The fallbacks are unchanged: `fv_icon_*` and the ui3 / ui4 icons (see `replaces` per sprite).

**Panels** are in the same atlas, **untrimmed**, with `nineSlice {atlas, frame, left, right, top, bottom, contentInset}`.

| Frame | Size | 9-slice (left / top / right / bottom) | Extra |
|---|---|---|---|
| `ui_letter` | 320×400 | 36 / 64 / 36 / 40 | `ruling {firstLineY 86, lineGap 22, lastLineY 350}`. The ruling stretches with the height, by the factor `(h − 104) / 296`. |
| `ui_chalk_panel` | 320×240 | 28 / 28 / 28 / 36 | |
| `ui_office_tab`, `_on` | 160×72 | 24 / 20 / 24 / 12 | |
| `ui_chip` | 200×64 | 32 / 16 / 32 / 16 | `minHeight 64`: build it at 64 tall and `setScale(h / 64)` for smaller chips. |

The status dots are 32×32: `ui_status_0` red 부족, `_1` orange 길 막힘, `_2` blue 남음 and `_3` green 적당.

`conventions.pagePlan` lists the resident set (icons and dots, 0.505 MiB) and the transient set (panels, 0.918 MiB)
for the `v42_core` / office-panel packing.

---

## AM. audio7

The one-shots are in one sprite: 5.700 s, 9 slices, 50 ms gaps, a single LAME 96 kbps mono encode. The manifest is the
sprite JSON. Levels use the audio1–6 rule: `volume = 10^((target − 2 − measured) / 20)`. One-shots are measured as max
momentary LUFS, the loop as integrated LUFS. Every peak is at or below −1.7 dBFS (true peak included).

| Key | Dur | Volume | Delivered / wanted | Notes |
|---|---|---|---|---|
| `sfx_typewriter` | 0.6 | 0.653 | −23.0 / −23.0 | 4 key clacks with a bright type-bar tick (L10); centroid 1.08 kHz |
| `sfx_typewriter_2` | 0.6 | 0.955 | −23.0 / −23.0 | another typist; centroid 1.15 kHz |
| `sfx_typewriter_3` | 0.6 | 0.490 | −22.9 / −23.0 | 4 keys + the F6 margin bell (1397.6 Hz, +0.8 cents) |
| `sfx_switch_clack` | 0.4 | 1.000 | −21.3 / −20.5 | unchanged; volume clamped (0.8 dB short, inside ±1 dB) |
| `sfx_wheel_squeal` | 1.2 (+ 0.03) | 0.072 | −28.1 / −28.0 | **a steady loop, `loopPeriod` 1.23** (M5); 0.0 % of its energy above 4 kHz |
| `sfx_mailbox_flag` | 0.3 | 0.861 | −21.0 / −21.0 | unchanged (C7 bell 2092.9 Hz) |
| `sfx_coin_sack` ×3 | 0.5 | 0.495 / 0.501 / 0.473 | −20.5 | unchanged; variants cross-correlate at 0.08–0.11 |
| `amb_office` | 24.0 loop | **0.251** | −32.5 / −32.5 | **target −30.5** (M6); clock +4 dB, typing ducked (L6) |

`amb_office` is a separate file, `amb_office.mp3`, at 80 kbps.
- `loopSamples` 1,058,400; `duration` 24.0000000; `mp3StartPad`; `rotation`; `clockHz` 1.
- The loop seam scores hf 0.21 and d2 0.03.
- The tick is the loudest high event in 18 of 24 seconds.

All 9 slices pass these checks:
- phone-loss model (500 Hz HP + 9 kHz LP): 0.1–4.0 dB, at or below 6 dB;
- Chromium decode at 44.1 and 48 kHz: every `sliceSprite`-style cut lines up within 1 ms;
- the squeal's cut loops seamlessly at both rates.

---

## Tests

**`gen_chief_fx.py --check`: 0 errors, 1 warning** (page 2.44 MiB against the contract's "≈ 2"; see M4).

On top of the earlier checks (sizes, frames, anchors, names, border clipping, empty discs, transparent halo centre,
ring thickness, loop seams, star ≥ 30 px, the 16 chevron headings, ring pulse, sparkle and glow edge), it now also
checks:

| Area | What is checked |
|---|---|
| Notch | the 16 notch headings |
| Glow | no light more than 16 px outside his outline, none below the feet, no hard edge in any of the 8 frames |
| Marker | all 4 frames are distinct |
| Edge badge | arrowhead ≥ 14 px, light that does not turn with it |
| Borders | border alpha per key |
| Page | the page is not over the delivered 2.80 MiB |

**`gen_ui5.py --check`: 0 errors, 0 warnings.** New checks:
- `minHeight` on `ui_chip` and `ruling` on `ui_letter`;
- coverage of at least 28 % at 32 px;
- a printout of the 5 thinnest icons and the 3 lowest-contrast ones;
- the page at or below 1.5 MiB.

**`check_audio7.py`: OK, 0 errors, 0 warnings.** New checks:
- the squeal's `loopPeriod` equals the sliceSprite cut (dur + 30 ms);
- that cut loops without a click (hf / d2 < 1) and without throbbing (≤ 5 % of the time more than 12 dB under the peak);
- the Chromium cut seams at 44.1 and 48 kHz;
- the office clock is the loudest high event in at least 10 of 24 s.

**`tools/test/chief_fx_phaser.mjs`: OK, 0 problems.**
- **Static:** 0 key clashes across all `assets/*/manifest.json`.
- **Load page:**
  - 114 frames exist, with `sourceSize` equal to `frameSize`;
  - 7 sprite anims (including `calm`); 40 sprites playing;
  - 9 nineslices; `ui_chip` built at 64 and scaled;
  - 9 audio slices; the squeal loops (cut 1.23 s, seam 0.022); `amb_office` plays;
  - the **Assets.js hand-over probe** (M1).
- **Phone (390 × 844 @3x), zoom 0.6, 1.0 and 1.2 by day and night, plus 1.6 by day:**
  - four real chiefs (crowd, working, 읍, carrying with the navigator);
  - the ring is 45.5 CSS px (60.67 at 1.6) and the pin 22 CSS px;
  - the gold notch and the chevron are placed clear of the ring;
  - two edge badges (pointing lower right and upper left) with labels opposite the arrows;
  - no page errors and no 404s.

The critic's harness was copied to my scratch folder and re-run on the new art (`behind`, `crowd` with and without the
glow, night). It shows 0 page errors, and the numbers are under H1.

---

## Previews (`docs/previews/`)

**chief_fx**
- `chief_fx_states_z06.png`, `_z10.png` and `_z12.png` show the real chief in every aura state (normal, working, 읍,
  관망 + pin, carry + gold notch + chevron, night) on snow, cobble and plaza.
- `chief_fx_glow_behind.png` (new) shows 광채 on and off with villagers behind him, on snow, cobble and dirt, by day
  and night, with the measured lift.
- `chief_fx_edge_badges.png` (new) shows `nav_edge` at 8 headings, on snow and at night.
- `chief_fx_crowd.png`, `chief_fx_nav_mock.png` and `chief_fx_sheet.png` (every frame, including the notch).
- GIFs: `chief_fx_chief_halo`, `_chief_halo_gold`, `_chief_glow_back`, `_chief_sparkle`, `_chief_marker`, `_nav_ring`,
  `_nav_chevron` and `_aura_live`.
- Phaser captures: `chief_fx_phaser_phone.png`, `chief_fx_phaser_z06_day.png` … `_z12_night.png`, `_z16_day.png` and
  `chief_fx_phaser_sheet.png`.

**ui5**
- `ui5_icons.png`, `ui5_panel_sources.png`, `ui5_panels.png`, `ui5_panels_full.png` and `ui5_phaser_phone.png`.

**audio7**
- `audio7_spectrograms.png`: the squeal is now a steady band.
- `audio7_demo.mp3`: the office bed at the new level; the squeal looped by its sliced buffer, as in the game.
- `audio7_preview.html` (loops the squeal) and `audio7_report.txt`.

---

## Known issues

1. **The chief_fx page is 2.44 MiB, not "≈ 2".**
   - The contract frame counts at the contract sizes cannot go lower: the halo and gold rings alone are 1.41 MiB trimmed.
   - The plaza gate holds (330.05 ≤ 331) only if the build keeps the ui5 panels off the resident `v42_core` page
     (`ui5 pagePlan`).
2. **`chief_halo_notch` is an addition beyond §AG.** It is in the same atlas, adds no file, and is listed in
   `conventions.additions`. CODE-2 must switch the ChiefAura notch to it.
3. **광채 cannot glow brighter than the night under NORMAL blend.** The "lantern" look at night needs CODE-2's DayClock
   moving light (`use.nightLight`). The same applies to the ring's night dullness (L2).
4. **`ui_icon_play` is renamed** to `ui_icon_play_tab`. The contract §AL text needs the lead's amendment.
5. **The pin bob:** the art has no bob, and ChiefAura adds ±2 px. Pick one.
6. **`amb_office` is −30.5 LUFS, not the contract's −26.** This is a deliberate level choice (M6), reversible by
   `volume` × 1.68.
7. **Audio is judged by measurement only**: loudness, spectra, onsets, tuning, seams and decode. The typewriter tick
   (L10), the office balance and the squeal want one listen in game; the demo mp3 is there for that.
8. **`sfx_switch_clack` is volume-clamped at 1.0** (0.8 dB short, inside tolerance).
9. **Still for CODE-2:**
   - add the fragments `chief_fx`, `ui5` and `audio7`;
   - resolve keys through `Assets.sprite`, `Assets.image` and `Assets.spriteAnim` (M1);
   - map the Navigator frame names;
   - use the notch, chevron, dot and edge-label placement rules above.
