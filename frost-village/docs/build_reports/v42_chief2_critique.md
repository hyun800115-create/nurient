# v42_chief2: adversarial art review (the chief's new anims, CONTRACT_V42 §AH)

**Verdict: polish.**

The set is technically clean, and it matches `char_player` exactly: the same rig, outline, colours and scale. The
seated anims at the office desk look good on a phone, and the desk overlay works. Two anims do not yet say what they
should:

- **`cheer` reads as `wave`.** It is the 촌장 응원 pose, which the player will see often.
- **`wave` and `cheer` in E / W** put the mitten in front of his face. At phone size that reads as "hand to mouth".

Three smaller points are about how the art meets the game:

- `sit_read` in a plain loop snaps the newspaper shut every second.
- The planned "doze by the stove" has no seat.
- The office desk props sit in his work area.

None of this needs a new art direction. It means re-posing two anims and changing a few manifest lines.

**What I tested**
- **The set and the rules.** I treated `assets/chief2/**` as read-only. I checked it against:
  - `docs/CONTRACT_V42.md` §AH and §AN;
  - `docs/v42_plan.md` §3.2 (응원), §6.1–6.3 (office) and §7.2 (관망 activities);
  - the game's own code: `src/core/Assets.js` (`buildCharacter`, `ANIM_FALLBACK`), `src/entities/Character.js` and `src/entities/BigRestaurant.js`.
- **The harness.** I used my own Phaser 3.90.0 harness with the real neighbouring sets: `char_player`, `office`, `officefolk`, townfolk and townfolk2 paper dolls, `life_props` (`log_seat`, `log_seat_x`, `picnic_table`), `town` (`bench_x`), `props` (`campfire`) and `emotes` (`emote_zzz`).
- **Phone captures.** 390 × 844 CSS px at DPR 3, k = 1.65 (the `src/main.js` maths), at game zoom 0.6, 1.0 and 1.2, by day and by night. Night is the v4 MULTIPLY overlay at darkness 0.45.
- **Close-ups.** Desktop close-ups ran at 3–4 px per world px.
- **Office placement.** The chief sat at `chiefDeskPoint`, facing SW (the SE frames flipped), in band `behind`, with the `_desk` overlay at depthOffset −0.095. That is the builder's documented placement.
- **Outdoor placement.** He sat on the real seat props at their `seatPoints`, using their `seatDepth` rules. He stood at the campfire and chatted with a townsperson.
- **Pixel audits.** I compared every frame with the `char_player` frames: outline, halo, colour, scale, foot contact, popping and loop seams.

All my work is in the scratch folder
`/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v42art_chief2_review`, called `$S`
below.
- 22 page loads, all with 0 page errors, 0 console errors and 0 × 404.
- The builder's `ch2_check.py` still reports **0 errors**.
- The sha256 baseline the builder took of `assets/characters` and the `char_*` tools still matches (44 / 44), and `git status` is clean for them.

| Severity | Count |
|---|---|
| critical | 0 |
| high | 1 |
| medium | 4 |
| low | 8 |

---

## 0. 디자이너용 요약 (쉬운 말)

**좋은 점**
- 촌장님이 원래 그림과 똑같아요. 흰 털 파카, 갈색 벨트, 테두리 선, 색, 크기가 모두 같아요.
- 원래 촌장 그림 파일은 한 글자도 바뀌지 않았어요.
- 사무실 책상에 앉은 모습이 휴대폰(줌 1.2)에서 잘 보여요.
  - 신문을 펼치고, 깃펜으로 쓰고, 도장을 쾅 찍고, 빨간 그릇으로 밥을 먹어요.
  - 책상 위에 손과 소품을 다시 그려 주는 "책상 덧그림" 덕분에 손이 책상에 가려지지 않아요.
- 밤에도 테두리가 깔끔하고, 하얀 번짐(헤일로)이 없어요.
- 말하기·손 흔들기·손 녹이기에서 발이 미끄러지지 않아요.

**꼭 고칠 점: "응원"이 "손 흔들기"와 똑같아 보여요.**
- 휴대폰에서 정면(S) 응원 포즈는 한쪽 장갑을 귀 옆에 든 모양이에요. 손 흔들기와 거의 같아요.
- 계약서에는 "주먹을 머리 위로"라고 되어 있어요.
- 촌장 응원은 일꾼 곁에 서 있을 때 자주 나오는 동작이라 눈에 많이 띄어요.
- 고칠 방법: 두 팔 만세, 또는 작은 응원 깃발(소품)을 머리 위로 흔들기. 깡충 뛰기도 조금 더 높게요.

**그 밖에 보이는 것들**
- 옆모습(E/W)으로 손을 흔들거나 응원하면 장갑이 얼굴 앞에 와요. "입을 가리는" 동작처럼 보여요. 기차 구경 때 옆모습이 많이 나올 거예요.
- 신문 읽기를 그냥 반복 재생하면 1초마다 신문이 접혔다 펴져요. 처음 두 장면은 한 번만 재생해야 해요.
- 계획서에는 "밤 10시에 난로 옆에서 졸기"가 있어요. 그런데 난로 옆에는 의자가 없어요. 앉은 졸기 그림을 그 자리에 놓으면 공중에 떠 보여요.
- 사무실 책상 위의 파란 상자와 스탠드가 촌장님 손이 일하는 자리에 놓여 있어요. 그래서 그릇·신문·도장이 파란 상자 위에 겹쳐요.
- 손 녹이기 정면 모습은 두 손을 배 앞에 모은 모양이라 "수줍은 포즈"처럼 보여요. 모닥불 옆에서는 이해돼요.

---

## 1. Contract compliance (§AH)

| Item | Contract | Delivered | OK |
|---|---|---|---|
| Character / atlas | `player_b` in `char_player_b`, `extends: "player"` | `characters.player_b = { extends: "player", atlas: "char_player_b", anims }` | yes |
| Frame / anchor / names | 128 × 128, [0.5, 0.8125], `{anim}_{dir}_{i}` | the same, also identical to `player` | yes |
| Dirs | S, SE, E rendered; SW ← SE, W ← E | the same; every anim also carries `dirs` | yes |
| Frames · fps · repeat | sit_idle 4·4, sit_write 6·8, sit_read 6·6 loopFrom 2, sit_eat 6·8, doze 4·3, talk 8·10, wave 6·10, warm_hands 4·5, cheer 6·10, all loop | all match (`ch2_check.py` and my own audit) | yes |
| `impactFrame` / `impactPoint` | sit_write 4, stamp contact per dir | 4; S [7, −7], SE [16, −12], E [16, −18]. The red cross lands on the stamp face in the office close-up (`$S/shots/o_close_write4.png`). | yes |
| `headTop` / `headTopSit` | −81 / ≈ −62 | −81 / −67 (measured, documented). See L4. | yes (documented) |
| Same rig, outfit, light, outline | exactly the player's | Ink outline: every edge pixel is dark in both sets. Light edge pixels on the border: 0 % in both. Colour: parka white within 2–3 levels and skin within 1–3 levels of `char_player` idle. Head width 33 px in both. Quantisation: mean error vs the raw render is 1.4 levels (p99 ≤ 16). | yes |
| Existing frames untouched | byte-identical | sha256 44 / 44 match, `git status` clean | yes |
| Seated anchor | seat point, 0.45 m seat, no chair drawn | anchor on the seat, boots +12..14 px below it, floor at +25 (`floorBelowPx`) | yes |
| Feet on the floor 0.45 m below | required | they hang about 0.2 m above it (documented; townfolk2 `sit` does the same) | deviation (L6) |
| `cheer`: "raises one mitten overhead with a small hop" | overhead | beside the ear (S), in front of the face (E / W), 5 px hop | **no** (H1) |
| `wave` "toward the camera side" | | S yes; E / W the mitten is in front of the face | partly (M1) |
| `warm_hands`: "both mittens forward at waist height toward a fire" | | S: mittens clasped together at the belt | weak (L1) |
| Nothing on the head; no text | | none | yes |
| Budget | ≤ 3.5 MiB, 3 files | 2.94 MiB RGBA source-sum (736 × 1048, one page); 3 files, 370 KB on disk (png 327 KB, json 37 KB, manifest 6 KB) | yes |
| Preview | each anim × dir as a GIF next to the old idle | `docs/previews/chief2_<anim>.gif` × 9, labelled, with old idle S + walk SE | yes |

---

## 2. Findings

### H1 (high): `cheer` reads as `wave`, and never goes overhead

**Where:** `cheer` in all dirs. The worst cases are S and E / W, against `wave` in the same dirs.

**What is wrong**
- The contract asks for "one mitten overhead with a small hop (the 촌장 응원 and ribbon pose)".
- **In S** the fist goes up beside the ear: the same place as the `wave` mitten, with the same ^^ eyes.
  - At phone scale (zoom 1.0, a 43 CSS px chief) `wave` S f0–f4 and `cheer` S f1, f3 and f5 have practically the same silhouette.
  - The only difference is the f2 hop.
- **The hop** is 5 px: the feet go from +4 to −1. That is 2.7 CSS px at zoom 1.0 and 1.6 CSS px at zoom 0.6, so on a phone it is barely a twitch.
- **In E / W** the fist sits in front of the face at eye level, so cheer and wave in profile look alike. Neither reads as a cheer (see M1).
- **Why it matters.** Plan §3.2: the 응원 pose plays whenever the chief stands still near workers once the village is complete. It is one of the anims the designer will see most often, and it stands for a real buff.

**Evidence**
- `$S/shots/ev_wave_vs_cheer_z10.png` and `$S/shots/ev_wave_vs_cheer_z06.png`: wave frames (left 4) next to cheer frames (right 4) in S, SE, E, SW and W, at the phone's device-pixel scale.
- `$S/shots/ev_wave_vs_cheer.gif`: both anims playing at 10 fps.
- `$S/shots/phone_scene_z1.0_n0.png`, row 1: wave S, wave SW, cheer S, cheer SE, cheer W in the live harness.

**Repro**
```
cd $S && python3 evid.py
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers nice -n 10 node harness.mjs "s=mode=scene&zoom=1.0"
```

**Suggested fix (art)** — any of these makes the silhouette clear the hair:
- **Two arms up "만세".** Raise the shoulders 2–3 cm, stretch the upper arms to their limit and tilt the head back, so both mittens frame the crown. A two-armed V can't be mistaken for a one-handed wave.
- **A small cheering prop held overhead**, in the same way the quill, bowl and paper are baked in: a teal 서리마을 pennant or a pompom on a short stick.
  - It puts colour above the head, which is visible even at zoom 0.6.
  - It doubles as the ribbon-ceremony pose.
- **Raise the hop** to 8–10 px on f2, with a clearer squash on f0 and f4.
- **In E / W** raise the camera-near arm up and slightly forward above the crown, never in front of the face.

### M1 (medium): `wave` and `cheer` in E / W (and `wave` SE) put the mitten in front of the face

**Where:** `wave` E (W = mirror) f0–f5, `cheer` E f1–f5 and `wave` SE f0–f4.

**What is wrong**
- In profile the raised mitten sits in front of the face at mouth or eye height, overlapping the cheek outline. At phone size it reads as "hand to mouth" or "eating", not as a wave.
- In SE the mitten touches the cheek and hair outline (the builder moved it out to avoid the brown hair, but it is still on the face).
- **Why profile matters.** In 기차 구경 (plan §7.2) the chief walks to the platform and waves at the train. `Character.play` turns him toward it. The rendered wave dirs are S/SE/E, so a train to his N or NE gives E / W: exactly the dirs that read worst.

**Evidence:** `$S/shots/ev_wave_vs_cheer_z10.png` (rows E and W); `$S/audit/sheet_talk_wave.png` (wave E row).

**Suggested fix**
- In E, raise the near arm higher and further toward the camera, so the mitten clears the hair silhouette with a 2–3 px gap above and in front of the crown.
- In SE, lift it above the head line.
- Keep the ^^ face visible.

### M2 (medium): `sit_read` loops the fold-out by default; the manifest even offers that as acceptable

**Where:** `anims.sit_read` (`loopFrom: 2`) and `conventions.loopFrom`, which says "…or the whole 0-5 loop if only one anim is wanted".

**What is wrong**
- `Assets.buildCharacter` builds one Phaser anim of frames 0..n−1 with `repeat: -1`. It does not know `loopFrom`.
- So unless CODE-2 writes extra code, the paper snaps from open (f5) back to folded (f0) and is shaken open again **every second**. f5 → f0 changes the silhouette IoU to 0.92–0.95.
- That is the hero action of the office scene, the 관망 사무실 activity.

**Evidence:** `$S/shots/ev_sit_read_plain_loop.png` (f4, f5 → f0, f1, f2 in S, SE and E).

**Suggested fix**
- Drop the "or the whole 0-5 loop" option from the manifest.
- Make the safe path the default. Either:
  - **Manifest:** ship the intro as its own anim entry, e.g. `sit_read_in: { frames: 2, repeat: 0, frameOf: "sit_read", from: 0 }`, and `sit_read` playing 2..5. Both are built from the existing frame names, so no new art is needed.
  - **Code:** state in the report that CODE-2 must add `loopFrom` support to `buildCharacter`, and test it.

### M3 (medium): "dozes by the office stove" has no seat; seated `doze` at the stove floats

**Where:** `doze` (seated, anchor = seat point) against plan §7.2 저녁 ("dozes by the office stove from 22:00") and the
office manifest `stovePoint`. That point is a **ground** point "in front of the stove (the chief dozes nearby)", with
no chair and no seat point.

**What is wrong**
- Placed at `stovePoint`, the seated doze puts his seat on the floor.
- His boots hang through it, and he hovers in front of the stove with no chair under him. The `emote_zzz` floats above.

**Evidence:** `$S/shots/o_stove.png` (left: doze at `stovePoint`; right: doze at the desk, which is correct).

**Repro**
```
node harness.mjs "o_stove=mode=office&zoom=3&anim=doze&stove=doze&stoveDir=SE&freeze=1&fi=1&vw=900&vh=700&dpr=1&fx=20&fy=-100"
```

**Suggested fix (cross-set)** — one of:
- The office adds a small stool or armchair by the stove and a `stoveSeatPoint` / `stoveSeatDir`.
- CODE-2 plays the 22:00 doze at `chiefDeskPoint`, the desk chair, which looks good.
- chief2 adds a standing doze variant.

Record the choice in both reports so CODE-2 does not use `stovePoint` for `doze`.

### M4 (medium): the office desk's own props sit in the chief's work area, so his props land on them

**Where:** `chief_office_interior_front` (the chief's desk top: blue box, quill stand) and the `chief_office_lamp_*`
overlay (depthOffset −0.08), against the chief's `_desk` overlay (−0.095).

**What is wrong**
- With the overlay on, which is the builder's recommended way, the props land on the desk art's own objects:
  - the stew bowl (`sit_eat`) on the blue box;
  - the open newspaper (`sit_read`) over the blue box;
  - the stamp (`sit_write` f4, `impactPoint`) on the blue box.
- The desk lamp, drawn above the overlay, sits over his right forearm and the paper's corner in every frame.
- At zoom 1.2 this reads as clutter on the hero desk. At 3–4× it is obvious.

**Evidence**
- `$S/shots/c_quad.png`: sit_read f1, sit_eat f3, sit_idle f0, sit_write f3 at 4 px per world px.
- `$S/shots/o_close_write4.png` with debug marks: red dot = anchor, blue = `deskEdgePoint`, red cross = `impactPoint`.
- `$S/shots/o_z12_read_pair.png`: phone, zoom 1.2, overlay off and on.

**Suggested fix (cross-set, mostly office)**
- Move the blue box and the lamp to the desk's far corners, clear of a 0.5 × 0.35 m area in front of `chiefDeskPoint`, or drop them from the desk layer.
- Otherwise, give the lamp a depthOffset below −0.095 when the chief is seated.
- The chief2 overlay itself is correct: it lines up with its base frame, and the forearm emerges cleanly from behind the desk edge.

### L1 (low): `warm_hands` S reads as hands clasped at the belly

`warm_hands` S f0–f3 holds both mittens together at the belt line. Facing the camera, the "forward" is lost to
foreshortening. Next to the old idle, it reads as a shy or content pose. By the campfire the context carries it, and SE / E read better (mittens forward at the chest).

**Evidence:** `$S/shots/ev_warm_hands_z10.png`.

**Fix:** spread the mittens 6–8 px apart with the thumbs up, as if palms face a fire in front of him. A slight rub between f1 and f2 would help too.

### L2 (low): cheer crouch and squash frames push the boots below the ground line

- The boot sole is +5 px below the anchor in idle SE / E, but +7 in `cheer` SE / E f0 and f4 (S: +4 against +5).
- The cheer stance is also 1–2 px wider than idle (S boots 50–61 / 66–77 against 52–62 / 65–75).
- So the feet sink about 2 px and shuffle sideways when the game switches idle → cheer.
- `talk`, `wave` and `warm_hands` are perfectly planted (identical boot columns in every frame).

**Repro:** `python3 $S/audit3.py`.

**Fix:** pin the soles to the ground plane in the crouch frames (bend the knees rather than lowering the feet), and start from the idle stance.

### L3 (low): loop pacing — cheer hops 100 times a minute, doze nods every 1.3 s

**What is wrong**
- At the contract's fps, `cheer` loops every 0.6 s with a hop each time. If CODE-2 loops it for the whole 응원 stand, it looks frantic.
- `doze` (4 · 3) nods every 1.33 s, which reads as nodding along rather than sleeping.
- The art is per contract, so this is a usage note.

**Fix:** have the manifest suggest `repeatDelay`, e.g. cheer once per ♪ (1.2 s) with a 0.6 s hold on f5, and doze with a 1–2 s hold on f2.

### L4 (low): one `headTop` for every standing anim

- `cheer` f2 reaches −85 and `talk` f5 / f6 reach −82, against the shared `headTop` −81.
- A bubble or the star pin placed at `headTop` overlaps the raised fist by up to 4 px.
- `headTopSit` −67 is measured from S; SE / E differ by ≤ 1 px, which is fine.

**Fix:** add an anim-level `headTop` for cheer (−86), or have the game add 5 px while cheer plays.

### L5 (low): the desk overlay double-draws its soft edge where the desk does not cover the base frame

- The overlay is the full frame with its alpha masked. Where a mitten or prop sits **above** the desk's far edge on screen (no desk art under it), the base sprite and the overlay both draw.
- Their 1 px semi-transparent outline pixels compound, giving a slightly heavier outline on those mittens.
- It is only visible at 3×+ (`$S/shots/c_quad.png`, sit_idle mittens).

**Fix:** in the overlay pass, zero the alpha of pixels that lie above the desk-top polygon of the reference desk. Or accept it.

### L6 (low, documented deviation): seated boots hang about 0.2 m above the floor; S shows "four feet"

**What is wrong**
- The seated boots end at +12..14 px and the floor is at +25, so on benches and logs he dangles. townfolk2 `sit` does the same, so the house style is consistent.
- In S, the brown trouser knees under the parka and the boots below them read as two pairs of brown blocks on outdoor seats.
- Seated, his head is 11 px higher above the floor than standing.

**Evidence:** `$S/shots/crop_seats.png` (log seat S, bench_x SW), `$S/audit/sheet_doze.png`.

**Fix (optional):** lighten the trouser knee in S, or tuck the shins back 10–15° so the knees read as one shape. The contract's "feet on the floor" is not reachable with this rig.

### L7 (low): mirrored dirs flip handedness and light

- At the office desk he faces SW (SE flipped), so in the main scene he writes left-handed with the quill in the left mitten, and the key light comes from the other side.
- `char_player` mirrors the same way, so this is house style. It is noted because the office desk is the one place where he sits still and is looked at.

### L8 (low): integration notes for CODE-2 (not art defects; they decide whether the art shows)

- **Merging the anims.**
  - Merging `player_b` into `player` does nothing until `buildCharacter` looks frames up with `a.atlas || def.atlas`. Today it uses `def.atlas` (`Assets.js` l.667) and silently skips the dir, and `resolveAnim` falls back to `idle`.
  - `Character.play` asks `Assets.socialPage(this.def.atlas, name)`, which also uses the player atlas.
  - The packer must list `char_player_b` too.
- **Desk overlay.** The `_desk` sprite must copy the main sprite's frame name every frame, after the anim update, as in this harness. It needs the same flipX and depth `building + (−0.095)`.
- **Seated shadow and halo.** The shadow and the AG halo go at `y + floorBelowPx` while seated. `Character.sync` puts the shadow at `y + 1`.
- **Lunch (`sit_eat` at `picnic_table`).** `BigRestaurant.flyToTable` also flies a plate to the table, so he would have two dishes. With `seatDepth: "behind"` the table top does not hide his bowl (`$S/shots/crop_tables.png`), so no overlay is needed there.
- **Seat dirs.** Seats facing NE / N / NW (cafe, beach bar, fountain) have no seated dirs. `nearestDir` would sit him facing away from the table. Only offer him S / SE / SW / E / W seats.
- **Previews.** The contract's general rule asks for phone captures at 0.6 / 1.0 / **1.6**. The builder followed the job brief (1.2), which is fine. A 1.6 close-up would have shown M4.

---

## 3. What is good (keep it)

- **Exact match with the player.** It is the same rig, the same outline and the same palette behaviour. A standing chief from `char_player_b` next to one from `char_player` cannot be told apart (`$S/shots/phone_scene_z1.0_n0.png`, row 1).
- **No halos and no seams, day or night.** Every edge pixel is dark ink in both sets, and none of the border pixels is light. `$S/shots/crop_z06_night.png` shows night.
- **Planted feet.** `talk`, `wave` and `warm_hands` keep identical boot columns and ground line in every frame (`audit3.py`). There are no baked shadows, so nothing is mirrored wrongly.
- **The office desk scene reads on a phone.**
  - At zoom 1.2 the quill, newspaper and bowl are recognisable (`$S/shots/crop_office_z1.2_n1.png`, `$S/shots/o_z12_read_pair.png`).
  - At 0.6 he reads as "the chief at his green desk" (`$S/shots/crop_office_z0.6_n0.png`).
  - He sits on his red chair in band `behind`, at the same scale as the clerks.
- **The desk overlay is worth its 0.22 MiB.** Without it the hands and props vanish under the desk top (`$S/shots/o_close_write4_noov.png` against `o_close_write4.png`). It aligns with its base frame, and the forearm passes behind the desk edge cleanly.
- **Outdoor seats.** On `log_seat` (S), `log_seat_x` (SW), `bench_x` (SW) and `picnic_table` (S) he sits like the townsfolk next to him, at a matching scale. `doze` with `emote_zzz` at `headTopSit` reads at zoom 0.6.
- **`talk` with a townsperson** reads, and its timing (8 · 10) matches townfolk `talk`.
- **Small and lean.** 3 files, 327 KB PNG and 2.94 MiB of texture memory, under the 3.5 MiB budget. The pack is deterministic.

## 4. Numbers

| Measure | Value |
|---|---|
| Files / bytes | 3 / 369,720 (png 326,934 · json 36,543 · manifest 6,243) |
| Texture memory | 736 × 1048 RGBA = 2.94 MiB (budget 3.5) |
| Frames | 150 anim + 66 `_desk`, all 128 × 128 source, trimmed, 0 overlaps |
| Chief height on a phone | zoom 0.6: 26 CSS px · 1.0: 43 · 1.2: 52 |
| Cheer hop | 5 px = 1.6 CSS px at zoom 0.6 |
| Seated boots | +12..14 px below the seat (floor +25) |
| Foot drift (talk / wave / warm_hands) | 0 px |
| Loop-seam IoU (sit_read f5 → f0, plain loop) | 0.92–0.95 (the paper snaps shut) |
| Page loads | 22, 0 errors, 0 × 404 |

## 5. Re-run

```
S=/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v42art_chief2_review
cd $S
python3 audit1.py; python3 audit2.py; python3 audit3.py; python3 audit4.py; python3 audit5.py   # outline/halo, bbox, feet, colour, popping
python3 evid.py                                                                                   # evidence strips + GIF
PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers nice -n 10 node harness.mjs \
  "scene=mode=scene&zoom=1.0" "office=mode=office&zoom=1.2&anim=sit_read" \
  "office_noov=mode=office&zoom=1.2&anim=sit_read&overlay=0" "night=mode=scene&zoom=0.6&night=1"
```

Query parameters: `mode` = scene | office | lineup; `zoom`; `night`; `overlay`; `anim` (desk anim); `stove` (an anim at
`stovePoint`); `freeze=1&fi=N` (hold frame N); `debug=1` (anchor, `deskEdgePoint`, `impactPoint`, `headTop` marks);
`vw` / `vh` / `dpr` (viewport).

## 6. Evidence index (`$S/shots/`)

| File | Shows |
|---|---|
| `ev_wave_vs_cheer_z10.png`, `ev_wave_vs_cheer_z06.png`, `ev_wave_vs_cheer.gif` | H1, M1 |
| `ev_sit_read_plain_loop.png` | M2 |
| `o_stove.png` | M3 |
| `c_quad.png`, `o_close_write4.png`, `o_close_write4_noov.png`, `o_z12_read_pair.png` | M4, L5, the overlay working |
| `ev_warm_hands_z10.png` | L1 |
| `crop_seats.png`, `crop_tables.png` | L6, L8 (lunch) |
| `phone_scene_z{0.6,1.0,1.2}_n{0,1}.png`, `phone_office_z{0.6,1.0,1.2}_n{0,1}.png` | phone captures, day and night |
| `crop_z06_rows12.png`, `crop_z06_night.png`, `crop_office_z0.6_n0.png`, `crop_office_z1.2_n1.png` | readability at 0.6 and 1.2 |
| `../audit/sheet_*.png` | every frame at 2–3× with the old idle and the anchor line |
