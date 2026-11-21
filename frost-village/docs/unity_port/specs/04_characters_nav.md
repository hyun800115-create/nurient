# 04 · Characters and navigation: chief, residents, walkers, carry stack, collision, roads, navigator, bubbles (Unity port spec)

Source: Phaser 3.90 game at `/home/user/nurient/frost-village` (v4.3, plain JS).
Target: Unity 6.3 LTS, URP 2D, C# 9, Android portrait.
Reader: a C# engineer who does not read JavaScript. Every number was copied from the code or the manifests. File and
line references are only there for audit.

Tags: **SLICE** = needed for the vertical slice. **SLICE-opt** = cheap and visible in the opening, but not required for
go/no-go. **LATER** = after the slice. **DROP** = a Phaser workaround that Unity does not need.

Depends on `01_core_view.md` (world px with y DOWN, `WorldSpace.ToUnity`, `JsRound`, `gdist`, `dirFromVec`, the
input vector, the tick order, smoothed `deltaMs`) and `02_world_ground.md` (colliders of static props, walkable
rects, the road-graph data in `02_world_ground_static.json → roads`). This spec owns **the solvers and the
behaviour**. Those specs own the data they place.

---

## 0. Decisions (read first)

| # | Decision | Why |
|---|---|---|
| C1 | Every character keeps its simulation state in **world px, y down** (`x, y, vx, vy, dir`). The GameObject root is placed at `ToUnity(x, y − liftY)` once per tick, in `Sync()`. | All speeds (255, 70, 120 px/s), radii (16, 12, 13) and route data are in px. See 01 D1. |
| C2 | **Do not use Mecanim or Animator Controllers** for characters. Use a small custom `FramePlayer` driven from the game tick (§4.5). It needs frame lists per (anim, render dir), fps, loop or once, timeScale, keep-phase-on-turn and a per-frame callback. | 5 dirs × 4–20 anims × ~40 characters. Phaser semantics (keepFrame on turns, impact frames, fallback chain, nearest dir) are code, not state machines. |
| C3 | Import the **original per-character atlases** (`assets/characters`, `villagers`, `villagers2`, `villagers3`, `pets2`, `workers`, `deck43`, `chief2`) with an editor importer that reads the Phaser JSON-hash files. **Ignore `assets/_packed`** (core/social page split, DROP). | `_packed` is a Phaser memory trick (Residency). Frame names are identical. |
| C4 | Sprite pivot = the manifest `anchor` measured on the **untrimmed** frame (formula §4.3). **Corrected (revision 2):** Phaser mirrors a flipped picture *inside its frame box* (`Game.js:573`; batch offset `−realWidth + 2·displayOriginX`), Unity's `flipX` mirrors about the pivot; send every character flip through `WorldImage.flipShift = scaleX·srcW·(1 − 2·ax)` like props (0 for the 8 character manifests, all ax = 0.5). | The atlases are trimmed. A pivot at the trimmed rect centre puts feet in the wrong place. |
| C5 | **SUPERSEDED by 00 A3/§4.1** (exact rank on the Default layer; body, carried items, halo glow and shadow are separate sort keys, no SortingGroup per character). Original text: Each character root has a **`SortingGroup`** on the `World` layer. Its order comes from the character depth (§15). Body, carried items and halo glow are children with fixed relative orders. The **shadow is NOT in the group**; it goes on the ground band. | Phaser uses sub-pixel depth offsets (stack items +0.0005·i, ±0.5 front/behind) that an int16 order cannot hold. |
| C6 | Port `Collision`, `Roads`, `Paths` (grid A*), `moveAgent` and `Resident.stepMove` as **plain C# classes**, with no MonoBehaviour, no Unity physics and no NavMesh. | They must give the same routes and stops. Unity physics would push characters differently. The routes are cheap (61 nodes, ≤ 26 000 grid cells). |
| C7 | Keep `Math.random()` behaviour (residents choose places, delays and speeds at random). Use one `System.Random` per system, with an injectable seed for tests. | Behaviour is not deterministic in Phaser either. Tests need seeds. |
| C8 | Phaser timers (`time.delayedCall`, tweens) used by characters become a **game-time scheduler** that the tick advances. Do not use coroutines with real time. | They must pause and step with the game (admin ×2/×4 later, app pause). |

---

## 1. Scope

| Feature | Tag | Notes |
|---|---|---|
| Character defs from manifests, merge order, defaults, fallback chain, nearest dir | SLICE | §4 |
| Atlas importer (trimmed frames → pivot), `FramePlayer` | SLICE | §4.3, §4.5 |
| Chief: stick movement, collision, facing, walk/carry anims, timeScale, footsteps | SLICE | §6 |
| Chief: auto-gather at his landing (deck "net" node), reel/fish anim, impact → fish fly to him | SLICE | §6.4; the deck itself belongs to the opening-loop spec |
| Chief: working the grill's operator spot (`operating`, give anim, chiefDir) | SLICE | §6.5; the spot belongs to the opening-loop spec |
| Carry stack on the head: layout, sway, bob, hop, flights in/out, MAX text, full warning | SLICE | §7 |
| Carry pill (짐 이름표), row 1 only | SLICE | §8; row 2 needs the navigator (LATER) |
| Chief halo ring + back glow | SLICE-opt | §9; motes, pin, notch, rank band LATER |
| Collision solver + chief-only landing land | SLICE | §10. The spawn (1130, 412) is **inside** the landing land |
| `moveAgent` steering (separation, side slide, settle, detour, unseen teleport) | SLICE | §11; customers and residents use it |
| Roads graph A*, route/routeOpen/leg/straight/detour, Paths grid A* | SLICE | §12; rooms (walled buildings) LATER |
| Residents: new-game cast, spawn, LOD, wander/stay jobs, sit, warm, read, shiver, wave at chief | SLICE | §13; "2–3 residents walk" |
| Dog roaming job | SLICE-opt | §13.8; DogPlay (whistle/treat/fetch) LATER |
| Emote bubbles | SLICE-opt | §14 |
| Chat bubbles with text, ChatEvent, tap reaction with name + line | LATER (opt) | needs `strings.js LINES` and the voice system |
| Snowball fight, tag, concert, snowman, party, cheer | LATER | §13.10 summary only |
| Workers, porters, operators, followRoute | LATER | §16 constants |
| Customers' movement | SLICE | the shop spec owns queues; §16 gives what they use from here |
| Tap-to-walk (`GoalWalk`) | see 01 §4.8 + §17 here | **Phaser disables it until `hire_fisherman`** (§17) |
| Navigator 길 안내 (route line, chevron, badge, chip) | LATER | §18; Phaser hides it during the tutorial, so it is never seen in the slice's new game |
| Seated chief (office), dog actions, 관망 pilot, resident follow, roster window, paper dolls (townfolk), animals, train visitors | LATER | |
| Residency (texture paging), reskin when an atlas arrives, placeholders, Culler, baked stacks (StackBaker) | DROP | Unity has all art loaded. Keep the fallback chain for missing anims only |

---

## 2. Sources (Phaser files and line ranges)

| File | Lines | What |
|---|---|---|
| `src/entities/Character.js` | 1–207 | base: sprite, shadow, play/face, nearestDir, carry offset, sync, impact |
| `src/entities/Player.js` | 1–248 | chief update, gathering, operating, seat, impact, warnFull |
| `src/entities/Resident.js` | 1–229 | resident primitives, LOD, stepMove |
| `src/entities/ItemStack.js` | 1–350 | carried / pad stacks |
| `src/systems/VillageLife.js` | 1–1090 (events 1091–1605) | residents' brain, areas, seats, jobs, greet, tap |
| `src/systems/Bubbles.js` | 1–165 | chat and emote bubbles |
| `src/systems/Collision.js` | 1–256 | obstacles, walkable land, chief land |
| `src/systems/Roads.js` | 1–407 | road graph, A*, routes, detour |
| `src/systems/Paths.js` | 1–204 | segClear, grid A*, rooms |
| `src/systems/Navigator.js` | 1–704 | 길 안내 |
| `src/systems/carry/CarryPill.js` | 1–362 | 짐 이름표 |
| `src/entities/ChiefAura.js` | 1–328 | halo |
| `src/systems/goals/GoalWalk.js` | 1–319 | tap-to-walk (see 01 §4.8) |
| `src/scenes/Game.js` | 155–200 (roads hooks), 247–257 (spawn), 312–334 (padSpots, life), 590–608 (routeWallAt), 1822–1866 (unstick, freeSpot), 1912–1960 (followRoute), 1984–1999 (isOnScreen, unseen), 2020–2091 (findGatherable, moveItem, spawnItemTo), 2093–2157 (moveAgent), 2170–2240 (tick), 2605 (save), 2685 (restore stack) | glue |
| `src/core/Assets.js` | 73–118 (fallback, defaults), 155–175 (merge), 723–830 (charDef, buildCharacter, resolveAnim), 884–889 (apply) | character defs |
| `src/core/Iso.js` | 1–68 | DIRS8, DIR_BASE/FLIP, dirFromVec, gdist |
| `src/systems/Effects.js` | 19, 45–68, 96–103, 159–180 | dust preset, item pool, fly |
| `src/core/Placeholders.js` | 384–389 | `fv_shadow` |
| `src/entities/FishingDeck.js` | 103–200, 367–372, 391–425 | chief landing land, node contract |
| `src/systems/Labour.js` | 58–160 | OperatorSpot (chief side) |
| `src/entities/Seller.js` | 558–727 | Customer |
| `src/data/world.js` | 121–127, 291–305, 410–480, 841–915 | shore, spawn, deck, roads, life |
| `src/data/balance.js` | 51–75, 153–175, 185–208, 601–614, 717 | player, upgrades, workers, customers, population, life, aura, nav, deck |
| `docs/CONTRACT.md` §3, `docs/CONTRACT_VILLAGERS.md` §A/C | | frame naming, anchors |
| manifests | `assets/{characters,villagers,villagers2,villagers3,pets2,workers,deck43,chief2,emotes,life_props}/manifest.json` | defs |

---

## 3. Shared conventions (summary; full text in 01 §1)

```
DIRS8      = [E, SE, S, SW, W, NW, N, NE]                 // index 0..7
DIR_BASE   = [E, SE, S, SE, E, NE, N, NE]                 // rendered direction per index
DIR_FLIP   = [no, no, no, yes, yes, yes, no, no]          // flipX per index
dirFromVec(vx, vy) = mod8( JsRound( atan2(vy*2, vx) / (PI/4) ) )      // px, y down
gdist(a, b) = sqrt( (ax-bx)^2 + ((ay-by)*2)^2 )                       // "ground distance"
```

Sector edges: E/SE at `vy/vx = 0.2071`, SE/S at `vy/vx = 1.2071` (so `(1, 0.21)` is SE and `(1, 0.2)` is E).

---

## 4. Character art and definitions

### 4.1 Frame naming and atlases (SLICE)

| Thing | Convention |
|---|---|
| Frame name | `{anim}_{dir}_{i}`, for example `walk_SE_3`. `i` starts at 0 and has no padding. `dir` ∈ {S, SE, E, NE, N} |
| Per-anim override | an anim may name its own `frameName`, e.g. deck43: `player/{anim}_{dir}_{i}` and `fisherman/...` (several characters share atlas `deck43_ch`) |
| Source frame | 128 × 128 (deck43 fishers 160 × 160). Trimmed in the atlas (`spriteSourceSize`, `sourceSize`) |
| Anchor | `[0.5, 0.8125]` = pixel (64, 104) of the 128 frame (feet). For 160 frames (80, 130) |
| Mirrors | SW ← SE, W ← E, NW ← NE with flipX |
| Social anims | most villagers have talk/laugh/wave/… only in **S, SE, E** (see `dirs` per anim) |
| Atlas files | `char_<key>.png/json` (characters), `vil_<key>` (villagers*, pets), `pets2_pet_dog`, `wkr_<type>_<b|c>` (workers), `deck43_ch`, `char_player_b` (chief2) |
| Phaser anim key | `<charKey>:<anim>:<renderDir>` (DROP the string; use a dictionary) |
| Items | `item_*` in `props_items`, 72 × 72, anchor (0.5, 0.75), `stackStep` px (e.g. item_fish_raw 11, item_fish_cooked 9, item_log 13, item_plank 8, item_bread 13, item_wheat 11, item_ore 12, item_ingot 9, item_meat_raw 11, item_meat_cooked 11; default 10) |
| Emotes | `emote_*` in atlas `emotes`, 64 × 64, anchor centre; `ui_emote_bubble` 92 × 106 anchor (0.5, 0.9198), `contentCenter` (0, −54.5); `ui_chat_bubble` nine-slice L22 R22 T22 B30 (min 80 × 56); `ui_chat_tail` 44 × 40 anchor (0.5, 0) |

Example check (char_player.json): 330 frames: idle 20, walk 40, carry_idle 20, carry_walk 40, chop 40, mine 40, harvest 30, pet 30, give 30, throw 40.

### 4.2 Definition data shape and merge rules (SLICE)

```csharp
public sealed class AnimDef {
    public int Frames;                 // frames per dir
    public float Fps;                  // default 10 (8 for sprite anims); placeholder art 4 (DROP)
    public int Repeat = -1;            // -1 loop, 0 play once and stop on the last frame
    public int? ImpactFrame;           // 0-based
    public Dictionary<string, Vector2> ImpactPoint;   // per render dir, px from the anchor (dx, dy)
    public string[] Dirs;              // render dirs that exist; null = the character's Dirs
    public string Atlas, FrameName;    // overrides (deck43, chief2)
    public Dictionary<int, float> FrameHoldMs;        // extra ms on frame i (chief2 only, LATER)
    public float RepeatDelayMs;                       // chief2 only, LATER
    public Dictionary<string, Vector2[]> TipPoints;   // deck43 'fish': rod tip per frame (opening-loop spec)
}
public sealed class CharacterDef {
    public string Key, Atlas, Kind = "human", Role, CarryStyle;   // Kind: human|villager|pet|animal; Role: kid|teen|adult|elder|pet
    public Vector2Int FrameSize = new(128, 128); public Vector2 Anchor = new(0.5f, 0.8125f);
    public string[] Dirs = { "S", "SE", "E", "NE", "N" }; public string FrameName = "{anim}_{dir}_{i}";
    public Dictionary<string, AnimDef> Anims;
    public Dictionary<string, (float dx, float dy, bool behind)> CarryPoint;  // per render dir
    public float HeadTop = -84; public Vector2 Shadow = new(46, 18);
    public Dictionary<string, string> Name; public string[] Traits; public string Portrait;
    public Dictionary<string, HashSet<string>> RenderDirsOf;      // built at import (Phaser _dirs)
}
```

Defaults (`COMMON_CHAR`, Assets.js 113–118), applied under the manifest:
`frameSize 128×128, anchor (0.5, 0.8125), dirs [S,SE,E,NE,N], frameName '{anim}_{dir}_{i}', shadow [46,18], headTop −84,
kind 'human', carryPoint {S:[0,−31,false], SE:[12,−34,false], E:[17,−40,false], NE:[12,−46,true], N:[0,−48,true]}`.
Default anims if the manifest lacks them: `idle 4f/6fps loop, walk 8/12, carry_idle 4/6, carry_walk 8/12`; player adds
`chop 8/14 impact 5, mine 8/14 impact 5, harvest 6/10 impact 3`; workers add `work 8/14` (impact fisherman 4,
lumberjack 5, farmer 4, miner 5, hunter 5).

Merge order (Assets.mergeManifests): boot fragments in this order, **a later fragment replaces a key wholesale**:
`characters, props, fx, ui, ground, audio, villagers, life_props, emotes, villagers2, villagers3, buildings, ui2, audio2,
workers, pets2, water, audio5, ui7, market, deck43, bakery43`. So `villagers3` wins for npc_chef / npc_aunt
(adds operate, knead, oven_in, oven_out) and `pets2` wins for pet_dog. A character with `extends: <base>` (deck43
`player_deck43`, chief2 `player_b`) **adds** its anims to the base, each anim remembering its own atlas; it never
replaces an anim the base already has. `chief2` is a late fragment; in Phaser it adds sit_*, doze, talk, wave,
warm_hands, cheer to the player (S/SE/E only; LATER).

`RenderDirsOf[anim]` = render dirs (from `anim.Dirs` or `def.Dirs`) for which frame `0..Frames-1` exist. Missing dirs
are skipped.

### 4.3 Pivot of a trimmed frame (SLICE)

For a frame with `spriteSourceSize (sx, sy, sw, sh)` and `sourceSize (W, H)` and anchor `(ax, ay)` (y down):

```
pivotPx.x = ax*W - sx                       // from the trimmed rect's left edge
pivotPx.y = (sy + sh) - ay*H                // from the trimmed rect's BOTTOM edge (Unity y up)
pivotNorm = (pivotPx.x / sw, pivotPx.y / sh) // may be outside 0..1; Unity accepts a custom pivot outside the rect
PPU = 64
```

Check: `char_player walk_S_0`: sss (43, 19, 49, 91), W = H = 128 → pivotPx (21, 6), pivotNorm (0.4286, 0.0659).

**Corrected (revision 2):** Phaser mirrors the picture inside its frame box (`Game.js:573`), not about the anchor;
Unity `SpriteRenderer.flipX` flips about the pivot. The difference is `srcW·(1 − 2·ax)·scaleX`, applied as
`WorldImage.flipShift` (03 S4/§2.3). It is 0 for every current character (ax = 0.5), but keep the shift in the code path.

### 4.4 Resolving the anim and the direction (SLICE)

```
ANIM_FALLBACK = {   // Assets.js 73–95: first one the character really has, else 'idle'
  carry_idle:[idle], carry_walk:[walk], run:[walk], skate:[run,walk], happy:[idle], work:[idle], chop:[idle], mine:[idle],
  harvest:[idle], talk:[idle], laugh:[happy,idle], wave:[happy,idle], surprised:[idle], angry:[idle], sad:[idle], throw:[idle],
  hit:[surprised,idle], dance:[happy,idle], sit:[idle], perform:[talk,idle], shiver:[idle], serve:[talk,idle],
  bow:[wave,happy,idle], salute:[wave,idle], fall:[sit,hit,idle], loaf:[sit,idle],
  sit_idle:[sit,idle], sit_write:[sit_idle,sit,idle], sit_read:[sit_idle,sit,idle], sit_read_in:[sit_read,sit_idle,idle],
  sit_read_loop:[sit_read,sit_idle,idle], sit_eat:[sit_idle,sit,idle], doze:[sit_idle,sit,idle], warm_hands:[idle],
  cheer:[wave,happy,idle], reel:[harvest,idle], fish:[harvest,idle], fsit_cast:[work,idle], fsit_wait:[idle],
  fsit_bite:[work,idle], fsit_reel:[work,idle], operate:[work,idle], pet:[idle], knead:[operate,idle],
  oven_in:[operate,idle], oven_out:[operate,idle], give:[idle], eat:[sit,happy,idle], roll:[sit,happy,idle],
  beg:[sit,happy,idle], run_ball:[run,walk], catch:[happy,idle], trick:[happy,idle] }
resolveAnim(def, name) = def has frames for name ? name : first of ANIM_FALLBACK[name] it has : 'idle'

nearestDir(d, dirs, flipped):            // Character.js 198–207
  for off in 1..4: a = (d+off)%8; b = (d-off+8)%8
     okA = DIR_BASE[a] in dirs; okB = DIR_BASE[b] in dirs
     if okA && okB: return DIR_FLIP[a] == flipped ? a : b        // a tie keeps the current mirror side
     if okA: return a;  if okB: return b
  return d
```

Examples: facing NE (7) with a wave that has only S/SE/E → E (0). Facing N (6) with S/SE/E → E (0) if the sprite is
not flipped, W (4) if it is.

### 4.5 `Play`, `Face` and the frame player (SLICE)

```
Character.Play(name, force=false, keepFrame=false):              // Character.js 65–96
    res  = resolveAnim(def, name); dirs = RenderDirsOf[res]
    if dirs not empty && DIR_BASE[dir] not in dirs: dir = nearestDir(dir, dirs, body.flipX)   // dir changes for good
    body.flipX = DIR_FLIP[dir]
    key = (res, DIR_BASE[dir])   (dirs empty → ('idle','S'))
    if !force && key == animKey && name == animName: return        // calling every tick does not restart
    prevName = animName; animName = name; animRes = res; animKey = key
    if keepFrame && prevName == name && player.HasAnim: player.Play(frames[key], startFrame = min(player.Index, n-1))
    else player.Play(frames[key], startFrame = 0)

Character.Face(dx, dy): if |dx|+|dy| < 0.001 return; d = dirFromVec(dx, dy); if d != dir { dir = d; Play(animName, false, keepFrame: true) }
Character.FaceTo(x, y) = Face(x - this.x, y - this.y)
Character.Locomotion(moving) = Play(moving ? (carrying ? "carry_walk" : "walk") : (carrying ? "carry_idle" : "idle"))
   (Resident overrides: Play(moving ? moveAnim : idleAnim); see §13.3)
```

`FramePlayer` (Phaser AnimationState semantics):

```
Play(frames, fps, repeat, startFrame): idx = startFrame; acc = 0; playing = true; nextTick = 1000/fps + hold[idx]
Tick(deltaMs):                                // deltaMs = the smoothed, UNclamped loop delta (01 §5.1), × timeScale
   if !playing return
   acc += deltaMs * timeScale
   while playing && acc >= nextTick:
       acc -= nextTick
       if idx < n-1: idx++
       else if repeat == -1: idx = 0          // (repeatDelay: LATER)
       else { playing = false; break }        // repeat 0: stays on the last frame; IsPlaying = false
       nextTick = 1000/fps + hold[idx]
       OnFrameChanged(idx)                    // ANIMATION_UPDATE: fires for every advanced frame, NOT for the first frame shown by Play()
```

Impact (Character._onFrame): `if (onImpact != null && def.Anims[animRes].ImpactFrame == idx) onImpact(this)`.
Impact point: `ImpactPoint[DIR_BASE[dir]]` (default `(14, −30)`), dx negated when flipped:
`(x + (flip ? −dx : dx), y + dy)`.

Anim table for the slice cast (from the manifests; dirs = all 5 unless noted):

| Character | Anims (frames / fps / repeat) |
|---|---|
| player (char_player) | idle 4/6 loop, walk 8/12, carry_idle 4/6, carry_walk 8/12, chop 8/14 imp 5, mine 8/14 imp 5, harvest 6/10 imp 3, pet 6/8, give 6/10 **once** imp 3, throw 8/14 once imp 4. headTop −81, shadow 46×18 |
| player + deck43 | reel 6/10 once imp 3 (NE only), fish 6/10 loop imp 3 (NE only), impactPoint NE (−2, −78), frames `player/{anim}_NE_{i}` in `deck43_ch` |
| npc_grandpa (elder) | idle, walk, carry_walk; happy 6/10, talk 8/10, laugh 6/10, wave 6/10, surprised 6/12 once, angry 6/10, sad 4/6, hit 6/12 once, sit 4/4, shiver 4/12 (S/SE/E). headTop −71 |
| npc_aunt (adult, villagers3) | as grandpa + dance 8/10, knead 8/10 (SE), oven_in / oven_out 6/10 once (E). headTop −89 |
| npc_kid_girl, npc_kid_prankster (kid) | idle, walk, run 8/16, carry_walk; happy, talk, laugh, wave, surprised, angry, sad, throw 8/14 once, hit, dance, shiver (S/SE/E). headTop −67 (girl) |
| pet_dog (pets2) | idle, walk, run 8/16, run_ball 8/16; sit 4/4, happy 6/10, eat 6/8, roll 6/8, beg 6/8, catch 6/12 once, trick 8/12 once (S/SE/E). headTop −40, shadow 54×23 |
| villager_a/b/c (customers) | idle, walk, carry_walk, happy 6/10. headTop −81 / −90 / −84. **Revision:** customers also take every loaded villager look (00 A23, Tier A+), using the same four anims |

---

## 5. Character base (`Character.js`) — SLICE

### 5.1 State

```csharp
public class CharacterSim {
    public float X, Y, Vx, Vy; public int Dir = 2 /*S*/; public float Radius = 15;
    public string AnimName = "", AnimRes = ""; public (string anim, string dir) AnimKey;
    public float WalkT /* = Random[0,10) */; public bool Alive = true;
    public string CarryMode;          // null → head (BALANCE.player.carryOnHead = true), "front", "back"
    public ItemStack Stack;           // scale = carryScale (0.62), sway = true, max = capacity ?? 99
    public float LiftY, InDepth, ShadowDy; public Action<CharacterSim> OnImpact;
    public float HeadTop => Def.HeadTop;          // default −84
    public bool Carrying => Stack.Count > 0;
}
```

Construction: shadow = `fv_shadow` image at depth SHADOW, display size `(shadow.x·1.15, shadow.y·1.3)` (player 52.9 × 23.4,
origin centre). Then `Play("idle", force)` and `Sync(0)`.

`fv_shadow` (generated, bake to a PNG): 64 × 32, an ellipse filling the canvas, radial gradient from the centre:
stop 0 `rgba(40,55,90,0.42)`, stop 0.6 `rgba(40,55,90,0.22)`, stop 1 `rgba(40,55,90,0)`.

### 5.2 Carry offset (Character.carryOffset)

```
HEAD_DX = { S:0, SE:3, E:5, NE:3, N:0 }
mode = CarryMode ?? (BALANCE.player.carryOnHead ? "head" : "front")        // carryOnHead = true
if mode == "head" && kind not in {animal, pet}:
    hx = HEAD_DX[DIR_BASE[dir]];  return (dx = flip ? -hx : hx, dy = HeadTop + 4, behind = false)
cp = Def.CarryPoint[DIR_BASE[dir]] ?? (0, -34, false)
return (flip ? -cp.dx : cp.dx, cp.dy, cp.behind)
```

The chief: `dy = −81 + 4 = −77`. Customers and gatherer workers use head mode too (no CarryMode). Haulers (porters) use "back" when the def says
`carryStyle: "back"`, else "front".
(The "hands busy → backpack" branch only runs when carryOnHead is false. Keep it, but it is dead in v4.3.)

### 5.3 `Sync(dt)` — once per tick, after moving (Character.js 139–172)

```
d = Y; lift = 0
foreach interior in gs.Interiors: q = interior.Occupy(this); if q != null { d = q.depth; lift = q.lift; break }
InDepth = d
LiftY = (lift == LiftY || !(dt > 0)) ? lift : LiftY + (lift - LiftY) * min(1, dt*14)
body position = (X, Y - LiftY); sorting depth = d                  // §15
shadow position = (X, Y + 1 - LiftY + ShadowDy)
(dx, dy, behind) = CarryOffset()
if Stack.Count == 0:
    cdx = dx; cdy = dy; Stack.Bx = X + dx; Stack.By = Y + dy - LiftY        // the empty stack's base stays on him
else:
    moving = Vx*Vx + Vy*Vy > 100
    if moving: WalkT += dt*12
    bob = moving ? -2*|sin(WalkT)| : 0.6*sin(nowMs/400)
    if cdx unset || dt <= 0 { cdx = dx; cdy = dy } else { k = min(1, dt*16); cdx += (dx-cdx)*k; cdy += (dy-cdy)*k }
    sd = (d != Y) ? d + (behind ? -2e-6 : 2e-6) : Y + (behind ? -0.5 : 0.5)
    Stack.Layout(X + cdx, Y + cdy + bob - LiftY, sd, Vx, dt, WalkT)
```

Interiors in the slice: only **FishingDeck** (the chief on his landing planks gets `{depth: y, lift: 8}`; fishers on the
deck LATER). Contract: `Occupy(CharacterSim) → (float depth, float lift)?`. Other interiors (office, bank, depot,
stage-4 shop) are LATER.

`Destroy()`: if the stack holds items, release them to the item pool (they vanish).

---

## 6. The chief (`Player.js`) — SLICE

### 6.1 Constants

| Name | Value | Source |
|---|---|---|
| radius | 16 | Player ctor |
| speed | `255 × speedMult`, speedMult = `[1.0, 1.15, 1.3, 1.45, 1.6][upgrade level]` | balance player.speed, upgrades.speed |
| verticalFactor | 0.74 | balance |
| acceleration | `k = min(1, dt·16)` per tick toward the target velocity | |
| walk anim timeScale | `clamp(hypot(vx,vy)/210, 0.6, 1.35)` while moving, 1 when still | |
| capacity | `[6, 10, 14, 18, 22, 26][level]` | upgrades.capacity |
| carryScale | 0.62 | balance |
| gatherRange | 78 (gdist) | |
| stillDelay | 0.08 s | |
| moving threshold | `input.Mag > 0.05` | |
| footstep period | `stepT -= dt·(0.6 + mag·0.6)`; on ≤ 0: `stepT = 0.27`; starts at 0 (first step at once) | |
| footstep fx | `dust` burst ×1 at `(x + rand(−5, 5), y − 2)`; sfx `sfx_step_snow` vol 0.32, rate 0.9–1.1, throttle 120 ms | |
| dust preset | sprite fx_dust, size 22 px, tint random of 0xC9D6E8 / 0xAFC3DC, speed 8–30, angle 180–360°, gravityY −10, life 300–520 ms, scale ×1 → ×1.6, alpha 0.75 → 0, depth DUST (−10900) | Effects.js 19 |
| full warning | toast `bagFull`, sfx_error vol 0.4, then silent for 2.5 s (not while the 관망 pilot drives) | |

### 6.2 Per-tick update (Player.update, Player.js 69–193)

```
Update(dt, inp):                                   // inp = Input state (01 §4.5)
  fullWarnT -= dt
  if Seat != null: ... (LATER: office seat; any inp.Mag > 0.05 → StandUp: y += standDy (18))
  if inp.Mag > 0.05:                               // ---- MOVING
      sp = speed; k = min(1, dt*16)
      Vx += (inp.X*sp - Vx)*k
      Vy += (inp.Y*sp*0.74 - Vy)*k
      body.timeScale = clamp(hypot(Vx,Vy)/210, 0.6, 1.35)
      p = (X + Vx*dt, Y + Vy*dt); collision.Resolve(ref p, 16, chief: true); (X, Y) = p        // §10.4
      stillT = 0; node = null; reelT = 0
      if action != null { a = action; action = null; a.onCancel?.Invoke() }       // LATER (dog play)
      operating = null; opSpot = null
      Face(Vx, Vy); Locomotion(true)
      footsteps (§6.1)
  else:                                             // ---- STILL
      Vx = Vy = 0; body.timeScale = 1; stillT += dt
      if node != null && node.Kind not in {tree, rock, wheat, net}:               // moving targets (animals, LATER)
          if (node.X-X)^2 + ((node.Y-Y)*2)^2 > (78*1.5)^2: node = null
      if node != null && (!node.Ready() || Room <= 0) { if Room <= 0 WarnFull(); node = null }
      if node != null && !pickup.KeepGathering(this): node = null                  // tutorial forces 'auto' → true
      if node != null && FishCapped(node): node = null
      if node == null && stillT > 0.08 && !gs.PlayerOnPad /* last tick's value */:
          n = gs.FindGatherable(X, Y, 78)                                           // §6.4
          if n != null && !FishCapped(n) && pickup.MayGather(n, this):
              if Room <= 0: WarnFull()
              else if gs.StationBlocked(n.Item): gs.FullToast()                     // opening-loop spec
              else { node = n; if n.CanReel { n.Reel(this); reelT = max(0.1, BALANCE.deck.reelS /*0.6*/) } }
      op = operating; operating = null              // set by OperatorSpot.Update in the PREVIOUS tick (one-tick lag)
      if action != null && now < action.until: node = null; Play(action.anim)       // LATER
      else if action != null: { a = action; action = null; a.onEnd?.Invoke(); Locomotion(false) }
      else if op != null:                                                            // §6.5
          node = null; opSpot = op; op.FaceFor(this)
          wa = op.Station.Working ? op.ChiefAnim() : (Carrying ? "carry_idle" : "idle")
          Play(wa); if op.Station.Working && !body.IsPlaying: Play(wa, force: true)  // a one-shot 'give' loops
      else if node != null:
          opSpot = null
          fp = node.FacePoint(this); if fp != null FaceTo(fp) else FaceTo(node.X, node.Y)
          if reelT > 0: reelT -= dt
          if node.ChiefAnim != null: Play(node.ChiefAnim)        // deck landing: "fish"
          else if reelT > 0: Play("reel") else Play(node.PlayerAnim)
      else:
          opSpot = null
          if deck.HoldsChief(this): fp = deck.FacePoint(); FaceTo(fp); Play(deck.ChiefAnim ?? "idle")   // line out, no fish yet
          else Locomotion(false)
  Sync(dt)

Room = capacity - Stack.Count - Stack.Incoming
FishCapped(n) = n.Kind == "net" && onboard.FishCap() is finite && Stack.CountWithIncoming(n.Item) >= onboard.FishCap()
                // Onboarding.fishCap(): act1 lap 1 → min(4, capacity), else ∞ (opening-loop spec)
```

### 6.3 Impact (Player.impact)

```
Impact():
  if action != null { action.onImpact?.Invoke(this) once; return }                 // LATER
  if opSpot != null && node == null { opSpot.ChiefImpact(this); return }           // grill cue (opening-loop spec)
  n = node; if n == null || Room <= 0 return
  if FishCapped(n) return
  item = n.Hit(this); if item == null return
  count = n.LastYield > 0 ? n.LastYield : 1; n.LastYield = 0
  from = n.Kind == "net" ? n.FishPos(this) : ImpactPoint()                        // deck: the float (x, y−2), leap 50
  fo = from.Leap != null ? (height: from.Leap, spin: -330) : null
  for i in 0..count-1 while Room > 0: Schedule(i*90 ms, () => gs.SpawnItemTo(item, from.X, from.Y, this, isPlayer: true, 0, fo))
  Haptics.Vibrate(8 ms)
```

### 6.4 Gather node contract and `FindGatherable` (Game.js 2020–2040)

```csharp
public interface IGatherNode {
    float X { get; } float Y { get; } string Kind { get; }  // "net" | "tree" | "rock" | "wheat" | animal kinds
    string Item { get; } string PlayerAnim { get; }          // deck: "harvest"
    string ChiefAnim { get; }                                // deck with landing: "fish", else null
    bool Ready(); string Hit(CharacterSim by); int LastYield { get; set; }
    Vector2? FacePoint(CharacterSim by);                     // deck: the float bob (1168, 337)
    bool CanReel { get; } void Reel(CharacterSim by);        // deck: casts the line
    (float X, float Y, float? Leap) FishPos(CharacterSim by);
    float StandDist { get; }                                 // rocks only (LATER)
}
```

```
FindGatherable(x, y, range):
   best = null; bd = range^2
   check(n): if n.Ready() && gdist2(x,y,n) < bd { bd = gdist2; best = n }
   check(net)                                               // deck centre (1073, 299): never wins from the landing
   if gdist2(x, y, net.Gather) < 55^2 && net.Ready(): return net   // gather = reel spot (1089, 386)
   trees, rocks (range + standDist − 40 rule), wheat, animals: LATER (zones locked at a new game)
   return best
```

At a new game the only gatherable thing is the deck: standing within 55 px (gdist) of (1089, 386). Facing
`(1168, 337)` from there gives dir NE (7), where the NE-only `fish` anim exists.

### 6.5 Operator spot contract (chief side; Labour.js 58–160)

- `OperatorSpot.Update` runs after `Player.Update` (in `updateLabour`). If the chief stands inside its pad and
  `Vx == 0 && Vy == 0`, it sets `player.operating = this`, so the player sees it on the next tick.
- `ChiefAnim()` = `cfg.chiefAnim` (grill: `give`, a 6-frame one-shot, impact frame 3); `FaceFor(ch)`: if `chiefDir` is set
  (grill `SE` → index 1), set `dir` and `Play(animName, force)`; else face `station + cfg.face`.
- Grill config (world.js labour.ops): `pad [−70, 35], op [57, −28], dir SW, who npc_chef, chiefAnim give, chiefDir SE`, all relative
  to the grill at (1004, 590). The pad is therefore at (934, 625).

### 6.6 Save and load (Game.js 247–257, 2605, 2685, 1822)

```
save:  player = { x: JsRound(X), y: JsRound(Y), stack: [item types on him] ++ [types still flying to him] }
load:  ok = finite(x,y) && x >= -1360 && x <= 6104 && y >= 0 && y <= 3410       // X0 + 40 .. W − 40, 0 .. H − 40
       spawn = ok ? (x, y) : WORLD.player (1130, 412)
       if ok: collision.Resolve(ref spawn, 16, chief: true)
       ... after all buildings stand: if ok: UnstickChief()
       stack: push the first `capacity` saved types with no flight (hop animation plays)
UnstickChief: if he is not inside the hut footprint and not Blocked(x, y, 16, chief) → done;
       else q = FreeSpot(x, y, 16, 120); if still blocked → FreeSpot(hut yard spot ?? office door ?? WORLD.player, 16, 240)
```

A new game does **not** resolve the spawn. (1130, 412) lies above the shore walk line (`shore(1130) + 46 = 426.5`) but
inside the chief's landing land (§10.6). Without that land he would be pushed to y = 426.5 on his first step.

---

## 7. Carried stack (`ItemStack.js`) — SLICE

### 7.1 Data and API

```csharp
public sealed class StackItem { public string Type; public SpriteRenderer Spr; public float Hop; }
public sealed class ItemStack {
    public List<StackItem> Items; public float Scale = 1; public Vector2[] Cols = { (0,0) }; public int PerCol = 1000;
    public bool Sway; public int Max = 9999; public float Lean, LeanV; public float Bx, By, Depth;
    public Dictionary<string,int> TypeCols; public bool Alternate; public bool HopOnPush = true; public int DrawMax;
    public Dictionary<string,int> DrawMaxBy; public int Incoming; public List<string> InTypes;   // flights on their way
    int Room => Max - Items.Count - Incoming; bool Full => Items.Count + Incoming >= Max; int Count => Items.Count;
    void Reserve(string t) { Incoming++; InTypes.Add(t); }
    void Arrive(string t)  { Incoming = Math.Max(0, Incoming-1); InTypes.Remove(t /* first match */); }
    int CountWithIncoming(string t);  int CountOf(string t);  bool HasAny(string[] types);
    void Push(string type, SpriteRenderer spr /* null = take from pool */);   // spr scale = Scale, angle 0, Hop = HopOnPush ? 1 : 0
    StackItem Pop(params string[] types);   // topmost matching (search from the end)
    void Clear();  Vector2 NextPos(string type);  Vector2 TopPos();  void Layout(...);  void SetVisible(bool v);
}
```

Characters use: `Scale = 0.62` (carryScale), `Sway = true`, one column, `PerCol 1000`, `Max = capacity ?? 99` (for the
chief 99: his real limit is `capacity`, checked by callers), no bake. Pads, piles and shelves use TypeCols /
Alternate / DrawMax and the **baked** mode (StackBaker). Baked mode is DROP; render the same layout with live sprites.

### 7.2 Layout of a carried (single-column, sway) stack — per tick from `Sync`

```
Layout(bx, by, depth, vx, dt, walkT):
  Bx = bx; By = by; Depth = depth
  target = -vx * 0.045
  LeanV += ((target - Lean)*60 - LeanV*9) * dt;  Lean += LeanV * dt            // spring, leans against the motion
  h = 0
  for i in 0..n-1:
     it = Items[i]; st = StackStep(it.Type) * Scale
     k   = (i/10)^2
     wob = i > 0 ? sin(walkT*2 + i*0.5) * 0.6 * i/10 : 0
     hop = 0
     if it.Hop > 0: it.Hop = max(0, it.Hop - dt*5); hop = sin(it.Hop*PI)*8; it.Spr.scale = (Scale*(1+it.Hop*0.25), Scale*(1-it.Hop*0.15)) (Scale when Hop hits 0)
     it.Spr.position = (bx + Lean*k + wob, by - h - hop)
     it.Spr depth = depth + i*0.0005 + 0.001                                    // §15: child order 1 + i
     h += st
```

(With more than one column the column switches after `PerCol` items, `h` restarts and `x += col.dx`, `y += col.dy`,
depth adds `col.dy·0.01`. Pads use this, LATER.)

Item sprite: `item_<type>` with origin (0.5, 0.75), scale 0.62. Heights per item at 0.62: raw fish 6.82 px, cooked
fish 5.58 px, log 8.06, plank 4.96, bread 8.06.

```
NextPos(type) (single column):  h = Σ StackStep(items)*Scale;  return (Bx + Cols[0].x + Lean*min(1, n/10), By + Cols[0].y - h)
TopPos(): top item sprite position, else (Bx, By)
```

Note: the per-item `carryScale` field in the item manifest (0.55–0.65) is **not used**. Every stack uses its own
`Scale`.

### 7.3 Item flights (Game.js 2042–2091, Effects.js 159–180)

```
Fly(spr, fx, fy, targetFn, dur, height, scaleFrom = spr.scale, scaleTo, spin = 0, onDone):
   spr depth = FLY (30000) + (flyCounter++ % 100)              // §15 "Fly" layer
   over dur ms, linear p 0→1:  tg = targetFn()   // re-read every frame: the carrier walks
       pos = (fx + (tg.x - fx)*p, fy + (tg.y - fy)*p - sin(p*PI)*height); scale = lerp(scaleFrom, scaleTo, p); angle = spin*p
   on complete: angle = 0; onDone(spr)

SpawnItemTo(type, x, y, ch, isPlayer, delayMs = 0, fo = null):          // a new item flies into ch's stack
   if ch.Stack.Count + ch.Stack.Incoming >= (isPlayer ? player.Capacity : ch.Stack.Max) return false
   ch.Stack.Reserve(type)
   after delayMs: spr = pool.Take(type); spr.scale = 0.45
       Fly(spr, x, y, () => ch.Stack.NextPos(type), dur 300, height fo?.height ?? 70, scaleTo ch.Stack.Scale, spin fo?.spin ?? 0,
           onDone: ch.Stack.Arrive(type); if !ch.Alive { pool.Release(spr); return }
                   ch.Stack.Push(type, spr)
                   if isPlayer: sfx_pickup vol 0.75 rate 0.9 + min(0.9, count*0.05) throttle 30 ms
                                if count >= capacity: FloatText(ch.X, ch.Y + ch.HeadTop - 30, "MAX", #FFD84A, 26 px))

MoveItem(from, to, types, dur = 240, height = 60, accept = null, sfx = null):   // stack → stack (pads ↔ chief)
   if to.Room <= 0 return false; it = from.Pop(types); if it == null return false
   to.Reserve(it.Type); (fx, fy) = it.Spr.position
   Fly(it.Spr, fx, fy, () => to.NextPos(it.Type), dur, height, scaleTo to.Scale,
       onDone: to.Arrive(type); if accept != null && !accept(type) { pool.Release(s); return }
               to.Push(type, s)
               if to is the chief's stack: sfx_pickup vol 0.7 rate 0.9 + min(0.9, to.Count*0.045) throttle 30 ms
               else if sfx == "drop" && chief within 500 px (box): sfx_drop vol 0.5 rate 0.85 + min(0.7, to.Count*0.03) throttle 40 ms)
```

Cadence on pads: one item per `padItemInterval = 0.075 s` (the pad logic belongs to the opening-loop spec).

---

## 8. Carry pill 짐 이름표 (`CarryPill.js`) — SLICE (row 1), LATER (row 2)

A plate floating over the chief's load, with a constant size on screen.

### 8.1 Visibility (`allowed`)

Shown only when **all** of these hold: `stack.Count + stack.Incoming > 0`; not seated; not in overview; the body is
visible; no rank ceremony; no panel open (`panelOpen, buildOpen, v4PanelOpen, v42PanelOpen, adminOpen, moveOpen`, goal
window, residents window, office panel, hud42 card); **no bubble of `life.bubbles` belongs to him** (the tutorial's
thumbs-up emote); and he is not within gdist 110 of the navigator's destination while its badge is visible.
Fade: `alpha += realDt/0.15` toward 1, `−= realDt/0.25` toward 0 (real time, `realDt = min(0.25, …)`). Hidden when alpha is 0.
`shown = alpha > 0.5` (the halo hides its star pin then).

### 8.2 Row 1 (rebuilt only when one of: language, kind A/B, counts, "more", tutorial, count, cap, full changes)

```
counts: group stack.Items types + stack.InTypes types → [(type, n)], sorted by n desc; a tie puts the type that is on top
        first (the last in-flight type, else the top item's type)
tut   = tutorial.InTutorial || onboard.mode in {act1, act2, tour}
x = 30                                           // after the ★
kind 1: icon (fit 34 px) centred at x + 17; x += 38; text "<item name> <n>" at x (origin left-middle); x += textW + 10
kind 2: icon at x + 17; x += 38; text = ((x + 220 < 420 && name != "") ? name + " " : "") + n + (kinds > 2 ? " …" : ""); x += textW + 10
bag part (only when !tut && cap > 0): x += 6; ui_icon_backpack fit 28.9 px centred at x + 14.28; x += 32.9
          text "<count>/<cap>" + (full ? " 가득" (en " full") : "") colour full ? #C0392B : #2B2F3A; x += textW
w1 = x + 16
```

Text: font `Pretendard, 'Apple SD Gothic Neo', 'Noto Sans KR', 'Malgun Gothic', sans-serif`, 26 px, weight 900, colour
#2B2F3A. Item names come from `strings.js` (ko: item_fish_raw 생선, item_fish_cooked 구운 생선, …).
**Pop**: when the count grows (and it was > 0), `popT = 0.16`.

### 8.3 Plate geometry (container-local, origin = tail tip area)

```
w1c = max(120, w1);  w = max(w1c, row2 ? row2W + 36 : 0);  h = row2 ? 82 : 48;  x0 = -w/2;  y0 = -h
box  : rounded rect r 20 at (x0, y0, w, h): shadow rgba(31,51,84,0.22) offset +4 y; fill rgba(255,248,236,0.97); stroke #E8A33D 3 px
       (Phaser: nine-slice of a 68×64 texture drawn at 2×, borders L24 R24 T24 B28; bake it once to a PNG)
star : 10-point star, outer r 11, inner r 4.6, fill #FFC83D, stroke #5A3A26 2.5 px, at (lx + 18, y0 + 24)
row 1: every piece at y0 + 24, x = lx + its x from §8.2, where lx = x0 + max(0, (w - w1c)/2)
tail : triangle (3,3)-(21,3)-(12,13) in a 24×16 box, origin (12/24, 3/16), at (0, 0); fill cream, stroke #E8A33D 3 px on the two slanted sides
row 2: text at (0, y0 + 64), 22 px weight 800, #1F5F66 (or #B2462A for "nowhere takes it")
```

### 8.4 Placement (every tick after the chief moved)

```
z = max(0.3, zoomCur)
top = p.Y - p.LiftY + p.HeadTop - 6
if stack.Count > 0: top -= Σ_{items (all; drawMax 0)} StackStep*Scale + 2
s = clamp(0.92 / z, 0.5, 1.6); if popT > 0 { popT = max(0, popT - dt); s *= 1 + 0.12*(popT/0.16) }
container position (p.X, top), scale s, alpha
```

Depth LABEL − 40 (40960). Not interactive.

Row 2 (LATER: needs the navigator) shows `→ <place> · <m>m` (m = max(1, round(routeLen/64))) for 4 s after the place
changes and while the place is off screen, `<item> <n> → <place>` for mixed loads (only if it fits 540 px, judged
with m ≥ 100), `+N곳`, or `받아 줄 곳이 없어요` / `<place> 가득 · 잠시 기다려요`. Strings (ko/en) are in CarryPill.js 36–39.

---

## 9. Chief halo (`ChiefAura.js`) — SLICE-opt (ring, glow), LATER (rest)

```
ringWidth = 70 * (zoomCur < 1.2 ? min(2, 1.2/zoomCur) : 1)          // balance v42.aura: ringPx 70, fullZoom 1.2, maxScale 2
sc = ringWidth / 192
ring  : sprite chief_halo (192×96, anchor centre), anim 'calm' (frames chief_halo_0..11, 5 fps loop)
        pos (x, y + 2 - liftY), scale sc, alpha (0.85 + 0.1*sin(t*2PI/2.4)) * (1 - gold), depth PAD+2 (-11998)
gold  : chief_halo_gold (8 frames, 12 fps loop), scale sc*(1 + pulseK*0.12), alpha gold*(0.8 + pulseK*0.2), depth PAD+2.01
        gold += ((chief working a station ? 1 : 0) - gold) * min(1, dt*6); pulseK = max(0, pulseK - dt*3); pulse() sets 1 on each chief impact at the spot
glow  : chief_glow_back (160×200, anchor (0.5, 0.82), 8 frames 8 fps), pos (x, y + 4 - liftY), scale 1.15,
        alpha ga*(0.85 + 0.15*sin(t*1.7)), ga = 0.35 + 0.25*night (night = 0 in the slice), depth y − 0.5 (behind him)
off when Settings.halo == false or the body is hidden
```

LATER: 6 motes on the ring (one turn per 6 s, depth y ± 1), star pin (zoom < 0.8, crowd ≥ 4 within 160, 관망, a train car
covering him; hidden while the carry pill shows), navigator notch, rank-2 band, ghost silhouette over train cars,
night light point.

**Timing note:** in Phaser the `chief_fx` art page arrives only after the first sale. Until then the ring and glow are
generated stand-ins (`fv_halo`: a 192×96 ellipse ring with a gradient teal→blue→violet stroke, 6 small white
4-point stars; `fv_halo_glow`: a 160×192 warm radial glow). See open question Q3.

---

## 10. Collision (`Collision.js`) — SLICE

### 10.1 Data

```csharp
public sealed class Obstacle { public bool Seg; public float X, Y, R; public float X0, Y0, X1, Y1; public bool Active = true; public string Tag; }
public sealed class Land { public Vector2[] Pts; public bool Active = true; public string Tag; public Vector2? Door; public float X0, X1, Y0, Y1; }
public sealed class Collision {
    const float CELL = 160; const float MAX_AGENT_R = 26;
    float W = 6144, H = 3450, OX = -1400;                    // OX = min(0, floor(WORLD.left))
    int Cols = 49, Rows = 23;                                 // ceil((W-OX)/160)+1, ceil(H/160)+1
    List<Obstacle>[] Grid; List<Obstacle> All;
    float[][] Walk /*open rects or null*/, Inner; float Edge = 46;
    List<Land> Lands; float[] ShoreCache;                    // float32, every 8 px from OX
}
```

All circles live in **ground space**: x, and y doubled. A circle of radius r covers `dx² + (2·dy)² < r²` on screen
(an ellipse r wide, r/2 tall).

### 10.2 Insertion

```
Add(x, y, r, tag): o = circle; cells x in [floor((x-OX-r-26)/160) .. floor((x-OX+r+26)/160)],
                   y in [floor((y-(r+26)/2)/160) .. floor((y+(r+26)/2)/160)], clamped to the grid; push o into each; All.Add(o)
AddSeg(x0,y0,x1,y1,r,tag): capsule; cells over the box [min x - r - 26, max x + r + 26] × [min y - (r+26)/2, max y + (r+26)/2]
AddWalls(pts, r, tag, gaps, closed): per edge a→b, cut out each gap {x, y, w (default 70), reach (default 90)} in ground space:
     L = |(b.x-a.x, 2(b.y-a.y))|; t = proj of gap on the edge / L²; off = perpendicular distance
     skip if t < -0.2 || t > 1.2 || off > reach; else remove [t - (w/2)/L, t + (w/2)/L] from [0,1]; keep pieces longer than 1e-3
     AddSeg for every remaining piece
```

The lookups below only read **the one cell that contains the point**. That is correct only because insertion pads
by 26 px, so any walker radius above 26 breaks it. The widest query in use is 26 (chief 16 + 10 for the "wide" test).

### 10.3 Queries

```
Shore(x): u = (x - OX)/8; i = clamp(floor(u), 0, len-2); f = clamp(u - i, 0, 1); return cache[i]*(1-f) + cache[i+1]*f
          cache[i] = (float) shoreY(OX + 8i)                    // 02 §4 / 01 §1.4 formula
InOpen(x, y): any rect in Walk contains (x, y) (inclusive)
InWalk(x, y): Walk == null || (InOpen(x,y) && InOpen(x-46,y) && InOpen(x+46,y) && InOpen(x,y-46) && InOpen(x,y+46))
InLand(x, y): first active land whose bbox contains (x, y) and whose polygon contains it (even-odd ray test; divide by (q.y-p.y) || 1e-9)
OffLand(x, y, chief=false): x < OX+40 || x > W-40 || y > H-40 || !InWalk(x,y)  → true
                            else y < Shore(x) + 46 && !(chief && Lands.Count > 0 && InLand(x,y))
Blocked(x, y, rad, ignore=null, chief=false):
     if OffLand(x, y, chief) return true
     cell = (floor((x-OX)/160), floor(y/160)); outside the grid → true
     foreach active o in cell (o != ignore):
        seg:    q = SegNear(o, x, y, rad); if q.d2 < q.R² return true
        circle: if (x-o.X)² + ((y-o.Y)*2)² < (o.R + rad)² return true
     return false
SegNear(o, x, y, rad): a = (x0, 2y0), b = (x1, 2y1), q = (x, 2y); t = clamp(dot(q-a, b-a)/|b-a|² (or 1), 0, 1);
     d = q - (a + (b-a)t); return (dx, dyGround, d2, R = o.R + rad)
FenceBetween(ax,ay,bx,by): samples every 20 ground px; true if a circle tagged "fence…" covers a sample (guide arrow, LATER)
```

### 10.4 `Resolve(ref p, rad, chief=false)` — the movement solver (single pass)

```
hit = false
cell of p (if inside the grid): foreach active o in cell, in insertion order:
    seg:    q = SegNear(o, p); if q.d2 >= R² continue; d = sqrt(q.d2) || 0.001; push = (R - d)/d
            p.x += q.dx*push; p.y += q.dyGround*push/2; hit = true
    circle: dx = p.x - o.X; dy = (p.y - o.Y)*2; R = o.R + rad; d2 = dx²+dy²; if d2 >= R² continue
            d = sqrt(d2) || 0.001; push = (R - d)/d; p.x += dx*push; p.y += dy*push/2; hit = true
minY = Shore(p.x) + 46
if p.y < minY && !(chief && Lands.Count > 0 && InLand(p)):
    q = chief && Lands.Count > 0 ? LandEdge(p.x, p.y, 2*(minY - p.y)) : null
    if q != null p = q else p.y = minY; hit = true
if p.x < OX+40 { p.x = OX+40; hit } else if p.x > W-40 { p.x = W-40; hit }
if p.y > H-40 { p.y = H-40; hit }
if Walk != null && !InWalk(p):                       // back out of the fog
    best = argmin over Inner rects of clamp-point c: (c.x-p.x)² + 4(c.y-p.y)²
    p = (best.x, max(best.y, Shore(best.x) + 46)); hit = true
return hit
LandEdge(x, y, limit): nearest point on any active land's edges (ground metric) closer than limit, pulled 1.5 ground px
     toward the polygon centroid (so it is inside), else null
```

The order of obstacles in a cell changes the result slightly when two overlap. Keep insertion order (= the build order
of the world spec).

### 10.5 Walkable land and colliders (owned by 02)

- `SetWalkable(open, inner, edge = 46)`. New game: open = start (0, 0, 1800, 2620) + west (−1400, 0, 0, 2620); inner per
  02 §8.1. Recomputed when a region opens (LATER).
- Static colliders: 02 §7 / §11 (decor `DECOR_R`, trees r 24, huts, fences, life props `clamp(footprint.x·0.36, 10, 70)`,
  the grill r 79.8, the hut's 9 circles, …). Buildings, pads and the shop add theirs in their specs. Zone objects are
  deactivated (`Active = false`) while the zone is locked.

### 10.6 The chief's landing land (FishingDeck.buildLanding; numbers computed from the code)

`LP(mx, my) = (JsRound(1100 + 45.25(mx+my)), JsRound(380 + 22.63(mx−my)))`, `landing.walk = [−0.3, 0.3, −0.42, 0.36]`,
`planks = [−0.5, 0.5, −0.62, 0.6]`, `fan = 20`, `lift = 8`.

| Item | Value |
|---|---|
| walk polygon (Collision land, tag "landing") | (1103, 365) (1130, 379) (1150, 440) (1047, 424) (1067, 383) = top, right, `landPt(right.x+20)`, `landPt(left.x−20)`, left, with `landPt(x) = (x, JsRound(Shore(x) + 46 + 14))` |
| door | (1099, 442) = midpoint of points 3 and 4, +10 y |
| planks polygon (lift 8 when the chief's feet are inside) | (1049, 383) (1095, 405) (1150, 378) (1105, 355) |
| reel spot (gather) | (1089, 386) |
| float (bob) | (1168, 337) |
| spawn (1130, 412) | inside the walk polygon; `OffLand(1130, 412)` is true for everyone else |

Only the chief (`chief: true`) knows this land. Roads, residents and porters never enter it.

---

## 11. Walker steering (`Game.moveAgent`) — SLICE

Used by residents (non-LOD), customers, workers and haulers. **Not** used by the chief.

```csharp
public interface IWalker { float X { get; set; } float Y { get; set; } float Vx { get; set; } float Vy { get; set; }
    float Radius { get; } bool Alive { get; } bool NoSeparate { get; } MoveMem Mv { get; }
    float StuckT { get; set; } float SideT { get; set; } int SideDir { get; set; } void Face(float vx, float vy); void Locomotion(bool moving); }
public sealed class MoveMem { public float Tx = NaN, Ty = NaN, Sx = NaN, Sy = NaN, Best, T, St, Lt = NaN; public List<Vector2> Way; public int Wi, N; public bool Retry, Settled; }
```

```
MoveAgent(a, tx, ty, speed, dt, arrive = 8) → bool arrived:
  d = |(tx - a.X, ty - a.Y)|                                   // Euclidean px
  if d <= arrive: a.V = 0; a.StuckT = 0; m.Way = null; m.Retry = m.Settled = false; return true
  now = walkClock (Σ dt); fresh = !(now - m.Lt <= 0.6); m.Lt = now
  if fresh || !(|m.Tx - tx| <= 24 && |m.Ty - ty| <= 24): m = { Tx = tx, Ty = ty, Way = null, N = 0, Sx = NaN, Settled = false, Retry = false }
  if m.Settled:
      if gdist(a, t) < 48 && (m.St += dt) < 2: a.V = 0; return true     // stands near a crowded spot for 2 s
      m.Settled = false; m.Retry = true; m.Sx = NaN
  (sx, sy) = (tx, ty)
  if m.Way != null: advance m.Wi while Wi < last && gdist(a, Way[Wi]) < 24; if Wi < last (sx,sy) = Way[Wi] else m.Way = null
  sd = gdist(a, s)
  if (m.Sx, m.Sy) != (sx, sy): m.Sx = sx; m.Sy = sy; m.Best = sd; m.T = 0
  else if sd < m.Best - 6: m.Best = sd; m.T = 0; m.Retry = false
  else if (m.T += dt) > (m.Retry ? 1.5 : 3.5):
      m.T = 0; m.Best = sd; td = gdist(a, t)
      if m.Way != null: m.Wi++                                            // a corner it cannot reach
      else if td < 40: a.V = 0; a.StuckT = 0; m.Settled = true; m.St = 0; a.Locomotion(false); return true
      else if m.N < 2: m.N++; w = roads.Detour(a.X, a.Y, tx, ty, rad: a.Radius); m.Way = w?.Count > 1 ? w : null; m.Wi = 0
      else if Unseen(a.X, a.Y) && Unseen(tx, ty): q = FreeSpot(tx, ty, a.Radius || 12, 90); a.X,Y = q; a.V = 0; a.StuckT = 0; m.N = 0
                                                   return gdist(a, t) <= max(arrive, 40)
  if (sx, sy) != (tx, ty): dir from a to s, else from a to t
  v = dir/|dir| * speed
  if a.SideT > 0: a.SideT -= dt; s = a.SideDir; o = (-v.y*s, v.x*s); v = v*0.3 + o*0.9          // slide sideways
  if !a.NoSeparate: foreach other alive agent o != a in gs.Agents:
      e = (a.X - o.X, (a.Y - o.Y)*2); e2 = |e|²; if 0.01 < e2 < 900: v.x += e.x/|e|*60; v.y += e.y/|e|*30
  prev = (a.X, a.Y); p = (a.X + v.x*dt, a.Y + v.y*dt); collision.Resolve(ref p, a.Radius); a.X,Y = p; a.V = v
  moved = |p - prev|
  if moved < speed*dt*0.25: if (a.StuckT += dt) > 0.35 { a.SideT = 0.7; a.SideDir = Random < 0.5 ? -1 : 1; a.StuckT = 0 }
  else a.StuckT = 0
  a.Face(v.x, v.y); a.Locomotion(true); return false

Unseen(x, y) = !IsOnScreen(x, y, 120) && !IsOnScreen(x, y - 220, 120)       // IsOnScreen uses the last drawn camera view
FreeSpot(x, y, rad = 14, maxR = 120, ok = null):                               // Game.js 1850–1866
  if !Blocked(x, y, rad) && ok?(x,y) != false: return (x, y)
  for r = 12; r <= maxR; r += 12:
     n = max(8, JsRound(r/6)); best = null; bd = +inf
     for k in 0..n-1: ang = k/n*2PI; q = (x + cos(ang)*r, y + sin(ang)*r/2)
        if Blocked(q, rad) || ok?(q) == false continue
        dd = -sin(ang); if dd < bd { bd = dd; best = q }                      // the most southern one (in front)
     if best != null return best
  return (x, y)
```

`gs.Agents` holds residents, customers, workers, haulers, staff and builders. **The chief is not in it**: walkers do
not keep away from him and he does not push them.

---

## 12. Roads and paths (`Roads.js`, `Paths.js`) — SLICE

### 12.1 Graph

Data: `02_world_ground_static.json → roads` (61 nodes, 69 edges; world.js 410–480). Edge length = Σ ground distances
along `[A, ...via, B]`. `usable(e) = e.walk && (e.zone == null || zoneUnlocked(e.zone)) && (e.region == null || regionOpen(e.region))`.
At a new game, **45 of 69 edges are usable** (zone forest/farm/mine/hunt locked; regions east, south, se, rail
closed; `farm_in–field_gate` has walk:false).

Hooks (Game.js 181–189):

```
blocked(x, y)       = collision.Blocked(x, y, 12)
wide(x, y)          = collision.Blocked(x, y, 22)
blockedR(x, y, r)   = collision.Blocked(x, y, r)
offLand(x, y)       = collision.OffLand(x, y)
walls(x, y)         = RouteWallAt(x, y)     // bakery cottage wall circles + farm fences, +12 radius; false at a new game (LATER)
```

Constants: `MIN_ROAD_DIST 300` (default `near`), `DETOUR 1.9`, `LEG_BUDGET 6000` grid cells per tick, `OFFROAD 1.8`,
`TRIM 170`, `BUCKET 256`.

```
NearestK(x, y, k): nodes in a 256-px bucket grid (key floor(x/256)*4096 + floor(y/256)); search ring r = 0..span
     (span = ceil(max(maxX-minX, maxY*2, 1)/256) + 2); stop when k found and ds[k-1] < (r-1)*256;
     consider only nodes with at least one usable edge; keep the k smallest gd (insertion sort)
Path(a, b): A* over nodes, g = Σ e.len, h = gd(node, b); binary min-heap on f (sift-up stops on parent.f <= child.f;
     sift-down picks left on ties: `if f[l] < f[m]`, then `if f[r] < f[m]`); lazy deletion (skip closed); guard N*8 pops;
     cached by key a*65536+b until Invalidate(). Result: [(node, edgeTaken)] from a to b, with .len = g[b]; null if unreachable
```

### 12.2 Routing

```
Route(ax, ay, bx, by, out, near = 300):                                     // last point is always (bx, by)
   ra = RoomAt(a), rb = RoomAt(b)                                            // walled buildings: none at a new game (LATER)
   if ra == rb: return ra != null ? Leg(a, b) : RouteOpen(a, b, near)
   (exit legs of ra) + RouteOpen(ra.out or a → rb.out or b) + (entry legs of rb)

RouteOpen(a, b, near, strict = false):
   direct = gd(a, b)
   if direct < near: return Leg(a, b)
   As = NearestK(a, 3); Bs = NearestK(b, 3)
   best over pairs (A, B), A != B, Path(A, B) != null: cost = 1.8*gd(a, A) + path.len + 1.8*gd(B, b)
   if none: return Leg(a, b)
   if path.len + gd(a, A) + gd(B, b) > direct*1.9 + 120 && (strict ? Clear(a, b) : OnLand(a, b)):
        if strict: return [b]
        if walls != null && !SegClear(walls, a, b): g = GridLeg(a, b, margin 520); if g != null return g[0..-2] + b   // else fall through to the road
        else return Straight(a, b)
   pts = [A] + for each step (via points in travel order) + node
   while pts.Count >= 2 && gd(a, pts[0]) < 170 && gd(a, pts[1]) <= gd(pts[0], pts[1]): pts.RemoveAt(0)     // don't walk back
   while pts.Count >= 2 && gd(b, last) < 170 && gd(b, prev) <= gd(last, prev): pts.RemoveLast()
   keep = pts where !blocked(q)                                             // skip road points a prop stands on
   if keep empty: return Leg(a, b)
   out = Leg(a, keep[0]); for i in 1..: if blocked != null && !Clear(keep[i-1], keep[i]) Leg(keep[i-1], keep[i]) else add keep[i]
   return out + Leg(keep.last, b)

Clear(a, b)  = blocked == null || SegClear(blocked, a, b)                   // step 10, skip 12
OnLand(a, b) = offLand == null || SegClear(offLand, a, b, step 16, skip 0)
Leg(a, b, margin = 0): if !Clear(a, b): g = GridLeg(a, b) ?? (margin > 0 ? GridLeg(a, b, margin) : null); if g: add g[0..-2]
                       add b
Straight(a, b): L = gd(a, b); E = 220; if L < 2E + 60 return Leg(a, b)
   t1 = E/L; P = lerp(a,b,t1); while t1 < 0.5 && blocked(P) { t1 += 24/L; P = lerp }
   t2 = 1 - E/L; Q = lerp(t2); while t2 > t1 + 0.02 && blocked(Q) { t2 -= 24/L; Q = lerp }
   endBlocked = !Clear(Q, b); n = endBlocked ? Q : b
   if !Clear(a, P): s0 = out.Count; Leg(a, P, margin 520)
       while out.Count > s0: c = (out.Count - s0 >= 2) ? out[^2] : a; L2 = gd(c, n); D = min(L2, max(220, gd(c, P)) + 60); k = D/(L2 || 1)
             if out.Count - s0 >= 2 && Clear(c, c + (n - c)*k) out.RemoveLast() else break
   if endBlocked: add Q; return Leg(Q, b, margin 520)
   add b
GridLeg(a, b, margin = 0): key = JsRound(ax/16), JsRound(ay/8), JsRound(bx/16), JsRound(by/8)(, margin)
   cached (cache cleared every 4 s of game time and when > 400 entries); if this tick's expansions > 6000 → null (go straight this tick)
   g = GridPath(blocked, a, b, wide, maxExpand = margin ? 8000 : 4000, margin); expansions += stats; cache; return g

Detour(ax, ay, bx, by, rad):                                               // the safety net
   if blocked == null return null
   bl = rad > 0 ? (x,y) => blockedR(x,y,rad) : blocked;  wd = rad > 0 ? (x,y) => blockedR(x,y,rad+10) : wide
   (rooms exit/entry legs as in Route, LATER)
   if gd(s, t) > 1100: out += RouteOpen(s, t, near default, strict: true)
   else: g = GridPath(bl, s, t, wide: wd) ?? GridPath(bl, s, t, wide: wd, margin: max(480, gd(s,t)))
         if g == null { if out empty return null; add t } else add g
NewFrame(dt): expansions = 0; age += dt; if age > 4 { age = 0; gridCache.Clear() }      // once per tick, before any walker
Invalidate(): version++; pathCache.Clear()     // on zone unlock, region open, shop stage change, bakery built
```

### 12.3 `Paths.SegClear` and `Paths.GridPath`

```
SegClear(blocked, a, b, step = 10, skip = 12): L = gd(a, b); if L < 1 true; n = max(1, ceil(L/step))
     for i in 1..n: t = i/n; if t*L < skip continue; if blocked(lerp(a,b,t)) return false
     return true                                                          // the end point counts

GridPath(blocked, a, b, cell = 24, margin = max(200, min(520, 0.45*L)), maxCells = 26000, maxExpand = 20000, wide = null, goalR = 6):
  ground space: box x [min(ax,bx) - M, max + M], y [min(ay,by)*2 - M, max*2 + M]
  W = ceil(w/cs), H = ceil(h/cs); while W*H > 26000: cs *= 1.25 (recompute)
  cell centre (k): (gx0 + (k%W + 0.5)*cs, (gy0 + (k/W + 0.5)*cs)/2)       // back to screen y
  free(k) = !blocked(centre) (memoised); tight(k) = wide != null && wide(centre) (memoised)
  start = NearFree(cellOf(a), 3 rings); goal = NearFree(cellOf(b), goalR 6 rings) — ring search picks the free cell nearest by gd; -1 → null
  A*: 8 neighbours, no diagonal past a blocked orthogonal neighbour, step cost (diag 1.4142 : 1) × (tight(q) ? 2.5 : 1)
      h = max(di, dj) + 0.4142*min(di, dj) (octile, in cells); heap as in 12.1; give up after maxExpand pops
  not found → null
  cells → centres; string-pull with pull = wide ?? blocked:
      p = a; i = 0; first = true
      while i < n: j = i; while j+1 < n && SegClear(pull, p, pts[j+1], 8, first ? 12 : 0) j++
          if j+1 >= n && SegClear(pull, p, b, 8, first ? 12 : 0) break
          out.Add(pts[j]); p = pts[j]; i = j+1; first = false
      out.Add(b)
```

Keep the grid arrays pooled per `Paths` instance (Phaser keeps module-level scratch arrays, ~400 KB). Do not allocate
them per search.

### 12.4 Golden outputs (Node, from the JS module: new-game graph, NO collision hooks)

| Call | Result |
|---|---|
| `Nearest(1130, 412)` | `beach_n` |
| `Route(1130,412 → 990,1210, near 320)` | (1078,556) (1000,770) (990,1095) (990,1210) |
| `Route(1440,560 → 520,925, 320)` | (1300,572) (1078,556) (1000,770) (600,830) (520,925) |
| `Route(520,925 → 1430,1030, 320)` | (600,830) (1000,770) (1262,968) (1430,1030) |
| `Route(1130,412 → 934,625, 220)` | (1000,500) (1078,556) (934,625) |
| `Route(−55,520 → 1440,560, 320)` | (230,620) (420,700) (600,830) (1000,770) (1078,556) (1300,572) (1440,560) |
| `Route(1000,800 → 1100,850, 320)` | (1100,850) |
| `GridPath(circle r 60 at (500,500) + 12, 380,500 → 620,500)` | (480,538) (552,538) (620,500) |

With the real colliders the off-road legs gain grid corners. Generate more goldens with the same Node script against
the real world once the world spec's colliders are exported.

---

## 13. Residents (`VillageLife.js`, `Resident.js`) — SLICE (wander), SLICE-opt / LATER (social)

### 13.1 Cast at a new game

`WORLD.life.moveIns.start = [npc_grandpa, npc_aunt, npc_kid_girl, npc_kid_prankster, pet_dog]`. A new game queues them
**instantly** (`walkIn = false`, at t = 0). A key is skipped if it has no art or matches `^npc_(clerk|porter)_` (job
characters). The population cap is `population3.baseCap` (19) + houses, so all 4 people come (the dog is not counted).
In Phaser they appear when their (lazy) atlas finishes loading, a few seconds after the village shows. In Unity they
appear at once (risk R12). A key used by a clerk/porter/operator (`keysInUse`) is dropped. When a key starts a job later,
`Release(key)` despawns that resident with an `fx_poof` (size 140) (LATER: npc_chef / npc_aunt as operators).

Later move-ins (by step id): first_sale [npc_kid_boy], hire_fisherman [npc_grandma, npc_young_man], zone_forest
[npc_teen_girl, pet_cat, npc_postman], hire_lumberjack [npc_bard, npc_uncle], zone_farm [npc_blacksmith, npc_fashion,
npc_chef], hire_farmer [npc_herbalist, pet_penguin, npc_toddler], … (world.js 904+). They walk in from the `gate` node
(990, 2560) after `moveInDelay 2.5 s + i·moveInGap 2.0 s`, starting at the first point of their route that is
**off screen** (scanned back from the chief in 20 px steps), then walk to `(chief.x ± 40, chief.y + 60)`, tol 30.
LATER (first_sale is the slice's last beat: SLICE-opt).

### 13.2 Areas (world.js 883–903) and preferences

Open at a new game (no `after`): 

| id | centre | r | acts | fire / stage |
|---|---|---|---|---|
| beach_w | (−55, 520) | 95 | sit, warm, chat | fire (−45, 505), stage (5, 440) |
| notice | (520, 925) | 120 | read, chat | — |
| playground | (1440, 560) | 150 | play, chat, wander | — |
| plaza_s | (990, 1210) | 110 | chat, wander | — |
| doghouse | (1430, 1030) | 90 | chat, wander | — |

Later areas: green_fire (740, 1610) r150 after zone_forest; green_e (1280, 1600) r170 zone_farm; green_w (225, 1440) r110
hire_miner; south (990, 2470) r220 zone_hunt; east_dock, south_fields, se_hill (regions); west_camp (−260, 2370)
zone_forest; west_field (−760, 1220) zone_farm.

```
LIKES = elder: beach_w 4, notice 1, plaza_s 0.5, green_fire 3, south 2, doghouse 0.5, green_e 0.8, east_dock 2, south_fields 0.8, se_hill 1.2
        kid:   playground 5, doghouse 1.2, plaza_s 0.8, green_e 3, green_w 2, notice 0.4, south 0.6, east_dock 0.6, south_fields 2, se_hill 2
        teen:  notice 2, plaza_s 1.5, playground 1.5, green_e 2, green_fire 1.5, beach_w 0.8, doghouse 1, south 0.8, green_w 1, east_dock 1.2, south_fields 1.5, se_hill 1.2
        adult: notice 2, plaza_s 1.6, beach_w 1.2, doghouse 1, green_e 1.6, green_fire 1.6, south 1.2, playground 0.6, green_w 1, east_dock 1.4, south_fields 1.4, se_hill 1.2
        (any other role, e.g. pet → adult); an area missing from the table weighs 0.5
PickArea(r, any = false):
   for each open area: w = LIKES[role][id] ?? 0.5; if key == npc_bard && id == green_fire w += 2; if key ~ skater && id == green_e w += 3
       if !any: d = gdist(area, cameraCentre); w *= d < 650 ? 3 : d < 1100 ? 1.2 : 0.5; w /= 1 + area.n*0.35; if r.Area == area w *= 0.5
   weighted random pick (falls through to the last candidate)
PointIn(a, me): 14 tries: ang = rand*2PI; rr = sqrt(rand)*a.r; q = (a.x + cos*rr, a.y + sin*rr*0.5)
   accept if !Blocked(q, 14) && (i > 10 || !Crowded(q, me)); else (a.x, a.y) resolved with radius 14
Crowded(x, y, me, d = 40): another resident within gdist d, or its route end within d, or a pad spot (gs.padSpots, own radius) contains it
```

`gs.padSpots` (Game.js 312–333): station in/out pads r 70, operator spots r 64 (+ post r 40), piles r 80, market shelf
and cash pad r 70, register r 64, trash r 64, the deck's reel spot r 70, every `WORLD.pads` r 90, site drop pads r 80
plus plots (footprint/2), towers r 120, … Residents never stand on these.

### 13.3 Resident primitives (Resident.js)

| Field | Value |
|---|---|
| radius | 12 |
| role factor k | elder 0.72, kid 1.12, pet 1.15, else 1 |
| walkSpeed | `70 × k × rand(0.92, 1.08)` |
| runSpeed | `150 × (elder ? 0.6 : 1) × rand(0.94, 1.06)` |
| waveCd / shiverCd | rand(6, 16) / rand(10, 40) s at birth |
| LOD step | 0.25 s |

```
GoTo(x, y, tol = 10, run = false, skate = false, speed = null, direct = false):
   Unsit(); route = direct ? [(x,y)] : roads.Route(X, Y, x, y, near: 320); ri = 0; wpRef = null; rpN = 0
   moveAnim = run ? (Can("skate") && skate ? "skate" : "run") : "walk"; Speed = speed ?? (run ? runSpeed : walkSpeed)
   state = Move; moveT = 0; stuckT = 0; Locomotion(true)
Arrived => state != Move
Act(anim, dur = -1): state = Act; V = 0; actT = dur; Play(anim, force)      // dur < 0: until something else happens
Stand(): state = Idle; V = 0; Play(idleAnim)
Locomotion(moving) = Play(moving ? moveAnim : idleAnim)                  // residents never use carry_* anims
SitOn(seat, anim = "sit"): seat.by = this; (X,Y) = seat; dir = seat.dir; state = Act; actT = -1; V = 0; Play(anim, force); Sync(0)
Unsit(): seat.by = null; (X,Y) = (seat.standX, seat.standY); stop attached fx
Can(anim) = def has frames for anim
Emote(key, dur = 1.6) → bubbles.Emote; Say(cat, emote, dur = 2.6) → bubbles.Chat(line(cat)) (LATER)
```

### 13.4 Per-tick update (Resident.update)

```
Update(dt, view /* camera worldView, last drawn frame */):
   on = X > view.x-160 && X < view.right+160 && Y > view.y-160 && Y < view.bottom+160+60
   if on == lod:                                 // state change
       lod = !on; body/shadow visible = on
       if on { animator.Resume(); animKey = none; Play(animName ?? "idle", force) } else animator.Pause()
   if lod: lodT += dt; if lodT < 0.25 return; dt = lodT; lodT = 0      // off screen: think 4× a second
   waveCd -= dt; shiverCd -= dt
   if state == Move: StepMove(dt)
   else if state == Act && actT >= 0: actT -= dt; if actT <= 0 Stand()
   if !lod Sync(dt) else body.position = (X, Y)
StepMove(dt):
   while ri < last && gdist(this, route[ri]) < 30: ri++
   w = route[ri]; if w == null { Stand(); return }
   lastWp = ri >= route.Count-1; moveT += dt
   if lod:                                       // straight line, no collision, no anims
       dx,dy = w - pos; d = hypot; step = Speed*dt
       if d <= max(step, lastWp ? tol : 24) { pos = w; if lastWp { state = Idle; V = 0 } else ri++ }
       else { pos += dir*step; V = dir*Speed; dir = dirFromVec(dx, dy) }
       return
   if MoveAgent(this, w, Speed, dt, arrive: lastWp ? tol : 26):
       if lastWp { state = Idle; V = 0; Play(idleAnim) } else ri++
       return
   wd = gdist(this, w)
   if wpRef != w { wpRef = w; wpBest = wd; stuckT = 0 }
   else if wd < wpBest - 5 { wpBest = wd; stuckT = 0 }
   else if (stuckT += dt) > 2.5:
       stuckT = 0
       if !lastWp: ri++
       else: way = (wd > 60 && ++rpN <= 1) ? roads.Detour(X, Y, w.x, w.y, rad: 12) : null
             if way?.Count > 1 { route = way; ri = 0; wpRef = null } else Stand()
   if moveT > 60: Stand()
Sync(dt): base Sync; if seat != null && seat.depth != null: sorting depth = seat.depth
```

### 13.5 VillageLife update and think loop

```
Update(dt):
  t += dt
  spawn queued residents whose time came (art ready)        // Spawn(q) §13.6
  move-in banners (LATER)
  camCentre = view centre
  foreach r in residents: r.Update(dt, view); if r.job != null JobUpdate(r, dt)
  events: update, drop the finished ones (LATER except chat)
  thinkT -= dt; if thinkT <= 0 { thinkT = 0.5; Think(0.5) }   // first think at 0.3 s
  projectiles (snowballs, LATER); bubbles.Update(dt); snowman (LATER)
Think(dt):
  timers -= dt  (initial: chat 3, snowball 8, tag 27, concert 32, snowman 4, wave 0, pet 0.5)
  foreach r without job and without event: AssignJob(r)
  GreetChief()
  swing anim (LATER); chat: if timers.chat <= 0 { timers.chat = 5*rand(0.6, 1.4); TryChat() }   (LATER/opt)
  snowball 16*rand(0.6,1.4), tag 45*rand(0.7,1.3), concert 80*rand(0.8,1.2), snowman every 3 s (LATER)
AssignJob(r):
  pet → job = {pet, t 0, phase think}
  a = PickArea(r); if null → job = {idle, t 3}
  SetArea(r, a)                                  // area.n counts who is there
  job = {stay, phase travel, left = rand(14, 40) s, t 0}; GoTo(PointIn(a, r), tol 14)
JobUpdate: idle → end after 3 s; arrive (LATER); stay → JobStay; pet → JobPet; other → end after 10 s
EndJob(r): if seated { Unsit(); Stand() }; job = null
```

### 13.6 Spawn (non walk-in)

```
a = PickArea({role, isPet, key}, any: true) ?? first area; p = a != null ? PointIn(a) : (990, 900)
r = new Resident(key, p); residents.Add(r); byKey[key] = r; gs.Agents.Add(r)
if on screen (60 px margin): fade body and shadow alpha 0 → 1 over 500 ms
maxActive 24: when full, a plain parka villager (npc_yellow|red|blue, not in an event) gives way to a named one
```

### 13.7 The "stay" job (JobStay)

```
a = r.Area; if a == null EndJob
if phase == travel: if !r.Arrived return; phase = here; next = 0
left -= dt; if left <= 0 && !seated: EndJob; return
if phase == sitting: if left <= 0 || sitLeft <= 0 { StopSitting; EndJob; return }; sitLeft -= dt; return
if phase == walk: if r.Arrived { phase = here; next = rand(1, 3) }; return
if r.state == Act && r.actT > 0 return
next -= dt; if next > 0 return; next = rand(2.5, 6.5)
roll = rand
1) sit:   a.acts has sit && r can sit (has sit or loaf) && (elder ? roll < 0.85 : roll < 0.25):
          s = nearest free seat of kind seat in this area whose prop is shown → GoSit
2) warm:  a.fire && acts has warm && rand < 0.35: up to 6 tries: side = ±1; q = (fire.x + side*rand(62, 88), fire.y + 6 + rand(0, 26))
          if !Blocked(q, 12) && !Crowded(q, r, 34): GoTo(q, tol 10, direct); phase = walk; warm = fire; return
   if warm set (arrived): FaceTo(fire); Act(rand < 0.5 ? happy : idle, 1.6); 30%: Say(warm, emote_heart); warm = null; return
3) read:  acts has read && rand < 0.4 && notice board shown: gp = random of gatherPoints [(-35,24), (0,28), (35,24)];
          GoTo(board + gp, tol 8, direct); phase = walk; read = board; return
   if read set: FaceTo(board.x, board.y - 40); Stand(); 35%: Say(read, emote_question); read = null; next = rand(3, 6); return
4) shiver: shiverCd <= 0 && rand < 0.24: shiverCd = rand(25, 55); Act(shiver, 1.8); Emote(emote_cold, 1.8); 35% Say(cold, 2 s); return
5) skate around the rink (LATER)
6) wander: rand < 0.55: GoTo(PointIn(a, r), tol 12, direct); phase = walk; return
7) look around: dir = [SE, S, SW, E, W][rand*5]; m = rand; Act(m < 0.12 && Can(laugh) ? laugh : m < 0.22 ? happy : idle, 1.5)
GoSit(r, j, s): s.by = r; phase = toSeat; GoTo(s.stand, tol 10, direct); sitLeft = elder ? rand(30, 70) : rand(12, 26)
     poll every 200 ms (game time): when arrived → SitOn(s, Can(sit) ? sit : loaf); phase = sitting; left = max(left, sitLeft)
     grandpa (or an elder, 40%) dozes: looping fx_zzz (96×128 sheet, 18 frames 8 fps, anchor (0.35, 0.92), size 70) at the head,
     flipped when facing right, offset (±8, +4); without the sheet: Emote(emote_zzz, 3)
```

Seats (`BuildSeats`): for every life prop with `seatPoints` (log_seat [(−26,−22), (26,−22)] dirs S; log_seat_y
[(−14,−14), (23,−32)] SE; log_seat_x [(−23,−32), (14,−14)] SW) and every visible `bench` decor (bench_seats
[(−33,−36), (10,−14)] SW, pet point (0, −30)):
`seat = (x + q.x·scale·(flip ? −1 : 1), y + q.y·scale)`, dir from the name (SE↔SW swapped when flipped),
`stand = seat + (v.x·40, max(18, v.y·40 + 22))` with `v = DIR_VEC[dir]` = E (1,0), SE (0.7,0.35), S (0,0.5), SW (−0.7,0.35),
W (−1,0), NW (−0.7,−0.35), N (0,−0.5), NE (0.7,−0.35), then resolved with radius 12. `depth = prop.y + 1 + q.y·0.001` for
seatDepth "front". `seat.area = nearest area within 260`. At a new game the only seats near an open area are the two
beach_w logs (−45, 452) and (−125, 520), far west of the opening view.

### 13.8 Dog (pet_dog) roaming — **SLICE** (`JobPet`; revision: moved from SLICE-opt, 00 A23 / WP-6)

```
cd -= dt; if DogPlay busy return (LATER)
dp = gdist(dog, chief); chiefMoving = chief.v² > 400
if dp < 110 && !chiefMoving && dog.Arrived && !seated && cd <= 0: cd = rand(14, 22); FaceTo(chief); Act(happy, 1.4);
       Emote(emote_heart, 1.4); sfx_dog_bark 0.45; return
if Arrived && t > (wait ?? 4): t = 0; wait = rand(5, 13); roll = rand
   kid within 600 (not LOD) && roll < 0.38 → GoTo(kid + (40, 20), run, tol 30, direct if gdist < 320); after = happy
   else roll < 0.62 && doghouse → GoTo(doghouse + doorPoint (1, 25) + (0, 6), tol 8); after = nap
   else roll < 0.82 && open fires → one of the 2 nearest fires; q = fire + (cos·70, 16 + sin·30) resolved r 12; GoTo(q, tol 12); after = warm
   else wander: PickArea → GoTo(PointIn, tol 14); after = null
else if Arrived && after: nap → dir S, Act(sit, rand(5, 10)), 50% emote_zzz 2 s, wait = rand(8, 14)
                          warm → FaceTo(fire), Act(sit, rand(4, 8)), wait = rand(7, 12); happy → Act(happy, 1.4), 50% emote_heart 1.2
```

Cat and penguin jobs (LATER) are in VillageLife.js 712–750.

### 13.9 Greeting the chief (GreetChief, every think)

```
if timers.wave > 0 return; if chief.v² < 900 return                // he must be walking (≥ 30 px/s)
best = nearest resident within gdist 170 that is not a pet, not in an event, not LOD, waveCd <= 0, state != Move
if none return
timers.wave = rand(3, 6); best.waveCd = 25*rand(0.8, 1.2)
if seated: Emote(emote_wave, 1.5); return
FaceTo(chief); Act(wave, 1.4); Emote(rand < 0.5 ? emote_wave : emote_heart, 1.5); 35%: Say(greet, 2 s); if stay job: next = 1.6
```

### 13.10 Tap, chat and other events (LATER / opt)

- `Tap(wx, wy)` (01 §4.3): the visible non-LOD resident whose box `|wx − x| ≤ 34`, `y + headTop − 14 ≤ wy ≤ y + 10`
  is hit, nearest by `|wx − x| + |wy − (y + headTop/2)|`. React: dog → DogPlay; pet → face chief, happy 1.6, heart emote
  1.5, `fx_hearts` (96×128 sheet, 16 frames 16 fps, size 90) at the head, bark/meow/penguin sfx 0.55; person → face chief,
  `surprised` (50% if available) or `wave` 1.3 s, chat bubble `<name>\n<line>` 2.8 s, then the 수다 떨기 offer (ResidentChat, LATER).
- ChatEvent (2–3 people within 260/220 px): gather at spots `[(−36,0),(36,0)]` or `[(−44,−8),(44,−8),(0,26)]` around a clear
  centre (spiral up to 6 rings × 45 px, 10 angles), then 2–4 rounds of `talk` 2.2 s + persona line + emote (70%), listeners
  laugh/happy/angry after 0.9–1.4 s, a wave/happy goodbye; ends after 30 s at most.
- Snowball fight, tag, concert, snowman, party, cheer: VillageLife.js 820–1605 (LATER).

### 13.11 Save (VillageLife.serialize)

`life = { moved: [keys in move-in order], snowman: 0..3, waiting: [keys] }`. Positions are not saved. On load every
`moved` key that has art and is not a job key is queued instantly and spawns at a random point of a preferred area.

---

## 14. Emote and chat bubbles (`Bubbles.js`) — SLICE-opt

```
Emote(who, key, dur = 1.6):
   one emote per character (replaces); at most 10 active (the oldest goes)
   bg = ui_emote_bubble at scale 0.75 (anchor = tail tip); icon at contentCenter*0.75 = (0, -40.875), scale (64/iconW)*0.75*0.95
   start: scale 0.2, k = 0, t = 0
Chat(who, text, emote, dur = 2.6):   (LATER: needs LINES text and voice)
   one per character; max 5 (oldest goes); body nine-slice ui_chat_bubble origin (0.5, 1): w = max(80, min(300, textW + 30 + (icon ? 38 : 0))),
   h = max(56, textH + 30); text 20 px weight 800 #2B2F3A centred, wrap 270, line spacing 2; icon 34 px;
   cy = -h + 8 + (h - 26)/2; with icon: icon at (-w/2 + 31, cy), text at (19, cy); tail ui_chat_tail origin (0.5, 0) at (0, -20)
Update(dt): per bubble:
   t += dt; if who gone or t >= dur + 0.18 → release
   out = t > dur ? (t - dur)/0.18 : 0
   k += ((out > 0 ? 0 : 1) - k) * min(1, dt*14)
   scale = out > 0 ? max(0.01, 1 - out) : min(1.08, k*1.08)       // NOTE: it rests at 1.08, not 1.0
   visible = who.body visible && IsOnScreen(who, 60)
   head = who.Y + who.HeadTop*bodyScaleY + who.SitDy
   chat : pos (who.X, head - 10 + 1.5*sin(nowMs/320 + who.X));  emote: pos (who.X + dx, head - 6 + 2*sin(nowMs/280 + who.Y))
   depth chat BUBBLE+20 + y*0.001, emote BUBBLE+10 + y*0.001       // §15
```

Emote keys in use: emote_heart, love, laugh, exclaim, question, anger, sweat, music, zzz, idea, sparkle, cold, tear, dots,
star, fish, bread, wave, thumbs, snowball. `Assets.pick(a, b)` = the first key that exists (emote_wave exists).

Persona emote sets for chats (CHAT_EMOTES, VillageLife.js 30–37) and persona names (Resident.js 12–18) are LATER.

---

## 15. Draw order for characters in Unity

> **SUPERSEDED by 00 A3/§4.1.** The slice uses one exact rank over all sort keys on the built-in Default layer;
> characters have separate keys for body, each carried item, halo glow and shadow; no per-character SortingGroup, no
> GroundTop/Fly/Bubbles/Labels layers and no order formula. The text below is kept for reference only.

Reconcile with the render/occlusion spec. The Phaser depth values are the contract. This mapping uses the 02 §10
proposal: World layer `order(depth) = clamp(floor((depth + 512)·8) − 32768, −32768, 32767)` + Transparency Sort Mode
Custom Axis (0, 1, 0).

| Phaser object | Phaser depth | Unity |
|---|---|---|
| character body | `inDepth` = y (or interior slot depth; a sitter = seat.depth) | root `SortingGroup` on `World`, `order(inDepth)`; group root at the feet so the custom axis ties on y. Body child order 0 |
| carried items, front | `y + 0.5 + 0.001 + 0.0005·i` | children of the group, order `1 + i` |
| carried items, behind (front/back carry, NE/N) | `y − 0.5 + 0.001 + 0.0005·i` | children, order `−100 + i` |
| halo back glow | y − 0.5 | child, order −200 |
| halo motes (LATER) | y ± 1 | children ±300 |
| shadow | SHADOW −11000 | separate renderer on `GroundTop`, order `round((−11000 + 13600)·10) = 26000` (02 §10) |
| halo ring / gold / band / notch | PAD + 2 / 2.01 / 1.99 / 2.02 | `GroundTop`: round((depth + 13600)·10) → 16020 / 16020 / 16020 / 16020: separate them by hand (band 16019, ring 16020, gold 16021, notch 16022) |
| navigator line, chevron / ring, pulse (LATER) | PAD + 3 / PAD + 4 | GroundTop 16030 / 16040 |
| footstep dust | DUST −10900 | GroundTop 27000 |
| flying items | FLY + (n % 100) = 30000…30099 | layer `Fly`, order n % 100 |
| emote bubble | BUBBLE + 10 + y·0.001 | layer `Bubbles`, order 10000 + floor(y) |
| chat bubble | BUBBLE + 20 + y·0.001 | `Bubbles`, order 14000 + floor(y) |
| customer want-bubble | BUBBLE + 50 − slot | `Bubbles`, order 18050 − slot |
| carry pill, navigator badge | LABEL − 40 | layer `Labels`, order 0 |
| halo star pin (LATER) | LABEL − 30 | `Labels`, order 10 |

Sorting-layer order (bottom → top) implied by Phaser: … GroundTop < World < PadLabel (28000+) < Fog (29000) < **Fly**
(30000) < FX (31000) < **Bubbles** (40000) < **Labels** (41000) < Arrow (45000) < Top (50000). Text (TextMeshPro) inside
the pill and bubbles must use the same sorting layer and order as its plate (+1).

Moving characters update their group order every tick (Phaser sets depth only when the value changes; do the same to
avoid dirtying the renderer).

---

## 16. Other walkers that reuse this module

| Walker | Radius | Speed (px/s) | Carry | Uses | Owner spec |
|---|---|---|---|---|---|
| Customer (villager_a/b/c; later named villagers) | 13 | `120 × rand(0.88, 1.12)`; leaving ×`rand(0.95, 1.15)` × 1.1 | head; on leaving pushes up to 6 bought items (no flight) | `MoveAgent(slot or path point, arrive = path ? 30 : 6)`; on arrival faces `market + cfg.faceTo` (default (40, −20)), plays idle, shows the want-bubble for slots ≤ 2; body scale `rand(0.96, 1.04)`; fades in/out 450/350 ms | shop spec (queue, slots, entry/exit paths); new game: 3 waiting (`start.firstCustomers`) |
| Worker (gatherers) | 14 | `150 × rand(0.95, 1.05)` | head (no carryMode) | `FollowRoute` / `MoveAgent` | LATER |
| Hauler / porters | 14 | `150 × rand(0.95, 1.05)` | `carryStyle` back or front | `FollowRoute` | LATER |
| Operator (station staff) | 12 | — | — | stands on its post | LATER |

`FollowRoute(a, speed, dt, tol = 10)` (Game.js 1912–1960, LATER) is the waypoint follower for workers. It skips points
within gdist 34, gives up on a point after 3 s without 6 px progress, tries a detour once per trip after 1.2 s
(when the point is more than 40 px away), and twice at the route end when it is more than 60 px away. A new walk (none for 0.6 s
of walkClock) resets its memory.

---

## 17. Tap-to-walk

Full algorithm: **01 §4.8** (`GoalWalk`). From this spec it uses `Roads.Route(p, T, near: 220)`, the landing door
legs (insert `land.door` before T when T is in a land that the chief is not in; prepend his own land's door when he
leaves one), `Roads.Detour(p, T, rad: 16)` (at most 2 per walk), and the chief's normal `Player.Update` (the walk feeds the
input vector through the Pilot slot).

**Important for the slice:** `GoalWalk.Available` requires `!tutorial.InTutorial` (= `hire_fisherman` done) and
`onboard.mode ∉ {act1, act2, tour}`. So in Phaser **no tap-to-walk exists during the whole opening loop of a new
game**. A tap on the ground only talks to residents. Recommendation: implement `WalkTo(Vector2 px)` with the GoalWalk
steering, and gate it behind a debug or designer toggle until Q1 (01) is answered.

**Revision 2:** the slice's ground tap uses the **ground-tap mode of 00 §6.1** (pad snap / `FreeSpot` target, quiet walk
without `g_walk`/`g_arrived`/`g_cancel`/`g_stuck` toasts, target ring, re-tap re-targets, bypasses `Available` during
the tutorial), toggle 「탭해서 걷기」 on by default.

---

## 18. Navigator 길 안내 (`Navigator.js`) — LATER

Off during the tutorial, so it never shows in the slice's new game. It may show when a later v4.x save is loaded with
a non-empty bag; the slice only needs that save's layout.

When it shows (`Wanted()`): the bag is not empty (or a place is pinned); `Settings.nav != false`; not in the
tutorial; no 관망 pilot; no panel; no ceremony; not hidden for this load.

```
Places(): counts = bag items + in-flight types; for each type: d = tutorial.Destination(type) (opening/economy spec)
          group by d.pad: n += min(count, max(1, d.room)); d = gdist(chief, pad); (+ the dock of an open order, LATER)
          sort: first-flag desc, n desc, distance asc
Update(dt): pin check (arrived within 90, valid() false, or 240 s); pick every 0.25 s with these rules:
   a place left because it filled up is banned for 15 s for this load; the current place stays while it still takes
   something, unless a better one (n ≥ keep.n + 2, not surplus, dist ≤ 1.25·distKeep + 200) stays better for 4 s
   chip tap → next place (cycle); long press → hide for this load
   replan when the place changed, or every 1 s while strayed > 80 px from the route polyline (or > 240 px: at once)
Plan(pad): goal walk active to the same pad → its remaining route; else dist < 360 → [pad]; else roads.Route(chief, pad)
Draw: drop route points within gdist 40 of him; polyline P = his boots → route → pad (exact)
   chevron: point at max(56, ringWidth·0.46 + 36) px along P, frame nav_chevron_<k> with k = (JsRound(angle/(PI/8)) + 16) % 16,
            at (x, y + 4), alpha 0.85 + 0.15·sin(now/180), scale 0.8 when the tutorial arrow points elsewhere; hidden within gdist 70
   line: z = max(0.55, zoom); core width wc = 13·sc/z (sc 0.8 or 1), outline wo = wc + 8/z, ink 0x1B3150 α0.9, core 0xFFC83D (to 0xFFEEB0 at night)
         only segments inside the view + 60/z; white arrowheads every 92/z px flowing 1.1 gaps/s, size wc·1.5 long / wc·0.62 half-width,
         ink edge max(1.5, 2.5/z); none within 40/z of him or 52 of the end
   end marker: ring + pin (fv_nav_end 176×106) and a pulse (period 1200 ms, scale ×(1 + 0.74·ph), alpha 1 − ph),
         scale min(1.7, max(0.75, sc/z))/1.5; glow above the night overlay after dark (not on low gfx)
   badge: nav_badge (88×100, icon rect (16, 14, 56, 56)) + name plate (ui_chip 160×64, text 26 px #1F5F66),
         plate scale clamp((z < 0.9 ? 0.8 : 0.92)/z, 0.5, 1.6), slid inside the view by at most half its width
   holds the room this load needs at its sink (Logistics.setChief) while he walks; released after 8 s standing
```

---

## 19. Per-tick call order (characters' part of 01 §5.2)

1. `Input.Update` → vec (01).
2. `roads.NewFrame(dt)`; `walkClock += dt`.
3. **`player.Update(dt, inp)`** (uses `operating` and `playerOnPad` from the previous tick) → `Sync`.
4. Unlock pads; `HandlePlayerPads` (MoveItem flights); `UpdateLabour` (OperatorSpot sets `player.operating`).
5. Deck (net) update, stations, **`market.Update` → customers** (MoveAgent, Sync), sites, …
6. Workers, porters, raw porters (LATER).
7. **`life.Update(dt)`**: spawn queue → residents (`Update` + `JobUpdate`) → events → think (every 0.5 s) → **bubbles**.
8. DogPlay (LATER), civic, v4.
9. v42: **aura** → **navigator** → … → pilot → **goalwalk** (its vector is used on the NEXT tick) → **carry pill**.
10. Tutorial, onboarding, flags, occlusion, camera (01).
11. Every `FramePlayer.Tick(deltaMs)` and the flight tweens: Phaser runs animations and tweens in its own managers
    **before** the scene update in the same frame. Run them at the start of the tick, after Input.

---

## 20. Porting risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Y flip.** dirFromVec, the `(y*2)` ground metric, the custom-axis sort and every velocity assume y down. | Keep the sim in px y-down (C1). Unit-test dirFromVec, nearestDir and Resolve. |
| R2 | **Trimmed atlases.** A pivot set on the trimmed rect moves the feet by up to 40 px. Some pivots fall outside the rect. | Importer applies §4.3; test `walk_S_0` → (0.4286, 0.0659). |
| R3 | **Animation semantics.** keepFrame on turns, impact on frame change (not on Play), `repeat 0` stopping and `IsPlaying` going false (the grill `give` restarts on that), timeScale only on the chief, the smoothed unclamped delta drives frames. Mecanim would break all of these. | Custom FramePlayer (§4.5) with unit tests for impact timing (fish: one impact per 0.6 s, the first 0.3 s after Play). |
| R4 | **Sub-pixel depth offsets** (stack +0.0005·i, ±0.5, seats +0.001·q.y, interiors 1e-5) collapse in int16 orders. | SortingGroup per character (C5, §15). |
| R5 | **Collision reads one cell.** Correct only for radii ≤ 26 thanks to the insertion margin. | Keep `MAX_AGENT_R = 26`; assert radius ≤ 26 in debug. |
| R6 | **Resolve is order-dependent and single-pass.** A walker between two circles can jitter. Phaser has the same behaviour. | Port as is; keep insertion order. |
| R7 | **Float precision.** The shore cache is float32 in JS (`Float32Array`), other maths double. | Use `float[]` for the cache and `double` (or careful `float`) elsewhere; tolerances of 0.01 px in tests. |
| R8 | **A\* tie-breaking.** Different heap rules give different but equal-cost routes, so walkers take another street than in Phaser. | Port the heap exactly (§12.1); compare against the Node goldens (§12.4). |
| R9 | **Per-tick grid budget** (6000 expansions) and the 4-s cache are per tick, not per second. | Call `NewFrame` once per tick. |
| R10 | **GC.** Phaser reuses arrays everywhere (routes, scratch grids, pooled bubbles and items). | Pools for route lists, grid arrays, StackItem sprites, bubbles. No LINQ in the tick. |
| R11 | **Timers.** delayedCall (fish 90 ms apart, the sit poll every 200 ms, chat reactions 0.9–1.4 s) run on the scene clock. | Game-time scheduler (C8). |
| R12 | **Residents appear at t = 0 in Unity** but a few seconds late in Phaser (their atlas is lazy). They also choose random areas, so side-by-side comparisons differ. | Accept. Mention it to the designer. Optional "appear after 2 s" to match. |
| R13 | **The landing land must exist before the first move.** The spawn is above the shore walk line. | Build the deck's land in world build, before the player exists (§10.6). |
| R14 | **LOD uses the last drawn view** (one frame old); `Unseen`/teleport too. | Use the camera rect of the previous LateUpdate for parity. |
| R15 | **Korean text in world space** (pill, bubbles): font atlas, sizes in world px, crispness at zoom 0.6–1.7. | TextMeshPro SDF with Pretendard (or Noto Sans KR) dynamic atlas; set sizes in world px / 64. |
| R16 | **Halo art timing** (stand-in until the first sale). | See Q3. |
| R17 | **Separation is O(n²)** over `gs.Agents` (≤ ~40 in v4.3). | Fine. Do not add the town's citizens (Phaser keeps them out too). |
| R18 | **Tap-to-walk does not exist during the Phaser opening** (§17). | Q1 of 01; implement WalkTo behind a toggle. |
| R19 | **Save compat.** `player.stack` may list more items than capacity (in-flight ones too) and unknown keys; `life.moved` may hold keys without art. | Truncate to capacity, skip unknown item types and unknown character keys, as Phaser does. |
| R20 | **`Math.random` everywhere** (speeds, areas, delays). | Seedable RNG per system for tests; free-running in play. |

---

## 21. Acceptance checks (EditMode tests and on-device)

| Check | Expected |
|---|---|
| `dirFromVec` (1,0) (1,1) (0,1) (−1,1) (−1,0) (−1,−1) (0,−1) (1,−1) (1,0.2) (1,0.21) (0.5,1) | 0 1 2 3 4 5 6 7 0 1 2 |
| `nearestDir(N=6, {S,SE,E}, flipped=false)` / `(…, true)` / `(NE=7, {S,SE,E}, false)` | 0 (E) / 4 (W) / 0 (E) |
| pivot `char_player walk_S_0` | (0.4286, 0.0659) normalised; (21, 6) px from the trimmed bottom-left |
| chief full stick right / down, level 0 | 255 / 188.7 px/s; walk timeScale 1.214 / 0.899 |
| chief reaches 95 % of target speed at 60 fps | after 10 ticks (k = 0.2667 per tick) |
| footstep interval at full stick | 0.225 s (0.27 / 1.2) |
| carry offset of the chief facing S / SE / SW (flipped) | (0, −77) / (3, −77) / (−3, −77) |
| 4 raw fish on the chief, standing | top item base at stack base − 3·6.82 = −20.46; `NextPos` y = base − 27.28 |
| shadow size of the chief | 52.9 × 23.4 px, at (x, y + 1) |
| landing land polygon / door / planks | (1103,365) (1130,379) (1150,440) (1047,424) (1067,383) / (1099,442) / (1049,383) (1095,405) (1150,378) (1105,355) |
| `OffLand(1130, 412)` / `OffLand(1130, 412, chief: true)` | true / false |
| `Shore(1130) + 46` | 426.517 |
| chief standing at (1089, 386), still 0.08 s, bag empty | node = deck; faces NE (7); plays `fish`; first fish impact 0.3 s later, then one every 0.6 s; each fish flies 300 ms from his float (bob − 2 px, about (1168, 335) while the line is out) with height 50 and spin −330°, scale 0.45 → 0.62 |
| tutorial fish cap | stops after 4 fish (min(4, capacity 6)) |
| 6 items reached | "MAX" float text at (x, y − 81 − 30), #FFD84A, 26 px |
| two walkers 20 px apart horizontally | each gets +60 px/s away from the other |
| walker pressed into a wall (moved < ¼ of its step) | after 0.35 s slides sideways 0.7 s at `0.3·v + 0.9·perp` |
| resident speeds | elder 46.4–54.4, adult 64.4–75.6, kid 72.1–84.7, dog 74.1–86.9 px/s (walk) |
| elder's first area at spawn (any = true, new game) | beach_w with p = 4/6.5 = 0.615 |
| spawn area (any = true) | kid: playground 63.3 %, doghouse 15.2 %, plaza_s 10.1 %, beach_w 6.3 %, notice 5.1 %; adult (aunt, dog): notice 31.2 %, plaza_s 25 %, beach_w 18.7 %, doghouse 15.6 %, playground 9.4 %; elder: beach_w 61.5 %, others 15.4 / 7.7 % |
| first job choice at 0.3 s, camera on the tutorial view (985, 600), nobody in an area yet | camera factor: playground (gdist 462) ×3, notice (799) ×1.2, doghouse (968) ×1.2, beach_w (1052) ×1.2, plaza_s (1220) ×0.5. Kid: playground 15 of 17.92 (83.7 %); adult: notice 2.4, playground 1.8, beach_w 1.44, doghouse 1.2, plaza_s 0.8 of 7.64; elder: beach_w 4.8 of 8.35 (57.5 %). Later residents in the same think see `n` raised by the earlier ones (÷1.35 per resident there) |
| residents in the opening view | **soft check**: every open area lies just outside the 600-px-wide tutorial view (x 685–1285). Residents are seen when they cross the plaza between areas (for example, the playground ↔ notice route runs (1300,572) (1078,556) (1000,770) (600,830)). Compare 2–3 runs side by side with Phaser, not one frame |
| carry pill scale at zoom 0.6 / 1.2 / 1.7 | 1.533 / 0.767 / 0.541 |
| carry pill in the tutorial with 3 raw fish | row 1 = `생선 3`, no bag part, no row 2 |
| halo ring width at zoom 0.6 / 1.2 / 1.7 | 140 / 70 / 70 px (scale 0.729 / 0.365 / 0.365) |
| emote bubble rest scale | 1.08 |
| `Roads` goldens | §12.4 table |
| save / load | the chief comes back at the saved rounded position and carries the same items (≤ capacity); residents in `moved` come back |

---

## 22. Open questions

- **Q1 (shared with 01 Q1)** — Tap-to-walk: Phaser has none during the opening (goal walk locked until `hire_fisherman`,
  ground taps talk to residents). Should the slice add a ground-tap `WalkTo`, and should it also work in the tutorial?
- **Q2** — The residents appear a few seconds after the village in Phaser (lazy atlases). Should Unity copy that delay?
- **Q3** — The halo ring and glow show generated stand-ins until the first sale, and the real `chief_fx` art after it.
  Should Unity show the art from the start (recommended), or copy the switch?
- **Q4** — Chat bubbles with text need the `LINES` pools (ko/en) and the 눈꽃말 voice. Are they in or out of the slice?
  Emote-only bubbles are cheap.
- **Q5** — The carry pill's row 2 and the navigator are off during the tutorial. Is it acceptable that a loaded
  post-tutorial save shows the bag without a navigator line in the slice?
- **Q6** — In Phaser the 5 open resident areas all sit just outside the tutorial camera view, so residents are seen
  mostly while crossing the plaza. If the go/no-go test needs "2–3 residents walk" clearly on screen, should the slice
  keep Phaser's behaviour (recommended for parity), or bias the first jobs toward the plaza?
