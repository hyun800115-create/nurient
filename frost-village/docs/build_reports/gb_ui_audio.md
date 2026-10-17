# Build report: gb_ui_audio (CONTRACT_GEUMBANG §AQ `assets/ui6/` + §AR `assets/audio8/`)

This job delivers the 금방 마켓 UI kit and the 금방 sounds. 금방 is an original brand: a gold-and-cream delivery service
that takes the village's surplus stock from the logistics centre to residents' front doors. It does not imitate any
real company. Both sets are done, and the polish pass for `gb_ui_audio_critique.md` is in (section 0).

| Check | Result |
|---|---|
| `python3 tools/fx/gen_ui6.py --check` | **0 errors, 0 warnings** (56 frames, 828 × 768 page = 2.426 MiB) |
| `python3 tools/audio/check_audio8.py` | **RESULT: OK (0 errors, 0 warnings)**, 11 slices, Chromium decode at 44.1 and 48 kHz |
| `node tools/test/ui6_phaser.mjs` (Phaser 3.90, headless Chromium) | **OK - 0 problems**: 0 key clashes, 56 frames, 4 anims, 10 NineSlices, 11 audio slices, every size / overlap gate |

Nothing outside the job's own paths was changed: no other assets, no `src/**`, no `index.html`, no other jobs' tools.
Nothing was committed to git.

## 0. Polish pass (critique `docs/build_reports/gb_ui_audio_critique.md`)

Every finding was reproduced first (the critic's own probes in its scratch folder, plus my look-dev sheets), then fixed
inside this job's paths. Before / after numbers come from the same probes.

| Finding | Status | What changed |
|---|---|---|
| **H1** mascot runs backwards on app open | **fixed** | The 4 `run` frames are re-rendered **facing left** (drawn on a mirrored sample grid, so the bevels, gloss and eye highlights stay lit from the house upper-left sun). The manifest now says `runFacing: left`, `mirrorSafe: true` (setFlipX allowed to run right) and carries `runIn` = `appLayout.header.mascotRunIn`: start at (763, 174) behind the screen's right edge, **masked to the screen**, under the close button, 600 ms **Linear** to (540, 174), then `idle` at once. The Phaser test drives exactly that and gates it: the first frame is fully hidden (visible left 732 ≥ screen right 699), the last frame is `idle_0` at x 540. `docs/previews/ui6_mascot_runin.gif` shows it frame by frame. |
| **H2** 띵동 bell covers the people | **fixed** | New rule in `sprites.fx_gb_bell.placement` and the note: size **S = min(24 CSS, 0.7 × the courier on screen)** = min(24 / cssPerWorld, 56) world px; centre x = feet.x + bellPoint.x + 10·sign; its **bottom 4 px above the highest head top** under it (`headTopY` −86). The test places it over a **real** geumbangfolk `gb_driver` (`ring_doorbell` NE, frame 2) and two real residents, measures every head box from the dolls' own head layers and fails on any overlap: 0 overlaps at zoom 0.6 / 1.0 / 1.2 / 1.6, day and night, 390 and 360 phones. Sizes: 18.2 CSS at 0.6 (courier 26), 24 CSS from 1.0 up (courier 43–69). Manifest note and report now say the same thing. |
| **M1** seven icons too light for the house set | **fixed** | The 7 icons (and `deal`, which was also under 0.2) are redrawn with the house icon weight: a dark warm ink edge on cream paper (`#5E4728`), deeper goldDark bands / seals / trays, mid-navy line work, a charcoal viewfinder, a deep-orange star; the mark icon uses `mark(ink=True)` (dark outline round the sticker, deeper rim - the same mark design). Share of 32 px pixels at ≥ 3:1 against the cream fill: median **0.10 → 0.33** (ui3 0.28, ui5 0.39); lightest now van 0.25. New `--check` rule: every icon ≥ 0.20. |
| **M2** HUD chip 1.6× its v4.2 neighbours, toast on the hint pill | **fixed** | `appLayout.hud`: the chip is the **업무 chip's size and type** (172 × 50 logical at (28, 445), right under it; 20 px text, 36 px icon) with an invisible **88-tall hit rect** (44 CSS on a 360 phone, 47.7 on 390); the toast is built 64 tall in the **hint pill's place** and hides the hint while it shows. The test now draws the real v4.2 left column (coin bar, hint pill, 32/32, 정기 납품, 업무, settings) and gates overlaps: 0. The edge-badge clamp is written down for the code owner (`hud.edgeBadge`: UIv42 clamps to y ≥ 480; with the 금방 chip it should become 540). |
| **M3** 새벽배송 icon too close to 샛별배송 | **fixed** | The sky is now blue → clear blue → peach → gold (no violet), the window frame is warm wood ink, the white star became a small gold 금방 sparkle; the catalog's lavender yarn ball is now green. New `--check` hue guard: no sprite with ≥ 20 % of its pixels lilac / violet (hue 255–300°, lightness 0.5–0.85). |
| L1 speaker slot + camera stretched in the phone 9-slice | fixed | The top bezel is plain; the slot and camera are a new fixed frame `ui_gb_phone_notch` (80 × 14) drawn at `appLayout.notch` (360, 15.5). `--check` now also requires the top / bottom edge strips of every 9-slice to be uniform along x. |
| L2 0 px packing, hairline bleed | fixed | Packer rule: at least **1 transparent texel round every frame rect** (MaxRects pad 1, trimmed frames cut tight), plus a 1 px **extrude** for full-bleed frames (header, tracker lines). `--check` verifies on the written page that every texel just outside a frame is transparent or its own extrude. The page got smaller: 916 × 710 = 2.481 MiB → **828 × 768 = 2.426 MiB**. The phone source stays 360 × 640 (no contract change needed). |
| L3 stand-ins v4.3 does not load | fixed | audio8 `standIn` keys are now only keys `src/core/Assets.js` loads (FRAGMENTS + LATE_FRAGMENTS, USED_ONLY applied): `sfx_pickup` (with `standInPlay` notes for a two-note 띵동 / chime), `sfx_drop`, `sfx_coin`, `sfx_car_honk_1`, `sfx_mailbox_flag`; the plan's audio6 picks stay as `standInIfShipped`. `check_audio8.py` reads Assets.js and fails on an unloaded stand-in. Icon `replaces`: `ui4 ui_icon_box` → ui3 `ui_icon_request` / ui5 `ui_icon_depot` / ui3 `ui_icon_delivery`. (Note: the critique's `sfx_hotel_bell` is audio5, which `USED_ONLY` limits to `amb_sea_waves`, so it is not loaded either.) |
| L4 locker icon unlike the prop | fixed | Redrawn as the `gb_locker_a` look: gold frame, cream top panel with the mark, **3 × 4 small slate-navy doors**, one open with a parcel. |
| L5 scarf hides the "o" mouth, reads as a belt | fixed (scarf, mouth); idle frames: won't fix | Face moved up; the "o" (calling 금방!) mouth shows in idle and run; the scarf is a draped band under the mouth with a knot, a **front tail hanging over the box edge** and cream fringe stripes on the tails. The idle stays 2 frames (§AQ fixes it at 2 f). |
| L6 bell gone before the dong | fixed | `placement.dong`: on the 0.33 s cue play frames 1–3 again, hold frame 3 and fade over 0.32 s → the bell lasts the whole 0.9 s chime. `docs/previews/ui6_phaser_bell_door.gif` shows the timeline over the real courier. |
| L7 thump quiet on a phone | fixed | `sfx_gb_thump(_2)` re-rendered with a cardboard "tock" at 560 / 470 Hz, a lighter body thud and a rounded 1 ms knock spike: phone-speaker loss **4.0 / 4.8 → 1.8 / 2.4 dB**, manifest volume **1.000 / 0.989 → 0.804 / 0.684** (headroom), effective level unchanged at −22 LUFS, body < 250 Hz 11 / 14 %. |
| L8 doc / evidence inconsistencies | fixed | Logo note now says x 44, y 46, scale 1.0 (= `appLayout.header.logo`); bell placement is one rule in manifest + report; `ui6_tracker.png` shows all five rows in both languages; the test's night is the DayClock overlay (an Image, MULTIPLY, darkness 0.45), not a Shape. |
| L9 small / pale labels | fixed | English tab and tracker words 24 → **26** logical (13 CSS on 360, 14.1 on 390); inactive / secondary words `#8A7A62` / `#807462` → **`#6B5D48`** (≥ 4.5 : 1 on cream); `textMinCss` 12 → 13 and gated. |
| L10 Jua (BM 주아) in the wordmark | won't fix (note) | Jua is the game's house display font (title, nameplates, van roof sign), OFL-licensed. Flagged to the designer in the Korean summary; if they want, only the logo can move to another rounded face. |

### 디자이너용 요약 (쉬운 말)

- **금방이가 이제 앞으로 달려 들어와요.** 앱을 열면 화면 오른쪽 끝 뒤에서 왼쪽을 보고 달려 나와 (닫기 단추 밑으로 지나가요) 제자리에 서서 손을
  흔들어요. 화면 밖 테두리 위에 그려지지 않고, 발이 미끄러지지 않게 일정한 속도로 달려요. (`ui6_mascot_runin.gif`)
- **"띵동" 종이 작아지고 사람 머리 위로 올라갔어요.** 화면을 멀리 봐도 기사님보다 크지 않게 (최대 24 CSS, 기사님 키의 0.7배까지) 줄였고,
  누구의 얼굴도 가리지 않게 머리 위, 문 쪽에 떠요. "동" 소리가 끝날 때까지 종이 한 번 더 흔들리고 천천히 사라져요. (`ui6_phaser_bell_door.gif`)
- **아이콘이 진해졌어요.** 크림색 탭과 칩 위에서도 흐리지 않게 테두리를 진하게, 색을 한 톤 깊게 바꿨어요. 이제 기존 게임 아이콘과 한 가족처럼
  보여요.
- **"배달 중 3" 금방 칩**은 바로 위 "업무" 칩과 같은 크기예요 (누르는 영역은 손가락 크기 그대로). 알림(토스트)은 "손님이 낸 코인을 주우세요"
  자리에 잠깐 나타나요.
- **새벽배송 아이콘**은 보라색 대신 파란 새벽 하늘이 살구색, 금색으로 밝아지는 그림이에요 (샛별배송과 겹치지 않게).
- 휴대폰 위쪽 스피커 구멍과 카메라가 더 이상 늘어나지 않고, 보관함 아이콘은 실제 보관함처럼 작은 남색 문 12칸이에요. 금방이의 "o" 입이 보이고
  목도리는 허리띠가 아니라 매듭과 늘어진 끝이 있는 목도리예요.
- 상자 내려놓는 소리("툭")는 휴대폰 스피커에서도 잘 들리게 바꿨어요.
- 한 가지 확인: "금방" 로고 글씨체(주아)는 게임 전체의 제목 글씨체와 같아요. 배민 글씨체라는 점이 마음에 걸리시면 로고만 다른 둥근 글씨체로
  바꿀 수 있어요.

## 1. Delivered files

| Path | Size | What |
|---|---|---|
| `frost-village/assets/ui6/ui6_gb.png` | 360,876 B | one RGBA atlas page, 828 × 768 (2.426 MiB in memory) |
| `frost-village/assets/ui6/ui6_gb.json` | 9,607 B | Phaser JSON-hash atlas (56 frames) |
| `frost-village/assets/ui6/manifest.json` | 31,779 B | `ui6` fragment: sprites, anims, `nineSlice`, brand, `pagePlan`, `appLayout` (+ `hud`, `notch`, `mascotRunIn`), `codeFallback` |
| `frost-village/assets/audio8/audio8_sprite.mp3` | 82,442 B | one mono 96 kbps sprite, 6.80 s, 11 slices, 50 ms gaps |
| `frost-village/assets/audio8/manifest.json` | 7,584 B | `audio8` fragment: `audioSprite`, per-key volume / cues / standIn (+ `standInPlay`, `standInIfShipped`), `audioGroups` |

These tools built them (all this job's own files; every other tool was only read):

- `frost-village/tools/fx/gen_ui6.py`
- `frost-village/tools/audio/sfx8.py`, `build_audio8.py`, `check_audio8.py`
- `frost-village/tools/test/ui6_phaser.mjs`

**Budgets (§AS):**

| Set | Files (source / shipped) | Size limit | Delivered |
|---|---|---|---|
| AQ | 3 / 2 | ≤ 2.5 MiB, atlas ≤ 1024² | 3 / 2, 2.426 MiB, 828 × 768 |
| AR | 2 / 2 | — | 2 / 2, 90 KB in total |

## 2. §AQ `ui6`: the 금방 UI kit (56 frames, 46 sprite keys)

**Style.** Procedural signed-distance drawing in the house "soft toy" style of ui to ui5: a dark tinted outline, a
top-to-bottom gradient with a rounded bevel lit from the upper left, a gloss and one soft navy drop shadow. Brand
colours: gold #F2B33D, goldDark #D9962A, cream #F4EDE0, charcoal #3B3F52, navy #2B4F7E. Icons use the house icon
weight (polish M1): cream paper has a dark warm ink edge, gold parts a deeper goldDark, line work a mid navy.

**The mark 금방이.** A gold disc with a goldDark rim holds a face-on cream parcel with navy dot eyes, pink cheeks, an "o"
mouth and a cream four-point sparkle; the same mark as on the vans and buildings in `assets/geumbang`, readable at
24 px. `ui_gb_mark` (logo use) is unchanged; `ui_icon_gb` is the same mark at icon weight. No banned motifs.

**Icons** (14, each 96 × 96, no text; weight = share of 32 px pixels at ≥ 3:1 against the cream fill, gate ≥ 0.20):

| Key | Picture | Weight | Code stand-in |
|---|---|---|---|
| `ui_icon_gb` | the mark (icon weight) | 0.33 | ui5 `ui_icon_depot` |
| `ui_icon_gb_order` | order slip, goldDark band, navy lines, check seal | 0.31 | ui3 `ui_icon_request` |
| `ui_icon_gb_van` | gold van with the mark | 0.25 | ui3 `ui_icon_delivery` |
| `ui_icon_gb_sled` | husky sled with a parcel | 0.30 | ui5 `ui_icon_sleigh` |
| `ui_icon_gb_locker` | gold locker, 3 × 4 slate doors, one open | 0.43 | ui5 `ui_icon_depot` |
| `ui_icon_gb_deal` | goldDark price tag with a cream star | 0.28 | `ui_icon_coin` |
| `ui_icon_gb_review` | speech bubble, deep-gold star, pink heart | 0.28 | ui3 `ui_icon_fame` |
| `ui_icon_gb_today` | calendar, goldDark band, charcoal rings, full-gold sun | 0.31 | ui3 `ui_icon_day` |
| `ui_icon_gb_catalog` | 2 × 2 products on a goldDark tray | 0.35 | ui5 `ui_icon_inventory` |
| `ui_icon_gb_crew` | courier in a navy cap | 0.36 | ui5 `ui_icon_staff` |
| `ui_icon_gb_dawn` | blue-to-peach dawn, moon, gold sparkle, sunrise | 0.36 | ui3 `ui_icon_night` |
| `ui_icon_gb_doorstep` | blue door, parcel on the snowy step | 0.36 | ui3 `ui_icon_delivery` |
| `ui_icon_gb_cart` | cart carrying a 금방 parcel | 0.34 | ui3 `ui_icon_request` |
| `ui_icon_gb_follow` | charcoal viewfinder round a parcel | 0.50 | ui5 `ui_icon_binoculars` |

**Tracker.** `ui_gb_step_{order,pick,pack,go,done}_{on,off}` 64², `ui_gb_dot_{off,on,now}` 28², `ui_gb_line_{off,on}`
32 × 8 (untrimmed, extruded), `ui_gb_star_{full,empty}` 32². Words by the game: 주문 / 고르기 / 포장 / 배달 중 / 도착,
Ordered / Picking / Packing / On the way / Arrived.

**Logos.** The only baked text (`bakedText` = these two keys): `ui_gb_logo_ko` 192 × 72 (mark + "금방", Jua),
`ui_gb_logo_en` 250 × 72 (mark + "Geumbang", Fredoka Bold), `ui_gb_mark` 128². Header placement: top-left (44, 46),
scale 1.0.

**Mascot 금방이.** A running parcel with a navy scarf under its "o" mouth (knot, a front tail over the box edge, cream
fringe stripes). 128², anchor [0.5, 0.9], feet on the anchor in every frame.

| Animation | Frames | Speed | Repeat | Notes |
|---|---|---|---|---|
| `idle` | 2 | 3 fps | loops | stands, waves, calls (o mouth) |
| `run` | 4 | 8 fps | loops | **faces left** (`runFacing`), leans 8°, snow puffs; `mirrorSafe` (setFlipX to run right) |
| `bow` | 2 | 3 fps | once | face-on bow, happy eyes |

App open: `runIn` = from (763, 174) behind the right edge, masked to the screen, under the close button, 600 ms
Linear to (540, 174), then idle (bow on the first open of the day).

**9-slices** (untrimmed, `nineSlice` + `contentInset`; every edge strip uniform along its stretch axis):

| Key | Size | Margins (l / t / r / b) | Notes |
|---|---|---|---|
| `ui_gb_phone` | 360 × 640 | 56 / 64 / 56 / 64 | `screenRect` [21, 30, 318, 580], `screenRadius` 30; plain top bezel |
| `ui_gb_header` | 320 × 128 | 40 / 36 / 40 / 28 | full-bleed (extruded in the atlas) |
| `ui_gb_tab` / `_on` | 144 × 64 | 26 / 22 / 26 / 22 | `minHeight` 64 |
| `ui_gb_card` | 320 × 160 | 28 / 24 / 24 / 28 | gold left strip |
| `ui_gb_chip` | 200 × 64 | 32 / 16 / 32 / 16 | `minHeight` 64, `ui_chip` rules |
| `ui_gb_toast` | 300 × 64 | 32 / 22 / 22 / 26 | |
| `ui_gb_ribbon` | 160 × 48 | 24 / 14 / 24 / 14 | `minHeight` 48, blank |

**Fixed frames and FX.** `ui_gb_photo` 176 × 136 (`photoRect` [24, 16, 128, 80] transparent); `ui_gb_phone_notch`
80 × 14 (new, polish L1: speaker slot + camera at `appLayout.notch`); `fx_gb_bell` 4 × 64², 12 fps once, with
`placement` (size, position, `dong` replay; section 7).

**Page plan.** `resident` 20 frames 0.475 MiB (the 14 icons, chip, toast, 4 bell frames); `transientApp` 36 frames
1.857 MiB (phone, notch, header, tabs, cards, tracker, logos, mascot, photo, ribbon).

**Atlas rule (polish L2).** Every frame rect has ≥ 1 transparent texel round it; trimmed frames are cut tight; the
full-bleed header and tracker lines carry a 1 px extrude. `--check` proves it on the written page.

**Brand checks** (`gen_ui6.py --check`, `docs/previews/ui6_brand.png`): courier colour pairs ΔE2000 ≥ 15 (closest:
mascot run vs Kurly 20.8); navy ≤ 15 % per sprite (highest 11.7 %, `ui_gb_logo_ko`); mark mirror difference ≤ 6 %
(0.24 % / 0.20 %); text only in the two logo keys; **new**: no lilac / violet field (hue guard) and icon weight ≥ 0.20.
Gold is outlined in dark amber ink, never black or chocolate brown.

## 3. Suggested app layout and HUD (`manifest.conventions.appLayout`)

The app panel is 720 × 1100 logical px and fills the viewport width (1 CSS px = 2 logical on a 360 phone, 1.85 on
390). Every minimum holds on both widths and `gen_ui6.py --check` enforces it.

| Element | Logical | 360 CSS phone | 390 CSS phone |
|---|---|---|---|
| tab height (64-tall 9-slice × 1.375) | 88 | 44 | 47.7 |
| close button (radius 44) | 88 | 44 | 47.7 |
| 따라가기 / Follow button | 88 | 44 | 47.7 |
| catalog sell-toggle hit row | 88 | 44 | 47.7 |
| body text | 30 | 15 | 16.3 |
| secondary text | 28 | 14 | 15.2 |
| smallest text (English tab / tracker words) | 26 | 13 | 14.1 |

Colours: active tab word / current step navy `#2B4F7E`, done steps `#3B3F52`, inactive / secondary `#6B5D48`.

**HUD** (`appLayout.hud`, v4.2 UI scene logical px):

| Piece | Rect | CSS on 390 | Notes |
|---|---|---|---|
| 금방 chip | (28, 445) 172 × 50, scale 50/64 | 93 × 27 (= 업무 chip height) | icon 36 at +27, text 20 px at +52, gold dot; hit rect (28, 440) 172 × 88 = 47.7 CSS |
| toast | centred (361, 148), 64 tall, ≤ 554 wide | 220 × 34.7 for "띵동! 새 주문 · 민지네 · 빵 3" | hides the v4.2 hint pill while it shows (3 s) |
| v42 (reference) | coin bar, hint pill, 32/32, 정기 납품, 업무, settings | | the test draws them and gates overlaps (0) |

Note for the code owner: `UIv42.updateEdge` clamps the left edge badge to y ≥ 480; with the 금방 chip the left column
ends at y 528, so that clamp should become 540 while the chip shows.

## 4. §AR `audio8`: 금방 sounds (one sprite, 11 keys)

All synthesised; no voice, no real company's jingle or chime; "금-방!" is an original F5 → G5 → C6 figure. Levels follow
the audio1–7 rule (volume = 10^((target − 2 − measured max momentary LUFS) / 20)); every slice peaks at −1.7 to
−2.0 dBFS.

| Key | Dur | Volume | Effective | Content | Phone loss | Stand-in (loaded in v4.3) |
|---|---|---|---|---|---|---|
| `sfx_gb_doorbell` | 0.90 | 0.226 | −20.5 | G5 784.4 → E5 659.2, cues ding 0 / dong 0.33 | 0.3 dB | `sfx_pickup` ×2 (rate 1.0, 0.794 at 0.33 s) |
| `sfx_gb_doorbell_2` | 0.90 | 0.275 | −20.5 | A5 880.3 → F♯5 740.0 | 0.1 | `sfx_pickup` ×2 (1.122, 0.891) |
| `sfx_gb_horn` | 0.50 | 0.292 | −21.0 | soft double toy beep (C5 + E5) | 1.2 | `sfx_car_honk_1` (audio3) |
| `sfx_gb_chime` | 0.45 | 0.209 | −22.0 | C6 1047.0 → F6 1396.5 | 0.0 | `sfx_pickup` ×2 (2.0, 2.67 at 0.11 s) |
| `sfx_gb_thump` | 0.35 | **0.804** | −22.0 | cardboard tock 560 Hz + knock + light thud + snow | **1.8** | `sfx_drop` |
| `sfx_gb_thump_2` | 0.35 | **0.684** | −22.0 | heavier box, tock 470 Hz, small scrape | **2.4** | `sfx_drop` |
| `sfx_gb_jingle` | 1.20 | 0.331 | −19.5 | F5 / G5 / C6, onsets 0 / 0.13 / 0.28 | 0.1 | `sfx_coin` |
| `sfx_gb_tape` | 0.50 | 0.275 | −22.5 | stick-slip 찌익, snip 0.37 | 0.2 | `sfx_drop` |
| `sfx_gb_tape_2` | 0.50 | 0.302 | −22.5 | quicker pull, snip 0.30 | 0.2 | `sfx_drop` |
| `sfx_gb_scan` | 0.15 | 0.168 | −25.0 | soft 삑, A6 1760 Hz | 0.0 | `sfx_pickup` (rate 2.38) |
| `sfx_gb_locker` | 0.40 | 0.355 | −21.5 | click + pop, A5 → D6 | 0.2 | `sfx_mailbox_flag` (audio7) |

Pitches within 2.4 cents; every phone loss within the 6 dB limit (thumps now ≤ 2.4 dB). Groups `sfx_gb_doorbell`,
`sfx_gb_thump`, `sfx_gb_tape` pick a random variant, never the same twice in a row. `standInIfShipped` keeps the plan's
audio6 picks (`sfx_ticket_chime`, `sfx_box_drop`) for the day audio6 loads. Slices cut like `Assets.sliceSprite` line
up with ffmpeg within 1 ms at 44.1 and 48 kHz. Demo: bed −34.5 LUFS, sound layer −24.7, mix −28.3, peak −6.1 dBFS.

## 5. Phaser 3.90 load test (`tools/test/ui6_phaser.mjs`)

- **Load page:** `ui6`, `audio8`, `ui5`, `ui3`, `ui`, `props_items` through `src/core/Assets.js` (`mergeLate`, `sprite`,
  `image`, `has`, `nine`, `spriteAnims`, `sliceSprite('audio8')` + group play). 0 key clashes across every fragment,
  frame sizes = sourceSizes, 9-slices untrimmed and building at app sizes.
- **HUD + world** (390 × 844 @3 at zoom 0.6 / 1.0 / 1.2 day + night (DayClock Image overlay) and 1.6 day; 360 × 640
  @2 at 1.0, English, night, with the hint pill): a townhouse, a **real 금방 courier** (geumbangfolk `gb_driver`,
  `ring_doorbell` NE frame 2) and two real residents, the bell by `placement`, the 금방 van + roof sign, the round sign,
  an order bubble; the real v4.2 left column + the 금방 chip + the toast. Gates: bell = min(24, 0.7 × courier) CSS
  (18.2 / 24 / 24 / 24), no head under the bell, courier head top ≥ `headTopY`, chip height = 업무 chip, hit ≥ 44 CSS,
  toast ≤ 300 × 48 CSS, 0 overlaps with the v4.2 pieces.
- **App** (real NineSlices from `appLayout`, the notch, a render-texture photo under `ui_gb_photo`): 오늘 / 주문 / 상품 ko
  by day, 주문 en at night, 주문 on 360 × 640. Tabs 47.7 / 44 CSS, close 47.7 / 44, button 47.7 / 44, body 16.3 / 15,
  smallest 14.1 (en) / 14 (360). Run-in gates: hidden at t 0, `idle` at x 540 at the end.
- **GIFs:** `ui6_mascot_runin.gif` (0–900 ms at 24 fps over the header), `ui6_phaser_bell_door.gif` (the ding + dong
  timeline, 0–0.96 s, over the real courier).

## 6. Previews (all in `frost-village/docs/previews/`)

| File | Shows |
|---|---|
| `ui6_icons.png` | the 14 icons at 96 / 48 / 32 / 24 px on cream, gold, dark, snow + night |
| `ui6_tracker.png` | steps, dots, lines, stars; the tracker at all 5 stages in ko and en |
| `ui6_logos.png` | both logos and the mark on gold, cream, dark |
| `ui6_mascot.png`, `ui6_mascot.gif` | idle, run (facing left), bow |
| `ui6_mascot_runin.gif` | **new** - the app-open run-in in Phaser |
| `ui6_fx_bell.gif`, `ui6_phaser_bell_door.gif` | the bell frames; **new** - the ding + dong timeline at the door |
| `ui6_panels.png` | 9-slices with margins / insets, the photo frame, the notch |
| `ui6_app.png` | four app mock-ups at 720 × 1100 |
| `ui6_hud.png` | the HUD at phone scale: v4.2 column + 금방 chip + toast, order bubble, bell size vs a courier at 3 zooms |
| `ui6_brand.png` | palette, mark mirror, navy share, courier ΔE table |
| `ui6_phaser_sheet.png` | every frame next to the house icons |
| `ui6_phaser_z06/z10/z12_{day,night}.png`, `ui6_phaser_z16_day.png`, `ui6_phaser_z10_night_360.png`, `ui6_phaser_phone.png` | HUD + world captures and montage |
| `ui6_phaser_app_*.png`, `ui6_phaser_app.png` | app captures and montage |
| `audio8_spectrograms.png`, `audio8_demo.mp3`, `audio8_preview.html`, `audio8_report.txt` | the sounds |

## 7. Notes for the game code (owned by the v4.2 workflow)

- **Loading.** `Assets.mergeLate('ui6' | 'audio8', manifest)`; audio plays once `sliceSprite('audio8')` ran; until then
  play `standIn` (or the `standInPlay` notes).
- **Page plan.** Keep `pagePlan.resident` loaded with the HUD; acquire `transientApp` only while the app is open.
- **9-slices.** NineSlice with the manifest margins; tabs / Follow button are 64-tall slices scaled by
  `appLayout.tabs.scale` / `button.scale` (1.375). Draw `ui_gb_phone_notch` at `appLayout.notch` over the phone.
- **HUD.** `appLayout.hud.chip` / `toast` (sizes above); hide the hint pill while the toast shows; raise the edge-badge
  clamp to 540 while the 금방 chip shows.
- **Mascot.** `sprites.ui_gb_mascot.runIn`: start masked behind the screen's right edge, Linear 600 ms, then idle; draw
  it under the close button. `setFlipX(true)` is allowed to run right.
- **Bell.** `sprites.fx_gb_bell.placement`: S = min(24 / cssPerWorld, 56) world px (cssPerWorld = camera zoom ×
  viewport CSS width / 720), `setScale(S / 64)`; x = feet.x + bellPoint.x + 10 · sign(bellPoint.x); bottom = the
  highest head top among the dolls under it (feet.y − 86) − 4; centre y = bottom − 0.4 S; on the dong cue (0.33 s) play
  frames 1–3 again, hold frame 3, fade 0.32 s, destroy at 0.9 s.
- **Labels.** Pretendard; only the two logo keys carry letters.

## 8. Known limits and deviations

- **Art drawn a little inside its frame** to fit the page budget: icons 94 %, mascot 0.78, step badges r 23.5 in 64,
  logos 72 tall (max 96), bell 0.86.
- **Idle is 2 frames** (§AQ). The critique's optional 3–4 frame idle was not done.
- **Wordmark font.** Jua stays (house display font); see L10.
- **Head-top constant.** `placement.headTopY` −86 is the measured adult courier / resident head top in `ring_doorbell`
  / `idle` (−85 / −86); the test re-measures it every run and fails if a doll's head rises above it.
- **Audio judged by measurement only** (loudness, pitch, onset, spectrum, decode, phone model, spectrograms); no
  listening is possible here.
- **Tool names differ from §AS** (`gen_ui6.py --check`, `check_audio8.py`, `ui6_phaser.mjs`), as the job's path list
  allows.
- **Layout is a suggestion.** `appLayout` and the HUD layout are proposals for the game UI code.

## 9. How to rebuild and check

```
cd frost-village
export FV_UI6_CACHE=<scratch>/cache  FV_AUDIO8_CACHE=<scratch>/audio_cache     # optional render caches
nice -n 10 python3 tools/fx/gen_ui6.py             # atlas + manifest + previews + check (about 4 min uncached)
nice -n 10 python3 tools/fx/gen_ui6.py --check
nice -n 10 python3 tools/audio/build_audio8.py     # render, sprite, manifest, then check_audio8
nice -n 10 python3 tools/audio/check_audio8.py
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers nice -n 10 node tools/test/ui6_phaser.mjs   # ~15 min on the shared CPU
```
