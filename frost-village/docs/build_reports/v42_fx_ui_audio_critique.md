# v42_fx_ui_audio: adversarial art review (chief_fx §AG, ui5 §AL, audio7 §AM)

**Verdict: polish.**

The three sets are well made and match the contract almost exactly:
- the keys, frame sizes, frame counts, anchors and icon rects;
- the 16 chevron headings, the 9-slice margins and the audio sprite layout.

The aurora ring reads on snow, cobbles, dirt and the plaza at every zoom, and stays 45 CSS px wide on the phone. The icons sit in the ui / ui3 / ui4 family. The one-shot sounds land at the same level as the existing sounds they play next to.

Nothing is broken in the files. The problems show up only when the art is drawn the way the game places it:

- **H1: the 광채 back glow puts a milky veil over everyone standing behind the chief.** It is invisible on snow by day and reads as fog at night, not as light.
- **Two navigation pieces fight each other.**
  - When he carries something, the ring notch and the navigator chevron pile up on the ring's edge.
  - The screen-edge badge rotates its own gloss and drop shadow, and its pointing notch is about 3 CSS px.
- **The hand-over to CODE-2 is wrong in one important place.** Adding the `chief_fx` fragment to today's code turns the ring, glow, motes, pin and edge badge into Phaser's missing-texture boxes.
- **Three audio items need fixing or a decision.**
  - The wheel squeal is a swell, not a loop.
  - `amb_office` is the loudest ambience bed in the game.
  - The 1 Hz clock is mostly masked.
- **The chief_fx page is 40 % over its budget.** With ui5 it eats the plaza texture gate.

| Severity | Count |
|---|---|
| critical | 0 |
| high | 1 |
| medium | 6 |
| low | 12 |

**What I tested**

- **The set and the rules.** I treated `assets/chief_fx/**`, `assets/ui5/**`, `assets/audio7/**` and the builder's tools as read-only. The sha256 baseline of all 15 files still matches after my runs. I checked the set against:
  - `docs/CONTRACT_V42.md` §AG, §AL, §AM and §AN;
  - `docs/v42_plan.md` §3.1 (aura), §3.4 (navigator), §6.7 (office panel), §8 (HUD) and §13 (budgets);
  - the game code that will draw it: `src/entities/ChiefAura.js`, `src/systems/Navigator.js`, `src/scenes/UIv42.js`, `src/systems/v42/fxTex.js`, `src/core/Assets.js` (`has`, `sprite`, `nine`, `spriteAnims`, `sliceSprite`) and `src/core/Audio.js`.
- **The harness.** My own Phaser 3.90.0 page (`$S/page.js` + `$S/harness.mjs`) uses the real neighbours:
  - `char_player` (the chief: idle, chop, carry, walk, with the `fv_shadow` at `DEPTH.SHADOW`);
  - 20+ townfolk paper dolls (`tools/townfolk_compose.js`);
  - `props_items` (carried stacks, badge icons) and `ui_pad_output`;
  - the real grounds `ground_snow`, `ground_dirt`, `ground_plaza` and `road_cobble_wide`;
  - the ui / ui2 / ui3 / ui4 / pets2 icon atlases and `ui_panel`.
- **How the art is drawn.** Every aura object uses ChiefAura's maths and depths:
  - the ring width is `70 × min(2, 1.2 / zoom)` at `PAD + 2`, with the band at −0.01;
  - the glow is drawn ×1.15 at `chief.y − 0.5`, with alpha 0.35 by day and 0.6 at night;
  - the motes sit at depth ±1, the pin at `LABEL − 30` at 22 CSS px, and the notch at `rx × 1.05`.
  
  The animated keys are sprites playing `spr:<key>:play`, the CODE-2 swap. The navigator is placed by Navigator.js rules:
  - the chevron sits 56 px ahead, and dots are drawn every 48 px but none within 90 px of him;
  - `nav_ring` plays at scale 1, and the badge sits 90 px above the ring with the item icon in `iconRect`;
  - the edge badge is drawn in a UI scene at scale 0.9 with a 34 px icon and the metres below it.
- **Phone captures.** 390 × 844 CSS px at DPR 3 (k = 1.65, the `src/main.js` maths), at zoom 0.6, 1.0 and 1.2, by day and by night. Night is the DayClock MULTIPLY overlay (darkness 0.45, `#5A6AA8`) at `FX − 30`. One extra capture runs at DPR 2 (k = 1.1).
- **Pixel audits.** Bounding boxes and edge clipping, ring geometry, the empty centre, chevron headings (each frame rebuilt from frame 00 and matched by IoU), contact-shadow direction, badge and edge `iconRect` against the cream disc, loop seams, duplicate frames, and texture memory.
- **Icon audit.** Visual mass and contrast at 32 px against every icon in the house sets.
- **Audio audit.** ffmpeg decode, BS.1770 loudness with pyloudnorm (the same meter for audio7 and the audio1–6 references), envelopes, onsets, the loop seam, synchronous folding for the clock, and spectra.
- **Builder's checks.** `gen_chief_fx.py --check` and `gen_ui5.py --check` both still report **0 errors**. I did not run `check_audio7.py`, because it rewrites the builder's previews.
- **Page loads.** 31 page loads (29 at DPR 3, 2 at DPR 2), all with 0 page errors, 0 console errors and 0 × 404.

All my work is in the scratch folder
`/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v42art_v42_fx_ui_audio_review`, called `$S` below. Screenshots are in `$S/shots`; the measurement logs are in `$S/audit`.

---

## 0. 디자이너용 요약 (쉬운 말)

**좋은 점**
- 촌장님 발밑의 오로라 고리가 눈밭, 돌길, 흙길, 광장 어디서나 잘 보여요. 어느 줌에서든 휴대폰 화면에서 같은 크기(약 45 px)예요.
- 일하는 중 금빛 고리, 읍 금띠, 별 표시, 길 안내 화살표·점·도착 고리가 모두 계약서대로 만들어졌어요.
- 화살표 16방향이 전부 정확해요. 그림자 방향도 한결같아요.
- 새 아이콘 18개가 기존 아이콘들(ui, ui3, ui4)과 같은 말랑한 장난감 느낌이에요.
- 편지지, 칠판, 사무실 탭도 예뻐요.
- 효과음 크기가 기존 소리들과 잘 맞아요. 사무실 배경음은 이음매 없이 24초마다 자연스럽게 반복돼요.

**꼭 고칠 점: 촌장님 뒤 "광채"가 뒤에 선 주민들을 뿌옇게 만들어요.**
- 광채는 촌장님 몸 뒤에 그려지는 큰 타원형 빛이에요. 그런데 촌장님 바로 뒤(화면 위쪽)에 선 주민들 위에 덮여요.
- 그래서 그 주민들이 서리 낀 유리 너머처럼 흐려 보여요. 밤에는 더 진해요.
- 낮에 눈밭에서는 광채가 거의 안 보여요. 밤에는 빛이라기보다 "안개"처럼 보여요.
- 고칠 방법: 광채를 몸에 꼭 맞게 작게 줄이고 가슴 높이로 내려요. 또는 발밑 바닥에 깔리는 "빛 웅덩이"로 바꿔요. 밤에는 가로등처럼 진짜 빛(더하기 빛)으로 처리하는 게 좋아요.

**그 밖에 보이는 것들**
- 짐을 들면 고리 가장자리에 화살표가 두 겹으로 겹쳐요. 고리 표시 화살표와 길 안내 화살표가 같은 그림이라 지저분해 보여요.
- 화면 끝 배지(28m)는 화살 끝이 아주 작아서(휴대폰에서 약 3 px) 방향이 잘 안 보여요.
  - 배지를 돌리면 반짝이 광택과 그림자도 같이 돌아요. 왼쪽을 가리키면 빛이 아래에서 오는 것처럼 보여요.
- 금빛 "일하는 중" 고리는 햇살 무늬가 고리 안쪽에 있어요. 크게 보면 시계 눈금이나 톱니처럼 보여요.
- 아이콘 중 "길 안내·후광·놀이 탭·응원"은 선이 가늘어 가장 약해 보여요.
  - "줍기" 손 아이콘은 흰 장갑이라 크림색 버튼 위에서 흐릿해요.
- 기차 바퀴 끽 소리는 이어 붙이면 "끼이— 끼이—" 하고 1초마다 숨을 쉬듯 끊겨요. 이어지는 소리가 아니에요.
- 사무실 배경음은 게임의 모든 배경음 중 가장 커요. 은행보다 약 7 dB, 화재보다 약 4 dB 커요. 한번 들어 보고 정해 주세요.
  - 벽시계 "똑딱"은 타자 소리에 묻혀 잘 안 들려요.
- 새 그림 묶음이 계획보다 큰 메모리를 써요(2.8 MiB, 계획은 약 2 MiB). 광장 화면의 메모리 한도를 조금 넘을 수 있어요.

---

## 1. Contract compliance

### §AG chief_fx

| Item | Contract | Delivered | OK |
|---|---|---|---|
| Atlas | one page ≤ 1024², ≈ 2 MiB | 856 × 858, **2.80 MiB** (trimmed frames 2.61 MiB, source-sum 3.20 MiB) | over (M4) |
| Frame names | `{key}_{i}`, chevrons `nav_chevron_00…15` | as specified; nav_dot `_0` / `_1` | yes |
| `chief_halo` | 192 × 96, 12 · 10 · loop, [0.5, 0.5], outer 184 × 92, tube 7 px, centre transparent, 1 px gold inner line, 1 px teal rim, 8 px glow, 6 stars | outer 186 × 94 at α ≥ 128 (rim included); tube 9 px including the rims; centre max α 3 / 255; gradient turns about 29° a frame, 1 turn per 1.2 s, with no hitch at the wrap (`$S/audit` and §2 L5) | yes |
| `chief_halo_gold` | 8 · 12, 12 outward ray ticks that grow (0–3) and settle (4–7) | rays sit inside the tube (the frame leaves 2–4 px outside) | partly (L1) |
| `chief_halo_rank2` | 216 × 108, 2 px + 1 px, 4 px apart, outer 208 × 104 | outer 208 × 104 | yes |
| `chief_glow_back` | 160 × 200, 8 · 8, [0.5, 0.82], core `#FFE7A3` 55 %, no hard edge | peak `#FFF0C7` at α 149 (58 %); FWHM 47–144 px in the frame, so its core is at head height; never reaches the frame edge | as specified, but see H1 |
| `chief_sparkle` | 32², 6 · 12 · once | appears, peaks on frames 1–2, fades | yes |
| `chief_marker` | 72 × 88, 4 · 6 loop, light sweep, no bob, Ø 60, star ≥ 30 px, pinecone crown, tip at [0.5, 1] | gold star 30 × 29 core (34 with its rim); tip at x 34–37 on the bottom row; **frames 0 and 3 are identical** | yes (L8) |
| `nav_chevron` | 64 × 40 × 16, frame k = screen angle k × 22.5°, ground-projected | all 16 frames best-match their own heading (IoU 0.77–0.96 against the decal rebuilt from frame 00); contact shadow always +4…6 px down | yes |
| `nav_dot` | 28 × 14 × 2 | as specified | yes |
| `nav_ring` | 160 × 80, 8 · 10, 12 dashes, small/bright → large/faint | 96 → 156 px wide, α 255 → 48 | yes |
| `nav_badge` | 88 × 100, 80² body, pointer, 56 px disc in `iconRect` | cream disc x 16–71, centre (43.5, 41.2) against iconRect centre (43.5, 41.5) | yes |
| `nav_edge` | 80², Ø 64, notch on the right, 44 px disc | circle 66 px including the rim; disc matches `[18, 18, 44, 44]`; the notch reaches only 6 px past the circle | yes, but see M3 |
| Blend / manifest | NORMAL; `screenSize`, per key frames, fps, repeat, anchor, iconRect | all present, plus `replaces` and `notes` | yes |

### §AL ui5

| Item | Contract | Delivered | OK |
|---|---|---|---|
| Atlas | `ui5_icons` ≤ 1024², ≤ 1.5 MiB | 492 × 798, 1.498 MiB | yes (just) |
| 18 icons 96², [0.5, 0.5], no text | listed keys | 18 icons; **`ui_icon_play` ships as `ui_icon_play_tab`** (pets2 owns `ui_icon_play`; it is recorded in `conventions.renamed`) | justified rename, needs a contract note (L12) |
| Panels | letter 320 × 400, 36 / 64 / 36 / 40; chalk 320 × 240, 28 / 28 / 28 / 36; tab and tab_on 160 × 72, 24 / 20 / 24 / 12; chip 200 × 64, 32 / 16 / 32 / 16 | as specified, untrimmed, with `nineSlice {atlas, frame, left, right, top, bottom, contentInset}`. `Assets.nine()` resolves them through the sprite entry. | yes |
| Status dots | 4 frames of 32² | `ui_status_0…3`, plus a group sprite `ui_status` | yes |

### §AM audio7

| Item | Contract | Delivered | OK |
|---|---|---|---|
| Files | one sprite (50 ms gaps) + loop, 3 files | `audio7_sprite.mp3` + `amb_office.mp3` + manifest (the manifest is the sprite JSON); `inSprite: 'audio7'` matches the fragment | yes |
| Lengths | typewriter 0.6 × 3, switch 0.4, squeal 1.2 **loopable**, flag 0.3, coin 0.5 × 3, office 24 s | lengths exact; squeal is a 1.2 s swell | squeal no (M5) |
| Levels | audio1–6 rule, office −26 LUFS | one-shots in family (table in M6); office taken as target −26 before the −2 dB headroom | decision needed (M6) |
| Loop | seamless 24 s | `loopSamples` 1 058 400 decode exactly; wrap step 0.003 against a median sample step of 0.009 | yes |
| Clock tick | "a clock tick" | present (folded +9.8 dB peak) but the loudest event in only 5 of 24 seconds | weak (L6) |

---

## 2. Findings

### H1 (high): the 광채 back glow veils the villagers behind the chief and does not read as light

**Where:** `chief_glow_back`, drawn as the plan says: ×1.15, depth `chief.y − 0.5`, alpha `0.35` by day and `0.6` at night.

**What is wrong**
- **The glow core sits at head height.** The frame's peak (α 149 = 58 %) is at y ≈ 92, which is 72 px above the anchor (y 164). At ×1.15 that is **83 world px above his feet**, right at `headTop` −81. The half-maximum band runs from about 23 to 135 px above the feet.
- **It draws over everything behind him.** Its depth is just under the chief, so it draws **over every villager, prop and building whose y is smaller than his**. Anyone standing 20–100 px behind him gets a pale gold-mint veil across the face and body.
- **Measured by night at zoom 1.0** (A/B with the glow on and off, the same scene):
  - the luminance lifts by up to **+41 levels** (mean +9.8) over a 52 × 72 CSS px area;
  - saturation there drops by **−18 %**.
  - The difference map shows the brightest lift on the hat and face of the person directly behind him.
- **By day on snow it is invisible.** Pale gold at an effective α ≈ 0.19 on `#F4F7FB` shows nothing, so the cost buys nothing on the most common ground.
- **At night it reads as fog, not light.** It is under the MULTIPLY overlay, so it shows as a grey-blue haze column rising above his head. The mint (left) and lilac (right) fringes make a greenish-grey smudge on dirt and cobbles (`$S/shots/cu_glow.png`, NORMAL blend at α 100 %).
- **Why it matters.** It is on by default, in every scene, and the chief spends most of his time among villagers (stations, shelves, the plaza). The designer will see "people behind him look foggy" before seeing "he glows".

**Evidence**
- `$S/shots/m_behind.png`: three villagers behind him with 광채 on and off, by day and by night, zoom 1.2, 3× CSS.
- `$S/shots/m_crowd_glow_ab.png` and `$S/shots/crowd_glow_diff.png`: the crowd at night, zoom 1.0, with the luminance difference map.
- `$S/shots/m_glow_night_z12.png`: the haze columns at night.
- `$S/shots/cu_glow.png`: the frame over the real grounds.
- `$S/audit/frames.txt`: the glow bounding boxes.

**Repro**
```
cd $S && PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node harness.mjs \
  "behind_z12_n1=mode=behind&zoom=1.2&night=1&freeze=1&t=0.3&seed=3" \
  "crowd_z10_n1_glow=mode=crowd&zoom=1.0&night=1&freeze=1&t=0.4&seed=11" \
  "crowd_z10_n1_noglow=mode=crowd&zoom=1.0&night=1&freeze=1&t=0.4&seed=11&glow=0"
```

**Fix**

Art:
- Re-shape the glow so it hugs the body. Make it a soft rim about 1.1× the chief's silhouette, with the core at the torso (40–45 px above the feet) and α falling to 0 within about 10 px outside the silhouette. Most of it is then hidden behind him and only a halo edge shows.
- Or, better for this camera, make 광채 a **ground light pool**: a warm iso ellipse about 1.3× the ring, drawn at `PAD + 1.9`. It lights the snow around his feet and can never veil anyone.
- Drop the mint/lilac fringe, or keep it only at α < 0.1. That fringe is what turns into grey smudge on dirt.

Code / plan:
- At night, register the chief as a moving DayClock light (the pooled ADD glows the lamps use), so he really glows after dark.
- Keep the NORMAL sprite for day, at most 0.25.

### M1 (medium): the CODE-2 hand-over is wrong. Adding the fragment alone turns the aura into missing-texture boxes

**Where:** build report "How the game uses it". It says *"`fxTex.art(key, fallback)` already switches on `Assets.has(key)`"*.

**What is wrong**
- `art()` returns `{ key: 'chief_halo' }`, a **sprite** key, as soon as the manifest is merged.
- ChiefAura then uses it as a **texture** key, in `src/entities/ChiefAura.js:50-56`: `gs.add.image(0, 0, R.key)`.
- The same happens in UIv42 at `src/scenes/UIv42.js:71`: `ui.add.image(0, 0, pickIcon('nav_edge', ...))`.
- Phaser has no texture called `chief_halo` (the atlas is `chief_fx`), so all of these become `__MISSING` (the green box): the band, ring, gold ring, glow, 6 motes, pin and edge badge.
- The HUD icons are safe, because they go through `Assets.image`.

**Evidence:** `$S/audit/probe.txt`: `{"chief_halo_tex": "__MISSING", "nav_edge_tex": "__MISSING", "textureExists": false}`.

**Repro**
```
node harness.mjs "probe=mode=probe"
```

**Fix**
- Correct the report: these call sites must use `Assets.sprite(key)`, which gives `{tex, frame, anchor}`, or `Assets.image`, before the `chief_fx` fragment is added to `FRAGMENTS`.
- The ring, gold ring, glow and pin become `add.sprite(...)` playing `Assets.spriteAnim(key, 'play')`.
- Navigator keeps its `fv_*` textures until its frame names are mapped.

### M2 (medium): when carrying, the ring notch and the nav chevron stack into a four-arrow cluster

**Where:** ChiefAura notch (`nav_chevron` at `sc × 1.6`, at `rx × 1.05`) together with the Navigator chevron (scale 1, 56 px ahead). Both point along the same route direction.

**What is wrong**
- **At zoom 0.6** the ring's `rx` is 64 world px, so the chevron (56 px ahead) lands *inside* the ring edge, on top of the notch (68 px).
- **At zoom 1.0 and 1.2** the two sit side by side at the ring edge.
- Either way you get two double-chevrons, one larger than the other, bunched at the same spot: "≫≫" with a size jump.
- This is the state the player is in most of the time.

**Evidence:** `$S/shots/m_navc.png` (zoom 0.6, 1.0 and 1.2, 4× CSS) and `$S/shots/m_nav_z06_zoom.png`.

**Repro**
```
node harness.mjs "navc_z06=mode=nav&zoom=0.6&freeze=1&t=0.5&seed=5&fx=-150&fy=40"
```

**Fix**

Code:
- Hide the notch while the navigator chevron is visible. Show it only with nav off, or while the chevron is hidden near the target.
- Or push the chevron out to `max(56, rx + 24)`.

Art (optional):
- Give the notch its own small mark: a gold bead or teardrop riding the ring, 1 frame, about 20 × 14. Then "the ring points" and "the road points" stop being the same picture.

### M3 (medium): the edge badge has a weak direction cue and rotates its own lighting

**Where:** `nav_edge`, rotated by `atan2(dy, dx)` in the UI scene at scale 0.9.

**What is wrong**
- **The notch is tiny.** It is the only direction cue, and it reaches only **6 px** past the Ø 66 circle with a 12–15 px base. At scale 0.9 on the phone that is about **3 × 7 CSS px**. At arm's length the badge reads as a round icon, not an arrow.
  - CODE-1's stand-in had a 28 px-tall wedge.
- **The lighting turns with it.** The gloss (upper left) and the navy drop shadow (lower right) are baked in, so they rotate too:
  - pointing left or up-left, the badge looks lit from below, with its shadow cast up;
  - pointing down, the gloss sits at the top right.
  - Every other HUD element is lit from the upper left.
- **The label can cover it.** When the target is below the screen, the metres label (drawn at +44 under the badge) sits on the notch.

**Evidence:** `$S/shots/m_hud_zoom.png` (right at −0.35 rad, down at +90°, up-left at −137°, 4× CSS) and `$S/shots/cu_badges.png`.

**Fix**

Art:
- Split the frame into `nav_edge` (the round badge with fixed light) and `nav_edge_arrow`: a separate, bolder arrow tip about 16 px long and 24 px wide, which the code rotates around the badge rim. That gives 2 frames in the same atlas.
- If the file must stay 1 frame, make the notch a real arrowhead at least 14 px long, and drop the baked gloss and drop shadow from the part that rotates.

Code:
- Put the metres label on the side opposite the arrow.

### M4 (medium): the chief_fx page is 2.80 MiB (≈ 2 in the contract); with ui5 it eats the plaza texture gate

**Where:** `assets/chief_fx/chief_fx.png`, and the planned `v42_core` page (chief_fx + ui5).

**What is wrong**
- The page is **+40 %** over the contract.
- Plan §13.2 budgets the plaza at `323 + v42_core 2 + halo 0.1 + office closed 2.5 + courier 1.5 ≤ 331`. With the real `v42_core` of 2.80 + 1.50 ≈ 4.3 MiB, the same sum is **≈ 331.3 > 331**.

Where the memory goes (trimmed frames):

| Key | MiB |
|---|---|
| `chief_halo` | 0.84 |
| `chief_halo_gold` | 0.56 |
| `chief_glow_back` | 0.53 |
| `nav_ring` | 0.31 |
| everything else | 0.36 |

**Fix**
- **The glow.** It is a blur, so render it at half resolution (80 × 100, drawn ×2.3). This saves about 0.4 MiB with no visible change. Fixing H1 as a ground pool would make it smaller still.
- **The duplicate marker frame.** Drop `chief_marker_3` and loop 0-1-2-0 (L8).
- **The halo.** 8 frames at 8 fps is enough for a pastel gradient (−0.28 MiB); see also L5.
- **ui5 panels.** `ui_letter`, `ui_chalk_panel`, the tabs and the chip are about 0.9 of ui5's 1.42 MiB, and they are only used in the office panel. Pack them into the transient office panel page (plan §13.2 already has a 1.6 MiB transient "panel page"), not into the resident `v42_core`.

### M5 (medium): `sfx_wheel_squeal` is a 1.2 s swell, not a loop

**Where:** the `audio7` sprite slice `sfx_wheel_squeal`. The manifest notes say: "loop the sliced buffer or retrigger every 1.2 s".

**What is wrong**
- The slice fades in for about 375 ms, holds within 6 dB from 0.375 to 0.843 s, and fades out to −87 dB at both ends.
- Looped the way the notes say (`Assets.sliceSprite` keeps dur + 30 ms), it throbs at **0.81 Hz**: **54 %** of every cycle is more than 12 dB under the peak.
- On a curve this is a regular "wee… wee… wee…", like a slow siren, not a continuous flange squeal.
- The contract asks for "1.2 s, **loopable**".

**Evidence:** `$S/shots/audio_squeal_and_beds.png` (top: the looped envelope) and `$S/audit/audio_squeal_onsets.txt`.

**Fix**
- Render a steady-state body: a sustained level with slow random swells, its ends crossfade-matched so sample N−1 runs into sample 0.
- Have CODE-2 loop only `[0, 1.2 s)` of the sliced buffer, for example with a Phaser sound marker `{start: 0, duration: 1.2, config: {loop: true}}`, so the 30 ms tail is not part of the loop.
- If it must stay a one-shot, call it `sfx_wheel_squeal` (one-shot) and play two instances 0.6 s apart. The manifest note should then stop calling it loopable.

### M6 (medium, decision needed): `amb_office` is the loudest ambience bed in the game

**Where:** `amb_office`, volume 0.422, delivered as integrated LUFS + 20 log10(volume).

**What is wrong**

Measured with the same meter on mono decodes:

| Key | Delivered |
|---|---|
| **amb_office** | **−31.0** |
| amb_fire_big | −35.3 |
| amb_town | −36.8 |
| amb_warehouse | −37.2 |
| amb_bank | −37.8 |
| bgm_village (stereo, downmixed, so it reads low) | −27.2 |

- The office "texture" bed is **4.3 dB above a burning building** and 6.8 dB above the bank.
- The office also fires `sfx_typewriter` one-shots (delivered Mmax −26) every 0.55–0.8 s per typist, on top of a bed that already types continuously.
- The builder followed the contract's "−26 LUFS" literally, as the target before headroom. The contract value is the problem: the audio1–6 targets for indoor beds are −32.5 (bank) and −32 (warehouse).
- One-shots, for comparison:

| Key | Delivered |
|---|---|
| typewriter | −26.0 / −25.9 / −25.9 |
| switch clack | −24.3 |
| mailbox | −24.0 |
| coin sack | −23.6 × 3 |
| sfx_stamp | −23.8 |
| sfx_coin_count | −23.5 |
| sfx_newspaper | −23.8 |
| sfx_door | −24.1 |

  These are in family.

**Evidence:** `$S/shots/audio_squeal_and_beds.png` (bottom) and `$S/audit/audio_levels.txt`.

**Fix**
- Ask the lead and the designer to listen to `docs/previews/audio7_demo.mp3` in the game mix.
- My suggestion is a target of −30.5, which is volume ≈ 0.25. The office then sits about 2 dB above the bank, as "a small busy room".
- Make the one-shot typewriters the foreground, and duck the bed's own typing.

### L1 (low): the gold work ring reads as a clock face or gear

**What is wrong**
- The 12 rays are detached, flat, outlined triangles *inside* the glossy tube, pointing out at it.
- At 2–3× they read as clock ticks or a saw blade. At phone size they read as a dashed inner ring.
- They do not look like light: no glow, and the same hard outline as the tube.
- The contract's 192 × 96 frame with a 184 × 92 tube leaves no room for outward rays. That is a contract error, not the builder's.

**Evidence:** `$S/shots/cu_rings.png` and `$S/shots/m_aura_css_day.png` (column 2).

**Fix**
- Amend the frame to 224 × 112, with the same tube size and scale `ringWidth / 192` kept by drawing at `sc × 224 / 192`, so the rays can sit outside.
- Or replace the triangles with soft outline-free light streaks that brighten on the stroke.

### L2 (low): at night the aurora and the gold go dull

**What is wrong**
- The ring sits under the MULTIPLY night overlay.
- The gold `#FFC84A` becomes about (181, 147, 63), a mustard-olive.
- The aurora loses its "glowing" quality at the time of day an aurora should glow.

**Evidence:** `$S/shots/m_aura_css_night.png` and `$S/shots/cu_rings.png` (bottom row).

**Fix:** the same as H1 (the chief as a DayClock light at night), or a faint ADD duplicate of the ring above the overlay.

### L3 (low): `ui_chip` distorts below 64 px tall

**What is wrong**
- The pill is split 16 / 32 / 16 vertically.
- At 54 px tall the round ends start to point. At 44 px they become a lemon shape.
- CODE-1's chips are 50–56 logical px tall: nav chip 54, 업무 chip 50, countdown 56.
- The manifest notes only say the height "can stay 64".

**Evidence:** `$S/shots/ui_chips.png`.

**Fix**
- Make the nine-slice top + bottom = 64, so the ends never stretch vertically. Scale the chip uniformly for other heights.
- Or state in the notes: "draw at ≥ 64 px tall".

### L4 (low): four icons are the thinnest in the whole family; the hand mitten is pale on cream

**What is wrong**
- **Coverage.** These four have the lowest coverage of all 89 icons (71 house icons in ui / ui2 / ui3 / ui4 / pets2, plus the 18 of ui5). The lowest house icon is 0.29:

| Icon | Coverage |
|---|---|
| `ui_icon_route` | 0.21 |
| `ui_icon_halo` | 0.26 |
| `ui_icon_play_tab` | 0.26 |
| `ui_icon_cheer` | 0.27 |

- **Contrast against cream at 32 px.** These are the two lowest of ui5:

| Icon | Contrast |
|---|---|
| `ui_icon_hand` | 44.8 |
| `ui_icon_letter` | 49.8 |

  The family median is about 92.
- **The halo icon's chief** is about 6 CSS px tall at HUD size.
- **The hand** is the icon-only 줍기 button, drawn on a cream (`0xfff8ec`) disc.
- **The pony on `ui_icon_sleigh`** reads as a chess knight or rocking horse.

**Evidence:** `$S/shots/m_icons_css2x.png` (each ui5 icon next to its house neighbour, at 42 logical and in the HUD button), and `$S/audit/icons.txt`.

**Fix**
- Thicker strokes and bigger footprints for route, halo, play_tab and cheer.
- Give the hand a mid-blue or teal cuff and a darker outline.
- Give the pony a fuller head with a forelock and a harness.

### L5 (low): the aurora spins once every 1.2 s

**What is wrong**
- The contract says "once round per loop", and 12 frames at 10 fps is 1.2 s.
- Under a character the player watches all game, it reads as busy, gamer-RGB spinning. The plan's breathing is 2.4 s and the motes turn once in 6 s.

**Fix:** play it at 5 fps (2.4 s per turn) in code. Or, with the M4 trim, make 8 frames at 4 fps.

### L6 (low): the `amb_office` wall clock is masked

**What is wrong**
- Folding at 1.0 s shows the tick is there: +9.8 dB over the folded median in 1.5–5 kHz.
- It is the loudest event in only 5 of the 24 seconds.
- The contract lists "a clock tick" as one of the four ingredients. The builder knew this.

**Fix:** raise the tick about 4 dB, or leave gaps in the typing every few seconds.

### L7 (low): the soft glows touch the frame edge

**Where and how much:**

| Frame | Edge | Max α |
|---|---|---|
| `chief_halo` | top / bottom apex | 14 / 255 |
| `chief_halo_gold` | edge | up to 29 |
| `chief_marker` drop shadow | right edge | 32 |
| `nav_edge` shadow | right edge | 18 |

This is invisible at phone scale. It would be a faint flat cut on a big desktop close-up.

### L8 (low): `chief_marker_0` and `chief_marker_3` are byte-identical

The sweep holds for 2 ticks every loop. Drop frame 3, or make it a real "rest" frame on purpose and document it.

### L9 (low): the letter ruling stretches, and the destination badge has no name plate

**The ruling (builder known)**
- `ui_letter`'s ruled lines live in the stretched centre, so their spacing depends on the panel height.
- Text cannot be laid out on the lines.
- Fix: ship the ruling as a separate 9-slice-free tile, or let the game draw the lines at its own text line height.

**The name plate**
- `nav_badge` has no place for the short name (`광장 판매대`).
- CODE-2 must draw a world text with its own backing. At zoom 0.6 a 19 px world font is about 6 CSS px, so it is unreadable without a constant-size label.

### L10 (low, listen): the typewriter may sound like wooden knocks

**What is wrong**
- The spectral centroid is 0.89 kHz, with 0.4 % of the energy above 4 kHz.
- There is a strong 100–300 Hz body thump on every clack.
- Real type-bar clacks have their energy at 2–5 kHz.
- "Soft key clacks" is the brief, but nobody has listened yet.

**Fix:** check by ear. If it reads as knocking, add a short bright 2.5–4 kHz click layer about −10 dB under the body.

### L11 (low): the "you are here" pin and the "go here" badge are the same teal pin

**What is wrong**
- At zoom 0.6, `chief_marker` (teal, star) and `nav_badge` (teal, item icon) are the same shape family and the same colour.
- This follows the contract, so it is a design note, not a defect.

**Fix:** a warm gold rim or body on the chief pin would separate "me" from "there".

### L12 (low): contract housekeeping

- **`ui_icon_play_tab`.** The rename is right. Amend CONTRACT_V42 §AL so CODE-2 and later reviews do not look for `ui_icon_play`. Note: today's settings tabs are text-only (`UI.js:952`).
- **The pin bob.** The plan says "`chief_marker` 4 f bob". The contract says "light sweep, no bob". ChiefAura adds a code bob of ±2 px. Choose one.

---

## 3. What works (keep it)

**Aura ring**
- It reads on all four grounds and at night, with the dark teal rim doing its job on snow.
- It stays 45 CSS px on the phone at zoom 0.6, 1.0 and 1.2 (0.72 device px per texel at DPR 3), and stays clean at DPR 2 (0.48 px per texel; `$S/shots/m_dpr2_ring.png`).
- In a crowd at zoom 0.6 the pin finds the chief instantly, and the ring never draws over a character (`$S/shots/m_crowd_zoomed.png`).

**Navigation pieces**
- All 16 chevron headings are right, the contact shadow keeps one direction, and the chevrons are clean decals.
- The dots and target ring read on snow, cobbles, dirt and the plaza (`$S/shots/cu_chev_*.png` and `cu_nav.png`).
- The badge and edge icon discs line up with `iconRect`.

**ui5**
- The panels are lovely:
  - the chalkboard has its wooden frame and chalk tray;
  - the letter has its flap band and red margin line;
  - the tabs have a clear on and off state;
  - the status dots are distinct at 20–32 px (`$S/shots/ui_panels.png`).
- The icons at 96 px are fully in the house soft-toy style (`docs/previews/ui5_icons.png`).

**Clean contract**
- There are no key clashes across the 47 manifests, and the rename is documented.

**audio7**
- The one-shot levels match their neighbours.
- The coin variants really differ.
- The bells are tuned, and every peak is at or below −1.8 dBFS.
- The loop seam is clean, and the sprite gaps survive a decoder that ignores the gapless header: a 25 ms shift still fits in the 50 ms gap plus the 30 ms tail.

---

## 4. Numbers

| Set | Files | Payload | Texture (RGBA) |
|---|---|---|---|
| chief_fx | 3 | 786 KB png + 23 KB json | page 2.802 MiB (trimmed 2.608, source-sum 3.200) |
| ui5 | 3 | 219 KB png + 17 KB json | page 1.498 MiB (frames 1.420, of which panels ≈ 0.92) |
| audio7 | 3 | 69 KB sprite + 241 KB loop + 6 KB manifest | — |

Harness: 31 page loads at 390 × 844 (29 at DPR 3, 2 at DPR 2), zoom 0.6, 1.0 and 1.2, by day and by night: 0 page errors, 0 console errors, 0 × 404.

## 5. Repro

```
S=/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v42art_v42_fx_ui_audio_review
cd $S
python3 fr.py                       # extract every frame (full sourceSize) to $S/frames
python3 audit1.py; python3 audit_chev.py; python3 audit_icons.py
venv/bin/python aud1.py; venv/bin/python aud2.py; venv/bin/python aud3.py; venv/bin/python aud4.py
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers nice -n 10 node harness.mjs \
  "aura_z0.6_n1=mode=aura&zoom=0.6&night=1&freeze=1&t=0.3" \
  "crowd_z1.0_n0=mode=crowd&zoom=1.0&freeze=1&t=0.4&seed=11" \
  "nav_z0.6_n0=mode=nav&zoom=0.6&freeze=1&t=0.5&seed=5" \
  "ui_icons=mode=ui&sub=icons" "ui_panels=mode=ui&sub=panels" "ui_chips=mode=ui&sub=chips" "probe=mode=probe"
python3 css.py out.png - 1 shots/<capture>.png      # phone-true (CSS px) montage
```

These are the page modes:

| Mode | What it shows |
|---|---|
| `aura` | the 4 grounds × 5 states |
| `crowd` | 22 dolls with `glow=0/1` and `pin=0/1` |
| `behind` | villagers behind the chief, glow on and off |
| `nav` | route, chevron, dots, ring, badge, edge badges, chips and HUD buttons |
| `ui` | icons, panels and chips |
| `probe` | the CODE-1 texture-key path |
