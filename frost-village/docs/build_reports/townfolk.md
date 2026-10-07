The townfolk paper-doll generator is finished: 83 parts on 6 body types, 10 job presets, 6 animations, and a payload of 7.79 MB (target 8 MB). `tf_check` passes with 0 errors and 0 warnings. Python and JS give identical draw lists (1000 tested, no mismatches), and 4000 people made by the JS generator had no rule conflicts and were all different. Two things the code agent must know first: the atlas JSON is a custom compact format, not Phaser JSON hash, so `load.atlas` will not work on it; and all sheets together use about 110 MB of GPU memory.

**Main fixes in this last pass**
- **Uniform hats:** job presets with a 100% hat chance only got their hat about half the time (the code read the wrong key). Fixed in both `tools/townfolk_compose.py` and `tools/townfolk_compose.js`. The random generator's per-age hat chances (0.55 / 0.42 / 0.5) now apply too; before, everyone got 0.5.
- **Matching colours:** a colour can now be `'=slot'`, meaning "same colour as that slot". The station attendant's cap now matches the uniform, and the barista's cap matches the apron.
- **Long hair:** `hair_long` and `hair_long_xl` covered the whole back like a pillar, and on children down to the feet. I shortened them to mid-back and waist length and re-rendered only those layers.
- **Colours tinting can't reach:** tints can only darken a layer, so white, cream and bright-blue gloves came out skin-coloured. I limited the glove and hair colour lists to colours that render correctly. Police and station attendants now have dark gloves or bare hands, and white hair shows as light grey with a shine.
- **Payload:** the atlas JSON was about 6 MB in Phaser format, so I switched to a compact format (about 25 bytes per frame). I also stopped packing body parts no generator path can reach for that age, and used 56 palette colours.

**Atlas keys** (11 sheets, 26,873 frames):
- `tf_head_0`, `tf_head_1`
- `tf_child_slim_0`, `tf_child_slim_1`
- `tf_adult_slim_0` to `tf_adult_slim_3`
- `tf_elder_slim_0` to `tf_elder_slim_2`

GPU memory per group: head 4.6 Mpx (about 18 MB), child 5.5 (22 MB), adult 10.8 (43 MB), elder 6.6 (26 MB).

**Frame names**
- Body: `<part>.<sub>@<base>/<anim>_<dir>_<i>`
- Head: `<part>.<sub>[~hat][.sheen]/<headPose>_<dir>`; also `head.<nose>`, `face.<faceSet>.<expr>`, `brow.<faceSet>.<shape>`
- Limbs: `arm_R`, `arm_L`, `hand_R`, `hand_L`

**Manifest** (`assets/townfolk/manifest.json` → `townfolk` block)
- Frame: 128×128, anchor `[0.5, 0.8125]` = pixel (64,104), head anchor `[0.5, 0.5625]`. `mirror`: SW/W/NW reuse SE/E/NE flipped. Faces show in S, SE, E.
- `anims`: idle 4 frames at 6 fps, walk and carry_walk 8 at 12 fps (5 directions); talk 8, wave 6, happy 6 at 10 fps (S, SE, E).
- `timeline[anim][dir][i]` = `{hp, face, brow, zfront}` (head pose, expression, brows, which limbs draw in front). `headPoses` lists the 5 poses: loco, soc, nod, up, tilt.
- `z` (draw order per layer type, sometimes per direction) and `limbs` (z and in-front z per limb).
- `bases`: per body type `age`, `build`, `shadow`, `carryPoint{dir: [dx, dy, behind]}`, `headOffset[anim][dir][i]`, `parts` (body parts packed for it), `label`. Round types add `render` (the slim type they reuse) and `scaleX`.
- `faces` (std, lash, kid, kidlash, elder, bold) and `noses` (dot, big, button).
- `parts[name]`: family, space (head or body), subs `{tint slot, z, follow, sheen}`, tags, hatfit, cls, ages, Korean/English label, dress, sleeves.
- Colour: `tintRef`, `tintModel`, `sheen`, `tintTable[slot][hex]` (precomputed Phaser tints), `palettes`.
- `generator`: baseWeights, byAge, presets, exclude, underDress, slotPalette.
- Also `frameNames`, `layerNames`, `frameAtlas` (layer → atlas key), `notes`.

**Parts**
- Hair (19): short, bob, ponytail, sidepart, spiky, buzz, curly, bob_long, long, long_xl, ponytail_long, twintails, twintails_long, bun, lowbun, braids, afro, bald, wavy.
- Hats (16): beanie, pompom, ushanka, flatcap, cap, bucket, beret, earflap, stocking, fedora, headband, police, station, postal, nurse, hardhat.
- Tops (14): puffer, parka, sweater, coat, hoodie, cardigan, bomber, dress, vest, duffle, uniform, labcoat, blazer, tunic.
- Bottoms (7): pants, snowpants, skirt, longskirt, pleated, overalls, tights.
- Shoes (4): boots, furboots, rubber, shoes.
- Accessories: glasses ×2, earmuffs, ribbon, hairclip, scarf, necklace, satchel, backpack, mailbag; facial hair ×4.
- Job details (9): police, station, stethoscope, tie, bow, lanyard, apron, salon apron, hi-vis.
- Presets: teacher, student, police, postal, doctor, nurse, hairdresser, barista, station, factory.

**How to use** (`tools/townfolk_compose.js`, ready to copy into `src/`)
1. Load `manifest.json` first.
2. In `preload()` call `townfolkPreload(this, man)`; in `create()` call `townfolkInstall(this, man)` (about 75 ms).
3. `const tf = new Townfolk(man.townfolk)`.
4. Make a person with `tf.randomPerson(mulberry32(seed))` or `tf.preset('police', rng)`. The person is a small serialisable object `{base, look, preset, parts, face, nose, colors}`, so it can go in a save file.
5. `new TownfolkSprite(scene, tf, person, x, y)`, then `.play(anim, dir)`, `.update(dtMs)`, `.setPosition(x, y)` (depth = y + z·0.0001), `.destroy()`.
6. For custom rendering, `tf.layers(person, anim, dir, i)` returns the draw list `[{z, layer, atlas, frame, tint, head, flip, sx, dx, dy}]`.

A frame missing from its atlas means "nothing to draw": hide that sprite. The Python reference (`tools/townfolk_compose.py`: `Townfolk`, `AtlasSource`, `CacheSource`, `generate`, `iter_tf_frames`) gives the same draw lists.

**Live sprites or bake?** Measured in headless Chromium with a software GPU on a heavily loaded CPU, so the ms numbers are inflated.

| Case | Result |
|---|---|
| 100 layered townsfolk | 1,522 sprites (15.2 each), 1 draw call per frame, about 0.1 texture binds per frame, 120 ms/frame |
| 100 single-sprite villagers | 72.5 ms/frame |
| 10 layered townsfolk | 62 ms/frame |
| JS update, 100 layered | 3.7 ms per tick (layers are only rebuilt when the frame changes) |
| Baking one person (160 frames, 2,456 layer draws) | 253 ms CPU, 1.7 s until the GPU finishes, 10 MB GPU per person (1 GB for 100) |
| All townfolk atlases loaded | 27.45 Mpx, about 110 MB GPU |

**Recommendation:** use live layered sprites on the shared atlases. All 11 sheets fit in Phaser's 16 texture slots, so everything draws in one call. Hide all layers of NPCs that are off screen, and on low-memory phones load the child and elder sheets only when such people appear. Baking each person costs 10 MB of GPU memory and a spawn stutter, so it doesn't scale to a village of 100.

**Rebuild steps**
1. `/tmp/bvenv/bin/python tools/blender/tf_render.py -- --mode head` (about 30 min under load)
2. `... --mode body --bases <base> [--reverse]` (about 27 min per base with two processes)
3. `... --mode full --combos proof|round` (reference renders for the proof sheets)
4. `python3 tools/blender/tf_pack.py --colors 56`
5. `python3 tools/blender/tf_check.py`
6. `python3 tools/blender/tf_proof.py`
7. `python3 tools/blender/tf_preview.py`
8. `node tools/test/townfolk_preview.mjs 100`

A head render limited with `--parts` now keeps the full layer list.

**Known issues**
- **Round bodies are stretched slim renders** (×1.18 child, ×1.22 adult, ×1.18 elder). Compared with real round renders the mean difference is 35/255, mostly silhouette shape (`townfolk_proof_round.png`).
- **Composite vs full render:** mean difference 14/255 with exact head offsets and 15.6 with the rounded ones the game uses (head offsets are whole pixels, ±0.5 px off). The differences are mostly edge seams and outline differences.
- **Outlines inside the body:** a thin ink outline shows where one layer overlaps another, for example an arm over the torso.
- **No shadows between parts:** each layer is rendered alone, so a hat doesn't shade the face and a scarf doesn't shade the coat.
- **Hat tops look flat in light colours:** the hat renders are blown out on the lit top.
- **Slight colour clamping:** 23 palette colours (near-white, strong yellow, orange, pink cloth) come out 2–12% darker than listed.
- **Hidden far hand:** 148 frames of the far hand in SE/E/NE are empty because the body hides it. This is correct, and the sprite simply skips them.
- **Hair is the same size for every age:** head-space parts are shared, so long hair is the same pixel length on children and adults.
- **Unused parts left out:** six body parts no generator path gives that age are not packed for it: child longskirt and necklace, adult tie and bow, elder tie and apron.
- **Software-GPU timings only:** the frame times above are not representative of a real phone.

**Previews** (all in `docs/previews/`)
- Crowd of 100: `townfolk_crowd.png` (+ `townfolk_crowd_2x.png`)
- Jobs: `townfolk_jobs.png`
- Part sheets: `townfolk_parts_hair.png`, `townfolk_parts_hat.png`, `townfolk_parts_top.png`, `townfolk_parts_bottom_shoes.png`, `townfolk_parts_acc.png`, `townfolk_parts_face.png`, `townfolk_parts_base.png`, `townfolk_parts_random.png`
- GIFs: `townfolk_walk.gif`, `townfolk_social.gif`, `townfolk_carry.gif`
- Proof: `townfolk_proof.png`, `townfolk_proof_round.png`
- Phaser screenshot: `townfolk_phaser.png`

Perf JSON: `/tmp/fv_review/townfolk_perf.json`

Files are in `/home/user/nurient/frost-village/`:
- `assets/townfolk/`: manifest.json, 11 tf_*.png, 11 tf_*.json
- tools/blender/tf_anim.py
- tools/blender/tf_presets.py
- tools/blender/tf_body.py
- tools/blender/tf_parts.py
- tools/blender/tf_render.py
- tools/blender/tf_layerfx.py
- tools/blender/tf_pack.py
- tools/blender/tf_check.py
- tools/blender/tf_proof.py
- tools/blender/tf_preview.py
- tools/townfolk_compose.py
- tools/townfolk_compose.js
- tools/test/townfolk_preview.mjs