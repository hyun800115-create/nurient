# v42_chief2: the chief's new anims (CONTRACT_V42 §AH), after polish

This job adds 9 new anims for the chief as character `player_b`. It extends the existing `player` and uses the player rig itself, so the outfit, light, outline and scale are unchanged. The new frames live in their own atlas, `char_player_b`. The `char_player` atlas, `assets/characters` and every `char_*` tool are byte-identical: `git status` is clean for them and the sha256 baseline taken before the job still matches (44 / 44).

**Polish round.** This report covers the set after the critic's review (`docs/build_reports/v42_chief2_critique.md`, verdict "polish": 0 critical, 1 high, 4 medium, 8 low). Every finding that could be fixed inside this job's paths is fixed. The table in [Polish: finding by finding](#polish-finding-by-finding) gives the status of each one.

## 디자이너용 요약 (쉬운 말)

- **응원이 이제 응원처럼 보여요.**
  - 촌장님이 작은 **청록색 서리마을 응원 깃발**(크림색 눈꽃 무늬, 자작나무 막대, 금색 꼭지)을 들고 높이 흔들어요.
  - 깡충 뛰기도 5 px에서 **9 px**로 높아졌어요.
  - 다른 손은 "아자!" 하고 주먹을 쥐어요.
  - 휴대폰(줌 0.6)에서도 파란 깃발이 보여서 손 흔들기와 헷갈리지 않아요.
- **옆모습 손 흔들기가 더 이상 "입 가리기"로 보이지 않아요.**
  - 옆모습(E/W)에서는 팔을 앞으로 쭉 뻗어 기차 쪽으로 손을 흔들어요. 장갑이 얼굴에서 떨어져 있어요.
  - 비스듬한 모습(SE/SW)에서는 머리 옆 위쪽, 머리 바깥에서 흔들어요.
  - 정면(S) 손 흔들기는 원래대로예요.
- **손 녹이기 정면**은 두 손을 가슴 높이에서 벌리고 손바닥을 내밀어요. 살짝 비비는 동작도 있어요.
- **응원 중 발이 땅에 붙어 있어요.** 무릎을 굽혀 앉았다 뛰어도 발 위치가 원래 서 있는 자세와 같아요.
- **신문 읽기**는 "펼치기 한 번 → 읽기 반복"으로 나눠 두었어요. 1초마다 신문이 접히지 않아요.
- **밤 10시 졸기**는 난로 앞이 아니라 **책상 의자**에서 해요. 난로 앞에는 의자가 없거든요. 난로 앞에서는 서서 손을 녹여요.
- 남은 것: 사무실 책상 위 파란 상자와 스탠드가 촌장님 손 자리에 있어요. 이건 사무실 그림 쪽에서 옮겨야 해요.

## Files: 3 of the 3 the AH budget allows

| File | Size | Contents |
|---|---|---|
| `assets/chief2/char_player_b.png` | 331,248 B (323 KB) | 544 × 1492, 256-colour imagequant palette (same as `char_player`). RGBA source-sum **3.10 MiB**, budget 3.5 (before polish: 736 × 1048, 2.94 MiB). |
| `assets/chief2/char_player_b.json` | 42,937 B | Phaser JSON hash, trimmed, `sourceSize` 128 × 128 kept. 216 rectangles: 150 anim frames and 66 `_desk` overlays. There are also 36 alias names (the `sit_read_in` / `sit_read_loop` frames), which reuse those rectangles. |
| `assets/chief2/manifest.json` | 8,800 B | §2 format: `version`, `generator`, `conventions`, `atlases`, `characters.player_b`. |

- **Total on disk:** 382,985 B.
- **Texture memory:** `char_player_b` adds 3.10 MiB. It only needs to be resident where the chief sits, chats or cheers. It is one page with no social split.
- **Repack check:** repacking from the cache gives byte-identical files.

## Keys and fields

`characters.player_b`:

| Field | Value | Meaning |
|---|---|---|
| `extends` | `"player"` | Merge `anims` into the player def. Each anim names its own `atlas: "char_player_b"`. All other player fields stay: `carryPoint`, `petPoint`, `shadow`, portrait, the old anims. |
| `atlas`, `frameSize`, `anchor`, `frameName` | `char_player_b`, [128, 128], [0.5, 0.8125], `{anim}_{dir}_{i}` | Identical to `player`, so this is also a complete standalone character def. |
| `dirs`, `mirror` | S, SE, E; SW ← SE, W ← E | Each anim also lists `dirs: [S, SE, E]`. NE and N do not exist; `Character.play` turns him to the nearest rendered dir. |
| `headTop` | −81 | Standing, the same as `player`. Some anims override it: see the per-anim `headTop` row below. |
| `headTopSit` | −67 | Seated head top above the seat point, for bubbles and `emote_zzz`. The contract estimated about −62. |
| `seat.heightM`, `deskTopM`, `deskEdgeM`, `hipBackM` | 0.45, 0.72, 0.10, 0.12 | The geometry the seated anims were posed against. |
| `seat.floorBelowPx` | 25 | The floor is 25 px below the seat point (0.45 m × 64 × cos 30°). Draw his shadow there. |
| `seat.deskEdgePoint` | S [0, −12], SE [5, −13], E [6, −15] | The centre of the desk top's near edge, in px from the anchor. |
| `deskOverlay` | suffix `_desk`; anims `sit_idle`, `sit_write`, `sit_read`, `sit_eat`, `sit_read_in`, `sit_read_loop` | Optional; see "The desk overlay". |
| `anims.sit_write.impactFrame` / `impactPoint` | 4; S [7, −7], SE [16, −12], E [16, −18] | The stamp's rubber face on the desk. Spawn the stamp puff and `sfx_stamp` there; negate dx for SW and W. |
| `anims.sit_read.loopFrom` / `playAs` | 2 / `["sit_read_in", "sit_read_loop"]` | Frames 0–1 play once (fold-out), then frames 2–5 loop. **New:** `playAs` names the two alias anims that do this with no code. |
| **new** `anims.sit_read_in` | 2 f · 6 fps · repeat 0, `aliasOf {anim: sit_read, from: 0}`, `next: "sit_read_loop"` | Its frame names point at the very same atlas rectangles as `sit_read_*_0..1` (and their `_desk` overlays). They add no texture. |
| **new** `anims.sit_read_loop` | 4 f · 6 fps · loop, `aliasOf {anim: sit_read, from: 2}` | Points at `sit_read_*_2..5`. This is the seam-free reading loop. |
| **new** per-anim `headTop` | talk −82, wave −85, cheer −93 | These are the head tops while the anim plays: the talk nod, the wave lean and the cheer hop. Use them for bubbles and the star pin. |
| **new** `anims.cheer.propTop` / `prop` | −96 / `"pennant"` | The pennant's top. It flies beside the head, not above it. |
| **new** `anims.cheer.repeatDelay` | 600 (ms) | Pacing hint: Phaser anim config `repeatDelay`. The last frame (pennant up, standing tall) holds, so he hops once every 1.2 s instead of 100 times a minute. |
| **new** `anims.doze.frameHold` | `{"2": 1600}` (ms) | Pacing hint: Phaser per-frame `duration` on frame 2. The deepest nod lingers, so he nods every ~2.9 s instead of every 1.3 s. |
| **new** `anims.doze.placeAt` | text | Use a seat point only: the office `chiefDeskPoint` (the desk chair), or bench and log `seatPoints`. **Never** use the office `stovePoint`, which is a standing ground point. |
| `anims.*.seated` | true for the 5 seated anims and both aliases | The anchor is the seat point. |

The contract anims and their frames, fps, repeat and dirs are unchanged. The extra anims are aliases only. `ch2_check.py` refuses any other extra anim.

## The anims

All frames are 128 × 128 and rendered in S, SE and E. Rows marked **polish** were re-posed and re-rendered in this round. Everything else is byte-identical in the render cache.

| Anim | f · fps | Anchor | What you see |
|---|---|---|---|
| `sit_idle` | 4 · 4 loop | seat point | Mittens resting wide on the desk edge, slow breathing, a little finger tap (f1), a smile (f1), a blink (f2), soft head turns. |
| `sit_write` | 6 · 8 loop | seat point | Writes with a big teal goose quill (f0–3). The left mitten lifts a wooden desk stamp (f3), slams it (**f4 impact**, a body dip and an open-mouth "hup"), and lifts it again with happy eyes (f5). |
| `sit_read` | 6 · 6, loopFrom 2 | seat point | Lifts the folded paper (f0), shakes it open (f1), then reads with small page wobbles while his head follows the lines (f2–5), with a blink on f4. The paper is cream with grey columns, a masthead band, a photo box and an ad box. There is no text. |
| `sit_eat` | 6 · 8 loop | seat point | A red bowl of golden stew stays on the table. The spoon goes bowl → up → mouth → **happy squint ^^ (f3)** → down → bowl. |
| `doze` | 4 · 3 loop | seat point | Mittens folded, sleeping eyes. His head sinks forward (f0–2) and jerks back up (f3). The game adds `emote_zzz` at `headTopSit`. Frame 2 holds 1.6 s with the hint. |
| `talk` | 8 · 10 loop | feet | Matches townfolk `talk` timing: the mouth cycles, nods on f1, f4 and f7, the right mitten explains in palm-up circles. |
| `wave` (**polish SE / E**) | 6 · 10 loop | feet | **S:** unchanged; the right mitten wags beside the head. **SE / SW:** the arm goes up and out past the head's silhouette, toward his right-back, with a few px of clear space. It wags outward and back, never in toward the face, and he leans a little away from it. **E / W:** the arm reaches forward toward the camera side (the train he waves at is ahead of him). The mitten wags up and down at chin height, clear of the face. His head turns a little toward the camera, so the ^^ face reads. |
| `warm_hands` (**polish S**) | 4 · 5 loop | feet | **S:** both mittens spread wide at chest height, palms out with the thumbs up, rubbing (one up, one down on f1–2). **SE / E:** unchanged, mittens forward at the chest. In every dir the shoulders shrug up with cosy cold and he has content ^^ eyes. |
| `cheer` (**polish, all dirs**) | 6 · 10 loop (+ repeatDelay 600 hint) | feet | A little **teal 서리마을 pennant** (cream snowflake, birch stick, brass knob, no text) in the right fist. **f0** planted squat with the pennant held low by the shoulder. **f1** springs up and swings the pennant high. **f2** HOP: the boots leave the snow by **9 px**, legs tucked, the left arm out for balance. **f3** comes down. **f4** a planted landing squash with an "아자!" left fist pump. **f5** stands tall with the pennant high and the flag fluttering. The flag ripples on every frame. It flies out above his shoulder line, beside the head in S / SE / SW and ahead of him in E / W, so it never crosses the face. |

The faces, the props (quill, stamp, newspaper, bowl, spoon) and now the pennant are hidden objects added to the player rig in `ch2_build.py`. They are switched on per frame. Nothing of the original player was moved, recoloured or reshaped.

## Polish: finding by finding

| Finding | Status | What changed | Proof |
|---|---|---|---|
| **H1** cheer reads as wave; nothing goes overhead; 5 px hop | **fixed** | The pennant puts teal colour above the shoulder line in every frame. The fist is punched high, using the rubber-hose sleeves (`_hose`). There is a two-handed rhythm: the right hand holds the pennant and the left gives an "아자" pump. The hop is now **9 px** in S, SE and E (feet +4 → −5). One mitten still goes up, as the contract says; the pennant carries the "overhead" that a 0.275 m chibi arm cannot reach over a 0.6 m head. | `chief2_polish_before_after.png`; `chief2_cheer.gif`; `chief2_phone_z06.png` (the flag shows at 26 CSS px); `ch2_check`: hop ≥ 8 px and teal pixels ≥ 25 in every cheer frame |
| **M1** wave / cheer E and W (and wave SE) put the mitten at the face | **fixed** | wave SE / E and cheer E / W were re-posed so the mitten sits outside the head silhouette: SE up-left of the head, E forward of the face. He leans away, and the wag swings outward. wave S is unchanged. | `chief2_polish_before_after.png` rows E / SW / W; `chief2_phone_z10.png` (wave W, wave SE and cheer E in the bottom row); worst IK miss 1.1 cm |
| **M2** a plain loop of `sit_read` snaps the paper shut every second | **fixed** | The manifest no longer offers "the whole 0–5 loop". `sit_read_in` → `sit_read_loop` ship as alias anims that the stock `Assets.buildCharacter` builds unchanged. `playAs` names them. | `chief2_phaser.mjs`: the desk chief plays `sit_read_in`, then the loop; 0 alias mismatches (Phaser `cutX`/`cutY` compared); `ch2_check` alias rectangle check |
| **M3** the 22:00 "doze by the stove" has no seat | **fixed (by placement)** | `anims.doze.placeAt` and `conventions.office`: he dozes on the desk chair at `chiefDeskPoint`, never at `stovePoint`. The stove part of the routine is `warm_hands`, standing at `stovePoint`. No new art was needed. | `chief2_office_close.png`, right panel: doze on the desk chair with `emote_zzz` at `headTopSit` |
| **M4** the office desk's blue box and lamp sit in his work area | **won't fix here (office art)** | This is outside chief2's paths. The `_desk` overlay is correct, and the polish (L5) makes the lamp's depth consistent: the lamp is now always in front of his right forearm, instead of being half-cut by the paper. **Request to the office job:** keep a 0.5 × 0.35 m area in front of `chiefDeskPoint` free of desk props (move the blue box and the desk lamp to the far corners). The office files are dated 20:33 and still have them. | `chief2_office_close.png`, `chief2_office.gif` |
| **L1** warm_hands S reads as hands clasped at the belly | **fixed** | S only: the mittens are spread at chest height, palms out, with a small rub on f1–2. | `chief2_polish_before_after.png`, bottom row |
| **L2** cheer crouch sinks the boots 2 px and widens the stance | **fixed** | The crouch frames are planted squats: the shins stay vertical and the hips sit back by `0.15·sin(h)`. The boots keep the idle ground row and stance exactly (S +4, 52–62 / 65–75; SE +5, 55–75; E +5, 59–72). | `ch2_check` now checks every standing non-hop frame against `char_player` idle (±1 px) |
| **L3** cheer hops 100 times a minute; doze nods every 1.3 s | **fixed (hints)** | `cheer.repeatDelay` 600 and `doze.frameHold` {2: 1600}. They are Phaser-native (`repeatDelay`, per-frame `duration`) and verified in the Phaser test. The art stays exactly per contract. | `chief2_phaser.json`: `cheerRepeatDelay` 600, `dozeHoldMs` 1600 |
| **L4** one `headTop` for every standing anim | **fixed** | Per-anim `headTop` (talk −82, wave −85, cheer −93) and `cheer.propTop` −96. The head top is measured from the hair (the pennant is excluded), calibrated on talk. | `ch2_check`: every anim's frames lie within its `headTop` (±1) and `propTop` equals the measured value |
| **L5** the overlay double-draws its soft edge where no desk is under it | **fixed** | `ch2_pack` keeps overlay pixels only on the desk side of the desk's near-edge line on screen (2 px margin). Anything beyond that line is above the desk top in 3D and never under the desk art. | `ch2_check`: no overlay pixel more than 2.5 px past the line. Checked in the real office: the overlay pixels no longer drawn over the office desk layer total 621 over all desk frames (73 distinct positions). They are the left half of the desk lamp's shade and a few dots on the blue box and quill stand. Those objects now stay in front, which is the correct depth (M4) |
| **L6** seated boots dangle about 0.2 m; "four feet" in S | won't fix | The rig's 0.34 m legs cannot reach a 0.45 m seat height. This matches townfolk2 `sit` and officefolk. Re-rendering every seated S frame to lighten the knees would change the look shared with the townsfolk. | documented |
| **L7** mirrored dirs flip handedness and light | won't fix | House style: `char_player` mirrors the same way. | documented |
| **L8** integration notes (merge, overlay sync, shadow, lunch plate, seat dirs, 1.6 preview) | **addressed in this report** | See "How the game uses this". A zoom 1.6 phone capture was added. | `chief2_phone_z16.png` |

## How the game uses this (for CODE-2)

**Merge.**
- Add `chief2` to the late or lazy fragments. List `char_player_b` in the packer and loader like any other atlas.
- On merge, copy every `player_b.anims[a]` into `player.anims[a]`, keeping `atlas: "char_player_b"`.
- Two lookups must honour the anim's atlas, or the merged anims silently fall back to `idle`:
  - In `Assets.buildCharacter`, look up frames with `this.texOf(a.atlas || def.atlas, fn)`.
  - `Character.play` asks `Assets.socialPage(this.def.atlas, name)`; it needs the same `a.atlas || def.atlas`.
- `tools/test/chief2_phaser.mjs` has a 10-line `mergeExtends` and a `buildChar` that do exactly this.

**Pacing (optional, two lines in `buildCharacter`).** Pass `repeatDelay: a.repeatDelay || 0` to `anims.create`. Map `a.frameHold` to per-frame `duration`: `{ key, frame, duration: hold[i] }`. The test harness shows both.

**Reading at the desk.** Play `sit_read_in` (repeat 0). On `animationcomplete`, play `sit_read_loop`; or play just `sit_read_loop`. Do the same for the `_desk` overlay sprite. Never loop `sit_read` 0–5 plainly.

**Standing anims** (`talk`, `wave`, `warm_hands`, `cheer`) play like any player anim.
- While one plays, put bubbles and the star pin at its `headTop`, falling back to −81.
- The cheer's ♪ notes can start at `headTop` −93.
- The pennant (`propTop` −96) flies beside the head, out to his right in S / SE / SW and ahead in E / W.

**Seated anims.**
- Put the sprite at the seat point itself: the office `chiefDeskPoint` facing SW, bench and `log_seat` `seatPoints`, or a restaurant chair. The anchor already includes the 0.45 m seat height.
- Draw his shadow and AG halo `floorBelowPx` (25) lower. `Character.sync` puts the shadow at `y + 1` by default.
- In the office he goes in `@behind` (bandDepth −0.20).
- Only offer him seats that face S / SE / SW / E / W. NE / N / NW seats have no seated dirs, and he would sit facing away from the table.

**The desk overlay** (`{anim}_{dir}_{i}_desk`) is an addition beyond the contract and is optional.
- **Why it exists.** The office draws `chief_office_interior_front` (the whole desks, tops included) over `@behind`. That layer hides his mittens, quill, stamp, bowl and half of the newspaper.
- **What it holds.** It keeps only what lies on the desk: forearms, mittens and props in front of the desk's near edge, 0–0.31 m above the top, and (polish) on the desk side of that edge on screen.
- **How to draw it.** Draw it at the same position, with the same frame name every frame (copy it after the anim update) and the same flipX, right over the desk art: office depth = building + **−0.095**.

**22:00 routine (M3).**
1. `warm_hands` standing at `stovePoint`, facing the stove (W is the nearest rendered dir).
2. Then walk to the desk and play `doze` at `chiefDeskPoint` with `emote_zzz` at `headTopSit`.

Do not play `doze` at `stovePoint`.

**Lunch (`sit_eat` at `picnic_table`).** `BigRestaurant.flyToTable` also flies a plate to the table, so either skip that plate for the chief or accept two dishes. With `seatDepth: "behind"` the table top does not hide his bowl, so no overlay is needed there.

**Code fallbacks these keys replace (plan §16.1).**
- In CODE-1 every one of these anims resolves to `idle` through `Assets.ANIM_FALLBACK`; `wave` goes → `happy` → `idle`.
- With `chief2` loaded:
  - office desk → `sit_idle` / `sit_read_in`→`sit_read_loop` / `sit_write` at `chiefDeskPoint`
  - 점심 → `sit_eat`
  - 22 h → `warm_hands` at the stove, then `doze` on the desk chair
  - 수다 → `talk`
  - 기차 구경 → `wave`
  - 쉬기 campfire → `warm_hands`
  - 촌장 응원 and ribbon → `cheer`

## Pipeline (re-run)

```
nice -n 10 /tmp/bvenv/bin/python tools/blender/ch2_render.py -- --anims all    # ~2 min from scratch: 150 frames + 66 desk masks
python3 tools/blender/ch2_pack.py        # ink outline (char_pack.ink_outline), atlas + aliases, manifest
python3 tools/blender/ch2_preview.py     # docs/previews/chief2_*
python3 tools/blender/ch2_check.py       # 0 errors
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/test/chief2_phaser.mjs   # Phaser 3.90 load test + phone + office captures
```

- **This round re-rendered only what changed:** 34 frames (`cheer` × 18, `wave` SE / E × 12, `warm_hands` S × 4), about 35 s in total. The other 116 frames and 66 masks were reused from the cache unchanged.
- **Modules:**
  - `ch2_anim.py`: pure-Python poses.
  - `ch2_build.py`: `char_build.build('player')` plus the extras.
  - `ch2_render.py`, `ch2_pack.py`, `ch2_preview.py`, `ch2_check.py`.
- **Additions in `ch2_build.py`:**
  - the pennant prop: a UV-textured teal flag with a hem and a snowflake, and a per-frame travelling ripple;
  - `_held` props, placed in the solved fist with root-local axes;
  - `_hose` sleeves: the sleeve capsules lengthen with the rubber-hose stretch, so a long reach stays one continuous sleeve. It is opt-in, so the other anims are unaffected.
- **Cache:** `/tmp/fv_cache/chief2/player_b`.
- **Props stay in the hands.** Each prop is placed by its business point, and the mitten is IK-solved onto its grip. The worst IK miss in the final render is 1.1 cm (wave E).

## Checks (`ch2_check.py`: 0 errors)

**Contract, manifest and atlas:**
- The 3-file budget holds.
- The manifest has the contract shape; `frameSize`, `anchor`, `frameName` and `headTop` are identical to `player`.
- Each contract anim has its frames, fps and repeat, dirs S/SE/E and seated flag; `impactFrame` 4 and `loopFrom` 2 are present.
- The only extra anims allowed are the two `aliasOf` anims.
- All frame names are present with no extras.
- Every source size is 128 × 128 and every rect is inside the sheet.
- No two distinct rectangles overlap. The aliases share their source's rectangle, and the check requires them to.
- The sheet is at most 2048 px a side and the RGBA source-sum is at most 3.5 MiB.

**Anchors and points:**
- **(L2)** Every standing frame except the hop keeps `char_player` idle's boot row and boot columns within 1 px.
- **(H1)** The cheer hop lifts the boots ≥ 8 px (measured 9), and the pennant shows (≥ 25 teal px) in every cheer frame.
- Seated boots hang below the seat point.
- No frame is clipped.
- **(L4)** Per-anim `headTop` covers its frames, and `cheer.propTop` matches the measurement.
- `headTopSit` is measured.
- `impactPoint` lies on the stamp, and the desk points lie inside the frame.

**Overlays:**
- Each `_desk` overlay lies on its own frame (≥ 99 %) with matching colours.
- **(L5)** No overlay pixel lies more than 3 px past the desk edge line (measured 2.5).

**Polish manifest rules:**
- **(M2)** `playAs` is present, and no convention text offers the plain 0–5 loop.
- **(L3)** The pacing hints are present.
- **(M3)** `doze.placeAt` warns against `stovePoint`.

**Props show:**
- the newspaper in `sit_read` f2–5;
- the quill in `sit_write`;
- the bowl in `sit_eat`.

**Protected files:**
- `git status` is clean for `assets/characters`, `char_*.py`, `bl_common.py` and `pack_utils.py`.
- The sha256 baseline matches 44 / 44.

**The check bites.** Run against the pre-polish files, it reports 40 errors: the stance shuffle, the 4 px hop, no pennant, no `playAs`, the plain-loop wording and no pacing hints.

## Phaser 3.90 test (`tools/test/chief2_phaser.mjs`: OK)

**Desktop:**
- The real `char_player` and `char_player_b` are merged with `extends`.
- **101 anims** were built (the old player anims, the 9 new ones, the 2 aliases and the `:desk` ones), with `repeatDelay` and `frameHold` passed through.
- **582 frames** were checked: 0 missing, **0 alias frames off their source rectangle**, 0 page errors, 0 × 404.
- All 65 sprites are playing. In Phaser, cheer `repeatDelay` is 600 and doze f2 `duration` is 1600.

**Phone** (390 × 844 CSS px, DPR 3, k 1.65):
- **The office scene:** the real office revealed, with the chief at his desk reading via `sit_read_in` → `sit_read_loop`. The `_desk` overlay is playing and follows the frame.
- **Outdoors:** `warm_hands` at the campfire, `doze` on a `log_seat` seat point, `talk` with a villager, `wave` S / W / SE, `cheer` SW / S / E, and the old idle.

| Zoom | CSS px per world px | Chief height | Pennant flag |
|---|---|---|---|
| 0.6 | 0.325 | 26 CSS px | ≈ 6 × 3.5 CSS px: a clear teal tick above his shoulder |
| 1.0 | 0.542 | 43 CSS px | ≈ 10 × 6 CSS px, the snowflake visible |
| 1.2 | 0.65 | 52 CSS px | ≈ 12 × 7 CSS px |
| 1.6 | 0.867 | 69 CSS px | ≈ 16 × 9 CSS px |

- **At 0.6:** every anim reads by silhouette. Cheer is now unmistakable (a blue flag up); wave SE is an arm up and out, and wave W an arm reaching forward.
- **At 1.0 and up:** the faces read (^^, sleeping eyes), and so do the quill, stamp, bowl and newspaper print.

**Office close-up** (`chief2_office_close.png`, 3 px per world px): three panels at the real `chiefDeskPoint`:
1. the reading loop through the aliases, with the overlay;
2. lunch with `sit_eat` and the overlay;
3. the 22:00 doze on the desk chair with `emote_zzz` at `headTopSit`.

## Previews (`docs/previews/`)

- `chief2_polish_before_after.png`: **this round.** Wave and cheer, before and after, in S / SE / E / SW / W at phone scale (zoom 1.0), plus warm_hands S before and after.
- `chief2_sheet.png`: every anim × dir × frame at 2×.
  - Red line: the anchor / seat line.
  - Blue line: the player's head top −81.
  - Gold cross: the impact point.
  - The cells are now wide enough for the pennant.
- `chief2_<anim>.gif` × 9: the old `idle` S and `walk` SE next to the new anim in S, SE, E and SW (flipped).
  - Seated anims are shown on a mock chair and desk with the overlay, and also bare.
  - **Now paced as the manifest suggests:** `sit_read` intro then loop, cheer `repeatDelay`, doze `frameHold`.
- `chief2_desk.gif`: the 관망 desk routine facing SW at 2× and 1×, paced the same way.
- `chief2_office.gif`: the same routine at the real office desk, 3×, layers-only next to with-overlay.
- `chief2_office_close.png`: the Phaser office close-up (reading via the aliases, lunch, the 22:00 doze on the chair).
- `chief2_lineup.png`: game scale and 3× lineup against the old idle.
- `chief2_phaser.png`, `chief2_phone_z06.png`, `chief2_phone_z10.png`, `chief2_phone_z12.png`, `chief2_phone_z16.png`.

## Known issues and deviations

1. **The pennant is a new prop** (the cheer's "overhead"): this is a deliberate reading of the contract.
   - The contract asks for "one mitten overhead with a small hop".
   - A 0.275 m chibi arm cannot clear a 0.6 m head, so the fist goes as high as the rubber-hose arm allows (beside the crown) and the pennant carries the colour above it.
   - The hop is 9 px; the contract says "small", and the critic asked for 8–10 px.
   - If the lead prefers no prop, the same pose without `'pennant'` in `_show` re-renders in about 20 s.
2. **wave E / W is a forward reach**, not a hand beside the head. In profile, a hand beside the head can only sit on the face or on the brown hair. The forward reach toward the train keeps the mitten clear of the face and reads as hailing someone ahead.
3. **The office desk props** (M4, the blue box and the lamp) overlap his work area. The fix belongs to the office art; it is requested above. With the L5 cut, the lamp is drawn consistently in front of his right forearm when he faces SW.
4. **Feet and floor.** The contract says the feet rest on the floor 0.45 m below. The chibi legs are 0.34 m and cannot reach, so the boots hang about 0.15–0.2 m above it. This matches townfolk2 `sit` and officefolk.
5. **`headTopSit` is −67, not about −62.** It is measured, and the manifest carries the real value.
6. **Per-dir cheats:**
   - `wave`, `cheer` and `sit_read` place the hand or prop per dir, so it stays readable and off the face.
   - `warm_hands` S spreads the mittens wider than SE / E (only facing the camera loses the "forward").
7. **The `_desk` overlay and the alias anims are additions** to the contract. Neither costs texture beyond the overlays' 0.22 MiB, and both are optional for CODE-2.
8. **Texture memory grew** from 2.94 to 3.10 MiB, because the pennant frames are wider and taller (budget 3.5).
9. **Mirrored dirs** flip handedness and light (house style, as in `char_player`).
