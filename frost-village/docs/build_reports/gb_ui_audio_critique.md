# Critique: gb_ui_audio (금방 app UI `assets/ui6` + 금방 sounds `assets/audio8`)

This is an adversarial art review of the ui6 and audio8 fragments. It checks them against `docs/CONTRACT_GEUMBANG.md`
§AQ, §AR and §AS, and against `docs/geumbang_plan.md` §6, §7 and §10. The review was read-only. Nothing in the repo
was changed except this file. The sha1 of every reviewed file (assets, tools, previews, build report) was the same
before and after the review.

Every probe, harness and capture is in the critic scratch folder
`/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/geumbang_gb_ui_audio_review/`.
Below it is written `$C`.

## Verdict: **polish** (0 critical · 2 high · 3 medium · 10 low)

The kit is good work, and none of the problems below needs a new art direction.

**What works:**
- **The mark.** 금방이 is the same mark as on the vans, signs and lockers in `assets/geumbang`. It is symmetric (0.2 %
  mirror difference) and reads at 24 px.
- **The logos.** Both logos read at once on gold, cream and dark backgrounds.
- **The tracker** is clear and charming: icon plus word, with a clear on/off state.
- **The 9-slices** have no seams, even at fractional sizes and scales. No frame has a light halo.
- **Text** appears only in the two logo keys.
- **The sounds** are in tune, sit at house levels, decode correctly and contain nothing that copies a real brand.
- **Budgets** are met: 2.481 of 2.5 MiB, and 3 / 2 files.

The two highs are both about the two moments the designer will watch first.

- **H1: the mascot runs backwards every time the app opens.** The manifest tells the code to tween 금방이 in from the
  right edge of the header. The run frames face right, and the mascot may "never be mirrored". So it moonwalks to the
  left, and it starts outside the phone screen.
- **H2: the 띵동 bell hides the people at the door.** The manifest asks for a constant 40 CSS px bell, about 40 world
  px above the courier's `bellPoint`. At zoom 0.6–1.0 that bell is as big as the courier or bigger. It covers the
  courier's head, and its ring arcs cut across the resident's face.

The mediums:
- The icons are much lighter in weight than the house ui5 and ui3 icons, so on cream tabs and chips they wash out.
- The plan-size HUD chip is 1.6× the height of the v4.2 chips next to it.
- The 새벽배송 (dawn delivery) icon uses a violet sky, a moon and a star. The plan bans purple-and-white and the word
  샛별배송, and this icon is very close to that look.

## 디자이너용 요약 (쉬운 말)

**좋은 점**
- 금방이 마크(금색 동그라미 속 크림색 상자 얼굴)가 밴, 간판, 보관함에 있는 마크와 똑같아요. 좌우가 똑같아서 뒤집혀도 괜찮고,
  아주 작게(24픽셀) 줄여도 얼굴로 보여요.
- "금방" 로고와 "Geumbang" 로고가 금색, 크림색, 어두운 배경 어디서나 또렷하게 읽혀요. 쿠팡, 배민, 컬리 같은 실제 회사의 색이나
  모양을 따라 한 것은 없어요.
- 주문 → 고르기 → 포장 → 배달 중 → 도착 단계 표시가 그림과 글자로 같이 나와서 한눈에 보여요.
- 휴대폰 화면 틀, 카드, 탭, 리본 같은 판들은 늘리거나 줄여도 이음새가 안 보이고, 테두리에 하얀 얼룩도 없어요.
- 소리 11개(띵동 초인종 2가지, 경적, 앱 알림, 상자 내려놓는 소리 2가지, "금-방!" 로고송, 테이프 찌익 2가지, 스캔 삑, 보관함)는
  음이 정확하고, 다른 효과음들과 크기가 잘 맞아요. 실제 회사 효과음을 흉내 낸 것도 없어요.

**꼭 고칠 점**
1. **금방이 마스코트가 뒷걸음질쳐요.** 앱을 열 때 금방이가 오른쪽 끝에서 달려 들어와야 하는데, 그림은 오른쪽을 보고 달리는
   모습이라 실제로는 뒤로 미끄러져 들어와요. 처음 몇 순간은 휴대폰 화면 밖(테두리 위)에 그려지기도 해요.
2. **"띵동" 종이 사람 얼굴을 가려요.** 화면을 멀리(0.6~1.0배) 볼 때 종 그림이 기사님보다 크거나 비슷해서, 기사님 머리와 문을 연
   주민 얼굴을 덮어요. 그리고 종이 "띵"에서 사라져서, 길게 울리는 "동"에는 그림이 없어요.

**그 밖에 보이는 것들**
- 앱 아이콘 여러 개(주문서, 달력, 상품, 후기, 따라가기, 문 앞, 금방이 마크)가 기존 게임 아이콘보다 색이 연하고 테두리가 얇아서,
  크림색 탭과 버튼 위에서는 흐릿하게 보여요.
- 화면 왼쪽의 "배달 중 3" 금방 칩이 바로 위의 "업무" 칩보다 1.6배 커서, 다른 칩들과 한 세트로 안 보이고 혼자 튀어요.
- 새벽배송 아이콘이 보라색 밤하늘에 달과 별이라, 마켓컬리의 "샛별배송"이 떠올라요. 남색에서 살구색으로 밝아지는 새벽 하늘이
  더 안전해요.
- 휴대폰 틀 위쪽의 스피커 구멍이 길게 늘어나고, 카메라 동그라미가 납작한 타원이 돼요.
- 보관함 아이콘은 큰 하늘색 문 8칸인데, 실제 마을에 놓이는 보관함은 작은 남색 문 12칸이에요.
- 금방이는 마크와 같은 "o" 입이 목도리에 가려서 안 보이고, 목도리가 허리띠처럼 보여요.

---

## How it was tested

**Static checks**
- I read §AQ, §AR and §AS, plan §6, §7 and §10, the player plan §4 and §9, the build report and both manifests.
- I re-ran `python3 tools/fx/gen_ui6.py --check`. The `--check` path only reads. Result: 0 errors, 0 warnings.
- I re-ran `python3 tools/audio/check_audio8.py`. Result: OK, 0 errors, 0 warnings.
- Before and after, I compared sha1s of the 41 reviewed files: `$C/before.sha1`. Nothing changed.

**Pixel probes (`$C/tools/`)**

| Script | What it does |
|---|---|
| `frames.py` | every frame at its sourceSize, plus atlas padding / bleed |
| `nine.py` | which 9-slice regions are not uniform along their stretch axis |
| `weight.py` | icon ink weight and contrast against the cream chip / tab fill, ui6 vs ui5 and ui3 |
| (inline) | halo probe, mark vs the geumbang sign, locker icon vs the `gb_locker_a` prop, dominant colours of brand-sensitive icons, mascot extents vs anchor |

**Audio probes**
- `aud.py`: head, tail, click, DC, gap bleed and band energy for every slice.
- `lufs2.py`: ffmpeg ebur128, full range and through a phone-speaker model, against the neighbour sounds the game
  plays in the same moments.
- I re-measured the thump with the builder's own `ffmpeg_tools.ebur128` and `synth.momentary_max` (audiovenv).
- First-pass note: my first thump number used `ffmpeg -ss` input seeking on the mp3, which cut off the attack (−31 vs
  −22 LUFS). I threw that number out. Every level quoted below comes from slicing the decoded sprite by sample index.

**Own Phaser 3.90 harness (`$C/harness.mjs` + `$C/page.js`)**
- The runner is the gb_people critic runner, which serves the repo read-only. Pages run in headless Chromium at
  390 × 844 DPR 3 and at 360 × 640 DPR 2. Render settings are `antialias: true, roundPixels: false`, like
  `src/main.js`.
- **World.** A real `townhouse_a` and a real geumbangfolk `gb_driver` doing `ring_doorbell` NE at the door (impact
  frame 2). Real townfolk residents. A game-style emote (world space, scale 0.75 like `Bubbles.js`). The 금방 order
  bubble. The `gb_van` with its roof sign, and `gb_sign`.
- **Bell.** `fx_gb_bell` placed exactly as its manifest note says: constant 40 CSS, 40 world px above
  `gb.bellPoint()`.
- **Night.** The DayClock overlay: an Image (not a Shape) with MULTIPLY, tint (181, 188, 216) = darkness 0.45.
- **UI scene.** The v4.2 left column rebuilt from `UIv42.js`: the 업무 chip is a ui5 `ui_chip` 132 × 50 at (28, 410),
  plus the coin bar, the hint pill and the 32/32 and 정기 납품 chips. The 금방 chip goes at plan §6 size, or at the
  업무-chip size. The toast is where the builder put it.
- **App.** The 720 × 1100 panel built from `appLayout` with real NineSlices. The doorstep photo is a dark render
  texture. A row of every 9-slice at fractional sizes and scales.
- **`cmp` sheet.** ui5 parts and icons beside the ui6 parts and icons at game size.
- **Captures:** `hud_z06_day/night`, `hud_z10_day/night`, `hud_z12_day/night`, `hud_z10_v42chip`, `app_ko`,
  `app_en_night`, `app_360`, `app_nomascot`, `cmp`. Every page loaded with 0 errors and 0 missing files.

## Contract check (§AQ / §AR / §AS)

| Item | Contract | Delivered | OK |
|---|---|---|---|
| Atlas | `ui6_gb` ≤ 1024², ≤ 2.5 MiB, `pagePlan` | 916 × 710, 2.481 MiB, resident 20 / transient 35 frames | yes (0.019 MiB headroom; see L2) |
| Icons | 14 × 96², no text, readable at 32 px | 14, no text, ≥ 0.30 solid at 32 px | yes; weight see M1 |
| Tracker | step 64² on/off ×5, dot 28² ×3, line 32 × 8 ×2, star 32² ×2 | all present, sizes exact | yes |
| Logos | ko ≤ 256 × 96, en ≤ 320 × 96, mark 128²; only baked text | 192 × 72, 250 × 72, 128²; `bakedText` = the two logos | yes |
| Mascot | 128², anchor [0.5, 0.9], idle 2 f, run 4 f · 8 fps, bow 2 f, navy scarf | as specified; feet at y 117 vs anchor 115.2 | yes; usage see H1, L5 |
| 9-slices | the 7 keys at the listed sizes, untrimmed, `nineSlice` + `contentInset` | exact | yes; phone top see L1 |
| Photo | 176 × 136, `photoRect` 128 × 80 transparent | exact, window α = 0 | yes |
| FX | `fx_gb_bell` 64², 4 f · 12 fps once | exact | yes; usage see H2 |
| Brand | palette; navy ≤ 15 %; symmetric mark; no rocket / wings / bird / arrow-smile / lightning / cat; no purple-and-white | navy max 12.8 %; mirror 0.2 %; banned motifs absent | dawn icon see M3 |
| Audio | one sprite + JSON manifest, 50 ms gaps, mono 96 kbps, 11 keys within their ≤ durations, no voice, no real jingle | exact; pitches within 2.4 cents; slice cuts match ffmpeg within 1 ms | yes |
| Stand-ins | every key has a code stand-in (plan §10.3) | every key lists one | some are not loaded in v4.3 (L3) |
| Tool names | `tools/<job>/<job>_check.py`, `gb_<job>_phaser.mjs` | `gen_ui6.py --check`, `check_audio8.py`, `ui6_phaser.mjs` | deviation, documented and allowed by the job's path list |

---

## Findings

### H1 (high): 금방이 runs backwards into the header on every app open, starting outside the phone

**Problem.** The manifest note for `ui_gb_mascot` says two things that conflict:
- "UI only, never mirrored - it runs to the right"
- "tween it in from the right edge of the header to appLayout.header.mascot when the app opens, then idle"

`appLayout.header.mascot` is (540, 174), and the header's right edge is x 699. The mascot therefore moves left the
whole time, while every run frame leans right with the scarf tail flying left. It slides backwards.

The builder's own harness does the same. `tools/test/ui6_phaser.mjs` app() starts the sprite at `hd.mascot[0] + 220`,
which is x 760 and outside the 720 panel, and tweens it with `Quad.out`. As a result:
- **It starts off-panel.** For the first ≈ 150 ms it is drawn over the right bezel and outside the phone. Nothing
  masks the header.
- **The feet slide.** `Quad.out` brakes to zero while the legs keep cycling at 8 fps, so the feet slide at the end.

This is the first thing the designer sees in the app, and it is shown again on every open.

**Repro.** `$C/out/mascot_runin.gif` and `$C/out/mascot_runin_strip.png`. These composite the real run frames onto my
`app_nomascot` capture (390 × 844 DPR 3) along the manifest's tween: 700 ms, x 760 → 540, run at 8 fps, then idle.

**Evidence.**
- `$C/out/mascot_frames_x3.png`: every run frame leans right; the scarf tail is on the left.
- The `ui_gb_mascot.notes` text in `assets/ui6/manifest.json`.

**Fix (any one):**
- (a) Change the note to "tween in from the **left**". There is room between the tagline and x 540 if the mascot
  enters under the header strip.
- (b) Allow `setFlipX(true)` for `run`. The mascot has no letters and its face is symmetric, so it is mirror-safe.
  Then run in from the right, facing left.
- (c) Re-render `run` facing left.

Also:
- Mask the mascot to `screenRect`.
- Use `Linear` easing for the last 30 % of the tween, or switch to `idle` when the speed drops below ≈ 1 stride per
  frame, so the feet do not slide.

### H2 (high): the 띵동 bell, drawn the way its manifest says, covers the courier's head and the resident's face

**Problem.** The `fx_gb_bell` note says: "centred ~40 world px above the door bell (geumbangfolk bellPoint) at a
constant screen size (about 40 CSS px)". I placed it exactly that way, over a real `gb_driver` in `ring_doorbell` NE
frame 2 (bellPoint (21.3, −44.1)), with a resident next to the door:

| Zoom | Courier height | Bell (40 CSS) vs courier | What it covers |
|---|---|---|---|
| 0.6 | ≈ 26 CSS | 1.6× | buries the courier's head and cap, and the arcs cross the resident's face |
| 1.0 | ≈ 43 CSS | same size | sits on the courier's head; the right arc touches the resident's hair |
| 1.2 (game default) | ≈ 51 CSS | 0.8× | sits on the cap; acceptable |

Two house rules point the other way:
- Game emotes are world-space at 0.75 (`Bubbles.js`), about 24 CSS at zoom 1 and 15 CSS at 0.6.
- The v4.2 chief pin is a constant 22 CSS and "never covers anyone" (v42_plan §1a).

The bell is therefore the largest overlay in the scene, at the one moment the designer cares about ("띵동~
금방이에요!"). The build report gives a different placement, door + (22, −96), so the two documents disagree.

**Repro.**
```
node $C/harness.mjs "hud_z06_day=mode=hud&zoom=0.6" "hud_z10_day=mode=hud&zoom=1.0" "hud_z12_day=mode=hud&zoom=1.2"
```

**Evidence.**
- `$C/out/bell_zooms.png`: the same doorstep at 0.6 / 1.0 / 1.2.
- `$C/out/door_hud_z06_day.png`, `door_z10_day.png`, `door_hud_z10_night.png`.

**Fix.**
- **Size.** Scale the bell like the house markers: 22–26 CSS at zoom ≥ 1, and no bigger than ≈ 0.7 × the courier's
  on-screen height at low zoom (e.g. `min(24 CSS, 0.7 × courierCss)`).
- **Position.** Anchor it beside the door frame on the side away from the resident, at bellPoint + (+28, −30) world
  px for NE, never over a head.
- **Docs.** Make the manifest note and the build report say the same thing.

The art itself (4 frames: pop, swing, swing, settle) is fine.

### M1 (medium): seven icons are much lighter than the house set and wash out on cream tabs, chips and buttons

**Problem.** House icons (ui5 and ui3) have a dark tinted ink outline and mid-dark fills. Many ui6 icons are
cream-on-cream with thin gold-brown lines. I measured the share of opaque pixels that have ≥ 3:1 contrast against the
cream chip / tab fill (#F7F0E3) at 32 px:

| Set | Median share |
|---|---|
| ui5 | 0.39 |
| ui3 | 0.28 |
| ui6 | 0.10 |

Seven ui6 icons fall below every ui5 and every ui3 icon (the lowest house icons are ui3 `ui_icon_request` at 0.10
and ui5 `ui_icon_news` at 0.15):

| Icon | Share |
|---|---|
| `ui_icon_gb` | 0.01 |
| `_order` | 0.01 |
| `_catalog` | 0.05 |
| `_review` | 0.06 |
| `_follow` | 0.07 |
| `_today` | 0.08 |
| `_doorstep` | 0.08 |

These are exactly the icons the layout puts on cream surfaces:
- tabs, drawn at 34 logical = 18 CSS
- the HUD chip
- the toast
- the 따라가기 button

In `$C/shots/cmp.png` the ui5 row (depot, sleigh, staff, inventory, binoculars, letter, office) reads as one bold
family. The ui6 slip, calendar, grid and viewfinder read as pale line drawings beside it. The builder's own 32 px check
passes (luma p90 ≥ 40), but that test is too loose to catch a weight mismatch.

**Repro.** `python3 -I $C/tools/weight.py`. Visual: `$C/shots/cmp.png` (rows at 59 and 34 logical).

**Fix.**
- Give the cream-bodied icons the house ink: a 2.5–3 px dark tinted outline (#5A3A12 / charcoal) at 96, and
  mid-value fills.
  - Order slip and calendar: a goldDark paper edge, a charcoal ring binder, the sun in full gold.
  - Catalog: tiles on a goldDark tray.
  - Follow: a charcoal viewfinder.
- Add a check rule: the ≥ 3:1-vs-cream share at 32 px must reach at least 0.2 (the ui3 low end).

### M2 (medium): at plan size the HUD chip is 1.6× its v4.2 neighbours, and the toast spot is already taken

**Problem.**
- **Chip size.** Plan §6 asks for 120 × 44 CSS. The real 업무 chip directly above it (`UIv42.js`: `ui_chip` 132 × 50
  logical at (28, 410)) is 71 × 27 CSS. The 금방 chip is therefore 1.62× taller and 1.68× wider, with 1.4× bigger text
  (28 vs 20 px) and a 1.7× icon (60 vs 36 logical). It looks like a different UI kit dropped into the column.
- **Toast spot.** The toast at the builder's position (top centre, y 82–171 logical = 44–92 CSS) covers the v4.2
  "손님이 낸 코인을 주우세요" hint pill and clips the coin bar. In `screens_v42/17_depot_revealed_390x844_ko.jpg` the
  hint pill is still on screen late in the game.
- **Edge badge.** The left-side nav edge badge clamps to y ≥ 480 at x 60, inside the chip's rect (46–176, 458–540).
- **Untested.** The builder's HUD test never drew the real v4.2 HUD, so none of this showed up.

The art is fine. The `ui_gb_chip` scales cleanly to any height because it is built 64 tall and scaled uniformly.

**Repro.**
```
node $C/harness.mjs "hud_z10_day=mode=hud&zoom=1.0"
node $C/harness.mjs "hud_z10_v42chip=mode=hud&zoom=1.0&chip=v42&ty=196"
```

**Evidence.**
- `$C/out/chips_z10_day.png`: the plan chip under the 업무 chip.
- `$C/out/montage_en_360_v42chip.png`, right panel: the chip at the 업무 size, 172 × 50, which sits in the family.

**Fix.** In `appLayout` and the report:
- Draw the visible chip at the 업무 chip height (50 logical, 20 px text, 36 px icon). Keep the 44 CSS tap target as
  an invisible hit rect, as the 업무 chip does with `setInteractive`.
- Put the toast under the hint row (≈ y 190 logical), or let it replace the hint while it shows.
- Tell the code owner about the edge-badge clamp.

### M3 (medium, brand): the 새벽배송 icon is a violet sky with a moon and a star, too close to Kurly's 샛별배송

**Problem.** The dominant colours of `ui_icon_gb_dawn`:

| Colour | Share | Hue |
|---|---|---|
| #9C9CE4 | 12 % | 240° |
| #B4B4E4 | 10 % | 240° |
| #CCB4E4 | 9 % | 270° (lilac) |

The rest is white snow hills and a moon. A 4-point star sits top right.

The pair check passes (ΔE 27 to Kurly #5F0080 + white), because Kurly's purple is far darker. Plan §7.4 is stricter,
though: it bans "purple-and-white", it bans the service name 샛별배송, and 샛별 means "morning star". On a phone this
icon reads as "lilac night sky + moon + star = dawn delivery", which is the vocabulary of that real service. The
icon's job (금방 새벽배송) makes the echo worse.

**Repro.**
- The colour dump: the inline probe in this review, re-runnable from `$C/out/frames/ui_icon_gb_dawn.png`.
- Visual: `docs/previews/ui6_icons.png` (gb_dawn).

**Fix.**
- Re-colour the sky from the house navy #2B4F7E at the top to a warm peach dawn at the horizon, with no violet.
- Keep the moon and the gold sunrise.
- Replace the white star with a small gold 금방 sparkle, or drop it.
- Add a hue guard to `--check`: no sprite with ≥ 20 % of its opaque pixels at hue 255–300° and lightness 0.5–0.85.

---

### L1 (low): the phone's speaker slot and camera dot sit in the stretched top-centre slice

**Problem.** `nine.py` finds 138 levels of variation along x in the phone's top-centre slice. Every other 9-slice
edge strip is uniform. At the 720-wide panel, the centre column stretches from 248 to 608 px (2.45×). As a result:
- the camera dot becomes a 2.3 : 1 oval (`$C/out/app_phone_top_x3.png` vs the source `$C/out/src_phone_top.png`)
- the slot becomes about a quarter of the phone's width

The report says the slot "reads as a normal slot". The oval camera is not mentioned.

**Fix (either):**
- Draw the slot and camera as a separate fixed frame (`ui_gb_phone_notch`) at the top centre, and leave the 9-slice's
  top edge plain bezel.
- Or keep only a plain bar, which can stretch without looking wrong.

### L2 (low): the atlas is packed with 0 px padding, and the card bottom picks up a hairline from the header

**Problem.** In `frames.py`, 16 frames have an opaque texel of another frame directly across their edge. Examples:
- `ui_gb_card` bottom → `ui_gb_header` top row: 276/320 px, α 255
- `ui_gb_phone` right → header
- `ui_gb_tab_on` bottom → `dot_now`
- several step badges → the phone

With linear filtering at DPR 3, the outer device pixel samples the neighbour. In `app_ko.png` every card shows a 1 px
warm line at its bottom edge, under its shadow (row 1473: (247, 238, 219) vs (248, 242, 231)). It is faint on cream,
but it is real, and it would show on any darker surface. The phone's right edge is safe today only because the panel
touches the screen edge.

**Fix.**
- Pack with a 2 px transparent gutter, or a 1 px extrude for full-bleed frames such as the header.
- Make room in the budget by building the phone 9-slice smaller. Its flat 248 × 512 centre is about 0.48 MiB of
  uniform cream, and a NineSlice does not need it. This needs the lead to relax "360 × 640" to a minimum size.

### L3 (low): stand-ins point at fragments v4.3 does not load

**Problem.**
- Icons: `ui_icon_box` (for order, locker, doorstep and cart) exists only in `fx_city` (ui4).
- Sounds: `sfx_ticket_chime` (doorbell, chime, scan, locker) and `sfx_box_drop` (thump, tape) exist only in `audio6`.
- `src/core/Assets.js` loads neither fragment (`FRAGMENTS` + `LATE_FRAGMENTS`). If ui6 or audio8 is missing, 4 icons
  and 8 of 11 sounds fall back to nothing.
- Plan §10.3 lists these keys too ("if shipped").

**Fix.** Pick loaded stand-ins:
- icons: ui5 `ui_icon_depot` / ui3 `ui_icon_delivery`
- doorbell: audio5 `sfx_hotel_bell`
- chime: audio2 `sfx_register` or audio `sfx_pickup`
- thump and tape: audio `sfx_drop`

Note the change in the manifest.

### L4 (low): the locker icon does not match the locker prop

**Problem.**
- **Icon:** a gold cabinet whose face is mostly 2 × 4 large periwinkle doors (#9CB4E4) plus one open door.
- **Prop** (`gb_locker_a`, contract "4 × 3 doors, navy doors"): a gold frame with 12 small slate doors (#546C84).

The icon reads as a blue-and-yellow cabinet, close to the spirit of the "no big blue block next to gold" rule.

**Evidence.** `$C/out/locker_compare.png`.

**Fix.** Redraw the icon as 3 columns × 4 rows of small slate-navy doors set in the gold frame.

### L5 (low): 금방이 hides the mark's "o" mouth, its scarf reads as a belt, and the idle wave is choppy

**Problem.**
- **Mouth and scarf.** The navy band runs right across the face under the cheeks, so the mark's "o" mouth — the
  "calling 금방!" mouth from the player plan §4.3 — is hidden, and the scarf reads as a belt
  (`$C/out/mascot_frames_x3.png`).
- **Idle.** The wave is 2 frames at 3 fps.

**Fix.**
- Lower the scarf to a neck wrap under the mouth, with the tail flying from one knot, and show the "o".
- Optionally make `idle` 3–4 frames.

### L6 (low): the bell is gone before the "dong"

**Problem.** `fx_gb_bell` plays 4 frames at 12 fps (0.333 s) and is destroyed on `animationcomplete`. The
`sfx_gb_doorbell` cues are ding 0 and dong 0.33, with the tail ringing until 0.86 s. The dong is the longer, warmer
note, and it plays to an empty doorway.

**Fix.** Either replay the swing on the `dong` cue (frames 1–3), or hold frame 3 and fade it out over 0.5 s.

### L7 (low): the thump has no headroom and is the quietest doorstep sound on a phone

**Problem.**
- `sfx_gb_thump` is at volume 1.000 and `_2` at 0.989.
- Re-measured with the builder's helpers, the raw slice is −22.0 LUFS (dual-mono), so the target is met exactly.
- 74 % of its energy is below 300 Hz and only 6 % is in 300–3400 Hz.
- Through the phone model it loses 4.1 dB. `sfx_box_drop` loses 1.4 dB and the doorbell 0.9 dB.
- On a phone the doorstep thump will sit ≈ 3–4 dB under the house drop sounds.

**Fix.** Re-render with +4 to 6 dB of cardboard "tock" around 400–900 Hz plus the snow crunch. That keeps the body
and gives the level some headroom below 1.0.

### L8 (low): documentation and evidence inconsistencies

- The `ui_gb_logo_ko` note says "x 44, y 42, scale 0.8". `appLayout.header.logo` says [44, 46, 1.0].
- Bell placement: the report says door + (22, −96); the manifest says bellPoint − 40 (H2).
- `docs/previews/ui6_tracker.png` cuts off the fifth Korean row (the 도착 state).
- **Night captures.** The builder's night overlay is a Shape, `this.add.rectangle(..., 0.45).setBlendMode(MULTIPLY)`.
  `DayClock.js` notes that a Shape ignores MULTIPLY in WebGL. So the `ui6_phaser_*_night` captures show a 45 %
  normal-blend wash, which is lighter on dark objects than the real night. My harness uses the DayClock Image.

### L9 (low): small and pale labels in the suggested app layout

**Problem.**
- English tab words and tracker words are 24 logical = 12 CSS on a 360 phone and 13 on a 390 phone. Plan §6 asks for
  body text ≥ 15 CSS.
- The inactive tab and tracker label colours (#8A7A62 / #807462 on cream) are ≈ 3.7–4 : 1.

These are code choices, but `appLayout` ships them as the suggestion.

**Fix.**
- Use 26–28 logical for every label.
- Use #6B5D48 (≥ 4.5 : 1) for inactive words.

### L10 (low, note): the wordmark font

`ui_gb_logo_ko` uses Jua, which is BM JUA by 우아한형제들, the company behind 배민. It is the game's house display
font: the title, the nameplates and the van roof sign all use it. It is OFL and legal, and it is consistent across
the game. A Korean viewer may still notice a faint 배민 echo on a *delivery-app* wordmark. No action is needed unless
the designer minds. If they do, set the logo in a rounded Hangul face that is not a BM font, and keep Jua everywhere
else.

---

## What is good (keep it)

- **Mark consistency.** `ui_gb_mark` and `ui_icon_gb` match the `gb_sign` disc in `assets/geumbang`: sparkle above
  the parcel on the gold, a goldDark rim, a cream sticker ring (`$C/out/mark_compare.png`). Mirror difference is
  0.20 % / 0.24 %.
- **Logos.** "금방" and "Geumbang" read at 0.5× on gold, cream and dark. The header layout reads well in Korean, in
  English at night, and on a 360 × 640 phone (`$C/out/montage_en_360_v42chip.png`).
- **9-slices.** No seams at fractional sizes and scales (`$C/out/app_awkward.png`). The photo window is fully
  transparent with a soft inner shade. Tape and sticker sit on top (`$C/out/app_photo_x3.png`).
- **No halos.** Every rim is darker than its inside; the only exception is `dot_now`'s intended glow.
- **Tracker.** The on/off states and the "now" dot are clear. Words and icons agree in Korean and English.
- **Audio** (`$C/tools/aud.py`, `lufs2.py`):
  - Peaks are −1.7 to −2.0 dBFS.
  - The 30 ms slice extensions are silent (−180 dB), and there is no DC.
  - Tails are ≤ −49 dBFS at the cut.
  - Levels sit among the sounds they play beside:

    | Sound | Level |
    |---|---|
    | doorbell | −24.0 LUFS mono-measured |
    | `sfx_hotel_bell` | −22.9 |
    | `sfx_ticket_chime` | −24.4 |
    | `sfx_coin` | −22.5 |

  - The jingle F5 → G5 → C6 and the G5 → E5 ding-dong are generic and original.
- **Budgets.** Met, and the report is honest about the shrink-to-fit (icons at 94 %, mascot at 0.78, logos 72 tall).

## Suggested fix order

| Order | Finding | Kind of change | Cost |
|---|---|---|---|
| 1 | H1 | manifest note, or flipX allowed | trivial |
| 2 | H2 | size and placement rule in the manifest note and the report | trivial |
| 3 | M2 | `appLayout` chip and toast numbers | trivial |
| 4 | M1, M3, L4, L5 | icon redraw: ink, dawn colours, locker doors, mascot scarf | one `gen_ui6.py` pass |
| 5 | L1, L2 | phone notch frame, 2 px gutter, smaller phone source (needs the lead's OK) | |
| 6 | L3, L6, L7, L8, L9 | data and docs; one thump re-render | |

## Evidence index (`$C` = `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/geumbang_gb_ui_audio_review`)

| Path | What |
|---|---|
| `$C/shots/hud_z06_day.png`, `hud_z06_night.png`, `hud_z10_day.png`, `hud_z10_night.png`, `hud_z12_day.png`, `hud_z12_night.png` | ui6 HUD and world with real dolls, the van, the v4.2 left-column chips, 390 × 844 DPR 3 |
| `$C/shots/hud_z10_v42chip.png` | the 금방 chip at the 업무 size, toast under the hint row |
| `$C/shots/app_ko.png`, `app_en_night.png`, `app_360.png`, `app_nomascot.png` | the app panel |
| `$C/shots/cmp.png` | ui5 vs ui6 parts and icons at game size |
| `$C/out/mascot_runin.gif`, `mascot_runin_strip.png`, `mascot_frames_x3.png` | H1, L5 |
| `$C/out/bell_zooms.png`, `door_*.png`, `bell_frames.png` | H2, L6 |
| `$C/out/chips_z10_day.png`, `montage_en_360_v42chip.png` | M2 |
| `$C/out/app_phone_top_x3.png`, `src_phone_top.png` | L1 |
| `$C/out/app_awkward.png`, `app_photo_x3.png` | 9-slice and photo checks |
| `$C/out/mark_compare.png`, `locker_compare.png` | mark consistency, L4 |
| `$C/out/frames/` | every ui6 frame at sourceSize |
| `$C/tools/frames.py`, `nine.py`, `weight.py`, `aud.py`, `lufs2.py` | the probes |
| `$C/harness.mjs`, `$C/page.js` | the Phaser harness |
| `$C/before.sha1` | hashes of the 41 reviewed files (unchanged after the review) |
