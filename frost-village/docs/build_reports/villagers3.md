`assets/villagers3/` is built. It has the three new craft workers plus complete re-renders of the chef, the baker auntie and the blacksmith, each with the new `operate` anim. `vil3_check.py` reports 0 errors and 0 warnings over 6 keys and 1,878 frame names, and the payload is 3,131,641 bytes (3.13 MB, under the 3.5 MB target). The re-rendered chef, aunt and blacksmith are pixel-identical to their originals, and none of the existing asset folders changed.

## Keys and anims
Every key has `operate`: 8 frames, 10 fps, loop, in all 5 dirs (S, SE, E, NE, N). It is not turned toward the camera, so the operator really faces the station. The other anims use the batch 1/2 specs (locomotion in 5 dirs, social anims in S/SE/E).

| key | status | other anims |
|---|---|---|
| npc_chef (요리사 쿡) | override of villagers2 | 12 core + serve (with its old impactPoint) + dance |
| npc_aunt (빵집 아주머니) | override of villagers | 12 core + dance + sit (seat data kept) |
| npc_blacksmith (대장장이 언니) | override of villagers | 12 core + dance |
| npc_sawyer (제재공 산들) | new, tall body | 12 core |
| npc_smoker (훈제사 연기) | new, big body | 12 core |
| npc_cannery (통조림 기술자 통통) | new, plump body | 12 core (idle face is a smile) |

The new looks follow the brief: goggles pushed up on sandy tousled hair, a sawdust-speckled canvas apron, rolled sleeves and a pencil in the pocket; a knotted dotted bandana, stubble, a plaid shirt, a leather apron and big cream oven mitts; a red flat cap, blue denim overalls with brass buttons and shiny yellow rubber gloves.

## impactFrame and impactPoint
Points are `[dx, dy]` in px from the anchor; negate dx for mirrored dirs. Each `operate` entry also has `beats` (`beats[0]` repeats the impact; `beats[1]` is a second sfx/particle cue), `station`, `workTool` and `workSpot`.

| key | impactFrame | S | SE | E | NE | N | beats[1] |
|---|---|---|---|---|---|---|---|
| chef (fish at the top of the flip) | 4 | [-8,-41] | [17,-43] | [32,-53] | [28,-65] | [8,-73] | frame 6, catch sizzle |
| aunt (full rolling push, flour puff) | 3 | [0,-16] | [19,-20] | [27,-29] | [19,-39] | [0,-43] | frame 3, pin on dough |
| blacksmith (hammer hit, sparks) | 3 | [0,-15] | [20,-19] | [28,-29] | [20,-38] | [0,-43] | frame 5, turn bar |
| sawyer (log front hits the blade, sawdust) | 3 | [0,-6] | [38,-14] | [54,-33] | [38,-52] | [0,-60] | frame 4, cut |
| smoker (ham hooked on the rack) | 3 | [-16,-44] | [-1,-40] | [15,-43] | [22,-51] | [16,-59] | frame 6, fan whoosh (smoke puff) |
| cannery (press down, can sealed) | 3 | [0,-17] | [23,-21] | [32,-33] | [23,-44] | [0,-49] | frame 3, steam hiss (same point) |

## workTool notes
- **Chef:** frying pan in the right hand, left fist on the hip. The roast fish leaves the pan on frame 2, tumbles end over end and lands back on frame 6.
- **Aunt:** rolling pin held by both handles, rolled forward over a dough sheet on a floured board. The board top is 0.50 m high, 0.35 m in front of the anchor.
- **Blacksmith:** tongs in the left hand hold an orange-hot bar. The hammer rises on her right, beside the head (so it shows in S and N), and lands on the bar on frame 3.
- **Sawyer:** both palms push a 0.44 m log (axis 0.60 m high) forward into the saw, then ease it back.
- **Smoker:** lifts a ham on an S-hook up onto the rack (frame 3) and fans the smoke with a round paper fan in the left mitt (frames 4 and 6).
- **Cannery:** pulls a bench-press T-bar lever down with both hands. The ram seals the can: it is open with fish on frames 0–2 and has a lid on frames 3–7.

Faces use the existing parts: a focused face (determined brows, small closed smile), an effort "o" on wind-ups, a smile on the beat (^^ for the cannery worker) and one blink per loop.

## Override notes (also stated in the manifest `notes`)
- The chef, aunt and blacksmith keep the same character keys and also the same atlas keys (`vil_<key>`) and portrait keys.
- Merge villagers3 after villagers and villagers2. Because the game's loader lets the later fragment win key by key, the old atlas files are then never downloaded. A Phaser test confirmed this: it made 0 requests for the old atlases.
- Name, role, traits, headTop, shadow and seat data are copied unchanged from the old entries. Each override entry carries `overrides`; every key carries `operates: [station]`.
- **Identical look, verified against the original raw renders:**
  - chef: 297 of 298 frames byte-identical, the last differs by at most 1/255
  - aunt: 291 of 292 byte-identical, the last differs by at most 1/255
  - blacksmith: 280 of 280 byte-identical
  - no frame differs in alpha
  - all three portrait PNGs are byte-identical to the old ones
  - every frame of the old atlases is present in the new ones

## Checks
- `vil_check` (20 keys) and `vil2_check` (12 keys) still report 0 errors.
- A Phaser smoke test merged the three fragments and found all 1,878 frames, built 297 anims, mirrored W correctly and threw no errors.
- Of 616 baseline files, every file in the existing asset folders is byte-identical. All `vil_*` and `vil2_*` tools, `bl_common` and `pack_utils` are unchanged.
- Eight tool scripts did change during the run: `char_anim`, `char_build`, `char_check`, `char_pack`, `char_render` and three files in `tools/test`. Another agent (the Workers / v3-test tasks) edited these at 15:00–15:16; my scripts never write to `tools/`. The edits don't touch the helpers or `ink_outline` that the villager pipeline uses.

## Known issues
- The game code doesn't load villagers3 yet. It needs `villagers3` added to `FRAGMENTS` after `villagers2` and to `LAZY_FRAGMENTS`, plus an `operate: ['idle']` entry in `ANIM_FALLBACK`.
- The chief (player) has no `operate` anim; that is the char pipeline and was out of scope.
- In N/NE the tools are mostly hidden behind the body. What reads there is the raised hammer and ham, plus body lean and bob.
- The bakery board and the can press are drawn into the frames. They float if the operator isn't placed at the station edge, so use `workSpot` to position them.
- Some loops pop at a reset: the smoker's ham vanishes on frames 4–6 (it is meant to be on the station rack) and a new one appears on frame 7, and the can goes back to open when the loop restarts. The sawyer's log push-and-retract is a rocking loop, not a continuous feed.
- In S view the chef's fish passes in front of his face on frames 3–5.
- The smoker's stubble reads as a grey beard in the portrait.
- The palette is 96 colours (as in batch 2); batch 1 used 192 for the aunt and blacksmith.
- The Phaser smoke-test script stays in my scratchpad; only its screenshot was saved.

To regenerate: `/tmp/bvenv/bin/python tools/blender/vil3_render.py -- --chars all --samples 24 --portraits` (resumable; `--pincheck` checks that the hands reach their targets), then `python3 tools/blender/vil3_pack.py` and `python3 tools/blender/vil3_check.py`. Raw frames are cached in `/tmp/fv_cache/villagers3`, and a full render takes about 22 minutes on the shared CPU.

## Files
- Assets: `/home/user/nurient/frost-village/assets/villagers3/` (`manifest.json`, `vil_<key>.png`/`.json`, `portrait_<key>.png` for the 6 keys)
- Tools: `/home/user/nurient/frost-village/tools/blender/`
  - `vil3_anim.py`
  - `vil3_dress.py`
  - `vil3_build.py`
  - `vil3_render.py`
  - `vil3_pack.py`
  - `vil3_check.py`
- Previews: `/home/user/nurient/frost-village/docs/previews/`
  - `vil3_lineup.png`
  - `vil3_operate.png`
  - `vil3_<key>_operate.gif` (6, one per key)
  - `vil3_<key>.png` contact sheets (6)
  - `vil3_phaser_smoke.png`