# 05 — Assets & formats (port spec: Phaser 3.90 → Unity 6.3 LTS, 2D URP, C# 9)

Source: `/home/user/nurient/frost-village` at commit `3d2ac07` (game `v4.3.0-a3.2`, `src/data/version.js`).
Everything below was measured on the files, not copied from docs. Numbers are exact unless marked "≈".
Phaser line references are `file:line` or `file:from-to` (relative to `frost-village/`).

---

## 0. Decisions in one screen

| # | Decision | Why (short) |
|---|---|---|
| D1 | Keep the art pipeline's files **as they are** (PNG + Phaser JSON-hash + per-folder `manifest.json`), copied 1:1 into `Assets/FrostVillage/Art/<fragment>/…` (same relative paths as `frost-village/assets/…`). | Manifests reference files by `"<frag>/<name>.png"`; keeping paths means no rewriting and the Blender/procedural tools can keep producing art for both engines. |
| D2 | **Import approach (a)**: an `AssetPostprocessor` fixes the texture import options; a runtime `FvAssets` registry reads the JSON (as `TextAsset`) and creates `Sprite`s lazily with `Sprite.Create`, pivot computed from the trim offsets (§5). | 1:1 port of `src/core/Assets.js`; handles the 491 character frames + 105 prop frames whose anchor lies **outside** the trimmed rect (pivot outside 0..1); handles the custom `tfatlas` format without editor tooling; zero metadata to keep in sync. Option (b) (editor slicer) is the later upgrade path, same pivot formula (§15). |
| D3 | Texture import: **no mipmaps, no NPOT scaling, Clamp (Repeat for ground patterns), Bilinear, sRGB, alphaIsTransparency, maxTextureSize = nextPow2(max(w,h))** (never below the file's own size: ≤ 2048 for every shipped file except one 3164-px packed page that is not in the slice). Android: ASTC (4×4 for characters/UI/FX, 6×6 for buildings/ground); Standalone: BC7. | Matches Phaser (WebGL1, no mips, bilinear `antialias:true`), and avoids Unity's default 2048 clamp / NPOT rescale silently breaking frame rects. |
| D4 | **Pixels per unit = 64** for every sprite (= art PPU, `src/core/Iso.js:8`, CONTRACT §1). World mapping used by every other spec: `unity = (phaserX / 64, −phaserY / 64)`. | One constant; px offsets in manifests convert with `(dx/64, −dy/64)`. |
| D5 | *(Revision note: 00 §5.3 adds Tier A+ (all villager looks) and Tier B+ (late-building exteriors, M1b); assets load with `Village.unity`, not Boot.)* **Slice loads everything it needs at boot** (Tier A + Tier B, §16: 66 textures, ≈ 158 MiB as RGBA32, ≈ 40 MiB as ASTC 4×4, ≈ 30 MiB with ASTC 6×6 for buildings/props/ground). No packed pages, no eviction, no lazy fragments in the slice. | Phaser's lazy/page/residency machinery exists for browser memory; with ASTC the whole village fits easily. Port it later behind the same registry API (§13). |
| D6 | Use the **raw atlases** (`villagers/vil_npc_*.png` etc.), **not** `assets/_packed/*` pages. | Same frame names, all ≤ 2048 px; the only >2048 image in the project is a packed page (`_packed/town_civic.rest.png` 576×3164). |
| D7 | Font: **TextMeshPro SDF from Pretendard** (OFL; 11,172 Hangul). `tools/fonts/Pretendard-ExtraBold.ttf` is in the repo; get Bold/Black from npm `pretendard@1.3.9`. ❄ (U+2744) and 🛷 (U+1F6F7) are not in Pretendard → sprite or replace. | The Phaser game ships **no font file**: it asks the OS for `Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif` (`src/data/strings.js:1428`). |
| D8 | Audio: import the **`.ogg`** of each key (Vorbis 44.1 kHz, sample-exact loop length); ignore the `.mp3` twin and `mp3StartPad`. | OGG files are already exactly `loopSamples` long (e.g. `bgm_village.ogg` 76.798549 s = 3,386,816 / 44,100). |
| D9 | The 9 `.webp` files are title-screen bakes (out of slice). Unity cannot import WebP → convert to PNG offline (§12). | — |

---

## 1. Scope

| Topic | Slice (go/no-go) | Later |
|---|---|---|
| Manifest merge (22 boot fragments, order, "later wins") | **yes** | late fragments merge on demand |
| Phaser JSON-hash atlases → Sprites with pivots | **yes** | — |
| Spritesheets (FX), sheet anims | **yes** (6 sheets) | all |
| Character anims (`{anim}_{dir}_{i}`, mirror, fallback chain, `extends`) | **yes** (player + 3 customers + 3 residents) | all |
| Sprite anims (`station_grill` work loop, `lantern_string` twinkle) | **yes** | all |
| 9-slice records | **yes** (coin bar, panel, buttons) | ui3/ui5 panels |
| Placeholders for missing art (one warning per key) | **yes** (needed: a v4.x save references art the slice may not import) | — |
| Generated textures `fv_shadow`, `fv_white`, `fv_blank` | **yes** | — |
| Audio defs, groups, volumes, loops | **yes** (≈ 20 keys) | voice (눈꽃말), audio sprites |
| Korean font (TMP) | **yes** | localisation (`en`) |
| `tfatlas` (townsfolk / office staff paper dolls) | parser written + unit test only | runtime dolls (CONTRACT_V4 J) |
| `_packed/index.json` pages (core/social split) | **no** (use raw atlases) | maybe never (ASTC makes it unnecessary) |
| Lazy after-title loading, gates, retries, `Residency` budget/eviction, `Perf.texScale` | **no** (all at boot) | Addressables groups (§13.4) |
| Living water data textures (`water/*`) | **no** (classic sea: `water_sea` tile + `water_shallow` + `shore_foam`) | yes |
| Title (`title/`, `title_bake/` incl. 9 webp) | **no** (plain "새 게임 / 이어하기" menu) | yes |

Not wired into the shipped game, ignore: `src/story, city, geumbang, missions, vehicles, harbor, beach, bank` and asset folders only they use (`beach*`, `harbor`, `ships`, `geumbang*`, `cityfolk`, `fx_city`, `townfolk2`, `beachfolk`, `audio6`, `audio8`, `water` sheets beyond `USED_ONLY`, …).

---

## 2. How the Phaser game organises assets

### 2.1 Fragments

Every asset folder `assets/<frag>/` has one `manifest.json` (a "fragment"). The game finds every picture/sound **only** through manifests (`src/core/Assets.js:1-6`, CONTRACT §2). Missing fragment or key → placeholder + one `console.warn`, never a crash.

**Boot fragments, in merge order** (`Assets.js:11` `FRAGMENTS`):

```
characters, props, fx, ui, ground, audio, villagers, life_props, emotes, villagers2, villagers3,
buildings, ui2, audio2, workers, pets2, water, audio5, ui7, market, deck43, bakery43
```

**Late fragments** (manifest fetched only when a system asks, `Assets.js:55` `LATE_FRAGMENTS`):

```
town, townfolk, roads, audio3, ui3, life2, voice, audio4, title, title_bake, civic, logistics,
vehicles, chief_fx, ui5, train2, office, officefolk, chief2, audio7
```

### 2.2 Load classes of a file (Phaser rules — documented for "later"; slice loads Tier A+B at boot)

| Class | Rule (exact) | Source |
|---|---|---|
| boot | file of a boot fragment that is not lazy and not unused | `Assets.js:478-509` `queueAssets` |
| after-title lazy | `fragOf[key] ∈ LAZY_FRAGMENTS = [villagers, villagers2, villagers3, buildings, workers, pets2]` and key ∉ `EAGER_KEYS = {bld_items, pets2_icons, pets2_items}`; **or** key matches `LAZY_KEY = /^fx_(build_dust|build_done|wake|wake_ring|fire_big|wave_crash|splash_small|splash_big|swim_ripple|wake_v2(_[a-z]+)?|sparkle_water|shore_wave_[xy])$/`; **or** `WATER_DATA = /^water_(waves_a|waves_b|foam|lut|shore_ramp|field_village)$/`; **or** `MARKET_LATE = /^market_s[2-9]$/`; **or** `BAKERY_LATE = /^bakery43$/`; **or** fragment merged late; **or** page managed by a Residency area | `Assets.js:24-39, 280` |
| unused (never loaded) | `bgm_spring`; character atlases `vil_*/wkr_*/char_*` no character/sprite references (e.g. `villagers/vil_pet_dog` replaced by `pets2_pet_dog`); a key of a fragment in `USED_ONLY` not in its list; `amb_sea` when `amb_sea_waves` exists; `ui_title_bg`, `portrait_player_512` | `Assets.js:42, 58-60, 187-192, 644-652` |
| deferred audio | `/^(bgm_village|amb_|sfx_lute)/` or `V3_SFX = /^sfx_(hammer|build_done|saw_short|boat_horn|row|tower_fire|fog_clear)/` → loaded by the Game scene after the title | `Assets.js:62, 640` |
| on-demand page | packed page with `cls ∈ {social, soc}` → loaded when a character plays such an anim | `Assets.js:214-249` |

`USED_ONLY` (`Assets.js:42`, exact):

```json
{ "civic": ["civ_bank"], "logistics": ["lgx_center_a","lgx_center_b","lgx_center_c","lgx_center_d","lgx_items","lgx_forklift"],
  "vehicles": ["veh_cargo_sleigh"], "audio5": ["amb_sea_waves"], "audio4": ["sfx_ship_horn_big","sfx_seagull_1"],
  "water": ["water_waves_a","water_waves_b","water_foam","water_lut","water_shore_ramp","water_field_village",
            "fx_splash_small","fx_wake_v2","fx_wake_v2_s","fx_wake_v2_e","fx_wake_v2_ne","fx_wake_v2_n","fx_wave_crash"] }
```

### 2.3 Inventory facts (measured)

| Fact | Value |
|---|---|
| PNG files under `assets/` | 552 (348 palette `P`, 188 `RGBA`, 13 `RGB`, 3 `LA`); 1,300 files, 196 MB in all |
| Atlas JSON files in shipped fragments | 164 Phaser **JSON-hash** + 15 **tfatlas** (townfolk 11, officefolk 4) |
| Frames in the 164 JSON-hash atlases | 16,879 (16,744 trimmed, 135 untrimmed) |
| `rotated: true` frames | **0** |
| `pivot` field in any frame | **0** (so Phaser `customPivot` never applies) |
| JSON-array (`"frames": [...]`) or multi-atlas (`"textures"`) files | **0** |
| `meta.size` ≠ real PNG size | 0 |
| Packer rules (`tools/pack_utils.py:34-72`) | trim box keeps **1 px** transparent border; **2 px** gap between frames; sheet width ≤ 2048; width rounded up to a multiple of 4 (capped at 2048) |
| Images wider/taller than 2048 px | **1**: `_packed/town_civic.rest.png` 576×3164 (packed page, not used by the slice) |
| Images whose width or height is not a multiple of 4 | 8: `ui/ui_bubble_body.png` 96×82, `emotes/ui_chat_bubble.png` 96×78, `buildings/bld_work.png` 774×2032, `water/field_village.png` 472×1017, `ui7/ui7.png` 458×132, `ui3/ui_progress_bg.png` 64×30, `ui3/ui_progress_fill.png` 64×30, `ui5/ui5_icons.png` 490×798 |
| File-name case collisions / non-ASCII names / paths > 80 chars | none (safe on Windows) |
| WebP files | 9 (+ 9 identical copies in `src/title/bake/`), all title bakes (§12) |

---

## 3. Manifest format (data shapes)

All paths are relative to `assets/`. Every field is optional. Unknown fields **must be kept** (systems read many per-sprite extras). Use Newtonsoft Json.NET (`com.unity.nuget.newtonsoft-json`), not `JsonUtility` (dictionaries, optional fields).

```text
Manifest {
  version: int
  atlases:      [ AtlasDef ]
  images:       [ { key, png, anchor?: [ax, ay] } ]
  spritesheets: [ SheetDef ]
  characters:   { key: CharDef }
  sprites:      { key: SpriteDef }
  nineSlice:    { key: NineDef }
  audio:        { key: AudioDef }
  audioGroups:  { groupKey: [audioKey, ...] }
  audioSprite?: { file, keys: { audioKey: [startSec, durSec] }, dur, gap, ch, kbps }   // audio7 only (late)
  layouts?:     { ... }          // life_props: merged into Assets.layouts (Object.assign)
  professions?: { prof: [charKey, ...] }   // workers: hire order of looks
  conventions?, notes?, generator?        // documentation only
  (+ fragment-specific blocks: water.palettes/shoreRamps/fields, townfolk.townfolk, logistics.*, ... keep raw)
}
AtlasDef  { key, png, json, format?: "tfatlas", data?: <inline frame list> }
SheetDef  { key, png, frameWidth, frameHeight, frameCount, fps, repeat, anchor: [ax, ay], blend: "NORMAL", drawScale?: 2 }
SpriteDef { atlas+frame | image, anchor: [ax, ay] (default [0.5,0.5]), kind?, footprint?: [w,h] px, frameSize?: [w,h],
            topPx?, footprintM?, stackStep? (items), carryScale? (items), icon?, anims?: { name: { frames: [frameName...], fps (default 8), repeat (default -1) } },
            fxPoints?: { name: [dx,dy] }, staffPoints?, customerPoints?, signQuad?, overlay?, ... }
CharDef   { atlas, frameSize: [128,128], anchor: [0.5,0.8125], dirs: [S,SE,E,NE,N], mirror: {SW:SE, W:E, NW:NE},
            frameName: "{anim}_{dir}_{i}", anims: { name: AnimDef }, carryPoint: { dir: [dx,dy,behind] },
            shadow: [w,h], headTop, kind: "human"|"animal"|"villager"|..., portrait?, petPoint?, extends?: baseCharKey, name?: {ko,en} }
AnimDef   { frames: int, fps (default 10), repeat (default -1), repeatDelay? (ms), frameHold?: [ms per frame index],
            impactFrame?, impactPoint?: { dir: [dx,dy] }, dirs?: [renderDirs], atlas?: <own atlas>, frameName?: <own pattern>, tipPoints? }
NineDef   { image | atlas+frame, left, right, top, bottom, contentInset?: [l,t,r,b], minHeight? }
AudioDef  { files: ["audio/x.ogg","audio/x.mp3"], volume (default 0.7), loop, kind: "music"|"ambience"|"sfx", duration,
            loopSamples?, mp3StartPad?, rotation?, cues?, pitch?, inSprite?: fragName, swellPeriod?, swellPhase? ... }
```

**Every `*Point(s)`, `footprint`, `topPx`, `signQuad` value is in px relative to the sprite anchor of the unscaled sprite, screen axes (y down).** Unity local offset = `(dx / 64, −dy / 64)`.

**Data-only sprite records** exist (no `atlas`, no `image`): `market_counter_staff`, `trade_post_staff` (buildings), `bench_seats` (life_props). The registry must accept them (`Has()` = false, `Def()` returns them).

### 3.1 Merge rules (`Assets.js:140-196`, exact semantics)

For each boot fragment in `FRAGMENTS` order, if its manifest parsed to an object:

1. `atlases`, `images`, `spritesheets`: `m.X[a.key] = a` (later fragment **replaces** same key) and `fragOf[a.key] = frag`. Example: `villagers3` replaces atlases `vil_npc_chef`, `vil_npc_aunt`, `vil_npc_blacksmith` of `villagers`.
2. `characters`: entries **without** `extends`: `m.characters[k] = ch[k]` (replace) and `fragOf['char:'+k] = frag`. Then entries **with** `extends`: for the base `bd = m.characters[c.extends]` (create `{}` if missing), `bd.anims = copy(bd.anims)`; for each anim `an` of `c.anims`: skip if `bd.anims[an]` exists **and** has no own `atlas`; else `bd.anims[an] = { atlas: c.atlas, ...c.anims[an] }`. (deck43: `player_deck43` adds `reel`, `fish` to `player`; `fisherman*_deck43` add `fsit_cast/wait/bite/reel`.)
3. `sprites`, `nineSlice`, `audio`, `audioGroups`, `layouts`: shallow assign, later wins.
4. `audioSprite` with `file`: `sprites[frag] = audioSprite`.
5. `professions`: `professions[k] = list filtered to strings`.
6. After all fragments: compute **unused character atlases**: `used = { d.atlas for every character d } ∪ { d.atlas for every sprite d }`; every atlas key starting `vil_`, `wkr_` or `char_` not in `used` is never loaded.

Late fragments (`mergeLate`, `Assets.js:374-425`) use the **opposite** rule for characters/sprites/nineSlice/audio: **first wins** (`if (!m.sprites[k])`), atlases/images/sheets still replace.

---

## 4. Phaser JSON-hash atlas format

```json
{ "frames": {
    "chief_lodge": { "frame": {"x":0,"y":0,"w":505,"h":486}, "rotated": false, "trimmed": true,
                     "spriteSourceSize": {"x":2,"y":19,"w":505,"h":486}, "sourceSize": {"w":548,"h":528} },
    ... },
  "meta": { "app": "frost-village/tools/pack_utils.py", "version": "1.0", "image": "props_buildings.png",
            "format": "RGBA8888", "size": {"w":1088,"h":1720}, "scale": "1" } }
```

| Field | Meaning | Unity use |
|---|---|---|
| `frame.x,y,w,h` | trimmed rectangle in the PNG, **top-left origin, y down** | `Rect(x, texH − y − h, w, h)` (bottom-left origin) |
| `spriteSourceSize.x,y` | where the trimmed rect sits inside the untrimmed source frame (top-left) | pivot math (§5) |
| `spriteSourceSize.w,h` | always equal to `frame.w,h` (checked: 0 mismatches) | ignore |
| `sourceSize.w,h` | untrimmed frame size (= `frameSize` of the manifest, e.g. 128×128 characters, 160×160 seated fishers) | pivot math; also "display size" (§5.4) |
| `rotated`, `trimmed` | always `false` / mostly `true` | assert `rotated == false` |
| `meta.size` | equals the PNG size | **never use**; use the imported `Texture2D.height` |

Frame names: characters `"{anim}_{dir}_{i}"` (i from 0, no padding, e.g. `walk_SE_3`); shared character atlases (deck43_ch) `"player/reel_NE_0"`; props = sprite key (`"station_grill"`, `"station_grill_work_0"`).

Phaser draws an atlas frame like this (MultiPipeline `batchSprite`, confirmed in `lib/phaser.min.js`): quad from `x0 = −originX·sourceW + sss.x` to `x0 + frame.w` (same for y), i.e. **the origin is relative to the untrimmed source frame**, per frame (`AnimationState.setCurrentFrame` calls `updateDisplayOrigin` on every frame change).

---

## 5. Pivots, sizes, flips (the formulas)

### 5.1 Atlas frame → Unity Sprite

```csharp
const float PPU = 64f;

// e = one JSON frame record, anchor = sprite/char/sheet anchor [ax, ay] (Phaser, top-left, y down, normalised to sourceSize)
static Sprite MakeSprite(Texture2D tex, FrameRec e, float ax, float ay, Vector4 border = default)
{
    var rect = new Rect(e.x, tex.height - e.y - e.h, e.w, e.h);   // y flip!
    float apx = ax * e.srcW - e.offX;     // anchor x, px from the trimmed rect's LEFT edge
    float apy = ay * e.srcH - e.offY;     // anchor y, px from the trimmed rect's TOP edge
    var pivot = new Vector2(apx / e.w, 1f - apy / e.h);           // may be < 0 or > 1: allowed
    return Sprite.Create(tex, rect, pivot, PPU, 0, SpriteMeshType.FullRect, border, false);
}
```

Worked examples (real data):

| Sprite | frame (x,y,w,h) | sss (x,y) | source | anchor | apx, apy | Unity pivot |
|---|---|---|---|---|---|---|
| `chief_lodge` (props_buildings 1088×1720) | 0,0,505,486 | 2,19 | 548×528 | 0.41606, 0.67235 | 225.99, 336.00 | (0.44751, 0.30864); rect y = 1720−0−486 = 1234 |
| `item_fish_raw` (props_items 584×36) | 354,0,56,23 | 3,36 | 72×72 | 0.5, 0.75 | 33, 18 | (0.58929, 0.21739) |
| `vil_npc_aunt` `idle_S_0` (raw or packed) | 352,0,48,97 | 40,14 | 128×128 | 0.5, 0.8125 | 24, 90 | (0.5, 0.07216) |

Pivots outside 0..1 are common, not an error: **491 of 15,290 character frames** (e.g. `pet_dog catch_S_3` pivotY −0.26, `villager_a happy_N_2` −0.022: the jump lifts the body above the feet anchor), **27 of 554 sprite frames** (office/bank props anchored to the building, `bakery43_bread_1` (0.816, −0.867)), **78 of 281** station work-loop frames. `Sprite.Create` accepts them; an editor slicer must be verified to keep them (§15).

### 5.2 Single images and spritesheet frames (untrimmed)

* Image key `k`: anchor = `sprites[k].anchor ?? images[k].anchor ?? [0.5,0.5]`; rect = whole texture; pivot = `(ax, 1 − ay)`.
* Spritesheet: `cols = floor(texW / frameWidth)`; frame `i` (0-based, `i < frameCount`) has Phaser rect `x = (i % cols)·fw, y = floor(i / cols)·fh`; Unity rect `(x, texH − y − fh, fw, fh)`; pivot `(ax, 1 − ay)`. Sheets wrap into rows so no sheet is wider than 2048 (e.g. `fx_levelup` 1536×384, fw 192 → 8 cols × 2 rows = 16 frames). No margin, no spacing.

### 5.3 flipX (mirrored directions, flipped decor)

Phaser mirrors a flipped sprite **about the centre of the untrimmed source frame**, then applies the *unmirrored* origin (`lib/phaser.min.js`: `flipX&&(f||(m+=-e.realWidth+2*v),T=-1)`). Unity `SpriteRenderer.flipX` mirrors about the pivot. They agree only when `ax = 0.5` (all characters: `[0.5, 0.8125]`). For any flipped sprite with `ax ≠ 0.5` (decor with `opts.flip`: `src/scenes/Game.js:565-569`, `src/systems/VillageLife.js:109`, `src/entities/Amenity.js:50`):

```text
unity local x offset (px) when flipped = sourceW · (1 − 2·ax)        → add (offset / 64) to the transform's x
```

e.g. `chief_lodge` flipped: 548 × (1 − 0.83212) = +92.0 px.

### 5.4 "Display size" = untrimmed size

In Phaser `img.width/height`, `displayWidth/Height`, `frame.realWidth/realHeight` and the default hit area are the **untrimmed `sourceSize`**, not the trimmed rect. Code that reads them (occluder boxes `Game.js:1256-1262`, the lock icon scale `60 / frame.realWidth` `Game.js:556-557`, culling, tap areas) must use `FrameRec.srcW/srcH × scale`, **not** `sprite.bounds` / `sprite.rect`. The registry exposes `SourceSize(key)`.

### 5.5 Direction & mirror for character frames (`src/core/Iso.js:10-23`, `src/entities/Character.js:77-80, 197-207`)

```text
DIRS8 index: 0 E, 1 SE, 2 S, 3 SW, 4 W, 5 NW, 6 N, 7 NE
dir = round(atan2(vy*2, vx) / (π/4)) mod 8           (screen velocity, y down)
render dir + flip: E→(E,no) SE→(SE,no) S→(S,no) SW→(SE,flip) W→(E,flip) NW→(NE,flip) N→(N,no) NE→(NE,no)
if the anim has no frames for that render dir: nearestDir(d): for off = 1..4: a=(d+off)%8, b=(d−off+8)%8;
   if both have frames → pick the one whose flip == current flip, else a, else b.
```

---

## 6. Animations (what the registry builds)

Phaser keys and the C# equivalent (a plain `FrameAnim { Sprite[] frames; float[] extraMs; float fps; int repeat; float repeatDelayMs; }`; no `AnimationClip`s needed):

| Kind | Phaser key | Built from | Semantics |
|---|---|---|---|
| Sheet anim | `<sheetKey>` | frames `0 .. min(frameCount, texFrames) − 1` | `fps = sheet.fps ?? 24`, `repeat = sheet.repeat ?? 0` (`Assets.js:701-707`) |
| Sprite anim | `spr:<spriteKey>:<anim>` | `sprites[k].anims[anim].frames` (frame names in `sprites[k].atlas`) | `fps ?? 8`, `repeat ?? −1`; frames missing in the atlas are skipped (`Assets.js:709-721`) |
| Character anim | `<charKey>:<anim>:<renderDir>` | for i in `0..frames−1`: name = `(anim.frameName ?? def.frameName ?? "{anim}_{dir}_{i}")` with `{anim},{dir},{i}` replaced; atlas = `anim.atlas ?? def.atlas` | `fps ?? 10`, `repeat ?? −1`, `repeatDelay` ms; `frameHold[i]` ms is **added** to that frame's 1000/fps (Phaser `AnimationFrame.duration`); a dir with zero existing frames is skipped (`Assets.js:739-788`) |

Rules:

* `repeat −1` = loop forever, `0` = play once and hold the last frame, `n` = play n+1 times; `repeatDelay` = pause before each repeat.
* Character def = `COMMON_CHAR ⊕ CHAR_DEFAULTS[key] ⊕ manifest[key]`, anims merged the same way (`Assets.js:723-737`). Constants (`Assets.js:97-118`):
  * `COMMON_CHAR = { frameSize:[128,128], anchor:[0.5,0.8125], dirs:[S,SE,E,NE,N], mirror:{SW:SE,W:E,NW:NE}, frameName:"{anim}_{dir}_{i}", shadow:[46,18], headTop:-84, kind:"human", carryPoint:{S:[0,-31,false],SE:[12,-34,false],E:[17,-40,false],NE:[12,-46,true],N:[0,-48,true]} }`
  * `HUMAN_ANIMS = { idle:{4f,6fps,−1}, walk:{8,12,−1}, carry_idle:{4,6,−1}, carry_walk:{8,12,−1} }`; `CHAR_DEFAULTS` adds `player.chop/mine {8,14,−1,impact 5}`, `harvest {6,10,−1,impact 3}`, workers' `work`, `villager_a/b/c.happy {6,10,−1}`, `deer/boar` (animal, shadow `[56,22]`/`[62,26]`, headTop −56/−43).
* An anim that names its own atlas (`extends`) is built only when that atlas is loaded; never a placeholder (`Assets.js:752-754`).
* **Fallback chain** when a character lacks an anim (`ANIM_FALLBACK`, `Assets.js:74-95`; first existing wins, then `idle`):

```text
carry_idle→idle  carry_walk→walk  run→walk  skate→run,walk  happy→idle  work/chop/mine/harvest→idle  talk→idle
laugh→happy,idle  wave→happy,idle  surprised/angry/sad→idle  throw→idle  hit→surprised,idle  dance→happy,idle
sit→idle  perform→talk,idle  shiver→idle  serve→talk,idle  bow→wave,happy,idle  salute→wave,idle  fall→sit,hit,idle
loaf→sit,idle  sit_idle→sit,idle  sit_write/sit_read/sit_eat/doze→sit_idle,sit,idle  sit_read_in/sit_read_loop→sit_read,sit_idle,idle
warm_hands→idle  cheer→wave,happy,idle  reel/fish→harvest,idle  fsit_cast/fsit_bite/fsit_reel→work,idle  fsit_wait→idle
operate→work,idle  pet→idle  knead/oven_in/oven_out→operate,idle  give→idle  eat/roll/beg→sit,happy,idle
run_ball→run,walk  catch/trick→happy,idle
```

* `animDuration(key, anim) = max(0.1, frames / max(1, fps))` s of the resolved anim (default 0.6 s if unknown).
* Placeholder character (atlas missing): 2 frames per dir at 4 fps from a generated sheet (`Placeholders.js:351-380`).

---

## 7. `tfatlas` (custom compact format; late — parser in the slice, runtime later)

Used by `townfolk/*.json` (11 sheets, 2048-wide, paper-doll layers of townspeople), `officefolk/*.json` (4), and their packed pages `_packed/tf_*.{loco,soc}.json`. Loaded as a plain image + JSON (`Assets.js:494`), frames installed when both are present (`tfInstall`, `Assets.js:445-466`).

```text
{ "tfatlas": 1, "image": "tf_head_0.png", "size": [2048, 1460], "frameSize": [128, 128],
  "frames": { "<prefix>": { "<group>": R | [R or null, ...] } } }
R = [x, y, w, h, ox, oy]   // x,y,w,h = trimmed rect in the PNG (top-left); ox,oy = its offset inside the frameSize source frame
```

Install algorithm (exact):

```text
(fw, fh) = data.frameSize ?? [128, 128]
for prefix in frames: for group in frames[prefix]:
    v = frames[prefix][group]
    if v contains no array (a single R):  add(prefix + "/" + group, v)
    else for i, r in v: if r != null: add(prefix + "/" + group + "_" + i, r)
add(name, r): FrameRec { x=r[0], y=r[1], w=r[2], h=r[3], offX=r[4], offY=r[5], srcW=fw, srcH=fh }   // == JSON-hash fields
```

Example prefixes: `acc_earmuffs.band`, `acc_backpack.pack@adult_slim`; groups `loco_S`, `idle_SE`, `soc_E`, `nod_S` … Anchors come from the `townfolk` block (`frameSize [128,128]`, `anchor [0.5,0.8125]`, `headAnchor [0.5,0.5625]`). After conversion every tfatlas frame is an ordinary `FrameRec`, so §5 applies unchanged.

---

## 8. Packed pages (`assets/_packed/index.json`) — not used by the slice

Made by `tools/build/pack_pages.py` to split big atlases into a resident page and on-demand pages.

```text
{ version: 1, tool, atlases: { <atlasKey>: { frag, kind: "char"|"tf"|"town"|"core"|"bld", format?,
        pages: [ { key: "<atlas>@<cls>", cls: "core"|"social"|"loco"|"soc"|"dirs"|"hall"|..., png, json, bytes,
                   anims?: [animNames on this page], frames?: [frameNames on this page], data?: <inline frame list> } ],
        src: <hash> } },
  manifests: { chief_fx: {...}, ui5: {...} } }      // embedded manifests (no request)
```

54 packed atlases (32 villager chars core/social, 11 townfolk loco/soc, `town_civic` 4 pages, `town_shops` 2, 6 train cars, `v42_core` shared by `chief_fx` + `ui5_icons`, `office_bld` closed/inside). Page JSONs are the same JSON-hash (or tfatlas) format with **identical frame names**, so a later port can treat a page as "one more texture that may hold frame X" (`texOf(atlas, frame)`: try each loaded page in order, `Assets.js:265-272`). Lookup of the page of a frame: `framePage['atlas|frame']`, else the anim page of `/^(.*)_(S|SE|E|NE|N|SW|W|NW)_\d+$/` group 1, else the core page (`Assets.js:255-263`).

---

## 9. 9-slice

| Manifest (`NineDef`) | Unity |
|---|---|
| `left, right, top, bottom` (px, of the image or atlas frame) | `Sprite.border = new Vector4(left, bottom, right, top)` (**order L, B, R, T**) — pass it to `Sprite.Create`; draw with `SpriteRenderer.drawMode = Sliced` or UI `Image.type = Sliced` (needs `SpriteMeshType.FullRect`) |
| no record for the key | `m = floor(min(w, h) / 3)` on all four sides; a placeholder uses `l=r=t=30, b=34` (`Assets.js:914-925`) |

Slice records (ui): `ui_panel 22/22/22/30`, `ui_button_blue|green|gray 32/32/32/36`, `ui_coin_bar 34/34/30/30`, `ui_bubble_body 34/34/32/36` (L/R/T/B). ui5 panel frames are stored **untrimmed** in the atlas on purpose; ui3 9-slices are plain images.

---

## 10. Audio

### 10.1 Files and fields

* Each key has `files: [".ogg", ".mp3"]` (same content). All measured files: Vorbis, **44,100 Hz**, sfx/ambience **mono**, music **stereo** (`bgm_village`). OGG length is sample-exact; `mp3StartPad: 1105` is the MP3 decoder delay (Phaser trims it: `Audio.js:201-221`) → irrelevant when importing OGG.
* `audio7` (late, office) ships **only** an audio sprite `audio7/audio7_sprite.mp3` + `amb_office.mp3`; entries carry `inSprite: "audio7"`, slice = `[start, dur]` + 0.03 s tail (`Assets.js:607-638`). Later: cut offline with ffmpeg into separate WAV/OGG clips (skip 1105 samples of the MP3 first).
* The web "artifact" build also packs one-shots into sprites; the repo (dev layout) has individual files — use those.

### 10.2 Playback model (for the audio spec; the asset side must keep these fields)

```text
play(key, opts):  if group = audioGroups[key]: i = floor(rand·n); if n>1 && i == last[key]: i = (i+1) % n; last[key] = i; k = group[i]
                  skip if (now − lastPlay[k]) < (opts.throttle ?? 35 ms)
                  volume = (audio[k].volume ?? 0.7) · (opts.volume ?? 1) · slider('sfx')        // master slider on the mixer
                  opts.rate / opts.detune / opts.pan (−1..1) pass through
music/ambience:   loop = true; volume = def.volume · slider('music' | 'amb'); amb_sea_waves start offset = ambSeek() s (later)
```

(`src/core/Audio.js:57-110`.) Category sliders `master, music, sfx, amb` 0..1 (`Settings.data.vol`).

### 10.3 Unity import settings

| Class | Load type | Format | Other |
|---|---|---|---|
| sfx (`kind: sfx`, < 3 s) | Decompress On Load | Vorbis q≈70 (Android), PCM/ADPCM ok | Force To Mono (already mono), Preload Audio Data on — set on `AudioImporterSampleSettings.preloadAudioData` (default + Android override); the importer-level property is obsolete in Unity 6 |
| ambience / music (`loop: true`) | Compressed In Memory (amb) / Streaming (music) | Vorbis q≈60–70 | Load In Background; `AudioSource.loop = true`; **verify gapless loop on device** (Vorbis is sample-accurate; MP3 is not → never import the .mp3) |
| sample rate | Preserve (44,100) | | |

---

## 11. Korean font

* Phaser renders every label with the CSS stack above; **no font file ships** (`tools/fonts/README.txt`: the TTFs there are only for baking title logos). On Android the WebView falls back to the system Noto Sans CJK KR.
* Weights used (`fontStyle` tally in `src/scenes|systems|entities|core|title`): `900` ×20, `800` ×18, `700` ×6. Sizes 16–76 px (mostly 18–30), strokes 5–14 px (`strokeThickness` 5 ×7, 6 ×2, 7, 8 ×3, 14). Text is drawn at `resolution: 2`.
* Coverage: Pretendard has all 11,172 Hangul syllables and every non-ASCII symbol used in UI strings (`· … → › × 「 」 ♪ — é ' ' ∞ ★ − ● ✓ ♥ " " ■`) **except `❄` U+2744 and `🛷` U+1F6F7** (cmap check on `Pretendard-ExtraBold.ttf`, 14,336 code points).
* **Revision (crit_fidelity 7, crit_unity 3; 00 A10/§4.6 win):** for parity use the font the phone really shows (default Noto Sans KR Bold + Black, Roboto for digits/Latin if the WebView shows Roboto), chosen in WP-0 from a screenshot on the designer's phone; Pretendard only as a design choice. TMP settings: Dynamic, Multi Atlas, 2048 × 4096, sampling 64, **padding 13** (padding 9 cannot draw an 18-px label's 5-px stroke: it needs 12.4), stroke material presets. The original recommendation follows for reference.
* (Original) Recommendation: TMP Font Assets from Pretendard **Bold (700), ExtraBold (800, in repo, 2,669,648 bytes), Black (900)** — OFL 1.1, credit line in `tools/fonts/README.txt`. Atlas Population **Dynamic**, Multi Atlas Textures on, atlas 2048×2048, sampling ≈ 64–72 pt, padding ≈ 9 (outlines up to 14 px at 72 px text). Include the TTFs in the build (dynamic atlases need them). Static alternative: KS X 1001 2,350 syllables + ASCII + the symbol list. Map `❄`/`🛷` to a TMP Sprite Asset (or replace in strings).

---

## 12. The 9 WebP files (title only — out of slice)

| file (`assets/title_bake/`) | px | bytes | codec |
|---|---|---:|---|
| `ttl_1_0.webp` | 102×1182 | 47,008 | VP8X + ALPH + VP8 (lossy colour, lossless alpha) |
| `ttl_2_0.webp` | 1544×655 | 149,434 | same |
| `ttl_3_0.webp` | 2048×1134 | 380,972 | same |
| `ttl_4_0.webp` | 2038×1151 | 403,902 | same |
| `ttl_ground_base.webp` | 1582×903 | 138,626 | same |
| `ttl_ground_s1.webp` | 405×340 | 14,740 | same |
| `ttl_ground_s2.webp` | 676×293 | 24,322 | same |
| `ttl_ground_s3.webp` | 1242×800 | 86,166 | same |
| `ttl_ground_s4.webp` | 1032×632 | 67,364 | same |

`ttl_1_0..4_0` are atlases with a JSON-hash next to them (`ttl_N_0.json`, frame names like `pet_dog:run:E:0`); `title_bake.json` (v, G, actors, files, groups, island, sprites, groundScale) drives the diorama (`src/title/TitleAssets.js`). Identical copies live in `src/title/bake/`. Unity 6 cannot import WebP: decode once to RGBA PNG (Pillow `Image.open(...).save(png)` or `dwebp -png`), keep the base name, and import with the §15 rules. `tools/build/webp_assets.py` converts PNG→WebP only for the web build; the Unity copy must take the **PNG originals** from `assets/` (all other folders are PNG already).

---

## 13. Lazy pages & the texture budget (Phaser behaviour, and what Unity does)

### 13.1 Phaser load timeline

```text
Boot.create:      Settings.load → setLang → Audio.init → start Preload                                   (src/scenes/Boot.js:8-13)
Preload.preload:  for frag in FRAGMENTS: load.json("manifest_"+frag, frag+"/manifest.json");
                  load.json("packed_index", "_packed/index.json"); title manifests                        (Preload.js:31-35, Assets.js:134-138)
Preload.create:   mergeManifests → queueAssets(boot files; audio except deferred & unused) → title first paint
                  progress bar (420 px wide); on complete: finalize (sheet/sprite/character anims, fv_shadow, fv_white)
                  → Audio.trimLoops → start Title; +1.5 s prefetch WATER_DATA                              (Preload.js:37-70, Assets.js:686-699)
Game.build:       … loadDeferredAudio(): deferred audio + after-title pictures, ordered:                   (Game.js:424-449)
                    1) core pages of characters already "working" (hired operators; a new game's npc_chef), workers' looks,
                       pet_dog, residents who moved in, npc_clerk_a/b, npc_porter_a/b
                    2) firstKeys: bakery43, market_s4, market_s3, market_s2, bld_sites, bld_work, bld_east, bld_buildings_2, boat_rowboat, boat_fishing
                    3) everything else that passes the gate
Game.update:      checkLazyGates every 2 s (same order)                                                     (Game.js:500-507)
on file arrival:  Assets.onLazyFile → rebuild anims → Game.onAssetArrived re-skins stand-ins (fv_blank 2×2)  (Assets.js:522-555, Game.js:1242-1262)
load error:       audio: retry once with the remaining URLs; lazy picture: retry after 3, 8, 20, 45, 90 s (5 tries);
                  late manifest: retry after 2, 6, 15, 30 s                                                (Assets.js:659-684, 352-367)
```

Gate (`Game.lazyAllowed`, `Game.js:451-480`), exact:

| file | allowed when |
|---|---|
| water sheet (not WATER_DATA) | `WaterSheets.allowed(k)` |
| `market_s<n>` | current stage `> n` → never; `== n` → yes; `n=2`: `hire_fisherman` done; `n=3`: `zone_hunt` done; `n=4`: `mkt_s4` done or `flags.g43s4` |
| `bakery43` | `hire_lumberjack` or `zone_farm` or `bld_bakery` done |
| fragment `workers` | village complete or any step matching `/^(hire[23]_|op_toolsmith)/` |
| fragment `buildings` | village complete or `hire_farmer` done or any site not in state `plot` |
| late fragment file | a system asked for it (`lateWant`) or it is a demanded page |
| anything else | yes |

### 13.2 Budget numbers (`src/data/balance.js:484-488`, `src/core/Residency.js:1-130, 167-199`, `src/core/Perf.js:36-44`)

| Constant | Value |
|---|---|
| `BALANCE.v4.tex` | `mustMiB 455, targetMiB 300, lowMiB 200, softGap 24, uploadsPerSec 10, socialPages 5, socialTtl 30 s, townTtl 10 s` |
| preset `mid` override | `socialPages 3, socialTtl 18, targetMiB 280`, texScale 0.75, near/far 700/1050 |
| preset `low` override | `socialPages 2, socialTtl 12, targetMiB 200, lowMiB 150`, texScale 0.5, near/far 600/900 |
| preset `high` | texScale 1, near/far 800/1200 |
| budget() | `hard = gfxLow ? lowMiB : targetMiB; soft = hard − softGap; must = mustMiB` |
| line() | `must − renderTargets − GL_EXTRA(6) − LINE_MARGIN(18)`; `renderTargets = max(pipelines' sum, RT_FIXED 8.5 + RT_BUFFERS 5.9 × canvasW·canvasH·4 / 2^20)` |
| measure | `Σ over textures of w·h·4·memScale` bytes / 2^20 (the "source-sum") |
| area pages | `ACQUIRE 800`, `RELEASE 1200` px (preset near/far) × `k` (`CORE_K 0.65` for core/work/eastside); `LIVE_PAD 64`, `LIVE_EVERY 2 s`, `VIEW_FAR 400`, `LOOK_TTL 3 s`, `COMING_MS 15000`, `GROUND_MS 12000`, `MOVE_PX 256`, `SWAP_GAP 15 MiB` |
| tick | every 0.5 s: TTL-evict on-demand pages unused > socialTtl (unless pinned); if total > line: drop far areas, LRU-evict (min age 1000 ms); total > hard for 2 s → `budget` event |
| want(page) | `need = page.bytes/2^20 ?? 4`; refuse if `total + inflight + need > line` and making room fails; cap = socialPages (low: min(2, cap)); LRU-evict (min age 2000 ms) to make a slot |
| texScale (mid/low) | big pages uploaded at 0.75/0.5 into a canvas; frames keep full-size coordinates. Never scaled: keys matching `/^(ui|title|ttl_|emote|font|water|ground|road|sidewalk|fv_|__|beach_sand|sand|portrait|icon|logo|fx_|chief_fx)/i` or images < 512×512 px or < 64 px on a side (`Perf.js:384-404`) |
| measured | title 88.5 MiB; new game +5 s **192 MiB** source-sum (229.5 MiB GL); v3.5 village complete 287 MiB (`docs/build_reports/texbudget_v4.json`, 2026-10-09) |

Residency areas (`Residency.js:36-79`): `town [4150,0,6144,3450]`, `east [3000,0,6144,3450]`, `village [WORLD.left=-1400,0,3000,3450]` (bld_buildings_2, boat_rowboat, boat_fishing, + town_park when a playground/fountain stands), `bank42 [-620,240,-60,760]`, `office` (around the hut, 600,640 ±300/−300…+240, live), `depot [2700,2850,3700,3420]`, `sleigh [2950,1500,4900,3420]`, `core [-150,150,1900,2600]` (props_buildings, deck43, bakery43, market_s<stage>, town_civic@hall once built; live, k 0.65), `work [-220,1200,820,1760]` (bld_work), `eastside [1520,110,2260,1260]` (bld_east).

### 13.3 Unity slice policy

* Load **Tier A + Tier B** (§16) at boot behind the loading bar; never unload. Expected GPU memory for the 66 textures: ≈ 39.5 MiB (ASTC 4×4 everywhere) / ≈ 30.0 MiB (ASTC 6×6 for props, buildings, market, deck43, bakery43, life_props, ground, ground_road; 4×4 for the rest) vs ≈ 158 MiB if left RGBA32. (Phaser at the same moment: 192 MiB source-sum.)
* Anything a v4.x save references that is not imported (town, office, bank, depot, vehicles, …) → **placeholder** exactly like Phaser (`Assets.sprite` → `Placeholders.sprite`), one `Debug.LogWarning` per key. The layout is still shown.

### 13.4 Later (post-slice) mapping

| Phaser concept | Unity |
|---|---|
| fragment manifest | `TextAsset` (unchanged JSON) |
| boot / after-title / late / on-demand | Addressables groups `fv_boot`, `fv_lazy`, `fv_late_<frag>`, `fv_area_<id>`; `LoadAssetAsync<Texture2D>`; `Addressables.Release` = evict |
| `fv_blank` stand-in + `arrivals` re-skin | `SpriteRenderer.sprite = null` + `FvAssets.Arrived(key)` event |
| source-sum w·h·4 | `Profiler.GetRuntimeMemorySizeLong(tex)` (ASTC 4×4 ≈ ¼, 6×6 ≈ 1/9 of RGBA32) → re-tune `targetMiB`/`mustMiB` from device measurements, do not copy 300/455 |
| `texScale` 0.75/0.5 | **Not possible without mipmaps** (`QualitySettings.globalTextureMipmapLimit` / Mipmap Limit Groups only drop mip levels). Options: half-res Addressables variant for "low", or enable mips on the big-page group only (+33 % memory; 2-px frame gaps bleed from mip 2 on). Decide after device tests. |
| packed social pages | probably unnecessary (a whole villager atlas is ≈ 1.5 MiB in ASTC 4×4) |

---

## 14. Registry API & call sequences (C#)

```csharp
public static class FvAssets {
    // ---- data (after Init)
    Dictionary<string, AtlasDef> atlases; Dictionary<string, ImageDef> images; Dictionary<string, SheetDef> sheets;
    Dictionary<string, CharDef> characters; Dictionary<string, JObject> sprites;      // raw: keep every extra field
    Dictionary<string, NineDef> nineSlice; Dictionary<string, AudioDef> audio; Dictionary<string, string[]> audioGroups;
    Dictionary<string, string> fragOf;   HashSet<string> unusedAtlas; HashSet<string> warned;

    // ---- runtime caches
    Dictionary<string, Texture2D> tex;                               // atlas/image/sheet key -> texture
    Dictionary<string, Dictionary<string, FrameRec>> frames;         // atlas key -> frame name -> rec (parsed on first use)
    Dictionary<(string atlas, string frame, float ax, float ay), Sprite> spriteCache;
    Dictionary<string, FvSpriteRef> lookupCache;                     // sprite key -> resolved result (Assets.cache)
    Dictionary<string, FrameAnim> anims;                             // "<sheet>", "spr:<k>:<anim>", "<char>:<anim>:<dir>"

    public static void Init(FvAssetCatalog cat);      // merge manifests (§3.1) in FRAGMENTS order, compute unusedAtlas
    public static IEnumerator LoadBootSet(Action<float> progress);   // textures of Tier A+B (+ audio clips)
    public static void Finalize();                    // build sheet anims, sprite anims, characters (§6); create fv_shadow/fv_white
    public static FvSpriteRef Sprite(string key);     // never null (placeholder)
    public static bool Has(string key);
    public static string Pick(params string[] keys);  // first with real art, else the LAST key
    public static JObject Def(string key);            // sprites[key] or empty
    public static Vector2Int SourceSize(string key);  // untrimmed size (§5.4)
    public static FvNine Nine(string key);
    public static FrameAnim CharAnim(string charKey, string anim, string renderDir); // with fallback chain + nearest dir
    public static AudioDef AudioDef(string key); public static string[] AudioGroup(string key);
    public static event Action<string> Arrived;       // later: lazy files
}
public struct FvSpriteRef { public Sprite sprite; public Vector2 anchor; public JObject def; public bool placeholder; public bool pending; }
public struct FrameRec { public int x, y, w, h, offX, offY, srcW, srcH; }
```

`Sprite(key)` resolution order (exact port of `Assets.js:840-866`):

```text
if cached: return it
def = sprites[key]
if pending(key) (later only): return { sprite = null, anchor = def.anchor ?? [0.5,0.5], pending = true }      // not cached
if def.atlas:  t = texture holding frame def.frame (slice: atlases[def.atlas] if loaded and has the frame)
               → { MakeSprite(t, frame, def.anchor ?? [0.5,0.5]), anchor, def }
elif def.image and texture(def.image) loaded → whole-image sprite, anchor = def.anchor ?? [0.5,0.5]
if none and a texture with this exact key is loaded and not failed:
               → whole-image sprite, anchor = def?.anchor ?? images[key]?.anchor ?? [0.5,0.5], def = def ?? images[key]
if none: warn once "missing asset → placeholder: <key>"; Placeholders.Sprite(key, def) → { placeholder = true }
cache and return
```

`Has(key)`: `def.atlas` → frame exists in a loaded texture; `def.image` → that image is loaded; else a loaded texture named `key` that has not failed.

Per frame: the registry does nothing in the slice (no streaming). Per event: none in the slice (later: `Arrived`, 0.5-s budget tick).

### 14.1 Generated textures (create in code at boot)

| key | size | content |
|---|---|---|
| `fv_shadow` | 64×32 | ellipse (canvas scaled y 0.5, circle r 32 at (32,32)) filled with a radial gradient centre (32,32) r 2→32: stops 0 `rgba(40,55,90,0.42)`, 0.6 `rgba(40,55,90,0.22)`, 1 `rgba(40,55,90,0)` (`Placeholders.js:383-389`). Characters scale it to `def.shadow` px (e.g. 46×18). |
| `fv_white` | 8×8 | opaque white (`Placeholders.js:391-393`) |
| `fv_blank` | 2×2 | transparent stand-in (later only) |
| placeholders | per key | items: 64×64 two-tone pill, anchor [0.5,0.75]; trees: anchor [0.5,0.9]; others: a soft box sized by `footprint` (`Placeholders.js:71-…`). Exact look not important; size/anchor are. |

### 14.2 Catalog & folders

* Copy `frost-village/assets/<frag>/…` to `Assets/FrostVillage/Art/<frag>/…` (same names). JSON files become `TextAsset`s automatically.
* An editor menu builds `FvAssetCatalog` (ScriptableObject): `manifestPath → TextAsset`, `pngPath → Texture2D`, `jsonPath → TextAsset`, `audioPath → AudioClip`, keyed by the manifest's own path strings (`"props/props_buildings.png"`). The runtime never builds paths by hand. (Resources.Load would also work but puts every file in the build.)
* For a sheet/atlas, never trust `meta.size`; rect y uses the imported `Texture2D.height` (so padding a file at the bottom/right to reach a multiple of 4 is safe).

---

## 15. Unity import approach — (a) vs (b)

| | (a) AssetPostprocessor + runtime `Sprite.Create` from JSON | (b) ScriptedImporter / `ISpriteEditorDataProvider` slicer |
|---|---|---|
| Work to build | ≈ 1 postprocessor + 1 registry (≈ 600 lines C#) | postprocessor + data-provider slicing + JSON dependency tracking + still a runtime key→Sprite registry |
| Pivots outside 0..1 (596 frames) | native | must verify `SpriteRect.pivot` outside [0,1] survives import/Sprite Editor in 6.3; fallback = clamp + child offset |
| `tfatlas`, packed pages, inline `data` | same code path | needs extra importers |
| Art regenerated by the Python/Blender tools | drop files in, done | reimport triggers; JSON must be registered as dependency (`AssetImportContext.DependsOnSourceAsset`) |
| Sprites visible/placeable in the editor, AnimationClips, SpriteAtlas | no (world is built from `world.js` data anyway) | yes |
| Runtime cost | Sprite.Create (FullRect) ≈ µs each, lazily, ≈ 2,000 sprites in the slice; cache them | none |
| Lazy loading later (Addressables) | natural (texture + JSON per address) | sprites are sub-assets of the texture: fine too |

**Recommendation: (a) for the slice.** The village is placed by code from `world.js`, the registry API mirrors `Assets.js`, and one formula (§5.1) serves every format. Revisit (b) only if designers need to hand-place art in Unity scenes; it must reuse §5.1 verbatim.

### 15.1 Import rules (AssetPostprocessor)

```csharp
class FvTexturePostprocessor : AssetPostprocessor
{
    const string ROOT = "Assets/_Snowbloom/Content/";      // revision: path per 00 §1.2; Generated/Ground has its own data rule (00 §5.2)
    static readonly Regex PATTERN = new(@"/(ground/(ground_|water_|shore_foam)|ui2/(ground_road|road_edge)|roads/(road_|sidewalk))[^/]*\.png$");
    static readonly Regex SOFT = new(@"/(props|buildings|market|deck43|bakery43|life_props|town|civic|logistics|office|ground)/|/ui2/ground_road\.png$");   // fixed: ground_road.png is a file, not a folder
    // + Tier A+ extra villager looks and workers use ASTC 6×6 too (00 §5.3): match by the slice list, not by folder

    void OnPreprocessTexture()
    {
        if (!assetPath.StartsWith(ROOT)) return;
        var ti = (TextureImporter)assetImporter;
        PngHeader.Read(assetPath, out int w, out int h);       // IHDR bytes 16–23 (GetSourceTextureWidthAndHeight can report 0 on a first import)
        int max = Mathf.Clamp(Mathf.NextPowerOfTwo(Mathf.Max(w, h)), 32, 8192);   // <= 2048 for all slice files

        ti.textureType = TextureImporterType.Sprite;
        ti.spriteImportMode = SpriteImportMode.Single;        // frames are cut at runtime (§5); Single = a whole-texture sprite (useful for patterns)
        ti.spritePixelsPerUnit = 64;
        var s = new TextureImporterSettings(); ti.ReadTextureSettings(s);
        s.spriteMeshType = SpriteMeshType.FullRect; s.spriteGenerateFallbackPhysicsShape = false; s.spriteExtrude = 0;
        ti.SetTextureSettings(s);
        ti.mipmapEnabled = false;
        ti.npotScale = TextureImporterNPOTScale.None;          // (matters only for Default type; keep it explicit)
        ti.alphaIsTransparency = true;                         // dilates colour under alpha 0 (no dark fringes)
        ti.sRGBTexture = !assetPath.Contains("/water/");      // water data textures are data (later)
        ti.isReadable = false;                                 // true ONLY if the ground system bakes on the CPU (§17 R8)
        ti.wrapMode = PATTERN.IsMatch(assetPath) ? TextureWrapMode.Repeat : TextureWrapMode.Clamp;
        ti.filterMode = FilterMode.Bilinear;
        ti.maxTextureSize = max;
        ti.textureCompression = TextureImporterCompression.Compressed;

        var android = ti.GetPlatformTextureSettings("Android");
        android.overridden = true; android.maxTextureSize = max; android.compressionQuality = GoNoGoBuild ? 100 : 50;   // 50 = Normal: faster imports
        android.format = SOFT.IsMatch(assetPath) ? TextureImporterFormat.ASTC_6x6 : TextureImporterFormat.ASTC_4x4;
        ti.SetPlatformTextureSettings(android);

        var pc = ti.GetPlatformTextureSettings("Standalone");
        pc.overridden = true; pc.maxTextureSize = max; pc.format = TextureImporterFormat.BC7;   // non-÷4 files: see §17 R6
        ti.SetPlatformTextureSettings(pc);
    }
}
```

| Setting | Value | Reason |
|---|---|---|
| maxTextureSize | `nextPow2(max(w,h))` (≤ 2048 here; 4096 only for `_packed/town_civic.rest.png`) | Unity's default 2048 would **downscale** a larger file and break every frame rect; 8192 allowed but old phones have a 4096 GPU limit (Perf picks "low" when max texture < 4096) |
| mipmaps | off | Phaser has none (WebGL1 NPOT); zoom range 0.6–1.7 × render scale 1–2 keeps minification ≤ 1.7×; atlas gaps (2 px) bleed at mip ≥ 2 |
| NPOT scale | None | NPOT rescale would move every frame |
| filter / wrap | Bilinear / Clamp (Repeat for tiling patterns) | Phaser `antialias: true`, `pixelArt: false`, `roundPixels: false` (`src/main.js:60`) |
| compression | ASTC 4×4 (characters, UI, FX, items, emotes) / ASTC 6×6 (buildings, props, ground) on Android; BC7 on PC | ASTC = 1.0 / 0.44 byte per px vs 4 for RGBA32; palette PNGs are already quantised: check edges visually, fall back to RGBA32 for `ui_icons` (1.8 MiB) if icons smear |
| alphaIsTransparency | on | straight-alpha import of soft baked shadows |

---

## 16. EXACT assets for the vertical slice

### 16.1 What is on screen in the opening loop (new game, from `world.js`)

Chief starts at `(1130, 412)` (`WORLD.player`), camera `tutorialView [985, 600]`; hut `chief_lodge` at `(600, 640)`; fishing deck tier 1 at `(1073, 299)` with the chief's landing/reel spot; fish crate pile at `(1000, 440)`; grill station `Z('plaza', −4.5, 4.8)`; first shop `market_s1_back` at `Z('plaza', 2.0, 2.8)` with shelf / cash / register pads; workshop43 bench `Z('plaza', 3.6, −4.6)`; trash pad `(−45, 585)` with a campfire; life props (notice board, snowman, snow fort, snowball pile, dog house, log seats, lantern string); decor (lamp posts, barrels, crates, flag poles, snow piles, bushes, campfires, benches, signposts, tents); border/extra trees; decals. First residents (`WORLD.life.moveIns.start`): `npc_grandpa, npc_aunt, npc_kid_girl, npc_kid_prankster, pet_dog` → **the slice takes all five** (revision: 00 A23; `vil_npc_kid_prankster.png` joins Tier A). Customers: `villager_a/b/c` **plus every loaded villager look** (Phaser `Market.customerKeys()`, `Seller.js:316–320`; all `villagers*` atlases load in the background after a new game) → Tier A+ in 00 §5.3. Loop items: `item_fish_raw → item_fish_cooked → item_coin`. **Construction sites (`bld_sites`) are not on screen in the first loop** (first plots open with `zone_forest`/`hire_miner`); they are needed for v4.x saves → Tier B.

### 16.2 Tier A — new game + opening loop (40 textures)

| file | px | mode | png bytes | json bytes | RGBA32 MiB | ASTC4×4 MiB | ASTC6×6 MiB | used for |
|---|---|---|---:|---:|---:|---:|---:|---|
| `ground/ground_snow.png` | 512×512 | P | 45,064 | – | 1.00 | 0.25 | 0.11 | snow base pattern (Repeat) |
| `ground/ground_plaza.png` | 512×512 | P | 174,101 | – | 1.00 | 0.25 | 0.11 | plaza zone floor (unlocked at start) |
| `ui2/ground_road.png` | 512×512 | P | 186,117 | – | 1.00 | 0.25 | 0.11 | village paths (`Ground.js:670-683`, pattern at scale 0.5) |
| `ground/water_sea.png` | 512×512 | P | 107,134 | – | 1.00 | 0.25 | 0.11 | classic sea tile (`Ground.js:189`) |
| `ground/water_shallow.png` | 512×512 | P | 137,439 | – | 1.00 | 0.25 | 0.11 | shallow band (`Ground.js:580`) |
| `ground/shore_foam.png` | 512×64 | P | 8,881 | – | 0.12 | 0.03 | 0.01 | shoreline foam (`Ground.js:616`) |
| `ground/decal_snow_drift_a.png` | 256×128 | P | 5,578 | – | 0.12 | 0.03 | 0.01 | drifts (`Ground.js:706-716`) |
| `ground/decal_snow_drift_b.png` | 256×128 | P | 5,356 | – | 0.12 | 0.03 | 0.01 | drifts |
| `ground/decal_footprints.png` | 256×128 | P | 2,770 | – | 0.12 | 0.03 | 0.01 | footprints (`Ground.js:721-733`) |
| `ground/decal_puddle_ice.png` | 160×80 | P | 4,158 | – | 0.05 | 0.01 | 0.01 | `WORLD.decals` |
| `ground/decal_dirt_patch.png` | 192×96 | P | 4,267 | – | 0.07 | 0.02 | 0.01 | `WORLD.decals` |
| `props/props_buildings.png` | 1088×1720 | RGBA | 1,327,299 | 7,350 | 7.14 | 1.78 | 0.80 | `chief_lodge`, `station_grill` + `station_grill_work_0..3`, `dock_pier`, `tent_a`, `worker_hut`, other stations |
| `props/props_decor.png` | 1120×336 | RGBA | 226,197 | 4,132 | 1.44 | 0.36 | 0.16 | `campfire`, `fence_*`, `lamp_post`, `barrel`, `crate`, `flag_pole`, `bench`, `signpost`, `boat_small`, `firewood_pile`, `hay_bale` |
| `props/props_nature.png` | 2028×360 | RGBA | 290,957 | 2,672 | 2.79 | 0.70 | 0.31 | `tree_pine_a/b/snow`, `bush_snow`, `snow_pile_a/b`, `ice_chunk`, `tree_stump` |
| `props/props_items.png` | 584×36 | RGBA | 24,683 | 1,947 | 0.08 | 0.02 | 0.01 | `item_fish_raw`, `item_fish_cooked`, `item_coin` (+7 more items) |
| `deck43/deck43.png` | 756×1044 | RGBA | 498,267 | 2,223 | 3.01 | 0.75 | 0.33 | `deck43_t1_back/front`, `deck43_landing`, `deck43_rod_idle/bite/hooked`, `fish_crate`, `workshop43` |
| `deck43/deck43_ch.png` | 1312×356 | RGBA | 584,165 | 12,526 | 1.78 | 0.45 | 0.20 | chief `reel`/`fish` (`player/reel_NE_i`, 6 frames each; `extends: player`) |
| `market/market_s1.png` | 508×280 | RGBA | 88,526 | 504 | 0.54 | 0.14 | 0.06 | `market_s1_back`, `market_s1_front` |
| `life_props/life_props.png` | 1948×444 | RGBA | 426,767 | 4,598 | 3.30 | 0.82 | 0.37 | `notice_board`, `snowman_0`, `snow_fort`, `snowball_pile`, `dog_house`, `log_seat(_x/_y)`, `lantern_string` (+anim `twinkle`) |
| `characters/char_player.png` | 2036×816 | P | 647,361 | 54,932 | 6.34 | 1.58 | 0.71 | the chief: idle, walk, carry_idle, carry_walk, chop, mine, harvest, pet, give, throw × 5 dirs |
| `characters/char_villager_a.png` | 2044×364 | P | 254,879 | 21,734 | 2.84 | 0.71 | 0.32 | customer (idle, walk, carry_walk, happy) |
| `characters/char_villager_b.png` | 2036×396 | P | 288,019 | 21,793 | 3.08 | 0.77 | 0.34 | customer |
| `characters/char_villager_c.png` | 2032×376 | P | 264,318 | 21,757 | 2.91 | 0.73 | 0.33 | customer; fallback clerk look |
| `villagers/vil_npc_grandpa.png` | 2028×600 | P | 411,761 | 44,569 | 4.64 | 1.16 | 0.52 | resident 1 (`npc_grandpa`) |
| `villagers3/vil_npc_aunt.png` | 2048×780 | P | 441,893 | 51,947 | 6.09 | 1.52 | 0.68 | resident 2 (`npc_aunt`; villagers3 replaces villagers) |
| `villagers/vil_npc_kid_girl.png` | 2048×776 | P | 554,546 | 57,094 | 6.06 | 1.52 | 0.68 | resident 3 (`npc_kid_girl`) |
| `ui/ui_icons.png` | 984×480 | RGBA | 288,918 | 4,508 | 1.80 | 0.45 | 0.20 | `ui_pad_input/output/cash/hire/unlock/upgrade` (192×96 iso diamonds), `ui_icon_coin`, `ui_joystick_base/knob`, `ui_ring_bg/fill`, `ui_arrow`, `ui_icon_lock`, `ui_icon_settings`, sound/music icons, `ui_bubble`, `ui_badge_max` |
| `ui/ui_coin_bar.png` | 200×64 | RGBA | 4,800 | – | 0.05 | 0.01 | 0.01 | coin HUD pill (9-slice) |
| `ui/ui_panel.png` | 96×96 | RGBA | 5,655 | – | 0.04 | 0.01 | 0.00 | panels (9-slice) |
| `ui/ui_button_blue.png` | 128×96 | RGBA | 5,779 | – | 0.05 | 0.01 | 0.01 | buttons (9-slice) |
| `ui/ui_button_green.png` | 128×96 | RGBA | 5,810 | – | 0.05 | 0.01 | 0.01 | buttons |
| `ui/ui_button_gray.png` | 128×96 | RGBA | 5,825 | – | 0.05 | 0.01 | 0.01 | buttons |
| `ui2/ui2_icons.png` | 992×276 | RGBA | 187,642 | 3,130 | 1.04 | 0.26 | 0.12 | `ui_pad_register` (the chief's reel/register pad), `ui_pad_build`, `ui_icon_zoom_in/out`, `ui_icon_map`, `ui_icon_people` |
| `fx/fx_particles.png` | 496×244 | RGBA | 57,523 | 2,592 | 0.46 | 0.12 | 0.05 | `fx_coin`, `fx_star`, `fx_glow`, `fx_smoke`, `fx_snowflake` (snowfall), `fx_spark` … (untrimmed squares, tintable white) |
| `fx/fx_poof.png` | 1536×128 | P | 29,200 | – | 0.75 | 0.19 | 0.09 | sheet 128², 12 f, 24 fps, once, anchor [0.5,0.6] |
| `fx/fx_coin_spin.png` | 960×96 | P | 28,671 | – | 0.35 | 0.09 | 0.04 | sheet 96², 10 f, 14 fps, loop |
| `fx/fx_sparkle.png` | 1536×128 | P | 23,896 | – | 0.75 | 0.19 | 0.09 | sheet 128², 12 f, 12 fps, loop |
| `fx/fx_fire.png` | 1536×128 | P | 41,294 | – | 0.75 | 0.19 | 0.09 | sheet 128², 12 f, 14 fps, loop, anchor [0.5,0.88] |
| `fx/fx_smoke_puff.png` | 1536×128 | P | 10,705 | – | 0.75 | 0.19 | 0.09 | sheet 128², 12 f, 14 fps, once, anchor [0.5,0.86] |
| `emotes/emotes.png` | 492×272 | RGBA | 143,061 | 4,398 | 0.51 | 0.13 | 0.06 | `emote_heart`, `emote_thumbs` (64×64 frames) |
| **total** | | | **7,849,282** | **324,406** | **65.1** | **16.3** | **7.3** | |

No Tier A file exceeds 2048 px; all are multiples of 4.

### 16.3 Tier B — needed to show a v4.x save's village (26 textures)

| file | px | mode | png bytes | json bytes | RGBA32 MiB | ASTC4×4 MiB | used for |
|---|---|---|---:|---:|---:|---:|---|
| `ground/ground_dirt.png` | 512×512 | P | 240,388 | – | 1.00 | 0.25 | forest / hunt floor |
| `ground/ground_farm.png` | 512×512 | P | 244,762 | – | 1.00 | 0.25 | farm / field2 floor |
| `ground/ground_rock.png` | 512×512 | P | 235,594 | – | 1.00 | 0.25 | mine / quarry floor |
| `ground/fish_school.png` | 256×128 | P | 7,780 | – | 0.12 | 0.03 | fish silhouettes in the sea |
| `buildings/bld_work.png` | **774**×2032 | P | 280,780 | 3,117 | 6.00 | 1.50 | `warehouse`, `station_toolsmith` (width not ÷4) |
| `buildings/bld_east.png` | 1440×752 | P | 171,121 | 2,277 | 4.13 | 1.03 | `station_cannery`, `shop_general(_front)` |
| `buildings/bld_buildings_2.png` | 1948×1200 | P | 278,387 | 2,395 | 8.92 | 2.23 | `house_a/b/c`, `watchtower`, `boathouse` |
| `buildings/bld_sites.png` | 1908×536 | P | 190,475 | 1,719 | 3.90 | 0.98 | `site_plot/foundation/scaffold_S/M/L` |
| `buildings/bld_items.png` | 480×52 | RGBA | 19,187 | 1,613 | 0.10 | 0.02 | `item_can`, `item_fish_big`, tools (Phaser EAGER key) |
| `buildings/boat_rowboat.png` | 2020×512 | P | 220,553 | 6,843 | 3.95 | 0.99 | rowboat |
| `buildings/boat_fishing.png` | 2028×1004 | P | 441,167 | 5,208 | 7.77 | 1.94 | fishing boat |
| `market/market_s2.png` | 884×340 | RGBA | 194,905 | 672 | 1.15 | 0.29 | shop stage 2 + `market_sled` |
| `market/market_s3.png` | 836×388 | RGBA | 243,175 | 677 | 1.24 | 0.31 | shop stage 3 + `market_sled_s3` |
| `market/market_s4.png` | 600×716 | RGBA | 323,853 | 686 | 1.64 | 0.41 | shop stage 4 + `market_sled_s4` |
| `bakery43/bakery43.png` | 1024×332 | RGBA | 273,984 | 1,895 | 1.30 | 0.32 | bakery cottage/stall, `farm43_*` |
| `characters/char_fisherman.png` | 2036×480 | P | 351,403 | 26,835 | 3.73 | 0.93 | hired worker |
| `characters/char_lumberjack.png` | 2044×480 | P | 365,889 | 26,829 | 3.74 | 0.94 | hired worker |
| `characters/char_farmer.png` | 2044×584 | P | 412,831 | 26,845 | 4.55 | 1.14 | hired worker |
| `characters/char_miner.png` | 2044×476 | P | 333,236 | 26,817 | 3.71 | 0.93 | hired worker |
| `characters/char_hunter.png` | 2032×480 | P | 400,770 | 26,985 | 3.72 | 0.93 | hired worker |
| `villagers3/vil_npc_chef.png` | 2048×1068 | P | 545,062 | 56,671 | 8.34 | 2.09 | grill operator (the `villagers2` copy is never used) |
| `villagers2/vil_npc_clerk_a.png` | 2028×748 | P | 405,531 | 48,538 | 5.79 | 1.45 | shop clerk |
| `villagers2/vil_npc_clerk_b.png` | 2028×740 | P | 384,961 | 48,530 | 5.72 | 1.43 | material clerk |
| `villagers2/vil_npc_porter_a.png` | 2036×924 | P | 538,093 | 49,173 | 7.18 | 1.79 | porter |
| `pets2/pets2_pet_dog.png` | 2048×388 | P | 374,806 | 44,019 | 3.03 | 0.76 | Nuri the dog (`moveIns.start`) |
| `ui7/ui7.png` | **458**×132 | RGBA | 47,253 | 826 | 0.23 | 0.06 | first-run tutorial hand / ripple / spotlight (width not ÷4) |
| **total** | | | **7,525,946** | **409,170** | **≈ 93.0** | **≈ 23.2** | |

*(Revision: 00 §5.3 moves the remaining villager looks to Tier A+ (M1a) and the closed exteriors of the town hall, rail station, restaurant, office, bank and depot plus `workers/wkr_*` to Tier B+ (M1b), because Phaser fetches them on demand and 26 of the 27 v4 fixtures contain some of them; 03 §5.10 needs them. What follows is the original list.)* Tier C (not in slice; placeholders acceptable): remaining villagers (`villagers*/vil_npc_*` 2028–2048 × 484–960 each), `workers/wkr_*` (10 × ≈2040×470), `town/*` (town hall `town_civic.png` 2008×2004, `town_park.png` 1588×268 for `deco_playground/fountain`, homes, shops, street, rails, trains), `office/office_bld.png` 1120×1080, `civic/civ_bank.png` 1780×740, `logistics/lgx_center_*`, `vehicles/veh_cargo_sleigh.png` 2000×884, `roads/*` (6 × 512² + `roads_decals.png` 1988×752), `chief2/char_player_b.png` 544×1492, `chief_fx/chief_fx.png` 728×880, `ui3/ui3_icons.png` 996×308, `ui5/ui5_icons.png` 490×798 (not ÷4), `life2/*`, `townfolk/*` and `officefolk/*` (tfatlas), `water/*`, `title*`.

### 16.4 Audio (OGG; 44.1 kHz; bytes of the `.ogg`)

| key | file | ch | dur s | bytes | volume | loop | where |
|---|---|---|---:|---:|---:|---|---|
| `bgm_village` | `audio/bgm_village.ogg` | 2 | 76.7985 | 1,025,802 | 0.376 | yes (loopSamples 3,386,816) | `Game.js` build |
| `amb_wind` | `audio/amb_wind.ogg` | 1 | 24.0007 | 212,764 | 0.193 | yes | ambience 0.5 |
| `amb_sea_waves` | `audio5/amb_sea_waves.ogg` | 1 | 41.9991 | 361,293 | 0.219 | yes (replaces `amb_sea`) | sea ambience 0.3 |
| `amb_fire` | `audio/amb_fire.ogg` | 1 | 20.0011 | 217,749 | 0.295 | yes | starts at 0 |
| `sfx_pickup` | `audio/sfx_pickup.ogg` | 1 | 0.17 | 4,153 | 0.617 | – | pick up item (pitch rises with stack) |
| `sfx_drop` | `audio/sfx_drop.ogg` | 1 | 0.151 | 4,682 | 0.776 | – | put down |
| `sfx_coin` | `audio/sfx_coin.ogg` | 1 | 0.7237 | 7,806 | 0.447 | – | coin |
| `sfx_coins_many` | `audio/sfx_coins_many.ogg` | 1 | 0.7911 | 11,446 | 0.473 | – | coin pile |
| `sfx_cash` | `audio/sfx_cash.ogg` | 1 | 0.8876 | 11,703 | 0.372 | – | sale |
| `sfx_customer_happy` | `audio/sfx_customer_happy.ogg` | 1 | 1.1827 | 10,741 | 0.422 | – | customer pays |
| `sfx_register` | `audio2/sfx_register.ogg` | 1 | 1.1024 | 13,472 | 0.327 | – | register |
| `sfx_sizzle` | `audio/sfx_sizzle.ogg` | 1 | 0.8913 | 12,954 | 0.292 | – | grill |
| `sfx_reel`, `sfx_splash` | `audio/sfx_reel.ogg`, `audio/sfx_splash.ogg` | 1 | 0.64 / 0.62 | 10,221 / 9,341 | 0.501 / 0.407 | – | fishing |
| `sfx_step_snow` (group of `_1.._3`) | `audio/sfx_step_snow_{1,2,3}.ogg` | 1 | 0.131 | 5,350 / 5,282 / 5,166 | 0.785 / 0.944 / 0.832 | – | footsteps |
| `sfx_pad_fill`, `sfx_unlock`, `sfx_click`, `sfx_error`, `sfx_whoosh` | `audio/…ogg` | 1 | 0.06 / 1.91 / 0.07 / 0.33 / 0.38 | 3,950 / 21,024 / 3,964 / 5,885 / 7,252 | 0.933 / 0.412 / 0.977 / 0.266 / 0.422 | – | pads, UI, trash |

### 16.5 Font & generated

| item | file | bytes |
|---|---|---:|
| Pretendard ExtraBold (800) | `tools/fonts/Pretendard-ExtraBold.ttf` | 2,669,648 |
| Pretendard Bold (700), Black (900) | npm `pretendard@1.3.9` `dist/public/static/alternative/` | ≈ 2.6 MB each |
| `fv_shadow`, `fv_white`, placeholders | generated (§14.1) | – |

---

## 17. Porting risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Default import (max 2048, NPOT rescale, mips) silently changes texture size → every frame rect/pivot wrong | §15.1 postprocessor; startup assert: `tex.width == png width` for every atlas (store PNG size in the catalog at import) |
| R2 | Rect y not flipped / taken from `meta.size` | Always `texH − y − h` with the imported height |
| R3 | Pivot taken from the trimmed rect centre or clamped to 0..1 → characters "bounce", props shift | §5.1 only; unit-test the three worked examples + one out-of-range frame (`pet_dog catch_S_3`) |
| R4 | Flipped decor with `ax ≠ 0.5` lands ≈ 90 px off vs Phaser | §5.3 offset |
| R5 | Code ports `displayWidth/Height` as `sprite.bounds` (trimmed) → occlusion boxes, hit areas, culling too small | expose and use `SourceSize` (§5.4) |
| R6 | BC7/DXT/ETC2 refuse dims not multiple of 4 (8 files, incl. `bld_work` 774 wide, `ui7` 458) → falls back to RGBA32 or warns | pad right/bottom with transparent pixels to ÷4 in the copy step (rects unaffected), or accept RGBA32 for the small ones |
| R7 | ASTC on palette-quantised art: halos at frame borders (blocks straddle the 4-px transparent gap), smeared small icons/text-like UI | compare against Phaser screenshots on device; ASTC 4×4 or RGBA32 for `ui_icons`, `ui2_icons`, `emotes` |
| R8 | Ground baking on CPU (Phaser bakes canvas chunks with `createPattern`/`drawImage`) needs `isReadable` (+100 % RAM for those textures) | bake on the GPU (RenderTexture) so ground textures stay non-readable; if CPU, set readable only for `ground/*`, `ui2/ground_road.png` |
| R9 | Linear colour space changes alpha blending and tints (baked soft shadows, `setTint(0x9fb3cc)` ghosts, pad tints) vs the browser's sRGB blending | decide colour space early: Gamma matches the browser exactly (check URP 2D 6.3 support/deprecation); Linear needs a visual pass |
| R10 | Premultiplied (Phaser WebGL) vs straight alpha (Unity) → dark fringes on soft edges | `alphaIsTransparency = true`; default sprite material |
| R11 | Missing glyphs `❄`, `🛷` render as boxes; TMP outline padding too small for 14-px strokes | §11 |
| R12 | WebP not importable | PNG conversion (§12) |
| R13 | v4.x saves reference late-fragment art (town hall, office, bank, depot…) → hard failures if lookups throw | registry never throws; placeholder + one warning (§14) |
| R14 | Manifest merge order differences (e.g. `villagers` vs `villagers3` chef/aunt) → wrong looks | merge in `FRAGMENTS` order; boot = later wins; late = first wins (§3.1); unit test: `atlases["vil_npc_aunt"].png == "villagers3/vil_npc_aunt.png"` |
| R15 | Looping music through MP3 (encoder delay 1105 samples) clicks/gaps | import OGG only; MP3-only `audio7` cut offline later |
| R16 | Texture-budget numbers copied from Phaser (300/455 MiB of RGBA source-sum) are meaningless with ASTC | re-measure on device (§13.4) |
| R17 | `Perf.texScale` (중/저 presets) cannot be reproduced without mipmaps | variant bundles or mip-limit groups later (§13.4) |
| R18 | Sprite.Create churn (creating per frame per tick) | cache per `(atlas, frame, anchor)`; create lazily; never destroy in the slice |

---

## 18. Phaser source map (what each part came from)

| Topic | File : lines |
|---|---|
| Fragment lists, lazy/late/unused rules | `src/core/Assets.js:11-62` |
| Anim fallback chain, character defaults | `src/core/Assets.js:74-118` |
| Manifest merge (boot) | `src/core/Assets.js:134-196` |
| Packed pages | `src/core/Assets.js:198-274` |
| Lazy predicate, prefetch | `src/core/Assets.js:280-310` |
| Late fragments (`loadFragment`, `mergeLate`) | `src/core/Assets.js:312-443` |
| tfatlas install | `src/core/Assets.js:445-466` |
| Queueing, lazy order, arrivals | `src/core/Assets.js:468-570` |
| Audio queue, audio sprites, unused/deferred audio | `src/core/Assets.js:592-653` |
| Load errors / retries | `src/core/Assets.js:655-684` |
| finalize, sheet/sprite/character anims | `src/core/Assets.js:686-831` |
| Lookups (`sprite`, `has`, `pick`, `apply`, `image`, `source`, `nine`) | `src/core/Assets.js:833-929` |
| Boot / Preload scenes | `src/scenes/Boot.js:6-14`, `src/scenes/Preload.js:28-71` |
| After-title loading + gate | `src/scenes/Game.js:417-507`, re-skin `1242-1262` |
| Placeholders, shadow, white | `src/core/Placeholders.js:60-394` |
| Residency (budget, areas, eviction) | `src/core/Residency.js:1-130, 167-301, 797-851` |
| Presets & texScale | `src/core/Perf.js:20-44, 270-283, 384-470` |
| Budget constants | `src/data/balance.js:484-488`; camera zoom `38-48` |
| Directions & mirror | `src/core/Iso.js:8-23`, `src/entities/Character.js:77-80, 197-207` |
| Audio playback, loop trim | `src/core/Audio.js:57-110, 201-221` |
| Ground texture use | `src/systems/Ground.js:17, 164-200, 551, 580, 616, 670-733, 816` |
| Asset contract (projection, PPU, manifest format) | `docs/CONTRACT.md` §1–§8; per-fragment `conventions` blocks in each `manifest.json` |
| Atlas packer (trim border, padding, width) | `tools/pack_utils.py:34-72` |
| Font provenance | `tools/fonts/README.txt`; font stack `src/data/strings.js:1428` |
| WebP conversion (web build only) | `tools/build/webp_assets.py` |
| Texture budget measurements | `docs/build_reports/texbudget_v4.json`, `tools/test/texbudget.mjs` |
