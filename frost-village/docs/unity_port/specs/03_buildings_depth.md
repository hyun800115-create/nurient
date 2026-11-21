# 03 · Buildings, props, stations, pads and draw order (depth), see-through buildings, culling, stack baking — Unity port spec

Source: Phaser 3.90 game at `/home/user/nurient/frost-village` (`lib/phaser.min.js` = 3.90.0).
Target: Unity 6.3 LTS, URP 2D renderer, C# 9, Android phone, portrait.
Reader: a C# engineer who does not read JavaScript. Every number below is copied from the code; file/line references
are for audit only.

Tags: **SLICE** = needed for the go/no-go vertical slice. **LATER** = after the slice. **DROP** = Phaser workaround,
not needed in Unity.

Companion specs: `01_core_view.md` (coordinates: world px with y DOWN, `WorldSpace.ToUnity`, `JsRound`, iso helpers,
camera), `02_world_ground_static.json` (resolved positions of every zone, fence, decor, tree, plot and the
`entitiesAtStart` / `keyPoints` blocks). This spec owns: how every building/site/station/pad/prop picture is made, its
anchor, footprint collider and pads, the **depth value** of every world display object in the slice, the
**see-through (x-ray)** system, and what to do with the Phaser **Culler** and **StackBaker**.

---

## 0. Summary (read first)

| # | Item | Statement |
|---|---|---|
| S1 | Depth model | Phaser draws ONE list sorted by a float64 `depth`, stable sort, **ties keep display-list insertion order**. Everything on the ground uses `depth = anchor y` (px, y down) plus small offsets (0.001 … 2000). Fixed bands sit far below (−20000 … −10900) and far above (28000 … 50000). §3, §4. |
| S2 | Smallest offsets | Real offsets as small as **1e-6** are used (cutaway buildings, carried stacks inside buildings). A float32 depth loses everything below ~2.4e-4 at y ≈ 3450. §9.1. |
| S3 | Proposal (lead decides) | **P1 (recommended): per-frame rank** — keep `double depth` + insertion `seq` per renderer in C#, keep the list sorted (insertion sort, nearly sorted every frame), write `sortingOrder = rank`. Exact Phaser semantics incl. ties. **P2 (cheap alternative): `sortingOrder = floor(depth)` per band layer + `z = −frac(depth)`** with Custom Axis (0,0,1) sorting: exact to 6e-8 except exact ties. Not recommended: one layer per band with Y-axis sort (cannot express offsets), or z = −depth (precision loss). §9. |
| S4 | Pivot | Unity pivot must be computed from the Phaser anchor of the **untrimmed** frame and the trim rect (formula §2.2). `flipX` in Phaser mirrors inside the frame box, Unity mirrors about the pivot → add `flipShift = scaleX·srcW·(1 − 2·anchorX)` to x (§2.3). |
| S5 | X-ray | 0.1 s decision tick, three-point alpha-mask test, faded alpha **0.32**, fade `a += (target − a)·min(1, dt·10)`, snap at 0.02. Masks: 4 px cells, alpha > 110. Bake masks offline. §6. |
| S6 | Culler | **DROP.** Unity frustum-culls renderers natively. §7. |
| S7 | StackBaker | **DROP the texture baking**; replace with a `StackView` (one sort entry per pad stack, items drawn in item-index order). §8. |
| S8 | Hit areas | No world sprite has a pointer hit area. Interaction = ground-distance circles (`Pad.contains`) and collider circles. §5.1. |

---

## 1. Phaser render model the port must reproduce

| Fact | Detail (Phaser 3.90) | Unity consequence |
|---|---|---|
| One display list per scene | Game scene list holds every world object (≈2500 in a full village, ≈1600 of them props/items). | One logical list (P1) or keys per renderer (P2). |
| Sort | Before each drawn frame, if any object's depth changed: `StableSort(list, (a,b) => a._depth − b._depth)`. | Stable: equal depth → older display-list position first (drawn first = behind). |
| Insertion order | Creation appends to the list. **Re-adding** (pooled item sprite taken again: `addToDisplayList`; Culler unpark) appends again → becomes "newest" for ties. | Keep a global `seq` counter; bump an object's `seq` whenever it is created or taken from a pool. |
| Container | A container (labels, bubbles, signs) is ONE entry at its own depth; its children draw in child order; container alpha multiplies children. | `SortingGroup` on the container root (P1/P2), children `sortingOrder = child index`; multiply alpha into each child. |
| Origin | `displayOriginX = originX · width`, `width = frame.realWidth` (untrimmed source size). No rounding. | §2.2. |
| Trimmed frames | Atlases are trimmed (`spriteSourceSize`), never rotated (0 rotated frames in all atlases). Origin is relative to the untrimmed frame. | §2.2 pivot formula. |
| flipX | Content mirrored **inside the untrimmed frame box** (vertex offset `+ (−realWidth + 2·displayOriginX)` then scaleX·−1); object (x, y) does not move, the visual foot moves. | §2.3 flipShift. |
| roundPixels | `false`. Sub-pixel positions are drawn as is. | Do not snap to pixels. |
| Camera | Depth is independent of zoom/scroll. | — |

---

## 2. Sprite data and the Phaser → Unity picture mapping — SLICE

### 2.1 Data shape (one per sprite key, and per animation frame)

Manifests: `assets/<fragment>/manifest.json` → `sprites[key]`; atlas frames: `assets/<fragment>/<atlas>.json`
(Phaser JSON hash: `frame{x,y,w,h}`, `spriteSourceSize{x,y,w,h}`, `sourceSize{w,h}`, `trimmed`, `rotated=false`).

```csharp
public sealed class SpriteMeta {
    public string Key;                 // e.g. "station_grill"
    public Sprite Sprite;              // imported with the pivot of §2.2
    public Vector2 Anchor;             // manifest "anchor" [ax, ay], fraction of the UNTRIMMED frame, y down; default (0.5, 0.5)
    public Vector2Int Src;             // sourceSize (untrimmed) w, h
    public RectInt Trim;               // spriteSourceSize: x, y (from top-left of the untrimmed frame), w, h
    public Vector2? Footprint;         // manifest "footprint" [w, h] px (ground ellipse/diamond)
    public float TopPx;                // manifest "topPx": art height above the anchor (labels, rings)
    public string Overlay;             // manifest "overlay": front layer key (shops, bakery, deck)
    public Vector2[] StaffPoints;      // manifest "staffPoints" px from anchor
    public string StaffDepth;          // "front" | "behind" | null
    public float StepLiftPx;           // manifest "stepLiftPx" (clerk on a step)
    public Dictionary<string, Vector2> FxPoints, Points; // fxPoints, inPoint, outPoint, doorPoint, dropPoint ...
    public float StackStep = 10;       // items only: px between stacked copies at scale 1 (default 10)
    public OccMask Mask;               // x-ray alpha mask (§6.4), only for occluder art
}
```

### 2.2 Pivot formula (import step)

```
anchorPx = (ax · Src.w, ay · Src.h)                      // in untrimmed frame px, y down
pivotX   = (anchorPx.x − Trim.x) / Trim.w
pivotY   = 1 − (anchorPx.y − Trim.y) / Trim.h            // Unity pivot is from the bottom
Unity sprite rect in the atlas texture (y up): rect = (frame.x, atlasH − frame.y − frame.h, frame.w, frame.h)
PPU = 64  (01 spec D2)
```

Pivots may fall outside 0..1 (e.g. a front overlay whose trimmed rect does not contain the anchor) — allow it.
Every animation frame gets its own pivot from **its own** `sourceSize`/`spriteSourceSize` and the key's anchor
(station work frames have different trims: `station_grill_work_0` trim (2,28,257,197) vs idle (6,52,240,165)).
Character frames: 128×128 source, anchor (0.5, 0.8125) for every character in the manifests.

Verified examples (use as import unit tests):

| key | src | trim (x,y,w,h) | anchor | anchorPx | Unity pivot | flipShift/scale |
|---|---|---|---|---|---|---|
| tree_pine_a | 256×300 | 2,19,220,251 | 0.33203, 0.67 | 85, 201 | 0.37727, 0.27490 | 86.00 |
| station_grill | 268×228 | 6,52,240,165 | 0.44403, 0.62719 | 119, 143 | 0.47083, 0.44849 | 30.00 |
| market_s1_back | 388×328 | 19,19,335,279 | 0.32732, 0.70122 | 127, 230 | 0.32239, 0.24373 | 134.00 |
| market_s1_front | 388×328 | 19,167,168,106 | same | 127, 230 | 0.64286, 0.40566 | 134.00 |
| deck43_t1_back | 384×300 | 19,18,340,257 | 0.59375, 0.43333 | 228, 130 | 0.61471, 0.56421 | −72.00 |
| chief_lodge | 548×528 | 2,19,505,486 | 0.41606, 0.67235 | 228, 355 | 0.44753, 0.30864 | 92.00 |
| fence_post | 120×140 | 9,18,82,97 | 0.28333, 0.61429 | 34, 86 | 0.30487, 0.29896 | 52.00 |
| site_plot_M | 428×340 | 20,94,309,184 | 0.39953, 0.58235 | 171, 198 | 0.48867, 0.43479 | 86.00 |
| worker_hut | 380×368 | 3,19,341,324 | 0.39474, 0.65489 | 150, 241 | 0.43109, 0.31482 | 80.00 |
| ui_pad_input | 192×96 | 11,4,170,90 | 0.5, 0.5 | 96, 48 | 0.50000, 0.51111 | 0 |
| item_fish_cooked | 72×72 | 4,37,53,22 | 0.5, 0.75 | 36, 54 | 0.60377, 0.22727 | 0 |

Missing art: Phaser falls back to placeholder pictures (`core/Placeholders.js`: items anchor (0.5, 0.75), trees
(0.5, 0.9), stump (0.5, 0.7), else the manifest anchor or (0.5, 0.5)). The slice may use a magenta quad with the
same anchor.

### 2.3 Image state → Transform / SpriteRenderer

Keep, for every world picture, a C# record with the **Phaser** fields; derive Unity state from it. Never read
positions back from the Transform for game maths (occlusion, colliders).

```csharp
public sealed class WorldImage {           // mirrors a Phaser Image/Sprite
    public double X, Y;                    // world px (y down) = the anchor point
    public float ScaleX = 1, ScaleY = 1;   // Phaser scale (positive for every slice picture)
    public bool FlipX; public float AngleDeg; public float Alpha = 1; public Color Tint = Color.white;
    public bool Visible = true; public double Depth;  // see §4
    public SpriteMeta Meta;
    public float DisplayWidth  => Meta.Src.x * Mathf.Abs(ScaleX);   // Phaser displayWidth (UNTRIMMED)
    public float DisplayHeight => Meta.Src.y * Mathf.Abs(ScaleY);
    public void Apply(Transform t, SpriteRenderer r) {
        double shift = FlipX ? ScaleX * Meta.Src.x * (1 - 2 * Meta.Anchor.x) : 0;   // Phaser mirrors inside the frame box
        t.position = WorldSpace.ToUnity((float)(X + shift), (float)Y);              // (px/64, −px/64)
        t.localScale = new Vector3(ScaleX, ScaleY, 1);
        t.localEulerAngles = new Vector3(0, 0, -AngleDeg);                          // Phaser angle is clockwise on screen
        r.flipX = FlipX; r.enabled = Visible;
        r.color = new Color(Tint.r, Tint.g, Tint.b, Alpha);                         // Phaser tint = multiply
    }
}
```

* `setDisplaySize(w, h)` (pads) means `ScaleX = w / Src.w`, `ScaleY = h / Src.h` — **untrimmed** size, not
  `sprite.bounds`.
* Rotation pivot: Phaser rotates about (X, Y). For an unflipped picture that is the anchor = Unity pivot (exact). For a
  flipped AND rotated picture (flipped border trees wobbling ±4° when chopped — border trees are not choppable, so in
  practice only flipped boats/ice floating on the water) Unity rotates about the visual anchor instead; difference
  ≤ a few px. Accept (R7).
* Phaser `Assets.apply(img, key)` re-sets texture **and** origin from the new key (e.g. tree → stump, site plot →
  foundation). In Unity: swap `Sprite` (each has its own pivot) — same effect.
* The collider of a flipped static picture moves with the foot: `fx = x + (Src.w − 2·Anchor.x·Src.w)·scale`
  (`Game.staticImage` 564–581). Same value as `flipShift`.

---

## 3. Depth constants (copy verbatim) — SLICE

From `src/systems/DepthSort.js` 4–29 and the users listed. `DepthSort` (the class) is **unused** (no caller of
`depthSort.add`); only the `DEPTH` constants matter.

| Name | Value | Used by (slice unless noted) |
|---|---|---|
| WATER | −20000 | sea tile sprite (02 spec / water spec) |
| FISH | −19900 | fish shadows under the old sea |
| WAVES | −19800 | waves |
| GROUND | −15000 | ground bake tiles: `GROUND − lv` (lv = LOD level 0,1,2…) |
| FLOOR | −14000 | zone floors; roads overlay `FLOOR + 10` |
| GROUND_DECAL | −13500 | plot picture `+5`; life decals `+2`; shop rug `+2`, rug icons `+3` (LATER); deck landing plain `+9`, landing picture `+10` |
| OUTLINE | −13000 | locked-zone dashed outline; ghost pictures `OUTLINE + 1 + y·0.01` |
| PAD | −12000 | every floor pad picture; navigator line/chevron `+3`, end ring/pulse `+4`; onboarding ring `+50` |
| PAD_ITEM | −11900 | pad icon `PAD_ITEM − 1` = −11901 |
| PAD_TEXT | −11800 | locked-zone lock icon + name; unlock-pad "done" check; sparkle loop `+1` |
| SHADOW | −11000 | every character's soft shadow (all equal) |
| DUST | −10900 | ground particle emitter ('dust' preset) |
| (world) | ≈ −200 … 3450 (+ offsets up to +2000) | everything standing on the ground: `depth = y + offset` |
| PAD_LABEL | 28000 | paid pads' and plots' name labels: `28000 + y·0.1` (≤ 28345) |
| PAD_PRICE | 28900 | unlock pad coin icon + price text |
| FOG | 29000 = FLY − 1000 | territory fog (`FOG + 1…5`, banks `+1 + (y % 97)·0.001`) — territory spec |
| FLY | 30000 | items in flight `30000 + (n mod 100)`; projectile arrow; dog toy |
| FX | 31000 | default one-shot fx sheets and burst emitters; night overlay `FX − 30` (LATER), glows `FX − 29`, smoke puffs of towers `FX − 20`, snowfall `FX − 10` |
| BUBBLE | 40000 | customer want bubble `BUBBLE + 50 − slot`; emote bubbles `BUBBLE + 10 + y·0.001`; chat bubbles `BUBBLE + 20 + y·0.001`; zzz/music loops `BUBBLE`, `BUBBLE − 5` |
| LABEL | 41000 | float texts, site/pad progress rings (`LABEL − 2`, `−1`, `0`, `+1`), coin spin loop `LABEL − 5`, warehouse label `LABEL − 20`, carry pill / navigator badge `LABEL − 40` |
| ARROW | 45000 | tutorial arrow |
| TOP | 50000 | (unused in the slice) |

Per-object world offsets are in §4. Value range for the int16 analysis (§9): min −20000, max 45000 (+50 bubble).

---

## 4. Depth rule for every world object in the slice — SLICE

`y` = the object's anchor y in world px. "px" offsets are y-down.

### 4.1 Static pictures

| Object | Depth | Notes / source |
|---|---|---|
| Static image (decor, border/extra trees, fences, worker huts, tents, pier, boats) | `y + depthOff` (`depthOff` from world data, default 0) | `Game.staticImage` 564–581 |
| Forest tree / region tree / rock | `y` | `ResourceNode.js` 56, 110 |
| Wheat plot | `y − 30` | `ResourceNode.js` 180 (LATER: farm zone) |
| Life prop (benches, snowmen…) | `y`; decal kind → `GROUND_DECAL + 2` | `VillageLife.js` 105–108 |
| Seat on a life prop ('front' seats) | sitter drawn at `prop.y + 1 + seatDy·0.001` | `VillageLife.js` 169, `Resident.js` 221 |
| Locked-zone ghost pictures | `OUTLINE + 1 + y·0.01`, alpha 0.2, tint 0x9fb3cc | `Game.makeLockedOutline` 526–561 |
| Campfire flame loop | `fx_fire` sheet at (x, y − 14), size 58, depth `y + 1` | `Game.buildDecor` 679 |

### 4.2 Characters (player, residents, customers, clerks, builders, porters) — `Character.sync` 139–172

```
d = y                                   // default
foreach interior I in gs.interiors:      // deck (slice), staged shop stage 4, cutaway buildings (LATER)
    q = I.Occupy(ch); if (q != null) { d = q.depth; lift = q.lift; break; }
body.Depth  = d;   body drawn at (x, y − liftY)   // liftY eases to lift: liftY += (lift − liftY)·min(1, dt·14)
shadow.Depth = SHADOW (−11000); shadow at (x, y + 1 − liftY + shadowDy); size (shadow[0]·1.15, shadow[1]·1.3)
carried-stack base depth sd = (d != y) ? d ± 2e-6 : y ± 0.5      // + when in front, − when "behind"
```

* Clerk at a shop counter (`Register` clerk, state 'post', art `staffDepth: "front"`): body depth = `shop.y + 0.5`
  (between shop back `y` and front overlay `y + 1`); drawn `stepLiftPx` higher (stage-1 stall: 7 px; eases in over the
  last 24 px: `ly = d < 24 ? L·(1 − d/24) : 0`, d = gdist to the staff point) (`Register.js` 232–246).
* Resident sitting on a 'front' seat: body depth = seat depth (above). Seated chief in the office: LATER.
* Builders, customers, porters, residents, animals: plain `d = y`.
* Fishers on the deck: deck interior (§4.6).

### 4.3 Carried stacks (unbaked) — `ItemStack.layout` 210–274

Position of the base (`Character.sync`): head carry (default, `carryOnHead: true`, humans): `dx = ±HEAD_DX[dir]`
(S 0, SE 3, E 5, NE 3, N 0; negated when flipped), `dy = headTop + 4`, behind = false. Otherwise
`carryPoint[dir] = [dx, dy, behind]` from the character manifest. The base glides: `cd += (target − cd)·min(1, dt·16)`.
Bob: moving (v² > 100) `|sin(walkT)|·−2` with `walkT += dt·12`, else `sin(now_ms/400)·0.6`. Scale 0.62
(`balance.player.carryScale`).

```
for item i (single column, cols = [[0,0]], perCol 1000):
   h_i   = Σ_{k<i} stackStep(type_k) · scale
   k     = sway ? (i/10)^2 : 0;   wob = sway && i>0 ? sin(walkT·2 + i·0.5)·0.6·i/10 : 0
   pos   = (bx + lean·k + wob, by − h_i − hop_i)
   depth = sd + c.y·0.01 + i·0.0005 + 0.001                    // c.y = 0 here
lean spring: target = −vx·0.045; leanV += ((target − lean)·60 − leanV·9)·dt; lean += leanV·dt
hop (landing bounce): hop −= dt·5 (from 1); offset sin(hop·π)·8; scale (s·(1+hop·0.25), s·(1−hop·0.15))
```

Other modes (same file): `alternate` towers: depth `sd + c.y·0.01 + i·0.0005 + 0.001`, column `i mod nCols`, a tower
stops rising after `drawMax`; `typeCols` towers: depth `sd + c.y·0.01 + hs[col]·0.0001 + 0.001` (hs = tower height
so far, px). Site material stock uses `typeCols` unbaked (§5.8).

### 4.4 Pad stacks (baked in Phaser) — `ItemStack.layoutBaked` 280–303, `place` 314–343

A pad stack (station input/output, piles, shop shelf, cash pile) is **one** picture at the stack base `(bx, by)`,
depth `stackDepth + 0.001`. Inside it, items are drawn **in item-index order** (later items on top), at the positions
`place()` computes. While an item that just flew in waits for the next bake it is a separate sprite at the same
`stackDepth + 0.001`. See §8 for the Unity replacement.

| Stack | base (bx, by) | stackDepth | options |
|---|---|---|---|
| Station input | (inPad.x, inPad.y + 6) | inPad.y | scale 0.92, cols [[−13,−4],[13,5]], alternate, max 30 (grill) |
| Station output | (outPad.x, outPad.y + 6) | outPad.y | scale 1, cols [[−15,−4],[15,5]], alternate, max 36 |
| Collection pile | (x + stackAt.x, y + stackAt.y) or (x, y + 6) | `y + propAt.y + 1` if stackAt, else `y` | scale `stackScale` or 0.9; default 7 cols [[−30,−10],[0,−12],[30,−10],[−16,2],[16,2],[−30,12],[30,12]]; alternate, max 40, drawMax 42 |
| Shop shelf (stage 1) | (shelf.x, shelf.y + 6) | shelf.y | scale 0.95, cols [[−28,−2],[0,10],[28,−2]], typeCols {fish_cooked:0, bread:1, meat_cooked:2}, max 160, drawMax 18 |
| Cash pile | (x, y + 4) | y | scale 0.85, cols [[0,−16],[−22,−5],[22,−5],[0,6],[−44,6],[44,6],[−22,17],[22,17],[0,28]], perCol 5, max 48 |

`place()` (positions only):
```
typeCols:  col = typeCols[type] ?? 0; it.pos = (bx + c.x, by + c.y − hs[col]); if (++cnt[col] < towerLim(type)) hs[col] += step(type)·scale
           towerLim = min(drawMaxBy[type] ?? drawMax ?? ∞, towerCap ?? ∞);  towerCap = tall (see §8.2)
alternate: col = i mod n; it.pos = (bx + c.x, by + c.y − hs[col]); if (i + n < (drawMax ?? ∞)) hs[col] += step·scale
perCol:    columns filled one after another, perCol items each; pos = (bx + c.x, by + c.y − h); h += step·scale
```
`stackStep` px: fish_raw 11, fish_cooked 9, log 13, plank 8, wheat 11, bread 13, ingot 9, meat_cooked 11, coin 8.

### 4.5 Pads, labels, rings, effects

| Object | Depth |
|---|---|
| Any floor pad picture (`Pad`) | PAD = −12000 (all equal → creation order) |
| Pad icon | PAD_ITEM − 1 = −11901 |
| Operator spot pad with `padDepth` (bakery doorway) | `station.y + padDepth` (LATER) |
| Deck reel pad | PAD (raised by `landLift` px in y) |
| Floating name label of operator spot / register / pile | container at `y + 1990` (y = the spot/pad y) |
| Floating label of trash pad, food box, store floatLabel | `y + 2000` |
| Paid pad label (UnlockPad), plot label (Site) | PAD_LABEL + y·0.1 (y = pad y / drop pad y) |
| Unlock pad coin + price | PAD_PRICE = 28900 |
| Rings: site build progress / pad pay progress | LABEL − 2 (bg), LABEL − 1 (arc), LABEL (icon) / LABEL, LABEL + 1 |
| Coin spin over a cash pad | LABEL − 5 = 40995 |
| Item in flight (`Effects.fly`) | `FLY + (flyCounter++ mod 100)` (global counter; wraps) |
| One-shot fx sheet (`Effects.sheet`) | `opts.depth ?? FX` (station smoke puff `station.y + 2`; builder dust `builder.y + 1`; build-done `FX`) |
| Looping fx (`Effects.loop`) | given depth (station fire `station.y + 1`) |
| Burst emitters | FX, or DUST for 'dust' |
| Float text (+coins) | LABEL |
| Customer want bubble | BUBBLE + 50 − max(0, slot) |
| Emote / chat bubbles | BUBBLE + 10 + y·0.001 / BUBBLE + 20 + y·0.001 |
| Tutorial arrow | ARROW |
| Snowfall emitter | FX − 10 |

### 4.6 Fishing deck (the first station) — `FishingDeck.js` 45–130, 227–233, 294–302, 440–505 — SLICE

`base = deck.y − 90` (deck at (1073, 299) → base 209).

| Layer | Depth | Position |
|---|---|---|
| plain stand-in (only while art missing) | base − 0.01 | — |
| back picture `deck43_t{tier}_back` | base | (x, y) |
| rod fish (bite state, at the float) | base + 0.05 | animated |
| rod holder k (k = 0,1,2) `deck43_rod_{idle,bite,hooked}` | base + 0.2 + k·0.01 | (P(rod).x, P(rod).y − lift) |
| lines + floats (graphics) | base + 0.25 | — |
| rod fish (hooked state) | base + 0.27 | — |
| fisher on the deck (interior occupy) | base + 0.4 + y·1e-5 (on the gangway: base + 0.9 + y·1e-5), lift `deckLift ?? 17` | — |
| front picture `deck43_t{tier}_front` | base + 0.6 | (x, y) |
| landing picture `deck43_landing` | GROUND_DECAL + 10 | landing at (1100, 380) |
| landing plain stand-in | GROUND_DECAL + 9 | — |
| chief's line/float/rings (graphics) | landing.y − 1, then every frame `player.body.depth − 0.002` | — |
| chief on the landing planks | depth y (normal), lifted `landLift` = 8 px | inside `plankPoly` |

`P(mx, my) = (JsRound(x + 45.25·(mx + my)), JsRound(y + 22.63·(mx − my)))`. Config: lift 17, tiers {1:[−1.3,1.3,−1.3,1.3],
2:[−2.5,1.3,−1.3,1.3], 3:[−3.7,1.3,−1.3,1.3]}, gangway [0.1, 1.2], stools [[−0.35,0.75],[−1.55,0.75],[−2.75,0.75]],
rods [[1.12,1.12],[1.12,0.32],[0.32,1.12]], landing {at (1100,380), lift 8, planks [−0.5,0.5,−0.62,0.6], walk
[−0.3,0.3,−0.42,0.36], fan 20, bob [−0.2,1.7]}, reel (1089, 386). Deck pad: kind 'input', sizeM 0.62, tex
`ui_pad_register` (fallback `ui_pad_input`), tint 0xcfe6ff, icon item_fish_raw size 20; pad alpha 1 while the chief is
on it, 0.12 while his line is out, else 0.85 (`a += (t − a)·min(1, dt·8)`, icon alpha = a·0.65).
Six raw-fish pictures at scale 0.55 hang on the rods (stock 0..6). **The deck is not an occluder.**

### 4.7 Staged shop, stage 1 「눈꽃 노점」 (first shop) — `Seller.js` 1175–1320, `Register.js` — SLICE

Shop at (1207, 782) (`market_s1_back`).

| Layer | Depth |
|---|---|
| back `market_s1_back` | y = 782 |
| sign board (canvas text, origin (0,0), scale 1/3, sheared) | y + 0.2 |
| counter name plates / plate icons (stages 2–3) | y + 0.2 / y + 0.25 (LATER) |
| clerk at her post | y + 0.5 |
| front overlay `market_s1_front` (counter) | y + 1 |
| shelf stock (pad stack) | shelf.y + 0.001 = 835.001 |
| cash pile | 900.001; coin spin LABEL − 5 |
| register pad / label | PAD / 859 + 1990 = 2849 |
| customers in line | their y (they stand in front: y > 782) |

Stage 4 (LATER): `occupy` lifts characters in the strip in front of the counters to `y ≥ shop.y + 2 ? y : shop.y + 1.5 +
clamp01((y − shop.y + 160)/162)·0.4`, and sets `noXray` while there.

### 4.8 Stations — `Station.js` 14–53, 88–90

Picture `cfg.sprite` at (x, y), depth y; it is a Sprite (work loop anim `spr:<key>:work`, plays while working, idle
frame after 0.35 s idle). Fire loop `fx_fire` at (x + fire.x, y + fire.y), size 46, depth y + 1, visible only while
working (grill fire [0, −30]). Smoke puffs `fx_smoke_puff` at (x + smoke.x, y + smoke.y), size 120, depth y + 2
(stations with `smoke`), every 0.5–0.9 s while working and within 150 px of the screen. Squash "pop" on each product:
scale (1.06, 0.94) → elastic back over 198 ms.

---

## 5. Entity creation recipes — SLICE unless tagged

Positions: `02_world_ground_static.json` (`entitiesAtStart`, `keyPoints`, `decor`, `trees`, `fences`, `plots`).

### 5.1 Common pieces

**Pad** (`Pad.js` 1–35): `w = 90.5 · sizeM`; picture `ui_pad_<kind>` (or `tex`), origin (0.5, 0.5),
display size (w, w/2), depth PAD, optional tint. Reach `r = (w/2) · (radiusK ?? 0.78)`;
`Contains(px, py, extra=0) = gdist2(px, py, x, y) < (r + extra)²` (gdist: y doubled, 01 spec). Icon (optional):
picture `icon` at (x, y), `s = iconSize / max(Src.w, Src.h)`, scale (s, s·0.62), origin (0.5, 0.6), alpha 0.55, depth
PAD_ITEM − 1. `Pulse()`: scale ×1.08 then back over 220 ms (Quad out).

**Label container** (operator spot, register, pile, trash): panel `ui_panel` (9-slice) + text, alpha 0.9–0.94, origin
centre; bobs `labelBaseY + sin(now/430 + phase)·3`; fades to 0 while the chief stands on its pad
(`a += (t − a)·min(1, dt·10)`).

**Collider circles** (consumed by the nav/collision spec): radius in "ground px" (gdist space).
DECOR_R (static decor, ×scale): barrel 20, crate 26, lamp_post 12, flag_pole 14, bench 40, firewood_pile 36,
hay_bale 30, signpost 12, campfire 30, bush_snow 24, ice_chunk/snow piles 0, tent_a 80, chief_lodge 170, worker_hut 98,
dock_pier 0, boat_small 0, mine_entrance 120, tree_stump 18, upgrade_bench 70; trees 24; fence_post 16; fence logs 22.

| Entity | Collider |
|---|---|
| Station / Workshop / Warehouse | footprint.w · 0.42 (default footprint 190) at (x, y) |
| Site foundation/scaffold | footprint.w · 0.36 (active only in foundation/scaffold) |
| House | footprint.w · 0.4 |
| Stage-1 shop | footprint.w · 0.44 at (x + 0, y + 0) (195 · 0.44 = 85.8) |
| Tower | footprint.w · 0.34 |
| Boathouse | footprint.w · 0.38 at (x − 10, y + 4) |
| Rock | footprint.w · 0.38 |
| Pile prop | `propR` (default 22) at the prop |
| Chief hut | 9 wall circles from world data (02 `entitiesAtStart.chief_hut.walls`) |

No world picture has a pointer hit area (`setInteractive` is never used on world objects). Building taps exist only
for cutaway buildings (reveal polygon, LATER).

### 5.2 Static image (`Game.staticImage` 564–581)

```
img = picture(key) at (x, y); Depth = y + (depthOff ?? 0)
if flip: FlipX = true;  if scale: ScaleX = ScaleY = scale
collider r = opts.r ?? DECOR_R[key]; at (x + flipShift, y) with radius r·scale
occluder if key matches ^tree_pine | lodge | hut | tent | mine_entrance | market | trade_post | station_   (§6.2)
```

### 5.3 Fences (`Game.buildFences` 617–670)

Per fenced zone edge (tl/tr/bl/br), unit segments every 1 m: `n = floor(len)`, `off = (len − n)/2`, segment centre
`m = off + i + 0.5`, point `isoPt(centre, local)`; skip segments inside a gap `[g0, g1]`. Segment picture
`fence_log_x` (edges along +X) or `fence_log_y` (along +Y), collider 22. Posts `fence_post` (collider 16) at run starts
after a gap, at run ends before a gap and at the edge ends (unless a gap reaches within 0.6 m of that end); posts are
de-duplicated on the key `JsRound(x/6) + ',' + JsRound(y/6)`. All via §5.2 (depth = y). Resolved list: 02 `fences`.

### 5.4 Trees, rocks (`Game.buildTrees` 821–845, `buildResources` 847–933)

Border/extra trees: static images (02 `trees`, with `flip` and `scale`). Forest trees (`Tree`): picture key at (x, y),
depth y, scale 0.9 (`WORLD.trees.scale`), collider 24, always an occluder. Chopped: wobble angle ±4° → 0 over 380 ms
(elastic), depleted → `tree_stump`. Rocks: depth y.

### 5.5 Station + operator spot + pile (the grill line)

Grill (02 `entitiesAtStart.grill`): station (1004, 590) `station_grill`; inPad = station + in (−97, −49) = (907, 541),
outPad = station + out (97, 49) = (1101, 639), both `Pad(kind 'input'/'output', sizeM 1.45, icon input/output item,
iconSize 44)`. Not an occluder (display height above anchor = 228 · 0.62719 = 143 ≤ 190).

Operator spot (`Labour.js` 58–90): `pad` offset (grill: [−70, 35] → (934, 625)); `Pad(kind 'input', sizeM 1.3, tex
ui_pad_register (fallback ui_pad_input), tint 0xfff2c0 (fallback 0xffd27a))`; label container at (x, y − 48), depth
y + 1990, text 19 px, panel 100×40 (width max(84, text + 30)). Operator post (grill [57, −28]), dir SW; the chief works
with anim 'give' facing SE.

Pile (`Labour.js` 311–360; fish crate pile at (1000, 440)): `Pad(kind 'output', sizeM 1.45, icon item, iconSize 44,
tint 0xf3e2c4)`; prop `fish_crate` (fallback `crate`) at (x + propAt) = (938, 454), depth 454, collider 24; stack base
(x + stackAt) = (943, 435), stackDepth = 440 + 14 + 1 = 455, scale 0.7, 9 cols [[−19,−7],[0,−8],[19,−7],[−19,0],[0,−1],
[19,0],[−19,7],[0,6],[19,7]]; label at (x + labelX, y + labelY) = (956, 362), depth 440 + 1990 = 2430. Hidden until the
first catch (`setShown(false)`). Meat rack (LATER): posts `fence_post` at (x ∓ 40, y ∓ 2) depth y ∓ 2, beam graphics
depth y + 1.

### 5.6 Shop stage 1, cash pad, register, customers

Shop (`Seller.js` 1175–1230): back picture depth y, front overlay depth y + 1 (fades with the shop's x-ray),
sign y + 0.2 (fades with it); collider §5.1; shelf `Pad('input', 1.6, icon item_fish_cooked, iconSize 40)` at shelf;
stock §4.4; cash pad §4.4 with `Pad('cash', 1.5)`; registers: seats A (first clerk), M, B, M2 all built on the stall;
seat A pad `Pad('register', 1.3)` (tex `ui_pad_register`; fallback `ui_pad_unlock` tinted 0xbfe0ff with clerk icon),
label (x, y − 46) depth y + 1990. Clerk post = art `staffPoints[k]`; stage 1 = (29, −6) from the shop anchor,
`staffDepth "front"` → clerk depth shop.y + 0.5, `stepLiftPx` 7. Customer want bubble: container at
(x + bubbleDX, y + headTop − 6 + bubbleDY + sin(now/300 + x)·2), depth BUBBLE + 50 − slot, scale eases
(`k = min(1, dt·12)`) to `0.9 / 0.72 / 0.62` for slot 0 / 1 / ≥2 at stage 1 (bubbleDX 0, bubbleDY 0), and to
`0.74 / 0.64 / 0.56` with bubbleDX −22, bubbleDY +8 at stages ≥ 2.

### 5.7 Unlock / hire pads (first: hire clerk at (1525, 900)) — `UnlockPad.js` 33–66

`Pad(kind 'unlock'|'hire'|'upgrade', sizeM 1.9, radiusK 0.8)`; coin icon at (x − 30, y + 2) scale 30/max(src), depth
PAD_PRICE; price text (x − 10, y + 2), 30 px, depth PAD_PRICE; label container at (x + labelAt.x, y + labelAt.y)
(default (0, −62)), depth PAD_LABEL + y·0.1; pay ring at (x, y − 118): bg LABEL (scale 64/max), arc LABEL + 1;
sparkle loop `fx_sparkle` (x, y − 30) size 150 depth PAD_TEXT + 1.

### 5.8 Construction sites — `Site.js` 23–27, 52–330, 391–420

Footprints/defaults per size: S {drop (2, 64), work [[−81,27],[79,29]] dirs NE,NW, footprint 181×91}; M {drop (2, 87),
work [[−111,35],[107,37],[−66,60]], footprint 272×136}; L {drop (2, 110), work [[−140,43],[135,46],[−79,76]],
footprint 362×181}; XL {drop (−210, 111), work [[−181,−25],[49,91],[−80,40]], footprint 525×262}. Manifest
`site_plot_<S|M|L>` values override (except XL). A plot may set its own `drop` (absolute px).

| State | Picture | Depth | Pads / labels |
|---|---|---|---|
| plot | `site_plot_<size>` | GROUND_DECAL + 5 (lies flat) | build pad `Pad('build', 1.6, tex ui_pad_build/ui_pad_hire, radiusK 0.8)` at drop; label at (dropX, dropY − 60), depth PAD_LABEL + dropY·0.1, alpha 0.3 while the chief is on the pad |
| foundation | `site_foundation_<size>` | y | drop pad `Pad('input', 1.5, icon plank/ingot, 44)`; material stock unbaked typeCols {plank:0, ingot:1}, cols [[−18,−3],[18,6]], scale 0.85, base (dropX, dropY + 6), stackDepth dropY; label alpha 0.45 while on the pad |
| scaffold | `site_scaffold_<size>` | y | ring at (x, y − topPx(scaffold) − 40): bg LABEL − 2 (scale 58/max), arc LABEL − 1 (r 21, width 8, 0xffb648), icon LABEL (scale 28/max); 2 builders (Characters) |
| done | building (§5.10) | building rule | — |

Appearing / stage changes: scale 0.01 → 1 over 420 ms (Back out) about the anchor; scaffold swap (0.9, 0.6) → 1 over
380 ms. XL: a container at depth y with two L pictures at (−81, −41) and (81, 41). Replace mode (chief hut plot): the hut
stays drawn while plot/foundation; the plot picture is hidden.

### 5.9 Chief hut, worker hut, trash pad, workshop43, bakery

Chief hut (`ChiefHut.js` 14–26): `chief_lodge` at (600, 640), depth y, occluder, never culled. Fisherman's worker hut:
static `worker_hut` scale 0.8, collider 80 (02 `entitiesAtStart.fisherman_hut`). Trash pad (−45, 585):
`Pad('input', 1.35, icon ui_icon_close 30)` tint 0xffd9c2, label (x, y − 50) depth y + 2000. Workshop43 (bench at
(945, 986)): static picture `workshop43` (collider 74), sign y + 0.5; **hidden at new game**. Bakery cottage + stall:
hidden until `bld_bakery` (LATER; back y, front y + 1, sign y + 0.2, cottage pad depth `station.y + padDepth`).

### 5.10 Finished buildings (for "a v4.x save shows its layout")

| Building key | Pictures and depth | Occluder flags | Tag |
|---|---|---|---|
| house_a/b/c | one picture, y | yes; `chiefOnly` when plot cfg `side43` | SLICE (layout) |
| toolsmith, cannery (Workshop) | station picture y; pads/stacks as stations (in/out points from manifest, defaults in (−158, 38), out (77, 79)) | via Station rule (> 190 px tall) | SLICE (layout) |
| warehouse | picture y; label LABEL − 20 at (x, y − topPx − 30) | yes | SLICE (layout) |
| boathouse | picture y; boats move with own depth | yes | SLICE (layout), boats LATER |
| watchtower | sprite y; beacon fire linked occluder (box hw 60, y + 1, top = (y + 1) − (fire.y − 130)) | yes | SLICE (layout) |
| store (general store) | picture y | yes | SLICE (layout) |
| town_hall, big_restaurant, chief_office, bank42, depot42 | multi-layer: Cutaway layers at `base + 0.01·i` in manifest drawOrder; restaurant decor `y + depthOff` | cutaway reveal instead of x-ray | closed exterior SLICE (layout, **M1b**; art = Tier B+ of 00 §5.3, which resolves the old contradiction with 05 Tier C), interiors LATER |
| market stages 2–4 | back y, front y + 1, sign y + 0.2, plates y + 0.2/0.25 | yes (stage 4 `chiefOnly`) | SLICE (layout) |
| deck tiers 2–3 | as §4.6 with `deck43_t2/_t3` | no | SLICE (layout) |

---

## 6. See-through buildings (x-ray) — `systems/Occlusion.js` 1–147 — SLICE

### 6.1 Constants

| Name | Value |
|---|---|
| MASK_STEP | 4 px of picture per mask cell |
| alpha threshold for "solid" | source alpha > 110 (0..255) |
| FADED (target alpha when see-through) | 0.32 |
| ZONE_FADE (town rows) | 0.42 (LATER) |
| decision interval | 0.1 s (first decision on the first tick) |
| fade | `k = min(1, dt·10)`; `a += (target − a)·k`; snap to target when `|a − target| < 0.02` |
| character margin | x ∈ [view.x − 80, view.right + 80], y ∈ [view.y − 40, view.bottom + 160] |
| occluder margin | skip if `o.x + 2.5·hw < view.x` or `o.x − 2.5·hw > view.right` or `o.y < view.y − 20` or `o.y − top > view.bottom` |
| vertical window | test only if `o.y − top < c.y < o.y − 4` |
| horizontal window | test only if `|c.x − o.x| ≤ hw + 22` |
| sample points | (c.x, c.y − 18), (c.x, c.y + 0.55·h), (c.x, c.y + h + 12), h = `c.headTop` (fallback −80) |
| needed hits | ≥ 2 for `big` occluders (display width > 250), ≥ 1 otherwise |

`view` = the camera's visible world rect in px **as last drawn** (Phaser `worldView`).
headTop values (manifest): player −81, fisherman −83, villager_a −81 / b −90 / c −84, npc_aunt −89, npc_clerk_a −82,
deer −56, boar −43, pet_dog −39 (characters spec has the full list).

### 6.2 Occluder record and who registers one

```csharp
public sealed class Occluder {
    public WorldImage Img;                 // the picture whose alpha is driven
    public double X, Y;                    // X = Img.X + (0.5 − anchorX)·DisplayWidth (centre of the frame box; flip does not move the box), Y = Img.Y
    public double Hw, Top;                 // Hw = DisplayWidth/2; Top = DisplayHeight·anchorY·0.95
    public bool Big;                       // DisplayWidth > 250
    public float A = 1, Want = 1;
    public Station Station;                // "worked" rule
    public bool ChiefOnly, MainOnly;       // MainOnly / Zone: town (LATER)
    public int[] Zone;                     // [i0, i1, j0, j1] in L4 cells (LATER)
    public Occluder Link;                  // linked layer: fades with Link (its own box is never tested: Y = −1e9, Hw = Top = 0)
}
```

| Registered by | Condition | Flags |
|---|---|---|
| static image (§5.2) | key regex `^tree_pine\|lodge\|hut\|tent\|mine_entrance\|market\|trade_post\|station_` | — |
| forest trees, region trees | always | — |
| Station (and Workshop, BakeryStation) | `DisplayHeight · anchorY > 190` (smelter, smokehouse, bakery, toolsmith, cannery; **not** grill, sawmill) | Station = this |
| Staged shop back picture | always | ChiefOnly = (stage ≥ 4); front overlay, sign, plates → Link |
| Chief hut | always | removed when the office scaffold goes up |
| House | always | ChiefOnly if plot `side43` |
| Warehouse, Boathouse, Tower | always | tower beacon: own record linked to the tower |
| Life props | manifest `topPx > 70` | — |
| Amenity decor (LATER) | `topPx > 90` or lamp_post | — |
| Town buildings, rail station (LATER) | always | MainOnly; ChiefOnly for shop/station roles; Zone |

Worked examples: shop back at (1207, 782): X = 1207 + (0.5 − 0.32732)·388 = 1274.0, Hw = 194, Top = 328·0.70122·0.95 =
218.5, Big = true. Forest pine `tree_pine_a` scale 0.9 at (x, y): X = x + 0.16797·230.4 = x + 38.7, Hw = 115.2,
Top = 300·0.9·0.67·0.95 = 171.9, Big = false.

### 6.3 Algorithm (run once per simulation tick, after all movement, before the camera)

```
void Update(float dt):
  if (occluders.Count == 0) return
  t -= dt
  if (t <= 0):
    t = 0.1
    chars = Collect(view)
    foreach o in occluders:
      o.Want = 1
      if (!o.Img.Visible || !o.Img.Active) continue
      if (o.X + o.Hw*2.5 < view.x || o.X - o.Hw*2.5 > view.right || o.Y < view.y - 20 || o.Y - o.Top > view.bottom) continue
      if (o.Zone != null && playerCellInside(o.Zone)) { o.Want = 0.42; continue }          // LATER
      bool worked = o.Station?.Op?.Operator?.Ready == true
      foreach c in chars:
        if (worked && c != player) continue                 // a worked station only fades for the chief
        if (o.MainOnly && c != player && !c.XrayMain) continue
        if (o.ChiefOnly && c != player && !c.IsCar) continue
        if (c.Y >= o.Y - 4 || c.Y <= o.Y - o.Top) continue
        if (Math.Abs(c.X - o.X) > o.Hw + 22) continue
        double h = c.HeadTop != 0 ? c.HeadTop : -80
        int n = Solid(o.Img, c.X, c.Y - 18) + Solid(o.Img, c.X, c.Y + h*0.55) + Solid(o.Img, c.X, c.Y + h + 12)
        if (n >= (o.Big ? 2 : 1)) { o.Want = 0.32f; break }
    foreach o in occluders where o.Link != null: o.Want = Math.Min(o.Want, o.Link.Want)
  k = Math.Min(1, dt*10)
  foreach o in occluders:
    if (o.A == o.Want) continue
    o.A += (o.Want - o.A)*k
    if (Math.Abs(o.A - o.Want) < 0.02) o.A = o.Want
    o.Img.Alpha = o.A                                      // only when it changed
```

`Collect(view)`: add `c` if `c.Alive && !c.NoXray && c.Sprite.Visible` and inside the character margin. Sources in this
order: player; workers; porters; raw porters; animals (enabled, not dead); shop line + leaving customers; general store
line + leaving (if enabled); trade merchant (if enabled); big-restaurant subjects (LATER); residents with `!Lod`; town /
train subjects (LATER). `NoXray = true` for: station operators, register clerks, merchants, office/bank staff,
restaurant staff; builders are `false`.

Timing check: 1 → 0.32 at 60 fps takes 20 frames (0.33 s); at 30 fps 9 frames (0.30 s). The fade is frame-rate
dependent by design of the formula: keep it as written for parity.

### 6.4 Solid test and mask

```
int Solid(WorldImage img, double x, double y):            // 1 = opaque at world point (x, y); unknown mask → 1
  m = img.CurrentFrameMeta.Mask; if (m == null) return 1
  double lx = img.Meta.Anchor.x*img.Meta.Src.x + (x - img.X)/img.ScaleX       // untrimmed frame coords
  if (img.FlipX) lx = img.Meta.Src.x - lx
  lx -= m.ox                                                  // m.ox, m.oy = trim x, y of THIS frame
  double ly = img.Meta.Anchor.y*img.Meta.Src.y + (y - img.Y)/img.ScaleY - m.oy
  if (lx < 0 || ly < 0 || lx >= m.cw || ly >= m.ch) return 0
  return m.data[(int)(ly/4)*m.w + (int)(lx/4)]
OccMask { int w = ceil(cw/4), h = ceil(ch/4), cw, ch (trimmed size), ox, oy (trim offset); byte[] data }  // cell = 1 if any px alpha > 110
```

Rotation is ignored (as in Phaser). Bake masks **offline** (editor script or the asset pipeline) for every frame of
every occluder sprite (kinds building/station, trees, decor/life props with topPx > 70, shop/bakery/deck layers); do not
enable texture Read/Write at runtime (memory). Animated occluders (station work loop, tower) use the current frame's
mask.

### 6.5 Where it plugs in

* Runs inside the game tick (Phaser `Game.tick`, after onboarding/flags, before zoom/camera; `Game.js` 2230). With the
  admin ×2/×4 speed it runs 2–4 times per frame (LATER).
* Writes only `Alpha` of occluder pictures. Other code that tweens the same picture's alpha (none in the slice) would
  fight it exactly as in Phaser.
* Unity: `SpriteRenderer.color.a`. Linked pictures (shop front, sign) get the same alpha through their own records.

---

## 7. Culler — `systems/Culler.js` 1–198 — DROP

What it does in Phaser (for the record): before each drawn frame, marks pictures whose box is outside
`viewRect ∪ lastView ∪ camTarget ∪ camFocus` (+ MARGIN 300 px, zoom target considered) as not drawn (camera filter),
and removes plain `props*` Images farther than PARK_OUT 450 px (+ PARK_TALL 400 below) from the display list, re-adding
them inside PARK_IN 250 px (hysteresis); container bounds re-measured every 400 ms; on mid/low presets the full pass
runs every 2nd/3rd frame unless the camera moved > 40 px or zoomed. It never changes gameplay `visible` flags.

Unity: renderers outside the camera are culled natively. The only consequence for this spec: in P1 (§9) the rank sort
may be restricted to keys whose position is inside `view + 300 px`, which mirrors the Culler rect; keys outside keep
their last rank. Port the PARK numbers only if profiling on a low-end phone shows CPU cost from ~2500 renderers
(then disable far static GameObjects with the same hysteresis). Side effect not to emulate: an unparked prop is
re-appended to the Phaser list, so its tie order changes; props never tie with their neighbours in practice.

---

## 8. StackBaker — `systems/StackBaker.js` 1–160 — DROP the baking, keep the look

### 8.1 What Phaser does

One shared 1024×1024 dynamic texture `fv_stackbake`; every pad stack (bake: true/'eager') reserves a slot with a
skyline packer (4 px columns, PAD 2 px), and is drawn as ONE Image of its slot. Redraws are batched at most 15 per second
(FLUSH_HZ 15) right before a frame, immediately (`urgent`) when an item leaves a stack near the view, deferred for
stacks farther than 700 px from the view; it redraws everything after a lost WebGL context; full texture → the stack
falls back to one sprite per item.

### 8.2 Unity replacement: `StackView`

```
class StackView {                 // one per pad stack
  GameObject root;                // SortingGroup; one depth key = stackDepth + 0.001 (§4.4); position (bx, by)
  List<SpriteRenderer> items;     // pooled children; child i sortingOrder = i (item-index order, later on top)
  void Rebuild(ItemStack s):      // call when the stack changes (push/pop/clear/move) — no 15 Hz cap needed
     s.Place(); for each item i: child i sprite = item sprite, local pos = item.pos − (bx, by), scale = item.sx ?? s.scale
}
```

Parity rules:
1. **Draw order inside a pad stack is item-index order**, not the column depth order of unbaked stacks (with alternating
   columns the two differ where items overlap). The Phaser player sees the baked order.
2. `towerCap` for typeCols stacks = `tall`, where
   `tall = typeCols ? ceil(max / typeCount) : alternate ? ceil(max / nCols) : min(max, perCol)`;
   `if (drawMax) tall = min(tall, alternate ? ceil(drawMax / nCols) : drawMax)`; `tall = min(tall, 60)`.
   (Shop stage-1 shelf: ceil(160/3) = 54 → drawMax 18 → **18**.) It limits how high a type tower is drawn.
3. An item flying into the stack is a separate sprite (FLY band) until it lands; on landing it joins the StackView at
   once (Phaser kept it ≤ 1/15 s as a sprite at `stackDepth + 0.001` — invisible difference).
4. A popped item becomes a flying sprite at its drawn position (`it.x, it.y`), depth `stackDepth + 0.01` until `fly()`
   sets the FLY depth in the same frame.
5. The slot clipping of Phaser never triggers with the slice's capacities (checked: station 15/18 layers, pile 6, shelf
   18, cash 5 per column) — ignore it.

Unbaked stacks (carried, site stock) keep one depth key per item (§4.3).

---

## 9. Unity draw-order scheme — PROPOSAL (the lead decides)

> **Decided in 00 A3/§4.1: P1.** P2 and the other options below are **SUPERSEDED** (kept for reference). One revision
> to P1: the sorting layer is the built-in **Default** layer, not a custom "World" layer (layers cannot be created from
> code, and P1 needs only one).

### 9.1 Precision facts

Phaser depth is float64. Offsets that actually occur (smallest first):

| Offset | Where | Slice? |
|---|---|---|
| 1e-6 | Cutaway "in front of the walls" `top + 0.001 + (y − base + 400)·1e-6`; depot rack items `c·1e-6` | LATER |
| 2e-6 | carried stack vs body inside an interior (`d ± 2e-6`) | LATER |
| 1e-5 | deck fishers `base + 0.4 + y·1e-5`; cutaway slot `±min(0.004, (y − base)·1e-5)` | SLICE (deck, after hiring) |
| 1e-4 | doll layers, office pad icon, depot rack `drawOrder·1e-4` | LATER |
| 0.0001·hs | typeCols carried/site items (hs ≥ 6.8 px → ≥ 0.00068) | SLICE |
| 0.0005 | stack item index; seated chief `deskDepth + 0.0005` | SLICE |
| 0.001 / 0.002 / 0.01 / 0.05 … 2000 | everything else | SLICE |

float32 ulp at |v|: 2^(floor(log2 v) − 23) → 209: 1.5e-5; 900: 6.1e-5; 3450: **2.4e-4**; 5450: 4.9e-4; 28345: 2.0e-3;
50000: 3.9e-3. So any scheme that puts the whole depth into one float32 loses the 1e-5 … 1e-6 offsets at village y.
Depth must be **computed in double** in C# in every scheme (`double d = y + offset`).
Unity limits: `sortingOrder` is int16 (−32768 … 32767); then camera distance (float32); exact ties are drawn in an
undefined order.

### 9.2 Options

**P1 — per-frame rank (recommended; exact Phaser semantics).**
* Every world renderer (SpriteRenderer, TMP text, LineRenderer/mesh, ParticleSystemRenderer, or a SortingGroup for a
  container/stack) owns a `DepthKey { double Depth; long Seq; }`. `Seq` = global counter, set at creation and every time
  the object is taken from a pool (Phaser re-adds pooled pictures to the end of the list).
* One sorting layer (revision: the built-in "Default", 00 A3) for everything in the Game scene (UI is a separate canvas). Ranks 0 … n−1 map to
  `sortingOrder = rank − 32768`; n ≤ 65536 (a full village has ≈2500 objects).
* `DepthSorter.LateUpdate()`: if any key changed or was added/removed, re-sort by `(Depth, Seq)` with an **insertion
  sort** over the previous order (the list is nearly sorted frame to frame: cost ≈ O(n + moves)), then write
  `sortingOrder` only where the rank changed. Typical frame: a few characters move → a handful of writes.
  Worst case (an object inserted in the middle) → up to n writes (≈2500 int writes, ≪ 1 ms). Optionally rank only keys
  inside `view + 300 px` (§7).
* Exact for every offset (double compare) and for ties (Seq). Camera Transparency Sort Mode is irrelevant (all orders
  unique). This is also the reference used to validate P2.

**P2 — integer + fraction (cheaper, near exact).**
```
layer  = d < −10000 ? "Under" : d < 28000 ? "World" : "Over"
order  = (int)Math.Floor(d) − (Under ? −20000 : World ? 0 : 28000)     // Under 0…9100, World −10000…27999, Over 0…22000 (all int16)
z      = −(float)(d − Math.Floor(d))                                  // frac in [0,1): float32 ulp ≤ 6e-8 → resolves 1e-6 (17 ulps)
Renderer2DData.transparencySortMode = CustomAxis, axis (0, 0, 1); SpriteRenderer.spriteSortPoint = Pivot
camera: orthographic at z = −10, near 0.01, far 20
```
Lexicographic (layer, order, z) equals numeric `d` (also for negative d: floor(−0.3) = −1, frac 0.7). No global work:
each object writes its own order/z when its depth changes. Defect: exact ties draw in undefined order (Phaser: insertion
order). Known ties in the slice: all pads at −12000, all pad icons at −11901, all shadows at −11000 (overlaps are rare
and visually identical except pads). Mitigation: give static flat-band objects `d += creationIndex·1e-4` (≤ 0.03 for
300 pads, still below PAD + 3). Requires verifying how a `SortingGroup` computes its camera distance (transform position
expected) — R3.

**Not recommended**
* *A — one sorting layer per band + Transparency Sort Custom Axis (0, 1, 0) on the pivot:* the natural Unity setup, but
  every offset (front overlay +1, clerk +0.5, deck layers, labels +1990, carried stacks ±0.5) would need extra layers or
  moved pivots; not exact.
* *D — z = −depth·s on one layer:* fails §9.1 (1e-5/1e-6 offsets lost; carried stack and body tie inside interiors);
  needs a far plane covering ±50 units at s = 0.001.

### 9.3 Proposed component sketch (either option)

```csharp
public sealed class DepthKey : MonoBehaviour {
    public double Depth;          // written by the owning entity every frame it changes (Character.Sync, stacks, deck…)
    public long Seq;              // P1 only
    public Renderer Target;       // or a SortingGroup
    internal int Rank = int.MinValue;
}
public static class Depth {       // the constants of §3
    public const double WATER=-20000, FISH=-19900, WAVES=-19800, GROUND=-15000, FLOOR=-14000, GROUND_DECAL=-13500,
        OUTLINE=-13000, PAD=-12000, PAD_ITEM=-11900, PAD_TEXT=-11800, SHADOW=-11000, DUST=-10900,
        PAD_LABEL=28000, PAD_PRICE=28900, FOG=29000, FLY=30000, FX=31000, BUBBLE=40000, LABEL=41000, ARROW=45000, TOP=50000;
}
```

---

## 10. Sequence per frame and per event

Phaser order (one frame): `Game.tick` (input → ground/water → player update+sync → pads → deck → resources → stations
(stack layouts) → shop → sites → workshops → … → workers/porters/residents (each `sync`) → tutorial/onboarding/flags →
**occlusion** → zoom/camera target) → camera follow → depth sort of the display list (if any depth changed) →
`prerender`: Culler pass, StackBaker flush → draw.

Unity order:

| Step | Where | What |
|---|---|---|
| 1 | `Update` (GameLoop) | Same tick order; every entity updates its px state and writes `DepthKey.Depth` (characters every frame, stacks on layout, static objects once at creation). |
| 2 | `Update`, end of tick | `Occlusion.Update(dt)` (§6.3); uses the camera view of the previous frame. |
| 3 | `LateUpdate` | Camera follow/clamp (01 spec). |
| 4 | `LateUpdate` (after camera) | `StackView.Rebuild` for dirty stacks; `WorldImage.Apply` for changed pictures. |
| 5 | `LateUpdate` (last, script order +1000) | `DepthSorter`: P1 rank sort + writes, or P2 per-key layer/order/z writes. |

Events: picture created → new key (P1: `Seq = ++counter`); taken from pool → `Seq = ++counter`; destroyed/released to
pool → remove key; `Visible` false → keep the key (Phaser keeps hidden objects in the list).

---

## 11. Scope

| Feature | Tag |
|---|---|
| Sprite import with anchor→pivot, flipShift, WorldImage mapping | SLICE |
| Depth constants and every rule of §4 for: statics, characters, carried stacks, pad stacks, pads, labels, rings, flights, fx, bubbles, arrow | SLICE |
| Fishing deck tier 1 layers and the chief's landing; fishers' interior depth (after hiring) | SLICE |
| Staged shop stage 1 (back/sign/clerk/front), cash pad, register, customers' bubbles | SLICE |
| Grill station, operator spot, fish pile; hire pad (UnlockPad) | SLICE |
| Sites: plot/foundation/scaffold/done pictures and depths; builders | SLICE (shown in loaded saves; building flow may be LATER) |
| Finished buildings of §5.10 drawn at the right place and depth (loaded v4.x save) | SLICE (layout only) |
| Occlusion (x-ray) with offline masks; linked layers; chiefOnly; worked-station rule | SLICE |
| DepthSorter P1 (or P2) | SLICE |
| StackView replacement | SLICE |
| Shop stage 4 strip, cutaway interiors (office, bank, depot, hall, restaurant), bakery doorway pad depth, doll layers, town zone fades (0.42), MainOnly | LATER |
| Culler | DROP |
| StackBaker texture, context-loss rebake | DROP |
| Phaser `DepthSort` class | DROP (unused) |

---

## 12. Porting risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Ties** (equal depth) draw in Phaser insertion order; Unity's order for ties is undefined and can flicker. | P1 (Seq). In P2, add creation-index micro-offsets to static flat-band objects. |
| R2 | **float32 depth** loses offsets < 2.4e-4 at y ≈ 3450 (1e-5 deck fishers, 1e-6 cutaways). | Compute depth in double; P1 compares doubles; P2 splits floor/frac. Never use `transform.position.z = -depth`. |
| R3 | **SortingGroup distance** (P2 only): how Unity computes the camera distance of a group (transform position vs bounds). | Test in week 1 with two labels at depths 100.2 / 100.7 over a sprite at 100.5. P1 does not depend on it. |
| R4 | **Pivot conversion** errors (trim offsets, y flip, per-frame trims of animations). | Generate pivots by script from the atlas JSON; unit-test the table of §2.2; overlay a Phaser screenshot at 1:1. |
| R5 | **flipX semantics**: forgetting `flipShift` moves every flipped tree by 86·scale px. | Implement only through `WorldImage.Apply`. Acceptance check §13. |
| R6 | **Baked stack order** differs from per-item depth order with alternating columns. | StackView draws in item-index order (§8.2). |
| R7 | Flipped + rotated pictures rotate about a different point. | Accept (only boats/ice bobbing on the water; ≤ a few px). |
| R8 | **X-ray masks** need the untrimmed-frame coordinate convention and per-frame trims. | Offline bake from the same atlas JSON; test with a character behind `tree_pine_a` and behind the shop (big → 2 hits). |
| R9 | Occlusion `view` must be the **last drawn** camera rect (one-frame lag) and the fade is frame-rate dependent. | Keep both for parity (60 fps target, 30 on low preset). |
| R10 | Alpha of containers: Unity SortingGroup does not multiply alpha into children. | Multiply manually (label fades, bubble fades). |
| R11 | Additive blend sprites (fx_fire if `blend: ADD`, flame particles) need an additive material; sorting stays the same. | Asset pipeline: material per blend mode. |
| R12 | Text in world (labels, price, float text): TextMeshPro renderers must join the same depth scheme. | Each TMP renderer gets a DepthKey (or lives inside its label's SortingGroup). |
| R13 | Phaser's static image `depth = y` uses the **unshifted** anchor y even for flipped pictures; flip does not change depth. | Depth from `WorldImage.Y`, never from the Transform. |
| R14 | Pads: `setDisplaySize` scale relative to the untrimmed 192×96 frame. | `ScaleX = w / Src.w`. |
| R15 | Insertion-sort worst case on mass creation (load of a big v4.x save creates ~2500 keys at once). | Full `Array.Sort` by (Depth, Seq) on load and whenever more than ~64 keys were added in a frame; insertion sort otherwise. |

---

## 13. Acceptance checks

| Check | Expected |
|---|---|
| Pivots of §2.2 table | exact to 1e-5 |
| Flipped `tree_pine_a` at (1000, 1500), scale 0.95: Unity transform x | (1000 + 86·0.95)/64 = (1081.7)/64 = 16.9016 |
| Grill station / in-stack / out-stack depth | 590 / 541.001 / 639.001 |
| Operator spot label depth (grill) | 625 + 1990 = 2615 |
| Shop layers (stage 1 at (1207, 782)) | back 782, sign 782.2, clerk at post 782.5, front 783, shelf stack 835.001, cash pile 900.001, register label 2849, coin spin 40995 |
| Fish pile | prop 454, stack 455.001, label 2430 |
| Deck tier 1 | back 209, rods 209.2 / 209.21 / 209.22, lines 209.25, hooked fish 209.27, bite fish 209.05, front 209.6, landing −13490 |
| Fisher on stool 0 = P(−0.35, 0.75) = (1091, 274) | 209 + 0.4 + 274·1e-5 = 209.40274 (above rods and lines, below the front railing); drawn 17 px up |
| Chief at (1130, 412) carrying 3 fish | body 412; items 412.501, 412.5015, 412.502; shadow −11000 |
| Plot (state plot) at any y | −13495; its label PAD_LABEL + dropY·0.1 |
| Shop occluder box | X 1274.0, Hw 194, Top 218.5, Big true |
| Chief at (1274, 700) behind the shop, art opaque at his body and head | want 0.32 after ≤ 0.1 s; alpha 0.32 after 20 frames at 60 fps; front overlay and sign fade identically |
| Same, but only one of three sample points opaque | no fade (big needs 2) |
| A customer walking behind a forest pine (opaque at one point) | pine fades (small occluder) |
| Grill with its cook hired, a porter behind it | grill is not an occluder (143 px) → never fades |
| Tie test (P1) | two pads overlapping, created A then B → B drawn over A |
| Precision test (P2) | depths 3450.000001 and 3450.000002 → distinct z, correct order |
| Flight counter | the 101st concurrent flight gets FLY + 0 (wraps) |

---

## 14. Source index (Phaser files and line ranges)

| File | Lines | What |
|---|---|---|
| `src/systems/DepthSort.js` | 1–44 | DEPTH constants; unused DepthSort class |
| `src/systems/Occlusion.js` | 1–147 | x-ray: constants, mask, solid, collect, update |
| `src/systems/Culler.js` | 1–198 | view culling and parking (DROP) |
| `src/systems/StackBaker.js` | 1–160 | stack baking (DROP) |
| `src/entities/ItemStack.js` | 15–80, 115–171, 210–343 | stacks: bake slot sizing, push/pop, layout depths, baked layout, place |
| `src/entities/Character.js` | 22–52, 116–172 | shadow, carry offset, sync depth/lift/stack depth |
| `src/entities/Pad.js` | 1–35 | pad picture, reach, icon |
| `src/entities/Station.js` | 14–53, 88–90, 132–158 | station picture, occluder rule, pads, stacks, fire, process flights |
| `src/systems/Labour.js` | 58–90, 311–370 | operator spot, pile, meat rack |
| `src/entities/Seller.js` | 23–34, 286–295, 590–606, 690–705, 1175–1320, 1495–1576 | cash pad, linkFade, customer bubble, staged shop, signs, refreshOcc |
| `src/entities/Register.js` | 18–62, 76–84, 232–246 | register pad/label, clerk front depth and step lift |
| `src/entities/FishingDeck.js` | 45–130, 227–233, 294–302, 440–505 | deck layers, landing, occupy, art, rods/fish depth |
| `src/entities/Site.js` | 23–27, 52–130, 276–330, 391–420 | sites: sizes, pictures, labels, scaffold ring, builders |
| `src/entities/UnlockPad.js` | 33–66 | hire/unlock pad pieces and depths |
| `src/entities/ChiefHut.js` | 14–47 | chief hut |
| `src/entities/House.js`, `Tower.js`, `Warehouse.js`, `Boathouse.js`, `Workshop.js` | 7–20, 14–21 + 55–63, 29–46, 25–32, 30–60 | finished buildings |
| `src/entities/Cutaway.js` | 1–236 | cutaway layer depths and occupy (LATER) |
| `src/entities/Workshop43.js`, `TrashPad.js`, `Bakery43.js` | 1–74, 12–29, 25–60 + 99 | workshop sign, trash pad, bakery layers |
| `src/entities/ResourceNode.js` | 48–58, 104–112, 174–182 | tree, rock, wheat depths |
| `src/entities/Resident.js` | 219–222 | seated resident depth |
| `src/systems/VillageLife.js` | 95–115, 169 | life props, seat depth |
| `src/systems/Bubbles.js` | 25, 78, 160–162 | bubble depths |
| `src/systems/Effects.js` | 45–67, 70–153, 159–180 | pool, emitters, sheets, loops, float text, flight depth |
| `src/scenes/Game.js` | 526–561, 564–615, 617–700, 821–960, 1040–1090, 1242–1330, 2170–2236 | outlines, staticImage, addOccluder, fences/decor, trees/resources/stations/labour, sellers/huts/v3 plots, onAssetArrived + makeBuilding, tick order |
| `src/core/Assets.js` | 840–900 | sprite lookup, anchor → origin |
| `src/core/Placeholders.js` | 71–100 | fallback anchors |
| `lib/phaser.min.js` 3.90 | `updateDisplayOrigin`, batchSprite flip offset `(−realWidth + 2·displayOriginX)`, `DisplayList.depthSort` (StableSort by `_depth`) | engine facts of §1 |
| `docs/CONTRACT.md` | §1–§4 | PPU 64, anchors, depth = anchor y, manifest fields |

---

## 15. Open questions for the lead

* **Q1 — Sorting scheme:** P1 (rank, exact incl. ties, small CPU cost) or P2 (floor + frac, no global work, ties
  undefined)? Recommendation: P1 for the slice; keep P2 as the optimisation if profiling asks for it.
* **Q2 — Baked stack look:** keep Phaser's item-index draw order inside pad stacks (recommended, matches what the
  designer sees) or switch to the per-item depth order?
* **Q3 — Cutaway buildings in loaded v4.x saves:** is "closed exterior at the right place and depth" enough for the
  slice (interiors, reveal on approach and taps LATER)?
* **Q4 — Masks:** OK to bake x-ray masks offline into an asset (≈ 1/16 of the frame area per frame, 1 byte/cell or
  1 bit/cell)?
* **Q5 — Frame-rate-dependent fades** (x-ray, labels, pads): keep the Phaser formulas exactly (recommended for the
  side-by-side test) or move to time-based curves later?
