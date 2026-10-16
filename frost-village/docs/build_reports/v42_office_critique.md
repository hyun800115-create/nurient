# v42_office: adversarial art review (촌장 사무실, CONTRACT_V42 §AI)

**Verdict: polish.**

The exterior and the interior art are good. They match the house style, read well on a phone, and the manifest follows
§AI almost exactly. The problems are in layout and integration: where people sit and stand, and how the game's own
renderer draws the layers. None of them needs a new art direction. Two of them should be fixed before CODE-2 wires
the set in.

**What I tested**
- The set is `assets/office/**`. I treated it as read-only and checked it against `docs/CONTRACT_V42.md` §AI,
  `docs/v42_plan.md` §6.1, §6.3–6.5 and §13, and the game's real renderer `src/entities/Cutaway.js`.
- I used my own Phaser 3.90 harness on a 390 × 844 phone at DPR 3 (k = 1.65, the `src/main.js` maths), at game zoom
  0.6, 1.0 and 1.2, by day and by night. A desktop close-up ran at 2 px per world px.
- The office sat at its plan position (110, 810), next to the civic bank at (−340, 570), with the road edges, the
  hire pad and snowy pines around it.
- The staff were real, not stand-ins. The officefolk (AJ) and chief2 (AH) sets are in the tree now, so I used:
  - 셈이 `desk_write`, 소복이 `desk_type`, 총총이 `desk_phone`, 딸랑이 `desk_count` (officefolk);
  - the chief's `sit_write` (chief2);
  - townfolk2 `sit` visitors on the bench;
  - officefolk staff standing at every standing work spot;
  - the courier walking with `carry_sack`.

All work is in the scratch folder `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v42art_office_critic`,
called `$S` below. Every page load reported 0 page errors and 0 404s, and `off_check.py` still reports 0 errors.

| Severity | Count |
|---|---|
| critical | 0 |
| high | 2 |
| medium | 6 |
| low | 9 |

---

## 0. 디자이너용 요약 (쉬운 말)

**좋은 점**
- 겉모습이 아주 예뻐요. 청록 지붕, 크림색 벽, 나무 기둥, 빨간 커튼이 있어서 마을회관과 한 가족처럼 보여요.
- 옆의 은행(자주색 지붕, 기둥)과는 확실히 다른 건물로 읽혀요.
- 밤에는 창문이 따뜻하게 빛나요. 안을 열면 칠판의 막대, 난로, 타자기가 휴대폰(줌 0.6)에서도 "사람들이 일하는 사무실"로 보여요.

**꼭 고칠 점 1: 지금 게임 코드로 그리면 낮에도 창문이 밤처럼 켜져요.**
- 게임 코드가 건물을 그리는 방식과 이 그림 세트의 설명서가 서로 맞지 않아요.
- 그래서 낮에도 창문이 주황색으로 빛나고, 문 닫힌 상태에서 그림자가 두 겹으로 진해져요.

**꼭 고칠 점 2: 소복이 얼굴을 문틀이 가려요.**
- 안을 열었을 때(기본 보기) 앞문 문틀 기둥이 소복이 얼굴을 세로로 지나가요.
- 타자 치는 모습이 문틀에 가려져요.

**그 밖에 보이는 것들**
- 손님 의자(벤치) 바로 앞에 화분이 있어요. 손님이 앉으면 발이 화분 속에 들어가요.
- 두 손님이 너무 붙어 앉아서 머리가 겹쳐요. 촌장 책상 앞도 가려요.
- 촌장이 책상 앞(업무 발판)에 서면 벤치 등받이 위에 서 있는 것처럼 보여요.
- 우체통 깃발은 "편지 없음"일 때가 오히려 더 튀어나와 보여요. 편지가 왔다는 신호가 잘 안 보여요.
- 금고 문을 열어도 안이 텅 빈 초록 벽이에요. 동전과 금괴가 보이지 않아요.
- 딸랑이가 금고 앞 자리로 걸어가면 벽 충돌에 막혀서 그 자리에 갈 수 없어요.
- 그림 한 장(5 MiB)에 겉과 속이 다 들어 있어요. 광장에 있을 때도 속 그림까지 메모리에 올라가요. 계획은 2.5 MiB였어요.

---

## 1. How it was tested

- **Harness:** `$S/harness.mjs` and `$S/page.js`.
  - They use the repo's `tools/test/serve.mjs`, `tools/test/pw.mjs`, `tools/townfolk_compose.js` and `tools/officefolk_compose.js` read-only.
  - The page is routed in memory, so nothing is written to the repo.
  - Modes:

    | Mode | What it draws |
    |---|---|
    | `world` | plan placement + neighbours + people |
    | `gamecut` | the exact rules of `src/entities/Cutaway.js` |
    | `close` | desktop close-up with seated staff |
    | `points` | every standing work spot with a real person |
    | `items` | the items and the mailbox next to existing items and the chief |

  - Night uses the DayClock look: a MULTIPLY overlay at darkness 0.45 with NIGHT `0x5a6aa8`, plus ADD `fv_glow` at `night.lightPoints` (closed) or `night.lightPointsOpen` (revealed).
  - Example:
    ```
    cd $S && PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers nice -n 10 node harness.mjs \
      "w_z10_cut=mode=world&zoom=1&state=cut&freeze=1" \
      "c_cut_desks=mode=close&zoom=1.6&state=cut&vw=900&vh=760&dpr=1&fx=-10&fy=-70&freeze=1"
    ```
- **Pixel audits:**
  - `$S/tools/extract.py` writes every atlas frame back to its untrimmed source size in `$S/frames/`.
  - `$S/tools/comp.py` composites the layers in `drawOrder`.
  - The other probes are inline Python in this session; their outputs are quoted below.

## 2. What is right (checked, no action)

| Area | Result |
|---|---|
| Files / budget | 5 files (manifest + `office_bld` + `office_items`), 232,605 B on disk. `office_bld` 968 × 1352 = **4.99 MiB** (≤ 5.5), `office_items` 0.04 MiB. |
| Keys | All 23 §AI keys are present: the 8 layers, 7 overlays, `office_mailbox` and the 6 items. Atlas frame names are `{key}_{i}`. |
| Building | Frame [634, 512] (≤ [640, 576]); anchor [0.429, 0.623]; footprintPoly within 1 px of the contract; topPx 316; floorLiftPx 17. Every layer shares the frame and the anchor. |
| Overlays | Frame counts, fps and states match the table: typewriters 4 @ 10, phone 2 @ 8, stove 4 @ 6, lamps 2 with `warm` / `alert`, safe 2 with `shut` / `open`. Every anim frame differs from frame 0. Trims differ per frame (the safe) but `sourceSize` is shared, so nothing pops. |
| Points / dirs | Every §AI field is there with the contract dirs and slots: desks SE, SE, SW, SE; chief SW; board NE; cabinet and shelf NW; safe NE front; seats SW front; mailbox NE outside. Converted back to building metres, every seat sits where §AI puts it. For example, 총총이 is at X 0.0, Y −1.06 facing −Y, the chief at X 0.35, Y 1.41 behind his desk, and the bench seats at X 1.37 / 1.87, Y −0.84. |
| Seat convention | Real officefolk `desk_*` and chief2 `sit_*` put on the `deskPoints` / `chiefDeskPoint` sit on their chairs. The desk tops cover their laps, and hands land at desk-top height (`$S/shots/c_open_desks.png`). |
| Style / light | Same camera, light, palette and soft-toy materials as `town_hall`, `bank`, `house_a` and `post_office`. Shadows fall down-right like theirs, and the teal roof is in the hall's family (`$S/shots/j_style_lineup_1x.png`). There are no light or dark halos on a dark ground (`$S/shots/f_shell_edges_dark.png`) and no seams between the stubs and the faded shell. |
| Phone reading | At 0.6 the office is ≈ 206 CSS px wide. Closed, it reads as a teal-roofed cottage office; cut open, it reads as a busy room with the green 재고판 bars (`$S/shots/w_z06_pair.png`). At 1.0 and 1.2 every desk object reads. |
| Night | With the lights fed, the closed office has warm panes and a lantern halo; revealed, the lamps and stove make the inside look lamp-lit (`$S/shots/w_night_trio.png`). |
| Items | Same footprint as the existing items: sack_m 37 × 42, letter bundle 45 × 33, ledger 34 × 37, against `item_letter` 46 × 35 and `item_toolbox` 48 × 40. Same render look (`$S/shots/i_row.png`). Anchor [0.5, 0.86] as §AI says; `Assets.image` applies the manifest anchor, so stacks sit on their contact point. |
| Walk data | Every standing point is inside `walkPoly`. The wall circles leave the door gap. `revealPoly` covers the shell. |

---

## 3. Findings

### H1 (high): the `cutaway` block does not work with the game's renderer. Night glow shows by day, the shadow doubles, and inside layers stay on while closed.

**Area:** manifest `chief_office.cutaway` vs `src/entities/Cutaway.js`. This is the renderer `BankBuilding42` uses today, and the one CODE-2 will reuse for the office.

**Problem:** The build report says the `cutaway` block works with "the existing bank renderer". That renderer is the v5 module's `src/bank/view/BankBuilding.js`. The v4.2 game draws cutaways with `src/entities/Cutaway.js`, which:
1. treats only `cw.layers.interior`, `.back` and `.front` as inside layers (line 31). The office block names its desk layer `interior_front`, not `front`, and lists no floor or overlays. So `_floor`, `_interior_front`, all 7 overlays, `_glow` and `_props` are drawn **always**.
2. ignores `alwaysDrawn`, `insideLayers`, `night` and `reveal.states`. `grep -rn "alwaysDrawn\|insideLayers\|lightPointsOpen" src/` finds nothing.
3. stacks the layers at `base + 0.01 × index` (line 34). That ordering is fine.

What you see on a closed office **by day**:
- **`_glow` (the night window art) is drawn.** All 5 panes turn orange with halos (16,768 glow pixels).
- **`_floor`'s open-state ground shadow is drawn under `_shell`'s closed shadow.** 6,908 px outside the opaque shell darken by a mean of 25 levels, a visibly doubled shadow under the front-right plinth.
- The interior desks and overlays are hidden under the opaque shell, so the only cost there is fill rate. Even so, the plan says "inside layers … exist only while revealed (fill rate)".

**Repro:** `$S/harness.mjs "g_z12_closed_day=mode=gamecut&zoom=1.2&state=closed&freeze=1"`. This applies Cutaway.js's own rules to the manifest; the page reports the always-drawn list `[floor, stove, safe, interior_front, typewriter_a, lamp_a, lamp_b, typewriter_b, phone, shell_cut*, shell*, glow, props]` (*by fade and cut). The pixel diff against the documented closed look (shell + props) is 25,400 px > 6 levels, 7,192 of them outside the opaque shell.

**Evidence:**
- `$S/shots/g_closed_doc_vs_game_crop.png`: left is documented, right is Cutaway.js.
- `$S/shots/g_vs_documented_closed_day.png`: the phone view, z 1.2.
- `$S/shots/g_closed_diffmask.png`.

**Fix (art side, cheap):** make the block say what the renderer needs.
- Add `cutaway.layers.front = "chief_office_interior_front"`, the key Cutaway.js reads.
- Add `cutaway.inside = [floor, back, interior, interior_front, stove, safe, typewriter_a, lamp_a, lamp_b, typewriter_b, phone]`.
- Add `cutaway.night = ["chief_office_glow"]`.
- Either remove `_glow` from `cutaway.drawOrder` (it is a night light, not a layer), or move the open-state ground shadow out of `_floor` into its own `chief_office_shadow_open` layer, shown only while revealed.

**Fix (CODE-2 side):** Cutaway.js must honour `inside` / `insideLayers` and gate `night` layers on `dayClock.lightsOn`. Add an `off_check` rule that simulates the Cutaway.js rules on the closed state and fails when any pixel outside the opaque shell changes.

### H2 (high): the door frame in `_shell_cut` slices 소복이's face in the default reveal

**Area:** layout: desk 2 and the door frame in `_shell_cut`.

**Problem:**
- The default reveal is `cut`: shell at 0.12 and the `_shell_cut` stubs on.
- §AI includes the full-height door frame (two jambs plus a lintel) in `_shell_cut`. Its right jamb is at building px x −148…−136, and the lintel runs at y ≈ −132…−97.
- 소복이 (`bok`, desk 2) sits at `deskPoints[1]` = (−145, −64), so her head is directly behind the jamb and lintel corner. Measured, **37 % of her head box is covered by opaque `_shell_cut`**.
- At every zoom the jamb runs vertically through her face and the lintel crosses her forehead. Her typewriter, the coat rack and the umbrella stand are behind it too.
- The same frame covers 35 % of whoever stands at `entryPoint` (the aide handing over news, the chief walking in).
- With the stubs off (`open`) she reads perfectly. She is one of the four named staff and the clerk whose typing is an advertised feature.

**Repro:**
- `node harness.mjs "c_cut_desks=mode=close&zoom=1.6&state=cut&vw=900&vh=760&dpr=1&fx=-10&fy=-70&freeze=1"` (and the same with `state=open`).
- Phone: `w_z10_cut`, `w_z12_cut`.

**Evidence:**
- `$S/shots/h_bok_doorframe.png`: cut vs open, same seat.
- `$S/shots/w_z12_pair.png`: right panel, pink clerk behind the frame.
- `$S/shots/p_cut.png`: the person at `entryPoint` framed.

**Fix:** pick one.
- (a) Keep the door frame in `_shell_cut` at stub height. Jambs to 1.2 m with no lintel, like the wall stubs; the full frame stays in `_shell`.
- (b) Move desk 2 and its seat about 0.5 m toward +Y, so on screen the head clears x −136 by at least 20 px. Re-lay desk 1, or shorten it, if needed.
- (c) Move the door to X ≈ −2.0, nearer the left corner.

Then add a check: for each seated or standing point, the head box (≈ 44 × 50 px above the seat, 44 × 100 px above the feet) may be covered by at most 10 % opaque `_shell_cut`.

### M1 (medium): the visitor bench is crowded and wrong in depth

**Area:** `seatPoints`, the bench and the plant in `_interior`.

**Problems:**
- **A plant stands in the visitors' leg space.** The potted plant on the round blue rug is right in front of the bench. The floor point under `seatPoints[0]` (24, 50) is inside the pot. Because the plant is in `_interior` (−0.30) and visitors are in `@front` (−0.05), a seated visitor is drawn over a plant that physically stands in front of them, and on screen their feet sit in the flowerpot.
- **The seats are 0.5 m apart.** House benches run 0.6–0.75 m apart: life2 wedding chairs 0.75, harbor 0.71, beach_cafe 0.74. Two seated townsfolk2 chibis (heads ≈ 0.7 m) overlap head over head.
- **The bench is directly in front of the chief's desk on screen.** Two visitors hide the desk front and part of the courier corner, which is the room's hero spot.

**Repro:**
- `node harness.mjs "c_open_desks=mode=close&zoom=1.6&state=open&vw=900&vh=760&dpr=1&fx=-10&fy=-70&freeze=1"`.
- `$S/shots/d_bench_points.png` marks the seat and seat-floor points on the interior.

**Evidence:**
- `$S/shots/c_open_desks_bench.png` (2×): overlapping heads, plant leaves at the visitors' feet.
- `$S/shots/d_bench_points.png`.
- `$S/shots/c_cut_desks.png`.

**Fix:**
- Move the plant at least 0.6 m clear of the seat fronts, for example into the front-right corner by the stub or to the left of the bench.
- Widen the seats to ≥ 0.7 m.
- Consider sliding the bench about 0.5 m toward +X / −Y, so seated heads clear the chief's desk front.
- Add a check: no opaque `_interior` / `_interior_front` pixels inside a 0.45 m floor box in front of each seat point.

### M2 (medium): `chiefDeskPad` is right behind the bench backrest, so the chief looks like he stands on it

**Area:** `chiefDeskPad` [25, −11] (slot `front`) vs the backed bench in `_interior`.

**Problem:**
- The chief stands on the 책상 pad for 0.4 s every time he opens the office panel.
- The pad lies immediately behind the bench's 0.8 m backrest (`$S/shots/k_points_wallcircles_3x.png`, green "chiefDeskPad" on the bench back).
- The bench is in `_interior`, which is drawn under every band. So the chief, physically behind the backrest, is drawn over it: his boots sit on the backrest top.
- No band choice fixes this. `behind` would put the chief's own desk (in `_interior_front`) over him.

**Evidence:** `$S/shots/l_chief_pad_bench.png` (open and cut, 2×); `$S/shots/p_open.png`.

**Fix:** move the pad clear of the bench, for example to the desk front's left half, about (−5, −20) px, ≥ 0.4 m from any `_interior` furniture taller than 0.3 m. Or move the bench (see M1). Add a check: standing points ≥ 0.35 m from tall `_interior` furniture footprints.

### M3 (medium): `safePoint` is inside a wall-collision circle, so the courier cannot reach the safe

**Area:** `safePoint` [150, 12] vs `wallCircles[7]` = [170, 42, 46].

**Problem:** The manifest's rule is that an inside actor tests its point + [0, floorLiftPx] in the metric dx² + (2dy)².
- For the safe point that gives (150, 29), at distance **32.8 < r 46** from that circle.
- Before the bank is built, the courier deposits at the safe (plan §6.5). With the documented collision he is pushed off the target, so he jitters or never "arrives".
- Every other standing point, seat floor point and desk floor point is clear (checked).

**Evidence:** `$S/shots/k_points_wallcircles_3x.png` (blue point inside the red ellipse); the numbers come from the probe in this session.

**Fix:** shrink that circle to r ≤ 30, or move it ≥ 0.3 m toward +X along the wall, or move `safePoint` ≥ 0.25 m toward −X. Extend `off_check` with "every staff / seat floor point + lift is outside every wall circle".

### M4 (medium): the mailbox flag does not read; "no mail" looks more raised than "mail"

**Area:** `office_mailbox` frames.

**Problem:** The plan says the flag "pops up when mail arrives".
- In the `down` frame (`office_mailbox`), the yellow flag sticks out on an arm at about 45°, up and to the right. Its pixels span x ≤ 49 and top y 7.
- In `up` (`office_mailbox_flag_1`) the flag is folded flat against the box: x ≤ 35, same top y 7.
- So the flag's height never changes, and the idle state is the more conspicuous silhouette.
- At zoom 0.6 (≈ 1 device px per frame px) the difference is a few pixels of yellow moving sideways.

**Evidence:** `$S/shots/e_mailbox_frames_4x.png` (frames at 4×, anchor and `slotPoint` marked) and `$S/shots/i_people.png`.

**Fix:** make `down` a flag lying horizontal along the box side, below the snow cap, and `up` a vertical flag rising ≥ 10 px above the cap. Make the flag about 10 × 8 px, keep `pop` overshooting past vertical, and keep the solid yellow.

### M5 (medium): the safe is half hidden in the cut view, and the `open` frame shows no inside

**Area:** `chief_office_safe` overlay + `_interior`.

**Problem:**
- The courier corner's safe is the payoff of the deposit (coins fly into it).
- In the default `cut` view the right wall stub covers the safe from below its dial (`$S/shots/e_safe_open_vs_shut_open_and_cut_4x.png`, panels 2 and 4).
- In `open` (frame 1) the door swings out onto a **solid green front face**. There is no cavity, coins or gold bar, although the manifest note promises "coins + a gold bar inside". It reads as a door detached from a box.

**Evidence:** `$S/shots/e_safe_open_vs_shut_open_and_cut_4x.png`, `$S/shots/e_safe_pair_5x.png`, `$S/shots/e_overlay_states_3x.png` (bottom).

**Fix:**
- Render frame 1 as a patch covering the safe's front: the dark open cavity with a coin stack and a gold bar, plus the swung door.
- Move the safe about 0.3 m toward −X / +Y so its door and dial clear the 1.2 m stub in `cut`.
- Keep `safePoint` reachable (M3).

### M6 (medium): one atlas page means the plan's inside-only-on-reveal memory saving is impossible

**Area:** texture residency (plan §13.2).

**Problem:**
- The plan budgets the plaza view with "office closed look 2.5 (insides load on reveal only)" and adds an `officeInside` Residency region "acquired only by a reveal".
- `office_bld` is one 4.99 MiB page holding the shell and every inside layer, so the closed office keeps everything resident.
- Plaza estimate:
  - Planned: 323 + `v42_core` 2 + halo 0.1 + office 2.5 + `of_sack_0` (measured 1.27) = 328.9.
  - With this page: **331.4 > 331 gate**.

**Evidence:** page sizes measured from the PNGs (968 × 1352 → 4.99 MiB; of_sack 744 × 448 → 1.27 MiB). The trimmed frame area splits about 2.07 MiB closed (shell, glow, props, mailbox, items) and 2.31 MiB inside (floor, back, interior, interior_front, shell_cut, overlays).

**Fix:** pack two pages within the same 5-file budget:
- `office_bld`: shell, glow, props, mailbox + the 6 items. About 2.3 MiB, always resident.
- `office_inside`: everything inside. About 2.5 MiB, loaded on reveal.

This retires the separate `office_items` page. It needs the lead to amend the §AI atlas names. If not, record the +2.5 MiB in the plan's §13.2 table.

### L1 (low): crowded work spots around desk 1, the stove and the counting table

- `mailShelfPoint` (−38, −94) is **0.54 m** from `stovePoint` (−13, −82), where the chief warms his hands and dozes. When both are used, the two sprites overlap: in `$S/shots/p_cut.png` the blonde clerk and the white chief collide.
- `cabinetPoint` (−84, −61) is at the end of desk 1. The filing action is hidden behind desk 1 and only the back of a head shows.
- `boardPoint` (138, −21) stands behind the counting table, about 0.6 m from 딸랑이's seat. 셈이 pointing at the board while 딸랑이 counts gives two overlapping figures.

**Fix:** keep ≥ 0.75 m between any two work spots that can be busy at once. Move the shelf spot 0.3 m toward −Y and the cabinet spot 0.3 m toward −Y / −X, off desk 1's end.

### L2 (low): animated parts are very small

- The stove's fire window is 11 × 11 px (95 opaque px): 3.6 CSS px at zoom 0.6, 7 at 1.2.
- The typewriters change ≤ 133 px per frame.
- `typewriter_a` on desk 1 sits mostly behind `lamp_a`'s shade (`$S/shots/e_overlay_states_3x.png`).

The builder acknowledges this. The kettle steam and chimney smoke FX (`fxPoints`) will carry the "alive" read, so CODE-2 should always run them while revealed. Moving `typewriter_a` 0.15 m clear of the lamp would make 셈이's desk read.

### L3 (low): coin sacks S / M / L are too alike to show "size by value"

They are 32 × 36, 37 × 42 and 42 × 46 px: about +15 % per step. Head-carried at `carryScale` 0.65 and zoom 0.6 that is ≈ 6.8 / 7.8 / 8.9 CSS px wide.

**Fix:** spread them to ≥ +35 % per step, or give L spilling coins and a second knot, so the courier's haul reads (`$S/shots/i_row.png`).

### L4 (low): `reveal.states` naming differs from the contract

§AI asks for `reveal.states` (`closed`, `open`), where open is the shell at `openAlpha` 0.12 with the stubs on. In the manifest that look is called `cut` (the default), while `open` means no front walls and no stubs at all. A code builder following the contract picks the stub-less look.

**Fix:** rename (`cut` → `open`, the current `open` → `bare`) or add `contractOpen: "cut"`. Keep `fade` and `cut` as they are.

### L5 (low): the outside-prop depth rule is ambiguous; the builder's own harness ignores y

`outsideActors` says "give it at least building depth + 0.02". `tools/test/office_phaser.mjs` sets the mailbox to `base + 0.02 + y·1e-6`, ignoring its y of 56. So the chief walking along the façade at 0.02 < y < 56, behind the box, is drawn over it.

**Fix:** state that the depth of an outside prop or actor is `max(world y, building depth + 0.02)`.

### L6 (low): the sign board is tiny at zoom 0.6; ghost sign text in the cut view

- `signRect` is 83 × 25 px, so the written 촌장 사무실 is about 27 × 8 CSS px at zoom 0.6, with hangul about 6 CSS px tall. It is legible from 1.0.
- The text follows the shell alpha, so in `cut` it floats at 12 % over the interior's left wall.

**Fix:** widen the board to about 110 × 32 px if the roofline allows, and have CODE-2 hide the text when the shell alpha is below 0.5. No sheared-text helper exists in `src/` yet (`grep shearY src/` finds nothing); the builder's canvas-shear recipe in `office_phaser.mjs` should be lifted into CODE-2.

### L7 (low): previews and report still use stand-ins

`officefolk` and `chief2` are now in the tree. Regenerate `off_office_states.png`, `off_reveal.gif` and `off_phone_*` with the real staff; they would have shown H2, M1 and M2. Also update known issue #1 in `v42_office.md`.

### L8 (low, code note): inside staff will have no contact shadow

`Character.js` draws every shadow at `DEPTH.SHADOW` (−11000), under `_floor`. People inside the office, and inside the bank today, get no shadow. CODE-2 should draw inside shadows at `building + floor depthOffset + ε`, as this harness does. This is not an art defect, but it decides whether standing staff look planted.

### L9 (low): the `half` state is a muddy double exposure

The shell at 0.45 over the full interior (`docs/previews/off_office_states.png`, top middle) reads as a ghosted mess, not a peek. Do not expose it in the game, or drop it.

---

## 4. Budgets (measured)

| Item | Value | Limit |
|---|---|---|
| Files | 5 | §AI 5 |
| Bytes on disk | 232,605 | — |
| `office_bld` | 968 × 1352, 4.99 MiB RGBA source-sum, 256-colour palette (house style) | ≤ 5.5 MiB, ≤ 2048 |
| `office_items` | 88 × 120, 0.04 MiB | — |
| Closed-look share | shell, glow, props, mailbox: ≈ 2.07 MiB of trimmed frame area | plan 2.5 (see M6) |
| Inside share | ≈ 2.31 MiB of trimmed frame area | plan 3 |
| Page load | 0 errors and 0 × 404 in all 19 harness loads | — |

## 5. Integration notes for CODE-2 (besides H1)

1. Seated anchors: put officefolk `desk_*` and chief2 `sit_*` sprites exactly on `deskPoints` / `chiefDeskPoint` in band `behind`; they fit. Put visitors on `seatPoints` in band `front` (after M1).
2. Draw the night `_glow` only when closed and `dayClock.lightsOn`. Also feed `night.lightPoints`; without them the panes stay dull (`$S/shots/w_night_trio.png`, middle). Use `lightPointsOpen` while revealed.
3. The desk-top overlays are patches at −0.08, after `_interior_front`. Cutaway.js's index order already does this.
4. Before the 0.4 s panel opens, keep the chief's `chiefDeskPad` stand out of the bench (M2).

## 6. Evidence index (all in `$S/shots/`)

| File | Shows |
|---|---|
| `w_z06_closed.png`, `w_z06_cut.png`, `w_z06_pair.png` | phone, zoom 0.6, day, plan placement next to the bank |
| `w_z10_cut.png`, `w_z10_cut_crop.png` | phone, zoom 1.0, real staff |
| `w_z12_closed.png`, `w_z12_cut.png`, `w_z12_pair.png` | phone, zoom 1.2 (the default game zoom) |
| `w_z10_closed_night.png`, `w_z10_closed_night_nolights.png`, `w_z10_cut_night.png`, `w_night_trio.png` | night |
| `g_z12_closed_day.png`, `g_vs_documented_closed_day.png`, `g_closed_doc_vs_game_crop.png`, `g_closed_diffmask.png` | H1 |
| `c_cut_desks.png`, `c_open_desks.png`, `h_bok_doorframe.png` | H2, seated staff |
| `c_open_desks_bench.png`, `c_cut_desks_bench.png`, `d_bench_points.png` | M1 |
| `l_chief_pad_bench.png`, `p_cut.png`, `p_open.png` | M2, L1 |
| `k_points_wallcircles_3x.png` | M3, M2 |
| `e_mailbox_frames_4x.png`, `i_people.png` | M4 |
| `e_safe_open_vs_shut_open_and_cut_4x.png`, `e_safe_pair_5x.png`, `e_overlay_states_3x.png` | M5, L2 |
| `i_row.png` | L3, items vs existing items |
| `j_style_lineup_1x.png` | style and scale vs `town_hall`, `bank`, `house_a`, `post_office` |
| `a_shell_props_floor.png`, `a_back_int.png`, `a_back_zoom.png`, `b_cut_with_without_overlays.png`, `b_desks_zoom_with_without_overlays.png`, `f_shell_edges_dark.png`, `f_shell_edges_white.png` | layer audit, halos |
