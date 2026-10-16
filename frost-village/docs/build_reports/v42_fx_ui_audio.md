# Build report: v42_fx_ui_audio (CONTRACT_V42 §AG chief_fx, §AL ui5, §AM audio7)

Three procedural sets for 행복한 눈꽃마을 이야기 v4.2. I wrote 9 source files: 3 in chief_fx, 3 in ui5 and 3 in audio7,
which is the contract budget. All three checks report 0 errors and 0 warnings, and the Phaser 3.90 test reports
0 problems. I did not change any existing asset, any tool belonging to another job, `src/**` or `index.html`.

| Set | Files | Page / payload | Texture memory (RGBA) |
|---|---|---|---|
| `assets/chief_fx/` | `chief_fx.png` (768 KB), `chief_fx.json`, `manifest.json` | 1 page 856 × 858, 67 frames | **2.80 MiB** page (frames source-sum 3.20 MiB) |
| `assets/ui5/` | `ui5_icons.png` (214 KB), `ui5_icons.json`, `manifest.json` | 1 page 492 × 798, 27 frames | **1.498 MiB** page (budget ≤ 1.5; frames 1.42 MiB) |
| `assets/audio7/` | `audio7_sprite.mp3` (69 KB), `amb_office.mp3` (241 KB), `manifest.json` | 315,710 bytes | — |

Tools: `tools/fx/gen_chief_fx.py`, `tools/fx/gen_ui5.py`, `tools/audio/sfx7.py`, `tools/audio/build_audio7.py`,
`tools/audio/check_audio7.py`, `tools/test/chief_fx_phaser.mjs`. Render caches are in `/tmp/fv_cache/{chief_fx,ui5,audio7}`.

```
nice -n 10 python3 tools/fx/gen_chief_fx.py          # render + pack + manifest + previews + check  (--check, --look KEY)
nice -n 10 python3 tools/fx/gen_ui5.py               # same for ui5                                  (--check, --look KEY)
nice -n 10 python3 tools/audio/build_audio7.py       # render (sfx7.py) + sprite + loop + manifest, then check_audio7
nice -n 10 python3 tools/audio/check_audio7.py       # QA + spectrograms + demo mp3 + Chromium decode
node tools/test/chief_fx_phaser.mjs                  # headless Phaser 3.90 load test + phone captures
```

---

## AG. chief_fx

All artwork uses the NORMAL blend and is drawn on a 4× supersampled SDF canvas (fxlib), then downsampled. Every bright
shape has a darker cool or amber rim, so it reads on white snow, grey cobbles, the brown dirt and the plaza. It also
reads under the night overlay (MULTIPLY #5A6AA8 × 0.45). Frames are named `{key}_{i}`; the chevrons are named
`nav_chevron_{ii}`. The atlas is trimmed JSON-hash with `sourceSize` kept, so anchors refer to the full contract frame.

| Key | Frame | Frames · fps · repeat | Anchor | What it is | Replaces (plan §16.1) |
|---|---|---|---|---|---|
| `chief_halo` | 192×96 | 12 · 10 · −1 | 0.5, 0.5 | A glassy "jelly" aurora tube (outer 184×92). The mint → sky → lilac gradient goes round once per loop. It has a gold inner line, a teal outer rim and a soft glow. Six 4-point stars twinkle. The centre is transparent. | `fv_halo` |
| `chief_halo_gold` | 192×96 | 8 · 12 · −1 | 0.5, 0.5 | A warm gold tube with a brighter glow. 12 detached, outward-pointing sun-ray ticks (long and short alternate) pulse: they grow over frames 0–3 and settle over 4–7. Glints. | `fv_halo_gold` |
| `chief_halo_rank2` | 216×108 | 1 · 0 · 0 | 0.5, 0.5 | A thin double gold band (2 px + 1 px, 4 px apart), outer 208×104 | `fv_halo_rank2` |
| `chief_glow_back` | 160×200 | 8 · 8 · −1 | 0.5, 0.82 | 광채: a broad soft oval (pale gold core #FFE7A3, 55 %) that fades to mint on the left and lilac on the right. A slow shimmer, with no hard edge. | `fv_halo_glow` |
| `chief_sparkle` | 32×32 | 6 · 12 · 0 | 0.5, 0.5 | A 4-point twinkle with a white core and an amber/gold rim. It appears, peaks on frames 1–2, then fades. | `fv_halo_mote` / `fx_sparkle` |
| `chief_marker` | 72×88 | 4 · 6 · −1 | 0.5, 1.0 | A teal badge (Ø 60) with a white rim, a gold star (34 px), a white pinecone crown and a pointer tail. A 4-frame light sweep, with no bob. | `fv_halo_pin` (ui3 `ui_icon_fame`) |
| `nav_chevron` | 64×40 | 16 named `_00`…`_15` | 0.5, 0.5 | A flat double chevron decal: teal with a white rim and a gold inner highlight. Frame k points along screen angle k × 22.5° (0 = right, clockwise). | `fv_nav_chevron` `c0..c15` |
| `nav_dot` | 28×14 | 2 (`_0` normal, `_1` highlight) | 0.5, 0.5 | An iso ground dot, teal with a white centre. The highlight is brighter and has a gold rim. | `fv_nav_dot` `d0/d1` |
| `nav_ring` | 160×80 | 8 · 10 · −1 | 0.5, 0.5 | 12 teal capsule dashes with gold cores. Each frame is larger and fainter than the last (frame 0 small and bright, frame 7 large and faint). The dashes creep 1/12 of a turn per loop. | `fv_nav_ring` |
| `nav_badge` | 88×100 | 1 | 0.5, 1.0 (pointer tip) | A teal speech badge with a white rim and a navy shadow. It has an empty cream disc, `iconRect [16, 14, 56, 56]`. | Navigator badge container (`ui_panel` + item icon) |
| `nav_edge` | 80×80 | 1 | 0.5, 0.5 | A teal circle with a white rim and an arrow notch on the right, `pointsAtRad 0`. It has an empty disc, `iconRect [18, 18, 44, 44]`. | `fv_nav_edge` (`ui_arrow`) |

Manifest fields:
- `conventions`: `contract`, `blend`, `frames`, `readability`, `screenSize`, `depth`, `pageSize`, `pageMiB`.
- Per sprite: `atlas`, `frame`, `anchor`, `kind`, `blend`, `frameSize`, `frames`, `frameNames`, `fps` and `repeat`.
- Animated keys also have `anims.play`, so `Assets.spriteAnims` makes `'spr:<key>:play'`.
- Some sprites also carry `iconRect`, `headings`/`headingStepDeg`, `states` (nav_dot) or `pointsAtRad`.
- Every sprite has `replaces` (the code fallback) and `notes` (how to use it).

### How the game uses it (CODE-2 hand-over)

**Setup and the ring**
- Add the `chief_fx` fragment. `fxTex.art(key, fallback)` already switches on `Assets.has(key)`.
- The ring, gold ring and glow are animated now. Make them sprites and call `.play('spr:chief_halo:play')`, and so on;
  ChiefAura currently makes images.
- Scale the ring with `setScale(ringWidth / 192)`, where `ringWidth = 70 × min(2, 1.2 / zoom)` below zoom 1.2.
  On a 390 px phone that is **45.5 CSS px** at zoom 0.6, 1.0 and 1.2. At zoom 1.6 it is 60.7 CSS px.

**Rank band, glow, motes and pin**
- Draw the rank-2 band at the **same scale as the ring**, at depth ring − 0.01. CODE-1's `sc × 1.12 × 192 / 216` is
  `sc × 0.996`, so it is effectively the same.
- Glow: depth chief − 0.5, ×1.15, alpha 0.35 by day and 0.6 at night.
- Motes: 6 pooled `chief_sparkle` riding the ring, at depth chief ± 1. Restart the one-shot anim on `animationcomplete`.
- Pin: depth LABEL − 30, so it sits above the night overlay. Use
  `setScale(22 / (zoom × 390 / 720) / 72)`, which makes it **22 CSS px**. Place it 14 px above the head, or above the
  stack top + 26.

**Navigator**
- Frame names:
  - `'c' + k` becomes `'nav_chevron_' + pad2(k)`. Use the same k rule: `round(atan2(dy, dx) / 22.5°) mod 16`. The notch
    on the ring uses the same frames.
  - `d0`/`d1` become `nav_dot_0`/`nav_dot_1`.
- `nav_ring`: play the anim at scale 1 and drop the code pulse. The art already has the pulse.
- `nav_badge` replaces the `ui_panel` container. Draw the item icon centred in `iconRect` at about 44 px, and the name
  as text under it.
- `nav_edge`: set `rotation = atan2(dy, dx)` and keep the icon upright as a separate image at the badge centre (34–44 px).

**Depths**
- Ring and band: PAD + 2.
- Chevron, dots and target ring: PAD + 3.
- Badge: LABEL − 40.

Measured on the phone (CSS px), zoom 0.6 / 1.0 / 1.2 / 1.6:
- ring tube 43.6 / 43.6 / 43.6 / 58.1
- chevron 20.8 / 34.7 / 41.6 / 55.5
- dot 9.1 / 15.2 / 18.2 / 24.3
- target ring 52 / 87 / 104 / 139
- badge 28.6 / 47.7 / 57.2 / 76.3

---

## AL. ui5

There are 18 icons at 96 × 96, anchor 0.5. They follow the house soft-toy style from fxlib.toy: a dark tinted outline,
a bevel lit from the upper left, gloss and one navy drop shadow. No text is baked into any icon. The check script
confirms each icon reads at 32 px on cream and on dark.

The icon keys are binoculars, hand, route, office, letter, inventory, news (snowflake masthead), bank, staff, halo,
cheer, depot, sleigh, coach, boxcar, flatcar, **play_tab** and new.

| Icon | Fallback |
|---|---|
| `ui_icon_binoculars` | `fv_icon_binoculars` / ui3 `ui_icon_explore` |
| `ui_icon_hand` | `ui_icon_backpack` |
| `ui_icon_route` | `fv_nav_edge` |
| `ui_icon_office` | `fv_icon_office` |
| `ui_icon_letter` | ui4 `ui_icon_story` |
| `ui_icon_inventory` | ui4 `ui_icon_stock` |
| `ui_icon_news` | ui4 `ui_icon_newspaper` |
| `ui_icon_bank` | ui4 `ui_icon_passbook` |
| `ui_icon_staff` | `ui_icon_worker` |
| `ui_icon_halo` | `fv_halo` |
| `ui_icon_cheer` | emotes `fx_music_notes` |
| `ui_icon_depot` | ui4 `ui_icon_box` |
| `ui_icon_sleigh` | ui3 `ui_icon_delivery` |
| coach / boxcar / flatcar | text |
| `ui_icon_play_tab` | `ui_icon_settings` |
| `ui_icon_new` | ui3 `ui_icon_event` |

**Key change: `ui_icon_play` ships as `ui_icon_play_tab`.**
- pets2 already owns `ui_icon_play`: it is the dog's play-fetch ball used by `src/scenes/UI.js`.
- A second `ui_icon_play` would cause a problem either way the fragment is merged:
  - Merged at boot (`Object.assign`), it would replace the dog button's art.
  - Merged late (`mergeLate`), it would be dropped.
- The manifest records this as `conventions.renamed {ui_icon_play: ui_icon_play_tab}` plus `contractKey` on the sprite.

**Panels** are in the same atlas, **untrimmed**, with `nineSlice {atlas, frame, left, right, top, bottom, contentInset}`.
Each one also has a sprite entry with `contentInset` and `replaces`.

| Frame | Size | 9-slice (left / top / right / bottom) | Replaces |
|---|---|---|---|
| `ui_letter` | 320×400 | 36 / 64 / 36 / 40 | `ui_panel` |
| `ui_chalk_panel` | 320×240 | 28 / 28 / 28 / 36 | ui4 `ui_newspaper` |
| `ui_office_tab` | 160×72 | 24 / 20 / 24 / 12 | `ui_button_gray` |
| `ui_office_tab_on` | 160×72 | 24 / 20 / 24 / 12 | `ui_button_green` |
| `ui_chip` | 200×64 | 32 / 16 / 32 / 16 | `ui_panel` |

Status dots are 32×32: `ui_status_0` red 부족, `_1` orange 길 막힘, `_2` blue 남음 and `_3` green 적당. They are also one
sprite, `ui_status`, with `frameNames` and `states {short, blocked, surplus, ok}`.

Usage:
```js
this.add.nineslice(x, y, 'ui5_icons', 'ui_letter', w, h, 36, 36, 64, 40)
```
The Phaser test stretched every panel to its requested size, with the frames untrimmed.

---

## AM. audio7

The one-shots are in one sprite: 5.700 s, 9 slices, 50 ms gaps, a single LAME 96 kbps mono encode. The manifest is the
sprite JSON. It holds `audioSprite {file, keys {key: [start, dur]}, dur, gap, ch, kbps}`, plus per-key
`inSprite: 'audio7'` and `files: []`. `Assets.sliceSprite` cuts each slice at dur + 30 ms.

There are two groups: `audioGroups.sfx_typewriter` (3 variants) and `audioGroups.sfx_coin_sack` (3 variants). The group
name itself is also playable and plays variant 1.

Levels use the audio1–6 rule: `volume = 10^((target − 2 − measured) / 20)`. One-shots are measured as max momentary
LUFS, the loop as integrated LUFS. Every key peaks at or below −1.5 dBFS, and the true peak is at or below −1.7.

| Key | Dur | Volume | Measured | Delivered / wanted | Notes |
|---|---|---|---|---|---|
| `sfx_typewriter` | 0.6 | 0.617 | Mmax −18.8 | −23.0 / −23.0 | 4 key clacks (onsets 0 / .13 / .26 / .38 s) |
| `sfx_typewriter_2` | 0.6 | 0.944 | −22.5 | −23.0 / −23.0 | another typist |
| `sfx_typewriter_3` | 0.6 | 0.447 | −16.0 | −23.0 / −23.0 | 4 keys + the F6 margin bell (1397.9 Hz, +1.3 cents) |
| `sfx_switch_clack` | 0.4 | **1.000** | −21.3 | −21.3 / −20.5 | grab, "철", "컥" + spring; volume clamped (0.8 dB under target, inside ±1 dB) |
| `sfx_wheel_squeal` | 1.2 | 0.071 | −5.0 | −28.0 / −28.0 | sung 1.89 kHz flange tone with wobble; LP 3.6 kHz, 0.0 % energy > 4 kHz; silent ends (−77 / −74 dB), so retriggering every 1.2 s loops it |
| `sfx_mailbox_flag` | 0.3 | 0.861 | −19.7 | −21.0 / −21.0 | tin clack + a C7 bell (2092.9 Hz) |
| `sfx_coin_sack` ×3 | 0.5 | 0.495 / 0.501 / 0.473 | −14.4 / −14.5 / −14.0 | −20.5 | "딸랑딸랑"; variants cross-correlate at 0.08–0.11 |
| `amb_office` | 24.0 loop | 0.422 | I −20.5 | −28.0 / −28.0 | see the loop details below |

`amb_office` is a separate file, `amb_office.mp3`, at 80 kbps.
- What it contains: two typists with a margin bell and carriage return, page turns, a pen, a chair creak, a cup, the
  kettle simmering and a 1 Hz wall-clock tick/tock.
- Loop data: `loopSamples` 1,058,400 and `duration` 24.0000000.
- The other fields are `mp3StartPad` 1105, `rotation` and `clockHz` 1.
- The loop seam scores hf 0.26 and d2 0.16; it fails at ≥ 1.
- Level: CONTRACT_V42 says −26 LUFS, which I treated as the target before the −2 dB headroom. The office is a small
  room, and this puts it 6.5 dB above `amb_bank`. It is documented in the key's notes.

All 9 slices pass these checks:
- Phone-loss model (500 Hz HP + 9 kHz LP): 0.0–4.0 dB, at or below 6 dB.
- Chromium decodeAudioData at 44.1 and 48 kHz: every `sliceSprite`-style cut lines up with ffmpeg within 1 ms.
- `amb_office` decodes to exactly 24.000 s.

---

## Tests

**`gen_chief_fx.py --check`: 0 errors, 0 warnings.** It checks:
- 3 files; atlas ≤ 1024 RGBA; contract sizes, frames, fps and anchors; frame names.
- No border clipping, except the pointer tips.
- Empty icon discs and a transparent halo centre; ring thickness; loop seams.
- Marker star ≥ 30 px; chevron heading probes (tip at +19 px opaque, tail −19 px clear).
- `nav_ring` grows and fades; the sparkle appears and fades; the glow has no hard edge.

**`gen_ui5.py --check`: 0 errors, 0 warnings.** It checks:
- 3 files; panels untrimmed; nineSlice values; the stretch centre is uniform along x.
- Status entries; 32 px readability (coverage and contrast); no border touch; page ≤ 1.5 MiB.

**`check_audio7.py`: OK, 0 errors, 0 warnings.** It checks:
- File list, keys and groups, and no clash with audio1–6.
- Sprite gaps, order and length; per-slice peak and true peak; contract durations.
- Leading silence, tail fades, effective level ±1 dB and phone loss.
- Typewriter onsets; bell tuning; squeal harshness and silent ends.
- Loop length, start pad and seam; coin-variant cross-correlation; Chromium decode.

**`tools/test/chief_fx_phaser.mjs`: OK, 0 problems.**
- **Static:** compared every key of the 3 new fragments against all 47 `assets/*/manifest.json`. 0 clashes after the
  `ui_icon_play_tab` rename.
- **Load page (1600 × 1900):** loaded chief_fx and ui5 alongside existing sets: `char_player`, chief2 `char_player_b`,
  `ui_icons`, `ui3_icons`, `ui4_icons`, `props_items`, and the snow, plaza, dirt and cobble textures.
  - All 98 sprite frames exist, with `sourceSize` equal to `frameSize`.
  - 6 `spr:<key>:play` anims with full frame counts; 35 textures and 40 sprites playing.
  - 9 nineslices at their requested sizes.
  - Audio decodes at 44.1 kHz. All 9 slices are cut like `sliceSprite` and are non-silent with a silent 30 ms tail;
    they and `amb_office` play.
- **Phone (390 × 844 @3x, 720 logical, k = 1.65), zoom 0.6, 1.0 and 1.2, day and night, plus 1.6 by day:**
  - Four real chiefs: one in a crowd of 20 villagers, one working with the gold ring (chop pulse), one at 읍 with the band
    and cheering (char_player_b), and one carrying logs with the navigator.
  - The navigator shows the chevron, 8 dots, the target ring, the badge with an item icon, and the ring notch.
  - The edge badge and a ui5 chip are in the UI scene.
  - Ring 45.5 CSS px at every zoom below 1.6, and 60.67 at 1.6; pin 22 CSS px.
  - Pins appear on all 4 chiefs at zoom 0.6, and only on the crowd chief (11 people within 160 px) at 1.0 and above.
  - No page errors and no 404s.
- **UI mock:** OfficePanel built from ui5 tabs, the chalk board with status rows, icons at 64 and 48 px, and the letter.

---

## Previews (`docs/previews/`)

- **chief_fx states:** `chief_fx_states_z06.png`, `_z10.png` and `_z12.png` show the real chief in every aura state
  (normal, working, 읍, 관망 + pin, carry + notch, night) on snow, cobble and plaza, in device px.
- **chief_fx scenes:** `chief_fx_crowd.png` is the chief in 20 townsfolk with the pin rule. `chief_fx_nav_mock.png` is
  the navigator on real ground. `chief_fx_sheet.png` is every frame.
- **chief_fx GIFs:** `chief_fx_chief_halo`, `_chief_halo_gold`, `_chief_glow_back`, `_chief_sparkle`, `_chief_marker`,
  `_nav_ring`, `_nav_chevron` and `_aura_live`.
- **Phaser captures:** `chief_fx_phaser_phone.png` (labelled montage), `chief_fx_phaser_z06_day.png` … `_z12_night.png`,
  `chief_fx_phaser_z16_day.png` and `chief_fx_phaser_sheet.png`.
- **ui5:** `ui5_icons.png` shows each icon at 96, 48 and 32 px on cream, dark HUD, a blue button and the night overlay,
  plus the dots. `ui5_panel_sources.png` and `ui5_panels.png` show the panels; `ui5_panels_full.png` is stretched to
  720 × 1100 with sample content. `ui5_phaser_phone.png` is the Phaser mock.
- **audio7:** `audio7_spectrograms.png` (40 Hz–12 kHz plus waveforms at the delivered level), `audio7_demo.mp3`
  (about 40 s: the office bed with typing, switch, squeal, mailbox and coins, then the station loop with town and
  audio6 reuse), `audio7_preview.html` and `audio7_report.txt`.

---

## Known issues

1. **chief_fx page is 2.80 MiB, not "≈ 2 MiB".** The contract frame counts at the contract sizes add up to 3.20 MiB
   untrimmed: the 20 halo frames alone are 1.41 MiB and the 8 glow frames 0.98 MiB. Trimming and maxrects bring it to
   2.80 MiB. Going lower would mean fewer halo or glow frames, or a smaller glow frame. The combined `v42_core` page
   (chief_fx + ui5) would be about 4.3 MiB.
2. **The gold ray ticks sit inside the ring.** The 192 × 96 frame leaves only 2–4 px outside the 184 × 92 tube, so the
   12 sun-ray ticks are detached triangles just inside it, pointing outward, rather than outside it.
3. **`ui_icon_play` is renamed** to `ui_icon_play_tab` (see AL). CODE-2 must use the new key for the settings tab 놀이.
4. **The `ui_letter` ruling stretches with the 9-slice.** The ruled lines sit in the stretched centre, so line spacing
   grows on tall letters. At 320 × 400 to 480 × 520 it still looks like ruled paper.
5. **`sfx_switch_clack` is volume-clamped at 1.0.** It is delivered at −21.3 against a wanted −20.5 (0.8 dB short,
   inside tolerance). A fuller body would give headroom.
6. **The 1 Hz wall clock does not dominate the high-frequency envelope.** In `amb_office`, the envelope
   autocorrelation peaks at 0.8 s, because the typing bursts dominate. The ticks are in the bed.
7. **Audio is judged only by measurement.** That covers loudness, spectra, tuning, onsets and decode. Nobody has
   listened in-game. The demo mp3 is there for that.
8. **CODE-2 integration is still to do.** Add the fragments `chief_fx`, `ui5` and `audio7`. Map the frame names
   (c0..c15 → `nav_chevron_00..15`, d0/d1 → `nav_dot_0/1`). Switch ChiefAura and Navigator to sprites playing
   `spr:<key>:play`.
