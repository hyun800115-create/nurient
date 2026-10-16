# v42_officefolk: adversarial art review (office / bank / depot staff, CONTRACT_V42 §AJ)

**Verdict: polish.**

The art is good. The eight presets are charming, they read by colour and silhouette on a phone, and they match the
townfolk house style. Light, outline, materials and scale all match their v4 neighbours. I found no halos, no layer
seams, no popping between alias poses and no sliding feet at `groundSpeed`. The manifest follows §AJ (keys, frames,
fps, dirs, items, fallbacks, presets, page budgets), and the builder's own gates reproduce (0 errors; 2000 / 2000
parity).

The problems are in data and integration, not in the look:
- One point table is wrong: the coins would fly onto the courier's hat.
- The game's own doll renderer cannot draw the set yet.
- Two staff lose their signature acting where the plan puts them: the tellers behind the bank counter, and the courier
  and the aide on the plaza.

None of this needs a new art direction. Two fixes are a single line each (H2, and the residency part of M1).

All work is in the scratch folder `/tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/v42art_officefolk_critic`,
called `$S` below. Every page load reported 0 page errors and 0 404s. Nothing in the repo was changed except this file.

| Severity | Count |
|---|---|
| critical | 0 |
| high | 3 |
| medium | 7 |
| low | 10 |

---

## 0. 디자이너용 요약 (쉬운 말)

**좋은 점**
- 여덟 직원 모두 귀엽고 마을 사람들과 한 가족처럼 보여요. 휴대폰(줌 0.6)에서도 색과 모양으로 누가 누구인지 알 수 있어요.
  - 노란 비니에 자루를 멘 딸랑이
  - 자주색 블레이저의 총총이
  - 초록 / 자주 조끼의 창구 직원
  - 안경 쓴 은행장
  - 형광 조끼의 창고 직원
- 딸랑이가 자루를 메고 걷는 모습이 특히 좋아요. 무거운 자루 때문에 몸이 살짝 앞으로 숙여져요. 걸을 때 발이 미끄러지지 않아요.
- 열린 자루에 동전을 담는 모습(scoop)이 아주 귀여워요. 자루 안에 금화가 보여요.

**꼭 고칠 점 1: 동전이 자루가 아니라 딸랑이 모자로 날아가요.**
- 동전이 자루 입구로 날아가는 위치 값이 잘못 들어가 있어요. 모든 방향에서 그 위치가 모자나 어깨 위에 있어요.

**꼭 고칠 점 2: 은행 창구 직원이 창구 뒤에서 머리만 유령처럼 보여요.**
- 직원은 도장을 허리 높이에서 찍어요. 그런데 은행 창구는 직원 가슴 높이이고, 그 위에 반투명 유리가 있어요.
- 그래서 도장 찍기와 영수증 건네기가 전혀 안 보이고, 유리 너머로 흐릿한 머리만 보여요.

**꼭 고칠 점 3: 지금 게임 코드로는 이 직원들을 그릴 수 없어요.**
- 게임이 사람을 그리는 코드는 이 세트의 그림 위치를 아직 몰라요. 그대로 쓰면 몸 없이 머리만 떠 있어요.
- 코드 담당(CODE-2)이 꼭 한 줄을 고쳐야 해요.

**그 밖에 보이는 것들**
- 광장에서는 딸랑이가 동전을 담는 동작을 못 해요. 그냥 서 있어요.
- 총총이도 광장에서는 수첩에 메모하는 동작을 못 해요. (그림이 다른 장에 있어서, 광장에서는 그 장을 불러오지 않아요.)
- 은행장이 광장을 지나가면 양복 윗옷이 사라지고 셔츠만 보여요. 서 있을 때는 제자리걸음을 해요.
- 딸랑이가 정면(아래쪽)으로 걸어올 때는 자루가 머리 옆 작은 혹처럼 보여서 손을 흔드는 것 같아요.
  - 금화 무늬는 등 쪽에서만 보여요.
  - 자루 크기는 하나뿐이라, 동전이 많아져도 커지지 않아요.
- 창구 직원의 나비 리본이 셔츠와 같은 색이라 안 보여요.
- 인사(bow)가 부드럽게 숙여지지 않고 "툭" 하고 떨어졌다 올라와요.
- 셈이가 칠판을 가리킬 때 막대 끝이 칠판 오른쪽 벽을 가리켜요.
- 수화기, 도장, 방울 브로치가 휴대폰에서는 너무 작아서 거의 안 보여요.

---

## 1. How it was tested

### Static checks
- Read §AJ and §AN of `docs/CONTRACT_V42.md`, plan §6.1–6.6 and §13.2, the build report, the manifest and all four
  atlases.
- Wrote my own contract checker. It compares anims, frames, fps, repeat, dirs, head poses, `animItems`, `impactFrame`,
  cover, presets, pages and MiB.
- Re-ran `of_check.py` (0 errors). Re-ran the builder's `--parity` and `--jsgen` from a scratch copy with the output
  redirected, so the builder's cache was not touched:
  - parity: 2000 / 2000 identical; the game atlas differs on 132 layers;
  - jsgen: 0 promise fails, 0 missing core frames.

### Python pixel audits
These use the repo compositors as a library, with `PYTHONDONTWRITEBYTECODE`.

| Script | What it does |
|---|---|
| `$S/tools/sheets.py` | per-anim sheets: 8 presets × every dir × frame (v4.2 merge, fallbacks as the game picks them) |
| `$S/tools/points.py`, `$S/tools/ptdraw.py` | every manifest point against the pixels of the item it names |
| `$S/tools/itemvis.py` | visible item area per frame |
| `$S/tools/feet.py` | planted-foot tracking for `carry_sack` vs townfolk `walk` |
| `$S/tools/edges.py` | halo metric |
| `$S/tools/holes.py` | enclosed-hole metric |
| `$S/tools/poses.py` | alias / torso-pose table |

### Phaser 3.90 harness
- Files: `$S/harness.mjs` and `$S/page.js`. They use the repo's `serve.mjs`, `pw.mjs`, `townfolk_compose.js` and
  `officefolk_compose.js` read-only.
- Device: phone 390 × 844 at DPR 3, k = 1.65 as in `src/main.js`.
- Zoom 0.6, 1.0 and 1.2 for every scene. Desktop-style close-ups at 2.5–3.
- Day, and night as the DayClock look: MULTIPLY at darkness 0.45 with `0x5a6aa8`.
- Merge: the **v4.2 merge** (townfolk + officefolk, `down → nod`). The all-fragments merge was used for comparison.
- People are drawn the way the build report tells CODE-2 to draw them:
  - `OfficefolkSprite` with a page `has` predicate built from `ofPages.scenes`;
  - the seat anchor on the seat point;
  - the soft shadow at `deskSeat.groundOffsetPx`.

| Mode | Scene |
|---|---|
| `lineup` | 8 presets idle + 3 signature anims each (seated ones behind a desk mock), next to v4 townsfolk and the chief |
| `office` | the real `assets/office` cutaway at (110, 810), plan points, staff in `@behind` / `@front`, courier and townsfolk on the road |
| `bank` | the real civic bank at (−340, 570), tellers on `staffPoints`, manager, courier at `counterPoints[0]`; options `tlift`, `mgr` |
| `plaza` | **only the `sack` page resident** (`ofPages.scenes.plaza`); courier in 8 dirs moved at `groundSpeed` or at 150 px/s; aide, manager, clerk walking; scoop |

Example:
```
cd $S && PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers nice -n 10 node harness.mjs \
  "bank_z25=mode=bank&zoom=2.5&freeze=1&fx=-300&fy=530" "plaza_sack_z10=mode=plaza&zoom=1.0&freeze=1&pages=sack"
```

### Node probes
- `node $S/node/gamepath.mjs` draws staff through the game's own `TF.layersInto`.
- `node $S/node/plaza_picks.mjs` lists which anim each staff member really plays under each scene's resident pages.

---

## 2. Contract compliance (§AJ)

| Item | Result |
|---|---|
| Header | `fragment officefolk`, `extends townfolk`, `requires [townfolk]`, `mergeAfter [townfolk2, beachfolk, cityfolk]` ✓. Merges with and without the optional fragments ✓ (re-checked). |
| Frame size / anchor | 128 × 128, [0.5, 0.8125] in the conventions and in all four atlas JSONs ✓. Seated anchor is the seat point (0.45 m) ✓. |
| 14 anims | frames / fps / repeat / dirs / `impactFrame` all match the table ✓. |
| Head poses | All match the contract, except `point_board` NE / N and `hand_over` NE, which use `loco` instead of `soc`. `soc` has no NE / N head frames, so this is justified; it is documented in the build report but not flagged as a deviation (L6). |
| `animItems` | match ✓. `held_pen` on 0–3, `held_stamp` on 4–5 ✓. |
| `animFallback` | identical to the contract list ✓. |
| 11 parts | family, space, tint (`acc_sleeves` → `acc`, follows both arms; `acc_bell_pin` untinted) ✓. |
| Cover | Adults: the full contract list. Elders lack `top_uniform`, `acc_mailbag`, `det_bow`, `det_hivis`; v4 gives those parts adult-only ages, so this is correct. `carry_sack` = the courier wardrobe on adult_slim / adult_round ✓. |
| 8 presets | Wardrobe, bases and colour families match ✓ (blazer plum/navy, duffle red/green, vest bottle green/burgundy, parka slate/olive). |
| Pages | `desk` 3.67 / 6.0, `work` 3.10 / 4.0, `errand` 3.51 / 4.0, `sack` 1.27 / 1.5 MiB ✓. 9 files ✓, 1.50 MB payload. |
| Points inside frames | ✓ by `of_check`. But **points on their items** ✗: `sackPoint.scoop` is wrong (H2). |
| Parity with the game's `Townfolk.js` | ✗ for atlases. 132 / 207 old-anim layers differ, and the office anims cannot be compared at all (H1). |
| Previews | Present (each anim × 8 presets, seated row behind a desk mock, office, phone) ✓. Nothing shows the bank counter, the plaza page set, or the points drawn on frames. That is why H2, H3 and M1 were not seen. |

---

## 3. Findings

### H1 (high): the game's doll renderer cannot draw officefolk; the contract's parity line is not met

**Area:** `src/core/Townfolk.js` `TF.layersInto` / `TF.person` against the merged manifest. The fix is CODE-2's;
proving parity is this job's.

**What happens**
- Plan §14 / C2-C merges officefolk with `TF.mergeFragment` and draws staff as `DollSprite`s.
- `TF.layersInto` looks every body layer up in `frameAtlas` only. It ignores `frameAtlasAnim`, `animItems`, sub
  `onlyAnims`, part `anims`, `ofCover` / `ofExt` and preset `force`.
- Measured with `node $S/node/gamepath.mjs`:

| Case | Compositor layers | Game layers that resolve |
|---|---|---|
| courier `carry_sack` SE | 18 | 6: head, face, brows, hair, hat; no body, no sack |
| `office_a` `desk_write` | 18 | 8 |
| secretary `note` | 18 | 5 |
| teller `stamp_stand` | 16 | 6 |

  Every office anim draws a floating head. In v4 anims the bell pin, the aide's bow and the manager's blazer and tie
  vanish.
- `TF.person` has no `force`, so the game's generator never gives the 은행장 his blazer: v4 ages exclude it for elders.
- The build report lists this as known issue 1. But §AJ's acceptance line ("same draw lists as the game's
  `Townfolk.js` merge for 500 seeded people") is not met. With the set as delivered, the first CODE-2 drop-in shows
  heads only.

**Fix:** ship the exact runtime patch with the set, so CODE-2 can paste it. Then re-run parity against the patched
`TF`, office anims included.
- In `layersInto`'s `put`, use `(T.frameAtlasAnim && T.frameAtlasAnim[anim] || {})[key] || T.frameAtlas[key]`.
- Skip parts whose `anims` list lacks the anim, and subs whose `onlyAnims` lacks it.
- Append `animItems[anim]`.
- Call `applyForce` after `TF.person`.
- Do the merge with `mergeOfficefolk`, which applies `headPoseFallback`.

**Evidence:** `$S/node/gamepath.mjs` output (reproducible); the builder's parity JSON line
`gameAtlasDiffers: 132` (re-run, same numbers).

### H2 (high): `sackPoint.scoop` is on the courier's hat, not at the sack mouth

**Area:** `bases[*].sackPoint.scoop` for all four bases, all 3 dirs, all 6 frames.

**What happens**
- The point lies **24–34 px** from the nearest pixel of `held_sack_open`, in every case (`$S/tools/points.py`).
- Example: adult_round S frame 2 is (−15.5, −44.0), on the left side of the beanie. The open sack is at about
  (0, −28) in front of the belly.
- The values are almost the `carry_sack` shoulder-sack values (S: (−12.7, −48.9) vs (−9.6, −50.9)).
- Root cause: `tools/blender/of_parts.py`, `place_items4`. The shoulder-sack block runs for every rig that has the
  `sackn_J` joint, and assigns `out['sack'] = base + up * (bounce - 0.03)` **unconditionally**. So it overwrites the
  open-sack mouth computed just above, even when the shoulder sack is hidden (`on == False`).
- The `of_check` rule only tests "inside the frame", so it passes.
- Plan §6.5: "coins hop into the sack over ≈ 1 s". With this table they hop onto his hat at every pad.

**Fix**
- Guard the assignment: `if on: out['sack'] = …`.
- Re-run `--mode meta` and re-pack. No re-render is needed.
- Add a check: every hand / impact / sack / tip point lies within 3 px of an opaque pixel of the layer it names, on
  every frame where that layer is visible.

**Evidence:** `$S/crops/points_courier.png`. Red crosses: `scoop` S / SE / E on the hat and back. `carry_sack` points
are correctly on the sack. Hand, tip and impact points are correct.

### H3 (high): the tellers' acting cannot be seen at the bank counter where the plan puts them

**Area:** `stamp_stand` / `hand_over` at civic `bank.staffPoints[0..2]` (SW, `@behind`), plan §6.4 "behind the
counter".

**What happens**
- Measured on `bank_front` above each teller point:

| What | Height above the teller's feet |
|---|---|
| Opaque counter top | 45–47 px |
| Semi-transparent glass partitions | up to 73–78 px |
| `impactPoint.stamp_stand` | 18.6–23.1 px |
| `handPoint` | 28–41 px |

- So the stamp, the hands and the whole torso are under the counter. Only the heads show, washed out behind the
  glass: "ghost tellers".
- Lifting the tellers 27 px brings the arms above the counter, but they stay behind the glass.

**Fix** (shared; officefolk's part first)
1. officefolk: re-render `stamp_stand` and the teller use of `hand_over` at **counter height**. Hands and stamp should
   meet ≈ 46 px above the feet, and the manifest should carry `counterTopPx` / `liftPx` for a counter (or a
   `stamp_counter` variant).
2. CODE-2: draw tellers lifted by that amount; their feet are hidden by the counter anyway.
3. civic owner / lead: split the glass partitions out of `bank_front` (or draw tellers above them). Otherwise faces stay
   veiled.

Add a cross-set check: impact and hand points at the bank's staff points must be above the opaque counter top.

**Evidence**
- `$S/crops/bank_z12_c.png` (as planned, zoom 1.2).
- `$S/crops/bank_tellers_lift_cmp.png` (left: as planned; right: lifted 27 px, zoom 2.5).
- `$S/shots/bank_z25.png`.

### M1 (medium): roaming staff lose their roaming acts (page split vs. where they act)

**Area:** `ofPages.scenes` (plaza = `sack` only), the errand page contents, and the part `anims` lists.

**What happens** (`node $S/node/plaza_picks.mjs`, plaza residency)
- **Courier:** `scoop → idle`. Most cash pads (market, 교역소, 잡화점, 큰 식당, 세금 상자) are on or near the plaza, so
  딸랑이 just stands at every pad. The contract fallback `scoop → happy` cannot help: `acc_bell_pin.anims` lacks
  `happy`, so the courier can never play `happy`, anywhere.
- **Aide** (follows the chief everywhere, plan §6.4): `note → idle`, `hand_over → talk`, `bow → idle`.
  She never takes notes outside the office, bank or depot.
- **Fallbacks lost everywhere:**
  - six of the eight presets can no longer `wave` or be `happy` (0 / 40 seeds each; only office_b and
    depot_worker can, `$S/node/wavehappy.mjs`);
  - the cause is part `anims` lists and `ofExt` (bell pin, sleeves, adult `det_bow`, elder blazer / tie);
  - v4 townsfolk had both anims.

**Fix**
- Put the two roamers' roaming acts on the resident page, limited to their wardrobe on adult_slim:
  - the courier's `scoop`;
  - the aide's `note` and `hand_over`.
- My estimate is +0.3–0.5 MiB. That needs either a squeeze or a small amendment to the 1.5 MiB `sack` cap. An
  alternative is a separate `roam` page resident with the sack.
- Render `idle` / `walk` / `talk` / `wave` / `happy` for the bell pin and sleeves, or move the contract fallback for
  `scoop` to `talk`.

**Evidence**
- `$S/crops/plaza_sack_z10_c.png` (scoop column shows idle).
- `$S/node/plaza_picks.mjs` output.

### M2 (medium): the 은행장 off the bank page: no blazer, and he marches in place

**Area:** the elder blazer / tie `idle` / `walk` / `talk` frames live on `of_desk_0`.

**What happens**
- With the plaza or depot pages, the manager walks in a white shirt (build report known issue 2).
- Worse: `pickAnim(manager, 'idle')` is not playable (desk page missing, no fallback), so it returns `walk`. A standing
  manager walks in place: `idle->walk` in `plaza_picks`.
- Plan §6.4: lunch 12:00 at the big restaurant; home at 18:00.

**Fix:** move the manager's blazer / tie `idle` / `walk` / `talk` frames (elder_slim, 3 small anims) to the resident
page, or add `idle → [talk]` fallbacks for v4 anims under `has`.

**Evidence:** `$S/crops/plaza_sack_z10_c.png` ("manager walk"); `$S/crops/plaza_sack_z06_night_c.png`.

### M3 (medium): no valid seat for the 은행장; the plan's `deskPoint` puts him on the floor in front of the desk

**Area:** plan §6.4 "the manager seated at `deskPoint` (`desk_write`)", against civic bank points.

**What happens**
- civic `bank.deskPoint` (−48, −31) is a customer's floor spot facing **NW** in slot `front`.
- The seated anims have no NW. NW snaps to W, and the seat anchor lands on a floor point, so he sinks 25 px.
- Result: a man sitting on nothing in the middle of the hall.
- What works: civic's own manager point `staffPoints[3]` (−96, −54, SE, `behind`) with the anchor at
  `y − deskSeat.groundOffsetPx` (−25). The bank desk then covers his lap and he faces the room.
- The build report's game recipe covers only the office's `deskPoints`, not the bank.

**Fix**
- Add a "bank" line to the recipe: manager at `staffPoints[3]`, anchor y − 24.94, band `behind`.
- Ask the lead to correct plan §6.4.
- Optionally ship `seatPoints` for the bank manager in the officefolk manifest notes.

**Evidence:** `$S/crops/bank_manager_cmp.png` (left: staffPoints[3] + seat lift; middle: same point without lift;
right: plan `deskPoint`); `$S/crops/bank_mgr_seat_daynight.png`.

### M4 (medium): 셈이's pointer misses the office board

**Area:** `tipPoint.point_board.NE` at office `boardPoint` (138, −21) / `boardDir` NE.

**What happens**
- In board-local coordinates (`boardRect` 85 × 43 centred at (125, −123), shear 0.5), the tip lands 47–60 px right of
  the board centre on all 6 frames. That is **5–18 px past the right edge**, on the key rack.
- Plan: "chalk / highlight at `tipPoint(dir, i)` on the board bar". It would draw on the wall.
- Facing N, the tip is inside the board but hidden behind her head.

**Fix**
- Either the office moves `boardPoint` about 40 px toward −x, or `point_board` NE gets a steeper pointer pitch.
- Add a cross-set check to `of_check` that reads `assets/office/manifest.json`: every `tipPoint` at `boardPoint` /
  `boardDir` lies inside `boardRect`.
- The office polish job is running now, so coordinate with it.

**Evidence:** `$S/crops/board_tip_ne_vs_n.png` (red circle = manifest `tipPoint`, frame 2).

### M5 (medium): the shoulder sack does not read as a coin sack from the front, and never grows

**Area:** `held_sack_shoulder`, `carry_sack` S / SE / E (+ mirrors).

**What happens**
- **S / SW** (walking toward the camera): only a ~12 × 14 px lump beside the head shows. That is 156–185 visible px,
  against 490–600 px in the other dirs. Next to the raised mitten it reads as **waving**, not carrying.
- The **gold coin emblem** is on the back face only: visible in N / NE, absent in S / SE / E / SW / W. From five of
  eight dirs it is a plain potato sack.
- One size only (build report known issue 7). Plan §6.5 wants the sack to grow in 3 sizes with its value, which was
  the CODE-1 behaviour. That feedback is lost.

**Fix**
- Turn or duplicate the emblem onto the camera-facing side.
- In S, let the sack's top and a few coins peek over the shoulder (or hang it more to the side).
- Render `held_sack_shoulder` as 3 subs (s / m / l) that the game selects, as `held_letter` does with `onlyAnims`.

**Evidence:** `$S/crops/part_courier_held_sack_shoulder.png`, `$S/crops/strip_courier_carry_sack_SSE.png`,
`$S/shots/walk_gs.gif`.

### M6 (medium): the tellers' bow tie is invisible; the aide's is invisible 1 time in 3

**Area:** `det_bow` uses tint slot `top2`, and so does `top_vest.shirt` (v4 part definitions).

**What happens**
- The teller presets set `top2 = shirt_office` (white / cream). The bow is shirt-coloured and shows only as a faint
  outline (known issue 3).
- The bow tie is the identifying detail of the contract's teller wardrobe.
- The secretary's `top2` palette includes ivory (`#F4EDE0`) on a white shirt, so 1 seed in 3 has no visible bow.

**Fix**
- Ship an officefolk-owned bow-tie part (e.g. `acc_bowtie`, tint `acc2`) rendered for the office anims and
  `idle` / `walk` / `talk`, and swap it into the teller presets (needs a one-line contract note).
- Drop ivory from the aide's `top2`.

**Evidence:** `$S/crops/z_tellerb_hair.png` (no bow at the collar); `$S/crops/secretary_looks.png` (row 2: ivory bow
on white).

### M7 (medium): `bow` and `scoop` snap instead of easing

**Area:** alias torso poses.

**What happens**
- `bow` uses 3 torso poses `[0, 1, 2, 2, 1, 0]`. The head goes −44, −42, −30, −30, −42, −44 (adult S). That is a
  **12 px drop in one 125 ms step**, held 250 ms, then back up. Elders drop 13 px.
- `scoop` dips on one frame only (frame 2, 111 ms).
- The bow is the hire moment (plan §6.2: new staff bow under the banner). On screen it reads as a twitch, not a polite
  bow.
- The designer asks for lively motion.

**Fix:** give `bow` an in-between torso pose and timing like 0, 1 (≈ −38), 2, 2, 3 (≈ −36), 0, or hold 2 for 3 frames.
Ease `scoop`'s dip over 2 frames. The cost is one or two extra alias poses on the errand page.

**Evidence:** `$S/crops/strip_bank_manager_bow_SSEE.png`, `$S/crops/strip_courier_scoop_SSEE.png`, `$S/tools/poses.py`
output.

### Low

**L1. Props too small to read on a phone**

| Item | Where | Visible area per frame |
|---|---|---|
| `held_receiver` | SE / E, the dirs the office desks use | 7–8 px; S 15–17 px; cityfolk's `held_phone` is 12–23 px |
| `held_stamp` | | 11–29 px |
| `held_coins` | `desk_count` E | 0–12 px |
| `held_coins` | `desk_count` SE | 23–49 px |
| `acc_bell_pin` | 딸랑이's namesake | ≈ 2–3 device px at zoom 0.6 |

Exaggerate the receiver, stamp and bell about 1.5×, as chibi props usually are.
Evidence: `$S/tools/itemvis.py`, `$S/crops/part_secretary_held_receiver.png`, `$S/crops/cmp_phone.png`.

**L2. Arms drawn over long hair in front acting views.**
- `zfront` puts both arms above the head stack in S / SE / E for all acting anims. With shoulder-length hair
  (`hair_wavy`, `hair_long`, `hair_bob_long`) the sleeves cut the hair lobes. In `idle` the hair covers the shoulders.
- Visible from zoom 1.2.
- Fix: hair `main` z above `arm_front` on frames where the upper arm is at the side, or a per-frame `zfront` that lists
  only the forearm / hand.
- Evidence: `$S/crops/z_tellerb_hair.png` (note S1, stamp_stand S2).

**L3. Holes in seated feet.**
- `shoe_shoes` has an open mouth that shows the background. It is inherited from v4: teller `idle` S shows it too.
- Seated views look down into it, so all 6 seated anims show 2–4 px holes on office_a, the secretary, the tellers and
  the manager.
- §AJ: legs "may be hidden but must still be drawn correctly". The desk usually hides them.
- Fix: add a sock / ankle fill under `shoe_shoes` in the seated renders.
- Evidence: `$S/crops/legs_seated_magenta.png`, `$S/crops/sit_vs_desk_magenta.png`.

**L4. Courier speed against the stride.**
- `BALANCE.v42.courier.speed` is 150 screen px/s. `groundSpeed` is S 27.1, SE 51.6, E 67.9 (adult_round).
- That means 2.2–5.5× foot slide, or 26–66 fps to match. At `groundSpeed` the feet stay planted (`$S/tools/feet.py`
  matches townfolk `walk`).
- Recommend `timeScale = clamp(speed / groundSpeed, 0.8, 1.8)` and a courier speed near 100, as TownSim does
  (`spd / 75`, cap 1.5).
- Evidence: `$S/shots/walk_gs.gif` against `$S/shots/walk_150.gif`.

**L5. v4.2 heads look forward, not at the desk.**
- With `down → nod` (7° instead of 15°), the writing and typing clerks look forward rather than at the paper.
- Visible against the all-fragments merge.
- Fine for v4.2; it returns when townfolk2 loads.
- Evidence: `$S/crops/office_z25_desks_c.png` against `$S/crops/office_z25_desks_tf2_c.png`.

**L6. Undeclared head-pose deviation.**
- `point_board` NE / N and `hand_over` NE use `loco` where §AJ says `soc`, because `soc` has no NE / N head frames.
- Add it to the report's deviation list.

**L7. Office / bank view memory.**
- All 4 pages are resident in the office and bank scenes: 11.55 MiB against plan §13.2's estimate "officefolk
  desk/office pages ≈ 8".
- That is +3.5 MiB in the office-revealed view, which also holds the civic bank. Tell the lead so the ≤ 345 gate is
  re-measured.

**L8. The 은행장 reads as a grey ball from the side.**
- The preset picks `hair_sidepart` / `hair_bald` / `hair_short` with a 50 % `fh_beard`, and grey hair on a charcoal
  blazer.
- In E / SE the grey hair and full grey beard cover the face. Only glasses and a skin patch show.
- Fix: lower the beard chance or use `fh_moustache`.
- Evidence: `$S/crops/z_pair2.png`.

**L9. Courier and depot worker can look alike.**
- Both can draw a yellow beanie. The depot worker's lime hi-vis over olive is close to the courier's green duffle at
  zoom 0.6.
- Fix: keep the depot beanie orange / blue.

**L10. Elder `hand_over` NE.**
- The mittens are hidden behind the body on all but frames 2–3. On those frames `handPoint` is 9 px from the visible
  mitten.
- Rare in play. Note it in the report.

### Seen in passing (not this set)

**Office: desk 0 cuts the head of whoever sits at desk 2.**
- `_interior_front` is one image, so desk 0's drawer unit is drawn over everyone in `@behind`. It cuts the top of the
  head of the person at desk 2 (총총이 in my staffing).
- The owner is the office set (the polish job is running).
- Evidence: `$S/crops/office_secretary_zoom.png`.

---

## 4. What is good (keep it)

**House style match**
- Same Cycles toy materials, outline, light and palette as townfolk / cityfolk.
- On light and dark grounds the edge pixels are darker than the interior, as in v4 (halo metric −0.25 to −0.27 for
  both). No light fringes at night.
- Evidence: `$S/tools/edges.py`, `$S/crops/cmp4_office_a_seams.png`.

**No seams or pops**
- The alias technique (garments per torso key, limbs and items per frame) shows no seams or pops in the front views.
- `zfront` cuts are clean.
- Far-hand gaps in `carry_sack` follow townfolk `walk` exactly.

**Charm**
- The `carry_sack` lean, the "carriage return" swing in `desk_type`, the coin-filled open sack, the cuff sleeves and
  lanyard on 셈이, and the bell with a red bow.

**Correct data**
- Seated anchors: on the real office `deskPoints` the desks cover the laps, and hands land at desk-top height
  (`$S/crops/office_z25_desks_c.png`).
- `handPoint`, `tipPoint`, `impactPoint` and `carry_sack` `sackPoint` sit on their items (`$S/crops/points_courier.png`).
- `groundSpeed` is honest: feet stay planted within about 3 px at the listed speeds.

**Merge hygiene**
- 0 existing values changed.
- 4000 generated people are identical before and after the merge.
- The parity tooling is excellent.

---

## 5. Suggested order of work

1. **H2:** one-line guard in `place_items4`, then `meta` + pack, plus the "point on its item" check.
2. **H1:** ship the `TF.layersInto` / `TF.person` patch text and re-run parity against the patched runtime (office
   anims included).
3. **M1 / M2:** roaming-act frames and the manager's blazer frames on the resident page, and the `idle` fallback under
   `has`.
4. **H3 / M3:** counter-height teller anims + `counterTopPx` / `liftPx`; bank recipe lines in the report; note the
   glass to the lead.
5. **M5 / M6 / M7:** front emblem and S silhouette of the sack, 3 sack sizes, bow-tie part, eased bow and scoop.
6. **Low items as time allows.** Re-run the previews with the bank counter, the plaza page set and the points drawn
   on the frames.

## 6. Evidence index (`$S` = the scratch folder above)

| File | Shows |
|---|---|
| `crops/points_courier.png` | H2: manifest points over frames |
| `crops/bank_z12_c.png`, `crops/bank_tellers_lift_cmp.png`, `shots/bank_z25*.png` | H3 |
| `node/gamepath.mjs` (run it) | H1 |
| `node/plaza_picks.mjs`, `crops/plaza_sack_z10_c.png`, `crops/plaza_sack_z06_night_c.png` | M1, M2 |
| `crops/bank_manager_cmp.png`, `crops/bank_mgr_seat_daynight.png` | M3 |
| `crops/board_tip_ne_vs_n.png` | M4 |
| `crops/part_courier_held_sack_shoulder.png`, `crops/strip_courier_carry_sack_SSE.png`, `shots/walk_gs.gif`, `shots/walk_150.gif` | M5, L4 |
| `crops/z_tellerb_hair.png`, `crops/secretary_looks.png` | M6, L2 |
| `crops/strip_bank_manager_bow_SSEE.png`, `crops/strip_courier_scoop_SSEE.png` | M7 |
| `crops/part_secretary_held_receiver.png`, `crops/cmp_phone.png` | L1 |
| `crops/legs_seated_magenta.png`, `crops/sit_vs_desk_magenta.png` | L3 |
| `crops/lineup_z06_c.png`, `crops/lineup_z10_c.png`, `crops/office_z06_c.png`, `crops/office_z10_night_c.png`, `crops/office_z25_desks*_c.png` | phone readability, day / night |
| `crops/sheet_v42_<anim>.png` (14) | every anim × 8 presets × dir × frame |
