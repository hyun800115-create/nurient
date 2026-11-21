# 01 · Core view: coordinates, camera, screen, input, frame governor and graphics presets — Unity port spec

Source: Phaser 3.90 (`lib/phaser.min.js`, `VERSION:"3.90.0"`), game at `/home/user/nurient/frost-village`.
Target: Unity 6.3 LTS, URP 2D renderer, C# 9, Android phone in portrait.
Reader: a C# engineer who does not read JavaScript. Every number below was copied from the code. A file and line
reference is only there for audit. Nothing depends on reading it.

Tags used throughout:
**SLICE** = needed for the vertical slice (go/no-go build). **LATER** = port after the slice. **DROP** = a Phaser
workaround that Unity does not need.

---

## 0. Summary of decisions (read first)

| # | Decision | Why |
|---|---|---|
| D1 | Keep **all gameplay maths in "Phaser px"**: a float 2D space with x to the right and **y down**, the same numbers as `world.js`, `balance.js` and the saves. Convert to Unity space only where a Transform is written or a touch is read. | Every constant (speed 255 px/s, radii, pad sizes, the 1130/412 spawn) and every v4.x save is in this space. Converting everything to metres would put rounding and porting risk in thousands of places. |
| D2 | **1 Unity unit = 64 px** (Sprite import PPU = 64). `unity = (px.x / 64, -px.y / 64)`. | The art is rendered at PPU 64 (CONTRACT §1), so sprites import at their native size. |
| D3 | The camera is **orthographic**, `orthographicSize = (H / 2) / zoomCur / 64`, where `H` is the logical height (1280 to 1600, §2). | Phaser always shows `720 / zoomCur` px of width and `H / zoomCur` px of height. |
| D4 | The HUD and touches use **logical px**: a 720 × H frame with its origin at the top-left. That frame is the Phaser canvas, so the HUD layout code ports one-to-one. | All layout and input constants (joystick radius 78, tap slop 16) are in logical px. |
| D5 | The "render scale k" of Phaser becomes the **URP Render Scale** (world only; the HUD stays at native resolution). | It gives the same GPU fill saving as Phaser. Text comes out sharper than in Phaser. |
| D6 | Frame cap uses `Application.targetFrameRate` (high 60, mid 60, low 30). **This must be set explicitly**, because Unity on Android defaults to 30. | Matches the Phaser behaviour on a 60 Hz phone. |
| D7 | **Pinch zoom keeps the screen centre fixed.** It must not zoom toward the midpoint between the fingers. Wheel zoom and the +/− buttons do the same. | This is how the Phaser game behaves. The designer will compare the two side by side. |
| D8 | Port the Phaser camera clamp exactly, including its quirk: if the view is larger than the bounds, it sticks to the **left/top** edge instead of centring. | Keeps the framing identical. |
| D9 | When rounding to whole pixels, use **`Mathf.Floor(v + 0.5f)`**, never `Math.Round`. JavaScript `Math.round` rounds .5 up; C# `Math.Round` rounds .5 to even. | `world.js` places every object with `Math.round(...)`. A different rounding moves things by 1 px and breaks "same places". |

---

## 1. Coordinate systems

### 1.1 World px (canonical space) — SLICE

* The world is drawn in screen space. x grows to the right and **y grows down**. Units are "world px".
* The world extends over `x ∈ [WORLD.left, WORLD.width] = [-1400, 6144]` and `y ∈ [0, 3450]`. The sea is drawn
  above y = 0, up to about y = −200, and the camera may look up to 150 px above y = 0 (§1.6).
* Draw order on the ground follows the anchor y (`depth = y`; §7).
* Unity mapping (D1/D2):

```csharp
public static class WorldSpace {
    public const float PPU = 64f;
    public static Vector3 ToUnity(float px, float py, float z = 0f) => new Vector3(px / PPU, -py / PPU, z);
    public static Vector2 ToPx(Vector3 u) => new Vector2(u.x * PPU, -u.y * PPU);
    public static int JsRound(double v) => (int)System.Math.Floor(v + 0.5);   // D9
}
```

### 1.2 Iso ground axes (metres on the ground ↔ px) — SLICE

There is **no tile grid** for objects. Objects sit at arbitrary px positions. The 2:1 iso look comes from the art
(camera elevation 30°, yaw 45°). "Metres" are used for local layout, footprints and zone floors.

| Constant | Value | Meaning |
|---|---|---|
| `AX` | `(45.25, 22.63)` px | +1 m along world X → screen down-right |
| `AY` | `(45.25, -22.63)` px | +1 m along world Y → screen up-right |
| `PPU` | `64` | px per metre for an object facing the camera (horizontal) |
| exact values | 45.2548 = 64·cos45°, 22.6274 = 64·cos45°·sin30° | **use the rounded 45.25 / 22.63** so that positions match |

Formulas (source `src/core/Iso.js` 1–68):

```
isoPt(cx, cy, mx, my)   = ( cx + 45.25*mx + 45.25*my ,  cy + 22.63*mx - 22.63*my )
isoInv(dx, dy)          : s = dx / 45.25 ; d = dy / 22.63 ;  mx = (s + d) / 2 ; my = (s - d) / 2
isoRect(cx, cy, w, h)   = 4 corners [left, top, right, bottom] =
                          isoPt(c,-w/2,-h/2), isoPt(c,-w/2,+h/2), isoPt(c,+w/2,+h/2), isoPt(c,+w/2,-h/2)
inIsoRect(px,py,cx,cy,w,h,margin=0) : m = isoInv(px-cx, py-cy);  |m.mx| <= w/2 - margin && |m.my| <= h/2 - margin
gdist(a, b)   = sqrt( (ax-bx)^2 + ((ay-by)*2)^2 )     // "ground distance": y doubled, so 2:1 ellipses become circles
gdist2(a, b)  = (ax-bx)^2 + ((ay-by)*2)^2
```

`gdist` is used **everywhere** for ranges (gather 78, arrive 8, waypoint 30). Never use plain Euclidean distance
where the JS uses `gdist`.

### 1.3 Facing directions — SLICE

```
DIRS8      = [E, SE, S, SW, W, NW, N, NE]            // index 0..7
dirFromVec(vx, vy):  a = atan2(vy * 2, vx);  s = round(a / (PI/4));  s = ((s % 8) + 8) % 8
// vx, vy in world px (y DOWN). +vy = screen down = "S".
rendered direction + flipX per index:
  E→(E,no)  SE→(SE,no)  S→(S,no)  SW→(SE,flip)  W→(E,flip)  NW→(NE,flip)  N→(N,no)  NE→(NE,no)
Character.face(dx, dy): ignore if |dx|+|dy| < 0.001; else dir = dirFromVec(dx, dy)
```

**Risk:** the vector must be in px with y down. If you feed a Unity y-up vector, N and S swap.
`round` here is JS rounding (D9). For exact .5 ties use `Floor(x + 0.5)`.

### 1.4 Layout helpers in `world.js` (how the "plot coordinates" are made) — SLICE

All of these produce world px and round with `JsRound`.

| Helper | Formula | Used for |
|---|---|---|
| `Z(zone, mx, my)` | `[round(c.x + 45.25*(mx+my)), round(c.y + 22.63*(mx-my))]`, where c = zone centre | most village objects |
| `XOFF(m)` / `YOFF(m)` | `[round(45.25*m), round(22.63*m)]` / `[round(45.25*m), round(-22.63*m)]` | station pads |
| `BKL(bx, by)` | `[round(45.25*(bx+by)), round(22.63*(bx-by))]` (relative) | bakery parts |
| `DK(mx, my)` | origin `DECK_C = [1073, 299]` | fishing deck |
| `LD(mx, my)` | origin `LAND_C = [1100, 380]` | chief's landing |
| `HUT` | `[600, 640]` | chief hut |
| `shoreY(x)` | `y = 372 + 16·sin(0.0052x + 0.4) + 7·sin(0.0165x + 1.7) + 3·sin(0.041x + 0.2)`; then if `d = x − 1880 > 0`: `y += d < 220 ? 0.5·d²/(2·220) : 0.5·(d − 110)` | the sea line (land is below it) |
| `L4(i, j)` (LATER, rail/town) | `[round(3120 + 64·(i+j)), round(1315 + 32·(i−j))]` | v4 road lattice (one cell = √2 m = a 128 × 64 px diamond) |
| `px2L4(x, y)` (LATER) | `a = (x−3120)/64; b = (y−1315)/32;  i = (a+b)/2; j = (a−b)/2` | inverse |

Zone centres (`ZONES`, world.js 9–22): plaza (990, 800) 14×14 m; forest (470, 1250) 9×9; farm (1478, 1304) 5×8;
mine (430, 1900) 9×9; hunt (1400, 1960) 8.5×8.5; field2 (520, 2980) 6.6×6.6 (south); quarry (2560, 2060) 6.6×6.6 (se).

**Build plots** (`WORLD.plots`, world.js 649+). Data shape:

```csharp
record PlotRow(string id, float x, float y /* px; or derived */, string size /* "S"|"M"|"L"|"XL" */,
               string region, string after, string only, string[] types, float? shore, bool hidden,
               Dictionary<string,int[]> pads /* px relative to the plot centre */, int[] drop /* px absolute */);
// shore plots: y = JsRound(shoreY(x) + shore)   (world.js 939)
```

Plot footprints are squares in metres: S = 2 m, M = 3 m, L = 4 m. The diamond's screen bounding box is
S 181×91, M 272×136, L 362×181 and XL 525×262 px. Default drop pads relative to the plot are S (2, 64), M (2, 87),
L (2, 110) and XL (−210, 111) (`src/entities/Site.js` 23–27).

Spawn: `WORLD.player = (1130, 412)`. Tutorial framing: `WORLD.tutorialView = (985, 600)`. Onboarding framings:
`register (1215, 760)` and `pad (1320, 800)`.

Grids owned by other specs, listed only so nobody mistakes them for a tile system: collision cell 160 px
(`Collision.js` 6), ground bake tiles 510 world px per 512² slot (`Ground.js` 40–48), road lattice above.

### 1.5 Logical screen px (HUD and touches) — SLICE

A 720-wide × H-tall frame with its origin at the top-left (§2). One logical px on screen equals `1 / zoomCur` world px.

### 1.6 World bounds, regions, camera rect — SLICE

Regions (`WORLD.territory`, world.js 624–636). `rect = [x0, y0, x1, y1]`:

| id | rect | opens |
|---|---|---|
| start | [0, 0, 1800, 2620] | always |
| west | [-1400, 0, 0, 2620] | always (`open: true`) |
| east | [1800, 0, 3000, 1500] | tower_east |
| south | [0, 2620, 1800, 3450] | tower_south |
| se | [1800, 1500, 3000, 3450] | tower_se |
| rail | [3000, 0, 4150, 3450] | with east |
| town | [4150, 0, 6144, 3450] | flag townInvite |
| west_s | [-1400, 2620, 0, 3450] | with south |

Constants (`Territory.js` 13–21): `EDGE_IN = 46` (walkable land stops 46 px before fog), `CAM_PEEK = 260` (the camera
may look 260 px into fog), `SEA_PEEK = 150` (the camera may look 150 px above y = 0), `worldLeft = min(0, WORLD.left) = −1400`.

`bounds(land)` (Territory.js 113–137), recomputed whenever a region opens:

```
x0,y0,x1,y1 = bounding box of all OPEN region rects
hidden = closed regions
if any hidden q with q.x0 >= x1-1 && q.y0 < y1 && q.y1 > y0 : x1 += 260      // fog on the right
if any hidden q with q.y0 >= y1-1 && q.x0 < x1 && q.x1 > x0 : y1 += 260      // fog below
if any hidden q with q.x1 <= x0+1 && q.y0 < y1 && q.y1 > y0 : x0 -= 260      // fog on the left
top = (y0 <= 0) ? (land ? 0 : -150) : y0
return { x: max(-1400, x0), y: top, w: min(6144, x1) - max(-1400, x0), h: min(3450, y1) - top }
camRect  = bounds(false)      // camera bounds
landRect = bounds(true)       // overview framing fallback (same, but top = 0)
```

**New game values:** open = start + west → `camRect = {x:-1400, y:-150, w:3460, h:3030}`,
`landRect = {x:-1400, y:0, w:3460, h:2880}`.

`areaOf(x) = x >= 3000 ? "neighbours" : "village"` (3000 = rail.x0). `areaRect(area, filter)` is the bounding box of
the open regions whose centre x is in that area (and that pass the filter). If none match, it returns
`landRect ?? camRect`.

---

## 2. Logical screen, resize, DPR, safe area (`src/main.js` 14–41, 52–86; `src/core/View.js` 1–25) — SLICE

### 2.1 Phaser behaviour

```
W = 720 ; MIN_H = 1280 ; MAX_H = 1600
logicalHeight(): h = round(720 * innerHeight / max(1, innerWidth)); return clamp(h, 1280, 1600)
updateView():
  H    = logicalHeight()
  cssW = max(1, min(innerWidth, innerHeight * 720 / H))       // CSS width of the fitted canvas
  dpr  = devicePixelRatio || 1
  k    = forceK != 0 ? forceK : round( clamp(cssW*dpr/720, 1, maxK) * 20 ) / 20     // step 0.05
  perCss   = 720 / cssW                                        // logical px per CSS px
  safeTop    = env(safe-area-inset-top)    * perCss
  safeBottom = env(safe-area-inset-bottom) * perCss
canvas = (round(720*k), round(H*k)), scale mode FIT, centred both ways.
maxK = preset (high 2, mid 1.5, low 1);  MAX_RENDER_SCALE = 2;  forceK = 1 after a weak-GPU drop (§5.4)
```

* The canvas aspect is 720:H, so on phones from 9:16 to 9:20 it fills the screen. **Letterbox:** a phone taller
  than 9:20 (for example 21:9) gets bars at the top and bottom. A screen wider than 9:16 (a tablet) gets bars left
  and right. The bar colour is the page background: a vertical gradient from `#e9f0f8` to `#cfdcec`. The game
  camera clears with `#dbe6f2`.
* Resize and orientation change are **debounced by 120 ms**. Then `updateView()` runs. The game size is changed only
  if `|w − round(720k)| > 1` or `|h − round(Hk)| > 2`. After that: refresh, the UI scene re-lays out, and the Game
  camera sets `zoom = zoomCur·k`.
* A pointer position in canvas px becomes logical px through `logical = canvasPx / k`.

### 2.2 Unity implementation

```csharp
public sealed class ViewMetrics {            // recomputed on start and on Screen size / orientation / safeArea change (debounce 0.12 s)
    public float H;                          // logical height 1280..1600
    public float FitW, FitH, OffX, OffY;     // device px of the 720×H frame, letterbox offsets (bottom-left origin)
    public float LogicalPerDevice;           // = 720 / FitW
    public float SafeTop, SafeBottom;        // logical px
    public float K;                          // Phaser-equivalent render scale (for the preset cap and stats only)
    public void Recompute(int sw, int sh, Rect safe, float maxK, float forceK) {
        H = Mathf.Clamp(WorldSpace.JsRound(720.0 * sh / Mathf.Max(1, sw)), 1280, 1600);
        FitW = Mathf.Min(sw, sh * 720f / H);  FitH = FitW * H / 720f;
        OffX = (sw - FitW) * 0.5f;  OffY = (sh - FitH) * 0.5f;
        LogicalPerDevice = 720f / FitW;
        float devPerLogical = FitW / 720f;                       // = cssW*dpr/720 in Phaser terms
        K = forceK > 0 ? forceK : Mathf.Floor(Mathf.Clamp(devPerLogical, 1f, maxK) * 20f + 0.5f) / 20f;
        SafeTop    = (sh - safe.yMax) * LogicalPerDevice;     // the Phaser inset is measured from the viewport edge,
        SafeBottom = safe.yMin * LogicalPerDevice;            // not from the letterboxed canvas edge: same here
    }
    public Vector2 DeviceToLogical(Vector2 d) => new Vector2((d.x - OffX) * LogicalPerDevice, (Screen.height - d.y - OffY) * LogicalPerDevice);
}
```

* World camera: `Camera.rect = (OffX/sw, OffY/sh, FitW/sw, FitH/sh)`. A second camera (depth −1, or a full-screen
  UI image behind everything) draws the letterbox gradient.
* HUD: a root RectTransform of exactly 720 × H logical units, centred in the screen. Use a Canvas Scaler set to
  *Constant Physical*, or a script that scales the root by `1/LogicalPerDevice`. Every HUD position from the Phaser
  code (logical px from the top-left) is then used unchanged.
* Render scale (D5): `urpAsset.renderScale = Mathf.Min(1f, K / devPerLogical)`. Examples:

| Device width (px) | devPerLogical | high (maxK 2) | mid (1.5) | low (1) |
|---|---|---|---|---|
| 720 | 1.0 | k 1 → RS 1 | 1 → 1 | 1 → 1 |
| 1080 | 1.5 | k 1.5 → RS 1 | 1.5 → 1 | 1 → 0.667 |
| 1440 | 2.0 | k 2 → RS 1 | 1.5 → 0.75 | 1 → 0.5 |
| 1600 (tablet, fitted 1440) | 2.0 | 2 → 1 | 1.5 → 0.75 | 1 → 0.5 |

  A device narrower than 720 px gets k = 1 in Phaser, which supersamples. Unity caps RS at 1 (an acceptable deviation).

Logical heights for common screens: 1080×1920 → 1280; 1080×2340 → 1560; 1080×2400 → 1600;
1080×2520 → 1680, clamped to 1600 (bars of 60 device px top and bottom); 1600×2560 → 1152, clamped to 1280
(bars of 80 px left and right).

---

## 3. Camera (`src/scenes/Game.js`) — SLICE except where tagged

### 3.1 State

| Field | Type | Init | Meaning |
|---|---|---|---|
| `camTarget` | Vector2 px | see 3.2 | point the camera follows (eased every frame) |
| `camFocus` | {x, y, untilMs}? | null | temporary pan target (`focusCamera`) |
| `camPan` | Vector2? | null | LATER: 관망 look-around point (camera follows it 1:1) |
| `camGlide` | bool | false | LATER: easing back after a look-around |
| `zoomBase` | float | 1.2 | `BALANCE.camera.zoom` |
| `zoomTarget` | float | saved zoom clamped to [0.6, 1.7], else 1.2 | where the zoom eases to |
| `zoomCur` | float | = zoomTarget | current zoom (no snapping at start) |
| `overview` | bool | false | whole-village view |
| `prevZoom` | float? | — | zoom before the overview |
| `useBounds`, `bounds` | bool, Rect | true, camRect | camera clamp rect |
| `worldView` | Rect px | — | view rect of the **last drawn frame** |

`BALANCE.camera` (balance.js 38–48; validated in balanceCheck.js 154–159):

| key | value | validated range | meaning |
|---|---|---|---|
| zoom | 1.2 | 0.5–3 | default zoom |
| lerp | 0.12 | 0.01–1 | follow smoothing per 16.67 ms |
| revealPanMs | 750 | — | zone reveal pan |
| revealHoldMs | 900 | — | zone reveal hold |
| zoomMin | **0.6** | 0.3–1.5 | player zoom minimum |
| zoomMax | 1.7 | ≥ max(1, zoomMin), ≤ 4 | player zoom maximum |
| zoomStep | 1.25 | 1.02–3 | +/− button factor |
| zoomSmooth | 0.18 | 0.01–1 | zoom easing per 16.67 ms |

> **Note on the zoom range:** the request mentions 0.45–1.7. In the code, the player range (pinch, wheel, buttons,
> saved zoom) is **0.6–1.7**. The only "0.45" is a comment in `Water.js` line 20. The overview zoom (`fitZoom`, 3.5)
> is **not clamped**: it is **0.40** in a new game and about 0.24 once east is open. Port 0.6–1.7 for the player and
> an unclamped fitZoom for the overview.

Visible world size at zoom z is `720/z × H/z` px. Examples: 0.6 → 1200 × 2133–2667; 1.2 → 600 × 1067–1333;
1.7 → 423.5 × 753–941.

### 3.2 Create sequence (Game.js 356–384)

```
bounds = territory.camRect ; useBounds = true
zoomBase = 1.2
zoomTarget = (Settings.zoom is a finite number) ? clamp(Settings.zoom, 0.6, 1.7) : 1.2
zoomCur = zoomTarget ; overview = false
camera bg = #dbe6f2
p0 = player (after unstick)
tv = (tutorial.inTutorial && gdist(p0, (985,600)) < 500) ? (985,600) : null
camTarget = tv ?? (p0.x, p0.y - 20)          // note: -20 here, -30 in the per-frame follow (a 10 px glide at start)
camera follows camTarget with lerp 1, then centres on it immediately (no glide at start)
ground.ensure(view rect around camTarget, all, margin 200)          // ground spec
```

`tutorial.inTutorial` = the step `hire_fisherman` is not done yet (Tutorial.js 58).
**New game check:** spawn (1130, 412), and gdist to (985, 600) is about 403, so the camera starts centred on
**(985, 600)** at zoom 1.2.

### 3.3 Per frame — choosing the focus point and easing camTarget (Game.js 2238–2276)

This runs at the end of the game tick, after zoom easing (3.5). `deltaMs` is the frame delta in ms (smoothed, §5.1),
**not** the 0.05 s-clamped dt.

```
fx = p.x ; fy = p.y - 30
if (tutorial.inTutorial) {                                  // first loop: frame the fish/grill/stall area
    tv = onboard.view ?? (985, 600)                         // onboard.view: register (1215,760) / pad (1320,800) / null
    hw = worldView.w/2 ; hh = worldView.h/2                 // of the LAST drawn frame
    fx = max(p.x - hw + 120, min(p.x + hw - 120, tv.x))
    fy = max(p.y - 30 - hh + 260, min(p.y - 30 + hh - 260, tv.y))
    cp = progress.pads["hire_clerk_market"]
    if (cp != null && cp.active) {
        d = |cp.x - p.x|
        if (d < 360) {
            want = min(p.x + hw - 120, max(fx, cp.x + cp.pad.w/2 + 24 - hw))
            fx += (want - fx) * min(1, (360 - d) / 240)
        }
    }
}
if (camFocus != null) { if (nowMs < camFocus.untilMs) { fx = camFocus.x; fy = camFocus.y; } else camFocus = null; }
if (overview && camFocus == null) { r = overviewRect(); fx = r.x + r.w/2; fy = r.y + r.h/2 - 40; }
k = camFocus != null ? 1 - pow(1 - 0.06, deltaMs/16.67) : 1 - pow(1 - 0.12, deltaMs/16.67)
// LATER (관망) ----------------------------------------------------------------------------
if (camPan != null && !overview)                    { fx = camPan.x; fy = camPan.y; k = 1; camGlide = false; }
else if (camGlide && camFocus == null && !overview) { k = 1 - pow(1 - 0.08, deltaMs/16.67);
                                                      if (|fx-ct.x| < 120 && |fy-ct.y| < 120) camGlide = false; }
else camGlide = false;
// LATER (resident follow): if (resFollow.on || resFollow.back) { k = resFollow.frame(...); if (on) fx,fy = followed resident }
// ----------------------------------------------------------------------------------------
camTarget.x += (fx - camTarget.x) * k ;  camTarget.y += (fy - camTarget.y) * k
```

Priority (highest first): resident follow (LATER) > 관망 look-around (LATER) > overview (when there is no focus) >
camFocus > tutorial framing > chief at (p.x, p.y − 30).

### 3.4 Applying the camera (Phaser's follow and clamp; `Camera.preRender`, `clampX/Y`) — run in `LateUpdate`

```
halfW = 360 / zoomCur                     // world px
halfH = (H / 2) / zoomCur
cx = camTarget.x ; cy = camTarget.y       // follow lerp is 1
if (useBounds) { cx = ClampPhaser(cx, bounds.x, bounds.w, halfW); cy = ClampPhaser(cy, bounds.y, bounds.h, halfH); }
worldView = Rect(cx - halfW, cy - halfH, 2*halfW, 2*halfH)   // Phaser rounds each to int with floor(v+0.5)
camera.orthographicSize = halfH / 64
camera.transform.position = (cx/64, -cy/64, -10) + shakeOffset

float ClampPhaser(float c, float bMin, float bSize, float half) {
    float lo = bMin + half;
    float hi = Mathf.Max(lo, bMin + bSize - half);     // view larger than bounds → hi = lo → sticks LEFT/TOP (D8)
    return c < lo ? lo : (c > hi ? hi : c);
}
```

`roundPixels` is false: the camera position is fractional and sprites use bilinear filtering. **Do not** add a Pixel
Perfect Camera.

Bounds changes: `resetBounds()` sets bounds = camRect and useBounds = true. It runs when leaving the overview, on
`setZoom` while in the overview, and when Territory reapplies (unless overview or a test free camera is active).
`removeBounds()` sets useBounds = false (overview only).

### 3.5 Zoom (Game.js 2305–2364; UI.js 81–83, 148–215)

```
setZoom(z, keepOverview=false):
    if (!keepOverview && overview) { overview = false; resetBounds(); }
    zoomTarget = clamp(z, 0.6, 1.7)
    if (!overview) { Settings.zoom = JsRound(zoomTarget*100)/100; zoomSaveT = 1.2 /* s */ }
    ui.zoomChanged()                                 // the map button turns highlighted/plain
zoomBy(f): setZoom( (overview ? (prevZoom ?? zoomBase) : zoomTarget) * f )
toggleOverview():
    if (overview) { overview = false; resetBounds(); setZoom(prevZoom ?? zoomBase); return; }
    prevZoom = zoomTarget; overview = true; useBounds = false; zoomTarget = fitZoom(); ui.zoomChanged()
fitZoom()      = min( 720 / r.w , H / (r.h + 80) ),  r = overviewRect()
overviewRect():
    if (territory == null) return (0,0,W,H)
    land = landRect ?? camRect ; px = player.x ; area = areaOf(px)
    if (area == "village") { west = px < 0;
        r = areaRect("village", q => ((q.x0 + q.x1)/2 < 0) == west);   // own side of x = 0 only
        if (r != null && r != land) return r; }
    if (!territory.isOpen("rail")) return land
    return areaRect(area)
updateZoom(dt, deltaMs):                           // every tick, before the camera target update
    if (overview) zoomTarget = fitZoom()
    if (|zoomCur - zoomTarget| > 0.0005) {
        k = 1 - pow(1 - 0.18, deltaMs/16.67)
        zoomCur += (zoomTarget - zoomCur) * k
        if (|zoomCur - zoomTarget| < 0.001) zoomCur = zoomTarget
    }
    if (zoomSaveT > 0) { zoomSaveT -= dt; if (zoomSaveT <= 0) Settings.Save(); }
```

Triggers:

| Input | Effect |
|---|---|
| Pinch (2 fingers) | On the second finger down: `pinch = {a, b, d0 = max(20, dist in device px), z0 = overview ? fitZoom() : zoomTarget}`. On every move while both are down: `setZoom(z0 * dist / d0)`. **Zoom is about the screen centre** (D7). |
| Mouse wheel (PC) | One step per wheel event with dy ≠ 0. Ignored while a panel or admin is open. Wheel down (browser dy > 0) → `zoomBy(1/1.12)`. Wheel up → `zoomBy(1.12)`. Unity: `scroll.y < 0` is wheel down. Apply **one step per frame with non-zero scroll**, never proportional to the value. |
| + button | `zoomBy(1.25)` |
| − button | `zoomBy(0.8)` (= 1/1.25) |
| map button | `toggleOverview()` |

New game check: overviewRect = start rect (0, 0, 1800, 2620) → fitZoom = min(720/1800, H/2700) = **0.40**;
centre = (900, 1270).

Zoom buttons HUD layout (UI.js 236–239, 282–297): size 70 logical px. Positions: `x = 720 − 56`;
map at `y = H − 168 − safeBottom`; − at map.y − 84; + at map.y − 160. Icons `ui_icon_zoom_in`, `ui_icon_zoom_out`
and `ui_icon_map`. If an icon is missing, a fallback circle is drawn (white 0.95 fill, `#d7e3f2` 4 px ring). In the
overview the map button's ring is `#ffc83d` and its fill `#ffe9a8`.

LATER (관망, CameraDirector.start/stop): while 관망 runs, the zoom target is raised to at least 0.7 (`pilot.minZoom`).
When 관망 ends, it goes back to the earlier zoom unless the player zoomed meanwhile.

### 3.6 Conversions and view queries

Use these exact formulas. They read the camera's scroll and zoom, not the last drawn frame, unless the name says
otherwise.

```
// world px → HUD logical px   (UI.worldToScreen, UI.js 577–582)
viewX = cx - 360/zoomCur ;  viewY = cy - (H/2)/zoomCur        // cx,cy = clamped camera centre (3.4)
screen = ( (wx - viewX) * zoomCur , (wy - viewY) * zoomCur )
// HUD logical px → world px   (Phaser getWorldPoint; used for taps)
world  = ( viewX + sx / zoomCur , viewY + sy / zoomCur )

viewRect():                            // Game.js 1727–1738: union of where the camera is and where it is going
    w = 720/zoomCur ; h = H/zoomCur ;  c = camTarget
    x = min(worldView.x, c.x - w/2) ; y = min(worldView.y, c.y - h/2)
    right = max(worldView.right, c.x + w/2) ; bottom = max(worldView.bottom, c.y + h/2)
isOnScreen(x, y, m=0)   = x > worldView.x - m && x < worldView.right + m && y > worldView.y - m && y < worldView.bottom + m
isNearView(x, y, m=0)   = isOnScreen(x,y,m) || ( |x - cx| < 360/zoomCur + m && |y - cy| < (H/2)/zoomCur + m )
unseen(x, y)            = !isOnScreen(x, y, 120) && !isOnScreen(x, y - 220, 120)
```

Users of `viewRect`: ground baking (`Ground.js` 881), the navigator line, TownSim, doll LOD (`DollSprite.js` 302)
and memory trim. Most of these are owned by other specs, but they must call this method.

Camera-relative sound (`sfxAt`, Game.js 2005–2018; for the audio spec):

```
dx = (x - cx) * zoomCur / 360 ;  dy = (y - cy) * zoomCur / (H/2)      // −1..1 at the screen edges
d  = hypot(dx, dy) / max(0.5, opts.range ?? 1)
if (!force) { if (d > 2) return;
              f = d <= 0.55 ? 1 : d <= 1.25 ? 1 - ((d - 0.55)/0.7)*0.55 : 0.45 * (1 - (d - 1.25)/0.75);
              if (f < 0.04) return; } else f = 1
volume = (opts.volume ?? 1) * f ;  pan = clamp(dx, -1, 1) * 0.55
```

Ambience listener: the chief, or `camPan` during 관망. Sea level = `clamp(1 − (L.y − 400)/900, 0, 1)` mapped to
volume `0.15 + sea·0.6`, checked every 0.25 s (Game.js 2286–2299).

### 3.7 `focusCamera(x, y, ms, mine=false)` (Game.js 1716–1724) — SLICE (the opening loop uses it)

```
P = pilot ; C = P?.cam
if (camPan != null || (mine && C != null && P.on)) {                    // LATER branch (관망)
    if (rank.ceremonyOn && C != null) C.attach();
    else { if (mine && C != null && (C.free != null || C.detach() != null)) C.glideTo(x, y); return; }
}
camFocus = { x, y, untilMs = nowMs + ms }
```

Callers in the slice: Onboarding (register: `(register.x, register.y − 40, 2200 ms)`; the tour holds with
`ms = 1e9` and is released by `camFocus = null`), Progression first market (`market.x − 40, market.y − 30, 2200`),
zone reveal (`2250 = 750 + 900 + 600 ms`) and Territory reveal (`750 + 2600 ms`). While a focus is active the
lerp is 0.06.

### 3.8 Shake (Effects.js 183) — SLICE (cosmetic)

`shake(ms = 140, intensity = 0.004)`. The zone reveal uses `shake(220, 0.006)`. Phaser applies a fresh random
offset every frame for `ms`: `offset = (rand·2 − 1) · intensity · cameraWidth · zoom`, with Phaser's camera width in
canvas px and zoom = zoomCur·k. **Recommendation:** an offset of
`(rand·2 − 1) · intensity · 720 · zoomCur` logical px, converted to world units through `/zoomCur/64`. That is a few
px; tune it by eye against the web build.

### 3.9 관망 look-around (free pan) and camera cuts — LATER (`src/systems/pilot/CameraDirector.js` 1–239)

관망 (auto-pilot "watch mode") starts by itself after `Settings.observeAfter` seconds without a touch (default 60;
the choices are 0 = off, 30, 60, 120), with a 3 s countdown. It can also be started with the 관망 button. **For the
slice, leave the pilot out** (behave as if observeAfter = 0). Full behaviour for later:

* **Detach:** the first pan delta copies `camTarget` into `free`, clamped. `camPan = free`, so the camera follows it
  1:1. Any cut or camFocus is dropped.
* **Finger pan** (from `Input.pan`, §4): `world delta = −fingerDelta / zoomCur` (the village moves with the finger),
  then `panBy`. Velocity estimate, with `a = min(1, dt·18)` and `s = 1/max(dt, 1/120)`: `v += (delta·s − v)·a`.
  A finger held still decays it with `a = min(1, dt·20)`, `v −= v·a`.
* **Fling** after a real lift (`flick`): cap the speed at `FLING_MAX = 2600` px/s. While speed > `FLING_MIN = 30`:
  `panBy(v·dt)` and `v *= exp(−6·dt)` (`FLING_DECAY = 6`). Below that: stop. A pinch or panel (`Input.Release`)
  clears flick, so there is no glide.
* **Keys while 관망 is on:** move at `900 / zoomCur` px/s (`pilot.panKeys = 900`). This zeroes the fling.
* **Clamp** (note: this centres, unlike 3.4): `hw = 360/zoomCur`, `hh = (H/2)/zoomCur`;
  `x = b.w <= 2hw ? b.x + b.w/2 : clamp(x, b.x + hw, b.x + b.w − hw)`, and the same for y. Re-clamped every frame
  because the zoom may change.
* **glideTo(x, y)** (office "보러 가기"): ease `free` toward the goal with `a = 1 − (1 − 0.08)^(dt·60)`. Snap within
  3 px. Stop if a step moves less than 0.05 px or a finger/key moves.
* **attach()** ("촌장님 보기" chip, or the end of 관망): `free = null`, `camPan = null`, `camGlide = true` (ease back
  with lerp 0.08 until within 120 px).
* **Cuts** (only while attached): one every `cutEvery` 45–90 s (the first after 0.6 × that), held for `cutHold`
  6–8 s. Events must be within 2500 px of the chief; a train cut needs > 900 px. No cut within 20 s of the last, none
  while a panel is open or during a ceremony, and events go stale after 10 s. The cut calls
  `focusCamera(e.x, e.y, hold·1000)`.
* **Overview or ceremony:** no look-around. A ceremony calls attach().

Resident follow (`src/systems/residents/Follow.js` 120–150) — LATER. While on, it overrides the camera target and
its lerp. It stops on any human move, a 관망 pan, the overview, a panel, or a follow target more than 40 px outside camRect.

### 3.10 Unity class sketch

```csharp
public sealed class VillageCamera : MonoBehaviour {
    public Camera Cam; public ViewMetrics View;
    public Vector2 CamTarget; public FocusReq? CamFocus; public Vector2? CamPan; public bool CamGlide;
    public float ZoomBase = 1.2f, ZoomTarget, ZoomCur; public bool Overview; public float? PrevZoom;
    public bool UseBounds = true; public Rect Bounds;            // px, y-down (x, y = top-left)
    public Rect WorldView { get; private set; }
    public void TickZoom(float dt, float deltaMs) { /* 3.5 updateZoom */ }
    public void TickTarget(float deltaMs, double nowMs) { /* 3.3 */ }
    void LateUpdate() { /* 3.4 */ }
    public Vector2 WorldToLogical(Vector2 w) { /* 3.6 */ }  public Vector2 LogicalToWorld(Vector2 s) { /* 3.6 */ }
    public RectPx ViewRect() { /* 3.6 */ }
    public void FocusCamera(float x, float y, float ms, bool mine = false) { /* 3.7 */ }
    public void SetZoom(float z, bool keepOverview = false) {...} public void ZoomBy(float f) {...} public void ToggleOverview() {...}
}
```

The game tick calls `TickZoom` and then `TickTarget` as its last steps. `LateUpdate` writes the Transform. Nothing
else may move the camera Transform directly.

---

## 4. Input: joystick, keys, pinch, tap, tap-to-walk

### 4.1 Constants (`src/core/Input.js` 9–11)

| Name | Value | Unit |
|---|---|---|
| `JOY_RADIUS` | 78 | logical px knob travel |
| dead zone | 8 | logical px from the base: no move below |
| full-speed distance | 0.75 × 78 = 58.5 | logical px |
| `HAND_MS` | 110 | ms a finger rests before "human touched" fires (LATER, pilot) |
| `PAN_SLOP` | 16 | logical px before a 관망 finger pans (LATER) |
| tap max time | 300 | ms |
| tap max move | 16 | logical px (`16·k` canvas px) |
| pinch min base distance | 20 | device px (`max(20, d)`) |
| "moving" threshold used everywhere | `vec.mag > 0.05` | — |
| active touch pointers | 3 (+ the mouse as pointer id 0) | — |

### 4.2 Input state (data shape)

```csharp
public sealed class InputState {
    public Vector2 Vec; public float Mag;                       // output, read by the Player each tick (screen axes: +y = down)
    public struct Joy { public bool Active; public int Id; public float Bx, By, Kx, Ky; }   // base + knob, logical px
    public Joy J;
    public struct Pan { public bool Active, Moved, Flick; public int Id; public float X0, Y0, Lx, Ly, Dx, Dy; } // LATER
    public Pan P; public Vector2 PanKeys;                       // LATER
    public Vector2? Override;                                   // test hook
    public Func<Vector2?> Pilot;                                // GoalWalk (SLICE) wraps this slot; ChiefPilot (LATER)
    public Action<string> OnHuman; public Func<bool> Watch;     // LATER (관망)
    public double LastTouchMs, LastActivityMs;                  // read by onboarding/tutorial idle hints, the pilot, resident follow
    bool touchPending, handReq; double handAt;
    public VecSource Source;                                    // NEW in Unity: None|Human|Pilot|Override (replaces GoalWalk's servedTick trick)
}
```

`Input.enabled` exists in the JS but nothing ever sets it to false. It can be dropped.

### 4.3 Pointer routing (UI scene; UI.js 148–215) — SLICE

Phaser delivers DOM events between frames. In Unity, process `EnhancedTouch` (and the mouse) at the start of the
frame, before the game tick, in this order: downs, moves, ups.

> **SUPERSEDED in two points by 00 §6:** (1) events are fed in **time order** (timestamp sort; Ended before Began for a
> reused `touchId`), not downs-then-moves-then-ups; (2) "over UI" uses our own `EventSystem.RaycastAll` hit test
> (`UiHitTester`), not `EventSystem.IsPointerOverGameObject(p.id)`, whose pointer ids do not match `touchId` under
> `InputSystemUIInputModule`. Pinch cannot be tested in Unity's Device Simulator (no multi-touch).

```
OnPointerDown(p):                                   // p.id, p.pos in DEVICE px; convert with View.DeviceToLogical when needed
    Audio.Resume(); input.touchPending = true        // any touch, even on a HUD button, restarts the idle clocks
    overUI = EventSystem.IsPointerOverGameObject(p.id) && !(the hit is a dog-bar button or the onboarding "skip" chip)
    if (ui.panelOpen || ui.adminOpen || ui.buildOpen || ui.v4PanelOpen || ui.v42PanelOpen || overUI) return
    if (!onDogBarOrSkip) taps[p.id] = (p.pos, nowMs)
    other = any OTHER touch currently down (exclude the mouse id 0)
    if (other != null && pinch == null) {            // second finger → pinch
        input.Release()
        pinch = { a = other.id, b = p.id, d0 = max(20, |p.pos - other.pos|), z0 = cam.Overview ? cam.FitZoom() : cam.ZoomTarget }
        taps.Remove(p.id); taps.Remove(other.id); return
    }
    if (pinch != null) return                        // third finger: ignored
    input.PointerDown(p)                             // 4.4

OnPointerMove(p):
    if (pinch != null) { a,b = touches pinch.a/b; if (both down) cam.SetZoom(pinch.z0 * |a - b| / pinch.d0); return; }
    input.PointerMove(p)

OnPointerUp(p):                                      // also for "up outside"
    DogBarRelease(p)                                 // HUD spec
    tp = taps[p.id]; taps.Remove(p.id)
    if (tp != null && pinch == null && !ui.panelOpen && nowMs - tp.t < 300 && |p.pos - tp.pos| < 16 logical px && life != null)
        { w = cam.LogicalToWorld(logical(p.pos)); life.Tap(w.x, w.y) }      // tap a resident / pet → reacts / chat (residents spec)
    if (pinch != null) {
        if (p.id == pinch.a || p.id == pinch.b) {
            still = any other touch down
            if (!still) pinch = null; else pinch.ending = true   // the remaining finger does NOT become a joystick until lifted
        }
        if (pinch != null && pinch.ending && no touch down) pinch = null
        input.Release(); return
    }
    mine = (J.Active && p.id == J.Id) || (P.Active && p.id == P.Id)
    input.PointerUp(p)
    if (!mine || ui.panelOpen) return
    other = another touch still down
    if (other != null) input.PointerDown(other)      // hand the joystick to that finger: its base starts where it is now

OnFocusLost / pointer leaves the game window: input.Release(); pinch = null
OnApplicationPause(true): Save(true); input.Release()      // Game.js 396
Wheel: 3.5
```

A tap also starts a joystick for a moment. That is harmless, because the dead zone of 8 px gives `vec = 0` unless
the finger moves.

### 4.4 Joystick maths (Input.js 42–100) — SLICE

```
PointerDown(p):
    if (J.Active || P.Active) return
    touchPending = true ; (x, y) = logical(p)
    if (Watching()) { P = {Active, Id=p.id, X0=Lx=x, Y0=Ly=y, Moved=false, Flick=false}; return }    // LATER
    handReq = OnHuman != null                                                                          // LATER
    J = { Active=true, Id=p.id, Bx=x, By=y, Kx=x, Ky=y }
PointerMove(p):
    if (P.Active) { if (p.id != P.Id) return; (x,y) = logical(p);                                     // LATER
        if (!P.Moved && hypot(x-P.X0, y-P.Y0) > 16) { P.Moved = true; P.Lx = P.X0; P.Ly = P.Y0; }
        if (P.Moved) { P.Dx += x-P.Lx; P.Dy += y-P.Ly; P.Lx = x; P.Ly = y; } return; }
    if (!J.Active || p.id != J.Id) return
    (px, py) = logical(p) ; dx = px - J.Bx ; dy = py - J.By ; d = hypot(dx, dy)
    if (d > 78) { over = d - 78; J.Bx += dx/d*over; J.By += dy/d*over; }     // floating base is dragged along
    J.Kx = px ; J.Ky = py
PointerUp(p):
    if (P.Active) { if (p.id != P.Id) return; P.Flick = P.Moved; P.Active = false; P.Id = -1; P.Moved = false; return; }
    if (!J.Active || p.id != J.Id) return
    J.Active = false ; J.Id = -1
Release():           // second finger, panels opening, app pause, goal walk start, …
    J.Active = false; J.Id = -1; handAt = 0; handReq = false
    P = { Active=false, Id=-1, Moved=false, Dx=0, Dy=0, Flick=false }
```

### 4.5 `Input.Update(nowMs)` — the first call of every game tick (Input.js 102–139)

```
x = y = 0
if (touchPending) { touchPending = false; LastTouchMs = nowMs; }
watching = Override == null && Watching()                     // LATER: false in the slice
PanKeys = (0,0)
if (Override != null) { (x, y) = Override; Source = Override }
else {
    if (J.Active && !watching) {
        dx = J.Kx - J.Bx; dy = J.Ky - J.By; d = hypot(dx, dy)
        if (d > 8) { m = min(1, d / 58.5); x = dx/d*m; y = dy/d*m; }
    }
    keys: kx = (A or ←) ? -1 : 0  + (D or →) ? +1 : 0 ;  ky = (W or ↑) ? -1 : 0 + (S or ↓) ? +1 : 0
    if (kx != 0 || ky != 0) { d = hypot(kx, ky);
        if (watching) { PanKeys = (kx/d, ky/d); LastActivityMs = nowMs; }     // LATER
        else { x = kx/d; y = ky/d; } }                                       // keys REPLACE the joystick vector
}
mag = min(1, hypot(x, y))
if (watching) { handReq = false; handAt = 0; }
if (handReq) { handReq = false; handAt = nowMs != 0 ? nowMs : 1; }
if (handAt != 0 && (mag > 0.05 || nowMs - handAt >= 110)) { handAt = 0; OnHuman?.Invoke("touch"); }
if (mag > 0.05) { LastActivityMs = nowMs; Source = Human; if (Override == null) OnHuman?.Invoke("move"); }
else if (Pilot != null && Override == null && handAt == 0) { v = Pilot(); if (v != null) { (x, y) = v; mag = min(1, hypot(x, y)); Source = Pilot; } }
Vec = (x, y); Mag = mag
```

Priority: test override > human (joystick or keys) > pilot (goal walk, 관망).

Keyboard in Unity: W/A/S/D and the arrow keys. Keep Space from scrolling the page (DROP; there is no page in Unity).

### 4.6 Joystick visuals (UI.js 105–109, 1363–1369) — SLICE

* Base sprite `ui_joystick_base`: displayed diameter `78 × 2.2 = 171.6` logical px, alpha 0.9, centred at (Bx, By).
* Knob sprite `ui_joystick_knob`: diameter 84 logical px, at `B + dir · min(d, 78)` (clamped to the radius).
* Shown only while `J.Active && !panelOpen && !adminOpen`. They are HUD elements updated after the game tick (the
  UI scene updates after the Game scene). The joystick never shows during 관망.

### 4.7 Chief movement from the vector (`src/entities/Player.js` 66–125) — SLICE (shared with the characters spec)

```
speed = 255 * speedMult           // speedMult = upgrades.speed.values[level] = [1.0, 1.15, 1.3, 1.45, 1.6]
if (seated) { if (Mag > 0.05) StandUp(); else … }                    // y += standDy (default 18)
if (Mag > 0.05) {
    a = min(1, dt * 16)                                               // quick acceleration
    vx += (Vec.x * speed        - vx) * a
    vy += (Vec.y * speed * 0.74 - vy) * a                             // verticalFactor 0.74: up/down is slower on screen
    animTimeScale = clamp(hypot(vx, vy) / 210, 0.6, 1.35)
    next = (x + vx*dt, y + vy*dt);  collision.Resolve(ref next, radius 16, chief: true);  (x, y) = next
    face(vx, vy) (§1.3); walk/run anim
    stepT -= dt * (0.6 + Mag*0.6); if (stepT <= 0) { stepT = 0.27; dust burst at (x ± 5, y − 2); sfx_step_snow vol 0.32 rate 0.9–1.1 throttle 120 ms }
} else { vx = vy = 0; animTimeScale = 1; stillT += dt; … auto-gather after 0.08 s within gdist 78 (gameplay spec) }
```

### 4.8 Tap-to-walk = "자동 이동" (`src/systems/goals/GoalWalk.js` 1–264; `src/scenes/GoalPanel.js` 127–145, 315–326) — SLICE (see open question Q1)

**What the Phaser game calls tap-to-walk:** the player taps a row in the **목표 창** (goal window). The window opens
from the goal button or from a tap on the objective panel; the panel tap only counts if the touch began on the panel
and moved ≤ 36 px. The chief then **walks** there by himself (never a teleport), and any touch on the controls takes
him back. **Tapping the ground does not walk** in Phaser: a ground tap goes to residents and pets (4.3). A test hook
`goTo(x, y)` walks to any point, and the Unity port should expose the same `WalkTo(Vector2 px)`.

Constants:

| Name | Value |
|---|---|
| `ARRIVE` | 8 (gdist px) |
| already-there check | gdist ≤ 16 → toast "이미 …에 있어요" (g_already) |
| `HOLD_S` | 0.12 s: a finger held on the village this long cancels |
| `DETOUR_S` | 2.5 s without progress → `roads.detour` (max 2 per walk) |
| `SIDE_S` | 1.6 s without progress → side-step for 0.6 s |
| `DROP_S` | 7 s without progress → give up ("길이 막혔어요", g_stuck) |
| waypoint reached | gdist < 30 (not for the last one) |
| progress | the gdist to the current waypoint must fall by more than 4 px |
| slow-down on the last leg | `k = clamp(d / 110, 0.22, 1)`, d = Euclidean px |
| on-pad arrival | last leg, stuck > 0.6 s and standing inside the target pad → arrived |

```
Go(row):                                           // returns (ok, why); always toasts
    if (!Available) → "g_tutorial"                 // Available = player exists && !tutorial.inTutorial && onboard.mode ∉ {act1, act2, tour}
    if (row.place == null) → noplot / passive / locked / noWay toasts
    if (place not finite || collision.OffLand(place, chief: true)) → "g_noWay"
    if (cam.Overview || rank.ceremonyOn) → "g_busy"
    if (gdist(player, place) <= 16) → "g_already"
    if (pilot.on) pilot.Stop("goal")  (toast g_walkObs instead of g_walk);  pilot.countdown = 0      // LATER part
    target = { x, y, name, icon, id, ref, pad }
    Plan(); on = true; reset timers; input.Release(); if (player.seated) player.StandUp()
    navigator.Pin(target, quiet, goal) (navigator spec, LATER for the slice); toast "g_walk"
Plan():
    route = roads.Route(p, T, near: 220)  (nav spec; slice fallback: [T])
    // land door legs: if T is inside a "land" (the chief's landing) with a door ≠ the player's land: insert the door before T;
    // if the player is inside a land with a door ≠ T's land: prepend that door
    ensure route ends exactly at T ; ri = 0
Update(dt):                                        // called once per tick from v42.update (after Player.update → one-frame lag, as in Phaser)
    if (!on) return
    if (Human(dt)) Stop("human")                   // toast "g_cancel"
    else if (pilot.on) Stop("pilot", quiet)
    else if (!Available || player == null) Stop("gone", quiet)
    else if (target.ref is done/inactive) Stop("gone")     // toast "g_gone"
    else if (Held()) { vec = 0; holdT = 0; input.LastActivityMs = now }   // panel/build menu/ceremony: he waits
    else { Steer(dt); input.LastActivityMs = now }
Human(dt): (Override != null && |o.x|+|o.y| > 0.05) || (Mag > 0.05 && Source == Human) || (J.Active && (holdT += dt) >= 0.12)  [else holdT = 0]
Steer(dt):
    if (gdist(p, T) <= 8) { Stop("arrived"); return; }
    advance ri while ri < last && gdist(p, R[ri]) < 30
    d = |R[ri] - p| (Euclidean) ; dir = (R[ri] - p) / d
    gw = gdist(p, R[ri]); if (new waypoint) { best = gw; stuckT = min(stuckT, 1) } else if (gw < best - 4) { best = gw; stuckT = 0 } else stuckT += dt
    if (stuckT > 2.5 && detours < 2) { detours++; way = roads.Detour(p, T, radius); if (way) { R = way + T; ri = 0; stuckT = 0; return; } }
    if (lastLeg && stuckT > 0.6 && T.pad?.Contains(p)) { Stop("arrived"); return; }
    if (stuckT > 7) { Stop("stuck"); return; }
    if (stuckT > 1.6 || sideT > 0) { if (sideT <= 0) sideT = 0.6; sideT -= dt; s = (detours odd) ? 1 : -1; dir = (-dir.y*s, dir.x*s); }
    i = (dir.x, dir.y / 0.74) normalised                   // compensate verticalFactor so he walks straight at it
    k = lastLeg ? clamp(d/110, 0.22, 1) : 1
    vec = i * k                                            // served to Input through the Pilot slot
Stop(why, quiet): on = false; vec = 0; stats; toasts: arrived "g_arrived" 2.2 s, stuck "g_stuck" 3.2 s, human "g_cancel" 2.2 s, gone "g_gone" 2.4 s
```

While walking, pads must not take coins (`pilot.blocksPay` is wrapped to return true). On arrival, standing on a pay
pad works normally. The walk is not saved.

### 4.9 Who reads the activity clocks (keep the fields)

`LastTouchMs` and `LastActivityMs` are read by Onboarding (idle hints: `idle = (now − max(lastActivity, lastTouch, stepAt))/1000`),
Tutorial (`still`), ChiefPilot (auto start, LATER) and Follow (LATER). `J.Active` and `Mag > 0.05` are read by
Onboarding (`touched`, `pushing`, `drag`), Rank and EupTaste (LATER).

---

## 5. Frame loop and fps governor (`src/main.js` 55–137; `src/core/Perf.js` 241–330)

### 5.1 Phaser loop facts

| Item | Value |
|---|---|
| `fps.target` | 60 |
| `fps.limit` | 30 on the low preset, else 0 (no cap) |
| delta smoothing | `delta` = mean of the last 10 frame deltas. Each raw delta above 200 ms (`1000/minFps 5`) is replaced by the history value, capped at 200. For a few frames after focus comes back (and while unfocused) each delta is capped at 16.67 ms |
| game step dt | `dt = min(0.05, delta/1000)` s (Game.js 2171) |
| lerps | use `deltaMs/16.67` as the exponent (frame-rate independent) |
| `actualFps` | updated once a second: `actualFps = 0.25·framesThisSecond + 0.75·actualFps` (starts at 60). **With an fps cap it counts the display's refresh ticks, not the capped frames.** |
| scene order | Boot, Preload, Title, Game, UI: Game updates before UI every frame |
| 관리자 ×2/×4 (LATER) | the tick runs `min(4, floor(simSpeed))` times per frame |

Unity: run one `GameLoop.Update()` that computes `deltaMs` with the same 10-sample smoothing, `dt = min(0.05, deltaMs/1000)`,
then calls `Tick(dt, deltaMs, nowMs)`. Keep `Time.timeScale = 1`.

### 5.2 Tick order (the parts this spec owns or depends on; Game.js 2170–2303)

1. `Input.Update(nowMs)` → `vec`
2. ground.Update(dt); roads.NewFrame(dt); water; voices; Residency.Tick (other specs)
3. `Player.Update(dt, vec)`
4. pads / progression / labour / stations / market / sites / workers / residents / dog / civic / v4 / **v42 (contains GoalWalk.Update)** / lazy gates
5. tutorial.Update; onboard.Update (they may set `onboard.view` and `camFocus`); flags
6. occlusion.Update (see-through buildings; render spec)
7. **`cam.TickZoom(dt, deltaMs)`**
8. **`cam.TickTarget(deltaMs, nowMs)`**
9. ambient snow emitter (every `0.09 / max(0.05, preset.snow)` s, at a random x in worldView and y in [view.y − 20, view.y − 20 + 0.6·view.h])
10. ambience by location (every 0.25 s); autosave timer
11. (UI scene) HUD update incl. joystick visuals
12. `LateUpdate`: camera transform (3.4). Phaser's view culling runs here (DROP: Unity culls renderers by itself).

### 5.3 High-refresh cap (main.js 121–132)

Four seconds after boot: if the loop has **no** cap and `actualFps > 100`, set the cap to `Perf.hiRefreshCap()`,
which is `preset.fps || 80` (high 80, mid 60) and remembers `hiRefresh = true`. Effect in Phaser: 120/144 Hz →
about 60 fps (the rAF ticks are thinned out); 90 Hz → left alone (90 fps); 60 Hz → 60. `applyFps()` on a preset change:
`fps == 30 → cap 30`; else if the cap was 30 → `hiRefresh ? (fps || 80) : none`; else if hiRefresh → `fps || 80`.

**Unity mapping (D6):**

```
QualitySettings.vSyncCount = 0;
int refresh = (int)Math.Round(Screen.currentResolution.refreshRateRatio.value);
Application.targetFrameRate = preset.fps == 30 ? 30
                            : (preset == High && refresh >= 85 && refresh < 100) ? 90     // match Phaser's untouched 90 Hz
                            : 60;
Player Settings → Android → Optimized Frame Pacing = on.
```

### 5.4 Weak-GPU fallbacks

**A. Preset auto step-down (Perf.watch)** — runs while `Perf.Watching()`: setting = auto, not yet stepped this
session, preset ≠ low, and (Phaser only) no test driver.

```
every 1000 ms:
    if (!Watching()) stop
    if (loop not running || app not visible || Game scene not active) { buf.Clear(); return }
    if (ui.panelOpen || simSpeed > 1 || water watchdog busy (waterBudget.t > 0) || loader busy) { buf.Clear(); return }
    if (++warm < 8) return                     // first 7 s skipped (warm counter is NOT reset by the clears)
    buf.Add(actualFps); if (buf.Count > 6) buf.RemoveAt(0)
    if (++t > 60) stop                         // only the first minute
    if (buf.Count < 6) return
    med = sorted(buf)[3]                       // upper median of 6
    floor = preset == High ? 38 : 28
    if (med < floor) { StepDown("fps"); stop }
```

**B. Render-scale drop (main.js 96–119)** — used only when A is **not** in charge (manual preset, already stepped,
or low):

```
every 3000 ms:
    if (Perf.Watching()) stop
    if (loop not running || hidden || neither Game nor Title active) return
    if (Game active && water watchdog busy) return
    if (Title active) { if (++titleChecks >= 2 && k > 1.05 && actualFps < 30) titleSlow = true; return }
    if (titleSlow) { SlowDrop(); stop }
    if (++perfChecks < 2) return
    if (k > 1.05 && actualFps < 30) { SlowDrop(); stop }
    if (perfChecks >= 5) stop
SlowDrop(): if (!Perf.StepDown("fps")) { View.forceK = 1; OnResize(); }   // render scale 1 for this session
```

Unity: compute your own `actualFps` from **real rendered frames** with the same 0.25/0.75 formula (the Phaser value
counts display ticks when capped; see risk R7). Port A and B as a coroutine. The thresholds (38/28 median, < 30) were
tuned for the WebView build. Re-tune them on the slice's test phones before trusting them.

---

## 6. Graphics presets (`src/core/Perf.js` 21–298) — SLICE (table, pick, render scale, fps, MSAA); rest LATER

### 6.1 Preset table (copy verbatim)

| knob | high (고사양) | mid (중사양) | low (저사양) | consumer → Unity equivalent | slice? |
|---|---|---|---|---|---|
| `maxK` | 2 | 1.5 | 1 | render scale cap → URP renderScale (§2.2) | SLICE |
| `fps` | 0 (no cap; 80 on ≥ 100 Hz) | 60 | 30 | frame cap → `targetFrameRate` (§5.3) | SLICE |
| `aa` | true | true | false | WebGL MSAA → URP `msaaSampleCount` 4 / 4 / 1 | SLICE |
| `water` | 'auto' | 'low' | 'static' | sea shader quality (water spec) | water spec |
| `snow` | 1 | 0.6 | 0.3 | ambient snow rate ×; interval `0.09/max(0.05, snow)` s | SLICE (cheap) |
| `fx` | 1 | 0.7 | 0.5 | particle burst size × (at least 1) | LATER |
| `glows` | 40 | 20 | 8 | night lamp glows drawn at most | LATER |
| `rigs` | 32 | 20 | 10 | townsfolk full doll rigs cap | LATER |
| `lite` | 40 | 30 | 20 | one-picture doll cap | LATER |
| `cullEvery` | 1 | 2 | 3 | Phaser view-cull pass rate | DROP |
| `bake` | 2 | 1 | 1 | ground tiles baked per 0.12 s check | ground spec / DROP if pre-baked |
| `groundLow` | false | false | true | half-resolution ground tiles | ground spec |
| `texScale` | 1 | 0.75 | 0.5 | big atlas pages uploaded at this scale (display size unchanged) → `QualitySettings.globalTextureMipmapLimit` 0 / 0 (or 1) / 1; there is no 0.75 in Unity (R10) | LATER |
| `tex` | null | {socialPages 3, socialTtl 18, targetMiB 280} | {socialPages 2, socialTtl 12, targetMiB 200, lowMiB 150} | texture budget (Residency) → Addressables budget | LATER |
| `near` / `far` | 800 / 1200 | 700 / 1050 | 600 / 900 | px between the view and an area to load / unload its building pages | LATER |

Labels: 자동 / 고사양 / 중사양 / 저사양 (en: Auto / High / Medium / Low). The setting cycles 자동 → 고사양 → 중사양 → 저사양 → 자동.

### 6.2 Automatic pick (`pickPreset`, Perf.js 95–113)

```
input d: ram (MB, total), dm (browser deviceMemory GB; 0 in Unity), cores, sdk (Android SDK int), android (major version),
         webgl (bool), maxTex, weak (GPU on the weak list), lowRam (ActivityManager.isLowRamDevice)
if (d.lowRam || (ram && ram < 2600) || (sdk && sdk <= 25) || (!sdk && android && android <= 7)) return LOW
if (d.webgl == false || (maxTex && maxTex < 4096)) return LOW
if (weak && ram && ram < 3300) return LOW
if (!ram && dm && dm <= 2) return LOW
if ((ram && ram < 4500) || (!ram && dm && dm <= 4) || weak || (cores && cores <= 4) || (sdk && sdk <= 28) || (!sdk && android && android <= 9)) return MID
return HIGH
weakGpu(renderer):
    m = /Mali-G(\d+)\s*M[PC](\d+)/i ; if (m && m1 < 70 && m2 <= 3) return true
    return /Mali-(4\d\d|T[678]\d\d)|Adreno.*\b([345]\d\d|6[01]\d)\b|PowerVR.*(GE8\d{3}|Rogue)|SwiftShader|llvmpipe|Software/i
```

Unity device facts: `ram = SystemInfo.systemMemorySize`; `cores = SystemInfo.processorCount`;
`renderer = SystemInfo.graphicsDeviceName` (first 80 chars); `maxTex = SystemInfo.maxTextureSize`;
`webgl = true` (it means "GPU available"); `sdk` from `android.os.Build.VERSION.SDK_INT` (AndroidJavaClass);
`lowRam` from `ActivityManager.isLowRamDevice()`. The Phaser RAM thresholds came from `ActivityManager.MemoryInfo.totalMem`.
Read that same value through JNI rather than `systemMemorySize` if possible (R17). Unity's minimum Android version
will probably exclude SDK ≤ 25 anyway.

Signature for "same phone" (re-pick when a village moves to another phone):
`sig = join("|", dm, cores, maxTex, weak?1:0, sdk, round(ram/512), lowRam?1:0, webgl==false?0:1)`.

### 6.3 Lifecycle

```
Start()  (before the first scene; main.js 44):
    Settings.Load()
    setting = Settings.gfx ∈ {auto, high, mid, low} ? Settings.gfx : auto
    name = Resolve()
    if (setting == auto && device.lastExit == "oom") Lower("oom", quiet)          // Unity: see R18
    p = PRESETS[name]; boot = {name, aa, texScale, water}; View.maxK = p.maxK
    if (Settings.perfInfo) Overlay(true)
Resolve():
    if (setting != auto) { reason = "manual"; return setting }
    sig = Sig(device)
    if (Settings.gfxAuto ∈ ORDER && Settings.gfxDev == sig) { reason = Settings.gfxWhy ?? "device"; return Settings.gfxAuto }
    p = PickPreset(device); Settings.gfxAuto = p; Settings.gfxDev = sig; Settings.gfxWhy = "device"; Settings.Save(); return p
Lower(why, quiet):  if (setting != auto || name == low) return false
    nx = next in [high, mid, low]; Settings.gfxAuto = nx; Settings.gfxWhy = why; Settings.gfxDev ??= Sig(device); Save
    name = nx; p = PRESETS[nx]; reason = why; if (!quiet) ApplyLive(); return true
StepDown(why):  if (stepped || setting != auto || name == low) return false
    stepped = true; ok = Lower(why); if (ok) toast("휴대폰에 맞게 그래픽을 {p}(으)로 낮췄어요", 3.5 s); return ok
Set(setting):  Settings.gfx = setting; Save; name = Resolve(); p = PRESETS[name]; ApplyLive(); return NeedsReload()
NeedsReload(): boot.aa != p.aa || boot.texScale != p.texScale || (boot.water == static) != (p.water == static)
               → the settings row shows "일부는 「새로고침」 뒤에 바뀌어요"
ApplyLive():   View.maxK = p.maxK; OnResize(); ApplyFps(); Game.ApplyGfx()  // ground low, bake rate, water quality, doll caps
Trim(level):   (Android onTrimMemory) ground.Trim(viewRect); Residency.MakeRoom; if (level == 15) StepDown("trim")
               Unity: Application.lowMemory → treat as level 15
```

In Unity, MSAA and the mipmap limit can change at runtime. You may apply them live and drop the "reload" message,
or keep it for parity. Either way is acceptable; decide once.

Settings persisted (JS key `frostVillage.settings.v1`; Unity: your own settings file):
`zoom` (null | 0.2 < z < 5, 2 decimals), `gfx`, `gfxAuto`, `gfxDev` (< 80 chars), `gfxWhy` (< 12 chars), `perfInfo`
and `observeAfter` (LATER).

### 6.4 성능 정보 overlay (LATER, tester aid)

A thin box at the top centre (below the safe-area top, on top of everything, no input). Font 9 px/12 px monospace,
600 weight, text `#e8f4ff`, background `rgba(10,20,40,0.6)`, padding 0 5 px, bottom corners 4 px. Refreshed every
500 ms. Line: `"{fps}fps · {preset}{ (자동)} · k{k} · tex {MiB}MiB · JS {heap}MiB"`. In Unity, show render scale
and `Profiler.GetTotalAllocatedMemoryLong` instead of the JS heap.

DROP: the `drawImage` and `createPattern` wrappers for shrunken pages (Perf.js 384–474) and `bakeGraphics`
(Perf.js 476–504). Unity sprites and meshes do not have these costs.

---

## 7. Depth and draw order: the coordinate contract for the sorting spec

This spec owns only the coordinates. The sort scheme belongs to the render spec. Facts it needs:

* `depth = anchor y` (world px) for everything standing on the ground. Dynamic objects update it every frame
  (`DepthSort.update`: `depth = y + offset`). Small offsets such as `+0.0005` and `+0.001` are used for overlays on
  the same anchor.
* Fixed bands (`src/systems/DepthSort.js` 4–29): WATER −20000, FISH −19900, WAVES −19800, GROUND −15000,
  FLOOR −14000, GROUND_DECAL −13500, OUTLINE −13000, PAD −12000, PAD_ITEM −11900, PAD_TEXT −11800, SHADOW −11000,
  DUST −10900, world objects 0..3450 (y), PAD_LABEL 28000 + y/10, PAD_PRICE 28900, fog 29000 (= FLY − 1000),
  FLY 30000, FX 31000, BUBBLE 40000, LABEL 41000, ARROW 45000, TOP 50000.
* World y ranges from about −200 (sea) to 3450. Negative x exists (the west strip) and is not used for depth.
* Recommendation for the render spec: Sorting Layers for the bands, plus Transparency Sort Mode = **Custom Axis
  (0, 1, 0)**. Within the "World" layer, Unity then sorts by Transform y with float precision, which is exactly
  `depth = y`, because a sprite pivot is its anchor. That keeps sub-pixel offsets without spending the int16
  `sortingOrder` range. If integer orders are preferred, `order = JsRound(y·8)` fits in int16 (3450·8 = 27600) but
  loses offsets below 1/8 px.

---

## 8. Scope for the slice

| Feature | Tag | Notes |
|---|---|---|
| World px ↔ Unity conversion, iso helpers, dirFromVec, Z/shoreY/plots | SLICE | unit tests against the JS values (§10) |
| Logical frame 720 × H, letterbox, safe area, debounced resize | SLICE | |
| Render scale from preset, MSAA, targetFrameRate | SLICE | |
| Auto preset pick + persistence + settings cycle | SLICE | the settings UI may be a debug menu |
| Auto step-down (5.4 A/B) | SLICE (simple) | re-tune thresholds |
| Camera follow, tutorial framing, camFocus, clamp to camRect, region bounds update | SLICE | |
| Zoom: pinch, wheel, +/− buttons, easing, persistence | SLICE | range 0.6–1.7 |
| Overview (map button) | SLICE-optional | cheap once 3.5 exists |
| Shake | SLICE-optional | cosmetic |
| Joystick + keys + multi-touch rules + tap detection | SLICE | |
| Goal-window tap-to-walk (GoalWalk) with a straight-line fallback route | SLICE | needs GoalBook rows (goals spec) and Roads (nav spec) for full routes |
| 관망 pilot, free pan, fling, cuts, camGlide | LATER | slice: no auto-start |
| Resident follow camera | LATER | |
| Rank ceremony / neighbours / office camera hops | LATER | they only call FocusCamera |
| Residency near/far, texScale, tex budgets, doll caps, glows, fx scale | LATER | |
| Perf overlay | LATER | |
| Culler, drawImage/pattern wrappers, bakeGraphics, Phaser test hooks (`window.__FV`) | DROP | replace hooks with a C# debug API (`SetInput`, `Camera(x, y, zoom)`, `Zoom(...)`, `Goals.GoTo`) |
| Admin ×2/×4 time | LATER | |

---

## 9. Porting risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Y-axis flip.** Phaser y is down and Unity y is up. Direction sectors, `atan2`, Custom Axis sorting and velocities can silently flip. | Keep all logic in px with y down (D1). Convert only in `WorldSpace`. Unit-test `dirFromVec` for 8 vectors. |
| R2 | **Rounding.** `world.js` rounds with JS `Math.round` (.5 → up); C# `Math.Round` uses banker's rounding. The rounded 45.25/22.63 constants also differ from the exact 45.2548/22.6274. | `JsRound = Floor(v + 0.5)`. Use 45.25/22.63 literally. Better: export the resolved `WORLD` positions from the JS once (a Node script) into JSON and load that, instead of re-evaluating the helpers in C#. |
| R3 | **Camera clamp quirk:** when the view is wider or taller than the bounds, Phaser sticks to the left/top edge, while CameraDirector.clamp centres. | Port both exactly as written (3.4, 3.9). |
| R4 | **Zoom range confusion** (0.45 vs 0.6). The overview goes down to 0.40 or below. | Player range 0.6–1.7; fitZoom unclamped. Check sprite mip/filter quality at 0.24–0.4. |
| R5 | **Pinch anchor.** Unity samples usually zoom toward the finger midpoint. | Zoom about the screen centre (D7). |
| R6 | **Frame timing.** Phaser smooths delta over 10 frames and caps raw deltas at 200 ms; lerps use the (unclamped) smoothed delta. Unity's `Time.deltaTime` is raw, so the camera feels jittery and different. | Use the 10-sample smoothing for `deltaMs` and keep dt = min(0.05, …) for gameplay. |
| R7 | **fps measurement.** Phaser's `actualFps` counts display refresh ticks when a cap is set, so a capped 30 fps game reads about 60. Unity's default Android `targetFrameRate` is 30. | Set targetFrameRate explicitly. Measure real frames. Re-tune the 38/28/30 thresholds. |
| R8 | **URP 2D + Render Scale.** Check early that the 2D Renderer honours `renderScale` on the target Unity 6.3 URP version, and that the HUD canvas (Screen Space Overlay) stays at native resolution. | Fallback: `Screen.SetResolution(w·s, h·s, true)` on Android, which also scales the HUD. |
| R9 | **MSAA semantics.** WebGL `antialias: true` is usually 4× on the default framebuffer. In URP, MSAA plus renderScale allocates an intermediate target. | High/mid 4×, low off. Measure the fill cost on a Mali-G52-class phone. |
| R10 | **texScale 0.75** (mid) has no Unity equivalent; the mipmap limit halves. | Mid uses the full size (or 0.5 when RAM < 3.3 GB), or ship a second set of Addressables variants. Decide with the asset-pipeline spec. |
| R11 | **Touch routing details:** "over UI" must be tested per finger; the pinch "ending" state; handing the joystick to a second finger; the mouse id 0 excluded from multi-touch; the tap threshold in logical px. | Write an `InputRouter` state machine with unit tests for: tap, drag, second-finger pinch, lift A then B, lift B then A, a panel opening mid-drag. |
| R12 | **Wheel delta.** The browser gives dy > 0 for wheel down; Unity's Input System ≥ 1.8 reports a uniform ±1 per notch by default (`scrollDeltaBehavior`; older versions gave ±120 on Windows). | One zoom step per frame with non-zero scroll, sign-checked (sign only). |
| R13 | **Letterbox / aspect clamp** (1280..1600). On 21:9 phones Phaser shows bars. A full-bleed Unity build would show more village than Phaser. | Replicate the bars for the go/no-go comparison. Revisit after the slice. |
| R14 | **"Tap-to-walk" meaning** (see Q1). Phaser has goal-row tap-to-walk only; a ground tap goes to residents. | Implement `WalkTo(px)` and wire the goal window. Get confirmation before adding a ground-tap walk. |
| R15 | **GoalWalk dependencies:** Roads.route, Collision.OffLand / inLand doors, GoalBook rows, Navigator pin, pilot.blocksPay. | Slice: a straight-line route plus the stuck side-step; stub the Navigator. |
| R16 | **Settings migration:** Phaser stores zoom and gfx in WebView localStorage (`frostVillage.settings.v1`). The Unity app cannot read it. | They start at defaults (zoom 1.2, gfx auto). This is harmless; mention it to the designer. |
| R17 | **Device facts differ:** Unity's `systemMemorySize` and `graphicsDeviceName` (for example "Mali-G52" without "MC2") may not match the strings and values the thresholds were tuned on. | Read `totalMem` via JNI. Log the facts on test phones. If the core count is missing, treat any "Mali-G5x/G6x" as weak. |
| R18 | **OOM detection:** Phaser's Android shell reports `lastExit == "oom"`. Unity has no direct equivalent. | Android 11+: `ActivityManager.getHistoricalProcessExitReasons` (REASON_LOW_MEMORY), or a "session running" flag in PlayerPrefs that a clean pause clears. |
| R19 | **Clock consistency:** Phaser mixes the loop time (`update(time)`) and the scene clock (`time.now`) for camFocus.until and the input clocks. | Use one ms clock (`Time.unscaledTimeAsDouble·1000`) for all. |
| R20 | **One-frame lags** are part of the feel: tutorial framing reads the *last drawn* worldView; the goal walk's vector is consumed on the next tick. | Keep the same order (§5.2). Do not "fix" them in the slice. |

---

## 10. Acceptance checks (numbers to assert in EditMode tests / on device)

| Check | Expected |
|---|---|
| `isoPt(0, 0, 1, 0)` / `isoPt(0, 0, 0, 1)` | (45.25, 22.63) / (45.25, −22.63) |
| `isoInv(90.5, 0)` | (1, 1) |
| `gdist((0,0),(30,20))` | 50 |
| `dirFromVec` for (1,0) (1,1) (0,1) (−1,1) (−1,0) (−1,−1) (0,−1) (1,−1) | 0 E, 1 SE (atan2(2,1) = 63.4° → round(1.41) = 1), 2 S, 3 SW, 4 W, 5 NW (round(−2.59) = −3 → 5), 6 N, 7 NE (checked in JS) |
| `Z("plaza", −4.5, 4.8)` (grill) | (JsRound(990 + 45.25·0.3), JsRound(800 + 22.63·(−9.3))) = (1004, 590) |
| `shoreY(1000)` / `shoreY(2330)` | 356.611 / 548.669 (checked against the JS formula) |
| logical H for 1080×2400 / 1080×1920 / 1080×2520 | 1600 / 1280 / 1600 (+ bars) |
| k on 1080 px wide, high/mid/low | 1.5 / 1.5 / 1 → render scale 1 / 1 / 0.667 |
| new-game camRect | (−1400, −150, 3460, 3030) |
| new-game camera centre and zoom | (985, 600) at 1.2 (no saved zoom); visible 600 × H/1.2 px |
| overview at new game | zoom 0.40, centre (900, 1270), bounds off |
| pinch 2× apart from zoom 1.2 | target clamps to 1.7 |
| + button from 1.2 | 1.5; then 1.7 (1.875 clamped) |
| joystick: finger 40 px right of the base | vec = (0.684, 0), mag 0.684 |
| joystick: finger 120 px right | base moves 42 px right; vec = (1, 0) |
| chief speed at full stick, level 0 | 255 px/s horizontal, 188.7 px/s vertical |
| tap: 250 ms, finger moved 6 logical px | resident tap fires (`life.Tap`); the chief does not move (inside the 8 px dead zone) |
| tap: 250 ms, finger moved 12 logical px | the tap still fires (< 16 px), and the chief takes a small step meanwhile (mag 12/58.5 = 0.205): same as Phaser |
| goal walk arrives | stops within gdist 8 of the target; toast g_arrived |

---

## 11. Source index (Phaser files and line ranges)

| File | Lines | What |
|---|---|---|
| `src/main.js` | 14–41 | logical size, k, safe area |
| `src/main.js` | 52–86 | Phaser config (fps, antialias, pointers 3, FIT), resize debounce |
| `src/main.js` | 87–132 | weak-GPU render-scale drop, high-refresh cap |
| `src/core/View.js` | 1–25 | View fields, `applyUI`, `toLogical` |
| `src/core/Iso.js` | 1–68 | iso axes, directions, isoPt/isoInv/isoRect/inIsoRect, gdist |
| `src/core/Input.js` | 1–140 | joystick, keys, 관망 pan, update priorities |
| `src/core/Perf.js` | 21–113 | preset table, weak GPU list, auto pick |
| `src/core/Perf.js` | 115–298 | start/resolve/lower/stepDown/set/applyLive/applyFps/applyGame/trim |
| `src/core/Perf.js` | 300–382 | fps watch, toast, overlay, setLimit |
| `src/core/Perf.js` | 384–504 | texScale wrappers, bakeGraphics (DROP) |
| `src/core/Save.js` | 16, 1046–1093 | Settings key, fields and validation |
| `src/scenes/UI.js` | 78–83, 105–109 | zoom buttons, joystick sprites |
| `src/scenes/UI.js` | 148–226 | pointer routing, pinch, tap, wheel, resize |
| `src/scenes/UI.js` | 228–246, 282–328 | HUD layout of the zoom buttons, zoomChanged |
| `src/scenes/UI.js` | 577–582, 1363–1369 | worldToScreen, joystick drawing |
| `src/scenes/Game.js` | 356–400 | camera create, follow start, keyboard, visibility |
| `src/scenes/Game.js` | 1716–1738 | focusCamera, viewRect |
| `src/scenes/Game.js` | 1984–2018 | isOnScreen, isNearView, unseen, sfxAt |
| `src/scenes/Game.js` | 2160–2303 | update/tick order, camera target, snow, ambience |
| `src/scenes/Game.js` | 2305–2364 | fitZoom, overviewRect, resetBounds, setZoom, zoomBy, toggleOverview, updateZoom |
| `src/scenes/Game.js` | 2893–2906 | camera/zoom test hooks (DROP; mirror in the C# debug API) |
| `src/systems/Territory.js` | 13–21, 66–78, 113–148 | constants, areaOf/areaRect, bounds, apply |
| `src/systems/pilot/CameraDirector.js` | 1–239 | 관망 free pan, fling, cuts (LATER) |
| `src/systems/pilot/ChiefPilot.js` | 1–20, 370–385 | 관망 auto start (LATER) |
| `src/systems/residents/Follow.js` | 120–150 | resident follow camera (LATER) |
| `src/systems/goals/GoalWalk.js` | 1–319 | tap-to-walk |
| `src/scenes/GoalPanel.js` | 127–145, 315–326 | objective-panel tap, goal-row tap |
| `src/entities/Player.js` | 66–125 | stick → velocity |
| `src/entities/Character.js` | 57–62 | face() |
| `src/entities/Site.js` | 23–27 | plot footprints and drop pads |
| `src/data/world.js` | 1–32, 80–131, 624–636, 649+, 938–955 | Z helpers, shore, spawn, tutorial views, territory, plots, L4 |
| `src/data/balance.js` | 38–75, 704–705 | camera, player, upgrades, pilot |
| `src/data/balanceCheck.js` | 154–159 | camera value ranges |
| `src/systems/DepthSort.js` | 1–44 | depth bands |
| `src/systems/Effects.js` | 183 | shake |
| `lib/phaser.min.js` 3.90 | Camera `preRender`, `clampX/Y`, `startFollow`, `getWorldPoint`; TimeStep `smoothDelta`, `updateFPS`, `stepLimitFPS`; Shake `update` | engine maths reproduced in §3.4, §3.8 and §5.1 |

---

## 12. Open questions for the lead

* **Q1 — Tap-to-walk.** In the Phaser game, "tap-to-walk" means tapping a goal in the 목표 창 (or the objective
  panel, then a row), after which the chief walks there. A tap on the ground talks to residents and pets. Should the
  slice add a new "tap the ground to walk there" feature, or keep the goal-window behaviour only?
* **Q2 — Zoom range.** Confirm that 0.6–1.7 is right; 0.45 appears only in a Water.js comment. Should the overview
  (map button) be in the slice?
* **Q3 — Letterbox.** For the go/no-go comparison, should the Unity build copy Phaser's bars on 21:9 phones and tablets?
* **Q4 — Frame cap on 90/120 Hz phones.** Phaser runs 90 fps on 90 Hz and about 60 on 120 Hz. Is a flat 60 acceptable
  for the slice?
* **Q5 — Should the "reload needed" graphics settings become live in Unity** (MSAA, texture size), or keep the Phaser message?
