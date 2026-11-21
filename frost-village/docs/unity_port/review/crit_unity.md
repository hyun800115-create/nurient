# crit_unity — Unity 6.3 LTS feasibility review of 00_architecture.md (+ specs 01–07)

Scope: will every API, package, version, asmdef setting, import setting and batchmode command in the architecture
actually work in Unity 6.3 LTS (6000.3.x, URP 17.3, 2D Renderer, C# 9, Windows editor, Android IL2CPP ARM64)?
References are `file:line` into this folder (`00` = 00_architecture.md etc.) or into `frost-village/src` (read-only).
"Verify" = I am confident about the mechanism but not about the exact 6.3 value; the fix says how to check it on the PC.

Verdict: the architecture is sound and mostly Unity-correct. P1 rank sorting holds up (int16 range, float32 maths in
§4.1 are right, no camera-distance ties). Runtime `Sprite.Create(…, FullRect, …)` is the right call (05:202). The
importer avoids the obsolete `TextureImporter.spritesheet`/`SpriteMetaData` path and uses the current `ASTC_4x4/6x6`
enum names. 1 BLOCKER, 7 MAJOR and 24 MINOR items follow, in that order.

Counts: **BLOCKER 1 · MAJOR 7 · MINOR 24**

---

## BLOCKER

### 1. BLOCKER — `Packages/manifest.json` "exactly this" removes engine modules the slice compiles against, and hard-codes editor-locked versions
* **Problem.** §1.3 says to make the dependency list *exactly* the 11 entries shown. That removes every
  `com.unity.modules.*` the template wrote except androidjni/audio/imageconversion/jsonserialize/ui. Built-in modules
  that are not listed and not pulled in by a dependency are not referenced, so their types do not exist at compile time.
  * `com.unity.modules.particlesystem`: the plan draws snowfall, dust and bursts with `ParticleSystem` /
    `ParticleSystemRenderer` (00:492, 00:503, 02:674 "a ParticleSystem in world space"). Without the module →
    `CS0246 ParticleSystem could not be found` in Snowbloom.Game.
  * `com.unity.modules.screencapture`: needed if the self-test, `NewGameShotTest` or `ci.ps1 -Task shot` helpers use
    `ScreenCapture.*`.
  * Others (`uielements`, `imgui`, `physics`, `animation`, `tilemap`, `unitywebrequest` …) may come back as transitive
    dependencies, or may not. The result then depends on what URP/uGUI/Test Framework happen to declare in 6.3.
  * The JSON also pins `com.unity.test-framework` **1.4.5**. That is the Unity 6.0 value. The table under it says
    "editor-locked, keep exactly what the 6000.3 template writes, never hand-edit" (00:125), so the doc contradicts
    itself. 6000.3 locks a newer Test Framework (verify in the template's manifest). Writing 1.4.5 either gets silently
    rewritten or fails package resolution. "Exactly this" also deletes the IDE packages that the next row says to keep
    (00:127).
  * Pinning `com.unity.inputsystem` 1.14.0 works, but 6000.3 recommends a newer 1.x (the template already includes
    Input System).
* **Evidence.** 00:100–127, 00:492, 00:503, 02:674, 00:704 (self-test reads pixels back).
* **Fix.** Replace "make the dependency list exactly this" with a **delete list**. Remove only `com.unity.2d.animation`,
  `2d.psdimporter`, `2d.aseprite`, `2d.spriteshape`, `2d.tilemap(.extras)`, `visualscripting`, `timeline`,
  `collab-proxy` and `multiplayer.center`. **Keep every `com.unity.modules.*` the template wrote**: engine code
  stripping removes unused modules from the player anyway, so trimming the manifest saves nothing. Add
  `com.unity.nuget.newtonsoft-json` and `com.unity.2d.sprite` if the template lacks them. Write the core package
  versions as "<as written by 6000.3>" placeholders, not numbers, and keep the template's Input System version unless
  it is below 1.11. Commit `packages-lock.json` (already planned). Use `RenderTexture` + `ReadPixels` for every
  readback (no `ScreenCapture`), or keep the screencapture module.

---

## MAJOR

### 2. MAJOR — The "JS number writer" relies on `double.ToString("R")`, which differs between .NET 8 (dotnet tests), Unity's BCL (editor + IL2CPP) and JavaScript
* **Problem.**
  * 07 §2.3 specifies "integral and abs < 1e21 → integer digits; else `ToString("R", Invariant)` with `E+`→`e+`". In
    .NET Core 3.0+ (the net8.0 test runner), "R" is shortest round-trip. Unity's class libraries (Mono-derived, also
    compiled by IL2CPP) implement "R" the .NET Framework way: try 15 digits, else 17. Example: `0.1+0.7` gives JS
    `0.7999999999999999`, .NET 8 `0.7999999999999999`, Unity likely `0.79999999999999993`. The 07 T-tests ("6 full
    outputs … text equality", 00:833) would pass under `dotnet test` and fail under Unity EditMode. Saves written on
    the phone would differ from Phaser's text, and the length caps that 07:143 says depend on this would drift too.
  * The format rules are wrong even on .NET 8. "R"/"G" switches to scientific below 1e-5 and pads the exponent to two
    digits. JS writes decimals down to 1e-7 and never pads: JS `0.00001` vs .NET `1E-05`; JS `1e-7` vs .NET `1E-07` →
    `1e-07` after the proposed replace.
  * The integer branch must not go through `(long)` above 2^53 (JS writes shortest digits padded with zeros:
    `123456789012345680`). Note that `F0` on Unity's BCL prints only 15 significant digits.
  * Parsing differs too. Unity's BCL `double.Parse` follows .NET Framework rules: an out-of-range literal (`1e400`)
    makes Newtonsoft throw `JsonReaderException`, while .NET 8 and JS return ±Infinity. So a hostile or odd save
    sanitizes differently in Unity than in the dotnet tests.
  * Strings differ as well. Newtonsoft's Default escaping always escapes U+0085, U+2028 and U+2029, which
    `JSON.stringify` writes raw. ES2019 `JSON.stringify` escapes lone surrogates as `\udxxx`, which Newtonsoft writes
    raw.
* **Evidence.** 07:143, 07:145, 00:654 ("JS number writer"), 00:833 (text equality is a D test only).
* **Fix.**
  * Port JS `Number::toString` (ECMA-262 Number::toString: shortest digits, then the k/n placement rules) into Core as
    `JsNumber.Format(double)`. Get the digits from a self-contained shortest-digits routine (a C# Ryu/Grisu port,
    ≈ 300 lines, pure integer maths, so identical on every runtime). Never use `ToString("R"/"G17"/"F0")`.
  * Write strings with your own JS-exact escaper (escape only `"`, `\` and U+0000–U+001F with JS's short forms and
    lower-case `\u00xx`; escape lone surrogates as `\udxxx`; leave U+2028/2029/0085 raw). Use Newtonsoft only for
    parsing.
  * Add golden vectors `0.7999999999999999`, `1e-7`, `0.00001`, `1.5e-6`, `2**53+2`, `1e21`, `-0`, `1e400` (parse)
    and a U+2028 string.
  * Make the WP-9 acceptance include the **Unity EditMode** run of the 07 T-suite (E), not only D, plus one
    IL2CPP-device round trip of `v4202_25min` in the self-test.

### 3. MAJOR — TMP SDF padding 8 @ 64 cannot draw the Phaser strokes of the slice's small labels; the "covers up to 7 px each side at 40–72 px" claim is wrong
* **Problem.**
  * An SDF atlas can draw an outline only as far out as its padding, scaled to the display size:
    `maxOut_px = padding × size / sampling`. With 8/64 that is 12.5 % of the font size: 5 px at 40 px text, so 7 px
    each side needs 56 px text, not 40.
  * Phaser `strokeThickness T` puts T/2 outside the glyph, plus ≈ 1 px of anti-aliasing. Slice styles in the source:
    zone names 34 px / 8 (`src/scenes/Game.js:558`, 00:555), float text 30 / 7 (`src/systems/Effects.js:147`), pad
    labels 30 / 6 and 24 / 5 (`src/entities/UnlockPad.js:43, :151`), staff labels 18 / 5
    (`src/entities/staff/Staff.js:482`).
  * Required padding at sampling 64 is 9.4, 9.6, 8.5, 9.3 and **12.4** respectively, so every one is clipped at 8.
  * TMP's outline is also centred on the edge: a canvas-like stroke (face intact) needs Face Dilate as well, which
    uses up the same padding budget.
* **Evidence.** 00:28, 00:577 (padding 8, "covers … 40–72 px"), 05:366–368 (strokes 5–14 px, sizes 16–76 px), 02:1299.
* **Fix.**
  * Sampling 64, **padding 13** (≈ 20 %), render mode SDFAA, Multi Atlas on.
  * `strings.js` has only **600 distinct Hangul** (+ ≈ 110 ASCII/symbols): at a ≈ 90-px cell, a **2048 × 4096** atlas
    (8 MB Alpha8, within the 4096 GPU limit that the low preset already assumes) holds them on one page. No sub-mesh
    split, one material per style.
  * Feed `prewarm_chars.txt` in frequency order so overflow glyphs land on page 2.
  * Emulate canvas strokes with Outline Width + Face Dilate in **material presets** (one per stroke style: 34/8, 30/7,
    30/6, 24/5, 18/5). Never use per-instance `outlineWidth`, which instantiates a material per label and breaks
    batching.
  * Add a self-test line: render 「소나무 숲」 34 px / stroke 8 and check that the outline is not clipped (pixel at
    edge + 4 px is stroke colour).

### 4. MAJOR — Gamma colour space is legacy in Unity 6 (deprecation path); the slice should not bet the whole port's colour pipeline on it without a plan
* **Problem.**
  * A5 makes Gamma the default "for parity" and K5 has a fallback. But Unity 6's render pipelines treat Gamma as
    legacy: several URP features assume Linear, and Unity has announced Gamma's deprecation in the 6.x line (verify
    whether 6000.3 shows a deprecation warning in Player Settings → Other → Color Space).
  * The slice is the go/no-go for the whole port. If Gamma is removed in a later 6.x/7, every alpha constant (vignette
    0.10, rim 0.30, x-ray 0.32, ghost tint, shadow gradient) needs a second visual pass after the port has grown.
  * Note: the self-test pixel check proves only that Gamma *works today*, not that it is supported going forward.
* **Evidence.** 00:23, 00:538–541, 00:697–701 (ProjectSetup sets Gamma), 00:1026 (K5), 05:730 (R9 "check URP 2D 6.3
  support/deprecation").
* **Fix.**
  * In WP-0, read the 6.3 Player Settings / release notes. If Gamma is flagged deprecated, decide now: **Linear + a
    one-time visual retune** of the constants (list already in 00:539–541) is the long-lived choice.
  * Keep Gamma for the slice only if it is not deprecated, and record the decision in CLAUDE.md.
  * Either way, run the self-test in both spaces once and save both screenshots for the designer (J1/J3), so the
    difference is judged, not guessed.

### 5. MAJOR — `Assets/_Snowbloom/Generated/` textures have no import rule: the road mask would be NPOT-rescaled, compressed and mip-mapped
* **Problem.**
  * `FvTexturePostprocessor` only touches `ROOT = Assets/_Snowbloom/Content/` (00:610, 05:550–556).
    `Generated/Ground/roads_start.png` (1600×1310 RGBA mask, "uncompressed", 00:551) and the per-zone/region masks
    would get Unity's **Default** import: NPOT scale "To Nearest" (→ 2048×1024), mipmaps on, compressed (ASTC/DXT5),
    sRGB on.
  * Result: rescaled, blocky road edges and alpha drift, so J1 fails visually.
  * The mask is data. In Linear (item 4) the sRGB flag would also bend every mask value.
  * The 1-D erf LUT for the floor halo (00:553) has the same problem if it is saved as a PNG.
* **Evidence.** 00:65, 00:551, 00:553–554, 00:610.
* **Fix.** Add a second rule in the postprocessor for `Assets/_Snowbloom/Generated/Ground/`: `textureType = Default`,
  `sRGBTexture = false`, `npotScale = None`, `mipmapEnabled = false`, `textureCompression = Uncompressed` (Android and
  Standalone overrides `RGBA32`, or `R8` per mask if they are split), Clamp, Bilinear, `isReadable = false`,
  `maxTextureSize = 2048`. Add an EditMode test asserting that the imported size equals the PNG size and the format is
  RGBA32 (same pattern as 05 R1).

### 6. MAJOR — TMP Essential Resources (a `Resources/` folder outside `_Snowbloom`) are mandatory, and the doc's folder rule forbids them
* **Problem.**
  * Rule (00:97–98): "nothing of ours outside `Assets/_Snowbloom/`; no `Resources/` folder". TextMeshPro in uGUI 2.0
    still loads its settings with `Resources.Load("TMP Settings")` from `Assets/TextMesh Pro/Resources/`. The
    Essentials also bring the SDF shaders and default material presets that font assets reference.
  * Missing Essentials (likely when Claude follows the rule in batchmode, where the import dialog never appears) →
    `TMP_Settings.instance == null` (NREs / default settings) and pink or invisible text in builds when the SDF shader
    is not included.
  * The Korean line-breaking switch lives in the same settings asset: `TMP_Settings.useModernHangulLineBreakingRules`
    wraps Korean at spaces like Phaser/canvas word wrap; the default breaks between any two syllables.
  * The Universal 2D template also owns files outside `_Snowbloom`: `Assets/Settings/` (URP Global Settings, default
    Volume Profile, which URP recreates if deleted) and possibly `Assets/InputSystem_Actions.inputactions`.
* **Evidence.** 00:97–98, 00:68, 00:572–581.
* **Fix.**
  * In WP-0, import TMP Essentials once (menu Window → TextMeshPro → Import TMP Essential Resources, or
    `TMPro.TMP_PackageResourceImporter.ImportResources(true, false, false)` from `ProjectSetup`) and commit
    `Assets/TextMesh Pro/`.
  * Set `useModernHangulLineBreakingRules = true` and the default font asset = Pretendard in `TMP Settings.asset`.
  * Rewrite the rule as "nothing **of ours** outside `_Snowbloom`; allowed third-party/template folders: `TextMesh Pro/`
    (incl. its `Resources/`), `Settings/` (URP global settings)".
  * Delete `InputSystem_Actions.inputactions` unless used.
  * Add self-test (5) "TMP Settings present, SDF shader found (`Shader.Find("TextMeshPro/Distance Field") != null`)".

### 7. MAJOR — P1 exact ranking interleaves ≈ 66 separate textures in one strict order: Unity's single-texture sprite batching may cost hundreds of draw calls on the low phone
* **Problem.**
  * Phaser's WebGL renderer batches across several bound textures (multi-texture batch). Unity's SpriteRenderer
    batching needs the same texture + material on consecutive sort orders.
  * With exact y-ranking, trees (`props_nature`), decor (`props_decor`), buildings (`props_buildings`), 7 character
    atlases, `fv_shadow`, items, pads and TMP labels alternate constantly at the plaza. Every texture switch is a new
    batch.
  * Realistic counts are 150–400 batches in a crowded view. On a Mali-G52 GLES3 render thread that can be 5–10 ms,
    which is the J12 / K17 risk, but K17 lists only "P1 sort and static views" as mitigation.
  * Overdraw adds to it: sea quad + 2 fish bands + shallow strip + land mesh + road quad + zone floors are all
    alpha-blended, full-screen layers (Queue Transparent, `Blend SrcAlpha OneMinusSrcAlpha`, 00:529–530). Mali's
    hidden-surface removal does not help blended draws.
* **Evidence.** 00:21, 00:450–507, 00:524–530, 00:1038 (K17), 05:17 (66 textures, no atlas packing; A16 excludes
  Sprite Atlas).
* **Fix.**
  * Make "batches in the start view and in the `v4202` overview" a **WP-4 gate**. Read them from the Frame Debugger
    plus `ProfilerRecorder.StartNew(ProfilerCategory.Render, "Batches Count")` in development builds, and log them in
    the perf overlay.
  * Budget ≤ 120 at the start view.
  * If over budget: an offline repack of the *world* Tier A atlases into 2–3 4096² pages grouped by what interleaves
    (props + nature + decor + items + generated `fv_shadow`/`fv_white` on one page; characters on another). `FrameRec`
    already carries page x/y, so `Sprite.Create`/pivots are unchanged. This is not a Unity Sprite Atlas, so A16 still
    holds.
  * Draw the sea and land fill with `Blend Off` (still Queue Transparent, still ranked) so the GPU can drop hidden
    fragments.

### 8. MAJOR — Floating-point → integer casts and transcendental maths are not the same on dotnet x64, the Unity editor (Mono x64) and IL2CPP ARM64
* **Problem.**
  * C# `(int)`/`(long)` of NaN or an out-of-range double is unspecified. .NET 8 x64 returns `0x80000000…`, Unity's
    Mono JIT (x64) the same, and IL2CPP on ARM64 (clang `fcvtzs`) **saturates** (NaN → 0, 1e10 → int.MaxValue).
  * The Phaser code is full of JS ToInt32 semantics (`| 0`, `>>> 0`, `(floor(onb) | 14) & 1023` in 07:857, flags,
    hashes). A direct C# cast gives one answer in the golden tests and another on the phone.
  * `Math.Sin/Cos/Atan2/Exp/Pow` differ in the last ulp between V8 (fdlibm, where the goldens come from), glibc
    (GitHub Actions), the Windows CRT and bionic (IL2CPP). IL2CPP's clang may also contract `a*b+c` into FMA on ARM64.
    "Exact" goldens involving these will flake across runners.
* **Evidence.** 00:303 (Numbers rule covers rounding only), 00:796 ("Roads goldens (exact points)"), 07:857, 07:1001,
  02:548–553 (JsRng is integer-exact: fine).
* **Fix.**
  * Add `JsMath.ToInt32(double)` / `ToUint32` (JS modulo-2^32 semantics) and `JsMath.ClampToLong` to Core, and add a
    Core rule plus a Roslyn-free grep check in `ci.ps1 -Task dotnet` that forbids `(int)`/`(long)` casts on `double`
    outside JsMath.
  * Goldens: exact equality only for results of + − × ÷ sqrt floor (IEEE-exact) and integer code. Use
    `Within(1e-9)`-relative tolerances (or the existing ±0.01 px) for anything through trig/exp/pow, and test
    decision boundaries (`dirFromVec`) with inputs away from the exact .5 boundary.
  * State in 00 §2.3 that bit-exactness is promised for dotnet and the editor, not for the device.

---

## MINOR

### 9. MINOR — Culture: nothing forces `InvariantCulture` on Android/Windows players
* **Problem.** Only 07:143 mentions `Invariant` once. `Fmt(12345)` → `"12,345"` (00:722), any `ToString()`/`Parse`
  of numbers in Core, `ToLower()` on checksum hex (07:778 `lower(m4)`) and logging follow the **device locale** on
  Mono/IL2CPP. A tester phone set to German/French/Turkish gets `1,5`, `12.345` or a dotless-i. Korean phones are
  safe, so the designer would not see it, but anyone else could corrupt saves.
* **Evidence.** 00:722, 07:143, 07:778.
* **Fix.** At the top of `BootLoader.Awake` (and in the dotnet test `[SetUpFixture]`) set
  `CultureInfo.DefaultThreadCurrentCulture = CultureInfo.CurrentCulture = CultureInfo.InvariantCulture`. Also add a
  Core rule: always pass `CultureInfo.InvariantCulture` / use `ToLowerInvariant`, `StringComparison.Ordinal` and
  `StringComparer.Ordinal` (JS sorts by UTF-16 code unit; 07:721 requires ordinal key sort). Run one EditMode test
  under `tr-TR` and `de-DE`.

### 10. MINOR — TMP sub-meshes do not follow direct `MeshRenderer.sortingOrder` writes
* **Problem.** `RendererTarget` includes "TMP's MeshRenderer" (00:492). Standalone world texts exist outside any
  SortingGroup: zone names at PAD_TEXT (00:555) and float texts. When a text uses glyphs from a second atlas page (or
  a fallback font), TMP renders them on child `TMP_SubMesh` renderers. Those get the parent's order only at creation
  or through the `TextMeshPro.sortingOrder` property setter, which propagates to sub-meshes. Writing
  `GetComponent<MeshRenderer>().sortingOrder` leaves page-2 glyphs at a stale rank, so parts of a label draw behind
  trees.
* **Evidence.** 00:492, 00:555, 00:577 (Multi Atlas on).
* **Fix.** Add a `TmpTarget : IRankTarget` that writes `tmp.sortingOrder = order` (and `sortingLayerID`), or put
  every world text inside a one-child SortingGroup. Item 3's one-page atlas makes this rare but not impossible
  (fallback glyphs).

### 11. MINOR — `TextMeshPro` (3D) font size is not "world px / 64"
* **Problem.** For the non-UI `TextMeshPro` component TMP scales the font by 0.1 unless `isOrthographic` is set
  (`fontScale = fontSize / pointSize · scale · (isOrthographic ? 1 : 0.1)`). "Sizes in world px / 64" (00:581, 04:1353)
  gives text 10× too small (or 10× too large if someone compensates in the transform).
* **Evidence.** 00:581, 04:1353.
* **Fix.** In `LabelView`/`FloatTextView` set `tmp.isOrthographic = true` and `fontSize = px / 64f` (world units),
  `rectTransform.sizeDelta` in units. Or keep it off and use `fontSize = px × 10 / 64`, but pick one and assert it in
  the P test (34-px zone name ≈ 34 px tall on a 720-logical-px render at zoom 1).

### 12. MINOR — Touch events are processed "all downs, then moves, then ups", not in time order
* **Problem.** Phaser receives DOM pointer events in real order. The router processes every Began before any Ended in
  a frame (00:399, 00:633, 01:574–575). At 30 fps (low preset, 33 ms frames), finger A lifting while finger B lands
  within one frame makes B's down see A still down. The result is a spurious **pinch** (zoom jump) and B never becomes
  the joystick until lifted (01:604). Android can also reuse a pointer id in the same frame (up then down with the same
  `touchId`), which downs-first then breaks.
* **Evidence.** 00:399, 00:633, 01:574–575, 01:583–588.
* **Fix.** Build one event list per frame from `Touch.activeTouches` (plus the mouse) with a timestamp (`touch.time`
  for moves/ends, `touch.startTime` for Began), stable-sort by time, then by phase (Ended/Canceled before Began for
  the same `touchId`), and feed `PointerRouter` in that order. Add router tests: "A up + B down in one frame → B is
  joystick, no pinch" and "same id up+down".

### 13. MINOR — Input System details that differ from the text
* **Problem.**
  * (a) Unity's **Device Simulator does not do multi-touch**. "Pinch via Unity's Device Simulator" (00:640) is
    impossible; only the phone (or a debug key) can pinch.
  * (b) 01:580 still prescribes `EventSystem.IsPointerOverGameObject(p.id)`. With `InputSystemUIInputModule`, touch
    pointer ids do not match `touchId`, and calling it outside UI event processing logs a warning and returns
    last-frame data. 00 §6 rightly uses its own `RaycastAll`; 01 should be marked superseded.
  * (c) Any `StandaloneInputModule` (default EventSystem from the GameObject menu / template sample scene) or
    `UnityEngine.Input.*` call throws `InvalidOperationException` when Active Input Handling = "Input System Package
    (New)".
  * (d) 01 R12 ("±120 per notch on Windows") is outdated for Input System ≥ 1.8 (`scrollDeltaBehavior` defaults to
    uniform ±1). Harmless because only the sign is used.
* **Evidence.** 00:633–643, 01:580, 01:1026.
* **Fix.** (a) Add a debug pinch (Ctrl + wheel, or two-key "virtual second finger") for editor tests and say "pinch
  only on the phone". (b) Note in 00 §6 that it overrides 01 §4.3's `IsPointerOverGameObject`. (c) ProjectSetup or an
  EditMode test asserts that no scene/prefab contains `StandaloneInputModule`. (d) Keep sign-only handling; drop the
  ±120 claim.

### 14. MINOR — `ProjectSetup` / `BuildCli`: obsolete overloads, missing calls, and applying settings inside the build call
* **Problem.**
  * In Unity 6 the `BuildTargetGroup` overloads (`PlayerSettings.SetScriptingBackend`, `SetApiCompatibilityLevel`,
    `SetManagedStrippingLevel`, `SetApplicationIdentifier`, …) are `[Obsolete]` in favour of `NamedBuildTarget`.
  * `GraphicsSettings.renderPipelineAsset` is obsolete in favour of `defaultRenderPipeline`. Every quality level also
    needs `QualitySettings.renderPipeline` (or set it to null so the default applies).
  * `EditorSettings.externalVersionControl` is obsolete in favour of `VersionControlSettings.mode`.
  * `SetGraphicsAPIs(Android, …)` is ignored unless `PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android,
    false)` comes first.
  * `BuildCli.AndroidDev` calls `ProjectSetup.Apply()` inside the same batch call (00:979). If that call actually
    changes colour space, API level or Active Input Handling, Unity must reimport or recompile, or even restart the
    editor (for `activeInputHandler`, 00:642–643), which does not happen mid-method. The first build after a settings
    change is then built against stale editor state.
* **Evidence.** 00:697–701, 00:642–643, 00:977–990.
* **Fix.** Write ProjectSetup with `NamedBuildTarget.Android/Standalone`, `GraphicsSettings.defaultRenderPipeline`,
  per-level `QualitySettings.renderPipeline`, `VersionControlSettings.mode = "Visible Meta Files"` and
  `SetUseDefaultGraphicsAPIs(false)`. Run `ProjectSetup.ApplyCli` as **its own** batch invocation (`ci.ps1 -Task
  setup`, then exit). `AndroidDev` only **asserts** the settings (exit 1 with a message if any differs). Also write
  `EditorBuildSettings.scenes` = Boot, Village in ProjectSetup: `SceneManager.LoadScene("Boot")` (00:431) fails in
  editor Play Mode and in PlayMode tests if the scenes are not in the build list. Passing `scenes` to `BuildPlayer` is
  not enough.

### 15. MINOR — Android build settings to verify in 6.3
* **Problem.**
  * (a) "min API 24" (00:37, 00:698): set it from the 6.3 minimum. Unity 6.x has raised its floor over time (6.0 =
    23). If 6.3's floor is higher, the enum value is rejected or the build fails.
  * (b) "target auto" in batchmode: if the Android SDK platform for the highest target API is missing, the build stops
    for an SDK-update licence prompt.
  * (c) Graphics APIs `[OpenGLES3, Vulkan]` (00:37) makes Vulkan dead code: Unity uses the first API the device
    supports, and every target device supports GLES3.
  * (d) Unity 6 defaults to **GameActivity**. Fine for Input System and `UnityPlayer.currentActivity` JNI, but JNI
    helpers should not hard-code `UnityPlayerActivity`.
* **Evidence.** 00:37, 00:683, 00:697–701, 00:946–948.
* **Fix.** (a) ProjectSetup reads the lowest value the 6.3 dropdown offers. Use `max(24, that)`. (b) Add
  `-accept-apiupdate` to the `android` task's Unity arguments, or pin `targetSdkVersion` to the API the Hub module
  installed. (c) Either `[OpenGLES3]` only (say why: stability on old Mali) or `[Vulkan, OpenGLES3]` and measure both
  on the designer's phone in WP-11. (d) Get the activity with `new AndroidJavaClass("com.unity3d.player.UnityPlayer")
  .GetStatic<AndroidJavaObject>("currentActivity")` only.

### 16. MINOR — `.NET 8` is out of support (since 2026-11-10); the dotnet runner should target .NET 10 LTS
* **Problem.** WP-0 installs `Microsoft.DotNet.SDK.8` and the test project targets `net8.0` (00:336, 00:358, 00:684).
  .NET 8 LTS reached end of support on 10 Nov 2026; .NET 10 (LTS, Nov 2025) is current. Also, the .NET 10 SDK's
  `dotnet new sln` writes **`.slnx`** by default, but the doc and `ci.ps1` name `Snowbloom.Standalone.sln`.
* **Evidence.** 00:336, 00:357–358, 00:684, 00:959.
* **Fix.** `winget install Microsoft.DotNet.SDK.10`. Test csproj `<TargetFramework>net10.0</TargetFramework>` (Core
  stays `netstandard2.1`, which is what matters for Unity parity). `setup-dotnet` with `10.0.x`. Either create the
  solution with `dotnet new sln --format sln` or switch every reference to `.slnx`. Bump `actions/checkout`/
  `setup-dotnet` to their current major.

### 17. MINOR — The two-runner test setup: assembly names, internals, and API surface
* **Problem.**
  * (a) The Unity test assembly is `Snowbloom.Core.Tests`; the dotnet test project has no `<AssemblyName>`, so it is
    `Snowbloom.Core.Tests.Standalone`. Any `[assembly: InternalsVisibleTo("Snowbloom.Core.Tests")]` in Core (needed
    for `SortKey.Index` etc., 00:476) then breaks only the dotnet build.
  * (b) If Core's `IsExternalInit` polyfill is visible to the net8/10 test project through `InternalsVisibleTo`, the
    BCL's copy and Core's collide when test code declares records.
  * (c) The test project compiles against the full net8/10 API, so test code can use `PriorityQueue`,
    `File.Move(a, b, true)`, `Convert.ToHexString`, `Random.Shared` and similar, which pass in dotnet and fail in Unity
    EditMode.
* **Evidence.** 00:330–348, 00:301, 00:350–352.
* **Fix.** (a) Set `<AssemblyName>Snowbloom.Core.Tests</AssemblyName>` in the test csproj. (b) Forbid records and
  `init` in test code (Core only). (c) Add a third, compile-only project `DotnetTests/ApiCheck/…csproj`
  (`netstandard2.1`, NUnit 3.14 reference, same `Compile Include` as the tests) to the solution, so `dotnet build`
  fails on APIs Unity lacks.

### 18. MINOR — Boot loading: a ScriptableObject catalog with direct references loads every texture and clip *with the Boot scene*; statics need resetting
* **Problem.**
  * `FvAssetCatalog` references all 66 textures and ≈ 20 clips directly (00:599, 00:619). Whatever scene references
    the catalog loads all of them synchronously before its first frame, so the Boot "progress bar" (00:425) never
    animates and the phone shows a black or splash hitch.
  * `FvAssets` is static and the game reloads by `LoadScene("Boot")` (00:431). `Init` must be idempotent, and the
    `Sprite.Create` caches hold sprites of textures that survive the reload.
  * With **Enter Play Mode Options** (domain reload off: a project setting, check the 6.3 template's value) statics
    survive between editor play sessions while the textures/sprites behind them are destroyed → `MissingReference`
    on the second Play.
* **Evidence.** 00:425–431, 00:599–603, 00:619–621, 05:478–480.
* **Fix.** Keep Boot reference-free. Load `Village.unity` with `LoadSceneAsync` and drive the bar from
  `AsyncOperation.progress` (the catalog lives in Village), or reference the catalog from a tiny additively loaded
  scene. Give every static holder a `Reset()` called from
  `[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]` and guard `Init()` against a
  second call. Add a PlayMode test that boots twice in one session.

### 19. MINOR — Changing `renderScale` / MSAA on the URP asset at runtime edits the asset on disk in the editor
* **Problem.** "URP asset `renderScale = …`", "MSAA applied live" (00:518–519, 01:229). In the editor, writing
  properties of the project's `URP-Slice.asset` during Play Mode persists after Play (assets are not reset like scene
  objects), so git shows churn and the next session starts with the last preset's values.
* **Evidence.** 00:518–519, 01:229, 01:947.
* **Fix.** At boot, `var rp = Instantiate(projectAsset); GraphicsSettings.defaultRenderPipeline = rp;
  QualitySettings.renderPipeline = rp;` and mutate only the clone. Or keep three committed presets
  (`URP-High/Mid/Low.asset`) and switch the assigned asset (MSAA/render-scale changes then need no asset writes).

### 20. MINOR — The always-on Backdrop camera doubles per-frame camera work on every phone, though bars appear only beyond 9:20 / tablets
* **Problem.** A second base camera (00:517) runs a full URP camera loop (cull + clear, plus an intermediate target
  when render scale/MSAA are on) every frame. On normal 9:16–9:20 phones the World viewport already covers the whole
  screen, so its full-screen clear is pure waste on the low phone.
* **Evidence.** 00:428, 00:515–517, 01:224–225.
* **Fix.** Enable the Backdrop camera only when `ViewMetrics.OffX > 0 || OffY > 0` (recompute on resize). Something
  must still clear outside a non-full viewport, because the URP backbuffer is undefined there, so keep it for the
  barred case.

### 21. MINOR — Texture postprocessor details
* **Problem.**
  * (a) `TextureImporter.GetSourceTextureWidthAndHeight` in `OnPreprocessTexture` (05:558): on a file's *first* import
    it may report sizes from cached importer data, and a 0 there would clamp `maxTextureSize` to 32 and shrink the
    texture.
  * (b) The `SOFT` regex `…|ui2/ground_road)/` (05:552) requires a `/` after `ground_road`, so `ui2/ground_road.png`
    gets ASTC 4×4, not the intended 6×6.
  * (c) `compressionQuality = 100` = ASTC "Best". First import of the 66 textures (and every platform switch) is
    minutes long, which matters for the CI worktree (00:1008–1011).
  * (d) Audio (00:611, 05:357): in Unity 6 `AudioImporter.preloadAudioData` is obsolete. Preload is a field of
    `AudioImporterSampleSettings` set per platform.
* **Evidence.** 05:552, 05:558–559, 05:578, 00:610–611.
* **Fix.** (a) Read width/height from the PNG IHDR bytes (16–23) of `assetPath`. `CatalogBuilder` already reads PNG
  headers (00:613), so share that helper. (b) `…|ui2/ground_road\.png)` or test the file name separately.
  (c) Quality 50 (Normal) for development and 100 only in the go/no-go build, or accept it. Turn on Project Settings →
  Editor → **Parallel Import**. (d) Set `loadType`, `compressionFormat = Vorbis`, `quality = 0.7f`,
  `sampleRateSetting = PreserveSampleRate`, `preloadAudioData` on `AudioImporterSampleSettings` via
  `defaultSampleSettings` / `SetOverrideSampleSettings("Android", …)`. Keep `loadInBackground` on the importer.

### 22. MINOR — Additive sprites need a custom shader; custom shaders must not be found by name at runtime
* **Problem.**
  * `Materials.SpriteUnlitAdditive` (00:527, 03:798 R11): URP's `Sprite-Unlit-Default` has a fixed blend (no blend-mode
    property). `Particles/Unlit` can blend additively but reads `_BaseMap`, not the `_MainTex` that SpriteRenderer
    binds. §4.3 lists only three shaders.
  * `Shader.Find("Snowbloom/…")` in a player only works for shaders that a built material references or that are
    listed in Always Included Shaders.
  * Mobile precision: world-anchored UVs reach ≈ 12 (×512 texels) and the sea term `6·t` grows without bound. As
    `half` (mediump on Mali) that is several texels of swimming.
* **Evidence.** 00:524–537, 03:798.
* **Fix.** Add `SB_SpriteAdditive.shader`: a copy of the unlit sprite pass with `Blend SrcAlpha One` that reads
  `_MainTex` and `_RendererColor`/vertex colour, plus a material asset. Reference every material from the catalog or a
  `Materials` ScriptableObject; no runtime `Shader.Find`. In the SB_* shaders declare UVs and time terms as `float`
  (highp), and wrap the time offsets on the CPU (`frac(u0)`, `frac(v0)`) before setting them.

### 23. MINOR — `ParticleSystemRenderer` default order ≠ Phaser emission order
* **Problem.** Spec: "particles draw in emission order, as in Phaser" (00:503). Unity's default `sortMode = None`
  draws in particle-buffer order, which changes as dead particles are swapped out. Phaser draws the alive list oldest
  first, newest on top.
* **Evidence.** 00:503, 02:674.
* **Fix.** `renderer.sortMode = ParticleSystemSortMode.YoungestInFront` on every emitter, plus `renderMode =
  Billboard` and `alignment = View` for a 2D ortho camera, simulation space World for snowfall.

### 24. MINOR — Haptics: `Handheld.Vibrate()` has no duration
* **Problem.** The loop vibrates 8 / 15 / 40 ms (04:423, 06:353, 06:672, 06:803). Unity's only built-in call,
  `Handheld.Vibrate()`, buzzes ≈ 0.4–0.5 s on Android. The designer would feel a different game.
* **Evidence.** 04:423, 06:353, 06:672, 06:803.
* **Fix.** A `Haptics` class in Game. On Android use JNI `Vibrator`/`VibratorManager` with
  `VibrationEffect.createOneShot(ms, DEFAULT_AMPLITUDE)` (API ≥ 26, else `vibrate(long)`). Declare
  `android.permission.VIBRATE` (Unity adds it automatically only when `Handheld.Vibrate` is referenced: reference it
  once in a never-called method, or add a manifest snippet). The editor does nothing. Respect a settings toggle.

### 25. MINOR — Clipboard paste on Android is not in the WP-0 self-test
* **Problem.** The only way to bring an old village in is 「붙여넣기」 → `GUIUtility.systemCopyBuffer` (00:658,
  07:864). On Android this goes through the platform clipboard via JNI. Android 10+ allows reads only while the app
  has input focus, and 12+ shows a "pasted" toast. Behaviour has varied across Unity versions/activities, and a
  100 K-char code is large for a binder transaction (≈ 200 KB is OK).
* **Evidence.** 00:658, 00:702–706, 07:1043 (R6).
* **Fix.** Self-test (7): a button that reads `systemCopyBuffer` and shows its length and first 20 chars, after the
  tester copies `save_code_v4202_25min.txt` from a chat app. Fallback: JNI `ClipboardManager.getPrimaryClip()
  .getItemAt(0).coerceToText(activity)` on the UI thread.

### 26. MINOR — Autosave does an `fsync` on the main thread every 5 s
* **Problem.** `SetItem`: write `.tmp`, `Flush(true)` (fsync), `File.Replace`, all on the main thread every 5 s of game
  time (00:652, 00:657, 07:128–132). On cheap eMMC phones (the Mali-G52 class used for J12), fsync latency can spike
  to tens of ms, a visible hitch every 5 s. The JObject → string serialization of a 10–120 KB save also allocates
  every 5 s.
* **Evidence.** 00:652, 00:657, 07:128–132.
* **Fix.** Measure `SetItem` time in the WP-11 perf overlay. If p95 > 4 ms: serialize on the main thread, then write +
  fsync + replace on a background `Task`, coalescing to one in flight. Keep the synchronous path only for
  `OnApplicationPause(true)`/`Quit`. Keep incremental GC on (Unity 6 default).

### 27. MINOR — The render-scale self-test has no measurable output as described
* **Problem.** "`renderScale` 0.5 → camera target half size" (00:703). No public API reports URP's internal camera
  target size. `Camera.pixelWidth` does not change with render scale. In 6.3 a renderer feature must use the
  RenderGraph API (`RecordRenderGraph`); Compatibility Mode is gone or hidden, so an `Execute`-style pass will not run.
* **Evidence.** 00:703, 00:1027 (K6), 01:1022 (R8).
* **Fix.** Render a 1-px black/white checker quad that fills the World viewport, read a 4×1 block back after the
  frame (RenderTexture + `ReadPixels`). At scale 1 it alternates; at 0.5 it is grey/blurred. Assert the difference.
  That is the observable effect, not the buffer size.

### 28. MINOR — Sorting layer "World" must be created by editing `TagManager.asset`; the Default layer would do
* **Problem.** Every target is on sorting layer "World" (00:21, 00:493). There is no public API to add sorting layers
  from code (only `SerializedObject` surgery on `ProjectSettings/TagManager.asset` `m_SortingLayers` with unique ids).
  With P1 a single layer is all that is used.
* **Evidence.** 00:21, 00:493, 03:691.
* **Fix.** Use the built-in **Default** layer (id 0). Or create "World" once in the editor in WP-0, commit
  `TagManager.asset`, and have ProjectSetup only assert it exists.

### 29. MINOR — Map/Dictionary iteration order is not JS insertion order after removals
* **Problem.** JS objects/Maps iterate in insertion order (integer-like keys first for objects). .NET
  `Dictionary`/`HashSet` reuse freed slots, so after a `Remove` a new key appears in the removed key's position. Where
  the Phaser code iterates a map to decide behaviour (residents' think order, job picks, pad sync, serialize order of
  `life.moved`, `progress.done`), the C# port behaves differently while still passing small goldens. JObject keeps the
  right order for the raw tree; this is about Core's typed models.
* **Evidence.** 00:305 (pools/no LINQ rules, but no ordering rule), 07:147, 07:1001.
* **Fix.** Add a Core rule: a JS object/Map ported as a keyed collection that is ever *iterated* uses an
  insertion-ordered map (`OrderedMap<K,V>` = Dictionary + linked list, removal-stable). Add one test that removes and
  re-adds a key and compares iteration with Node's.

### 30. MINOR — `RankList` must reject NaN depths
* **Problem.** `SetDepth` compares with `!=` and `Settle` sorts with `Array.Sort` (00:483–488). A NaN depth (Phaser
  would happily store it from a bad save or a 0/0) makes the comparer inconsistent. .NET may then throw
  `InvalidOperationException: IComparer.Compare() returned inconsistent results` or leave the list unsorted, and the
  whole scene's draw order breaks.
* **Evidence.** 00:476–489.
* **Fix.** In `SetDepth`/`Add`, replace NaN with a fixed value. Phaser's `a._depth − b._depth` comparator turns NaN
  into "equal", so its order is effectively arbitrary; any deterministic choice such as `0` or `double.MaxValue` is
  acceptable. Call `ILog.WarnOnce` and add a RankList test with NaN.

### 31. MINOR — `ci.ps1` finds Unity only under the default Hub path
* **Problem.** `Find-Unity` searches only `C:\Program Files\Unity\Hub\Editor` (00:905), and the YAMLMerge path is
  hard-coded the same way (00:201). Hub installs often go to another drive (Hub → Preferences → Installs location,
  stored in `%APPDATA%\UnityHub\secondaryInstallPath.json`), D: here.
* **Evidence.** 00:201, 00:904–913.
* **Fix.** Order: `$env:UNITY_EXE` → the path in `secondaryInstallPath.json` → the default. Print the chosen editor
  version and refuse anything not `6000.3.*`. Use the same resolution for `UnityYAMLMerge.exe` and `adb.exe`.

### 32. MINOR — Reference screenshots and golden files inside `Assets/` get imported
* **Problem.** `Tests/Reference/` (Phaser PNG screenshots, 00:83) and `Tests/Golden/fixtures/*.json` live under
  `Assets/`. Unity imports every PNG as a texture (Default importer, compressed, with mipmaps), which adds import time
  on every platform switch and puts LFS PNGs in the asset database. No build includes them unless referenced, so this
  costs time, not correctness.
* **Evidence.** 00:81–83.
* **Fix.** Move `Reference/` to `SnowbloomUnity/Docs/Reference/` (outside `Assets`). Keep `Golden/` JSON under
  `Assets` only if an EditMode test loads them as `TextAsset`. Otherwise move them next to `DotnetTests` and let
  `Golden.Path` look there too (both runners read files from disk anyway, 00:352–355).

---

## Checked and fine (no action)

* **Sorting maths (00 §4.1).** int16 orders (`rank − 32768`, ranks ≤ 65,535), float32 ulps (2.4e-4 @ 3450, 9.5e-7 @ 10,
  7.6e-6 units @ 96 units) and "no floating origin" are correct. Unity sorts layer → order → render queue → distance,
  so with unique ranks queue and distance never matter, provided all materials stay in Transparent (they do).
* **Sprites.** `Sprite.Create(tex, rect, pivot, 64, 0, SpriteMeshType.FullRect, border, false)` (05:202): pivots
  outside 0..1 are accepted. FullRect is required for Sliced draw mode and avoids Tight-mesh CPU work on non-readable
  ASTC textures.
* **Flips.** The flipX shift `srcW·(1 − 2·ax)·scaleX` (03:126, 05:226) is right: Unity mirrors about the pivot,
  Phaser about the frame centre.
* **Text and input packages.** uGUI 2.0.0 contains TMP. Assembly names `Unity.TextMeshPro`, `UnityEngine.UI`,
  `Unity.InputSystem`, `Unity.RenderPipelines.Core.Runtime`/`Universal.Runtime` are right.
  `TMP_FontAsset.TryAddCharacters(string)` exists.
* **asmdefs.** `noEngineReferences` + `overrideReferences` + `precompiledReferences: ["Newtonsoft.Json.dll"]` is
  valid (the package ships a standard and an AOT DLL of the same name). Test asmdefs with `UNITY_INCLUDE_TESTS` +
  `nunit.framework.dll` follow the current template. The C# 9 notes (`IsExternalInit` polyfill, no covariant returns /
  module initializers) are right.
* **Batchmode commands.** `-runTests` without `-quit`, `-testPlatform EditMode|PlayMode`, `-testResults`,
  `-buildTarget Android|Win64`, `-executeMethod` + `EditorApplication.Exit`, `-nographics` for EditMode, graphics on
  for PlayMode render tests, `Start-Process -Wait -PassThru` exit code, and the UnityLockfile check all behave as
  written.
* **Android settings.** `EditorUserBuildSettings.buildAppBundle = false` + debug keystore; IL2CPP + ARM64; Minimal
  stripping + `link.xml`; splash off (allowed for Personal in Unity 6); `PlayerSettings.Android.optimizedFramePacing`,
  `renderOutsideSafeArea`, `Screen.currentResolution.refreshRateRatio` (01:821) are current APIs.
  `targetFrameRate` set explicitly is required (Android default 30).
* **Save I/O.** `DeflateStream` (raw, no zlib header) is the right class for comp "z" (no `ZLibStream`, which is .NET
  6+). `FileStream.Flush(true)` and `File.Replace(tmp, dst, null)` exist in .NET Standard 2.1. The self-test covers
  IL2CPP behaviour. `File.Move(a, b)` (no overwrite flag) is correct for netstandard2.1.
* **TMP / Hangul sizing.** Dynamic + Multi Atlas is the right answer to "11,172 syllables do not fit one static atlas"
  (≈ 2,000 glyphs per 4096² page at 64 pt). Keep atlases ≤ 4096 for old GPUs. Slice strings need far fewer glyphs
  (item 3).
