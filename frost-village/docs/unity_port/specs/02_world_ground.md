# 02 — World layout & ground (Unity port spec)

Target: Unity 6.3 LTS, 2D URP, C# 9, Android. Source: `frost-village` current tree (v4.3 step B, save layout marker `v43.lay = 2`).
Companion data file (same folder): **`02_world_ground_static.json`** — dumped from the real `src/data/world.js` with verbatim copies of
`Game.buildFences`, `Game.buildTrees`, `Game.blockedForDecor` and `Ground.pathDecor`. It is the golden data for this spec: every
position below that is not hand-typed comes from it. Recommended use in Unity: import it (or convert it to a ScriptableObject) and
treat it as the source of truth for the new-game layout; port the generators only later, and unit-test them against this file.

All numbers are Phaser **world pixels** (x to the right, y DOWN) unless a column says otherwise. "depth" = Phaser `setDepth` value
(bigger = drawn later = on top).

---

## 0. One-page summary

| What | New game (slice) | Changes during play? | Spec section |
|---|---|---|---|
| World rect | x −1400…6144, y 0…3450 (sea from y −200) | no | §2 |
| Shoreline `shoreY(x)` | fixed formula, 3 sines + east slope | no | §4 |
| Sea | living WebGL water (high/mid preset) or "old sea" scrolling texture (low preset) — **slice: old sea** | animates | §6.2 |
| Land | snow texture under the shoreline + edge vignette + icy rim | no | §6.3–6.4 |
| Roads | 28 polylines drawn soft, 10 of them "spine" (1.4× wide) | zone / region roads fade in when that land opens | §6.5 |
| Path decor + decals | 77 baked snow-drift / footprint stamps + 19 decals | no | §6.6–6.7 |
| Zone floors | plaza floor visible; forest/farm/mine/hunt locked (dashed outline + ghosts + lock + name) | floor fades in on unlock | §6.8–6.9 |
| Fences | 13 pieces visible (plaza top-right edge) of 110 | zone fences appear on unlock | §7.2 |
| Decor | 77 visible of 132 | region/zone decor appears; tents fold; some removed for hall/bank | §7.3 |
| Trees | 103 visible decorative/region pines of 359 | region trees appear; regrow/chop (choppable ones) | §7.4 |
| Fog | east, south-east, south and west-south walls | cleared per region (tower) | §8 |
| Camera bounds | x −1400…2060, y −150…2880 | grow with land | §8.3 |
| Snowfall | 1 flake / 0.09 s in the view | continuous | §9 |
| Buildings at start | chief hut, fisherman hut, grill, market stage 1, fishing deck + landing | yes (other specs) | §11.6 |
| Building plots | 37 rows, 4 hidden, **none visible at start** | appear by step / region | §3.4, §11.9 |

Slice must-have: §2, §4, §5, §6.2–6.9, §7, §8, §9, §10, §11. Later: living water shader (§6.2.3), RoadPaint rails/streets of the rail
strip, VillageFlags waving cloth, night lights, zone reveal cinematics (§12, §14).

---

## 1. Phaser sources (read-only references)

| File | Lines | What it gives this spec |
|---|---|---|
| `src/data/world.js` | 9–27 | `ZONES`, `Z(zone, mx, my)` |
| | 29–46, 80–92 | `XOFF/YOFF`, station anchors, `DECK_C`, `HUT`, `LAND_C` |
| | 94–106 | `shoreY(x)` |
| | 110–131 | world size, `left`, `shore`, `player`, `tutorialView` |
| | 140–260, 272–313 | stations, market, trash, bench, bakery43, deck |
| | 314–333 | forest trees / rocks / wheat layout |
| | 334–394 | pads (worker hut positions) |
| | 410–480 | road graph (nodes, edges, `draw/zone/region/spine/via/walk`) |
| | 486–497 | fences |
| | 498–575 | decor |
| | 576–610 | `borderTrees`, `extraTrees` |
| | 611–622 | decals |
| | 624–648 | territory regions, watchtowers |
| | 649–757 | plots (plot table v2), reserves |
| | 759–778 | region trees / rocks / wheat |
| | 841–882 | life props |
| | 921–939 | derived `WORLD.paths`, `WORLD.allPaths`, reserve polygons, shore plots |
| | 1074–1135 | `WORLD.v42` hut, removeDecor / moveDecor / treeGaps |
| | 1140–1163 | v42 plots, `WORLD.v43` (old-save start points) |
| `src/core/Iso.js` | 1–72 | iso axes, `isoPt`, `isoInv`, `isoRect`, `inIsoRect`, `gdist` |
| `src/core/Placeholders.js` | 27 | `rng(seed)` (xorshift with a signed shift — see §7.4.1) |
| `src/systems/Ground.js` | 1–135 | constants, tile pool (NOT ported, §6.11) |
| | 149–300 | sea: `makeSea`, `makeOldSea`, `syncFish`, `seaFit` |
| | 532–571 | `bakeChunk` (ground draw order) |
| | 573–634 | `drawShallow`, `bakeShore` |
| | 636–759 | `bakePaths`, `drawRoads`, `pathDecor`, `bakeDecals` |
| | 761–832 | `roadOverlay`, `zoneFloor`, `drawFloor` |
| | 867–900 | `update` (sea scroll) |
| `src/systems/DepthSort.js` | 1–44 | `DEPTH` constants |
| `src/systems/Collision.js` | 80–256 | walkable land, shore walk line, chief-only land |
| `src/systems/Territory.js` | 1–391 | regions, walk rects, camera bounds, fog |
| `src/systems/VillageSea.js`, `src/systems/Water.js` | all / 1–140, 2148–2181 | living water region + preset (summary only) |
| `src/scenes/Game.js` | 86–90 | `DECOR_R` collider radii |
| | 155–445 | `build()` order (the sequence in §5) |
| | 510–562 | `buildZones`, `makeLockedOutline` |
| | 564–615 | `staticImage`, `addOccluder` |
| | 617–699 | `buildFences`, `buildDecor` |
| | 771–845 | `blockedForDecor`, `buildTrees` |
| | 847–933 | `buildResources` (forest/region trees, rocks, wheat) |
| | 1055–1063 | `buildHuts` |
| | 1065–1130 | `buildV3`, `refreshSites`, `restoreV3` |
| | 1655–1700 | `setZoneEnabled`, `revealZone` |
| | 2170–2300 | `tick` (per-frame order, snowfall) |
| `src/systems/VillageLife.js` | 95–135 | life props |
| `src/entities/ChiefHut.js`, `FishingDeck.js` (1–140) | | hut / deck depth rules |
| `src/systems/office/Office.js` | 67–135 | hut sync, `clearDecor` (hall/bank removals) |
| `src/core/Remap43.js`, `src/data/ids43.js` | 1–120 / 1–60 | old-save remap (§13) |
| Asset manifests | `assets/props`, `life_props`, `ground`, `ui2`, `deck43`, `market`, `fx` | anchors, frame sizes (§11.1) |

---

## 2. Coordinates and units

### 2.1 World rect

| Constant | Value | Source |
|---|---|---|
| `WORLD.width` (right edge) | 6144 | world.js 113 |
| `WORLD.height` (bottom edge) | 3450 | |
| `WORLD.left` = `X0` (left edge) | −1400 | |
| Sea drawn from | y = −200 | Ground.makeOldSea / Water preset |
| Camera background | `#dbe6f2` | Game.build |

### 2.2 Iso ground axes (2:1 isometric, CONTRACT §1)

```
+1 m along world X  = (+45.25, +22.63) px   (screen down-right)
+1 m along world Y  = (+45.25, −22.63) px   (screen up-right)
isoPt(cx, cy, mx, my) = (cx + 45.25*(mx + my),  cy + 22.63*(mx − my))          // NOT rounded
Z(zone, mx, my)       = (round(c.x + 45.25*(mx + my)), round(c.y + 22.63*(mx − my)))   // c = zone centre, Math.round
isoInv(dx, dy)        : s = dx/45.25, d = dy/22.63 → mx = (s + d)/2, my = (s − d)/2
isoRect(cx, cy, w, h) = corners [left, top, right, bottom] =
    isoPt(−w/2, −h/2), isoPt(−w/2, +h/2), isoPt(+w/2, +h/2), isoPt(+w/2, −h/2)
inIsoRect(px, py, cx, cy, w, h, margin=0) = |mx| ≤ w/2 − margin && |my| ≤ h/2 − margin   (mx,my = isoInv(px−cx, py−cy))
gdist(a, b) = sqrt((ax−bx)² + (2·(ay−by))²)        // "ground distance": y doubled
```

`Math.round` in JS rounds .5 toward +∞ (`Math.round(-2.5) = -2`); C# `Math.Round` defaults to banker's rounding. Use
`Math.Floor(v + 0.5)` everywhere a JS `Math.round` is copied.

v4 road grid (rail strip / town, not in the slice): `L4(i, j) = (round(3120 + 64(i + j)), round(1315 + 32(i − j)))`.

### 2.3 Unity mapping (same as `01_core_view.md` D1/D2: `WorldSpace.ToUnity`, `JsRound`; everything else stays in px)

```
const float PPU = 64f;                                    // CONTRACT: 1 m of art = 64 px; import every sprite at PPU 64
Vector3 W2U(float x, float y) => new Vector3(x / PPU, -y / PPU, 0f);
Vector2 U2W(Vector3 u)        => new Vector2(u.x * PPU, -u.y * PPU);
```
Sprite pivot = Phaser anchor (manifest `anchor`, fractions of the UNTRIMMED frame, y from the top). Unity pivots are fractions of
the sprite rect from the bottom-left; for a trimmed atlas frame: `pivotX = (ax*srcW − trimX)/cutW`, `pivotY = 1 − (ay*srcH − trimY)/cutH`
(values for every key used at start in §11.1). Simplest: import frames untrimmed (source size) and use `pivot = (ax, 1 − ay)`.

---

## 3. Data shapes (world.js) — C# records

```csharp
record Zone(string Id, Vector2 Center, Vector2 SizeM, string Floor, float FloorAlpha /*1 if absent*/,
            string Unlock /*step id or null*/, string Region /*null or region id*/, string NameKey);
record RoadNode(string Id, float X, float Y);
record RoadEdge(string A, string B, Vector2[] Via, string Zone, string Region,
                bool Draw /*default true*/, bool Walk /*default true*/, bool Spine /*default false*/);
record FenceDef(string Zone, Dictionary<string /*tl|tr|bl|br*/, Vector2[] /*gaps [startM,endM]*/> Edges);
record DecorDef(string Key, float X, float Y, bool Flip, float Scale /*1*/, string Zone, string Region, string Id, float? R);
record BorderBand(float X0, float Y0, float X1, float Y1, float Step, string Region /*may be null*/, string Until /*may be null*/);
record TreeDef(float X, float Y, string Key, string Region);                  // extraTrees / regionTrees
record DecalDef(string Key, float X, float Y, float Scale = 1, float RotDeg = 0);
record Region(string Id, Rect Rect /*x0,y0,x1,y1*/, string Tower, string NameKey, Vector2? Center,
              bool OpenAtStart /*cfg.open*/, string OpenWith, string OpenFlag);
record Plot(string Id, float X, float Y, string Size /*S|M|L|XL*/, string Region, string After, string[] Also,
            string Only, string[] Types, bool Hidden, string Replace, Vector2? Drop, Vector3[] Clear /*dx,dy,r*/,
            Dictionary<string, Vector2> Pads, float? Shore /*y = round(shoreY(x)+shore)*/, int? Price);
record Reserve(string Id, string Zone, float X0m, float X1m, float Y0m, float Y1m, Vector2[] Poly /*derived*/);
record LifeProp(string Key, float X, float Y, string Id, string After, bool Flip, float Scale);
```

### 3.1 Zones (world.js 9–20)

| id | centre | size (m) | floor | floorAlpha | unlock | region | corners L / T / R / B | at new game |
|---|---|---|---|---|---|---|---|---|
| plaza | (990, 800) | 14 × 14 | ground_plaza | 1 | — | — | (356.5, 800) (990, 483.18) (1623.5, 800) (990, 1116.82) | floor visible |
| forest | (470, 1250) | 9 × 9 | ground_dirt | 0.5 | zone_forest | — | (62.75, 1250) (470, 1046.33) (877.25, 1250) (470, 1453.67) | locked outline |
| farm | (1478, 1304) | 5 × 8 | ground_farm | 1 | zone_farm | — | (1183.88, 1337.94) (1545.88, 1156.9) (1772.13, 1270.06) (1410.13, 1451.1) | locked outline |
| mine | (430, 1900) | 9 × 9 | ground_rock | 1 | zone_mine | — | (22.75, 1900) (430, 1696.33) (837.25, 1900) (430, 2103.67) | locked outline |
| hunt | (1400, 1960) | 8.5 × 8.5 | ground_dirt | 0.45 | zone_hunt | — | (1015.38, 1960) (1400, 1767.64) (1784.63, 1960) (1400, 2152.35) | locked outline |
| field2 | (520, 2980) | 6.6 × 6.6 | ground_farm | 1 | — | south | (221.35, 2980) (520, 2830.64) (818.65, 2980) (520, 3129.36) | hidden (region south) |
| quarry | (2560, 2060) | 6.6 × 6.6 | ground_rock | 1 | — | se | (2261.35, 2060) (2560, 1910.64) (2858.65, 2060) (2560, 2209.36) | hidden (region se) |

`unlock = null` → open from the start. A zone with `region` (field2, quarry) appears with its land, not by a step.

### 3.2 Road graph (world.js 410–480)

61 nodes, 69 edges (10 of them spine). Edge flags: `draw:false` = never painted (plaza floor / beach walk); `zone:` = painted on an overlay that
appears when that zone unlocks; `region:` = overlay that appears when that land opens; `spine:true` = part of 「눈꽃 큰길」, painted
1.4× wider; `walk:false` = painted/known but nobody routes on it; `via` = bend points. Derived lists (world.js 921–933):

```
WORLD.paths    = edges where draw != false && zone == null && region == null → polyline [A, ...via, B] (+ .spine flag)
WORLD.allPaths = edges where draw != false                                  → polyline (used by tree clearance §7.4.3)
```
The 28 `WORLD.paths` polylines drawn at new-game start are listed in §11.7 (S = spine). Zone overlays: forest 1, farm 1, mine 1,
hunt 1 edge; region overlays: east 6, south 5, se 6, rail 2 edges (all in the JSON `roads.zoneOverlays / regionOverlays`).

Spine (「눈꽃 큰길」, world.js 156–160): hall_front → w_rest → w_gate_n → (beach road) w_b2 → hut_door → plaza_w; plaza_s → cross_n →
green → cross_s (the x = 990 road); plaza_e → east_link → east_gate (region east, painted only once east opens). Plaza and beach
pieces are `draw:false` (the plaza floor is that road).

### 3.3 Territory (world.js 624–640)

| Region | rect [x0, y0, x1, y1] | Opens | Open at new game |
|---|---|---|---|
| start | 0, 0, 1800, 2620 | always | **yes** |
| east | 1800, 0, 3000, 1500 | tower_east lit | no |
| south | 0, 2620, 1800, 3450 | tower_south | no |
| se | 1800, 1500, 3000, 3450 | tower_se | no |
| rail | 3000, 0, 4150, 3450 | with east (`openWith`) | no |
| town | 4150, 0, 6144, 3450 | flag `townInvite` | no |
| west | −1400, 0, 0, 2620 | `open: true` | **yes** |
| west_s | −1400, 2620, 0, 3450 | with south | no |

`regionAt(x, y)`: first region in the order above whose rect contains (x0 ≤ x < x1, y0 ≤ y < y1), else `'start'`.
Watchtowers (sites made when their pad is paid, hidden at start): tower_east (1660, 845), tower_south (1450, 2505, pad [−20, −106]),
tower_se (2870, 1370, pad [−8, −94], needs east).

### 3.4 Plot table v2 and reserves (world.js 649–757, 1140–1148)

- `size`: S (2×2 m, ground diamond 181×91 px), M (3×3 m, 272×136), L (4×4 m, 362×181), XL (525×262).
- Show rule (Game.refreshSites): an empty plot shows when `territory.isOpen(region) && progress.met(after) && every(also)`; a plot
  that holds a building (foundation/scaffold/done) shows whenever its land is open. **At a new game no plot is shown.**
- `hidden: true` (w_civic, d_school, d_clinic, d_labour): no Site object at all (no sprite, pad, sign or menu); the plot only keeps
  its ground diamond (+20 px in x, +10 px in y) and its `clear` circles free of trees (§7.4.3). Save.js drops anything saved there.
- `replace: 'chief_hut'` (v42_office): the chief's hut stands on that plot while the plot is empty or a foundation (§11.6).
- `only` = the one building allowed; `types` = build-menu patterns (`house_*`, `deco_*`); `clear` = extra no-tree circles
  `[dx, dy, r]` from the plot centre; `drop` = the material pad when not the default.
- Reserve `p47_plaza` (「눈꽃 한마당」 터): zone plaza metres X 13…22.8, Y −22…−11 → polygon (corners in order
  `[x0,y0] [x0,y1] [x1,y1] [x1,y0]` through `Z`) = **(583, 1592) (1081, 1343) (1524, 1565) (1026, 1814)**. Nothing is drawn; it only
  forbids new trees (trunk or trunk−90 px inside, §7.4.3), plots and pads. What already stands inside stays.
- Hall site `w_hall`: (180, 760) XL, region start, after `hire_hunter`, only `town_hall`, drop (−30, 870),
  clear [[−140, 230, 220], [−20, 200, 130]] — hidden at new game. When it shows (or a hall exists) Office.clearDecor('hall') removes
  the decor `snow_pile_a` (236, 512) and `snow_pile_b` (345, 700) (match: any static image within ±14 px).

Full plot list: §11.9.

---

## 4. Shoreline (world.js 94–106, 121)

```
shoreY(x) = 372
          + 16 * sin(x * 0.0052 + 0.4)
          +  7 * sin(x * 0.0165 + 1.7)
          +  3 * sin(x * 0.041  + 0.2)
          + slope(x)
slope(x)  = d <= 0          ? 0
          : d < 220         ? 0.5 * d*d / (2*220)          // smooth knee
          :                   0.5 * (d − 220/2)            // straight, 1 px down per 2 px east
          where d = x − 1880
```
Everything with y < shoreY(x) is sea. Derived values (Ground constructor, scanning x = X0…W step 8):
`maxShore = 2467.888…`, `seaH = ceil(maxShore + 40) = 2508`.

Walk line: nobody walks above `shoreY(x) + 46` (Collision.offLand / resolve), except the chief on his landing (FishingDeck,
`Collision.addLand`, other spec). Collision samples the shoreline every 8 px from X0 and interpolates linearly (`Collision.shore`).

Samples (golden values, x → shoreY):

| x | shoreY | x | shoreY | x | shoreY | x | shoreY |
|---|---|---|---|---|---|---|---|
| -1400 | 357.29 | -1200 | 386.49 | -1000 | 382.30 | -800 | 384.63 |
| -600 | 360.87 | -400 | 364.39 | -200 | 352.48 | 0 | 385.77 |
| 200 | 383.71 | 400 | 385.81 | 600 | 359.35 | 800 | 364.25 |
| 1000 | 356.61 | 1200 | 378.61 | 1400 | 388.08 | 1600 | 384.10 |
| 1800 | 363.67 | 2000 | 373.16 | 2200 | 470.39 | 2400 | 576.03 |
| 2600 | 696.64 | 2800 | 785.82 | 3000 | 876.14 | 3200 | 953.68 |
| 3400 | 1075.45 | 3600 | 1173.93 | 3800 | 1296.82 | 4000 | 1383.69 |
| 4200 | 1480.85 | 4400 | 1552.40 | 4600 | 1671.93 | 4800 | 1778.06 |
| 5000 | 1893.83 | 5200 | 1985.04 | 5400 | 2078.82 | 5600 | 2159.47 |
| 5800 | 2262.77 | 6000 | 2383.85 |  |  |  |  |

---

## 5. New-game build sequence (Game.build, 155–445) — the world part

```
Game.build():
  saved = null (new game)            → v43 = { lay: 2, seen: { letter43: 1, tour43: 1 } }
  collision = new Collision(W=6144, H=3450)      // grid cell 160, origin x = −1400; shore cache every 8 px
  ground    = new Ground()                        // makes the sea (§6.2); land is drawn lazily (Phaser) / built once (Unity)
  territory = new Territory(saved.territory)      // regions; walk rects; camera rect; fog walls (§8)
  buildZones()                                    // floor per zone (§6.8); locked ones: floor alpha 0 + outline (§6.9);
                                                  //   field2/quarry floors join their region (hidden)
  for each zone:   roadOverlay(zone)   alpha 0 unless unlocked          // (§6.10)
  for each region ≠ start: roadOverlay('region_'+id) alpha 0 unless open
  buildFences()     (§7.2)
  buildDecor()      (§7.3)   // campfire fire loops, sea floaters
  buildTrees()      (§7.4)   // border forest + extra trees
  buildResources()  // FishingDeck; forest trees (zone); rocks; wheat; region trees/rocks/wheat; animals (hidden zone)
  buildStations()   // grill (plaza, visible); sawmill/smelter/smokehouse (zones, hidden); bakery (hidden until built)
  buildLabour()     // operator spots (grill's visible), collection piles (hidden until used)
  buildSellers()    // market stage 1 (visible), bakery43 (hidden), trash pad (hidden until hire_fisherman), workshop43 (hidden)
  buildHuts()       // worker huts: fisherman's (−760, 490) visible; others in locked zones
  buildV3()         // a Site per non-hidden plot, all hidden; food box (hidden)
  player = new Player(1130, 412)
  buildV42()        // Office → ChiefHut on v42_office (visible)
  for each locked zone: setZoneEnabled(id, false)     // hides every object registered to that zone (+ its colliders)
  restoreV3(); progress.init(); ...                   // nothing to restore at a new game; refreshSites() shows no plot
  life = new VillageLife()                            // life props (§7.6), residents (other spec)
  occlusion = new Occlusion(); culler = new Culler()
  snow emitter (§9)
  camera: bounds = territory.camRect (§8.3); zoom = Settings.zoom ?? 1.2 (×View.k); follow camTarget
          new game in tutorial: camTarget = tutorialView (985, 600) (player is within 500 ground px of it)
  ground.ensure(first view, all tiles, margin 200)    // Phaser only
```

Per frame (Game.tick, 2170+), world/ground part, in this order: `ground.update(dt)` (sea scroll / water clock, tile baking) →
`updateWater` (floaters, living water only) → entities … → `territory.update(dt)` (fog scroll + puff wobble) → … →
`occlusion.update(dt)` → camera target lerp → snowfall emit. Unity: the same order is not load-bearing for the ground; only the
sea/fog/snow animations tick.

---

## 6. Ground rendering

### 6.1 Layer stack (bottom → top) and the Unity mapping

| # | Phaser element | Phaser depth | Unity sorting layer / order (proposal, §10) |
|---|---|---|---|
| 1 | Sea: living water body, or old-sea tile sprite | WATER −20000 | `Sea` / 0 |
| 2 | Old-sea fish bands (2) | FISH −19900 | `Sea` / 1, 2 |
| 3 | Baked land tiles (all of §6.3–6.8 merged: snow, vignette, shore rim, roads, path decor, decals, floors, overlay roads) | GROUND −15000 (−15001/−15002 coarse) | `Ground` / 0…40 (one renderer per sub-layer, order below) |
| 4 | Living water shore band (soft surf, foam lace) | GROUND + 5 | `Ground` / 50 (later) |
| 5 | A floor / overlay road while it fades in (own image) | FLOOR −14000 / FLOOR+10 | `Ground` / 30, 40 (same renderers, alpha tween) |
| 6 | Flat props: deck landing (GROUND_DECAL+10), empty plots (+5), ice rink (+2), market rug (+2/+3) | GROUND_DECAL −13500 + n | `GroundTop` / §10 formula (→ 1000 + 10n) |
| 7 | Locked-zone outline graphics; ghosts at OUTLINE+1+0.01·y | OUTLINE −13000 | `GroundTop` / §10 formula (outline 6000; ghosts round(6010 + 0.1·y)) |
| 8 | Pads, pad items, lock icons + zone names (PAD_TEXT), shadows, dust | −12000 … −10900 | `GroundTop` / §10 formula (PAD 16000, PAD_TEXT 18000, SHADOW 26000, DUST 27000) |
| 9 | Every standing object | its y (+ offset) | `World` / f(depth) (§10) |
| 10 | Pad labels / prices | 28000 + y/10 / 28900 | `Labels` |
| 11 | Fog walls | 29000 … 29005 | `Fog` |
| 12 | Flying items, FX, snowfall (FX − 10 = 30990) | 30000 / 31000 | `FX` |

Order inside the baked land (Ground.bakeChunk 532–571), each drawn over the previous:
1. (old sea only) shallow band (§6.4.3)
2. snow fill of the land polygon (§6.3)
3. edge vignette (§6.3)
4. shore rim strokes (+ old-sea foam strip) (§6.4)
5. roads: rim, then textured body (§6.5)
6. path decor: drifts, then footprints (§6.6)
7. bake hooks (rails / v4 streets / depot lanes — none at a new game)
8. decals (§6.7)
9. merged zone floors (order 0, zones in `WORLD.zones` order), then merged zone/region road overlays (order 1) (§6.8, §6.10)

### 6.2 Sea

#### 6.2.1 Which sea
Ground.makeSea: the living water (`Water.js`, WebGL shader) when the water textures are loaded, WebGL exists and the graphics preset
is not 저사양 (`Perf.p.water === 'static'`); otherwise the **old sea**. The old sea is a complete, cheap, exact look and is the
**slice stand-in** (it is what a 저사양 phone shows in Phaser today — compare the slice against Phaser on 저사양).

#### 6.2.2 Old sea (Ground 188–206, 248–288, 893–899)
A camera-following quad whose texture is fixed in the world:

| Part | Texture | World rect | UV (Phaser px, v measured from the image top) | Alpha | Depth |
|---|---|---|---|---|---|
| sea | `water_sea` 512×512, repeat | x: view ± 320 (snapped to 64), y: −200 … ceil(2708/64)*64−200 = 2552 | u = (x + 6·t)/512, v = (y + 200 + 6·sin(0.4·t))/512 | 1 | WATER |
| fish 1 | `fish_school` 256×128, repeat | y 40…240 | u = (x + 22·t)/256, v = (y − 40 + 5·sin(0.7·t))/128 | 0.55 | FISH |
| fish 2 | `fish_school`, tile scale 0.8 | y 150…350 | u = (x/0.8 + 130 + 14·t)/256, v = ((y − 150)/0.8 + 40)/128 | 0.35 | FISH |

`t` = seconds since the scene started (Ground.t). The sea and fish hide when the view's top (`cy − vh/2 − 320`) is below seaH.
Unity: one quad per part sized to the camera view (or simply one big quad over x −1400…2060+320, y −200…2552 at the start) with an
unlit world-space-UV shader (`uv = worldPx / texSize` plus the time terms). Land renderers cover it below the shoreline.

#### 6.2.3 Living water (summary only — later, Shader Graph)
`VillageSea.villageSeaPreset()`: region x −1400…6144, y −200…2508 (+200 → h 2708), mask = "sea where y < shoreY(x)", shore type
`snowbank` (run-up 0.42, snow foam), palette `winter_sea`, baked shoreline field `assets/water/field_village.png`. It draws
(Water.js header): 4 directional swells + one shore-parallel swell (SWELL table, Water.js 105–118), two scrolling ripple normal maps,
fresnel sky, glints, depth colour from a LUT, caustics, fish under the surface (FISH_BANDS = the two old fish bands), splash rings,
contact foam/shadow at posts and hulls (`addContact`), and a separate **shore band** at depth GROUND+5 with breaking crests, foam
lace and a drying wet band. With it, the ground bake skips the shallow band, the third rim stroke and the foam strip
(`liveShore = true`). Decor floaters ride `heightAt/slopeAt` instead of the tween (§7.7). Quality auto-drops to "low" via
WaterBudget. None of this is needed for the slice.

### 6.3 Land fill and vignette (bakeChunk 536–556)
- Land polygon: from (xa, shoreY(xa)) along the shoreline every 8 px to (xb, shoreY(xb)), then down to the bottom and back.
  Unity: one mesh per ~512 px column strip (or one mesh) whose top edge is the shoreline sampled every 8 px, bottom at y 3450,
  x from −1400 to 6144 (only −1400…2060 is ever seen at the start).
- Fill: `ground_snow` 512×512 repeat, **world-anchored at (0, 0)**, scale 1: `uv = (x/512, y/512)` (Unity with PPU 64:
  `uv = unityPos.xy / 8`, wrap Repeat — this reproduces the canvas pattern exactly, including the top-row-at-y=0 alignment).
- Vignette over the land: horizontal gradient from x = −1400 to 6144: rgba(120,150,200,**0.10**) at x = −1400 → 0 at x = −1160
  (band = 240 px), 0 until x = 5904, → 0.10 at 6144. Normal alpha blending.

### 6.4 Shoreline rim, foam, shallows (bakeShore 605–634, drawShallow 573–603)
#### 6.4.1 Rim strokes (always)
Polyline `P(off) = (x, shoreY(x) + off)` every 8 px, round joins, drawn over land and water:

| Stroke | Offset | Width | Colour |
|---|---|---|---|
| icy rim | +6 | 12 | rgba(201, 214, 232, 0.90) |
| wet edge | +1 | 7 | rgba(255, 255, 255, 0.95) |
| (old sea only) water line | −6 | 5 | rgba(156, 199, 230, 0.55) |

#### 6.4.2 Foam strip (old sea only)
Texture `shore_foam` 512×64, lip at 0.69·64 = 44.16 px from its top. Segments of 32 px on a world grid:
```
for x = floor(xa/32)*32 − 32; x < xb + 32; x += 32:
    y1 = shoreY(x); y2 = shoreY(x + 32); ang = atan2(y2 − y1, 32)
    u  = ((x + 32) mod 512 + 512) mod 512;  sw = min(33, 512 − u)
    draw texture columns [u, u+sw) × all 64 rows, translated to (x, y1 + 4), rotated by ang,
         local rect (0, −44.16) size (sw + 0.6, 64)
```
#### 6.4.3 Shallow band (old sea only, under the snow)
`water_shallow` 512² repeat (world-anchored) masked per 6-px column: vertical gradient from sy − 130 (alpha 0) → at 55 %
alpha 0.35 → at sy + 6 alpha 0.85, where sy = shoreY(column x + 3). The snow fill then covers everything below the shoreline, so
the visible part is a turquoise fringe 130 px deep over the sea. Unity: a strip mesh along the shore with vertex alpha
(0 at sy − 130, 0.35 at sy − 55.2, 0.85 at sy + 6) and the shallow texture, placed between Sea and the land mesh.

### 6.5 Roads (drawRoads 647–698)
Input: the drawn polylines (`WORLD.paths` at start; overlay sets later). All strokes are round-capped, round-joined. Within one
pass the whole set is ONE path (union: crossings never get darker); the spine pass is a SECOND, separate pass composited over the
first (source-over), so where both cover, alphas compound: `a = 1 − (1 − a1)(1 − a2)`. Canvas `shadowBlur b` = Gaussian with σ = b/2.

| Pass | Polylines | Stroke width | Blur σ | Result |
|---|---|---|---|---|
| rim | all | 92 | 11 | colour rgb(110,130,170) × alpha 0.30 × coverage |
| rim (spine) | spine only | 128.8 (92×1.4) | 11 | same colour, second pass (the spine's rim ends up darker: ≈0.51 in its core) |
| body mask | all | 70 | 7 | coverage 0…1 |
| body mask (spine) | spine only | 98 (70×1.4) | 7 | second pass, `M = 1 − (1 − b1)(1 − b2)` |
| body | — | — | — | `ground_road` (ui2, 512²) at scale 0.5, world-anchored: `uv = (x/256, y/256)`; × mask; composite alpha **0.92** over the rim |

Unity implementation (load time or editor): rasterise a binary mask of the union of the thick polylines at 1 texel = 2 px over the
land bounding rect, Gaussian-blur it (separable, σ in texels = σpx/2), store as R8 — four masks: rim m1 (all, w92), rim m2 (spine,
w128.8), body b1 (all, w70), body b2 (spine, w98) (or pack them in one RGBA8). One quad, shader:
`rimA = 1 − (1 − 0.30·m1)(1 − 0.30·m2)`, colour rgb(110,130,170); `bodyA = 0.92 · (1 − (1 − b1)(1 − b2))`, colour
`tex(ground_road, world/256)`; output body over rim (both normal alpha blending over the land).
For the start set the rect is x −1400…1800, y 0…2620 (1600×1310 texels per mask at ½ res).
Fallback if `ground_road` is missing (not expected): trodden-snow strokes rgba(136,160,198,0.36) w80 σ13, then rgba(150,138,130,0.26) w34 σ7.

### 6.6 Path decor (pathDecor 700–747) — stamps along `WORLD.paths`
Deterministic; the same in every tile. Two independent RNG streams (`rng` §7.4.1):

```
// snow drifts (only if decal_snow_drift_a exists)
r1 = rng(11)
for pts in paths, for each segment A→B:
    len = hypot(B−A); ang = atan2(B.y−A.y, B.x−A.x)
    for (d = 90; d < len − 60; d += 230 + r1()*140):          // the increment is evaluated after the body
        t = d/len
        side = (r1() < 0.5 ? −1 : 1) * (34 + r1()*10)          // two calls, left to right
        x = A.x + (B.x−A.x)*t − sin(ang)*side;  y = A.y + (B.y−A.y)*t + cos(ang)*side
        key = r1() < 0.5 ? decal_snow_drift_a : decal_snow_drift_b
        sc  = 0.42 + r1()*0.2
        stamp(key, x, y, scale sc, rotation 0, alpha 0.55)
// footprints
r2 = rng(5); A0 = atan2(22.63, 45.25)                          // 26.57°
for pts in paths, for each segment:
    for (d = 60; d < len − 40; d += 150 + r2()*80):
        t = d/len; side = (r2() − 0.5)*24
        x, y as above
        rot = ang − A0 + (r2() < 0.5 ? π : 0)
        stamp(decal_footprints, x, y, scale 0.42, rotation rot, alpha 0.45)
```
`stamp` = draw the whole image centred on (x, y) (anchor ignored), rotate then scale. Result at start: 77 stamps (full list §11.8).
Unity: SpriteRenderers (pivot 0.5, 0.5) in layer `Ground` order 20 (drifts) / 21 (footprints), or bake into the road quad.
Overlay road sets (zones/regions) restart both streams at their own seeds when drawn.

### 6.7 Decals (bakeDecals 749–758)
`WORLD.decals` = [key, x, y, scale = 1, rotDeg = 0]; stamped centred, rotation deg→rad, **alpha 0.95**, after the path decor.
19 entries, all in start/west land (table §11.8). Unity: `Ground` order 25.

### 6.8 Zone floors (zoneFloor 776–788, drawFloor 790–832)
Polygon = `isoRect(center, size)` (corners §3.1). Drawn in this order:
1. Soft shadow: shadow colour rgba(90,110,150,0.35), blur 18 (σ 9), offset (0, +4); the polygon itself is filled opaque and then
   completely covered by step 2, so only the blurred, 4-px-lower halo shows outside the edge.
2. Clip to the polygon; fill with the floor texture (512² repeat, world-anchored, scale 1). If `floorAlpha < 1` (forest 0.5,
   hunt 0.45): overlay `ground_snow` at alpha `1 − floorAlpha`.
3. Still clipped: stroke the polygon rgba(80,50,40,0.18) width 14 (→ a 7-px inner darkening band); stroke the polygon inset
   1.2 % toward the centre (`corner + (center − corner)*0.012`) rgba(255,255,255,0.35) width 3.
4. Unclipped: stroke the polygon rgba(244,247,251,0.90) width 5 (snow lip, 2.5 px each side).
Unity: mesh polygon + world-UV shader for 2; a pre-blurred halo sprite or a 9-slice-free generated texture for 1; LineRenderer or
generated quad strips for 3–4. At a new game only the plaza floor is visible (alpha 1). Locked floors: alpha 0 until unlocked
(then tween 0 → 1 over 700 ms after 350 ms delay; instant at load).

### 6.9 Locked-zone outlines (makeLockedOutline 526–562) — forest, farm, mine, hunt at a new game
| Part | Spec | Depth |
|---|---|---|
| fill | polygon (zone corners), colour 0xC9D6E8 alpha 0.28 | OUTLINE |
| border | dashes along each edge: `n = floor(len/26)`, for k = 0, 2, 4 … < n draw segment t ∈ [k/n, min(1,(k+1)/n)]; width 5, white alpha 0.9 | OUTLINE |
| ghosts | sprites at alpha 0.2, tint 0x9FB3CC, optional scale (table §11.5) | OUTLINE + 1 + 0.01·y |
| lock | `ui_icon_lock` (96 px wide) at (cx, cy − 14), scale 60/96 = 0.625, origin 0.5, alpha 0.95 | PAD_TEXT |
| name | localized `z_forest` 소나무 숲 / `z_farm` 밀밭 / `z_mine` 광산 / `z_hunt` 사냥터 at (cx, cy + 34), 34 px, weight 900, white, stroke #4a5a72 width 8, origin 0.5, alpha 0.97 (font: Pretendard → Noto Sans KR fallback) | PAD_TEXT |
Removed (alpha → 0 over 400 ms, then destroyed; instant at load) when the zone unlocks.

### 6.10 Zone / region road overlays (roadOverlay 761–774) — later
Same drawing as §6.5 + §6.6 on that edge set only, rect = bbox of the points ± 90 px. Alpha 0 while closed; fades to 1 over 900 ms
(delay 500 ms for zones, 700 ms for regions) when it opens; instant at load. Unity: a second road quad/mask per overlay with an
alpha property. Needed for loading old saves (all zones/regions may be open).

### 6.11 What NOT to port
The 512² canvas tile pool (POOL 28, LEVEL_ZOOM [0.85, 0.42], gutters, eviction, trimming, fast-pan look-ahead, `GroundLayer`
merge/unmerge) exists only to bound WebGL texture memory and canvas cost in a browser. In Unity build the ground once at scene load
from meshes + a few generated mask textures (§6.3–6.8); nothing is re-baked per frame. Memory budget: road masks 4 × 1600×1310 R8
(or one RGBA8) ≈ 8.4 MB for the start land (+ region/zone overlays later), everything else is shared tiled textures.

---

## 7. Static props

### 7.1 The `staticImage` rule (Game.js 564–607) — every decor, fence piece, border/extra tree, worker hut
```
img = Sprite(key) at (x, y), origin = manifest anchor; depth = y + depthOff (depthOff 0 for all at start)
if flip:  img.flipX = true
if scale: img.scale = scale
r = opts.r ?? DECOR_R[key]                      // collider radius in ground px (§7.3 table)
fx = flip ? x + (frame.realWidth − 2*displayOriginX) * scale : x      // ★ Phaser mirrors INSIDE the frame box
if r: collider circle at (fx, y), radius r*scale (ground space: y doubled)
zone → hidden until that zone unlocks; region → hidden until that land opens; until → hidden for good once that land opens
occluder (x-ray, §7.8) if key matches /^tree_pine|lodge|hut|tent|mine_entrance|market|trade_post|station_/
```
**Flip (★, verified in phaser.min.js: `flipX && (x += −realWidth + 2·displayOriginX)`):** Phaser mirrors a flipped image around the
centre of its untrimmed frame box, not around the anchor, so the visible foot of a flipped picture lands at
`x + realWidth·(1 − 2·ax)·scale`. Unity's `SpriteRenderer.flipX` mirrors around the pivot. To match pixel-for-pixel:
place a flipped Unity sprite at `x + realWidth·(1 − 2·ax)·scale` (px) and keep its **depth/sort y = y** (Phaser sorts by the unshifted
y). Shift per key (scale 1): tree_pine_a +86, tree_pine_b +128, tree_pine_snow +90, tent_a +30, boat_small +20 (table §11.1).
The collider is at the shifted x as well.

### 7.2 Fences (buildFences 617–670)
```
posts = HashSet<string>
post(x, y, zone): k = round(x/6) + "," + round(y/6); if posts.Add(k) → staticImage(fence_post, x, y, zone, r = 16)
for f in WORLD.fences:
    z = zone(f.zone); (cx, cy) = z.center; hw = z.size.x/2; hh = z.size.y/2
    gated = z.unlock != null ? f.zone : null          // plaza → null (always visible)
    E = { tl: start(−hw,−hh) along +Y len size.y,   tr: start(−hw,+hh) along +X len size.x,
          bl: start(−hw,−hh) along +X len size.x,   br: start(+hw,−hh) along +Y len size.y }
    for (edge, gaps) in f.edges:
        n = floor(len); off = (len − n)/2; lastIn = false
        for i in 0..n−1:
            m = off + i + 0.5;  inGap = any gap g: g0 ≤ m ≤ g1
            p = isoPt(cx, cy, start + m along axis)
            if inGap: { if lastIn: post(isoPt(.. m − 0.5 ..)); lastIn = false; continue }
            if !lastIn && i > 0: post(isoPt(.. m − 0.5 ..))
            staticImage(axis == X ? fence_log_x : fence_log_y, p, zone = gated, r = 22)
            lastIn = true
        if no gap has g0 ≤ 0.6:        post(edge start point)
        if no gap has g1 ≥ len − 0.6:  post(edge end point)
```
Fence data (world.js 486–497): plaza `tr` gap [0, 3.2]; forest `tl`, `bl` closed; farm `tr`, `br` closed, `tl` gaps [1.4, 3.0],
[5.4, 6.8]; mine `tl` gap [6.2, 9], `bl` closed; hunt `tr`, `br` closed, `bl` gap [0, 2.5], `tl` gap [0.8, 5.2]. Total 110 pieces;
13 visible at start (§11.3). Depth y. Not occluders.

### 7.3 Decor (buildDecor 672–699)
`WORLD.decor` rows `[key, x, y, {zone, region, flip, scale, id, r}]` → `staticImage`. Extras:
- `campfire`: a looping `fx_fire` sprite sheet (128×128, 12 frames, 14 fps, anchor (0.5, 0.88)) at (x, y − 14), scale 58/128 =
  0.453, depth y + 1, random start frame 0…3. Joins the decor's zone/region visibility.
- `boat_small` / `ice_chunk` with y < shoreY(x) + 10 float (§7.7). `dock_pier` (1460, 300) stands in the sea, no tween.
- `flag_pole`: VillageFlags later replaces the baked banner with a waving village flag (slice: show the pole picture as is).
- `lamp_post`: a night light only once the day/night clock exists (rail strip open) — not at a new game.
- `id`: tents `tent43_1…4` fold when the first houses are built (other spec); `farm43_hut` etc. are farm-zone decor.

`DECOR_R` (collider radius, ground px, × scale): barrel 20, crate 26, lamp_post 12, flag_pole 14, bench 40, firewood_pile 36,
hay_bale 30, signpost 12, campfire 30, bush_snow 24, tent_a 80, chief_lodge 170, worker_hut 98, mine_entrance 120, tree_stump 18,
upgrade_bench 70; ice_chunk / snow_pile_a / snow_pile_b / dock_pier / boat_small 0 (no collider).

### 7.4 Trees
#### 7.4.1 RNG (Placeholders.js 27) — copy bit-exactly
JS: `s = seed>>>0 || 1; next(): s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296;`
`s >> 17` is a **signed** (arithmetic) shift of the int32 view — this is NOT textbook xorshift32. C#:
```csharp
sealed class JsRng { uint s;
  public JsRng(uint seed) { s = seed == 0 ? 1u : seed; }
  public double Next() { s ^= s << 13; int i = unchecked((int)s); i ^= i >> 17; i ^= i << 5; s = unchecked((uint)i); return s / 4294967296.0; } }
```
Golden: replaying the border loop (§7.4.2, band 0 is skipped but still consumes its draws) must give `trees[0]` of the JSON =
`tree_pine_snow` at (1650.595, 412.012), scale 0.92586, from band 1.

#### 7.4.2 Border forest (buildTrees 821–845)
```
r = JsRng(1234); kinds = [tree_pine_a, tree_pine_b, tree_pine_snow, tree_pine_snow]
for band (x0, y0, x1, y1, step, region, until) in WORLD.borderTrees (in order):
    skip = until != null && regions[until].cfg.open == true            // only the 'west' band → skipped (RNG still drawn)
    row = 0
    for (y = y0; y <= y1; y += step*0.55, row++)                        // double accumulation, same order as JS
      for (x = x0; x <= x1; x += step):
        x2 = x + (r() − 0.5)*step*0.6 + (row % 2)*step/2
        y2 = y + (r() − 0.5)*step*0.3
        k = kinds[floor(r()*4)]; fl = r() < 0.5; sc = 0.9 + r()*0.25    // all 5 draws happen before any test
        if skip || y2 < shoreY(x2) + 40 || blockedForDecor(x2, y2) || x2 > 6124 || x2 < −1380 || y2 > 3450: continue
        if any treeGap g: g.x0 ≤ x2 ≤ g.x1 && g.y0 ≤ y2 ≤ g.y1: continue      // WORLD.v42.treeGaps
        staticImage(k, x2, y2, r = 24, flip = fl, scale = sc, region = region ?? regionAt(x2, y2), until = until)
for (x, y, k, region) in WORLD.extraTrees:
    if !blockedForDecor(x, y): staticImage(k, x, y, r = 24, flip = (x % 2 == 0), region = region)   // scale 1
```
Decorative (cannot be chopped). Placed: 319 border pines and 19 of the 32 `extraTrees` rows (the rest are blocked); visible at a new
game: 93 + 5 (the others stand in closed land). treeGaps: [6000,2450,6150,2850] [3300,3300,3700,3460] [−640,2380,−530,2480] [2990,3370,3240,3460] [1600,1510,1645,1560]
[1600,3370,1800,3440].

#### 7.4.3 `blockedForDecor(x, y)` (Game.js 771–819) — true = no tree here
```
for every zone z (all 7): inIsoRect(x, y,       z, size + 1.6 m)  → true
                          inIsoRect(x, y − 90,  z, size + 0.6 m)  → true      // canopy over the zone
                          inIsoRect(x, y − 170, z, size)          → true
for every polyline in WORLD.allPaths, each segment: point-segment distance (plain px, NOT ground) < 75 → true
spots (ground distance gdist < r → true):
  deck.reel (1089, 386) r170; deck.foot (890, 420) r120; player start (1130, 412) r120
  every WORLD.pads row: (x, y) r120, and its hut (if any) r150
  every WORLD.decor row whose key matches /lodge|tent|pier|flag|campfire/: r120 (chief_lodge r230)
  every plot: hidden → diamond test |x−px|/(fw/2+20) + |y−py|/(fh/2+10) < 1 with (fw,fh) = S 181×91, M 272×136, L 362×181,
                       XL 525×262 → true;
              not hidden → (px, py) r = S190 / M250 / L310 (XL and others 250), (px, py+100) r150, (px, py+220) r200
              plus each plot.clear [dx, dy, r] → (px+dx, py+dy) r
  every tower: (x, y) r170, (x, y+70) r130, (x, y+190) r160
  every pads2 row r120; foodBox (690, 1752) r140; every labour pile r125; every bakery43.decorClear [x, y, r]
reserve polygons: point-in-polygon of (x, y) or (x, y − 90) → true
```
Note the iteration covers *all* plots/pads (including v42 plots and later-step pads): the forest is shaped by future buildings too.

#### 7.4.4 Choppable trees (ResourceNode `Tree`, depth y, collider r 24, occluder, never flipped)
- Region trees `WORLD.regionTrees` [x, y, key, region], scale 0.9; the two at (2950, 1150), (2930, 1010) are never planted
  (`removeDecor` 'regionTree', ±12 px). **The 5 `west` ones are visible at a new game** (§11.4).
- Forest zone trees (zone `forest`, hidden at start): jittered grid `rng(77)`, grid 2.05 m, jitter 0.3, margin 0.95, scale 0.9,
  cornerCut −5.5, avoid circles, `hidesPile` — 2 + 2 extra placed (JSON `trees` src `forest*`). Wobble/chop/regrow: other spec.

### 7.5 Huts
- **Chief hut** (ChiefHut.js; Office.syncHut): `chief_lodge` at (600, 640), depth 640, occluder, `noCull`, 9 collision circles
  `[dx, dy, r]` = [−86,−29,50] [−36,−5,50] [9,23,50] [54,45,46] [−36,−54,50] [18,−32,50] [68,−7,50] [109,18,46] [90,45,40];
  spots door (428, 663), desk (632, 642), mailbox (490, 690), yard (845, 498). Present while plot `v42_office` is empty or a
  foundation; removed (squash tween 420 ms + poof) when the office scaffold goes up. Not saved.
- **Worker huts** (buildHuts): `worker_hut` scale 0.8, collider r 80·0.8 = 64, occluder; fisherman (−760, 490) zone null →
  **visible at start**; lumberjack (300, 1010) forest; miner (236, 1730) mine; hunter (1616, 1790) hunt (hidden until unlocked).

### 7.6 Life props (VillageLife.buildProps 95–122)
Rows `[key, x, y, {id, after, flip, scale}]`. Sprite at (x, y), origin = anchor, depth y; kind `decal` (ice_rink) → depth
GROUND_DECAL + 2 instead and no collider. Collider r = `clamp(footprint.x * 0.36, 10, 70)` (lantern_string: none). Occluder if
manifest `topPx > 70`. `after` = hidden until that step/flag (`Progression.met`). `lantern_string` plays its `twinkle` animation.
The snowman shows frame `snowman_<stage>` (stage 0 at a new game). 8 visible at a new game (§11.4).

### 7.7 Floating sea decor (buildDecor 690–697)
For `boat_small`/`ice_chunk` in the sea: tween `y: y → y + 4` and `angle: −1.5° → +1.5°`, yoyo, repeat forever, duration
`1600 + (x % 7)*120` ms, delay `(x % 5)*200` ms, ease Sine.easeInOut (JS `%` keeps the dividend's sign, as C#). 8 floaters visible.

### 7.8 Occluders (x-ray) — summary for cross-checking the occlusion spec
`addOccluder(img)`: record `{ x = img.x + (0.5 − originX)·displayWidth, y = img.y, hw = displayWidth/2, top = displayHeight·originY·0.95,
big = displayWidth > 250 }`. Occlusion.update every 0.1 s: a visible character c with `o.y − top < c.y < o.y − 4` and
`|c.x − o.x| ≤ hw + 22` and the picture opaque (alpha > 110 on a 4-px mask, flip-aware) at ≥ 1 (≥ 2 if big) of the points
(c.x, c.y − 18), (c.x, c.y + 0.55·head), (c.x, c.y + head + 12) (head default −80) → target alpha **0.32**; else 1; alpha moves
toward the target by `min(1, dt·10)` per frame (snap within 0.02). Static occluders at start: border/extra/region pines, tents,
huts, chief hut, market, stations with tall art, life props with topPx > 70.

---

## 8. Territory, fog, camera bounds, walkable land

### 8.1 Walkable land (Territory.walkRects / applyWalk, Collision)
`open` = rects of open regions; `inner` = each open rect inset by 46 px from the fog/map edge (top edge not inset when y0 = 0;
x clamped to [X0 + 40, W − 40], y to [0, H − 40]) plus 92-px-wide bridges where two open rects touch. A point is walkable when
`x ≥ −1360 && x ≤ 6104 && y ≤ 3410`, the point and its four neighbours at ±46 px are inside `open`, and `y ≥ shore(x) + 46`
(chief-only land excepted). At a new game: open = start [0,0,1800,2620] + west [−1400,0,0,2620]; inner =
[46, 0, 1754, 2574], [−1354, 0, −46, 2574], bridge [−48, 0, 48, 2574].

### 8.2 Fog walls (Territory.buildFog / makeFog 160–257) — `FOG_DEPTH = 29000`, fill colour 0xE6EEF6
For each closed region: an opaque fill rect, inset 150 px on every side that faces open land ("exposed span"), plus, on each exposed
span, scrolling `fog_bank` tile sprites (ui2: `fog_bank` 512×256, `fog_bank_mid` 512×192, `fog_bank_front` 512×128, repeat-x) and
round `fog_puff` billows (128×128). Exposed spans at a new game:

| Region | Exposed | Fill rect (x, y, w, h) | Wall pieces (origin top-left; angle in degrees, clockwise = Phaser +) |
|---|---|---|---|
| east | left x=1800, y 0…1500 | 1950, 0, 1050, 1500 | bank: pos (2000, −60) size 1620×256 angle 90 speed 5; mid: (1920, −60) 1620×192 angle 90 α0.85 speed −11 |
| se | left x=1800, y 1500…2620 | 1950, 1500, 1050, 1950 | bank (2000, 1440) 1240×256 ∠90 speed 5; mid (1920, 1440) 1240×192 ∠90 α0.85 speed −11 |
| south | top y=2620, x 0…1800 | 0, 2770, 1800, 680 | bank (0, 2550) 1800×256 flipY speed 6; mid (0, 2510) 1800×192 flipY α0.9 speed −13; front (0, 2470) 1800×128 flipY α0.85 speed 30 |
| west_s | top y=2620, x −1400…0 | −1400, 2770, 1400, 680 | bank (−1400, 2550) …; mid (−1400, 2510); front (−1400, 2470) — as south |
| rail, town | none | full rect | (outside the camera bounds) |

Depths: fill FOG; bank FOG+1; mid FOG+2; front FOG+3. Scrolling: `tilePositionX += speed·dt` (only while the fog rect is within 300 px
of the view). Puffs (`Math.random`, not deterministic): top spans `for x = a+40; x < b; x += 150` → puff(x ± 30, y0 + 40…70,
scale 1.6…2.4); left spans `for y = a; y < b; y += 160…280` → puff(x0 + 10…60, y, scale 1.5…2.6). Puff depth
`FOG + 1 + (y % 97)·0.001`; wobble `x = x0 + 14·sin(k)`, `y = y0 + 6·cos(0.8k)`, `k = 0.35·t + phase` (phase random 0…2π).
Rotation note: a 90° tile sprite with origin (0,0) at (X, Y) occupies x ∈ [X − 256, X], y ∈ [Y, Y + len]; its billows (the
texture's bottom) face −x (the village). Reveal (later): fog parts fade 1500–2000 ms + drift ±90 px; puff burst particles; other
closed regions rebuild their walls for the new edges (fade in 900 ms).

### 8.3 Camera bounds (Territory.bounds)
bbox of open regions; +260 px (CAM_PEEK) on each side that touches a closed region; top = −150 (SEA_PEEK) when the bbox starts at
y 0; clamped to the world. **New game: x −1400 … 2060, y −150 … 2880 (w 3460, h 3030).** Overview (land only): x −1400…2060,
y 0…2880. The camera's zoom range / follow are the camera spec's.

---

## 9. Snowfall (Game.build 351–353, tick; Effects PRESETS.snowfall)
Particle emitter, depth FX − 10 (30990), texture `fx_snowflake` (64×64): every `0.09 / Perf.snow` s (snow = 1 high, 0.6 mid,
0.3 low) emit 1 particle at `(view.x + rand·view.w, view.y − 20 + rand·0.6·view.h)`; lifespan 5000…8000 ms; speed 10…40 px/s;
angle 80…110° (Phaser 90° = down); gravityY 12 px/s²; scale 9/64 = 0.1406 → 0.0703 over life; alpha 0.85 → 0; random rotation
0…360°; tint white. Unity: a ParticleSystem in world space parented to nothing, emitting from a box over the camera view.

---

## 10. Depth scheme (proposal — reconcile with the shared depth/occlusion spec; the Phaser depth VALUES above are the contract)

> **SUPERSEDED by 00 A3/§4.1** (exact per-frame rank of `(double Depth, long Seq)` on the built-in Default sorting
> layer; no per-band layers, no ×8 orders, no custom-axis sort). The Phaser depth VALUES in this spec remain the
> contract. The proposal below is kept for reference only.

- Sorting layers bottom → top: `Sea`, `Ground`, `GroundTop`, `World`, `Labels`, `Fog`, `FX`, (UI in its own canvas).
- `World` (every standing object): `sortingOrder = clamp(floor((depth + 512) · 8) − 32768, −32768, 32767)` — exact for depths
  −512 … 7679.875 at 1/8 px resolution (covers y ∈ [0, 3450] plus offsets like the pad labels' +1990/+2000). Static objects set it
  once; moving ones update when y changes (Phaser's `DepthSort` does the same every frame). Offsets smaller than 1/8 px (deck rods
  +0.01 steps, flag strips +0.0004) collapse: use a `SortingGroup` for such compound objects and order children explicitly.
- Set the 2D renderer's Transparency Sort Mode = Custom Axis (0, 1, 0) so equal orders fall back to "lower on screen draws later".
- Reconciling with `01_core_view.md` §7 (pure Custom-Axis pivot sorting, sortingOrder 0): that reproduces `depth = y` exactly but
  cannot express the offsets this spec needs (front layers y + 1, sign y + 0.2, campfire flame y + 1, deck back y − 90 / front
  y − 89.4, labels y + 1990). If pivot sorting is chosen, express an offset with a "depth anchor": a parent with a `SortingGroup`
  placed at `ToUnity(x, depth)` and the SpriteRenderer child at local `ToUnity(0, y − depth)` (the group sorts by its own position,
  the picture still draws at y). Either way the Phaser depth values in this document are the contract.
- `Ground`: fixed orders — land 0, vignette 1, shallow −1 (or on `Sea` 3), rim 2, road rim+body 10, drifts 20, footprints 21,
  decals 25, floors 30 + zone index, overlay roads 40 + index, live shore band 50.
- `GroundTop`: `order = round((depth + 13600) · 10)` (range GROUND_DECAL … DUST fits).
- `Fog`: `order = round((depth − 29000) · 1000)`.
- Colour space: canvas blending is in sRGB (gamma). Use **Gamma** colour space (Player settings) for parity of all the
  semi-transparent constants here (0.10 vignette, 0.28 outline fill, 0.30 road rim, 0.32 x-ray …); in Linear they visibly shift.

---

## 11. Static table — every visible element at new-game start

Depth rule column: `y` = Phaser depth equals the anchor y (→ `World`); other values are the Phaser DEPTH expressions of §6.1.
"Occ" = x-ray occluder. Colliders are circles in ground space (y doubled) at the (flip-shifted) foot.

### 11.1 Picture keys used at start: atlas, anchor, sizes, Unity pivot, flip shift

| key | atlas | anchor (ax, ay) | source W×H | trim x, y, w, h | Unity pivot in trimmed rect | flip shift px = W(1−2ax) | footprint | topPx |
|---|---|---|---|---|---|---|---|---|
| tree_pine_a | props_nature | 0.33203, 0.67 | 256×300 | 2, 19, 220, 251 | 0.3773, 0.2749 | +86.0 | [58, 29] | 180 |
| tree_pine_b | props_nature | 0.27143, 0.67135 | 280×356 | 2, 19, 240, 303 | 0.3083, 0.2739 | +128.0 | [54, 27] | 219 |
| tree_pine_snow | props_nature | 0.32955, 0.66883 | 264×308 | 4, 19, 223, 258 | 0.3722, 0.2752 | +90.0 | [58, 29] | 186 |
| bush_snow | props_nature | 0.41912, 0.56452 | 136×124 | 6, 19, 110, 86 | 0.4636, 0.4070 | +22.0 | [70, 35] | 50 |
| snow_pile_a | props_nature | 0.46277, 0.51852 | 188×108 | 19, 19, 145, 64 | 0.4690, 0.4219 | +14.0 | [140, 70] | 35 |
| snow_pile_b | props_nature | 0.5, 0.47826 | 124×92 | 19, 18, 82, 51 | 0.5244, 0.4902 | +0.0 | [100, 50] | 24 |
| ice_chunk | props_nature | 0.46324, 0.575 | 136×120 | 19, 19, 92, 79 | 0.4783, 0.3671 | +10.0 | [100, 50] | 48 |
| dock_pier | props_buildings | 0.44415, 0.62662 | 376×308 | 5, 19, 343, 266 | 0.4723, 0.3459 | +42.0 | [290, 145] | 173 |
| boat_small | props_decor | 0.45098, 0.55128 | 204×156 | 12, 19, 167, 112 | 0.4790, 0.4018 | +20.0 | [167, 84] | 66 |
| lamp_post | props_decor | 0.20556, 0.63983 | 180×236 | 15, 19, 130, 187 | 0.1692, 0.2941 | +106.0 | [32, 16] | 130 |
| barrel | props_decor | 0.34848, 0.60714 | 132×140 | 6, 18, 98, 98 | 0.4082, 0.3163 | +40.0 | [49, 24] | 65 |
| crate | props_decor | 0.375, 0.58333 | 152×144 | 9, 19, 117, 101 | 0.4103, 0.3564 | +38.0 | [72, 36] | 64 |
| flag_pole | props_decor | 0.15132, 0.64 | 304×400 | 16, 19, 221, 336 | 0.1358, 0.2946 | +212.0 | [45, 22] | 236 |
| campfire | props_decor | 0.47794, 0.51 | 136×100 | 15, 19, 97, 59 | 0.5155, 0.4576 | +6.0 | [77, 38] | 30 |
| firewood_pile | props_decor | 0.40625, 0.59459 | 160×148 | 11, 19, 121, 103 | 0.4463, 0.3301 | +30.0 | [91, 45] | 67 |
| bench | props_decor | 0.41667, 0.55 | 180×140 | 13, 18, 139, 98 | 0.4460, 0.3980 | +30.0 | [113, 57] | 57 |
| tent_a | props_buildings | 0.44932, 0.60417 | 296×240 | 15, 19, 251, 193 | 0.4701, 0.3471 | +30.0 | [195, 97] | 124 |
| hay_bale | props_decor | 0.40909, 0.5625 | 132×112 | 14, 19, 93, 71 | 0.4301, 0.3803 | +24.0 | [72, 36] | 43 |
| signpost | props_decor | 0.32143, 0.645 | 168×200 | 19, 19, 120, 153 | 0.2917, 0.2810 | +60.0 | [32, 16] | 108 |
| fence_log_x | props_decor | 0.34091, 0.59091 | 132×132 | 1, 19, 117, 96 | 0.3761, 0.3854 | +42.0 | [62, 31] | 57 |
| fence_log_y | props_decor | 0.34091, 0.58824 | 132×136 | 2, 18, 115, 98 | 0.3739, 0.3673 | +42.0 | [62, 31] | 60 |
| fence_post | props_decor | 0.28333, 0.61429 | 120×140 | 9, 18, 82, 97 | 0.3049, 0.2990 | +52.0 | [28, 14] | 66 |
| worker_hut | props_buildings | 0.39474, 0.65489 | 380×368 | 3, 19, 341, 324 | 0.4311, 0.3148 | +80.0 | [235, 118] | 221 |
| chief_lodge | props_buildings | 0.41606, 0.67235 | 548×528 | 2, 19, 505, 486 | 0.4475, 0.3086 | +92.0 | [371, 186] | 334 |
| station_grill | props_buildings | 0.44403, 0.62719 | 268×228 | 6, 52, 240, 165 | 0.4708, 0.4485 | +30.0 | [190, 95] | 89 |
| station_sawmill | props_buildings | 0.42188, 0.56633 | 256×196 | 6, 22, 223, 153 | 0.4574, 0.4183 | +40.0 | [199, 100] | 91 |
| station_smelter | props_buildings | 0.43846, 0.75305 | 260×328 | 8, 86, 220, 230 | 0.4818, 0.3000 | +32.0 | [199, 100] | 159 |
| station_smokehouse | props_buildings | 0.34247, 0.6994 | 292×336 | 2, 78, 261, 239 | 0.3755, 0.3431 | +92.0 | [199, 100] | 155 |
| crop_wheat_3 | props_nature | 0.41509, 0.58511 | 212×188 | 14, 19, 170, 142 | 0.4353, 0.3592 | +36.0 | [136, 68] | 90 |
| rock_ore | props_nature | 0.40698, 0.55921 | 172×152 | 3, 19, 143, 112 | 0.4685, 0.4107 | +32.0 | [136, 68] | 65 |
| rock_ore_b | props_nature | 0.42568, 0.56757 | 148×148 | 3, 18, 125, 111 | 0.4800, 0.4054 | +22.0 | [145, 72] | 64 |
| log_seat | life_props | 0.44886, 0.59783 | 176×92 | 19, 19, 133, 62 | 0.4511, 0.4193 | +18.0 | [102, 14] | 35 |
| log_seat_y | life_props | 0.42763, 0.55 | 152×120 | 12, 19, 113, 79 | 0.4690, 0.4051 | +22.0 | [93, 46] | 46 |
| notice_board | life_props | 0.30172, 0.63889 | 232×216 | 19, 19, 181, 170 | 0.2818, 0.3000 | +92.0 | [90, 13] | 117 |
| lantern_string | life_props | 0.3617, 0.65948 | 376×232 | 18, 19, 323, 186 | 0.3653, 0.2796 | +104.0 | [218, 10] | 133 |
| snowman_0 | life_props | 0.40816, 0.63889 | 196×180 | 19, 72, 101, 63 | 0.6040, 0.3175 | +36.0 | [54, 27] | 42 |
| snow_fort | life_props | 0.36923, 0.66875 | 260×160 | 20, 19, 208, 115 | 0.3654, 0.2348 | +68.0 | [134, 24] | 87 |
| snowball_pile | life_props | 0.5, 0.55435 | 108×92 | 19, 18, 66, 52 | 0.5303, 0.3654 | +0.0 | [51, 26] | 31 |
| dog_house | life_props | 0.43919, 0.60119 | 148×168 | 9, 19, 117, 125 | 0.4786, 0.3440 | +18.0 | [64, 29] | 80 |
| deck43_t1_back | deck43 | 0.59375, 0.43333 | 384×300 | 19, 18, 340, 257 | 0.6147, 0.5642 | -72.0 | [235, 118] | 110 |
| deck43_t1_front | deck43 | 0.59375, 0.43333 | 384×300 | 76, 88, 197, 140 | 0.7716, 0.7000 | -72.0 | — | — |
| deck43_landing | deck43 | 0.46111, 0.57258 | 180×124 | 19, 18, 134, 86 | 0.4776, 0.3837 | +14.0 | [100, 50] | 51 |
| market_s1_back | market_s1 | 0.32732, 0.70122 | 388×328 | 19, 19, 335, 279 | 0.3224, 0.2437 | +134.0 | [195, 97] | 209 |
| market_s1_front | market_s1 | 0.32732, 0.70122 | 388×328 | 19, 167, 168, 106 | 0.6429, 0.4057 | +134.0 | — | — |

Atlases: `assets/props/props_{nature,decor,buildings}.json`, `assets/life_props/life_props.json`, `assets/deck43/deck43.json`,
`assets/market/market_s1.json`. Ground textures (standalone PNGs, all repeat or centred stamps): `ground_snow`, `ground_plaza`,
`ground_dirt`, `ground_farm`, `ground_rock`, `water_sea`, `water_shallow` (512²), `shore_foam` (512×64), `fish_school` (256×128),
`decal_snow_drift_a/b` (256×128), `decal_footprints` (256×128), `decal_puddle_ice` (160×80), `decal_dirt_patch` (192×96) in
`assets/ground/`; `ground_road` (512²) and the fog textures in `assets/ui2/`.

### 11.2 Ground layers at start
| Element | Geometry | Texture / colour | Depth |
|---|---|---|---|
| Old sea + 2 fish bands | §6.2.2 | water_sea, fish_school | WATER / FISH |
| Land + vignette | under shoreY, x −1400…6144 | ground_snow (world UV/512) | GROUND |
| Shore rim (2 strokes; 3 + foam + shallows on old sea) | along shoreY | §6.4 | GROUND |
| Roads | 28 polylines (§11.7) | ground_road (world UV/256), rim | GROUND |
| Path decor | 77 stamps (§11.8) | drifts α0.55, footprints α0.45 | GROUND |
| Decals | 19 (§11.8) | α0.95 | GROUND |
| Plaza floor | L (356.5, 800) T (990, 483.18) R (1623.5, 800) B (990, 1116.82) | ground_plaza + §6.8 strokes | GROUND (merged) |
| Locked outlines ×4 | zone corners (§3.1) | §6.9 | OUTLINE / PAD_TEXT |

### 11.3 Fences visible at start (plaza `tr` edge; zone = none)

| # | key | x | y | collider r | depth |
|---|---|---|---|---|---|
| 1 | fence_post | 1125.75 | 551.07 | 16 | y |
| 2 | fence_log_x | 1148.38 | 562.38 | 22 | y |
| 3 | fence_log_x | 1193.63 | 585.01 | 22 | y |
| 4 | fence_log_x | 1238.88 | 607.64 | 22 | y |
| 5 | fence_log_x | 1284.13 | 630.27 | 22 | y |
| 6 | fence_log_x | 1329.38 | 652.91 | 22 | y |
| 7 | fence_log_x | 1374.63 | 675.54 | 22 | y |
| 8 | fence_log_x | 1419.88 | 698.17 | 22 | y |
| 9 | fence_log_x | 1465.13 | 720.8 | 22 | y |
| 10 | fence_log_x | 1510.38 | 743.43 | 22 | y |
| 11 | fence_log_x | 1555.63 | 766.06 | 22 | y |
| 12 | fence_log_x | 1600.88 | 788.69 | 22 | y |
| 13 | fence_post | 1623.5 | 800 | 16 | y |

### 11.4 Decor, trees, life props visible at start

Decor (77 rows; `WORLD.decor` order; scale 1 unless given):

| # | key | x | y | flip → Unity x | scale | collider r | Occ | notes |
|---|---|---|---|---|---|---|---|---|
| 1 | dock_pier | 1460 | 300 | — | 1 | — | — |  |
| 2 | boat_small | 1650 | 250 | — | 1 | — | — | floats (§7.7) |
| 3 | ice_chunk | 210 | 318 | — | 1 | — | — | floats (§7.7) |
| 4 | ice_chunk | 470 | 340 | — | 0.7 | — | — | floats (§7.7) |
| 5 | boat_small | 1290 | 214 | yes → 1307 | 0.85 | — | — | floats (§7.7) |
| 6 | ice_chunk | 1305 | 330 | — | 0.55 | — | — | floats (§7.7) |
| 7 | lamp_post | 800 | 480 | — | 1 | 12 | — |  |
| 8 | barrel | 1150 | 470 | — | 1 | 20 | — |  |
| 9 | crate | 1205 | 492 | — | 1 | 26 | — |  |
| 10 | crate | 1182 | 448 | — | 0.8 | 20.8 | — |  |
| 11 | flag_pole | 1250 | 530 | — | 1 | 14 | — | village flag later |
| 12 | snow_pile_a | 236 | 512 | — | 1 | — | — | removed when the hall site shows |
| 13 | snow_pile_b | 345 | 700 | — | 1 | — | — | removed when the hall site shows |
| 14 | bush_snow | 1620 | 545 | — | 1 | 24 | — |  |
| 15 | bush_snow | 1640 | 660 | — | 1 | 24 | — |  |
| 16 | snow_pile_b | 1720 | 600 | — | 1 | — | — |  |
| 17 | campfire | -45 | 505 | — | 1 | 30 | — | fx_fire loop at (-45, 491), depth y+1 |
| 18 | firewood_pile | 470 | 498 | — | 1 | 36 | — |  |
| 19 | barrel | 728 | 503 | — | 1 | 20 | — |  |
| 20 | lamp_post | 393 | 800 | — | 1 | 12 | — |  |
| 21 | lamp_post | 990 | 1099 | — | 1 | 12 | — |  |
| 22 | lamp_post | 1271 | 637 | — | 1 | 12 | — |  |
| 23 | bench | 637 | 913 | — | 1 | 40 | — |  |
| 24 | barrel | 1545 | 800 | — | 1 | 20 | — |  |
| 25 | crate | 1522 | 826 | — | 0.85 | 22.1 | — |  |
| 26 | bush_snow | 1366 | 657 | — | 1 | 24 | — |  |
| 27 | snow_pile_b | 1393 | 934 | — | 1 | — | — |  |
| 28 | tent_a | 660 | 2380 | — | 1 | 80 | yes | id tent43_1 |
| 29 | tent_a | 1260 | 2370 | yes → 1290.003 | 1 | 80 | yes | id tent43_2 |
| 30 | tent_a | 880 | 2392 | — | 1 | 80 | yes | id tent43_3 |
| 31 | tent_a | 1112 | 2422 | yes → 1142.003 | 1 | 80 | yes | id tent43_4 |
| 32 | campfire | 870 | 2525 | — | 1 | 30 | — | fx_fire loop at (870, 2511), depth y+1 |
| 33 | flag_pole | 1345 | 2285 | — | 1 | 14 | — | village flag later |
| 34 | lamp_post | 700 | 2270 | — | 1 | 12 | — |  |
| 35 | lamp_post | 1080 | 2560 | — | 1 | 12 | — |  |
| 36 | firewood_pile | 760 | 2500 | — | 1 | 36 | — |  |
| 37 | barrel | 1200 | 2500 | — | 1 | 20 | — |  |
| 38 | crate | 1240 | 2530 | — | 1 | 26 | — |  |
| 39 | bench | 975 | 2555 | — | 1 | 40 | — |  |
| 40 | hay_bale | 1340 | 2470 | — | 1 | 30 | — |  |
| 41 | snow_pile_a | 520 | 2490 | — | 1 | — | — |  |
| 42 | bush_snow | 1420 | 2480 | — | 1 | 24 | — |  |
| 43 | snow_pile_b | 780 | 2250 | — | 1 | — | — |  |
| 44 | barrel | 820 | 2420 | — | 1 | 20 | — |  |
| 45 | lamp_post | 1040 | 1500 | — | 1 | 12 | — |  |
| 46 | lamp_post | 940 | 1850 | — | 1 | 12 | — |  |
| 47 | signpost | 940 | 1520 | — | 1 | 12 | — |  |
| 48 | bush_snow | 1052 | 1660 | — | 1 | 24 | — |  |
| 49 | snow_pile_b | 900 | 1720 | — | 1 | — | — |  |
| 50 | barrel | 1050 | 1900 | — | 1 | 20 | — |  |
| 51 | crate | 920 | 2080 | — | 1 | 26 | — |  |
| 52 | bush_snow | 900 | 1250 | — | 1 | 24 | — |  |
| 53 | lamp_post | 920 | 1215 | — | 1 | 12 | — |  |
| 54 | ice_chunk | 1060 | 1760 | — | 0.6 | — | — |  |
| 55 | campfire | 740 | 1575 | — | 1 | 30 | — | fx_fire loop at (740, 1561), depth y+1 |
| 56 | ice_chunk | -380 | 330 | — | 1 | — | — | floats (§7.7) |
| 57 | ice_chunk | -1050 | 322 | — | 0.7 | — | — | floats (§7.7) |
| 58 | boat_small | -760 | 262 | yes → -743 | 0.85 | — | — | floats (§7.7) |
| 59 | signpost | -40 | 720 | — | 1 | 12 | — |  |
| 60 | lamp_post | -190 | 690 | — | 1 | 12 | — | moves to (−290, 770) when the bank is built |
| 61 | lamp_post | -470 | 1080 | — | 1 | 12 | — |  |
| 62 | lamp_post | -640 | 1580 | — | 1 | 12 | — |  |
| 63 | lamp_post | -245 | 1835 | — | 1 | 12 | — |  |
| 64 | snow_pile_a | -140 | 500 | — | 1 | — | — | removed when the bank is built |
| 65 | bush_snow | -520 | 520 | — | 1 | 24 | — |  |
| 66 | barrel | -960 | 520 | — | 1 | 20 | — |  |
| 67 | crate | -930 | 546 | — | 1 | 26 | — |  |
| 68 | snow_pile_b | -1250 | 520 | — | 1 | — | — |  |
| 69 | bush_snow | -1300 | 1250 | — | 1 | 24 | — |  |
| 70 | snow_pile_a | -1000 | 1450 | — | 1 | — | — |  |
| 71 | bush_snow | -60 | 1500 | — | 1 | 24 | — |  |
| 72 | snow_pile_b | -180 | 2300 | — | 1 | — | — |  |
| 73 | campfire | -260 | 2350 | — | 1 | 30 | — | fx_fire loop at (-260, 2336), depth y+1 |
| 74 | firewood_pile | -310 | 2450 | — | 1 | 36 | — |  |
| 75 | hay_bale | -1220 | 2100 | — | 0.9 | 27 | — |  |
| 76 | bush_snow | -820 | 2200 | — | 1 | 24 | — |  |
| 77 | flag_pole | -1000 | 1520 | — | 1 | 14 | — | village flag later |

Life props (8):

| id | key | x | y | collider r | Occ (topPx > 70) | depth |
|---|---|---|---|---|---|---|
| seat_beach_n | log_seat | -45 | 452 | 36.72 | — | y |
| seat_beach_w | log_seat_y | -125 | 520 | 33.48 | — | y |
| notice | notice_board | 500 | 890 | 32.4 | yes | y |
| lanterns_s | lantern_string | 990 | 1182 | — | yes | y |
| snowman | snowman_0 | 1352 | 486 | 19.44 | — | y |
| fort | snow_fort | 1530 | 612 | 48.24 | yes | y |
| pile | snowball_pile | 1440 | 556 | 18.36 | — | y |
| doghouse | dog_house | 1490 | 1000 | 23.04 | yes | y |

Trees visible at start (103: 93 border + 5 extra, decorative, collider r 24, occluder; 5 region/west, choppable Tree, scale 0.9).
CSV `src,key,x,y,flip,scale` (flip → apply the §7.1 shift; depth = y):

```
src,key,x,y,flip,scale
border#1,tree_pine_snow,1650.595,412.012,0,0.926
border#1,tree_pine_b,1773.607,1423.514,1,0.95
border#1,tree_pine_a,1765.129,1514.519,0,0.974
border#1,tree_pine_b,1717.999,1571.731,1,1.022
border#1,tree_pine_a,1744.28,1725.202,0,0.914
border#1,tree_pine_a,1784.573,1791.826,1,0.993
border#1,tree_pine_snow,1788.299,1911.177,1,1.128
border#1,tree_pine_b,1770.437,2302.134,0,0.917
border#1,tree_pine_b,1717.918,2566.548,1,0.986
border#1,tree_pine_snow,1658.671,2617.238,0,1.047
border#2,tree_pine_b,-10.593,2543.018,0,1.018
border#2,tree_pine_snow,106.256,2566.868,0,1.031
border#2,tree_pine_a,225.443,2568.78,1,1.09
border#2,tree_pine_snow,703.663,2566.024,0,0.93
border#3,tree_pine_snow,1193.687,2554.67,0,0.966
border#3,tree_pine_snow,1280.204,2561.93,0,0.96
border#3,tree_pine_a,1721.118,2555.043,0,0.966
border#12,tree_pine_snow,-1310.959,418.313,1,1.083
border#12,tree_pine_a,-1336.425,477.249,0,1.043
border#12,tree_pine_a,-1270.436,472.512,1,1.018
border#12,tree_pine_snow,-1373.035,534.006,1,0.962
border#12,tree_pine_snow,-1292.442,542.301,0,1.074
border#12,tree_pine_b,-1339.933,583.538,1,0.94
border#12,tree_pine_snow,-1229.502,579.604,0,1.049
border#12,tree_pine_a,-1294.358,631.146,0,1.109
border#12,tree_pine_snow,-1378.402,709.092,1,1.108
border#12,tree_pine_b,-1253.854,692.25,1,1.098
border#12,tree_pine_snow,-1318.246,751.766,1,1.02
border#12,tree_pine_snow,-1325.772,817.433,1,1.08
border#12,tree_pine_a,-1236.381,801.455,0,1.052
border#12,tree_pine_snow,-1353.164,910.114,0,0.915
border#12,tree_pine_snow,-1376.145,967.153,1,1.141
border#12,tree_pine_a,-1323.963,969.94,1,1.088
border#12,tree_pine_a,-1376.088,1028.922,0,0.932
border#12,tree_pine_a,-1261.426,1028.743,0,0.986
border#12,tree_pine_snow,-1353.926,1123.517,1,1.117
border#12,tree_pine_a,-1370.242,1177.073,0,0.993
border#12,tree_pine_a,-1323.003,1259.042,0,0.902
border#12,tree_pine_snow,-1271.5,1243.372,0,0.902
border#12,tree_pine_b,-1324.268,1300.861,1,0.949
border#12,tree_pine_snow,-1378.385,1345.811,1,1.084
border#12,tree_pine_a,-1292.069,1404.575,1,1.022
border#12,tree_pine_b,-1323.686,1478.454,1,1.004
border#12,tree_pine_b,-1270.072,1472.953,0,1.142
border#12,tree_pine_snow,-1314.046,1528.463,0,1.122
border#12,tree_pine_snow,-1374.461,1583.279,0,0.933
border#12,tree_pine_snow,-1253.488,1567.014,0,1.096
border#12,tree_pine_snow,-1328.158,1787.224,0,1.084
border#12,tree_pine_a,-1316.752,1956.421,0,1.079
border#12,tree_pine_a,-1363.146,2025.278,0,1.012
border#12,tree_pine_a,-1296.004,2078.8,1,1.144
border#12,tree_pine_b,-1369.576,2128.258,1,0.916
border#12,tree_pine_a,-1224.11,2133.863,1,0.932
border#12,tree_pine_b,-1303.174,2192.484,1,0.913
border#12,tree_pine_snow,-1322.805,2249.56,0,1.141
border#12,tree_pine_snow,-1249.653,2236.386,1,0.915
border#12,tree_pine_a,-1300.221,2297.605,1,0.998
border#12,tree_pine_snow,-1370.849,2332.192,1,1.136
border#12,tree_pine_a,-1267.396,2358.164,1,1.009
border#12,tree_pine_a,-1312.358,2399.908,0,1.11
border#12,tree_pine_snow,-1369.33,2461.058,1,1.107
border#12,tree_pine_snow,-1251.447,2458.263,0,1.011
border#12,tree_pine_snow,-1291.626,2500.821,0,1.131
border#12,tree_pine_snow,-1338.933,2554.56,1,1.068
border#12,tree_pine_b,-1229.214,2560.701,1,1.108
border#13,tree_pine_snow,-1280.426,2572.228,0,1.056
border#13,tree_pine_b,-1177.385,2545.579,1,0.919
border#13,tree_pine_snow,-1054.346,2557.389,0,1.064
border#13,tree_pine_snow,-959.918,2568.243,0,1.008
border#13,tree_pine_a,-844.929,2565.151,0,1.097
border#13,tree_pine_a,-722.523,2573.216,0,1.117
border#13,tree_pine_snow,-217.05,2564.66,1,1.113
border#13,tree_pine_a,-125.681,2563.317,1,1
border#13,tree_pine_a,7.943,2556.567,0,0.921
border#16,tree_pine_snow,-1213.313,2196.479,0,1.056
border#16,tree_pine_a,-1173.858,2250.797,1,0.908
border#16,tree_pine_a,-1219.221,2317.055,0,0.901
border#16,tree_pine_b,-1128.602,2325.303,1,0.956
border#16,tree_pine_snow,-1188.308,2390.434,1,0.934
border#16,tree_pine_snow,-1077.6,2367.205,1,0.902
border#16,tree_pine_snow,-974.61,2366.645,1,0.967
border#16,tree_pine_snow,-1235.708,2461.331,1,1.144
border#16,tree_pine_b,-1149.812,2432.436,1,1.072
border#16,tree_pine_a,-968.526,2438.095,0,0.977
border#16,tree_pine_b,-1211.17,2519.396,0,1.083
border#16,tree_pine_snow,-1090.748,2504.057,0,0.976
border#16,tree_pine_a,-920.881,2524.323,0,1.097
border#17,tree_pine_snow,-749.71,2350.978,1,1.085
border#17,tree_pine_a,-626.912,2351.553,1,0.903
border#17,tree_pine_snow,-806.709,2421.363,1,0.922
border#17,tree_pine_a,-688.898,2408.485,1,1.074
border#17,tree_pine_a,-755.843,2470.815,1,1.052
border#17,tree_pine_b,-657.783,2470.431,0,1.113
extra,tree_pine_a,760,2220,1,1
extra,tree_pine_a,180,2260,1,1
extra,tree_pine_b,-1230,1480,1,1
extra,tree_pine_b,-130,1900,1,1
extra,tree_pine_snow,-60,2060,1,1
region,tree_pine_a,-1170,660,0,0.9
region,tree_pine_snow,-1080,720,0,0.9
region,tree_pine_b,-1200,780,0,0.9
region,tree_pine_snow,-1010,640,0,0.9
region,tree_pine_b,-990,780,0,0.9
```

### 11.5 Locked-zone ghosts (alpha 0.2, tint 0x9FB3CC, depth OUTLINE + 1 + 0.01·y)

| zone | lock icon at | name at | ghost key | x | y | scale |
|---|---|---|---|---|---|---|
| forest | (470, 1236) | (470, 1284) | station_sawmill | 646 | 1221 | 1 |
|  |  |  | tree_pine_a | 442.85 | 1191.16 | 0.85 |
|  |  |  | tree_pine_snow | 451.9 | 1322.42 | 0.85 |
|  |  |  | tree_pine_b | 279.95 | 1227.37 | 0.85 |
|  |  |  | tree_pine_a | 343.3 | 1322.42 | 0.85 |
| farm | (1478, 1290) | (1478, 1338) | crop_wheat_3 | 1265.25 | 1347 | 1 |
|  |  |  | crop_wheat_3 | 1401 | 1347 | 1 |
|  |  |  | crop_wheat_3 | 1401 | 1414.89 | 1 |
|  |  |  | crop_wheat_3 | 1536.75 | 1347 | 1 |
| mine | (430, 1886) | (430, 1934) | station_smelter | 611 | 1882 | 1 |
|  |  |  | rock_ore | 412 | 1954 | 1 |
|  |  |  | rock_ore_b | 330 | 1923 | 1 |
|  |  |  | rock_ore_b | 177 | 1900 | 1 |
|  |  |  | rock_ore | 394 | 2031 | 1 |
| hunt | (1400, 1946) | (1400, 1994) | station_smokehouse | 1391 | 1883 | 1 |
|  |  |  | hay_bale | 1390.95 | 2082.2 | 1 |
|  |  |  | bush_snow | 1155.65 | 1955.47 | 1 |
|  |  |  | bush_snow | 1562.9 | 2023.36 | 1 |

### 11.6 Buildings and entities at start (owned by other specs; position/depth contract here)

| Thing | Key(s) | Position | Anchor | Depth rule | Notes |
|---|---|---|---|---|---|
| Chief hut | chief_lodge | (600, 640) | 0.41606, 0.67235 | y = 640 | Occ, 9 wall circles (§7.5) |
| Fisherman hut | worker_hut ×0.8 | (−760, 490) | 0.39474, 0.65489 | y | Occ, r 64 |
| Grill station | station_grill | (1004, 590) = Z(plaza, −4.5, 4.8) | 0.44403, 0.62719 | y | collider r 190·0.42 = 79.8; not Occ (art 143 px ≤ 190); operator pad (934, 625), in (907, 541), out (1101, 639) |
| Market stage 1 「눈꽃 노점」 | market_s1_back / _front | (1207, 782) = Z(plaza, 2.0, 2.8) | 0.32732, 0.70122 | back y, front y + 1, sign text y + 0.2 | Occ (back); shelf (1314, 835), cash (1216, 900), register (1415, 859), first customer (1107, 798) |
| Fishing deck tier 1 | deck43_t1_back / _front (+ 3 deck43_rod_*) | (1073, 299) | 0.59375, 0.43333 | back y − 90 = 209, front 209.6, rods 209.2 + 0.01k, lines 209.25, fish 209.27 | interior (people on it drawn between back/front) |
| Chief's landing | deck43_landing | (1100, 380) | 0.46111, 0.57258 | GROUND_DECAL + 10 | chief-only land; reel spot (1089, 386); his line graphics depth 379 |
| Player start | — | (1130, 412) | — | y | camera starts on tutorialView (985, 600) |

Hidden at start: bakery43 (1316, 1144), workshop43 (945, 986), trash pad (−45, 585) (its campfire decor (−45, 505) is visible),
food box, piles (fish crate at deck.crate (1000, 440) appears with the first fisherman), sawmill/smelter/smokehouse, all plots,
tower sites.

### 11.7 Roads drawn at start (`WORLD.paths`, S = spine)

| # | spine | polyline (px) |
|---|---|---|
| 1 | S | (990, 1095) → (990, 1150) → (990, 1440) |
| 2 |  | (705, 965) → (772, 1148) |
| 3 |  | (772, 1148) → (786, 1230) → (790, 1300) |
| 4 |  | (990, 1440) → (880, 1390) → (790, 1300) |
| 5 |  | (990, 1440) → (1090, 1390) → (1180, 1320) |
| 6 | S | (990, 1440) → (990, 1700) |
| 7 | S | (990, 1700) → (990, 2040) |
| 8 |  | (990, 2040) → (880, 2000) → (790, 1950) |
| 9 |  | (990, 2040) → (1090, 2010) → (1170, 1980) |
| 10 |  | (990, 2040) → (990, 2240) |
| 11 |  | (990, 2240) → (800, 2330) → (620, 2380) |
| 12 |  | (990, 2240) → (1180, 2330) → (1360, 2380) |
| 13 |  | (990, 2240) → (990, 2560) |
| 14 | S | (600, 830) → (420, 700) |
| 15 | S | (420, 700) → (230, 620) |
| 16 | S | (230, 620) → (-60, 640) |
| 17 |  | (990, 1700) → (560, 1700) |
| 18 |  | (560, 1700) → (300, 1660) |
| 19 |  | (300, 1660) → (-40, 1640) |
| 20 | S | (-60, 640) → (-200, 760) → (-330, 900) |
| 21 | S | (-330, 900) → (-110, 1000) |
| 22 |  | (-330, 900) → (-470, 1190) |
| 23 |  | (-470, 1190) → (-860, 1040) |
| 24 |  | (-470, 1190) → (-520, 1420) → (-560, 1640) |
| 25 |  | (-40, 1640) → (-560, 1640) |
| 26 |  | (-560, 1640) → (-900, 1640) |
| 27 |  | (-560, 1640) → (-400, 1900) → (-420, 2120) |
| 28 |  | (-420, 2120) → (-880, 2110) |

### 11.8 Path decor and decals

Decals (`WORLD.decals`, centred, α 0.95):

| key | x | y | scale | rot° |
|---|---|---|---|---|
| decal_snow_drift_a | 360 | 660 | 1 | 0 |
| decal_snow_drift_b | 1580 | 700 | 1 | 0 |
| decal_snow_drift_a | 760 | 1580 | 1.1 | 0 |
| decal_snow_drift_b | 1220 | 1590 | 1 | 0 |
| decal_snow_drift_a | 1580 | 2420 | 1 | 0 |
| decal_snow_drift_b | 330 | 2440 | 1 | 0 |
| decal_puddle_ice | 1120 | 1520 | 1 | 0 |
| decal_puddle_ice | 640 | 2250 | 0.9 | 0 |
| decal_dirt_patch | 560 | 1720 | 0.9 | 0 |
| decal_dirt_patch | 300 | 2120 | 1 | 0 |
| decal_footprints | 1010 | 1720 | 1 | 0 |
| decal_footprints | 970 | 2100 | 1 | 0 |
| decal_footprints | 760 | 520 | 0.9 | 0 |
| decal_snow_drift_a | -700 | 1200 | 1.1 | 0 |
| decal_snow_drift_b | -1150 | 1450 | 1 | 0 |
| decal_puddle_ice | -980 | 1880 | 1.2 | 0 |
| decal_snow_drift_a | -360 | 2200 | 1 | 0 |
| decal_footprints | -280 | 820 | 0.9 | 0 |
| decal_dirt_patch | -1000 | 980 | 0.9 | 0 |

Path decor stamps (§6.6), CSV `key,x,y,scale,rotRad,alpha` in generation order:

```
key,x,y,scale,rotRad,alpha
decal_snow_drift_b,1025.72,1240,0.4682,0,0.55
decal_snow_drift_a,775.68,1034.96,0.5783,0,0.55
decal_snow_drift_a,948.79,1530,0.4918,0,0.55
decal_snow_drift_b,1026.53,1790,0.5582,0,0.55
decal_snow_drift_a,1031.02,2130,0.5592,0,0.55
decal_snow_drift_a,925.09,2313.22,0.5969,0,0.55
decal_snow_drift_a,703.44,2318.66,0.5916,0,0.55
decal_snow_drift_a,1086.83,2245.82,0.5474,0,0.55
decal_snow_drift_b,1276.99,2317.11,0.5318,0,0.55
decal_snow_drift_b,947.41,2330,0.5633,0,0.55
decal_snow_drift_b,549.6,746.07,0.4522,0,0.55
decal_snow_drift_a,321.21,702.7,0.4976,0,0.55
decal_snow_drift_b,137.68,589.52,0.5727,0,0.55
decal_snow_drift_b,900,1662.75,0.5596,0,0.55
decal_snow_drift_a,476.82,1648.8,0.4485,0,0.55
decal_snow_drift_a,207.66,1697.21,0.6126,0,0.55
decal_snow_drift_b,-101.49,729.89,0.591,0,0.55
decal_snow_drift_b,-230.23,854.74,0.4587,0,0.55
decal_snow_drift_a,-233.96,906.2,0.5422,0,0.55
decal_snow_drift_b,-334.27,997.88,0.4595,0,0.55
decal_snow_drift_b,-539.28,1119.41,0.451,0,0.55
decal_snow_drift_b,-528.73,1269.34,0.4708,0,0.55
decal_snow_drift_b,-570.99,1502.2,0.4422,0,0.55
decal_snow_drift_a,-130,1680.31,0.477,0,0.55
decal_snow_drift_a,-376.54,1605.43,0.4363,0,0.55
decal_snow_drift_b,-650,1681.31,0.5818,0,0.55
decal_snow_drift_b,-541.99,1734.59,0.5779,0,0.55
decal_snow_drift_a,-444.59,1986.32,0.4357,0,0.55
decal_snow_drift_b,-510.89,2159.8,0.509,0,0.55
decal_footprints,1001.99,1210,0.42,4.24865,0.45
decal_footprints,999.75,1379.69,0.42,4.24865,0.45
decal_footprints,732.8,1018.72,0.42,3.89769,0.45
decal_footprints,936.78,1412.09,0.42,-0.03711,0.45
decal_footprints,831.16,1353.98,0.42,-2.81993,0.45
decal_footprints,1046.94,1419.71,0.42,-0.92738,0.45
decal_footprints,1142.8,1360.16,0.42,2.01681,0.45
decal_footprints,993.25,1500,0.42,1.10706,0.45
decal_footprints,999.38,1760,0.42,4.24865,0.45
decal_footprints,994.3,1943.65,0.42,1.10706,0.45
decal_footprints,933.86,2018.81,0.42,-0.11496,0.45
decal_footprints,822.38,1980.17,0.42,0.04336,0.45
decal_footprints,1048.84,2027.33,0.42,-0.75519,0.45
decal_footprints,987.72,2100,0.42,1.10706,0.45
decal_footprints,932.45,2258.67,0.42,2.23548,0.45
decal_footprints,739.55,2336.55,0.42,2.40691,0.45
decal_footprints,1039.61,2275.44,0.42,3.12023,0.45
decal_footprints,1240.63,2335.91,0.42,2.9488,0.45
decal_footprints,981,2300,0.42,4.24865,0.45
decal_footprints,995.04,2519.73,0.42,4.24865,0.45
decal_footprints,554.27,790.84,0.42,-2.97984,0.45
decal_footprints,365.37,675.13,0.42,-0.06521,0.45
decal_footprints,170.4,627.9,0.42,5.75059,0.45
decal_footprints,10.76,641.35,0.42,5.75059,0.45
decal_footprints,930,1689.1,0.42,5.81945,0.45
decal_footprints,729.55,1696.84,0.42,5.81945,0.45
decal_footprints,499.69,1697.43,0.42,-3.45268,0.45
decal_footprints,240.63,1647.54,0.42,-3.54657,0.45
decal_footprints,25.33,1650.95,0.42,-0.40498,0.45
decal_footprints,-101.47,683.81,0.42,5.11082,0.45
decal_footprints,-237.51,807.05,0.42,4.99703,0.45
decal_footprints,-278.27,931.18,0.42,-0.03711,0.45
decal_footprints,-354.21,954.94,0.42,4.69841,0.45
decal_footprints,-433.37,1095.39,0.42,4.69841,0.45
decal_footprints,-529.1,1176.53,0.42,-0.09656,0.45
decal_footprints,-737.92,1089.98,0.42,-0.09656,0.45
decal_footprints,-484.75,1248.2,0.42,4.46271,0.45
decal_footprints,-525.7,1479.95,0.42,4.42851,0.45
decal_footprints,-100,1646.9,0.42,5.81945,0.45
decal_footprints,-322.99,1632.67,0.42,2.67786,0.45
decal_footprints,-620,1650.67,0.42,2.67786,0.45
decal_footprints,-814.4,1631.8,0.42,5.81945,0.45
decal_footprints,-519.94,1685.8,0.42,3.697,0.45
decal_footprints,-425.29,1837.65,0.42,3.697,0.45
decal_footprints,-409.74,1959.36,0.42,4.33931,0.45
decal_footprints,-480.22,2129.58,0.42,-0.442,0.45
decal_footprints,-632.51,2120.45,0.42,-3.58359,0.45
decal_footprints,-822.28,2105.57,0.42,-0.442,0.45
```

### 11.9 Plot table v2 (all rows; none visible at a new game)

| id | x | y | size | region | after | also | only / types | hidden | other |
|---|---|---|---|---|---|---|---|---|---|
| v_house1 | 1600 | 2235 | S | start | hire_miner | — | — | — |  |
| v_house2 | 430 | 2310 | S | start | hire_miner | — | — | — |  |
| h43_1 | 600 | 1040 | S | start | zone_forest | — | house_c | — |  |
| h43_2 | 1560 | 1640 | S | start | zone_forest | — | house_a | — |  |
| d_tool | 60 | 1530 | M | start | r:east | — | toolsmith | — |  |
| d_wh | 475 | 1525 | M | start | hire_hunter | — | warehouse | — |  |
| d_cannery | 1890 | 485 | M | east | boat_rowboat | — | cannery | — | drop (2000, 700); clear [[-200,80,180]] |
| d_store | 1990 | 1070 | M | east | b:cannery | — | store | — | clear [[-250,-40,250],[-250,60,150],[-250,180,200]] |
| e_dock | 2330 | 595 | M | east | — | — | boathouse | — |  |
| e_m1 | 2600 | 830 | M | east | — | — | house_*,deco_* | — | drop (2750, 880) |
| e_m2 | 2520 | 985 | M | east | — | — | house_*,deco_* | — |  |
| s_m1 | 1360 | 2860 | M | south | — | — | house_*,deco_* | — |  |
| s_m2 | 1470 | 3235 | M | south | — | — | house_*,deco_* | — |  |
| s_l1 | 780 | 3220 | L | south | — | — | house_*,deco_* | — |  |
| s_s1 | 1160 | 3190 | S | south | — | — | — | — |  |
| se_m1 | 2700 | 2640 | M | se | — | — | house_*,deco_* | — |  |
| se_l1 | 2060 | 2860 | L | se | — | — | house_*,deco_* | — |  |
| se_s1 | 2560 | 3090 | S | se | — | — | — | — |  |
| se_s3 | 2560 | 1700 | S | se | — | — | — | — |  |
| se_s2 | 2060 | 1820 | S | se | — | — | — | — |  |
| r_station | 3410 | 1330 | XL | rail | — | — | station | — | drop (3200, 1441) |
| w_rest | -600 | 880 | XL | west | tower_east | — | big_restaurant | — | drop (-390, 1000) |
| w_hall | 180 | 760 | XL | start | hire_hunter | — | town_hall | — | drop (-30, 870); clear [[-140,230,220],[-20,200,130]] |
| w_m1 | -250 | 1360 | M | west | zone_hunt | — | house_*,deco_* | — |  |
| w_m2 | -1100 | 1130 | M | west | hire_hunter | — | house_*,deco_* | — |  |
| w_s1 | -170 | 1080 | S | west | hire_miner | — | — | — | drop (-60, 1110) |
| w_s2 | -330 | 1660 | S | west | hire_miner | — | — | — |  |
| w_s3 | -1150 | 1660 | S | west | hire_hunter | — | — | — |  |
| w_s4 | -440 | 2290 | S | west | hire_hunter | — | — | — |  |
| w_s5 | -250 | 2010 | S | west | hire_hunter | — | — | — |  |
| w_civic | -780 | 1880 | XL | west | — | — | civic43 | **yes** | clear [[0,0,250],[0,100,150],[0,220,200],[-150,300,260],[60,300,240]] |
| d_school | -1080 | 2000 | XL | west | — | — | school43 | **yes** |  |
| d_clinic | -1160 | 870 | L | west | — | — | clinic43 | **yes** |  |
| d_labour | -760 | 1440 | L | west | f:rankEup | — | labour_office | **yes** |  |
| v42_office | 600 | 640 | M | start | zone_mine | — | chief_office | — | replace chief_hut; drop (545, 790) |
| v42_bank | -340 | 570 | M | west | f:rankEup | b:chief_office | bank42 | — | drop (-210, 660) |
| v42_depot | 3184 | 3101 | L | rail | f:rankEup | b:warehouse; r:se | depot42 | — |  |

---

## 12. Static vs. dynamic

| Element | Static for the whole game? | What changes it | Owner |
|---|---|---|---|
| Shoreline, land fill, vignette, rim, start roads, path decor, decals | yes | — | this spec |
| Plaza floor | yes | — | this spec |
| Other zone floors, zone roads, zone fences/decor/trees/rocks/wheat, worker huts | appear once | step `zone_forest/farm/mine/hunt` (reveal: floor fade 700 ms, objects pop in 420 ms Back.easeOut staggered 22 ms) | this spec (data) / progression spec |
| Locked outlines | disappear once | same steps | this spec |
| Region decor/trees/rocks/field, region roads, fog walls, camera bounds, walk rects | change per region | watchtower lit (`Territory.reveal`), `openWith`, `townInvite` | this spec (data) / territory spec |
| Border pines with `until` | disappear when that land opens | rail / west_s / town opening | this spec |
| Tents `tent43_*` | fold | first houses h43_1/h43_2 built | life spec |
| Decor removed/moved for the hall / bank | once | w_hall shows or a hall exists; bank built | office spec |
| Chief hut | removed once | office scaffold | office spec |
| Life props with `after` | appear | their step | life spec |
| Choppable trees | hp / regrow | chopping | resources spec |
| Sea, fish, floaters, fog scroll, puffs, campfires, snowfall, lantern twinkle | animate forever | time | this spec |
| Rails, v4 streets, depot lanes (RoadPaint bake hooks) | appear | rail strip open / depot built | later |

---

## 13. Old saves: lay 0/1 vs lay 2

- `world.js` is the only layout: a v4.x save (any `v43.lay` < 2, or none) is drawn on the **same** ground, roads, decor, trees and
  plot table as a new game. What differs is state read from the save: `territory` (open regions → fog, bounds, region objects),
  `progress` steps (unlocked zones), `sites` (buildings by plot id: `{ b, st: plot|foundation|scaffold|done, got, t }`), life
  (tents folded, props shown), market stage, deck tier, etc.
- R43 (`Remap43.remap43`, before sanitize, once): moves toolsmith → d_tool, warehouse → d_wh, cannery → d_cannery,
  store → d_store, town_hall → w_hall, big_restaurant → w_rest (two-phase; a mover whose target is taken stays); refunds the
  pre-B price difference of unfinished hall/office sites (OLD43 → NEW43); sets `progress.flags.s4half` for 읍 villages; the chief
  restarts at `WORLD.v43.oldStart` = **(370, 680)** (hut door area) or `shopFront` **(1250, 1000)** while `v42_office` holds an
  unfinished site; writes `v43 = { lay: 2, refunds43, src }`. A building whose plot is missing after the remap → failure card.
- At load, the hall rule (`removeDecor 'hall'`) and the bank rule run if those buildings exist; the hut appears only if the office
  plot is empty/foundation; region objects/fog/bounds come from `territory`.
- A new game: `v43 = { lay: 2, seen: { letter43: 1, tour43: 1 } }` and nothing to remap.
- For the slice's "old save shows its layout": the engineer needs §6.8 floors for all zones, §6.10 overlays, the region visibility
  predicates in the JSON (`zone`, `region`, `until`, `after` fields) and the plot table. The rail strip's rails/streets (RoadPaint)
  may show as plain snow in the slice (flag it to the designer).

---

## 14. Scope

| In the slice | Later |
|---|---|
| World constants, iso maths, shoreY, JsRng | Living water shader (Shader Graph) + floaters on the swell + water contacts |
| Old sea + fish + shallows + foam + rim | RoadPaint (rail tiles, v4 streets, 읍 cobble, depot lanes) |
| Land fill, vignette, start roads (soft mask), path decor, decals | VillageFlags waving cloth; night lights / DayClock overlay |
| Plaza floor; locked outlines with ghosts | Zone / region reveal cinematics (pan, pop-in, puff bursts) |
| All static props of §11 with exact anchor/flip/depth/collider | Fog reveal animation; tower sites |
| Fog walls (static + scroll + puff wobble) | Choppable tree behaviour (other spec) |
| Camera bounds, walkable rects | Region/zone overlays for every land (needed when loading advanced saves) |
| Snowfall | Culler / tile pool (not needed in Unity) |

---

## 15. Porting risks

1. **Flip pivot** (§7.1): Unity flips around the pivot, Phaser around the frame centre. Without the shift every flipped pine moves
   86–128 px and tents 30 px — the forest and the camp would look visibly different. Also flip-aware x-ray masks.
2. **Trimmed frames**: Phaser anchors are fractions of the untrimmed size; a Unity atlas import that trims must convert pivots
   (§2.3, §11.1) or every sprite shifts by its trim offset.
3. **RNG**: the JS xorshift uses a signed `>> 17` (§7.4.1); a textbook port reshuffles the whole forest and the path decor.
   `Math.round` vs banker's rounding (§2.2). Floating accumulation in the border loops (`y += step*0.55`) must use double, same order.
   Prefer loading `02_world_ground_static.json` for the slice.
4. **Canvas pattern anchoring**: every repeat texture is anchored at world (0, 0) (`ground_road` at scale 0.5, the old sea at y −200).
   Object-space UVs will misalign seams between floors/roads and change the look; use world-space UVs.
5. **Soft edges**: canvas `shadowBlur` = Gaussian σ = blur/2, applied to the UNION of strokes of one pass (the spine is a second
   pass that compounds); per-segment alpha strips would darken crossings. Bake masks (§6.5).
6. **Colour space**: sRGB canvas blending vs Unity Linear (§10).
7. **Depth precision**: Phaser float depths (y + 0.01 … y + 2000, y − 90) must fit int16 orders (§10); ties in Phaser keep creation
   order (stable sort), Unity ties are not stable — give compound objects a SortingGroup.
8. **Visibility predicates**: objects are hidden by zone, by region, AND by `until`; colliders follow visibility. Missing one shows
   east-coast pines over the fog or blocks walking.
9. **Fog puffs** use `Math.random` (not reproducible) — fine visually; do not golden-test them.
10. **Sea look gap**: high/mid presets show the living water; the slice's old sea matches only the 저사양 look. Tell the designer.
11. **Lazy art pages**: some decor/props live on after-title pages (bakery43, market stages); in Phaser they appear when loaded. In
    Unity load them with the scene (Addressables later) — never show placeholder boxes in the sea (FishingDeck draws plain shapes).
12. **Font**: zone names use Pretendard with a heavy stroke; TextMeshPro needs an SDF font with an outline of 8 px at 34 px size.

---

## 16. Acceptance checks (EditMode tests + a screenshot diff)
- `shoreY(0) = 385.77`, `shoreY(2400) = 576.03`, `shoreY(6000) = 2383.85` (±0.01); maxShore 2467.89; seaH 2508.
- `Z('plaza', 2.0, 2.8) = (1207, 782)`; `Z('plaza', −4.5, 4.8) = (1004, 590)`; reserve polygon §3.4.
- The border loop with JsRng(1234) reproduces JSON `trees` src `border#*` exactly (319 pines, first = band 1, §7.4.1);
  visible at a new game 93 + 5 extra + 5 region.
- Fences: 110 pieces, 13 visible, first `fence_post` (1125.75, 551.07).
- Path decor: 77 stamps equal to JSON `pathDecor` (±0.01 px, ±1e-4 rad).
- Camera bounds (−1400, −150, 3460, 3030); walk inner rects §8.1.
- Screenshot at camera centre (985, 600), zoom 1.2 on 720×1280 logical, 저사양 Phaser vs Unity: same tree/decor silhouettes,
  road widths, rim, plaza floor edge; flipped pines at the shifted x.
