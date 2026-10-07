All 12 batch-2 residents are rendered, packed and checked. `vil2_check` reports 0 errors and 0 warnings over 3,534 frame names, and the payload is 5,844,341 bytes (5.84 MB, under 6 MB in both decimal and binary units). Batch 1 is untouched: `vil_check` still reports 0 errors.

## Files the game loads (`frost-village/assets/villagers2/`)
- `manifest.json` uses the same format as `assets/villagers`: `version`, `notes`, `atlases[]` (`villagers2/vil_<key>.png/.json`), `images[]` and `sprites{}` for the portraits, and `characters{}`.
- There is one trimmed Phaser JSON-hash atlas per key, 96-colour palette, all ≤ 2048 px wide: `vil_npc_<key>.png/.json`.
- Each key has a 128×128 portrait, `portrait_<key>`.
- Frames are 128×128, anchor `[0.5, 0.8125]`, frame name `{anim}_{dir}_{i}`.
- Each key has `dirs` S, SE, E, NE, N and `mirror` {SW: SE, W: E, NW: NE}; every anim lists its own `dirs`.
- Every key has `kind: "villager"`, `role`, `name {ko, en}`, `traits`, `headTop`, `shadow` and `portrait`.

## Keys and anims
All 12 keys have the 12 core anims at batch-1 specs:

| anim | frames / fps / repeat | dirs |
|---|---|---|
| idle | 4 / 6 / loop | 5 |
| walk | 8 / 12 / loop | 5 |
| carry_walk | 8 / 12 / loop | 5 |
| happy, laugh, wave, angry | 6 / 10 / loop | S, SE, E |
| talk | 8 / 10 / loop | S, SE, E |
| surprised | 6 / 12 / once | S, SE, E |
| hit | 6 / 12 / once | S, SE, E |
| sad | 4 / 6 / loop | S, SE, E |
| shiver | 4 / 12 / loop | S, SE, E |

Extras by key:

| key | role | extras |
|---|---|---|
| npc_clerk_a, npc_clerk_b | adult | serve, bow |
| npc_porter_a | adult | run |
| npc_porter_b | teen | run |
| npc_captain | elder | sit |
| npc_chef | adult | serve, dance |
| npc_postman | adult | run |
| npc_doctor | adult | sit |
| npc_painter | adult | dance |
| npc_guard | adult | salute |
| npc_skater | teen | skate, run, dance |
| npc_toddler | kid | run (waddle), fall |

New anim specs:

| anim | frames / fps / repeat | dirs |
|---|---|---|
| serve | 6 / 10 / once, `impactFrame` 3 | S, SE, E |
| bow | 6 / 10 / once | S, SE, E |
| salute | 6 / 10 / once | S, SE, E |
| fall | 6 / 12 / once | S, SE, E |
| skate | 8 / 10 / loop | 5 dirs |

`run`, `dance` and `sit` use the batch-1 specs.

## Special fields
- **`carryStyle`**: `"back"` for both porters, `"front"` for everyone else.
- **Porter `carryPoint`** is the bottom of the item stack on the carrier's shelf, behind = true for S/SE/E and false for NE/N.
  - porter_a: S [2,-46,T], SE [-18,-43,T], E [-28,-33,T], NE [-21,-23,F], N [-2,-18,F]
  - porter_b: S [2,-36,T], SE [-14,-34,T], E [-22,-26,T], NE [-17,-18,F], N [-2,-15,F]
- **Front carriers** use the batch-1 rule: the point is between the hands, behind = NE/N.
- **`carryPointFrames`** (extra, optional): the same point for each of the 8 carry_walk frames, so the stack can follow the walk bob.
- **`serve.impactPoint`** is the centre of the bag or dish on the hand-over frame. Clerks: S [0,-20], SE [15,-23], E [22,-30]. Chef: same values.
- **Sitters** (captain, doctor) have `seatOffset` [0,0], `seatHeightPx` 25 and `headTopSit` (-75 / -70).
- **`headTop`** is measured on the head and hat only, so the guard's spear and porter_b's frame arch don't push speech bubbles up. Values: toddler -59, chef -95, guard -89, painter -90, others -79 to -86.

## How the residents came out
- **Porters:** porter_a wears a wooden A-frame carrier (지게) with two branches as the shelf and straw shoulder ropes. porter_b has a red pack frame with a plank shelf; its arch peeks over the beanie. In carry_walk both lean forward with their hands on the straps.
- **Clerks and chef:** serve hands a paper grocery bag (clerks) or a plate of roast fish (chef) forward, then nods. The prop disappears after frame 3.
- **Guard:** always holds a 1.62 m spear upright in the left hand, salutes with the right, and slings the spear on his back during carry_walk.
- **Toddler:** about 0.86 m tall in a snowman onesuit with a tiny top hat on top.
- **Painter:** holds the palette and brush in idle and talk only.

## Previews (`frost-village/docs/previews/`)
- `vil2_lineup.png`
- `vil2_npc_<key>.png`, a contact sheet for each of the 12 keys; porter rows show an item stack drawn at `carryPoint`
- `vil2_expressions.png`, 5 residents × 17 expressions at close-up, game scale and 2× zoom
- GIFs: `vil2_npc_porter_a_carry_walk.gif` and `vil2_npc_porter_b_carry_walk.gif` (with logs or bread on the carrier), `clerk_a_serve`, `clerk_b_serve`, `chef_serve`, `skater_skate`, `toddler_run`, `toddler_fall`, plus `guard_salute`, `clerk_a_bow`, `painter_dance`, `captain_sit`, `postman_run` and `doctor_talk`

## Tools (new files only; no existing script was modified)
All in `frost-village/tools/blender/`: `vil2_anim.py`, `vil2_build.py`, `vil2_dress.py`, `vil2_render.py`, `vil2_pack.py` (accepts `--out`, `--prev`, `--colors`, `--dither`), `vil2_check.py`, `vil2_lookdev.py`. They import the batch-1 `vil_*`, `char_*`, `bl_common` and `pack_utils` without changing them.

To regenerate:
`/tmp/bvenv/bin/python tools/blender/vil2_render.py -- --chars all --samples 24 --portraits`, then `python3 tools/blender/vil2_pack.py`, then `python3 tools/blender/vil2_check.py`.

Raw frames are cached in `/tmp/fv_cache/villagers2`. A full render takes about 45 minutes on the shared 4-core machine.

## Batch 1 is unchanged
- All 238 files in characters, props, villagers, life_props, emotes, fx, ui, ground and audio have the same sha256 as at the start.
- All 29 existing tool scripts are byte-identical to the originals.
- I re-packed batch 1 from its cache into a scratch folder only. Its `manifest.json` and portraits came out identical, and all 20 atlases were reproduced byte-for-byte. For 13 of them the sheet first had to be padded by 4 px, because they were packed before the earlier `pack_utils` sheet-width fix.

## Deviations
- **Palette:** 96 colours per atlas (batch 1 used 192), needed to stay under 6 MB. Side by side at 3× zoom it looks the same as the uncompressed sheets.
- **Toddler role:** `role` is `"kid"` to stay within the contract's role list; the trait `"toddler"` marks it.
- **Once-only anims:** serve, bow, salute and fall play once (`repeat` 0) because the contract doesn't say; loop them by replaying.
- **Captain:** `wave` is already a core anim, so his only real extra is `sit`.

## Known issues
- **Porters in the current game code:** `Character.carryOffset` still balances the stack on the head unless `BALANCE.player.carryOnHead === false`. The game code needs to honour `carryStyle: "back"` for the stack to sit on the carrier.
- **Back carry from the front:** in S view a short stack sits behind the body and only shows once it rises above the head, which is how a real back carrier looks. In N view the stack is drawn over the porter's back.
- **Skate side view:** in E and SE the arms-out pose is mostly hidden by the camera angle; it reads clearly in S and N.