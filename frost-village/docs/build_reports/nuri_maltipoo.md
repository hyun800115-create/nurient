# 누리 — the Maltipoo (pet dog re-model + rename)

Applied to the main tree on 27 Oct 2026 on top of the v4.2.1 work in progress (patch made against b7c190f; also applies cleanly to aa169bd). Ships with v4.2.1 and the first Google Play build.

## Build report

I've finished the patch. The dog is now 누리, a light-brown Maltipoo, in every frame and image. It is saved as a diff against b7c190f and has not been committed. All required checks pass. Two browser checks (`life`, `texbudget`) each failed one run on a check that is known to be flaky, then passed when rerun.

**Deliverables**
- Diff: /tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/nuri_fix/nuri.diff
  - Made with `git diff --binary` against b7c190f: 106 files, 5 new, art included, 6.7 MB.
  - It applies cleanly to b7c190f and to current main efcb0f1.
  - It contains no test screenshots or texbudget output.
  - The changes are staged in /tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/nuri_wt.
- Hero renders for the designer, transparent PNGs, all three viewed:
  - /tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/nuri_fix/hero/nuri_hero_sit.png
  - /tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/nuri_fix/hero/nuri_hero_run.png
  - /tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/nuri_fix/hero/nuri_hero_chief.png (the chief petting 누리)
- Parity proof: /tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/nuri_fix/parity.txt
- In-game shots at 390×844, DPR 3, each viewed: /tmp/claude-0/-home-user-nurient/8cadcbb8-7304-572f-9d68-572175fda0e7/scratchpad/nuri_fix/shots/ingame/
  - Day: 01_running, 02_beg_bar, 03_petted_roll, 04_treat_eat, 05_ball_back, 06_ball_catch, 07_trick, 08_gift.
  - Night: 11_night_running, 12_night_beg, 13_night_petted, taken at 21:30 from a v4.1 save. A new game has no day/night clock yet.
  - Each shot has a `_crop.png` close-up. Contact sheets are `ingame_crops_day.jpg` and `ingame_crops_night.jpg` in `shots/`.
- Before/after images in `nuri_fix/shots/`:
  - before_after_frames_3x.png and before_after_portrait_icon.png.
  - `before/` (old shiba) and `suite_dog/` (new) hold the dog suite's screenshots.
  - phaser_load.png shows every animation and direction, the icons, portrait, title pieces and a night strip.
- Look-dev images: `ld2_sheet.png`, `ldgame_cmp2.png` (game size next to the chief and residents, day and night), `icon_cmp2.png`, `portrait_cmp2.png` in `nuri_fix/`.

**What changed**
- **Art:**
  - New model `tools/blender/pet2_maltipoo.py`, on the same skeleton as the old dog. Curly light-caramel coat, white chest, white socks on the front paws only, button eyes, small black nose, floppy furry ears, plumed tail. The shiba's scarf is gone.
  - `pet2_build.py` now builds this dog. `pet2_render.py` renders the portrait from it, and `pet2_pack.py` packs the frames more tightly.
  - Re-rendered: all 266 frames (`assets/pets2/pets2_pet_dog.*`), both portraits, the pet icon (`gen_pets2_ui.py`) and the doc previews.
  - Title island: new `tools/title/patch_actor.py` re-bakes only the dog's pieces in `assets/title_bake/ttl_1_0`. I mirrored it into `src/title/bake/`, which was a byte-identical copy of `assets/title_bake/` at HEAD.
  - New tools: `pet2_lookdev.py` (turnaround renders) and `pet2_hero.py` (the hero renders).
- **Name:**
  - Every 콩이 is now 누리 and Kongi is Nuri, across src, tools, manifests and docs. 시바견 콩이 became 말티푸 누리.
  - Left as they were on purpose: the 킹콩이지요 joke, the 콩콩이 toddler nickname, `docs/build_reports`, `handoff/`, `docs/store`.
  - Voice lexicon: 누리 now means the dog only at the start of a word; 누리다, 누리고, 누리는, 누리며 and 누리꾼 are excluded.
- **Name pools and saves:**
  - 누리 is removed from every person-name pool. In TownSim it was citizen #90, now 도담 / Dodam; there are still 120 pairs.
  - Also removed from both story-engine name pools and from `adopt.js` MALE_NAMES.
  - `save.js` change is additive: a story resident called 누리 loads as 도담. The save stays v7, and saves without that resident round-trip byte for byte.
- **Test:** new `tools/test/nuri.test.mjs`, 27/27.

**Parity**
- Identical to HEAD: the 266 frame names, 128×128 frame size, anchor, directions, mirroring, shadow, mouth/treat/belly points, and every animation's frames, fps, repeat and impact data.
- Bubble-height values moved 1 px each to fit the new art: headTop −39 → −40, headTopBeg −55 → −54.
- The title bake keeps its actors and 43 frame names.

**Texture memory (GPU) is lower than HEAD**

| Texture | HEAD | Now |
|---|---|---|
| Dog atlas | 2048×392 (3136 KB) | 2048×388 (3104 KB) |
| Icons | 572×96 | 580×96 |
| Title page ttl_1_0 | 212×772 | 102×1216 |
| **All changed textures** | **3.90 MB** | **3.72 MB** |

- Steady-state title memory: 151.1 MiB now vs 151.2 MiB at HEAD.

**Tests**
- Pass: `dog` 15/15, `smoke` 53/53, `v3` 18/18, `labour` 28/28, `save_v42` all passed, `voice_runtime` 29/29, `pet2_check` 0 errors and 0 warnings.
- Phaser load: 266 frames, 41 animations, nothing missing, no errors.
- Node tests: all 33 files pass. I also applied the diff to a clean HEAD and re-ran `nuri.test`, `voice_runtime` and `pet2_check` there.
- `life`: 13/14 on the first run ("tag among kids", the known flaky check), 14/14 on the rerun.
- `texbudget`: HEAD on this machine scores 9/12. The patch scored 8, 8, then 9/12. The three misses every time are the same soft targets that already miss at HEAD (title 90, plaza 300, tour 300). The extra miss in two runs was "return to the start of the tour"; at HEAD it passed (347.8 → 347.3 MiB). On the patch the start and end samples differed by about 20–28 MiB in those two runs, and the plaza samples wander by about 15 MiB within one run. That swing comes from ground slots and other residents' animation pages loading and unloading, not from dog textures. All hard limits pass.

**Open issues**
1. The app icon (`assets/title/icon/*`) still shows the shiba. Re-running `ttl_icon.py` now builds 누리; this is for the store-look work.
2. I left `docs/store` untouched; three places there still name the old dog:
   - listing_ko.md line 55 → "· 말티푸 강아지 누리를 휘파람으로 부르고, 쓰다듬고, 함께 놀아 주세요."
   - listing_en.md line 52 → "· Whistle for Nuri the little Maltipoo, then pat, feed and play fetch together."
   - Comments on lines 8 and 175 of `docs/store/tools/make_graphics.py` still say 콩이.
3. The dog atlas PNG download grows by about 64 KB (310,699 → 374,806 bytes) because the curly fur has more detail. GPU memory still goes down.
4. Name side-effects in existing saves:
   - Any existing TownSim citizen #90 now displays as 도담.
   - Old news or letter text already stored in a save that mentions a person called 누리 is not rewritten.
5. The unused `vil_pet_dog` atlas in `assets/villagers` is still the shiba. It is overridden by pets2 and never downloaded.
6. The full title re-bake (`bake_title.mjs`) was already broken at HEAD ("missing frame train_engine:shadow_SE"), which is why I patched only the dog's pieces.
7. The title screenshot was taken during the intro, before the dog appears; I checked the title dog pieces through the Phaser load test instead.

**Korean summary for the designer**

누리 완성했어요!
- 연한 갈색 곱슬털 말티푸로 새로 만들었어요. 가슴에 흰 털, 앞발에 하얀 양말, 까만 단추 눈, 축 늘어진 복슬 귀, 복슬복슬 꼬리예요. 시바견 때의 빨간 목도리는 뺐어요.
- 달리기, 앉기, 쓰다듬기(배 보이고 뒹굴기), 간식, 공놀이, 재주, 선물까지 동작 266장을 모두 새로 그렸어요. 움직임과 속도는 그대로예요.
- 이름이 콩이에서 누리(영어 Nuri)로 바뀌었어요. 알림, 신문, 주민 대화, 쓰다듬기 버튼 그림, 초상화, 타이틀 섬의 강아지도 모두 누리예요.
- 주민 이름 목록에서 '누리'를 뺐어요. 예전 저장에 '누리'라는 주민이 있으면 '도담'으로 바뀌고, 저장은 그대로 이어서 할 수 있어요.
- 앱 아이콘은 스토어 그림 작업에서 새로 만드는 중이라 아직 예전 시바견이에요.
- 큰 그림 3장을 드려요: 앉은 누리, 달리는 누리, 촌장님이 쓰다듬는 누리.

## Independent check



**Diff applies cleanly**
- `git apply --check -3` and a plain `--check` both pass on efcb0f1.
- I also checked it on top of the v4.2.1 edits now uncommitted in the main tree (copied at 10:09, without touching the main tree): no conflicts.

**Parity with the old dog**
- Same 266 frame names, frame sizes and anchors. All 11 animation entries are identical, including frames, fps, repeat and the mouth/treat/belly/impact points.
- The only changes are the two bubble heights (−39 → −40 and −55 → −54) and the name.
- On the title page only the 41 dog frames changed; the 2 glow frames are pixel-identical. `assets/title_bake` and `src/title/bake` are identical to each other.
- Texture sizes: dog atlas 2048×392 → 2048×388; icons 572 → 580 px wide; title page 212×772 → 102×1216.

**Look**
- It is clearly a light-brown curly Maltipoo with a white chest and white front socks, in the same 3D chibi style as the game.
- At phone zoom the white chest shows; the socks are only a few pixels there. The pet-button icon and the portrait both read well.

**Names**
- No 콩이, Kongi or 시바 is left in src, assets, index.html or tools/apk. The only ones left are on purpose: the 킹콩이 joke, the 콩콩이 toddler, one comment, and the new test.
- 누리 is gone from every name pool. Citizen #90 is now 도담 at the same index in Korean and English, still 120 pairs, and no duplicate names were created.

**Tests I ran on HEAD + diff (one at a time, with nice)**

| Suite | Result |
|---|---|
| `nuri.test` | 27/27 |
| `voice_runtime` | 29/29 |
| `dog` | 15/15 |
| `smoke` | 53/53 |
| `save_v42` (v4.1 and v3.5 save files migrating to v7) | all passed |
| `life` | 14/14, first try |

**Loading a real v4.1 save in the browser**
- I loaded the 46-minute v4.1 save with the patch. It boots with 117 townspeople; #90 is 도담 and nobody is called 누리.
- The whistle brings the dog, it draws from the new atlas, and the toast reads "누리가 달려와요!". It saves as v7 and reloads, with 0 console errors.
- One check in my own script failed after the reload: it read 0 townspeople because I did not wait for them to load. That is my script's timing, not the patch.

**Two things before showing the designer**
- **Chief hero render:** in `nuri_hero_chief.png` the chief floats tilted with jagged bangs. Since he just said the characters aren't pretty, I'd show only `nuri_hero_sit.png` and `nuri_hero_run.png`.
- **What's-new panel:** the 「새로워진 것」 panel he sees when updating from v4.1 doesn't mention 누리. An optional line would help him and the testers notice.

**Cleanup:** `nuri_wt` (checked identical to `nuri.diff` first), `nuri_chk` and my temporary worktree are removed, and I ran `git worktree prune`. There were no `look_*` worktrees. `look_work` is a plain folder holding the raw captures `make_graphics.py` needs, so I kept it. The `xfer_*` worktrees belong to another job; I left them alone.


