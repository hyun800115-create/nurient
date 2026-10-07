All three parts are done and every check passes. The five base workers now wear real winter work gear, the chief has `pet`/`give`/`throw`, and the 10 new worker variants are in a new `assets/workers/` folder at 3.49 MB (limit 4 MB).

**Checks**
- `char_check`: 11 characters, 1,640 frame names, 3.87 MB, 0 errors, 0 warnings.
- `wkr_check`: 10 variants, 1,600 frame names, 0 errors, 0 warnings. It also confirms each variant's anim settings and points match its base worker.
- `vil_check` and `vil2_check` still report 0 errors, 0 warnings.
- A headless Phaser 3.90 test loaded all 16 atlases and created 425 anims (2,730 frame names), with 0 missing frames and 0 page errors. Screenshot: `docs/previews/wkr_phaser_smoke.png`.

**1. Redesigned base workers (`assets/characters`)**
Keys, frame names, anims, `impactFrame`, `impactPoint`, `carryPoint`, `headTop` and `shadow` are unchanged; `impactPoint` and `carryPoint` were recomputed and came out identical.
- **fisherman:** cream cable-knit sweater with turtleneck, dark oilskin bib overalls, red watch cap, ginger beard, orange gloves, belt knife, rope coil slung across the body; rod in `work`.
- **lumberjack:** red/black buffalo plaid with collar and pockets, tan suspenders, jeans, wool sock rolls, laced boots, leather gloves, green knit cap, big beard.
- **farmer:** chambray shirt, mustard quilted vest, denim bib overalls, red neckerchief, green wellies, straw hat, braids.
- **miner:** sooty open canvas jacket over a henley, red suspenders, tool belt with pouches and hammer, battery pack with a cable up to the helmet lamp, knee pads, steel-toe boots, soot smudges.
- **hunter:** fur trapper hat, fringed buckskin tunic with lacing, grey pelt cloak with ruff, red woven sash, quiver with chest strap, mukluks with snowshoes.

Only my files changed: the five worker atlases and portraits, `char_player.*` and `manifest.json`. Every other file in `assets/characters` is byte-identical, and every other manifest entry is unchanged.

**2. Chief (`player`) new anims, all 5 dirs**
| anim | frames | fps | repeat | impactFrame | impactPoint |
|---|---|---|---|---|---|
| `pet` (crouch and stroke) | 6 | 8 | -1 | — | — |
| `give` (bone biscuit) | 6 | 10 | 0 | 3 | treat position: S[-5,-14] SE[10,-15] E[19,-21] NE[16,-28] N[5,-32] |
| `throw` (red ball) | 8 | 14 | 0 | 4 | release point: S[-7,-30] SE[12,-31] E[24,-38] NE[22,-48] N[7,-54] |

- The ball is in hand on frames 0–3 and gone from frame 4; the treat is visible on frames 0–3.
- **New field `characters.player.petPoint`:** the ground offset (from the chief's anchor) where the dog's anchor should stand, so its head is under the hand during `pet`/`give`. Values: S[-9,14] SE[14,13] E[29,4] NE[26,-7] N[9,-14]; negate dx for mirrored dirs.

**Proof the existing chief anims are unchanged:**
- The 232 cached source frames are byte-identical, and the manifest's existing anims, `impactPoint` and `carryPoint` are identical.
- Re-rendering existing frames with the new rig gives max pixel diff 0. One frame differs by 1/255, which also happens when re-running the original code.
- The atlas itself is visually identical but not pixel-identical. The 230 old frames shift by a mean of 1.6/255 (99th percentile 10/255) because the atlas was re-quantized with its 256-colour palette shared across all frames.
- Byte-exact is not possible: the old palette has no red, so reusing it turns the ball brown. The game loads only one atlas per character.
- Old/new/×8-diff sheet: `docs/previews/char_player_identity.png`.

**3. Variants (`assets/workers/`)**
| key | look (Korean name) | body |
|---|---|---|
| `fisherman_b` | old sailor, white beard, pipe, orange overalls (바다 할아버지) | stout elder |
| `fisherman_c` | young woman, striped sweater, yellow overalls, ponytail (수아) | slim |
| `lumberjack_b` | burly, green plaid, earflap cap (장쇠) | burly |
| `lumberjack_c` | young woman, blue plaid, orange beanie, braid (다온) | slim |
| `farmer_b` | grandpa, felt hat, moustache (농부 할아버지) | elder, hunched |
| `farmer_c` | Korean farm auntie: polka headscarf, floral 몸빼 pants, 토시 arm covers, red gloves (밭일 이모) | plump |
| `miner_b` | old miner, white helmet, blue coverall, walrus moustache (광부 영감) | plump |
| `miner_c` | young woman, bob haircut, orange helmet with goggles (하늘) | slim |
| `hunter_b` | wolf-pelt hood (늑대 사냥꾼) | tall |
| `hunter_c` | young woman, fox-fur hat with tail, white cloak (루미) | slim |

- One atlas per key, named `wkr_<key>`, plus a 128×128 `portrait_<key>`.
- Each variant has the base worker's anims (`idle`, `walk`, `carry_idle`, `carry_walk`, `work`), with the same frame counts, fps and repeat, all in 5 dirs. `impactFrame` matches the base; `impactPoint` and `carryPoint` are computed per body.
- **Manifest entries** add `profession`, `variantOf`, `name {ko, en}`, `traits` and `body`. Hunter variants also have `projectile: "projectile_arrow"`, which reuses the arrow sprite in `char_hunter`.
- **Top-level `professions{}`** gives the hire order per profession (base first, then the variants).
- Atlases use 144 colours. The folder is 3,489,825 bytes.

**Previews (`frost-village/docs/previews/`)**
- Before/after: `wkr_before_after.png`, `wkr_before_after_faces.png`
- All 15 workers: `wkr_lineup.png`, `wkr_portraits.png`, `wkr_work_all.gif`, `wkr_walk_all.gif`
- Per variant: `wkr_<key>.png`
- Base workers: `char_<worker>_work.gif`, `char_<worker>.png`, plus `char_lineup.png` and `char_carry_check.png` regenerated
- Chief: `char_player_newanims.gif` / `.png` (shows the dog placed at `petPoint`), `char_player.png`, `char_player_identity.png`

**Tools (`frost-village/tools/blender/`)**
- New: `char_gear.py` (pattern materials and gear pieces), `wkr_build.py`, `wkr_render.py`, `wkr_pack.py`, `wkr_check.py`, `wkr_lookdev.py`, `wkr_preview.py`.
- Edited: `char_build.py` (new worker specs, treat/ball props; the old dressers are kept for before/after), `char_anim.py`, `char_render.py`, `char_pack.py`, `char_check.py`. Other characters still render identically.
- Raw frames are cached in `/tmp/fv_cache/characters`, `/tmp/fv_cache/workers`, and a backup of the old look in `/tmp/fv_cache/characters_v3_backup`.
- Rebuild:
  ```
  /tmp/bvenv/bin/python tools/blender/char_render.py -- --chars fisherman,lumberjack,farmer,miner,hunter --samples 28 --portraits --force
  /tmp/bvenv/bin/python tools/blender/char_render.py -- --chars player --anims pet,give,throw --samples 28
  python3 tools/blender/char_pack.py --chars player,fisherman,lumberjack,farmer,miner,hunter && python3 tools/blender/char_check.py
  /tmp/bvenv/bin/python tools/blender/wkr_render.py -- --chars all --samples 28 --portraits
  python3 tools/blender/wkr_pack.py && python3 tools/blender/wkr_check.py
  ```

**Known issues**
- The game won't load the variants until `'workers'` is added to the fragment list in `src/core/Assets.js` (code agent).
- In S view the dog stands in front of the chief while petting and covers his lower body. This is expected depth sorting.
- Variants' tools scale with hand size, so the burly lumberjack's axe is bigger and slim workers' tools are slightly smaller.
- In side views the fisherman's rope coil reads as a ring around the torso.
- `fisherman_b`'s rod tip in `work_E_6` stops 1 px short of the frame edge; it is not clipped.
- Another session committed the shared working tree at 15:23 (commit `0a99a0e`), which included my in-progress tool files. I made no git changes myself.