# beachfolk build report

The beachfolk fragment (CONTRACT_V7 §Y) is finished and has had a polish pass on the critic's review. All the test
scripts pass:

- **Checker (`bf_check.py`):** 0 errors. Its 38 warnings are all slight tint clamps (3–12 %) on pale colours.
- **Python/JS parity:** 1998 of 1998 draw lists are identical, and all 23,913 frames resolve to the right atlas.
  The JS generator made 3771 people; none of them is missing a frame or draws a hat that should be off.
- **Cross-compositor check:** the same beach people were merged through `tools/cityfolk_compose.js`. In 18,000
  checks it agrees on `canPlay` and `pickAnim` every time (0 mismatches). It still draws hats that beachfolk hides,
  because it does not implement `animHideHead` yet (see *Known issues*).
- **Phaser 3.90 test:** 42 beach people, 758 sprites, 2.4 draw calls per frame (the builder's scene measured 1; the cause was not investigated). It checked 170,330 layer frames and found 0 missing frames, 0 people unable to play and no page errors. Four ring wearers asked to swim or dig were placed with their `pickAnim` fallback.

The payload is **5.86 MB** (limit 7 MB). The atlases take **74.6 MiB** of GPU memory, under the ~75 MiB
aim; the builder's version took 82.4 MiB. The game merges this fragment after `assets/townfolk` and
`assets/townfolk2` using `mergeBeachfolkManifests()` in `tools/beachfolk_compose.js`.

## Polish pass: critic issues

| # | Issue (critic severity) | Status | What changed |
|---|---|---|---|
| 1 | Swimmers keep sun hats, caps and visors on in the water; from N/NE only a hat floats on the sea (high) | **Fixed** | New rule `animHideHead`. Hats come off for `swim` and `surf`; only swim caps stay. In `float` (S/SE/E only) the swim caps, the two sun hats, the visor, `hat_cap` and `hat_bucket` stay on, because a sun hat in a ring is cute. A hidden full hat no longer squashes the hair, so the hair draws its normal layer instead of `~hat`. Both compositors apply it. The checker fails if a person draws a hidden hat or squashed hair. Hat frames nobody can see in the `swim`/`lie` poses are no longer packed. |
| 2 | Lifeguard, housekeeper and ice-cream vendor read as a "kindergarten uniform" at 0.6x; the housekeeper looks like the townfolk nurse (high) | **Fixed** | See *Job outfits after the polish*. `docs/previews/beachfolk_lineup.png` shows them at 1.0x and 0.6x next to the townfolk nurse and teacher. |
| 3 | Following the lounger `lyingDirs` lays sunbathers reversed (medium) | **Fixed on our side** | `beachfolk.sunbathe.dirMeans: 'feet'`, plus the helper `sunbatheDirFor(spot, i)` in JS and `sunbathe_dir_for` in Python. It uses `lyingFeetDirs[i]` when present, otherwise the opposite of `lyingDirs[i]`. The beach polish has since added `lyingFeetDirs` to `sun_lounger`/`_x` (SW/SE). **`assets/beach_bld` `hotel_pool` still has only `lyingDirs`**; the helper handles it, but its owner should add `lyingFeetDirs`. The Phaser test now places its sunbathers through the helper. |
| 4 | Accessories pop on and off between anims; ring wearers lose the ring when they swim, and lifeguards swim without their tube (medium) | **Fixed** | `swim_ring_worn` now has frames in talk and happy. It **blocks** swim, surf, dig, both ball anims, sunbathe and sit, so `canPlay` is false there. `animFallback.swim = ['float']`, and `pickAnim` / `BeachfolkSprite.play` turn swim into float for ring wearers. The rescue tube now has frames in splash_play and both ball anims, and in `swim` it is **towed on a leash**, lying across the water behind the swimmer. Lifeguards always carry it. |
| 5 | Kid's float ring only 11–13 % visible (medium) | **Fixed** | Child ring scale went from 0.80 to 1.08. The ring is now 24–26 % of a floating child_slim and 33–35 % of a child_round. A new checker rule requires at least 20 % for every base and dir (adults 26–33 %, elders 31–36 %). |
| 6 | Stray toy-spade sliver at the top of dig frame 4 (medium) | **Fixed** | It was the spade of the tile above in the tiled render, dug into the sand. `bf_pack` now erases detached slivers at the top or bottom tile edge (4 frames: child S/SE, adult S, elder S). A new checker rule fails on any detached speck at a frame edge. |
| 7 | Held ball half the size of the beach prop; the throw only reaches chest height (medium) | **Fixed, release height limited** | The held ball has a fixed world size. Adults and elders hold a 0.19 m radius ball (12.2 px), which matches `beach_ball_bounce` (0.2 m) within 5 %; a checker rule enforces this. Children hold a 0.15 m ball (9.6 px). Palms sit on the ball's back sides so the short chibi arms (0.24 m) can reach it. The release now comes at chin level (centre z 0.82 m, top about 1.0 m). It cannot go higher: with 0.24 m arms, a hand over the head would have to cover the face. Previews draw the game's real `beach_ball` item. |
| 8 | `cityfolk_compose` disagrees on `canPlay` in 21 % of beach checks (medium) | **Fixed (data side)** | Drop accessories now list every anim in `anims` and their frameless anims in `noAnims`, so any compositor that honours `anims`/`noAnims` gets the same `canPlay`. The ring lost its `item` tag (cityfolk skips items). `animFallback` uses the cityfolk format. `partPlays()` / `part_plays()` are exported as the one canonical rule. `beachfolk_phaser.mjs --parity` now merges the beach people through `mergeTownfolkFragments` too and fails on any `canPlay`/`pickAnim` mismatch: 0 of 18,000. |
| 9 | 82 MiB; the claimed paging does not exist in the runtime; 4 MiB of `carry_walk` frames that dolls never load (medium) | **Fixed / documented** | 82.4 → 74.6 MiB; see *GPU memory and payload*. The `pageClasses` table and the exact `src/` touch points are in *How the game uses it*. `src/` and `tools/build/pack_pages.py` belong to the code agent, so they are documented here, not edited. |
| 10 | Sunbathe: `hat_bucket` and `hat_cap` lie as a big disc or ball; the laid wide hats are 2x the torso (low) | **Fixed** | Only the swim caps and the two wide sun hats stay on in `sunbathe`; the rest are put down (hidden). The laid-over-face hats are scaled to 0.8, about their opening, so they still rest on the face. |
| 11 | Float and swim bobs look static at phone zoom; kids and adults are the same size in the water (low) | **Bob fixed; size won't fix** | Float bob went from ±1.4 cm to ±3.2 cm (head moves 4 px over the cycle), with a stronger body sway and ring tilt. The swim head bob went from ±1.2 cm to ±2.6 cm, two bobs per stroke cycle. **Won't fix:** in the water only the head shows, and the chibi head is the same sprite for every age. Kids still read as kids by their floaties and rings. |
| – | The critic's text was cut off after issue 11 | – | Any later low issues were not visible to this pass. |

## Paths (under `frost-village/`)
- **Assets:** `assets/beachfolk/` holds `manifest.json` (block `beachfolk`) and 7 atlases in the compact `tfatlas` v1
  format of townfolk:
  - `bf_head_0`
  - `bf_child_slim_0`
  - `bf_adult_slim_0`, `_1`, `_2`
  - `bf_elder_slim_0`, `_1`
  - Together they are 19.55 Mpx.
- **Scripts:** all are new files; no `tf_*` or `tf2_*` file was edited.
  - `tools/blender/bf_anim.py`, `bf_parts.py`, `bf_presets.py`, `bf_render.py`, `bf_pack.py`, `bf_check.py`, `bf_preview.py`.
  - They import `tf_*` and `tf2_*`, and register their parts into the same registry in-process only.
- **Compositors:**
  - `tools/beachfolk_compose.py` is the Python reference.
  - `tools/beachfolk_compose.js` is the JS port, ready to copy into `src/`.
  - Both import the townfolk and townfolk2 compositors and leave them unchanged.
- **Test:** `tools/test/beachfolk_phaser.mjs` runs the parity and cross-compositor check
  (`--parity cases.json`) and the headless Phaser test.
- **Render cache:** `<scratch>/v7_beachfolk/cache`. Superseded layers are kept in `<scratch>/v7_beachfolk/polish/cache_old`.

## New anims (all 6 bases; round bases reuse the slim renders, as in townfolk)
| Anim | Frames, fps | Dirs | What it does |
|---|---|---|---|
| `swim` | 8, 10, loop | S SE E NE N | Head-up crawl with the arms windmilling and the head bobbing ±2.6 cm per stroke. Only the head, shoulders and arms show above a **baked waterline cut**. Lifeguards tow their rescue tube. |
| `float` | 4, 4, loop | S SE E | Bobbing ±3.2 cm in a swim ring, with the arms resting on it and the ring tilting with the swell. The ring is drawn automatically (`animParts`). |
| `sunbathe` | 4, 3, loop | SE NE | Lying on the back and breathing. Dir is where the **feet** point; use `sunbatheDirFor`. |
| `dig` | 6, 8, loop | S SE E | Kneeling and building a sandcastle with a toy spade (drawn automatically). |
| `ball_throw` | 6, 10, once | S SE E | Hold the big ball at the tummy, dip, swing up, release at chin height on `impactFrame` 3, follow through. |
| `ball_catch` | 6, 10, once | S SE E | Ready, catch on `impactFrame` 2, hug the ball, hop, settle. |
| `splash_play` | 6, 10, loop | S SE E | Shin-deep in the sea, sweeping water up. `impactFrame` 2 is the splash. |
| `surf` | 4, 6, loop | SE NE | Riding a surfboard. Dir is where the **board nose** points; the board is drawn automatically. |

SW, W and NW are mirrored, as in townfolk. `BeachfolkSprite.play()` first runs `pickAnim`, then snaps the dir to the
nearest one the anim has (`nearestDir`).

New head poses:
- `swim`: 5 dirs, cut at the waterline.
- `lie`: SE and NE, with face dirs SE only.

New face expressions are `laugh`, `relax` and `wow`.

### Waterline and anim points (for the game and the water fx)
All four water anims put the **sprite anchor on the water surface**. Everything below the surface is removed from every
layer, and the ink outline is erased along the cut. Manifest block `beachfolk.water`:

| Anim | Where the body sits | FX the game adds |
|---|---|---|
| `swim` | Head centre 0.42 m (±0.026) above the water, about 23 px at 1x | `fx_swim_ripple` centred on the anchor, radius ≈ 0.45 m (29×14 px; × `bodyK` for children) |
| `float` | Ring centre 0.03 m (±0.032) above the water | Ripple with radius ≈ ring radius + 0.1 m |
| `splash_play` | Feet 0.14 m under the water | `fx_splash_small` at anchor + `bases[b].splashPoint[dir]` on `impactFrame`, plus the ripple |
| `surf` | Board deck 0.045 m above the water | `fx_wake_v2` behind the tail |

No anim in the water draws a ground shadow.

Other anims:
- **`sunbathe`:** the anchor sits under the hips on the lying surface, such as a towel decal or a lounger's lying point.
  - Dir comes from `sunbatheDirFor(spot, i)`: `lyingFeetDirs[i]`, or else the opposite of `lyingDirs[i]`.
  - Instead of the round shadow, draw the ellipse `bases[b].lieShadow[dir]`. For mirrored dirs, negate dx and the angle.
- **`dig`:** `bases[b].digPoint[dir]` is where the sandcastle stands.
- **Ball anims:** `bases[b].ballPoint[anim][dir][i]` = `[dx, dy, front, radiusPx]`; null means the hands are empty.
  - `radiusPx` is 12.2 for adults and elders and 9.6 for children.
  - Spawn the flying ball on `ball_throw` frame 3; it arrives on `ball_catch` frame 2. Lerp its radius from the
    thrower's to the catcher's.
  - `front` means the ball is drawn over the person.
- **`bodyK`:** the per-base body scale (child 0.70, adult 1.02).

## New parts (36 packed, all tintable through the townfolk tint model)

**Swimwear and beach wear (body):**
- `swimsuit_one`, `swim_trunks`, `rash_guard`, `wetsuit` (child and adult)
- `bare_skin` and `bare_arms`: skin layers under swimwear
- `no_top`
- `flip_flops`; bare feet means no shoes
- `towel_shoulder`, `swim_ring_worn`, `arm_floaties` (kids)
- `aloha_shirt`, `beach_shorts`, `tourist_camera`

**Job outfits (body):**
- Lifeguard: `lifeguard_top` (waist-length red tank with a white cross and yellow piping), `whistle`, `rescue_tube`
  (slung on the back, towed in swim)
- Hotel:
  - `bellhop_jacket` (gold frogging)
  - `hotel_vest` (waistcoat over a shirt; the receptionist)
  - `doorman_coat` (braid and buttons)
  - `housekeeper_dress` (white collar, apron and bow)
  - **`cleaning_caddy`** (new; carried in the left hand): a tinted tote with a spray bottle, rolled cloths and a scrub brush
- Ice-cream vendor: `vendor_shirt` (candy stripes, apron, bow tie)
- Beach bar: `bar_apron` over an aloha shirt
- Anim props: `surfboard` and `toy_spade`

**Head:**
- Hats: `swim_cap`, `swim_cap_flower`, `straw_hat`, `sun_hat_wide`, `sun_visor`
- Glasses and mask: `sunglasses`, `snorkel_mask`
- Job hats:
  - `bellhop_cap` (pillbox)
  - `doorman_hat` (top hat)
  - `paper_cap`: now a low garrison (soda-jerk) cap with coloured piping and a little embroidered ice-cream cone;
    it is class `full`
- `kerchief` is **retired**. It is still defined in `bf_parts.py`, but no preset uses it and it is not packed
  (`bf_presets.RETIRED`).

**Colour slots:** `swim`, `swim2`, `ring`, `ring2`, `float`, `board`, `board2`, `toy`. They are rendered near-white,
and `generate3` always fills them.

### Job outfits after the polish
| Job | Before (critic) | Now |
|---|---|---|
| Lifeguard | Yellow dome cap (a Korean kindergarten cap), hip-long red tank over red trunks ("a girl in a red dress") | **Hat (75 %):** straw lifeguard hat with a red, white or navy band (3), red visor (3) or red cap (1); never yellow. **Body:** the tank is cut at the waist over **navy (2/3) or yellow trunks**; sunglasses 80 %; whistle and rescue tube always. |
| Housekeeper | Pastel mint/sky/pink smock and a white dotted kerchief (a shower cap); at 0.6x the townfolk nurse | **Dress:** navy, charcoal, wine or pine, with a white collar, apron and bow. **Head:** a dark headband (townfolk `hat_headband`, 75 %). **Prop:** a bright cleaning caddy in the left hand (85 %); it is put down on the linen cart while she pushes. |
| Ice-cream vendor | Lilac/pale-blue apron, pastel stripes, teardrop paper cone | **Shirt:** bold red, teal or blue candy stripes on white. **Apron:** saturated navy, red, teal or dark red. **Trousers:** classic white (or navy). **Hat:** a white garrison cap piped in the stripe colour. |

## Presets (`generator.presets`)
| Preset | Notes |
|---|---|
| `swimmer` | Swimsuit or rash guard, trunks, caps, snorkel. Floaties (45 %) and a ring (28 %) are add-ons. |
| `sunbather` | Sun hats and sunglasses; the hats come off to swim. |
| `family_beach` | `bf.beachFamily(rng)` gives 1–2 adults and 1–3 kids, 75 % of them in matching swimwear colours. |
| `lifeguard` | See the table above. |
| `bellhop` | idle, walk, talk, wave, push (luggage trolley) |
| `receptionist` | idle, walk, talk, wave, clap |
| `doorman` | idle, walk, talk, wave, clap |
| `housekeeper` | idle, walk, talk, wave, push |
| `icecream_vendor` | Adults and elders; idle, walk, talk, wave, push (cart) |
| `beach_bar_staff` | Aloha shirt and apron; idle, walk, talk, wave |
| `surfer` | Wetsuit plus board |
| `beach_tourist` | Aloha shirt, sun hat, camera |

Hotel and shop staff no longer have `happy` frames: they don't jump for joy on duty, and that saved about 2.5 MiB (estimated from the per-part frame areas). A staff
member asked for `happy` falls back to idle through `pickAnim`.

Each preset lists the `anims` it is made for. Every generated person can play them all, except anims blocked by an
optional add-on (the swim ring): those resolve through `pickAnim`, and a water anim always stays a water anim. The
checker tests 1200 people. The tourist preset is keyed `beach_tourist`, because the harbour set already defines a
winter `tourist`.

## Merge rules (manifest `beachfolk.merge`; implemented in both compositors)
1. **Merge order:** `townfolk` + `townfolk2` (`mergeTownfolk`), then `beachfolk` (`mergeBeachfolk`). Queue all three
   atlas lists. `cityfolk_compose.mergeTownfolkFragments` merges it generically.
2. **No redefinitions:** the fragment never redefines an existing key in `anims`, `timeline`, `headPoses`, `parts`,
   `z`, `tintRef`, `palettes`, `frameAtlas` or `presets`. The merge throws if it would.
3. **New frames for existing layers:** `frameAtlasExt` routes them. `frameAtlasAnim[anim]` covers v4 limbs in the new
   anims, and `frameAtlasPose[pose]` covers v4 head layers in `swim` and `lie`.
4. **Faces:** `faceExprs` is a union per head pose. `faceDirsByPose` is new (`lie`: SE only).
5. **Bases:** `headOffset` gets the new anims and `parts` is a union. `ballPoint`, `digPoint`, `splashPoint`,
   `lieShadow` and `bodyK` are new keys.
6. **Generator:**
   - `slotS` and `tintTable` are unions.
   - `beachSlots` is new.
   - `animParts` is new: `float` → `swim_ring_worn`, `surf` → `surfboard`, `dig` → `toy_spade`.
7. **Part anims (canonical rule `partPlays`):**
   - `parts[p].anims` lists the anims a beach part lets its wearer **play**; a part without it is a v4/v5 part.
   - `canPlay(person, anim)` is true when every body part lists the anim.
   - `parts[p].noAnims` lists the anims where nothing of the part is drawn.
   - Drop accessories list **every** anim in `anims` and the ones they have no frames for in `noAnims`; they are simply
     put down there. They are the towel, flip-flops, camera, rescue tube, arm floaties and cleaning caddy.
   - The swim ring is not a drop part: it blocks the anims above.
8. **`animFallback`** (new, cityfolk format): `swim → [float]`, `surf → [swim, float]`.
   `pickAnim(person, anim)` gives the anim if playable, else the first playable fallback, else idle/walk.
9. **`animHideHead`** (new): `{anim: [hats hidden there]}` for `swim`, `surf`, `float` and `sunbathe`.
   - A hidden full hat also stops squashing the hair.
   - The beachfolk hats repeat it in their own `noAnims`.
10. **Small extras:** `timeline[...].hd` (optional head-frame dir), `followDz` (optional sub z offset over a limb),
    and `pageClasses` (see *GPU memory and payload*).

## How the game uses it
```js
import { mergeBeachfolkManifests, Beachfolk, BeachfolkSprite, sunbatheDirFor } from './beachfolk_compose.js';
import { townfolkPreload, townfolkInstall, mulberry32 } from './townfolk_compose.js';
const man = mergeBeachfolkManifests(manTownfolk, manTownfolk2, manBeachfolk);
// preload: townfolkPreload(scene, man, 'assets/');   create: townfolkInstall(scene, man);
const bf = new Beachfolk(man.townfolk);
const p = bf.preset('swimmer', rng);                  // or bf.beachFamily(rng) -> [people]
const s = new BeachfolkSprite(scene, bf, p, x, y);
s.play('swim', 'SW');                                  // ring wearers bob in the ring: s.anim === 'float'
// sunbathers on a lounger / towel / pool spot:
s.play('sunbathe', sunbatheDirFor(beachManifest.sprites.sun_lounger, 0));
```
- **Choosing activities:** call `bf.pickAnim(p, anim)` or check `bf.canPlay` first. The fallback's last resort is a
  land anim (idle/walk), so never put someone in the water whose picked anim is not a water anim.
- **Placing people in water:** set the sprite position to the water-surface point. Draw `fx_swim_ripple` one depth
  below the person.
- **Ball:** use `bf.ballPoint(p, anim, dir, i)` for the held ball. In flight, lerp the radius between thrower and catcher.
- **Hotel and shop staff** play land anims only: `push` for the luggage trolley, linen cart or ice-cream cart. Like the
  v4 dolls, they carry things on the head (no `carry_walk` frames).

**Changes `src/` needs.** These files belong to the code agent, so they are listed here, not edited:
1. **`src/core/Townfolk.js` `AGE_SHEETS`:** today `/^tf_child/` etc. It must also match the beachfolk sheets
   (`/^(tf|tf2|bf)_child/`) and `bf_head_0`.
2. **Townfolk2 first:** `TOWNFOLK2` must become `true` before beachfolk. Beach presets use townfolk2 anims (`sit`,
   `push`, `clap`) and the townfolk2 override frames of `hat_cap` / `hat_headband`, which are in `NO_HATS` today.
3. **Port the beachfolk layer rules into `layersInto`:**
   - `animParts`
   - `parts[].anims` and `noAnims` (`partPlays`)
   - `animHideHead`, including hair un-squash
   - timeline `hd`, `faceDirsByPose` and `followDz`
   - `pickAnim` / `animFallback`
4. **`tools/build/pack_pages.py`:** `TF_FRAGS = ['townfolk']` must add `townfolk2` and `beachfolk`, with a third page
   class taken from `beachfolk.pageClasses`, so a town never loads the beach pages:
   - `@loco`: idle, walk
   - `@soc`: talk, wave, happy, sad, clap, sit, push
   - `@beach`: dig, the ball anims, sunbathe, the water anims, and the `swim`/`lie` head poses
5. **`tools/cityfolk_compose.js`:** implement `animHideHead` with the hair un-squash, exactly as
   `beachfolk_compose.js` `visibleParts` does. Today it still draws the hidden `hat_cap`/`hat_bucket` in swim, and
   squashed hair under hats that are off: 373 of 18,000 draw lists differ, while `canPlay` and `pickAnim` agree.

## GPU memory and payload
- **Payload:** 5.86 MB. Bodies use 80 colours with dither 0.35, and the head sheet uses 96 colours with dither
  0.3; the finer palette keeps tinted bare skin from speckling.
- **GPU:** 74.6 MiB (19.55 Mpx) across 7 textures; the builder's was 82.4 MiB. This pass removed:
  - all `carry_walk` frames (about −4 MiB, the critic's measure). Dolls carry on the head, and `pack_pages` drops
    `carry_walk` anyway.
  - hat frames that `animHideHead` makes invisible in the `swim`/`lie` poses (head sheet 2048×1364 → 2048×1120).
  - `happy` for the hotel and shop uniforms (about −2.5 MiB).
  - bare legs on ice-cream vendors, who now wear trousers, so `bare_skin`/`beach_shorts` need no `push`.
  - `sit` for ring wearers, and the retired kerchief.
  - shelf packing: a skyline packer (`bf_pack.skyline_pack`) gives about 3 % less sheet area.
- **Added in the same pass:** the cleaning caddy, the rescue tube in more anims, the bigger kid ring and ring frames in
  talk/happy.
- **Measured steps:**
  - 76.8 MiB after the carry_walk, hidden-hat, staff-happy and skyline changes.
  - 74.9 MiB after the vendor trousers, ring-sit and kerchief cuts.
  - 74.6 MiB with the shorter lifeguard tank.
- **By page class** (packed rects, without sheet slack): loco (idle and walk) 17.3 MiB, social 22.2, beach (dig, ball, sunbathe) 8.4, water 8.3, head frames of the `swim`/`lie` poses 5.6, other head frames 2.1.
- **Total:** together with townfolk and townfolk2, about 250 MiB, so load beachfolk only near the beach. With the
  `@beach` page class above, a beach that has only walkers needs about the loco share.

## Previews (`docs/previews/`)
- **`beachfolk_crowd.png` (+ `_2x`):** about 60 random beach people on the beach sand with a strip of sea. Swimmers have
  their hats off; ring wearers bob in their rings; sun hats stay on in rings; the swim gif shows lifeguards towing tubes.
- **`beachfolk_jobs.png`:** the 12 presets × 3 seeds, as idle S, walk SE, idle N and a signature anim. The
  signature anim goes through `pickAnim`; the lifeguard's is swim with the towed tube.
- **`beachfolk_lineup.png` (new):** job outfits at phone zoom 1.0 and 0.6, next to the townfolk nurse and teacher.
- **`beachfolk_parts.png`:** the wardrobe on several bases.
- **GIFs:**
  - `beachfolk_swim.gif`, `_float.gif`, `_sunbathe.gif`, `_dig.gif`, `_splash.gif`, `_surf.gif`
  - `_ball.gif`: a throw and catch timed on the impact frames, with the game's `beach_ball` item at `radiusPx`.
- **`beachfolk_proof.png`:** full Blender renders next to the layered composites. The full renders also take hats off
  per anim. The mean difference is 18.5/255 over 73 frames (builder: 19.5), mostly the ink outline that only the composites carry.
- **`beachfolk_phaser.png`:** the headless Phaser scene.

## Known issues
- **`cityfolk_compose` and hats:** it does not implement `animHideHead` yet; see *How the game uses it*, change 5.
  `canPlay` and `pickAnim` already agree.
- **`hotel_pool` (`assets/beach_bld`)** has only `lyingDirs`. `sunbatheDirFor` handles it; its owner should add
  `lyingFeetDirs` like the beach loungers.
- **Ball release height:** the ball is released at chin height, not over the head. The chibi arms cannot lift a
  0.38 m ball higher without covering the face.
- **Kids and adults look the same size while swimming:** only the shared chibi head shows in the water.
- **Ring wearers** cannot sit, dig, play ball or sunbathe; `pickAnim` makes them idle. The game can put the ring down
  as a beach prop (`swim_ring_*` in `assets/beach`) if it wants them to do those.
- **Tint clamps:** 38 pale colours draw 3–12 % darker than listed.
- **Dithering:** faint dithering shows on lying faces at 3x zoom; it is not visible at 1x.
- **Round bodies** are stretched slim renders, as in townfolk.

## Rebuild
The render steps are resumable: only missing layer PNGs render. To redo a part, delete or move its PNGs first.
1. `/tmp/bvenv/bin/python tools/blender/bf_render.py -- --mode head --frames all [--parts a,b]`.
   - The head scene is spread over linked scene copies (`--chunk 24`).
2. `/tmp/bvenv/bin/python tools/blender/bf_render.py -- --mode body --bases <base> --set new|old [--anims ..] [--parts ..]`
   for child_slim, adult_slim and elder_slim.
3. `/tmp/bvenv/bin/python tools/blender/bf_render.py -- --mode meta --bases all`
   - This gives the head offsets, ball, dig and splash points, the lie shadow, zfront and the ball-grip IK check.
4. `python3 tools/blender/bf_pack.py`. It uses `--packer skyline` by default; `shelf` is the townfolk packer.
5. `python3 tools/blender/bf_check.py --dump <scratch>/cases.json`
6. `node tools/test/beachfolk_phaser.mjs --parity <scratch>/cases.json`, then run it without `--parity` for the
   browser test.
7. `python3 tools/blender/bf_preview.py all`. It renders crowd, jobs, parts, lineup, gifs and proof. The proof needs
   the full renders: `bf_render.py -- --mode full --combos look|jobs --out <scratch>/v7_beachfolk/proof`.
