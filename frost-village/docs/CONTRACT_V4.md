# Contract addendum v4 — worker outfits, worker variants, dog play, townsfolk generator, neighbour town

Extends CONTRACT.md / CONTRACT_VILLAGERS.md / CONTRACT_V3.md (PPU 64, `bl_common` camera/light, 5 render
dirs + mirroring, 128×128 character frames anchored at (64,104), manifest §2 format, paths relative to
`frost-village/assets/`). Design (Korean): `docs/기획서_v4_이웃마을.md`. New fragments the game will
load: `assets/workers/`, `assets/pets2/`, `assets/townfolk/`, `assets/town/`.

## H. Worker outfits (redesign) + worker variants
- Re-render the 5 worker characters in `assets/characters/` (keys `fisherman`, `lumberjack`, `farmer`,
  `miner`, `hunter`) with detailed, believable winter work gear (designer: the fisherman currently looks
  like a kindergarten raincoat). Same keys, frame names, anims, impactFrame/impactPoint, carryPoint
  semantics — only the look changes. Guidance:
  - fisherman: chunky cable-knit (aran) sweater, dark oilskin bib overalls, tall rubber boots, wool
    watch cap, knife on the belt, coiled rope/net on the shoulder in idle; rod in work.
  - lumberjack: buffalo plaid wool shirt, suspenders, leather gloves, work boots, knit cap, beard; axe.
  - farmer: quilted winter vest over a shirt, bib overalls, neckerchief, gloves, wellies, straw or felt hat; sickle.
  - miner: sooty canvas jacket, suspenders, knee pads, tool belt, helmet with lamp, soot smudges; pickaxe.
  - hunter: fur trapper hat, layered leather + fur cloak, quiver, snowshoe-like boots; bow.
- Worker variants in a NEW fragment `assets/workers/` (atlas per key `wkr_<key>`, same anim set as the
  base worker incl. `work` with tool, impactFrame/impactPoint, carryPoint): 2 extra per profession with
  different age/gender/body type: `fisherman_b` (old sailor, white beard), `fisherman_c` (young woman),
  `lumberjack_b`, `lumberjack_c`, `farmer_b`, `farmer_c`, `miner_b`, `miner_c`, `hunter_b`, `hunter_c`.
  Manifest `characters{}` entries add `profession` and `variantOf`.

## I. Dog play — `assets/pets2/`
- `pet_dog` full re-render (same look as batch 1) with extra anims: `eat` (6f, S/SE/E), `roll` (belly-up
  for petting, 6f loop, S/SE/E), `beg` (sit up, 6f loop, S/SE/E), `run_ball` (ball in mouth, 8f, 5 dirs),
  `catch` (jump catch, 6f once, S/SE/E), `trick` (spin, 8f once, S/SE/E). Same key `pet_dog` (this fragment
  overrides `assets/villagers`).
- Chief (`player` in `assets/characters`, re-rendered with the SAME look) extra anims: `pet` (crouch and
  pet, 6f loop, 5 dirs), `give` (hand out a treat, 6f once, 5 dirs, impactFrame), `throw` (throw a ball,
  8f once, 5 dirs, impactFrame + impactPoint). Keep every existing player anim identical.
- Items/props (72×72 like items): `item_treat` (bone biscuit), `item_ball` (red ball); UI icons (96 px,
  atlas `pets2_icons`): `ui_icon_whistle`, `ui_icon_treat`, `ui_icon_play`, `ui_icon_pet`, `ui_icon_heart_full`,
  `ui_icon_heart_empty`.

## J. Townsfolk generator — `assets/townfolk/`
Goal: 100+ visually distinct townsfolk at a sane payload. Preferred approach: **paper-doll layers**
rendered in Blender with holdouts so each layer is already occluded correctly per frame, drawn in a
fixed order per direction, with **runtime tints** (hair, clothes, skin) — or a better approach if
proven. Anim set for townsfolk: idle 4, walk 8, carry_walk 8 (5 dirs); talk 8, wave 6, happy 6
(S/SE/E). Parts (all tintable greyscale unless noted): body bases (child / adult / elder; slim / round),
skin (tint), faces (eyes/mouth sets), hair styles ×12 with length variants, hats ×10, tops ×10,
bottoms ×6, shoes, accessories (glasses, scarf, earmuffs, bag, necklace, ribbon), job outfits
(teacher, student uniform, police, postal worker, doctor, nurse, hairdresser, barista, station
attendant, factory worker). Manifest describes: parts → atlas/frames, layer order per dir, tint
palettes, valid combinations, and named presets. Provide a reference compositor (Python) that the game
logic mirrors, a 100-person random crowd preview, and a JS-ready description.

## K. Neighbour town buildings — `assets/town/` (Blender, prop pipeline conventions, baked shadows)
School (with yard), town hall, post office, clinic, police box, fire station, cafe, clothing store,
hair salon, flower shop, bookstore, toy shop, restaurant, supermarket, hardware store, carpenter
workshop, apartment_a/b, townhouse_a..d, park fountain, playground set, sled-train station + platform +
a short snow train (engine + 2 carriages, characters-style atlas with idle/move), streetlights, benches,
bus/sled stop sign, town gate sign. `staffPoints`, `doorPoint`, `customerPoints`, `inPoint` where useful.
